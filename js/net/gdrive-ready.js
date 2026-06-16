/* js/net/gdrive-ready.js — CLASSIC. The deferred-dependency bridge for Google Drive cloud save.
   Google Identity Services (accounts.google.com/gsi/client) is an external async <script> injected at
   runtime (only when GDRIVE_CLIENT_ID is set), so window.GDRIVE does not exist while the classic files
   parse. Classic code must therefore route any GDRIVE usage through whenGsi(): run now if ready, else
   queue until 'gsi:ready'. Mirrors mp-ready.js / rb-ready.js exactly. */
function whenGsi(fn){
  if (window.__GSI_READY) { try { fn(); } catch(_){} return; }
  (window.__gsiReadyQueue || (window.__gsiReadyQueue = [])).push(fn);
}
// True only when the cloud-save layer is actually live: GIS loaded, a Client ID is configured, and the
// origin can run OAuth (i.e. not file:// and not the inert stub). The Sync UI gates on this.
function gisAvailable(){ return !!(window.GDRIVE && !window.GDRIVE.unavailable); }
