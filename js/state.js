/* state.js — shared mutable game state: G (active map), mapIndex, running + makeRng(). */
/* =====================================================================
   GAME STATE
   ===================================================================== */
let G = null;       // active game/map state
let mapIndex = 0;
let running = false;

function makeRng(seed){ let s = seed*9301+49297; return ()=>{ s=(s*9301+49297)%233280; return s/233280; }; }

/* Deterministic 2D value-noise + fBm, seeded so the whole field is reproducible.
   Used by map.js for COHERENT geography (elevation/moisture/temperature fields):
   neighbouring tiles sample nearly the same value, so regions and coastlines come
   out smooth and contiguous — unlike per-tile RNG, which is uncorrelated noise.
   O(1) memory (lattice corners are hashed on the fly), ~uniform output in [0,1). */
function makeNoise2D(seed){
  const s0 = (Math.imul(seed|0, 2654435761) ^ 0x9e3779b9) >>> 0;
  function hash(ix, iy){                              // integer lattice -> [0,1)
    let h = (Math.imul(ix|0, 374761393) + Math.imul(iy|0, 668265263) + s0) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  const fade = t => t*t*(3 - 2*t);                    // smoothstep
  function vnoise(x, y){                              // bilinear value noise
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    const v00 = hash(x0,y0),   v10 = hash(x0+1,y0);
    const v01 = hash(x0,y0+1), v11 = hash(x0+1,y0+1);
    const a = v00 + (v10 - v00)*fx;
    const b = v01 + (v11 - v01)*fx;
    return a + (b - a)*fy;
  }
  function fbm(x, y, oct, lac, gain){                 // fractal Brownian motion, ~[0,1)
    oct = oct||4; lac = lac||2; gain = (gain==null?0.5:gain);
    let amp=1, freq=1, sum=0, norm=0;
    for(let o=0;o<oct;o++){ sum += amp*vnoise(x*freq, y*freq); norm += amp; amp*=gain; freq*=lac; }
    return sum/norm;
  }
  return { vnoise, fbm, hash };
}

