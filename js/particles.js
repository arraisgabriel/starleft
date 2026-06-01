/* particles.js — Hades-inspired ambient topography FX. A fixed, pre-allocated world-space particle
   pool that emits around the in-view topography features (state.features): bright crystal GLINTS on
   rocks (biome-tinted: teal/purple on mountain crystal, orange on volcanic, gold on desert, cyan on
   tech, frost on ice, green on forest), fireflies + drifting spores in forests, rising embers + ash
   over volcanic, falling snow over ice, blowing dust over desert, data-motes over tech, cool mist by
   mountains. Drawn on the existing #cv with additive 'lighter' bloom (same idiom as drawGoldmine).
   Plus one opacity-only CSS fog wash (#amb-fog) for the uniform mountain haze.

   Perf contract: ZERO per-frame allocation (pre-allocated pool + free-list), ZERO per-frame gradients
   (glow sprites cached per tint), hard cap quality-tiered by device, density target scaled to in-view
   feature count, all culled to the visible span + fog-of-war gated, frozen on pause, off under
   prefers-reduced-motion. Pool is module-local (never on G → save/load untouched). */

(function(){
  'use strict';

  const _rm = (()=>{ try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(_){ return false; } })();
  const _touch = (innerWidth < 820) || ('ontouchstart' in window);
  const _hidpi = (window.devicePixelRatio||1) > 1.5;
  const MAX = _rm ? 0 : (_touch ? 130 : (_hidpi ? 280 : 340));
  const PER_FEATURE   = 26;    // target live particles per in-view feature (capped by MAX)
  const SPAWN_PER_PASS= 26;    // ramp speed
  const R = Math.random;

  // base opacity per behavior (× life-envelope × twinkle); glints/fireflies pop, mist is faint
  const BASE_A = { glint:.95, hover:.95, rise:.9, fall:.72, drift:.5, soft:.46 };

  // ---- glow sprites cached per tint rgb ("r,g,b") — built once each ----
  const _gc = {};
  function _glow(tint){
    let g=_gc[tint]; if(g) return g;
    const s=36, c=document.createElement('canvas'); c.width=c.height=s;
    const x=c.getContext('2d'), grd=x.createRadialGradient(s/2,s/2,0, s/2,s/2,s/2);
    grd.addColorStop(0,   'rgba('+tint+',1)');
    grd.addColorStop(0.42,'rgba('+tint+',0.55)');
    grd.addColorStop(1,   'rgba('+tint+',0)');
    x.fillStyle=grd; x.fillRect(0,0,s,s);
    _gc[tint]=c; return c;
  }

  // ---- pre-allocated pool + free list ----
  const _pool=new Array(MAX), _free=[];
  for(let i=MAX-1;i>=0;i--){ _pool[i]={ idx:i, active:false, x:0,y:0, vx:0,vy:0, life:0,maxLife:1, beh:'hover', tint:'255,255,255', size:6, seed:0, tw:0, back:false }; _free.push(i); }
  let _alive=0;

  function _make(f, beh, tint, smin,smax, lmin,lmax, tw, back, reach){
    if(!_free.length) return;
    const p=_pool[_free.pop()]; p.active=true; _alive++;
    p.beh=beh; p.tint=tint; p.tw=tw||0; p.back=!!back; p.seed=R();
    p.size=smin+R()*(smax-smin); p.maxLife=lmin+R()*(lmax-lmin); p.life=p.maxLife;
    const N=FEAT_SIZE, W=N*TILE, cx=(f.tx+N/2)*TILE, top=f.ty*TILE, base=(f.ty+N)*TILE, mid=(f.ty+N*0.5)*TILE;
    const rch=reach||1, jx=(s)=>(R()-0.5)*W*s*rch;   // reach<1 keeps motes nearer the feature (spread + drift velocity)
    if(beh==='rise'){      p.x=cx+jx(.7);  p.y=mid+R()*W*0.4;            p.vx=(R()-0.5)*9*rch;  p.vy=-(16+R()*24); }
    else if(beh==='fall'){ p.x=cx+jx(1.1); p.y=top-W*0.3+R()*W;          p.vx=(R()-0.5)*8*rch;  p.vy=10+R()*13; }
    else if(beh==='drift'){p.x=cx+jx(1.0); p.y=top+R()*W;               p.vx=(R()<0.5?-1:1)*(11+R()*16)*rch; p.vy=(R()-0.5)*5; }
    else if(beh==='glint'){p.x=cx+jx(.9);  p.y=top+R()*W*0.85;          p.vx=(R()-0.5)*3;  p.vy=(R()-0.5)*3; }
    else if(beh==='soft'){ p.x=cx+jx(1.3); p.y=base-W*0.4+(R()-0.5)*W*0.3; p.vx=(R()<0.5?-1:1)*(4+R()*7); p.vy=(R()-0.5)*2; }
    else /*hover*/{        p.x=cx+jx(.9);  p.y=top+R()*W*0.7;            p.vx=(R()-0.5)*11*rch; p.vy=(R()-0.5)*10*rch - 3; }
  }

  // per-feature emission — primary signature + diverse secondaries, biome+slot themed (Hades palette)
  function _spawnFor(f){
    const b=f.biome, rock=(f.slot==='rock'), r=R();
    if(b===B_VOLCANIC){
      if(r<0.5)      _make(f,'rise', '255,150,60',  5,12, 1.3,2.6, 0);          // ember
      else if(r<0.8) _make(f,'glint','255,120,45',  4,9,  0.9,1.8, 2);          // ember-glint on rim
      else           _make(f,'rise', '120,120,128', 14,28, 2.6,4.2, 0, false);  // ash
    } else if(b===B_ICE){
      if(r<0.5)      _make(f,'fall', '205,232,245', 6,13, 4,7,   0);            // snow
      else if(r<0.8) _make(f,'glint','225,242,255', 4,8,  1.0,2.0,2);           // frost glint
      else           _make(f,'soft', '150,180,205', 22,42, 5,8,  0, true);      // mist
    } else if(b===B_DESERT){
      if(r<0.55)     _make(f,'drift','212,182,122', 6,13, 3,5,   0);            // dust
      else           _make(f,'glint','240,212,140', 4,8,  1,1.9, 2);            // gold glint
    } else if(b===B_TECH){
      if(r<0.5)      _make(f,'rise', '120,220,255', 4,9,  2.4,4.4,1);           // data-mote
      else           _make(f,'glint','150,238,255', 3,7,  0.8,1.6,2);           // cyan glint
    } else if(b===B_MOUNTAIN){
      if(r<0.16)     _make(f,'glint', (R()<0.5?'95,225,210':'185,140,255'), 3,7,  0.8,1.6, 2); // sparse, smaller crystal glints
      else if(r<0.30)_make(f,'rise', '150,200,212', 4,8,  2.4,4,   1);          // a few cool motes
      else           _make(f,'soft', '150,172,194', 34,66, 6.5,10, 0, true, 0.85); // localized fog bank, contained ~3 tiles from the rock
    } else { // grass / forest (and any other land) — kept calm: emits ~half as often
      if(R()<0.5) return;
      if(rock){
        if(r<0.5)    _make(f,'glint','120,230,180', 3,7,  1,1.8, 2);            // fewer/smaller teal-green glints
        else         _make(f,'hover','205,250,150', 6,11, 3,6,  1);            // occasional stray firefly
      } else {
        if(r<0.5)    _make(f,'hover','210,250,150', 7,13, 3,6,  1, false, 0.65); // firefly (reined toward the tree)
        else if(r<0.8) _make(f,'drift','175,215,150', 6,11, 4,7,  0, false, 0.5); // pollen drift (half the reach)
        else         _make(f,'glint','190,250,165', 4,7,  1,1.8, 2);             // leaf glint (stays on the tree)
      }
    }
  }

  function _bounds(state){
    const z=state.zoom||1, vx=state.camX, vy=state.camY, W=state.W, H=state.H;
    return [ Math.max(0,(vx/TILE)|0), Math.max(0,(vy/TILE)|0),
             Math.min(W, ((vx+viewW()/z)/TILE|0)+1), Math.min(H, ((vy+viewH()/z)/TILE|0)+1) ];
  }

  // ---- per-tick: advance + recycle, then density-targeted emission near in-view features ----
  const _inview=[];
  const _mtn=[];                                  // reused scratch: mountain (crystal) features, for the fog wash
  let _emitAcc=0, _fogAcc=0;
  function updateParticles(state, dt){
    if(MAX<=0 || !state) return;
    for(let i=0;i<MAX;i++){ const p=_pool[i]; if(!p.active) continue;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt;
      if(p.beh==='rise') p.vy*=(1-0.35*dt);            // embers/ash ease as they climb
      if(p.life<=0){ p.active=false; _free.push(p.idx); _alive--; }
    }
    _fogAcc+=dt; if(_fogAcc>=0.4){ _fogAcc=0; _updateFog(state); }
    if((typeof running!=='undefined' && !running) || state.over) return;
    if(!state.features || !state.features.length) return;
    _emitAcc+=dt; if(_emitAcc<0.05) return; _emitAcc=0;
    // gather in-view, explored features
    const [x0,y0,x1,y1]=_bounds(state), W=state.W, N=FEAT_SIZE, feats=state.features, n=feats.length;
    _inview.length=0;
    for(let i=0;i<n;i++){ const f=feats[i];
      if(f.tx+N<=x0||f.tx>=x1||f.ty+N<=y0||f.ty>=y1) continue;
      const si=(f.ty+N-1)*W+(f.tx+(N>>1)); if(!state.explored[si]) continue;
      _inview.push(f); if(_inview.length>=600) break;
    }
    if(!_inview.length) return;
    const target=Math.min(MAX, _inview.length*PER_FEATURE);
    let budget=SPAWN_PER_PASS;
    while(_alive<target && budget-->0 && _free.length){
      _spawnFor(_inview[(R()*_inview.length)|0]);
    }
  }

  // ---- draw: BACK pass (soft mist, behind sprites) + FRONT pass (additive bloom, over sprites) ----
  function drawParticles(state, x0,y0,x1,y1, pass){
    if(MAX<=0) return;
    const back=(pass==='back'), W=state.W, H=state.H, t=state.time||0;
    ctx.save();
    ctx.globalCompositeOperation = back ? 'source-over' : 'lighter';
    for(let i=0;i<MAX;i++){
      const p=_pool[i]; if(!p.active || p.back!==back) continue;
      const tx=(p.x/TILE)|0, ty=(p.y/TILE)|0;
      if(tx<x0-2||tx>x1+1||ty<y0-2||ty>y1+1 || tx<0||ty<0||tx>=W||ty>=H) continue;
      const i2=ty*W+tx; if(!state.explored[i2]) continue;
      const age=1 - p.life/p.maxLife;
      let a = age<0.18 ? age/0.18 : (age>0.72 ? (1-age)/0.28 : 1);     // fade in/out
      if(p.tw===2){ const s=0.5+0.5*Math.sin(t*7 + p.seed*6.283); a*= s*s*s; } // sharp sparkle
      else if(p.tw===1){ a*= 0.4 + 0.6*Math.sin(t*3 + p.seed*6.283); }         // gentle pulse
      if(!state.visible[i2]) a*=0.4;
      a*= BASE_A[p.beh]||0.6;
      if(a<=0.02) continue;
      ctx.globalAlpha=a;
      const g=_glow(p.tint);
      ctx.drawImage(g, p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    }
    ctx.restore();
  }

  // ---- the one CSS layer: uniform fog/haze wash, opacity+tint by dominant in-view biome ----
  function _updateFog(state){
    const el=document.getElementById('amb-fog'); if(!el) return;
    if((typeof running!=='undefined' && !running) || state.over){ el.style.opacity='0'; return; }
    const [x0,y0,x1,y1]=_bounds(state), W=state.W, H=state.H, N=FEAT_SIZE;
    // biome fractions — for full-biome ICE / VOLCANIC maps (those ARE the biome everywhere)
    const sx=Math.max(1,((x1-x0)/36)|0), sy=Math.max(1,((y1-y0)/36)|0);
    let tot=0,ice=0,vol=0;
    for(let ty=y0;ty<y1;ty+=sy)for(let tx=x0;tx<x1;tx+=sx){
      const i=ty*W+tx; if(!state.explored[i]) continue; tot++;
      const b=state.biome[i]; if(b===B_ICE)ice++; else if(b===B_VOLCANIC)vol++;
    }
    if(!tot){ el.style.opacity='0'; return; }
    const fi=ice/tot, fv=vol/tot;
    // MOUNTAINS = the crystal ROCK FEATURES (biome B_MOUNTAIN), NOT the ground biome — on desert/grass
    // maps the mountain biome is sparse, so the crystals sit on desert/grass; key off the features.
    const z=state.zoom||1, ccx=state.camX+(viewW()/z)/2, ccy=state.camY+(viewH()/z)/2;
    const Rc=0.40*Math.min(viewW()/z, viewH()/z);
    // The MOUNTAIN ROCK features (biome B_MOUNTAIN) — the "normal mountains". The funding/resource
    // crystals are `goldmine` ENTITIES (not in state.features), so they never affect the fog.
    _mtn.length=0;
    if(state.features) for(const f of state.features){ if(f.biome===B_MOUNTAIN) _mtn.push(f); }
    // The wash appears ONLY when a PLAYER unit is standing AMONG the mountains, near the viewport
    // centre. Mountains merely being IN VIEW (the base, a distant range) do NOT wash.
    let centred=0;
    if(_mtn.length) for(const e of state.entities){
      if(e.dead || e.owner!=='player' || e.kind!=='unit') continue;
      const d=Math.hypot(e.x-ccx, e.y-ccy); if(d>=Rc) continue;               // near viewport centre
      const utx=e.x/TILE, uty=e.y/TILE;
      for(const f of _mtn){
        if(Math.abs(utx-(f.tx+N/2))<=N/2+2.5 && Math.abs(uty-(f.ty+N/2))<=N/2+2.5){ centred += 1 - d/Rc; break; }  // among the mountains
      }
    }
    let op=0, tint='rgba(150,165,185,.55)';
    if(centred>0){                                                             // ONLY a unit standing among the mountains
      op=Math.min(.8, centred*0.7); tint='rgba(154,170,194,.6)';              // centred unit among mountains ≈ .70
    }
    else if(fv>0.25){ op=Math.min(.4, fv*0.55); tint='rgba(150,70,45,.45)'; }   // volcanic: warm smoke
    else if(fi>0.25){ op=Math.min(.45, fi*0.6); tint='rgba(190,215,230,.45)'; } // ice: pale veil
    // grass/forest: NO CSS wash — the open base stays clear (forest ambiance is the canvas fireflies/pollen)
    el.style.setProperty('--fog-tint', tint);
    el.style.opacity=op.toFixed(3);
  }

  window.updateParticles=updateParticles;
  window.drawParticles=drawParticles;
})();
