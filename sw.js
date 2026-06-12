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
  if(req.method!=='GET') return;
  let u; try{ u = new URL(req.url); }catch(_){ return; }
  // same-origin sprite/scene art only. Code is never cached here. Audio is excluded:
  // media elements issue byte-range requests, and serving a cached full-200 to a ranged
  // request breaks WebKit/Firefox playback and seeking — let audio stream natively.
  if(u.origin!==self.location.origin || u.pathname.indexOf('/assets/')<0 || u.pathname.indexOf('/assets/audio/')>=0) return;
  if(req.headers.get('range')) return;                              // ranged requests bypass the cache entirely
  const norm = u.origin + u.pathname;
  const busted = !!u.search;                                        // loader retry ?r=N → force network
  e.respondWith(
    caches.open(CACHE).then(cache=>{
      const fromNet = ()=>fetch(req).then(res=>{
        if(res && res.status===200 && res.type==='basic') cache.put(norm, res.clone()).catch(()=>{});  // quota errors are non-fatal
        return res;
      });
      if(busted) return fromNet();
      return cache.match(norm).then(hit=>hit || fromNet());
    })
  );
});
