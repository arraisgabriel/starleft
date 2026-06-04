/* main.js — bootstrap, loaded LAST. The ONLY file with top-level executing code: canvas sizing, event-listener registration, buildMapSelect(), and the requestAnimationFrame loop. */
addEventListener('resize',resize); resize();
if(typeof initHudObservers==='function') initHudObservers();   // keep LNS stripe anchored flush above the bottom HUD as its height changes
addEventListener('orientationchange', ()=>resize());

/* ---------------------------------------------------------------------
   UNIFIED POINTER INPUT (mouse + touch). One gesture machine:
     tap   → dispatchTap (select / move / attack / gather / build / place)
     drag  → pan the map (one finger / left-drag)
     shift+drag or armed "Select box" → box-select
     2 fingers → pinch-zoom
   Desktop right-click is kept as a bonus command alias.
   --------------------------------------------------------------------- */
function gestureBegin(e){
  if(!G||G.over) return;
  if(typeof isGamePaused==='function' && isGamePaused()){
    e.preventDefault();
    return;
  }
  if(e.pointerType==='mouse') lastPointerWasMouse=true; else lastPointerWasMouse=false;
  // ignore presses on the HUD bands (CSS px)
  if(e.clientY<VIEW_TOP || e.clientY>cssH-VIEW_BOT) return;

  pointers.set(e.pointerId, {sx:e.clientX, sy:e.clientY});

  // second finger → pinch; cancel any in-progress tap/pan/box (no tap fires)
  if(pointers.size===2){
    gesture.mode='pinch'; gesture.id=null;
    const p=[...pointers.values()];
    gesture.lastDist=Math.hypot(p[0].sx-p[1].sx, p[0].sy-p[1].sy)||1;
    return;
  }
  if(pointers.size>2) return;

  // desktop right-button → command alias (or cancel placement), no drag gesture
  if(e.pointerType==='mouse' && e.button===2){
    e.preventDefault();
    if(G.placing){ G.placing=null; refreshUI(); }
    else dispatchTap(e,{forceCommand:true});
    gesture.mode='none'; gesture.id=null; return;
  }

  // primary press starts as a tap; promotes to pan/box on move
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  gesture.mode='tap'; gesture.id=e.pointerId;
  gesture.sx=gesture.cx=e.clientX; gesture.sy=gesture.cy=e.clientY;
  gesture.moved=false; gesture.shift=e.shiftKey;
  gesture.startCamX=G.camX; gesture.startCamY=G.camY;
  // seed mouse/world position so the placement ghost lands where you pressed
  mouse.sx=e.clientX; mouse.sy=e.clientY;
  const w=screenToWorld(G,e.clientX,e.clientY); mouse.wx=w.x; mouse.wy=w.y;
}

function gestureMove(e){
  if(!G) return;
  if(typeof isGamePaused==='function' && isGamePaused()) return;
  const p=pointers.get(e.pointerId); if(p){ p.sx=e.clientX; p.sy=e.clientY; }

  // keep mouse/world fresh for edge-scroll + placement ghost
  if(e.pointerType==='mouse' || gesture.id===e.pointerId){
    if(e.pointerType==='mouse'){ lastPointerWasMouse=true; mouse.onCanvas=true; }  // moving here ⇒ over the play canvas
    mouse.sx=e.clientX; mouse.sy=e.clientY;
    const w=screenToWorld(G,e.clientX,e.clientY); mouse.wx=w.x; mouse.wy=w.y;
  }

  if(gesture.mode==='pinch'){
    if(pointers.size>=2){
      const a=[...pointers.values()];
      const dist=Math.hypot(a[0].sx-a[1].sx, a[0].sy-a[1].sy)||1;
      const midX=(a[0].sx+a[1].sx)/2, midY=(a[0].sy+a[1].sy)/2;
      if(gesture.lastDist>0) zoomAt(G, midX, midY, dist/gesture.lastDist);
      gesture.lastDist=dist;
    }
    return;
  }

  if(e.pointerId!==gesture.id) return;
  gesture.cx=e.clientX; gesture.cy=e.clientY;
  if(gesture.mode==='tap' && Math.hypot(gesture.cx-gesture.sx, gesture.cy-gesture.sy)>MOVE_THRESH){
    gesture.moved=true;
    gesture.mode=(gesture.shift || armBoxSelect) ? 'box' : 'pan';
  }
  if(gesture.mode==='pan') panTo(e);
  // 'box' just records cx/cy; render draws the rectangle
}

function gestureEnd(e){
  if(!G){ pointers.delete(e.pointerId); return; }
  if(typeof isGamePaused==='function' && isGamePaused()){
    pointers.delete(e.pointerId);
    gesture.mode='none'; gesture.id=null; gesture.moved=false;
    return;
  }
  const wasPinch=gesture.mode==='pinch';
  pointers.delete(e.pointerId);
  if(wasPinch){ if(pointers.size<2){ gesture.mode='none'; gesture.id=null; } return; }
  if(e.pointerId!==gesture.id) return;
  try{ cv.releasePointerCapture(e.pointerId); }catch(_){}
  if(gesture.mode==='tap') dispatchTap(e);
  else if(gesture.mode==='box'){
    boxSelectRect(gesture.sx,gesture.sy,gesture.cx,gesture.cy, gesture.shift);
    armBoxSelect=false; updateBoxBtn();
  }
  gesture.mode='none'; gesture.id=null; gesture.moved=false;
}

cv.addEventListener('pointerdown', gestureBegin);
cv.addEventListener('pointermove', gestureMove);
addEventListener('pointerup', gestureEnd);
addEventListener('pointercancel', gestureEnd);
cv.addEventListener('contextmenu', e=>e.preventDefault());
// edge-scroll only runs while the pointer is over the play canvas. These boundary events fire
// when the cursor crosses onto the HUD bars or an overlay (all stacked above the canvas) and
// when it leaves the window — so the camera can't keep drifting once the pointer leaves the field.
cv.addEventListener('pointerenter', e=>{ if(e.pointerType==='mouse') mouse.onCanvas=true; });
cv.addEventListener('pointerleave', e=>{ if(e.pointerType==='mouse') mouse.onCanvas=false; });

// wheel zoom (desktop), anchored at the cursor
cv.addEventListener('wheel', e=>{
  if(!G||G.over) return;
  if(typeof isGamePaused==='function' && isGamePaused()){
    e.preventDefault();
    return;
  }
  e.preventDefault();
  zoomAt(G, e.clientX, e.clientY, e.deltaY<0 ? 1.1 : 1/1.1);
}, {passive:false});

addEventListener('keydown', e=>{
  if(typeof isGamePaused==='function' && isGamePaused()){
    if((e.key==='s'||e.key==='S') && (e.metaKey||e.ctrlKey)) e.preventDefault();
    else if(!e.metaKey && !e.ctrlKey && !e.altKey) e.preventDefault();
    return;
  }
  // only track UNMODIFIED keys for camera panning — a modified key (e.g. ⌘/Ctrl+S) is a shortcut,
  // and on macOS its keyup never fires while ⌘ is held, which would leave 's' stuck panning down.
  if(!e.metaKey && !e.ctrlKey && !e.altKey) keys[e.key.toLowerCase()]=true;
  if(e.key==='Escape'){
    if(G&&G.placing){ G.placing=null; refreshUI(); }     // first: cancel building placement
    else if(G&&G.selection.length){ clearSelection(); refreshUI(); }  // then: deselect so you can pick others
    return;
  }
  // save game (⌘/Ctrl+S) — block the browser's native Save dialog
  if((e.key==='s'||e.key==='S') && (e.metaKey||e.ctrlKey)){
    e.preventDefault(); saveGame(); return;
  }
  // control groups — digit keys 0..9 (top row or numpad), read via e.code so Shift's
  // symbol remap doesn't matter. ASSIGN = Shift+digit: Chrome reserves Ctrl/⌘+1-9 for
  // tab-switching and ignores the page's preventDefault, so those can't be used in-browser.
  // Ctrl/⌘ kept as a best-effort for browsers that still allow it. RECALL = plain digit.
  if(G && !G.over){
    const m = e.code && e.code.match(/^(?:Digit|Numpad)([0-9])$/);
    if(m){
      const g = m[1];
      if(e.shiftKey || e.ctrlKey || e.metaKey){ e.preventDefault(); assignGroup(g); }
      else if(!e.altKey){ e.preventDefault(); recallGroup(g); }
      return;
    }
  }
});
addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
// release all held keys when the window loses focus (⌘+Tab, ⌘+S dialog, etc.) so panning can't stick
addEventListener('blur', ()=>{ for(const k in keys) keys[k]=false; });
// minimap tap/click to jump
mm.addEventListener('pointerdown', e=>{
  if(!G) return;
  e.preventDefault();
  if(typeof isGamePaused==='function' && isGamePaused()){
    e.stopPropagation();
    return;
  }
  const rect=mm.getBoundingClientRect();
  const mx=(e.clientX-rect.left)/rect.width, my=(e.clientY-rect.top)/rect.height;
  const z=G.zoom||1, vw=viewW()/z, vh=viewH()/z;
  G.camX = mx*G.W*TILE - vw/2; G.camY=my*G.H*TILE - vh/2; clampCam(G);
  e.stopPropagation();
});

/* ---------------------------------------------------------------------
   On-screen touch controls (also usable with a mouse). All optional —
   guarded so the game still runs if a button is absent. Desktop keeps its
   keyboard shortcuts; these buttons mirror the touch-only affordances.
   --------------------------------------------------------------------- */
function updateBoxBtn(){
  const b=document.getElementById('btn-box');
  if(b) b.classList.toggle('armed', armBoxSelect);
}
/* ---- Fullscreen toggle (menu bottom-right + in-game top bar) ---- */
function fsActive(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFullscreen(){
  const el=document.documentElement;
  if(!fsActive()){
    const req=el.requestFullscreen||el.webkitRequestFullscreen||el.webkitRequestFullScreen;
    if(req){ const p=req.call(el); if(p&&p.catch) p.catch(()=>{}); }
  }else{
    const ex=document.exitFullscreen||document.webkitExitFullscreen;
    if(ex){ const p=ex.call(document); if(p&&p.catch) p.catch(()=>{}); }
  }
}
/* ---- Voices toggle (top-menu): reflect VOICE on/off on the button ---- */
function syncVoiceBtn(){
  const b=document.getElementById('btn-voice'); if(!b) return;
  const on = (typeof VOICE!=='undefined') ? VOICE.isEnabled() : true;
  b.innerHTML = on ? '🔊 Voices' : '🔇 Voices';
  b.classList.toggle('armed', on);
}
function syncFsButtons(){
  const on=fsActive();
  const top=document.getElementById('btn-fs'); if(top) top.innerHTML = on?'Windowed':'Fullscreen';
  const menu=document.getElementById('btn-fs-menu'); if(menu) menu.innerHTML = on?'⛶ Exit Fullscreen':'⛶ Fullscreen';
}
function syncPauseBtn(){
  const b=document.getElementById('btn-pause'); if(!b) return;
  const paused=!!(G && !G.over && !running);
  b.innerHTML=paused ? (netRole==='client' ? 'Paused' : 'Resume') : 'Pause';
  b.title=netRole==='client'
    ? (paused?'Paused by host':'Only the host can pause co-op')
    : (paused?'Resume game':'Pause game');
  b.classList.toggle('armed', paused);
}
function togglePause(){
  if(!G || G.over) return;
  if(netRole==='client'){ toast('Only the host can pause co-op'); return; }
  running=!running;
  if(!running && typeof resetInputState==='function') resetInputState();
  if(netRole==='host' && typeof mpHostSetPaused==='function') mpHostSetPaused(!running);
  syncPauseBtn();
  refreshUI();
  toast(running?'Game resumed':'Game paused');
}
document.addEventListener('fullscreenchange', syncFsButtons);
document.addEventListener('webkitfullscreenchange', syncFsButtons);
function wireTouchControls(){
  const on=(id,fn)=>{ const el=document.getElementById(id); if(el) el.addEventListener('click', fn); };
  on('btn-pause', togglePause);
  on('btn-fs', toggleFullscreen);
  on('btn-fs-menu', toggleFullscreen);
  on('btn-stop', ()=>{ if(typeof isGamePaused==='function' && isGamePaused()) return; if(G){ (typeof netStop==='function'?netStop:stopSelection)(); refreshUI(); } });
  on('btn-box', ()=>{ if(typeof isGamePaused==='function' && isGamePaused()) return; armBoxSelect=!armBoxSelect; updateBoxBtn(); toast(armBoxSelect?'Box select: drag to select':'Box select off'); });
  on('btn-army', ()=>{ if(typeof isGamePaused==='function' && isGamePaused()) return; selectAllArmy(); });
  on('btn-clear', ()=>{ if(typeof isGamePaused==='function' && isGamePaused()) return; if(G && G.selection.length){ clearSelection(); refreshUI(); } });   // Esc equivalent: drop the current selection
  on('btn-cancel', ()=>{ if(typeof isGamePaused==='function' && isGamePaused()) return; if(G&&G.placing){ G.placing=null; refreshUI(); } });
  on('btn-save', ()=>{ saveGame(); });
  on('btn-load', ()=>{
    const panel=document.getElementById('topmenu-panel'), btn=document.getElementById('btn-topmenu');
    if(panel) panel.style.display='none';
    if(btn){ btn.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }
    if(typeof openLoadMenu==='function') openLoadMenu();
  });
  on('btn-roster', ()=>{ if(typeof showRoster==='function') showRoster(); });
  on('btn-events', ()=>{ if(typeof showEvents==='function') showEvents(); });
  on('btn-voice', ()=>{ if(typeof VOICE!=='undefined'){ VOICE.toggle(); syncVoiceBtn(); } });
  on('btn-netq', ()=>{ if(typeof mpToggleNetQuality==='function') mpToggleNetQuality(); });
  syncVoiceBtn();   // reflect the persisted on/off state on the button label
  syncPauseBtn();
  if(typeof mpToggleNetQuality==='function') {
    mpToggleNetQuality(localStorage.getItem('starleft_show_net_quality')==='1');
  }
  // unified top-right menu: one button toggles a dropdown of News/Roster/Events/Save/Fullscreen
  (function wireTopMenu(){
    const wrap=document.getElementById('top-menu');
    const btn=document.getElementById('btn-topmenu');
    const panel=document.getElementById('topmenu-panel');
    if(!wrap||!btn||!panel) return;
    const close=()=>{ panel.style.display='none'; btn.classList.remove('open'); btn.setAttribute('aria-expanded','false'); };
    const open =()=>{ panel.style.display='flex'; btn.classList.add('open');    btn.setAttribute('aria-expanded','true');  };
    btn.addEventListener('click', e=>{ e.stopPropagation(); (panel.style.display==='flex')?close():open(); });
    // picking any item runs its own action then collapses the menu
    panel.querySelectorAll('.tc-btn').forEach(b=> b.addEventListener('click', close));
    // tap/click anywhere outside, or Esc, closes it
    document.addEventListener('click', e=>{ if(!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });
  })();
  on('btn-minimap', ()=>{ const mw=document.getElementById('minimap-wrap'); if(mw) mw.classList.toggle('as-overlay'); });
  // control-group chips: tap = recall, long-press = assign
  document.querySelectorAll('.grp-chip').forEach(el=>{
    const g=el.getAttribute('data-g'); let t=null, longed=false;
    const cancel=()=>{ if(t){ clearTimeout(t); t=null; } };
    el.addEventListener('pointerdown', ev=>{ ev.preventDefault(); longed=false; t=setTimeout(()=>{ longed=true; assignGroup(g); }, 500); });
    el.addEventListener('pointerup',   ev=>{ ev.preventDefault(); cancel(); if(!longed) recallGroup(g); });
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
  });
}
function wireBootGate(){
  const gate=document.getElementById('bootGate');
  const btn=document.getElementById('btn-simulate');
  if(!gate||!btn) return;
  const soundBtn=document.getElementById('btn-boot-sound');
  const syncSoundBtn=()=>{
    if(!soundBtn || typeof MUSIC==='undefined') return;
    const on=MUSIC.isEnabled();
    soundBtn.classList.toggle('is-muted', !on);
    soundBtn.textContent = '♪';
    soundBtn.setAttribute('aria-label', on ? 'Disable music' : 'Enable music');
    soundBtn.title = on ? 'Disable music' : 'Enable music';
  };
  gate.style.display='flex';
  syncSoundBtn();
  if(soundBtn){
    soundBtn.addEventListener('click', ev=>{
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof MUSIC!=='undefined') MUSIC.toggle();
      syncSoundBtn();
    });
  }
  btn.addEventListener('click', ()=>{
    gate.classList.add('hide');
    setTimeout(()=>{ gate.style.display='none'; }, 360);
    if(typeof MUSIC!=='undefined') MUSIC.startNow();
    if(typeof LNS!=='undefined' && LNS.relayout) LNS.relayout();
  }, { once:true });
}
wireTouchControls();

buildMapSelect();
startTipRotation();   // random rotating Field Tip in the menu panel
LNS.init();           // Live News Stream — menu + in-game RSS headline ticker
if(typeof MUSIC!=='undefined') MUSIC.init();   // main theme after 2s, then menu loop while in menu overlays
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{
    if(typeof syncHud==='function'){ syncHud(); if(G && typeof clampCam==='function') clampCam(G); }
    if(typeof LNS!=='undefined' && LNS.relayout) LNS.relayout();
  }).catch(()=>{});
}
wireBootGate();
if(typeof mpCheckInviteHash==='function') mpCheckInviteHash();   // #mp=CODE invite link → auto-join co-op
/* =====================================================================
   MAIN LOOP
   ===================================================================== */
let last=performance.now();
let uiTick=0;
let autoTick=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if(G){
    if(running && !G.over){
      if(netRole==='solo'){
        update(G,dt);                                              // single-player: rAF drives the sim
        autoTick+=dt; if(autoTick>60){ autoTick=0; autosaveGame(); }
      } else if(netRole==='host'){
        // host sim + snapshot broadcast run via the host-clock (real-time dt); the worker keeps them
        // going when this window is backgrounded and rAF stalls. rAF here just renders (below).
        if(typeof NET!=='undefined' && NET.hostRafStep) NET.hostRafStep();
      } else if(typeof NET!=='undefined'){
        NET.clientTick(dt);                                        // client: no sim, just local fog/visuals
      }
    }
    updateCamera(G,dt);
    render(G);
    if(typeof updateSprintRipple==='function') updateSprintRipple(G);   // glue the sprint ripple to its world point
    uiTick+=dt; if(uiTick>0.2){ uiTick=0; if(running) refreshUI(); }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
