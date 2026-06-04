/* core.js — main per-tick update(state,dt) and checkWinLose(). Orchestrates units→physics→AI→fog each frame. */
function update(state, dt){
  if(state.over) return;
  state.time+=dt;
  if(typeof updateSprint==='function') updateSprint(state, dt);   // decay the tap window / ramp accel
  recomputeSupply(state);
  if(state.extractReady && typeof updateExtraction==='function') updateExtraction(state, dt);

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
    // any building with a dmg stat returns fire (turret, and the HQ's weak rooftop shot)
    const bd=DEF[b.type];
    if(bd.dmg){
      b.cd-=dt;
      const tgt=nearestEnemy(state,b, bd.range*TILE);
      if(tgt && b.cd<=0){ damage(state,tgt,bd.dmg, b); b.cd=bd.cd; b.shootFx={x:tgt.x,y:tgt.y,t:SHOOTFX_LIFE}; }
    }
    // passive auto-extraction (Satellite Office trickles Funding for the player)
    if(bd.trickle && b.owner==='player'){ const eco=playerEco(state, b.ctrl); eco.gold += bd.trickle*dt; eco.gold_collected += bd.trickle*dt; }
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
    if(u.dead||u.storedIn||u.kind!=='unit') continue;
    u.cd-=dt;
    updateUnit(state,u,dt);
    vetRegen(u,state,dt);   // out-of-combat self-heal for high-level veterans
  }
  // separation (avoid overlap)
  separation(state,dt);
  // unstick units that a stationary neighbour is blocking
  resolveStuck(state,dt);

  // ---- enemy AI ----
  if(!state.hub && !(state.extractReady && netRole==='solo')) enemyAI(state,dt);

  // ---- reclaim abandoned outposts (a player unit walking up flips them) ----
  if(!state.hub) reclaimOutposts(state);

  // ---- free captives once their guards are dead (Episode X: Biba + the intern) ----
  if(!state.hub) freeCaptives(state);

  if(state.hub && typeof updateHub==='function') updateHub(state, dt);

  // ---- fog of war ----
  computeFog(state);

  // ---- ambient topography particles (fireflies/embers/snow/dust/motes; pure visual) ----
  if(typeof updateParticles==='function') updateParticles(state, dt);

  // ---- water tide height-field + flow phase (pure visual; freezes on pause with state.time) ----
  if(typeof updateWater==='function') updateWater(state, dt);

  // ---- in-world unit dialog boxes: age out ~8s speech bubbles (pure visual) ----
  if(typeof updateDialogs==='function') updateDialogs(state, dt);

  // ---- cleanup dead ----
  let changed=false;
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.hp<=0 && e.type!=='goldmine'){
      if(e.owner==='player' && e.kind==='unit' && !window._rbReplaying && typeof LNS!=='undefined' && LNS.ultraEvent) LNS.ultraEvent('unitDeath', { unit:e, map:state.cfg&&state.cfg.name });   // cosmetic news — skip during rollback re-sim
      if(e.owner==='player' && e.kind==='unit' && e.lore && typeof recordFallen==='function') recordFallen(e);  // memorial + obituary
      killEntity(state,e); changed=true;
    }
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
    const taken = state.entities.some(u=> !u.dead && !u.storedIn && u.kind==='unit' && u.owner==='player' && dist(u,b) < reach);
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
   CAPTIVES (Episode X — the A&O prison-office)
   ===================================================================== */
// A neutral `captive` (spawned in map.js from cfg.captives) is freed the instant no living ENEMY
// unit remains within its freeRadius — i.e. the player has cleared the guards penning it in. A
// `captiveHero` (Biba) is promoted to a full player hero on release: she gains her level, dossier,
// sprite and the `hero` flag, so captureHeroes() snapshots her into the carryover and she redeploys
// every later map like Nino. A plain captive (the intern) just rejoins the workforce.
function freeCaptives(state){
  let any=false;
  for(const u of state.entities){
    if(u.dead || !u.captive) continue;
    const R=(u.freeRadius||7)*TILE;
    const stillGuarded = state.entities.some(e=> !e.dead && !e.storedIn && e.owner==='enemy' && e.kind==='unit' && dist(e,u)<R);
    if(stillGuarded) continue;
    u.captive=false; u.owner='player'; any=true;
    spawnRing(u.x,u.y,'#8effb0');
    if(u.captiveHero){
      u.hero=true; u.heroId=u.captiveName;
      if(u.captiveSprite) u.spriteType=u.captiveSprite;
      u.stars=Math.max(0, Math.min(CAREER.maxStars, u.captiveLevel||0));
      u.xp=CAREER.xpFor(u.stars);
      u.lore={ seed:(u.id||0)+1, events:[], fixed:u.captiveDossier||{ name:u.captiveName } };
      applyVetHp(u, true);
      toast('🦸 '+u.captiveName+' is free — the GRAAL\'s architect joins you.');
    } else {
      toast('🔓 Prisoner freed — they get back to work.');
    }
  }
  if(any){ recomputeSupply(state); computeFog(state); refreshUI(); }
}

/* =====================================================================
   WIN / LOSE
   ===================================================================== */
function checkWinLose(state){
  if(state.over) return;
  if(state.hub) return;
  if(state.extractReady) return;
  const enemyBuildings = state.entities.some(e=>e.owner==='enemy'&&e.kind==='building'&&!e.dead);
  const playerHas = state.entities.some(e=>e.owner==='player'&&!e.dead&&(e.kind==='building'||e.kind==='unit'));
  const playerHq = state.entities.some(e=>e.owner==='player'&&e.type==='hq'&&!e.dead);
  // Only an intern can build a new HQ — and only inside an HQ can you extract/leave the map.
  // So recovery requires a living, free intern; banked gold alone cannot rebuild without one,
  // and an intern trapped inside a just-destroyed HQ (no room to spill out) doesn't count.
  const canRecoverHq = state.entities.some(e=>e.owner==='player'&&e.type==='worker'&&!e.dead&&!e.storedIn);
  if(!enemyBuildings){
    if(netRole==='solo' && typeof beginExtractionPhase==='function'){ beginExtractionPhase(state); return; }
    if(netRole==='host' && typeof window!=='undefined' && window.MP_SESSION && MP_SESSION.mode==='campaign' && typeof enterHubFromCombat==='function'){
      enterHubFromCombat(state); return;
    }
    state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK) onVictory(); return;   // rollback: `over`/`_outcome` are serialized predicate; the loop fires the screen on the confirmed tick
  }
  if(!playerHq && !canRecoverHq){ state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK) onDefeat(); return; }
  if(!playerHas){ state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK) onDefeat(); return; }
}
