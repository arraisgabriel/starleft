/* save.js — browser-localStorage save/load. Snapshots the whole live state G to
   JSON (typed arrays -> arrays, entity cross-refs -> {$ref:id}) and restores it.
   Multiple manual slots (capped, FIFO) + one periodic autosave slot. Public
   entry points: saveGame / autosaveGame / loadGame / openLoadMenu (called from
   the HUD button, ⌘/Ctrl+S, the main loop, and the "Load Game" menu button). */
const SAVE_VERSION = 1;
const SAVE_PREFIX  = 'starleft_save_';
const AUTO_KEY     = SAVE_PREFIX + 'auto';
const MANUAL_CAP   = 8;             // newest 8 manual saves kept; oldest evicted

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
const SKIP = {cfg:1, visible:1, _cmdSig:1, placing:1, sprint:1, entities:1, selection:1, groups:1, blocked:1, explored:1, feat:1, waterDepth:1};
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
  return s;
}
function deserializeGame(s){
  const g={};
  const META={v:1, mapIndex:1, savedAt:1, mapName:1, gameTime:1};
  for(const k in s){ if(!SKIP[k] && !META[k]) g[k]=s[k]; }
  g.cfg = scaleCfg(MAPS[s.mapIndex]);   // match the scaled cfg newMap() produces
  g.blocked  = Uint8Array.from(s.blocked);   // already carries feature-base blockers
  g.explored = Uint8Array.from(s.explored);
  g.visible  = new Uint8Array(g.W*g.H);
  // rebuild the topography feature mask from features[] (not serialized): bottom rows block, upper walk-under
  g.feat = new Uint8Array(g.W*g.H);
  if(g.features){ const N=FEAT_SIZE; for(const f of g.features){ for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const cx=f.tx+x, cy=f.ty+y; if(cx>=0&&cy>=0&&cx<g.W&&cy<g.H) g.feat[cy*g.W+cx]=(y>=FEAT_BLOCK_FROM)?2:1; } } }
  // rebuild the renderer's distance-to-shore depth field + tide buffers from the restored tiles (js/water.js)
  if(typeof buildWaterDepth==='function') buildWaterDepth(g);
  g.entities = s.entities.map(e=>Object.assign({}, e));
  const byId = new Map(g.entities.map(e=>[e.id, e]));
  g.entities.forEach(e=>resolveRefs(e, byId));        // re-link cross-refs in place
  // funding nodes carry a 3x3 footprint; feat[] was rebuilt from features[] only, so
  // restamp each node's mask (blocked[] was serialized and is already correct).
  if(typeof markFundingNode==='function') g.entities.forEach(e=>{ if(e.type==='goldmine'&&!e.dead) markFundingNode(g, e); });
  // back-fill hero sprite overrides for saves written before heroes[].sprite existed (e.g. a
  // carried Nino restored as a plain lobbyist) — derive it from the map configs by heroId.
  if(typeof heroSpriteFor==='function') g.entities.forEach(e=>{
    if(e.hero && !e.spriteType){ const sp=heroSpriteFor(e.heroId, e.type); if(sp) e.spriteType=sp; }
  });
  g.selection = (s.selection||[]).map(id=>byId.get(id)).filter(Boolean);
  g.selection.forEach(e=>e.selected=true);
  g.groups={}; for(const k in (s.groups||{})) g.groups[k]=s.groups[k].map(id=>byId.get(id)).filter(Boolean);
  // rebuild per-unit control-group tags (Sets don't serialize) so the on-unit badge shows after load
  for(const k in g.groups){ for(const u of g.groups[k]){ if(!(u._groups instanceof Set)) u._groups=new Set(); u._groups.add(k); } }
  g.placing=null; g._cmdSig=null;
  // The Sprint is a transient, tap-driven run; start every load idle. A leftover
  // u.sprinting=true would permanently suppress that unit's combat (chokepoint guard).
  g.sprint={ active:false, window:0, t:0, mul:1, x:0, y:0, tapCount:0 };
  g.entities.forEach(e=>{ if(e.sprinting) e.sprinting=false; });
  return g;
}

/* ---------- slot enumeration & storage ---------- */
function listSaves(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key || key.indexOf(SAVE_PREFIX)!==0) continue;
    let d; try{ d=JSON.parse(localStorage.getItem(key)); }catch(_){ continue; }
    if(!d || d.v==null) continue;
    out.push({key, auto:key===AUTO_KEY, mapName:d.mapName, gameTime:d.gameTime, savedAt:d.savedAt||0, mapIndex:d.mapIndex});
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
  if(!(G && running && !G.over)){ toast('Can only save during a match'); return; }
  try{
    const payload=serializeGame(), now=payload.savedAt;
    const manual=listSaves().filter(s=>!s.auto);       // newest-first
    let key;
    if(manual.length && now-manual[0].savedAt < 3000) key=manual[0].key;  // collapse rapid re-saves
    else { enforceCap(); key=SAVE_PREFIX+now; }
    localStorage.setItem(key, JSON.stringify(payload));
    toast('Game saved');
  }catch(_){ toast('Save failed: storage full'); }
}
function autosaveGame(){
  if(!(G && running && !G.over)) return;
  try{ localStorage.setItem(AUTO_KEY, JSON.stringify(serializeGame())); }catch(_){}
}
function loadGame(key){
  let d; try{ d=JSON.parse(localStorage.getItem(key)); }catch(_){ d=null; }
  if(!d){ toast('Save not found'); return; }
  if(d.v!==SAVE_VERSION){ toast('Incompatible save'); return; }
  G=deserializeGame(d); mapIndex=d.mapIndex|0;
  ['startScreen','mapScreen','docScreen','crawlScreen','endScreen','loadScreen']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  if(typeof resetDialogs==='function') resetDialogs(); syncHud(); clampCam(G); computeFog(G); refreshUI(); running=true;
  toast('Loaded: '+(d.mapName||'game'));
}

/* ---------- "Load Game" menu ---------- */
function openLoadMenu(){ buildLoadSlots(); showSub('loadScreen'); }
function fmtElapsed(sec){ sec=Math.max(0,sec|0); const m=(sec/60)|0, s=sec%60; return m+':'+(s<10?'0':'')+s; }
function fmtWhen(ms){ try{ return new Date(ms).toLocaleString(); }catch(_){ return ''; } }
function buildLoadSlots(){
  const wrap=document.getElementById('loadSlots'); if(!wrap) return;
  wrap.innerHTML='';
  const saves=listSaves();
  if(!saves.length){ wrap.innerHTML='<div class="panel-label">No saved games yet</div>'; return; }
  saves.forEach(s=>{
    const row=document.createElement('div'); row.className='save-row';
    row.innerHTML=`<button class="map-btn save-load" title="Load this save">
        <b>${s.auto?'★ ':''}${s.mapName||'Quarter'}</b>
        <span class="mn">elapsed ${fmtElapsed(s.gameTime)}</span>
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
    if(!d || typeof d!=='object' || d.v==null || !Array.isArray(d.entities)){ toast('Not a STARLEFT save'); return; }
    if(d.v!==SAVE_VERSION){ toast('Incompatible save version'); return; }
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
