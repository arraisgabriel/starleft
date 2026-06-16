/* js/net/gdrive-sync.js — CLASSIC. Google Drive appDataFolder save-sync: REST CRUD, push/pull/merge,
   conflict resolution, the "seamless" sync triggers, the Load-menu status UI, and the New-Campaign
   cloud-login nudge. Sits on top of window.GDRIVE (js/net/gdrive-auth.js) for the bearer token, and on
   the public save.js API (saveRawJson/saveWrite/listSaves/isSaveBlob/saveVersionOk/enforceCap/AUTO_KEY/
   SAVE_PREFIX/MANUAL_CAP). Covers SOLO + H.U.B. saves only (co-op is never written to localStorage).
   NEVER changes the save format or its back-compat contract — it only reads/writes whole slots.

   Data model: ONE Drive file per local slot in appDataFolder. media body = the PLAIN JSON from
   saveRawJson(key) (byte-identical to exportSave, portable); appProperties carry a cheap-to-list index.
   Matching is ALWAYS by appProperties.slKey, never filename/id. ≤13 files (12 manual + 1 autosave). */

/* ---- config ---- */
const GD_API   = 'https://www.googleapis.com/drive/v3/files';
const GD_UP    = 'https://www.googleapis.com/upload/drive/v3/files';
const GD_FIELDS= 'id,name,appProperties,modifiedTime';
const GD_DEBOUNCE_PUSH = 8000;     // coalesce a burst of saves into ~1 push (manual saves collapse at 3s; autosave is 60s)
const GD_DEBOUNCE_PULL = 5000;     // settle focus/menu events before pulling
const GD_PULL_MIN_INTERVAL = 30000;// never pull more than once / 30s (alt-tab must not hammer Drive)

/* ---- module state (bare globals, per the project's classic-scope convention) ---- */
let GD_tok = null;                 // bearer for the in-flight push/pull batch (refreshed by driveFetch on 401)
let GD_cloudIndex = [];            // last listed cloud index: [{id,name,slKey,savedAt,mapName,mapIndex,hub,auto,modifiedTime}]
let GD_pushTimer = null, GD_pullTimer = null, GD_lastPullAt = 0, GD_lastSyncAt = 0;
let GD_statusState = '', GD_statusInfo = null;

const GD_sleep = ms => new Promise(r => setTimeout(r, ms));
function cloudOn(){ try{ return localStorage.getItem('starleft_cloud_on')==='1'; }catch(_){ return false; } }
function setCloudOn(v){ try{ v ? localStorage.setItem('starleft_cloud_on','1') : localStorage.removeItem('starleft_cloud_on'); }catch(_){} }
function cloudNudgeSeen(){ try{ return localStorage.getItem('starleft_cloud_nudge_seen')==='1'; }catch(_){ return false; } }
function setCloudNudgeSeen(){ try{ localStorage.setItem('starleft_cloud_nudge_seen','1'); }catch(_){} }

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

// multipart/related upload (create=POST, update=PATCH). metadata part + plain-JSON media part.
async function driveMultipart(method, url, metadata, mediaJson){
  const boundary = 'starleft_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const body =
    '--'+boundary+'\r\n'+
    'Content-Type: application/json; charset=UTF-8\r\n\r\n'+ JSON.stringify(metadata) +'\r\n'+
    '--'+boundary+'\r\n'+
    'Content-Type: application/json\r\n\r\n'+ mediaJson +'\r\n'+
    '--'+boundary+'--';
  const res = await driveFetch(url, { method, headers:{ 'Content-Type':'multipart/related; boundary='+boundary }, body });
  return res.json();
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
      if(ap.app && ap.app!=='starleft') return;          // ignore anything not ours (appDataFolder is per-app anyway)
      if(!ap.slKey) return;
      out.push({ id:f.id, name:f.name, slKey:ap.slKey, savedAt:+ap.savedAt||0,
                 mapName:ap.mapName||'', mapIndex:+ap.mapIndex||0, hub:ap.hub==='1', auto:ap.auto==='1',
                 modifiedTime:f.modifiedTime });
    });
    pageToken = j.nextPageToken || '';
  } while(pageToken);
  GD_cloudIndex = out;
  return out;
}
function slotMeta(s){
  return { app:'starleft', slKey:s.key, savedAt:String(s.savedAt||0),
           mapName:(s.mapName||'').slice(0,100), mapIndex:String(s.mapIndex||0),
           hub:s.hub?'1':'0', auto:s.auto?'1':'0' };
}
function slotFileName(s){
  const slug = (typeof saveSlug==='function') ? saveSlug(s.mapName||'save') : 'save';
  return s.auto ? 'starleft-autosave.json' : ('starleft-'+slug+'-'+String(s.savedAt||0).slice(-6)+'.json');
}
async function driveCreate(s, json){
  return driveMultipart('POST', GD_UP+'?uploadType=multipart&fields='+GD_FIELDS,
    Object.assign({ name:slotFileName(s), parents:['appDataFolder'] }, { appProperties:slotMeta(s) }), json);
}
async function driveUpdate(id, s, json){
  return driveMultipart('PATCH', GD_UP+'/'+id+'?uploadType=multipart&fields='+GD_FIELDS,
    { name:slotFileName(s), appProperties:slotMeta(s) }, json);   // PATCH must NOT include parents
}
async function driveDownload(id){
  const res = await driveFetch(GD_API+'/'+id+'?alt=media', { method:'GET' });
  return res.text();
}
async function driveDelete(id){
  await driveFetch(GD_API+'/'+id, { method:'DELETE' });
}

/* ---- token gate for a push/pull batch ---- */
async function gdAcquire(interactive){
  let t=null; try{ t = await GDRIVE.getToken({ interactive:!!interactive }); }catch(_){ t=null; }
  if(!t){ syncStatus('signin'); return false; }
  GD_tok = t; return true;
}

/* ---- PUSH (local → cloud) ---- */
async function gdrivePush(opts){
  opts = opts || {};
  if(!gisAvailable()) return { ok:false, reason:'unavailable' };
  if(!(await gdAcquire(opts.interactive))) return { ok:false, reason:'noauth' };
  syncStatus('syncing');
  try{
    const cloud = await driveList();
    const byKey = new Map(cloud.map(f=>[f.slKey, f]));
    const conflicts = []; let pushed=0, skipped=0;
    for(const s of listSaves()){
      let json; try{ json = saveRawJson(s.key); }catch(_){ json=null; }
      if(!json) continue;
      const remote = byKey.get(s.key);
      try{
        if(!remote){ await driveCreate(s, json); pushed++; }
        else if(s.savedAt > remote.savedAt){ await driveUpdate(remote.id, s, json); pushed++; }
        else if(s.savedAt < remote.savedAt){ conflicts.push({ slKey:s.key, id:remote.id, local:s.savedAt, cloud:remote.savedAt, mapName:remote.mapName, auto:remote.auto }); skipped++; }
        else skipped++;                                   // equal savedAt → identical, no-op
      }catch(e){ /* per-slot failure must not abort the batch */ skipped++; }
    }
    await driveList();                                    // refresh the cached index after writes
    GD_lastSyncAt = nowMs();
    syncStatus(conflicts.length ? 'conflict' : 'ok', { pushed, skipped, conflicts });
    return { ok:true, pushed, skipped, conflicts };
  }catch(e){ syncStatus(statusFor(e)); return { ok:false, reason:'error', err:e }; }
}

/* ---- PULL (cloud → local) + reconcile/merge ---- */
async function gdrivePull(opts){
  opts = opts || {};
  if(!gisAvailable()) return { ok:false, reason:'unavailable' };
  if(!(await gdAcquire(opts.interactive))) return { ok:false, reason:'noauth' };
  syncStatus('syncing');
  try{
    const cloud = await driveList();
    const localByKey = new Map(listSaves().map(s=>[s.key, s]));
    const recreate = [], conflicts = [];
    for(const f of cloud){
      const local = localByKey.get(f.slKey);
      if(!local) recreate.push(f);
      else if(f.savedAt > local.savedAt) conflicts.push({ slKey:f.slKey, id:f.id, local:local.savedAt, cloud:f.savedAt, mapName:f.mapName, auto:f.auto });
      // f.savedAt <= local → local newer-or-equal; pull does nothing (push will carry it up)
    }
    await reconcileAndRecreate(recreate);
    if(typeof buildLoadSlots==='function') buildLoadSlots();
    GD_lastSyncAt = nowMs();
    if(conflicts.length){ syncStatus('conflict', { conflicts }); showCloudConflict(conflicts); }
    else syncStatus('ok');
    return { ok:true, recreated:recreate.length, conflicts };
  }catch(e){ syncStatus(statusFor(e)); return { ok:false, reason:'error', err:e }; }
}

// Download a cloud file and write it locally under its OWN slKey, PRESERVING savedAt (the deliberate
// deviation from importSaveFile, which re-stamps — preserving keeps last-write-wins coherent + pull idempotent).
async function recreateSlot(f){
  let json; try{ json = await driveDownload(f.id); }catch(_){ return false; }
  let d=null; try{ d=JSON.parse(json); }catch(_){ return false; }
  if(!isSaveBlob(d) || !saveVersionOk(d)) return false;
  try{ saveWrite(f.slKey, d); }catch(_){ return false; }
  return true;
}

// Recreate cloud-missing slots while respecting MANUAL_CAP: the newest-by-savedAt 12 manual slots win.
async function reconcileAndRecreate(cloudMissing){
  const cloudAuto   = cloudMissing.filter(f=>f.slKey===AUTO_KEY);
  const cloudManual = cloudMissing.filter(f=>f.slKey!==AUTO_KEY);
  for(const f of cloudAuto) await recreateSlot(f);       // the shared, capped-at-1 autosave slot

  const localManual = listSaves().filter(s=>!s.auto);
  const merged = localManual.map(s=>({ slKey:s.key, savedAt:s.savedAt, local:true }))
    .concat(cloudManual.map(f=>({ slKey:f.slKey, savedAt:f.savedAt, file:f, local:false })))
    .sort((a,b)=> b.savedAt - a.savedAt);                // newest first
  const keep = merged.slice(0, MANUAL_CAP);
  const dropped = merged.length - keep.length;
  for(const m of keep){
    if(!m.local){ if(typeof enforceCap==='function') enforceCap(); await recreateSlot(m.file); }
  }
  if(dropped>0 && typeof toast==='function')
    toast('Cloud has '+dropped+' more save'+(dropped===1?'':'s')+' than this device holds ('+MANUAL_CAP+' max). Newest kept; the rest stay backed up in the cloud.');
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
    if(typeof buildLoadSlots==='function') buildLoadSlots();
  };
  conflicts.forEach((c,i)=>{
    const keepBtn=document.getElementById('ccKeep'+i), cloudBtn=document.getElementById('ccCloud'+i);
    if(keepBtn) keepBtn.onclick=()=>{ keepBtn.disabled=true; if(cloudBtn) cloudBtn.disabled=true; };   // keep local: nothing destructive
    if(cloudBtn) cloudBtn.onclick=async ()=>{ await useCloud(c); cloudBtn.disabled=true; if(keepBtn) keepBtn.disabled=true; };
  });
  const all=document.getElementById('ccCloudAll'); if(all) all.onclick=async ()=>{ for(const c of conflicts) await useCloud(c); close(); };
  const done=document.getElementById('ccDone'); if(done) done.onclick=()=>{ if(typeof buildLoadSlots==='function') buildLoadSlots(); close(); };
}

/* ---- sync triggers ---- */
function gdriveConnect(){
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
// Proceed with the merge: pull (cloud→local, additive/prompt) then push (local→cloud).
function gdriveDoConnect(){
  setCloudOn(true);
  (async ()=>{ await gdrivePull({ interactive:true }); await gdrivePush({ interactive:true }); gdriveRefreshUI(); })();
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
function gdriveSyncNow(){ whenGsi(async ()=>{ if(!gisAvailable()) return; await gdrivePull({ interactive:true }); await gdrivePush({ interactive:true }); gdriveRefreshUI(); }); }
function gdriveRestore(){ whenGsi(async ()=>{ if(!gisAvailable()) return; await gdrivePull({ interactive:true }); gdriveRefreshUI(); }); }
function gdriveDisconnect(){ if(window.GDRIVE && GDRIVE.signOut) GDRIVE.signOut(); setCloudOn(false); GD_cloudIndex=[]; if(typeof buildLoadSlots==='function') buildLoadSlots(); gdriveRefreshUI(); }

// Auto-push after a successful save/autosave — debounced, NEVER interactive (can't pop a window).
function gdriveAutoPush(){
  if(!cloudOn() || !gisAvailable()) return;
  clearTimeout(GD_pushTimer);
  GD_pushTimer = setTimeout(()=>{ gdrivePush({ interactive:false }); }, GD_DEBOUNCE_PUSH);
}
// Auto-pull on focus / Load-menu open — debounced + throttled, NEVER interactive.
function gdriveAutoPull(){
  if(!cloudOn() || !gisAvailable()) return;
  if(nowMs() - GD_lastPullAt < GD_PULL_MIN_INTERVAL) return;
  clearTimeout(GD_pullTimer);
  GD_pullTimer = setTimeout(()=>{ GD_lastPullAt = nowMs(); gdrivePull({ interactive:false }); }, GD_DEBOUNCE_PULL);
}
// Called from openLoadMenu(): refresh the cloud UI, then opportunistically pull.
function gdriveOnLoadMenuOpen(){ gdriveRefreshUI(); gdriveAutoPull(); }

/* ---- per-row cloud-only actions (interactive button clicks) ---- */
async function gdriveRestoreOne(f){
  if(!(await gdAcquire(true))) return;
  if(typeof enforceCap==='function') enforceCap();
  const ok = await recreateSlot(f);
  if(typeof toast==='function') toast(ok ? 'Restored from cloud' : 'Could not restore that save');
  await driveList(); if(typeof buildLoadSlots==='function') buildLoadSlots();
}
async function gdriveRemoveOne(f){
  if(!(await gdAcquire(true))) return;
  try{ await driveDelete(f.id); GD_cloudIndex = GD_cloudIndex.filter(x=>x.id!==f.id); if(typeof toast==='function') toast('Removed from cloud'); }
  catch(_){ if(typeof toast==='function') toast('Could not remove from cloud'); }
  if(typeof buildLoadSlots==='function') buildLoadSlots();
}
// Append dimmed "in cloud only" rows to the Load list (called by buildLoadSlots in save.js).
function gdriveAppendCloudRows(wrap){
  if(!wrap || !cloudOn() || !gisAvailable() || !GD_cloudIndex.length) return;
  const localKeys = new Set(listSaves().map(s=>s.key));
  const cloudOnly = GD_cloudIndex.filter(f=>f.slKey && f.slKey!==AUTO_KEY && !localKeys.has(f.slKey)).sort((a,b)=>b.savedAt-a.savedAt);
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

/* ---- status line + button UI in the Load menu (#cloudPanel) ---- */
function nowMs(){ return new Date().getTime(); }
function statusFor(e){ const k=e&&e.kind; if(k==='auth') return 'signin'; if(k==='network') return 'offline'; return 'fail'; }
function syncStatus(state, info){ GD_statusState=state; GD_statusInfo=info||null; if(state==='ok') GD_lastSyncAt=nowMs(); gdriveRenderStatus(); }
function gdriveRenderStatus(){
  const line=document.getElementById('cloudStatus'); if(!line) return;
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
  line.textContent=txt;
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
  const email = (window.GDRIVE && GDRIVE.currentEmail && GDRIVE.currentEmail()) || '';
  if(window.GDRIVE && GDRIVE.hasValidToken && GDRIVE.hasValidToken()){       // already signed in → proceed
    if(typeof toast==='function') toast('Cloud save on'+(email?' · '+email:''));
    return false;
  }
  if(cloudOn()){                                                            // opted in but token lapsed → proceed
    if(typeof toast==='function') toast('Saves sync to'+(email?' '+email:' your Google account')+' — sign in again to resume');
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
