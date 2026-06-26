/* units.js — units, pathfinding, commands, production/building, combat & movement (findPath, updateUnit, separation, applyHit, …). */
/* =====================================================================
   PATHFINDING (A* on tile grid using blocked array)
   ===================================================================== */
function findPath(state, sx,sy, gx,gy){
  const W=state.W,H=state.H, B=state.blocked;
  const RC=state.roadCost;   // per-tile cost overlay (HUB roads); null on mission maps → unchanged behaviour
  if(gx<0||gy<0||gx>=W||gy>=H) return null;
  // if goal blocked, find nearest passable around it
  if(B[gy*W+gx]){
    let best=null,bd=1e9;
    for(let r=1;r<=4&&!best;r++){
      for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
        const nx=gx+x,ny=gy+y; if(nx<0||ny<0||nx>=W||ny>=H)continue;
        if(!B[ny*W+nx]){ const d=x*x+y*y; if(d<bd){bd=d;best=[nx,ny];} }
      }
    }
    if(!best) return null; gx=best[0]; gy=best[1];
  }
  if(sx===gx&&sy===gy) return [[gx,gy]];
  const open=[]; const came=new Map(); const gScore=new Map();
  const key=(x,y)=>y*W+x;
  const h=(x,y)=>Math.abs(x-gx)+Math.abs(y-gy);
  gScore.set(key(sx,sy),0);
  open.push({x:sx,y:sy,f:h(sx,sy)});
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  // weighted pathfinding (roadCost) explores more nodes; the HUB has W*H≈12.6k cells, above the
  // default 9000 cap, so scale it up there to avoid null→straight-line fallback through buildings.
  const ITER_CAP = RC ? Math.max(9000, W*H*3) : 9000;
  let iter=0;
  while(open.length){
    if(++iter>ITER_CAP) break;
    // get lowest f (linear; fine for our sizes)
    let bi=0; for(let i=1;i<open.length;i++) if(open[i].f<open[bi].f) bi=i;
    const cur=open.splice(bi,1)[0];
    if(cur.x===gx&&cur.y===gy){
      // reconstruct
      const path=[]; let k=key(gx,gy);
      while(k!==undefined){ const x=k%W,y=(k/W)|0; path.push([x,y]); k=came.get(k); }
      path.reverse(); return path;
    }
    const cg=gScore.get(key(cur.x,cur.y));
    for(const [dx,dy] of dirs){
      const nx=cur.x+dx, ny=cur.y+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(B[key(nx,ny)]) continue;
      if(dx&&dy){ // no diagonal through wall corners
        if(B[key(cur.x+dx,cur.y)]||B[key(cur.x,cur.y+dy)]) continue;
      }
      const nk=key(nx,ny);
      const step=(dx&&dy)?1.414:1;
      const ng=cg + (RC ? step*RC[nk] : step);   // road/sidewalk=1.0, off-road=penalty → prefer the network
      if(!gScore.has(nk)||ng<gScore.get(nk)){
        gScore.set(nk,ng); came.set(nk,key(cur.x,cur.y));
        const f=ng+h(nx,ny);
        const ex=open.find(o=>o.x===nx&&o.y===ny);
        if(ex) ex.f=f; else open.push({x:nx,y:ny,f});
      }
    }
  }
  return null;
}

function issueMove(state, unit, wx, wy, cmd){
  if(unit.air){ unit.path=null; unit.pathIdx=0; unit.dest={x:wx,y:wy}; unit.cmd=cmd||{type:'move',x:wx,y:wy}; return; } // flyers go straight, ignoring terrain
  const sx=(unit.x/TILE)|0, sy=(unit.y/TILE)|0;
  const gx=(wx/TILE)|0, gy=(wy/TILE)|0;
  const path=findPath(state,sx,sy,gx,gy);
  if(path&&path.length){
    unit.path=path; unit.pathIdx= path.length>1?1:0;
    unit.dest={x:wx,y:wy};
  } else {
    unit.path=null; unit.dest={x:wx,y:wy};
  }
  unit.cmd=cmd||{type:'move',x:wx,y:wy};
}

/* =====================================================================
   MANUAL ACTIVE ABILITIES (T2-2) — one per combat unit, every effect reuses
   tech that already exists (buffs, splash damage, siege, cooldowns, quakes).
   u.abilCd is sim state (serialized; missing on legacy saves = ready).
   ===================================================================== */
const ABILITIES = {
  soldier:  { name:'Overclock',      icon:'⚡', cd:15, hint:'+50% damage for 4s' },
  ranger:   { name:'Focus Shot',     icon:'🎯', cd:12, hint:'next shot deals double damage' },
  hustler:  { name:'Caffeine Dash',  icon:'☕', cd:10, hint:'sprint burst for 2s' },
  lobbyist: { name:'Lobby Blitz',    icon:'🎩', cd:10, hint:'instantly reload for an extra shot' },
  foodtruck:{ name:'Napalm Special', icon:'🔥', cd:12, hint:'flame nova around the truck' },
  auditor:  { name:'Siege Protocol', icon:'📐', cd:2,  hint:'toggle manual siege lock' },
  founder:  { name:'Stomp',          icon:'💥', cd:14, hint:'ground quake around the mech' },
  bomber:   { name:'Payload Drop',   icon:'🪂', cd:12, hint:'instantly reload the racks' },
};
// execute each selected unit's ability if it's off cooldown. Deterministic, sim-mutating —
// always reach this through netAbility (js/net/commands.js) so host/solo/rollback agree.
function castAbility(state, units){
  let any=false;
  for(const u of (units||[])){
    if(!u || u.dead || u.storedIn || u.kind!=='unit' || u.owner!=='player') continue;
    const spec=ABILITIES[u.type]; if(!spec) continue;
    if((u.abilCd||0)>0) continue;
    const fxOk = !window._rbReplaying;
    switch(u.type){
      case 'soldier':  u.buff={ dmgMul:1.5, regenMul:1, until:state.time+4 }; break;             // vetBuff() multiplies dmg
      case 'ranger':   u._focusShot=true; break;
      case 'hustler':  u._dashT=2.0; break;                                                       // followPath speed mult
      case 'lobbyist':
      case 'bomber':   u.cd=0; break;                                                             // instant reload
      case 'foodtruck':{
        const R=2.4*TILE;
        for(const o of state.entities){ if(o.dead||o.storedIn||!isHostile(u,o)) continue;
          if(o.owner!=='player'&&o.owner!=='enemy') continue;
          if(o.air) continue;
          if(dist(o,u)<=R) damage(state,o,24,u); }
        if(fxOk && typeof spawnShockwaveC==='function') spawnShockwaveC(u.x,u.y,R,'rgb(255,150,60)');
        break;
      }
      case 'auditor':  u._siegeLock=!u._siegeLock; if(!u._siegeLock){ u.sieged=false; u._setupT=0; } break;
      case 'founder':{
        const R=2.6*TILE;
        for(const o of state.entities){ if(o.dead||o.storedIn||!isHostile(u,o)) continue;
          if(o.owner!=='player'&&o.owner!=='enemy') continue;
          if(o.air) continue;
          if(dist(o,u)<=R) damage(state,o,30,u); }
        if(fxOk){ if(typeof spawnShockwaveC==='function') spawnShockwaveC(u.x,u.y,R,'rgb(190,140,255)');
          state._shake=Math.max(state._shake||0,6); }
        break;
      }
      default: continue;
    }
    u.abilCd=spec.cd; u._abilCastT=state.time;   // glow/feedback timestamp (render reuses villain idiom)
    any=true;
  }
  if(any && !window._rbReplaying){ if(typeof refreshUI==='function') refreshUI(); }
  return any;
}

/* HERO-only SECOND active ability (Arc-3) — keyed by spriteType so it sits ALONGSIDE the ability the
   hero already inherits from its base type (Rust is a `founder` skin → he keeps the founder STOMP
   button AND gains this RECALL). Own cooldown (u.heroAbilCd; legacy/undefined = ready, auto-serialized
   like abilCd), routed through netHeroAbility (js/net/commands.js) so solo/host/client/rollback agree,
   and executed host-authoritatively — exactly the contract castAbility uses. */
const HERO_ABILITY = {
  rust: { name:'Recall', icon:'🧲', cd:18, hint:'rally your most-wounded crew to your side and patch them up' },
};
function castHeroAbility(state, units){
  let any=false;
  for(const u of (units||[])){
    if(!u || u.dead || u.storedIn || u.kind!=='unit' || u.owner!=='player' || !u.hero) continue;
    const spec=HERO_ABILITY[u.spriteType]; if(!spec) continue;
    if((u.heroAbilCd||0)>0) continue;
    const fxOk=!window._rbReplaying;
    if(u.spriteType==='rust'){
      // RECALL: blink the up-to-3 most-wounded NON-hero player units within range to Rust's side and
      // patch each for 30% maxHp. Deterministic (sort by hp% then id) so host + rollback stay in sync.
      const R=14*TILE, picked=[];
      for(const o of state.entities){
        if(o===u || o.dead || o.storedIn || o.kind!=='unit' || o.owner!=='player' || o.hero) continue;
        if(!(o.maxHp>0) || (o.hp/o.maxHp)>=0.999) continue;     // only the wounded
        if(dist(o,u)>R) continue;
        picked.push(o);
      }
      picked.sort((a,b)=> (a.hp/a.maxHp)-(b.hp/b.maxHp) || (a.id||0)-(b.id||0));
      for(const o of picked.slice(0,3)){
        o.x=u.x; o.y=u.y;                                       // blink onto Rust; separation spreads them next tick
        o.vx=0; o.vy=0; o.autoTarget=null; o.path=null; o.pathIdx=0; o.dest=null; o.cmd=null;   // drop orders so they regroup, not walk back
        o.hp=Math.min(o.maxHp, o.hp + o.maxHp*0.30);
        if(fxOk && typeof spawnRing==='function') spawnRing(o.x, o.y, '#ffb060');
      }
      if(fxOk){ if(typeof spawnShockwaveC==='function') spawnShockwaveC(u.x, u.y, 2.0*TILE, 'rgb(255,140,60)');
        state._shake=Math.max(state._shake||0, 5); }
    }
    u.heroAbilCd=spec.cd; u._abilCastT=state.time;
    any=true;
  }
  if(any && !window._rbReplaying){ if(typeof refreshUI==='function') refreshUI(); }
  return any;
}

/* ===== HERO SIGNATURE abilities (Arc-3 cyberware) — PLAYER-ACTIVATED, bought at the Implant Clinic, 3
   tiers. A THIRD ability channel beside castAbility (u.abilCd) and castHeroAbility (u.heroAbilCd). Keyed by
   heroId; bought tier = CAMPAIGN.upgrades['hero:'+id].sig; per-tier params via heroSigTierParams(). Always
   reached through netSigAbility (host/solo/rollback agree). Deterministic (state.time + deterministic
   sorts; no Math.random in sim state); cosmetic FX gated by !window._rbReplaying. ===== */
function heroSigTier(u){
  if(!u || !u.hero || !u.heroId || typeof CAMPAIGN==='undefined' || !CAMPAIGN.upgrades) return 0;
  const up=CAMPAIGN.upgrades['hero:'+u.heroId];
  return (up && (up.sig|0)) || 0;
}
function castSigAbility(state, units){
  let any=false;
  for(const u of (units||[])){
    if(!u || u.dead || u.storedIn || u.kind!=='unit' || u.owner!=='player' || !u.hero) continue;
    const tier=heroSigTier(u); if(tier<1) continue;
    if((u.sigCd||0)>0 || u._sigStomp) continue;
    const p=(typeof heroSigTierParams==='function') ? heroSigTierParams(u.heroId, tier) : null;
    if(!p) continue;
    let fired=false;
    switch(u.heroId){
      case 'Nino': fired=sigCloak(state,u,p); break;
      case 'Biba': fired=sigMindControl(state,u,p); break;
      case 'Rust': fired=sigStompStart(state,u,p); break;
      case 'Zeca': fired=sigMassFab(state,u,p); break;
      default: continue;
    }
    if(!fired) continue;
    u.sigCd=p.cd||30; u._sigCastT=state.time;
    any=true;
  }
  if(any && !window._rbReplaying){ if(typeof refreshUI==='function') refreshUI(); }
  return any;
}
// NINO — Cloak: untargetable + render-invisible for a window (cleared in updateUnit when _cloakUntil passes).
function sigCloak(state,u,p){
  u._cloakUntil=state.time+(p.dur||60); u._cloaked=true; u._untargetable=true;
  if(!window._rbReplaying && typeof spawnRing==='function') spawnRing(u.x,u.y,'#9d4edd');
  return true;
}
// BIBA — Mind Control: permanently flip the nearest hostiles in a wide radius to the player (deterministic
// nearest-N). Mirrors triggerCaptiveFreeing's owner-flip; aoSide/owner auto-reskins them to player sprites.
function sigMindControl(state,u,p){
  const R=(p.radius||10)*TILE, n=p.count||5, cand=[];
  for(const o of state.entities){
    if(o===u || o.dead || o.storedIn || o.kind!=='unit') continue;
    if(o.hero || o.villain) continue;                 // never steal heroes/bosses
    if(typeof isHostile==='function' ? !isHostile(u,o) : o.owner!=='enemy') continue;
    const dd=dist(o,u); if(dd<=R) cand.push({o,dd});
  }
  if(!cand.length) return false;
  cand.sort((a,b)=> (a.dd-b.dd) || ((a.o.id||0)-(b.o.id||0)));   // deterministic → host/rollback agree
  for(const {o} of cand.slice(0,n)){
    o.owner='player'; o.ctrl=(u.ctrl||'p1'); o.stance='aggr';
    o.autoTarget=null; o.cmd=null; o.path=null; o.pathIdx=0; o.dest=null; o.vx=0; o.vy=0;
    o._engagedId=null; o._reTarget=null; o._convFlashT=1.0;       // render: red blink/fade
    if(!window._rbReplaying && typeof spawnRing==='function') spawnRing(o.x,o.y,'#ff6055');
  }
  if(typeof recomputeSupply==='function') recomputeSupply(state);
  if(typeof computeFog==='function') computeFog(state);
  return true;
}
// RUST — Thruster Stomp: rocket-leap to the densest enemy cluster, %maxHP AOE on landing. State machine
// runs in updateUnit via stepSigStomp (crouch → arc → land+blast → recover). Reuses the REX-leap idiom.
function sigStompStart(state,u,p){
  // target the densest HOSTILE pack (densestCluster targets PLAYER units — it's the boss helper — so we
  // roll our own enemy-centroid: the foe with the most foe-neighbours within CR). Deterministic (tie by id).
  const SR=16*TILE, CR=2.5*TILE, foes=[];
  for(const o of state.entities){ if(o.dead||o.storedIn||o.air||o.kind!=='unit') continue;
    if(typeof isHostile==='function'?!isHostile(u,o):o.owner!=='enemy') continue;
    if(dist(o,u)<=SR) foes.push(o); }
  if(!foes.length) return false;
  let best=foes[0], bestN=-1;
  for(const a of foes){ let n=0; for(const c of foes){ if(dist(a,c)<=CR) n++; }
    if(n>bestN || (n===bestN && (a.id||0)<(best.id||0))){ bestN=n; best=a; } }
  const tgt={ x:best.x, y:best.y };
  if(typeof resetMotion==='function') resetMotion(u);
  u._sigStomp={ phase:0, t:0, sx:u.x, sy:u.y, lx:tgt.x, ly:tgt.y, dmgPct:(p.dmgPct||0.3), R:(p.radius||3)*TILE };
  u._sigStompAir=false; u._jumpZ=0; u._actState='attack';
  if(!window._rbReplaying && typeof spawnThruster==='function') spawnThruster(u.x,u.y,0,1);
  return true;
}
function stepSigStomp(state,u,dt){
  const s=u._sigStomp; if(!s) return; s.t+=dt;
  const CROUCH=0.35, FLY=0.55;
  if(s.phase===0){ u._actState='attack';
    if(!window._rbReplaying && typeof spawnThruster==='function') spawnThruster(u.x,u.y,0,1);
    if(s.t>=CROUCH){ s.phase=1; s.t=0; u._sigStompAir=true; } }
  else if(s.phase===1){ const pr=Math.min(1, s.t/FLY);
    u.x=s.sx+(s.lx-s.sx)*pr; u.y=s.sy+(s.ly-s.sy)*pr;
    u._jumpZ=Math.sin(pr*Math.PI)*((u.r||16)*4.5); u._actState='attack';
    if(pr>=1){ s.phase=2; s.t=0; u._jumpZ=0; u._sigStompAir=false; sigStompLand(state,u,s); } }
  else { if(s.t>=0.25){ u._sigStomp=null; u._actState=null; } }
}
function sigStompLand(state,u,s){
  for(const o of state.entities){
    if(o===u || o.dead || o.storedIn || o.air) continue;
    if(typeof isHostile==='function'?!isHostile(u,o):o.owner!=='enemy') continue;
    const dd=dist(o,u); if(dd>s.R) continue;
    const fall=1-0.5*(dd/s.R);
    damage(state,o, Math.max(1, Math.round((o.maxHp||o.hp||1)*s.dmgPct*fall)), u);
  }
  if(!window._rbReplaying){
    if(typeof spawnShockwave==='function') spawnShockwave(u.x,u.y, s.R*1.1);
    if(typeof spawnDust==='function') spawnDust(u.x,u.y);
    if(typeof spawnExplosion==='function') spawnExplosion(u.x,u.y);
    if(typeof spawnRing==='function') spawnRing(u.x,u.y,'#ff8c3c');
    state._shake=Math.max(state._shake||0, 7);
  }
}
// ZECA — Mass Fabrication: instantly finish every player site, then open a free+instant build window
// consumed by placeBuilding (state._fabFree). Fires even with nothing building (the window is the payoff).
function sigMassFab(state,u,p){
  for(const e of state.entities){
    if(e.dead || e.kind!=='building' || e.owner!=='player' || !e.constructing) continue;
    e.buildProg=e.buildTime; e.constructing=false; e.hp=e.maxHp;
    if(!window._rbReplaying){ if(typeof spawnRing==='function') spawnRing(e.x,e.y,'#ffd86b'); if(typeof spawnExplosion==='function') spawnExplosion(e.x,e.y); }
  }
  state._fabFree={ until: state.time+(p.window||15), n:(p.free||2), ctrl:(u.ctrl||'p1') };
  if(typeof recomputeSupply==='function') recomputeSupply(state);
  if(!window._rbReplaying && typeof spawnRing==='function') spawnRing(u.x,u.y,'#ffd86b');
  return true;
}

// T2-3: attack-move the current selection to (wx,wy) — units advance and engage anything en route.
// The amove handler + auto-acquire respect already exist; this just issues the order with formation.
function commandAttackMove(state, wx, wy){
  const units=state.selection.filter(e=>!e.dead && !e.storedIn && e.kind==='unit' && e.owner==='player'
    && ((netRole==='solo') || (e.ctrl||'p1')===actingCtrl(state)));
  if(!units.length) return;
  const cols=Math.ceil(Math.sqrt(units.length));
  units.forEach((u,i)=>{ resetMotion(u);
    const tx=wx+((i%cols)-(cols-1)/2)*26, ty=wy+((Math.floor(i/cols))-(cols-1)/2)*26;
    issueMove(state,u,tx,ty,{type:'amove',x:tx,y:ty}); });
  if(!window._rbReplaying){ spawnRing(wx,wy,'#ff9a66'); }
  return true;
}
// T2-3: write a stance onto units (sim field; undefined = legacy aggressive)
function setStance(state, units, stance){
  for(const u of (units||[])){
    if(!u || u.dead || u.kind!=='unit' || u.owner!=='player') continue;
    u.stance = (stance==='aggr') ? undefined : stance;   // keep saves clean: default stays absent
    if(stance==='hold'){ u.path=null; u.dest=null; if(u.cmd && u.cmd.type==='move') u.cmd=null; }
  }
}

/* =====================================================================
   COMMANDS (right-click context)
   ===================================================================== */
function commandUnits(state, wx, wy, target){
  const sel = state.selection.filter(e=>!e.dead);
  if(!sel.length) return;

  // co-op: only command the ACTING controller's units (LOCAL_CTRL locally; the remote peer's ctrl
  // when the host replays their command). Solo → actingCtrl is 'p1' and everything is 'p1' → no-op.
  const _ac = (netRole==='solo') ? null : actingCtrl(state);
  const _mine = e => !_ac || (e.ctrl||'p1')===_ac;
  // If only buildings selected → set rally point
  const units = sel.filter(e=>e.kind==='unit'&&e.owner==='player'&&!e.storedIn&&_mine(e));
  const buildings = sel.filter(e=>e.kind==='building'&&e.owner==='player'&&_mine(e));
  if(units.length===0 && buildings.length){
    buildings.forEach(b=>{ if(!b.constructing){ b.rally={x:wx,y:wy}; }});
    toast('Rally point set'); spawnRing(wx,wy,'#7fd6ff');
    return;
  }

  // T4-5 duel: the rival founder's units/buildings are COMMAND TARGETS, not friendlies —
  // any of their entities routes straight to the attack branch below.
  const _pvpFoe = state._pvp && target && target.owner==='player' && units.length
    && (target.ctrl||'p1')!==(units[0].ctrl||'p1');
  if(target && !_pvpFoe && target.owner==='player' && target.type==='hq' && !target.constructing){
    if(issueEnterHq(state, units, target)) return;
  }

  // abandoned outpost → walk the squad onto it to reclaim (don't attack it)
  if(target && target.abandoned){
    units.forEach((u,i)=>{ resetMotion(u); issueMove(state,u, target.x+((i%3)-1)*24, target.y+24); });
    spawnRing(target.x,target.y,'#8effb0');
    toast('Move a unit onto the outpost to reclaim it');
    return;
  }
  // MADOSIS: right-click a memory echo → selected healers run the guided rescue (dog resolved via
  // dogId); everyone else escorts to it — ANY player unit standing on an echo collects it
  // (madGlobalTick walk-over sweep). Networked like every commandUnits target (tid id-resolution).
  if(target && target.kind==='echo' && !target.dead){
    const dog = state.entities.find(d=> d.id===target.dogId && !d.dead && d.madDog);
    const healers = dog ? units.filter(u=> typeof madCanRescue==='function' && madCanRescue(u)) : [];
    if(dog && healers.length && typeof madBeginRescue==='function'){
      healers.forEach(u=> madBeginRescue(state,u,dog));
      units.filter(u=> healers.indexOf(u)<0).forEach((u,i)=>{ resetMotion(u); issueMove(state,u, target.x+((i%3)-1)*26, target.y+28); });
      spawnRing(target.x,target.y,'#b05bff');
      return;
    }
    units.forEach((u,i)=>{ resetMotion(u); issueMove(state,u, target.x+((i%3)-1)*24, target.y+24); });
    if(dog) toast('Walk onto the memory to recover it — a Recruiter or healer hero runs the whole rescue');
    spawnRing(target.x,target.y,'#b05bff');
    return;
  }
  // MADOSIS: a mad dog is owner:'player' but hostile — handle it before the friendly-target paths.
  // A selected healer (Recruiter / Biba) RESCUES it (memory-anchors mini-game); others put it down.
  if(target && target.madDog){
    const healers = units.filter(u=> typeof madCanRescue==='function' && madCanRescue(u));
    if(healers.length && typeof madBeginRescue==='function'){
      healers.forEach(u=> madBeginRescue(state,u,target));
      units.filter(u=> healers.indexOf(u)<0).forEach((u,i)=>{ resetMotion(u); issueMove(state,u, target.x+((i%3)-1)*26, target.y+28); });
      spawnRing(target.x,target.y,'#b05bff');
      return;
    }
    // no healer selected → put the dog down. If a rescue was already underway, abandon it first so the
    // friendly-fire reduction (dogPlayerDmgMul) lifts and the player's own squad can actually finish it.
    if(target._rescue){ target._rescue=false; if(typeof madCleanupEchoes==='function') madCleanupEchoes(state,target); }
    units.forEach(u=> attackTarget(state,u,target));
    spawnRing(target.x,target.y,'#ff6b6b');
    return;
  }
  // Episode X — a caged captive (Biba / the intern). NEVER attackable by the player; only NINO frees
  // them, and only by reaching the cell (freeCaptives, core.js, releases everyone the instant he is in
  // arm's reach). Right-clicking the cell pushes the squad down to it via attack-move (so they fight
  // through the guards) and tells the player who is actually needed.
  if(target && target.captive){
    const nino = units.find(u=> u.hero && (u.heroId==='Nino' || u.spriteType==='nino'));
    const who  = target.captiveName || 'the prisoner';
    units.forEach((u,i)=>{ resetMotion(u);
      const tx = target.x + ((i%3)-1)*22, ty = target.y + (nino ? -TILE : TILE);
      issueMove(state,u, tx, ty, {type:'amove', x:tx, y:ty});   // attack-move: punch through the cell ring
    });
    toast(nino ? ('Nino moves to free '+who+'.') : ('Only Nino can free '+who+' — bring him to the cell.'));
    spawnRing(target.x,target.y,'#8effb0');
    return;
  }
  // focus-heal: a selected healer commanded onto a friendly unit locks onto and mends it,
  // then reverts to auto-heal once it is full (see updateUnit's healunit handler). Non-healers
  // in the selection escort to the target. HQ/buildings/mad-dogs/captives are handled above.
  if(target && !_pvpFoe && target.owner==='player' && target.kind==='unit' && !target.storedIn && !target.madDog){
    const healers = units.filter(u=> u!==target && DEF[u.type] && (DEF[u.type].heal>0 || DEF[u.type].madHeal));
    if(healers.length){
      healers.forEach(u=>{ resetMotion(u); u.sprinting=false; u.cmd={type:'healunit', target}; u.state='heal'; u._toHeal=false; });
      units.filter(u=> healers.indexOf(u)<0).forEach((u,i)=>{ resetMotion(u); issueMove(state,u, target.x+((i%3)-1)*24, target.y+26); });
      spawnRing(target.x,target.y,'#8effb0');
      const nm=(DEF[target.type]&&DEF[target.type].name)||'ally';
      // Mindfulness Facilitators "calm" the mind (madosis); HP-healers "mend" the body. Pick the verb by what's selected.
      const verb = healers.every(u=> DEF[u.type] && DEF[u.type].madHeal && !(DEF[u.type].heal>0)) ? 'calming' : 'mending';
      toast(healers.length===1 ? ('Healer '+verb+' '+nm) : (healers.length+' healers '+verb+' '+nm));
      return;
    }
    // no healer selected → fall through to the normal move handler (squad escorts to the ally)
  }
  if(target && target.owner && (target.owner!=='player' || _pvpFoe)){
    if(state.hub && target.hubPoi && typeof hubCommandPoi==='function'){
      if(hubCommandPoi(state, units, target)) return;
    }
    // attack (incl. the rival founder's assets in a duel)
    units.forEach(u=> attackTarget(state,u,target));
    spawnRing(target.x,target.y,'#ff6b6b');
    return;
  }
  if(state.hub && target && target.hubPoi && typeof hubCommandPoi==='function'){
    if(hubCommandPoi(state, units, target)) return;
  }
  // assign worker(s) to an unfinished friendly building (resume/assist construction)
  if(target && target.owner==='player' && target.kind==='building' && target.constructing){
    const builders=units.filter(u=>u.type==='worker');
    builders.forEach(u=> assignBuild(state,u,target));
    units.filter(u=>u.type!=='worker').forEach(u=>{ resetMotion(u); issueMove(state,u,target.x,target.y); });
    toast(builders.length ? 'Intern assigned to construction' : 'Select an Intern to build');
    spawnRing(target.x,target.y,'#8effb0');
    return;
  }
  if(target && target.type==='goldmine'){
    units.filter(u=>u.type==='worker').forEach(u=> gatherFrom(state,u,target));
    units.filter(u=>u.type!=='worker').forEach((u,i)=>{ resetMotion(u); issueMove(state,u,target.x+(i%3-1)*22,target.y+22); });
    spawnRing(target.x,target.y,'#ffd86b');
    return;
  }
  // move — a normal move fans units into a small grid (formation offsets) and flashes the
  // cyan ring; an active Sprint instead sends the whole squad to the EXACT point as a tight
  // pack and skips the ring (the #sprint-ripple CSS overlay marks the spot).
  const sprinting = state.sprint && state.sprint.active;
  const n=units.length; const cols=Math.ceil(Math.sqrt(n));
  units.forEach((u,i)=>{
    let tx=wx, ty=wy;
    if(!sprinting){ tx=wx+((i%cols)-(cols-1)/2)*26; ty=wy+((Math.floor(i/cols))-(cols-1)/2)*26; }
    resetMotion(u);
    issueMove(state,u, tx, ty); // plain move — obey the order, don't divert to auto-attack
  });
  if(!sprinting) spawnRing(wx,wy,'#7fd6ff');
}

// Clear all transient movement/targeting state so a fresh command isn't
// blocked by leftover flags from a previous one (e.g. a stale _toMine flag
// that would stop a worker from ever pathing to a newly clicked mine).
function resetMotion(u){
  u._toMine=false; u._toDep=false; u._reTarget=null; u._chaseTimer=0;
  u.autoTarget=null; u.path=null; u.pathIdx=0; u.dest=null;
  u._stuckT=0; u._lastTargD=undefined; u._toBuild=false; u._buildRepath=0;
}
function attackTarget(state,u,target){
  resetMotion(u);
  u.cmd={type:'attack',target};
  u.state='attack';
}
function gatherFrom(state,u,mine){
  resetMotion(u);
  u.cmd={type:'gather',mine};
  u.state='gather';
}

function hqStoredUnits(state,hq){
  if(!state||!hq) return [];
  const ids=hq.storedUnits||[];
  const live=ids.map(id=>state.entities.find(e=>e.id===id&&!e.dead&&e.storedIn===hq.id)).filter(Boolean);
  if(live.length!==ids.length) hq.storedUnits=live.map(u=>u.id);
  return live;
}
function hqExitTile(state,hq,seed){
  for(let r=1;r<=6;r++){
    const spots=[];
    for(let y=-r;y<hq.h+r;y++) for(let x=-r;x<hq.w+r;x++){
      const ring = x===-r || x===hq.w+r-1 || y===-r || y===hq.h+r-1;
      if(!ring) continue;
      const tx=hq.tx+x, ty=hq.ty+y;
      if(tx<0||ty<0||tx>=state.W||ty>=state.H) continue;
      if(state.blocked[ty*state.W+tx]) continue;
      spots.push({tx,ty});
    }
    if(!spots.length) continue;
    const start=Math.abs(seed||0)%spots.length;
    for(let i=0;i<spots.length;i++){
      const s=spots[(start+i)%spots.length], wx=s.tx*TILE+TILE/2, wy=s.ty*TILE+TILE/2;
      const occupied=state.entities.some(e=>!e.dead&&!e.storedIn&&e.kind==='unit'&&Math.hypot(e.x-wx,e.y-wy)<(e.r||9)+12);
      if(!occupied) return s;
    }
  }
  return null;
}
function issueEnterHq(state, units, hq){
  if(!state||!hq||hq.type!=='hq'||hq.owner!=='player'||hq.constructing) return false;
  const movers=units.filter(u=>u.kind==='unit'&&u.owner==='player'&&!u.storedIn);
  if(!movers.length) return false;
  // Post-victory units garrison normally; extraction is launched explicitly via the HQ button.
  movers.forEach(u=>{
    resetMotion(u);
    u.cmd={type:'enterhq', hq};
    const spot=nearestFreeAdjTile(state,hq,u.x,u.y) || {x:hq.x,y:hq.y};
    issueMoveKeepCmd(state,u,spot.x,spot.y);
  });
  spawnRing(hq.x,hq.y,'#8effb0');
  toast(movers.length===1 ? 'Unit entering HQ.' : movers.length+' units entering HQ.');
  return true;
}
function storeUnitInHq(state,u,hq,quiet){
  if(!state||!u||!hq||hq.dead||hq.type!=='hq') return false;
  if(u.type==='worker' && u.carrying>0){
    const eco=playerEco(state, u.ctrl || hq.ctrl || 'p1');
    eco.gold += u.carrying; eco.gold_collected += u.carrying;
    u.carrying=0;
  }
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=hq.id; u.x=hq.x; u.y=hq.y;
  hq.storedUnits=(hq.storedUnits||[]).filter(id=>id!==u.id);
  hq.storedUnits.push(u.id);
  u.selected=false;
  state.selection=state.selection.filter(e=>e!==u);
  spawnRing(hq.x,hq.y,'#8effb0');
  if(!quiet) toast((DEF[u.type].name||'Unit')+' stored in HQ.');
  refreshUI();
  return true;
}
// nearest finished, friendly HQ to a unit (storeUnitInHq only accepts type==='hq', unlike nearestDeposit)
function nearestHq(state, e){
  let best=null,bd=1e18;
  for(const o of state.entities){
    if(o.dead||o.owner!==e.owner||o.kind!=='building'||o.type!=='hq'||o.constructing) continue;
    const dx=o.x-e.x,dy=o.y-e.y,d=dx*dx+dy*dy; if(d<bd){bd=d;best=o;}
  }
  return best;
}
// Biba can't die: a downed hero medic is rushed into the nearest friendly HQ (fully patched up) instead
// of being killed, so she's extracted at mission end with the veterans. With no HQ to flee to she simply
// refuses to die in place (clamped to 1 HP). Returns true if she was garrisoned.
function downHeroToHq(state, u){
  const hq = nearestHq(state, u);
  if(!hq){ u.hp = Math.max(1, u.hp); return false; }   // nowhere to fall back to → won't die, holds at 1 HP
  storeUnitInHq(state, u, hq, true);                   // quiet store — we narrate the downing ourselves
  u.hp = u.maxHp;                                       // recovered inside the HQ (and keeps hp>0 so the death loop won't re-fire)
  if(!window._rbReplaying) toast('🚑 '+(u.heroId||u.captiveName||'Biba')+' was downed — extracted to the HQ.');
  return true;
}
function releaseStoredUnit(state,hq,id){
  if(!state||!hq||hq.dead) return false;
  const u=hqStoredUnits(state,hq).find(x=>x.id===id);
  if(!u) return false;
  const spot=hqExitTile(state,hq,id);
  if(!spot){ toast('No room outside HQ'); return false; }
  hq.storedUnits=(hq.storedUnits||[]).filter(uid=>uid!==id);
  delete u.storedIn;
  u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2;
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.selected=false;
  spawnRing(u.x,u.y,'#7fd6ff');
  toast((DEF[u.type].name||'Unit')+' exited HQ.');
  refreshUI();
  return true;
}
function releaseAllStoredUnits(state,hq){
  if(!state||!hq||!hq.storedUnits) return;
  hqStoredUnits(state,hq).slice().forEach(u=>releaseStoredUnit(state,hq,u.id));
}

/* =====================================================================
   PRODUCTION & BUILDING
   ===================================================================== */
function tryTrain(state, building, type){
  const d=DEF[type];
  const eco=playerEco(state, building.ctrl);          // train from the producing player's pool
  if(eco.gold < d.cost){ toast('Not enough funding'); return; }
  if(d.supply && eco.supply + (state.queuedSupply||0) + d.supply > eco.supplyCap){
    toast('Headcount full — build another Open-Plan HQ or a Satellite Office');
    if(typeof TUTORIAL!=='undefined' && TUTORIAL.fireContextual) TUTORIAL.fireContextual('supply-cap', state);   // teach supply the moment it bites (T2-5)
    return;
  }
  eco.gold -= d.cost;
  building.prodQueue.push(type);
  if(building.prodTotal===0){ building.prodTotal=d.build; building.prodTime=0; }
}
// Buy a one-time per-turret upgrade (TURRET_UPGRADES key) from the owning player's pool.
function tryUpgradeTurret(state, b, key){
  const spec=TURRET_UPGRADES[key];
  if(!spec || !b || b.dead || b.type!=='turret' || b.constructing) return;
  if(b[spec.field]) return;                                   // already installed
  const eco=playerEco(state, b.ctrl);
  if(eco.gold < spec.cost){ toast('Not enough funding'); return; }
  eco.gold -= spec.cost;
  b[spec.field]=true;
  toast(spec.name+' installed — '+spec.hint);
}

// Demolish an own building (works mid-construction too): queued hires refund in full
// like cancelTrain, the structure itself salvages DEMOLISH_REFUND of the funding paid.
function tryDemolish(state, b){
  if(!b || b.dead || b.kind!=='building' || b.owner!=='player') return;
  if(state.hub || b.hubPoi) return;                        // city facilities are not salvage
  const eco=playerEco(state, b.ctrl);
  for(const t of (b.prodQueue||[])) eco.gold += (DEF[t].cost||0);
  b.prodQueue=[]; b.prodTime=0; b.prodTotal=0;
  const paid = (b.paidCost!=null) ? b.paidCost : (DEF[b.type].cost||0);   // legacy saves: fall back to DEF
  const refund = Math.round(paid*DEMOLISH_REFUND);
  eco.gold += refund;
  b.hp=0; b._demolished=true;                              // voluntary salvage — no MADOSIS trauma
  killEntity(state,b);
  state.selection=state.selection.filter(e=>!e.dead);
  recomputeSupply(state);
  toast(DEF[b.type].name+' demolished — '+refund+'🪙 salvaged');
  refreshUI();
}

/* ---- Market Research ('intel') map scan ----
   tryStartScan arms the survey clock (ticked in core.js); intelScanReveal fires on completion
   and exposes a PARTIAL slice of every enemy campus. Deterministic (no RNG) so rollback resim
   replays identically: clusters in entity-array order, representative = lowest id. */
function tryStartScan(state, b){
  if(!b || b.dead || b.type!=='intel' || b.owner!=='player' || b.constructing || b.scanTotal>0) return;
  b.scanProg=0; b.scanTotal=INTEL_SCAN.time;
  toast('🛰️ Market Research survey commissioned…');
}
// Idempotent circular explored-terrain patch (mirrors the outpost/P2-start reveal writes in map.js).
function applyScanReveal(state, x, y, r){
  const W=state.W, H=state.H, r2=r*r;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(dx*dx+dy*dy>r2) continue;
    const nx=x+dx, ny=y+dy;
    if(nx>=0&&ny>=0&&nx<W&&ny<H) state.explored[ny*W+nx]=1;
  }
}
function intelScanReveal(state){
  const blds=state.entities.filter(e=>!e.dead&&e.kind==='building'&&e.owner==='enemy');
  if(!blds.length){ toast('🕵️ Market Research: no rival operations detected.'); return; }
  // union-find clusters by <= clusterR tile proximity
  const p=blds.map((_,i)=>i), find=i=>{ while(p[i]!==i){ p[i]=p[p[i]]; i=p[i]; } return i; };
  const lim=Math.pow(INTEL_SCAN.clusterR*TILE,2);
  for(let i=0;i<blds.length;i++)for(let j=i+1;j<blds.length;j++){
    const dx=blds[i].x-blds[j].x, dy=blds[i].y-blds[j].y;
    if(dx*dx+dy*dy<=lim){ const a=find(i), b=find(j); if(a!==b) p[a]=b; }
  }
  const repOf=new Map();                                  // root → member index with lowest id
  for(let i=0;i<blds.length;i++){ const r=find(i);
    if(!repOf.has(r) || blds[i].id<blds[repOf.get(r)].id) repOf.set(r,i); }
  state.scanReveals = state.scanReveals || [];
  const seen2=Math.pow(INTEL_SCAN.seenR*TILE,2);
  let n=0;
  for(const [root,ri] of repOf){
    const rep=blds[ri]; n++;
    for(let i=0;i<blds.length;i++){
      if(find(i)!==root) continue;
      const e=blds[i], dx=e.x-rep.x, dy=e.y-rep.y;
      if(dx*dx+dy*dy>seen2) continue;                     // outside the slice → stays hidden (partial reveal)
      if(e._everSeen) continue;                           // already exposed (earlier scan or own sight) → no duplicate patch
      e._everSeen=true;                                   // ghost on map + minimap (render.js)
      const tx=(e.x/TILE)|0, ty=(e.y/TILE)|0;
      state.scanReveals.push({x:tx,y:ty,r:INTEL_SCAN.revealR});
      applyScanReveal(state,tx,ty,INTEL_SCAN.revealR);    // terrain patch always covers the ghost
    }
  }
  toast('🕵️ Market Research published: '+n+' rival campus'+(n===1?'':'es')+' located.');
}

// Cancel a queued unit by index: refund its cost; if it was the in-progress one,
// reset progress to the next item in line.
function cancelTrain(state, building, index){
  const q=building.prodQueue;
  if(!q || index<0 || index>=q.length) return;
  const type=q.splice(index,1)[0];
  playerEco(state, building.ctrl).gold += (DEF[type].cost||0);   // refund to the producing player
  if(index===0){ building.prodTime=0; building.prodTotal = q.length ? DEF[q[0]].build : 0; }
}

function tryPlace(state, type){
  const sel = state.selection.find(e=>e.kind==='unit'&&e.type==='worker'&&!e.dead);
  if(!sel){ toast('Select a Worker first'); return; }
  const d=DEF[type];
  if(playerEco(state, sel.ctrl).gold < d.cost){ toast('Not enough funding'); return; }
  state.placing = { type, def:d, builder:sel };
  toast('Tap a spot to build the '+d.name+' (Cancel / Esc to abort)');
}

function canPlaceAt(state, type, tx, ty){
  const d=DEF[type];
  for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++){
    const cx=tx+x, cy=ty+y;
    if(cx<0||cy<0||cx>=state.W||cy>=state.H) return false;
    if(state.blocked[cy*state.W+cx]) return false;
    if(state.feat && state.feat[cy*state.W+cx]) return false;   // no building under/over a 2x2 topography feature
    if(!state.explored[cy*state.W+cx]) return false;
  }
  // not on top of entities
  for(const e of state.entities){
    if(e.dead) continue;                    // rubble doesn't block — demolished/razed footprints are rebuildable
    if(e.kind==='unit') continue;
    if(e.kind==='building'){
      if(tx< e.tx+e.w && tx+d.w>e.tx && ty< e.ty+e.h && ty+d.h>e.ty) return false;
    }
    if(e.type==='goldmine'){
      const gx=(e.x/TILE-0.5)|0, gy=(e.y/TILE-0.5)|0;
      if(tx<=gx+0 && tx+d.w>gx && ty<=gy && ty+d.h>gy) return false;
    }
  }
  return true;
}

// Nearest passable tile in the ring around a building's footprint (incl.
// diagonals) — where a worker should stand to construct it.
function nearestFreeAdjTile(state, b, fromX, fromY){
  let best=null, bd=1e18;
  for(let y=-1;y<=b.h;y++) for(let x=-1;x<=b.w;x++){
    if(x>=0&&x<b.w&&y>=0&&y<b.h) continue;          // inside footprint
    const tx=b.tx+x, ty=b.ty+y;
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) continue;
    if(state.blocked[ty*state.W+tx]) continue;       // wall / another building
    const cx=tx*TILE+TILE/2, cy=ty*TILE+TILE/2;
    const d=(cx-fromX)**2+(cy-fromY)**2;
    if(d<bd){ bd=d; best={x:cx,y:cy}; }
  }
  return best;
}
// Assign a worker to (continue) building b: walk to the nearest free adjacent tile.
function assignBuild(state, u, b){
  resetMotion(u);
  u.cmd={type:'build', building:b};
  u.state='build';
  const spot=nearestFreeAdjTile(state,b,u.x,u.y) || {x:b.x,y:b.y};
  issueMoveKeepCmd(state,u,spot.x,spot.y);
  u._toBuild=true; u._buildRepath=1.2;
}

function placeBuilding(state, type, tx, ty, builder){
  const d=DEF[type];
  const ctrl = (builder && builder.ctrl) || state._defaultCtrl || 'p1';
  // ZECA Mass Fabrication window: the next few buildings are FREE + INSTANT for the activating player.
  const ff=state._fabFree;
  const fab = !!(ff && ff.n>0 && state.time<ff.until && (ff.ctrl||'p1')===ctrl);
  if(!fab) playerEco(state, ctrl).gold -= d.cost;          // normal: charge the building player's pool (waived in the fab window)
  const b = mkBuilding(state,type,'player',tx,ty, fab);     // instant=true during the window → fully built
  b.ctrl = ctrl;                                  // the new building belongs to its placer
  b.paidCost = fab ? 0 : d.cost;                  // remembered for the demolish salvage refund
  if(fab){
    ff.n--;
    recomputeSupply(state);
    if(!window._rbReplaying){ if(typeof spawnRing==='function') spawnRing(b.x,b.y,'#ffd86b'); if(typeof spawnExplosion==='function') spawnExplosion(b.x,b.y); }
    toast('⚡ Fabricated instantly');
  } else {
    b.hp=1;
    assignBuild(state, builder, b);     // robust approach + re-pathing
    recomputeSupply(state);
    toast('Construction started');
  }
}

/* =====================================================================
   UPDATE LOOP
   ===================================================================== */
// Only explicitly flagged anti-air units can target flyers.
function canHitAir(e){ const d=DEF[e.type]||{}; return !!d.antiAir; }
// Two entities are enemies if they belong to different sides — OR if either has gone feral. A
// "mad dog" (MADOSIS) stays owner:'player' so it keeps its roster identity for rescue, but reads as
// hostile to, and targetable by, EVERYONE. Drives all targeting / splash / retaliation checks.
function isHostile(a,b){
  if(!a||!b||a===b) return false;
  if(a.madDog||b.madDog) return true;
  // T4-5 duel: in a PvP match the two FOUNDERS are hostile — split by controller, not owner.
  // Reads serialized state (G._pvp), so host/rollback replay identically.
  if(typeof G!=='undefined' && G && G._pvp && a.owner==='player' && b.owner==='player')
    return (a.ctrl||'p1')!==(b.ctrl||'p1');
  return a.owner!==b.owner;
}
function nearestEnemy(state, e, radius){
  if(state.hub) return null;   // the H.U.B. is a safe zone — nothing auto-acquires (the neutral Wake/HQ rooftop gun reads strolling vets as 'hostile' otherwise)
  let best=null,bd=radius*radius; const air=canHitAir(e);
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner==null||o._untargetable||!isHostile(e,o)) continue;   // _untargetable: the ninja while smoke-bombed
    if(o.owner!=='player'&&o.owner!=='enemy') continue;
    if(o.air && !air) continue;                 // melee/no-AA units ignore flyers
    const dx=o.x-e.x,dy=o.y-e.y,d=dx*dx+dy*dy;
    if(d<bd){bd=d;best=o;}
  }
  return best;
}
// apply a hit with optional area splash to nearby enemies of the same target
function applyHit(state, attacker, target, dmg, splash, splashR){
  damage(state, target, dmg, attacker);
  if(splash){ const R=(splashR||1.3)*TILE;
    for(const o of state.entities){ if(o.dead||o===target||o.owner==null||!isHostile(attacker,o)) continue;
      if(o.storedIn) continue;
      if(o.owner!=='player'&&o.owner!=='enemy') continue;
      if(o.air && !target.air) continue;        // ground splash doesn't hit flyers and vice-versa
      if(!o.air && target.air) continue;
      if(dist(o,target)<=R) damage(state,o,splash,attacker); }
  }
}
function nearestDeposit(state, e){
  let best=null,bd=1e18;
  for(const o of state.entities){
    if(o.dead||o.owner!==e.owner) continue;
    if(o.kind!=='building'||o.constructing) continue;
    if(o.type!=='hq' && !DEF[o.type].deposit) continue;   // HQ or any drop-off building (Satellite Office)
    const dx=o.x-e.x,dy=o.y-e.y,d=dx*dx+dy*dy; if(d<bd){bd=d;best=o;}
  }
  return best;
}

function entRadius(e){ return e.kind==='building' ? Math.max(e.w,e.h)*TILE*0.5 : (e.r||10); }

function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }

// Distance from a point (unit center) to a building's footprint rectangle (0 if inside).
// Used for "am I at the site?" checks so any adjacent tile — corner OR edge — counts,
// independent of building size. (Distance-to-center mis-judged corners of 3×3+ footprints.)
function distToFootprint(u, b){
  const x0=b.tx*TILE, y0=b.ty*TILE, x1=(b.tx+b.w)*TILE, y1=(b.ty+b.h)*TILE;
  const cx=Math.max(x0, Math.min(u.x, x1));
  const cy=Math.max(y0, Math.min(u.y, y1));
  return Math.hypot(u.x-cx, u.y-cy);
}


function spawnTrained(state,b,type){
  // spawn near building, send to rally
  let sx=b.tx+b.w, sy=b.ty+b.h-1;
  // find free tile around
  outer:
  for(let r=1;r<=4;r++) for(let y=-r;y<=r;y++) for(let x=-r;x<=r;x++){
    const tx=b.tx+x+ (x>=0?b.w:0), ty=b.ty+y;
  }
  let placed=null;
  for(let r=0;r<=5&&!placed;r++){
    for(let a=0;a<8;a++){
      const tx=Math.round(b.tx+b.w/2 + Math.cos(a/8*6.28)*(r+1));
      const ty=Math.round(b.ty+b.h/2 + Math.sin(a/8*6.28)*(r+1));
      if(tx>=0&&ty>=0&&tx<state.W&&ty<state.H&&!state.blocked[ty*state.W+tx]){ placed=[tx,ty]; break; }
    }
  }
  if(!placed) placed=[b.tx,b.ty+b.h];
  const u=mkUnit(state,type,b.owner,placed[0],placed[1]);  // mkUnit already pushes to entities
  if(b.owner==='player') u.ctrl = b.ctrl || 'p1';          // trained units inherit the producing player's tag
  if(b.owner==='player' && typeof questNotifyTrained==='function') questNotifyTrained(state, type);   // quests: trainUnits progress (the one hook — not derivable from state)
  if(b.rally){ if(b.owner==='player'){ issueMove(state,u,b.rally.x,b.rally.y,{type:'amove',x:b.rally.x,y:b.rally.y}); } }
  if(b.owner==='player' && !window._rbReplaying && typeof SFX!=='undefined') SFX.train();   // T0-3: train-ready cue
  if(b.owner==='enemy' && DEF[type] && DEF[type].air && !window._rbReplaying
     && typeof TUTORIAL!=='undefined' && TUTORIAL.fireContextual) TUTORIAL.fireContextual('antiair-needed', state);   // T2-6: teach anti-air the moment enemy air exists
  recomputeSupply(state);
}

function updateUnit(state,u,dt){
  if(u.captive){ u._actState=null; u.vx=0; u.vy=0; u.path=null; return; }   // imprisoned: stands inert until freed
  if(u.abilCd>0) u.abilCd=Math.max(0, u.abilCd-dt);     // T2-2: manual-ability cooldown (sim state; legacy saves → undefined = ready)
  if(u.heroAbilCd>0) u.heroAbilCd=Math.max(0, u.heroAbilCd-dt);   // Arc-3: hero second-ability cooldown (Rust RECALL); legacy/undefined = ready
  if(u.sigCd>0) u.sigCd=Math.max(0, u.sigCd-dt);        // hero SIGNATURE ability cooldown (cyberware); legacy/undefined = ready
  if(u._sigStomp){ stepSigStomp(state,u,dt); return; }  // Rust thruster-stomp owns these ticks (no walk/fire while leaping)
  if(u._cloakUntil && state.time>=u._cloakUntil){ u._cloakUntil=0; u._cloaked=false; u._untargetable=false;   // Nino cloak expired → visible + targetable again
    if(!window._rbReplaying && typeof spawnRing==='function') spawnRing(u.x,u.y,'#9d4edd'); }
  if(u._dashT>0) u._dashT=Math.max(0, u._dashT-dt);     // Caffeine Dash burst window
  // NINJA-AI villains (THE SEVERANCIER et al.): movement+combat are fully owned by updateNinja (runs later this tick). Yield here so
  // normal auto-acquire/melee-camp never touches it. Flee (low HP) drops back to the standard move handler.
  if(u._ninjaAI && !u._fleeing) return;
  // REX: while it's mid jump-stomp it must not walk or fire — updateMech owns those ticks.
  if(u._mechAirborne) return;
  let cmd=u.cmd;
  const def=DEF[u.type];
  u._actState=null;   // set to 'attack' / 'mine' / 'heal' below (drives action sprites)
  // clear stale targeting: a finished fight (dead target) must not leave a lingering
  // attack-cmd, or the unit sits idle and never re-acquires or retaliates.
  if(u.autoTarget && u.autoTarget.dead) u.autoTarget=null;
  if(cmd && cmd.type==='attack' && (!cmd.target || cmd.target.dead)){ cmd=u.cmd=null; u.state='idle'; }

  // ---- MADOSIS episode: progressively disobey, then go feral (subdued = pacified escort) ----
  let madBalk=false;
  if(u.subdued){ u.autoTarget=null; if(cmd && cmd.type==='attack'){ cmd=u.cmd=null; } }
  else if(u.madDog){ cmd=u.cmd=null; }   // feral: deaf to all orders; hostile auto-acquire drives it
  else if(u.madEpisode && u.madEpisode.phase==='defiance'){
    const ep=u.madEpisode, dz=MADOSIS.defianceIgnore;
    const p=dz[0]+(dz[1]-dz[0])*Math.min(1, ep.t/MADOSIS.defianceDur);
    if(simRandom(state)<p){ cmd=u.cmd=null; u.autoTarget=null; madBalk=true; }   // balks this tick
  }

  // ---- MADOSIS rescue: a healer escorting through the dog's memories (memory-anchors mini-game) ----
  if(cmd && cmd.type==='rescue' && typeof madRescueTick==='function'){
    if(madRescueTick(state, u, dt)) return;   // handled this frame; an invalid rescue falls through
    cmd=u.cmd;                                 // madRescueTick may have cleared the cmd
  }

  // ---- siege deploy (Auditor): auto when enemies near & not moving, or MANUALLY LOCKED via the
  // ability button (T2-2). A move order always breaks siege (and drops the manual lock).
  if(def.siege){
    const sg=def.siege;
    const moving = cmd && (cmd.type==='move'||cmd.type==='hold'); // move or Stop/hold breaks siege
    const _siegeOn=()=>{ if(!window._rbReplaying){ if(typeof SFX!=='undefined') SFX.siege();
      if(u.owner==='player' && typeof ACH!=='undefined') ACH.fire('siege');   // T3-5
      if(u.owner==='player' && typeof TUTORIAL!=='undefined' && TUTORIAL.fireContextual) TUTORIAL.fireContextual('auditor-siege', state); } };
    if(u._siegeLock){
      if(moving){ u._siegeLock=false; u.sieged=false; u._setupT=0; }
      else if(!u.sieged){ u._setupT=(u._setupT||0)+dt;
        if(u._setupT>=sg.setup){ _siegeOn(); u.sieged=true; } }
    } else {
      const foe = nearestEnemy(state,u, sg.range*TILE);
      if(foe && !moving){ u._setupT=(u._setupT||0)+dt;
        if(u._setupT>=sg.setup){ if(!u.sieged) _siegeOn(); u.sieged=true; } }
      else { u._setupT=0; u.sieged=false; }
    }
  }

  // ---- explicit focus-heal (player commanded this healer onto a specific ally) ----
  // STICKY PRIORITY (T1-4): the locked target stays top priority while wounded, but when it's
  // FULL the healer keeps the lock and tops off others (auto-heal below also accepts a 'healunit'
  // cmd) instead of fully reverting. A dead/gone target still clears the lock.
  if(def.heal && cmd && cmd.type==='healunit'){
    const t=cmd.target;
    if(!t || t.dead){ cmd=u.cmd=null; u._toHeal=false; }
    else if(t.hp>=t.maxHp){ u._toHeal=false; /* lock kept; fall through to triage and top off others */ }
    else {
      u._healTarget=t;
      const reach=u.range*TILE+entRadius(t);
      if(dist(u,t)<=reach){ u.path=null; faceTo(u,t); u._actState='heal'; u._face=t.x<u.x?-1:1;
        const m=healMul(u), before=t.hp;
        t.hp=Math.min(t.maxHp, before + def.heal*m*dt);
        const restored=t.hp-before;
        if(restored>0 && !window._rbReplaying && typeof spawnFloater==='function') spawnFloater(state,t,restored,'heal');
        if(u.hero && restored>0) gainHealXp(u, restored/m, state); }
      else { if(!u._toHeal||(u._healRepath||0)<=0){ issueMoveKeepCmd(state,u,t.x,t.y); u._toHeal=true; u._healRepath=0.5; } u._healRepath-=dt; followPath(state,u,dt); }
      return;
    }
  }

  // ---- auto-heal (Recruiter / Drugztore Delivery Drone): TRIAGE, not nearest (T1-4) ----
  // Score = missing-HP fraction, weighted up for veterans (stars) and heroes; distance only breaks
  // ties. Deterministic (no RNG) so host/rollback replay identically. A small hysteresis keeps the
  // current patient unless someone is clearly more urgent — no flip-flopping between equal wounds.
  // (a sprinting healer ignores wounded allies and keeps running with the squad)
  if(def.heal && !u.sprinting){
    if(!cmd || cmd.type==='amove' || cmd.type==='move' || cmd.type==='healunit' || u.state==='idle'){
      const R2=(u.sight*TILE)**2;
      const score=(o)=> (1-o.hp/o.maxHp) * (1 + 0.12*(o.stars||0) + (o.hero?0.5:0));
      let best=null,bs=0,bd=Infinity;
      for(const o of state.entities){ if(o.dead||o.storedIn||o.owner!==u.owner||o.kind!=='unit'||o===u)continue; if(o.hp>=o.maxHp)continue;
        const dx=o.x-u.x,dy=o.y-u.y,dd=dx*dx+dy*dy; if(dd>R2)continue;
        const s=score(o);
        if(s>bs+1e-9 || (Math.abs(s-bs)<=1e-9 && dd<bd)){ bs=s; bd=dd; best=o; } }
      const cur=u._healTarget;
      if(cur && !cur.dead && !cur.storedIn && cur.hp<cur.maxHp && best && best!==cur){
        if(score(best) < score(cur)+0.15) best=cur;   // hysteresis: stay on the current patient
      }
      u._healTarget=best;
    }
    const tgt=u._healTarget;
    if(tgt && !tgt.dead && tgt.hp<tgt.maxHp){
      const reach=u.range*TILE+entRadius(tgt);
      if(dist(u,tgt)<=reach){ u.path=null; faceTo(u,tgt); u._actState='heal'; u._face=tgt.x<u.x?-1:1;
        const m=healMul(u), before=tgt.hp;                            // hero medics (Biba) heal faster & scale with level
        tgt.hp=Math.min(tgt.maxHp, before + def.heal*m*dt);
        const restored=tgt.hp-before;                                 // XP credits BASE output (÷m) so leveling pace stays flat
        if(restored>0 && !window._rbReplaying && typeof spawnFloater==='function') spawnFloater(state,tgt,restored,'heal');
        if(u.hero && restored>0) gainHealXp(u, restored/m, state);
        // story-polish §5.3: Biba quips when she pulls someone back from the brink (<20% → ≥20%)
        if(u.hero && u.heroId==='Biba' && restored>0 && tgt.maxHp>0 && (before/tgt.maxHp)<0.20 && (tgt.hp/tgt.maxHp)>=0.20
           && typeof sayHeroEvent==='function') sayHeroEvent('heal','Biba'); }
      else { if(!u._toHeal||(u._healRepath||0)<=0){ issueMoveKeepCmd(state,u,tgt.x,tgt.y); u._toHeal=true; u._healRepath=0.5; } u._healRepath-=dt; followPath(state,u,dt); }
      return;
    } else u._toHeal=false;   // nothing to heal → fall through to move/idle (healers don't fight)
  }

  // ---- auto-channel (Mindfulness Facilitator): TEMPORARY madosis relief, ONE ally at a time ----
  // Lowers a frayed ally's EFFECTIVE madosis by MADOSIS.fieldRelief.ratePerTick of its value-at-
  // engagement-start every tickSec, up to `frac` of it, then releases and moves to the next un-relieved
  // ally. Writes a transient buff (madRelief/madReliefT) — the TRUE madosis stat is untouched, so the
  // relief wears off (madGlobalTick) and is lost on extraction. Missions only; host/solo (this path is).
  if(def.madHeal && !u.sprinting && !state.hub){
    const FR=(typeof MADOSIS!=='undefined'&&MADOSIS.fieldRelief)||{};
    const frac=FR.frac||0.30, tickSec=FR.tickSec||2, ratePerTick=FR.ratePerTick||0.01, dur=FR.durationSec||300;
    const eff=(o)=> (typeof madEffective==='function')?madEffective(o):(o.madosis||0);
    const capLeft=()=> (u._madHealBase||0)*frac - (u._madHealAdded||0);
    // a player can DIRECT the channel: right-clicking an ally issues a 'healunit' cmd (input → commandUnits).
    // An explicit, still-frayed target OVERRIDES auto-acquire (and bypasses the "already calmed" skip, so a
    // commanded unit can be tended continuously down toward calm); a fully-calm or gone target drops the
    // order and reverts to auto-triage.
    const forced = (cmd && cmd.type==='healunit' && cmd.target && !cmd.target.dead && !cmd.target.storedIn
                    && cmd.target.owner===u.owner && cmd.target!==u && eff(cmd.target)>1e-4) ? cmd.target : null;
    if(cmd && cmd.type==='healunit' && !forced) cmd=u.cmd=null;   // commanded target calmed/gone → release the order
    let t=u._madHealTarget;
    const lockOk = !forced && t && !t.dead && !t.storedIn && t.owner===u.owner && eff(t)>1e-4 && capLeft()>1e-6;
    if(forced && t!==forced){ t=u._madHealTarget=forced; u._madHealBase=eff(forced); u._madHealAdded=0; u._madHealTick=0; }
    else if(!lockOk && !forced){
      // acquire the most-frayed ally NOT already relieved, within sight (deterministic; dist breaks ties)
      u._madHealTarget=null; u._madHealAdded=0; u._madHealBase=0; u._madHealTick=0;
      const R2=(u.sight*TILE)**2; let best=null,bm=0,bd=Infinity;
      for(const o of state.entities){
        if(o.dead||o.storedIn||o.owner!==u.owner||o.kind!=='unit'||o===u) continue;
        if(o.madReliefT>0) continue;                            // already calmed → leave it until it wears off
        const e=eff(o); if(!(e>0)) continue;
        const dx=o.x-u.x,dy=o.y-u.y,dd=dx*dx+dy*dy; if(dd>R2) continue;
        if(e>bm+1e-9 || (Math.abs(e-bm)<=1e-9 && dd<bd)){ bm=e; bd=dd; best=o; } }
      if(best){ t=u._madHealTarget=best; u._madHealBase=bm; u._madHealAdded=0; u._madHealTick=0; }
    }
    t=u._madHealTarget;
    if(t && !t.dead){
      const reach=u.range*TILE+entRadius(t);
      if(dist(u,t)<=reach){
        u.path=null; faceTo(u,t); u._actState='heal'; u._face=t.x<u.x?-1:1;
        u._madHealTick=(u._madHealTick||0)+dt;
        if(u._madHealTick>=tickSec){
          u._madHealTick-=tickSec;
          const room=(t.madosis||0)-(t.madRelief||0);                       // can't suppress below 0 effective
          const add=Math.max(0, Math.min((u._madHealBase||0)*ratePerTick, capLeft(), room));
          if(add>0){ t.madRelief=(t.madRelief||0)+add; t.madReliefT=dur; t._madTendedAt=state.time; u._madHealAdded=(u._madHealAdded||0)+add;
            if(!window._rbReplaying && typeof spawnFloater==='function') spawnFloater(state,t,add,'calm'); }  // visible purple relief tick (merges into one rising −N)
          if(capLeft()<=1e-6 || room-add<=1e-6) u._madHealTarget=null;      // engagement done → release, move on
        }
      } else { if(!u._toHeal||(u._healRepath||0)<=0){ issueMoveKeepCmd(state,u,t.x,t.y); u._toHeal=true; u._healRepath=0.5; } u._healRepath-=dt; followPath(state,u,dt); }
      return;
    } else u._toHeal=false;   // no one to calm → fall through to move/idle (it can't fight)
  }

  // ---- auto-acquire for any combat unit (not workers, not healers) ----
  // (a balking/subdued MADOSIS unit doesn't fight; a feral mad dog DOES — cmd was cleared above)
  // T2-3 stances: 'hold' only acquires what it can hit WITHOUT moving; 'def'/default acquire normally
  // (the chase branch below is where the stances differ). u.stance undefined = legacy aggressive.
  if(def.dmg>0 && u.type!=='worker' && !madBalk && !u.subdued && (!cmd || cmd.type==='amove')){
    const acqR=(u.stance==='hold' ? u.range
               : (def.siege && u.sieged ? def.siege.range : u.sight*0.9))*TILE;
    const aggro = nearestEnemy(state,u,acqR);
    if(aggro){ u.autoTarget=aggro; } else if(u.autoTarget&&u.autoTarget.dead) u.autoTarget=null;
  }
  // turret-like worker defense: workers fight back if adjacent enemy and idle
  if(u.type==='worker' && !cmd){
    const near=nearestEnemy(state,u, u.range*TILE+8);
    if(near) u.autoTarget=near; else u.autoTarget=null;
  }

  // ---- handle attack target (explicit or auto) ----
  let atk = (cmd&&cmd.type==='attack'&&cmd.target&&!cmd.target.dead) ? cmd.target : null;
  if(!atk && u.autoTarget && !u.autoTarget.dead) atk=u.autoTarget;
  // H.U.B. safe zone: no fighting, ever — drop explicit attack orders, retaliation locks and
  // stale targets carried in from a loaded save so units never even play the shoot animation.
  if(state.hub){ u.autoTarget=null; atk=null; if(cmd&&cmd.type==='attack'){ cmd=u.cmd=null; } }
  // SPRINT: ignore the fight entirely. Whatever set a target (auto-acquire, retaliation in
  // damage(), a callToArms rally, or an explicit attack cmd), a sprinting unit drops it and
  // falls through to the move handler — so it keeps running and never fights back.
  if(u.sprinting){ u.autoTarget=null; atk=null; }
  if(atk && atk.air && !canHitAir(u)){ atk=null; u.autoTarget=null; if(cmd&&cmd.type==='attack')u.cmd=null; }  // can't reach flyers
  if(atk && atk._untargetable){ atk=null; u.autoTarget=null; if(cmd&&cmd.type==='attack')u.cmd=null; }          // lost lock — the ninja vanished in smoke

  if(atk){
    // a unit beginning a NEW engagement rallies nearby idle allies to join the fight
    if(u._engagedId!==atk.id){ u._engagedId=atk.id; callToArms(state, atk, u.owner, u); }
    // effective stats (Auditor gains range/dmg/splash while sieged). u.splash overrides def.splash so a
    // villain (base type has none) can splash its BASIC attack too — THE EX-TERMINATOR's every swing is AOE.
    let aRange=u.range, aDmg=u.dmg, aSplash=(u.splash!=null?u.splash:(def.splash||0)), aSplashR=(u.splashR!=null?u.splashR:(def.splashR||1.3));
    if(u.chromeSplash>0){ aSplash += u.chromeSplash; aSplashR=Math.max(aSplashR, u.chromeSplashR||1.3); }   // CYBERWARE: Projectile Launch System gives a basic-attack burst
    if(def.siege && u.sieged){ const sg=def.siege; aRange=sg.range; aDmg=sg.dmg; aSplash=Math.round(sg.dmg*0.6); aSplashR=sg.splashR; }
    const _m = vetDmgMul(u)*(u.hubDmgMul||1)*(typeof vetBuff==='function'?vetBuff(u,state).dmgMul:1)*(typeof madDmgMul==='function'?madDmgMul(u):1)*(u.bossDmgMul||1); aDmg = Math.round(aDmg*_m); aSplash = Math.round(aSplash*_m);  // career-rank + HUB implant + life-event + madosis + boss-phase damage mods
    const reach = aRange*TILE + entRadius(atk);
    const d=dist(u,atk);
    if(d<=reach){
      // in range — stop & attack
      u.path=null;
      if(u.chromeActive && u.chromeActive.trigger!=='hit') chromeActiveProc(state, u);   // CYBERWARE: Sandevistan/Berserk surge on engaging
      faceTo(u,atk);
      u._actState='attack'; u._face = atk.x<u.x?-1:1;
      if(u.cd<=0){
        if(u._focusShot){ aDmg*=2; u._focusShot=false; }   // T2-2 Focus Shot: the buffered double-damage round
        if(u.chromeVsBuilding>1 && atk.kind==='building') aDmg=Math.round(aDmg*u.chromeVsBuilding);   // CYBERWARE: Gorilla Arms wreck structures
        applyHit(state,u,atk,aDmg,aSplash,aSplashR);
        gainXp(u, atk.hp<=0, state);   // career points for the shot / killing blow
        u.cd = u._bossCd || def.cd;   // villains fire at their tuned (phase-aware) cooldown
        u._actStamp = state.time;   // timestamps the strike so the swing/shot frame lands on it
        if(aRange>2) u.shootFx={x:atk.x,y:atk.y,t:SHOOTFX_LIFE};
      }
    } else if(def.siege && u.sieged){
      // rooted while sieged — hold fire until the target re-enters range
    } else if(u.stance==='hold' && !(cmd && cmd.type==='attack')){
      // T2-3 HOLD: never chase an auto-acquired/retaliation target — stand fast, shoot what arrives.
      // (an EXPLICIT attack order still moves; Stop/hold-position is about auto-behavior)
      if(u.autoTarget && dist(u,u.autoTarget) > reach) u.autoTarget=null;
    } else if(u.stance==='def' && !(cmd && cmd.type==='attack') && d > u.sight*TILE){
      // T2-3 DEFENSIVE: chase, but break off once the target flees beyond sight — clean disengage.
      u.autoTarget=null; u._reTarget=null; u._engagedId=null;
    } else {
      // chase
      if(!u.path || u._reTarget!==atk.id || (u._chaseTimer||0)<=0){
        issueMoveKeepCmd(state,u,atk.x,atk.y); u._reTarget=atk.id; u._chaseTimer=0.5;
      }
      u._chaseTimer-=dt;
      followPath(state,u,dt);
    }
    return;
  } else { u._reTarget=null; u._engagedId=null; }

  // ---- gather ----
  if(cmd&&cmd.type==='gather'){
    const mine=cmd.mine;
    if(!mine||mine.dead||mine.amount<=0){
      // find another mine
      const m=nearestMine(state,u); if(m){ cmd.mine=m; } else { u.cmd=null; u.state='idle'; }
      return;
    }
    if(u.carrying>=14){
      // return to deposit
      const dep=nearestDeposit(state,u);
      if(!dep){ u.state='idle'; return; }
      const reach=entRadius(dep)+14;
      if(dist(u,dep)<=reach){
        const eco=playerEco(state, u.ctrl); eco.gold += u.carrying; eco.gold_collected += u.carrying; u.carrying=0;
        u.path=null;
      } else {
        if(!u._toDep){ issueMoveKeepCmd(state,u,dep.x,dep.y); u._toDep=true; u._toMine=false; }
        followPath(state,u,dt);
      }
    } else {
      const reach=entRadius(mine)+14;
      if(dist(u,mine)<=reach){
        u.path=null; u.gatherTimer+=dt;
        u._actState='mine'; u._face = mine.x<u.x?-1:1;
        if(u.gatherTimer>=0.55){ const take=Math.min(3,mine.amount); mine.amount-=take; u.carrying+=take; u.gatherTimer=0; }
        u._toMine=false;
      } else {
        if(!u._toMine){ issueMoveKeepCmd(state,u,mine.x,mine.y); u._toMine=true; u._toDep=false; }
        followPath(state,u,dt);
      }
    }
    return;
  }

  // ---- build ----
  if(cmd&&cmd.type==='build'){
    const b=cmd.building;
    if(!b||b.dead){ u.cmd=null; u.state='idle'; u._toBuild=false; return; }
    if(!b.constructing){ u.cmd=null; u.state='idle'; u._toBuild=false; return; }
    // generous reach: any adjacent tile (incl. diagonal corners) counts as "at the site".
    // Measured to the footprint EDGE, not the center — a corner tile of a 3×3+ footprint sits
    // beyond a center-based radius, which left the intern parked just out of reach, re-pathing to
    // the same corner forever (progress bar never filled until the player moved it). Size-independent.
    const reach = TILE*1.0;
    if(distToFootprint(u,b)<=reach){
      u.path=null; u._toBuild=false;
      // progressive crew speed: 1st intern = 100%, each extra intern adds +ASSIST_BUILD_RATE
      if(b._buildStamp !== state.time){ b._buildStamp = state.time; b._crew = 0; }
      b._crew++;
      b.buildProg += dt * (b._crew === 1 ? 1 : ASSIST_BUILD_RATE);
      b.hp = Math.min(b.maxHp, (b.buildProg/b.buildTime)*b.maxHp);
      if(b.buildProg>=b.buildTime){ b.constructing=false; b.hp=b.maxHp; u.cmd=null; u.state='idle';
        if(!window._rbReplaying && typeof SFX!=='undefined') SFX.built();   // T0-3: build-complete cue
        recomputeSupply(state); toast(DEF[b.type].name+' complete'); refreshUI(); }
    } else {
      // (re)path to the nearest reachable tile next to the site; re-path on a
      // timer or if the path ran out short — never sit stuck beyond reach.
      if(!u._toBuild || (u._buildRepath||0)<=0 || !u.path){
        const spot=nearestFreeAdjTile(state,b,u.x,u.y) || {x:b.x,y:b.y};
        issueMoveKeepCmd(state,u,spot.x,spot.y);
        u._toBuild=true; u._buildRepath=1.2;
      }
      u._buildRepath-=dt;
      followPath(state,u,dt);
    }
    return;
  }

  // ---- plain move / amove ----
  if(cmd&&(cmd.type==='move'||cmd.type==='amove')){
    if(followPath(state,u,dt)){ u.cmd=null; u.state='idle'; }
    return;
  }
  if(cmd&&cmd.type==='enterhq'){
    const hq=cmd.hq;
    if(!hq||hq.dead){ u.cmd=null; u.state='idle'; return; }
    const arrived = followPath(state,u,dt) || dist(u,hq) < entRadius(hq)+18;
    if(arrived) storeUnitInHq(state,u,hq);
    return;
  }
  if(cmd&&cmd.type==='hubpoi'){
    if(followPath(state,u,dt)){
      const poi=cmd.poi;
      u.cmd=null; u.state='idle';
      if(poi && !poi.dead && typeof hubUnitArrivedPoi==='function') hubUnitArrivedPoi(state,u,poi);
    }
    return;
  }
  u.state='idle';
}

function issueMoveKeepCmd(state,u,wx,wy){
  const savedCmd=u.cmd;
  issueMove(state,u,wx,wy);
  u.cmd=savedCmd;
}

function nearestMine(state,u){
  let best=null,bd=1e18;
  for(const o of state.entities){ if(o.dead||o.type!=='goldmine'||o.amount<=0)continue;
    const d=(o.x-u.x)**2+(o.y-u.y)**2; if(d<bd){bd=d;best=o;} } return best;
}

function faceTo(u,t){ u.dir=Math.atan2(t.y-u.y,t.x-u.x); }

// returns true when arrived
function followPath(state,u,dt){
  // Sprint accelerates the run a little (up to SPRINT_MAX_BONUS over base) while active.
  // Caffeine Dash (T2-2 ability) stacks its own short burst on top. A healer on the MADOSIS
  // rescue command hustles (urgency — and it offsets the far-flung memory echoes).
  const sm=((u.sprinting && state.sprint && state.sprint.active) ? state.sprint.mul : 1) * ((u._dashT||0)>0 ? 1.7 : 1)
          * ((u.cmd && u.cmd.type==='rescue' && MADOSIS.rescueSpeedMul) ? MADOSIS.rescueSpeedMul : 1);
  if(!u.path){
    if(u.dest){ // direct
      const dx=u.dest.x-u.x, dy=u.dest.y-u.y, d=Math.hypot(dx,dy);
      if(d<4){ u.dest=null; return true; }
      const sp=u.speed*TILE*dt*sm; u.x+=dx/d*Math.min(sp,d); u.y+=dy/d*Math.min(sp,d); u.dir=Math.atan2(dy,dx);
      return false;
    }
    return true;
  }
  const node=u.path[u.pathIdx];
  if(!node){ u.path=null; return true; }
  const tx=node[0]*TILE+TILE/2, ty=node[1]*TILE+TILE/2;
  const dx=tx-u.x, dy=ty-u.y, d=Math.hypot(dx,dy);
  const sp=u.speed*TILE*dt*sm;
  if(d<6){
    u.pathIdx++;
    if(u.pathIdx>=u.path.length){ u.path=null;
      // final approach to dest
      if(u.dest){ const ddx=u.dest.x-u.x,ddy=u.dest.y-u.y,dd=Math.hypot(ddx,ddy);
        if(dd>4){ u.x+=ddx/dd*Math.min(sp,dd); u.y+=ddy/dd*Math.min(sp,dd);} }
      return true;
    }
  } else {
    u.x+=dx/d*Math.min(sp,d); u.y+=dy/d*Math.min(sp,d); u.dir=Math.atan2(dy,dx);
  }
  return false;
}

const SEP_STRENGTH = 0.68;
const SEP_MAX_STEP = TILE*4.2;   // px/sec cap: settles crowds without jittering combat lines

function sepFoot(u){
  const h = (typeof unitDrawH==='function') ? unitDrawH(u) : ((u.r||10)*2);
  const alt = u.air ? 16 : 0;
  return {
    x:u.x,
    y:u.y - alt + h*0.3,
    rx:Math.max((u.r||10)+6, h*0.31),
    ry:Math.max((u.r||10)+3, h*0.18),
  };
}
function sepMobility(u){
  if(u.captive) return 0.25;
  if(!u.cmd && !u.autoTarget) return 1.0;
  const t=u.cmd&&u.cmd.type;
  if(t==='move'||t==='amove'||t==='extract'||t==='enterhq'||t==='hubpoi') return 0.9;
  return 0.45;
}
function sepPushAllowed(state,u,x,y){
  if(u.air) return true;
  const tx=Math.floor(x/TILE), ty=Math.floor(y/TILE);
  return tx>=0&&ty>=0&&tx<state.W&&ty<state.H&&!state.blocked[ty*state.W+tx];
}
function applySeparationPush(state,u,dx,dy,dt){
  const m=Math.hypot(dx,dy);
  if(m<0.01) return;
  const max=Math.max(0.5, SEP_MAX_STEP*dt);
  if(m>max){ dx=dx/m*max; dy=dy/m*max; }
  const nx=u.x+dx, ny=u.y+dy;
  if(sepPushAllowed(state,u,nx,ny)){ u.x=nx; u.y=ny; return; }
  if(Math.abs(dx)>0.01 && sepPushAllowed(state,u,u.x+dx,u.y)){ u.x+=dx; return; }
  if(Math.abs(dy)>0.01 && sepPushAllowed(state,u,u.x,u.y+dy)){ u.y+=dy; }
}

function separation(state,dt){
  const list=state.entities.filter(e=>e.kind==='unit'&&!e.dead&&!e.storedIn);
  const sep=list.map((u,i)=>({ u, i, f:sepFoot(u), m:sepMobility(u), sx:0, sy:0 }));
  for(let i=0;i<sep.length;i++){
    const a=sep[i];
    for(let j=i+1;j<sep.length;j++){
      const b=sep[j];
      let dx=b.f.x-a.f.x, dy=b.f.y-a.f.y;
      let d=Math.hypot(dx,dy);
      if(d<0.01){
        const seed=(a.u.id||a.i+1)*12.9898 + (b.u.id||b.i+1)*78.233;
        dx=Math.cos(seed); dy=Math.sin(seed); d=1;
      }
      const ux=dx/d, uy=dy/d;
      const rx=(a.f.rx+b.f.rx)*0.92, ry=(a.f.ry+b.f.ry)*1.02;
      const boundary=1/Math.sqrt((ux*ux)/(rx*rx) + (uy*uy)/(ry*ry));
      const overlap=boundary-d;
      if(overlap<=0) continue;
      const push=overlap*SEP_STRENGTH;
      const total=a.m+b.m || 1;
      const am=push*(a.m/total), bm=push*(b.m/total);
      a.sx-=ux*am; a.sy-=uy*am;
      b.sx+=ux*bm; b.sy+=uy*bm;
    }
  }
  for(const p of sep) applySeparationPush(state,p.u,p.sx,p.sy,dt);
  // keep units out of blocked tiles (flyers are exempt — they ignore terrain)
  for(const a of list){
    if(a.air) continue;
    const tx=(a.x/TILE)|0, ty=(a.y/TILE)|0;
    if(tx>=0&&ty>=0&&tx<state.W&&ty<state.H&&state.blocked[ty*state.W+tx]){
      // push to nearest open neighbor
      let bx=a.x,by=a.y,found=false;
      for(let r=1;r<=3&&!found;r++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
        const nx=tx+x,ny=ty+y; if(nx<0||ny<0||nx>=state.W||ny>=state.H)continue;
        if(!state.blocked[ny*state.W+nx]){ bx=nx*TILE+TILE/2; by=ny*TILE+TILE/2; found=true; break; }
      }
      a.x=bx; a.y=by;
    }
  }
}

/* =====================================================================
   STUCK RESOLUTION
   Units path on the static terrain grid and ignore each other, so a
   stationary unit sitting on a route can physically pin a moving unit in
   place forever (separation just jitters it). Detect a unit that is failing
   to make progress toward its current target and nudge the blocker aside.
   ===================================================================== */
function currentTargetPoint(u){
  if(u.path && u.pathIdx < u.path.length){ const n=u.path[u.pathIdx]; return {x:n[0]*TILE+TILE/2, y:n[1]*TILE+TILE/2}; }
  if(u.dest) return {x:u.dest.x, y:u.dest.y};
  return null;
}
// A unit that may be told to step aside: idle, or one that has basically
// reached its own move destination and is just loitering. Busy units
// (gathering / building / attacking / still travelling) are left alone.
function yieldable(o){
  if(!o.cmd) return true;
  if(o.cmd.type==='move' || o.cmd.type==='amove'){
    if(o.cmd.x!=null && Math.hypot(o.cmd.x-o.x, o.cmd.y-o.y) < TILE*1.5) return true;
  }
  return false;
}
function shoveAside(state, b, fromX, fromY){
  // push the blocker away from the stuck unit; try straight-away first, then the
  // two perpendiculars, picking the first that lands on a passable tile.
  let ax=b.x-fromX, ay=b.y-fromY; const al=Math.hypot(ax,ay)||1; ax/=al; ay/=al;
  const dirs=[[ax,ay],[-ay,ax],[ay,-ax],[-ax,-ay]];
  for(const [dx,dy] of dirs){
    const wx=b.x+dx*TILE*1.4, wy=b.y+dy*TILE*1.4;
    const tx=(wx/TILE)|0, ty=(wy/TILE)|0;
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) continue;
    if(state.blocked[ty*state.W+tx]) continue;
    b._toMine=false; b._toDep=false; b._stuckT=0; b._lastTargD=undefined;
    b.path=null; b.pathIdx=0;
    b.dest={x:tx*TILE+TILE/2, y:ty*TILE+TILE/2};
    b.cmd={type:'move', x:b.dest.x, y:b.dest.y};
    b.state='move';
    return true;
  }
  return false;
}
function handleStuck(state, u){
  const tp=currentTargetPoint(u); if(!tp) return;
  let fx=tp.x-u.x, fy=tp.y-u.y; const fl=Math.hypot(fx,fy)||1; fx/=fl; fy/=fl;
  // find the best yieldable, same-side blocker roughly in front of the stuck unit
  let blocker=null, best=-1;
  for(const o of state.entities){
    if(o===u || o.dead || o.storedIn || o.kind!=='unit' || o.owner!==u.owner) continue;
    const dx=o.x-u.x, dy=o.y-u.y; const dist=Math.hypot(dx,dy);
    if(dist > u.r+o.r+10) continue;
    const fwd = dist>0.01 ? (dx*fx+dy*fy)/dist : 1;   // 1 = directly ahead
    if(fwd < 0.25) continue;                           // must be in our way, not beside/behind
    if(!yieldable(o)) continue;
    const score = fwd - dist/200;
    if(score>best){ best=score; blocker=o; }
  }
  if(blocker && shoveAside(state, blocker, u.x, u.y)) return;
  // nobody to shove — try slipping past the contested waypoint
  if(u.path && u.pathIdx < u.path.length-1){ u.pathIdx++; return; }
  // last resort: if we're essentially at the destination, just finish the move
  if(u.dest){
    const dd=Math.hypot(u.dest.x-u.x, u.dest.y-u.y);
    if(dd < TILE*1.3){
      u.path=null; u.dest=null;
      if(u.cmd && (u.cmd.type==='move'||u.cmd.type==='amove')){ u.cmd=null; u.state='idle'; }
    }
  }
}
function resolveStuck(state, dt){
  for(const u of state.entities){
    if(u.dead || u.storedIn || u.kind!=='unit') continue;
    const moving = (u.path && u.pathIdx<u.path.length) || !!u.dest;
    if(!moving){ u._stuckT=0; u._lastTargD=undefined; continue; }
    const tp=currentTargetPoint(u); if(!tp){ u._stuckT=0; continue; }
    const d=Math.hypot(tp.x-u.x, tp.y-u.y);
    // progress check: did we get meaningfully closer this frame?
    const want=u.speed*TILE*dt*0.3;
    if(u._lastTargD!==undefined && (u._lastTargD - d) < want) u._stuckT=(u._stuckT||0)+dt;
    else u._stuckT=Math.max(0,(u._stuckT||0)-dt*1.5);
    u._lastTargD=d;
    if(u._stuckT > 0.4){ handleStuck(state,u); u._stuckT=0; u._lastTargD=undefined; }
  }
}

// Pull nearby idle, combat-capable allies of `side` onto `foe` (assist / focus-fire).
// Skips units on an explicit player order (move/gather/build) or already fighting.
function callToArms(state, foe, side, from){
  if(!foe||foe.dead) return;
  const R=7*TILE, r2=R*R, cx=from.x, cy=from.y;
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.kind!=='unit'||o.owner!==side||o===from) continue;
    if(!isHostile(o, foe)) continue;                                        // never rally onto a non-hostile (MADOSIS-safe)
    if(o.sprinting) continue;                                               // sprinting allies stay on the run
    if(o.type==='worker' || !(DEF[o.type].dmg>0)) continue;                 // combat units only
    if(o.cmd && (o.cmd.type==='move'||o.cmd.type==='gather'||o.cmd.type==='build')) continue; // respect explicit orders
    if((o.cmd&&o.cmd.type==='attack'&&o.cmd.target&&!o.cmd.target.dead) || (o.autoTarget&&!o.autoTarget.dead)) continue; // busy fighting
    if(foe.air && !canHitAir(o)) continue;
    const dx=o.x-cx, dy=o.y-cy; if(dx*dx+dy*dy>r2) continue;
    o.autoTarget=foe;
  }
}

// CYBERWARE OS actives (one-of slot): an auto-proc combat surge. Sandevistan/Berserk fire when the unit
// engages; Kerenzikov fires when the unit is hit. Sets the timed u.buff the damage chain already reads via
// vetBuff (units.js ~:928). Deterministic (state.time only, no RNG; no cosmetic FX) → rollback/co-op safe.
function chromeActiveProc(state, u){
  const a=u.chromeActive; if(!a || !state) return;
  const now=state.time;
  if((u._chromeActCd||0) > now) return;                       // on cooldown
  if(u.buff && u.buff.until>now && !u.buff._chrome) return;    // never stomp an active life-event buff
  const dur=a.dur||3, cd=a.cd||20;
  u.buff={ dmgMul:1+(a.dmgMul||0), regenMul:(u.buff?u.buff.regenMul:1)||1, until:now+dur, _chrome:true };
  u._chromeActCd=now+cd;
  if(a.dmgResist){ u._chromeResist=a.dmgResist; u._chromeResistUntil=now+dur; }   // Berserk damage-resistance window
}

function damage(state, t, amt, src){
  if(state.hub) return;   // the H.U.B. is a safe zone — no entity (building, vet, NPC) ever loses HP there

  if(t.dead||t.storedIn) return;
  if(t._godmode) return;   // sandbox god-mode (localhost test tool): ignore all incoming damage (flag set only by js/sandbox.js)
  if(t.captive) return;   // imprisoned captives (Biba + the intern) are invulnerable until Nino frees them — neither friendly fire nor splash can kill them
  if(t.scenery) return;   // indestructible backdrop props (the Dark Tower) never take damage — they exist purely as a landmark
  // T2-4 counter axis: DEF-driven armor (vehicles/mechs shrug off a flat % of small-arms) unless the
  // attacker PIERCES. Pure deterministic math — identical on host/solo/rollback. The per-entity
  // dmgReduce below (ninja/bosses, with the expose window) is a separate hand-tuned layer.
  const _tdef=DEF[t.type];
  // armor = DEF base + CYBERWARE subdermal plating (t.chromeArmor); pierce = DEF pierce OR chrome mantis-blades (src.chromePierce)
  const _armor=((_tdef&&_tdef.armor)||0)+(t.chromeArmor||0);
  if(_armor>0 && !(src && ((DEF[src.type]&&DEF[src.type].pierce) || src.chromePierce))) amt *= (1 - _armor);
  if(t.dmgReduce>0){
    let red = t._exposed ? t.dmgReduce*(t._exposeMul||0.4) : t.dmgReduce;   // armored units shrug off a flat %; an EXPOSED ninja/mech (mid-windup or venting) takes the punish-window bonus
    // T2-4: a PIERCING weapon (Lobbyist regulation / Auditor due-diligence cannon) is sold as the anti-mech
    // answer — make it also bite through a BOSS's flat mitigation, so target priority means something.
    // Gated to villains: normal armored enemies are unaffected (their armor is already handled above).
    if(t.villain && src && ((DEF[src.type]&&DEF[src.type].pierce) || src.chromePierce)) red *= 0.5;
    amt *= (1 - red);
  }
  if(t._chromeResist && t._chromeResistUntil>state.time) amt *= (1 - t._chromeResist);                              // CYBERWARE: Berserk damage-resistance window
  if(t.chromeActive && t.chromeActive.trigger==='hit' && typeof chromeActiveProc==='function') chromeActiveProc(state, t);  // CYBERWARE: Kerenzikov reflex spike on taking a hit
  // MADOSIS rescuer survivability: a healer mid-rescue takes a fraction of incoming damage, with a one-time shield pool absorbing the rest first. Keyed off the rescue cmd so it self-clears (inert once the cmd is gone, even if _rescueShield lingers).
  if(t.cmd && t.cmd.type==='rescue' && typeof MADOSIS!=='undefined'){
    if(MADOSIS.rescuerDmgTakenMul!=null) amt *= MADOSIS.rescuerDmgTakenMul;
    if(t._rescueShield>0){ const ab=Math.min(t._rescueShield, amt); t._rescueShield-=ab; amt-=ab; }
  }
  // MADOSIS: don't let a clumsy guarding squad kill the unit being saved — the player's OWN fire on an in-rescue dog is heavily reduced. Enemies (incl. the Kennel) hurt it normally.
  if(t.madDog && t._rescue && src && src.owner==='player' && typeof MADOSIS!=='undefined' && MADOSIS.dogPlayerDmgMul!=null) amt *= MADOSIS.dogPlayerDmgMul;
  t.hp-=amt;
  t.hitFx=0.18;            // T1-2: long enough to actually catch (was 0.12)
  t._lastHit=state.time;   // pauses veteran self-heal (vetRegen) while in/near combat
  // ---- cosmetic combat feedback (T0-4/T1-2): floating number, killing-blow white core,
  // heavy-hitter micro-shake, satirical multi-kill toast. Gated for rollback resim; co-op
  // clients derive theirs from snapshot hp-deltas (sync.js).
  const _killed = t.hp<=0 && (t.hp+amt)>0;
  if(_killed) t._dieFlash=true;   // 1-frame white core on the killing blow (render.js)
  if(_killed && t.madDog && src && src.owner==='player' && typeof ACH!=='undefined' && !window._rbReplaying) ACH.fire('putdown');   // T3-5
  if(!window._rbReplaying){
    if(typeof spawnFloater==='function') spawnFloater(state, t, amt, _killed?'crit':'dmg');
    if(src && (src.type==='founder' || src.type==='bomber' || (src.type==='auditor' && src.sieged))
       && typeof entOnScreen==='function' && entOnScreen(state,t))
      state._shake=Math.max(state._shake||0, _killed?3:1.5);   // alpha-strikers thump (well under REX's 15)
    if(_killed && src && src.owner==='player' && t.owner==='enemy' && typeof toast==='function'){
      const ks=(window._killStreaks||(window._killStreaks={})), now=state.time;
      let s=ks[src.id]; if(!s || (now-s.t)>1.4) s=ks[src.id]={n:0,t:now,fired:0};
      s.n++; s.t=now;
      if(s.n>=6 && s.fired<6){ s.fired=6; toast('📉 MASS RIF — '+s.n+' roles made redundant in one swing'); if(typeof ACH!=='undefined') ACH.fire('rif',{n:s.n}); }
      else if(s.n>=3 && s.fired<3){ s.fired=3; toast('💼 LAYOFF SPREE — '+s.n+' headcount eliminated'); }
    }
  }
  // RETALIATE: any unit attacked by an enemy fights back, unless it's already
  // engaging a live target or busy on an explicit gather/build order. A SPRINTING
  // unit ignores the hit — it neither acquires the attacker nor rallies neighbours.
  if(t.kind==='unit' && src && !src.dead && isHostile(t,src) && !t.sprinting){
    const engaged=(t.cmd&&t.cmd.type==='attack'&&t.cmd.target&&!t.cmd.target.dead) || (t.autoTarget&&!t.autoTarget.dead);
    const onTask = t.cmd && (t.cmd.type==='gather'||t.cmd.type==='build');
    if(!engaged && !onTask && !(src.air && !canHitAir(t))){
      t.autoTarget=src;
      callToArms(state, src, t.owner, t);   // neighbours rush to defend
    }
  }
}

function killEntity(state,e){
  if(typeof hubRecordKill==='function') hubRecordKill(state,e);
  if(e.kind==='building' && e.type==='hq') releaseAllStoredUnits(state,e);
  e.dead=true;
  // death FX (cosmetic): owner-colored burst + shake. Gated so a rollback resim can't re-spawn it;
  // co-op clients fire theirs from snapshot removals (js/net/sync.js), not from local sim.
  if(!window._rbReplaying && typeof deathFx==='function') deathFx(state,e);
  if(!window._rbReplaying && e.kind==='building' && e.type==='hq' && e.owner==='enemy' && typeof ACH!=='undefined') ACH.fire('hq-raze');   // T3-5
  if(!window._rbReplaying && e.kind==='building' && e.type==='hq' && e.owner==='enemy' && typeof toast==='function')
    toast('📉 Rival HQ razed — '+(state.cfg&&state.cfg.enemyName?state.cfg.enemyName:'the competitor')+' has been acquihired.');
  // story-polish §5.3: a watching hero spikes the ball when a rival HQ goes down (cosmetic, throttled)
  if(!window._rbReplaying && e.kind==='building' && e.type==='hq' && e.owner==='enemy' && typeof sayHeroEvent==='function') sayHeroEvent('raze');
  if(e.kind==='building') markBuilding(state,e,false);
  // MADOSIS: a dog that dies mid-rescue drops its memory echoes.
  if(e.kind==='unit' && (e.madDog || e._rescue) && typeof madCleanupEchoes==='function') madCleanupEchoes(state,e);
  // MADOSIS triggers: losing a friend or a building is traumatic for the surviving veterans.
  if(typeof madosisEvent==='function' && e.owner==='player'){
    if(e.kind==='unit' && (e.hero || (typeof isCombatVet==='function' && isCombatVet(e)) ) && (e.stars||0)>=1)
      madosisEvent(state, e.hero ? 'heroDeath' : 'vetDeath', {dead:e});
    else if(e.kind==='building' && !e.constructing && !e._demolished)
      madosisEvent(state, e.type==='hq' ? 'hqLost' : 'buildingLost', {b:e});
  }
}
