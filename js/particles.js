/* particles.js — Hades-inspired ambient topography FX. A fixed, pre-allocated world-space particle
   pool that emits around the in-view topography features (state.features): bright crystal GLINTS on
   rocks (biome-tinted: teal/purple on mountain crystal, orange on volcanic, gold on desert, cyan on
   tech, frost on ice, green on forest), fireflies + drifting spores in forests, rising embers + ash
   over volcanic, falling snow over ice, blowing dust over desert, data-motes over tech, cool mist by
   mountains. Drawn on the existing #cv with additive 'lighter' bloom (same idiom as drawGoldmine).

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
  const DENSITY       = 1/3;   // tree/grass topography particle-COUNT scale (kept here — trees look good as-is; quantity only)
  const OTHER_DENSITY = DENSITY*0.8; // every NON-grass biome: 20% sparser still (trees exempt — no extra cut on them)
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
  for(let i=MAX-1;i>=0;i--){ _pool[i]={ idx:i, active:false, x:0,y:0, vx:0,vy:0, life:0,maxLife:1, beh:'hover', tint:'255,255,255', size:6, seed:0, tw:0, back:false, field:false }; _free.push(i); }
  let _alive=0, _fieldAlive=0;   // _fieldAlive = the subset that are biome-FIELD motes (open-ground ambient), tracked so feature & field budgets don't starve each other

  // ---- ambient biome FIELD (P6.1): sparse particles across OPEN GROUND (not anchored to a feature) so
  //      featureless maps still breathe — ember rain on volcanic, drifting snow on ice, dust on desert,
  //      data-motes on tech, calm pollen on grass. QUAL-gated + off under reduced motion. ----
  const FIELD_DENSITY = 0.05;   // target field motes ≈ this × visible tiles (sparse, value-suppressed)
  const FIELD_SPAWN   = 12;     // ramp speed per emission tick

  function _make(f, beh, tint, smin,smax, lmin,lmax, tw, back, reach){
    if(!_free.length) return;
    const p=_pool[_free.pop()]; p.active=true; _alive++; p.field=false;
    p.beh=beh; p.tint=tint; p.tw=tw||0; p.back=!!back; p.seed=R();
    p.size=smin+R()*(smax-smin); p.maxLife=lmin+R()*(lmax-lmin); p.life=p.maxLife;
    const N=FEAT_SIZE, W=N*TILE, cx=(f.tx+N/2)*TILE, top=f.ty*TILE, base=(f.ty+N)*TILE, mid=(f.ty+N*0.5)*TILE;
    const rch=reach||1, jx=(s)=>(R()-0.5)*W*s*rch;   // reach<1 keeps motes nearer the feature (spread + drift velocity)
    if(beh==='rise'){      p.x=cx+jx(.7);  p.y=mid+R()*W*0.4;            p.vx=(R()-0.5)*9*rch;  p.vy=-(16+R()*24); }
    else if(beh==='fall'){ p.x=cx+jx(1.1); p.y=top-W*0.3+R()*W;          p.vx=(R()-0.5)*8*rch;  p.vy=10+R()*13; }
    else if(beh==='drift'){p.x=cx+jx(1.0); p.y=top+R()*W;               p.vx=(R()<0.5?-1:1)*(11+R()*16)*rch; p.vy=(R()-0.5)*5; }
    else if(beh==='glint'){p.x=cx+jx(.9);  p.y=top+R()*W*0.85;          p.vx=(R()-0.5)*3;  p.vy=(R()-0.5)*3; }
    else if(beh==='soft'){ p.x=cx+jx(1.3); p.y=base-W*0.4+(R()-0.5)*W*0.3; p.vx=(R()<0.5?-1:1)*(4+R()*7); p.vy=(R()-0.5)*2; }
    else /*hover*/{        p.x=cx+jx(.9);  p.y=top+R()*W*0.7;            p.vx=(R()-0.5)*7.5*rch; p.vy=(R()-0.5)*7*rch - 2; }
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
        if(r<0.6)    _make(f,'glint','120,230,180', 3,7,  1,1.8, 2);            // fewer/smaller teal-green glints
        else         _make(f,'hover','205,250,150', 6,11, 3,6,  3);            // rare stray firefly (flicking light)
      } else {
        if(r<0.28)   _make(f,'hover','210,250,150', 7,13, 3,6,  3, false, 0.65); // fewer fireflies (flicking light, reined toward the tree)
        else if(r<0.7) _make(f,'drift','175,215,150', 6,11, 4,7,  0, false, 0.32); // pollen drift (slower, nearer the tree)
        else         _make(f,'glint','190,250,165', 4,7,  1,1.8, 2);             // leaf glint (stays on the tree)
      }
    }
  }

  // spawn a single field mote at an arbitrary world position (no feature anchor). Tagged p.field.
  function _emitAt(wx,wy, beh, tint, smin,smax, lmin,lmax, tw){
    if(!_free.length) return false;
    const p=_pool[_free.pop()]; p.active=true; _alive++; _fieldAlive++; p.field=true;
    p.beh=beh; p.tint=tint; p.tw=tw||0; p.back=false; p.seed=R();
    p.size=smin+R()*(smax-smin); p.maxLife=lmin+R()*(lmax-lmin); p.life=p.maxLife;
    p.x=wx; p.y=wy;
    if(beh==='rise'){      p.vx=(R()-0.5)*9;            p.vy=-(14+R()*22); }   // embers / data-motes drift up
    else if(beh==='fall'){ p.vx=(R()-0.5)*8;            p.vy=9+R()*12; }       // snow falls
    else if(beh==='drift'){p.vx=(R()<0.5?-1:1)*(10+R()*15); p.vy=(R()-0.5)*5; }// dust / pollen blows sideways
    else /*hover*/{        p.vx=(R()-0.5)*7;            p.vy=(R()-0.5)*6-2; }
    return true;
  }
  // pick a biome-appropriate field mote for the ground tile under (wx,wy); false = no mote here (skip)
  function _spawnFieldAt(state, wx, wy){
    const W=state.W, H=state.H, tx=(wx/TILE)|0, ty=(wy/TILE)|0;
    if(tx<0||ty<0||tx>=W||ty>=H) return false;
    const i=ty*W+tx; if(!state.explored[i]) return false;
    if(state.tiles[i]===T_WATER) return false;                                  // water has its own FX
    const b=state.biome[i], r=R();
    if(b===B_VOLCANIC) return r<0.72 ? _emitAt(wx,wy,'rise','255,140,55',3,7,1.6,3.0,0)   // ember rain
                                     : _emitAt(wx,wy,'rise','120,116,120',8,15,3,4.6,0);   // + ash
    if(b===B_ICE)      return _emitAt(wx,wy,'fall','200,228,242',4,9,5,9,0);               // drifting snow
    if(b===B_DESERT)   return _emitAt(wx,wy,'drift','206,176,116',5,11,4,6,0);             // blowing dust
    if(b===B_TECH)     return r<0.7 ? _emitAt(wx,wy,'rise','110,210,245',3,7,3,5,1)        // data-motes
                                    : _emitAt(wx,wy,'hover','150,238,255',2,5,1.2,2.4,2);  // + cyan blip
    // grass / mountain / water get NO open-ground field: floating motes with no source read as strange on
    // temperate ground. Those biomes get their life from the FEATURE-anchored FX instead (fireflies/pollen
    // near trees, cool mist by mountain rocks — see _spawnFor), which have a visible source.
    return false;
  }

  function _bounds(state){
    const z=state.zoom||1, vx=state.camX, vy=state.camY, W=state.W, H=state.H;
    return [ Math.max(0,(vx/TILE)|0), Math.max(0,(vy/TILE)|0),
             Math.min(W, ((vx+viewW()/z)/TILE|0)+1), Math.min(H, ((vy+viewH()/z)/TILE|0)+1) ];
  }

  // ---- per-tick: advance + recycle, then density-targeted emission near in-view features ----
  const _inview=[];
  let _emitAcc=0;
  function updateParticles(state, dt){
    if(MAX<=0 || !state) return;
    for(let i=0;i<MAX;i++){ const p=_pool[i]; if(!p.active) continue;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt;
      if(p.beh==='rise') p.vy*=(1-0.35*dt);            // embers/ash ease as they climb
      if(p.life<=0){ p.active=false; _free.push(p.idx); _alive--; if(p.field) _fieldAlive--; }
    }
    if((typeof running!=='undefined' && !running) || state.over) return;
    _emitAcc+=dt; if(_emitAcc<0.05) return; _emitAcc=0;
    const [x0,y0,x1,y1]=_bounds(state), W=state.W, N=FEAT_SIZE;
    // ambient FIELD target (sparse, across the visible ground). Off under reduced motion or QUAL≥2.
    const _qOff=(typeof QUAL!=='undefined' && QUAL && QUAL.level>=2);
    const fieldTarget=(_rm||_qOff)?0:Math.min((MAX*0.5)|0, Math.round((x1-x0)*(y1-y0)*FIELD_DENSITY));
    // ---- feature emission (signature FX anchored to in-view topography) — only if the map has features ----
    if(state.features && state.features.length){
      const feats=state.features, n=feats.length; _inview.length=0;
      for(let i=0;i<n;i++){ const f=feats[i];
        if(f.tx+N<=x0||f.tx>=x1||f.ty+N<=y0||f.ty>=y1) continue;
        const si=(f.ty+N-1)*W+(f.tx+(N>>1)); if(!state.explored[si]) continue;
        _inview.push(f); if(_inview.length>=600) break;
      }
      if(_inview.length){
        // scale the live target down (counts only — motion untouched). Trees hold at DENSITY; other biomes take
        // the extra 20% cut. featCap leaves headroom for the field so the two budgets don't starve each other.
        let _wsum=0; for(let i=0;i<_inview.length;i++) _wsum += (_inview[i].biome===B_GRASS ? DENSITY : OTHER_DENSITY);
        const featureTarget=Math.round(Math.min(MAX, _inview.length*PER_FEATURE) * (_wsum/_inview.length));
        const featCap=Math.max(0, Math.min(featureTarget, MAX - fieldTarget));
        let budget=SPAWN_PER_PASS;
        while(_alive - _fieldAlive < featCap && budget-->0 && _free.length){
          _spawnFor(_inview[(R()*_inview.length)|0]);
        }
      }
    }
    // ---- ambient biome field (open ground) — runs even with no features so the whole map breathes ----
    if(fieldTarget>0 && state.explored){
      let fb=FIELD_SPAWN, tries=0;
      while(_fieldAlive<fieldTarget && fb>0 && _free.length && tries<70){ tries++;
        const wx=(x0+R()*(x1-x0))*TILE, wy=(y0+R()*(y1-y0))*TILE;
        if(_spawnFieldAt(state, wx, wy)) fb--;
      }
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
      else if(p.tw===3){ const ph=t*2.3 + p.seed*6.283,                        // firefly: dim glow that
              s=Math.sin(ph)*Math.sin(ph*0.33 + p.seed*5);                     // flicks bright now and then
              a*= 0.16 + (s>0 ? s*s : 0); }                                    // (irregular AM beat, dark gaps)
      if(!state.visible[i2]) a*=0.4;
      a*= BASE_A[p.beh]||0.6;
      if(a<=0.02) continue;
      ctx.globalAlpha=a;
      const g=_glow(p.tint);
      ctx.drawImage(g, p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    }
    ctx.restore();
  }

  window.updateParticles=updateParticles;
  window.drawParticles=drawParticles;
  window.particleStats=function(){ return { max:MAX, alive:_alive, field:_fieldAlive, reducedMotion:_rm }; };
})();
