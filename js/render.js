/* render.js — fog (computeFog/isVisiblePix) + all canvas drawing: render, drawTile/Unit/Building, minimap, camera clamp, VIEW_TOP/BOT. */
/* =====================================================================
   FOG OF WAR
   ===================================================================== */
function computeFog(state){
  if(state._sandboxReveal){ state.visible.fill(1); state.explored.fill(1); return; }   // sandbox "reveal map" (localhost test tool; flag set only by js/sandbox.js)
  if(state.hub){
    state.visible.fill(1);
    state.explored.fill(1);
    return;
  }
  state.visible.fill(0);
  const W=state.W,H=state.H;
  for(const e of state.entities){
    if(e.dead||e.storedIn||e.owner!=='player') continue;
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
  // transient reveal window — a short-lived player-side vision patch (e.g. a deferred boss's dramatic
  // arrival: THE SEVERANCIER surfacing on Episode VII), so the player SEES where he appeared before
  // normal fog resumes (he is already closing in). Tile-space {x,y,r,until}; expires by state.time.
  const rv=state._bossReveal;
  if(rv && (state.time||0) < rv.until){
    const cx=rv.x|0, cy=rv.y|0, rr=rv.r||7, r2=rr*rr;
    for(let y=-rr;y<=rr;y++)for(let x=-rr;x<=rr;x++){
      if(x*x+y*y>r2) continue;
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
let VIEW_TOP=0, VIEW_BOT=150;   // VIEW_TOP pinned to 0: the top HUD now FLOATS over the world (reserves no band) — see syncHud()
let HUD_TOP_VIS=46;             // measured VISUAL height of the floating top controls; overlays clear THIS, not VIEW_TOP
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

/* ===== Terrain/world-render revamp — MVP P0–P2 shared infra (see docs/terrain-render-revamp{,-tasks}.md) =====
   ALL of this is cosmetic, render-only, runs OUTSIDE update(G,dt), and is deterministic from coordinates
   (never simRandom/Math.random) → host & client paint identically; nothing is serialized (§11 / §0).
   Per-layer debug toggles (mirror ?perf=1): ?noshadows=1 ?nogrunge=1 ?nograde=1 ?novignette=1
   ?rgbagrade=1 (force the no-blend-mode fallback). Topography clustering A/B: ?nofeatclu=1 (ignore the
   map-gen f.var grove pick → old uncorrelated per-tile hash) ?novscale=1 (ignore f.vscale size band). */
const RENDER = (function(){
  const qs=(typeof location!=='undefined' && location.search) || '';
  const off=k=>new RegExp('[?&]no'+k+'=1\\b').test(qs);
  return { shadows:!off('shadows'), grunge:!off('grunge'), grade:!off('grade'), decals:!off('decals'),
           vignette:!off('vignette'), haze:!off('haze'), rain:!off('rain'), forceRgbaGrade:/[?&]rgbagrade=1\b/.test(qs),
           featclu:!off('featclu'), vscale:!off('vscale'), mtnchain:!off('mtnchain'), lightfx:!off('lightfx'),
           bldgneon:!off('bldgneon') };
})();
const BUILDING_ANIM_SPEED = 0.217;  // in-game building frame-loop speed multiplier (calm, slow cross-fade)
const NEON_LOD_ZOOM = 0.8;          // at/above → full cross-fade neon; below → cheap single-layer neon (still shown at every zoom)
// CC.1 — deterministic 2D hash → [0,1). Pure; identical cross-peer; NEVER simRandom/Math.random. (h01 above = 1D.)
function h2(x,y){ const s=Math.sin(x*12.9898 + y*78.233)*43758.5453; return s - Math.floor(s); }
// P0.1 — explicit draw-order bands (RimWorld AltitudeLayer model). The passes in render() ARE these bands,
// top→bottom; the depth[] pass is the ACTORS band (Y-sorted by contact point / feet). Documentation of intent.
const LAYER = Object.freeze({ TERRAIN:0, GROUND_DECAL:1, SHADOW:2, ACTORS:3, CANOPY:4, FX:5, FOG:6, POST:7 });

/* P7.5 — HUB weather (procedural, free): a wet neon-noir home base. (a) drawHubWet smears the cyan road-neon
   DOWNWARD on the wet carriageway as a reflection (the "wet street" look) — world space, drawn just after the
   roads; (b) drawHubRain draws animated slanted rain streaks over the whole view — screen space, additive,
   gated on reduced-motion / QUAL / ?norain. Both HUB-only, cosmetic, cheap. */
function drawHubWet(state, x0,y0,x1,y1){
  if(!state.hub || !state.roadTiles) return;
  const W=state.W, R=state.roadTiles, AX=state.roadAxis;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  for(let ty=y0;ty<y1;ty++) for(let tx=x0;tx<x1;tx++){
    const i=ty*W+tx; if(R[i]!==1) continue;                       // carriageway (asphalt) only
    if(AX && AX[i]){                                              // a lit centre-line runs here → wet reflection below it
      const px=tx*TILE, py=ty*TILE;
      const g=ctx.createLinearGradient(px,py,px,py+TILE*1.7);
      g.addColorStop(0,'rgba(90,210,255,0.085)'); g.addColorStop(0.5,'rgba(90,210,255,0.03)'); g.addColorStop(1,'rgba(90,210,255,0)');
      ctx.fillStyle=g; ctx.fillRect(px-1,py,TILE+2,TILE*1.7);
    }
  }
  ctx.restore();
}
function drawHubRain(state){
  if(!RENDER.rain || !state.hub) return;
  if(typeof megaReducedMotion==='function' && megaReducedMotion()) return;
  if(typeof QUAL!=='undefined' && QUAL && QUAL.level>=2) return;
  const W=viewW(), H=cv.height/dpr, t=state.time||0, N=160, SP=560, SL=0.32;   // count, fall px/s, slant
  ctx.save(); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation='lighter'; ctx.strokeStyle='rgba(150,180,215,0.09)'; ctx.lineWidth=1; ctx.beginPath();
  for(let i=0;i<N;i++){
    const a=h2(i*1.3+0.5, 7.1), c=h2(i*2.7+1.1, 3.3);
    const fall=(((t*SP*(0.75+c*0.5) + a*2000) % (H+80)) + H+80) % (H+80) - 40;
    const x=a*(W+160)-80 + fall*SL, len=13+c*13;
    ctx.moveTo(x, fall); ctx.lineTo(x - len*SL, fall - len);
  }
  ctx.stroke(); ctx.restore();
}
const _unitTileSet=new Set();   // P3.1: per-frame set of tile indices a unit stands on (rebuilt each render)
// CC.2 — cached soft contact-shadow sprite (built ONCE, reused for every unit, scaled per size → zero per-frame alloc).
let _shadowSprite=null;
function shadowSprite(){
  if(_shadowSprite) return _shadowSprite;
  const R=48, c=document.createElement('canvas'); c.width=c.height=R*2;
  const g=c.getContext('2d'), grad=g.createRadialGradient(R,R,1,R,R,R);
  grad.addColorStop(0,'rgba(0,0,0,0.55)'); grad.addColorStop(0.55,'rgba(0,0,0,0.26)'); grad.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grad; g.fillRect(0,0,R*2,R*2);
  _shadowSprite=c; return c;
}
// CC.3 — tileable procedural grunge: sum of INTEGER-period sine waves → perfectly seamless over P px, baked once.
// Only the dark half is kept (as alpha) so it can only DARKEN/mottle, never brighten (art direction). No Gemini cost.
let _grungeTex=null;
function grungeTex(){
  if(_grungeTex) return _grungeTex;
  const P=512, c=document.createElement('canvas'); c.width=c.height=P;
  const g=c.getContext('2d'), img=g.createImageData(P,P), d=img.data, K=6.2831853/P;
  const T=[[3,1,0.0],[1,4,1.3],[5,2,2.1],[2,6,0.7],[7,3,3.4],[4,5,5.0]];   // integer wave vectors → tile seamlessly
  for(let y=0;y<P;y++) for(let x=0;x<P;x++){
    let v=0; for(let k=0;k<T.length;k++) v+=Math.sin((T[k][0]*x+T[k][1]*y)*K + T[k][2]);
    v/=T.length;                                   // ~[-1,1]
    const a=Math.max(0,-v)*46;                      // dark half only → 0..~46 alpha
    const i=(y*P+x)*4; d[i]=4; d[i+1]=5; d[i+2]=8; d[i+3]=a|0;
  }
  g.putImageData(img,0,0); _grungeTex=c; return c;
}

/* P5 — DECAL SCATTER (baked, procedural, free): debris / cracks / scorch scattered across the GROUND in
   world space so they cross tile boundaries (a crack spans two tiles), breaking the grid further and adding
   "alive" detail. Placed on a world-anchored jittered grid seeded by CELL COORDS (mulberry32 → identical on
   host & client; never simRandom), drawn into the chunk bake → zero scroll cost. Ground-only, dark &
   value-suppressed (§11 readability), darken-dominant with a faint biome accent on crack cores. ?nodecals=1. */
function _mulberry32(seed){ let s=seed>>>0; return function(){ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
// per-biome decal ink: base = dark shape colour (rgba prefix, alpha appended); accent = faint crack-core glow
// (ember/cyan/violet) or null; dens = placement probability per grid cell (sparse).
const DECAL_FREQ = 0.5;   // global decal-frequency dial: scales the per-biome `dens` below (lower = fewer terrain decals; owner-tuned)
const DECAL = {
  [B_GRASS]:    { base:'rgba(8,13,8,',   accent:null,               dens:0.34 },
  [B_MOUNTAIN]: { base:'rgba(13,14,17,', accent:'rgba(150,120,185,',dens:0.36 },  // violet ore fleck
  [B_WATER]:    { base:'rgba(6,15,21,',  accent:'rgba(40,150,170,', dens:0.24 },
  [B_TECH]:     { base:'rgba(7,9,13,',   accent:'rgba(60,200,225,', dens:0.40 },  // cyan
  [B_DESERT]:   { base:'rgba(28,22,12,', accent:null,               dens:0.36 },
  [B_ICE]:      { base:'rgba(16,22,28,', accent:'rgba(120,190,210,',dens:0.30 },
  [B_VOLCANIC]: { base:'rgba(9,5,3,',    accent:'rgba(255,90,30,',  dens:0.34 },  // ember
};
function _decalScorch(g,x,y,sz,base){
  const r=sz*1.45, gr=g.createRadialGradient(x,y,1,x,y,r);
  gr.addColorStop(0,base+'0.26)'); gr.addColorStop(0.6,base+'0.11)'); gr.addColorStop(1,base+'0)');
  g.fillStyle=gr; g.beginPath(); g.ellipse(x,y,r,r*0.84,0,0,6.2832); g.fill();
}
function _decalDebris(g,x,y,sz,rnd,base){
  const n=3+(rnd()*3|0);
  for(let i=0;i<n;i++){ const a=rnd()*6.2832, d=rnd()*sz, ex=x+Math.cos(a)*d, ey=y+Math.sin(a)*d;
    const w=1+rnd()*sz*0.42, h=1+rnd()*sz*0.28;
    g.fillStyle=base+(0.28+rnd()*0.26).toFixed(2)+')';
    g.save(); g.translate(ex,ey); g.rotate(rnd()*6.2832); g.beginPath(); g.ellipse(0,0,w,h,0,0,6.2832); g.fill(); g.restore(); }
}
function _decalCrack(g,x,y,sz,rot,rnd,base,accent){
  const seg=3+(rnd()*2|0); let ang=rot, px=x-Math.cos(rot)*sz, py=y-Math.sin(rot)*sz; const pts=[[px,py]];
  for(let i=0;i<seg;i++){ ang+=(rnd()-0.5)*0.95; const len=sz*(0.5+rnd()*0.7); px+=Math.cos(ang)*len; py+=Math.sin(ang)*len; pts.push([px,py]); }
  g.save(); g.lineCap='round'; g.lineJoin='round';
  g.strokeStyle=base+'0.5)'; g.lineWidth=1.3; g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]); g.stroke();
  if(accent){ g.strokeStyle=accent+'0.22)'; g.lineWidth=0.6; g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]); g.stroke(); }
  g.restore();
}
const DCELL = 46;   // world px between decal candidate cells (~1 decal per ~6 tiles after the density gate)
function bakeDecals(g, state, tx0, ty0){
  if(!RENDER.decals) return;
  const W=state.W, H=state.H, ww=TC_SIZE*TILE, wx0=tx0*TILE, wy0=ty0*TILE;
  const c0x=Math.floor(wx0/DCELL)-1, c1x=Math.floor((wx0+ww)/DCELL)+1;   // ±1 cell margin → decals straddling a chunk seam draw in BOTH bakes (seamless)
  const c0y=Math.floor(wy0/DCELL)-1, c1y=Math.floor((wy0+ww)/DCELL)+1;
  for(let cy=c0y;cy<=c1y;cy++) for(let cx=c0x;cx<=c1x;cx++){
    const rnd=_mulberry32((Math.imul(cx,374761393) ^ Math.imul(cy,668265263))>>>0);
    const wx=cx*DCELL+rnd()*DCELL, wy=cy*DCELL+rnd()*DCELL;             // jittered world position
    const tx=(wx/TILE)|0, ty=(wy/TILE)|0; if(tx<0||ty<0||tx>=W||ty>=H) continue;
    const i=ty*W+tx; if(!state.explored[i]) continue;
    const t=state.tiles[i]; if(t!==T_GRASS && t!==T_DIRT) continue;     // GROUND only (skip water/rock/tree)
    const b=state.biome[i], pal=DECAL[b]||DECAL[B_GRASS];
    if(rnd()>pal.dens*DECAL_FREQ) continue;                             // sparse (DECAL_FREQ dials overall density)
    const lx=wx-wx0, ly=wy-wy0;
    // P7.3: painted decal stamp (if the atlas loaded) — richer ground detail; else procedural. Both baked,
    // value-suppressed. Hash-picked variant + rotation + size; deterministic (mulberry from chunk coords).
    if(typeof DECAL_READY!=='undefined' && DECAL_READY && typeof decalRect==='function'){
      const dr=decalRect(b, (rnd()*DECAL_N)|0);
      if(dr){ const ds=TILE*(0.6+rnd()*0.85);
        g.save(); g.globalAlpha=0.6; g.translate(lx,ly); g.rotate(rnd()*6.2832);
        g.drawImage(DECAL_IMG, dr[0],dr[1],dr[2],dr[3], -ds/2,-ds/2, ds, ds); g.restore(); continue; }
    }
    const sz=4.5+rnd()*7, k=rnd();
    if(k<0.30) _decalScorch(g, lx, ly, sz, pal.base);
    else if(k<0.66) _decalDebris(g, lx, ly, sz, rnd, pal.base);
    else _decalCrack(g, lx, ly, sz, rnd()*6.2832, rnd, pal.base, pal.accent);
  }
}

// P2 — full-screen post stack: per-biome multiply grade + warm focal pool + vignette. Screen-space, QUAL-gated,
// drawn UNDER the world-space gameplay UI (rings/floaters/beacons) so those stay crisp. The grade is eased toward
// the biome under the camera so crossing a border doesn't pop. All gradients cached (rebuilt only on resize).
let _gradeCur=[18,22,30,0], _vigGrad=null, _vigKey='', _focGrad=null, _focKey='';
function _biomeGrade(b){ return (typeof BIOME_GRADE!=='undefined') ? (BIOME_GRADE[b]||BIOME_GRADE[B_GRASS]) : null; }
function vignetteGrad(W,H){ const k=W+'x'+H; if(_vigKey===k && _vigGrad) return _vigGrad;
  const cx=W/2, cy=H/2, R=Math.hypot(W,H)/2;
  const gr=ctx.createRadialGradient(cx,cy,R*0.52,cx,cy,R*1.02);
  gr.addColorStop(0,'rgba(3,5,11,0)'); gr.addColorStop(1,'rgba(3,5,11,0.5)');
  _vigGrad=gr; _vigKey=k; return gr; }
function focalGrad(W,H){ const k=W+'x'+H; if(_focKey===k && _focGrad) return _focGrad;
  const fx=W/2, fy=H/2, R=Math.hypot(W,H)*0.42;
  const gr=ctx.createRadialGradient(fx,fy,1,fx,fy,R);
  gr.addColorStop(0,'rgba(255,196,128,0.05)'); gr.addColorStop(0.5,'rgba(255,170,110,0.02)'); gr.addColorStop(1,'rgba(255,160,100,0)');
  _focGrad=gr; _focKey=k; return gr; }
function applyPostStack(state, z, vx, vy){
  if(typeof QUAL!=='undefined' && QUAL.level>=2) return;          // P2.4 — drop the whole stack under sustained load
  if(!(RENDER.grade||RENDER.vignette)) return;
  const W=viewW(), H=cv.height/dpr;
  // dominant biome under camera center → target multiply grade (eased toward, so a border crossing doesn't pop)
  let tg=[18,22,30,0];
  if(RENDER.grade && state.biome){
    const wx=vx+(W/z)/2, wy=vy+(H/z)/2;
    const tx=Math.max(0,Math.min(state.W-1,(wx/TILE)|0)), ty=Math.max(0,Math.min(state.H-1,(wy/TILE)|0));
    const G=_biomeGrade(state.biome[ty*state.W+tx]); if(G) tg=[G.mult[0],G.mult[1],G.mult[2],G.mult[3]*255];
  }
  for(let i=0;i<4;i++) _gradeCur[i] += (tg[i]-_gradeCur[i])*0.06;  // ~16-frame ease
  ctx.save(); ctx.setTransform(dpr,0,0,dpr,0,0);
  // 1) per-biome multiply tint (darkens/cools — never brightens). rgba fallback = a flat dark wash (?rgbagrade=1).
  if(RENDER.grade && _gradeCur[3]>1.5){
    const a=Math.min(0.5,_gradeCur[3]/255);
    if(RENDER.forceRgbaGrade){ ctx.globalAlpha=a*0.7; ctx.fillStyle='rgb('+((_gradeCur[0]*0.4)|0)+','+((_gradeCur[1]*0.4)|0)+','+((_gradeCur[2]*0.4)|0)+')'; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; }
    else { ctx.globalCompositeOperation='multiply'; ctx.globalAlpha=a; ctx.fillStyle='rgb('+(_gradeCur[0]|0)+','+(_gradeCur[1]|0)+','+(_gradeCur[2]|0)+')'; ctx.fillRect(0,0,W,H); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; }
  }
  // 2) warm focal pool (very subtle additive lift on the action) + 3) vignette (pure-black-edged frame).
  if(RENDER.vignette){
    ctx.globalCompositeOperation='lighter'; ctx.fillStyle=focalGrad(W,H); ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation='source-over'; ctx.fillStyle=vignetteGrad(W,H); ctx.fillRect(0,0,W,H);
  }
  ctx.restore();
}
// the single action key for a sprite type ('mine' | 'heal' | 'attack'), or null
function fidgetAction(sType){ const t=UNIT_ACTION[sType]; return t ? Object.keys(t)[0] : null; }

function resize(){
  // QUAL.dprCap caps the backing-store resolution only when the adaptive controller has degraded under
  // sustained load (Infinity/native at full quality → identical to before). See js/quality.js.
  const _cap = (typeof QUAL!=='undefined' && QUAL.dprCap) ? QUAL.dprCap : Infinity;
  dpr = Math.min(_cap, window.devicePixelRatio || 1);
  cv.width  = Math.round(innerWidth*dpr);  cv.height = Math.round(innerHeight*dpr);
  cv.style.width = innerWidth+'px';         cv.style.height = innerHeight+'px';
  syncHud();
  if(G) clampCam(G);
}
// Mirror the on-screen HUD bar heights into VIEW_TOP/VIEW_BOT so the playable
// viewport always matches the (responsive) DOM.
function syncHud(){
  const tb=document.getElementById('topbar'), bp=document.getElementById('bottom');
  // The top bar floats over the world (transparent, pointer-through gaps): it reserves NO canvas band, so
  // VIEW_TOP is pinned to 0 and the world renders + maps full-height behind it. We still measure the bar's
  // visual height into HUD_TOP_VIS so the overlays anchored below the controls (--hud-top-h CSS consumers +
  // the dossier / HUB-menu / hub-crumb / hub-clock JS) clear the buttons exactly as before.
  if(tb) HUD_TOP_VIS = Math.ceil(tb.getBoundingClientRect().height || tb.offsetHeight || 0);
  VIEW_TOP = 0;
  if(bp) VIEW_BOT = Math.ceil(bp.getBoundingClientRect().height || bp.offsetHeight || 0);
  if(document.documentElement) document.documentElement.style.setProperty('--hud-top-h', HUD_TOP_VIS+'px');
  if(document.documentElement) document.documentElement.style.setProperty('--hud-bottom-h', VIEW_BOT+'px');
  // Objectives-row top (viewport px): on phones the topbar wraps to rows and CSS lifts the floating
  // 🕘 clock + 🗺 minimap toggle UP onto the objectives row (top-aligned with the chip) instead of
  // stacking them in a third row below the bar. Measured (not a magic constant) so it stays exact
  // across the topbar's responsive heights; #hub-clock / #btn-minimap fall back to a calc() when the
  // chip is hidden (e.g. cutscene scenes) and desktop ignores the var entirely.
  if(document.documentElement){
    const oc=document.getElementById('obj-chip'), ocr=oc&&oc.getBoundingClientRect();
    if(ocr && ocr.height>0) document.documentElement.style.setProperty('--obj-top', Math.round(ocr.top)+'px');
    else document.documentElement.style.removeProperty('--obj-top');
  }
  const news=document.getElementById('lns-ingame');   // live-news ticker reserves a band above the bottom HUD when shown
  if(news && news.offsetHeight) VIEW_BOT += news.offsetHeight;
  cssH = cv.getBoundingClientRect().height || innerHeight;
}
// Keep VIEW_TOP/VIEW_BOT and --hud-bottom-h in lock-step with the HUD bars' REAL
// heights. The discrete syncHud() callers (resize, load, command-line sync, LNS
// toggle) miss height changes from production-queue cards, selection content,
// late custom-font reflow, command-button wrapping, and media-query breakpoints —
// any of which leaves --hud-bottom-h stale so the fixed LNS stripe drifts onto the
// bottom HUD. A ResizeObserver re-syncs AFTER every layout pass, whatever caused it.
// No feedback loop: syncHud() only writes --hud-top-h / --hud-bottom-h, which
// reposition NON-observed fixed overlays (#bossbar, #btn-minimap, the minimap
// overlay, #tutorialCoach / #lns-ingame) — it never resizes an observed element.
function initHudObservers(){
  if(typeof ResizeObserver!=='function') return;
  let pending=false;
  const ro=new ResizeObserver(()=>{
    if(pending) return; pending=true;   // coalesce simultaneous bar changes into one rAF pass
    requestAnimationFrame(()=>{ pending=false; syncHud(); if(G && typeof clampCam==='function') clampCam(G); });
  });
  ['bottom','topbar','lns-ingame'].forEach(id=>{ const el=document.getElementById(id); if(el) ro.observe(el); });
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

/* ---- Laser shot FX (Star-Wars / cyberpunk glowing bolt) ----
   A hot-white-cored, colored-halo BOLT that travels from the unit's gun muzzle to the
   target, trailing a fading beam, with a muzzle flash and an impact spark. Plain canvas
   2D: additive 'lighter' compositing + layered strokes for the beam (white-hot core →
   colored halo) + a cached radial glow sprite for the muzzle/head/impact bursts (no
   per-frame gradient allocation). Player RED, enemy BLUE; width scales with unit size.
   Muzzle start comes from muzzleWorld()/buildingMuzzle(); endpoint is the shot's
   shootFx.x/y; flight progress p = 1 - shootFx.t/SHOOTFX_LIFE. */
const _laserGlowCache = {};
function _laserGlow(red){
  const key = red?'r':'b'; let c=_laserGlowCache[key]; if(c) return c;
  const s=64; c=document.createElement('canvas'); c.width=c.height=s;
  const x=c.getContext('2d'), g=x.createRadialGradient(s/2,s/2,0, s/2,s/2,s/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  if(red){ g.addColorStop(0.22,'rgba(255,228,212,0.95)'); g.addColorStop(0.5,'rgba(255,80,60,0.55)'); g.addColorStop(1,'rgba(255,60,45,0)'); }
  else   { g.addColorStop(0.22,'rgba(220,240,255,0.95)'); g.addColorStop(0.5,'rgba(90,175,255,0.55)'); g.addColorStop(1,'rgba(70,160,255,0)'); }
  x.fillStyle=g; x.fillRect(0,0,s,s); _laserGlowCache[key]=c; return c;
}
function _laserBlob(sprite, cx, cy, radius, alpha){
  if(alpha<=0.01 || radius<=0.3) return;
  ctx.globalAlpha=Math.min(1,alpha);
  ctx.drawImage(sprite, cx-radius, cy-radius, radius*2, radius*2);
}
// x0,y0 = muzzle; x1,y1 = target; red = side; w = base beam width; p = 0..1 flight; charge = heavy (sieged) variant
function drawLaserBolt(x0,y0,x1,y1, red, w, p, charge){
  const glow=_laserGlow(red);
  const outer = red ? '255,70,55' : '80,170,255';
  const core  = red ? '255,232,218' : '220,242,255';
  const ep = p*p*(3-2*p);                              // smoothstep ease for the travelling head
  const hx=x0+(x1-x0)*ep, hy=y0+(y1-y0)*ep;            // bolt head
  const tp=Math.max(0, ep-0.34);                       // trail tail trails ~34% of the beam behind the head
  const lx=x0+(x1-x0)*tp, ly=y0+(y1-y0)*tp;
  const env=Math.max(0, Math.min(1,p/0.10) * Math.min(1,(1-p)/0.28));   // beam/trail intensity envelope (fade in fast, out near impact)
  const W=w*(charge?1.5:1);

  ctx.save();
  ctx.globalCompositeOperation='lighter';
  ctx.lineCap='round'; ctx.lineJoin='round';
  // beam trail (tail → head): layered additive strokes, white-hot core
  if(env>0.02){
    const layers=[
      [W*3.4, 'rgba('+outer+','+(0.14*env).toFixed(3)+')'],
      [W*1.9, 'rgba('+outer+','+(0.30*env).toFixed(3)+')'],
      [W*1.0, 'rgba('+core +','+(0.55*env).toFixed(3)+')'],
      [Math.max(1,W*0.45), 'rgba(255,255,255,'+(0.92*env).toFixed(3)+')'],
    ];
    for(let i=0;i<layers.length;i++){ ctx.strokeStyle=layers[i][1]; ctx.lineWidth=layers[i][0];
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(hx,hy); ctx.stroke(); }
  }
  // bolt head pop
  _laserBlob(glow, hx,hy, W*(charge?2.6:2.0)*Math.max(0.45,env), env*1.1);
  // muzzle flash — brightest at p=0, gone by ~0.42
  const mf=Math.max(0,(0.42-p)/0.42);
  _laserBlob(glow, x0,y0, W*(charge?4.2:3.0)*(0.6+0.4*mf), mf);
  // impact spark — ramps in as the bolt reaches the target
  const im=Math.max(0,(p-0.74)/0.26);
  _laserBlob(glow, x1,y1, W*(charge?3.4:2.6)*(0.5+0.5*im), im);
  ctx.restore();
}

// T2-1: the alt-win objective beacon — a tall gold pulse at the survive/escort/hold target, plus a
// gold ring under the escort VIP. Cosmetic; reads the (already-scaled) cfg, so it works on clients.
// BOSS coolant nodes (cfg.bossNodes): a cyan ground capture-point. Reads live progress from state.bossNodes
// (host/solo) and falls back to cfg positions on a co-op client. Hold it to force the boss's EXPOSED window.
function drawBossNodes(state,ox,oy){
  const cfg=state.cfg; if(!cfg || !cfg.bossNodes || !cfg.bossNodes.length || state.over) return;
  const live=state.bossNodes, t=state.time||0;
  for(let i=0;i<cfg.bossNodes.length;i++){
    const base=cfg.bossNodes[i], n=(live&&live[i])||base;
    const cx=((n.x!=null?n.x:base.x)+0.5)*TILE+ox, cy=((n.y!=null?n.y:base.y)+0.5)*TILE+oy;
    const R=((n.radius!=null?n.radius:1.8))*TILE;
    const cooling=(n.cool||0)>0, prog=n.holdSec?Math.min(1,(n.holdT||0)/n.holdSec):0;
    const pulse=0.5+0.5*Math.sin(t*3);
    ctx.save();
    // soft inner glow (additive)
    ctx.globalCompositeOperation='lighter';
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
    g.addColorStop(0, cooling?'rgba(120,160,180,0.10)':`rgba(123,220,255,${(0.16+0.16*pulse).toFixed(3)})`);
    g.addColorStop(1,'rgba(123,220,255,0)');
    ctx.fillStyle=g; ctx.globalAlpha=1;
    ctx.beginPath(); ctx.ellipse(cx,cy,R,R*0.5,0,0,6.28); ctx.fill();
    // outer ring
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=cooling?0.4:0.85; ctx.lineWidth=2.5;
    ctx.strokeStyle=cooling?'rgba(130,170,190,0.8)':'#7bdcff';
    ctx.beginPath(); ctx.ellipse(cx,cy,R,R*0.5,0,0,6.28); ctx.stroke();
    // hold-progress arc (fills clockwise from top); cooldown shows a dim ring only
    if(prog>0 && !cooling){
      ctx.globalAlpha=1; ctx.lineWidth=4; ctx.strokeStyle='#d6f4ff';
      ctx.beginPath(); ctx.ellipse(cx,cy,R*0.72,R*0.72*0.5,0,-1.5708,-1.5708+prog*6.2831853); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  }
}
function drawWinObjective(state,ox,oy){
  const wc=state.cfg && state.cfg.winCondition; if(!wc || state.over) return;
  const t=(wc.to||wc.at);
  const tm=state.time||0, pulse=0.6+0.4*Math.sin(tm*2.6);
  if(t){
    const x=(t.x+0.5)*TILE+ox, y=(t.y+0.5)*TILE+oy, R=(wc.radius!=null?wc.radius:2.2)*TILE;
    ctx.save();
    ctx.globalAlpha=0.28+0.18*pulse; ctx.strokeStyle='#ffd86b'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.ellipse(x,y,R,R*0.42,0,0,6.28); ctx.stroke();
    ctx.globalAlpha=0.16+0.1*pulse;
    ctx.beginPath(); ctx.ellipse(x,y,R*0.62,R*0.62*0.42,0,0,6.28); ctx.stroke();
    ctx.globalAlpha=0.5; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-60-14*pulse); ctx.stroke();
    ctx.globalAlpha=0.95; ctx.fillStyle='#ffd86b'; ctx.font='bold 12px '+GAME_FONT; ctx.textAlign='center';
    ctx.fillText(wc.type==='escort'?'⮕ DELIVER HERE':'◈ HOLD', x, y-66-14*pulse);
    ctx.restore(); ctx.globalAlpha=1;
  }
  if(wc.type==='escort'){
    for(const e of state.entities){
      if(!e._vip || e.dead || e.storedIn) continue;
      const vh=(typeof unitDrawH==='function')?unitDrawH(e):24;
      ctx.save(); ctx.globalAlpha=0.55+0.3*pulse; ctx.strokeStyle='#ffd86b'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(e.x+ox, e.y+oy+vh*0.3, vh*0.42, vh*0.17, 0,0,6.28); ctx.stroke();
      ctx.fillStyle='#ffd86b'; ctx.font='bold 10px '+GAME_FONT; ctx.textAlign='center';
      ctx.fillText('VIP', e.x+ox, e.y+oy-vh*0.95);
      ctx.restore();
    }
  }
}

// T1-3: the healer tether — additive purple beam with a white traveling orb and a soft green
// restore-pulse on the patient. Deterministic from state.time (no RNG; safe to draw anywhere).
function drawHealBeam(state, h, t, ox, oy){
  const start=(typeof muzzleWorld==='function')?muzzleWorld(h):{x:h.x,y:h.y-12};
  const x0=start.x+ox, y0=start.y+oy, x1=t.x+ox, y1=(t.y-((typeof unitDrawH==='function')?unitDrawH(t)*0.35:10))+oy;
  const tm=state.time||0;
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
  // soft outer tether + bright core
  ctx.globalAlpha=0.35; ctx.strokeStyle='#b48cff'; ctx.lineWidth=4.5; ctx.shadowColor='#b48cff'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
  ctx.globalAlpha=0.7; ctx.strokeStyle='#efe2ff'; ctx.lineWidth=1.6; ctx.shadowBlur=0;
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
  // traveling orb (healer → patient)
  const p=(tm*1.6+(h.id||0)*0.37)%1, qx=x0+(x1-x0)*p, qy=y0+(y1-y0)*p;
  const og=ctx.createRadialGradient(qx,qy,0,qx,qy,7);
  og.addColorStop(0,'rgba(255,255,255,0.9)'); og.addColorStop(0.5,'rgba(190,140,255,0.5)'); og.addColorStop(1,'rgba(190,140,255,0)');
  ctx.globalAlpha=1; ctx.fillStyle=og; ctx.beginPath(); ctx.arc(qx,qy,7,0,6.28); ctx.fill();
  // green restore-pulse on the patient
  const pr=0.5+0.5*Math.sin(tm*6+(t.id||0));
  ctx.globalAlpha=0.30+0.25*pr; ctx.strokeStyle='#7dffa8'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(x1, t.y+oy, 10+3*pr, 4.5+1.5*pr, 0, 0, 6.28); ctx.stroke();
  ctx.restore(); ctx.globalAlpha=1;
}

// Drawn WORLD-px sprite box of a depth entry that is a PROP (building / topography feature / mega
// landmark), or null for anything else (units, echoes, NPCs, goldmines). Used to detect which sprites
// would draw over a cutscene participant so they can be hidden for the cutscene's duration. Mirrors
// each draw path's box math: drawBuilding (incl. the Dark Tower's 'ao' art — buildingDrawBox without a
// sprite would fall back to the SHORT footprint box and miss a unit standing north of it), drawFeature,
// and drawOneMega — all bottom-anchored on the footprint ground line.
function csPropBox(state, d){
  if(d.b){
    const e=d.b, isTower=e.type==='darktower';
    const ao=(typeof aoSide==='function') && aoSide(state, e.owner);
    const spr=buildingSprite(e.type, e.owner, (ao||isTower)?'ao':null);
    return buildingDrawBox(e, spr);
  }
  if(d.f){
    const f=d.f, fw=Math.max(1,(f.w||FEAT_SIZE)|0), fh=Math.max(1,(f.h||FEAT_SIZE)|0);
    const bw=fw*TILE, bh=fh*TILE, ov=f.overhang||1.08, dw=bw*ov, dh=bh*ov*(f.heightScale||1);
    return { x:f.tx*TILE+(bw-dw)/2, y:(f.ty+fh)*TILE-dh+2, w:dw, h:dh };
  }
  if(d.m){
    const m=d.m, spr=(typeof megaSprite==='function') && megaSprite(m.cat, m.variant); if(!spr) return null;
    const ms=(typeof MEGA_SCALE==='number')?MEGA_SCALE:1;        // match drawOneMega's +25% so cutscene occlusion is correct
    const w=m.w*TILE, h=m.h*TILE, dw=w*(m.overhang||1.3)*ms, dh=dw*(spr.fh/spr.fw)*(m.heightScale||1);
    return { x:m.tx*TILE+(w-dw)/2, y:m.ty*TILE+h-dh+2, w:dw, h:dh };
  }
  if(d.chain){ const s=d.chain; return { x:s.bx-s.dw/2, y:s.by-s.dh, w:s.dw, h:s.dh }; }   // bottom-anchored chain sprite box
  return null;
}
function render(state){
  // REX jump-stomp / missile impacts / death FX set state._shake; offset the camera with a quick
  // decaying rumble (cosmetic). Decays HERE (render rate) so it works on every map and on clients.
  const _sh=state._shake||0, _t=state.time||0;
  if(_sh) state._shake = Math.max(0, _sh - (1/60)*(_sh>6?42:18));
  const z=state.zoom||1, vx=state.camX + (_sh?_sh*Math.sin(_t*47):0), vy=state.camY + (_sh?_sh*Math.cos(_t*41):0);

  // ---- phase 1: clear whole backing store in identity/device space ----
  if(PERF.on) PERF.mark('clear');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#05080d'; ctx.fillRect(0,0,cv.width,cv.height);
  if(PERF.on) PERF.lap('clear');

  // ---- HUB panorama loading scene (solo extraction cinematic): full-screen, replaces the
  //      world + HUD. The DOM HUD is hidden by body.scene-hubload while this phase plays. ----
  if(((state.extractFlight && state.extractFlight.phase==='panorama') || state.dispatchFlight) && typeof drawHubLoadingScene==='function'){
    if(PERF.on) PERF.mark('panorama');
    drawHubLoadingScene(state);
    if(PERF.on) PERF.lap('panorama');
    return;
  }

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
  if(PERF.on) PERF.mark('terrain');
  if(PERF.opts.terrainChunks && ATLAS_READY){
    renderTerrainChunks(state, z, x0,y0,x1,y1);
  } else {
    for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
      if(!state.explored[ty*state.W+tx]) continue;
      drawTile(state,tx,ty, tx*TILE+ox, ty*TILE+oy);
    }
  }
  if(PERF.on) PERF.lap('terrain');

  // ---- roads + sidewalks (HUB only): colored canvas tiles painted over terrain but UNDER the
  //      depth-sorted sprites, so buildings/units/NPCs occlude them. Gated on roadTiles existing. ----
  if(state.roadTiles){
    if(PERF.on) PERF.mark('roads');
    drawRoads(state, x0,y0,x1,y1);
    if(typeof drawHubWet==='function') drawHubWet(state, x0,y0,x1,y1);   // P7.5 wet neon-reflection on the carriageway
    if(PERF.on) PERF.lap('roads');
  }

  // ---- water/magma surface overlay: caustic shimmer + tide highlight + lava cracks/core (js/water.js) ----
  if(PERF.on) PERF.mark('water');
  if(typeof drawWater==='function') drawWater(state, x0,y0,x1,y1);
  if(state.hub && typeof drawHubOverlays==='function') drawHubOverlays(state, x0,y0,x1,y1);
  if(PERF.on) PERF.lap('water');

  // ---- ambient particles: BACK pass (low mist) — behind the depth-sorted sprites ----
  if(PERF.on) PERF.mark('partBack');
  if(typeof drawParticles==='function') drawParticles(state, x0,y0,x1,y1, 'back');
  if(PERF.on) PERF.lap('partBack');

  // ---- P5.4 combat-scorch decals (GROUND_DECAL band): transient dark marks where things died — on the
  //      ground, UNDER the shadow band + units. Render-only, pooled, fades out. ----
  drawScorches(state, ox, oy);

  // ---- buildings + mega sprites + units: ALL depth-sorted by ground-line Y so a unit
  //      BEHIND a tall building/landmark is occluded by it (drawn first) and a unit in
  //      FRONT draws over it. Sprite transparency makes the occlusion pixel-correct. ----
  if(PERF.on) PERF.mark('depthBuild');
  const depth=[];
  const mtnChains = (typeof getMountainChains==='function') ? getMountainChains(state) : null;   // cosmetic chain (cached); null → old per-rock render
  const mtnSkip = mtnChains && mtnChains.skip;
  if(state.megaSprites) for(const m of state.megaSprites) depth.push({y:megaSortY(m), m});
  // FEAT_SIZE walk-under topography features: cull to view + gate on explored BEFORE the sort
  // (a crammed map can have hundreds). Ground line = footprint bottom edge (ty+N)*TILE, so a
  // unit in a passable TOP row (smaller y) sorts first and is occluded → walks under the canopy.
  if(state.features){ for(const f of state.features){ const fw=Math.max(1,(f.w||FEAT_SIZE)|0), fh=Math.max(1,(f.h||FEAT_SIZE)|0);
    if(mtnSkip && mtnSkip.has(f)) continue;                            // mountain rock → drawn by the chain pass, not here
    if(f.tx+fw<=x0 || f.tx>=x1 || f.ty+fh<=y0 || f.ty>=y1) continue;   // AABB cull
    const sx=Math.max(0, Math.min(state.W-1, f.tx+(fw>>1))), sy=Math.max(0, Math.min(state.H-1, f.ty+fh-1));
    const si=sy*state.W + sx;                                          // one bottom-row sample cell (shared w/ minimap/fog)
    if(!state.explored[si]) continue;                                 // hidden until explored
    if(state.roadTiles && state.roadTiles[si]===1) continue;          // a road plowed through this grove → don't draw canopy over the asphalt
    depth.push({y:(f.ty+fh)*TILE, f, dim:state.visible[si]!==1});      // neutral scenery: dim when not visible
  } }
  // cosmetic MOUNTAIN-CHAIN sprites: dense overlapping massif per mountain cluster (replaces the per-rock
  // sprite skipped above). Cull by the sprite's box (crests poke up), gate on explored/road like features.
  if(mtnChains) for(const s of mtnChains.sprites){
    const sx0=s.bx-s.dw/2, sx1=s.bx+s.dw/2, sy0=s.by-s.dh, sy1=s.by;
    if(sx1<x0*TILE || sx0>x1*TILE || sy1<y0*TILE || sy0>y1*TILE) continue;   // AABB cull (world px)
    const si=s.tileY*state.W + s.tileX;
    if(!state.explored[si]) continue;
    if(state.roadTiles && state.roadTiles[si]===1) continue;
    depth.push({y:s.by, tie:s.tie, chain:s, dim:state.visible[si]!==1});
  }
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
      if(e.storedIn) continue;
      if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) continue;
      depth.push({y:e.y, u:e});
    } else if(e.kind==='echo'){
      depth.push({y:e.y, echo:e});                     // MADOSIS rescue memory beacon
    }
  }
  // living-city NPCs (hub only): viewport-culled, pre-allocated {y,n} entries so the
  // crowd Y-sorts correctly against buildings/units. Cosmetic, module-local (hub_npcs.js).
  if(state.hub && typeof HUBNPC!=='undefined') HUBNPC.collectDepth(state, x0,y0,x1,y1, depth, z);
  // MADOSIS: glowing purple memory ground-pools — painted BEFORE the depth-sorted sprites so
  // every unit/building draws over them (an AREA decal anchoring the beacon to the map). View-
  // culled; breath freezes under prefers-reduced-motion (T1-5).
  for(const e of state.entities){
    if(e.dead || e.kind!=='echo' || e.reached) continue;
    const _rm=(typeof megaReducedMotion==='function'&&megaReducedMotion());
    const R=TILE*2.6*(_rm?1:0.92+0.08*Math.sin((state.time||0)*2+(e.id||0)));
    if(e.x+R<x0*TILE || e.x-R>x1*TILE || e.y+R<y0*TILE || e.y-R>y1*TILE) continue;
    const px=e.x+ox, py=e.y+oy;
    megaFillEllipseGlow(px, py, R, R*0.55, 0, [176,91,255], 0.30, 0.12);
    ctx.globalAlpha=_rm?0.4:0.30+0.15*Math.sin((state.time||0)*2+(e.id||0));
    ctx.strokeStyle='#b05bff'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(px,py,R*0.8,R*0.44,0,0,6.28); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if(PERF.on){ PERF.lap('depthBuild'); PERF.mark('depthSort'); }
  depth.sort((a,b)=> (a.y-b.y) || ((a.tie||0)-(b.tie||0)));   // tiebreak: deterministic (coord-derived) so overlapping chain sprites layer identically cross-peer
  // ---- cutscene occluder suppression: while a flash cutscene plays, hide any building / landmark /
  //      topography sprite that would draw OVER a participating character, so the scene's characters
  //      are always visible (e.g. the Dark Tower vanishes while Biba & Nino speak at its base). A prop
  //      occludes a participant when it sorts AFTER them (draws on top: p.sy < ground line) AND its
  //      drawn box covers their body. Purely render-side, derived LIVE from state.flashCutscene each
  //      frame onto the per-frame `depth` entries → the instant the cutscene ends the prop draws
  //      normally again. No entity flags, nothing to restore, cannot leak. Solo off-hub only. ----
  if(state.flashCutscene && !state.hub && typeof cutsceneParticipants==='function'){
    const ps=cutsceneParticipants(state);
    if(ps && ps.length){
      const pts=ps.map(u=>{ const vh=unitDrawH(u); return { x:u.x, y:u.y-vh*0.35, sy:u.y }; });
      for(const d of depth){
        if(!(d.b||d.f||d.m||d.chain)) continue;
        const bx=csPropBox(state, d); if(!bx) continue;
        const gy=bx.y+bx.h;
        for(const p of pts){
          if(p.sy<gy && p.x>=bx.x && p.x<=bx.x+bx.w && p.y>=bx.y && p.y<=bx.y+bx.h){ d._csHide=true; break; }
        }
      }
    }
  }
  if(PERF.on){ PERF.lap('depthSort'); PERF.mark('depthDraw'); }
  // ---- P0.4 contact-shadow band (LAYER.SHADOW): a soft cached blob under each GROUND unit's feet, drawn
  //      UNDER all actors (own band, before the depth draw) so shadows never sit on top of a nearer sprite.
  //      One light dir (slight down-right offset); flyers skipped; cosmetic/local/deterministic. ?noshadows=1. ----
  if(RENDER.shadows && z>=SPRITE_LOD_ZOOM*0.7){
    const sp=shadowSprite(); ctx.globalAlpha=0.45;
    for(const d of depth){ const u=d.u; if(!u || u.air) continue;
      const vh=unitDrawH(u), fx=u.x+ox, fy=u.y+oy+vh*0.30;        // foot line — matches the selection ring (py + vh*0.3)
      const rx=vh*0.34, ry=vh*0.13;
      ctx.drawImage(sp, fx-rx+vh*0.04, fy-ry+vh*0.02, rx*2, ry*2); // tiny offset = consistent light from upper-left
    }
    ctx.globalAlpha=1;
  }
  // mountain-chain base HAZE: a soft dark pool under each chain sprite's foot (cached gradient sprite, no
  // per-frame alloc) so dense overlapping silhouettes read as one grounded massif. Drawn UNDER the sprites.
  if(mtnChains && mtnChains.sprites.length){
    const hz=mtnHazeSprite(); ctx.globalAlpha=0.4;
    for(const s of mtnChains.sprites){ const fx=s.bx+ox, fy=s.by+oy, rw=s.dw*0.6, rh=s.dw*0.14;
      if(fx+rw<0 || fx-rw>cv.width || fy+rh<0 || fy-rh>cv.height) continue;
      ctx.drawImage(hz, fx-rw, fy-rh*1.2, rw*2, rh*2); }
    ctx.globalAlpha=1;
  }
  // P3.1: tiles a unit stands on this frame → drawFeature fades a canopy when a unit walks UNDER it.
  _unitTileSet.clear();
  for(const d of depth){ const u=d.u; if(!u) continue; _unitTileSet.add(((u.y/TILE)|0)*state.W + ((u.x/TILE)|0)); }
  for(const d of depth){
    if(d._csHide) continue;                            // cutscene: this sprite would cover a participant → hide it
    if(d.b) drawBuilding(state, d.b, ox,oy, d.dim);
    else if(d.m) drawOneMega(state, d.m, ox,oy, x0,y0,x1,y1);
    else if(d.chain) drawMtnChainSprite(state, d.chain, ox,oy, d.dim);
    else if(d.f) drawFeature(state, d.f, ox,oy, d.dim);
    else if(d.g) drawGoldmine(state, d.g, ox,oy, d.dim);
    else if(d.echo) drawEcho(state, d.echo, ox,oy);
    else if(d.n) HUBNPC.drawOne(state, d.n);           // living-city NPC (hub only)
    else drawUnit(state, d.u, ox,oy);
  }
  // ---- occluded-unit ghosts: building sprites draw BUILDING_DRAW_SCALE× their footprint, so
  //      they spill over passable tiles beside them. Any unit Y-sorted BEHIND a building whose
  //      sprite box covers it gets a faint redraw on top (plus its selection ring) so big
  //      structures never swallow units. Cosmetic + local — identical on solo/host/client. ----
  {
    let occ=null;
    for(const d of depth){
      if(!d.b || d._csHide || d.b.hubSpriteVisual || d.b.hubMegaVisual) continue;   // _csHide: tower already suppressed for the cutscene
      const bb=buildingDrawBox(d.b);
      if(bb.w<=d.b.w*TILE) continue;                       // footprint fallback → no spill
      (occ||(occ=[])).push({x:bb.x, y:bb.y, w:bb.w, h:bb.h, gy:(d.b.ty+d.b.h)*TILE});
    }
    if(occ) for(const d of depth){
      const u=d.u, lb=u && u._ghostBlit;
      if(!lb || lb.t!==state.time || u._ninjaHidden) continue;
      const wx=u.x, wy=lb.py-oy-lb.S*0.2;                  // sprite center-ish (box y∈[-0.7S,+0.3S])
      let hit=false;
      for(const b of occ){ if(u.y<b.gy && wx>=b.x && wx<=b.x+b.w && wy>=b.y && wy<=b.y+b.h){ hit=true; break; } }
      if(!hit) continue;
      ctx.save(); ctx.globalAlpha*=0.45;
      if(u.selected){ ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(lb.px, lb.py+lb.S*0.3, lb.S*0.34, lb.S*0.14, 0,0,6.28); ctx.stroke(); }
      rotBegin(u, lb.px, lb.py, lb.S); blitFrame(u, lb.px, lb.py, lb.anim, lb.S, lb.fi); rotEnd(u);
      ctx.restore();
    }
  }
  if(PERF.on) PERF.lap('depthDraw');
  // boss-occlusion overlay: a giant boss (REX, 4× scale) is Y-sorted in FRONT of any player unit
  // standing behind its feet, painting over the unit AND its hp bar so you can't see or micro it.
  // This repaints every hidden player unit as a SOLID, opaque silhouette + hp bar ON TOP of the boss.
  // The boss sprite is never read, dimmed, or made transparent. See drawBossOcclusionOverlay.
  if(typeof drawBossOcclusionOverlay==='function') drawBossOcclusionOverlay(state, ox, oy);
  // Training Grounds: trainees are storedIn (skipped by the depth loop) — draw them live, on
  // top of the facility, standing on their shooting-range lanes.
  if(state.hub && typeof drawHubTrainees==='function') drawHubTrainees(state, ox, oy);
  if(state.extractFlight && typeof drawExtractionFlight==='function') drawExtractionFlight(state);
  // EX-TERMINATOR escape: the A&O (black+green) Buzzword Bomber that airlifts the beaten boss out — drawn over
  // the frozen cutscene, its world position driven by bossExtractFrame's clock so it stays in sync with the
  // death lines. Still in world space (camera transform active), so world coords map through camera/zoom.
  if(state.bossExtract && typeof bossExtractFrame==='function' && typeof unitWalk==='function' && typeof blitFrame==='function'){
    const f=bossExtractFrame(state);
    if(f && f.bomberVisible){
      const anim=unitWalk('bomber','enemy','ao') || unitWalk('bomber','enemy');
      if(anim && anim.ready){
        const h=(typeof UNIT_SPRITE_H!=='undefined' && UNIT_SPRITE_H.bomber)||153.6;
        blitFrame({type:'bomber', _face:f.bomberFace}, f.bomberX, f.bomberY-16, anim, h, (((state.time||0)*8)|0)%anim.frames.length);
      }
    }
  }

  // ---- ambient particles: FRONT pass (fireflies/embers/snow/dust/motes) — over the sprites ----
  if(PERF.on) PERF.mark('partFront');
  if(typeof drawParticles==='function') drawParticles(state, x0,y0,x1,y1, 'front');
  // ---- P6.3 drifting weather haze (weather biomes only; very subtle, QUAL/reduced-motion gated) ----
  if(typeof drawWeatherPlane==='function') drawWeatherPlane(state, x0,y0,x1,y1);
  if(typeof drawHubRain==='function') drawHubRain(state);                       // P7.5 HUB rain (screen-space, over the scene)
  // ---- P6.2 animated painted light: god-ray shafts off emissive landmarks + per-biome flicker glows ----
  if(PERF.on) PERF.mark('lightfx');
  if(typeof drawLightFX==='function') drawLightFX(state, ox,oy, x0,y0,x1,y1);
  if(PERF.on) PERF.lap('lightfx');

  // ---- HUB decorative drones: a dedicated pass AFTER the depth sort so they fly on top of
  //      every building (even the tallest HQ), drawn small + high. Cosmetic, module-local. ----
  if(state.hub && typeof drawHubDrones==='function') drawHubDrones(state);
  if(PERF.on){ PERF.lap('partFront'); PERF.mark('laser'); }

  // ---- laser shot FX: glowing bolts from each shooter's gun muzzle to its target ----
  for(const e of state.entities){
    if(e.dead||e.storedIn) continue;
    const sf=e.shootFx;
    if(!(sf && sf.t>0)) continue;
    // hide beams from enemy units we can't currently see (matches the enemy-unit fog cull)
    if(e.owner==='enemy' && e.kind==='unit' && !isVisiblePix(state,e.x,e.y)){ sf.t-=1/60; continue; }
    const start = e.kind==='building' ? buildingMuzzle(e) : muzzleWorld(e);
    const charge = (e.type==='auditor' && e.sieged);
    const w = 2.2 * (e.kind==='building' ? 1.35 : unitDrawH(e)/64) * muzzleW(e);   // big mechs read larger
    // T0-3: a FRESH bolt (first frame, before the decay below) fires the laser SFX — works on all
    // three net paths because clients rebuild shootFx with t=SHOOTFX_LIFE from snapshots.
    if(sf.t===SHOOTFX_LIFE && typeof SFX!=='undefined') SFX.laser(e);
    const p = Math.min(1, Math.max(0, 1 - sf.t/SHOOTFX_LIFE));
    drawLaserBolt(start.x+ox, start.y+oy, sf.x+ox, sf.y+oy, isRedSide(e.owner), w, p, charge);
    sf.t-=1/60;
  }

  // ---- heal beams (T1-3): a purple/white tether from each ACTIVE healer to its patient, with a
  //      traveling orb + a soft green pulse on the target. Cosmetic; capped + culled. The target
  //      comes from sim state on host/solo and from the snapshot cmd-ref (or a local nearest-wounded
  //      fallback) on clients, which never simulate. ----
  {
    let _beams=0;
    for(const e of state.entities){
      if(_beams>=8) break;
      if(e.dead||e.storedIn||e.kind!=='unit'||e._actState!=='heal') continue;
      if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) continue;
      let t=e._healTarget || (e.cmd && e.cmd.target);
      if(!t || t.dead || t.hp>=t.maxHp){
        t=null; const def=DEF[e.type]||{}, R=((def.range||4)*TILE+26); let bd=R*R;   // client fallback: nearest wounded ally
        for(const o of state.entities){ if(o.dead||o.storedIn||o.owner!==e.owner||o.kind!=='unit'||o===e||o.hp>=o.maxHp) continue;
          const dx=o.x-e.x,dy=o.y-e.y,dd=dx*dx+dy*dy; if(dd<bd){bd=dd;t=o;} }
      }
      if(!t) continue;
      if(!entOnScreen(state,e,TILE*3) && !entOnScreen(state,t,TILE*3)) continue;
      drawHealBeam(state, e, t, ox, oy);
      _beams++;
    }
  }

  // ---- fog overlay ----
  if(PERF.on){ PERF.lap('laser'); PERF.mark('fog'); }
  drawFog(state,ox,oy,x0,y0,x1,y1);
  if(PERF.on){ PERF.lap('fog'); PERF.mark('overlays'); }

  // ---- H.U.B. night tint: one low-alpha world-space fill driven by the city clock
  //      (hub_npcs.js). Rings/labels/dialogs draw above it so UI reads stay bright. ----
  if(state.hub && typeof HUBNPC!=='undefined'){
    const _na=HUBNPC.nightAlpha();
    if(_na>0.004){
      ctx.fillStyle='rgba(10,16,38,'+_na.toFixed(3)+')';
      ctx.fillRect(vx, vy, viewW()/z, viewH()/z);
    }
  }

  // ---- P2 post stack (per-biome grade + warm focal pool + vignette): screen-space, over terrain/actors/fog/
  //      night-tint but UNDER the world-space gameplay UI below (rings, floaters, beacons, dialogs) so those
  //      stay crisp & legible. QUAL-gated (off at level ≥2); cached gradients; toggles ?nograde=1 ?novignette=1. ----
  applyPostStack(state, z, vx, vy);

  // ---- placement ghost ----
  if(state.placing){ drawPlacement(state,ox,oy); }

  // ---- selection ring effects ----
  drawRings(ox,oy);

  // ---- floating damage/heal numbers (T0-4) — additive, above the sprites ----
  drawFloaters(state,ox,oy);

  // ---- level-up promotion arrows (cosmetic) — hop beside the unit's bars on a star gain ----
  if(typeof drawLevelArrows==='function') drawLevelArrows(state,ox,oy);

  // ---- alt-win objective beacon + escort VIP marker (T2-1) — gold, fog-independent (it's YOUR objective) ----
  drawWinObjective(state,ox,oy);

  // ---- BOSS coolant nodes (cfg.bossNodes) — hold one to force the boss's EXPOSED window; world-space ground marker ----
  if(typeof drawBossNodes==='function') drawBossNodes(state,ox,oy);

  // ---- H.U.B. locate beacon (condo-card "find them" ping) — world space, above sprites ----
  if(state.hub && typeof drawHubLocatePing==='function') drawHubLocatePing(state, ox, oy);

  // ---- in-world unit dialog boxes — drawn last in world space, above every sprite ----
  if(typeof drawDialogs==='function') drawDialogs(state);

  // ---- tutorial focus ring (pulsing target over a goldmine / enemy / HQ) — world space ----
  if(typeof TUTORIAL!=='undefined') TUTORIAL.drawWorld(state);

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
  // ---- MADOSIS: off-screen edge arrows pointing to un-recovered memory echoes (so they're findable
  //      even when scattered far from the dog). Screen space (CSS px); world->screen matches phase 2. ----
  if(!state.hub){
    const m=26, vW=viewW(), vH=viewH();
    const L=m, R=vW-m, T=VIEW_TOP+m, B=VIEW_TOP+vH-m, cx0=vW/2, cy0=VIEW_TOP+vH/2;
    for(const e of state.entities){
      if(e.dead || e.kind!=='echo' || e.reached) continue;
      const sx=(e.x-vx)*z, sy=VIEW_TOP+(e.y-vy)*z;
      if(sx>=0 && sx<=vW && sy>=VIEW_TOP && sy<=VIEW_TOP+vH) continue;   // on-screen → beacon already shows it
      let dx=sx-cx0, dy=sy-cy0; if(!dx && !dy) continue;
      const sX = dx>0 ? (R-cx0)/dx : dx<0 ? (L-cx0)/dx : Infinity;
      const sY = dy>0 ? (B-cy0)/dy : dy<0 ? (T-cy0)/dy : Infinity;
      const s=Math.min(sX,sY), ax=cx0+dx*s, ay=cy0+dy*s;
      const col='#b05bff';   // purple — the madosis color language (facet reads on the beacon itself)
      const pulse=0.7+0.3*Math.sin((state.time||0)*4+(e.id||0));
      ctx.save(); ctx.translate(ax,ay); ctx.rotate(Math.atan2(dy,dx));
      ctx.globalAlpha=0.92; ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=10*pulse;
      ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(-7,-8); ctx.lineTo(-7,8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }
  if(state.hub && typeof hubCameraInWasteland==='function' && hubCameraInWasteland(state)){
    ctx.fillStyle='rgba(120,20,24,0.16)';
    ctx.fillRect(0,0,viewW(),cssH);
  }
  if(typeof isGamePaused==='function' && isGamePaused()) drawPausedOverlay();
  // Episode VII "flash": full-screen nuke cinematic over the (shaken, dying) world. Manages its own
  // device-space transform; the DOM HUD is hidden by body.scene-flash while this phase plays.
  if(((state.extractFlight && state.extractFlight.phase==='nuke') || (state.cinematic && state.cinematic.kind==='nuke')) && typeof drawNukeFinale==='function') drawNukeFinale(state);
  ctx.setTransform(1,0,0,1,0,0);
  if(PERF.on){ PERF.lap('overlays'); PERF.mark('minimap'); }

  renderMinimap(state);   // separate canvas — unaffected by the #cv transform
  if(PERF.on) PERF.lap('minimap');
}

function drawPausedOverlay(){
  const w=viewW(), h=viewH(), y0=VIEW_TOP;
  ctx.fillStyle='rgba(34, 0, 8, 0.58)';
  ctx.fillRect(0,y0,w,h);
  ctx.fillStyle='rgba(120, 0, 18, 0.18)';
  ctx.fillRect(0,y0,w,h);

  const now=(typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
  
  // Broken-bulb flicker: mostly steady, rarely sputters in uneven bursts.
  // Render-only effect. Do not use Math.random here, so gameplay determinism is untouched.
  const t = Math.floor(now / 90);
  const burstSeed = Math.floor(now / 2600);
  const inRareBurst = ((burstSeed * 1103515245 + 12345) >>> 0) % 7 === 0;
  let blink = 1;

  if (inRareBurst) {
    const phase = t % 29;

    if (
      phase === 1 ||
      phase === 2 ||
      phase === 6 ||
      phase === 11 ||
      phase === 12 ||
      phase === 19
    ) {
      blink = 0.16;
    } else if (
      phase === 3 ||
      phase === 7 ||
      phase === 20
    ) {
      blink = 0.48;
    }
  }
  
  const size=Math.max(34, Math.min(86, Math.round(w*0.055)));
  const text='PAUSED';
  const spacing=Math.max(5, Math.round(size*0.18));
  ctx.save();
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font='700 '+size+'px '+GAME_MONO_FONT;
  const chars=[...text];
  const widths=chars.map(ch=>ctx.measureText(ch).width);
  const total=widths.reduce((a,b)=>a+b,0)+spacing*(chars.length-1);
  let x=(w-total)/2, cy=y0+h/2;
  ctx.globalAlpha=blink;
  ctx.shadowColor='rgba(255, 40, 56, 0.95)';
  ctx.shadowBlur=18;
  ctx.fillStyle='rgba(255,255,255,0.96)';
  for(let i=0;i<chars.length;i++){
    const cw=widths[i];
    ctx.fillText(chars[i], x+cw/2, cy);
    x+=cw+spacing;
  }
  ctx.globalAlpha=0.75*blink;
  ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255, 82, 82, 0.9)';
  ctx.lineWidth=1.2;
  ctx.beginPath();
  ctx.moveTo(w*0.35, cy+size*0.74);
  ctx.lineTo(w*0.65, cy+size*0.74);
  ctx.stroke();
  ctx.restore();
}

// Blit an atlas cell with a per-tile orientation derived from `variant`, to break
// the visible repetition of a single tile across a field. `full` (floor) uses all
// 8 symmetries (4 rotations × mirror — valid since floors are seamless+flat); a
// feature (rock/tree) only mirrors horizontally so it keeps its "up".
// Oriented atlas-tile blit into an ARBITRARY context g (the main ctx for live drawing, or a chunk's ctx
// for the terrain cache bake). Identical geometry either way, so the cache reproduces the live output.
function _blitOrientedTo(g, img, r, px, py, v, full){
  const S = TILE+1;
  if(!full){                                  // feature: optional horizontal mirror only
    if(v<0.5){ g.drawImage(img, r[0],r[1],r[2],r[3], px,py, S,S); return; }
    g.save(); g.translate(px+S/2, py+S/2); g.scale(-1,1);
    g.drawImage(img, r[0],r[1],r[2],r[3], -S/2,-S/2, S,S); g.restore(); return;
  }
  const o=(v*4)|0;                            // 0..3 quarter-turns
  g.save(); g.translate(px+TILE/2, py+TILE/2); g.rotate(o*1.5708);
  if(((v*8)|0)&1) g.scale(-1,1);              // half also mirror → 8 orientations
  g.drawImage(img, r[0],r[1],r[2],r[3], -S/2,-S/2, S,S); g.restore();
}
function blitTileOriented(r, px, py, v, full){ _blitOrientedTo(ctx, ATLAS_IMG, r, px, py, v, full); }

/* ===== terrain chunk cache (PERF.opts.terrainChunks) ============================================
   Bakes the STATIC atlas terrain (floor/rock/tree) of a TC_SIZE×TC_SIZE-tile chunk into an offscreen
   canvas at the CURRENT device resolution (zoom×dpr). Each frame we then blit ~O(visible chunks) images
   instead of re-drawing ~O(visible tiles) atlas cells — the win for big maps fully zoomed out. The bake
   uses the SAME one-pass atlas→device scaling as the live path, so chunk content matches; only a fractional
   camera offset adds a sub-pixel resample at blit time (measured small). Water + procedural-fallback tiles
   animate, so they're recorded as "live" and drawn on top under the world transform. Whole-cache invalidate
   on zoom/dpr/map change; per-chunk re-bake when its explored-tile count changes (fog reveal). Atlas-only. */
const TC_SIZE = 8;
let _tcCache = new Map();           // "cx,cy" -> {cnv, live:[[tx,ty],…], cnt}
let _tcFor = null, _tcZoom = 0, _tcDpr = 0;
function _tcExploredCount(state, ccx, ccy){
  const W=state.W, H=state.H, ex=state.explored;
  const tx0=ccx*TC_SIZE, ty0=ccy*TC_SIZE, tx1=Math.min(W,tx0+TC_SIZE), ty1=Math.min(H,ty0+TC_SIZE);
  let n=0; for(let ty=ty0;ty<ty1;ty++){ const row=ty*W; for(let tx=tx0;tx<tx1;tx++) if(ex[row+tx]) n++; }
  return n;
}
function _tcBake(state, ccx, ccy, z, cnt){
  const sc=z*dpr, S=TILE+1;
  const dev=Math.max(1, Math.ceil((TC_SIZE*TILE+1)*sc));   // +1 tile-overscan so chunk edges abut like live tiles
  const cnv=document.createElement('canvas'); cnv.width=dev; cnv.height=dev;
  const g=cnv.getContext('2d'); g.scale(sc,sc);            // draw in world units → device resolution (one-pass, matches live)
  const live=[], W=state.W,H=state.H;
  const tx0=ccx*TC_SIZE, ty0=ccy*TC_SIZE, tx1=Math.min(W,tx0+TC_SIZE), ty1=Math.min(H,ty0+TC_SIZE);
  for(let ty=ty0;ty<ty1;ty++) for(let tx=tx0;tx<tx1;tx++){
    const i=ty*W+tx; if(!state.explored[i]) continue;
    const t=state.tiles[i];
    if(t===T_WATER){ live.push([tx,ty]); continue; }        // animated water → live overlay
    const b=state.biome[i], v=state.variant[i];
    const slot=t===T_ROCK?'rock':t===T_TREE?'tree':'floor';
    let img=ATLAS_IMG, r=null;
    if(slot==='floor' && typeof FLOOR_VAR_READY!=='undefined' && FLOOR_VAR_READY){   // P1.1/P1.2: hash-pick a floor variant (coords-only → co-op safe)
      const fr=floorVarRect(b, (h2(tx,ty)*FLOOR_VAR_N)|0); if(fr){ img=FLOOR_VAR_IMG; r=fr; }
    }
    if(!r) r=spriteFor(b,slot);
    if(!r){ live.push([tx,ty]); continue; }                 // procedural fallback (atlas missing / volcanic anim) → live
    _blitOrientedTo(g, img, r, (tx-tx0)*TILE, (ty-ty0)*TILE, v, slot==='floor');
  }
  // ---- P1.3 grunge overlay (baked): one world-anchored, seamless dark mottle over the whole chunk to break
  //      the tile grid. Tileable (period P) + offset by world origin → continuous across chunk seams. Darken-only
  //      (never bright). Baked into the chunk → zero scroll cost. Toggle: ?nogrunge=1. ----
  if(RENDER.grunge){
    const gt=grungeTex(), P=512, ww=TC_SIZE*TILE;
    const ax=(((tx0*TILE)%P)+P)%P, ay=(((ty0*TILE)%P)+P)%P;
    for(let yy=-ay; yy<ww; yy+=P) for(let xx=-ax; xx<ww; xx+=P) g.drawImage(gt, xx, yy);
  }
  // ---- P5 decal scatter (baked): debris/cracks/scorch on the ground, world-anchored + deterministic so they
  //      cross tile/chunk seams seamlessly. Drawn after grunge, under the live water/feature overlays. ----
  bakeDecals(g, state, tx0, ty0);
  return { cnv, live, cnt };
}

/* P6.3 — DRIFTING WEATHER PLANE (live, free): a slow-scrolling soft cloud haze over the WEATHER biomes only
   (volcanic heat-smoke, ice cold-fog, desert dust, tech digital haze) — adds atmospheric depth that pairs
   with the P6.1 particle field. Very low alpha so it never washes units (§11), world-anchored + time-drift,
   biome-tinted, QUAL-gated, off under reduced motion. Temperate grass/mountain/water get NONE (same rule as
   the particle field — no source = looks strange). ?nohaze=1. */
const _fogCache={};
function fogTex(tint){
  if(_fogCache[tint]) return _fogCache[tint];
  const rgb=tint.split(',').map(Number), P=256, c=document.createElement('canvas'); c.width=c.height=P;
  const g=c.getContext('2d'), img=g.createImageData(P,P), d=img.data, K=6.2831853/P;
  const T=[[1,0,0.0],[0,1,1.1],[2,1,2.3],[1,2,0.6],[2,2,4.0]];   // low-freq integer waves → soft, seamless clouds
  for(let y=0;y<P;y++) for(let x=0;x<P;x++){
    let v=0; for(let k=0;k<T.length;k++) v+=Math.sin((T[k][0]*x+T[k][1]*y)*K+T[k][2]); v/=T.length;  // ~[-1,1]
    const a=Math.max(0,v); const i=(y*P+x)*4; d[i]=rgb[0]; d[i+1]=rgb[1]; d[i+2]=rgb[2]; d[i+3]=(a*a*255)|0;  // soft (a²) light-half clouds
  }
  g.putImageData(img,0,0); _fogCache[tint]=c; return c;
}

/* ===== P6.2 animated painted light (cosmetic) — drawLightFX: a soft additive light BLOOM (halo) off
   emissive landmarks + per-biome flicker glows on the §6 terrain signatures that are still STATIC. The game's
   neon/lava/hero/Dark-Tower-storm already animate, so this ONLY adds the landmark bloom + mountain ore-vein /
   tech data-seam / desert cactus-ember flicker. Render-only, additive, gated (?nolightfx / reduced-motion /
   QUAL>=2), ZERO per-frame alloc (cached per-color sprites). Anchors derive from seed-stable megaSprites/
   scenery/features; animation phase from state.time + coord-hash (no Math.random) → per-peer-safe. ===== */
const LIGHTFX_COLORS = { ember:[255,120,40], cyan:[80,220,255], violet:[170,120,235], green:[74,238,96] };
const LIGHTFX = { maxRayAnchors:4, bloomAlphaMin:0.05, bloomAlphaMax:0.16,
                  maxGlows:120, glowAlpha:0.24 };   // bloom = soft landmark HALO (no shafts); glow = per-biome flicker. alpha=intensity (tune freely; size/caps = the fill-rate dial).
const _bloomCache={};
function lightBloomSprite(key){         // ONE soft radial bloom (no shafts). key = named color OR an [r,g,b] (mega's own neon)
  const isArr=Array.isArray(key), ck=isArr?(key[0]+'_'+key[1]+'_'+key[2]):key;
  if(_bloomCache[ck]) return _bloomCache[ck];
  const rgb=isArr?key:(LIGHTFX_COLORS[key]||[255,255,255]), R=80, c=document.createElement('canvas'); c.width=c.height=R*2;
  const g=c.getContext('2d'), gr=g.createRadialGradient(R,R,1,R,R,R), s=rgb[0]+','+rgb[1]+','+rgb[2];
  gr.addColorStop(0,'rgba('+s+',0.62)'); gr.addColorStop(0.30,'rgba('+s+',0.26)');
  gr.addColorStop(0.62,'rgba('+s+',0.08)'); gr.addColorStop(1,'rgba('+s+',0)');   // very soft, feathered to nothing
  g.fillStyle=gr; g.fillRect(0,0,R*2,R*2); _bloomCache[ck]=c; return c;
}
const _gdotCache={};
function glowDot(key){                 // small soft radial glow (cached per color)
  if(_gdotCache[key]) return _gdotCache[key];
  const rgb=LIGHTFX_COLORS[key]||[255,255,255], R=24, c=document.createElement('canvas'); c.width=c.height=R*2;
  const g=c.getContext('2d'), gr=g.createRadialGradient(R,R,1,R,R,R), s=rgb[0]+','+rgb[1]+','+rgb[2];
  gr.addColorStop(0,'rgba('+s+',0.9)'); gr.addColorStop(0.5,'rgba('+s+',0.34)'); gr.addColorStop(1,'rgba('+s+',0)');
  g.fillStyle=gr; g.fillRect(0,0,R*2,R*2); _gdotCache[key]=c; return c;
}
const MTN_RAYCOL = { volcano:'ember', megabuilding:'cyan', mountain:'violet' };   // emissive mega categories
function drawLightFX(state, ox,oy, x0,y0,x1,y1){
  if(!RENDER.lightfx) return;
  if(typeof megaReducedMotion==='function' && megaReducedMotion()) return;        // reduced-motion → no animated light
  if(typeof QUAL!=='undefined' && QUAL && QUAL.level>=2) return;                  // drop the pass under sustained load
  const t=state.time||0, W=state.W, Hh=state.H;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  // (1) soft light BLOOM off emissive landmarks (nearest N on-screen) — a single feathered halo, no shafts
  const anchors=[], camCx=((x0+x1)*0.5)*TILE, camCy=((y0+y1)*0.5)*TILE;
  if(state.megaSprites) for(const m of state.megaSprites){
    const col=((typeof megaNeonColor==='function') && megaNeonColor(m)) || MTN_RAYCOL[m.cat];   // bloom == the mega's OWN neon color
    if(!col) continue;
    if(m.tx+m.w<=x0 || m.tx>=x1 || m.ty+m.h<=y0 || m.ty>=y1) continue;            // AABB cull
    const cx=(m.tx+m.w/2)*TILE, topY=(m.ty - m.h*0.3)*TILE;
    anchors.push({cx, topY, col, size:m.w*TILE, seed:(m.seed||0), d:(cx-camCx)*(cx-camCx)+(topY-camCy)*(topY-camCy)}); }
  if(state.entities) for(const e of state.entities){ if(e.dead || e.type!=='darktower') continue;   // Dark Tower (green A&O)
    const tw=(e.w||6), th=(e.h||5), cx=e.x, topY=e.y-th*TILE*1.6;
    if(cx<x0*TILE-300 || cx>x1*TILE+300 || topY>y1*TILE) continue;
    anchors.push({cx, topY, col:'green', size:tw*TILE*1.4, seed:0.37, d:(cx-camCx)*(cx-camCx)+(topY-camCy)*(topY-camCy)}); }
  anchors.sort((a,b)=>a.d-b.d);
  const nA=Math.min(LIGHTFX.maxRayAnchors, anchors.length);
  for(let ai=0; ai<nA; ai++){ const a=anchors[ai], spr=lightBloomSprite(a.col), br=megaBreath(t, a.seed);
    ctx.globalAlpha=LIGHTFX.bloomAlphaMin + (LIGHTFX.bloomAlphaMax-LIGHTFX.bloomAlphaMin)*br;   // gentle breath
    const bw=Math.max(80, a.size*1.7), bh=Math.max(100, a.size*2.1);     // taller-than-wide → light rises off the landmark
    ctx.drawImage(spr, a.cx+ox-bw/2, a.topY+oy-bh*0.66, bw, bh);          // one soft halo over/above it — no shafts, no claw
  }
  ctx.globalAlpha=1;
  // (2) per-biome FLICKER GLOWS on currently-static terrain signatures (mountain ore-vein / tech seam / desert ember)
  let n=0;
  if(state.features) for(const f of state.features){ if(n>=LIGHTFX.maxGlows) break;
    if(f.base) continue;
    let col=null; if(f.biome===B_MOUNTAIN && f.slot==='rock') col='violet';
      else if(f.biome===B_TECH && f.slot==='rock') col='cyan';
      else if(f.biome===B_DESERT && f.slot==='tree') col='ember'; else continue;
    if(f.tx+FEAT_SIZE<=x0 || f.tx>=x1 || f.ty+FEAT_SIZE<=y0 || f.ty>=y1) continue;
    const sx=Math.max(0,Math.min(W-1,f.tx+(FEAT_SIZE>>1))), sy=Math.max(0,Math.min(Hh-1,f.ty+FEAT_SIZE-1)), si=sy*W+sx;
    if(!state.explored[si]) continue;
    const ph=h2(f.tx,f.ty), a=LIGHTFX.glowAlpha*(0.55+0.45*megaBreath(t,ph))*megaNeonFlicker(t,ph*1.3,0.7)*(state.visible[si]!==1?0.5:1);
    n++; if(a<0.012) continue;
    const gx=(f.tx+FEAT_SIZE/2)*TILE+ox, gy=(f.ty+1.1)*TILE+oy, R=TILE*1.7;
    ctx.globalAlpha=a; ctx.drawImage(glowDot(col), gx-R, gy-R, R*2, R*2);
  }
  ctx.globalAlpha=1; ctx.restore();
}

const WEATHER = {
  [B_VOLCANIC]: { tint:'255,150,95',  a:0.05,  sp:7 },   // heat smoke
  [B_ICE]:      { tint:'200,225,242', a:0.06,  sp:5 },   // cold fog
  [B_DESERT]:   { tint:'212,186,128', a:0.05,  sp:10 },  // dust haze
  [B_TECH]:     { tint:'120,205,228', a:0.035, sp:4 },   // digital haze
};
function drawWeatherPlane(state, x0,y0,x1,y1){
  if(!RENDER.haze) return;
  if(typeof megaReducedMotion==='function' && megaReducedMotion()) return;
  if(typeof QUAL!=='undefined' && QUAL && QUAL.level>=2) return;
  const z=state.zoom||1, cwx=state.camX+(viewW()/z)/2, cwy=state.camY+(viewH()/z)/2;
  const ctx2=Math.max(0,Math.min(state.W-1,(cwx/TILE)|0)), cty=Math.max(0,Math.min(state.H-1,(cwy/TILE)|0));
  const w=WEATHER[state.biome[cty*state.W+ctx2]]; if(!w) return;   // weather biomes only
  const tex=fogTex(w.tint), P=256, t=state.time||0;
  const wx0=x0*TILE, wy0=y0*TILE, ww=(x1-x0)*TILE, wh=(y1-y0)*TILE, dx=t*w.sp, dy=t*w.sp*0.55;
  const ax=(((wx0-dx)%P)+P)%P, ay=(((wy0-dy)%P)+P)%P;
  ctx.save(); ctx.globalAlpha=w.a;
  for(let yy=wy0-ay; yy<wy0+wh; yy+=P) for(let xx=wx0-ax; xx<wx0+ww; xx+=P) ctx.drawImage(tex, xx, yy);
  ctx.restore();
}
let _tcGen = -1;   // LOADER.gen snapshot: a LATE-arriving atlas (mobile retry) re-bakes every chunk
function renderTerrainChunks(state, z, x0,y0,x1,y1){
  const _lg = (typeof LOADER!=='undefined') ? LOADER.gen : 0;
  if(_tcFor!==state || _tcZoom!==z || _tcDpr!==dpr || _tcGen!==_lg){ _tcCache.clear(); _tcFor=state; _tcZoom=z; _tcDpr=dpr; _tcGen=_lg; }
  if(_tcCache.size>320) _tcCache.clear();                  // bound memory on big maps (re-bakes only visible chunks next frame)
  const cx0=Math.floor(x0/TC_SIZE), cy0=Math.floor(y0/TC_SIZE), cx1=Math.floor((x1-1)/TC_SIZE), cy1=Math.floor((y1-1)/TC_SIZE);
  const live=[];
  ctx.save(); ctx.setTransform(dpr,0,0,dpr,0,0);            // blit chunks 1:1 in CSS space (only POSITION is camera-fractional)
  for(let cy=cy0;cy<=cy1;cy++) for(let cx=cx0;cx<=cx1;cx++){
    if(cx<0||cy<0) continue;
    const cnt=_tcExploredCount(state,cx,cy); if(!cnt) continue;
    const key=cx+','+cy; let ch=_tcCache.get(key);
    if(!ch || ch.cnt!==cnt){ ch=_tcBake(state,cx,cy,z,cnt); _tcCache.set(key,ch); }
    const cssX=(cx*TC_SIZE*TILE-state.camX)*z, cssY=VIEW_TOP+(cy*TC_SIZE*TILE-state.camY)*z;
    ctx.drawImage(ch.cnv, cssX, cssY, ch.cnv.width/dpr, ch.cnv.height/dpr);
    for(let k=0;k<ch.live.length;k++) live.push(ch.live[k]);
  }
  ctx.restore();                                           // back to the world transform
  for(let k=0;k<live.length;k++){ const tx=live[k][0], ty=live[k][1];
    if(tx<x0||tx>=x1||ty<y0||ty>=y1) continue;
    drawTile(state,tx,ty, tx*TILE, ty*TILE);               // water/procedural live, world space
  }
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
  if(slot==='floor' && typeof FLOOR_VAR_READY!=='undefined' && FLOOR_VAR_READY){   // P1.1/P1.2: hash-pick a floor variant
    const fr=floorVarRect(b, (h2(tx,ty)*FLOOR_VAR_N)|0);
    if(fr){ _blitOrientedTo(ctx, FLOOR_VAR_IMG, fr, px, py, v, true); return; }
  }
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

/* ---- HUB roads + sidewalks: colored canvas tiles (no sprites). roadTiles 0=none/1=road/2=sidewalk;
   roadMask = per-road N/E/S/W road-neighbour nibble (N=1,E=2,S=4,W=8) → carriageway edges; roadAxis =
   centreline tiles (1=H,2=V) → the dashed lane line. Lit cyan neon survives the HUB night tint. ---- */
const ROAD_ASPHALT  = '#0d1016', ROAD_ASPHALT2  = '#11151c';   // wet asphalt, 2-tone (deterministic mottle)
const ROAD_SIDEWALK = '#222a34', ROAD_SIDEWALK2 = '#27313d';   // cool concrete slab, clearly lighter than asphalt
const ROAD_BEVEL_HI = 'rgba(150,175,205,.10)';                 // raised-curb highlight where sidewalk meets road
const ROAD_NEON     = '90,210,255';                            // cyan lane neon (alpha applied per use)
function drawRoads(state, x0,y0,x1,y1){
  const W=state.W, H=state.H, R=state.roadTiles, M=state.roadMask, AX=state.roadAxis, T=TILE, z=state.zoom||1;
  // ---- Pass A: fills (every zoom). 2-tone (≈25% alt) so asphalt/concrete aren't dead-flat. +1 overscan. ----
  for(let ty=y0;ty<y1;ty++) for(let tx=x0;tx<x1;tx++){
    const v=R[ty*W+tx]; if(!v) continue;
    const alt=((tx*7 ^ ty*13)&3)===0;
    ctx.fillStyle = v===2 ? (alt?ROAD_SIDEWALK2:ROAD_SIDEWALK) : (alt?ROAD_ASPHALT2:ROAD_ASPHALT);
    ctx.fillRect(tx*T, ty*T, T+1, T+1);
  }
  const q    = (typeof QUAL!=='undefined' && QUAL) ? (QUAL.level||0) : 0;
  const glow = z>=0.5 && q<2;                                  // shadowBlur (bloom) only when readable + affordable
  const reduced = (typeof megaReducedMotion==='function' && megaReducedMotion());
  const anim = q<1 && !reduced;                               // centre-line dash flows at EVERY zoom (offset is ≈free; quality/motion gated only)
  const t    = state.time||0;
  const lw   = 1/z;                                            // hold line weight + dash ≈constant in SCREEN px → neon reads at EVERY zoom

  // ---- Pass A2: curb bevel — fine detail, only when zoomed in enough to see it ----
  if(z>=0.55){
    ctx.lineWidth=1; ctx.strokeStyle=ROAD_BEVEL_HI; ctx.beginPath();
    for(let ty=y0;ty<y1;ty++) for(let tx=x0;tx<x1;tx++){
      const i=ty*W+tx; if(R[i]!==2) continue; const px=tx*T, py=ty*T;
      if(ty>0   && R[i-W]===1){ ctx.moveTo(px, py+0.5);   ctx.lineTo(px+T, py+0.5); }
      if(ty<H-1 && R[i+W]===1){ ctx.moveTo(px, py+T-0.5); ctx.lineTo(px+T, py+T-0.5); }
      if(tx>0   && R[i-1]===1){ ctx.moveTo(px+0.5, py);   ctx.lineTo(px+0.5, py+T); }
      if(tx<W-1 && R[i+1]===1){ ctx.moveTo(px+T-0.5, py); ctx.lineTo(px+T-0.5, py+T); }
    }
    ctx.stroke();
  }

  // ---- Pass B: neon EDGES (the lit-street rails) — carriageway↔non-road boundary, one batched stroke. ALWAYS. ----
  ctx.beginPath();
  for(let ty=y0;ty<y1;ty++) for(let tx=x0;tx<x1;tx++){
    const i=ty*W+tx; if(R[i]!==1) continue; const m=M[i], px=tx*T, py=ty*T;
    if(!(m&1)){ ctx.moveTo(px, py+0.5);   ctx.lineTo(px+T, py+0.5); }
    if(!(m&4)){ ctx.moveTo(px, py+T-0.5); ctx.lineTo(px+T, py+T-0.5); }
    if(!(m&8)){ ctx.moveTo(px+0.5, py);   ctx.lineTo(px+0.5, py+T); }
    if(!(m&2)){ ctx.moveTo(px+T-0.5, py); ctx.lineTo(px+T-0.5, py+T); }
  }
  ctx.shadowColor = glow ? 'rgba('+ROAD_NEON+',.18)' : 'transparent'; ctx.shadowBlur = glow?9:0;
  ctx.strokeStyle = 'rgba('+ROAD_NEON+',.24)'; ctx.lineWidth=1.8*lw; ctx.stroke();   // border lines at 24% opacity

  // ---- Pass C: neon CENTRE LINE — run-merged so dashes flow continuously down each carriageway. ALWAYS. ----
  if(AX){
    ctx.setLineDash([18,10]); ctx.lineDashOffset = anim ? -((t*9)%28) : 0;   // dash in WORLD units → shrinks with the road at low zoom (was screen-constant = oversized when zoomed out)
    ctx.beginPath();
    for(let ty=y0;ty<y1;ty++){ const cy=ty*T+T/2; let tx=x0;        // horizontal runs
      while(tx<x1){ if(AX[ty*W+tx]===1){ const sx=tx; while(tx<x1 && AX[ty*W+tx]===1) tx++; ctx.moveTo(sx*T,cy); ctx.lineTo(tx*T,cy); } else tx++; } }
    for(let tx=x0;tx<x1;tx++){ const cx=tx*T+T/2; let ty=y0;        // vertical runs
      while(ty<y1){ if(AX[ty*W+tx]===2){ const sy=ty; while(ty<y1 && AX[ty*W+tx]===2) ty++; ctx.moveTo(cx,sy*T); ctx.lineTo(cx,ty*T); } else ty++; } }
    ctx.shadowColor = glow ? 'rgba('+ROAD_NEON+',.46)' : 'transparent'; ctx.shadowBlur = glow?8:0;
    ctx.strokeStyle = 'rgba('+ROAD_NEON+','+(glow?'.50':'.58')+')'; ctx.lineWidth=1.6*lw; ctx.stroke();
  }
  // ---- reset (following water/lava passes assume no shadow/dash) ----
  ctx.shadowBlur=0; ctx.setLineDash([]); ctx.lineDashOffset=0;
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

/* ===== MOUNTAIN CHAIN render (cosmetic) — draw each mountain rock CLUSTER as the approved lab "chain":
   overlapping, depth-sorted, crest spires (variants 0,6) rising over foothills (2,4,7), sized to the
   cluster's OWN median draw size so the footprint stays put. REPLACES the per-rock sprite draw only —
   gameplay blocked/feat mask, minimap & save stay on state.features. Cached per-state in MTN_CHAINS
   (a WeakMap, NEVER on a state- or feature-field → never serialized). Deterministic: every categorical choice from an
   integer coord-hash (makeNoise2D.hash) + the map seed (no Math.random, no cluster ordinal) → identical
   host/client/reload. ?nomtnchain=1 → the old per-rock render. ===== */
const MTN_CHAINS = new WeakMap();
const MTN_ROLE_POOL = { crest:[0,6], mid:[3], base:[2,4,7] };   // owner-approved roles; 1,5 are OFF (never used)
const MTNC = { mergeCheb:2, minSize:3, spacingTiles:1.4, maxPerCluster:40,
               gradient:0.45, crestBoost:1.25, jitterPos:0.30, jitterSize:0.20, mirror:0.5, crestHeightCap:1.6 };
function _isMtnRock(f){ return !f.base && f.slot==='rock' && f.biome===B_MOUNTAIN; }
function _mtnSeed(state){ return state.hub
  ? ((424242+(typeof CAMPAIGN!=='undefined'?(CAMPAIGN.visit||0):0)*17+909)>>>0)
  : ((((state.cfg&&state.cfg.seed)||1)*1000+909)>>>0); }
function buildMountainChains(state){
  if(typeof FEAT_VAR_READY==='undefined' || !FEAT_VAR_READY || typeof MTN_TRIM==='undefined' || !MTN_TRIM) return null;
  if(typeof makeNoise2D!=='function' || state.hub) return {sprites:[], skip:new Set()};   // hub deferred (wasteland fog)
  const feats=[]; if(state.features) for(const f of state.features) if(_isMtnRock(f)) feats.push(f);
  if(!feats.length) return {sprites:[], skip:new Set()};
  // cluster: union-find by Chebyshev <= mergeCheb lattice steps (bridges the ~1/3 grass holes in ranges)
  const N=feats.length, par=new Int32Array(N); for(let i=0;i<N;i++) par[i]=i;
  const find=i=>{ while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; };
  const tol=MTNC.mergeCheb*FEAT_SIZE;
  for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){ const a=feats[i],b=feats[j];
    if(Math.abs(a.tx-b.tx)<=tol && Math.abs(a.ty-b.ty)<=tol){ const ra=find(i),rb=find(j); if(ra!==rb) par[ra]=rb; } }
  const groups=new Map(); for(let i=0;i<N;i++){ const r=find(i); let g=groups.get(r); if(!g){g=[];groups.set(r,g);} g.push(feats[i]); }
  const cnz=makeNoise2D((_mtnSeed(state)^0xC4A1)>>>0), sprites=[], skip=new Set();
  const emit=(cx,by,drawW,role,hx,hy)=>{
    const pool=MTN_ROLE_POOL[role]||MTN_ROLE_POOL.base, variant=pool[(cnz.hash(hx,hy)*pool.length)|0];
    const tr=MTN_TRIM[variant]; if(!tr) return;
    let dh=drawW*(tr.h/tr.w); if(role==='crest') dh=Math.min(dh, MTNC.crestHeightCap*drawW*(tr.h/tr.w)/MTNC.crestBoost);
    sprites.push({ variant, bx:cx, by, dw:drawW, dh, mirror:(cnz.hash(hx+131,hy+17)<MTNC.mirror), src:tr,
      tie:((cnz.hash(hx+9,hy+9)*65536)|0),
      tileX:Math.max(0,Math.min(state.W-1,(cx/TILE)|0)), tileY:Math.max(0,Math.min(state.H-1,((by/TILE)|0)-1)) });
  };
  for(const grp of groups.values()){
    for(const f of grp) skip.add(f);
    let minTx=1e9,maxTx=-1e9,minTy=1e9,maxTy=-1e9; const sizes=[];
    for(const f of grp){ if(f.tx<minTx)minTx=f.tx; if(f.tx+FEAT_SIZE>maxTx)maxTx=f.tx+FEAT_SIZE;
      if(f.ty<minTy)minTy=f.ty; if(f.ty+FEAT_SIZE>maxTy)maxTy=f.ty+FEAT_SIZE;
      const rs=(RENDER.vscale && f.vscale!=null)?f.vscale:1.0; sizes.push(FEAT_SIZE*TILE*(f.overhang||1.08)*rs); }
    sizes.sort((a,b)=>a-b); const baseW=sizes[sizes.length>>1];                 // cluster MEDIAN → preserves mass
    if(grp.length<MTNC.minSize){                                               // lone outcrop: ~as today, no crest
      for(const f of grp){ const cx=(f.tx+FEAT_SIZE/2)*TILE, by=(f.ty+FEAT_SIZE)*TILE;
        emit(cx,by,baseW, cnz.hash(f.tx+1,f.ty+5)<0.25?'mid':'base', f.tx, f.ty); }
      continue;
    }
    const topY=minTy*TILE, botY=maxTy*TILE, leftX=minTx*TILE, rightX=maxTx*TILE;
    let step=MTNC.spacingTiles*TILE;
    const est=Math.max(1,(rightX-leftX)/step)*Math.max(1,(botY-topY)/(step*0.85));
    if(est>MTNC.maxPerCluster) step*=Math.sqrt(est/MTNC.maxPerCluster);        // cap by DENSITY, not truncation
    const colTop=new Map(), colBot=new Map();                                  // per-column real coverage
    for(const f of grp){ const t=f.ty*TILE, b=(f.ty+FEAT_SIZE)*TILE;
      for(let tx=f.tx; tx<f.tx+FEAT_SIZE; tx++){
        if(colTop.get(tx)==null||t<colTop.get(tx)) colTop.set(tx,t);
        if(colBot.get(tx)==null||b>colBot.get(tx)) colBot.set(tx,b); } }
    for(let px=leftX; px<rightX; px+=step){
      let cT=colTop.get((px/TILE)|0), cB=colBot.get((px/TILE)|0); if(cT==null){ cT=topY; cB=botY; }
      const cspan=Math.max(1,cB-cT);
      for(let py=cT; py<cB; py+=step*0.85){
        const rowFrac=Math.max(0,Math.min(1,(py-cT)/cspan));
        const role=rowFrac<0.34?'crest':(rowFrac<0.7?'mid':'base');
        const sgx=(px/8)|0, sgy=(py/8)|0;
        const jx=(cnz.hash(sgx+211,sgy+7)-0.5)*step*MTNC.jitterPos, jy=(cnz.hash(sgx+7,sgy+211)-0.5)*step*0.4;
        let w=baseW*(1-MTNC.gradient*rowFrac); if(role==='crest') w*=MTNC.crestBoost;
        w*=1+(cnz.hash(sgx+53,sgy+97)-0.5)*2*MTNC.jitterSize; if(w<6) continue;
        let cx=px+jx; if(cx<leftX)cx=leftX; if(cx>rightX)cx=rightX;            // clamp center to footprint span
        emit(cx, py+jy, w, role, sgx, sgy);
      }
    }
  }
  return {sprites, skip};
}
function getMountainChains(state){
  if(!RENDER.mtnchain) return null;
  let c=MTN_CHAINS.get(state);
  if(c===undefined){ c=buildMountainChains(state); if(c) MTN_CHAINS.set(state,c); }   // build once atlas ready, then cache
  return c||null;
}
function drawMtnChainSprite(state, s, ox, oy, dim){
  const dx=s.bx+ox-s.dw/2, dy=s.by+oy-s.dh;
  ctx.save();
  if(dim) ctx.globalAlpha*=0.5;
  if(s.mirror){ const a=s.bx+ox; ctx.translate(a,0); ctx.scale(-1,1); ctx.translate(-a,0); }
  ctx.drawImage(FEAT_VAR_IMG, s.src.x,s.src.y,s.src.w,s.src.h, dx,dy,s.dw,s.dh);
  ctx.restore();
}
let _mtnHaze=null;
function mtnHazeSprite(){ if(_mtnHaze) return _mtnHaze; const sz=64, c=document.createElement('canvas'); c.width=sz; c.height=sz;
  const g=c.getContext('2d'), rg=g.createRadialGradient(sz/2,sz/2,1,sz/2,sz/2,sz/2);
  rg.addColorStop(0,'rgba(0,0,0,0.5)'); rg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=rg; g.fillRect(0,0,sz,sz); _mtnHaze=c; return c; }

// ---- 2x2 walk-under topography feature (tree / rock) ----
// Drawn in the depth sort, bottom-anchored on the footprint's ground line so units in
// the passable TOP row are occluded (walk under the canopy) and units below draw over.
// Phase 1 reuses the existing OPAQUE atlas cell scaled 2x2 (top row reads as a mound);
// Phase 2 swaps in a transparent feature atlas inside drawFeatureSprite — no change here.
function drawFeature(state, f, ox, oy, dim){
  const fw=Math.max(1,(f.w||FEAT_SIZE)|0), fh=Math.max(1,(f.h||FEAT_SIZE)|0);
  const px=f.tx*TILE+ox, baseW=fw*TILE, baseH=fh*TILE;
  const overhang=f.overhang||1.08;                       // slight upward growth, like buildings/megas
  // SIZE: clustered grove band (f.vscale, set at map-gen so a clump shares one size) when present, else the
  // legacy per-feature hash jitter. Cosmetic — footprint/blocked mask/depth ground-line unchanged. f.base → fixed.
  const rscale = f.base ? 1 : ((RENDER.vscale && f.vscale!=null) ? f.vscale : (0.8 + h2(f.tx*1.3+7, f.ty*1.7+3)*0.55));
  const dw=baseW*overhang*rscale, dh=baseH*overhang*(f.heightScale||1)*rscale;
  const dx=px+(baseW-dw)/2, dy=(f.ty+fh)*TILE+oy - dh + 2; // centered, bottom-anchored on the ground line
  // P3.1 walk-under: is a unit standing in this feature's PASSABLE top rows (rows [0, fh-floor(fh/2))? → fade
  // the canopy so the unit reads through it (finishes the pending transparent-canopy "Phase 2"). ?nocanopy via toggle n/a.
  let under=false;
  if(_unitTileSet.size){ const bf=fh-(fh>>1);            // rows >= bf are the blocked base; rows < bf are walk-under
    for(let ry=0;ry<bf && !under;ry++){ const ty=f.ty+ry; if(ty<0) continue;
      for(let rx=0;rx<fw;rx++){ if(_unitTileSet.has(ty*state.W+(f.tx+rx))){ under=true; break; } } }
  }
  // (P3.2 feature contact-shadow removed — it read as the rock/tree FLOATING above the ground, not grounded.)
  ctx.save();
  if(under) ctx.globalAlpha*=0.42;                       // canopy ghost (unit walks under)
  else if(dim) ctx.globalAlpha*=0.5;                     // explored-but-not-visible
  drawFeatureSprite(f, dx, dy, dw, dh);
  if(state.hub && f.slot==='rock' && typeof hubInWasteland==='function' && hubInWasteland(f.tx+fw/2,f.ty+fh/2)){
    drawWastelandRockFog(state,f,dx,dy,dw,dh);
  }
  ctx.restore();
}

function wasteFogRgba(rgb,a){
  return 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+Math.max(0,Math.min(1,a)).toFixed(3)+')';
}
function drawWasteFogBlob(cx,cy,rx,ry,rot,rgb,a){
  ctx.save();
  ctx.translate(cx,cy); ctx.rotate(rot||0); ctx.scale(1,ry/rx);
  const g=ctx.createRadialGradient(0,0,rx*0.03,0,0,rx);
  g.addColorStop(0,wasteFogRgba([174,255,104],a));
  g.addColorStop(0.36,wasteFogRgba(rgb,a*0.58));
  g.addColorStop(0.72,wasteFogRgba([44,160,58],a*0.20));
  g.addColorStop(1,wasteFogRgba([18,82,34],0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawWastelandRockFog(state,f,dx,dy,dw,dh){
  const t=state.time||0, seed=f.tx*17.37+f.ty*41.91+(f.v||0)*97.3;
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  for(let i=0;i<10;i++){
    const hx=h01(seed+i*3.1), hy=h01(seed+i*5.7), hp=h01(seed+i*8.9);
    const driftX=Math.sin(t*(0.34+hp*0.18)+hx*6.283)*dw*0.030;
    const driftY=Math.cos(t*(0.42+hy*0.14)+hp*6.283)*dh*0.026;
    const pulse=0.60+0.40*Math.sin(t*(0.76+hp*0.18)+hx*6.283);
    const cx=dx+dw*(0.16+0.68*hx)+driftX;
    const cy=dy+dh*(0.20+0.58*hy)+driftY;
    const rx=dw*(0.18+0.12*h01(seed+i*11.2));
    const ry=dh*(0.12+0.10*h01(seed+i*13.4));
    drawWasteFogBlob(cx,cy,rx,ry,(hx-0.5)*0.8,[86,235,74],0.070*(0.72+0.28*pulse));
  }
  ctx.globalCompositeOperation='lighter';
  const breath=0.55+0.45*Math.sin(t*0.9+seed);
  drawWasteFogBlob(dx+dw*0.5,dy+dh*0.52,dw*(0.62+0.06*breath),dh*(0.40+0.05*breath),0,[92,255,82],0.115);
  for(let i=0;i<7;i++){
    const hx=h01(seed+i*19.1), hy=h01(seed+i*23.7);
    const cx=dx+dw*(0.22+0.56*hx)+Math.sin(t*0.8+i)*dw*0.018;
    const cy=dy+dh*(0.22+0.48*hy)+Math.cos(t*0.65+i)*dh*0.018;
    drawWasteFogBlob(cx,cy,dw*(0.10+0.07*hx),dh*(0.07+0.05*hy),(hy-0.5)*0.7,[118,255,80],0.105);
  }
  ctx.restore();
}

// Blit a feature sprite into the bottom-anchored box. Mirror-only orientation from f.v
// (never rotate — a canopy must stay upright). Fallback chain: [Phase 2 transparent atlas]
// → the existing opaque atlas cell → procedural drawTreeTile/drawRockTile, all scaled to the box.
function drawFeatureSprite(f, dx, dy, dw, dh){
  ctx.save();
  if(f.v>=0.5){ ctx.translate(dx+dw/2, dy+dh/2); ctx.scale(-1,1); ctx.translate(-(dx+dw/2), -(dy+dh/2)); }
  // 0) P7.4 VARIANT atlas (features_var.webp): one of FEAT_VAR_N distinct shapes per biome+slot, hash-picked
  //    from the feature's coords (deterministic → co-op-safe). The big "lifeless one-rock-per-biome" fix.
  if(!f.base && typeof FEAT_VAR_READY!=='undefined' && FEAT_VAR_READY && typeof featVarRect==='function'){
    // VARIANT: clustered grove pick (f.var, assigned at map-gen so neighbours share a shape) when present,
    // else the legacy uncorrelated per-tile hash. ?nofeatclu=1 forces the old look for A/B on the same map.
    const idx = (RENDER.featclu && f.var!=null) ? f.var : ((h2(f.tx,f.ty)*featVarN(f.slot))|0);
    const vr = featVarRect(f.biome, f.slot, idx);   // rocks: 8 variants, trees: 16 (own 0-7 + dead 8-15)
    if(vr){ ctx.drawImage(FEAT_VAR_IMG, vr[0],vr[1],vr[2],vr[3], dx,dy,dw,dh); ctx.restore(); return; }
  }
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
  // base:true → the funding crystal ALWAYS uses the ORIGINAL features.webp mountain rock (the purple crystal)
  // at a fixed size — it must never pick a new shape variant or jitter size (it's a gameplay landmark).
  drawFeature(state, {tx:ftx, ty:fty, biome:B_MOUNTAIN, slot:'rock', v:((e.id||0)&1)?0.72:0.18, base:true}, ox, oy, false);

  // additive PURPLE emission over the rock body so it reads as glowing purple (pulses)
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const er=w*0.44;
  const eg=ctx.createRadialGradient(cx, midY, 2, cx, midY, er);
  eg.addColorStop(0,`rgba(156,74,232,${(0.585*glow*(0.6+0.4*pulse)).toFixed(3)})`);
  eg.addColorStop(1,'rgba(120,50,200,0)');
  ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(cx, midY, er, 0, 6.28); ctx.fill();
  ctx.restore();

  // remaining-funding label below the base
  ctx.fillStyle='#e9d2ff'; ctx.font='11px '+GAME_FONT; ctx.textAlign='center';
  ctx.fillText(e.amount|0, cx, groundY+13);
  ctx.restore();
}
function drawSparkle(x,y,r){
  ctx.beginPath();
  ctx.moveTo(x,y-r); ctx.lineTo(x+r*0.28,y-r*0.28); ctx.lineTo(x+r,y); ctx.lineTo(x+r*0.28,y+r*0.28);
  ctx.lineTo(x,y+r); ctx.lineTo(x-r*0.28,y+r*0.28); ctx.lineTo(x-r,y); ctx.lineTo(x-r*0.28,y-r*0.28);
  ctx.closePath(); ctx.fill();
}

function buildingSpriteVisual(type, faction, owner){
  if(faction && typeof BUILDING_ANIM!=='undefined'){
    const e=BUILDING_ANIM[type], a=e&&e[faction];
    if(a&&a.ready) return { img:a.img, fw:a.fw, fh:a.fh, frames:(BUILDING_FRAME_COUNT[type]||BUILDING_FRAMES) };
  }
  return buildingSprite(type, owner);
}
function buildingNeonFrame(spriteId, fi){
  if(typeof BUILDING_NEON_MAPS==='undefined' || !BUILDING_NEON_MAPS || !BUILDING_NEON_MAPS.sprites) return null;
  const spr=BUILDING_NEON_MAPS.sprites[spriteId];
  const fr=spr && spr.frames && spr.frames[fi];
  return fr && fr.glows && fr.glows.length ? fr.glows : null;
}
// Per-frame hero glow anchors (HERO_NEON_MAPS, hero_neon_maps.js) — twin of buildingNeonFrame
// with an extra `action` level since units have per-action strips (walk/attack/heal).
function heroNeonFrame(spriteType, action, fi){
  if(typeof HERO_NEON_MAPS==='undefined' || !HERO_NEON_MAPS || !HERO_NEON_MAPS.sprites) return null;
  const spr=HERO_NEON_MAPS.sprites[spriteType];
  const a=spr && spr[action || 'walk'];
  const fr=a && a.frames && a.frames[((fi||0)%a.frames.length+a.frames.length)%a.frames.length];
  return fr && fr.glows && fr.glows.length ? fr.glows : null;
}
function drawHubBuildingSpriteVisual(state,e,ox,oy){
  const v=e.hubSpriteVisual, spr=v&&buildingSpriteVisual(v.type, v.faction, e.owner);
  if(!v || !spr) return e.ty*TILE+oy;
  const baseW=(v.w||e.w)*TILE, baseH=(v.h||e.h)*TILE;
  const baseX=(e.tx+e.w/2)*TILE+ox-baseW/2, baseY=(e.ty+e.h)*TILE+oy-baseH;
  const dw=baseW*(v.overhang||1.08), dh=dw*(spr.fh/spr.fw)*(v.heightScale||1);
  const dx=baseX+(baseW-dw)/2, dy=baseY+baseH-dh+2;
  const f=(v.fixedFrame!=null?Math.floor(v.fixedFrame):0), fi=((f%spr.frames)+spr.frames)%spr.frames;
  // Optional vertical STACK: draw the sprite N times to build ONE ultra-tall tower. It stays a single
  // entity with a single footprint, so it looks AND clicks as one. Lower segments draw last so they
  // cover the seam of the segment above them; stackOverlap blends the join.
  const stack=Math.max(1, Math.floor(v.stack||1)), step=dh*(1-(v.stackOverlap!=null?v.stackOverlap:0.06));
  const topYout=dy-(stack-1)*step;
  // draw bottom segment FIRST, each higher segment ON TOP — so the upper sprite's base hides the
  // roof/helipad of the one below it and the stack reads as a single continuous tower.
  // stackFrames picks a sheet frame PER SEGMENT (index = segment, 0 = bottom) so a stack can
  // line up its art (e.g. The Wake's continuous light strip); missing entries fall back to fixedFrame.
  for(let s=0; s<stack; s++){
    const sy=dy-s*step;
    const sfi=(v.stackFrames && v.stackFrames[s]!=null)
      ? ((Math.floor(v.stackFrames[s])%spr.frames)+spr.frames)%spr.frames : fi;
    const neon=buildingNeonFrame(v.neonId || (v.type+'_'+(v.faction||factionKey(e.owner))), sfi);
    if(typeof drawMegaNeonLayer==='function') drawMegaNeonLayer(state, v, neon, dx, sy, dw, dh, 'aura');
    ctx.drawImage(spr.img, sfi*spr.fw, 0, spr.fw, spr.fh, dx, sy, dw, dh);
    if(typeof drawMegaNeonLayer==='function') drawMegaNeonLayer(state, v, neon, dx, sy, dw, dh, 'core');
  }
  return topYout;
}

// True when this entity belongs to the A&O alien faction on the ACTIVE map. Render-only signal
// derived from owner + the loaded map cfg (state.cfg.enemyFaction) — NOT an entity field, so
// save.js and net/sync.js are untouched and solo/host/client all derive it locally from their cfg.
function aoSide(state, owner){ return owner==='enemy' && !!(state && state.cfg && state.cfg.enemyFaction==='ao'); }

// The Wake's lightning conduit (render-only): a faint A&O-green corona + periodic bolts striking the
// spire top. Deterministic from state.time + e.id, additive, reduced-motion aware. Mirrors the A&O
// emissive pattern; allocates only short-lived gradients per frame (no persistent state).
// alwaysStorm: force the charging cadence (the Dark Tower storms continuously, independent of the
// Wake-only CAMPAIGN.reborn queue). wOverride: scale the corona/bolt geometry to the DRAWN sprite
// width instead of the footprint — so the giant tower's storm is proportional to what's on screen.
function drawHubWakeFX(state, e, ox, oy, topY, alwaysStorm, wOverride){
  if(typeof megaReducedMotion==='function' && megaReducedMotion()) return;
  const t=state.time||0, id=(e.id||0);
  const px=e.tx*TILE+ox, fw=e.w*TILE;
  const cx=px+fw/2;                             // spire centre x (footprint-based — the sprite is centred on the footprint)
  const w=wOverride||fw;                        // effect SCALE: drawn width for the giant Dark Tower, footprint for the Wake
  const baseY=(e.ty+e.h)*TILE+oy;              // ground line
  const spanY=baseY-topY;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  // Soft elliptical glow that fades to transparent on EVERY side — the building block for all the
  // wake-tower light so nothing ever shows a hard rectangle edge. (rx,ry) = ellipse radii.
  const glow=(gx,gy,rx,ry,stops)=>{
    if(rx<=0||ry<=0) return;
    ctx.save();
    ctx.translate(gx,gy); ctx.scale(rx/ry,1);          // draw a radial circle, squash to an ellipse
    const g=ctx.createRadialGradient(0,0,0, 0,0,ry);
    for(const s of stops) g.addColorStop(s[0],s[1]);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,ry,0,6.283); ctx.fill();
    ctx.restore();
  };
  // green A&O aura — a soft column of light hugging the tall, thin spire (faded at the tips, not a
  // rectangle) so the whole tower reads against the dark mountains, plus a brighter pool at the base.
  const pulse=0.5+0.5*Math.sin(t*1.3 + id);
  glow(cx, topY+spanY*0.45, w*1.15, spanY*0.62, [
    [0,   'rgba(74,238,96,'+(0.13+0.06*pulse).toFixed(3)+')'],
    [0.55,'rgba(60,210,82,'+(0.05+0.03*pulse).toFixed(3)+')'],
    [1,   'rgba(54,200,76,0)']]);
  glow(cx, baseY-w*0.6, w*1.6, w*1.1, [
    [0,'rgba(72,236,92,'+(0.12+0.06*pulse).toFixed(3)+')'],
    [1,'rgba(40,150,60,0)']]);
  // periodic GREEN lightning striking the spire — big, branched, frequent (more so while charging)
  const charging=alwaysStorm || (typeof CAMPAIGN!=='undefined' && CAMPAIGN.reborn && (CAMPAIGN.reborn.sessions||[]).length>0);
  const period=charging?1.5:3.2, dur=0.42, ph=(t + id*0.7) % period;
  if(ph < dur){
    const k=1-ph/dur, flick=0.5+0.5*Math.abs(Math.sin(t*40)), a=k*flick;
    const sky=Math.max(0, topY - w*4.4);
    const strike=Math.floor((t + id*0.7)/period);
    const rnd=(n)=>{ const s=Math.sin(id*12.9898 + strike*78.233 + n*37.719)*43758.5453; return s-Math.floor(s); };
    // (1) broad, edgeless sky flash — the strike lights the whole ridgeline (like real lightning
    //     flaring across the mountain chain), drifting a little per strike. NOT a box round the tower.
    glow(cx + (rnd(99)-0.5)*w*2.2, sky+(topY-sky)*0.4, w*8, (topY-sky)*0.95*flick, [
      [0,  'rgba(120,240,150,'+(0.16*a).toFixed(3)+')'],
      [0.5,'rgba(70,210,100,'+(0.07*a).toFixed(3)+')'],
      [1,  'rgba(40,170,70,0)']]);
    const seg=8, dyStep=(topY-sky)/seg;
    ctx.lineCap='round'; ctx.lineJoin='round';
    const pts=[[cx,sky]];
    for(let i=1;i<seg;i++) pts.push([cx + (rnd(i)-0.5)*w*1.0*(i/seg), sky+dyStep*i]);
    pts.push([cx, topY]);
    const stroke=(lw,col)=>{ ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.lineWidth=lw; ctx.strokeStyle=col; ctx.stroke(); };
    stroke(12, 'rgba(48,210,76,'+(0.50*a).toFixed(3)+')');     // wide green halo
    stroke(6,  'rgba(92,255,122,'+(0.72*a).toFixed(3)+')');    // green body
    stroke(2.2,'rgba(205,255,214,'+(0.95*a).toFixed(3)+')');   // hot core
    for(let bI=0;bI<2;bI++){                                    // a couple of forked branches
      const j=2+(((rnd(50+bI)*(seg-3))|0)); const bx=pts[j][0], by=pts[j][1];
      const ex=bx+(rnd(60+bI)-0.5)*w*1.2, ey=by+dyStep*(1.1+rnd(70+bI));
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo((bx+ex)/2+(rnd(80+bI)-0.5)*w*0.3,(by+ey)/2); ctx.lineTo(ex,ey);
      ctx.lineWidth=3; ctx.strokeStyle='rgba(92,255,122,'+(0.55*a).toFixed(3)+')'; ctx.stroke();
    }
    // (2) impact burst where the bolt meets the spire top — soft circle
    glow(cx, topY, w*2.3*flick, w*2.3*flick, [
      [0,  'rgba(175,255,195,'+(0.66*a).toFixed(3)+')'],
      [0.4,'rgba(72,240,104,'+(0.40*a).toFixed(3)+')'],
      [1,  'rgba(40,180,70,0)']]);
    // (3) the spire body flares green on a strike — soft ellipse down the tower (replaces the old
    //     hard-edged rectangular wash that read as an ugly green box).
    glow(cx, topY+spanY*0.45, w*1.35, spanY*0.6, [
      [0,  'rgba(120,250,150,'+(0.26*a).toFixed(3)+')'],
      [0.6,'rgba(70,225,100,'+(0.11*a).toFixed(3)+')'],
      [1,  'rgba(50,200,80,0)']]);
  }
  ctx.restore();
}
function drawBuilding(state,e,ox,oy,dim){
  const d=DEF[e.type];
  const px=e.tx*TILE+ox, py=e.ty*TILE+oy;
  const w=e.w*TILE, h=e.h*TILE;
  const ao=aoSide(state, e.owner);
  const isTower = e.type==='darktower';   // A&O's indestructible landmark: force its black+green 'ao' art + storm even though it's a neutral entity
  const spr=buildingSprite(e.type, e.owner, (ao||isTower)?'ao':null);

  ctx.save();
  if(dim) ctx.globalAlpha=0.55;
  if(e.abandoned) ctx.globalAlpha*=0.7;   // derelict: faded
  // selection ring — wraps the DRAWN sprite (BUILDING_DRAW_SCALE× the footprint) so the
  // highlight matches what the player sees; hub bespoke visuals keep the footprint ring.
  if(e.selected){
    const sb=(spr && !e.hubSpriteVisual && !e.hubMegaVisual) ? buildingDrawBox(e,spr) : {x:px-ox,y:py-oy,w,h};
    ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.strokeRect(sb.x+ox-3, sb.y+oy-3, sb.w+6, sb.h+6);
  }
  if(e.hubSpriteVisual){
    const topY=drawHubBuildingSpriteVisual(state,e,ox,oy);
    ctx.restore();
    if(e.hubPoi && e.hubPoi.kind==='wake') drawHubWakeFX(state,e,ox,oy,topY);
    if(e.hp<e.maxHp || e.selected) barAt(px+6, topY-7, w-12, 5, e.hp/e.maxHp, hpColor(e.hp/e.maxHp));
    return;
  }
  if(e.hubMegaVisual){
    ctx.restore();
    if(e.hp<e.maxHp || e.selected) barAt(px+6, py-7, w-12, 5, e.hp/e.maxHp, hpColor(e.hp/e.maxHp));
    return;
  }

  let topY=py;   // visual top of the structure (for the HP bar)
  if(spr){
    // animated 9-frame strip (neon flicker), aspect-preserved, bottom-anchored with a
    // little upward overhang for height. Per-building phase from e.id so identical
    // buildings don't flicker in lockstep. No ground shadow (intentionally dropped).
    const n=spr.frames;
    const box=buildingDrawBox(e,spr);   // BUILDING_DRAW_SCALE× footprint, bottom-anchored (SIZE unchanged)
    const dw=box.w, dh=box.h, dx=box.x+ox, dy=box.y+oy;
    topY=dy;
    if(e.constructing) ctx.globalAlpha*=0.5;   // rises faintly while building
    // BUILDING NEON + soft cross-fade (mirrors drawOneMega): per-faction glow on the light pixels (key = the
    // same per-faction art file). The SPRITE frame cross-fade (A→B smoothstep) runs at EVERY zoom so the frame
    // transition is always smooth; only the NEON detail drops when zoomed out (full A/B blend → one cheap layer)
    // to bound fill cost. QUAL≥2 / constructing / unmapped / single-frame opt out to today's hard-swap.
    const z=state.zoom||1, rm=(typeof megaReducedMotion==='function' && megaReducedMotion());
    const neonOn = RENDER.bldgneon && n>1 && !e.constructing
                   && !(typeof QUAL!=='undefined' && QUAL && QUAL.level>=2)
                   && typeof buildingNeonFrame==='function' && typeof drawMegaNeonLayer==='function';
    if(neonOn){
      // auraScale keeps the glow ON the building + immediate edge (no terrain wash); coreScale trims the soft
      // additive bleed of the bright cores so big buildings (open-plan HQ) don't light up the ground around them.
      const sid=e.type+'_'+((ao||isTower)?'ao':factionKey(e.owner)), ph={seed:(e.id||0)*0.131, auraScale:0.42, coreScale:0.7, noBreath:true, cacheGrad:true};
      if(rm){                                                          // reduced-motion → static frame + static single glow (no animation)
        const fi=((((state.time*BUILDING_FPS + e.id*0.13)|0)%n)+n)%n, neon=buildingNeonFrame(sid,fi);
        drawMegaNeonLayer(state,ph,neon,dx,dy,dw,dh,'aura');
        ctx.drawImage(spr.img, fi*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh);
        drawMegaNeonLayer(state,ph,neon,dx,dy,dw,dh,'core');
      } else {
        const p=state.time*BUILDING_FPS*BUILDING_ANIM_SPEED + (e.id||0)*0.37, fl=Math.floor(p), s=(p-fl)*(p-fl)*(3-2*(p-fl));
        const fiA=((fl%n)+n)%n, fiB=(fiA+1)%n;
        if(z>=NEON_LOD_ZOOM){                                          // zoomed-in → full A/B neon cross-fade + sprite cross-fade
          const nA=buildingNeonFrame(sid,fiA), nB=buildingNeonFrame(sid,fiB);
          ctx.save(); ctx.globalAlpha*=(1-s); drawMegaNeonLayer(state,ph,nA,dx,dy,dw,dh,'aura'); ctx.restore();
          ctx.save(); ctx.globalAlpha*=s;     drawMegaNeonLayer(state,ph,nB,dx,dy,dw,dh,'aura'); ctx.restore();
          ctx.drawImage(spr.img, fiA*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh);
          ctx.save(); ctx.globalAlpha*=s; ctx.drawImage(spr.img, fiB*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh); ctx.restore();
          ctx.save(); ctx.globalAlpha*=(1-s); drawMegaNeonLayer(state,ph,nA,dx,dy,dw,dh,'core'); ctx.restore();
          ctx.save(); ctx.globalAlpha*=s;     drawMegaNeonLayer(state,ph,nB,dx,dy,dw,dh,'core'); ctx.restore();
        } else {                                                       // zoomed-out → SPRITE still cross-fades; neon = ONE cheap dominant-frame layer
          const neon=buildingNeonFrame(sid, s<0.5?fiA:fiB);
          drawMegaNeonLayer(state,ph,neon,dx,dy,dw,dh,'aura');
          ctx.drawImage(spr.img, fiA*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh);
          ctx.save(); ctx.globalAlpha*=s; ctx.drawImage(spr.img, fiB*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh); ctx.restore();
          drawMegaNeonLayer(state,ph,neon,dx,dy,dw,dh,'core');
        }
      }
    } else {
      const fi=((((state.time*BUILDING_FPS + e.id*0.13)|0)%n)+n)%n;    // hard-swap, no neon (QUAL≥2 / constructing / unmapped / flag off)
      ctx.drawImage(spr.img, fi*spr.fw,0,spr.fw,spr.fh, dx,dy,dw,dh);
    }
    // The Dark Tower always storms: reuse the Wake's green lightning conduit, scaled to the DRAWN
    // sprite (dw*0.5 keeps the corona/flash proportional to the giant tower instead of its tiny footprint).
    if(isTower) drawHubWakeFX(state, e, ox, oy, topY, true, dw*0.5);
  } else {
    // ---- procedural fallback ----
    const col = isRedSide(e.owner)? '#9a3b3b' : d.color;
    const grad=ctx.createLinearGradient(px,py,px,py+h);
    grad.addColorStop(0, shade(col,30)); grad.addColorStop(1, shade(col,-25));
    ctx.fillStyle=grad; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill();
    ctx.strokeStyle=shade(col,-50); ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.85)'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=(w*0.42|0)+'px '+GAME_FONT; ctx.fillText(d.icon||'🏢', px+w/2, py+h/2+1);
    ctx.fillStyle = isRedSide(e.owner)?'#ff8a8a':(e.ctrl==='p2'?'#ffb84d':'#7fd6ff'); ctx.fillRect(px+w/2-3, py+2, 6, 9);
  }
  // ---- A&O alien emissive (render-only): toxic-green pulse over the structure + drifting spores.
  // Owner-gated (captured A&O buildings flip to 'player' → ao false → FX stops), fog-dimmed via the
  // outer save's globalAlpha, off under reduced-motion. No pool/alloc — deterministic from time+e.id. ----
  if(ao && !e.constructing && !(typeof megaReducedMotion==='function' && megaReducedMotion())){
    const t=state.time||0, ph=((e.id||0)*1.7)%6.283, pulse=0.5+0.5*Math.sin(t*1.4+ph);
    const cx=px+w/2, cyB=topY+(py+h-topY)*0.5, groundY=py+h;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const gr=w*(0.6+0.05*pulse);
    const eg=ctx.createRadialGradient(cx, cyB, 2, cx, cyB, gr);
    eg.addColorStop(0,'rgba(62,230,76,'+(0.10+0.05*pulse).toFixed(3)+')');
    eg.addColorStop(1,'rgba(40,150,60,0)');
    ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(cx, cyB, gr, 0, 6.28); ctx.fill();
    for(let i=0;i<5;i++){                                           // a few slow-rising spore motes
      const s=(t*0.05 + i*0.21 + (e.id||0)*0.13) % 1;
      const sx=cx + Math.sin(i*2.3 + (e.id||0) + t*0.4)*w*0.34;
      const sy=groundY - s*(h*1.15);
      ctx.fillStyle='rgba(120,230,150,'+((0.30*(1-s))*(0.6+0.4*pulse)).toFixed(3)+')';
      ctx.beginPath(); ctx.arc(sx, sy, 1.5+1.1*(1-s), 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }
  // derelict: desaturating grey wash + a pulsing reclaim beacon over the roof
  if(e.abandoned){
    ctx.fillStyle='rgba(70,80,92,.42)'; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill();
    const pulse=0.55+0.45*Math.abs(Math.sin(state.time*2.2));
    ctx.globalAlpha=pulse;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 12px '+GAME_FONT;
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

// Muzzle world-point for a TRAINEE, reusing the canonical muzzleWorld() math. muzzleWorld computes
// the barrel at full unitDrawH and adds the flyer alt-raise, but trainees are drawn at `scale`
// (TRAINEE_SCALE) and ground-locked on their lane — so scale the muzzle OFFSET down and drop the alt
// so the bolt still leaves the drawn barrel pixel-for-pixel.
function hubTraineeMuzzle(u, scale){
  const mw=muzzleWorld(u), alt=(u.air?16:0);
  return { x:u.x + (mw.x-u.x)*scale, y:u.y + (mw.y-(u.y-alt))*scale };
}
// In-session trainee fire cadence (render-only / cosmetic): each shooter loops fire → travel → reload,
// staggered per unit, and each shot is aimed at a RANDOM downrange target so the beams fan across the
// range. Uses the exact in-game bolt (drawLaserBolt) + muzzle anchoring (muzzleWorld).
const TRAIN_FIRE_PERIOD = 1.05;   // seconds per shot (fire + reload)
const TRAIN_FIRE_FLIGHT = 0.32;   // fraction of the cycle the bolt is travelling (rest = reload gap)
// Draw the repeating laser bolts for the in-session trainees in `draw` (cosmetic; mirrors the combat
// FX pass, which skips storedIn units). Each shooter picks a random UR target per shot, with a little
// jitter, so the lanes crisscross like a live firing range.
function drawHubTraineeShots(state, draw, target, targets, scale, ox, oy){
  if(!targets || !targets.length) return;
  // Honor prefers-reduced-motion like the other render-only effects (particles/water/neon): this is
  // a persistent looping additive strobe on the live H.U.B. screen, so freeze it (no bolts) for users
  // who opt out of motion. The trainees keep their static shooting pose; only the flashing stops.
  if(typeof megaReducedMotion==='function' && megaReducedMotion()) return;
  const hash=(typeof hubHash01==='function') ? hubHash01 : ((a,b,c)=>{ const n=Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453; return n-Math.floor(n); });
  for(const it of draw){
    const u=it.u, t=(typeof hubUnitKey==='function') ? target.get(hubUnitKey(u)) : null;
    if(!t || !t.shoot) continue;                                  // only firing (in-session) trainees
    const seed=(u.id||0)+1;
    const phase=hash(seed,0,3);                                   // 0..1 per-unit stagger
    const cyc=(((state.time/TRAIN_FIRE_PERIOD)+phase)%1+1)%1;
    if(cyc>=TRAIN_FIRE_FLIGHT) continue;                          // between shots — reloading
    const p=cyc/TRAIN_FIRE_FLIGHT;                                // 0..1 bolt flight progress
    const shotIx=Math.floor((state.time/TRAIN_FIRE_PERIOD)+phase);
    const tg=targets[(hash(seed,shotIx,7)*targets.length)|0] || targets[0];
    const jx=(hash(seed,shotIx,11)-0.5)*16, jy=(hash(seed,shotIx,13)-0.5)*12;   // small per-shot spread
    const mz=hubTraineeMuzzle(u, scale);
    const w=2.2*(it.vh/64)*((typeof muzzleW==='function')?muzzleW(u):1);        // same width formula as combat
    drawLaserBolt(mz.x+ox, mz.y+oy, tg.x+jx+ox, tg.y+jy+oy, isRedSide(u.owner), w, p, false);
  }
}
// H.U.B.-only: draw the locked trainees inside the Training Grounds. They're storedIn (so the main
// depth pass skips them). Their spot + pose depend on STATE:
//   • IDLE (awaiting a session) → wait in the LOBBY (lower-left open floor), facing LEFT, idle anim.
//   • IN A SESSION (training)   → stand two-abreast in their own shooting LANE (mentor+junior), facing
//     RIGHT, looping the shooting animation, firing laser bolts at the downrange targets.
// First placement snaps; later target changes glide. Drawn back-to-front (y-sort) for correct overlap.
function drawHubTrainees(state, ox, oy){
  if(typeof hubTrainees!=='function' || typeof hubFindTrainingGrounds!=='function') return;
  const fac=hubFindTrainingGrounds(state); if(!fac) return;
  const T=(typeof CAMPAIGN!=='undefined' && CAMPAIGN.training) || {staged:[], sessions:[]};
  // per-key target: each session → a lane (a=mentor side 0, b=junior side 1); each staged → a lobby slot
  const target=new Map();
  (T.sessions||[]).forEach((ses,i)=>{
    if(ses.a){ const p=hubTrainLanePos(fac,i,0); target.set(ses.a.key,{x:p.x,y:p.y,shoot:true}); }
    if(ses.b){ const p=hubTrainLanePos(fac,i,1); target.set(ses.b.key,{x:p.x,y:p.y,shoot:true}); }
  });
  const staged=T.staged||[];
  staged.forEach((s,j)=>{ if(s){ const p=hubTrainLobbyPos(fac,j,staged.length); target.set(s.key,{x:p.x,y:p.y,shoot:false}); } });
  const TRAINEE_SCALE=0.9;                                                      // nearly full size — almost matches roaming units
  const draw=[];
  for(const u of hubTrainees(state)){
    const sType=u.spriteType||u.type, vh=unitDrawH(u)*TRAINEE_SCALE;
    const t=(typeof hubUnitKey==='function') ? target.get(hubUnitKey(u)) : null;
    if(t){
      // FOOT-ANCHOR: hubTrain*Pos returns the floor point where the feet should land, but blitFrame
      // draws the sprite with its feet at py+0.3h — so offset the body up by 0.3h (per unit size, so
      // a big Founder doesn't clip the wall) to seat the feet exactly on the painted floor.
      const tx=t.x, ty=t.y - 0.30*vh;
      if(!u._trainPlaced){ u.x=tx; u.y=ty; u._trainPlaced=true; }              // first frame → snap in
      else { u.x+=(tx-u.x)*0.2; u.y+=(ty-u.y)*0.2; }                           // glide on state change
      u._face = t.shoot ? 1 : -1;                                             // shoot→face range(right); idle→left
    }
    let anim=null, fi=0;
    if(t && t.shoot){ anim=(typeof actionAnim==='function' && actionAnim(sType,'attack',u.owner)) || (typeof unitWalk==='function'?unitWalk(sType,u.owner):null);
      if(anim) fi=((state.time*6 + (u.id||0)*0.7)|0)%anim.frames.length; }      // shooting loop
    else { anim=(typeof unitWalk==='function')?unitWalk(sType,u.owner):null;
      if(anim) fi=((state.time*1.8 + (u.id||0)*0.5)|0)%anim.frames.length; }    // gentle idle
    draw.push({u, anim, fi, vh});
  }
  draw.sort((a,b)=>a.u.y-b.u.y);                                                // depth: farther (lower y) first
  for(const it of draw){
    const u=it.u, px=u.x+ox, py=u.y+oy;
    if(it.anim) blitFrame(u, px, py, it.anim, it.vh, it.fi);
    else { ctx.fillStyle=isRedSide(u.owner)?'#c0392b':'#3b7fd0'; ctx.beginPath(); ctx.arc(px, py-it.vh*0.3, it.vh*0.2, 0, 6.28); ctx.fill(); }
  }
  // laser/bullet FX — in-session trainees fire bolts at random downrange targets, drawn over the
  // sprites like the combat laser pass (which skips these storedIn units).
  const targets=(typeof hubTrainTargetPoints==='function') ? hubTrainTargetPoints(fac) : null;
  drawHubTraineeShots(state, draw, target, targets, TRAINEE_SCALE, ox, oy);
}

// Strategic-zoom sprite LOD: only at MINIMUM and near-minimum zoom (ZOOM_MIN=0.35), where each sprite is
// barely ~11–14px. We still draw the unit's actual sprite (it stays recognizable) but as a LIGHT sprite —
// a single static frame with NONE of the per-frame idle-"life" animation, action-anim selection, facing
// bookkeeping, or per-unit HUD (hp bar / rank stars / control-group badge / co-op pip), all of which are
// illegible at this zoom yet cost real work ×(units on screen). Near-min-zoom-only (PERF.opts.spriteLod).
const SPRITE_LOD_ZOOM = 0.45;

// ---- Hero glow FX (render-only) ----------------------------------------------------------------
// Discreet-but-noticeable HUB-parity glow for named heroes, reusing the building neon renderer
// (drawMegaNeonLayer) verbatim. Two layers per hero: a code-synth body AURA (purple Nino / white
// Biba — no pixel source, so it's authored here, like the A&O ground aura), and a per-frame
// anchored EMITTER (Nino's gold gun-tip / Biba's purple healing mechanism) from HERO_NEON_MAPS.
// The emitter brightens while the matching action plays. Render-only: keys on synced u.spriteType
// + u.hero (NOT heroId, which isn't networked), reads only render scratch — never mutates sim.
function heroAura(u){
  return u.spriteType==='nino' ? { color:[168,90,238],  rx:0.34, ry:0.30, alpha:0.50 }   // purple
       : u.spriteType==='biba' ? { color:[236,242,255], rx:0.34, ry:0.30, alpha:0.46 }   // white
       : u.spriteType==='rust' ? { color:[255,140,60],  rx:0.34, ry:0.30, alpha:0.48 }   // PEDRO "RUST": foundry orange
       : u.spriteType==='zeca' ? { color:[64,224,208],  rx:0.30, ry:0.27, alpha:0.46 }   // ZECA: teal (intern-size aura)
       : null;
}
function drawHeroGlowLayer(state, u, anim, px, py, S, layer){
  if(!u.hero || !anim || typeof drawMegaNeonLayer!=='function') return;
  const aura = heroAura(u);
  const per  = heroNeonFrame(u.spriteType, (u._actState || 'walk'), u._heroFi);
  if(!aura && !per) return;
  // reconstruct the EXACT blitFrame box (assets.js): foot-anchored, mirrored by facing
  const dh=S, dw=S*(anim.fw/anim.fh), dx=px-dw/2, dy=py-dh*0.7;
  const facesLeft=!!(DEF[u.type] && DEF[u.type].facesLeft);
  const flip=((u._face||1)<0) !== facesLeft;
  const list=[];
  // body aura — aura pass only (behind the sprite; excluded from the front 'core' pass so it
  // never washes out the body)
  if(aura && layer==='aura'){
    list.push({ kind:'spot', x:0.5, y:0.46, rx:aura.rx, ry:aura.ry, rot:0,
                color:aura.color, alpha:aura.alpha, phase:(u.id||0)*0.13, pulse:1, sparkle:0 });
  }
  // gun / healing-mechanism — per-frame anchored, in both passes (soft halo behind + bright core in front)
  if(per){
    let mul=1;   // brighten while the matching action plays
    if(u._actState==='attack'){ const dt=state.time-(u._actStamp||0); mul = 1 + 1.1*Math.max(0, 1-Math.abs(dt-0.45)/0.45); }  // peaks on the strike
    else if(u._actState==='heal'){ mul = 1.7 + 0.3*Math.sin((state.time||0)*7); }                                              // steady, gentle heal-loop throb
    for(const g of per){
      const gg=Object.assign({}, g);
      if(flip) gg.x = 1 - gg.x;                                  // mirror normalized x like blitFrame's scale(-1,1)
      gg.pulse = (g.pulse==null?1:g.pulse) * mul;                // drawMegaNeonLayer multiplies alpha*pulse
      list.push(gg);
    }
  }
  if(list.length) drawMegaNeonLayer(state, { seed:(u.id||0) }, list, dx, dy, dw, dh, layer);
}
// Villain (boss) glow — the hero-glow machinery at boss scale, with boss colors and a phase-2
// "rage" tint. Body aura is code-synthesized (works with ZERO authored data); per-frame emitters
// come from VILLAIN_NEON_MAPS once authored. Colors/phases derive from the global VILLAINS table
// (present on every client), so the snapshot only carries villain/villainId/bossPhase/bossScale.
function villainNeonFrame(neonId, action, fi){
  if(typeof VILLAIN_NEON_MAPS==='undefined' || !VILLAIN_NEON_MAPS || !VILLAIN_NEON_MAPS.sprites) return null;
  const spr=VILLAIN_NEON_MAPS.sprites[neonId];
  const a=spr && spr[action || 'walk'];
  const fr=a && a.frames && a.frames[((fi||0)%a.frames.length+a.frames.length)%a.frames.length];
  return fr && fr.glows && fr.glows.length ? fr.glows : null;
}
function villainPhaseTint(u){
  const def=(typeof VILLAINS!=='undefined') && VILLAINS[u.villainId];
  if(!def || !def.phases || (u.bossPhase|0)<2) return null;
  let tint=null; for(const ph of def.phases){ if(ph.tint) tint=ph.tint; }   // deepest reached tint
  return tint;
}
function drawVillainGlow(state, u, anim, px, py, S, layer){
  if(!u.villain || !anim || typeof drawMegaNeonLayer!=='function') return;
  const def=(typeof VILLAINS!=='undefined') && VILLAINS[u.villainId];
  const auraColor=(def && def.auraColor) || [120,220,255];
  const tint=villainPhaseTint(u);                              // phase-2 rage color (e.g. red), else null
  // villains glow STRONGLY by default (a boss, not a trooper); brighter still in the rage phase.
  const boost=(u.bossPhase|0)>=2 ? 2.4 : 1.6;
  const per=villainNeonFrame(u.neonId, (u._actState||'walk'), u._heroFi);
  // reconstruct the EXACT blitFrame box (assets.js): foot-anchored, mirrored by facing
  const dh=S, dw=S*(anim.fw/anim.fh), dx=px-dw/2, dy=py-dh*0.7;
  const facesLeft=!!(DEF[u.type] && DEF[u.type].facesLeft);
  const flip=((u._face||1)<0) !== facesLeft;
  const list=[];
  if(layer==='aura'){                                          // big soft body halo behind the sprite (always present, even with authored emitters)
    list.push({ kind:'spot', x:0.5, y:0.50, rx:0.50, ry:0.44, rot:0,
                color:tint||auraColor, alpha:0.45*boost, phase:(u.id||0)*0.13, pulse:1, sparkle:0 });
  } else if(!per){                                             // no authored emitters → a bright additive core so the boss still reads as glowing
    list.push({ kind:'spot', x:0.5, y:0.44, rx:0.24, ry:0.22, rot:0,
                color:tint||auraColor, alpha:0.55*boost, phase:(u.id||0)*0.13, pulse:1, sparkle:0 });
  }
  if(per){                                                     // authored per-frame emitters (both passes), brighten on strike/cast
    let mul=boost;
    if(u._actState==='attack'){ const dt=state.time-(u._actStamp||0); mul *= 1 + 1.1*Math.max(0, 1-Math.abs(dt-0.45)/0.45); }
    if(u._abilCastT!=null){ const c=state.time-u._abilCastT; if(c<0.5) mul *= 1 + 1.4*(1-c/0.5); }
    for(const g of per){
      const gg=Object.assign({}, g);
      if(flip) gg.x = 1 - gg.x;
      if(tint) gg.color = tint;
      gg.pulse = (g.pulse==null?1:g.pulse) * mul;
      list.push(gg);
    }
  }
  if(list.length) drawMegaNeonLayer(state, { seed:(u.id||0) }, list, dx, dy, dw, dh, layer);
}
// ---- REBORN-CYBORG render marker (body UNTOUCHED) -----------------------------------------------
// A Wake-resurrected unit (u.reborn) is marked entirely at render time: a glowing red silhouette RIM
// behind it + a red OPTIC (machine eye) at the head + a slow chest-core heartbeat. All pixel-exact to
// the current sprite frame (built from the very frame being blitted), so it never swims, fits any unit
// shape, and never touches the body art. Render-only — keyed on the existing u.reborn flag (no save/net).
// Per-sprite-type, per-ACTION, PER-FRAME head anchor for the green optic (dx[fi] = x-offset from sprite
// center as a fraction of drawn width; fy = y as a fraction of drawn height from the top). The head moves
// with the animation (recoil/lean), so dx is a 10-frame array, indexed by the frame being drawn. Keyed by
// the strip (walk / attack / mine / heal); falls back to .walk, then _default. Mirror-aware at draw time.
// Built by a consensus of 4 silhouette head-detectors (median per frame rejects whichever one a raised
// weapon fooled) + a temporal median smooth — see the reborn-optic-head-tracking workflow.
const REBORN_OPTIC = {
  soldier:{walk:{fy:0.101,dx:[0.063,0.063,0.053,0.053,0.058,0.059,0.059,0.057,0.054,0.054]}, attack:{fy:0.099,dx:[0.077,0.077,0.073,0.003,-0.002,-0.002,0.059,0.059,0.074,0.076]}},
  ranger:{walk:{fy:0.101,dx:[-0.031,-0.031,-0.056,-0.056,-0.052,-0.052,-0.052,-0.057,-0.057,-0.056]}, attack:{fy:0.099,dx:[-0.059,-0.062,-0.091,-0.091,-0.056,-0.039,-0.039,-0.058,-0.058,-0.059]}},
  recruiter:{walk:{fy:0.101,dx:[-0.017,-0.017,-0.014,-0.014,-0.014,-0.014,-0.007,-0.007,-0.007,-0.015]}, heal:{fy:0.099,dx:[-0.032,-0.032,-0.056,-0.059,-0.059,-0.051,-0.034,-0.032,-0.032,-0.032]}},
  hustler:{walk:{fy:0.099,dx:[0.028,0.028,0.025,0.025,0.025,-0.027,-0.027,-0.017,-0.017,0.009]}, attack:{fy:0.099,dx:[0.002,0.046,0.046,-0.052,-0.052,-0.052,-0.047,0.002,0.002,0.002]}},
  lobbyist:{walk:{fy:0.1,dx:[-0.155,-0.155,-0.155,-0.153,-0.153,-0.153,-0.153,-0.139,-0.139,-0.139]}, attack:{fy:0.099,dx:[-0.273,-0.267,-0.275,-0.273,-0.314,-0.312,-0.275,-0.186,-0.223,-0.225]}},
  psychologist:{walk:{fy:0.101,dx:[-0.017,-0.017,-0.014,-0.014,-0.014,-0.014,-0.007,-0.007,-0.007,-0.015]}, heal:{fy:0.099,dx:[-0.032,-0.032,-0.056,-0.059,-0.059,-0.051,-0.034,-0.032,-0.032,-0.032]}},
  worker:{walk:{fy:0.099,dx:[-0.046,-0.04,-0.033,-0.022,-0.022,-0.034,-0.034,-0.034,-0.045,-0.046]}, mine:{fy:0.102,dx:[0.046,-0.012,-0.012,0.047,0.059,0.059,0.03,0.03,0.044,0.046]}},
  founder:{walk:{fy:0.102,dx:[0.027,0.027,0.027,0.024,0.024,0.024,0.027,0.027,0.025,0.025]}, attack:{fy:0.108,dx:[-0.022,-0.022,-0.022,-0.019,-0.009,-0.006,-0.006,-0.008,-0.01,-0.01]}},
  nino:{walk:{fy:0.099,dx:[-0.117,-0.117,-0.117,-0.115,-0.115,-0.113,-0.113,-0.099,-0.098,-0.098]}, attack:{fy:0.099,dx:[-0.303,-0.293,-0.297,-0.293,-0.289,-0.347,-0.305,-0.207,-0.238,-0.238]}},
  biba:{walk:{fy:0.199,dx:[0.019,0.021,0.021,0.019,0.018,0.017,0.017,0.005,0.005,0.005]}, heal:{fy:0.101,dx:[-0.013,-0.017,-0.035,-0.035,-0.032,-0.032,-0.052,-0.052,-0.014,-0.013]}},
  rust:{walk:{fy:0.101,dx:[0.008,0.008,0.008,0.007,0.007,0.007,0.007,0.011,0.011,0.011]}, attack:{fy:0.213,dx:[0.055,0.057,0.057,0.057,0.057,0.059,0.066,0.066,0.052,0.052]}},
  _default:{walk:{fy:0.12,dx:[0,0,0,0,0,0,0,0,0,0]}}
};
let _rbScratch=null;
function _rebornScratch(w,h){
  if(!_rbScratch) _rbScratch=document.createElement('canvas');
  const c=_rbScratch; if(c.width<w) c.width=w; if(c.height<h) c.height=h; return c;
}
function drawRebornRim(u, anim, px, pyB, S, fi, t, c1, c2, alphaMul){
  if(!anim || !anim.img || !anim.frames || !anim.fh) return;
  const am=(alphaMul==null?1:alphaMul); if(am<=0) return;     // EX-TERMINATOR board-fade: rim fades WITH the body (no lingering green ghost)
  const n=anim.frames.length, fr=anim.frames[((fi%n)+n)%n];
  if(!fr) return;
  const dh=S, dw=S*(anim.fw/anim.fh), pad=6;
  const cw=Math.max(1,Math.ceil(dw+pad*2)), ch=Math.max(1,Math.ceil(dh+pad*2));
  const sc=_rebornScratch(cw,ch), sx=sc.getContext('2d');
  sx.save(); sx.clearRect(0,0,cw,ch);
  sx.translate(cw/2, pad);                                   // center x, top at pad (matches blitFrame -dw/2,0)
  const facesLeft=!!(DEF[u.type] && DEF[u.type].facesLeft);
  if(((u._face||1)<0)!==facesLeft) sx.scale(-1,1);
  sx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2, 0, dw, dh);
  sx.restore();
  const rm=(typeof megaReducedMotion==='function' && megaReducedMotion()), seed=(u.id||0);
  const bx=px-cw/2, by=pyB - dh*0.7 - pad;                   // align the scratch onto the sprite's blit box
  const R=Math.max(1.0, S*0.022);                            // thin rim, scales with the unit
  // recolor the silhouette in the scratch (source-in keeps the silhouette alpha), then blit it as a rim
  // at 8 ring offsets behind the sprite, additively.
  const tint=(c)=>{ sx.globalCompositeOperation='source-in'; sx.fillStyle=c; sx.fillRect(0,0,cw,ch); sx.globalCompositeOperation='source-over'; };
  const blit=()=>{ for(let i=0;i<8;i++){ const a=i/8*6.2832; ctx.drawImage(sc, 0,0,cw,ch, bx+Math.cos(a)*R, by+Math.sin(a)*R, cw, ch); } };
  ctx.save(); ctx.globalCompositeOperation='lighter';
  // PASS 1 — the steady silver rim (the main, dominant color), faint breath
  const sil=rm?0.5:(0.5+0.5*Math.sin(t*2.0+seed*1.3));
  tint(c1||'#c4d2e6'); ctx.globalAlpha=(0.20+0.05*sil)*am; blit();
  // PASS 2 — an A&O toxic-green sheen that breathes CONTINUOUSLY over the silver (ebbs and flows). Slower,
  // out-of-phase sine so it reads as organic flow, not a strobe; capped so the silver stays dominant.
  const grn=rm?0.45:(0.5+0.5*Math.sin(t*1.25+seed*0.7));
  tint(c2||'#32e060'); ctx.globalAlpha=(0.03+0.15*grn)*am; blit();
  ctx.restore(); ctx.globalAlpha=1;
}
// NINO cloak rim — a TRUE purple OUTLINE (not a filled silhouette): dilate the sprite shape, punch out
// its interior, tint purple, composite additively. The hollow interior lets the 25% body show through,
// so you still read Nino's art at 25% opacity with only a purple edge — never a grey/solid-purple blob.
let _cloakScratch=null;
function drawCloakRim(u, anim, px, pyB, S, fi, t){
  if(!anim || !anim.img || !anim.frames || !anim.fh) return;
  const n=anim.frames.length, fr=anim.frames[((fi%n)+n)%n]; if(!fr) return;
  const dh=S, dw=S*(anim.fw/anim.fh), pad=8;
  const cw=Math.max(1,Math.ceil(dw+pad*2)), ch=Math.max(1,Math.ceil(dh+pad*2));
  if(!_cloakScratch) _cloakScratch=document.createElement('canvas');
  const sc=_cloakScratch; if(sc.width<cw) sc.width=cw; if(sc.height<ch) sc.height=ch;
  const sx=sc.getContext('2d');
  sx.save(); sx.setTransform(1,0,0,1,0,0); sx.globalCompositeOperation='source-over'; sx.clearRect(0,0,sc.width,sc.height);
  sx.translate(cw/2,pad);
  const facesLeft=!!(DEF[u.type]&&DEF[u.type].facesLeft);
  if(((u._face||1)<0)!==facesLeft) sx.scale(-1,1);
  const R=Math.max(1.4, S*0.045);                                   // outline thickness
  for(let i=0;i<8;i++){ const a=i/8*6.2832; sx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2+Math.cos(a)*R, Math.sin(a)*R, dw, dh); }   // dilated silhouette
  sx.globalCompositeOperation='destination-out';
  sx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2, 0, dw, dh);   // punch out the body → leaves the ring only
  sx.restore();
  sx.save(); sx.setTransform(1,0,0,1,0,0); sx.globalCompositeOperation='source-in'; sx.fillStyle='#b14dff'; sx.fillRect(0,0,cw,ch); sx.restore();   // tint the ring purple
  const breath=0.62+0.38*Math.sin((t||0)*2.2+((u.id||0)*1.3));
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.5+0.4*breath;
  ctx.drawImage(sc, 0,0,cw,ch, px-cw/2, pyB-dh*0.7-pad, cw,ch);
  ctx.globalAlpha=1; ctx.restore();
}
// ---- boss-occlusion overlay -----------------------------------------------------------------
// A boss like REX draws 4× big and Y-sorts in front of any player unit behind its feet, swallowing
// the unit + its hp bar. This pass (run AFTER the depth loop) marks each hidden player unit with a
// team-colored OUTLINE (rim only — the body interior stays fully TRANSPARENT, so the opaque boss
// shows through the middle) plus its hp bar + selection ring, ON TOP of the boss. The boss sprite is
// never read, dimmed, or made transparent. Cosmetic + position-derived (reads only live x/y/hp/owner/
// selected), identical on solo/host/client; no _ghostBlit, no save/net changes.
let _occScratch=null;
function _occRim(u, anim, px, pyB, S, fi, color){
  if(!anim || !anim.img || !anim.frames || !anim.fh) return false;
  const n=anim.frames.length, fr=anim.frames[((fi%n)+n)%n]; if(!fr) return false;
  const dh=S, dw=S*(anim.fw/anim.fh), pad=8;
  const cw=Math.max(1,Math.ceil(dw+pad*2)), ch=Math.max(1,Math.ceil(dh+pad*2));
  if(!_occScratch) _occScratch=document.createElement('canvas');
  const sc=_occScratch; if(sc.width<cw) sc.width=cw; if(sc.height<ch) sc.height=ch;
  const sx=sc.getContext('2d');
  sx.save(); sx.setTransform(1,0,0,1,0,0); sx.globalCompositeOperation='source-over'; sx.clearRect(0,0,sc.width,sc.height);
  sx.translate(cw/2,pad);
  const facesLeft=!!(DEF[u.type] && DEF[u.type].facesLeft);
  if(((u._face||1)<0)!==facesLeft) sx.scale(-1,1);
  const R=Math.max(2, S*0.06);                                                              // outline thickness, scales with the unit
  for(let i=0;i<8;i++){ const a=i/8*6.2832; sx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2+Math.cos(a)*R, Math.sin(a)*R, dw, dh); }   // dilated silhouette (8 offset copies)
  sx.globalCompositeOperation='destination-out';
  sx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2, 0, dw, dh);                    // punch out the body interior → RING only; the middle stays fully transparent
  sx.restore();
  sx.save(); sx.setTransform(1,0,0,1,0,0); sx.globalCompositeOperation='source-in'; sx.fillStyle=color; sx.fillRect(0,0,cw,ch); sx.restore();   // tint the ring (keeps the ring's alpha)
  ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  ctx.drawImage(sc, 0,0,cw,ch, px-cw/2, pyB-dh*0.7-pad, cw,ch);                             // opaque team-color outline; the boss shows through the transparent interior
  ctx.restore();
  return true;
}
function drawBossOcclusionOverlay(state, ox, oy){
  if(state.hub) return;
  if((state.zoom||1) < SPRITE_LOD_ZOOM) return;            // bars/silhouettes are culled this far out anyway
  const ents=state.entities; if(!ents) return;
  let bosses=null;
  for(const u of ents){ if(u && !u.dead && u.villain && (u.bossScale||1)>=1.5) (bosses||(bosses=[])).push({hb:unitHitBox(u), sy:u.y}); }
  if(!bosses) return;
  for(const p of ents){
    if(!p || p.dead || p.owner!=='player' || p.kind==='building' || p._ninjaHidden || p.storedIn) continue;
    const alt=p.air?16:0, vh=unitDrawH(p), midY=p.y-alt-vh*0.2;
    let hid=false;
    for(const b of bosses){ const hb=b.hb; if(p.y<b.sy && p.x>=hb.cx-hb.hw && p.x<=hb.cx+hb.hw && midY>=hb.top && midY<=hb.bot){ hid=true; break; } }   // behind the boss AND inside its drawn box
    if(!hid) continue;
    const px=p.x+ox, py=p.y+oy, sType=p.spriteType||p.type;
    const fac=(typeof aoSide==='function' && aoSide(state,p.owner))?'ao':null;
    const anim=(typeof unitWalk==='function')?unitWalk(sType,p.owner,fac):null;
    const n=anim?anim.frames.length:1, fi=((p._still||0)<6) ? (((p._walkDist||0)/9)|0)%n : 0;   // reuse the walk frame drawUnit already advanced this frame
    const _red=(typeof isRedSide==='function')&&isRedSide(p.owner), _p2=(p.owner==='player'&&p.ctrl==='p2');
    const rim=_red?'#ff6e5e':(_p2?'#ffc24d':'#5aa0ff');
    _occRim(p, anim, px, py-alt, vh, fi, rim);
    barAt(px-vh*0.3, py-alt-vh*0.72-6, vh*0.6, 4, p.hp/p.maxHp, hpColor(p.hp/p.maxHp));   // always show the bar (who's there + their health)
    if(p.selected){ ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(px, py-alt+vh*0.3, vh*0.34, vh*0.14, 0,0,6.28); ctx.stroke(); }
  }
}
function drawRebornCore(u, anim, px, pyB, S, fi, t, key){
  const rm=(typeof megaReducedMotion==='function' && megaReducedMotion()), seed=(u.id||0);
  ctx.save(); ctx.globalCompositeOperation='lighter';
  // chest core — a slow, tired heartbeat (double-thump)
  let beat=0.55;
  if(!rm){ const ph=((t*0.85)+seed*0.37)%1;
    const thump=Math.exp(-Math.pow(ph/0.10,2))+0.6*Math.exp(-Math.pow((ph-0.17)/0.09,2)); beat=0.40+0.5*Math.min(1,thump); }
  const cx=px, cy=pyB - S*0.34, cr=S*0.16;
  const hg=ctx.createRadialGradient(cx,cy,1,cx,cy,cr);
  hg.addColorStop(0,'rgba(255,80,66,'+(0.52*beat).toFixed(3)+')');
  hg.addColorStop(0.5,'rgba(220,40,46,'+(0.20*beat).toFixed(3)+')');
  hg.addColorStop(1,'rgba(150,20,30,0)');
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(cx,cy,cr,0,6.2832); ctx.fill();
  // optic — a small A&O-GREEN machine-eye on the unit's HEAD, anchored per sprite-type & ACTION strip
  // (REBORN_OPTIC, measured from the art), mirrored the same way blitFrame mirrors the sprite.
  const _t=REBORN_OPTIC[u.spriteType||u.type]||REBORN_OPTIC._default;
  const _m=_t[key]||_t.walk||REBORN_OPTIC._default.walk;
  const _dxN=_m.dx[(((fi|0)%_m.dx.length)+_m.dx.length)%_m.dx.length];   // per-frame → follows the head's recoil/lean
  const _dw=(anim&&anim.fh)?S*(anim.fw/anim.fh):S;
  const _fl=!!(DEF[u.type]&&DEF[u.type].facesLeft), _mir=(((u._face||1)<0)!==_fl)?-1:1;
  const ox=px + _mir*_dxN*_dw, oy=(pyB-0.7*S)+_m.fy*S, orr=S*0.09;
  const fl=rm?0.85:(0.7+0.3*Math.sin(t*5.6+seed*1.9));
  const og=ctx.createRadialGradient(ox,oy,0.5,ox,oy,orr);
  og.addColorStop(0,'rgba(180,255,170,'+(0.85*fl).toFixed(3)+')');
  og.addColorStop(0.4,'rgba(60,224,110,'+(0.5*fl).toFixed(3)+')');
  og.addColorStop(1,'rgba(20,150,55,0)');
  ctx.fillStyle=og; ctx.beginPath(); ctx.arc(ox,oy,orr,0,6.2832); ctx.fill();
  ctx.globalAlpha=Math.min(1,fl); ctx.fillStyle='#d8ffdc';
  ctx.beginPath(); ctx.arc(ox,oy,Math.max(1.2,S*0.02),0,6.2832); ctx.fill();
  ctx.restore(); ctx.globalAlpha=1;
}
// ---- Vehicle/air "lean into the climb" tilt (render-only) ---------------------------------------
// Vehicle/air sprites are single camera-facing ("down") walk strips with no up/down frames, so heading
// up reads as driving backwards. FULL rotation tips a camera-facing sprite upside-down, so instead we add
// a small CLAMPED bank — the sprite still flips L/R normally and stays upright, but tilts up to ROT_LEAN
// into its travel direction when climbing (0 going straight down/horizontal, so it can never invert). The
// tilt eases in/out so a turn animates. Pure render: derives from the per-frame movement delta, holds for
// solo/host/client with NO save/sync change. `?norotate=1` kills it (A/B), matching the repo's flags.
const ROT_OFF = (typeof location!=='undefined' && /[?&]norotate\b/.test(location.search||''));
const ROT_PIVOT = 0.2;    // pivot = sprite visual centre, as a fraction of drawn height up from the foot anchor
const ROT_LEAN  = 0.42;   // max bank in radians (~24°); applied to up-diagonals, scaled by how steep the climb is
function isRotUnit(u){ const d=DEF[u.type]; return !!(d && (d.vehicle || d.air)); }
// Update the eased bank angle u._rot (and the u._rotMode gate) once per frame. Non-rot units → _rotMode=false.
function updateUnitRot(u, mvx, mvy, md){
  if(ROT_OFF || !isRotUnit(u)){ u._rotMode=false; return; }
  u._rotMode=true;
  let goal=0;
  if(md>0.4){
    const upfrac=Math.max(0, Math.min(1, -mvy/md));        // 1 = straight up, 0 = horizontal or descending
    const hsign =Math.max(-1, Math.min(1, mvx/(0.35*md))); // smoothed left/right (no snap when crossing vertical)
    goal = ROT_LEAN * upfrac * hsign;                       // bank into the climb; 0 going down → never inverts
  }
  if(u._rot==null){ u._rot=goal; return; }                 // newly-built: snap, don't ease up from 0
  const k=(typeof megaReducedMotion==='function'&&megaReducedMotion())?1:0.18;   // reduced-motion → snap, no animated tilt
  u._rot+=(goal-u._rot)*k;
}
// Begin/end a rotation transform around the sprite's visual centre (foot anchor lifted by ROT_PIVOT·S).
// Wraps the sprite + its overlays so the bank rotates them rigidly together; no-op for non-rot units.
function rotBegin(u, px, footY, S){ if(!u._rotMode) return; const pivY=footY-ROT_PIVOT*S; ctx.save(); ctx.translate(px,pivY); ctx.rotate(u._rot||0); ctx.translate(-px,-pivY); }
function rotEnd(u){ if(u._rotMode) ctx.restore(); }
function drawUnit(state,u,ox,oy){
  const px=u.x+ox, py=u.y+oy;
  const r=u.r;
  const alt = u.air?16:0;   // flyers are drawn raised
  const vh = unitDrawH(u);   // drawn sprite height (incl. hero 15% bump) — HUD/ring scale to this, not collision r
  const _vdef = (u.villain && typeof VILLAINS!=='undefined') ? VILLAINS[u.villainId] : null;   // villains can force a sprite variant (THE SEVERANCIER → player set)
  const fac = (_vdef && _vdef.spriteFaction) || (aoSide(state, u.owner) ? 'ao' : null);   // A&O alien sprite set, else owner-keyed (render-only). Reborn does NOT recolor the body — see drawRebornFx().
  const jz = u._jumpZ||0;   // REX jump-stomp: lifts the sprite off the ground (shadow drawn at the foot below)

  if(PERF.opts.spriteLod && (state.zoom||1) < SPRITE_LOD_ZOOM){
    // LIGHT path: the legible animations (walk cycle + attack/action swing) DO play — a static
    // sprite read as a rendering bug here — but the sub-pixel idle "life" layers (breathing/fidget),
    // glow/rim/aura/shadow and ALL per-unit HUD (hp bar / stars / badge / pip) stay culled (illegible
    // at ~11–14px, yet cost real work ×units). Movement + frame selection mirror the canonical full
    // path below (render.js ~2026 + ~2083); keep the two in sync if the walk/attack timing changes.
    const sType = u.spriteType || u.type;
    const anim = unitWalk(sType, u.owner, fac);
    // movement state (also keeps _ax/_ay fresh, so the walk cycle/facing don't snap on zoom-in)
    const lax = u._ax==null?u.x:u._ax, lay = u._ay==null?u.y:u._ay;
    const mvx = u.x-lax, mvy = u.y-lay, md = Math.hypot(mvx,mvy);
    u._ax=u.x; u._ay=u.y;
    u._walkDist = (u._walkDist||0)+md;
    if(md>0.25){ u._still=0; if(Math.abs(mvx)>0.15 && !u._actState) u._face = mvx<0?-1:1; }
    else u._still=(u._still||0)+1;
    updateUnitRot(u, mvx, mvy, md);
    const moving = u._netMoving || (u._still||0) < 6;
    if(u.selected){ ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(px, py-alt+vh*0.3, vh*0.34, vh*0.14, 0,0,6.28); ctx.stroke(); }
    if(anim){
      let useAnim = anim, fi;
      const act = u._actState ? actionAnim(sType, u._actState, u.owner, fac) : null;
      if(act){
        useAnim = act; const n = act.frames.length;
        if(u._actState==='attack' || u._actState.indexOf('attack')===0){ const t = state.time-(u._actStamp||0); const adur = u._actDur || 0.8;
          fi = t<adur ? Math.min(n-1, (t/adur*n)|0) : (u._actDur ? n-1 : 0); }
        else fi = ((state.time*7)|0) % n;                                   // mine / heal loop
      } else {
        const stridePx = (sType==='ninja') ? 15 : 9;
        fi = moving ? (((u._walkDist||0)/stridePx)|0) % anim.frames.length : 0;
      }
      rotBegin(u, px, py-alt, vh);
      blitFrame(u, px, py-alt, useAnim, vh, fi);                          // light: walk/attack anim, no idle "life" layers, no HUD
      rotEnd(u);
    }
    else { ctx.fillStyle = isRedSide(u.owner)?'#c0392b':(u.ctrl==='p2'?'#c47a1f':'#3b7fd0'); ctx.fillRect(px-r*0.6, py-alt-r*0.6, r*1.2, r*1.2); }
    if(u.hitFx>0) u.hitFx-=1/60;                                          // keep the transient decaying so it doesn't freeze
    return;
  }

  // ---- movement state for sprite animation (updated each render frame) ----
  const lax = u._ax==null?u.x:u._ax, lay = u._ay==null?u.y:u._ay;
  const mvx = u.x-lax, mvy = u.y-lay, md = Math.hypot(mvx,mvy);
  u._ax=u.x; u._ay=u.y;
  if(u._ninjaAI || u.sprinting){ (u._trailBuf||(u._trailBuf=[])).push({x:u.x,y:u.y}); if(u._trailBuf.length>7) u._trailBuf.shift(); }   // dash/sprint afterimage source (works on the client too — position-derived; T2-6 makes Sprint legible)
  u._walkDist = (u._walkDist||0)+md;
  if(md>0.25){ u._still=0; if(Math.abs(mvx)>0.15 && !u._actState) u._face = mvx<0?-1:1; }   // combat (_actState) → trust the authoritative facing (host/sim), don't flip from interpolated drift
  else u._still=(u._still||0)+1;
  updateUnitRot(u, mvx, mvy, md);   // vehicles/air: ease the bank angle u._rot (render-only lean-into-climb)
  const moving = u._netMoving || (u._still||0) < 6;   // debounce so brief stalls don't flicker to idle; _netMoving = host-authoritative locomotion (co-op client) so eased sub-threshold motion still animates

  ctx.save();
  if(u._ninjaHidden){ const _nN=(_vdef&&_vdef.ninja)||{}; ctx.globalAlpha*=(_nN.hideAlpha||0.16); }   // smoke-bomb vanish: dim the whole sprite (+ glow) within this save
  if(u._cloaked) ctx.globalAlpha*=0.25;   // NINO cloak: dim the whole sprite (the purple rim below stays full as the cloak tell)
  if(u._convFlashT>0) u._convFlashT=Math.max(0, u._convFlashT-1/60);   // BIBA conversion red-flash decay (render-only; sim/clients both tick it down here)
  // EX-TERMINATOR board-fade: he dissolves as the bomber grabs him. Applied to the glow/rim here AND
  // RE-APPLIED at the blit below, because drawRebornRim (the green rim) resets globalAlpha to 1.
  let _exA = 1;
  if(state.bossExtract && u._extracting && typeof bossExtractFrame==='function'){ const _ef=bossExtractFrame(state); if(_ef) _exA = Math.max(0, 1-(_ef.bossFade||0)); if(_exA<1) ctx.globalAlpha *= _exA; }
  // selection ring — a ground ellipse under the sprite's FEET, scaled to the sprite (no shadow)
  if(u.selected){
    const fy=py-alt+vh*0.3, rx=vh*0.34, ry=vh*0.14;
    ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(px,fy,rx,ry,0,0,6.28); ctx.stroke();
    // T1-2: cooldown sweep on the ring (SELECTED units only) — a golden arc refills as the shot
    // comes back; the plain green ring above = ready. Reads "when can I shoot again?" at a glance.
    const _cdef=DEF[u.type]||{};
    if(_cdef.dmg>0 && (u.cd||0)>0 && (_cdef.cd||0)>=0.25){
      const tot=u._bossCd||_cdef.cd, f=Math.max(0,Math.min(1,1-(u.cd/tot)));
      ctx.strokeStyle='rgba(255,216,107,0.95)'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.ellipse(px,fy,rx,ry,0,-1.5708,-1.5708+6.2832*f); ctx.stroke();
    }
  }
  // REX leap: a ground shadow at the foot that shrinks + fades as the mech rises (reads as real height)
  if(jz>0){ const fy=py-alt+vh*0.3, k=Math.max(0,1-jz/((u.r||16)*4.5)), rad=vh*0.34*(0.45+0.55*k);
    ctx.save(); ctx.globalAlpha=0.34*k; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(px,fy,rad,rad*0.4,0,0,6.28); ctx.fill(); ctx.restore(); }

  // A&O alien ground-aura (render-only): faint toxic-green additive halo under the feet, drawn
  // beneath the sprite. Owner-gated (captured A&O → fac null → no aura), off under reduced-motion.
  if(fac==='ao' && !(typeof megaReducedMotion==='function' && megaReducedMotion())){
    const fy=py-alt+vh*0.3, t=state.time||0, pulse=0.5+0.5*Math.sin(t*1.6+(u.id||0)*1.7), ar=vh*0.5;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const ag=ctx.createRadialGradient(px, fy, 1, px, fy, ar);
    ag.addColorStop(0,'rgba(34,160,70,'+(0.15+0.08*pulse).toFixed(3)+')');
    ag.addColorStop(1,'rgba(20,90,40,0)');
    ctx.fillStyle=ag; ctx.beginPath(); ctx.ellipse(px, fy, ar, ar*0.42, 0, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  const _red = isRedSide(u.owner);
  const _p2  = (u.owner==='player' && u.ctrl==='p2');   // co-op 2nd player → amber fallback shapes
  const team = _red ? '#c0392b' : (_p2 ? '#c47a1f' : '#3b7fd0');
  const teamL= _red ? '#e57368' : (_p2 ? '#ffb84d' : '#7fb7f0');

  const sType = u.spriteType || u.type;   // hero visual override (e.g. Nino → 'nino'); gameplay still uses u.type
  const anim = unitWalk(sType, u.owner, fac);
  if(anim){
    const S = vh;
    const act = u._actState ? actionAnim(sType, u._actState, u.owner, fac) : null;
    let fi, useAnim, useKey='walk', bScale=1, bShift=0;   // useKey: which strip is drawn (for the reborn optic anchor); bScale/bShift: idle breathing
    if(act){
      useAnim = act; useKey = u._actState; const n=act.frames.length;
      if(u._actState==='attack' || u._actState.indexOf('attack')===0){ const t = state.time-(u._actStamp||0);   // swing windup→strike→recover across the strip ('attack', and EX-TERMINATOR's attack_melee/_pistol/_minigun)
        const adur = u._actDur || 0.8;                                              // bosses stretch the strip over the FULL ability so the move is legible; normal units keep the 0.8s swing
        fi = t<adur ? Math.min(n-1, (t/adur*n)|0) : (u._actDur ? n-1 : 0); }        // hold the follow-through frame at the end for a boss; normal units snap back to neutral
      else { fi = ((state.time*7)|0) % n; }                                        // mine / heal loop
    } else {
      // ---- IDLE PATH: walk frame 0 when still, plus render-only "life" layers ----
      const stridePx = (sType==='ninja') ? 15 : 9;   // px of travel per walk frame; ninja uses 15 → legs cycle at 60% of default rate (25% slower, then a further 20%)
      useAnim = anim; fi = moving ? (((u._walkDist||0)/stridePx)|0) % anim.frames.length : 0;
      if(!u.captive){                                  // captives stay frozen
        const idleAmount = moving ? 0 : Math.max(0, Math.min(1, ((u._still||0)-6)/IDLE.rampFrames));
        // LAYER 2 — occasional action fidget (settled, grounded units): replay the
        // unit's own action strip once as a gesture (no _actState → no combat/bullets).
        if(!moving && idleAmount>0){
          const fa = fidgetAction(sType), a = fa ? actionAnim(sType, fa, u.owner, fac) : null;
          if(a){
            const cyc = IDLE.fidgetMin + h01(u.id+1.3)*(IDLE.fidgetMax-IDLE.fidgetMin);
            const dur = IDLE.gestureMin + h01(u.id*1.7+2.1)*(IDLE.gestureMax-IDLE.gestureMin);
            const local = (state.time + h01(u.id*2.9+0.7)*cyc) % cyc;
            if(local < dur){ const p=local/dur, n=a.frames.length, tri=1-Math.abs(1-2*p);   // 0→1→0 ping-pong
              useAnim = a; useKey = fa; fi = Math.min(n-1, (tri*(n-1))|0); }
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
    u._heroFi = fi;   // frame index actually shown — so the per-frame hero glow looks up the right anchor
    const pyB = (py-alt)+bShift-jz;   // sprite/glow baseline, lifted by a REX leap (jz)
    rotBegin(u, px, pyB, S*bScale);   // vehicles/air: bank sprite + all silhouette overlays rigidly into the climb
    if(u.hero) drawHeroGlowLayer(state, u, useAnim, px, pyB, S*bScale, 'aura');   // halo behind
    else if(u.villain) drawVillainGlow(state, u, useAnim, px, pyB, S*bScale, 'aura');
    // NINJA-AI villain dash / SPRINT afterimage (T2-6): faint additive ghosts of the current frame at recent
    // positions; ghosts coincident with the live sprite (idle) are skipped, so a streak only appears
    // while actually moving fast — which makes a sprinting squad read as sprinting at a glance.
    if((u._ninjaAI || u.sprinting) && u._trailBuf && u._trailBuf.length>1 && !(typeof megaReducedMotion==='function'&&megaReducedMotion())){
      const buf=u._trailBuf, nb=buf.length;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      for(let i=0;i<nb-1;i++){ const g=buf[i], gdx=u.x-g.x, gdy=u.y-g.y;
        if(gdx*gdx+gdy*gdy < 9) continue;
        ctx.globalAlpha=0.16*(i/nb); blitFrame(u, g.x+ox, (g.y-alt)+bShift, useAnim, S*bScale, fi); }
      ctx.restore(); ctx.globalAlpha=1;
    }
    // REBORN-CYBORG marker (render-only, body UNTOUCHED): a glowing red silhouette RIM drawn behind
    // the sprite — pixel-exact to the art, identical every frame (no swim), on any unit shape.
    if(u.reborn) drawRebornRim(u, useAnim, px, pyB, S*bScale, fi, state.time||0);
    else if(u.villain && _vdef && _vdef.cyborgRim) drawRebornRim(u, useAnim, px, pyB, S*bScale, fi, state.time||0, '#3ad070', '#7dffa6', _exA);   // GREEN cyborg silhouette rim (EX-TERMINATOR) — render-only FX, body sprite untouched; _exA fades the rim WITH the body during bomber-board
    else if(u._convFlashT>0) drawRebornRim(u, useAnim, px, pyB, S*bScale, fi, state.time||0, '#ff6055', '#ffb060', u._convFlashT);   // BIBA mind-control: red conversion flash, fades with _convFlashT
    if(u.villain && u._exposed){   // OVERHEAT: a hot pulsing rim while the boss is vented + EXPOSED (the "burn it now" tell) — render-only, body untouched
      const ohPulse=0.55+0.45*Math.abs(Math.sin((state.time||0)*16));
      drawRebornRim(u, useAnim, px, pyB, S*bScale, fi, state.time||0, '#ff9326', '#fff0c2', ohPulse);
    }
    if(_exA<1) ctx.globalAlpha *= _exA;   // EX-TERMINATOR board-fade: re-apply — drawRebornRim above reset globalAlpha to 1
    // NINO cloak: the body stays a CLEAN 25%-opacity ghost — it was dimmed once at the ctx.save() above and
    // composites straight over the world (NO silhouette drawn behind it, which is what greyed it before).
    const dh = blitFrame(u,px,pyB,useAnim,S*bScale,fi);
    // remember what was just blitted (screen px, valid this frame only) so the post-depth
    // pass can re-draw a faint ghost when a building sprite occludes this unit
    u._ghostBlit = { t:state.time, px, py:pyB, anim:useAnim, S:S*bScale, fi };
    if(u.hero) drawHeroGlowLayer(state, u, useAnim, px, pyB, S*bScale, 'core');   // bright core in front
    else if(u.villain) drawVillainGlow(state, u, useAnim, px, pyB, S*bScale, 'core');
    // REBORN-CYBORG: a red OPTIC (machine eye) at the head + a slow chest-core heartbeat, on top.
    if(u.reborn) drawRebornCore(u, useAnim, px, pyB, S*bScale, fi, state.time||0, useKey);
    // NINO cloak: a TRUE purple outline drawn LAST — the body stayed a clean 25% ghost (you still read
    // Nino's art through it), and only the edge is purple. Never grey, never a solid-purple blob.
    if(u._cloaked) drawCloakRim(u, useAnim, px, pyB, S*bScale, fi, state.time||0);
    if(u.type==='worker' && u.carrying>0){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(px,py-alt-dh*0.7-4,3,0,6.28); ctx.fill(); }
    rotEnd(u);
  } else if(u.villain){
    // defensive fallback — a villain whose bespoke sheet is missing still reads as a giant glowing mass
    const def=(typeof VILLAINS!=='undefined') && VILLAINS[u.villainId], col=(def&&def.neonColor)||'#50e6ff';
    const rr=vh*0.32; ctx.fillStyle='rgba(12,16,22,.92)'; ctx.beginPath(); ctx.arc(px,py-alt-rr,rr,0,6.28); ctx.fill();
    ctx.strokeStyle=col; ctx.lineWidth=3; ctx.stroke();
    drawVillainGlow(state, u, {fw:1,fh:1,frames:[0]}, px, py-alt, vh, 'aura');
    drawVillainGlow(state, u, {fw:1,fh:1,frames:[0]}, px, py-alt, vh, 'core');
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
  // MADOSIS (T1-5): a managed-tension bar under the hp bar — always readable on a SELECTED unit
  // with a minted threshold, escalating purple → amber (>0.6) → red (>0.85) with a calm ~2Hz pulse
  // near the edge (static under prefers-reduced-motion). Pure draw of already-computed state.
  if(u.owner==='player' && typeof madThreshold==='function'){
    const thr=madThreshold(u);
    const _mad = (typeof madEffective==='function') ? madEffective(u) : (u.madosis||0);   // field relief (Mindfulness Facilitator) shows here
    if(u.madEpisode || u.madDog || (thr>0 && (_mad >= thr*0.6 || u.selected))){
      const frac = u.madDog ? 1 : (thr>0 ? Math.min(1,_mad/thr) : 1);
      const col = madColor(frac);
      const _rm=(typeof megaReducedMotion==='function'&&megaReducedMotion());
      if(frac>0.85 && !_rm) ctx.globalAlpha=0.7+0.3*Math.sin((state.time||0)*12.57);   // ~2Hz, not a strobe
      barAt(px-vh*0.3, py-alt-vh*0.72-1, vh*0.6, 3, frac, col);
      ctx.globalAlpha=1;
    }
  }
  if(u.stars) drawStars(u, px, py-alt-vh*0.72-13);   // career-rank pips above the HP bar
  // MADOSIS rescue: "memories X/3" cue above a feral dog (shown the instant it turns — its memories are already on the map)
  if(u.madDog && u.calmStage!=null){
    ctx.fillStyle='#d9b3ff'; ctx.font='bold 10px '+GAME_FONT; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText('memories '+(u.calmStage||0)+'/'+MADOSIS.echoFacets.length, px, py-alt-vh*0.72-19);
  }
  // control-group badge (lowest assigned number) — at the sprite's lower-right
  if(u.owner==='player' && u._groups instanceof Set && u._groups.size){
    const g=Math.min(...[...u._groups].map(Number)); const bx=px+vh*0.30, by=py-alt+vh*0.24;
    ctx.fillStyle='rgba(10,16,26,.85)'; ctx.strokeStyle='#7fd6ff'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#cfe9ff'; ctx.font='bold 9px '+GAME_FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(g, bx, by+0.5);
  }
  // co-op controller pip — small dot at the foot so you can tell p1/p2 units apart (sprite-agnostic)
  if(netRole!=='solo' && u.owner==='player'){
    ctx.fillStyle=ctrlColor(u.ctrl); ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(px - vh*0.30, py-alt+vh*0.30, 3, 0, 6.28); ctx.fill(); ctx.stroke();
  }
  // hit flash (T1-2): brighter + slightly longer (~0.18s, set in damage()); killing blows pop a
  // 1-frame white core (set via u._dieFlash) so the last hit reads distinctly.
  if(u.hitFx>0){
    ctx.fillStyle='rgba(255,96,80,'+Math.min(0.8,u.hitFx*4)+')'; ctx.beginPath(); ctx.arc(px,py-vh*0.2,vh*0.38,0,6.28); ctx.fill();
    if(u._dieFlash){ ctx.fillStyle='rgba(255,255,255,'+Math.min(0.9,u.hitFx*5)+')'; ctx.beginPath(); ctx.arc(px,py-vh*0.2,vh*0.30,0,6.28); ctx.fill(); }
    u.hitFx-=1/60;
  }
  // MADOSIS: feral mad dogs pulse a hostile purple aura; rescued (subdued) units a faint calm one
  // (calm ~1Hz pulse; static under prefers-reduced-motion — photosensitivity, T1-5)
  if(u.madDog){
    const _rm=(typeof megaReducedMotion==='function'&&megaReducedMotion());
    ctx.save(); ctx.globalAlpha=_rm?0.6:0.5+0.3*Math.sin((state.time||0)*6);
    ctx.strokeStyle='#b05bff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(px,py-vh*0.2,vh*0.44,0,6.28); ctx.stroke(); ctx.restore();
  } else if(u.subdued){
    ctx.save(); ctx.globalAlpha=0.35; ctx.strokeStyle='#7fffd0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(px,py-vh*0.2,vh*0.38,0,6.28); ctx.stroke(); ctx.restore();
  }
}

// MADOSIS rescue beacon — a floating neon memory shard over its glowing purple ground pool (the
// pool is painted as a pre-pass decal under all sprites; this is the depth-sorted beacon). Purple
// leads (the madosis color language); the facet survives as the glyph + accent tint
// (trauma ! / family ♥ / dream ★) so the three memories stay distinguishable.
function drawEcho(state, e, ox, oy){
  const px=e.x+ox, py=e.y+oy;
  const PUR='#b05bff', LIT='#e6c8ff';
  const accent = e.facet==='trauma' ? '#ff9db0' : e.facet==='dream' ? '#ffe08a' : '#a8c4ff';
  const _rm=(typeof megaReducedMotion==='function'&&megaReducedMotion());
  const t=state.time||0, ph=(e.id||0);
  const pulse=_rm?0.7:0.6+0.4*Math.sin(t*3+ph);
  const bob=_rm?0:3*Math.sin(t*2+ph);
  ctx.save();
  // faint tether back to the dog this memory belongs to (skip if the dog isn't present this frame)
  if(e.dogId!=null){
    const dog=state.entities.find(d=> d.id===e.dogId && !d.dead);
    if(dog){ ctx.globalAlpha=0.08+0.04*pulse; ctx.strokeStyle=PUR; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(dog.x+ox, dog.y+oy-6); ctx.stroke(); }
  }
  // the shard: a slim neon diamond hovering over the pool
  const cy=py-16-bob, w=7+2*pulse, h=15+3*pulse;
  ctx.globalAlpha=0.95; ctx.shadowColor=PUR; ctx.shadowBlur=14+10*pulse;
  ctx.fillStyle=PUR;
  ctx.beginPath(); ctx.moveTo(px,cy-h); ctx.lineTo(px+w,cy); ctx.lineTo(px,cy+h); ctx.lineTo(px-w,cy); ctx.closePath(); ctx.fill();
  // bright inner edge
  ctx.shadowBlur=0; ctx.globalAlpha=0.9; ctx.strokeStyle=LIT; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(px,cy-h+3); ctx.lineTo(px+w-2.5,cy); ctx.lineTo(px,cy+h-3); ctx.lineTo(px-w+2.5,cy); ctx.closePath(); ctx.stroke();
  // cyberpunk glitch: occasional 1px horizontal slice offsets (deterministic, cosmetic)
  if(!_rm){
    for(let i=0;i<3;i++){
      const s=Math.sin(t*13+ph*1.7+i*2.4);
      if(s>0.92){ const gy=cy-h+(i+1)*(h*2/4), gw=w*1.4;
        ctx.globalAlpha=0.8; ctx.fillStyle=LIT; ctx.fillRect(px-gw/2+(s>0.96?3:-3), gy, gw, 1); }
    }
  }
  // ground contact glint (small — the pool decal carries the area)
  ctx.globalAlpha=0.5+0.2*pulse; ctx.strokeStyle=PUR; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(px,py,9+3*pulse,4+1.5*pulse,0,0,6.28); ctx.stroke();
  // facet glyph riding the shard
  ctx.globalAlpha=1; ctx.fillStyle=accent; ctx.font='bold 11px '+GAME_FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(e.facet==='trauma'?'!':e.facet==='dream'?'★':'♥', px, cy+0.5);
  ctx.restore();
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

// Ground "visual base" of a building in TILE coords. The art renders ~2.5× the footprint and rises
// upward (buildingDrawBox), so its base spans the full art WIDTH but only ~1 tile deep at the bottom.
// Used ONLY for the placement crowding warning (cosmetic) — never for collision/placement legality.
function visualBaseTiles(e){
  const b=buildingDrawBox(e);
  const x0=Math.floor(b.x/TILE), x1=Math.ceil((b.x+b.w)/TILE);
  const y1=Math.ceil((b.y+b.h)/TILE), y0=Math.max(e.ty, y1-1);
  return { x0, y0, x1, y1 };
}

function drawPlacement(state,ox,oy){
  const p=state.placing;
  const wx=mouse.wx, wy=mouse.wy;
  const tx=Math.floor((wx)/TILE - (p.def.w-1)/2 +0.0001);
  const ty=Math.floor((wy)/TILE - (p.def.h-1)/2 +0.0001);
  const ok=canPlaceAt(state,p.type,tx,ty) && playerEco(state, LOCAL_CTRL).gold>=p.def.cost;
  const px=tx*TILE+ox, py=ty*TILE+oy, w=p.def.w*TILE, h=p.def.h*TILE;

  // Real visual extent. The placed building's SPRITE renders ~2.5× the tile footprint, bottom-anchored
  // and rising upward — buildingDrawBox is the single source of truth shared with drawBuilding, so this
  // ghost is pixel-identical to what will actually be drawn. Show a translucent ghost of the real art
  // plus a dashed outline so the player can plan around existing structures instead of guessing from the
  // tiny footprint. owner:'player' picks the same faction sprite the placed entity will use.
  const stub={ tx, ty, w:p.def.w, h:p.def.h, type:p.type, owner:'player' };
  const spr=buildingSprite(p.type,'player');
  const box=buildingDrawBox(stub, spr);
  const gx=box.x+ox, gy=box.y+oy;

  // Amber = the building's visual BASE would overlap an existing building's base ("getting in the way").
  // This is a WARNING only — placement legality (ok) is unchanged; canPlaceAt is never consulted here.
  let crowded=false;
  if(ok){
    const vb=visualBaseTiles(stub);
    for(const e of state.entities){
      if(e.dead || e.kind!=='building') continue;
      const eb=visualBaseTiles(e);
      if(vb.x0<eb.x1 && vb.x1>eb.x0 && vb.y0<eb.y1 && vb.y1>eb.y0){ crowded=true; break; }
    }
  }

  // footprint tint (the collision rect) — lower alpha than before so the art ghost reads over it
  ctx.fillStyle= ok? 'rgba(120,255,150,.16)':'rgba(255,90,90,.22)';
  ctx.fillRect(px,py,w,h);
  ctx.strokeStyle= ok? '#8effb0':'#ff6b6b'; ctx.lineWidth=2; ctx.strokeRect(px,py,w,h);

  // translucent real-art ghost (frame 0 — no neon flicker; it's a placement aid). Skipped when the
  // strip isn't loaded yet; the dashed outline below still shows the real bounds.
  if(spr){
    ctx.save(); ctx.globalAlpha= ok?0.40:0.30;
    ctx.drawImage(spr.img, 0,0, spr.fw,spr.fh, gx,gy, box.w,box.h);
    ctx.restore();
  }
  // dashed outline of the real art box — visible even before the PNG loads and when the art is SMALLER
  // than the footprint (e.g. intel). Amber when crowding a neighbour, red when the spot is invalid.
  ctx.save();
  ctx.setLineDash([6,4]); ctx.lineWidth=1.5;
  ctx.strokeStyle= !ok? 'rgba(255,107,107,.9)' : crowded? 'rgba(255,206,99,.95)' : 'rgba(142,255,176,.85)';
  ctx.strokeRect(gx,gy, box.w,box.h);
  ctx.restore();

  state.placeCandidate={tx,ty,ok,crowded};
}

/* selection-ring fx (+ cyan-ninja smoke puffs/slashes, + REX mech missiles/explosions/shockwaves — all cosmetic) */
let rings=[], smokes=[], slashes=[], missiles=[], explosions=[], shockwaves=[], dangerDecals=[];

/* ---- floating combat numbers (T0-4): pooled, merged per-target, additive, capped.
   Module-local (never on G) → save/rollback/net untouched. Spawned from damage()/heal ticks on
   host/solo (gated !_rbReplaying) and from snapshot hp-deltas on co-op clients (js/net/sync.js). ---- */
let floaters=[];
const FLOATER_CAP=24, FLOATER_LIFE=0.8;
function spawnFloater(state, tgt, amt, kind){   // kind: 'dmg' | 'crit' (killing blow) | 'heal' | 'calm' (madosis relief)
  if(!state || state.hub || !tgt || amt<=0) return;
  const z=state.zoom||1, m=TILE*2;
  if(tgt.x<state.camX-m || tgt.x>state.camX+viewW()/z+m ||
     tgt.y<state.camY-m || tgt.y>state.camY+viewH()/z+m) return;          // off-screen cull
  if(tgt.owner==='enemy' && !isVisiblePix(state,tgt.x,tgt.y)) return;     // fog cull
  // merge into a live floater on the same target (heal ticks/bursts read as ONE rising number)
  for(const f of floaters){
    if(f.tid===tgt.id && f.kind===kind && f.t<FLOATER_LIFE*0.45){ f.amt+=amt; if(kind==='heal') f.t=Math.max(0,f.t-0.05); return; }
  }
  if(floaters.length>=FLOATER_CAP) floaters.shift();
  const top = tgt.kind==='building' ? (tgt.h||2)*TILE*0.6 : ((typeof unitDrawH==='function')?unitDrawH(tgt)*0.8:(tgt.r||10)*2);
  floaters.push({tid:tgt.id, x:tgt.x+( (tgt.id||0)%5-2 )*2, y:tgt.y-top, amt, kind, t:0});
  // T0-3: a NEW floater = a damage/heal event actually shown → pair it with sound (rate-limited in SFX)
  if(typeof SFX!=='undefined'){ if(kind==='heal') SFX.heal(); else if(kind!=='calm') SFX.impact(); }   // 'calm' relief is silent (channels every tick — no audio spam)
}
function drawFloaters(state, ox, oy){
  if(!floaters.length) return;
  const z=state.zoom||1, s=1/z;
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const f of floaters){
    f.t+=1/60;
    const p=f.t/FLOATER_LIFE; if(p>=1) continue;
    const a=(p<0.12? p/0.12 : 1-(p-0.12)/0.88);
    const n=Math.max(1,Math.round(f.amt));
    const crit=f.kind==='crit';
    const size=(crit?13:10)*s;
    ctx.font=(crit?'bold ':'')+size.toFixed(1)+'px '+GAME_FONT;
    ctx.globalAlpha=Math.min(0.85,a)* (f.kind==='dmg'?0.75:1);
    ctx.fillStyle = f.kind==='heal' ? '#7dffa8' : f.kind==='calm' ? '#c9a0ff' : crit ? '#ffe9b0' : '#ffb09a';
    ctx.fillText((f.kind==='heal'?'+':'−')+n, f.x+ox, f.y+oy - 16*p*s);   // 'calm' shows −N (madosis going down) in purple
  }
  ctx.restore(); ctx.globalAlpha=1;
  floaters=floaters.filter(f=>f.t<FLOATER_LIFE);
}

/* ---- level-up "promotion" arrow (cosmetic): a bold yellow upward arrow that HOPS in a loop
   beside a unit's HP/stars bars for LVLARROW_LIFE seconds when it gains a career star.
   Module-local (never on G) → save/rollback/net untouched. Spawned from promoteIfReady() on
   host/solo (gated !_rbReplaying, js/career.js) and from snapshot star-deltas on co-op clients
   (js/net/sync.js). Stores the unit id (not a ref) and resolves the live entity each frame, so the
   arrow tracks the moving unit and self-cleans the instant it leaves G.entities (death/transport). ---- */
let levelArrows=[];
const LVLARROW_CAP=12, LVLARROW_LIFE=5;
let _lvlArrowLast=0;   // wall-clock of the previous draw → real delta-time (refresh-rate independent)
function spawnLevelArrow(state, tgt){
  if(!state || state.hub || !tgt) return;
  const z=state.zoom||1, m=TILE*2;
  if(tgt.x<state.camX-m || tgt.x>state.camX+viewW()/z+m ||
     tgt.y<state.camY-m || tgt.y>state.camY+viewH()/z+m) return;   // off-screen cull (player units are never fogged)
  for(const a of levelArrows){ if(a.tid===tgt.id){ a.t=0; return; } }  // multi-level / re-promotion replays the ONE arrow
  if(levelArrows.length>=LVLARROW_CAP) levelArrows.shift();
  levelArrows.push({tid:tgt.id, t:0});
}
function drawLevelArrows(state, ox, oy){
  if(!levelArrows.length) return;
  const z=state.zoom||1, s=Math.min(1.6, 1/z);   // counter-scale: a constant comic-size pop (clamped at low zoom)
  const rm=(typeof megaReducedMotion==='function' && megaReducedMotion());
  const _now=(typeof performance!=='undefined'?performance.now():0);
  let _dt=_lvlArrowLast?(_now-_lvlArrowLast)/1000:1/60; _lvlArrowLast=_now;
  if(!(_dt>0)||_dt>0.25) _dt=1/60;   // real time → 5s life & 1.6s bob hold on any refresh rate (60/120/144Hz); clamp tab-restore spikes
  for(const a of levelArrows){
    a.t+=_dt;
    if(a.t>=LVLARROW_LIFE) continue;
    const u=state.entities.find(e=>e.id===a.tid && !e.dead);
    if(!u || u.hp<=0 || u.storedIn || u.captive){ a.t=LVLARROW_LIFE; continue; }   // drop on death/board/capture
    const vh=(typeof unitDrawH==='function')?unitDrawH(u):(u.r||10)*2, alt=u.air?16:0;
    const ax=u.x+ox+Math.max(vh*0.3,16)+6;          // clear the bar (vh*0.6 wide) AND the fixed 28px star row
    const baseY=u.y+oy-alt-vh*0.72-8;               // bar/stars band; anchor in WORLD units (not counter-scaled)
    const p=a.t/LVLARROW_LIFE;
    const fade = p<0.06 ? p/0.06 : (p>0.8 ? (1-p)/0.2 : 1);   // ~0.3s in, hold, ~1s out
    const hop=rm?0:(0.5-0.5*Math.cos(a.t*3.93))*13*s;   // slow, floaty up/down bob (eased; ~1.6s per cycle)
    ctx.save();
    ctx.translate(ax, baseY-hop); ctx.scale(s,s);
    ctx.globalAlpha=Math.max(0,Math.min(1,fade));
    ctx.beginPath();                                // bold up-arrow: wide head + short shaft
    ctx.moveTo(0,-9); ctx.lineTo(7,-1); ctx.lineTo(3,-1); ctx.lineTo(3,6);
    ctx.lineTo(-3,6); ctx.lineTo(-3,-1); ctx.lineTo(-7,-1); ctx.closePath();
    if(!rm){ ctx.shadowColor='#ffd23f'; ctx.shadowBlur=8; }   // neon bloom (skip when motion is reduced)
    ctx.fillStyle='#ffd23f'; ctx.fill(); ctx.shadowBlur=0;
    ctx.lineWidth=1.6; ctx.strokeStyle='#1a1206'; ctx.stroke();   // dark comicbook outline
    ctx.restore();
  }
  ctx.globalAlpha=1;
  levelArrows=levelArrows.filter(a=>a.t<LVLARROW_LIFE);
}
function spawnRing(wx,wy,color){ rings.push({x:wx,y:wy,r:6,max:26,color,t:1}); }
/* P5.4 — dynamic combat-scorch decals: a transient dark mark left on the GROUND where a unit/building dies.
   Render-only + module-local (never on G → save/net untouched), drawn in the GROUND_DECAL band UNDER units &
   their shadows. Pooled + capped; fades over SCORCH_LIFE. Reuses the cached shadow blob (zero per-frame alloc).
   Spawned from deathFx (host/solo gated; client fires it from snapshot entity-removals — same path as the bursts). */
let scorches=[]; const SCORCH_CAP=64, SCORCH_LIFE=12; let _scorchLast=0;
function spawnScorch(wx,wy,scale){ if(scorches.length>=SCORCH_CAP) scorches.shift(); scorches.push({x:wx,y:wy,r:9+(scale||1)*7,t:0}); }
function drawScorches(state, ox, oy){
  if(!scorches.length) return;
  const now=(typeof performance!=='undefined'?performance.now():0);
  let dt=_scorchLast?(now-_scorchLast)/1000:1/60; _scorchLast=now; if(!(dt>0)||dt>0.25) dt=1/60;
  const sp=(typeof shadowSprite==='function')?shadowSprite():null;
  ctx.save();
  for(const s of scorches){
    s.t+=dt; if(s.t>=SCORCH_LIFE) continue;
    const p=s.t/SCORCH_LIFE, a=(p<0.05?p/0.05:(1-p))*0.5; if(a<=0.015) continue;
    const x=s.x+ox, y=s.y+oy, r=s.r; ctx.globalAlpha=a;
    if(sp) ctx.drawImage(sp, x-r, y-r*0.66, r*2, r*1.32);
    else { ctx.fillStyle='rgba(6,4,3,'+a.toFixed(3)+')'; ctx.beginPath(); ctx.ellipse(x,y,r,r*0.66,0,0,6.2832); ctx.fill(); }
  }
  ctx.globalAlpha=1; ctx.restore();
  scorches=scorches.filter(s=>s.t<SCORCH_LIFE);
}
// ninja smoke-bomb vanish: a DENSE, glowing cyan→blue cloud — layered soft puffs that billow out, rise and
// fade. Deterministic (golden-angle spread, no RNG). Each puff is drawn as a soft radial gradient in drawRings.
const SMOKE_PAL=[[200,250,255],[120,234,255],[64,200,250],[40,168,242]];   // white-cyan core → mid cyan → blue
function spawnSmoke(wx,wy,color){
  const reduced = (typeof megaReducedMotion==='function' && megaReducedMotion());
  const N = reduced ? 16 : 40;
  for(let i=0;i<N;i++){
    const a = i*2.39996 + wx*0.011;                    // golden angle → even, non-random fill
    const ring = Math.pow(i/N, 1.35);                  // 0 (center) → 1 (outer); skew packs the cloud DENSE at the core
    const spd = 0.18 + ring*1.25 + (i%3)*0.16;
    const c = SMOKE_PAL[i & 3];
    smokes.push({
      x: wx + Math.cos(a)*ring*7, y: wy + Math.sin(a)*ring*7,
      vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - 0.6,   // billow outward + drift UP like smoke
      r: 9 + (i%4)*3 + ring*7, grow: 0.6 + (i%3)*0.4,   // slower growth → stays thick longer
      cr:c[0], cg:c[1], cb:c[2], t:1, life: 1.05 + (i%5)*0.14,
    });
  }
  if(!reduced) for(let i=0;i<4;i++)                    // bright central flares for the initial "poof"
    smokes.push({ x:wx, y:wy, vx:0, vy:-0.16, r:16+i*7, grow:1.3, cr:210,cg:252,cb:255, t:1, life:0.55, flare:1 });
}
// ninja strike: a bright fading blade-streak from the ninja to its victim
function spawnSlash(u,t,color){ slashes.push({x1:u.x,y1:u.y, x2:t.x,y2:t.y, color:color||'#bffcff', t:1}); }

/* ---- REX mech FX — toxic-green plasma. All additive, reduced-motion-gated, decayed in drawRings. ---- */
// a lobbed missile: parabolic arc from cannon (x0,y0) to impact (x1,y1) over `dur`, trailing green plasma.
function spawnMissile(x0,y0,x1,y1,dur){ missiles.push({x0,y0,x1,y1,dur,t:0, arc:36+Math.hypot(x1-x0,y1-y0)*0.16, e:0}); }
// an impact burst: bright green flash ring + a puff of plasma smoke.
function spawnExplosion(wx,wy){
  explosions.push({x:wx,y:wy,t:0,life:0.45,r0:9,r1:38});
  if(typeof spawnRing==='function') spawnRing(wx,wy,'#9bff7a');
  const reduced=(typeof megaReducedMotion==='function'&&megaReducedMotion()), N=reduced?6:12;
  for(let i=0;i<N;i++){ const a=i*2.39996+wx*0.01, sp=0.7+(i%3)*0.45;
    smokes.push({x:wx,y:wy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-0.15, r:6+(i%3)*3, grow:0.95, cr:150+(i%2)*70, cg:255, cb:110, t:1, life:0.5}); }
}

/* ---- death FX (T0-2): owner-colored bursts on every unit/building kill. Cosmetic only —
   never touches sim state. Callers gate with !window._rbReplaying (host/solo); the client
   fires it from snapshot entity-removals in js/net/sync.js. ---- */
// is the entity within (or near) the camera view? Shared cull for cosmetic FX spawns.
function entOnScreen(state, e, m){
  m = m==null ? TILE*2 : m; const z=state.zoom||1;
  return !(e.x<state.camX-m || e.x>state.camX+viewW()/z+m || e.y<state.camY-m || e.y>state.camY+viewH()/z+m);
}
// side palette: player red, enemy blue, A&O toxic green (render-time faction, matches sprite recolor)
function deathFxColor(state, e){
  if(e.owner==='player') return [255,96,84];
  if(aoSide(state, e.owner)) return [150,255,110];
  return [90,170,255];
}
// colored flash burst (delay lets building razes stagger); reuses the explosions/smokes pools
function spawnBurst(wx,wy,rgb,scale,delay){
  explosions.push({x:wx,y:wy,t:-(delay||0),life:0.45,r0:9*(scale||1),r1:38*(scale||1),cr:rgb[0],cg:rgb[1],cb:rgb[2]});
}
function deathFx(state, e){
  if(!state || state.hub) return;
  if(e.kind!=='unit' && e.kind!=='building') return;
  if(e.type==='goldmine' || e.captive) return;
  // off-screen cull (big maps): only spawn when the death is in (or near) the camera view
  const z=state.zoom||1, m=TILE*4;
  if(e.x < state.camX-m || e.x > state.camX+viewW()/z+m ||
     e.y < state.camY-m || e.y > state.camY+viewH()/z+m) return;
  // fog cull: an enemy dying in the dark stays unseen
  if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) return;
  // P5.4: leave a lingering ground scorch where it died (under the burst FX below)
  if(typeof spawnScorch==='function') spawnScorch(e.x, e.y, e.kind==='building' ? 2.4 : ((typeof unitDrawH==='function'?unitDrawH(e):32)/56));
  const reduced=(typeof megaReducedMotion==='function'&&megaReducedMotion());
  if(smokes.length>240) return;   // hard particle cap on mass deaths
  const rgb=deathFxColor(state,e);
  const col='rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';
  if(e.kind==='building'){
    const fw=(e.w||2), fh=(e.h||2), foot=Math.max(fw,fh);
    const hq=(e.type==='hq');
    const N = reduced ? 2 : Math.min(7, 2+foot*(hq?2:1));   // staggered bursts across the footprint
    for(let i=0;i<N;i++){
      const a=i*2.39996+e.x*0.013, rr=(i/N)*foot*TILE*0.45;
      spawnBurst(e.x+Math.cos(a)*rr, e.y+Math.sin(a)*rr*0.6, rgb, hq?1.5:1.0, i*0.09);
    }
    // debris + lingering dark smoke column
    const D=reduced?4:Math.min(14, 5+foot*3);
    for(let i=0;i<D;i++){ const a=i*2.39996+e.y*0.011, sp=0.6+(i%4)*0.4;
      smokes.push({x:e.x+(Math.cos(a)*foot*TILE*0.3), y:e.y+(Math.sin(a)*foot*TILE*0.2),
        vx:Math.cos(a)*sp, vy:Math.sin(a)*sp*0.5-0.35, r:8+(i%3)*5, grow:1.25,
        cr:i%3?96:rgb[0], cg:i%3?100:rgb[1], cb:i%3?108:rgb[2], t:1, life:1.1+(i%3)*0.5}); }
    spawnShockwaveC(e.x, e.y, foot*TILE*(hq?1.6:1.0), col);
    state._shake=Math.max(state._shake||0, Math.min(12, hq?12:3+foot*2));
  } else {
    const vh=(typeof unitDrawH==='function') ? unitDrawH(e) : (e.r||10)*2;
    const big = vh>=84 || e.villain;   // founder/bomber/boss tier
    if(big){
      spawnBurst(e.x,e.y,rgb,1.2,0); spawnBurst(e.x,e.y,rgb,0.7,0.12);
      spawnShockwaveC(e.x,e.y, 3.0*TILE, col);
      const N=reduced?4:10;
      for(let i=0;i<N;i++){ const a=i*2.39996+e.x*0.01, sp=0.7+(i%3)*0.45;
        smokes.push({x:e.x,y:e.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-0.2, r:7+(i%3)*3, grow:1.0, cr:rgb[0], cg:rgb[1], cb:rgb[2], t:1, life:0.7}); }
      state._shake=Math.max(state._shake||0, 8);
    } else {
      spawnRing(e.x,e.y,col);
      spawnBurst(e.x,e.y,rgb,0.55,0);
      const N=reduced?2:5;
      for(let i=0;i<N;i++){ const a=i*2.39996+e.x*0.01, sp=0.5+(i%3)*0.35;
        smokes.push({x:e.x,y:e.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-0.18, r:5+(i%2)*3, grow:0.9, cr:rgb[0], cg:rgb[1], cb:rgb[2], t:1, life:0.45}); }
      state._shake=Math.max(state._shake||0, 2);
    }
  }
  if(typeof SFX!=='undefined') SFX.death(e);
}
// the earthquake: a fast, thick green double ground-ring (flattened ellipse = ground perspective).
function spawnShockwave(wx,wy,rMax){ shockwaves.push({x:wx,y:wy,rMax,t:0,life:0.55}); }
// BOSS AoE telegraph: a red ground danger-zone that FILLS over `lead` seconds and completes exactly at impact
// (the universal RTS "move out NOW" read). Drawn isometric (squashed) on the ground; brief flash, then fades.
function spawnDangerDecal(wx,wy,rad,lead){ dangerDecals.push({x:wx,y:wy,r:rad||TILE,lead:Math.max(0.15,lead||1),t:0}); }
// owner-colored variant for death FX (rgb string e.g. 'rgb(255,96,84)')
function spawnShockwaveC(wx,wy,rMax,col){ const w={x:wx,y:wy,rMax,t:0,life:0.55}; if(col){ const m=col.match(/(\d+),\s*(\d+),\s*(\d+)/); if(m){ w.cr=+m[1]; w.cg=+m[2]; w.cb=+m[3]; } } shockwaves.push(w); }
// thruster jet: a downward fan of bright green-white plasma exhaust.
function spawnThruster(wx,wy,vxBias,speed){
  for(let i=0;i<4;i++){ const a=(i-1.5)*0.42 + 1.5708;   // ~downward fan
    smokes.push({x:wx,y:wy, vx:Math.cos(a)*speed*(0.6+0.2*i)+vxBias, vy:Math.sin(a)*speed*(0.8+0.2*i), r:5+(i%2)*2, grow:0.7, cr:205, cg:255, cb:175, t:1, life:0.4}); }
}
// kicked-up dust on landing: low, spreading, grey-green puffs.
function spawnDust(wx,wy){
  const reduced=(typeof megaReducedMotion==='function'&&megaReducedMotion()), N=reduced?7:16;
  for(let i=0;i<N;i++){ const a=i*2.39996+wx*0.01, sp=0.85+(i%4)*0.35;
    smokes.push({x:wx,y:wy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp*0.4-0.08, r:7+(i%3)*3, grow:1.2, cr:120, cg:150, cb:110, t:1, life:0.7}); }
}
function drawRings(ox,oy){
  for(const r of rings){
    ctx.strokeStyle=r.color; ctx.globalAlpha=r.t; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(r.x+ox,r.y+oy,r.r,0,6.28); ctx.stroke(); ctx.globalAlpha=1;
    r.r+=0.8; r.t-=0.04;
  }
  rings=rings.filter(r=>r.t>0);
  if(slashes.length){
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(const s of slashes){
      ctx.globalAlpha=Math.max(0,s.t); ctx.strokeStyle=s.color; ctx.lineWidth=3*s.t+1;
      ctx.shadowColor=s.color; ctx.shadowBlur=12*s.t;
      ctx.beginPath(); ctx.moveTo(s.x1+ox,s.y1+oy); ctx.lineTo(s.x2+ox,s.y2+oy); ctx.stroke();
      s.t-=0.10;
    }
    ctx.shadowBlur=0; ctx.restore(); ctx.globalAlpha=1;
    slashes=slashes.filter(s=>s.t>0);
  }
  if(dangerDecals.length){                                     // BOSS AoE danger-zones (drawn under the impact FX): a filling red ground ring telegraphing where the blast lands
    ctx.save();
    for(const d of dangerDecals){
      d.t+=1/60;
      const p=Math.min(1, d.t/d.lead);                         // 0→1 fill toward impact
      const post=Math.max(0, d.t-d.lead), fade=post>0?Math.max(0,1-post/0.22):1;
      const px=d.x+ox, py=d.y+oy, R=d.r, rp=R*p;
      // filling inner disc — the radial "fuse" that reaches the rim at impact
      ctx.globalAlpha=1;
      const fg=ctx.createRadialGradient(px,py,0, px,py, Math.max(2,rp));
      fg.addColorStop(0, `rgba(255,95,60,${(0.34*fade).toFixed(3)})`);
      fg.addColorStop(1, `rgba(255,40,30,${(0.12*fade).toFixed(3)})`);
      ctx.fillStyle=fg;
      ctx.beginPath(); ctx.ellipse(px,py, rp, rp*0.5, 0,0,6.28); ctx.fill();
      // fixed outer danger ring (the full blast extent) so the player sees the final size immediately
      ctx.globalAlpha=(0.5+0.3*p)*fade; ctx.lineWidth=2.5; ctx.strokeStyle=`rgba(255,70,50,${(0.7*fade).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(px,py, R, R*0.5, 0,0,6.28); ctx.stroke();
    }
    ctx.globalAlpha=1; ctx.restore();
    dangerDecals=dangerDecals.filter(d=>d.t < d.lead+0.22);
  }
  if(shockwaves.length){                                       // earthquake ground-rings (drawn under the dust)
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const w of shockwaves){
      w.t+=1/60; const p=Math.min(1,w.t/w.life), r=w.rMax*p, a=1-p;
      const cr=w.cr!=null?w.cr:150, cg=w.cg!=null?w.cg:255, cb=w.cb!=null?w.cb:110;
      ctx.strokeStyle=`rgba(${cr},${cg},${cb},${(a*0.9).toFixed(3)})`; ctx.lineWidth=6*(1-p)+2;
      ctx.beginPath(); ctx.ellipse(w.x+ox,w.y+oy, r, r*0.42, 0,0,6.28); ctx.stroke();
      ctx.strokeStyle=`rgba(${Math.min(255,cr+75)},${Math.min(255,cg+40)},${Math.min(255,cb+85)},${(a*0.5).toFixed(3)})`; ctx.lineWidth=3*(1-p)+1;
      ctx.beginPath(); ctx.ellipse(w.x+ox,w.y+oy, r*0.66, r*0.66*0.42, 0,0,6.28); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha=1;
    shockwaves=shockwaves.filter(w=>w.t<w.life);
  }
  if(smokes.length){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const s of smokes){
      const tt=Math.max(0,s.t);
      const env = (tt>0.85 ? (1-tt)/0.15 : tt);                 // quick fade-IN (first 15%), then slow fade-out
      const rad = s.r*(1 + s.grow*(1-tt));                      // billow: grow as it ages
      const px=s.x+ox, py=s.y+oy;
      const a0 = (s.flare?0.95:0.68)*env;
      const g=ctx.createRadialGradient(px,py,0, px,py,rad);
      g.addColorStop(0,    `rgba(${s.cr},${s.cg},${s.cb},${a0.toFixed(3)})`);
      g.addColorStop(0.45, `rgba(${s.cr},${s.cg},${s.cb},${(a0*0.34).toFixed(3)})`);
      g.addColorStop(1,    `rgba(${s.cr},${s.cg},${s.cb},0)`);
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(px,py,rad,0,6.28); ctx.fill();
      s.x+=s.vx; s.y+=s.vy; s.vx*=0.96; s.vy=s.vy*0.96-0.012;   // drag + keep drifting up
      s.t-=1/(s.life*60);
    }
    ctx.restore(); ctx.globalAlpha=1;
    smokes=smokes.filter(s=>s.t>0);
  }
  if(missiles.length){                                         // arcing plasma missiles (head + trail)
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const m of missiles){
      m.t+=1/60; const p=Math.min(1,m.t/m.dur);
      const x=m.x0+(m.x1-m.x0)*p, y=m.y0+(m.y1-m.y0)*p - m.arc*Math.sin(p*Math.PI);
      m.e=(m.e||0)+1; if(m.e%2===0) smokes.push({x,y,vx:0,vy:0.25,r:5,grow:0.8,cr:150,cg:255,cb:120,t:1,life:0.4});   // plasma trail
      const px=x+ox, py=y+oy, g=ctx.createRadialGradient(px,py,0,px,py,10);
      g.addColorStop(0,'rgba(225,255,205,0.95)'); g.addColorStop(0.5,'rgba(120,255,90,0.5)'); g.addColorStop(1,'rgba(120,255,90,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,10,0,6.28); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha=1;
    missiles=missiles.filter(m=>m.t<m.dur);
  }
  if(explosions.length){                                       // impact bursts (bright green flash; death FX recolor via cr/cg/cb, negative t = stagger delay)
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const e of explosions){
      e.t+=1/60; if(e.t<0) continue;
      const p=Math.min(1,e.t/e.life), r=e.r0+(e.r1-e.r0)*p, a=(1-p)*0.95;
      const cr=e.cr!=null?e.cr:120, cg=e.cg!=null?e.cg:255, cb=e.cb!=null?e.cb:90;
      const px=e.x+ox, py=e.y+oy, g=ctx.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,`rgba(${Math.min(255,cr+115)},${Math.min(255,cg+60)},${Math.min(255,cb+125)},${a.toFixed(3)})`);
      g.addColorStop(0.5,`rgba(${cr},${cg},${cb},${(a*0.5).toFixed(3)})`);
      g.addColorStop(1,`rgba(${Math.round(cr*0.5)},${Math.round(cg*0.78)},${Math.round(cb*0.78)},0)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,r,0,6.28); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha=1;
    explosions=explosions.filter(e=>e.t<e.life);
  }
}

/* ---- minimap ---- */
// Terrain + topography-feature layer of the minimap — the expensive O(W*H) tile scan. Extracted so the
// cached path (minimapCache) can rasterize it into an offscreen base at a low cadence while the OFF path
// draws it straight into mmx every frame, byte-identical to the original.
function _mmDrawBase(state, g, W, H){
  g.fillStyle='#05080d'; g.fillRect(0,0,W,H);
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
    g.fillStyle=c; g.fillRect(tx*sx,ty*sy,Math.ceil(sx),Math.ceil(sy));
  }
  // topography features: their footprint cells are now plain floor, so re-dot them
  // (same colors the T_TREE/T_ROCK tiles used) over the feature's FEAT_SIZE block.
  if(state.features){ for(const f of state.features){ const fw=Math.max(1,(f.w||FEAT_SIZE)|0), fh=Math.max(1,(f.h||FEAT_SIZE)|0);
    const sx0=Math.max(0, Math.min(state.W-1, f.tx+(fw>>1))), sy0=Math.max(0, Math.min(state.H-1, f.ty+fh-1));
    const si=sy0*state.W + sx0;
    if(!state.explored[si]) continue;
    const b=state.biome[si];
    let c = f.slot==='rock' ? (b===B_VOLCANIC?'#3a241c': b===B_ICE?'#3a4854':'#3a3d44')
                            : (b===B_DESERT?'#2e4a2a': b===B_VOLCANIC?'#1c1411':'#16241a');
    if(!state.visible[si]) c=shade(c,-30);
    g.fillStyle=c; g.fillRect(f.tx*sx, f.ty*sy, Math.ceil(sx*fw), Math.ceil(sy*fh));
  } }
}

// minimapCache: keep the terrain/feature base on an offscreen canvas, re-rasterized at ~10Hz (the dim/fog
// shading changes slowly — a reveal shows within ~100ms, imperceptible), then blit it each frame and draw
// live entity blips + the viewport rect at full rate. Removes the full O(W*H) scan on ~5 of every 6 frames.
// Module-local (NOT stored on state) so save serialization is untouched; rebuilt on map/state or size change.
let _mmBase=null, _mmBaseCtx=null, _mmTick=0, _mmBaseFor=null;
const MM_BASE_PERIOD=6;

function renderMinimap(state){
  const W=mm.width, H=mm.height;
  const sx=W/state.W, sy=H/state.H;
  if(PERF.opts.minimapCache){
    if(!_mmBase || _mmBase.width!==W || _mmBase.height!==H){
      _mmBase=document.createElement('canvas'); _mmBase.width=W; _mmBase.height=H;
      _mmBaseCtx=_mmBase.getContext('2d'); _mmBaseFor=null;
    }
    if(_mmBaseFor!==state){ _mmBaseFor=state; _mmTick=0; }   // new map/state → rebuild immediately
    if(_mmTick<=0){ _mmDrawBase(state,_mmBaseCtx,W,H); _mmTick=MM_BASE_PERIOD; }
    _mmTick--;
    mmx.drawImage(_mmBase,0,0);
  } else {
    _mmDrawBase(state, mmx, W, H);
  }
  // ---- live per-frame layer: entity blips + viewport rect (both paths, drawn into mmx) ----
  for(const e of state.entities){
    if(e.dead||e.storedIn) continue;
    if(e.type==='goldmine'){ const N=FEAT_SIZE, ftx=(e.ftx!=null)?e.ftx:(((e.x/TILE)|0)-(N>>1)), fty=(e.fty!=null)?e.fty:(((e.y/TILE)|0)-(N>>1)); const si=(fty+N-1)*state.W+(ftx+(N>>1)); if(state.explored[si]){ mmx.fillStyle='#b06bff'; mmx.fillRect(ftx*sx, fty*sy, Math.ceil(sx*N), Math.ceil(sy*N));} continue; }
    if(e.kind==='echo'){   // MADOSIS rescue beacon — pulsing purple AREA halo + bright core
      const p=0.5+0.5*Math.sin((state.time||0)*4+(e.id||0)), ez=4+3*p;
      mmx.fillStyle='rgba(176,91,255,'+(0.22+0.30*p).toFixed(2)+')';
      mmx.fillRect(e.x/TILE*sx-ez, e.y/TILE*sy-ez, ez*2, ez*2);
      mmx.fillStyle='#d9a8ff'; mmx.fillRect(e.x/TILE*sx-1.5, e.y/TILE*sy-1.5, 3, 3);
      continue; }
    if(e.madDog){ mmx.fillStyle='#ff5bff'; mmx.fillRect(e.x/TILE*sx-1.5, e.y/TILE*sy-1.5, 3, 3); continue; }   // MADOSIS feral mad dog
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
// T4-3: colorblind-safe ramp (blue→white→red survives deuteranopia) toggled in Settings
function hpColor(f){
  if(window._colorblind) return f>0.5?'#4ca6ff': f>0.25?'#e8ecf2':'#ff5b5b';
  return f>0.5?'#4cd964': f>0.25?'#ffcc33':'#ff5b5b';
}
function madColor(fr){
  if(window._colorblind) return fr>0.85?'#ff5b5b': fr>0.6?'#e8ecf2':'#4ca6ff';
  return fr>0.85?'#ff5b6b': fr>0.6?'#ffb13f':'#b05bff';
}
function shade(hex,amt){
  const c=hex.replace('#',''); let r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16);
  r=Math.max(0,Math.min(255,r+amt)); g=Math.max(0,Math.min(255,g+amt)); b=Math.max(0,Math.min(255,b+amt));
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}
