# STARLEFT Netcode Decision: rollback-netcode vs. host-authoritative state-sync

> Companion to [research.md](research.md). Records the investigation of the `rollback-netcode` library
> (`github.com/someusername6/rollback-netcode`) + the infil.net rollback technique, the verdict, the 3-player
> question, and the **determinism experiment** now in the tree to settle the rollback question with data.

## Verdict (TL;DR)

**Host-authoritative state-sync remains STARLEFT's shipping architecture.** Do **not** adopt rollback-netcode
wholesale *yet*. Two things changed the calculus from a flat "no": you don't care about the client CPU cost,
and you want **3-player** co-op. That makes rollback worth *seriously evaluating* — so rather than decide on
priors, we built a **determinism experiment** (Stage 0 shipped; Stage 1 next) that produces a hard PASS/FAIL
on the one thing that actually gates rollback: **can STARLEFT's simulation be made bit-identical across
peers?** Run it, then decide.

- If determinism **holds cross-browser** → rollback becomes attractive: it gives **3–4 players**, inputs-only
  bandwidth, and all-command responsiveness in one architecture (and you've taken CPU off the table).
- If it **doesn't** → extend the proven host-authoritative model to 3 players instead (no determinism rewrite).

Either way, the determinism test is the cheap, decisive next step.

### Result so far (empirical — June 2026)
- **Stage 0 (intra-engine): PASS** — `NET.determinismTest(0,900,12345)` → 900 ticks bit-identical in Chrome; seeded RNG was the only divergence source (no hidden `Map`-order/`Date.now`/sequencing bug).
- **Stage 1 (cross-engine): PASS so far** — `NET.determinismSig(0,5400,12345)` = **`0x35d253c3`** identical on **V8 (Chrome)** and **JSC (Safari)** over 90 s of sim including movement/fortify/separation floating-point. **Firefox (SpiderMonkey) still to confirm** (historically the most likely to differ on transcendentals), plus a breadth sweep across maps/seeds.
- **Implication:** the #1 rollback blocker (cross-engine desync) is empirically holding. If Firefox confirms, **rollback — and 3–4-player co-op — is viable** (CPU being moot for you). The risk retired here was the scary unknown; what remains is a large-but-mechanical architecture migration (§6).

---

## 1. What rollback-netcode does that STARLEFT does not

| Capability | rollback-netcode | STARLEFT today |
|---|---|---|
| **N-player (3, 4+)** | Native; not limited to 2 (README) | **2 only** — host + a single `p2` peer is hard-wired (`mp.js`) |
| **Inputs-only wire format** | ~20–50 B/player/tick + periodic 4-byte hash; state rebuilt locally | Full/compact entity snapshots at 15 Hz (`NET.DELTA_HZ`, `sync.js`) — grows with entity count |
| **Local-instant input for ALL commands** | Every input applied at tick T, reconciled by rollback | Only the client's own **MOVE** is predicted; attack/build/train wait ½-RTT |
| **Symmetric peer simulation** | Every peer authoritative via determinism | Asymmetric: host authoritative, client runs **zero** gameplay sim |
| **State-hash desync detection** | `hash()` every `hashInterval`; auto-recovery | **None** today (the experiment below adds `NET.simHash`) |
| **Transport-agnostic adapter** | `TransportAdapter` (connect/send/broadcast/onMessage), star & mesh | Trystero facade hard-wired |

## 2. Would it improve performance?

- **Bandwidth — YES, and it scales the right way.** Inputs-only is flat in entity count and `O(players)`;
  STARLEFT snapshots are `O(players × entities)`. The win grows precisely at a 200-unit battle and at 3–4
  players.
- **CPU — worse, but you've dismissed it.** Both peers run the full sim + `serialize()`+`hash()` every tick +
  re-sim up to `maxSpeculationTicks` on misprediction (vs the client running zero sim today). Off the table
  per your call; just note the *weakest peer* sets the pace for everyone.
- **Responsiveness — YES but marginal for co-op-vs-AI.** No human opponent to out-react; the latency-critical
  MOVE is already predicted. Real but small.

## 3. The 3-player question (you asked)

**Yes — rollback-netcode supports 3 (and 4+) players natively; it's one of its headline features.** So a
rollback rewrite *would* give you 3-player co-op as a side effect.

**But you do not need rollback to get 3 players.** The current host-authoritative model extends to N players
without any determinism rewrite — the host already simulates the whole world; 3-player means:
- the lobby/handshake accepts a 2nd joiner and assigns `p3` (generalize the single-`p2` wiring in `mp.js`);
- the host broadcasts snapshots to **both** clients and accepts `mpcmd` from each (`sync.js`/`commands.js`);
- economy pools `p1/p2/p3`, a 3rd co-op base spawn (`map.js` `_coopOrigins`), and enemy scaling — which
  `coopFactor(state.players)` ([balance.js](../../js/balance.js), used in [ai.js:29](../../js/ai.js#L29))
  already parameterizes by player count.

**Trade-off for 3-player specifically:**

| | Host-auth extension | Rollback rewrite |
|---|---|---|
| New determinism work | **None** | Full (gated by the experiment below) |
| Effort | Moderate, in the proven model | Large (architecture inversion) |
| Bandwidth at 3p | Host uploads 2× snapshots (~1–2 Mbps; fine on broadband) | Inputs-only, scales best |
| Risk | Low (no desync class) | Desync risk until determinism proven |
| Bonus | — | 4+ players, all-command responsiveness too |

**Recommendation:** run the determinism experiment first. If it's green, rollback gets you 3–4 players *and*
the other wins together (CPU being moot for you). If it's red, the host-auth extension is the safe way to
ship 3-player. The experiment de-risks the ambitious path while keeping the safe fallback open.

## 4. Integration options

- **A — Full rollback adoption.** ~4k LOC determinism rewrite (see §6 prerequisites). Only after the
  experiment proves determinism. Gives 3–4 players + responsiveness + bandwidth.
- **B — Staged shadow experiment (in progress).** Prove determinism with zero production risk — Stage 0
  shipped, Stage 1 next. **This is what we're doing.**
- **C — Borrow concepts only.** The `NET.simHash` desync detector (now in the tree) is independently useful
  in the host-auth model; the transport-adapter seam and wider prediction are cheap wins.
- **D — Host-auth 3-player extension.** The no-rewrite path to 3 players (§3).

---

## 5. The determinism experiment (built — how to run)

To replace the `sync.js:4` assertion ("lockstep is impossible here") with **measured fact**, gameplay
randomness now routes through a **seeded** RNG and a state-hash + self-test harness ship in the tree.

**Stage 0 — intra-engine determinism (SHIPPED).**
- Seeded sim RNG `seedSim()`/`simRandom()` ([state.js:25](../../js/state.js#L25)); the 6 `enemyAI`
  `Math.random()` calls now use `simRandom()`, seeded per match from `runSalt` ([ai.js:9,42-136](../../js/ai.js#L9)).
  Normal play is unchanged (enemy still varies per match — just reproducible from the seed). The client is
  untouched (it doesn't simulate). Terrain (`cfg.seed`) and cosmetic lore (`runSalt`) are unaffected.
- `NET.simHash(state)` + `NET.determinismTest()` ([js/net/determinism.js](../../js/net/determinism.js)).

**How to run (browser console, ideally at the main menu before starting a match):**
```js
NET.determinismTest()              // map 0, 900 ticks, seed 12345
NET.determinismTest(2, 1800, 7)    // map 2, 30s of ticks, seed 7
NET.determinismSweep([0,1,2,3])    // sweep several maps × seeds
```
- **PASS** ⇒ the sim is deterministic within this engine — RNG was the only divergence source (no hidden
  iteration-order/time bug). Proceed to Stage 1.
- **FAIL** ⇒ it prints the **first diverging tick**; hunt the hidden non-determinism there and re-run.

**Stage 1 — cross-engine determinism (NEXT, the real risk).** The intra-engine pass doesn't test the
cross-browser floating-point question — transcendentals (`atan2`/`hypot`/`sin`/`cos` in
[ai.js:130-131](../../js/ai.js#L130) and `units.js` movement) can differ between V8 (Chrome), SpiderMonkey
(Firefox), and JSC (Safari). Stage 1: sync `G.simSeed` in the host full snapshot, run a **shadow sim** on
both peers fed by the same `mpcmd` inputs, and exchange `simHash` every N ticks via a new `mphash` action
(gated `NET.SHADOW=false`; production `sync.js` untouched). Host on Chrome + client on Firefox; watch for
divergence over a full match.

## 6. Decision gate & prerequisites (only if Stage 1 is green)

If cross-browser determinism holds, the full rollback path (and 3–4 players) becomes a go. Prerequisites:
1. Replace cross-engine-risky transcendentals (`hypot→sqrt`, `atan2`/`sin`/`cos`→lookup tables) in
   `units.js`/`ai.js`; add a lint rule banning `Math.random()`/`Date.now()` in sim files.
2. Convert `update(state,dt)` to a fixed-tick accumulator (render with the existing two-snapshot interpolation).
3. Implement the `Game` interface (`serialize/deserialize/step/hash`) over **dynamic-only** state (binary,
   reuse the `save.js` field list, drop regenerable terrain) — contract: `rollback-netcode/src/types.ts:100-124`.
4. Wrap Trystero in a `TransportAdapter`; validate via the shadow mode before deleting `sync.js`/`commands.js`.

If Stage 1 is red, ship **3-player via the host-auth extension (§3, Option D)** and keep `NET.simHash` for
desync detection.
