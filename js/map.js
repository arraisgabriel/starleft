/* map.js — map generation & entity factories: buildEnemyBase, newMap, mkEntity/mkBuilding/mkUnit, markBuilding, recomputeSupply. */
function buildEnemyBase(state, base, idx){
  // origin (ax,ay) = HQ top-left. Buildings are big now (HQ 4×3, barracks/garage
  // 3×3, turret 2×2), so they're laid out side-by-side without overlap; the base
  // spans roughly ax-2..ax+7 × ay..ay+6 (clearArea below clears radius 7 around it).
  const ax=base.x, ay=base.y;
  mkBuilding(state,'hq','enemy', ax, ay, true);                 // 4×3
  mkBuilding(state,'barracks','enemy', ax+4, ay, true);         // 3×3, right of HQ
  if(base.extraBarracks) mkBuilding(state,'barracks','enemy', ax+4, ay+3, true); // below the barracks
  mkBuilding(state,'turret','enemy', ax-2, ay, true);           // 2×2, left of HQ
  if(idx>=1 && ax+3<=state.W && ay+6<=state.H) mkBuilding(state,'garage','enemy', ax, ay+3, true); // 3×3, below HQ
  const ndef = base.defenders!=null ? base.defenders : (idx===0?2:4);
  for(let i=0;i<ndef;i++) mkUnit(state,'soldier','enemy', ax+1+i, ay+6);   // muster below the base (clear ground)
  // dynamic difficulty: extra defenders scaled to the player's carried career power (balance.js).
  // state._vpi is computed once in newMap before the bases are built; 0 (fresh) → no bonus.
  if(typeof applyVetScalingToBase==='function') applyVetScalingToBase(state, base, idx, state._vpi||0);
}

// All maps are enlarged uniformly at load time: dimensions (w,h) and every tile
// coordinate (starts, bases, lakes, forests, rocks, gold, lost outposts) and lake
// radii are multiplied by MAP_SCALE so the whole layout grows proportionally —
// 70% bigger per side (~2.9x the area) while keeping the hand-tuned spacing. Counts
// (rock/forest `n`), gold `amt`, and gameplay tuning are left as-is. Tune here.
const MAP_SCALE = 1.7;
function scaleCfg(cfg){
  const S = v => Math.round(v * MAP_SCALE);
  const pt = p => Object.assign({}, p, { x:S(p.x), y:S(p.y) }, p.r!=null ? { r:S(p.r) } : {});
  const c = Object.assign({}, cfg, { w:S(cfg.w), h:S(cfg.h), player:pt(cfg.player) });
  if(cfg.enemies)      c.enemies      = cfg.enemies.map(pt);
  if(cfg.enemy)        c.enemy        = pt(cfg.enemy);
  if(cfg.lakes)        c.lakes        = cfg.lakes.map(pt);
  if(cfg.rockClusters) c.rockClusters = cfg.rockClusters.map(pt);
  if(cfg.forests)      c.forests      = cfg.forests.map(pt);
  if(cfg.goldNodes)    c.goldNodes    = cfg.goldNodes.map(pt);
  if(cfg.lostBases)    c.lostBases    = cfg.lostBases.map(pt);
  if(cfg.guards)       c.guards       = cfg.guards.map(pt);   // {x,y,n,type} — n/type preserved by pt
  if(cfg.captives)     c.captives     = cfg.captives.map(p=> Object.assign({}, p, { x:S(p.x), y:S(p.y) }, p.freeRadius!=null?{freeRadius:S(p.freeRadius)}:{}));
  // thickets: scale only the geometry (x,y,w,h); density/mix/trail are unitless
  if(cfg.thickets)     c.thickets     = cfg.thickets.map(t=>Object.assign({},t,{x:S(t.x),y:S(t.y),w:S(t.w),h:S(t.h)}));
  return c;
}

/* ============================================================================
   TOPOGRAPHY FEATURES — 2x2 "walk-under" trees & rocks.
   A feature occupies a 2x2 block anchored at its top-left (tx,ty). Its BOTTOM
   row blocks movement (like the old single tile); its TOP row stays passable so
   units walk UNDER the canopy (the depth-sorted draw in render.js occludes them).
   state.features[] holds the records; state.feat[] is the per-cell mask
   (0 none | 1 canopy/top passable | 2 base/bottom blocker) — the single source of
   truth that keeps building (un)placement honest. See prompts/4x-walkunder-topography-plan.md.
   ============================================================================ */

// The one rule for "is cell i impassable from terrain OR a feature base?".
// Tolerant of a missing feat[] (old saves) so it can be reused at runtime.
function baseBlocked(state,i){ return (passableTerrain(state.tiles[i]) && (!state.feat || state.feat[i]!==2)) ? 0 : 1; }

// Anchor a FEAT_SIZE×FEAT_SIZE feature at the lattice point (tx,ty). TOLERANT: claims every
// land cell (floor-ifying any tree/rock), and simply SKIPS water cells (those keep blocking as
// terrain — never paved). Fails only if out of bounds, fully owned, or all-water. The bottom
// FEAT rows (y >= FEAT_BLOCK_FROM) block; the upper rows are passable (walk-under). Floor-ifying
// makes the terrain pass draw ground so only drawFeature draws the sprite. One rng() for the mirror.
function addFeature(state, tx, ty, slot, rng){
  const W=state.W,H=state.H, N=FEAT_SIZE;
  if(tx<0||ty<0||tx+N>W||ty+N>H) return false;
  let claimed=false, bsrc=-1;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=(ty+y)*W+(tx+x), t=state.tiles[i];
    if(state.feat[i]) continue;                                     // cell owned by another feature → skip (no double-claim)
    if(t===T_WATER) continue;                                       // leave water as-is (still blocks); never pave it
    if(t===T_TREE || t===T_ROCK) state.tiles[i]=T_GRASS;            // floor-ify → terrain pass draws ground
    const block = y>=FEAT_BLOCK_FROM;
    state.feat[i] = block ? 2 : 1;                                  // bottom rows block, upper rows passable-occupied
    if(bsrc<0 || block) bsrc=i;                                     // sample biome from a bottom (base) cell
    claimed=true;
  }
  if(!claimed) return false;                                        // nothing free (all-water / fully owned)
  state.features.push({ slot, tx, ty, biome:state.biome[bsrc], v:rng() });
  return true;
}

// Global rollout: turn EVERY tree & rock (incl. mountain-range rock) into a FEAT_SIZE walk-under
// feature so none stay single-tile. Each tree/rock tile snaps to its FEAT_SIZE-lattice anchor, so
// adjacent tiles merge into shared blocks with no fragmentation or leftovers. Geography-preserving
// — runs on a DERIVED rng so the main terrain stream is untouched.
function buildTopoFeatures(state, rng){
  const {W,H,tiles,feat}=state, N=FEAT_SIZE;
  for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++){
    const t=tiles[ty*W+tx];
    if(t!==T_TREE && t!==T_ROCK) continue;          // every tree/rock — no biome exclusion
    if(feat[ty*W+tx]) continue;                     // already absorbed into a feature
    let ax=tx-(tx%N), ay=ty-(ty%N);                 // snap to the N-tile lattice
    if(ax>W-N) ax=W-N; if(ay>H-N) ay=H-N; if(ax<0) ax=0; if(ay<0) ay=0;   // clamp so the N×N stays in-bounds
    addFeature(state, ax, ay, (t===T_TREE)?'tree':'rock', rng);
  }
}

// Remove the features owning any of `cells` (a Set of cell indices): clear their feat mask,
// re-derive blocked for their footprints, and drop them from features[]. Deterministic
// (iterates features[] in order). Used by the bridge-carver + trail repair.
function dropFeaturesAt(state, cells){
  if(!cells || !cells.size) return;
  const W=state.W, N=FEAT_SIZE, kill=new Set();
  for(const f of state.features){
    for(const k of cells){ const x=k%W, y=(k/W)|0;
      if(x>=f.tx && x<f.tx+N && y>=f.ty && y<f.ty+N){ kill.add(f); break; } }
  }
  if(!kill.size) return;
  for(const f of kill) for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=(f.ty+y)*W+(f.tx+x); state.feat[i]=0; if(state.blocked) state.blocked[i]=baseBlocked(state,i);
  }
  state.features = state.features.filter(f=>!kill.has(f));
}

// Stamp a funding node's 3x3 footprint into the topography masks so it occupies 9 slots
// exactly like a tree/rock feature: the bottom FEAT_BLOCK_FROM rows block, the upper rows
// are passable walk-under, and the center row stays passable so Interns can still reach it.
// Never UNblocks (defensive ||) so it can't punch a hole in an overlapping mega/building.
// Stores the footprint anchor (ftx,fty) for the renderer & minimap. Also called on load
// (save.js), since feat[] is rebuilt from features[] only and would otherwise miss nodes.
function markFundingNode(state, e){
  const W=state.W, H=state.H, N=FEAT_SIZE;
  const tx=((e.x/TILE)|0)-(N>>1), ty=((e.y/TILE)|0)-(N>>1);
  e.ftx=tx; e.fty=ty;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const gx=tx+x, gy=ty+y; if(gx<0||gy<0||gx>=W||gy>=H) continue;
    const i=gy*W+gx, block=(y>=FEAT_BLOCK_FROM);
    state.feat[i] = block ? 2 : 1;
    if(state.blocked) state.blocked[i] = block ? 1 : (state.blocked[i]||baseBlocked(state,i));
  }
}

// Cramped thickets (opt-in via cfg.thickets): pack a region wall-to-wall with 2x2
// features on a 2-tile lattice, carve a guaranteed serpentine trail through it, and
// validate reachability — geometric repair only (no rng) to stay deterministic.
function placeThickets(state, rng){
  const cfg=state.cfg; if(!cfg.thickets || !cfg.thickets.length) return;
  const {W,H,tiles}=state;
  const inB=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
  // POI keep-out (these GENERATE new blockers, unlike the conversion which only re-skins existing trees)
  const protect=new Uint8Array(W*H);
  const stamp=(px,py,rad)=>{ for(let y=-rad;y<=rad;y++)for(let x=-rad;x<=rad;x++){ if(inB(px+x,py+y)) protect[(py+y)*W+(px+x)]=1; } };
  stamp(cfg.player.x|0, cfg.player.y|0, 8);
  (cfg.enemies||[cfg.enemy]).forEach(b=>{ if(b) stamp(b.x|0,b.y|0,9); });
  (cfg.lostBases||[]).forEach(b=> stamp(b.x|0,b.y|0,6));
  (cfg.goldNodes||[]).forEach(g=> stamp(g.x|0,g.y|0,4));
  const mustReach=(cfg.goldNodes||[]).concat(cfg.enemies||[cfg.enemy]).concat(cfg.lostBases||[]).filter(Boolean);

  const N=FEAT_SIZE;
  for(const t of cfg.thickets){
    const rx=(t.x|0)-((t.x|0)%N), ry=(t.y|0)-((t.y|0)%N), rw=Math.max(N,t.w|0), rh=Math.max(N,t.h|0);  // N-lattice (matches buildTopoFeatures)
    const density=(t.density!=null?t.density:0.7), mix=(t.mix!=null?t.mix:0.5);
    const axis=(t.trail==='h'||t.trail==='v')? t.trail : (rw>=rh?'h':'v');
    // (1) carve a serpentine trail FIRST — monotone advance guarantees it reaches the far edge
    const trail=new Set(), PW=Math.max(2,N-1);
    if(axis==='h'){ let cy=ry+(rh>>1);
      for(let x=rx;x<rx+rw;x++){ for(let k=0;k<PW;k++){ const yy=Math.max(ry,Math.min(ry+rh-1, cy-(PW>>1)+k)); if(inB(x,yy)) trail.add(yy*W+x); }
        cy=Math.max(ry+1,Math.min(ry+rh-2, cy+(((rng()*3)|0)-1))); } }
    else { let cx=rx+(rw>>1);
      for(let y=ry;y<ry+rh;y++){ for(let k=0;k<PW;k++){ const xx=Math.max(rx,Math.min(rx+rw-1, cx-(PW>>1)+k)); if(inB(xx,y)) trail.add(y*W+xx); }
        cx=Math.max(rx+1,Math.min(rx+rw-2, cx+(((rng()*3)|0)-1))); } }
    // (2) cram on the N-tile lattice, trail-aware (roll density BEFORE legality → rng-count stable)
    const touchesTrail=(tx,ty)=>{ for(let y=0;y<N;y++)for(let x=0;x<N;x++){ if(trail.has((ty+y)*W+(tx+x))) return true; } return false; };
    const anyProtected=(tx,ty)=>{ for(let y=0;y<N;y++)for(let x=0;x<N;x++){ const cx=tx+x,cy=ty+y; if(inB(cx,cy)&&protect[cy*W+cx]) return true; } return false; };
    for(let b=0;b<Math.floor(rh/N);b++)for(let a=0;a<Math.floor(rw/N);a++){
      const tx=rx+N*a, ty=ry+N*b;
      if(rng()>=density) continue;
      if(anyProtected(tx,ty) || touchesTrail(tx,ty)) continue;
      addFeature(state, tx, ty, (rng()<mix?'tree':'rock'), rng);
    }
    // (3) force trail tiles to passable floor (defensive; addFeature already skipped trail cells)
    for(const k of trail) if(!passableTerrain(tiles[k])) tiles[k]=T_GRASS;
    // (4) validate; geometric repair only — widen by dropping feature bases hugging the trail
    if(!thicketReachOK(state, cfg.player, mustReach)){
      const near=new Set();
      for(const k of trail){ const x=k%W,y=(k/W)|0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const nx=x+dx,ny=y+dy; if(!inB(nx,ny))continue; const i=ny*W+nx; if(state.feat[i]===2) near.add(i); } }
      dropFeaturesAt(state, near);   // blocked grid isn't built yet, so this just clears feat (re-derived at build)
    }
  }
}

// Flood from the player over a SCRATCH blocked (terrain-impassable OR feature base);
// every mustReach POI must remain reachable. Used during thicket validation, before
// the real blocked grid exists. Mirrors megaConnOK / the map.js carve flood.
function thicketReachOK(state, anchor, mustReach){
  const {W,H,tiles,feat}=state;
  const sx=anchor.x|0, sy=anchor.y|0; if(sx<0||sy<0||sx>=W||sy>=H) return true;
  const B=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++) B[i]=(passableTerrain(tiles[i]) && feat[i]!==2)?0:1;
  const seen=new Uint8Array(W*H), stk=[sy*W+sx]; seen[sy*W+sx]=1;
  while(stk.length){ const idx=stk.pop(), x=idx%W, y=(idx/W)|0;
    if(x+1<W){const k=idx+1; if(!seen[k]&&!B[k]){seen[k]=1;stk.push(k);}}
    if(x-1>=0){const k=idx-1; if(!seen[k]&&!B[k]){seen[k]=1;stk.push(k);}}
    if(y+1<H){const k=idx+W; if(!seen[k]&&!B[k]){seen[k]=1;stk.push(k);}}
    if(y-1>=0){const k=idx-W; if(!seen[k]&&!B[k]){seen[k]=1;stk.push(k);}}
  }
  for(const p of mustReach){ const px=p.x|0,py=p.y|0; if(px<0||py<0||px>=W||py>=H) continue; if(!seen[py*W+px]) return false; }
  return true;
}

function newMap(idx){
  const cfg = scaleCfg(MAPS[idx]);
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

  // lakes ( ||[] : a map may legitimately omit any feature list — e.g. the tech-only Episode X has no forests)
  (cfg.lakes||[]).forEach(l=>{
    for(let y=-l.r-1;y<=l.r+1;y++) for(let x=-l.r-1;x<=l.r+1;x++){
      const d=Math.hypot(x,y); if(d< l.r + (rng()-0.5)*1.4) set(l.x+x,l.y+y,T_WATER);
    }
  });
  // rock clusters
  (cfg.rockClusters||[]).forEach(c=>{
    let cx=c.x,cy=c.y;
    for(let i=0;i<c.n;i++){ set(cx,cy,T_ROCK); cx+=((rng()*3)|0)-1; cy+=((rng()*3)|0)-1; }
  });
  // forests
  (cfg.forests||[]).forEach(f=>{
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
  clearArea(cfg.player.x,cfg.player.y,6);                  // bigger buildings need a bigger clear pad
  bases.forEach(b=> clearArea(b.x,b.y,7));                 // enemy base spans ~ax-2..ax+7 × ay..ay+6
  (cfg.lostBases||[]).forEach(b=> clearArea(b.x,b.y,4));   // abandoned outposts sit on clear ground too
  (cfg.guards||[]).forEach(g=> clearArea(g.x,g.y,2));      // standing guard squads need clear footing
  (cfg.captives||[]).forEach(c=> clearArea(c.x,c.y,3));    // the prison cell at the corridor's end
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
    megaSprites: [],                    // big animated landmark scenery (megasprites.js)
    features: [],                       // 2x2 walk-under trees/rocks: {slot,tx,ty,biome,v}
    feat: new Uint8Array(W*H),          // per-cell feature mask: 0 none | 1 canopy(top) | 2 base(blocker)
    blocked: new Uint8Array(W*H),       // impassable (terrain or building or feature base)
    explored: new Uint8Array(W*H),
    visible:  new Uint8Array(W*H),
    entities: [],
    gold: cfg.startGold!=null ? cfg.startGold : 300,   // explicit 0 must stay 0 (Ep X infiltration: no funding)
    supply: 0, supplyCap: 0,
    nextId: 1,
    // per-map entropy for the unit dossier seeds (lore.js ensureDossier): fresh recruits get new
    // backstories every game/map/replay. Saved with G, so a reloaded match keeps its people.
    runSalt: (Math.random()*0x7fffffff)|0,
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
    // The Sprint — transient run-while-tapping state (js/sprint.js). Excluded from saves.
    sprint:{ active:false, window:0, t:0, mul:1, x:0, y:0, tapCount:0 },
  };

  // topography features (2x2 walk-under trees/rocks). A DERIVED rng keeps the main
  // terrain stream untouched (geography unchanged); runs after the pads are cleared
  // so it never drops a blocker on a base/gold spot. buildTopoFeatures re-skins the
  // scattered decorative trees/rocks; placeThickets adds opt-in crammed-with-trail regions.
  {
    const topoRng = makeRng(cfg.seed*1000+909);
    buildTopoFeatures(state, topoRng);
    placeThickets(state, topoRng);
  }

  // build blocked grid from terrain + feature bases
  for(let i=0;i<W*H;i++) state.blocked[i] = baseBlocked(state,i);

  // guarantee every gold node is reachable from the player's start — if a sea or
  // range happened to wall one off, carve a thin land bridge to the mainland.
  {
    const B=state.blocked, sx=cfg.player.x, sy=cfg.player.y, seen=new Uint8Array(W*H), st=[[sx,sy]];
    const carved=new Set();             // feature-base cells a bridge tunnels through → drop those features
    seen[sy*W+sx]=1;
    while(st.length){ const [x,y]=st.pop();
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue; const k=ny*W+nx; if(seen[k]||B[k]) continue; seen[k]=1; st.push([nx,ny]); } }
    for(const g of cfg.goldNodes.concat(bases)){
      if(seen[g.y*W+g.x]) continue;
      let x=g.x,y=g.y,guard=0;
      while(!seen[y*W+x] && guard++<W+H){
        const k=y*W+x; if(B[k]){ if(state.feat[k]===2) carved.add(k); B[k]=0; tiles[k]=T_DIRT; if(biome[k]===B_WATER||biome[k]===B_MOUNTAIN) biome[k]=landBiome; }
        if(Math.abs(sx-x)>=Math.abs(sy-y)) x+=Math.sign(sx-x); else y+=Math.sign(sy-y);
      }
    }
    dropFeaturesAt(state, carved);      // clear any feature the bridge cut through (rare path)
  }

  // final visual tidy: remove any strict single-tile biome orphans left by the
  // climate seams, cleared areas, or carved bridges (biome-only; passability set)
  despeckleBiome(biome, W, H);

  // distance-to-shore depth field for smooth (non-blocky) water/magma rendering + tide buffers
  // (js/water.js). MUST run after ALL tiles[] water mutation (despeckle + bridge carve above).
  if(typeof buildWaterDepth==='function') buildWaterDepth(state);

  // big animated landmarks (megabuildings / mountains / volcanoes / ruins). Placed
  // after the connectivity bridges are carved and biome[] is final; uses a derived
  // seed so it doesn't perturb the rng stream the rest of generation consumed, and
  // each footprint is validated by a flood-fill so it can't wall off a node/base.
  placeMegaSprites(state, makeRng(cfg.seed*1000+4242));

  // gold nodes. amount0 = starting funding (drives the glow's depletion fade); r is the
  // gather radius, widened so Interns mine from the 3x3 rock's perimeter rather than one
  // point. The 3x3 walk-under footprint is stamped after the relocation pass below.
  cfg.goldNodes.forEach(g=>{
    state.entities.push(mkEntity(state,'goldmine', null, g.x, g.y, {amount:g.amt, amount0:g.amt, r:Math.round(TILE*1.5)}));
  });

  // ---- player start: HQ + Interns + Growth Hackers (+ optional People Ops) ----
  const phq = mkBuilding(state,'hq','player', cfg.player.x, cfg.player.y, true);
  const nW = cfg.startWorkers!=null ? cfg.startWorkers : 4;   // explicit 0 must stay 0 (Ep X starts economy-less)
  const nS = cfg.startSoldiers!=null ? cfg.startSoldiers : 2;
  for(let i=0;i<nW;i++) mkUnit(state,'worker','player', cfg.player.x+ (i%3), cfg.player.y+4 + ((i/3)|0));  // below the 4×3 HQ
  for(let i=0;i<nS;i++) mkUnit(state,'soldier','player', cfg.player.x-1+(i%5), cfg.player.y-2 - ((i/5)|0)); // above the HQ
  // hand-specified extra starters — Episode X sends Nino in with two Lobbyists and no economy.
  // each {type, n, level} spawns n units of `type` above the HQ, optionally pre-leveled.
  if(cfg.startUnits) cfg.startUnits.forEach(g=>{ const lvl=g.level||0; for(let i=0;i<(g.n||1);i++){
    const u=mkUnit(state, g.type, 'player', cfg.player.x-2+(i%5), cfg.player.y-4-((i/5)|0));
    if(lvl && typeof CAREER!=='undefined'){ u.stars=Math.max(0,Math.min(CAREER.maxStars,lvl)); u.xp=CAREER.xpFor(u.stars); if(typeof applyVetHp==='function') applyVetHp(u,true); }
  }});
  spawnVets(state);   // carry veterans from the previous campaign map (count grows every 2 maps)
  spawnHeroes(state); // named campaign heroes declared on the map (e.g. Nino on Episode VIII)
  if(cfg.startBarracks) mkBuilding(state,'barracks','player', cfg.player.x-3, cfg.player.y, true);

  // dynamic difficulty: measure carried career power NOW (player units are placed, enemies aren't),
  // so each enemy base can muster proportionate extra defenders (balance.js). 0 (fresh) → no bonus.
  state._vpi = (typeof computePlayerVPI==='function') ? computePlayerVPI(state) : 0;

  // ---- enemy bases (one or more) ----
  bases.forEach(b=> buildEnemyBase(state, b, idx));

  // ---- abandoned player outposts: walk a unit up to one to reclaim it ----
  // Neutral-owned so they're ignored by combat/targeting and don't count toward
  // win/lose until reclaimed; reclaimOutposts() (core.js) flips them to player.
  (cfg.lostBases||[]).forEach(b=>{
    const e = mkBuilding(state,'hq','neutral', b.x, b.y, true);
    e.abandoned = true;
    // reveal the surrounding terrain so the (now 4×3) outpost reads as a findable beacon
    for(let y=-5;y<=6;y++)for(let x=-5;x<=6;x++){
      if(inB(b.x+x,b.y+y)) state.explored[(b.y+y)*W+(b.x+x)]=1;
    }
  });

  // ---- loose guard squads (Episode X corridor + the ring around the cell) ----
  // Enemy units with NO base, flagged `guard` so the wave/cap logic in ai.js leaves them at their
  // post (they still auto-engage when the player closes). Killing the ones around a captive frees it.
  (cfg.guards||[]).forEach(g=>{
    const n=g.n||3, type=g.type||'soldier';
    for(let i=0;i<n;i++){ const u=mkUnit(state, type, 'enemy', g.x+(i%3)-1, g.y+((i/3)|0)); u.guard=true; }
  });

  // ---- captives held in the A&O prison-office (Episode X) ----
  // Spawned NEUTRAL so neither side targets them and they don't count toward win/lose; freeCaptives()
  // (core.js) flips one to the player once no enemy units remain within its freeRadius. A captive
  // flagged `hero` joins the hero carryover on release (persists like Nino).
  (cfg.captives||[]).forEach(cap=>{
    if(cap.hero && typeof heroIsCarried==='function' && heroIsCarried(cap.name)) return;  // already freed in a prior run → spawns at HQ instead
    const u=mkUnit(state, cap.type, 'neutral', cap.x, cap.y);
    u.captive=true; u.freeRadius=cap.freeRadius||7;
    if(cap.hero){ u.captiveHero=true; u.captiveName=cap.name; u.captiveSprite=cap.sprite; u.captiveLevel=cap.level||0; u.captiveDossier=cap.dossier;
      if(cap.sprite) u.spriteType=cap.sprite; }   // show her real sprite even while caged
    for(let y=-5;y<=6;y++)for(let x=-5;x<=6;x++){ if(inB(cap.x+x,cap.y+y)) state.explored[(cap.y+y)*W+(cap.x+x)]=1; }
  });

  // Buildings are bigger now, so a base/start can land on a gold node that config
  // tucked snugly against it (covered nodes are unminable + unreachable). Nudge any
  // covered/unreachable node out to the nearest PLAYER-REACHABLE open tile.
  {
    const B=state.blocked, reach=new Uint8Array(W*H);    // tiles reachable from the player's muster
    let sx=cfg.player.x, sy=cfg.player.y+4;
    if(B[sy*W+sx]){ for(let r=1;r<10;r++){ let done=false;
      for(let dy=-r;dy<=r&&!done;dy++)for(let dx=-r;dx<=r&&!done;dx++){ const nx=cfg.player.x+dx,ny=cfg.player.y+dy;
        if(nx>=0&&ny>=0&&nx<W&&ny<H&&!B[ny*W+nx]){ sx=nx; sy=ny; done=true; } } if(done) break; } }
    const fq=[sy*W+sx]; reach[sy*W+sx]=1;
    for(let h=0;h<fq.length;h++){ const k=fq[h], x=k%W, y=(k/W)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(!reach[j]&&!B[j]){ reach[j]=1; fq.push(j); } } }
    for(const e of state.entities){
      if(e.type!=='goldmine') continue;
      const gx=(e.x/TILE)|0, gy=(e.y/TILE)|0;
      if(reach[gy*W+gx]) continue;                        // already reachable & open
      const seen=new Uint8Array(W*H), q=[gy*W+gx]; seen[gy*W+gx]=1; let found=-1;
      for(let h=0; h<q.length && found<0; h++){ const k=q[h], x=k%W, y=(k/W)|0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(seen[j]) continue; seen[j]=1;
          if(reach[j]){ found=j; break; } q.push(j); } }   // expand across walls to the nearest reachable tile
      if(found>=0){ e.x=((found%W)+0.5)*TILE; e.y=(((found/W)|0)+0.5)*TILE; }
    }
  }

  // give every funding node its 3x3 walk-under footprint, now that relocation has
  // settled each node's final tile: clear any topo feature it overlaps, then stamp.
  for(const e of state.entities){
    if(e.type!=='goldmine') continue;
    const N=FEAT_SIZE, tx=((e.x/TILE)|0)-(N>>1), ty=((e.y/TILE)|0)-(N>>1), cells=new Set();
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){ const gx=tx+x, gy=ty+y; if(gx>=0&&gy>=0&&gx<W&&gy<H) cells.add(gy*W+gx); }
    dropFeaturesAt(state, cells);
    markFundingNode(state, e);
  }

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
    if(tx>=0&&ty>=0&&tx<state.W&&ty<state.H) state.blocked[ty*state.W+tx]=blockedVal?1:baseBlocked(state, ty*state.W+tx);
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

