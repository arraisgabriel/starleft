/* config.js — constants & data: TILE, canvas refs, terrain/biome, DEF (unit/building stats), MAPS. Loaded FIRST. | STARLEFT (classic scripts) */
/* =====================================================================
   STARLEFT — single-file mini RTS
   ===================================================================== */
const TILE = 32;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const mm = document.getElementById('minimap');
const mmx = mm.getContext('2d');

/* ---- Terrain types (drive gameplay: passability, gathering, LOS) ---- */
const T_GRASS=0, T_DIRT=1, T_WATER=2, T_ROCK=3, T_TREE=4;
function passableTerrain(t){ return t===T_GRASS || t===T_DIRT; }

/* ---- Biomes (visual region themes that coexist within a single map) ----
   A biome reskins the floor + features of a region; terrain type still
   controls gameplay. Water/Mountain biomes also bias terrain generation so
   they read as real seas / impassable ranges. */
const B_GRASS=0, B_MOUNTAIN=1, B_WATER=2, B_TECH=3, B_DESERT=4, B_ICE=5, B_VOLCANIC=6;
const BIOME_KINDS = [B_MOUNTAIN,B_WATER,B_TECH,B_DESERT,B_ICE,B_VOLCANIC];
// floor palette: a/b = two shades alternated by per-tile variant; dirt = worn-patch tint
const BIOME_PAL = {
  [B_GRASS]:    { a:'#33502e', b:'#3a5a34', dirt:'#414b2e' },
  [B_MOUNTAIN]: { a:'#574f47', b:'#615850', dirt:'#494139' },
  [B_WATER]:    { a:'#1a466a', b:'#1d4f73', dirt:'#1a466a' },
  [B_TECH]:     { a:'#27313d', b:'#2c3744', dirt:'#222b35' },
  [B_DESERT]:   { a:'#bd9c5e', b:'#c8a869', dirt:'#a8884a' },
  [B_ICE]:      { a:'#bcd2dd', b:'#cde0ea', dirt:'#a8bdc8' },
  [B_VOLCANIC]: { a:'#2b2320', b:'#332a25', dirt:'#211a17' },
};
// flat colors for the minimap floor, indexed by biome
const BIOME_MINI = ['#34522f','#574f47','#234e6e','#2c3744','#bd9c5e','#bcd2dd','#2b2320'];


/* ---- Unit / building definitions (startup-vs-monopoly satire) ---- */
const DEF = {
  hq:       { name:'Open-Plan HQ', icon:'🏢', kind:'building', w:2,h:2, hp:1500, cost:0,   build:35,  sight:7, supply:24, color:'#3b7fd0',
              flavor:'Stores Funding and onboards unpaid Interns. Has a ping-pong table nobody uses.' },
  barracks: { name:'People Ops',   icon:'🎯', kind:'building', w:2,h:2, hp:900,  cost:150, build:20,  sight:5, supply:0,  color:'#5a6b8a',
              flavor:'"Recruiting" department. Turns Funding into Growth Hackers and Consultants.' },
  turret:   { name:'Legal Team',   icon:'⚖️', kind:'building', w:1,h:1, hp:550,  cost:100, build:14,  sight:7, supply:0,  color:'#7a8aa8',
              dmg:14, range:6.0, cd:0.7, flavor:'Fires cease-and-desist letters at anything that trespasses on your IP.' },
  worker:   { name:'Intern',         icon:'🧑‍💻', kind:'unit', hp:60,  cost:50,  build:10, sight:5, supply:1, speed:2.6, dmg:4,  range:1.0, cd:1.0, r:9,
              flavor:'Mines Funding "for the exposure." Builds things. Equity will never vest.' },
  soldier:  { name:'Growth Hacker',  icon:'🚀', kind:'unit', hp:140, cost:80,  build:13, sight:6, supply:1, speed:2.4, dmg:17, range:1.3, cd:0.9, r:10,
              flavor:'Moves fast and breaks things — primarily skulls. Hates meetings, loves disruption.' },
  ranger:   { name:'Consultant',     icon:'💼', kind:'unit', hp:95,  cost:95,  build:16, sight:7, supply:1, speed:2.4, dmg:14, range:5.0, cd:1.1, r:9,
              flavor:'Bills $400/hr to lob synergy buzzwords at the enemy from a safe distance.' },

  /* ---- People Ops (Barracks) tier ---- */
  recruiter:{ name:'Recruiter', icon:'🧑‍🏫', kind:'unit', hp:80, cost:75, build:14, sight:6, supply:1, speed:2.5, dmg:0, range:4.0, cd:1.0, r:9, action:'heal',
              heal:9, flavor:'Heals burnout. "We\'re like a family." Mends teammates instead of fighting.' },
  hustler:  { name:'Hustler', icon:'🛹', kind:'unit', hp:70, cost:70, build:11, sight:7, supply:1, speed:3.5, dmg:10, range:1.6, cd:0.7, r:9,
              splash:14, splashR:1.2, flavor:'Moves fast and breaks things. Cheap, fast, harasses your economy.' },
  lobbyist: { name:'Lobbyist', icon:'🎩', kind:'unit', hp:70, cost:140, build:20, sight:9, supply:2, speed:2.2, dmg:36, range:7.5, cd:2.3, r:9,
              flavor:'Buys senators wholesale. One devastating long-range shot, then a long reload.' },
  /* ---- The Garage (Factory) tier ---- */
  foodtruck:{ name:'Food Truck', icon:'🚚', kind:'unit', hp:110, cost:90, build:15, sight:6, supply:2, speed:3.6, dmg:11, range:3.0, cd:1.0, r:11, vehicle:true, facesLeft:true,
              splash:9, splashR:1.4, flavor:'Free cold brew & napalm. A flame cone shreds clustered enemies.' },
  auditor:  { name:'Auditor', icon:'📊', kind:'unit', hp:200, cost:175, build:28, sight:8, supply:3, speed:1.8, dmg:18, range:5.0, cd:1.4, r:12, vehicle:true, facesLeft:true,
              siege:{dmg:42,range:9,splashR:1.6,setup:1.2}, flavor:'Deploys spreadsheets into a long-range due-diligence cannon. Sieges when enemies are near.' },
  /* ---- Launch Pad (Starport) tier ---- */
  founder:  { name:'Founder Mech', icon:'🦄', kind:'unit', hp:600, cost:400, build:45, sight:8, supply:6, speed:1.6, dmg:45, range:3.5, cd:1.5, r:16, vehicle:true,
              splash:20, splashR:1.3, antiAir:true, flavor:'A visionary in a 12-ft exosuit. Hits anything, ground or air.' },
  courier:  { name:'Courier Drone', icon:'🛸', kind:'unit', hp:120, cost:90, build:16, sight:7, supply:2, speed:3.0, dmg:0, range:4.0, cd:1.0, r:10, air:true, action:'heal',
              heal:7, flavor:'Same-day delivery of medkits and morale. Flies over everything.' },
  bomber:   { name:'Buzzword Bomber', icon:'🛩️', kind:'unit', hp:480, cost:450, build:50, sight:9, supply:6, speed:1.7, dmg:26, range:6.0, cd:0.9, r:16, air:true, facesLeft:true,
              flavor:'Capital airship. Rains cyan ordnance on the campus below.' },

  /* ---- production buildings ---- */
  garage:   { name:'The Garage', icon:'🔧', kind:'building', w:2,h:2, hp:1000, cost:200, build:24, sight:4, supply:0, color:'#4a6b5a',
              flavor:'Vehicle bay. Turns Funding into Food Trucks, Auditors and Founder Mechs.' },
  launchpad:{ name:'Launch Pad', icon:'🚀', kind:'building', w:2,h:2, hp:850,  cost:250, build:28, sight:5, supply:0, color:'#5a6b8a',
              flavor:'Starport. Assembles Courier Drones and Buzzword Bombers. Requires a Garage.' },
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
    aggression:1.0,
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
    enemies:[ {x:78,y:62, extraBarracks:true, defenders:4}, {x:80,y:16, extraBarracks:true, defenders:4}, {x:42,y:66, extraBarracks:true, defenders:4}, {x:48,y:36, extraBarracks:true, defenders:4} ],
    objective:'THE BOARD seized FOUR strongholds to oust you. Raze all four for the ultimate exit. You have maximum Funding — make it count.',
    lakes:[ {x:44,y:36,r:7},{x:28,y:20,r:4},{x:60,y:24,r:4},{x:34,y:54,r:4},{x:66,y:48,r:3} ],
    rockClusters:[ {x:52,y:16,n:18},{x:34,y:28,n:16},{x:64,y:34,n:16},{x:22,y:46,n:12},{x:56,y:56,n:14},{x:72,y:54,n:10} ],
    forests:[ {x:18,y:18,n:30},{x:50,y:48,n:26},{x:68,y:30,n:22},{x:34,y:60,n:20},{x:74,y:64,n:16},{x:24,y:34,n:16} ],
    goldNodes:[ {x:4,y:4,amt:3200},{x:11,y:3,amt:3000},{x:3,y:12,amt:3000},{x:13,y:11,amt:2600},{x:6,y:14,amt:2400},
                {x:81,y:64,amt:1800},{x:75,y:65,amt:1800},{x:83,y:14,amt:1800},{x:77,y:11,amt:1800},{x:39,y:68,amt:1800},{x:45,y:69,amt:1800},
                {x:44,y:38,amt:4000},{x:30,y:30,amt:2600},{x:58,y:42,amt:2600},{x:50,y:24,amt:2400} ],
  }
];

