/* state.js — shared mutable game state: G (active map), mapIndex, running + makeRng(). */
/* =====================================================================
   GAME STATE
   ===================================================================== */
let G = null;       // active game/map state
let mapIndex = 0;
let running = false;

/* ---- multiplayer role (js/net/*). 'solo' is the untouched single-player path. ---- */
let netRole = 'solo';     // 'solo' | 'host' | 'client'
let LOCAL_CTRL = 'p1';    // which controller THIS client drives & sees the economy for ('p1' host, 'p2' joiner)
let pendingPlayers = 1;   // human count newMap() bakes into state.players (set by the lobby before loadMap)

/* Per-controller economy accessor: state.eco = { p1:{gold,supply,supplyCap,gold_collected}, p2:{…} }.
   In solo only 'p1' exists and every entity defaults to ctrl 'p1', so playerEco() is always eco.p1. */
function playerEco(state, ctrl){ return (state.eco && (state.eco[ctrl||'p1'] || state.eco.p1)) || {gold:0,supply:0,supplyCap:0,gold_collected:0}; }
function teamGoldCollected(state){ let g=0; if(state.eco) for(const k in state.eco) g+=state.eco[k].gold_collected||0; return g; }

/* Co-op controller gating. isMine() decides what THIS client may put in its commandable selection.
   actingCtrl() is whose units a command applies to — normally LOCAL_CTRL, but the host temporarily
   sets state._cmdCtrl when replaying a remote peer's command. Solo: LOCAL_CTRL='p1', everything 'p1'. */
function isMine(e){ return netRole==='solo' || (((e&&e.ctrl)||'p1')===LOCAL_CTRL); }
function actingCtrl(state){ return (state&&state._cmdCtrl) || LOCAL_CTRL; }

function makeRng(seed){ let s = seed*9301+49297; return ()=>{ s=(s*9301+49297)%233280; return s/233280; }; }

// Seeded GAMEPLAY rng (determinism experiment / future lockstep). All sim randomness (enemyAI) routes
// through simRandom() so a match is reproducible from its seed — see js/net/determinism.js. Separate stream
// from makeRng (terrain) and from lore's dossier rng; NOT used for cosmetic randomness. Math.imul keeps the
// LCG integer-deterministic across engines (transcendentals elsewhere remain the cross-engine risk).
let _simRngS = 1;
function seedSim(seed){ _simRngS = ((seed>>>0) || 1); }
function simRandom(){ _simRngS = (Math.imul(_simRngS, 1664525) + 1013904223) >>> 0; return _simRngS / 4294967296; }

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

