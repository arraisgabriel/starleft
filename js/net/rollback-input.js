/* js/net/rollback-input.js — CLASSIC. The RTS input model for rollback.
   Rollback feeds session.tick(localInput: Uint8Array) every fixed tick; Game.step(inputs: Map<playerId,u8>)
   applies all players' inputs. STARLEFT commands are SPARSE (most ticks idle), so:
     - encode: idle tick = a single 0 byte; a tick with commands = [1, ...JSON(cmds)] (cmds = the {k,...} objects
       the existing net* wrappers already build in commands.js — reused verbatim, sans the host-auth from/seq).
     - apply (rbApplyInputs): decode each player's input, scope to that player's ctrl (NET.rbCtrlOf[playerId]),
       reconstruct selection from entity ids, and call the UNCHANGED appliers (commandUnits/tryTrain/…). Players
       are iterated in sorted id order so a same-tick clash resolves identically on every peer.
     - predict: PREDICT_EMPTY (NET.rbPredictor) — remote players are assumed idle (NOT repeat-last, which would
       re-issue a move every tick). Rare misprediction (a real command) → a cheap rollback. */
(function(){
  const NET = (window.NET = window.NET || {});

  NET.rbCtrlOf = NET.rbCtrlOf || {};   // playerId -> 'p1'|'p2'|'p3'  (populated by the lobby; the tests set it)

  NET.rbEncodeInput = function(cmds){
    if(!cmds || !cmds.length) return new Uint8Array([0]);
    const j = new TextEncoder().encode(JSON.stringify(cmds));
    const out = new Uint8Array(j.length + 1); out[0] = 1; out.set(j, 1); return out;
  };
  NET.rbDecodeInput = function(u8){
    if(!u8 || !u8.length || u8[0] === 0) return [];
    try{ return JSON.parse(new TextDecoder().decode(u8.subarray(1))); }catch(_){ return []; }
  };

  // Predict remote players as IDLE (one 0 byte). Sparse RTS inputs → almost always correct → almost no rollback.
  NET.rbPredictor = { predict: function(_playerId, _tick, _lastConfirmed){ return new Uint8Array([0]); } };

  // Suppress a command applier's cosmetic feedback (toast/spawnRing) while it runs INSIDE step() — those are
  // state-less and would re-fire on every rollback re-sim. The LOCAL player's click feedback fires at dispatch
  // time instead (B5). Mirrors commands.js quiet().
  function quietApply(fn){
    const t = window.toast, sr = window.spawnRing;
    try{ window.toast = function(){}; if(sr) window.spawnRing = function(){}; fn(); }
    finally{ window.toast = t; if(sr) window.spawnRing = sr; }
  }

  function idIndex(state){ const m = new Map(); for(const e of state.entities) if(!e.dead) m.set(e.id, e); return m; }

  // Apply ONE command, scoped to `ctrl`, on `state`. Mirrors commands.js applyRemoteCmd ownership checks, but
  // the controller comes from the playerId→ctrl map (anti-spoof) rather than a self-declared field.
  function applyOne(state, ctrl, cmd){
    const saveSel = state.selection, saveCtrl = state._cmdCtrl;
    state._cmdCtrl = ctrl;
    try{
      const byId = idIndex(state);
      if(cmd.k === 'command'){
        const sel = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&!e.storedIn&&e.owner==='player'&&(e.ctrl||'p1')===ctrl)
          .concat((cmd.bids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&e.owner==='player'&&(e.ctrl||'p1')===ctrl));
        if(!sel.length) return;
        const target = cmd.tid!=null ? (byId.get(cmd.tid)||null) : null;
        state.selection = sel;
        if(typeof commandUnits==='function') quietApply(()=> commandUnits(state, cmd.wx, cmd.wy, target));
      } else if(cmd.k === 'place'){
        const builder = cmd.bid!=null ? byId.get(cmd.bid) : null;
        if(builder && (builder.owner!=='player' || (builder.ctrl||'p1')!==ctrl)) return;
        if(typeof placeBuilding==='function') quietApply(()=>{ const b = placeBuilding(state, cmd.type, cmd.tx, cmd.ty, builder); if(b) b.ctrl = ctrl; });
      } else if(cmd.k === 'stop'){
        const sel = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&(e.ctrl||'p1')===ctrl);
        if(!sel.length) return;
        state.selection = sel;
        if(typeof stopSelection==='function') quietApply(()=> stopSelection());
      } else if(cmd.k === 'train'){
        const b = byId.get(cmd.bid); if(!b || b.owner!=='player' || (b.ctrl||'p1')!==ctrl) return;
        if(typeof tryTrain==='function') quietApply(()=> tryTrain(state, b, cmd.type));
      } else if(cmd.k === 'cancel'){
        const b = byId.get(cmd.bid); if(!b || (b.ctrl||'p1')!==ctrl) return;
        if(typeof cancelTrain==='function') quietApply(()=> cancelTrain(state, b, cmd.index));
      } else if(cmd.k === 'releaseStored'){
        const b = byId.get(cmd.bid), u = byId.get(cmd.uid);
        if(!b || b.owner!=='player' || b.type!=='hq' || (b.ctrl||'p1')!==ctrl) return;
        if(!u || u.owner!=='player' || u.storedIn!==b.id) return;
        if(typeof releaseStoredUnit==='function') quietApply(()=> releaseStoredUnit(state, b, cmd.uid));
      } else if(cmd.k === 'amove'){
        const sel = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&!e.storedIn&&e.owner==='player'&&(e.ctrl||'p1')===ctrl);
        if(!sel.length) return;
        state.selection = sel;
        if(typeof commandAttackMove==='function') quietApply(()=> commandAttackMove(state, cmd.wx, cmd.wy));
      } else if(cmd.k === 'stance'){
        const sel = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&e.owner==='player'&&(e.ctrl||'p1')===ctrl);
        if(sel.length && typeof setStance==='function') quietApply(()=> setStance(state, sel, cmd.stance));
      } else if(cmd.k === 'ability'){
        const sel = (cmd.ids||[]).map(id=>byId.get(id)).filter(e=>e&&!e.dead&&!e.storedIn&&e.owner==='player'&&(e.ctrl||'p1')===ctrl);
        if(sel.length && typeof castAbility==='function') quietApply(()=> castAbility(state, sel));
      }
    } finally { state.selection = saveSel; state._cmdCtrl = saveCtrl; }
  }

  // Called from Game.step(): apply every player's input for this tick, deterministically (sorted player order).
  window.rbApplyInputs = function(state, inputs){
    if(!inputs || !inputs.size) return;
    const pids = Array.from(inputs.keys()).sort();
    for(const pid of pids){
      const cmds = NET.rbDecodeInput(inputs.get(pid));
      if(!cmds.length) continue;
      const ctrl = NET.rbCtrlOf[pid] || 'p1';
      for(const cmd of cmds) applyOne(state, ctrl, cmd);
    }
  };

  // Validate the INPUT MODEL in-process: like rbLocalTest but the host issues a real MOVE at tick 120. With a
  // predicted-idle remote, the guest mispredicts that tick → a (small) ROLLBACK → re-applies the move. Predicted
  // ticks transiently differ, so we assert the FINAL reconciled hashes match (+ that neither desynced).
  // Run: NET.rbLocalCmdTest(0, 600, 12345).
  NET.rbLocalCmdTest = function(idx, ticks, seed){
    idx = idx|0; ticks = ticks||600; seed = (seed==null?12345:seed)>>>0;
    if(typeof whenRB!=='function'){ console.error('[rb] whenRB unavailable'); return; }
    whenRB(()=>{
      const RB = window.RB;
      if(!RB || RB.unavailable){ console.error('[rb] window.RB unavailable'); return; }
      const quiet = NET._quiet || ((fn)=>fn());
      const savedIdx = (typeof mapIndex!=='undefined')?mapIndex:0, savedPending = (typeof pendingPlayers!=='undefined')?pendingPlayers:1;
      const restore = ()=>{ if(typeof mapIndex!=='undefined') mapIndex=savedIdx; if(typeof pendingPlayers!=='undefined') pendingPlayers=savedPending; };
      try{
        if(typeof pendingPlayers!=='undefined') pendingPlayers = 2;
        if(typeof mapIndex!=='undefined') mapIndex = idx;
        const initState = newMap(idx); initState.runSalt = seed; delete initState._simSeeded;
        const tHost = new RB.LocalTransport('host',{latency:0,jitter:0}), tGuest = new RB.LocalTransport('guest',{latency:0,jitter:0});
        RB.LocalTransport.link(tHost, tGuest);
        const gHost = NET.makeStarleftGame(initState), gGuest = NET.makeStarleftGame(newMap(idx));
        NET.rbCtrlOf = { host:'p1', guest:'p2' };
        const cfg = { topology:RB.Topology.Star, desyncAuthority:RB.DesyncAuthority.Host, tickRate:60, hashInterval:30, maxPlayers:3 };
        const sHost  = RB.createSession({ game:gHost,  transport:tHost,  localPlayerId:'host',  inputPredictor:NET.rbPredictor, config:cfg });
        const sGuest = RB.createSession({ game:gGuest, transport:tGuest, localPlayerId:'guest', inputPredictor:NET.rbPredictor, config:cfg });
        let desync=false, rollbacks=0;
        sHost.on && sHost.on('desync', ()=>{desync=true;});
        sGuest.on && sGuest.on('desync', ()=>{desync=true;});
        const empty=()=> new Uint8Array([0]);
        const flushN=()=>{ for(let f=0;f<6;f++){ tHost.flush(); tGuest.flush(); } };
        console.log('[rb] cmdtest: creating room…');
        sHost.createRoom().then(()=>{ sHost.start(); return sGuest.joinRoom(sHost.roomId,'host'); }).then(()=>{
          flushN(); console.log('[rb] cmdtest: joined; running '+ticks+' ticks with a MOVE at tick 120…');
          quiet(()=>{
            for(let i=0;i<ticks;i++){
              let hi = empty();
              if(i===120){
                const u = (gHost.getState().entities||[]).find(e=>e&&!e.dead&&e.owner==='player'&&e.kind==='unit'&&(e.ctrl||'p1')==='p1');
                if(u){ hi = NET.rbEncodeInput([{k:'command', wx:u.x+280, wy:u.y, tid:null, ids:[u.id], bids:[]}]); console.log('[rb] cmdtest: host MOVE unit '+u.id+' → ('+Math.round(u.x+280)+','+Math.round(u.y)+')'); }
              }
              const r1=sHost.tick(hi), r2=sGuest.tick(empty());
              if(r1&&r1.rolledBack) rollbacks++; if(r2&&r2.rolledBack) rollbacks++;
              tHost.tick(1000/60); tGuest.tick(1000/60); flushN();
            }
            // settle: a few extra ticks so the late command fully reconciles on the guest
            for(let i=0;i<10;i++){ sHost.tick(empty()); sGuest.tick(empty()); tHost.tick(1000/60); tGuest.tick(1000/60); flushN(); }
          });
          restore();
          const same = gHost.hash()===gGuest.hash();
          if(same && !desync) console.log('%c[rb] CMD PASS','color:#3f3;font-weight:bold','— host command replicated + reconciled; final states identical (0x'+(gHost.hash()>>>0).toString(16)+'), rollbacks='+rollbacks+', no desync. The input model works.');
          else console.warn('%c[rb] CMD FAIL','color:#f55;font-weight:bold','— final host 0x'+(gHost.hash()>>>0).toString(16)+' vs guest 0x'+(gGuest.hash()>>>0).toString(16)+', desync='+desync+'. (input apply or predictor issue.)');
        }).catch((e)=>{ restore(); console.error('[rb] cmdtest failed:', e); });
      }catch(err){ restore(); console.error('[rb] cmdtest threw:', err); }
    });
  };
})();
