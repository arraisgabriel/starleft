/* career.js — unit career ladder & veteran persistence.
   Combat units earn career points by shooting the enemy; crossing a threshold fills a
   star (max 5). Each star grants +15% damage (applied at fire time in units.js) and
   +33% max life (baked into u.maxHp here). In campaign mode the top 3 player veterans
   carry into the next map at the rank they earned. All tunables live in CAREER.
   Called from: units.js (gainXp / vetDmgMul), render.js (drawStars), ui.js (captureVets),
   map.js (spawnVets). Depends on globals: DEF, mkUnit, toast, ctx. */

const CAREER = {
  perShot: 1,        // points per shot that hits an enemy entity (unit or building)
  perKill: 4,        // bonus when that shot lands the killing blow
  thresholds: [40, 100, 175, 270, 380],  // cumulative XP for stars 1..5
  dmgPerStar: 0.15,  // +15% damage / star
  hpPerStar:  0.33,  // +33% max life / star
  maxStars: 5,
};

// combat units that can climb the ladder — soldiers/rangers/etc., not workers or healers
function isCombatVet(u){
  return u.kind==='unit' && u.type!=='worker' && (DEF[u.type].dmg||0) > 0 && !DEF[u.type].heal;
}

function vetDmgMul(u){ return 1 + CAREER.dmgPerStar*(u.stars||0); }

// (re)bake maxHp from base + stars, preserving current HP ratio (or full-heal on request)
function applyVetHp(u, fullHeal){
  const base = DEF[u.type].hp, ratio = fullHeal ? 1 : (u.maxHp ? u.hp/u.maxHp : 1);
  u.maxHp = Math.round(base * (1 + CAREER.hpPerStar*(u.stars||0)));
  u.hp = Math.round(u.maxHp * ratio);
}

// award career points to a player combat unit; promote across any thresholds crossed
function gainXp(u, killed){
  if(u.owner!=='player' || !isCombatVet(u)) return;
  u.xp = (u.xp||0) + CAREER.perShot + (killed ? CAREER.perKill : 0);
  let s = u.stars||0;
  while(s < CAREER.maxStars && u.xp >= CAREER.thresholds[s]) s++;
  if(s !== (u.stars||0)){
    u.stars = s; applyVetHp(u, false);
    toast('★ Promotion! '+DEF[u.type].name+' is now '+s+'-star');
  }
}

// neon-amber rank pips, centered above the HP bar (filled = earned, dim = empty)
function drawStars(u, px, topY){
  const n = u.stars||0; if(!n) return;
  const sp=7, w=(CAREER.maxStars-1)*sp, x0=px-w/2, R=2.6;
  for(let i=0;i<CAREER.maxStars;i++){
    const on=i<n, x=x0+i*sp;
    ctx.beginPath();
    for(let k=0;k<4;k++){ const a=k/4*6.283-1.5708, r=k%2? R*0.45:R;   // small diamond pip
      const fx=x+Math.cos(a)*r, fy=topY+Math.sin(a)*r; k?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy); }
    ctx.closePath();
    ctx.fillStyle = on?'#ffb347':'rgba(120,90,40,.45)';
    if(on){ ctx.shadowColor='#ffcf6b'; ctx.shadowBlur=4; }
    ctx.fill(); ctx.shadowBlur=0;
  }
}

/* ---- veteran persistence (module global — survives the newMap() rebuild) ---- */
let carryoverVets = [];

// snapshot the top 3 player combat units by stars (then xp) at the moment of victory
function captureVets(state){
  carryoverVets = state.entities
    .filter(e=>!e.dead && e.owner==='player' && isCombatVet(e) && (e.stars||0)>0)
    .sort((a,b)=>(b.stars-a.stars)||((b.xp||0)-(a.xp||0)))
    .slice(0,3).map(e=>({type:e.type, stars:e.stars, xp:e.xp}));
}

// inject the saved veterans near the player HQ at full HP, on top of the normal starters
function spawnVets(state){
  if(!carryoverVets.length) return;
  const c=state.cfg.player;
  carryoverVets.forEach((v,i)=>{
    const u=mkUnit(state, v.type, 'player', c.x-2+(i%4), c.y-3-((i/4)|0));
    u.stars=v.stars; u.xp=v.xp; applyVetHp(u, true);
  });
}
