# Reborn-Cyborg visual look — render-time red marker (rim + optic + core)

**Status:** shipped (render-only marker); verified in headless Chrome; live-gameplay eyeball still nice-to-have.
**Closes:** the "visibly-distinct Reborn sprite" gap flagged in `docs/story-polish.md` §7 (`:421-422`).

## What & why

A **Reborn Cyborg** is a fallen veteran dragged back off the memorial wall through **The Wake**
(`js/hub.js`). Canon frames it as hollow and wrong — *"Nothing came back whole"* (`hub.js:2090`),
*"Half of me is solder"* (`SELECT_LINES_REBORN`, `dialog_data.js:1383`), `+15% HP / zero self-heal /
spawned scarred` (`career.js:36`). Until now it looked identical to a living unit.

**The body art is left 100% untouched.** The "cyborg" read is a pure **render-time marker** keyed on the
existing per-entity `u.reborn` flag — so it is pixel-exact to the sprite, identical on every animation
frame (no swim), works on any unit shape (mech, man, tank, drone), and needs no baked art.

> **Why not recolor the body?** We tried, repeatedly, and it never worked: a per-pixel grey/silver body
> mask can't cleanly or stably follow "a limb" across frames — it swims, blotches, and varies in coverage.
> Every baked-recolor version was rejected (all-grey "lights-out"; grey+red+silver-aura, *"terrible massive
> aura"*; full bare-silver, *"looks like a normal unit"*; morphological silver arms/legs, *"imprecise and
> ugly… changes position across frames"*). **Owner decision: stop masking the body; mark it at render time.**

## The look — render-only (`js/render.js`, keyed on `u.reborn`, reduced-motion-safe)

- **Glowing SILVER silhouette RIM** (`drawRebornRim`) — drawn *behind* the sprite: the exact current frame
  is rendered into an offscreen scratch canvas, recolored via `source-in`, then blitted additively at 8 ring
  offsets (`R ≈ S·0.022`, thin) around the unit → a subtle edge-glow that hugs the silhouette pixel-for-pixel.
  **Two passes:** (1) a steady **silver** (`#c4d2e6`) base — the dominant, always-present color; (2) an A&O
  **toxic-green** (`#32e060`) sheen whose alpha is driven by a slow, out-of-phase sine (`grn`, ~5 s period) so
  it **breathes continuously** over the silver — capped so the silver never washes out. Low alpha overall.
- **A&O-green OPTIC** (`drawRebornCore`) — a small additive green machine-eye on the unit's **head**, with a
  faint flicker. Its position comes from `REBORN_OPTIC` — a per-sprite-type, per-action, **per-FRAME** anchor
  table (`dx[fi]` from sprite center as a fraction of width, `fy` from the top), keyed by the strip being
  drawn (`walk`/`attack`/`mine`/`heal`, threaded from `drawUnit` as `useKey`) and indexed by the current
  frame. So the eye **follows the head through the animation** — the lobbyist leans to aim and recoils, the
  soldier's head dips mid-swing, and the optic tracks it. Mirrored the same way `blitFrame` mirrors the
  sprite; unlisted strips fall back to `.walk`. The table was built by the `reborn-optic-head-tracking`
  workflow: 4 independent silhouette head-detectors (adaptive opening, widest-run, walk-continuity,
  torso-axis-constrained), **consensus-merged by per-frame median** (so whichever detector a raised weapon
  fools gets outvoted) + a temporal median smooth.
- **Red chest CORE heartbeat** — an additive ember-red glow at the chest, slow ~0.85 Hz tired double-thump.

All three are additive (`'lighter'`) and gated off under `megaReducedMotion()` for the animated parts. Cost
is ~1 offscreen redraw + ~10 `drawImage`/gradient fills per Reborn per frame — trivial (Reborns are ≤3 in
the campaign; even dozens in the Sandbox are fine). Not drawn on the low-zoom `spriteLod` path (units tiny).

## Spawn it in the Sandbox

Localhost battle test tool (`js/sandbox.js`, Settings → 🧪 Sandbox): a **"🦾 Reborn cyborg"** toggle under
*Place as*. While on, any UNIT you place spawns as a Wake Reborn — `e.reborn=true`, `e.scarred=true`, and
`applyVetHp()` re-bakes the +15% HP (dead-nerve no-heal auto-gates on `e.reborn`). Buildings unaffected.

## Files

- `js/render.js` — `drawRebornRim()` + `drawRebornCore()` helpers + a shared offscreen scratch canvas;
  called from `drawUnit()` on `u.reborn` (rim before the blit, optic+core after). The `fac` faction key is
  **not** used for Reborn (the body uses the normal owner sprite). No `_reborn` sheets, no generator.
- `js/net/sync.js` — the compact 12 Hz snapshot packs `o.rb` / unpacks `e.reborn` so a co-op **client**
  shows the marker too (the full join snapshot already carried it via `serializeGame`).
- `js/sandbox.js` — the 🦾 placement toggle.

No save/net schema change beyond the additive `reborn` snapshot field; no baked assets; `js/assets.js`
is untouched (the earlier `reborn` sprite key was reverted).

## Verify

Headless-Chrome canvas test confirmed the rim/optic/core render and align (founder + lobbyist). In game:
Settings → **🧪 Sandbox** → 🦾 Reborn toggle → place a unit; or console:
```js
const r = mkUnit(G,'soldier','player', (G.W/2|0)+3, G.H/2|0); r.reborn=true; refreshUI();
```
Expect: a glowing red outline around the unit, a red eye at the head, and a slow red chest pulse; the body
art is unchanged.

## Known gaps / follow-ups

- **Co-op** parity (the `reborn` snapshot field) is wired but UNVERIFIED in a real 2-player session.
- **Low zoom** (`spriteLod`) shows no marker — add a small red dot there if it matters.
- **Optic anchor** uses the measured `REBORN_OPTIC` per-frame table (consensus of 4 detectors). Unlisted
  types (drone/airship) use `_default` (top-center). To re-measure after an art change, re-run the
  `reborn-optic-head-tracking` workflow. Genuine large head motion that *is* tracked (not error): soldier's
  attack lean and worker's mine swing keep real range — that's the optic correctly following the head.
- **lobbyist/attack & nino/attack** were re-measured with the **widest-run** detector (the hat brim is the
  widest top run) instead of the consensus — the consensus's temporal-median had flattened their *deep
  single-frame aim-lean* (frames 4–6). If another deep-lean hat unit looks flattened, the widest-run raw
  values (`assets`-derived, no smoothing) are the fix.
- Tunables in `drawRebornRim` (silver `#c4d2e6`, green `#32e060`, width `R ≈ S·0.022`, silver alpha
  `0.20+0.05·sil`, green-breath alpha `0.03+0.15·grn`, green sine `t·1.25`) and `drawRebornCore` (green
  optic; chest core still **red** — change its gradient if you want the heartbeat green too).
