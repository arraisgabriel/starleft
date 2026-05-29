/* input.js — input handler FUNCTIONS (selection, right-click commands, control groups, camera). Listeners are registered in main.js. */
/* =====================================================================
   INPUT
   ===================================================================== */
const mouse={ sx:0, sy:0, wx:0, wy:0, edge:{l:0,r:0,u:0,d:0} };
const drag={ active:false, sx:0,sy:0,cx:0,cy:0, moved:false };
const keys={};

function screenToWorld(state, sx, sy){
  return { x: sx + state.camX, y: sy - VIEW_TOP + state.camY };
}

// Cmd (⌘) or Shift while clicking/dragging aggregates onto the current selection
// instead of replacing it. (Ctrl is avoided — macOS turns Ctrl+click into a right-click.)
function isAdditive(e){ return !!(e.shiftKey || e.metaKey); }

function clickSelect(e){
  const w=screenToWorld(G,e.clientX,e.clientY);
  const ent=pickEntity(G,w.x,w.y);

  if(isAdditive(e) && G.selection.length){
    // aggregate: toggle a player unit in/out of the existing selection
    if(ent && ent.kind==='unit' && ent.owner==='player'){
      if(ent.selected){ ent.selected=false; G.selection=G.selection.filter(s=>s!==ent); }
      else { ent.selected=true; G.selection.push(ent); }
    }
    // clicking empty ground / an enemy / a building while aggregating leaves the selection intact
    refreshUI();
    return;
  }

  clearSelection();
  if(ent && ent.type!=='goldmine'){ ent.selected=true; G.selection=[ent]; }
  refreshUI();
}

function boxSelect(e){
  const a=screenToWorld(G, Math.min(drag.sx,drag.cx), Math.min(drag.sy,drag.cy));
  const b=screenToWorld(G, Math.max(drag.sx,drag.cx), Math.max(drag.sy,drag.cy));
  // player units inside the box
  const inBox=G.entities.filter(en=>!en.dead&&en.kind==='unit'&&en.owner==='player'&&en.x>=a.x&&en.x<=b.x&&en.y>=a.y&&en.y<=b.y);

  if(isAdditive(e) && G.selection.length){
    // aggregate the boxed units onto the current selection (no duplicates)
    inBox.forEach(u=>{ if(!u.selected){ u.selected=true; G.selection.push(u); } });
    refreshUI();
    return;
  }

  clearSelection();
  let sel=inBox;
  if(!sel.length){
    // maybe a building
    const bld=G.entities.find(en=>!en.dead&&en.kind==='building'&&en.owner==='player'&&en.x>=a.x-20&&en.x<=b.x+20&&en.y>=a.y-20&&en.y<=b.y+20);
    if(bld) sel=[bld];
  }
  sel.forEach(s=>s.selected=true); G.selection=sel;
  refreshUI();
}

function rightClick(e){
  const w=screenToWorld(G,e.clientX,e.clientY);
  const tgt=pickEntity(G,w.x,w.y);
  // only react to visible targets
  let target=tgt;
  if(tgt && tgt.kind && tgt.owner==='enemy' && !isVisiblePix(G,tgt.x,tgt.y)) target=null;
  commandUnits(G, w.x, w.y, target);
}

function pickEntity(state,wx,wy){
  // units first (topmost), then buildings, then goldmine
  let best=null,bd=1e9;
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.kind==='unit'){
      if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) continue;
      const d=Math.hypot(e.x-wx,e.y-wy); if(d<e.r+4&&d<bd){bd=d;best=e;}
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
    if(Math.hypot(e.x-wx,e.y-wy)<20) return e;
  }
  return null;
}

function clearSelection(){ G.selection.forEach(s=>s.selected=false); G.selection=[]; }

/* ---------- Control groups (Ctrl/Cmd + 0-9 assign, 0-9 recall) ---------- */
function assignGroup(g){
  if(!G) return;
  const members = G.selection.filter(s=>!s.dead && s.owner==='player');
  G.groups[g] = members.slice();          // replace whatever was bound to g
  // tag entities so we can draw their group badge
  for(const e of G.entities){ if(e._groups) e._groups.delete(g); }
  members.forEach(s=>{ (s._groups || (s._groups=new Set())).add(g); });
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
  const vw=cv.width, vh=cv.height-VIEW_TOP-VIEW_BOT;
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
  const m=18;
  if(mouse.sx<m) dx-=spd;
  if(mouse.sx>cv.width-m) dx+=spd;
  if(mouse.sy<m+VIEW_TOP && mouse.sy>0) dy-=spd;
  if(mouse.sy>cv.height-m) dy+=spd;
  state.camX+=dx; state.camY+=dy; clampCam(state);
}

