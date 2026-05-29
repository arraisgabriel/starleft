/* main.js — bootstrap, loaded LAST. The ONLY file with top-level executing code: canvas sizing, event-listener registration, buildMapSelect(), and the requestAnimationFrame loop. */
addEventListener('resize',resize); resize();
cv.addEventListener('mousemove', e=>{
  mouse.sx=e.clientX; mouse.sy=e.clientY;
  if(!G) return;
  const w=screenToWorld(G,e.clientX,e.clientY); mouse.wx=w.x; mouse.wy=w.y;
  if(drag.active){ drag.cx=e.clientX; drag.cy=e.clientY; if(Math.hypot(drag.cx-drag.sx,drag.cy-drag.sy)>5) drag.moved=true; }
});

cv.addEventListener('mousedown', e=>{
  if(!G||G.over) return;
  if(e.clientY<VIEW_TOP||e.clientY>cv.height-VIEW_BOT) return;
  if(e.button===0){
    if(G.placing){
      const pc=G.placeCandidate;
      if(pc&&pc.ok){ placeBuilding(G,G.placing.type,pc.tx,pc.ty,G.placing.builder); }
      else toast('Cannot build there');
      G.placing=null; refreshUI();
      return;
    }
    drag.active=true; drag.sx=e.clientX; drag.sy=e.clientY; drag.cx=e.clientX; drag.cy=e.clientY; drag.moved=false;
  } else if(e.button===2){
    e.preventDefault();
    if(G.placing){ G.placing=null; refreshUI(); return; }
    rightClick(e);
  }
});

addEventListener('mouseup', e=>{
  if(!G) return;
  if(e.button===0 && drag.active){
    drag.active=false;
    if(drag.moved) boxSelect(e);
    else clickSelect(e);
  }
});

cv.addEventListener('contextmenu', e=>e.preventDefault());

addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.key==='Escape'){ if(G&&G.placing){ G.placing=null; refreshUI(); } return; }
  // control groups — digit keys 0..9 (also works from the numpad)
  if(G && !G.over && e.key.length===1 && e.key>='0' && e.key<='9'){
    if(e.ctrlKey || e.metaKey){ assignGroup(e.key); e.preventDefault(); }
    else if(!e.altKey){ recallGroup(e.key); e.preventDefault(); }
    return;
  }
});
addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
// minimap click to jump
mm.addEventListener('mousedown', e=>{
  if(!G) return;
  const rect=mm.getBoundingClientRect();
  const mx=(e.clientX-rect.left)/mm.width, my=(e.clientY-rect.top)/mm.height;
  const vw=cv.width, vh=cv.height-VIEW_TOP-VIEW_BOT;
  G.camX = mx*G.W*TILE - vw/2; G.camY=my*G.H*TILE - vh/2; clampCam(G);
  e.stopPropagation();
});

buildMapSelect();
/* =====================================================================
   MAIN LOOP
   ===================================================================== */
let last=performance.now();
let uiTick=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if(G){
    if(running && !G.over){ update(G,dt); }
    updateCamera(G,dt);
    render(G);
    uiTick+=dt; if(uiTick>0.2){ uiTick=0; if(running) refreshUI(); }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
