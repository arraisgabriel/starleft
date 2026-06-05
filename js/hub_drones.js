/* hub_drones.js — decorative ambient flyers (Drugztore courier DRONES + Buzzword BOMBERS)
   that fly over the HUB only. From time to time a flyer lifts off from a landmark rooftop and
   flies OUTWARD on a precalculated straight route, then despawns once it crosses the map edge.
   Bombers reuse the drones' placement + routing but are bigger + slower and spawn at HALF the
   drone frequency. Each is drawn
   SMALL and HIGH (a large altitude offset) in a DEDICATED pass AFTER the depth-sorted render
   (render.js, after the front-particles call), so it is always on top of every building —
   including the tallest ULTRA HQ — at any camera position/zoom.

   Purely cosmetic + HUB-local: nothing is stored on G (so save/load + net snapshots are
   untouched), no entities, no gameplay mutation, no net sync. Driven by the netRole-agnostic
   rAF dt via a module-local _clock (NOT state.time, which is frozen on co-op clients), so it
   animates identically on solo / host / client. Mirrors the js/particles.js pool contract:
   fixed pre-allocated pool + free-list, zero per-frame allocation, frozen on pause, off under
   prefers-reduced-motion. Pool is module-local (never on G → save/load untouched). */

(function(){
  'use strict';

  const _rm = (()=>{ try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(_){ return false; } })();
  const CAP = _rm ? 0 : 50;          // hard cap — max airborne at once (= pool size; the free-list IS the cap)
  const R = Math.random;             // cosmetic unseeded RNG (never on G → not saved; not simRandom/makeRng)

  // ---- tunables (first pass; eyeball after serving) ----
  const ALT       = 130;             // px the sprite is lifted above its ground point ("very high up")
  const BOB_FREQ  = 0.7;             // rad/sec — slow, gentle bob/breathe cycle (~9s period)
  const BOB_POS   = 3;               // px subtle vertical drift, synced to the breathe
  const BREATHE   = 0.12;            // ±12% gradual size oscillation — drones "breathe" smoothly (no popping)
  const SIZE_MIN  = 28, SIZE_RANGE = 8;     // DRONE drawn sprite HEIGHT px (~28-36)
  const SPD_MIN   = 70, SPD_RANGE  = 50;    // DRONE world px/sec outward cruise
  const BOMB_SIZE_MIN = 68, BOMB_SIZE_RANGE = 38; // BOMBER drawn HEIGHT px — clearly bigger (~68-106)
  const BOMB_SPD_MIN  = 22, BOMB_SPD_RANGE  = 15; // BOMBER px/sec — much slower (~22-37)
  const MARGIN    = 200;             // despawn this far past the edge (> ALT so top-edge exits aren't clipped)
  const JITTER    = 0.8;             // heading jitter span (±0.4 rad off pure-radial)
  const FADE_IN   = 0.8;             // seconds to fade a drone in
  const SPAWN_MIN = 0.6, SPAWN_RANGE = 0.8; // seconds between spawns → busier skies (~double the density)
  const LAUNCH_KINDS = { condo:1, mdc:1, ultra:1 };   // landmark rooftops drones lift off from

  // ---- pre-allocated pool + free-list (zero per-frame allocation) ----
  const _pool = new Array(CAP), _free = [];
  for(let i=CAP-1;i>=0;i--){ _pool[i]={ idx:i, active:false, kind:'drone', x:0,y:0, vx:0,vy:0, nx:0,ny:0, face:1, size:SIZE_MIN, life:0, phase:0, owner:'player' }; _free.push(i); }
  let _alive=0;

  let _clock=0, _spawnAcc=0, _nextSpawn=0, _bombAcc=0, _nextBomb=0, _lastState=null;
  const _du = { type:'courier', owner:'player', _face:1 };   // reused scratch unit for blitFrame (no per-frame alloc)

  function _resetAll(){
    for(let i=0;i<CAP;i++) _pool[i].active=false;
    _free.length=0; for(let i=CAP-1;i>=0;i--) _free.push(i);
    _alive=0; _clock=0; _spawnAcc=0; _nextSpawn = 2 + R()*2;   // first drone ~2-4s after entering the hub
    _bombAcc=0; _nextBomb = 4 + R()*4;                          // first bomber a little later (~4-8s)
  }

  // landmark POIs (condos / MDCs / ULTRA HQ) used as launch pads — buildings stored on state.hubPois
  function _launchPads(state){
    const pads=[], pois=state.hubPois;
    if(pois) for(const k in pois){ const e=pois[k];
      if(e && !e.dead && e.hubPoi && LAUNCH_KINDS[e.hubPoi.kind]) pads.push(e); }
    return pads;
  }

  function _spawn(state, kind){
    if(!_free.length) return;                        // structural hard cap: never exceed CAP slots
    const isBomb = kind==='bomber';
    const WP=state.W*TILE, HP=state.H*TILE, cx=WP/2, cy=HP/2;
    // origin: a landmark rooftop if any, else an inner-region point near downtown (SAME as drones)
    let ox, oy; const pads=_launchPads(state);
    if(pads.length){ const e=pads[(R()*pads.length)|0]; ox=(e.tx+e.w/2)*TILE; oy=(e.ty+e.h*0.35)*TILE; }
    else { ox = cx + (R()-0.5)*WP*0.4; oy = cy + (R()-0.5)*HP*0.4; }
    // heading = outward from map center through the origin (so it flies toward the nearest edge)
    let dx=ox-cx, dy=oy-cy, d=Math.hypot(dx,dy);
    if(d<1){ const a=R()*6.2832; dx=Math.cos(a); dy=Math.sin(a); d=1; }
    dx/=d; dy/=d;
    const ja=(R()-0.5)*JITTER, c=Math.cos(ja), s=Math.sin(ja);     // rotate heading by ±0.4 rad
    const hx=dx*c-dy*s, hy=dx*s+dy*c;
    const spd = isBomb ? (BOMB_SPD_MIN+R()*BOMB_SPD_RANGE) : (SPD_MIN+R()*SPD_RANGE);
    const p=_pool[_free.pop()]; p.active=true; _alive++;
    p.kind=kind; p.x=ox; p.y=oy; p.nx=hx; p.ny=hy; p.vx=hx*spd; p.vy=hy*spd; p.face = p.vx<0?-1:1;
    p.size = isBomb ? (BOMB_SIZE_MIN+R()*BOMB_SIZE_RANGE) : (SIZE_MIN+R()*SIZE_RANGE);
    p.life=0; p.phase=R()*6.2832;
    p.owner = R()<0.5 ? 'player' : 'enemy';   // 'player' → red sheet, 'enemy' → blue sheet (mix of both colours)
  }

  function updateHubDrones(state, dt){
    if(!state) return;
    if(state !== _lastState){ _resetAll(); _lastState=state; }     // fresh G (hub entry / load / combat) → clear pool
    if(!state.hub) return;                                         // zero drones on combat maps
    if(typeof running!=='undefined' && !running) return;          // freeze on pause (mirrors particles)
    if(CAP===0) return;                                           // prefers-reduced-motion → feature off
    _clock += dt;
    const WP=state.W*TILE, HP=state.H*TILE;
    for(let i=0;i<CAP;i++){ const p=_pool[i]; if(!p.active) continue;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.life+=dt;
      if(p.x<-MARGIN || p.y<-MARGIN || p.x>WP+MARGIN || p.y>HP+MARGIN){ p.active=false; _free.push(p.idx); _alive--; }
    }
    _spawnAcc+=dt;
    if(_spawnAcc>=_nextSpawn){ _spawnAcc=0; _nextSpawn=SPAWN_MIN+R()*SPAWN_RANGE; _spawn(state,'drone'); }
    // bombers ride their OWN timer — ~21% of the drone rate (4.76× the interval = 100/21, i.e.
    // 30% rarer than the previous ~30%-of-drone rate) → bigger, slower, rarer
    _bombAcc+=dt;
    if(_bombAcc>=_nextBomb){ _bombAcc=0; _nextBomb=(100/21)*(SPAWN_MIN+R()*SPAWN_RANGE); _spawn(state,'bomber'); }
  }

  // ---- cached neon nav-light glow sprites (built once per colour, additive 'lighter' blit) ----
  const LIGHT_R='255,80,70', LIGHT_B='90,175,255';   // neon red + blue
  const _glowCache={};
  function _glow(tint){
    let g=_glowCache[tint]; if(g) return g;
    const s=28, c=document.createElement('canvas'); c.width=c.height=s;
    const x=c.getContext('2d'), grd=x.createRadialGradient(s/2,s/2,0, s/2,s/2,s/2);
    grd.addColorStop(0,   'rgba('+tint+',1)');
    grd.addColorStop(0.40,'rgba('+tint+',0.55)');
    grd.addColorStop(1,   'rgba('+tint+',0)');
    x.fillStyle=grd; x.fillRect(0,0,s,s);
    _glowCache[tint]=c; return c;
  }

  // always-on-top pass (called from render.js inside world space, after the depth sort)
  function drawHubDrones(state){
    if(CAP===0 || !_alive) return;
    if(typeof unitWalk!=='function' || typeof blitFrame!=='function') return;
    // both flyer sprites in both colours (factionKey: 'player'→red walk_enemy, 'enemy'→blue walk)
    const courierR=unitWalk('courier','player'), courierB=unitWalk('courier','enemy');
    const bomberR =unitWalk('bomber','player'),  bomberB =unitWalk('bomber','enemy');
    const glowR=_glow(LIGHT_R), glowB=_glow(LIGHT_B);            // cached neon glow sprites
    for(let i=0;i<CAP;i++){ const p=_pool[i]; if(!p.active) continue;
      const isBomb=p.kind==='bomber';
      const anim = isBomb ? (p.owner==='enemy'?bomberB:bomberR) : (p.owner==='enemy'?courierB:courierR);
      if(!anim || !anim.ready) continue;                         // that sprite's art not loaded yet → skip this flyer
      const wob=Math.sin(_clock*BOB_FREQ+p.phase);                // -1..1, slow & smooth (_clock, not state.time → animates on clients too)
      const size=p.size*(1+wob*BREATHE);                          // gradual grow/shrink "breathe" (no size pop)
      const yoff=ALT+wob*BOB_POS;                                 // gentle vertical drift, synced to the breathe
      const fi=((_clock*1.1+p.phase)|0)%anim.frames.length;       // slower frame step → no fast flicker
      const a=p.life<FADE_IN ? p.life/FADE_IN : 1;
      _du.type=isBomb?'bomber':'courier'; _du.owner=p.owner; _du._face=p.face;
      ctx.save(); ctx.globalAlpha=a;
      blitFrame(_du, p.x, p.y-yoff, anim, size, fi);              // foot-anchored, mirrored on _face — same idiom as drawExtractionFlight
      const cy=(p.y-yoff)-size*0.22;
      ctx.globalCompositeOperation='lighter';                     // additive so the lights shine
      if(isBomb){
        // BOMBER: twin THRUST lights matching its sprite colour (red/blue) at the lower wingtips,
        // with a faster engine flicker. Bigger sprite → bigger glow.
        const g = p.owner==='enemy' ? glowB : glowR;
        const tx=size*0.30, ty=cy+size*0.24, gr=size*0.42;
        ctx.globalAlpha = a*(0.34 + 0.34*Math.sin(_clock*6.0 + p.phase));
        ctx.drawImage(g, p.x-tx-gr, ty-gr, gr*2, gr*2);
        ctx.globalAlpha = a*(0.34 + 0.34*Math.sin(_clock*6.0 + p.phase + 1.7));
        ctx.drawImage(g, p.x+tx-gr, ty-gr, gr*2, gr*2);
      } else {
        // DRONE: tiny red + blue nav lights at the wingtips, gentle out-of-phase blink.
        const wx=size*0.42, gr=size*0.55;
        ctx.globalAlpha = a*(0.30 + 0.32*Math.sin(_clock*3.0 + p.phase));
        ctx.drawImage(glowR, p.x-wx-gr, cy-gr, gr*2, gr*2);
        ctx.globalAlpha = a*(0.30 + 0.32*Math.sin(_clock*3.0 + p.phase + 2.1));
        ctx.drawImage(glowB, p.x+wx-gr, cy-gr, gr*2, gr*2);
      }
      ctx.restore();                                              // restore() resets alpha + composite op
    }
  }

  window.updateHubDrones = updateHubDrones;
  window.drawHubDrones   = drawHubDrones;
})();
