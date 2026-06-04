/* js/net/commands.js — CLASSIC. Command replication.
   The networked surface is tiny: only commandUnits / placeBuilding / stopSelection / tryTrain /
   cancelTrain mutate the sim. On the CLIENT these become 'mpcmd' messages; on HOST/SOLO they run
   directly. The HOST replays a remote command through the SAME existing functions by temporarily
   scoping G.selection + the acting controller (state._cmdCtrl) and suppressing toast/SFX — so there
   is zero duplicated sim logic, and the result flows back to the client in the next snapshot.
   Selection, box-select, camera, zoom and control groups stay 100% LOCAL (never networked). */
(function(){
  const NET = (window.NET = window.NET || {});

  /* ---------------- client → host capture (host/solo run directly) ---------------- */
  function hubClientBlocked(state){
    if(state && state.hub && LOCAL_CTRL!=='p1'){
      toast('Only the host can operate the H.U.B.');
      return true;
    }
    return false;
  }
  function netCommand(state, wx, wy, target){
    if(hubClientBlocked(state)) return;
    if(netRole!=='client') return commandUnits(state, wx, wy, target);
    const myUnits = state.selection.filter(e=>!e.dead && !e.storedIn && e.kind==='unit' && isMine(e));
    const ids  = myUnits.map(e=>e.id);
    const bids = state.selection.filter(e=>!e.dead && e.kind==='building' && isMine(e)).map(e=>e.id);
    if(!ids.length && !bids.length) return;
    const seq = NET._cmdSeq = (NET._cmdSeq||0)+1;
    MP.send('mpcmd', { k:'command', from:LOCAL_CTRL, wx, wy, tid: target ? target.id : null, ids, bids, seq });
    // Phase 3: predict a plain MOVE (no target) on our own units so they respond instantly; the host stays
    // authoritative and the next acked snapshot reconciles (blends back) — see NET.clientTick / applySnap.
    if(NET.PREDICT && !target){
      const at = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
      for(const e of myUnits){ e._pred=true; e._predSeq=seq; e._predTo={x:wx,y:wy}; e._predAt=at; e.state='move'; e._netMoving=true; }
    }
  }
  function netPlace(state, type, tx, ty, builder){
    if(hubClientBlocked(state)) return;
    if(netRole!=='client') return placeBuilding(state, type, tx, ty, builder);
    MP.send('mpcmd', { k:'place', from:LOCAL_CTRL, type, tx, ty, bid: builder ? builder.id : null, seq:(NET._cmdSeq=(NET._cmdSeq||0)+1) });
  }
  function netStop(){
    if(hubClientBlocked(G)) return;
    if(netRole!=='client') return stopSelection();
    const ids = G.selection.filter(e=>!e.dead && e.kind==='unit' && isMine(e)).map(e=>e.id);
    if(ids.length) MP.send('mpcmd', { k:'stop', from:LOCAL_CTRL, ids, seq:(NET._cmdSeq=(NET._cmdSeq||0)+1) });
  }
  function netTrain(state, building, type){
    if(hubClientBlocked(state)) return;
    if(netRole!=='client') return tryTrain(state, building, type);
    if(building && isMine(building)) MP.send('mpcmd', { k:'train', from:LOCAL_CTRL, bid:building.id, type, seq:(NET._cmdSeq=(NET._cmdSeq||0)+1) });
  }
  function netCancelTrain(state, building, index){
    if(hubClientBlocked(state)) return;
    if(netRole!=='client') return cancelTrain(state, building, index);
    if(building && isMine(building)) MP.send('mpcmd', { k:'cancel', from:LOCAL_CTRL, bid:building.id, index, seq:(NET._cmdSeq=(NET._cmdSeq||0)+1) });
  }
  function netReleaseStored(state, building, unitId){
    if(hubClientBlocked(state)) return;
    if(netRole!=='client') return releaseStoredUnit(state, building, unitId);
    if(building && isMine(building)) MP.send('mpcmd', { k:'releaseStored', from:LOCAL_CTRL, bid:building.id, uid:unitId, seq:(NET._cmdSeq=(NET._cmdSeq||0)+1) });
  }
  window.netCommand=netCommand; window.netPlace=netPlace; window.netStop=netStop;
  window.netTrain=netTrain; window.netCancelTrain=netCancelTrain; window.netReleaseStored=netReleaseStored;

  /* ---------------- host: validate + replay a remote command ---------------- */
  function idIndex(state){ const m=new Map(); for(const e of state.entities) if(!e.dead) m.set(e.id,e); return m; }

  // suppress toast()/spawnRing() while replaying a peer's command (no feedback spam on the host screen)
  function quiet(fn){
    const t=window.toast, sr=window.spawnRing;
    try{ window.toast=function(){}; if(sr) window.spawnRing=function(){}; fn(); }
    finally{ window.toast=t; if(sr) window.spawnRing=sr; }
  }
  function runScoped(ctrl, sel, fn){
    const saveSel=G.selection, saveCtrl=G._cmdCtrl;
    G.selection=sel; G._cmdCtrl=ctrl;
    quiet(fn);
    G.selection=saveSel; G._cmdCtrl=saveCtrl;
  }

  NET.applyRemoteCmd = function(cmd, peerId){
    if(netRole!=='host' || !G) return;
    if(cmd && cmd.seq!=null) NET._cmdAck = Math.max(NET._cmdAck||0, cmd.seq);   // Phase 3: ack every received command (applied or rejected) so the client can reconcile its prediction
    const ctrl = NET.peerCtrl[peerId];
    if(!ctrl || cmd.from!==ctrl) return;               // anti-spoof: a peer may only act as its own controller
    if(G.hub && ctrl!=='p1') return;                    // HUB belongs to the host/P1 only
    const byId = idIndex(G);

    if(cmd.k==='command'){
      const mine = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&!e.storedIn&&e.owner==='player'&&(e.ctrl||'p1')===ctrl);
      const bmine= (cmd.bids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&e.owner==='player'&&(e.ctrl||'p1')===ctrl);
      if(!mine.length && !bmine.length) return;
      const target = cmd.tid!=null ? (byId.get(cmd.tid)||null) : null;
      runScoped(ctrl, mine.concat(bmine), ()=> commandUnits(G, cmd.wx, cmd.wy, target));
    } else if(cmd.k==='place'){
      const def=DEF[cmd.type]; if(!def) return;
      const builder = cmd.bid!=null ? byId.get(cmd.bid) : null;
      if(builder && (builder.owner!=='player' || (builder.ctrl||'p1')!==ctrl)) return;  // must use own Intern
      if(playerEco(G, ctrl).gold < def.cost) return;                                    // afford from own pool
      if(!canPlaceAt(G, cmd.type, cmd.tx, cmd.ty)) return;
      const saveCtrl=G._cmdCtrl; G._cmdCtrl=ctrl;
      quiet(()=>{ const b=placeBuilding(G, cmd.type, cmd.tx, cmd.ty, builder); if(b) b.ctrl=ctrl; });
      G._cmdCtrl=saveCtrl;
    } else if(cmd.k==='stop'){
      const mine=(cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&(e.ctrl||'p1')===ctrl);
      if(!mine.length) return;
      runScoped(ctrl, mine, ()=> stopSelection());
    } else if(cmd.k==='train'){
      const b=byId.get(cmd.bid); if(!b||b.owner!=='player'||(b.ctrl||'p1')!==ctrl) return;
      quiet(()=> tryTrain(G, b, cmd.type));
    } else if(cmd.k==='cancel'){
      const b=byId.get(cmd.bid); if(!b||(b.ctrl||'p1')!==ctrl) return;
      quiet(()=> cancelTrain(G, b, cmd.index));
    } else if(cmd.k==='releaseStored'){
      const b=byId.get(cmd.bid), u=byId.get(cmd.uid);
      if(!b||b.owner!=='player'||b.type!=='hq'||(b.ctrl||'p1')!==ctrl) return;
      if(!u||u.owner!=='player'||u.storedIn!==b.id) return;
      quiet(()=> releaseStoredUnit(G, b, cmd.uid));
    }
  };

  NET.bindHostReceivers = function(){ MP.on('mpcmd', (cmd,peerId)=> NET.applyRemoteCmd(cmd,peerId)); };
})();
