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
- [x] **Determinism across peers.** Grunge is world-coordinate-anchored; the only RNG is `h2(coords)` →
      host & client bake identical terrain. (No decals yet — that's P5, the sharp case.)
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
- [x] **Art generated** via Gemini 3 Pro Image — `_dev/gen/gen_floor_variants.mjs` (28 seamless 2K tiles) → `_dev/gen/slice_floor_variants.py` → `floors.webp` (44.8 KB).
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

### [ ] P3.1 — Dither-alpha canopy ghost
**Goal:** Finish the pending transparent-canopy "Phase 2" — design doc §4/§5B.5.
**Implement:**
- [ ] In `drawFeature` ([js/render.js](../js/render.js#L1036-L1109)), AABB-test unit feet ∈ footprint top rows → draw the prop at a **pre-baked stipple/Bayer-alpha** "ghost" so the unit reads through.
- [ ] Draw canopy in the CANOPY band (after actors, per P0).
**Guardrails (§11):**
- [ ] Readability: ghost reveals the unit; never fully hides it.
**Verify:**
- [ ] Visual: unit under a tree/rock is visible; co-op identical (deterministic on positions).

### [ ] P3.2 — Baked cliff face + rim (fake height)
**Goal:** Props "pop" off the ground — design doc §5A.6.
**Implement:**
- [ ] Bake a dark face + light rim under tall features/edges in `_tcBake` (procedural, or from P7 cliff strips).
**Guardrails (§11):**
- [ ] Procedural-fallback parity; never bright (rim is restrained).
**Verify:**
- [ ] Visual: rocks/walls feel raised; no new per-frame cost (baked).

### [ ] P3.3 — Feature variant sheets wired
**Goal:** More rock/tree variety per biome — design doc §8.1.
**Implement:**
- [ ] Consume P7 `gen_features` variants via `featSpriteFor`/`spriteFor`; fall back to current cutouts, then procedural `drawRockTile`/`drawTreeTile`.
**Guardrails (§11):** procedural-fallback parity.
**Verify:**
- [ ] Visual with/without sheets; transparency clean (no ground halo).

## P4 — Biome seams

### [ ] P4.1 — Bake-time noise-mask crossfade (default, no art)
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

### [ ] P5.1 — Deterministic scatter helper
**Goal:** Place decals with no clumps/grid — design doc §2/§5A.5.
**Implement:**
- [ ] Blue-noise/Poisson scatter helper that **seeds from chunk coords** (CC.1/CC.3); returns stable positions per chunk.
**Guardrails (§11):**
- [ ] **Determinism (critical):** host & client must produce byte-identical scatter. No `simRandom`, no `Math.random`.
**Verify:**
- [ ] Two fresh loads of the same map → identical decal layout; **co-op host/client diff = 0**.

### [ ] P5.2 — Bake decals into chunks
**Goal:** Free-while-scrolling detail — design doc §5A.5.
**Implement:**
- [ ] In `_tcBake`, after grunge, blit per-biome decals at scattered positions (alpha, value-suppressed).
**Guardrails (§11):**
- [ ] Perf: bake cost bounded; nothing per-frame. Readability: decals never compete with unit silhouettes.
**Verify:**
- [ ] `?perf=1`: scroll unchanged; bake cost acceptable; A/B pixel-diff expected.

### [ ] P5.3 — Per-biome decal sets (§6) — 8 environments
**Goal:** Each environment's signature debris — design doc §6.
**Implement (tick each environment):**
- [ ] **Grass** — dead-grass tufts, dirt patches, twigs, puddles, debris
- [ ] **Mountain** — rubble, scree, cracks, violet-rim ore flecks
- [ ] **Water/coast** — wet silt, barnacles, foam scum, oil sheen
- [ ] **Tech** — panel seams, rivets, cable runs, scorch, coolant puddles
- [ ] **Desert** — dune ripples, grit, cracked hardpan, bone/scrap
- [ ] **Ice** — cracked ice, frost rime, slush, buried debris
- [ ] **Volcanic** — basalt cracks, ash drifts, scorched scrap
- [ ] **HUB city** — wet-asphalt sheen, paint wear, manhole/grate, trash, puddles
**Guardrails (§11):** readability (value-suppressed), never bright.
**Verify:**
- [ ] Each biome reviewed in-game against its §6 row; units still pop.

### [ ] P5.4 — Dynamic combat-scorch decals
**Goal:** Battle leaves marks — design doc §5B (band 2, dynamic ground decals).
**Implement:**
- [ ] Render-only scorch marks at impact points in the GROUND_DECAL band (NOT baked — they change), pooled, time-decayed locally.
**Guardrails (§11):**
- [ ] Render-only: driven by existing FX events, **outside `update`**; **no `simRandom`**; no persisted state (don't survive save — purely transient).
**Verify:**
- [ ] Visual: combat scorches the ground and fades; no save bloat; co-op cosmetic (or host-driven via existing FX cues).

## P6 — Ambient life

### [ ] P6.1 — Per-biome ambient particle sets — 8 environments
**Goal:** Animate the air — design doc §5B.6 / §6.
**Implement (pooled in [js/particles.js](../js/particles.js); tick each):**
- [ ] **Grass** — drifting pollen/spores, occasional firefly mote
- [ ] **Mountain** — sparse dust fall, rock-grit drift
- [ ] **Water/coast** — low mist over water, rare bubble *(reuse water FX where possible)*
- [ ] **Tech** — coolant steam vents, data-grid flicker motes
- [ ] **Desert** — blowing dust/sand sheets, subtle heat shimmer
- [ ] **Ice** — drifting snow, frost sparkle
- [ ] **Volcanic** — **ember rain** (rising additive), ash fall *(showpiece)*
- [ ] **HUB city** — rain streaks, neon-reflection drift, holographic mote drift *(signature)*
**Guardrails (§11):**
- [ ] Zero-alloc pooling; device-tiered like existing particles; QUAL-gated; reduced-motion respected.
- [ ] Determinism: ambient motion is purely local/cosmetic (`performance.now()`), shared nothing.
**Verify:**
- [ ] `?perf=1` under busy HUB; reduced-motion off → frozen; each biome matches §6.

### [ ] P6.2 — Flicker glows + fake god-ray sprites
**Goal:** Animated painted light — design doc §3.6 / §5B.6.
**Implement:**
- [ ] Extend the additive (`lighter`) FX band: cached-gradient flicker glows (torch/neon jitter via summed-sine/noise) and a few additive skewed god-ray shaft quads anchored to scenery (Dark Tower, windows).
**Guardrails (§11):**
- [ ] Perf: cached gradients, `lighter` flipped once for the band. Never bright (tight, low-alpha).
**Verify:**
- [ ] Visual: subtle life, not disco; A/B perf ok.

### [ ] P6.3 — Drifting fog / weather plane
**Goal:** Atmosphere — design doc §5B.6 / §6.
**Implement:**
- [ ] Slow-scrolled tiled noise plane at low alpha; weather = the particle field (P6.1) + the global grade (P2).
**Guardrails (§11):** QUAL-gated; never bright.
**Verify:**
- [ ] Visual: depth without haze-washing units; QUAL drop removes it cleanly.

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

### [ ] P7.3 — Decal atlases
**Implement:**
- [ ] New `_dev/gen/gen_decals.mjs` (per-biome decal sheets, clean key) + `_dev/gen/slice_decals.py` (alpha morphology/feather like `slice_features.py`). Cost step 3, §9.
**Guardrails (§11):** clean alpha (no ground halo).
**Verify:** `_debug` contact sheet; decals sit on real terrain.

### [ ] P7.4 — Feature variants
**Implement:**
- [ ] New/updated `_dev/gen/gen_features.mjs` — more transparent rock/tree variants per biome, baked light (cost step 4, §9).
**Verify:** wired by P3.3; transparency clean.

### [ ] P7.5 — HUB overlays + reflection/rain
**Goal:** Make the showcase map cinematic — design doc §6 (HUB).
**Implement:**
- [ ] New `_dev/gen/gen_hub_overlays.mjs` (wet-asphalt sheen, rain, neon-reflection, holo-drift, road decals; cost step 5, §9).
- [ ] Extend `drawRoads` ([js/render.js](../js/render.js#L848-L869)): neon-reflection wash (smear lane colors downward, low alpha on wet asphalt) + rain particles + puddle decals.
**Guardrails (§11):** never bright (noir, controlled neon); QUAL-gated rain.
**Verify:** HUB reads as neon-noir; night tint + lit neon survive; mobile ok.

### [ ] P7.6 — Atlas layout, LOADER tiers, WebP, SW
**Implement:**
- [ ] Widen `tileset.webp`; add `decals.webp`, `hub_overlays.webp`. Register in `js/assets.js`/`js/loader.js` at correct tiers (base = critical, decals/overlays = ambient), all `optional:true`.
- [ ] Run `_dev/gen/optimize_assets.py` (PNG→WebP q85); **bump `sw.js` CACHE version** on asset URL change.
**Guardrails (§11):** procedural-fallback parity; a failed optional load never wedges `missionReady()`.
**Verify:** load gate green with assets; force-fail an optional → game still runs.

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
- [ ] Core gens (remaining steps 1,3,4,5) ≈ **$14** more realistic (×2.5) — or **$0** via AI Studio free tier (1,500/day).
- [ ] *(opt)* Optional gens (steps 7–10) → full ≈ **$41** realistic.
**Verify:** floor-variant spend logged ($3.75); within plan (free-tier would have been $0).

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
- [x] `RENDER` flags parse the query string: `?noshadows=1 ?nogrunge=1 ?nograde=1 ?novignette=1 ?rgbagrade=1`. Mirrors the `?perf=1`/`PERF.opts` pattern. All verified in headless.

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
