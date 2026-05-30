/* map.js — map generation & entity factories: buildEnemyBase, newMap, mkEntity/mkBuilding/mkUnit, markBuilding, recomputeSupply. */
function buildEnemyBase(state, base, idx){
  const ax=base.x, ay=base.y;
  mkBuilding(state,'hq','enemy', ax, ay, true);
  mkBuilding(state,'barracks','enemy', ax+3, ay, true);
  if(base.extraBarracks) mkBuilding(state,'barracks','enemy', ax, ay+3, true);
  mkBuilding(state,'turret','enemy', ax-1, ay+2, true);
  if(idx>=1 && ax+4<state.W && ay+4<state.H) mkBuilding(state,'garage','enemy', ax+3, ay+3, true); // vehicles on later Quarters
  const ndef = base.defenders!=null ? base.defenders : (idx===0?2:4);
  for(let i=0;i<ndef;i++) mkUnit(state,'soldier','enemy', ax-1+i, ay+3);
}

function newMap(idx){
  const cfg = MAPS[idx];
  const bases = cfg.enemies || [cfg.enemy];
  const rng = makeRng(cfg.seed*1000+7);
  const W=cfg.w, H=cfg.h;
  const tiles = new Array(W*H);
  const variant = new Array(W*H); // for subtle texture
  for(let i=0;i<W*H;i++){ tiles[i]=T_GRASS; variant[i]=rng(); }

  const inB=(x,y)=> x>=0&&y>=0&&x<W&&y<H;
  const set=(x,y,t)=>{ if(inB(x,y)) tiles[y*W+x]=t; };

  // ---- procedural geography (coherent elevation + climate) ----
  // Three seeded noise fields — ELEVATION (sea / land / mountain), TEMPERATURE
  // (a latitude-style gradient + noise) and MOISTURE — are sampled per tile and
  // classified Whittaker-style, so regions and coastlines come out smooth and
  // contiguous instead of the old per-tile-random speckle. Tunable per map via
  // cfg.terrain (see TERRAIN_DEFAULTS); maps without it get temperate grassland.
  const P = Object.assign({}, TERRAIN_DEFAULTS, cfg.terrain||{});
  P.temp  = Object.assign({}, TERRAIN_DEFAULTS.temp,  (cfg.terrain&&cfg.terrain.temp) ||{});
  P.moist = Object.assign({}, TERRAIN_DEFAULTS.moist, (cfg.terrain&&cfg.terrain.moist)||{});
  const allow = new Set((P.biomes||['grass']).map(n=>CLIMATE[n]).filter(v=>v!=null));
  const landBiome = (P.biomes && CLIMATE[P.biomes[0]]!=null) ? CLIMATE[P.biomes[0]] : B_GRASS;

  const nzE=makeNoise2D(cfg.seed*131+17),  nzT=makeNoise2D(cfg.seed*131+53),
        nzM=makeNoise2D(cfg.seed*131+97),  nzW=makeNoise2D(cfg.seed*131+211);
  const cxF=W*0.5, cyF=H*0.5, minWH=Math.min(W,H);
  const FE=0.06, FT=0.05, FM=0.06, FW=0.09;             // feature frequencies
  const tempAt=(x,y)=>{ const T=P.temp; let g=0;
    if(T.axis==='y') g=((y/H)-0.5)*T.gradient;          // south (bottom) hotter
    else if(T.axis==='x') g=((x/W)-0.5)*T.gradient;
    else if(T.axis==='diag') g=(((x/W+y/H)*0.5)-0.5)*T.gradient;
    return T.base+g+(nzT.fbm(x*FT,y*FT,3)-0.5)*2*T.noise;
  };
  const moistAt=(x,y)=> P.moist.base+(nzM.fbm(x*FM,y*FM,4)-0.5)*2*P.moist.noise;

  // ELEVATION field (domain-warped fBm + optional forced central sea), cached once
  const elev=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const wx=x+(nzW.fbm(x*FW,y*FW,1)-0.5)*9, wy=y+(nzW.fbm(x*FW+50,y*FW+50,1)-0.5)*9;
    let e=nzE.fbm(wx*FE,wy*FE,4);
    if(P.centralSea>0){ const r=Math.hypot(x-cxF,y-cyF)/(minWH*P.centralSea); e-=Math.max(0,1-r)*0.5; }
    elev[y*W+x]=e;
  }
  // sea / mountain cutoffs picked by QUANTILE → consistent coverage across seeds
  const sortedE=Float32Array.from(elev).sort();
  const seaCut=sortedE[Math.min(W*H-1, Math.floor(P.seaFrac*W*H))];
  const mtnCut=sortedE[Math.min(W*H-1, Math.floor((1-P.mtnFrac)*W*H))];

  const biome = new Array(W*H);
  // 1) classify each tile into a structural KIND: water, mountain, or a land climate
  const K_WATER=100, K_MTN=101;
  const kind=new Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x, e=elev[i];
    if(e<seaCut) kind[i]=K_WATER;
    else if(e>mtnCut) kind[i]=K_MTN;
    else kind[i]=climateBiome(tempAt(x,y), moistAt(x,y), P, allow); // temp/moist sampled on land only
  }
  // 2) majority-vote smoothing → contiguous regions, no orphan single-tile specks
  smoothKind(kind, W, H, 2);
  // 3) derive biome[] + terrain tiles[] from the smoothed kinds
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x, k=kind[i];
    if(k===K_WATER){ tiles[i]=T_WATER;                  // frozen if cold, lava on volcanic maps, else open blue
      biome[i]= allow.has(B_VOLCANIC)?B_VOLCANIC : (tempAt(x,y)<P.freeze?B_ICE:B_WATER); }
    else if(k===K_MTN){ biome[i]=B_MOUNTAIN; tiles[i]= variant[i]>0.34?T_ROCK:T_GRASS; } // ranges w/ passable gaps
    else { biome[i]=k; tiles[i]=T_GRASS;
      // clustered groves on moist grassland (noise-gated so they form copses, not static)
      if(k===B_GRASS && P.forest>0 && nzM.fbm(x*0.25+7,y*0.25+7,2) > 1-P.forest*3 && variant[i]>0.3) tiles[i]=T_TREE;
    }
  }
  // 4) sandy/dirt shore band where land meets sea (Whittaker realism; stays passable)
  if(P.beach) addBeach(tiles, W, H);

  // occasional dirt — kept sparse and clustered so the floor still reads as one surface
  for(let k=0;k<W*H*0.012;k++){
    let x=(rng()*W)|0,y=(rng()*H)|0;
    set(x,y,T_DIRT);
    if(rng()>0.5) set(x+1,y,T_DIRT);          // small 2-tile blobs rather than lone squares
    if(rng()>0.7) set(x,y+1,T_DIRT);
  }

  // lakes
  cfg.lakes.forEach(l=>{
    for(let y=-l.r-1;y<=l.r+1;y++) for(let x=-l.r-1;x<=l.r+1;x++){
      const d=Math.hypot(x,y); if(d< l.r + (rng()-0.5)*1.4) set(l.x+x,l.y+y,T_WATER);
    }
  });
  // rock clusters
  cfg.rockClusters.forEach(c=>{
    let cx=c.x,cy=c.y;
    for(let i=0;i<c.n;i++){ set(cx,cy,T_ROCK); cx+=((rng()*3)|0)-1; cy+=((rng()*3)|0)-1; }
  });
  // forests
  cfg.forests.forEach(f=>{
    let cx=f.x,cy=f.y;
    for(let i=0;i<f.n;i++){ if(passableTerrain(tiles[cy*W+cx]||0)) set(cx,cy,T_TREE);
      cx+=((rng()*3)|0)-1; cy+=((rng()*3)|0)-1; if(!inB(cx,cy)){cx=f.x;cy=f.y;} }
  });
  // Make sure player & enemy start areas are clear, buildable floor. Keep the
  // local climate (desert/snow/grass) so the theme reads naturally — only flip
  // sea/mountain under a cleared spot to the map's dominant land biome.
  const clearArea=(px,py,rad)=>{ for(let y=-rad;y<=rad;y++)for(let x=-rad;x<=rad;x++){
    if(inB(px+x,py+y)){ const j=(py+y)*W+(px+x); tiles[j]=T_GRASS;
      if(biome[j]===B_WATER||biome[j]===B_MOUNTAIN) biome[j]=landBiome; } } };
  clearArea(cfg.player.x,cfg.player.y,4);
  bases.forEach(b=> clearArea(b.x,b.y,4));
  (cfg.lostBases||[]).forEach(b=> clearArea(b.x,b.y,3));   // abandoned outposts sit on clear ground too
  // keep gold nodes reachable: clear the footprint to passable floor (climate theme kept)
  cfg.goldNodes.forEach(g=>{ for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
    if(inB(g.x+x,g.y+y)){ const j=(g.y+y)*W+(g.x+x); tiles[j]=T_GRASS;
      if(biome[j]===B_WATER||biome[j]===B_MOUNTAIN) biome[j]=landBiome; } } });

  // Erode lone/thin water (jittered lakes + clearings can orphan single tiles).
  // Runs AFTER clearing but BEFORE the blocked grid is built; erode-only, so it
  // can never re-block the land bridges carved below.
  despeckleWater(tiles, biome, W, H, landBiome, 3);

  const zoom0 = initialZoom(W,H);
  const state = {
    cfg, W, H, tiles, variant, biome,
    blocked: new Uint8Array(W*H),       // impassable (terrain or building)
    explored: new Uint8Array(W*H),
    visible:  new Uint8Array(W*H),
    entities: [],
    gold: cfg.startGold || 300,
    supply: 0, supplyCap: 0,
    nextId: 1,
    zoom: zoom0,
    camX: cfg.player.x*TILE - (innerWidth/zoom0)/2 + 100,
    camY: cfg.player.y*TILE - (innerHeight/zoom0)/2 + 100,
    selection: [],
    groups: {},           // control groups: "1".."0" -> array of entity refs
    placing: null,        // {def, type} when placing a building
    enemySpawnTimer: 16,
    enemyFortifyTimer: 10,    // periodic: rival adds base defenses as the match goes on
    // No attack waves until the grace period ends — lets the player set up first.
    graceTime: (cfg.graceTime!=null? cfg.graceTime : (idx===0? 100 : 88)),
    enemyWaveTimer: (cfg.waveTimer!=null? cfg.waveTimer : (idx===0? 110 : 96)),
    waveCount:0,
    time:0,
    gold_collected:0,
    over:false,
  };

  // build blocked grid from terrain
  for(let i=0;i<W*H;i++) state.blocked[i] = passableTerrain(tiles[i])?0:1;

  // guarantee every gold node is reachable from the player's start — if a sea or
  // range happened to wall one off, carve a thin land bridge to the mainland.
  {
    const B=state.blocked, sx=cfg.player.x, sy=cfg.player.y, seen=new Uint8Array(W*H), st=[[sx,sy]];
    seen[sy*W+sx]=1;
    while(st.length){ const [x,y]=st.pop();
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue; const k=ny*W+nx; if(seen[k]||B[k]) continue; seen[k]=1; st.push([nx,ny]); } }
    for(const g of cfg.goldNodes.concat(bases)){
      if(seen[g.y*W+g.x]) continue;
      let x=g.x,y=g.y,guard=0;
      while(!seen[y*W+x] && guard++<W+H){
        const k=y*W+x; if(B[k]){ B[k]=0; tiles[k]=T_DIRT; if(biome[k]===B_WATER||biome[k]===B_MOUNTAIN) biome[k]=landBiome; }
        if(Math.abs(sx-x)>=Math.abs(sy-y)) x+=Math.sign(sx-x); else y+=Math.sign(sy-y);
      }
    }
  }

  // final visual tidy: remove any strict single-tile biome orphans left by the
  // climate seams, cleared areas, or carved bridges (biome-only; passability set)
  despeckleBiome(biome, W, H);

  // gold nodes
  cfg.goldNodes.forEach(g=>{
    state.entities.push(mkEntity(state,'goldmine', null, g.x, g.y, {amount:g.amt}));
  });

  // ---- player start: HQ + Interns + Growth Hackers (+ optional People Ops) ----
  const phq = mkBuilding(state,'hq','player', cfg.player.x, cfg.player.y, true);
  const nW = cfg.startWorkers || 4, nS = cfg.startSoldiers || 2;
  for(let i=0;i<nW;i++) mkUnit(state,'worker','player', cfg.player.x+ (i%3), cfg.player.y+2 + ((i/3)|0));
  for(let i=0;i<nS;i++) mkUnit(state,'soldier','player', cfg.player.x-1+(i%5), cfg.player.y-2 - ((i/5)|0));
  if(cfg.startBarracks) mkBuilding(state,'barracks','player', cfg.player.x-3, cfg.player.y, true);

  // ---- enemy bases (one or more) ----
  bases.forEach(b=> buildEnemyBase(state, b, idx));

  // ---- abandoned player outposts: walk a unit up to one to reclaim it ----
  // Neutral-owned so they're ignored by combat/targeting and don't count toward
  // win/lose until reclaimed; reclaimOutposts() (core.js) flips them to player.
  (cfg.lostBases||[]).forEach(b=>{
    const e = mkBuilding(state,'hq','neutral', b.x, b.y, true);
    e.abandoned = true;
    // reveal the surrounding terrain so the outpost reads as a findable beacon
    for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
      if(inB(b.x+x,b.y+y)) state.explored[(b.y+y)*W+(b.x+x)]=1;
    }
  });

  recomputeSupply(state);
  return state;
}

/* ---------- procedural-terrain helpers ---------- */
// Pick a LAND climate biome from (temperature, moisture), restricted to the
// map's allowed set. Cold → snow, hot+arid → sand, else grass; on a no-grass
// map the leftover temperate band is split desert/ice by the temp midpoint.
function climateBiome(t, m, P, allow){
  if(allow.has(B_ICE)    && t < P.freeze)              return B_ICE;
  if(allow.has(B_DESERT) && t > P.hot && m < P.dry)    return B_DESERT;
  if(allow.has(B_GRASS))                               return B_GRASS;
  if(allow.has(B_TECH))                                return B_TECH;
  if(allow.has(B_VOLCANIC))                            return B_VOLCANIC;   // scorched-land maps
  if(allow.has(B_DESERT) && allow.has(B_ICE))          return t < (P.freeze+P.hot)/2 ? B_ICE : B_DESERT;
  if(allow.has(B_DESERT))                              return B_DESERT;
  if(allow.has(B_ICE))                                 return B_ICE;
  return B_GRASS;
}

// 8-neighbour majority vote over an integer KIND grid, `iters` passes. Off-map
// counts as the cell's own value (edge-stable). Keeps the current value on a tie,
// so it dissolves orphan specks without eroding genuine regions. Allocation-light
// (a fixed 9-slot scratch, no per-tile Map) so it's cheap on the largest maps.
function smoothKind(kind, W, H, iters){
  const out = kind.slice(), buf = new Int32Array(9);
  for(let it=0; it<iters; it++){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x, self=kind[i]; let n=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx, ny=y+dy;
        buf[n++] = (nx<0||ny<0||nx>=W||ny>=H) ? self : kind[ny*W+nx];
      }
      let bestK=self, bestC=0, selfC=0;
      for(let a=0;a<9;a++){ let c=0; const va=buf[a];
        for(let b2=0;b2<9;b2++) if(buf[b2]===va) c++;
        if(va===self) selfC=c;
        if(c>bestC){ bestC=c; bestK=va; }
      }
      out[i] = (selfC>=bestC) ? self : bestK;   // keep self unless something is strictly more common
    }
    for(let i=0;i<W*H;i++) kind[i]=out[i];
  }
}

// Erode lone/thin water: any water tile with <2 orthogonal water neighbours
// reverts to land, taking a neighbouring land biome (so it doesn't render as a
// stray water-floor tile). Iterated, because eroding a thin strip's ends can
// briefly orphan its middle — a couple of passes leaves only solid seas.
function despeckleWater(tiles, biome, W, H, landBiome, iters){
  for(let it=0; it<(iters||1); it++){
    const out = tiles.slice(); let changed=false;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x; if(tiles[i]!==T_WATER) continue;
      let n=0, lb=-1;
      if(x<W-1){ if(tiles[i+1]===T_WATER) n++; else lb=biome[i+1]; }
      if(x>0)  { if(tiles[i-1]===T_WATER) n++; else if(lb<0) lb=biome[i-1]; }
      if(y<H-1){ if(tiles[i+W]===T_WATER) n++; else if(lb<0) lb=biome[i+W]; }
      if(y>0)  { if(tiles[i-W]===T_WATER) n++; else if(lb<0) lb=biome[i-W]; }
      if(n<2){ out[i]=T_GRASS; biome[i] = (lb>=0 && lb!==B_WATER) ? lb : landBiome; changed=true; }
    }
    for(let i=0;i<W*H;i++) tiles[i]=out[i];
    if(!changed) break;
  }
}

// Final tidy: any tile whose biome differs from ALL 8 neighbours (a strict orphan
// — e.g. a lone snow tile ringed by sand) is repainted to its neighbours' mode.
// Biome-only (never touches terrain/passability), so it's safe to run last.
function despeckleBiome(biome, W, H){
  const out = biome.slice(), buf = new Int32Array(8);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x, self=biome[i]; let same=0, n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue;
      const nx=x+dx, ny=y+dy;
      const b = (nx<0||ny<0||nx>=W||ny>=H) ? self : biome[ny*W+nx];
      buf[n++]=b; if(b===self) same++;
    }
    if(same>0) continue;                              // not an orphan
    let bestB=buf[0], bestC=0;
    for(let a=0;a<8;a++){ let c=0, va=buf[a]; for(let b2=0;b2<8;b2++) if(buf[b2]===va) c++; if(c>bestC){ bestC=c; bestB=va; } }
    out[i]=bestB;
  }
  for(let i=0;i<W*H;i++) biome[i]=out[i];
}

// Sandy/dirt shore: any grass tile orthogonally touching water becomes T_DIRT
// (a wet bank). Grass→dirt is passable→passable, so it never walls anything off.
function addBeach(tiles, W, H){
  const out = tiles.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x; if(tiles[i]!==T_GRASS) continue;
    if((x<W-1&&tiles[i+1]===T_WATER) || (x>0&&tiles[i-1]===T_WATER) ||
       (y<H-1&&tiles[i+W]===T_WATER) || (y>0&&tiles[i-W]===T_WATER)) out[i]=T_DIRT;
  }
  for(let i=0;i<W*H;i++) tiles[i]=out[i];
}

/* ---------- entity factories ---------- */
function mkEntity(state,type,owner,tx,ty,extra={}){
  const e = Object.assign({
    id: state.nextId++, type, owner,
    x: tx*TILE+TILE/2, y: ty*TILE+TILE/2,
    selected:false, dead:false,
  }, extra);
  return e;
}
function mkBuilding(state,type,owner,tx,ty,instant=false){
  const d=DEF[type];
  const e = mkEntity(state,type,owner,tx,ty,{
    kind:'building', tx, ty, w:d.w, h:d.h,
    hp: instant? d.hp : 1, maxHp:d.hp,
    constructing: !instant, buildProg: instant? d.build : 0, buildTime:d.build,
    sight:d.sight, rally:null, prodQueue:[], prodTime:0, prodTotal:0,
    cd:0,
  });
  // building center pixel
  e.x = (tx + d.w/2)*TILE;
  e.y = (ty + d.h/2)*TILE;
  state.entities.push(e);
  markBuilding(state,e,true);
  return e;
}
function mkUnit(state,type,owner,tx,ty){
  const d=DEF[type];
  const e = mkEntity(state,type,owner,tx,ty,{
    kind:'unit', hp:d.hp, maxHp:d.hp, sight:d.sight,
    speed:d.speed, r:d.r, dmg:d.dmg, range:d.range, cd:0,
    air:!!d.air,        // flyers ignore terrain (issueMove/separation/targeting/render check this)
    path:null, pathIdx:0, dest:null,
    cmd:null,           // {type:'move'|'attack'|'gather'|'build', ...}
    carrying:0, gatherTimer:0, state:'idle',
    vx:0, vy:0,
  });
  state.entities.push(e);
  return e;
}

function markBuilding(state,e,blockedVal){
  for(let y=0;y<e.h;y++)for(let x=0;x<e.w;x++){
    const tx=e.tx+x, ty=e.ty+y;
    if(tx>=0&&ty>=0&&tx<state.W&&ty<state.H) state.blocked[ty*state.W+tx]=blockedVal?1:passableTerrain(state.tiles[ty*state.W+tx])?0:1;
  }
}

function recomputeSupply(state){
  let cap=0, used=0;
  for(const e of state.entities){
    if(e.dead||e.owner!=='player') continue;
    if(e.kind==='building' && !e.constructing){ cap += (DEF[e.type].supply||0); }
    if(e.kind==='unit'){ used += (DEF[e.type].supply||0); }
  }
  state.supplyCap=cap; state.supply=used;
}

