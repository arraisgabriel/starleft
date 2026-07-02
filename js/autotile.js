/* AUTOTILE — neighbor-aware tile-index selection for interior tilesets (docs/interior-tilesets.md E2).
   Walls use the full blob-47 scheme (8-neighbour bitmask with the blob corner rule: a corner only
   counts when BOTH adjacent edges match → 47 canonical shapes incl. isolated + fully-surrounded).
   Floors use a 16-index N/E/S/W edge scheme (aligned per-tile; interior floor perimeters sit under
   walls, so inner-corner fidelity isn't needed — a specific material can upgrade to the blob path).

   Determinism contract (CC.1): every pick derives from tile coords via _h2 — a formula-identical
   copy of h2 (render.js:96), duplicated here so this file is load-order-free and Node-testable.
   MUST stay formula-identical to render.js h2. NEVER Math.random / simRandom / state.time here:
   host and client each regenerate interiors locally and must agree pixel-for-pixel. */
(function(){
  'use strict';
  // Same formula as render.js h2 (CC.1 deterministic 2D hash → [0,1)).
  function _h2(x,y){ const s=Math.sin(x*12.9898 + y*78.233)*43758.5453; return s - Math.floor(s); }

  // Bit layout: edges in the low nibble, corners high — N=1 E=2 S=4 W=8, NE=16 SE=32 SW=64 NW=128.
  const N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128;

  // Blob rule: a diagonal only matters when both its adjacent edges match.
  function canon(m){
    let c = m & 15;
    if((m&NE) && (m&N) && (m&E)) c |= NE;
    if((m&SE) && (m&S) && (m&E)) c |= SE;
    if((m&SW) && (m&S) && (m&W)) c |= SW;
    if((m&NW) && (m&N) && (m&W)) c |= NW;
    return c;
  }

  // Precompute once: 256-entry mask→tile-index LUT + the ordered canonical-shape list.
  // WALL_TILES order (ascending canonical mask) IS the atlas column order — slice_interiors.py's
  // manifest and assets.js interiorWallRect both index by it.
  const _canonSet = new Set();
  for(let m=0;m<256;m++) _canonSet.add(canon(m));
  const WALL_TILES = Array.from(_canonSet).sort((a,b)=>a-b);   // 47 shapes
  const _LUT = new Uint8Array(256);
  { const at=new Map(); WALL_TILES.forEach((c,i)=>at.set(c,i));
    for(let m=0;m<256;m++) _LUT[m]=at.get(canon(m)); }

  /* 8-neighbour bitmask of same-material adjacency. matchFn(state,tx,ty) → truthy when the
     neighbor is the same material; out-of-bounds tiles never match (mask8 guards bounds). */
  function mask8(state,tx,ty,matchFn){
    const Wd=state.W, Hd=state.H;   // game-state grid dims (UPPERCASE — cfg.w/h are the unscaled config)
    const ok=(x,y)=> x>=0 && y>=0 && x<Wd && y<Hd && !!matchFn(state,x,y);
    let m=0;
    if(ok(tx,ty-1)) m|=N;
    if(ok(tx+1,ty)) m|=E;
    if(ok(tx,ty+1)) m|=S;
    if(ok(tx-1,ty)) m|=W;
    if(ok(tx+1,ty-1)) m|=NE;
    if(ok(tx+1,ty+1)) m|=SE;
    if(ok(tx-1,ty+1)) m|=SW;
    if(ok(tx-1,ty-1)) m|=NW;
    return m;
  }

  const AUTOTILE = {
    WALL_TILES,                    // canonical blob masks in atlas-column order
    WALL_N: WALL_TILES.length,     // 47
    FLOOR_N: 16,
    mask8,
    canon,
    // Wall: raw 8-bit mask → one of 47 canonical tile indices (corner rule applied inside).
    wallIndex(mask){ return _LUT[mask & 255]; },
    wallIndexAt(state,tx,ty,matchFn){ return _LUT[mask8(state,tx,ty,matchFn)]; },
    // Floor: 16-index N/E/S/W edge scheme (bit set = same material that side → 15 = fully interior).
    floorIndex(state,tx,ty,matchFn){ return mask8(state,tx,ty,matchFn) & 15; },
    // Within-index variety + deterministic mirror — same style as floorVarRect's hash pick.
    variant(tx,ty,n){ return (_h2(tx,ty)*n)|0; },
    mirror(tx,ty){ return _h2(tx+7,ty+3) > 0.5; },
  };

  if(typeof window!=='undefined') window.AUTOTILE = AUTOTILE;
  if(typeof module!=='undefined' && module.exports) module.exports = AUTOTILE;   // headless test hook
})();
