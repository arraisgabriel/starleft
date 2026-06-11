/* =====================================================================
   sw.js — STARLEFT asset cache (Phase 2 of the mobile sprite-loading fix).

   GitHub Pages serves everything with Cache-Control: max-age=600, so a
   mobile player re-downloads ~100MB of art on most visits. This worker
   makes assets/ cache-first and durable:

   - ONLY paths containing /assets/ are handled (sprites, audio, scenes).
     Code (HTML/JS/CSS) is NEVER touched — deploys stay instantly fresh
     under the normal GH-Pages caching, zero stale-code risk.
   - Runtime caching only: a response is stored when it is first fetched
     (status 200). Nothing is precached — a player only stores the maps
     and audio they actually load.
   - Cache keys are normalized without the query string. The loader's
     last-chance retry appends ?r=N to bust a poisoned cache: those
     requests intentionally BYPASS the cache, go to network, and refresh
     the stored normalized entry on success.
   - Bump CACHE on asset-set changes (e.g. the WebP migration); activate
     deletes every older starleft-assets-* cache.

   Registered from js/loader.js — http(s) only, and skipped on localhost
   so dev servers and the sandbox never fight a stale cache. | STARLEFT */

const CACHE = 'starleft-assets-v1';

self.addEventListener('install', ()=>{ self.skipWaiting(); });

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.indexOf('starleft-assets-')===0 && k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method!=='GET' || req.url.indexOf('/assets/')<0) return;   // code is never cached here
  const norm = req.url.split('?')[0];
  const busted = req.url.length !== norm.length;                    // loader retry ?r=N → force network
  e.respondWith(
    caches.open(CACHE).then(cache=>{
      const fromNet = ()=>fetch(req).then(res=>{
        if(res && res.status===200) cache.put(norm, res.clone());
        return res;
      });
      if(busted) return fromNet();
      return cache.match(norm).then(hit=>hit || fromNet());
    })
  );
});
