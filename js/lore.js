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
function _loCap(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }

/* ---- backstory assignment ---- */
const _dossierCache = new Map();   // seed -> built backstory (module-global; not serialized)

function ensureDossier(u){
  if(!u.lore) u.lore = { seed: _loHash((u.id||0)+1), events: [] };
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
  const d = { first, last, full, home, rel, relName, trauma, dream, crime, hero:true };
  d.fill = (t)=> baseFill(t).replace(/\{dream\}/g, dream).replace(/\{trauma\}/g, trauma).replace(/\{crime\}/g, crime||'an old mistake');
  d.familyText = baseFill(spec.family || '');
  return d;
}

// pure + memoized by seed → {first,last,full,home,rel,relName,trauma,dream,crime|null,familyText,fill}
function buildDossier(u){
  if(u.lore && u.lore.fixed) return makeHeroDossier(u.lore.fixed);   // named hero — skip the RNG
  const seed = u.lore.seed;
  if(_dossierCache.has(seed)) return _dossierCache.get(seed);
  const r = makeRng(seed);
  const first  = _loPick(r, LORE_DATA.firstNames);
  const last   = _loPick(r, LORE_DATA.surnames);
  const home   = _loPick(r, LORE_DATA.hometowns);
  const fam    = _loPick(r, LORE_DATA.family);
  const relName= _loPick(r, LORE_DATA.firstNames);
  const full   = first+' '+last;
  // baseFill resolves the "person" slots that the backstory fragments THEMSELVES contain,
  // so the dream/trauma/crime/family strings are slot-free before any event embeds them.
  const baseFill = (t)=> t.replace(/\{me\}/g, first).replace(/\{full\}/g, full)
    .replace(/\{home\}/g, home).replace(/\{rel\}/g, fam.rel).replace(/\{relName\}/g, relName);
  const trauma = baseFill(_loPick(r, LORE_DATA.traumas));
  const dream  = baseFill(_loPick(r, LORE_DATA.dreams));
  const crime  = (r() < LIFE_FX.crimeChance) ? baseFill(_loPick(r, LORE_DATA.crimes)) : null;
  const d = { first, last, full, home, rel:fam.rel, relName, trauma, dream, crime };
  // event filler: person slots (baseFill) + the already-resolved backstory slots
  d.fill = (t)=> baseFill(t).replace(/\{dream\}/g, dream).replace(/\{trauma\}/g, trauma).replace(/\{crime\}/g, crime||'an old mistake');
  d.familyText = baseFill(fam.text);
  _dossierCache.set(seed, d);
  return d;
}

/* ---- life-event rolls ---- */
// roll a new connected event for `level`, record it, return {text, fx, tone} (or null)
function rollLifeEvent(u, level){
  const d = buildDossier(u);
  const r = makeRng(u.lore.seed + level*101 + 7);
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
  return { text:_loCap(d.fill(t.text)), fx:t.fx, tone:t.tone };
}

/* ---- light effects (only a minority of events carry fx) ---- */
function applyEventFx(u, fx, state){
  if(!fx) return;
  if(fx.t==='heal'){ u.hp = u.maxHp; return; }
  if(fx.t==='fine'){ if(state && u.owner==='player') state.gold = Math.max(0,(state.gold||0)-(fx.gold||0)); return; }
  if(fx.t==='buff' || fx.t==='capstone'){
    u.buff = { dmgMul:fx.dmg||1, regenMul:fx.regen||1, until:(state?state.time:0)+(fx.dur||LIFE_FX.buffDur) };
    if(fx.t==='capstone') u.dreamDone = true;
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
function recordFallen(u){
  if(!u.lore) return;
  const d = buildDossier(u);
  fallenVets.push({ name:d.full, type:u.type, lvl:u.stars||0, dream:d.dream, home:d.home,
                    map:(typeof G!=='undefined'&&G&&G.cfg)?G.cfg.name:'', dreamDone:!!u.dreamDone });
  if(typeof eventToast==='function')
    eventToast(`🕯 <b>${d.full}</b> has fallen — ${u.dreamDone?'their dream fulfilled':'dream unfulfilled: '+_loCap(d.dream)}.`, 10000);
}

/* ---- rendering (returns HTML strings; ui.js owns showing the overlays) ---- */
function dossierHTML(u){
  const d = buildDossier(u), def = DEF[u.type], lvl = u.stars||0;
  let h = `<div class="dossier">`;
  h += `<h2>${def.icon?def.icon+' ':''}${d.full}</h2>`;
  h += `<div class="dossier-sub">${careerTitle(lvl)} ${def.name} · Level ${lvl} · from ${d.home}</div>`;
  h += `<div class="dossier-grid">`;
  h += `<div><span class="dk">Family</span>${d.familyText}</div>`;
  h += `<div><span class="dk">Trauma</span>${_loCap(d.fill('{trauma}'))}.</div>`;
  h += `<div><span class="dk">Dream</span>${_loCap(d.fill('{dream}'))}${u.dreamDone?' <em>— fulfilled ✓</em>':''}.</div>`;
  if(d.crime) h += `<div><span class="dk">Crime</span>${_loCap(d.crime)}.</div>`;
  h += `</div>`;
  h += `<div class="dk">Service record</div><ol class="dossier-log">`;
  for(const ev of u.lore.events){ const t = LORE_DATA.events[ev.i]; if(!t) continue;
    h += `<li><b>Lv ${ev.lvl}</b> — ${_loCap(d.fill(t.text))}</li>`; }
  h += `</ol></div>`;
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
    h += `<button class="roster-row" data-uid="${u.id}">${def.icon||''} <b>${d.full}</b><span class="rr-sub">${careerTitle(u.stars||0)} ${def.name} · Lv ${u.stars||0}</span></button>`; }
  h += `</div>`;
  h += `<div class="roster-col"><h3>The Fallen (${fallenVets.length})</h3>`;
  if(!fallenVets.length) h += `<div class="muted">None yet — keep them alive.</div>`;
  for(const f of fallenVets){ const def=DEF[f.type];
    h += `<div class="roster-row fallen">${def?def.icon:''} <b>${f.name}</b><span class="rr-sub">${careerTitle(f.lvl)} ${def?def.name:f.type} · Lv ${f.lvl} · fell at ${f.map||'the front'} · ${f.dreamDone?'dream fulfilled ✓':'dream unfulfilled'}</span></div>`; }
  h += `</div></div>`;
  return h;
}
