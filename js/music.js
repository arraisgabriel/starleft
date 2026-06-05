/* music.js — menu-only cyberpunk theme playback.
   Plays the main menu theme once, then loops the menu bed while the player is in
   pre-game/menu overlays. Separate from VOICE: voice mute does not affect music. */
const MUSIC = (function(){
  const LS_KEY = 'starleft_music';
  const START_DELAY_MS = 2000;

  let enabled = true, volume = 0.55;
  try{
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if(typeof s.enabled === 'boolean') enabled = s.enabled;
    if(typeof s.volume === 'number') volume = Math.max(0, Math.min(1, s.volume));
  }catch(_){}
  const save = ()=>{ try{ localStorage.setItem(LS_KEY, JSON.stringify({ enabled, volume })); }catch(_){} };

  let mainAudio=null, loopAudio=null, cineAudio=null;
  // Web-Audio feedback-delay echo for the cinematic cue's finale (intensifies, then "resounds" after the source stops)
  let echoCtx=null, echoSrc=null, echoDelay=null, echoFb=null, echoWet=null, echoDry=null, echoTimer=null, echoActive=false;
  let inMenu=false, started=false, pendingStart=false, initDone=false, startTimer=null;

  function makeAudio(src, loop){
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    a.loop = !!loop;
    a.volume = volume;
    a.onerror = ()=>{};
    return a;
  }
  function ensureAudio(){
    if(mainAudio) return;
    mainAudio = makeAudio(typeof MUSIC_MAIN!=='undefined' ? MUSIC_MAIN : '', false);
    loopAudio = makeAudio(typeof MUSIC_MENU_LOOP!=='undefined' ? MUSIC_MENU_LOOP : '', true);
    mainAudio.addEventListener('ended', ()=>{
      if(inMenu && enabled) playLoop();
    });
  }
  function playAudio(a){
    if(!a || !enabled || !inMenu) return Promise.resolve(false);
    a.volume = volume;
    const p = a.play();
    if(p && p.then) return p.then(()=>true).catch(()=>{ pendingStart=true; return false; });
    return Promise.resolve(true);
  }
  function playLoop(){
    ensureAudio();
    if(!loopAudio || !enabled || !inMenu) return;
    playAudio(loopAudio);
  }
  function startSequence(){
    ensureAudio();
    if(!enabled || !inMenu) return;
    pendingStart=false;
    started=true;
    try{ loopAudio.pause(); loopAudio.currentTime=0; }catch(_){}
    playAudio(mainAudio).then(ok=>{
      if(!ok) return;
      // If the main file is empty/missing and ends immediately, the ended handler
      // may not fire consistently across browsers; this keeps the menu from going silent.
      if(mainAudio && mainAudio.ended && inMenu) playLoop();
    });
  }
  function scheduleStart(delay){
    clearTimeout(startTimer);
    startTimer = setTimeout(()=>{
      if(!started || pendingStart) startSequence();
    }, delay==null ? START_DELAY_MS : delay);
  }
  function pauseAll(reset){
    clearTimeout(startTimer);
    [mainAudio, loopAudio].forEach(a=>{
      if(!a) return;
      try{ a.pause(); if(reset) a.currentTime=0; }catch(_){}
    });
  }
  function anyTrackPlaying(){
    return !!((mainAudio && !mainAudio.paused) || (loopAudio && !loopAudio.paused));
  }
  // lazily route cineAudio through a feedback-delay graph so its finale can echo (built on first ramp,
  // deep in gameplay, so the AudioContext resumes cleanly; until then the cue plays straight off the element)
  function buildEcho(){
    if(echoActive || echoSrc || !cineAudio) return;   // echoSrc guard: createMediaElementSource is once-per-element
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    try{
      echoCtx = new AC();
      echoDry = echoCtx.createGain(); echoDry.gain.value=1;
      echoWet = echoCtx.createGain(); echoWet.gain.value=0;
      echoFb  = echoCtx.createGain(); echoFb.gain.value=0;
      echoDelay = echoCtx.createDelay(1.5); echoDelay.delayTime.value=0.28;
      echoDelay.connect(echoFb); echoFb.connect(echoDelay);          // feedback loop (the repeating echo)
      echoDelay.connect(echoWet); echoWet.connect(echoCtx.destination);
      echoDry.connect(echoCtx.destination);
      echoSrc = echoCtx.createMediaElementSource(cineAudio);          // capture the element → graph
      echoSrc.connect(echoDry); echoSrc.connect(echoDelay);
      if(echoCtx.state==='suspended') echoCtx.resume().catch(()=>{});
      echoActive=true;
    }catch(_){ try{ echoCtx&&echoCtx.close(); }catch(__){} echoCtx=echoSrc=echoDelay=echoFb=echoWet=echoDry=null; echoActive=false; }
  }
  function killEcho(){
    clearTimeout(echoTimer); echoTimer=null;
    if(echoCtx){ try{ echoSrc&&echoSrc.disconnect(); }catch(_){} try{ echoCtx.close(); }catch(_){} }
    echoCtx=echoSrc=echoDelay=echoFb=echoWet=echoDry=null; echoActive=false;
  }
  function bootGateOpen(){
    const gate = document.getElementById('bootGate');
    return !!(gate && gate.style.display !== 'none' && !gate.classList.contains('hide'));
  }
  function unlockRetry(){
    if(!inMenu || !enabled || anyTrackPlaying() || bootGateOpen()) return;
    // Browser autoplay can reject the 2s load-time attempt. Also, a user may
    // click before that attempt fires; use any first gesture as permission to
    // start immediately instead of waiting for a second gesture.
    pendingStart=true;
    startSequence();
  }
  ['pointerdown','keydown','touchstart'].forEach(ev =>
    window.addEventListener(ev, unlockRetry, { capture:true, passive:true }));

  return {
    init(){
      if(initDone) return;
      initDone=true; ensureAudio();
      if(document.getElementById('bootGate')) inMenu=true;
      else this.enterMenu();
    },
    startNow(){
      inMenu=true;
      clearTimeout(startTimer);
      startSequence();
    },
    // one-off cinematic music cue, plays OVER gameplay (e.g. the Ep VII "flash" sequence) regardless of
    // inMenu; respects the music mute toggle + volume. Stops on stopCinematic(), mute, or return to menu.
    playCinematic(src){
      if(!enabled || !src) return;
      killEcho();
      if(cineAudio){ try{ cineAudio.pause(); }catch(_){} }
      cineAudio = new Audio(); cineAudio.preload='auto'; cineAudio.loop=false; cineAudio.onerror=()=>{};
      cineAudio.volume = volume; cineAudio.src = src;
      const p = cineAudio.play(); if(p && p.catch) p.catch(()=>{});
    },
    // ramp the cinematic echo as the cue nears its end; `t01` (0→1) drives feedback + wet mix so the echo intensifies.
    cinematicEcho(t01){
      if(!enabled || !cineAudio) return;
      buildEcho(); if(!echoActive) return;
      const x=Math.max(0, Math.min(1, t01));
      try{ echoFb.gain.value = 0.72*x; echoWet.gain.value = 0.55*x; }catch(_){}
    },
    stopCinematic(){
      if(echoActive && echoCtx){
        if(!cineAudio) return;                       // already ringing out — idempotent (don't re-trigger/extend)
        // resounding finish: stop the source but let the feedback tail ring out (~3s), then tear the graph down.
        try{ cineAudio.pause(); }catch(_){}
        cineAudio=null;
        try{ echoFb.gain.value=0.8; }catch(_){}
        // ring for the resounding-tail window (≈ ends right as the scene cuts to the hub), then tear the graph down
        clearTimeout(echoTimer); echoTimer=setTimeout(killEcho, (typeof NUKE_T_ECHO_TAIL!=='undefined'?NUKE_T_ECHO_TAIL:6)*1000);
        return;
      }
      if(cineAudio){ try{ cineAudio.pause(); cineAudio.currentTime=0; }catch(_){} cineAudio=null; }
    },
    enterMenu(){
      this.stopCinematic();
      inMenu=true;
      if(!initDone) return;
      if(!started || pendingStart) scheduleStart(started ? 0 : START_DELAY_MS);
      else if(loopAudio && loopAudio.paused && (!mainAudio || mainAudio.ended)) playLoop();
      else if(mainAudio && mainAudio.paused && !mainAudio.ended) playAudio(mainAudio);
    },
    leaveMenu(){
      inMenu=false;
      pendingStart=false;
      pauseAll(true);
    },
    isInMenu(){ return inMenu; },
    isEnabled(){ return enabled; },
    setEnabled(v){
      enabled=!!v; save();
      if(!enabled){ pauseAll(false); this.stopCinematic(); killEcho(); }   // mute: kill any ringing echo immediately
      else if(inMenu && !bootGateOpen()) this.enterMenu();
    },
    toggle(){ this.setEnabled(!enabled); return enabled; },
    getVolume(){ return volume; },
    setVolume(v){
      volume=Math.max(0, Math.min(1, +v || 0));
      if(mainAudio) mainAudio.volume=volume;
      if(loopAudio) loopAudio.volume=volume;
      if(cineAudio) cineAudio.volume=volume;
      save();
    },
  };
})();
