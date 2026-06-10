/* sfx.js — combat/UI sound effects (T0-3). A tiny WebAudio one-shot player mirroring voice.js's
   iOS-unlock + graceful-missing-file pattern, with per-sound rate-limiting and a voice cap so
   big fights don't clip. Clips are ORIGINAL synthesized audio (see _dev/gen/gen_sfx.py) in
   assets/audio/sfx/*.wav. Every path is a silent no-op when a clip is missing, audio is muted,
   or the browser blocks playback — game logic never depends on it.

   Producers (all cosmetic; callers already gate for rollback/fog/off-screen where needed):
     SFX.laser(e)        — a fresh laser bolt          (render.js shot-FX loop, all 3 net paths)
     SFX.impact()/heal() — damage / heal tick          (render.js spawnFloater)
     SFX.death(e)        — unit/building death         (render.js deathFx)
     SFX.train()/built() — production complete         (units.js spawnTrained / build finish)
     SFX.siege()         — Auditor siege deploy        (units.js)
     SFX.play(name,opt)  — raw one-shot
   Settings (persisted): isEnabled/setEnabled/toggle, getVolume/setVolume. */

const SFX = (function(){
  const LS_KEY = 'starleft_sfx';
  let enabled = true, volume = 0.5;
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if(typeof s.enabled === 'boolean') enabled = s.enabled;
    if(typeof s.volume === 'number') volume = Math.max(0, Math.min(1, s.volume));
  } catch(e){}
  const save = ()=>{ try { localStorage.setItem(LS_KEY, JSON.stringify({ enabled, volume })); } catch(e){} };

  let actx = null, master = null;
  const bufs = {}, missing = {}, loading = {};
  function ac(){
    if(actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
    try {
      actx = new AC();
      master = actx.createGain(); master.gain.value = volume; master.connect(actx.destination);
    } catch(e){ actx = null; }
    return actx;
  }
  function load(name){
    if(bufs[name] || missing[name] || loading[name]) return;
    const c = ac(); if(!c) return;
    loading[name] = true;
    fetch(sfxPath(name)).then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); })
      .then(ab=>c.decodeAudioData(ab))
      .then(b=>{ bufs[name]=b; delete loading[name]; })
      .catch(()=>{ missing[name]=true; delete loading[name]; });   // missing clip → permanent silent no-op
  }

  // per-sound rate limits (seconds) — lasers are the spam risk on dense maps
  const RATE = { laser_player:0.07, laser_enemy:0.09, impact:0.06, unit_death:0.10,
                 explosion_big:0.18, hq_raze:0.5, heal_tick:0.33, ui_click:0.04,
                 build_complete:0.4, train_ready:0.4, siege_deploy:0.4 };
  const lastAt = {};
  let voices = 0; const MAX_VOICES = 12;

  function play(name, opt){
    if(!enabled) { load(name); return; }
    const c = ac(); if(!c) return;
    if(!bufs[name]){ load(name); return; }          // first call warms the cache; sound starts next time
    const now = c.currentTime;
    const lim = RATE[name] || 0.05;
    if(lastAt[name] != null && now - lastAt[name] < lim) return;
    if(voices >= MAX_VOICES) return;
    lastAt[name] = now;
    try {
      if(c.state === 'suspended') c.resume().catch(()=>{});
      const src = c.createBufferSource(); src.buffer = bufs[name];
      // small pitch jitter so repeated hits don't machine-gun the same sample
      src.playbackRate.value = (opt && opt.rate) || (0.94 + Math.random()*0.12);
      const g = c.createGain(); g.gain.value = (opt && opt.vol != null ? opt.vol : 1);
      src.connect(g); g.connect(master);
      voices++;
      src.onended = ()=>{ voices = Math.max(0, voices-1); try{ src.disconnect(); g.disconnect(); }catch(e){} };
      src.start();
    } catch(e){}
  }

  // warm the hot clips once audio is unlocked (tiny files; avoids the first-shot swallow)
  let unlocked = false;
  function unlock(){
    if(unlocked) return; unlocked = true;
    const c = ac(); if(!c) return;
    if(c.state === 'suspended') c.resume().catch(()=>{});
    ['laser_player','laser_enemy','impact','unit_death','explosion_big','ui_click','heal_tick'].forEach(load);
  }

  return {
    play, unlock,
    laser(e){ play(e && e.owner==='enemy' ? 'laser_enemy' : 'laser_player', {vol: e && e.kind==='building' ? 0.8 : 0.55}); },
    impact(){ play('impact', {vol:0.5}); },
    heal(){ play('heal_tick', {vol:0.45}); },
    death(e){
      if(!e) return;
      if(e.kind==='building') play(e.type==='hq' ? 'hq_raze' : 'explosion_big', {vol: e.type==='hq' ? 1 : 0.85});
      else play('unit_death', {vol:0.7});
    },
    train(){ play('train_ready', {vol:0.6, rate:1}); },
    built(){ play('build_complete', {vol:0.6, rate:1}); },
    siege(){ play('siege_deploy', {vol:0.7, rate:1}); },

    /* ---- settings API (HUD / settings panel) ---- */
    isEnabled(){ return enabled; },
    setEnabled(v){ enabled = !!v; save(); },
    toggle(){ this.setEnabled(!enabled); return enabled; },
    getVolume(){ return volume; },
    setVolume(v){ volume = Math.max(0, Math.min(1, +v||0)); if(master) master.gain.value = volume; save(); },
  };
})();

// unlock on the first user gesture (mobile autoplay gate) — same idiom as voice.js
['pointerdown','keydown','touchstart'].forEach(ev =>
  window.addEventListener(ev, ()=>SFX.unlock(), { once:true, capture:true, passive:true }));

// soft UI click on every button press (capture phase so it works for dynamically-built buttons)
window.addEventListener('pointerdown', (e)=>{
  if(e.target && e.target.closest && e.target.closest('button')) SFX.play('ui_click', {vol:0.35, rate:1});
}, { capture:true, passive:true });
