/* config.js — constants & data: TILE, canvas refs, terrain/biome, DEF (unit/building stats), MAPS. Loaded FIRST. | STARLEFT (classic scripts) */
/* =====================================================================
   STARLEFT — single-file mini RTS
   ===================================================================== */
const TILE = 32;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const mm = document.getElementById('minimap');
const mmx = mm.getContext('2d');
const GAME_FONT = '"Glitch Goblin", "Segoe UI", Tahoma, sans-serif';
const GAME_MONO_FONT = '"Glitch Goblin", "Courier New", monospace';

/* ---- Display scaling (high-DPI / retina) + map zoom range ----
   dpr is refreshed by resize(); ZOOM_* bound pinch / wheel / button zoom. */
let dpr = window.devicePixelRatio || 1;
const ZOOM_MIN = 0.35, ZOOM_MAX = 2.0;

/* ---- Laser shot FX lifetime (seconds) ----
   How long a fired shot's `shootFx` transient lives. Set at every spawn site
   (units.js, core.js) AND the co-op client rebuild (net/sync.js) so host & client
   agree, and used by render.js drawLaserBolt to derive the bolt's flight progress
   (p = 1 - shootFx.t / SHOOTFX_LIFE). Cosmetic only — never simulated or saved. */
const SHOOTFX_LIFE = 0.14;

/* ---- The Sprint: keep-tapping a spot makes the selected squad RUN there,
   accelerating a little and ignoring incoming fire (they don't fight back)
   until the player stops tapping. See js/sprint.js. ---- */
const SPRINT_TAP_WINDOW = 0.6;  // s — max gap between taps before the sprint ends
const SPRINT_ACCEL      = 0.4;  // speed-bonus gained per second of sustained sprint
const SPRINT_MAX_BONUS  = 0.5;  // cap → top speed = 1.5× base ("accelerates a little")
// Desktop plays at 1:1; phones/tablets start zoomed out to fit more of the map.
function initialZoom(W,H){
  const touch = (innerWidth < 820) || ('ontouchstart' in window);
  if(!touch) return 1.0;
  const fit = Math.min(innerWidth/(W*TILE), (innerHeight-196)/(H*TILE));
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit*0.85));
}

/* ---- Terrain types (drive gameplay: passability, gathering, LOS) ---- */
const T_GRASS=0, T_DIRT=1, T_WATER=2, T_ROCK=3, T_TREE=4;
function passableTerrain(t){ return t===T_GRASS || t===T_DIRT; }

/* ---- Topography feature size (trees/rocks rendered as multi-tile "walk-under" sprites) ----
   THE tuning knob: FEAT_SIZE = footprint side length in TILES (square, so the sprite never
   distorts). The bottom floor(SIZE/2) rows DENY passage; the upper rows are passable and units
   walk UNDER the canopy. Blocks = SIZE²:   2 → 2x2 (4 blocks, original)   3 → 3x3 (9)   4 → 4x4 (16).
   Change this one number to resize every tree & rock on every map. */
const FEAT_SIZE = 3;
const FEAT_BLOCK_FROM = FEAT_SIZE - (FEAT_SIZE>>1);   // first blocked row (rows >= this deny; rows above walk-under)

/* ---- Biomes (visual region themes that coexist within a single map) ----
   A biome reskins the floor + features of a region; terrain type still
   controls gameplay. Water/Mountain biomes also bias terrain generation so
   they read as real seas / impassable ranges. */
const B_GRASS=0, B_MOUNTAIN=1, B_WATER=2, B_TECH=3, B_DESERT=4, B_ICE=5, B_VOLCANIC=6;
const BIOME_KINDS = [B_MOUNTAIN,B_WATER,B_TECH,B_DESERT,B_ICE,B_VOLCANIC];
// floor palette: a/b = two shades alternated by per-tile variant; dirt = worn-patch tint.
// DARK / devastated cyberpunk tones — matches the generated atlas; used as the
// procedural fallback if the atlas image is missing, and for the minimap.
const BIOME_PAL = {
  [B_GRASS]:    { a:'#1c2a1e', b:'#243524', dirt:'#232a1d' },
  [B_MOUNTAIN]: { a:'#24262b', b:'#2d2f35', dirt:'#20242a' },
  [B_WATER]:    { a:'#0c2230', b:'#103040', dirt:'#0c2230' },
  [B_TECH]:     { a:'#14181f', b:'#1b2129', dirt:'#12161c' },
  [B_DESERT]:   { a:'#3f3526', b:'#4a4030', dirt:'#342c20' },
  [B_ICE]:      { a:'#2c3742', b:'#37454f', dirt:'#283440' },
  [B_VOLCANIC]: { a:'#16110e', b:'#201913', dirt:'#14100d' },
};
// flat colors for the minimap floor, indexed by biome (dark, matches the atlas)
const BIOME_MINI = ['#1c2a1e','#24262b','#0c2230','#14181f','#3f3526','#2c3742','#16110e'];

/* ---- Procedural terrain parameters (Whittaker-style: elevation + climate) ----
   newMap() builds three coherent noise fields — ELEVATION (land/sea/mountain),
   TEMPERATURE (a latitude-style gradient + noise), MOISTURE — and classifies
   each tile from them, so geography comes out realistic and contiguous.
   A map may override any of these via its `terrain:{}` block; omitted fields
   fall back to TEMPERATE GRASSLAND below. `biomes` is the allowed land palette
   ('grass','desert','ice','tech','volcanic'); climates outside it are remapped. */
const CLIMATE = { grass:B_GRASS, desert:B_DESERT, ice:B_ICE, tech:B_TECH, volcanic:B_VOLCANIC };
const TERRAIN_DEFAULTS = {
  // Coverage is set by QUANTILE (target fraction of the map), not an absolute
  // elevation cutoff, so water/mountain amounts stay consistent across seeds.
  seaFrac: 0.12,         // fraction of the map that is water (lowest elevations)
  mtnFrac: 0.10,         // fraction that is mountain (highest elevations)
  centralSea: 0,         // >0: force a sea of this radius (fraction of min(W,H)) at map centre
  temp:  { axis:'none', gradient:0.0, base:0.55, noise:0.16 }, // axis: 'y'|'x'|'diag'|'none'
  moist: { base:0.5, noise:0.5 },
  freeze: 0.30,          // temp below this (where ice allowed) → snow
  hot:    0.70,          // temp above this + dry (where desert allowed) → sand
  dry:    0.42,          // moisture below this counts as arid
  biomes: ['grass'],     // allowed land climates; others are remapped to the nearest allowed
  forest: 0.05,          // forest density on moist grass (0..~0.15)
  beach:  true,          // sandy/dirt shore band where land meets sea
};


/* ---- Unit / building definitions (startup-vs-monopoly satire) ---- */
const DEF = {
  hq:       { name:'Open-Plan HQ', icon:'🏢', kind:'building', w:4,h:3, hp:3000, cost:0,   build:35,  sight:7, supply:24, color:'#3b7fd0',
              dmg:8, range:7.5, cd:1.6, flavor:'Stores Funding and onboards unpaid Interns. Fires the occasional warning shot from the rooftop.' },
  barracks: { name:'People Ops',   icon:'🎯', kind:'building', w:3,h:3, hp:900,  cost:150, build:20,  sight:5, supply:0,  color:'#5a6b8a',
              flavor:'"Recruiting" department. Turns Funding into Growth Cyborgs and Consultants.' },
  turret:   { name:'Legal Team',   icon:'⚖️', kind:'building', w:2,h:2, hp:550,  cost:100, build:14,  sight:7, supply:0,  color:'#7a8aa8',
              dmg:14, range:6.0, cd:0.7, flavor:'Fires cease-and-desist letters at anything that trespasses on your IP.' },
  outpost:  { name:'Satellite Office', icon:'📡', kind:'building', w:3,h:3, hp:650, cost:175, build:16, sight:5, supply:0, color:'#5a6b8a',
              deposit:true, trickle:2, flavor:'A scrappy forward branch — Interns drop Funding here instead of trekking back to HQ, and its rig slowly auto-extracts a little on its own. Cheaper and flimsier than a second HQ.' },
  condo:    { name:'Unit Condo', icon:'🏙️', kind:'building', w:5,h:4, hp:1200, cost:0, build:1, sight:6, supply:0, color:'#4b6b8f',
              flavor:'A vertical dormitory for employees who survived quarterly planning.' },
  mdc:      { name:'Mission Dispatch Center M.D.C.', icon:'🛰️', kind:'building', w:3,h:3, hp:900, cost:0, build:1, sight:6, supply:0, color:'#5a6b8a',
              flavor:'Walk veterans inside to stage them for the next quarterly disaster.' },
  ultra:    { name:'ULTRA Headquarters', icon:'◆', kind:'building', w:8,h:8, hp:5000, cost:0, build:1, sight:8, supply:0, color:'#7a2cff',
              flavor:'The company that fabricates life for everyone, everywhere.' },
  worker:   { name:'Intern',         icon:'🧑‍💻', kind:'unit', hp:60,  cost:50,  build:10, sight:5, supply:1, speed:2.6, dmg:4,  range:1.0, cd:1.0, r:9,
              flavor:'Mines Funding "for the exposure." Builds things. Equity will never vest.' },
  soldier:  { name:'Growth Cyborg',  icon:'🚀', kind:'unit', hp:140, cost:80,  build:13, sight:6, supply:1, speed:2.4, dmg:17, range:1.3, cd:0.9, r:10,
              flavor:'Moves fast and breaks things — primarily skulls. Hates meetings, loves disruption.' },
  ranger:   { name:'Consultant',     icon:'💼', kind:'unit', hp:95,  cost:95,  build:16, sight:7, supply:1, speed:2.4, dmg:14, range:5.0, cd:1.1, r:9,
              flavor:'Bills $400/hr to lob synergy buzzwords at the enemy from a safe distance.' },

  /* ---- People Ops (Barracks) tier ---- */
  recruiter:{ name:'Recruiter', icon:'🧑‍🏫', kind:'unit', hp:80, cost:99, build:14, sight:6, supply:1, speed:2.5, dmg:0, range:4.0, cd:1.0, r:9, action:'heal',
              heal:9, flavor:'Heals burnout. "We\'re like a family." Mends teammates instead of fighting.' },
  hustler:  { name:'Hustler', icon:'🛹', kind:'unit', hp:70, cost:70, build:11, sight:7, supply:1, speed:3.5, dmg:10, range:1.6, cd:0.7, r:9,
              splash:14, splashR:1.2, flavor:'Moves fast and breaks things. Cheap, fast, harasses your economy.' },
  lobbyist: { name:'Lobbyist', icon:'🎩', kind:'unit', hp:70, cost:196, build:20, sight:9, supply:2, speed:2.2, dmg:36, range:7.5, cd:2.3, r:9,
              flavor:'Buys senators wholesale. One devastating long-range shot, then a long reload.' },
  /* ---- The Garage (Factory) tier ---- */
  foodtruck:{ name:'Food Truck', icon:'🚚', kind:'unit', hp:110, cost:90, build:15, sight:6, supply:2, speed:3.6, dmg:11, range:3.0, cd:1.0, r:11, vehicle:true,
              splash:9, splashR:1.4, flavor:'Free cold brew & napalm. A flame cone shreds clustered enemies.' },
  auditor:  { name:'Auditor', icon:'📊', kind:'unit', hp:200, cost:175, build:28, sight:8, supply:3, speed:1.8, dmg:18, range:5.0, cd:1.4, r:12, vehicle:true, antiAir:true,
              siege:{dmg:42,range:9,splashR:1.6,setup:1.2}, flavor:'Deploys spreadsheets into a long-range due-diligence cannon. Sieges when enemies are near.' },
  /* ---- Launch Pad (Starport) tier ---- */
  founder:  { name:'Founder Mech', icon:'🦄', kind:'unit', hp:600, cost:599, build:45, sight:8, supply:6, speed:1.6, dmg:45, range:3.5, cd:1.5, r:16, vehicle:true,
              splash:20, splashR:1.3, antiAir:true, flavor:'A visionary in a 12-ft exosuit. Hits anything, ground or air.' },
  courier:  { name:'Drugztore Delivery Drone', icon:'🛸', kind:'unit', hp:120, cost:90, build:16, sight:7, supply:2, speed:3.0, dmg:0, range:4.0, cd:1.0, r:10, air:true, action:'heal',
              heal:7, flavor:'Same-day delivery of medkits and morale. Flies over everything.' },
  bomber:   { name:'Buzzword Bomber', icon:'🛩️', kind:'unit', hp:480, cost:630, build:50, sight:9, supply:6, speed:1.7, dmg:26, range:6.0, cd:0.9, r:16, air:true, antiAir:true, facesLeft:true,
              flavor:'Capital airship. Rains cyan ordnance on the campus below.' },

  /* ---- production buildings ---- */
  garage:   { name:'The Garage', icon:'🔧', kind:'building', w:3,h:3, hp:1000, cost:200, build:24, sight:4, supply:0, color:'#4a6b5a',
              flavor:'Vehicle bay. Turns Funding into Food Trucks, Auditors and Founder Mechs.' },
  launchpad:{ name:'Launch Pad', icon:'🚀', kind:'building', w:3,h:3, hp:850,  cost:250, build:28, sight:5, supply:0, color:'#5a6b8a',
              flavor:'Starport. Assembles Drugztore Delivery Drones and Buzzword Bombers. Requires a Garage.' },
  /* ---- H.U.B.-only Training Grounds (level-cloning facility; never built in combat) ---- */
  training: { name:'Training Grounds', icon:'🎯', kind:'building', w:28,h:22, hp:4000, cost:0, build:1, sight:8, supply:0, color:'#5a6b8a',
              flavor:'A neon shooting academy. Lock a veteran mentor in with a junior of the same type — both walk out one level above the senior.' },
};

/* Which units each production building can hire — single source for the build
   menu's placement preview (info panel) so the player sees the roster before
   committing Funding. Keys mirror the train buttons in ui.js buildCommands. */
const BUILD_HIRES = {
  hq:        ['worker'],
  barracks:  ['soldier','ranger','recruiter','hustler','lobbyist'],
  garage:    ['foodtruck','auditor','founder'],
  launchpad: ['courier','bomber'],
};

/* =====================================================================
   MAP DEFINITIONS  (two maps, played in sequence)
   ===================================================================== */
const MAPS = [
  {
    name:'I — The Garage',
    enemyName:'DISRUPTR INC.',
    crawl:{ episode:'EPISODE I', title:'THE MINIMUM VIABLE PRODUCT',
      text:`It is a period of disruption. Armed with a slick pitch deck and exactly zero revenue, a plucky STARTUP sets out to MOVE FAST and BREAK THINGS.

Fueled by Venture Funding and free cold brew, your unpaid INTERNS must mine Funding, scale the team, and bury the rival startup DISRUPTR INC. before the runway runs out.

The board is watching. Synergy awaits....` },
    w:48, h:40,
    seed:1,
    player:{ x:5, y:33 },
    // a green starting valley — lush temperate grassland, gentle water & low hills
    terrain:{ biomes:['grass'], seaFrac:0.08, mtnFrac:0.07, moist:{base:0.62,noise:0.45}, forest:0.10 },
    aggression:1.0,
    // tutorial map: long peace so new players can learn the mechanics without dying —
    // no enemy waves invade the base until ~3 minutes in.
    graceTime:180, waveTimer:180,
    enemies:[ {x:40,y:6, defenders:2}, {x:30,y:24, defenders:2} ],
    objective:'DISRUPTR INC. now holds TWO outposts. Mine Funding, scale your team, and raze both.',
    lakes:[ {x:20,y:20,r:4}, {x:30,y:28,r:3} ],
    rockClusters:[ {x:15,y:14,n:14}, {x:34,y:22,n:12}, {x:24,y:8,n:10} ],
    forests:[ {x:10,y:20,n:30}, {x:38,y:30,n:26}, {x:25,y:34,n:20} ],
    goldNodes:[ {x:8,y:30,amt:1500},{x:11,y:34,amt:1500},{x:43,y:9,amt:1500},{x:38,y:5,amt:1500},{x:24,y:18,amt:2000} ],
  },
  {
    name:'II — The Silicon Wastes',
    enemyName:'MEGACORP',
    crawl:{ episode:'EPISODE II', title:'THE HOSTILE TAKEOVER',
      text:`Flush with a Series B and dangerously overvalued, your startup has officially gone UNICORN. 🦄

But across the Silicon Wastes sprawls MEGACORP — a bloated incumbent with infinite cash, two HR departments, and a litigation army.

Weaponize your buzzwords, circle back, and disrupt MegaCorp into bankruptcy. There is no exit strategy but victory....` },
    w:54, h:46,
    seed:2,
    player:{ x:6, y:6 },
    // the Silicon WASTES — hot arid desert with dry-grass pockets, rocky, little water
    terrain:{ biomes:['desert','grass'], temp:{base:0.74,noise:0.18}, hot:0.6, dry:0.65, moist:{base:0.42,noise:0.5}, seaFrac:0.05, mtnFrac:0.12, forest:0.02 },
    aggression:1.5,
    enemies:[ {x:44,y:38, extraBarracks:true, defenders:4}, {x:46,y:12, defenders:3} ],
    objective:'MEGACORP now holds TWO campuses (SE and E). Raze both and acquire their assets by force.',
    lakes:[ {x:26,y:14,r:5}, {x:18,y:32,r:4}, {x:38,y:20,r:3} ],
    rockClusters:[ {x:30,y:8,n:16},{x:20,y:22,n:14},{x:40,y:30,n:14},{x:12,y:30,n:10},{x:46,y:14,n:10} ],
    forests:[ {x:14,y:14,n:34},{x:34,y:34,n:30},{x:44,y:24,n:22},{x:8,y:40,n:20} ],
    goldNodes:[ {x:9,y:9,amt:1600},{x:5,y:13,amt:1600},{x:47,y:35,amt:1600},{x:42,y:42,amt:1600},
                {x:27,y:24,amt:2400},{x:13,y:38,amt:1800},{x:40,y:10,amt:1800} ],
  },
  {
    name:'III — The Merger',
    enemyName:'SYNERGY CORP',
    aggression:1.4,
    startGold:600, startWorkers:6, startSoldiers:3, startBarracks:true,
    graceTime:95, waveTimer:105,
    crawl:{ episode:'EPISODE III', title:'THE MERGER',
      text:'Your war chest is overflowing and the press calls you a "category leader."\n\nBut your two biggest rivals just MERGED into SYNERGY CORP — a hydra with two campuses, double the middle managers, and a synergy mandate.\n\nThe board wired you extra Funding. Mine fast, scale faster, and bankrupt BOTH campuses before the all-hands.' },
    w:64, h:54,
    seed:3,
    player:{ x:6, y:46 },
    // flooded merger ground — a lake-laced temperate grassland, few hills
    terrain:{ biomes:['grass'], seaFrac:0.20, mtnFrac:0.06, moist:{base:0.60,noise:0.5}, forest:0.08 },
    enemies:[ {x:54,y:8, extraBarracks:true, defenders:3}, {x:50,y:46, defenders:3}, {x:40,y:24, extraBarracks:true, defenders:3} ],
    objective:'SYNERGY CORP has THREE campuses — liquidate all three. You start with extra Funding and a People Ops to fund the takeover.',
    lakes:[ {x:30,y:26,r:5},{x:18,y:14,r:3},{x:44,y:34,r:4} ],
    rockClusters:[ {x:36,y:18,n:16},{x:24,y:38,n:14},{x:48,y:24,n:12},{x:14,y:30,n:10} ],
    forests:[ {x:20,y:44,n:26},{x:50,y:14,n:24},{x:40,y:46,n:20},{x:30,y:10,n:18} ],
    goldNodes:[ {x:4,y:42,amt:2600},{x:9,y:50,amt:2600},{x:3,y:48,amt:2200},
                {x:57,y:6,amt:1800},{x:50,y:5,amt:1800},{x:53,y:49,amt:1800},{x:46,y:48,amt:1800},
                {x:32,y:28,amt:3000},{x:24,y:20,amt:2200} ],
  },
  {
    name:'IV — The Monopoly Endgame',
    enemyName:'OMNICORP',
    aggression:1.6,
    startGold:800, startWorkers:6, startSoldiers:4, startBarracks:true,
    graceTime:100, waveTimer:110,
    crawl:{ episode:'EPISODE IV', title:'THE MONOPOLY ENDGAME',
      text:'You are no longer a startup. You are a threat.\n\nOMNICORP — the incumbent that owns the cloud, the ads, and the antitrust lawyers — just activated its TWIN headquarters to crush you for good.\n\nThis is the exit. Burn down BOTH OMNICORP HQs and the market is yours. Go public, or go home.' },
    w:72, h:60,
    seed:4,
    player:{ x:7, y:7 },
    // OMNICORP owns the cloud — a vast dark server-farm foundation with coolant pools
    terrain:{ biomes:['tech'], seaFrac:0.13, mtnFrac:0.08, forest:0 },
    enemies:[ {x:62,y:50, extraBarracks:true, defenders:4}, {x:60,y:12, extraBarracks:true, defenders:4}, {x:36,y:48, extraBarracks:true, defenders:4} ],
    objective:'OMNICORP has THREE HQs — raze all three. You are very well-funded; overwhelm them.',
    lakes:[ {x:34,y:30,r:6},{x:50,y:18,r:4},{x:22,y:44,r:4},{x:58,y:40,r:3} ],
    rockClusters:[ {x:40,y:14,n:18},{x:26,y:24,n:16},{x:50,y:48,n:16},{x:16,y:36,n:12},{x:60,y:28,n:12} ],
    forests:[ {x:16,y:14,n:28},{x:44,y:46,n:26},{x:56,y:24,n:22},{x:30,y:50,n:20},{x:62,y:54,n:16} ],
    goldNodes:[ {x:4,y:4,amt:3000},{x:10,y:3,amt:2600},{x:3,y:11,amt:2600},{x:12,y:11,amt:2400},
                {x:65,y:52,amt:1800},{x:58,y:53,amt:1800},{x:63,y:9,amt:1800},{x:56,y:8,amt:1800},
                {x:36,y:30,amt:3500},{x:28,y:18,amt:2400},{x:46,y:40,amt:2400} ],
  },
  {
    name:'V — The Cartel',
    enemyName:'THE CARTEL',
    aggression:1.8,
    startGold:1000, startWorkers:7, startSoldiers:4, startBarracks:true,
    graceTime:95, waveTimer:105,
    crawl:{ episode:'EPISODE V', title:'THE CARTEL',
      text:'You won. You are the monopoly. And monopolies make enemies.\n\nYour three biggest victims — bankrupt but vengeful — pooled their severance into THE CARTEL: a three-campus coalition sworn to disrupt the disruptor.\n\nThe board tripled your war chest. Mine relentlessly, field an overwhelming army, and liquidate all THREE campuses — one quarterly review at a time.' },
    w:80, h:66,
    seed:5,
    player:{ x:6, y:58 },
    // lawless scorched badlands — volcanic basalt with molten lava seas
    terrain:{ biomes:['volcanic'], seaFrac:0.10, mtnFrac:0.10, forest:0 },
    enemies:[ {x:68,y:10, extraBarracks:true, defenders:3}, {x:72,y:54, extraBarracks:true, defenders:3}, {x:34,y:8, defenders:3}, {x:46,y:36, extraBarracks:true, defenders:3} ],
    objective:'THE CARTEL holds FOUR campuses. Liquidate all four — clear them one at a time. You start very well-funded.',
    lakes:[ {x:40,y:32,r:6},{x:24,y:18,r:4},{x:56,y:44,r:4},{x:30,y:50,r:3} ],
    rockClusters:[ {x:48,y:20,n:18},{x:30,y:34,n:16},{x:60,y:30,n:14},{x:18,y:44,n:12},{x:52,y:56,n:12} ],
    forests:[ {x:18,y:54,n:28},{x:62,y:14,n:26},{x:68,y:50,n:22},{x:38,y:12,n:20},{x:44,y:48,n:18} ],
    goldNodes:[ {x:3,y:54,amt:3000},{x:9,y:62,amt:3000},{x:4,y:60,amt:2600},{x:11,y:55,amt:2400},
                {x:71,y:8,amt:1800},{x:65,y:6,amt:1800},{x:74,y:56,amt:1800},{x:69,y:51,amt:1800},{x:31,y:6,amt:1800},{x:37,y:11,amt:1800},
                {x:40,y:34,amt:3600},{x:50,y:48,amt:2400},{x:26,y:40,amt:2400} ],
  },
  {
    name:'VI — The Hostile Board',
    enemyName:'THE BOARD',
    aggression:2.0,
    startGold:1300, startWorkers:8, startSoldiers:5, startBarracks:true,
    graceTime:100, waveTimer:110,
    crawl:{ episode:'EPISODE VI', title:'THE HOSTILE BOARD',
      text:'There is one threat left, and it signs your paychecks.\n\nTHE BOARD has staged a coup — three fortified strongholds, infinite lawyers, and a vote to replace you with "synergistic leadership."\n\nThis is the real endgame. Raze all THREE board strongholds and the company — the market, the future — is yours alone. Vest, or die.' },
    w:88, h:72,
    seed:6,
    player:{ x:7, y:7 },
    // corporate winter — a frozen wasteland of snow and ice, seas frozen over
    terrain:{ biomes:['ice'], temp:{base:0.20,noise:0.15}, freeze:0.50, seaFrac:0.12, mtnFrac:0.10 },
    enemies:[ {x:78,y:62, extraBarracks:true, defenders:4}, {x:80,y:16, extraBarracks:true, defenders:4}, {x:42,y:66, extraBarracks:true, defenders:4}, {x:48,y:36, extraBarracks:true, defenders:4} ],
    objective:'THE BOARD seized FOUR strongholds to oust you. Raze all four for the ultimate exit. You have maximum Funding — make it count.',
    lakes:[ {x:44,y:36,r:7},{x:28,y:20,r:4},{x:60,y:24,r:4},{x:34,y:54,r:4},{x:66,y:48,r:3} ],
    rockClusters:[ {x:52,y:16,n:18},{x:34,y:28,n:16},{x:64,y:34,n:16},{x:22,y:46,n:12},{x:56,y:56,n:14},{x:72,y:54,n:10} ],
    forests:[ {x:18,y:18,n:30},{x:50,y:48,n:26},{x:68,y:30,n:22},{x:34,y:60,n:20},{x:74,y:64,n:16},{x:24,y:34,n:16} ],
    goldNodes:[ {x:4,y:4,amt:3200},{x:11,y:3,amt:3000},{x:3,y:12,amt:3000},{x:13,y:11,amt:2600},{x:6,y:14,amt:2400},
                {x:81,y:64,amt:1800},{x:75,y:65,amt:1800},{x:83,y:14,amt:1800},{x:77,y:11,amt:1800},{x:39,y:68,amt:1800},{x:45,y:69,amt:1800},
                {x:44,y:38,amt:4000},{x:30,y:30,amt:2600},{x:58,y:42,amt:2600},{x:50,y:24,amt:2400} ],
  },
  {
    name:'VII — The Dunes and the Drifts',
    enemyName:'THE CONGLOMERATE',
    aggression:1.7,
    startGold:1600, startWorkers:8, startSoldiers:6, startBarracks:true,
    graceTime:125, waveTimer:125,
    crawl:{ episode:'EPISODE VII', title:'THE DUNES AND THE DRIFTS',
      text:'You crushed the board. You ARE the market. So the survivors did the only thing left — they merged into one.\n\nTHE CONGLOMERATE spans a frozen-and-scorched wasteland: EIGHT subsidiary campuses ringing a dead sea, defended by every lawyer money can rent.\n\nBut two of your own outposts were abandoned out on the dunes and the drifts — reach them and they\'re yours again. Mine the wastes, reclaim what\'s lost, and liquidate all eight. This is the last quarter. Make it count.' },
    // Double the area of the previous biggest map (88×72 = 6,336 tiles → 124×102 ≈ 12,648).
    w:124, h:102,
    seed:7,
    player:{ x:8, y:94 },
    // ---- A frozen-and-scorched wasteland: cold SNOW north, hot DESERT south
    //      (a real latitude gradient), with a big dead SEA drowning the centre.
    //      No grassland anywhere. Geography is coherent (no per-tile jitter). ----
    terrain:{
      biomes:['desert','ice'],
      centralSea:0.18,                                       // the dead sea
      seaFrac:0.15, mtnFrac:0.03,                            // sea + few ponds; few ridges (rocks are hand-placed)
      temp:{ axis:'y', base:0.5, gradient:0.72, noise:0.12 },// north cold → south hot
      freeze:0.36, hot:0.6, dry:1.0,                         // dry:1 → desert is temp-driven, not moisture-gated
      forest:0.03, beach:true,
    },
    enemies:[ {x:12,y:10, extraBarracks:true, defenders:3}, {x:42,y:8, defenders:3}, {x:80,y:8, defenders:3},
              {x:110,y:12, extraBarracks:true, defenders:3}, {x:112,y:50, defenders:3}, {x:110,y:90, extraBarracks:true, defenders:3},
              {x:74,y:94, defenders:3}, {x:10,y:50, defenders:3} ],
    // two abandoned player outposts flanking the central sea — walk a unit up to reclaim them
    lostBases:[ {x:36,y:50}, {x:84,y:50} ],
    objective:'THE CONGLOMERATE holds EIGHT campuses around a dead sea — liquidate all eight. TWO abandoned outposts sit in the middle: reach them with a unit to reclaim them and fight from the front.',
    lakes:[ {x:28,y:24,r:3},{x:96,y:78,r:3},{x:24,y:74,r:3},{x:98,y:26,r:3} ],
    rockClusters:[ {x:50,y:24,n:16},{x:74,y:78,n:16},{x:30,y:64,n:14},{x:92,y:38,n:14},{x:20,y:30,n:12},{x:104,y:66,n:12} ],
    forests:[ {x:18,y:18,n:24},{x:100,y:84,n:24},{x:96,y:20,n:22},{x:22,y:84,n:22},{x:40,y:40,n:16},{x:84,y:62,n:16} ],
    goldNodes:[ {x:6,y:90,amt:3000},{x:12,y:96,amt:3000},{x:4,y:84,amt:2600},
                {x:8,y:6,amt:1800},{x:46,y:5,amt:1800},{x:84,y:5,amt:1800},{x:116,y:8,amt:1800},
                {x:118,y:54,amt:1800},{x:116,y:94,amt:1800},{x:78,y:98,amt:1800},{x:5,y:46,amt:1800},
                {x:32,y:54,amt:2800},{x:88,y:54,amt:2800},{x:62,y:26,amt:3500},{x:62,y:76,amt:3500} ],
  },
  {
    name:'VIII — The Down Round',
    enemyName:'A&O',
    // A hard reset to scrappy: the empire is ash, so the economy starts near Episode I — you
    // really do rebuild from nothing. A&O is entrenched (one campus has an extra People Ops) but
    // this sits at the bottom of a NEW curve, so aggression is low and grace is generous.
    aggression:1.2,
    startGold:350, startWorkers:4, startSoldiers:2, startBarracks:false,
    graceTime:105, waveTimer:112,
    crawl:{ episode:'EPISODE VIII', title:'THE DOWN ROUND',
      text:'The blast took everything. The campuses, the war chest, the names you carried this far — all of it gone to light and ash. The memorial is the only thing that scaled.\n\nYou come to broke in the crater of your own empire, and you are not alone in it. A&O — Alpha & Omega, the fund that buys the beginning and the end — filed the paperwork before the dust settled. They picked up your wreckage at auction and call it a portfolio.\n\nNo runway. No team — almost. NINO walked back into the crater the day he heard: the lobbyist who bought your first hundred votes, owed favors in one hand and nothing left to lose in the other. He says he can buy you a room and a reputation. After that, you are on your own.\n\nTwo A&O campuses squat on the bones of what you built. Mine the ruins, hire whoever is left, and take it back one down round at a time. Begin again, or stay buried.' },
    w:52, h:44,
    seed:8,
    player:{ x:5, y:38 },
    // the dead server-farm of the old monopoly, weeds reclaiming the wreckage — Ep IV tech gone
    // back to Ep I grass. A graveyard you have to farm.
    terrain:{ biomes:['tech','grass'], seaFrac:0.10, mtnFrac:0.08, moist:{base:0.50,noise:0.45}, forest:0.06 },
    // Nino — a returning Level-10 Lobbyist who comes back to help rebuild. Spawns near the player
    // HQ as a named career unit (fixed dossier); see spawnHeroes() in career.js.
    heroes:[ { name:'Nino', type:'lobbyist', sprite:'nino', level:11, dossier:{
      first:'Nino', last:'',
      home:'the Glitch Sprawl',
      rel:'crew', relName:'the first team',
      family:"Nino ran the lobby in the company's first life — bought the votes, wrote the laws, and watched every name he hired end up on the memorial wall.",
      trauma:'being three streets out when the blast turned the campus into a column of light',
      dream:'to see one thing he helped build outlast the money that funded it',
      crime:'authoring the legislation that made a hundred rivals simply vanish, and only now losing sleep over it',
    } } ],
    enemies:[ {x:44,y:7, extraBarracks:true, defenders:3}, {x:40,y:30, defenders:2} ],
    objective:'A&O bought the ruins of your empire and holds TWO campuses — liquidate both and rebuild from the crater.',
    lakes:[ {x:22,y:14,r:4}, {x:30,y:34,r:3} ],
    rockClusters:[ {x:16,y:20,n:14}, {x:34,y:18,n:12}, {x:24,y:30,n:10} ],
    forests:[ {x:12,y:24,n:24}, {x:38,y:38,n:20}, {x:28,y:8,n:18} ],
    goldNodes:[ {x:8,y:35,amt:1500},{x:11,y:39,amt:1500},{x:4,y:33,amt:1500},
                {x:47,y:10,amt:1500},{x:41,y:5,amt:1500},{x:43,y:33,amt:1500},
                {x:26,y:22,amt:2000} ],
  },
  {
    name:'IX — The Proof of Concept',
    enemyName:'A&O',
    // The company is regrowing on the back of the stolen blueprint: a step up from VIII — a real
    // war chest again, a People Ops on day one, three A&O research campuses to crack. Still mid-
    // curve, not finale-scale; this is the FIRST chapter of the long GRAAL arc, not its climax.
    aggression:1.4,
    startGold:550, startWorkers:5, startSoldiers:3, startBarracks:true,
    graceTime:100, waveTimer:108,
    crawl:{ episode:'EPISODE IX', title:'THE PROOF OF CONCEPT',
      text:'You clawed the company out of the crater and put A&O\'s Research campus to the torch. In its vault, behind the NDAs and the dead-man switches, you found it: the blueprint for the GRAAL.\n\nA brain chip that lifts a mind out of a failing body and writes it into another — metal, if it has to be. The names on your memorial wall stop looking quite so final. The board calls it the cure for the only churn that ever mattered.\n\nBut a blueprint is not a product, and A&O wants its stolen IP back. Stand up the lab, ship a proof of concept, and liquidate all THREE A&O research campuses before they repossess your future. Resurrection has a roadmap now. Hit the deadline.' },
    w:58, h:48,
    seed:9,
    player:{ x:6, y:42 },
    // a cold, sterile research compound — the dead server-farm of the old monopoly refrozen into
    // a cryo lab: tech racks under ice. Where the GRAAL gets reverse-engineered.
    terrain:{ biomes:['tech','ice'], temp:{base:0.30,noise:0.16}, freeze:0.46, seaFrac:0.11, mtnFrac:0.08, forest:0 },
    enemies:[ {x:48,y:8, extraBarracks:true, defenders:3}, {x:50,y:34, defenders:3}, {x:30,y:10, defenders:3} ],
    objective:'A&O wants its GRAAL blueprint back and holds THREE research campuses — liquidate all three and keep the proof of concept.',
    lakes:[ {x:24,y:22,r:4}, {x:40,y:30,r:3} ],
    rockClusters:[ {x:18,y:16,n:14}, {x:38,y:18,n:12}, {x:30,y:34,n:10} ],
    forests:[ {x:12,y:28,n:22}, {x:44,y:40,n:18}, {x:34,y:6,n:16} ],
    goldNodes:[ {x:4,y:38,amt:1600},{x:9,y:44,amt:1600},{x:3,y:44,amt:1600},
                {x:51,y:5,amt:1700},{x:45,y:6,amt:1700},{x:54,y:36,amt:1700},{x:52,y:30,amt:1700},
                {x:28,y:5,amt:1700},{x:34,y:12,amt:1700},
                {x:28,y:26,amt:2600} ],
  },
  {
    name:'X — The Acquihire',
    enemyName:'A&O',
    // A rescue INFILTRATION: you bring NO economy and NO funding — only Nino and your carried career
    // veterans (their time to shine) muster at the entrance and punch down a long walled corridor of
    // standing guard squads (cfg.guards) to the cell at the map's heart. Free BIBA (a captive HERO,
    // cfg.captives) and the intern caged with her, reclaim the forward outpost just past the cell
    // (lostBases), and only THEN bootstrap an economy off the arena gold to liquidate the three A&O
    // campuses below. Career units carry like any map; the always-on vetScaling (js/balance.js)
    // musters proportionate extra base defenders for the power you bring, so no hand-rebalance here.
    aggression:1.5,
    startGold:0, startWorkers:0, startSoldiers:0, startBarracks:false,   // infiltration: no funding, no workers, no factory — just the crew
    graceTime:130, waveTimer:120,
    crawl:{ episode:'EPISODE X', title:'THE ACQUIHIRE',
      text:'The proof of concept works on paper and nowhere else. A blueprint is not a mind, and no one left on your payroll can bridge the gap.\n\nNino found the one who can. Her name is BIBA — the engineer who first dreamed the GRAAL, before A&O folded her lab into a portfolio and folded her into a cell. They do not want her working. They want her retained.\n\nA&O calls the place an office. It runs for miles — open plan, no doors that open from your side, talent filed in rows. The line to the people inside went silent long ago.\n\nThis time Nino does not walk in alone — but he walks in light. No funding, no factory, no campus at your back: only the names you carried this far, the survivors of every quarter since the crater. Reach the center, get Biba and the intern out, seize the outpost beyond the cell, and liquidate the three campuses between you and the way back.\n\nThere is no exit interview. Only an exit....' },
    w:90, h:270,
    seed:10,
    player:{ x:45, y:10 },
    // the inside of A&O: an endless dark server-farm/office — pure tech, coolant pools in the margins,
    // no growing thing. Hand-placed rock walls (rockClusters) flank a central lane to read as a
    // prison corridor; the lower third is left open as the arena.
    terrain:{ biomes:['tech'], seaFrac:0.10, mtnFrac:0.08, forest:0 },
    // Nino leads the break-in. Listed here (not just carried) so he is guaranteed present even when
    // Episode X is entered from the map-select menu; the carryover dedups by name if he also carries.
    heroes:[ { name:'Nino', type:'lobbyist', sprite:'nino', level:11, dossier:{
      first:'Nino', last:'',
      home:'the Glitch Sprawl',
      family:'the first team — every name he hired, now on the memorial wall',
      trauma:'being three streets out when the campus became a column of light',
      dream:'to see one thing he helped build outlast the money that funded it',
      crime:'authoring the laws that made a hundred rivals simply vanish',
    } } ],
    // BIBA — caged at the map's heart with a captive intern. Freed when every enemy unit inside her
    // cell's freeRadius is dead (freeCaptives, core.js); on release she becomes a Level-10 Recruiter
    // HERO and joins the hero carryover, persisting like Nino. The intern rejoins your workforce.
    captives:[
      { x:44, y:130, type:'recruiter', hero:true, name:'Biba', sprite:'biba', level:10, freeRadius:14,
        dossier:{ first:'Biba', home:'the flooded arcologies of Lagos-2',
          family:'raised six younger siblings on relief credits',
          trauma:'watched her first squad triaged out of existence by an algorithm',
          dream:'to keep one team alive long enough to age',
          crime:'designing the chip A&O now kills to keep' } },
      { x:48, y:130, type:'worker', freeRadius:12 },
    ],
    // standing guard squads of 3–4 (cfg.guards): four down the corridor, three ringing the cell.
    // They hold their posts (ai.js excludes `guard` units from waves) and auto-engage on approach.
    guards:[
      // four corridor squads, spaced ~24 tiles apart so they pull one group at a time
      { x:45, y:36, n:3 }, { x:45, y:60, n:3 }, { x:45, y:84, n:3 }, { x:45, y:106, n:3 },
      // the cell ring — staged north→south (y120/132/140) so the climax isn't a single 9-unit alpha-strike
      { x:44, y:120, n:3 }, { x:40, y:132, n:3 }, { x:49, y:140, n:3 },
    ],
    // the abandoned A&O outpost just past the cell — reclaim it (walk a unit up) for a forward HQ to
    // build the army that cracks the arena. Your start HQ is 120 tiles north, so this is your real base.
    lostBases:[ { x:45, y:150 } ],
    enemies:[ {x:20,y:225, defenders:3}, {x:45,y:255, extraBarracks:true, defenders:4}, {x:70,y:225, defenders:3} ],
    objective:'A&O has caged the GRAAL\'s architect, BIBA, in its prison-office. Punch down the corridor, free Biba and the intern held with her, reclaim the forward outpost, then liquidate all THREE A&O campuses.',
    // rock walls flanking the central lane (x≈38–52) → a guided corridor; left wall x34, right wall x56
    rockClusters:[ {x:34,y:26,n:16},{x:34,y:44,n:16},{x:34,y:62,n:16},{x:34,y:80,n:16},{x:34,y:98,n:16},{x:34,y:116,n:16},
                   {x:56,y:26,n:16},{x:56,y:44,n:16},{x:56,y:62,n:16},{x:56,y:80,n:16},{x:56,y:98,n:16},{x:56,y:116,n:16},
                   {x:30,y:200,n:12},{x:60,y:200,n:12} ],
    // coolant pools in the side margins (don't block the lane) + a couple in the arena
    lakes:[ {x:18,y:55,r:6},{x:72,y:45,r:6},{x:16,y:104,r:6},{x:74,y:90,r:6} ],
    goldNodes:[ {x:43,y:6,amt:1800},{x:48,y:7,amt:1800},
                {x:45,y:154,amt:2600},{x:38,y:166,amt:1800},{x:52,y:166,amt:1800},
                {x:18,y:222,amt:1800},{x:24,y:230,amt:1800},{x:45,y:250,amt:2200},{x:66,y:230,amt:1800},{x:72,y:222,amt:1800} ],
  },
  {
    name:'XI — The Launch',
    enemyName:'A&O',
    // The pilgrimage to the altar. A normal economy map again (you build and assault, unlike the Ep X
    // infiltration) but the longest march yet: a guided central road walled by tech-server rock ranges
    // and coolant seas, down through six A&O campuses to the dark tower on a peninsula at the sea's
    // edge. The carried roster + Nino/Biba arrive by CARRYOVER only (no cfg.heroes here — dead heroes
    // stay dead, matching the contextual crawl). Career units are the spearhead again; the always-on
    // vetScaling (js/balance.js) musters proportionate base defenders for the power you bring.
    aggression:1.6,
    startGold:1100, startWorkers:7, startSoldiers:5, startBarracks:true,
    graceTime:120, waveTimer:116,
    crawl:{ episode:'EPISODE XI', title:'THE LAUNCH',
      text:'Biba is free and the blueprint is yours, but a blueprint is not a factory. A&O has the only one that works, The DARK TOWER.\n\nThe altar stands at the top of A&O\'s peninsula: a black spire on a spit of land in a coolant sea, where the GRAAL writes the dying into fresh metal and the dead into product. The keynote is scheduled; the line to the people who live inside went quiet long ago.\n\n{?party}The pilgrimage walks in with you: {party} — the survivors of every battle since the crater, here to take the thing that was built to take them.{/party}{^party}You walk the road alone. Everyone who carried you this far went on ahead, into the ground.{/party}{?fallen} You carry the wall with you too — {fallen} — names A&O filed as churn, the reason you march toward the altar instead of away from it.{/fallen}{?biba} Biba says the chip cannot tell salvation from theft. She solders anyway.{/biba}\n\nFight down the guided road, liquidate all SIX A&O campuses between you and the sea, and seize the dark tower at the peninsula\'s end. Steal the GRAAL before they ship it.\n\n It`s time to bring them back.' },
    w:96, h:156,
    seed:11,
    player:{ x:48, y:8 },
    // the inside of A&O at last: an endless black server-farm, coolant seas in the margins, no growing
    // thing — pure tech. Hand-placed rock ranges wall a central road; the southern third is mostly sea
    // around the tower's peninsula.
    terrain:{ biomes:['tech'], seaFrac:0.12, mtnFrac:0.08, forest:0 },
    enemies:[
      {x:30,y:38, defenders:3},                          // left gateway campus
      {x:66,y:38, defenders:3},                          // right gateway campus
      {x:48,y:66, extraBarracks:true, defenders:4},      // central chokepoint on the road
      {x:20,y:92, defenders:3},                          // the mountain-ringed campus (rock chains)
      {x:48,y:112, defenders:4},                         // neck guardian — gates the peninsula
      {x:48,y:140, extraBarracks:true, defenders:6},     // THE DARK TOWER — the GRAAL altar, on the peninsula
    ],
    objective:'A&O is building the GRAAL on Dark Tower altar. Fight the road and liquidate all SIX A&O Labs — At the peninsula, raze the Dark Tower to create the GRAAL.',
    // a guided central lane (x~40–56): rock ranges flank it left (x~28–30) and right (x~64–66), funneling
    // the player down through the campuses toward the sea. A separate ring of mountains girds campus #4.
    rockClusters:[
      {x:28,y:30,n:14},{x:28,y:52,n:14},{x:30,y:74,n:14},{x:30,y:104,n:14},
      {x:66,y:30,n:14},{x:66,y:52,n:14},{x:64,y:74,n:14},{x:64,y:104,n:14},
      // chains of mountains ringing the fourth campus (20,92) — left open on its road-facing (east) side
      {x:12,y:84,n:16},{x:12,y:100,n:16},{x:20,y:78,n:14},{x:20,y:106,n:14},{x:28,y:88,n:12},
    ],
    // coolant seas: side pools down the road, then a broad southern sea leaving the tower on a peninsula
    // joined to the road by a single land neck (x~44–52, y~120–138).
    lakes:[
      {x:10,y:54,r:5},{x:86,y:54,r:5},{x:12,y:118,r:6},{x:84,y:118,r:6},
      {x:24,y:140,r:7},{x:72,y:140,r:7},{x:38,y:150,r:5},{x:58,y:150,r:5},{x:48,y:152,r:5},
    ],
    goldNodes:[
      {x:44,y:5,amt:2600},{x:50,y:6,amt:2400},{x:42,y:11,amt:2200},        // player start cluster (north)
      {x:30,y:34,amt:1800},{x:66,y:34,amt:1800},                            // gateways
      {x:48,y:58,amt:3000},{x:24,y:64,amt:1800},{x:72,y:64,amt:1800},       // mid contested
      {x:18,y:96,amt:2200},                                                 // mountain campus
      {x:52,y:108,amt:1800},{x:40,y:116,amt:1800},                          // neck approach
      {x:48,y:134,amt:3500},{x:42,y:144,amt:2000},{x:54,y:144,amt:2000},    // the altar prize (peninsula)
    ],
  },
  {name:'XII — The Continuity Farm',enemyName:'A&O',aggression:2.00,startGold:3600,startWorkers:12,startSoldiers:12,startBarracks:true,graceTime:118,waveTimer:112,crawl:{episode:'EPISODE XII',title:'THE CONTINUITY FARM',text:'You rebuilt after the flash, but the new company was never alive. It was a cap table wearing a grief mask.\n\nA&O now leases the dead into refrigerated prototype bodies, charging subscription fees for memories that used to belong to people. Their Continuity Farm hums under black ice and server heat, promising immortality with a cancellation clause.\n\nYour veterans carry names. Your memorial carries more. Crack the farm, steal the transfer lattice, and decide which ghost gets equity again....'},objective:'A&O holds SIX continuity campuses — liquidate all six and seize the transfer lattice.',w:118,h:96,seed:12012,terrain:{biomes:['tech','ice'],temp:{axis:'diag',base:0.26,gradient:0.18,noise:0.14},freeze:0.24,seaFrac:0.14,mtnFrac:0.08,forest:0,beach:true},player:{x:8,y:88},enemies:[{x:106,y:8,defenders:7,extraBarracks:true},{x:106,y:84,defenders:7,extraBarracks:true},{x:58,y:10,defenders:6,extraBarracks:true},{x:62,y:84,defenders:6},{x:92,y:48,defenders:7,extraBarracks:true},{x:34,y:28,defenders:5}],goldNodes:[{x:6,y:90,amt:3600},{x:13,y:88,amt:3200},{x:9,y:80,amt:2800},{x:22,y:82,amt:2400},{x:55,y:52,amt:4200},{x:42,y:44,amt:3000},{x:76,y:42,amt:3000},{x:96,y:54,amt:2500},{x:110,y:12,amt:1900},{x:110,y:82,amt:1900},{x:58,y:6,amt:1900},{x:64,y:90,amt:1900}],lakes:[{x:56,y:48,r:7},{x:86,y:26,r:5},{x:30,y:66,r:4},{x:74,y:72,r:4}],rockClusters:[{x:48,y:25,n:18},{x:70,y:30,n:16},{x:88,y:62,n:18},{x:24,y:48,n:14},{x:60,y:68,n:16}],forests:[],thickets:[{x:38,y:34,w:22,h:14,density:0.72,mix:0.25,trail:'h'},{x:80,y:34,w:18,h:18,density:0.66,mix:0.15,trail:'v'}]}
];
