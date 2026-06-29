/* map_paint.js — explicit per-tile TERRAIN PAINT override layer for campaign maps.

   The map editor (map-editor.html) lets you paint individual tiles — grass / snow / tech / desert /
   water / lava / rock / tree. The painted set is stored as a COMPACT string on the map config
   (`cfg.paint`) inside maps_data.js, and applied by newMap() AFTER the procedural terrain + BOTH
   despeckle passes (so lone painted tiles can't be erased), then the reachability carve re-runs so a
   painted barrier can never strand a gold node / base. The override is a direct assignment, so painted
   tiles are fully DETERMINISTIC and render identically every load — independent of cfg.seed.

   Coords are POST-scale tile indices (i = ty*W + tx) — painting happens on the generated W×H grid
   (cfg coords are pre-scale ×MAP_SCALE; that rounding is lossy/non-invertible, so we store the grid we
   painted on, plus W×H so a later map resize can detect and ignore stale paint).

   Code only — all painted DATA lives in cfg.paint. Loaded before map.js (and in the editor). The apply
   path calls addFeature/dropFeaturesAt/baseBlocked (defined in map.js) at RUNTIME, by which point both
   scripts are loaded, so load-order is irrelevant. | STARLEFT (classic scripts) */
(function(){
  'use strict';

  // Paint targets. Each maps to either a floor/water tile (tile+biome) or a walk-under FEATURE
  // (rock/tree, drawn from state.features[] — the way the game represents ALL rocks/trees). `ch` is the
  // single-character code used by the compact encoding. Constants come from config.js (loaded first).
  const TARGETS = {
    grass : { ch:'g', tile:T_GRASS, biome:B_GRASS  },
    snow  : { ch:'s', tile:T_GRASS, biome:B_ICE    },   // "snow" = ICE biome on passable floor
    tech  : { ch:'t', tile:T_GRASS, biome:B_TECH   },
    desert: { ch:'d', tile:T_GRASS, biome:B_DESERT },
    water : { ch:'w', tile:T_WATER, biome:B_WATER  },
    lava  : { ch:'v', tile:T_WATER, biome:B_VOLCANIC },  // lava = water tile + volcanic biome (render picks magma ramp)
    rock  : { ch:'r', feat:'rock' },
    tree  : { ch:'e', feat:'tree' },
    // ERASE (editor Erase tool): drop whatever tree/rock FEATURE owns this tile and leave passable floor
    // with the underlying biome untouched — so removing a procedural tree doesn't repaint a green grass
    // patch into a desert/snow/tech locale. Not exposed in the paint-target dropdown; only the Erase tool
    // writes it. Authored as a normal per-tile override so it persists deterministically via cfg.paint.
    clear : { ch:'c', clearFeat:true },
  };
  const BY_CH = {};
  for(const key in TARGETS){ BY_CH[TARGETS[key].ch] = Object.assign({ key }, TARGETS[key]); }

  // ---- encode: a sparse i→targetKey map → "<W>x<H>;<ch>:<i0>,<Δ>,…|<ch>:…" (indices base-36, delta-coded) ----
  function encode(painted, W, H){
    const byKey = {};
    const entries = (painted instanceof Map) ? Array.from(painted.entries())
                                             : Object.keys(painted||{}).map(k=>[+k, painted[k]]);
    for(const [i, key] of entries){ if(!TARGETS[key]) continue; (byKey[key]||(byKey[key]=[])).push(i|0); }
    const groups = [];
    for(const key in byKey){
      const arr = byKey[key].sort((a,b)=>a-b); let prev = 0; const parts = [];
      for(let k=0;k<arr.length;k++){ const v = arr[k]; parts.push((k===0 ? v : v-prev).toString(36)); prev = v; }
      groups.push(TARGETS[key].ch + ':' + parts.join(','));
    }
    return W + 'x' + H + ';' + groups.join('|');
  }

  // ---- decode: string → { W, H, ops:[{i,key,tile,biome,feat}] } (or null) ----
  function decode(str){
    if(!str || typeof str !== 'string') return null;
    const semi = str.indexOf(';'); if(semi < 0) return null;
    const dims = str.slice(0, semi).split('x'); const W = +dims[0], H = +dims[1];
    if(!(W > 0 && H > 0)) return null;
    const ops = [], groups = str.slice(semi+1).split('|');
    for(const g of groups){
      if(!g) continue;
      const c = g.indexOf(':'); if(c < 0) continue;
      const spec = BY_CH[g.slice(0, c)]; if(!spec) continue;
      const nums = g.slice(c+1).split(','); let idx = 0;
      for(let k=0;k<nums.length;k++){
        const d = parseInt(nums[k], 36); if(isNaN(d)) continue;
        idx = (k === 0) ? d : idx + d;                                   // first absolute, rest deltas
        ops.push({ i:idx, key:spec.key, tile:spec.tile, biome:spec.biome, feat:spec.feat, clearFeat:spec.clearFeat });
      }
    }
    return { W, H, ops };
  }

  // ---- applyOps: write a list of overrides onto a generated state. Deterministic (ops sorted by index;
  //      one rng() per feature, in that fixed order). rng optional (a fixed-seed generator). ----
  function applyOps(state, ops, rng){
    if(!state || !ops || !ops.length) return;
    const W = state.W, H = state.H, N = (typeof FEAT_SIZE!=='undefined') ? FEAT_SIZE : 3;
    rng = rng || (function(){ let s=0x9e3779b9>>>0; return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })();
    const sorted = ops.slice().sort((a,b)=>a.i-b.i);
    for(const op of sorted){
      const i = op.i|0; if(i < 0 || i >= W*H) continue;
      const tx = i % W, ty = (i / W)|0;
      if(op.clearFeat){                                                  // ERASE → drop the feature owning this tile, keep biome floor
        if(state.feat && state.feat[i] && typeof dropFeaturesAt === 'function') dropFeaturesAt(state, new Set([i]));
        if(state.tiles[i] === T_TREE || state.tiles[i] === T_ROCK) state.tiles[i] = T_GRASS;   // floor-ify any stray un-absorbed obstacle (biome untouched)
        if(state.blocked) state.blocked[i] = baseBlocked(state, i);
      } else if(op.feat){                                                // rock / tree → 3×3 walk-under feature
        let ax = tx-(tx%N), ay = ty-(ty%N);
        if(ax > W-N) ax = W-N; if(ay > H-N) ay = H-N; if(ax < 0) ax = 0; if(ay < 0) ay = 0;
        if(typeof addFeature === 'function') addFeature(state, ax, ay, op.feat, rng);
        if(state.blocked) for(let y=0;y<N;y++)for(let x=0;x<N;x++){ const j=(ay+y)*W+(ax+x); state.blocked[j]=baseBlocked(state,j); }
      } else {                                                           // floor / water
        if(state.feat && state.feat[i] && typeof dropFeaturesAt === 'function') dropFeaturesAt(state, new Set([i]));
        state.tiles[i] = op.tile; state.biome[i] = op.biome;
        if(state.blocked) state.blocked[i] = baseBlocked(state, i);
      }
    }
  }

  // ---- apply: decode + applyOps, guarding that the paint was authored on THIS grid size ----
  function apply(state, decoded, rng){
    if(!state) return;
    const d = (typeof decoded === 'string') ? decode(decoded) : decoded;
    if(!d || !d.ops) return;
    if(d.W !== state.W || d.H !== state.H) return;                       // map resized → paint indices stale, ignore
    applyOps(state, d.ops, rng);
  }

  window.MAP_PAINT = { TARGETS, BY_CH, encode, decode, apply, applyOps };
})();
