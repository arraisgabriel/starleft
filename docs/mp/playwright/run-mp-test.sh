#!/usr/bin/env bash
# ============================================================================
# STARLEFT — complete multiplayer test via playwright-cli
#
# Three tiers (see docs/mp/playwright/report.md for a sample run):
#   Tier 1  In-process rollback correctness (single page, no network):
#           NET.determinismTest / determinismSweep / rbRoundTripTest /
#           rbLocalTest / rbLocalCmdTest  -> assert PASS strings, zero FAIL/DESYNC.
#   Tier 2  Lobby + MP debug-panel UI (single page, no peer):
#           open lobby, create room, toggle panel, Copy/Clear/Close, screenshot.
#   Tier 3  Live two-window rollback co-op (host <-> client), connectivity-gated:
#           handshake -> start -> no-DESYNC -> live command convergence ->
#           induced disconnect surfaced in the survivor's log.  (rollback path)
#
# Drives the game's real DOM IDs, globals, harness functions, and the
# NET._dbgLog buffer only — it makes NO game-code changes.
#
# Usage:   bash docs/mp/playwright/run-mp-test.sh
# Requires: playwright-cli (global), python3 (auto-starts the static server),
#           and — for Tier 3 — outbound reach to public Nostr relays (signaling).
# Exit code: non-zero if any HARD assertion fails. A Tier-3 connectivity SKIP
#            is a warning, not a failure (Tiers 1-2 still gate the build).
# ============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"   # repo root
OUT="$ROOT/docs/mp/playwright"
SHOTS="$OUT/screenshots"
URL="http://localhost:8000/rts.html"
mkdir -p "$SHOTS"

PASS=0; FAIL=0; SKIP=0
declare -a LINES                      # report rows: "STATUS|tier|label"
red(){ printf '\033[31m%s\033[0m\n' "$*"; }; grn(){ printf '\033[32m%s\033[0m\n' "$*"; }
ok(){   PASS=$((PASS+1)); LINES+=("PASS|$1|$2"); grn "  ✓ [$1] $2"; }
bad(){  FAIL=$((FAIL+1)); LINES+=("FAIL|$1|$2"); red "  ✗ [$1] $2"; }
skip(){ SKIP=$((SKIP+1)); LINES+=("SKIP|$1|$2"); echo  "  ~ [$1] $2"; }
# check LABEL TIER ACTUAL EXPECTED
check(){ if [ "$3" = "$4" ]; then ok "$2" "$1"; else bad "$2" "$1 (got '$3' want '$4')"; fi; }

# ---- playwright-cli helpers (bash word-splits; zsh would not) ----
ev(){  playwright-cli -s="$1" --raw eval "$2" 2>/dev/null | sed 's/^"//; s/"$//'; }   # value, quotes stripped
evq(){ playwright-cli -s="$1" eval "$2" >/dev/null 2>&1; }                            # side-effect, quiet
txt(){ playwright-cli -s="$1" --raw eval "$2" 2>/dev/null | sed 's/^"//; s/"$//; s/\\n/\n/g'; }  # multiline string
poll(){ # session  js-bool-expr  timeout_s   -> 0 if becomes true
  local s="$1" e="$2" n="$3" i; for ((i=1;i<=n;i++)); do [ "$(ev "$s" "$e")" = "true" ] && return 0; sleep 1; done; return 1; }
ready(){ poll "$1" "(!!window.__MP_READY && !!window.RB && typeof newMap==='function' && typeof NET!=='undefined')" 20; }
gate(){  evq "$1" "(function(){var b=document.getElementById('btn-simulate'); if(b)b.click(); return !!b;})()"; }  # dismiss boot gate
shim(){  evq "$1" "(function(){ if(window.__cap)return; window.__cap=[]; ['log','warn','error'].forEach(function(m){ var o=console[m]; console[m]=function(){ try{window.__cap.push(Array.prototype.join.call(arguments,' '))}catch(e){}; o.apply(console,arguments); }; }); })()"; }
hascap(){ ev "$1" "window.__cap.some(function(s){return s.indexOf('$2')>=0;})"; }     # capture buffer contains substring?
pollcap(){ local s="$1" sub="$2" n="$3" i; for ((i=1;i<=n;i++)); do [ "$(hascap "$s" "$sub")" = "true" ] && return 0; sleep 1; done; return 1; }  # poll until __cap holds substring

# ---- preflight: server + (for Tier 3) relay reachability ---------------------
echo "== preflight =="
if ! curl -s -o /dev/null -m 3 "$URL"; then
  echo "  starting static server (python3 -m http.server 8000)"; ( cd "$ROOT" && python3 -m http.server 8000 >/tmp/starleft-http.log 2>&1 & ); sleep 1.5
fi
curl -s -o /dev/null -m 3 "$URL" && grn "  server up" || { red "  server unreachable at $URL"; exit 2; }
RELAY_OK=false
curl -s -o /dev/null -m 6 https://relay.damus.io && RELAY_OK=true
echo "  nostr relay reachable: $RELAY_OK  (Tier 3 needs this for signaling)"
playwright-cli close-all >/dev/null 2>&1 || true

# ============================================================================
# TIER 1 — in-process rollback correctness (single page, no network)
# ============================================================================
tier1(){
  echo "== Tier 1: in-process rollback correctness =="
  playwright-cli -s=t1 open "$URL" >/dev/null 2>&1
  ready t1 || { bad T1 "page/RB never became ready"; return; }
  shim t1
  # synchronous harnesses return a boolean AND log a PASS/FAIL string
  check "determinismTest returns true"  T1 "$(ev t1 'NET.determinismTest(0,900,12345)')"          true
  check "determinismSweep returns true" T1 "$(ev t1 'NET.determinismSweep([0,1,2],[1,12345,999999])')" true
  check "rbRoundTripTest returns true"  T1 "$(ev t1 'NET.rbRoundTripTest(0,600,600,12345)')"       true
  # async harnesses (resolve via whenRB) — kick off, then poll the capture buffer
  evq t1 'NET.rbLocalTest(0,600,12345)'
  if pollcap t1 "[rb] LOCAL PASS" 30; then ok T1 "rbLocalTest -> [rb] LOCAL PASS"; else bad T1 "rbLocalTest did not reach LOCAL PASS"; fi
  evq t1 'NET.rbLocalCmdTest(0,600,12345)'
  if pollcap t1 "[rb] CMD PASS" 30; then ok T1 "rbLocalCmdTest -> [rb] CMD PASS (input model + rollback)"; else bad T1 "rbLocalCmdTest did not reach CMD PASS"; fi
  # hard gate: nothing FAILed or DESYNCed anywhere in the captured console
  check "no FAIL/DESYNC in captured console" T1 "$(ev t1 'window.__cap.some(function(s){return /FAIL|DESYNC/.test(s);})')" false
  # persist the cleaned harness lines for the report
  txt t1 "window.__cap.filter(function(s){return /\[det\]|\[rb\]/.test(s);}).map(function(s){return s.replace(/%c/g,'').replace(/color:[^ ]+;?(font-weight:bold)?/g,'').replace(/  +/g,' ').trim();}).join(String.fromCharCode(10))" > /tmp/mp-tier1.txt
  playwright-cli -s=t1 close >/dev/null 2>&1
}

# ============================================================================
# TIER 2 — lobby + MP debug-panel UI (single page, no peer)
# ============================================================================
tier2(){
  echo "== Tier 2: lobby + debug-panel UI =="
  playwright-cli -s=t2 open "$URL" >/dev/null 2>&1
  ready t2 || { bad T2 "page never became ready"; return; }
  gate t2; sleep 1
  playwright-cli -s=t2 fill "#mp-handle" "SOLO-UI" >/dev/null 2>&1
  playwright-cli -s=t2 click "#btn-mp" >/dev/null 2>&1; sleep 1
  check "MP lobby (#mpScreen) opens" T2 "$(ev t2 "getComputedStyle(document.getElementById('mpScreen')).display")" flex
  playwright-cli -s=t2 click "#mp-create" >/dev/null 2>&1; sleep 2
  check "room screen (#mpRoomScreen) shows" T2 "$(ev t2 "getComputedStyle(document.getElementById('mpRoomScreen')).display")" flex
  local domc sesc
  domc="$(ev t2 "document.getElementById('mp-room-code').textContent.trim()")"
  sesc="$(ev t2 "window.MP_SESSION.code")"
  check "room code: DOM == MP_SESSION.code" T2 "$domc" "$sesc"
  check "room code matches A-B-NN pattern" T2 "$(ev t2 "/^\w+-\w+-\d+$/.test(window.MP_SESSION.code||'')")" true
  # debug panel
  playwright-cli -s=t2 click "#mp-dbg-toggle" >/dev/null 2>&1; sleep 1
  check "debug panel opens (flex)"      T2 "$(ev t2 "getComputedStyle(document.getElementById('mp-dbg-panel')).display")" flex
  check "toggle chip highlights (.on)"  T2 "$(ev t2 "document.getElementById('mp-dbg-toggle').classList.contains('on')")" true
  check "an OK-level 'room created' row" T2 "$(ev t2 "window.NET._dbgLog.some(function(e){return e.level==='ok'&&e.msg.indexOf('room created')>=0;})")" true
  check "DOM has a .mp-dbg-row.mp-dbg-ok" T2 "$(ev t2 "!!document.querySelector('#mp-dbg-log .mp-dbg-row.mp-dbg-ok')")" true
  check "row text is 'mm:ss.mmm [role] …'" T2 "$(ev t2 "/^\d\d:\d\d\.\d\d\d \[/.test(NET.mpDbgText().split(String.fromCharCode(10))[0])")" true
  playwright-cli -s=t2 screenshot --filename="$SHOTS/lobby-debug.png" >/dev/null 2>&1
  [ -s "$SHOTS/lobby-debug.png" ] && ok T2 "lobby-debug.png captured" || bad T2 "lobby screenshot missing"
  # Copy / Clear / Close
  check "Copy source text well-formed"  T2 "$(ev t2 "(function(){var t=NET.mpDbgText();return t.length>0&&t.indexOf(String.fromCharCode(10))>=0;})()")" true
  evq t2 'NET.mpDbgClear()'; sleep 1
  check "Clear empties the DOM list"    T2 "$(ev t2 "document.getElementById('mp-dbg-log').childElementCount")" 0
  check "Clear empties the buffer"      T2 "$(ev t2 "window.NET._dbgLog.length")" 0
  evq t2 'mpUiToggleDebug(false)'; sleep 1
  check "Close hides the panel"         T2 "$(ev t2 "getComputedStyle(document.getElementById('mp-dbg-panel')).display")" none
  playwright-cli -s=t2 close >/dev/null 2>&1
}

# ============================================================================
# TIER 3 — live two-window rollback co-op (host <-> client)
# ============================================================================
tier3(){
  echo "== Tier 3: live rollback co-op (host <-> client) =="
  if [ "$RELAY_OK" != true ]; then skip T3 "no relay reach — live P2P signaling unavailable"; return; fi
  playwright-cli -s=host   open "$URL" >/dev/null 2>&1
  playwright-cli -s=client open "$URL" >/dev/null 2>&1
  ready host && ready client || { bad T3 "a peer page never became ready"; return; }
  # enable rollback on BOTH (each in its own eval — multi-statement evals truncate),
  # install capture shims, dismiss boot gates
  evq host   'window.USE_ROLLBACK = true'; evq client 'window.USE_ROLLBACK = true'
  shim host; shim client; gate host; gate client; sleep 1
  check "USE_ROLLBACK set on host"   T3 "$(ev host   'window.USE_ROLLBACK')" true
  check "USE_ROLLBACK set on client" T3 "$(ev client 'window.USE_ROLLBACK')" true
  check "host/client are distinct peers" T3 "$([ "$(ev host 'window.MP.selfId')" != "$(ev client 'window.MP.selfId')" ] && echo diff)" diff
  # lobby -> host creates -> client joins
  playwright-cli -s=host   click "#btn-mp" >/dev/null 2>&1
  playwright-cli -s=client click "#btn-mp" >/dev/null 2>&1; sleep 1
  playwright-cli -s=host   fill "#mp-handle" "HOST" >/dev/null 2>&1
  playwright-cli -s=client fill "#mp-handle" "ALLY" >/dev/null 2>&1
  playwright-cli -s=host click "#mp-create" >/dev/null 2>&1; sleep 2
  local CODE; CODE="$(ev host 'window.MP_SESSION.code')"
  [ -n "$CODE" ] && [ "$CODE" != null ] && ok T3 "host room created ($CODE)" || { bad T3 "host failed to create a room"; return; }
  playwright-cli -s=client fill "#mp-joincode" "$CODE" >/dev/null 2>&1
  playwright-cli -s=client click "#mp-joinbtn" >/dev/null 2>&1
  # connectivity gate (JOIN_TIMEOUT is 20s) — both must see the handshake
  if poll host "window.NET._dbgLog.some(function(e){return e.msg.indexOf('peer connected')>=0;})" 25 \
     && poll client "window.NET._dbgLog.some(function(e){return e.msg.indexOf('host welcomed us')>=0;})" 5; then
    ok T3 "WebRTC handshake (host<->client) connected"
  else
    skip T3 "peers did not connect within 25s (NAT/relay) — match not started"
    txt host "NET.mpDbgText()" > /tmp/mp-host-log.txt; txt client "NET.mpDbgText()" > /tmp/mp-client-log.txt
    playwright-cli close-all >/dev/null 2>&1; return
  fi
  # host starts the rollback match
  playwright-cli -s=host select "#mp-map-pick" "0" >/dev/null 2>&1
  playwright-cli -s=host click "#mp-start" >/dev/null 2>&1; sleep 4
  check "host: rollback session created"   T3 "$(ev host   "window.NET._dbgLog.some(function(e){return e.msg.indexOf('rollback: session created')>=0;})")" true
  check "host: rbstart sent to guest"      T3 "$(ev host   "window.NET._dbgLog.some(function(e){return e.msg.indexOf('rbstart')>=0;})")" true
  check "client: rbstart received"         T3 "$(ev client "window.NET._dbgLog.some(function(e){return e.msg.indexOf('rbstart received')>=0;})")" true
  check "client: host state synced"        T3 "$(ev client "window.NET._dbgLog.some(function(e){return e.msg.indexOf('host state synced')>=0;})")" true
  check "both: simulating (1/60 tick)"     T3 "$([ "$(ev host "window.NET._dbgLog.some(function(e){return e.msg.indexOf('simulating')>=0;})")" = true ] && [ "$(ev client "window.NET._dbgLog.some(function(e){return e.msg.indexOf('simulating')>=0;})")" = true ] && echo both)" both
  check "host in-game (running, role host)" T3 "$(ev host   '[running,netRole,!!NET.rbSession].join(",")')" 'true,host,true'
  check "client in-game (running, role client)" T3 "$(ev client '[running,netRole,!!NET.rbSession].join(",")')" 'true,client,true'
  # run ~9s, assert the library detected no desync on either side
  sleep 9
  check "no DESYNC on host"   T3 "$(ev host   "window.NET._dbgLog.some(function(e){return e.level==='err'&&e.msg.indexOf('DESYNC')>=0;})")" false
  check "no DESYNC on client" T3 "$(ev client "window.NET._dbgLog.some(function(e){return e.level==='err'&&e.msg.indexOf('DESYNC')>=0;})")" false
  # live command: client moves one of its own p2 units; both sims must converge
  evq client "(function(){var u=G.entities.find(function(e){return e.owner==='player'&&(e.ctrl||'p1')==='p2'&&e.kind==='unit'&&!e.dead;}); if(!u)return; window.__tid=u.id; G.selection=[u]; netCommand(G,u.x+96,u.y+96,null);})()"
  local TID; TID="$(ev client 'window.__tid')"; sleep 4
  local FP="(function(){var u=G.entities.find(function(e){return e.id===$TID;}); var p2=G.entities.filter(function(e){return !e.dead&&e.owner==='player'&&(e.ctrl||'p1')==='p2'&&e.kind==='unit';}).length; return JSON.stringify({u:u?(Math.round(u.x)+','+Math.round(u.y)+'/'+u.state):'?',p2:p2});})()"
  local FH FC; FH="$(ev host "$FP")"; FC="$(ev client "$FP")"
  check "live command: peer states converge ($FH)" T3 "$FH" "$FC"
  check "no DESYNC after command (host)"   T3 "$(ev host   "window.NET._dbgLog.some(function(e){return e.level==='err'&&e.msg.indexOf('DESYNC')>=0;})")" false
  # in-game debug panels + screenshots
  for s in host client; do playwright-cli -s=$s click "#btn-topmenu" >/dev/null 2>&1; sleep 1; playwright-cli -s=$s click "#btn-mpdebug" >/dev/null 2>&1; sleep 1; done
  playwright-cli -s=host   screenshot --filename="$SHOTS/rollback-host-ingame.png"   >/dev/null 2>&1
  playwright-cli -s=client screenshot --filename="$SHOTS/rollback-client-ingame.png" >/dev/null 2>&1
  [ -s "$SHOTS/rollback-host-ingame.png" ] && [ -s "$SHOTS/rollback-client-ingame.png" ] && ok T3 "in-game debug screenshots captured" || bad T3 "in-game screenshots missing"
  txt host "NET.mpDbgText()" > /tmp/mp-host-log.txt
  # induced disconnect: kill the host; the survivor must surface it
  playwright-cli -s=host close >/dev/null 2>&1
  if poll client "window.NET._dbgLog.some(function(e){return /peer .*disconnected|host link dropped|player left|host connection gone/.test(e.msg);})" 15; then
    ok T3 "disconnect surfaced in client log"
  else
    bad T3 "client never logged the host disconnect"
  fi
  txt client "NET.mpDbgText()" > /tmp/mp-client-log.txt
  playwright-cli close-all >/dev/null 2>&1
}

# ---- write report.md --------------------------------------------------------
report(){
  local f="$OUT/report.md" ts; ts="$(date -u '+%Y-%m-%d %H:%M UTC')"
  { echo "# STARLEFT Multiplayer — Playwright-CLI Test Report"
    echo; echo "_Generated by \`docs/mp/playwright/run-mp-test.sh\` on $ts._"
    echo; echo "**Result: $([ $FAIL -eq 0 ] && echo PASS || echo FAIL)** — $PASS passed, $FAIL failed, $SKIP skipped."
    echo; echo "| Status | Tier | Assertion |"; echo "|---|---|---|"
    for r in "${LINES[@]}"; do IFS='|' read -r st ti la <<<"$r"; local m="✓"; [ "$st" = FAIL ] && m="✗"; [ "$st" = SKIP ] && m="~"; echo "| $m $st | $ti | ${la//|/\\|} |"; done
    echo; echo "## Tier 1 — in-process harness console output"; echo '```'; [ -f /tmp/mp-tier1.txt ] && cat /tmp/mp-tier1.txt; echo '```'
    echo; echo "## Tier 3 — host debug log"; echo '```'; [ -f /tmp/mp-host-log.txt ] && cat /tmp/mp-host-log.txt; echo '```'
    echo; echo "## Tier 3 — client debug log (incl. induced disconnect)"; echo '```'; [ -f /tmp/mp-client-log.txt ] && cat /tmp/mp-client-log.txt; echo '```'
    echo; echo "## Screenshots"
    echo "- Lobby + debug panel: ![lobby](screenshots/lobby-debug.png)"
    echo "- Rollback host in-game: ![host](screenshots/rollback-host-ingame.png)"
    echo "- Rollback client in-game: ![client](screenshots/rollback-client-ingame.png)"
  } > "$f"
  echo "report written -> $f"
}

# ---- run --------------------------------------------------------------------
tier1; tier2; tier3; report
echo "============================================================"
if [ $FAIL -eq 0 ]; then grn "MP TEST: PASS  ($PASS passed, $SKIP skipped)"; exit 0
else red "MP TEST: FAIL  ($FAIL failed, $PASS passed, $SKIP skipped)"; exit 1; fi
