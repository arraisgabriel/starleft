/* perf_scenarios.js — deterministic worst-case scenes for the benchmark harness. Test-only; never
   auto-runs and never changes gameplay. Each scene freezes the sim (running=false) so render() is a pure
   function of frozen state — successive renders are byte-identical, which the A/B pixel-diff gate needs.
   Loaded after the game files it calls (loadMap, newHubMap, mkUnit, makeRng, clampCam) and after perf.js. */
(function(){
  'use strict';
  if(!window.PERF || !PERF.on) return;   // inert unless ?perf=1

  // render-heavy unit mix (skip any not defined in this build)
  const TYPES = ['worker','soldier','ranger','hustler','lobbyist','foodtruck'].filter(t=>typeof DEF!=='undefined' && DEF[t]);
  let _saved = null;

  // G/running are global lexical bindings (let in classic scripts) — reference them bare, not via window.*
  function saveState(){ _saved = { running: running, G: G,
    zoom: G && G.zoom, camX: G && G.camX, camY: G && G.camY }; }
  function revealAll(s){ s.explored.fill(1); s.visible.fill(1); }

  // Populate the map with many units on a seeded scatter (the repo's own RNG → reproducible).
  // No shootFx / rings: those mutate during render and would break byte-identical A/B renders.
  function populate(s, count, salt){
    const rng = makeRng(1234567 + (salt||0)*97);
    const W=s.W, H=s.H; let placed=0, guard=count*40;
    while(placed<count && guard-->0){
      const tx = 2 + ((rng()*(W-4))|0), ty = 2 + ((rng()*(H-4))|0);
      const i = ty*W+tx;
      if(s.tiles && typeof T_WATER!=='undefined' && s.tiles[i]===T_WATER) continue;  // keep units on visible ground
      const type  = TYPES[placed % TYPES.length];
      const owner = (placed % 5 === 0) ? 'enemy' : 'player';                          // mix red/blue sprite paths
      const u = mkUnit(s, type, owner, tx, ty);
      if((placed % 7) === 0) u.stars = 1 + ((rng()*4)|0);                             // exercise rank-pip draws (no side effect)
      placed++;
    }
    if(typeof recomputeSupply==='function') recomputeSupply(s);
    return placed;
  }

  // Deterministic camera path: pure function of frame index → OFF and ON runs exercise identical
  // culling/visible-tile sets at every frame. Slow lissajous so the visible set varies smoothly.
  function panSweep(s){
    const Wpx=s.W*TILE, Hpx=s.H*TILE;
    return function(state, i){
      const z = state.zoom||1;
      const vw = (cv.width/dpr)/z, vh = (cv.height/dpr)/z;
      const spanX = Math.max(0, Wpx-vw), spanY = Math.max(0, Hpx-vh);
      const fx = 0.5 + 0.5*Math.sin(i*0.013), fy = 0.5 + 0.5*Math.sin(i*0.019 + 1.3);
      state.camX = spanX*fx; state.camY = spanY*fy;
      clampCam(state);
    };
  }

  PERF.scenes = PERF.scenes || {};

  // Largest map, fully zoomed out, revealed, populated, frozen.  args: {map=6, units=300, salt=1}
  PERF.scenes.bigMap = function(args){
    args = args||{};
    const idx = (args.map!=null ? args.map : 6);   // index 6 = 124×102 (widest → most tiles at min zoom)
    saveState();
    loadMap(idx);
    G.runSalt = 12345;                              // pin the one lore-only Math.random() for repeatability
    revealAll(G);
    const n = populate(G, args.units!=null?args.units:300, args.salt||1);
    G.zoom = ZOOM_MIN; clampCam(G);
    running = false;                                // freeze sim → render-only, identical across OFF/ON
    PERF.installCamera(panSweep(G));
    if(typeof refreshUI==='function') refreshUI();
    return { scene:'bigMap', map:idx, W:G.W, H:G.H, units:n };
  };

  // Playable HUB area (drones, neon, trainees, mega-buildings), zoomed out, frozen.  args:{zoomOut=true}
  PERF.scenes.hub = function(args){
    args = args||{};
    saveState();
    G = newHubMap();                                // deterministic via makeRng(424242+visit*17); auto-reveals + spawns trainees
    if(typeof resetDialogs==='function') resetDialogs();
    syncHud(); revealAll(G);
    if(args.zoomOut !== false) G.zoom = ZOOM_MIN;
    clampCam(G);
    running = false;
    PERF.installCamera(panSweep(G));
    if(typeof refreshUI==='function') refreshUI();
    return { scene:'hub', W:G.W, H:G.H, units:G.entities.length };
  };

  // Restore the camera/zoom/running we clobbered so scenes can chain in one session.
  PERF.scenes.teardown = function(){
    PERF.clearCamera();
    if(_saved){
      if(G && _saved.G === G){
        if(_saved.zoom!=null) G.zoom=_saved.zoom;
        if(_saved.camX!=null) G.camX=_saved.camX;
        if(_saved.camY!=null) G.camY=_saved.camY;
      }
      running = _saved.running; _saved = null;
    }
  };
})();
