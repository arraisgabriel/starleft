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
              deposit:true, trickle:3.5, flavor:'A scrappy forward branch — Interns deposit here, its rig auto-extracts Funding, and it houses +8 Headcount. The mid-game expansion pivot: cheaper and flimsier than a second HQ.' },   // T2-5: supply + fatter trickle make the forward branch a real tradeoff
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
  barracks:  ['soldier','ranger','recruiter','hustler','lobbyist'],
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
  heal: { baseCost:200, costPerStar:24, fracOfMax:0.70 }, // cost = base + perStar·stars; heals up to fracOfMax·sanityThreshold over one mission
  healCap: 6,             // max units in the facility at once (mirrors HUB.trainPairCap)
  // --- accelerated treatment: pay M3$ to recover madosis on the HUB clock, no mission needed. Each
  //     purchase recovers `points` madosis over `minutes` IN-GAME minutes for `merits` M3$ (rate =
  //     merits/points per point, so a partial last chunk is charged fairly). "In-game minute" is the
  //     Training-Grounds time scale (HUB.trainHourSeconds/60 real sec); the clock advances in the HUB
  //     AND missions like Training/The Wake. State lives on the healing snapshot (auto-serialized). ---
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

/* =====================================================================
   MAP DEFINITIONS
   Grace-time guideline (T2-9, documented so new maps stay on the curve):
     graceTime ≈ 60 + diag, where diag = √(w² + h²) in UNSCALED tiles —
     bigger maps earn proportionally more peace. Quarter I doubles it
     (tutorial), infiltration maps (no economy) add ~+20, boss arenas
     ignore it. waveTimer tracks graceTime − ~5s.
   Optional pressure knobs: `enemyAir:true` lets the rival also field
   Buzzword Bombers after grace (requires anti-air to answer — T2-6);
   `events:[{atTime,…}]` are scripted beats (T2-8, core.js runMapEvent);
   `winCondition:{type:'survive'|'escort'|'reachAndHold',…}` (T2-1).
   `objective` shows in the top bar at every viewport size — keep it
   ≤ ~220 chars so it stays ≤2 wrapped lines on short/landscape screens.
   `quests:[{id,text,type,required,reward,…}]` — multi-objective quest
   list (js/quests.js). With quests present, VICTORY = all `required`
   quests done (or one `winsAlone` quest); without, the legacy chain
   (villain / winCondition / razeAll) applies untouched. Bonus quests
   (no `required`) pay `reward` M3$ via hubRewardFor. AUTHORING RULES:
   required quests must be derivable from serialized state (razeAll /
   defeatVillain / survive / escort / reachAndHold only — never
   trainUnits or unique-unit-dependent types, which can softlock);
   survive/escort/reachAndHold quests read their params from the map's
   `winCondition` (keep it). `objective` stays as the legacy-mode /
   fallback text. Quest ids are save-keys — never rename on a shipped map.
   ===================================================================== */
const MAPS = [
  {
    name:'I — The Garage',
    enemyName:'DISRUPTR INC.',
    crawl:{ episode:'EPISODE I', title:'THE MINIMUM VIABLE PRODUCT',
      text:`It is a period of disruption. Armed with a slick pitch deck and exactly zero revenue, a plucky STARTUP sets out to MOVE FAST and BREAK THINGS.

Fueled by Venture Funding and free cold brew, your unpaid INTERNS must mine Funding, scale the team, and bury the rival startup DISRUPTR INC. before the runway runs out.

The board is watching. Synergy awaits....`,
      summary:`Zero revenue, one slick pitch deck, and a runway measured in weeks. Mine Funding, scale your unpaid interns, and bury the rival startup DISRUPTR INC. before the cold brew runs dry. Move fast. Break things.` },
    w:48, h:40,
    seed:1,
    player:{ x:5, y:33 },
    // a green starting valley — lush temperate grassland, gentle water & low hills
    terrain:{ biomes:['grass'], seaFrac:0.08, mtnFrac:0.07, moist:{base:0.62,noise:0.45}, forest:0.10 },
    aggression:1.0,
    // tutorial map: long peace so new players can learn the mechanics without dying —
    // no enemy waves invade the base until ~3 minutes in.
    graceTime:180, waveTimer:180,
    // fight-first onboarding (T0-1): start with a small squad and a weak DISRUPTR forward
    // outpost (one structure, one guard) a short march away — first blood inside a minute.
    startSoldiers:3,
    enemies:[ {x:13,y:27, defenders:1, light:true}, {x:40,y:6, defenders:2}, {x:30,y:24, defenders:2} ],
    objective:'DISRUPTR INC. parked a forward outpost on your lawn. Crush it, then raze their two bases — three positions in all.',
    quests:[
      { id:'raze',     text:'Raze all three DISRUPTR positions',  type:'razeAll', required:true },
      { id:'hire6',    text:'Hire six Growth Cyborgs',            type:'trainUnits', unit:'soldier', count:6, reward:50 },
      { id:'firstvet', text:'Promote your first veteran',         type:'promotions', count:1, reward:50 },
    ],
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

DISRUPTR is ash, and your win did not go unnoticed. Across the Silicon Wastes sprawls MEGACORP — a bloated incumbent with infinite cash, two HR departments, and a litigation army that has decided a unicorn is just a horse worth hunting.

Weaponize your buzzwords, circle back, and disrupt MegaCorp into bankruptcy. There is no exit strategy but victory....`,
      summary:`You've gone unicorn — wildly overvalued and out of patience. Across the Silicon Wastes sprawls MEGACORP: a bloated incumbent with infinite cash and a litigation army. Weaponize the buzzwords and disrupt them into bankruptcy. There's no exit but victory.` },
    w:54, h:46,
    seed:2,
    player:{ x:6, y:6 },
    // the Silicon WASTES — hot arid desert with dry-grass pockets, rocky, little water
    terrain:{ biomes:['desert','grass'], temp:{base:0.74,noise:0.18}, hot:0.6, dry:0.65, moist:{base:0.42,noise:0.5}, seaFrac:0.05, mtnFrac:0.12, forest:0.02 },
    aggression:1.5,
    enemies:[ {x:44,y:38, extraBarracks:true, defenders:4}, {x:46,y:12, defenders:3} ],
    objective:'MEGACORP now holds TWO campuses (SE and E). Raze both and acquire their assets by force.',
    quests:[
      { id:'raze',  text:'Raze both MEGACORP campuses',           type:'razeAll', required:true },
      { id:'scale', text:'Scale to 15 headcount',                 type:'peakSupply', count:15, reward:50 },
      { id:'fast',  text:'Close the takeover inside 12 minutes',  type:'winBy', by:720, reward:75 },
    ],
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
      text:'Your war chest is overflowing and the press calls you a "category leader" — so the two rivals you bankrupted last quarter did the math and merged.\n\nYour own wreckage, refinanced and rebranded SYNERGY CORP: a hydra of campuses, double the middle managers, one synergy mandate. The board wired you extra Funding to finish what you started.\n\nMine fast, scale faster, and liquidate every campus before the all-hands. The board calls it consolidation. You call it target practice.',
      summary:`The press calls you a category leader — so your two biggest rivals merged to take you out. SYNERGY CORP is a hydra: three campuses, double the middle managers, one synergy mandate. The board wired extra Funding. Mine fast and bankrupt every campus before the all-hands.` },
    w:64, h:54,
    seed:3,
    player:{ x:6, y:46 },
    // flooded merger ground — a lake-laced temperate grassland, few hills
    terrain:{ biomes:['grass'], seaFrac:0.20, mtnFrac:0.06, moist:{base:0.60,noise:0.5}, forest:0.08 },
    enemies:[ {x:54,y:8, extraBarracks:true, defenders:3}, {x:50,y:46, defenders:3}, {x:40,y:24, extraBarracks:true, defenders:3} ],
    objective:'SYNERGY CORP has THREE campuses — liquidate all three. You start with extra Funding and a People Ops to fund the takeover.',
    quests:[
      { id:'raze',  text:'Liquidate all three SYNERGY CORP campuses',         type:'razeAll', required:true },
      { id:'mine',  text:'Out-earn the board\'s wire — mine 8,000 Funding',   type:'accumulateFunding', amount:8000, reward:75 },
      { id:'churn', text:'Keep attrition under 10 hires',                     type:'maxUnitsLost', count:9, reward:75 },
    ],
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
      text:'You are no longer a startup. You are a threat — and you are starting to look like what you fight.\n\nOMNICORP owns the cloud, the ads, and the antitrust lawyers, and it lit up every headquarters it controls to crush you for good.\n\nThis is the exit. Burn it down and the market is yours. The only question left is whether there is a difference between you anymore. Go public, or go home.',
      summary:`You're not a startup anymore — you're a threat. OMNICORP owns the cloud, the ads, and the antitrust lawyers, and it just lit up its headquarters to crush you for good. Raze every OMNICORP HQ and the market is yours. Go public, or go home.` },
    w:72, h:60,
    seed:4,
    player:{ x:7, y:7 },
    // OMNICORP owns the cloud — a vast dark server-farm foundation with coolant pools
    terrain:{ biomes:['tech'], seaFrac:0.13, mtnFrac:0.08, forest:0 },
    enemies:[ {x:62,y:50, extraBarracks:true, defenders:4}, {x:60,y:12, extraBarracks:true, defenders:4}, {x:36,y:48, extraBarracks:true, defenders:4} ],
    objective:'OMNICORP has THREE HQs — raze all three. You are very well-funded; overwhelm them.',
    quests:[
      { id:'raze',  text:'Raze all three OMNICORP HQs',           type:'razeAll', required:true },
      { id:'kills', text:'Liquidate 60 OMNICORP personnel',       type:'killUnits', count:60, reward:75 },
      { id:'org',   text:'Run a 20-seat org chart',               type:'peakSupply', count:20, reward:75 },
    ],
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
      text:'You won. You are the monopoly. And monopolies make enemies — you made these yourself.\n\nThe companies you broke have been comparing scars, and this quarter they pooled their severance into one coalition with a single line item: disrupt the disruptor. You did not just make money. You made THE CARTEL.\n\nThe board tripled your war chest — it would rather you win than wonder why it is so eager. Field an overwhelming army and liquidate every campus, one quarterly review at a time.',
      summary:`You won — you're the monopoly, and monopolies make enemies. Your bankrupt victims pooled their severance into THE CARTEL, a coalition sworn to disrupt the disruptor. The board tripled your war chest; field an overwhelming army and liquidate every campus, one quarterly review at a time.` },
    w:80, h:66,
    seed:5,
    player:{ x:6, y:58 },
    // lawless scorched badlands — volcanic basalt with molten lava seas
    terrain:{ biomes:['volcanic'], seaFrac:0.10, mtnFrac:0.10, forest:0 },
    enemies:[ {x:68,y:10, extraBarracks:true, defenders:3}, {x:72,y:54, extraBarracks:true, defenders:3}, {x:34,y:8, defenders:3}, {x:46,y:36, extraBarracks:true, defenders:3} ],
    objective:'THE CARTEL holds FOUR campuses. Liquidate all four — clear them one at a time. You start very well-funded.',
    quests:[
      { id:'raze',  text:'Liquidate all four CARTEL campuses',        type:'razeAll', required:true },
      { id:'kills', text:'Send 100 CARTEL muscle to the lava line',   type:'killUnits', count:100, reward:100 },
      { id:'churn', text:'Keep the casualty memo under 15 names',     type:'maxUnitsLost', count:14, reward:100 },
    ],
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
      text:'There is one threat left, and it has been watching since the garage.\n\nTHE BOARD signed every check, counted every body, and approved every quarter you beat — and it has seen enough. The people who fund you are staging a coup of their own: every stronghold fortified, infinite lawyers, a vote to replace you with "synergistic leadership."\n\nThe real enemy was never across the map. It was always upstairs. Raze every board stronghold and the company — the market, the future — is yours alone. Vest, or die.',
      summary:`One threat remains, and it signs your paychecks. THE BOARD has staged a coup — fortified strongholds, infinite lawyers, and a vote for "synergistic leadership." Raze every board stronghold and the company is yours alone. Behind the board sits older money — the kind that buys the wreckage when empires fall. Vest, or die.` },
    w:88, h:72,
    seed:6,
    player:{ x:7, y:7 },
    // corporate winter — a frozen wasteland of snow and ice, seas frozen over
    terrain:{ biomes:['ice'], temp:{base:0.20,noise:0.15}, freeze:0.50, seaFrac:0.12, mtnFrac:0.10 },
    enemies:[ {x:78,y:62, extraBarracks:true, defenders:4}, {x:80,y:16, extraBarracks:true, defenders:4}, {x:42,y:66, extraBarracks:true, defenders:4}, {x:48,y:36, extraBarracks:true, defenders:4} ],
    objective:'THE BOARD seized FOUR strongholds to oust you. Raze all four for the ultimate exit. You have maximum Funding — make it count.',
    quests:[
      { id:'raze',  text:'Raze all four BOARD strongholds',           type:'razeAll', required:true },
      { id:'full',  text:'Max out headcount — every chair warm (24)', type:'peakSupply', count:24, reward:100 },
      { id:'promo', text:'Hand out five promotions mid-coup',         type:'promotions', count:5, reward:75 },
    ],
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
      text:'You crushed the board. You ARE the market — so the survivors did the only thing left and fused into one.\n\nTHE CONGLOMERATE rings a dead sea with EIGHT subsidiary campuses across a frozen-and-scorched waste, defended by every lawyer money can rent. Two of your own outposts lie abandoned on the dunes and the drifts — reach them and they\'re yours again.\n\nReclaim what\'s lost and liquidate all eight. This is the last quarter... and somewhere upstream, older money than all of it — the kind that buys the beginning and the end — has already filed the paperwork for what comes after the fire. Make it count.',
      summary:`You crushed the board; you ARE the market — so the survivors merged into one. THE CONGLOMERATE rings a dead sea with eight subsidiary campuses across a frozen-and-scorched waste, defended by every lawyer money can rent. Two of your own outposts lie abandoned on the dunes — reclaim them, then liquidate all eight. This is the last quarter.` },
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
    quests:[
      { id:'raze',    text:'Raze all eight CONGLOMERATE campuses',     type:'razeAll', required:true },
      { id:'reclaim', text:'Reclaim BOTH outposts on the dead sea',    type:'reclaimOutposts', count:2, reward:150 },
      { id:'peak',    text:'Keep peak headcount above 20',             type:'peakSupply', count:21, reward:75 },
    ],
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
    enemyName:'A&O', enemyFaction:'ao',
    // A hard reset to scrappy: the empire is ash, so the economy starts near Episode I — you
    // really do rebuild from nothing. A&O is entrenched (one campus has an extra People Ops) but
    // this sits at the bottom of a NEW curve, so aggression is low and grace is generous.
    aggression:1.2,
    startGold:350, startWorkers:4, startSoldiers:2, startBarracks:false,
    graceTime:105, waveTimer:112,
    crawl:{ episode:'EPISODE VIII', title:'THE DOWN ROUND',
      text:'The blast took everything. The campuses, the war chest, the names you carried this far — all of it gone to light and ash. The memorial is the only thing that scaled.\n\nYou come to broke in the crater of your own empire, and you are not alone in it. A&O — Alpha & Omega, the fund that buys the beginning and the end — filed the paperwork before the dust settled. They picked up your wreckage at auction and call it a portfolio.\n\nNo runway. No team — almost. NINO walked back into the crater the day he heard: the lobbyist who bought your first hundred votes, owed favors in one hand and nothing left to lose in the other. He came chasing a rumor he will not yet say out loud — that A&O buried someone who can make the wall stop being the last word. First he can buy you a room and a reputation. After that, you are on your own.\n\nTwo A&O campuses squat on the bones of what you built. Mine the ruins, hire whoever is left, and take it back one down round at a time. Begin again, or stay buried.',
      summary:`You come to broke in the crater of your own empire — the campuses, the war chest, the names you carried, all gone to ash. A&O, the fund that buys the beginning and the end, picked up your wreckage at auction and calls it a portfolio. NINO walks back in with a room, a reputation, and a rumor: that A&O buried someone who could make the wall stop being final. Mine the ruins, hire whoever's left, and take it back one down round at a time.` },
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
    quests:[
      { id:'raze',    text:'Liquidate both A&O campuses squatting on your bones', type:'razeAll', required:true },
      { id:'nino',    text:'Keep NINO off the memorial wall',                     type:'heroesAlive', reward:75 },
      { id:'rebuild', text:'Rebuild to 18 headcount from the crater',             type:'peakSupply', count:18, reward:75 },
    ],
    lakes:[ {x:22,y:14,r:4}, {x:30,y:34,r:3} ],
    rockClusters:[ {x:16,y:20,n:14}, {x:34,y:18,n:12}, {x:24,y:30,n:10} ],
    forests:[ {x:12,y:24,n:24}, {x:38,y:38,n:20}, {x:28,y:8,n:18} ],
    goldNodes:[ {x:8,y:35,amt:1500},{x:11,y:39,amt:1500},{x:4,y:33,amt:1500},
                {x:47,y:10,amt:1500},{x:41,y:5,amt:1500},{x:43,y:33,amt:1500},
                {x:26,y:22,amt:2000} ],
  },
  {
    name:'IX — The Proof of Concept',
    enemyName:'A&O', enemyFaction:'ao',
    // The company is regrowing on the back of the stolen blueprint: a step up from VIII — a real
    // war chest again, a People Ops on day one, three A&O research campuses to crack. Still mid-
    // curve, not finale-scale; this is the FIRST chapter of the long GRAAL arc, not its climax.
    aggression:1.4,
    startGold:550, startWorkers:5, startSoldiers:3, startBarracks:true,
    graceTime:100, waveTimer:108,
    crawl:{ episode:'EPISODE IX', title:'THE PROOF OF CONCEPT',
      text:'You clawed the company out of the crater and put A&O\'s Research campus to the torch. In its vault, behind the NDAs and the dead-man switches, you found it: the blueprint for the GRAAL.\n\nA brain chip that lifts a mind out of a failing body and writes it into another — metal, if it has to be. The names on your memorial wall stop looking quite so final. The board calls it the cure for the only churn that ever mattered.\n\nBut the file fights you. Someone got here first and crippled their own work — keys pulled, whole stages gutted, a confession buried in the comments by the hand that built it. The work was a person\'s, and they tried to bury it before A&O could ship it. A blueprint is not a product, and A&O wants its sabotaged IP back. Stand up the lab, ship a proof of concept, and liquidate all THREE A&O research campuses before they repossess your future. Resurrection has a roadmap now — and an author who didn\'t want it built. Hit the deadline.',
      summary:`You clawed the company out of the crater and torched A&O's research vault — and walked out with the blueprint for the GRAAL, the chip A&O calls the cure for the only churn that matters. But the file is sabotaged: someone built it, then crippled it before A&O could ship. A blueprint is not a product, and A&O wants its IP back. Stand up the lab, ship a proof of concept, and liquidate all three research campuses before they repossess your future.` },
    w:58, h:48,
    seed:9,
    player:{ x:6, y:42 },
    // a cold, sterile research compound — the dead server-farm of the old monopoly refrozen into
    // a cryo lab: tech racks under ice. Where the GRAAL gets reverse-engineered.
    terrain:{ biomes:['tech','ice'], temp:{base:0.30,noise:0.16}, freeze:0.46, seaFrac:0.11, mtnFrac:0.08, forest:0 },
    enemies:[ {x:48,y:8, extraBarracks:true, defenders:3}, {x:50,y:34, defenders:3}, {x:30,y:10, defenders:3} ],
    objective:'A&O wants its GRAAL blueprint back and holds THREE research campuses — liquidate all three and keep the proof of concept.',
    quests:[
      { id:'raze',  text:'Liquidate all three A&O research campuses',        type:'razeAll', required:true },
      { id:'ship',  text:'Ship the proof of concept inside 15 minutes',      type:'winBy', by:900, reward:100 },
      { id:'churn', text:'Keep churn under 12 hires',                        type:'maxUnitsLost', count:11, reward:75 },
    ],
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
    enemyName:'A&O', enemyFaction:'ao',
    // A rescue INFILTRATION: you bring NO economy and NO funding — only Nino and your carried career
    // veterans (their time to shine) muster at the entrance and punch down a long walled corridor of
    // standing guard squads (cfg.guards) to the cell at the map's heart. Free BIBA (a captive HERO,
    // cfg.captives) and the intern caged with her, reclaim the forward outpost just past the cell
    // (lostBases), and only THEN bootstrap an economy off the arena gold to liquidate the three A&O
    // campuses below. Career units carry like any map; the always-on vetScaling (js/balance.js)
    // musters proportionate extra base defenders for the power you bring, so no hand-rebalance here.
    aggression:1.6,   // T2-9: Arc-2 ramps monotonically 1.2 → 1.4 → 1.6 → 1.8 → 2.0 → 2.2
    startGold:0, startWorkers:0, startSoldiers:0, startBarracks:false,   // infiltration: no funding, no workers, no factory — just the crew
    graceTime:130, waveTimer:120,
    crawl:{ episode:'EPISODE X', title:'THE ACQUIHIRE',
      text:'The proof of concept works on paper and nowhere else. A blueprint is not a mind, and no one left on your payroll can bridge the gap. But the sabotage in the file had a signature, and Nino chased the rumor under it to a name.\n\nHer name is BIBA. A&O built the GRAAL around her — set her to chase immortality and called what she made the cure. Then she saw what it was for: the dying written into rented metal, the dead leased back to their families, a life of cyborg labor with a cancellation clause. So she crippled her own work. A&O did not fire the architect who turned on them. They filed her in a cell and threw away the question.\n\nA&O calls the place an office. It runs for miles — open plan, no doors that open from your side, talent filed in rows. The line to the people inside went silent long ago.\n\nThis time Nino does not walk in alone — but he walks in light. No funding, no factory, no campus at your back: only the names you carried this far, the survivors of every quarter since the crater. Reach the center, get Biba and the intern out, seize the outpost beyond the cell, and liquidate the three campuses between you and the way back.\n\nThere is no exit interview. Only an exit....',
      summary:`The proof of concept works on paper and nowhere else — you need the architect A&O built the GRAAL around. Her name is BIBA: she made the cure, saw who would pay for it, and crippled her own work — so A&O filed her in a cell instead of firing her. No funding, no factory — only the veterans you carried this far. Reach the center, free the one who sabotaged the GRAAL, and cut a path back through three campuses.` },
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
    // BIBA — caged at the map's heart with a captive intern. They are INVULNERABLE while caged (no
    // friendly fire / splash can kill them) and are freed only when NINO reaches the cell and stands in
    // arm's reach (freeCaptives, core.js) — clearing the guards is not enough, you must walk Nino in.
    // Reaching one frees both. On release Biba becomes a Level-12 Recruiter HERO and joins the hero
    // carryover, persisting like Nino; the intern rejoins your workforce.
    captives:[
      { x:44, y:130, type:'recruiter', hero:true, name:'Biba', sprite:'biba', level:12,
        dossier:{ first:'Biba', home:'the flooded arcologies of Lagos-2',
          family:'raised six younger siblings on relief credits',
          trauma:'watched her first squad triaged out of existence by an algorithm',
          dream:'to keep one team alive long enough to age',
          crime:'designing the chip A&O built to chase immortality — then crippling it when she saw who would pay' } },
      { x:48, y:130, type:'worker' },
    ],
    // standing guard squads (cfg.guards) — a real gauntlet now: nine MIXED-composition squads (map.js
    // `comp:[[type,count],...]`) escalating down the corridor from raw Growth Cyborgs to ranged
    // Consultants, fast Hustlers, enemy Lobbyist snipers, Recruiter medics and Auditor siege-walls,
    // capped by a Founder-Mech mini-boss at the cell. They hold post (ai.js excludes `guard` from waves)
    // and auto-engage on approach; the always-on guardVetBonus (balance.js) reinforces each squad for a
    // heavy carried roster. The cell ring is staged north→south so the climax isn't one alpha-strike.
    guards:[
      // ── the corridor gauntlet (pulled ~one group at a time by the walls), escalating ──
      { x:45, y:34,  comp:[['soldier',3],['ranger',2]] },                              // 5 — melee screen + first ranged
      { x:45, y:50,  comp:[['soldier',2],['hustler',2],['ranger',2]] },                // 6 — fast harassers arrive
      { x:45, y:66,  comp:[['ranger',3],['soldier',2],['recruiter',1]] },              // 6 — ranged-heavy + first medic
      { x:45, y:82,  comp:[['soldier',3],['hustler',2],['lobbyist',1]] },              // 6 — first enemy sniper
      { x:45, y:98,  comp:[['ranger',2],['soldier',2],['auditor',1],['recruiter',1]] },// 6 — Auditor siege-wall + medic
      { x:45, y:112, comp:[['hustler',3],['soldier',2],['lobbyist',1]] },              // 6 — fast + sniper before the cell
      // ── the cell ring — staged north→south (y120/132/140) so it isn't a single alpha-strike ──
      { x:44, y:120, comp:[['ranger',3],['lobbyist',1],['recruiter',1]] },             // 5 — ranged screen north of the cell
      { x:40, y:132, comp:[['soldier',3],['auditor',1],['recruiter',1]] },             // 5 — heavy bruisers at the cell
      { x:49, y:140, comp:[['hustler',3],['founder',1]] },                             // 4 — harassers + a Founder-Mech mini-boss
    ],
    // the abandoned A&O outpost just past the cell — reclaim it (walk a unit up) for a forward HQ to
    // build the army that cracks the arena. Your start HQ is 120 tiles north, so this is your real base.
    lostBases:[ { x:45, y:150 } ],
    enemies:[ {x:20,y:225, defenders:3}, {x:45,y:255, extraBarracks:true, defenders:4}, {x:70,y:225, defenders:3} ],
    objective:'A&O has caged the GRAAL\'s architect, BIBA — the one who built it, then sabotaged it — in its prison-office. Punch down the corridor, free Biba and the intern held with her, reclaim the forward outpost, then liquidate all THREE A&O campuses.',
    // NOTE: freeing Biba stays a BONUS quest — only Nino can free captives (core.js freeCaptives),
    // so a required rescue would softlock the mission if he falls; the win condition is unchanged.
    quests:[
      { id:'raze',    text:'Liquidate all three A&O campuses',               type:'razeAll', required:true },
      { id:'free',    text:'Free BIBA and the caged intern',                 type:'freeCaptives', count:2, reward:200 },
      { id:'outpost', text:'Reclaim the forward outpost past the cell',      type:'reclaimOutposts', count:1, reward:75 },
      { id:'guards',  text:'Wipe every standing guard squad',                type:'guardsCleared', reward:100 },
    ],
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
    enemyName:'A&O', enemyFaction:'ao',
    // The pilgrimage to the altar. A normal economy map again (you build and assault, unlike the Ep X
    // infiltration) but the longest march yet: a guided central road walled by tech-server rock ranges
    // and coolant seas, down through six A&O campuses to the dark tower on a peninsula at the sea's
    // edge. The carried roster + Nino/Biba arrive by CARRYOVER only (no cfg.heroes here — dead heroes
    // stay dead, matching the contextual crawl). Career units are the spearhead again; the always-on
    // vetScaling (js/balance.js) musters proportionate base defenders for the power you bring.
    aggression:1.8,   // T2-9: Arc-2 ramps monotonically 1.2 → 1.4 → 1.6 → 1.8 → 2.0 → 2.2
    startGold:1100, startWorkers:7, startSoldiers:5, startBarracks:true,
    graceTime:120, waveTimer:116,
    crawl:{ episode:'EPISODE XI', title:'THE LAUNCH',
      text:'Biba is free and the blueprint is yours, but a blueprint is not a factory. A&O has the only one that works, The DARK TOWER.\n\nThe altar stands at the top of A&O\'s peninsula: a black spire on a spit of land in a coolant sea, where the GRAAL writes the dying into fresh metal and the dead into product. The keynote is scheduled; the line to the people who live inside went quiet long ago.\n\n{?party}The pilgrimage walks in with you: {party} — the survivors of every battle since the crater, here to take the thing that was built to take them.{/party}{^party}You walk the road alone. Everyone who carried you this far went on ahead, into the ground.{/party}{?fallen} You carry the wall with you too — {fallen} — names A&O filed as churn, the reason you march toward the altar instead of away from it.{/fallen}{?biba} Biba walks toward the tower that built her work and says the chip cannot tell salvation from theft. She solders anyway.{/biba}\n\nFight down the guided road, liquidate all SIX A&O campuses between you and the sea, and seize the dark tower at the peninsula\'s end. Steal the GRAAL before they ship it — the machine that writes a lost mind back into fresh metal.\n\nIt\'s time to bring them back as something that can still fight beside you.',
      summary:`Biba is free and the blueprint is yours — but a blueprint is not a factory, and A&O owns the only one that works: the DARK TOWER, a black spire on a peninsula in a coolant sea, the machine that writes a lost mind back into fresh metal. The keynote is scheduled. Fight down the guided road, liquidate all six A&O labs between you and the sea, and seize the tower before they ship. It's time to bring them back.` },
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
      {x:48,y:112, defenders:4},                         // neck guardian — the LAST razeable lab; the GRAAL altar beyond is SEIZED (holdout), not razed
    ],
    // A&O's GIGANTIC indestructible Dark Tower — the GRAAL altar — at the peninsula's tip. Black spire
    // crowned with a continuous green storm. NOT razed: it is SEIZED via the holdout below.
    scenery:[ { type:'darktower', x:45, y:147 } ],
    // "Seize the GRAAL" finale (reusable wave-defense engine, waves.js): once the five labs are razed,
    // bring a unit to the tower to begin, then hold the altar through four escalating waves (the seizure's
    // "time passing"), the last carrying the A&O ninja mini-boss. Waves spawn off-view on the neck north
    // of the tower and march on the defenders; lose every defender in the zone and the transfer aborts.
    holdout:{
      quest:'graal', requires:'raze',
      anchor:{ type:'darktower' }, zone:{ radius:6 }, trigger:{ reachRadius:3 },
      spawns:[ {x:45,y:136},{x:39,y:140},{x:51,y:140},{x:43,y:132},{x:49,y:132} ],
      resetOnUndefended:true, scaleWithRoster:true, gapSec:3,
      framing:{ label:'GRAAL TRANSFER',
        // when a unit first reaches the altar (solo), play the Biba↔Nino reveal before wave 0 (see waves.js / cutscene.js)
        cutscene:'EP11_ALTAR_LINES',
        armPrompt:'📡 The five A&O labs are ash. Bring a unit to the DARK TOWER to begin the seizure.',
        startToast:'📡 GRAAL transfer initiated — hold the altar. A&O counter-intrusion inbound.',
        abortToast:'⚠ GRAAL transfer aborted — the altar fell undefended. Re-secure it.' },
      waves:[
        { comp:[['soldier',4],['ranger',2]] },
        { comp:[['soldier',5],['hustler',3],['ranger',2]] },
        { comp:[['soldier',6],['lobbyist',2],['foodtruck',2]] },
        { comp:[['soldier',4],['ranger',3]], boss:{ id:'ao_ninja' } },
      ],
    },
    objective:'Liquidate the five A&O labs down the road, then bring a unit to the DARK TOWER and hold the altar to seize the GRAAL.',
    quests:[
      { id:'raze',   text:'Liquidate the five A&O labs',                       type:'razeAll', required:true },
      { id:'graal',  text:'Seize the GRAAL — hold the Dark Tower altar',       type:'holdout', required:true },
      { id:'heroes', text:'Walk NINO and BIBA to the altar alive',             type:'heroesAlive', reward:150 },
      { id:'fund',   text:'Fund the pilgrimage — mine 12,000 on the road',     type:'accumulateFunding', amount:12000, reward:100 },
    ],
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
  {name:'XII — The Continuity Farm',enemyName:'A&O',enemyFaction:'ao',aggression:2.00,startGold:3600,startWorkers:12,startSoldiers:12,startBarracks:true,graceTime:118,waveTimer:112,crawl:{episode:'EPISODE XII',title:'THE CONTINUITY FARM',text:'You rebuilt after the flash, but the new company was never alive. It was a cap table wearing a grief mask.\n\nA&O now leases the dead into refrigerated prototype bodies, charging subscription fees for memories that used to belong to people. Their Continuity Farm hums under black ice and server heat, promising immortality with a cancellation clause.\n\nYour veterans carry names. Your memorial carries more. Crack the farm, steal the transfer lattice, and decide which ghost gets equity again....',summary:`You rebuilt after the flash, but the new company was never alive — just a cap table wearing a grief mask. A&O now leases the dead into refrigerated bodies and bills subscriptions for memories that used to belong to people. Crack the six campuses of its Continuity Farm, seize the transfer lattice, and decide which ghost gets equity again.`},reachCutscene:{name:'EP12_FARM_LINES',at:{x:55,y:48},radius:6},objective:'A&O holds SIX continuity campuses — liquidate all six and seize the transfer lattice.',quests:[{id:'raze',text:'Crack all six continuity campuses',type:'razeAll',required:true},{id:'kills',text:'Decommission 150 A&O personnel',type:'killUnits',count:150,reward:125},{id:'churn',text:'Hold churn under 20 while the farm burns',type:'maxUnitsLost',count:19,reward:100}],w:118,h:96,seed:12012,terrain:{biomes:['tech','ice'],temp:{axis:'diag',base:0.26,gradient:0.18,noise:0.14},freeze:0.24,seaFrac:0.14,mtnFrac:0.08,forest:0,beach:true},player:{x:8,y:88},enemies:[{x:106,y:8,defenders:7,extraBarracks:true},{x:106,y:84,defenders:7,extraBarracks:true},{x:58,y:10,defenders:6,extraBarracks:true},{x:62,y:84,defenders:6},{x:92,y:48,defenders:7,extraBarracks:true},{x:34,y:28,defenders:5}],goldNodes:[{x:6,y:90,amt:3600},{x:13,y:88,amt:3200},{x:9,y:80,amt:2800},{x:22,y:82,amt:2400},{x:55,y:52,amt:4200},{x:42,y:44,amt:3000},{x:76,y:42,amt:3000},{x:96,y:54,amt:2500},{x:110,y:12,amt:1900},{x:110,y:82,amt:1900},{x:58,y:6,amt:1900},{x:64,y:90,amt:1900}],lakes:[{x:56,y:48,r:7},{x:86,y:26,r:5},{x:30,y:66,r:4},{x:74,y:72,r:4}],rockClusters:[{x:48,y:25,n:18},{x:70,y:30,n:16},{x:88,y:62,n:18},{x:24,y:48,n:14},{x:60,y:68,n:16}],forests:[],thickets:[{x:38,y:34,w:22,h:14,density:0.72,mix:0.25,trail:'h'},{x:80,y:34,w:18,h:18,density:0.66,mix:0.15,trail:'v'}]},
  {
    name:'XIII — The Vesting Cliff',
    enemyName:'A&O', enemyFaction:'ao',
    // Penultimate Arc-2 chapter. You hold the transfer lattice from Ep XII but it is inert — bodies,
    // no souls: A&O kept the minds upstream as encrypted backups ("inventory"), files an injunction
    // calling your dead delinquent assets, and schedules a purge. You raid SEVEN backup-vault
    // campuses to extract the dead before the "cliff" zeroes them — running A&O's own billing engine
    // one last time (Biba: "salvation from theft"). Sets up the Ep XIV resurrection choice ("you can
    // still only write one home"); the Reborn-Cyborg unit/death-reset is SEPARATE code work, not this
    // map. Carried roster + Nino/Biba arrive by carryover (no cfg.heroes) → contextual crawl vars.
    // aggression eased to 1.6 (below Ep XII's 2.0): with SEVEN vault campuses the difficulty is the
    // T2-9: the campaign's hardest conventional fight — Arc 2 peaks HERE (1.2 → … → 2.0 → 2.2).
    // Seven vault campuses AND per-base ferocity: a maxed carried roster meets a real finale, with
    // the Arc-2 vetScaling cap (balance.js) mustering bigger garrisons against it.
    aggression:2.2,
    startGold:3600, startWorkers:12, startSoldiers:12, startBarracks:true,
    graceTime:120, waveTimer:112,
    crawl:{ episode:'EPISODE XIII', title:'THE VESTING CLIFF',
      text:'The transfer lattice is yours, and it is empty. You stole the machine that writes a mind into metal and learned, the way you always learn, one quarter too late: a lattice is not a soul. You have the bodies. The cold racks hum, addressed and waiting, and no one is home.\n\nThe minds were never in the farm. A&O keeps them upstream — every churned name backed up, encrypted, booked as inventory on the servers of the fund that owns the beginning and the end. And A&O filed before you finished the manual: an injunction that calls your dead delinquent assets, your rescue an act of churn, the only theft on record the one chip you took. The purge is scheduled. After the cliff, the backups vest to zero.\n\n{?party}They walk the vaults with you: {party} — the ones who reached the cliff alive, here to drag the rest back over it.{/party}{^party}You walk the vaults alone. Everyone who carried you this far is already inside them, filed and waiting.{/party}{?fallen} You came for these names: {fallen} — churn on A&O\'s ledger, the wall on yours.{/fallen}{?biba} Biba says you are not saving them, you are repossessing them — A&O\'s word, A&O\'s machine. She runs the extraction anyway.{/biba}\n\nBreak the SEVEN vault campuses, turn A&O\'s billing engine against itself, and pull every backup out before the cliff zeroes it. You can still only write one of them home. That ledger waits. Tonight, you carry them out of the fire....',
      summary:`You hold A&O's transfer lattice at last — and it is an empty machine: prototype bodies with no minds to wake in them. The minds are upstream, backed up and booked as inventory by the fund that owns the beginning and the end, and A&O has filed to purge them as delinquent assets. Crack its seven backup-vault campuses and pull your dead out of the billing engine before the deadline zeroes them.` },
    // story-polish §5: the vault reveal (Nino/Biba) plays when a unit reaches the deep archive at the east-centre
    reachCutscene:{ name:'EP13_VAULT_LINES', at:{x:88,y:46}, radius:6 },
    objective:'A&O has filed to purge your dead and holds SEVEN backup-vault campuses — liquidate all seven and pull every backup out before the cliff zeroes them.',
    quests:[
      { id:'raze', text:'Liquidate all seven backup-vault campuses',     type:'razeAll', required:true },
      { id:'fast', text:'Beat the purge — close inside 25 minutes',      type:'winBy', by:1500, reward:150 },
      { id:'wall', text:'Pull every backup out — zero veterans lost',    type:'noVetDeaths', reward:150 },
    ],
    w:112, h:92,
    seed:13013,
    // deep cold storage: the tech server-farm refrozen into cryo backup vaults — colder than the
    // Continuity Farm, pure tech under heavy ice, coolant pools in the margins, nothing growing.
    terrain:{ biomes:['tech','ice'], temp:{base:0.22,noise:0.14}, freeze:0.52, seaFrac:0.13, mtnFrac:0.09, forest:0 },
    player:{ x:8, y:84 },
    // seven backup-vault campuses: three hardened (extraBarracks) corner/core vaults guard the deep
    // archive at the east-centre (88,46); four lighter forward vaults make first contact. Tuned to
    // ~40 total defenders so the carryover swing sits beside Ep XII on the shipping curve.
    enemies:[ {x:104,y:8, defenders:7, extraBarracks:true}, {x:104,y:84, defenders:7, extraBarracks:true},
              {x:58,y:8, defenders:6}, {x:60,y:84, defenders:5},
              {x:88,y:46, defenders:7, extraBarracks:true}, {x:38,y:24, defenders:4},
              {x:40,y:62, defenders:4} ],
    goldNodes:[ {x:6,y:86,amt:3000},{x:13,y:84,amt:2800},{x:9,y:78,amt:2600},{x:20,y:80,amt:2200},
                {x:54,y:48,amt:4000},{x:70,y:40,amt:3000},{x:44,y:46,amt:2600},
                {x:106,y:12,amt:1900},{x:106,y:80,amt:1900},{x:58,y:12,amt:1900},{x:62,y:80,amt:1900},
                {x:90,y:50,amt:2400},{x:38,y:28,amt:1900},{x:40,y:58,amt:1900} ],
    lakes:[ {x:50,y:46,r:7},{x:80,y:24,r:5},{x:28,y:54,r:4},{x:74,y:70,r:5},{x:96,y:64,r:4} ],
    rockClusters:[ {x:44,y:24,n:16},{x:72,y:30,n:16},{x:86,y:60,n:18},{x:26,y:40,n:14},{x:58,y:60,n:16},{x:100,y:44,n:14} ],
    forests:[],
    thickets:[ {x:30,y:30,w:20,h:14,density:0.70,mix:0.20,trail:'h'},{x:70,y:54,w:18,h:18,density:0.66,mix:0.18,trail:'v'} ],
  },
  /* ============================ VILLAINS (BIG BOSSES) ============================
     APPENDED past the linear campaign so indices 0–12 (Episodes I–XIII) never shift — save compat,
     the hard-coded mapIndex===6 / MAPS[7] hooks, and Madosis episode numbers all stay valid. Each is
     a boss-duel ARENA: no enemy bases (enemies:[]), one oversized villain (cfg.villain → villains.js).
     `isVillain` exempts them from index↔Roman validation and the linear Quarter numbering; `gateAfter`
     /`returnTo` route the campaign (villains.js: villainGateBefore/villainNextLinear). The win
     condition is "defeat the villain" (core.js checkWinLose → villainCheckWinLose). */
  {
    name:'THE CYAN NINJA',                       // isVillain → no Roman-numeral requirement
    isVillain:true, gateAfter:6, returnTo:7, displayEp:'7.5',
    enemyName:'THE CYAN NINJA',
    aggression:1.0, startGold:600, startWorkers:4, startSoldiers:4, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves
    crawl:{ episode:'EPISODE 7.5', title:'THE CYAN NINJA',
      text:'The blast still rings in the dark when a single blade of cyan light unfolds from the smoke. No company. No army. One operator, fast as rumor, paid to make sure nothing crawls out of the crater.\n\nThe cyan ninja answers to no name and moves like the network itself — there, then gone. Pin him on this scorched slab and put him down, or the next quarter never opens. He does not intend to die here. He intends to leave.',
      summary:`A&O filed a cleanup contract before the ash cooled, and this is the contractor: a lone operator in cyan, impossibly fast, paid to bury whatever crawled out of the flash. There is no campus to raze here, only the duel. Break him before he slips the net and vanishes into the sprawl.` },
    w:30, h:24, seed:7050,
    player:{ x:5, y:18 },
    terrain:{ biomes:['tech'], seaFrac:0.04, mtnFrac:0.06, forest:0 },
    objective:'Defeat THE CYAN NINJA — he is fast and will flee when wounded. Corner and finish him.',
    quests:[
      { id:'duel',   text:'End THE CYAN NINJA\'s contract',                          type:'defeatVillain', required:true },
      { id:'noflee', text:'No escape clause — finish him before he slips away',      type:'bossNoFlee', reward:100 },
      { id:'lean',   text:'Lose no more than 5 staff to one contractor',             type:'maxUnitsLost', count:5, reward:50 },
    ],
    enemies:[],                                  // boss duel — no enemy bases; the villain IS the encounter
    villain:{ id:'cyan_ninja', x:24, y:6 },
    lakes:[], rockClusters:[ {x:13,y:9,n:8}, {x:21,y:18,n:6} ], forests:[],
    goldNodes:[ {x:6,y:20,amt:1400}, {x:4,y:15,amt:1200}, {x:9,y:21,amt:1200} ],
  },
  {
    name:'REX',
    // T2-7: REX is the TRUE FINALE — the campaign routes THROUGH him after Episode XIII and the
    // IPO only shows once he falls (finale routing in ui.js onVictory / villains.js finaleVillainIndex).
    isVillain:true, finale:true, displayEp:'FINALE',
    enemyName:'A&O', enemyFaction:'ao',          // → founder _ao green sheet + A&O ground treatment
    aggression:1.0, startGold:1800, startWorkers:6, startSoldiers:8, startBarracks:true,
    graceTime:9999, waveTimer:9999,
    crawl:{ episode:'EPISODE 15', title:'REX',
      text:'A&O stopped sending lawyers. It sent a building that walks.\n\nREX — five stories of black alloy and toxic light, the foreclosure made flesh. It does not negotiate the vesting cliff. It IS the cliff. Crack its core before it overclocks and goes feral, or be the next name on the wall. Bring everyone. Bring everything.',
      summary:`A&O retires its accountants and fields REX — a five-story mech of black alloy and toxic-green light, the foreclosure made flesh. Survive the first assault, then the enrage when its core goes critical and it turns berserk. This is the biggest, longest fight of the war.` },
    w:40, h:34, seed:15015,
    player:{ x:6, y:28 },
    terrain:{ biomes:['tech'], seaFrac:0.05, mtnFrac:0.06, forest:0 },
    // story-polish §5: the finale prelude (Nino/Biba) plays once as the fight opens (carryover heroes present)
    introCutscene:'REX_PRELUDE_LINES',
    objective:"Destroy A&O's REX. It hits like a foreclosure and turns berserk below 40% — spread out and keep your healers alive.",
    quests:[
      { id:'rex',    text:'Destroy REX — crack the core before it cracks you',   type:'defeatVillain', required:true },
      { id:'heroes', text:'Bring NINO and BIBA through the foreclosure',         type:'heroesAlive', reward:150 },
      { id:'lean',   text:'Keep the final invoice under 12 names',               type:'maxUnitsLost', count:11, reward:150 },
    ],
    enemies:[],                                  // boss duel — no enemy bases; the villain IS the encounter
    villain:{ id:'rex', x:30, y:9 },
    lakes:[ {x:14,y:6,r:3} ], rockClusters:[ {x:12,y:12,n:10}, {x:26,y:26,n:10} ], forests:[],
    goldNodes:[ {x:7,y:30,amt:2400}, {x:4,y:25,amt:2000}, {x:11,y:31,amt:2000}, {x:20,y:18,amt:2600} ],
  },

  /* ---- T2-1/T2-7/T2-8/T2-9 APPENDED ARC-2 SIDE MISSIONS ----
     Gated interludes (isVillain exempts them from linear numbering; returnTo routes the campaign,
     villains.js). Each one exercises a different win verb (core.js checkAltWin) or lieutenant duel,
     so the quarter-to-quarter rhythm stops being raze-raze-raze. All A&O (world-bible Arc-2 canon). */
  {
    name:'THE LAND GRAB',                        // reachAndHold (T2-1) — between VIII and IX
    isVillain:true, gateAfter:7, returnTo:8, displayEp:'8.5',
    enemyName:'A&O', enemyFaction:'ao',
    aggression:1.3, startGold:450, startWorkers:4, startSoldiers:4, startBarracks:true,
    graceTime:60, waveTimer:70,
    crawl:{ episode:'EPISODE 8.5', title:'THE LAND GRAB',
      text:'Rebuilding needs more than grief and an org chart. It needs bandwidth.\n\nThe old Conglomerate uplink ridge still stands over the crater, transmitting nothing to no one. Whoever holds it owns every byte in and out of the wasteland — and A&O has already dispatched claim drones with the paperwork pre-signed.\n\nPlant your people on the ridge and do not move. Possession is nine tenths of the lawsuit....',
      summary:'The crater\'s only uplink ridge is unclaimed, and A&O\'s claim bots are inbound. Take the high ground and hold it long enough for your filing to clear — lose your grip and the wasteland goes dark for good.' },
    objective:'Seize the uplink ridge and HOLD it against A&O — keep units in the zone until your claim clears.',
    winCondition:{ type:'reachAndHold', at:{x:44,y:10}, radius:3, holdSec:75 },
    // winsAlone razeAll preserves the pre-quest shortcut: razing the survey campus also ends the map
    quests:[
      { id:'hold', text:'Hold the uplink ridge until the claim clears',   type:'reachAndHold', required:true },
      { id:'raze', text:'Or raze A&O\'s survey campus outright',          type:'razeAll', winsAlone:true, reward:100 },
      { id:'fast', text:'Close the claim inside 4 minutes',               type:'winBy', by:240, reward:75 },
    ],
    w:52, h:44, seed:8508,
    player:{ x:6, y:38 },
    terrain:{ biomes:['tech','grass'], temp:{axis:'diag', base:0.45, gradient:0.2, noise:0.18}, seaFrac:0.08, mtnFrac:0.10, forest:0.04 },
    enemies:[ {x:44,y:34, defenders:4, extraBarracks:true} ],
    events:[
      { atTime:90,  toast:'A&O has escalated the claim dispute — reinforcements filed.', aggression:1.6 },
      { atTime:150, spawnSquad:{ comp:[['soldier',3],['ranger',2]] }, at:{x:44,y:22}, toast:'Claim bots inbound on the ridge!' },
    ],
    lakes:[ {x:24,y:24,r:4} ],
    rockClusters:[ {x:30,y:12,n:14}, {x:18,y:8,n:10} ],
    forests:[ {x:12,y:28,n:20} ],
    goldNodes:[ {x:4,y:34,amt:1500},{x:9,y:41,amt:1500},{x:26,y:36,amt:2200},{x:38,y:18,amt:2600} ],
  },
  {
    name:'THE RECOVERY AGENT',                   // ao_enforcer lieutenant duel (T2-7) — between IX and X
    isVillain:true, gateAfter:8, returnTo:9, displayEp:'9.5',
    enemyName:'A&O', enemyFaction:'ao',
    aggression:1.0, startGold:600, startWorkers:4, startSoldiers:5, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves
    crawl:{ episode:'EPISODE 9.5', title:'THE RECOVERY AGENT',
      text:'Somebody at A&O read your prototype filings, cross-referenced the break-in reports, and drew the obvious line: you are going after the architect.\n\nSo they sent the asset-recovery department. One agent, green as server light, retained on commission to make sure the only person who can finish the GRAAL stays exactly where the fund parked her.\n\nHe is between you and the prison-office. He has never once come home without the asset....',
      summary:'A&O knows where you\'re headed next, and it sent its asset-recovery agent to close the route. One hunter, fast and patient, between you and the architect. Put him down or the rescue dies before it starts.' },
    objective:'Put down THE A&O ENFORCER — he is fast, he hunts your healers, and he does not flee.',
    quests:[
      { id:'duel', text:'Put down THE A&O ENFORCER',                  type:'defeatVillain', required:true },
      { id:'wall', text:'No new names on the memorial',               type:'noVetDeaths', reward:100 },
      { id:'fast', text:'Terminate his retainer inside 6 minutes',    type:'winBy', by:360, reward:75 },
    ],
    w:30, h:24, seed:9509,
    player:{ x:5, y:18 },
    terrain:{ biomes:['tech'], seaFrac:0.04, mtnFrac:0.06, forest:0 },
    enemies:[],
    villain:{ id:'ao_enforcer', x:24, y:6 },
    lakes:[], rockClusters:[ {x:14,y:10,n:8}, {x:22,y:17,n:6} ], forests:[],
    goldNodes:[ {x:6,y:20,amt:1400}, {x:4,y:15,amt:1200}, {x:9,y:21,amt:1200} ],
  },
  {
    name:'THE EXTRACTION CLAUSE',                // freed Biba leads a GRAAL-blueprint extraction (escort T2-1 + corridor infiltration T2-8) — between X and XI
    isVillain:true, gateAfter:9, returnTo:10, displayEp:'10.5',
    enemyName:'A&O', enemyFaction:'ao',
    aggression:1.4, startGold:0, startWorkers:0, startSoldiers:5, startBarracks:false,
    graceTime:9999, waveTimer:9999,              // corridor run — pressure comes from guards + scripted beats, not waves
    noEconRebalance:true,                        // no economy at all — the T2-5 rebalance has nothing to touch
    crawl:{ episode:'EPISODE 10.5', title:'THE EXTRACTION CLAUSE',
      text:'Biba is free. She walked the hub, slept under a roof that locks from the inside, and watched the GRAAL light up on a bench that is finally hers. Then she counted what was missing. The proof of concept A&O holds is half a chip — the master schematic, the file that says how the rest is fabricated and proves the work was hers first, is still filed in the company that filed her in a cell.\n\nNobody else can find it. Nobody else can authenticate it. So she is going back in — by choice this time. Down into the records annex at the loading dock, up the long service corridor through every guard A&O can stand in a line, into the archive to pull the one file that turns a clever idea into something the world can build. Then out the north line before they understand what left with them.\n\nNo funding. No factory. No reinforcements. Just the crew you walked in with, the architect who refuses to be the only one who knows, and a corridor full of people paid to keep her from the fence. If she falls, the master goes back in the drawer forever....',
      summary:'M.D.C. deployment: the GRAAL works on a bench but not at scale — A&O still holds the master schematic in its archive, and only BIBA can find it and prove it real. She is leading a strike team back into the stage that caged her, up A&O\'s locked-down service corridor to the extraction line. No economy and no reinforcements: only the squad you walk in with. Get her and the file out the north line — there is no second copy. Strange detail in the manifests: the archive\'s sign-off authority is a managing partner no one at A&O has ever met in person.' },
    objective:'Escort BIBA up A&O\'s service corridor, pull the GRAAL master file from the archive, and reach the north extraction line — or raze the checkpoint to force the door. If she falls, the blueprint dies with her.',
    winCondition:{ type:'escort', vipHero:'Biba', to:{x:17,y:4}, radius:3 },
    // winsAlone razeAll preserves the pre-quest shortcut: razing the checkpoint also ends the map
    quests:[
      { id:'escort', text:'Walk BIBA to the extraction line with the master file', type:'escort', required:true },
      { id:'raze',   text:'Or raze A&O\'s corridor checkpoint and force the line',  type:'razeAll', winsAlone:true, reward:75 },
      { id:'nobody', text:'Lose nobody on the corridor',                            type:'maxUnitsLost', count:0, reward:100 },
    ],
    w:34, h:88, seed:10510,
    player:{ x:17, y:82 },
    terrain:{ biomes:['tech'], seaFrac:0.03, mtnFrac:0.10, forest:0 },
    enemies:[ {x:6,y:8, defenders:3, light:true} ],   // one checkpoint shack near the fence — not a base economy
    guards:[
      { x:17, y:64, comp:[['soldier',3],['ranger',2]] },
      { x:10, y:46, comp:[['ranger',3],['hustler',2]] },
      { x:24, y:46, comp:[['soldier',3],['hustler',1]] },
      { x:17, y:26, comp:[['soldier',2],['ranger',2],['lobbyist',1]] },
    ],
    events:[
      { atTime:75,  toast:'Unscheduled query flagged in the archive — A&O records security converging on the corridor.', spawnSquad:{ comp:[['hustler',3]] }, at:{x:17,y:70} },
      { atTime:170, toast:'They know the master file is walking. Get her to the line. MOVE.', spawnSquad:{ comp:[['soldier',3],['ranger',2]] }, at:{x:17,y:40} },
    ],
    thickets:[ {x:4,y:30,w:11,h:22,density:0.74,mix:0.2,trail:'v'}, {x:20,y:52,w:10,h:18,density:0.7,mix:0.3,trail:'v'} ],
    lakes:[], rockClusters:[ {x:8,y:18,n:10}, {x:26,y:70,n:10} ], forests:[],
    goldNodes:[ {x:5,y:84,amt:1200} ],
  },
  {
    name:'THE GROUNDS DISPUTE',                  // tower_guardian lieutenant duel (T2-7, win-by-boss per T2-1) — between XI and XII
    isVillain:true, gateAfter:10, returnTo:11, displayEp:'11.5',
    enemyName:'A&O', enemyFaction:'ao',
    aggression:1.0, startGold:900, startWorkers:5, startSoldiers:6, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves
    crawl:{ episode:'EPISODE 11.5', title:'THE GROUNDS DISPUTE',
      text:'The Dark Tower is yours on paper. The foundation disagrees.\n\nSomething A&O bolted into the bedrock has unmoored itself — a warden core in a five-meter chassis, violet light bleeding from the seams, walking the perimeter it was built to keep. It does not recognize the transfer of title. It does not recognize anything anymore.\n\nThe tower writes the dying into fresh metal. First, evict the metal that refuses to die....',
      summary:'You hold the Dark Tower, but its buried warden has unbolted itself from the foundations and contests the deed. A five-meter chassis with violet light in its seams walks your new perimeter. Evict it.' },
    objective:'Destroy A&O\'s DARK TOWER GUARDIAN — it quakes the ground when it lands, so spread your line.',
    quests:[
      { id:'duel', text:'Scrap the DARK TOWER GUARDIAN',                  type:'defeatVillain', required:true },
      { id:'wall', text:'Evict it without adding names to the wall',      type:'noVetDeaths', reward:100 },
      { id:'fast', text:'Settle the dispute inside 7 minutes',            type:'winBy', by:420, reward:75 },
    ],
    w:38, h:30, seed:11511,
    player:{ x:6, y:24 },
    terrain:{ biomes:['tech'], seaFrac:0.05, mtnFrac:0.08, forest:0 },
    enemies:[],
    villain:{ id:'tower_guardian', x:29, y:8 },
    // the duel is fought at the Dark Tower's foundation — the GIGANTIC indestructible spire looms over
    // the arena as a backdrop (top-centre, clear of the player start and the guardian spawn).
    scenery:[ { type:'darktower', x:18, y:2 } ],
    lakes:[ {x:13,y:7,r:3} ], rockClusters:[ {x:11,y:12,n:10}, {x:25,y:23,n:10} ], forests:[],
    goldNodes:[ {x:7,y:26,amt:2200}, {x:4,y:21,amt:1800}, {x:11,y:27,amt:1800}, {x:19,y:15,amt:2400} ],
  },
  {
    name:'THE BRIDGE ROUND',                     // starved-economy survive (T2-1 + T2-9 "down round" map) — between XII and XIII
    isVillain:true, gateAfter:11, returnTo:12, displayEp:'12.5',
    enemyName:'A&O', enemyFaction:'ao',
    aggression:2.0, startGold:250, startWorkers:4, startSoldiers:6, startBarracks:true,
    graceTime:45, waveTimer:55,
    noEconRebalance:true,                        // ALREADY starved by design — keep the two lean nodes as authored
    crawl:{ episode:'EPISODE 12.5', title:'THE BRIDGE ROUND',
      text:'You cracked the Continuity Farm and walked out with the transfer lattice in a refrigerated truck. A&O\'s response cleared legal review in eleven minutes.\n\nAn emergency injunction, served by everything the fund can field: repossess the lattice, bill the survivors. Your lawyers say they can stall the order until the markets open. Until then there is no funding, no reinforcement, and nowhere to run with a machine that heavy.\n\nIt\'s called a bridge round: you spend everything you have left to still exist next quarter....',
      summary:'The stolen transfer lattice is yours — and A&O\'s emergency injunction says otherwise. No reinforcements, two lean crystal seams, and every repo crew the fund can field. Survive until the markets open. The injunction\'s footnotes mention a contingency past the lawyers — something heavy being fabricated under the black ice, in case paper stops working.' },
    objective:'SURVIVE A&O\'s injunction — hold out until the order lapses. Lose your HQ and the lattice goes back to the fund.',
    winCondition:{ type:'survive', forSec:330, protect:'hq' },
    // winsAlone razeAll preserves the pre-quest shortcut: razing both repo camps also ends the map
    quests:[
      { id:'survive', text:'Survive the injunction until the order lapses', type:'survive', required:true },
      { id:'raze',    text:'Or raze both repo camps outright',              type:'razeAll', winsAlone:true, reward:150 },
      { id:'repo',    text:'Repossess 40 repo crew',                        type:'killUnits', count:40, reward:75 },
    ],
    w:56, h:46, seed:12512,
    player:{ x:27, y:24 },
    terrain:{ biomes:['ice','tech'], temp:{axis:'y', base:0.30, gradient:0.16, noise:0.14}, freeze:0.26, seaFrac:0.10, mtnFrac:0.09, forest:0 },
    enemies:[ {x:6,y:6, defenders:5, extraBarracks:true}, {x:48,y:38, defenders:5, extraBarracks:true} ],
    events:[
      { atTime:120, toast:'A&O has doubled the recovery bounty — heavier crews inbound.', aggression:2.2 },
      { atTime:240, toast:'Final escalation: the fund is liquidating its patience.', spawnSquad:{ comp:[['soldier',4],['lobbyist',2]] }, at:{x:48,y:24} },
    ],
    lakes:[ {x:14,y:30,r:4}, {x:40,y:12,r:4} ],
    rockClusters:[ {x:20,y:12,n:14}, {x:36,y:30,n:14} ],
    forests:[],
    goldNodes:[ {x:23,y:28,amt:1600}, {x:31,y:20,amt:1600} ],
  },
];
