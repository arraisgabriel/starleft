/* input.js — input handler FUNCTIONS (selection, right-click commands, control groups, camera). Listeners are registered in main.js. */
/* =====================================================================
   INPUT
   ===================================================================== */
const mouse={ sx:0, sy:0, wx:0, wy:0, edge:{l:0,r:0,u:0,d:0}, overHud:false };
let edgeTopHold=0;           // seconds the cursor has dwelt in the TOP edge band
const EDGE_TOP_DELAY=1.5;    // wait this long before the top edge starts panning up — keeps the
                            // top-bar (and its drop-down menu) easy to reach without yanking the view
const keys={};

// ---- Unified pointer gesture state (mouse + touch via Pointer Events) ----
const pointers=new Map();      // pointerId -> {sx,sy} live CSS px (for pinch)
const gesture={ mode:'none',   // 'none'|'tap'|'pan'|'box'|'pinch'
  id:null, sx:0,sy:0, cx:0,cy:0, moved:false, shift:false,
  startCamX:0, startCamY:0, lastDist:0 };
let armBoxSelect=false;         // armed by the on-screen "Select box" button (touch)
let lastPointerWasMouse=true;   // gates desktop-only edge-scroll
const MOVE_THRESH=5;            // px before a press counts as a drag (not a tap)

// screen (CSS px) -> world, generalised for zoom. devicePixelRatio cancels out
// because pointer events already report CSS pixels. At zoom=1 this matches the
// original `sx+camX / sy-VIEW_TOP+camY`.
function screenToWorld(state, sx, sy){
  const z=state.zoom||1;
  return { x: state.camX + sx/z, y: state.camY + (sy - VIEW_TOP)/z };
}

// Cmd (⌘) or Shift while clicking/dragging aggregates onto the current selection
// instead of replacing it. (Ctrl is avoided — macOS turns Ctrl+click into a right-click.)
function isAdditive(e){ return !!(e.shiftKey || e.metaKey); }

// Select the entity at world point w (or aggregate it when additive). Used for the
// ⌘/Shift+tap path and for plain inspection taps (enemy/neutral with no army selected).
function clickSelectAt(state, w, e){
  const ent=pickEntity(state,w.x,w.y);
  if(isAdditive(e) && state.selection.length){
    if(ent && ent.kind==='unit' && ent.owner==='player'){
      if(ent.selected){ ent.selected=false; state.selection=state.selection.filter(s=>s!==ent); }
      else { ent.selected=true; state.selection.push(ent); }
    }
    refreshUI(); return;
  }
  clearSelection();
  if(ent && ent.type!=='goldmine'){ ent.selected=true; state.selection=[ent]; }
  refreshUI();
}

// THE unified single-tap/click action. Decides SELECT vs COMMAND *before* calling
// commandUnits (which would otherwise walk the army onto a friendly unit you meant
// to reselect, via its move fall-through).
function dispatchTap(e, opts){
  opts=opts||{};
  const w=screenToWorld(G, e.clientX, e.clientY);

  // building placement always wins (tap to place). Recompute the tile from the tap
  // point itself (not the render ghost) so it is correct on touch, where there is
  // no hover to keep placeCandidate fresh.
  if(G.placing){
    const def=G.placing.def;
    const tx=Math.floor(w.x/TILE - (def.w-1)/2 + 0.0001);
    const ty=Math.floor(w.y/TILE - (def.h-1)/2 + 0.0001);
    if(canPlaceAt(G,G.placing.type,tx,ty) && G.gold>=def.cost) placeBuilding(G,G.placing.type,tx,ty,G.placing.builder);
    else toast('Cannot build there');
    G.placing=null; refreshUI(); return;
  }

  const ent=pickEntity(G,w.x,w.y);

  // desktop right-click bonus alias — behaves exactly like the old right-click command
  if(opts.forceCommand){
    let target=ent;
    if(ent && ent.kind && ent.owner==='enemy' && !isVisiblePix(G,ent.x,ent.y)) target=null;
    commandUnits(G, w.x, w.y, target); return;
  }

  if(isAdditive(e)){ clickSelectAt(G,w,e); return; }   // ⌘/Shift+tap aggregates

  const friendlyFinished = ent && ent.owner==='player' &&
        (ent.kind==='unit' || (ent.kind==='building' && !ent.constructing));
  const canCommand = G.selection.some(s=>!s.dead && s.owner==='player' && (s.kind==='unit'||s.kind==='building'));

  // tapping your own finished unit/building reselects it (never move-onto-friendly)
  if(friendlyFinished){
    clearSelection(); ent.selected=true; G.selection=[ent]; refreshUI(); return;
  }

  // command targets: enemy → attack, goldmine → gather, unfinished friendly → build-assist, empty → move
  const isEnemy=ent && ent.owner && ent.owner!=='player';
  const isGold=ent && ent.type==='goldmine';
  const isConstructing=ent && ent.kind==='building' && ent.owner==='player' && ent.constructing;
  if(canCommand && (isEnemy || isGold || isConstructing || !ent)){
    let target=ent;
    if(isEnemy && !isVisiblePix(G,ent.x,ent.y)) target=null;
    commandUnits(G, w.x, w.y, target); return;
  }

  // nothing to command — inspect what's there (or clear)
  clickSelectAt(G,w,e);
}

// Box select from a screen-space rectangle (corners in CSS px). Replaces the old
// drag.* box; corners convert through screenToWorld so it is zoom/DPR-correct.
function boxSelectRect(x0,y0,x1,y1, additive){
  const a=screenToWorld(G, Math.min(x0,x1), Math.min(y0,y1));
  const b=screenToWorld(G, Math.max(x0,x1), Math.max(y0,y1));
  const inBox=G.entities.filter(en=>!en.dead&&en.kind==='unit'&&en.owner==='player'&&en.x>=a.x&&en.x<=b.x&&en.y>=a.y&&en.y<=b.y);
  if(additive && G.selection.length){
    inBox.forEach(u=>{ if(!u.selected){ u.selected=true; G.selection.push(u); } });
    refreshUI(); return;
  }
  clearSelection();
  let sel=inBox;
  if(!sel.length){
    const bld=G.entities.find(en=>!en.dead&&en.kind==='building'&&en.owner==='player'&&en.x>=a.x-20&&en.x<=b.x+20&&en.y>=a.y-20&&en.y<=b.y+20);
    if(bld) sel=[bld];
  }
  sel.forEach(s=>s.selected=true); G.selection=sel;
  refreshUI();
}

// Select every living player unit — the touch-friendly "grab the army" button.
function selectAllArmy(){
  if(!G) return;
  clearSelection();
  const army=G.entities.filter(e=>!e.dead && e.kind==='unit' && e.owner==='player');
  army.forEach(u=>u.selected=true); G.selection=army;
  refreshUI();
}

// Zoom toward a screen anchor (cursor / pinch centroid / button = screen centre),
// keeping the world point under the anchor fixed.
function zoomAt(state, sx, sy, factor){
  const b=screenToWorld(state, sx, sy);
  state.zoom=Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom*factor));
  state.camX=b.x - sx/state.zoom;
  state.camY=b.y - (sy-VIEW_TOP)/state.zoom;
  clampCam(state);
  const w=screenToWorld(state, mouse.sx, mouse.sy); mouse.wx=w.x; mouse.wy=w.y; // keep ghost glued
}

// Pan by dragging — content follows the finger, so the camera moves opposite the
// drag. Deltas come through screenToWorld (vs the camera captured at pan start) so
// they stay correct under any zoom without hardcoding the scale factor.
function panTo(e){
  const ref={ camX:gesture.startCamX, camY:gesture.startCamY, zoom:G.zoom };
  const a=screenToWorld(ref, gesture.sx, gesture.sy);
  const b=screenToWorld(ref, e.clientX, e.clientY);
  G.camX=gesture.startCamX - (b.x - a.x);
  G.camY=gesture.startCamY - (b.y - a.y);
  clampCam(G);
}

function pickEntity(state,wx,wy){
  // units first (topmost), then buildings, then goldmine
  let best=null,bd=1e9;
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.kind==='unit'){
      if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) continue;
      // hit-test the whole VISIBLE sprite box (head→feet), not the small collision r
      const hb=unitHitBox(e);
      if(wx>=hb.cx-hb.hw && wx<=hb.cx+hb.hw && wy>=hb.top && wy<=hb.bot){
        const d=Math.hypot(e.x-wx, (hb.top+hb.bot)/2-wy); if(d<bd){ bd=d; best=e; }
      }
    }
  }
  if(best) return best;
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.kind==='building'){
      const px=e.tx*TILE,py=e.ty*TILE,w=e.w*TILE,h=e.h*TILE;
      if(wx>=px&&wx<=px+w&&wy>=py&&wy<=py+h){
        if(e.owner==='enemy'&&!isVisiblePix(state,e.x,e.y)&&!e._everSeen) continue;
        return e;
      }
    }
  }
  for(const e of state.entities){
    if(e.dead||e.type!=='goldmine')continue;
    // hit-test the whole 3x3 footprint (matches the visible rock), not a small center
    // circle — so it's easy to right-click anywhere on the rock to assign Interns to mine.
    const N=FEAT_SIZE, ftx=(e.ftx!=null)?e.ftx:(((e.x/TILE)|0)-(N>>1)), fty=(e.fty!=null)?e.fty:(((e.y/TILE)|0)-(N>>1));
    const px=ftx*TILE, py=fty*TILE, w=N*TILE;
    if(wx>=px&&wx<=px+w&&wy>=py&&wy<=py+w) return e;
  }
  return null;
}

function clearSelection(){ G.selection.forEach(s=>s.selected=false); G.selection=[]; }

/* ---------- Control groups (Ctrl/Cmd + 0-9 assign, 0-9 recall) ---------- */
function assignGroup(g){
  if(!G) return;
  const members = G.selection.filter(s=>!s.dead && s.owner==='player');
  const mset = new Set(members);
  // a unit belongs to at most ONE group — pull these members out of every other group first,
  // so re-assigning to a new slot moves them rather than duplicating their membership.
  for(const k in G.groups){ if(k!==g) G.groups[k]=G.groups[k].filter(s=>!mset.has(s)); }
  G.groups[g] = members.slice();          // bind the selection (and only it) to g
  // retag badges: drop g from everyone, then make g each member's SOLE group
  for(const e of G.entities){ if(e._groups instanceof Set) e._groups.delete(g); }
  members.forEach(s=>{ s._groups=new Set([g]); });
  toast(members.length ? ('Control group '+g+' set — '+members.length+' unit'+(members.length>1?'s':''))
                       : ('Control group '+g+' cleared'));
}
function recallGroup(g){
  if(!G) return;
  const members = (G.groups[g]||[]).filter(s=>!s.dead && s.owner==='player');
  G.groups[g] = members;                  // prune any that died
  if(!members.length) return;
  clearSelection();
  members.forEach(s=>s.selected=true);
  G.selection = members.slice();
  // double-tap the same number to snap the camera onto the group
  const now = (typeof performance!=='undefined' && performance.now) ? performance.now() : 0;
  if(G._lastGrpKey===g && (now-(G._lastGrpTime||0))<350) centerOnSelection();
  G._lastGrpKey=g; G._lastGrpTime=now;
  refreshUI();
}
function centerOnSelection(){
  const sel=G.selection.filter(s=>!s.dead); if(!sel.length) return;
  let x=0,y=0; sel.forEach(s=>{x+=s.x;y+=s.y;}); x/=sel.length; y/=sel.length;
  const z=G.zoom||1, vw=viewW()/z, vh=viewH()/z;
  G.camX = x - vw/2; G.camY = y - vh/2; clampCam(G);
}


// edge + key scroll
function updateCamera(state,dt){
  const spd=620*dt;
  let dx=0,dy=0;
  if(keys['a']||keys['arrowleft']) dx-=spd;
  if(keys['d']||keys['arrowright']) dx+=spd;
  if(keys['w']||keys['arrowup']) dy-=spd;
  if(keys['s']||keys['arrowdown']) dy+=spd;
  // edge-scroll is desktop-only — on touch the one-finger drag pans instead.
  // While the cursor is over the HUD (top bar / its menu) we suppress edge-scroll entirely
  // so reaching the top-right menu — or hovering its open dropdown — never moves the view.
  if(lastPointerWasMouse && !mouse.overHud){
    const m=18, vw=viewW(), vh=cv.height/dpr;
    if(mouse.sx<m) dx-=spd;
    if(mouse.sx>vw-m) dx+=spd;
    // TOP edge: require a short dwell first. A quick reach toward the top bar passes
    // through in well under EDGE_TOP_DELAY, so it no longer yanks the camera up.
    if(mouse.sy<m+VIEW_TOP && mouse.sy>0){
      edgeTopHold+=dt;
      if(edgeTopHold>=EDGE_TOP_DELAY) dy-=spd;
    } else { edgeTopHold=0; }
    if(mouse.sy>vh-m) dy+=spd;
  } else { edgeTopHold=0; }
  state.camX+=dx; state.camY+=dy; clampCam(state);
}

