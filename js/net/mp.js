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
    S.mpCampaignId=null; S._resumed=false; S._peerVer=null; S._awaitResume=false; S._pendingSaveMeta=null;
    S._cueSeq=0; S._cueHold=false; S._lastHoldCue=null; NET._cueApplied=-1; NET._cueHold=false;   // presentation-cue state (transient)
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
    NET.mpLog && NET.mpLog('ok','room created '+code+' (host '+String(MP.selfId||'?').slice(0,6)+'…) — waiting for ally');
    NET.bindHostReceivers();                       // 'mpcmd'
    MP.on('mphello', (msg, peerId)=>{               // joiner announced its profile
      S.joiner = msg.profile; S.peerId = peerId;
      S._peerVer = (msg.ver!=null) ? (msg.ver|0) : S._peerVer;   // joiner's SAVE_VERSION (build-skew check on resume)
      NET.mpLog && NET.mpLog('info','ally identified: '+((msg.profile&&msg.profile.handle)||'?'));
      if(typeof rememberFriend==='function' && msg.profile) rememberFriend(msg.profile.id, msg.profile.handle);
      ui('Peers');
    });
    MP.onPeer((peerId)=>{
      // returning peer during a LIVE match → reconnect: re-bless + full resync (its units are preserved
      // if it returns inside the host grace window; otherwise they were adopted into p1).
      if(S.started && G){
        if(S._hostGraceTimer){ clearTimer('_hostGraceTimer'); S._peerGrace=false; }
        else if(S.peerId && S.peerId!==peerId && NET.ctrlPeer['p2']){ NET.mpLog && NET.mpLog('warn','rejected extra peer '+String(peerId).slice(0,6)+'… (match full)'); MP.send('mpbye',{reason:'full'},peerId); return; }
        S.peerId=peerId; NET.peerCtrl[peerId]='p2'; NET.ctrlPeer['p2']=peerId;
        NET.mpLog && NET.mpLog('ok','ally reconnected '+String(peerId).slice(0,6)+'… → p2 (resyncing)');
        MP.send('mphello', { profile:S.me, youCtrl:'p2', mode:S.mode, mapIndex:S.mapIndex, mpCampaignId:S.mpCampaignId, ver:(typeof SAVE_VERSION!=='undefined'?SAVE_VERSION:0) }, peerId);
        if(NET.sendFull) NET.sendFull(peerId);                  // resync the rejoined client to current state
        // a rejoiner that kept its overlay must never be left frozen behind a cutscene that already ended:
        // if no hold-cue is outstanding, send a resume (no-op if it wasn't frozen). A live hold is handled by
        // the eventual cueResume — re-arming it here would double-play on a transient rejoin.
        if(!S._cueHold){ const _rs=S._cueSeq=(S._cueSeq||0)+1; try{ MP.send('mpcue',{seq:_rs,type:'resume',data:{},hold:false},peerId);}catch(_){} }
        ui('Peers'); toast('Ally reconnected');
        return;
      }
      // lobby (pre-match)
      if(S.peerId && S.peerId!==peerId && NET.ctrlPeer['p2']){ NET.mpLog && NET.mpLog('warn','rejected extra peer '+String(peerId).slice(0,6)+'… (room full, 2-player cap)'); MP.send('mpbye',{reason:'full'},peerId); return; }  // 2-player cap
      S.peerId=peerId; NET.peerCtrl[peerId]='p2'; NET.ctrlPeer['p2']=peerId;
      NET.mpLog && NET.mpLog('ok','peer connected '+String(peerId).slice(0,6)+'… → p2');
      MP.send('mphello', { profile:S.me, youCtrl:'p2', mode:S.mode, mapIndex:S.mapIndex }, peerId);
      ui('Peers');
    });
    MP.onLeave((peerId)=>{
      if(peerId!==S.peerId) return;
      NET.mpLog && NET.mpLog('warn','peer left '+String(peerId).slice(0,6)+'…');
      onPeerDropHost();
    });
    ui('OpenRoom', { code, asHost:true });
    return code;
  }

  function mpHostStart(mapIndex, mode, extra){
    if(S.role!=='host') return;
    if(typeof TELE!=='undefined') TELE.event('coop_session', { role:'host', mode: mode||S.mode });
    S.mode = mode || S.mode; S.mapIndex = mapIndex|0; S.started=true; S.duelSeed=(extra&&extra.duelSeed)!=null?extra.duelSeed:null;
    pendingPlayers = 2; LOCAL_CTRL='p1'; netRole='host'; S._resumed=false;
    if(S.mode==='campaign' && !S.mpCampaignId){ S.mpCampaignId = (typeof _mpUuid==='function') ? _mpUuid() : ('mp'+Date.now().toString(36)); }  // stable co-op campaign id (saved/resumed slot key)
    // fresh roster for skirmish; campaign keeps the carried veterans (p1's campaign progression)
    if(S.mode!=='campaign'){ if(typeof setCarryover==='function') setCarryover([]);
      if(typeof resetHeroes==='function') resetHeroes(); if(typeof resetFallen==='function') resetFallen(); }
    mapIndex = S.mapIndex;
    G = newMap(S.mapIndex);                          // both player bases spawn (pendingPlayers=2)
    if(S.mode==='duel'){ G._pvp=true; }              // T4-5: founders are hostile (isHostile splits by ctrl)
    if(typeof resetDialogs==='function') resetDialogs();
    if(typeof syncHud==='function') syncHud();
    if(typeof clampCam==='function') clampCam(G);
    if(typeof refreshUI==='function') refreshUI();
    // asset gate (VISUAL-ONLY in co-op): hides the procedural flash while this map's sprites
    // settle. It must never touch `running` or delay mpstart/sendFull — the sim, host clock and
    // snapshot flow all proceed underneath the opaque overlay; the gate just lifts on settle/18s.
    if(typeof gateMission==='function' && typeof LOADER!=='undefined'){
      LOADER.beginMission(missionTags(S.mapIndex));
      gateMission(S.mapIndex, null, { passive:true });
    }
    if(window.USE_ROLLBACK){
      running = true;
      // symmetric rollback: build the session over Trystero, create the rollback room, broadcast 'rbstart' so
      // the joiner joins it (the library StateSyncs our authoritative G into the guest). No host clock / no snapshots.
      NET.mpLog && NET.mpLog('info','USE_ROLLBACK on — starting rollback co-op (host), map '+S.mapIndex);
      const ctrlMap = {}; if(MP.selfId) ctrlMap[MP.selfId]='p1'; if(S.peerId) ctrlMap[S.peerId]='p2';
      whenRB(()=> NET.rbStartHost(G, ctrlMap).then((info)=>{
        MP.send('rbstart', { mapIndex:S.mapIndex, mode:S.mode, rbRoomId:info.rbRoomId, hostPeerId:info.hostPeerId }, S.peerId);
        NET.mpLog && NET.mpLog('info','rbstart → guest (room '+info.rbRoomId+')');
      }).catch((e)=>{ NET.mpLog && NET.mpLog('err','rollback host start failed: '+((e&&e.message)||e)); console.error('[rb] host start failed', e); }));
      ui('EnterGame');
      toast('Rollback co-op started — Quarter '+(S.mapIndex+1));
      return;
    }
    // A co-op campaign plays the opening crawl on BOTH peers before the sim starts. The joiner gets a
    // `crawl` flag in mpstart so it shows the same crawl in parallel (see beginClientMatch).
    const coopCrawl = (S.mode==='campaign' && MAPS[S.mapIndex] && MAPS[S.mapIndex].crawl && typeof showCrawl==='function');
    // tell the joiner to build the same map (and, for a campaign, play the crawl)
    MP.send('mpstart', { mapIndex:S.mapIndex, mode:S.mode, duelSeed:S.duelSeed, mpCampaignId:S.mpCampaignId, crawl:!!coopCrawl });
    // Begin the authoritative sim + ship the first snapshot. DEFERRED behind the crawl for a campaign so
    // neither base is attacked while the story plays (both peers stay running=false, no snapshots flow);
    // when the host's crawl finishes/skips, the match goes live for both.
    const startMatch = ()=>{
      running = true;
      if(typeof startHostClock==='function') startHostClock();   // keep the host simulating + broadcasting off-focus
      NET.tick = 0; NET._sAcc = 0; NET._kAcc = 0;
      NET._baseline = new Map(); NET._lastEcoStr = null; NET._lastQuestStr = null; NET._sinceSend = 0; NET._loreSent = new Map();   // reset Phase 4 delta baseline / eco + quest signatures + dossier-identity dirty-set for the new map
      NET.mpLog && NET.mpLog('info','co-op sim live — map '+S.mapIndex+', shipping full snapshot');
      NET.sendFull(S.peerId);
      toast('Co-op match started — Quarter '+(S.mapIndex+1));
    };
    ui('EnterGame');
    if(coopCrawl){
      running = false;                                  // freeze the host through the crawl (no sim, no snapshots yet)
      // a crawl that throws in its DOM prologue must STILL start the match (else the host hard-locks at
      // running=false and the waiting client never gets a snapshot). startMatch is the only path live.
      try{ showCrawl(S.mapIndex, startMatch); }          // crawl → on finish/skip: sim live + first snapshot for both
      catch(_){ startMatch(); }
    } else {
      startMatch();
    }
  }
  window.mpHostCreate = mpHostCreate;
  window.mpHostStart = mpHostStart;

  window.mpHostSetPaused = function(paused){
    if(S.role!=='host' || !S.peerId) return false;
    if(S._cueHold) return false;                       // a cutscene already owns the freeze — ignore the manual pause toggle
    try{ MP.send('mppause', { paused:!!paused }, S.peerId); }catch(_){}
    return true;
  };

  /* ---------------- presentation cues (host→client, one-shot, reliable) ----------------
     A cutscene/overlay the host plays is mirrored to the client with a seq-stamped 'mpcue'. The
     monotonic seq makes it EXACTLY-ONCE (a resend/reconnect never replays a one-shot screen). A
     hold-cue freezes BOTH sides (running=false) until the host's matching 'resume' cue — the client
     can never resume combat on its own. Nothing here is serialized; the next authoritative snapshot
     re-syncs state regardless, so a missed/duplicated cue can never desync the sim. Modelled on the
     mppause precedent (one MP.send on the host, one MP.on handler on the client). */
  NET.cueSend = function(type, data, hold){
    if(S.role!=='host' || !S.peerId) return false;
    const seq = S._cueSeq = (S._cueSeq||0)+1;
    if(hold){ S._cueHold = true; S._lastHoldCue = { type:type, data:data||{} }; }
    try{ MP.send('mpcue', { seq:seq, type:type, data:data||{}, hold:!!hold }, S.peerId); }catch(_){}
    return true;
  };
  // Host: end an outstanding hold-cue → tell the client to unfreeze. Idempotent.
  NET.cueResume = function(){
    if(S.role!=='host'){ S._cueHold=false; S._lastHoldCue=null; return; }
    if(!S._cueHold) return;
    S._cueHold=false; S._lastHoldCue=null;
    if(!S.peerId) return;
    const seq = S._cueSeq = (S._cueSeq||0)+1;
    try{ MP.send('mpcue', { seq:seq, type:'resume', data:{}, hold:false }, S.peerId); }catch(_){}
  };
  // Client: dispatch a received cue. De-dupes by seq; applies a hold-freeze; routes to the local
  // presentation fn. Entity-dependent cues null-guard G (a cue that races ahead of the map is dropped —
  // the cutscene is cosmetic, and the authoritative snapshot re-syncs state anyway).
  NET.playCue = function(cue){
    if(!cue || cue.seq==null) return;
    if(NET._cueApplied==null) NET._cueApplied = -1;
    if(cue.seq <= NET._cueApplied) return;             // idempotent: duplicate / reconnect resend
    NET._cueApplied = cue.seq;
    const d = cue.data || {};
    if(cue.hold){ NET._cueHold = true; running = false; if(typeof resetInputState==='function') resetInputState(); }
    switch(cue.type){
      case 'mapcut':
      case 'flash': {
        const lines = (d.linesKey && typeof window!=='undefined' && window[d.linesKey]) || null;
        if(lines && lines.length && typeof startFlashCutscene==='function' && G && G.entities){
          let sp = d.speaker ? G.entities.find(x=>x.heroId===d.speaker && !x.dead && !x.storedIn) : null;
          if(!sp && d.speakerId!=null) sp = G.entities.find(x=>x.id===d.speakerId && !x.dead && !x.storedIn);   // frame any entity by host id (boss-death focuses a live player unit)
          if(!sp) sp = G.entities.find(x=>x.villain && !x.dead && !x.storedIn);
          if(sp){ startFlashCutscene(G, sp, lines); if(G.flashCutscene && d.manual) G.flashCutscene.manual=true; }   // updateFlashCutscene (main.js, outside the sim guard) advances it even while frozen
        }
        break;
      }
      case 'finale': {
        if(typeof beginCoopFinale==='function') beginCoopFinale(G);   // Phase 2: arm the nuke finale on the client clock
        break;
      }
      case 'resume': {
        NET._cueHold = false;
        if(G && !G.over){ running = true; if(NET.resetWatchdog) NET.resetWatchdog(); }
        if(typeof syncPauseBtn==='function') syncPauseBtn();
        break;
      }
      case 'narrate': {
        // root #2 — mirror the host's narrative/feedback layer. All targets are already client-safe:
        // toast/eventToast render locally (+ fill the Events panel via logEvent); the client already runs
        // updateDialogs+drawDialogs so a relayed pushDialog gold box renders with no new plumbing; VOICE
        // needs only an id/index; ACH is per-device localStorage.
        const k = d.kind;
        if(k==='toast'){
          if(d.ev){ if(typeof eventToast==='function') eventToast(d.html, d.ms||9000); }
          else if(typeof toast==='function') toast(d.html, d.ms);
        } else if(k==='say' || k==='bark'){
          const u = (d.unitId!=null && G && G.entities) ? G.entities.find(x=>x.id===d.unitId && !x.dead && !x.storedIn) : null;
          if(u && typeof pushDialog==='function'){
            pushDialog(u, d.text, { type:(k==='say'?'lore':'select'), tone:d.tone });   // resolve speaker by host id (missing → drop silently, matches solo)
            if(typeof VOICE!=='undefined'){
              if(k==='say' && d.sayIdx!=null && d.loreVoice && VOICE.playLore) VOICE.playLore(d.loreVoice, d.sayIdx);
              else if(k==='bark' && d.idx!=null && d.voiceKey && VOICE.playBark) VOICE.playBark(d.voiceKey, d.idx);
            }
          }
        } else if(k==='ach'){
          if(typeof ACH!=='undefined' && ACH.fire) ACH.fire(d.ev, d.ctx||{});   // client runs its OWN test() (per-device localStorage)
        } else if(k==='fallen'){
          // A4: append the obituary's fallen record so the client's "The Fallen" wall fills live (dedup by fid).
          if(d.rec){ if(typeof fallenVets!=='undefined'){ const fid=d.rec.fid; if(!(fid!=null && fallenVets.some(x=>x&&x.fid===fid))) fallenVets.push(d.rec); } }
          if(d.obit && typeof eventToast==='function') eventToast(d.obit, d.ms||10000);
        }
        break;
      }
    }
  };

  /* ---------------- JOIN ---------------- */
  // (Re)register the client's room data-channel listeners. Called on first join AND after a reconnect
  // re-enter, because MP.enter() tears down the previous room's listeners (trystero-boot leaveRoom).
  function wireClientHandlers(){
    NET.bindClientReceivers();                       // 'mpfull','mpsnap'
    MP.on('mphello', (msg, peerId)=>{                 // host welcomed us
      S.host = msg.profile; S.peerId = peerId; LOCAL_CTRL = msg.youCtrl || 'p2';
      S.mode = msg.mode || S.mode; S.mapIndex = msg.mapIndex|0;
      if(msg.mpCampaignId) S.mpCampaignId = msg.mpCampaignId;   // co-op save identity (for the client's mirror copy)
      S._peerVer = (msg.ver!=null) ? (msg.ver|0) : S._peerVer;  // host's SAVE_VERSION (build-skew check)
      NET.mpLog && NET.mpLog('ok','host welcomed us → you are '+LOCAL_CTRL+' (host '+String(peerId).slice(0,6)+'…)');
      clearTimer('_joinTimer');
      if(S._reconnecting){ S._reconnecting=false; clearTimer('_reconnTimer'); }   // host re-acknowledged us mid-reconnect
      if(typeof rememberFriend==='function' && msg.profile) rememberFriend(msg.profile.id, msg.profile.handle);
      MP.send('mphello', { profile:S.me, role:'join', ver:(typeof SAVE_VERSION!=='undefined'?SAVE_VERSION:0) }, peerId);   // send our handle + build version back
      ui('Peers');
    });
    MP.on('mpstart', (msg)=> beginClientMatch(msg.mapIndex|0, msg.mode, msg));
    MP.on('rbstart', (msg)=> beginClientRollback(msg));   // rollback co-op join
    MP.on('mphub', (msg)=> beginClientHub(msg));
    MP.on('mppause', (msg)=> applyHostPause(!!(msg && msg.paused)));
    MP.on('mpcue', (cue)=> NET.playCue(cue));         // host→client cutscene/overlay cue (seq-deduped)
    // ── co-op save distribution (host→client). SINGLE-SERIALIZER: clients PERSIST the host's exact bytes;
    //    they never serialize their own G. mpsave = mid-match mirror copy; mpresume = full resume blob (also
    //    deserialized into G when resuming — see beginClientMatch's resume branch). ──
    MP.on('mpsavemeta', (m)=>{ S._pendingSaveMeta = m||{}; });
    MP.on('mpsave', (p)=> NET._recvChunked(p, (blob)=> mpClientPersistSave(blob, S._pendingSaveMeta)));
    MP.on('mpresume', (p)=> NET._recvChunked(p, (blob)=> mpClientApplyResume(blob)));
    MP.on('mpbye', (msg)=>{ if(msg && msg.reason==='full'){ NET.mpLog && NET.mpLog('err','room is full — host rejected us'); toast('Room is full'); mpLeave(); } else { NET.mpLog && NET.mpLog('err','host left (clean BYE) — match ended'); mpHostGone('left'); } });   // clean BYE → terminal
  }

  function mpJoin(code){
    if(!mpAvailable()){ toast('Multiplayer unavailable on this network'); return; }
    S.me=profile(); S.role='client'; S.code=code; S.started=false; S._gone=false;
    clearAllTimers();
    MP.enter(code);
    NET.mpLog && NET.mpLog('info','joining room '+code+'… (awaiting host hello)');
    // re-focusing a long-backgrounded tab shouldn't instantly read as "host lost" — give the watchdog grace
    S._visGrace = ()=>{ if(document.visibilityState==='visible' && NET.touchWatchdog) NET.touchWatchdog(); };
    document.addEventListener('visibilitychange', S._visGrace);
    wireClientHandlers();
    MP.onLeave(()=> onHostDrop('left'));                  // Trystero peer-leave → transient? reconnect. Registered once; survives re-enter.
    NET.onHostLost    = ()=> onHostDrop('lost');          // watchdog: snapshots stopped → transient? reconnect
    NET.onStall       = ()=> ui('Stall');                 // brief gap → "reconnecting" hint
    NET.onReconnected = ()=>{ NET.mpLog && NET.mpLog('ok','reconnected to host'); ui('Reconnected'); };
    NET.onFullApplied = ()=>{
      clearTimer('_syncTimer');
      if(NET._cueHold) return;     // a held cutscene/finale owns the freeze — a reconnect resync must NOT un-freeze it (the host's resume cue does)
      if(running) return;          // one-shot: only the FIRST full "drops you in" — never re-centre/re-toast later
      running = true;
      // a co-op campaign opening crawl may still be on screen — close it cleanly (stops narration + timers)
      const _csk=(typeof document!=='undefined')?document.getElementById('crawl-skip'):null;
      const _scr=(typeof document!=='undefined')?document.getElementById('crawlScreen'):null;
      if(_scr && _scr.style.display && _scr.style.display!=='none' && _csk){ try{ _csk.click(); }catch(_){} }
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
    S._joinTimer = setTimeout(()=>{ if(!S.peerId && !S._gone){ NET.mpLog && NET.mpLog('err','join timed out — never reached host '+code+' (bad code / NAT; try a TURN relay)'); toast('Couldn’t reach host — check the code, or paste a TURN relay'); ui('JoinTimeout', { code }); } }, JOIN_TIMEOUT);
    ui('OpenRoom', { code, asHost:false });
  }
  window.mpJoin = mpJoin;

  // Transient client-side drop (Trystero peer-leave OR snapshot watchdog). Re-enter the room for a bounded
  // window to re-establish ICE before declaring the host gone. A clean BYE bypasses this (→ mpHostGone).
  function onHostDrop(reason){
    if(S.role!=='client' || S._gone || S._reconnecting) return;
    NET.mpLog && NET.mpLog('warn','host link dropped ('+reason+') — reconnecting…');
    S._reconnecting = true; S._reconnTries = 0;
    running = false;                                     // freeze the world while we retry
    ui('Stall');                                         // reuse the "reconnecting…" hint
    const deadline = _ms() + RECONNECT_WINDOW;
    const step = ()=>{
      if(S._gone || !S._reconnecting) return;
      if(_ms() >= deadline || S._reconnTries >= RECONNECT_MAX){ S._reconnecting=false; mpHostGone(reason); return; }
      S._reconnTries++;
      NET.mpLog && NET.mpLog('warn','reconnect attempt '+S._reconnTries+'/'+RECONNECT_MAX+'…');
      try{ MP.enter(S.code); wireClientHandlers(); if(NET.resetWatchdog) NET.resetWatchdog(); }catch(_){}
      S._reconnTimer = setTimeout(step, Math.max(2000, RECONNECT_WINDOW/RECONNECT_MAX));
    };
    step();
  }
  window.mpReconnectClient = onHostDrop;

  function armSyncWatchdog(){
    clearTimer('_syncTimer');                          // surface a stuck "Syncing" (lost full) instead of spinning; reconnect re-requests it
    S._syncTimer = setTimeout(()=>{ if(!running && !S._gone){ NET.mpLog && NET.mpLog('err','sync timed out — host snapshot never arrived'); ui('SyncTimeout'); onHostDrop('lost'); } }, SYNC_TIMEOUT);
  }

  // Rollback co-op join: build terrain locally, then join the host's rollback room — the library StateSyncs
  // the host's authoritative dynamic state into our Game (no host snapshots; we then simulate symmetrically).
  function beginClientRollback(msg){
    NET.mpLog && NET.mpLog('info','rbstart received (map '+(msg.mapIndex|0)+', host '+String(msg.hostPeerId).slice(0,6)+'…)');
    S.started=true; S.mode=msg.mode||S.mode; S.mapIndex=msg.mapIndex|0;
    netRole='client'; LOCAL_CTRL='p2'; pendingPlayers=2; mapIndex=S.mapIndex;
    G = newMap(S.mapIndex);                            // deterministic terrain; StateSync overlays dynamic state
    running = false;
    if(typeof resetDialogs==='function') resetDialogs();
    if(typeof syncHud==='function') syncHud();
    if(typeof clampCam==='function') clampCam(G);
    ui('Syncing');
    if(typeof gateMission==='function' && typeof LOADER!=='undefined'){   // visual-only, same as the snapshot client
      LOADER.beginMission(missionTags(S.mapIndex));
      gateMission(S.mapIndex, null, { passive:true, until:()=>running });
    }
    const ctrlMap = {}; if(msg.hostPeerId) ctrlMap[msg.hostPeerId]='p1'; if(MP.selfId) ctrlMap[MP.selfId]='p2';
    whenRB(()=> NET.rbStartJoin(G, ctrlMap, msg.rbRoomId, msg.hostPeerId).then(()=>{
      running = true;
      const o = G._coopOrigins && G._coopOrigins.p2;
      if(o && typeof clampCam==='function'){ const z=G.zoom||1; G.camX=o.x*TILE-(innerWidth/z)/2; G.camY=o.y*TILE-(innerHeight/z)/2; clampCam(G); }
      if(typeof refreshUI==='function') refreshUI();
      ui('EnterGame'); toast('Dropped into rollback co-op — your base is marked in amber');
    }).catch((e)=>{ NET.mpLog && NET.mpLog('err','rollback join failed: '+((e&&e.message)||e)); console.error('[rb] join failed', e); }));
  }

  function beginClientMatch(idx, mode, msg){
    if(msg && msg.mpCampaignId) S.mpCampaignId = msg.mpCampaignId;
    if(msg && msg.resume) return beginClientResume(idx, mode, msg);   // resume: wait for the full blob, deserialize it (no newMap)
    NET.mpLog && NET.mpLog('info','mpstart received (map '+idx+') — building map, awaiting host snapshot');
    if(typeof TELE!=='undefined') TELE.event('coop_session', { role:'join', mode: mode||S.mode });
    S.started=true; S.mode=mode||S.mode; S.mapIndex=idx;
    // T4-5 duel: install the seed-rolled arena at the SAME transient slot before building terrain
    if(S.mode==='duel' && msg && msg.duelSeed!=null && typeof installDuelConfig==='function'){
      const slot=installDuelConfig(msg.duelSeed); idx=slot; S.mapIndex=slot;
    }
    netRole='client'; pendingPlayers=2; mapIndex=idx;
    G = newMap(idx);                                 // regenerate identical terrain + pads (deterministic)
    if(S.mode==='duel') G._pvp=true;
    NET._cueHold=false;                               // a fresh Quarter clears any stale finale/cutscene hold
    running = false;                                  // hold until the host's full snapshot lands
    NET._lastAppliedTick = -1;                        // fresh out-of-order baseline for the new match
    if(NET.resetWatchdog) NET.resetWatchdog();        // start the host-liveness clock fresh for this match
    if(typeof clampCam==='function') clampCam(G);
    if(NET.flushPendingFull) NET.flushPendingFull();  // a full snapshot may have raced ahead of 'mpstart'
    armSyncWatchdog();
    ui('Syncing');
    // visual-only gate: lifts when this map's sprites settle AND the first full snapshot has
    // applied (running flips true in NET.onFullApplied — the gate never touches it). The 15s
    // sync watchdog stays authoritative for network failure; the gate dissolves on host-gone.
    if(typeof gateMission==='function' && typeof LOADER!=='undefined'){
      LOADER.beginMission(missionTags(idx));
      gateMission(idx, null, { passive:true, until:()=>running });
    }
    // co-op campaign: play the same opening crawl the host is playing (it overlays the gate). Both peers
    // stay frozen (running=false) until the host finishes its crawl and ships the first snapshot, which
    // dismisses this crawl and drops us in (NET.onFullApplied). `done` is a no-op — the host drives the
    // transition. Guard on !running so a snapshot that already raced in (flushPendingFull) wins.
    if(msg && msg.crawl && !running && typeof showCrawl==='function' && MAPS[idx] && MAPS[idx].crawl){
      try{ showCrawl(idx, function(){}); }catch(_){}
    }
  }
  function beginClientHub(msg){
    S.started=true; S.mode=(msg&&msg.mode)||S.mode; S.mapIndex=(msg&&msg.mapIndex)|0;
    netRole='client'; LOCAL_CTRL='p2'; pendingPlayers=2; mapIndex=S.mapIndex;
    if(msg && msg.mpCampaignId) S.mpCampaignId=msg.mpCampaignId;
    if(msg && msg.campaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(msg.campaign);
    G = newHubMap();
    // the client may still carry the Ep VII finale's full-screen classes (it played the cinematic but never
    // ran the host-only enterHubFlashAftermath that clears them) — strip them so the H.U.B. HUD is visible.
    if(typeof document!=='undefined'){ document.body.classList.remove('scene-flash'); document.body.classList.remove('scene-hubload'); }
    NET._cueHold=false;   // arriving at the hub IS the end of any finale hold → let onFullApplied finalize the drop-in normally (a transient reconnect never routes here, so it stays frozen)
    NET._hubReadyLocal=false;   // B5: a fresh quarter's hub starts un-readied (the client re-arms READY once it's staged its units)
    running = false;
    NET._lastAppliedTick = -1;
    if(NET.resetWatchdog) NET.resetWatchdog();
    if(typeof resetDialogs==='function') resetDialogs();
    if(typeof syncHud==='function') syncHud();
    if(typeof clampCam==='function') clampCam(G);
    if(NET.flushPendingFull) NET.flushPendingFull();
    armSyncWatchdog();
    ui('Syncing');
    if(typeof gateMission==='function' && typeof LOADER!=='undefined'){
      LOADER.beginMission(missionTagsHub());
      gateMission(S.mapIndex, null, { passive:true, until:()=>running, label:'H.U.B. UPLINK' });
    }
  }

  // RESUME (client): the host ships a full save blob (terrain included) via 'mpresume'; we deserializeGame it
  // directly (host-authoritative → byte-identical to the host), instead of newMap()+snapshot. running flips
  // when the blob applies (mpClientApplyResume). Used for both battlefield and H.U.B. resumes.
  function beginClientResume(idx, mode, msg){
    const isHub=!!(msg && msg.hub);
    NET.mpLog && NET.mpLog('info','mpstart{resume'+(isHub?',hub':'')+'} received (map '+idx+') — awaiting full resume blob');
    if(typeof TELE!=='undefined') TELE.event('coop_session', { role:'join', mode:mode||S.mode, resume:1 });
    S.started=true; S.mode=mode||S.mode; S.mapIndex=idx;
    netRole='client'; LOCAL_CTRL='p2'; pendingPlayers=2; mapIndex=idx;
    running=false; S._awaitResume=true; NET._lastAppliedTick=-1;
    if(NET.resetWatchdog) NET.resetWatchdog();
    if(NET.flushPendingFull) NET.flushPendingFull();
    armSyncWatchdog();
    ui('Syncing');
    if(typeof gateMission==='function' && typeof LOADER!=='undefined'){
      LOADER.beginMission(isHub ? missionTagsHub() : missionTags(idx));
      gateMission(idx, null, { passive:true, until:()=>running, label: isHub ? 'H.U.B. UPLINK' : undefined });
    }
  }
  // Apply a received resume blob: deserialize it into G (safe — host-authored), persist our own copy, run.
  function mpClientApplyResume(blob){
    if(!blob || blob.coop!==true){ NET.mpLog && NET.mpLog('err','resume blob rejected (not a co-op save)'); return; }
    if(typeof saveVersionOk==='function' && !saveVersionOk(blob)){
      NET.mpLog && NET.mpLog('err','resume blob version incompatible — build skew'); toast('Co-op resume failed — your build differs from the host'); onHostDrop('lost'); return; }
    try{
      G = deserializeGame(blob);                        // SAFE: deserializing a host-authored blob (half-state rule intact)
      mapIndex = (typeof saveMapIndex==='function') ? saveMapIndex(blob) : (blob.mapIndex|0);
      S.mapIndex = mapIndex; S.mpCampaignId = blob.mpCampaignId || S.mpCampaignId;
    }catch(err){ NET.mpLog && NET.mpLog('err','resume deserialize failed: '+((err&&err.message)||err)); console.error('[mp] resume failed', err); onHostDrop('lost'); return; }
    mpClientPersistSave(blob, { campId: blob.mpCampaignId });   // keep our own re-hostable copy
    NET.lastFull = 0; NET._lastAppliedTick = 0;          // baseline so the live mpsnap stream takes over cleanly
    S._awaitResume=false; running=true; clearTimer('_syncTimer');
    if(typeof syncHud==='function') syncHud();
    if(typeof refreshUI==='function') refreshUI();
    if(G && G.hub){ if(typeof clampCam==='function') clampCam(G); ui('EnterGame'); toast('Resumed co-op H.U.B. — P1 controls upgrades and launch.'); return; }
    const o=G._coopOrigins && G._coopOrigins.p2;
    if(o && typeof clampCam==='function'){ const z=G.zoom||1; G.camX=o.x*TILE-(innerWidth/z)/2; G.camY=o.y*TILE-(innerHeight/z)/2; clampCam(G); }
    else if(typeof clampCam==='function') clampCam(G);
    ui('EnterGame'); toast('Resumed co-op campaign — your base is marked in amber');
  }
  // Persist a host-shipped co-op blob to THIS device's MP pool (persist-only; never touches G).
  function mpClientPersistSave(blob, meta){
    meta = meta || {};
    const campId = meta.campId || (blob && blob.mpCampaignId);
    if(!campId || !blob || blob.coop!==true) return;     // guard: only persist a real co-op blob
    try{
      if(typeof mpSaveKey!=='function' || typeof saveWrite!=='function') return;
      if(!localStorage.getItem(mpSaveKey(campId)) && typeof enforceMpCap==='function') enforceMpCap();
      saveWrite(mpSaveKey(campId), blob);
      NET.mpLog && NET.mpLog('ok','co-op save mirrored locally');
    }catch(_){}
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
    NET.mpLog && NET.mpLog('err','host connection gone ('+reason+')');
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
    if(!(S.started && G)){ NET.mpLog && NET.mpLog('warn','ally left the lobby'); handlePeerDrop(); return; }       // pre-match lobby drop → just clear
    S._peerGrace = true;
    NET.mpLog && NET.mpLog('warn','ally disconnected mid-match — holding their units for reconnect');
    ui('PeerDropped');                                       // "ally disconnected — waiting to reconnect…"
    toast('Ally disconnected — holding their units…');
    clearTimer('_hostGraceTimer');
    S._hostGraceTimer = setTimeout(()=>{ S._peerGrace=false; S._hostGraceTimer=null; handlePeerDrop(); }, RECONNECT_WINDOW + 3000);
  }

  function handlePeerDrop(){
    // host keeps playing solo-co-op; adopt the orphaned ally's units so the map stays winnable
    if(S.started && G) NET.mpLog && NET.mpLog('warn','reconnect window expired — adopting ally units into p1 (solo co-op)');
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
    NET._baseline = new Map(); NET._lastEcoStr = null; NET._lastQuestStr = null; NET._sinceSend = 0; NET._loreSent = new Map();   // reset Phase 4 delta baseline / eco + quest signatures + dossier-identity dirty-set for the new map
    MP.send('mphub', { mapIndex:S.mapIndex, mode:S.mode, mpCampaignId:S.mpCampaignId, campaign: typeof serializeHubCampaign==='function' ? serializeHubCampaign() : null });
    if(S.peerId && NET.sendFull) NET.sendFull(S.peerId);
  };

  /* ---------------- co-op save distribution + resume (host side) ---------------- */
  // Mid-match save copy → ally (chunked, backpressured, best-effort). Called from mpSaveGame (js/save.js).
  NET.mpBroadcastSave = function(str, campId, auto){
    if(!S.peerId) return;
    const HIWATER = NET.SEND_HIWATER || 64*1024;
    const go=()=>{ if(S._gone) return;
      const buf=(typeof MP!=='undefined' && MP.bufferedAmount)?MP.bufferedAmount():0;
      if(buf>HIWATER){ setTimeout(go, 300); return; }     // don't head-of-line-block the 15Hz mpsnap stream
      try{ MP.send('mpsavemeta', { campId, auto:!!auto }, S.peerId); NET._sendChunked('mpsave', str, S.peerId);
           NET.mpLog && NET.mpLog('info','co-op save → ally ('+Math.round(str.length/1024)+'KB)'); }catch(_){}
    };
    go();
  };
  // Full resume blob (terrain included) → ally; the client deserializes it (mpClientApplyResume).
  NET.mpBroadcastResume = function(str){
    if(!S.peerId) return;
    const HIWATER = NET.SEND_HIWATER || 64*1024;
    const go=()=>{ if(S._gone) return;
      const buf=(typeof MP!=='undefined' && MP.bufferedAmount)?MP.bufferedAmount():0;
      if(buf>HIWATER){ setTimeout(go, 200); return; }
      try{ NET._sendChunked('mpresume', str, S.peerId); NET.mpLog && NET.mpLog('info','co-op resume blob → ally ('+Math.round(str.length/1024)+'KB)'); }catch(_){}
    };
    go();
  };

  // HOST: resume a saved co-op campaign (battlefield OR H.U.B.). Loads the blob into the authoritative G, then
  // ships the SAME blob to the client which deserializes it (byte-identical state). Any participant can do this
  // from their own copy — whoever resumes becomes p1.
  window.mpHostStartFromSave = function(key){
    if(S.role!=='host'){ toast('Only the host can resume a co-op campaign'); return false; }
    const d = (typeof saveRead==='function') ? saveRead(key) : null;
    if(!d || !isSaveBlob(d) || !saveVersionOk(d)){ toast('Saved co-op campaign is unreadable'); return false; }
    if(S.peerId && S._peerVer!=null && S._peerVer < (d.v||0)){ toast('Your ally is on an older build — they can’t load this co-op save'); return false; }
    if(typeof TELE!=='undefined') TELE.event('coop_session', { role:'host', mode:'campaign', resume:1 });
    const isHub = (typeof saveIsHubMap==='function') ? saveIsHubMap(d) : !!d.hub;
    S.mode='campaign'; S.started=true; S.duelSeed=null; S._resumed=true;
    S.mpCampaignId = d.mpCampaignId || S.mpCampaignId || ((typeof _mpUuid==='function')?_mpUuid():('mp'+Date.now().toString(36)));
    d.mpCampaignId = S.mpCampaignId; d.coop = true;       // ensure the wire/local copy carry the adopted identity
    S.mapIndex = (typeof saveMapIndex==='function') ? saveMapIndex(d) : (d.mapIndex|0);
    mapIndex = S.mapIndex; pendingPlayers = d.players||2; LOCAL_CTRL='p1'; netRole='host';
    if(typeof MUSIC!=='undefined') MUSIC.leaveMenu();
    try{ G = deserializeGame(d); }
    catch(err){ console.error('[mp] resume deserialize failed', err); toast('Co-op resume failed — save data incomplete'); resetToSolo(); return false; }
    if(typeof resetDialogs==='function') resetDialogs();
    if(typeof syncHud==='function') syncHud();
    if(typeof clampCam==='function') clampCam(G);
    if(typeof refreshUI==='function') refreshUI();
    running = true;
    if(typeof startHostClock==='function') startHostClock();
    NET.tick=0; NET._sAcc=0; NET._kAcc=0; NET._baseline=new Map(); NET._lastEcoStr=null; NET._lastQuestStr=null; NET._sinceSend=0; NET._lastAppliedTick=-1; NET._loreSent=new Map();
    // write the host's own slot under this campaign id (latest battlefield/HUB)
    try{ if(typeof mpSaveKey==='function' && typeof saveWrite==='function') saveWrite(mpSaveKey(S.mpCampaignId), d); }catch(_){}
    // tell the client to RESUME (not newMap) and ship the full blob it will deserialize
    MP.send('mpstart', { mapIndex:S.mapIndex, mode:'campaign', mpCampaignId:S.mpCampaignId, resume:true, hub:isHub });
    if(S.peerId){ try{ NET.mpBroadcastResume(JSON.stringify(d)); }catch(_){} }
    if(typeof gateMission==='function' && typeof LOADER!=='undefined'){
      LOADER.beginMission(isHub ? missionTagsHub() : missionTags(S.mapIndex));
      gateMission(S.mapIndex, null, { passive:true });
    }
    ui('EnterGame');
    toast(isHub ? 'Resumed co-op H.U.B.' : ('Resumed co-op campaign — Quarter '+(S.mapIndex+1)));
    return true;
  };
})();
