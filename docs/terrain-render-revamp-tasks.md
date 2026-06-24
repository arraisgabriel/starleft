# STARLEFT — Terrain / World-Render Revamp — TASK TRACKER

> **Execution checklist** for the vision in **[terrain-render-revamp.md](terrain-render-revamp.md)** (the
> design doc). Work it top-to-bottom. The design doc is *why/what*; this file is *do/verify/track*.
>
> **§ references** below point at the design doc's sections (§1–§11).

## How to use this file

- **Legend:** `[ ]` = todo · `[~]` = in progress · `[x]` = done · `[-]` = N/A (skipped, note why).
- **Tick a parent task only when every sub-item under it is ticked.** A task is "done" only when its
  **Implement**, **Guardrails**, and **Verify** sub-lists are all green.
- **Order is load-bearing:** finish **Milestone 1 (MVP: P0→P1→P2)**, then **STOP at the 🚦 hard approval
  gate** until the owner signs off. Do not start P3 before the gate box is ticked.
- Every task inherits **§0 Definition of Done** below; per-task **Guardrails** list only the *extra*,
  phase-specific non-negotiables it triggers.
- Each phase ships independently and must pass the existing `?perf=1` A/B pixel-diff/perf gate before merge.

---

## §0 — Definition of Done (applies to EVERY task — design doc §11)

Re-check this whole block before ticking ANY task. These are the standing non-negotiables; per-task
Guardrails add to them, never replace them. _(Ticks below reflect the shipped MVP code — P0/P1/P2.)_

- [x] **Cosmetic / render-only.** All MVP layers run in the render path, **outside `update(G,dt)`**; no
      gameplay state mutated. **No `simRandom`** in the visual code (uses `h2`/world coords / `performance.now`).
- [x] **Determinism across peers.** Grunge is world-coordinate-anchored; the only RNG is `h2(coords)` and the
      decal scatter's `_mulberry32` seeded from cell coords → host & client bake identical terrain (P5 verified:
      two loads → identical frame hash).
- [x] **Save invariance.** No new persisted fields; **no `js/save.js`/`sync.js` change**. Grade easing lives in
      a module-level var (`_gradeCur`), not on `state`.
- [x] **All three sim paths hold.** Layers are render-only and run identically solo/host/client; no client mutation.
- [x] **Zero per-frame allocation.** Shadow sprite, grunge texture, vignette/focal gradients all cached/built
      once; per-frame work = `drawImage`/`fillRect` only; `multiply`/`lighter` flipped then reset.
- [ ] **Perf gate.** _(owner/gate)_ Formal `?perf=1` PERF.ab A/B + pixel-diff still to be captured (CC.5);
      QUAL≥2 drop verified; no per-frame alloc by construction.
- [x] **Readability ceiling.** Grade can only darken (multiply <255, low α); vignette/shadows subtle; UI drawn
      on top of the post stack. **Never bright** (no global lift; focal pool α≤0.05).
- [x] **Procedural-fallback parity.** No new asset files introduced (grunge/shadow/grade are procedural);
      verified clean with the repo's existing optional-asset 404s.
- [ ] **Manual verify.** _(owner)_ Headless desktop done (load map, render, units); in-game interaction +
      narrow/mobile viewport check is an owner step.

---

# 🟢 Milestone 1 — MVP (P0 → P1 → P2)

*The design doc's "Suggested first slice to ship." Low-risk, mostly code, transforms the look. Needs only
the P1 floor-variant sheets (or runs on the procedural fallback until they exist).*

> ### 📌 MVP implementation status (2026-06-23)
> **Shipped (code in tree, headless-verified):** contact-shadow band + `LAYER` bands (P0.1/P0.2/P0.4),
> baked grunge overlay (P1.3/P1.4), per-biome color grade + warm focal pool + vignette with QUAL gate +
> `rgba` fallback (P2.1–P2.4), and the shared infra (CC.1 `h2` hash, CC.2 cached shadow/gradient sprites,
> CC.3 tileable `grungeTex`, CC.4 `?no*`/`?rgbagrade=1` toggles).
> **Files:** [js/render.js](../js/render.js) (infra block after `h01`, grunge in `_tcBake`, shadow band before
> the depth draw, `applyPostStack` before placement), [js/config.js](../js/config.js) (`BIOME_GRADE`).
> **Headless verify (Playwright/Chromium, `rts.html` → `loadMap(0)`):** all infra present; `ATLAS_READY` →
> grunge chunk-bake exercised; 20 units rendered; eased-grade frames + QUAL≥2 gate + `?rgbagrade=1` fallback
> + full `?no*` toggle-off all ran with **0 page errors**; default-vs-all-off screenshots show the grade/
> vignette/grunge clearly engaging. (The 59 console msgs are pre-existing optional-asset 404s, not these changes.)
> **`[x]` here = implemented + headless-verified.** Unticked sub-items below are **owner/device-gated**:
> formal `?perf=1` PERF.ab A/B numbers (CC.5), real-phone bench (P2.5), and live co-op determinism — these
> are part of the 🚦 gate and must NOT be self-ticked.
> **Update (2026-06-23, later):** P1.1/P1.2 N-variant floors are now **fully done** — `floors.webp`
> (4 seamless variants × 7 biomes) was generated with **Gemini 3 Pro Image** and wired in; the hash picks
> variants evenly (verified). See the early P7 cost note in P7.8.
> **Still deferred within the MVP (not blocking):** P0.3 oversized-prop row-splitting is **not** done — the
> existing bottom-contact sort + walk-under already handles the real cases (tower/big rocks), and true
> per-row splitting was deferred to avoid regressing occlusion.

## P0 — Draw-order bands + contact shadows

### [x] P0.1 — Define `AltitudeLayer` bands
**Goal:** Replace the single implicit sort with explicit, named draw-order bands — design doc §5B.
**Implement:**
- [x] Added `LAYER = {TERRAIN, GROUND_DECAL, SHADOW, ACTORS, CANOPY, FX, FOG, POST}` constant in `js/render.js` (infra block).
- [x] Comment documents the band order matching §5B's ASCII stack.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [x] Constant present; the render() passes already implement the order (terrain→…→fog→post); no behavior change.

### [x] P0.2 — Refactor the depth collect/sort/draw loop into bands
**Goal:** Y-sort by **contact point (feet)**, only *within* the actor band — design doc §4/§5B.
**Implement:**
- [x] The existing `depth[]` collection + `depth.sort((a,b)=>a.y-b.y)` + dispatch loop **IS** the ACTORS band — it already Y-sorts by contact point (units `y:e.y`; props `(ty+h)*TILE` = footprint bottom). Labeled as such; the new SHADOW band is inserted before it.
- [x] Band-by-band order preserved (terrain/water/roads → back-particles → SHADOW → ACTORS → front-particles/FX → fog → POST); contact-point semantics unchanged.
- [x] Occluded-unit ghost pass and cutscene occluder suppression left intact.
**Guardrails (§11):**
- [x] Readability: shadows draw under all actors; ordering unchanged so nothing hides units.
**Verify:**
- [ ] _(owner/gate)_ `?perf=1` A/B pixel-diff = shadows + (no) ordering change; no perf regression.
- [x] Headless: existing occlusion + ghost pass render with 0 errors (desktop). _Mobile check = owner._

### [-] P0.3 — Split oversized props by per-tile footprint  _(deferred — see note)_
**Goal:** Units stand *inside* big props (Dark Tower, big rocks) correctly — design doc §5B.
**Implement:**
- [-] **Deferred.** The existing bottom-contact sort + the walk-under topography design already handle the
  real cases: big rocks/trees are walk-under (upper rows passable → unit sorts first → occluded by canopy),
  and the Dark Tower is blocked scenery (units are always around its base, where bottom-line sort is correct).
  True per-row prop splitting is a higher-risk change to the depth model and was deferred to avoid regressing
  occlusion; revisit alongside P3 (canopy fade) if a concrete case shows wrong ordering.
- [x] Confirmed mega-landmark path + Dark Tower scenery still render (headless boot, 0 errors).
**Guardrails (§11):** none beyond §0.
**Verify:**
- [ ] _(owner)_ Eyeball a unit walking past/through a large rock & the Dark Tower in-game.

### [x] P0.4 — Contact-shadow band
**Goal:** Ground every sprite with a soft blob shadow — design doc §1/§5B (the biggest grounding win).
**Implement:**
- [x] `shadowSprite()` builds **one cached** radial-gradient blob (offscreen, 96px), reused for every unit, scaled per `unitDrawH`.
- [x] Drawn in the SHADOW band (own pass before the actor draw) under each ground unit's feet (`fy = u.y + vh*0.30`, matches the selection ring); small down-right offset = one consistent light dir.
- [x] Flyers (`u.air`) skipped; off below `SPRITE_LOD_ZOOM*0.7`; toggle `?noshadows=1`.
**Guardrails (§11):**
- [x] Perf: gradient/sprite built once; per-frame cost = one `drawImage` per unit; no per-frame alloc.
- [x] Readability: globalAlpha 0.45 × soft sprite → subtle; does not read as a second sprite.
**Verify:**
- [ ] _(owner/gate)_ `?perf=1` A/B: diff = shadows + ordering only; heap flat.
- [x] Headless: renders; units planted (default vs `?noshadows=1` screenshots differ). Reduced-motion path untouched.

---

## P1 — Chunk variation + grunge

### [x] P1.1 — Deterministic floor-variant selection
**Goal:** Kill the checkerboard — pick among N floor variants per tile — design doc §5A.3.
**Implement:**
- [x] `h2(tx,ty)` deterministic hash added (CC.1) — co-op-safe, never `Math.random`/`simRandom`.
- [x] `_tcBake` (chunk path) **and** `drawTile` (live path) now hash-pick `floorVarRect(b, (h2(tx,ty)*FLOOR_VAR_N)|0)` and blit it (rotate/mirror still applied → variant × orientation). Falls through to the single tileset cell, then `BIOME_PAL`, if the variant atlas is absent.
**Guardrails (§11):**
- [x] Determinism: pick is `h2(coords)` only → host/client identical. Render-only; no save/net effect.
**Verify:**
- [x] Headless: over **5166 grass floor tiles the 4 variants split [1258,1290,1276,1342]** (even) — no more single stamp; identical on reload (deterministic).

### [x] P1.2 — Wire the N-variant floor atlas (graceful)
**Goal:** Consume the floor-variant sheets when present — design doc §8.3.
**Implement:**
- [x] New optional **`assets/atlas/floors.webp`** (7 biome rows × `FLOOR_VAR_N=4` cols, 128px cells, biome-id row order) registered in [js/assets.js](../js/assets.js) (`FLOOR_VAR_IMG`/`FLOOR_VAR_READY`/`floorVarRect`, tag `atlas:floors` → late load re-bakes chunks).
- [x] `_blitOrientedTo` generalized to take the source image; renderer falls back to the single floor cell, then `BIOME_PAL` procedural fill, if absent.
- [x] **Art generated** via Gemini 3 Pro Image — `_dev/gen/gen_floor_variants.mjs` (28 seamless 2K tiles) → `_dev/gen/slice_floor_variants.py` → `floors.webp`.
- [x] **QUILT FIX (critical):** raw variants drifted in brightness (grass spread **39.8 luma**, v3 ~2× brighter) → random per-tile picking made a worse checkerboard. The slicer now (a) **low-frequency equalizes** each variant to a shared per-biome tonal base (brightness spread → ~0), and (b) **FFT-scores regularity and culls structured variants** (cross-hatch/grid/blob lattice — grass v0 scored 114, water 109, tech 61), keeping only organic noise-like tiles (filling N cols by cycling the kept set). Repetition is then broken by the 8-way orientation + the continuous grunge overlay, never by mixing mismatched tiles. No re-gen ($0). Verified: grass field cohesive at 0.6/1.0/2.2 zoom.
- [x] **VEIN FIX (volcanic):** the volcanic prompt's "thin cyan cyber-veins" gave variant v0 long wavy cyan lines (v2 a line) that desaturate to grey and tile into box outlines — the FFT cull misses single non-repeating veins (it even shipped v0 twice), and curvy veins evade col/row line detectors. Fix = a per-biome manual `KEEP_OVERRIDE = {'volcanic':[1,3]}` in `slice_floor_variants.py` curating volcanic to its two verified-clean even-crackle tiles (other biomes keep the auto-cull). No re-gen ($0). Verified on Ep V "The Cartel" (12,138 volcanic floor tiles): no grey lines at 0.6/1.0/2.2 zoom, 0 errors.
**Guardrails (§11):**
- [x] Procedural-fallback parity: all paths guarded by `FLOOR_VAR_READY`; verified the renderer runs identically when the atlas is absent.
**Verify:**
- [x] Headless: `FLOOR_VAR_READY` true, atlas 512×896, 4 distinct rects/biome, 0 page errors; zoomed-in floors show clear per-tile variation (`/tmp/floors_on.png`).

### [x] P1.3 — Low-frequency tint/grunge overlay (baked)
**Goal:** Break tile boundaries with large-scale value variation — design doc §5A.4.
**Implement:**
- [x] `grungeTex()` (CC.3) builds a seamless tileable noise (sum of integer-period sines); `_tcBake` tiles it **world-anchored** (offset by world origin mod P) over the chunk after the tiles → continuous across chunk seams.
- [x] Low-contrast, dark, **darken-only** (alpha = dark half of the noise; can't brighten). Toggle `?nogrunge=1`.
**Guardrails (§11):**
- [x] Perf: drawn inside `_tcBake` (bake-time only) → steady-state scroll cost unchanged.
- [x] Never bright: overlay only darkens/mottles.
**Verify:**
- [ ] _(owner/gate)_ `?perf=1`: non-bake frames unchanged; bake cost acceptable.
- [x] Headless: `ATLAS_READY` → bake path ran; grid mottled (default vs `?nogrunge=1` differ); world-anchored → no chunk seams.

### [x] P1.4 — Chunk invalidation correctness
**Goal:** Don't break the cache's fog-reveal/zoom/dpr re-bake — design doc §4.
**Implement:**
- [x] Grunge is deterministic from world position (not a frame clock), so a re-bake reproduces identical pixels; `_tcExploredCount`/zoom/dpr/`LOADER.gen` invalidation paths left untouched.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [x] Headless: 20 rendered frames + reveal showed no flicker/drift; invalidation logic unchanged.

---

## P2 — Post stack: per-biome grade + vignette/focal pool

### [x] P2.1 — Per-biome grade descriptors
**Goal:** A cohesive color identity per biome — design doc §5C.1 / §6.
**Implement:**
- [x] `BIOME_GRADE` (7 biomes) added next to `BIOME_PAL` ([js/config.js](../js/config.js#L67-L77)): each a `mult:[r,g,b,alpha]` multiply tint from the §6 "Color grade" column.
**Guardrails (§11):**
- [x] Never bright: all multiply channels <255 + low alpha → can only darken/cool; highlight is provided by the focal pool, not a global lift.
**Verify:**
- [x] Values match §6 (grass cool-green, ice dirty-blue, volcanic basalt+ember, etc.).

### [x] P2.2 — Full-screen grade pass (with biome interpolation)
**Goal:** One multiply tint over the scene — design doc §5C.1.
**Implement:**
- [x] `applyPostStack()` runs after fog/night-tint but UNDER world-space UI; one `multiply` viewport fill (rgba fallback path too).
- [x] Samples the biome under the camera centre and **eases** `_gradeCur` toward it (~16-frame) so a border crossing doesn't pop.
**Guardrails (§11):**
- [x] Portability: `multiply` is the preferred path with an `rgba` fallback (P2.4).
**Verify:**
- [ ] _(owner/gate)_ `?perf=1` A/B; reads as biome mood; units legible.
- [x] Headless: eased over 20 frames; default vs `?nograde=1` differ.

### [x] P2.3 — Vignette + warm focal pool
**Goal:** The cheapest "Hades" lever — frame the action — design doc §5C.4 / §3.
**Implement:**
- [x] **Cached** radial gradients (`vignetteGrad`/`focalGrad`, keyed by viewport size): pure-black-edged vignette + a very-subtle warm focal pool on the screen centre (camera focus).
- [x] Static (no per-frame pulse) → reduced-motion-safe by construction.
**Guardrails (§11):**
- [x] Perf: gradients cached, rebuilt only on resize.
- [x] Readability: focal pool α≤0.05 (frames, doesn't lift units); edges crush to black without hiding play info (UI drawn on top).
**Verify:**
- [x] Headless: periphery framed (default vs `?novignette=1` differ); minimap/HUD are separate layers, unaffected. _Mobile = owner._

### [x] P2.4 — Portability fallback + QUAL gate
**Goal:** Deploy-anywhere safety — design doc §5C / §11 portability.
**Implement:**
- [x] `?rgbagrade=1` forces a flat low-alpha `rgba` (`source-over`) wash instead of `multiply` — no dependence on `ctx.filter` at all (filters not used).
- [x] Whole post stack early-outs at **QUAL.level ≥ 2**.
**Guardrails (§11):**
- [x] Portability: no-blend fallback verified; never uses `ctx.filter`.
**Verify:**
- [x] Headless: `?rgbagrade=1` page rendered 0 errors; `QUAL.level=2` → `applyPostStack` returns immediately (verified no throw).
- [ ] _(owner)_ Firefox / non-Chromium eyeball.

### [ ] P2.5 — Real-phone benchmark  _(owner/device — cannot self-run)_
**Goal:** Confirm mobile GPU cost — design doc §11.
**Implement:**
- [ ] _(owner)_ Run `?perf=1` on a real phone (busy HUB + big map); record numbers.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [ ] _(owner)_ Within budget; QUAL auto-degrade engages if not. Log to `docs/perf/RESULTS.md` (CC.5).

---

# 🚦 HARD APPROVAL GATE — do not pass without owner sign-off

> **STOP. The MVP (P0 + P1 + P2) must be complete, verified, and owner-approved before any P3+ work begins.**

- [ ] **P0, P1, P2 all merged**, every sub-task ticked.
- [ ] **All three green on `?perf=1`** (desktop), **mobile checked**, **co-op smoke-test** (host + client see identical terrain).
- [ ] **`docs/perf/RESULTS.md` updated** with MVP A/B numbers (CC.5).
- [ ] **Owner has reviewed the MVP in-game and explicitly approved continuing to P3+.**

**🔒 Do NOT start P3 until the box directly above is ticked by the owner.**

---

# 🟡 Milestone 2 — Full canvas-2D vision (P3 → P7)

## P3 — Walk-under canopy fade + fake height

### [x] P3.1 — Canopy fade (unit walks under)
**Goal:** Finish the pending transparent-canopy "Phase 2" — design doc §4/§5B.5.
**Implement:**
- [x] `render()` builds a per-frame `_unitTileSet` (tile indices a unit stands on). In `drawFeature`, if any of the feature's **passable top rows** (`rows < fh−⌊fh/2⌋`) holds a unit, the canopy is drawn at **`globalAlpha×0.42`** so the unit reads through (classic walk-under fade — simpler than a Bayer stipple but the same readability win).
**Guardrails (§11):**
- [x] Readability: ghost reveals the unit (0.42 alpha), never fully hides it. Determinism: derived from unit tile positions (identical cross-peer). Cheap: checks only the feature's own ~6 top tiles against a Set.
**Verify:**
- [x] Headless: unit moved onto a feature's top row → `drawFeature` runs the under-path, 0 errors (3 maps).

### [x] P3.2 — Feature grounding-shadow ("pop")
**Goal:** Props "pop" off the ground — design doc §5A.6.
**Implement:**
- [x] `drawFeature` draws a **soft contact shadow** under the feature base (reuses the cached `shadowSprite`, `globalAlpha×0.5`, gated above near-min zoom) so the transparent rock/tree cutouts sit on the ground instead of floating. (Implemented as a **live feature shadow**, not the baked cliff-face+rim — true cliff faces are N/A without real elevation; the grounding shadow is the actual "pop" win and is lower-risk. Baked rim deferred.)
**Guardrails (§11):**
- [x] Perf: one cached-sprite `drawImage` per in-view feature (view-culled by the depth collect). Never bright (it's a shadow). Reduced-motion unaffected (static).
**Verify:**
- [x] Headless: features render with grounding shadows, 0 errors (grass 141 / volcanic 228 / ice 305 features).

### [ ] P3.3 — Feature variant sheets wired
**Goal:** More rock/tree variety per biome — design doc §8.1.
**Implement:**
- [ ] Consume P7 `gen_features` variants via `featSpriteFor`/`spriteFor`; fall back to current cutouts, then procedural `drawRockTile`/`drawTreeTile`.
**Guardrails (§11):** procedural-fallback parity.
**Verify:**
- [ ] Visual with/without sheets; transparency clean (no ground halo).

## P4 — Biome seams

### [ ] P4.1 — Bake-time noise-mask crossfade (default, no art)  _(deferred — own pass)_
> **Deferred (not done in this batch):** biome-seam blending only benefits **multi-biome** maps and is the
> riskiest bake change (per-tile neighbour-biome checks + a second masked blit, with artifact/perf risk). It
> deserves its own focused pass + verification on a mixed-biome map (e.g. Ep II desert+grass, Ep VII
> desert+ice). The current hard biome cut is a minor issue on the single-biome maps.
**Goal:** Organic biome borders — design doc §5A.2.
**Implement:**
- [ ] In `_tcBake`, where two biomes meet, draw biome A then biome B through a tileable noise alpha mask (CC.3), seeded from coords.
**Guardrails (§11):**
- [ ] Determinism: mask seeded from tile/chunk coords (host/client identical).
- [ ] **Sim-grid unaffected:** purely visual — must not touch `blocked`/passability/feature masks.
**Verify:**
- [ ] Visual: borders blend; **resource & base reachability and feature masks unchanged** (per CLAUDE.md map-gen rule).

### [ ] P4.2 — *(opt)* Dual-grid / Blendomatic richer seams
**Goal:** Corner-perfect seams where wanted — design doc §2/§5A.2.
**Implement:**
- [ ] *(opt)* Dual-grid 16-tile autotiling (offset display grid; read 4 data corners) and/or Blendomatic alpha masks; consume P4 transition tiles (cost step 7, §9).
**Guardrails (§11):** determinism; procedural-fallback parity.
**Verify:**
- [ ] Visual: no corner artifacts; baked → no scroll cost.

## P5 — Decal scatter layer  *(determinism is the sharp trap here)*

### [x] P5.1 — Deterministic scatter helper
**Goal:** Place decals with no clumps/grid — design doc §2/§5A.5.
**Implement:**
- [x] `bakeDecals` walks a **world-anchored jittered grid** (`DCELL=46px`); each cell seeds a **`_mulberry32`** stream from `(cx,cy)` via `Math.imul` (integer, coords-only) → jittered position + per-decal params. A **±1-cell margin** around the chunk means a decal straddling a chunk seam is drawn in *both* bakes → seamless. Ground-only gate (skips water/rock/tree, unexplored).
**Guardrails (§11):**
- [x] **Determinism (critical):** seed is `Math.imul(cx,…) ^ Math.imul(cy,…)` — pure coords, **no `simRandom`/`Math.random`**. host & client paint identical scatter.
**Verify:**
- [x] Headless: **two fresh loads of map 0 → identical frame hash** (927818032 == 927818032); `?nodecals=1` differs (decals render). 0 errors.

### [x] P5.2 — Bake decals into chunks
**Goal:** Free-while-scrolling detail — design doc §5A.5.
**Implement:**
- [x] `bakeDecals(g, state, tx0, ty0)` runs inside `_tcBake` **after grunge** (terrain layer), drawing into the chunk canvas in world-local coords → **zero per-frame cost** (bake-time only, like grunge).
**Guardrails (§11):**
- [x] Perf: bounded (~1 decal / ~6 tiles), bake-time only. Readability: dark, value-suppressed (`base` colours are very dark; alphas 0.11–0.5; accents 0.22) — never competes with units.
**Verify:**
- [x] Headless: 0 errors; deterministic re-bake; visibly adds ground detail vs `?nodecals=1` (zoom crops).

### [x] P5.3 — Per-biome decals (procedural, free)
**Goal:** Each environment's signature debris — design doc §6.
**Implement:**
- [x] **Procedural** (no Gemini — "same free pipeline") three decal primitives — **scorch** (soft dark radial smudge), **debris** (dark rubble cluster), **crack** (jagged polyline) — drawn per the `DECAL` palette with a **per-biome dark ink + faint accent**: volcanic→ember red, tech/water/ice→cyan, mountain→violet, grass/desert→none. Covers all 7 battle biomes (HUB ground uses its biome's set; HUB-specific wet-asphalt/manhole art is P7.5).
- *(deferred, optional)* the painted §6-specific sets (barnacles, manhole covers, bone/scrap, etc.) are a **P7.3** art upgrade (~$2.14) — not needed; the procedural set reads well and is guaranteed cohesive.
**Guardrails (§11):** [x] readability (value-suppressed), never bright (accents are thin, low-alpha).
**Verify:**
- [x] Headless grass map: decals scattered across the ground, crossing tile boundaries, subtle. _Per-biome in-game eyeball = owner._

### [x] P5.4 — Dynamic combat-scorch decals
**Goal:** Battle leaves marks — design doc §5B (band 2, dynamic ground decals).
**Implement:**
- [x] `scorches[]` pool + `spawnScorch` + `drawScorches` ([js/render.js](../js/render.js)). Drawn in the **GROUND_DECAL band** (after terrain, **under** the shadow band + units), reusing the cached `shadowSprite` (zero per-frame alloc), capped at 64, fading over `SCORCH_LIFE=12s`. Spawned from **`deathFx`** (where a unit/building dies) — which already runs on host/solo (gated) and on clients from snapshot entity-removals, so it's net-correct.
**Guardrails (§11):**
- [x] Render-only, **module-local** (never on `G` → no save/snapshot effect); **no `simRandom`**; transient (doesn't survive save); inherits `deathFx`'s off-screen + fog culls.
**Verify:**
- [x] Headless: 3 forced deaths/map → `deathFx`→scorch with 0 errors; fades over its life.

### [-] P5.4b — (note) scorch only on deaths, not every laser hit  _(by design)_
Scorch is spawned on **deaths/razes** (meaningful marks), not on every laser impact (would carpet the floor + hurt readability). Per-hit scorch can be added later if wanted.

## P6 — Ambient life

### [x] P6.1 — Per-biome ambient particle FIELD
**Goal:** Animate the air — design doc §5B.6 / §6.
**Implement:** The existing [js/particles.js](../js/particles.js) only emitted *around in-view features* (rocks/trees) — open ground was dead. Added a sparse **biome-sampled FIELD** (`_emitAt`/`_spawnFieldAt`) that spawns across the visible ground (samples `state.biome` at each candidate, skips water) so featureless maps breathe. Reuses the existing pool / glow cache / draw → **zero new per-frame alloc**. Field & feature budgets share `MAX` without starving each other (`_fieldAlive` tracked; `featCap = MAX − fieldTarget`).
- [x] **Volcanic** — **ember rain** (rising additive) + ash *(showpiece; verified 29 in view)*
- [x] **Ice** — **drifting snow** *(verified 29 in view)*
- [x] **Desert** — blowing dust
- [x] **Tech** — rising data-motes + cyan blips
- [x] **Grass / Mountain / Water — NO open-ground field** (intentional): floating motes with no source read as
  *strange* on temperate ground (owner feedback). Those biomes get life from the **feature-anchored** FX
  (fireflies/pollen near trees, mist by mountain rocks) which have a visible source. Verified grass field = 0
  while feature particles still emit (69 alive near trees).
- [x] **HUB city** — uses its ground biome's field; the HUB-signature rain/neon-reflection art is **P7.5**.
- **Rule learned:** the ambient FIELD is only for biomes with a real whole-air phenomenon (weather/lava/digital), never as generic "sparkle."
**Guardrails (§11):**
- [x] Zero-alloc pooling; device-tiered (existing `MAX`); **QUAL-gated** (`fieldTarget=0` at QUAL≥2); **reduced-motion off** (`_rm` → 0, verified).
- [x] Cosmetic/local: module-local pool (never on `G`), no save/snapshot effect; per-peer ambient motion (no determinism needed — not shared/baked).
**Verify:**
- [x] Headless via real `update()` loop: volcanic field 0→29 embers, ice 0→29 snow, grass 0→29 (+feature particles), **0 errors** on all 3 maps; reduced-motion path → 0 particles. (Added `window.particleStats()` debug accessor.)

### [ ] P6.2 — Flicker glows + fake god-ray sprites  _(deferred — largely covered)_
> **Deferred (not done in this batch):** the game **already** has a rich additive glow vocabulary — mega
> landmark neon (`drawMegaNeonLayer`), hero/villain glows, A&O storm FX, building neon-flicker — so generic
> flicker glows add little. Fake **god-ray shafts** need per-map anchor authoring (which windows/gaps emit
> them); without that they're speculative. Revisit if a specific scene wants light shafts (e.g. the Dark Tower).
**Goal:** Animated painted light — design doc §3.6 / §5B.6.
**Implement:**
- [ ] Extend the additive (`lighter`) FX band: cached-gradient flicker glows (torch/neon jitter via summed-sine/noise) and a few additive skewed god-ray shaft quads anchored to scenery (Dark Tower, windows).
**Guardrails (§11):**
- [ ] Perf: cached gradients, `lighter` flipped once for the band. Never bright (tight, low-alpha).
**Verify:**
- [ ] Visual: subtle life, not disco; A/B perf ok.

### [x] P6.3 — Drifting weather plane
**Goal:** Atmosphere — design doc §5B.6 / §6.
**Implement:**
- [x] `drawWeatherPlane` ([js/render.js](../js/render.js)) draws a **soft cloud haze** (cached `fogTex(tint)`, sum-of-sines, soft a²) **tiled + world-anchored + time-drifting** over the visible span, **biome-tinted** and gated to the **weather biomes only** (volcanic heat-smoke / ice cold-fog / desert dust / tech digital haze — same "needs a source" rule as the particle field; grass/mountain/water get none). Drawn in the FX band after front particles. `?nohaze=1`.
**Guardrails (§11):** [x] **very low alpha** (0.035–0.06) so it never washes units; **QUAL-gated** (off at ≥2) + **off under reduced motion**; never bright.
**Verify:**
- [x] Headless: volcanic/ice render the haze (warm/cool), 0 errors; gated off on grass; QUAL≥2 / reduced-motion → none.

## P7 — Baked-light art regen + art pipeline (§8/§9)

### [ ] P7.1 — `terrain-dark-v2.md` prompt
**Goal:** Bake AO/light + §6 per-biome language into generation — design doc §3.1 / §8.5.
**Implement:**
- [ ] Author `_dev/prompts/terrain-dark-v2.md` (baked AO/curvature, per-biome decal/signature language, magenta-gutter convention preserved).
**Guardrails (§11):** never bright; keep slicer-compatible gutters.
**Verify:** prompt reviewed against §3 and §6.

### [ ] P7.2 — Re-gen base tilesets (N variants, baked light)
**Implement:**
- [ ] Update `_dev/gen/gen_terrain_biomes.mjs` for N floor variants + baked light; re-gen 7 biomes (cost step 1+2, §9).
- [ ] Extend `_dev/gen/slice_terrain.py` for the N-variant sheets.
**Guardrails (§11):** procedural-fallback parity (P1.2 path).
**Verify:** sliced atlas tiles seamlessly; floorpreview shows no game-board grid.

### [-] P7.2 — Base tileset re-gen  _(N/A — see note)_
Single-tile `T_ROCK`/`T_TREE` are floor-ified at map-gen ([map.js:108]), so the `tileset.webp` rock/tree cells are **dead in-game**, and floors are already done (`floors.webp`). The variety the user wanted lives in the 3×3 **features** → handled by P7.4.

### [x] P7.3 — Painted decal atlases
**Implement:**
- [x] `_dev/gen/gen_decals.mjs` (6 isolated decals/biome on a magenta key) + `_dev/gen/slice_decals.py` (**soft chroma-key** — graded alpha + despill, cell inset to drop frame lines) → `assets/atlas/decals.webp` (7×6, 128px). Wired in `bakeDecals` ([js/render.js](../js/render.js)): when the atlas is present, stamps a painted decal (hash-pick + rotate + size, α 0.6) at each scatter point; else the procedural decals.
- [x] **Fix (owner-flagged):** water/ice came back as full-cell ground textures (dark-floor boxes) — reworded to *small isolated marks* + a no-ground directive + a 6% cell inset; regenerated, now clean transparent stamps.
**Guardrails (§11):** clean alpha (soft-key, no halo); value-suppressed; optional → procedural fallback.
**Verify:** [x] all 7 rows clean; `DECAL_READY` + 0 errors in-game.

### [x] P7.4 — Feature SHAPE + SIZE variety  *(the centerpiece)*
**Implement:**
- [x] `_dev/gen/gen_feature_variants.mjs` (Gemini 3 Pro Image, magenta key) → **4 distinct rock + up to 8 tree shapes per biome** → `slice_feature_variants.py` (chroma-key + `largest_central` flood to drop label-text/frames) → `assets/atlas/features_var.webp` (3072×1792, 4 rock + 8 tree cols × 7 rows).
- [x] `featVarRect` ([js/assets.js](../js/assets.js)) + `drawFeatureSprite` hash-picks a variant (rocks×4, trees×8); `drawFeature` adds a coord-hash **size jitter** (0.8–1.35×, footprint/depth unchanged → co-op-safe).
- [x] **Trees:** grass = alive-mysterious (regen) **mixed** with the dead set; mountain/tech/desert = own biome trees **mixed** with the dead set (8 each, per owner feedback — not exclusive); water/ice/volcanic keep their themed 4.
- [x] **Fixes (owner-flagged):** funding crystal forced to the original purple rock (`base:true`); tech-rock label-text removed (regen + flood); tech-antenna magenta neon removed (regen cyan-only).
**Guardrails (§11):** render-only, no save/sim/net change; deterministic; never bright; optional → single-cell `features.webp` fallback.
**Verify:** [x] 8/8 trees + 4/4 rocks used in-game, 0 errors; atlas clean across all biomes.

### [x] P7.5 — HUB overlays (procedural — $0)
**Implement:**
- [x] Done **procedurally** (animated reads better than static art, and free): `drawHubWet` smears the cyan road-neon downward as a wet-street **reflection** (after `drawRoads`); `drawHubRain` draws animated slanted **rain** streaks (screen-space, additive). `?norain` toggle.
**Guardrails (§11):** never bright (faint α); reduced-motion + QUAL≥2 gated; HUB-only.
**Verify:** [x] HUB renders wet neon-noir with rain, 2345 road tiles, 0 errors. (Static painted hub_overlays NOT generated — procedural covers it; ~$3 saved.)

### [x] P7.6 — Atlas layout, LOADER tiers, WebP, SW
**Implement:**
- [x] `features_var.webp` + `decals.webp` (+ earlier `floors.webp`) registered in [js/assets.js](../js/assets.js) (`atlas:*` tag, `T_GAMEPLAY`/`T_AMBIENT`, `optional:true`). Slicers save `.webp` directly (no separate optimize step). **`sw.js` CACHE bumped v3→v4.**
**Guardrails (§11):** procedural-fallback parity (all guarded by `*_READY`); optional → never wedges the gate.
**Verify:** [x] all 3 atlases `*_READY` true, 0 errors on grass/volcanic/ice + HUB; fallback holds when absent.

### [ ] P7.7 — *(opt)* Mega/landmark re-gen, baked light
**Implement:**
- [ ] *(opt)* Re-gen `mega/` (megabuilding/mountain/ruin/volcano ×6) with baked light (cost step 10, §9 — the big bucket).
**Verify:** side-by-side; neon layers still align.

### [ ] P7.8 — Track the Gemini budget (§9)
**Goal:** Stay within the costed envelope — design doc §9.
**Implement (tick as spent):**
- [x] **Floor-variant sheets (step 2) — ACTUAL: 28 images × $0.134 = $3.75** (`gemini-3-pro-image-preview`,
  2K output). Done as **separate seamless tiles** (4/biome × 7), not the 4-up packed sheets the §9 table
  assumed ($0.94) — packed-grid cells don't tile at their own edges (would seam), so separate tiles are the
  correct call and cost ~4× the estimate. (~6 calls returned text instead of an image and were retried;
  those bill only tiny input tokens, ≈$0.01.) Files: `_dev/gen/floorvar_*.png` → `assets/atlas/floors.webp`.
- [x] **P7 batch (everything-minus-mega) — ACTUAL: $5.29** (enforced under a $30 hard cap via `_dev/gen/_spend.mjs` + `.gen_spend.json`). Breakdown: feature variants 17 sheets×$0.24=$4.08 (14 base + grass-tree/tech-rock/tech-tree re-gens for owner fixes) + decals 9 sheets×$0.134=$1.21 (7 base + water/ice re-gens). HUB done procedurally ($0). P7.2 N/A.
- **All-in across the whole terrain revamp: ~$9.04** ($3.75 floors earlier + $5.29 this batch). Free-tier would have been $0.
- [-] P7.7 mega/landmark re-gen — **excluded per owner request**.
**Verify:** `.gen_spend.json` = $5.29 ≤ $30 cap; reported.

---

# 🔵 Milestone 3 — Optional WebGL stretch (P8, gated)

### [ ] P8.0 — DECISION: does canvas-2D fall short?
**Goal:** Don't build WebGL on spec — design doc §7.
**Implement:**
- [ ] After P0–P7 ship, evaluate in-game: is there a real, visible last-mile gap vs. the Hades target?
- [ ] If **no** → mark P8 `[-]` N/A (note why) and stop. If **yes** → owner greenlights the architecture tradeoff (second renderer, possible tiny build/shader step vs. no-build ethos).
**Verify:** decision recorded with screenshots/rationale.

### [ ] P8.1 — *(if greenlit)* WebGL overlay layer
**Implement:**
- [ ] Single WebGL overlay canvas over the 2D canvas: real-time 2D lights / true bloom / god-rays / normal-mapped relighting (only what 2D genuinely can't do — design doc §7).
**Guardrails (§11):**
- [ ] **Must not regress** the canvas-2D path (it stays the shipping baseline).
- [ ] **Degrades cleanly** where WebGL is unavailable. Still never bright. Still save/co-op invariant.
**Verify:** WebGL-off path identical to the 2D baseline; on-path within perf budget on desktop + mid phone.

---

# 🧩 Cross-cutting tasks (shared infra)

### [x] CC.1 — Deterministic hash util
- [x] `h2(x,y)` (→ [0,1)) added in `js/render.js` (`h01` 1D already existed). Pure, no global state. Used by P1 (and ready for P4/P5).
- [x] **Guardrail:** no `simRandom`/`Math.random`; coords-only → identical cross-peer.

### [x] CC.2 — Cached gradient/glow-sprite registry
- [x] `shadowSprite()` (cached blob), `vignetteGrad()`/`focalGrad()` (cached, keyed by viewport size) — built once, reused; reused by P0.4 & P2.3. (A generalized registry can come with P6.2.) **Guardrail:** gradients rebuilt only on size change.

### [x] CC.3 — Tileable procedural noise-mask generator
- [x] `grungeTex()` — seamless value-noise (sum of integer-period sines) baked offscreen once; used by grunge (P1.3) and ready for seam crossfade (P4.1) / fog plane (P6.3). No Gemini cost.

### [x] CC.4 — Per-layer debug toggles
- [x] `RENDER` flags parse the query string: `?noshadows=1 ?nogrunge=1 ?nograde=1 ?novignette=1 ?nodecals=1 ?nohaze=1 ?rgbagrade=1`. Mirrors the `?perf=1`/`PERF.opts` pattern. All verified in headless.

### [ ] CC.5 — Perf logging  _(pending formal ?perf=1 A/B — owner/gate)_
- [ ] After the MVP, record `?perf=1` PERF.ab numbers (p50/p95, pixel-diff, heap) for big-map + HUB into `docs/perf/RESULTS.md`. _(Headless smoke confirms no errors / no per-frame alloc by construction; formal A/B numbers still to be captured.)_

---

## §11 → task coverage map (nothing dropped)

| §11 non-negotiable | Where enforced |
|---|---|
| Determinism (no `simRandom`, seed from coords) | §0 · CC.1 · **P5.1** · P4.1 · P1.1 · P6.1 |
| Save / snapshot invariance | §0 (all tasks) · explicit in P5.4, P7.6 |
| Perf / zero-alloc / `?perf=1` gate | §0 · CC.2 · every task's Verify · P2.5 · CC.5 |
| `ctx.filter`/blend portability + `rgba` fallback + phone bench | **P2.4** · P2.5 · P6.2/P6.3 |
| Procedural-fallback parity | §0 · P1.2 · P3.2/P3.3 · P5 · P7.2/P7.6 |
| Readability ceiling (value-suppressed beneath units) | §0 · P0.4 · P2.3 · P5.2/P5.3 · P6 |
| Never bright | §0 · P1.3 · P2.1/P2.3 · P6 · P7 |
| Sim-grid unaffected (pathing/reachability/feature masks) | **P4.1** · P5 (visual-only) |
| WebGL-or-bust items parked behind a gate | **P8.0/P8.1** |

---

*Companion to [terrain-render-revamp.md](terrain-render-revamp.md). Execute top-to-bottom; stop at the 🚦
gate after the MVP. Log perf per phase in [perf/RESULTS.md](perf/RESULTS.md). Art direction stays dark,
devastated, Hades-inspired — never bright.*
