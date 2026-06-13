/* career.js — unit career ladder, veteran persistence & self-heal.
   Combat units earn career points by shooting the enemy; hero medics (Biba) earn them by mending
   allies. Crossing a threshold raises their level (1..30). Each level grants +15% damage (applied
   at fire time in units.js) and +33% max life (baked into u.maxHp here); a hero medic also heals
   2x a normal recruiter, +7% faster per level (healMul, applied at the heal tick in units.js).
   Level 11+ units slowly self-heal out of combat. In campaign mode the top veterans carry into the
   next map (count grows +1 every two maps). Rank renders as a 5-pip row recolored by 5-level tier.
   All tunables live in CAREER.
   Called from: units.js (gainXp / vetDmgMul / healMul / gainHealXp), core.js (vetRegen),
   render.js (drawStars), ui.js (captureVets / careerTitle), map.js (spawnVets).
   Depends on globals: DEF, mkUnit, toast, ctx, mapIndex. */

const CAREER = {
  perShot: 1,        // points per shot that hits an enemy entity (unit or building)
  perKill: 4,        // bonus when that shot lands the killing blow
  dmgPerStar: 0.15,  // +15% damage / level
  hpPerStar:  0.33,  // +33% max life / level
  maxStars: 30,      // level cap
  // hero medics (Biba) heal faster than a plain recruiter and climb the ladder by mending allies.
  healHeroMul: 2,     // base heal rate of a hero medic vs. a normal recruiter (2x) — holds at/below healBaseLevel
  healBaseLevel: 12,  // Biba is freed at this level; she sits at exactly healHeroMul (2x) here and scales only ABOVE it
  healPerStar: 0.07,  // +7% heal rate per level ABOVE healBaseLevel, stacking on healHeroMul
  healCap:     7,     // safety clamp on the total heal multiplier
  xpPerHealHp: 0.11,  // career points per (base) HP restored to allies → ~1 XP/s of active healing
  // cumulative XP to REACH level L (L>=1). Tuned so L5≈380 ("5 stars ≈ map 5"); grows
  // quadratically so L6..30 is a long-haul prestige grind (L10≈1185, L20≈4070, L30≈8655).
  xpFor(L){ return Math.round(25*L + 17*L*(L+1)/2); },
  // self-heal (level >= healStart): heal healPctBase of MAX HP per second, doubling every
  // healDoubleEvery levels, but only once healCombatGap seconds have passed since last hit.
  healStart: 11,
  healPctBase: 0.003,   // 0.3%/s at L11 → 0.6 @16 → 1.2 @21 → 2.4%/s @26
  healDoubleEvery: 5,
  healCombatGap: 4,     // seconds out of combat before regen resumes
};

// Reborn Cyborg (The Wake): a resurrected veteran comes back WRONG — a tougher metal chassis (+HP) but
// dead nerves (no self-heal). Its frayed mind is handled by spawning it `scarred` (breaks sooner) so no
// madosis.js change is needed. Gated on u.reborn, which travels via every carryover/roster snapshot.
const REBORN = { hpMul:1.15, regenMul:0 };

// 5-level tier colors for the rank pips (yellow → orange → red → green → blue → purple)
const CAREER_COLORS = ['#ffd23f','#ff8c1a','#ff3b30','#3cd05a','#3b86ff','#b05bff'];
// career-ladder titles, one per 5-level tier (tier 0 spans levels 1-4, then 5s)
const CAREER_TITLES = ['Associate','Junior','Mid-Level','Senior','Staff','Director'];

// combat units that can climb the ladder — soldiers/rangers/etc., not workers or healers
function isCombatVet(u){
  return u.kind==='unit' && u.type!=='worker' && (DEF[u.type].dmg||0) > 0 && !DEF[u.type].heal;
}
// hero medics (Biba) climb the ladder too — by mending allies. Generic recruiters/couriers do NOT.
function isHealerVet(u){ return u.kind==='unit' && !!u.hero && DEF[u.type] && DEF[u.type].heal>0; }
// any unit that earns career points (combat hits OR healing) — gates gainXp
function isCareerUnit(u){ return isCombatVet(u) || isHealerVet(u); }

function vetDmgMul(u){ return 1 + CAREER.dmgPerStar*(u.stars||0); }
// heal-rate multiplier by level (mirrors vetDmgMul): base healHeroMul for hero medics, +healPerStar per
// level ABOVE healBaseLevel (so Biba is exactly 2x at her Lv12 start and only grows past it), capped.
// Non-hero healers (plain recruiters/couriers) get 1x and never gain stars, so they stay at their DEF rate.
function healMul(u){
  const base = (u.hero && DEF[u.type] && DEF[u.type].heal) ? CAREER.healHeroMul : 1;
  const over = Math.max(0, (u.stars||0) - CAREER.healBaseLevel);   // scaling kicks in only above her starting level
  return Math.min(CAREER.healCap, base * (1 + CAREER.healPerStar*over));
}

// rank title for a level, e.g. careerTitle(17) === 'Senior 3' (empty below level 1)
function careerTitle(lvl){
  if(!(lvl>=1)) return '';
  const tier = lvl<5 ? 0 : Math.min(5, Math.floor(lvl/5));   // 1-4→0, 5-9→1, …, 25-30→5
  const start = tier===0 ? 1 : tier*5, sub = lvl-start+1;    // 1-based position within the tier
  return CAREER_TITLES[tier] + (sub>1 ? ' '+sub : '');
}

// (re)bake maxHp from base + level, preserving current HP ratio (or full-heal on request)
function applyVetHp(u, fullHeal){
  const base = DEF[u.type].hp, ratio = fullHeal ? 1 : (u.maxHp ? u.hp/u.maxHp : 1);
  const seriesInf = 1 + 0.01*((typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.seriesInf)||0);   // T3-9 "Series \u221e" global roster buff
  u.maxHp = Math.round(base * (1 + CAREER.hpPerStar*(u.stars||0)) * (u.hubHpMul||1) * (u.reborn?REBORN.hpMul:1) * seriesInf);
  u.hp = Math.round(u.maxHp * ratio);
}

// award career points to a player combat unit; promote across any thresholds crossed
function gainXp(u, killed, state){
  if(u.owner!=='player' || !isCareerUnit(u)) return;
  if(u.madDog || u.subdued) return;   // a unit mid-breakdown earns no career progress
  u.xp = (u.xp||0) + CAREER.perShot + (killed ? CAREER.perKill : 0);
  // T0-5 personhood: a first KILL mints the lightweight identity (name + hometown) right away —
  // the full dossier prose still arrives with the Lv2 promotion. Deterministic + idempotent.
  if(killed && typeof ensureDossier==='function') ensureDossier(u);
  promoteIfReady(u, state);
}

// award career points to a hero medic (Biba) for HP actually restored to allies; promote on thresholds.
// `baseHealed` is BASE-rate HP credited (caller divides out healMul) so the leveling pace stays flat
// regardless of how fast she heals — no level→faster-heal→more-XP runaway. Fractional XP carries frames.
function gainHealXp(u, baseHealed, state){
  if(u.owner!=='player' || !isHealerVet(u)) return;
  if(u.madDog || u.subdued) return;   // a unit mid-breakdown earns no career progress
  u._healXpAcc = (u._healXpAcc||0) + baseHealed*CAREER.xpPerHealHp;
  if(u._healXpAcc < 1) return;        // sub-point XP carries to the next frame
  const whole = Math.floor(u._healXpAcc); u._healXpAcc -= whole;
  u.xp = (u.xp||0) + whole;
  promoteIfReady(u, state);
}

// promote across any star thresholds the unit's xp now crosses: rebake HP, toast, log life-events.
// Shared by gainXp (combat) and gainHealXp (healing) so a hero medic levels exactly like Nino.
function promoteIfReady(u, state){
  const old = u.stars||0;
  let s = old;
  while(s < CAREER.maxStars && u.xp >= CAREER.xpFor(s+1)) s++;
  if(s === old) return;
  u.stars = s; applyVetHp(u, false);
  if(typeof ACH!=='undefined' && !window._rbReplaying) ACH.fire('promote',{stars:s});   // T3-5
  if(state && typeof hubEnsureStats==='function'){ const _hs=hubEnsureStats(state); _hs.promotions=(_hs.promotions||0)+(s-old); }   // run summary (T1-9)
  if(s>=1 && typeof ensureDossier==='function') ensureDossier(u);   // T0-5: identity exists from Lv1 (prose still gates at Lv2)
  if(!window._rbReplaying) toast('★ Promotion! '+careerTitle(s)+' '+DEF[u.type].name);   // stat changes are serialized; the toast is cosmetic → skip during rollback re-sim
  // career v3: dossier is born at level 2, then a backstory-connected life-event at each new level
  if(typeof rollLifeEvent==='function'){
    let last=null;
    for(let L=Math.max(2, old+1); L<=s; L++){
      ensureDossier(u);
      if(typeof mintSanityThreshold==='function') mintSanityThreshold(u);   // sanity threshold is born at level 2
      const ev=rollLifeEvent(u,L);
      if(ev){
        applyEventFx(u,ev.fx,state); last=ev;
        // madosis: reliving a trauma pushes a career unit toward the edge (gated to Episode 4+ inside addMadosis caller)
        if(typeof addMadosis==='function' && typeof LORE_DATA!=='undefined' && u.lore && u.lore.events.length
           && (typeof madEpisodeNo!=='function' || madEpisodeNo()>=MADOSIS.accrueFromEpisode)){
          const def0=LORE_DATA.events[u.lore.events[u.lore.events.length-1].i];
          if(def0 && def0.req==='trauma') addMadosis(u, MADOSIS.events.traumaRelapse, 'trauma');
        }
      }
    }
    if(last && typeof eventToast==='function'){
      const d=buildDossier(u);
      eventToast(u.lore.events.length<=1 ? `📖 <b>${d.full}</b> of ${d.home}: ${last.text}` : `📖 <b>${d.first}</b>: ${last.text}`, 8800, last.say);
      if(typeof LNS!=='undefined' && LNS.ultraEvent) LNS.ultraEvent('heroLifeEvent', { unit:u, event:last });
    }
    // in-world dialog: the unit speaks its freshest life-event in a box above its head (+ voice clip)
    if(last && last.say && typeof sayLoreEvent==='function') sayLoreEvent(u, last.say, last.tone, last.sayIdx);
  }
}

// out-of-combat self-heal for high-level veterans (called every frame from core.js)
function vetRegen(u, state, dt){
  if(state && state._noRegen) return;   // T3-4 'Sudden Death' mutator (skirmish-only)
  const lvl = u.stars||0;
  if(lvl < CAREER.healStart || u.hp<=0 || u.hp>=u.maxHp) return;
  if(state.time - (u._lastHit||-1e9) < CAREER.healCombatGap) return;   // still in/near combat
  let rate = CAREER.healPctBase * Math.pow(2, Math.floor((lvl-CAREER.healStart)/CAREER.healDoubleEvery));
  if(typeof vetBuff==='function') rate *= vetBuff(u,state).regenMul;   // life-event temp buff/debuff
  if(u.reborn) rate *= REBORN.regenMul;                                // reborn cyborgs have dead nerves — no self-heal
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp*rate*dt);
}

// rank pips: a 5-pip row showing progress within the current 5-level tier, colored by tier
function drawStars(u, px, topY){
  const lvl = u.stars||0; if(!lvl) return;
  const band = Math.min(5, Math.floor((lvl-1)/5));   // 0..5 → tier color
  const filled = ((lvl-1)%5)+1;                      // 1..5 pips lit within the tier
  const col = CAREER_COLORS[band];
  const sp=7, slots=5, w=(slots-1)*sp, x0=px-w/2, R=2.6;
  for(let i=0;i<slots;i++){
    const on=i<filled, x=x0+i*sp;
    ctx.beginPath();
    for(let k=0;k<4;k++){ const a=k/4*6.283-1.5708, r=k%2? R*0.45:R;   // small diamond pip
      const fx=x+Math.cos(a)*r, fy=topY+Math.sin(a)*r; k?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy); }
    ctx.closePath();
    ctx.fillStyle = on?col:'rgba(120,110,90,.35)';
    if(on){ ctx.shadowColor=col; ctx.shadowBlur=4; }
    ctx.fill(); ctx.shadowBlur=0;
  }
}

/* ---- veteran persistence (module global — survives the newMap() rebuild) ---- */
let carryoverVets = [];
// Named heroes persist on their OWN track, separate from the chooser-driven vet carryover: once a
// hero appears, they auto-deploy to every subsequent map until killed — never selectable, never
// counted against the vet carry cap. (Reset alongside carryoverVets when a new campaign starts.)
let carryoverHeroes = [];

// how many veterans carry into a given (0-based) map index: 2 into map 2-3, 3 into map 4-5,
// 4 into map 6-7, … — grows +1 every two maps, unbounded.
function vetCarryCountFor(idx){ return 2 + Math.floor(Math.max(0, idx-1)/2); }
function vetCarryCount(){ return vetCarryCountFor(mapIndex); }   // count into the map being entered

// surviving player veterans (UNIT objects, best first) — the carry candidates at victory.
// Named campaign heroes (u.hero, e.g. Nino) are map-scoped story characters, NOT carry-over vets:
// they're excluded here so they never appear in the chooser and never deploy to the next quarter.
function eligibleVets(state){
  return state.entities
    .filter(e=>!e.dead && e.owner==='player' && !e.hero && isCombatVet(e) && (e.stars||0)>=1)
    .sort((a,b)=>(b.stars-a.stars)||((b.xp||0)-(a.xp||0)));
}
// snapshot a chosen set of veteran units into the carryover (their dossier travels too)
function setCarryover(units){
  carryoverVets = units.map(e=>({type:e.type, stars:e.stars, xp:e.xp, lore:e.lore,
    madosis:e.madosis||0, sanityThreshold:e.sanityThreshold||0, scarred:!!e.scarred, reborn:!!e.reborn}));
}
// auto-pick fallback: carry all eligible (spawnVets slices to the count). Player choice uses the
// victory-screen chooser (ui.js) → setCarryover() instead.
function captureVets(state){ setCarryover(eligibleVets(state)); }

// inject the carried veterans near the player HQ at full HP, on top of the normal starters
function spawnVets(state){
  if(state.cfg.noCarryVets) return;   // infiltration map (Ep X): the veteran roster waits outside — only Nino + cfg.startUnits go in
  if(!carryoverVets.length) return;
  const c=state.cfg.player;
  carryoverVets.slice(0, vetCarryCount()).forEach((v,i)=>{
    // BELOW the HQ (rising-sprite buildings occlude anything spawned above them); fanned wide.
    const u=mkUnit(state, v.type, 'player', c.x-3+(i%6), c.y+8+((i/6)|0));
    u.stars=v.stars; u.xp=v.xp; if(v.lore) u.lore=v.lore;
    u.madosis=v.madosis||0; u.sanityThreshold=v.sanityThreshold||0; u.scarred=!!v.scarred;   // sanity travels with the vet
    u.reborn=!!v.reborn;                                                                       // reborn cyborg flag travels too
    if(typeof hubApplyUpgrades==='function') hubApplyUpgrades(u);
    applyVetHp(u, true);
  });
}

/* ---- named campaign heroes ----
   A map may introduce a hero via `heroes:[{name,type,level,dossier}]` (e.g. Nino on Episode VIII).
   A hero is a normal career unit in every way — earns XP, levels, logs life-events, renders a
   dossier — EXCEPT for persistence: instead of going through the victory chooser (where they'd be
   selectable and consume a carry slot), heroes ride their OWN carryover track and auto-deploy to
   every later map until they die. So they "can't get out" and "don't count to the limit", yet they
   keep showing up like any carried veteran. Identity is keyed by a stable heroId (the name) so a
   hero introduced once isn't re-spawned fresh when their map is revisited or after they've carried. */

// snapshot the heroes ALIVE at victory so they redeploy next map; dead heroes drop out and never
// return. Accumulated level/xp/dossier (u.lore, incl. service record) travel with them.
function captureHeroes(state){
  // In the solo player-controlled extraction, heroes obey the same rule as everyone: only carry over
  // if garrisoned in an HQ and Lv2+. Every other caller (co-op victory, the victory chooser, hub
  // dispatch with a synthetic {entities} state) keeps the legacy "all surviving heroes carry" behavior.
  const requireGarrison = !!(state && state.extractReady && netRole==='solo');
  carryoverHeroes = (state.entities||[])
    .filter(e=>!e.dead && e.owner==='player' && e.hero && (!requireGarrison || (e.storedIn && (e.stars||0)>=2)))
    .map(e=>({ heroId:e.heroId, type:e.type, sprite:e.spriteType, stars:e.stars, xp:e.xp, lore:e.lore }));
}
// clear the hero carryover (a brand-new campaign / map-select replay starts heroless)
function resetHeroes(){ carryoverHeroes = []; }
// is a named hero already on the carryover track? (Episode X: a Biba already freed in a prior run
// rides the carryover and spawns at HQ, so map.js must NOT also spawn her as a captive again.)
function heroIsCarried(name){ return carryoverHeroes.some(h=>h.heroId===name); }

/* ---- opening-crawl contextual variables ----
   MAPS[idx].crawl.text may weave in live campaign memory via {token}, {?key}...{/key}
   (show if set) and {^key}...{/key} (fallback). Resolved in showCrawl (ui.js). */

// "" / "A" / "A and B" / "A, B, and C"
function joinNames(arr){
  const a=(arr||[]).filter(Boolean);
  if(a.length<=1) return a[0]||'';
  if(a.length===2) return a[0]+' and '+a[1];
  return a.slice(0,-1).join(', ')+', and '+a[a.length-1];
}
// cap a long list: first `max` names, then a "+N more" tail (keeps the crawl readable)
function capNames(names, max){
  if(names.length<=max) return names.slice();
  const extra=names.length-max;
  return names.slice(0,max).concat(extra===1?'one more':extra+' more');
}
// display name for a carried vet snapshot — mirrors buildCarryChooser (ui.js).
// GUARD: buildDossier throws when lore is undefined (level-1 vets have none) → rank+role fallback.
function vetName(v){
  if(v && v.lore && typeof buildDossier==='function') return buildDossier(v).full;
  return (careerTitle((v&&v.stars)||0)+' '+((v&&DEF[v.type]&&DEF[v.type].name)||'')).trim();
}
// contextual variables for the opening crawl, from current campaign memory (extensible)
function crawlVars(){
  const heroAlive=(id)=> typeof heroIsCarried==='function' && heroIsCarried(id);
  const nino=heroAlive('Nino')?'NINO':'', biba=heroAlive('Biba')?'BIBA':'';
  const cap=(typeof vetCarryCount==='function')?vetCarryCount():6;              // matches who spawnVets fields
  const vetNames=(carryoverVets||[]).slice(0,cap).map(vetName).filter(Boolean); // Title Case, as-is
  const fallenNames=(typeof fallenVets!=='undefined'?fallenVets:[]).map(f=>f.name).filter(Boolean);
  return {
    nino, biba,
    vets:        joinNames(capNames(vetNames,4)),
    vetCount:    vetNames.length,
    party:       joinNames(capNames([nino,biba].filter(Boolean).concat(vetNames),5)),
    fallen:      joinNames(capNames(fallenNames,4)),
    fallenCount: fallenNames.length,
    dreamFulfilled: (typeof window!=='undefined' && window._lastDreamFulfilled) || '',   // T1-9: the last vet to fulfill their dream
    // future memory variables drop in here as one more key
  };
}
// fill {token}s and {?key}/{^key} blocks. Blocks resolve first, looped so nesting works;
// unknown {tokens} left intact; whitespace left by removed blocks tidied (paragraph \n\n kept).
function fillCrawl(text, vars){
  if(typeof text!=='string' || text.indexOf('{')<0) return text;   // fast path: eps I–X untouched
  vars=vars||{}; const truthy=(k)=> !!vars[k]; let prev;
  do { prev=text;
    text=text.replace(/\{\?(\w+)\}([\s\S]*?)\{\/\1\}/g,(m,k,b)=> truthy(k)?b:'')
             .replace(/\{\^(\w+)\}([\s\S]*?)\{\/\1\}/g,(m,k,b)=> truthy(k)?'':b);
  } while(text!==prev);
  text=text.replace(/\{(\w+)\}/g,(m,k)=> (k in vars)?String(vars[k]):m);
  return text.replace(/[ \t]{2,}/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

// Look up a hero's visual sprite override from the map configs (the single source of truth:
// heroes[].sprite). Lets us derive it anywhere — for carried heroes whose map no longer lists
// them, and to back-fill saves written before the field existed (see save.js). Matches by
// heroId first; falls back to unit `type` for OLD saves whose hero lost its heroId (a saved
// hero of type 'lobbyist' is Nino, the only lobbyist hero declared with a sprite).
function heroSpriteFor(heroId, type){
  for(const m of MAPS){ if(m.heroes) for(const h of m.heroes){ if(heroId && (h.id||h.name)===heroId && h.sprite) return h.sprite; } }
  if(type){ for(const m of MAPS){ if(m.heroes) for(const h of m.heroes){ if(h.type===type && h.sprite) return h.sprite; } } }
  return null;
}

// place ONE hero unit beside the player HQ; `pos` is the muster-slot index (for spacing).
// `sprite` is an optional visual-only sprite override (e.g. Nino's purple recolor); the hero
// still plays as `type` in every gameplay respect (DEF stats, icon, AI). See drawUnit/unitDrawH.
function _placeHero(state, c, pos, type, heroId, stars, xp, lore, dossier, sprite){
  if(!DEF[type]) return;                                       // unknown unit type → skip safely
  const u=mkUnit(state, type, 'player', c.x+1+(pos%3), c.y+5+((pos/3)|0));
  u.stars=Math.max(0, Math.min(CAREER.maxStars, stars||0));
  u.xp=(xp!=null)?xp:CAREER.xpFor(u.stars);
  u.hero=true; u.heroId=heroId;
  const sp = sprite || heroSpriteFor(heroId, type);            // fall back to config if the carryover predates `sprite`
  if(sp) u.spriteType=sp;                                      // render his bespoke recolored strips
  u.lore = lore || { seed:(u.id||0)+1, events:[], fixed: dossier || { name:heroId } };
  if(typeof hubApplyUpgrades==='function') hubApplyUpgrades(u);
  applyVetHp(u, true);
}

// deploy heroes for the map being entered: every survivor carried from prior maps, PLUS any hero
// this map introduces for the first time (deduped by heroId so a carried hero isn't doubled).
function spawnHeroes(state){
  const cfg=state.cfg, c=cfg.player;
  let pos=0; const placed=new Set();
  for(const h of carryoverHeroes){                            // auto-carried survivors
    _placeHero(state, c, pos++, h.type, h.heroId, h.stars, h.xp, h.lore, null, h.sprite);
    placed.add(h.heroId);
  }
  if(cfg && cfg.heroes) for(const h of cfg.heroes){           // first appearances on this map
    const hid = h.id || h.name;
    if(placed.has(hid)) continue;                             // already carried in — don't duplicate
    const lvl = Math.max(0, Math.min(CAREER.maxStars, h.level||0));
    _placeHero(state, c, pos++, h.type, hid, lvl, CAREER.xpFor(lvl), null, h.dossier || { name:h.name }, h.sprite);
    placed.add(hid);
  }
}
