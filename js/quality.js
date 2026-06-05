/* quality.js — adaptive render-quality controller (QUAL). Watches realized frame time and, ONLY when the
   device cannot sustain a smooth rate, steps DOWN a few purely-local rendering knobs (backing-store dpr,
   later: water/particle density) to recover FPS, then ramps back UP when smooth again. With hysteresis so
   it never flaps.

   At full quality (level 0) it is INERT — the backing store is sized at native devicePixelRatio exactly as
   before, so a capable device is byte-identical to the pre-controller game. It touches only local rendering
   (never the simulation), so it is safe and independent per client across solo/host/client co-op.

   Loaded before render.js so resize() can read QUAL.dprCap; ticked from the main loop each frame. */
(function(){
  'use strict';
  const QUAL = (window.QUAL = window.QUAL || {});
  QUAL.enabled = (QUAL.enabled !== false);   // master switch (could be wired to a graphics setting; default on)
  QUAL.level = 0;

  // Quality tiers. dprCap = the most backing-store pixels we'll render per CSS pixel at this level.
  // Infinity = native (no cap). Lower tiers shrink the backing store quadratically — the single biggest
  // fill-rate lever on high-DPI screens, which is exactly the zoomed-out-large-map / busy-HUB regime.
  const LEVELS = [
    { dprCap: Infinity, label: 'full'   },
    { dprCap: 1.5,      label: 'high'   },
    { dprCap: 1.25,     label: 'medium' },
    { dprCap: 1.0,      label: 'low'    },
  ];
  QUAL.dprCap = LEVELS[0].dprCap;            // read by resize() in render.js
  QUAL.levelLabel = function(){ return LEVELS[QUAL.level].label; };

  // Hysteresis: degrade only after SLOW is sustained for HOLD frames; recover only after FAST is sustained.
  // The wide FAST..SLOW band + the post-transition cooldown prevent oscillation (and thus needless resizes).
  // Conservative on purpose: a merely-okay ~30fps scene (e.g. the HUB) must NOT trip it — only a device that
  // genuinely can't keep up (sustained < ~29fps) degrades. Tighter than this re-introduces churn.
  const SLOW_MS  = 34;     // ~< 29 fps sustained → consider stepping down
  const FAST_MS  = 20;     // ~> 50 fps sustained → consider stepping back up
  const HOLD     = 60;     // frames the condition must persist (~1.0s) before a step — ignores transient pan spikes
  const COOLDOWN = 90;     // frames to settle after any transition (~1.5s) — no further decisions, kills flapping
  let ema = 1000/60, lastNow = 0, down = 0, up = 0, cooldown = 0;

  // effective backing-store dpr for a given cap (what resize() would actually use)
  function effectiveDpr(cap){ return Math.min(cap, window.devicePixelRatio || 1); }

  QUAL.setLevel = function(l){
    l = Math.max(0, Math.min(LEVELS.length-1, l));
    if(l === QUAL.level) return;
    const prevDpr = (typeof dpr !== 'undefined') ? dpr : effectiveDpr(QUAL.dprCap);
    QUAL.level = l; QUAL.dprCap = LEVELS[l].dprCap;
    cooldown = COOLDOWN;                            // settle regardless, so we don't immediately re-evaluate
    // Only touch the backing store when the pixel dimensions actually change. On a 1× display (or whenever
    // the cap doesn't move real resolution) this skips the resize entirely — avoiding the canvas clear it
    // would cause for no benefit.
    if(effectiveDpr(QUAL.dprCap) === prevDpr) return;
    if(typeof resize === 'function') resize();      // re-sizes the backing store — NOTE: this CLEARS the canvas...
    // ...so repaint immediately, within this same frame, before the browser composites. Otherwise the
    // freshly-cleared (black) canvas shows for one frame: the "blink" bug. One extra render only on a (rare)
    // real transition; zero steady-state cost.
    if(typeof G !== 'undefined' && G && typeof render === 'function') render(G);
  };
  QUAL.reset = function(){ QUAL.setLevel(0); ema = 1000/60; down = up = 0; lastNow = 0; cooldown = 0; };

  // Called once per rendered frame with the rAF timestamp. Computes its own frame delta (independent of the
  // sim dt clamp) and drives the level. Cheap: a subtract, an EMA step, two counters.
  QUAL.tick = function(now){
    if(!QUAL.enabled) return;
    if(lastNow === 0){ lastNow = now; return; }
    const dt = now - lastNow; lastNow = now;
    if(!(dt > 0) || dt > 500) return;             // ignore tab-switch / load stalls (would falsely trip a downgrade)
    ema += (dt - ema) * 0.1;                       // smooth ~10-frame window
    if(cooldown > 0){ cooldown--; return; }        // settling after a transition — make no level decisions
    if(ema > SLOW_MS){ down++; up = 0; if(down >= HOLD && QUAL.level < LEVELS.length-1){ QUAL.setLevel(QUAL.level+1); down = 0; } }
    else if(ema < FAST_MS){ up++; down = 0; if(up >= HOLD && QUAL.level > 0){ QUAL.setLevel(QUAL.level-1); up = 0; } }
    else { down = 0; up = 0; }
  };

  QUAL.debug = function(){ return { enabled:QUAL.enabled, level:QUAL.level, label:QUAL.levelLabel(), dprCap:QUAL.dprCap, emaMs:+ema.toFixed(2) }; };
})();
