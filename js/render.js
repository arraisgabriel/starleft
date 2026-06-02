/* render.js — fog (computeFog/isVisiblePix) + all canvas drawing: render, drawTile/Unit/Building, minimap, camera clamp, VIEW_TOP/BOT. */
/* =====================================================================
   FOG OF WAR
   ===================================================================== */
function computeFog(state){
  state.visible.fill(0);
  const W=state.W,H=state.H;
  for(const e of state.entities){
    if(e.dead||e.owner!=='player') continue;
    // You always see at least as far as you can shoot: reveal radius is the
    // larger of sight and attack range (the Auditor's siege range while set up),
    // so a unit/building can never fire into unrevealed fog.
    const def=DEF[e.type]||{};
    const baseR=(e.range!=null ? e.range : (def.range||0));
    const atkR=(e.sieged && def.siege) ? def.siege.range : baseR;
    const sight=Math.max(e.sight||5, atkR);
    const cx=(e.x/TILE)|0, cy=(e.y/TILE)|0;
    const s2=sight*sight, R=Math.ceil(sight);   // R: integer loop bound (sight may be fractional, e.g. HQ 7.5)
    for(let y=-R;y<=R;y++)for(let x=-R;x<=R;x++){
      if(x*x+y*y>s2) continue;
      const nx=cx+x, ny=cy+y;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      state.visible[ny*W+nx]=1; state.explored[ny*W+nx]=1;
    }
  }
}
function isVisiblePix(state,x,y){
  const tx=(x/TILE)|0, ty=(y/TILE)|0;
  if(tx<0||ty<0||tx>=state.W||ty>=state.H) return false;
  return state.visible[ty*state.W+tx]===1;
}

/* =====================================================================
   RENDERING
   ===================================================================== */
// HUD bands reserved at top/bottom. `let` (not const) because the responsive CSS
// resizes the bars per breakpoint and syncHud() copies the real heights back here.
let VIEW_TOP=46, VIEW_BOT=150;
let cssH=innerHeight;   // canvas CSS-pixel height (cv.height is device px once DPR-scaled)

/* ---- Idle "life" animation (render-only; reuses existing sprites) ----
   Idle units used to freeze on walk frame 0. These give them gentle in-place
   motion so the crowd feels alive (Hades-ish), without touching the simulation:
   no bullets, no damage, no _actState — purely cosmetic in drawUnit. */
const IDLE = {              // Balanced tier (tuned down)
  rampFrames: 18,          // ease-in frames after a unit stops (~0.3s @60fps)
  phaseStep:  0.7,         // per-unit breathing phase desync (radians × id)
  breathHz:   0.9,         // breaths/sec — quicker, shallower breath
  breathAmp:  0.009,       // ±0.9% height squash/stretch (foot-planted breathing)
  bobPx:      1.0,         // ±px vertical breathing bob (flyers only — ground units don't float)
  fidgetMin:  30, fidgetMax: 60,    // per-unit seconds between gestures (infrequent)
  gestureMin: 1.6, gestureMax: 2.2, // gesture duration (s) — slower, calmer motion
  hoverPx:    3,  hoverHz:  1.0,     // air-unit continuous hover
};
// deterministic per-unit [0,1) hash → varied-but-stable timing, NO per-unit state,
// NO reset-on-move bookkeeping, and identical across co-op clients.
function h01(n){ const s=Math.sin(n*12.9898)*43758.5453; return s - Math.floor(s); }
// the single action key for a sprite type ('mine' | 'heal' | 'attack'), or null
function fidgetAction(sType){ const t=UNIT_ACTION[sType]; return t ? Object.keys(t)[0] : null; }

function resize(){
  dpr = window.devicePixelRatio || 1;
  cv.width  = Math.round(innerWidth*dpr);  cv.height = Math.round(innerHeight*dpr);
  cv.style.width = innerWidth+'px';         cv.style.height = innerHeight+'px';
  syncHud();
  if(G) clampCam(G);
}
// Mirror the on-screen HUD bar heights into VIEW_TOP/VIEW_BOT so the playable
// viewport always matches the (responsive) DOM.
function syncHud(){
  const tb=document.getElementById('topbar'), bp=document.getElementById('bottom');
  if(tb) VIEW_TOP = tb.offsetHeight;
  const news=document.getElementById('lns-ingame');   // live-news ticker reserves a band under the topbar when shown
  if(news && news.offsetHeight) VIEW_TOP += news.offsetHeight;
  if(bp) VIEW_BOT = bp.offsetHeight;
  cssH = cv.getBoundingClientRect().height || innerHeight;
}
// CSS-pixel viewport size (independent of devicePixelRatio).
function viewW(){ return cv.width/dpr; }
function viewH(){ return cv.height/dpr - VIEW_TOP - VIEW_BOT; }

function clampCam(state){
  const z=state.zoom||1, wW=state.W*TILE, wH=state.H*TILE;
  const vw=viewW()/z, vh=viewH()/z;   // world units currently visible
  // when zoomed out past the map the clamp interval inverts — center instead
  state.camX = (vw>=wW) ? (wW-vw)/2 : Math.max(-40, Math.min(wW-vw+40, state.camX));
  state.camY = (vh>=wH) ? (wH-vh)/2 : Math.max(-40, Math.min(wH-vh+40, state.camY));
}

function render(state){
  const z=state.zoom||1, vx=state.camX, vy=state.camY;

  // ---- phase 1: clear whole backing store in identity/device space ----
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#05080d'; ctx.fillRect(0,0,cv.width,cv.height);

  // ---- phase 2: world space. dpr maps CSS->device px; VIEW_TOP is a fixed
  //      CSS band (applied before scale); zoom + camera translate the world.
  //      Everything below draws in raw world coords, so offsets are zero. ----
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.translate(0,VIEW_TOP);
  ctx.scale(z,z);
  ctx.translate(-vx,-vy);
  const ox=0, oy=0;   // world coords draw directly; transform does the rest

  // cull to the world span actually visible (accounts for zoom)
  const x0=Math.max(0,(vx/TILE)|0), y0=Math.max(0,(vy/TILE)|0);
  const x1=Math.min(state.W, ((vx+viewW()/z)/TILE|0)+1);
  const y1=Math.min(state.H, ((vy+viewH()/z)/TILE|0)+1);

  // ---- terrain ----
  for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
    if(!state.explored[ty*state.W+tx]) continue;
    drawTile(state,tx,ty, tx*TILE+ox, ty*TILE+oy);
  }

  // ---- water/magma surface overlay: caustic shimmer + tide highlight + lava cracks/core (js/water.js) ----
  if(typeof drawWater==='function') drawWater(state, x0,y0,x1,y1);

  // ---- ambient particles: BACK pass (low mist) — behind the depth-sorted sprites ----
  if(typeof drawParticles==='function') drawParticles(state, x0,y0,x1,y1, 'back');

  // ---- buildings + mega sprites + units: ALL depth-sorted by ground-line Y so a unit
  //      BEHIND a tall building/landmark is occluded by it (drawn first) and a unit in
  //      FRONT draws over it. Sprite transparency makes the occlusion pixel-correct. ----
  const depth=[];
  if(state.megaSprites) for(const m of state.megaSprites) depth.push({y:megaSortY(m), m});
  // FEAT_SIZE walk-under topography features: cull to view + gate on explored BEFORE the sort
  // (a crammed map can have hundreds). Ground line = footprint bottom edge (ty+N)*TILE, so a
  // unit in a passable TOP row (smaller y) sorts first and is occluded → walks under the canopy.
  if(state.features){ const N=FEAT_SIZE; for(const f of state.features){
    if(f.tx+N<=x0 || f.tx>=x1 || f.ty+N<=y0 || f.ty>=y1) continue;     // AABB cull
    const si=(f.ty+N-1)*state.W + (f.tx+(N>>1));                       // one bottom-row sample cell (shared w/ minimap/fog)
    if(!state.explored[si]) continue;                                 // hidden until explored
    depth.push({y:(f.ty+N)*TILE, f, dim:state.visible[si]!==1});      // neutral scenery: dim when not visible
  } }
  // funding nodes ("funding rock"): a 3x3 walk-under footprint like a topo feature —
  // depth-sorted on the footprint ground line so Interns mining at the base draw in
  // front while a unit in the passable upper rows is occluded (walks under the rock).
  { const N=FEAT_SIZE; for(const e of state.entities){
    if(e.dead || e.type!=='goldmine') continue;
    const ftx=(e.ftx!=null)?e.ftx:(((e.x/TILE)|0)-(N>>1)), fty=(e.fty!=null)?e.fty:(((e.y/TILE)|0)-(N>>1));
    if(ftx+N<=x0 || ftx>=x1 || fty+N<=y0 || fty>=y1) continue;        // AABB cull
    const si=(fty+N-1)*state.W + (ftx+(N>>1));                        // bottom-row sample (shared w/ minimap/fog)
    if(!state.explored[si]) continue;                                // hidden until explored
    depth.push({y:(fty+N)*TILE, g:e, dim:state.visible[si]!==1});
  } }
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.kind==='building'){
      let dim=false;
      if(e.owner==='enemy'){
        if(isVisiblePix(state,e.x,e.y)) e._everSeen=true;
        if(!e._everSeen) continue;                     // never seen → don't draw
        if(!isVisiblePix(state,e.x,e.y)) dim=true;      // seen but not currently visible → dim
      }
      depth.push({y:(e.ty+e.h)*TILE, b:e, dim});        // ground line = footprint bottom edge
    } else if(e.kind==='unit'){
      if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) continue;
      depth.push({y:e.y, u:e});
    }
  }
  depth.sort((a,b)=>a.y-b.y);
  for(const d of depth){
    if(d.b) drawBuilding(state, d.b, ox,oy, d.dim);
    else if(d.m) drawOneMega(state, d.m, ox,oy, x0,y0,x1,y1);
    else if(d.f) drawFeature(state, d.f, ox,oy, d.dim);
    else if(d.g) drawGoldmine(state, d.g, ox,oy, d.dim);
    else drawUnit(state, d.u, ox,oy);
  }

  // ---- ambient particles: FRONT pass (fireflies/embers/snow/dust/motes) — over the sprites ----
  if(typeof drawParticles==='function') drawParticles(state, x0,y0,x1,y1, 'front');

  // ---- shoot FX ----
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.shootFx && e.shootFx.t>0){
      ctx.strokeStyle = isRedSide(e.owner)? 'rgba(255,150,120,.85)':'rgba(150,220,255,.8)';
      ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(e.x+ox,e.y+oy); ctx.lineTo(e.shootFx.x+ox,e.shootFx.y+oy); ctx.stroke();
      e.shootFx.t-=1/60;
    }
  }

  // ---- fog overlay ----
  drawFog(state,ox,oy,x0,y0,x1,y1);

  // ---- placement ghost ----
  if(state.placing){ drawPlacement(state,ox,oy); }

  // ---- selection ring effects ----
  drawRings(ox,oy);

  // ---- in-world unit dialog boxes — drawn last in world space, above every sprite ----
  if(typeof drawDialogs==='function') drawDialogs(state);

  ctx.restore();   // leave world space

  // ---- phase 3: screen-space overlays (CSS px, dpr-scaled, NOT world) ----
  ctx.setTransform(dpr,0,0,dpr,0,0);
  // box-select rectangle — drawn only while a box gesture is active
  if(typeof gesture!=='undefined' && gesture.mode==='box'){
    ctx.strokeStyle='rgba(120,220,160,.9)'; ctx.fillStyle='rgba(120,220,160,.12)';
    const x=Math.min(gesture.sx,gesture.cx), y=Math.min(gesture.sy,gesture.cy);
    const w=Math.abs(gesture.cx-gesture.sx), h=Math.abs(gesture.cy-gesture.sy);
    ctx.fillRect(x,y,w,h); ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,h);
  }
  ctx.setTransform(1,0,0,1,0,0);

  renderMinimap(state);   // separate canvas — unaffected by the #cv transform
}

// Blit an atlas cell with a per-tile orientation derived from `variant`, to break
// the visible repetition of a single tile across a field. `full` (floor) uses all
// 8 symmetries (4 rotations × mirror — valid since floors are seamless+flat); a
// feature (rock/tree) only mirrors horizontally so it keeps its "up".
function blitTileOriented(r, px, py, v, full){
  const S = TILE+1;
  if(!full){                                  // feature: optional horizontal mirror only
    if(v<0.5){ ctx.drawImage(ATLAS_IMG, r[0],r[1],r[2],r[3], px,py, S,S); return; }
    ctx.save(); ctx.translate(px+S/2, py+S/2); ctx.scale(-1,1);
    ctx.drawImage(ATLAS_IMG, r[0],r[1],r[2],r[3], -S/2,-S/2, S,S); ctx.restore(); return;
  }
  const o=(v*4)|0;                            // 0..3 quarter-turns
  ctx.save(); ctx.translate(px+TILE/2, py+TILE/2); ctx.rotate(o*1.5708);
  if(((v*8)|0)&1) ctx.scale(-1,1);            // half also mirror → 8 orientations
  ctx.drawImage(ATLAS_IMG, r[0],r[1],r[2],r[3], -S/2,-S/2, S,S); ctx.restore();
}
function drawTile(state,tx,ty,px,py){
  const i=ty*state.W+tx;
  const t=state.tiles[i], b=state.biome[i], v=state.variant[i];

  // Water always uses the neighbour-aware renderer (never a single atlas/oasis
  // blit), so lakes show open water inside and a real shoreline at the edge.
  if(t===T_WATER){ drawWaterTile(state,tx,ty,b,v,px,py); return; }

  // ---- atlas path: each terrain maps to one cell that includes its own ground,
  //      blitted as the whole 32px tile (1px overscan to hide seams). The single
  //      floor tile per biome is rotated/flipped per-tile (by `variant`) so a
  //      large field doesn't read as a repeated stamp; rock/tree just mirror. ----
  const slot = t===T_ROCK?'rock' : t===T_TREE?'tree' : 'floor';
  const r = spriteFor(b, slot);
  if(r){ blitTileOriented(r, px, py, v, slot==='floor'); return; }

  // ---- procedural fallback ----
  const P = BIOME_PAL[b] || BIOME_PAL[B_GRASS];
  ctx.fillStyle = (t===T_DIRT) ? P.dirt : (v>0.5 ? P.b : P.a);
  ctx.fillRect(px,py,TILE+1,TILE+1);   // drawn 1px larger so neighbours overlap
  drawFloorDeco(state,b,v,px,py);
  if(t===T_ROCK) drawRockTile(b,v,px,py);
  else if(t===T_TREE) drawTreeTile(b,v,px,py);
}

// Per-biome floor texture. Deterministic from the tile's `variant` so it never
// flickers; volcanic lava cracks pulse with state.time.
function drawFloorDeco(state,b,v,px,py){
  switch(b){
    case B_TECH: {                                  // panel grid + glow rivets
      ctx.strokeStyle='rgba(90,150,200,.16)'; ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(px+0.5,py); ctx.lineTo(px+0.5,py+TILE);
      ctx.moveTo(px,py+0.5); ctx.lineTo(px+TILE,py+0.5); ctx.stroke();
      if(v>0.82){ ctx.fillStyle='rgba(90,210,255,.55)'; ctx.fillRect(px+TILE/2-1,py+TILE/2-1,2,2); }
      else if(v<0.12){ ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(px+4,py+4,TILE-8,TILE-8); }
      break;
    }
    case B_DESERT: {                                // dune ripple + grains
      ctx.strokeStyle='rgba(150,120,70,.25)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px+2,py+(6+v*18));
      ctx.quadraticCurveTo(px+TILE/2,py+(2+v*16),px+TILE-2,py+(8+v*14)); ctx.stroke();
      if(v>0.9){ ctx.fillStyle='#8d7647'; ctx.fillRect(px+((v*22)|0)%22+4,py+12,2,2); }
      break;
    }
    case B_ICE: {                                   // sparkles + hairline cracks
      if(v>0.8){ ctx.fillStyle='rgba(255,255,255,.6)'; ctx.fillRect(px+((v*20)|0)%18+5,py+((v*16)|0)%14+5,2,2); }
      ctx.strokeStyle='rgba(120,150,170,.30)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px+v*TILE,py); ctx.lineTo(px+TILE*0.5,py+TILE*0.5); ctx.stroke();
      break;
    }
    case B_VOLCANIC: {                              // glowing lava cracks (animated)
      if(v>0.62){
        const g=0.5+0.5*Math.sin(state.time*2.2+v*12);
        ctx.strokeStyle='rgba(255,'+((90+90*g)|0)+',30,'+(0.45+0.3*g).toFixed(2)+')';
        ctx.lineWidth=2; ctx.beginPath();
        ctx.moveTo(px+3,py+v*TILE); ctx.lineTo(px+TILE*0.5,py+TILE*0.5);
        ctx.lineTo(px+TILE-3,py+(1-v)*TILE); ctx.stroke();
      } else if(v<0.2){ ctx.fillStyle='rgba(255,255,255,.03)'; ctx.fillRect(px+6,py+6,4,4); }
      break;
    }
    default: {                                      // grass / mountain speckle
      if(v>0.85){ ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(px+((v*24)|0)%24, py+((v*18)|0)%18, 3,3); }
      else if(b===B_GRASS && v<0.08){ ctx.fillStyle='rgba(120,170,90,.10)'; ctx.beginPath(); ctx.arc(px+TILE/2,py+TILE/2,5,0,6.28); ctx.fill(); }
    }
  }
}

/* ---- Water: neighbour-aware so a lake reads as open water in the interior with
   a real shoreline only where it meets land — no more shore tile blitted across
   the middle of the lake. Works for every water biome; the shore rim colour is
   taken from the adjacent LAND biome (sandy by desert, snowy by ice, …). ---- */
const EDGE_N=1, EDGE_E=2, EDGE_S=4, EDGE_W=8, EDGE_NE=16, EDGE_SE=32, EDGE_SW=64, EDGE_NW=128;
function waterEdges(state,tx,ty){
  const W=state.W,H=state.H,T=state.tiles;
  const wet=(x,y)=> x>=0&&y>=0&&x<W&&y<H && T[y*W+x]===T_WATER;   // off-map = land → border seas get a shore
  let mask=0, land=-1;
  if(!wet(tx,ty-1)){ mask|=EDGE_N; if(ty>0)   land=state.biome[(ty-1)*W+tx]; }
  if(!wet(tx+1,ty)){ mask|=EDGE_E; if(tx<W-1) land=state.biome[ty*W+tx+1]; }
  if(!wet(tx,ty+1)){ mask|=EDGE_S; if(ty<H-1) land=state.biome[(ty+1)*W+tx]; }
  if(!wet(tx-1,ty)){ mask|=EDGE_W; if(tx>0)   land=state.biome[ty*W+tx-1]; }
  if(mask){                                                       // corners only matter on an edge tile
    if(!wet(tx+1,ty-1)) mask|=EDGE_NE;
    if(!wet(tx+1,ty+1)) mask|=EDGE_SE;
    if(!wet(tx-1,ty+1)) mask|=EDGE_SW;
    if(!wet(tx-1,ty-1)) mask|=EDGE_NW;
  }
  return { mask, land };
}
// base water-body colour by the tile's OWN biome; `shore` lightens it near land
// (depth gradient). DARK / devastated palette — toxic near-black teal, not bright.
function waterBody(b,v,shore){
  if(b===B_VOLCANIC) return shore?'#5a1606':'#360e04';
  if(b===B_ICE)      return v>0.5 ? (shore?'#2c4d5c':'#21404e') : (shore?'#335462':'#284857');
  return shore ? (v>0.5?'#123a48':'#0e2f3c') : (v>0.5?'#0c2230':'#091a25');  // dark toxic teal
}
// rim colour from the adjacent LAND biome — grimy/dark wet shore, not bright
function shoreColor(b){
  switch(b){
    case B_DESERT:   return '#5a4a30';   // dark wet sand
    case B_ICE:      return '#516472';   // dirty slush
    case B_MOUNTAIN: return '#3a3d44';   // wet rock
    case B_VOLCANIC: return '#2a1c16';   // scorched
    case B_TECH:     return '#1b2129';   // panel edge
    case B_GRASS:    return '#2b3a26';   // dark grassy bank
    default:         return '#473b2a';   // neutral grimy silt
  }
}
const SHORE_RIM=4;
function drawShoreline(b,mask,land,px,py){
  const dark = b===B_VOLCANIC, R=SHORE_RIM, T=TILE;
  ctx.fillStyle = dark ? '#1c0f08' : shoreColor(land);
  if(mask&EDGE_N) ctx.fillRect(px,     py,     T, R);
  if(mask&EDGE_S) ctx.fillRect(px,     py+T-R, T, R);
  if(mask&EDGE_W) ctx.fillRect(px,     py,     R, T);
  if(mask&EDGE_E) ctx.fillRect(px+T-R, py,     R, T);
  // inner corners (two adjacent orthogonal sides are land) — square off the bend
  if((mask&EDGE_N)&&(mask&EDGE_W)) ctx.fillRect(px,     py,     R,R);
  if((mask&EDGE_N)&&(mask&EDGE_E)) ctx.fillRect(px+T-R, py,     R,R);
  if((mask&EDGE_S)&&(mask&EDGE_W)) ctx.fillRect(px,     py+T-R, R,R);
  if((mask&EDGE_S)&&(mask&EDGE_E)) ctx.fillRect(px+T-R, py+T-R, R,R);
  // diagonal-only foam fleck (land touches just at a corner)
  if((mask&EDGE_NW)&&!(mask&(EDGE_N|EDGE_W))) ctx.fillRect(px,     py,     2,2);
  if((mask&EDGE_NE)&&!(mask&(EDGE_N|EDGE_E))) ctx.fillRect(px+T-2, py,     2,2);
  if((mask&EDGE_SW)&&!(mask&(EDGE_S|EDGE_W))) ctx.fillRect(px,     py+T-2, 2,2);
  if((mask&EDGE_SE)&&!(mask&(EDGE_S|EDGE_E))) ctx.fillRect(px+T-2, py+T-2, 2,2);
  if(dark) return;
  ctx.fillStyle='rgba(150,225,230,.18)';   // faint toxic-cyan foam highlight just inside the rim
  if(mask&EDGE_N) ctx.fillRect(px,       py+R,     T,1);
  if(mask&EDGE_S) ctx.fillRect(px,       py+T-R-1, T,1);
  if(mask&EDGE_W) ctx.fillRect(px+R,     py,       1,T);
  if(mask&EDGE_E) ctx.fillRect(px+T-R-1, py,       1,T);
}
function drawWaterTile(state,tx,ty,b,v,px,py){
  const {mask,land}=waterEdges(state,tx,ty);
  const shore = mask!==0;
  const i=ty*state.W+tx;
  const depth = state.waterDepth ? state.waterDepth[i] : (shore?0:1);   // 0 shore .. 1 deep (js/water.js)

  // ---- de-blocked base: continuous depth-gradient fill (kills the 32px checkerboard) ----
  if(typeof drawWaterBaseTile==='function'){ drawWaterBaseTile(b,v,depth,px,py); }
  else { ctx.fillStyle=waterBody(b,v,shore); ctx.fillRect(px,py,TILE+1,TILE+1); }   // legacy fallback if water.js absent

  if(b===B_ICE){                                    // frozen crack stays per-tile (the drawWater span pass skips ice)
    ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(px+v*TILE,py); ctx.lineTo(px+TILE*0.5,py+TILE); ctx.stroke();
  } else if(typeof drawWater!=='function'){          // water.js absent → keep the legacy animated overlay so nothing regresses
    if(b===B_VOLCANIC){
      const g=0.5+0.5*Math.sin(state.time*1.8+v*10+px*0.05);
      ctx.fillStyle='rgba(255,'+((80+120*g)|0)+',20,.9)'; ctx.fillRect(px+2,py+2,TILE-3,TILE-3);
      ctx.fillStyle='rgba(255,225,120,'+(0.3+0.5*g).toFixed(2)+')'; ctx.fillRect(px+((v*16)|0),py+8,8,3);
    } else {
      const sh=0.5+0.5*Math.sin(state.time*1.4 + v*8 + py*0.04);
      ctx.fillStyle='rgba(120,225,225,'+(0.03+0.05*sh).toFixed(3)+')';
      ctx.fillRect(px+((v*20)|0), py+8, 10, 2);
    }
  }
  if(shore) drawShoreline(b,mask,land,px,py);
}

function drawRockTile(b,v,px,py){
  let light='#5b626c', dark='#393e45';
  if(b===B_VOLCANIC){ light='#5a3a30'; dark='#2a1c18'; }
  else if(b===B_ICE){ light='#cde0ea'; dark='#90a8b6'; }
  else if(b===B_DESERT){ light='#b89a64'; dark='#8a6f43'; }
  else if(b===B_MOUNTAIN){ light='#7b7268'; dark='#4d463f'; }
  ctx.fillStyle=dark; ctx.fillRect(px+4,py+22,24,8);
  ctx.fillStyle=light; ctx.beginPath();
  ctx.moveTo(px+6,py+24); ctx.lineTo(px+12,py+8); ctx.lineTo(px+20,py+14); ctx.lineTo(px+26,py+24); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.10)'; ctx.beginPath();
  ctx.moveTo(px+12,py+8); ctx.lineTo(px+15,py+14); ctx.lineTo(px+20,py+14); ctx.closePath(); ctx.fill();
  if(b===B_VOLCANIC){ ctx.fillStyle='rgba(255,110,30,.5)'; ctx.fillRect(px+11,py+18,5,2); }
}

function drawTreeTile(b,v,px,py){
  if(b===B_DESERT){                                 // cactus
    ctx.fillStyle='#3f7a4a'; ctx.fillRect(px+14,py+10,4,16);
    ctx.fillRect(px+9,py+15,4,3); ctx.fillRect(px+9,py+12,3,6);
    ctx.fillRect(px+19,py+17,4,3); ctx.fillRect(px+20,py+13,3,7);
    return;
  }
  ctx.fillStyle = b===B_VOLCANIC? '#2a201a':'#3a2a18'; ctx.fillRect(px+14,py+18,4,10);
  if(b===B_VOLCANIC){                               // charred dead tree
    ctx.strokeStyle='#1c1512'; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(px+16,py+20); ctx.lineTo(px+10,py+12);
    ctx.moveTo(px+16,py+22); ctx.lineTo(px+23,py+13); ctx.stroke();
    return;
  }
  let canopy = v>0.5? '#3f7a36':'#356a2e';
  if(b===B_ICE) canopy = v>0.5? '#5e7d63':'#557257';
  ctx.fillStyle=canopy; ctx.beginPath(); ctx.arc(px+16,py+14,9,0,6.28); ctx.fill();
  if(b===B_ICE){ ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(px+13,py+11,4,0,6.28); ctx.fill(); }
  else { ctx.fillStyle='rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(px+13,py+11,3,0,6.28); ctx.fill(); }
}

// ---- 2x2 walk-under topography feature (tree / rock) ----
// Drawn in the depth sort, bottom-anchored on the footprint's ground line so units in
// the passable TOP row are occluded (walk under the canopy) and units below draw over.
// Phase 1 reuses the existing OPAQUE atlas cell scaled 2x2 (top row reads as a mound);
// Phase 2 swaps in a transparent feature atlas inside drawFeatureSprite — no change here.
function drawFeature(state, f, ox, oy, dim){
  const N=FEAT_SIZE, px=f.tx*TILE+ox, py=f.ty*TILE+oy, w=N*TILE;
  const overhang=1.08;                                   // slight upward growth, like buildings/megas
  const dw=w*overhang, dh=dw;                            // square atlas cells
  const dx=px+(w-dw)/2, dy=(f.ty+N)*TILE+oy - dh + 2;    // centered, bottom-anchored on the ground line
  ctx.save();
  if(dim) ctx.globalAlpha*=0.5;                          // explored-but-not-visible
  drawFeatureSprite(f, dx, dy, dw, dh);
  ctx.restore();
}

// Blit a feature sprite into the bottom-anchored box. Mirror-only orientation from f.v
// (never rotate — a canopy must stay upright). Fallback chain: [Phase 2 transparent atlas]
// → the existing opaque atlas cell → procedural drawTreeTile/drawRockTile, all scaled to the box.
function drawFeatureSprite(f, dx, dy, dw, dh){
  ctx.save();
  if(f.v>=0.5){ ctx.translate(dx+dw/2, dy+dh/2); ctx.scale(-1,1); ctx.translate(-(dx+dw/2), -(dy+dh/2)); }
  // 1) transparent high-res cut-out (features.png) — only the rock/tree pixels, so terrain shows
  //    through and units behind the canopy are occluded only by the silhouette (true walk-under).
  const fr = (typeof featSpriteFor==='function') ? featSpriteFor(f.biome, f.slot) : null;
  if(fr){ ctx.drawImage(FEAT_IMG, fr[0],fr[1],fr[2],fr[3], dx,dy,dw,dh); ctx.restore(); return; }
  // 2) fallback: the opaque tileset cell (ground baked in), scaled up
  const r = (typeof spriteFor==='function') ? spriteFor(f.biome, f.slot) : null;
  if(r){ ctx.drawImage(ATLAS_IMG, r[0],r[1],r[2],r[3], dx,dy,dw,dh); ctx.restore(); return; }
  // 3) fallback: procedural
  ctx.translate(dx,dy); ctx.scale(dw/TILE, dh/TILE);
  if(f.slot==='rock') drawRockTile(f.biome, f.v, 0, 0); else drawTreeTile(f.biome, f.v, 0, 0);
  ctx.restore();
}

// Funding node ("funding rock"): the base topography MOUNTAIN ROCK from the feature
// atlas (assets/atlas/features.png, mountain biome), drawn exactly like an ordinary
// walk-under topo feature — NO mega-sprite, no fog frames, no sparkles, no recolor.
// The ONLY added animation is a pulsing PURPLE GLOW: a halo behind the rock plus an
// additive emission over its body so it reads as glowing purple. Glow fades as the
// node drains; per-node phase (e.id) so neighbours don't pulse in lockstep.
function drawGoldmine(state,e,ox,oy,dim){
  const N=FEAT_SIZE, t=state.time||0, ph=((e.id||0)*1.7)%6.283;
  const ftx=(e.ftx!=null)?e.ftx:(((e.x/TILE)|0)-(N>>1));
  const fty=(e.fty!=null)?e.fty:(((e.y/TILE)|0)-(N>>1));
  const w=N*TILE, cx=ftx*TILE+ox+w/2, groundY=(fty+N)*TILE+oy, midY=groundY-w*0.5;
  const frac=Math.max(0, Math.min(1, e.amount0 ? e.amount/e.amount0 : 1));   // 1 full → 0 drained
  const pulse=0.5+0.5*Math.sin(t*2.0+ph), glow=0.45+0.55*frac;
  ctx.save();
  if(dim) ctx.globalAlpha*=0.5;                                             // explored-but-not-visible

  // purple glow HALO behind the rock (pulses) — the only animation
  const hr=w*(0.52+0.06*pulse);
  const hg=ctx.createRadialGradient(cx, midY, 3, cx, midY, hr);
  hg.addColorStop(0,`rgba(170,86,238,${(0.675*glow*(0.7+0.3*pulse)).toFixed(3)})`);
  hg.addColorStop(0.5,`rgba(112,40,192,${(0.3375*glow).toFixed(3)})`);
  hg.addColorStop(1,'rgba(60,18,120,0)');
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(cx, midY, hr, 0, 6.28); ctx.fill();

  // base topography mountain ROCK from features.png (mountain biome) — drawn as a normal
  // walk-under feature. Stable per-node mirror from e.id (never flips between frames).
  drawFeature(state, {tx:ftx, ty:fty, biome:B_MOUNTAIN, slot:'rock', v:((e.id||0)&1)?0.72:0.18}, ox, oy, false);

  // additive PURPLE emission over the rock body so it reads as glowing purple (pulses)
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const er=w*0.44;
  const eg=ctx.createRadialGradient(cx, midY, 2, cx, midY, er);
  eg.addColorStop(0,`rgba(156,74,232,${(0.585*glow*(0.6+0.4*pulse)).toFixed(3)})`);
  eg.addColorStop(1,'rgba(120,50,200,0)');
  ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(cx, midY, er, 0, 6.28); ctx.fill();
  ctx.restore();

  // remaining-funding label below the base
  ctx.fillStyle='#e9d2ff'; ctx.font='11px sans-serif'; ctx.textAlign='center';
  ctx.fillText(e.amount|0, cx, groundY+13);
  ctx.restore();
}
function drawSparkle(x,y,r){
  ctx.beginPath();
  ctx.moveTo(x,y-r); ctx.lineTo(x+r*0.28,y-r*0.28); ctx.lineTo(x+r,y); ctx.lineTo(x+r*0.28,y+r*0.28);
  ctx.lineTo(x,y+r); ctx.lineTo(x-r*0.28,y+r*0.28); ctx.lineTo(x-r,y); ctx.lineTo(x-r*0.28,y-r*0.28);
  ctx.closePath(); ctx.fill();
}

function drawBuilding(state,e,ox,oy,dim){
  const d=DEF[e.type];
  const px=e.tx*TILE+ox, py=e.ty*TILE+oy;
  const w=e.w*TILE, h=e.h*TILE;
  const spr=buildingSprite(e.type, e.owner);

  ctx.save();
  if(dim) ctx.globalAlpha=0.55;
  if(e.abandoned) ctx.globalAlpha*=0.7;   // derelict: faded
  // selection ring (footprint)
  if(e.selected){ ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.strokeRect(px-3,py-3,w+6,h+6); }

  let topY=py;   // visual top of the structure (for the HP bar)
  if(spr){
    // animated 9-frame strip (neon flicker), aspect-preserved, bottom-anchored with a
    // little upward overhang for height. Per-building phase from e.id so identical
    // buildings don't flicker in lockstep. No ground shadow (intentionally dropped).
    const n=spr.frames, fi=((((state.time*BUILDING_FPS + e.id*0.13)|0)%n)+n)%n;
    const overhang = e.type==='turret'?1.18:1.08;
    const tall = e.type==='hq'?1.5625:1;   // HQ renders taller (1.25 × 1.25; footprint unchanged)
    const dw=w*overhang, dh=dw*(spr.fh/spr.fw)*tall;
    const dx=px+(w-dw)/2, dy=py+h-dh+2;
    topY=dy;
    if(e.constructing) ctx.globalAlpha*=0.5;   // rises faintly while building
    ctx.drawImage(spr.img, fi*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh);
  } else {
    // ---- procedural fallback ----
    const col = isRedSide(e.owner)? '#9a3b3b' : d.color;
    const grad=ctx.createLinearGradient(px,py,px,py+h);
    grad.addColorStop(0, shade(col,30)); grad.addColorStop(1, shade(col,-25));
    ctx.fillStyle=grad; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill();
    ctx.strokeStyle=shade(col,-50); ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.85)'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=(w*0.42|0)+'px sans-serif'; ctx.fillText(d.icon||'🏢', px+w/2, py+h/2+1);
    ctx.fillStyle = isRedSide(e.owner)?'#ff8a8a':(e.ctrl==='p2'?'#ffb84d':'#7fd6ff'); ctx.fillRect(px+w/2-3, py+2, 6, 9);
  }
  // derelict: desaturating grey wash + a pulsing reclaim beacon over the roof
  if(e.abandoned){
    ctx.fillStyle='rgba(70,80,92,.42)'; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill();
    const pulse=0.55+0.45*Math.abs(Math.sin(state.time*2.2));
    ctx.globalAlpha=pulse;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 12px sans-serif';
    ctx.fillStyle='#0a0a0a'; ctx.fillText('⚑ RECLAIM', px+w/2+1, topY-12+1);
    ctx.fillStyle='#8effb0'; ctx.fillText('⚑ RECLAIM', px+w/2, topY-12);
  }
  ctx.restore();

  // construction overlay / progress
  if(e.constructing){
    if(!spr){ ctx.fillStyle='rgba(20,30,45,.45)'; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill(); }
    barAt(px+6, py+h-12, w-12, 6, e.buildProg/e.buildTime, '#ffd86b');
  } else {
    if(e.hp<e.maxHp || e.selected){ barAt(px+6, topY-7, w-12, 5, e.hp/e.maxHp, hpColor(e.hp/e.maxHp)); }
    if(e.prodQueue && e.prodQueue.length){ barAt(px+6, py+h-8, w-12, 5, e.prodTime/e.prodTotal, '#7fd6ff'); }
  }
  // co-op controller pip — corner dot marking which player owns this building (sprite-agnostic)
  if(netRole!=='solo' && e.owner==='player'){
    ctx.fillStyle=ctrlColor(e.ctrl); ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(px+8, topY+6, 4, 0, 6.28); ctx.fill(); ctx.stroke();
  }
  if(e.hitFx>0){ ctx.fillStyle='rgba(255,80,80,'+(e.hitFx*2)+')'; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill(); e.hitFx-=1/60; }
}

// Co-op controller colour: p1 keeps the established player cyan-blue, p2 gets amber
// (distinct from enemy red, goldmine violet, neutral green). Used for the per-unit/building
// controller pip + minimap blips, shown only when networked (netRole!=='solo').
function ctrlColor(ctrl){ return ctrl==='p2' ? '#ff9d3c' : '#7fd6ff'; }

function drawUnit(state,u,ox,oy){
  const px=u.x+ox, py=u.y+oy;
  const r=u.r;
  const alt = u.air?16:0;   // flyers are drawn raised
  const vh = unitDrawH(u);   // drawn sprite height (incl. hero 15% bump) — HUD/ring scale to this, not collision r

  // ---- movement state for sprite animation (updated each render frame) ----
  const lax = u._ax==null?u.x:u._ax, lay = u._ay==null?u.y:u._ay;
  const mvx = u.x-lax, mvy = u.y-lay, md = Math.hypot(mvx,mvy);
  u._ax=u.x; u._ay=u.y;
  u._walkDist = (u._walkDist||0)+md;
  if(md>0.25){ u._still=0; if(Math.abs(mvx)>0.15) u._face = mvx<0?-1:1; }
  else u._still=(u._still||0)+1;
  const moving = (u._still||0) < 6;   // debounce so brief stalls don't flicker to idle

  ctx.save();
  // selection ring — a ground ellipse under the sprite's FEET, scaled to the sprite (no shadow)
  if(u.selected){ const fy=py-alt+vh*0.3; ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(px,fy,vh*0.34,vh*0.14,0,0,6.28); ctx.stroke(); }

  const _red = isRedSide(u.owner);
  const _p2  = (u.owner==='player' && u.ctrl==='p2');   // co-op 2nd player → amber fallback shapes
  const team = _red ? '#c0392b' : (_p2 ? '#c47a1f' : '#3b7fd0');
  const teamL= _red ? '#e57368' : (_p2 ? '#ffb84d' : '#7fb7f0');

  const sType = u.spriteType || u.type;   // hero visual override (e.g. Nino → 'nino'); gameplay still uses u.type
  const anim = unitWalk(sType, u.owner);
  if(anim){
    const S = vh;
    const act = u._actState ? actionAnim(sType, u._actState, u.owner) : null;
    let fi, useAnim, bScale=1, bShift=0;   // bScale/bShift: idle breathing (1/0 = none)
    if(act){
      useAnim = act; const n=act.frames.length;
      if(u._actState==='attack'){ const t = state.time-(u._actStamp||0);          // swing windup→strike→recover across the strip
        fi = t<0.8 ? Math.min(n-1, (t/0.8*n)|0) : 0; }
      else { fi = ((state.time*7)|0) % n; }                                        // mine / heal loop
    } else {
      // ---- IDLE PATH: walk frame 0 when still, plus render-only "life" layers ----
      useAnim = anim; fi = moving ? (((u._walkDist||0)/9)|0) % anim.frames.length : 0;
      if(!u.captive){                                  // captives stay frozen
        const idleAmount = moving ? 0 : Math.max(0, Math.min(1, ((u._still||0)-6)/IDLE.rampFrames));
        // LAYER 2 — occasional action fidget (settled, grounded units): replay the
        // unit's own action strip once as a gesture (no _actState → no combat/bullets).
        if(!moving && idleAmount>0){
          const fa = fidgetAction(sType), a = fa ? actionAnim(sType, fa, u.owner) : null;
          if(a){
            const cyc = IDLE.fidgetMin + h01(u.id+1.3)*(IDLE.fidgetMax-IDLE.fidgetMin);
            const dur = IDLE.gestureMin + h01(u.id*1.7+2.1)*(IDLE.gestureMax-IDLE.gestureMin);
            const local = (state.time + h01(u.id*2.9+0.7)*cyc) % cyc;
            if(local < dur){ const p=local/dur, n=a.frames.length, tri=1-Math.abs(1-2*p);   // 0→1→0 ping-pong
              useAnim = a; fi = Math.min(n-1, (tri*(n-1))|0); }
          }
        }
        // LAYER 1 — breathing: foot-anchored squash/stretch (idle only). The vertical
        // bob (float) is FLYERS-ONLY — ground units stay planted so they don't float.
        if(idleAmount>0){
          const ph = state.time*IDLE.breathHz*6.2831853 + (u.id||0)*IDLE.phaseStep;
          bScale = 1 + IDLE.breathAmp*idleAmount*Math.sin(ph);
          bShift = 0.3*S*(1-bScale);                                          // foot anchor only — no float
          if(u.air) bShift -= IDLE.bobPx*idleAmount*Math.sin(ph*0.5 + 1.7);   // breathing bob kept for flyers
        }
        // LAYER 3 — air hover: continuous float, even while moving
        if(u.air) bShift -= IDLE.hoverPx*Math.sin(state.time*IDLE.hoverHz + (u.id||0)*0.7);
      }
    }
    const dh = blitFrame(u,px,(py-alt)+bShift,useAnim,S*bScale,fi);
    if(u.type==='worker' && u.carrying>0){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(px,py-alt-dh*0.7-4,3,0,6.28); ctx.fill(); }
  } else if(u.type==='worker'){
    ctx.fillStyle=team; ctx.beginPath(); ctx.arc(px,py,r,0,6.28); ctx.fill();
    ctx.fillStyle=teamL; ctx.beginPath(); ctx.arc(px,py-2,r*0.5,0,6.28); ctx.fill();
    // pickaxe hint
    ctx.strokeStyle='#d8b46a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(px+r*0.4,py-r*0.4); ctx.lineTo(px+r,py-r); ctx.stroke();
    if(u.carrying>0){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(px,py-r-3,3,0,6.28); ctx.fill(); }
  } else if(u.type==='soldier'){
    ctx.fillStyle=team;
    ctx.beginPath();
    const a=u.dir||0;
    // body diamond
    roundRect(px-r*0.8,py-r*0.8,r*1.6,r*1.6,3); ctx.fill();
    ctx.fillStyle=teamL; ctx.fillRect(px-r*0.45,py-r*0.55,r*0.9,r*0.5);
    // sword
    ctx.strokeStyle='#cfd6df'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(a)*r*1.3, py+Math.sin(a)*r*1.3); ctx.stroke();
  } else if(u.type==='ranger'){
    ctx.fillStyle=team; ctx.beginPath(); ctx.arc(px,py,r,0,6.28); ctx.fill();
    ctx.fillStyle=teamL; ctx.beginPath(); ctx.arc(px,py,r*0.55,0,6.28); ctx.fill();
    // bow
    const a=u.dir||0;
    ctx.strokeStyle='#3c8f4a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(px+Math.cos(a)*r*0.7,py+Math.sin(a)*r*0.7, r*0.7, a-1.1, a+1.1); ctx.stroke();
  }
  ctx.restore();

  // hp bar — above the (bigger) sprite top
  if(u.hp<u.maxHp || u.selected){
    barAt(px-vh*0.3, py-alt-vh*0.72-6, vh*0.6, 4, u.hp/u.maxHp, hpColor(u.hp/u.maxHp));
  }
  if(u.stars) drawStars(u, px, py-alt-vh*0.72-13);   // career-rank pips above the HP bar
  // control-group badge (lowest assigned number) — at the sprite's lower-right
  if(u.owner==='player' && u._groups instanceof Set && u._groups.size){
    const g=Math.min(...[...u._groups].map(Number)); const bx=px+vh*0.30, by=py-alt+vh*0.24;
    ctx.fillStyle='rgba(10,16,26,.85)'; ctx.strokeStyle='#7fd6ff'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#cfe9ff'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(g, bx, by+0.5);
  }
  // co-op controller pip — small dot at the foot so you can tell p1/p2 units apart (sprite-agnostic)
  if(netRole!=='solo' && u.owner==='player'){
    ctx.fillStyle=ctrlColor(u.ctrl); ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(px - vh*0.30, py-alt+vh*0.30, 3, 0, 6.28); ctx.fill(); ctx.stroke();
  }
  if(u.hitFx>0){ ctx.fillStyle='rgba(255,80,80,'+(u.hitFx*3)+')'; ctx.beginPath(); ctx.arc(px,py-vh*0.2,vh*0.38,0,6.28); ctx.fill(); u.hitFx-=1/60; }
}

function drawFog(state,ox,oy,x0,y0,x1,y1){
  // Two passes, each accumulated into ONE path and filled ONCE. The +1 tile
  // overlap (gap-killer) made the translucent "seen but not visible" veil
  // double-composite along every tile seam (alpha .5 over .5 ≈ .75), painting a
  // dark grid that read as a pixelated frame. A single fill() composites the
  // union of the rects against the backdrop a single time, so overlaps no
  // longer stack — the dim veil stays a uniform .5 with no internal grid.
  const W=state.W;
  // unexplored: pitch black, opaque (overlap is invisible, but batch anyway)
  ctx.beginPath();
  let any=false;
  for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
    const i=ty*W+tx;
    if(state.explored[i]) continue;
    ctx.rect(tx*TILE+ox, ty*TILE+oy, TILE+1, TILE+1); any=true;
  }
  if(any){ ctx.fillStyle='#05070b'; ctx.fill(); }
  // explored but not currently visible: single translucent dim veil
  ctx.beginPath(); any=false;
  for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
    const i=ty*W+tx;
    if(!state.explored[i] || state.visible[i]) continue;
    ctx.rect(tx*TILE+ox, ty*TILE+oy, TILE+1, TILE+1); any=true;
  }
  if(any){ ctx.fillStyle='rgba(5,8,14,.5)'; ctx.fill(); }
}

function drawPlacement(state,ox,oy){
  const p=state.placing;
  const wx=mouse.wx, wy=mouse.wy;
  const tx=Math.floor((wx)/TILE - (p.def.w-1)/2 +0.0001);
  const ty=Math.floor((wy)/TILE - (p.def.h-1)/2 +0.0001);
  const ok=canPlaceAt(state,p.type,tx,ty) && playerEco(state, LOCAL_CTRL).gold>=p.def.cost;
  const px=tx*TILE+ox, py=ty*TILE+oy, w=p.def.w*TILE, h=p.def.h*TILE;
  ctx.fillStyle= ok? 'rgba(120,255,150,.3)':'rgba(255,90,90,.3)';
  ctx.fillRect(px,py,w,h);
  ctx.strokeStyle= ok? '#8effb0':'#ff6b6b'; ctx.lineWidth=2; ctx.strokeRect(px,py,w,h);
  state.placeCandidate={tx,ty,ok};
}

/* selection-ring fx */
let rings=[];
function spawnRing(wx,wy,color){ rings.push({x:wx,y:wy,r:6,max:26,color,t:1}); }
function drawRings(ox,oy){
  for(const r of rings){
    ctx.strokeStyle=r.color; ctx.globalAlpha=r.t; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(r.x+ox,r.y+oy,r.r,0,6.28); ctx.stroke(); ctx.globalAlpha=1;
    r.r+=0.8; r.t-=0.04;
  }
  rings=rings.filter(r=>r.t>0);
}

/* ---- minimap ---- */
function renderMinimap(state){
  const W=mm.width, H=mm.height;
  mmx.fillStyle='#05080d'; mmx.fillRect(0,0,W,H);
  const sx=W/state.W, sy=H/state.H;
  for(let ty=0;ty<state.H;ty++)for(let tx=0;tx<state.W;tx++){
    const i=ty*state.W+tx;
    if(!state.explored[i]) continue;
    const t=state.tiles[i], b=state.biome[i];
    let c;
    if(t===T_WATER)      c = b===B_VOLCANIC?'#4a1606': b===B_ICE?'#284857':'#0c2230';
    else if(t===T_ROCK)  c = b===B_VOLCANIC?'#3a241c': b===B_ICE?'#3a4854':'#3a3d44';
    else if(t===T_TREE)  c = b===B_DESERT?'#2e4a2a': b===B_VOLCANIC?'#1c1411':'#16241a';
    else                 c = BIOME_MINI[b] || '#1c2a1e';
    if(!state.visible[i]) c=shade(c,-30);
    mmx.fillStyle=c; mmx.fillRect(tx*sx,ty*sy,Math.ceil(sx),Math.ceil(sy));
  }
  // topography features: their footprint cells are now plain floor, so re-dot them
  // (same colors the T_TREE/T_ROCK tiles used) over the feature's FEAT_SIZE block.
  if(state.features){ const N=FEAT_SIZE; for(const f of state.features){
    const si=(f.ty+N-1)*state.W + (f.tx+(N>>1));
    if(!state.explored[si]) continue;
    const b=state.biome[si];
    let c = f.slot==='rock' ? (b===B_VOLCANIC?'#3a241c': b===B_ICE?'#3a4854':'#3a3d44')
                            : (b===B_DESERT?'#2e4a2a': b===B_VOLCANIC?'#1c1411':'#16241a');
    if(!state.visible[si]) c=shade(c,-30);
    mmx.fillStyle=c; mmx.fillRect(f.tx*sx, f.ty*sy, Math.ceil(sx*N), Math.ceil(sy*N));
  } }
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.type==='goldmine'){ const N=FEAT_SIZE, ftx=(e.ftx!=null)?e.ftx:(((e.x/TILE)|0)-(N>>1)), fty=(e.fty!=null)?e.fty:(((e.y/TILE)|0)-(N>>1)); const si=(fty+N-1)*state.W+(ftx+(N>>1)); if(state.explored[si]){ mmx.fillStyle='#b06bff'; mmx.fillRect(ftx*sx, fty*sy, Math.ceil(sx*N), Math.ceil(sy*N));} continue; }
    if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y) && !(e.kind==='building'&&e._everSeen)) continue;
    mmx.fillStyle = e.abandoned ? '#8effb0' : isRedSide(e.owner)?'#ff6b6b': (e.ctrl==='p2'?'#ff9d3c':'#7fd6ff');
    const s = e.kind==='building'? (e.abandoned?4:3) :2;
    mmx.fillRect(e.x/TILE*sx - s/2, e.y/TILE*sy - s/2, s, s);
  }
  // viewport rect — world units visible (dpr + zoom corrected)
  const z=state.zoom||1, vw=viewW()/z, vh=viewH()/z;
  mmx.strokeStyle='rgba(255,255,255,.7)'; mmx.lineWidth=1;
  mmx.strokeRect(state.camX/TILE*sx, state.camY/TILE*sy, vw/TILE*sx, vh/TILE*sy);
}

/* ---- small draw helpers ---- */
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function barAt(x,y,w,h,frac,color){
  frac=Math.max(0,Math.min(1,frac));
  ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(x-1,y-1,w+2,h+2);
  ctx.fillStyle='#1a2533'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle=color; ctx.fillRect(x,y,w*frac,h);
}
function hpColor(f){ return f>0.5?'#4cd964': f>0.25?'#ffcc33':'#ff5b5b'; }
function shade(hex,amt){
  const c=hex.replace('#',''); let r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16);
  r=Math.max(0,Math.min(255,r+amt)); g=Math.max(0,Math.min(255,g+amt)); b=Math.max(0,Math.min(255,b+amt));
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

