/* hub.js — H.U.B. campaign layer: extraction, M3rit$, non-combat hub map,
   condos, ULTRA HQ services, MDC deployment, and Wasteland overlays. Classic
   globals by design; loaded after map.js and before units/ui/core. */

const HUB = {
  W:124, H:102,
  nextId:1,
  mdcCap:4,
  condoCosts:[200,400,700,1100,1600],
  implantCosts:[150,300,550,900,1400],
  styleCost:120,
  academyCost:250,
  gambleStake:100,
  pois:[
    {id:'condo_nw', kind:'condo', name:'Northwest Condo Suburb', type:'condo', x:12, y:14},
    {id:'condo_ne', kind:'condo', name:'Northeast Condo Suburb', type:'condo', x:103, y:14},
    {id:'condo_sw', kind:'condo', name:'Southwest Condo Suburb', type:'condo', x:13, y:82},
    {id:'mdc_nw', kind:'mdc', name:'MDC North-West', type:'mdc', x:27, y:22},
    {id:'mdc_ne', kind:'mdc', name:'MDC North-East', type:'mdc', x:91, y:23},
    {id:'mdc_sw', kind:'mdc', name:'MDC South-West', type:'mdc', x:28, y:75},
    {id:'mdc_ultra', kind:'mdc', name:'MDC Downtown', type:'mdc', x:60, y:63},
    {id:'ultra', kind:'ultra', name:'ULTRA Headquarters', type:'ultra', x:58, y:42},
  ],
  wasteland:{ x0:66, y0:68, x1:123, y1:101 },
  ultraMega:{ tx:53, ty:30, w:14, h:12, overhang:1.22, heightScale:1.14 },
  condoMega:{ variant:2, frames:{condo_nw:0, condo_ne:2, condo_sw:4}, w:15, h:12, overhang:1.18, heightScale:0.94 },
  mdcVisual:{ type:'barracks', faction:'enemy', neonId:'barracks_enemy',
    frames:{mdc_nw:0, mdc_ne:2, mdc_sw:4, mdc_ultra:0},
    w:5, h:5, overhang:1.08, heightScale:1 },
  wasteMega:{ w:11, h:9, overhang:1.45, spots:[{tx:80,ty:71},{tx:111,ty:70},{tx:101,ty:91},{tx:72,ty:92,variant:4,frame:7}] },
};

let CAMPAIGN = hubDefaultCampaign();

function hubDefaultCampaign(){
  return {
    mode:'combat',
    m3:0,
    nextMapIndex:0,
    roster:[],
    condos:{
      condo_nw:{id:'condo_nw', level:0, residents:[]},
      condo_ne:{id:'condo_ne', level:0, residents:[]},
      condo_sw:{id:'condo_sw', level:0, residents:[]},
    },
    upgrades:{},
    dispatch:{ mdcId:null, staged:[] },
    visit:0,
    gambled:false,
    lastReward:null,
  };
}
function resetHubCampaign(){ CAMPAIGN = hubDefaultCampaign(); }
function serializeHubCampaign(){ return JSON.parse(JSON.stringify(CAMPAIGN)); }
function deserializeHubCampaign(data){
  CAMPAIGN = hubDefaultCampaign();
  if(data && typeof data==='object') {
    Object.assign(CAMPAIGN, data);
    CAMPAIGN.condos = Object.assign(hubDefaultCampaign().condos, data.condos||{});
    CAMPAIGN.upgrades = data.upgrades || {};
    CAMPAIGN.dispatch = Object.assign({mdcId:null, staged:[]}, data.dispatch||{});
  }
}
function hubOwnerCtrl(){ return 'p1'; }
function hubCanAct(){
  return netRole==='solo' || LOCAL_CTRL===hubOwnerCtrl();
}

function hubUnitKey(u){
  if(!u) return '';
  if(u.hero && u.heroId) return 'hero:'+u.heroId;
  if(u.lore && u.lore.seed!=null) return 'lore:'+u.lore.seed;
  if(!u.hubKey) u.hubKey = 'unit:'+(u.id||0)+':'+(u.type||'unit')+':'+((typeof G!=='undefined'&&G&&G.runSalt)||0);
  return u.hubKey;
}
function hubSnapUnit(u){
  const key=hubUnitKey(u);
  return { key, type:u.type, stars:u.stars||0, xp:u.xp||0, lore:u.lore||null,
    hero:!!u.hero, heroId:u.heroId||null, spriteType:u.spriteType||null, hp:u.hp, maxHp:u.maxHp };
}
function hubBuildRosterFromCombat(state){
  const seen=new Set(), out=[];
  for(const u of state.entities){
    if(u.dead || u.owner!=='player' || u.kind!=='unit') continue;
    if(netRole!=='solo' && (u.ctrl||'p1')!==hubOwnerCtrl()) continue;
    if(u.type==='worker' && !(u.lore || u.hero)) continue; // ordinary interns do not move into the HUB roster
    const key=hubUnitKey(u); if(seen.has(key)) continue;
    seen.add(key); out.push(hubSnapUnit(u));
  }
  CAMPAIGN.roster = out;
  const condoIds=Object.keys(CAMPAIGN.condos);
  out.forEach((r,i)=>{
    let already=false;
    for(const id of condoIds) if((CAMPAIGN.condos[id].residents||[]).includes(r.key)) already=true;
    if(!already) CAMPAIGN.condos[condoIds[i%condoIds.length]].residents.push(r.key);
  });
}

function hubEnsureStats(state){
  return state.hubStats || (state.hubStats={unitKills:0, buildingKills:0, hqKills:0});
}
function hubRecordKill(state, victim){
  if(!state || !victim || victim.owner!=='enemy') return;
  const s=hubEnsureStats(state);
  if(victim.kind==='unit') s.unitKills++;
  else if(victim.kind==='building'){ s.buildingKills++; if(victim.type==='hq') s.hqKills++; }
}
function hubRewardFor(state){
  const s=hubEnsureStats(state), funding=Math.floor(teamGoldCollected(state)/1000)*25;
  const nonHqBuildings=Math.max(0, s.buildingKills - s.hqKills);
  return { completion:150, unitKills:s.unitKills*4, buildingKills:nonHqBuildings*25,
    hqKills:s.hqKills*100, funding, total:150+s.unitKills*4+nonHqBuildings*25+s.hqKills*100+funding };
}

function beginExtractionPhase(state){
  if(netRole!=='solo'){ state.over=true; onVictory(); return; }
  CAMPAIGN.mode='extraction';
  CAMPAIGN.nextMapIndex=Math.min(mapIndex+1, MAPS.length-1);
  state.extractReady=true;
  state.extractStarted=false;
  state.objective='Episode complete. Command any unit into an Open-Plan HQ to extract to the H.U.B.';
  state.cfg.objective=state.objective;
  for(const e of state.entities){ if(e.owner==='enemy' && e.kind==='unit') e.dead=true; }
  toast('Episode complete — send a unit into your HQ for extraction.', 0);
  refreshUI();
}
function hubIssueExtract(state, units, hq){
  if(!state || !state.extractReady || !hq || hq.type!=='hq') return false;
  units.filter(u=>u.kind==='unit'&&u.owner==='player'&&!u.storedIn).forEach(u=>{
    resetMotion(u);
    u.cmd={type:'extract', hq};
    const spot=nearestFreeAdjTile(state,hq,u.x,u.y) || {x:hq.x,y:hq.y};
    issueMoveKeepCmd(state,u,spot.x,spot.y);
  });
  spawnRing(hq.x,hq.y,'#ffd24a');
  toast('Episode complete — extraction begins when a unit reaches your HQ.', 0);
  return true;
}
function hubBuildingRoofPoint(b){
  const px=b.tx*TILE, py=b.ty*TILE, w=b.w*TILE, h=b.h*TILE;
  const spr=(typeof buildingSprite==='function') ? buildingSprite(b.type,b.owner) : null;
  if(spr){
    const overhang = b.type==='turret'?1.18:1.08;
    const tall = b.type==='hq'?1.5625:1;
    const dw=w*overhang, dh=dw*(spr.fh/spr.fw)*tall;
    const dx=px+(w-dw)/2, dy=py+h-dh+2;
    return { x:dx+dw/2, y:dy+dh*0.08+TILE*2 };
  }
  return { x:b.x, y:py+TILE*0.35 };
}
function hubArriveExtract(state, u, hq){
  if(u && hq && !u.storedIn){
    resetMotion(u);
    u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
    u.storedIn=hq.id; u.x=hq.x; u.y=hq.y; u.selected=false;
    state.selection=state.selection.filter(e=>e!==u);
    refreshUI();
  }
  if(state.extractStarted) return;
  state.extractStarted=true;
  if(typeof clearToast==='function') clearToast();
  const z=state.zoom||1, sx=state.camX-3*TILE, sy=state.camY+viewH()/z+2*TILE;
  const roof=hubBuildingRoofPoint(hq);
  state.extractFlight={ phase:'in', t:0, x:sx, y:sy, hqX:roof.x, hqY:roof.y,
    exitX: hq.x < state.W*TILE/2 ? -4*TILE : state.W*TILE+4*TILE, exitY:hq.y-TILE*5 };
  toast('Buzzword Bomber inbound.');
}
function updateExtraction(state, dt){
  const f=state.extractFlight; if(!f) return;
  f.t+=dt;
  const flySpeed=((DEF.bomber&&DEF.bomber.speed)||1.7)*TILE;
  const step=(tx,ty,spd)=>{
    const dx=tx-f.x, dy=ty-f.y, d=Math.hypot(dx,dy);
    if(d<4) return true;
    const s=spd*dt; f.x+=dx/d*Math.min(s,d); f.y+=dy/d*Math.min(s,d); return false;
  };
  if(f.phase==='in' && step(f.hqX,f.hqY,flySpeed)){ f.phase='hover'; f.t=0; }
  else if(f.phase==='hover' && f.t>1.6){ f.phase='out'; f.t=0; }
  else if(f.phase==='out' && step(f.exitX,f.exitY,flySpeed)){ enterHubFromCombat(state); }
}
function drawExtractionFlight(state){
  const f=state.extractFlight; if(!f) return;
  const u={type:'bomber', owner:'player', x:f.x, y:f.y, air:true, r:16, _face:f.phase==='out'?(f.exitX<f.x?-1:1):(f.hqX<f.x?-1:1)};
  const anim=unitWalk('bomber','player');
  if(anim && anim.ready) blitFrame(u,f.x,f.y,anim,UNIT_SPRITE_H.bomber, ((state.time*8)|0)%anim.frames.length);
  else { ctx.fillStyle='#7fd6ff'; ctx.beginPath(); ctx.arc(f.x,f.y,18,0,Math.PI*2); ctx.fill(); }
}
function enterHubFromCombat(state){
  const reward=hubRewardFor(state);
  CAMPAIGN.m3 += reward.total;
  CAMPAIGN.lastReward=reward;
  hubBuildRosterFromCombat(state);
  if(typeof captureHeroes==='function') captureHeroes(state);
  CAMPAIGN.mode='hub'; CAMPAIGN.visit++; CAMPAIGN.gambled=false; CAMPAIGN.dispatch={mdcId:null, staged:[]};
  G=newHubMap();
  mapIndex = Math.max(0, Math.min(CAMPAIGN.nextMapIndex, MAPS.length-1));
  if(typeof resetDialogs==='function') resetDialogs();
  syncHud(); clampCam(G); computeFog(G); refreshUI(); running=true;
  if(netRole==='host' && typeof mpHostEnterHub==='function') mpHostEnterHub();
  toast('Arrived at the H.U.B. — M3$ +'+reward.total);
}

function hubHash01(x,y,salt){
  const n=Math.sin(x*127.1 + y*311.7 + salt*74.7)*43758.5453;
  return n-Math.floor(n);
}
function hubSmooth(t){ return t*t*(3-2*t); }
function hubValueNoise(x,y,salt){
  const x0=Math.floor(x), y0=Math.floor(y), u=hubSmooth(x-x0), v=hubSmooth(y-y0);
  const a=hubHash01(x0,y0,salt), b=hubHash01(x0+1,y0,salt), c=hubHash01(x0,y0+1,salt), d=hubHash01(x0+1,y0+1,salt);
  return (a+(b-a)*u) + ((c+(d-c)*u) - (a+(b-a)*u))*v;
}
function hubWasteEdgeNoise(x,y){
  return hubValueNoise(x*0.18,y*0.18,17)*0.72 + hubValueNoise(x*0.47+8,y*0.47-6,29)*0.28;
}
function hubInWasteland(x,y){
  const w=HUB.wasteland;
  if(x<w.x0 || x>w.x1 || y<w.y0 || y>w.y1) return false;
  const edge=Math.min(x-w.x0, w.x1-x, y-w.y0, w.y1-y);
  if(edge>=5) return true;
  return edge + hubWasteEdgeNoise(x,y)*4.4 > 3.35;
}
function hubSetCell(tiles,biome,W,H,x,y,t,b){
  if(x<0||y<0||x>=W||y>=H) return;
  const i=y*W+x;
  tiles[i]=t; biome[i]=b;
}
function hubStampDisk(tiles,biome,W,H,cx,cy,r,t,b,pred){
  const R=Math.ceil(r);
  for(let y=-R;y<=R;y++) for(let x=-R;x<=R;x++){
    if(x*x+y*y>r*r) continue;
    const tx=Math.round(cx+x), ty=Math.round(cy+y);
    if(pred && !pred(tx,ty)) continue;
    hubSetCell(tiles,biome,W,H,tx,ty,t,b);
  }
}
function hubStampRect(tiles,biome,W,H,x0,y0,w,h,t,b){
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) hubSetCell(tiles,biome,W,H,x,y,t,b);
}
function hubCarvePath(tiles,biome,W,H,points,width,fn){
  for(let i=0;i<points.length-1;i++){
    const a=points[i], b=points[i+1], dx=b.x-a.x, dy=b.y-a.y;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*1.5));
    for(let s=0;s<=steps;s++){
      const p=s/steps, x=a.x+dx*p, y=a.y+dy*p;
      fn(x,y,width);
    }
  }
}
function hubCarveRiver(tiles,biome,W,H,points,width){
  hubCarvePath(tiles,biome,W,H,points,width,(x,y,w)=>{
    hubStampDisk(tiles,biome,W,H,x,y,w,T_WATER,B_WATER,(tx,ty)=>!hubInWasteland(tx,ty));
  });
}
function hubCarveRoad(tiles,biome,W,H,points,width){
  hubCarvePath(tiles,biome,W,H,points,width,(x,y,w)=>{
    const R=Math.ceil(w);
    for(let yy=-R;yy<=R;yy++) for(let xx=-R;xx<=R;xx++){
      if(xx*xx+yy*yy>w*w) continue;
      const tx=Math.round(x+xx), ty=Math.round(y+yy);
      hubSetCell(tiles,biome,W,H,tx,ty,T_DIRT,hubInWasteland(tx,ty)?B_DESERT:B_GRASS);
    }
  });
}
function hubBuildTerrain(W,H,rng){
  const tiles=new Array(W*H), variant=new Array(W*H), biome=new Array(W*H);
  const grassNoise=makeNoise2D(4242 + CAMPAIGN.visit*31);
  const wasteNoise=makeNoise2D(9001 + CAMPAIGN.visit*37);

  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=y*W+x;
    variant[i]=rng();
    tiles[i]=T_GRASS;
    biome[i]=B_GRASS;
  }

  // Southeast blast zone: all land inside the wasteland is desert/sand, with
  // occasional volcanic scorch and rocks. No water is allowed to cut through it.
  const waste=HUB.wasteland;
  for(let y=waste.y0;y<=waste.y1;y++) for(let x=waste.x0;x<=waste.x1;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    if(!hubInWasteland(x,y)) continue;
    const i=y*W+x;
    const scorch=wasteNoise.fbm(x*0.12,y*0.12,3);
    const grit=wasteNoise.fbm(x*0.34+80,y*0.34+80,2);
    biome[i]=scorch>0.66 ? B_VOLCANIC : B_DESERT;
    tiles[i]=grit>0.78 ? T_DIRT : T_GRASS;
    if(grit>0.88 || (biome[i]===B_VOLCANIC && scorch>0.70 && variant[i]>0.35)) tiles[i]=T_ROCK;
  }

  // Rivers: broad enough to survive water cleanup visually, then later roads
  // deliberately bridge them at HUB travel corridors.
  hubCarveRiver(tiles,biome,W,H,[
    {x:-2,y:24},{x:14,y:21},{x:31,y:18},{x:46,y:27},{x:64,y:30},{x:83,y:24},{x:104,y:20},{x:W+2,y:18}
  ],2.1);
  hubCarveRiver(tiles,biome,W,H,[
    {x:6,y:H+2},{x:18,y:91},{x:30,y:76},{x:45,y:66},{x:61,y:60},{x:75,y:56},{x:91,y:51},{x:W+2,y:52}
  ],2.3);
  hubCarveRiver(tiles,biome,W,H,[
    {x:4,y:51},{x:20,y:49},{x:34,y:55},{x:47,y:52},{x:58,y:45}
  ],1.5);
  addBeach(tiles,W,H);

  // Grassland topography: coherent groves and a few rock outcrops, not per-tile confetti.
  for(let y=2;y<H-2;y++) for(let x=2;x<W-2;x++){
    if(hubInWasteland(x,y)) continue;
    const i=y*W+x;
    if(tiles[i]!==T_GRASS) continue;
    const grove=grassNoise.fbm(x*0.09,y*0.09,4);
    const edge=grassNoise.fbm(x*0.19+40,y*0.19+40,2);
    if(grove>0.67 && edge>0.44 && variant[i]>0.18) tiles[i]=T_TREE;
    else if(grove<0.24 && edge>0.62 && variant[i]>0.72) tiles[i]=T_ROCK;
  }
  // Wasteland topography: sparse rock fields with hotter volcanic pockets.
  for(let y=waste.y0;y<=waste.y1;y++) for(let x=waste.x0;x<=waste.x1;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    if(!hubInWasteland(x,y)) continue;
    const i=y*W+x, rubble=wasteNoise.fbm(x*0.17+120,y*0.17+120,4);
    if(tiles[i]!==T_WATER && rubble>0.70 && variant[i]>0.20) tiles[i]=T_ROCK;
  }

  // Downtown plaza and roads: these also become bridges where they cross rivers.
  const center={x:62,y:47};
  hubStampDisk(tiles,biome,W,H,center.x,center.y,14,T_DIRT,B_GRASS);
  hubCarveRoad(tiles,biome,W,H,[{x:14,y:20},{x:29,y:27},{x:47,y:36},center],2.0);
  hubCarveRoad(tiles,biome,W,H,[{x:105,y:20},{x:92,y:30},{x:76,y:38},center],2.0);
  hubCarveRoad(tiles,biome,W,H,[{x:15,y:87},{x:28,y:78},{x:42,y:66},{x:55,y:56},center],2.0);
  hubCarveRoad(tiles,biome,W,H,[center,{x:60,y:64},{x:89,y:78}],2.1);
  hubCarveRoad(tiles,biome,W,H,[{x:89,y:78},{x:100,y:84},{x:116,y:92}],1.7);
  hubCarveRoad(tiles,biome,W,H,[{x:28,y:25},{x:40,y:22},{x:61,y:29},{x:92,y:26}],1.4);

  // Clear readable pads around every HUB point of interest after all scenery
  // placement. This prevents trees/rocks/rivers from eating entrances.
  for(const p of HUB.pois){
    const d=DEF[p.type]||{w:3,h:3};
    const pad=p.kind==='condo'?4:(p.kind==='ultra'?7:3);
    const b=hubInWasteland(p.x,p.y)?B_DESERT:B_GRASS;
    hubStampRect(tiles,biome,W,H,p.x-pad,p.y-pad,d.w+pad*2,d.h+pad*2,T_DIRT,b);
    hubStampRect(tiles,biome,W,H,p.x-1,p.y-1,d.w+2,d.h+2,T_GRASS,b);
  }

  return {tiles,variant,biome};
}

function newHubMap(){
  const W=HUB.W, H=HUB.H, rng=makeRng(424242 + CAMPAIGN.visit*17);
  const terrain=hubBuildTerrain(W,H,rng), tiles=terrain.tiles, variant=terrain.variant, biome=terrain.biome;
  const state={ cfg:{name:'H.U.B. — Hurban Ultra Buildings', enemyName:'', objective:'Spend M3rit$, stage units at an MDC, then launch the next episode.', hub:true, player:{x:60,y:58}},
    W,H,tiles,variant,biome,megaSprites:[],features:[],feat:new Uint8Array(W*H),blocked:new Uint8Array(W*H),
    explored:new Uint8Array(W*H),visible:new Uint8Array(W*H),entities:[],eco:{p1:{gold:0,supply:0,supplyCap:0,gold_collected:0}},
    players:1,nextId:1,runSalt:424242+CAMPAIGN.visit,zoom:initialZoom(W,H),camX:60*TILE-innerWidth/2,camY:58*TILE-innerHeight/2,
    selection:[],groups:{},placing:null,enemySpawnTimer:999,enemyFortifyTimer:999,graceTime:1e9,enemyWaveTimer:1e9,waveCount:0,time:0,over:false,
    sprint:{ active:false, window:0, t:0, mul:1, x:0, y:0, tapCount:0 }, hub:true, hubPois:{} };
  buildTopoFeatures(state, makeRng(424242 + CAMPAIGN.visit*17 + 909));
  for(let i=0;i<W*H;i++) state.blocked[i]=baseBlocked(state,i);
  if(typeof buildWaterDepth==='function') buildWaterDepth(state);
  hubPlacePois(state);
  hubSpawnRoster(state);
  hubRevealAll(state);
  recomputeSupply(state);
  return state;
}
function hubRevealAll(state){ state.explored.fill(1); state.visible.fill(1); }
function hubFixedMegaFrame(state, salt){
  const rng=makeRng((state.runSalt||424242)*13 + salt*97);
  return (rng()*MEGA_FRAMES)|0;
}
function hubAddCondoMega(state, e){
  if((state.megaSprites||[]).some(m=>m.hubCondo && m.poiId===e.hubPoi.id)){ e.hubMegaVisual=true; return; }
  const cfg=HUB.condoMega, frame=cfg.frames[e.hubPoi.id]||0;
  const tx=Math.round(e.tx + e.w/2 - cfg.w/2), ty=Math.round(e.ty + e.h - cfg.h);
  state.megaSprites.push({cat:'megabuilding', variant:cfg.variant, tx, ty, w:cfg.w, h:cfg.h,
    overhang:cfg.overhang, heightScale:cfg.heightScale, biome:B_TECH, seed:(e.id||1)*0.113,
    fixedFrame:frame, neon:true, hubCondo:true, poiId:e.hubPoi.id});
  e.hubMegaVisual=true;
}
function hubAddMdcVisual(e){
  const cfg=HUB.mdcVisual;
  e.hubSpriteVisual = { type:cfg.type, faction:cfg.faction, neonId:cfg.neonId,
    fixedFrame:cfg.frames[e.hubPoi.id]||0, w:cfg.w, h:cfg.h, overhang:cfg.overhang,
    heightScale:cfg.heightScale, seed:(e.id||1)*0.071 };
}
function hubRestorePoiVisuals(state){
  if(!state || !state.hub) return;
  state.megaSprites = state.megaSprites || [];
  for(const e of state.entities||[]){
    if(!e || !e.hubPoi) continue;
    if(e.hubPoi.id==='mdc_waste'){
      if(typeof markBuilding==='function') markBuilding(state,e,false);
      e.dead=true; if(state.hubPois) delete state.hubPois.mdc_waste;
      continue;
    }
    if(e.hubPoi.kind==='condo') hubAddCondoMega(state,e);
    else if(e.hubPoi.kind==='mdc') hubAddMdcVisual(e);
  }
}
function hubPlacePois(state){
  for(const p of HUB.pois){
    const e=mkBuilding(state,p.type,'neutral',p.x,p.y,true);
    e.hubPoi={id:p.id, kind:p.kind, name:p.name};
    state.hubPois[p.id]=e;
    if(p.kind==='condo') hubAddCondoMega(state,e);
    else if(p.kind==='mdc') hubAddMdcVisual(e);
  }
  state.megaSprites.push(Object.assign({cat:'megabuilding', variant:3, biome:B_TECH, seed:0.17, hubUltra:true, fixedFrame:hubFixedMegaFrame(state,3)}, HUB.ultraMega));
  for(const r of HUB.wasteMega.spots){
    state.megaSprites.push({cat:'ruin', variant:r.variant!=null?r.variant:((r.tx+r.ty)%6), tx:r.tx, ty:r.ty, w:HUB.wasteMega.w, h:HUB.wasteMega.h,
      overhang:HUB.wasteMega.overhang, biome:B_DESERT, seed:r.tx/100, hubWaste:true,
      fixedFrame:r.frame!=null?r.frame:hubFixedMegaFrame(state,r.tx+r.ty)});
  }
}
function hubSpawnRoster(state){
  const condos=Object.values(CAMPAIGN.condos), posByCondo={condo_nw:0,condo_ne:0,condo_sw:0};
  const poiById=state.hubPois;
  for(const r of CAMPAIGN.roster){
    let cid=(condos.find(c=>(c.residents||[]).includes(r.key))||condos[0]).id;
    const home=poiById[cid] || poiById.condo_nw, n=posByCondo[cid]++ || 0;
    const u=mkUnit(state,r.type,'player',home.tx+2+(n%5),home.ty+home.h+1+((n/5)|0));
    u.hubKey=r.key; u.stars=r.stars||0; u.xp=r.xp||0; u.lore=r.lore||null;
    u.hero=!!r.hero; u.heroId=r.heroId||null; u.spriteType=r.spriteType||null;
    hubApplyUpgrades(u); if(typeof applyVetHp==='function') applyVetHp(u,true);
  }
}
function hubApplyUpgrades(u){
  const up=CAMPAIGN.upgrades[hubUnitKey(u)] || {};
  const condo=hubCondoForUnit(hubUnitKey(u));
  const condoLvl=condo ? condo.level||0 : 0, implant=up.implantLevel||0;
  u.hubHpMul = 1 + condoLvl*0.04 + implant*0.03;
  u.hubDmgMul = 1 + implant*0.03;
  if(up.styleId) u.hubStyle=up.styleId;
}
function hubCondoForUnit(key){ return Object.values(CAMPAIGN.condos).find(c=>(c.residents||[]).includes(key)); }

function updateHub(state, dt){
  hubRevealAll(state);
  for(const u of state.entities){
    if(u.dead||u.kind!=='unit'||u.owner!=='player') continue;
    if(u.cmd && u.cmd.type==='hubpoi'){
      const poi=u.cmd.poi;
      if(!poi||poi.dead){ u.cmd=null; continue; }
      if(dist(u,poi) < entRadius(poi)+18){ u.cmd=null; u.state='idle'; hubUnitArrivedPoi(state,u,poi); }
    }
  }
}
function hubCommandPoi(state, units, poi){
  if(!state||!state.hub||!poi||!poi.hubPoi) return false;
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return true; }
  units.filter(u=>u.kind==='unit'&&u.owner==='player').forEach(u=>{
    resetMotion(u); u.cmd={type:'hubpoi', poi};
    const spot=nearestFreeAdjTile(state,poi,u.x,u.y) || {x:poi.x,y:poi.y};
    issueMoveKeepCmd(state,u,spot.x,spot.y);
  });
  spawnRing(poi.x,poi.y,'#ffd24a');
  toast('Heading to '+poi.hubPoi.name);
  return true;
}
function hubUnitArrivedPoi(state,u,poi){
  const p=poi.hubPoi;
  if(p.kind==='mdc') hubStageUnit(u,p.id,poi);
  else if(p.kind==='condo') hubShowCondo(p.id);
  else if(p.kind==='ultra') hubShowUltra(u);
}
function hubEnlistedKeys(){
  CAMPAIGN.dispatch = Object.assign({mdcId:null, staged:[]}, CAMPAIGN.dispatch||{});
  const staged=CAMPAIGN.dispatch.staged||[];
  const seen=new Set(), out=[];
  staged.forEach(k=>{ if(k && !seen.has(k)){ seen.add(k); out.push(k); } });
  CAMPAIGN.dispatch.staged=out;
  return out;
}
function hubEnlistedUnits(state){
  if(!state) return [];
  const keys=new Set(hubEnlistedKeys());
  for(const mdc of (state.entities||[])){
    if(!mdc||mdc.dead||!mdc.hubPoi||mdc.hubPoi.kind!=='mdc') continue;
    const ids=mdc.storedUnits||[];
    for(const id of ids){
      const u=(state.entities||[]).find(e=>e&&e.id===id&&!e.dead&&e.storedIn===mdc.id);
      if(u&&u.owner==='player'&&u.kind==='unit') keys.add(hubUnitKey(u));
    }
  }
  const live=(state.entities||[]).filter(u=>u&&!u.dead&&u.owner==='player'&&u.kind==='unit'&&keys.has(hubUnitKey(u)));
  if(live.length!==keys.size) CAMPAIGN.dispatch.staged=live.map(u=>hubUnitKey(u));
  else CAMPAIGN.dispatch.staged=Array.from(keys);
  return live;
}
function hubFindMdcById(state,mdcId){
  if(!state) return null;
  if(state.hubPois && state.hubPois[mdcId]) return state.hubPois[mdcId];
  return (state.entities||[]).find(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.id===mdcId) || null;
}
function hubMdcForStoredUnit(state,u){
  if(!state||!u||!u.storedIn) return null;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.id===u.storedIn&&e.hubPoi&&e.hubPoi.kind==='mdc') || null;
}
function hubStageUnit(u,mdcId,mdc){
  if(!hubCanAct()) return;
  if(!G||!G.hub||!u||u.dead||u.owner!=='player'||u.kind!=='unit') return;
  mdc = mdc || hubFindMdcById(G,mdcId);
  if(!mdc||!mdc.hubPoi||mdc.hubPoi.kind!=='mdc') return;
  const key=hubUnitKey(u);
  hubEnlistedKeys();
  CAMPAIGN.dispatch.mdcId=mdcId;
  if(!CAMPAIGN.dispatch.staged.includes(key)) CAMPAIGN.dispatch.staged.push(key);
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=mdc.id; u.x=mdc.x; u.y=mdc.y;
  mdc.storedUnits=(mdc.storedUnits||[]).filter(id=>id!==u.id);
  mdc.storedUnits.push(u.id);
  u.selected=false;
  G.selection=G.selection.filter(e=>e!==u);
  spawnRing(mdc.x,mdc.y,'#ffd24a');
  toast((u.heroId||DEF[u.type].name)+' enlisted at '+mdc.hubPoi.name+'.');
  if(typeof hqStoredUnits==='function') hqStoredUnits(G,mdc);
  refreshUI();
}
function hubReleaseFromMdc(unitKey){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  if(!G||!G.hub||!unitKey) return false;
  const u=(G.entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&hubUnitKey(e)===unitKey);
  if(!u) return false;
  const mdc=hubMdcForStoredUnit(G,u) || hubFindMdcById(G,CAMPAIGN.dispatch&&CAMPAIGN.dispatch.mdcId);
  CAMPAIGN.dispatch.staged=hubEnlistedKeys().filter(k=>k!==unitKey);
  if(mdc && u.storedIn===mdc.id){
    const spot=(typeof hqExitTile==='function') ? hqExitTile(G,mdc,u.id) : null;
    if(!spot){ toast('No room outside MDC'); CAMPAIGN.dispatch.staged.push(unitKey); return false; }
    mdc.storedUnits=(mdc.storedUnits||[]).filter(id=>id!==u.id);
    delete u.storedIn;
    u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2;
    resetMotion(u); u.cmd=null; u.state='idle'; u.selected=false;
    spawnRing(u.x,u.y,'#7fd6ff');
  }
  toast((DEF[u.type].name||'Unit')+' removed from dispatch.');
  refreshUI();
  return true;
}
function hubDispatchNextEpisode(){
  if(!hubCanAct()){ toast('Only the host can launch from the H.U.B.'); return; }
  const live=hubEnlistedUnits(G).filter(u=>(u.ctrl||'p1')===hubOwnerCtrl());
  if(!live.length){ toast('Enlist at least one unit at an MDC.'); return; }
  const heroes=live.filter(u=>u.hero), vets=live.filter(u=>!u.hero);
  setCarryover(vets); captureHeroes({entities:heroes});
  CAMPAIGN.mode='combat';
  const idx=Math.max(0, Math.min(CAMPAIGN.nextMapIndex, MAPS.length-1));
  mapIndex=idx;
  showCrawl(idx, ()=>loadMap(idx));
}
function hubLaunchNextEpisode(){ hubDispatchNextEpisode(); }
function hubSpend(cost){
  if(!hubCanAct()){ toast('Only the host can spend M3rit$.'); return false; }
  if(CAMPAIGN.m3 < cost){ toast('Not enough M3rit$'); return false; }
  CAMPAIGN.m3-=cost; return true;
}
function hubUpgradeSelectedCondo(){
  if(!hubCanAct()){ toast('Only the host can upgrade the H.U.B.'); return; }
  const poi=G&&G.selection[0]; if(!poi||!poi.hubPoi||poi.hubPoi.kind!=='condo') return;
  const c=CAMPAIGN.condos[poi.hubPoi.id], lvl=c.level||0, cost=HUB.condoCosts[lvl];
  if(cost==null){ toast('Condo already maxed'); return; }
  if(hubSpend(cost)){ c.level=lvl+1; toast('Condo upgraded to level '+c.level); refreshUI(); }
}
function hubUpgradeSelectedUnit(kind){
  if(!hubCanAct()){ toast('Only the host can upgrade H.U.B. residents.'); return; }
  const u=G&&G.selection.find(e=>e.kind==='unit'&&e.owner==='player'); if(!u){ toast('Select a resident first'); return; }
  const key=hubUnitKey(u), up=CAMPAIGN.upgrades[key]||(CAMPAIGN.upgrades[key]={});
  if(kind==='implant'){
    const lvl=up.implantLevel||0, cost=HUB.implantCosts[lvl];
    if(cost==null){ toast('Implants already maxed'); return; }
    if(hubSpend(cost)){ up.implantLevel=lvl+1; hubApplyUpgrades(u); applyVetHp(u,true); toast('Implant level '+up.implantLevel); }
  } else if(kind==='style'){
    if(up.styleId){ toast('Style already purchased'); return; }
    if(hubSpend(HUB.styleCost)){ up.styleId='neon-'+((key.length%5)+1); u.hubStyle=up.styleId; toast('Style purchased'); }
  } else if(kind==='academy'){
    if(up.academyVisit===CAMPAIGN.visit){ toast('Already trained this HUB visit'); return; }
    if(hubSpend(HUB.academyCost)){ up.academyVisit=CAMPAIGN.visit; u.xp=(u.xp||0)+80; toast('Academy training complete'); }
  }
  refreshUI();
}
function hubGamble(){
  if(!hubCanAct()){ toast('Only the host can speculate at ULTRA.'); return; }
  if(CAMPAIGN.gambled){ toast('The kiosk already liquidated your optimism.'); return; }
  if(!hubSpend(HUB.gambleStake)) return;
  CAMPAIGN.gambled=true;
  const win=((CAMPAIGN.visit*37 + CAMPAIGN.m3)%3)===0;
  if(win){ CAMPAIGN.m3+=260; toast('Speculation paid out: M3$260'); }
  else toast('Speculation failed. The market calls it learning.');
  refreshUI();
}
function hubShowCondo(id){ const c=CAMPAIGN.condos[id]; toast('Condo level '+(c.level||0)+' — residents: '+(c.residents||[]).length); }
function hubShowUltra(u){ toast('ULTRA services unlocked for '+((u&&u.heroId)||'resident')+'.'); }

function drawHubOverlays(state){
  if(!state||!state.hub) return;
  const w=HUB.wasteland;
  ctx.save();
  ctx.fillStyle='rgba(80,255,120,0.022)';
  ctx.strokeStyle='rgba(110,255,120,0.18)'; ctx.lineWidth=2;
  ctx.beginPath();
  for(let y=w.y0;y<=w.y1;y++) for(let x=w.x0;x<=w.x1;x++){
    if(!hubInWasteland(x,y)) continue;
    ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
    if(!hubInWasteland(x-1,y)){ ctx.moveTo(x*TILE,y*TILE); ctx.lineTo(x*TILE,(y+1)*TILE); }
    if(!hubInWasteland(x+1,y)){ ctx.moveTo((x+1)*TILE,y*TILE); ctx.lineTo((x+1)*TILE,(y+1)*TILE); }
    if(!hubInWasteland(x,y-1)){ ctx.moveTo(x*TILE,y*TILE); ctx.lineTo((x+1)*TILE,y*TILE); }
    if(!hubInWasteland(x,y+1)){ ctx.moveTo(x*TILE,(y+1)*TILE); ctx.lineTo((x+1)*TILE,(y+1)*TILE); }
  }
  ctx.stroke();
  ctx.restore();
}
function hubCameraInWasteland(state){
  if(!state||!state.hub) return false;
  const z=state.zoom||1, cx=(state.camX+viewW()/z/2)/TILE, cy=(state.camY+viewH()/z/2)/TILE;
  return hubInWasteland(cx,cy);
}
