/* js/net/sync.js — CLASSIC. Host-authoritative state-sync engine.
   The host alone runs update(G,dt); it ships the dynamic world to clients. The client runs ZERO
   sim — it regenerates terrain locally from mapIndex (deterministic), applies snapshots, derives
   fog itself (it has every unit's position), and renders. Lockstep is impossible here because
   enemyAI/runSalt use the non-seeded RNG — so state-sync it is.

   Two wire forms (both via the MP transport facade):
     • FULL  ('mpfull', chunked) — serializeForNet() minus the terrain the client regenerates. Sent
       on join + as a ~0.2 Hz keyframe + on a desync. Reuses save.js's serialize/resolveRefs.
     • SNAP  ('mpsnap', ~12 Hz)  — a compact per-entity merge of the hot fields (pos/hp/state/…),
       plus the two economy pools + a couple of scalars. Static DEF-derived stats are looked up
       client-side, never sent. */
window.NET = window.NET || {};
(function(){
  const NET = window.NET;
  NET.tick = 0;            // host authoritative tick counter (stamped into snapshots)
  NET.lastFull = -1;       // client: tick of the last full snapshot applied
  NET.DELTA_HZ = 15;       // compact-snapshot rate (each snap is a full entity set, so it self-heals)
  NET.SMOOTH_RATE = 18;    // client: ease rate for gliding unit positions between snapshots
  NET._sAcc = 0;
  // ---- client host-liveness watchdog: the host streams snapshots ~15Hz; a long gap = crash/disconnect ----
  NET.STALL_MS = 3500;     // no snapshot this long → "connection unstable" hint (still recoverable)
  NET.LOST_MS  = 8000;     // no snapshot this long → host is gone, end the session
  NET.lastRecvAt = 0; NET._stalled = false; NET._hostGone = false;
  function _now(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
  NET.markRecv = function(){ NET.lastRecvAt = _now();
    if(NET._stalled){ NET._stalled = false; if(typeof NET.onReconnected==='function') NET.onReconnected(); } };
  NET.touchWatchdog  = function(){ NET.lastRecvAt = _now(); };                 // grace (e.g. on tab re-focus)
  NET.resetWatchdog  = function(){ NET.lastRecvAt = _now(); NET._stalled = false; NET._hostGone = false; };
  NET.peerCtrl = {};       // host: peerId -> ctrl ('p2'…)
  NET.ctrlPeer = {};       // host: ctrl -> peerId
  NET._chunk = {};         // client: full-snapshot chunk reassembly buffers

  /* ---------------- FULL snapshot (terrain stripped — client regenerates it) ---------------- */
  // serializeGame() already drops cfg/visible/feat/waterDepth and re-adds variant/blocked/explored.
  // For the wire we ALSO drop everything the client rebuilds from mapIndex via newMap().
  const NET_DROP = ['tiles','biome','variant','megaSprites','features','blocked','explored','selection','groups'];
  NET.serializeForNet = function(){
    const s = serializeGame();                 // proven pipeline: entities (refs→{$ref}), eco, scalars, meta
    for(const k of NET_DROP) delete s[k];
    s.netTick = NET.tick;
    return s;
  };
  NET.applyFullSnapshot = function(s){
    // Race guard: 'mpfull' and 'mpstart' are separate Trystero actions with no cross-action ordering.
    // If the full snapshot arrives before the client has built its terrain (G null), stash and replay.
    if(!G){ NET._pendingFull = s; return; }
    // HUB transition guard: a full HUB snapshot can beat the explicit 'mphub'
    // action while the client still has the combat terrain loaded. Rebuild the
    // host-owned HUB locally before overlaying host dynamic state.
    if(s.hubMap && !G.hub && typeof newHubMap==='function'){
      if(s.campaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(s.campaign);
      G = newHubMap();
      if(typeof syncHud==='function') syncHud();
      if(typeof clampCam==='function') clampCam(G);
    }
    // G already came from newMap(mapIndex) on the client, so terrain is correct. Overlay dynamic state:
    const SCALAR = ['eco','players','time','waveCount','graceTime','nextId','runSalt','over',
                    'enemySpawnTimer','enemyWaveTimer','enemyFortifyTimer','_recalibratedFor','_coopOrigins'];
    for(const k of SCALAR){ if(s[k]!==undefined) G[k]=s[k]; }
    if(s.campaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(s.campaign);
    G.entities = s.entities.map(e=>Object.assign({}, e));
    const byId = new Map(G.entities.map(e=>[e.id,e]));
    G.entities.forEach(e=>resolveRefs(e, byId));            // re-link cmd.target / autoTarget / … (save.js)
    G.entities.forEach(e=>{ if(e.kind==='building' && !e.dead) markBuilding(G,e,true); });   // re-stamp blocked
    if(typeof markFundingNode==='function') G.entities.forEach(e=>{ if(e.type==='goldmine'&&!e.dead) markFundingNode(G,e); });
    G.selection=[]; G.groups={};                            // selection/groups are LOCAL per client
    if(typeof recomputeSupply==='function') recomputeSupply(G);
    if(typeof computeFog==='function') computeFog(G);
    NET.lastFull = s.netTick||0;
  };
  // called by mp.js right after the client builds terrain (newMap), to replay a snapshot that raced ahead
  NET.flushPendingFull = function(){
    if(NET._pendingFull && G){ const s=NET._pendingFull; NET._pendingFull=null; NET.applyFullSnapshot(s);
      if(typeof NET.onFullApplied==='function') NET.onFullApplied(); }
  };

  /* ---------------- compact per-entity snapshot (the 12 Hz hot path) ---------------- */
  function packEnt(e){
    if(e.type==='goldmine'){
      return { id:e.id, gm:1, x:e.x, y:e.y, amt:Math.round(e.amount), a0:e.amount0, ftx:e.ftx, fty:e.fty, r:e.r };
    }
    const o = { id:e.id, t:e.type, o:e.owner, k:e.kind, c:e.ctrl,
                x:Math.round(e.x*10)/10, y:Math.round(e.y*10)/10, hp:Math.round(e.hp), mh:e.maxHp };
    if(e.kind==='unit'){
      if(e.state) o.s=e.state;
      if(e.state==='move'||e.state==='gather') o.mv=1;   // authoritative "locomoting" hint so the client keeps the walk cycle running through the position-ease
      if(e._actState) o.as=e._actState;
      if(e._actState==='attack' && e._actStamp!=null) o.ast=Math.round(e._actStamp*1000)/1000;  // strike time → drives the attack windup frame
      if(e._face) o.f=e._face;
      if(e.dir) o.d=Math.round(e.dir*100)/100;
      if(e.carrying) o.cr=e.carrying;
      if(e.stars) o.st=e.stars;
      if(e.spriteType) o.sp=e.spriteType;
      if(e.air) o.air=1;
      if(e.hero) o.h=1;
      if(e.sieged) o.sg=1;
      if(e.captive) o.cap=1;
      if(e.sprinting) o.spr=1;
      if(e.storedIn) o.si=e.storedIn;
      if(e.cmd && e.cmd.target && !e.cmd.target.dead) o.tg=e.cmd.target.id;   // chase/attack render
    } else if(e.kind==='building'){
      o.tx=e.tx; o.ty=e.ty; o.w=e.w; o.h=e.h;
      if(e.constructing){ o.cn=1; o.bp=e.buildProg; o.bt=e.buildTime; }
      if(e.prodQueue && e.prodQueue.length){ o.pq=e.prodQueue.slice(); o.pt=e.prodTime; o.ptt=e.prodTotal; }
      if(e.abandoned) o.ab=1;
      if(e.storedUnits && e.storedUnits.length) o.su=e.storedUnits.slice();
      if(e._everSeen) o.es=1;
      if(e.rally) o.rl={x:e.rally.x,y:e.rally.y};
      if(e.shootFx){ o.sf=1; o.sfx=Math.round(e.shootFx.x*10)/10; o.sfy=Math.round(e.shootFx.y*10)/10; }  // muzzle-flash flag + shot endpoint (client rebuilds the transient to draw the shot line)
    }
    return o;
  }
  function unpackInto(e, o, snapTime){
    if(snapTime==null) snapTime = (typeof G!=='undefined' && G && G.time) || 0;
    if(o.gm){ e.type='goldmine'; e.owner=null; e.x=o.x; e.y=o.y; e.amount=o.amt; e.amount0=o.a0;
              e.ftx=o.ftx; e.fty=o.fty; e.r=o.r; e.dead=false; return; }
    const d=DEF[o.t]||{};
    e.type=o.t; e.owner=o.o; e.kind=o.k; e.ctrl=o.c; e.hp=o.hp; e.maxHp=o.mh; e.dead=false;
    if(o.k==='unit'){
      // Store the snapshot position as a SMOOTHING TARGET (_sx/_sy); clientTick eases the rendered
      // e.x/e.y toward it so units glide at render rate instead of teleporting at the 15 Hz snap rate.
      if(e.x==null){ e.x=o.x; e.y=o.y; }        // first sighting → snap into place
      e._sx=o.x; e._sy=o.y;
      // static stats come from DEF — the client never simulates, it only renders/picks
      e.r=d.r; e.sight=d.sight; e.air=!!o.air; e.speed=d.speed; e.range=d.range; e.dmg=d.dmg;
      e.state=o.s||'idle'; e._actState=o.as||null; e._face=o.f||e._face||1; e.dir=o.d||0;
      e._netMoving=!!o.mv;                               // host-authoritative locomotion flag (see render moving-check)
      // _actStamp is the HOST's state.time at the strike; rebase it into the client's OWN clock so the
      // attack-windup frame (render: t = state.time - _actStamp) stays correct despite client/host G.time
      // drift. Guard on _lastAst so the same swing isn't re-based every snapshot — only on a fresh strike.
      if(o.ast!=null){ if(o.ast!==e._lastAst){ e._actStamp=(G.time||0)-(snapTime-o.ast); e._lastAst=o.ast; } }
      else e._lastAst=null;
      e.carrying=o.cr||0; e.stars=o.st||0; e.spriteType=o.sp||null;
      e.hero=!!o.h; e.sieged=!!o.sg; e.captive=!!o.cap; e.sprinting=!!o.spr;
      if(o.si!=null) e.storedIn=o.si; else delete e.storedIn;
      e._tgtId = o.tg!=null ? o.tg : null;
    } else if(o.k==='building'){
      e.x=o.x; e.y=o.y;                          // buildings don't move → snap directly
      e.tx=o.tx; e.ty=o.ty; e.w=o.w; e.h=o.h; e.sight=d.sight; e.cd=e.cd||0;
      e.constructing=!!o.cn; e.buildProg=o.bp||0; e.buildTime=o.bt||d.build;
      e.prodQueue=o.pq||[]; e.prodTime=o.pt||0; e.prodTotal=o.ptt||0;
      e.storedUnits=o.su||[];
      e.abandoned=!!o.ab; e._everSeen=!!o.es; e.rally=o.rl||null;
      // turret/HQ muzzle-flash: host packs o.sf=1 (+ shot endpoint o.sfx/o.sfy). Rebuild the transient so
      // the shoot-FX render pass can draw the shot line on the client (render decays .t locally at 1/60).
      if(o.sf) e.shootFx = (e.shootFx && e.shootFx.t>0) ? e.shootFx : { x:(o.sfx!=null?o.sfx:e.x), y:(o.sfy!=null?o.sfy:e.y), t:0.1 };
    }
  }
  NET.buildSnap = function(){
    const ents=[];
    for(const e of G.entities){ if(!e.dead) ents.push(packEnt(e)); }
    const snap = { t:NET.tick, ents, eco:G.eco, time:G.time, wave:G.waveCount, over:!!G.over };
    if(G.hub && typeof serializeHubCampaign==='function') snap.campaign=serializeHubCampaign();
    return snap;
  };
  NET.applySnap = function(snap){
    const hadCampaign = !!snap.campaign;
    if(hadCampaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(snap.campaign);
    if(snap.eco) G.eco = snap.eco;
    // G.time is advanced locally every frame (clientTick) so time-driven sprite animations run at
    // render rate; only HARD-resync it if it has drifted far from the host (e.g. after a background gap).
    if(snap.time!=null && (G.time==null || Math.abs(G.time - snap.time) > 0.5)) G.time = snap.time;
    if(snap.wave!=null) G.waveCount = snap.wave;
    // merge entities by id (preserves per-entity render transients: _ax/_ay/hitFx/_walkDist)
    const incoming = new Map(snap.ents.map(o=>[o.id,o]));
    const byId = new Map();
    for(let i=G.entities.length-1;i>=0;i--){
      const e=G.entities[i], o=incoming.get(e.id);
      if(o){ unpackInto(e,o,snap.time); byId.set(e.id,e); incoming.delete(e.id); }
      else { G.entities.splice(i,1); }                 // gone on the host → remove on the client
    }
    for(const o of incoming.values()){ const e={selected:false}; unpackInto(e,o,snap.time); G.entities.push(e); byId.set(e.id,e); }
    // resolve unit target refs so chase/attack rendering works (host sent target as an id)
    for(const e of G.entities){ if(e._tgtId!=null){ const t=byId.get(e._tgtId); e.cmd = t?{type:'attack',target:t}:null; e._tgtId=null; } }
    const beforeSel=G.selection.length;
    G.selection=G.selection.filter(e=>{
      const keep=e && !e.dead && !e.storedIn;
      if(!keep && e) e.selected=false;
      return keep;
    });
    if(G.selection.length!==beforeSel && typeof refreshUI==='function') refreshUI();
    if(snap.over && !G.over){ G.over=true; if(typeof NET.onClientGameOver==='function') NET.onClientGameOver(); }
    if(typeof recomputeSupply==='function') recomputeSupply(G);   // keep the joiner's HUD supply honest
    if(hadCampaign && typeof refreshUI==='function') refreshUI();
  };

  /* ---------------- chunked send/receive for the (larger) full snapshot ---------------- */
  let chunkSeq = 0;
  NET.sendFull = function(toPeer){
    const str = JSON.stringify(NET.serializeForNet());
    const CH = 12*1024, id = ++chunkSeq, n = Math.ceil(str.length/CH);
    for(let i=0;i<n;i++) MP.send('mpfull', { id, i, n, d: str.slice(i*CH,(i+1)*CH) }, toPeer);
  };
  NET._recvFull = function(p){
    const b = NET._chunk[p.id] || (NET._chunk[p.id] = { n:p.n, got:0, parts:[] });
    if(b.parts[p.i]===undefined){ b.parts[p.i]=p.d; b.got++; }
    if(b.got>=b.n){ delete NET._chunk[p.id];
      try { NET.applyFullSnapshot(JSON.parse(b.parts.join(''))); if(typeof NET.onFullApplied==='function') NET.onFullApplied(); }
      catch(err){ console.warn('[mp] full snapshot parse failed', err); }
    }
  };

  /* ---------------- per-frame driver (called from main.js loop) ---------------- */
  NET.hostTick = function(dt){
    NET.tick++;
    NET._sAcc += dt;
    // No periodic full keyframe: each compact snap is already a full entity set (adds spawns, drops
    // deaths), so it self-heals — and a recurring full would yank the joiner's camera/selection.
    if(NET._sAcc >= 1/NET.DELTA_HZ){ NET._sAcc = 0; MP.send('mpsnap', NET.buildSnap()); }
  };
  NET.clientTick = function(dt){
    if(!G) return;
    // 0) advance the animation clock locally so time-driven sprite anims (attack windup, mine/heal loops,
    //    idle breathing) play smoothly at render rate instead of stepping at the snapshot rate / stalling
    //    under load. applySnap soft-resyncs it to the host's authoritative time when drift is large.
    G.time = (G.time||0) + dt;
    // 1) glide unit positions toward their latest snapshot target so movement is smooth at render rate
    //    rather than stepping at the 15 Hz snapshot rate. Big jumps (spawn/teleport) snap instantly.
    const k = Math.min(1, dt * NET.SMOOTH_RATE), snap2 = (TILE*2.5)*(TILE*2.5);
    for(const e of G.entities){
      if(e.kind!=='unit' || e.dead || e._sx==null) continue;
      const dx=e._sx-e.x, dy=e._sy-e.y;
      if(dx*dx+dy*dy > snap2){ e.x=e._sx; e.y=e._sy; }
      else { e.x += dx*k; e.y += dy*k; }
    }
    // 2) cosmetic systems that normally live inside update() — the client skips update(), so without
    //    these the sprint ripple never decays, ambient visuals freeze, and speech boxes stay invisible.
    if(typeof updateSprint==='function')    updateSprint(G, dt);
    if(typeof updateParticles==='function') updateParticles(G, dt);
    if(typeof updateWater==='function')     updateWater(G, dt);
    if(typeof updateDialogs==='function')   updateDialogs(G, dt);
    // the client owns its fog: it has every unit's position, so computeFog reproduces shared vision.
    if(typeof computeFog==='function')      computeFog(G);
    // 3) host-liveness watchdog: no snapshot for too long → the host crashed/dropped. Warn first, then end.
    if(netRole==='client' && running && !NET._hostGone && NET.lastRecvAt){
      const gap = _now() - NET.lastRecvAt;
      if(gap > NET.LOST_MS){ NET._hostGone = true; if(typeof NET.onHostLost==='function') NET.onHostLost(); }
      else if(gap > NET.STALL_MS && !NET._stalled){ NET._stalled = true; if(typeof NET.onStall==='function') NET.onStall(); }
    }
  };

  /* ---------------- receive wiring (registered once a room is entered) ---------------- */
  NET.bindClientReceivers = function(){
    MP.on('mpfull', (p)=>{ NET.markRecv(); NET._recvFull(p); });
    MP.on('mpsnap', (s)=>{ NET.markRecv(); if(netRole==='client' && G && NET.lastFull>=0) NET.applySnap(s); });
  };
})();
