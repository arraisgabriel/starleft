/* config.js — constants & data: TILE, canvas refs, terrain/biome, DEF (unit/building stats), MAPS. Loaded FIRST. | STARLEFT (classic scripts) */
/* =====================================================================
   STARLEFT — single-file mini RTS
   ===================================================================== */
const TILE = 32;
const ASSIST_BUILD_RATE = 0.15;  // each Intern beyond the first adds +15% build speed
const DEMOLISH_REFUND = 0.8;     // demolishing a building salvages 80% of the funding paid for it
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


/* ---- Per-turret paid upgrades: select a finished Legal Team to buy (once each per turret) ---- */
const TURRET_UPGRADES = {
  firerate: { name:'Expedited Filings', icon:'⚡', cost:75, rateMult:1.7, field:'upgFirerate', hint:'+70% fire rate' },
  damage:   { name:'Punitive Damages',  icon:'💥', cost:75, dmgMult:1.35, field:'upgDamage',   hint:'+35% fire damage' },
};

/* ---- Market Research survey (the `intel` tower's map scan) ----
   time: scan duration (s); clusterR: buildings within this many tiles group as one "campus";
   seenR: cluster members within this radius of the representative get revealed (the PARTIAL slice);
   revealR: explored-terrain patch radius around each revealed building. */
const INTEL_SCAN = { time:20, clusterR:12, seenR:4, revealR:5 };

/* ---- Unit / building definitions (startup-vs-monopoly satire) ---- */
const DEF = {
  hq:       { name:'Open-Plan HQ', icon:'🏢', kind:'building', w:4,h:3, hp:3000, cost:0,   build:35,  sight:7, supply:24, color:'#3b7fd0',
              dmg:8, range:7.5, cd:1.6, flavor:'Stores Funding and onboards unpaid Interns. Fires the occasional warning shot from the rooftop.' },
  barracks: { name:'People Ops',   icon:'🎯', kind:'building', w:3,h:3, hp:900,  cost:150, build:20,  sight:5, supply:0,  color:'#5a6b8a',
              flavor:'"Recruiting" department. Turns Funding into Growth Cyborgs and Consultants.' },
  turret:   { name:'Legal Team',   icon:'⚖️', kind:'building', w:2,h:2, hp:550,  cost:100, build:14,  sight:7, supply:0,  color:'#7a8aa8',
              dmg:14, range:8.625, cd:0.7,   // 15% beyond the longest base unit range (lobbyist 7.5); sieged Auditor (9) still out-ranges it
              flavor:'Fires cease-and-desist letters at anything that trespasses on your IP.' },
  intel:    { name:'Market Research', icon:'🕵️', kind:'building', w:1,h:1, hp:600, cost:1999, build:30, sight:7, supply:0, color:'#8a5aa8',
              flavor:'Runs one "totally anonymous" industry survey and publishes every rival campus it can triangulate — well, the parts Legal would sign off on. Yes, that\'s a Legal Team bolted to the roof: it has never fired a shot, but the consent forms practically notarize themselves.' },
  outpost:  { name:'Satellite Office', icon:'📡', kind:'building', w:3,h:3, hp:650, cost:175, build:16, sight:5, supply:8, color:'#5a6b8a',
              deposit:true, flavor:'A scrappy forward branch — Interns deposit here instead of trekking back to HQ, and it houses +8 Headcount. The mid-game expansion pivot: cheaper and flimsier than a second HQ.' },   // T2-5: supply makes the forward branch a real tradeoff (deposit point + headcount, no passive income)
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
  psychologist:{ name:'Mindfulness Facilitator', icon:'🛋️', kind:'unit', hp:90, cost:1000, build:40, sight:6, supply:2, speed:2.2, dmg:0, range:4.0, cd:1.0, r:9, action:'heal',
              madHeal:true, flavor:'Company psychologist. Channels TEMPORARY calm into one frayed mind at a time — a field stopgap that wears off (and is lost the moment they\'re extracted). Never a real cure, and can\'t fight.' },
  hustler:  { name:'Hustler', icon:'🛹', kind:'unit', hp:70, cost:70, build:11, sight:7, supply:1, speed:3.5, dmg:10, range:1.6, cd:0.7, r:9,
              splash:14, splashR:1.2, flavor:'Moves fast and breaks things. Cheap, fast, harasses your economy.' },
  lobbyist: { name:'Lobbyist', icon:'🎩', kind:'unit', hp:70, cost:196, build:20, sight:9, supply:2, speed:2.2, dmg:36, range:7.5, cd:2.3, r:9,
              pierce:true,   // T2-4: regulation ignores armor — the counter to vehicles/mechs
              flavor:'Buys senators wholesale. One devastating armor-piercing shot, then a long reload.' },
  /* ---- The Garage (Factory) tier ---- */
  foodtruck:{ name:'Food Truck', icon:'🚚', kind:'unit', hp:110, cost:90, build:15, sight:6, supply:2, speed:3.6, dmg:11, range:3.0, cd:1.0, r:11, vehicle:true,
              splash:9, splashR:1.4, flavor:'Free cold brew & napalm. A flame cone shreds clustered enemies.' },
  auditor:  { name:'Auditor', icon:'📊', kind:'unit', hp:200, cost:175, build:28, sight:8, supply:3, speed:1.8, dmg:18, range:5.0, cd:1.4, r:12, vehicle:true, antiAir:true,
              armor:0.25, pierce:true,   // T2-4: armored chassis; the due-diligence cannon punches through armor
              siege:{dmg:42,range:9,splashR:1.6,setup:1.2}, flavor:'Deploys spreadsheets into a long-range due-diligence cannon. Sieges when enemies are near.' },
  /* ---- Launch Pad (Starport) tier ---- */
  founder:  { name:'Founder Mech', icon:'🦄', kind:'unit', hp:600, cost:599, build:45, sight:8, supply:6, speed:1.6, dmg:45, range:3.5, cd:1.5, r:16, vehicle:true,
              armor:0.30,   // T2-4: exosuit plating shrugs off small-arms — bring piercing
              splash:20, splashR:1.3, antiAir:true, flavor:'A visionary in a 12-ft exosuit. Armored; hits anything, ground or air.' },
  courier:  { name:'Drugztore Delivery Drone', icon:'🛸', kind:'unit', hp:120, cost:90, build:16, sight:7, supply:2, speed:3.0, dmg:0, range:4.0, cd:1.0, r:10, air:true, action:'heal',
              heal:7, flavor:'Same-day delivery of medkits and morale. Flies over everything.' },
  bomber:   { name:'Buzzword Bomber', icon:'🛩️', kind:'unit', hp:480, cost:630, build:50, sight:9, supply:6, speed:1.7, dmg:26, range:6.0, cd:0.9, r:16, air:true, antiAir:true, facesLeft:true,
              armor:0.20,   // T2-4: armored hull
              flavor:'Capital airship. Rains cyan ordnance on the campus below.' },

  /* ---- production buildings ---- */
  garage:   { name:'The Garage', icon:'🔧', kind:'building', w:3,h:3, hp:1000, cost:200, build:24, sight:4, supply:0, color:'#4a6b5a',
              flavor:'Vehicle bay. Turns Funding into Food Trucks, Auditors and Founder Mechs.' },
  launchpad:{ name:'Launch Pad', icon:'🚀', kind:'building', w:3,h:3, hp:850,  cost:250, build:28, sight:5, supply:0, color:'#5a6b8a',
              flavor:'Starport. Assembles Drugztore Delivery Drones and Buzzword Bombers. Requires a Garage.' },
  /* ---- A&O's Dark Tower (indestructible scenery landmark; spawned via cfg.scenery as a neutral prop —
     never buildable, never a combat target). The giant look comes from BUILDING_TYPE_SCALE in assets.js;
     w/h here is only the collision footprint so units route around its base. ---- */
  darktower:{ name:'The Dark Tower', icon:'🗼', kind:'building', w:6,h:5, hp:1, cost:0, build:1, sight:9, supply:0, color:'#0c0a12',
              // The drawn sprite is ~17×42 tiles (BUILDING_TYPE_SCALE) but w/h above is only the tiny ground rect that
              // drives the DRAW anchor + holdout anchor — leaving it untouched keeps both identical. `collide` is the
              // SOLID lower-fort footprint, decoupled from draw and stamped by markBuilding so units route AROUND the
              // visible stone base. Tiles are [dyFromTy,dxMin,dxMax] relative to the footprint top-left; dy<0 = ABOVE
              // the footprint top (the base flares up-and-out from the ground rect). The fort is a SOLID block with a
              // FLAT front (no inward taper) column-filled down to the footprint-bottom row (dy=+4): because the whole
              // tower is one bottom-anchored sprite at a single depth, any walkable tile UNDER the drawn stone (sorting
              // behind it) shows a unit half-occluded ("legs sticking out"). Filling the front/sides to the base line
              // forces units to stand SOUTH of the fort (sort on top → fully visible), BESIDE it (no stone above), or
              // BEHIND the thin upper spire (dy<=-10, left passable → fully occluded walk-behind). Derived from alpha.
              collide:[ [-9,-2,7],[-8,-2,7],[-7,-2,7],[-6,-5,10],[-5,-5,10],
                        [-4,-6,11],[-3,-6,11],[-2,-6,11],[-1,-6,11],[0,-6,11],[1,-6,11],[2,-6,11],[3,-6,11],[4,-6,11] ],
              flavor:'A&O\'s black altar — the GRAAL writes the dying into fresh metal and the dead into product.' },
  /* ---- H.U.B.-only Training Grounds (level-cloning facility; never built in combat) ---- */
  training: { name:'Training Grounds', icon:'🎯', kind:'building', w:28,h:22, hp:4000, cost:0, build:1, sight:8, supply:0, color:'#5a6b8a',
              flavor:'A neon shooting academy. Lock a veteran mentor in with a junior of the same type — both walk out one level above the senior.' },
};

/* Which units each production building can hire — single source for the build
   menu's placement preview (info panel) so the player sees the roster before
   committing Funding. Keys mirror the train buttons in ui.js buildCommands. */
const BUILD_HIRES = {
  hq:        ['worker'],
  barracks:  ['soldier','ranger','recruiter','hustler','lobbyist','psychologist'],
  garage:    ['foodtruck','auditor','founder'],
  launchpad: ['courier','bomber'],
};

/* =====================================================================
   MADOSIS (madness / sanity) — see js/madosis.js for the runtime.
   A veteran's accumulated career trauma can break their mind mid-mission,
   turning them into a hostile "mad dog". All balance lives here so it's
   one-file tunable. Episode N = MAPS[N-1]; episodeNo = mapIndex + 1.
   ===================================================================== */
const MADOSIS = {
  // --- campaign gating (no episode before Episode 6, per design) ---
  accrueFromEpisode: 4,   // no madosis points accrue before Episode 4 (mapIndex>=3)
  firstEpisodeEpisode: 6, // no episode (breakdown) before Episode 6 (mapIndex>=5)
  // --- threshold (minted once at level 2, deterministic from lore seed) ---
  thresholdMin: 70, thresholdMax: 120,
  scarThresholdMul: 0.7,  // a scarred (previously-broken) unit breaks 30% sooner
  // --- heroes are far steadier of mind than the rank and file ---
  heroThresholdMul: 1.6,  // a hero's break point sits 60% higher
  heroAccrualMul: 0.5,    // and trauma weighs on a hero at half rate
  // --- legacy-save backfill: approximate a veteran's current madosis when a pre-madosis save loads.
  //     m = perStar·level + perEpisode·(campaign progress) + perFallen·(memorialized comrades)
  //         + perTrauma·(logged trauma life-events); halved for heroes; capped below the threshold so
  //     loading never instantly triggers an episode. Only applies from Episode `accrueFromEpisode`+. ---
  backfill: { perStar:4, perEpisode:6, perFallen:5, perTrauma:8, maxFrac:0.9 },
  // --- event point pool (extend by adding a key here + one madosisEvent(...) call) ---
  events: {
    vetDeath: 8,          // a fellow player veteran dies (awarded per surviving vet)
    heroDeath: 16,        // a named hero dies
    buildingLost: 4,      // a player building is destroyed
    hqLost: 12,           // a player HQ is destroyed
    traumaRelapse: 12,    // a req:'trauma' life-event re-fires on level-up
  },
  vetDeathRadius: 14,     // tiles; 0 = all surviving player vets on the map. >0 = only vets who
                          // SAW it (near the death) grieve — keeps one bad fight from breaking
                          // the whole roster. Headline knob to re-tune after playtests.
  decayPerSkip: 12,       // madosis removed per mission a unit sits out (HUB rest)
  onsetChancePerSec: 0.02,// once over threshold (Ep6+) in a mission, chance/sec to snap
  maxConcurrentEpisodes: 1, // at most this many units in madEpisode/madDog at once — a mission
                            // can have a madosis CRISIS, never a cascade
  episodeCooldown: 75,    // sec after an episode ends (rescued, killed, or lost) before the
                          // next onset roll may fire (state._madCalmUntil)
  // --- episode escalation (seconds) ---
  tremorDur: 8,           // warning phase: jitter + accuracy down, still obeys orders
  defianceDur: 10,        // progressively ignores orders, then -> feral
  defianceIgnore: [0.2, 1.0], // probability of ignoring a command, ramped over defiance
  tremorDmgMul: 0.7,      // shaky hands while breaking down (tremor/defiance) -> weaker shots
  feralDmgMul: 1.15,      // feral mad dogs hit a little harder
  // --- rescue (memory anchors) ---
  rescueRescuers: ['recruiter'],           // + any hero healer (Biba); gated by def.heal
  echoFacets: ['trauma','family','dream'], // the 3 dossier memories to recover
  echoDistBands: [30, 70, 120],            // tiles from the dog: trauma near / family mid / dream far —
                                           // far enough that collectors never enter the feral dog's reach
  echoBandMaxFrac: 0.45,                   // clamp: band = min(band, this × map diagonal)
  echoMinDist: 12,                         // tiles — echoes never land closer to the dog than this
  echoReachRange: 1.6,                     // tiles any player unit must reach to trigger an echo
  rescueSpeedMul: 1.5,                     // healer move-speed multiplier while on the rescue command
  calmDmgFalloff: [1.0, 0.66, 0.33, 0.0],  // dog dmg multiplier at 0/1/2/3 echoes recovered
  rescueTimeLimit: 0,                      // 0 = no limit; >0 sec = echoes fade -> rescue fails
  // --- rescue survivability (a guarded escort, not a suicide run) ---
  rescuerDmgTakenMul: 0.12,                // a healer mid-rescue takes only this fraction of incoming damage
  rescuerShield: 60,                       // one-time absorb pool granted to the healer when the rescue begins
  dogPlayerDmgMul: 0.12,                   // damage the in-rescue dog takes from the PLAYER's own units (so a clumsy guarding squad can't frag the unit being saved); enemies hurt it normally
  // --- HUB Mental Health Facility (madosis healing — panel + session) ---
  heal: { baseCost:200, costPerStar:24 }, // cost = base + perStar·stars; a completed mission treatment FULLY clears madosis (to 0)
  healCap: 6,             // max units in the facility at once (mirrors HUB.trainPairCap)
  // --- field relief (Mindfulness Facilitator unit): a TEMPORARY in-mission madosis suppression. The unit
  //     channels on ONE ally at a time, lowering its EFFECTIVE madosis by `ratePerTick` of the value-at-
  //     engagement-start every `tickSec`, up to `frac` of it (0.55 → suppress up to ~55%, reached in ~11s
  //     at 5%/s — visibly drops the bar within a few seconds). While the facilitator keeps tending, the
  //     suppression holds; once it STOPS, the suppressed madosis REVERTS SLOWLY toward the true value at
  //     `decayPerSec` (0.2 = 1 point every 5s) — a calmed mind drifts back instead of snapping back, so a
  //     short stretch of calm is still worth buying. `durationSec` is the auto-acquire skip window (how long
  //     before the facilitator will re-tend the same ally). It is a read-time subtraction kept SEPARATE from
  //     the true madosis stat (u.madRelief/madReliefT), so it is LOST on extraction to the HUB (hubSnapUnit
  //     captures only the true madosis) and is never a permanent cure. ---
  fieldRelief: { frac:0.55, ratePerTick:0.05, tickSec:1, durationSec:30, decayPerSec:0.2 },
  // --- accelerated treatment: pay M3$ to recover madosis on the HUB CITY clock, no mission needed. Each
  //     purchase recovers `points` madosis over `minutes` IN-GAME (city) minutes for `merits` M3$ (rate =
  //     merits/points per point, so a partial last chunk is charged fairly). "In-game minute" = the 🕘 HUB
  //     time-of-day clock (hub_npcs.js, a city day ≈ 420 real sec), which flies — so 10 in-game minutes is
  //     ≈3 real seconds, NOT 10 real minutes. The clock only advances IN THE HUB, so recovery pauses on
  //     missions. State lives on the healing snapshot (auto-serialized). ---
  accel: { merits:100, points:10, minutes:10 },
};

/* ---- T4-2: difficulty selector — one multiplier wherever the knobs already live.
   Persisted in localStorage; stamped onto state._difficulty at map load so co-op/rollback
   peers share the HOST's choice (sim-side reads go through diffOf(state)). ---- */
const DIFFICULTY = {
  boot: { name:'Bootstrap', desc:'forgiving \u2014 longer grace, gentler waves', aggr:0.8,  grace:1.4,  mint:1.25, vetCap:0, score:0.8 },
  a:    { name:'Series A',  desc:'the intended campaign',                        aggr:1.0,  grace:1.0,  mint:1.0,  vetCap:0, score:1.0 },
  uni:  { name:'Unicorn',   desc:'hard \u2014 faster, denser, less grace',      aggr:1.25, grace:0.7,  mint:0.85, vetCap:1, score:1.25 },
  burn: { name:'Burn Rate', desc:'brutal \u2014 no mercy, no grace',            aggr:1.5,  grace:0.45, mint:0.7,  vetCap:2, score:1.5 },
};
function difficultyKey(){ try{ const k=localStorage.getItem('starleft_difficulty'); return DIFFICULTY[k]?k:'a'; }catch(_){ return 'a'; } }
function setDifficultyKey(k){ try{ if(DIFFICULTY[k]) localStorage.setItem('starleft_difficulty', k); }catch(_){} }
// sim-side read: ALWAYS from the state stamp (set in newMap), so all peers agree
function diffOf(state){ return DIFFICULTY[(state && state._difficulty)||'a'] || DIFFICULTY.a; }

/* ---- T2-5: macro-tension economy knobs (applied in map.js newMap) ----
   Home-cluster funding is cut so it funds roughly ONE army cycle — expanding to the contested
   mid-map nodes (or a Satellite Office branch) becomes the real macro decision. A high-value
   contested node is auto-placed at the player↔enemy midpoint on maps that lack one. */
const ECON = {
  homeNodeMul: 0.55,      // home-cluster node amounts × this (nodes within homeBand of the start)
  homeBand: 16,           // unscaled tiles from the player start that count as "home"
  contestedAmt: 3600,     // the auto-placed no-man's-land node's funding
  contestedMinDist: 18,   // a node ≥ this far (unscaled tiles) from BOTH starts counts as contested
};

// Kennel death-squad: spawned when a mad dog is rescued, sized to the DOG itself — certain death
// for an isolated dog, a real skirmish for a small escort, never a threat to the assembled army.
const KENNEL = {
  size: 10,
  dogPowerMul: 2.2,       // total squad power ≈ this × the rescued dog's own combat power
  maxStars: 20,           // hard per-unit level cap (never an unwinnable wall)
  repathSec: 1.5,         // pursuit cadence — the squad re-tracks the dog wherever it runs
  comp: ['soldier','soldier','ranger','ranger','lobbyist',
         'hustler','auditor','recruiter','soldier','ranger'], // incl. an anti-healer threat
};

/* MAP DEFINITIONS (`const MAPS = [...]`) moved to js/maps_data.js (loaded right after this file).
   Editing maps in isolation lets the map editor rewrite that file without touching engine code. */

