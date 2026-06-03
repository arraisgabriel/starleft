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

  let mainAudio=null, loopAudio=null;
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
    enterMenu(){
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
      if(!enabled) pauseAll(false);
      else if(inMenu && !bootGateOpen()) this.enterMenu();
    },
    toggle(){ this.setEnabled(!enabled); return enabled; },
    getVolume(){ return volume; },
    setVolume(v){
      volume=Math.max(0, Math.min(1, +v || 0));
      if(mainAudio) mainAudio.volume=volume;
      if(loopAudio) loopAudio.volume=volume;
      save();
    },
  };
})();
