/* core.js — main per-tick update(state,dt) and checkWinLose(). Orchestrates units→physics→AI→fog each frame. */
function update(state, dt){
  if(state.over) return;
  state.time+=dt;
  recomputeSupply(state);

  // ---- production for player & enemy buildings ----
  for(const b of state.entities){
    if(b.dead||b.kind!=='building') continue;
    if(b.constructing){
      // enemy has no Interns — its buildings raise themselves over the build time
      if(b.owner==='enemy'){
        b.buildProg += dt;
        b.hp = Math.min(b.maxHp, (b.buildProg/b.buildTime)*b.maxHp);
        if(b.buildProg>=b.buildTime){ b.constructing=false; b.hp=b.maxHp; }
      }
      continue;
    }
    // turret attacks
    if(b.type==='turret'){
      b.cd-=dt;
      const tgt=nearestEnemy(state,b, DEF.turret.range*TILE);
      if(tgt && b.cd<=0){ damage(state,tgt,DEF.turret.dmg, b); b.cd=DEF.turret.cd; b.shootFx={x:tgt.x,y:tgt.y,t:0.12}; }
    }
    // unit production
    if(b.prodQueue.length){
      b.prodTime+=dt;
      if(b.prodTime>=b.prodTotal){
        const type=b.prodQueue.shift();
        spawnTrained(state,b,type);
        b.prodTime=0;
        b.prodTotal = b.prodQueue.length? DEF[b.prodQueue[0]].build : 0;
      }
    }
  }

  // ---- units ----
  for(const u of state.entities){
    if(u.dead||u.kind!=='unit') continue;
    u.cd-=dt;
    updateUnit(state,u,dt);
  }
  // separation (avoid overlap)
  separation(state,dt);
  // unstick units that a stationary neighbour is blocking
  resolveStuck(state,dt);

  // ---- enemy AI ----
  enemyAI(state,dt);

  // ---- reclaim abandoned outposts (a player unit walking up flips them) ----
  reclaimOutposts(state);

  // ---- fog of war ----
  computeFog(state);

  // ---- cleanup dead ----
  let changed=false;
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.hp<=0 && e.type!=='goldmine'){ killEntity(state,e); changed=true; }
    if(e.type==='goldmine' && e.amount<=0){ e.dead=true; }
  }
  if(changed){ state.selection=state.selection.filter(e=>!e.dead); recomputeSupply(state); refreshUI(); }

  checkWinLose(state);
}
/* =====================================================================
   ABANDONED OUTPOSTS
   ===================================================================== */
// A neutral `abandoned` outpost becomes the player's the moment one of their
// units reaches it — a forward HQ (deposit + supply + build point) on the front.
function reclaimOutposts(state){
  let any=false;
  for(const b of state.entities){
    if(b.dead || !b.abandoned) continue;
    const reach = Math.max(b.w,b.h)*TILE*0.5 + TILE*1.6;   // building radius + ~1.5 tiles
    const taken = state.entities.some(u=> !u.dead && u.kind==='unit' && u.owner==='player' && dist(u,b) < reach);
    if(taken){
      b.owner='player'; b.abandoned=false; b.constructing=false; b.hp=b.maxHp;
      any=true;
      spawnRing(b.x,b.y,'#8effb0');
      toast('🚩 Outpost reclaimed — fight from the front!');
    }
  }
  if(any){ recomputeSupply(state); computeFog(state); refreshUI(); }
}

/* =====================================================================
   WIN / LOSE
   ===================================================================== */
function checkWinLose(state){
  if(state.over) return;
  const enemyBuildings = state.entities.some(e=>e.owner==='enemy'&&e.kind==='building'&&!e.dead);
  const playerHas = state.entities.some(e=>e.owner==='player'&&!e.dead&&(e.kind==='building'||e.kind==='unit'));
  if(!enemyBuildings){ state.over=true; onVictory(); return; }
  if(!playerHas){ state.over=true; onDefeat(); return; }
}

