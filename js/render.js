/* render.js — fog (computeFog/isVisiblePix) + all canvas drawing: render, drawTile/Unit/Building, minimap, camera clamp, VIEW_TOP/BOT. */
/* =====================================================================
   FOG OF WAR
   ===================================================================== */
function computeFog(state){
  state.visible.fill(0);
  const W=state.W,H=state.H;
  for(const e of state.entities){
    if(e.dead||e.owner!=='player') continue;
    const sight=e.sight||5;
    const cx=(e.x/TILE)|0, cy=(e.y/TILE)|0;
    const s2=sight*sight;
    for(let y=-sight;y<=sight;y++)for(let x=-sight;x<=sight;x++){
      if(x*x+y*y>s2) continue;
      const nx=cx+x, ny=cy+y;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      state.visible[ny*W+nx]=1; state.explored[ny*W+nx]=1;
    }
  }
}
function isVisiblePix(state,x,y){
  const tx=(x/TILE)|0, ty=(y/TILE)|0;
  if(tx<0||ty<0||tx>=state.W||ty>=state.H) return false;
  return state.visible[ty*state.W+tx]===1;
}

/* =====================================================================
   RENDERING
   ===================================================================== */
function resize(){ cv.width=innerWidth; cv.height=innerHeight; }

const VIEW_TOP=46, VIEW_BOT=150;

function clampCam(state){
  const vw=cv.width, vh=cv.height-VIEW_TOP-VIEW_BOT;
  state.camX=Math.max(-40,Math.min(state.W*TILE - vw +40, state.camX));
  state.camY=Math.max(-40,Math.min(state.H*TILE - vh +40, state.camY));
}

function render(state){
  ctx.fillStyle='#05080d'; ctx.fillRect(0,0,cv.width,cv.height);
  const vx=state.camX, vy=state.camY;
  // snap the world offset to whole pixels so tiles land on exact pixel
  // boundaries — fractional offsets anti-alias tile edges and leave a seam grid
  const ox=Math.round(-vx), oy=Math.round(-vy)+VIEW_TOP;

  const x0=Math.max(0,(vx/TILE)|0), y0=Math.max(0,(vy/TILE)|0);
  const x1=Math.min(state.W, ((vx+cv.width)/TILE|0)+1);
  const y1=Math.min(state.H, ((vy+cv.height)/TILE|0)+1);

  // ---- terrain ----
  for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
    if(!state.explored[ty*state.W+tx]) continue;
    drawTile(state,tx,ty, tx*TILE+ox, ty*TILE+oy);
  }

  // ---- gold mines ----
  for(const e of state.entities){
    if(e.dead||e.type!=='goldmine') continue;
    if(!state.explored[((e.y/TILE)|0)*state.W+((e.x/TILE)|0)]) continue;
    drawGoldmine(e, e.x+ox, e.y+oy);
  }

  // ---- buildings ----
  for(const e of state.entities){
    if(e.dead||e.kind!=='building') continue;
    const vis = e.owner==='player' || isVisiblePix(state,e.x,e.y) || (e.owner==='enemy'&&state.explored[((e.y/TILE)|0)*state.W+((e.x/TILE)|0)] && !isVisiblePix(state,e.x,e.y) && e._everSeen);
    if(e.owner==='enemy'){ if(isVisiblePix(state,e.x,e.y)) e._everSeen=true; if(!e._everSeen) continue; if(!isVisiblePix(state,e.x,e.y)){ drawBuilding(state,e,ox,oy,true); continue; } }
    drawBuilding(state,e,ox,oy,false);
  }

  // ---- units (only visible enemies) ----
  for(const e of state.entities){
    if(e.dead||e.kind!=='unit') continue;
    if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y)) continue;
    drawUnit(state,e,ox,oy);
  }

  // ---- shoot FX ----
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.shootFx && e.shootFx.t>0){
      ctx.strokeStyle = isRedSide(e.owner)? 'rgba(255,150,120,.85)':'rgba(150,220,255,.8)';
      ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(e.x+ox,e.y+oy); ctx.lineTo(e.shootFx.x+ox,e.shootFx.y+oy); ctx.stroke();
      e.shootFx.t-=1/60;
    }
  }

  // ---- fog overlay ----
  drawFog(state,ox,oy,x0,y0,x1,y1);

  // ---- placement ghost ----
  if(state.placing){ drawPlacement(state,ox,oy); }

  // ---- selection ring effects ----
  drawRings(ox,oy);

  // ---- drag selection box ----
  if(drag.active){
    ctx.strokeStyle='rgba(120,220,160,.9)'; ctx.fillStyle='rgba(120,220,160,.12)';
    const x=Math.min(drag.sx,drag.cx), y=Math.min(drag.sy,drag.cy);
    const w=Math.abs(drag.cx-drag.sx), h=Math.abs(drag.cy-drag.sy);
    ctx.fillRect(x,y,w,h); ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,h);
  }

  renderMinimap(state);
}

function drawTile(state,tx,ty,px,py){
  const i=ty*state.W+tx;
  const t=state.tiles[i], b=state.biome[i], v=state.variant[i];

  // ---- atlas path: each terrain maps to one cell that includes its own
  //      ground, so the whole 32px tile is a single blit (1px overscan to
  //      hide seams). Any undefined slot falls through to procedural below. ----
  const slot = t===T_WATER?'water' : t===T_ROCK?'rock' : t===T_TREE?'tree' : 'floor';
  if(b===B_DESERT){ const im=desertTile(slot); if(im){ ctx.drawImage(im,0,0,im.naturalWidth,im.naturalHeight, px,py, TILE+1, TILE+1); return; } }
  const r = spriteFor(b, slot);
  if(r){ ctx.drawImage(ATLAS_IMG, r[0],r[1],r[2],r[3], px,py, TILE+1, TILE+1); return; }

  // ---- procedural fallback ----
  if(t===T_WATER){ drawWaterTile(state,b,v,px,py); return; }
  const P = BIOME_PAL[b] || BIOME_PAL[B_GRASS];
  ctx.fillStyle = (t===T_DIRT) ? P.dirt : (v>0.5 ? P.b : P.a);
  ctx.fillRect(px,py,TILE+1,TILE+1);   // drawn 1px larger so neighbours overlap
  drawFloorDeco(state,b,v,px,py);
  if(t===T_ROCK) drawRockTile(b,v,px,py);
  else if(t===T_TREE) drawTreeTile(b,v,px,py);
}

// Per-biome floor texture. Deterministic from the tile's `variant` so it never
// flickers; volcanic lava cracks pulse with state.time.
function drawFloorDeco(state,b,v,px,py){
  switch(b){
    case B_TECH: {                                  // panel grid + glow rivets
      ctx.strokeStyle='rgba(90,150,200,.16)'; ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(px+0.5,py); ctx.lineTo(px+0.5,py+TILE);
      ctx.moveTo(px,py+0.5); ctx.lineTo(px+TILE,py+0.5); ctx.stroke();
      if(v>0.82){ ctx.fillStyle='rgba(90,210,255,.55)'; ctx.fillRect(px+TILE/2-1,py+TILE/2-1,2,2); }
      else if(v<0.12){ ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(px+4,py+4,TILE-8,TILE-8); }
      break;
    }
    case B_DESERT: {                                // dune ripple + grains
      ctx.strokeStyle='rgba(150,120,70,.25)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px+2,py+(6+v*18));
      ctx.quadraticCurveTo(px+TILE/2,py+(2+v*16),px+TILE-2,py+(8+v*14)); ctx.stroke();
      if(v>0.9){ ctx.fillStyle='#8d7647'; ctx.fillRect(px+((v*22)|0)%22+4,py+12,2,2); }
      break;
    }
    case B_ICE: {                                   // sparkles + hairline cracks
      if(v>0.8){ ctx.fillStyle='rgba(255,255,255,.6)'; ctx.fillRect(px+((v*20)|0)%18+5,py+((v*16)|0)%14+5,2,2); }
      ctx.strokeStyle='rgba(120,150,170,.30)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px+v*TILE,py); ctx.lineTo(px+TILE*0.5,py+TILE*0.5); ctx.stroke();
      break;
    }
    case B_VOLCANIC: {                              // glowing lava cracks (animated)
      if(v>0.62){
        const g=0.5+0.5*Math.sin(state.time*2.2+v*12);
        ctx.strokeStyle='rgba(255,'+((90+90*g)|0)+',30,'+(0.45+0.3*g).toFixed(2)+')';
        ctx.lineWidth=2; ctx.beginPath();
        ctx.moveTo(px+3,py+v*TILE); ctx.lineTo(px+TILE*0.5,py+TILE*0.5);
        ctx.lineTo(px+TILE-3,py+(1-v)*TILE); ctx.stroke();
      } else if(v<0.2){ ctx.fillStyle='rgba(255,255,255,.03)'; ctx.fillRect(px+6,py+6,4,4); }
      break;
    }
    default: {                                      // grass / mountain speckle
      if(v>0.85){ ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(px+((v*24)|0)%24, py+((v*18)|0)%18, 3,3); }
      else if(b===B_GRASS && v<0.08){ ctx.fillStyle='rgba(120,170,90,.10)'; ctx.beginPath(); ctx.arc(px+TILE/2,py+TILE/2,5,0,6.28); ctx.fill(); }
    }
  }
}

function drawWaterTile(state,b,v,px,py){
  if(b===B_VOLCANIC){                               // lava lake
    ctx.fillStyle='#5a1606'; ctx.fillRect(px,py,TILE+1,TILE+1);
    const g=0.5+0.5*Math.sin(state.time*1.8+v*10+px*0.05);
    ctx.fillStyle='rgba(255,'+((80+120*g)|0)+',20,.9)'; ctx.fillRect(px+2,py+2,TILE-3,TILE-3);
    ctx.fillStyle='rgba(255,225,120,'+(0.3+0.5*g).toFixed(2)+')'; ctx.fillRect(px+((v*16)|0),py+8,8,3);
    return;
  }
  if(b===B_ICE){                                    // frozen-over water
    ctx.fillStyle= v>0.5?'#9fc4d8':'#aacfe0'; ctx.fillRect(px,py,TILE+1,TILE+1);
    ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(px+v*TILE,py); ctx.lineTo(px+TILE*0.5,py+TILE); ctx.stroke();
    return;
  }
  ctx.fillStyle= v>0.5? '#1d4f73':'#1a466a'; ctx.fillRect(px,py,TILE+1,TILE+1);
  const sh=0.5+0.5*Math.sin(state.time*1.4 + v*8 + py*0.04);   // gentle shimmer
  ctx.fillStyle='rgba(255,255,255,'+(0.03+0.05*sh).toFixed(3)+')';
  ctx.fillRect(px+((v*20)|0), py+8, 10, 2);
}

function drawRockTile(b,v,px,py){
  let light='#5b626c', dark='#393e45';
  if(b===B_VOLCANIC){ light='#5a3a30'; dark='#2a1c18'; }
  else if(b===B_ICE){ light='#cde0ea'; dark='#90a8b6'; }
  else if(b===B_DESERT){ light='#b89a64'; dark='#8a6f43'; }
  else if(b===B_MOUNTAIN){ light='#7b7268'; dark='#4d463f'; }
  ctx.fillStyle=dark; ctx.fillRect(px+4,py+22,24,8);
  ctx.fillStyle=light; ctx.beginPath();
  ctx.moveTo(px+6,py+24); ctx.lineTo(px+12,py+8); ctx.lineTo(px+20,py+14); ctx.lineTo(px+26,py+24); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.10)'; ctx.beginPath();
  ctx.moveTo(px+12,py+8); ctx.lineTo(px+15,py+14); ctx.lineTo(px+20,py+14); ctx.closePath(); ctx.fill();
  if(b===B_VOLCANIC){ ctx.fillStyle='rgba(255,110,30,.5)'; ctx.fillRect(px+11,py+18,5,2); }
}

function drawTreeTile(b,v,px,py){
  if(b===B_DESERT){                                 // cactus
    ctx.fillStyle='#3f7a4a'; ctx.fillRect(px+14,py+10,4,16);
    ctx.fillRect(px+9,py+15,4,3); ctx.fillRect(px+9,py+12,3,6);
    ctx.fillRect(px+19,py+17,4,3); ctx.fillRect(px+20,py+13,3,7);
    return;
  }
  ctx.fillStyle = b===B_VOLCANIC? '#2a201a':'#3a2a18'; ctx.fillRect(px+14,py+18,4,10);
  if(b===B_VOLCANIC){                               // charred dead tree
    ctx.strokeStyle='#1c1512'; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(px+16,py+20); ctx.lineTo(px+10,py+12);
    ctx.moveTo(px+16,py+22); ctx.lineTo(px+23,py+13); ctx.stroke();
    return;
  }
  let canopy = v>0.5? '#3f7a36':'#356a2e';
  if(b===B_ICE) canopy = v>0.5? '#5e7d63':'#557257';
  ctx.fillStyle=canopy; ctx.beginPath(); ctx.arc(px+16,py+14,9,0,6.28); ctx.fill();
  if(b===B_ICE){ ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(px+13,py+11,4,0,6.28); ctx.fill(); }
  else { ctx.fillStyle='rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(px+13,py+11,3,0,6.28); ctx.fill(); }
}

function drawGoldmine(e,px,py){
  ctx.save(); ctx.translate(px,py);
  // glow
  ctx.fillStyle='rgba(240,180,30,.12)'; ctx.beginPath(); ctx.arc(0,0,22,0,6.28); ctx.fill();
  for(let i=0;i<3;i++){
    const a=i*2.094, dx=Math.cos(a)*7, dy=Math.sin(a)*4;
    ctx.fillStyle = i===0?'#ffe27a':'#f0a500';
    ctx.beginPath();
    ctx.moveTo(dx,dy-11); ctx.lineTo(dx+7,dy); ctx.lineTo(dx,dy+11); ctx.lineTo(dx-7,dy); ctx.closePath();
    ctx.fill(); ctx.strokeStyle='#a06a00'; ctx.lineWidth=1; ctx.stroke();
  }
  // amount label
  ctx.fillStyle='#ffe9a8'; ctx.font='10px sans-serif'; ctx.textAlign='center';
  ctx.fillText(e.amount|0, 0, 26);
  ctx.restore();
}

function drawBuilding(state,e,ox,oy,dim){
  const d=DEF[e.type];
  const px=e.tx*TILE+ox, py=e.ty*TILE+oy;
  const w=e.w*TILE, h=e.h*TILE;
  const spr=buildingSprite(e.type, e.owner);

  ctx.save();
  if(dim) ctx.globalAlpha=0.55;
  // selection ring (footprint)
  if(e.selected){ ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.strokeRect(px-3,py-3,w+6,h+6); }
  // ground contact shadow
  ctx.fillStyle='rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(px+w/2,py+h-3,w*0.46,6,0,0,6.28); ctx.fill();

  let topY=py;   // visual top of the structure (for the HP bar)
  if(spr){
    // aspect-preserved, bottom-anchored with a little overhang
    const sx=spr.rect[0], sy=spr.rect[1], sw=spr.rect[2], sh=spr.rect[3];
    const overhang = e.type==='turret'?1.28:1.12;
    const dw=w*overhang, dh=dw*(sh/sw);
    const dx=px+(w-dw)/2, dy=py+h-dh+2;
    topY=dy;
    if(e.constructing) ctx.globalAlpha*=0.5;   // rises faintly while building
    ctx.drawImage(spr.img, sx,sy,sw,sh, dx,dy,dw,dh);
  } else {
    // ---- procedural fallback ----
    const col = isRedSide(e.owner)? '#9a3b3b' : d.color;
    const grad=ctx.createLinearGradient(px,py,px,py+h);
    grad.addColorStop(0, shade(col,30)); grad.addColorStop(1, shade(col,-25));
    ctx.fillStyle=grad; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill();
    ctx.strokeStyle=shade(col,-50); ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.85)'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=(w*0.42|0)+'px sans-serif'; ctx.fillText(d.icon||'🏢', px+w/2, py+h/2+1);
    ctx.fillStyle = isRedSide(e.owner)?'#ff8a8a':'#7fd6ff'; ctx.fillRect(px+w/2-3, py+2, 6, 9);
  }
  ctx.restore();

  // construction overlay / progress
  if(e.constructing){
    if(!spr){ ctx.fillStyle='rgba(20,30,45,.45)'; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill(); }
    barAt(px+6, py+h-12, w-12, 6, e.buildProg/e.buildTime, '#ffd86b');
  } else {
    if(e.hp<e.maxHp || e.selected){ barAt(px+6, topY-7, w-12, 5, e.hp/e.maxHp, hpColor(e.hp/e.maxHp)); }
    if(e.prodQueue && e.prodQueue.length){ barAt(px+6, py+h-8, w-12, 5, e.prodTime/e.prodTotal, '#7fd6ff'); }
  }
  if(e.hitFx>0){ ctx.fillStyle='rgba(255,80,80,'+(e.hitFx*2)+')'; roundRect(px+3,py+3,w-6,h-6,6); ctx.fill(); e.hitFx-=1/60; }
}

function drawUnit(state,u,ox,oy){
  const px=u.x+ox, py=u.y+oy;
  const r=u.r;
  const alt = u.air?16:0;   // flyers are drawn raised; their shadow stays on the ground

  // ---- movement state for sprite animation (updated each render frame) ----
  const lax = u._ax==null?u.x:u._ax, lay = u._ay==null?u.y:u._ay;
  const mvx = u.x-lax, mvy = u.y-lay, md = Math.hypot(mvx,mvy);
  u._ax=u.x; u._ay=u.y;
  u._walkDist = (u._walkDist||0)+md;
  if(md>0.25){ u._still=0; if(Math.abs(mvx)>0.15) u._face = mvx<0?-1:1; }
  else u._still=(u._still||0)+1;
  const moving = (u._still||0) < 6;   // debounce so brief stalls don't flicker to idle

  ctx.save();
  // selection ring
  if(u.selected){ ctx.strokeStyle='#8effb0'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(px,py,r+4,0,6.28); ctx.stroke(); }
  // shadow
  ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(px,py+r-1,r,r*0.45,0,0,6.28); ctx.fill();

  const _red = isRedSide(u.owner);
  const team = _red ? '#c0392b' : '#3b7fd0';
  const teamL= _red ? '#e57368' : '#7fb7f0';

  const anim = unitWalk(u.type, u.owner);
  if(anim){
    const S = UNIT_SPRITE_H[u.type]||30;
    const act = u._actState ? actionAnim(u.type, u._actState, u.owner) : null;
    let fi, useAnim;
    if(act){
      useAnim = act;
      if(u._actState==='attack'){ const t = state.time-(u._actStamp||0);          // strike-synced
        fi = t<0.09?1 : t<0.19?2 : t<0.34?3 : 0; }
      else { fi = Math.floor(state.time*7) % act.frames.length; }                  // mine / heal loop
    } else { useAnim = anim; fi = moving ? Math.floor((u._walkDist||0)/9) % anim.frames.length : 0; }
    const dh = blitFrame(u,px,py-alt,useAnim,S,fi);
    if(u.type==='worker' && u.carrying>0){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(px,py-dh*0.7-3,3,0,6.28); ctx.fill(); }
  } else if(u.type==='worker'){
    ctx.fillStyle=team; ctx.beginPath(); ctx.arc(px,py,r,0,6.28); ctx.fill();
    ctx.fillStyle=teamL; ctx.beginPath(); ctx.arc(px,py-2,r*0.5,0,6.28); ctx.fill();
    // pickaxe hint
    ctx.strokeStyle='#d8b46a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(px+r*0.4,py-r*0.4); ctx.lineTo(px+r,py-r); ctx.stroke();
    if(u.carrying>0){ ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(px,py-r-3,3,0,6.28); ctx.fill(); }
  } else if(u.type==='soldier'){
    ctx.fillStyle=team;
    ctx.beginPath();
    const a=u.dir||0;
    // body diamond
    roundRect(px-r*0.8,py-r*0.8,r*1.6,r*1.6,3); ctx.fill();
    ctx.fillStyle=teamL; ctx.fillRect(px-r*0.45,py-r*0.55,r*0.9,r*0.5);
    // sword
    ctx.strokeStyle='#cfd6df'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(a)*r*1.3, py+Math.sin(a)*r*1.3); ctx.stroke();
  } else if(u.type==='ranger'){
    ctx.fillStyle=team; ctx.beginPath(); ctx.arc(px,py,r,0,6.28); ctx.fill();
    ctx.fillStyle=teamL; ctx.beginPath(); ctx.arc(px,py,r*0.55,0,6.28); ctx.fill();
    // bow
    const a=u.dir||0;
    ctx.strokeStyle='#3c8f4a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(px+Math.cos(a)*r*0.7,py+Math.sin(a)*r*0.7, r*0.7, a-1.1, a+1.1); ctx.stroke();
  }
  ctx.restore();

  // hp bar
  if(u.hp<u.maxHp || u.selected){
    barAt(px-r, py-r-7-alt, r*2, 4, u.hp/u.maxHp, hpColor(u.hp/u.maxHp));
  }
  // control-group badge (lowest assigned number)
  if(u.owner==='player' && u._groups && u._groups.size){
    const g=Math.min(...[...u._groups].map(Number));
    ctx.fillStyle='rgba(10,16,26,.85)'; ctx.strokeStyle='#7fd6ff'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(px+r-1, py+r-1, 6.5, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#cfe9ff'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(g, px+r-1, py+r);
  }
  if(u.hitFx>0){ ctx.fillStyle='rgba(255,80,80,'+(u.hitFx*3)+')'; ctx.beginPath(); ctx.arc(px,py,r,0,6.28); ctx.fill(); u.hitFx-=1/60; }
}

function drawFog(state,ox,oy,x0,y0,x1,y1){
  for(let ty=y0;ty<y1;ty++)for(let tx=x0;tx<x1;tx++){
    const i=ty*state.W+tx;
    const px=tx*TILE+ox, py=ty*TILE+oy;
    if(!state.explored[i]){ ctx.fillStyle='#05070b'; ctx.fillRect(px,py,TILE+1,TILE+1); }
    else if(!state.visible[i]){ ctx.fillStyle='rgba(5,8,14,.5)'; ctx.fillRect(px,py,TILE+1,TILE+1); }
  }
}

function drawPlacement(state,ox,oy){
  const p=state.placing;
  const wx=mouse.wx, wy=mouse.wy;
  const tx=Math.floor((wx)/TILE - (p.def.w-1)/2 +0.0001);
  const ty=Math.floor((wy)/TILE - (p.def.h-1)/2 +0.0001);
  const ok=canPlaceAt(state,p.type,tx,ty) && state.gold>=p.def.cost;
  const px=tx*TILE+ox, py=ty*TILE+oy, w=p.def.w*TILE, h=p.def.h*TILE;
  ctx.fillStyle= ok? 'rgba(120,255,150,.3)':'rgba(255,90,90,.3)';
  ctx.fillRect(px,py,w,h);
  ctx.strokeStyle= ok? '#8effb0':'#ff6b6b'; ctx.lineWidth=2; ctx.strokeRect(px,py,w,h);
  state.placeCandidate={tx,ty,ok};
}

/* selection-ring fx */
let rings=[];
function spawnRing(wx,wy,color){ rings.push({x:wx,y:wy,r:6,max:26,color,t:1}); }
function drawRings(ox,oy){
  for(const r of rings){
    ctx.strokeStyle=r.color; ctx.globalAlpha=r.t; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(r.x+ox,r.y+oy,r.r,0,6.28); ctx.stroke(); ctx.globalAlpha=1;
    r.r+=0.8; r.t-=0.04;
  }
  rings=rings.filter(r=>r.t>0);
}

/* ---- minimap ---- */
function renderMinimap(state){
  const W=mm.width, H=mm.height;
  mmx.fillStyle='#05080d'; mmx.fillRect(0,0,W,H);
  const sx=W/state.W, sy=H/state.H;
  for(let ty=0;ty<state.H;ty++)for(let tx=0;tx<state.W;tx++){
    const i=ty*state.W+tx;
    if(!state.explored[i]) continue;
    const t=state.tiles[i], b=state.biome[i];
    let c;
    if(t===T_WATER)      c = b===B_VOLCANIC?'#7a2408': b===B_ICE?'#9ec4d6':'#1a466a';
    else if(t===T_ROCK)  c = b===B_VOLCANIC?'#4a2c22': b===B_ICE?'#9fb6c2':'#5a544d';
    else if(t===T_TREE)  c = b===B_DESERT?'#5a7a3e': b===B_VOLCANIC?'#2a201a':'#27401f';
    else                 c = BIOME_MINI[b] || '#34522f';
    if(!state.visible[i]) c=shade(c,-30);
    mmx.fillStyle=c; mmx.fillRect(tx*sx,ty*sy,Math.ceil(sx),Math.ceil(sy));
  }
  for(const e of state.entities){
    if(e.dead) continue;
    if(e.type==='goldmine'){ if(state.explored[((e.y/TILE)|0)*state.W+((e.x/TILE)|0)]){ mmx.fillStyle='#ffd86b'; mmx.fillRect(e.x/TILE*sx-1,e.y/TILE*sy-1,3,3);} continue; }
    if(e.owner==='enemy' && !isVisiblePix(state,e.x,e.y) && !(e.kind==='building'&&e._everSeen)) continue;
    mmx.fillStyle = isRedSide(e.owner)?'#ff6b6b':'#7fd6ff';
    const s = e.kind==='building'?3:2;
    mmx.fillRect(e.x/TILE*sx - s/2, e.y/TILE*sy - s/2, s, s);
  }
  // viewport rect
  const vw=cv.width, vh=cv.height-VIEW_TOP-VIEW_BOT;
  mmx.strokeStyle='rgba(255,255,255,.7)'; mmx.lineWidth=1;
  mmx.strokeRect(state.camX/TILE*sx, state.camY/TILE*sy, vw/TILE*sx, vh/TILE*sy);
}

/* ---- small draw helpers ---- */
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function barAt(x,y,w,h,frac,color){
  frac=Math.max(0,Math.min(1,frac));
  ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(x-1,y-1,w+2,h+2);
  ctx.fillStyle='#1a2533'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle=color; ctx.fillRect(x,y,w*frac,h);
}
function hpColor(f){ return f>0.5?'#4cd964': f>0.25?'#ffcc33':'#ff5b5b'; }
function shade(hex,amt){
  const c=hex.replace('#',''); let r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16);
  r=Math.max(0,Math.min(255,r+amt)); g=Math.max(0,Math.min(255,g+amt)); b=Math.max(0,Math.min(255,b+amt));
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

