# Hades-grade unit animation pass — 16f + tween, up-facing, idle, death

**Status:** planned / not started · **Type:** art-regen + render/gen wiring · **Save/sync impact:** none (all render-only & transient)

A task checklist with complete context to take STARLEFT's units from choppy single-direction 10-frame
strips to fluid, multi-direction, fully-stated ("living") animations in the existing Hades-aimed style.

---

## Why

Units today are single **camera-facing 10-frame strips**, only mirrored L↔R (`js/assets.js:443`), advanced
by distance (walk) or a fixed timer (action). Result: motion looks choppy, and a unit moving up-screen
reads as walking backwards. The art *style* is already Hades-aimed (`gen_units.mjs` STYLE block references
Jen Zee / Supergiant), so the gap to "fluid and beautiful" is **frame density, motion smoothing, missing
directions, and missing states** — not the look. Intended outcome: noticeably smoother, multi-directional,
alive units, delivered within the existing $30 gen budget.

## Scope (4 bodies of work)

1. **Fluidity** — regenerate every strip at **16 frames** (4×4 grid) **+ render-side tween** between frames.
2. **Up-facing** — back/up walk+action sprites, already fully designed in `docs/up-facing-sprites.md` (commit `98e8ffe`).
3. **Animated idle** — per-unit idle loop, replacing the render breathing-trick.
4. **Death animation** — a death arc played on kill (kept render-only).

## Cost-driving facts (verified in-repo)

- **1 Gemini call = 1 ten-cell strip** (`gen_units.mjs`); frame count lives *inside* one image, so 10→16 frames **adds no calls** — only raises per-strip retry rate (busier grid).
- **Faction twins are free recolors**: `_enemy` (red), `_ao` (black/green), `psychologist` (white recolor of recruiter) via `slice_units.py` / `recolor_ao.py` / `recolor_white.py`. We pay only for **distinct bespoke art**.
- **Primary model is already `gemini-3-pro-image` (Nano Banana Pro)** = **$0.134/strip ≤2K** (`_dev/gen/_spend.mjs:17`); `gemini-2.5-flash-image` is a fallback in the same `MODELS` chain = **$0.039/strip**.
- **Ledger: $12.37 spent of a HARD $30 cap → $17.63 left** (`_dev/gen/.gen_spend.json`; `addSpent()` *throws* at the cap → over-budget paths need `CAP` raised at `_spend.mjs:16`).
- Repo-observed **iteration multiplier ≈ 2.5×**; **Batch API = ½ price** (24h async), both models.

## Cost model

Strip counts (paid = bespoke; recolors free; psychologist free throughout):

| Work item | Paid strips |
|---|---|
| A. Fluidity regen (front, 16f) | ~38 |
| B. Up-facing (back, 16f) | 36 (per `docs/up-facing-sprites.md §2`) |
| C1. Animated idle | ~13 |
| C2. Death animation | ~14 |
| **Total** | **~101** |

Cost per path (× = iteration multiplier; Batch = ½):

| Path | First-try | Realistic (×2.5) | Batch (×2.5, ½) |
|---|---|---|---|
| **All Pro** ($0.134) | $13.53 | **$33.84** | $16.92 |
| **All Flash** ($0.039) | $3.94 | **$9.85** | $4.92 |
| **Hybrid** (Pro heroes/bosses ≈40, Flash rank-file ≈61) | $7.74 | **$19.35** | $9.67 |

Per-item realistic (×2.5), **Pro / Flash**: A $12.73 / $3.71 · B $12.06 / $3.51 · C1 $4.36 / $1.27 · C2 $4.69 / $1.37.

**Budget reality** ($12.37 already spent): All-Pro realistic ($33.84) → $46 total, **needs `CAP`→~$50**.
All-Pro batch ($16.9) → $29.3, **just fits**. Hybrid batch ($9.67) → $22, **fits**. All-Flash realistic
($9.85) → $22.2, **fits**. Hybrid non-batch ($19.35) → $31.7, **needs `CAP`→~$35**.

**Recommendation: Hybrid + Batch + reference-image anchoring ≈ $8–10** (fits remaining budget, no cap change):
Pro for the ~9 scrutinized large types (heroes nino/biba/rust, bosses ninja/rex/ex_terminator), Flash for
rank-and-file (tiny on screen). Reference-image anchoring (feed the existing front strip into the gen,
`docs/up-facing-sprites.md §4.2`) is the biggest retry-cost cut. For uniform max quality instead: **All-Pro batch** ($16.9, just under cap, 24h).

---

## Tasks

### Phase 0 — Decide & guard budget
- [ ] Pick model strategy: **Hybrid (rec)** / All-Pro batch / All-Flash. Set the model per gen run accordingly.
- [ ] If a non-batch Pro/Hybrid path is chosen, raise `CAP` in `_dev/gen/_spend.mjs:16` (else default to Batch).
- [ ] Confirm frame target = **16** and that all generation will be reference-anchored.

### Phase 1 — Frame count + render tween (render-only, do first)
- [ ] `UNIT_FRAMES` 10→16 in `js/assets.js:320`.
- [ ] `OUT_FRAMES` 10→16 in `_dev/gen/slice_units.py:38`.
- [ ] Grid prompt `5×2`→`4×4` in `gen_units.mjs` STYLE + HERO_GRID blocks.
- [ ] Add render-side **tween** between adjacent frames in `blitFrame`/`drawUnit` (`js/assets.js:445`, `js/render.js ~2488–2527`) — sub-frame sampling or alpha cross-fade `i`→`i+1`, reusing the existing `_walkDist`/timer fraction. Render-only & transient.
- [ ] Verify existing 10f art still slices/renders during the transition (per-unit rollout; ambient fallback) — no magic-`10` elsewhere (confirmed; all logic reads `anim.frames.length`).

### Phase 2 — Generation pipeline upgrades
- [ ] Add `VIEW_BACK` / `AVOID_BACK` + `--up` flag to `gen_units.mjs` (`docs/up-facing-sprites.md §4.1`).
- [ ] Add **reference-image** support to `generate()` (pass front strip as `inlineData`) (`docs/up-facing-sprites.md §4.2`).

### Phase 3 — Generate art (Batch, reference-anchored; order: front regen → up → idle → death)
- [ ] **A. Front regen @16f** (~38): rank-and-file on Flash, heroes/bosses on Pro.
- [ ] **B. Up-facing @16f** (~36) via `--up` + ref image.
- [ ] **C1. Idle** strips (~13).
- [ ] **C2. Death** strips (~14, front view only).
- [ ] Eyeball each set; `--force <type>` regen only the rejects.

### Phase 4 — Slice + free fan-out
- [ ] Slice all new PNGs: `slice_units.py` (+ bespoke `slice_nino/biba/rust.py`, `pack_exterminator.py`) → `*.webp` (+ free `_enemy`).
- [ ] `recolor_ao.py` → free `_ao` for the 13 non-skip types; `recolor_white.py` → free psychologist set.
- [ ] `optimize_assets.py` (WebP).

### Phase 5 — Render / sim wiring (all render-only; no `save.js` / `net/sync.js` change)
- [ ] **Up-facing** (`docs/up-facing-sprites.md §5`): `walkPair` loads `_up` (optional/ambient); `unitWalk`/`actionAnim` gain an `up` arg with front-fallback; `drawUnit` computes sticky `u._faceUp` with dead-band hysteresis; thread into LOD + full paths + `muzzleWorld`.
- [ ] Add `_up` **muzzle anchors** for attacking types (`docs/up-facing-sprites.md §7`; reuse muzzle-calibrator workflow).
- [ ] **Animated idle:** `drawUnit` selects `actionAnim(type,'idle',…)` when stopped & not acting; keep breathing/fidget layered; missing `idle.webp` → today's behavior.
- [ ] **Death (render-only, co-op-safe):** extend `deathFx(state,e)` (`js/units.js ~1520`) to spawn a short-lived render-only sprite that plays the unit's `death` strip (~0.7s) at the death position. Keep `e.dead=true` immediate → **no sim/sync change**; each peer runs `deathFx` locally. Missing `death.webp` → today's burst FX. **Do NOT defer `e.dead` in the sim** (would risk co-op snapshot timing/determinism).

### Phase 6 — Cleanup
- [ ] Retire the interim vehicle/air **lean/bank** now superseded by up-art (`docs/up-facing-sprites.md §8`): set `ROT_LEAN=0` (or remove `updateUnitRot`/`rotBegin`/`rotEnd` + the `muzzleWorld` `_rot` branch). Keep `?norotate` for A/B if wanted.

### Phase 7 — Verify (manual, in-browser: `python3 -m http.server 8000` → `rts.html`)
- [ ] **Fluidity:** walk/attack smoother at 16f + tween; no jitter or size-pop between states.
- [ ] **Up-facing:** straight-up + both up-diagonals show the back with correct L/R flip; down/horizontal show front; no flicker at the dead-band; attack-up fires from the barrel.
- [ ] **Idle:** stopped units play the idle loop; breathing/fidget still layer.
- [ ] **Death:** kill plays the death arc then clears; no leftover sprite.
- [ ] **Factions:** player (cyan), enemy (`_enemy` red), an A&O map (`_ao`) correct for every new strip.
- [ ] **Co-op (client):** host-driven units show up-facing from interpolated motion and play death locally; no desync.
- [ ] **Mobile/LOD:** narrow viewport + zoom past `SPRITE_LOD_ZOOM` select the right strips; load gate not wedged.
- [ ] **Storage check:** unit art ~10MB → ~25–30MB (16f ≈ +60% width; up/idle/death ≈ 3× file count). Confirm up/idle/death registered **ambient/optional** so they can't wedge the loader; re-check mobile load.

---

## Risks
- **Denser 16f grid → more rejected gens.** Mitigated by reference-image anchoring; budget the ×2.5.
- **Muzzle re-anchor** for up attacks is the fiddliest manual step.
- **Death must stay render-only** — deferring `e.dead` in the sim risks co-op timing/determinism.
- **Hard $30 cap** blocks non-batch Pro/Hybrid until `CAP` is raised; default to Batch.
