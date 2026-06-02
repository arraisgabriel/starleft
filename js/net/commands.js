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
  function netCommand(state, wx, wy, target){
    if(netRole!=='client') return commandUnits(state, wx, wy, target);
    const ids  = state.selection.filter(e=>!e.dead && e.kind==='unit'     && isMine(e)).map(e=>e.id);
    const bids = state.selection.filter(e=>!e.dead && e.kind==='building' && isMine(e)).map(e=>e.id);
    if(!ids.length && !bids.length) return;
    MP.send('mpcmd', { k:'command', from:LOCAL_CTRL, wx, wy, tid: target ? target.id : null, ids, bids });
  }
  function netPlace(state, type, tx, ty, builder){
    if(netRole!=='client') return placeBuilding(state, type, tx, ty, builder);
    MP.send('mpcmd', { k:'place', from:LOCAL_CTRL, type, tx, ty, bid: builder ? builder.id : null });
  }
  function netStop(){
    if(netRole!=='client') return stopSelection();
    const ids = G.selection.filter(e=>!e.dead && e.kind==='unit' && isMine(e)).map(e=>e.id);
    if(ids.length) MP.send('mpcmd', { k:'stop', from:LOCAL_CTRL, ids });
  }
  function netTrain(state, building, type){
    if(netRole!=='client') return tryTrain(state, building, type);
    if(building && isMine(building)) MP.send('mpcmd', { k:'train', from:LOCAL_CTRL, bid:building.id, type });
  }
  function netCancelTrain(state, building, index){
    if(netRole!=='client') return cancelTrain(state, building, index);
    if(building && isMine(building)) MP.send('mpcmd', { k:'cancel', from:LOCAL_CTRL, bid:building.id, index });
  }
  window.netCommand=netCommand; window.netPlace=netPlace; window.netStop=netStop;
  window.netTrain=netTrain; window.netCancelTrain=netCancelTrain;

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
    const ctrl = NET.peerCtrl[peerId];
    if(!ctrl || cmd.from!==ctrl) return;               // anti-spoof: a peer may only act as its own controller
    const byId = idIndex(G);

    if(cmd.k==='command'){
      const mine = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&e.owner==='player'&&(e.ctrl||'p1')===ctrl);
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
    }
  };

  NET.bindHostReceivers = function(){ MP.on('mpcmd', (cmd,peerId)=> NET.applyRemoteCmd(cmd,peerId)); };
})();
