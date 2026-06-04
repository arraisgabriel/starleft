/* js/net/rollback-session.js — CLASSIC. The live rollback session lifecycle + fixed-tick driver. Everything
   here is gated behind window.USE_ROLLBACK; while it's false, the host-authoritative path (sync.js/commands.js,
   the netRole loop in main.js) keeps shipping unchanged. When true, co-op runs as symmetric rollback:
     - rbStartHost / rbStartJoin: build a Session over the Trystero TransportAdapter + the Game over live G.
     - rbStepLoop(dt): the fixed-tick accumulator main.js calls instead of update()/clientTick — advances the
       session in whole 1/60 steps, syncs global G to the rollback state for rendering, and fires the
       victory/defeat screen on the confirmed over-transition (the "flow on confirmed tick" half of A6).
     - rbEnqueue / rbCollectInput: the local command queue (commands.js enqueues; the loop drains per tick). */
(function(){
  const NET = (window.NET = window.NET || {});
  window.USE_ROLLBACK = window.USE_ROLLBACK || false;   // master switch (set true in BOTH peers to use rollback co-op)
  const FIXED_DT = 1/60;
  const BASE_CFG = { tickRate:60, hashInterval:30, maxPlayers:3 };

  NET.rbSession = null; NET.rbGame = null;
  NET._rbPending = [];        // local commands issued since the last tick
  NET._rbAcc = 0;
  NET._rbFlowDone = false;    // victory/defeat screen fired once

  NET.rbEnqueue = function(cmd){ NET._rbPending.push(cmd); };
  NET.rbCollectInput = function(){
    if(!NET._rbPending.length) return new Uint8Array([0]);
    const u8 = NET.rbEncodeInput(NET._rbPending); NET._rbPending = []; return u8;
  };

  function wireSessionEvents(s){
    if(!s || !s.on) return;
    s.on('playerJoined', function(){ /* bases are pre-placed by newMap(pendingPlayers); nothing to spawn */ });
    s.on('playerLeft',   function(info){ NET.mpLog && NET.mpLog('warn','rollback: player left '+((info&&info.id)||'?')); if(typeof NET.rbOnPlayerLeft==='function') NET.rbOnPlayerLeft(info); });   // Phase C: adopt units
    s.on('desync',       function(t, lh, rh){ NET.mpLog && NET.mpLog('err','DESYNC @tick '+t+(lh!=null?' local 0x'+((lh>>>0).toString(16)):'')+(rh!=null?' remote 0x'+((rh>>>0).toString(16)):'')); });
  }

  function buildSession(state, ctrlMap, topology, authority){
    const RB = window.RB;
    if(!RB || RB.unavailable){ NET.mpLog && NET.mpLog('err','rollback: window.RB unavailable — the rollback bundle failed to load'); console.error('[rb] window.RB unavailable — cannot start rollback'); return null; }
    NET.rbCtrlOf = ctrlMap || {};
    NET.rbGame = NET.makeStarleftGame(state);
    NET._rbAcc = 0; NET._rbPending = []; NET._rbFlowDone = false;
    const transport = NET.makeTrysteroTransport();
    NET.rbSession = RB.createSession({
      game: NET.rbGame, transport, localPlayerId: transport.localPeerId, inputPredictor: NET.rbPredictor,
      config: Object.assign({ topology: topology!=null?topology:RB.Topology.Star, desyncAuthority: authority!=null?authority:RB.DesyncAuthority.Host }, BASE_CFG),
    });
    wireSessionEvents(NET.rbSession);
    NET.mpLog && NET.mpLog('info','rollback: session created ('+Object.keys(NET.rbCtrlOf).map(function(k){return String(k).slice(0,6)+'→'+NET.rbCtrlOf[k];}).join(', ')+')');
    return NET.rbSession;
  }

  // HOST: build + create the rollback room + start. Resolves to { rbRoomId, hostPeerId } to hand the guest(s).
  NET.rbStartHost = function(state, ctrlMap, topology, authority){
    const s = buildSession(state, ctrlMap, topology, authority); if(!s) return Promise.reject(new Error('no RB'));
    return s.createRoom().then(function(rid){ s.start(); NET.mpLog && NET.mpLog('ok','rollback: room '+(s.roomId||rid)+' created + started (HOST)'); return { rbRoomId: s.roomId || rid, hostPeerId: (window.MP && MP.selfId) || s.localPlayerId }; });
  };
  // GUEST: build + join the host's rollback room (the library StateSyncs the host's state into our Game).
  NET.rbStartJoin = function(state, ctrlMap, rbRoomId, hostPeerId, topology, authority){
    const s = buildSession(state, ctrlMap, topology, authority); if(!s) return Promise.reject(new Error('no RB'));
    NET.mpLog && NET.mpLog('info','rollback: joining room '+rbRoomId+' (host '+String(hostPeerId).slice(0,6)+'…), awaiting StateSync');
    return s.joinRoom(rbRoomId, hostPeerId).then(function(){ NET.mpLog && NET.mpLog('ok','rollback: joined + host state synced'); });
  };

  // Fixed-tick driver — main.js calls this each rAF frame while USE_ROLLBACK. Advance whole 1/60 ticks from the
  // accumulated real dt; cap catch-up so a stall can't spiral; sync global G for render; fire the outcome flow.
  NET.rbStepLoop = function(dt){
    const s = NET.rbSession, g = NET.rbGame; if(!s || !g) return;
    if(!NET._rbStarted){ NET._rbStarted = true; NET.mpLog && NET.mpLog('ok','rollback: simulating (fixed 1/60 tick)'); }
    NET._rbAcc += dt;
    let steps = 0;
    while(NET._rbAcc >= FIXED_DT && steps < 6){
      try{ const r = s.tick(NET.rbCollectInput()); if(r && r.rolledBack){ NET._rbRbCount=(NET._rbRbCount||0)+1; if((r.rollbackTicks||0)>(NET._rbRbMax||0)) NET._rbRbMax=r.rollbackTicks||0; } }
      catch(e){ NET.mpLog && NET.mpLog('err','rollback: session.tick error — '+((e&&e.message)||e)); console.warn('[rb] session.tick error', e); NET._rbAcc = 0; break; }
      NET._rbAcc -= FIXED_DT; steps++;
    }
    // throttled rollback summary (~5s) — shows latency-correction activity without a line per rollback
    const now = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
    if(NET._rbRbCount && now - (NET._rbRbAt||0) > 5000){ NET.mpLog && NET.mpLog('info','rollback: '+NET._rbRbCount+' corrections (max depth '+(NET._rbRbMax||0)+' ticks) in ~5s'); NET._rbRbCount=0; NET._rbRbMax=0; NET._rbRbAt=now; }
    G = g.getState();   // the live global G IS the rollback state — render/UI/fog read it
    // victory/defeat: fire the screen ONCE on the confirmed over-transition (checkWinLose set state._outcome).
    if(G && G.over && G._outcome && !NET._rbFlowDone){
      NET._rbFlowDone = true;
      NET.mpLog && NET.mpLog('ok','rollback: match over — '+G._outcome);
      if(G._outcome==='win'  && typeof onVictory==='function') onVictory();
      else if(G._outcome==='lose' && typeof onDefeat==='function') onDefeat();
    }
  };

  NET.rbTeardown = function(){
    try{ if(NET.rbSession && NET.rbSession.dispose) NET.rbSession.dispose(); }catch(_){}
    NET.rbSession = null; NET.rbGame = null; NET._rbPending = []; NET._rbAcc = 0; NET._rbFlowDone = false; NET._rbStarted = false;
  };
})();
