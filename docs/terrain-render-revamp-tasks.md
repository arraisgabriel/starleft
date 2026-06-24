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
Guardrails add to them, never replace them.

- [ ] **Cosmetic / render-only.** The change runs in the render path, **outside `update(G,dt)`**. No
      gameplay state is mutated. **No `simRandom`** anywhere in the visual code.
- [ ] **Determinism across peers.** Any randomness is seeded from **tile/chunk coordinates** (or
      `performance.now()` for purely-local non-shared motion), so host & client paint identically.
- [ ] **Save invariance.** No new persisted fields; **no `js/save.js` change**; no snapshot/net-shape
      change in `js/net/sync.js`. New visuals derive from existing `tiles`/`biome`/`variant`/`feat` + hashes.
- [ ] **All three sim paths hold** (solo / host / client). Client gains **no** gameplay mutation; visual
      layers run for all three.
- [ ] **Zero per-frame allocation.** Particles pooled; **gradients/glow sprites cached** (never
      `createRadialGradient` per particle/frame); batch by blend mode (`lighter` flipped once).
- [ ] **Perf gate.** Passes `?perf=1` PERF.ab A/B with an expected, justified pixel-diff; no new jank on
      big maps + busy HUB; respects **QUAL** (heavy passes drop at QUAL ≥ 2).
- [ ] **Readability ceiling.** Detail/atmosphere stays **value-suppressed beneath units**; a unit must
      never get lost against the floor. **Never bright.**
- [ ] **Procedural-fallback parity.** New atlases are `optional:true`; if a sheet 404s the procedural path
      still looks acceptable (mobile/GitHub-Pages safe).
- [ ] **Manual verify.** Per CLAUDE.md: load a map, select units, move/attack/gather, place a building,
      train a unit; check desktop **and** a narrow/mobile viewport.

---

# 🟢 Milestone 1 — MVP (P0 → P1 → P2)

*The design doc's "Suggested first slice to ship." Low-risk, mostly code, transforms the look. Needs only
the P1 floor-variant sheets (or runs on the procedural fallback until they exist).*

## P0 — Draw-order bands + contact shadows

### [ ] P0.1 — Define `AltitudeLayer` bands
**Goal:** Replace the single implicit sort with explicit, named draw-order bands — design doc §5B.
**Implement:**
- [ ] Add a band-order constant in `js/render.js` (e.g. `LAYER = {TERRAIN, GROUND_DECAL, SHADOW, ACTORS, CANOPY, FX, FOG}`).
- [ ] Document the intended order in a comment matching §5B's ASCII stack.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [ ] Constant referenced by P0.2; no behavior change yet (pure scaffolding).

### [ ] P0.2 — Refactor the depth collect/sort/draw loop into bands
**Goal:** Y-sort by **contact point (feet)**, only *within* the actor band — design doc §4/§5B.
**Implement:**
- [ ] Refactor the `depth.push({...})` collection + `depth.sort()` + dispatch loop ([js/render.js](../js/render.js#L350-L444)) so each item carries a band id.
- [ ] Draw band-by-band; inside the actor band sort by ground-line/contact-point Y (keep current `(ty+h)*TILE` semantics).
- [ ] Preserve existing occluded-unit ghost pass and cutscene occluder suppression.
**Guardrails (§11):**
- [ ] Readability: ordering must not hide units behind terrain/decals.
**Verify:**
- [ ] `?perf=1` A/B: pixel-diff limited to intended ordering changes; no perf regression.
- [ ] Visual: existing occlusion (units behind buildings/canopy) still correct, desktop + mobile.

### [ ] P0.3 — Split oversized props by per-tile footprint
**Goal:** Units stand *inside* big props (Dark Tower, big rocks) correctly — design doc §5B.
**Implement:**
- [ ] For props whose footprint spans multiple tiles, sort sub-rows so actors interleave by contact point.
- [ ] Confirm mega-landmark path ([js/megasprites.js](../js/megasprites.js#L353-L408)) and Dark Tower scenery still render.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [ ] Visual: a unit walking past/through a large rock & the Dark Tower occludes/reveals correctly.

### [ ] P0.4 — Contact-shadow band
**Goal:** Ground every sprite with a soft blob shadow — design doc §1/§5B (the biggest grounding win).
**Implement:**
- [ ] Build **one cached** radial-gradient blob-oval sprite (offscreen), reused for all sprites (scale per unit size).
- [ ] Draw it in the SHADOW band under each unit/prop's feet, single consistent light direction.
- [ ] Skip for flyers / dim under fog-explored.
**Guardrails (§11):**
- [ ] Perf: gradient built once, never per-frame; pooled draw.
- [ ] Readability: low-alpha, soft — must not read as a second sprite or muddy unit feet.
**Verify:**
- [ ] `?perf=1` A/B: diff = shadows + ordering only; no alloc growth (heap flat).
- [ ] Visual: units look planted, not floating; reduced-motion unaffected.

---

## P1 — Chunk variation + grunge

### [ ] P1.1 — Deterministic floor-variant selection
**Goal:** Kill the checkerboard — pick among N floor variants per tile — design doc §5A.3.
**Implement:**
- [ ] Add a deterministic `hash(tx,ty)` (see CC.1) → variant index; extend `blitTileOriented` ([js/render.js](../js/render.js#L700-L712)) / `_tcBake` ([js/render.js](../js/render.js#L731-L748)) to pick variant + keep rotate/mirror.
- [ ] Keep the single-cell path as fallback when only 1 variant exists.
**Guardrails (§11):**
- [ ] Determinism: variant chosen from coords only (identical on host/client); **not** `Math.random`/`simRandom`.
**Verify:**
- [ ] Visual: large fields no longer read as a repeated stamp; same on reload (deterministic).

### [ ] P1.2 — Wire the N-variant floor atlas (graceful)
**Goal:** Consume the P7 floor-variant sheets when present — design doc §8.3.
**Implement:**
- [ ] Extend `spriteFor`/SPRITES lookup ([js/assets.js](../js/assets.js)) to expose N floor cells per biome.
- [ ] Fall back to the existing single floor cell, then to the `BIOME_PAL` procedural fill, if absent.
**Guardrails (§11):**
- [ ] Procedural-fallback parity: looks acceptable with 0 sheets loaded.
**Verify:**
- [ ] Visual with sheets present and with them force-disabled (mobile 404 sim).

### [ ] P1.3 — Low-frequency tint/grunge overlay (baked)
**Goal:** Break tile boundaries with large-scale value variation — design doc §5A.4.
**Implement:**
- [ ] Generate a tileable procedural noise/gradient (see CC.3); in `_tcBake` draw ONE stretched `drawImage` over the whole chunk after tiles.
- [ ] Keep it low-contrast, biome-tinted, dark.
**Guardrails (§11):**
- [ ] Perf: baked into the chunk → steady-state scroll cost unchanged.
- [ ] Never bright: overlay only darkens/mottles.
**Verify:**
- [ ] `?perf=1`: scroll (non-bake) frames unchanged; bake cost acceptable.
- [ ] Visual: grid boundaries dissolve; no seams between chunks.

### [ ] P1.4 — Chunk invalidation correctness
**Goal:** Don't break the cache's fog-reveal/zoom/dpr re-bake — design doc §4.
**Implement:**
- [ ] Confirm variant + grunge are deterministic per chunk so re-bake is stable; verify `_tcExploredCount`/gen invalidation still triggers correctly.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [ ] Reveal fog / zoom / change dpr → chunks re-bake without flicker or drift.

---

## P2 — Post stack: per-biome grade + vignette/focal pool

### [ ] P2.1 — Per-biome grade descriptors
**Goal:** A cohesive color identity per biome — design doc §5C.1 / §6.
**Implement:**
- [ ] Add grade descriptors next to `BIOME_PAL` ([js/config.js](../js/config.js#L67-L77)): multiply-tint color + highlight color/alpha per biome, from the §6 table.
**Guardrails (§11):**
- [ ] Never bright: tints cool/desaturate shadows; highlight is restrained.
**Verify:**
- [ ] Values reviewed against §6 per-biome "Color grade" column.

### [ ] P2.2 — Full-screen grade pass (with biome interpolation)
**Goal:** One multiply tint + highlight split over the scene — design doc §5C.1.
**Implement:**
- [ ] After the world is drawn, before/after fog as appropriate, apply the grade as 1–2 viewport fills.
- [ ] Interpolate descriptor by the dominant biome under the camera (smooth across transitions).
**Guardrails (§11):**
- [ ] Portability: `multiply`/`soft-light` only as the preferred path (see P2.4).
**Verify:**
- [ ] `?perf=1` A/B; reads as the biome's mood; units still legible.

### [ ] P2.3 — Vignette + warm focal pool
**Goal:** The cheapest "Hades" lever — frame the action — design doc §5C.4 / §3.
**Implement:**
- [ ] **Cached** radial gradients: pure-black-edged vignette + a warm focal pool centered on camera/selection focus.
- [ ] Slow, subtle; respect reduced-motion.
**Guardrails (§11):**
- [ ] Perf: gradients cached, rebuilt only on viewport resize.
- [ ] Readability: focal pool brightens *framing*, not units; edges crush to black without hiding play info.
**Verify:**
- [ ] Visual: periphery reads framed; minimap/HUD unaffected; mobile viewport ok.

### [ ] P2.4 — Portability fallback + QUAL gate
**Goal:** Deploy-anywhere safety — design doc §5C / §11 portability.
**Implement:**
- [ ] If blend-mode/`ctx.filter` path is unavailable/slow, fall back to a flat low-alpha `rgba` wash.
- [ ] Gate the whole post stack on **QUAL**: drop entirely at QUAL level ≥ 2.
**Guardrails (§11):**
- [ ] Portability: verified no-filter path; never depends on `ctx.filter` being correct.
**Verify:**
- [ ] Firefox / non-Chromium: fallback engages, still looks acceptable.
- [ ] QUAL forced to 2 → post stack off, no cost.

### [ ] P2.5 — Real-phone benchmark
**Goal:** Confirm mobile GPU cost — design doc §11.
**Implement:**
- [ ] Run `?perf=1` on a real phone (busy HUB + big map); record numbers.
**Guardrails (§11):** none beyond §0.
**Verify:**
- [ ] Within budget on device; QUAL auto-degrade kicks in if not. Log to `docs/perf/RESULTS.md` (CC.5).

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
- [ ] Core gens (steps 1–6) ≈ **$18** realistic (×2.5) — or **$0** via AI Studio free tier (1,500/day).
- [ ] *(opt)* Optional gens (steps 7–10) → full ≈ **$41** realistic.
- [ ] Note actual attempts/spend per step here.
**Verify:** spend logged; within plan.

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

### [ ] CC.1 — Deterministic hash util
- [ ] Add `hash(tx,ty)` / `hash2(a,b)` (integer hash → [0,1)) for variant/scatter/mask seeding. Pure, no global state. Used by P1, P4, P5.
- [ ] **Guardrail:** never wraps `simRandom`/`Math.random`; identical output cross-peer.

### [ ] CC.2 — Cached gradient/glow-sprite registry
- [ ] Add a small registry that builds & caches radial/linear gradients and glow sprites once (keyed), reused by P0.4, P2.3, P6.2. **Guardrail:** rebuild only on resize/dpr change.

### [ ] CC.3 — Tileable procedural noise-mask generator
- [ ] Generate seamless value-noise tiles (offscreen, baked) for grunge (P1.3), seam crossfade (P4.1), fog plane (P6.3). No Gemini cost.

### [ ] CC.4 — Per-layer debug toggles
- [ ] Add `?` query toggles / `RENDER.flags` to switch each new layer on/off (shadows, grunge, decals, grade, ambient) for A/B and bug isolation. Mirror the existing `?perf=1`/`PERF.opts` pattern.

### [ ] CC.5 — Perf logging
- [ ] After each phase, record `?perf=1` A/B numbers (p50/p95, pixel-diff, heap) in `docs/perf/RESULTS.md`, big-map + HUB scenes.

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
