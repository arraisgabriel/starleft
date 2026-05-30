/* megasprites.js — big animated landmark scenery (megabuildings / mountains /
   volcanoes / ruins). Loaded AFTER state.js and BEFORE map.js: it defines
   placeMegaSprites() (called during newMap) and drawMegaSprites() (called by
   render.js, which loads later). Mega sprites are SCENERY, not entities — a
   separate state.megaSprites[] array keeps them out of every entity loop (AI,
   combat, supply, fog). Each is a transparent 4-frame animation strip generated
   by Gemini (see _dev/gen/gen_megasprites.mjs); the structure is identical across
   the 4 frames and only the neon/fog/smoke/dust changes, so it loops smoothly.
   Footprints are marked blocked (solid obstacles) and placement is validated by a
   flood-fill so a landmark can never wall off a base or gold node. | STARLEFT */

/* ===================== assets ===================== */
const MEGA_BASE = ASSET_BASE + 'mega/';                 // ASSET_BASE from assets.js
const MEGA_MANIFEST = { megabuilding:3, mountain:3, volcano:3, ruin:3 }; // variants per category
const MEGA_FRAMES = 9;                                  // frames per strip (3×3 grid → 9)
const MEGA_FPS = { megabuilding:3.5, mountain:1.2, volcano:2.5, ruin:1.8 }; // ambient loop speed (slow)
function megaPath(cat,n){ return MEGA_BASE + cat + '_' + n + '.png'; }

// Tint a whole 4-frame strip to a biome wash WITHOUT bleeding onto terrain: draw
// the strip into an offscreen canvas, then 'source-atop' a color fill so only the
// sprite's opaque pixels are tinted. Returns the offscreen canvas (safe to blit).
function megaTint(img, rgba){
  const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
  const g=c.getContext('2d'); g.drawImage(img,0,0);
  g.globalCompositeOperation='source-atop'; g.fillStyle=rgba; g.fillRect(0,0,c.width,c.height);
  return c;
}
// Load a 4-frame horizontal strip (frames laid side by side, sharing one bbox so
// the structure doesn't jitter). Mirrors assets.js loadWalk. Ruins also get cool
// (snow) / warm (sand) tinted copies so the neutral-grey art reads in either biome.
function loadMega(src, cat){
  const a = { img:new Image(), ready:false, fw:0, fh:0, snow:null, sand:null };
  a.img.onload = ()=>{
    a.fw = a.img.naturalWidth/MEGA_FRAMES; a.fh = a.img.naturalHeight; a.ready = true;
    if(cat==='ruin'){ a.snow = megaTint(a.img,'rgba(150,180,205,.40)'); a.sand = megaTint(a.img,'rgba(200,165,110,.40)'); }
  };
  a.img.onerror = ()=>{ a.ready=false; };
  a.img.src = src;
  return a;
}
const MEGA = {};
for(const cat in MEGA_MANIFEST){ MEGA[cat]=[]; for(let n=0;n<MEGA_MANIFEST[cat];n++) MEGA[cat].push(loadMega(megaPath(cat,n), cat)); }
function megaSprite(cat,n){ const r=MEGA[cat]&&MEGA[cat][n]; return (r&&r.ready)?r:null; }

/* ===================== placement ===================== */
// biome → landmark category (water never gets one)
function megaCategory(b){
  if(b===B_TECH || b===B_GRASS) return 'megabuilding';
  if(b===B_MOUNTAIN) return 'mountain';
  if(b===B_VOLCANIC) return 'volcano';
  if(b===B_DESERT || b===B_ICE) return 'ruin';
  return null;
}
// core footprint (in tiles), art overhang, and whether the ground must be passable.
// Cores are ~30–42 tiles (≈3× the original ~12). Mountains/volcanoes belong on
// rock so they validate biome-only; buildings/ruins sit on buildable flats.
const CATSPEC = {
  megabuilding: { w:6, h:6, overhang:1.30, needPassable:true  },
  mountain:     { w:7, h:5, overhang:1.38, needPassable:false },
  volcano:      { w:6, h:6, overhang:1.32, needPassable:false },
  ruin:         { w:6, h:5, overhang:1.30, needPassable:true  },
};
const MEGA_EDGE=2, MEGA_KEEPOUT=5, MEGA_GAP=2;   // margins (tiles)

// 4 small maps → 12 biggest, area-interpolated across [1920, 12648].
function megaCount(W,H){ const t=(W*H-1920)/(12648-1920); return Math.max(4, Math.min(12, Math.round(4 + 8*t))); }

// Largest-remainder (Hamilton) apportionment of N across present categories,
// guaranteeing ≥1 each when there's room. cats.length ≤ 4 ≤ N, so no overshoot.
function megaAllocate(N, cats, area){
  const total = cats.reduce((s,c)=>s+area[c],0) || 1;
  const alloc={}, rema=[]; let used=0;
  for(const c of cats){ const raw=N*area[c]/total, f=Math.floor(raw); alloc[c]=f; used+=f; rema.push([c,raw-f]); }
  for(const c of cats){ if(alloc[c]===0 && used<N){ alloc[c]=1; used++; } }   // min-1 if room
  rema.sort((a,b)=>b[1]-a[1]); let ri=0;
  while(used<N && rema.length){ alloc[rema[ri%rema.length][0]]++; used++; ri++; }
  return alloc;
}
// Deterministic shuffle-cycler over a category's variants so several of the same
// kind show different art (seed-stable via the passed rng).
function megaVariantCycler(cat, rng){
  const n=MEGA_MANIFEST[cat]||1, order=[]; for(let i=0;i<n;i++) order.push(i);
  for(let i=n-1;i>0;i--){ const j=(rng()*(i+1))|0; const t=order[i]; order[i]=order[j]; order[j]=t; }
  let idx=0; return ()=>order[(idx++)%n];
}

// Chebyshev distance from a point to the footprint rect; < keep ⇒ too close.
function megaNearPoi(tx,ty,fw,fh,pois,keep){
  for(const p of pois){
    const dx = (p.x<tx)?tx-p.x : (p.x>=tx+fw)?p.x-(tx+fw-1):0;
    const dy = (p.y<ty)?ty-p.y : (p.y>=ty+fh)?p.y-(ty+fh-1):0;
    if(Math.max(dx,dy) < keep) return true;
  }
  return false;
}
function megaOverlaps(tx,ty,fw,fh,placed,gap){
  for(const m of placed){
    if(tx < m.tx+m.w+gap && tx+fw+gap > m.tx && ty < m.ty+m.h+gap && ty+fh+gap > m.ty) return true;
  }
  return false;
}
// Find a candidate footprint: entirely on the target biome, off water, passable if
// required, clear of POIs and other landmarks. Returns {tx,ty,w,h} or null.
function megaFindSpot(state, rng, cat){
  const {W,H,biome,tiles} = state, spec=CATSPEC[cat], fw=spec.w, fh=spec.h;
  const spanX=W-fw-2*MEGA_EDGE, spanY=H-fh-2*MEGA_EDGE;
  if(spanX<=0 || spanY<=0) return null;
  for(let attempt=0; attempt<120; attempt++){
    const tx=MEGA_EDGE+((rng()*spanX)|0), ty=MEGA_EDGE+((rng()*spanY)|0);
    let ok=true;
    for(let y=ty; y<ty+fh && ok; y++) for(let x=tx; x<tx+fw && ok; x++){
      const i=y*W+x;
      if(megaCategory(biome[i])!==cat) ok=false;
      else if(tiles[i]===T_WATER) ok=false;
      else if(spec.needPassable && !passableTerrain(tiles[i])) ok=false;
    }
    if(!ok) continue;
    if(megaNearPoi(tx,ty,fw,fh,state._megaPois,MEGA_KEEPOUT)) continue;
    if(megaOverlaps(tx,ty,fw,fh,state.megaSprites,MEGA_GAP)) continue;
    return {tx,ty,w:fw,h:fh};
  }
  return null;
}
// Flood-fill from the player start over passable tiles; every POI in mustReach
// must still be reachable. Reuses the 4-neighbour pattern from map.js's carve.
function megaConnOK(state, anchor, mustReach){
  const {W,H,blocked}=state;
  const sx=anchor.x|0, sy=anchor.y|0;
  if(sx<0||sy<0||sx>=W||sy>=H) return true;
  const seen=new Uint8Array(W*H), stack=[sy*W+sx]; seen[sy*W+sx]=1;
  while(stack.length){
    const idx=stack.pop(), x=idx%W, y=(idx/W)|0;
    if(x+1<W){ const k=idx+1; if(!seen[k]&&!blocked[k]){ seen[k]=1; stack.push(k); } }
    if(x-1>=0){ const k=idx-1; if(!seen[k]&&!blocked[k]){ seen[k]=1; stack.push(k); } }
    if(y+1<H){ const k=idx+W; if(!seen[k]&&!blocked[k]){ seen[k]=1; stack.push(k); } }
    if(y-1>=0){ const k=idx-W; if(!seen[k]&&!blocked[k]){ seen[k]=1; stack.push(k); } }
  }
  for(const p of mustReach){ const px=p.x|0, py=p.y|0;
    if(px<0||py<0||px>=W||py>=H) continue;
    if(!seen[py*W+px]) return false; }
  return true;
}
// Try to place ONE landmark of a category: find a spot, tentatively block it, keep
// it only if the map stays connected; else undo and retry. Returns true on commit.
function megaTryPlace(state, rng, cat, cyc, anchor, mustReach){
  const {W,blocked}=state;
  for(let retry=0; retry<40; retry++){
    const spot=megaFindSpot(state, rng, cat);
    if(!spot) return false;                          // no geometric room left
    const touched=[];
    for(let y=spot.ty; y<spot.ty+spot.h; y++) for(let x=spot.tx; x<spot.tx+spot.w; x++){
      const k=y*W+x; if(blocked[k]===0){ blocked[k]=1; touched.push(k); } }
    if(megaConnOK(state, anchor, mustReach)){
      const spec=CATSPEC[cat];
      state.megaSprites.push({ cat, variant:cyc(), tx:spot.tx, ty:spot.ty, w:spot.w, h:spot.h,
        overhang:spec.overhang, biome:state.biome[spot.ty*W+spot.tx], seed:rng() });
      return true;
    }
    for(const k of touched) blocked[k]=0;            // reject → undo
  }
  return false;
}

// Entry point — called from newMap(). Fills state.megaSprites and marks footprints
// blocked. Deterministic from the passed rng (a seed derived off cfg.seed so it
// doesn't perturb the rest of generation).
function placeMegaSprites(state, rng){
  state.megaSprites = [];
  const {W,H,biome,tiles,cfg} = state;
  const anchor = cfg.player; if(!anchor) return state.megaSprites;
  const bases = cfg.enemies || (cfg.enemy ? [cfg.enemy] : []);
  const gold  = cfg.goldNodes || [], lost = cfg.lostBases || [];
  state._megaPois = [anchor, ...bases, ...lost, ...gold];     // keep-out from all of these
  const mustReach = [...gold, ...bases, ...lost];             // connectivity anchors

  // eligible tile count per category (drives proportional distribution)
  const area={};
  for(let i=0;i<W*H;i++){
    const cat=megaCategory(biome[i]); if(!cat) continue;
    if(tiles[i]===T_WATER) continue;
    if(CATSPEC[cat].needPassable && !passableTerrain(tiles[i])) continue;
    area[cat]=(area[cat]||0)+1;
  }
  const cats=Object.keys(area).filter(c=>area[c] >= CATSPEC[c].w*CATSPEC[c].h);  // ≥1 footprint worth
  if(!cats.length){ delete state._megaPois; return state.megaSprites; }

  const N=megaCount(W,H), alloc=megaAllocate(N, cats, area);
  const cyc={}; for(const c of cats) cyc[c]=megaVariantCycler(c, rng);

  for(const cat of cats){
    let want=alloc[cat]||0;
    for(let i=0;i<want;i++) megaTryPlace(state, rng, cat, cyc[cat], anchor, mustReach);
  }
  // redistribute any shortfall (a category that ran out of room) across the rest
  let guard=0;
  while(state.megaSprites.length<N && guard++<N*3){
    let any=false;
    for(const cat of cats){ if(state.megaSprites.length>=N) break;
      if(megaTryPlace(state, rng, cat, cyc[cat], anchor, mustReach)) any=true; }
    if(!any) break;
  }
  delete state._megaPois;
  return state.megaSprites;
}

/* ===================== render ===================== */
// World-pixel ground line a landmark "stands on" (footprint bottom). render.js
// depth-sorts mega sprites against units by this Y so a unit behind the tall body
// is occluded by it and a unit in front draws over it.
function megaSortY(m){ return (m.ty + m.h) * TILE; }

// Draw ONE landmark, bottom-anchored, aspect-preserved, overhanging upward like a
// building; fog-gated on the centre tile (skip if unexplored, dim if explored-but-
// not-visible); animated frame pick from state.time at a per-category fps, desynced
// by the per-instance seed. Culls to the visible tile span.
function drawOneMega(state, m, ox, oy, x0, y0, x1, y1){
  const W=state.W, t=state.time||0;
  if(m.tx+m.w<=x0 || m.tx>=x1 || m.ty+m.h<=y0 || m.ty>=y1) return;       // AABB cull
  const ci=(m.ty+(m.h>>1))*W + (m.tx+(m.w>>1));
  if(!state.explored[ci]) return;                                        // unseen → skip
  const lit=state.visible[ci]===1;
  const spr=megaSprite(m.cat, m.variant);
  const px=m.tx*TILE+ox, py=m.ty*TILE+oy, w=m.w*TILE, h=m.h*TILE;
  ctx.save();
  if(!lit) ctx.globalAlpha=0.5;                                          // explored-not-visible dim
  ctx.fillStyle='rgba(0,0,0,.34)';                                       // ground contact shadow
  ctx.beginPath(); ctx.ellipse(px+w/2, py+h-3, w*0.46, 8, 0, 0, 6.28); ctx.fill();
  if(spr){
    const fps=MEGA_FPS[m.cat]||2.5;
    const fi=((((t*fps + m.seed*MEGA_FRAMES)|0)%MEGA_FRAMES)+MEGA_FRAMES)%MEGA_FRAMES;
    const dw=w*(m.overhang||1.3), dh=dw*(spr.fh/spr.fw);
    const dx=px+(w-dw)/2, dy=py+h-dh+2;
    let img=spr.img;
    if(m.cat==='ruin') img=(m.biome===B_ICE?spr.snow : m.biome===B_DESERT?spr.sand : null) || spr.img;
    ctx.drawImage(img, fi*spr.fw, 0, spr.fw, spr.fh, dx, dy, dw, dh);
  } else {
    ctx.fillStyle='rgba(16,18,24,.92)';                                  // fallback mass so the obstacle reads
    roundRect(px+3, py+3, w-6, h-6, 7); ctx.fill();
    ctx.strokeStyle='rgba(70,80,100,.6)'; ctx.lineWidth=2; ctx.stroke();
  }
  ctx.restore();
}

// Draw all landmarks (used when no depth interleave is needed).
function drawMegaSprites(state, ox, oy, x0, y0, x1, y1){
  const arr=state.megaSprites; if(!arr) return;
  for(const m of arr) drawOneMega(state, m, ox, oy, x0,y0,x1,y1);
}
