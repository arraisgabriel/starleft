/* js/net/mp-debug.js — CLASSIC. A toggleable, black, monospace MP DEBUG log panel (lobby + in-game) plus the
   logger the rest of the net layer writes to. LOCAL-only: each peer shows its own messages. Loaded early so
   NET.mpLog exists before any handler fires; all call sites use the guarded `NET.mpLog && NET.mpLog(...)`.
   Reuses the lobby's panel/button look (css/mp.css .mp-dbg-*). Toggle from the lobby header 🐞 button and the
   in-game top-right menu; the panel is a fixed overlay so it stays usable during a match (where desyncs surface). */
(function(){
  const NET = (window.NET = window.NET || {});
  const CAP = 300;
  NET._dbgLog = NET._dbgLog || [];     // ring buffer of { t, level, msg, role }
  NET._dbgOpen = false;

  function pnow(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
  function role(){
    if(typeof netRole==='undefined' || netRole==='solo') return 'solo';
    if(netRole==='host') return 'host';
    return (typeof LOCAL_CTRL!=='undefined' && LOCAL_CTRL) ? LOCAL_CTRL : 'guest';   // client → its ctrl (p2/p3)
  }
  function fmtTime(ms){ const s=Math.floor(ms/1000);
    return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+'.'+String(Math.floor(ms%1000)).padStart(3,'0'); }
  function line(e){ return fmtTime(e.t)+' ['+e.role+'] '+(e.level==='err'?'ERROR ':e.level==='warn'?'WARN ':'')+e.msg; }

  // ---- the logger every net file calls ----
  NET.mpLog = function(level, msg){
    if(msg===undefined){ msg = level; level = 'info'; }          // allow NET.mpLog('text')
    const e = { t: pnow(), level: (level||'info'), msg: String(msg), role: role() };
    NET._dbgLog.push(e);
    if(NET._dbgLog.length > CAP) NET._dbgLog.splice(0, NET._dbgLog.length - CAP);
    const c = (e.level==='err') ? 'error' : (e.level==='warn') ? 'warn' : 'log';
    try{ console[c]('[mp] '+line(e)); }catch(_){}
    if(NET._dbgOpen) appendRow(e);
  };
  window.mpDbg = function(msg, lvl){ NET.mpLog(lvl||'info', msg); };   // convenience

  NET.mpDbgText = function(){ return NET._dbgLog.map(line).join('\n'); };
  NET.mpDbgClear = function(){ NET._dbgLog.length = 0; const log = document.getElementById('mp-dbg-log'); if(log) log.innerHTML=''; };

  // ---- panel rendering ----
  function appendRow(e){
    const log = document.getElementById('mp-dbg-log'); if(!log) return;
    const atBottom = (log.scrollTop + log.clientHeight) >= (log.scrollHeight - 28);   // only autoscroll if the user is at the bottom
    const row = document.createElement('div'); row.className = 'mp-dbg-row mp-dbg-'+e.level;
    const t = document.createElement('span'); t.className='mp-dbg-t'; t.textContent = fmtTime(e.t)+' ';
    const r = document.createElement('span'); r.className='mp-dbg-r'; r.textContent = '['+e.role+'] ';
    row.appendChild(t); row.appendChild(r); row.appendChild(document.createTextNode(e.msg));
    log.appendChild(row);
    while(log.childNodes.length > CAP) log.removeChild(log.firstChild);
    if(atBottom) log.scrollTop = log.scrollHeight;
  }
  function render(){
    const log = document.getElementById('mp-dbg-log'); if(!log) return;
    log.innerHTML = '';
    for(const e of NET._dbgLog) appendRow(e);
    log.scrollTop = log.scrollHeight;
  }

  // ---- toggle (lobby 🐞 button + in-game menu item both call this) ----
  window.mpUiToggleDebug = function(force){
    const p = document.getElementById('mp-dbg-panel'); if(!p) return;
    const open = (typeof force==='boolean') ? force : (p.style.display==='none' || !p.style.display);
    p.style.display = open ? 'flex' : 'none';
    NET._dbgOpen = open;
    if(open) render();
    const btn = document.getElementById('mp-dbg-toggle'); if(btn) btn.classList.toggle('on', open);
    // close the in-game top menu if it was open
    const tm = document.getElementById('topmenu-panel'); if(open && tm && tm.style.display==='flex'){ tm.style.display='none'; }
  };

  window.mpDbgCopy = function(){
    const text = NET.mpDbgText();
    const done = ()=>{ if(typeof toast==='function') toast('📋 MP debug log copied'); };
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done).catch(fallback); } else fallback(); }
    catch(_){ fallback(); }
    function fallback(){ try{ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }catch(_){ if(typeof toast==='function') toast('Copy failed — select the panel text manually'); } }
  };

  NET.mpLog('info', 'debug log ready');
})();
