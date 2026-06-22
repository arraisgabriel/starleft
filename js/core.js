/* core.js — main per-tick update(state,dt) and checkWinLose(). Orchestrates units→physics→AI→fog each frame. */
function update(state, dt){
  if(state.over) return;
  state.time+=dt;
  // Training Grounds clock — advances in BOTH the HUB and missions (active play only), so a
  // mentorship completes whether the player idles in the H.U.B. or is off fighting elsewhere.
  if(typeof updateTrainingSessions==='function') updateTrainingSessions(dt);
  if(typeof updateRebornProduction==='function') updateRebornProduction(dt);   // The Wake clock — charges in HUB & missions
  if(typeof updateMentalHealthAccel==='function') updateMentalHealthAccel(dt); // merit-paid accelerated madosis recovery — drains on the HUB city clock (HUB only)
  if(state.hub && typeof hubObjTick==='function') hubObjTick();   // H.U.B. objectives: poll/award merits (host/solo; client-guarded inside)
  if(typeof updateSprint==='function') updateSprint(state, dt);   // decay the tap window / ramp accel
  recomputeSupply(state);
  // run-summary stat (T1-9/T3-3): track the army's high-water mark
  if(!state.hub && typeof hubEnsureStats==='function'){
    const _sup=(state.eco&&state.eco.p1&&state.eco.p1.supply)||0, _hs=hubEnsureStats(state);
    if(_sup>(_hs.peakSupply||0)) _hs.peakSupply=_sup;
  }
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
    // any building with a dmg stat returns fire (turret, and the HQ's weak rooftop shot).
    // Never in the H.U.B. — the neutral Wake (type hq) must not gun down strolling veterans.
    const bd=DEF[b.type];
    if(bd.dmg && !state.hub){
      b.cd-=dt;
      const tgt=nearestEnemy(state,b, bd.range*TILE);
      if(tgt && b.cd<=0){
        // paid per-turret upgrades (TURRET_UPGRADES): boosted damage / shorter reload
        const dmg = b.upgDamage   ? bd.dmg*TURRET_UPGRADES.damage.dmgMult    : bd.dmg;
        const cd  = b.upgFirerate ? bd.cd /TURRET_UPGRADES.firerate.rateMult : bd.cd;
        damage(state,tgt,dmg, b); b.cd=cd; b.shootFx={x:tgt.x,y:tgt.y,t:SHOOTFX_LIFE};
      }
    }
    // Market Research survey clock (host/solo authoritative; both peers in rollback)
    if(b.type==='intel' && b.scanTotal>0 && b.owner==='player'){
      b.scanProg+=dt;
      if(b.scanProg>=b.scanTotal){ b.scanProg=0; b.scanTotal=0; intelScanReveal(state); }
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
    if(u.dead||u.storedIn||u.kind!=='unit') continue;
    u.cd-=dt;
    updateUnit(state,u,dt);
    vetRegen(u,state,dt);   // out-of-combat self-heal for high-level veterans
    if(typeof updateMadosis==='function') updateMadosis(state,u,dt);   // sanity: episode onset + escalation
    if(typeof updateVillain==='function' && u.villain) updateVillain(state,u,dt);   // boss: phases / abilities / flee (authoritative path only)
  }
  // separation (avoid overlap)
  separation(state,dt);
  // unstick units that a stationary neighbour is blocking
  resolveStuck(state,dt);

  // ---- enemy AI ----
  if(!state.hub && !(state.extractReady && netRole==='solo')) enemyAI(state,dt);

  // ---- T2-8: scripted mid-mission beats — cfg.events [{atTime,…}] fire once each, in order.
  // Host/solo only (this whole update path is); clients see results via snapshots. Deterministic:
  // keyed to state.time, no RNG; the fired-set is plain serialized state so saves/rollback agree.
  if(!state.hub && !state.over && state.cfg && state.cfg.events && state.cfg.events.length){
    state._eventsFired = state._eventsFired || {};
    for(let i=0;i<state.cfg.events.length;i++){
      if(state._eventsFired[i]) continue;
      const ev=state.cfg.events[i];
      if((state.time||0) < (ev.atTime||0)) continue;
      state._eventsFired[i]=1;
      runMapEvent(state, ev);
    }
  }

  // ---- reusable HOLDOUT / wave-defense (waves.js): cfg.holdout drives a staged "hold the position
  // through N escalating waves (+ optional boss)" objective. Host/solo only (this whole path is);
  // clients see the spawned waves/boss as synced entities and the progress via synced G.quests. ----
  if(!state.hub && typeof holdoutTick==='function') holdoutTick(state, dt);

  // ---- DEFERRED villain (villains.js): a boss whose cfg.villain has an `after` quest surfaces mid-
  // mission once that quest is done (THE SEVERANCIER on Episode VII when all eight campuses are razed).
  // Host/solo only; clients see the spawned boss as a synced entity. defeatVillain can't complete until
  // the boss is both spawned and gone, so the one-tick lag vs questsTick can't trigger an early win. ----
  if(!state.hub && typeof villainDeferredSpawn==='function') villainDeferredSpawn(state);

  // ---- generic map cutscenes (story-polish §5): intro at mission start / reach-the-objective beats ----
  if(!state.hub && typeof mapCutsceneTick==='function') mapCutsceneTick(state);

  // ---- reclaim abandoned outposts (a player unit walking up flips them) ----
  if(!state.hub) reclaimOutposts(state);

  // ---- MADOSIS: post-episode cooldown + walk-over memory collection (any player unit) ----
  if(!state.hub && typeof madGlobalTick==='function') madGlobalTick(state, dt);

  // ---- free captives once their guards are dead (Episode X: Biba + the intern) ----
  if(!state.hub) freeCaptives(state);

  if(state.hub && typeof updateHub==='function') updateHub(state, dt);

  // ---- fog of war ----
  if(PERF.on) PERF.mark('fogSim');
  computeFog(state);
  if(PERF.on) PERF.lap('fogSim');

  // ---- ambient topography particles (fireflies/embers/snow/dust/motes; pure visual) ----
  if(typeof updateParticles==='function') updateParticles(state, dt);

  // ---- water tide height-field + flow phase (pure visual; freezes on pause with state.time) ----
  if(typeof updateWater==='function') updateWater(state, dt);

  // ---- in-world unit dialog boxes: age out ~8s speech bubbles (pure visual) ----
  if(typeof updateDialogs==='function') updateDialogs(state, dt);

  // ---- Quarter I guided tutorial: poll live state, advance steps (purely local/cosmetic, solo) ----
  if(typeof TUTORIAL!=='undefined') TUTORIAL.update(state, dt);

  // ---- cleanup dead ----
  let changed=false;
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.hp<=0 && e.type!=='goldmine'){
      // EX-TERMINATOR FLEE: a villain flagged fleeExtract does NOT die when beaten — an A&O bomber airlifts
      // him out (escape cinematic, "I'll be back"). beginBossExtract keeps him alive + pays the win XP + plays
      // the cutscene; its close marks him escaped → a (fled) WIN. Skip the normal death/removal path entirely.
      if(e.villain && e.owner==='enemy' && !e._extracting && typeof VILLAINS!=='undefined' && VILLAINS[e.villainId] && VILLAINS[e.villainId].fleeExtract && typeof beginBossExtract==='function'){
        beginBossExtract(state, e); changed=true; continue;
      }
      // VILLAIN DOWN: the tick a boss reaches 0 HP (a real KILL — a fled ninja set e.dead with hp>0 and was
      // skipped at the top of this loop), award the squad-wide bonus XP to every surviving career unit BEFORE removal.
      if(e.villain && e.owner==='enemy' && typeof awardVillainKillXp==='function') awardVillainKillXp(state, e);
      // CYBERWARE: Second Heart — a one-shot per-mission auto-revive. Fires BEFORE any death bookkeeping
      // (no obituary, no unitsLost) so the unit just stays in the fight; spent for the rest of the drop.
      // _chromeRevived is unset at mkUnit spawn (→ per-mission) and round-trips save/rollback (deterministic).
      if(e.kind==='unit' && e.owner==='player' && e.chromeRevive && !e._chromeRevived){
        e._chromeRevived=true; e.hp=e.maxHp; changed=true;
        if(!window._rbReplaying && typeof spawnRing==='function') spawnRing(e.x, e.y, '#7fd6ff');   // cosmetic pulse; skipped under rollback re-sim
        continue;
      }
      // Biba can't die: a downed hero medic falls back to the nearest HQ for end-of-mission extraction
      // instead of dying — so this runs BEFORE the obituary/fallen side-effects below.
      if(e.kind==='unit' && e.owner==='player' && typeof isHealerVet==='function' && isHealerVet(e)){ downHeroToHq(state,e); changed=true; continue; }
      if(e.owner==='player' && e.kind==='unit' && !window._rbReplaying && typeof LNS!=='undefined' && LNS.ultraEvent) LNS.ultraEvent('unitDeath', { unit:e, map:state.cfg&&state.cfg.name });   // cosmetic news — skip during rollback re-sim
      if(e.owner==='player' && e.kind==='unit' && typeof hubEnsureStats==='function'){   // run-summary / score (T1-9/T3-3)
        const _hs=hubEnsureStats(state);
        _hs.unitsLost=(_hs.unitsLost||0)+1;
        if(e.hero) _hs.heroDeaths=(_hs.heroDeaths||0)+1;                       // quests: heroesAlive
        if(e.hero || (e.stars||0)>=2) _hs.vetDeaths=(_hs.vetDeaths||0)+1;      // quests: noVetDeaths ("no new names on the wall")
      }
      if(e.owner==='player' && e.kind==='unit' && e.lore && typeof recordFallen==='function') recordFallen(e);  // memorial + obituary
      killEntity(state,e); changed=true;
    }
    if(e.type==='goldmine' && e.amount<=0){ e.dead=true; }
  }
  if(changed){ state.selection=state.selection.filter(e=>!e.dead); recomputeSupply(state); refreshUI(); }

  checkWinLose(state);
}
/* =====================================================================
   SCRIPTED MAP EVENTS (T2-8) — authored pacing on top of the procedural AI.
   Each cfg.events entry: { atTime:sec, …one or more actions… }:
     toast:'…'                — one-time message (cosmetic; skipped in rollback resim)
     objective:'…'            — replace the HUD objective line
     aggression:N             — set cfg.aggression from here on (waves/production read it live)
     spawnSquad:{at:{x,y}, comp:[['soldier',4],…], guard?:true}  — drop an enemy squad
     villain:{id:'…', x, y}   — spawn a mini-boss (reuses spawnVillainEntry)
   Coordinates are unscaled map tiles; scaleCfg already scaled ev.at — squad/villain x/y are
   given via ev.at for that reason.
   ===================================================================== */
function runMapEvent(state, ev){
  try{
    if(ev.aggression!=null) state.cfg.aggression=ev.aggression;
    if(ev.objective){ state.cfg.objective=ev.objective; state._objBase=ev.objective; }
    if(ev.spawnSquad && typeof mkUnit==='function'){
      const at=ev.at||ev.spawnSquad.at||state.cfg.player; let i=0;
      for(const pair of (ev.spawnSquad.comp||[['soldier',4]])){
        const type=pair[0], n=pair[1]|0;
        for(let k=0;k<n;k++){ const u=mkUnit(state, type, 'enemy', (at.x|0)+(i%4)-1, (at.y|0)+((i/4)|0)); if(ev.spawnSquad.guard) u.guard=true; i++; }
      }
    }
    if(ev.villain && typeof spawnVillainEntry==='function'){
      const at=ev.at||ev.villain;
      spawnVillainEntry(state, { id:ev.villain.id||ev.villain, x:(at.x!=null?at.x:ev.villain.x), y:(at.y!=null?at.y:ev.villain.y) });
    }
    if(ev.toast && !window._rbReplaying && typeof eventToast==='function') eventToast('📡 '+ev.toast, 10000);
    if(!window._rbReplaying && typeof refreshUI==='function') refreshUI();
  }catch(e){ console.warn('[events] map event failed', e); }
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
// A neutral `captive` (spawned in map.js from cfg.captives) is freed only when NINO — the one hero you
// break in with — reaches the cell and stands in arm's reach. Clearing the guards is not enough: the
// player must physically extract them, and reaching one captive frees everyone caged together (Biba +
// the intern in the same breath). A `captiveHero` (Biba) is promoted to a full player hero on release:
// she gains her level, dossier, sprite and the `hero` flag, so captureHeroes() snapshots her into the
// carryover and she redeploys every later map like Nino. A plain captive (the intern) rejoins the workforce.
function freeCaptives(state){
  if(!state.entities.some(u=> !u.dead && u.captive)) return;   // only Episode X has captives — skip the rescuer scan everywhere else
  // the rescuer is Nino (the lone player hero of the break-in). No Nino on the field → nobody can free them.
  const rescuer = state.entities.find(e=> !e.dead && !e.storedIn && e.owner==='player' && e.kind==='unit'
                    && e.hero && (e.heroId==='Nino' || e.spriteType==='nino'));
  if(!rescuer) return;
  const REACH = 3.0*TILE;
  let triggered=false;
  for(const u of state.entities){ if(u.dead || !u.captive) continue;
    if(dist(rescuer,u) <= REACH){ triggered=true; break; } }   // Nino has reached the cell
  if(!triggered) return;
  let any=false;
  for(const u of state.entities){
    if(u.dead || !u.captive) continue;
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
      if(typeof ACH!=='undefined' && !window._rbReplaying) ACH.fire('architect');   // T3-5
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
  if(state._sandboxNoEnd) return;   // sandbox test tool: freeze win/loss while staging a battle (localhost only; flag set only by js/sandbox.js)
  if(state.hub) return;
  if(state.extractReady) return;
  // ---- BOSS DEATH CUTSCENE (EX-TERMINATOR): the instant the boss is gone, play his death lines (ending
  // "I'll be back") BEFORE any victory path (quest OR villain) declares the win. The sim freezes on the
  // cutscene (main.js), and the natural re-check after it closes declares victory normally. One-shot via
  // _bossDeathCsDone; solo only. Must precede the quests branch below (which returns and would skip this).
  if(state.cfg && state.cfg.villain && state._villainSpawned && !state._bossDeathCsDone
     && typeof tryBossDeathCutscene==='function'
     && !state.entities.some(e=>e.villain && !e.dead && !e.escaped)){
    if(tryBossDeathCutscene(state)) return;
  }
  // ---- QUEST MAPS: cfg.quests declares the objectives; victory = all required quests done
  // (or a winsAlone quest). Defeat = a required quest failed (escort VIP dead / protected
  // building razed) or the standard no-HQ/no-force checks. Maps WITHOUT cfg.quests fall
  // through to the legacy chain below (villain / _pvp / winCondition / razeAll) — zero
  // regression for hub, skirmish, sandbox, mutator and legacy/custom cfgs.
  if(state.cfg && state.cfg.quests && state.cfg.quests.length && !state._pvp && typeof questsTick==='function'){
    questsTick(state);   // lazy-ensure + evaluate (host/solo only by construction — clients never run update())
    if(questsAnyRequiredFailed(state)){ state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK) onDefeat(); return; }
    if(questsAllRequiredDone(state) || questsAnyWinsAloneDone(state)){ questsDeclareVictory(state); return; }
    standardDefeatChecks(state);
    return;   // no razeAll default on a quest map — the quest list is the win condition
  }
  // BOSS MAPS: the named villain's fate decides the outcome and takes precedence over the normal
  // "no enemy buildings = win" rule (a boss arena may have NO enemy buildings → would insta-win).
  if(state.cfg && state.cfg.villain && typeof villainCheckWinLose==='function'){ if(villainCheckWinLose(state)) return; }
  // ---- T2-1: second & third win verbs. cfg.winCondition branches BEFORE the razeAll default;
  // a missing/unknown winCondition is razeAll, so legacy maps and old saves are untouched.
  // Runs on host/solo only (this function is never called on clients — they get `over` via snapshot).
  // ---- T4-5 duel: last founder standing. A side is OUT when it has no HQ-or-rebuild path
  // and no fielded force — same recovery logic as the solo lose check, per controller.
  if(state._pvp){
    const sideUp=(ctrl)=>{
      const hasHq=state.entities.some(e=>!e.dead&&e.owner==='player'&&(e.ctrl||'p1')===ctrl&&e.type==='hq');
      const canRebuild=state.entities.some(e=>!e.dead&&!e.storedIn&&e.owner==='player'&&(e.ctrl||'p1')===ctrl&&e.type==='worker');
      const hasAny=state.entities.some(e=>!e.dead&&e.owner==='player'&&(e.ctrl||'p1')===ctrl&&(e.kind==='unit'||e.kind==='building'));
      return hasAny && (hasHq||canRebuild);
    };
    const p1=sideUp('p1'), p2=sideUp('p2');
    if(!p1 || !p2){
      state.over=true;
      state._pvpWinner = (!p1 && !p2) ? null : (!p2 ? 'p1' : 'p2');
      state._outcome = (state._pvpWinner===(typeof LOCAL_CTRL!=='undefined'?LOCAL_CTRL:'p1')) ? 'win' : 'lose';
      if(!window.USE_ROLLBACK){
        if(state._pvpWinner===(typeof LOCAL_CTRL!=='undefined'?LOCAL_CTRL:'p1')){ state._skirmish=true; onVictory(); }
        else onDefeat();
      }
    }
    return;   // a duel never uses the razeAll / AI-faction checks
  }
  const wc = state.cfg && state.cfg.winCondition;
  if(wc && wc.type && wc.type!=='razeAll'){ if(checkAltWin(state, wc)) return; }
  const enemyBuildings = state.entities.some(e=>e.owner==='enemy'&&e.kind==='building'&&!e.dead);
  if(!enemyBuildings){
    if(state._skirmish){ state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK) onVictory(); return; }   // T3-2: skirmish ends here, no extraction/hub
    if(netRole==='solo' && typeof beginExtractionPhase==='function'){ beginExtractionPhase(state); return; }
    if(netRole==='host' && typeof window!=='undefined' && window.MP_SESSION && MP_SESSION.mode==='campaign' && typeof coopCampaignWin==='function'){
      coopCampaignWin(state); return;   // Ep VII → shared nuke finale; every other Quarter → H.U.B. (both published via mphub)
    }
    state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK) onVictory(); return;   // rollback: `over`/`_outcome` are serialized predicate; the loop fires the screen on the confirmed tick
  }
  standardDefeatChecks(state);
}

// Player-loss conditions shared by the quest branch and the razeAll default (villains.js
// bossDefeatChecks is the same predicate). Only an intern can build a new HQ — and only inside
// an HQ can you extract/leave the map. So recovery requires a living, free intern; banked gold
// alone cannot rebuild without one, and an intern trapped inside a just-destroyed HQ (no room
// to spill out) doesn't count.
function standardDefeatChecks(state){
  const playerHq = state.entities.some(e=>e.owner==='player'&&e.type==='hq'&&!e.dead);
  const canRecoverHq = state.entities.some(e=>e.owner==='player'&&e.type==='worker'&&!e.dead&&!e.storedIn);
  const playerHas = state.entities.some(e=>e.owner==='player'&&!e.dead&&(e.kind==='building'||e.kind==='unit'));
  if((!playerHq && !canRecoverHq) || !playerHas){
    state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK) onDefeat();
    return true;
  }
  return false;
}

/* =====================================================================
   ALT WIN VERBS (T2-1) — cfg.winCondition drives the mission's victory:
     {type:'survive', forSec:N, protect:'hq'?}          — outlast the clock while the protected building lives
     {type:'escort',  to:{x,y}, radius?:T}              — get a VIP (map.js flags u._vip) to the target tile
     {type:'reachAndHold', at:{x,y}, radius?:T, holdSec:N} — hold the zone for N continuous seconds
   Coordinates are in UNSCALED map-config tiles (scaleCfg multiplies them like everything else).
   Returns true when it decided the outcome (win or escort-lose). All state used here is either
   cfg (deterministic) or plain serialized fields (_holdT), so saves/rollback stay consistent.
   ===================================================================== */
function winTargetPx(wc){
  const t=wc.to||wc.at; if(!t) return null;
  return { x:(t.x+0.5)*TILE, y:(t.y+0.5)*TILE, r:(wc.radius!=null?wc.radius:2.2)*TILE };
}
function altWinTriggered(state){
  if(state._skirmish){ state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK) onVictory(); return; }   // T3-2
  if(netRole==='solo' && typeof beginExtractionPhase==='function'){ beginExtractionPhase(state); return; }
  if(netRole==='host' && typeof window!=='undefined' && window.MP_SESSION && MP_SESSION.mode==='campaign' && typeof coopCampaignWin==='function'){
    coopCampaignWin(state); return;   // Ep VII → shared nuke finale; every other Quarter → H.U.B. (both published via mphub)
  }
  state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK) onVictory();
}
/* Pure-ish evaluators — ONE body of logic shared by the quest types (js/quests.js survive/escort/
   reachAndHold) and the quest-less checkAltWin fallback below (still needed forever: mutators
   inject winCondition into skirmish cfgs). They return 'run' | 'win' | 'lose' and never set
   over/outcome themselves. */
function evalSurvive(state, wc){
  const forSec=wc.forSec||300;
  const prot = wc.protect==='none' ? true
    : state.entities.some(e=>e.owner==='player'&&e.type===(wc.protect||'hq')&&!e.dead);
  if(!prot) return 'lose';
  if(state.time>=forSec) return 'win';
  return 'run';
}
function evalEscort(state, wc){
  const tgt=winTargetPx(wc); if(!tgt) return 'run';
  const vips=state.entities.filter(e=>e._vip && e.kind==='unit');
  const alive=vips.filter(e=>!e.dead);
  if(vips.length && !alive.length) return 'lose';
  for(const v of alive){ if(!v.storedIn && Math.hypot(v.x-tgt.x, v.y-tgt.y)<=tgt.r) return 'win'; }
  return 'run';
}
// The hold accumulator is the CALLER's serialized state (legacy: state._holdT/_holdPrevT;
// quest: q.t/q.prevT) — passed in and handed back so both paths stay save/rollback-consistent.
// fixed-ish step: checkWinLose runs once per update tick; accumulate real elapsed time via
// state.time deltas (dt-free approximation like other timers). Absence decays at half speed.
function evalReachAndHold(state, wc, t, prevT){
  const tgt=winTargetPx(wc); if(!tgt) return {r:'run', t:t||0, prevT, present:false};
  const holdSec=wc.holdSec||45;
  const present=state.entities.some(e=>e.owner==='player'&&e.kind==='unit'&&!e.dead&&!e.storedIn
    && Math.hypot(e.x-tgt.x,e.y-tgt.y)<=tgt.r);
  if(prevT==null) prevT=state.time;
  const dt=Math.max(0, state.time-prevT); prevT=state.time;
  t = present ? (t||0)+dt : Math.max(0,(t||0)-dt*0.5);
  return { r:(t>=holdSec?'win':'run'), t, prevT, present };
}
function checkAltWin(state, wc){
  if(wc.type==='survive'){
    const r=evalSurvive(state, wc);
    if(r==='lose'){ state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK) onDefeat(); return true; }
    if(state._objBase==null) state._objBase=state.cfg.objective||'Survive.';
    state.cfg.objective = state._objBase+'  ⏳ '+Math.max(0, (wc.forSec||300)-(state.time|0))+'s';
    if(r==='win'){ altWinTriggered(state); return true; }
    return false;   // clock still running — the normal lose checks below still apply
  }
  if(wc.type==='escort'){
    const r=evalEscort(state, wc);
    if(r==='lose'){ state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK) onDefeat(); return true; }
    if(r==='win'){ altWinTriggered(state); return true; }
    return false;
  }
  if(wc.type==='reachAndHold'){
    const holdSec=wc.holdSec||45;
    const res=evalReachAndHold(state, wc, state._holdT||0, state._holdPrevT);
    state._holdT=res.t; state._holdPrevT=res.prevT;
    if(state._objBase==null) state._objBase=state.cfg.objective||'Hold the position.';
    state.cfg.objective = state._objBase+'  ⏳ '+Math.max(0, Math.ceil(holdSec-(state._holdT||0)))+'s'+(res.present?'':' — move in!');
    if(res.r==='win'){ altWinTriggered(state); return true; }
    return false;
  }
  return false;   // unknown verb → fall through to razeAll
}
