/* =====================================================================
   ASSET PATHS — single source of truth for every runtime image path.
   All art lives under assets/ (atlas/ terrain/ buildings/ units/<type>/).
   Paths are RELATIVE so the game works under GitHub Pages' /<repo>/ subpath.
   To move/rename art, change ONLY these helpers. (Loaded after config.js.)
   ===================================================================== */
const ASSET_BASE      = 'assets/';
const ATLAS_TILESET   = ASSET_BASE + 'atlas/tileset.png';
const ATLAS_BUILDINGS = ASSET_BASE + 'atlas/buildings.png';
const RESOURCE_CRYSTAL = ASSET_BASE + 'resource/crystal.png'; // Funding crystal node (optional; procedural fallback if absent)
// standalone building sheet: name garage|launchpad , faction player|enemy
function buildingSheet(name, faction){ return ASSET_BASE + 'buildings/' + name + '_' + faction + '.png'; }
// unit sheet: type worker|soldier|... , action walk|mine|attack|heal , enemy bool
function unitSheet(type, action, enemy){ return ASSET_BASE + 'units/' + type + '/' + action + (enemy ? '_enemy' : '') + '.png'; }

/* ---- Dark / devastated cyberpunk tile atlas (tileset.png) ----
   A clean, gutterless 3×7 grid composed from per-biome Gemini generations
   (Hades-inspired dark palette; see _dev/gen/ + _dev/prompts/terrain-dark.md).
   Columns are the only slots blitted in-game — floor / rock / tree; rows are
   biomes in biome-constant order (grass=0 … volcanic=6), so the atlas row IS
   the biome id. Each cell already includes its own ground, so a feature tile
   (rock/tree) is the whole 32px blit. Falls back to the procedural renderer if
   the image is missing. (Water has NO column — water tiles are drawn by the
   neighbour-aware procedural shoreline path in render.js, never from the atlas.) */
const ATLAS_IMG = new Image();
let ATLAS_READY = false;
ATLAS_IMG.onload = ()=>{ ATLAS_READY = true; };
ATLAS_IMG.onerror = ()=>{ ATLAS_READY = false; };
ATLAS_IMG.src = ATLAS_TILESET;
const ATLAS_CELL = 128;                                  // px per cell (3 cols × 7 rows, no gutter)
const SLOT_COL = { floor:0, rock:1, tree:2 };
function atlasRect(biome, slot){ const c=SLOT_COL[slot]||0; return [c*ATLAS_CELL, biome*ATLAS_CELL, ATLAS_CELL, ATLAS_CELL]; }
const ATLAS_BIOMES = [B_GRASS,B_MOUNTAIN,B_WATER,B_TECH,B_DESERT,B_ICE,B_VOLCANIC];
const SPRITES = {};
for(const b of ATLAS_BIOMES) SPRITES[b] = { floor:atlasRect(b,'floor'), rock:atlasRect(b,'rock'), tree:atlasRect(b,'tree') };
function spriteFor(biome, slot){
  if(!ATLAS_READY) return null;
  const s = SPRITES[biome]; return s ? (s[slot]||null) : null;
}

/* ---- Topography FEATURE atlas (transparent cut-out rock/tree for the 3x3 walk-under
   features, cut from the originals by _dev/gen/slice_features.py). 2 cols (rock,tree) ×
   7 biome rows (ATLAS_BIOMES order) of FEAT_CELL px. Optional: drawFeatureSprite falls
   back to the opaque tileset cell, then procedural, if this PNG is missing. ---- */
const ATLAS_FEATURES = ASSET_BASE + 'atlas/features.png';
const FEAT_IMG = new Image();
let FEAT_READY = false;
FEAT_IMG.onload = ()=>{ FEAT_READY = true; };
FEAT_IMG.onerror = ()=>{ FEAT_READY = false; };
FEAT_IMG.src = ATLAS_FEATURES;
const FEAT_CELL = 256;
const FEAT_COL = { rock:0, tree:1 };
const FEAT_ROW = {}; ATLAS_BIOMES.forEach((b,i)=>{ FEAT_ROW[b]=i; });
function featSpriteFor(biome, slot){
  if(!FEAT_READY) return null;
  const c = FEAT_COL[slot], r = FEAT_ROW[biome];
  if(c==null || r==null) return null;
  return [c*FEAT_CELL, r*FEAT_CELL, FEAT_CELL, FEAT_CELL];
}

/* ---- Optional WATER / MAGMA atlas (seamless tiles, dark Hades palette) — a DROP-IN upgrade
   over the procedural water.js renderer. If assets/atlas/water.png is absent, WATER_READY stays
   false and water.js renders procedurally (same resilience contract as the tileset/features atlas).
   Could be generated with the Gemini image-pro API. Layout: WATER_CELL px cells, 7 biome rows
   (ATLAS_BIOMES order). Columns by slot: depth 0..2 (shore->mid->deep), caustic 3.. (flow frames),
   molten 11.. (lava-crack frames). water.js calls waterSpriteFor(biome,'depth',depthCell). ---- */
const ATLAS_WATER = ASSET_BASE + 'atlas/water.png';
const WATER_IMG = new Image();
let WATER_READY = false;
WATER_IMG.onload = ()=>{ WATER_READY = true; };
WATER_IMG.onerror = ()=>{ WATER_READY = false; };
WATER_IMG.src = ATLAS_WATER;
const WATER_CELL = 128;
const WATER_SLOT_COL = { depth:0, caustic:3, molten:11 };       // base column per slot
const WATER_ROW = {}; ATLAS_BIOMES.forEach((b,i)=>{ WATER_ROW[b]=i; });
function waterSpriteFor(biome, slot, frame){
  if(!WATER_READY) return null;
  const base = WATER_SLOT_COL[slot], r = WATER_ROW[biome];
  if(base==null || r==null) return null;
  return [(base+(frame||0))*WATER_CELL, r*WATER_CELL, WATER_CELL, WATER_CELL];
}

/* ---- Building sprites (dark cyberpunk-Hades, animated like the mega-sprites) ----
   Every building is a 9-frame strip (player cyan / enemy red), bottom-anchored and
   blitted aspect-preserved so it "stands" on its footprint and overhangs upward;
   only the neon flickers (the structure is frozen). One transparent PNG per faction:
   assets/buildings/<type>_<player|enemy>.png. (Mirrors loadWalk / loadMega.) */
const BUILDING_FRAMES = 9;
const BUILDING_FPS = 0.9;               // slow ambient neon-flicker playback
const BUILDING_TYPES = ['hq','barracks','turret','garage','launchpad','outpost'];
function loadBuildingStrip(type, faction){
  const a = { img:new Image(), ready:false, fw:0, fh:0 };
  a.img.onload  = ()=>{ a.fw = a.img.naturalWidth/BUILDING_FRAMES; a.fh = a.img.naturalHeight; a.ready = true; };
  a.img.onerror = ()=>{ a.ready=false; };
  a.img.src = buildingSheet(type, faction);
  return a;
}
const BUILDING_ANIM = {};
for(const t of BUILDING_TYPES) BUILDING_ANIM[t] = { player:loadBuildingStrip(t,'player'), enemy:loadBuildingStrip(t,'enemy') };
/* ---- Visual faction ----
   Gameplay still treats owner==='player' as the human side everywhere; this
   only flips APPEARANCE. With PLAYER_IS_RED the human renders in red art/colors
   and the AI in blue. Sprite atlases are keyed 'player'(blue)/'enemy'(red), so
   factionKey() returns which set to draw for a given owner. */
const PLAYER_IS_RED = true;
function isRedSide(owner){ const human=owner==='player'; return PLAYER_IS_RED ? human : !human; }
function factionKey(owner){ return isRedSide(owner) ? 'enemy' : 'player'; }

function loadImg(src){ const i=new Image(); i.src=src; return i; }
// returns {img, fw, fh, frames} for an entity's building strip (faction-keyed), or null
function buildingSprite(type,owner){
  const e=BUILDING_ANIM[type]; const a=e&&e[factionKey(owner)];
  return (a&&a.ready) ? { img:a.img, fw:a.fw, fh:a.fh, frames:BUILDING_FRAMES } : null;
}

// Funding resource crystal — optional generated sprite; null until present (then drawGoldmine blits it under the animated glow/shine).
const CRYSTAL_IMG = loadImg(RESOURCE_CRYSTAL);
function crystalSprite(){ return (CRYSTAL_IMG.complete && CRYSTAL_IMG.naturalWidth) ? CRYSTAL_IMG : null; }

/* ---- Unit animations (sliced from green-screen sprite strips) ----
   4-frame walk cycle, uniform 267×267 frames, shared baseline so it doesn't
   jitter. Animation advances by distance travelled (legs match ground speed)
   and the sprite mirrors on horizontal facing. Enemy has no Interns, so the
   player blue worker covers every worker in practice; other unit types and
   any missing sheet fall back to the procedural vector drawing. */
const UNIT_FRAMES = 10;                 // frames per walk/action strip (5×2 grid → 10)
// Load a horizontal N-frame strip (frame i at x=i*fw). New unit art is a uniform
// UNIT_FRAMES-wide strip, so frames are auto-derived as width/UNIT_FRAMES.
function loadWalk(src, fw, fh, frames){
  const a = { img:new Image(), ready:false, fw:fw||0, fh:fh||0, frames:frames||null };
  a.img.onload=()=>{ if(!a.frames){ const n=UNIT_FRAMES; a.fw=a.img.width/n; a.fh=a.img.height;
      a.frames=[]; for(let i=0;i<n;i++) a.frames.push([i*a.fw,0,a.fw,a.fh]); } a.ready=true; };
  a.img.onerror=()=>{ a.ready=false; }; a.img.src=src;
  return a;
}
// a faction pair of auto-derived 10-frame strips for a unit's walk/action sheet
function walkPair(type, act){ return { player:loadWalk(unitSheet(type,act,false)), enemy:loadWalk(unitSheet(type,act,true)) }; }
// per-type walk sets keyed by owner (player cyan / enemy red). Missing/!ready →
// null → procedural vector fallback (shown only until the art loads).
const UNIT_WALK = {
  worker:walkPair('worker','walk'),       soldier:walkPair('soldier','walk'),   ranger:walkPair('ranger','walk'),
  recruiter:walkPair('recruiter','walk'), hustler:walkPair('hustler','walk'),   lobbyist:walkPair('lobbyist','walk'),
  foodtruck:walkPair('foodtruck','walk'), auditor:walkPair('auditor','walk'),   founder:walkPair('founder','walk'),
  courier:walkPair('courier','walk'),     bomber:walkPair('bomber','walk'),
  // Hero-only recolor of the Lobbyist (purple suit / red accents / golden rifle) for Nino —
  // selected via u.spriteType, NOT u.type, so gameplay still treats him as a lobbyist.
  nino:walkPair('nino','walk'),
  // Hero Recruiter "Biba" (Storm-likeness: white vest, silver hair) — visual override only;
  // gameplay stays a recruiter. Bespoke palette written to both faction keys (see slice_biba.py).
  biba:walkPair('biba','walk'),
};
// drawn sprite HEIGHT per type — ~2× the old values (bigger on screen). Collision
// radius r / speed / range in DEF are UNCHANGED, so gameplay is unaffected.
const UNIT_SPRITE_H = { worker:46, soldier:68, ranger:62, recruiter:54, hustler:56, lobbyist:64, foodtruck:64, auditor:72, founder:92, courier:36, bomber:96, biba:60.6 };
// biba:60.6 (not 54): her walk & heal strips share a 341px frame height (see slice_biba.py STRIP_CANVAS_H);
// the engine maps frame-height -> draw-height, so 54*341/304 keeps her on-screen body the size it was
// when the walk strip was 304px tall, while killing the size pop when she switches to the heal anim.
function unitWalk(type,owner){ const e=UNIT_WALK[type]; const a=e&&e[factionKey(owner)]; return (a&&a.ready)?a:null; }
// Drawn-sprite world metrics — shared by the selection ring AND click hit-testing so
// they track the (now big) VISIBLE sprite, not the small collision radius r. The sprite
// is blitted from -0.7*h (top) to +0.3*h (feet) around the unit's (x,y) (see blitFrame),
// raised by `alt` for flyers. footY is the on-the-ground point under the sprite.
// Named campaign heroes (e.g. Nino) render 15% bigger so they stand out from rank-and-file
// units of the same type. spriteType (a visual-only override) falls back to the gameplay type,
// so a hero's drawn height tracks its base unit (Nino → lobbyist) before the hero bump.
const HERO_SCALE = 1.15;
function unitDrawH(u){ const base = (UNIT_SPRITE_H[u.spriteType] || UNIT_SPRITE_H[u.type] || u.r*2);
  return base * (u.hero ? HERO_SCALE : 1); }
function unitHitBox(u){ const h=unitDrawH(u), alt=u.air?16:0, hw=h*0.34;
  return { cx:u.x, hw, top:u.y-alt-h*0.7, bot:u.y-alt+h*0.3, footY:u.y-alt+h*0.3 }; }

// action animations (mine / attack / heal), played in place during the action
const UNIT_ACTION = {
  worker:{ mine:walkPair('worker','mine') },           soldier:{ attack:walkPair('soldier','attack') },
  ranger:{ attack:walkPair('ranger','attack') },       recruiter:{ heal:walkPair('recruiter','heal') },
  hustler:{ attack:walkPair('hustler','attack') },     lobbyist:{ attack:walkPair('lobbyist','attack') },
  foodtruck:{ attack:walkPair('foodtruck','attack') }, auditor:{ attack:walkPair('auditor','attack') },
  founder:{ attack:walkPair('founder','attack') },     courier:{ heal:walkPair('courier','heal') },
  bomber:{ attack:walkPair('bomber','attack') },       nino:{ attack:walkPair('nino','attack') },
  biba:{ heal:walkPair('biba','heal') },               // hero Recruiter — custom heal animation
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
