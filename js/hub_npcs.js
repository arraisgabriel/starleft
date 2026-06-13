/* hub_npcs.js — living-city ambient NPCs for the H.U.B.: the persistent civilians from
   js/npc_lore.js (relatives, friends, facility staff, ULTRA commuters) walking real daily
   routines — sleep in their condo, commute, work shifts, errands, evening visits.

   Architecture (mirrors the hub_drones.js cosmetic contract, but ground-level + Y-sorted):
   - NPCs are NOT entities: no separation physics, no fog, no save bytes, no net sync. Each
     machine runs them locally; everything derives from (npc seed, city clock) so all peers
     and every reload agree. Pool is module-local, pre-allocated, never on G.
   - Schedules are CLOSED-FORM: at bind time each NPC compiles a fixed itinerary of day
     segments [t0,t1) (hidden / dwell / travel); "where is NPC X at clock C" is a pure
     lookup, so the city is mid-activity the instant the hub loads and pause/save/load are
     free. Per-frame cost per NPC is one segment-cursor compare.
   - Paths are SHARED: ~16 graph nodes (POI doorsteps, downtown plaza, 4 road gates), trunk
     legs plaza<->node A*'d lazily (<=1 findPath/frame) and cached; every route concatenates
     two trunk legs. NPCs are collision ghosts — roads + lateral jitter + sub-unit scale keep
     it honest; the depth sort layers them correctly against units/buildings.
   - Rendering: on-screen NPCs inject pre-allocated {y,n} entries into render.js's depth
     array (correct Y-occlusion). Sprites reuse existing unit walk sheets at ~70% scale with
     6 muted civilian tints (half-res sheets baked lazily, <=1/frame, hard cap); dark
     silhouette fallback while art streams; 2px dots below DOT_ZOOM. No glows, no bars.
   - Wardrobe (PERF.opts.npcMix): a session-stable set of MIX_K composed looks — head/
     torso/legs bands mixed from different human unit sheets via NPCMIX (npc_sprites.js),
     baked+tinted once each through the same lazy bake queue. Each NPC's seeded rng picks
     a wardrobe index (the draw is APPENDED after all existing draws, so flag-off behavior
     and itineraries stay byte-stable). Fallback ladder: mixed sheet → raw unit sheet →
     silhouette; a failed bake permanently falls back to the plain tinted path.
   - Degrades: PERF.opts.hubNpcs===false → off; QUAL.npcScale shrinks the active cap;
     megaReducedMotion() → no world NPCs (status/clock APIs keep working for the UI). */

(function(){
  'use strict';

  /* ---- tunables ---- */
  const CAP = 140;                 // hard structural cap (pool size)
  const DAY = 420;                 // real seconds per city day (~7 min)
  const HOUR = DAY/24;
  // Dot LOD retired (was: dots below zoom 0.5 / 0.7 degraded). Units render full sprites
  // at every zoom, and NPCs must never read differently — at strategic zoom the dots made
  // them look like insects next to unit sprites. Thresholds kept as knobs at 0 (= never);
  // QUAL still degrades by shrinking the active CAP, which bounds the extra blits.
  const DOT_ZOOM = 0;              // below this zoom: 2px dots instead of sprites (0 = never)
  const DOT_ZOOM_DEGRADED = 0;     // dot threshold when QUAL.level >= 2 (0 = never)
  const SPRITE_SCALE = 1.0;        // NPCs draw at full unit sprite height (was 0.7 — read as too small next to units)
  const ROAD_FACTOR = 1.35;        // euclid → road distance estimate for itinerary timing
  const TINT_ALPHA = 0.32;
  const TINT_CAP = 12;             // max baked half-res sheets (memory bound)
  const MIX_K = 24;                // wardrobe size: composed looks per session (memory bound: ≤24 extra sheets, ≈13.5MB; raised from 16 with the 20-sheet punk+civ part library)
  const MIX_SEED = 0x4D495853;     // 'MIXS' — fixed seed: same wardrobe every session/save (cosmetic only, never persisted)
  const NIGHT_MAX = 0.14;          // peak night-tint alpha
  // muted dark-cyberpunk civilian tints (slate / rust / olive / plum / dim teal / dust amber)
  const TINTS = ['#5c6b7a','#7a5648','#5d6b4e','#6b5570','#4e6b68','#7a6a4e'];
  const CIVILIAN_SPRITES = { relative:['worker','hustler','recruiter'], friend:['worker','hustler','recruiter'],
                             provider:['recruiter','worker'], ultra:['lobbyist'] };

  function _h32(n){ let h=((n|0)*2654435761) ^ 0x9e3779b9; h=Math.imul(h^(h>>>15),2246822519); return (h>>>0); }
  function _h01(n){ const s=Math.sin(n*12.9898)*43758.5453; return s-Math.floor(s); }

  /* ---- module state (never on G) ---- */
  let _lastState=null, _clock=0, _prevC=-1, _frozenC=null, _T0=0;
  let _slots=[], _bound=0;                  // bound slot objects (built per hub load)
  let _descById=new Map();                  // ALL descriptors (even unbound / reduced-motion)
  let _nodes={};                            // nodeId → {id, tx, ty, x, y, name}
  let _legs={};                             // nodeId → trunk leg plaza→node {pts,cum,len,ready,broken}
  let _legQueue=[];                         // nodeIds awaiting their A* (≤1/frame)
  let _routes=new Map();                    // 'a>b' → concatenated route {pts,cum,len,bx0..by1,broken}
  const _tinted={};                         // 'type|owner|tint' or 'mix|idx' → anim-like {img,fw,fh,frames,ready}
  let _tintCount=0;
  const _bakeQueue=[], _bakeQueued={};
  let _wardrobe=null, _mixCount=0;          // lazily built MIX_K looks; count of baked mix sheets
  const _mixBroken={};                      // 'mix|idx' → 1 after a failed bake (permanent plain fallback)
  const _du={ type:'worker', owner:'player', _face:1 };   // blitFrame scratch (zero per-frame alloc)

  function _reducedMotion(){
    if(typeof megaReducedMotion==='function') return megaReducedMotion();
    try{ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; }
  }
  function _featureOn(){ return !(typeof PERF!=='undefined' && PERF.opts && PERF.opts.hubNpcs===false); }
  function _mixOn(){
    return typeof NPCMIX!=='undefined' &&
           !(typeof PERF!=='undefined' && PERF.opts && PERF.opts.npcMix===false);
  }
  // The session wardrobe: MIX_K looks from a FIXED seed, so every session/save/peer
  // derives the identical set. Draw order here is frozen the same way the slot rng is —
  // append new draws only. With the Phase-2 civilian part library registered
  // (js/npc_parts_data.js), looks are {kind:'strip'} part trios; the Phase-1 unit-band
  // trio is still rolled FIRST (same draws, same order — flag-off/no-lib stays
  // byte-identical) and kept as `fallback` for when the part assets turn out broken/404.
  function _buildWardrobe(){
    if(_wardrobe) return _wardrobe;
    const D=NPCMIX.DONORS;
    const r=(typeof makeRng==='function')?makeRng(_h32(MIX_SEED)%233280):Math.random;
    _wardrobe=[];
    const pc=(typeof NPCMIX.partLibCounts==='function')?NPCMIX.partLibCounts():null;
    const lib=!!(pc && pc.head && pc.torso && pc.legs);
    for(let i=0;i<MIX_K;i++){
      const head=D[(r()*D.length)|0]; let torso=D[(r()*D.length)|0]; const legs=D[(r()*D.length)|0];
      if(head===torso && torso===legs) torso=D[(D.indexOf(torso)+1)%D.length];   // never a plain unit duplicate
      const owner=r()<0.5?'player':'enemy', tint=(r()*TINTS.length)|0;
      // single-sex looks, alternating by slot parity (8 f / 8 m, no extra draw): all three
      // parts come from same-sex sheets, and _bind maps each NPC's pick into the looks
      // matching its NPC_LORE gender — so dossier and body always agree.
      const sex=(i%2)?'m':'f';
      const ih=lib&&NPCMIX.partLibIdx('head',sex), it=lib&&NPCMIX.partLibIdx('torso',sex), il=lib&&NPCMIX.partLibIdx('legs',sex);
      if(lib && ih && it && il){                                // appended draws — only consumed when the lib exists
        const sh={kind:'strip',band:'head',idx:ih[(r()*ih.length)|0]},
              st={kind:'strip',band:'torso',idx:it[(r()*it.length)|0]},
              sl={kind:'strip',band:'legs',idx:il[(r()*il.length)|0]};
        // punk parts ship their own neon — the muted tint would dull them, so looks
        // containing ANY punk part bake untinted (full color punch; user-decided).
        const punk=(typeof NPCMIX.partLibStyleOf==='function') &&
                   [sh,st,sl].some(d=>NPCMIX.partLibStyleOf(d.band,d.idx)==='punk');
        _wardrobe.push({ sex, head:sh, torso:st, legs:sl,
                         owner, tint, tintAlpha:punk?0:TINT_ALPHA,
                         fallback:{head,torso,legs,owner,tint} });
      }else{
        _wardrobe.push({ head, torso, legs, owner, tint });
      }
    }
    return _wardrobe;
  }
  function _activeCap(){
    if(_reducedMotion()) return 0;
    const sc=(typeof QUAL!=='undefined' && QUAL.npcScale!=null)?QUAL.npcScale:1;
    return Math.min(_bound, Math.floor(CAP*sc));
  }

  /* ---- city clock ---- */
  function _cityC(){
    if(_frozenC!=null) return _frozenC;
    return ((_clock + _T0) % DAY + DAY) % DAY;
  }
  function clock(){
    const C=_cityC(), h=C/HOUR, hh=h|0, mm=((h-hh)*60)|0;
    const phase = (h<6||h>=20) ? 'night' : (h<8 ? 'dawn' : (h<18 ? 'day' : 'dusk'));
    return { h:hh, m:mm, phase, frac:C/DAY, C };
  }
  // 0 by day → NIGHT_MAX deep night, smooth ramps at dusk (18→20h) and dawn (5→7h)
  function nightAlpha(){
    const h=_cityC()/HOUR;
    let k=0;
    if(h>=20 || h<5) k=1;
    else if(h>=18) k=(h-18)/2;
    else if(h<7) k=1-(h-5)/2;
    return Math.max(0, Math.min(1, k))*NIGHT_MAX;
  }

  /* ---- path graph ---- */
  // first unblocked tile scanning the row(s) below a POI footprint — the building's "door"
  // shared with the road network so both terminate on the same door (def in hub.js)
  function _doorstep(state, e){ return hubDoorstep(state, e); }
  const GATES=[ {tx:14,ty:20}, {tx:105,ty:20}, {tx:15,ty:87}, {tx:116,ty:92} ];   // authored road ends (hub.js roads)
  function _buildGraph(state){
    _nodes={}; _legs={}; _legQueue.length=0; _routes.clear();
    const plaza={ id:'plaza', tx:62, ty:47 };
    plaza.x=(plaza.tx+0.5)*TILE; plaza.y=(plaza.ty+0.5)*TILE; plaza.name='the plaza';
    _nodes.plaza=plaza;
    const pois=state.hubPois||{};
    for(const k in pois){ const e=pois[k]; if(!e||e.dead||!e.hubPoi) continue;
      const d=_doorstep(state, e);
      _nodes['d:'+k]={ id:'d:'+k, tx:d.tx, ty:d.ty, x:(d.tx+0.5)*TILE, y:(d.ty+0.5)*TILE, name:e.hubPoi.name||k };
    }
    GATES.forEach((g,i)=>{ _nodes['g'+i]={ id:'g'+i, tx:g.tx, ty:g.ty, x:(g.tx+0.5)*TILE, y:(g.ty+0.5)*TILE, name:'the outer roads' }; });
    for(const id in _nodes){ if(id!=='plaza') _legQueue.push(id); }
  }
  function _computeLeg(state, nodeId){
    const n=_nodes[nodeId], p=_nodes.plaza;
    const path=(typeof findPath==='function') ? findPath(state, p.tx, p.ty, n.tx, n.ty) : null;
    const leg={ pts:null, cum:null, len:0, ready:true, broken:false };
    if(!path || path.length<2){ leg.broken=true; _legs[nodeId]=leg; return; }
    // tiles → px centers, drop collinear, cumulative arc lengths
    const raw=[]; for(const t of path) raw.push((t[0]+0.5)*TILE, (t[1]+0.5)*TILE);
    const pts=[raw[0],raw[1]];
    for(let i=2;i<raw.length-2;i+=2){
      const ax=pts[pts.length-2],ay=pts[pts.length-1], bx=raw[i],by=raw[i+1], cx2=raw[i+2],cy2=raw[i+3];
      if((bx-ax)*(cy2-ay)-(by-ay)*(cx2-ax)!==0) pts.push(bx,by);
    }
    pts.push(raw[raw.length-2], raw[raw.length-1]);
    const np=pts.length/2, cum=new Float32Array(np);
    for(let i=1;i<np;i++) cum[i]=cum[i-1]+Math.hypot(pts[i*2]-pts[i*2-2], pts[i*2+1]-pts[i*2-1]);
    leg.pts=new Float32Array(pts); leg.cum=cum; leg.len=cum[np-1];
    _legs[nodeId]=leg;
  }
  // route a→b through the plaza, concatenated + cached. null until trunk legs are ready.
  function _routeFor(a, b){
    if(a===b) return null;
    const key=a+'>'+b, hit=_routes.get(key);
    if(hit) return hit;
    const la=(a==='plaza')?{ready:true,empty:true}:_legs[a];
    const lb=(b==='plaza')?{ready:true,empty:true}:_legs[b];
    if(!la||!lb||!la.ready||!lb.ready) return null;             // legs still computing → caller lerps
    if(la.broken||lb.broken){ const r={broken:true,len:1}; _routes.set(key,r); return r; }
    const pts=[];
    if(!la.empty){ for(let i=la.pts.length-2;i>=0;i-=2) pts.push(la.pts[i],la.pts[i+1]); } // reversed a→plaza
    if(!lb.empty){ const s=(pts.length?2:0); for(let i=s;i<lb.pts.length;i+=2) pts.push(lb.pts[i],lb.pts[i+1]); }
    if(pts.length<4){ const r={broken:true,len:1}; _routes.set(key,r); return r; }
    const np=pts.length/2, cum=new Float32Array(np);
    let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
    for(let i=0;i<np;i++){ const x=pts[i*2],y=pts[i*2+1];
      if(i) cum[i]=cum[i-1]+Math.hypot(x-pts[i*2-2], y-pts[i*2-1]);
      if(x<bx0)bx0=x; if(x>bx1)bx1=x; if(y<by0)by0=y; if(y>by1)by1=y; }
    const r={ pts:new Float32Array(pts), cum, len:Math.max(1,cum[np-1]), bx0, by0, bx1, by1, broken:false };
    _routes.set(key, r);
    return r;
  }
  // point at arc-length d along a route, with a forward cursor hint (amortized O(1))
  function _routeAt(r, d, slot, out){
    const cum=r.cum, np=cum.length;
    let i=slot.ci; if(i>=np-1||cum[i]>d) i=0;
    while(i<np-2 && cum[i+1]<d) i++;
    slot.ci=i;
    const seg=cum[i+1]-cum[i], f=seg>0?(d-cum[i])/seg:0;
    const x0=r.pts[i*2], y0=r.pts[i*2+1], x1=r.pts[i*2+2], y1=r.pts[i*2+3];
    const dx=x1-x0, dy=y1-y0, len=Math.hypot(dx,dy)||1;
    out.x=x0+dx*f - (dy/len)*slot.jit;       // lateral jitter: walk a personal lane, not a conga line
    out.y=y0+dy*f + (dx/len)*slot.jit;
    out.face=dx<0?-1:1;
  }
  const _pt={x:0,y:0,face:1};

  /* ---- itineraries (the schedule state machine, precompiled per NPC) ---- */
  const K_HIDDEN=0, K_DWELL=1, K_TRAVEL=2;
  function _seg(t0,t1,kind,st,place){ return { t0, t1, kind, st, place:place||'', a:'', b:'', ax:0, ay:0, bx:0, by:0, route:null, tried:false }; }
  function _nodeOr(id, fb){ return _nodes[id]||_nodes[fb]||_nodes.plaza; }
  function _scatter(n, r, rad){ const a=r()*6.2832, d=r()*(rad||2)*TILE; return {x:n.x+Math.cos(a)*d, y:n.y+Math.sin(a)*d}; }
  // Travel-window estimate. Every route is the concatenation of two plaza trunk legs
  // (_routeFor joins a→plaza→b), so the realistic distance is VIA THE PLAZA — the old
  // straight-line estimate undershot cross-town hops by 10-30× and the closed-form eval
  // (position = fraction × route.len) made those NPCs sprint to stay on schedule.
  // _paceSeg still trims the residual (real A* legs are ~1.2-1.4× their euclid).
  function _estDur(a, b, speed){
    const p=_nodes.plaza;
    const d=(p && a!==p && b!==p)
      ? Math.hypot(p.x-a.x, p.y-a.y) + Math.hypot(b.x-p.x, b.y-p.y)
      : Math.hypot(b.x-a.x, b.y-a.y);
    return Math.max(4, d*ROAD_FACTOR/speed);
  }

  function _buildItin(slot, desc, r){
    const segs=[];
    const homeN=_nodeOr('d:'+(desc.homePoi||''), 'plaza');
    const homeName=desc.homePoi?(_nodes['d:'+desc.homePoi]?_nodes['d:'+desc.homePoi].name:desc.homePoi):'';
    let t=0;
    const dwellAt=(node, dur, st, scatterRad)=>{
      const s=_seg(t, Math.min(DAY,t+dur), K_DWELL, st);
      const p=_scatter(node, r, scatterRad==null?1.2:scatterRad); s.ax=p.x; s.ay=p.y;
      segs.push(s); t=s.t1;
    };
    const hideAt=(until, st, place)=>{ if(until<=t) return; segs.push(_seg(t, Math.min(DAY,until), K_HIDDEN, st, place)); t=Math.min(DAY,until); };
    const travel=(aId, bId, st)=>{
      const a=_nodeOr(aId,'plaza'), b=_nodeOr(bId,'plaza');
      const s=_seg(t, Math.min(DAY, t+_estDur(a,b,slot.speed)), K_TRAVEL, st);
      s.a=a.id; s.b=b.id; s.ax=a.x; s.ay=a.y; s.bx=b.x; s.by=b.y;
      segs.push(s); t=s.t1;
    };
    const jit=(lo,sp)=>(lo+r()*sp)*HOUR;

    if(desc.role==='ultra'){
      const gate='g'+((r()*GATES.length)|0), hq='d:ultra';
      const start=jit(7.6,1.8), end=jit(17.2,2.0);
      const a=_nodeOr(gate,'plaza'), b=_nodeOr(hq,'plaza');
      const commute=_estDur(a,b,slot.speed);
      hideAt(Math.max(0,start-commute), 'Off the clock — outer sprawl', '');
      travel(gate, hq, 'Commuting to ULTRA HQ');
      if(r()<0.6 && t<12*HOUR){                                  // some take a plaza lunch walk
        hideAt(jit(11.6,1.2), 'On shift — ULTRA HQ', 'ultra');
        travel(hq, 'plaza', 'On lunch — heading to the plaza');
        dwellAt(_nodes.plaza, jit(0.5,0.5), 'On lunch at the plaza', 4);
        travel('plaza', hq, 'Back to the grind — ULTRA HQ');
      }
      hideAt(end, 'On shift — ULTRA HQ', 'ultra');
      travel(hq, gate, 'Clocked out — heading home');
      hideAt(DAY, 'Off the clock — outer sprawl', '');
    } else if(desc.role==='provider'){
      const work='d:'+(desc.workPoi||'ultra');
      const workName=_nodes[work]?_nodes[work].name:(desc.workPoi||'work');
      const wake=jit(6.0,1.4), lunch=jit(11.8,1.2), end=jit(17.4,1.6), lights=jit(20.2,1.6);
      hideAt(wake, 'Sleeping — '+homeName, desc.homePoi);
      dwellAt(homeN, jit(0.3,0.4), 'Getting ready outside '+homeName);
      travel('d:'+desc.homePoi, work, 'Commuting to '+workName);
      hideAt(lunch, 'Working at '+workName, desc.workPoi);       // on shift INSIDE the facility
      travel(work, 'plaza', 'On break — heading to the plaza');
      dwellAt(_nodes.plaza, jit(0.5,0.5), 'On break at the plaza', 4);
      travel('plaza', work, 'Back on shift at '+workName);
      hideAt(end, 'Working at '+workName, desc.workPoi);
      travel(work, 'd:'+desc.homePoi, 'Heading home to '+homeName);
      dwellAt(homeN, Math.max(0.1*HOUR, lights-t), 'Unwinding outside '+homeName, 1.6);
      hideAt(DAY, 'Sleeping — '+homeName, desc.homePoi);
    } else {                                                     // relative / friend
      const wake=jit(6.8,2.2), social=jit(16.6,1.8), lights=jit(20.6,2.2);
      // errand target: a seeded service POI doorstep (or the plaza)
      const errands=[]; for(const id in _nodes){ if(id.indexOf('d:')===0 && id!=='d:'+desc.homePoi && id.indexOf('condo')<0) errands.push(id); }
      const errand=errands.length?errands[(r()*errands.length)|0]:'plaza';
      const chore=(desc.chores&&desc.chores[0])||'running errands';
      // evening visit: another condo (a friend's place)
      const condos=[]; for(const id in _nodes){ if(id.indexOf('d:condo')===0 && id!=='d:'+desc.homePoi) condos.push(id); }
      const visitN=condos.length?condos[(r()*condos.length)|0]:'plaza';
      const visitName=_nodes[visitN]?_nodes[visitN].name:'a friend';
      hideAt(wake, 'Sleeping — '+homeName, desc.homePoi);
      dwellAt(homeN, jit(0.5,0.7), 'Doing chores outside '+homeName, 1.8);
      travel('d:'+desc.homePoi, errand, _cap1(chore));
      dwellAt(_nodeOr(errand,'plaza'), jit(0.7,0.9), _cap1(chore), 2.2);
      travel(errand, 'd:'+desc.homePoi, 'Heading home to '+homeName);
      if(social>t){
        dwellAt(homeN, Math.max(0.1*HOUR, social-t), 'At home — '+((desc.chores&&desc.chores[1])||'passing the time'), 1.8);
        travel('d:'+desc.homePoi, visitN, 'Going visiting — '+visitName);
        dwellAt(_nodeOr(visitN,'plaza'), jit(1.2,1.2), 'Visiting friends at '+visitName, 1.8);
        travel(visitN, 'd:'+desc.homePoi, 'Heading home to '+homeName);
      }
      if(lights>t) dwellAt(homeN, lights-t, 'Out front of '+homeName, 1.6);
      hideAt(DAY, 'Sleeping — '+homeName, desc.homePoi);
    }
    if(t<DAY) segs.push(_seg(t, DAY, K_HIDDEN, segs.length?segs[segs.length-1].st:'Off duty', desc.homePoi));
    // mourning households keep the lights low — replace the social beat with the memorial? (future hook)
    return segs;
  }
  function _cap1(s){ return s?s[0].toUpperCase()+s.slice(1):s; }

  /* ---- pool binding ---- */
  const ROLE_RANK={relative:0, friend:1, provider:2, ultra:3};
  function _bind(state){
    _slots.length=0; _bound=0; _descById.clear();
    let roster=(typeof hubNpcRoster==='function')?hubNpcRoster():[];
    if(!Array.isArray(roster)) roster=[];
    for(const d of roster) _descById.set(d.id, d);
    const ordered=roster.slice().sort((a,b)=>{
      const ra=ROLE_RANK[a.role]|0, rb=ROLE_RANK[b.role]|0;
      return ra!==rb?ra-rb:(a.id<b.id?-1:1);
    }).slice(0, CAP);
    // gendered wardrobe pools (Phase-2 part lib only — Phase-1 looks carry no sex): the
    // per-NPC mixIdx draw below is MAPPED into the pool matching the NPC's lore gender,
    // so the dossier ("kid sister Maria") and the body always agree. Same single draw —
    // schedules and palettes stay byte-stable; only the look interpretation changes.
    let poolF=null, poolM=null;
    if(_mixOn()){
      const wd=_buildWardrobe();
      if(wd[0] && wd[0].sex){
        poolF=[]; poolM=[];
        for(let wi=0; wi<wd.length; wi++) (wd[wi].sex==='f'?poolF:poolM).push(wi);
      }
    }
    for(const desc of ordered){
      const seed=desc.seed>>>0, r=(typeof makeRng==='function')?makeRng(_h32(seed ^ 0x534348)%233280):Math.random;
      const sprites=CIVILIAN_SPRITES[desc.role]||CIVILIAN_SPRITES.friend;
      const slot={
        id:desc.id, role:desc.role, seed,
        sType:sprites[(r()*sprites.length)|0],
        owner:r()<0.5?'player':'enemy',                      // red/blue source palettes for variety
        tint:(r()*TINTS.length)|0, animKey:'',
        drawH:0, speed:_vmax()*(0.92+r()*0.16), jit:(r()-0.5)*12, phase:r()*6.2832,   // ≈ lobbyist pace (was 28+r()*14 — read as ambling, and windy routes made outliers sprint)
        segs:null, segIdx:0, ci:0, x:0, y:0, face:r()<0.5?-1:1, onMap:false,
        de:{y:0, n:null},
      };
      slot.de.n=slot;
      slot.animKey=slot.sType+'|'+slot.owner+'|'+slot.tint;   // precomputed: no string alloc in the draw loop
      // NPCs draw at EXACTLY unit height — same UNIT_SPRITE_H table units use, pinned to
      // the lobbyist (the human unit civilians stand next to in the hub). It was previously
      // per-donor-type (worker 46 … lobbyist 64) × ±8% jitter, which read as "NPCs are
      // smaller than units" whenever one stood near a lobbyist. The jitter draw is retired
      // but still CONSUMED so the frozen rng stream (itinerary draws below) never shifts.
      r();
      slot.drawH=((typeof UNIT_SPRITE_H!=='undefined' && UNIT_SPRITE_H.lobbyist)||64)*SPRITE_SCALE;
      slot.segs=_buildItin(slot, desc, r);
      // wardrobe pick — APPENDED after every existing draw (slot fields above + the
      // itinerary's draws) so adding it never reshuffled anyone's schedule or palette.
      slot.mixIdx=(r()*MIX_K)|0;
      if(poolF){                                                // gender-match (see pools above)
        const pool=(desc.gender==='f')?poolF:poolM;
        if(pool.length) slot.mixIdx=pool[slot.mixIdx%pool.length];
      }
      slot.mixKey='mix|'+slot.mixIdx;                           // precomputed like animKey: no draw-loop alloc
      _slots.push(slot); _bound++;
    }
  }
  function _reset(state){
    _clock=state.time||0; _prevC=-1; _frozenC=null;
    const visit=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?(CAMPAIGN.visit|0):0;
    // anchor the clock so THIS moment lands in living daytime (09:00-16:00, visit-stable).
    // Relative to the current _clock, not absolute: a fresh hub entry has state.time 0, but a
    // LOADED save restores an arbitrary state.time — without the re-anchor it can land at 3am
    // and the player walks into a city of empty streets. Same save → same _clock → same T0,
    // so load determinism holds; in-session continuity is untouched (reset = entry/load only).
    const target=DAY*((9+7*_h01(visit*31.7+5.1))/24);
    _T0=((target - (_clock%DAY)) % DAY + DAY) % DAY;
    _buildGraph(state);
    _bind(state);
  }

  /* ---- per-frame update (cheap: clock + cursors + one A* + one bake) ---- */
  function update(state, dt){
    if(!state) return;
    if(state!==_lastState){ if(state.hub){ _reset(state); } _lastState=state; if(!state.hub) return; }
    if(!state.hub || !_featureOn()) return;
    const run=(typeof running==='undefined')||running;
    if(run) _clock=Math.max(state.time||0, _clock+dt);        // tracks state.time (solo/host); rAF dt on co-op clients
    if(_legQueue.length){ _computeLeg(state, _legQueue.shift()); }            // ≤1 A* per frame
    if(_bakeQueue.length){ _bakeTint(_bakeQueue.shift()); }                   // ≤1 sheet bake per frame
    const C=_cityC();
    if(C<_prevC){ for(const s of _slots){ s.segIdx=0; s.ci=0; } }             // new city day → rewind cursors
    _prevC=C;
    for(const s of _slots){
      let i=s.segIdx;
      while(i<s.segs.length-1 && C>=s.segs[i].t1) i++;
      if(i!==s.segIdx){ s.segIdx=i; s.ci=0; }
    }
  }

  /* ---- closed-form evaluation ---- */
  // walk-speed ceiling = the Lobbyist's move speed (the slowest human unit) — NPCs must
  // never read faster than units. Lazy: DEF/TILE are parse-time globals, read once.
  let _vmaxC=0;
  function _vmax(){
    if(!_vmaxC) _vmaxC=(typeof DEF!=='undefined' && DEF.lobbyist && typeof TILE!=='undefined') ? DEF.lobbyist.speed*TILE : 70;
    return _vmaxC;
  }
  // Bound the VISIBLE walk speed. Itineraries schedule each travel window from the
  // straight-line distance × ROAD_FACTOR (the route isn't computed yet at bind), but the
  // real A* road route can be far windier — covering it inside the same window is what
  // made some NPCs sprint. When the route first resolves, if the implied speed exceeds
  // _vmax(), extend this travel into the FOLLOWING dwell/hide (arrive later, linger
  // less, ≥2s of the dwell kept). Deterministic (routes are static-map A*), no position
  // pops (dwell eval ignores t0; segment advancement reads t1 live), and the mutation is
  // one-shot per segment (_paced) so day-wrap replays are stable.
  function _paceSeg(slot, seg, route){
    seg._paced=1;
    const W=seg.t1-seg.t0, need=route.len/_vmax();
    if(need<=W) return;
    const next=slot.segs[slot.segIdx+1];
    if(!next || next.kind===K_TRAVEL) return;                  // nothing safe to borrow from (rare)
    const grab=Math.min(need-W, Math.max(0, (next.t1-next.t0)-2));
    if(grab>0){ seg.t1+=grab; next.t0+=grab; }
  }
  function _evalSlot(slot, C){
    const seg=slot.segs[slot.segIdx];
    if(!seg || seg.kind===K_HIDDEN){ slot.onMap=false; return seg; }
    if(seg.kind===K_DWELL){ slot.x=seg.ax; slot.y=seg.ay; slot.onMap=true; return seg; }
    const route=seg.route || (seg.route=_routeFor(seg.a, seg.b));
    if(route && !route.broken && !seg._paced) _paceSeg(slot, seg, route);
    const f=Math.max(0, Math.min(1, (C-seg.t0)/(seg.t1-seg.t0||1)));
    if(route && route.broken){ slot.onMap=false; return seg; }  // walled-in doorstep: skip the walk, arrive on schedule
    if(route){ _routeAt(route, f*route.len, slot, _pt); slot.x=_pt.x; slot.y=_pt.y; slot.face=_pt.face; }
    else { slot.x=seg.ax+(seg.bx-seg.ax)*f; slot.y=seg.ay+(seg.by-seg.ay)*f; slot.face=(seg.bx-seg.ax)<0?-1:1; } // legs still computing (first ~14 frames)
    slot.onMap=true;
    return seg;
  }

  /* ---- depth injection + drawing ---- */
  function collectDepth(state, x0, y0, x1, y1, depth, zoom){
    if(state!==_lastState || !_featureOn()) return;
    const cap=_activeCap(); if(!cap) return;
    const C=_cityC();
    const vx0=x0*TILE-64, vy0=y0*TILE-64, vx1=x1*TILE+64, vy1=y1*TILE+64;
    for(let i=0;i<cap;i++){
      const s=_slots[i], seg=s.segs[s.segIdx];
      if(!seg || seg.kind===K_HIDDEN) continue;
      if(seg.kind===K_DWELL){
        if(seg.ax<vx0||seg.ax>vx1||seg.ay<vy0||seg.ay>vy1) continue;          // point cull, no eval needed
      } else {
        const r=seg.route;
        if(r && !r.broken){ if(r.bx1<vx0||r.bx0>vx1||r.by1<vy0||r.by0>vy1) continue; }   // whole-route AABB cull
        else if(r && r.broken) continue;
        else { const lx0=Math.min(seg.ax,seg.bx), lx1=Math.max(seg.ax,seg.bx), ly0=Math.min(seg.ay,seg.by), ly1=Math.max(seg.ay,seg.by);
               if(lx1<vx0||lx0>vx1||ly1<vy0||ly0>vy1) continue; }
      }
      _evalSlot(s, C);
      if(!s.onMap || s.x<vx0||s.x>vx1||s.y<vy0||s.y>vy1) continue;            // exact point cull
      s.de.y=s.y;
      depth.push(s.de);
    }
  }

  function _bakeMix(key){
    delete _bakeQueued[key];
    if(_tinted[key] || _mixBroken[key]) return;
    const idx=(+key.slice(4)|0)%MIX_K, w=_buildWardrobe()[idx];
    if(_mixCount>=MIX_K){ _mixBroken[key]=1; return; }         // structural guard (≤MIX_K distinct keys exist)
    // Phase-2 fallback ladder: civilian strip recipe → ('broken' part assets: 404'd
    // optional files) → the look's Phase-1 unit-band fallback → (throw) → plain tint.
    // 'loading' keeps the strip recipe: composeTinted returns null → re-queued, same
    // streaming contract as unit donors.
    const recipe=(w.fallback && typeof NPCMIX.partLibState==='function' && NPCMIX.partLibState()==='broken') ? w.fallback : w;
    try{
      // per-look tintAlpha (punk looks bake untinted — composeTinted skips tint at <=0)
      const anim=NPCMIX.composeTinted(recipe, TINTS[recipe.tint], recipe.tintAlpha!=null?recipe.tintAlpha:TINT_ALPHA);
      if(!anim) return;                                        // donor art still streaming — re-queued on next draw
      _tinted[key]=anim; _mixCount++;
    }catch(_){ _mixBroken[key]=1; }                            // broken bake: this look permanently falls back to plain
  }
  function _bakeTint(key){
    if(key.indexOf('mix|')===0){ _bakeMix(key); return; }
    if(_tinted[key]) return;
    const parts=key.split('|');
    const base=(typeof unitWalk==='function')?unitWalk(parts[0], parts[1]):null;
    delete _bakeQueued[key];
    if(!base){ return; }                                       // art not streamed yet — re-queued on next draw
    if(_tintCount>=TINT_CAP){ _tinted[key]=base; return; }     // memory cap: fall back to the untinted sheet
    try{
      const c=document.createElement('canvas');
      c.width=Math.max(1, base.img.width>>1); c.height=Math.max(1, base.img.height>>1);
      const x=c.getContext('2d');
      x.drawImage(base.img, 0, 0, c.width, c.height);
      x.globalCompositeOperation='source-atop';
      x.globalAlpha=TINT_ALPHA; x.fillStyle=TINTS[+parts[2]||0]; x.fillRect(0,0,c.width,c.height);
      const fw=base.fw/2, fh=base.fh/2, frames=[];
      for(let i=0;i<base.frames.length;i++) frames.push([i*fw,0,fw,fh]);
      _tinted[key]={ img:c, ready:true, fw, fh, frames };
      _tintCount++;
    }catch(_){ _tinted[key]=base; }
  }
  function _animFor(slot){
    if(slot.mixKey && _mixOn() && !_mixBroken[slot.mixKey]){   // wardrobe path: mixed sheet → raw unit sheet while it bakes
      const m=_tinted[slot.mixKey];
      if(m) return m;
      if(!_bakeQueued[slot.mixKey]){ _bakeQueued[slot.mixKey]=1; _bakeQueue.push(slot.mixKey); }
      return (typeof unitWalk==='function')?unitWalk(slot.sType, slot.owner):null;
      // NOTE: deliberately not queueing the plain tint bake here — mixed NPCs never use it,
      // and skipping it keeps total baked sheets ≈ MIX_K instead of MIX_K + TINT_CAP.
    }
    const key=slot.animKey;
    const t=_tinted[key];
    if(t) return t;
    if(!_bakeQueued[key]){ _bakeQueued[key]=1; _bakeQueue.push(key); }
    return (typeof unitWalk==='function')?unitWalk(slot.sType, slot.owner):null;   // untinted until the bake lands
  }
  function drawOne(state, slot){
    if(typeof ctx==='undefined') return;
    const z=state.zoom||1;
    const dotZ=(typeof QUAL!=='undefined' && QUAL.level>=2)?DOT_ZOOM_DEGRADED:DOT_ZOOM;
    if(z<dotZ){                                                 // strategic zoom: moving specks, ~free
      ctx.globalAlpha=0.8;
      ctx.fillStyle=TINTS[slot.tint];
      const s=2/z;
      ctx.fillRect(slot.x-s/2, slot.y-s, s, s);
      ctx.globalAlpha=1;
      return;
    }
    const seg=slot.segs[slot.segIdx];
    const anim=_animFor(slot);
    if(!anim || !anim.ready){ _drawSilhouette(slot); return; }  // art still streaming: dark figure, never bright
    let fi=0, S=slot.drawH;
    if(seg && seg.kind===K_TRAVEL){
      const C=_cityC(), f=Math.max(0,Math.min(1,(C-seg.t0)/(seg.t1-seg.t0||1)));
      const len=(seg.route&&!seg.route.broken)?seg.route.len:Math.hypot(seg.bx-seg.ax,seg.by-seg.ay);
      fi=((f*len/9)|0)%anim.frames.length;                      // legs match ground speed (same 9px step as units)
    } else {
      S*=1+0.015*Math.sin(_cityC()*1.7+slot.phase);             // closed-form idle breathe, no per-frame state
    }
    _du.type=slot.sType; _du.owner=slot.owner; _du._face=slot.face;
    if(typeof blitFrame==='function') blitFrame(_du, slot.x, slot.y, anim, S, fi);
  }
  function _drawSilhouette(slot){
    const h=slot.drawH, w=h*0.34;
    ctx.save();
    ctx.globalAlpha=0.9;
    ctx.fillStyle='#11161d';
    ctx.beginPath(); ctx.ellipse(slot.x, slot.y-h*0.28, w*0.55, h*0.36, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle='#1c2430';
    ctx.beginPath(); ctx.ellipse(slot.x, slot.y-h*0.66, w*0.34, h*0.15, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle=TINTS[slot.tint];
    ctx.fillRect(slot.x-1, slot.y-h*0.42, 2, 2);                // single neon accent
    ctx.restore();
  }

  /* ---- queries for the UI / locate workstreams ---- */
  function _slotById(id){ for(const s of _slots) if(s.id===id) return s; return null; }
  function whereIs(id){
    const desc=_descById.get(id);
    const slot=_slotById(id);
    if(slot && slot.segs){
      const seg=_evalSlot(slot, _cityC());
      if(slot.onMap) return { onMap:true, x:slot.x, y:slot.y, status:(seg&&seg.st)||'Out and about', insidePoi:null };
      return { onMap:false, x:0, y:0, status:(seg&&seg.st)||'Indoors', insidePoi:(seg&&seg.place)||null };
    }
    // unbound (over cap / reduced motion): coarse closed-form status so panels still work
    const h=_cityC()/HOUR, home=(desc&&desc.homePoi)||null;
    if(h<7||h>=21) return { onMap:false, x:0, y:0, status:'Sleeping', insidePoi:home };
    if(desc && desc.role==='provider') return { onMap:false, x:0, y:0, status:'Working at '+_npcPlaceName(desc.workPoi), insidePoi:desc.workPoi };
    if(desc && desc.role==='ultra') return { onMap:false, x:0, y:0, status:'On shift — ULTRA HQ', insidePoi:'ultra' };
    return { onMap:false, x:0, y:0, status:'Out in the city', insidePoi:home };
  }
  function _npcPlaceName(id){
    if(id && _nodes['d:'+id]) return _nodes['d:'+id].name;
    if(typeof hubPoiConfig==='function'){ const c=hubPoiConfig(id); if(c&&c.name) return c.name; }
    return id||'the H.U.B.';
  }
  function statusOf(id){ return whereIs(id).status; }
  function npcById(id){
    const w=whereIs(id);
    return { x:w.x, y:w.y, status:w.status, insidePoi:w.insidePoi, onMap:w.onMap };
  }
  function pickAt(wx, wy){
    const cap=_activeCap();
    for(let i=0;i<cap;i++){ const s=_slots[i];
      if(!s.onMap) continue;
      const h=s.drawH;
      if(Math.abs(wx-s.x)<=h*0.35 && wy>=s.y-h*0.75 && wy<=s.y+h*0.25) return _descById.get(s.id)||{id:s.id};
    }
    return null;
  }
  function focus(id){
    const w=whereIs(id);
    if(typeof hubLocateNpc==='function'){ hubLocateNpc(id); return w; }   // the hub.js locate engine owns pan+ping
    return w;
  }
  // portrait for condo cards / dossier: bust crop of the tinted idle frame; silhouette+initials fallback
  function drawPortrait(canvas, descOrId, t){
    const desc=typeof descOrId==='string'?_descById.get(descOrId):descOrId;
    if(!canvas || !desc) return;
    const x=canvas.getContext('2d'); if(!x) return;
    const W=canvas.width, H=canvas.height;
    x.clearRect(0,0,W,H);
    x.fillStyle='#0c1117'; x.fillRect(0,0,W,H);
    const slot=_slotById(desc.id);
    let anim=null, tint=slot?slot.tint:(desc.seed%TINTS.length), sType=slot?slot.sType:'worker', owner=slot?slot.owner:'player';
    if(slot && slot.mixKey && _mixOn() && !_mixBroken[slot.mixKey]){   // wardrobe portrait: show the body they actually wear
      anim=_tinted[slot.mixKey];
      if(anim) tint=_buildWardrobe()[slot.mixIdx%MIX_K].tint;          // accent strip matches the worn look
      else if(!_bakeQueued[slot.mixKey]){ _bakeQueued[slot.mixKey]=1; _bakeQueue.push(slot.mixKey); }
    }
    if(!anim){
      const key=sType+'|'+owner+'|'+tint;
      anim=_tinted[key]||((typeof unitWalk==='function')?unitWalk(sType,owner):null);
    }
    if(anim && anim.ready){
      const fr=anim.frames[0];
      const sw=anim.fw, sh=anim.fh*0.62;                        // bust crop: top 62% of the frame
      const scale=Math.min(W/sw, H/sh)*1.45;
      x.drawImage(anim.img, fr[0], fr[1], sw, sh, W/2-sw*scale/2, H*0.06, sw*scale, sh*scale);
    } else {
      x.fillStyle='#1c2430';
      x.beginPath(); x.ellipse(W/2, H*0.40, W*0.16, H*0.15, 0, 0, 6.2832); x.fill();
      x.beginPath(); x.ellipse(W/2, H*0.78, W*0.26, H*0.30, 0, 0, 6.2832); x.fill();
    }
    x.fillStyle=TINTS[tint];
    x.fillRect(4, H-6, W-8, 2);                                  // tint accent strip
    if(desc.mourning){ x.fillStyle='rgba(10,8,16,0.35)'; x.fillRect(0,0,W,H); }   // mourning households read darker
    x.fillStyle='rgba(220,230,240,0.85)'; x.font='bold '+Math.max(9,(W*0.13)|0)+'px monospace'; x.textAlign='center';
    x.fillText((desc.first||desc.name||'?').slice(0,12), W/2, H-10);
  }

  /* ---- deterministic synthetic roster for the ?perf=1 hub scene ---- */
  function perfPopulate(state, opts){
    opts=opts||{};
    if(!state||!state.hub) return 0;
    _lastState=state;                                           // pre-empt update()'s reset
    _clock=state.time||0; _prevC=-1;
    _buildGraph(state);
    while(_legQueue.length) _computeLeg(state, _legQueue.shift());   // all trunk legs, synchronously
    const n=Math.min(CAP, opts.count!=null?opts.count:CAP);
    const r=(typeof makeRng==='function')?makeRng(777):Math.random;
    const condos=[], pois=[];
    for(const id in _nodes){ if(id.indexOf('d:condo')===0) condos.push(id.slice(2)); else if(id.indexOf('d:')===0) pois.push(id.slice(2)); }
    const roster=[];
    for(let i=0;i<n;i++){
      const roll=i%10;
      const role=roll<4?'relative':(roll<6?'friend':(roll<8?'provider':'ultra'));
      roster.push({ id:'perf:'+i, seed:_h32(777+i*7919), role, gender:(i%2)?'m':'f',   // both wardrobe pools get baked
        name:'Perf '+i, first:'Perf'+i, profession:'Benchmark Subject', chores:['standing very still','being measured'],
        homePoi:role==='ultra'?'':(condos[i%Math.max(1,condos.length)]||''),
        workPoi:role==='provider'?(pois[i%Math.max(1,pois.length)]||'ultra'):(role==='ultra'?'ultra':null),
        linkedVetKey:null, mourning:false });
    }
    _slots.length=0; _bound=0; _descById.clear();
    for(const d of roster) _descById.set(d.id, d);
    const saved=window.hubNpcRoster;                            // bypass the real roster for this synthetic bind
    try{ window.hubNpcRoster=function(){ return roster; }; _bind(state); }
    finally{ if(saved) window.hubNpcRoster=saved; else delete window.hubNpcRoster; }
    _frozenC=DAY*(opts.clock!=null?opts.clock:0.45);            // frozen mid-day clock → byte-stable renders
    for(const s of _slots){ let i=0; while(i<s.segs.length-1 && _frozenC>=s.segs[i].t1) i++; s.segIdx=i; s.ci=0; }
    for(const s of _slots) _bakeTint(s.animKey);                // pre-bake all tint sheets: the measured window
    if(_mixOn()) for(const s of _slots) _bakeTint(s.mixKey);    // + all wardrobe sheets (≤MIX_K, loader is eager under ?perf=1)
    _bakeQueue.length=0;                                        // is steady-state only (live play amortizes 1/frame)
    return _bound;
  }

  function debug(){
    const cap=_activeCap(); let onMap=0, hidden=0;
    const C=_cityC();
    for(let i=0;i<cap;i++){ const s=_slots[i]; _evalSlot(s,C); if(s.onMap) onMap++; else hidden++; }
    return { bound:_bound, activeCap:cap, onMap, hidden, clock:clock(), legsPending:_legQueue.length,
             routes:_routes.size, bakes:_tintCount, reduced:_reducedMotion(),
             mixOn:_mixOn(), mixBakes:_mixCount, wardrobe:MIX_K };
  }

  window.HUBNPC = { update, collectDepth, drawOne, whereIs, statusOf, npcById, pickAt, focus,
                    drawPortrait, clock, nightAlpha, perfPopulate, debug,
                    list:function(){ return Array.from(_descById.values()); } };
})();
