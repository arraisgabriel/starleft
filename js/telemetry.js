/* telemetry.js — lightweight, cookieless analytics (T0-10).
   TELE.event(name, props) records a cookieless, no-PII, no-fingerprint funnel event. Analytics is
   ALWAYS ON — there is NO consent toggle and NO Do-Not-Track gate; the only gate is that a sink is
   configured. Two optional sinks (leave the id/url empty to disable that sink):
     • Umami Cloud (hosted / serverless): UMAMI_WEBSITE_ID. The loader auto-counts a pageview = "who
       accessed the page" and receives every TELE.event as a custom event (umami.track) = the funnel.
     • TELE_ENDPOINT: a raw cookieless collector (Plausible/Umami custom-event API or your own) that
       gets a tiny sendBeacon JSON blob.
   Fails silently offline / blocked. Local & cosmetic — never touches G, saves, or netcode. */

const TELE = (function(){
  // ─── sinks (both optional; leave the id/url empty to disable that sink) ───────────────────────
  const UMAMI_WEBSITE_ID = 'b84254d2-de90-41c3-a9ef-fc190a7f7827';   // Umami Cloud website id (empty → off)
  const UMAMI_SRC = 'https://cloud.umami.is/script.js';   // Cloud loader (EU acct: https://eu.umami.is/script.js; self-host: your /script.js)
  const TELE_ENDPOINT = '';                               // optional raw cookieless collector URL (sendBeacon JSON)

  const umamiConfigured = ()=> !!UMAMI_WEBSITE_ID;
  function on(){ return umamiConfigured() || !!TELE_ENDPOINT; }   // always on — only requires a configured sink

  // tiny anonymous session tag (per-load, in-memory only) so funnels can be stitched per session
  const sid = Math.random().toString(36).slice(2, 10);

  // ─── Umami: loader injection + a small pre-load event buffer ──────────────────────────────────
  let umamiInjected = false;
  const umamiQueue = [];             // events fired before the async loader defines window.umami
  function umamiFlush(){
    if(!(window.umami && typeof window.umami.track === 'function')) return;
    while(umamiQueue.length){ const e = umamiQueue.shift(); try { window.umami.track(e[0], e[1]); } catch(_){} }
  }
  function umamiEnsure(){
    if(umamiInjected || !umamiConfigured() || typeof document === 'undefined') return;
    umamiInjected = true;
    // clear any opt-out left by an earlier (consent-gated) build so returning users are tracked again
    try { localStorage.removeItem('umami.disabled'); localStorage.removeItem('starleft_tele'); } catch(e){}
    try {
      const s = document.createElement('script');
      s.async = true; s.src = UMAMI_SRC;
      s.setAttribute('data-website-id', UMAMI_WEBSITE_ID);
      s.onload = umamiFlush;
      (document.head || document.documentElement).appendChild(s);
    } catch(e){ umamiInjected = false; }
  }
  function umamiTrack(name, props){
    if(window.umami && typeof window.umami.track === 'function'){ try { window.umami.track(name, props); } catch(e){} }
    else if(umamiQueue.length < 50) umamiQueue.push([name, props]);   // buffer until the loader is ready
  }

  function event(name, props){
    if(!on() || !name) return;
    const n = String(name).slice(0, 48), p = props || {};
    // sink 1 — Umami custom event
    if(umamiConfigured()) umamiTrack(n, p);
    // sink 2 — raw cookieless collector (sendBeacon JSON)
    if(TELE_ENDPOINT){
      try {
        const payload = JSON.stringify({ n, p, sid, u:'rts.html', t:Date.now() });  // page, not full URL (#mp=CODE is semi-private)
        if(navigator.sendBeacon) navigator.sendBeacon(TELE_ENDPOINT, new Blob([payload], {type:'application/json'}));
        else fetch(TELE_ENDPOINT, { method:'POST', body:payload, keepalive:true, headers:{'Content-Type':'application/json'} }).catch(()=>{});
      } catch(e){}
    }
  }

  // start the pageview loader immediately (always on)
  umamiEnsure();

  return {
    event,
    active(){ return on(); },               // a sink is configured
  };
})();
