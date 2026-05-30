/* career.js — unit career ladder, veteran persistence & self-heal.
   Combat units earn career points by shooting the enemy; crossing a threshold raises their
   level (1..30). Each level grants +15% damage (applied at fire time in units.js) and +33%
   max life (baked into u.maxHp here). Level 11+ units slowly self-heal out of combat. In
   campaign mode the top veterans carry into the next map (count grows +1 every two maps).
   Rank renders as a 5-pip row recolored by 5-level tier. All tunables live in CAREER.
   Called from: units.js (gainXp / vetDmgMul), core.js (vetRegen), render.js (drawStars),
   ui.js (captureVets / careerTitle), map.js (spawnVets).
   Depends on globals: DEF, mkUnit, toast, ctx, mapIndex. */

const CAREER = {
  perShot: 1,        // points per shot that hits an enemy entity (unit or building)
  perKill: 4,        // bonus when that shot lands the killing blow
  dmgPerStar: 0.15,  // +15% damage / level
  hpPerStar:  0.33,  // +33% max life / level
  maxStars: 30,      // level cap
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

// 5-level tier colors for the rank pips (yellow → orange → red → green → blue → purple)
const CAREER_COLORS = ['#ffd23f','#ff8c1a','#ff3b30','#3cd05a','#3b86ff','#b05bff'];
// career-ladder titles, one per 5-level tier (tier 0 spans levels 1-4, then 5s)
const CAREER_TITLES = ['Associate','Junior','Mid-Level','Senior','Staff','Director'];

// combat units that can climb the ladder — soldiers/rangers/etc., not workers or healers
function isCombatVet(u){
  return u.kind==='unit' && u.type!=='worker' && (DEF[u.type].dmg||0) > 0 && !DEF[u.type].heal;
}

function vetDmgMul(u){ return 1 + CAREER.dmgPerStar*(u.stars||0); }

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
  u.maxHp = Math.round(base * (1 + CAREER.hpPerStar*(u.stars||0)));
  u.hp = Math.round(u.maxHp * ratio);
}

// award career points to a player combat unit; promote across any thresholds crossed
function gainXp(u, killed, state){
  if(u.owner!=='player' || !isCombatVet(u)) return;
  u.xp = (u.xp||0) + CAREER.perShot + (killed ? CAREER.perKill : 0);
  const old = u.stars||0;
  let s = old;
  while(s < CAREER.maxStars && u.xp >= CAREER.xpFor(s+1)) s++;
  if(s === old) return;
  u.stars = s; applyVetHp(u, false);
  toast('★ Promotion! '+careerTitle(s)+' '+DEF[u.type].name);
  // career v3: dossier is born at level 2, then a backstory-connected life-event at each new level
  if(typeof rollLifeEvent==='function'){
    let last=null;
    for(let L=Math.max(2, old+1); L<=s; L++){ ensureDossier(u); const ev=rollLifeEvent(u,L); if(ev){ applyEventFx(u,ev.fx,state); last=ev; } }
    if(last && typeof eventToast==='function'){
      const d=buildDossier(u);
      eventToast(u.lore.events.length<=1 ? `📖 <b>${d.full}</b> of ${d.home}: ${last.text}` : `📖 <b>${d.first}</b>: ${last.text}`);
    }
  }
}

// out-of-combat self-heal for high-level veterans (called every frame from core.js)
function vetRegen(u, state, dt){
  const lvl = u.stars||0;
  if(lvl < CAREER.healStart || u.hp<=0 || u.hp>=u.maxHp) return;
  if(state.time - (u._lastHit||-1e9) < CAREER.healCombatGap) return;   // still in/near combat
  let rate = CAREER.healPctBase * Math.pow(2, Math.floor((lvl-CAREER.healStart)/CAREER.healDoubleEvery));
  if(typeof vetBuff==='function') rate *= vetBuff(u,state).regenMul;   // life-event temp buff/debuff
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

// how many veterans carry into a given (0-based) map index: 2 into map 2-3, 3 into map 4-5,
// 4 into map 6-7, … — grows +1 every two maps, unbounded.
function vetCarryCountFor(idx){ return 2 + Math.floor(Math.max(0, idx-1)/2); }
function vetCarryCount(){ return vetCarryCountFor(mapIndex); }   // count into the map being entered

// surviving player veterans (UNIT objects, best first) — the carry candidates at victory
function eligibleVets(state){
  return state.entities
    .filter(e=>!e.dead && e.owner==='player' && isCombatVet(e) && (e.stars||0)>=1)
    .sort((a,b)=>(b.stars-a.stars)||((b.xp||0)-(a.xp||0)));
}
// snapshot a chosen set of veteran units into the carryover (their dossier travels too)
function setCarryover(units){
  carryoverVets = units.map(e=>({type:e.type, stars:e.stars, xp:e.xp, lore:e.lore}));
}
// auto-pick fallback: carry all eligible (spawnVets slices to the count). Player choice uses the
// victory-screen chooser (ui.js) → setCarryover() instead.
function captureVets(state){ setCarryover(eligibleVets(state)); }

// inject the carried veterans near the player HQ at full HP, on top of the normal starters
function spawnVets(state){
  if(!carryoverVets.length) return;
  const c=state.cfg.player;
  carryoverVets.slice(0, vetCarryCount()).forEach((v,i)=>{
    const u=mkUnit(state, v.type, 'player', c.x-2+(i%4), c.y-3-((i/4)|0));
    u.stars=v.stars; u.xp=v.xp; if(v.lore) u.lore=v.lore; applyVetHp(u, true);
  });
}
