/* lore.js — runtime for the unit dossier / life-event system (career system v3).
   Reads the static, generated LORE_DATA (js/lore_data.js). At level 2 a player career
   unit gets a procedurally-built backstory (name, hometown, family, trauma, dream, maybe
   a crime); at each further level-up a NEW life-event — woven from that unit's own
   backstory — is rolled and logged, a few carrying light temporary effects.

   Per-unit storage:  u.lore = { seed:<int>, events:[{lvl, i}] }  (compact + save-safe:
   no numeric `id` keys, so the entity serializer in save.js leaves it alone). The resolved
   backstory text is memoized in a module-level Map keyed by seed (never serialized).

   Depends on globals: LORE_DATA (lore_data.js), makeRng (state.js), DEF (config.js),
   careerTitle (career.js), eventToast (ui.js), G (state.js). */

const LIFE_FX = { aspectBias: 0.70, crimeChance: 0.45, buffDur: 25 };

/* ---- seeded helpers (reuse the game's makeRng for determinism) ---- */
function _loHash(n){ let h=((n|0)*2654435761) ^ 0x9e3779b9; h=Math.imul(h^(h>>>15),2246822519); return (h>>>0); }
function _loPick(rng, arr){ return arr[(rng()*arr.length)|0]; }
// version-gated pick: like _loPick but caps the draw to the first `n` entries (a unit only ever
// sees the background pool as it stood at the content-version it was minted at). Consumes exactly
// one rng() step regardless of n, so adding entries never disturbs an existing seed's draw stream.
function _loPickN(rng, arr, n){ return arr[(rng()*(n>0?n:arr.length))|0]; }
function _loCap(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }

// ---- dossier content-versioning (see _dev/gen/lore_additions.mjs + gen_lore.mjs) ----
// LORE_DATA.versions[v-1] = the background-pool LENGTHS a unit minted at content-version v should
// draw from. Growing a pool appends a new version row; already-minted veterans keep their row, so
// their name/backstory never shifts. Missing table (pre-versioning data) or missing v (legacy save)
// resolves to full current lengths — i.e. exactly the old, un-versioned behavior.
function _latestVersion(){ const V = (typeof LORE_DATA!=='undefined') && LORE_DATA.versions; return (V && V.length) ? V.length : 1; }
function _poolLens(v){
  const V = (typeof LORE_DATA!=='undefined') && LORE_DATA.versions;
  if(!V || !V.length) return null;                                   // no table → full-length picks
  return V[Math.min(Math.max((v|0)||1, 1), V.length) - 1];
}
// Pick one prose variation per lore area from a (deterministic) rng. Stored raw on the dossier;
// slots are resolved at render time by dossierHTML's fillP. See LORE_DATA.paras.
function _attachParas(d, rng){
  const P = LORE_DATA.paras; if(!P) return;
  d.paras = { origin:_loPick(rng,P.origin), family:_loPick(rng,P.family),
    trauma:_loPick(rng,P.trauma), dream:_loPick(rng,P.dream),
    crime:_loPick(rng,P.crime), assessment:_loPick(rng,P.assessment) };
}

// ---- name gender: a unit's first name must match the gender of its unit-type VOICE ----
// recruiter/foodtruck/auditor/courier are female-voiced; every other type is male-voiced
// (see js/voice.js SPEAKER_VOICE / _dev/gen/voice_map.mjs). Backstory text is pronoun-free for
// the unit (it uses the first name), so matching the NAME is all that's needed to keep a unit's
// name + voice + story consistent. Heroes keep their hand-authored names (makeHeroDossier).
const _UNIT_GENDER = { worker:'m', soldier:'m', ranger:'m', recruiter:'f', hustler:'m',
  lobbyist:'m', foodtruck:'f', auditor:'f', founder:'m', courier:'f', bomber:'m' };
const _NAME_POOL = {
  m: (LORE_DATA.namesM||[]).concat(LORE_DATA.namesX||[]),   // male voice → male + unisex names
  f: (LORE_DATA.namesF||[]).concat(LORE_DATA.namesX||[]),   // female voice → female + unisex names
};
function _namePool(type){ const p=_NAME_POOL[_UNIT_GENDER[type]]; return (p&&p.length)?p:LORE_DATA.firstNames; }
// version-gated name pool: slice each gendered pool to its version length, then concat in the same
// order as _NAME_POOL (gendered first, unisex last) so a unit only draws names that existed at its
// version. L null (no versions table) → the full-length pool, identical to _namePool.
function _namePoolV(type, L){
  if(!L) return _namePool(type);
  const g = _UNIT_GENDER[type] || 'm';
  const X = (LORE_DATA.namesX||[]).slice(0, L.namesX);
  const base = (g==='f' ? (LORE_DATA.namesF||[]) : (LORE_DATA.namesM||[])).slice(0, g==='f' ? L.namesF : L.namesM);
  const pool = base.concat(X);
  return pool.length ? pool : (LORE_DATA.firstNames||[]).slice(0, L.firstNames || (LORE_DATA.firstNames||[]).length);
}

/* ---- backstory assignment ---- */
const _dossierCache = new Map();   // seed -> built backstory (module-global; not serialized)

function ensureDossier(u){
  // Mint a backstory seed ONCE, then freeze it on the unit (saved with the entity). The seed mixes
  // in G.runSalt — a per-map random value (set in map.js newMap) — so a fresh recruit gets a DIFFERENT
  // dossier every game / map / replay, instead of a fixed table keyed only by spawn-order id. Carried
  // veterans already carry u.lore (frozen seed), so this no-ops for them and their identity persists.
  // salt 0 (pre-salt saves, or G absent) reduces to _loHash(id+1) — identical to the legacy behavior.
  if(!u.lore){
    const salt = (typeof G!=='undefined' && G && G.runSalt) ? (G.runSalt|0) : 0;
    // Stamp the content-version at MINT time so this unit's background pools are frozen forever, even
    // if later content drops grow the pools. Existing u.lore (carried vets / loaded saves) is left
    // untouched — a missing v is read as v1 — so no already-minted veteran's identity ever shifts.
    u.lore = { seed: _loHash(((u.id||0)+1) ^ salt), events: [], v: _latestVersion() };
  }
}

// HERO dossier: a hand-authored, FIXED backstory (named campaign characters like Nino) instead of
// the seed-random one. spec fields are plain strings (already resolved); slots are still honored so
// a hero's text can reference {me}/{home}/etc. if desired. Same shape as buildDossier's return.
function makeHeroDossier(spec){
  const first = spec.first || spec.name || 'Unknown';
  const last  = spec.last || '';
  const full  = (first + (last ? ' ' + last : '')).trim();
  const home  = spec.home || 'parts unknown';
  const rel   = spec.rel || '';
  const relName = spec.relName || '';
  const baseFill = (t)=> (t||'').replace(/\{me\}/g, first).replace(/\{full\}/g, full)
    .replace(/\{home\}/g, home).replace(/\{rel\}/g, rel).replace(/\{relName\}/g, relName);
  const trauma = baseFill(spec.trauma || '');
  const dream  = baseFill(spec.dream || '');
  const crime  = spec.crime ? baseFill(spec.crime) : null;
  const familyText = baseFill(spec.family || '');
  const d = { first, last, full, home, rel, relName, trauma, dream, crime, familyText, hero:true };
  d.fill = (t)=> baseFill(t).replace(/\{dream\}/g, dream).replace(/\{trauma\}/g, trauma)
    .replace(/\{crime\}/g, crime||'an old mistake').replace(/\{family\}/g, familyText);
  _attachParas(d, makeRng(_loHash(full)));   // name-seeded → stable prose for hand-authored heroes
  return d;
}

// pure + memoized by seed → {first,last,full,home,rel,relName,trauma,dream,crime|null,familyText,fill}
function buildDossier(u){
  if(u.lore && u.lore.fixed) return makeHeroDossier(u.lore.fixed);   // named hero — skip the RNG
  const seed = u.lore.seed;
  const v = (u.lore.v|0) || 1;                       // missing v (legacy save) → v1
  const L = _poolLens(v);                            // version pool lengths (null = full-length, pre-versions)
  const ck = seed+'|'+(_UNIT_GENDER[u.type]||'')+'|v'+v;   // gender + version shape the pools → cache key
  if(_dossierCache.has(ck)) return _dossierCache.get(ck);
  // % 233280 reduces the 32-bit hash into makeRng's LCG range BEFORE the first step. Without it,
  // makeRng's internal seed*9301*9301 overflows 2^53 and rounds away its low bits, biasing the early
  // draws toward repeats among the small/consecutive ids real games use (see rollLifeEvent's note).
  const r = makeRng(seed % 233280);
  const first  = _loPickN(r, _namePoolV(u.type, L));         // gender- + version-matched
  const last   = _loPickN(r, LORE_DATA.surnames,  L && L.surnames);
  const home   = _loPickN(r, LORE_DATA.hometowns, L && L.hometowns);
  const fam    = _loPickN(r, LORE_DATA.family,    L && L.family);
  const relName= _loPickN(r, LORE_DATA.firstNames,L && L.firstNames);
  const full   = first+' '+last;
  // baseFill resolves the "person" slots that the backstory fragments THEMSELVES contain,
  // so the dream/trauma/crime/family strings are slot-free before any event embeds them.
  const baseFill = (t)=> t.replace(/\{me\}/g, first).replace(/\{full\}/g, full)
    .replace(/\{home\}/g, home).replace(/\{rel\}/g, fam.rel).replace(/\{relName\}/g, relName);
  const trauma = baseFill(_loPickN(r, LORE_DATA.traumas, L && L.traumas));
  const dream  = baseFill(_loPickN(r, LORE_DATA.dreams,  L && L.dreams));
  const crime  = (r() < LIFE_FX.crimeChance) ? baseFill(_loPickN(r, LORE_DATA.crimes, L && L.crimes)) : null;
  const familyText = baseFill(fam.text);
  const d = { first, last, full, home, rel:fam.rel, relName, trauma, dream, crime, familyText };
  // event/prose filler: person slots (baseFill) + the already-resolved backstory slots
  d.fill = (t)=> baseFill(t).replace(/\{dream\}/g, dream).replace(/\{trauma\}/g, trauma)
    .replace(/\{crime\}/g, crime||'an old mistake').replace(/\{family\}/g, familyText);
  _attachParas(d, r);   // appended last → existing trauma/dream/crime draws are unchanged
  _dossierCache.set(ck, d);
  return d;
}

/* ---- life-event rolls ---- */
// roll a new connected event for `level`, record it, return {text, fx, tone} (or null)
function rollLifeEvent(u, level){
  const d = buildDossier(u);
  // % 233280 keeps the seed inside makeRng's LCG range. u.lore.seed is a 32-bit hash (~1e9);
  // without this, makeRng's internal seed*9301*9301 overflows 2^53, rounds away its low bits and
  // COLLAPSES onto a coarse lattice — making the event-index draw badly non-uniform (some events
  // ~17× more likely than others). Reduced first, the draw is uniform (within the aspect/crime bias).
  const r = makeRng((u.lore.seed + level*101 + 7) % 233280);
  const used = new Set(u.lore.events.map(e=>e.i));
  const ok = (e)=> (e.req!=='crime' || !!d.crime) && (!e.min || level>=e.min);
  const aspect = r() < LIFE_FX.aspectBias;   // bias toward the unit's personal-aspect events
  const all = LORE_DATA.events;
  let pool = [];
  for(let i=0;i<all.length;i++){ const e=all[i];
    if(used.has(i) || !ok(e)) continue;
    if(aspect ? e.req!=='any' : e.req==='any') pool.push(i);
  }
  if(!pool.length) for(let i=0;i<all.length;i++){ if(!used.has(i)&&ok(all[i])) pool.push(i); }     // any unused
  if(!pool.length) for(let i=0;i<all.length;i++){ if(ok(all[i])) pool.push(i); }                    // allow repeat
  if(!pool.length) return null;
  const i = pool[(r()*pool.length)|0];
  u.lore.events.push({ lvl:level, i });
  const t = all[i];
  // companion "say" for the in-world dialog box: a short first-person reaction. LORE_SAY
  // (dialog_data.js) is index-aligned with this APPEND-ONLY events array; fall back to a
  // tone+aspect bucket so a level-up is never mute. Filled through the same dossier slots.
  const indexed = (typeof LORE_SAY!=='undefined' && LORE_SAY[i]) ? LORE_SAY[i] : null;
  const _sayRaw = indexed || (typeof loreSayFallback==='function' ? loreSayFallback(t.req, t.tone) : null);
  const say = _sayRaw ? _loCap(d.fill(_sayRaw)) : null;
  // sayIdx: index of a variable-free indexed line → it has a pre-rendered voice clip (voice.js).
  // Templated/fallback lines have no matching clip, so they stay text-only (sayIdx null).
  const sayIdx = (indexed && indexed.indexOf('{')<0) ? i : null;
  return { text:_loCap(d.fill(t.text)), fx:t.fx, tone:t.tone, say, sayIdx };
}

/* ---- light effects (only a minority of events carry fx) ---- */
function applyEventFx(u, fx, state){
  if(!fx) return;
  if(fx.t==='heal'){ u.hp = u.maxHp; return; }
  if(fx.t==='fine'){ if(state && u.owner==='player'){ const eco=playerEco(state, u.ctrl); eco.gold = Math.max(0,(eco.gold||0)-(fx.gold||0)); } return; }
  if(fx.t==='buff' || fx.t==='capstone'){
    u.buff = { dmgMul:fx.dmg||1, regenMul:fx.regen||1, until:(state?state.time:0)+(fx.dur||LIFE_FX.buffDur) };
    if(fx.t==='capstone' && !u.dreamDone){
      u.dreamDone = true;
      // T1-9: dream fulfillment is the per-unit emotional climax — make it LAND. Held toast +
      // gold-accent bubble + a crawl token so the next episode's opening can reference it.
      if(!window._rbReplaying){
        try{
          const d=buildDossier(u);
          const line='I outlasted it. The thing I built is still standing.';
          if(typeof eventToast==='function') eventToast(`🏆 <b>${d.full}</b> just fulfilled their dream — ${_loCap(d.dream)}`, 14000, line);
          if(typeof pushDialog==='function') pushDialog(u, line, {type:'lore', tone:'pos'});
          window._lastDreamFulfilled = d.full;   // read by crawlVars() as {dreamFulfilled}
          if(typeof ACH!=='undefined') ACH.fire('dream');   // T3-5
          if(typeof LNS!=='undefined' && LNS.ultraEvent) LNS.ultraEvent('dreamFulfilled', { unit:u });
        }catch(e){}
      }
    }
  }
}
// active temp-buff multipliers (identity once expired) — read by the combat & regen hooks
function vetBuff(u, state){
  const b = u.buff;
  if(b && state && state.time < b.until) return { dmgMul:b.dmgMul||1, regenMul:b.regenMul||1 };
  return { dmgMul:1, regenMul:1 };
}

/* ---- memorial (module-global; survives newMap like carryoverVets) ---- */
let fallenVets = [];
let _fallenIds = new Set();   // rollback-safe: memorialize each fallen unit at most once, even if a re-sim re-kills it
// wipe the memorial for a brand-new campaign (called from startGame, alongside the carry resets)
function resetFallen(){ fallenVets.length = 0; _fallenIds.clear(); }
// restore the memorial from a save blob (the list is now persisted; entries are plain JSON). Clears
// the dedup id-set — the restored fallen are already gone from G.entities, so they can't be re-killed
// and re-memorialized; deaths AFTER load repopulate it normally.
function restoreFallen(arr){ fallenVets.length=0; _fallenIds.clear(); if(Array.isArray(arr)) for(const f of arr){ if(f) fallenVets.push(f); } }
function recordFallen(u){
  if(!u.lore) return;
  if(u.id!=null){ if(_fallenIds.has(u.id)) return; _fallenIds.add(u.id); }   // dedup across rollback re-simulations (the dead unit leaves G.entities, so the guard can't live on it)
  const d = buildDossier(u);
  fallenVets.push({ name:d.full, type:u.type, lvl:u.stars||0, dream:d.dream, home:d.home,
                    map:(typeof G!=='undefined'&&G&&G.cfg)?G.cfg.name:'', dreamDone:!!u.dreamDone,
                    // ---- resurrection identity for The Wake (append-only; legacy fallen lack these) ----
                    fid: fallenMintId(u),
                    lore: u.lore ? { seed:u.lore.seed, v:u.lore.v, events:(u.lore.events||[]).slice(), fixed:u.lore.fixed||null } : null,
                    xp: u.xp||0, stars: u.stars||0, hero:!!u.hero, heroId:u.heroId||null,
                    spriteType: u.spriteType||null, sanityThreshold: u.sanityThreshold||0,
                    reborn:false });   // f.reborn === "this fallen has been resurrected" (distinct from a unit's u.reborn)
  if(typeof eventToast==='function')
    eventToast(`🕯 <b>${d.full}</b> has fallen — ${u.dreamDone?'their dream fulfilled':'dream unfulfilled: '+_loCap(d.dream)}.`, 10000);
  if(typeof fallenSceneMaybe==='function') fallenSceneMaybe(u);   // T1-1: brief solo memorial beat (gates live inside)
  if(typeof ACH!=='undefined' && !window._rbReplaying) ACH.fire('fallen',{count:fallenVets.length});   // T3-5
}
// ---- The Wake: stable identity + dossier reconstruction for fallen records ----
// A stable id used to dedup resurrection across save/load + rollback. Prefer the frozen lore seed
// (survives everything), then heroId, then a synthesized id. Twin of fallenStableId for existing records.
function fallenMintId(u){
  if(u.lore && u.lore.seed!=null) return 'f_lore:'+u.lore.seed;
  if(u.heroId) return 'f_hero:'+u.heroId;
  return 'f_u'+(u.id||0);
}
function fallenStableId(f){
  if(!f) return '';
  if(f.fid) return f.fid;                                   // enriched record
  if(f.lore && f.lore.seed!=null) return 'f_lore:'+f.lore.seed;
  if(f.heroId) return 'f_hero:'+f.heroId;
  return 'f_'+(f.name||'')+'|'+(f.type||'')+'|'+(f.lvl||0); // legacy fallback (old saves)
}
// Build a buildDossier-compatible lore object from a (possibly legacy) fallen record. Enriched records
// carry their real seed/events; legacy ones fall back to a name-only fixed (hero-style) dossier.
function fallenDossierSnap(f){
  if(f && f.lore && (f.lore.seed!=null || f.lore.fixed)) return f.lore;
  return { fixed:{ name:(f&&f.name)||'A veteran' }, events:[], seed:null };
}

/* ---- rendering (returns HTML strings; ui.js owns showing the overlays) ---- */
// the header block (name + role/level/home) — split out so the dossier panel can lay the
// Back button beside it without the personnel prose wrapping around the button.
function dossierHeadHTML(u){
  const d = buildDossier(u), def = DEF[u.type], lvl = u.stars||0;
  return `<h2>${def.icon?def.icon+' ':''}${d.full}</h2>`
    + `<div class="dossier-sub">${careerTitle(lvl)} ${def.name} · Level ${lvl} · from ${d.home}</div>`;
}
// the personnel file body (prose + service record), everything after the header.
function dossierFileHTML(u){
  const d = buildDossier(u), def = DEF[u.type], lvl = u.stars||0;
  let h = '';
  // T0-5: identity (name + hometown) exists from the first selection/kill, but the FULL personnel
  // prose stays the Lv2 "getting to know them" beat — below that, the file reads as sealed.
  if(!d.hero && lvl < 2){
    h += `<div class="dk">Personnel file</div><div class="dossier-prose">`;
    h += `<p>${d.first} ${d.last}, of ${_loCap(d.home)}. That much HR will confirm.</p>`;
    h += `<p class="assess">Full file sealed — clearance unlocks at Level 2. Keep them alive long enough to read it.</p></div>`;
    h += `<div class="dk">Service record</div><ol class="dossier-log"><li>No entries yet.</li></ol>`;
    return h;
  }
  // narrative prose: one deterministically-chosen paragraph per lore area, slots resolved here
  // ({rank}/{unit}/{lvl} only exist at render time; {me}/{home}/{trauma}/{dream}/{crime}/{family} via d.fill)
  if(d.paras){
    const fillP = (t)=> t ? _loCap(d.fill(t).replace(/\{rank\}/g, careerTitle(lvl))
      .replace(/\{unit\}/g, def.name).replace(/\{lvl\}/g, lvl)) : '';
    h += `<div class="dk">Personnel file</div><div class="dossier-prose">`;
    h += `<p>${fillP(d.paras.origin)}</p><p>${fillP(d.paras.family)}</p>`;
    h += `<p>${fillP(d.paras.trauma)}</p><p>${fillP(d.paras.dream)}</p>`;
    if(d.crime) h += `<p>${fillP(d.paras.crime)}</p>`;
    h += `<p class="assess">${fillP(d.paras.assessment)}</p></div>`;
  }
  h += `<div class="dk">Service record</div><ol class="dossier-log">`;
  for(const ev of u.lore.events){ const t = LORE_DATA.events[ev.i]; if(!t) continue;
    h += `<li><b>Lv ${ev.lvl}</b> — ${_loCap(d.fill(t.text))}</li>`; }
  h += `</ol>`;
  return h;
}
function dossierHTML(u){
  return `<div class="dossier">${dossierHeadHTML(u)}${dossierFileHTML(u)}</div>`;
}

/* =====================================================================
   T3-6: THE FOUNDER'S LEDGER — cross-run hall of fame. Its OWN localStorage key
   (starleft_ledger), never touched by the save loader → save-compat-safe by
   construction. Appended on IPO and on campaign collapse; capped.
   ===================================================================== */
const LEDGER_KEY='starleft_ledger', LEDGER_CAP=20;
function ledgerLoad(){
  try{ const d=JSON.parse(localStorage.getItem(LEDGER_KEY)||'{}');
    return { runs:Array.isArray(d.runs)?d.runs:[], stats:(d.stats&&typeof d.stats==='object')?d.stats:{} };
  }catch(_){ return { runs:[], stats:{} }; }
}
function recordLedgerRun(outcome){
  try{
    const led=ledgerLoad();
    const survivors=((typeof G!=='undefined'&&G)?G.entities:[])
      .filter(e=>!e.dead&&e.owner==='player'&&e.kind==='unit'&&e.lore)
      .map(u=>{ const d=buildDossier(u); return { name:d.full, type:u.type, lvl:u.stars||0, dream:d.dream, dreamDone:!!u.dreamDone }; });
    const fallen=fallenVets.map(f=>({ name:f.name, type:f.type, lvl:f.lvl||0, dream:f.dream, dreamDone:!!f.dreamDone, map:f.map }));
    led.runs.unshift({ at:Date.now(), outcome, ngPlus:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN&&CAMPAIGN.ngPlus)|0,
                       survivors:survivors.slice(0,24), fallen:fallen.slice(0,40) });
    while(led.runs.length>LEDGER_CAP) led.runs.pop();
    const s=led.stats;
    s.runsRecorded=(s.runsRecorded||0)+1;
    if(outcome==='ipo') s.campaignsCompleted=(s.campaignsCompleted||0)+1;
    s.totalFallen=(s.totalFallen||0)+fallen.length;
    s.dreamsFulfilled=(s.dreamsFulfilled||0)+survivors.concat(fallen).filter(x=>x.dreamDone).length;
    const top=survivors.concat(fallen).reduce((a,b)=>(b.lvl||0)>((a&&a.lvl)||0)?b:a, s.longestLived||null);
    if(top && top.name) s.longestLived={ name:top.name, lvl:top.lvl||0, type:top.type };
    localStorage.setItem(LEDGER_KEY, JSON.stringify(led));
  }catch(_){}
}
function ledgerHTML(){
  const led=ledgerLoad(), s=led.stats||{};
  if(!led.runs.length && !s.runsRecorded) return '';
  let h=`<div class="ledger"><h3>📒 Founder's Ledger — lifetime</h3>`;
  h+=`<div class="ledger-stats">`
    +`<span class="vs">IPOs <b>${s.campaignsCompleted||0}</b></span>`
    +`<span class="vs">runs <b>${s.runsRecorded||0}</b></span>`
    +`<span class="vs">🕯 total fallen <b>${s.totalFallen||0}</b></span>`
    +`<span class="vs">dreams fulfilled <b>${s.dreamsFulfilled||0}</b></span>`
    +(s.longestLived?`<span class="vs">longest-lived <b>${s.longestLived.name}</b> · Lv ${s.longestLived.lvl}</span>`:'')
    +`</div>`;
  for(const r of led.runs.slice(0,5)){
    const when=(()=>{ try{ return new Date(r.at).toLocaleDateString(); }catch(_){ return ''; } })();
    h+=`<div class="ledger-run"><b>${r.outcome==='ipo'?'🦄 IPO':'💸 collapse'}</b>${r.ngPlus?` · lap ${r.ngPlus+1}`:''} · ${when}`
      +` — ${r.survivors.length} survived, ${r.fallen.length} fell`
      +(r.survivors[0]?` · led by <b>${r.survivors[0].name}</b>`:(r.fallen[0]?` · remembered for <b>${r.fallen[0].name}</b>`:''))
      +`</div>`;
  }
  h+=`</div>`;
  return h;
}

function rosterHTML(){
  const living = (typeof G!=='undefined'&&G?G.entities:[])
    .filter(e=>!e.dead && e.owner==='player' && e.lore)
    .sort((a,b)=>(b.stars||0)-(a.stars||0));
  let h = `<div class="roster-cols">`;
  h += `<div class="roster-col"><h3>Active Veterans (${living.length})</h3>`;
  if(!living.length) h += `<div class="muted">No veterans yet — units earn a dossier at level 2.</div>`;
  for(const u of living){ const d=buildDossier(u), def=DEF[u.type];
    // living-city status (hub only): computed at build time — the roster rebuilds on every open
    const st=(typeof G!=='undefined'&&G&&G.hub&&typeof hubVetStatus==='function')?' · '+hubStatusText(hubVetStatus(u)):'';
    h += `<div class="roster-rowwrap"><button class="roster-row" data-uid="${u.id}">${def.icon||''} <b>${d.full}</b><span class="rr-sub">${careerTitle(u.stars||0)} ${def.name} · Lv ${u.stars||0}${st}</span></button>`
       + `<button class="roster-share" data-share-uid="${u.id}" title="Share this file as an image">⇪</button></div>`; }
  h += `</div>`;
  h += `<div class="roster-col"><h3>The Fallen (${fallenVets.length})</h3>`;
  if(!fallenVets.length) h += `<div class="muted">None yet — keep them alive.</div>`;
  fallenVets.forEach((f, fi)=>{ const def=DEF[f.type];
    h += `<div class="roster-rowwrap"><div class="roster-row fallen">${def?def.icon:''} <b>${f.name}</b><span class="rr-sub">${careerTitle(f.lvl)} ${def?def.name:f.type} · Lv ${f.lvl} · fell at ${f.map||'the front'} · ${f.dreamDone?'dream fulfilled ✓':'dream unfulfilled'}</span></div>`
       + `<button class="roster-share" data-share-fidx="${fi}" title="Pour one out — share their memorial card">⇪</button></div>`; });
  h += `</div></div>`;
  h += ledgerHTML();              // T3-6: lifetime hall-of-fame strip under the live roster
  if(typeof achievementsHTML==='function') h += achievementsHTML();   // T3-5: themed achievements tab
  return h;
}
