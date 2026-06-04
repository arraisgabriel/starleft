/* hub-map-editor.js - standalone developer editor for HUB_MAP_DATA.
   The preview is derived from the real HUB map builder and render() pipeline. */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('cv');
  const overlay = canvas.getContext('2d');
  const els = {
    status:$('statusLine'), validation:$('validationList'), summary:$('selectionSummary'), props:$('propertyEditor'),
    importFile:$('importFile'), megaCat:$('megaCat'), megaVariant:$('megaVariant'), buildingType:$('buildingType'),
    topoSlot:$('topoSlot'), biomePick:$('biomePick'), newW:$('newW'), newH:$('newH'), newOverhang:$('newOverhang'),
    newHeightScale:$('newHeightScale'), mapW:$('mapW'), mapH:$('mapH')
  };

  const app = {
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
    if(o.kind === 'pois') return {x:o.item.x, y:o.item.y};
    if(o.kind === 'bridges') return {x:o.item.x, y:o.item.y};
    return {x:o.item.tx, y:o.item.ty};
  }
  function setTilePos(o, x, y){
    if(o.kind === 'pois'){ o.item.x = x; o.item.y = y; }
    else if(o.kind === 'bridges'){ o.item.x = x; o.item.y = y; }
    else { o.item.tx = x; o.item.ty = y; }
  }
  function itemRect(o){
    const it = o.item;
    const w = Math.max(1, it.w || 1), h = Math.max(1, it.h || 1);
    if(o.kind === 'bridges') return {x:Math.round((it.x || 0) - w/2), y:Math.round((it.y || 0) - h/2), w, h};
    const p = tilePos(o);
    return {x:p.x, y:p.y, w, h};
  }
  function collections(){
    return [
      ['bridges', app.data.bridges],
      ['topography', app.data.topography],
      ['megaSprites', app.data.megaSprites],
      ['buildings', app.data.buildings],
      ['pois', app.data.pois]
    ];
  }
  function selectedObject(){
    if(!app.selected) return null;
    const arr = app.data[app.selected.kind];
    if(!arr || !arr[app.selected.index]) return null;
    return {kind:app.selected.kind, index:app.selected.index, item:arr[app.selected.index]};
  }

  function init(){
    fillSelect(els.megaCat, HUB_MAP_MEGA_CATS);
    fillSelect(els.buildingType, HUB_MAP_BUILDING_TYPES);
    fillSelect(els.topoSlot, HUB_MAP_TOPO_SLOTS);
    fillSelect(els.biomePick, HUB_MAP_BIOMES);
    bindEvents();
    resizeEditorCanvas();
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
    els.mapW.value = app.data.W;
    els.mapH.value = app.data.H;
    renderProperties();
    validate();
  }
  function validate(){
    const result = hubValidateMapData(app.data);
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
      app.preview = hubBuildPreviewMap(app.data);
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
    for(let x=0; x<=app.data.W; x++){ overlay.moveTo(x*TILE, 0); overlay.lineTo(x*TILE, app.data.H*TILE); }
    for(let y=0; y<=app.data.H; y++){ overlay.moveTo(0, y*TILE); overlay.lineTo(app.data.W*TILE, y*TILE); }
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
    const w = screenToWorld(e);
    const tx = Math.round(w.x / TILE - app.drag.ox);
    const ty = Math.round(w.y / TILE - app.drag.oy);
    const obj = {kind:app.drag.kind, index:app.drag.index, item:app.data[app.drag.kind][app.drag.index]};
    setTilePos(obj, tx, ty);
    renderProperties(false);
    validate();
    schedulePreviewRebuild(55);
  }
  function pointerUp(){
    if(app.drag && app.drag.mode === 'move'){
      renderProperties();
      schedulePreviewRebuild(0);
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
    const arr = app.data[app.selected.kind];
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

  function exportJson(){
    const data = hubNormalizeMapData(app.data);
    download('hub-map-data.json', JSON.stringify(data, null, 2)+'\n', 'application/json');
    status('Exported JSON');
  }
  async function copyJson(){
    const text = JSON.stringify(hubNormalizeMapData(app.data), null, 2);
    try{
      await navigator.clipboard.writeText(text);
      status('Copied JSON');
    } catch(err){
      download('hub-map-data.json', text+'\n', 'application/json');
      status('Clipboard unavailable; downloaded JSON');
    }
  }
  async function replaceJs(){
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

  init();
})();
