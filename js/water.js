/* water.js — Hades-inspired water & magma surface system. Replaces the old flat per-tile
   waterBody() fill (the "32px checkerboard") with a CONTINUOUS depth gradient sampled from a
   once-baked distance-to-shore field, plus a world-space caustic shimmer, an ambient Almeros/
   Hugo-Elias "tide" height-field (desktop/hi-DPI) or a lighter analytic swell (mobile/reduced-
   motion), and dark molten-crust + glowing cracks + hot-core bloom for lava.

   Mirrors the particles.js engineering contract: module-local IIFE, pre-allocated buffers (ZERO
   per-frame allocation), offscreen sprites baked once + cached, device-tiered quality, visible-
   span culled + fog gated, frozen on pause (driven off state.time which only advances in update()).
   Everything samples WORLD coordinates so effects flow continuously across the 32px tile grid.

   Public API (window): buildWaterDepth(state), updateWater(state,dt), drawWaterBaseTile(b,v,depth,px,py),
   drawWater(state,x0,y0,x1,y1), waterDepthAt(state,i), waterField(wx,wy), waterGrad(wx,wy),
   waterRipple(state,wx,wy,amp). All call sites in render.js/core.js/map.js/save.js are typeof-guarded,
   so the game still runs (legacy flat fill) if this file is absent. */

(function(){
  'use strict';

  // ---- device tiers (same detection idiom as particles.js:17-20) ----
  //   0 = reduced-motion: static depth gradient only (no caustic, no tide)
  //   1 = touch: depth + caustic + analytic sine-swell highlight (no height-field)
  //   2 = desktop / hi-DPI: depth + caustic + full Almeros height-field tide
  const _rm = (()=>{ try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(_){ return false; } })();
  const _touch = (innerWidth < 820) || ('ontouchstart' in window);
  const TIER = _rm ? 0 : (_touch ? 1 : 2);

  const R = Math.random;
  function _c8(v){ return v<0?0:(v>255?255:v|0); }
  function _fmod(a,m){ return ((a%m)+m)%m; }   // positive modulo for the world scroll offset

  /* ============================================================
     DEPTH RAMPS — 2-anchor [shallow, deep] RGB per water biome.
     Color is lerped by normalized depth (0 at shore .. 1 deep), so it varies by tile
     POSITION not per-tile random → the checkerboard disappears. Stays on the dark/
     devastated palette (BIOME_PAL water a:#0c2230 b:#103040). Magma base is dominantly
     DARK basalt; the glow comes from the crack/core overlay in drawWater, not the base. */
  // Wider shallow->deep contrast so the depth gradient is clearly readable (was too shy).
  // Shallow is a lit teal near shore; deep is near-black — average stays dark/devastated.
  const RAMP = {
    [B_WATER]:    [[34,96,116], [7,22,33]],    // lit toxic teal -> near-black abyss
    [B_ICE]:      [[58,104,122],[20,42,54]],   // slush -> deep frozen
    [B_TECH]:     [[26,74,86],  [9,26,34]],    // coolant cyan -> dark
    [B_VOLCANIC]: [[52,30,20],  [16,11,8]],    // scorched edge -> near-black basalt
  };
  const DEPTH_SCALE = 6;                       // tiles to reach "open deep" before smoothing/renorm

  function _ramp(b){ return RAMP[b] || RAMP[B_WATER]; }

  // Phase-1 de-block base fill. Replaces the flat waterBody() fillRect in drawWaterTile.
  function drawWaterBaseTile(b,v,depth,px,py){
    // optional Gemini atlas upgrade (Phase 4) — drop-in if assets/atlas/water.png is present
    if(typeof WATER_READY!=='undefined' && WATER_READY && typeof waterSpriteFor==='function'){
      const r = waterSpriteFor(b, 'depth', (depth*2.999)|0);   // 3-cell shore->mid->deep strip
      if(r){ ctx.drawImage(WATER_IMG, r[0],r[1],r[2],r[3], px,py, TILE+1,TILE+1); return; }
    }
    // NO per-tile dither — it was square-aligned and reintroduced the pixelated look. The depth
    // field is now smoothed + renormalized in buildWaterDepth, so the lerp alone is a clean gradient.
    const ra=_ramp(b), sh=ra[0], dp=ra[1], t=depth;
    ctx.fillStyle = 'rgb('+_c8(sh[0]+(dp[0]-sh[0])*t)+','+_c8(sh[1]+(dp[1]-sh[1])*t)+','+_c8(sh[2]+(dp[2]-sh[2])*t)+')';
    ctx.fillRect(px,py,TILE+1,TILE+1);          // 1px overscan hides seams (same as the old fill)
  }

  /* ============================================================
     DISTANCE-TO-SHORE DEPTH FIELD (baked once at map load / save load).
     Multi-source BFS from shore water tiles (a water tile with >=1 non-water / off-map
     orthogonal neighbour). Also (re)allocates the tide height-field buffers + water-cell
     mask + bounding box for this map. O(water tiles). */
  let _W=0, _H=0;
  let _box=null;                 // {gx0,gy0,GW,GH} water bounding box in TILE units (1 cell/tile)
  let _hCur=null, _hPrev=null;   // Float32Array tide height buffers (pointer-swapped, zero per-frame alloc)
  let _mask=null;                // Uint8Array: 1 where a cell maps to a water tile (land cells stay 0 = walls)

  function buildWaterDepth(state){
    const W=state.W, H=state.H, T=state.tiles, N=W*H;
    _W=W; _H=H;
    const depth=new Float32Array(N);
    const dist=new Int32Array(N); dist.fill(-1);
    const q=new Int32Array(N); let qh=0, qt=0;
    let minx=W, miny=H, maxx=-1, maxy=-1;
    const isW = i => T[i]===T_WATER;
    // seed: shore water tiles (distance 0) + track bbox
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x; if(!isW(i)) continue;
      if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
      const shore = (x===0||!isW(i-1)) || (x===W-1||!isW(i+1)) || (y===0||!isW(i-W)) || (y===H-1||!isW(i+W));
      if(shore){ dist[i]=0; q[qt++]=i; }
    }
    // BFS outward through water-only neighbours
    while(qh<qt){
      const i=q[qh++], dd=dist[i]+1, x=i%W, y=(i/W)|0;
      if(x>0   && isW(i-1) && dist[i-1]<0){ dist[i-1]=dd; q[qt++]=i-1; }
      if(x<W-1 && isW(i+1) && dist[i+1]<0){ dist[i+1]=dd; q[qt++]=i+1; }
      if(y>0   && isW(i-W) && dist[i-W]<0){ dist[i-W]=dd; q[qt++]=i-W; }
      if(y<H-1 && isW(i+W) && dist[i+W]<0){ dist[i+W]=dd; q[qt++]=i+W; }
    }
    for(let i=0;i<N;i++){
      if(!isW(i)){ depth[i]=0; continue; }
      const dd = dist[i]<0 ? DEPTH_SCALE : dist[i];     // unreached (shouldn't happen post-erosion) -> deep
      depth[i] = dd>=DEPTH_SCALE ? 1 : dd/DEPTH_SCALE;
    }
    // ---- smooth the integer-distance RINGS into a continuous gradient (kills the blocky
    //      concentric bands), then renormalize to the full 0..1 range so every body shows a
    //      clear shallow->deep gradient regardless of size (fixes "barely see it" + "squares"). ----
    const tmp=new Float32Array(N);
    for(let p=0;p<6;p++){
      for(let i=0;i<N;i++){
        if(!isW(i)){ tmp[i]=depth[i]; continue; }
        const x=i%W, y=(i/W)|0; let s=depth[i], c=1;
        if(x>0   && isW(i-1)){ s+=depth[i-1]; c++; }
        if(x<W-1 && isW(i+1)){ s+=depth[i+1]; c++; }
        if(y>0   && isW(i-W)){ s+=depth[i-W]; c++; }
        if(y<H-1 && isW(i+W)){ s+=depth[i+W]; c++; }
        tmp[i]=s/c;
      }
      depth.set(tmp);
    }
    let mx=0; for(let i=0;i<N;i++){ if(isW(i) && depth[i]>mx) mx=depth[i]; }
    if(mx>0.001){ const inv=1/mx; for(let i=0;i<N;i++){ if(isW(i)) depth[i]*=inv; } }
    state.waterDepth = depth;

    // ---- allocate the tide field over the water bbox (1 cell per tile) ----
    if(maxx<0){ _box=null; _hCur=_hPrev=_mask=null; return; }
    const gx0=Math.max(0,minx-1), gy0=Math.max(0,miny-1);
    const gx1=Math.min(W-1,maxx+1), gy1=Math.min(H-1,maxy+1);
    const GW=gx1-gx0+1, GH=gy1-gy0+1;
    _box={gx0,gy0,GW,GH};
    _hCur=new Float32Array(GW*GH); _hPrev=new Float32Array(GW*GH);
    _mask=new Uint8Array(GW*GH);
    for(let cy=0;cy<GH;cy++)for(let cx=0;cx<GW;cx++){
      const tx=gx0+cx, ty=gy0+cy;
      // only LIQUID water carries the tide (ice is frozen, volcanic uses it for crack/core modulation)
      if(T[ty*W+tx]===T_WATER) _mask[cy*GW+cx]=1;
    }
  }
  function waterDepthAt(state,i){ return state.waterDepth ? state.waterDepth[i] : 0; }

  /* ============================================================
     TIDE — ambient Almeros/Hugo-Elias height-field + analytic swell.
     waterField(wx,wy) returns a small height; waterGrad gives |d/dx| for the specular tilt.
     The swell is always added analytically so even an un-agitated body breathes; the buffer
     adds propagating ripples on TIER 2. NO per-pixel ImageData refraction. */
  const DAMP = 0.985;            // research band 0.98-0.99; gentle, long-lived swell
  const SWELL_AMP = 2.4;         // bold enough that the swell visibly moves the highlight wavefronts
  const AMBIENT_AMP = 2.2;       // sparse ambient ripple impulse
  const TIDE_DT = 0.09;          // field tick cadence (s) — ~every 5th-6th frame at 60fps
  let _t=0, _tideAcc=0;

  function waterField(wx,wy){
    // crossed sines: faster in time + a touch higher spatial freq → more, clearly-travelling crests
    let h = SWELL_AMP * Math.sin(_t*0.8 + wx*0.018) * Math.sin(_t*0.55 + wy*0.022);
    if(TIER>=2 && _box && _hCur){
      const fx = wx/TILE - _box.gx0, fy = wy/TILE - _box.gy0;
      const ix=Math.floor(fx), iy=Math.floor(fy), GW=_box.GW, GH=_box.GH;
      if(ix>=0 && iy>=0 && ix<GW-1 && iy<GH-1){
        const tx=fx-ix, ty=fy-iy, o=iy*GW+ix;
        const a=_hCur[o], b=_hCur[o+1], c=_hCur[o+GW], d=_hCur[o+GW+1];
        h += (a+(b-a)*tx) + ((c+(d-c)*tx) - (a+(b-a)*tx))*ty;   // bilinear
      }
    }
    return h;
  }
  function waterGrad(wx,wy){ return Math.abs(waterField(wx+TILE,wy) - waterField(wx-TILE,wy)); }

  // add an impulse at a world position (ambient seeding + the public waterRipple injector)
  function _impulse(wx,wy,amp){
    if(!_box || !_hCur) return;
    const cx=Math.round(wx/TILE - _box.gx0), cy=Math.round(wy/TILE - _box.gy0);
    if(cx<1||cy<1||cx>=_box.GW-1||cy>=_box.GH-1) return;
    const o=cy*_box.GW+cx; if(_mask[o]) _hCur[o]+=amp;
  }
  function waterRipple(state,wx,wy,amp){ if(TIER>=2) _impulse(wx,wy,amp!=null?amp:3.0); }  // exposed; not wired to combat (ambient-only)

  function _bounds(state){
    const z=state.zoom||1, vx=state.camX, vy=state.camY, W=state.W, H=state.H;
    return [ Math.max(0,(vx/TILE)|0), Math.max(0,(vy/TILE)|0),
             Math.min(W, ((vx+viewW()/z)/TILE|0)+1), Math.min(H, ((vy+viewH()/z)/TILE|0)+1) ];
  }

  function updateWater(state, dt){
    _t = state.time||0;
    if(TIER<2 || !_box || !_hCur) return;     // swell is analytic; only TIER 2 ticks the field
    _tideAcc += dt; if(_tideAcc < TIDE_DT) return; _tideAcc = 0;
    const GW=_box.GW, GH=_box.GH;
    // Almeros recurrence over water-masked interior cells; result -> _hPrev, then pointer-swap
    for(let cy=1;cy<GH-1;cy++)for(let cx=1;cx<GW-1;cx++){
      const o=cy*GW+cx;
      if(!_mask[o]){ _hPrev[o]=0; continue; }                 // land cells held at 0 = reflecting walls
      let v = (_hCur[o-1]+_hCur[o+1]+_hCur[o-GW]+_hCur[o+GW])*0.5 - _hPrev[o];
      v *= DAMP;
      _hPrev[o]=v;
    }
    const tmp=_hCur; _hCur=_hPrev; _hPrev=tmp;
    // sparse ambient seeding within the visible span only (off-screen water stays calm/invisible)
    if((typeof running!=='undefined' && !running) || state.over) return;
    const [x0,y0,x1,y1]=_bounds(state);
    for(let k=0;k<8;k++){
      const tx=x0+((R()*(x1-x0))|0), ty=y0+((R()*(y1-y0))|0);
      _impulse(tx*TILE+16, ty*TILE+16, (R()-0.5)*AMBIENT_AMP);
    }
  }

  /* ============================================================
     OFFSCREEN BAKES (once, cached like particles _glow):
     _caustic  : seamless 128 cyan caustic tile (water shimmer)
     _lava     : seamless 128 orange molten-crack tile (thresholded ~top 30%)
     _lavaCore : radial orange bloom sprite (hot core) */
  let _caustic=null, _lava=null, _lavaCore=null, _causticPat=null, _lavaPat=null;

  // tileable value-noise: blend the cell with its wrapped copies so opposite edges match
  function _tnoise(nz, x, y, S, F){
    const fx=x/S, fy=y/S;
    return nz.fbm(x*F,y*F,3)*(1-fx)*(1-fy)
         + nz.fbm((x-S)*F,y*F,3)*fx*(1-fy)
         + nz.fbm(x*F,(y-S)*F,3)*(1-fx)*fy
         + nz.fbm((x-S)*F,(y-S)*F,3)*fx*fy;
  }
  function _bake(){
    if(_caustic) return;
    const S=128, F=0.055;
    const nz=(typeof makeNoise2D==='function') ? makeNoise2D(1337) : null;
    // caustic (cyan veins)
    _caustic=document.createElement('canvas'); _caustic.width=_caustic.height=S;
    const cx=_caustic.getContext('2d'), cim=cx.createImageData(S,S), cd=cim.data;
    // lava (orange cracks)
    _lava=document.createElement('canvas'); _lava.width=_lava.height=S;
    const lx=_lava.getContext('2d'), lim=lx.createImageData(S,S), ld=lim.data;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      const n = nz ? _tnoise(nz,x,y,S,F) : (0.5+0.5*Math.sin(x*0.2)*Math.sin(y*0.2));
      const j=(y*S+x)*4;
      // caustic: bright cyan where noise is high (vein-like). Squared (not cubed) → broader,
      // more visible shimmer coverage rather than thin sparse veins.
      let ci = (n-0.42)*1.9; ci = ci>0 ? ci*ci : 0;
      cd[j]=160; cd[j+1]=236; cd[j+2]=240; cd[j+3]=(Math.min(1,ci)*255)|0;
      // lava cracks: orange ramp in top ~30% of noise; hotter toward the peak
      let li = (n-0.6)/0.4; li = li<0?0:(li>1?1:li);
      const hot = li>0.6 ? (li-0.6)/0.4 : 0;
      ld[j]=255; ld[j+1]=(107+93*hot)|0; ld[j+2]=(53+67*hot)|0; ld[j+3]=(li*li*255)|0;
    }
    cx.putImageData(cim,0,0); lx.putImageData(lim,0,0);
    // hot-core radial bloom
    const cs=96; _lavaCore=document.createElement('canvas'); _lavaCore.width=_lavaCore.height=cs;
    const gx=_lavaCore.getContext('2d'), grd=gx.createRadialGradient(cs/2,cs/2,0, cs/2,cs/2,cs/2);
    grd.addColorStop(0,'rgba(255,150,60,1)'); grd.addColorStop(0.45,'rgba(255,90,30,0.5)'); grd.addColorStop(1,'rgba(200,50,16,0)');
    gx.fillStyle=grd; gx.fillRect(0,0,cs,cs);
    try{ _causticPat=ctx.createPattern(_caustic,'repeat'); _lavaPat=ctx.createPattern(_lava,'repeat'); }catch(_){ _causticPat=_lavaPat=null; }
  }
  // scroll a repeat-pattern in WORLD space so the texture crosses 32px tile seams seamlessly
  function _setPat(pat, ox, oy){
    if(!pat) return false;
    if(pat.setTransform){ try{ pat.setTransform(new DOMMatrix().translateSelf(ox,oy)); }catch(_){ } }
    return true;
  }

  /* ============================================================
     OVERLAY SPAN PASS — caustic + magma cracks/core + specular tide band.
     Called from render() after the terrain loop, inside the world transform. Batches the
     caustic/crack as single pattern-filled paths (a handful of draw calls, not 4k gradients);
     the per-tile specular band is one cheap fillRect each. Shorelines were already drawn by
     drawWaterTile and stay correct: caustic is faint additive; magma cracks/core skip the
     shore ring (depth ~0) so the burnt rim reads cleanly. */
  function drawWater(state, x0,y0,x1,y1){
    if(TIER<1) return;
    _t = state.time||0;
    _bake();
    const W=state.W, T=state.tiles, B=state.biome, DEP=state.waterDepth, EXP=state.explored;
    let hasMagma=false;

    // ---- pass A: cyan caustic over liquid water — TWO crossing layers (build the path once,
    //      fill twice with different world-scroll offsets) so the shimmer visibly flows. ----
    if(_causticPat){
      ctx.save();
      ctx.globalCompositeOperation='lighter'; ctx.fillStyle=_causticPat;
      ctx.beginPath();
      for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
        const i=ty*W+tx; if(T[i]!==T_WATER || !EXP[i]) continue;
        const b=B[i];
        if(b===B_VOLCANIC){ hasMagma=true; continue; }
        if(b===B_ICE) continue;                              // frozen — no caustic
        ctx.rect(tx*TILE, ty*TILE, TILE+1, TILE+1);
      }
      _setPat(_causticPat, -_fmod(_t*7,128),  -_fmod(_t*-4,128)); ctx.globalAlpha=0.15; ctx.fill();
      _setPat(_causticPat, -_fmod(_t*-5,128), -_fmod(_t*6,128));  ctx.globalAlpha=0.11; ctx.fill();
      ctx.restore();
    } else {
      for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){ const i=ty*W+tx; if(T[i]===T_WATER&&EXP[i]&&B[i]===B_VOLCANIC){ hasMagma=true; ty=y1; break; } }
    }

    // ---- pass B: tide as a soft whole-tile brightness SWELL. Wave crests (positive height)
    //      glow gently across the whole tile; troughs stay dark. Because the field varies
    //      smoothly across tiles, this reads as broad MOVING bands of light drifting over the
    //      water (a tide) — never hard lines or per-tile dashes. Sampled at the tile corners
    //      and averaged so the brightness is smooth across the 32px seam, not a flat block. ----
    ctx.save();
    ctx.globalCompositeOperation='lighter'; ctx.fillStyle='rgba(120,210,222,1)';
    for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
      const i=ty*W+tx; if(T[i]!==T_WATER || !EXP[i]) continue;
      const b=B[i]; if(b===B_ICE || b===B_VOLCANIC) continue;
      const px=tx*TILE, py=ty*TILE;
      // average the wave height at the four tile corners → smooth tile-to-tile (no blocky steps)
      const h=(waterField(px,py)+waterField(px+TILE,py)+waterField(px,py+TILE)+waterField(px+TILE,py+TILE))*0.25;
      if(h<=0.1) continue;                                   // only crests glow → broad bright bands, dark troughs
      let a=h*0.05; if(a>0.13) a=0.13;
      if(!state.visible[i]) a*=0.5;
      ctx.globalAlpha=a; ctx.fillRect(px, py, TILE+1, TILE+1);
    }
    ctx.restore();

    // ---- pass C: magma molten cracks + hot-core bloom (interior tiles only) ----
    if(hasMagma){
      if(_lavaPat){
        _setPat(_lavaPat, -_fmod(_t*2,128), -_fmod(_t*1.3,128));
        ctx.save();
        ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.5; ctx.fillStyle=_lavaPat;
        ctx.beginPath();
        for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
          const i=ty*W+tx; if(T[i]!==T_WATER || B[i]!==B_VOLCANIC || !EXP[i]) continue;
          if(DEP && DEP[i]<=0.001) continue;                 // skip the shore ring (keep the burnt rim clean)
          ctx.rect(tx*TILE, ty*TILE, TILE+1, TILE+1);
        }
        ctx.fill();
        ctx.restore();
      }
      // hot-core bloom on the deepest magma cells
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      const cs=96;
      for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
        const i=ty*W+tx; if(T[i]!==T_WATER || B[i]!==B_VOLCANIC || !EXP[i]) continue;
        const d=DEP?DEP[i]:1; if(d<0.55) continue;
        const wcx=tx*TILE+16, wcy=ty*TILE+16, h=waterField(wcx,wcy);
        let a=0.35 + 0.25*(0.5+0.5*h); if(a>0.6)a=0.6;
        if(!state.visible[i]) a*=0.5;
        ctx.globalAlpha=a;
        ctx.drawImage(_lavaCore, wcx-cs/2, wcy-cs/2, cs, cs);
      }
      ctx.restore();
    }
  }

  window.buildWaterDepth    = buildWaterDepth;
  window.updateWater        = updateWater;
  window.drawWaterBaseTile  = drawWaterBaseTile;
  window.drawWater          = drawWater;
  window.waterDepthAt      = waterDepthAt;
  window.waterField        = waterField;
  window.waterGrad         = waterGrad;
  window.waterRipple       = waterRipple;
})();
