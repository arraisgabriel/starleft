/* maps_data.js — the campaign MAP DEFINITIONS (the `MAPS` array), extracted from config.js so the
   map editor (map-editor.html) can rewrite ONLY this file with zero risk to game logic.
   `const MAPS` stays a shared global across the classic scripts (same as TILE/DEF). Loaded right
   after config.js (which defines TILE/biome constants/DEF that this data is authored against) and
   before map.js (newMap reads MAPS). | STARLEFT (classic scripts) */
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
    // THE SEVERANCIER (internal id cyan_ninja) — A&O's lone cleanup contractor. DEFERRED: he does not
    // exist at map load; villainDeferredSpawn (villains.js) surfaces him the moment the `raze` quest
    // completes (all eight campuses razed), at a mid-map tile snapped to open ground, fog revealed.
    // Defeating (or routing) him is the `duel` quest; victory then runs the existing Ep VII flash.
    villain:{ id:'cyan_ninja', x:48, y:72, after:'raze' },
    objective:'THE CONGLOMERATE holds EIGHT campuses around a dead sea — liquidate all eight to draw out THE SEVERANCIER, A&O\'s cleanup contractor, then put him down. TWO abandoned outposts sit in the middle: reach them with a unit to reclaim them and fight from the front.',
    quests:[
      { id:'raze',    text:'Raze all eight CONGLOMERATE campuses',                 type:'razeAll', required:true },
      { id:'duel',    text:'Put down THE SEVERANCIER — A&O\'s cleanup contractor', type:'defeatVillain', required:true },
      { id:'reclaim', text:'Reclaim BOTH outposts on the dead sea',                type:'reclaimOutposts', count:2, reward:150 },
      { id:'peak',    text:'Keep peak headcount above 20',                         type:'peakSupply', count:21, reward:75 },
      { id:'noflee',  text:'No escape clause — finish him before he slips away',   type:'bossNoFlee', reward:100 },
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
    "name": "XI — The Launch",
    "enemyName": "A&O",
    "enemyFaction": "ao",
    "aggression": 1.8,
    "startGold": 1100,
    "startWorkers": 7,
    "startSoldiers": 5,
    "startBarracks": true,
    "graceTime": 120,
    "waveTimer": 116,
    "crawl": {
      "episode": "EPISODE XI",
      "title": "THE LAUNCH",
      "text": "Biba is free and the blueprint is yours, but a blueprint is not a factory. A&O has the only one that works, The DARK TOWER.\n\nThe altar stands at the top of A&O's peninsula: a black spire on a spit of land in a coolant sea, where the GRAAL writes the dying into fresh metal and the dead into product. The keynote is scheduled; the line to the people who live inside went quiet long ago.\n\n{?party}The pilgrimage walks in with you: {party} — the survivors of every battle since the crater, here to take the thing that was built to take them.{/party}{^party}You walk the road alone. Everyone who carried you this far went on ahead, into the ground.{/party}{?fallen} You carry the wall with you too — {fallen} — names A&O filed as churn, the reason you march toward the altar instead of away from it.{/fallen}{?biba} Biba walks toward the tower that built her work and says the chip cannot tell salvation from theft. She solders anyway.{/biba}\n\nFight down the guided road, liquidate all SIX A&O campuses between you and the sea, and seize the dark tower at the peninsula's end. Steal the GRAAL before they ship it — the machine that writes a lost mind back into fresh metal.\n\nIt's time to bring them back as something that can still fight beside you.",
      "summary": "Biba is free and the blueprint is yours — but a blueprint is not a factory, and A&O owns the only one that works: the DARK TOWER, a black spire on a peninsula in a coolant sea, the machine that writes a lost mind back into fresh metal. The keynote is scheduled. Fight down the guided road, liquidate all six A&O labs between you and the sea, and seize the tower before they ship. It's time to bring them back."
    },
    "w": 96,
    "h": 156,
    "seed": 11,
    "player": {
      "x": 51,
      "y": 5
    },
    "terrain": {
      "biomes": [
        "tech"
      ],
      "seaFrac": 0.12,
      "mtnFrac": 0.08,
      "forest": 0
    },
    "enemies": [
      {
        "x": 26,
        "y": 39,
        "defenders": 3
      },
      {
        "x": 79,
        "y": 38,
        "defenders": 3
      },
      {
        "x": 48,
        "y": 66,
        "extraBarracks": true,
        "defenders": 4
      },
      {
        "x": 16,
        "y": 92,
        "defenders": 3
      },
      {
        "x": 52,
        "y": 108,
        "defenders": 4
      }
    ],
    "scenery": [
      {
        "type": "darktower",
        "x": 46,
        "y": 134
      }
    ],
    "holdout": {
      "quest": "graal",
      "requires": "raze",
      "anchor": {
        "type": "darktower"
      },
      "zone": {
        "radius": 32
      },
      "trigger": {
        "reachRadius": 3
      },
      "spawns": [
        {
          "x": 41,
          "y": 135
        },
        {
          "x": 55,
          "y": 135
        },
        {
          "x": 44,
          "y": 140
        },
        {
          "x": 48,
          "y": 141
        },
        {
          "x": 51,
          "y": 140
        }
      ],
      "resetOnUndefended": true,
      "scaleWithRoster": true,
      "gapSec": 3,
      "graceSec": 12,
      "framing": {
        "label": "GRAAL TRANSFER",
        "cutscene": "EP11_ALTAR_LINES",
        "armPrompt": "📡 The five A&O labs are ash. Bring a unit to the DARK TOWER to begin the seizure.",
        "startToast": "📡 GRAAL transfer initiated — hold the altar. A&O counter-intrusion inbound.",
        "abortToast": "⚠ GRAAL transfer aborted — the altar fell undefended. Re-secure it."
      },
      "waves": [
        {
          "comp": [
            [
              "soldier",
              4
            ],
            [
              "ranger",
              2
            ]
          ]
        },
        {
          "comp": [
            [
              "soldier",
              5
            ],
            [
              "hustler",
              3
            ],
            [
              "ranger",
              2
            ]
          ]
        },
        {
          "comp": [
            [
              "soldier",
              6
            ],
            [
              "lobbyist",
              2
            ],
            [
              "foodtruck",
              2
            ]
          ]
        },
        {
          "comp": [
            [
              "soldier",
              4
            ],
            [
              "ranger",
              3
            ]
          ],
          "boss": {
            "id": "ao_ninja"
          }
        }
      ]
    },
    "objective": "Liquidate the five A&O labs down the road, then bring a unit to the DARK TOWER and hold the altar to seize the GRAAL.",
    "quests": [
      {
        "id": "raze",
        "text": "Liquidate the five A&O labs",
        "type": "razeAll",
        "required": true
      },
      {
        "id": "graal",
        "text": "Seize the GRAAL — hold the Dark Tower altar",
        "type": "holdout",
        "required": true
      },
      {
        "id": "heroes",
        "text": "Walk NINO and BIBA to the altar alive",
        "type": "heroesAlive",
        "reward": 150
      },
      {
        "id": "fund",
        "text": "Fund the pilgrimage — mine 12,000 on the road",
        "type": "accumulateFunding",
        "amount": 12000,
        "reward": 100
      }
    ],
    "rockClusters": [
      {
        "x": 28,
        "y": 30,
        "n": 14
      },
      {
        "x": 28,
        "y": 52,
        "n": 14
      },
      {
        "x": 30,
        "y": 74,
        "n": 14
      },
      {
        "x": 30,
        "y": 104,
        "n": 14
      },
      {
        "x": 66,
        "y": 30,
        "n": 14
      },
      {
        "x": 66,
        "y": 52,
        "n": 14
      },
      {
        "x": 64,
        "y": 74,
        "n": 14
      },
      {
        "x": 64,
        "y": 104,
        "n": 14
      },
      {
        "x": 12,
        "y": 84,
        "n": 16
      },
      {
        "x": 12,
        "y": 100,
        "n": 16
      },
      {
        "x": 20,
        "y": 78,
        "n": 14
      },
      {
        "x": 20,
        "y": 106,
        "n": 14
      },
      {
        "x": 28,
        "y": 88,
        "n": 12
      }
    ],
    "lakes": [
      {
        "x": 10,
        "y": 54,
        "r": 5
      },
      {
        "x": 86,
        "y": 54,
        "r": 5
      },
      {
        "x": 12,
        "y": 119,
        "r": 6
      },
      {
        "x": 84,
        "y": 118,
        "r": 6
      },
      {
        "x": 29,
        "y": 130,
        "r": 11
      },
      {
        "x": 64,
        "y": 129,
        "r": 8
      },
      {
        "x": 62,
        "y": 137,
        "r": 10
      },
      {
        "x": 30,
        "y": 131,
        "r": 11
      }
    ],
    "goldNodes": [
      {
        "x": 44,
        "y": 5,
        "amt": 2600
      },
      {
        "x": 50,
        "y": 6,
        "amt": 2400
      },
      {
        "x": 42,
        "y": 11,
        "amt": 2200
      },
      {
        "x": 30,
        "y": 34,
        "amt": 1800
      },
      {
        "x": 66,
        "y": 34,
        "amt": 1800
      },
      {
        "x": 48,
        "y": 58,
        "amt": 3000
      },
      {
        "x": 24,
        "y": 64,
        "amt": 1800
      },
      {
        "x": 72,
        "y": 64,
        "amt": 1800
      },
      {
        "x": 18,
        "y": 96,
        "amt": 2200
      },
      {
        "x": 54,
        "y": 113,
        "amt": 1800
      },
      {
        "x": 42,
        "y": 112,
        "amt": 1800
      },
      {
        "x": 46,
        "y": 149,
        "amt": 3500
      },
      {
        "x": 42,
        "y": 152,
        "amt": 2000
      },
      {
        "x": 45,
        "y": 152,
        "amt": 2000
      }
    ],
    "thickets": [],
    "forests": [],
    "lostBases": [],
    "guards": [],
    "captives": [],
    "paint": "163x265;w:q7j,1,1,1,1,1,1,1,1,4b,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3p,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3n,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3n,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3n,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3n,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3n,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3s,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3x,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4c,1,1,1,1,1,m3,1,4e,4,1,4d,1,4f,1,1,1,1,4d,1,1,1,1,1,1,47,1,1,3,1,1,1,1,1,1,1,1,1,45,1,1,2,1,1,1,1,1,1,1,48,1,1,1,1,1,1,1,1,2,1,48,1,1,1,1,1,1,1,2,1,1,45,1,1,1,1,1,1,1,1,1,1,1,1,1,1,45,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,43,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4d,1,1,1,1,1,1,4d,1,1,1,1,1,1,4d,1,1,1,1,1,1,1,4c,1,1,1,1,1,1,1,m,1,3n,1,1,1,1,1,1,1,1,1,m,1,3k,1,1,1,1,1,1,1,1,1,1,1,1,1,l,1,3k,1,1,1,1,1,1,1,1,1,1,1,1,m,3l,1,1,1,1,1,1,1,1,1,1,1,4c,1,1,1,1,1,1,4d,1,1,1,4g,1,1,1|s:rln,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,42,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,41,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,41,1,1,1,1,b,1,1,1,3w,1,1,3,1,1,d,1,1,1,3w,1,1,3,1,1,d,1,1,3x,1,1,1,1,1,1,1,d,1,1,3x,1,1,1,1,1,1,1,d,1,1,3x,1,1,1,1,1,1,1,d,1,1,3z,1,1,1,1,1,c,1,1,1,3w,1,1,1,1,1,1,1,1,1,1,1,8,1,1,1,1,4,1,1,3q,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,1,1,3q,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,1,1,3q,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3s,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3t,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3t,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3v,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3w,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3w,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3z,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,40,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,40,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,41,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,48,1,1"
  },
  {name:'XII — The Siege Line',enemyName:'A&O',enemyFaction:'ao',aggression:2.00,startGold:200,startWorkers:6,startSoldiers:7,startUnits:[{type:'lobbyist',n:3}],graceTime:118,waveTimer:112,crawl:{episode:'EPISODE XII',title:'THE SIEGE LINE',text:'You hold the GRAAL now, and the Wake in your H.U.B. hums with it — your dead, written back into metal, one at a time. A&O cannot abide a rival who gives the product away.\n\nSo it stops litigating and starts marching. Forward bases bloom across the approaches to the H.U.B. — staging yards, armor depots, artillery sheds — each one a step closer to the altar they mean to level before you can scale it. Let the line reach the gates and the Wake goes dark.\n\nBreak their forward bases. Shatter the assault at its staging grounds and the whole column loses its nerve and falls back. Push them off the approach....',summary:`A&O can't abide that you hold the GRAAL and a working Wake, so it stops sending lawyers and sends an army — forward bases creeping up the approaches to your H.U.B. to level the altar before you can scale it. Shatter all six staging bases and break the assault before it reaches the gates.`},reachCutscene:{name:'EP12_SIEGE_LINES',at:{x:55,y:48},radius:6},objective:'A&O\'s siege has cut your supply lines — the H.U.B. coffers are nearly dry. March an expeditionary force out, seize a funding crystal on their lines and raise a Satellite Office to bankroll the counter-push, then liquidate all SIX forward staging bases to shatter the assault and force a retreat.',quests:[{id:'raze',text:'Shatter all six forward staging bases',type:'razeAll',required:true},{id:'kills',text:'Repel the assault — decommission 150 A&O troops',type:'killUnits',count:150,reward:125},{id:'churn',text:'Hold the line — keep losses under 50',type:'maxUnitsLost',count:49,reward:100}],w:118,h:96,seed:12012,terrain:{biomes:['tech','ice'],temp:{axis:'diag',base:0.26,gradient:0.18,noise:0.14},freeze:0.24,seaFrac:0.14,mtnFrac:0.08,forest:0,beach:true},player:{x:8,y:88},enemies:[{x:106,y:8,defenders:7,extraBarracks:true},{x:106,y:84,defenders:7,extraBarracks:true},{x:58,y:10,defenders:6,extraBarracks:true},{x:62,y:84,defenders:6},{x:92,y:48,defenders:7,extraBarracks:true},{x:34,y:28,defenders:5}],goldNodes:[{x:55,y:52,amt:4200},{x:42,y:44,amt:3000},{x:76,y:42,amt:3000},{x:96,y:54,amt:2500},{x:110,y:12,amt:1900},{x:110,y:82,amt:1900},{x:58,y:6,amt:1900},{x:64,y:90,amt:1900}],lakes:[{x:56,y:48,r:7},{x:86,y:26,r:5},{x:30,y:66,r:4},{x:74,y:72,r:4}],rockClusters:[{x:48,y:25,n:18},{x:70,y:30,n:16},{x:88,y:62,n:18},{x:24,y:48,n:14},{x:60,y:68,n:16}],forests:[],thickets:[{x:38,y:34,w:22,h:14,density:0.72,mix:0.25,trail:'h'},{x:80,y:34,w:18,h:18,density:0.66,mix:0.15,trail:'v'}]},
  {
    name:'XIII — The Liquidation',
    // Arc-2 CLIMAX → Arc-3 PIVOT. After the siege breaks (Ep XII), A&O forecloses the hard way and
    // fields REX — the walking-foreclosure superboss — marching on the H.U.B. to level the Wake.
    // NO LONGER finale:true: REX is A&O's WEAPON, not the end of the war. Beating it routes onward to
    // Ep XIV (the CEO arc, Dell Tusk), via villainNextLinear skipping the appended villain block to the
    // appended linear XIV. (finaleVillainIndex() is isVillain-gated, so XIII was never the finale-villain;
    // dropping finale:true simply lets onVictory continue instead of firing the IPO. The real finale —
    // Tusk-in-REX — carries finale:true when Arc 3 completes.) The rex villain def stays in villains.js,
    // reserved for that Ep XXIII re-skin. Carried roster + Nino/Biba arrive by carryover (no cfg.heroes);
    // the prelude plays as the fight opens.
    isVillain:false, displayEp:'XIII',
    enemyName:'A&O', enemyFaction:'ao',          // → founder _ao green sheet + A&O ground treatment
    aggression:1.0, startGold:1800, startWorkers:6, startSoldiers:8, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves; the villain IS the encounter
    crawl:{ episode:'EPISODE XIII', title:'THE LIQUIDATION',
      text:'A&O stops sending bases. It sends a building that walks.\n\nThe siege broke on your forward line and the fund did the math: cheaper to foreclose the whole property than to keep losing crews to it. So it fields REX — five stories of black alloy and toxic light, the foreclosure made flesh — and it is walking straight for the H.U.B. and the Wake humming inside it. It does not negotiate the vesting cliff. It IS the cliff.\n\nCrack its core before it overclocks and goes feral, or be the next name on the wall. Bring everyone. Bring everything....',
      summary:`The siege failed, so A&O forecloses the hard way: REX — a five-story mech of black alloy and toxic-green light, the foreclosure made flesh — marches on the H.U.B. to level the Wake and everyone guarding it. Survive the assault, then the enrage when its core goes critical. The hardest fight of the war so far — but REX is just the fund's hammer, and the hand that swings it has deeper pockets than this.` },
    // story-polish §5: the finale prelude (Nino/Biba) plays once as the fight opens (carryover heroes present)
    introCutscene:'REX_PRELUDE_LINES',
    objective:"Destroy A&O's REX before it reaches the Wake. It hits like a foreclosure and turns berserk below 40% — spread out and keep your healers alive.",
    quests:[
      { id:'rex',    text:'Destroy REX — crack the core before it cracks you',   type:'defeatVillain', required:true },
      { id:'heroes', text:'Bring NINO and BIBA through the foreclosure',         type:'heroesAlive', reward:150 },
      { id:'lean',   text:'Keep the final invoice under 12 names',               type:'maxUnitsLost', count:11, reward:150 },
    ],
    // Ep XIII arena TRIPLED in size (authored coords/dims ×3 over the original 40×34) so REX's march on the
    // Wake plays out across a much larger battlefield with room to maneuver, spread out, and out-produce it.
    // The global MAP_SCALE (×1.7) still applies on top → final ~204×173 in-game (on par with Ep XII).
    // Everything below scales uniformly about the origin, so the base↔coolant-node↔REX geometry is preserved.
    w:120, h:102, seed:13013,
    player:{ x:18, y:84 },
    terrain:{ biomes:['tech'], seaFrac:0.05, mtnFrac:0.06, forest:0 },
    enemies:[],                                  // boss duel — no enemy bases; the villain IS the encounter
    villain:{ id:'rex', x:90, y:27 },
    // COOLANT NODE (villains.js bossNodeTick): hold it with a detachment for ~3s to FORCE REX's EXPOSED window
    // on demand — a "use the map" play that splits the army between the node and the fight. Mid-arena, on the
    // approach to REX so holding it means pushing forward (risk/reward). Optional layer atop the AoE/overheat.
    // NB: bossNodes bypass MAP_SCALE, so its coords ARE final tiles — ×3 over the old (20,14) keeps it in sync.
    bossNodes:[ {x:60,y:42,holdSec:3,cd:18,radius:3.0} ],   // radius bumped 2.0→3.0 for the larger arena
    lakes:[ {x:42,y:18,r:9} ], rockClusters:[ {x:36,y:36,n:14}, {x:78,y:78,n:14}, {x:60,y:66,n:12} ], forests:[],
    // Boss DUEL has no enemy/contested nodes, so the T2-5 home-node nerf (ECON.homeNodeMul) has no macro-tension
    // to enforce here → honor authored funding literally. Two FRESH near-base nodes add +5,000 funding so the
    // player can field a bigger army of troops + healers for the tripled-size REX fight.
    noEconRebalance:true,
    goldNodes:[
      {x:21,y:90,amt:2400}, {x:12,y:75,amt:2000}, {x:33,y:93,amt:2000},   // original home cluster (positions ×3)
      {x:60,y:54,amt:2600},                                               // mid-arena, on the approach to REX
      {x:13,y:88,amt:2500}, {x:25,y:80,amt:2500},                         // +5,000 fresh funding by the start base
    ],
  },
  /* ============================ VILLAINS (BIG BOSSES) ============================
     APPENDED past the linear campaign so indices 0–12 (Episodes I–XIII) never shift — save compat,
     the hard-coded mapIndex===6 / MAPS[7] hooks, and Madosis episode numbers all stay valid. Each is
     a boss-duel ARENA: no enemy bases (enemies:[]), one oversized villain (cfg.villain → villains.js).
     `isVillain` exempts them from index↔Roman validation and the linear Quarter numbering; `gateAfter`
     /`returnTo` route the campaign (villains.js: villainGateBefore/villainNextLinear). The win
     condition is "defeat the villain" (core.js checkWinLose → villainCheckWinLose). */
  {
    // RETIRED arena. THE SEVERANCIER (cyan_ninja) is now the climax of Episode VII (MAPS[6], deferred
    // villain spawned when `raze` completes). This standalone entry is kept ONLY to preserve appended
    // villain indices (REX etc. must not shift — save compat). `hidden:true` removes it from the map
    // pickers; dropping gateAfter/returnTo makes villainGateBefore never route the campaign through it.
    name:'THE SEVERANCIER',                      // isVillain → no Roman-numeral requirement
    isVillain:true, hidden:true, displayEp:'7.5',
    enemyName:'THE SEVERANCIER',
    aggression:1.0, startGold:600, startWorkers:4, startSoldiers:4, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves
    crawl:{ episode:'EPISODE 7.5', title:'THE SEVERANCIER',
      text:'The blast still rings in the dark when a single blade of cyan light unfolds from the smoke. No company. No army. One operator, fast as rumor, paid to make sure nothing crawls out of the crater.\n\nTHE SEVERANCIER answers to no name and moves like the network itself — there, then gone. Pin him on this scorched slab and put him down, or the next quarter never opens. He does not intend to die here. He intends to leave.',
      summary:`A&O filed a cleanup contract before the ash cooled, and this is the contractor: a lone operator in cyan, impossibly fast, paid to bury whatever crawled out of the flash. There is no campus to raze here, only the duel. Break him before he slips the net and vanishes into the sprawl.` },
    w:30, h:24, seed:7050,
    player:{ x:5, y:18 },
    terrain:{ biomes:['tech'], seaFrac:0.04, mtnFrac:0.06, forest:0 },
    objective:'Defeat THE SEVERANCIER — he is fast and will flee when wounded. Corner and finish him.',
    quests:[
      { id:'duel',   text:'End THE SEVERANCIER\'s contract',                         type:'defeatVillain', required:true },
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
    // RETIRED as the standalone finale: the REX fight now lives in the linear Ep XIII (MAPS[12],
    // finale:true). This entry is kept ONLY as an index spacer (no finale / gateAfter / returnTo →
    // unreachable) so appended-villain indices and saved villainCleared keys don't shift. The rex
    // villain def stays in villains.js, reserved for the Arc-3 (Ep XXIII) Tusk-piloted REX re-skin.
    isVillain:true, hidden:true, displayEp:'FINALE',
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
    name:'THE BRIDGE ROUND',                     // RETIRED interlude (was 12.5 between XII and XIII) — its story rode the deleted stolen-lattice plot
    isVillain:true, hidden:true, displayEp:'12.5',   // no gateAfter/returnTo → never routed; kept as an index spacer (save-compat)
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

  /* ============================ ARC 3 — THE A&O CEO ARC (Dell Tusk) ============================
     APPENDED past the linear campaign AND the existing villain block (indices 13–18) so no existing
     index shifts (save compat; the mapIndex===6 / MAPS[7] / wakeAppearIdx / rebornUnlockIdx hooks all
     stay valid). villainNextLinear() walks PAST the appended villain entries to reach these appended
     LINEAR episodes, so XIII→XIV→XV→(gated XV.5)→XVI routes correctly. Episode numbering validates via
     the NON-VILLAIN ordinal (XV.5 is isVillain → skipped, so XVI is the 16th linear map = "XVI").
     Block 1 of Arc 3 (design: docs/story-next-steps-ceo-arc.md §4–5). Hero Pedro "Rust" (founder skin,
     spriteType 'rust') is fielded as the XV duel boss, defects on the win, then deploys via cfg.heroes
     on XV.5 + XVI (captureHeroes rebuilds carryover from on-field heroes, so a duel-recruit can't be
     pushed onto carryover directly — cfg.heroes is the idiomatic first-appearance, like Nino on Ep VIII).
     vetCarryOverride:7 freezes the carry cap (vetCarryCountFor) so a maxed roster never exceeds HQ supply.
     Temp end of shipped content: XVI carries toBeContinued → the "TO BE CONTINUED" card instead of the IPO
     (no finale:true anywhere now; the real finale, Tusk-in-REX, lands when the rest of Arc 3 ships). */
  {
    name:'XIV — THE RECALL NOTICE',
    isVillain:false, displayEp:'XIV', vetCarryOverride:7,
    enemyName:'A&O', enemyFaction:'ao',
    // TWO-ACT: PHASE 1 = holdout (14 escalating recovery waves at the H.U.B.); PHASE 2 = raze the 4 repo
    // camps once the siege breaks. aggression is LOW so the scripted holdout (not the camps) is the phase-1
    // threat — the t=1080 event bumps it once the recovery crews are meant to be broken. startGold funds
    // both the hold and the counter-attack army.
    aggression:1.0, startGold:3000, startWorkers:10, startSoldiers:10, startBarracks:true,
    graceTime:95, waveTimer:92,
    crawl:{ episode:'EPISODE XIV', title:'THE RECALL NOTICE',
      text:'The cure for death is yours, and the invoice just cleared legal.\n\nA&O does not send an army first; it sends a filing. CHAPTER ELEVEN — the fund that owns the beginning and the end declares your company a delinquent asset and your dead its repossessed inventory. And the man who signs it finally gives the fund a face: DELL TUSK, managing partner, who calls the flash a migration event, calls your memorial a liability he is rightsizing, and calls himself the adult in the room.\n\nHis recovery crews are already at the fence, and a countdown to zero the backups began the moment he spoke. Hold the H.U.B. perimeter until the recovery crews break — then take the fight to the fund and raze all four repo camps. Make the repossession expensive, then make it personal....',
      summary:`The cure for death is yours — so A&O files CHAPTER ELEVEN, declaring your company a delinquent asset and your dead its repossessed inventory, and the fund finally wears a face: managing partner Dell Tusk. His recovery crews test the H.U.B. fence while a clock to erase the backups starts ticking. Hold the perimeter until the recovery crews break, then counter-attack and raze all four A&O repo camps. Make the repossession expensive — then make it personal.` },
    objective:'PHASE 1 — HOLD the H.U.B. perimeter and break all 14 A&O recovery waves. PHASE 2 — with the siege broken, COUNTER-ATTACK and raze all four A&O repo camps. Victory needs both.',
    quests:[
      { id:'hold',  text:'Hold the H.U.B. perimeter — break all 14 A&O recovery waves', type:'holdout', required:true },
      { id:'raze',  text:'Counter-attack — raze all four A&O repo camps',              type:'razeAll', required:true, requires:'hold' },
      { id:'repel', text:'Repel the repossession — decommission 180 A&O crew',         type:'killUnits', count:180, reward:120 },
      { id:'lean',  text:'Disciplined defense — keep total losses under 30',           type:'maxUnitsLost', count:29, reward:120 },
    ],
    // PHASE 1 wave-defense. anchor is explicit coords (NOT {type:'hq'} — the 4 enemy camps are also
    // type:'hq' and would bind the wrong base). resetOnUndefended:false so pushing out for PHASE 2 never
    // wipes hold progress; the organic punishment for abandoning the base is the wave razing your HQ.
    // No boss — the composition/size curve carries the finale (W14 is the spike). scaleWithRoster keeps
    // it honest for veteran carryover and co-op.
    holdout:{
      quest:'hold',
      anchor:{ x:48, y:40 },
      zone:{ radius:12 },
      trigger:{ reachRadius:16 },
      // Stage in the clear DIAGONAL lanes: the N/S/E/W mid-approaches hold the rock clusters
      // (48,20)/(48,60)/(24,48)/(72,32) and the lakes (30,30)/(66,50) sit off the NW/SE — crews funnel
      // AROUND them toward the base. All points ≥7 tiles from every rock/lake center (incl. the +2y/±1x
      // spawn jitter) because mkUnit places on the exact tile and does NOT snap off a blocker.
      spawns:[
        { x:64, y:22 }, { x:66, y:24 },   // NE lane
        { x:32, y:18 }, { x:24, y:20 },   // NW lane
        { x:64, y:58 }, { x:72, y:56 },   // SE lane
        { x:32, y:58 }, { x:26, y:58 },   // SW lane
      ],
      resetOnUndefended:false,
      scaleWithRoster:true,
      gapSec:20,
      framing:{
        label:'PERIMETER',
        armPrompt:'📡 CHAPTER ELEVEN served — A&O recovery crews are breaching the fence. HOLD the H.U.B. perimeter.',
        startToast:'⚠ Dell Tusk\'s recovery crews hit the perimeter. Hold the line — the staging camps come after.',
        abortToast:'⚠ The perimeter buckled — re-form on the H.U.B.',
      },
      waves:[
        { comp:[['soldier',5],['ranger',2]] },                                              // W1  light probe
        { comp:[['soldier',6],['ranger',3]] },                                              // W2
        { comp:[['soldier',6],['hustler',3],['ranger',2]] },                                // W3
        { comp:[['soldier',7],['hustler',3],['ranger',3]] },                                // W4
        { comp:[['soldier',6],['lobbyist',2],['foodtruck',2],['ranger',2]] },               // W5  armor arrives
        { comp:[['soldier',8],['hustler',4],['ranger',3]] },                                // W6
        { comp:[['soldier',7],['lobbyist',3],['foodtruck',2],['ranger',3]] },               // W7
        { comp:[['soldier',9],['hustler',4],['lobbyist',2],['ranger',3]] },                 // W8
        { comp:[['soldier',8],['lobbyist',3],['foodtruck',3],['hustler',3],['ranger',3]] }, // W9  combined arms
        { comp:[['soldier',10],['hustler',5],['ranger',4]] },                               // W10
        { comp:[['soldier',9],['lobbyist',4],['foodtruck',3],['ranger',4]] },               // W11
        { comp:[['soldier',11],['hustler',5],['lobbyist',3],['ranger',4]] },                // W12
        { comp:[['soldier',10],['lobbyist',4],['foodtruck',4],['hustler',5],['ranger',4]] },// W13
        { comp:[['soldier',12],['hustler',6],['lobbyist',4],['foodtruck',3],['ranger',6]] },// W14 finale (biggest)
      ],
    },
    w:96, h:80, seed:14014,
    player:{ x:48, y:40 },
    terrain:{ biomes:['tech'], temp:{ axis:'diag', base:0.30, gradient:0.14, noise:0.14 }, seaFrac:0.06, mtnFrac:0.06, forest:0 },
    enemies:[ {x:10,y:10, defenders:6, extraBarracks:true}, {x:86,y:10, defenders:6}, {x:10,y:70, defenders:6}, {x:86,y:70, defenders:6, extraBarracks:true} ],
    // The holdout owns phase-1 pressure; these are flavor + a time-approximated "siege broken" beat that
    // wakes the camps for the PHASE-2 assault (there's no phase-transition event hook, so it's clock-based).
    events:[
      { atTime:300,  toast:'Tusk: "The migration is on schedule. Your perimeter is a rounding error."' },
      { atTime:720,  toast:'Recovery crews regrouping — the heaviest filing is inbound. Hold.' },
      { atTime:1080, toast:'The recovery crews are broken. The fence is yours — now repossess THEM. Raze all four repo camps.', aggression:1.4 },
    ],
    lakes:[ {x:30,y:30,r:4}, {x:66,y:50,r:4} ],
    rockClusters:[ {x:48,y:20,n:14}, {x:48,y:60,n:14}, {x:24,y:48,n:12}, {x:72,y:32,n:12} ],
    forests:[],
    goldNodes:[ {x:46,y:38,amt:3000},{x:52,y:42,amt:2800},{x:44,y:44,amt:2400},{x:54,y:36,amt:2400},
                {x:14,y:14,amt:1800},{x:82,y:14,amt:1800},{x:14,y:66,amt:1800},{x:82,y:66,amt:1800} ],
  },
  {
    name:'XV — THE FOUNDRY RAID',
    isVillain:false, displayEp:'XV', vetCarryOverride:7,
    enemyName:'A&O', enemyFaction:'ao',
    aggression:2.0, startGold:2600, startWorkers:10, startSoldiers:10, startBarracks:true,
    graceTime:110, waveTimer:105,
    crawl:{ episode:'EPISODE XV', title:'THE FOUNDRY RAID',
      text:'Tusk does not build soldiers; he stamps them.\n\nOne A&O foundry on the coolant coast prints the foreclosure — a line of Founder Mechs, each a repossession on legs, and every one it stamps is one more body marching on the wall. Burn the foundry down before it floors the quarter.\n\nThey will send their contracted test pilot to stop you. He fights like a man with nothing left to lose. He is about to read his own file and find out he is right....',
      summary:`Tusk doesn't recruit his army — he stamps it, from one A&O foundry on the coolant coast printing foreclosure-mechs on a line. Raze the foundry to break the assembly before it floods the war, then out-duel the test pilot A&O sends to stop you. He fights like he has nothing left to lose.` },
    objective:'Raze all FIVE A&O foundry campuses to break the foreclosure-mech line and draw out the test pilot — then out-duel him. Win, and the man behind the suit changes sides.',
    quests:[
      { id:'raze', text:'Raze all five A&O foundry campuses',                 type:'razeAll', required:true },
      { id:'duel', text:'Out-duel the A&O test pilot once he is drawn out',   type:'defeatVillain', required:true },
      { id:'kills',text:'Scrap the assembly — decommission 110 A&O crew',     type:'killUnits', count:110, reward:100 },
      { id:'lean', text:'Keep losses under 18',                               type:'maxUnitsLost', count:17, reward:100 },
    ],
    w:112, h:92, seed:15515,
    player:{ x:10, y:82 },
    terrain:{ biomes:['tech','ice'], temp:{ axis:'diag', base:0.30, gradient:0.18, noise:0.14 }, freeze:0.22, seaFrac:0.16, mtnFrac:0.07, forest:0, beach:true },
    enemies:[ {x:100,y:10, defenders:6, extraBarracks:true}, {x:60,y:12, defenders:6}, {x:104,y:80, defenders:7, extraBarracks:true}, {x:56,y:82, defenders:6}, {x:90,y:46, defenders:7, extraBarracks:true} ],
    // RUST — A&O's contracted Founder-Mech test pilot. DEFERRED: surfaces the moment the `raze` quest
    // completes (villainDeferredSpawn), snapped to open ground mid-map. Out-duel him → defection toast
    // (bossOutcome rust hook); he then deploys as your hero from XV.5 onward via those maps' cfg.heroes.
    villain:{ id:'rust', x:56, y:46, after:'raze' },
    lakes:[ {x:48,y:30,r:6}, {x:80,y:64,r:5}, {x:30,y:54,r:4} ],
    rockClusters:[ {x:44,y:22,n:16}, {x:70,y:28,n:14}, {x:86,y:60,n:16}, {x:28,y:40,n:12} ],
    forests:[],
    goldNodes:[ {x:6,y:84,amt:3200},{x:12,y:88,amt:3000},{x:8,y:76,amt:2600},{x:20,y:84,amt:2200},
                {x:54,y:48,amt:3500},{x:40,y:40,amt:2800},{x:76,y:40,amt:2800},{x:96,y:54,amt:2400},
                {x:104,y:14,amt:1900},{x:60,y:8,amt:1900},{x:104,y:84,amt:1900},{x:58,y:86,amt:1900} ],
  },
  {
    // ARC-3 INTERLUDE (isVillain → exempt from linear numbering; gateAfter:20 (XV) / returnTo:22 (XVI)
    // route it after XV and back into XVI — villainGateBefore keys on returnTo===22). Reuses the shipped
    // tower_guardian boss (re-arms the dormant `evicted` achievement). Rust DEPLOYS here for the first
    // time via cfg.heroes (fixed dossier); the defeatVillain win + heroesAlive "no hero falls" frames
    // the "defend the defector" beat.
    name:'THE NON-COMPETE',
    isVillain:true, gateAfter:20, returnTo:22, displayEp:'15.5', vetCarryOverride:7,
    crashChainTo:true,   // EP XVI link: on victory, the evac bomber is shot down → Hades-style crash → loads XVI directly (no HUB). returnTo (22=XVI) is the target.
    enemyName:'A&O', enemyFaction:'ao',
    aggression:1.0, startGold:700, startWorkers:4, startSoldiers:5, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves; the warden IS the encounter
    crawl:{ episode:'EPISODE 15.5', title:'THE NON-COMPETE',
      text:'Quitting A&O is a breach of contract, and A&O litigates with ordnance.\n\nA Founder-warden walks the slab with a non-compete bolted to its chassis — company property, the filing says, does not get to resign. It has one directive, and the directive is Rust.\n\nStand on the contract-arena with the man who just changed sides and make the clause unenforceable....',
      summary:`Pedro "Rust" changed sides, and A&O's lawyers answer the only way they know — a Founder-warden with a non-compete bolted to its chassis, dispatched to enforce the clause that says company property cannot resign. Defend the defector on the arena slab and break the warden before it collects.` },
    objective:'A&O sent a Founder-warden to enforce Rust\'s non-compete — destroy it and keep PEDRO "RUST" standing.',
    quests:[
      { id:'duel',   text:'Destroy the A&O Founder-warden',                  type:'defeatVillain', required:true },
      { id:'defend', text:'No hero falls — keep Rust on his feet',           type:'heroesAlive', reward:125 },
      { id:'lean',   text:'Lose no more than 5 staff to the warden',         type:'maxUnitsLost', count:5, reward:75 },
    ],
    w:34, h:28, seed:15521,
    player:{ x:6, y:22 },
    terrain:{ biomes:['tech'], seaFrac:0.04, mtnFrac:0.06, forest:0 },
    enemies:[],                                  // boss duel — no enemy bases; the warden IS the encounter
    villain:{ id:'tower_guardian', x:27, y:7 },
    // Rust's FIRST deployment as a player hero (founder skin). Fixed dossier (gallows-corporate; the
    // depreciated-asset trauma). He carries forward via captureHeroes after this map; XVI re-lists him
    // (dedup by heroId) so a death here doesn't strip him from his own episode.
    heroes:[ { name:'Rust', type:'founder', sprite:'rust', level:6, dossier:{
      first:'Pedro', last:'"Rust"',
      home:'the Detroit-Reclamation rustbelt',
      rel:'crew', relName:'the old line crew',
      family:"Pedro came up tooling exosuits on a union floor in the Reclamation — the kind of shop where the whole crew signed every chassis — until A&O bought the floor and the signatures with it.",
      trauma:'the review that booked him a DEPRECIATED ASSET and wrote him off the quarter he turned fifty, scrapped beside the machines he tooled',
      dream:'to own one thing outright that no quarterly review can ever repossess',
      crime:'welding the foreclosure-mech chassis that now walks on the people he came up with',
    } } ],
    lakes:[], rockClusters:[ {x:14,y:10,n:8}, {x:22,y:18,n:6} ], forests:[],
    goldNodes:[ {x:6,y:24,amt:1500}, {x:4,y:18,amt:1300}, {x:10,y:25,amt:1300} ],
  },
  {
    // EP XVI REWORK — a hero-only ESCAPE across a 25:9 jungle stripe (right→left). Shot down at the end
    // of 15.5, Nino/Rust/Biba walk out with NO base (heroEscape) and 400 m3rits, strip memory chips from
    // the dead along the way (cfg.memBodies → corpses.js), and must reach the far-edge derelict Open-Plan
    // HQ (cfg.lostBases → reclaim) to extract. The EX-TERMINATOR is an escapable PURSUER (event-spawned,
    // NO cfg.villain → victory stays quest-driven). toBeContinued → onVictory's cliffhanger card.
    name:'XVI — THE SEVERANCE PACKAGE',
    isVillain:false, displayEp:'XVI', vetCarryOverride:7, toBeContinued:true,
    introCutscene:'XVI_CRASH_WAKE',   // heroes come to in the downed bomber (mapCutsceneTick, state.time<4s)
    reachCutscene:{ name:'XVI_FRONT_WRECK', at:{ x:52, y:34 }, radius:7 },   // discover the FRONT-half wreck + the dead crew
    enemyName:'A&O', enemyFaction:'ao', heroEscape:true, noCarryVets:true,   // noCarryVets: the veteran roster does NOT deploy (hero-only) — they rode the FRONT half; the dead 10% lie by it
    aggression:1.0, startGold:400, startWorkers:0, startSoldiers:0, startBarracks:false, startUnits:[],
    graceTime:60, waveTimer:80,
    crawl:{ episode:'EPISODE XVI', title:'THE SEVERANCE PACKAGE',
      text:'The extraction ran hot. A&O knew the route, and a bomber put your evac into the canopy three klicks short of the H.U.B.\n\nNino, Rust and Biba climb out of the wreck into a jungle crawling with a recovery division — sent to repossess its "depreciated asset." The dead are everywhere, and every skull still holds a chip. Strip them. One is an A&O unit, and Rust means to read his own file off it.\n\nFight WEST. Reach the far edge, raise the derelict Open-Plan HQ, and call a second bird — before the thing on your trail runs you down....',
      summary:`Shot down three klicks short of the H.U.B., the three heroes fight west on foot through a recovery division, stripping memory chips from the dead. The last — an A&O unit — lets Rust read his own file and find the thread that unravels Dell Tusk. Reach the far-edge Open-Plan HQ and extract before the EX-TERMINATOR catches you.` },
    objective:'Your bird is down. Fight WEST across the jungle with Nino, Rust and Biba — strip the memory chip from every dead body you pass — and reach the derelict Open-Plan HQ at the far edge to extract. Do NOT die to what is chasing you.',
    quests:[
      { id:'memories', text:'Extract the memory chip from all FIVE dead (uncover Tusk\'s secret)', type:'collectMemories', group:'route', required:true },
      { id:'crew',     text:'Discover what happened to the others — read your dead at the front-half wreck', type:'collectMemories', group:'crew', required:true },
      { id:'extract',  text:'Reach the far edge and raise the derelict Open-Plan HQ to extract',   type:'reclaimOutposts', count:1, required:true },
      { id:'heroes',   text:'No hero falls — all three walk out',                                  type:'heroesAlive', reward:150 },
      { id:'cull',     text:'Cut a path west — decommission 25 A&O',                               type:'killUnits', count:25, reward:100 },
    ],
    w:175, h:63, seed:16016, trails:true,   // carve tree-free trails between every POI + dead-ends (map.js carveTrails)
    player:{ x:166, y:31 },
    terrain:{ biomes:['grass','tech'], temp:{ axis:'x', base:0.34, gradient:0.30, noise:0.14 }, seaFrac:0.05, mtnFrac:0.05, forest:0.46, forestClump:0.85 },
    // No PRODUCING enemy bases — for a 3-hero escape they snowball into unsurvivable escalating waves.
    // Instead the corridor is studded with STATIC guard checkpoints (cfg.guards: hold position, excluded
    // from wave reinforcement, ai.js) you fight through one at a time, with lulls between for Biba to heal.
    enemies:[],
    guards:[
      { x:138, y:24, scale:false, comp:[['soldier',3],['hustler',2],['ranger',1]] },                                  // 6 — first contact
      { x:112, y:42, scale:false, comp:[['soldier',3],['ranger',2],['hustler',2],['recruiter',1]] },                  // 8 — ranged screen + a medic
      { x:86,  y:22, scale:false, comp:[['soldier',3],['hustler',3],['ranger',3],['recruiter',1]] },                  // 10 — harasser pack
      { x:60,  y:44, scale:false, comp:[['ranger',3],['soldier',3],['hustler',2],['lobbyist',1],['recruiter',1],['auditor',1]] }, // 11 — first sniper + Auditor siege-wall
      { x:34,  y:24, scale:false, comp:[['soldier',3],['ranger',3],['hustler',2],['lobbyist',2],['recruiter',1],['auditor',1],['founder',1]] }, // 13 — Founder-Mech anchor
      { x:18,  y:42, scale:false, comp:[['soldier',4],['ranger',3],['hustler',2],['lobbyist',2],['recruiter',1],['auditor',1],['founder',1]] }, // 14 — last line before the HQ
    ],
    // the squad — re-listed so all three are guaranteed present regardless of prior deaths (deduped by
    // heroId against the carryover, so a survivor isn't doubled).
    heroes:[
      { name:'Nino', type:'lobbyist', sprite:'nino', level:11, dossier:{
        first:'Nino', last:'',
        home:'the Glitch Sprawl',
        rel:'crew', relName:'the first team',
        family:"Nino ran the lobby in the company's first life — bought the votes, wrote the laws, and watched every name he hired end up on the memorial wall.",
        trauma:'being three streets out when the blast turned the campus into a column of light',
        dream:'to see one thing he helped build outlast the money that funded it',
        crime:'authoring the legislation that made a hundred rivals simply vanish, and only now losing sleep over it' } },
      { name:'Rust', type:'founder', sprite:'rust', level:6, dossier:{
        first:'Pedro', last:'"Rust"',
        home:'the Detroit-Reclamation rustbelt',
        rel:'crew', relName:'the old line crew',
        family:"Pedro came up tooling exosuits on a union floor in the Reclamation — the kind of shop where the whole crew signed every chassis — until A&O bought the floor and the signatures with it.",
        trauma:'the review that booked him a DEPRECIATED ASSET and wrote him off the quarter he turned fifty, scrapped beside the machines he tooled',
        dream:'to own one thing outright that no quarterly review can ever repossess',
        crime:'welding the foreclosure-mech chassis that now walks on the people he came up with' } },
      { name:'Biba', type:'recruiter', sprite:'biba', level:12, dossier:{
        first:'Biba', home:'the flooded arcologies of Lagos-2',
        family:'raised six younger siblings on relief credits',
        trauma:'watched her first squad triaged out of existence by an algorithm',
        dream:'to keep one team alive long enough to age',
        crime:'designing the chip A&O built to chase immortality — then crippling it when she saw who would pay' } },
    ],
    // 5 dead bodies along the corridor — civilians (oxblood) + cyborgs (synthetic/neon). The reveal body
    // (src:'ao', far-left → collected last) carries the Tusk-cyborg truth and fires Rust's reveal cutscene.
    memBodies:[
      { x:150, y:24, src:'civilian', gore:'bleeding', id:'mem_courier',
        text:'A courier in an A&O windbreaker over a fake H.U.B. lanyard. Her last hour was spent running a crate of skimmed insulin toward a tenement that had stopped answering its buzzer. The division flagged the route as "shrinkage" and closed it. She made it eleven streets.' },
      { x:122, y:40, src:'soldier', id:'mem_cyborg',
        text:'A Growth Cyborg — one of yours once, churned to A&O in the Down Round. His chip loops the same ninety seconds: a manager explaining that his pension "vested into the acquirer" and that he should feel grateful to migrate. He was still nodding when the recovery order came for the squad he led.' },
      { x:94, y:22, src:'civilian', gore:'legless', id:'mem_medic',
        text:'A field medic, both legs gone below an artillery line she crossed to reach a downed kid who turned out to be a decoy. Her last memory is not pain — it is the triage algorithm in her visor calmly re-ranking her own odds to "not cost-effective" and cutting her own morphine to preserve stock.' },
      { x:58, y:42, src:'civilian', id:'mem_clerk',
        text:'A records clerk who tried to leak the repossession manifests — the list of names A&O had already written back into inventory. He got two files out before the non-disclosure enforcement found him. The chip still holds the third, half-uploaded: a column titled FOUNDER · EXEMPTIONS, with a single permanent entry.' },
      { x:24, y:30, src:'ao', gore:'headshot', reveal:true, id:'mem_tusk',
        text:'An A&O enforcement unit — the one Rust came for. Its maintenance log is not a memory at all. It is a service record: forty years of firmware, every build signed by the same authoring key — the founder\'s key — with no human re-auth in any of them. Dell Tusk has been a cyborg for many years. The man who signed every layoff stopped being a man before most of the dead here were born.' },
    ],
    // THE OTHER UNITS — the bomber split in two. The heroes rode the BACK half (crashes at the player
    // start). The carried veterans rode the FRONT half, which came down nearer the H.U.B. (left). 90%
    // survived (walking to the H.U.B.); ~10% died — spawnCrewBodies (corpses.js) builds their bodies from
    // the REAL roster near crewWreck, the 'crew' collectMemories quest, and removes the dead permanently.
    wrecks:[ { x:166, y:31, half:'back' }, { x:46, y:34, half:'front' } ],
    crewWreck:{ x:46, y:34 },          // front-half wreck = the dead-crew cluster centre
    // the FINISH: a derelict Open-Plan HQ at the far edge. Walk a hero onto it → reclaimOutposts flips it,
    // the intern boots it (core.js heroEscape hook spends the 400 m3rits + spawns the intern) → extraction.
    lostBases:[ {x:8, y:31} ],
    // Light, well-SPACED pursuit from behind (so you can't just turtle) — small squads, no aggression ramp,
    // so the squad always gets a breather between fights. The EX-TERMINATOR is the recurring HUNTER: it can't
    // be killed, only DRIVEN OFF (a hidden, hero-level-scaled damage pool), then it returns near you (villains.js).
    events:[
      { atTime:45,  toast:'A&O recovery crews are on your tail — keep moving WEST.', spawnSquad:{ comp:[['soldier',2],['hustler',1]] }, at:{x:170,y:31} },
      { atTime:135, toast:'The division is still behind you — don\'t let them pin you.', spawnSquad:{ comp:[['soldier',2],['ranger',1]] }, at:{x:172,y:34} },
      // HUNTER: spawns near the squad WHEREVER they are and chases like a hunter. The repel mechanic is DISCOVERED,
      // never explained — the arrival toast is pure flavor. `hunter:true` → villains.js spawn-near + damage-pool repel.
      { atTime:120, toast:'⚙ THE EX-TERMINATOR has locked onto your squad.', villain:{ id:'ex_terminator_mk2', hunter:true } },
    ],
    lakes:[ {x:118,y:50,r:4}, {x:80,y:12,r:4}, {x:44,y:52,r:4} ],
    rockClusters:[ {x:140,y:30,n:12}, {x:100,y:24,n:14}, {x:60,y:36,n:12}, {x:26,y:24,n:12} ],
    // the main jungle comes from forest+forestClump (groves + clearings); a handful of extra hand-placed
    // COPSES add denser thickets of cramped trees in spots. carveTrails cuts clean lanes through all of it.
    forests:[ {x:150,y:28,n:18},{x:128,y:18,n:16},{x:116,y:46,n:18},{x:96,y:24,n:20},{x:82,y:48,n:16},
              {x:66,y:16,n:18},{x:52,y:44,n:18},{x:38,y:24,n:20},{x:24,y:48,n:16},{x:140,y:50,n:14},
              {x:108,y:54,n:14},{x:74,y:34,n:16},{x:46,y:12,n:14},{x:20,y:30,n:14} ],
    goldNodes:[ {x:12,y:34,amt:2000},{x:6,y:27,amt:1500},{x:14,y:24,amt:1200} ],
  },
  {
    // EX-TERMINATOR INTERLUDE #1 — APPENDED (isVillain → exempt from linear numbering & crawl-index keying,
    // so NOTHING after Ep III shifts). gateAfter:2 (Ep III) / returnTo:3 (Ep IV) route it: villainGateBefore
    // keys on returnTo===3, so finishing Ep III detours here, and the win resumes the linear track at Ep IV.
    // A MYSTERIOUS lone-machine duel — no A&O banner, no Tusk, no GRAAL: just a nameless contractor who
    // appears, hunts, and (for now) dies promising to return. Native sprite, NEVER recolored.
    name:'THE CONTRACTOR',
    isVillain:true, gateAfter:2, returnTo:3, displayEp:'3.5',
    enemyName:'???',
    aggression:1.0, startGold:600, startWorkers:4, startSoldiers:4, startBarracks:true,
    graceTime:9999, waveTimer:9999,              // boss duel — no enemy waves; the machine IS the encounter
    crawl:{ episode:'EPISODE 3.5', title:'THE CONTRACTOR',
      text:'Three campuses fell to you this quarter, and someone took notice.\n\nNo logo rode in with it. No press release, no warband — just one figure that walked through your perimeter like the fence was a suggestion, and a single line on an intercept your analysts can\'t source: contract opened, asset flagged, closure authorized. The asset is you.\n\nIt does not negotiate and it does not stop. Pin the thing down on open ground and put it in the dirt — before it finishes the job it was paid for....',
      summary:`Your wins drew a contract. No faction claims it — just one machine that walked through your perimeter like it wasn't there, hunting you on someone else's invoice. It doesn't negotiate and it doesn't stop. Corner it and put it down before it closes the contract.` },
    objective:'A nameless killing machine has been contracted to end you. There is no base to raze — only the machine. Pin down THE EX-TERMINATOR and destroy it.',
    quests:[
      { id:'duel',  text:'Destroy THE EX-TERMINATOR',                type:'defeatVillain', required:true },
      { id:'hold',  text:'Survive the contract — keep losses under 8', type:'maxUnitsLost', count:7, reward:75 },
    ],
    w:38, h:30, seed:30530,
    player:{ x:6, y:24 },
    terrain:{ biomes:['tech'], seaFrac:0.04, mtnFrac:0.06, forest:0 },
    enemies:[],                                  // boss duel — no enemy bases
    villain:{ id:'ex_terminator', x:30, y:7 },
    villainCutscene:'EXTERM_ARRIVAL_1',          // his nameless arrival — fires when a unit gets NEAR him (not on map load)
    lakes:[], rockClusters:[ {x:16,y:11,n:8}, {x:24,y:20,n:6} ], forests:[],
    goldNodes:[ {x:6,y:26,amt:1500}, {x:4,y:20,amt:1300}, {x:11,y:27,amt:1300} ],
  },
];
