/* muzzle-calibrator.js — standalone dev tool (loaded only by muzzle-calibrator.html, NOT
   by the game). Load a unit's attack.png, click the gun barrel tip to author a normalized
   muzzle (mx,my), tune the beam width, preview the in-game laser bolt firing from that
   exact muzzle, and export the MUZZLE table for js/muzzle_data.js.

   The frame box + flip math here is kept identical to assets.js blitFrame / muzzleWorld and
   the bolt renderer identical to render.js drawLaserBolt, so the preview matches the game. */
(function(){
  'use strict';

  const UNIT_FRAMES = 10;
  // drawn sprite heights — mirror of UNIT_SPRITE_H in assets.js (drives preview scale + width)
  const UNIT_SPRITE_H = { soldier:68, ranger:62, hustler:56, lobbyist:64, foodtruck:64, auditor:72, founder:92, bomber:96, nino:64 };
  const FACES_LEFT = { bomber:true };
  // units that actually have an attack strip (ranged ones matter; melee shown for completeness)
  const UNITS = ['ranger','lobbyist','foodtruck','auditor','founder','bomber','soldier','hustler','nino'];

  // ---- seed = the shipped js/muzzle_data.js values (units measured + buildings) ----
  const DATA = {
    ranger:   { mx:0.74, my:0.43, w:1.00 },
    lobbyist: { mx:0.84, my:0.42, w:1.05 },
    foodtruck:{ mx:0.76, my:0.50, w:1.10 },
    auditor:  { mx:0.72, my:0.40, w:1.30 },
    founder:  { mx:0.74, my:0.40, w:1.50 },
    bomber:   { mx:0.42, my:0.66, w:1.40 },
    soldier:  { mx:0.70, my:0.45, w:1.00 },
    hustler:  { mx:0.70, my:0.45, w:1.00 },
    nino:     { mx:0.84, my:0.42, w:1.05 },
  };
  const BUILDINGS = { hq:{ bx:0.50, by:0.12, w:1.00 }, turret:{ bx:0.50, by:0.06, w:1.10 } };
  const SEED = JSON.parse(JSON.stringify({ units:DATA, buildings:BUILDINGS }));

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const unitSel=$('unitSel'), frameRange=$('frameRange'), frameVal=$('frameVal'),
        mxVal=$('mxVal'), myVal=$('myVal'), wRange=$('wRange'), wVal=$('wVal'),
        frameCv=$('frameCv'), fcx=frameCv.getContext('2d'),
        previewCv=$('previewCv'), pcx=previewCv.getContext('2d'),
        out=$('out'), facesNote=$('facesNote'), hVal=$('hVal');

  let cur=UNITS[0], frame=4, side='red', charge=false, face=1;
  const sheets={};   // unit -> {img,fw,fh,ready}

  UNITS.forEach(u=>{ const o=document.createElement('option'); o.value=u; o.textContent=u; unitSel.appendChild(o); });

  function loadSheet(u){
    if(sheets[u]) return sheets[u];
    const s={img:new Image(), fw:0, fh:0, ready:false};
    s.img.onload=()=>{ s.fw=s.img.width/UNIT_FRAMES; s.fh=s.img.height; s.ready=true; };
    s.img.onerror=()=>{ s.ready=false; };
    s.img.src='assets/units/'+u+'/attack.png';
    sheets[u]=s; return s;
  }

  // ---- frame canvas: fit the selected frame, draw the muzzle crosshair ----
  function frameBox(s){
    const cw=frameCv.width, ch=frameCv.height;
    const sc=Math.min(cw/s.fw, ch/s.fh)*0.92;
    const dw=s.fw*sc, dh=s.fh*sc, dx=(cw-dw)/2, dy=(ch-dh)/2;
    return {dx,dy,dw,dh};
  }
  function drawFrame(){
    fcx.clearRect(0,0,frameCv.width,frameCv.height);
    const s=sheets[cur]; if(!s||!s.ready){ fcx.fillStyle='#7f93b3'; fcx.fillText('loading '+cur+'…',16,24); return; }
    const b=frameBox(s);
    fcx.imageSmoothingEnabled=false;
    fcx.drawImage(s.img, frame*s.fw,0,s.fw,s.fh, b.dx,b.dy,b.dw,b.dh);
    // frame border
    fcx.strokeStyle='rgba(120,160,220,.25)'; fcx.lineWidth=1; fcx.strokeRect(b.dx+.5,b.dy+.5,b.dw-1,b.dh-1);
    // crosshair at muzzle
    const d=DATA[cur]; const mx=b.dx+d.mx*b.dw, my=b.dy+d.my*b.dh;
    fcx.strokeStyle=side==='red'?'#ff5a47':'#5aa9ff'; fcx.lineWidth=1.5;
    fcx.beginPath(); fcx.moveTo(mx-10,my); fcx.lineTo(mx+10,my); fcx.moveTo(mx,my-10); fcx.lineTo(mx,my+10); fcx.stroke();
    fcx.beginPath(); fcx.arc(mx,my,4,0,6.283); fcx.stroke();
  }
  frameCv.addEventListener('click', ev=>{
    const s=sheets[cur]; if(!s||!s.ready) return;
    const r=frameCv.getBoundingClientRect();
    const cx=(ev.clientX-r.left)*(frameCv.width/r.width), cy=(ev.clientY-r.top)*(frameCv.height/r.height);
    const b=frameBox(s);
    const mx=(cx-b.dx)/b.dw, my=(cy-b.dy)/b.dh;
    if(mx<-0.05||mx>1.05||my<-0.05||my>1.05) return;
    DATA[cur].mx=Math.max(0,Math.min(1,mx)); DATA[cur].my=Math.max(0,Math.min(1,my));
    syncUI(); drawFrame(); buildExport();
  });

  // ---- bolt renderer (identical math to render.js drawLaserBolt) ----
  const _gc={};
  function _glow(red){ const k=red?'r':'b'; let c=_gc[k]; if(c) return c;
    const sz=64; c=document.createElement('canvas'); c.width=c.height=sz;
    const x=c.getContext('2d'), g=x.createRadialGradient(sz/2,sz/2,0,sz/2,sz/2,sz/2);
    g.addColorStop(0,'rgba(255,255,255,1)');
    if(red){ g.addColorStop(0.22,'rgba(255,228,212,0.95)'); g.addColorStop(0.5,'rgba(255,80,60,0.55)'); g.addColorStop(1,'rgba(255,60,45,0)'); }
    else   { g.addColorStop(0.22,'rgba(220,240,255,0.95)'); g.addColorStop(0.5,'rgba(90,175,255,0.55)'); g.addColorStop(1,'rgba(70,160,255,0)'); }
    x.fillStyle=g; x.fillRect(0,0,sz,sz); _gc[k]=c; return c;
  }
  function _blob(g,cx,cy,radius,alpha){ if(alpha<=0.01||radius<=0.3) return; pcx.globalAlpha=Math.min(1,alpha); pcx.drawImage(g,cx-radius,cy-radius,radius*2,radius*2); }
  function bolt(x0,y0,x1,y1,red,w,p,chg){
    const glow=_glow(red), outer=red?'255,70,55':'80,170,255', core=red?'255,232,218':'220,242,255';
    const ep=p*p*(3-2*p), hx=x0+(x1-x0)*ep, hy=y0+(y1-y0)*ep;
    const tp=Math.max(0,ep-0.34), lx=x0+(x1-x0)*tp, ly=y0+(y1-y0)*tp;
    const env=Math.max(0, Math.min(1,p/0.10)*Math.min(1,(1-p)/0.28)), W=w*(chg?1.5:1);
    pcx.save(); pcx.globalCompositeOperation='lighter'; pcx.lineCap='round'; pcx.lineJoin='round';
    if(env>0.02){ const L=[[W*3.4,'rgba('+outer+','+(0.14*env).toFixed(3)+')'],[W*1.9,'rgba('+outer+','+(0.30*env).toFixed(3)+')'],[W*1.0,'rgba('+core+','+(0.55*env).toFixed(3)+')'],[Math.max(1,W*0.45),'rgba(255,255,255,'+(0.92*env).toFixed(3)+')']];
      for(let i=0;i<L.length;i++){ pcx.strokeStyle=L[i][1]; pcx.lineWidth=L[i][0]; pcx.beginPath(); pcx.moveTo(lx,ly); pcx.lineTo(hx,hy); pcx.stroke(); } }
    _blob(glow,hx,hy,W*(chg?2.6:2.0)*Math.max(0.45,env),env*1.1);
    const mf=Math.max(0,(0.42-p)/0.42); _blob(glow,x0,y0,W*(chg?4.2:3.0)*(0.6+0.4*mf),mf);
    const im=Math.max(0,(p-0.74)/0.26); _blob(glow,x1,y1,W*(chg?3.4:2.6)*(0.5+0.5*im),im);
    pcx.restore(); pcx.globalAlpha=1;
  }

  // ---- preview loop ----
  let t0=null;
  function loop(ts){
    if(t0==null) t0=ts; const dt=(ts-t0)/1000;
    pcx.clearRect(0,0,previewCv.width,previewCv.height);
    pcx.fillStyle='#05070c'; pcx.fillRect(0,0,previewCv.width,previewCv.height);
    const s=sheets[cur];
    if(s&&s.ready){
      const S=UNIT_SPRITE_H[cur]||64, dw=S*(s.fw/s.fh), dh=S;
      const cx=Math.round(previewCv.width*0.30), cy=Math.round(previewCv.height*0.62);
      const facesLeft=!!FACES_LEFT[cur], flip=((face<0)!==facesLeft);
      // draw the unit frame (foot-anchored box, same as blitFrame)
      pcx.save(); pcx.translate(cx,cy); if(flip) pcx.scale(-1,1); pcx.imageSmoothingEnabled=false;
      pcx.drawImage(s.img, frame*s.fw,0,s.fw,s.fh, -dw/2,-dh*0.7,dw,dh); pcx.restore();
      // muzzle world (same as muzzleWorld)
      const d=DATA[cur]; let mlx=(d.mx-0.5)*dw; const mly=(d.my-0.7)*dh; if(flip) mlx=-mlx;
      const mX=cx+mlx, mY=cy+mly;
      // dummy target ahead of the muzzle, in facing direction
      const tX=cx+(face<0?-1:1)*Math.min(previewCv.width*0.4,170), tY=cy-dh*0.25;
      // target marker
      pcx.strokeStyle='rgba(127,147,179,.5)'; pcx.lineWidth=1; pcx.beginPath(); pcx.arc(tX,tY,9,0,6.283); pcx.stroke();
      // looping flight: 0.55s flight + 0.5s gap
      const cyc=1.05, lt=dt%cyc, p=Math.min(1,lt/0.55);
      const w=2.2*(S/64)*(DATA[cur].w||1);
      if(lt<0.6) bolt(mX,mY,tX,tY, side==='red', w, p, charge);
      // muzzle dot
      pcx.fillStyle=side==='red'?'rgba(255,90,71,.9)':'rgba(90,169,255,.9)'; pcx.beginPath(); pcx.arc(mX,mY,2.2,0,6.283); pcx.fill();
    }
    requestAnimationFrame(loop);
  }

  // ---- UI sync ----
  function syncUI(){
    const d=DATA[cur];
    mxVal.textContent=d.mx.toFixed(3); myVal.textContent=d.my.toFixed(3);
    wRange.value=d.w; wVal.textContent=(+d.w).toFixed(2);
    frameRange.value=frame; frameVal.textContent=frame;
    hVal.textContent=Math.round(UNIT_SPRITE_H[cur]||64);
    facesNote.textContent = FACES_LEFT[cur] ? 'Note: this unit is facesLeft — its source art faces LEFT; measure on the frame as shown.' : 'Source art faces right (default).';
  }
  function selectUnit(u){ cur=u; loadSheet(u); frame=4; const tryDraw=()=>{ if(sheets[u].ready){ syncUI(); drawFrame(); } else setTimeout(tryDraw,40); }; tryDraw(); buildExport(); }

  // ---- export ----
  function fmtU(u,d){ return '  '+(u+':').padEnd(10)+'{ mx:'+d.mx.toFixed(3)+', my:'+d.my.toFixed(3)+', w:'+(+d.w).toFixed(2)+' },'; }
  function fmtB(u,d){ return '  '+(u+':').padEnd(10)+'{ bx:'+d.bx.toFixed(2)+', by:'+d.by.toFixed(2)+', w:'+(+d.w).toFixed(2)+' },'; }
  function buildExport(){
    const order=['ranger','lobbyist','foodtruck','auditor','founder','bomber'];
    const extra=UNITS.filter(u=>!order.includes(u));
    let s='/* paste into js/muzzle_data.js (regenerated by muzzle-calibrator.html) */\n';
    s+='const MUZZLE = {\n  // ---- ranged units ----\n';
    order.forEach(u=>{ s+=fmtU(u,DATA[u])+'\n'; });
    s+='  // ---- other attack sprites (optional) ----\n';
    extra.forEach(u=>{ s+=fmtU(u,DATA[u])+'\n'; });
    s+='  // ---- defensive buildings (footprint-relative rooftop muzzle) ----\n';
    Object.keys(BUILDINGS).forEach(u=>{ s+=fmtB(u,BUILDINGS[u])+'\n'; });
    s+='};\nconst MUZZLE_FALLBACK = { mx:0.70, my:0.42, w:1.00 };\n';
    out.value=s;
  }

  // ---- events ----
  unitSel.addEventListener('change', e=>selectUnit(e.target.value));
  frameRange.addEventListener('input', e=>{ frame=+e.target.value; frameVal.textContent=frame; drawFrame(); });
  wRange.addEventListener('input', e=>{ DATA[cur].w=+e.target.value; wVal.textContent=(+e.target.value).toFixed(2); buildExport(); });
  $('sideSel').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return; side=b.dataset.side;
    [...e.currentTarget.children].forEach(c=>c.classList.toggle('on',c===b)); drawFrame(); });
  $('chargeChk').addEventListener('change', e=>{ charge=e.target.checked; });
  $('faceBtn').addEventListener('click', e=>{ face=-face; e.target.textContent='Facing: '+(face<0?'◀ left':'▶ right'); });
  $('resetBtn').addEventListener('click', ()=>{ if(SEED.units[cur]) DATA[cur]=JSON.parse(JSON.stringify(SEED.units[cur])); syncUI(); drawFrame(); buildExport(); });
  $('exportBtn').addEventListener('click', ()=>{ buildExport(); out.scrollIntoView({behavior:'smooth'}); });
  $('copyBtn').addEventListener('click', ()=>{ out.select(); try{ document.execCommand('copy'); }catch(_){}
    if(navigator.clipboard) navigator.clipboard.writeText(out.value).catch(()=>{});
    $('copyMsg').textContent='copied ✓'; setTimeout(()=>$('copyMsg').textContent='',1500); });
  // arrow-key nudge of the muzzle
  window.addEventListener('keydown', e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0) return;
    if(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    e.preventDefault(); const step=(e.shiftKey?0.005:0.001)*5; const d=DATA[cur];
    if(e.key==='ArrowLeft') d.mx=Math.max(0,d.mx-step); if(e.key==='ArrowRight') d.mx=Math.min(1,d.mx+step);
    if(e.key==='ArrowUp') d.my=Math.max(0,d.my-step); if(e.key==='ArrowDown') d.my=Math.min(1,d.my+step);
    syncUI(); drawFrame(); buildExport();
  });

  // ---- go ----
  selectUnit(UNITS[0]); buildExport(); requestAnimationFrame(loop);
})();
