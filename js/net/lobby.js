/* js/net/lobby.js — CLASSIC. Room codes, invite links + QR, #mp=CODE auto-join, and the opt-in
   presence room ("find online friends"). "Near players" with no server/geolocation honestly means
   "people you've played with who are currently online" via a shared presence room. */
(function(){
  /* ---------- readable, on-theme room codes (double as invite tokens) ---------- */
  const A=['pivot','synergy','disrupt','scale','agile','growth','lean','stealth','runway','moat','blitz','hockey'];
  const B=['unicorn','intern','founder','vc','termsheet','captable','exit','ipo','pitch','burn','seed','runway'];
  window.mpMakeRoomCode = function(){
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    return pick(A)+'-'+pick(B)+'-'+(10+Math.floor(Math.random()*89));
  };
  window.mpInviteLink = function(code){ return location.origin + location.pathname + '#mp=' + encodeURIComponent(code); };

  /* ---------- #mp=CODE auto-join on page load (invite opened outside the game) ---------- */
  window.mpCheckInviteHash = function(){
    const m=/[#&]mp=([^&]+)/.exec(location.hash||''); if(!m) return;
    const code=decodeURIComponent(m[1]);
    try { history.replaceState(null,'',location.pathname+location.search); } catch(_){}   // don't re-fire on reload
    whenMP(()=>{
      if(!mpAvailable()){ toast('Multiplayer unavailable on this network'); return; }
      const go=()=>{ if(typeof mpJoin==='function') mpJoin(code); };
      if(typeof mpUiEnsureHandleThen==='function') mpUiEnsureHandleThen(go); else go();
    });
  };

  /* ---------- presence: optional "appear online" + invite known friends ---------- */
  const seen = {};                 // id -> { handle, t }
  let presOn=false, beat=null;
  window.mpPresenceOn = function(){
    if(presOn || !mpAvailable()) return;
    MP.presence.join(); presOn=true;
    const me=getOrCreateProfile();
    MP.presence.on((d)=>{
      if(!d) return;
      if(d.kind==='beat'){ seen[d.id]={ handle:d.handle, t:Date.now() }; if(typeof mpUiPresence==='function') mpUiPresence(); }
      else if(d.kind==='invite' && d.to===me.id){ if(typeof mpUiInvite==='function') mpUiInvite(d.code, d.handle); }
    });
    const send=()=>MP.presence.send({ kind:'beat', id:me.id, handle:me.handle, t:Date.now() });
    send(); beat=setInterval(send, 5000);
  };
  window.mpPresenceOff = function(){ if(beat){ clearInterval(beat); beat=null; } if(presOn){ try{ MP.presence.leave(); }catch(_){} presOn=false; } };
  window.mpIsPresenceOn = function(){ return presOn; };
  window.mpOnlineFriends = function(){
    const now=Date.now(), out=[];
    for(const f of (typeof getFriends==='function'?getFriends():[])){ const s=seen[f.id]; if(s && now-s.t<15000) out.push({ id:f.id, handle:s.handle||f.handle }); }
    return out;
  };
  // invite a friend to my current room (the inviter must already have created a room)
  window.mpInviteFriend = function(friendId){
    if(!presOn){ toast('Turn on "Appear online" first'); return; }
    const code = window.MP_SESSION && MP_SESSION.code;
    if(!code){ toast('Create a room first, then invite'); return; }
    const me=getOrCreateProfile();
    MP.presence.send({ kind:'invite', to:friendId, from:me.id, handle:me.handle, code });
    toast('Invite sent');
  };

  /* ---------- T3-8: one-tap "Invite a friend" from the in-game top menu ----------
     Shares the #mp=CODE invite link for the CURRENT room, or spins a room up first when solo.
     The link previews as the rich OG card (T0-7), so a pasted invite looks like an invitation. */
  function _shareInvite(code){
    const link = mpInviteLink(code);
    const text = 'Co-found my startup — drop into STARLEFT co-op: ';
    const copy = ()=>{
      if(navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(text+link).then(()=>toast('📋 Invite link copied — send it to a co-founder')).catch(()=>toast(link));
      else toast(link);
    };
    if(navigator.share) navigator.share({ title:'STARLEFT co-op', text, url:link }).catch((e)=>{ if(!e || e.name!=='AbortError') copy(); });
    else copy();
  }
  window.mpQuickInvite = function(){
    const code = window.MP_SESSION && MP_SESSION.code;
    if(code){ _shareInvite(code); return; }
    whenMP(()=>{
      if(typeof mpAvailable==='function' && !mpAvailable()){ toast('Multiplayer unavailable on this network'); return; }
      const go=()=>{
        if(typeof mpCreateRoom==='function') mpCreateRoom();
        setTimeout(()=>{ const c=window.MP_SESSION && MP_SESSION.code; if(c) _shareInvite(c); else toast('Create a room, then tap Invite again'); }, 400);
      };
      if(typeof mpUiEnsureHandleThen==='function') mpUiEnsureHandleThen(go); else go();
    });
  };

  /* ---------- QR rendering for the invite link (vendored qrcode-generator) ---------- */
  window.mpRenderQR = async function(el, text){
    if(!el) return;
    try {
      const mod = await import('../vendor/qrcode.min.js');
      const qrcode = mod.default || mod;
      const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      el.innerHTML = qr.createImgTag(4, 8);   // module size 4px, 8px margin
    } catch(e){ el.textContent = 'QR unavailable'; }
  };
})();
