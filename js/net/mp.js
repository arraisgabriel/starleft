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
    S.role='solo'; S.code=null; S.started=false; S.peerId=null; S.joiner=null; S.host=null;
  }
  window.mpResetToSolo = resetToSolo;

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
      if(S.peerId && S.peerId!==peerId && NET.ctrlPeer['p2']){ MP.send('mpbye',{reason:'full'},peerId); return; }  // 2-player cap
      S.peerId=peerId; NET.peerCtrl[peerId]='p2'; NET.ctrlPeer['p2']=peerId;
      MP.send('mphello', { profile:S.me, youCtrl:'p2', mode:S.mode, mapIndex:S.mapIndex }, peerId);
      // if a match is already running, this path is unused (no hot-join); lobby only.
      ui('Peers');
    });
    MP.onLeave((peerId)=>{
      if(peerId!==S.peerId) return;
      handlePeerDrop();
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
    NET.sendFull(S.peerId);
    ui('EnterGame');
    toast('Co-op match started — Quarter '+(S.mapIndex+1));
  }
  window.mpHostCreate = mpHostCreate;
  window.mpHostStart = mpHostStart;

  /* ---------------- JOIN ---------------- */
  function mpJoin(code){
    if(!mpAvailable()){ toast('Multiplayer unavailable on this network'); return; }
    S.me=profile(); S.role='client'; S.code=code; S.started=false;
    MP.enter(code);
    NET.bindClientReceivers();                       // 'mpfull','mpsnap'
    MP.on('mphello', (msg, peerId)=>{                 // host welcomed us
      S.host = msg.profile; S.peerId = peerId; LOCAL_CTRL = msg.youCtrl || 'p2';
      S.mode = msg.mode || S.mode; S.mapIndex = msg.mapIndex|0;
      if(typeof rememberFriend==='function' && msg.profile) rememberFriend(msg.profile.id, msg.profile.handle);
      MP.send('mphello', { profile:S.me, role:'join' }, peerId);   // send our handle back
      ui('Peers');
    });
    MP.on('mpstart', (msg)=> beginClientMatch(msg.mapIndex|0, msg.mode));
    MP.on('mpbye', (msg)=>{ toast(msg && msg.reason==='full' ? 'Room is full' : 'Host left the room'); mpLeave(); });
    MP.onLeave(()=>{ // host vanished
      toast('Host disconnected'); ui('HostGone'); });
    NET.onFullApplied = ()=>{
      if(running) return;          // one-shot: only the FIRST full "drops you in" — never re-centre/re-toast later
      running = true;
      // centre the joiner's camera on their own (p2) base
      const o = G._coopOrigins && G._coopOrigins.p2;
      if(o && typeof clampCam==='function'){ const z=G.zoom||1; G.camX=o.x*TILE-(innerWidth/z)/2; G.camY=o.y*TILE-(innerHeight/z)/2; clampCam(G); }
      if(typeof refreshUI==='function') refreshUI();
      ui('EnterGame');
      toast('Dropped into co-op — your base is marked in amber');
    };
    NET.onClientGameOver = ()=> ui('ClientGameOver');
    ui('OpenRoom', { code, asHost:false });
  }
  window.mpJoin = mpJoin;

  function beginClientMatch(idx, mode){
    S.started=true; S.mode=mode||S.mode; S.mapIndex=idx;
    netRole='client'; pendingPlayers=2; mapIndex=idx;
    G = newMap(idx);                                 // regenerate identical terrain + pads (deterministic)
    running = false;                                  // hold until the host's full snapshot lands
    if(typeof clampCam==='function') clampCam(G);
    if(NET.flushPendingFull) NET.flushPendingFull();  // a full snapshot may have raced ahead of 'mpstart'
    ui('Syncing');
  }

  /* ---------------- leave / drop ---------------- */
  function mpLeave(){
    try{ MP.send('mpbye', { reason:'leave' }); }catch(_){}
    if(typeof stopHostClock==='function') stopHostClock();   // tear down worker + audio/wake-lock keep-alive
    if(window.COMMS) try{ COMMS.leave(); }catch(_){}
    if(typeof mpStopRtt==='function') mpStopRtt();
    try{ MP.leaveRoom(); }catch(_){}
    running=false; G=null;
    resetToSolo();
    ui('LeftRoom');
  }
  window.mpLeave = mpLeave;

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
})();
