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

  // ---- biome regions ----
  // Every map gets a COHERENT palette so it reads like a real place: a grassland
  // base, one or two seas, one or two mountain ranges, and at most ONE ground
  // accent (tech, desert, OR snow — never mixed together, and never volcanic).
  // Snow only forms large fields over the grass/water landscape.
  const biome = new Array(W*H).fill(B_GRASS);
  {
    const patches = [];
    const nWater = 1 + ((rng()*2)|0);                       // 1-2 seas
    for(let i=0;i<nWater;i++) patches.push({ x:3+((rng()*(W-6))|0), y:3+((rng()*(H-6))|0), r:4+rng()*4.5, kind:B_WATER });
    const nMtn = 1 + ((rng()*2)|0);                         // 1-2 mountain ranges
    for(let i=0;i<nMtn;i++) patches.push({ x:3+((rng()*(W-6))|0), y:3+((rng()*(H-6))|0), r:4+rng()*4, kind:B_MOUNTAIN });
    // one ground accent for the whole map (~40% none) — tech, desert, or snow
    const accent = [B_GRASS,B_GRASS,B_TECH,B_DESERT,B_ICE][(rng()*5)|0];
    if(accent===B_ICE){
      const n = 1 + ((rng()*2)|0);                          // a couple of LARGE snowfields
      for(let i=0;i<n;i++) patches.push({ x:5+((rng()*(W-10))|0), y:5+((rng()*(H-10))|0), r:7+rng()*5, kind:B_ICE });
    } else if(accent!==B_GRASS){
      const n = 1 + ((rng()*2)|0);                          // a tech zone / desert region
      for(let i=0;i<n;i++) patches.push({ x:4+((rng()*(W-8))|0), y:4+((rng()*(H-8))|0), r:5+rng()*4, kind:accent });
    }
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let bestD=1e9, best=B_GRASS;
      for(const p of patches){
        const wob=(variant[y*W+x]-0.5)*p.r*0.85;       // per-tile noise → ragged edges
        const d=Math.hypot(x-p.x,y-p.y)+wob;
        if(d<p.r && d<bestD){ bestD=d; best=p.kind; }
      }
      biome[y*W+x]=best;
    }
    // biome-driven terrain so regions become real obstacles, not just paint
    for(let i=0;i<W*H;i++){
      if(biome[i]===B_WATER) tiles[i]=T_WATER;                       // seas
      else if(biome[i]===B_MOUNTAIN && variant[i]>0.34) tiles[i]=T_ROCK; // ranges w/ passable gaps
    }
  }

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

  // Make sure player & enemy start areas are clear grassland (terrain + biome)
  const clearArea=(px,py,rad)=>{ for(let y=-rad;y<=rad;y++)for(let x=-rad;x<=rad;x++){
    if(inB(px+x,py+y)){ const j=(py+y)*W+(px+x); tiles[j]=T_GRASS; biome[j]=B_GRASS; } } };
  clearArea(cfg.player.x,cfg.player.y,4);
  bases.forEach(b=> clearArea(b.x,b.y,4));
  // keep gold nodes reachable: clear the footprint to passable floor (biome theme kept)
  cfg.goldNodes.forEach(g=>{ for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
    if(inB(g.x+x,g.y+y)){ const j=(g.y+y)*W+(g.x+x); tiles[j]=T_GRASS; biome[j]=B_GRASS; } } });

  const state = {
    cfg, W, H, tiles, variant, biome,
    blocked: new Uint8Array(W*H),       // impassable (terrain or building)
    explored: new Uint8Array(W*H),
    visible:  new Uint8Array(W*H),
    entities: [],
    gold: cfg.startGold || 300,
    supply: 0, supplyCap: 0,
    nextId: 1,
    camX: cfg.player.x*TILE - innerWidth/2 + 100,
    camY: cfg.player.y*TILE - innerHeight/2 + 100,
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
        const k=y*W+x; if(B[k]){ B[k]=0; tiles[k]=T_DIRT; }
        if(Math.abs(sx-x)>=Math.abs(sy-y)) x+=Math.sign(sx-x); else y+=Math.sign(sy-y);
      }
    }
  }

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

  recomputeSupply(state);
  return state;
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

