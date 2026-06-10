/* fallen_scene.js — the "Fallen" interstitial (T1-1). Losing a Lv2+ veteran gets a brief
   (~2.6s), skippable memorial beat: the sim pauses, the canvas dims, and their portrait +
   full dossier name + career title + hometown + dream (✓/✗) hold the screen, with a Share
   button (T0-6 shareCard). SOLO-GATED (netRole==='solo') like the tutorial/extraction guards —
   in co-op the death falls back to the existing obituary toast. Multiple deaths inside the
   cooldown window also fall back to the toast, so a wipe is never 12 modals.
   All state module-local; never written to G / saves / net. | STARLEFT */

(function(){
  const MIN_GAP_S = 9;       // only the first death per window gets the full beat
  const HOLD_MS   = 2600;    // auto-dismiss
  let lastAt = -1e9, el = null, closeTimer = null, wasRunning = false, raf = 0, spriteT = 0;

  function build(){
    if(el) return el;
    el = document.createElement('div');
    el.id = 'fallenScene';
    el.innerHTML =
      '<div class="fs-card">' +
        '<div class="fs-eyebrow">— FALLEN —</div>' +
        '<canvas class="fs-spr" width="180" height="180"></canvas>' +
        '<div class="fs-name"></div>' +
        '<div class="fs-title"></div>' +
        '<div class="fs-home"></div>' +
        '<div class="fs-dream"></div>' +
        '<div class="fs-actions">' +
          '<button class="fs-share" type="button">⇪ Share</button>' +
          '<span class="fs-hint">tap to continue</span>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', (ev)=>{ if(!ev.target.closest('.fs-share')) close(); });
    document.body.appendChild(el);
    return el;
  }

  function close(){
    if(closeTimer){ clearTimeout(closeTimer); closeTimer = null; }
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    if(el) el.style.display = 'none';
    // resume only if the beat itself paused a live game
    if(wasRunning && typeof G !== 'undefined' && G && !G.over){ running = true; if(typeof syncPauseBtn==='function') syncPauseBtn(); }
    wasRunning = false;
  }

  function show(u){
    const box = build();
    let d = null;
    try { d = (typeof buildDossier === 'function') ? buildDossier(u) : null; } catch(e){}
    const def = (typeof DEF !== 'undefined' && DEF[u.type]) || { name: u.type };
    box.querySelector('.fs-name').textContent  = (d && d.full) || u.heroId || def.name;
    box.querySelector('.fs-title').textContent = ((typeof careerTitle === 'function' ? careerTitle(u.stars||0) : '') + ' ' + def.name + ' · Lv ' + (u.stars||0)).trim();
    box.querySelector('.fs-home').textContent  = d && d.home ? 'from ' + d.home : '';
    const dr = box.querySelector('.fs-dream');
    if(d && d.dream){
      dr.innerHTML = (u.dreamDone ? '<b class="ok">dream fulfilled ✓</b> ' : '<b class="no">dream unfulfilled ✗</b> ') + '“' + d.dream + '”';
    } else dr.textContent = '';
    const share = box.querySelector('.fs-share');
    share.style.display = (typeof shareCard === 'function') ? '' : 'none';
    share.onclick = (ev)=>{ ev.stopPropagation(); if(typeof shareCard === 'function') shareCard(u); };
    // animated portrait (same live-card draw the dossier panel uses)
    const cv = box.querySelector('.fs-spr');
    spriteT = 0;
    const tick = ()=>{
      if(!el || el.style.display === 'none'){ raf = 0; return; }
      spriteT += 1/60;
      if(typeof drawTrainCanvas === 'function') drawTrainCanvas(cv, u.type, u.spriteType || '', spriteT);
      raf = requestAnimationFrame(tick);
    };
    box.style.display = 'flex';
    if(!raf) raf = requestAnimationFrame(tick);
    // freeze the fight under the beat (restored in close())
    wasRunning = (typeof running !== 'undefined') && running;
    if(wasRunning){ running = false; if(typeof syncPauseBtn==='function') syncPauseBtn(); }
    if(closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(close, HOLD_MS);
  }

  // called from recordFallen (lore.js) — all the gates live HERE so the call site stays one line
  window.fallenSceneMaybe = function(u){
    try {
      if(typeof netRole !== 'undefined' && netRole !== 'solo') return;        // co-op → toast only
      if(window._rbReplaying || window._massMemorialize) return;              // rollback resim / Ep VII flash wave
      if(!u || u.owner !== 'player' || (u.stars||0) < 2) return;              // the beat is for leveled veterans
      if(typeof G === 'undefined' || !G || G.over || G.hub || G.extractFlight) return;
      const now = performance.now() / 1000;
      if(now - lastAt < MIN_GAP_S) return;                                    // a wipe stacks into toasts
      lastAt = now;
      show(u);
    } catch(e){}
  };
})();
