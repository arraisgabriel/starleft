/* madosis.js — the Madosis (madness / sanity) runtime.

   A veteran's accumulated career trauma can break their mind mid-mission, turning them into a
   hostile "mad dog" that attacks the player's own units. The player can let it die (losing the
   veteran), or RESCUE it with a healer (memory-anchors mini-game) — at the cost of a Kennel
   death-squad ambush — and later TREAT it at the HUB Mental Health Facility (see hub.js hubHeal*).

   All balance lives in MADOSIS / KENNEL (config.js). Per-unit state on the entity (auto-serialized):
     u.sanityThreshold  minted once at level 2, deterministic from the lore seed
     u.madosis          accumulated points; an episode arms when it crosses the (effective) threshold
     u.scarred          permanent after a first episode — lowers the future threshold (no real cure)
     u.madEpisode       {phase:'tremor'|'defiance'|'feral', t}  (transient, in-mission)
     u.madDog           feral now — hostile to all, targetable by all
     u.calmStage        0..3 memory echoes recovered during a rescue (lowers feral damage)
     u.subdued          rescued: sane but combat-disabled, must be escorted/extracted

   Determinism: all simulated rolls use simRandom(state) (rollback-safe); the level-2 threshold is
   minted from a frozen lore seed via makeRng (consumes no sim RNG). Cosmetic toasts/barks are skipped
   while window._rbReplaying (rollback re-sim), matching the rest of the codebase.

   Depends on globals: MADOSIS/KENNEL/DEF/TILE (config.js), makeRng/simRandom/mapIndex (state.js),
   isCombatVet (career.js), buildDossier (lore.js), dist (units.js), toast (ui.js). */

/* ---- helpers ---- */
// current episode number (1-based). mapIndex is the loaded map (0-based); Episode N = MAPS[N-1].
// Boss-duel arenas (appended villain maps) return 0 — a sentinel below every Madosis threshold — so
// veteran breakdowns stay suppressed during the fight (the duel isn't also a sanity-management map).
function madEpisodeNo(){
  if(typeof mapIndex==='number' && typeof MAPS!=='undefined' && MAPS[mapIndex] && MAPS[mapIndex].isVillain) return 0;
  return (typeof mapIndex==='number' ? mapIndex : 0) + 1;
}

// effective break threshold — a scarred (previously-broken) unit snaps sooner.
function madThreshold(u){
  const base = u.sanityThreshold || 0;
  return u.scarred ? base * MADOSIS.scarThresholdMul : base;
}

// TEMPORARY field relief (Mindfulness Facilitator unit): the CURRENT suppression points on a unit. While
// the facilitator channels, this grows up to `frac` of the unit's madosis; once tending stops, madGlobalTick
// reverts it toward 0 at fieldRelief.decayPerSec (1 pt / 5s by default), so a calmed mind drifts back to its
// true madosis SLOWLY rather than snapping back. The decay is applied to u.madRelief itself, so this is just
// a read of the live value — on a co-op CLIENT the host sends the already-current value (madReliefT===null),
// carried straight through the same way. 0 = none.
function madReliefActive(u){
  return (u && u.madRelief>0) ? u.madRelief : 0;
}
// EFFECTIVE madosis for breakdown checks + display = true accrued madosis minus active temporary relief.
// The true u.madosis stat is never lowered by relief, so extraction (which snapshots u.madosis) drops it.
function madEffective(u){
  return Math.max(0, ((u && u.madosis) || 0) - madReliefActive(u));
}

// short display name for toasts/barks (dossier first name, else unit-type name).
function madName(u){
  if(typeof buildDossier==='function' && u.lore){ const d=buildDossier(u); if(d && d.first) return d.first; }
  return (DEF[u.type] && DEF[u.type].name) || 'A unit';
}
function madToast(u, msg){ if(typeof toast==='function') toast(msg); }

// outgoing-damage multiplier from a unit's madosis state (read in units.js at fire time).
function madDmgMul(u){
  if(u.madDog){
    let m = MADOSIS.feralDmgMul;
    if(u.calmStage!=null){ const f = MADOSIS.calmDmgFalloff[u.calmStage]; if(f!=null) m *= f; }
    return m;
  }
  if(u.madEpisode) return MADOSIS.tremorDmgMul;   // tremor/defiance: shaky hands
  return 1;
}

// deterministic break threshold from a lore seed — heroes are far steadier, so their break point
// sits much higher (heroThresholdMul). Pure: consumes no sim RNG. Shared by the level-2 mint and
// the legacy-save backfill (which has only a roster snapshot, not a live entity).
function madRollThreshold(seed, hero){
  const r = makeRng((((seed||0) ^ 0x5ad505) >>> 0));
  let thr = MADOSIS.thresholdMin + r()*(MADOSIS.thresholdMax - MADOSIS.thresholdMin);
  if(hero) thr *= MADOSIS.heroThresholdMul;
  return Math.round(thr);
}

// mint the per-unit sanity threshold ONCE at level 2, deterministically from the lore seed so it's
// stable across save/load/replay and never disturbs the simulation RNG stream. Called from gainXp.
function mintSanityThreshold(u){
  if(u.sanityThreshold) return;
  if(typeof isCombatVet==='function' && !isCombatVet(u) && !u.hero) return;  // healers/workers never break
  const seed = (u.lore && u.lore.seed!=null) ? u.lore.seed : ((u.id||0)+1);
  u.sanityThreshold = madRollThreshold(seed, u.hero);
}

// add madosis points to one unit; returns true if this push crosses its effective threshold.
function addMadosis(u, amount, reason){
  if(!u || u.dead || u.owner!=='player' || !(amount>0)) return false;
  if(typeof G!=='undefined' && G && G._madosisMul) amount *= G._madosisMul;   // T3-4 'Sanity Collapse' mutator (skirmish-only; serialized state)
  if(u.hero) amount *= MADOSIS.heroAccrualMul;   // heroes are steadier — trauma weighs on them less
  const before = u.madosis||0;
  u.madosis = before + amount;
  const thr = madThreshold(u);
  return thr>0 && before < thr && u.madosis >= thr;
}

// THE EVENT BUS — award `key` points to every eligible surviving player veteran. Extend the system
// by adding a key to MADOSIS.events and a single madosisEvent(state,key,ctx) call at the trigger site.
// Gated to live missions (never the HUB) and to Episode `accrueFromEpisode`+.
function madosisEvent(state, key, ctx){
  if(!state || state.hub) return;
  if(madEpisodeNo() < MADOSIS.accrueFromEpisode) return;
  const pts = MADOSIS.events[key]; if(!(pts>0)) return;
  const src = ctx && (ctx.dead || ctx.b || ctx.src) || null;   // the triggering entity (excluded)
  const R = MADOSIS.vetDeathRadius>0 ? MADOSIS.vetDeathRadius*TILE : 0;
  let griever=null;   // T1-6: the most-frayed nearby survivor reacts out loud to a comrade's death
  for(const u of state.entities){
    if(u.dead || u.storedIn || u.owner!=='player' || u.kind!=='unit' || u===src) continue;
    if(u.subdued || u.madDog) continue;                 // already broken / being saved
    if(!u.sanityThreshold) continue;                    // not yet level 2 → no mind to break
    if(R && src && typeof dist==='function' && dist(u,src) > R) continue;
    addMadosis(u, pts, key);                             // onset itself is rolled in updateMadosis
    if(!griever || (u.madosis||0) > (griever.madosis||0)) griever=u;
  }
  // grief bark (T1-6): the invisible trauma accrual gets a voice — cosmetic, text-only, skipped
  // during rollback resim like the other madosis toasts.
  if(griever && (key==='vetDeath' || key==='heroDeath') && !window._rbReplaying
     && typeof loreSayFallback==='function' && typeof pushDialog==='function'){
    const thr=(typeof madThreshold==='function')?madThreshold(griever):(griever.sanityThreshold||1);
    const line=loreSayFallback('grief', (griever.madosis||0)/Math.max(1,thr) > 0.6 ? 'neg' : 'neutral');
    if(line){
      let txt=line;
      try{ if(griever.lore && typeof buildDossier==='function') txt=buildDossier(griever).fill(line); }
      catch(e){ txt=line.replace(/\{relName\}/g,'them').replace(/\{home\}/g,'home'); }
      pushDialog(griever, txt, { type:'lore', tone:'grief' });
    }
  }
}

// rest-decay (HUB): a veteran left out of a dispatch recovers a little sanity, UNLESS occupied at
// dispatch time in a Training Grounds session or the Mental Health Facility. Operates on the
// persistent CAMPAIGN.roster snapshots (the source of truth that re-spawns the HUB). Called from
// hubDispatchNextEpisode.
function madosisRestDecay(dispatchedKeys){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN) return;
  const occupied = new Set();
  const addGroup=(grp)=>{ const t=CAMPAIGN[grp]||{staged:[],sessions:[]};
    (t.staged||[]).forEach(s=>{ if(s && s.key) occupied.add(s.key); });
    (t.sessions||[]).forEach(s=>{ if(!s) return;
      if(s.a&&s.a.key) occupied.add(s.a.key); if(s.b&&s.b.key) occupied.add(s.b.key);   // training pair
      if(s.unit&&s.unit.key) occupied.add(s.unit.key); });                               // healing single
  };
  addGroup('training'); addGroup('healing');
  for(const r of (CAMPAIGN.roster||[])){
    if(!r || (dispatchedKeys && dispatchedKeys.has(r.key)) || occupied.has(r.key)) continue;
    if(!(r.madosis>0)) continue;
    r.madosis = Math.max(0, r.madosis - MADOSIS.decayPerSkip);
  }
}

/* ---- per-unit per-frame driver (called from core.js next to vetRegen, mission-only) ----
   Rolls episode onset for over-threshold units and advances an active episode's phase clock. */
function updateMadosis(state, u, dt){
  if(state.hub || u.dead || u.kind!=='unit' || u.owner!=='player' || u.subdued) return;

  if(!u.madEpisode){
    if(u.madDog) return;                                       // already feral (e.g. loaded mid-episode)
    if(madEpisodeNo() < MADOSIS.firstEpisodeEpisode) return;   // no breakdowns before Episode 6
    if(!u.sanityThreshold) return;
    const thr = madThreshold(u);
    if(!(thr>0 && madEffective(u) >= thr)) return;              // field relief (Mindfulness Facilitator) holds onset off
    // one-at-a-time + post-episode cooldown gates — pure reads of shared sim state BEFORE the
    // simRandom roll, so skipping is deterministic across save/load/rollback/co-op.
    if(MADOSIS.maxConcurrentEpisodes){
      let active=0;
      for(const o of state.entities)
        if(!o.dead && o.kind==='unit' && o.owner==='player' && (o.madEpisode||o.madDog)) active++;
      if(active >= MADOSIS.maxConcurrentEpisodes) return;
    }
    if((state._madCalmUntil||0) > (state.time||0)) return;
    if(simRandom(state) < MADOSIS.onsetChancePerSec*dt){
      u.madEpisode = { phase:'tremor', t:0 };
      if(!window._rbReplaying){
        madToast(u, '⚠ '+madName(u)+' is cracking — a Mad Dog Day begins.');
        if(typeof TUTORIAL!=='undefined') TUTORIAL.fireContextual('madosis-live', state);   // one-time deferred coach hint
      }
    }
    return;
  }

  const ep = u.madEpisode; ep.t += dt;
  if(ep.phase==='tremor' && ep.t >= MADOSIS.tremorDur){ ep.phase='defiance'; ep.t=0; }
  else if(ep.phase==='defiance' && ep.t >= MADOSIS.defianceDur){
    ep.phase='feral'; ep.t=0; u.madDog=true; u.calmStage=0;
    if(typeof madDropEchoes==='function') madDropEchoes(state, u);   // memories surface NOW — sim state, never _rbReplaying-gated
    if(!window._rbReplaying){
      madToast(u, '🐕 '+madName(u)+' has gone feral — three memories surfaced. Send a Recruiter or healer to walk them back, or put them down.');
      if(typeof spawnRing==='function') spawnRing(u.x, u.y, '#b05bff');
    }
  }
}

/* =====================================================================
   RESCUE — "memory anchors" (walk-the-dossier). Escort a healer (Recruiter / Biba) through the mad
   dog's life: recover 3 memory echoes (trauma / family / dream) scattered & reachable across the map.
   All 3 → the dog is SUBDUED (sane but fragile), and a Kennel death-squad is sent (Phase 4).
   Started from commandUnits (units.js) when a healer is right-clicked / tapped onto a mad dog —
   which is already networked via netCommand, so host/solo run it and clients see it via snapshots.
   ===================================================================== */

// can this unit perform a rescue? Recruiters and any hero healer (Biba); gated by def.heal.
function madCanRescue(u){
  if(!u || u.dead || u.kind!=='unit' || u.owner!=='player' || u.subdued) return false;
  const d=DEF[u.type]; if(!d || !(d.heal>0)) return false;
  return MADOSIS.rescueRescuers.indexOf(u.type)>=0 || !!u.hero;
}

function madTileOf(e){ return [Math.floor(e.x/TILE), Math.floor(e.y/TILE)]; }

// pick a passable, REACHABLE tile ~band tiles from the dog (deterministic; findPath validates +
// snaps to the nearest walkable tile). Bands are clamped to the map and floored at echoMinDist so
// memories always sit far from the feral dog's reach; candidate angles are tried farthest-from-
// the-nearest-enemy-base first so collectors aren't sent into a fortified camp. findPath calls are
// budgeted (blocked tiles pre-rejected) to bound the one-time feral-onset cost on huge bands.
function madPlaceEcho(state, dog, band, idx){
  const [dtx,dty]=madTileOf(dog), W=state.W, H=state.H;
  const minD=MADOSIS.echoMinDist||12;
  band = Math.max(minD, Math.min(band, Math.hypot(W,H)*(MADOSIS.echoBandMaxFrac||0.45)));
  const radii=[band, band*0.85, band*1.15, band*0.7, Math.max(minD, band*0.55)];
  // enemy base positions (cfg tile coords, already MAP_SCALE-scaled) for the away-bias sort
  const cfg=state.cfg||{}, bases=cfg.enemies || (cfg.enemy?[cfg.enemy]:[]);
  const baseDist=(tx,ty)=>{ let m=1e18; for(const b of bases){ const d=(b.x-tx)*(b.x-tx)+(b.y-ty)*(b.y-ty); if(d<m) m=d; } return m; };
  let budget=20, fallback=null;
  for(const rr of radii){
    let angles=[]; for(let k=0;k<12;k++) angles.push(idx*1.7 + k*(Math.PI*2/12));
    if(bases.length) angles.sort((a,b)=> baseDist(dtx+Math.cos(b)*rr, dty+Math.sin(b)*rr) - baseDist(dtx+Math.cos(a)*rr, dty+Math.sin(a)*rr));
    for(const a of angles){
      const ctx=Math.round(dtx+Math.cos(a)*rr), cty=Math.round(dty+Math.sin(a)*rr);
      if(ctx<1||cty<1||ctx>=W-1||cty>=H-1) continue;
      if(state.blocked && state.blocked[cty*W+ctx]) continue;   // free reject before pathing
      if(!fallback) fallback=[ctx,cty];                          // best-priority unblocked candidate
      if(typeof findPath!=='function') return [ctx,cty];
      if(budget<=0) continue;                                    // path budget spent → keep fallback
      budget--;
      const path=findPath(state, dtx, dty, ctx, cty);
      if(path && path.length){ const last=path[path.length-1]; return [last[0], last[1]]; }
    }
  }
  return fallback || [dtx,dty];
}

function madSpawnEcho(state, dog, facet, tileXY){
  // dogId (a stable primitive) — NOT a live ref: survives save/load relink and net snapshots cleanly.
  const e=mkEntity(state, 'echo', 'neutral', tileXY[0], tileXY[1], {
    kind:'echo', facet, dogId:dog.id, reached:false, r:12, sight:0, hp:1, maxHp:1,
  });
  state.entities.push(e);
  return e;
}

// drop a feral dog's 3 memory echoes onto the map (idempotent — keyed off this dog's live echoes, NOT
// the rescue flag, since echoes now surface the instant the dog turns, before any healer is committed).
function madDropEchoes(state, dog){
  if(!dog || dog.dead) return;
  if(state.entities.some(e=> e.kind==='echo' && !e.dead && e.dogId===dog.id)) return;
  if(dog.calmStage==null) dog.calmStage=0;
  const bands=MADOSIS.echoDistBands, facets=MADOSIS.echoFacets;
  for(let i=0;i<facets.length;i++){
    const xy=madPlaceEcho(state, dog, (bands[i]!=null?bands[i]:8), i);
    madSpawnEcho(state, dog, facets[i], xy);
  }
}

// begin (or join) a rescue: first healer spawns the 3 echoes; every rescuer gets the rescue command.
function madBeginRescue(state, healer, dog){
  if(!madCanRescue(healer) || !dog || dog.dead || !dog.madDog) return;
  if(!dog._rescue){
    dog._rescue=true; if(dog.calmStage==null) dog.calmStage=0;
    if(typeof madDropEchoes==='function') madDropEchoes(state, dog);   // fallback: usually already dropped at feral onset
    if(!window._rbReplaying) madToast(dog, '🧠 Rescue: walk '+madName(dog)+'’s memories — reach all three echoes.');
  }
  if(typeof resetMotion==='function') resetMotion(healer);
  healer._rescueShield = MADOSIS.rescuerShield||0;   // one-time absorb pool for the perilous escort
  healer.cmd={ type:'rescue', target:dog };
}

// the dog speaks the recovered memory aloud (dialog bubble; tone by facet). Cosmetic.
function madSpeakMemory(dog, facet){
  let text='';
  if(typeof buildDossier==='function' && dog.lore){
    const d=buildDossier(dog);
    text = facet==='trauma' ? d.trauma : facet==='dream' ? d.dream : d.familyText;
  }
  if(!text) text=facet;
  text = text ? (text[0].toUpperCase()+text.slice(1)) : text;
  if(typeof sayLoreEvent==='function') sayLoreEvent(dog, text, facet==='dream'?'pos':'neg');
  else madToast(dog, '🗣 '+madName(dog)+': '+text);
}

// per-frame escort driver for a rescuing healer (called from updateUnit). Returns true if handled.
function madRescueTick(state, healer, dt){
  const dog=healer.cmd && healer.cmd.target;
  if(!dog || dog.dead || !dog.madDog){ healer.cmd=null; healer.state='idle'; healer._actState=null; healer._rescueShield=0; return false; }
  // nearest un-reached echo for this dog (match by dogId; the live-ref clause covers legacy in-memory echoes)
  let best=null, bd=1e18;
  for(const e of state.entities){
    if(e.dead || e.kind!=='echo' || e.reached || !(e.dogId===dog.id || e.dog===dog)) continue;
    const dx=e.x-healer.x, dy=e.y-healer.y, d=dx*dx+dy*dy; if(d<bd){ bd=d; best=e; }
  }
  if(!best){ healer.cmd=null; healer.state='idle'; healer._rescueShield=0; return true; }   // (resolution fires on the 3rd)
  const reach=MADOSIS.echoReachRange*TILE;
  if(Math.hypot(best.x-healer.x, best.y-healer.y) <= reach){
    madCollectEcho(state, dog, best, healer);
    return true;
  }
  // walk to the echo (keep the rescue command alive)
  healer._actState=null;
  if(!healer._toEcho || (healer._echoRepath||0)<=0 || !healer.path){
    if(typeof issueMoveKeepCmd==='function') issueMoveKeepCmd(state, healer, best.x, best.y);
    healer._toEcho=true; healer._echoRepath=0.5;
  }
  healer._echoRepath-=dt;
  if(typeof followPath==='function') followPath(state, healer, dt);
  return true;
}

// collect ONE memory echo — the single resolution path shared by the rescue auto-pilot
// (madRescueTick) and the walk-over sweep (madGlobalTick). `collector` is whichever player unit
// reached it; rescue-command cosmetics only apply when it actually holds the rescue command.
function madCollectEcho(state, dog, echo, collector){
  if(!dog || dog.dead || !dog.madDog || !echo || echo.dead || echo.reached) return;
  echo.reached=true; echo.dead=true;
  dog.calmStage=(dog.calmStage||0)+1;
  if(!window._rbReplaying) madSpeakMemory(dog, echo.facet);
  const onRescueCmd = collector && collector.cmd && collector.cmd.type==='rescue';
  if(onRescueCmd){ collector.path=null; if(typeof faceTo==='function') faceTo(collector,dog); collector._actState='heal'; }
  if(dog.calmStage >= MADOSIS.echoFacets.length) madResolveRescue(state, dog, onRescueCmd ? collector : null);
}

/* ---- per-tick global driver (host/solo only — called from core.js update, missions only) ----
   1) post-episode cooldown: edge-detects "the episode just ended" (rescued, killed, or the unit
      died pre-feral — no per-event hooks needed) and arms state._madCalmUntil so the next
      breakdown can never chain immediately. Plain serialized scalars; missing on legacy saves →
      falsy → no cooldown (correct legacy default).
   2) walk-over collection: ANY player unit standing on an unreached memory echo recovers it,
      regardless of its command — the auto-pilot rescue stays the guided (and protected) path. */
function madGlobalTick(state, dt){
  // TEMPORARY field relief (Mindfulness Facilitator): while the facilitator is actively tending a unit
  // (stamped _madTendedAt each channel tick) the suppression holds; once tending stops it REVERTS SLOWLY
  // toward true madosis at fieldRelief.decayPerSec (1 pt / 5s by default) instead of snapping back, so a
  // brief stretch of calm is actually worth something. madReliefT just ages the auto-acquire "already-
  // tended" skip window. The relief is transient mission state (never snapshotted) → still lost on extract.
  const _FR = (typeof MADOSIS!=='undefined' && MADOSIS.fieldRelief) || {};
  const _decayPerSec = _FR.decayPerSec!=null ? _FR.decayPerSec : 0.2;
  const _tendFresh = (_FR.tickSec||1) + 0.5;   // tended within this many sec → still being channelled, hold full
  for(const u of state.entities){
    if(u.dead || u.kind!=='unit' || !(u.madRelief>0)) continue;
    if(u.madReliefT==null) continue;                                       // co-op client: host sends the current value
    if(u.madReliefT>0) u.madReliefT = Math.max(0, u.madReliefT - dt);      // age the re-tend skip window
    if((state.time||0) - (u._madTendedAt!=null?u._madTendedAt:-1e9) <= _tendFresh) continue;   // being tended → hold
    u.madRelief = Math.max(0, u.madRelief - _decayPerSec*dt);              // otherwise drift back to true madosis
    if(u.madRelief <= 1e-6){ u.madRelief = 0; u.madReliefT = 0; u._madTendedAt = null; }
  }
  const active = state.entities.some(o=> !o.dead && o.kind==='unit' && (o.madEpisode||o.madDog));
  if(state._madWasActive && !active)
    state._madCalmUntil = (state.time||0) + (MADOSIS.episodeCooldown||75);
  state._madWasActive = active;
  // KENNEL pursuit: the squad re-tracks the rescued dog wherever it runs (ai.js deliberately
  // skips kennel units, so without this they stall at the dog's rescue-time spot and are easy
  // to evade). Dog dead or extracted → the unit is released to the regular enemy AI pool.
  // Legacy-save kennel units have no kennelDogId and keep their old one-shot behavior.
  for(const k of state.entities){
    if(k.dead || !k.kennel || k.kind!=='unit' || k.kennelDogId==null) continue;
    k._kennelRepath=(k._kennelRepath||0)-dt;
    if(k._kennelRepath>0) continue;
    k._kennelRepath=KENNEL.repathSec||1.5;
    const dog=state.entities.find(d=> d.id===k.kennelDogId && !d.dead && !d.storedIn);
    if(!dog){ k.kennel=false; continue; }                       // hunt is over → normal enemy AI
    if(k.autoTarget && !k.autoTarget.dead) continue;            // mid-brawl: finish the fight first
    const c=k.cmd;
    if(c && c.type==='amove' && Math.hypot(c.x-dog.x, c.y-dog.y) < TILE*3) continue;   // order still fresh
    if(typeof issueMove==='function') issueMove(state, k, dog.x, dog.y, {type:'amove', x:dog.x, y:dog.y});
  }
  if(!active) return;   // echoes only exist alongside a live feral dog (cleaned on its death)
  const reach=MADOSIS.echoReachRange*TILE;
  for(const e of state.entities){
    if(e.dead || e.kind!=='echo' || e.reached) continue;
    const dog=state.entities.find(d=> d.id===e.dogId && !d.dead && d.madDog);
    if(!dog) continue;
    for(const u of state.entities){
      if(u.dead || u.storedIn || u.kind!=='unit' || u.owner!=='player' || u.subdued || u.madDog) continue;
      if(Math.hypot(e.x-u.x, e.y-u.y) > reach) continue;
      madCollectEcho(state, dog, e, u);
      break;
    }
  }
}

function madCleanupEchoes(state, dog){
  for(const e of state.entities){ if(e.kind==='echo' && (e.dogId===dog.id || e.dog===dog)) e.dead=true; }
}

// SUCCESS: the dog comes back — sane but fragile (subdued), permanently scarred, meter zeroed.
function madResolveRescue(state, dog, healer){
  if(typeof ACH!=='undefined' && !window._rbReplaying) ACH.fire('rescue');   // T3-5
  dog.madDog=false; dog.madEpisode=null; dog._rescue=false; dog.calmStage=null;
  dog.subdued=true; dog.scarred=true; dog.madosis=0;
  dog.autoTarget=null; dog.cmd=null; dog.state='idle';
  madCleanupEchoes(state, dog);
  if(healer){ healer.cmd=null; healer._rescueShield=0; }
  if(!window._rbReplaying){
    madToast(dog, '💜 '+madName(dog)+' is back — fragile, but yours. Get them out. The Kennel is coming.');
    if(typeof spawnRing==='function') spawnRing(dog.x, dog.y, '#b05bff');
  }
  if(typeof madSpawnKennel==='function') madSpawnKennel(state, dog);   // Phase 4
}

/* =====================================================================
   KENNEL — the death-squad sent after a dog is rescued. Sized to the DOG itself (dogPowerMul ×
   its combat power, on a fixed counter-composition incl. an Auditor as an anti-healer threat,
   capped at maxStars): certain death for an isolated dog, a real skirmish for a small escort,
   never a counter-army. They spawn at the nearest map edge and PURSUE the subdued dog wherever
   it runs (re-tracked in madGlobalTick; ai.js deliberately leaves kennel units alone).
   ===================================================================== */

// smallest uniform star level (>=2, <=maxStars) whose n-unit comp totals at least `target` power.
function madSolveStars(comp, n, target){
  const max=KENNEL.maxStars||20;
  const powAt=(s)=>{ let t=0; for(let i=0;i<n;i++) t+=typePower(comp[i%comp.length], s); return t; };
  let best=max;
  for(let s=0;s<=max;s++){ best=s; if(powAt(s)>=target) break; }
  return Math.max(2, Math.min(max, best));
}

// n passable spawn tiles clustered on the map edge nearest the dog (where the squad enters).
function madEdgeSpots(state, dog, n){
  const W=state.W, H=state.H, t=madTileOf(dog); let ex=t[0], ey=t[1];
  const dL=t[0], dR=W-1-t[0], dT=t[1], dB=H-1-t[1], m=Math.min(dL,dR,dT,dB);
  if(m===dL) ex=1; else if(m===dR) ex=W-2; else if(m===dT) ey=1; else ey=H-2;
  ex=Math.max(1,Math.min(W-2,ex)); ey=Math.max(1,Math.min(H-2,ey));
  const out=[];
  for(let r=0;r<=10 && out.length<n;r++){
    for(let yy=-r;yy<=r && out.length<n;yy++) for(let xx=-r;xx<=r && out.length<n;xx++){
      if(Math.max(Math.abs(xx),Math.abs(yy))!==r) continue;
      const tx=ex+xx, ty=ey+yy;
      if(tx<1||ty<1||tx>=W-1||ty>=H-1 || state.blocked[ty*W+tx]) continue;
      out.push([tx,ty]);
    }
  }
  while(out.length<n) out.push([ex,ey]);
  return out;
}

// spawn the Kennel squad, balanced to the rescued dog itself (NOT its guards — guard-scaled
// sizing made a well-escorted rescue summon a counter-army).
function madSpawnKennel(state, dog){
  if(!dog || typeof mkUnit!=='function' || typeof typePower!=='function') return;
  const target = typePower(dog.type, dog.stars||0) * (KENNEL.dogPowerMul||2.2);
  const comp = (KENNEL.comp && KENNEL.comp.length) ? KENNEL.comp : ['soldier'];
  const n = KENNEL.size || comp.length;
  const stars = madSolveStars(comp, n, target);
  const spots = madEdgeSpots(state, dog, n);
  for(let i=0;i<n;i++){
    const type=comp[i%comp.length], sp=spots[i];
    const u=mkUnit(state, type, 'enemy', sp[0], sp[1]);
    u.stars=stars; u.kennel=true; u.kennelDogId=dog.id; u.name='Kennel';
    if(typeof applyVetHp==='function') applyVetHp(u, true);
    if(typeof issueMove==='function') issueMove(state, u, dog.x, dog.y, {type:'amove', x:dog.x, y:dog.y});
  }
  state._kennelActive=(state._kennelActive||0)+1;
  if(!window._rbReplaying) madToast(dog, '🚓 A KENNEL squad is inbound — they’ll put the dog down and anyone shielding it. Hold them off and extract.');
}

/* =====================================================================
   LEGACY-SAVE BACKFILL — when a pre-madosis save loads (save.js v<2), approximate every veteran's
   current madosis so the system works on older games. Fills sanityThreshold (hero-boosted), madosis
   and scarred on BOTH the live player veterans AND the CAMPAIGN.roster snapshots (the HUB's
   persistent source of truth, which re-spawns the resident units). Deterministic; the SAVE_VERSION
   gate guarantees it runs once. Called from deserializeGame with the save's own map index (the global
   `mapIndex` isn't updated until after deserializeGame returns).
   ===================================================================== */
function madosisBackfill(g, mapIdx){
  if(!g) return;
  const bf = MADOSIS.backfill || {};
  const epNo = (mapIdx|0) + 1;
  const prog = epNo >= MADOSIS.accrueFromEpisode ? (epNo - MADOSIS.accrueFromEpisode + 1) : 0;  // campaign-attrition proxy ("important events")
  const fallen = (typeof fallenVets!=='undefined' && fallenVets) ? fallenVets.length : 0;        // memorial: restored from v2 saves, else 0 → proxy carries it
  const traumaCt = (lore)=>{
    if(!lore || !lore.events || typeof LORE_DATA==='undefined' || !LORE_DATA.events) return 0;
    let n=0; for(const ev of lore.events){ const d=LORE_DATA.events[ev.i]; if(d && d.req==='trauma') n++; } return n;
  };
  // m = perStar·level + perEpisode·progress + perFallen·deaths + perTrauma·traumas; halved for heroes;
  // zeroed before accrual begins (Episode 4); capped below the threshold so loading never auto-snaps a unit.
  const approx = (stars, hero, lore, thr)=>{
    if(prog<=0) return 0;
    let m = (bf.perStar||0)*(stars||0) + (bf.perEpisode||0)*prog + (bf.perFallen||0)*fallen + (bf.perTrauma||0)*traumaCt(lore);
    if(hero) m *= MADOSIS.heroAccrualMul;
    return Math.round(Math.max(0, Math.min(m, thr*(bf.maxFrac||0.9))));
  };
  // 1) live entities (a mission save's units; the HUB's live resident entities)
  for(const u of (g.entities||[])){
    if(!u || u.dead || u.owner!=='player' || u.kind!=='unit' || u.sanityThreshold || !u.lore) continue;
    if(!(u.hero || (typeof isCombatVet==='function' && isCombatVet(u)))) continue;
    mintSanityThreshold(u);
    if(!u.sanityThreshold) continue;
    u.madosis = approx(u.stars, u.hero, u.lore, madThreshold(u));
    if(u.scarred==null) u.scarred=false;
  }
  // 2) CAMPAIGN.roster snapshots (HUB persistence — re-spawns residents with these fields)
  if(typeof CAMPAIGN!=='undefined' && CAMPAIGN && Array.isArray(CAMPAIGN.roster)){
    for(const r of CAMPAIGN.roster){
      if(!r || r.sanityThreshold || !r.lore) continue;
      r.sanityThreshold = madRollThreshold(r.lore.seed, r.hero);
      const effThr = r.scarred ? r.sanityThreshold*MADOSIS.scarThresholdMul : r.sanityThreshold;
      r.madosis = approx(r.stars, r.hero, r.lore, effThr);
      if(r.scarred==null) r.scarred=false;
    }
  }
}

// expose for the headless sim sandbox / console (harmless under classic-script shared scope).
if(typeof window!=='undefined'){
  window.updateMadosis=updateMadosis; window.madosisEvent=madosisEvent; window.addMadosis=addMadosis;
  window.mintSanityThreshold=mintSanityThreshold; window.madThreshold=madThreshold; window.madDmgMul=madDmgMul;
  window.madEffective=madEffective; window.madReliefActive=madReliefActive;
  window.madosisRestDecay=madosisRestDecay; window.madEpisodeNo=madEpisodeNo;
  window.madCanRescue=madCanRescue; window.madBeginRescue=madBeginRescue; window.madResolveRescue=madResolveRescue;
  window.madDropEchoes=madDropEchoes;
  window.madRescueTick=madRescueTick; window.madCleanupEchoes=madCleanupEchoes; window.madSpawnKennel=madSpawnKennel;
  window.madCollectEcho=madCollectEcho; window.madGlobalTick=madGlobalTick;
  window.madRollThreshold=madRollThreshold; window.madosisBackfill=madosisBackfill;
}
