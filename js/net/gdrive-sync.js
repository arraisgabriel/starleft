/* js/net/gdrive-sync.js — CLASSIC. Google Drive appDataFolder save-sync: REST CRUD, push/pull/merge,
   conflict resolution, the "seamless" sync triggers, the Load-menu status UI, and the New-Campaign
   cloud-login nudge. Sits on top of window.GDRIVE (js/net/gdrive-auth.js) for the bearer token, and on
   the public save.js API (saveRawJson/saveWrite/listSaves/isSaveBlob/saveVersionOk/enforceCap/AUTO_KEY/
   SAVE_PREFIX/MANUAL_CAP). Covers SOLO + H.U.B. saves only (co-op is never written to localStorage).
   NEVER changes the save format or its back-compat contract — it only reads/writes whole slots.

   Data model: ONE Drive file per local slot in appDataFolder. media body = the slot's save JSON, stored
   LZ-compressed (base64, GD_LZ_MARK-prefixed) to cut transfer time on big late-game saves; legacy PLAIN-JSON
   bodies (which start with '{') are still read transparently, so this is fully back-compatible. appProperties
   carry a cheap-to-list index. Matching is ALWAYS by appProperties.slKey, never filename/id; the logical save
   round-trips byte-for-byte through saveRawJson/saveWrite. ≤13 files (12 manual + 1 autosave). */

/* ---- config ---- */
const GD_API   = 'https://www.googleapis.com/drive/v3/files';
const GD_UP    = 'https://www.googleapis.com/upload/drive/v3/files';
const GD_FIELDS= 'id,name,appProperties,modifiedTime';
const GD_DEBOUNCE_PUSH = 8000;     // coalesce a burst of saves into ~1 push (manual saves collapse at 3s; autosave is 60s)
const GD_DEBOUNCE_PULL = 5000;     // settle focus/menu events before pulling
const GD_PULL_MIN_INTERVAL = 30000;// never pull more than once / 30s (alt-tab must not hammer Drive)
const GD_CLOUD_MANUAL_CAP = 50;    // cloud retention: keep the newest N MANUAL saves in appDataFolder (the autosave is
                                   // never counted/pruned). Generous vs the 12 local slots so a save another device
                                   // still treats as current is very unlikely to be trimmed. Pruned in the push tail.
const GD_TOAST_MS = 40000;         // long-lived toast (~40s) for the wordy cloud-sync notices — the default 1.8s is far too
                                   // short to read them. Toasts are still replaced by the next toast / clearToast().
const GD_SYNC_DISABLE_MAX = 20000; // ▶ Continue is disabled while a pull's resume slot is unresolved; this caps the
                                   // disable so a hung network call can never trap the button — re-enables even mid-sync.
const GD_LZ_MARK = String.fromCharCode(1);   // 1st char of a compressed Drive body (control char — never starts JSON '{' or base64)

/* ---- save pools ----
   The cloud layer syncs TWO disjoint pools, each tagged in Drive by appProperties.app so they never mix in
   appDataFolder: SOLO ('starleft', the campaign/H.U.B. slots) and MP ('starleft-mp', the co-op campaign slots).
   Every CRUD/push/pull/prune fn takes a pool descriptor and defaults to SOLO, so the solo path is unchanged. */
function GD_solo(){ return { id:'solo', appTag:'starleft', autoKey:AUTO_KEY, manualCap:MANUAL_CAP,
  list:(typeof listSaves==='function'?listSaves:function(){return[];}), enforceCap:(typeof enforceCap==='function'?enforceCap:function(){}) }; }
function GD_mp(){ return { id:'mp', appTag:'starleft-mp', autoKey:null, manualCap:(typeof MP_MANUAL_CAP!=='undefined'?MP_MANUAL_CAP:12),
  list:(typeof listMpSaves==='function'?listMpSaves:function(){return[];}), enforceCap:(typeof enforceMpCap==='function'?enforceMpCap:function(){}) }; }
function gdPools(){ const out=[GD_solo()]; if(typeof MP_SAVE_PREFIX!=='undefined') out.push(GD_mp()); return out; }
function gdPoolIdOf(appTag){ return appTag==='starleft-mp' ? 'mp' : 'solo'; }

/* ---- module state (bare globals, per the project's classic-scope convention) ---- */
let GD_tok = null;                 // bearer for the in-flight push/pull batch (refreshed by driveFetch on 401)
let GD_cloudIndex = [];            // last listed cloud index: [{id,name,slKey,savedAt,mapName,mapIndex,hub,auto,modifiedTime}]
let GD_pushTimer = null, GD_pullTimer = null, GD_lastPullAt = 0, GD_lastSyncAt = 0;
let GD_statusState = '', GD_statusInfo = null;
let GD_syncWatchdog = null, GD_syncStuck = false;   // watchdog so a hung sync can't leave ▶ Continue disabled forever
let GD_syncInflight = 0;            // ref-count of ALL concurrent syncs (push+pull) → drives the "☁ Syncing…" indicator
let GD_contLock = 0;               // ref-count of in-flight PULLS whose resume (autosave) slot isn't resolved yet → disables ▶ Continue
let GD_pullActive = {};            // pool.id → true while a pull runs; race-free dedup so overlapping triggers don't double-pull
let GD_signinPromptedThisSession = false;   // the menu sign-in/decline panel shows at most once per page load (cloudDeclined() stops it across sessions)

/* ---- TEMP double-pull diagnostics (localhost only; remove once the ▶ Continue double-disable is pinned down) ---- */
const GD_DBG = (()=>{ try{ return /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname); }catch(_){ return false; } })();
let GD_dbgN = 0;
function gdlog(){ if(!GD_DBG) return; try{ console.log.apply(console, ['%c[gdrive]','color:#5cf;font-weight:bold'].concat([].slice.call(arguments))); }catch(_){} }
function gdCaller(){ try{ return (new Error().stack||'').split('\n').slice(3,6).map(s=>s.trim().replace(/^at\s+/,'')).join('  ←  '); }catch(_){ return '?'; } }
if(GD_DBG){ try{ console.log('%c[gdrive] sync module LOADED — double-pull diagnostics ON (build '+Date.now()+')','color:#5cf;font-weight:bold'); }catch(_){} }

const GD_sleep = ms => new Promise(r => setTimeout(r, ms));
function cloudOn(){ try{ return localStorage.getItem('starleft_cloud_on')==='1'; }catch(_){ return false; } }
function setCloudOn(v){ try{ if(v){ localStorage.setItem('starleft_cloud_on','1'); localStorage.removeItem('starleft_cloud_declined'); } else { localStorage.removeItem('starleft_cloud_on'); } }catch(_){} }
function cloudNudgeSeen(){ try{ return localStorage.getItem('starleft_cloud_nudge_seen')==='1'; }catch(_){ return false; } }
function setCloudNudgeSeen(){ try{ localStorage.setItem('starleft_cloud_nudge_seen','1'); }catch(_){} }
// Persistent "player chose not to sync" decision: silences the menu sign-in panel AND the New-Campaign nudge
// across sessions. Reversible — connecting from the Load menu calls setCloudOn(true), which clears it.
function cloudDeclined(){ try{ return localStorage.getItem('starleft_cloud_declined')==='1'; }catch(_){ return false; } }
function setCloudDeclined(){ try{ localStorage.setItem('starleft_cloud_declined','1'); }catch(_){} }

/* ---- low-level REST ---- */
// One wrapper for every Drive call: classifies status codes, refreshes a 401 once (silently), retries a 5xx once.
async function driveFetch(url, opts){
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers, { Authorization:'Bearer '+GD_tok });
  let res;
  try{ res = await fetch(url, opts); }catch(e){ throw { kind:'network', err:e }; }
  if(res.ok) return res;
  if(res.status===401){                                  // token bad/expired → one SILENT refresh + retry
    let fresh=null; try{ fresh = await GDRIVE.getToken({ interactive:false }); }catch(_){}
    if(fresh && fresh!==GD_tok){
      GD_tok = fresh; opts.headers.Authorization='Bearer '+GD_tok;
      try{ res = await fetch(url, opts); }catch(e){ throw { kind:'network', err:e }; }
      if(res.ok) return res;
    }
    throw { kind:'auth', status:res.status };            // surface "sign in to sync" — never auto-pop
  }
  if(res.status===403) throw { kind:'perm', status:403 };// quota / scope / revoked — no retry
  if(res.status===404) throw { kind:'missing', status:404 };
  if(res.status>=500){
    await GD_sleep(700);
    try{ res = await fetch(url, opts); }catch(e){ throw { kind:'network', err:e }; }
    if(res.ok) return res;
    throw { kind:'server', status:res.status };
  }
  throw { kind:'http', status:res.status };
}

// multipart/related upload (create=POST, update=PATCH). metadata part + media part (compressed or plain JSON).
async function driveMultipart(method, url, metadata, mediaBody, mediaType){
  const boundary = 'starleft_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const body =
    '--'+boundary+'\r\n'+
    'Content-Type: application/json; charset=UTF-8\r\n\r\n'+ JSON.stringify(metadata) +'\r\n'+
    '--'+boundary+'\r\n'+
    'Content-Type: '+(mediaType||'application/json')+'\r\n\r\n'+ mediaBody +'\r\n'+
    '--'+boundary+'--';
  const res = await driveFetch(url, { method, headers:{ 'Content-Type':'multipart/related; boundary='+boundary }, body });
  return res.json();
}

// Cloud body codec: compress the (large, plain-JSON) save so it transfers ~8-12× smaller. base64 keeps the
// multipart body ASCII-safe; GD_LZ_MARK lets the reader tell a compressed body from a legacy plain-JSON one.
function gdEncodeBody(json){
  if(typeof LZString!=='undefined'){
    try{ return { body: GD_LZ_MARK + LZString.compressToBase64(json), type:'text/plain; charset=UTF-8' }; }catch(_){}
  }
  return { body: json, type:'application/json' };   // no LZString → upload plain (still readable by everyone)
}
// Inverse: legacy plain JSON (starts with '{') passes through; a GD_LZ_MARK-prefixed body is inflated. null on failure
// → recreateSlot skips that slot (a safe no-op). The LZString-missing branch is only reachable on a stale cached tab
// predating the lz-string include; it just won't fast-forward compressed slots until reloaded — never corrupts.
function gdDecodeBody(body){
  if(body && body.charAt(0)===GD_LZ_MARK){
    if(typeof LZString==='undefined') return null;
    try{ return LZString.decompressFromBase64(body.slice(1)); }catch(_){ return null; }
  }
  return body;
}

// List the appDataFolder index (metadata only — no bodies). Caches into GD_cloudIndex.
async function driveList(){
  const out = [];
  let pageToken = '';
  do{
    const u = GD_API + '?spaces=appDataFolder&pageSize=100&fields=nextPageToken,files('+GD_FIELDS+')'
            + (pageToken ? '&pageToken='+encodeURIComponent(pageToken) : '');
    const res = await driveFetch(u, { method:'GET' });
    const j = await res.json();
    (j.files||[]).forEach(f=>{
      const ap = f.appProperties || {};
      const app = ap.app || 'starleft';                  // legacy files (no app tag) are solo
      if(app!=='starleft' && app!=='starleft-mp') return;// ignore anything not ours (appDataFolder is per-app anyway)
      if(!ap.slKey) return;
      out.push({ id:f.id, name:f.name, pool:gdPoolIdOf(app), slKey:ap.slKey, savedAt:+ap.savedAt||0,
                 mapName:ap.mapName||'', mapIndex:+ap.mapIndex||0, hub:ap.hub==='1', auto:ap.auto==='1',
                 modifiedTime:f.modifiedTime });
    });
    pageToken = j.nextPageToken || '';
  } while(pageToken);
  GD_cloudIndex = out;
  return out;
}
function slotMeta(s, pool){
  return { app:(pool&&pool.appTag)||'starleft', slKey:s.key, savedAt:String(s.savedAt||0),
           mapName:(s.mapName||'').slice(0,100), mapIndex:String(s.mapIndex||0),
           hub:s.hub?'1':'0', auto:s.auto?'1':'0' };
}
function slotFileName(s, pool){
  const slug = (typeof saveSlug==='function') ? saveSlug(s.mapName||'save') : 'save';
  const pre = (pool&&pool.id==='mp') ? 'starleft-coop-' : 'starleft-';
  return s.auto ? 'starleft-autosave.json' : (pre+slug+'-'+String(s.savedAt||0).slice(-6)+'.json');
}
async function driveCreate(s, json, pool){
  const enc = gdEncodeBody(json);
  return driveMultipart('POST', GD_UP+'?uploadType=multipart&fields='+GD_FIELDS,
    Object.assign({ name:slotFileName(s,pool), parents:['appDataFolder'] }, { appProperties:slotMeta(s,pool) }), enc.body, enc.type);
}
async function driveUpdate(id, s, json, pool){
  const enc = gdEncodeBody(json);
  return driveMultipart('PATCH', GD_UP+'/'+id+'?uploadType=multipart&fields='+GD_FIELDS,
    { name:slotFileName(s,pool), appProperties:slotMeta(s,pool) }, enc.body, enc.type);   // PATCH must NOT include parents
}
async function driveDownload(id){
  const res = await driveFetch(GD_API+'/'+id+'?alt=media', { method:'GET' });
  return res.text();
}
async function driveDelete(id){
  await driveFetch(GD_API+'/'+id, { method:'DELETE' });
}

/* ---- token gate for a push/pull batch ----
   mode: true → interactive (may pop a window); 'silent' → near-silent grant (no window unless interaction is
   truly required, in which case it's popup-blocked and rejects); falsy → cached-token-only (autosave push). */
async function gdAcquire(mode){
  const opts = mode===true ? { interactive:true }
             : mode==='silent' ? { interactive:false, silent:true }
             : { interactive:false };
  let t=null; try{ t = await GDRIVE.getToken(opts); }catch(_){ t=null; }
  if(!t){ syncStatus('signin'); return false; }
  GD_tok = t; return true;
}

/* ---- PUSH (local → cloud) ---- */
async function gdrivePush(opts){
  opts = opts || {}; const pool = opts.pool || GD_solo();
  if(!gisAvailable()) return { ok:false, reason:'unavailable' };
  if(!(await gdAcquire(opts.interactive))) return { ok:false, reason:'noauth' };
  gdSyncEnter(false);   // a push is local→cloud only; it never re-points ▶ Continue, so it doesn't disable it
  try{
    const cloud = await driveList();
    const byKey = new Map(cloud.filter(f=>f.pool===pool.id).map(f=>[f.slKey, f]));   // only THIS pool's files
    const conflicts = []; let pushed=0, skipped=0;
    for(const s of pool.list()){
      let json; try{ json = saveRawJson(s.key); }catch(_){ json=null; }
      if(!json) continue;
      const remote = byKey.get(s.key);
      try{
        if(!remote){ await driveCreate(s, json, pool); pushed++; }
        else if(s.savedAt > remote.savedAt){ await driveUpdate(remote.id, s, json, pool); pushed++; }
        else if(s.savedAt < remote.savedAt){ conflicts.push({ slKey:s.key, id:remote.id, local:s.savedAt, cloud:remote.savedAt, mapName:remote.mapName, auto:remote.auto }); skipped++; }
        else skipped++;                                   // equal savedAt → identical, no-op
      }catch(e){ /* per-slot failure must not abort the batch */ skipped++; }
    }
    await driveList();                                    // refresh the cached index after writes
    try{ await gdrivePruneCloud(pool); }catch(_){}         // best-effort retention trim (never affects push success)
    GD_lastSyncAt = nowMs();
    syncStatus(conflicts.length ? 'conflict' : 'ok', { pushed, skipped, conflicts });
    return { ok:true, pushed, skipped, conflicts };
  }catch(e){ syncStatus(statusFor(e)); return { ok:false, reason:'error', err:e }; }
  finally{ gdSyncLeave(); }
}

/* ---- background cloud retention: keep only the newest GD_CLOUD_MANUAL_CAP manual files ----
   Runs only as the tail of a push (which is debounced + non-interactive + background), so it never blocks
   the game, never pops auth, and never runs on its own timer. The autosave (AUTO_KEY) is the shared resume
   slot and is NEVER counted or pruned. Deletes the OLDEST-beyond-cap by exact file id, per-file guarded so
   one failure can't abort the batch (the next push retries). Idempotent: a no-op once the cloud is ≤ cap. */
async function gdrivePruneCloud(pool){
  pool = pool || GD_solo();
  const manual = GD_cloudIndex.filter(f=>f && f.pool===pool.id && f.slKey && f.slKey!==pool.autoKey && !f.auto)
                              .sort((a,b)=> b.savedAt - a.savedAt);     // newest first
  if(manual.length <= GD_CLOUD_MANUAL_CAP) return 0;                     // common case: nothing to trim
  const stale = manual.slice(GD_CLOUD_MANUAL_CAP);                       // everything past the cap = the oldest
  let pruned = 0;
  for(const f of stale){
    try{ await driveDelete(f.id); GD_cloudIndex = GD_cloudIndex.filter(x=>x.id!==f.id); pruned++; }
    catch(_){ /* leave it for the next push; never abort */ }
  }
  return pruned;
}

/* ---- PULL (cloud → local) + reconcile/merge ---- */
async function gdrivePull(opts){
  opts = opts || {}; const pool = opts.pool || GD_solo();
  const autoApply = !!opts.autoApply;   // seamless menu/boot pull: fast-forward newer cloud slots in place, NEVER prompt
  const _dbgId = ++GD_dbgN;
  gdlog('gdrivePull #'+_dbgId, { pool:pool.id, autoApply, interactive:!!opts.interactive, silent:!!opts.silent,
    pullActive:!!GD_pullActive[pool.id], lastPull: GD_lastPullAt ? (nowMs()-GD_lastPullAt)+'ms ago' : 'never',
    contLock:GD_contLock, inflight:GD_syncInflight }, '\n    caller:', gdCaller());
  if(!gisAvailable()) { gdlog('gdrivePull #'+_dbgId+' → SKIP unavailable'); return { ok:false, reason:'unavailable' }; }
  // Dedup authority for the seamless fast-forwards (boot gdriveMenuSync + the menu-show call + a focus-fired
  // gdriveSeamlessPull). Running two of them back-to-back disables ▶ Continue, re-enables it, then disables it again.
  // Both guards below are claimed SYNCHRONOUSLY (no await before them) so NO entry-point ordering can slip a second
  // pull through — the entry-point throttle can be raced because gdriveMenuSync's no-token branch only stamps
  // GD_lastPullAt AFTER an async token grant. (1) in-flight latch covers overlapping pulls; (2) the 30s throttle,
  // re-checked + re-stamped here, covers sequential ones. Interactive/explicit pulls (Connect/Sync now/Restore) and
  // MP pulls are exempt — they must always run.
  // A "fast-forward" pull is any autoApply pull of a pool with an autosave — that's the boot/menu gdriveMenuSync pull
  // AND gdriveDoConnect's post-sign-in pull (interactive:true but ALSO autoApply). They do the identical thing and BOTH
  // gate ▶ Continue, so both must dedup against each other. Keyed on autoApply (NOT !interactive): the explicit
  // "Sync now"/"Restore" buttons are interactive but autoApply:false, so they stay exempt and always run — the latch +
  // throttle below are BOTH gated on `seamless` so an explicit pull is never dropped by a background seamless one.
  const seamless = autoApply && !!pool.autoKey;
  if(seamless && GD_pullActive[pool.id]) { gdlog('gdrivePull #'+_dbgId+' → SKIP inflight (another seamless pull of pool '+pool.id+' is running)'); return { ok:false, reason:'inflight' }; }
  if(seamless && GD_lastPullAt > 0 && (nowMs() - GD_lastPullAt) < GD_PULL_MIN_INTERVAL) { gdlog('gdrivePull #'+_dbgId+' → SKIP throttled ('+(nowMs()-GD_lastPullAt)+'ms < '+GD_PULL_MIN_INTERVAL+'ms)'); return { ok:false, reason:'throttled' }; }
  if(seamless){ GD_pullActive[pool.id] = true; GD_lastPullAt = nowMs(); }
  gdlog('gdrivePull #'+_dbgId+' → RUN  (seamless='+seamless+', gates Continue='+(autoApply && !!pool.autoKey)+')');
  // Gate ▶ Continue only when THIS pull can auto-overwrite the local autosave it resumes: an autoApply pull of a
  // pool that has an autosave (solo). A non-autoApply pull only prompts (never auto-writes), and the MP pool has
  // no autosave — neither should disable Continue.
  const gatesCont = autoApply && !!pool.autoKey;
  let contHeld = false, entered = false;
  const releaseCont = ()=>{ if(contHeld){ contHeld=false; gdContUnlock(); } };
  // Everything past the latch runs in try/finally so the latch + sync counters ALWAYS release — even if gdAcquire or
  // gdSyncEnter throws — so a stray rejection can never strand the pool's latch (which would block all its pulls).
  try{
    const acqMode = opts.interactive ? true : (opts.silent ? 'silent' : false);
    if(!(await gdAcquire(acqMode))) return { ok:false, reason:'noauth' };
    contHeld = gatesCont; entered = true;   // gdSyncEnter's first act (inflight++) can't fail → commit to gdSyncLeave
    gdSyncEnter(gatesCont);
    const cloud = (await driveList()).filter(f=>f.pool===pool.id);   // only THIS pool's files
    const localByKey = new Map(pool.list().map(s=>[s.key, s]));
    const recreate = [], fastForward = [], conflicts = [];
    for(const f of cloud){
      const local = localByKey.get(f.slKey);
      if(!local) recreate.push(f);                                   // cloud-only slot → download (cap-aware)
      else if(f.savedAt > local.savedAt){                            // cloud strictly newer than this device's copy
        if(autoApply) fastForward.push(f);                           // seamless: last-write-wins, overwrite in place
        else conflicts.push({ slKey:f.slKey, id:f.id, local:local.savedAt, cloud:f.savedAt, mapName:f.mapName, auto:f.auto });
      }
      // f.savedAt <= local → local newer-or-equal; pull does nothing (push will carry it up)
    }
    const recN = recreate.length, ffN = fastForward.length;
    // ▶ Continue resumes latestSave() — the NEWEST slot by savedAt across the autosave AND every manual slot
    // (save.js), not just the autosave. So fetch whichever INCOMING cloud slot will become that resume target
    // FIRST, then re-enable Continue; the rest download in the background. If the newest slot is already a current
    // local one (nothing incoming outranks it), no fetch is needed and Continue re-enables immediately.
    if(gatesCont){
      let target = null;                                             // the incoming cloud slot that will be latestSave(), if any
      for(const f of fastForward) if(!target || f.savedAt > target.savedAt) target = f;
      for(const f of recreate)    if(!target || f.savedAt > target.savedAt) target = f;
      let localMax = 0; for(const s of localByKey.values()) if(s.savedAt > localMax) localMax = s.savedAt;
      if(target && target.savedAt > localMax){                       // resume target is an incoming cloud slot → write it first
        if(await recreateSlot(target)){                              // on success drop it from the background queue (avoid a double-write)
          let i = fastForward.indexOf(target); if(i>=0) fastForward.splice(i,1);
          else { i = recreate.indexOf(target); if(i>=0) recreate.splice(i,1); }
        }                                                            // on failure leave it queued so the background pass retries it THIS pull
      }
      if(typeof syncContinueButton==='function') syncContinueButton();// re-point Continue (or keep the already-current one)
      releaseCont();                                                  // resume slot is final → Continue safe even mid-sync
    }
    await reconcileAndRecreate(recreate, pool);                       // remaining cloud-only slots (resume target already handled above)
    for(const f of fastForward) await recreateSlot(f);               // remaining newer slots
    gdriveRefreshMenus();
    GD_lastSyncAt = nowMs();
    if(!autoApply && conflicts.length){ syncStatus('conflict', { conflicts }); showCloudConflict(conflicts); }
    else syncStatus('ok');
    return { ok:true, recreated:recN, fastForwarded:ffN, conflicts };
  }catch(e){ syncStatus(statusFor(e)); return { ok:false, reason:'error', err:e }; }
  finally{ releaseCont(); if(entered) gdSyncLeave(); if(seamless) GD_pullActive[pool.id] = false; }   // only seamless pulls own the latch
}

// Download a cloud file and write it locally under its OWN slKey, PRESERVING savedAt (the deliberate
// deviation from importSaveFile, which re-stamps — preserving keeps last-write-wins coherent + pull idempotent).
async function recreateSlot(f){
  let body; try{ body = await driveDownload(f.id); }catch(_){ return false; }
  const json = gdDecodeBody(body);          // legacy plain JSON passes through; compressed bodies are inflated
  if(json==null) return false;
  let d=null; try{ d=JSON.parse(json); }catch(_){ return false; }
  if(!isSaveBlob(d) || !saveVersionOk(d)) return false;
  try{ saveWrite(f.slKey, d); }catch(_){ return false; }
  return true;
}

// Recreate cloud-missing slots while respecting the pool's local cap: the newest-by-savedAt slots win.
async function reconcileAndRecreate(cloudMissing, pool){
  pool = pool || GD_solo();
  const cloudAuto   = pool.autoKey ? cloudMissing.filter(f=>f.slKey===pool.autoKey) : [];
  const cloudManual = pool.autoKey ? cloudMissing.filter(f=>f.slKey!==pool.autoKey) : cloudMissing.slice();
  for(const f of cloudAuto) await recreateSlot(f);       // the shared, capped-at-1 autosave slot (solo only)

  const localManual = pool.list().filter(s=>!s.auto);
  const merged = localManual.map(s=>({ slKey:s.key, savedAt:s.savedAt, local:true }))
    .concat(cloudManual.map(f=>({ slKey:f.slKey, savedAt:f.savedAt, file:f, local:false })))
    .sort((a,b)=> b.savedAt - a.savedAt);                // newest first
  const keep = merged.slice(0, pool.manualCap);
  const dropped = merged.length - keep.length;
  for(const m of keep){
    if(!m.local){ try{ pool.enforceCap(); }catch(_){} await recreateSlot(m.file); }
  }
  if(dropped>0 && typeof toast==='function')
    toast('Cloud has '+dropped+' more save'+(dropped===1?'':'s')+' than this device holds ('+pool.manualCap+' max). Newest kept; the rest stay backed up in the cloud.', GD_TOAST_MS);
}

/* ---- conflict prompt (#cloudConflict overlay; mirrors showExtractConfirm in js/hub.js) ---- */
function showCloudConflict(conflicts){
  const el = document.getElementById('cloudConflict');
  if(!el || !conflicts || !conflicts.length){ return; }
  const wasRunning = (typeof running!=='undefined' && running);
  if(wasRunning){ running=false; if(typeof syncPauseBtn==='function') syncPauseBtn(); }
  const when = ms => { try{ return new Date(ms).toLocaleString(); }catch(_){ return ''; } };
  const rows = conflicts.map((c,i)=>{
    const lbl = c.auto ? '★ Autosave' : (c.mapName||'Quarter');
    return '<div class="save-row cloud-conflict-row"><div class="map-btn" style="opacity:.85"><b>'+lbl+'</b>'
      + '<small>This device: '+when(c.local)+' · Cloud: '+when(c.cloud)+' (newer)</small></div>'
      + '<button class="tc-btn" id="ccCloud'+i+'" title="Use the newer cloud copy">⬇</button>'
      + '<button class="tc-btn" id="ccKeep'+i+'" title="Keep this device’s copy">✓</button></div>';
  }).join('');
  el.className='overlay';
  el.innerHTML = '<div class="big">☁</div><h1>CLOUD SAVE IS NEWER</h1>'
    + '<h2>'+conflicts.length+' save'+(conflicts.length===1?'':'s')+' differ between this device and the cloud</h2>'
    + '<p>The cloud copy was saved more recently. Choose per save — nothing is overwritten until you pick.</p>'
    + rows
    + '<button class="sc-btn" id="ccCloudAll">Use cloud for all</button>'
    + '<button class="sc-btn back" id="ccDone">Done</button>';
  el.style.display='flex';
  const close = ()=>{ el.style.display='none'; el.innerHTML=''; if(wasRunning){ running=true; if(typeof syncPauseBtn==='function') syncPauseBtn(); } };
  const useCloud = async (c)=>{
    if(!(await gdAcquire(true))) return;
    const ok = await recreateSlot({ id:c.id, slKey:c.slKey });
    if(ok && typeof toast==='function') toast('Loaded cloud copy of '+(c.mapName||'save'));
    gdriveRefreshMenus();
  };
  conflicts.forEach((c,i)=>{
    const keepBtn=document.getElementById('ccKeep'+i), cloudBtn=document.getElementById('ccCloud'+i);
    if(keepBtn) keepBtn.onclick=()=>{ keepBtn.disabled=true; if(cloudBtn) cloudBtn.disabled=true; };   // keep local: nothing destructive
    if(cloudBtn) cloudBtn.onclick=async ()=>{ await useCloud(c); cloudBtn.disabled=true; if(keepBtn) keepBtn.disabled=true; };
  });
  const all=document.getElementById('ccCloudAll'); if(all) all.onclick=async ()=>{ for(const c of conflicts) await useCloud(c); close(); };
  const done=document.getElementById('ccDone'); if(done) done.onclick=()=>{ gdriveRefreshMenus(); close(); };
}

/* ---- sync triggers ---- */
function gdriveConnect(){
  gdlog('gdriveConnect() CALLED', '\n    caller:', gdCaller());
  whenGsi(async ()=>{
    if(!gisAvailable()){ if(typeof toast==='function') toast('Cloud save unavailable here'); return; }
    // Capture the PREVIOUSLY-connected account (the persisted hint) BEFORE sign-in overwrites it.
    const prevEmail = (window.GDRIVE && GDRIVE.currentEmail && GDRIVE.currentEmail()) || '';
    if(!(await gdAcquire(true))) return;                 // interactive sign-in (a real gesture)
    // The token resolves before the email label is fetched — await the fresh account explicitly.
    let newEmail=''; try{ newEmail = (GDRIVE.refreshEmail ? await GDRIVE.refreshEmail() : (GDRIVE.currentEmail && GDRIVE.currentEmail())) || ''; }catch(_){}
    const localCount = (typeof listSaves==='function') ? listSaves().length : 0;
    // Local saves are device-global, not per-account — signing into a DIFFERENT account would upload them
    // to that account on push. If that's happening AND there are local saves, confirm before uploading.
    if(prevEmail && newEmail && prevEmail!==newEmail && localCount>0){
      showCloudAccountSwitch(newEmail, localCount, gdriveDoConnect, gdriveCancelConnect);
      return;
    }
    gdriveDoConnect();
  });
}
// Run an op across BOTH pools (solo + co-op). Push-before-pull keeps un-uploaded locals safe before any eviction.
async function gdrivePullAll(opts){ let r=null; for(const p of gdPools()){ r=await gdrivePull(Object.assign({}, opts||{}, {pool:p})); } return r; }
async function gdrivePushAll(opts){ let r=null; for(const p of gdPools()){ r=await gdrivePush(Object.assign({}, opts||{}, {pool:p})); } return r; }
// Proceed with the merge: push (back up locals first) then SEAMLESSLY fast-forward newer cloud saves across
// both pools. Connecting is an opt-in to "keep my saves synced", so the pull is autoApply (last-write-wins,
// no prompt) to match the no-clicks intent — the explicit "Sync now" / "Restore from cloud" buttons still prompt.
// setCloudOn(true) also clears any prior "declined" flag.
function gdriveDoConnect(){
  gdlog('gdriveDoConnect() CALLED — push-all + interactive autoApply pull-all', '\n    caller:', gdCaller());
  setCloudOn(true);
  (async ()=>{ await gdrivePushAll({ interactive:true }); await gdrivePullAll({ interactive:true, autoApply:true }); gdriveRefreshUI(); })();
}
// Abort: sign back out, leave sync off, upload nothing. Local saves are untouched.
function gdriveCancelConnect(){
  if(window.GDRIVE && GDRIVE.signOut) GDRIVE.signOut();
  setCloudOn(false); GD_cloudIndex=[]; gdriveRefreshUI();
  if(typeof toast==='function') toast('Cloud sync cancelled — nothing was uploaded');
}
// "These device saves will also be uploaded to <newEmail>" confirm (reuses the #cloudNudge overlay shell).
function showCloudAccountSwitch(newEmail, count, onContinue, onCancel){
  const el=document.getElementById('cloudNudge');
  if(!el){ onContinue(); return; }                        // fail open
  el.className='overlay submenu';
  el.innerHTML='<div class="submenu-panel"><div class="big">☁</div>'
    + '<h2>Upload this device’s saves to a new account?</h2>'
    + '<div class="panel-label">Signing in as '+newEmail+'</div>'
    + '<p style="max-width:48ch;margin:.6em auto;opacity:.9">This device has <b>'+count+' save'+(count===1?'':'s')+'</b> that aren’t tied to a Google account. Continuing will upload '+(count===1?'it':'them')+' to <b>'+newEmail+'</b> and merge in that account’s cloud saves. Your on-device saves are never deleted.</p>'
    + '<div class="submenu-actions">'
    + '<button class="sc-btn" id="casGo">☁ Continue &amp; upload</button>'
    + '<button class="sc-btn back" id="casCancel">Cancel</button>'
    + '</div></div>';
  el.style.display='flex';
  const close=()=>{ el.style.display='none'; el.innerHTML=''; };
  const go=document.getElementById('casGo'), cancel=document.getElementById('casCancel');
  if(go) go.onclick=()=>{ close(); onContinue(); };
  if(cancel) cancel.onclick=()=>{ close(); onCancel(); };
}
function gdriveSyncNow(){ whenGsi(async ()=>{ if(!gisAvailable()) return; await gdrivePushAll({ interactive:true }); await gdrivePullAll({ interactive:true }); gdriveRefreshUI(); }); }
function gdriveRestore(){ whenGsi(async ()=>{ if(!gisAvailable()) return; await gdrivePullAll({ interactive:true }); gdriveRefreshUI(); }); }
function gdriveDisconnect(){ if(window.GDRIVE && GDRIVE.signOut) GDRIVE.signOut(); setCloudOn(false); GD_cloudIndex=[]; gdriveRefreshMenus(); gdriveRefreshUI(); }

// Auto-push after a successful save/autosave — debounced, NEVER interactive (can't pop a window).
function gdriveAutoPush(){
  if(!cloudOn() || !gisAvailable()) return;
  clearTimeout(GD_pushTimer);
  GD_pushTimer = setTimeout(()=>{ gdrivePush({ interactive:false }); }, GD_DEBOUNCE_PUSH);
}
// Auto-pull on focus / Load-menu open — debounced + throttled, NEVER interactive. SOLO pool only.
// (Kept for safety/back-compat; the live triggers now route through gdriveSeamlessPull / gdriveMenuSync.)
function gdriveAutoPull(){
  if(!cloudOn() || !gisAvailable()) return;
  if(nowMs() - GD_lastPullAt < GD_PULL_MIN_INTERVAL) return;
  clearTimeout(GD_pullTimer);
  GD_pullTimer = setTimeout(()=>{ GD_lastPullAt = nowMs(); gdrivePull({ interactive:false }); }, GD_DEBOUNCE_PULL);
}

/* ---- seamless cross-device fast-forward (the "always fresh on the menu" path) ----
   Two entry points, both SOLO pool, both gated off a running match and throttled to GD_PULL_MIN_INTERVAL
   (cold boot has GD_lastPullAt===0, so the first call always runs). They fire the pull IMMEDIATELY (no 5s
   debounce) and auto-apply newer cloud saves in place — Continue + Load list refresh with zero clicks. */

// Silent-only fast-forward — used where an inline Connect button already exists (Load menu) or a modal
// would be jarring (alt-tab focus). No sign-in panel: if there's no token it just no-ops quietly.
function gdriveSeamlessPull(){
  whenGsi(()=>{
    if(!cloudOn() || !gisAvailable()) return;
    if(typeof running!=='undefined' && running) return;
    if(nowMs() - GD_lastPullAt < GD_PULL_MIN_INTERVAL) return;   // fast-path only; gdrivePull is the authoritative throttle + setter
    gdrivePull({ interactive:false, silent:true, autoApply:true });
  });
}

// Panel-capable entry — used at BOOT and on every main-menu (startScreen) show. Syncs invisibly when it
// can; only when Drive is unreachable without interaction does it surface the explicit choice panel.
function gdriveMenuSync(){
  whenGsi(async ()=>{
    if(!gisAvailable()) return;                          // inert origin (file:// / no Client ID) → no cloud UI ever
    if(typeof running!=='undefined' && running) return;  // never mid-match
    if(cloudDeclined()) return;                          // player chose "Don't sync" → respect it, stay silent
    const hasTok = !!(GDRIVE.hasValidToken && GDRIVE.hasValidToken());
    if(hasTok){                                          // already authed → silent fast-forward, throttled
      if(nowMs() - GD_lastPullAt < GD_PULL_MIN_INTERVAL) return;   // fast-path; gdrivePull re-checks + stamps GD_lastPullAt
      gdrivePull({ interactive:false, silent:true, autoApply:true });
      return;
    }
    // No token. Make ONE silent attempt per page session; if it can't grant without interaction, surface the choice.
    if(GD_signinPromptedThisSession) return;
    GD_signinPromptedThisSession = true;
    if(await gdAcquire('silent')){                       // active Google session + standing consent → no window shown
      setCloudOn(true);                                  // silent success implies the account already authorized us
      gdrivePull({ interactive:false, silent:true, autoApply:true });   // gdrivePull's synchronous throttle dedups any concurrent seamless pull
    } else {
      showCloudSignInPanel();                            // expired session / never granted / never opted in
    }
  });
}

// The explicit "Sign in or don't sync" choice panel (reuses the #cloudNudge overlay shell).
function showCloudSignInPanel(){
  const el=document.getElementById('cloudNudge'); if(!el) return;     // fail open (no overlay → just stays local)
  const reAuth = cloudOn();                                            // opted in before, but the token lapsed
  el.className='overlay submenu';
  el.innerHTML='<div class="submenu-panel"><div class="big">☁</div>'
    + '<h2>'+(reAuth ? 'Sign in again to keep your saves in sync' : 'Sync your saves across devices?')+'</h2>'
    + '<div class="panel-label">'+(reAuth ? 'Your Google sign-in expired — saves aren’t syncing right now.' : 'STARLEFT can sync your saves with your Google account.')+'</div>'
    + '<p style="max-width:46ch;margin:.6em auto;opacity:.9">Sign in with the <b>same Google account</b> on each device to see the same saves everywhere. Without it, your saves stay on <b>this device only</b>.</p>'
    + '<div class="submenu-actions">'
    + '<button class="sc-btn" id="csiConnect">☁ Sign in to Google Drive</button>'
    + '<button class="sc-btn back" id="csiSkip">Don’t sync save files</button>'
    + '</div></div>';
  el.style.display='flex';
  const close=()=>{ el.style.display='none'; el.innerHTML=''; };
  const connect=document.getElementById('csiConnect');
  const skip=document.getElementById('csiSkip');
  if(connect) connect.onclick=()=>{ close(); gdriveConnect(); };       // real click → interactive sign-in (popup allowed)
  if(skip) skip.onclick=()=>{ setCloudDeclined(); setCloudOn(false); close();
    if(typeof toast==='function') toast('Saves stay on this device — turn on cloud sync anytime from Load Game', GD_TOAST_MS);
    gdriveRefreshUI(); };
}
// Called from openLoadMenu(): refresh the cloud UI, then opportunistically (silently) fast-forward.
function gdriveOnLoadMenuOpen(){ gdriveRefreshUI(); gdriveSeamlessPull(); }

/* ---- co-op (MP) pool sync triggers — kept OFF the focus/Load-menu auto-pull so a pull can never pop the
   conflict overlay mid-co-op-match. MP push is safe anytime (never pops the overlay); MP pull runs only at
   lobby-safe points (resume picker open) where the game isn't running. ---- */
let GD_mpPushTimer = null;
function gdriveAutoPushMp(){
  if(!cloudOn() || !gisAvailable() || typeof MP_SAVE_PREFIX==='undefined') return;
  clearTimeout(GD_mpPushTimer);
  GD_mpPushTimer = setTimeout(()=>{ gdrivePush({ interactive:false, pool:GD_mp() }); }, GD_DEBOUNCE_PUSH);   // background; push never shows the conflict overlay
}
// Lobby resume picker opened: pull the MP pool (safe — not in a running match) so cloud co-op campaigns
// materialize locally and appear in the picker, then (re)populate it. Non-interactive + throttled.
function gdriveOnMpResumeOpen(){
  const repop = ()=>{ if(typeof mpPopulateSavePick==='function') mpPopulateSavePick(); };
  if(!cloudOn() || !gisAvailable() || typeof MP_SAVE_PREFIX==='undefined'){ repop(); return; }
  if(nowMs() - GD_lastPullAt < GD_PULL_MIN_INTERVAL){ repop(); return; }
  GD_lastPullAt = nowMs();
  gdrivePull({ interactive:false, pool:GD_mp() }).then(repop, repop);
}

/* ---- per-row cloud-only actions (interactive button clicks) ---- */
async function gdriveRestoreOne(f){
  if(!(await gdAcquire(true))) return;
  if(typeof enforceCap==='function') enforceCap();
  const ok = await recreateSlot(f);
  if(typeof toast==='function') toast(ok ? 'Restored from cloud' : 'Could not restore that save');
  await driveList(); gdriveRefreshMenus();
}
async function gdriveRemoveOne(f){
  if(!(await gdAcquire(true))) return;
  try{ await driveDelete(f.id); GD_cloudIndex = GD_cloudIndex.filter(x=>x.id!==f.id); if(typeof toast==='function') toast('Removed from cloud'); }
  catch(_){ if(typeof toast==='function') toast('Could not remove from cloud'); }
  gdriveRefreshMenus();
}
// Append dimmed "in cloud only" rows to the Load list (called by buildLoadSlots in save.js).
function gdriveAppendCloudRows(wrap){
  if(!wrap || !cloudOn() || !gisAvailable() || !GD_cloudIndex.length) return;
  const localKeys = new Set(listSaves().map(s=>s.key));
  const cloudOnly = GD_cloudIndex.filter(f=>f.pool==='solo' && f.slKey && f.slKey!==AUTO_KEY && !localKeys.has(f.slKey)).sort((a,b)=>b.savedAt-a.savedAt);  // MP cloud-only saves surface in the lobby resume picker, not here
  if(!cloudOnly.length) return;
  const hdr=document.createElement('div'); hdr.className='panel-label'; hdr.textContent='In cloud only — restore to play on this device';
  wrap.appendChild(hdr);
  const fw = (typeof fmtWhen==='function') ? fmtWhen : (ms=>{ try{return new Date(ms).toLocaleString();}catch(_){return '';} });
  cloudOnly.forEach(f=>{
    const row=document.createElement('div'); row.className='save-row cloud-only';
    row.innerHTML='<div class="map-btn" style="opacity:.7"><b>☁ '+(f.mapName||'Quarter')+'</b>'
      + '<small>'+fw(f.savedAt)+' · in cloud</small></div>'
      + '<button class="tc-btn cloud-restore" title="Restore to this device">⬇</button>'
      + '<button class="tc-btn cloud-del" title="Remove from cloud">✕</button>';
    row.querySelector('.cloud-restore').onclick=()=>gdriveRestoreOne(f);
    row.querySelector('.cloud-del').onclick=()=>gdriveRemoveOne(f);
    wrap.appendChild(row);
  });
}

// Refresh every menu that reads localStorage saves, after a cloud op writes/removes a slot:
// the Load Game list (#loadSlots) AND the main-menu ▶ Continue button.
// Continue resumes the most-recent LOCAL save (autosave or manual) — so pulling a newer slot
// from another device must re-point Continue at it, not leave the stale local label.
function gdriveRefreshMenus(){
  if(typeof buildLoadSlots==='function') buildLoadSlots();
  if(typeof syncContinueButton==='function') syncContinueButton();
}

/* ---- status line + button UI in the Load menu (#cloudPanel) ---- */
function nowMs(){ return new Date().getTime(); }
function statusFor(e){ const k=e&&e.kind; if(k==='auth') return 'signin'; if(k==='network') return 'offline'; return 'fail'; }
function syncStatus(state, info){ GD_statusState=state; GD_statusInfo=info||null; if(state==='ok') GD_lastSyncAt=nowMs(); gdriveRenderStatus(); }
// Bracket the network work of a push/pull with enter/leave. GD_syncInflight (push+pull) drives the "☁ Syncing…"
// indicator. Only a PULL gates ▶ Continue (a pull can fast-forward the local autosave; a push never touches local
// saves), via GD_contLock — and the pull releases that lock (gdContUnlock) the moment its autosave slot is resolved,
// not when the whole pull finishes, so Continue re-enables without waiting on the background manual-slot downloads.
// A gating pull arms a hung-fetch watchdog; once inflight hits 0 it's dropped. gdriveRenderStatus() reads the counters.
function gdSyncEnter(isPull){
  GD_syncInflight++;
  if(isPull){               // ONLY a Continue-gating pull touches the lock + watchdog; a push must never reset the
    GD_contLock++;          // watchdog (else a routine push could un-stick the rescue and re-disable Continue while a
    GD_syncStuck=false; clearTimeout(GD_syncWatchdog);   // hung pull still holds the lock — see the watchdog rationale)
    GD_syncWatchdog=setTimeout(()=>{ GD_syncStuck=true; gdriveRenderStatus(); }, GD_SYNC_DISABLE_MAX);   // a hung socket can't trap Continue
  }
  syncStatus('syncing');
}
function gdContUnlock(){ GD_contLock=Math.max(0, GD_contLock-1); gdriveRenderStatus(); }   // pull's resume slot resolved → re-enable Continue
function gdSyncLeave(){
  GD_syncInflight=Math.max(0, GD_syncInflight-1);
  if(GD_syncInflight===0){ clearTimeout(GD_syncWatchdog); GD_syncStuck=false; }
  gdriveRenderStatus();
}
function gdriveRenderStatus(){
  const email = (window.GDRIVE && GDRIVE.currentEmail && GDRIVE.currentEmail()) || '';
  let txt;
  switch(GD_statusState){
    case 'syncing':  txt='Syncing…'; break;
    case 'ok':       txt='Synced ✓'+(email?' · '+email:'')+' · just now'; break;
    case 'conflict': txt='Cloud is newer — choose which to keep'; break;
    case 'signin':   txt='Sign in to sync saves across devices'; break;
    case 'offline':  txt='Offline — will sync when reconnected'; break;
    case 'fail':     txt='Sync failed — retry'; break;
    default:         txt = cloudOn() ? ('Cloud save on'+(email?' · '+email:'')) : 'Sign in to sync saves across devices';
  }
  const line=document.getElementById('cloudStatus'); if(line) line.textContent=txt;   // Load-menu status line (may be absent)
  // Start-screen mini-indicator: surface only the transient sync states, unobtrusive otherwise.
  const mini=document.getElementById('menuCloudStatus');
  if(mini){
    let m='';
    if(GD_syncInflight > 0)             m='☁ Syncing…';   // any sync in flight (survives an overlapping push's interim 'ok')
    else if(GD_statusState==='ok')      m='☁ Synced ✓';
    else if(GD_statusState==='offline') m='☁ Offline — will sync later';
    else if(GD_statusState==='fail')    m='☁ Sync failed';
    mini.textContent=m;
    mini.style.display = m ? '' : 'none';
  }
  // ▶ Continue while its resume slot is being fetched: pulse it, DISABLE it, and relabel it. A pull can re-point
  // Continue to a newer cloud autosave, so resuming the stale local save mid-fast-forward would load the wrong game —
  // block it until that autosave slot is resolved (GD_contLock, released early so background slots don't keep it
  // disabled). GD_syncStuck (watchdog) re-enables it if a sync hangs.
  const cont=document.getElementById('btn-continue');
  if(cont){
    const syncing = GD_contLock > 0 && !GD_syncStuck;
    if(GD_DBG && cont.disabled !== syncing) gdlog('▶ Continue '+(syncing?'DISABLED':'ENABLED')+'  (contLock='+GD_contLock+', stuck='+GD_syncStuck+')', '\n    caller:', gdCaller());
    cont.classList.toggle('syncing', syncing);
    cont.disabled = syncing;
    cont.setAttribute('aria-busy', syncing ? 'true' : 'false');
    // Swap only the leading text node ("▶ Continue"); the episode/elapsed <small> sub-label is a separate child
    // that syncContinueButton() owns, so we leave it intact. Stash the original label to restore it verbatim.
    const lead = cont.firstChild;
    if(lead && lead.nodeType===3){
      if(syncing){
        if(cont.dataset.contLabel==null) cont.dataset.contLabel = lead.nodeValue;
        lead.nodeValue = '☁ Syncing saves…';
      } else if(cont.dataset.contLabel!=null){
        lead.nodeValue = cont.dataset.contLabel;
        delete cont.dataset.contLabel;
      }
    }
  }
}
function gdriveRefreshUI(){
  const panel=document.getElementById('cloudPanel'); if(!panel) return;
  const acts=document.getElementById('cloudActions');
  // Inert (no Client ID) → no cloud UI at all. Configured-but-unavailable (file:// / GIS blocked) → a note.
  if(!window.GDRIVE){ panel.style.display='none'; return; }
  if(GDRIVE.unavailable){
    if(GDRIVE._reason && GDRIVE._reason!=='disabled'){
      panel.style.display=''; if(acts) acts.innerHTML='';
      const line=document.getElementById('cloudStatus'); if(line) line.textContent='Cloud save needs the game served over http(s).';
    } else { panel.style.display='none'; }
    return;
  }
  panel.style.display='';
  gdriveRenderStatus();
  if(!acts) return;
  acts.innerHTML='';
  const add=(label, fn)=>{ const b=document.createElement('button'); b.className='sc-btn'; b.textContent=label; b.onclick=fn; acts.appendChild(b); };
  if(!cloudOn()){ add('☁ Connect cloud saves', gdriveConnect); }
  else { add('☁ Sync now', gdriveSyncNow); add('☁ Restore from cloud', gdriveRestore); add('Disconnect', gdriveDisconnect); }
}
// Keep the UI live when auth state changes outside the Load menu.
try{
  window.addEventListener('gdrive:token', ()=>gdriveRefreshUI());
  window.addEventListener('gdrive:signout', ()=>gdriveRefreshUI());
}catch(_){}

/* ---- New Campaign cloud-login check (#cloudNudge). Returns true if it intercepted (caller returns). ---- */
function cloudCampaignGate(onProceed){
  onProceed = onProceed || function(){};
  if(typeof gisAvailable!=='function' || !gisAvailable()) return false;     // inert → don't intercept
  if(cloudDeclined()) return false;                                         // player already chose "Don't sync" → don't nag
  const email = (window.GDRIVE && GDRIVE.currentEmail && GDRIVE.currentEmail()) || '';
  if(window.GDRIVE && GDRIVE.hasValidToken && GDRIVE.hasValidToken()){       // already signed in → proceed
    if(typeof toast==='function') toast('Cloud save on'+(email?' · '+email:''));
    return false;
  }
  if(cloudOn()){                                                            // opted in but token lapsed → proceed
    if(typeof toast==='function') toast('Saves sync to'+(email?' '+email:' your Google account')+' — sign in again to resume', GD_TOAST_MS);
    return false;
  }
  if(cloudNudgeSeen()) return false;                                        // already shown once → don't nag
  const el=document.getElementById('cloudNudge'); if(!el) return false;     // fail open
  el.className='overlay submenu';
  el.innerHTML='<div class="submenu-panel"><div class="big">☁</div>'
    + '<h2>Your saves stay on this device</h2>'
    + '<div class="panel-label">STARLEFT can sync this campaign across devices using your Google account.</div>'
    + '<p style="max-width:46ch;margin:.6em auto;opacity:.9">Saves are shared <b>only through your Google login</b> — sign in with the same Google account on each device to see them everywhere. Without it, this campaign is saved on this device only.</p>'
    + '<div class="submenu-actions">'
    + '<button class="sc-btn" id="cnConnect">☁ Connect Google</button>'
    + '<button class="sc-btn back" id="cnSkip">Continue without cloud</button>'
    + '</div></div>';
  el.style.display='flex';
  const close=()=>{ el.style.display='none'; el.innerHTML=''; };
  const connect=document.getElementById('cnConnect');
  const skip=document.getElementById('cnSkip');
  if(connect) connect.onclick=()=>{ setCloudNudgeSeen(); close(); gdriveConnect(); onProceed(); };
  if(skip) skip.onclick=()=>{ setCloudNudgeSeen(); close(); onProceed(); };
  return true;
}
