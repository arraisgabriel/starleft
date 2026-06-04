/* js/net/mp.js — CLASSIC. Session policy / orchestration.
   Owns the lobby→match handshake, role transitions (netRole), peer lifecycle and the campaign
   advance. Uses the MP transport facade (rooms/send/on) + the NET sync/command engine. UI lives in
   mp-ui.js; this file calls optional window.mpUi* hooks so the two stay decoupled.

   Handshake (main-menu only — no mid-map hot-join):
     host  Create Room → MP.enter(code); on peer-join assigns the joiner ctrl 'p2'.
     join  Join code    → MP.enter(code); exchanges 'mphello'.
     host  Start Match  → pendingPlayers=2; newMap (both bases); send 'mpstart' + full snapshot.
     join  on 'mpstart' → newMap(idx) for terrain, wait for the full snapshot, then play as 'p2'. */
(function(){
  const NET = (window.NET = window.NET || {});
  const S = window.MP_SESSION = { role:'solo', code:null, mode:'skirmish', mapIndex:0,
    started:false, peerId:null, me:null, host:null, joiner:null };

  function profile(){ return (typeof getOrCreateProfile==='function') ? getOrCreateProfile() : { id:'local', handle:'Operator' }; }
  function ui(name, ...args){ const f=window['mpUi'+name]; if(typeof f==='function'){ try{ f(...args); }catch(e){ console.warn(e); } } }

  function resetToSolo(){
    netRole='solo'; LOCAL_CTRL='p1'; pendingPlayers=1;
    NET.peerCtrl={}; NET.ctrlPeer={};
    S.role='solo'; S.code=null; S.started=false; S.peerId=null; S.joiner=null; S.host=null; S._gone=false;
  }
  window.mpResetToSolo = resetToSolo;

  /* ---------------- handshake / reconnect reliability ---------------- */
  const JOIN_TIMEOUT = 20000;       // no 'mphello' this long after entering a room → couldn't reach host
  const SYNC_TIMEOUT = 15000;       // got 'mpstart' but no first full snapshot this long → sync failed
  const RECONNECT_WINDOW = 15000;   // transient drop: try to re-establish this long before declaring the host gone
  const RECONNECT_MAX = 4;          // cap re-enter attempts within the window
  function _ms(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
  function clearTimer(k){ if(S[k]){ clearTimeout(S[k]); S[k]=null; } }
  function clearAllTimers(){ for(const k of ['_joinTimer','_syncTimer','_reconnTimer','_hostGraceTimer']) clearTimer(k); S._reconnecting=false; S._peerGrace=false; }

  /* ---------------- HOST ---------------- */
  function mpHostCreate(code, mode){
    if(!mpAvailable()) { toast('Multiplayer unavailable on this network'); return null; }
    S.me=profile(); S.role='host'; S.code=code; S.mode=mode||'skirmish'; S.started=false; S.peerId=null; S.joiner=null;
    NET.peerCtrl={}; NET.ctrlPeer={};
    MP.enter(code);
    NET.bindHostReceivers();                       // 'mpcmd'
    MP.on('mphello', (msg, peerId)=>{               // joiner announced its profile
      S.joiner = msg.profile; S.peerId = peerId;
      if(typeof rememberFriend==='function' && msg.profile) rememberFriend(msg.profile.id, msg.profile.handle);
      ui('Peers');
    });
    MP.onPeer((peerId)=>{
      // returning peer during a LIVE match → reconnect: re-bless + full resync (its units are preserved
      // if it returns inside the host grace window; otherwise they were adopted into p1).
      if(S.started && G){
        if(S._hostGraceTimer){ clearTimer('_hostGraceTimer'); S._peerGrace=false; }
        else if(S.peerId && S.peerId!==peerId && NET.ctrlPeer['p2']){ MP.send('mpbye',{reason:'full'},peerId); return; }
        S.peerId=peerId; NET.peerCtrl[peerId]='p2'; NET.ctrlPeer['p2']=peerId;
        MP.send('mphello', { profile:S.me, youCtrl:'p2', mode:S.mode, mapIndex:S.mapIndex }, peerId);
        if(NET.sendFull) NET.sendFull(peerId);                  // resync the rejoined client to current state
        ui('Peers'); toast('Ally reconnected');
        return;
      }
      // lobby (pre-match)
      if(S.peerId && S.peerId!==peerId && NET.ctrlPeer['p2']){ MP.send('mpbye',{reason:'full'},peerId); return; }  // 2-player cap
      S.peerId=peerId; NET.peerCtrl[peerId]='p2'; NET.ctrlPeer['p2']=peerId;
      MP.send('mphello', { profile:S.me, youCtrl:'p2', mode:S.mode, mapIndex:S.mapIndex }, peerId);
      ui('Peers');
    });
    MP.onLeave((peerId)=>{
      if(peerId!==S.peerId) return;
      onPeerDropHost();
    });
    ui('OpenRoom', { code, asHost:true });
    return code;
  }

  function mpHostStart(mapIndex, mode){
    if(S.role!=='host') return;
    S.mode = mode || S.mode; S.mapIndex = mapIndex|0; S.started=true;
    pendingPlayers = 2; LOCAL_CTRL='p1'; netRole='host';
    // fresh roster for skirmish; campaign keeps the carried veterans (p1's campaign progression)
    if(S.mode!=='campaign'){ if(typeof setCarryover==='function') setCarryover([]);
      if(typeof resetHeroes==='function') resetHeroes(); if(typeof resetFallen==='function') resetFallen(); }
    mapIndex = S.mapIndex;
    G = newMap(S.mapIndex);                          // both player bases spawn (pendingPlayers=2)
    if(typeof resetDialogs==='function') resetDialogs();
    if(typeof syncHud==='function') syncHud();
    if(typeof clampCam==='function') clampCam(G);
    if(typeof refreshUI==='function') refreshUI();
    running = true;
    if(typeof startHostClock==='function') startHostClock();   // keep the host simulating + broadcasting off-focus
    // tell the joiner to build the same map, then ship the authoritative dynamic state
    MP.send('mpstart', { mapIndex:S.mapIndex, mode:S.mode });
    NET.tick = 0; NET._sAcc = 0; NET._kAcc = 0;
    NET._baseline = new Map(); NET._lastEcoStr = null; NET._sinceSend = 0;   // reset Phase 4 delta baseline / eco signature for the new map
    NET.sendFull(S.peerId);
    ui('EnterGame');
    toast('Co-op match started — Quarter '+(S.mapIndex+1));
  }
  window.mpHostCreate = mpHostCreate;
  window.mpHostStart = mpHostStart;

  window.mpHostSetPaused = function(paused){
    if(S.role!=='host' || !S.peerId) return false;
    try{ MP.send('mppause', { paused:!!paused }, S.peerId); }catch(_){}
    return true;
  };

  /* ---------------- JOIN ---------------- */
  // (Re)register the client's room data-channel listeners. Called on first join AND after a reconnect
  // re-enter, because MP.enter() tears down the previous room's listeners (trystero-boot leaveRoom).
  function wireClientHandlers(){
    NET.bindClientReceivers();                       // 'mpfull','mpsnap'
    MP.on('mphello', (msg, peerId)=>{                 // host welcomed us
      S.host = msg.profile; S.peerId = peerId; LOCAL_CTRL = msg.youCtrl || 'p2';
      S.mode = msg.mode || S.mode; S.mapIndex = msg.mapIndex|0;
      clearTimer('_joinTimer');
      if(S._reconnecting){ S._reconnecting=false; clearTimer('_reconnTimer'); }   // host re-acknowledged us mid-reconnect
      if(typeof rememberFriend==='function' && msg.profile) rememberFriend(msg.profile.id, msg.profile.handle);
      MP.send('mphello', { profile:S.me, role:'join' }, peerId);   // send our handle back
      ui('Peers');
    });
    MP.on('mpstart', (msg)=> beginClientMatch(msg.mapIndex|0, msg.mode));
    MP.on('mphub', (msg)=> beginClientHub(msg));
    MP.on('mppause', (msg)=> applyHostPause(!!(msg && msg.paused)));
    MP.on('mpbye', (msg)=>{ if(msg && msg.reason==='full'){ toast('Room is full'); mpLeave(); } else mpHostGone('left'); });   // clean BYE → terminal
  }

  function mpJoin(code){
    if(!mpAvailable()){ toast('Multiplayer unavailable on this network'); return; }
    S.me=profile(); S.role='client'; S.code=code; S.started=false; S._gone=false;
    clearAllTimers();
    MP.enter(code);
    // re-focusing a long-backgrounded tab shouldn't instantly read as "host lost" — give the watchdog grace
    S._visGrace = ()=>{ if(document.visibilityState==='visible' && NET.touchWatchdog) NET.touchWatchdog(); };
    document.addEventListener('visibilitychange', S._visGrace);
    wireClientHandlers();
    MP.onLeave(()=> onHostDrop('left'));                  // Trystero peer-leave → transient? reconnect. Registered once; survives re-enter.
    NET.onHostLost    = ()=> onHostDrop('lost');          // watchdog: snapshots stopped → transient? reconnect
    NET.onStall       = ()=> ui('Stall');                 // brief gap → "reconnecting" hint
    NET.onReconnected = ()=> ui('Reconnected');
    NET.onFullApplied = ()=>{
      clearTimer('_syncTimer');
      if(running) return;          // one-shot: only the FIRST full "drops you in" — never re-centre/re-toast later
      running = true;
      if(G && G.hub){
        if(typeof clampCam==='function') clampCam(G);
        if(typeof refreshUI==='function') refreshUI();
        ui('EnterGame');
        toast('Viewing host H.U.B. — P1 controls upgrades and launch.');
        return;
      }
      // centre the joiner's camera on their own (p2) base
      const o = G._coopOrigins && G._coopOrigins.p2;
      if(o && typeof clampCam==='function'){ const z=G.zoom||1; G.camX=o.x*TILE-(innerWidth/z)/2; G.camY=o.y*TILE-(innerHeight/z)/2; clampCam(G); }
      if(typeof refreshUI==='function') refreshUI();
      ui('EnterGame');
      toast('Dropped into co-op — your base is marked in amber');
    };
    NET.onClientGameOver = ()=> ui('ClientGameOver');
    // no 'mphello' for a while → we never reached the host (bad code / NAT). Surface it, don't spin forever.
    S._joinTimer = setTimeout(()=>{ if(!S.peerId && !S._gone){ toast('Couldn’t reach host — check the code, or paste a TURN relay'); ui('JoinTimeout', { code }); } }, JOIN_TIMEOUT);
    ui('OpenRoom', { code, asHost:false });
  }
  window.mpJoin = mpJoin;

  // Transient client-side drop (Trystero peer-leave OR snapshot watchdog). Re-enter the room for a bounded
  // window to re-establish ICE before declaring the host gone. A clean BYE bypasses this (→ mpHostGone).
  function onHostDrop(reason){
    if(S.role!=='client' || S._gone || S._reconnecting) return;
    S._reconnecting = true; S._reconnTries = 0;
    running = false;                                     // freeze the world while we retry
    ui('Stall');                                         // reuse the "reconnecting…" hint
    const deadline = _ms() + RECONNECT_WINDOW;
    const step = ()=>{
      if(S._gone || !S._reconnecting) return;
      if(_ms() >= deadline || S._reconnTries >= RECONNECT_MAX){ S._reconnecting=false; mpHostGone(reason); return; }
      S._reconnTries++;
      try{ MP.enter(S.code); wireClientHandlers(); if(NET.resetWatchdog) NET.resetWatchdog(); }catch(_){}
      S._reconnTimer = setTimeout(step, Math.max(2000, RECONNECT_WINDOW/RECONNECT_MAX));
    };
    step();
  }
  window.mpReconnectClient = onHostDrop;

  function armSyncWatchdog(){
    clearTimer('_syncTimer');                          // surface a stuck "Syncing" (lost full) instead of spinning; reconnect re-requests it
    S._syncTimer = setTimeout(()=>{ if(!running && !S._gone){ ui('SyncTimeout'); onHostDrop('lost'); } }, SYNC_TIMEOUT);
  }

  function beginClientMatch(idx, mode){
    S.started=true; S.mode=mode||S.mode; S.mapIndex=idx;
    netRole='client'; pendingPlayers=2; mapIndex=idx;
    G = newMap(idx);                                 // regenerate identical terrain + pads (deterministic)
    running = false;                                  // hold until the host's full snapshot lands
    NET._lastAppliedTick = -1;                        // fresh out-of-order baseline for the new match
    if(NET.resetWatchdog) NET.resetWatchdog();        // start the host-liveness clock fresh for this match
    if(typeof clampCam==='function') clampCam(G);
    if(NET.flushPendingFull) NET.flushPendingFull();  // a full snapshot may have raced ahead of 'mpstart'
    armSyncWatchdog();
    ui('Syncing');
  }
  function beginClientHub(msg){
    S.started=true; S.mode=(msg&&msg.mode)||S.mode; S.mapIndex=(msg&&msg.mapIndex)|0;
    netRole='client'; LOCAL_CTRL='p2'; pendingPlayers=2; mapIndex=S.mapIndex;
    if(msg && msg.campaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(msg.campaign);
    G = newHubMap();
    running = false;
    NET._lastAppliedTick = -1;
    if(NET.resetWatchdog) NET.resetWatchdog();
    if(typeof resetDialogs==='function') resetDialogs();
    if(typeof syncHud==='function') syncHud();
    if(typeof clampCam==='function') clampCam(G);
    if(NET.flushPendingFull) NET.flushPendingFull();
    armSyncWatchdog();
    ui('Syncing');
  }

  function applyHostPause(paused){
    if(S.role!=='client' || !G || G.over) return;
    running = !paused;
    if(paused && typeof resetInputState==='function') resetInputState();
    if(!paused && NET.resetWatchdog) NET.resetWatchdog();
    if(typeof syncPauseBtn==='function') syncPauseBtn();
    if(typeof refreshUI==='function') refreshUI();
    toast(paused ? 'Host paused the match' : 'Host resumed the match');
  }

  /* ---------------- leave / drop ---------------- */
  function mpLeave(){
    try{ MP.send('mpbye', { reason:'leave' }); }catch(_){}
    clearAllTimers();
    if(typeof stopHostClock==='function') stopHostClock();   // tear down worker + audio/wake-lock keep-alive
    if(window.COMMS) try{ COMMS.leave(); }catch(_){}
    if(typeof mpStopRtt==='function') mpStopRtt();
    if(S._visGrace){ document.removeEventListener('visibilitychange', S._visGrace); S._visGrace=null; }
    try{ MP.leaveRoom(); }catch(_){}
    running=false; G=null;
    resetToSolo();
    ui('LeftRoom');
  }
  window.mpLeave = mpLeave;

  // The host vanished (clean BYE, Trystero peer-leave, OR the snapshot-watchdog timed out). Notify the
  // client and freeze its world behind an end overlay so it never sits open forever. Idempotent.
  function mpHostGone(reason){
    if(S.role!=='client' || S._gone) return;
    S._gone = true;
    clearAllTimers();                                        // stop any reconnect/join/sync timers — this is terminal
    running = false;                                         // freeze the world view immediately
    if(typeof mpStopRtt==='function') mpStopRtt();
    if(window.COMMS) try{ COMMS.leave(); }catch(_){}
    ui('HostGone', reason);                                  // mp-ui shows the "disconnected" overlay + Back to Menu
  }
  window.mpHostGone = mpHostGone;

  // Host-side peer drop. During a live match, hold the ally's units for a grace window so a reconnecting
  // client keeps them; if the window expires, adopt them into p1 and continue solo-co-op.
  function onPeerDropHost(){
    if(S._peerGrace) return;
    if(!(S.started && G)){ handlePeerDrop(); return; }       // pre-match lobby drop → just clear
    S._peerGrace = true;
    ui('PeerDropped');                                       // "ally disconnected — waiting to reconnect…"
    toast('Ally disconnected — holding their units…');
    clearTimer('_hostGraceTimer');
    S._hostGraceTimer = setTimeout(()=>{ S._peerGrace=false; S._hostGraceTimer=null; handlePeerDrop(); }, RECONNECT_WINDOW + 3000);
  }

  function handlePeerDrop(){
    // host keeps playing solo-co-op; adopt the orphaned ally's units so the map stays winnable
    if(G){ for(const e of G.entities){ if(e.owner==='player' && e.ctrl==='p2') e.ctrl='p1'; }
      // fold p2's funding into p1 so nothing is stranded
      if(G.eco && G.eco.p2){ G.eco.p1.gold += G.eco.p2.gold||0; G.eco.p2.gold=0; if(typeof recomputeSupply==='function') recomputeSupply(G); }
    }
    S.peerId=null; S.joiner=null; NET.peerCtrl={}; NET.ctrlPeer={};
    ui('PeerDropped');
    if(typeof refreshUI==='function') refreshUI();
  }

  /* ---------------- campaign advance (host drives the sequence) ---------------- */
  // Called by the host when it wins a campaign Quarter (wired from the victory flow).
  window.mpAdvanceCampaign = function(){
    if(S.role!=='host' || S.mode!=='campaign') return false;
    if(S.mapIndex >= (MAPS.length-1)) return false;
    // auto-carry the host's top veterans (no interactive chooser in co-op v1); p2 starts fresh.
    if(typeof eligibleVets==='function' && typeof setCarryover==='function'){
      const vets = eligibleVets(G) || [];
      const cap = (typeof vetCarryCountFor==='function') ? vetCarryCountFor(S.mapIndex+1) : 0;
      setCarryover(vets.slice(0, cap));
    }
    mpHostStart(S.mapIndex+1, 'campaign');
    return true;
  };
  window.mpHostEnterHub = function(){
    if(S.role!=='host') return;
    S.mapIndex = mapIndex|0;
    NET.tick = 0; NET._sAcc = 0; NET._kAcc = 0;
    NET._baseline = new Map(); NET._lastEcoStr = null; NET._sinceSend = 0;   // reset Phase 4 delta baseline / eco signature for the new map
    MP.send('mphub', { mapIndex:S.mapIndex, mode:S.mode, campaign: typeof serializeHubCampaign==='function' ? serializeHubCampaign() : null });
    if(S.peerId && NET.sendFull) NET.sendFull(S.peerId);
  };
})();
