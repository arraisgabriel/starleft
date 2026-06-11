/* skirmish_gen.js — solo Skirmish + Daily/Random maps (T3-2).
   The generator is already seed-deterministic, so a config rolled from a seed is the same map for
   everyone — "Daily Disruption" rolls from today's date (a shared, comparable map + Valuation),
   "Random Skirmish" from a fresh seed. The rolled cfg lives in a TRANSIENT MAPS slot (never
   serialized as data; skirmish runs don't save). The campaign is untouched.

   The seed is rolled HERE in the menu layer and passed in — the sim path stays Math.random-free.
   startSkirmish also accepts a campaign map index (the "chosen map" grid). | STARLEFT */

function dateToSeed(d){
  d = d || new Date();
  return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();   // YYYYMMDD
}

// deterministic roll: same seed → same config on every machine (daily maps are shared)
function rollSkirmishConfig(seed){
  let s=(seed>>>0)||1;
  const rnd=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
  const pick=(a)=>a[(rnd()*a.length)|0];
  const biomePairs=[['grass'],['desert','grass'],['tech'],['tech','ice'],['ice'],['volcanic'],['desert','ice'],['tech','grass']];
  const w=48+((rnd()*38)|0), h=40+((rnd()*30)|0);     // 48–86 × 40–70, inside shipped bounds
  const nE=2+((rnd()*2)|0);                            // 2–3 enemy bases
  const cfg={
    name:'SKIRMISH #'+seed,
    enemyName:'THE COMPETITION',
    skirmish:true,
    crawl:{ episode:'SKIRMISH', title:'DAILY DISRUPTION',
      text:'No arc. No memorial. No exit strategy. Just a quarter, a rival, and a number to beat....',
      summary:'A procedurally-rolled quarter against THE COMPETITION. Raze every base; the Valuation is the score.' },
    objective:'THE COMPETITION holds '+nE+' bases — raze them all. Valuation is the score.',
    w, h, seed: 200000 + (seed % 800000),              // far from the campaign's hand-picked seeds
    terrain:{ biomes:pick(biomePairs), seaFrac:0.06+rnd()*0.10, mtnFrac:0.05+rnd()*0.06,
              forest:Math.round(rnd()*8)/100, moist:{base:0.5+rnd()*0.2, noise:0.4} },
    aggression: Math.round((1.0+rnd()*0.9)*100)/100,
    graceTime: 80+((rnd()*60)|0), waveTimer: 85+((rnd()*40)|0),
    startGold:400, startWorkers:5, startSoldiers:3, startBarracks:true,
    player:{ x:5+((rnd()*4)|0), y:h-6-((rnd()*4)|0) },
    enemies:[], goldNodes:[],
  };
  const spots=[ {x:w-9,y:6}, {x:7,y:6}, {x:w-9,y:h-10}, {x:(w/2)|0, y:6} ];
  for(let i=0;i<nE;i++){ const c=spots[i];
    cfg.enemies.push({ x:c.x, y:c.y, defenders:2+((rnd()*3)|0), extraBarracks:rnd()<0.4 }); }
  // home pair + one node per base (the T2-5 rebalance trims home amounts + adds a contested node)
  cfg.goldNodes.push({ x:Math.max(2,cfg.player.x-2), y:Math.min(h-2,cfg.player.y+3), amt:1600 });
  cfg.goldNodes.push({ x:Math.min(w-2,cfg.player.x+4), y:Math.max(2,cfg.player.y-3), amt:1600 });
  for(const e of cfg.enemies) cfg.goldNodes.push({ x:Math.max(2,Math.min(w-2,e.x+3)), y:Math.max(2,Math.min(h-2,e.y+5)), amt:1600 });
  return cfg;
}

// T4-5: a 1v1 DUEL arena — the skirmish roll with NO AI faction; two human HQs face off
// (pendingPlayers=2 gives P2 its co-op start). Same seed → same arena on both peers.
function rollDuelConfig(seed){
  const cfg=rollSkirmishConfig(seed);
  cfg.name='DUEL #'+seed;
  cfg.enemyName='THE OTHER FOUNDER';
  cfg.pvp=true;
  cfg.enemies=[];                       // no AI bases — the rival HUMAN is the encounter
  cfg.aggression=1.0; cfg.graceTime=9999; cfg.waveTimer=9999;
  cfg.startGold=500; cfg.startWorkers=5; cfg.startSoldiers=3;
  cfg.objective='Eliminate the rival founder — raze their HQ and break their company.';
  cfg.crawl={ episode:'DUEL', title:'THE TERM SHEET WAR',
    text:'Two founders. One market. Zero chill....',
    summary:'1v1 — eliminate the rival founder.' };
  return cfg;
}
// install a generated cfg at the SAME transient slot on every peer (MAPS length matches across builds)
function installDuelConfig(seed){
  const cfg=rollDuelConfig(seed);
  if(SKIRMISH_SLOT<0){ SKIRMISH_SLOT=MAPS.length; MAPS.push(cfg); } else MAPS[SKIRMISH_SLOT]=cfg;
  return SKIRMISH_SLOT;
}

/* ---- launch plumbing ---- */
let SKIRMISH_SLOT=-1;          // transient MAPS slot for generated configs (reused between rolls)
let _lastSkirmish=null;        // {idx|cfgSeed, opts} for "Play Again"

function startSkirmish(cfgOrIdx, opts){
  opts=opts||{};
  if(typeof CAMPAIGN!=='undefined') CAMPAIGN.mode='combat';
  if(typeof setCarryover==='function') setCarryover([]);     // skirmish: no campaign roster bleed
  if(typeof resetHeroes==='function') resetHeroes();
  if(typeof resetFallen==='function') resetFallen();
  let idx;
  if(typeof cfgOrIdx==='number'){ idx=cfgOrIdx; _lastSkirmish={ idx, opts }; }
  else {
    if(SKIRMISH_SLOT<0){ SKIRMISH_SLOT=MAPS.length; MAPS.push(cfgOrIdx); }
    else MAPS[SKIRMISH_SLOT]=cfgOrIdx;
    idx=SKIRMISH_SLOT; _lastSkirmish={ seed:opts.seed, opts };
  }
  ['startScreen','mapScreen','loadScreen','skirmishScreen','endScreen'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  mapIndex=idx;
  // asset gate (js/loader.js + ui.js): skirmish has no crawl, so the loading screen IS the
  // loading window. Tags are computed AFTER the transient slot install above so they read the
  // real generated config; everything below loadMap mutates the fresh G → it moves into enter().
  LOADER.beginMission(missionTags(idx));
  gateMission(idx, ()=>{
  loadMap(idx);
  G._skirmish=true;
  G._skirmishSeed=(opts.seed!=null)?opts.seed:null;
  G._skirmishDaily=!!opts.daily;
  if(opts.mutators && opts.mutators.length && typeof applyMutators==='function') applyMutators(G, opts.mutators);
  // T3-9: M3$ run-investment boosts (one-run, paid from the campaign treasury)
  try{
    const boosts=[...document.querySelectorAll('#skirmish-boosts input:checked')].map(i=>i.value);
    for(const b of boosts){
      if(b==='bigger' && typeof CAMPAIGN!=='undefined' && CAMPAIGN.m3>=150){ CAMPAIGN.m3-=150; const eco=playerEco(G,'p1'); eco.gold+=600; toast('\u{1F4B0} Bigger Round closed \u2014 +600 Funding'); }
      if(b==='lobby' && typeof CAMPAIGN!=='undefined' && CAMPAIGN.m3>=200){ CAMPAIGN.m3-=200;
        for(let i=0;i<2;i++){ const u=mkUnit(G,'lobbyist','player',Math.round(G.cfg.player.x)+i,Math.round(G.cfg.player.y)-3); u.stars=3; u.xp=CAREER.xpFor(3); if(typeof applyVetHp==='function') applyVetHp(u,true); }
        toast('\u{1F3A9} Two Lv3 Lobbyists on retainer'); }
    }
  }catch(e){}
  if(typeof TELE!=='undefined') TELE.event('skirmish_started', { daily:!!opts.daily, muts:(opts.mutators||[]).length });
  toast(opts.daily ? ('📅 Daily Disruption — seed '+opts.seed) : 'Skirmish — no campaign stakes, all bragging rights');
  });
}
function _skirmishMuts(m){ return m || (typeof skirmishSelectedMutators==='function' ? skirmishSelectedMutators() : []); }
function startDailySkirmish(mutators){ const seed=dateToSeed(); startSkirmish(rollSkirmishConfig(seed), { seed, daily:true, mutators:_skirmishMuts(mutators) }); }
function startRandomSkirmish(mutators){ const seed=(Math.random()*1e9)>>>0; startSkirmish(rollSkirmishConfig(seed), { seed, mutators:_skirmishMuts(mutators) }); }
function replaySkirmish(){
  if(!_lastSkirmish) return;
  if(_lastSkirmish.idx!=null) startSkirmish(_lastSkirmish.idx, _lastSkirmish.opts);
  else startSkirmish(rollSkirmishConfig(_lastSkirmish.seed), _lastSkirmish.opts);
}
