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

// -----------------------------------------------------------------------------
// Multiplayer connection quality UI
// Local-only display derived from the existing RTT probe.
// Does not affect simulation, saves, commands, or snapshots.
// -----------------------------------------------------------------------------
(function(){
  function $(id){ return document.getElementById(id); }

  function mpQualityFromRtt(ms){
    if(ms == null || !isFinite(ms)){
      return {
        key: 'unknown',
        label: '—',
        detail: 'No peer RTT yet'
      };
    }

    if(ms < 100){
      return {
        key: 'good',
        label: 'Good',
        detail: 'Low-latency board channel'
      };
    }

    if(ms < 180){
      return {
        key: 'okay',
        label: 'Okay',
        detail: 'Playable co-op latency'
      };
    }

    if(ms < 280){
      return {
        key: 'laggy',
        label: 'Laggy',
        detail: 'Orders may feel delayed'
      };
    }

    return {
      key: 'bad',
      label: 'Bad',
      detail: 'Expect late orders and corrections'
    };
  }

  function setQualityClass(el, quality){
    if(!el) return;
    el.classList.remove('unknown', 'good', 'okay', 'laggy', 'bad');
    el.classList.add(quality.key);
  }

  function updateLobbyQuality(ms){
    const el = $('mp-quality');
    if(!el) return;

    const quality = mpQualityFromRtt(ms);
    el.textContent = 'Quality: ' + quality.label;
    el.title = quality.detail;
    setQualityClass(el, quality);
  }

  function updateInGameQuality(ms){
    const panel = $('netq-panel');
    const qualityEl = $('netq-quality');
    const rttEl = $('netq-rtt');

    if(!panel || !qualityEl || !rttEl) return;

    const quality = mpQualityFromRtt(ms);

    qualityEl.textContent = quality.label;
    qualityEl.title = quality.detail;

    if(ms == null || !isFinite(ms)){
      rttEl.textContent = '—';
    } else {
      rttEl.textContent = Math.round(ms) + ' ms';
    }

    setQualityClass(panel, quality);
  }

  function updateQuality(ms){
    window.MP_LAST_RTT = ms;
    const q = mpQualityFromRtt(ms);
    window.MP_NET_QUALITY = q;

    // log only on a quality-tier *change* (never per probe) so the panel isn't spammed every RTT sample
    if(q && q.key && q.key !== _lastQualityKey){
      const lvl = (q.key==='poor' || q.key==='bad') ? 'warn' : 'info';
      if(window.NET && window.NET.mpLog && _lastQualityKey!==undefined) window.NET.mpLog(lvl, 'link quality: '+q.label+(ms!=null&&isFinite(ms)?' ('+Math.round(ms)+'ms RTT)':''));
      _lastQualityKey = q.key;
    }

    updateLobbyQuality(ms);
    updateInGameQuality(ms);
  }
  let _lastQualityKey;

  // Keep the original RTT chip behavior, then add quality updates.
  if(typeof window.mpUiSetRtt === 'function' && !window.__mpUiSetRttBase){
    window.__mpUiSetRttBase = window.mpUiSetRtt;
  }

  window.mpUiSetRtt = function(ms){
    if(typeof window.__mpUiSetRttBase === 'function'){
      window.__mpUiSetRttBase(ms);
    } else {
      const el = $('mp-rtt');
      if(el){
        el.textContent = (ms == null || !isFinite(ms)) ? '' : Math.round(ms) + ' ms';
      }
    }

    updateQuality(ms);
  };

  window.mpQualityFromRtt = mpQualityFromRtt;

  window.mpToggleNetQuality = function(force){
    const panel = $('netq-panel');
    if(!panel) return;

    const show = (typeof force === 'boolean')
      ? force
      : panel.style.display === 'none';

    panel.style.display = show ? 'flex' : 'none';

    try{
      localStorage.setItem('starleft_show_net_quality', show ? '1' : '0');
    }catch(_){}

    updateQuality(window.MP_LAST_RTT);
  };

  // Initial paint, useful before the first RTT probe lands.
  updateQuality(window.MP_LAST_RTT);
})();