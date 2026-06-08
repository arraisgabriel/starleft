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
  for(const u of state.entities){
    if(u.dead || u.storedIn || u.owner!=='player' || u.kind!=='unit' || u===src) continue;
    if(u.subdued || u.madDog) continue;                 // already broken / being saved
    if(!u.sanityThreshold) continue;                    // not yet level 2 → no mind to break
    if(R && src && typeof dist==='function' && dist(u,src) > R) continue;
    addMadosis(u, pts, key);                             // onset itself is rolled in updateMadosis
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
    if(thr>0 && (u.madosis||0) >= thr && simRandom(state) < MADOSIS.onsetChancePerSec*dt){
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
    ep.phase='feral'; ep.t=0; u.madDog=true;
    if(!window._rbReplaying) madToast(u, '🐕 '+madName(u)+' has gone feral — put them down, or send a healer to bring them back.');
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
// snaps to the nearest walkable tile). Falls back through shorter/longer radii, then onto the dog.
function madPlaceEcho(state, dog, band, idx){
  const [dtx,dty]=madTileOf(dog), W=state.W, H=state.H;
  const radii=[band, band*0.7, band*1.3, band*0.5, Math.max(3, band*0.35)];
  for(const rr of radii){
    for(let k=0;k<12;k++){
      const a = idx*1.7 + k*(Math.PI*2/12);
      const ctx=Math.round(dtx+Math.cos(a)*rr), cty=Math.round(dty+Math.sin(a)*rr);
      if(ctx<1||cty<1||ctx>=W-1||cty>=H-1) continue;
      if(typeof findPath!=='function') return [ctx,cty];
      const path=findPath(state, dtx, dty, ctx, cty);
      if(path && path.length){ const last=path[path.length-1]; return [last[0], last[1]]; }
    }
  }
  return [dtx,dty];
}

function madSpawnEcho(state, dog, facet, tileXY){
  const e=mkEntity(state, 'echo', 'neutral', tileXY[0], tileXY[1], {
    kind:'echo', facet, dog, reached:false, r:12, sight:0, hp:1, maxHp:1,
  });
  state.entities.push(e);
  return e;
}

// begin (or join) a rescue: first healer spawns the 3 echoes; every rescuer gets the rescue command.
function madBeginRescue(state, healer, dog){
  if(!madCanRescue(healer) || !dog || dog.dead || !dog.madDog) return;
  if(!dog._rescue){
    dog._rescue=true; dog.calmStage=0;
    const bands=MADOSIS.echoDistBands, facets=MADOSIS.echoFacets;
    for(let i=0;i<facets.length;i++){
      const xy=madPlaceEcho(state, dog, (bands[i]!=null?bands[i]:8), i);
      madSpawnEcho(state, dog, facets[i], xy);
    }
    if(!window._rbReplaying) madToast(dog, '🧠 Rescue: walk '+madName(dog)+'’s memories — reach all three echoes.');
  }
  if(typeof resetMotion==='function') resetMotion(healer);
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
  if(!dog || dog.dead || !dog.madDog){ healer.cmd=null; healer.state='idle'; healer._actState=null; return false; }
  // nearest un-reached echo for this dog
  let best=null, bd=1e18;
  for(const e of state.entities){
    if(e.dead || e.kind!=='echo' || e.reached || e.dog!==dog) continue;
    const dx=e.x-healer.x, dy=e.y-healer.y, d=dx*dx+dy*dy; if(d<bd){ bd=d; best=e; }
  }
  if(!best){ healer.cmd=null; healer.state='idle'; return true; }   // (resolution fires on the 3rd)
  const reach=MADOSIS.echoReachRange*TILE;
  if(Math.hypot(best.x-healer.x, best.y-healer.y) <= reach){
    best.reached=true; best.dead=true;
    dog.calmStage=(dog.calmStage||0)+1;
    if(!window._rbReplaying) madSpeakMemory(dog, best.facet);
    healer.path=null; if(typeof faceTo==='function') faceTo(healer,dog); healer._actState='heal';
    if(dog.calmStage >= MADOSIS.echoFacets.length) madResolveRescue(state, dog, healer);
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

function madCleanupEchoes(state, dog){
  for(const e of state.entities){ if(e.kind==='echo' && e.dog===dog) e.dead=true; }
}

// SUCCESS: the dog comes back — sane but fragile (subdued), permanently scarred, meter zeroed.
function madResolveRescue(state, dog, healer){
  dog.madDog=false; dog.madEpisode=null; dog._rescue=false; dog.calmStage=null;
  dog.subdued=true; dog.scarred=true; dog.madosis=0;
  dog.autoTarget=null; dog.cmd=null; dog.state='idle';
  madCleanupEchoes(state, dog);
  if(healer) healer.cmd=null;
  if(!window._rbReplaying){
    madToast(dog, '💜 '+madName(dog)+' is back — fragile, but yours. Get them out. The Kennel is coming.');
    if(typeof spawnRing==='function') spawnRing(dog.x, dog.y, '#b05bff');
  }
  if(typeof madSpawnKennel==='function') madSpawnKennel(state, dog);   // Phase 4
}

/* =====================================================================
   KENNEL — the death-squad sent after a dog is rescued. Sized to the units guarding the dog ("a
   fight without necessarily killing him"): total squad power ~= powerRatio × nearby-guard power, on a
   fixed counter-composition (incl. an Auditor as an anti-healer threat), capped at maxStars. They
   spawn at the nearest map edge and march on the subdued dog and its escorts.
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

// spawn the Kennel squad, balanced to the units currently guarding the rescued dog.
function madSpawnKennel(state, dog){
  if(!dog || typeof mkUnit!=='function' || typeof typePower!=='function') return;
  const R=(KENNEL.radiusTiles||12)*TILE;
  let guard=0;
  for(const u of state.entities){
    if(u.dead||u.storedIn||u.owner!=='player'||u.kind!=='unit'||u.madDog) continue;
    if(typeof dist==='function' && dist(u,dog)>R) continue;
    guard += combatPower(u);
  }
  guard = Math.max(guard, typePower(dog.type, dog.stars||0));   // a lone rescue still draws a real squad
  const comp = (KENNEL.comp && KENNEL.comp.length) ? KENNEL.comp : ['soldier'];
  const n = KENNEL.size || comp.length;
  const stars = madSolveStars(comp, n, guard * (KENNEL.powerRatio||0.85));
  const spots = madEdgeSpots(state, dog, n);
  for(let i=0;i<n;i++){
    const type=comp[i%comp.length], sp=spots[i];
    const u=mkUnit(state, type, 'enemy', sp[0], sp[1]);
    u.stars=stars; u.kennel=true; u.name='Kennel';
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
  window.madosisRestDecay=madosisRestDecay; window.madEpisodeNo=madEpisodeNo;
  window.madCanRescue=madCanRescue; window.madBeginRescue=madBeginRescue; window.madResolveRescue=madResolveRescue;
  window.madRescueTick=madRescueTick; window.madCleanupEchoes=madCleanupEchoes; window.madSpawnKennel=madSpawnKennel;
  window.madRollThreshold=madRollThreshold; window.madosisBackfill=madosisBackfill;
}
