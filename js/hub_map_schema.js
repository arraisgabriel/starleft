/* hub_map_schema.js - shared HUB map editor data helpers.
   Pure classic-script globals: no DOM/game-loop dependencies. */
(function(root){
  'use strict';

  const HUB_MAP_BIOMES = ['grass','mountain','water','tech','desert','ice','volcanic'];
  const HUB_MAP_MEGA_CATS = ['megabuilding','mountain','volcano','ruin'];
  const HUB_MAP_TOPO_SLOTS = ['tree','rock'];
  const HUB_MAP_BUILDING_TYPES = ['hq','barracks','turret','outpost','condo','mdc','ultra','garage','launchpad'];
  const HUB_MAP_ALLOWED = {
    root:['version','W','H','player','wasteland','pois','rivers','bridges','megaSprites','buildings','topography','terrainPaint'],
    poi:['id','kind','name','type','x','y','w','h','visual'],
    river:['id','width','points'],
    bridge:['id','x','y','w','h'],
    mega:['id','poiId','cat','variant','tx','ty','w','h','overhang','heightScale','biome','fixedFrame','seed','tags'],
    building:['id','poiId','type','owner','tx','ty','w','h','visual'],
    topo:['id','slot','tx','ty','w','h','biome','v','overhang','heightScale'],
  };

  const HUB_MAP_DEFAULTS = {
    version:1,
    W:124,
    H:102,
    player:{x:60,y:58},
    wasteland:{x0:66,y0:68,x1:123,y1:101},
    pois:[
      {id:'condo_nw', kind:'condo', name:'Northwest Condo Suburb', type:'condo', x:12, y:14, w:5, h:4, visual:{megaId:'condo_nw_mega'}},
      {id:'condo_ne', kind:'condo', name:'Northeast Condo Suburb', type:'condo', x:103, y:14, w:5, h:4, visual:{megaId:'condo_ne_mega'}},
      {id:'condo_sw', kind:'condo', name:'Southwest Condo Suburb', type:'condo', x:13, y:82, w:5, h:4, visual:{megaId:'condo_sw_mega'}},
      {id:'mdc_nw', kind:'mdc', name:'M.D.C. North-West', type:'mdc', x:27, y:22, w:3, h:3, visual:{type:'barracks', faction:'enemy', neonId:'barracks_enemy', fixedFrame:0, w:5, h:5, overhang:1.08, heightScale:1}},
      {id:'mdc_ne', kind:'mdc', name:'M.D.C. North-East', type:'mdc', x:91, y:23, w:3, h:3, visual:{type:'barracks', faction:'enemy', neonId:'barracks_enemy', fixedFrame:2, w:5, h:5, overhang:1.08, heightScale:1}},
      {id:'mdc_sw', kind:'mdc', name:'M.D.C. South-West', type:'mdc', x:28, y:75, w:3, h:3, visual:{type:'barracks', faction:'enemy', neonId:'barracks_enemy', fixedFrame:4, w:5, h:5, overhang:1.08, heightScale:1}},
      {id:'mdc_ultra', kind:'mdc', name:'M.D.C. Downtown', type:'mdc', x:60, y:63, w:3, h:3, visual:{type:'barracks', faction:'enemy', neonId:'barracks_enemy', fixedFrame:0, w:5, h:5, overhang:1.08, heightScale:1}},
      {id:'ultra', kind:'ultra', name:'ULTRA Headquarters', type:'ultra', x:58, y:42, w:8, h:8, visual:{megaId:'ultra_mega'}},
    ],
    rivers:[
      {id:'north', width:2.1, points:[{x:-3,y:24},{x:14,y:21},{x:31,y:18},{x:46,y:27},{x:64,y:30},{x:83,y:22},{x:104,y:18},{x:127,y:17}]},
      {id:'south', width:2.3, points:[{x:6,y:105},{x:18,y:92},{x:21,y:83},{x:22,y:75},{x:36,y:68},{x:51,y:63},{x:64,y:60},{x:78,y:56},{x:94,y:51},{x:127,y:52}]},
      {id:'west_tributary', width:1.5, points:[{x:-3,y:51},{x:15,y:50},{x:31,y:55},{x:45,y:52},{x:47,y:45},{x:50,y:38},{x:56,y:33},{x:64,y:30}]},
    ],
    bridges:[
      {id:'condo_nw_bridge', x:14, y:21, w:5, h:7},
      {id:'mdc_nw_bridge', x:33, y:19, w:5, h:8},
      {id:'tributary_bridge', x:50, y:38, w:6, h:6},
      {id:'condo_ne_bridge', x:103, y:20, w:5, h:7},
      {id:'southwest_bridge', x:22, y:82, w:8, h:5},
      {id:'southwest_bend_bridge', x:38, y:68, w:7, h:5},
      {id:'downtown_bridge', x:63, y:59, w:5, h:7},
      {id:'east_crossing_bridge', x:94, y:51, w:5, h:7},
    ],
    megaSprites:[
      {id:'condo_nw_mega', poiId:'condo_nw', cat:'megabuilding', variant:2, tx:7, ty:6, w:15, h:12, overhang:1.18, heightScale:0.94, biome:'tech', fixedFrame:0, seed:0.113, tags:['hubCondo','neon']},
      {id:'condo_ne_mega', poiId:'condo_ne', cat:'megabuilding', variant:2, tx:98, ty:6, w:15, h:12, overhang:1.18, heightScale:0.94, biome:'tech', fixedFrame:2, seed:0.226, tags:['hubCondo','neon']},
      {id:'condo_sw_mega', poiId:'condo_sw', cat:'megabuilding', variant:2, tx:8, ty:74, w:15, h:12, overhang:1.18, heightScale:0.94, biome:'tech', fixedFrame:4, seed:0.339, tags:['hubCondo','neon']},
      {id:'ultra_mega', poiId:'ultra', cat:'megabuilding', variant:3, tx:53, ty:30, w:14, h:12, overhang:1.22, heightScale:1.14, biome:'tech', fixedFrame:0, seed:0.17, tags:['hubUltra','neon']},
      {id:'waste_ruin_1', cat:'ruin', variant:0, tx:80, ty:71, w:11, h:9, overhang:1.45, heightScale:1, biome:'desert', fixedFrame:0, seed:0.8, tags:['hubWaste']},
      {id:'waste_ruin_2', cat:'ruin', variant:1, tx:111, ty:70, w:11, h:9, overhang:1.45, heightScale:1, biome:'desert', fixedFrame:0, seed:1.11, tags:['hubWaste']},
      {id:'waste_ruin_3', cat:'ruin', variant:0, tx:101, ty:91, w:11, h:9, overhang:1.45, heightScale:1, biome:'desert', fixedFrame:0, seed:1.01, tags:['hubWaste']},
      {id:'waste_ruin_4', cat:'ruin', variant:4, tx:72, ty:92, w:11, h:9, overhang:1.45, heightScale:1, biome:'desert', fixedFrame:7, seed:0.72, tags:['hubWaste']},
    ],
    buildings:[],
    topography:[],
    terrainPaint:[],
  };

  function hubClone(v){ return JSON.parse(JSON.stringify(v)); }
  function hubNum(v, fallback, min, max){
    const n = Number(v);
    if(!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }
  function hubInt(v, fallback, min, max){ return Math.round(hubNum(v, fallback, min, max)); }
  function hubText(v, fallback){ return (typeof v === 'string' && v) ? v : fallback; }
  function hubOneOf(v, allowed, fallback){ return allowed.indexOf(v) >= 0 ? v : fallback; }
  function hubTags(v){ return Array.isArray(v) ? v.filter(t=>typeof t==='string') : []; }
  function hubCopyKnown(src, keys){
    const out = {};
    if(!src || typeof src !== 'object') return out;
    keys.forEach(k=>{ if(src[k] != null) out[k] = hubClone(src[k]); });
    return out;
  }
  function hubPoint(p, fallback){
    p = p && typeof p === 'object' ? p : {};
    fallback = fallback || {x:0,y:0};
    return {x:hubNum(p.x, fallback.x, -999, 999), y:hubNum(p.y, fallback.y, -999, 999)};
  }

  function normalizePoi(p, fallback, idx, W, H){
    const f = fallback || {};
    const out = hubCopyKnown(f, HUB_MAP_ALLOWED.poi);
    p = p && typeof p === 'object' ? p : {};
    Object.assign(out, hubCopyKnown(p, HUB_MAP_ALLOWED.poi));
    out.id = hubText(out.id, 'poi_'+idx);
    out.kind = hubText(out.kind, f.kind || 'poi');
    out.name = hubText(out.name, f.name || out.id);
    out.type = hubOneOf(out.type, HUB_MAP_BUILDING_TYPES, f.type || (out.kind === 'condo' ? 'condo' : out.kind === 'mdc' ? 'mdc' : out.kind === 'ultra' ? 'ultra' : 'outpost'));
    out.x = hubInt(out.x, f.x || 0, 0, W-1);
    out.y = hubInt(out.y, f.y || 0, 0, H-1);
    out.w = hubInt(out.w, f.w || 3, 1, W);
    out.h = hubInt(out.h, f.h || 3, 1, H);
    out.visual = out.visual && typeof out.visual === 'object' ? out.visual : null;
    return out;
  }
  function normalizeRiver(r, fallback, idx){
    const f = fallback || {};
    r = r && typeof r === 'object' ? r : {};
    return {
      id:hubText(r.id, f.id || 'river_'+idx),
      width:hubNum(r.width, f.width || 2, 0.25, 12),
      points:(Array.isArray(r.points) ? r.points : (f.points || [])).map((p,i)=>hubPoint(p, (f.points && f.points[i]) || {x:0,y:0})),
    };
  }
  function normalizeRect(o, fallback, idx, W, H, prefix){
    const f = fallback || {};
    o = o && typeof o === 'object' ? o : {};
    return {
      id:hubText(o.id, f.id || prefix+'_'+idx),
      x:hubInt(o.x, f.x || 0, -32, W+32),
      y:hubInt(o.y, f.y || 0, -32, H+32),
      w:hubInt(o.w, f.w || 1, 1, W),
      h:hubInt(o.h, f.h || 1, 1, H),
    };
  }
  function normalizeMega(m, fallback, idx, W, H){
    const f = fallback || {};
    m = m && typeof m === 'object' ? m : {};
    return {
      id:hubText(m.id, f.id || 'mega_'+idx),
      poiId:typeof m.poiId === 'string' ? m.poiId : (typeof f.poiId === 'string' ? f.poiId : null),
      cat:hubOneOf(m.cat, HUB_MAP_MEGA_CATS, f.cat || 'megabuilding'),
      variant:hubInt(m.variant, f.variant || 0, 0, 5),
      tx:hubInt(m.tx, f.tx || 0, -32, W+32),
      ty:hubInt(m.ty, f.ty || 0, -32, H+32),
      w:hubInt(m.w, f.w || 6, 1, W),
      h:hubInt(m.h, f.h || 5, 1, H),
      overhang:hubNum(m.overhang, f.overhang || 1.3, 0.25, 5),
      heightScale:hubNum(m.heightScale, f.heightScale || 1, 0.25, 5),
      biome:hubOneOf(m.biome, HUB_MAP_BIOMES, f.biome || 'grass'),
      fixedFrame:m.fixedFrame == null ? (f.fixedFrame == null ? null : hubInt(f.fixedFrame, 0, 0, 99)) : hubInt(m.fixedFrame, 0, 0, 99),
      seed:hubNum(m.seed, f.seed == null ? idx * 0.173 : f.seed, -9999, 9999),
      tags:hubTags(m.tags != null ? m.tags : f.tags),
    };
  }
  function normalizeBuilding(b, fallback, idx, W, H){
    const f = fallback || {};
    b = b && typeof b === 'object' ? b : {};
    return {
      id:hubText(b.id, f.id || 'building_'+idx),
      poiId:typeof b.poiId === 'string' ? b.poiId : (typeof f.poiId === 'string' ? f.poiId : null),
      type:hubOneOf(b.type, HUB_MAP_BUILDING_TYPES, f.type || 'outpost'),
      owner:hubOneOf(b.owner, ['neutral','player','enemy'], f.owner || 'neutral'),
      tx:hubInt(b.tx, f.tx || 0, -32, W+32),
      ty:hubInt(b.ty, f.ty || 0, -32, H+32),
      w:hubInt(b.w, f.w || 3, 1, W),
      h:hubInt(b.h, f.h || 3, 1, H),
      visual:b.visual && typeof b.visual === 'object' ? hubClone(b.visual) : (f.visual ? hubClone(f.visual) : null),
    };
  }
  function normalizeTopo(t, fallback, idx, W, H){
    const f = fallback || {};
    t = t && typeof t === 'object' ? t : {};
    return {
      id:hubText(t.id, f.id || 'topography_'+idx),
      slot:hubOneOf(t.slot, HUB_MAP_TOPO_SLOTS, f.slot || 'tree'),
      tx:hubInt(t.tx, f.tx || 0, -32, W+32),
      ty:hubInt(t.ty, f.ty || 0, -32, H+32),
      w:hubInt(t.w, f.w || 3, 1, W),
      h:hubInt(t.h, f.h || 3, 1, H),
      biome:hubOneOf(t.biome, HUB_MAP_BIOMES, f.biome || 'grass'),
      v:hubNum(t.v, f.v == null ? 0.35 : f.v, 0, 1),
      overhang:hubNum(t.overhang, f.overhang || 1.08, 0.25, 5),
      heightScale:hubNum(t.heightScale, f.heightScale || 1, 0.25, 5),
    };
  }

  function hubNormalizeMapData(input){
    const base = hubClone(HUB_MAP_DEFAULTS);
    const src = input && typeof input === 'object' ? input : {};
    const W = hubInt(src.W, base.W, 16, 256);
    const H = hubInt(src.H, base.H, 16, 256);
    const out = {
      version:hubInt(src.version, 1, 1, 999),
      W,
      H,
      player:hubPoint(src.player, base.player),
      wasteland:Object.assign({}, base.wasteland, src.wasteland && typeof src.wasteland === 'object' ? src.wasteland : {}),
      pois:[],
      rivers:[],
      bridges:[],
      megaSprites:[],
      buildings:[],
      topography:[],
      terrainPaint:Array.isArray(src.terrainPaint) ? hubClone(src.terrainPaint) : [],
    };
    out.wasteland.x0 = hubInt(out.wasteland.x0, base.wasteland.x0, 0, W-1);
    out.wasteland.y0 = hubInt(out.wasteland.y0, base.wasteland.y0, 0, H-1);
    out.wasteland.x1 = hubInt(out.wasteland.x1, base.wasteland.x1, out.wasteland.x0, W-1);
    out.wasteland.y1 = hubInt(out.wasteland.y1, base.wasteland.y1, out.wasteland.y0, H-1);
    out.pois = (Array.isArray(src.pois) ? src.pois : base.pois).map((p,i)=>normalizePoi(p, base.pois[i], i, W, H));
    out.rivers = (Array.isArray(src.rivers) ? src.rivers : base.rivers).map((r,i)=>normalizeRiver(r, base.rivers[i], i));
    out.bridges = (Array.isArray(src.bridges) ? src.bridges : base.bridges).map((b,i)=>normalizeRect(b, base.bridges[i], i, W, H, 'bridge'));
    out.megaSprites = (Array.isArray(src.megaSprites) ? src.megaSprites : base.megaSprites).map((m,i)=>normalizeMega(m, base.megaSprites[i], i, W, H));
    out.buildings = (Array.isArray(src.buildings) ? src.buildings : base.buildings).map((b,i)=>normalizeBuilding(b, base.buildings[i], i, W, H));
    out.topography = (Array.isArray(src.topography) ? src.topography : base.topography).map((t,i)=>normalizeTopo(t, base.topography[i], i, W, H));
    return out;
  }

  function hubUnknownKeys(obj, allowed){
    if(!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).filter(k=>allowed.indexOf(k) < 0);
  }
  function hubRect(o, xKey, yKey){ return {id:o.id, x:o[xKey], y:o[yKey], w:o.w || 1, h:o.h || 1}; }
  function hubOverlap(a, b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }
  function hubValidateMapData(input){
    const errors = [], warnings = [];
    const data = hubNormalizeMapData(input);
    const raw = input && typeof input === 'object' ? input : {};
    hubUnknownKeys(raw, HUB_MAP_ALLOWED.root).forEach(k=>warnings.push('Unknown root field: '+k));
    if(raw.version == null) warnings.push('Missing version; using v1 defaults.');
    const poiIds = new Set();
    data.pois.forEach((p,i)=>{
      const src=(raw.pois||[])[i] || {};
      hubUnknownKeys(src, HUB_MAP_ALLOWED.poi).forEach(k=>warnings.push('Unknown poi field '+p.id+'.'+k));
      if(src.type != null && HUB_MAP_BUILDING_TYPES.indexOf(src.type) < 0) warnings.push('Invalid POI type on '+p.id+': '+src.type);
      if(poiIds.has(p.id)) errors.push('Duplicate POI id: '+p.id);
      poiIds.add(p.id);
      if(p.x+p.w > data.W || p.y+p.h > data.H) warnings.push('POI out of bounds: '+p.id);
    });
    const megaIds = new Set();
    data.megaSprites.forEach((m,i)=>{
      const src=(raw.megaSprites||[])[i] || {};
      hubUnknownKeys(src, HUB_MAP_ALLOWED.mega).forEach(k=>warnings.push('Unknown megasprite field '+m.id+'.'+k));
      if(src.cat != null && HUB_MAP_MEGA_CATS.indexOf(src.cat) < 0) warnings.push('Invalid megasprite category on '+m.id+': '+src.cat);
      if(src.variant != null && (!Number.isFinite(+src.variant) || +src.variant < 0 || +src.variant > 5)) warnings.push('Invalid megasprite variant on '+m.id+': '+src.variant);
      if(src.biome != null && HUB_MAP_BIOMES.indexOf(src.biome) < 0) warnings.push('Invalid megasprite biome on '+m.id+': '+src.biome);
      if(megaIds.has(m.id)) errors.push('Duplicate megasprite id: '+m.id);
      megaIds.add(m.id);
      if(poiIds.size && m.poiId && !poiIds.has(m.poiId)) warnings.push('Megasprite '+m.id+' links to missing POI '+m.poiId);
      if(m.tx+m.w > data.W || m.ty+m.h > data.H || m.tx < 0 || m.ty < 0) warnings.push('Megasprite out of bounds: '+m.id);
    });
    data.pois.forEach(p=>{
      if(p.visual && p.visual.megaId && !megaIds.has(p.visual.megaId)) warnings.push('POI '+p.id+' links to missing megasprite '+p.visual.megaId);
    });
    const bridgeIds = new Set();
    data.bridges.forEach((b,i)=>{
      const src=(raw.bridges||[])[i] || {};
      hubUnknownKeys(src, HUB_MAP_ALLOWED.bridge).forEach(k=>warnings.push('Unknown bridge field '+b.id+'.'+k));
      if(bridgeIds.has(b.id)) errors.push('Duplicate bridge id: '+b.id);
      bridgeIds.add(b.id);
      if(b.x+b.w/2 < 0 || b.y+b.h/2 < 0 || b.x-b.w/2 > data.W || b.y-b.h/2 > data.H) warnings.push('Bridge out of bounds: '+b.id);
    });
    const buildingIds = new Set();
    data.buildings.forEach((b,i)=>{
      const src=(raw.buildings||[])[i] || {};
      hubUnknownKeys(src, HUB_MAP_ALLOWED.building).forEach(k=>warnings.push('Unknown building field '+b.id+'.'+k));
      if(src.type != null && HUB_MAP_BUILDING_TYPES.indexOf(src.type) < 0) warnings.push('Invalid building type on '+b.id+': '+src.type);
      if(buildingIds.has(b.id)) errors.push('Duplicate building id: '+b.id);
      buildingIds.add(b.id);
      if(b.poiId && !poiIds.has(b.poiId)) warnings.push('Building '+b.id+' links to missing POI '+b.poiId);
      if(b.tx+b.w > data.W || b.ty+b.h > data.H || b.tx < 0 || b.ty < 0) warnings.push('Building out of bounds: '+b.id);
    });
    const topoIds = new Set();
    data.topography.forEach((t,i)=>{
      const src=(raw.topography||[])[i] || {};
      hubUnknownKeys(src, HUB_MAP_ALLOWED.topo).forEach(k=>warnings.push('Unknown topography field '+t.id+'.'+k));
      if(src.slot != null && HUB_MAP_TOPO_SLOTS.indexOf(src.slot) < 0) warnings.push('Invalid topography slot on '+t.id+': '+src.slot);
      if(src.biome != null && HUB_MAP_BIOMES.indexOf(src.biome) < 0) warnings.push('Invalid topography biome on '+t.id+': '+src.biome);
      if(topoIds.has(t.id)) errors.push('Duplicate topography id: '+t.id);
      topoIds.add(t.id);
      if(t.tx+t.w > data.W || t.ty+t.h > data.H || t.tx < 0 || t.ty < 0) warnings.push('Topography out of bounds: '+t.id);
    });
    const solids = data.pois.map(p=>hubRect(p,'x','y')).concat(data.buildings.map(b=>hubRect(b,'tx','ty')));
    for(let i=0;i<solids.length;i++) for(let j=i+1;j<solids.length;j++){
      if(hubOverlap(solids[i], solids[j])) warnings.push('Footprint conflict: '+solids[i].id+' overlaps '+solids[j].id);
    }
    return {data, errors, warnings};
  }
  function hubMapDataToJs(data){
    return 'window.HUB_MAP_DATA = '+JSON.stringify(hubNormalizeMapData(data), null, 2)+';\n';
  }
  function hubExtractMapData(text){
    const src = String(text || '').trim();
    if(!src) throw new Error('Empty map data.');
    if(src[0] === '{') return JSON.parse(src);
    const match = src.match(/window\.HUB_MAP_DATA\s*=\s*([\s\S]*?);?\s*$/);
    if(!match) throw new Error('Expected JSON or window.HUB_MAP_DATA assignment.');
    return (new Function('return ('+match[1]+');'))();
  }

  root.HUB_MAP_BIOMES = HUB_MAP_BIOMES;
  root.HUB_MAP_MEGA_CATS = HUB_MAP_MEGA_CATS;
  root.HUB_MAP_TOPO_SLOTS = HUB_MAP_TOPO_SLOTS;
  root.HUB_MAP_BUILDING_TYPES = HUB_MAP_BUILDING_TYPES;
  root.HUB_MAP_DEFAULTS = HUB_MAP_DEFAULTS;
  root.hubClone = hubClone;
  root.hubNormalizeMapData = hubNormalizeMapData;
  root.hubValidateMapData = hubValidateMapData;
  root.hubMapDataToJs = hubMapDataToJs;
  root.hubExtractMapData = hubExtractMapData;
})(typeof window !== 'undefined' ? window : globalThis);
