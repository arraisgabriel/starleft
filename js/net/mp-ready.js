/* js/net/mp-ready.js — CLASSIC. The deferred-module bridge.
   The Trystero boot module (<script type="module">) is loaded LAST and runs AFTER every classic
   script, so window.MP does not exist while the classic files parse. Classic code must therefore
   route any MP usage through whenMP(): run now if MP is ready, else queue until 'mp:ready'. */
function whenMP(fn){
  if (window.__MP_READY) { try { fn(); } catch(_){} return; }
  (window.__mpReadyQueue || (window.__mpReadyQueue = [])).push(fn);
}
// True only when the transport actually loaded (vendored Trystero or the CDN fallback succeeded).
function mpAvailable(){ return !!(window.MP && !window.MP.unavailable); }
