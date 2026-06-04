/* js/net/rollback-game.js — CLASSIC. The rollback-netcode `Game` adapter: wraps STARLEFT's live global `G`
   as a Game{serialize,deserialize,step,hash} for window.RB.createSession. Reuses the proven sim + serializers:
     hash()        = NET.simHash(G)                  the bit-identical-cross-engine hash (js/net/determinism.js)
     serialize()   = serializeGame() minus regenerable terrain + LOCAL selection (js/save.js) → Uint8Array
     deserialize() = newMap(mapIndex) for terrain, overlay ALL dynamic fields, relink refs    (rollback restore)
     step(inputs)  = apply each player's input (rollback-input.js, Phase B) + update(G, 1/60)
   Operates on the global (shared-lexical) `G`, which deserialize REASSIGNS — exactly like mp.js's `G = newMap()`.
   Phase A uses JSON over Uint8Array (in-memory harness); Phase 3a swaps a binary codec for the WebRTC keyframe. */
(function(){
  const NET = (window.NET = window.NET || {});
  const FIXED_DT = 1/60;

  // Complete dynamic-state serialize: serializeGame() already captures every non-SKIP G field (incl.
  // _simRngS / _simSeeded / runSalt / nextId / the enemy timers) — we only strip the terrain each peer
  // regenerates from mapIndex and the LOCAL selection/groups + save-only metadata.
  const RB_DROP = ['tiles','biome','variant','megaSprites','features','blocked','explored','feat','waterDepth',
                   'selection','groups','savedAt','mapName','v','hubMap','visible'];
  const RB_DROP_SET = {}; RB_DROP.forEach(k=>RB_DROP_SET[k]=1);

  function rbSerialize(){
    const s = serializeGame();              // proven, complete (js/save.js)
    for(const k of RB_DROP) delete s[k];
    return s;
  }
  function rbDeserialize(s){
    const g = newMap(s.mapIndex|0);         // deterministic terrain + cfg (its placed entities/eco are replaced below)
    for(const k in s){ if(k==='entities' || RB_DROP_SET[k]) continue; g[k]=s[k]; }   // overlay ALL dynamic scalars (eco/_simRngS/runSalt/timers/over/…)
    g.entities = (s.entities||[]).map(e=>Object.assign({}, e));
    const byId = new Map(g.entities.map(e=>[e.id, e]));
    g.entities.forEach(e=>resolveRefs(e, byId));   // relink cmd.target/autoTarget/… (save.js)
    if(typeof markBuilding==='function') g.entities.forEach(e=>{ if(e.kind==='building' && !e.dead) markBuilding(g,e,true); });
    if(typeof markFundingNode==='function') g.entities.forEach(e=>{ if(e.type==='goldmine' && !e.dead) markFundingNode(g,e); });
    g.selection=[]; g.groups={};            // selection/groups are LOCAL per peer, never part of sim state
    if(typeof recomputeSupply==='function') recomputeSupply(g);
    if(typeof computeFog==='function') computeFog(g);
    return g;
  }
  NET.rbSerialize = rbSerialize; NET.rbDeserialize = rbDeserialize;   // exposed for tests/inspection

  function enc(obj){ return new TextEncoder().encode(JSON.stringify(obj)); }   // Phase A: JSON; Phase 3a: binary
  function dec(u8){ return JSON.parse(new TextDecoder().decode(u8)); }

  // The Game holds its own state `self.st` and swaps it into the global `G` around every library call
  // (serializeGame/update/simHash all read/write the global), restoring `G` afterwards. This lets the
  // LocalTransport shadow test run TWO Sessions in one process without stomping each other, while in
  // production the fixed-tick loop keeps global `G === game.getState()` so render/UI see the live state.
  // (single-threaded → the swap is always balanced; deserialize reassigns G inside, captured back into self.st.)
  NET.makeStarleftGame = function(initialState){
    const self = { st: initialState || ((typeof G!=='undefined') ? G : null) };
    function withG(fn){ const saved = G; G = self.st; try { return fn(); } finally { self.st = G; G = saved; } }
    return {
      _self: self,
      getState(){ return self.st; },
      serialize(){ return withG(()=> enc(rbSerialize())); },
      deserialize(u8){ withG(()=>{ G = rbDeserialize(dec(u8)); }); },
      step(inputs){ withG(()=>{ if(typeof rbApplyInputs==='function') rbApplyInputs(G, inputs); update(G, FIXED_DT); }); },   // rbApplyInputs added in Phase B
      hash(){ return withG(()=> NET.simHash(G)); },
    };
  };

  // A8 — rollback ROUND-TRIP self-test (the core invariant): advance → serialize → advance+record →
  // deserialize(snapshot) → re-advance → assert identical hashes. This is literally what a rollback does each
  // misprediction, so it validates serialize/deserialize COMPLETENESS (incl. the RNG cursor) + step determinism.
  // Run from the console at the main menu: NET.rbRoundTripTest().
  NET.rbRoundTripTest = function(idx, advance, replay, seed){
    idx = idx|0; advance = advance||600; replay = replay||600; seed = (seed==null?12345:seed)>>>0;
    if(typeof newMap!=='function' || typeof update!=='function' || !NET.makeStarleftGame){ console.error('[rb] newMap/update/makeStarleftGame unavailable — load the game first'); return false; }
    const quiet = NET._quiet || ((fn)=>fn());
    const savedG = G, savedIdx = (typeof mapIndex!=='undefined') ? mapIndex : 0;
    let ok = true;
    try{
      const st = newMap(idx); st.runSalt = seed; delete st._simSeeded;
      if(typeof mapIndex!=='undefined') mapIndex = idx;   // so serializeGame() (reads global mapIndex) stamps the right map
      const game = NET.makeStarleftGame(st);
      quiet(()=>{
        for(let i=0;i<advance;i++) game.step(new Map());            // advance to a mid-game state
        const snap = game.serialize();                              // SAVE
        const baseline = [];
        for(let i=0;i<replay;i++){ game.step(new Map()); baseline.push(game.hash()); }   // advance + record the future
        game.deserialize(snap);                                     // ROLLBACK to the save
        for(let i=0;i<replay;i++){ game.step(new Map());
          if(game.hash()!==baseline[i]){ ok=false;
            console.warn('%c[rb] ROUND-TRIP FAIL','color:#f55;font-weight:bold','— diverged '+i+' ticks after restore: 0x'+(game.hash()>>>0).toString(16)+' vs 0x'+(baseline[i]>>>0).toString(16)+'. serialize/deserialize is missing a dynamic field.');
            break; } }
      });
    }catch(err){ console.error('[rb] threw during round-trip:', err); ok=false; }
    finally{ G = savedG; if(typeof mapIndex!=='undefined') mapIndex = savedIdx; }
    if(ok) console.log('%c[rb] ROUND-TRIP PASS','color:#3f3;font-weight:bold','— save→advance→restore→re-advance bit-identical over '+replay+' ticks (map '+idx+', seed '+seed+'). The Game serializes completely for rollback.');
    return ok;
  };

  // A8 (full) — LocalTransport SHADOW test: two real RB Sessions + two Games over the library's in-memory
  // transport (no WebRTC, one browser). Exercises createRoom/joinRoom + the initial StateSync (guest gets the
  // host's serialized state) + per-tick lockstep + hash agreement. Empty inputs (no commands yet) → validates
  // the Session+transport+game wiring before the input model lands. Run: NET.rbLocalTest(0, 600, 12345).
  // Phase-tagged logging so a failure pinpoints the broken step. Mutates global mapIndex/pendingPlayers (restored).
  NET.rbLocalTest = function(idx, ticks, seed){
    idx = idx|0; ticks = ticks||600; seed = (seed==null?12345:seed)>>>0;
    if(typeof whenRB!=='function'){ console.error('[rb] whenRB unavailable'); return; }
    whenRB(()=>{
      const RB = window.RB;
      if(!RB || RB.unavailable){ console.error('[rb] window.RB unavailable (bundle failed to load)'); return; }
      if(!NET.makeStarleftGame || typeof newMap!=='function'){ console.error('[rb] makeStarleftGame/newMap unavailable'); return; }
      const quiet = NET._quiet || ((fn)=>fn());
      const savedIdx = (typeof mapIndex!=='undefined') ? mapIndex : 0;
      const savedPending = (typeof pendingPlayers!=='undefined') ? pendingPlayers : 1;
      const restore = ()=>{ if(typeof mapIndex!=='undefined') mapIndex = savedIdx; if(typeof pendingPlayers!=='undefined') pendingPlayers = savedPending; };
      try{
        if(typeof pendingPlayers!=='undefined') pendingPlayers = 2;   // newMap places p1 + p2 bases
        if(typeof mapIndex!=='undefined') mapIndex = idx;             // serializeGame() stamps this
        const initState = newMap(idx); initState.runSalt = seed; delete initState._simSeeded;   // host's authoritative seed
        const hostId='host', guestId='guest';
        const tHost  = new RB.LocalTransport(hostId,  { latency:0, jitter:0 });
        const tGuest = new RB.LocalTransport(guestId, { latency:0, jitter:0 });
        RB.LocalTransport.link(tHost, tGuest);
        const gHost  = NET.makeStarleftGame(initState);
        const gGuest = NET.makeStarleftGame(newMap(idx));   // different runSalt on purpose → StateSync must overwrite it
        const cfg = { topology: RB.Topology.Star, desyncAuthority: RB.DesyncAuthority.Host, tickRate:60, hashInterval:30, maxPlayers:3 };
        const sHost  = RB.createSession({ game:gHost,  transport:tHost,  localPlayerId:hostId,  config:cfg });
        const sGuest = RB.createSession({ game:gGuest, transport:tGuest, localPlayerId:guestId, config:cfg });
        // bases are pre-placed by newMap(pendingPlayers=2), so playerJoined needs no spawn — just observe.
        sHost.on && sHost.on('desync', (t)=>console.warn('[rb] HOST desync @tick', t));
        sGuest.on && sGuest.on('desync', (t)=>console.warn('[rb] GUEST desync @tick', t));
        console.log('[rb] localtest: sessions created; creating room…');
        const empty = ()=> new Uint8Array([0]);   // count=0 (idle tick) per the input codec
        const flushN = ()=>{ for(let f=0;f<5;f++){ tHost.flush(); tGuest.flush(); } };
        sHost.createRoom().then((rid)=>{
          sHost.start();
          console.log('[rb] localtest: room '+(sHost.roomId||rid)+' created + started; guest joining…');
          return sGuest.joinRoom(sHost.roomId, hostId);
        }).then(()=>{
          flushN();
          console.log('[rb] localtest: joined; running '+ticks+' lockstep ticks…');
          let fail = -1;
          quiet(()=>{
            for(let i=0;i<ticks;i++){
              sHost.tick(empty()); sGuest.tick(empty());
              tHost.tick(1000/60); tGuest.tick(1000/60);
              flushN();
              if(gHost.hash() !== gGuest.hash()){ fail = i; break; }
            }
          });
          restore();
          if(fail>=0) console.warn('%c[rb] LOCAL FAIL','color:#f55;font-weight:bold','— host≠guest at tick '+fail+': host 0x'+(gHost.hash()>>>0).toString(16)+' vs guest 0x'+(gGuest.hash()>>>0).toString(16)+'. (StateSync or step divergence.)');
          else console.log('%c[rb] LOCAL PASS','color:#3f3;font-weight:bold','— 2 Sessions hash-identical over '+ticks+' ticks (map '+idx+', seed '+seed+'). Session + transport + StateSync + step all work.');
        }).catch((e)=>{ restore(); console.error('[rb] localtest handshake/run failed:', e); });
      }catch(err){ restore(); console.error('[rb] localtest threw:', err); }
    });
  };
})();
