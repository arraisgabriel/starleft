/* js/net/determinism.js — CLASSIC. Rollback determinism experiment (Stage 0/1). READ-ONLY instrumentation;
   it does NOT change production netcode or the live loop.

   Why: before considering rollback netcode (which requires a bit-identical simulation on every peer), we
   must PROVE STARLEFT's sim can be made deterministic. Gameplay randomness now routes through the seeded
   simRandom() (js/state.js, enemyAI in js/ai.js), so a match is reproducible from its seed.

   - NET.simHash(state): order-stable 32-bit hash of the DYNAMIC sim state (entity positions/hp/combat +
     economy + scalars). Excludes terrain (regenerated), fog, camera, selection, and cosmetic lore — none of
     which are gameplay state. Two runs that simulate identically produce identical hashes.
   - NET.determinismTest(idx, ticks, seed): STAGE 0 — run the SAME map+seed twice in THIS engine and assert
     identical per-tick hashes. PASS ⇒ intra-engine determinism holds (RNG was the only divergence source).
     FAIL ⇒ prints the first diverging tick so the hidden non-determinism can be hunted. Run from the console.
   See docs/mp/netcode-decision.md for the verdict, Stage 1 (cross-browser) plan, and the decision gate. */
(function(){
  const NET = (window.NET = window.NET || {});

  // FNV-1a 32-bit over a string; q() quantizes a float onto an integer grid (cross-run-stable comparison).
  function fnv(h, str){ for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h>>>0; }
  function q(n, s){ return Math.round((n||0)*s); }

  // Hash the dynamic gameplay state. Entities are sorted by id so array order can't affect the result.
  NET.simHash = function(state){
    if(!state || !state.entities) return 0;
    let h = 2166136261>>>0;
    const ents = state.entities.filter(e=>e && !e.dead).slice().sort((a,b)=>(a.id||0)-(b.id||0));
    for(const e of ents){
      h = fnv(h, (e.id||0)+'|'+(e.type||'')+'|'+(e.owner||'')+'|'+(e.kind||'')+'|'+(e.ctrl||'')+'|'+
        q(e.x,100)+'|'+q(e.y,100)+'|'+q(e.hp,1)+'|'+(e.state||'')+'|'+(e._actState||'')+'|'+
        q(e.amount,1)+'|'+(e.constructing?1:0)+'|'+q(e.buildProg,100)+'|'+(e.carrying||0)+'|'+(e.cd>0?1:0));
    }
    if(state.eco) for(const k of Object.keys(state.eco).sort()){ const p=state.eco[k]||{};
      h = fnv(h, 'eco'+k+'|'+q(p.gold,1)+'|'+q(p.supply,1)+'|'+q(p.supplyCap,1)); }
    h = fnv(h, 'sc|'+q(state.time,100)+'|'+(state.waveCount||0)+'|'+(state.nextId||0)+'|'+(state.over?1:0)+
      '|'+q(state.enemySpawnTimer,100)+'|'+q(state.enemyWaveTimer,100)+'|'+q(state.enemyFortifyTimer,100));
    return h>>>0;
  };

  // Suppress UI / flow side-effects while replaying the sim headlessly (mirrors commands.js quiet()).
  // checkWinLose is neutered so a one-sided AI sim can run the full trace instead of freezing on `over`.
  function quiet(fn){
    const g = window, save = {};
    const stubs = ['toast','spawnRing','refreshUI','onVictory','onDefeat','beginExtractionPhase',
                   'enterHubFromCombat','recordFallen','syncHud','checkWinLose'];
    for(const k of stubs){ save[k]=g[k]; if(typeof g[k]==='function') g[k]=function(){}; }
    const lns = window.LNS, lnsUE = lns && lns.ultraEvent; if(lns) lns.ultraEvent=function(){};
    try{ fn(); } finally { for(const k of stubs) g[k]=save[k]; if(lns) lns.ultraEvent=lnsUE; }
  }
  NET._quiet = quiet;   // reused by the rollback round-trip self-test (js/net/rollback-game.js)

  // STAGE 0 — intra-engine determinism. Run the same map+seed twice; the per-tick hashes must match exactly.
  // Best run from the MAIN MENU (before starting a match) so it doesn't disturb a live game.
  NET.determinismTest = function(idx, ticks, seed){
    idx = idx|0; ticks = ticks||900; seed = (seed==null?12345:seed)>>>0;
    if(typeof newMap!=='function' || typeof update!=='function'){ console.error('[det] newMap/update unavailable — load a game first'); return false; }
    const run = ()=>{
      const g = newMap(idx);
      g.runSalt = seed; delete g._simSeeded;        // identical RNG seed across runs (enemyAI seeds simRandom from runSalt → G._simRngS)
      const hashes = [];
      quiet(()=>{ for(let i=0;i<ticks;i++){ update(g, 1/60); hashes.push(NET.simHash(g)); } });
      return hashes;
    };
    let A, B;
    try{ A = run(); B = run(); }
    catch(err){ console.error('[det] threw during replay:', err); return false; }
    for(let i=0;i<A.length;i++){
      if(A[i]!==B[i]){
        console.warn('%c[det] FAIL','color:#f55;font-weight:bold','— diverged at tick '+i+
          ' ('+(i/60).toFixed(2)+'s): '+(A[i]>>>0).toString(16)+' vs '+(B[i]>>>0).toString(16)+
          '. A hidden non-determinism source remains beyond the seeded RNG.');
        return false;
      }
    }
    console.log('%c[det] PASS','color:#3f3;font-weight:bold','— '+ticks+' ticks identical on map '+idx+
      ' (seed '+seed+'). Intra-engine determinism holds; RNG was the only divergence source. Final hash 0x'+
      (A[A.length-1]>>>0).toString(16)+'. Next: Stage 1 cross-browser shadow (see docs/mp/netcode-decision.md).');
    return true;
  };

  // STAGE 1 — cross-browser determinism. Run ONE sim and fold every per-tick hash into a single signature.
  // Run the SAME call in Chrome AND Firefox (AND Safari) and compare the one number: identical ⇒ cross-engine
  // FP determinism holds (rollback + 3-player viable); different ⇒ a transcendental (atan2/hypot/sin/cos)
  // diverged across engines. Use a LONG trace so enemy waves + fortify + unit movement (the FP-heavy paths)
  // are exercised PAST the grace period — a short trace mostly tests RNG, not floating point.
  NET.determinismSig = function(idx, ticks, seed){
    idx = idx|0; ticks = ticks||5400; seed = (seed==null?12345:seed)>>>0;
    if(typeof newMap!=='function' || typeof update!=='function'){ console.error('[det] newMap/update unavailable — load the game first'); return 0; }
    let sig = 2166136261>>>0;
    try{
      const g = newMap(idx); g.runSalt = seed; delete g._simSeeded;
      quiet(()=>{ for(let i=0;i<ticks;i++){ update(g, 1/60); sig = (Math.imul(sig ^ NET.simHash(g), 16777619))>>>0; } });
    }catch(err){ console.error('[det] threw during replay:', err); return 0; }
    console.log('%c[det] cross-browser signature 0x'+(sig>>>0).toString(16),'color:#6cf;font-weight:bold',
      '— map '+idx+', '+ticks+' ticks ('+(ticks/60|0)+'s), seed '+seed+'. Run the SAME call in another browser and compare this number.');
    return sig>>>0;
  };

  // Convenience: sweep a few maps/seeds. NET.determinismSweep([0,1,2], [1,2,3])
  NET.determinismSweep = function(maps, seeds){
    maps = maps || [0,1,2]; seeds = seeds || [1, 12345, 999999];
    let all = true;
    for(const m of maps) for(const s of seeds){ all = NET.determinismTest(m, 900, s) && all; }
    console.log(all ? '%c[det] SWEEP PASS' : '%c[det] SWEEP FAIL', all?'color:#3f3':'color:#f55');
    return all;
  };
})();
