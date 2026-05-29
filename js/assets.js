/* =====================================================================
   ASSET PATHS — single source of truth for every runtime image path.
   All art lives under assets/ (atlas/ terrain/ buildings/ units/<type>/).
   Paths are RELATIVE so the game works under GitHub Pages' /<repo>/ subpath.
   To move/rename art, change ONLY these helpers. (Loaded after config.js.)
   ===================================================================== */
const ASSET_BASE      = 'assets/';
const ATLAS_TILESET   = ASSET_BASE + 'atlas/tileset.png';
const ATLAS_BUILDINGS = ASSET_BASE + 'atlas/buildings.png';
// terrain slot: ground | rock | cactus | oasis  (desert biome opaque tiles)
function terrainTile(slot){ return ASSET_BASE + 'terrain/desert_' + slot + '.png'; }
// standalone building sheet: name garage|launchpad , faction player|enemy
function buildingSheet(name, faction){ return ASSET_BASE + 'buildings/' + name + '_' + faction + '.png'; }
// unit sheet: type worker|soldier|... , action walk|mine|attack|heal , enemy bool
function unitSheet(type, action, enemy){ return ASSET_BASE + 'units/' + type + '/' + action + (enemy ? '_enemy' : '') + '.png'; }

/* ---- Hand-drawn tile atlas (tileset.png) ----
   A 6×6 grid sliced from the generated atlas; magenta gutters detected at
   load-time gave these exact interior cell spans. Each (biome, slot) maps to
   one cell that already includes its own ground, so a feature tile (rock /
   tree / water) is blitted as the whole 32px tile — no separate floor pass.
   Falls back to the procedural renderer if the image is missing or a slot is
   undefined (e.g. Desert, which the atlas has no clean sand floor for). */
const ATLAS_IMG = new Image();
let ATLAS_READY = false;
ATLAS_IMG.onload = ()=>{ ATLAS_READY = true; };
ATLAS_IMG.onerror = ()=>{ ATLAS_READY = false; };
ATLAS_IMG.src = ATLAS_TILESET;
const ATLAS_COLS=[[1,169],[172,168],[343,168],[513,168],[683,170],[854,169]]; // [x, width]
const ATLAS_ROWS=[[1,169],[172,168],[343,168],[514,168],[684,168],[855,168]]; // [y, height]
function atlasRect(r,c){ const ins=4; const [x,w]=ATLAS_COLS[c], [y,h]=ATLAS_ROWS[r]; return [x+ins,y+ins,w-2*ins,h-2*ins]; }
const SPRITES = {
  [B_GRASS]:    { floor:atlasRect(0,0), rock:atlasRect(0,1), tree:atlasRect(0,2), water:atlasRect(0,4) },
  [B_MOUNTAIN]: { floor:atlasRect(1,0), rock:atlasRect(1,1), tree:atlasRect(1,2), water:atlasRect(1,3) },
  [B_WATER]:    { floor:atlasRect(2,0), rock:atlasRect(2,1), tree:atlasRect(2,2), water:atlasRect(2,3) },
  [B_TECH]:     { floor:atlasRect(3,0), rock:atlasRect(3,1), tree:atlasRect(3,2), water:atlasRect(3,3) },
  // Desert intentionally omitted → procedural sand (atlas lacks a clean sand floor)
  [B_ICE]:      { floor:atlasRect(4,0), rock:atlasRect(4,2), tree:atlasRect(4,3), water:atlasRect(4,4) },
  [B_VOLCANIC]: { floor:atlasRect(5,0), rock:atlasRect(5,2), tree:atlasRect(5,3), water:atlasRect(5,4) },
};
function spriteFor(biome, slot){
  if(!ATLAS_READY) return null;
  const s = SPRITES[biome]; return s ? (s[slot]||null) : null;
}
// Desert renders from its own opaque tiles (sand floor / boulder / cactus / oasis)
const DESERT_TILES = { floor:terrainTile('ground'), rock:terrainTile('rock'), tree:terrainTile('cactus'), water:terrainTile('oasis') };
const DESERT_IMG = {};
function desertTile(slot){
  const src=DESERT_TILES[slot]||DESERT_TILES.floor;
  let im=DESERT_IMG[src]; if(!im){ im=new Image(); im.src=src; DESERT_IMG[src]=im; }
  return (im.complete&&im.naturalWidth)?im:null;
}

/* ---- Building sprite atlas (buildings.png) ----
   3×2 grid: columns HQ / Barracks / Turret, rows player (cyan) / enemy (red).
   The generated atlas baked its transparency as a grey checkerboard, so it was
   alpha-keyed at slice time; these rects are the tight bounding boxes of each
   building inside the keyed atlas. Blitted aspect-preserved + bottom-anchored
   so buildings "stand" on their footprint and overhang upward. */
const BLD_IMG = new Image();
let BLD_READY = false;
BLD_IMG.onload = ()=>{ BLD_READY = true; };
BLD_IMG.onerror = ()=>{ BLD_READY = false; };
BLD_IMG.src = ATLAS_BUILDINGS;
const BUILDING_SPRITES = {
  hq:       { player:[44,25,253,284],  enemy:[42,369,255,276] },
  barracks: { player:[380,40,287,269], enemy:[380,379,287,273] },
  turret:   { player:[801,80,192,175], enemy:[799,433,195,224] },
};
/* ---- Visual faction ----
   Gameplay still treats owner==='player' as the human side everywhere; this
   only flips APPEARANCE. With PLAYER_IS_RED the human renders in red art/colors
   and the AI in blue. Sprite atlases are keyed 'player'(blue)/'enemy'(red), so
   factionKey() returns which set to draw for a given owner. */
const PLAYER_IS_RED = true;
function isRedSide(owner){ const human=owner==='player'; return PLAYER_IS_RED ? human : !human; }
function factionKey(owner){ return isRedSide(owner) ? 'enemy' : 'player'; }

// New production buildings live as their own transparent PNGs (one per faction)
function loadImg(src){ const i=new Image(); i.src=src; return i; }
const NEW_BUILDINGS = {
  garage:    { player:loadImg(buildingSheet('garage','player')),    enemy:loadImg(buildingSheet('garage','enemy')) },
  launchpad: { player:loadImg(buildingSheet('launchpad','player')), enemy:loadImg(buildingSheet('launchpad','enemy')) },
};
// returns {img, rect:[sx,sy,sw,sh]} for an entity's building sprite, or null
function buildingSprite(type,owner){
  const fk=factionKey(owner);
  if(BUILDING_SPRITES[type]){ if(!BLD_READY) return null; const r=BUILDING_SPRITES[type][fk]; return r?{img:BLD_IMG, rect:r}:null; }
  const nb=NEW_BUILDINGS[type]; if(nb){ const im=nb[fk]; return (im&&im.complete&&im.naturalWidth)?{img:im, rect:[0,0,im.naturalWidth,im.naturalHeight]}:null; }
  return null;
}

/* ---- Unit animations (sliced from green-screen sprite strips) ----
   4-frame walk cycle, uniform 267×267 frames, shared baseline so it doesn't
   jitter. Animation advances by distance travelled (legs match ground speed)
   and the sprite mirrors on horizontal facing. Enemy has no Interns, so the
   player blue worker covers every worker in practice; other unit types and
   any missing sheet fall back to the procedural vector drawing. */
function loadWalk(src, fw, fh, frames){
  const a = { img:new Image(), ready:false, fw:fw||0, fh:fh||0, frames:frames||null };
  a.img.onload=()=>{ if(!a.frames){ a.fw=a.img.width/4; a.fh=a.img.height;   // auto-derive 4 side-by-side frames
      a.frames=[[0,0,a.fw,a.fh],[a.fw,0,a.fw,a.fh],[2*a.fw,0,a.fw,a.fh],[3*a.fw,0,a.fw,a.fh]]; } a.ready=true; };
  a.img.onerror=()=>{ a.ready=false; }; a.img.src=src;
  return a;
}
// atlases hold 4 cell-isolated frames laid side by side (frame i at x=i*fw)
const WORKER_WALK = loadWalk(unitSheet('worker','walk',false), 257,256,
  [[0,0,257,256],[257,0,257,256],[514,0,257,256],[771,0,257,256]]);
const SOLDIER_WALK = loadWalk(unitSheet('soldier','walk',false), 250,263,
  [[0,0,250,263],[250,0,250,263],[500,0,250,263],[750,0,250,263]]);
const RANGER_WALK = loadWalk(unitSheet('ranger','walk',false), 256,259,
  [[0,0,256,259],[256,0,256,259],[512,0,256,259],[768,0,256,259]]);
const RANGER_WALK_ENEMY = loadWalk(unitSheet('ranger','walk',true), 258,261,
  [[0,0,258,261],[258,0,258,261],[516,0,258,261],[774,0,258,261]]);
const SOLDIER_WALK_ENEMY = loadWalk(unitSheet('soldier','walk',true), 260,264,
  [[0,0,260,264],[260,0,260,264],[520,0,260,264],[780,0,260,264]]);
const WORKER_WALK_ENEMY = loadWalk(unitSheet('worker','walk',true), 260,259,
  [[0,0,260,259],[260,0,260,259],[520,0,260,259],[780,0,260,259]]);
// per-type walk sets keyed by owner; sprite height per type. Missing owner →
// null (no fallback to the other faction's color) → procedural vector drawing.
const UNIT_WALK = {
  worker:  { player:WORKER_WALK, enemy:WORKER_WALK_ENEMY },
  soldier: { player:SOLDIER_WALK, enemy:SOLDIER_WALK_ENEMY },
  ranger:  { player:RANGER_WALK, enemy:RANGER_WALK_ENEMY },
  recruiter:{ player:loadWalk(unitSheet('recruiter','walk',false)), enemy:loadWalk(unitSheet('recruiter','walk',true)) },
  hustler:  { player:loadWalk(unitSheet('hustler','walk',false)),   enemy:loadWalk(unitSheet('hustler','walk',true)) },
  lobbyist: { player:loadWalk(unitSheet('lobbyist','walk',false)),  enemy:loadWalk(unitSheet('lobbyist','walk',true)) },
  foodtruck:{ player:loadWalk(unitSheet('foodtruck','walk',false)), enemy:loadWalk(unitSheet('foodtruck','walk',true)) },
  auditor:  { player:loadWalk(unitSheet('auditor','walk',false)),   enemy:loadWalk(unitSheet('auditor','walk',true)) },
  founder:  { player:loadWalk(unitSheet('founder','walk',false)),   enemy:loadWalk(unitSheet('founder','walk',true)) },
  courier:  { player:loadWalk(unitSheet('courier','walk',false)),   enemy:loadWalk(unitSheet('courier','walk',true)) },
  bomber:   { player:loadWalk(unitSheet('bomber','walk',false)),    enemy:loadWalk(unitSheet('bomber','walk',true)) },
};
const UNIT_SPRITE_H = { worker:30, soldier:34, ranger:32, recruiter:30, hustler:30, lobbyist:32, foodtruck:32, auditor:36, founder:46, courier:32, bomber:48 };
function unitWalk(type,owner){ const e=UNIT_WALK[type]; const a=e&&e[factionKey(owner)]; return (a&&a.ready)?a:null; }

// action animations (mine / melee / shoot), played in place during the action
const WORKER_MINE  = loadWalk(unitSheet('worker','mine',false),   193,242, [[0,0,193,242],[193,0,193,242],[386,0,193,242],[579,0,193,242]]);
const SOLDIER_ATK  = loadWalk(unitSheet('soldier','attack',false),217,255, [[0,0,217,255],[217,0,217,255],[434,0,217,255],[651,0,217,255]]);
const RANGER_ATK   = loadWalk(unitSheet('ranger','attack',false), 203,245, [[0,0,203,245],[203,0,203,245],[406,0,203,245],[609,0,203,245]]);
const SOLDIER_ATK_ENEMY = loadWalk(unitSheet('soldier','attack',true),222,254, [[0,0,222,254],[222,0,222,254],[444,0,222,254],[666,0,222,254]]);
const RANGER_ATK_ENEMY  = loadWalk(unitSheet('ranger','attack',true), 203,245, [[0,0,203,245],[203,0,203,245],[406,0,203,245],[609,0,203,245]]);
const WORKER_MINE_ENEMY = loadWalk(unitSheet('worker','mine',true),   196,243, [[0,0,196,243],[196,0,196,243],[392,0,196,243],[588,0,196,243]]);
const UNIT_ACTION = {
  worker:  { mine:   { player:WORKER_MINE, enemy:WORKER_MINE_ENEMY } },
  soldier: { attack: { player:SOLDIER_ATK, enemy:SOLDIER_ATK_ENEMY } },
  ranger:  { attack: { player:RANGER_ATK,  enemy:RANGER_ATK_ENEMY } },
  recruiter:{ heal:  { player:loadWalk(unitSheet('recruiter','heal',false)),   enemy:loadWalk(unitSheet('recruiter','heal',true)) } },
  hustler:  { attack:{ player:loadWalk(unitSheet('hustler','attack',false)),   enemy:loadWalk(unitSheet('hustler','attack',true)) } },
  lobbyist: { attack:{ player:loadWalk(unitSheet('lobbyist','attack',false)),  enemy:loadWalk(unitSheet('lobbyist','attack',true)) } },
  foodtruck:{ attack:{ player:loadWalk(unitSheet('foodtruck','attack',false)), enemy:loadWalk(unitSheet('foodtruck','attack',true)) } },
  auditor:  { attack:{ player:loadWalk(unitSheet('auditor','attack',false)),   enemy:loadWalk(unitSheet('auditor','attack',true)) } },
  founder:  { attack:{ player:loadWalk(unitSheet('founder','attack',false)),   enemy:loadWalk(unitSheet('founder','attack',true)) } },
  courier:  { heal:  { player:loadWalk(unitSheet('courier','heal',false)),     enemy:loadWalk(unitSheet('courier','heal',true)) } },
  bomber:   { attack:{ player:loadWalk(unitSheet('bomber','attack',false)),    enemy:loadWalk(unitSheet('bomber','attack',true)) } },
};
function actionAnim(type,action,owner){ const t=UNIT_ACTION[type]; const a=t&&t[action]; const x=a&&a[factionKey(owner)]; return (x&&x.ready)?x:null; }
// blit one frame of an animation for a unit, mirrored on facing, foot-anchored.
// Returns the sprite height drawn.
function blitFrame(u, px, py, anim, S, fi){
  const n=anim.frames.length, fr=anim.frames[((fi%n)+n)%n];
  const dh=S, dw=S*(anim.fw/anim.fh);
  ctx.save(); ctx.translate(px,py);
  // mirror so the sprite faces its movement direction. Some source sprites are
  // drawn facing LEFT (facesLeft) — XOR that in so they don't moonwalk.
  const facesLeft = !!(DEF[u.type] && DEF[u.type].facesLeft);
  if(((u._face||1)<0) !== facesLeft) ctx.scale(-1,1);
  ctx.drawImage(anim.img, fr[0],fr[1],anim.fw,anim.fh, -dw/2, -dh*0.7, dw, dh);
  ctx.restore();
  return dh;
}
