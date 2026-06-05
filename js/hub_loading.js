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

// Buzzword Bomber flight path, NORMALIZED image coords. Upper-right skyline → left corner,
// almost straight (slight downward drift), flying a touch lower than the sky so it grazes
// the skyline. Just off-image at both ends so it enters/exits cleanly across the duration.
const HUB_PANO_BOMBER = { sx:1.10, sy:0.24, ex:-0.10, ey:0.19, sizeFrac:0.143 };

// Engine thrusters on the bomber's back (right side, since the sprite faces left), in
// FRAME-normalized coords (0..1) measured off walk_enemy.png frame 0. Red neon glows are
// mapped here so the rear engines light up. `r` is the core radius as a fraction of the
// drawn sprite height; `ph` staggers each engine's flicker.
const HUB_BOMBER_THRUSTERS = [
  { u:0.88, v:0.13, r:0.055, ph:0.0 },   // top exhaust
  { u:0.93, v:0.45, r:0.080, ph:1.7 },   // main rear nozzle (biggest)
  { u:0.77, v:0.68, r:0.052, ph:3.1 },   // lower rear nozzle
];

// Fit the panorama to 100% screen HEIGHT, preserve aspect, center horizontally (black
// letterbox sides on desktop; on portrait/mobile the image overflows and the centered
// slice shows the middle third). Sets the canvas transform to CSS px and returns the map.
function hubPanoFit(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const vw=innerWidth, vh=innerHeight;
  const iw=HUB_PANO_IMG.naturalWidth||1448, ih=HUB_PANO_IMG.naturalHeight||1086;
  const scale=vh/ih, dw=iw*scale, dh=vh;
  return { ox:(vw-dw)/2, oy:0, dw, dh, scale, vw, vh };
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
  const fps=(typeof MEGA_FPS!=='undefined' && MEGA_FPS.megabuilding) || 1.4;
  const fi=HUB_TOWER_FRAMES[((Math.floor((state.time||0)*fps)%HUB_TOWER_FRAMES.length)+HUB_TOWER_FRAMES.length)%HUB_TOWER_FRAMES.length];
  const neon=(typeof megaNeonFrame==='function') ? megaNeonFrame(m,fi) : null;
  if(neon && typeof drawMegaNeonLayer==='function') drawMegaNeonLayer(state,m,neon,dx,dy,dw,dh,'aura');
  ctx.drawImage(spr.img, fi*spr.fw,0, spr.fw,spr.fh, dx,dy, dw,dh);
  if(neon && typeof drawMegaNeonLayer==='function') drawMegaNeonLayer(state,m,neon,dx,dy,dw,dh,'core');
}

// The BIG Buzzword Bomber crossing the skyline. Position is driven by f.t (0→13s) so it
// reaches the far side exactly when the scene ends. Reuses the unit sprite + blitFrame.
function drawHubPanoBomber(state, fit){
  const f=state.extractFlight; if(!f) return;
  const B=HUB_PANO_BOMBER;
  const p=Math.min(1, Math.max(0, f.t/HUB_LOAD_DURATION));
  const t=state.time||0;
  const nx=B.sx + (B.ex-B.sx)*p;
  const ny=B.sy + (B.ey-B.sy)*p + 0.012*Math.sin(t*1.6);   // gentle bob → reads as real flight
  const px=fit.ox + nx*fit.dw, py=fit.oy + ny*fit.dh;
  const S=Math.round(fit.vh * B.sizeFrac);
  const anim=(typeof unitWalk==='function') ? unitWalk('bomber','player') : null;
  // Framed-movie clip: the bomber is only ever drawn over the panorama image, never over the
  // black letterbox borders. So its nose emerges from the right border as it flies in and it
  // slips gradually into the left border as it crosses out.
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

// Entry point — called from render.js when extractFlight.phase==='panorama'. Draws the
// whole scene full-screen in CSS px (caller has already cleared the backing store), then
// resets the transform to identity for anything that runs after.
function drawHubLoadingScene(state){
  const fit=hubPanoFit();
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,fit.vw,fit.vh);
  if(HUB_PANO_READY) ctx.drawImage(HUB_PANO_IMG, fit.ox, fit.oy, fit.dw, fit.dh);
  drawHubPanoNeon(state, fit);
  drawHubPanoTower(state, fit);
  drawHubPanoBomber(state, fit);
  ctx.setTransform(1,0,0,1,0,0);
}
