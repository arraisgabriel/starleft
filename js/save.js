/* save.js — browser-localStorage save/load. Snapshots the whole live state G to
   JSON (typed arrays -> arrays, entity cross-refs -> {$ref:id}) and restores it.
   Multiple manual slots (capped, FIFO) + one periodic autosave slot. Public
   entry points: saveGame / autosaveGame / loadGame / openLoadMenu (called from
   the HUD button, ⌘/Ctrl+S, the main loop, and the "Load Game" menu button). */
const SAVE_VERSION = 2;   // v2: madosis fields persist; older (v<2 / null) saves are back-filled on load
const SAVE_PREFIX  = 'starleft_save_';
const AUTO_KEY     = SAVE_PREFIX + 'auto';
const MANUAL_CAP   = 8;             // newest 8 manual saves kept; oldest evicted

function isSaveBlob(d){ return !!(d && typeof d==='object' && Array.isArray(d.entities)); }
function saveVersionOk(d){ return d.v==null || d.v<=SAVE_VERSION; }
function saveMapIndex(d){
  const idx=d && Number.isFinite(+d.mapIndex) ? (+d.mapIndex|0) : 0;
  return Math.max(0, Math.min(idx, MAPS.length-1));
}
function saveIsHubMap(d){
  if(!d || typeof d!=='object') return false;
  return !!(d.hubMap || d.hub || (d.cfg && d.cfg.hub) || (Array.isArray(d.entities) && d.entities.some(e=>e && e.hubPoi)));
}
function hubSaveCfg(){
  const p=(typeof HUB!=='undefined' && HUB.player) ? HUB.player : {x:60,y:58}; 
  return {name:'H.U.B. — Hurban Ultra Buildings', enemyName:'', objective:'Spend m3rit$ in upgrades, send units to a red M.D.C., then launch the next mission there.', hub:true, player:{x:p.x,y:p.y}};
}
function finitePositive(v, fallback){
  v=+v; return Number.isFinite(v) && v>0 ? (v|0) : fallback;
}
function legacyArray(src, n, fill){
  const out = Array.isArray(src) ? src.slice(0,n) : [];
  while(out.length<n) out.push(fill);
  return out;
}
function legacyU8(src, n){
  const out = new Uint8Array(n);
  if(src && typeof src.length==='number') out.set(Uint8Array.from(src).slice(0,n));
  return out;
}

/* ---------- entity cross-reference (de)serialization ----------
   Within an entity's fields the only objects that carry a numeric `id` are
   references to OTHER entities (cmd.target, cmd.mine, cmd.building, autoTarget,
   _healTarget, _reTarget, …). Replace those with {$ref:id} on save and re-link
   them after every entity exists on load — this is field-agnostic, so new
   transient ref fields keep working without touching this code. */
function encodeRefs(val){
  if(!val || typeof val!=='object') return val;
  if(Array.isArray(val)) return val.map(encodeRefs);
  if(typeof val.id==='number') return {$ref: val.id};      // an entity reference
  const o={}; for(const k in val) o[k]=encodeRefs(val[k]); return o;
}
function resolveRefs(val, byId){
  if(!val || typeof val!=='object') return val;
  if(Array.isArray(val)){ for(let i=0;i<val.length;i++) val[i]=resolveRefs(val[i],byId); return val; }
  if(typeof val.$ref==='number') return byId.get(val.$ref) || null;
  for(const k in val) val[k]=resolveRefs(val[k],byId);
  return val;
}
function serializeEntity(e){
  // _groups is a per-unit Set of control-group tags. Sets don't survive JSON (they become {}),
  // and it's fully derivable from `groups`, so skip it here and rebuild it on load.
  const o={}; for(const k in e){ if(k==='_groups') continue; o[k]=encodeRefs(e[k]); } return o;
}

/* ---------- whole-state snapshot ---------- */
// Skip: cfg (re-derived from MAPS), visible (recomputed by computeFog each frame),
// _cmdSig/placing (transient UI), and the fields handled specially below.
// feat[] is the per-cell topography mask — rebuilt from features[] on load (keeps saves small).
// waterDepth: a renderer-only distance-to-shore field (js/water.js), rebuilt from tiles[] on load.
const SKIP = {cfg:1, visible:1, _cmdSig:1, placing:1, sprint:1, entities:1, selection:1, groups:1, blocked:1, explored:1, feat:1, waterDepth:1, hubPois:1};
function serializeGame(){
  const s={};
  for(const k in G){ if(!SKIP[k]) s[k]=G[k]; }       // primitives + JSON-safe arrays (tiles/biome/megaSprites)
  // variant is per-tile texture jitter used only by the renderer — 3 decimals is
  // visually lossless and ~4x smaller than full float precision (keeps saves small).
  s.variant  = G.variant.map(v=>Math.round(v*1000)/1000);
  s.blocked  = Array.from(G.blocked);
  s.explored = Array.from(G.explored);
  s.entities = G.entities.map(serializeEntity);
  s.selection = G.selection.map(e=>e.id);
  s.groups = {}; for(const k in G.groups) s.groups[k]=G.groups[k].map(e=>e.id);
  // metadata (top-level; not part of G)
  s.v=SAVE_VERSION; s.mapIndex=mapIndex; s.savedAt=Date.now();
  s.mapName=G.cfg.name; s.gameTime=G.time;
  s.hubMap=!!G.hub;
  if(typeof serializeHubCampaign==='function') s.campaign=serializeHubCampaign();
  return s;
}
function deserializeGame(s){
  const g={};
  const META={v:1, mapIndex:1, savedAt:1, mapName:1, gameTime:1, hubMap:1, campaign:1, fallen:1};
  const idx=saveMapIndex(s), isHub=saveIsHubMap(s);
  const legacyMadosis = !(s.v>=2);   // pre-madosis save (v<2 / null) → back-fill an approximation on first load
  for(const k in s){ if(!SKIP[k] && !META[k]) g[k]=s[k]; }
  if(typeof deserializeHubCampaign==='function') deserializeHubCampaign(s.campaign);
  g.hub = isHub;
  g.cfg = isHub ? hubSaveCfg() : scaleCfg(MAPS[idx]);   // match the scaled cfg newMap() produces
  g.W = finitePositive(g.W, g.cfg.w || (typeof HUB!=='undefined' ? HUB.W : 96));
  g.H = finitePositive(g.H, g.cfg.h || (typeof HUB!=='undefined' ? HUB.H : 80));
  const cells = g.W*g.H, hadBlocked=!!(s.blocked && typeof s.blocked.length==='number');
  g.tiles = legacyArray(g.tiles, cells, T_GRASS);
  g.biome = legacyArray(g.biome, cells, B_GRASS);
  g.variant = legacyArray(g.variant, cells, 0.5);
  g.features = Array.isArray(g.features) ? g.features : [];
  g.megaSprites = Array.isArray(g.megaSprites) ? g.megaSprites : [];
  // legacy saves (pre-co-op) carried flat gold/supply/supplyCap/gold_collected — fold them into the
  // p1 economy pool so they keep loading; recomputeSupply below recomputes supply/cap from entities.
  if(!g.eco || !g.eco.p1){
    const flat = g.eco && typeof g.eco==='object' ? g.eco : s;
    g.eco = { p1: { gold:(flat.gold||0), supply:0, supplyCap:0, gold_collected:(flat.gold_collected||0) } };
  }
  if(g.players==null) g.players = 1;
  g.blocked  = legacyU8(s.blocked, cells);   // modern saves already carry feature/building blockers
  g.explored = legacyU8(s.explored, cells);
  g.visible  = new Uint8Array(cells);
  // rebuild the topography feature mask from features[] (not serialized): bottom rows block, upper walk-under
  g.feat = new Uint8Array(cells);
  if(g.features){ for(const f of g.features){ const fw=Math.max(1,(f.w||FEAT_SIZE)|0), fh=Math.max(1,(f.h||FEAT_SIZE)|0), blockFrom=(fh===FEAT_SIZE)?FEAT_BLOCK_FROM:Math.max(0, fh-(fh>>1));
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
      const cx=f.tx+x, cy=f.ty+y; if(cx>=0&&cy>=0&&cx<g.W&&cy<g.H) g.feat[cy*g.W+cx]=(y>=blockFrom)?2:1; } } }
  if(!hadBlocked && typeof baseBlocked==='function') for(let i=0;i<cells;i++) g.blocked[i]=baseBlocked(g,i);
  // rebuild the renderer's distance-to-shore depth field + tide buffers from the restored tiles (js/water.js)
  if(typeof buildWaterDepth==='function') buildWaterDepth(g);
  g.entities = s.entities.map(e=>Object.assign({}, e));
  const byId = new Map(g.entities.map(e=>[e.id, e]));
  g.entities.forEach(e=>resolveRefs(e, byId));        // re-link cross-refs in place
  if(!hadBlocked && typeof markBuilding==='function') g.entities.forEach(e=>{ if(e && !e.dead && e.kind==='building') markBuilding(g,e,true); });
  if(g.hub){
    g.hubPois={}; g.entities.forEach(e=>{ if(e.hubPoi) g.hubPois[e.hubPoi.id]=e; });
    if(typeof hubRestorePoiVisuals==='function') hubRestorePoiVisuals(g);
    // migrate old HUB saves: inject facilities added since the save was written (e.g. the
    // Training Grounds, which replaced the launchpad) and re-materialise any trainees.
    if(typeof hubReconcileFacilities==='function') hubReconcileFacilities(g);
    if(typeof hubSpawnTrainees==='function') hubSpawnTrainees(g);
    if(typeof hubSpawnHealers==='function') hubSpawnHealers(g);
  }
  // funding nodes carry a 3x3 footprint; feat[] was rebuilt from features[] only, so
  // restamp each node's mask (blocked[] was serialized and is already correct).
  if(typeof markFundingNode==='function') g.entities.forEach(e=>{ if(e.type==='goldmine'&&!e.dead) markFundingNode(g, e); });
  // back-fill hero sprite overrides for saves written before heroes[].sprite existed (e.g. a
  // carried Nino restored as a plain lobbyist) — derive it from the map configs by heroId.
  if(typeof heroSpriteFor==='function') g.entities.forEach(e=>{
    if(e.hero && !e.spriteType){ const sp=heroSpriteFor(e.heroId, e.type); if(sp) e.spriteType=sp; }
  });
  // memorial persists from save v2 on — restore it so the campaign death-toll survives save/load
  if(Array.isArray(s.fallen) && typeof restoreFallen==='function') restoreFallen(s.fallen);
  // pre-madosis save (v<2): approximate every veteran's current madosis so the system works on older games
  if(legacyMadosis && typeof madosisBackfill==='function') madosisBackfill(g, idx);
  g.selection = (s.selection||[]).map(id=>byId.get(id)).filter(e=>e && !e.dead && !e.storedIn);
  g.selection.forEach(e=>e.selected=true);
  g.groups={}; for(const k in (s.groups||{})) g.groups[k]=s.groups[k].map(id=>byId.get(id)).filter(Boolean);
  // rebuild per-unit control-group tags (Sets don't serialize) so the on-unit badge shows after load
  for(const k in g.groups){ for(const u of g.groups[k]){ if(!(u._groups instanceof Set)) u._groups=new Set(); u._groups.add(k); } }
  g.placing=null; g._cmdSig=null;
  // The Sprint is a transient, tap-driven run; start every load idle. A leftover
  // u.sprinting=true would permanently suppress that unit's combat (chokepoint guard).
  g.sprint={ active:false, window:0, t:0, mul:1, x:0, y:0, tapCount:0 };
  g.entities.forEach(e=>{ if(e.sprinting) e.sprinting=false; });
  if(typeof recomputeSupply==='function') recomputeSupply(g);   // rebuild per-pool supply (esp. legacy saves)
  return g;
}

/* ---------- slot enumeration & storage ---------- */
function listSaves(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key || key.indexOf(SAVE_PREFIX)!==0) continue;
    let d; try{ d=JSON.parse(localStorage.getItem(key)); }catch(_){ continue; }
    if(!isSaveBlob(d) || !saveVersionOk(d)) continue;
    out.push({key, auto:key===AUTO_KEY, mapName:d.mapName || (d.cfg&&d.cfg.name) || 'Quarter', gameTime:d.gameTime||d.time||0, savedAt:d.savedAt||0, mapIndex:saveMapIndex(d), hub:saveIsHubMap(d)});
  }
  out.sort((a,b)=> b.savedAt-a.savedAt);     // most recently saved first (autosave included in order)
  return out;
}
function enforceCap(){
  const manual=listSaves().filter(s=>!s.auto).sort((a,b)=>a.savedAt-b.savedAt); // oldest first
  while(manual.length>=MANUAL_CAP){ localStorage.removeItem(manual.shift().key); }
}

/* ---------- public: save / autosave / load ---------- */
function saveGame(){
  if(netRole!=='solo'){ toast('Saving is disabled in co-op'); return; }
  if(G && G._skirmish){ toast('Skirmish runs aren\'t saved — the campaign is untouched'); return; }
  if(!(G && running && !G.over)){ toast('Can only save during a match'); return; }
  try{
    const payload=serializeGame(), now=payload.savedAt;
    if(typeof fallenVets!=='undefined' && fallenVets) payload.fallen=fallenVets;   // persist the memorial (lost on load before v2)
    const manual=listSaves().filter(s=>!s.auto);       // newest-first
    let key;
    if(manual.length && now-manual[0].savedAt < 3000) key=manual[0].key;  // collapse rapid re-saves
    else { enforceCap(); key=SAVE_PREFIX+now; }
    localStorage.setItem(key, JSON.stringify(payload));
    toast('Game saved');
  }catch(_){ toast('Save failed: storage full'); }
}
function autosaveGame(){
  if(netRole!=='solo') return;                    // never autosave a co-op (half-applied) state
  if(G && G._skirmish) return;                    // skirmish never overwrites the campaign autosave (T3-2)
  if(!(G && running && !G.over)) return;
  try{ const p=serializeGame(); if(typeof fallenVets!=='undefined' && fallenVets) p.fallen=fallenVets; localStorage.setItem(AUTO_KEY, JSON.stringify(p)); }catch(_){}
}
function loadGame(key){
  if(netRole!=='solo'){ toast('Loading is disabled in co-op'); return; }
  let d; try{ d=JSON.parse(localStorage.getItem(key)); }catch(_){ d=null; }
  if(!d){ toast('Save not found'); return; }
  if(!isSaveBlob(d)){ toast('Not a STARLEFT save'); return; }
  if(!saveVersionOk(d)){ toast('Incompatible save'); return; }
  if(typeof MUSIC!=='undefined') MUSIC.leaveMenu();
  try{
    G=deserializeGame(d); mapIndex=saveMapIndex(d);
  }catch(err){
    console.error('Load failed', err, d);
    toast('Load failed: save data is incomplete');
    return;
  }
  ['startScreen','mapScreen','docScreen','crawlScreen','endScreen','loadScreen']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  if(typeof resetInputState==='function') resetInputState();
  if(typeof resetDialogs==='function') resetDialogs(); syncHud(); clampCam(G); computeFog(G); refreshUI();
  // asset gate (js/loader.js + ui.js): hold the world view until this map's critical sprites
  // settle — the opaque overlay hides any procedural flash. Deserialization above stayed
  // fully synchronous and byte-identical; only the trailing running=true moved behind the gate.
  running=false;
  let _isHub=false; try{ _isHub=saveIsHubMap(d); }catch(_){}
  LOADER.beginMission(_isHub ? missionTagsHub() : missionTags(mapIndex));
  gateMission(mapIndex, ()=>{
    running=true;
    if(typeof syncPauseBtn==='function') syncPauseBtn();
    toast('Loaded: '+(d.mapName||'game'));
  });
}

/* ---------- "▶ Continue" (T0-8): one-click resume of the most recent autosave ---------- */
// Episode-aware label for a save: map index → the crawl's episode/title; hub saves read as the H.U.B.
function saveEpisodeLabel(idx, isHub){
  if(isHub) return 'H.U.B. — between quarters';
  const m = MAPS[idx], cr = m && m.crawl;
  return cr ? (cr.episode + ' — ' + cr.title) : ((m && m.name) || 'Quarter');
}
function continueGame(){ loadGame(AUTO_KEY); }
// Show/hide + label the main-menu Continue button from the autosave (legacy autosaves without a
// clean map index fall back to the raw map name; storage empty/disabled hides the button).
function syncContinueButton(){
  const btn=document.getElementById('btn-continue'); if(!btn) return;
  let d=null;
  try{ d=JSON.parse(localStorage.getItem(AUTO_KEY)); }catch(_){ d=null; }
  if(!isSaveBlob(d) || !saveVersionOk(d)){ btn.style.display='none'; return; }
  const sub=document.getElementById('btn-continue-sub');
  if(sub){
    let lbl;
    try{ lbl=saveEpisodeLabel(saveMapIndex(d), saveIsHubMap(d)); }catch(_){ lbl=d.mapName||'Quarter'; }
    sub.textContent = lbl + ' · ' + fmtElapsed(d.gameTime||0) + ' in';
  }
  btn.style.display='';
}

/* ---------- "Load Game" menu ---------- */
function openLoadMenu(){
  buildLoadSlots();
  // "Map Selection" (jump to any Quarter) belongs only to the PRE-GAME main-menu Load panel.
  // The SAME #loadScreen is reused by the in-game top-menu "Load" (#btn-load); there, mapScreen
  // must stay unreachable so its ◀ Back (→ loadScreen) can't strand the player over a live game.
  // We're at the main menu iff #startScreen is still showing beneath this overlay.
  const mapBtn=document.getElementById('loadMapSelectBtn');
  if(mapBtn){ const ss=document.getElementById('startScreen'); mapBtn.style.display=(ss && getComputedStyle(ss).display!=='none') ? '' : 'none'; }
  showSub('loadScreen');
}
function fmtElapsed(sec){ sec=Math.max(0,sec|0); const m=(sec/60)|0, s=sec%60; return m+':'+(s<10?'0':'')+s; }
function fmtWhen(ms){ try{ return new Date(ms).toLocaleString(); }catch(_){ return ''; } }
function buildLoadSlots(){
  const wrap=document.getElementById('loadSlots'); if(!wrap) return;
  wrap.innerHTML='';
  const saves=listSaves();
  if(!saves.length){ wrap.innerHTML='<div class="panel-label">No saved games yet</div>'; return; }
  saves.forEach(s=>{
    const row=document.createElement('div'); row.className='save-row';
    let ep=''; try{ ep=saveEpisodeLabel(s.mapIndex, s.hub); }catch(_){ ep=''; }
    row.innerHTML=`<button class="map-btn save-load" title="Load this save">
        <b>${s.auto?'★ Autosave — ':''}${ep||s.mapName||'Quarter'}</b>
        <span class="mn">${s.mapName||''} · elapsed ${fmtElapsed(s.gameTime)}</span>
        <small>${fmtWhen(s.savedAt)}</small>
      </button>
      <button class="tc-btn save-exp" title="Export to file">⬇</button>
      <button class="tc-btn save-del" title="Delete save">✕</button>`;
    row.querySelector('.save-load').onclick=()=>loadGame(s.key);
    row.querySelector('.save-exp').onclick=()=>exportSave(s.key);
    row.querySelector('.save-del').onclick=()=>{ localStorage.removeItem(s.key); buildLoadSlots(); };
    wrap.appendChild(row);
  });
}

/* ---------- export / import save files (share a save between devices) ----------
   Saves are stored verbatim as JSON strings, so export just downloads the stored
   string and import validates + writes it back as a new slot — no (de)serialize needed. */
function saveSlug(name){
  return (name||'save').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'save';
}
// save timestamp for filenames, e.g. 06-02-14:30 (month-day-hours:minutes)
function fmtStamp(ms){
  const d=new Date(ms||Date.now()), p=n=>(n<10?'0':'')+n;
  return p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+':'+p(d.getMinutes());
}
function exportSave(key){
  const raw=localStorage.getItem(key);
  if(!raw){ toast('Save not found'); return; }
  let d=null; try{ d=JSON.parse(raw); }catch(_){}
  const fname='starleft-'+saveSlug(d&&d.mapName)+'-'+fmtStamp(d&&d.savedAt)+'.json';
  const url=URL.createObjectURL(new Blob([raw], {type:'application/json'}));
  const a=document.createElement('a');
  a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast('Save exported');
}
function importSaveFile(file){
  if(!file) return;
  const r=new FileReader();
  r.onerror=()=>toast('Could not read file');
  r.onload=()=>{
    let d=null; try{ d=JSON.parse(r.result); }catch(_){ toast('Not a valid save file'); return; }
    if(!isSaveBlob(d)){ toast('Not a STARLEFT save'); return; }
    if(!saveVersionOk(d)){ toast('Incompatible save version'); return; }
    try{
      enforceCap();               // respect the 8-manual-slot FIFO cap (same as saveGame)
      d.savedAt=Date.now();       // re-stamp so the import lands at the top & survives the cap
      localStorage.setItem(SAVE_PREFIX+d.savedAt, JSON.stringify(d));
      buildLoadSlots();           // refresh the open Load Game list
      toast('Save imported');
    }catch(_){ toast('Import failed: storage full'); }
  };
  r.readAsText(file);
}
