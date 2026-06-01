/* lns.js — LIVE NEWS STREAM (LNS): a cyberpunk RSS news ticker.
   Pulls several public RSS feeds in the browser and scrolls deduped,
   recency-sorted world headlines across two tickers:
     • main menu — a full-width "lower third" stripe
     • in-game   — a thin stripe under the top bar, toggled by the 📡 News button

   The feeds are CORS-blocked for our origin, so every request is routed through a
   chain of public CORS proxies (the first that works is reused first). Each source
   is parsed by its own function (per spec), all delegating a shared <item> walk.

   Performance / CPU budget: native DOMParser, a localStorage cache for an instant
   (non-"Loading") first paint, idle-time DOM rebuilds, a pure-CSS marquee (runs on
   the compositor, not the JS RAF loop), and refreshes only while the tab is visible.

   Self-contained: exposes one global `LNS`; bootstrapped by main.js → LNS.init().
   Loaded before main.js.  | STARLEFT */
var LNS = (function(){
  'use strict';

  /* ---- feed sources — each parsed by its own function (see PARSERS below) ---- */
  const FEEDS = [
    { url:'https://feedx.net/rss/ap.xml',                source:'AP',       parse:parseAP },
    { url:'https://feeds.bbci.co.uk/news/world/rss.xml', source:'BBC',      parse:parseBBC },
    { url:'https://www.euronews.com/rss',                source:'EURONEWS', parse:parseEuronews },
    { url:'https://time.com/feed/',                      source:'TIME',     parse:parseTime },
  ];

  /* ---- CORS proxies, tried in order; the first that works is reused first.
     Order reflects observed reliability (codetabs most stable; the others are
     fallbacks that can 403/500). Add more here if they all go down. ---- */
  const PROXIES = [
    u=>'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(u),
    u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
    u=>'https://corsproxy.io/?url='+encodeURIComponent(u),
  ];
  let goodProxy = 0;                          // index of the proxy that last succeeded
  // a proxy can answer 200 with its own HTML/JSON error page — accept a body only
  // if it actually looks like a feed, so we never set goodProxy to a broken proxy.
  function looksLikeFeed(s){ return !!s && /<(rss|feed|rdf|channel|item|entry)\b/i.test(s); }

  const FETCH_TIMEOUT = 12000;                // per-request abort (ms)
  const REFRESH_MS    = 6*60*1000;            // background refresh cadence
  const CACHE_KEY     = 'starleft.lns.cache';
  const CACHE_TTL     = 5*60*1000;            // serve cache instantly if younger than this
  const PREF_KEY      = 'starleft.lns.ingame';// in-game ticker on/off (persisted)
  const MAX_ITEMS     = 60;                   // headline cap (keeps DOM + marquee small)
  const SPEED_MENU    = 90;                   // marquee speed, px/sec
  const SPEED_INGAME  = 70;

  let items    = [];                          // [{title, link, ts, source}], deduped + sorted
  let loading  = true;
  let fetching = false;
  let lastFetchAt   = 0;
  let rebuildQueued = false;

  /* ===================================================================
     PARSING — shared <item> walk + one thin function per source
     =================================================================== */
  function toDoc(xml){
    if(!xml) return null;
    let doc;
    try{ doc = new DOMParser().parseFromString(xml, 'text/xml'); }catch(_){ return null; }
    if(!doc || doc.getElementsByTagName('parsererror').length) return null;
    return doc;
  }
  // Walk every RSS <item> / Atom <entry>; normalise to {title, link, ts, source}.
  // opts.stripQuery drops tracking query params from links.
  function readItems(xml, source, opts){
    opts = opts || {};
    const doc = toDoc(xml); if(!doc) return [];
    const out = [];
    const nodes = doc.querySelectorAll('item, entry');
    for(let i=0;i<nodes.length;i++){
      const it = nodes[i];
      const title = clean(tag(it,'title'));
      if(!title) continue;
      let link = tag(it,'link');
      if(!link){ const l=it.querySelector('link'); if(l) link = l.getAttribute('href')||''; } // Atom
      link = link.trim();
      if(!/^https?:\/\//i.test(link)) link = '';     // only ever render http(s) hrefs
      if(opts.stripQuery && link) link = link.split('?')[0];
      const ts = toTs(tag(it,'pubDate') || tag(it,'date') || tag(it,'published') || tag(it,'updated'));
      out.push({ title, link, ts, source });
    }
    return out;
  }
  function tag(parent, name){ const el=parent.querySelector(name); return el ? el.textContent.trim() : ''; }
  function toTs(s){ if(!s) return 0; const t=Date.parse(s); return isNaN(t) ? 0 : t; }
  // strip any stray inline markup and collapse whitespace
  function clean(s){
    return s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').replace(/&amp;/g,'&').trim();
  }

  // One function per source (per spec) — each may apply source-specific quirks.
  function parseAP(xml){       return readItems(xml, 'AP'); }
  function parseBBC(xml){      return readItems(xml, 'BBC',      { stripQuery:true }); } // drop ?at_medium=RSS…
  function parseEuronews(xml){ return readItems(xml, 'EURONEWS'); }
  function parseTime(xml){     return readItems(xml, 'TIME'); }

  /* ===================================================================
     FETCH — proxy chain + idle, visibility-gated refresh
     =================================================================== */
  // Try proxies with the last-good one first; return raw feed text or null.
  async function fetchText(url){
    const order = PROXIES.map((_,i)=>i).sort((a,b)=> (a===goodProxy?-1:(b===goodProxy?1:0)));
    for(const idx of order){
      try{
        const ctrl = new AbortController();
        const to = setTimeout(()=>ctrl.abort(), FETCH_TIMEOUT);
        const res = await fetch(PROXIES[idx](url), { signal:ctrl.signal, cache:'no-store', redirect:'follow' });
        clearTimeout(to);
        if(!res.ok) continue;
        const body = await res.text();
        if(looksLikeFeed(body)){ goodProxy = idx; return body; }
      }catch(_){ /* dead proxy / timeout → try the next */ }
    }
    return null;
  }
  async function fetchFeed(feed){
    const xml = await fetchText(feed.url);
    if(!xml) return [];
    try{ return feed.parse(xml) || []; }catch(_){ return []; }
  }

  async function refresh(){
    if(fetching || document.hidden) return;   // never burn network/CPU on a hidden tab
    fetching = true; lastFetchAt = Date.now();
    try{
      const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
      const merged = [];
      settled.forEach(r=>{ if(r.status==='fulfilled' && r.value.length) merged.push.apply(merged, r.value); });
      if(merged.length){ items = dedupeSort(merged); loading = false; saveCache(); }
    } finally { fetching = false; scheduleRebuild(); }
  }
  function dedupeSort(list){
    list.sort((a,b)=> b.ts - a.ts);            // newest first across all sources
    const seen = new Set(), out = [];
    for(const it of list){
      const k = it.title.toLowerCase();
      if(seen.has(k)) continue;
      seen.add(k); out.push(it);
      if(out.length>=MAX_ITEMS) break;
    }
    return out;
  }

  /* ---- localStorage cache (instant first paint, fewer network hits) ---- */
  function saveCache(){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ t:Date.now(), items })); }catch(_){ } }
  function loadCache(){
    try{
      const d = JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!d || !Array.isArray(d.items) || !d.items.length) return false;
      items = d.items.slice(0, MAX_ITEMS); loading = false;
      return (Date.now()-(d.t||0)) < CACHE_TTL;   // true → still fresh
    }catch(_){ return false; }
  }

  /* ===================================================================
     RENDER — pure-CSS marquee, rebuilt in idle time
     =================================================================== */
  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function innerHTML(){
    if(loading && !items.length) return '<span class="lns-loading">Loading ...</span>';
    if(!items.length)            return '<span class="lns-loading">Live feed unavailable — retrying…</span>';
    return items.map(it=>{
      const body = `<span class="lns-src">${esc(it.source)}</span><span class="lns-headline">${esc(it.title)}</span>`;
      const item = it.link
        ? `<a class="lns-item" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${body}</a>`
        : `<span class="lns-item">${body}</span>`;
      return item + '<span class="lns-sep" aria-hidden="true">◆</span>';
    }).join('');
  }

  function scheduleRebuild(){
    if(rebuildQueued) return; rebuildQueued = true;
    const run = ()=>{ rebuildQueued = false; renderAll(); };
    if(window.requestIdleCallback) requestIdleCallback(run, { timeout:600 }); else setTimeout(run, 60);
  }
  function renderAll(){
    buildTicker(host('lns-menu'),   SPEED_MENU);
    buildTicker(host('lns-ingame'), SPEED_INGAME);
  }
  function host(id){
    const el = document.getElementById(id);
    return (el && el.style.display!=='none') ? el.querySelector('.lns-host') : null;
  }
  function buildTicker(hostEl, speed){
    if(!hostEl) return;
    const html = innerHTML();
    if(!items.length){            // Loading / unavailable → static, no scroll
      hostEl.innerHTML = `<div class="lns-viewport"><div class="lns-static">${html}</div></div>`;
      return;
    }
    hostEl.innerHTML =
      '<div class="lns-viewport"><div class="lns-track">'+
        `<div class="lns-seq">${html}</div><div class="lns-seq" aria-hidden="true">${html}</div>`+
      '</div></div>';
    requestAnimationFrame(()=>tuneTicker(hostEl, speed));   // measure once laid out
  }
  // Two identical sequences side-by-side; translateX(-50%) loops seamlessly. Pad a
  // short sequence so it always spans the viewport, then set a constant px/sec speed.
  function tuneTicker(hostEl, speed){
    const vp = hostEl.querySelector('.lns-viewport');
    const track = hostEl.querySelector('.lns-track');
    if(!vp || !track) return;
    const seqs = track.querySelectorAll('.lns-seq'); if(seqs.length<2) return;
    let seqW = seqs[0].scrollWidth;
    const vpW = vp.clientWidth || 0;
    if(seqW>0 && vpW>0 && seqW<vpW){
      const k = Math.ceil((vpW+40)/seqW);
      const rep = new Array(k).fill(seqs[0].innerHTML).join('');
      seqs[0].innerHTML = rep; seqs[1].innerHTML = rep;
      seqW = seqs[0].scrollWidth;
    }
    if(seqW>0) track.style.animationDuration = Math.max(12, seqW/speed).toFixed(1)+'s';
  }

  /* ===================================================================
     IN-GAME TOGGLE — reserves a HUD band so the play area stays correct
     =================================================================== */
  function ingameVisible(){ const ig=document.getElementById('lns-ingame'); return !!(ig && ig.style.display!=='none'); }
  function setIngame(on){
    const ig = document.getElementById('lns-ingame'); if(!ig) return;
    ig.style.display = on ? 'flex' : 'none';
    const btn = document.getElementById('btn-news'); if(btn) btn.classList.toggle('armed', on);
    try{ localStorage.setItem(PREF_KEY, on ? '1' : '0'); }catch(_){ }
    if(on) buildTicker(ig.querySelector('.lns-host'), SPEED_INGAME);
    // mirror the band into the renderer's VIEW_TOP and re-clamp the camera
    if(typeof syncHud==='function'){ syncHud(); if(typeof G!=='undefined' && G && typeof clampCam==='function') clampCam(G); }
  }
  function toggleIngame(){ setIngame(!ingameVisible()); }

  /* ===================================================================
     INIT
     =================================================================== */
  function init(){
    const btn = document.getElementById('btn-news'); if(btn) btn.addEventListener('click', toggleIngame);

    // restore in-game preference (default ON so the feature is visible on first run)
    let pref = true; try{ const v=localStorage.getItem(PREF_KEY); if(v!=null) pref = (v==='1'); }catch(_){ }

    const fresh = loadCache();      // seed from cache for an instant, non-"Loading" paint
    setIngame(pref);                // also reserves the HUD band + renders the in-game host
    renderAll();

    if(!fresh) refresh();           // stale/no cache → pull now; fresh → wait for the timer
    else setTimeout(refresh, 2000);

    setInterval(()=>{ if(!document.hidden) refresh(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden && Date.now()-lastFetchAt > 60000) refresh();
    });
    let rt; addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(renderAll, 250); }); // re-tune marquee width
  }

  return { init, toggleIngame, refresh };
})();
