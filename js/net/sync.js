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
  NET.DELTA_HZ = 12;       // compact-snapshot rate
  NET.KEY_SEC  = 5;        // full-keyframe interval (drift insurance + late-joiner safety)
  NET._sAcc = 0; NET._kAcc = 0;
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
    // G already came from newMap(mapIndex) on the client, so terrain is correct. Overlay dynamic state:
    const SCALAR = ['eco','players','time','waveCount','graceTime','nextId','runSalt','over',
                    'enemySpawnTimer','enemyWaveTimer','enemyFortifyTimer','_recalibratedFor','_coopOrigins'];
    for(const k of SCALAR){ if(s[k]!==undefined) G[k]=s[k]; }
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
      if(e._actState) o.as=e._actState;
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
      if(e.cmd && e.cmd.target && !e.cmd.target.dead) o.tg=e.cmd.target.id;   // chase/attack render
    } else if(e.kind==='building'){
      o.tx=e.tx; o.ty=e.ty; o.w=e.w; o.h=e.h;
      if(e.constructing){ o.cn=1; o.bp=e.buildProg; o.bt=e.buildTime; }
      if(e.prodQueue && e.prodQueue.length){ o.pq=e.prodQueue.slice(); o.pt=e.prodTime; o.ptt=e.prodTotal; }
      if(e.abandoned) o.ab=1;
      if(e._everSeen) o.es=1;
      if(e.rally) o.rl={x:e.rally.x,y:e.rally.y};
      if(e.shootFx) o.sf=1;
    }
    return o;
  }
  function unpackInto(e, o){
    if(o.gm){ e.type='goldmine'; e.owner=null; e.x=o.x; e.y=o.y; e.amount=o.amt; e.amount0=o.a0;
              e.ftx=o.ftx; e.fty=o.fty; e.r=o.r; e.dead=false; return; }
    const d=DEF[o.t]||{};
    e.type=o.t; e.owner=o.o; e.kind=o.k; e.ctrl=o.c; e.x=o.x; e.y=o.y; e.hp=o.hp; e.maxHp=o.mh; e.dead=false;
    if(o.k==='unit'){
      // static stats come from DEF — the client never simulates, it only renders/picks
      e.r=d.r; e.sight=d.sight; e.air=!!o.air; e.speed=d.speed; e.range=d.range; e.dmg=d.dmg;
      e.state=o.s||'idle'; e._actState=o.as||null; e._face=o.f||e._face||1; e.dir=o.d||0;
      e.carrying=o.cr||0; e.stars=o.st||0; e.spriteType=o.sp||null;
      e.hero=!!o.h; e.sieged=!!o.sg; e.captive=!!o.cap; e.sprinting=!!o.spr;
      e._tgtId = o.tg!=null ? o.tg : null;
    } else if(o.k==='building'){
      e.tx=o.tx; e.ty=o.ty; e.w=o.w; e.h=o.h; e.sight=d.sight; e.cd=e.cd||0;
      e.constructing=!!o.cn; e.buildProg=o.bp||0; e.buildTime=o.bt||d.build;
      e.prodQueue=o.pq||[]; e.prodTime=o.pt||0; e.prodTotal=o.ptt||0;
      e.abandoned=!!o.ab; e._everSeen=!!o.es; e.rally=o.rl||null;
    }
  }
  NET.buildSnap = function(){
    const ents=[];
    for(const e of G.entities){ if(!e.dead) ents.push(packEnt(e)); }
    return { t:NET.tick, ents, eco:G.eco, time:G.time, wave:G.waveCount, over:!!G.over };
  };
  NET.applySnap = function(snap){
    if(snap.eco) G.eco = snap.eco;
    if(snap.time!=null) G.time = snap.time;
    if(snap.wave!=null) G.waveCount = snap.wave;
    // merge entities by id (preserves per-entity render transients: _ax/_ay/hitFx/_walkDist)
    const incoming = new Map(snap.ents.map(o=>[o.id,o]));
    const byId = new Map();
    for(let i=G.entities.length-1;i>=0;i--){
      const e=G.entities[i], o=incoming.get(e.id);
      if(o){ unpackInto(e,o); byId.set(e.id,e); incoming.delete(e.id); }
      else { G.entities.splice(i,1); }                 // gone on the host → remove on the client
    }
    for(const o of incoming.values()){ const e={selected:false}; unpackInto(e,o); G.entities.push(e); byId.set(e.id,e); }
    // resolve unit target refs so chase/attack rendering works (host sent target as an id)
    for(const e of G.entities){ if(e._tgtId!=null){ const t=byId.get(e._tgtId); e.cmd = t?{type:'attack',target:t}:null; e._tgtId=null; } }
    if(snap.over && !G.over){ G.over=true; if(typeof NET.onClientGameOver==='function') NET.onClientGameOver(); }
    if(typeof recomputeSupply==='function') recomputeSupply(G);   // keep the joiner's HUD supply honest
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
    NET._sAcc += dt; NET._kAcc += dt;
    if(NET._kAcc >= NET.KEY_SEC){ NET._kAcc = 0; NET.sendFull(); }      // periodic keyframe (drift/late-join safety)
    if(NET._sAcc >= 1/NET.DELTA_HZ){ NET._sAcc = 0; MP.send('mpsnap', NET.buildSnap()); }
  };
  NET.clientTick = function(dt){
    // v1: no interpolation — positions snap at the snapshot rate (render.js already eases animation).
    // The client owns its fog: it has every unit's position, so computeFog reproduces shared vision.
    if(typeof computeFog==='function' && G) computeFog(G);
  };

  /* ---------------- receive wiring (registered once a room is entered) ---------------- */
  NET.bindClientReceivers = function(){
    MP.on('mpfull', (p)=>NET._recvFull(p));
    MP.on('mpsnap', (s)=>{ if(netRole==='client' && G && NET.lastFull>=0) NET.applySnap(s); });   // ignore until first full keyframe
  };
})();
