/* hub.js — H.U.B. campaign layer: extraction, M3rit$, non-combat hub map,
   condos, ULTRA HQ services, M.D.C. deployment, and Wasteland overlays. Classic
   globals by design; loaded after map.js and before units/ui/core. */

const HUB_SCHEMA_ROOT = (typeof window !== 'undefined') ? window : globalThis;
const HUB_PLACEMENT = (typeof HUB_SCHEMA_ROOT.hubNormalizeMapData === 'function')
  ? HUB_SCHEMA_ROOT.hubNormalizeMapData(HUB_SCHEMA_ROOT.HUB_MAP_DATA || null)
  : (HUB_SCHEMA_ROOT.HUB_MAP_DEFAULTS ? JSON.parse(JSON.stringify(HUB_SCHEMA_ROOT.HUB_MAP_DEFAULTS)) : {W:124,H:102,player:{x:60,y:58},wasteland:{x0:66,y0:68,x1:123,y1:101},pois:[],rivers:[],bridges:[],megaSprites:[],buildings:[],topography:[]});

const HUB = Object.assign({
  nextId:1,
  mdcCap:4,
  condoCosts:[200,400,700,1100,1600],
  implantCosts:[150,300,550,900,1400],
  styleCost:120,
  academyCost:250,
  gambleStake:100,
  // ---- Training Grounds tunables ----
  trainHourSeconds:3600,  // real seconds of ACTIVE play per "in-game hour" of training (1h = 1 real hour)
  trainPairCap:6,         // max simultaneous training sessions (pairs)
  trainMaxGap:6,          // max level difference allowed between mentor and junior
  // ---- The Wake (resurrection tower) tunables ----
  rebornHourSeconds:3600, // real seconds of ACTIVE play per "in-game hour" of a write (1h = 1 real hour)
  rebornTotalCap:3,       // how many Reborn Cyborgs may EVER exist across the whole campaign (hard cap)
  rebornSlotCap:1,        // how many may be in the lattice at once (one soul at a time)
  wakeAppearIdx:11,       // The Wake spire is ABSENT from the H.U.B. until CAMPAIGN.nextMapIndex >= this (it only rises once Episode XI is behind you). Distinct from rebornUnlockIdx, which gates the resurrection *function* — the tower can stand "cold" before then.
  rebornUnlockIdx:13,     // inert until CAMPAIGN.nextMapIndex >= this (after Ep XIII: you hold lattice+backups)
  rebornBaseHours:6,      // base in-game hours to reassemble a body
  rebornHoursPerStar:0.5, // + per veteran level
  rebornBaseCost:300,     // M3$ floor
  rebornCostPerStar:80,   // + per veteran level
}, HUB_PLACEMENT);

function hubBiomeId(v, fallback){
  if(typeof v === 'number') return v;
  const map = {grass:B_GRASS, mountain:B_MOUNTAIN, water:B_WATER, tech:B_TECH, desert:B_DESERT, ice:B_ICE, volcanic:B_VOLCANIC};
  return map[v] != null ? map[v] : (fallback == null ? B_GRASS : fallback);
}
function hubTags(o){ return Array.isArray(o&&o.tags) ? o.tags : []; }
function hubHasTag(o, tag){ return hubTags(o).indexOf(tag) >= 0; }
function hubPoiConfig(id){ return (HUB.pois||[]).find(p=>p.id===id) || null; }
// Campaign-progress gate for a POI's PRESENCE in the H.U.B. Most POIs are always there; The Wake
// only materialises once Episode XI is behind you (CAMPAIGN.nextMapIndex >= HUB.wakeAppearIdx) — so
// it must be filtered out of every injection path (fresh generation + saved-hub restore) before then.
function hubPoiAvailable(p){
  if(!p) return false;
  if(p.kind==='wake'){
    const idx=(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.nextMapIndex!=null) ? CAMPAIGN.nextMapIndex : 0;
    return idx >= (HUB.wakeAppearIdx!=null ? HUB.wakeAppearIdx : 11);
  }
  return true;
}
function hubCondoIds(){ return (HUB.pois||[]).filter(p=>p.kind==='condo').map(p=>p.id); }
function hubNormalizePlacementData(data){
  if(typeof HUB_SCHEMA_ROOT.hubNormalizeMapData === 'function') return HUB_SCHEMA_ROOT.hubNormalizeMapData(data || null);
  return data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : JSON.parse(JSON.stringify(HUB_PLACEMENT));
}
function hubSyncCampaignCondos(){
  const existing = (typeof CAMPAIGN !== 'undefined' && CAMPAIGN && CAMPAIGN.condos) ? CAMPAIGN.condos : {};
  const next = {};
  for(const id of hubCondoIds()) next[id] = Object.assign({id, level:0, residents:[]}, existing[id] || {});
  for(const id in existing) if(!next[id]) next[id] = existing[id];
  if(typeof CAMPAIGN !== 'undefined' && CAMPAIGN) CAMPAIGN.condos = next;
}
function hubApplyPlacementData(data){
  const normalized = hubNormalizePlacementData(data);
  Object.assign(HUB, normalized);
  hubSyncCampaignCondos();
  return normalized;
}
function hubBuildPreviewMap(data){
  hubApplyPlacementData(data);
  const state = newHubMap();
  hubRevealAll(state);
  state.selection = [];
  state.placing = null;
  state.time = 0;
  return state;
}

let CAMPAIGN = hubDefaultCampaign();

function hubDefaultCampaign(){
  const condos = {};
  for(const id of hubCondoIds()) condos[id] = {id, level:0, residents:[]};
  return {
    mode:'combat',
    m3:0,
    nextMapIndex:0,
    roster:[],
    condos,
    upgrades:{},
    dispatch:{ mdcId:null, staged:[] },
    training:{ staged:[], sessions:[] },
    healing:{ staged:[], sessions:[] },
    reborn:{ sessions:[], done:[] },
    npc:{ seed:0, byId:{} },   // living-city NPC registry (js/npc_lore.js); seed 0 = unminted
    ngPlus:0,             // T3-1: New-Game+ lap counter (legacy saves default 0 via Object.assign)
    visit:0,
    gambled:false,
    lastReward:null,
    // narrative gates (story-polish §6/§7). Legacy saves default these false via the deserialize merge.
    // altarSeen: the Ep XI Biba↔Nino reveal has played (gates Biba's post-altar bark tier).
    // perfectExtraction: last extraction lost zero veterans (arms the hub memorial-clearing beat).
    storyFlags:{ altarSeen:false, perfectExtraction:false },
  };
}
function resetHubCampaign(){ CAMPAIGN = hubDefaultCampaign(); }
function serializeHubCampaign(){ return JSON.parse(JSON.stringify(CAMPAIGN)); }
function deserializeHubCampaign(data){
  CAMPAIGN = hubDefaultCampaign();
  if(data && typeof data==='object') {
    const defaults = hubDefaultCampaign();
    Object.assign(CAMPAIGN, data);
    CAMPAIGN.condos = Object.assign(defaults.condos, data.condos||{});
    CAMPAIGN.upgrades = data.upgrades || {};
    CAMPAIGN.dispatch = Object.assign({mdcId:null, staged:[]}, data.dispatch||{});
    // legacy-safe: saves predating the Training Grounds simply load with empty training
    CAMPAIGN.training = Object.assign({staged:[], sessions:[]}, data.training||{});
    if(!Array.isArray(CAMPAIGN.training.staged)) CAMPAIGN.training.staged=[];
    if(!Array.isArray(CAMPAIGN.training.sessions)) CAMPAIGN.training.sessions=[];
    // legacy-safe: saves predating the Mental Health Facility load with empty healing
    CAMPAIGN.healing = Object.assign({staged:[], sessions:[]}, data.healing||{});
    if(!Array.isArray(CAMPAIGN.healing.staged)) CAMPAIGN.healing.staged=[];
    if(!Array.isArray(CAMPAIGN.healing.sessions)) CAMPAIGN.healing.sessions=[];
    // legacy-safe: saves predating The Wake load with an empty resurrection queue
    CAMPAIGN.reborn = Object.assign({sessions:[], done:[]}, data.reborn||{});
    if(!Array.isArray(CAMPAIGN.reborn.sessions)) CAMPAIGN.reborn.sessions=[];
    if(!Array.isArray(CAMPAIGN.reborn.done)) CAMPAIGN.reborn.done=[];
    // legacy-safe: saves predating the living-city NPCs load unminted (population mints on next hub entry)
    CAMPAIGN.npc = Object.assign({seed:0, byId:{}}, data.npc||{});
    // legacy-safe: saves predating the narrative gates load with both flags false
    CAMPAIGN.storyFlags = Object.assign({altarSeen:false, perfectExtraction:false}, data.storyFlags||{});
    if(!CAMPAIGN.npc.byId || typeof CAMPAIGN.npc.byId!=='object') CAMPAIGN.npc.byId={};
  }
}
function hubOwnerCtrl(){ return 'p1'; }
function hubCanAct(){
  return netRole==='solo' || LOCAL_CTRL===hubOwnerCtrl();
}

function hubUnitKey(u){
  if(!u) return '';
  if(u.hero && u.heroId) return 'hero:'+u.heroId;
  if(u.lore && u.lore.seed!=null) return 'lore:'+u.lore.seed;
  if(!u.hubKey) u.hubKey = 'unit:'+(u.id||0)+':'+(u.type||'unit')+':'+((typeof G!=='undefined'&&G&&G.runSalt)||0);
  return u.hubKey;
}
function hubSnapUnit(u){
  const key=hubUnitKey(u);
  return { key, type:u.type, stars:u.stars||0, xp:u.xp||0, lore:u.lore||null,
    hero:!!u.hero, heroId:u.heroId||null, spriteType:u.spriteType||null, hp:u.hp, maxHp:u.maxHp,
    madosis:u.madosis||0, sanityThreshold:u.sanityThreshold||0, scarred:!!u.scarred, reborn:!!u.reborn };
}
function hubBuildRosterFromCombat(state){
  const seen=new Set(), out=[];
  // Solo player-controlled extraction: only Lv2+ units garrisoned inside an HQ carry over.
  // Co-op / other paths have no garrison step, so they keep the legacy "all but plain interns" rule.
  const requireGarrison = !!(state.extractReady && netRole==='solo');
  for(const u of state.entities){
    if(u.dead || u.owner!=='player' || u.kind!=='unit') continue;
    if(netRole!=='solo' && (u.ctrl||'p1')!==hubOwnerCtrl()) continue;
    if(requireGarrison){
      if(!u.storedIn) continue;        // only units garrisoned inside an HQ are extracted
      if((u.stars||0) < 2) continue;   // only Level 2+ veterans carry over to the H.U.B.
    } else if(u.type==='worker' && !(u.lore || u.hero)){
      continue;                        // legacy path: ordinary interns do not move into the HUB roster
    }
    const key=hubUnitKey(u); if(seen.has(key)) continue;
    seen.add(key); out.push(hubSnapUnit(u));
  }
  CAMPAIGN.roster = out;
  const condoIds=Object.keys(CAMPAIGN.condos);
  if(!condoIds.length) return;
  out.forEach((r,i)=>{
    let already=false;
    for(const id of condoIds) if((CAMPAIGN.condos[id].residents||[]).includes(r.key)) already=true;
    if(!already) CAMPAIGN.condos[condoIds[i%condoIds.length]].residents.push(r.key);
  });
}

function hubEnsureStats(state){
  // legacy saves carry only the kill fields — the ||0 reads below treat missing ones as zero
  return state.hubStats || (state.hubStats={unitKills:0, buildingKills:0, hqKills:0, unitsLost:0, promotions:0, peakSupply:0});
}
// T3-3: themed run score. Stable formula so persisted bests stay comparable; state._scoreMul
// is the mutator/difficulty multiplier hook (default 1).
function valuationFor(state){
  const s=hubEnsureStats(state);
  const funding=teamGoldCollected(state)|0;
  const raw = funding + (s.unitKills||0)*40 + Math.max(0,(s.buildingKills||0)-(s.hqKills||0))*250 + (s.hqKills||0)*1000
            - (s.unitsLost||0)*120 - Math.floor(state.time||0)*2;
  const pts = Math.max(0, Math.round(raw * (state._scoreMul||1)));
  return { points:pts, label:'$'+(pts/100).toFixed(1)+'B' };
}
// persisted per-map/seed best (localStorage; orthogonal to the save files)
function valuationBestKey(state){ return 'starleft_best_' + (state._skirmishSeed!=null ? 's'+state._skirmishSeed : 'ep'+(typeof mapIndex==='number'?mapIndex:0)); }
function valuationBest(state){ try{ return +localStorage.getItem(valuationBestKey(state))||0; }catch(_){ return 0; } }
function valuationRecord(state, pts){ try{ if(pts>valuationBest(state)) localStorage.setItem(valuationBestKey(state), String(pts)); }catch(_){} }
function hubRecordKill(state, victim){
  if(!state || !victim || victim.owner!=='enemy') return;
  const s=hubEnsureStats(state);
  if(victim.kind==='unit') s.unitKills++;
  else if(victim.kind==='building'){ s.buildingKills++; if(victim.type==='hq') s.hqKills++; }
}
function hubRewardFor(state){
  const s=hubEnsureStats(state), funding=Math.floor(teamGoldCollected(state)/1000)*25;
  const nonHqBuildings=Math.max(0, s.buildingKills - s.hqKills);
  // bonus quests: each completed optional objective pays its authored M3$ (legacy saves / quest-less maps → 0)
  let questBonus=0;
  if(state.quests && state.cfg && state.cfg.quests)
    for(const d of state.cfg.quests){ const q=state.quests[d.id]; if(q && q.done && !q.failed && !d.required) questBonus+=(d.reward|0); }
  return { completion:150, unitKills:s.unitKills*4, buildingKills:nonHqBuildings*25,
    hqKills:s.hqKills*100, funding, questBonus,
    total:150+s.unitKills*4+nonHqBuildings*25+s.hqKills*100+funding+questBonus };
}

function beginExtractionPhase(state){
  if(netRole!=='solo'){ state.over=true; onVictory(); return; }
  CAMPAIGN.mode='extraction';
  CAMPAIGN.nextMapIndex=(typeof villainNextLinear==='function') ? villainNextLinear(mapIndex) : Math.min(mapIndex+1, MAPS.length-1);   // skips appended villain maps; resumes at returnTo after a boss
  state.extractReady=true;
  state.extractStarted=false;
  state.objective='Episode complete. Garrison your survivors inside an Open-Plan HQ (only Lv2+ are extracted), then press Extraction.';
  state.cfg.objective=state.objective;
  for(const e of state.entities){ if(e.owner==='enemy' && e.kind==='unit') e.dead=true; }
  toast('Episode complete — garrison units in your HQ, then launch Extraction.', 0);
  refreshUI();
}
function hubBuildingRoofPoint(b){
  const px=b.tx*TILE, py=b.ty*TILE, w=b.w*TILE, h=b.h*TILE;
  const spr=(typeof buildingSprite==='function') ? buildingSprite(b.type,b.owner) : null;
  if(spr){
    const overhang = b.type==='turret'?1.18:1.08;
    const tall = b.type==='hq'?1.5625:1;
    const dw=w*overhang, dh=dw*(spr.fh/spr.fw)*tall;
    const dx=px+(w-dw)/2, dy=py+h-dh+2;
    return { x:dx+dw/2, y:dy+dh*0.08+TILE*2 };
  }
  return { x:b.x, y:py+TILE*0.35 };
}
// Launch the Buzzword Bomber cinematic over `hq`. The flight (updateExtraction) carries the
// player to the H.U.B. when it finishes. Guarded so it can only fire once.
function hubStartExtractFlight(state, hq){
  if(!state || !hq || hq.dead || state.extractStarted) return;
  state.extractStarted=true;
  if(typeof clearToast==='function') clearToast();
  const z=state.zoom||1, sx=state.camX-3*TILE, sy=state.camY+viewH()/z+2*TILE;
  const roof=hubBuildingRoofPoint(hq);
  state.extractFlight={ phase:'in', t:0, x:sx, y:sy, hqX:roof.x, hqY:roof.y,
    exitX: hq.x < state.W*TILE/2 ? -4*TILE : state.W*TILE+4*TILE, exitY:hq.y-TILE*5 };
  toast('Buzzword Bomber inbound.');
}
// Player veterans (Lv2+) still in the field — NOT garrisoned in any HQ. These are lost on extraction.
function strandedVets(state){
  return (state.entities||[]).filter(u =>
    u && !u.dead && u.owner==='player' && u.kind==='unit' &&
    !u.storedIn && (u.stars||0) >= 2);
}
// HQ "Extraction" button action: validate, warn about stranded veterans, then launch the bomber.
function tryStartExtraction(){
  const state=G;
  if(!state || !state.extractReady || netRole!=='solo') return;
  const hq=(typeof selectedBuilding==='function') ? selectedBuilding('hq') : null;
  if(!hq){ toast('Select your HQ to launch extraction.'); return; }
  if(typeof hqStoredUnits!=='function' || hqStoredUnits(state,hq).length===0){
    toast('Garrison at least one unit inside the HQ first.'); return;   // guards the disabled-button click
  }
  const stranded=strandedVets(state);
  if(stranded.length){ showExtractConfirm(state, hq, stranded.length); return; }
  hubStartExtractFlight(state, hq);
}
// Pause + confirm modal shown when Lv2+ veterans would be left behind.
function showExtractConfirm(state, hq, n){
  const el=document.getElementById('extractConfirm');
  if(!el){ hubStartExtractFlight(state, hq); return; }   // no modal element → fail open
  running=false;
  if(typeof resetInputState==='function') resetInputState();
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  el.className='overlay';
  el.innerHTML=`<div class="big">🚁</div><h1>LEAVE THEM BEHIND?</h1>
    <h2>${n} veteran${n===1?'':'s'} still outside the HQ</h2>
    <p>Only Level&nbsp;2+ units <b>inside</b> an Open-Plan HQ extract to the H.U.B.
       ${n} eligible veteran${n===1?' is':'s are'} still in the field and will be lost forever.</p>
    <button class="btn" id="extractGo">▶ Extract anyway</button>
    <button class="btn" id="extractCancel">◀ Keep fighting</button>`;
  el.style.display='flex';
  const close=()=>{ el.style.display='none'; el.innerHTML=''; };
  const resume=()=>{ running=true; if(typeof syncPauseBtn==='function') syncPauseBtn(); };
  document.getElementById('extractGo').onclick=()=>{ close(); resume(); hubStartExtractFlight(state, hq); };
  document.getElementById('extractCancel').onclick=()=>{ close(); resume(); refreshUI(); };
}
function updateExtraction(state, dt){
  const f=state.extractFlight; if(!f) return;
  f.t+=dt;
  if(f.phase==='panorama' && typeof updateHubPanoDrones==='function') updateHubPanoDrones(state, dt);
  const flySpeed=((DEF.bomber&&DEF.bomber.speed)||1.7)*TILE;
  const step=(tx,ty,spd)=>{
    const dx=tx-f.x, dy=ty-f.y, d=Math.hypot(dx,dy);
    if(d<4) return true;
    const s=spd*dt; f.x+=dx/d*Math.min(s,d); f.y+=dy/d*Math.min(s,d); return false;
  };
  if(f.phase==='in' && step(f.hqX,f.hqY,flySpeed)){ f.phase='hover'; f.t=0; }
  else if(f.phase==='hover' && f.t>1.6){
    if(mapIndex===6){
      // EPISODE VII — "the flash": the bomber is on the roof and the sky goes white. Instead of flying
      // out to the panorama, a nuke consumes the whole map (FX: js/nuke_finale.js drawNukeFinale).
      f.phase='nuke'; f.t=0; f.detonated=false; f.camBaseX=state.camX; f.camBaseY=state.camY;
      if(typeof document!=='undefined') document.body.classList.add('scene-flash');
      if(typeof MUSIC!=='undefined' && MUSIC.playCinematic && typeof MUSIC_FLASH!=='undefined') MUSIC.playCinematic(MUSIC_FLASH);   // cue the bomb-drop track
      // the flash skips the panorama, so the ~73s cinematic is this path's hub-asset download window
      if(typeof LOADER!=='undefined' && typeof missionTagsHub==='function') LOADER.beginMission(missionTagsHub());
    } else { f.phase='out'; f.t=0; }
  }
  else if(f.phase==='nuke'){
    const T_IMP=(typeof NUKE_T_IMPACT!=='undefined'?NUKE_T_IMPACT:10.0);
    const T_END=(typeof NUKE_T_ANIM_END!=='undefined'?NUKE_T_ANIM_END:28.0);
    if(!f.detonated && f.t>=T_IMP){                 // the bomb hits the crash site
      f.detonated=true;
      epSevenFlashAftermath(state);                 // memorialize the whole roster + carry nobody — but the base, units and
      if(typeof clearToast==='function') clearToast();   // buildings STAY on the map (just violently shaken, then whited out)
    }
    // screen-shake: nothing while the bomb falls; from the moment it hits the ground the shake GRADUALLY
    // INTENSIFIES, peaking right as the screen goes fully white at T_END (then moot — the hold is pure white).
    let amp=0;
    if(f.t>=T_IMP && f.t<T_END){
      const g=Math.max(0, Math.min(1, (f.t-T_IMP)/(T_END-T_IMP)));   // 0 at impact → 1 at white-out
      amp = 42*(0.10 + 0.90*Math.pow(g,1.3));                        // builds from a tremor to a big, heavy climax
    }
    // lower frequencies → a slower, heavier rumble/sway (shakes harder but far less jittery)
    const sx=Math.sin(f.t*20)+0.5*Math.sin(f.t*37+2.0), sy=Math.sin(f.t*17+1.7)+0.5*Math.sin(f.t*31+0.4);
    state.camX=(f.camBaseX||state.camX)+sx*amp;
    state.camY=(f.camBaseY||state.camY)+sy*amp;
    // once the white gives way to the STARLEFT-title / extraction-panorama scene, drive its drifting drones
    if(f.t >= (typeof NUKE_T_TITLE_IN!=='undefined'?NUKE_T_TITLE_IN:10)){
      if(!f.panoStarted){ f.panoStarted=true; if(typeof resetHubPanoDrones==='function') resetHubPanoDrones(); }
      if(typeof updateHubPanoDrones==='function') updateHubPanoDrones(state, dt);
    }
    // music finale: the echo intensifies over the cue's last 6s; the music plays to NUKE_DURATION then STOPS,
    // and a resounding echo rings for NUKE_T_ECHO_TAIL more seconds — the scene cuts to the hub only AFTER it ends.
    const _dur=(typeof NUKE_DURATION!=='undefined'?NUKE_DURATION:67.0);
    const _tail=(typeof NUKE_T_ECHO_TAIL!=='undefined'?NUKE_T_ECHO_TAIL:6.0);
    if(typeof MUSIC!=='undefined' && MUSIC.cinematicEcho && f.t>=_dur-6 && f.t<_dur) MUSIC.cinematicEcho((f.t-(_dur-6))/6);
    if(!f.musicStopped && f.t>=_dur){ f.musicStopped=true; if(typeof MUSIC!=='undefined' && MUSIC.stopCinematic) MUSIC.stopCinematic(); }
    // same loading contract as the panorama exit: hold for the hub's sprite set, capped at +15s
    if(f.t >= _dur+_tail && ((typeof LOADER==='undefined') || LOADER.missionReady() || f.t >= _dur+_tail+15)) enterHubFlashAftermath(state);
  }
  // The bomber has left the mission map → hand off to the HUB panorama loading scene
  // (js/hub_loading.js). It plays for HUB_LOAD_DURATION (13s) as a hidden HUB loader; the
  // DOM HUD is hidden meanwhile so the canvas shows the full-screen cinematic.
  else if(f.phase==='out' && step(f.exitX,f.exitY,flySpeed)){
    f.phase='panorama'; f.t=0;
    if(typeof resetHubPanoDrones==='function') resetHubPanoDrones();
    if(typeof document!=='undefined') document.body.classList.add('scene-hubload');
    // the 20s panorama IS the hub's asset-loading window: promote the hub's sprite set now
    if(typeof LOADER!=='undefined' && typeof missionTagsHub==='function') LOADER.beginMission(missionTagsHub());
  }
  // Bomber crosses the panorama skyline; when it reaches the far side the HUB map appears.
  // If the hub's critical sprites haven't settled yet (cold mobile cache), the cinematic
  // extends until they do, capped at +15s — the gate contract, drawn in the scene's idiom.
  else if(f.phase==='panorama' && f.t >= (typeof HUB_LOAD_DURATION!=='undefined'?HUB_LOAD_DURATION:20)
          && ((typeof LOADER==='undefined') || LOADER.missionReady()
              || f.t >= (typeof HUB_LOAD_DURATION!=='undefined'?HUB_LOAD_DURATION:20)+15)){
    enterHubFromCombat(state);
  }
}
function drawExtractionFlight(state){
  const f=state.extractFlight; if(!f || f.phase==='panorama' || f.phase==='nuke') return;   // panorama draws its own bomber; the nuke consumes it
  const u={type:'bomber', owner:'player', x:f.x, y:f.y, air:true, r:16, _face:f.phase==='out'?(f.exitX<f.x?-1:1):(f.hqX<f.x?-1:1)};
  const anim=unitWalk('bomber','player');
  if(anim && anim.ready) blitFrame(u,f.x,f.y,anim,UNIT_SPRITE_H.bomber, ((state.time*8)|0)%anim.frames.length);
  else { ctx.fillStyle='#7fd6ff'; ctx.beginPath(); ctx.arc(f.x,f.y,18,0,Math.PI*2); ctx.fill(); }
}
/* ---- MDC dispatch cinematic: the Buzzword Bomber's LAUNCH flight ---------------------------
   Mirror of the extraction panorama, but flying LEFT→RIGHT and shown BEHIND the dispatch crawl
   (the crawl background becomes a semi-transparent scrim). Unlike extraction there is no
   in/hover/out approach — it starts directly in the panorama. The crawl's own finish() drives
   loadMap(); here we only set up / advance / tear down the backdrop. `dur` is the crawl's total
   length (set by showCrawl once the narration length is known) so the single pass exits the right
   edge exactly as the map loads. */
function hubStartDispatchFlight(state, durSeconds){
  if(!state) return;
  state.dispatchFlight={ t:0, dir:'lr', dur: durSeconds>0 ? durSeconds : 60 };
  if(typeof resetHubPanoDrones==='function') resetHubPanoDrones();
  if(typeof document!=='undefined') document.body.classList.add('scene-dispatch');
}
// Called every frame from the rAF loop (unconditionally — running=false while the crawl plays).
// Advances state.time too so the sprite anim / bob / drones animate with the sim paused; harmless
// because this HUB state is discarded by loadMap the moment the crawl finishes.
function updateDispatchFlight(state, dt){
  const f=state && state.dispatchFlight; if(!f) return;
  state.time=(state.time||0)+dt;
  f.t+=dt;
  if(typeof updateHubPanoDrones==='function') updateHubPanoDrones(state, dt);
}
function endDispatchFlight(state){
  if(state) delete state.dispatchFlight;
  if(typeof document!=='undefined') document.body.classList.remove('scene-dispatch');
}
// Frame the freshly-entered HUB at minimum zoom, centered on the ULTRA HQ tower (the central
// landmark in the middle of the map). Must run AFTER syncHud() so viewW()/viewH() reflect the
// live HUD band heights; clampCam() afterwards keeps the view inside the map bounds.
function hubFocusUltra(state){
  if(!state) return;
  state.zoom = (typeof ZOOM_MIN!=='undefined') ? ZOOM_MIN : 0.35;
  let cx, cy;
  const u=(state.megaSprites||[]).find(m=>m && (m.poiId==='ultra' || m.id==='ultra_mega' || (m.tags && m.tags.indexOf('hubUltra')>=0)));
  if(u){ cx=(u.tx + u.w/2)*TILE; cy=(u.ty + u.h/2)*TILE; }
  else if(state.hubPois && state.hubPois.ultra){ const e=state.hubPois.ultra; cx=((e.tx||0) + (e.w||0)/2)*TILE; cy=((e.ty||0) + (e.h||0)/2)*TILE; }
  else { cx=state.W*TILE/2; cy=state.H*TILE/2; }
  state.camX = cx - (viewW()/state.zoom)/2;
  state.camY = cy - (viewH()/state.zoom)/2;
}
function enterHubFromCombat(state){
  if(typeof document!=='undefined') document.body.classList.remove('scene-hubload');   // end the panorama loading scene
  const reward=hubRewardFor(state);
  CAMPAIGN.m3 += reward.total;
  CAMPAIGN.lastReward=reward;
  // boss detour just ended (host path): resume the linear campaign at the villain's returnTo + mark it cleared
  if(typeof MAPS!=='undefined' && MAPS[mapIndex] && MAPS[mapIndex].isVillain && typeof villainNextLinear==='function') CAMPAIGN.nextMapIndex=villainNextLinear(mapIndex);
  if(mapIndex===6 && typeof epSevenFlashAftermath==='function'){
    epSevenFlashAftermath(state);            // Episode VII "the flash": memorialize all, carry nobody (co-op host path; solo uses enterHubFlashAftermath)
  } else {
    hubBuildRosterFromCombat(state);
    if(typeof captureHeroes==='function') captureHeroes(state);
    // story-polish §7.2: a clean extraction — no veteran joined the wall this mission. Arc-2+ only
    // (Nino/Biba are in the story by then); a hub beat names it. The flag tracks the latest extraction.
    const clean = !state._vetLost;
    if(CAMPAIGN.storyFlags) CAMPAIGN.storyFlags.perfectExtraction = clean;
    if(clean && CAMPAIGN.nextMapIndex>=7 && typeof toast==='function'){
      setTimeout(()=>{ try{ toast('Nino: Not one new name on the wall today.', 6500); }catch(e){} }, 1600);
      setTimeout(()=>{ try{ toast("Biba: We all walked out. Savor it — it won't last.", 6500); }catch(e){} }, 3200);
    }
  }
  CAMPAIGN.mode='hub'; CAMPAIGN.visit++; CAMPAIGN.gambled=false; CAMPAIGN.dispatch={mdcId:null, staged:[]};
  if(typeof hubSyncNpcs==='function') hubSyncNpcs();   // living city: mint/refresh the persistent NPC population for this visit
  if(typeof TELE!=='undefined') TELE.event('hub_entered', { visit: CAMPAIGN.visit });
  // T4-1: the moment The Wake comes online (post-XIII) gets its narrative beat — once
  if(typeof rebornUnlocked==='function' && rebornUnlocked() && !CAMPAIGN._wakeAnnounced){
    CAMPAIGN._wakeAnnounced=true;
    if(typeof eventToast==='function') eventToast('⚡ <b>LATTICE ONLINE.</b> The stolen coils hum over the Wake. You can bring <b>ONE</b> of them back — the storm holds three writes, ever. Walk to The Wake and choose.', 16000);
  }
  if(typeof MUSIC!=='undefined' && MUSIC.stopAmbient) MUSIC.stopAmbient();   // mission ambient ends at the hub
  G=newHubMap();
  mapIndex = Math.max(0, Math.min(CAMPAIGN.nextMapIndex, MAPS.length-1));
  if(typeof resetDialogs==='function') resetDialogs();
  syncHud();
  hubFocusUltra(G);                 // open at minimum zoom, centered on the ULTRA HQ (map middle)
  clampCam(G); computeFog(G); refreshUI(); running=true;
  // co-op host skips the extraction panorama (cuts straight here), so arm the hub's sprite
  // set and show the visual-only gate the client already gets — never touches `running`.
  if(typeof LOADER!=='undefined' && typeof gateMission==='function'){
    LOADER.beginMission(missionTagsHub());   // solo arrives with this already armed+settled → no-op
    if(netRole==='host') gateMission(mapIndex, null, { passive:true, label:'H.U.B. UPLINK' });
  }
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  if(netRole==='host' && typeof mpHostEnterHub==='function') mpHostEnterHub();
  toast('Arrived at the H.U.B. — M3$ +'+reward.total);
}

// Episode VII "the flash": memorialize EVERY dossier'd player veteran (the nuke takes them all) and
// carry nobody forward. Path-independent — called from the solo nuke detonation AND the co-op host
// hub entry. recordFallen dedups by id, so calling it here is safe even if death-cleanup also records.
function epSevenFlashAftermath(state){
  window._massMemorialize=true;   // the flash takes EVERYONE — suppress the per-death interstitial (T1-1)
  for(const u of (state.entities||[])){
    if(u && u.owner==='player' && u.lore && typeof recordFallen==='function') recordFallen(u);
  }
  window._massMemorialize=false;
  if(typeof ACH!=='undefined') ACH.fire('flash');   // T3-5: Down Round
  CAMPAIGN.roster=[];
  for(const cid in (CAMPAIGN.condos||{})) CAMPAIGN.condos[cid].residents=[];   // the flash empties the towers too — drop stale resident keys
  if(typeof setCarryover==='function') setCarryover([]);   // no veterans carry to Episode VIII
  if(typeof resetHeroes==='function') resetHeroes();        // (no heroes exist before Ep VIII; defensive)
}

// Solo Episode VII hand-off: the nuke has played; drop into the H.U.B. with the roster gone, spawn the
// returning Nino, and start his mandatory monologue framed on him. Mirrors enterHubFromCombat's tail
// but skips the roster build / hero capture (everyone died — handled at detonation by epSevenFlashAftermath).
function enterHubFlashAftermath(state){
  if(typeof document!=='undefined'){ document.body.classList.remove('scene-flash'); document.body.classList.remove('scene-hubload'); }
  const reward=hubRewardFor(state);
  CAMPAIGN.m3 += reward.total; CAMPAIGN.lastReward=reward;     // you DID liquidate THE CONGLOMERATE — meta merit survives the flash
  CAMPAIGN.mode='hub'; CAMPAIGN.visit++; CAMPAIGN.gambled=false; CAMPAIGN.dispatch={mdcId:null, staged:[]};
  if(typeof hubSyncNpcs==='function') hubSyncNpcs();   // living city: the whole town learns what the flash took (mourning diffs)
  if(typeof MUSIC!=='undefined' && MUSIC.stopCinematic) MUSIC.stopCinematic();   // the flash track ends as the hub map loads
  if(typeof MUSIC!=='undefined' && MUSIC.stopAmbient) MUSIC.stopAmbient();
  G=newHubMap();
  mapIndex=Math.max(0, Math.min(CAMPAIGN.nextMapIndex, MAPS.length-1));   // → Episode VIII
  if(typeof resetDialogs==='function') resetDialogs();
  syncHud();
  // spawn the returning Nino as a cutscene actor (Episode VIII re-introduces him via its own heroes[])
  const nc=(typeof MAPS!=='undefined' && MAPS[7] && MAPS[7].heroes && MAPS[7].heroes[0]) || null;
  let nino=null;
  if(typeof _placeHero==='function'){
    const type=(nc&&nc.type)||'lobbyist';
    const lvl=Math.max(0, Math.min((typeof CAREER!=='undefined'?CAREER.maxStars:30), (nc&&nc.level)||11));
    _placeHero(G, G.cfg.player, 0, type, (nc&&nc.name)||'Nino', lvl,
               (typeof CAREER!=='undefined'?CAREER.xpFor(lvl):0), null, (nc&&nc.dossier)||{name:'Nino'}, (nc&&nc.sprite)||'nino');
    nino=G.entities.find(e=>e.hero && e.heroId==='Nino');
    // Register Nino as a hub resident so a condo lists him and hubLocateUnit can pan to him. He's
    // spawned directly above (after hubSpawnRoster already ran on the cleared roster), so without this
    // bookkeeping no condo owns his key and the player can't find him post-flash. Mirrors hubWakeComplete.
    if(nino){
      const key=hubUnitKey(nino);
      CAMPAIGN.roster=(CAMPAIGN.roster||[]).filter(r=>r.key!==key);
      CAMPAIGN.roster.push(hubSnapUnit(nino));
      const cids=Object.keys(CAMPAIGN.condos||{});
      if(cids.length){ const c=CAMPAIGN.condos[cids[0]]; c.residents=c.residents||[]; if(!c.residents.includes(key)) c.residents.push(key); }
    }
  }
  clampCam(G); computeFog(G); refreshUI(); running=true;
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  if(typeof startFlashCutscene==='function') startFlashCutscene(G, nino, (typeof NINO_FLASH_LINES!=='undefined'?NINO_FLASH_LINES:[]));
  else { hubFocusUltra(G); clampCam(G); }
  toast('Arrived at the H.U.B. — M3$ +'+reward.total);
}

function hubHash01(x,y,salt){
  const n=Math.sin(x*127.1 + y*311.7 + salt*74.7)*43758.5453;
  return n-Math.floor(n);
}
function hubSmooth(t){ return t*t*(3-2*t); }
function hubValueNoise(x,y,salt){
  const x0=Math.floor(x), y0=Math.floor(y), u=hubSmooth(x-x0), v=hubSmooth(y-y0);
  const a=hubHash01(x0,y0,salt), b=hubHash01(x0+1,y0,salt), c=hubHash01(x0,y0+1,salt), d=hubHash01(x0+1,y0+1,salt);
  return (a+(b-a)*u) + ((c+(d-c)*u) - (a+(b-a)*u))*v;
}
function hubWasteEdgeNoise(x,y){
  return hubValueNoise(x*0.18,y*0.18,17)*0.72 + hubValueNoise(x*0.47+8,y*0.47-6,29)*0.28;
}
function hubInWasteland(x,y){
  const w=HUB.wasteland;
  if(x<w.x0 || x>w.x1 || y<w.y0 || y>w.y1) return false;
  const edge=Math.min(x-w.x0, w.x1-x, y-w.y0, w.y1-y);
  if(edge>=5) return true;
  return edge + hubWasteEdgeNoise(x,y)*4.4 > 3.35;
}
function hubSetCell(tiles,biome,W,H,x,y,t,b){
  if(x<0||y<0||x>=W||y>=H) return;
  const i=y*W+x;
  tiles[i]=t; biome[i]=b;
}
function hubStampDisk(tiles,biome,W,H,cx,cy,r,t,b,pred){
  const R=Math.ceil(r);
  for(let y=-R;y<=R;y++) for(let x=-R;x<=R;x++){
    if(x*x+y*y>r*r) continue;
    const tx=Math.round(cx+x), ty=Math.round(cy+y);
    if(pred && !pred(tx,ty)) continue;
    hubSetCell(tiles,biome,W,H,tx,ty,t,b);
  }
}
function hubStampRect(tiles,biome,W,H,x0,y0,w,h,t,b){
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) hubSetCell(tiles,biome,W,H,x,y,t,b);
}
function hubCarvePath(tiles,biome,W,H,points,width,fn){
  for(let i=0;i<points.length-1;i++){
    const a=points[i], b=points[i+1], dx=b.x-a.x, dy=b.y-a.y;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*1.5));
    for(let s=0;s<=steps;s++){
      const p=s/steps, x=a.x+dx*p, y=a.y+dy*p;
      fn(x,y,width);
    }
  }
}
function hubCarveRiver(tiles,biome,W,H,points,width,riverMask){
  hubCarvePath(tiles,biome,W,H,points,width,(x,y,w)=>{
    const R=Math.ceil(w);
    for(let yy=-R;yy<=R;yy++) for(let xx=-R;xx<=R;xx++){
      if(xx*xx+yy*yy>w*w) continue;
      const tx=Math.round(x+xx), ty=Math.round(y+yy);
      if(tx<0||ty<0||tx>=W||ty>=H || hubInWasteland(tx,ty)) continue;
      hubSetCell(tiles,biome,W,H,tx,ty,T_WATER,B_WATER);
      if(riverMask) riverMask[ty*W+tx]=1;
    }
  });
}
function hubCarveRoad(tiles,biome,W,H,points,width){
  hubCarvePath(tiles,biome,W,H,points,width,(x,y,w)=>{
    const R=Math.ceil(w);
    for(let yy=-R;yy<=R;yy++) for(let xx=-R;xx<=R;xx++){
      if(xx*xx+yy*yy>w*w) continue;
      const tx=Math.round(x+xx), ty=Math.round(y+yy);
      hubSetCell(tiles,biome,W,H,tx,ty,T_DIRT,hubInWasteland(tx,ty)?B_DESERT:B_GRASS);
    }
  });
}
function hubRestoreRivers(tiles,biome,W,H,riverMask){
  if(!riverMask) return;
  for(let i=0;i<W*H;i++){
    if(!riverMask[i]) continue;
    tiles[i]=T_WATER; biome[i]=B_WATER;
  }
}
function hubStampBridgeDeck(tiles,biome,W,H,bridge){
  const w=Math.max(3,bridge.w|0), h=Math.max(3,bridge.h|0);
  const x0=Math.round(bridge.x - w/2), y0=Math.round(bridge.y - h/2);
  const rx=w/2, ry=h/2;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const tx=x0+x, ty=y0+y;
    if(tx<0||ty<0||tx>=W||ty>=H) continue;
    const dx=Math.abs((x+0.5)-rx), dy=Math.abs((y+0.5)-ry);
    const edgeX=Math.max(0, dx-(rx-1.1)), edgeY=Math.max(0, dy-(ry-1.1));
    if(edgeX*edgeX + edgeY*edgeY > 1.65) continue;
    hubSetCell(tiles,biome,W,H,tx,ty,T_DIRT,B_TECH);
  }
}
function hubStampBridges(tiles,biome,W,H){
  for(const bridge of HUB.bridges) hubStampBridgeDeck(tiles,biome,W,H,bridge);
}
function hubBuildTerrain(W,H,rng){
  const tiles=new Array(W*H), variant=new Array(W*H), biome=new Array(W*H);
  const riverMask=new Uint8Array(W*H);
  const grassNoise=makeNoise2D(4242 + CAMPAIGN.visit*31);
  const wasteNoise=makeNoise2D(9001 + CAMPAIGN.visit*37);

  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=y*W+x;
    variant[i]=rng();
    tiles[i]=T_GRASS;
    biome[i]=B_GRASS;
  }

  // Southeast blast zone: all land inside the wasteland is desert/sand, with
  // occasional volcanic scorch and rocks. No water is allowed to cut through it.
  const waste=HUB.wasteland;
  for(let y=waste.y0;y<=waste.y1;y++) for(let x=waste.x0;x<=waste.x1;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    if(!hubInWasteland(x,y)) continue;
    const i=y*W+x;
    const scorch=wasteNoise.fbm(x*0.12,y*0.12,3);
    const grit=wasteNoise.fbm(x*0.34+80,y*0.34+80,2);
    biome[i]=scorch>0.66 ? B_VOLCANIC : B_DESERT;
    tiles[i]=grit>0.78 ? T_DIRT : T_GRASS;
    if(grit>0.88 || (biome[i]===B_VOLCANIC && scorch>0.70 && variant[i]>0.35)) tiles[i]=T_ROCK;
  }

  // Rivers either enter/leave the map edge or join another river. A river mask
  // lets POI pads clean their entrances without permanently chopping streams.
  for(const river of HUB.rivers) hubCarveRiver(tiles,biome,W,H,river.points,river.width,riverMask);
  addBeach(tiles,W,H);

  // Grassland topography: coherent groves and a few rock outcrops, not per-tile confetti.
  for(let y=2;y<H-2;y++) for(let x=2;x<W-2;x++){
    if(hubInWasteland(x,y)) continue;
    const i=y*W+x;
    if(tiles[i]!==T_GRASS) continue;
    const grove=grassNoise.fbm(x*0.09,y*0.09,4);
    const edge=grassNoise.fbm(x*0.19+40,y*0.19+40,2);
    if(grove>0.67 && edge>0.44 && variant[i]>0.18) tiles[i]=T_TREE;
    else if(grove<0.24 && edge>0.62 && variant[i]>0.72) tiles[i]=T_ROCK;
  }
  // Wasteland topography: sparse rock fields with hotter volcanic pockets.
  for(let y=waste.y0;y<=waste.y1;y++) for(let x=waste.x0;x<=waste.x1;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    if(!hubInWasteland(x,y)) continue;
    const i=y*W+x, rubble=wasteNoise.fbm(x*0.17+120,y*0.17+120,4);
    if(tiles[i]!==T_WATER && rubble>0.70 && variant[i]>0.20) tiles[i]=T_ROCK;
  }

  // Downtown plaza and roads: these also become bridges where they cross rivers.
  const center={x:62,y:47};
  hubStampDisk(tiles,biome,W,H,center.x,center.y,14,T_DIRT,B_GRASS);
  hubCarveRoad(tiles,biome,W,H,[{x:14,y:20},{x:29,y:27},{x:47,y:36},center],2.0);
  hubCarveRoad(tiles,biome,W,H,[{x:105,y:20},{x:92,y:30},{x:76,y:38},center],2.0);
  hubCarveRoad(tiles,biome,W,H,[{x:15,y:87},{x:28,y:78},{x:42,y:66},{x:55,y:56},center],2.0);
  hubCarveRoad(tiles,biome,W,H,[center,{x:60,y:64},{x:89,y:78}],2.1);
  hubCarveRoad(tiles,biome,W,H,[{x:89,y:78},{x:100,y:84},{x:116,y:92}],1.7);
  hubCarveRoad(tiles,biome,W,H,[{x:28,y:25},{x:40,y:22},{x:61,y:29},{x:92,y:26}],1.4);

  // Clear readable pads around every HUB point of interest after all scenery
  // placement. This prevents trees/rocks/rivers from eating entrances.
  for(const p of HUB.pois){
    if(!hubPoiAvailable(p)) continue;   // don't pre-clear a bare pad where a not-yet-present POI (The Wake) will later rise
    const d=Object.assign({}, DEF[p.type]||{w:3,h:3}, {w:p.w||((DEF[p.type]||{}).w||3), h:p.h||((DEF[p.type]||{}).h||3)});
    const pad=p.kind==='condo'?4:(p.kind==='ultra'?7:3);
    const b=hubInWasteland(p.x,p.y)?B_DESERT:B_GRASS;
    hubStampRect(tiles,biome,W,H,p.x-pad,p.y-pad,d.w+pad*2,d.h+pad*2,T_DIRT,b);
    hubStampRect(tiles,biome,W,H,p.x-1,p.y-1,d.w+2,d.h+2,T_GRASS,b);
  }
  hubRestoreRivers(tiles,biome,W,H,riverMask);
  addBeach(tiles,W,H);
  hubStampBridges(tiles,biome,W,H);

  return {tiles,variant,biome};
}

function newHubMap(){
  const W=HUB.W, H=HUB.H, rng=makeRng(424242 + CAMPAIGN.visit*17);
  const terrain=hubBuildTerrain(W,H,rng), tiles=terrain.tiles, variant=terrain.variant, biome=terrain.biome;
  const start=HUB.player || {x:60,y:58};
  const state={ cfg:{name:'H.U.B. — Hurban Ultra Buildings', enemyName:'', objective:'Spend m3rit$ in upgrades, send units to a red M.D.C., then launch the next mission there.', hub:true, player:{x:start.x,y:start.y}},
    W,H,tiles,variant,biome,megaSprites:[],features:[],feat:new Uint8Array(W*H),blocked:new Uint8Array(W*H),
    explored:new Uint8Array(W*H),visible:new Uint8Array(W*H),entities:[],eco:{p1:{gold:0,supply:0,supplyCap:0,gold_collected:0}},
    players:1,nextId:1,runSalt:424242+CAMPAIGN.visit,zoom:initialZoom(W,H),camX:start.x*TILE-innerWidth/2,camY:start.y*TILE-innerHeight/2,
    selection:[],groups:{},placing:null,enemySpawnTimer:999,enemyFortifyTimer:999,graceTime:1e9,enemyWaveTimer:1e9,waveCount:0,time:0,over:false,
    sprint:{ active:false, window:0, t:0, mul:1, x:0, y:0, tapCount:0 }, hub:true, hubPois:{} };
  if(HUB.topography && HUB.topography.length) hubApplyTopography(state, HUB.topography);
  else buildTopoFeatures(state, makeRng(424242 + CAMPAIGN.visit*17 + 909));
  for(let i=0;i<W*H;i++) state.blocked[i]=baseBlocked(state,i);
  if(typeof buildWaterDepth==='function') buildWaterDepth(state);
  hubPlacePois(state);
  hubBuildRoads(state);          // procedural road+sidewalk network (footprints must be placed first)
  hubBuildRoadCost(state);       // pathfinding bias overlay derived from the road tiles
  hubSpawnRoster(state);
  if(typeof hubSpawnTrainees==='function') hubSpawnTrainees(state);
  if(typeof hubSpawnHealers==='function') hubSpawnHealers(state);
  hubRevealAll(state);
  recomputeSupply(state);
  return state;
}
function hubRevealAll(state){ state.explored.fill(1); state.visible.fill(1); }
function hubFixedMegaFrame(state, salt){
  const rng=makeRng((state.runSalt||424242)*13 + salt*97);
  return (rng()*MEGA_FRAMES)|0;
}
function hubFeatureBlockFrom(h){ return Math.max(0, h - (h>>1)); }
function hubApplyTopography(state, list){
  const W=state.W, H=state.H;
  for(const src of list||[]){
    const fw=Math.max(1, src.w|0), fh=Math.max(1, src.h|0);
    const tx=src.tx|0, ty=src.ty|0;
    if(tx>=W || ty>=H || tx+fw<=0 || ty+fh<=0) continue;
    let claimed=false, bsrc=-1;
    for(let y=0;y<fh;y++) for(let x=0;x<fw;x++){
      const gx=tx+x, gy=ty+y; if(gx<0||gy<0||gx>=W||gy>=H) continue;
      const i=gy*W+gx, t=state.tiles[i];
      if(t===T_WATER) continue;
      if(t===T_TREE || t===T_ROCK) state.tiles[i]=T_GRASS;
      const block = y>=hubFeatureBlockFrom(fh);
      state.feat[i] = block ? 2 : 1;
      if(bsrc<0 || block) bsrc=i;
      claimed=true;
    }
    if(claimed) state.features.push({
      id:src.id||('topography_'+state.features.length),
      slot:src.slot==='rock'?'rock':'tree', tx, ty, w:fw, h:fh,
      biome:hubBiomeId(src.biome, bsrc>=0?state.biome[bsrc]:B_GRASS),
      v:src.v==null?0.35:+src.v, overhang:src.overhang||1.08, heightScale:src.heightScale||1
    });
  }
}
function hubResizeBuilding(state,e,w,h){
  const nw=Math.max(1,w|0), nh=Math.max(1,h|0);
  if(e.w===nw && e.h===nh) return;
  if(typeof markBuilding==='function') markBuilding(state,e,false);
  e.w=nw; e.h=nh; e.x=(e.tx+e.w/2)*TILE; e.y=(e.ty+e.h/2)*TILE;
  if(typeof markBuilding==='function') markBuilding(state,e,true);
}

/* =====================================================================
   HUB ROADS + SIDEWALKS  (procedurally generated, rendered as colored
   canvas tiles by drawRoads() in render.js; pathfinding-biased via
   state.roadCost). All grids are TRANSIENT — rebuilt by hubBuildRoads()
   on every newHubMap() and on save-load, never serialized. Generation
   uses NO RNG so solo/host/client/reload agree byte-for-byte.
   ===================================================================== */
// First unblocked tile scanning the row(s) below a footprint — the building's "door".
// Shared by the road network and the NPC graph (hub_npcs.js) so both terminate on the
// same tile.
function hubDoorstep(state, e){
  const W=state.W, H=state.H, B=state.blocked;
  const cx=e.tx + ((e.w||1)>>1);
  for(let row=0; row<3; row++){
    const ty=e.ty+(e.h||1)+row; if(ty>=H) break;
    for(const off of [0,1,-1,2,-2,3,-3,4,-4]){
      const tx=cx+off; if(tx<0||tx>=W) continue;
      if(!B[ty*W+tx]) return {tx, ty};
    }
  }
  return {tx:cx, ty:Math.min(H-1, e.ty+(e.h||1))};
}

const HUB_OFFROAD_PEN   = 4.0;  // off-road tile cost vs 1.0 on road/sidewalk (pathfinding bias; tuning knob)
const HUB_TOPO_PEN      = 6.0;  // cost to plow a road through trees/rocks (cleared when paved) — roads prefer open ground
const HUB_TURN_PEN      = 2.0;  // per-90°-turn cost → long straight runs / clean orthogonal L routes (tuning knob)
const HUB_ARTERIAL_HALF = 2;    // arterial carriageway half-width → 5-tile avenues
const HUB_STREET_HALF   = 1;    // building-street half-width → 3-tile streets
const HUB_SIDEWALK_W    = 2;    // sidewalk band width, each side

// Turn-penalized (tile,direction) Dijkstra. Routes `start` to the plaza-connected network `conn`
// in long STRAIGHT orthogonal runs (each 90° turn costs HUB_TURN_PEN). Hard walls (buildings +
// open water) are impassable; topography (`topo` = trees/rocks, routable, cleared when paved) costs
// HUB_TOPO_PEN. `topo` is a STABLE snapshot of the original obstacle map (not the live blocked,
// which road-building mutates) so the result is identical on a fresh visit and a reloaded save.
// Returns { path:[tileIdx...], dir:[0..4] } (dir = heading used to ARRIVE at each tile: 0=N,1=E,
// 2=S,3=W, 4=start) or null. Deterministic: a state is (tile,dir) packed as tile*5+dir, so
// ordering by (dist, stateId) is exactly (dist, tile, dir) — no float epsilon.
// `dist`/`par` are caller-owned scratch arrays of length W*H*5 (reset here).
function _hubRoadRoute(W,H,wall,topo,conn,start,dist,par){
  dist.fill(Infinity); par.fill(-1);
  const heap=[];                                            // binary min-heap of [dist, stateId]
  function up(c){ while(c>0){ const p=(c-1)>>1, a=heap[p], b=heap[c];
    if(a[0]<b[0] || (a[0]===b[0] && a[1]<=b[1])) break; heap[p]=b; heap[c]=a; c=p; } }
  function down(){ let c=0; const n=heap.length;
    while(true){ const l=2*c+1, r=2*c+2; let s=c;
      if(l<n && (heap[l][0]<heap[s][0] || (heap[l][0]===heap[s][0] && heap[l][1]<heap[s][1]))) s=l;
      if(r<n && (heap[r][0]<heap[s][0] || (heap[r][0]===heap[s][0] && heap[r][1]<heap[s][1]))) s=r;
      if(s===c) break; const t=heap[s]; heap[s]=heap[c]; heap[c]=t; c=s; } }
  const s0=start*5+4; dist[s0]=0; heap.push([0,s0]);        // start has no heading (dir 4 → first step free of turn cost)
  while(heap.length){
    const top=heap[0], last=heap.pop();
    if(heap.length){ heap[0]=last; down(); }
    const d=top[0], sid=top[1];
    if(d>dist[sid]) continue;
    const i=(sid/5)|0, pd=sid%5;
    if(i!==start && conn[i]){                               // tapped the plaza-connected network → reconstruct
      const path=[], dir=[]; let s=sid;
      while(s!==-1){ path.push((s/5)|0); dir.push(s%5); s=par[s]; }
      path.reverse(); dir.reverse(); return {path, dir};
    }
    const x=i%W, y=(i/W)|0;
    if(y>0)   _hubRouteRelax(i-W, 0, sid, d, pd, wall, topo, dist, par, heap, up);   // N
    if(x<W-1) _hubRouteRelax(i+1, 1, sid, d, pd, wall, topo, dist, par, heap, up);   // E
    if(y<H-1) _hubRouteRelax(i+W, 2, sid, d, pd, wall, topo, dist, par, heap, up);   // S
    if(x>0)   _hubRouteRelax(i-1, 3, sid, d, pd, wall, topo, dist, par, heap, up);   // W
  }
  return null;
}
function _hubRouteRelax(ni, nd, fromSid, d, pd, wall, topo, dist, par, heap, up){
  if(wall[ni]) return;                                      // never route through a building or open water
  const step = (topo[ni] ? HUB_TOPO_PEN : 1.0) + ((pd===4 || nd===pd) ? 0 : HUB_TURN_PEN);
  const nsid = ni*5+nd, ncost = d+step;
  if(ncost < dist[nsid]){ dist[nsid]=ncost; par[nsid]=fromSid; heap.push([ncost,nsid]); up(heap.length-1); }
}
// Last-resort straight carve toward the plaza when Dijkstra finds no route (gaps left on wall tiles).
function _hubRoadFallback(W,H,wall,start,center,pave){
  let x0=start%W, y0=(start/W)|0; const x1=center.x, y1=center.y;
  const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy;
  for(;;){
    if(x0>=0&&y0>=0&&x0<W&&y0<H && !wall[y0*W+x0]) pave(y0*W+x0);
    if(x0===x1 && y0===y1) break;
    const e2=2*err; if(e2>-dy){ err-=dy; x0+=sx; } if(e2<dx){ err+=dx; y0+=sy; }
  }
}

// Build state.roadTiles (0 none / 1 road / 2 sidewalk) + state.roadMask (per-road N/E/S/W
// connectivity nibble). Pure function of state.blocked + the building footprints + the
// authored arterial polylines. Call AFTER hubPlacePois (footprints must be in state.blocked).
function hubBuildRoads(state){
  const W=state.W, H=state.H, N=W*H, B=state.blocked, tiles=state.tiles, feat=state.feat;
  const road=new Uint8Array(N); state.roadTiles=road;
  const axis=new Uint8Array(N); state.roadAxis=axis;          // 0 none / 1 horizontal / 2 vertical (centreline tiles → neon dash)
  const center={x:62,y:50};                                   // downtown plaza (in the gap below ULTRA HQ)
  // ---- hard walls = building footprints + open water (bridges are dirt). Topography (trees/rocks)
  //      is NOT a wall: a road plows through it, clearing the tile to passable when paved. ----
  const wall=new Uint8Array(N);
  for(const e of (state.entities||[])){
    if(!e || e.dead || e.kind!=='building') continue;
    for(let y=e.ty;y<e.ty+(e.h||1);y++) for(let x=e.tx;x<e.tx+(e.w||1);x++)
      if(x>=0&&y>=0&&x<W&&y<H) wall[y*W+x]=1;
  }
  for(let i=0;i<N;i++) if(tiles[i]===T_WATER) wall[i]=1;
  // STABLE obstacle snapshot for routing: the ORIGINAL topography (trees/rocks) from baseBlocked,
  // taken BEFORE any paving. `state.blocked` is mutated by pave() (topo cleared) AND serialized, so
  // reading it would make a reloaded hub route differently from a fresh one — `topo` avoids that
  // (tiles + feat are both original here on fresh build and on load), keeping roads deterministic.
  const topo=new Uint8Array(N);
  for(let i=0;i<N;i++) if(!wall[i] && baseBlocked(state,i)) topo[i]=1;   // clearable obstacle (rock/tree/feature)
  function pave(i){ if(wall[i]) return; road[i]=1; if(B[i]){ B[i]=0; if(feat) feat[i]=0; } }

  // ---- routing runs on 1-wide CENTRELINES first (clean orthogonal runs), then dilates to a
  //      uniform width; this is what makes the roads straight + consistent instead of blobby. ----
  const conn=new Uint8Array(N);             // plaza-connected centreline component (tap targets + router goal)
  const cax=new Uint8Array(N);              // centreline axis: 0 unset / 1 H / 2 V / 9 corner-or-junction (no dash)
  const lines=[];                           // flat [tileIdx, half, ...] centrelines to dilate
  const rdist=new Float64Array(N*5), rpar=new Int32Array(N*5);   // router scratch (reused per call)
  function setAxis(i,a){                     // a: 0=corner→9 (no dash), 1=H, 2=V
    if(a===0){ cax[i]=9; return; }
    if(cax[i]===0) cax[i]=a; else if(cax[i]!==a) cax[i]=9;       // two runs disagree on a tile = junction → no dash
  }
  function addLine(r, half){                 // record a routed centreline (path + per-tile arrival dir)
    const p=r.path, dr=r.dir;
    for(let k=0;k<p.length;k++){
      const t=p[k]; conn[t]=1; lines.push(t, half);
      const inD=dr[k], outD=(k+1<p.length)?dr[k+1]:dr[k];        // a tile is "straight" iff arrival heading == departure heading
      setAxis(t, (inD!==outD)?0 : (inD===1||inD===3)?1 : (inD===0||inD===2)?2 : 0);
    }
  }
  function routeTo(start, half){
    if(conn[start]) return;
    const r=_hubRoadRoute(W,H,wall,topo,conn,start,rdist,rpar);
    if(r) addLine(r, half);
    else _hubRoadFallback(W,H,wall,start,center,(i)=>{ conn[i]=1; lines.push(i, HUB_STREET_HALF); });   // rare: gapped stub
  }

  // ---- 1b. plaza: a clean square block that seeds the connected network ----
  const PLAZA_HALF=3;
  for(let dy=-PLAZA_HALF;dy<=PLAZA_HALF;dy++) for(let dx=-PLAZA_HALF;dx<=PLAZA_HALF;dx++){
    const x=center.x+dx, y=center.y+dy; if(x<0||y<0||x>=W||y>=H) continue;
    const i=y*W+x; if(wall[i]) continue; pave(i); conn[i]=1;     // interior axis stays 0 → no dash across the plaza
  }
  // ---- 1c. orthogonal arterials: route 4 corner gates + a N/S cross-town pair into the plaza ----
  const GATES=[[14,20],[105,20],[15,87],[116,92],[62,16],[62,88]];
  for(const g of GATES){ const tx=g[0], ty=g[1];
    if(tx<0||ty<0||tx>=W||ty>=H) continue;
    if(!wall[ty*W+tx]) routeTo(ty*W+tx, HUB_ARTERIAL_HALF); }
  // ---- 1d. building streets: a door on every side; route the ones not already on the network ----
  const seen=new Set();
  function door(e,dx,dy){                     // first non-wall tile stepping out from a footprint edge
    const cx=e.tx+((e.w||1)>>1), cy=e.ty+((e.h||1)>>1);
    let sx, sy;
    if(dy>0){ sx=cx; sy=e.ty+(e.h||1); } else if(dy<0){ sx=cx; sy=e.ty-1; }
    else if(dx>0){ sx=e.tx+(e.w||1); sy=cy; } else { sx=e.tx-1; sy=cy; }
    for(let s=0;s<6;s++){ const tx=sx+dx*s, ty=sy+dy*s;
      if(tx<0||ty<0||tx>=W||ty>=H) return;
      const i=ty*W+tx; if(!wall[i]){ if(!seen.has(i)){ seen.add(i); routeTo(i, HUB_STREET_HALF); } return; } }
  }
  const builds=(state.entities||[]).filter(e=>e && !e.dead && e.kind==='building');
  builds.sort((a,b)=>{ const ka=(a.hubPoi&&a.hubPoi.id)||('b'+a.id), kb=(b.hubPoi&&b.hubPoi.id)||('b'+b.id); return ka<kb?-1:(ka>kb?1:0); });
  for(const e of builds){ door(e,0,1); door(e,0,-1); door(e,1,0); door(e,-1,0); }
  // ---- 1e. dilate centrelines to uniform width (Chebyshev square; clips on walls so corners fill
  //      cleanly and footprints are never paved; topography under the whole carriageway is cleared) ----
  for(let k=0;k<lines.length;k+=2){ const i=lines[k], half=lines[k+1], cx=i%W, cy=(i/W)|0;
    for(let dy=-half;dy<=half;dy++) for(let dx=-half;dx<=half;dx++){
      const x=cx+dx, y=cy+dy; if(x<0||y<0||x>=W||y>=H) continue; pave(y*W+x);
    }
  }
  // ---- 1f. thick two-sided sidewalks: Chebyshev band HUB_SIDEWALK_W tiles out from the carriageway ----
  let frontier=[]; for(let i=0;i<N;i++) if(road[i]===1) frontier.push(i);
  for(let ring=0; ring<HUB_SIDEWALK_W; ring++){
    const next=[];
    for(const i of frontier){ const x=i%W, y=(i/W)|0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue;
        const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const j=ny*W+nx; if(road[j]||wall[j]||topo[j]) continue;   // wall already covers water; topo = uncleared obstacle
        road[j]=2; next.push(j);
      } }
    frontier=next;
  }
  // ---- 1g. centreline axis (only tiles still on the carriageway, on dash-able straight runs) ----
  for(let i=0;i<N;i++){ if(road[i]===1 && (cax[i]===1||cax[i]===2)) axis[i]=cax[i]; }
  // ---- 1h. connectivity mask (road tiles only): N=1 E=2 S=4 W=8 ----
  const mask=new Uint8Array(N); state.roadMask=mask;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=y*W+x; if(road[i]!==1) continue; let m=0;
    if(y>0 && road[i-W]===1) m|=1;
    if(x<W-1 && road[i+1]===1) m|=2;
    if(y<H-1 && road[i+W]===1) m|=4;
    if(x>0 && road[i-1]===1) m|=8;
    mask[i]=m;
  }
}
// Derive the pathfinding cost overlay from roadTiles: road/sidewalk = 1.0, off-road = penalty.
function hubBuildRoadCost(state){
  const rt=state.roadTiles; if(!rt){ state.roadCost=null; return; }
  const n=state.W*state.H, rc=new Float32Array(n);
  for(let i=0;i<n;i++) rc[i]= rt[i] ? 1.0 : HUB_OFFROAD_PEN;
  state.roadCost=rc;
}
function hubMegaFromConfig(state, cfg, idx){
  const m=Object.assign({}, cfg);
  m.id = m.id || ('hub_mega_'+idx);
  m.variant = (m.variant==null?0:m.variant)|0;
  m.biome = hubBiomeId(m.biome, state.biome[(Math.max(0,Math.min(state.H-1,m.ty|0))*state.W)+Math.max(0,Math.min(state.W-1,m.tx|0))]);
  m.seed = m.seed==null ? (idx+1)*0.173 : m.seed;
  if(m.fixedFrame == null) m.fixedFrame = hubFixedMegaFrame(state, (m.tx||0)+(m.ty||0)+idx);
  if(hubHasTag(cfg,'neon')) m.neon=true;
  if(hubHasTag(cfg,'hubCondo')){ m.hubCondo=true; m.neon=true; }
  if(hubHasTag(cfg,'hubUltra')){ m.hubUltra=true; m.neon=true; }
  if(hubHasTag(cfg,'hubAnim')){ m.hubAnim=true; m.neon=true; }   // animate (smooth, half-speed) in the HUB instead of a static frame
  if(hubHasTag(cfg,'hubWaste')) m.hubWaste=true;
  return m;
}
function hubMegaExists(state,cfg){
  return (state.megaSprites||[]).some(m=>{
    if(cfg.id && m.id===cfg.id) return true;
    if(cfg.poiId && m.poiId===cfg.poiId) return true;
    if(hubHasTag(cfg,'hubUltra') && m.hubUltra) return true;
    if(hubHasTag(cfg,'hubWaste') && m.hubWaste && m.tx===cfg.tx && m.ty===cfg.ty) return true;
    return false;
  });
}
function hubEnsureMapMegas(state){
  state.megaSprites = state.megaSprites || [];
  (HUB.megaSprites||[]).forEach((cfg,i)=>{
    if(!hubMegaExists(state,cfg)) state.megaSprites.push(hubMegaFromConfig(state,cfg,i));
  });
}
function hubApplyPoiVisual(e,p){
  const v=p && p.visual;
  if(v && v.type){
    e.hubSpriteVisual = { type:v.type, faction:v.faction, neonId:v.neonId,
      fixedFrame:v.fixedFrame||0, w:v.w||e.w, h:v.h||e.h,
      overhang:v.overhang||1.08, heightScale:v.heightScale||1,
      stack:v.stack||1, stackOverlap:(v.stackOverlap!=null?v.stackOverlap:0.06),
      stackFrames:Array.isArray(v.stackFrames)?v.stackFrames.slice():null, seed:(e.id||1)*0.071 };
  }
  if(v && v.megaId) e.hubMegaVisual=true;
  if(p && (HUB.megaSprites||[]).some(m=>m.poiId===p.id && (hubHasTag(m,'hubCondo') || hubHasTag(m,'hubUltra')))) e.hubMegaVisual=true;
}
function hubAddCondoMega(state, e){
  if(!e || !e.hubPoi) return;
  e.hubMegaVisual=true;
  const cfg=(HUB.megaSprites||[]).find(m=>m.poiId===e.hubPoi.id && hubHasTag(m,'hubCondo'));
  if(cfg && !hubMegaExists(state,cfg)) state.megaSprites.push(hubMegaFromConfig(state,cfg,state.megaSprites.length));
}
function hubAddMdcVisual(e){
  if(!e || !e.hubPoi) return;
  const p=hubPoiConfig(e.hubPoi.id);
  if(p) hubApplyPoiVisual(e,p);
}
function hubRestorePoiVisuals(state){
  if(!state || !state.hub) return;
  state.megaSprites = state.megaSprites || [];
  for(const e of state.entities||[]){
    if(!e || !e.hubPoi) continue;
    if(e.hubPoi.id==='mdc_waste'){
      if(typeof markBuilding==='function') markBuilding(state,e,false);
      e.dead=true; if(state.hubPois) delete state.hubPois.mdc_waste;
      continue;
    }
    const p=hubPoiConfig(e.hubPoi.id);
    if(p) hubApplyPoiVisual(e,p);
  }
  hubEnsureMapMegas(state);
}
// Clear a tile box so a facility footprint reads cleanly: turn tree/rock tiles to grass and
// drop any topography feature (+ its walk-under mask) overlapping the box. Used when injecting
// a facility into an ALREADY-GENERATED (loaded) HUB map.
function hubClearFootprint(state, x0, y0, w, h){
  const W=state.W, H=state.H;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    const i=y*W+x;
    if(state.tiles[i]===T_TREE || state.tiles[i]===T_ROCK){ state.tiles[i]=T_GRASS; if(state.feat) state.feat[i]=0; }
  }
  const ov=(f)=>{ const fw=Math.max(1,(f.w||1)|0), fh=Math.max(1,(f.h||1)|0);
    return f.tx < x0+w && f.tx+fw > x0 && f.ty < y0+h && f.ty+fh > y0; };
  const drop=(state.features||[]).filter(ov);
  if(drop.length){
    for(const f of drop){ const fw=Math.max(1,(f.w||1)|0), fh=Math.max(1,(f.h||1)|0);
      for(let y=0;y<fh;y++) for(let x=0;x<fw;x++){ const cx=f.tx+x, cy=f.ty+y;
        if(cx>=0&&cy>=0&&cx<W&&cy<H && state.feat) state.feat[cy*W+cx]=0; } }
    state.features=state.features.filter(f=>!ov(f));
  }
}
// A loaded HUB save snapshots the map as it was when SAVED, so HUB-layout edits (a new facility
// like the Training Grounds, a removed building) won't appear on old saves. Reconcile the loaded
// map against the current HUB.pois: inject any missing POI, remove superseded decor buildings that
// occupy its footprint, clear terrain under it, then re-materialise any trainees. Idempotent.
function hubReconcileFacilities(state){
  if(!state || !state.hub) return;
  state.hubPois = state.hubPois || {};
  // Drop decor megaSprites removed from the HUB layout since this save was written (e.g. the stray
  // pyramid that overlapped the relocated NE MDC). Hub megas are entirely config-driven, so any
  // non-POI sprite whose id is gone from HUB.megaSprites is stale. POI/condo/ULTRA-backed visuals
  // (poiId set) and legacy unnamed decor are kept.
  if(Array.isArray(state.megaSprites) && state.megaSprites.length){
    const liveIds=new Set((HUB.megaSprites||[]).map(m=>m.id).filter(Boolean));
    state.megaSprites=state.megaSprites.filter(m=> m && (m.poiId || !m.id || liveIds.has(m.id)));
  }
  const overlaps=(ax,ay,aw,ah, bx,by,bw,bh)=> ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  let added=false;
  for(const p of (HUB.pois||[])){
    if(!hubPoiAvailable(p)) continue;   // progress-gated POIs (e.g. The Wake pre-Ep XI) aren't injected yet
    if((state.entities||[]).some(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.id===p.id)) continue;   // already present
    const d=DEF[p.type]||{w:3,h:3}, w=p.w||d.w||3, h=p.h||d.h||3;
    // remove decor / non-POI buildings sitting on this footprint (e.g. the old launchpad)
    for(const e of (state.entities||[])){
      if(!e || e.dead || e.kind!=='building') continue;
      if(e.hubPoi && e.hubPoi.kind!=='decor') continue;                 // keep real POIs
      if(overlaps(p.x,p.y,w,h, e.tx,e.ty,e.w,e.h)){
        if(typeof markBuilding==='function') markBuilding(state,e,false);
        e.dead=true;
        if(state.hubPois && e.hubPoi) delete state.hubPois[e.hubPoi.id];
      }
    }
    hubClearFootprint(state, p.x-2, p.y-2, w+4, h+4);
    const e=mkBuilding(state, p.type, 'neutral', p.x, p.y, true);
    hubResizeBuilding(state, e, w, h);
    e.hubPoi={id:p.id, kind:p.kind, name:p.name};
    state.hubPois[p.id]=e;
    hubApplyPoiVisual(e, p);
    added=true;
  }
  // Migrate saves written before a facility was MOVED: snap any POI whose stored footprint drifted
  // from the canonical HUB.pois layout to its current position. Older hub saves bake the old
  // coordinates into their entities (and rebuild blocked[] around them), so without this they keep
  // the stale — sometimes path-blocking — placement until the next fresh hub entry.
  let moved=false;
  for(const p of (HUB.pois||[])){
    const e=state.hubPois[p.id] || (state.entities||[]).find(x=>x&&!x.dead&&x.hubPoi&&x.hubPoi.id===p.id);
    if(!e) continue;                                                  // missing → handled by the inject loop above
    const d=DEF[p.type]||{w:3,h:3}, w=p.w||d.w||3, h=p.h||d.h||3;
    if(e.tx===p.x && e.ty===p.y && e.w===w && e.h===h){            // already canonical —
      hubApplyPoiVisual(e,p);                                      // still refresh the render-only visual so old saves pick up art changes (e.g. the Wake's stackFrames)
      state.hubPois[p.id]=e; continue;
    }
    e.tx=p.x; e.ty=p.y; e.w=w; e.h=h; e.x=(p.x+w/2)*TILE; e.y=(p.y+h/2)*TILE;
    hubClearFootprint(state, p.x-2, p.y-2, w+4, h+4);
    hubApplyPoiVisual(e, p);
    // mega-backed POIs (condos / ULTRA) draw a separate sprite — keep it on the footprint
    const liveMega=(state.megaSprites||[]).find(m=>m.poiId===p.id), cfgMega=(HUB.megaSprites||[]).find(m=>m.poiId===p.id);
    if(liveMega && cfgMega){ liveMega.tx=cfgMega.tx; liveMega.ty=cfgMega.ty; }
    // re-anchor any locked trainees to the relocated grounds (drawHubTrainees re-snaps on _trainPlaced=false)
    if(p.kind==='training'){
      for(const u of (state.entities||[])){
        if(u && !u.dead && u.kind==='unit' && u.storedIn===e.id && u.trainSlot!=null){ u._trainPlaced=false; u.x=e.x; u.y=e.y; }
      }
    }
    state.hubPois[p.id]=e;
    moved=true;
  }
  // Same migration for decor buildings (HUB.buildings): old saves bake their footprint at save
  // time, so a layout resize (e.g. the oversized garage / satellite office shrunk to 3×3) never
  // reaches them. Decor entries with poiId:null leave no id on the entity, so match by type+owner
  // on an overlapping footprint — layout edits keep the new rect inside the old one.
  for(const b of (HUB.buildings||[])){
    const w=Math.max(1,(b.w|0)||3), h=Math.max(1,(b.h|0)||3), owner=b.owner||'neutral';
    const e=(state.entities||[]).find(x=> x && !x.dead && x.kind==='building' && x.type===b.type
        && (x.owner||'neutral')===owner && !(x.hubPoi && x.hubPoi.kind!=='decor')
        && (b.poiId ? (x.hubPoi && x.hubPoi.id===b.poiId)
                    : overlaps(b.tx,b.ty,w,h, x.tx,x.ty,x.w,x.h)));
    if(!e) continue;
    if(e.tx===b.tx && e.ty===b.ty && e.w===w && e.h===h) continue;
    e.tx=b.tx; e.ty=b.ty; e.w=w; e.h=h; e.x=(b.tx+w/2)*TILE; e.y=(b.ty+h/2)*TILE;
    moved=true;
  }
  // Drop STRAY decor buildings: a building of a known decor type (one that appears in HUB.buildings,
  // i.e. garage / outpost) that is NEITHER a currently-configured POI NOR matches a current
  // HUB.buildings footprint. These are leftovers baked into an old save from a superseded layout —
  // e.g. a satellite office (an 'outpost' sprite) stranded among the megasprites near the ULTRA HQ,
  // possibly still carrying a stale hubPoi tag from a long-removed facility. Runs AFTER the migration
  // loop, so the canonical garage/satellite office are already snapped to config and survive. Real,
  // still-configured POIs are kept by id — the Mental Health Facility is internally an 'outpost' but
  // its hubPoi.id ('mentalhealth') is in HUB.pois, so it is never touched.
  const _decorTypes=new Set((HUB.buildings||[]).map(b=>b.type));
  const _poiIds=new Set((HUB.pois||[]).map(p=>p.id));
  let removed=false;
  // Progress-gated POIs (e.g. The Wake before Episode XI) may be BAKED into an old save written
  // when they were always present. The inject loop above only skips ADDING them — it can't remove
  // one already in the save — so drop any still-saved POI entity that isn't available at this point
  // in the campaign. (Without this, loading a pre-Ep-XI save shows a Wake that shouldn't exist yet.)
  for(const e of (state.entities||[])){
    if(!e || e.dead || e.kind!=='building' || !e.hubPoi) continue;
    const p=hubPoiConfig(e.hubPoi.id);
    if(p && !hubPoiAvailable(p)){
      if(typeof markBuilding==='function') markBuilding(state,e,false);
      if(state.hubPois && e.hubPoi) delete state.hubPois[e.hubPoi.id];
      e.dead=true; removed=true;
    }
  }
  for(const e of (state.entities||[])){
    if(!e || e.dead || e.kind!=='building') continue;
    if(e.hubPoi && _poiIds.has(e.hubPoi.id)) continue;               // keep real, still-configured POIs (incl. Mental Health Facility)
    if(!_decorTypes.has(e.type)) continue;                           // only prune known decor classes (garage/outpost)
    const ok=(HUB.buildings||[]).some(b=> b.type===e.type
      && overlaps(b.tx,b.ty,Math.max(1,(b.w|0)||3),Math.max(1,(b.h|0)||3), e.tx,e.ty,e.w,e.h));
    if(ok) continue;                                                 // matches a config decor footprint → canonical, keep
    if(typeof markBuilding==='function') markBuilding(state,e,false);
    if(state.hubPois && e.hubPoi) delete state.hubPois[e.hubPoi.id];
    e.dead=true; removed=true;
  }
  if(moved || removed){
    // recompute passability from terrain + features, then re-block every building at its current footprint
    if(typeof baseBlocked==='function') for(let i=0;i<state.W*state.H;i++) state.blocked[i]=baseBlocked(state,i);
    if(typeof markBuilding==='function') for(const b of (state.entities||[])){ if(b&&!b.dead&&b.kind==='building') markBuilding(state,b,true); }
    if(typeof markFundingNode==='function') for(const b of (state.entities||[])){ if(b&&!b.dead&&b.type==='goldmine') markFundingNode(state,b); }
  }
  if(added || moved){
    hubEnsureMapMegas(state);
    if(typeof hubSpawnTrainees==='function') hubSpawnTrainees(state);
    if(typeof hubSpawnHealers==='function') hubSpawnHealers(state);
    if(typeof recomputeSupply==='function') recomputeSupply(state);
  }
}
function hubPlacePois(state){
  for(const p of HUB.pois){
    if(!hubPoiAvailable(p)) continue;   // e.g. The Wake stays absent until Episode XI is cleared
    const e=mkBuilding(state,p.type,'neutral',p.x,p.y,true);
    hubResizeBuilding(state,e,p.w||e.w,p.h||e.h);
    e.hubPoi={id:p.id, kind:p.kind, name:p.name};
    state.hubPois[p.id]=e;
    hubApplyPoiVisual(e,p);
  }
  for(const b of HUB.buildings||[]){
    const e=mkBuilding(state,b.type,b.owner||'neutral',b.tx,b.ty,true);
    hubResizeBuilding(state,e,b.w||e.w,b.h||e.h);
    if(b.visual && b.visual.type) e.hubSpriteVisual = { type:b.visual.type, faction:b.visual.faction, neonId:b.visual.neonId,
      fixedFrame:b.visual.fixedFrame||0, w:b.visual.w||e.w, h:b.visual.h||e.h,
      overhang:b.visual.overhang||1.08, heightScale:b.visual.heightScale||1, seed:(e.id||1)*0.071 };
    if(b.poiId) e.hubPoi={id:b.poiId, kind:'decor', name:b.id||b.poiId};
  }
  hubEnsureMapMegas(state);
}
function hubSpawnRoster(state){
  const condos=Object.values(CAMPAIGN.condos), posByCondo={};
  if(!condos.length) return;
  const poiById=state.hubPois;
  const fallbackId=condos[0].id;
  for(const r of CAMPAIGN.roster){
    let cid=(condos.find(c=>(c.residents||[]).includes(r.key))||condos[0]).id;
    const home=poiById[cid] || poiById[fallbackId] || Object.values(poiById)[0];
    if(!home) continue;
    const n=posByCondo[cid] || 0; posByCondo[cid]=n+1;
    const u=mkUnit(state,r.type,'player',home.tx+2+(n%5),home.ty+home.h+1+((n/5)|0));
    u.hubKey=r.key; u.stars=r.stars||0; u.xp=r.xp||0; u.lore=r.lore||null;
    u.hero=!!r.hero; u.heroId=r.heroId||null; u.spriteType=r.spriteType||null;
    u.madosis=r.madosis||0; u.sanityThreshold=r.sanityThreshold||0; u.scarred=!!r.scarred;   // sanity persists in the roster
    u.reborn=!!r.reborn;                                                                       // reborn cyborg flag
    hubApplyUpgrades(u); if(typeof applyVetHp==='function') applyVetHp(u,true);
  }
}
function hubApplyUpgrades(u){
  const up=CAMPAIGN.upgrades[hubUnitKey(u)] || {};
  const condo=hubCondoForUnit(hubUnitKey(u));
  const condoLvl=condo ? condo.level||0 : 0, implant=up.implantLevel||0;
  u.hubHpMul = 1 + condoLvl*0.04 + implant*0.03;
  u.hubDmgMul = 1 + implant*0.03;
  if(up.styleId) u.hubStyle=up.styleId;
}
function hubCondoForUnit(key){ return Object.values(CAMPAIGN.condos).find(c=>(c.residents||[]).includes(key)); }

function updateHub(state, dt){
  hubRevealAll(state);
  hubVetRoutine(state, dt);   // living city: idle veterans stroll/visit by the city clock, sleep at night
  for(const u of state.entities){
    if(u.dead||u.kind!=='unit'||u.owner!=='player') continue;
    if(u.cmd && u.cmd.type==='hubpoi'){
      const poi=u.cmd.poi;
      if(!poi||poi.dead){ u.cmd=null; continue; }
      if(dist(u,poi) < entRadius(poi)+18){ u.cmd=null; u.state='idle'; hubUnitArrivedPoi(state,u,poi); }
    }
  }
}
function hubCommandPoi(state, units, poi){
  if(!state||!state.hub||!poi||!poi.hubPoi) return false;
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return true; }
  units.filter(u=>u.kind==='unit'&&u.owner==='player').forEach(u=>{
    resetMotion(u); u.cmd={type:'hubpoi', poi};
    const spot=nearestFreeAdjTile(state,poi,u.x,u.y) || {x:poi.x,y:poi.y};
    issueMoveKeepCmd(state,u,spot.x,spot.y);
  });
  spawnRing(poi.x,poi.y,'#ffd24a');
  toast('Heading to '+poi.hubPoi.name);
  return true;
}
function hubUnitArrivedPoi(state,u,poi){
  const p=poi.hubPoi;
  if(p.kind==='mdc') hubStageUnit(u,p.id,poi);
  else if(p.kind==='condo') hubShowCondo(p.id);
  else if(p.kind==='ultra') hubShowUltra(u);
  else if(p.kind==='training') hubTrainStage(state,u,poi);
  else if(p.kind==='mentalhealth') hubHealStage(state,u,poi);
  else if(p.kind==='wake') openWakeMenu();
}
function hubEnlistedKeys(){
  CAMPAIGN.dispatch = Object.assign({mdcId:null, staged:[]}, CAMPAIGN.dispatch||{});
  const staged=CAMPAIGN.dispatch.staged||[];
  const seen=new Set(), out=[];
  staged.forEach(k=>{ if(k && !seen.has(k)){ seen.add(k); out.push(k); } });
  CAMPAIGN.dispatch.staged=out;
  return out;
}
function hubEnlistedUnits(state){
  if(!state) return [];
  const keys=new Set(hubEnlistedKeys());
  for(const mdc of (state.entities||[])){
    if(!mdc||mdc.dead||!mdc.hubPoi||mdc.hubPoi.kind!=='mdc') continue;
    const ids=mdc.storedUnits||[];
    for(const id of ids){
      const u=(state.entities||[]).find(e=>e&&e.id===id&&!e.dead&&e.storedIn===mdc.id);
      if(u&&u.owner==='player'&&u.kind==='unit') keys.add(hubUnitKey(u));
    }
  }
  const live=(state.entities||[]).filter(u=>u&&!u.dead&&u.owner==='player'&&u.kind==='unit'&&keys.has(hubUnitKey(u)));
  if(live.length!==keys.size) CAMPAIGN.dispatch.staged=live.map(u=>hubUnitKey(u));
  else CAMPAIGN.dispatch.staged=Array.from(keys);
  return live;
}
function hubFindMdcById(state,mdcId){
  if(!state) return null;
  if(state.hubPois && state.hubPois[mdcId]) return state.hubPois[mdcId];
  return (state.entities||[]).find(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.id===mdcId) || null;
}
function hubMdcForStoredUnit(state,u){
  if(!state||!u) return null;
  const mdcs=(state.entities||[]).filter(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.kind==='mdc');
  if(u.storedIn){
    const byStored=mdcs.find(e=>e.id===u.storedIn);
    if(byStored) return byStored;
  }
  return mdcs.find(e=>(e.storedUnits||[]).includes(u.id)) || null;
}
function hubDispatchVetCap(){
  const idx=(typeof hubNextDeployIndex==='function') ? hubNextDeployIndex()
          : ((CAMPAIGN&&CAMPAIGN.nextMapIndex!=null) ? CAMPAIGN.nextMapIndex : mapIndex);
  return (typeof vetCarryCountFor==='function') ? vetCarryCountFor(idx) : 6;
}
function hubDispatchFullMessage(cap){
  return 'Dispatch list full. The next mission only requires '+cap+' units.';
}
function hubDispatchVetCount(state, exceptKey){
  return hubEnlistedUnits(state)
    .filter(u=>!u.hero && hubUnitKey(u)!==exceptKey)
    .length;
}
function hubMdcExitTile(state,mdc,seed){
  if(!state||!mdc) return null;
  const free=(tx,ty)=>{
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) return false;
    if(state.blocked[ty*state.W+tx]) return false;
    const wx=tx*TILE+TILE/2, wy=ty*TILE+TILE/2;
    return !(state.entities||[]).some(e=>!e.dead&&!e.storedIn&&e.kind==='unit'&&Math.hypot(e.x-wx,e.y-wy)<(e.r||9)+12);
  };
  const choose=(spots)=>{
    if(!spots.length) return null;
    const start=Math.abs(seed||0)%spots.length;
    return spots[start];
  };
  for(let r=0;r<=4;r++){
    const y=mdc.ty+mdc.h+r;
    const direct=[], shoulder=[];
    for(let x=0;x<mdc.w;x++){
      const tx=mdc.tx+x;
      if(free(tx,y)) direct.push({tx,ty:y});
    }
    const picked=choose(direct);
    if(picked) return picked;
    for(const tx of [mdc.tx-1, mdc.tx+mdc.w]){
      if(free(tx,y)) shoulder.push({tx,ty:y});
    }
    const side=choose(shoulder);
    if(side) return side;
  }
  return (typeof hqExitTile==='function') ? hqExitTile(state,mdc,seed) : null;
}
function hubStageUnit(u,mdcId,mdc){
  if(!hubCanAct()) return;
  if(!G||!G.hub||!u||u.dead||u.owner!=='player'||u.kind!=='unit') return;
  mdc = mdc || hubFindMdcById(G,mdcId);
  if(!mdc||!mdc.hubPoi||mdc.hubPoi.kind!=='mdc') return;
  const key=hubUnitKey(u);
  hubEnlistedKeys();
  if(!u.hero && !CAMPAIGN.dispatch.staged.includes(key)){
    const cap=hubDispatchVetCap();
    if(hubDispatchVetCount(G,key) >= cap){
      resetMotion(u);
      u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
      toast(hubDispatchFullMessage(cap));
      refreshUI();
      return;
    }
  }
  CAMPAIGN.dispatch.mdcId=mdcId;
  if(!CAMPAIGN.dispatch.staged.includes(key)) CAMPAIGN.dispatch.staged.push(key);
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=mdc.id; u.x=mdc.x; u.y=mdc.y;
  mdc.storedUnits=(mdc.storedUnits||[]).filter(id=>id!==u.id);
  mdc.storedUnits.push(u.id);
  u.selected=false;
  G.selection=G.selection.filter(e=>e!==u);
  spawnRing(mdc.x,mdc.y,'#ffd24a');
  toast((u.heroId||DEF[u.type].name)+' enlisted at '+mdc.hubPoi.name+'.');
  if(typeof hqStoredUnits==='function') hqStoredUnits(G,mdc);
  refreshUI();
}
function hubReleaseFromMdc(unitKey){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  if(!G||!G.hub||!unitKey) return false;
  const u=(G.entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&hubUnitKey(e)===unitKey);
  if(!u) return false;
  const mdc=hubMdcForStoredUnit(G,u) || hubFindMdcById(G,CAMPAIGN.dispatch&&CAMPAIGN.dispatch.mdcId);
  const stored=!!(mdc && (u.storedIn===mdc.id || (mdc.storedUnits||[]).includes(u.id)));
  if(stored){
    const spot=hubMdcExitTile(G,mdc,u.id);
    if(!spot){ toast('No room outside M.D.C.'); return false; }
    for(const b of (G.entities||[])){
      if(b&&b.hubPoi&&b.hubPoi.kind==='mdc'&&b.storedUnits) b.storedUnits=b.storedUnits.filter(id=>id!==u.id);
    }
    delete u.storedIn;
    u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2;
    resetMotion(u); u.cmd=null; u.state='idle'; u.selected=false;
    spawnRing(u.x,u.y,'#7fd6ff');
  }
  const staged=hubEnlistedKeys().filter(k=>k!==unitKey);
  CAMPAIGN.dispatch.staged=staged;
  toast((DEF[u.type].name||'Unit')+' removed from dispatch.');
  refreshUI();
  return true;
}
function hubDispatchNextEpisode(){
  if(!hubCanAct()){ toast('Only the host can launch from the H.U.B.'); return; }
  const live=hubEnlistedUnits(G).filter(u=>(u.ctrl||'p1')===hubOwnerCtrl());
  if(!live.length){ toast('Enlist at least one unit at an M.D.C..'); return; }
  const heroes=live.filter(u=>u.hero), vets=live.filter(u=>!u.hero);
  const cap=hubDispatchVetCap();
  if(vets.length>cap){ toast(hubDispatchFullMessage(cap)); return; }
  // MADOSIS rest-decay: every veteran left behind this dispatch recovers a little sanity (Training
  // Grounds trainees are exempt — their minds are occupied). Operates on the persistent roster.
  if(typeof madosisRestDecay==='function') madosisRestDecay(new Set(live.map(u=>hubUnitKey(u))));
  setCarryover(vets.slice(0,cap)); captureHeroes({entities:heroes});
  CAMPAIGN.mode='combat';
  // gate villains interrupt; past the last episode the FINALE boss is the deployment (T2-7)
  let idx=(typeof hubNextDeployIndex==='function') ? hubNextDeployIndex()
        : Math.max(0, Math.min(CAMPAIGN.nextMapIndex, MAPS.length-1));
  mapIndex=idx;
  hubStartDispatchFlight(G, 0);                 // dur refined by showCrawl once narration length is known
  if(typeof LOADER!=='undefined') LOADER.beginMission(missionTags(idx));   // the dispatch crawl doubles as the download window
  showCrawl(idx, ()=>{ gateMission(idx, ()=>{ endDispatchFlight(G); loadMap(idx); }); });
}
function hubLaunchNextEpisode(){ hubDispatchNextEpisode(); }
function hubSpend(cost){
  if(!hubCanAct()){ toast('Only the host can spend M3rit$.'); return false; }
  if(CAMPAIGN.m3 < cost){ toast('Not enough M3rit$'); return false; }
  CAMPAIGN.m3-=cost; return true;
}
function hubUpgradeSelectedCondo(id){
  if(!hubCanAct()){ toast('Only the host can upgrade the H.U.B.'); return; }
  // accepts an explicit condo id (condo panel opened by arrival/locate) or falls back to the selection
  let condoId=id;
  if(!condoId){ const poi=G&&G.selection[0]; if(!poi||!poi.hubPoi||poi.hubPoi.kind!=='condo') return; condoId=poi.hubPoi.id; }
  if(!CAMPAIGN.condos[condoId]) return;
  const c=CAMPAIGN.condos[condoId], lvl=c.level||0, cost=HUB.condoCosts[lvl];
  if(cost==null){ toast('Condo already maxed'); return; }
  if(hubSpend(cost)){
    c.level=lvl+1;
    hubRebakeResidents(c);                 // apply the new +HP to this condo's spawned residents NOW (mirrors the implant upgrade)
    toast('Condo upgraded to level '+c.level); refreshUI();
  }
}
// Re-bake HP/upgrades for a condo's residents currently spawned in the H.U.B. so a condo-level change
// takes effect immediately, not only on the next spawn. Host-gated via the caller (hubUpgradeSelectedCondo).
function hubRebakeResidents(c){
  if(!c || typeof G==='undefined' || !G || !G.entities) return;
  const res=c.residents||[];
  for(const u of G.entities){
    if(u.dead || u.kind!=='unit' || u.owner!=='player') continue;
    if(res.includes(hubUnitKey(u))){ hubApplyUpgrades(u); if(typeof applyVetHp==='function') applyVetHp(u,false); }
  }
}
function hubUpgradeSelectedUnit(kind){
  if(!hubCanAct()){ toast('Only the host can upgrade H.U.B. residents.'); return; }
  const u=G&&G.selection.find(e=>e.kind==='unit'&&e.owner==='player'); if(!u){ toast('Select a resident first'); return; }
  const key=hubUnitKey(u), up=CAMPAIGN.upgrades[key]||(CAMPAIGN.upgrades[key]={});
  if(kind==='implant'){
    const lvl=up.implantLevel||0, cost=HUB.implantCosts[lvl];
    if(cost==null){ toast('Implants already maxed'); return; }
    if(hubSpend(cost)){ up.implantLevel=lvl+1; hubApplyUpgrades(u); applyVetHp(u,true); toast('Implant level '+up.implantLevel); }
  } else if(kind==='style'){
    if(up.styleId){ toast('Style already purchased'); return; }
    if(hubSpend(HUB.styleCost)){ up.styleId='neon-'+((key.length%5)+1); u.hubStyle=up.styleId; toast('Style purchased'); }
  } else if(kind==='academy'){
    if(up.academyVisit===CAMPAIGN.visit){ toast('Already trained this HUB visit'); return; }
    if(hubSpend(HUB.academyCost)){ up.academyVisit=CAMPAIGN.visit; u.xp=(u.xp||0)+80; toast('Academy training complete'); }
  }
  refreshUI();
}
function hubGamble(){
  if(!hubCanAct()){ toast('Only the host can speculate at ULTRA.'); return; }
  if(CAMPAIGN.gambled){ toast('The kiosk already liquidated your optimism.'); return; }
  if(!hubSpend(HUB.gambleStake)) return;
  CAMPAIGN.gambled=true;
  // T3-9: genuinely random (seeded RNG, fresh stream per pull) — the old (visit*37+m3)%3 check was
  // deterministic, so the kiosk could be gamed by adjusting the treasury before pulling.
  if(CAMPAIGN._gambleSeed==null) CAMPAIGN._gambleSeed=(Math.random()*1e9)>>>0;
  CAMPAIGN._gambleSeed=(Math.imul(CAMPAIGN._gambleSeed,1664525)+1013904223)>>>0;
  const win=(CAMPAIGN._gambleSeed/4294967296) < (1/3);
  if(win){ CAMPAIGN.m3+=260; toast('Speculation paid out: M3$260'); }
  else toast('Speculation failed. The market calls it learning.');
  refreshUI();
}
// T3-9: "Series \u221e" — the uncapped M3$ sink. Each rank: +1% max HP for the whole roster, rising cost.
function seriesInfCost(){ const r=(CAMPAIGN.seriesInf||0); return Math.round(300*Math.pow(1.35, r)); }
function hubBuySeriesInf(){
  if(!hubCanAct()){ toast('Only the host can raise at ULTRA.'); return; }
  if(!hubSpend(seriesInfCost())) return;
  CAMPAIGN.seriesInf=(CAMPAIGN.seriesInf||0)+1;
  // re-bake every live player unit's HP so the rank lands immediately
  if(typeof G!=='undefined' && G && typeof applyVetHp==='function')
    for(const u of G.entities){ if(!u.dead && u.owner==='player' && u.kind==='unit') applyVetHp(u,false); }
  toast('\ud83d\udcc8 Series \u221e round '+CAMPAIGN.seriesInf+' closed — roster +1% HP (now +'+CAMPAIGN.seriesInf+'%)');
  refreshUI();
}
function hubShowCondo(id){
  if(typeof openCondoMenu==='function'){ openCondoMenu(id); return; }   // full resident panel (ui.js)
  const c=CAMPAIGN.condos[id]; toast('Condo level '+(c.level||0)+' — residents: '+(c.residents||[]).length);
}
function hubShowUltra(u){ toast('ULTRA services unlocked for '+((u&&u.heroId)||'resident')+'.'); }

/* =====================================================================
   LIVING CITY — veteran routines, condo sleep, statuses, click-to-locate.
   Sim-side (veterans are real serialized entities) so it lives here, not in
   the cosmetic hub_npcs.js module. Runs host/solo only via updateHub.
   ===================================================================== */
const HUB_VET_HOLD = 45;            // seconds a player command parks a veteran's routine
let _vetAcc = 0, _vetCursor = 0, _vetRng = 0x5eed;
const _vetHold = {};                // hubUnitKey → state.time the routine may resume at (module-local)
function _vetRand(){ _vetRng=(Math.imul(_vetRng,1664525)+1013904223)>>>0; return _vetRng/4294967296; }
function hubCityClock(){ return (typeof HUBNPC!=='undefined' && HUBNPC.clock) ? HUBNPC.clock() : null; }
function _hubNightFor(clock){ return !!clock && (clock.h>=21 || clock.h<7); }

function hubVetRoutine(state, dt){
  if(!state || !state.hub || state.flashCutscene || state.extractFlight) return;
  _vetAcc += dt; if(_vetAcc < 0.5) return; _vetAcc = 0;
  const clock = hubCityClock(), night = _hubNightFor(clock);
  const units = [];
  for(const u of state.entities){
    if(!u || u.dead || u.kind!=='unit' || u.owner!=='player') continue;
    // morning wake pass: sleeping vets get out of bed when the city does
    if(u._hubSleep){ if(clock && !night) hubVetWake(state, u); continue; }
    if(u.storedIn) continue;                                  // MDC-staged / trainee / healer
    if(u.selected) continue;                                  // the player is about to give orders
    if(u.cmd){ if(!u.cmd._routine) _vetHold[hubUnitKey(u)]=state.time+HUB_VET_HOLD; continue; }
    if((_vetHold[hubUnitKey(u)]||0) > state.time) continue;   // player orders win; resume after idle
    units.push(u);
  }
  if(!units.length) return;
  for(let n=0; n<2; n++){                                     // ≤2 decisions per 0.5s tick (A* stays sub-ms)
    const u = units[(_vetCursor++) % units.length];
    if(!u || state.time < (u._hubNextDecide||0)) continue;
    u._hubNextDecide = state.time + 25 + _vetRand()*20;       // each vet re-decides every ~25-45s
    if(night) hubVetGoHome(state, u);
    else hubVetWander(state, u);
  }
}
function _hubFreeTileNear(state, tx, ty, spread){
  for(let tries=0; tries<10; tries++){
    const x=tx+((_vetRand()*spread*2-spread)|0), y=ty+((_vetRand()*spread*2-spread)|0);
    if(x>=0&&y>=0&&x<state.W&&y<state.H&&!state.blocked[y*state.W+x]) return {tx:x, ty:y};
  }
  return null;
}
function _hubRoutineMove(state, u, spot, goal){
  if(!spot) return;
  resetMotion(u);
  // plain 'move' command, NEVER 'hubpoi' — both auto-stage paths key exclusively on hubpoi,
  // so a routine stroll past the M.D.C. can never enlist anyone.
  issueMove(state, u, spot.tx*TILE+TILE/2, spot.ty*TILE+TILE/2,
            { type:'move', x:spot.tx*TILE+TILE/2, y:spot.ty*TILE+TILE/2, _routine:1, _goal:goal||'' });
}
function hubVetWander(state, u){
  const pois=[]; for(const k in (state.hubPois||{})){ const e=state.hubPois[k]; if(e&&!e.dead) pois.push(e); }
  const roll=_vetRand();
  let spot=null;
  if(roll<0.45){ spot=_hubFreeTileNear(state, 62, 47, 6); }                       // downtown plaza
  else if(roll<0.8 && pois.length){                                              // window-shop a POI doorstep
    const e=pois[(_vetRand()*pois.length)|0];
    const d=nearestFreeAdjTile(state, e, u.x, u.y);
    if(d) spot={tx:(d.x/TILE)|0, ty:(d.y/TILE)|0};
  } else {                                                                       // hang out near home
    const condo=hubCondoForUnit(hubUnitKey(u)), e=condo&&state.hubPois&&state.hubPois[condo.id];
    if(e) spot=_hubFreeTileNear(state, e.tx+((e.w||3)>>1), e.ty+(e.h||3)+1, 3);
  }
  if(spot) _hubRoutineMove(state, u, spot, 'stroll');
}
function hubVetGoHome(state, u){
  const condo=hubCondoForUnit(hubUnitKey(u));
  const e=condo && state.hubPois && state.hubPois[condo.id];
  if(!e){ return; }                                            // unhoused (no condo record): stays out
  if(dist(u, e) < entRadius(e)+TILE*1.5){ hubVetSleep(state, u, e); return; }    // close enough: turn in
  const d=nearestFreeAdjTile(state, e, u.x, u.y);
  if(d) _hubRoutineMove(state, u, {tx:(d.x/TILE)|0, ty:(d.y/TILE)|0}, 'sleep');
}
// tuck a veteran into their condo: same storedIn hiding idiom as the M.D.C./trainees
// (skipped by depth pass, minimap and sim; serialized harmlessly; self-heals on load via the wake pass)
function hubVetSleep(state, u, condoEnt){
  resetMotion(u); u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=condoEnt.id; u._hubSleep=1; u.x=condoEnt.x; u.y=condoEnt.y;
  u.selected=false; state.selection=state.selection.filter(e=>e!==u);
}
function hubVetWake(state, u){
  const condoEnt=(state.entities||[]).find(e=>e&&e.id===u.storedIn);
  delete u.storedIn; u._hubSleep=0;
  if(condoEnt){
    const spot=hubMdcExitTile(state, condoEnt, u.id);          // generic "first free tile below the footprint" scan
    if(spot){ u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2; }
  }
  resetMotion(u); u.cmd=null; u.state='idle';
}

/* ---- status strings: ONE source of truth for condo cards / dossiers / roster rows ---- */
function hubVetStatus(u){
  if(!u) return {k:'away'};
  if(u._hubSleep) return {k:'sleeping'};
  if(u.storedIn){
    const b=(typeof G!=='undefined'&&G&&G.entities||[]).find(e=>e&&e.id===u.storedIn);
    const kind=b&&b.hubPoi&&b.hubPoi.kind, poi=b&&b.hubPoi&&b.hubPoi.name;
    if(kind==='training') return {k:'training', poi};
    if(kind==='mentalhealth') return {k:'care', poi};
    if(kind==='mdc') return {k:'staged', poi};
    if(kind==='condo') return {k:'sleeping', poi};
    return {k:'inside', poi:poi||''};
  }
  if(u.cmd && u.cmd.type==='hubpoi' && u.cmd.poi && u.cmd.poi.hubPoi) return {k:'walking', poi:u.cmd.poi.hubPoi.name};
  if(u.cmd && u.cmd._routine) return {k:(u.cmd._goal==='sleep')?'headinghome':'strolling'};
  if(u.cmd) return {k:'busy'};
  return {k:'offduty'};
}
function hubStatusText(st){
  if(!st) return 'Off duty';
  switch(st.k){
    case 'sleeping':    return 'Sleeping'+(st.poi?' — '+st.poi:'');
    case 'training':    return 'In training';
    case 'care':        return 'In care';
    case 'staged':      return 'Enlisted — awaiting dispatch';
    case 'walking':     return 'Walking to '+st.poi;
    case 'strolling':   return 'Out on the town';
    case 'headinghome': return 'Heading home';
    case 'busy':        return 'On the move';
    case 'inside':      return 'Inside '+(st.poi||'a facility');
    case 'away':        return 'Not in the H.U.B.';
    default:            return 'Off duty';
  }
}

/* ---- click-to-locate: condo-card "find them" — camera ease + 3s pulsing beacon.
   Module-local fx (never on G, never serialized); camera is local, so co-op clients
   may locate too. Drawn by drawHubLocatePing (hooked after drawWinObjective). ---- */
let hubLocateFx=null;
function _hubLocateStart(t){
  if(typeof G==='undefined'||!G||!G.hub) return;
  const reduced=(typeof megaReducedMotion==='function')&&megaReducedMotion();
  hubLocateFx=Object.assign({ t:0, phase:'pan', panDur:0.45, ping:3.0,
    fromX:G.camX, fromY:G.camY, fromZ:G.zoom||1, toZ:Math.max(G.zoom||1, 0.9), r:18 }, t);
  if(reduced){                                                  // reduced motion: snap, no ease
    G.zoom=hubLocateFx.toZ;
    G.camX=hubLocateFx.x-(viewW()/G.zoom)/2; G.camY=hubLocateFx.y-(viewH()/G.zoom)/2;
    clampCam(G);
    hubLocateFx.phase='ping';
    if(typeof spawnRing==='function') spawnRing(hubLocateFx.x, hubLocateFx.y, '#7fd6ff');
  }
}
function updateHubLocate(state, dt){
  const fx=hubLocateFx;
  if(!state||!fx) return;
  if(!state.hub){ hubLocateFx=null; return; }
  // live targets: the beacon tracks a walking NPC / veteran
  if(fx.trackNpc && typeof HUBNPC!=='undefined'){ const w=HUBNPC.whereIs(fx.trackNpc); if(w.onMap){ fx.x=w.x; fx.y=w.y; } }
  else if(fx.trackEntId!=null){ const e=(state.entities||[]).find(o=>o&&o.id===fx.trackEntId&&!o.dead); if(e&&!e.storedIn){ fx.x=e.x; fx.y=e.y; } }
  fx.t+=dt;
  if(fx.phase==='pan'){
    const f=Math.min(1, fx.t/fx.panDur), e=1-Math.pow(1-f,3);   // cubic ease-out (the cutscene cam feel)
    state.zoom=fx.fromZ+(fx.toZ-fx.fromZ)*e;
    const vw=viewW()/state.zoom, vh=viewH()/state.zoom;
    state.camX=fx.fromX+((fx.x-vw/2)-fx.fromX)*e;
    state.camY=fx.fromY+((fx.y-vh/2)-fx.fromY)*e;
    clampCam(state);
    if(f>=1){ fx.phase='ping'; fx.t=0; if(typeof spawnRing==='function') spawnRing(fx.x, fx.y, '#7fd6ff'); }
  } else if(fx.t>=fx.ping){ hubLocateFx=null; }
}
function drawHubLocatePing(state, ox, oy){
  const fx=hubLocateFx;
  if(!fx || fx.phase!=='ping' || typeof ctx==='undefined') return;
  const pulse=0.6+0.4*Math.sin(fx.t*5.2);                       // fx.t advances every rAF → pulses even while paused
  const a=Math.min(1, (fx.ping-fx.t)/0.5);                      // fade the last half second
  const x=fx.x+ox, y=fx.y+oy, R=fx.r*1.6;
  ctx.save();
  ctx.globalAlpha=a*(0.30+0.22*pulse); ctx.strokeStyle='#7fd6ff'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.ellipse(x,y,R,R*0.42,0,0,6.28); ctx.stroke();
  ctx.globalAlpha=a*(0.16+0.12*pulse);
  ctx.beginPath(); ctx.ellipse(x,y,R*0.62,R*0.62*0.42,0,0,6.28); ctx.stroke();
  ctx.globalAlpha=a*0.5; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-52-10*pulse); ctx.stroke();
  ctx.globalAlpha=a*0.95; ctx.fillStyle='#7fd6ff'; ctx.font='bold 12px '+GAME_FONT; ctx.textAlign='center';
  if(fx.label) ctx.fillText(fx.label, x, y-58-10*pulse);
  if(fx.sub){ ctx.fillStyle='#9fb6c8'; ctx.font='10px '+GAME_FONT; ctx.fillText(fx.sub, x, y-46-10*pulse); }
  ctx.restore(); ctx.globalAlpha=1;
}
// locate a veteran by roster key: live → track them; inside a building → ring the building;
// not spawned (deployed / fallen) → ring their home condo.
function hubLocateUnit(key){
  if(typeof G==='undefined'||!G||!G.hub) return false;
  const u=(G.entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&hubUnitKey(e)===key);
  const snap=(CAMPAIGN.roster||[]).find(r=>r.key===key);
  let label='Veteran';
  if(u&&u.heroId) label=u.heroId;
  else if(u&&u.lore&&typeof buildDossier==='function') label=buildDossier(u).full;
  else if(snap&&snap.heroId) label=snap.heroId;
  else if(snap&&snap.lore&&typeof buildDossier==='function') label=buildDossier({type:snap.type, lore:snap.lore}).full;
  if(u && !u.storedIn){
    _hubLocateStart({ x:u.x, y:u.y, r:Math.max(18,(typeof unitDrawH==='function'?unitDrawH(u):36)*0.5),
                      label, sub:hubStatusText(hubVetStatus(u)), trackEntId:u.id });
    return true;
  }
  if(u && u.storedIn){
    const b=(G.entities||[]).find(e=>e&&e.id===u.storedIn);
    if(b){ _hubLocateStart({ x:b.x, y:b.y, r:Math.max(40,(b.w||3)*TILE*0.55), label,
                             sub:hubStatusText(hubVetStatus(u)) }); return true; }
  }
  const condo=hubCondoForUnit(key), poi=condo&&G.hubPois&&G.hubPois[condo.id];
  if(poi){ _hubLocateStart({ x:poi.x, y:poi.y, r:(poi.w||3)*TILE*0.55, label, sub:'Resident — away' }); return true; }
  toast(label+' is not in the H.U.B. right now.');
  return false;
}
// locate a living-city NPC by id: walking → tracked ring; inside/sleeping → ring the building.
function hubLocateNpc(id){
  if(typeof G==='undefined'||!G||!G.hub||typeof HUBNPC==='undefined') return false;
  const w=HUBNPC.whereIs(id);
  const d=(typeof buildNpcDossier==='function')?buildNpcDossier(id):null;
  const label=(d&&d.full)||'Resident';
  if(w.onMap){ _hubLocateStart({ x:w.x, y:w.y, r:16, label, sub:w.status, trackNpc:id }); return true; }
  const poi=w.insidePoi && G.hubPois && G.hubPois[w.insidePoi];
  if(poi){ _hubLocateStart({ x:poi.x, y:poi.y, r:(poi.w||3)*TILE*0.55, label, sub:w.status }); return true; }
  toast(label+' — '+w.status);
  return false;
}

/* =====================================================================
   TRAINING GROUNDS — level-cloning between two same-type units.
   A junior + a higher-level mentor (<= HUB.trainMaxGap apart) lock inside the
   facility; after (target - juniorLevel) in-game hours of ACTIVE play (1 hour =
   HUB.trainHourSeconds real seconds) both leave one level above the senior.
   State lives on CAMPAIGN.training so it survives the roster rebuild + save/load;
   the clock ticks in update() for both HUB and missions. Reuses the M.D.C.
   garrison pattern (storedIn + lane positions) for intake/lock/release.
   ===================================================================== */

// The live Training Grounds POI entity on this map (or null).
function hubFindTrainingGrounds(state){
  if(!state) return null;
  if(state.hubPois && state.hubPois.training) return state.hubPois.training;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.kind==='training') || null;
}
// Lane indices (0..trainPairCap*2-1) currently occupied by staged or in-session trainees.
function hubTrainUsedSlots(){
  const t=CAMPAIGN.training, used=new Set();
  for(const s of (t.staged||[])) if(s && s.slot!=null) used.add(s.slot);
  for(const ses of (t.sessions||[])){ if(ses.a&&ses.a.slot!=null) used.add(ses.a.slot); if(ses.b&&ses.b.slot!=null) used.add(ses.b.slot); }
  return used;
}
function hubTrainNextSlot(){
  const used=hubTrainUsedSlots(), cap=HUB.trainPairCap*2;
  for(let i=0;i<cap;i++) if(!used.has(i)) return i;
  return -1;
}
function hubTrainCount(){
  const t=CAMPAIGN.training;
  return (t.staged||[]).length + (t.sessions||[]).length*2;
}
// Map a normalised point on the facility SPRITE (un,vn in 0..1, left→right / top→bottom) to a world
// position. Mirrors drawHubBuildingSpriteVisual's draw rect EXACTLY (overhang / heightScale / sprite
// aspect) so trainee spots track the painted art regardless of how the sprite is scaled.
function hubTrainSpritePos(fac, un, vn){
  const v = (fac && fac.hubSpriteVisual) || {};
  const baseW=(v.w||fac.w)*TILE, baseH=(v.h||fac.h)*TILE;
  let aspect = 0.735;                                          // training_enemy.png fh/fw fallback
  if(typeof buildingSpriteVisual==='function'){
    const spr = buildingSpriteVisual(v.type||'training', v.faction, fac.owner);
    if(spr && spr.fw) aspect = spr.fh/spr.fw;
  }
  const dw = baseW*(v.overhang||1.08), dh = dw*aspect*(v.heightScale||1);
  const baseX = (fac.tx+fac.w/2)*TILE - baseW/2, baseY = (fac.ty+fac.h)*TILE - baseH;
  const dx = baseX + (baseW-dw)/2, dy = baseY + baseH - dh + 2;
  return { x: dx + un*dw, y: dy + vn*dh };
}
// Firing position for a TRAINING pair. The iso lanes run lower-left→upper-right, so on the sprite a
// lane is a line of near-constant s=u+v and "downrange" is d=u-v (calibrated to training_enemy.png:
// 6 lane centres at s≈0.749+lane*0.099). Units stand near the firing end (small d) and shoot to the
// right; the two soldiers (side 0=mentor / 1=junior) are offset ALONG s so they're abreast in-lane.
function hubTrainLanePos(fac, lane, side){
  const s = 0.749 + Math.min(5, Math.max(0, lane))*0.099;     // lane centre (u+v)
  const dFire = 0.08;                                          // downrange firing depth (u-v); near end
  const sl = s + (side ? 0.022 : -0.022);                     // abreast across the lane
  return hubTrainSpritePos(fac, (sl+dFire)/2, (sl-dFire)/2);
}
// Idle/waiting position in the LOBBY — the open floor band BETWEEN the two parallel iso lines the
// sprite defines: the shooting counter (front edge of the lane platform, d=u-v≈-0.14) and the front
// wall top (d≈-0.5). Units sit in that band so they never float onto a wall. The grid runs ALONG the
// band (s=u+v) with two ranks across it (d), kept off both edges with margin for the idle sway.
function hubTrainLobbyPos(fac, idx, total){
  const col=idx%6, row=(idx/6)|0;
  const s  = 0.88 + col*0.085;            // 0.88..1.30 — full lobby width, incl. the down-right floor
  const dd = -0.26 - row*0.12;            // two ranks, between counter (-0.14) and front wall (-0.55)
  return hubTrainSpritePos(fac, (s+dd)/2, (s-dd)/2);
}
// World-space centres of the downrange shooting-range TARGETS — the silhouette panels on the
// facility's upper-right wall. In-session trainees fire laser bolts at these (picked at random per
// shot, see drawHubTrainees). Calibrated to training_enemy.png: same lane s=u+v as the firing
// positions, downrange depth d=u-v≈0.45 lands on the silhouettes (one per lane, 6 total).
function hubTrainTargetPoints(fac){
  const out=[];
  for(let lane=0; lane<6; lane++){
    const s=0.749+lane*0.099, d=0.45;
    out.push(hubTrainSpritePos(fac, (s+d)/2, (s-d)/2));
  }
  return out;
}
// Lock a live unit inside the facility (storedIn, like an M.D.C. garrison). Its exact lane/waiting
// position + animation are resolved every frame by drawHubTrainees from CAMPAIGN.training state;
// _trainPlaced=false makes the first render snap it into place (later target changes glide).
function hubTrainLockUnit(state, u, fac, slot){
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=fac.id; u.trainSlot=slot; u._face=1; u._trainPlaced=false;
  u.x=fac.x; u.y=fac.y;
  u.selected=false;
  if(state && state.selection) state.selection=state.selection.filter(e=>e!==u);
}
// Resolve the live entity for a snapshot (by hubUnitKey), or null.
function hubTrainLiveUnit(state, snap){
  if(!state||!snap) return null;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&hubUnitKey(e)===snap.key) || null;
}
// Live trainee entities currently inside the Training Grounds (render pass + panel animations).
function hubTrainees(state){
  if(!state) return [];
  return (state.entities||[]).filter(e=>e&&!e.dead&&e.kind==='unit'&&e.trainSlot!=null && e.storedIn);
}

// Command-arrival intake: a unit walked into the Training Grounds → garrison it as "staged".
function hubTrainStage(state, u, poi){
  if(!hubCanAct()) return;
  if(!state||!state.hub||!u||u.dead||u.owner!=='player'||u.kind!=='unit') return;
  const fac=poi || hubFindTrainingGrounds(state);
  if(!fac||!fac.hubPoi||fac.hubPoi.kind!=='training') return;
  const bail=(msg)=>{ resetMotion(u); u.cmd=null; u.state='idle'; toast(msg); refreshUI(); };
  // Heroes are full trainees here: a named hero always carries a career (a fixed dossier + a set
  // level), so the combat-vet gate — a proxy for "has a career / can level" — shouldn't exclude one
  // even when its base type isn't a combat vet (e.g. a healer hero). They enter, are commanded, and
  // mentor/junior like any other unit, governed by the same-type + level-gap rules in the validator.
  if(typeof isCombatVet==='function' && !isCombatVet(u) && !u.hero) return bail((DEF[u.type].name||'That unit')+' has no career — only combat veterans train here.');
  if(hubTrainCount() >= HUB.trainPairCap*2) return bail('Training Grounds full ('+(HUB.trainPairCap*2)+' trainees).');
  const slot=hubTrainNextSlot();
  if(slot<0) return bail('No free training lane.');
  const snap=hubSnapUnit(u); snap.slot=slot;
  CAMPAIGN.training.staged.push(snap);
  hubTrainLockUnit(state, u, fac, slot);
  spawnRing(u.x,u.y,'#ffd24a');
  toast((DEF[u.type].name||'Unit')+' (Lv '+(u.stars||0)+') entered the Training Grounds.');
  refreshUI();
}

// Push a snapshot back into the roaming roster (dedupe by key) so it persists like any HUB unit.
function hubTrainToRoster(snap){
  if(!snap) return;
  CAMPAIGN.roster=(CAMPAIGN.roster||[]).filter(r=>r.key!==snap.key);
  const clean=Object.assign({}, snap); delete clean.slot;
  CAMPAIGN.roster.push(clean);
}
// Release a trainee snapshot to a free exit tile (and hand it back to the roaming roster).
function hubTrainReleaseSnap(state, fac, snap){
  hubTrainToRoster(snap);
  const u=hubTrainLiveUnit(state, snap);
  if(!u) return;
  const spot=fac ? hubMdcExitTile(state, fac, (snap.slot||0)+1) : null;
  delete u.storedIn; delete u.trainSlot;
  if(spot){ u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2; }
  else if(fac){ u.x=fac.x; u.y=(fac.ty+fac.h+1)*TILE; }
  resetMotion(u); u.cmd=null; u.state='idle'; u.selected=false;
  spawnRing(u.x,u.y,'#7fd6ff');
}
// Withdraw a staged unit OR cancel a whole session (frees both) — junior keeps its ORIGINAL level.
function hubTrainWithdraw(unitKey){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  if(!G||!G.hub||!unitKey) return false;
  const t=CAMPAIGN.training, fac=hubFindTrainingGrounds(G);
  const si=(t.staged||[]).findIndex(s=>s.key===unitKey);
  if(si>=0){
    const snap=t.staged.splice(si,1)[0];
    hubTrainReleaseSnap(G, fac, snap);
    toast(((DEF[snap.type]&&DEF[snap.type].name)||'Unit')+' left the Training Grounds.');
    refreshUI(); return true;
  }
  const ses=(t.sessions||[]).find(x=>x.a.key===unitKey||x.b.key===unitKey);
  if(ses){
    t.sessions=t.sessions.filter(x=>x!==ses);
    hubTrainReleaseSnap(G, fac, ses.a);
    hubTrainReleaseSnap(G, fac, ses.b);
    toast('Training cancelled — the junior leaves with nothing gained.');
    refreshUI(); return true;
  }
  return false;
}

// Training duration (in-game hours) for a junior/mentor level pair (0 = pointless).
function hubTrainDurationHours(minLvl, maxLvl){
  const target=Math.min((typeof CAREER!=='undefined'?CAREER.maxStars:30), maxLvl+1);
  return Math.max(0, target-minLvl);
}
// Validate a candidate pair (two staged snapshots): {ok, reason?, min, max, target, hours}.
function hubTrainValidatePair(a, b){
  if(!a||!b) return {ok:false, reason:'Pick two trainees inside the facility.'};
  if(a.key===b.key) return {ok:false, reason:'Pick two different units.'};
  if(a.type!==b.type) return {ok:false, reason:'Both units must be the same type.'};
  const sa=a.stars||0, sb=b.stars||0, min=Math.min(sa,sb), max=Math.max(sa,sb);
  if(Math.abs(sa-sb) > HUB.trainMaxGap) return {ok:false, reason:'Too far apart — max '+HUB.trainMaxGap+' levels of difference.'};
  if((CAMPAIGN.training.sessions||[]).length >= HUB.trainPairCap) return {ok:false, reason:'All '+HUB.trainPairCap+' sessions are in use.'};
  const target=Math.min((typeof CAREER!=='undefined'?CAREER.maxStars:30), max+1);
  const hours=Math.max(0, target-min);
  if(hours<=0) return {ok:false, reason:'Both units are already at the level cap.'};
  return {ok:true, min, max, target, hours};
}
// Start a session from two staged units (keys are hubUnitKeys). mentor = higher level.
function hubTrainCreateSession(keyA, keyB){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  const t=CAMPAIGN.training;
  const a=(t.staged||[]).find(s=>s.key===keyA), b=(t.staged||[]).find(s=>s.key===keyB);
  const v=hubTrainValidatePair(a,b);
  if(!v.ok){ toast(v.reason); return false; }
  const mentor=((a.stars||0) >= (b.stars||0)) ? a : b, junior=(mentor===a)?b:a;
  t.staged=t.staged.filter(s=>s!==a && s!==b);
  t.sessions.push({ id:'ts_'+(HUB.nextId++), type:mentor.type, a:mentor, b:junior,
    startMax:v.max, startMin:v.min, target:v.target, hoursTotal:v.hours, secElapsed:0, done:false });
  toast('Training started — both reach Level '+v.target+' in '+v.hours+'h.');
  refreshUI();
  return true;
}

// Bump a snapshot to a level and apply it to the live entity if present.
function hubTrainApplyLevel(state, snap, level){
  const cap=(typeof CAREER!=='undefined')?CAREER.maxStars:30;
  const lvl=Math.max(0, Math.min(cap, level));
  snap.stars=lvl; snap.xp=(typeof CAREER!=='undefined')?CAREER.xpFor(lvl):snap.xp;
  const u=hubTrainLiveUnit(state, snap);
  if(u){ u.stars=lvl; u.xp=snap.xp; if(typeof applyVetHp==='function') applyVetHp(u,true); }
}
// Graduate a finished session in the HUB: both reach target, get released to roam, session removed.
function hubGraduateSession(state, ses){
  const fac=hubFindTrainingGrounds(state);
  hubTrainApplyLevel(state, ses.a, ses.target);
  hubTrainApplyLevel(state, ses.b, ses.target);
  hubTrainReleaseSnap(state, fac, ses.a);
  hubTrainReleaseSnap(state, fac, ses.b);
  CAMPAIGN.training.sessions=(CAMPAIGN.training.sessions||[]).filter(x=>x!==ses);
  const nm=(DEF[ses.type]&&DEF[ses.type].name)||'Recruits';
  toast('🎓 Training complete — two '+nm+' graduate at Level '+ses.target+'.');
}

// Per-tick clock — runs from core.js update() for BOTH the HUB and missions (active play only).
function updateTrainingSessions(dt){
  if(typeof netRole!=='undefined' && netRole==='client') return;     // clients don't simulate campaign state
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN || !CAMPAIGN.training) return;
  const sessions=CAMPAIGN.training.sessions||[];
  if(!sessions.length) return;
  const inHub=(typeof G!=='undefined' && G && G.hub);
  for(const ses of sessions.slice()){
    if(ses.done) continue;
    ses.secElapsed=(ses.secElapsed||0)+dt;
    if(ses.secElapsed >= ses.hoursTotal*HUB.trainHourSeconds){
      ses.done=true;
      // bake the result into the snapshots now so it survives even if finished mid-mission
      hubTrainApplyLevel(inHub?G:null, ses.a, ses.target);
      hubTrainApplyLevel(inHub?G:null, ses.b, ses.target);
      if(inHub) hubGraduateSession(G, ses);                            // live in the HUB → release immediately
      else toast('🎓 A Training Grounds session finished — collect them at the H.U.B.');
    }
  }
}

// Re-materialise trainees when a fresh HUB map is built (after the roaming roster spawns).
// Pending staged/sessions spawn LOCKED at their lanes; finished sessions graduate to roaming.
function hubSpawnTrainees(state){
  if(!state || typeof CAMPAIGN==='undefined' || !CAMPAIGN.training) return;
  const fac=hubFindTrainingGrounds(state);
  if(!fac) return;
  const fillSnap=(u,snap)=>{ u.hubKey=snap.key; u.stars=snap.stars||0; u.xp=snap.xp||0; u.lore=snap.lore||null;
    u.hero=!!snap.hero; u.heroId=snap.heroId||null; u.spriteType=snap.spriteType||null;
    if(typeof hubApplyUpgrades==='function') hubApplyUpgrades(u);
    if(typeof applyVetHp==='function') applyVetHp(u,true); };
  const spawnLocked=(snap)=>{
    if(!snap) return;
    if(hubTrainLiveUnit(state, snap)) return;             // idempotent: entity already restored from a save
    const slot=(snap.slot!=null)?snap.slot:hubTrainNextSlot(); snap.slot=slot;
    const u=mkUnit(state, snap.type, 'player', fac.tx+((fac.w/2)|0), fac.ty+((fac.h*0.6)|0));
    fillSnap(u, snap); hubTrainLockUnit(state, u, fac, slot);
  };
  for(const snap of (CAMPAIGN.training.staged||[])) spawnLocked(snap);
  for(const ses of (CAMPAIGN.training.sessions||[]).slice()){
    if(ses.done){
      hubTrainApplyLevel(state, ses.a, ses.target);
      hubTrainApplyLevel(state, ses.b, ses.target);
      [ses.a, ses.b].forEach(snap=>{ hubTrainToRoster(snap);
        if(hubTrainLiveUnit(state, snap)) return;         // already present (restored save) → don't duplicate
        const u=mkUnit(state, snap.type, 'player', fac.tx+((fac.w/2)|0), fac.ty+fac.h+1);
        fillSnap(u, snap); });
      CAMPAIGN.training.sessions=CAMPAIGN.training.sessions.filter(x=>x!==ses);
      const nm=(DEF[ses.type]&&DEF[ses.type].name)||'Recruits';
      toast('🎓 Training complete — two '+nm+' graduated at Level '+ses.target+'.');
    } else { spawnLocked(ses.a); spawnLocked(ses.b); }
  }
}

/* =====================================================================
   THE WAKE — resurrection tower (Ep XIV payoff). Spend M3$ + a lightning-charged
   build to drag a fallen veteran back as a Reborn Cyborg. Hard-capped lifetime
   total; one soul in the lattice at a time; each fallen resurrectable once.
   Host/solo simulate the spend + timer; clients are cosmetic (panel-only).
   Mirrors the Training Grounds session/clock lifecycle.
   ===================================================================== */
function rebornUnlocked(){ return (CAMPAIGN.nextMapIndex||0) >= (HUB.rebornUnlockIdx||0); }
function rebornPerformed(){ const r=CAMPAIGN.reborn||{sessions:[],done:[]}; return (r.done||[]).length + (r.sessions||[]).length; }
function rebornChargesLeft(){ return Math.max(0, (HUB.rebornTotalCap||0) - rebornPerformed()); }
function rebornLvlOf(f){ return (f && (f.stars!=null?f.stars:f.lvl))||0; }
function rebornCost(f){ return (HUB.rebornBaseCost||0) + (HUB.rebornCostPerStar||0)*rebornLvlOf(f); }
function rebornHours(f){ return (HUB.rebornBaseHours||0) + Math.round((HUB.rebornHoursPerStar||0)*rebornLvlOf(f)); }
function rebornIsDone(f){
  const r=CAMPAIGN.reborn||{sessions:[],done:[]}, fid=(typeof fallenStableId==='function')?fallenStableId(f):'';
  return !!(f&&f.reborn) || (r.done||[]).includes(fid) || (r.sessions||[]).some(s=>s.fid===fid);
}
// roster key for a reborn — MUST match what hubUnitKey() derives for the spawned unit (hero → lore → fallback),
// so condo residency / upgrades / idempotent spawns all line up.
function rebornRosterKey(ses){
  if(ses.heroId) return 'hero:'+ses.heroId;
  if(ses.lore && ses.lore.seed!=null) return 'lore:'+ses.lore.seed;
  return 'reborn:'+ses.fid;
}
// Begin a resurrection (host/solo only). Returns true on success; toasts the reason on every rejection.
function hubWakeStart(fid){
  if(!hubCanAct()){ toast('Only the host can power The Wake.'); return false; }
  if(!CAMPAIGN.reborn) CAMPAIGN.reborn={sessions:[],done:[]};
  if(!rebornUnlocked()){ toast('The coils are cold — you don’t hold the lattice yet.'); return false; }
  const f=(typeof fallenVets!=='undefined'?fallenVets:[]).find(x=>fallenStableId(x)===fid);
  if(!f){ toast('No such name on the wall.'); return false; }
  if(!DEF[f.type]){ toast('That body is too corrupted to rebuild.'); return false; }
  if(rebornIsDone(f)){ toast('Already reborn — The Wake takes a soul only once.'); return false; }
  if((CAMPAIGN.reborn.sessions||[]).length >= (HUB.rebornSlotCap||1)){ toast('The Wake holds one soul at a time.'); return false; }
  if(rebornChargesLeft() <= 0){ toast('No charges remain — the rest stay on the wall.'); return false; }
  const cost=rebornCost(f);
  if(!hubSpend(cost)) return false;   // host-gated + balance-checked; toasts on failure
  CAMPAIGN.reborn.sessions.push({ id:'rb_'+(HUB.nextId++), fid, type:f.type, stars:rebornLvlOf(f),
    lore:(typeof fallenDossierSnap==='function')?fallenDossierSnap(f):(f.lore||null),
    heroId:f.heroId||null, spriteType:f.spriteType||null, name:f.name||'A veteran',
    sanityThreshold:f.sanityThreshold||0, xp:f.xp||0, dreamDone:!!f.dreamDone,   // dreamDone → the Reborn reaction line (story-polish §7.2)
    hoursTotal:rebornHours(f), secElapsed:0, done:false, cost });
  f.reborn=true;   // dim the wall immediately + prevent a double-enqueue across a save
  if(typeof eventToast==='function') eventToast('⚡ <b>'+(f.name||'A veteran')+'</b> is fed into The Wake. The lightning takes them.', 9000);
  refreshUI();
  return true;
}
// Per-tick clock — runs from core.js update() in the HUB and missions (active play only).
function updateRebornProduction(dt){
  if(typeof netRole!=='undefined' && netRole==='client') return;   // clients don't simulate campaign state
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN || !CAMPAIGN.reborn) return;
  const sessions=CAMPAIGN.reborn.sessions||[];
  if(!sessions.length) return;
  const inHub=(typeof G!=='undefined' && G && G.hub);
  for(const ses of sessions.slice()){
    if(ses.done) continue;
    ses.secElapsed=(ses.secElapsed||0)+dt;
    if(ses.secElapsed >= ses.hoursTotal*(HUB.rebornHourSeconds||3600)){
      ses.done=true;
      hubWakeComplete(inHub?G:null, ses);
    }
  }
}
// A hero's reaction to WHO was just written back (story-polish §7.2), keyed by dream status. Text only
// (heroes aren't always live in the hub). Returns a "Hero: line" string or null.
function rebornChoiceLine(ses){
  if(typeof REBORN_CHOICE_LINES==='undefined') return null;
  const k = (ses && ses.dreamDone===true) ? 'dreamFulfilled' : (ses && ses.dreamDone===false ? 'dreamUnfulfilled' : 'any');
  let pool = (Math.random()<0.6 && REBORN_CHOICE_LINES[k] && REBORN_CHOICE_LINES[k].length) ? REBORN_CHOICE_LINES[k] : REBORN_CHOICE_LINES.any;
  if(!pool || !pool.length) pool = REBORN_CHOICE_LINES.any;
  return (pool && pool.length) ? pool[(Math.random()*pool.length)|0] : null;
}
// A write finishes: permanent record, add the Reborn to the roster, spawn it live if we're in the HUB.
function hubWakeComplete(state, ses){
  if(!CAMPAIGN.reborn) CAMPAIGN.reborn={sessions:[],done:[]};
  if(typeof ACH!=='undefined') ACH.fire('reborn');   // T3-5: Ghost Equity
  if(!(CAMPAIGN.reborn.done||[]).includes(ses.fid)) CAMPAIGN.reborn.done.push(ses.fid);
  const key=rebornRosterKey(ses);
  CAMPAIGN.roster=(CAMPAIGN.roster||[]).filter(r=>r.key!==key);   // idempotent
  CAMPAIGN.roster.push({ key, type:ses.type, stars:ses.stars||0,
    xp:(ses.xp!=null?ses.xp:((typeof CAREER!=='undefined')?CAREER.xpFor(ses.stars||0):0)),
    lore:ses.lore||null, hero:!!ses.heroId, heroId:ses.heroId||null, spriteType:ses.spriteType||null,
    madosis:0, sanityThreshold:ses.sanityThreshold||0, scarred:true, reborn:true });   // scarred → frayed mind, breaks sooner
  const cids=Object.keys(CAMPAIGN.condos||{});
  if(cids.length){ const c=CAMPAIGN.condos[cids[0]]; c.residents=c.residents||[]; if(!c.residents.includes(key)) c.residents.push(key); }
  CAMPAIGN.reborn.sessions=(CAMPAIGN.reborn.sessions||[]).filter(x=>x!==ses);
  if(state && state.hub) hubSpawnReborn(state, key);
  if(typeof toast==='function') toast('⚡ '+(ses.name||'A veteran')+' rises from The Wake — a Reborn Cyborg. Nothing came back whole.');
  // story-polish §7.2: a hero names the cost of the choice (text; heroes aren't always live in the hub)
  const choice = rebornChoiceLine(ses);
  if(choice && typeof toast==='function') setTimeout(()=>{ try{ toast(choice, 7000); }catch(e){} }, 1300);
  // the Reborn speaks its first haunted line, if it spawned live in the hub
  if(state && state.hub && typeof pushDialog==='function' && typeof SELECT_LINES_REBORN!=='undefined' && SELECT_LINES_REBORN.length){
    const u=(state.entities||[]).find(e=>e&&!e.dead&&e.kind==='unit'&&e.owner==='player'&&typeof hubUnitKey==='function'&&hubUnitKey(e)===key);
    if(u) setTimeout(()=>{ try{ if(!u.dead) pushDialog(u, SELECT_LINES_REBORN[(Math.random()*SELECT_LINES_REBORN.length)|0], { type:'lore', tone:'neutral' }); }catch(e){} }, 2200);
  }
}
// Spawn one Reborn roster member as a live unit near The Wake (in-HUB live completion). Idempotent by key.
function hubSpawnReborn(state, key){
  if(!state || !state.hub) return;
  const r=(CAMPAIGN.roster||[]).find(x=>x.key===key); if(!r) return;
  if((state.entities||[]).some(e=>e&&!e.dead&&e.kind==='unit'&&e.owner==='player'&&hubUnitKey(e)===key)) return;   // already live
  const poi=(state.hubPois&&state.hubPois['wake'])||null;
  const px=poi?poi.tx+((poi.w/2)|0):((state.cfg&&state.cfg.player)?state.cfg.player.x:10);
  const py=poi?poi.ty+poi.h+1:((state.cfg&&state.cfg.player)?state.cfg.player.y:10);
  const u=mkUnit(state, r.type, 'player', px, py);
  u.hubKey=r.key; u.stars=r.stars||0; u.xp=r.xp||0; u.lore=r.lore||null;
  u.hero=!!r.hero; u.heroId=r.heroId||null; u.spriteType=r.spriteType||null;
  u.madosis=r.madosis||0; u.sanityThreshold=r.sanityThreshold||0; u.scarred=!!r.scarred; u.reborn=!!r.reborn;
  if(typeof hubApplyUpgrades==='function') hubApplyUpgrades(u);
  if(typeof applyVetHp==='function') applyVetHp(u,true);
  if(typeof spawnRing==='function' && poi) spawnRing(poi.x, poi.y, '#7dff9e');
}

/* =====================================================================
   MENTAL HEALTH FACILITY — madosis healing. A unit walks in; the player pays
   up-front to enroll it; it spends ONE mission-dispatch occupied inside, and on
   return is released FULLY recovered (madosis 0). Single-unit (no pairing); timed
   by mission visits, not a real clock. For an instant cure without spending a
   mission, the player can instead pay merits to accelerate (hubHealSpeedUp, also to 0).
   Reuses the Training-Grounds garrison / lock / respawn machinery.
   ===================================================================== */
function hubFindMentalHealth(state){
  if(!state) return null;
  if(state.hubPois && state.hubPois.mentalhealth) return state.hubPois.mentalhealth;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.hubPoi&&e.hubPoi.kind==='mentalhealth') || null;
}
function hubHealUsedSlots(){
  const h=CAMPAIGN.healing||{staged:[],sessions:[]}, used=new Set();
  for(const s of (h.staged||[])) if(s && s.slot!=null) used.add(s.slot);
  for(const ses of (h.sessions||[])) if(ses.unit && ses.unit.slot!=null) used.add(ses.unit.slot);
  return used;
}
function hubHealNextSlot(){
  const used=hubHealUsedSlots(), cap=(MADOSIS.healCap||6);
  for(let i=0;i<cap;i++) if(!used.has(i)) return i;
  return -1;
}
function hubHealCount(){ const h=CAMPAIGN.healing||{staged:[],sessions:[]}; return (h.staged||[]).length + (h.sessions||[]).length; }
function hubHealLiveUnit(state, snap){
  if(!state||!snap) return null;
  return (state.entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&hubUnitKey(e)===snap.key) || null;
}
function hubHealLockUnit(state, u, fac, slot){
  resetMotion(u);
  u.cmd=null; u.state='idle'; u.vx=0; u.vy=0; u.sprinting=false;
  u.storedIn=fac.id; u.healSlot=slot; u._face=1;
  u.x=fac.x; u.y=fac.y; u.selected=false;
  if(state && state.selection) state.selection=state.selection.filter(e=>e!==u);
}
function hubHealCost(snap){ return Math.round(MADOSIS.heal.baseCost + MADOSIS.heal.costPerStar*((snap&&snap.stars)||0)); }
// Command-arrival intake: a unit walked into the facility → garrison it as "awaiting treatment".
function hubHealStage(state, u, poi){
  if(!hubCanAct()) return;
  if(!state||!state.hub||!u||u.dead||u.owner!=='player'||u.kind!=='unit') return;
  const fac=poi || hubFindMentalHealth(state);
  if(!fac||!fac.hubPoi||fac.hubPoi.kind!=='mentalhealth') return;
  const bail=(msg)=>{ resetMotion(u); u.cmd=null; u.state='idle'; toast(msg); refreshUI(); };
  if(!(u.sanityThreshold>0)) return bail((DEF[u.type].name||'That unit')+' has no madosis to treat.');
  if(!(u.madosis>0)) return bail((DEF[u.type].name||'That unit')+' is steady — nothing to treat.');
  if(hubHealCount() >= (MADOSIS.healCap||6)) return bail('Mental Health Facility full ('+(MADOSIS.healCap||6)+').');
  const slot=hubHealNextSlot();
  if(slot<0) return bail('No free treatment slot.');
  const snap=hubSnapUnit(u); snap.slot=slot;
  CAMPAIGN.healing.staged.push(snap);
  hubHealLockUnit(state, u, fac, slot);
  spawnRing(u.x,u.y,'#7fffd0');
  toast((DEF[u.type].name||'Unit')+' entered the Mental Health Facility.');
  refreshUI();
}
// Enroll a staged unit: pay up-front; it occupies one mission, then recovers `heal` madosis.
function hubHealStartSession(key){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  const h=CAMPAIGN.healing;
  const snap=(h.staged||[]).find(s=>s.key===key);
  if(!snap){ toast('Unit not in the facility.'); return false; }
  if(!(snap.madosis>0)){ toast('Nothing to treat.'); return false; }
  const cost=hubHealCost(snap);
  if(!hubSpend(cost)) return false;   // hubSpend toasts if M3$ is short
  const heal=snap.madosis;   // FULL cure — a completed treatment brings the unit's madosis to exactly 0
  h.staged=h.staged.filter(s=>s!==snap);
  h.sessions.push({ id:'hs_'+(HUB.nextId++), unit:snap, startMadosis:snap.madosis, heal, startVisit:CAMPAIGN.visit, slot:snap.slot });
  toast('🧠 Treatment started — fully clears '+Math.round(heal)+' madosis after the next mission.');
  refreshUI();
  return true;
}
function hubHealToRoster(snap){
  if(!snap) return;
  CAMPAIGN.roster=(CAMPAIGN.roster||[]).filter(r=>r.key!==snap.key);
  const clean=Object.assign({}, snap); delete clean.slot;
  CAMPAIGN.roster.push(clean);
}
function hubHealReleaseSnap(state, fac, snap){
  hubHealToRoster(snap);
  const u=hubHealLiveUnit(state, snap);
  if(!u) return;
  const spot=fac ? hubMdcExitTile(state, fac, (snap.slot||0)+1) : null;
  delete u.storedIn; delete u.healSlot;
  if(spot){ u.x=spot.tx*TILE+TILE/2; u.y=spot.ty*TILE+TILE/2; }
  else if(fac){ u.x=fac.x; u.y=(fac.ty+fac.h+1)*TILE; }
  resetMotion(u); u.cmd=null; u.state='idle'; u.selected=false;
  spawnRing(u.x,u.y,'#7fffd0');
}
// Apply the recovery to the snapshot (+ live unit if present). Monotonic: never RAISE madosis, so any
// merit-paid accelerated recovery that already drained it (hubHealSpeedUp) is preserved when a mission
// session completes. Legacy/un-accelerated case: snap.madosis === start, so this still yields start-heal.
function hubHealApply(state, ses){
  const snap=ses.unit, start=(ses.startMadosis!=null)?ses.startMadosis:(snap.madosis||0);
  const healed=Math.max(0, start - (ses.heal||0));
  snap.madosis=Math.min((snap.madosis!=null?snap.madosis:start), healed);
  const u=hubHealLiveUnit(state, snap); if(u) u.madosis=snap.madosis;
}
// Withdraw a staged unit OR cancel an in-care session — released un-healed, no refund.
function hubHealCancel(key){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  if(!G||!G.hub||!key) return false;
  const h=CAMPAIGN.healing, fac=hubFindMentalHealth(G);
  const si=(h.staged||[]).findIndex(s=>s.key===key);
  if(si>=0){
    const snap=h.staged.splice(si,1)[0];
    hubHealReleaseSnap(G, fac, snap);
    toast(((DEF[snap.type]&&DEF[snap.type].name)||'Unit')+' left the facility.');
    refreshUI(); return true;
  }
  const ses=(h.sessions||[]).find(x=>x.unit && x.unit.key===key);
  if(ses){
    h.sessions=h.sessions.filter(x=>x!==ses);
    hubHealReleaseSnap(G, fac, ses.unit);
    toast('Treatment cancelled — no recovery, no refund.');
    refreshUI(); return true;
  }
  return false;
}
/* ---- Accelerated treatment — pay M3$ to recover madosis on the HUB CITY clock (no mission needed) ----
   A unit garrisoned in the facility (awaiting treatment OR mid mission-session) can have merits spent
   to recover madosis in IN-GAME HUB time: MADOSIS.accel.points madosis over MADOSIS.accel.minutes
   CITY minutes per MADOSIS.accel.merits M3$. "In-game minute" = the 🕘 HUB time-of-day clock, which
   FLIES (a city day ≈ 420 real sec), so a chunk recovers in ~3 real sec — NOT 10 real minutes (that
   wall-clock pacing made it useless). The clock only advances in the HUB, so recovery progresses while
   the player is in the H.U.B. and pauses on missions. Each purchase queues one chunk onto the snapshot
   (accelQueue = madosis points still owed to drain, accelUsed = was ever bought); updateMentalHealthAccel
   drains it continuously. State rides the healing snapshot, part of CAMPAIGN (cloned wholesale on save)
   — missing on legacy saves → falsy → no acceleration (correct). Host/solo gate the spend (hubCanAct)
   and the drain (netRole!=='client'); clients are panel-cosmetic. */

// recovered-madosis points per REAL second, paced to the HUB CITY clock (the 🕘 time-of-day the player
// reads), NOT wall-clock. A city day is short (hub_npcs.js DAY≈420 real sec = 24 city-hours), so a city
// minute ≈ 0.29 real sec and "10 in-game minutes" is ≈3 real sec — fast, as a paid accelerator should be
// (the merit COST is the balance gate, not the wait). dayReal is read live from HUBNPC.clock() so it
// tracks the actual clock if the day length ever changes (frac=C/dayReal ⇒ dayReal=C/frac, exact for C>0).
function madAccelPtsPerSec(){
  const A=(typeof MADOSIS!=='undefined' && MADOSIS.accel)||null; if(!A) return 0;
  const mins=(A.minutes||10); if(!(mins>0)) return 0;
  let dayReal=420;   // real seconds per city day — hub_npcs.js DAY fallback
  if(typeof HUBNPC!=='undefined' && HUBNPC.clock){ const c=HUBNPC.clock(); if(c && c.frac>0 && c.C>0) dayReal=c.C/c.frac; }
  const cityMinPerRealSec = 1440/dayReal;             // in-game (city) minutes elapsed per real second
  return (A.points||10) * cityMinPerRealSec / mins;   // pts/real-sec → drains `points` over `minutes` CITY minutes
}
// find a garrisoned healing snapshot by hubUnitKey (staged OR in a mission session), or null.
function hubHealFindSnap(key){
  const h=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.healing)||null; if(!h||!key) return null;
  const st=(h.staged||[]).find(s=>s&&s.key===key); if(st) return st;
  const ses=(h.sessions||[]).find(x=>x.unit&&x.unit.key===key); return ses?ses.unit:null;
}
// madosis still treatable by acceleration on a snapshot = current madosis NOT already queued to drain.
function hubHealAccelTreatable(snap){
  if(!snap) return 0;
  return Math.max(0, Math.round(snap.madosis||0) - Math.round(snap.accelQueue||0));
}
// M3$ to queue `chunk` points (rate = merits per `points`, so a partial last chunk is charged fairly).
function hubHealAccelCost(chunk){
  const A=(typeof MADOSIS!=='undefined' && MADOSIS.accel)||{merits:100,points:10};
  return Math.max(0, Math.round((chunk||0)*(A.merits||100)/(A.points||10)));
}
// Buy one acceleration chunk for a garrisoned unit: pay M3$, queue up to `points` madosis to drain.
function hubHealSpeedUp(key){
  if(!hubCanAct()){ toast('Only the host can operate the H.U.B.'); return false; }
  const A=(typeof MADOSIS!=='undefined' && MADOSIS.accel)||null;
  if(!A){ toast('Accelerated treatment is unavailable.'); return false; }
  const snap=hubHealFindSnap(key);
  if(!snap){ toast('Unit not in the facility.'); return false; }
  const treatable=hubHealAccelTreatable(snap);
  if(treatable<=0){ toast((snap.accelQueue>0)?'Already recovering — let it finish.':'Nothing left to treat.'); return false; }
  const chunk=Math.min(A.points||10, treatable);
  if(!hubSpend(hubHealAccelCost(chunk))) return false;   // host-gated + balance-checked; toasts when M3$ is short
  snap.accelQueue=(snap.accelQueue||0)+chunk;
  snap.accelUsed=true;
  const nm=(typeof trainUnitName==='function')?trainUnitName(snap):((DEF[snap.type]&&DEF[snap.type].name)||'Unit');
  toast('⚡ '+nm+' — accelerated treatment: recovering '+chunk+' madosis over '+(A.minutes||10)+' in-game min.');
  refreshUI();
  return true;
}
// Per-tick accelerated-recovery clock — drains queued madosis on facility-garrisoned units at the
// city-clock rate. HUB ONLY: in-game HUB time (the 🕘 clock) only advances in the H.U.B., so recovery
// progresses while the player is here and pauses on missions (queue persists, resumes on return).
// Host/solo simulate; clients skip (they never operate the H.U.B.). dt is real seconds; `rate` already
// converts real→city time, and the city clock tracks real time 1:1 in the HUB, so rate*dt is correct.
function updateMentalHealthAccel(dt){
  if(typeof netRole!=='undefined' && netRole==='client') return;   // clients don't simulate campaign state
  if(!(typeof G!=='undefined' && G && G.hub)) return;              // in-game HUB time only flows in the H.U.B.
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN || !CAMPAIGN.healing) return;
  const rate=madAccelPtsPerSec(); if(!(rate>0)) return;
  const h=CAMPAIGN.healing;
  // Continuous drain: lower madosis and the points-owed queue in lockstep at `rate` pts/sec. Converges
  // cleanly to fully-recovered from either side (madosis is a float — hero accrual / mutators) so a unit
  // always lands on exactly 0 and can auto-release; a partial purchase just lowers madosis and stops.
  const drain=(snap)=>{
    if(!snap || !(snap.accelQueue>0)) return;
    const step=Math.min(rate*dt, snap.accelQueue, Math.max(0, snap.madosis||0));
    if(step>0){
      snap.madosis=Math.max(0, (snap.madosis||0)-step);
      snap.accelQueue=snap.accelQueue-step;
      const u=hubHealLiveUnit(G, snap); if(u) u.madosis=snap.madosis;
    }
    if((snap.madosis||0)<=1e-6){ snap.madosis=0; snap.accelQueue=0; }            // nothing left to recover
    else if(snap.accelQueue<=1e-6){ snap.accelQueue=0; if((snap.madosis||0)<1) snap.madosis=0; }  // queue spent (snap sub-point residue)
  };
  for(const s of (h.staged||[])) drain(s);
  for(const ses of (h.sessions||[])) drain(ses.unit);
  // Release any unit accelerated to full recovery (the facility + live entity exist here in the HUB).
  // accelUsed gates it to units recovered by acceleration; staged intake already requires madosis>0,
  // so madosis 0 here means acceleration did it.
  const fac=hubFindMentalHealth(G);
  let changed=false;
  const releaseDone=(snap, fromSessions)=>{
    if(!snap || !snap.accelUsed || (snap.madosis||0)>0 || (snap.accelQueue||0)>0) return;
    if(fromSessions) h.sessions=(h.sessions||[]).filter(x=>x.unit!==snap);
    else h.staged=(h.staged||[]).filter(x=>x!==snap);
    hubHealReleaseSnap(G, fac, snap);
    changed=true;
    if(!window._rbReplaying){
      const nm=(typeof trainUnitName==='function')?trainUnitName(snap):((DEF[snap.type]&&DEF[snap.type].name)||'Unit');
      toast('💜 '+nm+' completed accelerated treatment — fully recovered.');
    }
  };
  for(const s of (h.staged||[]).slice()) releaseDone(s, false);
  for(const ses of (h.sessions||[]).slice()) releaseDone(ses.unit, true);
  if(changed && typeof refreshUI==='function') refreshUI();
}

// Re-materialise facility occupants when a fresh HUB map is built (after the roster spawns).
// A session whose mission cycle elapsed (CAMPAIGN.visit advanced past startVisit) COMPLETES: the unit
// is healed and released to roam. Otherwise occupants spawn LOCKED inside, still in care.
function hubSpawnHealers(state){
  if(!state || typeof CAMPAIGN==='undefined' || !CAMPAIGN.healing) return;
  const fac=hubFindMentalHealth(state);
  if(!fac) return;
  const fillSnap=(u,snap)=>{ u.hubKey=snap.key; u.stars=snap.stars||0; u.xp=snap.xp||0; u.lore=snap.lore||null;
    u.hero=!!snap.hero; u.heroId=snap.heroId||null; u.spriteType=snap.spriteType||null;
    u.madosis=snap.madosis||0; u.sanityThreshold=snap.sanityThreshold||0; u.scarred=!!snap.scarred;
    if(typeof hubApplyUpgrades==='function') hubApplyUpgrades(u);
    if(typeof applyVetHp==='function') applyVetHp(u,true); };
  const spawnLocked=(snap)=>{
    if(!snap) return;
    if(hubHealLiveUnit(state, snap)) return;            // idempotent: entity already restored from a save
    const slot=(snap.slot!=null)?snap.slot:hubHealNextSlot(); snap.slot=slot;
    const u=mkUnit(state, snap.type, 'player', fac.tx+((fac.w/2)|0), fac.ty+((fac.h*0.6)|0));
    fillSnap(u, snap); hubHealLockUnit(state, u, fac, slot);
  };
  for(const snap of (CAMPAIGN.healing.staged||[])) spawnLocked(snap);
  for(const ses of (CAMPAIGN.healing.sessions||[]).slice()){
    if(CAMPAIGN.visit > (ses.startVisit||0)){            // a mission has passed → treatment complete
      hubHealApply(state, ses);
      const snap=ses.unit; hubHealToRoster(snap);
      CAMPAIGN.healing.sessions=CAMPAIGN.healing.sessions.filter(x=>x!==ses);
      if(!hubHealLiveUnit(state, snap)){
        const u=mkUnit(state, snap.type, 'player', fac.tx+((fac.w/2)|0), fac.ty+fac.h+1);
        fillSnap(u, snap);
      }
      const nm=(typeof trainUnitName==='function')?trainUnitName(snap):((DEF[snap.type]&&DEF[snap.type].name)||'Unit');
      toast('🧠 '+nm+' completed treatment — madosis down to '+(snap.madosis|0)+'.');
    } else {
      spawnLocked(ses.unit);
    }
  }
}

function drawHubOverlays(state){
  if(!state||!state.hub) return;
  const w=HUB.wasteland;
  ctx.save();
  ctx.fillStyle='rgba(80,255,120,0.022)';
  ctx.strokeStyle='rgba(110,255,120,0.18)'; ctx.lineWidth=2;
  ctx.beginPath();
  for(let y=w.y0;y<=w.y1;y++) for(let x=w.x0;x<=w.x1;x++){
    if(!hubInWasteland(x,y)) continue;
    ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
    if(!hubInWasteland(x-1,y)){ ctx.moveTo(x*TILE,y*TILE); ctx.lineTo(x*TILE,(y+1)*TILE); }
    if(!hubInWasteland(x+1,y)){ ctx.moveTo((x+1)*TILE,y*TILE); ctx.lineTo((x+1)*TILE,(y+1)*TILE); }
    if(!hubInWasteland(x,y-1)){ ctx.moveTo(x*TILE,y*TILE); ctx.lineTo((x+1)*TILE,y*TILE); }
    if(!hubInWasteland(x,y+1)){ ctx.moveTo(x*TILE,(y+1)*TILE); ctx.lineTo((x+1)*TILE,(y+1)*TILE); }
  }
  ctx.stroke();
  ctx.restore();
  drawWakeMemorial(state);
}
// T1-7: the fallen's names hover faintly beside The Wake tower — every hub visit walks past the
// dead (and reads what the resurrection economy is FOR). Newest first, capped; pure cosmetic.
function drawWakeMemorial(state){
  const wake=state.hubPois && state.hubPois.wake;
  if(!wake || typeof fallenVets==='undefined' || !fallenVets.length) return;
  const cx=((wake.tx||0)+(wake.w||2)/2)*TILE, topY=(wake.ty||0)*TILE;
  const t=state.time||0, N=Math.min(8, fallenVets.length);
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#9fb6c8';
  ctx.font='600 10px '+GAME_FONT;
  ctx.globalAlpha=0.85;
  ctx.fillText('THE WAKE — '+fallenVets.length+' name'+(fallenVets.length===1?'':'s'), cx, topY-12-N*13);
  for(let i=0;i<N;i++){
    const f=fallenVets[fallenVets.length-1-i];   // newest first, rising up the tower
    const fl=0.55+0.18*Math.sin(t*1.2+i*1.9);    // candle-flicker, slow
    ctx.globalAlpha=fl*(1-i*0.07);
    ctx.fillStyle = f.dreamDone ? '#ffd86b' : '#c9d8e6';
    ctx.font='10px '+GAME_FONT;
    ctx.fillText('🕯 '+f.name, cx, topY-i*13);
  }
  ctx.restore(); ctx.globalAlpha=1;
}
function hubCameraInWasteland(state){
  if(!state||!state.hub) return false;
  const z=state.zoom||1, cx=(state.camX+viewW()/z/2)/TILE, cy=(state.camY+viewH()/z/2)/TILE;
  return hubInWasteland(cx,cy);
}
