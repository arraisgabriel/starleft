/* villains.js — the VILLAINS (BIG BOSSES) runtime.

   A villain is a named, oversized ENEMY unit that owns its own arena map, gates the campaign
   between episodes, and fights with hero-style abilities + HP-based phases. It is a normal
   `kind:'unit'` entity (so it reuses all of updateUnit combat/movement, separation, snapshot
   packing and save serialization) carrying a few boss flags:

     u.villain      true — marks it as a boss (render glow, win condition, AI exclusion)
     u.villainId    key into VILLAINS (stats, colors, abilities, taunts) — present on every client
     u.villainName  display name (boss HP bar / taunts)
     u.bossPhase    1, bumps to 2 at a low-HP threshold (Rex's themed "Madosis")
     u.bossScale    drawn-size multiplier vs a normal sprite (render: unitDrawH)
     u.neonId       glow-map key (VILLAIN_NEON_MAPS, authored later; aura works without it)
     u.bossDmgMul   outgoing-damage multiplier (read at the fire site in units.js)
     u._bossCd      per-instance attack cooldown (read at the fire site in units.js)
     u._fleeing     ninja is sprinting for a map edge to ESCAPE
     u.escaped      reached the edge and left the map (despawned; counts as a "fled" win)
     u.madFlavor    pure visual flag — Rex's phase-2 "Madosis" red-glow shift (NOT real Madosis)

   The real Madosis system (madosis.js) is gated owner==='player' and is never touched here; Rex's
   phase 2 only borrows the THEME. All balance lives in VILLAINS (one file, like MADOSIS/KENNEL).

   Depends on globals: DEF/TILE (config.js), mkUnit (map.js), nearestEnemy/issueMove/applyHit/dist/
   findPath (units.js), spawnRing (render.js), pushDialog (dialogs.js), MAPS/CAMPAIGN (config/hub),
   netRole (state.js). Loaded after units.js so its runtime calls resolve. | STARLEFT */

/* DURABILITY KNOBS (per villain): bosses must stay a real fight across wildly different army sizes.
   - hp          : floor effective HP before scaling (a boss, not a trooper — keep it high)
   - dmgReduce   : flat % of incoming damage shrugged off (damage(), units.js). 0.35 ≈ +54% effective HP
   - hpVpiScale  : extra HP per point of player career power (VPI, balance.js) measured at spawn, so a
                   leveled veteran army faces a proportionately tougher boss. hp *= (1 + vpi*hpVpiScale)
   - dmgVpiScale : same idea for the boss's outgoing damage (gentler)
   Effective HP ≈ hp * (1 + vpi*hpVpiScale) / (1 - dmgReduce). Tune HERE — one file. */
const VILLAINS = {
  cyan_ninja: {
    name:'THE CYAN NINJA',
    base:'soldier',            // Growth Cyborg sprite (melee range fits a ninja); stats overridden below
    spriteType:'soldier',      // visual sheet (a bespoke cyan recolor can replace this later)
    spriteFaction:'player',    // render the CYAN player variant (not enemy-red) so the body's own cyan lights match the glow
    neonId:'cyanNinja', neonColor:'#50e6ff', auraColor:[80,230,255], bossScale:2.1,
    hp:7000, dmg:50, range:1.8, cd:0.42, speed:4.6, sight:11,
    dmgReduce:0.35, hpVpiScale:1/60, dmgVpiScale:1/140,   // ≈ 10.8k effective HP at VPI 0, far more vs a veteran army
    aiKind:'ninja',            // bespoke hit-and-run AI (updateNinja) fully owns movement+combat; updateUnit yields for it
    ninja:{
      dashSpeed:15,            // tiles/sec while gliding a dash hop (fast — reads as a blade streak)
      hopLen:2.3,              // tiles per diagonal hop
      hopGap:0.7,              // pause between hops. ~0.5s makes the dash/bounce cadence ~30% as frequent as
                               // the old 0.06 (period ~0.19s→~0.63s) so he stands still long enough to click + hit.
      lungeRange:2.6,          // tiles — commit to a strike from here; the apex flash-lunges to contact (beats the separation jostle)
      strikeWindup:0.40,       // ROOTED, EXPOSED wind-up before the guaranteed strike (the player's punish window)
      exposeMul:0.4,           // during the wind-up the ninja's dmgReduce is scaled by this (0.35→0.14 → ~+32% incoming)
      evadeHops:3,             // diagonal weave hops away from shooters before vanishing
      safeDist:6,              // tiles — retreat until the nearest shooter is beyond this
      shooterR:5.5,            // tiles — units within this count as "shooting at me" (evade centroid)
      hideDur:1.5,             // smoke-bomb vanish: invisible + untargetable for this long
      hideAlpha:0.16,          // sprite opacity while vanished (render)
      panicRange:1.6,          // tiles — a shooter this close mid-evade triggers an emergency blink
      panicBlink:5,            // tiles — emergency teleport distance
      retargetR:13,            // tiles — target search radius
      escapeAfter:10,          // seconds pinned (unable to vanish into HIDE) before a forced break-out
      escapeDist:11,           // tiles — how far the break-out dash travels (THROUGH the units to open ground)
      escapeSpeed:34,          // tiles/sec for the break-out dash (very fast → slips between the units as a smoke streak)
    },
    fleeHpFrac:0.20, fleeSpeedMul:1.7,
    phases:[ {at:0.50, dmgMul:1.35, cdMul:0.7, speedMul:1.15, tint:[120,235,255]} ],   // cyan enrage at half HP (faster, hits harder)
    taunts:{
      intro:['You burn fast. I burn faster.', 'A duel, then. Try to keep up.'],
      phase:['Quaint. Now I stop holding back.', 'Faster. Always faster.'],
      flee:['Enough. You are not worth the blade.', 'This round goes to you. Not the war.'],
      escaped:['Gone. Like funding in a downturn.'],
      death:['A clean… exit.'],
    },
  },
  // ---- T2-7 mid-tier "lieutenant" duels — the villain framework scales them to roster power
  // (hpVpiScale) for free; both reuse existing AI kinds (ninja hit-and-run / mech area specials).
  ao_enforcer: {
    name:'THE A&O ENFORCER',
    base:'soldier', spriteType:'soldier',
    neonId:'cyanNinja', neonColor:'#7bff5b', auraColor:[120,255,110], bossScale:1.9,   // A&O toxic-green hunter
    hp:4200, dmg:38, range:1.8, cd:0.5, speed:4.2, sight:11,
    dmgReduce:0.28, hpVpiScale:1/70, dmgVpiScale:1/160,
    aiKind:'ninja',
    ninja:{ dashSpeed:13, hopLen:2.1, hopGap:0.8, lungeRange:2.4, strikeWindup:0.45, exposeMul:0.45,
      evadeHops:3, safeDist:6, shooterR:5.5, hideDur:1.3, hideAlpha:0.18, panicRange:1.6, panicBlink:4,
      retargetR:12, escapeAfter:10, escapeDist:10, escapeSpeed:30 },
    fleeHpFrac:0, fleeSpeedMul:1,                       // a hunter doesn't flee — it dies on the job
    phases:[ {at:0.45, dmgMul:1.3, cdMul:0.75, speedMul:1.1, tint:[150,255,110]} ],
    taunts:{
      intro:['The architect is COMPANY PROPERTY. So are you.', 'Recovery order: one healer, dead or compliant.'],
      phase:['Escalating enforcement.', 'Your warranty just expired.'],
      death:['Asset… unrecovered.'],
    },
  },
  tower_guardian: {
    name:'THE DARK TOWER GUARDIAN',
    base:'founder', ao:true,
    neonId:'rex', neonColor:'#b05bff', auraColor:[176,91,255], bossScale:2.6,   // violet lattice-warden
    hp:9000, dmg:55, range:3.6, cd:1.4, speed:1.4, sight:10,
    dmgReduce:0.25, hpVpiScale:1/75, dmgVpiScale:1/170,
    abilities:[
      {k:'stomp', cd:11, range:5.5, dmg:48, waveR:3.0, jumpDur:0.65, capFrac:0.45},
    ],
    phases:[ {at:0.45, dmgMul:1.5, cdMul:0.7, speedMul:1.2, tint:[255,90,200]} ],
    flee:false,
    taunts:{
      intro:['THE TOWER DOES NOT CHANGE HANDS.', 'Trespass logged. Sentence: immediate.'],
      phase:['STRUCTURAL OVERRIDE. NOTHING LEAVES.', 'The lattice hums for blood.'],
      stomp:['FOUNDATION CHECK.', 'Settling the ground dispute.'],
      death:['The tower… stands… without me.'],
    },
  },
  rex: {
    name:'REX',
    base:'founder', ao:true,   // founder mech sprite + the existing A&O _ao green recolor (set map enemyFaction:'ao')
    neonId:'rex', neonColor:'#7bff5b', auraColor:[120,255,90], bossScale:4.0,
    hp:18000, dmg:80, range:4.0, cd:1.3, speed:1.5, sight:10,
    dmgReduce:0.28, hpVpiScale:1/80, dmgVpiScale:1/160,   // ≈ 25k effective HP at VPI 0 — the finale superboss
    // two telegraphed AREA specials (updateMech). capFrac caps EACH blast to a % of a unit's maxHp,
    // so neither move can ever one-shot — they chunk clumped units and force the player to spread out.
    abilities:[
      {k:'missile', cd:8,  range:9,   count:3, dmg:46, splashR:1.9, flight:0.78, spreadTiles:2.2, capFrac:0.40},
      {k:'stomp',   cd:13, range:6.5, dmg:60, waveR:3.4, jumpDur:0.7, capFrac:0.45},
    ],
    phases:[ {at:0.40, dmgMul:1.8, cdMul:0.6, speedMul:1.25, madFlavor:true, tint:[255,70,60]} ],
    flee:false,
    taunts:{
      intro:['LIQUIDATION PROTOCOL ENGAGED.', 'You are an expense. I am the write-off.'],
      phase:['SYSTEMS CRITICAL. OVERCLOCKING.', 'NOW you have my full attention.'],
      missile:['Payload itemized.', 'Incoming invoice.'],
      stomp:['DOWNSIZING.', 'Footprint reduction.'],
      death:['Acquisition… reversed.'],
    },
  },
};

/* ---- spawn (called from newMap, after the enemy bases/guards/captives exist) ---- */
function spawnVillain(state){
  const cfg=state.cfg; if(!cfg || !cfg.villain) return;
  const list = Array.isArray(cfg.villain) ? cfg.villain : [cfg.villain];
  for(const v of list) spawnVillainEntry(state, v);
}
// one villain from a {id,x,y} entry — shared by map load and scripted mid-mission events (T2-8)
function spawnVillainEntry(state, v){
  {
    const def = VILLAINS[v.id]; if(!def || typeof mkUnit!=='function') return;
    const u = mkUnit(state, def.base, 'enemy', v.x, v.y);     // pushed to state.entities; seeds DEF stats
    u.villain=true; u.villainId=v.id; u.villainName=def.name; u.guard=true;   // guard → excluded from waves/prod cap (ai.js)
    u.bossPhase=1; u.bossScale=def.bossScale; u.neonId=def.neonId;
    if(def.spriteType) u.spriteType=def.spriteType;           // render uses spriteType over type
    // scale HP/dmg to the player's carried career power (VPI, computed in newMap before this) so a
    // leveled veteran army faces a proportionately tougher boss — never trivial, never an instant melt.
    const vpi = state._vpi || 0;
    u.maxHp = u.hp = Math.round(def.hp * (1 + vpi*(def.hpVpiScale||0)));
    u.dmg   = Math.round(def.dmg * (1 + vpi*(def.dmgVpiScale||0)));
    if(def.dmgReduce>0) u.dmgReduce = def.dmgReduce;          // flat incoming-damage mitigation (damage(), units.js)
    u.range=def.range; u.speed=def.speed; u.sight=def.sight;
    u._bossCd=def.cd; u.cd=0; u.bossDmgMul=1;
    u.r = Math.round((DEF[def.base].r||12) * def.bossScale * 0.6);   // collision grows sub-linearly (pathing stays sane)
    u._abilCd={};                                            // {blink:0, slam:0}
    if(def.aiKind==='ninja'){ u._ninjaAI=true; u._ninjaState='approach'; u._zig=1; u._exposeMul=(def.ninja&&def.ninja.exposeMul)||0.4; }   // hand the cyan ninja to updateNinja
    if((def.abilities||[]).some(a=>a.k==='missile'||a.k==='stomp')){ u._mech=true; u._mechImpacts=[]; }   // Rex: multi-tick area specials (updateMech)
    state._villainSpawned=true;
    if(!window._rbReplaying) bossTaunt(state, u, 'intro');
  }
}

/* ---- per-frame driver (called from the core.js unit loop; authoritative path only) ---- */
function updateVillain(state, u, dt){
  if(state.hub || u.dead || !u.villain) return;
  const def = VILLAINS[u.villainId]; if(!def) return;

  // (a) phase transitions — Rex's themed "Madosis" enrage
  if(def.phases) for(const ph of def.phases){
    if(u.bossPhase<2 && u.hp <= u.maxHp*ph.at){
      u.bossPhase=2;
      if(ph.dmgMul) u.bossDmgMul=ph.dmgMul;
      if(ph.cdMul)  u._bossCd=def.cd*ph.cdMul;
      if(ph.speedMul) u.speed=def.speed*ph.speedMul;
      if(ph.madFlavor) u.madFlavor=true;
      u._abilCastT=state.time;                               // glow peak on the transition
      if(!window._rbReplaying) bossTaunt(state, u, 'phase');
    }
  }

  // (b) ninja flee — sprint for the nearest map edge and ESCAPE
  if(def.fleeHpFrac && !u.escaped){
    if(!u._fleeing && u.hp <= u.maxHp*def.fleeHpFrac){
      u._fleeing=true; u.speed=def.speed*(def.fleeSpeedMul||1.6);
      if(!window._rbReplaying) bossTaunt(state, u, 'flee');
    }
    if(u._fleeing){
      u.autoTarget=null; u.cmd=null; u.guard=true;            // drop combat each tick so updateUnit can't re-engage
      const W=state.W, H=state.H;
      if(u.x<TILE*1.5 || u.y<TILE*1.5 || u.x>(W-1.5)*TILE || u.y>(H-1.5)*TILE){
        u.escaped=true; u.dead=true; state._villainEscaped=true;   // despawn (core.js cleanup removes it)
        if(!window._rbReplaying) bossTaunt(state, u, 'escaped');
        return;
      }
      if(!u._fleeDest || (typeof dist==='function' && dist(u,u._fleeDest)<TILE)){
        const edge=nearestMapEdge(state,u); u._fleeDest=edge;
        if(typeof issueMove==='function') issueMove(state, u, edge.x, edge.y, {type:'amove', x:edge.x, y:edge.y});
      }
      return;                                                 // flee overrides abilities/combat
    }
  }

  // (c) ninja — bespoke hit-and-run AI owns all movement+combat (updateUnit yields for it; flee in (b) wins)
  if(def.aiKind==='ninja'){ updateNinja(state, u, dt); return; }

  // (c2) MECH (Rex): every tick resolve in-flight missiles + the rolling quake wave; if a special is
  // mid-animation, step it and own the tick (updateUnit yields while airborne so Rex can't shoot mid-leap).
  if(u._mech){
    mechUpkeep(state, u, dt, def);
    if(u._mechAct){ stepMech(state, u, dt, def); return; }
  }

  // (d) abilities — cooldown-gated, reusing the normal combat helpers (Rex et al.)
  const tgt = u.autoTarget || (u.cmd && u.cmd.target);
  if(!tgt || tgt.dead) return;
  for(const a of (def.abilities||[])){
    u._abilCd[a.k] = (u._abilCd[a.k]||0) - dt;
    if(u._abilCd[a.k] > 0) continue;
    const d = (typeof dist==='function') ? dist(u,tgt) : 1e9;
    if(a.k==='blink'){
      if(d <= a.range*TILE && d > u.range*TILE){              // close a gap that's within blink reach
        const dx=tgt.x-u.x, dy=tgt.y-u.y, dd=Math.hypot(dx,dy)||1;
        const bx=tgt.x-(dx/dd)*(u.range*TILE*0.8), by=tgt.y-(dy/dd)*(u.range*TILE*0.8);
        const tx=(bx/TILE)|0, ty=(by/TILE)|0;
        if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx])){
          u.x=bx; u.y=by; u.path=null; u.pathIdx=0;
          if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,def.neonColor||'#3fffff');
          u._abilCastT=state.time; u._abilCd[a.k]=a.cd;
        }
      }
    } else if(a.k==='missile'){
      if(d <= a.range*TILE){ startMissile(state, u, a, tgt, def); break; }   // begin a 3-missile barrage
    } else if(a.k==='stomp'){
      if(d <= a.range*TILE){ startStomp(state, u, a, def); break; }          // begin the thruster jump-stomp
    }
  }
}

/* =====================================================================
   REX — the black/green war-mech. Keeps its baseline ranged cannon (updateUnit); the two telegraphed
   AREA specials below run as a short sub-state machine on the unit (u._mechAct) so each can span the
   ticks of its animation. bossAreaDamage caps every blast to capFrac*maxHp → it can NEVER one-shot.
   Authoritative path only; FX guarded by !_rbReplaying; landing spot via simRandom-free scans.
   ===================================================================== */

// AREA damage with distance falloff and a hard per-unit cap (the "never one-shot / never wipe" rule).
// Optional volleyId: a unit can be hit at most once per volley, so the 3 missiles of one barrage spread
// across the cluster instead of stacking ≥2 blasts on the same body (keeps a single volley ≤ capFrac).
function bossAreaDamage(state, src, cx, cy, R, dmg, capFrac, volleyId){
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    if(volleyId!=null && o._volleyHit===volleyId) continue;
    const dd=Math.hypot(o.x-cx, o.y-cy);
    if(dd>R) continue;
    if(volleyId!=null) o._volleyHit=volleyId;
    const fall = 1 - 0.5*(dd/R);                         // 100% at the center → 50% at the rim
    bossDamageCapped(state, src, o, dmg*fall, capFrac);
  }
}
function bossDamageCapped(state, src, o, dmg, capFrac){
  const amt = Math.min(dmg, o.maxHp*(capFrac||0.45));    // a single blast can never exceed capFrac of maxHp
  if(amt>0 && typeof damage==='function') damage(state, o, amt, src);
}

// the tile-cluster the most player units are bunched around (where a stomp wants to land)
function densestCluster(state, u, R){
  const ps=[];
  for(const o of state.entities){ if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    if(Math.hypot(o.x-u.x,o.y-u.y)<=R) ps.push(o); }
  if(!ps.length) return null;
  let best=ps[0], bestN=-1;
  for(const c of ps){ let n=0; for(const o of ps){ if(Math.hypot(o.x-c.x,o.y-c.y)<=2.5*TILE) n++; } if(n>bestN){ bestN=n; best=c; } }
  const tx=(best.x/TILE)|0, ty=(best.y/TILE)|0;
  if(state.blocked && state.blocked[ty*state.W+tx]) return { x:u.x, y:u.y };   // don't land in a wall
  return { x:best.x, y:best.y };
}

// per-tick upkeep: resolve scheduled missile impacts, expand the quake wave, decay screen shake.
function mechUpkeep(state, u, dt, def){
  // (screen-shake decay moved to render() so it runs on every map / path, not just boss maps)
  if(u._mechImpacts && u._mechImpacts.length){
    for(const im of u._mechImpacts){ if(im.done) continue;
      im.t -= dt;
      if(im.t<=0){ im.done=true;
        bossAreaDamage(state, u, im.x, im.y, im.r, Math.round(im.dmg*(u.bossDmgMul||1)), im.capFrac, im.volleyId);
        if(!window._rbReplaying && typeof spawnExplosion==='function') spawnExplosion(im.x, im.y);
        state._shake = Math.max(state._shake||0, 5);
      }
    }
    u._mechImpacts = u._mechImpacts.filter(im=>!im.done);
  }
  if(u._quake){                                          // a ground wave that damages units the front NEWLY passes
    const q=u._quake, prevR=q.r;
    q.r += (q.rMax/0.4)*dt;
    for(const o of state.entities){
      if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
      const dd=Math.hypot(o.x-q.x, o.y-q.y);
      if(dd>prevR && dd<=q.r && o._quakeHit!==q.id){
        o._quakeHit=q.id;
        bossDamageCapped(state, u, o, Math.round(q.dmg*(u.bossDmgMul||1)), q.capFrac);
      }
    }
    if(q.r>=q.rMax) u._quake=null;
  }
}

// step the active multi-tick special
function stepMech(state, u, dt, def){
  u._mechT = (u._mechT||0)+dt;
  if(u._mechAct==='missile') stepMissile(state, u, dt, def);
  else if(u._mechAct==='stomp') stepStomp(state, u, dt, def);
  else u._mechAct=null;
}

// ---- MISSILE BARRAGE: 0.35s rear-up windup, then lob `count` arcing plasma missiles at a spread ----
function startMissile(state, u, a, tgt, def){
  u._mechAct='missile'; u._mechT=0;
  u._abilCastT=state.time; u._actStamp=state.time; u._abilCd[a.k]=a.cd;
  u._volley={ a, tx:tgt.x, ty:tgt.y, fired:false };
  if(!window._rbReplaying) bossTaunt(state, u, 'missile');
}
function stepMissile(state, u, dt, def){
  u._actState='attack'; u._face = (u._volley && u._volley.tx<u.x)?-1:1;
  const v=u._volley; if(!v){ u._mechAct=null; return; }
  if(u._mechT < 0.35) return;                            // telegraph
  if(!v.fired){
    v.fired=true;
    const a=v.a, n=a.count||3, R=(a.splashR||1.9)*TILE, fl=a.flight||0.78, cap=a.capFrac||0.4, vid=state.time;
    const muzx=u.x, muzy=u.y - (u.r||16)*1.2;            // cannon muzzle (upper body)
    const pts=missileAimPoints(state, u, v.tx, v.ty, n, (a.spreadTiles||2.2)*TILE);
    for(let i=0;i<pts.length;i++){
      const p=pts[i], delay=i*0.12, t=fl+delay;
      u._mechImpacts.push({ x:p.x, y:p.y, t, r:R, dmg:a.dmg, capFrac:cap, volleyId:vid });
      if(!window._rbReplaying && typeof spawnMissile==='function') spawnMissile(muzx, muzy, p.x, p.y, t);
    }
  }
  if(u._mechT >= 0.6){ u._mechAct=null; u._volley=null; u._actStamp=state.time; }   // missiles resolve via mechUpkeep
}
// aim points: the target plus the nearest other player units (so extra missiles spread across the cluster)
function missileAimPoints(state, u, tx, ty, n, spread){
  const pts=[{x:tx,y:ty}], cand=[];
  for(const o of state.entities){ if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    const dd=Math.hypot(o.x-tx,o.y-ty); if(dd>1 && dd<=spread*2.5) cand.push({x:o.x,y:o.y,dd}); }
  cand.sort((a,b)=>a.dd-b.dd);
  let ci=0;
  while(pts.length<n){
    if(ci<cand.length){ pts.push({x:cand[ci].x, y:cand[ci].y}); ci++; }
    else { const k=pts.length, ang=k*2.39996 + tx*0.01; pts.push({x:tx+Math.cos(ang)*spread, y:ty+Math.sin(ang)*spread}); }
  }
  return pts.slice(0,n);
}

// ---- JUMP-STOMP: crouch → thruster leap onto the densest cluster → crash → earthquake wave → recover ----
function startStomp(state, u, a, def){
  u._mechAct='stomp'; u._mechT=0; u._stompPhase=1; u._mechAirborne=true;   // rooted/airborne for the whole move
  u._abilCastT=state.time; u._abilCd[a.k]=a.cd;
  const land=densestCluster(state, u, (a.range||6.5)*TILE*1.4) || {x:u.x,y:u.y};
  u._stomp={ a, x0:u.x, y0:u.y, lx:land.x, ly:land.y };
  if(!window._rbReplaying) bossTaunt(state, u, 'stomp');
}
function stepStomp(state, u, dt, def){
  const s=u._stomp; if(!s){ u._mechAct=null; u._mechAirborne=false; return; }
  const a=s.a, tCrouch=0.45, tAir=(a.jumpDur||0.7), tRec=0.4, H=(u.r||16)*4.5;
  u._actState='attack';
  if(u._stompPhase===1){                                // CROUCH / spool thrusters
    if(!window._rbReplaying && typeof spawnThruster==='function' && ((u._mechT*60)|0)%2===0) spawnThruster(u.x, u.y+(u.r||16)*0.45, 0, 1.3);
    if(u._mechT>=tCrouch){ u._stompPhase=2; u._mechT=0; }
    return;
  }
  if(u._stompPhase===2){                                // AIRBORNE — thrust up, fly to the landing point
    const p=Math.min(1, u._mechT/tAir);
    u._jumpZ = Math.sin(p*Math.PI)*H;                   // up-arc, apex at mid-flight
    u.x = s.x0 + (s.lx-s.x0)*p; u.y = s.y0 + (s.ly-s.y0)*p;
    u.dir = Math.atan2(s.ly-s.y0, s.lx-s.x0) || u.dir;
    if(!window._rbReplaying && typeof spawnThruster==='function' && p<0.55 && ((u._mechT*60)|0)%2===0) spawnThruster(u.x, u.y+(u.r||16)*0.5, 0, 2.6);
    if(p>=1){ u._stompPhase=3; u._mechT=0; u._jumpZ=0; u.x=s.lx; u.y=s.ly; }
    return;
  }
  if(u._stompPhase===3){                                // LAND / IMPACT — shockwave, dust, quake, shake
    u._jumpZ=0;
    if(!window._rbReplaying){
      if(typeof spawnShockwave==='function') spawnShockwave(u.x, u.y, (a.waveR||3.4)*TILE);
      if(typeof spawnDust==='function') spawnDust(u.x, u.y);
      if(typeof spawnExplosion==='function') spawnExplosion(u.x, u.y);
    }
    state._shake = 15;
    u._quake={ x:u.x, y:u.y, r:0, rMax:(a.waveR||3.4)*TILE, dmg:a.dmg, capFrac:a.capFrac||0.45, id:state.time };
    u._actStamp=state.time; u._abilCastT=state.time;
    u._stompPhase=4; u._mechT=0;
    return;
  }
  // RECOVER — a brief rooted opening, then hand back to normal combat
  if(u._mechT>=tRec){ u._mechAct=null; u._mechAirborne=false; u._stomp=null; u._stompPhase=0; }
}

/* =====================================================================
   THE CYAN NINJA — a bespoke hit-and-run AI (authoritative path only; clients render the
   replicated x/y + the synced _ninjaHidden dim). It glide-dashes IN on a diagonal staircase,
   lands ONE guaranteed strike during a rooted, EXPOSED wind-up (the player's punish window),
   weaves AWAY from whatever is shooting it (emergency blink if cornered point-blank), then drops
   a smoke bomb to vanish (invisible + untargetable) and re-emerges on a fresh target. A 4-state
   machine on u._ninjaState: approach → strike → evade → hide → approach. All tuning lives in
   VILLAINS.cyan_ninja.ninja. Deterministic (simRandom only); FX guarded by !_rbReplaying.
   ===================================================================== */
function updateNinja(state, u, dt){
  const def = VILLAINS[u.villainId] || {}; const N = def.ninja || {};
  if(!u._ninjaState) u._ninjaState='approach';   // defensive init (mid-fight save reload / first tick)
  if(u._zig==null) u._zig=1;
  u._actState=null;   // set to 'attack' only during the strike wind-up/apex below
  u._exposed=false;   // true only while winding up a strike (damage() reads it for the punish window)
  const phase2 = (u.bossPhase||1)>=2;
  const spd = (N.dashSpeed||18) * (phase2?1.18:1);
  const HOP = N.hopLen||2.3, TS = TILE;

  // --- STUCK WATCHDOG (time since last COMPLETED move): the right signal is whether the ninja actually
  // GETS ANYWHERE. _lastMoveT is refreshed only when a hop GLIDE COMPLETES (reaches its tile) or a teleport
  // fires (lunge/blink/unstick) — NOT when a hop merely starts or a glide stalls against a wall. So a tight
  // fight (hops keep completing) never fires, while a terrain wedge (every hop blocked / glides stall, so
  // nothing completes) fires after 2s and smoke-blinks it to open ground. ---
  if(u._lastMoveT==null) u._lastMoveT=state.time;
  if(state.time - u._lastMoveT > 2.0){ ninjaUnstick(state, u, def); return; }

  // --- CORNERED BREAK-OUT: if the ninja has been pinned (can't reach HIDE / vanish) for >escapeAfter seconds
  // while shooters are right on it — like cornered against a map edge where it becomes an easy target — it MUST
  // escape: a very fast smoke-DASH straight THROUGH the units (they don't block movement, only terrain does) to
  // open ground, then it vanishes. _lastHideT is refreshed every tick it's hidden, so in normal play (it hides
  // every ~3-4s) this never fires; only a real pin lets the gap reach escapeAfter. ---
  if(u._lastHideT==null) u._lastHideT=state.time;
  if(u._ninjaState!=='escape' && u._ninjaState!=='hide' && !u._fleeing &&
     state.time - u._lastHideT > (N.escapeAfter||10) &&
     (typeof nearestEnemy==='function' && nearestEnemy(state, u, (N.safeDist||6)*TS*1.5))){
    startNinjaEscape(state, u, N, def); return;
  }

  // --- HIDE timer runs at the TOP so the smoke-vanish always ends on schedule, even mid-flank-dash
  // (the in-flight/hopWait early-returns below would otherwise starve it and the ninja stays gone forever) ---
  if(u._ninjaState==='hide'){
    u._lastHideT=state.time;   // hidden = safe → keep the cornered-break-out timer reset
    u._hideT=(u._hideT||0)+dt;
    if(u._hideT >= (N.hideDur||1.5)*(phase2?0.65:1)){
      u._ninjaHidden=false; u._untargetable=false; u._dash=null;
      if(typeof spawnSmoke==='function' && !window._rbReplaying) spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff');
      u._ninjaState='approach'; return;                       // re-emerge and pick a fresh victim
    }
  }

  // --- advance an in-flight glide hop; if still travelling, that's the whole tick ---
  if(u._dash){
    const esc=!!u._escaping;
    const dx=u._dash.x-u.x, dy=u._dash.y-u.y, dd=Math.hypot(dx,dy), step=(esc?(N.escapeSpeed||34):spd)*TS*dt;
    // ABORT a STALLED glide: a real ≤2.3-tile hop finishes in <0.15s, so if it has run >0.35s, OR the
    // remaining distance came out LARGER than we projected last tick (separation shoved it back off a wall),
    // drop the dash and re-plan THIS tick — the path-validated tryHop below then slides along the obstacle
    // instead of grinding into it. (The break-out dash is long + path-pre-validated → never aborts.)
    if(!esc && ((state.time-(u._dashStartT||state.time) > 0.35) || (u._dashPrevD!=null && dd > u._dashPrevD + step*0.5))){
      u._dash=null; u._dashPrevD=null; u._hopWait=0;
    } else if(dd<=step || dd<2){ u.x=u._dash.x; u.y=u._dash.y; u._dash=null; u._dashPrevD=null; u._lastMoveT=state.time; if(dd>0.01) u.dir=Math.atan2(dy,dx);   // COMPLETED
      if(esc){ u._escaping=false; u._ninjaState='hide'; u._hideT=0; u._lastHideT=state.time; }   // broke out → vanish + reset the pin timer
    }
    else { u.x+=dx/dd*step; u.y+=dy/dd*step; u.dir=Math.atan2(dy,dx); u._dashPrevD=dd-step;
      if(esc && !window._rbReplaying && typeof spawnSmoke==='function' && (u._escSmokeT=(u._escSmokeT||0)+dt)>=0.09){ u._escSmokeT=0; spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff'); }   // smoke trail along the break-out
      return; }
  }
  // defensive: a break-out that somehow lost its dash → resume normal AI (don't strand in 'escape')
  if(u._ninjaState==='escape'){ u._escaping=false; u._ninjaHidden=false; u._untargetable=false; u._ninjaState='approach'; }
  // brief inter-hop pause so dashes read as discrete flicks (skipped in flight above)
  if((u._hopWait = (u._hopWait||0) - dt) > 0) return;

  // launch a DIAGONAL hop along heading (hx,hy): try the diagonal best aligned with the heading, then the
  // others (slides along terrain instead of wedging), shortening the hop until a passable tile is found.
  const tryHop = (hx,hy,len)=>{
    const hd=Math.hypot(hx,hy)||1; hx/=hd; hy/=hd;
    const di=[[1,1],[1,-1],[-1,1],[-1,-1]].map(d=>({sx:d[0], sy:d[1], dot:(d[0]*hx+d[1]*hy)})).sort((a,b)=>b.dot-a.dot);
    for(const {sx,sy} of di){
      for(let L=len; L>=0.75; L-=0.5){
        const wx=u.x + sx*L*TS*0.7071, wy=u.y + sy*L*TS*0.7071;   // equal x/y → Euclidean travel == L tiles
        const tx=(wx/TS)|0, ty=(wy/TS)|0;
        // endpoint open AND the straight glide path is clear → won't wedge against a wall mid-glide
        if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx]) && pathClear(state,u.x,u.y,wx,wy)){
          u._dash={x:wx,y:wy}; u._dashStartT=state.time; u._dashPrevD=null;
          u._hopWait=(N.hopGap||0.06)*(phase2?0.7:1); u.dir=Math.atan2(sy,sx); return true;
        }
      }
    }
    return false;   // fully boxed in (no clear diagonal in any direction)
  };
  const alive = (t)=> t && !t.dead && t.owner==='player';

  // ---------- APPROACH: staircase diagonally toward a chosen victim until in lunge range ----------
  if(u._ninjaState==='approach'){
    let t=u._ninjaTgt; if(!alive(t)){ t=pickNinjaTarget(state,u,N); u._ninjaTgt=t; }
    if(!alive(t)) return;                                        // duel map → there is always a target
    const dd=dist(u,t);
    if(dd <= (N.lungeRange||2.6)*TS){ u._ninjaState='strike'; u._strikeT=0; return; }   // close enough → commit a lunge-strike
    tryHop(t.x-u.x, t.y-u.y, Math.min(HOP, Math.max(1.0, dd/TS - 1.0)));
    return;
  }

  // ---------- STRIKE: rooted, EXPOSED wind-up at range, then a flash-LUNGE to a guaranteed hit ----------
  if(u._ninjaState==='strike'){
    let t=u._ninjaTgt;
    if(!alive(t) || dist(u,t) > (N.lungeRange||2.6)*TS + 1.5*TS){ u._ninjaState='approach'; return; }   // it slipped away → re-approach
    faceTo(u,t); u._face = t.x<u.x?-1:1; u._exposed=true;
    const wind=(N.strikeWindup||0.40)*(phase2?0.7:1);
    u._strikeT=(u._strikeT||0)+dt;
    if(u._strikeT < wind){
      if(!u._abilCastT || state.time-u._abilCastT>0.5) u._abilCastT=state.time;   // peak the charge glow (drawVillainGlow)
      u._actState='attack'; u._actStamp=state.time - u._strikeT;                  // hold the swing on its windup frames
      return;
    }
    // APEX — flash-LUNGE to contact (beats the separation jostle), then a guaranteed hit
    const sx0=u.x, sy0=u.y, dx=t.x-u.x, dy=t.y-u.y, dl=Math.hypot(dx,dy)||1;
    const lx=t.x-(dx/dl)*(entRadius(t)+(u.r||14)*0.8), ly=t.y-(dy/dl)*(entRadius(t)+(u.r||14)*0.8);
    const ltx=(lx/TS)|0, lty=(ly/TS)|0;
    if(ltx>0&&lty>0&&ltx<state.W-1&&lty<state.H-1 && !(state.blocked && state.blocked[lty*state.W+ltx])){ u.x=lx; u.y=ly; }
    u._dash=null; u._lastMoveT=state.time;   // lunge = a move (watchdog)
    const dmg=Math.round(u.dmg*(u.bossDmgMul||1));
    if(typeof applyHit==='function') applyHit(state, u, t, dmg, 0, 1.3);
    u._actState='attack'; u._actStamp=state.time;
    if(!window._rbReplaying){
      if(typeof spawnSlash==='function') spawnSlash({x:sx0,y:sy0}, t, def.neonColor||'#bffcff');   // streak shows the lunge path
      if(typeof spawnRing==='function')  spawnRing(u.x, u.y, def.neonColor||'#50e6ff');
    }
    if(phase2){ const t2=nearestEnemy(state,u,(u.range+0.7)*TS); if(t2&&t2!==t){ applyHit(state,u,t2,dmg,0,1.3); if(typeof spawnSlash==='function'&&!window._rbReplaying) spawnSlash(u,t2,def.neonColor||'#bffcff'); } }
    u._exposed=false; u._ninjaState='evade'; u._evadeN=0; u._strikeT=0;
    return;
  }

  // ---------- EVADE: weave away from the shooters; blink out if truly walled in ----------
  if(u._ninjaState==='evade'){
    const c = shooterCentroid(state, u, (N.shooterR||5.5)*TS) || {x:u.x, y:u.y};
    const near = nearestEnemy(state, u, (N.safeDist||6)*TS);
    if(!near){ u._ninjaState='hide'; u._hideT=0; return; }                        // already clear → vanish
    const nd = dist(u, near), cd0=dist(u,c);
    // scan all four diagonals; take the open hop that lands FURTHEST from the cluster (slips a surround / corner)
    let best=null, bestSc=-1e18;
    for(const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
      for(let L=HOP; L>=0.75; L-=0.5){
        const wx=u.x+sx*L*TS*0.7071, wy=u.y+sy*L*TS*0.7071, tx=(wx/TS)|0, ty=(wy/TS)|0;
        if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx]) && pathClear(state,u.x,u.y,wx,wy)){
          const sc=Math.hypot(wx-c.x,wy-c.y) - (sx===u._zdx&&sy===u._zdy?7:0);     // mild anti-repeat → a dodging weave
          if(sc>bestSc){ bestSc=sc; best={x:wx,y:wy,sx,sy}; }
          break;                                                                   // longest clear hop along this diagonal
        }
      }
    }
    if(best && (bestSc>cd0 || nd>(N.panicRange||1.6)*TS)){                          // a hop that gains ground (or we're not pinned)
      u._dash={x:best.x,y:best.y}; u._dashStartT=state.time; u._dashPrevD=null; u._hopWait=(N.hopGap||0.06)*(phase2?0.7:1);
      u.dir=Math.atan2(best.sy,best.sx); u._zdx=best.sx; u._zdy=best.sy; u._evadeStuck=0;
      u._evadeN=(u._evadeN||0)+1;
      if(u._evadeN >= (N.evadeHops||3) && nd > (N.safeDist||6)*TS*0.8){ u._ninjaState='hide'; u._hideT=0; }
      return;
    }
    // pinned point-blank with no ground to gain → smoke-blink straight out; if EVEN that fails, turn and fight
    if((u._panicCd=(u._panicCd||0)-dt) <= 0){ ninjaPanicBlink(state, u, c, N, def); u._panicCd=2.2; u._evadeStuck=0; return; }
    if((u._evadeStuck=(u._evadeStuck||0)+1) >= 3){ u._evadeStuck=0; u._ninjaTgt=near; u._ninjaState='strike'; u._strikeT=0; }   // walled corner → "corner and finish" payoff
    return;
  }

  // ---------- HIDE: smoke-bomb vanish (invisible + untargetable) + slow flank (timer/exit handled at top) ----------
  if(u._ninjaState==='hide'){
    if(!u._ninjaHidden){
      u._ninjaHidden=true; u._untargetable=true;   // player units lose lock (units.js); render dims the sprite
      if(!window._rbReplaying){ if(typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff'); if(typeof spawnRing==='function') spawnRing(u.x,u.y,'#bffcff'); }
    }
    let t=u._ninjaTgt; if(!alive(t)){ t=pickNinjaTarget(state,u,N); u._ninjaTgt=t; }
    if(t) tryHop(t.y-u.y, -(t.x-u.x), HOP*0.7);    // drift to a FLANK (perpendicular to the target) while cloaked
    return;
  }
}

// choose a victim: punish whoever is shooting the ninja, then the wounded, then the near; deprioritize flyers.
function pickNinjaTarget(state, u, N){
  const R=(N.retargetR||13)*TILE; let best=null, bs=-1e18;
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    const dd=dist(u,o); if(dd>R) continue;
    let s=0;
    if(o.autoTarget===u || (o.cmd&&o.cmd.type==='attack'&&o.cmd.target===u)) s+=400;   // it's shooting me → I cut it first
    s += (1-(o.hp/o.maxHp))*150;                         // finish the wounded (drama)
    s -= dd/TILE*8;                                      // prefer closer
    if(o.air) s-=120;                                    // a blade prefers ground
    s += (typeof simRandom==='function'?simRandom(state):0)*20;   // deterministic jitter so picks vary
    if(s>bs){ bs=s; best=o; }
  }
  return best || (typeof nearestEnemy==='function' ? nearestEnemy(state,u,1e9) : null);
}

// centroid of player units within R (the cluster the ninja flees from)
function shooterCentroid(state, u, R){
  let sx=0, sy=0, n=0;
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    if(dist(u,o) > R) continue;
    sx+=o.x; sy+=o.y; n++;
  }
  return n ? { x:sx/n, y:sy/n } : null;
}

// emergency teleport directly away from the cluster (only fires at point-blank during evade)
function ninjaPanicBlink(state, u, c, N, def){
  let ax=u.x-c.x, ay=u.y-c.y; const ad=Math.hypot(ax,ay)||1; ax/=ad; ay/=ad;
  if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,def.neonColor||'#50e6ff');
  for(let L=(N.panicBlink||5)*TILE; L>=2*TILE; L-=TILE*0.5){
    const wx=u.x+ax*L, wy=u.y+ay*L, tx=(wx/TILE)|0, ty=(wy/TILE)|0;
    if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx])){
      u.x=wx; u.y=wy; u._dash=null; u._hopWait=(N.hopGap||0.06); u._lastMoveT=state.time;
      if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,'#bffcff');
      return;
    }
  }
}

// is the straight glide line (x0,y0)→(x1,y1) free of blocked tiles? Sampled every ~0.6 tile so a short hop
// can't pass THROUGH a wall (the bug: tryHop only checked the endpoint, so the ninja glided into structures).
function pathClear(state, x0,y0, x1,y1){
  const B=state.blocked; if(!B) return true;
  const W=state.W, H=state.H, TS=TILE;
  const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy), steps=Math.max(1, Math.ceil(d/(TS*0.6)));
  for(let i=1;i<=steps;i++){
    const t=i/steps, tx=((x0+dx*t)/TS)|0, ty=((y0+dy*t)/TS)|0;
    if(tx<0||ty<0||tx>=W||ty>=H || B[ty*W+tx]) return false;
  }
  return true;
}

// unwedge: smoke-blink the ninja to the nearest OPEN ground, then reset to a fresh approach. Fired by the
// stuck watchdog. Pass 1 prefers a tile with elbow room; pass 2 accepts any passable tile; last resort aims
// at the map interior — so it can NEVER no-op and leave the ninja wedged.
function ninjaUnstick(state, u, def){
  const W=state.W, H=state.H, B=state.blocked, TS=TILE;
  const cx=(u.x/TS)|0, cy=(u.y/TS)|0;
  const open =(tx,ty)=> tx>=1&&ty>=1&&tx<W-1&&ty<H-1 && !(B && B[ty*W+tx]);
  const roomy=(tx,ty)=> open(tx,ty) && open(tx-1,ty)&&open(tx+1,ty)&&open(tx,ty-1)&&open(tx,ty+1);
  let best=null, bd=1e9;
  for(const test of [roomy, open]){
    for(let r=1;r<=16 && !best;r++){
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;            // only the current ring
        const tx=cx+dx, ty=cy+dy;
        if(!test(tx,ty)) continue;
        const d=dx*dx+dy*dy; if(d<bd){ bd=d; best={ x:tx*TS+TS/2, y:ty*TS+TS/2 }; }
      }
    }
    if(best) break;
  }
  if(!best) best={ x:(W>>1)*TS+TS/2, y:(H>>1)*TS+TS/2 };                   // last resort → map interior
  if(!window._rbReplaying){ if(typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff'); if(typeof spawnRing==='function') spawnRing(u.x,u.y,'#bffcff'); }
  u.x=best.x; u.y=best.y;
  if(!window._rbReplaying && typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff');
  u._dash=null; u._hopWait=0; u._ninjaState='approach'; u._ninjaTgt=null;
  u._ninjaHidden=false; u._untargetable=false; u._lastMoveT=state.time;   // fresh open spot → watchdog reset
}

// CORNERED BREAK-OUT: a very fast smoke-dash straight THROUGH the shooter cluster to open ground. Units
// don't block movement (only terrain does), so the ninja slips between them as a smoke streak; it's cloaked +
// untargetable for the dash so it can't be killed mid-escape. Drives the _dash glide (the in-flight block runs
// it at escapeSpeed and, on arrival, drops it into HIDE). Falls back to a teleport if no clear lane exists.
function startNinjaEscape(state, u, N, def){
  const TS=TILE;
  // head FROM the ninja THROUGH the shooter centroid (so the dash passes BETWEEN the units) to open ground
  // beyond; fall back to the map interior if there are somehow no shooters.
  const c = (typeof shooterCentroid==='function') ? shooterCentroid(state, u, (N.shooterR||5.5)*TS*2.4) : null;
  let dx = c ? c.x-u.x : state.W*TS*0.5-u.x, dy = c ? c.y-u.y : state.H*TS*0.5-u.y;
  if(Math.hypot(dx,dy)<1){ dx=state.W*TS*0.5-u.x; dy=state.H*TS*0.5-u.y; }
  const dd=Math.hypot(dx,dy)||1; dx/=dd; dy/=dd;
  // farthest TERRAIN-clear point along the ray, up to escapeDist — lands beyond the cluster in open space
  const maxD=(N.escapeDist||11)*TS; let dest=null;
  for(let L=maxD; L>=2.5*TS; L-=TS*0.5){
    const wx=u.x+dx*L, wy=u.y+dy*L, tx=(wx/TS)|0, ty=(wy/TS)|0;
    if(tx>1&&ty>1&&tx<state.W-1&&ty<state.H-1 && !(state.blocked&&state.blocked[ty*state.W+tx]) && pathClear(state,u.x,u.y,wx,wy)){ dest={x:wx,y:wy}; break; }
  }
  if(!dest){ ninjaUnstick(state, u, def); return; }                 // no clear lane → guaranteed teleport-out
  u._ninjaState='escape'; u._escaping=true; u._escSmokeT=0;
  u._ninjaHidden=true; u._untargetable=true;                        // becomes smoke — can't be killed mid-escape
  u._dash={x:dest.x,y:dest.y}; u._dashStartT=state.time; u._dashPrevD=null; u._hopWait=0; u._lastMoveT=state.time;
  if(!window._rbReplaying){
    if(typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff');
    if(typeof spawnRing==='function')  spawnRing(u.x,u.y,'#bffcff');
    if(typeof bossTaunt==='function')  bossTaunt(state,u,'flee');   // a dramatic break-out line
  }
}

/* ---- taunt: a boss speech bubble (cosmetic; skipped during rollback re-sim) ---- */
function bossTaunt(state, u, key){
  if(typeof pushDialog!=='function') return;
  const def=VILLAINS[u.villainId], pool=def && def.taunts && def.taunts[key];
  if(!pool || !pool.length) return;
  const line = pool[(u._tauntN=(u._tauntN||0)+1) % pool.length];   // cycle deterministically (no RNG)
  pushDialog(u, line, {type:'lore', tone:'neg', ttl:5});
}

/* ---- nearest passable border tile (where a fleeing ninja exits) ---- */
function nearestMapEdge(state, u){
  const W=state.W, H=state.H, B=state.blocked;
  const tx=Math.floor(u.x/TILE), ty=Math.floor(u.y/TILE);
  const dL=tx, dR=W-1-tx, dT=ty, dB=H-1-ty, m=Math.min(dL,dR,dT,dB);
  let ex=tx, ey=ty, vertical=false;
  if(m===dL){ ex=1; vertical=true; } else if(m===dR){ ex=W-2; vertical=true; }
  else if(m===dT){ ey=1; } else { ey=H-2; }
  for(let r=0;r<=14;r++){                                     // walk along the edge for a passable cell
    for(const d of (r===0?[0]:[ -r, r ])){
      const cx = vertical ? ex : ex+d, cy = vertical ? ey+d : ey;
      if(cx<1||cy<1||cx>=W-1||cy>=H-1) continue;
      if(B && B[cy*W+cx]) continue;
      return { x:cx*TILE+TILE/2, y:cy*TILE+TILE/2 };
    }
  }
  return { x:ex*TILE+TILE/2, y:ey*TILE+TILE/2 };
}

/* =====================================================================
   WIN / LOSE — a boss map's outcome is decided by the named villain's fate, taking precedence
   over the normal "no enemy buildings = win" rule (a boss arena may have NO enemy buildings).
   Called from checkWinLose (core.js); returns true to short-circuit the normal flow.
   ===================================================================== */
function villainCheckWinLose(state){
  if(!state._villainSpawned) return true;                     // not spawned yet → never auto-win
  const aliveBoss = state.entities.some(e=>e.villain && !e.dead && !e.escaped);
  if(!aliveBoss){
    if(state._villainEscaped) bossOutcome(state, 'fled');     // ninja slipped the net — partial win, still gates
    else bossOutcome(state, 'win');                           // boss(es) killed
    return true;
  }
  bossDefeatChecks(state);                                    // the player can still LOSE while the boss lives
  return true;                                                // ALWAYS short-circuit (no enemy-building win on a boss map)
}

// mirror checkWinLose's win flow (solo extraction / host hub / else over+onVictory). 'fled' is a
// win with a cosmetic _fledBoss flag so the end screen reads "it got away" while still advancing.
function bossOutcome(state, kind){
  if(kind==='fled'){ state._fledBoss=true; if(typeof toast==='function' && !window._rbReplaying) toast('🌫️ The boss slipped away — but the field is yours.'); }
  // T2-7: the FINALE boss (REX) ends the war on the spot — no extraction loop, straight to the
  // victory flow, where onVictory's finale routing shows the IPO.
  if(state.cfg && state.cfg.finale){
    if(typeof markVillainCleared==='function') markVillainCleared(typeof mapIndex==='number'?mapIndex:0);
    state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory(); return;
  }
  if(state._skirmish){ state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory(); return; }   // T3-2
  if(netRole==='solo' && typeof beginExtractionPhase==='function'){ beginExtractionPhase(state); return; }
  if(netRole==='host' && typeof window!=='undefined' && window.MP_SESSION && MP_SESSION.mode==='campaign' && typeof enterHubFromCombat==='function'){ enterHubFromCombat(state); return; }
  state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory();
}

// player-loss conditions only — the boss-map analogue of checkWinLose's lose checks, with NO
// enemy-building win (the boss living is what keeps the map going).
function bossDefeatChecks(state){
  const playerHq = state.entities.some(e=>e.owner==='player'&&e.type==='hq'&&!e.dead);
  const canRecoverHq = state.entities.some(e=>e.owner==='player'&&e.type==='worker'&&!e.dead&&!e.storedIn);
  const playerHas = state.entities.some(e=>e.owner==='player'&&!e.dead&&(e.kind==='building'||e.kind==='unit'));
  if((!playerHq && !canRecoverHq) || !playerHas){
    state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK && typeof onDefeat==='function') onDefeat();
  }
}

/* =====================================================================
   CAMPAIGN GATING — villain maps are APPENDED to MAPS (indices ≥13) so existing episode indices
   never shift. A villain with gateAfter===idx interrupts the linear sequence the first time the
   player finishes episode `idx`; finishing the villain map routes to its `returnTo`. Cleared
   villains (CAMPAIGN.villainCleared) are not re-gated on replays.
   ===================================================================== */
function villainIsCleared(i){ return !!(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.villainCleared && CAMPAIGN.villainCleared[i]); }
function markVillainCleared(i){ if(typeof CAMPAIGN!=='undefined' && CAMPAIGN){ CAMPAIGN.villainCleared = CAMPAIGN.villainCleared || {}; CAMPAIGN.villainCleared[i]=1; } }

// the highest non-villain index — villain maps are APPENDED past the linear campaign, so the
// linear "last episode" is the last entry that isn't a villain.
function lastEpisodeIndex(){ let k=MAPS.length-1; while(k>0 && MAPS[k] && MAPS[k].isVillain) k--; return k; }

// The LINEAR next index after finishing `finishedIdx`. Critically this NEVER returns a villain
// index (villains are reached via the dispatch gate below), so CAMPAIGN.nextMapIndex stays on the
// 0..lastEpisode track — keeping every existing index-keyed system (rebornUnlockIdx, the MAPS[7]
// Nino reintro, Madosis episode numbers) correct. Finishing a villain map resumes at its returnTo
// and marks it cleared.
function villainNextLinear(finishedIdx){
  if(typeof MAPS==='undefined') return finishedIdx+1;
  const m=MAPS[finishedIdx];
  if(m && m.isVillain){ markVillainCleared(finishedIdx);
    if(m.finale) return lastEpisodeIndex()+1;   // T2-7: the finale is past the linear track
    return Math.max(0, Math.min(m.returnTo!=null?m.returnTo:finishedIdx, MAPS.length-1)); }
  let n=finishedIdx+1; while(MAPS[n] && MAPS[n].isVillain) n++;   // skip appended villain entries
  // T2-7/T4-1: finishing the LAST linear episode advances PAST it (lastEp+1) — the post-campaign
  // marker that unlocks The Wake (HUB.rebornUnlockIdx) and routes the hub dispatch to the finale
  // boss (hubNextDeployIndex below). Mid-campaign indices are unchanged.
  return Math.min(n, lastEpisodeIndex()+1);
}

// At dispatch: if an UNCLEARED villain is gated to be played right before episode `nextIdx`
// (returnTo===nextIdx), return its index so the player fights it first; else -1. This is how the
// villain interrupts the linear sequence without ever sitting in CAMPAIGN.nextMapIndex.
function villainGateBefore(nextIdx){
  if(typeof MAPS==='undefined') return -1;
  for(let i=0;i<MAPS.length;i++){ const v=MAPS[i]; if(v && v.isVillain && v.returnTo===nextIdx && !villainIsCleared(i)) return i; }
  return -1;
}

// T2-7: the FINALE villain (REX) — the campaign ends on its best fight. After the last linear
// episode the player routes here instead of the IPO; beating it (or it being already cleared)
// unlocks the IPO. Returns the first uncleared finale villain's index, else -1.
function finaleVillainIndex(){
  if(typeof MAPS==='undefined') return -1;
  for(let i=0;i<MAPS.length;i++){ const v=MAPS[i]; if(v && v.isVillain && v.finale && !villainIsCleared(i)) return i; }
  return -1;
}

// The ACTUAL next deployment from the H.U.B.: the linear next episode, an uncleared gate villain
// that interrupts it, or — past the last episode — the FINALE boss (replaying the last episode if
// everything is already cleared). One source of truth for the MDC brief + dispatch (T2-7).
function hubNextDeployIndex(){
  const lastEp=lastEpisodeIndex();
  const raw=(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.nextMapIndex!=null)?CAMPAIGN.nextMapIndex:0;
  let idx=Math.max(0, Math.min(raw, MAPS.length-1));
  if(idx>lastEp || (MAPS[idx] && MAPS[idx].isVillain)){
    const fv=finaleVillainIndex();
    return fv>=0 ? fv : lastEp;
  }
  const g=villainGateBefore(idx);
  return g>=0 ? g : idx;
}

/* expose for core.js / hub.js / ui.js / map.js (classic-script shared scope) and the console. */
if(typeof window!=='undefined'){
  window.VILLAINS=VILLAINS; window.spawnVillain=spawnVillain; window.updateVillain=updateVillain; window.updateNinja=updateNinja; window.ninjaUnstick=ninjaUnstick; window.startNinjaEscape=startNinjaEscape;
  window.mechUpkeep=mechUpkeep; window.stepMech=stepMech; window.bossAreaDamage=bossAreaDamage;
  window.bossTaunt=bossTaunt; window.nearestMapEdge=nearestMapEdge;
  window.villainCheckWinLose=villainCheckWinLose; window.bossOutcome=bossOutcome; window.bossDefeatChecks=bossDefeatChecks;
  window.villainIsCleared=villainIsCleared; window.markVillainCleared=markVillainCleared;
  window.villainNextLinear=villainNextLinear; window.villainGateBefore=villainGateBefore; window.lastEpisodeIndex=lastEpisodeIndex;
  window.finaleVillainIndex=finaleVillainIndex; window.hubNextDeployIndex=hubNextDeployIndex;
}
