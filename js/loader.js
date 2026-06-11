/* =====================================================================
   loader.js — central image-loading registry + tiered download queue.
   Loaded BEFORE assets.js (which registers every sprite through it).

   Why this exists: the game ships ~130 sprite PNGs (~100MB). Before this
   file, every one assigned img.src at script-parse time — all of them
   racing each other (and the audio) on a phone connection — and a single
   onerror lost that sprite for the whole session. The registry fixes both:

   - QUEUE   downloads run lowest-tier-first with a small concurrency cap
             (T_CRITICAL=1 current-map sprites, T_GAMEPLAY=2 the rest of
             the gameplay art, T_AMBIENT=3 mega scenery / scenes).
   - RETRY   a failed load retries on a 1s/4s/10s backoff (cache-busting
             only the final attempt so GH-Pages caching stays useful);
             only then is it failed for good (procedural fallback remains,
             the same contract as before). Optional art (_ao recolors,
             water atlas, crystal) gets a single retry — a missing file is
             a SUPPORTED state, not an error.
   - SETTLE  an asset is "settled" after its FIRST load-or-error event;
             the mission gate waits on settled (never on "all loaded") so
             absent optional files can never wedge a loading screen while
             retries keep streaming in the background.
   - MOBILE  img.decode() before settling (no first-blit decode jank);
             a watchdog + visibility/online re-kicks recover loads that
             iOS silently aborts when the tab is backgrounded.

   AUDIO WHITELIST: media elements deliberately do NOT route through this
   registry. The crawl narration mp3 (voice.js playCrawl/crawlDuration)
   must stream DURING the crawl — it paces the scroll — and music/barks
   are preload='none' (fetched on play). Do not "unify" them into the
   queue: an <audio> streams progressively and has no settle contract.

   Consumers keep their .onload/.onerror PROPERTY handlers (frame slicing,
   ready flags) — the registry uses addEventListener, so both coexist, and
   a late retry-load re-runs the consumer handler: that is the recovery
   pop-in. INVARIANT: a consumer ready flag is only ever true after a
   successful load, and retries only touch never-loaded images — so a blit
   can never see a mid-reload/broken Image (drawImage would throw).
   | STARLEFT */

const LOADER = (function(){
  const T_CRITICAL=1, T_GAMEPLAY=2, T_AMBIENT=3;
  const RETRY_MS = [1000, 4000, 10000];        // backoff after the 1st/2nd/3rd error
  const STUCK_SWEEP_MS = 5000;                 // watchdog cadence
  const STUCK_AFTER_MS = 45000;                // in-flight this long with no event → assume aborted, re-kick
  const conn = (typeof navigator!=='undefined' && navigator.connection) || null;
  const SLOW = !!(conn && (conn.saveData || /(^|-)[23]g$/.test(conn.effectiveType||'')));
  const MAX_INFLIGHT = SLOW ? 4 : 6;           // single HTTP/2 origin: few streams finish critical files sooner
  // ?perf=1 A/B harness: eager-load everything immediately so benchmark scenes
  // never measure half-loaded sprites (and stay byte-identical run to run).
  const EAGER = (typeof location!=='undefined') && /[?&]perf=1(&|$)/.test(location.search||'');

  const recs = [];                 // every tracked asset, insertion order
  const byTag = new Map();         // tag -> rec
  let inflight = 0;
  let gen = 0;                     // bumped when an ATLAS arrives late → render re-bakes terrain chunks
  let lastSettleAt = (typeof performance!=='undefined' ? performance.now() : 0);
  const changeCbs = [];

  function now(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
  function fireChange(){ for(const cb of changeCbs){ try{ cb(); }catch(_){} } checkMission(); }

  /* ---------------- core registry ---------------- */
  function register(img, src, opts){
    opts = opts || {};
    const rec = {
      img, src,
      tag: opts.tag || ('img:'+src),
      tier: opts.tier || T_GAMEPLAY,
      weight: opts.weight || 1,
      optional: !!opts.optional,
      state: 'queued',             // queued | inflight | retrywait | loaded | failed
      attempts: 0,
      settled: false,              // first load-or-error seen (gate semantics)
      startedAt: 0,
      seq: recs.length,
    };
    img.addEventListener('load', ()=>onLoad(rec));
    img.addEventListener('error', ()=>onError(rec));
    recs.push(rec);
    if(rec.tag) byTag.set(rec.tag, rec);
    if(EAGER){ rec.state='inflight'; rec.attempts=1; rec.startedAt=now(); img.src=src; }
    else queueMicrotask(pump);     // batch: all parse-time registrations pump once
    return img;
  }
  function image(src, opts){ return register(new Image(), src, opts); }

  function pump(){
    if(EAGER) return;
    while(inflight < MAX_INFLIGHT){
      let best=null;
      for(const r of recs) if(r.state==='queued' && (!best || r.tier<best.tier || (r.tier===best.tier && r.seq<best.seq))) best=r;
      if(!best) break;
      best.state='inflight'; best.attempts++; best.startedAt=now(); inflight++;
      // cache-bust ONLY the last-chance attempt (a cached error response / poisoned cache),
      // never the first ones — every other request stays cacheable for future visits.
      const maxA = best.optional ? 2 : RETRY_MS.length + 1;
      best.img.src = (best.attempts>=maxA && best.attempts>1)
        ? best.src + (best.src.indexOf('?')>=0?'&':'?') + 'r=' + best.attempts
        : best.src;
    }
  }

  function settle(rec){
    if(!rec.settled){ rec.settled=true; }
    lastSettleAt = now();
    fireChange();
  }
  function onLoad(rec){
    if(rec.state==='inflight') inflight=Math.max(0, inflight-1);
    rec.state='loaded';
    if(rec.attempts>1 && typeof TELE!=='undefined') TELE.event('asset_retry_recovered', { tag:rec.tag, attempts:rec.attempts });
    if(rec.tag && rec.tag.indexOf('atlas:')===0) gen++;   // terrain chunk cache re-bakes off this
    const done = ()=>{ settle(rec); pump(); };
    // decode off the render path; rejection is non-fatal (fires spuriously on iOS under memory pressure)
    if(rec.img.decode){ rec.img.decode().then(done, done); } else done();
  }
  function onError(rec){
    if(rec.state==='inflight') inflight=Math.max(0, inflight-1);
    const maxA = rec.optional ? 2 : RETRY_MS.length + 1;
    if(rec.attempts < maxA && !EAGER){
      rec.state='retrywait';
      const delay = RETRY_MS[Math.min(rec.attempts-1, RETRY_MS.length-1)] * (0.8 + Math.random()*0.4);
      setTimeout(()=>{ if(rec.state==='retrywait'){ rec.state='queued'; pump(); } }, delay);
    } else {
      rec.state='failed';
    }
    settle(rec); pump();
  }

  /* ------------- stuck / background-abort recovery -------------
     iOS Safari can abort an in-flight image load when the tab is backgrounded
     WITHOUT firing load or error. Two nets: a slow periodic sweep (45s — long
     enough that a big sheet on slow 3G is never killed mid-transfer), and an
     immediate re-kick of anything that was in flight across a hidden→visible
     transition or an offline→online flip. Re-kick = back to the queue; the
     state machine is idempotent (events for a re-pointed src are the same). */
  function rekick(rec){
    if(rec.state==='inflight'){ inflight=Math.max(0,inflight-1); }
    else if(rec.state!=='retrywait' && rec.state!=='failed') return;
    rec.state='queued'; pump();
  }
  if(!EAGER && typeof setInterval!=='undefined'){
    setInterval(()=>{
      const t=now();
      for(const r of recs){
        if(r.state!=='inflight' || t-r.startedAt < STUCK_AFTER_MS) continue;
        if(r.img.complete && r.img.naturalWidth>0){ onLoad(r); }          // event was missed entirely
        else { r._stuck=(r._stuck||0)+1; if(r._stuck<=2) rekick(r); }
      }
    }, STUCK_SWEEP_MS);
  }
  if(typeof document!=='undefined'){
    let hiddenAt=0;
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState==='hidden'){ hiddenAt=now(); return; }
      if(!hiddenAt) return;
      for(const r of recs){
        if(r.state==='inflight' && r.startedAt<hiddenAt){
          if(r.img.complete && r.img.naturalWidth>0) onLoad(r); else rekick(r);
        }
        else if(r.state==='retrywait') rekick(r);   // background tabs throttle the backoff timers
      }
      hiddenAt=0;
    });
  }
  if(typeof window!=='undefined'){
    window.addEventListener('online', ()=>{
      for(const r of recs){
        if(r.state==='failed' && !r._onlineKick){ r._onlineKick=true; r.attempts=Math.max(0,r.attempts-1); rekick(r); }
        else if(r.state==='retrywait') rekick(r);
      }
    });
  }

  /* ---------------- mission gate API ----------------
     A "mission" is the set of tags the loading gate waits on (settled, not
     loaded). Tag matchers support a trailing * (e.g. 'bld:*:player'). */
  let missionRecs = [];            // resolved gating recs
  let missionCb = null, missionTimer = null;
  function matchRecs(pat){
    if(pat.indexOf('*')<0){ const r=byTag.get(pat); return r?[r]:[]; }
    const rx = new RegExp('^'+pat.split('*').map(s=>s.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('[^]*?')+'$');
    return recs.filter(r=>rx.test(r.tag));
  }
  function beginMission(spec){
    spec = spec || {};
    const gate = [];
    for(const pat of (spec.gate||[])) for(const r of matchRecs(pat)) if(gate.indexOf(r)<0) gate.push(r);
    missionRecs = gate;
    for(const r of gate){ if(r.tier>T_CRITICAL) r.tier=T_CRITICAL; }
    for(const b of (spec.boost||[])) for(const pat of (b.tags||[])) for(const r of matchRecs(pat)){ if(r.tier>(b.tier||T_GAMEPLAY)) r.tier=(b.tier||T_GAMEPLAY); }
    pump(); checkMission();
  }
  function missionProgress(){
    let settled=0, total=0, failed=0;
    for(const r of missionRecs){ total+=r.weight; if(r.settled) settled+=r.weight; if(r.state==='failed') failed++; }
    return { settled, total, frac: total? settled/total : 1, failed };
  }
  function missionReady(){ return missionRecs.every(r=>r.settled); }
  function onMissionReady(cb, timeoutMs){
    if(missionTimer){ clearTimeout(missionTimer); missionTimer=null; }
    missionCb = cb;
    if(timeoutMs>0) missionTimer = setTimeout(()=>{ const f=missionCb; missionCb=null; missionTimer=null; if(f) f(true); }, timeoutMs);
    checkMission();
  }
  function checkMission(){
    if(missionCb && missionReady()){
      const f=missionCb; missionCb=null;
      if(missionTimer){ clearTimeout(missionTimer); missionTimer=null; }
      f(false);
    }
  }

  /* ---------------- QA / debug ---------------- */
  function stats(){
    const by={}; for(const r of recs) by[r.state]=(by[r.state]||0)+1;
    return { total:recs.length, inflight, by, gen, mission:missionProgress() };
  }
  function report(){
    const bad = recs.filter(r=>r.state!=='loaded').map(r=>({tag:r.tag, state:r.state, attempts:r.attempts, src:r.src}));
    if(typeof console!=='undefined' && console.table) console.table(bad);
    return bad;
  }
  function get(tag){ return byTag.get(tag)||null; }

  /* ---- service worker (repeat-visit asset cache, sw.js) ----
     GH Pages caps caching at max-age=600, so mobile players re-download ~100MB of art on
     most visits; sw.js makes assets/ cache-first (code is never cached — deploys stay
     fresh). Skipped on localhost so dev servers / the sandbox never fight a stale cache. */
  if(typeof navigator!=='undefined' && 'serviceWorker' in navigator
     && typeof location!=='undefined' && location.protocol.indexOf('http')===0
     && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)){
    window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
  }

  return {
    T_CRITICAL, T_GAMEPLAY, T_AMBIENT, EAGER,
    image, register, beginMission, missionProgress, missionReady, onMissionReady,
    get, stats, report,
    onChange(cb){ changeCbs.push(cb); },
    get gen(){ return gen; },
    get lastSettleAt(){ return lastSettleAt; },
  };
})();
