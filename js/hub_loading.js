/* hub_loading.js — the "Hub Panorama" extraction loading scene. Plays for ~13s in the
   MIDDLE of the extraction sequence (js/hub.js → updateExtraction, phase 'panorama'),
   masking the HUB map load behind a cinematic: a full-screen night panorama of the HUB
   city with HUB-palette neon lights, the ULTRA HQ megabuilding tower on the hill, and a
   BIG Buzzword Bomber crossing the skyline right→left over the full 13s. Drawn on the main
   game canvas (cv/ctx) in SCREEN space (called from render.js, which short-circuits the
   world pass for this phase), so it reuses the megasprite tower + neon glow helpers
   (js/megasprites.js) and the bomber sprite (js/assets.js) unchanged. The DOM HUD is
   hidden via the body.scene-hubload class while this plays. Solo-only — host co-op cuts
   straight to the HUB and never enters this phase. | STARLEFT */

/* ---- panorama backdrop (preloaded like assets.js ATLAS_IMG; path stays relative) ---- */
const HUB_PANO_IMG = new Image();
let HUB_PANO_READY = false;
HUB_PANO_IMG.onload  = ()=>{ HUB_PANO_READY = true; };
HUB_PANO_IMG.onerror = ()=>{ HUB_PANO_READY = false; };
HUB_PANO_IMG.src = ASSET_BASE + 'scenes/hub/hub_panoramic.png';

const HUB_LOAD_DURATION = 20;   // seconds the bomber takes to cross — sets the scene length

// HUB neon palette (rgb): purple / blue / cyan / red dots, matching the hub's identity.
const HUB_PANO_COLORS = {
  purple:[178,90,255], blue:[80,150,255], cyan:[60,230,235], red:[255,70,55]
};

// ULTRA HQ tower placement on the panorama, in NORMALIZED image coords (0..1). Tuned to
// sit on the green hilltop in the middle third. `w` is the tower width as a fraction of
// the drawn image width; the sprite is bottom-anchored on (bx,by).
const HUB_PANO_TOWER = { bx:0.37, by:0.52, w:0.21, heightScale:1.14 };

// The ULTRA HQ cycles through these strip frames of megabuilding_3.png (0-based) for ambient
// neon variation, at the hub's megabuilding loop speed.
const HUB_TOWER_FRAMES = [2, 3, 4];

// Buzzword Bomber: altitude band (fraction of screen height) + size. The HORIZONTAL flight is
// computed in hubPanoBomberPos() from the VISIBLE image span — it spawns at the right edge of
// whatever is on-screen and crosses to just past the left edge over HUB_LOAD_DURATION. So on a
// narrow viewport it traverses a shorter visible width in the same 20s (i.e. flies slower), is
// visible the whole time, and never waits off-screen.
const HUB_PANO_BOMBER = { sy:0.24, ey:0.19, sizeFrac:0.143 };

// Engine thrusters on the bomber's back (right side, since the sprite faces left), in
// FRAME-normalized coords (0..1) measured off walk_enemy.png frame 0. Red neon glows are
// mapped here so the rear engines light up. `r` is the core radius as a fraction of the
// drawn sprite height; `ph` staggers each engine's flicker.
const HUB_BOMBER_THRUSTERS = [
  { u:0.88, v:0.13, r:0.055, ph:0.0 },   // top exhaust
  { u:0.93, v:0.45, r:0.080, ph:1.7 },   // main rear nozzle (biggest)
  { u:0.77, v:0.68, r:0.052, ph:3.1 },   // lower rear nozzle
];

// Pure geometry of the letterboxed panorama (no canvas state): 100% screen HEIGHT, aspect
// preserved, centered horizontally (black letterbox sides on desktop; on portrait/mobile the
// image overflows and the centered slice shows the middle third). Shared by the draw pass and
// the viewport-aware bomber trajectory.
function hubPanoMetrics(){
  const vw=innerWidth, vh=innerHeight;
  const iw=HUB_PANO_IMG.naturalWidth||1448, ih=HUB_PANO_IMG.naturalHeight||1086;
  const scale=vh/ih, dw=iw*scale, dh=vh;
  return { ox:(vw-dw)/2, oy:0, dw, dh, scale, vw, vh };
}
// Same geometry, but also set the canvas transform to CSS px for the draw pass.
function hubPanoFit(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return hubPanoMetrics();
}

// One twinkling neon dot (additive), in screen space. `tw` is the 0..1 breath value.
function hubPanoDot(cx, cy, rgb, rad, tw){
  const a = 0.42 + 0.58*tw;
  megaFillEllipseGlow(cx, cy, rad*3.0, rad*3.0, 0, rgb, 0.22*a, 0.10*a);   // soft halo
  megaFillEllipseGlow(cx, cy, rad*1.3, rad*1.3, 0, rgb, 0.85*a, 0.30*a);   // bright core
  ctx.fillStyle='rgba(255,250,255,'+(0.55*a).toFixed(3)+')';               // hot white centre
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.7, rad*0.45), 0, Math.PI*2); ctx.fill();
}

// Pre-generated fixed neon points (see _dev/tools/hub_neon_gen.html → js/hub_panoramic_neon.js).
function drawHubPanoNeon(state, fit){
  if(typeof HUB_PANO_NEON==='undefined' || !HUB_PANO_NEON) return;
  const t=state.time||0;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<HUB_PANO_NEON.length;i++){
    const p=HUB_PANO_NEON[i];
    const rgb=HUB_PANO_COLORS[p.c]||HUB_PANO_COLORS.cyan;
    const tw=0.5+0.5*Math.sin(t*1.7 + (p.phase!=null?p.phase:i*0.6));
    const rad=(p.r||1) * fit.dw * 0.004;     // dot size scales with the drawn image width
    hubPanoDot(fit.ox + p.x*fit.dw, fit.oy + p.y*fit.dh, rgb, rad, tw);
  }
  ctx.restore();
}

// ULTRA HQ megabuilding (variant 3), drawn exactly like the hub's central tower: aura
// glow behind, sprite, then core neon on top. Frame 0 (the hub uses fixedFrame:0).
function drawHubPanoTower(state, fit){
  const spr = (typeof megaSprite==='function') ? megaSprite('megabuilding',3) : null;
  if(!spr) return;
  const T=HUB_PANO_TOWER;
  const m={ cat:'megabuilding', variant:3, seed:0.17, neon:true };   // synthetic — for the neon lookup only
  const dw=fit.dw*T.w, dh=dw*(spr.fh/spr.fw)*T.heightScale;
  const dx=fit.ox + T.bx*fit.dw - dw/2;
  const dy=fit.oy + T.by*fit.dh - dh;        // bottom-anchored on the hilltop
  const fps=((typeof MEGA_FPS!=='undefined' && MEGA_FPS.megabuilding) || 1.4) * 0.5;   // half the hub's loop speed
  const fi=HUB_TOWER_FRAMES[((Math.floor((state.time||0)*fps)%HUB_TOWER_FRAMES.length)+HUB_TOWER_FRAMES.length)%HUB_TOWER_FRAMES.length];
  const neon=(typeof megaNeonFrame==='function') ? megaNeonFrame(m,fi) : null;
  if(neon && typeof drawMegaNeonLayer==='function') drawMegaNeonLayer(state,m,neon,dx,dy,dw,dh,'aura');
  ctx.drawImage(spr.img, fi*spr.fw,0, spr.fw,spr.fh, dx,dy, dw,dh);
  if(neon && typeof drawMegaNeonLayer==='function') drawMegaNeonLayer(state,m,neon,dx,dy,dw,dh,'core');
}

// Viewport-aware bomber position. The visible image span on screen is [left,right] =
// intersection of the image rect and the screen; the bomber spawns with its nose at the RIGHT
// edge of that span (p=0) and crosses to just past the LEFT edge (p=1) over HUB_LOAD_DURATION.
// So the 20s always covers exactly the on-screen traversal — slower on a narrow viewport (less
// width in the same time), visible from the first frame, and out of view at p=1. Returns {px,py,S}.
function hubPanoBomberPos(state, m, anim){
  const B=HUB_PANO_BOMBER, f=state.extractFlight;
  const p=Math.min(1, Math.max(0, (f?f.t:0)/HUB_LOAD_DURATION));
  const t=state.time||0;
  const left=Math.max(0, m.ox), right=Math.min(m.vw, m.ox+m.dw);   // visible image span on screen
  const visW=Math.max(1, right-left);
  const S=Math.round(m.vh * B.sizeFrac);
  const spriteW=(anim && anim.ready) ? S*(anim.fw/anim.fh) : S*1.4;
  const halfW=spriteW/2;
  const px=(right+halfW) - (visW+spriteW)*p;                       // nose at right edge → tail past left edge
  const ny=B.sy + (B.ey-B.sy)*p + 0.012*Math.sin(t*1.6);          // gentle bob; altitude is screen-height-relative
  const py=m.oy + ny*m.dh;
  return { px, py, S };
}

// The BIG Buzzword Bomber crossing the visible skyline. Position is viewport-aware (see
// hubPanoBomberPos) and driven by f.t (0→HUB_LOAD_DURATION). Reuses the unit sprite + blitFrame.
function drawHubPanoBomber(state, fit){
  const f=state.extractFlight; if(!f) return;
  const t=state.time||0;
  const anim=(typeof unitWalk==='function') ? unitWalk('bomber','player') : null;
  const pos=hubPanoBomberPos(state, fit, anim);
  const px=pos.px, py=pos.py, S=pos.S;
  // Framed-movie clip: the bomber is only ever drawn over the panorama image, never over the
  // black letterbox borders. So its nose emerges from the right edge as it flies in and it
  // slips gradually off the left edge as it crosses out.
  ctx.save();
  ctx.beginPath(); ctx.rect(fit.ox, fit.oy, fit.dw, fit.dh); ctx.clip();
  if(anim && anim.ready){
    const u={ type:'bomber', owner:'player', _face:-1 };    // facesLeft sprite, flying left → no mirror
    blitFrame(u, px, py, anim, S, ((t*8)|0)%anim.frames.length);
    drawHubPanoThrusters(px, py, S, anim, t);               // red engine glow on the rear thrusters
  } else {
    ctx.fillStyle='#7fd6ff'; ctx.beginPath(); ctx.arc(px,py,S*0.18,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

// Red neon engine glow at the bomber's rear thrusters. Mirrors blitFrame's draw box so the
// glows track the sprite pixel-for-pixel: frame box is x∈[px-dw/2, px+dw/2], y∈[py-0.7S, py+0.3S]
// (no flip, since the sprite faces left and is drawn left). Additive, with a fast per-engine flicker
// and a backward (rightward) exhaust streak.
function drawHubPanoThrusters(px, py, S, anim, t){
  const dw=S*(anim.fw/anim.fh), dh=S;
  const left=px-dw/2, top=py-0.7*dh;
  const RED=HUB_PANO_COLORS.red;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for(const e of HUB_BOMBER_THRUSTERS){
    const ex=left+e.u*dw, ey=top+e.v*dh, er=Math.max(1.5, e.r*S);
    const flick=0.62 + 0.38*Math.sin(t*9.0 + e.ph) + 0.08*Math.sin(t*23.0 + e.ph*2.3);
    const a=Math.max(0.15, Math.min(1, flick));
    megaFillEllipseGlow(ex + er*1.6, ey, er*3.0, er*0.85, 0, RED, 0.20*a, 0.06*a);  // backward exhaust streak
    megaFillEllipseGlow(ex, ey, er*2.4, er*2.4, 0, RED, 0.30*a, 0.10*a);             // outer halo
    megaFillEllipseGlow(ex, ey, er*1.3, er*1.3, 0, RED, 0.80*a, 0.28*a);             // hot core
    ctx.fillStyle='rgba(255,206,196,'+(0.72*a).toFixed(3)+')';                       // white-hot centre
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, er*0.5), 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/* ---- ambient courier drones (panorama scene) -------------------------------------------
   Reuses the HUB drone visual contract (small flyer sprite + blinking neon nav lights), but
   in the panorama's NORMALIZED image space: drones enter from one side margin near the
   bomber's altitude band and cross to the opposite margin, FASTER than the bomber and ~15% its
   size. Cosmetic + module-local (no G state) so saves/netcode are untouched; ticks only while
   the scene runs (frozen on pause) and is off under prefers-reduced-motion. */
const HUB_PANO_DRONE = {
  CAP: 7,                         // max airborne at once
  sizeFrac: 0.143 * 0.15,         // 15% of the bomber height (bomber sizeFrac = 0.143)
  spdMin: 0.09, spdRange: 0.06,   // normalized image-widths / sec (bomber ≈ 0.06 → ~1.5-2.5× faster)
  vyDrift: 0.012,                 // tiny vertical wander
  spawnMin: 0.8, spawnRange: 1.47,// seconds between spawns
  band: 0.10,                     // ± vertical spread around the bomber band when flying "near" it
  margin: 0.12,                   // spawn / despawn this far outside the image (normalized)
};
const HUB_PANO_DRONE_COLORS = ['cyan','purple','blue','red'];
const _hubPanoDrones = [];
const _hubPanoDroneState = { clock:0, spawnAcc:0, nextSpawn:0 };
const _hubPanoReducedMotion = (()=>{ try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } })();

// Clear the pool at the start of each panorama (called from js/hub.js when the phase begins).
function resetHubPanoDrones(){
  _hubPanoDrones.length = 0;
  _hubPanoDroneState.clock = 0;
  _hubPanoDroneState.spawnAcc = 0;
  _hubPanoDroneState.nextSpawn = 0.4 + Math.random()*0.8;   // first drone shortly after the scene opens
}

// The bomber's current normalized altitude — drones mostly fly near this band.
function _hubPanoBomberNy(f){
  const B=HUB_PANO_BOMBER, p=Math.min(1, Math.max(0, (f?f.t:0)/HUB_LOAD_DURATION));
  return B.sy + (B.ey-B.sy)*p;
}

function _spawnHubPanoDrone(state){
  const D=HUB_PANO_DRONE, R=Math.random;
  if(_hubPanoDrones.length >= D.CAP) return;
  const fromLeft = R()<0.5;
  const face = fromLeft ? 1 : -1;                            // +1 → flies right, -1 → flies left
  const nx = fromLeft ? -D.margin : 1+D.margin;              // enter just outside one side margin
  const bomberNy = _hubPanoBomberNy(state.extractFlight);
  const ny = (R()<0.72) ? bomberNy + (R()-0.5)*2*D.band      // mostly near the bomber...
                        : 0.12 + R()*0.30;                   // ...sometimes elsewhere in the upper sky
  const spd = D.spdMin + R()*D.spdRange;
  _hubPanoDrones.push({
    nx, ny, vnx: face*spd, vny:(R()-0.5)*2*D.vyDrift, face,
    owner: R()<0.5 ? 'player' : 'enemy',                     // red / blue courier sheet (mix)
    color: HUB_PANO_DRONE_COLORS[(R()*HUB_PANO_DRONE_COLORS.length)|0],
    phase: R()*6.2832, life:0, sz: 0.85 + R()*0.4,
  });
}

// dt-stepped update (called from js/hub.js updateExtraction while phase==='panorama').
function updateHubPanoDrones(state, dt){
  if(_hubPanoReducedMotion) return;
  if(!state || !state.extractFlight) return;
  const D=HUB_PANO_DRONE;
  _hubPanoDroneState.clock += dt;
  for(let i=_hubPanoDrones.length-1; i>=0; i--){
    const d=_hubPanoDrones[i];
    d.nx += d.vnx*dt; d.ny += d.vny*dt; d.life += dt;
    if(d.nx < -D.margin-0.06 || d.nx > 1+D.margin+0.06) _hubPanoDrones.splice(i,1);   // crossed the far margin
  }
  _hubPanoDroneState.spawnAcc += dt;
  if(_hubPanoDroneState.spawnAcc >= _hubPanoDroneState.nextSpawn){
    _hubPanoDroneState.spawnAcc = 0;
    _hubPanoDroneState.nextSpawn = D.spawnMin + Math.random()*D.spawnRange;
    _spawnHubPanoDrone(state);
  }
}

// Draw the drones (clipped to the image, like the bomber) with blinking neon nav lights.
function drawHubPanoDrones(state, fit){
  if(!_hubPanoDrones.length) return;
  const animR=(typeof unitWalk==='function')?unitWalk('courier','player'):null;   // red sheet
  const animB=(typeof unitWalk==='function')?unitWalk('courier','enemy'):null;     // blue sheet
  const t=_hubPanoDroneState.clock;
  const baseS=fit.vh * HUB_PANO_DRONE.sizeFrac;
  ctx.save();
  ctx.beginPath(); ctx.rect(fit.ox, fit.oy, fit.dw, fit.dh); ctx.clip();            // framed-movie clip
  for(const d of _hubPanoDrones){
    const anim = d.owner==='enemy' ? animB : animR;
    if(!anim || !anim.ready) continue;
    const px=fit.ox + d.nx*fit.dw, py=fit.oy + d.ny*fit.dh;
    const wob=Math.sin(t*0.9 + d.phase);
    const S=Math.max(7, baseS*d.sz*(1+wob*0.12));
    const a=Math.min(1, d.life/0.6);
    const u={ type:'courier', owner:d.owner, _face:d.face };
    ctx.save(); ctx.globalAlpha=a;
    blitFrame(u, px, py, anim, S, ((t*6)|0)%anim.frames.length);
    ctx.restore();
    // neon nav lights: a soft body underglow + two out-of-phase blinking wingtip lights, additive.
    const accent=HUB_PANO_COLORS[d.color]||HUB_PANO_COLORS.cyan;
    const ly=py - S*0.18, wx=S*0.42, gr=S*0.42;
    const b1=0.35+0.5*Math.sin(t*4.2 + d.phase), b2=0.35+0.5*Math.sin(t*4.2 + d.phase + 2.1);
    ctx.save(); ctx.globalCompositeOperation='lighter';
    megaFillEllipseGlow(px,    ly, S*0.7, S*0.5, 0, accent,               0.22*a*(0.6+0.4*wob), 0.07*a);  // body underglow
    megaFillEllipseGlow(px-wx, ly, gr,    gr,    0, accent,               0.85*a*b1, 0.22*a*b1);          // port light
    megaFillEllipseGlow(px+wx, ly, gr,    gr,    0, HUB_PANO_COLORS.cyan,  0.85*a*b2, 0.22*a*b2);          // starboard light
    ctx.restore();
  }
  ctx.restore();
}

// Entry point — called from render.js when extractFlight.phase==='panorama'. Draws the
// whole scene full-screen in CSS px (caller has already cleared the backing store), then
// resets the transform to identity for anything that runs after.
function drawHubLoadingScene(state, opts){
  const fit=hubPanoFit();
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,fit.vw,fit.vh);
  if(HUB_PANO_READY) ctx.drawImage(HUB_PANO_IMG, fit.ox, fit.oy, fit.dw, fit.dh);
  drawHubPanoNeon(state, fit);
  if(opts && typeof opts.midDraw==='function') opts.midDraw(fit);   // BEHIND-the-tower layer (e.g. the distant horizon nukes)
  drawHubPanoTower(state, fit);
  drawHubPanoDrones(state, fit);
  if(!(opts && opts.noBomber)) drawHubPanoBomber(state, fit);   // Ep VII flash intro reuses this scene without the bomber
  ctx.setTransform(1,0,0,1,0,0);
}
