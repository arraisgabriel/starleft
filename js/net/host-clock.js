/* js/net/host-clock.js — CLASSIC. Keeps the HOST simulating + broadcasting even when its window
   is occluded / behind another window / on a background tab.

   Browsers throttle or fully pause requestAnimationFrame (and main-thread timers) for non-foreground
   windows. Since the host is the authority, a stalled host freezes every client. A Web Worker's timer
   keeps firing in the background, so we drive update()+NET.hostTick() from a worker heartbeat, while
   rAF stays the primary driver whenever the window is actually visible (so the foreground feel is
   unchanged and there is never a double-step). Plus a silent-audio + Screen Wake Lock keep-alive so
   the browser is far less likely to throttle/freeze the host tab. Host-only; the client needs none
   (its applySnap is a data-channel handler that runs while backgrounded). */
(function(){
  const NET = (window.NET = window.NET || {});
  let worker=null, hostLast=0, lastRaf=0;
  let ac=null, audioNode=null, wakeLock=null, visBound=false;

  function now(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }

  // one authoritative step, paced by a REAL-TIME clamped dt (not the rAF loop's dt)
  function hostStep(){
    if(netRole!=='host' || !G || !running || G.over) return;
    const t = now();
    let dt = (t - hostLast)/1000; hostLast = t;
    if(dt <= 0) return;
    dt = Math.min(0.1, dt);                 // clamp: after a background gap, one giant step can't warp the sim
    update(G, dt);
    if(NET.hostTick) NET.hostTick(dt);
  }

  // called from the rAF loop while the host window is visible — rAF is the primary driver, and
  // stamping lastRaf keeps the worker dormant (it only steps when rAF has gone stale).
  NET.hostRafStep = function(){ lastRaf = now(); hostStep(); };

  function startWorker(){
    if(worker) return;
    try{
      const src = 'var id=setInterval(function(){postMessage(0);},33);' +
                  'onmessage=function(e){if(e.data==="stop"){clearInterval(id);}};';
      const url = URL.createObjectURL(new Blob([src], {type:'text/javascript'}));
      worker = new Worker(url);
      try{ URL.revokeObjectURL(url); }catch(_){}
      worker.onmessage = function(){ if(now() - lastRaf > 120) hostStep(); };   // rAF throttled/stopped → keep host alive
    }catch(_){ worker=null; }               // worker unavailable (e.g. file://): host still runs while visible via rAF
  }

  // silent looping audio marks the tab "audible", which browsers keep at full priority (less throttling)
  function startAudioKeepAlive(){
    try{
      const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
      ac = ac || new AC();
      if(ac.state==='suspended') ac.resume().catch(function(){});
      const g = ac.createGain(); g.gain.value = 0.0001;       // ~ -80 dB: inaudible but counts as "playing"
      const o = ac.createOscillator(); o.frequency.value = 30;
      o.connect(g); g.connect(ac.destination); o.start();
      audioNode = { o:o, g:g };
    }catch(_){}
  }
  function stopAudioKeepAlive(){
    try{ if(audioNode){ audioNode.o.stop(); audioNode.o.disconnect(); audioNode.g.disconnect(); } }catch(_){}
    audioNode = null;
  }

  // Screen Wake Lock → host machine's display doesn't sleep mid-match. Auto-released when the tab
  // hides, so re-acquire on return to visible. Best-effort (Chromium; needs a secure context).
  function acquireWakeLock(){
    try{
      if(navigator.wakeLock && document.visibilityState==='visible'){
        navigator.wakeLock.request('screen').then(function(wl){ wakeLock=wl; }).catch(function(){});
      }
    }catch(_){}
  }
  function onVis(){ if(document.visibilityState==='visible' && worker) acquireWakeLock(); }

  window.startHostClock = function(){
    hostLast = lastRaf = now();
    if(worker) return;                      // already running (e.g. campaign advance) — just resynced the clock
    startWorker();
    startAudioKeepAlive();
    acquireWakeLock();
    if(!visBound){ document.addEventListener('visibilitychange', onVis); visBound=true; }
  };
  window.stopHostClock = function(){
    if(worker){ try{ worker.postMessage('stop'); worker.terminate(); }catch(_){} worker=null; }
    stopAudioKeepAlive();
    try{ if(wakeLock){ wakeLock.release(); } }catch(_){}
    wakeLock=null;
    if(visBound){ document.removeEventListener('visibilitychange', onVis); visBound=false; }
  };
})();
