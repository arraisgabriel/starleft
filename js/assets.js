/* =====================================================================
   ASSET PATHS — single source of truth for every runtime image path.
   All art lives under assets/ (atlas/ terrain/ buildings/ units/<type>/).
   Paths are RELATIVE so the game works under GitHub Pages' /<repo>/ subpath.
   To move/rename art, change ONLY these helpers. (Loaded after config.js.)
   ===================================================================== */
const ASSET_BASE      = 'assets/';
// Sprite sheets ship as WebP (~86% smaller than the PNG masters — the difference between a
// 15s and a 4s loading gate on mobile). Converted by _dev/gen/optimize_assets.py @ q85.
// Floor: WebP needs Safari 14+/iOS 14+; older browsers fall back to procedural art everywhere.
const ATLAS_TILESET   = ASSET_BASE + 'atlas/tileset.webp';
const ATLAS_BUILDINGS = ASSET_BASE + 'atlas/buildings.webp';
const RESOURCE_CRYSTAL = ASSET_BASE + 'resource/crystal.png'; // Funding crystal node (optional; procedural fallback if absent)
// standalone building sheet: name garage|launchpad , faction player|enemy
function buildingSheet(name, faction){ return ASSET_BASE + 'buildings/' + name + '_' + faction + '.webp'; }
// unit sheet: type worker|soldier|... , action walk|mine|attack|heal , enemy bool
function unitSheet(type, action, enemy){ return ASSET_BASE + 'units/' + type + '/' + action + (enemy ? '_enemy' : '') + '.webp'; }
// faction-keyed variant: player → no suffix, enemy → _enemy, ao → _ao (A&O alien recolor;
// see _dev/gen/recolor_ao.py). Keeps unitSheet's boolean signature intact for existing callers.
function unitSheetFac(type, action, faction){ return ASSET_BASE + 'units/' + type + '/' + action + (faction && faction!=='player' ? '_'+faction : '') + '.webp'; }

/* ---- Voice audio (locally TTS-generated; see _dev/gen/ + js/voice.js) ----
   Optional like every other asset: VOICE plays a clip if present and silently no-ops if missing.
   barks keyed by speaker (unit type | heroId); lore by qwen voice; crawls by MAP index. */
const AUDIO_BASE = ASSET_BASE + 'audio/';
const VOICE_BASE = AUDIO_BASE + 'voice/';
const MUSIC_BASE = AUDIO_BASE + 'music/';
function barkPath(speakerKey, idx){ return VOICE_BASE + 'barks/' + speakerKey + '_' + String(idx).padStart(2,'0') + '.mp3'; }
function lorePath(voice, idx){      return VOICE_BASE + 'lore/'  + voice      + '_' + String(idx).padStart(3,'0') + '.mp3'; }
function crawlPath(mapIdx){         return VOICE_BASE + 'crawl/ep_' + String(mapIdx).padStart(2,'0') + '.mp3'; }
function scenePath(id){             return VOICE_BASE + 'scene/' + id + '.mp3'; }   // scripted-cutscene lines (e.g. Nino's Ep VII flash monologue), keyed by an explicit line id
function tutorialPath(id){          return VOICE_BASE + 'tutorial/' + id + '.mp3'; } // Quarter I tutorial coach lines (Rod-clone narrator), keyed by step/contextual id
const SFX_BASE = AUDIO_BASE + 'sfx/';
function sfxPath(name){ return SFX_BASE + name + '.wav'; }                 // combat/UI one-shots + amb_<biome> drones (js/sfx.js / music.js)
const MUSIC_MAIN = MUSIC_BASE + 'cyberpunk-rts-theme-main.mp3';
const MUSIC_MENU_LOOP = MUSIC_BASE + 'cyberpunk-rts-theme-menu-loop.mp3';
const MUSIC_FLASH = MUSIC_BASE + 'gorillaz-the-sad-god.mp3';   // Episode VII "the flash" cinematic cue (bomb drop → hub)

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
LOADER.register(ATLAS_IMG, ATLAS_TILESET, { tag:'atlas:tileset', tier:LOADER.T_CRITICAL, weight:2 });
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

/* ---- Optional FLOOR-VARIANT atlas (floors.webp): N seamless floor variations per biome, hash-picked
   per tile by the renderer (P1.1/P1.2 — kills the single-stamp checkerboard). 7 biome ROWS in biome-id
   order (grass=0 … volcanic=6, so row IS the biome id) × FLOOR_VAR_N variant COLS of FLOOR_VAR_CELL px.
   Optional: if absent, the renderer falls back to the single tileset floor cell, then procedural — same
   resilience contract as the other atlases. Built by _dev/gen/gen_floor_variants.mjs (Gemini 3 Pro Image)
   + _dev/gen/slice_floor_variants.py. Tagged atlas:* so a late load re-bakes the terrain chunk cache. ---- */
const ATLAS_FLOORS = ASSET_BASE + 'atlas/floors.webp';
const FLOOR_VAR_IMG = new Image();
let FLOOR_VAR_READY = false;
FLOOR_VAR_IMG.onload = ()=>{ FLOOR_VAR_READY = true; };
FLOOR_VAR_IMG.onerror = ()=>{ FLOOR_VAR_READY = false; };
LOADER.register(FLOOR_VAR_IMG, ATLAS_FLOORS, { tag:'atlas:floors', tier:LOADER.T_GAMEPLAY, weight:1, optional:true });
const FLOOR_VAR_CELL = 128, FLOOR_VAR_N = 4;
function floorVarRect(biome, idx){
  if(!FLOOR_VAR_READY) return null;
  if(biome<0 || biome>6) return null;                       // 7 rows, biome-id order
  const c = ((idx%FLOOR_VAR_N)+FLOOR_VAR_N)%FLOOR_VAR_N;
  return [c*FLOOR_VAR_CELL, biome*FLOOR_VAR_CELL, FLOOR_VAR_CELL, FLOOR_VAR_CELL];
}

/* ---- Topography FEATURE atlas (transparent cut-out rock/tree for the 3x3 walk-under
   features, cut from the originals by _dev/gen/slice_features.py). 2 cols (rock,tree) ×
   7 biome rows (ATLAS_BIOMES order) of FEAT_CELL px. Optional: drawFeatureSprite falls
   back to the opaque tileset cell, then procedural, if this PNG is missing. ---- */
const ATLAS_FEATURES = ASSET_BASE + 'atlas/features.webp';
const FEAT_IMG = new Image();
let FEAT_READY = false;
FEAT_IMG.onload = ()=>{ FEAT_READY = true; };
FEAT_IMG.onerror = ()=>{ FEAT_READY = false; };
LOADER.register(FEAT_IMG, ATLAS_FEATURES, { tag:'atlas:features', tier:LOADER.T_CRITICAL, weight:2, optional:true });
const FEAT_CELL = 256;
const FEAT_COL = { rock:0, tree:1 };
const FEAT_ROW = {}; ATLAS_BIOMES.forEach((b,i)=>{ FEAT_ROW[b]=i; });
function featSpriteFor(biome, slot){
  if(!FEAT_READY) return null;
  const c = FEAT_COL[slot], r = FEAT_ROW[biome];
  if(c==null || r==null) return null;
  return [c*FEAT_CELL, r*FEAT_CELL, FEAT_CELL, FEAT_CELL];
}

/* ---- Optional FEATURE-VARIANT atlas (features_var.webp): FEAT_VAR_N distinct rock + tree SHAPES per biome,
   hash-picked per feature so a biome isn't one cloned rock (P7.4 — the "lifeless" fix). 7 biome ROWS
   (biome-id order) × (FEAT_VAR_N rock + FEAT_VAR_N tree) COLS of FEAT_VAR_CELL px. Optional: drawFeatureSprite
   falls back to the single features.webp cell, then procedural, if absent. Built by
   _dev/gen/gen_feature_variants.mjs (Gemini 3 Pro Image) + slice_feature_variants.py. ---- */
const ATLAS_FEAT_VAR = ASSET_BASE + 'atlas/features_var.webp';
const FEAT_VAR_IMG = new Image();
let FEAT_VAR_READY = false;
FEAT_VAR_IMG.onload = ()=>{ FEAT_VAR_READY = true; buildMtnTrim(); };
FEAT_VAR_IMG.onerror = ()=>{ FEAT_VAR_READY = false; };
LOADER.register(FEAT_VAR_IMG, ATLAS_FEAT_VAR, { tag:'atlas:feature-variant', tier:LOADER.T_GAMEPLAY, weight:2, optional:true });
const FEAT_VAR_CELL = 256, FEAT_VAR_ROCK_N = 8, FEAT_VAR_TREE_N = 16;   // cols: [0..7] rocks, [8..23] trees
// ---- Mountain-CHAIN trim cache: the content bbox of each of the 8 MOUNTAIN rock cells (atlas row 1), so the
// mountain-chain render (js/render.js) bottom-anchors sprites on their true base (like mountain-cluster-lab).
// Computed ONCE on atlas load; falls back to fractions measured over http when getImageData is tainted (file://). ----
let MTN_TRIM = null;     // [8] of {x,y,w,h} src rects in features_var.webp px, or null until built
const MTN_TRIM_FALLBACK = [   // content box as a fraction of the 256 cell (measured): 0 spire..7 boulder
  {x:0.219,y:0.039,w:0.563,h:0.922}, {x:0.039,y:0.137,w:0.922,h:0.727}, {x:0.039,y:0.186,w:0.922,h:0.629},
  {x:0.203,y:0.039,w:0.594,h:0.922}, {x:0.039,y:0.301,w:0.922,h:0.398}, {x:0.039,y:0.086,w:0.922,h:0.828},
  {x:0.156,y:0.039,w:0.688,h:0.922}, {x:0.041,y:0.133,w:0.918,h:0.734}
];
function buildMtnTrim(){
  if(!FEAT_VAR_READY || typeof FEAT_ROW==='undefined' || FEAT_ROW[B_MOUNTAIN]==null || typeof _opaqueBounds!=='function') return;
  const C=FEAT_VAR_CELL, y0=FEAT_ROW[B_MOUNTAIN]*C, out=[];
  for(let c=0;c<FEAT_VAR_ROCK_N;c++){
    const b=_opaqueBounds(FEAT_VAR_IMG, c*C, C, C, 0, y0);
    if(b) out.push({x:c*C+b.x, y:y0+b.y, w:b.w, h:b.h});
    else { const f=MTN_TRIM_FALLBACK[c]; out.push({x:c*C+Math.round(f.x*C), y:y0+Math.round(f.y*C), w:Math.round(f.w*C), h:Math.round(f.h*C)}); }
  }
  MTN_TRIM=out;
}
// Tree-variant convention (used by clusterTopoFeatures' alive/dead grove split): within the 16 tree
// indices, [0..7] = the biome's OWN trees, [8..15] = shared DEAD trees (mixing biomes grass/mountain/
// tech/desert; other biomes just cycle their own into 8..15). Lets a clump stay all-alive or all-dead.
const FEAT_VAR_TREE_OWN = 8;
// Biomes whose tree indices 8..15 are the SHARED DEAD pool (per slice_feature_variants.py TREE_SOURCES).
// Used by clusterTopoFeatures to gate the alive/dead split + dead-stump "soloist" handling to ONLY these
// biomes — water/ice/volcanic cycle their own (alive) trees into 8..15, so they must be left alone.
const FEAT_VAR_DEAD_BIOMES = [B_GRASS, B_MOUNTAIN, B_TECH, B_DESERT];
function featVarN(slot){ return slot==='tree' ? FEAT_VAR_TREE_N : FEAT_VAR_ROCK_N; }
function featVarRect(biome, slot, idx){
  if(!FEAT_VAR_READY) return null;
  const r = FEAT_ROW[biome]; if(r==null) return null;
  const n = featVarN(slot), base = slot==='tree' ? FEAT_VAR_ROCK_N : 0;
  const c = base + (((idx%n)+n)%n);
  return [c*FEAT_VAR_CELL, r*FEAT_VAR_CELL, FEAT_VAR_CELL, FEAT_VAR_CELL];
}

/* ---- Optional painted DECAL atlas (decals.webp, P7.3): DECAL_N ground decals per biome (debris/cracks/
   scorch/biome-detail), baked at scatter points by render.js bakeDecals() when present, else the procedural
   decals. 7 biome ROWS (biome-id order) × DECAL_N COLS of DECAL_CELL px. Built by gen_decals.mjs + slice_decals.py. ---- */
const ATLAS_DECALS = ASSET_BASE + 'atlas/decals.webp';
const DECAL_IMG = new Image();
let DECAL_READY = false;
DECAL_IMG.onload = ()=>{ DECAL_READY = true; };
DECAL_IMG.onerror = ()=>{ DECAL_READY = false; };
LOADER.register(DECAL_IMG, ATLAS_DECALS, { tag:'atlas:decals', tier:LOADER.T_AMBIENT, weight:1, optional:true });
const DECAL_CELL = 128, DECAL_N = 24;   // 4 sets of 6 painted decals per biome
function decalRect(biome, idx){
  if(!DECAL_READY) return null;
  const r = FEAT_ROW[biome]; if(r==null) return null;
  const c = ((idx%DECAL_N)+DECAL_N)%DECAL_N;
  return [c*DECAL_CELL, r*DECAL_CELL, DECAL_CELL, DECAL_CELL];
}

/* ---- Optional WATER / MAGMA atlas (seamless tiles, dark Hades palette) — a DROP-IN upgrade
   over the procedural water.js renderer. If assets/atlas/water.png is absent, WATER_READY stays
   false and water.js renders procedurally (same resilience contract as the tileset/features atlas).
   Could be generated with the Gemini image-pro API. Layout: WATER_CELL px cells, 7 biome rows
   (ATLAS_BIOMES order). Columns by slot: depth 0..2 (shore->mid->deep), caustic 3.. (flow frames),
   molten 11.. (lava-crack frames). water.js calls waterSpriteFor(biome,'depth',depthCell). ---- */
const ATLAS_WATER = ASSET_BASE + 'atlas/water.webp';
const WATER_IMG = new Image();
let WATER_READY = false;
WATER_IMG.onload = ()=>{ WATER_READY = true; };
WATER_IMG.onerror = ()=>{ WATER_READY = false; };
LOADER.register(WATER_IMG, ATLAS_WATER, { tag:'atlas:water', tier:LOADER.T_CRITICAL, weight:2, optional:true });
const WATER_CELL = 128;
const WATER_SLOT_COL = { depth:0, caustic:3, molten:11 };       // base column per slot
const WATER_ROW = {}; ATLAS_BIOMES.forEach((b,i)=>{ WATER_ROW[b]=i; });
function waterSpriteFor(biome, slot, frame){
  if(!WATER_READY) return null;
  const base = WATER_SLOT_COL[slot], r = WATER_ROW[biome];
  if(base==null || r==null) return null;
  return [(base+(frame||0))*WATER_CELL, r*WATER_CELL, WATER_CELL, WATER_CELL];
}

/* ---- Optional INTERIOR atlases (docs/interior-tilesets.md E3) — the four authored interior themes
   (Dark Tower / Spacecraft / Clinic / Industrial) as autotiled floors, blob-47 walls+caps, props,
   decals, setpieces and emissive stamps. Same resilience contract as every terrain atlas: all
   optional:true, INTERIOR_*_READY stays false when a webp is missing and the renderer falls back to
   procedural flat-dark interiors. Built by _dev/gen/gen_interiors.mjs + slice_interiors.py; the
   Python slicer's grid consts MUST mirror the layout consts below (see its emitted manifest).
   Theme ids are rows: */
const INT_THEME = { tower:0, ship:1, clinic:2, industrial:3 };
const INTERIOR_THEME_N = 4;
function _intAtlas(file, tag){
  const img = new Image(); const st = { img, ready:false };
  img.onload = ()=>{ st.ready = true; };
  img.onerror = ()=>{ st.ready = false; };
  LOADER.register(img, ASSET_BASE + 'atlas/' + file, { tag:'atlas:'+tag, tier:LOADER.T_GAMEPLAY, weight:2, optional:true });
  return st;
}
const INTERIOR_SURF_ATL     = _intAtlas('interior_surface.webp',  'interior-surface');
const INTERIOR_WALL_ATL     = _intAtlas('interior_wall.webp',     'interior-wall');
const INTERIOR_PROP_ATL     = _intAtlas('interior_prop.webp',     'interior-prop');
const INTERIOR_DECAL_ATL    = _intAtlas('interior_decal.webp',    'interior-decal');
const INTERIOR_SETPIECE_ATL = _intAtlas('interior_setpiece.webp', 'interior-setpiece');
const INTERIOR_EMISSIVE_ATL = _intAtlas('interior_emissive.webp', 'interior-emissive');
const INTERIOR_SURF_IMG = INTERIOR_SURF_ATL.img, INTERIOR_WALL_IMG = INTERIOR_WALL_ATL.img,
      INTERIOR_PROP_IMG = INTERIOR_PROP_ATL.img, INTERIOR_DECAL_IMG = INTERIOR_DECAL_ATL.img,
      INTERIOR_SETPIECE_IMG = INTERIOR_SETPIECE_ATL.img, INTERIOR_EMISSIVE_IMG = INTERIOR_EMISSIVE_ATL.img;
// Layout. SURFACE (the revamp's core): a 4×4 grid of 1024² MACRO material regions — surface id
// s = theme*4 + kind (0 floorA, 1 floorB, 2 wallface, 3 wallcap), col s%4 row s>>2. The renderer
// samples a 64px SUB-RECT per tile anchored to WORLD coords (tx%16, ty%16), so the texture's large
// panel structure spans 16×16 tiles (period 512 world px) instead of being crushed into every tile
// — pure function of coords → co-op/save/chunk-bake identical. wall: rows theme*2+{0 face,1 cap},
// col = blob-47 index in AUTOTILE.WALL_TILES order — cells are TRIM OVERLAYS on transparent (foot
// AO / rims / accent seams); the material underneath is the world-anchored wallface/wallcap surface.
// prop: row = theme; cols 0..7 props, 8..11 overhangs. decal: row = theme, 8 cols of 256 (drawn
// 2.5–4 tiles wide by bakeDecals). setpiece: row = theme, 4 large cols. emissive: optional polish.
const INTERIOR_CELL = 256, INTERIOR_TILE_CELL = 128, INTERIOR_SETPIECE_CELL = 512, INTERIOR_DECAL_CELL = 256, INTERIOR_EMISSIVE_CELL = 128;
const INTERIOR_SURF_CELL = 1024, INTERIOR_SURF_PERIOD = 16, INTERIOR_SURF_SRC = INTERIOR_SURF_CELL/INTERIOR_SURF_PERIOD;   // 64px of source per tile
const INTERIOR_PROP_N = 8, INTERIOR_OVERHANG_BASE = 8, INTERIOR_OVERHANG_N = 4,
      INTERIOR_DECAL_N = 8, INTERIOR_SETPIECE_N = 4, INTERIOR_EMISSIVE_N = 8;
function interiorWallCols(){ return (typeof AUTOTILE!=='undefined') ? AUTOTILE.WALL_N : 47; }
// World-anchored 64px sub-rect of a surface region for tile (tx,ty). kind: 0 floorA, 1 floorB,
// 2 wallface, 3 wallcap. THE anti-patchwork primitive — no variants, no rotation, just the texture.
function interiorSurfRect(theme, kind, tx, ty){
  if(!INTERIOR_SURF_ATL.ready) return null;
  const s = theme*4 + kind, P = INTERIOR_SURF_PERIOD, S = INTERIOR_SURF_SRC;
  const cx = ((tx%P)+P)%P, cy = ((ty%P)+P)%P;
  return [(s%4)*INTERIOR_SURF_CELL + cx*S, (s>>2)*INTERIOR_SURF_CELL + cy*S, S, S];
}
function interiorWallRect(theme, idx, cap){    // idx = blob-47 index; cap truthy → cap row (TRIM overlay cell)
  if(!INTERIOR_WALL_ATL.ready) return null;
  const n = interiorWallCols(), c = ((idx%n)+n)%n, r = theme*2 + (cap?1:0);
  return [c*INTERIOR_TILE_CELL, r*INTERIOR_TILE_CELL, INTERIOR_TILE_CELL, INTERIOR_TILE_CELL];
}
function interiorPropRect(theme, idx){         // idx 0..9 props, 10..15 overhangs
  if(!INTERIOR_PROP_ATL.ready) return null;
  return [(idx|0)*INTERIOR_CELL, theme*INTERIOR_CELL, INTERIOR_CELL, INTERIOR_CELL];
}
function interiorDecalRect(theme, idx){
  if(!INTERIOR_DECAL_ATL.ready) return null;
  const c = ((idx%INTERIOR_DECAL_N)+INTERIOR_DECAL_N)%INTERIOR_DECAL_N;
  return [c*INTERIOR_DECAL_CELL, theme*INTERIOR_DECAL_CELL, INTERIOR_DECAL_CELL, INTERIOR_DECAL_CELL];
}
function interiorSetpieceRect(theme, idx){
  if(!INTERIOR_SETPIECE_ATL.ready) return null;
  const c = ((idx%INTERIOR_SETPIECE_N)+INTERIOR_SETPIECE_N)%INTERIOR_SETPIECE_N;
  return [c*INTERIOR_SETPIECE_CELL, theme*INTERIOR_SETPIECE_CELL, INTERIOR_SETPIECE_CELL, INTERIOR_SETPIECE_CELL];
}
function interiorEmissiveRect(theme, idx){
  if(!INTERIOR_EMISSIVE_ATL.ready) return null;
  const c = ((idx%INTERIOR_EMISSIVE_N)+INTERIOR_EMISSIVE_N)%INTERIOR_EMISSIVE_N;
  return [c*INTERIOR_EMISSIVE_CELL, theme*INTERIOR_EMISSIVE_CELL, INTERIOR_EMISSIVE_CELL, INTERIOR_EMISSIVE_CELL];
}

/* ---- Building sprites (dark cyberpunk-Hades, animated like the mega-sprites) ----
   Every building is a 9-frame strip (player cyan / enemy red), bottom-anchored and
   blitted aspect-preserved so it "stands" on its footprint and overhangs upward;
   only the neon flickers (the structure is frozen). One transparent PNG per faction:
   assets/buildings/<type>_<player|enemy>.png. (Mirrors loadWalk / loadMega.) */
const BUILDING_FRAMES = 9;
const BUILDING_FPS = 0.9;               // slow ambient neon-flicker playback
const BUILDING_DRAW_SCALE = 2.5;        // all building sprites drawn this much bigger (footprint unchanged)
const BUILDING_TYPE_SCALE = { hq:0.65, intel:0.25, darktower:1.05, turret:1.2 };   // per-type tweak on top of BUILDING_DRAW_SCALE (HQ reads too big at full 2.5×; intel is a needle-thin mast; darktower is the towering A&O landmark ~3× the HQ; turret 1.2 on its now-1×1 footprint → drawn ~60% of the old 2×2 size)
// Per-type vertical stretch of the drawn sprite (footprint unchanged). darktower stays 1.0 — its 9:16 art already carries the height; stretching would distort it.
const BUILDING_TALL = { hq:1.5625, darktower:1.0 };
function buildingDrawScale(type){ return BUILDING_DRAW_SCALE*(BUILDING_TYPE_SCALE[type]||1); }
// Per-type frame-count override: most buildings are 9-frame neon-flicker strips, but the Training
// Grounds is ONE static high-res still (no animation) — see _dev/gen/gen_training.mjs.
const BUILDING_FRAME_COUNT = { training:1, darktower:1 };   // darktower is a single static still (NOT a 9-frame neon strip)
const BUILDING_TYPES = ['hq','barracks','turret','garage','launchpad','outpost','training','darktower'];
// strips that intentionally don't ship (no art was ever made) — registered optional so the
// loader doesn't burn its full retry ladder on guaranteed 404s every cold session.
// darktower ships ONLY the _ao (black+toxic-green) variant; player/enemy are never requested
// (the renderer forces the 'ao' strip for it regardless of owner — see drawBuilding).
const BUILDING_NO_ART = { training:{ player:1, ao:1 }, darktower:{ player:1, enemy:1 } };
function loadBuildingStrip(type, faction){
  const a = { img:new Image(), ready:false, fw:0, fh:0 };
  const nf = BUILDING_FRAME_COUNT[type] || BUILDING_FRAMES;
  a.img.onload  = ()=>{ a.fw = a.img.naturalWidth/nf; a.fh = a.img.naturalHeight; a.ready = true; };
  a.img.onerror = ()=>{ a.ready=false; };
  const noArt = !!(BUILDING_NO_ART[type] && BUILDING_NO_ART[type][faction]);
  // darktower's _ao strip is its ONLY art and a hero landmark, so load it in the gameplay tier (not
  // ambient) — but keep it optional so a not-yet-generated file never blocks the loading gate.
  const aoLandmark = (type==='darktower' && faction==='ao');
  LOADER.register(a.img, buildingSheet(type, faction),
    { tag:'bld:'+type+':'+faction, tier:(faction==='ao' && !aoLandmark)?LOADER.T_AMBIENT:LOADER.T_GAMEPLAY, weight:3, optional:faction==='ao'||noArt });
  return a;
}
const BUILDING_ANIM = {};
// 'ao' = A&O alien faction (black + toxic-green recolor; optional, falls back to the keyed
// faction set when the _ao strip is absent — see buildingSprite + _dev/gen/recolor_ao.py).
for(const t of BUILDING_TYPES) BUILDING_ANIM[t] = { player:loadBuildingStrip(t,'player'), enemy:loadBuildingStrip(t,'enemy'), ao:loadBuildingStrip(t,'ao') };

/* ---- Market Research tower ('intel'): composited at runtime, no art file ----
   One very tall radar mast = the HQ strip squashed to 20% width / stretched to 2× height
   (the shaft) with the Legal Team turret strip stacked on top at matching width (the head).
   Baked lazily per faction onto an offscreen canvas strip once both source strips load;
   stored ONLY in BUILDING_ANIM (never on entities — canvas refs on entities corrupt saves).
   Until the bake is possible, buildingSprite returns null → procedural fallback box. */
// INTEL_W: mast width as a fraction of the HQ art's OPAQUE width. INTEL_TALLX: the finished
// mast's on-screen height as a multiple of the HQ's on-screen height (hand-tuned).
// Source frames carry large transparent padding, so both are cropped to their opaque pixel
// bounds before composing — otherwise the stretched padding leaves the head floating in a gap.
const INTEL_W = 0.20, INTEL_TALLX = 1.0, INTEL_HEAD_SINK = 0.25;
BUILDING_ANIM.intel = { player:{ready:false}, enemy:{ready:false}, ao:{ready:false} };
// Opaque bounding box of one strip frame (alpha>8, +2px margin clamped to the frame).
// minWFrac (optional): push the TOP edge down to the first row whose opaque span is at least
// that fraction of the full width — skips thin rooftop antennas that would stretch into a
// disconnected hairline when the art is scaled to an extreme aspect.
function _opaqueBounds(img, sx, sw, sh, minWFrac, sy=0){
  const c=document.createElement('canvas'); c.width=sw; c.height=sh;
  const g=c.getContext('2d'); g.drawImage(img, sx,sy,sw,sh, 0,0,sw,sh);
  let d; try{ d=g.getImageData(0,0,sw,sh).data; }catch(_){ return null; }
  let x0=sw,y0=sh,x1=-1,y1=-1;
  const rowW=new Array(sh).fill(0);
  for(let y=0;y<sh;y++){ let rx0=sw,rx1=-1;
    for(let x=0;x<sw;x++){ if(d[(y*sw+x)*4+3]>8){ if(x<rx0)rx0=x; if(x>rx1)rx1=x; } }
    if(rx1>=0){ rowW[y]=rx1-rx0+1; if(rx0<x0)x0=rx0; if(rx1>x1)x1=rx1; if(y<y0)y0=y; if(y>y1)y1=y; }
  }
  if(x1<0) return null;
  if(minWFrac){ const need=(x1-x0+1)*minWFrac; for(let y=y0;y<=y1;y++){ if(rowW[y]>=need){ y0=y; break; } } }
  x0=Math.max(0,x0-2); y0=Math.max(0,y0-2); x1=Math.min(sw-1,x1+2); y1=Math.min(sh-1,y1+2);
  return { x:x0, y:y0, w:x1-x0+1, h:y1-y0+1 };
}
// Crop fractions measured from the shipped player art (enemy/_ao are recolors of the same
// geometry). Used when canvas pixel reads are unavailable — file:// taints the canvas, so
// getImageData throws and _opaqueBounds returns null. Without this the mast never bakes there.
const INTEL_CROP_FALLBACK = { hq:{x:0, y:0.129, w:1, h:0.871}, turret:{x:0, y:0, w:1, h:1} };
function _fracBox(a, f){ return { x:Math.round(f.x*a.fw), y:Math.round(f.y*a.fh), w:Math.round(f.w*a.fw), h:Math.round(f.h*a.fh) }; }
function bakeIntelStrip(faction){
  const hq=BUILDING_ANIM.hq[faction], tur=BUILDING_ANIM.turret[faction];
  if(!hq||!hq.ready||!tur||!tur.ready) return null;
  const hqB=_opaqueBounds(hq.img, 0, hq.fw, hq.fh, 0.5) || _fracBox(hq, INTEL_CROP_FALLBACK.hq);
  const tuB=_opaqueBounds(tur.img, 0, tur.fw, tur.fh)   || _fracBox(tur, INTEL_CROP_FALLBACK.turret);
  const fw=Math.max(2, Math.round(hqB.w*INTEL_W));
  const headH=Math.max(2, Math.round(tuB.h*(fw/tuB.w)));
  const sink=Math.round(headH*INTEL_HEAD_SINK);
  // canvas aspect chosen so the DRAWN mast = INTEL_TALLX × the HQ's drawn height (buildingDrawBox math)
  const hqDh = DEF.hq.w*TILE*1.08*buildingDrawScale('hq')*(hq.fh/hq.fw)*(BUILDING_TALL.hq||1);
  const dw   = DEF.intel.w*TILE*1.08*buildingDrawScale('intel');
  const fh   = Math.max(headH+4, Math.round(fw*(INTEL_TALLX*hqDh)/dw));
  const cv=document.createElement('canvas'); cv.width=fw*BUILDING_FRAMES; cv.height=fh;
  const c=cv.getContext('2d');
  for(let i=0;i<BUILDING_FRAMES;i++){
    c.drawImage(hq.img,  i*hq.fw+hqB.x, hqB.y, hqB.w, hqB.h,  i*fw, headH-sink, fw, fh-(headH-sink));  // shaft (cropped art, fills to the ground)
    c.drawImage(tur.img, i*tur.fw+tuB.x, tuB.y, tuB.w, tuB.h, i*fw, 0,          fw, headH);            // head in front, sunk into the shaft top
  }
  return { img:cv, ready:true, fw, fh };
}
function ensureIntelAnim(){
  for(const f of ['player','enemy','ao'])
    if(!BUILDING_ANIM.intel[f].ready){ const b=bakeIntelStrip(f); if(b) BUILDING_ANIM.intel[f]=b; }
}
/* ---- Visual faction ----
   Gameplay still treats owner==='player' as the human side everywhere; this
   only flips APPEARANCE. With PLAYER_IS_RED the human renders in red art/colors
   and the AI in blue. Sprite atlases are keyed 'player'(blue)/'enemy'(red), so
   factionKey() returns which set to draw for a given owner. */
const PLAYER_IS_RED = true;
function isRedSide(owner){ const human=owner==='player'; return PLAYER_IS_RED ? human : !human; }
function factionKey(owner){ return isRedSide(owner) ? 'enemy' : 'player'; }

function loadImg(src, opts){ return LOADER.image(src, opts || { tag:'misc:'+src, tier:LOADER.T_GAMEPLAY, optional:true }); }
// returns {img, fw, fh, frames} for an entity's building strip (faction-keyed), or null.
// faction overrides the owner-derived set (e.g. 'ao' for A&O enemies) but gracefully falls
// back to the factionKey(owner) set when that strip is missing/not-ready.
function buildingSprite(type,owner,faction){
  if(type==='intel') ensureIntelAnim();   // lazy composite bake (no-op once all factions baked)
  const e=BUILDING_ANIM[type]; if(!e) return null;
  const a=(faction && e[faction] && e[faction].ready) ? e[faction] : e[factionKey(owner)];
  return (a&&a.ready) ? { img:a.img, fw:a.fw, fh:a.fh, frames:(BUILDING_FRAME_COUNT[type]||BUILDING_FRAMES) } : null;
}

// Funding resource crystal — optional generated sprite; null until present (then drawGoldmine blits it under the animated glow/shine).
const CRYSTAL_IMG = loadImg(RESOURCE_CRYSTAL, { tag:'res:crystal', tier:LOADER.T_CRITICAL, weight:1, optional:true });
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
function loadWalk(src, fw, fh, frames, meta){
  const a = { img:new Image(), ready:false, fw:fw||0, fh:fh||0, frames:frames||null };
  a.img.onload=()=>{ if(!a.frames){ const n=UNIT_FRAMES; a.fw=a.img.width/n; a.fh=a.img.height;
      a.frames=[]; for(let i=0;i<n;i++) a.frames.push([i*a.fw,0,a.fw,a.fh]); } a.ready=true; };
  a.img.onerror=()=>{ a.ready=false; };
  LOADER.register(a.img, src, meta || { tag:'unit:'+src, tier:LOADER.T_GAMEPLAY, weight:4 });
  return a;
}
// a faction set of auto-derived 10-frame strips for a unit's walk/action sheet. 'ao' is the
// optional A&O alien recolor (black + toxic green); absent _ao files just stay !ready and the
// lookups fall back to the owner-keyed set (see unitWalk/actionAnim + _dev/gen/recolor_ao.py).
function walkPair(type, act){
  const meta = (fac)=>({ tag:'unit:'+type+':'+act+':'+fac, weight:4,
    // walk strips are the frame-one look of every unit → gameplay tier; action strips play
    // seconds later and the _ao recolors are optional → ambient tier, single retry.
    tier:(act==='walk' && fac!=='ao') ? LOADER.T_GAMEPLAY : LOADER.T_AMBIENT,
    optional:fac==='ao' });
  return { player:loadWalk(unitSheet(type,act,false),0,0,null,meta('player')),
           enemy: loadWalk(unitSheet(type,act,true), 0,0,null,meta('enemy')),
           ao:    loadWalk(unitSheetFac(type,act,'ao'),0,0,null,meta('ao')) };
}
// Phase-2 NPC wardrobe part strips (assets/units/npc_parts/, canonical 176×320 frames,
// band-only painted; manifest in js/npc_parts_data.js → NPCMIX.registerPartLib). Civilians
// are hub-only cosmetics: ambient tier + optional, so absent part files can never wedge
// the loading gate — NPCMIX.partLibState() reports 'broken' and the wardrobe falls back
// to Phase-1 unit-band mixes. Unlike loadWalk, `broken` is tracked so the consumer can
// tell "still streaming" (re-queue) from "will never arrive" (fall back).
function loadNpcPart(src, fw, fh){
  const a = { img:new Image(), ready:false, broken:false, fw, fh, frames:null };
  a.img.onload=()=>{ a.frames=[]; for(let i=0;i<UNIT_FRAMES;i++) a.frames.push([i*fw,0,fw,fh]); a.ready=true; };
  a.img.onerror=()=>{ a.ready=false; a.broken=true; };
  LOADER.register(a.img, src, { tag:'npcpart:'+src, tier:LOADER.T_AMBIENT, weight:1, optional:true });
  return a;
}
// per-type walk sets keyed by owner (player cyan / enemy red). Missing/!ready →
// null → procedural vector fallback (shown only until the art loads).
const UNIT_WALK = {
  worker:walkPair('worker','walk'),       soldier:walkPair('soldier','walk'),   ranger:walkPair('ranger','walk'),
  recruiter:walkPair('recruiter','walk'), hustler:walkPair('hustler','walk'),   lobbyist:walkPair('lobbyist','walk'),
  psychologist:walkPair('psychologist','walk'),   // white recolor of the recruiter art (Mindfulness Facilitator)
  foodtruck:walkPair('foodtruck','walk'), auditor:walkPair('auditor','walk'),   founder:walkPair('founder','walk'),
  courier:walkPair('courier','walk'),     bomber:walkPair('bomber','walk'),
  // Hero-only recolor of the Lobbyist (purple suit / red accents / golden rifle) for Nino —
  // selected via u.spriteType, NOT u.type, so gameplay still treats him as a lobbyist.
  nino:walkPair('nino','walk'),
  // Hero Recruiter "Biba" (Storm-likeness: white vest, silver hair) — visual override only;
  // gameplay stays a recruiter. Bespoke palette written to both faction keys (see slice_biba.py).
  biba:walkPair('biba','walk'),
  // Hero Founder Mech "Pedro Rust" (foundry-orange scorched-steel exosuit) — visual override only;
  // gameplay stays a founder. Bespoke palette written to both faction keys (see slice_rust.py).
  rust:walkPair('rust','walk'),
  // Hero Intern "Zeca" (teal-trim tank + chest harness, backwards cap, teal mining tool) — visual
  // override only; gameplay stays a worker. Bespoke teal palette on both faction keys (slice_zeca.py).
  zeca:walkPair('zeca','walk'),
  // VILLAIN BOSSES — bespoke sprites (visual-only via u.spriteType; gameplay stays soldier/founder).
  ninja:walkPair('ninja','walk'),         rex:walkPair('rex','walk'),
  ex_terminator:walkPair('ex_terminator','walk'),   // recurring nemesis boss (native sheet only — never recolored)
};
// drawn sprite HEIGHT per type — ~2× the old values (bigger on screen). Collision
// radius r / speed / range in DEF are UNCHANGED, so gameplay is unaffected.
const UNIT_SPRITE_H = { worker:46, soldier:68, ranger:62, recruiter:54, psychologist:54, hustler:56, lobbyist:64, foodtruck:64, auditor:72, founder:92, courier:36, bomber:153.6, biba:60.6, rust:92, zeca:69.7, ninja:44, rex:92, ex_terminator:60 };
// zeca:69.7 — slice_zeca.py body-normalises walk+mine into ONE 509px frame whose top ~21% is transparent
// headroom for the raised mining tool (same idea as ex_terminator's 0.76-body frame); his body fills
// ~0.786 of it. Intern-equiv would be 58.1 (= 46/0.786), but per owner this is bumped +20% → 69.7 so he
// reads bigger on screen (then the hero ×1.15 makes drawH ≈ 80). Whole character scales uniformly.
// ex_terminator:60 → fight 1 (×bossScale 2.0) draws a body ≈ the FOUNDER MECH's (~91px on screen), and fight 2
// (×3.2) a bigger ~146px. The uniform 159px-tall frame is only 0.76 body (the rest is transparent headroom for the
// extended gun/leg), so 60 — not 92 — lands the on-screen body at founder size. One frame box shared by walk + all
// 3 attack strips (pack_exterminator.py), so the body never size-pops between locomotion and the attacks.
// rust:92 matches the Founder Mech (he IS a founder chassis); his walk & attack strips share one 308px
// frame height (slice_rust.py pad_top_to) so the crouched slam doesn't size-pop against the walk.
// ninja:44 → ×bossScale 2.1 ≈ 92px drawn, the same on-screen size as a Founder Mech (visual only; bossScale/collision r unchanged).
// rex:92 → ×bossScale 4.0 keeps REX huge.
// biba:60.6 (not 54): her walk & heal strips share a 341px frame height (see slice_biba.py STRIP_CANVAS_H);
// the engine maps frame-height -> draw-height, so 54*341/304 keeps her on-screen body the size it was
// when the walk strip was 304px tall, while killing the size pop when she switches to the heal anim.
// faction overrides the owner-derived set ('ao' for A&O enemies), else falls back to it.
function unitWalk(type,owner,faction){ const e=UNIT_WALK[type]; if(!e) return null;
  const a=(faction && e[faction] && e[faction].ready) ? e[faction] : e[factionKey(owner)]; return (a&&a.ready)?a:null; }
// Drawn-sprite world metrics — shared by the selection ring AND click hit-testing so
// they track the (now big) VISIBLE sprite, not the small collision radius r. The sprite
// is blitted from -0.7*h (top) to +0.3*h (feet) around the unit's (x,y) (see blitFrame),
// raised by `alt` for flyers. footY is the on-the-ground point under the sprite.
// Named campaign heroes (e.g. Nino) render 15% bigger so they stand out from rank-and-file
// units of the same type. spriteType (a visual-only override) falls back to the gameplay type,
// so a hero's drawn height tracks its base unit (Nino → lobbyist) before the hero bump.
const HERO_SCALE = 1.15;
function unitDrawH(u){ const base = (UNIT_SPRITE_H[u.spriteType] || UNIT_SPRITE_H[u.type] || u.r*2);
  return base * (u.hero ? HERO_SCALE : 1) * (u.bossScale || 1); }   // villains draw 2×–5× bigger (HUD/ring/glow are vh-relative → all scale together)
function unitHitBox(u){ const h=unitDrawH(u), alt=u.air?16:0;
  let hw=h*0.34;   // normal units: tight to the character inside its padded frame
  if(u.villain){   // BOSSES draw 2×–5× big with a wide glow — make the WHOLE drawn sprite clickable, not a
    // tiny spot. Match blitFrame's box exactly (dw = S*fw/fh, centered) + a small grab margin for the glow.
    const anim = (typeof unitWalk==='function') ? unitWalk(u.spriteType||u.type, u.owner) : null;
    const ar = (anim && anim.fh) ? (anim.fw/anim.fh) : 1;
    hw = Math.max(h*0.34, h*0.5*ar*1.08);
  }
  return { cx:u.x, hw, top:u.y-alt-h*0.7, bot:u.y-alt+h*0.3, footY:u.y-alt+h*0.3 }; }

// action animations (mine / attack / heal), played in place during the action
const UNIT_ACTION = {
  worker:{ mine:walkPair('worker','mine') },           soldier:{ attack:walkPair('soldier','attack') },
  ranger:{ attack:walkPair('ranger','attack') },       recruiter:{ heal:walkPair('recruiter','heal') },
  psychologist:{ heal:walkPair('psychologist','heal') },   // reuse the recruiter heal pose for the calming channel
  hustler:{ attack:walkPair('hustler','attack') },     lobbyist:{ attack:walkPair('lobbyist','attack') },
  foodtruck:{ attack:walkPair('foodtruck','attack') }, auditor:{ attack:walkPair('auditor','attack') },
  founder:{ attack:walkPair('founder','attack') },     courier:{ heal:walkPair('courier','heal') },
  bomber:{ attack:walkPair('bomber','attack') },       nino:{ attack:walkPair('nino','attack') },
  biba:{ heal:walkPair('biba','heal') },               // hero Recruiter — custom heal animation
  rust:{ attack:walkPair('rust','attack') },           // hero Founder Mech — custom foundry-orange slam
  zeca:{ mine:walkPair('zeca','mine') },               // hero Intern — custom teal mining swing (gameplay = worker)
  ninja:{ attack:walkPair('ninja','attack') },         rex:{ attack:walkPair('rex','attack') },   // villain bosses
  // EX-TERMINATOR: three distinct attack strips, one per AOE ability kind (villains.js AOE_KINDS → u._actState)
  ex_terminator:{ attack_melee:walkPair('ex_terminator','attack_melee'),
                  attack_pistol:walkPair('ex_terminator','attack_pistol'),
                  attack_minigun:walkPair('ex_terminator','attack_minigun'),
                  idle:walkPair('ex_terminator','idle') },   // arms-crossed pose shown during his bomber extraction
};
function actionAnim(type,action,owner,faction){ const t=UNIT_ACTION[type]; const a=t&&t[action]; if(!a) return null;
  const x=(faction && a[faction] && a[faction].ready) ? a[faction] : a[factionKey(owner)]; return (x&&x.ready)?x:null; }
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

/* ---- Laser muzzle anchoring (render-only) ----
   World point of a unit's gun barrel, derived from the precalculated normalized muzzle
   in MUZZLE[type] (js/muzzle_data.js). Mirrors blitFrame EXACTLY so the point tracks the
   drawn sprite pixel-for-pixel: the frame box is x∈[-dw/2,+dw/2], y∈[-0.7h,+0.3h] around
   (u.x, u.y-alt), with the same horizontal flip. Because (mx,my) is normalized and dw/dh
   scale with unitDrawH, big mechs automatically get a muzzle further out — and the beam
   width scales the same way. Falls back to a forward/upper default when unauthored. */
function muzzleWorld(u){
  const sType = u.spriteType || u.type;
  const m = (typeof MUZZLE!=='undefined' && MUZZLE[sType]) || MUZZLE_FALLBACK;
  const anim = actionAnim(sType,'attack',u.owner) || unitWalk(sType,u.owner);
  const vh = unitDrawH(u), dh = vh, dw = vh*(anim ? anim.fw/anim.fh : 1), alt = u.air?16:0;
  let lx = ((m.mx!=null?m.mx:0.7) - 0.5)*dw;
  let ly = ((m.my!=null?m.my:0.42) - 0.7)*dh;
  const facesLeft = !!(DEF[u.type] && DEF[u.type].facesLeft);
  if(((u._face||1)<0) !== facesLeft) lx = -lx;     // same mirror as blitFrame
  if(u._rotMode && u._rot){                          // vehicle/air bank: lean the muzzle offset about the sprite
    const r=u._rot, c=Math.cos(r), s=Math.sin(r), pivY=-0.2*dh, ry=ly-pivY;   // centre (0,-0.2·dh = ROT_PIVOT), so the beam stays on the barrel
    const nlx=lx*c-ry*s; ly=pivY+lx*s+ry*c; lx=nlx;
  }
  return { x:u.x + lx, y:(u.y-alt) + ly };
}
/* Drawn sprite box of a building in WORLD px: BUILDING_DRAW_SCALE× the footprint width,
   aspect-preserved, bottom-anchored, with the per-type overhang/tall factors. Single source
   of truth for drawBuilding (render), the selection ring, and click hit-testing — keep them
   in lockstep. Falls back to the bare footprint when the sprite strip isn't loaded. */
function buildingDrawBox(e, spr){
  const x0=e.tx*TILE, y0=e.ty*TILE, w=e.w*TILE, h=e.h*TILE;
  if(spr===undefined) spr=buildingSprite(e.type, e.owner);
  if(!spr) return { x:x0, y:y0, w, h };
  const overhang = e.type==='turret'?1.18:1.08;
  const tall = BUILDING_TALL[e.type]||1;
  const dw=w*overhang*buildingDrawScale(e.type), dh=dw*(spr.fh/spr.fw)*tall;
  return { x:x0+(w-dw)/2, y:y0+h-dh+2, w:dw, h:dh };
}
// Per-type frame aspect (fh/fw) measured from the shipped 9-frame strips (= 9*stripH/stripW). The
// DETERMINISTIC twin of buildingDrawBox: it reproduces the same drawn-art geometry but in TILE units
// and WITHOUT reading the live sprite — so it returns the identical answer on every peer regardless of
// whether the PNG has loaded yet (buildingDrawBox falls back to the bare footprint until load, which
// would desync map generation / co-op). Width never needs a sprite; only height uses the baked aspect.
// Used by start-base spacing logic and the placement test harness; render still uses buildingDrawBox.
const BUILDING_ART_ASPECT = { hq:1.4075, barracks:0.9958, turret:1.1007, garage:0.9355, launchpad:1.0386, outpost:0.9283 };
function buildingArtBoxTiles(type, tx, ty){
  const fw=DEF[type].w, fh=DEF[type].h;
  const overhang = type==='turret'?1.18:1.08;
  const dw = fw*overhang*buildingDrawScale(type);
  const dh = dw*(BUILDING_ART_ASPECT[type]||1)*(BUILDING_TALL[type]||1);
  return { x: tx+(fw-dw)/2, y: ty+fh-dh+2/TILE, w: dw, h: dh };
}
// World point of a building's rooftop gun — normalized within the tile FOOTPRINT (no flip).
function buildingMuzzle(b){
  const m = (typeof MUZZLE!=='undefined' && MUZZLE[b.type]) || null;
  const x0 = b.tx*TILE, y0 = b.ty*TILE, w = b.w*TILE, h = b.h*TILE;
  const bx = m && m.bx!=null ? m.bx : 0.5, by = m && m.by!=null ? m.by : 0.15;
  // Sprites are drawn buildingDrawScale()× about the footprint's bottom-center, so the
  // footprint-normalized anchor undergoes the same transform to stay on the rooftop gun.
  const s = buildingDrawScale(b.type);
  return { x:x0 + w/2 + w*(bx-0.5)*s, y:y0 + h - h*(1-by)*s };
}
// Beam-width multiplier for an emitter (big units → heavier ray).
function muzzleW(e){ const m = (typeof MUZZLE!=='undefined' && MUZZLE[e.spriteType||e.type]); return (m && m.w) || 1; }
