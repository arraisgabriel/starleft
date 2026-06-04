# STARLEFT P2P Co-op Multiplayer — Netcode Research & Improvement Plan

> Status: research complete; **Phases 0–4 + the full robustness track implemented and wired**. Phase 4b entity-delta is gated OFF behind `NET.DELTA` (bandwidth-only, highest desync risk); Phase 2c (raw unreliable channel) and 4c (binary packing) are intentionally not implemented (see §5). Not yet verified in a live two-browser co-op session — that's the remaining step.
> Scope: the in-game host↔client update flow — handshake/connection, state-sync, command replication, the client unit-animation bug, and a phased roadmap of optimizations / local-reconciliation improvements.
> Every code claim below is cited as `file:line` against the repo at the time of writing.

## How this was researched

- All `js/net/*` files plus `js/core.js`, `js/main.js`, `js/render.js`, `js/units.js`, `js/state.js` were read first-hand.
- A multi-agent workflow ran **5 code-comprehension agents + 6 web-research agents (70 cited sources) + 2 independent bug diagnoses + 3 design perspectives + an adversarial synthesis**. The synthesis's conclusions were re-verified against the code; where the raw diagnoses disagreed with the code (the "15 Hz aliasing" theory), the disagreement is documented and resolved in §4.

---

## 1. Executive summary

STARLEFT co-op is **host-authoritative state-synchronization** over Trystero (serverless WebRTC via public Nostr relays). The host runs the entire simulation and streams the world to a client that runs **zero gameplay simulation** — it applies snapshots, eases unit positions, computes its own fog, runs cosmetic systems, and renders. This is the **correct** architecture for this codebase: deterministic lockstep is impossible (non-seeded `enemyAI`/`runSalt`, [sync.js:4-5](../../js/net/sync.js#L4-L5)), and GGPO-style rollback is infeasible in a non-deterministic browser JS RTS.

**The reported bug** ("client/peer unit animations sometimes don't play, only the host's do") is **three distinct defects**, all client-side and all in the render/sync seam:

1. **Attack/action animations freeze on the client** — a **clock-reference mismatch**: the render path subtracts the client's locally-advanced `G.time` from the host's absolute strike timestamp `_actStamp`. The two are different timelines, so the attack-windup parameter `t` lands outside its valid `[0,0.8)` window and the swing freezes on frame 0. (Primary cause.)
2. **Building muzzle-flash never renders on the client** — the host packs `shootFx` as `o.sf=1` but the client's unpack never reads it.
3. **Walk cycle can read as static on the client** — the render-time `moving` test is tuned to the host's full-speed motion; the client's *eased* motion decays below the threshold between snapshots, so a gliding unit can render its idle frame.

**The roadmap** keeps the host-authoritative spine and layers in: animation correctness (Phase 0) → entity interpolation (Phase 1) → transport backpressure/send-rate (Phase 2) → client-side prediction+reconciliation for MOVE orders (Phase 3) → snapshot delta/bandwidth (Phase 4). A separate optional robustness track covers handshake timeouts, desync guards, and reconnect.

---

## 2. Architecture deep-dive (verified)

### 2.1 Transport & the `MP` facade — [js/net/trystero-boot.js](../../js/net/trystero-boot.js)

The **only ES module** in the project. It imports the vendored Trystero (with an `esm.sh` runtime fallback) and publishes a classic-callable facade on `window.MP`, then fires `mp:ready` so the 28 classic scripts can use it via `whenMP()`/`mpAvailable()` ([mp-ready.js](../../js/net/mp-ready.js)) without becoming modules.

- **"Serverless" caveat:** no app/signaling server *we* run, but Trystero still uses **public Nostr relays for signaling** and **STUN for NAT traversal**. STUN-only connects ~80-85% of peer pairs; symmetric-NAT pairs need a user-pasted TURN relay (`MP.setRelay`, trystero-boot.js:66). ICE servers default to Google STUN (trystero-boot.js:12-15).
- **Channels are Trystero typed actions** (`room.makeAction(tag)`, tag ≤ 12 bytes, trystero-boot.js:55). Trystero binary-serializes and chunks payloads internally. **All actions are reliable + ordered SCTP; Trystero exposes no per-channel reliability/ordering knob** — a hard constraint for Phase 2.
- `MP.send(tag,data,toPeerId?)` (broadcast if `toPeerId` omitted), `MP.on(tag,fn)`, `MP.onPeer/onLeave`, `MP.peers()` (wraps `room.getPeers()`), media via `addVoice`, plus a separate **presence room** for friend discovery (trystero-boot.js:99-109).
- **Graceful unavailable stub** (trystero-boot.js:38-41): if Trystero fails to load (e.g. `file://`), every method is a no-op and the lobby disables itself. **MP only works over http(s).**

### 2.2 Handshake / connection lifecycle — [js/net/mp.js](../../js/net/mp.js), [js/net/lobby.js](../../js/net/lobby.js), [js/net/mp-ui.js](../../js/net/mp-ui.js)

Main-menu only — **no mid-map hot-join**. Host and join are symmetric in Trystero (both call `joinRoom`); `mp.js` decides `netRole`.

```
HOST                                    JOIN
mpCreateRoom() → code (mpMakeRoomCode)
mpHostCreate(code): MP.enter(code)
  bindHostReceivers() ['mpcmd']
  MP.onPeer → assign ctrl 'p2',
    send 'mphello'{youCtrl,mode,mapIndex}        mpJoin(code): MP.enter(code)
  MP.on('mphello') ← joiner profile               bindClientReceivers() ['mpfull','mpsnap']
                                                   MP.on('mphello') ← LOCAL_CTRL='p2', mode, mapIndex
                                                   send 'mphello'{profile} back
mpHostStart(idx): pendingPlayers=2,
  netRole='host', G=newMap(idx),
  running=true, startHostClock()
  send 'mpstart'{mapIndex,mode}  ───────────────► MP.on('mpstart') → beginClientMatch(idx)
  NET.tick=0; NET.sendFull(peerId)                  netRole='client', G=newMap(idx) (det. terrain)
  (chunked 'mpfull')             ───────────────►   running=false (hold)
                                                    MP.on('mpfull') → applyFullSnapshot
                                                    onFullApplied → running=true, centre p2 base
                                  ◄── 15 Hz 'mpsnap' stream ──►  applySnap (once lastFull≥0)
```

Key files/lines: host create/`onPeer`/`mphello` (mp.js:27-51), `mpHostStart` (mp.js:53-74), `mpJoin` receivers (mp.js:85-127), `beginClientMatch` (mp.js:130-139), `onFullApplied` drop-in (mp.js:108-124). Pause sync: host `mpHostSetPaused`→`mppause`→client `applyHostPause` sets `running=!paused` (mp.js:78-82, 154-162). Peer-drop: host adopts orphaned p2 units into p1 (`handlePeerDrop`, mp.js:190-199); client treats host loss as terminal (`mpHostGone`, mp.js:180-188). Campaign advance: host-driven `mpAdvanceCampaign`/`mpHostEnterHub` (mp.js:203-221). Invite: `#mp=CODE` link (`mpInviteLink` lobby.js:12) auto-joins on load (`mpCheckInviteHash` lobby.js:15, wired main.js:327).

**Fragilities (no functional blocker, but worth the robustness track):** every handshake wait is unbounded (no join/first-full timeout); orphaned `mpfull` chunk buffers never expire; no reconnect path after a transient WebRTC drop.

### 2.3 Channel / action reference

| Action | Dir | Rate | Payload | Purpose |
|---|---|---|---|---|
| `mphello` | both | once | `{profile,youCtrl,mode,mapIndex}` | lobby handshake |
| `mpstart` | host→client | once | `{mapIndex,mode}` | begin match (client builds terrain) |
| `mphub` | host→client | once | `{mapIndex,mode,campaign}` | enter shared HUB |
| `mpfull` | host→client | join + on desync | chunked JSON (12 KB chunks) of `serializeForNet()` | full keyframe (terrain stripped) |
| `mpsnap` | host→client | **15 Hz** | compact full entity set + eco/time/wave | the hot state-sync path |
| `mpcmd` | client→host | per order | `{k,from,…}` | command replication |
| `mppause` | host→client | on toggle | `{paused}` | pause sync |
| `mpbye` | both | on leave | `{reason}` | clean disconnect |
| `mpping` | both | Alt+tap | `{x,y,c,from}` | map ping ([features.js](../../js/net/features.js)) |
| `mprtt` | both | 2 s | `{t,echo}` | RTT chip / net-quality |

### 2.4 In-game state-sync protocol — [js/net/sync.js](../../js/net/sync.js)

Two wire forms:

- **FULL (`mpfull`)** — `serializeForNet()` reuses save.js's serializer minus everything the client rebuilds locally from `mapIndex` (`tiles/biome/variant/megaSprites/features/blocked/explored/selection/groups`, NET_DROP sync.js:37). Sent on join and on a desync; chunked at 12 KB (`sendFull` sync.js:180-184). `applyFullSnapshot` overlays dynamic state onto the client's locally-regenerated terrain, relinks entity refs via save.js's `resolveRefs`, re-stamps building footprints/fog (sync.js:44-71). Race guards: stash-and-replay if `G` not built yet, and a HUB-transition rebuild (sync.js:46-56, 73-76).
- **COMPACT (`mpsnap`)** — `buildSnap` packs every non-dead entity via `packEnt`, plus `eco/time/wave/over` and optional HUB campaign (sync.js:140-146). **Each snap is a full self-healing entity set** (adds spawns, drops deaths), so there is deliberately **no periodic full keyframe** (sync.js:198-199) — a missed packet self-corrects on the next one.

**Per-unit packed fields** (`packEnt` sync.js:83-100): `id,t(ype),o(wner),k(ind),c(trl),x,y,hp,mh`; plus optional `s`(state), `as`(_actState), `ast`(_actStamp, attack only), `f`(_face), `d`(dir), `cr`(carrying), `st`(ars), `sp`(riteType), `air`, `h`(ero), `sg`(sieged), `cap`(tive), `spr`(sprinting), `si`(storedIn), `tg`(target id). Positions quantized to 0.1 tile (`Math.round(x*10)/10`). **Buildings** additionally pack `tx,ty,w,h`, construction/queue, `su`(storedUnits), `rl`(rally), `sf`(shootFx flag), `es`(everSeen) (sync.js:101-110). DEF-derived static stats are **never sent** — looked up client-side in `unpackInto` (sync.js:116-138).

**Client apply** (`applySnap` sync.js:147-176): merges by id (preserving render transients `_ax/_ay/hitFx/_walkDist`), removes ids missing from the snap, adds new ids, relinks target refs, prunes selection. **Position smoothing:** the snap position is stored as a target `_sx/_sy`, not applied directly (sync.js:122).

**Client per-frame driver** (`clientTick` sync.js:202-231): advances `G.time += dt` (so time-driven sprite anims run at render rate); eases `e.x/e.y` toward `_sx/_sy` at `SMOOTH_RATE=18` with a >2.5-tile instant-snap escape for teleports/spawns; reruns cosmetic systems the client otherwise skips (`updateSprint/updateParticles/updateWater/updateDialogs`); recomputes its own fog; runs the host-liveness watchdog.

### 2.5 Command replication — [js/net/commands.js](../../js/net/commands.js)

The networked surface is tiny: `commandUnits / placeBuilding / stopSelection / tryTrain / cancelTrain / releaseStored`. On the client these become `mpcmd` messages (the `net*` wrappers, commands.js:19-54); on host/solo they run directly. The host **validates** each remote command (anti-spoof: a peer may only act as its own `ctrl`; economy gate from the actor's own pool; placement legality) and **replays it through the exact same gameplay functions** by temporarily scoping `G.selection` + `G._cmdCtrl` and suppressing toast/SFX (`runScoped`/`quiet`, commands.js:60-110) — so there is zero duplicated sim logic and the result flows back in the next snapshot. **Selection, box-select, camera, zoom, control groups are 100% local.** There is **no client-side prediction and no command seq/ack** — perceived input latency for a client is ~½ RTT + up to one snapshot period (~67 ms).

### 2.6 Simulation gating — [js/main.js:334-356](../../js/main.js#L334-L356), [js/core.js](../../js/core.js)

```
loop(now): dt = min(0.05, …)
  if running && !G.over:
    solo   → update(G,dt)              // full sim in RAF
    host   → NET.hostRafStep()         // host-clock drives update()+hostTick() (worker keeps it alive backgrounded)
    client → NET.clientTick(dt)        // NO sim — easing + cosmetics + fog only
  updateCamera; render(G); throttled refreshUI
```

The entire `update()` tick — production, `updateUnit` movement/combat/gather, `separation`, `resolveStuck`, `enemyAI`, `reclaimOutposts`, `freeCaptives`, fog, particles, water, dialogs, death cleanup, `checkWinLose` (core.js:2-91) — runs **only on host/solo**. The **host clock** ([host-clock.js](../../js/net/host-clock.js)) drives `update()+hostTick()` from a Web-Worker heartbeat (clamped real-time dt, ≤0.1 s) when the host window is backgrounded and RAF stalls, plus a silent-audio + Screen Wake Lock keep-alive — because a stalled host freezes every client.

### 2.7 Animation pipeline — [js/render.js](../../js/render.js), [js/assets.js](../../js/assets.js)

Animation is **render-driven**, recomputed every frame in `drawUnit`:

- **Movement state** (render.js:751-758): `md = hypot(u.x - u._ax, u.y - u._ay)` from the last *rendered* position; `_walkDist += md`; `_face` flips on `md>0.25`; `moving = _still < 6` where `_still` increments while `md ≤ 0.25` (a 6-frame debounce).
- **Walk frame** (render.js:782): `moving ? ((_walkDist/9)|0) % frames : 0`.
- **Action frame** (render.js:773-779): if `_actState` is set, attack uses `t = state.time - _actStamp; fi = t<0.8 ? (t/0.8*n)|0 : 0` (windup→strike→recover); mine/heal loop uses `(state.time*7)|0 % n`.
- Anim strips resolve by faction: `unitWalk(type,owner)` / `actionAnim(type,action,owner)` (assets.js:170,194) — owner is synced, so host and client resolve the same strips.

`_actState`/`_actStamp` are **set in the host sim** (`updateUnit` units.js:418 reset, 445 heal, 486/490 attack, 530 mine; buildings set `shootFx` in core.js:26) and **synced to the client** (packed sync.js:88, unpacked sync.js:126). The walk cycle is driven by *rendered position deltas*, which on the client come only from `clientTick`'s easing.

---

## 3. Web-research synthesis (what "best practice" says)

Decision-ready takeaways from 70 sources (full list in §8), mapped to this project.

### 3.1 Architecture: lockstep vs state-sync vs rollback
- **Deterministic lockstep** (Age of Empires "1500 Archers") sends only *commands*; every peer simulates identically. It needs **bitwise determinism** (fixed-point math, strict FP, no non-deterministic libraries) — impossible to guarantee in browser JS, and this codebase already relies on non-seeded RNG (`enemyAI`/`runSalt`, sync.js:4-5). Desyncs from FP divergence/uninitialized state are the classic failure mode.
- **Host/server-authoritative state-sync** (the current model) trades ~100-200 ms latency for responsiveness, security, and *vastly* simpler engineering. **Correct choice** for a 2-player browser co-op RTS.
- **GGPO rollback** (predict + rollback + resimulate) is the gold standard for *deterministic 1v1 fighting games*; for a non-deterministic RTS with hundreds of entities and JS GC pauses, the determinism cost and per-frame state-serialization cost make it infeasible. **Ruled out.**

### 3.2 Entity / snapshot interpolation (the smoothness lever)
- Render remote entities **~one snapshot in the past** and **interpolate between the two most recent authoritative snapshots** (Gambetta entity interpolation; Gaffer snapshot interpolation; Valve `cl_interp ≈ 100 ms`). This is conservative — it never shows un-happened state, only delayed real state.
- A small **jitter buffer** (rule of thumb ~2-3× send interval) lets a single dropped packet interpolate across the gap rather than stall.
- The current code eases toward the *latest* target (dead-reckon-to-newest), which empties between snaps and rubber-bands under jitter — Phase 1 replaces it with true two-snapshot interpolation.
- **Animation between snapshots** should be advanced **locally and dt-based** (the project already advances `G.time` locally for this) — but any timestamp that crosses the wire must be expressed in the *receiver's* clock (the root of bug #1).

### 3.3 Client-side prediction + server reconciliation (the responsiveness lever)
- Number each input; **predict locally**; the server sends authoritative state + the **last-acked input sequence**; the client **discards acked inputs and replays the unacked tail** from the authoritative state; smooth the correction over ~100-200 ms (Gambetta parts 1-4; Valve Source).
- **Caveat for RTS:** full reconciliation needs deterministic client replay of pathfinding/separation — not available here. The pragmatic scope is **prediction of the local player's own MOVE intent only**, purely cosmetic, with the host authoritative (Phase 3).

### 3.4 Delta compression & bandwidth
- **Delta vs last-acked baseline** is the single biggest win — unchanged entities cost ~1 bit. Most RTS entities are stationary per tick.
- **Quantization + bit-packing** (positions/velocities/quaternions) yields large further reductions (Gaffer "Snapshot Compression"); positions here are already quantized to 0.1 tile.
- **Eventual consistency for cosmetic fields** + Area-of-Interest culling are standard. Keep a periodic keyframe as the delta safety net (Phase 4).

### 3.5 WebRTC DataChannel tuning + Trystero specifics
- WebRTC over SCTP supports reliable/unreliable × ordered/unordered. For games, **high-rate state should be unreliable+unordered** (`maxRetransmits:0`, `ordered:false`) so a stale packet can't head-of-line-block a newer one; **commands stay on a reliable channel**.
- **`bufferedAmount` backpressure** is the reactive flow-control primitive — gate sends on it; watch the ~16 KB SCTP message interop limit (chunk above it).
- **Trystero** exposes only reliable+ordered `makeAction`; getting an unreliable channel means adding a raw `RTCDataChannel` alongside it (Phase 2c). `bufferedAmount` is reachable via `room.getPeers()` → `RTCPeerConnection` (Phase 2b).

---

## 4. Bug root-cause analysis

### 4.1 Primary — attack/action animations freeze on the client (clock-reference mismatch)
**Mechanism.** The host stamps `_actStamp = state.time` at the strike (units.js:490) and packs it absolute (`o.ast = round(_actStamp*1000)/1000`, sync.js:88). The client stores it verbatim (`e._actStamp = o.ast`, sync.js:126). But render computes the windup as `t = state.time − _actStamp` (render.js:777) against the client's **independently advanced** `G.time` (`G.time += dt`, sync.js:207; hard-resynced only when drift > 0.5 s, sync.js:153). Subtracting two different clocks yields garbage `t`; since the swing is gated `t<0.8 ? (t/0.8*n)|0 : 0` (render.js:778), any meaningful drift pushes `t` out of `[0,0.8)` and the unit freezes on frame 0.

**Why it's a clock bug, not 15 Hz aliasing** (the two raw diagnoses initially blamed aliasing; refuted): `_actState='attack'` is re-set **every host tick** while the target is in range (units.js:486), so it appears in essentially every 15 Hz snapshot during combat — aliasing cannot produce a *continuous* freeze. The asymmetry is the tell: mine/heal `(state.time*7)` (render.js:779) and idle breathing (render.js:800) only *phase-shift* under drift and keep animating, while only the `[0,0.8)`-gated attack swing freezes. The host clock (host-clock.js) runs `update()` *before* `hostTick()` builds the snap, so the snapshot always captures finalized post-update `_actState` — further ruling out a pack-ordering race.

**Fix (Phase 0a).** Rebase the stamp into the client's clock on receipt: thread `snap.time` into `unpackInto` and set `e._actStamp = G.time − (snapTime − o.ast)` on each *new* strike (guarded by `e._lastAst` so the same swing isn't re-based every snapshot). This converts "elapsed since strike" into the client's timeline; render.js needs no change and becomes drift-immune.

### 4.2 Building muzzle-flash never renders on the client
`packEnt` sends `o.sf=1` for buildings with `shootFx` (sync.js:109), but the **building branch of `unpackInto` (sync.js:131-138) never reads `o.sf`**, so `e.shootFx` is never reconstructed and the turret/HQ shot line (render.js:189-192) never draws. The host sets `shootFx={x,y,t:0.12}` in core.js:26. **Fix (Phase 0b):** reconstruct `e.shootFx` from `o.sf` in the building unpack (reuse the building's own position for the flash origin — target coords aren't on the wire; render decays `.t` locally).

### 4.3 Secondary — walk cycle can render static on the client
The `moving` test (0.25px/frame over a 6-frame debounce, render.js:758) is tuned to the host's full-speed per-frame motion. On the client, motion comes only from the exponential ease toward `_sx/_sy` (`SMOOTH_RATE=18`), whose per-frame delta **decays between 15 Hz snapshots** and can dip below 0.25px — so a unit visibly glides while `moving` reads false and it renders idle frame 0. **Fix:** Phase 1 interpolation (motion reflects real host velocity) and/or the Phase 0c authoritative `moving` hint (`o.mv` from the host's `e.state`).

---

## 5. Improvement roadmap (implement + test)

> Full per-phase implementation and testing detail (exact edits, acceptance criteria, regression matrix) lives in the approved plan: `~/.claude/plans/agile-yawning-crab.md`. Summarized here.

| Phase | What | Effort | Risk | Depends on |
|---|---|---|---|---|
| **0** | Animation fixes: 0a clock-rebase, 0b building `shootFx`, 0c walk `moving` hint | S | Low | — |
| **1** | Interpolation: 1a lower `SMOOTH_RATE`; 1b true two-snapshot interpolation + render delay | S / M | Low / Med | — |
| **2** | Transport: 2a accumulator clamp; 2b `MP.bufferedAmount()` backpressure; 2c optional raw unreliable channel for `mpsnap` | S / M | Low / Med | — |
| **3** | Client prediction + reconciliation for **MOVE only** (`cmdSeq`/`snap.ack`, optimistic local move, blend-back) | L | Med (cosmetic) | 1 (best after 2) |
| **4** | Bandwidth: 4a omit unchanged scalars/queues; 4b per-entity dirty-bit delta + `snap.gone` + periodic keyframe; 4c binary packing | S / M / L | Med / High | flag-gated, last |

All phases touch **only** client-render, wire-format, or the `MP`/`NET` facades — never the host sim or the `solo` path. Each is independently revertable; risky phases (2c, 4b) sit behind a flag.

### Out of scope (and why)
- **Deterministic lockstep / GGPO rollback** — impossible/infeasible (§3.1).
- **Full prediction of economy commands** (`place/train/…`) — needs deterministic client replay; risks phantom gold; the 67 ms snapshot already delivers them.
- **Reconnect / host-migration** — valuable but high-risk; tracked separately in the robustness track, not in the 4-phase roadmap.

### Robustness track (implemented)
- **NaN position guard** — `unpackInto` rejects non-finite `o.x/o.y`, keeping the prior position (no off-map warp).
- **Out-of-order snapshot drop** — `applySnap` ignores any `snap.t` older than the last applied (`NET._lastAppliedTick`; re-baselined by a full snapshot / new match).
- **Chunk-buffer expiry** — `_recvFull` sweeps reassembly buffers older than `NET.CHUNK_TTL` (a lost chunk can't wedge memory).
- **Facing precedence** — `drawUnit` skips the render-time facing flip when `_actState` is set, so combat facing stays host-authoritative.
- **RTT-aware stall watchdog** — the "reconnecting" warning floor scales to ~3× the measured RTT (laggy ≠ gone).
- **Handshake timeouts** — `JOIN_TIMEOUT` (no `mphello` → "couldn't reach host") and `SYNC_TIMEOUT` (no first full → auto-reconnect), surfaced via `toast` + optional `mpUiJoinTimeout`/`mpUiSyncTimeout` hooks.
- **Reconnect** — a transient client drop (Trystero peer-leave / snapshot watchdog) now enters a bounded re-enter loop (`onHostDrop`, `RECONNECT_WINDOW`/`RECONNECT_MAX`) instead of going terminal; a clean BYE stays terminal. The host **holds the ally's units for a grace window** (`onPeerDropHost`) and, on rejoin, re-blesses the peer + `sendFull` to resync — so a reconnecting player keeps their base. Falls through to the existing adopt-units behavior if the window expires.

### Not implemented (deliberately)
- **Phase 2c (raw unreliable DataChannel)** — Trystero exposes no per-channel reliability and hides its channels; adding a raw negotiated channel risks breaking the connection for a marginal gain. **Phase 2b backpressure delivers the practical benefit** (no snapshot backlog blocking commands).
- **Phase 4c (binary `ArrayBuffer` packing)** — highest regression risk, marginal over 4b's entity-delta; deferred.

---

## 6. Test harness & methodology

No automated test runner exists (AGENTS.md). Testing is a repeatable two-peer protocol:

- **Serve & connect:** MP is dead on `file://`. `python3 -m http.server 8000`; open two browser contexts at `http://localhost:8000/rts.html` (localhost is a secure context for WebRTC; Trystero signaling uses public Nostr `wss` relays → needs internet). Host in one, join the other via the `#mp=CODE` invite link (lobby.js:12) or by pasting the code.
- **Instrumentation** (temporary, behind `window.NET_DEBUG`): log `mpsnap` byte size at sync.js:200; log `G.time − snap.time` drift in `applySnap`; compare host vs client live-entity-id sets every ~2 s; stamp `mpcmd` send→reflect latency; log `MP.bufferedAmount()` (Phase 2+). The net-quality panel (`mpToggleNetQuality`, features.js) + RTT chip give live latency.
- **Network conditioning:** DevTools throttling presets; a dev-only loss/jitter shim in `MP.send` (drop/delay `mpsnap`) for loss-resilience tests.
- **Playwright** (optional, via the `playwright-cli` skill — `.playwright/` is empty, no committed config): two contexts, drive the lobby, assert in-page state (`page.evaluate` on `window.G`/`window.NET`: entity-id parity, finite positions, `_actStamp` rebased, `snap.ack` advancing) + screenshots. Keep frame-accurate animation checks **manual** (P2P-over-relays is flaky; animation is sub-frame).
- **Regression matrix (every phase):** solo unchanged; host unchanged; save/load retro-compat (missing new fields default safely); narrow/mobile viewport; zero console errors across a full match.

---

## 7. Change log (implemented — `js/net/sync.js`, `js/net/trystero-boot.js`, `js/net/commands.js`, `js/net/mp.js`, `js/render.js`)

All changes are client-render / wire-format / `MP`-facade only; the host sim (`update`/`core.js`) and the `netRole==='solo'` path are untouched. Every new wire field is additive (an un-updated peer ignores it). Tunables: `NET.SMOOTH_RATE`, `NET.SEND_HIWATER`, `NET.SEND_MIN_INTERVAL`, `NET.PREDICT`, `NET.PREDICT_TTL`, `NET.DELTA`.

**Phase 0 — animation fixes**
- **0a** `unpackInto(e,o,snapTime)` rebases `_actStamp = G.time − (snapTime − o.ast)` on a fresh strike (guarded by `_lastAst`); `applySnap` threads `snap.time` in. Drift-immune attack windup.
- **0b** `packEnt` sends the shot endpoint (`o.sfx/o.sfy`) for **units and buildings** while the shot is live (`shootFx.t>0` gate); `unpackInto` rebuilds `e.shootFx={x,y,t:SHOOTFX_LIFE}` so the client renders the shot. **Coordinated with the concurrent "laser-bolt-from-muzzle" feature** (`drawLaserBolt`/`muzzleWorld`/`buildingMuzzle`/`MUZZLE` in render.js/assets.js/muzzle_data.js): the muzzle *start* is derived client-side from the unit's synced sprite/type/`_face`/position, so only the shot's endpoint + liveness cross the wire. The `t>0` send gate is essential — the expired `shootFx` object lingers on the host (render only decays `.t`, never nulls it), so without it the client would re-loop the beam forever.
- **0c** `packEnt` emits `o.mv` for `move`/`gather`; `unpackInto` sets `e._netMoving`; `drawUnit`'s `moving` ORs it in.

**Phase 1 — entity interpolation.** `unpackInto` keeps the previous authoritative target as `_sx0/_sy0`; `applySnap` stamps the snapshot timeline (`_snapPrevT/_snapLastT`); `clientTick` interpolates each unit `(_sx0,_sy0)→(_sx,_sy)` by `f = (now−_snapLastT)/(_snapLastT−_snapPrevT)` (renders ~1 snap behind), keeping the >2.5-tile teleport snap. Replaces the chase-ease.

**Phase 2 — transport hardening.** `hostTick` clamps `_sAcc` (no post-background burst, 2a) and, when `MP.bufferedAmount() > SEND_HIWATER`, skips the snapshot unless the send gap would exceed `SEND_MIN_INTERVAL` (~2.5 Hz floor, 2b). `trystero-boot.js` adds `MP.bufferedAmount()` (reads channel `bufferedAmount` via a one-time guarded `RTCPeerConnection.prototype.createDataChannel` patch that records each peer's channels). 2c (raw unreliable channel) intentionally deferred.

**Phase 3 — client prediction + reconciliation (MOVE only).** Every `mpcmd` carries a client `seq`; the host echoes the highest received seq as `snap.ack` (`buildSnap`) and acks on receipt (`applyRemoteCmd`). On a plain client MOVE, `netCommand` optimistically marks own units `_pred`/`_predSeq`/`_predTo`; `clientTick` (1a) advances them at the host base speed (`speed*TILE*dt`) and abandons a stale prediction after `PREDICT_TTL`; `applySnap` drops the prediction once `snap.ack ≥ _predSeq`, resuming interpolation from the predicted position (smooth blend). `place/train/cancel/releaseStored` carry `seq` but are not predicted.

**Phase 4 — bandwidth.** 4a (always on): `buildSnap` sends `eco` only when it changed (with a ~1 Hz safety resend). 4b/4c (**gated by `NET.DELTA=false`**): `buildDeltaSnap` sends only changed entities + a `gone` list + a ~0.5 Hz keyframe; `applySnap` honors delta semantics (absent = unchanged) when `snap.delta` is set. Entity-level delta avoids the field-level partial-merge hazard. Left off until co-op-validated.

**Robustness track.** NaN position guard + out-of-order `snap.t` drop + chunk-buffer TTL + RTT-aware stall floor in `sync.js`; facing precedence in `render.js`; join/sync timeouts + bounded client reconnect (`onHostDrop`) + host grace-hold/rejoin-resync (`onPeerDropHost`, `wireClientHandlers`) in `mp.js`. All fail-safe — worst case falls through to the prior terminal behavior. (Phase 2c unreliable channel and 4c binary packing intentionally not implemented — see §5.)

**Verification:** all five files pass `node --check`. Behavioral verification is the two-browser protocol in §6 — confirm (Phase 0) client attack swings / mine-heal loops / walk cycles / muzzle flashes; (Phase 1) smooth non-rubber-banding movement of ally/enemy units + instant spawn snaps; (Phase 3) the client's own move orders respond instantly and reconcile without snap-back; (Phase 2) under DevTools throttling, commands stay responsive and no fast-forward burst after backgrounding the host; (Phase 4a) idle-army snapshots shrink; plus the §6 regression matrix (solo unchanged, save/load retro-compat).

---

## 8. References (70 sources, by topic)

**Architecture / lockstep / RTS**
- 1500 Archers (Age of Empires): https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond · https://www.gamedeveloper.com/view/feature/131503/1500_archers_on_a_288_network_.php · https://samu.space/Age-of-Empires-and-networking/
- Don't use lockstep in RTS: https://medium.com/@treeform/dont-use-lockstep-in-rts-games-b40f3dd6fddb
- FP determinism / cross-platform sync: https://gafferongames.com/post/floating_point_determinism/ · https://gafferongames.com/post/deterministic_lockstep/ · https://www.gamedeveloper.com/programming/cross-platform-rts-synchronization-and-floating-point-indeterminism · https://yal.cc/preparing-your-game-for-deterministic-netcode/ · https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/
- Network model choice: https://mas-bandwidth.com/choosing-the-right-network-model-for-your-multiplayer-game/ · https://medium.com/mighty-bear-games/what-are-server-authoritative-realtime-games-e2463db534d1 · https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/ · https://gafferongames.com/post/what_every_programmer_needs_to_know_about_game_networking/ · https://gafferongames.com/post/state_synchronization/ · https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
- RTS netcode discussions: https://medium.com/@evan_73063/rts-client-server-networking-36e8154ff740 · https://discussions.unity.com/t/netcode-for-rts/943819 · https://merlinstemmer.medium.com/building-a-massively-multiplayer-online-real-time-strategy-mmo-rts-game-with-node-js-ffa1153281e · https://ruoyusun.com/2019/03/29/game-networking-2.html

**Prediction / reconciliation / interpolation**
- Gambetta: https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html · https://www.gabrielgambetta.com/entity-interpolation.html · https://www.gabrielgambetta.com/client-side-prediction-live-demo.html
- https://danieljimenezmorales.github.io/2025-06-20-client-side-prediction-and-server-reconciliation/ · https://www.gamedevs.org/uploads/latency-compensation-in-client-server-protocols.pdf
- Snapshot interpolation / dead reckoning: https://gafferongames.com/post/snapshot_interpolation/ · https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/ · https://github.com/geckosio/snapshot-interpolation · https://www.gamedeveloper.com/programming/dead-reckoning-latency-hiding-for-networked-games · https://doc.photonengine.com/bolt/current/in-depth/interpolation-vs-extrapolation · https://mocaponline.com/blogs/mocap-news/walk-cycle-animation · https://www.viget.com/articles/time-based-animation · https://gamedev.net/forums/topic/701574-local-tickratehearbeat-server-snapshot-update-frequency/

**Delta / bandwidth**
- Gaffer: https://gafferongames.com/post/snapshot_compression/ · https://gafferongames.com/post/reading_and_writing_packets/ · https://gafferongames.com/post/serialization_strategies/ · https://gafferongames.com/post/networked_physics_2004/ · https://gafferongames.com/categories/building-a-game-network-protocol/
- https://docs.unity3d.com/Packages/com.unity.netcode@1.4/manual/compression.html · https://www.gamedeveloper.com/programming/network-traffic-culling · https://www.gamedev.net/forums/topic/562836-delta-encoding-to-save-bandwidth/ · https://dev.to/aceld/11-mmo-online-game-aoi-algorithm-l7d · https://ruoyusun.com/2019/09/21/game-networking-5.html

**WebRTC / Trystero / transport**
- Trystero: https://github.com/dmotz/trystero · https://trystero.dev/
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel · https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel
- https://web.dev/articles/webrtc-datachannels · https://webrtcforthecurious.com/docs/07-data-communication/ · https://webrtchacks.com/datachannel-multiplayer-game/ · https://jameshfisher.com/2017/01/17/webrtc-datachannel-reliability/ · https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html · https://blog.mozilla.org/webrtc/large-data-channel-messages/ · https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/ · https://getstream.io/resources/projects/webrtc/advanced/buffers/ · https://medium.com/@geretti/netcode-series-part-2-data-channels-c12e9a238800 · https://medium.com/@dsugisawa/improving-webrtc-sctp-startup-reliability-with-smart-payload-strategies-6f5036444bfb · https://medium.com/sessionstack-blog/how-javascript-works-webrtc-and-the-mechanics-of-peer-to-peer-connectivity-87cc56c1d0ab · https://medium.com/@aguiran/building-real-time-p2p-multiplayer-games-in-the-browser-why-i-eliminated-the-server-d9f4ea7d4099

**Rollback / GGPO / co-op patterns**
- https://www.ggpo.net/ · https://en.wikipedia.org/wiki/GGPO · https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/ · https://www.snapnet.dev/docs/core-concepts/input-delay-vs-rollback/ · https://edgegap.com/blog/how-to-mitigate-latency-in-multiplayer-games-input-delay-vs-rollback/ · https://doc-api.photonengine.com/en/pun/current/class_photon_1_1_pun_1_1_photon_animator_view.html

**Surveys / misc**
- https://dl.acm.org/doi/full/10.1145/3519023 · https://arxiv.org/pdf/2007.15373 · https://www.researchgate.net/publication/221391528_Bandwidth_requirement_and_state_consistency_in_three_multiplayer_game_architectures · https://techbuzzonline.com/real-time-multiplayer-synchronization-techniques/ · https://ably.com/topic/websocket-architecture-best-practices · https://gist.github.com/MangaD/9f3649bcbad81eb3f2a7f255eb5ce8f1
