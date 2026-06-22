/* placement_tests.js — building-placement + start-base-spacing test harness.
   OFF unless ?placement-tests=1 (or window.PLACEMENT_FORCE). Pure-function assertions over
   canPlaceAt / buildingDrawBox / buildingArtBoxTiles / visualBaseTiles / newMap — it NEVER auto-runs,
   never mutates the live G (newMap returns a fresh local state), and adds zero cost in normal play.
   Run it from the console or a driver:  PLACEMENT.runTests()  → {pass, fail, results}.

   Covers the 2026 placement-preview fix:
     • Part 1 — the green placement preview now shows the building's REAL drawn extent (buildingDrawBox)
       and warns (amber) when a building's visual base would crowd a neighbour — but never blocks
       (canPlaceAt is unchanged: warn, not block).
     • Part 2 — start-base offsets widened so the ~2.5× building sprites no longer pile on top of
       each other (same-tier neighbours clear; intentional front/back depth layering is preserved).

   MUST load AFTER assets.js (buildingDrawBox / buildingArtBoxTiles), map.js (newMap / mkBuilding /
   markBuilding / footprintBuildable / baseBlocked), units.js (canPlaceAt) and render.js (visualBaseTiles). */
(function(){
  'use strict';
  const PLACEMENT = (window.PLACEMENT = window.PLACEMENT || {});
  const qs = (typeof location!=='undefined' && location.search) || '';
  const ON = /[?&]placement-tests=1\b/.test(qs) || !!window.PLACEMENT_FORCE;
  PLACEMENT.on = ON;
  if(!ON){ PLACEMENT.runTests = function(){ return {pass:0, fail:0, results:[], skipped:'off'}; }; return; }

  // ---------- assertion plumbing ----------
  let RES = [];
  function T(name, fn){ try{ fn(); RES.push({name, ok:true}); } catch(err){ RES.push({name, ok:false, detail:String((err&&err.message)||err)}); } }
  function assert(cond, detail){ if(!cond) throw new Error(detail||'assertion failed'); }
  function assertNear(a, b, eps, detail){ if(Math.abs(a-b)>eps) throw new Error((detail||'not near')+' (|'+a+'-'+b+'|>'+eps+')'); }
  function freshMap(idx){ return newMap(idx); }   // newMap returns a fresh local state; never assigns global G

  // ---------- helpers ----------
  // n×n region forced explored + unblocked + feature-free (a clean sandbox for canPlaceAt tests).
  function clearRegion(s, tx, ty, n){
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){ const i=(ty+y)*s.W+(tx+x); s.explored[i]=1; s.blocked[i]=0; if(s.feat) s.feat[i]=0; }
  }
  // top-left of an n×n region overlapping no building/goldmine (so the sandbox starts truly empty).
  function findClearRegion(s, n){
    const occ=(tx,ty)=>{ for(const e of s.entities){ if(e.dead) continue;
      if(e.kind==='building'){ if(tx<e.tx+e.w && tx+n>e.tx && ty<e.ty+e.h && ty+n>e.ty) return true; }
      else if(e.type==='goldmine'){ const gx=(e.x/TILE-0.5)|0, gy=(e.y/TILE-0.5)|0; if(tx<=gx&&tx+n>gx&&ty<=gy&&ty+n>gy) return true; } }
      return false; };
    for(let ty=2; ty<s.H-n-2; ty+=2)for(let tx=2; tx<s.W-n-2; tx+=2){ if(!occ(tx,ty)) return {tx,ty}; }
    return {tx:2, ty:2};
  }
  function addBld(s, type, tx, ty){ return mkBuilding(s, type, 'player', tx, ty, true); }   // marks blocked + pushes entity
  function rmBld(s, e){ markBuilding(s, e, false); const i=s.entities.indexOf(e); if(i>=0) s.entities.splice(i,1); }
  // does the candidate stub's visual base overlap ANY existing building's base? (mirrors drawPlacement's `crowded`)
  function isCrowded(s, type, tx, ty){
    const vb=visualBaseTiles({tx, ty, w:DEF[type].w, h:DEF[type].h, type, owner:'player'});
    for(const e of s.entities){ if(e.dead||e.kind!=='building') continue;
      const eb=visualBaseTiles(e);
      if(vb.x0<eb.x1 && vb.x1>eb.x0 && vb.y0<eb.y1 && vb.y1>eb.y0) return true; }
    return false;
  }
  // horizontal overlap (in tiles) of two art boxes; >0 means the sprites overlap left-to-right.
  function hOverlap(a, b){ return Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x); }
  function vOverlap(a, b){ return Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y, b.y); }
  // open (passable) tile index just outside building e's footprint, or -1.
  function openNear(s, e){
    for(let r=1;r<10;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const x=e.tx+dx, y=e.ty+dy;
      if(x>=0&&y>=0&&x<s.W&&y<s.H && !s.blocked[y*s.W+x]) return y*s.W+x; }
    return -1;
  }
  function reachable(s, startIdx, goalIdx){
    if(startIdx<0||goalIdx<0) return false;
    const W=s.W, H=s.H, B=s.blocked, seen=new Uint8Array(W*H), q=[startIdx]; seen[startIdx]=1;
    for(let h=0;h<q.length;h++){ const k=q[h]; if(k===goalIdx) return true; const x=k%W, y=(k/W)|0;
      const nb=[[1,0],[-1,0],[0,1],[0,-1]];
      for(let d=0;d<4;d++){ const nx=x+nb[d][0], ny=y+nb[d][1]; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const j=ny*W+nx; if(seen[j]||B[j]) continue; seen[j]=1; q.push(j); } }
    return false;
  }
  function startBuildings(s){ return s.entities.filter(e=> !e.dead && e.kind==='building' && (e.owner==='player'||e.owner==='enemy') && !e.scenery && !e.abandoned); }

  const ART_TYPES = ['hq','barracks','turret','garage','launchpad','outpost'];

  // =====================================================================
  PLACEMENT.runTests = function(){
    RES = [];
    const s0 = freshMap(0);
    const N = 16;
    const reg = findClearRegion(s0, N);
    clearRegion(s0, reg.tx, reg.ty, N);
    const ox = reg.tx, oy = reg.ty;   // sandbox origin

    // ---------- A. canPlaceAt regression (footprint logic — unchanged behaviour) ----------
    T('A1 valid open tile is buildable', ()=>{ assert(canPlaceAt(s0,'barracks', ox, oy)===true); });
    T('A2 out-of-bounds rejected (all four edges)', ()=>{
      assert(canPlaceAt(s0,'barracks', -1, oy)===false, 'left');
      assert(canPlaceAt(s0,'barracks', ox, -1)===false, 'top');
      assert(canPlaceAt(s0,'barracks', s0.W-1, oy)===false, 'right overrun');
      assert(canPlaceAt(s0,'barracks', ox, s0.H-1)===false, 'bottom overrun');
    });
    T('A3 blocked tile rejected', ()=>{ const i=oy*s0.W+ox; s0.blocked[i]=1; const r=canPlaceAt(s0,'barracks',ox,oy); s0.blocked[i]=0; assert(r===false); });
    T('A4 topography feature rejected', ()=>{ if(!s0.feat){ return; } const i=oy*s0.W+ox; s0.feat[i]=1; const r=canPlaceAt(s0,'barracks',ox,oy); s0.feat[i]=0; assert(r===false); });
    T('A5 unexplored (fog) rejected', ()=>{ const i=oy*s0.W+ox; s0.explored[i]=0; const r=canPlaceAt(s0,'barracks',ox,oy); s0.explored[i]=1; assert(r===false); });
    T('A6 overlap existing building rejected', ()=>{ const b=addBld(s0,'hq',ox,oy); const r1=canPlaceAt(s0,'barracks',ox,oy), r2=canPlaceAt(s0,'turret',ox+1,oy+1); rmBld(s0,b); assert(r1===false&&r2===false); });
    T('A7 overlap goldmine rejected', ()=>{ const g=s0.entities.find(e=>!e.dead&&e.type==='goldmine'); if(!g){ return; } const gx=(g.x/TILE-0.5)|0, gy=(g.y/TILE-0.5)|0; for(let y=-1;y<=2;y++)for(let x=-1;x<=2;x++){ const xx=gx+x,yy=gy+y; if(xx>=0&&yy>=0&&xx<s0.W&&yy<s0.H) s0.explored[yy*s0.W+xx]=1; } assert(canPlaceAt(s0,'barracks',gx,gy)===false); });
    T('A8 adjacent (no overlap) is buildable', ()=>{ const b=addBld(s0,'hq',ox,oy); const r=canPlaceAt(s0,'turret', ox+DEF.hq.w, oy); rmBld(s0,b); assert(r===true); });

    // ---------- B. warn-only crowding advisory (visualBaseTiles) ----------
    // Place a reference building, then test a candidate whose FOOTPRINT does not overlap (canPlaceAt true)
    // but whose visual base might. Advisory must be art-aware: flag big art, never flag tiny art.
    T('B1 two HQs base-to-base: allowed but flagged', ()=>{ const b=addBld(s0,'hq',ox,oy); const can=canPlaceAt(s0,'hq', ox+DEF.hq.w, oy); const crowd=isCrowded(s0,'hq', ox+DEF.hq.w, oy); rmBld(s0,b); assert(can===true,'placement still allowed (warn not block)'); assert(crowd===true,'wide HQ art should flag crowding'); });
    T('B2 HQ with a clear gap: allowed and NOT flagged', ()=>{ const b=addBld(s0,'hq',ox,oy); const can=canPlaceAt(s0,'hq', ox+DEF.hq.w+6, oy); const crowd=isCrowded(s0,'hq', ox+DEF.hq.w+6, oy); rmBld(s0,b); assert(can===true); assert(crowd===false,'a 6-tile gap should not flag'); });
    T('B3 intel adjacency NOT over-restricted (art < footprint)', ()=>{ const b=addBld(s0,'intel',ox,oy); const can=canPlaceAt(s0,'intel', ox+1, oy); const crowd=isCrowded(s0,'intel', ox+1, oy); rmBld(s0,b); assert(can===true); assert(crowd===false,'tiny intel art must not flag a touching neighbour'); });
    T('B4 turret adjacency IS flagged (art > footprint)', ()=>{ const b=addBld(s0,'turret',ox,oy); const can=canPlaceAt(s0,'turret', ox+DEF.turret.w, oy); const crowd=isCrowded(s0,'turret', ox+DEF.turret.w, oy); rmBld(s0,b); assert(can===true,'still allowed'); assert(crowd===true,'wide turret art should flag a touching neighbour'); });

    // ---------- C. art-box geometry (buildingArtBoxTiles — deterministic) ----------
    T('C1 hq art box larger than footprint', ()=>{ const a=buildingArtBoxTiles('hq',ox,oy); assert(a.w>DEF.hq.w,'wider'); assert(a.h>DEF.hq.h,'taller'); });
    T('C2 barracks art box wider than footprint', ()=>{ const a=buildingArtBoxTiles('barracks',ox,oy); assert(a.w>DEF.barracks.w); });
    T('C3 turret overhang is the special 1.18 (wider than 1.08)', ()=>{ const a=buildingArtBoxTiles('turret',ox,oy); const w108=DEF.turret.w*1.08*buildingDrawScale('turret'); assert(a.w>w108,'turret 1.18 overhang'); });
    T('C4 intel art WIDTH smaller than footprint (0.25 scale)', ()=>{ const a=buildingArtBoxTiles('intel',ox,oy); assert(a.w<DEF.intel.w,'intel art narrower than its 1×1 footprint — the over-restrict guard premise'); });
    T('C5 darktower art box wider than footprint', ()=>{ const a=buildingArtBoxTiles('darktower',ox,oy); assert(a.w>DEF.darktower.w); });
    T('C6 every art box is bottom-anchored & horizontally centred', ()=>{ for(const t of ART_TYPES){ const a=buildingArtBoxTiles(t,ox,oy); assertNear(a.y+a.h, oy+DEF[t].h, 0.1, t+' bottom'); assertNear(a.x+a.w/2, ox+DEF[t].w/2, 0.01, t+' centre'); } });

    // ---------- D. preview/real-draw lockstep ----------
    // buildingArtBoxTiles (logic) and buildingDrawBox (render) must agree when the sprite aspect matches
    // the baked BUILDING_ART_ASPECT — this guards the two box formulas from silently drifting apart.
    T('D1 buildingDrawBox ≡ buildingArtBoxTiles (shared geometry)', ()=>{
      for(const t of ART_TYPES){
        const asp = (typeof BUILDING_ART_ASPECT!=='undefined' && BUILDING_ART_ASPECT[t]) || 1;
        const fakeSpr = { img:null, fw:1000, fh:Math.round(1000*asp), frames:9 };
        const stub = { tx:ox, ty:oy, w:DEF[t].w, h:DEF[t].h, type:t, owner:'player' };
        const px = buildingDrawBox(stub, fakeSpr);                 // world px
        const ti = buildingArtBoxTiles(t, ox, oy);                 // tiles
        assertNear(px.w/TILE, ti.w, 0.05, t+' w'); assertNear(px.h/TILE, ti.h, 0.06, t+' h');
        assertNear(px.x/TILE, ti.x, 0.05, t+' x'); assertNear(px.y/TILE, ti.y, 0.1, t+' y');
      }
    });

    // ---------- E. map-start spacing regression (the core bug) ----------
    // For every campaign map: no two SAME-TIER start buildings pile (their art boxes must not overlap
    // horizontally beyond a small tolerance). Different-tier pairs (front/back skyline depth) are allowed.
    const TIER = 2;        // footprint-bottom rows within this many tiles = same depth tier
    const TOL = 0.5;       // permitted horizontal art-box overlap (tiles) for same-tier neighbours
    T('E1 no same-tier start buildings pile (all maps)', ()=>{
      const bad=[];
      for(let idx=0; idx<MAPS.length; idx++){
        let s; try{ s=freshMap(idx); }catch(e){ bad.push('map'+idx+' gen-error:'+e.message); continue; }
        const blds=startBuildings(s);
        for(let i=0;i<blds.length;i++)for(let j=i+1;j<blds.length;j++){
          const a=blds[i], b=blds[j];
          if(Math.abs((a.ty+a.h)-(b.ty+b.h))>TIER) continue;        // different tier → depth layering OK
          const ba=buildingArtBoxTiles(a.type,a.tx,a.ty), bb=buildingArtBoxTiles(b.type,b.tx,b.ty);
          if(hOverlap(ba,bb)>TOL && vOverlap(ba,bb)>0) bad.push('map'+idx+': '+a.owner+' '+a.type+'@'+a.tx+','+a.ty+' ⨯ '+b.type+'@'+b.tx+','+b.ty+' (hov '+hOverlap(ba,bb).toFixed(2)+')');
        }
      }
      assert(bad.length===0, bad.slice(0,8).join(' | '));
    });
    T('E2 every start building sits on valid ground (all maps)', ()=>{
      const bad=[];
      for(let idx=0; idx<MAPS.length; idx++){
        let s; try{ s=freshMap(idx); }catch(e){ continue; }
        for(const e of startBuildings(s)) if(!footprintBuildable(s, e, e.tx, e.ty)) bad.push('map'+idx+': '+e.owner+' '+e.type+'@'+e.tx+','+e.ty);
      }
      assert(bad.length===0, bad.slice(0,8).join(' | '));
    });
    T('E3 player can reach an enemy base (all maps with enemies)', ()=>{
      const bad=[];
      for(let idx=0; idx<MAPS.length; idx++){
        let s; try{ s=freshMap(idx); }catch(e){ continue; }
        const phq=s.entities.find(e=>!e.dead&&e.owner==='player'&&e.type==='hq');
        const ehqs=s.entities.filter(e=>!e.dead&&e.owner==='enemy'&&e.type==='hq');
        if(!phq || !ehqs.length) continue;                          // villain arena / no enemy base → skip
        const start=openNear(s, phq);
        const anyReach=ehqs.some(eh=> reachable(s, start, openNear(s, eh)));
        if(!anyReach) bad.push('map'+idx);
      }
      assert(bad.length===0, 'unreachable enemy base on: '+bad.join(','));
    });

    // ---------- F. determinism ----------
    T('F1 newMap produces identical start layout twice (all maps)', ()=>{
      const bad=[];
      const sig=s=> startBuildings(s).map(e=>e.type+':'+e.owner+':'+e.tx+':'+e.ty).sort().join('|');
      for(let idx=0; idx<MAPS.length; idx++){
        let a,b; try{ a=freshMap(idx); b=freshMap(idx); }catch(e){ continue; }
        if(sig(a)!==sig(b)) bad.push('map'+idx);
      }
      assert(bad.length===0, 'non-deterministic start layout on: '+bad.join(','));
    });

    // ---------- summary ----------
    const pass = RES.filter(r=>r.ok).length, fail = RES.length-pass;
    const tag = fail? 'color:#ff6b6b;font-weight:bold' : 'color:#8effb0;font-weight:bold';
    console.log('%c[placement] '+(fail?'FAIL':'PASS')+' — '+pass+'/'+RES.length+' assertions', tag);
    for(const r of RES) if(!r.ok) console.log('%c  ✗ '+r.name+' — '+(r.detail||''), 'color:#ff6b6b');
    return { pass, fail, results: RES.slice() };
  };

  console.log('[placement] harness ON — call PLACEMENT.runTests()');
})();
