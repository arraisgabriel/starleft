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
const MEGA_MANIFEST = { megabuilding:6, mountain:6, volcano:6, ruin:6 }; // variants per category
const MEGA_FRAMES = 9;                                  // frames per strip (3×3 grid → 9)
const MEGA_FPS = { megabuilding:1.4, mountain:0.6, volcano:1.2, ruin:0.9 }; // ambient loop speed (slow)
function megaPath(cat,n){ return MEGA_BASE + cat + '_' + n + '.webp'; }   // WebP since the mobile-loading fix (_dev/gen/optimize_assets.py)

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
// (snow) / warm (sand) tinted copies so the neutral-grey art reads in either biome —
// baked LAZILY on first draw (megaTintFor), not in onload: a late retry-load mid-combat
// must not stall the main thread with two multi-MB canvas bakes per ruin.
function loadMega(src, cat, n){
  const a = { img:new Image(), ready:false, fw:0, fh:0, snow:null, sand:null };
  a.img.onload = ()=>{ a.fw = a.img.naturalWidth/MEGA_FRAMES; a.fh = a.img.naturalHeight; a.ready = true; };
  a.img.onerror = ()=>{ a.ready=false; };
  LOADER.register(a.img, src, { tag:'mega:'+cat+':'+n, tier:LOADER.T_AMBIENT, weight:6 });
  return a;
}
function megaTintFor(a, biome){
  if(!a || !a.ready) return null;
  if(biome===B_ICE){    if(!a.snow) a.snow = megaTint(a.img,'rgba(150,180,205,.40)'); return a.snow; }
  if(biome===B_DESERT){ if(!a.sand) a.sand = megaTint(a.img,'rgba(200,165,110,.40)'); return a.sand; }
  return null;
}
const MEGA = {};
for(const cat in MEGA_MANIFEST){ MEGA[cat]=[]; for(let n=0;n<MEGA_MANIFEST[cat];n++) MEGA[cat].push(loadMega(megaPath(cat,n), cat, n)); }
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
  ruin:         { w:6, h:5, overhang:1.30, needPassable:false  },
};
const MEGA_EDGE=2, MEGA_KEEPOUT=4, MEGA_GAP=1;   // margins (tiles)

// The art is drawn wider than the core footprint (overhang, centred), so the art's
// ground BASE flares past the core. Block the tiles the base actually covers — its
// full drawn width × the footprint height — so units can't stand in the side margin
// and appear to walk under the building base. (The taller body above stays passable
// so units can pass BEHIND it; the depth sort occludes them there.)
function megaBlockRect(tx,ty,w,h,overhang){
  const bw = Math.max(w, Math.round(w*(overhang||1)));
  return { x: tx-((bw-w)>>1), y: ty, w: bw, h: h };
}

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

// Chebyshev distance from a point to a rect; < keep ⇒ too close.
function megaNearPoi(r,pois,keep){
  for(const p of pois){
    const dx = (p.x<r.x)?r.x-p.x : (p.x>=r.x+r.w)?p.x-(r.x+r.w-1):0;
    const dy = (p.y<r.y)?r.y-p.y : (p.y>=r.y+r.h)?p.y-(r.y+r.h-1):0;
    if(Math.max(dx,dy) < keep) return true;
  }
  return false;
}
function megaOverlaps(r,placed,gap){
  for(const m of placed){
    const o=megaBlockRect(m.tx,m.ty,m.w,m.h,m.overhang);
    if(r.x < o.x+o.w+gap && r.x+r.w+gap > o.x && r.y < o.y+o.h+gap && r.y+r.h+gap > o.y) return true;
  }
  return false;
}
// Find a candidate footprint whose BLOCK rect (the wider art base) is entirely on
// the target biome, off water, passable if required, in bounds, and clear of POIs
// and other landmarks. Returns the render footprint {tx,ty,w,h} or null.
function megaFindSpot(state, rng, cat){
  const {W,H,biome,tiles} = state, spec=CATSPEC[cat], fw=spec.w, fh=spec.h;
  const spanX=W-fw-2*MEGA_EDGE, spanY=H-fh-2*MEGA_EDGE;
  if(spanX<=0 || spanY<=0) return null;
  for(let attempt=0; attempt<300; attempt++){
    const tx=MEGA_EDGE+((rng()*spanX)|0), ty=MEGA_EDGE+((rng()*spanY)|0);
    const r=megaBlockRect(tx,ty,fw,fh,spec.overhang);
    if(r.x<MEGA_EDGE || r.x+r.w>W-MEGA_EDGE) continue;        // wider base rect must fit
    let ok=true;
    for(let y=r.y; y<r.y+r.h && ok; y++) for(let x=r.x; x<r.x+r.w && ok; x++){
      const i=y*W+x;
      if(megaCategory(biome[i])!==cat) ok=false;
      else if(tiles[i]===T_WATER) ok=false;
      else if(spec.needPassable && !passableTerrain(tiles[i])) ok=false;
    }
    if(!ok) continue;
    if(megaNearPoi(r,state._megaPois,MEGA_KEEPOUT)) continue;
    if(megaOverlaps(r,state.megaSprites,MEGA_GAP)) continue;
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
  const {W,H,blocked}=state, spec=CATSPEC[cat];
  for(let retry=0; retry<80; retry++){
    const spot=megaFindSpot(state, rng, cat);
    if(!spot) return false;                          // no geometric room left
    const r=megaBlockRect(spot.tx,spot.ty,spot.w,spot.h,spec.overhang);   // block the art base width
    const touched=[];
    for(let y=r.y; y<r.y+r.h; y++) for(let x=r.x; x<r.x+r.w; x++){
      if(x<0||y<0||x>=W||y>=H) continue;
      const k=y*W+x; if(blocked[k]===0){ blocked[k]=1; touched.push(k); } }
    if(megaConnOK(state, anchor, mustReach)){
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

const MEGA_NEON_PERIOD = 5.5; // match the main-menu crystal/star breath timing
let MEGA_REDUCED_MOTION = null;
function megaFrameIndex(state, m){
  if(m && m.fixedFrame!=null){
    const f=Math.floor(m.fixedFrame);
    return ((f%MEGA_FRAMES)+MEGA_FRAMES)%MEGA_FRAMES;
  }
  if(state && state.hub){
    const f=Math.floor(((m.seed||0)*9973)%MEGA_FRAMES);
    return ((f%MEGA_FRAMES)+MEGA_FRAMES)%MEGA_FRAMES;
  }
  const t=state.time||0, fps=MEGA_FPS[m.cat]||2.5;
  return ((((t*fps + (m.seed||0)*MEGA_FRAMES)|0)%MEGA_FRAMES)+MEGA_FRAMES)%MEGA_FRAMES;
}
function megaNeonFrame(m, fi){
  if(typeof MEGA_NEON_MAPS==='undefined' || !MEGA_NEON_MAPS || !MEGA_NEON_MAPS.sprites) return null;
  const spr=MEGA_NEON_MAPS.sprites[m.cat+'_'+m.variant];
  const fr=spr && spr.frames && spr.frames[fi];
  return fr && fr.glows && fr.glows.length ? fr.glows : null;
}
function megaRgb(c){ return Array.isArray(c) ? c : [180,120,255]; }
function megaRgba(c,a){ const r=megaRgb(c); return 'rgba('+((r[0]||0)|0)+','+((r[1]||0)|0)+','+((r[2]||0)|0)+','+Math.max(0,Math.min(1,a)).toFixed(3)+')'; }
function megaReducedMotion(){
  if(window._reduceFx) return true;   // T4-3: Settings "Reduce FX" forces the prefers-reduced-motion path
  if(MEGA_REDUCED_MOTION==null) MEGA_REDUCED_MOTION = typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return MEGA_REDUCED_MOTION;
}
function megaBreath(t, phase){
  if(megaReducedMotion()) return 0.5;
  const p=((t/MEGA_NEON_PERIOD + (phase||0))%1+1)%1;
  return (1-Math.cos(p*Math.PI*2))*0.5;
}
// Scarce neon flicker: a glow that stays fully lit MOST of the time and only
// occasionally stutters — the "barely-working red neon" look the H.U.B. Training
// Grounds asks for (slow, intense, scarcely flickering). `depth` (0..1) sets how
// far it dips. OPT-IN per glow via g.flicker; every other neon leaves it unset and
// renders steady exactly as before. Per-glow phase staggers the lamps so they never
// flicker in lockstep; motion freezes under prefers-reduced-motion.
const NEON_FLICKER_PERIOD = 6.5;    // seconds between a glow's flicker events (slow → scarce)
const NEON_FLICKER_WINDOW = 0.12;   // fraction of the cycle spent stuttering (brief)
function megaNeonFlicker(t, phase, depth){
  if(megaReducedMotion()) return 1;
  const d=Math.max(0, Math.min(1, depth>0 ? depth : 0.5));
  const p=((t/NEON_FLICKER_PERIOD + (phase||0))%1+1)%1;
  if(p < 1-NEON_FLICKER_WINDOW) return 1;                       // steady, fully lit
  const w=(p-(1-NEON_FLICKER_WINDOW))/NEON_FLICKER_WINDOW;      // 0..1 across the stutter
  const env=Math.sin(w*Math.PI);                                // ease in/out, no pop
  const blink=Math.abs(Math.sin(w*Math.PI*4.5));                // a few fast on/off blips
  return 1 - d*env*(1-blink);
}
function megaRoundRectPath(x,y,w,h,r){
  r=Math.max(0,Math.min(r,Math.abs(w)/2,Math.abs(h)/2));
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function megaFillEllipseGlow(cx,cy,rx,ry,rot,color,a0,a1){
  rx=Math.max(1,rx); ry=Math.max(1,ry);
  ctx.save();
  ctx.translate(cx,cy); ctx.rotate(rot||0); ctx.scale(1,ry/rx);
  const g=ctx.createRadialGradient(0,0,Math.max(1,rx*0.04), 0,0,rx);
  g.addColorStop(0, megaRgba(color,a0));
  g.addColorStop(0.54, megaRgba(color,a1));
  g.addColorStop(1, megaRgba(color,0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function megaStrokeRing(cx,cy,rx,ry,rot,color,a,width){
  rx=Math.max(1,rx); ry=Math.max(1,ry);
  ctx.save();
  ctx.translate(cx,cy); ctx.rotate(rot||0); ctx.scale(1,ry/rx);
  ctx.shadowColor=megaRgba(color,a*0.95); ctx.shadowBlur=Math.max(9,width*7.0);
  ctx.strokeStyle=megaRgba(color,a); ctx.lineWidth=Math.max(1.4,width);
  ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}
function megaFillBar(cx,cy,rx,ry,rot,color,a){
  rx=Math.max(1,rx); ry=Math.max(1,ry);
  ctx.save();
  ctx.translate(cx,cy); ctx.rotate(rot||0);
  ctx.shadowColor=megaRgba(color,a*0.88); ctx.shadowBlur=Math.max(10,ry*9.0);
  const g=ctx.createLinearGradient(-rx,0,rx,0);
  g.addColorStop(0, megaRgba(color,0));
  g.addColorStop(0.18, megaRgba(color,a*0.34));
  g.addColorStop(0.5, megaRgba(color,a*0.66));
  g.addColorStop(0.82, megaRgba(color,a*0.34));
  g.addColorStop(1, megaRgba(color,0));
  ctx.fillStyle=g; megaRoundRectPath(-rx,-ry,rx*2,ry*2,ry); ctx.fill();
  ctx.restore();
}
function megaSparkPoint(g,i,cx,cy,rx,ry,rot,t){
  const n=Math.max(1,g.sparkle||1), ph=(g.phase||0)*Math.PI*2;
  let lx=0, ly=0;
  if(g.kind==='ring'){
    const a=ph + i*Math.PI*2/n + (megaReducedMotion()?0:Math.sin(t*0.55+ph)*0.08);
    lx=Math.cos(a)*rx*0.9; ly=Math.sin(a)*ry*0.9;
  } else if(g.kind==='bar'){
    lx=(-0.7 + (i+0.5)*1.4/n)*rx; ly=Math.sin(ph+i*1.7)*ry*0.35;
  } else {
    lx=Math.sin(ph+i*2.1)*rx*0.36; ly=Math.cos(ph+i*1.8)*ry*0.36;
  }
  const cr=Math.cos(rot||0), sr=Math.sin(rot||0);
  return { x:cx+lx*cr-ly*sr, y:cy+lx*sr+ly*cr };
}
function megaDrawSpark(x,y,r,color,a){
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(x,y,0,x,y,r*2.2);
  g.addColorStop(0, megaRgba([255,245,255],a));
  g.addColorStop(0.34, megaRgba(color,a*0.74));
  g.addColorStop(1, megaRgba(color,0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*2.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=megaRgba([255,245,255],a);
  ctx.beginPath();
  ctx.moveTo(x,y-r); ctx.lineTo(x+r*0.28,y-r*0.28); ctx.lineTo(x+r,y); ctx.lineTo(x+r*0.28,y+r*0.28);
  ctx.lineTo(x,y+r); ctx.lineTo(x-r*0.28,y+r*0.28); ctx.lineTo(x-r,y); ctx.lineTo(x-r*0.28,y-r*0.28);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawMegaNeonLayer(state, m, glows, dx, dy, dw, dh, layer){
  if(!glows || !glows.length) return;
  const t=state.time||0, seed=m.seed||0;
  ctx.save();
  ctx.globalCompositeOperation = layer==='core' ? 'lighter' : 'source-over';
  for(const g of glows){
    const cx=dx+g.x*dw, cy=dy+g.y*dh, rx=Math.max(1,g.rx*dw), ry=Math.max(1,g.ry*dh);
    const rot=g.rot||0, color=g.color||[180,120,255], breath=megaBreath(t, (g.phase||0)+seed*0.37);
    let base=(g.alpha==null?1:g.alpha)*(g.pulse==null?1:g.pulse);
    if(g.flicker) base *= megaNeonFlicker(t, (g.phase||0)+seed*0.37, g.flicker);
    if(layer==='aura'){
      if(g.kind==='ring'){
        const pulse=0.7+0.3*breath, aura=base*(0.46+0.22*breath);
        megaFillEllipseGlow(cx,cy,rx*3.45*pulse,Math.max(ry*4.25*pulse,rx*0.48*pulse),rot,color,aura,aura*0.50);
        megaFillEllipseGlow(cx,cy,rx*5.2*pulse,Math.max(ry*5.8*pulse,rx*0.68*pulse),rot,color,aura*0.25,aura*0.14);
        continue;
      }
      if(g.kind==='bar'){
        const pulse=0.78+0.22*breath, aura=base*(0.36+0.20*breath);
        megaFillEllipseGlow(cx,cy,rx*3.35*pulse,Math.max(ry*4.1*pulse,rx*0.22*pulse),rot,color,aura,aura*0.44);
        megaFillEllipseGlow(cx,cy,rx*4.9*pulse,Math.max(ry*5.8*pulse,rx*0.33*pulse),rot,color,aura*0.20,aura*0.10);
        continue;
      }
      const aura=base*(0.24+0.27*breath), spread=g.kind==='bar'?2.4:2.65;
      megaFillEllipseGlow(cx,cy,rx*(spread+0.25),ry*(spread+0.25),rot,color,aura,aura*0.38);
      continue;
    }
    const core=base*(0.34+0.52*breath);
    if(g.kind==='bar'){
      const stripCore=base*(0.20+0.30*breath);
      megaFillEllipseGlow(cx,cy,rx*2.75,Math.max(ry*3.8,rx*0.23),rot,color,stripCore*0.34,stripCore*0.14);
      megaFillEllipseGlow(cx,cy,rx*1.85,Math.max(ry*2.55,rx*0.16),rot,color,stripCore*0.30,stripCore*0.09);
      megaFillBar(cx,cy,rx*1.18,Math.max(2.0,ry*0.74),rot,color,stripCore);
    }
    else if(g.kind==='ring'){
      megaFillEllipseGlow(cx,cy,rx*2.15,Math.max(ry*2.45,rx*0.34),rot,color,core*0.30,core*0.12);
      megaFillEllipseGlow(cx,cy,rx*1.24,Math.max(ry*1.38,rx*0.20),rot,color,core*0.34,core*0.08);
      megaStrokeRing(cx,cy,rx*1.04,ry*1.04,rot,color,core,Math.max(1.5,Math.min(rx,ry)*0.12));
    }
    else {
      const stripish=rx>ry*1.12;
      const spotCore=stripish ? base*(0.20+0.32*breath) : core;
      megaFillEllipseGlow(cx,cy,rx*(stripish?2.85:2.0),ry*(stripish?2.55:2.0),rot,color,spotCore*0.38,spotCore*0.14);
      if(stripish) megaFillEllipseGlow(cx,cy,rx*1.65,ry*1.48,rot,color,spotCore*0.44,spotCore*0.12);
      else megaFillEllipseGlow(cx,cy,rx*1.15,ry*1.15,rot,color,spotCore,spotCore*0.24);
    }
    const sparks=g.sparkle|0;
    for(let i=0;i<sparks;i++){
      const tw=megaReducedMotion()?0.62:(0.5+0.5*Math.sin(t*(Math.PI*2/(2.9+((i+(g.id||0))%4)*0.5)) + (g.phase||0)*7.1 + i*1.9));
      if(tw<0.08) continue;
      const p=megaSparkPoint(g,i,cx,cy,rx,ry,rot,t), sr=Math.max(1.6,Math.min(5.5,Math.min(rx,ry)*0.18));
      megaDrawSpark(p.x,p.y,sr,color,base*0.68*tw);
    }
  }
  ctx.restore();
}
function megaHash01(a,b){
  const x=Math.sin((a||0)*127.1 + b*311.7)*43758.5453;
  return x-Math.floor(x);
}
function drawWasteMegaSmoke(state,m,dx,dy,dw,dh,layer){
  const t=state.time||0, seed=m.seed||0, count=layer==='front'?7:10;
  ctx.save();
  ctx.globalCompositeOperation = layer==='front' ? 'source-over' : 'lighter';
  for(let i=0;i<count;i++){
    const h0=megaHash01(seed,i+1), h1=megaHash01(seed,i+11), h2=megaHash01(seed,i+23);
    const a=Math.PI*2*h0 + t*(0.10+0.05*h2);
    const ring=0.28+0.20*h1, bob=Math.sin(t*(0.55+0.12*h1)+h2*6.283)*dh*0.025;
    const cx=dx+dw*(0.50+Math.cos(a)*ring);
    const cy=dy+dh*(0.43+Math.sin(a)*0.26)+bob-(layer==='front'?dh*0.02:dh*0.07);
    const rx=dw*(0.13+0.10*h1)*(layer==='front'?1.01:1.40);
    const ry=dh*(0.08+0.07*h2)*(layer==='front'?1.01:1.40);
    const pulse=0.58+0.42*Math.sin(t*(0.75+0.09*i)+h0*6.283);
    const alpha=(layer==='front'?0.098:0.150)*(0.65+0.35*pulse);
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate((h0-0.5)*0.55+Math.sin(t*0.18+h1)*0.18); ctx.scale(1,ry/rx);
    const g=ctx.createRadialGradient(0,0,rx*0.04,0,0,rx);
    g.addColorStop(0, megaRgba([138,255,92], alpha));
    g.addColorStop(0.42, megaRgba([62,230,76], alpha*0.46));
    g.addColorStop(0.74, megaRgba([34,150,58], alpha*0.20));
    g.addColorStop(1, megaRgba([20,90,42], 0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  if(layer==='back'){
    const cx=dx+dw*0.5, cy=dy+dh*0.52, pulse=megaBreath(t,seed*0.31);
    megaFillEllipseGlow(cx,cy,dw*(0.91+0.08*pulse),dh*(0.62+0.05*pulse),0,[80,255,82],0.143+0.052*pulse,0.049);
  }
  ctx.restore();
}

// Dense white "summit fog sea" for HUB mountain megasprites: a cool-white cloud that
// clings to and rises over the peak. Two passes like drawWasteMegaSmoke — a faint
// additive halo BEHIND the peak (adds depth and bleeds between neighbours so the chain
// reads as one continuous sea) and dense source-over puffs IN FRONT over the summit.
// Density scales with footprint width (big) so the giant centrepiece (mega_30, w=19)
// gets a thick sea while the 7-wide chain peaks get a lighter band. Deterministic per
// instance via m.seed; motion freezes under prefers-reduced-motion. Cool off-white
// (not pure #fff) so it reads as moonlit fog, not a glare, against the dark sky.
function drawMountainFog(state,m,dx,dy,dw,dh,layer){
  const rm=megaReducedMotion(), t=rm?0:(state.time||0), seed=m.seed||0;
  const big=Math.max(0,Math.min(1,((m.w||7)-7)/12));            // 0 chain peak → 1 giant
  const wind=Math.sin(t*0.08+seed*6.283)*dw*0.05;              // shared sway → bank moves as one
  ctx.save();
  if(layer==='back'){
    ctx.globalCompositeOperation='lighter';                     // subtle additive halo
    const n=Math.round(4+big*5);
    for(let i=0;i<n;i++){
      const h0=megaHash01(seed,i+5), h1=megaHash01(seed,i+15), h2=megaHash01(seed,i+25);
      const cx=dx+dw*(0.5+(h0-0.5)*0.95)+wind;
      const cy=dy+dh*(0.10+h1*(0.10+big*0.10))+Math.sin(t*(0.25+0.1*h2)+h2*6.283)*dh*0.02;
      const rx=dw*(0.22+0.16*h1)*(1+big*0.5), ry=rx*0.55;
      const a=(0.06+0.06*big)*(0.7+0.3*Math.sin(t*(0.4+0.1*i)+h0*6.283));
      megaFillEllipseGlow(cx,cy,rx,ry,0,[210,228,246],a,a*0.4);
    }
    ctx.restore();
    return;
  }
  // FRONT: dense cloud sea over the summit — 1–2 wide flat "sea surface" slabs + puffs.
  ctx.globalCompositeOperation='source-over';
  const slabs=1+(big>0.4?1:0);
  for(let s=0;s<slabs;s++){
    const hs=megaHash01(seed,s+40);
    const cx=dx+dw*0.5+wind*0.6, cy=dy+dh*(0.13+s*0.05)+Math.sin(t*0.3+hs*6.283)*dh*0.012;
    const rx=dw*(0.55+0.12*big), ry=dh*(0.06+0.03*big), a=0.20+0.16*big;
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(1,ry/rx);
    const g=ctx.createRadialGradient(0,0,rx*0.05,0,0,rx);
    g.addColorStop(0, megaRgba([238,245,252],a));
    g.addColorStop(0.5, megaRgba([218,231,244],a*0.5));
    g.addColorStop(1, megaRgba([200,216,234],0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  const n=Math.round(7+big*9);
  for(let i=0;i<n;i++){
    const h0=megaHash01(seed,i+1), h1=megaHash01(seed,i+11), h2=megaHash01(seed,i+23);
    const cx=dx+dw*(0.5+(h0-0.5)*0.9)+wind+Math.sin(t*(0.12+0.05*h1)+h0*6.283)*dw*0.03;
    const cy=dy+dh*(0.08+h1*(0.14+big*0.10))+Math.sin(t*(0.5+0.15*h2)+h2*6.283)*dh*0.02;
    const rx=dw*(0.16+0.12*h2)*(1+big*0.35), ry=rx*0.6;
    const a=(0.30+0.18*big)*(0.7+0.3*Math.sin(t*(0.6+0.1*i)+h0*6.283));
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate((h0-0.5)*0.3); ctx.scale(1,ry/rx);
    const g=ctx.createRadialGradient(0,0,rx*0.05,0,0,rx);
    g.addColorStop(0, megaRgba([238,245,252],a));
    g.addColorStop(0.5, megaRgba([214,228,242],a*0.5));
    g.addColorStop(1, megaRgba([198,214,232],0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// Draw ONE landmark, bottom-anchored, aspect-preserved, overhanging upward like a
// building; fog-gated on the centre tile (skip if unexplored, dim if explored-but-
// not-visible); animated frame pick from state.time at a per-category fps, desynced
// by the per-instance seed. HUB instances can pin a fixed frame and layer matching
// generated neon maps over it. Culls to the visible tile span.
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
  if(spr){
    const dw=w*(m.overhang||1.3), dh=dw*(spr.fh/spr.fw)*(m.heightScale||1);
    const dx=px+(w-dw)/2, dy=py+h-dh+2;
    let img=spr.img;
    if(m.cat==='ruin') img=megaTintFor(spr, m.biome) || spr.img;   // lazy one-time tint bake (snow/sand)
    if(m.hubAnim){
      // MADOSIS Mental Health Facility: animate (not the static HUB frame) at HALF the ambient speed,
      // CROSS-FADING consecutive frames so the lights pulse smoothly with no hard frame pops. Frames
      // share one bbox, so alpha-blending A→B reads as a slow breath of the cyan neon.
      const N=MEGA_FRAMES, fps=(MEGA_FPS[m.cat]||1.4)*0.5;
      const p=t*fps + (m.seed||0), fl=Math.floor(p), s=(p-fl)*(p-fl)*(3-2*(p-fl));   // smoothstep
      const fiA=((fl%N)+N)%N, fiB=(fiA+1)%N, useNeon=(state.hub || m.neon);
      // force the facility's lights to a calm cyan (the strip bakes red in later frames; recolor the
      // generated glows so the Mental Health Facility reads as a steady cyan, not an alarm red).
      const cyanize=(gl)=> gl ? gl.map(g=>Object.assign({},g,{color:[80,230,255]})) : null;
      const nA=useNeon?cyanize(megaNeonFrame(m,fiA)):null, nB=useNeon?cyanize(megaNeonFrame(m,fiB)):null;
      ctx.save(); ctx.globalAlpha*=(1-s); drawMegaNeonLayer(state,m,nA,dx,dy,dw,dh,'aura'); ctx.restore();
      ctx.save(); ctx.globalAlpha*=s;     drawMegaNeonLayer(state,m,nB,dx,dy,dw,dh,'aura'); ctx.restore();
      ctx.drawImage(img, fiA*spr.fw, 0, spr.fw, spr.fh, dx, dy, dw, dh);
      ctx.save(); ctx.globalAlpha*=s; ctx.drawImage(img, fiB*spr.fw, 0, spr.fw, spr.fh, dx, dy, dw, dh); ctx.restore();
      ctx.save(); ctx.globalAlpha*=(1-s); drawMegaNeonLayer(state,m,nA,dx,dy,dw,dh,'core'); ctx.restore();
      ctx.save(); ctx.globalAlpha*=s;     drawMegaNeonLayer(state,m,nB,dx,dy,dw,dh,'core'); ctx.restore();
    } else {
      const fi=megaFrameIndex(state,m);
      const neon=(state.hub || m.neon) ? megaNeonFrame(m,fi) : null;
      const fog=state.hub && m.cat==='mountain';                 // dense summit fog on hub peaks
      if(m.hubWaste) drawWasteMegaSmoke(state,m,dx,dy,dw,dh,'back');
      if(fog) drawMountainFog(state,m,dx,dy,dw,dh,'back');         // halo behind the peak
      drawMegaNeonLayer(state,m,neon,dx,dy,dw,dh,'aura');
      ctx.drawImage(img, fi*spr.fw, 0, spr.fw, spr.fh, dx, dy, dw, dh);
      drawMegaNeonLayer(state,m,neon,dx,dy,dw,dh,'core');
      if(fog) drawMountainFog(state,m,dx,dy,dw,dh,'front');        // dense cloud over the summit
      if(m.hubWaste) drawWasteMegaSmoke(state,m,dx,dy,dw,dh,'front');
    }
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
