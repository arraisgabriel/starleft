/* js/net/gdrive-auth.js — CLASSIC. Publishes window.GDRIVE, the Google Drive auth facade.
   Google Identity Services (GIS) is loaded as an external async <script> (injected here, only when a
   Client ID is configured), so we reach it via whenGsi()/the <script> onload — never an ES module.
   The access token lives ONLY in memory (~1h; the implicit/token flow issues NO refresh token, and a
   long-lived token would need a client secret we can't ship on a static site). Interactive auth fires
   ONLY from getToken({interactive:true}) — i.e. from a real user gesture; auto-ops use {interactive:false}
   and silently no-op rather than ever popping a window. Inert when GDRIVE_CLIENT_ID==='' or on file://
   (mirrors the empty-TELE_ENDPOINT pattern in js/telemetry.js and the unavailable-stub in trystero-boot.js). */
(function(){
  const EMAIL_KEY = 'starleft_gdrive_email';        // a non-secret human label/hint — never a token
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email';
  const EARLY_RENEW_MS = 5 * 60 * 1000;             // treat a token as "expiring" 5 min before the hard ~1h edge
  let tokenClient = null, accessToken = null, tokenExpiresAt = 0, currentEmailStr = null, pending = [];

  const savedEmail = () => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch(_){ return ''; } };
  const tokenValid  = () => !!accessToken && Date.now() < (tokenExpiresAt - 30000);
  const expiringSoon= () => !!accessToken && Date.now() > (tokenExpiresAt - EARLY_RENEW_MS);

  function drainQueue(){
    try { window.dispatchEvent(new Event('gsi:ready')); } catch(_){}
    if (Array.isArray(window.__gsiReadyQueue)) {
      window.__gsiReadyQueue.forEach(fn => { try{ fn(); }catch(_){} });
      window.__gsiReadyQueue.length = 0;
    }
  }
  function flushResolve(t){ const q = pending; pending = []; q.forEach(p => { try{ p.resolve(t); }catch(_){} }); }
  function flushReject(e){  const q = pending; pending = []; q.forEach(p => { try{ p.reject(e); }catch(_){} }); }

  // ---- graceful "unavailable" stub: harmless no-ops, exactly like MP.unavailable (trystero-boot.js:52-57) ----
  function publishUnavailable(reason){
    window.GDRIVE = {
      unavailable:true, _reason:String(reason||''),
      isReady:()=>false,
      getToken:()=>Promise.reject(new Error('gdrive-unavailable')),
      signOut(){}, switchAccount(){ return Promise.reject(new Error('gdrive-unavailable')); },
      currentEmail:()=>savedEmail()||null, refreshEmail:()=>Promise.resolve(savedEmail()||null),
      hasValidToken:()=>false, expiringSoon:()=>false
    };
    window.__GSI_READY = true;
    drainQueue();
  }

  // Feature dormant: no Client ID, or an origin that can't run OAuth (file://). Stay fully inert.
  if (typeof GDRIVE_CLIENT_ID === 'undefined' || !GDRIVE_CLIENT_ID || location.protocol === 'file:') {
    publishUnavailable('disabled');
    return;
  }

  async function fetchEmail(){
    try{
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
                            { headers:{ Authorization:'Bearer '+accessToken } });
      if(!r.ok) return null;
      const j = await r.json();                       // { sub, email, email_verified, ... }
      currentEmailStr = j.email || null;
      if(currentEmailStr){ try{ localStorage.setItem(EMAIL_KEY, currentEmailStr); }catch(_){} }
      return currentEmailStr;
    }catch(_){ return null; }                          // label is best-effort; sync works without it
  }

  function onTokenResponse(resp){                      // initTokenClient callback (success or {error})
    if (resp && resp.error) { return flushReject(resp); }
    accessToken    = resp && resp.access_token || null;
    tokenExpiresAt = Date.now() + (Number(resp && resp.expires_in || 3600) * 1000);
    fetchEmail().then(()=>{ try{ window.dispatchEvent(new Event('gdrive:token')); }catch(_){} });
    flushResolve(accessToken);
    try{ window.dispatchEvent(new Event('gdrive:token')); }catch(_){}
  }
  function onTokenError(err){                           // popup_closed | popup_failed_to_open | ...
    flushReject(err || new Error('gdrive-auth-failed'));
  }

  // INTERACTIVE auth ONLY here — reachable solely from getToken({interactive:true}), i.e. a click handler.
  // The AUTO path ({interactive:false}) never calls requestAccessToken, so autosave can never pop a window.
  function getToken(opts){
    const interactive = !!(opts && opts.interactive);
    if (tokenValid() && !(interactive && expiringSoon())) return Promise.resolve(accessToken);
    if (!interactive) return Promise.reject(new Error('gdrive-needs-interactive'));
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      if (pending.length === 1) {                      // de-dupe: one popup even on rapid clicks
        try { tokenClient.requestAccessToken({ prompt:'', hint: savedEmail() }); }   // near-silent renewal
        catch(e){ flushReject(e); }
      }
    });
  }

  function switchAccount(){                             // interactive — forces the account chooser
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      if (pending.length === 1) {
        try { tokenClient.requestAccessToken({ prompt:'select_account' }); }
        catch(e){ flushReject(e); }
      }
    });
  }

  function signOut(){
    const tok = accessToken;
    accessToken = null; tokenExpiresAt = 0; currentEmailStr = null;
    if (tok && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(tok, ()=>{}); } catch(_){}   // drop the grant server-side
    }
    try { localStorage.removeItem(EMAIL_KEY); } catch(_){}
    try { window.dispatchEvent(new Event('gdrive:signout')); } catch(_){}
  }

  // Built once GIS is present. Called by the injected <script>'s onload via window.__gdriveInit.
  function init(){
    if (!(window.google && google.accounts && google.accounts.oauth2)) return publishUnavailable('gis-missing');
    try{
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GDRIVE_CLIENT_ID,
        scope: SCOPE,
        prompt: '',                                    // default; overridden per-call
        callback: onTokenResponse,
        error_callback: onTokenError
      });
    }catch(e){ return publishUnavailable('init-failed:'+e); }
    window.GDRIVE = {
      unavailable:false,
      isReady:()=>true,
      getToken, switchAccount, signOut,
      currentEmail:()=>currentEmailStr || savedEmail() || null,
      refreshEmail: fetchEmail,            // re-fetch + await the signed-in account's email (token resolves before the label)
      hasValidToken: tokenValid,
      expiringSoon
    };
    window.__GSI_READY = true;
    drainQueue();
  }

  // Exposed for the GIS <script> tag (injected below): onload→init, onerror→unavailable.
  window.__gdriveInit = init;
  window.__gdriveFail = (e)=>publishUnavailable(e || 'gis-load-error');

  // Inject the Google Identity Services library now that we know a Client ID is set and the origin is OK.
  // Kept here (not inline in rts.html) so ALL GIS lifecycle lives in one file; the HTML just includes this script.
  (function injectGis(){
    try{
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload  = () => { try{ window.__gdriveInit(); }catch(_){ window.__gdriveFail('init-threw'); } };
      s.onerror = () => window.__gdriveFail('gsi-network');
      (document.head || document.documentElement).appendChild(s);
    }catch(e){ window.__gdriveFail('inject-failed:'+e); }
  })();
})();
