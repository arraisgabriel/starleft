/* particles.js — Hades-inspired ambient topography FX. A fixed, pre-allocated world-space
   particle pool that emits around the in-view topography features (state.features): fireflies
   in forests, embers off volcanic rock, snow over ice, dust over desert, data-motes over tech,
   low mist by mountains. Drawn on the existing #cv with additive 'lighter' glow (same idiom as
   drawGoldmine). Plus a single opacity-only CSS fog wash (#amb-fog) for the uniform mountain haze.

   Performance contract: ZERO per-frame allocation (pre-allocated pool + free-list), ZERO per-frame
   gradients (pre-baked glow sprites), hard cap quality-tiered by device, emission throttled, all
   culled to the visible span + gated by fog-of-war, frozen on pause (state.time stops in update()),
   and disabled under prefers-reduced-motion. Pool is module-local (never on G → save/load untouched). */

(function(){
  'use strict';

  // ---- capacity, tiered by device; 0 under reduced-motion ----
  const _rm = (()=>{ try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(_){ return false; } })();
  const _touch = (innerWidth < 820) || ('ontouchstart' in window);
  const _hidpi = (window.devicePixelRatio||1) > 1.5;
  const MAX = _rm ? 0 : (_touch ? 60 : (_hidpi ? 150 : 190));

  // ---- particle kinds (index → behavior/tint) ----
  const FIREFLY=0, EMBER=1, SNOW=2, DUST=3, MOTE=4, MIST=5;
  const TINT = {
    [FIREFLY]:'210,255,150', [EMBER]:'255,140,55', [SNOW]:'205,232,245',
    [DUST]:'205,175,115', [MOTE]:'120,220,255', [MIST]:'130,150,170',
  };
  const BASE_A = { [FIREFLY]:.85, [EMBER]:.8, [SNOW]:.6, [DUST]:.42, [MOTE]:.72, [MIST]:.22 };
  const EMIT   = { [FIREFLY]:.22, [EMBER]:.5, [SNOW]:.42, [DUST]:.4, [MOTE]:.34, [MIST]:.16 }; // per feature per second
  const TWINKLE = { [FIREFLY]:1, [MOTE]:1 };   // kinds that pulse their alpha

  function kindForBiome(b){
    switch(b){
      case B_VOLCANIC: return EMBER;
      case B_ICE:      return SNOW;
      case B_DESERT:   return DUST;
      case B_TECH:     return MOTE;
      case B_MOUNTAIN: return MIST;
      default:         return FIREFLY;   // grass/forest (and any other land)
    }
  }

  // ---- pre-baked radial-glow sprites (built once) ----
  let _glow = null;
  function _ensureGlow(){
    if(_glow) return;
    _glow = {};
    for(const k in TINT){
      const s=32, c=document.createElement('canvas'); c.width=c.height=s;
      const g=c.getContext('2d'), rgb=TINT[k];
      const grd=g.createRadialGradient(s/2,s/2,0, s/2,s/2,s/2);
      grd.addColorStop(0,   'rgba('+rgb+',1)');
      grd.addColorStop(0.45,'rgba('+rgb+',0.5)');
      grd.addColorStop(1,   'rgba('+rgb+',0)');
      g.fillStyle=grd; g.fillRect(0,0,s,s);
      _glow[k]=c;
    }
  }

  // ---- pre-allocated pool + free list (no steady-state allocation) ----
  const _pool = new Array(MAX);
  const _free = [];
  for(let i=MAX-1;i>=0;i--){ _pool[i]={ idx:i, active:false, x:0,y:0, vx:0,vy:0, life:0, maxLife:1, kind:0, size:4, seed:0, back:false }; _free.push(i); }

  const R = Math.random;
  function _spawn(f, kind){
    if(!_free.length) return;
    const p=_pool[_free.pop()]; p.active=true; p.kind=kind; p.back=(kind===MIST); p.seed=R();
    const N=FEAT_SIZE, W=N*TILE;
    const cx=(f.tx + N/2)*TILE, top=f.ty*TILE, base=(f.ty+N)*TILE, mid=(f.ty+N*0.45)*TILE;
    const jx=(s)=> (R()-0.5)*W*s;
    switch(kind){
      case FIREFLY: p.x=cx+jx(.9); p.y=top + R()*W*0.6;
        p.vx=(R()-0.5)*8; p.vy=(R()-0.5)*8 - 2; p.size=6+R()*5; p.maxLife=3+R()*3; break;
      case EMBER:   p.x=cx+jx(.6); p.y=mid + R()*W*0.4;
        p.vx=(R()-0.5)*6; p.vy=-(12+R()*18); p.size=5+R()*4; p.maxLife=1.6+R()*1.8; break;
      case SNOW:    p.x=cx+jx(1.1); p.y=top - W*0.2 + R()*W;
        p.vx=(R()-0.5)*6; p.vy=8+R()*10; p.size=5+R()*4; p.maxLife=4+R()*3; break;
      case DUST:    p.x=cx+jx(1.0); p.y=base - W*0.3 + (R()-0.5)*W*0.4;
        p.vx=(R()<0.5?-1:1)*(10+R()*14); p.vy=(R()-0.5)*4; p.size=6+R()*6; p.maxLife=3+R()*2.5; break;
      case MOTE:    p.x=cx+jx(.9); p.y=top + R()*W*0.8;
        p.vx=(R()-0.5)*5; p.vy=-(4+R()*8); p.size=4+R()*4; p.maxLife=2.5+R()*3; break;
      default:      p.x=cx+jx(1.3); p.y=base - W*0.4 + (R()-0.5)*W*0.3;   // MIST
        p.vx=(R()<0.5?-1:1)*(4+R()*7); p.vy=(R()-0.5)*2; p.size=18+R()*16; p.maxLife=5+R()*4;
    }
    p.life=p.maxLife;
  }

  // ---- per-tick: advance + age (recycle dead), then throttled emission near in-view features ----
  let _emitAcc=0, _scan=0, _fogAcc=0;
  function _bounds(state){
    const z=state.zoom||1, vx=state.camX, vy=state.camY, W=state.W, H=state.H;
    return [ Math.max(0,(vx/TILE)|0), Math.max(0,(vy/TILE)|0),
             Math.min(W, ((vx+viewW()/z)/TILE|0)+1), Math.min(H, ((vy+viewH()/z)/TILE|0)+1) ];
  }

  function updateParticles(state, dt){
    if(MAX<=0 || !state) return;
    // advance & recycle (always, so existing motes drift to rest even after emission stops)
    for(let i=0;i<MAX;i++){ const p=_pool[i]; if(!p.active) continue;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt;
      if(p.life<=0){ p.active=false; _free.push(p.idx); }
    }
    // throttled fog wash (cheap dominant-biome scan)
    _fogAcc+=dt; if(_fogAcc>=0.4){ _fogAcc=0; _updateFog(state); }
    // emission — only during live play
    if((typeof running!=='undefined' && !running) || state.over) return;
    if(!state.features || !state.features.length) return;
    _emitAcc+=dt; if(_emitAcc<0.05) return;
    const edt=_emitAcc; _emitAcc=0;
    const [x0,y0,x1,y1]=_bounds(state), W=state.W, N=FEAT_SIZE;
    const feats=state.features, n=feats.length, consider=Math.min(n,140);
    for(let k=0;k<consider;k++){
      _scan=(_scan+1)%n; const f=feats[_scan];
      if(f.tx+N<=x0 || f.tx>=x1 || f.ty+N<=y0 || f.ty>=y1) continue;     // off-view
      const si=(f.ty+N-1)*W + (f.tx+(N>>1));
      if(!state.explored[si]) continue;                                 // unexplored
      const kind=kindForBiome(f.biome);
      let rate=EMIT[kind]; if(kind===FIREFLY && f.slot!=='tree') rate*=0.4;   // rocks shimmer less than trees
      if(R() < rate*edt) _spawn(f, kind);
    }
  }

  // ---- draw: two passes within render()'s world transform. 'back' = mist (soft, behind sprites),
  //      'front' = glow motes (additive, over sprites). Culled to the span + dimmed in fog. ----
  function drawParticles(state, x0,y0,x1,y1, pass){
    if(MAX<=0) return;
    _ensureGlow();
    const back = (pass==='back'), W=state.W, H=state.H, t=state.time||0;
    ctx.save();
    ctx.globalCompositeOperation = back ? 'source-over' : 'lighter';
    for(let i=0;i<MAX;i++){
      const p=_pool[i]; if(!p.active || p.back!==back) continue;
      const tx=(p.x/TILE)|0, ty=(p.y/TILE)|0;
      if(tx<x0-2||tx>x1+1||ty<y0-2||ty>y1+1) continue;                  // off-view
      if(tx<0||ty<0||tx>=W||ty>=H) continue;
      const i2=ty*W+tx; if(!state.explored[i2]) continue;               // never over unexplored
      const age=1 - p.life/p.maxLife;
      let a = age<0.2 ? age/0.2 : (age>0.7 ? (1-age)/0.3 : 1);          // fade in/out envelope
      if(TWINKLE[p.kind]) a *= 0.45 + 0.55*Math.sin(t*3 + p.seed*6.283); // fireflies/motes pulse
      if(!state.visible[i2]) a *= 0.35;                                 // dim seen-but-not-visible
      a *= BASE_A[p.kind];
      if(a<=0.02) continue;
      ctx.globalAlpha=a;
      ctx.drawImage(_glow[p.kind], p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    }
    ctx.restore();
  }

  // ---- the one CSS layer: uniform fog/haze wash, opacity+tint set by dominant in-view biome ----
  function _updateFog(state){
    const el = document.getElementById('amb-fog'); if(!el) return;
    if((typeof running!=='undefined' && !running) || state.over){ el.style.opacity='0'; return; }
    const [x0,y0,x1,y1]=_bounds(state), W=state.W;
    const sx=Math.max(1,((x1-x0)/36)|0), sy=Math.max(1,((y1-y0)/36)|0);
    let tot=0, m=0, g=0, ice=0;
    for(let ty=y0;ty<y1;ty+=sy)for(let tx=x0;tx<x1;tx+=sx){
      const i=ty*W+tx; if(!state.explored[i]) continue; tot++;
      const b=state.biome[i]; if(b===B_MOUNTAIN)m++; else if(b===B_GRASS)g++; else if(b===B_ICE)ice++;
    }
    if(!tot){ el.style.opacity='0'; return; }
    const fm=m/tot, fg=g/tot, fi=ice/tot;
    let op=0, tint='rgba(150,165,185,.5)';
    if(fm>0.12){ op=Math.min(.5, fm*0.8); tint='rgba(150,165,185,.5)'; }            // mountain: cold fog
    else if(fi>0.3){ op=Math.min(.4, fi*0.5); tint='rgba(190,215,230,.4)'; }        // ice: pale veil
    else if(fg>0.3){ op=Math.min(.26, fg*0.4); tint='rgba(120,165,135,.34)'; }      // forest: faint mist
    el.style.setProperty('--fog-tint', tint);
    el.style.opacity = op.toFixed(3);
  }

  // expose to render.js / core.js (global-script style)
  window.updateParticles = updateParticles;
  window.drawParticles   = drawParticles;
})();
