/* map-editor.js - standalone developer editor for ALL maps: the HUB (HUB_MAP_DATA) and every
   campaign map (the MAPS array in js/maps_data.js). The preview is derived from the real map
   builders — hubBuildPreviewMap() for the HUB, newMap(idx) for campaign maps — and render().
   (Formerly hub-map-editor.js; CSS classes keep the hme- prefix.) */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('cv');
  const overlay = canvas.getContext('2d');
  const els = {
    status:$('statusLine'), validation:$('validationList'), summary:$('selectionSummary'), props:$('propertyEditor'),
    importFile:$('importFile'), megaCat:$('megaCat'), megaVariant:$('megaVariant'), buildingType:$('buildingType'),
    topoSlot:$('topoSlot'), biomePick:$('biomePick'), newW:$('newW'), newH:$('newH'), newOverhang:$('newOverhang'),
    newHeightScale:$('newHeightScale'), mapW:$('mapW'), mapH:$('mapH'),
    mapSelect:$('mapSelect'), paintSection:$('paintSection'), paintTarget:$('paintTarget'), brushSize:$('brushSize'),
    procWarning:$('procWarning')
  };

  const app = {
    mode:'hub',                 // 'hub' | 'campaign'
    mapIdx:-1,                  // campaign map index (MAPS[idx]) when mode==='campaign'
    campaign:null,              // {cfg, postW, postH} working copy of MAPS[idx]
    paint:null,                 // Map<postScaleTileIndex, targetKey> while editing a campaign map
    data:hubNormalizeMapData(window.HUB_MAP_DATA || null),
    preview:null,
    rebuildTimer:0,
    rebuildPending:false,
    tool:'select',
    selected:null,
    grid:true,
    view:{x:80, y:58, z:0.52},
    drag:null,
    dpr:window.devicePixelRatio || 1,
    frame:0,
    lastValidation:null,
  };

  function status(msg){ els.status.textContent = msg; }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function num(id, fallback){
    const n = Number($(id).value);
    return Number.isFinite(n) ? n : fallback;
  }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function tilePos(o){
    if(app.mode === 'campaign') return campTilePos(o.kind, o.item);
    if(o.kind === 'pois') return {x:o.item.x, y:o.item.y};
    if(o.kind === 'bridges') return {x:o.item.x, y:o.item.y};
    return {x:o.item.tx, y:o.item.ty};
  }
  function setTilePos(o, x, y){
    if(app.mode === 'campaign'){ campSetTilePos(o.kind, o.item, x, y); return; }
    if(o.kind === 'pois'){ o.item.x = x; o.item.y = y; }
    else if(o.kind === 'bridges'){ o.item.x = x; o.item.y = y; }
    else { o.item.tx = x; o.item.ty = y; }
  }
  function itemRect(o){
    if(app.mode === 'campaign') return campRect(o.kind, o.item);
    const it = o.item;
    const w = Math.max(1, it.w || 1), h = Math.max(1, it.h || 1);
    if(o.kind === 'bridges') return {x:Math.round((it.x || 0) - w/2), y:Math.round((it.y || 0) - h/2), w, h};
    const p = tilePos(o);
    return {x:p.x, y:p.y, w, h};
  }
  function collections(){
    if(app.mode === 'campaign') return CAMP_ORDER.map(k=>[k, campArr(k)]);
    return [
      ['bridges', app.data.bridges],
      ['topography', app.data.topography],
      ['megaSprites', app.data.megaSprites],
      ['buildings', app.data.buildings],
      ['pois', app.data.pois]
    ];
  }
  function mapGridW(){ return app.mode === 'campaign' ? (app.preview ? app.preview.W : app.campaign.postW) : app.data.W; }
  function mapGridH(){ return app.mode === 'campaign' ? (app.preview ? app.preview.H : app.campaign.postH) : app.data.H; }
  function arrFor(kind){ return app.mode === 'campaign' ? campArr(kind) : app.data[kind]; }
  function selectedObject(){
    if(!app.selected) return null;
    const arr = arrFor(app.selected.kind);
    if(!arr || !arr[app.selected.index]) return null;
    return {kind:app.selected.kind, index:app.selected.index, item:arr[app.selected.index]};
  }

  // ============================ CAMPAIGN MAP ADAPTER ============================
  // Edits real MAPS[idx] entries. Placements are the hand-placed coordinate arrays stored in PRE-scale
  // tiles; the preview is the actual newMap(idx) generation in POST-scale tiles (×MAP_SCALE). Terrain is
  // an explicit per-tile PAINT override layer (app.paint: Map<postScaleIndex,targetKey>) persisted to
  // cfg.paint. Markers render at coord*MS; dragging converts back to pre-scale. (editor plan Steps 1-6)
  const MS = (typeof MAP_SCALE === 'number') ? MAP_SCALE : 1.7;
  const CAMP_KINDS = {
    scenery:     {anchor:'tl'},
    enemies:     {anchor:'center', size:[5,5]},
    goldNodes:   {anchor:'center', size:[3,3]},
    lostBases:   {anchor:'center', size:[3,3]},
    villain:     {anchor:'center', size:[3,3]},
    guards:      {anchor:'center', size:[3,3]},
    captives:    {anchor:'center', size:[2,2]},
    lakes:       {anchor:'center'},
    rockClusters:{anchor:'center', size:[3,3]},
    forests:     {anchor:'center', size:[3,3]},
    thickets:    {anchor:'tl', rect:true},
    player:      {anchor:'center', size:[3,3], single:true},
  };
  const CAMP_ORDER = ['thickets','lakes','rockClusters','forests','scenery','goldNodes','lostBases','enemies','guards','captives','villain','player'];
  const CAMP_WARNING = '<strong>⚠ Procedural terrain.</strong> Grass/snow/tech/lava/water, forests, rocks, mountains &amp; seas are generated from this map’s <strong>seed</strong> and aren’t edited tile-by-tile here — use the <strong>Paint</strong> tool for explicit per-tile overrides (saved as <code>cfg.paint</code>, identical every playthrough). Hero dossiers &amp; enemy waves are generated in-game. Editable: placements (player, enemies, gold, scenery, lakes/rocks/forests, guards, captives, villain) + paint.';

  function campCfg(){ return app.campaign && app.campaign.cfg; }
  function campArr(kind){
    const c = campCfg(); if(!c) return [];
    if(kind === 'player') return c.player ? [c.player] : [];
    if(kind === 'villain') return Array.isArray(c.villain) ? c.villain : (c.villain ? [c.villain] : []);
    return c[kind] || (c[kind] = []);
  }
  function campSize(kind, it){
    if(kind === 'scenery'){ const d = DEF[it.type]; return [d ? d.w : 4, d ? d.h : 4]; }
    if(kind === 'lakes'){ const r = Math.max(1, Math.round((it.r || 3) * MS)); return [r*2, r*2]; }
    if(kind === 'thickets') return [Math.max(1, Math.round((it.w||4)*MS)), Math.max(1, Math.round((it.h||4)*MS))];
    const m = CAMP_KINDS[kind]; return (m && m.size) ? m.size : [3,3];
  }
  function campTilePos(kind, it){ return {x:Math.round((it.x||0)*MS), y:Math.round((it.y||0)*MS)}; }
  function campSetTilePos(kind, it, ptx, pty){ it.x = Math.round(ptx / MS); it.y = Math.round(pty / MS); }
  function campRect(kind, it){
    const a = campTilePos(kind, it), s = campSize(kind, it), m = CAMP_KINDS[kind] || {};
    if(m.anchor === 'tl') return {x:a.x, y:a.y, w:s[0], h:s[1]};
    return {x:a.x - (s[0]>>1), y:a.y - (s[1]>>1), w:s[0], h:s[1]};
  }
  function loadCampaign(idx){
    app.mode = 'campaign'; app.mapIdx = idx;
    app.campaign = {cfg:clone(MAPS[idx]), postW:Math.round(MAPS[idx].w*MS), postH:Math.round(MAPS[idx].h*MS)};
    app.paint = new Map();
    const enc = app.campaign.cfg.paint; delete app.campaign.cfg.paint;   // paint lives in app.paint while editing
    if(enc && typeof MAP_PAINT !== 'undefined'){ const d = MAP_PAINT.decode(enc);
      if(d){ app.campaign.postW = d.W; app.campaign.postH = d.H; d.ops.forEach(op=>app.paint.set(op.i, op.key)); } }
    app.selected = null; app.tool = 'select'; setActiveTool('select');
    rebuildPreview();
    app.view.z = 0.42; app.view.x = 16; app.view.y = 64; syncPreviewCamera();
    updateModeUI(); refreshAll();
    status('Editing '+MAPS[idx].name);
  }
  function loadHub(){
    app.mode = 'hub'; app.mapIdx = -1; app.campaign = null; app.paint = null;
    app.data = hubNormalizeMapData(window.HUB_MAP_DATA || null);
    app.selected = null; app.tool = 'select'; setActiveTool('select');
    rebuildPreview(); updateModeUI(); refreshAll();
    status('Editing HUB');
  }
  function paintEncoded(){
    return (app.paint && app.paint.size && typeof MAP_PAINT !== 'undefined')
      ? MAP_PAINT.encode(app.paint, app.campaign.postW, app.campaign.postH) : null;
  }
  function buildCampaignPreview(){
    const idx = app.mapIdx, cfg = clone(app.campaign.cfg), enc = paintEncoded();
    if(enc) cfg.paint = enc; else delete cfg.paint;
    MAPS[idx] = cfg;                                  // install working copy so newMap() reads it
    const st = newMap(idx);
    if(typeof hubRevealAll === 'function') hubRevealAll(st);
    return st;
  }
  // live paint: mutate the preview state directly (instant) + record into app.paint. No newMap rebuild.
  function paintAt(ptx, pty){
    if(app.mode !== 'campaign' || !app.preview || typeof MAP_PAINT === 'undefined') return;
    const target = els.paintTarget ? els.paintTarget.value : 'grass';
    const spec = MAP_PAINT.TARGETS[target]; if(!spec) return;
    const b = Math.max(1, (els.brushSize ? +els.brushSize.value : 1) | 0), half = b >> 1;
    const W = app.preview.W, H = app.preview.H, ops = []; let water = false;
    for(let dy=0; dy<b; dy++) for(let dx=0; dx<b; dx++){
      const x = ptx - half + dx, y = pty - half + dy;
      if(x<0 || y<0 || x>=W || y>=H) continue;
      const i = y*W + x; app.paint.set(i, target);
      ops.push({i, key:target, tile:spec.tile, biome:spec.biome, feat:spec.feat});
      if(spec.tile === T_WATER) water = true;
    }
    MAP_PAINT.applyOps(app.preview, ops, app._paintRng || (app._paintRng = makeRng(99)));
    if(water && typeof buildWaterDepth === 'function') buildWaterDepth(app.preview);
  }
  function setActiveTool(tool){
    app.tool = tool;
    document.querySelectorAll('.hme-tool').forEach(b=>b.classList.toggle('is-active', b.dataset.tool === tool));
  }
  function updateModeUI(){
    const camp = app.mode === 'campaign';
    if(els.paintSection) els.paintSection.hidden = !camp;
    if(els.procWarning){ els.procWarning.hidden = !camp; if(camp) els.procWarning.innerHTML = CAMP_WARNING; }
    const show = (tool, on)=>{ const b = document.querySelector('.hme-tool[data-tool="'+tool+'"]'); if(b) b.style.display = on ? '' : 'none'; };
    ['topography','mega','poi','building'].forEach(t=>show(t, !camp));   // HUB placement tools
    show('paint', camp);                                                // paint is campaign-only
    if(els.mapW) els.mapW.disabled = camp;                              // campaign dims are pre-scale + paint-keyed → read-only here
    if(els.mapH) els.mapH.disabled = camp;
  }

  function init(){
    fillSelect(els.megaCat, HUB_MAP_MEGA_CATS);
    fillSelect(els.buildingType, HUB_MAP_BUILDING_TYPES);
    fillSelect(els.topoSlot, HUB_MAP_TOPO_SLOTS);
    fillSelect(els.biomePick, HUB_MAP_BIOMES);
    if(els.mapSelect){
      const opt = (v,t)=>{ const o = document.createElement('option'); o.value = v; o.textContent = t; els.mapSelect.appendChild(o); };
      opt('hub', 'HUB (city)');
      (typeof MAPS !== 'undefined' ? MAPS : []).forEach((m,i)=>opt('m'+i, (i+1)+'. '+(m.name || ('Map '+i))));
    }
    bindEvents();
    resizeEditorCanvas();
    updateModeUI();
    refreshAll();
    rebuildPreview();
    requestAnimationFrame(loop);
  }
  function fillSelect(sel, items){
    sel.innerHTML = '';
    items.forEach(v=>{
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
  }
  function bindEvents(){
    window.addEventListener('resize', resizeEditorCanvas);
    document.querySelectorAll('.hme-tool').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        app.tool = btn.dataset.tool;
        document.querySelectorAll('.hme-tool').forEach(b=>b.classList.toggle('is-active', b === btn));
        applyToolDefaults();
        status('Tool: '+app.tool);
      });
    });
    $('gridToggle').addEventListener('click', ()=>{
      app.grid = !app.grid;
      status(app.grid ? 'Grid on' : 'Grid off');
    });
    $('importBtn').addEventListener('click', ()=>els.importFile.click());
    $('exportBtn').addEventListener('click', exportJson);
    $('copyBtn').addEventListener('click', copyJson);
    $('replaceBtn').addEventListener('click', replaceJs);
    $('duplicateBtn').addEventListener('click', duplicateSelection);
    $('deleteBtn').addEventListener('click', deleteSelection);
    $('normalizeBtn').addEventListener('click', ()=>{
      app.data = hubNormalizeMapData(app.data);
      app.selected = null;
      refreshAll();
      schedulePreviewRebuild(0);
      status('Data normalized');
    });
    if(els.mapSelect) els.mapSelect.addEventListener('change', ()=>{
      const v = els.mapSelect.value;
      if(v === 'hub') loadHub(); else loadCampaign(+v.slice(1));
    });
    els.importFile.addEventListener('change', importFile);
    [els.megaCat, els.buildingType, els.topoSlot].forEach(el=>el.addEventListener('change', applyToolDefaults));
    [els.mapW, els.mapH].forEach(el=>el.addEventListener('change', ()=>{
      app.data.W = clamp(Number(els.mapW.value) || app.data.W, 16, 256);
      app.data.H = clamp(Number(els.mapH.value) || app.data.H, 16, 256);
      refreshAll();
      schedulePreviewRebuild(0);
    }));
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('wheel', wheel, {passive:false});
    canvas.addEventListener('contextmenu', e=>e.preventDefault());
    window.addEventListener('keydown', keydown);
  }
  function applyToolDefaults(){
    if(app.tool === 'mega'){
      const cat = els.megaCat.value;
      const d = {megabuilding:[6,6,1.3], mountain:[7,5,1.38], volcano:[6,6,1.32], ruin:[6,5,1.3]}[cat] || [6,5,1.3];
      els.newW.value = d[0];
      els.newH.value = d[1];
      els.newOverhang.value = d[2];
      els.newHeightScale.value = 1;
    } else if(app.tool === 'building' || app.tool === 'poi'){
      const d = DEF[els.buildingType.value] || {w:3, h:3};
      els.newW.value = d.w;
      els.newH.value = d.h;
      els.newOverhang.value = 1.08;
      els.newHeightScale.value = 1;
    } else if(app.tool === 'topography'){
      els.newW.value = 3;
      els.newH.value = 3;
      els.newOverhang.value = 1.08;
      els.newHeightScale.value = 1;
    }
  }
  function resizeEditorCanvas(){
    const r = canvas.getBoundingClientRect();
    app.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * app.dpr));
    canvas.height = Math.max(1, Math.round(r.height * app.dpr));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    dpr = app.dpr;
    VIEW_TOP = 0;
    VIEW_BOT = 0;
    cssH = r.height || (canvas.height / app.dpr);
    syncPreviewCamera();
  }
  function refreshAll(){
    els.mapW.value = mapGridW();
    els.mapH.value = mapGridH();
    renderProperties();
    validate();
  }
  // campaign reachability check: flood the preview's blocked grid from the player start and report any
  // gold node / enemy base walled off — surfaced so a stranding paint/placement is visible (Step 5).
  function campaignValidate(){
    const out = {errors:[], warnings:[]};
    const st = app.preview; if(!st || !st.blocked){ return out; }
    const W = st.W, H = st.H, B = st.blocked, cfg = st.cfg, p = cfg.player;
    if(!p){ return out; }
    const seen = new Uint8Array(W*H), stack = [[p.x|0, p.y|0]];
    if(p.y*W+p.x < W*H) seen[(p.y|0)*W+(p.x|0)] = 1;
    while(stack.length){ const [x,y] = stack.pop();
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue; const k=ny*W+nx; if(seen[k]||B[k]) continue; seen[k]=1; stack.push([nx,ny]); } }
    const targets = (cfg.goldNodes||[]).map(g=>['gold', g]).concat((cfg.enemies||[]).map(b=>['base', b]));
    let stranded = 0;
    for(const [, t] of targets){ const k=(t.y|0)*W+(t.x|0); if(k>=0 && k<W*H && !seen[k]) stranded++; }
    if(stranded) out.warnings.push(stranded+' objective(s) only reachable via an in-game carved bridge (paint/placement blocks them).');
    out.warnings.push((app.paint ? app.paint.size : 0)+' painted tile(s). Placements: '+CAMP_ORDER.reduce((a,k)=>a+campArr(k).length,0)+'.');
    return out;
  }
  function validate(){
    const result = app.mode === 'campaign' ? campaignValidate() : hubValidateMapData(app.data);
    app.lastValidation = result;
    els.validation.innerHTML = '';
    const messages = result.errors.map(text=>({text, type:'error'}))
      .concat(result.warnings.map(text=>({text, type:'warn'})));
    if(!messages.length) messages.push({text:'No validation issues.', type:'ok'});
    messages.slice(0, 18).forEach(m=>{
      const div = document.createElement('div');
      div.className = 'hme-note '+m.type;
      div.textContent = m.text;
      els.validation.appendChild(div);
    });
    if(messages.length > 18){
      const div = document.createElement('div');
      div.className = 'hme-note warn';
      div.textContent = (messages.length - 18)+' more issues hidden.';
      els.validation.appendChild(div);
    }
  }

  function schedulePreviewRebuild(delay){
    clearTimeout(app.rebuildTimer);
    app.rebuildPending = true;
    app.rebuildTimer = setTimeout(rebuildPreview, delay == null ? 40 : delay);
  }
  function rebuildPreview(){
    clearTimeout(app.rebuildTimer);
    app.rebuildTimer = 0;
    app.rebuildPending = false;
    try{
      app.preview = (app.mode === 'campaign') ? buildCampaignPreview() : hubBuildPreviewMap(app.data);
      syncPreviewCamera();
      G = app.preview;
    } catch(err){
      status('Preview rebuild failed: '+err.message);
      throw err;
    }
  }
  function syncPreviewCamera(){
    if(!app.preview) return;
    app.preview.zoom = app.view.z;
    app.preview.camX = -app.view.x / app.view.z;
    app.preview.camY = -app.view.y / app.view.z;
    app.preview.time = app.frame;
    G = app.preview;
  }
  function loop(t){
    app.frame = (t || 0) / 1000;
    draw();
    requestAnimationFrame(loop);
  }
  function draw(){
    if(!app.preview) rebuildPreview();
    syncPreviewCamera();
    render(app.preview);
    drawEditorOverlays();
  }
  function drawEditorOverlays(){
    if(!app.preview) return;
    overlay.save();
    overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlay.translate(0, VIEW_TOP);
    overlay.scale(app.preview.zoom || 1, app.preview.zoom || 1);
    overlay.translate(-app.preview.camX, -app.preview.camY);
    if(app.grid) drawGrid();
    drawBridgeOutlines();
    drawSelection();
    overlay.restore();
    overlay.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawGrid(){
    overlay.save();
    overlay.strokeStyle = 'rgba(255,255,255,.08)';
    overlay.lineWidth = 1 / app.view.z;
    overlay.beginPath();
    const gw = mapGridW(), gh = mapGridH();
    for(let x=0; x<=gw; x++){ overlay.moveTo(x*TILE, 0); overlay.lineTo(x*TILE, gh*TILE); }
    for(let y=0; y<=gh; y++){ overlay.moveTo(0, y*TILE); overlay.lineTo(gw*TILE, y*TILE); }
    overlay.stroke();
    overlay.restore();
  }
  function drawBridgeOutlines(){
    overlay.save();
    overlay.strokeStyle = 'rgba(255,255,255,.24)';
    overlay.lineWidth = 2 / app.view.z;
    app.data.bridges.forEach(b=>{
      const r = itemRect({kind:'bridges', item:b});
      overlay.strokeRect(r.x*TILE, r.y*TILE, r.w*TILE, r.h*TILE);
    });
    overlay.restore();
  }
  function drawSelection(){
    const sel = selectedObject();
    if(!sel) return;
    const r = itemRect(sel);
    overlay.save();
    overlay.strokeStyle = '#49d49b';
    overlay.fillStyle = 'rgba(73,212,155,.10)';
    overlay.lineWidth = 3 / app.view.z;
    overlay.setLineDash([8 / app.view.z, 5 / app.view.z]);
    overlay.fillRect(r.x*TILE, r.y*TILE, r.w*TILE, r.h*TILE);
    overlay.strokeRect(r.x*TILE - 2/app.view.z, r.y*TILE - 2/app.view.z, r.w*TILE + 4/app.view.z, r.h*TILE + 4/app.view.z);
    overlay.restore();
  }

  function screenToWorld(e){
    const r = canvas.getBoundingClientRect();
    syncPreviewCamera();
    return {
      x:app.preview.camX + (e.clientX - r.left) / app.view.z,
      y:app.preview.camY + (e.clientY - r.top) / app.view.z
    };
  }
  function pointerDown(e){
    canvas.setPointerCapture(e.pointerId);
    const w = screenToWorld(e), tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    if(e.button === 1 || e.button === 2 || e.altKey){
      app.drag = {mode:'pan', sx:e.clientX, sy:e.clientY, vx:app.view.x, vy:app.view.y};
      return;
    }
    if(app.tool === 'paint'){
      if(app.mode !== 'campaign'){ status('Paint is for campaign maps'); return; }
      app.drag = {mode:'paint'};
      paintAt(tx, ty);
      return;
    }
    if(app.tool === 'erase'){
      const hit = hitTest(tx, ty);
      if(hit){ app.selected = hit; deleteSelection(); status('Deleted placement'); }
      return;
    }
    if(app.tool !== 'select'){
      const made = addPlacement(tx, ty);
      if(made) app.drag = {mode:'move', kind:made.kind, index:made.index, ox:0, oy:0};
      return;
    }
    const hit = hitTest(tx, ty);
    app.selected = hit;
    renderProperties();
    if(hit){
      const pos = tilePos(selectedObject());
      app.drag = {mode:'move', kind:hit.kind, index:hit.index, ox:tx-pos.x, oy:ty-pos.y};
      status('Selected '+hit.kind);
    } else {
      app.drag = {mode:'pan', sx:e.clientX, sy:e.clientY, vx:app.view.x, vy:app.view.y};
      status('Panning');
    }
  }
  function pointerMove(e){
    if(!app.drag) return;
    if(app.drag.mode === 'pan'){
      app.view.x = app.drag.vx + (e.clientX - app.drag.sx);
      app.view.y = app.drag.vy + (e.clientY - app.drag.sy);
      syncPreviewCamera();
      return;
    }
    if(app.drag.mode === 'paint'){
      const w0 = screenToWorld(e);
      paintAt(Math.floor(w0.x / TILE), Math.floor(w0.y / TILE));
      return;
    }
    const w = screenToWorld(e);
    const tx = Math.round(w.x / TILE - app.drag.ox);
    const ty = Math.round(w.y / TILE - app.drag.oy);
    const obj = {kind:app.drag.kind, index:app.drag.index, item:arrFor(app.drag.kind)[app.drag.index]};
    setTilePos(obj, tx, ty);
    renderProperties(false);
    validate();
    schedulePreviewRebuild(55);
  }
  function pointerUp(){
    if(app.drag && app.drag.mode === 'move'){
      renderProperties();
      schedulePreviewRebuild(0);
    } else if(app.drag && app.drag.mode === 'paint'){
      validate();
      status('Painted '+(els.paintTarget ? els.paintTarget.value : '')+' ('+app.paint.size+' tiles)');
    }
    app.drag = null;
  }
  function wheel(e){
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = {x:(sx - app.view.x) / app.view.z, y:(sy - app.view.y) / app.view.z};
    const next = clamp(app.view.z * (e.deltaY < 0 ? 1.12 : 0.89), 0.18, 2.8);
    app.view.z = next;
    app.view.x = sx - before.x * next;
    app.view.y = sy - before.y * next;
    syncPreviewCamera();
  }
  function hitTest(tx, ty){
    const hits = [];
    collections().forEach(([kind, arr])=>{
      arr.forEach((item, index)=>{
        const o = {kind, index, item}, r = itemRect(o);
        if(tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) hits.push({kind, index, y:(r.y + r.h) * TILE});
      });
    });
    hits.sort((a, b)=>a.y - b.y);
    const h = hits[hits.length - 1];
    return h ? {kind:h.kind, index:h.index} : null;
  }
  function addPlacement(tx, ty){
    if(app.mode === 'campaign') return null;   // campaign maps: edit existing placements (move/erase/props) + paint; no add-new in v1
    let item, kind;
    const w = Math.max(1, num('newW', 3) | 0), h = Math.max(1, num('newH', 3) | 0);
    if(app.tool === 'mega'){
      kind = 'megaSprites';
      item = {
        id:uniqueId('mega', app.data.megaSprites), cat:els.megaCat.value,
        variant:clamp(num('megaVariant', 0) | 0, 0, 5), tx, ty, w, h,
        overhang:num('newOverhang', 1.3), heightScale:num('newHeightScale', 1),
        biome:els.biomePick.value, fixedFrame:null, seed:Math.random(), tags:[]
      };
    } else if(app.tool === 'building'){
      kind = 'buildings';
      item = {id:uniqueId(els.buildingType.value, app.data.buildings), type:els.buildingType.value, owner:'neutral', tx, ty, w, h, visual:null};
    } else if(app.tool === 'poi'){
      kind = 'pois';
      const type = els.buildingType.value, poiKind = (type === 'condo' || type === 'mdc' || type === 'ultra') ? type : 'poi';
      item = {id:uniqueId(poiKind, app.data.pois), kind:poiKind, name:poiKind.toUpperCase(), type, x:tx, y:ty, w, h, visual:null};
    } else {
      kind = 'topography';
      item = {
        id:uniqueId(els.topoSlot.value, app.data.topography), slot:els.topoSlot.value,
        tx, ty, w, h, biome:els.biomePick.value, v:0.35,
        overhang:num('newOverhang', 1.08), heightScale:num('newHeightScale', 1)
      };
    }
    app.data[kind].push(item);
    app.selected = {kind, index:app.data[kind].length - 1};
    refreshAll();
    schedulePreviewRebuild(0);
    status('Placed '+kind);
    return app.selected;
  }
  function uniqueId(base, arr){
    const stem = String(base || 'item').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
    const used = new Set(arr.map(o=>o.id));
    let i = 1, id = stem+'_'+i;
    while(used.has(id)) id = stem+'_'+(++i);
    return id;
  }

  function renderProperties(force){
    if(force == null) force = true;
    const sel = selectedObject();
    if(force) els.props.innerHTML = '';
    if(!sel){
      els.summary.textContent = 'Nothing selected';
      return;
    }
    els.summary.textContent = sel.kind+' #'+sel.index+' / '+(sel.item.id || sel.item.name || 'unnamed');
    if(!force) return;
    fieldsFor(sel).forEach(f=>addProp(sel, f));
    validate();
  }
  function fieldsFor(sel){
    if(app.mode === 'campaign'){
      switch(sel.kind){
        case 'scenery':   return [['type','text'], ['x','number'], ['y','number']];
        case 'enemies':   return [['x','number'], ['y','number'], ['defenders','number'], ['extraBarracks','text'], ['light','text']];
        case 'goldNodes': return [['x','number'], ['y','number'], ['amt','number']];
        case 'lakes':     return [['x','number'], ['y','number'], ['r','number']];
        case 'rockClusters': case 'forests': return [['x','number'], ['y','number'], ['n','number']];
        case 'thickets':  return [['x','number'], ['y','number'], ['w','number'], ['h','number'], ['density','number'], ['mix','number'], ['trail','text']];
        case 'guards':    return [['x','number'], ['y','number'], ['n','number'], ['type','text']];
        case 'captives':  return [['x','number'], ['y','number'], ['type','text'], ['hero','text'], ['name','text']];
        case 'villain':   return [['id','text'], ['x','number'], ['y','number'], ['after','text']];
        case 'player':    return [['x','number'], ['y','number']];
        default:          return [['x','number'], ['y','number']];   // lostBases
      }
    }
    if(sel.kind === 'megaSprites') return [
      ['id','text'], ['poiId','text'], ['cat','select',HUB_MAP_MEGA_CATS], ['variant','number'],
      ['tx','number'], ['ty','number'], ['w','number'], ['h','number'],
      ['overhang','number'], ['heightScale','number'], ['biome','select',HUB_MAP_BIOMES],
      ['fixedFrame','number'], ['tags','text']
    ];
    if(sel.kind === 'topography') return [
      ['id','text'], ['slot','select',HUB_MAP_TOPO_SLOTS], ['tx','number'], ['ty','number'],
      ['w','number'], ['h','number'], ['biome','select',HUB_MAP_BIOMES], ['v','number'],
      ['overhang','number'], ['heightScale','number']
    ];
    if(sel.kind === 'buildings') return [
      ['id','text'], ['poiId','text'], ['type','select',HUB_MAP_BUILDING_TYPES], ['owner','select',['neutral','player','enemy']],
      ['tx','number'], ['ty','number'], ['w','number'], ['h','number']
    ];
    if(sel.kind === 'bridges') return [
      ['id','text'], ['x','number'], ['y','number'], ['w','number'], ['h','number']
    ];
    return [
      ['id','text'], ['kind','text'], ['name','text'], ['type','select',HUB_MAP_BUILDING_TYPES],
      ['x','number'], ['y','number'], ['w','number'], ['h','number']
    ];
  }
  function addProp(sel, spec){
    const key = spec[0], type = spec[1], options = spec[2];
    const label = document.createElement('label');
    label.textContent = key;
    let input;
    if(type === 'select'){
      input = document.createElement('select');
      options.forEach(v=>{
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        input.appendChild(o);
      });
      input.value = sel.item[key] || options[0];
    } else {
      input = document.createElement('input');
      input.type = type;
      if(type === 'number') input.step = (key === 'overhang' || key === 'heightScale' || key === 'v') ? '0.01' : '1';
      input.value = Array.isArray(sel.item[key]) ? sel.item[key].join(',') : (sel.item[key] == null ? '' : sel.item[key]);
    }
    input.addEventListener('input', ()=>{
      if(key === 'tags') sel.item[key] = input.value.split(',').map(s=>s.trim()).filter(Boolean);
      else if(type === 'number') sel.item[key] = input.value === '' ? null : Number(input.value);
      else sel.item[key] = input.value;
      validate();
      schedulePreviewRebuild(70);
    });
    label.appendChild(input);
    els.props.appendChild(label);
  }
  function duplicateSelection(){
    const sel = selectedObject();
    if(!sel) return;
    if(app.mode === 'campaign'){
      if((CAMP_KINDS[sel.kind]||{}).single){ status('Cannot duplicate '+sel.kind); return; }
      const arr = campArr(sel.kind), copy = clone(sel.item);
      copy.x = (copy.x||0) + 1; copy.y = (copy.y||0) + 1;
      arr.push(copy);
      app.selected = {kind:sel.kind, index:arr.length - 1};
      refreshAll(); schedulePreviewRebuild(0); status('Duplicated '+sel.kind);
      return;
    }
    const copy = clone(sel.item);
    copy.id = uniqueId((copy.id || sel.kind)+'_copy', app.data[sel.kind]);
    if(sel.kind === 'pois' && copy.visual && copy.visual.megaId) copy.visual = null;
    const pos = tilePos({kind:sel.kind, item:copy});
    setTilePos({kind:sel.kind, item:copy}, pos.x + 1, pos.y + 1);
    app.data[sel.kind].push(copy);
    app.selected = {kind:sel.kind, index:app.data[sel.kind].length - 1};
    refreshAll();
    schedulePreviewRebuild(0);
    status('Duplicated selection');
  }
  function deleteSelection(){
    if(!app.selected) return;
    if(app.mode === 'campaign' && (CAMP_KINDS[app.selected.kind]||{}).single){ status('Cannot delete '+app.selected.kind); return; }
    const arr = arrFor(app.selected.kind);
    if(arr && arr[app.selected.index]) arr.splice(app.selected.index, 1);
    app.selected = null;
    refreshAll();
    schedulePreviewRebuild(0);
  }
  function keydown(e){
    if(e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    const panKeys = {ArrowLeft:[1,0], ArrowRight:[-1,0], ArrowUp:[0,1], ArrowDown:[0,-1]};
    if(panKeys[e.key]){
      e.preventDefault();
      const step = (e.shiftKey ? 14 : 5) * TILE * app.view.z;
      app.view.x += panKeys[e.key][0] * step;
      app.view.y += panKeys[e.key][1] * step;
      syncPreviewCamera();
      status('View panned');
      return;
    }
    if(e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
    else if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd'){ e.preventDefault(); duplicateSelection(); }
    else if(e.key === 'Escape'){ app.selected = null; renderProperties(); status('Selection cleared'); }
  }

  // ---- campaign persistence: splice ONLY MAPS[idx] in js/maps_data.js (comment-safe) and write back ----
  function campaignMapObject(){
    const obj = clone(app.campaign.cfg), enc = paintEncoded();
    if(enc) obj.paint = enc; else delete obj.paint;
    return obj;
  }
  function serializeMapObject(obj){
    // JSON is valid JS and SAFE for map data (no functions/undefined/NaN; apostrophes, \n, {?party} braces
    // all escape correctly). Re-indent so the spliced block lines up at the array's 2-space element column.
    return JSON.stringify(obj, null, 2).split('\n').map((ln,i)=> i === 0 ? ln : '  '+ln).join('\n');
  }
  // Find `const MAPS = [ … ]` and the source span of every top-level object element, skipping strings
  // ('…',"…",`…`) and comments (//, /* */) so braces inside crawl text/comments never miscount.
  function locateMapsArray(text){
    const m = /(^|\n)\s*const\s+MAPS\s*=\s*\[/.exec(text);
    if(!m) return null;
    const open = m.index + m[0].length - 1;          // index of '['
    let depth = 0, mode = 'code', close = -1; const starts = [], commas = [];
    for(let i = open + 1; i < text.length; i++){
      const c = text[i], n = text[i+1];
      if(mode === 'sq'){ if(c === '\\') i++; else if(c === "'") mode = 'code'; continue; }
      if(mode === 'dq'){ if(c === '\\') i++; else if(c === '"') mode = 'code'; continue; }
      if(mode === 'tpl'){ if(c === '\\') i++; else if(c === '`') mode = 'code'; continue; }
      if(mode === 'line'){ if(c === '\n') mode = 'code'; continue; }
      if(mode === 'block'){ if(c === '*' && n === '/'){ i++; mode = 'code'; } continue; }
      if(c === "'"){ mode = 'sq'; continue; }
      if(c === '"'){ mode = 'dq'; continue; }
      if(c === '`'){ mode = 'tpl'; continue; }
      if(c === '/' && n === '/'){ i++; mode = 'line'; continue; }
      if(c === '/' && n === '*'){ i++; mode = 'block'; continue; }
      if(c === '{' || c === '['){ if(depth === 0 && c === '{') starts.push(i); depth++; continue; }
      if(c === '}' || c === ']'){ if(depth === 0 && c === ']'){ close = i; break; } depth--; continue; }
      if(c === ',' && depth === 0) commas.push(i);
    }
    if(close < 0) return null;
    const spans = starts.map(s=>{ let end = close; for(const cm of commas){ if(cm > s){ end = cm; break; } } return {start:s, end}; });
    return {open, close, spans};
  }
  async function saveCampaignMapsData(){
    const idx = app.mapIdx, obj = campaignMapObject(), serialized = serializeMapObject(obj);
    const bail = (msg)=>{ download('MAPS_'+idx+'.txt', serialized+'\n', 'text/plain'); status(msg+' — downloaded MAPS['+idx+'] to paste manually'); };
    let handle = app._mapsFileHandle, text = null;
    try{
      if(!handle && window.showOpenFilePicker){
        const picked = await window.showOpenFilePicker({types:[{description:'JavaScript', accept:{'text/javascript':['.js']}}]});
        handle = app._mapsFileHandle = picked[0];
      }
      if(handle){ text = await (await handle.getFile()).text(); }
    } catch(err){ if(err && err.name === 'AbortError'){ status('Save cancelled'); return; } }
    if(text == null){ bail('No file access (pick js/maps_data.js)'); return; }
    const loc = locateMapsArray(text);
    if(!loc || !loc.spans[idx]){ bail('Could not locate MAPS['+idx+']'); return; }
    const before = loc.spans.length, sp = loc.spans[idx];
    const out = text.slice(0, sp.start) + serialized + text.slice(sp.end);   // keep the original trailing comma at sp.end
    const loc2 = locateMapsArray(out);
    if(!loc2 || loc2.spans.length !== before){ bail('Splice changed element count'); return; }
    let parsed = null;
    try{ parsed = new Function('return ('+out.slice(loc2.open, loc2.close + 1)+')')(); } catch(e){ parsed = null; }
    if(!parsed || parsed.length !== before || !parsed[idx] || parsed[idx].name !== obj.name){ bail('Spliced array failed to re-parse'); return; }
    try{
      const w = await handle.createWritable(); await w.write(out); await w.close();
      status('Wrote MAPS['+idx+'] ('+obj.name+') to js/maps_data.js'+(obj.paint ? ' (with paint)' : ''));
    } catch(err){ download('maps_data.js', out, 'text/javascript'); status('Write failed; downloaded full maps_data.js'); }
  }

  function exportJson(){
    if(app.mode === 'campaign'){ download('MAPS_'+app.mapIdx+'.json', JSON.stringify(campaignMapObject(), null, 2)+'\n', 'application/json'); status('Exported MAPS['+app.mapIdx+']'); return; }
    const data = hubNormalizeMapData(app.data);
    download('hub-map-data.json', JSON.stringify(data, null, 2)+'\n', 'application/json');
    status('Exported JSON');
  }
  async function copyJson(){
    const text = app.mode === 'campaign' ? serializeMapObject(campaignMapObject()) : JSON.stringify(hubNormalizeMapData(app.data), null, 2);
    try{
      await navigator.clipboard.writeText(text);
      status('Copied '+(app.mode === 'campaign' ? 'MAPS['+app.mapIdx+']' : 'JSON'));
    } catch(err){
      download(app.mode === 'campaign' ? 'MAPS_'+app.mapIdx+'.txt' : 'hub-map-data.json', text+'\n', 'application/json');
      status('Clipboard unavailable; downloaded');
    }
  }
  async function replaceJs(){
    if(app.mode === 'campaign'){ await saveCampaignMapsData(); return; }
    const js = hubMapDataToJs(app.data);
    if(window.showSaveFilePicker){
      try{
        const handle = await window.showSaveFilePicker({
          suggestedName:'hub_map_data.js',
          types:[{description:'JavaScript', accept:{'text/javascript':['.js']}}]
        });
        const writable = await handle.createWritable();
        await writable.write(js);
        await writable.close();
        status('Wrote hub_map_data.js');
        return;
      } catch(err){
        if(err && err.name === 'AbortError'){ status('Replace cancelled'); return; }
      }
    }
    download('hub_map_data.js', js, 'text/javascript');
    status('Downloaded hub_map_data.js');
  }
  function download(name, text, type){
    const blob = new Blob([text], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  async function importFile(){
    const file = els.importFile.files && els.importFile.files[0];
    if(!file) return;
    try{
      const text = await file.text();
      const raw = hubExtractMapData(text);
      app.data = hubNormalizeMapData(raw);
      app.selected = null;
      refreshAll();
      schedulePreviewRebuild(0);
      status('Imported '+file.name);
    } catch(err){
      status('Import failed: '+err.message);
    } finally {
      els.importFile.value = '';
    }
  }

  // dev debug handle (also handy for scripting/automation): expose the editor internals.
  window.MAPEDIT = {
    app, loadCampaign, loadHub, paintAt, rebuildPreview, validate,
    campaignMapObject, serializeMapObject, locateMapsArray, saveCampaignMapsData, hitTest, collections
  };

  init();
})();
