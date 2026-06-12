/* perf.js — render benchmark + instrumentation harness. OFF unless ?perf=1 (or window.PERF_FORCE).
   GOAL: measure render cost correctly (Canvas2D draws are queued, so naive timing measures enqueue,
   not GPU work) and A/B every candidate optimization OFF vs ON with a hard pixel-diff gate.

   ZERO hot-loop cost when off: every hook in render.js/main.js/core.js is `if(PERF.on) PERF.mark(...)`,
   one global read + branch when disabled. Test-only scaffolding — never auto-runs, never changes gameplay.

   Loaded right after config.js so the cv/ctx globals exist; render/G/main are referenced lazily (at call
   time), by which point their scripts have loaded. */
(function(){
  'use strict';
  // PERF is defined unconditionally and first, so render.js hooks never throw even if the rest errors.
  const PERF = (window.PERF = window.PERF || {});

  const qs = (typeof location!=='undefined' && location.search) || '';
  const ON = /[?&]perf=1\b/.test(qs) || !!window.PERF_FORCE;
  const COUNT_CALLS = /[?&]calls=1\b/.test(qs);
  PERF.on = ON;
  PERF.driving = false;        // true while runWindow drives render itself (main.js then skips its render)
  PERF.opts = PERF.opts || {};
  // Optimization flags. Default TRUE === validated + shipped (passed the A/B + pixel-diff gate, so it is
  // the live behavior); default FALSE === still a candidate under evaluation (off in normal play). A/B runs
  // flip the flag explicitly, so OFF always reproduces the pre-optimization path for an apples-to-apples diff.
  const OPT_DEFAULTS = {
    minimapCache:true,                                  // SHIPPED — bigMap render p95 -53%, hub -39%, pixelDiff 0
    spriteLod:true,                                     // SHIPPED — light sprite (static frame, no anim/HUD) at near-min zoom only
    terrainChunks:true,                                 // ON for evaluation — terrain -73%, but slight min-zoom softening + re-bake hitch (see RESULTS.md)
    hubNpcs:true,                                       // living-city HUB NPCs (hub_npcs.js) — a FEATURE flag: A/B measures its cost, not a win
    npcMix:true,                                        // hub NPC wardrobe of band-mixed sprites (npc_sprites.js + hub_npcs.js) — FEATURE flag: A/B measures cost, pixelDiff>0 expected
    minimapThrottle:false, ctxOpaque:false, depthPool:false, waterMerge:false, fogCache:false,
    cullExtra:false, scrollBuffer:false, desync:false,
  };
  for(const k in OPT_DEFAULTS){ if(!(k in PERF.opts)) PERF.opts[k]=OPT_DEFAULTS[k]; }

  if(!ON){
    // hard no-ops so any stray call is free and safe when the harness is disabled
    PERF.mark=PERF.lap=PERF.frameStart=PERF.frameEnd=function(){};
    PERF.start=PERF.stop=function(){};
    return;
  }

  /* ---------------- per-frame capture ---------------- */
  const PHASES = ['total','render','clear','terrain','water','partBack','depthBuild','depthSort',
    'depthDraw','partFront','laser','fog','overlays','minimap','panorama','simUpdate','fogSim'];
  const CAP = 8192;
  const ring = {}; for(const p of PHASES) ring[p]=new Float64Array(CAP);
  const heapRing = new Float64Array(CAP);
  let head=0, filled=0;
  let _cur = {};            // phase name -> ms accumulated this frame
  let _stack = [];          // mark-time stack so nested phases (fogSim inside simUpdate) measure correctly
  let _frameT0 = 0;
  let measuring = false;    // live manual-profiling record gate (PERF.start/stop)
  PERF.jankMs = 1000/60*1.5;
  PERF.stallMs = 50;
  PERF._calls = 0;
  let _camDriver = null;    // (G, frameIndex) => void, installed by scenarios

  function heapNow(){ return (performance.memory ? performance.memory.usedJSHeapSize : NaN); }
  function beginFrame(){ _cur = {}; _stack.length=0; _frameT0 = performance.now(); if(COUNT_CALLS) PERF._calls=0; }
  function recordRow(){
    for(let k=0;k<PHASES.length;k++){ const p=PHASES[k]; ring[p][head]=_cur[p]||0; }
    heapRing[head]=heapNow();
    head=(head+1)%CAP; if(filled<CAP) filled++;
  }
  function resetRing(){ head=0; filled=0; }

  // mark/lap use a time stack so nested phases (e.g. fogSim inside simUpdate) each measure their own span.
  PERF.mark = function(name){ _stack.push(performance.now()); };
  PERF.lap  = function(name){ const t0=_stack.pop(); if(t0==null) return; _cur[name]=(performance.now()-t0)+(_cur[name]||0); };

  // main.js loop calls these every rAF tick; they drive the live overlay + manual PERF.start/stop window.
  // NOTE: G/render/cv/dpr/running are global *lexical* bindings (let/const/function in classic scripts),
  // reachable as bare identifiers but NOT as window.* properties — always reference them bare.
  PERF.frameStart = function(now){ beginFrame(); if(_camDriver) _camDriver(G, filled); };
  PERF.frameEnd = function(){
    _cur.total = performance.now()-_frameT0;
    if(_cur.render==null) _cur.render=_cur.total;
    if(measuring) recordRow();
    overlayTick(_cur.total);
  };

  /* ---------------- forced GPU flush ---------------- */
  // createImageBitmap from the canvas forces the queued draws to actually execute before we stamp the
  // end time (MDN's recommended flush). It does NOT set the willReadFrequently CPU-demotion penalty the
  // way getImageData(cv) would. Fallback: wait one rAF so the frame at least presents.
  const _canBitmap = (typeof createImageBitmap==='function');
  PERF.flush = function(){
    if(_canBitmap){
      try { return createImageBitmap(cv,0,0,1,1).then(b=>{ if(b&&b.close) b.close(); }, ()=>{}); }
      catch(_e){ /* fall through */ }
    }
    return new Promise(r=>requestAnimationFrame(()=>r()));
  };
  PERF.gcSettle = async function(){
    if(window.gc){ try{ window.gc(); }catch(_e){} }
    for(let i=0;i<6;i++) await new Promise(r=>requestAnimationFrame(()=>r()));
  };

  /* ---------------- authoritative measurement window (used by A/B) ----------------
     Drives render() itself, flushing each frame, decoupled from the game's rAF loop so we measure true
     per-frame render cost. main.js skips its own render() while PERF.driving is set (see the loop hook). */
  PERF.runWindow = async function(opts){
    opts = opts||{};
    const warmup = opts.warmup!=null ? opts.warmup : 120;
    const frames = opts.frames!=null ? opts.frames : 600;
    // warm-up: run the exact same work but record nothing (lets the JIT settle + caches prime)
    for(let i=0;i<warmup;i++){
      beginFrame(); if(_camDriver) _camDriver(G, i); render(G); await PERF.flush();
    }
    resetRing();
    const heapStart = heapNow();
    for(let i=0;i<frames;i++){
      beginFrame(); if(_camDriver) _camDriver(G, warmup+i);
      render(G);
      await PERF.flush();
      _cur.total = performance.now()-_frameT0;
      if(_cur.render==null) _cur.render=_cur.total;
      recordRow();
    }
    return PERF.report({ label: opts.label||'', heapStart });
  };

  // live manual profiling (no flush): PERF.start() … play … PERF.report()
  PERF.start = function(){ resetRing(); measuring=true; };
  PERF.stop  = function(){ measuring=false; return PERF.report({label:'live'}); };

  /* ---------------- stats / report ---------------- */
  function col(name){ const a=ring[name]; const out=new Float64Array(filled); for(let i=0;i<filled;i++) out[i]=a[i]; return out; }
  function mean(a){ if(!a.length) return 0; let s=0; for(let i=0;i<a.length;i++) s+=a[i]; return s/a.length; }
  function pct(sorted,p){ if(!sorted.length) return 0; const idx=Math.min(sorted.length-1, Math.max(0,Math.round((p/100)*(sorted.length-1)))); return sorted[idx]; }
  function statsOf(name){
    const a=col(name); const s=Float64Array.from(a).sort((x,y)=>x-y);
    return { mean:+mean(a).toFixed(4), p50:+pct(s,50).toFixed(4), p95:+pct(s,95).toFixed(4),
             p99:+pct(s,99).toFixed(4), max:+(s.length?s[s.length-1]:0).toFixed(4) };
  }
  PERF.report = function(meta){
    meta=meta||{};
    const total=statsOf('total');
    const phases={};
    for(const p of PHASES){ if(p==='total') continue; const st=statsOf(p);
      phases[p]={ mean:st.mean, p95:st.p95, share:(total.mean? +(st.mean/total.mean*100).toFixed(1):0) }; }
    // jank / stalls
    const t=col('total'); let jank=0,stalls=0; for(let i=0;i<t.length;i++){ if(t[i]>PERF.jankMs) jank++; if(t[i]>PERF.stallMs) stalls++; }
    // heap growth + GC sawtooth (frame-to-frame drops = collections observed)
    const hh=new Float64Array(filled); for(let i=0;i<filled;i++) hh[i]=heapRing[i];
    let heapMax=0,gcEvents=0; const heapStart=meta.heapStart!=null?meta.heapStart:(filled?hh[0]:NaN);
    const heapEnd= filled? hh[filled-1] : NaN;
    for(let i=0;i<filled;i++){ if(hh[i]>heapMax) heapMax=hh[i]; if(i>0 && hh[i]<hh[i-1]-1e5) gcEvents++; }
    const MB=x=>isNaN(x)?null:+(x/1048576).toFixed(2);
    return {
      label: meta.label||'', frames: filled,
      fps: total.mean? +(1000/total.mean).toFixed(1):0,
      total, render: statsOf('render'), phases,
      jank, stalls,
      heap: { startMB:MB(heapStart), endMB:MB(heapEnd), growthMB:MB(heapEnd-heapStart), maxMB:MB(heapMax), gcEvents,
              available: !isNaN(heapStart) },
      drawCalls: COUNT_CALLS ? PERF._calls : null,
    };
  };
  PERF.reportJSON = function(){ return JSON.stringify(PERF.report()); };

  // Median across N reports of the same configuration — used to aggregate interleaved A/B rounds so
  // monotonic drift (first-run-cold JIT warm-up, thermal throttling) cancels instead of biasing OFF vs ON.
  function med(arr){ const a=arr.filter(x=>x!=null && !isNaN(x)).slice().sort((x,y)=>x-y);
    if(!a.length) return null; const m=a.length>>1; return a.length%2 ? a[m] : (a[m-1]+a[m])/2; }
  function medStats(rs, pick){ const o={}; for(const k of ['mean','p50','p95','p99','max']) o[k]=med(rs.map(r=>pick(r)[k])); return o; }
  PERF.medianReport = function(rs){
    const phases={}; for(const p of Object.keys(rs[0].phases||{})){
      phases[p]={ mean:med(rs.map(r=>r.phases[p].mean)), p95:med(rs.map(r=>r.phases[p].p95)), share:med(rs.map(r=>r.phases[p].share)) }; }
    return {
      label:(rs[0].label||'').replace(/#\d+$/,''), frames:rs[0].frames, rounds:rs.length,
      fps:med(rs.map(r=>r.fps)), total:medStats(rs,r=>r.total), render:medStats(rs,r=>r.render),
      phases, jank:med(rs.map(r=>r.jank)), stalls:med(rs.map(r=>r.stalls)),
      heap:{ startMB:med(rs.map(r=>r.heap.startMB)), endMB:med(rs.map(r=>r.heap.endMB)),
             growthMB:med(rs.map(r=>r.heap.growthMB)), maxMB:med(rs.map(r=>r.heap.maxMB)),
             gcEvents:med(rs.map(r=>r.heap.gcEvents)), available:rs[0].heap.available },
      drawCalls: rs[0].drawCalls!=null ? med(rs.map(r=>r.drawCalls)) : null,
    };
  };

  /* ---------------- compare + verdict + pixel-diff (the keep/reject gate) ---------------- */
  PERF.gate = { minP95Pct: 5, maxMeanRegressPct: 1, maxDiffPct: 0, maxChannelDelta: 0 };
  function deltaPct(off,on){ return off? +(((on-off)/off)*100).toFixed(2) : 0; }
  PERF.compare = function(off,on){
    return {
      renderP95Pct: deltaPct(off.render.p95, on.render.p95),  // negative = faster (improvement)
      renderMeanPct: deltaPct(off.render.mean, on.render.mean),
      totalP95Pct: deltaPct(off.total.p95, on.total.p95),
      totalMeanPct: deltaPct(off.total.mean, on.total.mean),
      fpsPct: deltaPct(off.fps, on.fps),
      heapGrowthDeltaMB: (off.heap.growthMB!=null && on.heap.growthMB!=null) ? +(on.heap.growthMB-off.heap.growthMB).toFixed(2) : null,
      gcEventsDelta: on.heap.gcEvents - off.heap.gcEvents,
      drawCallsDelta: (off.drawCalls!=null && on.drawCalls!=null) ? (on.drawCalls-off.drawCalls) : null,
    };
  };
  // Render the frozen scene under setOff() then setOn() and diff the pixels via a SEPARATE offscreen
  // willReadFrequently canvas (never getImageData on cv — that would demote it to CPU). Requires a frozen
  // scene (running=false, fixed camera) so same-setting renders are byte-identical.
  let _scratch=null;
  function scratchCtx(w,h){
    if(!_scratch || _scratch.canvas.width!==w || _scratch.canvas.height!==h){
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      _scratch={ canvas:c, ctx:c.getContext('2d',{willReadFrequently:true}) };
    }
    return _scratch;
  }
  PERF.pixelDiff = function(setOff,setOn){
    const w=cv.width, h=cv.height, s=scratchCtx(w,h);
    setOff(); render(G); s.ctx.clearRect(0,0,w,h); s.ctx.drawImage(cv,0,0); const a=s.ctx.getImageData(0,0,w,h).data;
    setOn();  render(G); s.ctx.clearRect(0,0,w,h); s.ctx.drawImage(cv,0,0); const b=s.ctx.getImageData(0,0,w,h).data;
    let diff=0, maxd=0; const px=a.length/4;
    for(let i=0;i<a.length;i+=4){ const dr=Math.abs(a[i]-b[i]),dg=Math.abs(a[i+1]-b[i+1]),db=Math.abs(a[i+2]-b[i+2]);
      if(dr||dg||db){ diff++; const m=dr>dg?(dr>db?dr:db):(dg>db?dg:db); if(m>maxd) maxd=m; } }
    return { diffPixels:diff, diffPct:+((diff/px)*100).toFixed(4), maxChannelDelta:maxd };
  };
  PERF.verdict = function(cmp, diff){
    const g=PERF.gate;
    const visualOk = !diff || (diff.diffPct<=g.maxDiffPct && diff.maxChannelDelta<=g.maxChannelDelta);
    const faster = (-cmp.renderP95Pct) >= g.minP95Pct;           // render p95 dropped by >= threshold
    const noMeanRegress = cmp.renderMeanPct <= g.maxMeanRegressPct;
    const keep = visualOk && faster && noMeanRegress;
    return { keep, visualOk, faster, noMeanRegress,
      reason: !visualOk ? 'visual diff exceeds gate' : !faster ? 'insufficient p95 improvement'
            : !noMeanRegress ? 'mean regressed' : 'meets gate' };
  };

  // One-call A/B for a named scene + opt flag. Builds the scene once, runs OFF then ON over the same
  // deterministic camera path, pixel-diffs a frozen frame, prints a greppable PERFAB sentinel.
  PERF.ab = async function(o){
    o=o||{}; const opt=o.opt, scene=o.scene||{name:'bigMap',args:{}};
    if(!opt) throw new Error('PERF.ab needs {opt}');
    if(!PERF.scenes || !PERF.scenes[scene.name]) throw new Error('unknown scene '+scene.name);
    const repeat = o.repeat!=null ? o.repeat : 3;   // interleaved OFF/ON rounds → median cancels drift
    const orig = PERF.opts[opt];                    // restore the shipped default after the run
    PERF.scenes[scene.name](scene.args||{});
    PERF.driving = true;
    try {
      const offs=[], ons=[];
      for(let r=0;r<repeat;r++){
        PERF.opts[opt]=false; await PERF.gcSettle();
        offs.push(await PERF.runWindow({ warmup:o.warmup, frames:o.frames, label:opt+':off#'+r }));
        PERF.opts[opt]=true;  await PERF.gcSettle();
        ons.push(await PERF.runWindow({ warmup:o.warmup, frames:o.frames, label:opt+':on#'+r }));
      }
      const off = PERF.medianReport(offs), on = PERF.medianReport(ons);
      const cmp = PERF.compare(off,on);
      const diff = PERF.pixelDiff(()=>{PERF.opts[opt]=false;}, ()=>{PERF.opts[opt]=true;});
      const verdict = PERF.verdict(cmp, diff);
      const out = { opt, scene:scene.name, sceneArgs:scene.args||{}, rounds:repeat, verdict, delta:cmp,
        pixelDiff:diff, off, on, offP95Runs:offs.map(x=>+x.render.p95.toFixed(2)), onP95Runs:ons.map(x=>+x.render.p95.toFixed(2)) };
      console.log('PERFAB '+JSON.stringify(out));
      return out;
    } finally {
      PERF.opts[opt] = orig;                         // restore the shipped/default state
      PERF.driving = false;
      if(PERF.scenes && PERF.scenes.teardown) PERF.scenes.teardown();
    }
  };

  /* ---------------- camera driver install (scenarios call these) ---------------- */
  PERF.installCamera = function(fn){ _camDriver = fn; };
  PERF.clearCamera = function(){ _camDriver = null; };

  /* ---------------- optional per-frame draw-call counter (?perf=1&calls=1) ----------------
     Wraps a few hot ctx methods to count calls. Opt-in only (the wrapper adds overhead), so timing
     runs without &calls=1 stay clean. */
  if(COUNT_CALLS && typeof ctx!=='undefined' && ctx){
    ['drawImage','fillRect','strokeRect','fill','stroke','fillText','beginPath'].forEach(m=>{
      const orig=ctx[m]; if(typeof orig!=='function') return;
      ctx[m]=function(){ PERF._calls++; return orig.apply(this,arguments); };
    });
  }

  /* ---------------- tiny on-screen overlay (live profiling read) ---------------- */
  let _ovEl=null, _ovAcc=0, _ovFrames=0;
  function overlayTick(ms){
    _ovAcc+=ms; _ovFrames++;
    if(_ovAcc<250) return;                 // ~4 Hz refresh so the overlay doesn't measure itself
    const r=PERF.report({label:'live'});
    if(!_ovEl){
      _ovEl=document.createElement('div'); _ovEl.id='perf-overlay';
      _ovEl.style.cssText='position:fixed;left:6px;top:54px;z-index:99999;pointer-events:none;'+
        'font:10px/1.35 monospace;color:#9effc8;background:rgba(4,8,13,.82);padding:6px 8px;'+
        'border:1px solid rgba(120,255,160,.25);border-radius:4px;white-space:pre;max-width:48vw';
      document.body.appendChild(_ovEl);
    }
    const ph=Object.entries(r.phases).filter(([,v])=>v.mean>0.01).sort((a,b)=>b[1].mean-a[1].mean)
      .slice(0,8).map(([k,v])=>'  '+k.padEnd(11)+v.mean.toFixed(2)+'ms '+v.share+'%').join('\n');
    _ovEl.textContent =
      'FPS '+r.fps+'  total '+r.total.mean.toFixed(2)+'ms (p95 '+r.total.p95.toFixed(2)+')\n'+
      'jank '+r.jank+'  stalls '+r.stalls+(r.heap.available?'  heap '+r.heap.endMB+'MB Δ'+r.heap.growthMB+' gc'+r.heap.gcEvents:'')+
      (r.drawCalls!=null?'  calls '+r.drawCalls:'')+'\n'+ph;
    _ovAcc=0; _ovFrames=0;
  }

  console.log('[PERF] harness ON — PERF.ab({opt,scene}), PERF.scenes.*, PERF.start()/stop(). Flags:', Object.keys(PERF.opts).join(','));
})();
