/* js/net/features.js — CLASSIC. Co-op comfort features: map ping (Alt+tap) and the RTT chip.
   Loaded after mp-ui.js; binds receivers once MP is ready. All no-ops when not in a co-op match. */
(function(){
  /* ---------- map ping: Alt+tap drops a marker on BOTH screens ---------- */
  // Capture-phase pointerdown so we can ping WITHOUT also issuing a unit move (we stop the gesture).
  function bindPing(){
    const cv=document.getElementById('cv'); if(!cv) return;
    cv.addEventListener('pointerdown', e=>{
      if(!e.altKey || netRole==='solo' || !G || G.over) return;
      e.preventDefault(); e.stopImmediatePropagation();           // suppress the normal tap/command
      const w = screenToWorld(G, e.clientX, e.clientY);
      const me = (typeof getOrCreateProfile==='function') ? getOrCreateProfile() : {handle:'Ally'};
      showPing(w.x, w.y, LOCAL_CTRL);
      try{ MP.send('mpping', { x:w.x, y:w.y, c:LOCAL_CTRL, from:me.handle }); }catch(_){}
    }, true);
  }
  function showPing(x, y, ctrl){
    const col = (typeof ctrlColor==='function') ? ctrlColor(ctrl) : '#ffd86b';
    if(typeof spawnRing==='function'){ spawnRing(x,y,col); spawnRing(x,y,col); }   // double pulse = ping, not a move ring
  }
  window.mpShowPing = showPing;

  /* ---------- RTT chip: trade timestamps, show round-trip ms ---------- */
  let rttTimer=null;
  function startRtt(){
    if(rttTimer) return;
    rttTimer = setInterval(()=>{
      if(!(window.MP && MP.inRoom)) return;
      try{ MP.send('mprtt', { t: Date.now() }); }catch(_){}
    }, 2000);
  }
  function stopRtt(){ if(rttTimer){ clearInterval(rttTimer); rttTimer=null; } if(typeof mpUiSetRtt==='function') mpUiSetRtt(null); }
  window.mpStartRtt = startRtt; window.mpStopRtt = stopRtt;

  whenMP(()=>{
    if(!(window.MP) || MP.unavailable) return;
    bindPing();
    MP.on('mpping', (m)=>{ if(!G) return; showPing(m.x, m.y, m.c); toast('📍 '+(m.from||'Ally')+' pinged the map'); });
    MP.on('mprtt', (m, peerId)=>{ if(m && m.echo){ if(typeof mpUiSetRtt==='function') mpUiSetRtt(Math.max(0, Date.now()-m.t)); }
      else { try{ MP.send('mprtt', { t:m.t, echo:true }, peerId); }catch(_){} } });
  });
})();
