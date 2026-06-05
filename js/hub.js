/* hub.js — H.U.B. campaign layer: extraction, M3rit$, non-combat hub map,
   condos, ULTRA HQ services, M.D.C. deployment, and Wasteland overlays. Classic
   globals by design; loaded after map.js and before units/ui/core. */

const HUB_SCHEMA_ROOT = (typeof window !== 'undefined') ? window : globalThis;
const HUB_PLACEMENT = (typeof HUB_SCHEMA_ROOT.hubNormalizeMapData === 'function')
  ? HUB_SCHEMA_ROOT.hubNormalizeMapData(HUB_SCHEMA_ROOT.HUB_MAP_DATA || null)
  : (HUB_SCHEMA_ROOT.HUB_MAP_DEFAULTS ? JSON.parse(JSON.stringify(HUB_SCHEMA_ROOT.HUB_MAP_DEFAULTS)) : {W:124,H:102,player:{x:60,y:58},wasteland:{x0:66,y0:68,x1:123,y1:101},pois:[],rivers:[],bridges:[],megaSprites:[],buildings:[],topography:[]});

const HUB = Object.assign({
  nextId:1,
  mdcCap:4,
  condoCosts:[200,400,700,1100,1600],
  implantCosts:[150,300,550,900,1400],
  styleCost:120,
  academyCost:250,
  gambleStake:100,
  // ---- Training Grounds tunables ----
  trainHourSeconds:3600,  // real seconds of ACTIVE play per "in-game hour" of training (1h = 1 real hour)
  trainPairCap:6,         // max simultaneous training sessions (pairs)
  trainMaxGap:6,          // max level difference allowed between mentor and junior
}, HUB_PLACEMENT);

function hubBiomeId(v, fallback){
  if(typeof v === 'number') return v;
  const map = {grass:B_GRASS, mountain:B_MOUNTAIN, water:B_WATER, tech:B_TECH, desert:B_DESERT, ice:B_ICE, volcanic:B_VOLCANIC};
  return map[v] != null ? map[v] : (fallback == null ? B_GRASS : fallback);
}
function hubTags(o){ return Array.isArray(o&&o.tags) ? o.tags : []; }
function hubHasTag(o, tag){ return hubTags(o).indexOf(tag) >= 0; }
function hubPoiConfig(id){ return (HUB.pois||[]).find(p=>p.id===id) || null; }
function hubCondoIds(){ return (HUB.pois||[]).filter(p=>p.kind==='condo').map(p=>p.id); }
function hubNormalizePlacementData(data){
  if(typeof HUB_SCHEMA_ROOT.hubNormalizeMapData === 'function') return HUB_SCHEMA_ROOT.hubNormalizeMapData(data || null);
  return data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : JSON.parse(JSON.stringify(HUB_PLACEMENT));
}
function hubSyncCampaignCondos(){
  const existing = (typeof CAMPAIGN !== 'undefined' && CAMPAIGN && CAMPAIGN.condos) ? CAMPAIGN.condos : {};
  const next = {};
  for(const id of hubCondoIds()) next[id] = Object.assign({id, level:0, residents:[]}, existing[id] || {});
  for(const id in existing) if(!next[id]) next[id] = existing[id];
  if(typeof CAMPAIGN !== 'undefined' && CAMPAIGN) CAMPAIGN.condos = next;
}
function hubApplyPlacementData(data){
  const normalized = hubNormalizePlacementData(data);
  Object.assign(HUB, normalized);
  hubSyncCampaignCondos();
  return normalized;
}
function hubBuildPreviewMap(data){
  hubApplyPlacementData(data);
  const state = newHubMap();
  hubRevealAll(state);
  state.selection = [];
  state.placing = null;
  state.time = 0;
  return state;
}

let CAMPAIGN = hubDefaultCampaign();

function hubDefaultCampaign(){
  const condos = {};
  for(const id of hubCondoIds()) condos[id] = {id, level:0, residents:[]};
  return {
    mode:'combat',
    m3:0,
    nextMapIndex:0,
    roster:[],
    condos,
    upgrades:{},
    dispatch:{ mdcId:null, staged:[] },
    training:{ staged:[], sessions:[] },
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
    const defaults = hubDefaultCampaign();
    Object.assign(CAMPAIGN, data);
    CAMPAIGN.condos = Object.assign(defaults.condos, data.condos||{});
    CAMPAIGN.upgrades = data.upgrades || {};
    CAMPAIGN.dispatch = Object.assign({mdcId:null, staged:[]}, data.dispatch||{});
    // legacy-safe: saves predating the Training Grounds simply load with empty training
    CAMPAIGN.training = Object.assign({staged:[], sessions:[]}, data.training||{});
    if(!Array.isArray(CAMPAIGN.training.staged)) CAMPAIGN.training.staged=[];
    if(!Array.isArray(CAMPAIGN.training.sessions)) CAMPAIGN.training.sessions=[];
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
  // Solo player-controlled extraction: only Lv2+ units garrisoned inside an HQ carry over.
  // Co-op / other paths have no garrison step, so they keep the legacy "all but plain interns" rule.
  const requireGarrison = !!(state.extractReady && netRole==='solo');
  for(const u of state.entities){
    if(u.dead || u.owner!=='player' || u.kind!=='unit') continue;
    if(netRole!=='solo' && (u.ctrl||'p1')!==hubOwnerCtrl()) continue;
    if(requireGarrison){
      if(!u.storedIn) continue;        // only units garrisoned inside an HQ are extracted
      if((u.stars||0) < 2) continue;   // only Level 2+ veterans carry over to the H.U.B.
    } else if(u.type==='worker' && !(u.lore || u.hero)){
      continue;                        // legacy path: ordinary interns do not move into the HUB roster
    }
    const key=hubUnitKey(u); if(seen.has(key)) continue;
    seen.add(key); out.push(hubSnapUnit(u));
  }
  CAMPAIGN.roster = out;
  const condoIds=Object.keys(CAMPAIGN.condos);
  if(!condoIds.length) return;
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
  state.objective='Episode complete. Garrison your survivors inside an Open-Plan HQ (only Lv2+ are extracted), then press Extraction.';
  state.cfg.objective=state.objective;
  for(const e of state.entities){ if(e.owner==='enemy' && e.kind==='unit') e.dead=true; }
  toast('Episode complete — garrison units in your HQ, then launch Extraction.', 0);
  refreshUI();
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
// Launch the Buzzword Bomber cinematic over `hq`. The flight (updateExtraction) carries the
// player to the H.U.B. when it finishes. Guarded so it can only fire once.
function hubStartExtractFlight(state, hq){
  if(!state || !hq || hq.dead || state.extractStarted) return;
  state.extractStarted=true;
  if(typeof clearToast==='function') clearToast();
  const z=state.zoom||1, sx=state.camX-3*TILE, sy=state.camY+viewH()/z+2*TILE;
  const roof=hubBuildingRoofPoint(hq);
  state.extractFlight={ phase:'in', t:0, x:sx, y:sy, hqX:roof.x, hqY:roof.y,
    exitX: hq.x < state.W*TILE/2 ? -4*TILE : state.W*TILE+4*TILE, exitY:hq.y-TILE*5 };
  toast('Buzzword Bomber inbound.');
}
// Player veterans (Lv2+) still in the field — NOT garrisoned in any HQ. These are lost on extraction.
function strandedVets(state){
  return (state.entities||[]).filter(u =>
    u && !u.dead && u.owner==='player' && u.kind==='unit' &&
    !u.storedIn && (u.stars||0) >= 2);
}
// HQ "Extraction" button action: validate, warn about stranded veterans, then launch the bomber.
function tryStartExtraction(){
  const state=G;
  if(!state || !state.extractReady || netRole!=='solo') return;
  const hq=(typeof selectedBuilding==='function') ? selectedBuilding('hq') : null;
  if(!hq){ toast('Select your HQ to launch extraction.'); return; }
  if(typeof hqStoredUnits!=='function' || hqStoredUnits(state,hq).length===0){
    toast('Garrison at least one unit inside the HQ first.'); return;   // guards the disabled-button click
  }
  const stranded=strandedVets(state);
  if(stranded.length){ showExtractConfirm(state, hq, stranded.length); return; }
  hubStartExtractFlight(state, hq);
}
// Pause + confirm modal shown when Lv2+ veterans would be left behind.
function showExtractConfirm(state, hq, n){
  const el=document.getElementById('extractConfirm');
  if(!el){ hubStartExtractFlight(state, hq); return; }   // no modal element → fail open
  running=false;
  if(typeof resetInputState==='function') resetInputState();
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  el.className='overlay';
  el.innerHTML=`<div class="big">🚁</div><h1>LEAVE THEM BEHIND?</h1>
    <h2>${n} veteran${n===1?'':'s'} still outside the HQ</h2>
    <p>Only Level&nbsp;2+ units <b>inside</b> an Open-Plan HQ extract to the H.U.B.
       ${n} eligible veteran${n===1?' is':'s are'} still in the field and will be lost forever.</p>
    <button class="btn" id="extractGo">▶ Extract anyway</button>
    <button class="btn" id="extractCancel">◀ Keep fighting</button>`;
  el.style.display='flex';
  const close=()=>{ el.style.display='none'; el.innerHTML=''; };
  const resume=()=>{ running=true; if(typeof syncPauseBtn==='function') syncPauseBtn(); };
  document.getElementById('extractGo').onclick=()=>{ close(); resume(); hubStartExtractFlight(state, hq); };
  document.getElementById('extractCancel').onclick=()=>{ close(); resume(); refreshUI(); };
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
  if(typeof syncPauseBtn==='function') syncPauseBtn();
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
function hubCarveRiver(tiles,biome,W,H,points,width,riverMask){
  hubCarvePath(tiles,biome,W,H,points,width,(x,y,w)=>{
    const R=Math.ceil(w);
    for(let yy=-R;yy<=R;yy++) for(let xx=-R;xx<=R;xx++){
      if(xx*xx+yy*yy>w*w) continue;
      const tx=Math.round(x+xx), ty=Math.round(y+yy);
      if(tx<0||ty<0||tx>=W||ty>=H || hubInWasteland(tx,ty)) continue;
      hubSetCell(tiles,biome,W,H,tx,ty,T_WATER,B_WATER);
      if(riverMask) riverMask[ty*W+tx]=1;
    }
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
function hubRestoreRivers(tiles,biome,W,H,riverMask){
  if(!riverMask) return;
  for(let i=0;i<W*H;i++){
    if(!riverMask[i]) continue;
    tiles[i]=T_WATER; biome[i]=B_WATER;
  }
}
function hubStampBridgeDeck(tiles,biome,W,H,bridge){
  const w=Math.max(3,bridge.w|0), h=Math.max(3,bridge.h|0);
  const x0=Math.round(bridge.x - w/2), y0=Math.round(bridge.y - h/2);
  const rx=w/2, ry=h/2;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const tx=x0+x, ty=y0+y;
    if(tx<0||ty<0||tx>=W||ty>=H) continue;
    const dx=Math.abs((x+0.5)-rx), dy=Math.abs((y+0.5)-ry);
    const edgeX=Math.max(0, dx-(rx-1.1)), edgeY=Math.max(0, dy-(ry-1.1));
    if(edgeX*edgeX + edgeY*edgeY > 1.65) continue;
    hubSetCell(tiles,biome,W,H,tx,ty,T_DIRT,B_TECH);
  }
}
function hubStampBridges(tiles,biome,W,H){
  for(const bridge of HUB.bridges) hubStampBridgeDeck(tiles,biome,W,H,bridge);
}
function hubBuildTerrain(W,H,rng){
  const tiles=new Array(W*H), variant=new Array(W*H), biome=new Array(W*H);
  const riverMask=new Uint8Array(W*H);
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

  // Rivers either enter/leave the map edge or join another river. A river mask
  // lets POI pads clean their entrances without permanently chopping streams.
  for(const river of HUB.rivers) hubCarveRiver(tiles,biome,W,H,river.points,river.width,riverMask);
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
    const d=Object.assign({}, DEF[p.type]||{w:3,h:3}, {w:p.w||((DEF[p.type]||{}).w||3), h:p.h||((DEF[p.type]||{}).h||3)});
    const pad=p.kind==='condo'?4:(p.kind==='ultra'?7:3);
    const b=hubInWasteland(p.x,p.y)?B_DESERT:B_GRASS;
    hubStampRect(tiles,biome,W,H,p.x-pad,p.y-pad,d.w+pad*2,d.h+pad*2,T_DIRT,b);
    hubStampRect(tiles,biome,W,H,p.x-1,p.y-1,d.w+2,d.h+2,T_GRASS,b);
  }
  hubRestoreRivers(tiles,biome,W,H,riverMask);
  addBeach(tiles,W,H);
  hubStampBridges(tiles,biome,W,H);

  return {tiles,variant,biome};
}

function newHubMap(){
  const W=HUB.W, H=HUB.H, rng=makeRng(424242 + CAMPAIGN.visit*17);
  const terrain=hubBuildTerrain(W,H,rng), tiles=terrain.tiles, variant=terrain.variant, biome=terrain.biome;
  const start=HUB.player || {x:60,y:58};
  const state={ cfg:{name:'H.U.B. — Hurban Ultra Buildings', enemyName:'', objective:'Spend m3rit$ in upgrades, send units to a red M.D.C., then launch the next mission there.', hub:true, player:{x:start.x,y:start.y}},
    W,H,tiles,variant,biome,megaSprites:[],features:[],feat:new Uint8Array(W*H),blocked:new Uint8Array(W*H),
    explored:new Uint8Array(W*H),visible:new Uint8Array(W*H),entities:[],eco:{p1:{gold:0,supply:0,supplyCap:0,gold_collected:0}},
    players:1,nextId:1,runSalt:424242+CAMPAIGN.visit,zoom:initialZoom(W,H),camX:start.x*TILE-innerWidth/2,camY:start.y*TILE-innerHeight/2,
    selection:[],groups:{},placing:null,enemySpawnTimer:999,enemyFortifyTimer:999,graceTime:1e9,enemyWaveTimer:1e9,waveCount:0,time:0,over:false,
    sprint:{ active:false, window:0, t:0, mul:1, x:0, y:0, tapCount:0 }, hub:true, hubPois:{} };
  if(HUB.topography && HUB.topography.length) hubApplyTopography(state, HUB.topography);
  else buildTopoFeatures(state, makeRng(424242 + CAMPAIGN.visit*17 + 909));
  for(let i=0;i<W*H;i++) state.blocked[i]=baseBlocked(state,i);
  if(typeof buildWaterDepth==='function') buildWaterDepth(state);
  hubPlacePois(state);
  hubSpawnRoster(state);
  if(typeof hubSpawnTrainees==='function') hubSpawnTrainees(state);
  hubRevealAll(state);
  recomputeSupply(state);
  return state;
}
function hubRevealAll(state){ state.explored.fill(1); state.visible.fill(1); }
function hubFixedMegaFrame(state, salt){
  const rng=makeRng((state.runSalt||424242)*13 + salt*97);
  return (rng()*MEGA_FRAMES)|0;
}
function hubFeatureBlockFrom(h){ return Math.max(0, h - (h>>1)); }
function hubApplyTopography(state, list){
  const W=state.W, H=state.H;
  for(const src of list||[]){
    const fw=Math.max(1, src.w|0), fh=Math.max(1, src.h|0);
    const tx=src.tx|0, ty=src.ty|0;
    if(tx>=W || ty>=H || tx+fw<=0 || ty+fh<=0) continue;
    let claimed=false, bsrc=-1;
    for(let y=0;y<fh;y++) for(let x=0;x<fw;x++){
      const gx=tx+x, gy=ty+y; if(gx<0||gy<0||gx>=W||gy>=H) continue;
      const i=gy*W+gx, t=state.tiles[i];
      if(t===T_WATER) continue;
      if(t===T_TREE || t===T_ROCK) state.tiles[i]=T_GRASS;
      const block = y>=hubFeatureBlockFrom(fh);
      state.feat[i] = block ? 2 : 1;
      if(bsrc<0 || block) bsrc=i;
      claimed=true;
    }
    if(claimed) state.features.push({
      id:src.id||('topography_'+state.features.length),
      slot:src.slot==='rock'?'rock':'tree', tx, ty, w:fw, h:fh,
      biome:hubBiomeId(src.biome, bsrc>=0?state.biome[bsrc]:B_GRASS),
      v:src.v==null?0.35:+src.v, overhang:src.overhang||1.08, heightScale:src.heightScale||1
    });
  }
}
function hubResizeBuilding(state,e,w,h){
  const nw=Math.max(1,w|0), nh=Math.max(1,h|0);
  if(e.w===nw && e.h===nh) return;
  if(typeof markBuilding==='function') markBuilding(state,e,false);
  e.w=nw; e.h=nh; e.x=(e.tx+e.w/2)*TILE; e.y=(e.ty+e.h/2)*TILE;
  if(typeof markBuilding==='function') markBuilding(state,e,true);
}
function hubMegaFromConfig(state, cfg, idx){
  const m=Object.assign({}, cfg);
  m.id = m.id || ('hub_mega_'+idx);
  m.variant = (m.variant==null?0:m.variant)|0;
  m.biome = hubBiomeId(m.biome, state.biome[(Math.max(0,Math.min(state.H-1,m.ty|0))*state.W)+Math.max(0,Math.min(state.W-1,m.tx|0))]);
  m.seed = m.seed==null ? (idx+1)*0.173 : m.seed;
  if(m.fixedFrame == null) m.fixedFrame = hubFixedMegaFrame(state, (m.tx||0)+(m.ty||0)+idx);
  if(hubHasTag(cfg,'neon')) m.neon=true;
  if(hubHasTag(cfg,'hubCondo')){ m.hubCondo=true; m.neon=true; }
  if(hubHasTag(cfg,'hubUltra')){ m.hubUltra=true; m.neon=true; }
  if(hubHasTag(cfg,'hubWaste')) m.hubWaste=true;
  return m;
}
function hubMegaExists(state,cfg){
  return (state.megaSprites||[]).some(m=>{
    if(cfg.id && m.id===cfg.id) return true;
    if(cfg.poiId && m.poiId===cfg.poiId) return true;
    if(hubHasTag(cfg,'hubUltra') && m.hubUltra) return true;
    if(hubHasTag(cfg,'hubWaste') && m.hubWaste && m.tx===cfg.tx && m.ty===cfg.ty) return true;
    return false;
  });
}
function hubEnsureMapMegas(state){
  state.megaSprites = state.megaSprites || [];
  (HUB.megaSprites||[]).forEach((cfg,i)=>{
    if(!hubMegaExists(state,cfg)) state.megaSprites.push(hubMegaFromConfig(state,cfg,i));
  });
}
function hubApplyPoiVisual(e,p){
  const v=p && p.visual;
  if(v && v.type){
    e.hubSpriteVisual = { type:v.type, faction:v.faction, neonId:v.neonId,
      fixedFrame:v.fixedFrame||0, w:v.w||e.w, h:v.h||e.h,
      overhang:v.overhang||1.08, heightScale:v.heightScale||1, seed:(e.id||1)*0.071 };
  }
  if(v && v.megaId) e.hubMegaVisual=true;
  if(p && (HUB.megaSprites||[]).some(m=>m.poiId===p.id && (hubHasTag(m,'hubCondo') || hubHasTag(m,'hubUltra')))) e.hubMegaVisual=true;
}
function hubAddCondoMega(state, e){
  if(!e || !e.hubPoi) return;
  e.hubMegaVisual=true;
  const cfg=(HUB.megaSprites||[]).find(m=>m.poiId===e.hubPoi.id && hubHasTag(m,'hubCondo'));
  if(cfg && !hubMegaExists(state,cfg)) state.megaSprites.push(hubMegaFromConfig(state,cfg,state.megaSprites.length));
}
function hubAddMdcVisual(e){
  if(!e || !e.hubPoi) return;
  const p=hubPoiConfig(e.hubPoi.id);
  if(p) hubApplyPoiVisual(e,p);
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
    const p=hubPoiConfig(e.hubPoi.id);
    if(p) hubApplyPoiVisual(e,p);
  }
  hubEnsureMapMegas(state);
}
// Clear a tile box so a facility footprint reads cleanly: turn tree/rock tiles to grass and
// drop any topography feature (+ its walk-under mask) overlapping the box. Used when injecting
// a facility into an ALREADY-GENERATED (loaded) HUB map.
function hubClearFootprint(state, x0, y0, w, h){
  const W=state.W, H=state.H;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    const i=y*W+x;
    if(state.tiles[i]===T_TREE || state.tiles[i]===T_ROCK){ state.tiles[i]=T_GRASS; if(state.feat) state.feat[i]=0; }
  }
  const ov=(f)=>{ const fw=Math.max(1,(f.w||1)|0), fh=Math.max(1,(f.h||1)|0);
    return f.tx < x0+w && f.tx+fw > x0 && f.ty < y0+h && f.ty+fh > y0; };
  const drop=(state.features||[]).filter(ov);
  if(drop.length){
    for(const f of drop){ const fw=Math.max(1,(f.w||1)|0), fh=Math.max(1,(f.h||1)|0);
      for(let y=0;y<fh;y++) for(let x=0;x<fw;x++){ const cx=f.tx+x, cy=f.ty+y;
        if(cx>=0&&cy>=0&&cx<W&&cy<H && state.feat) state.feat[cy*W+cx]=0; } }
    state.features=state.features.filter(f=>!ov(f));
  }
}
// A loaded HUB save snapshots the map as it was when SAVED, so HUB-layout edits (a new facility
// like the Training Grounds, a removed building) won't appear on old saves. Reconcile the loaded
// map against the current HUB.pois: inject any missing POI, remove superseded decor buildings that
// occupy its footprint, clear terrain under it, then re-materialise any trainees. Idempotent.
function hubReconcileFacilities(state){
  if(!state || !state.hub) return;
  state.hubPois = state.hubPois || {};
  const overlaps=(ax,ay,aw,ah, bx,by,bw,bh)=> ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  let added=false;
  for(const p of (HUB.pois||[])){
    if((state.entities||[]).some(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.id===p.id)) continue;   // already present
    const d=DEF[p.type]||{w:3,h:3}, w=p.w||d.w||3, h=p.h||d.h||3;
    // remove decor / non-POI buildings sitting on this footprint (e.g. the old launchpad)
    for(const e of (state.entities||[])){
      if(!e || e.dead || e.kind!=='building') continue;
      if(e.hubPoi && e.hubPoi.kind!=='decor') continue;                 // keep real POIs
      if(overlaps(p.x,p.y,w,h, e.tx,e.ty,e.w,e.h)){
        if(typeof markBuilding==='function') markBuilding(state,e,false);
        e.dead=true;
        if(state.hubPois && e.hubPoi) delete state.hubPois[e.hubPoi.id];
      }
    }
    hubClearFootprint(state, p.x-2, p.y-2, w+4, h+4);
    const e=mkBuilding(state, p.type, 'neutral', p.x, p.y, true);
    hubResizeBuilding(state, e, w, h);
    e.hubPoi={id:p.id, kind:p.kind, name:p.name};
    state.hubPois[p.id]=e;
    hubApplyPoiVisual(e, p);
    added=true;
  }
  if(added){
    hubEnsureMapMegas(state);
    if(typeof hubSpawnTrainees==='function') hubSpawnTrainees(state);
    if(typeof recomputeSupply==='function') recomputeSupply(state);
  }
}
function hubPlacePois(state){
  for(const p of HUB.pois){
    const e=mkBuilding(state,p.type,'neutral',p.x,p.y,true);
    hubResizeBuilding(state,e,p.w||e.w,p.h||e.h);
    e.hubPoi={id:p.id, kind:p.kind, name:p.name};
    state.hubPois[p.id]=e;
    hubApplyPoiVisual(e,p);
  }
  for(const b of HUB.buildings||[]){
    const e=mkBuilding(state,b.type,b.owner||'neutral',b.tx,b.ty,true);
    hubResizeBuilding(state,e,b.w||e.w,b.h||e.h);
    if(b.visual && b.visual.type) e.hubSpriteVisual = { type:b.visual.type, faction:b.visual.faction, neonId:b.visual.neonId,
      fixedFrame:b.visual.fixedFrame||0, w:b.visual.w||e.w, h:b.visual.h||e.h,
      overhang:b.visual.overhang||1.08, heightScale:b.visual.heightScale||1, seed:(e.id||1)*0.071 };
    if(b.poiId) e.hubPoi={id:b.poiId, kind:'decor', name:b.id||b.poiId};
  }
  hubEnsureMapMegas(state);
}
function hubSpawnRoster(state){
  const condos=Object.values(CAMPAIGN.condos), posByCondo={};
  if(!condos.length) return;
  const poiById=state.hubPois;
  const fallbackId=condos[0].id;
  for(const r of CAMPAIGN.roster){
    let cid=(condos.find(c=>(c.residents||[]).includes(r.key))||condos[0]).id;
    const home=poiById[cid] || poiById[fallbackId] || Object.values(poiById)[0];
    if(!home) continue;
    const n=posByCondo[cid] || 0; posByCondo[cid]=n+1;
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
  else if(p.kind==='training') hubTrainStage(state,u,poi);
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
  if(!state||!u) return null;
  const mdcs=(state.entities||[]).filter(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.kind==='mdc');
  if(u.storedIn){
    const byStored=mdcs.find(e=>e.id===u.storedIn);
    if(byStored) return byStored;
  }
  return mdcs.find(e=>(e.storedUnits||[]).includes(u.id)) || null;
}
function hubDispatchVetCap(){
  const idx=(CAMPAIGN&&CAMPAIGN.nextMapIndex!=null) ? CAMPAIGN.nextMapIndex : mapIndex;
  return (typeof vetCarryCountFor==='function') ? vetCarryCountFor(idx) : 6;
}
function hubDispatchFullMessage(cap){
  return 'Dispatch list full. The next mission only requires '+cap+' units.';
}
function hubDispatchVetCount(state, exceptKey){
  return hubEnlistedUnits(state)
    .filter(u=>!u.hero && hubUnitKey(u)!==exceptKey)
    .length;
}
function hubMdcExitTile(state,mdc,seed){
  if(!state||!mdc) return null;
  const free=(tx,ty)=>{
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) return false;
    if(state.blocked[ty*state.W+tx]) return false;
    const wx=tx*TILE+TILE/2, wy=ty*TILE+TILE/2;
    return !(state.entities||[]).some(e=>!e.dead&&!e.storedIn&&e.kind==='unit'&&Math.hypot(e.x-wx,e.y-wy)<(e.r||9)+12);
  };
  const choose=(spots)=>{
    if(!spots.length) return null;
    const start=Math.abs(seed||0)%spots.length;
    return spots[start];
  };
  for(let r=0;r<=4;r++){
    const y=mdc.ty+mdc.h+r;
    const direct=[], shoulder=[];
    for(let x=0;x<mdc.w;x++){
      const tx=mdc.tx+x;
      if(free(tx,y)) direct.push({tx,ty:y});
    }
    const picked=choose(direct);
    if(picked) return picked;
    for(const tx of [mdc.tx-1, mdc.tx+mdc.w]){
      if(free(tx,y)) shoulder.push({tx,ty:y});
    }
    const side=choose(shoulder);
    if(side) return side;
  }
  return (typeof hqExitTile==='function') ? hqExitTile(state,mdc,seed) : null;
}
function hubStageUnit(u,mdcId,mdc){
  if(!hubCanAct()) return;
  if(!G||!G.hub||!u||u.dead||u.owner!=='player'||u.kind!=='unit') return;
  mdc = mdc || hubFindMdcById(G,mdcId);
  if(!mdc||!mdc.hubPoi||mdc.hubPoi.kind!=='mdc') return;
  const key=hubUnitKey(u);
  hubEnlistedKeys();
  if(!u.hero && !CAMPAIGN.dispatch.staged.includes(key)){
    const cap=hubDispatchVetCap();
    if(hubDispatchVetCount(G,key) >= cap){
      resetMotion(u);
      u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
      toast(hubDispatchFullMessage(cap));
      refreshUI();
      return;
    }
  }
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
  const stored=!!(mdc && (u.storedIn===mdc.id || (mdc.storedUnits||[]).includes(u.id)));
  if(stored){
    const spot=hubMdcExitTile(G,mdc,u.id);
    if(!spot){ toast('No room outside M.D.C.'); return false; }
    for(const b of (G.entities||[])){
      if(b&&b.hubPoi&&b.hubPoi.kind==='mdc'&&b.storedUnits) b.storedUnits=b.storedUnits.filter(id=>id!==u.id);
    }
    delete u.storedIn;
    u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2;
    resetMotion(u); u.cmd=null; u.state='idle'; u.selected=false;
    spawnRing(u.x,u.y,'#7fd6ff');
  }
  const staged=hubEnlistedKeys().filter(k=>k!==unitKey);
  CAMPAIGN.dispatch.staged=staged;
  toast((DEF[u.type].name||'Unit')+' removed from dispatch.');
  refreshUI();
  return true;
}
function hubDispatchNextEpisode(){
  if(!hubCanAct()){ toast('Only the host can launch from the H.U.B.'); return; }
  const live=hubEnlistedUnits(G).filter(u=>(u.ctrl||'p1')===hubOwnerCtrl());
  if(!live.length){ toast('Enlist at least one unit at an M.D.C..'); return; }
  const heroes=live.filter(u=>u.hero), vets=live.filter(u=>!u.hero);
  const cap=hubDispatchVetCap();
  if(vets.length>cap){ toast(hubDispatchFullMessage(cap)); return; }
  setCarryover(vets.slice(0,cap)); captureHeroes({entities:heroes});
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

/* =====================================================================
   TRAINING GROUNDS — level-cloning between two same-type units.
   A junior + a higher-level mentor (<= HUB.trainMaxGap apart) lock inside the
   facility; after (target - juniorLevel) in-game hours of ACTIVE play (1 hour =
   HUB.trainHourSeconds real seconds) both leave one level above the senior.
   State lives on CAMPAIGN.training so it survives the roster rebuild + save/load;
   the clock ticks in update() for both HUB and missions. Reuses the M.D.C.
   garrison pattern (storedIn + lane positions) for intake/lock/release.
   ===================================================================== */

// The live Training Grounds POI entity on this map (or null).
function hubFindTrainingGrounds(state){
  if(!state) return null;
  if(state.hubPois && state.hubPois.training) return state.hubPois.training;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.kind==='training') || null;
}
// Lane indices (0..trainPairCap*2-1) currently occupied by staged or in-session trainees.
function hubTrainUsedSlots(){
  const t=CAMPAIGN.training, used=new Set();
  for(const s of (t.staged||[])) if(s && s.slot!=null) used.add(s.slot);
  for(const ses of (t.sessions||[])){ if(ses.a&&ses.a.slot!=null) used.add(ses.a.slot); if(ses.b&&ses.b.slot!=null) used.add(ses.b.slot); }
  return used;
}
function hubTrainNextSlot(){
  const used=hubTrainUsedSlots(), cap=HUB.trainPairCap*2;
  for(let i=0;i<cap;i++) if(!used.has(i)) return i;
  return -1;
}
function hubTrainCount(){
  const t=CAMPAIGN.training;
  return (t.staged||[]).length + (t.sessions||[]).length*2;
}
// Map a normalised point on the facility SPRITE (un,vn in 0..1, left→right / top→bottom) to a world
// position. The sprite is bottom-anchored over the footprint with a ~1.1-tile top inset (see
// drawHubBuildingSpriteVisual: heightScale 0.82 → ~21 tiles tall on the 22-tall footprint).
function hubTrainSpritePos(fac, un, vn){
  return { x:(fac.tx + un*fac.w)*TILE, y:(fac.ty + 1.1 + vn*(fac.h-1.1))*TILE };
}
// Firing-line spot BEFORE the counter, spread across the lanes. `idx` of `total` live trainees is
// distributed left→right along the counter's near edge (a second row appears past 6) so they never
// cram together. Trainees stand here whether idle or shooting — only their facing/animation changes.
function hubTrainFiringPos(fac, idx, total){
  const perRow=6, rows = total>perRow ? 2 : 1;
  const r0 = Math.ceil(total/rows);                 // count in the front row
  const row = idx < r0 ? 0 : 1, inRow = row===0 ? r0 : (total-r0), col = row===0 ? idx : idx-r0;
  const t = inRow<=1 ? 0.5 : col/(inRow-1);         // 0..1 across the lanes
  // Seat units on the lane NEAR-ENDS (the firing line), which run DOWN-RIGHT in the iso sprite
  // (lane 0 upper-left → lane 5 lower-right) — so each trainee stands in a lane, not across them.
  let u = 0.32 + t*0.27, v = 0.44 + t*0.17;
  if(row){ u -= 0.03; v += 0.045; }                 // 2nd rank: one step back toward the viewer, same lanes
  return hubTrainSpritePos(fac, u, v);
}
// Lock a live unit inside the facility (storedIn, like an M.D.C. garrison). Its exact lane/waiting
// position + animation are resolved every frame by drawHubTrainees from CAMPAIGN.training state;
// _trainPlaced=false makes the first render snap it into place (later target changes glide).
function hubTrainLockUnit(state, u, fac, slot){
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=fac.id; u.trainSlot=slot; u._face=1; u._trainPlaced=false;
  u.x=fac.x; u.y=fac.y;
  u.selected=false;
  if(state && state.selection) state.selection=state.selection.filter(e=>e!==u);
}
// Resolve the live entity for a snapshot (by hubUnitKey), or null.
function hubTrainLiveUnit(state, snap){
  if(!state||!snap) return null;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&hubUnitKey(e)===snap.key) || null;
}
// Live trainee entities currently inside the Training Grounds (render pass + panel animations).
function hubTrainees(state){
  if(!state) return [];
  return (state.entities||[]).filter(e=>e&&!e.dead&&e.kind==='unit'&&e.trainSlot!=null && e.storedIn);
}

// Command-arrival intake: a unit walked into the Training Grounds → garrison it as "staged".
function hubTrainStage(state, u, poi){
  if(!hubCanAct()) return;
  if(!state||!state.hub||!u||u.dead||u.owner!=='player'||u.kind!=='unit') return;
  const fac=poi || hubFindTrainingGrounds(state);
  if(!fac||!fac.hubPoi||fac.hubPoi.kind!=='training') return;
  const bail=(msg)=>{ resetMotion(u); u.cmd=null; u.state='idle'; toast(msg); refreshUI(); };
  if(typeof isCombatVet==='function' && !isCombatVet(u)) return bail((DEF[u.type].name||'That unit')+' has no career — only combat veterans train here.');
  if(u.hero) return bail((u.heroId||'That hero')+' is one of a kind — heroes cannot be cloned.');
  if(hubTrainCount() >= HUB.trainPairCap*2) return bail('Training Grounds full ('+(HUB.trainPairCap*2)+' trainees).');
  const slot=hubTrainNextSlot();
  if(slot<0) return bail('No free training lane.');
  const snap=hubSnapUnit(u); snap.slot=slot;
  CAMPAIGN.training.staged.push(snap);
  hubTrainLockUnit(state, u, fac, slot);
  spawnRing(u.x,u.y,'#ffd24a');
  toast((DEF[u.type].name||'Unit')+' (Lv '+(u.stars||0)+') entered the Training Grounds.');
  refreshUI();
}

// Push a snapshot back into the roaming roster (dedupe by key) so it persists like any HUB unit.
function hubTrainToRoster(snap){
  if(!snap) return;
  CAMPAIGN.roster=(CAMPAIGN.roster||[]).filter(r=>r.key!==snap.key);
  const clean=Object.assign({}, snap); delete clean.slot;
  CAMPAIGN.roster.push(clean);
}
// Release a trainee snapshot to a free exit tile (and hand it back to the roaming roster).
function hubTrainReleaseSnap(state, fac, snap){
  hubTrainToRoster(snap);
  const u=hubTrainLiveUnit(state, snap);
  if(!u) return;
  const spot=fac ? hubMdcExitTile(state, fac, (snap.slot||0)+1) : null;
  delete u.storedIn; delete u.trainSlot;
  if(spot){ u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2; }
  else if(fac){ u.x=fac.x; u.y=(fac.ty+fac.h+1)*TILE; }
  resetMotion(u); u.cmd=null; u.state='idle'; u.selected=false;
  spawnRing(u.x,u.y,'#7fd6ff');
}
// Withdraw a staged unit OR cancel a whole session (frees both) — junior keeps its ORIGINAL level.
function hubTrainWithdraw(unitKey){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  if(!G||!G.hub||!unitKey) return false;
  const t=CAMPAIGN.training, fac=hubFindTrainingGrounds(G);
  const si=(t.staged||[]).findIndex(s=>s.key===unitKey);
  if(si>=0){
    const snap=t.staged.splice(si,1)[0];
    hubTrainReleaseSnap(G, fac, snap);
    toast(((DEF[snap.type]&&DEF[snap.type].name)||'Unit')+' left the Training Grounds.');
    refreshUI(); return true;
  }
  const ses=(t.sessions||[]).find(x=>x.a.key===unitKey||x.b.key===unitKey);
  if(ses){
    t.sessions=t.sessions.filter(x=>x!==ses);
    hubTrainReleaseSnap(G, fac, ses.a);
    hubTrainReleaseSnap(G, fac, ses.b);
    toast('Training cancelled — the junior leaves with nothing gained.');
    refreshUI(); return true;
  }
  return false;
}

// Training duration (in-game hours) for a junior/mentor level pair (0 = pointless).
function hubTrainDurationHours(minLvl, maxLvl){
  const target=Math.min((typeof CAREER!=='undefined'?CAREER.maxStars:30), maxLvl+1);
  return Math.max(0, target-minLvl);
}
// Validate a candidate pair (two staged snapshots): {ok, reason?, min, max, target, hours}.
function hubTrainValidatePair(a, b){
  if(!a||!b) return {ok:false, reason:'Pick two trainees inside the facility.'};
  if(a.key===b.key) return {ok:false, reason:'Pick two different units.'};
  if(a.type!==b.type) return {ok:false, reason:'Both units must be the same type.'};
  const sa=a.stars||0, sb=b.stars||0, min=Math.min(sa,sb), max=Math.max(sa,sb);
  if(Math.abs(sa-sb) > HUB.trainMaxGap) return {ok:false, reason:'Too far apart — max '+HUB.trainMaxGap+' levels of difference.'};
  if((CAMPAIGN.training.sessions||[]).length >= HUB.trainPairCap) return {ok:false, reason:'All '+HUB.trainPairCap+' sessions are in use.'};
  const target=Math.min((typeof CAREER!=='undefined'?CAREER.maxStars:30), max+1);
  const hours=Math.max(0, target-min);
  if(hours<=0) return {ok:false, reason:'Both units are already at the level cap.'};
  return {ok:true, min, max, target, hours};
}
// Start a session from two staged units (keys are hubUnitKeys). mentor = higher level.
function hubTrainCreateSession(keyA, keyB){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  const t=CAMPAIGN.training;
  const a=(t.staged||[]).find(s=>s.key===keyA), b=(t.staged||[]).find(s=>s.key===keyB);
  const v=hubTrainValidatePair(a,b);
  if(!v.ok){ toast(v.reason); return false; }
  const mentor=((a.stars||0) >= (b.stars||0)) ? a : b, junior=(mentor===a)?b:a;
  t.staged=t.staged.filter(s=>s!==a && s!==b);
  t.sessions.push({ id:'ts_'+(HUB.nextId++), type:mentor.type, a:mentor, b:junior,
    startMax:v.max, startMin:v.min, target:v.target, hoursTotal:v.hours, secElapsed:0, done:false });
  toast('Training started — both reach Level '+v.target+' in '+v.hours+'h.');
  refreshUI();
  return true;
}

// Bump a snapshot to a level and apply it to the live entity if present.
function hubTrainApplyLevel(state, snap, level){
  const cap=(typeof CAREER!=='undefined')?CAREER.maxStars:30;
  const lvl=Math.max(0, Math.min(cap, level));
  snap.stars=lvl; snap.xp=(typeof CAREER!=='undefined')?CAREER.xpFor(lvl):snap.xp;
  const u=hubTrainLiveUnit(state, snap);
  if(u){ u.stars=lvl; u.xp=snap.xp; if(typeof applyVetHp==='function') applyVetHp(u,true); }
}
// Graduate a finished session in the HUB: both reach target, get released to roam, session removed.
function hubGraduateSession(state, ses){
  const fac=hubFindTrainingGrounds(state);
  hubTrainApplyLevel(state, ses.a, ses.target);
  hubTrainApplyLevel(state, ses.b, ses.target);
  hubTrainReleaseSnap(state, fac, ses.a);
  hubTrainReleaseSnap(state, fac, ses.b);
  CAMPAIGN.training.sessions=(CAMPAIGN.training.sessions||[]).filter(x=>x!==ses);
  const nm=(DEF[ses.type]&&DEF[ses.type].name)||'Recruits';
  toast('🎓 Training complete — two '+nm+' graduate at Level '+ses.target+'.');
}

// Per-tick clock — runs from core.js update() for BOTH the HUB and missions (active play only).
function updateTrainingSessions(dt){
  if(typeof netRole!=='undefined' && netRole==='client') return;     // clients don't simulate campaign state
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN || !CAMPAIGN.training) return;
  const sessions=CAMPAIGN.training.sessions||[];
  if(!sessions.length) return;
  const inHub=(typeof G!=='undefined' && G && G.hub);
  for(const ses of sessions.slice()){
    if(ses.done) continue;
    ses.secElapsed=(ses.secElapsed||0)+dt;
    if(ses.secElapsed >= ses.hoursTotal*HUB.trainHourSeconds){
      ses.done=true;
      // bake the result into the snapshots now so it survives even if finished mid-mission
      hubTrainApplyLevel(inHub?G:null, ses.a, ses.target);
      hubTrainApplyLevel(inHub?G:null, ses.b, ses.target);
      if(inHub) hubGraduateSession(G, ses);                            // live in the HUB → release immediately
      else toast('🎓 A Training Grounds session finished — collect them at the H.U.B.');
    }
  }
}

// Re-materialise trainees when a fresh HUB map is built (after the roaming roster spawns).
// Pending staged/sessions spawn LOCKED at their lanes; finished sessions graduate to roaming.
function hubSpawnTrainees(state){
  if(!state || typeof CAMPAIGN==='undefined' || !CAMPAIGN.training) return;
  const fac=hubFindTrainingGrounds(state);
  if(!fac) return;
  const fillSnap=(u,snap)=>{ u.hubKey=snap.key; u.stars=snap.stars||0; u.xp=snap.xp||0; u.lore=snap.lore||null;
    u.hero=!!snap.hero; u.heroId=snap.heroId||null; u.spriteType=snap.spriteType||null;
    if(typeof hubApplyUpgrades==='function') hubApplyUpgrades(u);
    if(typeof applyVetHp==='function') applyVetHp(u,true); };
  const spawnLocked=(snap)=>{
    if(!snap) return;
    if(hubTrainLiveUnit(state, snap)) return;             // idempotent: entity already restored from a save
    const slot=(snap.slot!=null)?snap.slot:hubTrainNextSlot(); snap.slot=slot;
    const u=mkUnit(state, snap.type, 'player', fac.tx+((fac.w/2)|0), fac.ty+((fac.h*0.6)|0));
    fillSnap(u, snap); hubTrainLockUnit(state, u, fac, slot);
  };
  for(const snap of (CAMPAIGN.training.staged||[])) spawnLocked(snap);
  for(const ses of (CAMPAIGN.training.sessions||[]).slice()){
    if(ses.done){
      hubTrainApplyLevel(state, ses.a, ses.target);
      hubTrainApplyLevel(state, ses.b, ses.target);
      [ses.a, ses.b].forEach(snap=>{ hubTrainToRoster(snap);
        if(hubTrainLiveUnit(state, snap)) return;         // already present (restored save) → don't duplicate
        const u=mkUnit(state, snap.type, 'player', fac.tx+((fac.w/2)|0), fac.ty+fac.h+1);
        fillSnap(u, snap); });
      CAMPAIGN.training.sessions=CAMPAIGN.training.sessions.filter(x=>x!==ses);
      const nm=(DEF[ses.type]&&DEF[ses.type].name)||'Recruits';
      toast('🎓 Training complete — two '+nm+' graduated at Level '+ses.target+'.');
    } else { spawnLocked(ses.a); spawnLocked(ses.b); }
  }
}

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
