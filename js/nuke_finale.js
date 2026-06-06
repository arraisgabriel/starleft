/* nuke_finale.js — the Episode VII "flash" detonation FX. A self-contained, full-screen canvas
   cinematic drawn over #cv during the solo extraction's `extractFlight.phase==='nuke'` (set in
   js/hub.js when the Buzzword Bomber reaches the HQ roof on map index 6). Draws in DEVICE pixel space,
   restores the transform on exit. Pure render (deterministic from `extractFlight.t`) — no Math.random,
   never touches the sim. The roster-death + memorial + hub hand-off live in hub.js; this only paints.

   Timeline (seconds, driven by extractFlight.t; the music starts at the bomb drop):
     0 .. 10 (T_IMPACT)         a BIG bomb falls from the sky to the crash site — base/units stay intact
     10                         impact: explosion bloom + shockwave + debris (hub.js memorializes the roster;
                                the base/units STAY on the map — just violently shaken, then whited out)
     10 .. 28 (T_ANIM_END)      a large, DENSE mushroom cloud rises & inflates AND the white flash + camera
                                shake grow with it (18s build); all reach their biggest values at 28 (full white)
     28 (T_TITLE_IN)            the STARLEFT neon logo fades in over the white and STAYS rendered
     28 .. 38                   full-white hold (10s) with the logo
     38 .. 41                   the white fades out (WHITE_FADE) to the extraction panorama (no bomber); logo stays
     38 .. 67 (PANO_END)        panorama + logo on screen; the music plays to 67 then STOPS
     67 .. 73                   a resounding echo rings for NUKE_T_ECHO_TAIL (6s); only AFTER it ends →
   => hub.js enterHubFlashAftermath at NUKE_DURATION + NUKE_T_ECHO_TAIL = 73s (then the Nino cutscene).

   Dark-cyberpunk palette (docs/world-bible.md §1): a dark, dense charcoal smoke body with grey-tone
   variation (mostly dark), a hot orange/red underbelly that cools, and a faint teal/purple rim. An
   optional painted mushroom sprite (assets/scenes/nuke/mushroom.png) is layered over the procedural
   cloud when present (procedural is the always-available fallback). Loaded after render.js, before main.js. */

const NUKE_T_IMPACT      = 10.0;  // the bomb falls for 10s, then hits the crash site (hub.js reads this)
const NUKE_T_ANIM_END    = 28.0;  // mushroom + white flash + camera shake grow over 18s (10→28), peaking fully white here
const NUKE_T_TITLE_IN    = 28.0;  // the STARLEFT logo appears at full white — i.e. ~28s into the cinematic / music
const NUKE_T_WHITE_FADE_START = 38.0;  // the full-white screen holds 10s (28→38) with the logo, then starts fading
const NUKE_WHITE_FADE    = 3.0;   // the white fades out over this window to reveal the extraction panorama (logo stays)
const NUKE_T_PANO_END    = 67.0;  // the cinematic music plays until here, then STOPS (panorama+logo stays on screen)
const NUKE_T_ECHO_TAIL   = 6.0;   // after the music stops, a resounding echo rings for 6s (67→73); only THEN → the hub
const NUKE_DURATION      = NUKE_T_PANO_END;   // 67.0 = when the music ends; the hub follows after NUKE_T_ECHO_TAIL
const NUKE_CAP_W_FRAC    = 0.44;  // target mushroom-cap visual DIAMETER as a fraction of screen width
// ---- two small, FAR nukes on the panorama horizon (extraction scene), sequential, one at a time ----
const NUKE_T_DISTANT_START = 41.0;  // they begin once the panorama is fully revealed (= white fade done, 38+3)
const NUKE_DISTANT_FALL    = 10.0;  // each distant bomb falls 10s before it hits the horizon and bursts; #2 starts when #1 bursts
const NUKE_DISTANT_SCALE   = 0.06;  // distant-nuke size as a fraction of screen height (small = far away)
const NUKE_T_LYRICS_START  = 28.0;  // the singer starts at 28s of the music (= nuke t, since the music starts at the bomb drop)
if(typeof window!=='undefined'){
  window.NUKE_DURATION=NUKE_DURATION; window.NUKE_T_IMPACT=NUKE_T_IMPACT; window.NUKE_T_ANIM_END=NUKE_T_ANIM_END;
  window.NUKE_T_TITLE_IN=NUKE_T_TITLE_IN; window.NUKE_T_ECHO_TAIL=NUKE_T_ECHO_TAIL;
}

(function(){
  'use strict';
  const TAU=6.2831853;

  let NUKE_IMG=null, NUKE_IMG_READY=false;
  try { const im=new Image(); im.onload=()=>{NUKE_IMG=im;NUKE_IMG_READY=true;}; im.onerror=()=>{NUKE_IMG_READY=false;};
        im.src=(typeof ASSET_BASE!=='undefined'?ASSET_BASE:'assets/')+'scenes/nuke/mushroom.png'; } catch(e){}

  function hash(i){ const n=Math.sin(i*127.1+0.5)*43758.5453; return n-Math.floor(n); }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function smooth(t){ t=clamp(t,0,1); return t*t*(3-2*t); }
  function radial(x,y,r,stops){ r=Math.max(1,r); const g=ctx.createRadialGradient(x,y,0,x,y,r); for(const s of stops) g.addColorStop(s[0],s[1]); return g; }
  // dense smoke puff (source-over → density builds on overlap); stays opaque well toward the edge
  function puff(x,y,r,rgb,a){ if(a<=0.012||r<1) return; ctx.globalAlpha=a>1?1:a;
    ctx.fillStyle=radial(x,y,r,[[0,'rgba('+rgb+',1)'],[0.65,'rgba('+rgb+',0.95)'],[0.88,'rgba('+rgb+',0.5)'],[1,'rgba('+rgb+',0)']]);
    ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); }
  function glow(x,y,r,rgb,a){ if(a<=0.012||r<1) return; ctx.globalAlpha=a>1?1:a;
    ctx.fillStyle=radial(x,y,r,[[0,'rgba('+rgb+',1)'],[0.4,'rgba('+rgb+',0.55)'],[1,'rgba('+rgb+',0)']]);
    ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); }

  // mostly-dark charcoal shades with grey-tone variation (dark → mid); per-puff pick is randomised
  const SMOKE=['12,12,17','16,16,22','20,20,27','26,25,33','34,33,43','46,44,57'];
  function tone(i){ return SMOKE[(hash(i*13.7)*SMOKE.length)|0]; }

  function drawBomb(cx, groundY, t, W, H, px){
    const base=Math.min(W,H);
    const p=clamp(t/NUKE_T_IMPACT,0,1), e=p*p;                 // gravity accel
    const y0=-base*0.14, by=y0+(groundY-y0)*e, bx=cx;
    const bh=base*0.095, bw=bh*0.40;                           // A FUCKING BIG bomb
    // big vapor trail
    ctx.globalCompositeOperation='source-over';
    for(let i=1;i<=20;i++){ const tt=e-i*0.019; if(tt<0) break; const ty=y0+(groundY-y0)*tt;
      puff(bx+(hash(i)-0.5)*bw*0.9, ty, bw*(0.6+i*0.17), '88,88,100', 0.17*(1-i/20)); }
    // nose cone (points down — direction of travel)
    ctx.fillStyle='#16181e'; ctx.beginPath();
    ctx.moveTo(bx-bw*0.98, by+bh*0.45); ctx.lineTo(bx, by+bh*1.34); ctx.lineTo(bx+bw*0.98, by+bh*0.45); ctx.closePath(); ctx.fill();
    // tail fins (up)
    ctx.fillStyle='#3a3f4c';
    for(const s of [-1,1]){ ctx.beginPath();
      ctx.moveTo(bx+s*bw*0.25, by-bh*0.62); ctx.lineTo(bx+s*bw*1.7, by-bh*1.22); ctx.lineTo(bx+s*bw*0.5, by-bh*0.28); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(bx-bw*0.32,by-bh*0.7); ctx.lineTo(bx,by-bh*1.32); ctx.lineTo(bx+bw*0.32,by-bh*0.7); ctx.closePath(); ctx.fill();
    // body (light metallic capsule) + dark outline so the BIG bomb reads against the dark sky and map
    ctx.fillStyle='#4b5160'; ctx.beginPath(); ctx.ellipse(bx,by,bw,bh*0.84,0,0,TAU); ctx.fill();
    ctx.lineWidth=Math.max(1.5,2.5*px); ctx.strokeStyle='#0c0d11'; ctx.stroke();
    ctx.fillStyle='#6b7383'; ctx.beginPath(); ctx.ellipse(bx-bw*0.38,by-bh*0.12,bw*0.30,bh*0.58,0,0,TAU); ctx.fill();   // highlight
    ctx.fillStyle='#9aa2b2'; ctx.beginPath(); ctx.ellipse(bx-bw*0.5,by-bh*0.2,bw*0.12,bh*0.34,0,0,TAU); ctx.fill();     // bright glint
    // red warning stripe
    ctx.strokeStyle='#cf302d'; ctx.lineWidth=bw*0.40; ctx.beginPath(); ctx.moveTo(bx-bw*0.86,by-bh*0.16); ctx.lineTo(bx+bw*0.86,by-bh*0.16); ctx.stroke();
    // blinking light + thruster glow at the tail
    ctx.globalCompositeOperation='lighter';
    glow(bx, by, bw*1.05, '255,60,60', 0.5+0.45*Math.sin(t*42));
    glow(bx, by-bh*1.08, bw*2.1, '255,80,70', 0.5+0.3*Math.sin(t*30));
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  }

  function drawExplosion(cx, groundY, t, W, H, px){
    const dt=t-NUKE_T_IMPACT; if(dt<0) return;
    ctx.globalCompositeOperation='lighter';
    if(dt<1.4){ const r=dt*Math.max(W,H)*0.75, a=Math.max(0,1-dt/1.3)*0.55;     // ground shockwave (flattened)
      ctx.globalAlpha=a; ctx.strokeStyle='rgba(255,232,195,1)'; ctx.lineWidth=Math.max(2,11*px*(1-dt/1.4));
      ctx.beginPath(); ctx.ellipse(cx,groundY,r,r*0.30,0,0,TAU); ctx.stroke(); }
    if(dt<0.6){ const fr=W*(0.06+dt*0.6), a=Math.max(0,1-dt/0.6);                // initial fireball bloom
      glow(cx, groundY-fr*0.3, fr, '255,238,200', a);
      glow(cx, groundY-fr*0.3, fr*0.55, '255,255,255', a*0.9); }
    if(dt<1.6){ for(let i=0;i<54;i++){ const ang=-0.18-hash(i)*2.78, sp=(280+hash(i)*680)*px;   // debris
        const dx=Math.cos(ang)*sp*dt, dy=Math.sin(ang)*sp*dt + 250*px*dt*dt;
        const a=Math.max(0,1-dt/1.5)*(0.4+0.6*hash(i*5)); if(a<0.02) continue;
        ctx.globalAlpha=a; ctx.fillStyle=hash(i*3)>0.55?'#ffd9a0':'#ff7a3a';
        const s=(1.6+hash(i*7)*3.4)*px; ctx.fillRect(cx+dx-s/2, groundY+dy-s/2, s, s); } }
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  }

  function drawMushroom(cx, groundY, t, W, H, px){
    const dt=t-NUKE_T_IMPACT; if(dt<0) return;
    const ge=smooth(dt/(NUKE_T_ANIM_END-NUKE_T_IMPACT));        // 0 at impact → 1 at 5s (clamped)
    const capR=(NUKE_CAP_W_FRAC*W*0.5/1.8)*(0.32+0.68*ge);      // larger cap (≈44% screen width at full)
    const capCY=groundY - ge*(groundY - H*0.26);                // taller column (cap rises to ~26% from top)
    const stemHW=capR*0.28;
    const capBottom=capCY+capR*0.52;
    const cool=clamp(dt/2.8,0,1), dens=0.5+0.5*ge;

    // 0) solid silhouette: thin stem + wide domed overhanging cap — DARK & opaque (dense body)
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=0.82*dens; ctx.fillStyle='rgb(16,16,22)';
    ctx.beginPath();
    ctx.moveTo(cx-stemHW, groundY);
    ctx.quadraticCurveTo(cx-stemHW*0.9, (groundY+capBottom)/2, cx-stemHW*0.85, capBottom);
    ctx.lineTo(cx+stemHW*0.85, capBottom);
    ctx.quadraticCurveTo(cx+stemHW*0.9, (groundY+capBottom)/2, cx+stemHW, groundY);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, capCY, capR*1.34, capR*0.84, 0,0,TAU); ctx.fill();
    ctx.globalAlpha=1;

    // 1) dense base pile at the crash site
    const baseW=capR*1.12;
    for(let i=0;i<16;i++){ const a0=hash(i)*TAU, rr=(0.2+hash(i*2)*0.85)*baseW, wob=Math.sin(t*1.4+i)*4*px;
      const x=cx+Math.cos(a0)*rr+wob, y=groundY-Math.abs(Math.sin(a0))*baseW*0.5 - hash(i*3)*7*px;
      puff(x,y,(0.55+hash(i*4)*0.65)*baseW*0.6, tone(i+1), (0.6+0.35*hash(i*5))*dens); }

    // 2) thick rising stem column
    const segs=11;
    for(let s=0;s<segs;s++){ const f=s/(segs-1), y=groundY-(groundY-capBottom)*f;
      const w=stemHW*(1.1-0.12*f)*(0.9+0.18*Math.sin(t*1.6+s)); const ox=Math.sin(t*1.1+s*1.7)*4*px;
      puff(cx+ox-w*0.5, y, w*1.5, tone(s*2),   0.6*dens);
      puff(cx+ox+w*0.5, y, w*1.5, tone(s*2+1), 0.55*dens); }

    // 3) cap: domed top + overhanging bottom rim + dense core (large billowing head)
    const Ntop=20, Nrim=15;
    for(let i=0;i<Ntop;i++){ const ang=Math.PI + (i/(Ntop-1))*Math.PI;
      const x=cx+Math.cos(ang)*capR*1.26*(0.85+0.25*hash(i*3))+Math.sin(t*1.4+i)*5*px;
      const y=capCY+Math.sin(ang)*capR*0.80*(0.85+0.25*hash(i*5));
      puff(x,y,capR*(0.55+0.32*hash(i*7)), tone(i), 0.66*dens); }
    for(let i=0;i<Nrim;i++){ const fx=(i/(Nrim-1))*2-1;
      const x=cx+fx*capR*1.30+Math.sin(t*1.3+i)*4*px, y=capCY+capR*0.50+Math.abs(fx)*capR*0.16;
      puff(x,y,capR*(0.48+0.24*hash(i*11)), tone(i+3), 0.6*dens); }
    for(let i=0;i<8;i++){ const wob=Math.sin(t*1.3+i*2)*5*px;              // dense cap core (darkest)
      puff(cx+(hash(i)-0.5)*capR*0.8+wob, capCY+(hash(i*2)-0.5)*capR*0.45, capR*0.8, SMOKE[i%2], 0.7*dens); }

    // 4) hot underbelly glow (additive; fades as it cools)
    if(cool<1){ const ha=1-cool; ctx.globalCompositeOperation='lighter';
      glow(cx, groundY-baseW*0.3, baseW*1.5, '255,110,40', 0.55*ha);
      glow(cx, capBottom, capR*1.1, '255,95,40', 0.42*ha);
      glow(cx, capBottom, capR*0.55,'255,185,95', 0.45*ha);
      ctx.globalCompositeOperation='source-over'; }

    // 5) soft cool rim light on the cap (broad & faint — not dots)
    ctx.globalCompositeOperation='lighter';
    glow(cx-capR*0.7, capCY-capR*0.45, capR*0.95, '70,150,170', 0.10*ge);
    glow(cx+capR*0.6, capCY-capR*0.40, capR*0.85, '120,90,160', 0.09*ge);
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;

    if(NUKE_IMG_READY){ const a=smooth(dt/0.8)*ge, dw=capR*3.2, dh=dw*((NUKE_IMG.height/NUKE_IMG.width)||1);
      ctx.globalAlpha=a*0.9; ctx.drawImage(NUKE_IMG, cx-dw/2, capCY-dh*0.55, dw, dh); ctx.globalAlpha=1; }
  }

  // the extraction "hub city" panorama (neon skyline + ULTRA tower + drifting drones), WITHOUT the
  // Buzzword Bomber. Reuses js/hub_loading.js (manages its own transform; leaves identity afterwards).
  function drawExtractionPano(state){
    // the distant horizon nukes are drawn via midDraw → BEHIND the ULTRA tower (it occludes them, as it should)
    if(typeof drawHubLoadingScene==='function') drawHubLoadingScene(state, {noBomber:true, midDraw:()=>drawDistantNukes(state)});
    else { ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#05080d'; ctx.fillRect(0,0,cv.width,cv.height); if(typeof drawDistantNukes==='function') drawDistantNukes(state); }
  }

  // the STARLEFT game-intro title: red neon, ~70% of viewport width, centred, fades in/out across its window.
  function drawTitle(t, W, H, px){
    // fades in when it appears, then stays rendered through the white hold, the fade, and the panorama scene
    const a=clamp((t-NUKE_T_TITLE_IN)/1.2,0,1);
    if(a<=0.012) return;
    const text='STARLEFT', fam="px 'Glitch Goblin','Arial Black',Impact,sans-serif";
    ctx.textAlign='center'; ctx.textBaseline='middle';
    let fs=H*0.22; ctx.font=fs+fam;
    const m=ctx.measureText(text).width||1; fs*=(0.70*W)/m;   // scale so the word spans ~70% of the width
    ctx.font=fs+fam;
    const x=W*0.5, y=H*0.5;
    ctx.globalAlpha=a;
    ctx.shadowColor='rgba(255,42,54,1)'; ctx.fillStyle='#e51d2a';      // red neon halo (several blurred passes)
    for(let i=0;i<3;i++){ ctx.shadowBlur=(24+i*30)*px; ctx.fillText(text,x,y); }
    ctx.shadowBlur=12*px; ctx.fillStyle='#ff5a64'; ctx.fillText(text,x,y);
    ctx.shadowBlur=0;     ctx.fillStyle='#ffd6da'; ctx.fillText(text,x,y);   // hot near-white core
    ctx.shadowColor='transparent'; ctx.globalAlpha=1;
  }

  // ---- distant horizon nukes (reuse the Ep VII bomb→explosion→mushroom structure, tiny + far) ----
  // anchor points in panorama-image fractions: the far skyline over the bay, in the centre third
  const DIST_PTS=[{x:0.435, y:0.285}, {x:0.585, y:0.300}];

  // lit night palette: the distant cloud is illuminated by its own fireball + city glow, so it reads as a
  // LIGHT grey-tan mushroom against the dark sky (the main full-screen nuke uses dark smoke over a lit map).
  const DIST_SMOKE=['132,126,140','158,150,165','110,106,122','176,158,156'];
  function dtone(i){ return DIST_SMOKE[(hash(i*13.7)*DIST_SMOKE.length)|0]; }
  function drawDistantMushroom(cx, gy, dt, S){
    const ge=smooth(Math.min(1, dt/3.0));        // grows to full over ~3s, then lingers
    const capR=S*(0.4+0.7*ge), capCY=gy - ge*S*2.2, stemHW=capR*0.384, cool=Math.min(1, dt/3.2);   // stem 20% wider (0.32→0.384)
    // soft outer halo so the far cloud pops against the dark sky (additive)
    ctx.globalCompositeOperation='lighter'; glow(cx, capCY, capR*2.2, '150,140,170', 0.12); ctx.globalCompositeOperation='source-over';
    // cap base silhouette (the top reads fine — keep it as-is)
    ctx.globalAlpha=0.60; ctx.fillStyle='rgb(104,100,118)';
    ctx.beginPath(); ctx.ellipse(cx,capCY,capR*1.3,capR*0.8,0,0,TAU); ctx.fill();
    ctx.globalAlpha=1;
    // stem (middle): a billowy, OPAQUE column of overlapping puffs — irregular borders, not a straight pillar
    const stemTop=capCY+capR*0.42, ssegs=7;
    for(let i=0;i<ssegs;i++){ const fr=i/(ssegs-1), sy=gy-(gy-stemTop)*fr;
      const wob=Math.sin(dt*1.0+i*1.3)*stemHW*0.45 + (hash(i*5)-0.5)*stemHW*0.55;   // irregular horizontal wander
      const sr=stemHW*(1.25-0.2*fr)*(0.82+0.32*hash(i*7));                          // slight width variation
      puff(cx+wob, sy, sr, dtone(i+2), 0.85); }                                     // more opaque than the cap
    for(let i=0;i<9;i++){ const ang=Math.PI+(i/8)*Math.PI, wob=Math.sin(dt*1.2+i)*S*0.06;   // lit cap puffs
      puff(cx+Math.cos(ang)*capR*1.2+wob, capCY+Math.sin(ang)*capR*0.72, capR*(0.42+0.26*hash(i*3)), dtone(i), 0.72); }
    for(let i=0;i<3;i++) puff(cx+(hash(i)-0.5)*capR*0.6, capCY, capR*0.6, dtone(i+1), 0.74);   // dense core
    ctx.globalCompositeOperation='lighter';                                                     // warm fireball-lit base — lingers
    glow(cx, capCY+capR*0.45, capR*1.1, '255,140,55', 0.5*(1-cool*0.6));
    glow(cx, capCY+capR*0.45, capR*0.5, '255,205,130', 0.42*(1-cool*0.6));
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  }
  function drawDistantNuke(cx, gy, lt, S){
    if(lt < 0) return;
    if(lt < NUKE_DISTANT_FALL){                                    // a tiny bomb falls from the sky to the horizon
      const p=lt/NUKE_DISTANT_FALL, e=p*p, skyTop=gy - S*5.5, by=skyTop+(gy-skyTop)*e;
      ctx.globalCompositeOperation='source-over';
      for(let i=1;i<=6;i++){ const tt=e-i*0.05; if(tt<0) break; const ty=skyTop+(gy-skyTop)*tt;
        puff(cx, ty, S*0.08*(1+i*0.25), '120,120,135', 0.10*(1-i/6)); }      // vapor trail
      ctx.globalAlpha=1; ctx.fillStyle='#1a1d24';
      ctx.beginPath(); ctx.ellipse(cx,by,S*0.10,S*0.22,0,0,TAU); ctx.fill();
      ctx.globalCompositeOperation='lighter'; glow(cx, by, S*0.34, '255,90,75', 0.75+0.25*Math.sin(lt*28));  // red marker glow
      ctx.fillStyle='rgba(255,220,205,0.9)'; ctx.beginPath(); ctx.arc(cx, by, S*0.06, 0, TAU); ctx.fill();    // hot core, reads vs sky
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
    } else {
      const dt=lt-NUKE_DISTANT_FALL;
      if(dt<0.9){ ctx.globalCompositeOperation='lighter';                    // burst: bloom + tiny ground shockwave
        const fr=S*(0.5+dt*1.8), a=Math.max(0,1-dt/0.9);
        glow(cx, gy-fr*0.2, fr, '255,238,200', a); glow(cx, gy-fr*0.2, fr*0.5, '255,255,255', a*0.85);
        const r=dt*S*5.5, ra=Math.max(0,1-dt/0.85)*0.45;
        ctx.globalAlpha=ra; ctx.strokeStyle='rgba(255,232,195,1)'; ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.ellipse(cx,gy,r,r*0.28,0,0,TAU); ctx.stroke();
        ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; }
      drawDistantMushroom(cx, gy, dt, S);
    }
  }
  // both distant nukes, anchored to the panorama horizon (drawn in the pano's CSS-px space, clipped to the image)
  function drawDistantNukes(state){
    const f=state && state.extractFlight; if(!f) return;
    const t=f.t||0; if(t < NUKE_T_DISTANT_START) return;
    if(typeof hubPanoMetrics!=='function') return;
    const fit=hubPanoMetrics(), S=fit.dh*NUKE_DISTANT_SCALE, d=(typeof dpr!=='undefined'?dpr:1);
    ctx.save(); ctx.setTransform(d,0,0,d,0,0);
    ctx.beginPath(); ctx.rect(fit.ox, fit.oy, fit.dw, fit.dh); ctx.clip();      // framed-movie clip (no draw on letterbox)
    drawDistantNuke(fit.ox + DIST_PTS[0].x*fit.dw, fit.oy + DIST_PTS[0].y*fit.dh, t-NUKE_T_DISTANT_START, S);                       // #1
    drawDistantNuke(fit.ox + DIST_PTS[1].x*fit.dw, fit.oy + DIST_PTS[1].y*fit.dh, t-(NUKE_T_DISTANT_START+NUKE_DISTANT_FALL), S*0.66);   // #2 — fell farther away, so smaller
    ctx.restore();
  }

  // neon-red song subtitle at the bottom, synced to the music (the text is loaded from the asset by
  // js/lyrics.js — never stored here). Shown only while the singer is singing: NUKE_T_LYRICS_START..NUKE_DURATION.
  function drawLyricSubtitle(state){
    if(typeof LYRICS==='undefined') return;
    const f=state && state.extractFlight; if(!f) return;
    const t=f.t||0;
    if(!LYRICS.isLoaded()) LYRICS.load((typeof ASSET_BASE!=='undefined'?ASSET_BASE:'assets/')+'scenes/hub/sad_god_lyrics', NUKE_T_LYRICS_START, NUKE_DURATION);
    if(t < NUKE_T_LYRICS_START || t > NUKE_DURATION) return;       // only while the music's vocals play
    const line=LYRICS.lineAt(t); if(!line || !line.text) return;
    const W=cv.width, H=cv.height, px=(typeof dpr!=='undefined'?dpr:1), fam="px 'Glitch Goblin','Arial Black',sans-serif";
    const narrow=(W/px)<640;                                          // phone-ish viewport (CSS-px width)
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    let fs=H*(narrow?0.030:0.023);                                    // HALF the previous max height (a touch larger on phones)
    const maxW=(narrow?0.94:0.86)*W;                                  // phones may use more width before the line shrinks
    ctx.font=fs+fam;
    const m=ctx.measureText(line.text).width||1; if(m>maxW){ fs*=maxW/m; ctx.font=fs+fam; }   // keep it on one line
    const floorPx=(narrow?15:11)*px; if(fs<floorPx){ fs=floorPx; ctx.font=fs+fam; }            // readability floor (esp. mobile)
    const x=W*0.5, y=H - H*0.05, gb=fs*0.16;                          // glow scales with the (now smaller) text
    ctx.shadowColor='rgba(255,40,52,1)'; ctx.fillStyle='#e51d2a';     // red neon glow + bright core
    for(let i=0;i<3;i++){ ctx.shadowBlur=gb*(1+i*1.4); ctx.fillText(line.text, x, y); }
    ctx.shadowBlur=gb*0.5; ctx.fillStyle='#ff6670'; ctx.fillText(line.text, x, y);
    ctx.shadowBlur=0;      ctx.fillStyle='#ffe0e4'; ctx.fillText(line.text, x, y);
    ctx.shadowColor='transparent';
    ctx.restore();
  }

  function drawNukeFinale(state){
    const f=state && state.extractFlight; if(!f) return;
    const t=f.t||0, W=cv.width, H=cv.height, px=(typeof dpr!=='undefined'?dpr:1);
    const cx=W*0.5, groundY=H*0.66;
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    if(t < NUKE_T_TITLE_IN){
      // ---- bomb → impact → mushroom + growing white (peak at T_ANIM_END), then hold pure white until TITLE_IN ----
      let whiteA=0;
      if(t>=NUKE_T_IMPACT){
        if(t<NUKE_T_ANIM_END){ const g=smooth((t-NUKE_T_IMPACT)/(NUKE_T_ANIM_END-NUKE_T_IMPACT)); whiteA=Math.pow(g,2.4); }
        else whiteA=1;
      }
      if(whiteA<1){
        if(t<NUKE_T_IMPACT) drawBomb(cx, groundY, t, W, H, px);
        else { drawExplosion(cx, groundY, t, W, H, px); drawMushroom(cx, groundY, t, W, H, px); }
      }
      if(whiteA>0){ ctx.globalAlpha=whiteA; ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; }
    } else {
      // ---- t ≥ TITLE_IN: the STARLEFT logo is up. Hold full white (with the logo) until WHITE_FADE_START,
      //      THEN fade the white out to reveal the extraction panorama — the logo stays rendered over it. ----
      if(t >= NUKE_T_WHITE_FADE_START){
        drawExtractionPano(state);                                                // hub-city scene + distant nukes (behind the ULTRA tower)
        const wf=clamp(1-(t-NUKE_T_WHITE_FADE_START)/NUKE_WHITE_FADE,0,1);         // white fades out → reveals the scene
        if(wf>0){ ctx.globalAlpha=wf; ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; }
      } else {
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);                              // full-white hold (28→38) under the logo
      }
      drawTitle(t, W, H, px);
    }
    drawLyricSubtitle(state);     // neon-red song subtitle (bottom), synced to the music across the whole cinematic
    ctx.restore();
  }
  window.drawNukeFinale=drawNukeFinale;
})();
