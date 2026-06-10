/* telemetry.js — lightweight, privacy-respecting analytics (T0-10).
   TELE.event(name, props) POSTs a tiny JSON blob via navigator.sendBeacon to a COOKIELESS
   endpoint (self-hosted Plausible/Umami "custom event" API or any collector). No PII, no
   user id, no fingerprinting — just funnel counts. Hard-gated by:
     • Do-Not-Track (navigator.doNotTrack / globalPrivacyControl) — never sends;
     • a consent toggle persisted in localStorage (TELE.setEnabled, surfaced in Settings);
     • TELE_ENDPOINT — EMPTY by default, so out of the box nothing is ever sent. Point it
       at your collector (e.g. 'https://stats.example.com/api/event') to go live.
   Fails silently offline / blocked. Local & cosmetic — never touches G, saves, or netcode. */

const TELE = (function(){
  const LS_KEY = 'starleft_tele';
  const TELE_ENDPOINT = '';          // ← set to your cookieless collector URL to enable
  let enabled = true;                // consent; AND'ed with DNT + endpoint below
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if(typeof s.enabled === 'boolean') enabled = s.enabled;
  } catch(e){}
  const save = ()=>{ try { localStorage.setItem(LS_KEY, JSON.stringify({ enabled })); } catch(e){} };

  function dnt(){
    try {
      return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    } catch(e){ return false; }
  }
  function on(){ return enabled && !dnt() && !!TELE_ENDPOINT; }

  // tiny anonymous session tag (per-load, in-memory only) so funnels can be stitched per session
  const sid = Math.random().toString(36).slice(2, 10);

  function event(name, props){
    if(!on() || !name) return;
    try {
      const payload = JSON.stringify({
        n: String(name).slice(0, 48),
        p: props || {},
        sid,
        u: 'rts.html',                       // page, not the full URL (an #mp=CODE hash is semi-private)
        t: Date.now(),
      });
      if(navigator.sendBeacon) navigator.sendBeacon(TELE_ENDPOINT, new Blob([payload], {type:'application/json'}));
      else fetch(TELE_ENDPOINT, { method:'POST', body:payload, keepalive:true, headers:{'Content-Type':'application/json'} }).catch(()=>{});
    } catch(e){}
  }

  return {
    event,
    isEnabled(){ return enabled; },
    setEnabled(v){ enabled = !!v; save(); },
    toggle(){ this.setEnabled(!enabled); return enabled; },
    active(){ return on(); },               // endpoint configured + consent + no DNT
  };
})();
