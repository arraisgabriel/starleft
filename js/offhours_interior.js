/* offhours_interior.js — The Off-Hours "Sims-like" INTERIOR view.
   A spatial room per venue: the player SEES veterans + NPCs occupying the space, clicks one to open a
   radial pie-menu (Talk / Gift / Sit / Watch / Leave), and conversation choices appear as a floating
   line-picker around the speaker. PRESENTATION ONLY — every gameplay outcome routes through the existing
   host-authoritative engine (applyOffhoursCommit / netOffhoursCommit). Decoupled from the hub sim/render:
   its own DOM overlay + canvas + RAF, so it can't destabilise the game loop or the netRole paths.

   Reuses: unitWalk/blitFrame (js/assets.js) for sprites, BIOME_PAL idea for the floor, OFFHOURS.interiors
   (js/offhours_data.js) for the room layout, the whole offhours.js engine, buildDossier/buildNpcDossier,
   makeRng/_loHash (determinism). Canvas-drawn furniture now = the single swap-point for Gemini later. */

(function(){
'use strict';
const ROOM_W=960, ROOM_H=560;
const SPR_H=72;                       // base sprite virtual height
let _int=null, _raf=0, _last=0, _styled=false;

/* ---- DOM ---- */
function $(id){ return document.getElementById(id); }
function _ensureStyle(){
  if(_styled) return; _styled=true;
  const css=`
  #oh-interior-overlay{position:fixed;inset:0;z-index:90;background:#06080c;display:none;overflow:hidden;font-family:'Chakra Petch','Spline Sans',system-ui,sans-serif}
  #oh-interior{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:pointer}
  #oh-int-head{position:absolute;top:0;left:0;right:0;height:46px;display:flex;align-items:center;gap:12px;padding:0 16px;z-index:3;
    background:linear-gradient(180deg,rgba(6,8,12,.92),rgba(6,8,12,.3));border-bottom:1px solid #1c2533;pointer-events:none}
  #oh-int-title{font-weight:700;letter-spacing:.12em;color:#eef3f8;font-size:15px;text-transform:uppercase}
  #oh-int-sub{font-family:'JetBrains Mono',monospace;font-size:11px;color:#7a8698;letter-spacing:.06em}
  #oh-int-close{margin-left:auto;pointer-events:auto;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:12px;
    color:#c5cfdb;background:rgba(255,93,110,.08);border:1px solid rgba(255,93,110,.4);padding:6px 12px;border-radius:5px}
  #oh-int-close:hover{background:rgba(255,93,110,.18)}
  #oh-int-ui{position:absolute;inset:0;z-index:4;pointer-events:none}
  #oh-int-ui>*{pointer-events:auto}
  .ohi-pie{position:absolute;transform:translate(-50%,-50%);font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.04em;
    color:#dfe6ee;background:linear-gradient(180deg,rgba(16,21,30,.96),rgba(10,14,20,.96));border:1px solid #2a3446;border-radius:18px;
    padding:7px 13px;cursor:pointer;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.5);transition:.12s;animation:ohiPop .16s ease both}
  .ohi-pie:hover{border-color:var(--ac,#5fe0ff);color:#fff;box-shadow:0 0 14px -2px var(--ac,#5fe0ff)}
  @keyframes ohiPop{from{opacity:0;transform:translate(-50%,-50%) scale(.7)}to{opacity:1}}
  .ohi-choice{position:absolute;transform:translate(-50%,-50%);max-width:230px;font-family:'Spline Sans',system-ui,sans-serif;font-size:13px;line-height:1.35;
    color:#dfe6ee;background:linear-gradient(180deg,rgba(14,19,28,.97),rgba(9,13,20,.97));border:1px solid #273245;border-left:2px solid var(--ac,#ffce6a);
    border-radius:7px;padding:8px 11px;cursor:pointer;box-shadow:0 5px 18px rgba(0,0,0,.55);transition:.12s;animation:ohiPop .18s ease both}
  .ohi-choice:hover{border-color:var(--ac,#ffce6a);color:#fff;transform:translate(-50%,-50%) translateY(-1px)}
  .ohi-choice .ap{font-family:'JetBrains Mono',monospace;font-size:10px;color:#7a8698;opacity:.8;margin-right:5px}
  .ohi-bubble{position:absolute;transform:translate(-50%,-100%);max-width:260px;font-family:'Spline Sans',system-ui,sans-serif;font-size:13px;line-height:1.4;
    color:#cdd6e1;background:rgba(9,13,20,.95);border:1px solid #273245;border-left:3px solid var(--ac,#5fe0ff);border-radius:7px;padding:8px 11px;
    box-shadow:0 5px 18px rgba(0,0,0,.5);pointer-events:none;animation:ohiPop .18s ease both}
  .ohi-hint{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.08em;
    color:#5fe0ff;background:rgba(6,8,12,.8);border:1px solid rgba(95,224,255,.35);padding:7px 16px;border-radius:20px}
  #oh-int-roster{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:8px;align-items:center;padding:10px 16px;min-height:64px;
    background:linear-gradient(0deg,rgba(6,8,12,.94),rgba(6,8,12,.2));border-top:1px solid #1c2533;overflow-x:auto}
  #oh-int-roster .lab{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#56606f;flex:none;margin-right:4px}
  .ohi-call{flex:none;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;background:rgba(16,21,30,.7);border:1px solid #273245;
    border-radius:7px;padding:6px 10px;transition:.14s;min-width:64px}
  .ohi-call:hover{border-color:#5fe0ff;background:rgba(95,224,255,.08)}
  .ohi-call canvas{width:34px;height:34px;display:block}
  .ohi-call .nm{font-family:'JetBrains Mono',monospace;font-size:10px;color:#bcc6d2;max-width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ohi-call .empty{font-family:'Spline Sans';font-size:11px;color:#56606f;padding:6px}`;
  const s=document.createElement('style'); s.id='oh-int-style'; s.textContent=css; document.head.appendChild(s);
}

/* ---- coordinate transform (virtual room → CSS px) ---- */
function _metrics(){
  const cv=$('oh-interior'); const cssW=cv.clientWidth||window.innerWidth, cssH=cv.clientHeight||window.innerHeight;
  const scale=Math.min(cssW/ROOM_W, cssH/ROOM_H)*0.97;
  return { cssW, cssH, scale, offX:(cssW-ROOM_W*scale)/2, offY:(cssH-ROOM_H*scale)/2 };
}
function v2c(vx, vy, m){ m=m||_metrics(); return { x:m.offX+vx*m.scale, y:m.offY+vy*m.scale }; }

/* ---- open / close ---- */
function openInterior(poi, who){
  if(typeof OFFHOURS==='undefined' || !poi) return;
  const kind=(poi.hubPoi?poi.hubPoi.kind:poi.kind)||'bar';
  const layout=OFFHOURS.interiors && OFFHOURS.interiors[kind];
  if(!layout){ if(typeof openVenueMenu==='function') return openVenueMenu(poi, who); return; }  // venues w/o an interior fall back to the old menu
  _ensureStyle();
  _int={ poi, kind, layout, occ:[], selected:null, mode:'idle', pending:null, scene:null, target:null };
  _populate();
  $('oh-int-title').textContent=(poi.hubPoi&&poi.hubPoi.name)||layout.name||'THE OFF-HOURS';
  _syncHead();
  const ov=$('oh-interior-overlay'); ov.style.display='block';
  _resizeCanvas();
  _bindInput();
  _renderRoster();
  _clearUI();
  _last=performance.now(); if(!_raf) _raf=requestAnimationFrame(_loop);
}
function closeInterior(){
  if(_raf){ cancelAnimationFrame(_raf); _raf=0; }
  const ov=$('oh-interior-overlay'); if(ov) ov.style.display='none';
  _clearUI(); _int=null;
  if(typeof syncHud==='function') try{ syncHud(); }catch(_){ }
}
function _syncHead(){
  const L=ohLedger();
  $('oh-int-sub').textContent='downtime: '+(L?(L.nights|0):0)+'  ·  M3$ '+((typeof CAMPAIGN!=='undefined')?(CAMPAIGN.m3|0):0);
}

/* ---- populate occupants (a random subset of roster vets already inside + the venue NPC) ---- */
function _liveVets(){
  const ents=(typeof G!=='undefined'&&G&&G.entities)?G.entities:[];
  return ents.filter(e=>e&&!e.dead&&e.kind==='unit'&&e.owner==='player'&&e.lore);
}
function _populate(){
  const L=_int.layout, occ=_int.occ;
  // the venue's signature NPC (bar → bartender), fixed behind the counter
  if(_int.kind==='bar'){
    const id=OFFHOURS.barNpc;
    if(typeof CAMPAIGN!=='undefined' && CAMPAIGN.npc){ CAMPAIGN.npc.byId=CAMPAIGN.npc.byId||{};
      if(!CAMPAIGN.npc.byId[id]) CAMPAIGN.npc.byId[id]={fixed:'bartender',v:1,lvD:1,mv:0,hc:'',fl:0,ev:[]}; }
    const d=(typeof buildNpcDossier==='function')?buildNpcDossier(id):null;
    occ.push({ key:id, kind:'npc', npcId:id, name:(d&&d.first)||'the bartender', sprite:{type:'recruiter',owner:'player'},
      x:L.bartender.x, y:L.bartender.y, tx:L.bartender.x, ty:L.bartender.y, face:1, fixed:true, wob:Math.random()*6 });
  }
  // a deterministic random subset of the roster already inside
  const vets=_liveVets();
  const seedBase=(typeof _loHash==='function')?_loHash(((_strHash(_int.kind))^(((typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?CAMPAIGN.visit|0:0)+1))>>>0):1;
  const rng=(typeof makeRng==='function')?makeRng(seedBase%233280):Math.random;
  const shuffled=vets.slice().sort((a,b)=> (rng()-0.5));
  const n=Math.min(shuffled.length, 4 + ((rng()*2)|0));
  const seats=(L.seats||[]).slice();
  for(let i=0;i<n;i++){ const u=shuffled[i]; _addVet(u, seats[i]||L.wander[i%L.wander.length]); }
}
function _addVet(u, seat){
  const L=_int.layout; const d=(u.lore&&typeof buildDossier==='function')?buildDossier(u):null;
  const p=seat||L.door;
  _int.occ.push({ key:ohUnitKey(u), kind:'vet', unit:u, name:(d&&d.first)||(typeof trainTypeName==='function'?trainTypeName(u):'vet'),
    sprite:{type:u.spriteType||u.type, owner:'player', heroId:u.heroId||null},
    x:p.x, y:p.y, tx:p.x, ty:p.y, face:1, seat:seat, wanderT:1+Math.random()*5, wob:Math.random()*6, wphase:0 });
}
function _strHash(s){ let h=0x811c9dc5; s=String(s||''); for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); } return h>>>0; }

/* ---- the room render ---- */
function _resizeCanvas(){
  const cv=$('oh-interior'); if(!cv) return; const dpr=window.devicePixelRatio||1;
  cv.width=Math.round(cv.clientWidth*dpr); cv.height=Math.round(cv.clientHeight*dpr);
}
function _loop(now){
  if(!_int){ _raf=0; return; }
  const dt=Math.min(0.05,(now-_last)/1000); _last=now;
  _update(dt); _render(now/1000);
  _raf=requestAnimationFrame(_loop);
}
function _update(dt){
  const L=_int.layout;
  for(const o of _int.occ){
    if(o.fixed){ o.wob+=dt; continue; }
    const dx=o.tx-o.x, dy=o.ty-o.y, dist=Math.hypot(dx,dy);
    if(dist>2){ const sp=92*dt; o.x+=dx/dist*Math.min(sp,dist); o.y+=dy/dist*Math.min(sp,dist); o.face=dx<0?-1:1; o.moving=true; o.wphase=(o.wphase||0)+dt*9; }
    else { o.moving=false; o.wob=(o.wob||0)+dt; }
    // light ambient wander (only idle vets not in a pending interaction)
    if(o.kind==='vet' && !o.moving && _int.mode==='idle' && !(_int.pending&&_int.pending.vet===o)){
      o.wanderT-=dt; if(o.wanderT<=0){ o.wanderT=4+Math.random()*7; const pts=(Math.random()<0.5?L.wander:L.seats)||L.wander; const p=pts[(Math.random()*pts.length)|0]; if(p){ o.tx=p.x; o.ty=p.y; } } }
  }
  // resolve a pending walk-to-talk/gift
  if(_int.pending){ const pe=_int.pending; const d=Math.hypot(pe.vet.x-pe.atx, pe.vet.y-pe.aty);
    if(d<6){ const p=pe; _int.pending=null; if(p.type==='talk') _openScene(p.vet,p.target); else if(p.type==='gift') _doGift(p.vet,p.target); } }
}
function _render(t){
  const cv=$('oh-interior'); if(!cv) return; const ctx=cv.getContext('2d'); const dpr=window.devicePixelRatio||1;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const m=_metrics(), L=_int.layout;
  ctx.fillStyle=L.wall||'#0c0f15'; ctx.fillRect(0,0,m.cssW,m.cssH);
  _drawFloor(ctx,m,L); _drawFurniture(ctx,m,L,t);
  // occupants depth-sorted by y
  const sorted=_int.occ.slice().sort((a,b)=>a.y-b.y);
  for(const o of sorted) _drawOcc(ctx,m,o,t);
  _drawTags(m);
}
function _drawFloor(ctx,m,L){
  const a=L.floorA||'#14181f', b=L.floorB||'#1b2129', ts=44;
  for(let vy=0;vy<ROOM_H;vy+=ts) for(let vx=0;vx<ROOM_W;vx+=ts){
    const p=v2c(vx,vy,m); ctx.fillStyle=(((vx/ts|0)+(vy/ts|0))&1)?a:b; ctx.fillRect(p.x,p.y,ts*m.scale+1,ts*m.scale+1);
  }
  // neon floor glow toward the bar accent
  const g=ctx.createRadialGradient(m.offX+ROOM_W*m.scale/2,m.offY+ROOM_H*m.scale*0.2,10, m.offX+ROOM_W*m.scale/2,m.offY,ROOM_W*m.scale*0.7);
  g.addColorStop(0,_hexA(L.accent||'#ffce6a',0.07)); g.addColorStop(1,'transparent'); ctx.fillStyle=g; ctx.fillRect(0,0,m.cssW,m.cssH);
}
function _rect(ctx,m,x,y,w,h,fill,stroke){ const p=v2c(x,y,m); ctx.fillStyle=fill; ctx.fillRect(p.x,p.y,w*m.scale,h*m.scale); if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=Math.max(1,1.5*m.scale); ctx.strokeRect(p.x,p.y,w*m.scale,h*m.scale); } }
function _drawFurniture(ctx,m,L,t){
  const ac=L.accent||'#ffce6a';
  // back wall band + neon sign
  _rect(ctx,m,0,0,ROOM_W,96,'#0a0d12');
  if(L.shelf){ _rect(ctx,m,L.shelf.x,L.shelf.y,L.shelf.w,L.shelf.h,'#10141b','#1c2533');
    for(let i=0;i<14;i++){ const bx=L.shelf.x+12+i*((L.shelf.w-24)/14); const cols=['#5fd98a','#5fe0ff','#ffce6a','#cf8bff','#ff5d70']; _rect(ctx,m,bx,L.shelf.y+8,7,L.shelf.h-14,cols[i%cols.length]); } }
  if(L.sign){ const p=v2c(ROOM_W/2,40,m); ctx.save(); ctx.font='700 '+(20*m.scale)+'px Chakra Petch, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.shadowColor=ac; ctx.shadowBlur=14*m.scale*(0.7+0.3*Math.sin(t*2)); ctx.fillStyle=ac; ctx.fillText(L.sign, p.x, p.y); ctx.restore(); }
  // the bar counter (wood top + dark front)
  if(L.counter){ const c=L.counter; _rect(ctx,m,c.x,c.y+c.h-14,c.w,14,'#1a1410'); const top=v2c(c.x,c.y,m);
    const gr=ctx.createLinearGradient(top.x,top.y,top.x,top.y+ (c.h-14)*m.scale); gr.addColorStop(0,'#3a2c1d'); gr.addColorStop(1,'#241a11');
    ctx.fillStyle=gr; ctx.fillRect(top.x,top.y,c.w*m.scale,(c.h-14)*m.scale); ctx.strokeStyle='#0c0f15'; ctx.lineWidth=2*m.scale; ctx.strokeRect(top.x,top.y,c.w*m.scale,c.h*m.scale);
    _rect(ctx,m,c.x,c.y,c.w,3,_hexA(ac,0.5)); }
  // stools
  for(const s of (L.stools||[])){ const p=v2c(s.x,s.y,m); ctx.fillStyle='#2a2018'; ctx.beginPath(); ctx.ellipse(p.x,p.y,12*m.scale,6*m.scale,0,0,6.28); ctx.fill(); }
  // round tables
  for(const tb of (L.tables||[])){ const p=v2c(tb.x,tb.y,m); ctx.fillStyle='#171c24'; ctx.beginPath(); ctx.ellipse(p.x,p.y,tb.r*m.scale,tb.r*0.55*m.scale,0,0,6.28); ctx.fill(); ctx.strokeStyle='#222a35'; ctx.lineWidth=2*m.scale; ctx.stroke(); }
  // door
  if(L.door){ _rect(ctx,m,L.door.x-22,L.door.y-58,44,64,'#0e1218','#1c2533'); }
}
function _drawOcc(ctx,m,o,t){
  const p=v2c(o.x,o.y,m); const S=SPR_H*m.scale*(o.moving?1:(1+0.02*Math.sin((o.wob||0)*1.8)));
  // shadow
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x,p.y,S*0.22,S*0.08,0,0,6.28); ctx.fill();
  // selection ring
  if(_int.selected===o){ ctx.strokeStyle=_hexA(_accent(),0.9); ctx.lineWidth=2.4*m.scale; ctx.beginPath(); ctx.ellipse(p.x,p.y,S*0.26,S*0.1,0,0,6.28); ctx.stroke(); }
  else if(_int.mode==='target' && o!==_int.selected){ ctx.strokeStyle='rgba(95,224,255,.5)'; ctx.lineWidth=1.6*m.scale; ctx.setLineDash([4*m.scale,4*m.scale]); ctx.beginPath(); ctx.ellipse(p.x,p.y,S*0.24,S*0.09,0,0,6.28); ctx.stroke(); ctx.setLineDash([]); }
  // sprite
  const anim=(typeof unitWalk==='function')?unitWalk(o.sprite.type,o.sprite.owner):null;
  if(anim && anim.ready && anim.frames && anim.frames.length){
    const fi=o.moving?(((o.wphase||0)|0)%anim.frames.length):0;
    _blitSprite(ctx, {type:o.sprite.type, _face:o.face}, p.x, p.y, anim, S, fi);  // draws to the INTERIOR ctx (blitFrame is hardwired to the main canvas)
  } else { // brighter silhouette fallback — visible against the dark floor when a sprite asset is absent
    ctx.fillStyle='#3a465b'; ctx.beginPath(); ctx.ellipse(p.x,p.y-S*0.30,S*0.17,S*0.33,0,0,6.28); ctx.fill();
    ctx.fillStyle='#4c5a73'; ctx.beginPath(); ctx.ellipse(p.x,p.y-S*0.64,S*0.12,S*0.14,0,0,6.28); ctx.fill();
    ctx.fillStyle=(o.kind==='npc'?_accent():'#7fd6ff'); ctx.fillRect(p.x-S*0.025,p.y-S*0.50,S*0.05,S*0.05);
  }
  // mood / want icon over a vet's head
  if(o.kind==='vet' && typeof ohVetMood==='function'){ const mo=ohVetMood(o.unit);
    if(mo.want || o.unit._vetGrief){ const ic=o.unit._vetGrief?'🖤':'🍸'; ctx.save(); ctx.font=(15*m.scale)+'px sans-serif'; ctx.textAlign='center';
      ctx.globalAlpha=0.85+0.15*Math.sin(t*3+(o.wob||0)); ctx.fillText(ic, p.x, p.y-S*0.92); ctx.restore(); } }
}
function _drawTags(m){
  // name tag under the hovered/selected occupant only (keep it clean)
  const o=_int.selected; if(!o) return; const p=v2c(o.x,o.y,m);
  const ctx=$('oh-interior').getContext('2d'); ctx.save(); ctx.font='600 '+(11)+'px JetBrains Mono, monospace'; ctx.textAlign='center';
  const tier=(o.kind==='npc')?'': ''; const txt=o.name; const w=ctx.measureText(txt).width+12;
  ctx.fillStyle='rgba(6,8,12,.85)'; ctx.fillRect(p.x-w/2, p.y+6, w, 16); ctx.fillStyle='#cdd6e1'; ctx.fillText(txt, p.x, p.y+18); ctx.restore();
}
function _hexA(hex,a){ hex=hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }
// our own sprite blit (the global blitFrame is hardwired to the main canvas `ctx`; we need the interior ctx)
function _blitSprite(ictx, u, px, py, anim, S, fi){
  const n=anim.frames.length, fr=anim.frames[((fi%n)+n)%n]; if(!fr) return;
  const dh=S, dw=S*(anim.fw/anim.fh);
  ictx.save(); ictx.translate(px,py);
  const facesLeft=!!(typeof DEF!=='undefined' && DEF[u.type] && DEF[u.type].facesLeft);
  if(((u._face||1)<0)!==facesLeft) ictx.scale(-1,1);
  ictx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2, -dh*0.7, dw, dh);
  ictx.restore();
}
function _esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';}); }
function _accent(){ return (_int && _int.layout && _int.layout.accent)||'#5fe0ff'; }

/* ---- input: click the canvas → hit-test an occupant → pie-menu / target ---- */
function _bindInput(){
  const cv=$('oh-interior'); if(cv && !cv._ohBound){ cv._ohBound=true; cv.addEventListener('click', _onCanvasClick); }
  const cl=$('oh-int-close'); if(cl && !cl._ohBound){ cl._ohBound=true; cl.addEventListener('click', closeInterior); }
}
function _pick(cx,cy){
  const m=_metrics(); let best=null, bd=1e9;
  for(const o of _int.occ){ const p=v2c(o.x,o.y,m); const S=SPR_H*m.scale;
    if(cx>=p.x-S*0.26 && cx<=p.x+S*0.26 && cy>=p.y-S*0.95 && cy<=p.y+S*0.12){ const d=Math.abs(cx-p.x)+Math.abs(cy-(p.y-S*0.4)); if(d<bd){ bd=d; best=o; } } }
  return best;
}
function _onCanvasClick(e){
  if(!_int) return; const r=e.currentTarget.getBoundingClientRect(); const cx=e.clientX-r.left, cy=e.clientY-r.top;
  const hit=_pick(cx,cy);
  if(_int.mode==='target'){
    if(hit && hit!==_int.selected){ _startInteraction(_int.selected, hit); } else { _setMode('idle'); }
    return;
  }
  if(_int.mode==='scene'){ return; }   // line-picker handles its own clicks
  _clearUI();
  if(!hit){ _int.selected=null; _int.mode='idle'; return; }
  _int.selected=hit;
  if(hit.kind==='vet'){ _int.mode='pie'; _showPie(hit); }
  else { _showBubble(hit, hit.name+' — '+( (typeof buildNpcDossier==='function' && buildNpcDossier(hit.npcId)||{}).profession || 'regular' ), 'npc', 2600); _int.mode='idle'; }
}

/* ---- the Sims pie-menu ---- */
function _showPie(o){
  const ui=$('oh-int-ui'); const m=_metrics();
  const cx=m.offX+o.x*m.scale, cy=m.offY+(o.y-SPR_H*0.62)*m.scale;     // centre on the upper body
  const acts=[ {k:'talk',t:'Talk'},{k:'gift',t:'Gift'},{k:'sit',t:'Sit'},{k:'watch',t:'Watch'},{k:'leave',t:'Leave'} ];
  const n=acts.length, R=132, step=54*Math.PI/180;                     // wide radius + 54° between items → no overlap
  const base=-Math.PI/2 - (n-1)*step/2;                                // fan symmetric about straight-up, top hemisphere
  acts.forEach((a,i)=>{
    const A=base + i*step;
    const x=Math.max(56, Math.min(m.cssW-56, cx + Math.cos(A)*R));
    const y=Math.max(58, Math.min(m.cssH-128, cy + Math.sin(A)*R));
    const b=document.createElement('button'); b.className='ohi-pie'; b.textContent=a.t; b.style.setProperty('--ac', _accent());
    b.style.left=x+'px'; b.style.top=y+'px';
    b.addEventListener('click', function(ev){ ev.stopPropagation(); _pieAct(a.k, o); });
    ui.appendChild(b);
  });
}
function _pieAct(k, o){
  _clearUI();
  if(k==='talk'||k==='gift'){ _int.mode='target'; _int.pendKind=k; _hint(k==='talk'?'Click who '+o.name+' should talk to':'Click who to give a gift to'); }
  else if(k==='sit'){ const seat=_freeSeat(); if(seat){ o.tx=seat.x; o.ty=seat.y; } _int.mode='idle'; _int.selected=null; }
  else if(k==='watch'){ _int.mode='idle'; }   // just observe
  else if(k==='leave'){ o.tx=_int.layout.door.x; o.ty=_int.layout.door.y; o._leaving=true; _int.mode='idle'; _int.selected=null;
    setTimeout(()=>{ if(_int){ _int.occ=_int.occ.filter(x=>x!==o); _renderRoster(); } }, 1400); }
}
function _freeSeat(){ const used=new Set(_int.occ.map(o=>o.seat&&(o.seat.x+','+o.seat.y))); for(const s of (_int.layout.seats||[])){ if(!used.has(s.x+','+s.y)) return s; } return (_int.layout.seats||[])[0]; }
function _startInteraction(vet, target){
  if(!vet || vet.kind!=='vet'){ _setMode('idle'); return; }
  // walk the vet next to the target, then resolve
  const ang=Math.atan2(vet.y-target.y, vet.x-target.x); const atx=target.x+Math.cos(ang)*46, aty=target.y+Math.sin(ang)*30;
  vet.tx=atx; vet.ty=aty; vet.face=(target.x<vet.x)?-1:1;
  _int.pending={ type:_int.pendKind||'talk', vet, target, atx, aty }; _int.mode='busy'; _clearUI(); _hint('…');
  setTimeout(()=>{ if(_int && _int.mode==='busy' && (!_int.pending)) ; }, 10);
}

/* ---- the scene + floating line-picker ---- */
function _interactionContext(vet, target){
  const vetKey=vet.key, vu=vet.unit;
  if(target.kind==='npc'){
    const npcId=target.npcId; const kind=(npcId===OFFHOURS.barNpc)?'confidant':'friend';
    if(kind==='confidant' && typeof ohSeedConfidant==='function') ohSeedConfidant(vetKey);
    const bond=ohGetBond(vetKey, npcId) || ohEnsureBond(vetKey, npcId, kind);
    return { venue:_int.kind, kind, npcId, bond, vu };
  } else {
    const npcId=target.key; let bond=ohGetBond(vetKey, npcId);
    if(!bond && typeof ohSeedClub==='function') bond=ohSeedClub(vetKey, vu, npcId, target.unit);
    bond=bond||ohEnsureBond(vetKey, npcId, 'friend');
    return { venue:'club', kind:ohKindName(bond.k), npcId, bond, vu };
  }
}
function _openScene(vet, target){
  _hideHint();
  const cx=_interactionContext(vet, target);
  const pick=(typeof ohSceneFor==='function')?ohSceneFor(cx.venue, cx.kind, cx.vu, cx.bond):null;
  if(!pick){ _showBubble(target, 'Nothing new to get into tonight.', 'npc', 2600); _int.mode='idle'; _int.selected=null; _syncHead(); return; }
  _int.scene={ vet, target, pick, cx };
  _int.mode='scene';
  _showBubble(target, ohFill(pick.scene.open, cx.vu, cx.npcId), 'npc', 0);
  _showLinePicker(vet, target, pick, cx);
}
function _showLinePicker(vet, target, pick, cx){
  const ui=$('oh-int-ui'); const m=_metrics(); const p=v2c(vet.x, vet.y, m);
  const choices=pick.scene.choices.filter(c=> !c.gate || (typeof ohVetHas==='function' && ohVetHas(cx.vu, c.gate)));
  const a0=-Math.PI*0.95, span=Math.PI*1.5;
  choices.forEach((c, idx)=>{
    const ci=pick.scene.choices.indexOf(c);
    const A=a0 + (choices.length>1? span*idx/(choices.length-1) : span/2);
    const R=120 + (idx%2)*26;
    const b=document.createElement('div'); b.className='ohi-choice'; b.style.setProperty('--ac', _int.layout.accent||'#ffce6a');
    b.style.left=Math.max(120, Math.min(m.cssW-120, p.x + Math.cos(A)*R))+'px';
    b.style.top=Math.max(70, Math.min(m.cssH-110, p.y + Math.sin(A)*R - 60))+'px';
    b.innerHTML='<span class="ap">['+(c.approach||'say')+']</span>'+_esc(ohFill(c.line, cx.vu, cx.npcId));
    b.addEventListener('click', function(ev){ ev.stopPropagation(); _commitChoice(ci); });
    ui.appendChild(b);
  });
}
function _commitChoice(ci){
  const sc=_int.scene; if(!sc) return; const cx=sc.cx;
  if((typeof CAMPAIGN!=='undefined') && (CAMPAIGN.m3|0) < (OFFHOURS.tune.sceneCost|0)){ _flash('Not enough M3rit$ for a round.'); return; }
  const L=ohLedger(); if(L && (L.nights|0)<=0){ _flash('Out of downtime this visit.'); return; }
  const payload={ vetKey:sc.vet.key, npcId:cx.npcId, sceneIdx:sc.pick.idx, choiceIdx:ci };
  let res=null;
  if(typeof netOffhoursCommit==='function') res=netOffhoursCommit(G, payload);
  else if(typeof applyOffhoursCommit==='function') res=applyOffhoursCommit(G, payload);
  _clearUI();
  if(res && res.broke){ _flash('Not enough M3rit$.'); _int.mode='idle'; _int.scene=null; return; }
  const reply=(res&&res.reply)||'…';
  _showBubble(sc.vet, reply, 'reply', 4200);
  if(res && res.wrote!=null) _showBubble(sc.target, 'A line goes into '+sc.vet.name+'’s file.', 'npc', 3200, 30);
  if(typeof refreshUI==='function') refreshUI();
  _int.scene=null; _int.mode='idle'; _int.selected=null; _syncHead(); _renderRoster();
}
function _doGift(vet, target){
  _hideHint(); const cx=_interactionContext(vet, target);
  if((typeof CAMPAIGN!=='undefined') && (CAMPAIGN.m3|0) < (OFFHOURS.tune.giftCost|0)){ _flash('Not enough M3rit$ for a gift.'); _int.mode='idle'; return; }
  const payload={ vetKey:vet.key, npcId:cx.npcId, kind:cx.kind, gift:true };
  let res=(typeof netOffhoursCommit==='function')?netOffhoursCommit(G,payload):(typeof applyOffhoursCommit==='function'?applyOffhoursCommit(G,payload):null);
  if(res && res.broke){ _flash('Not enough M3rit$.'); _int.mode='idle'; return; }
  _showBubble(vet, (res&&res.reply)||'They take it with a nod.', 'reply', 3600);
  if(typeof refreshUI==='function') refreshUI();
  _int.mode='idle'; _int.selected=null; _syncHead();
}

/* ---- floating UI helpers ---- */
function _showBubble(o, text, tone, ttl, dy){
  const ui=$('oh-int-ui'); const m=_metrics(); const p=v2c(o.x,o.y,m);
  const el=document.createElement('div'); el.className='ohi-bubble';
  el.style.setProperty('--ac', tone==='reply'?(_int.layout.accent||'#ffce6a'):(tone==='npc'?'#5fe0ff':'#5fd98a'));
  el.style.left=p.x+'px'; el.style.top=(p.y - SPR_H*m.scale*0.95 - (dy||10))+'px'; el.textContent=text;
  el.dataset.anchor=_int.occ.indexOf(o); ui.appendChild(el);
  if(ttl>0) setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, ttl);
  return el;
}
function _hint(t){ _hideHint(); const ui=$('oh-int-ui'); const el=document.createElement('div'); el.className='ohi-hint'; el.id='ohi-hint'; el.textContent=t; ui.appendChild(el); }
function _hideHint(){ const e=$('ohi-hint'); if(e&&e.parentNode) e.parentNode.removeChild(e); }
function _flash(t){ if(typeof toast==='function') toast(t); else _hint(t); }
function _setMode(mode){ _int.mode=mode; if(mode==='idle'){ _int.selected=null; _clearUI(); } }
function _clearUI(){ const ui=$('oh-int-ui'); if(ui) ui.innerHTML=''; }

/* ---- roster strip: call a vet in ---- */
function _renderRoster(){
  const strip=$('oh-int-roster'); if(!strip) return; strip.innerHTML='<span class="lab">Call in</span>';
  const inside=new Set(_int.occ.filter(o=>o.kind==='vet').map(o=>o.key));
  const outside=_liveVets().filter(u=>!inside.has(ohUnitKey(u)));
  if(!outside.length){ const e=document.createElement('span'); e.className='empty'; e.textContent='everyone you have is already here.'; strip.appendChild(e); return; }
  for(const u of outside.slice(0,12)){
    const d=(u.lore&&typeof buildDossier==='function')?buildDossier(u):null;
    const card=document.createElement('div'); card.className='ohi-call';
    const cc=document.createElement('canvas'); cc.width=68; cc.height=68;
    if(typeof drawTrainCanvas==='function') try{ drawTrainCanvas(cc, u.spriteType||u.type, u.spriteType, performance.now()/1000); }catch(_){ }
    const nm=document.createElement('div'); nm.className='nm'; nm.textContent=(d&&d.first)||(typeof trainTypeName==='function'?trainTypeName(u):'vet');
    card.appendChild(cc); card.appendChild(nm);
    card.addEventListener('click', ()=>{ _callIn(u); });
    strip.appendChild(card);
  }
}
function _callIn(u){
  if(_int.occ.some(o=>o.key===ohUnitKey(u))) return;
  _addVet(u, _int.layout.door); const o=_int.occ[_int.occ.length-1]; const seat=_freeSeat(); if(seat){ o.tx=seat.x; o.ty=seat.y; }
  _renderRoster();
}

if(typeof window!=='undefined'){
  window.openInterior=openInterior; window.closeInterior=closeInterior;
  // read-only debug accessor (drives in-browser verification): occupants + the current virtual→CSS transform
  window._ohIntDebug=function(){ return _int?{ occ:_int.occ, mode:_int.mode, selected:_int.selected, scene:!!_int.scene, m:_metrics() }:null; };
}
})();
