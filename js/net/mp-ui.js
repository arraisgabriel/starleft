/* js/net/mp-ui.js — CLASSIC. The lobby/room screens (DOM overlays, same showSub/hideSub pattern as
   ui.js). Public entry points are called from rts.html onclick=; mp.js calls the mpUi* hooks. */
(function(){
  const UI = window.MP_UI = { mode:'skirmish', asHost:false, code:null, ready:false };
  const $ = id => document.getElementById(id);
  const S = () => window.MP_SESSION || {};

  function commitHandle(){ const h=$('mp-handle'); if(h && h.value.trim()) setHandle(h.value); }

  /* ---------- lobby hub ---------- */
  window.showMpLobby = function(){
    const me=getOrCreateProfile();
    if($('mp-handle')) $('mp-handle').value = me.handle;
    if($('mp-selfid')) $('mp-selfid').textContent = '#'+String(me.id).replace(/[^a-z0-9]/gi,'').slice(0,6);
    // Always OPEN the screen; if the transport isn't ready, explain why (don't silently no-op).
    const avail = mpAvailable();
    const note=$('mp-net-note');
    if(note){
      if(avail) note.innerHTML = 'Serverless P2P over WebRTC — no server. STUN connects most players; paste a relay in-room for strict networks.';
      else if(location.protocol==='file:') note.innerHTML = '⚠ <b>Multiplayer needs the game served over http(s).</b> ES modules are blocked on <code>file://</code>. Run a local server, e.g. <code>python3 -m http.server</code> in the game folder, then open <code>http://localhost:8000/rts.html</code>. (Single-player works fine from a file.)';
      else if(!window.__MP_READY) note.innerHTML = '⏳ Connecting to the peer network… give it a moment, then reopen this screen.';
      else note.innerHTML = '⚠ Multiplayer transport failed to load (network blocked or relays down). Check your connection and reload.';
    }
    ['mp-create','mp-joinbtn'].forEach(id=>{ const b=$(id); if(b) b.disabled = !avail; });
    if($('mp-presence-on')) $('mp-presence-on').checked = (typeof mpIsPresenceOn==='function' && mpIsPresenceOn());
    renderPresence();
    ['startScreen','mapScreen','loadScreen','docScreen'].forEach(hideSub);
    showSub('mpScreen');
  };
  window.mpUiEnsureHandleThen = function(cb){ // for the #mp=CODE deep-link path
    commitHandle();
    const me=getOrCreateProfile();
    if(!me.handle){ showMpLobby(); toast('Set a callsign, then you’ll join'); }
    cb && cb();
  };

  /* ---------- lobby actions ---------- */
  window.mpCreateRoom = function(){ commitHandle(); const code=mpMakeRoomCode(); if(typeof mpHostCreate==='function') mpHostCreate(code, UI.mode); };
  window.mpJoinByCode = function(){ commitHandle(); const c=(($('mp-joincode')||{}).value||'').trim();
    if(!c){ toast('Enter a room code'); return; } if(typeof mpJoin==='function') mpJoin(c); };
  window.mpTogglePresence = function(on){ if(on){ if(typeof mpPresenceOn==='function') mpPresenceOn(); } else if(typeof mpPresenceOff==='function') mpPresenceOff(); renderPresence(); };

  function renderPresence(){
    const wrap=$('mp-friends-list'); if(!wrap) return;
    const online = (typeof mpOnlineFriends==='function') ? mpOnlineFriends() : [];
    if(!online.length){ wrap.innerHTML='<div class="muted">No known operators online. Toggle “Appear online”, then trade a room link to add friends.</div>'; return; }
    wrap.innerHTML='';
    online.forEach(f=>{ const row=document.createElement('div'); row.className='mp-friend';
      row.innerHTML='<span class="mp-dot online"></span><span class="mp-fname"></span><button class="tc-btn mp-inv">Invite</button>';
      row.querySelector('.mp-fname').textContent=f.handle;
      row.querySelector('.mp-inv').onclick=()=>{ if(!(S().code)){ window.mpCreateRoom(); setTimeout(()=>{ if(typeof mpInviteFriend==='function') mpInviteFriend(f.id); }, 300); } else if(typeof mpInviteFriend==='function') mpInviteFriend(f.id); };
      wrap.appendChild(row);
    });
  }
  window.mpUiPresence = renderPresence;
  window.mpUiInvite = function(code, handle){ // incoming invite from a friend
    if($('mp-joincode')) $('mp-joincode').value = code;
    showMpLobby();
    toast((handle||'A friend')+' invited you — press Join ▶');
  };

  /* ---------- room screen ---------- */
  function populateMapPick(){
    const sel=$('mp-map-pick'); if(!sel || typeof MAPS==='undefined') return;
    sel.innerHTML=''; MAPS.forEach((m,i)=>{ const o=document.createElement('option'); o.value=i;
      o.textContent='Quarter '+(i+1)+' — '+((m.name.split('—')[1]||m.name).trim()); sel.appendChild(o); });
  }
  window.mpUiSetMode = function(mode){ UI.mode=mode;
    ['skirmish','campaign'].forEach(m=>{ const b=$('mp-mode-'+m); if(b) b.classList.toggle('on', m===mode); });
    const mp=$('mp-map-pick'); if(mp) mp.disabled = (mode==='campaign');   // campaign always starts at Quarter 1
  };

  window.mpUiOpenRoom = function(opts){
    UI.asHost=!!opts.asHost; UI.code=opts.code; UI.ready=false;
    ['startScreen','mapScreen','loadScreen','mpScreen'].forEach(hideSub);
    if($('mp-room-code')) $('mp-room-code').textContent = opts.code;
    if($('mp-room-title')) $('mp-room-title').textContent = opts.asHost ? 'Your Co-op Room' : 'Joining Room';
    if($('mp-host-ctrls')) $('mp-host-ctrls').style.display = opts.asHost ? '' : 'none';
    if($('mp-ready-row'))  $('mp-ready-row').style.display  = opts.asHost ? 'none' : '';
    if($('mp-share')) $('mp-share').style.display = (navigator.share ? '' : 'none');
    if($('mp-qr-box')){ $('mp-qr-box').style.display='none'; $('mp-qr-box').innerHTML=''; }
    populateMapPick(); window.mpUiSetMode(UI.mode); renderPeers(); setConn('Connecting…','wait');
    if(typeof mpStartRtt==='function') mpStartRtt();
    showSub('mpRoomScreen');
  };
  window.mpUiLeftRoom = function(){ hideSub('mpRoomScreen'); showSub('startScreen'); };
  window.mpUiHostGone = function(){ toast('Host left — match ended'); if(typeof mpLeave==='function') mpLeave(); window.mpUiLeftRoom(); };
  window.mpUiEnterGame = function(){ ['mpScreen','mpRoomScreen','startScreen','mapScreen','loadScreen'].forEach(hideSub); };
  window.mpUiSyncing = function(){ setConn('Syncing battlefield…','wait'); const w=$('mp-wait'); if(w) w.textContent='Host started — syncing…'; };
  window.mpUiPeerDropped = function(){ toast('🔌 Co-founder dropped — you’re holding their base'); renderPeers(); };
  window.mpUiClientGameOver = function(){ running=false; toast('Match over'); };

  function renderPeers(){
    const wrap=$('mp-peers'); if(!wrap) return;
    const s=S(); const rows=[];
    const me=s.me||getOrCreateProfile();
    const host = s.role==='host' ? me : s.host;
    const join = s.role==='host' ? s.joiner : me;
    const mk=(p,ctrl,isHost,isYou)=> p ? `<div class="mp-peer"><span class="mp-swatch ${ctrl}"></span>`+
      `<span class="mp-peer-name">${(p.handle||'Operator')}${isYou?' (you)':''}</span>`+
      `<span class="mp-badge ${isHost?'host':'guest'}">${isHost?'HOST · p1':'GUEST · p2'}</span>`+
      `<span class="mp-speak" data-pid="${p.id||''}">●</span></div>` : '';
    rows.push(mk(host,'ctrl-p1',true, s.role==='host'));
    rows.push(mk(join,'ctrl-p2',false, s.role!=='host'));
    wrap.innerHTML = rows.join('') || '<div class="muted">Waiting for a co-founder…</div>';
    const startBtn=$('mp-start'); if(startBtn) startBtn.disabled = !(s.role==='host' && s.peerId);
    setConn(s.peerId ? 'Connected' : 'Waiting for co-founder…', s.peerId?'ok':'wait');
  }
  window.mpUiPeers = renderPeers;

  function setConn(txt, cls){ const c=$('mp-conn'); if(!c) return; const t=$('mp-conn-txt'); if(t) t.textContent=txt;
    c.className='mp-conn '+(cls||''); }
  window.mpUiSetRtt = function(ms){ const r=$('mp-rtt'); if(r) r.textContent = ms!=null ? ('· '+ms+' ms') : ''; };

  /* ---------- room buttons ---------- */
  window.mpHostStartClick = function(){
    const idx = UI.mode==='campaign' ? 0 : (parseInt(($('mp-map-pick')||{}).value,10)||0);
    if(typeof mpHostStart==='function') mpHostStart(idx, UI.mode);
  };
  window.mpToggleReady = function(){ UI.ready=!UI.ready; const b=$('mp-ready'); if(b) b.classList.toggle('on',UI.ready);
    try{ MP.send('mpready',{ready:UI.ready}); }catch(_){} };
  window.mpLeaveRoomClick = function(){ if(typeof mpLeave==='function') mpLeave(); };
  window.mpAddRelay = function(){ const u=(($('mp-relay-url')||{}).value||'').trim(); if(u && window.MP && MP.setRelay){ MP.setRelay(u); toast('Relay added — reconnect to use it'); } };

  /* ---------- invite sharing ---------- */
  window.mpCopyInvite = function(){ const link=mpInviteLink(UI.code);
    if(navigator.clipboard) navigator.clipboard.writeText(link).then(()=>toast('Invite link copied'), ()=>toast(link));
    else toast(link); };
  window.mpShareInvite = function(){ const link=mpInviteLink(UI.code);
    if(navigator.share) navigator.share({ title:'STARLEFT Co-op', text:'Join my startup raid', url:link }).catch(()=>{}); };
  window.mpToggleQR = function(){ const box=$('mp-qr-box'); if(!box) return;
    if(box.style.display==='none'||!box.style.display){ box.style.display='block'; if(typeof mpRenderQR==='function') mpRenderQR(box, mpInviteLink(UI.code)); }
    else box.style.display='none'; };

  /* ---------- chat + emotes (data channel) ---------- */
  window.mpSendChat = function(){ const inp=$('mp-chat-text'); const txt=(inp&&inp.value||'').trim(); if(!txt) return;
    const me=getOrCreateProfile(); try{ MP.send('mpchat',{from:me.handle,text:txt}); }catch(_){}
    appendChat(me.handle, txt); if(inp) inp.value=''; };
  window.mpEmote = function(e){ const map={gg:'GG',help:'HELP!',attack:'PUSH 🚀',defend:'HOLD 🛡',thanks:'TY 🙏'};
    const me=getOrCreateProfile(); try{ MP.send('mpemote',{from:me.handle,e}); }catch(_){}
    appendChat(me.handle, map[e]||e); };
  function appendChat(from, text){ const log=$('mp-chat-log'); if(!log) return;
    const row=document.createElement('div'); row.className='mp-chat-row';
    row.innerHTML='<b></b><span></span>'; row.querySelector('b').textContent=from+': '; row.querySelector('span').textContent=text;
    log.appendChild(row); log.scrollTop=log.scrollHeight;
    if(getComputedStyle(document.getElementById('mpRoomScreen')).display==='none') toast('💬 '+from+': '+text); }
  window.mpUiBindChat = function(){
    MP.on('mpchat',(m)=>appendChat(m.from||'Ally', m.text||''));
    MP.on('mpemote',(m)=>{ const map={gg:'GG',help:'HELP!',attack:'PUSH 🚀',defend:'HOLD 🛡',thanks:'TY 🙏'}; appendChat(m.from||'Ally', map[m.e]||m.e); });
    MP.on('mpready',(m)=>{ const s=S(); s._joinerReady=!!m.ready; renderPeers(); });
  };

  /* ---------- voice button handlers (delegate to COMMS in voice-chat.js) ---------- */
  window.mpToggleMic = function(){ if(window.COMMS) COMMS.toggleMic(); };
  window.mpToggleMute = function(){ if(window.COMMS) COMMS.toggleMute(); };

  // bind chat receivers as soon as MP is ready (covers both host & joiner)
  whenMP(()=>{ if(window.MP && !MP.unavailable && typeof mpUiBindChat==='function') mpUiBindChat(); });
})();
