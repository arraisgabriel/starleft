/* state.js — shared mutable game state: G (active map), mapIndex, running + makeRng(). */
/* =====================================================================
   GAME STATE
   ===================================================================== */
let G = null;       // active game/map state
let mapIndex = 0;
let running = false;

function makeRng(seed){ let s = seed*9301+49297; return ()=>{ s=(s*9301+49297)%233280; return s/233280; }; }

