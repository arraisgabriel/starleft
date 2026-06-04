/* js/net/rb-ready.js — CLASSIC. Deferred-module bridge for the rollback-netcode facade.
   js/net/rollback-boot.js (the 2nd <script type="module">) loads after the classic scripts, so window.RB
   doesn't exist while they parse. Classic code routes any RB usage through whenRB(): run now if ready,
   else queue until 'rb:ready'. Mirrors mp-ready.js for window.MP. */
function whenRB(fn){
  if (window.__RB_READY) { try { fn(); } catch(_){} return; }
  (window.__rbReadyQueue || (window.__rbReadyQueue = [])).push(fn);
}
// True only when the rollback bundle actually loaded (vendored or the CDN fallback succeeded).
function rbAvailable(){ return !!(window.RB && !window.RB.unavailable); }
