#!/usr/bin/env bash
# ============================================================================
# STARLEFT — building-placement + start-base-spacing test via playwright-cli
#
# One tier: in-process pure-function assertions (no network, no peer). Loads
# rts.html?placement-tests=1, runs PLACEMENT.runTests() (js/placement_tests.js),
# emits one row per assertion, writes docs/placement/report.md, and best-effort
# captures preview screenshots at desktop + narrow widths.
#
#   A  canPlaceAt regression (footprint legality — unchanged)
#   B  warn-only crowding advisory (visualBaseTiles; art-aware, never blocks)
#   C  art-box geometry (buildingArtBoxTiles: hq/turret/intel/darktower/anchor)
#   D  preview/real-draw lockstep (buildingDrawBox ≡ buildingArtBoxTiles)
#   E  map-start spacing regression — no same-tier pile, valid ground, reachable
#   F  determinism — newMap(idx) twice → identical start layout
#
# Drives only the game's globals + the PLACEMENT harness; makes NO game changes.
#
# Usage:   bash docs/placement/run-placement-test.sh
# Requires: playwright-cli (global), python3 (auto-starts the static server).
# Exit code: non-zero if any assertion fails.
# ============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # repo root
OUT="$ROOT/docs/placement"
SHOTS="$OUT/screenshots"
URL="http://localhost:8000/rts.html?placement-tests=1"
mkdir -p "$SHOTS"

PASS=0; FAIL=0
declare -a LINES
red(){ printf '\033[31m%s\033[0m\n' "$*"; }; grn(){ printf '\033[32m%s\033[0m\n' "$*"; }
ok(){  PASS=$((PASS+1)); LINES+=("PASS|$1"); grn "  ✓ $1"; }
bad(){ FAIL=$((FAIL+1)); LINES+=("FAIL|$1"); red "  ✗ $1"; }

ev(){  playwright-cli -s="$1" --raw eval "$2" 2>/dev/null | sed 's/^"//; s/"$//'; }
evq(){ playwright-cli -s="$1" eval "$2" >/dev/null 2>&1; }
txt(){ playwright-cli -s="$1" --raw eval "$2" 2>/dev/null | sed 's/^"//; s/"$//; s/\\n/\n/g'; }
poll(){ local s="$1" e="$2" n="$3" i; for ((i=1;i<=n;i++)); do [ "$(ev "$s" "$e")" = "true" ] && return 0; sleep 1; done; return 1; }
ready(){ poll "$1" "(typeof newMap==='function' && typeof canPlaceAt==='function' && typeof buildingArtBoxTiles==='function' && typeof visualBaseTiles==='function' && !!window.PLACEMENT && PLACEMENT.on===true)" 25; }
gate(){ evq "$1" "(function(){var b=document.getElementById('btn-simulate'); if(b)b.click(); return !!b;})()"; }

# ---- preflight: static server ----------------------------------------------
echo "== preflight =="
if ! curl -s -o /dev/null -m 3 "http://localhost:8000/rts.html"; then
  echo "  starting static server (python3 -m http.server 8000)"; ( cd "$ROOT" && python3 -m http.server 8000 >/tmp/starleft-http.log 2>&1 & ); sleep 1.5
fi
curl -s -o /dev/null -m 3 "http://localhost:8000/rts.html" && grn "  server up" || { red "  server unreachable"; exit 2; }
playwright-cli close-all >/dev/null 2>&1 || true

# ---- run the harness --------------------------------------------------------
echo "== placement harness =="
playwright-cli -s=pl open "$URL" >/dev/null 2>&1
ready pl || { bad "page/PLACEMENT never became ready"; }
if [ "$(ev pl 'PLACEMENT.on')" = "true" ]; then
  evq pl 'window.__PL = PLACEMENT.runTests()'
  TOTAL="$(ev pl 'window.__PL.results.length')"
  RPASS="$(ev pl 'window.__PL.pass')"; RFAIL="$(ev pl 'window.__PL.fail')"
  echo "  harness: $RPASS/$TOTAL passed, $RFAIL failed"
  # one report row per assertion
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    st="${line%%::*}"; rest="${line#*::}"; name="${rest%%::*}"; detail="${rest#*::}"
    if [ "$st" = "PASS" ]; then ok "$name"; else bad "$name — $detail"; fi
  done < <(txt pl "window.__PL.results.map(function(r){return (r.ok?'PASS':'FAIL')+'::'+r.name+'::'+(r.detail||'');}).join(String.fromCharCode(10))")
else
  bad "PLACEMENT.on is false — did the page load with ?placement-tests=1 ?"
fi

# ---- best-effort preview screenshots (do not gate the run) ------------------
# Enter a real map, dismiss the boot gate + title overlay (so the canvas shows), open placement mode,
# and shoot two cursor positions: one on open ground (green ghost) and one crowding the HQ (amber).
echo "== preview screenshots (best-effort) =="
if [ -n "${TOTAL:-}" ]; then
  gate pl
  evq pl "(function(){ try{ loadMap(0); }catch(e){} var s=document.getElementById('startScreen'); if(s)s.style.display='none'; var g=document.getElementById('bootGate'); if(g)g.style.display='none'; })()"
  sleep 1
  # placement ghost on OPEN ground → green outline + translucent real-art sprite
  evq pl "(function(){ try{ G.placing={type:'barracks',def:DEF.barracks,builder:null}; var hq=G.entities.find(function(e){return e.owner==='player'&&e.type==='hq';}); if(hq&&typeof mouse!=='undefined'){ mouse.wx=(hq.tx+12)*TILE; mouse.wy=(hq.ty+10)*TILE; } }catch(e){} })()"
  sleep 1
  playwright-cli -s=pl screenshot --filename="$SHOTS/preview-desktop.png" >/dev/null 2>&1
  # placement ghost CROWDING the HQ → amber outline (warn, still placeable)
  evq pl "(function(){ try{ var hq=G.entities.find(function(e){return e.owner==='player'&&e.type==='hq';}); if(hq&&typeof mouse!=='undefined'){ mouse.wx=(hq.tx+hq.w+2)*TILE; mouse.wy=(hq.ty+1)*TILE; } }catch(e){} })()"
  sleep 1
  playwright-cli -s=pl screenshot --filename="$SHOTS/preview-crowding-amber.png" >/dev/null 2>&1
  playwright-cli -s=pl set-viewport 390 844 >/dev/null 2>&1 || playwright-cli -s=pl resize 390 844 >/dev/null 2>&1 || true
  sleep 1
  playwright-cli -s=pl screenshot --filename="$SHOTS/preview-narrow.png" >/dev/null 2>&1
  [ -s "$SHOTS/preview-desktop.png" ] && echo "  shots ok" || echo "  (shots skipped)"
fi
playwright-cli close-all >/dev/null 2>&1 || true

# ---- write report.md --------------------------------------------------------
f="$OUT/report.md"; ts="$(date -u '+%Y-%m-%d %H:%M UTC')"
{ echo "# STARLEFT Building Placement — Playwright-CLI Test Report"
  echo; echo "_Generated by \`docs/placement/run-placement-test.sh\` on $ts._"
  echo; echo "**Result: $([ $FAIL -eq 0 ] && echo PASS || echo FAIL)** — $PASS passed, $FAIL failed."
  echo; echo "| Status | Assertion |"; echo "|---|---|"
  for r in "${LINES[@]}"; do IFS='|' read -r st la <<<"$r"; m="✓"; [ "$st" = FAIL ] && m="✗"; echo "| $m $st | ${la//|/\\|} |"; done
  echo; echo "## Preview screenshots"
  echo "- Desktop, open ground (green ghost): ![desktop](screenshots/preview-desktop.png)"
  echo "- Crowding the HQ (amber warning, still placeable): ![amber](screenshots/preview-crowding-amber.png)"
  echo "- Narrow / 390px viewport: ![narrow](screenshots/preview-narrow.png)"
} > "$f"
echo "report written -> $f"

echo "============================================================"
if [ $FAIL -eq 0 ]; then grn "PLACEMENT TEST: PASS ($PASS passed)"; exit 0
else red "PLACEMENT TEST: FAIL ($FAIL failed, $PASS passed)"; exit 1; fi
