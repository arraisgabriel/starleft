/* voice.js — local TTS voice playback for unit barks, career life-event lines and intro crawls.
   Clips are pre-rendered (see _dev/gen/) into assets/audio/voice/{barks,lore,crawl}; this module
   just plays the right one when a dialog appears. Speech is pure flavor: every path is a silent
   no-op when a clip is missing, audio is muted, or the browser blocks playback — the on-screen
   text bubble (dialogs.js) and all game logic never depend on it.

   Producers:
     VOICE.playBark(speakerKey, idx)   — unit/hero selection bark            (from dialogs.js)
                                         (rate-capped: ≤3 per speaker, ≤5 total, per rolling 30s)
     VOICE.playLore(speakerKey, sayIdx)— career life-event line              (from dialogs.js)
     VOICE.playCrawl(idx) / stopCrawl()— intro story crawl narration         (from ui.js showCrawl)
   Settings (HUD toggle, persisted): isEnabled/setEnabled/toggle, getVolume/setVolume.

   Mobile: barks fire on a tap and crawls on a menu tap (user gestures → allowed); the first gesture
   anywhere also "unlocks" audio so a later non-gesture play (a mid-battle promotion) works too.
   At most 2 dialog clips play at once (a 2-slot pool); the crawl uses its own separate channel.
   Depends on globals: barkPath / lorePath / crawlPath (assets.js). */

const VOICE = (function(){
  const LS_KEY = 'starleft_voice';

  // speaker key (unit type | heroId) -> qwen voice. MUST mirror _dev/gen/voice_map.mjs SPEAKERS.
  // Life-event clips are keyed by VOICE (shared text), so playLore resolves the voice from here.
  const SPEAKER_VOICE = {
    worker:'Ryan', soldier:'Aiden', ranger:'Eric', recruiter:'Sohee', hustler:'Dylan',
    lobbyist:'Uncle_Fu', foodtruck:'Sohee', auditor:'Ono_Anna', founder:'Uncle_Fu',
    courier:'Serena', bomber:'Dylan', Nino:'cast1', Biba:'Vivian',
  };

  // persisted settings
  let enabled = true, volume = 0.9;
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if(typeof s.enabled === 'boolean') enabled = s.enabled;
    if(typeof s.volume === 'number') volume = Math.max(0, Math.min(1, s.volume));
  } catch(e){}
  const save = ()=>{ try { localStorage.setItem(LS_KEY, JSON.stringify({ enabled, volume })); } catch(e){} };

  // 2-slot round-robin pool for dialog clips (barks + lore); a 3rd reuses the oldest slot (the cap).
  const POOL = 2;
  const chans = [];
  for(let i=0;i<POOL;i++){ const a = new Audio(); a.preload='none'; chans.push(a); }
  let rr = 0;
  let crawlAudio = null;
  let sceneAudio = null;          // dedicated channel for scripted-cutscene narration (its own slot, like the crawl)
  let unlocked = false;

  // Bark rate-limit: chain-selecting several units (esp. same-type interns) spams their voice.
  // Hard caps over a rolling 30s window — at most 3 barks per speaker, 5 across all speakers.
  const BARK_WINDOW = 30000, BARK_PER_SPEAKER = 3, BARK_GLOBAL = 5;
  const barkLog = [];                              // { key, t } recent bark plays, pruned to the window
  function barkAllowed(key){
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    while(barkLog.length && now - barkLog[0].t > BARK_WINDOW) barkLog.shift();   // drop entries past 30s
    if(barkLog.length >= BARK_GLOBAL) return false;
    let n = 0; for(const b of barkLog) if(b.key === key) n++;
    if(n >= BARK_PER_SPEAKER) return false;
    barkLog.push({ key, t: now });
    return true;
  }

  // iOS/Safari unlock: silently nudge each channel within the first user gesture so later plays pass.
  function unlock(){
    if(unlocked) return; unlocked = true;
    chans.forEach(a=>{ try {
      a.muted = true;
      const p = a.play();
      if(p && p.then) p.then(()=>{ a.pause(); a.currentTime=0; a.muted=false; }).catch(()=>{ a.muted=false; });
      else a.muted = false;
    } catch(e){} });
  }

  function playClip(src){
    if(!enabled || !src) return;
    const a = chans[rr]; rr = (rr+1) % POOL;     // take the oldest slot
    try { a.pause(); a.currentTime = 0; } catch(e){}
    a.onerror = ()=>{};                           // missing clip → silent no-op (no console noise)
    a.muted = false; a.volume = volume; a.src = src;
    const p = a.play(); if(p && p.catch) p.catch(()=>{});
  }

  return {
    playBark(speakerKey, idx){
      if(!enabled || idx == null || typeof barkPath !== 'function') return;
      if(!barkAllowed(speakerKey)) return;          // rolling 30s caps: 3 per speaker, 5 total
      playClip(barkPath(speakerKey, idx));
    },
    playLore(speakerKey, sayIdx){
      if(!enabled || sayIdx == null || typeof lorePath !== 'function') return;
      const voice = SPEAKER_VOICE[speakerKey]; if(!voice) return;
      playClip(lorePath(voice, sayIdx));
    },
    playCrawl(idx){
      this.stopCrawl();
      if(!enabled || typeof crawlPath !== 'function') return;
      const a = new Audio(); a.preload = 'auto'; a.onerror = ()=>{};   // no narration for this map → silent
      a.volume = volume; a.src = crawlPath(idx);
      crawlAudio = a;
      const p = a.play(); if(p && p.catch) p.catch(()=>{});
    },
    stopCrawl(){ if(crawlAudio){ try { crawlAudio.pause(); } catch(e){} crawlAudio = null; } },
    // Probe the crawl narration length (metadata only) so showCrawl can pace its scroll to the
    // voice — every spoken line stays on screen. cb(seconds) on success; cb(null) if voice is off,
    // the clip is missing/blocked, or it doesn't load within `timeoutMs` (caller then falls back to
    // a reading-rate estimate from the word count). The clip the browser fetches here is cached, so
    // the later playCrawl() reuses it. Loading metadata never plays sound.
    crawlDuration(idx, cb, timeoutMs){
      if(typeof cb !== 'function') return;
      if(!enabled || typeof crawlPath !== 'function'){ cb(null); return; }
      let done = false; const fin = (v)=>{ if(done) return; done = true; cb(v); };
      try {
        const a = new Audio(); a.preload = 'metadata';
        a.onloadedmetadata = ()=> fin(isFinite(a.duration) && a.duration > 0 ? a.duration : null);
        a.onerror = ()=> fin(null);                 // missing clip (e.g. an un-narrated map) → estimate
        a.src = crawlPath(idx);
      } catch(e){ fin(null); }
      if(timeoutMs > 0) setTimeout(()=> fin(null), timeoutMs);
    },
    // scripted-cutscene line (Nino's Ep VII monologue, etc.) on its own channel. `onended` fires when
    // the clip finishes OR is missing/blocked, so the sequencer can advance; a no-op when audio is off
    // (calls onended immediately so the cutscene still progresses on its text-timer).
    playScene(id, onended, rate){
      this.stopScene();
      if(!enabled || id == null || typeof scenePath !== 'function'){ if(onended) onended(); return; }
      const a = new Audio(); a.preload = 'auto';
      let cb = onended;
      const done = ()=>{ const f=cb; cb=null; if(f) f(); };   // fire at most once (ended OR error)
      a.onended = done; a.onerror = done;
      a.muted = false; a.volume = volume; a.src = scenePath(id);
      if(rate && rate>0){ a.defaultPlaybackRate = a.playbackRate = rate;   // slow/speed the line; keep the natural timbre
        try{ a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = true; }catch(_){} }
      sceneAudio = a;
      const p = a.play(); if(p && p.catch) p.catch(()=>{});   // autoplay blocked → sequencer's max-timer advances
    },
    stopScene(){ if(sceneAudio){ try { sceneAudio.pause(); } catch(e){} sceneAudio.onended=null; sceneAudio.onerror=null; sceneAudio=null; } },
    unlock,

    /* ---- settings API (HUD) ---- */
    isEnabled(){ return enabled; },
    setEnabled(v){
      enabled = !!v;
      if(!enabled){ chans.forEach(a=>{ try { a.pause(); } catch(e){} }); this.stopCrawl(); this.stopScene(); }
      save();
    },
    toggle(){ this.setEnabled(!enabled); return enabled; },
    getVolume(){ return volume; },
    setVolume(v){
      volume = Math.max(0, Math.min(1, +v || 0));
      chans.forEach(a=>{ a.volume = volume; }); if(crawlAudio) crawlAudio.volume = volume; if(sceneAudio) sceneAudio.volume = volume;
      save();
    },
  };
})();

// unlock audio on the first user interaction anywhere (covers the mobile autoplay gate)
['pointerdown','keydown','touchstart'].forEach(ev =>
  window.addEventListener(ev, ()=>VOICE.unlock(), { once:true, capture:true, passive:true }));
