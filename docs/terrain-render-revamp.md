# STARLEFT — Terrain / Topography / World-Render Revamp

> **Design + research document.** Goal: make STARLEFT's world as detailed and *alive* as Hades / Hades II
> maps, in a **dark, devastated cyberpunk** palette (never bright), without breaking the no-build /
> canvas-2D / save-compatible / co-op-deterministic contracts the game runs on.
>
> Status: **design-only.** Nothing here is built yet. Section 10 is the phased build roadmap to execute next.
> Grounded in (a) a full read of the live render/terrain/art-pipeline code and (b) a 6-dimension,
> adversarially-fact-checked web-research sweep of Hades and acclaimed 2.5D games (hallucinated
> attributions dropped — see §2).

---

## 1. Executive summary

**The gap.** STARLEFT's water is genuinely alive (depth ramp + caustics + tide, [js/water.js](../js/water.js)),
but the **ground, topography, and atmosphere are flat and sparse**. Floors are a single per-biome atlas
cell stamped across the map, broken only by an 8-way rotate/mirror ([blitTileOriented](../js/render.js#L700-L712))
and one `variant` float, with a thin procedural "deco" pass of a few strokes per biome
([drawFloorDeco](../js/render.js#L800-L839)). Next to Hades — whose floors carry many hand-layered detail
passes, baked lighting, focal framing, and constant ambient motion — the world reads as a tech demo of a
tile engine rather than a place.

**The core insight from the research.** Hades does **not** have a runtime lighting engine you can mimic.
Its floors look alive because **the light is painted *into* the art offline** (ambient occlusion,
curvature, thickness baked into thousands of pre-lit 2D frames), composed in **layers** with **pure-black
edges** that frame the play space, in **one dominant palette per biome**, with **motion supplied by
authored flipbooks + heavy additive particles** (32k+ FX frames in Hades 1). The "alive" feeling is
art-direction and compositing, not shaders. That is *good news* for a canvas-2D game: most of the look is
reachable with **baked art + cheap compositing tricks**, and only the last mile needs WebGL.

**The headline moves.**
1. **Ground every sprite** with a soft contact shadow and replace the single global depth sort with
   explicit draw-order bands (the cheapest correctness + depth win).
2. **Kill the checkerboard** with hash-driven tile variation + a low-frequency grunge overlay baked into
   the existing chunk cache (≈ free while scrolling).
3. **Grade the whole frame** per biome — a multiply tint + a vignette/warm-focal-pool — the cheapest lever
   that reads as "Hades."
4. **Scatter detail** — a deterministic blue-noise decal layer (debris/cracks/scorch/foliage) baked per
   chunk, seeded from chunk coords so co-op stays in sync.
5. **Animate the air** — per-biome ambient particles, flicker glows, fake god-rays, drifting fog.
6. **Bake the light into the art** — the real Hades secret — by re-generating tilesets/features/props with
   AO and lighting pre-baked via the existing Gemini → slice → WebP pipeline.

All of layers 1–5 are **render-only and cosmetic** — no save-format change, no snapshot-packing change, no
gameplay-grid change. The whole *new art* bill is **~$18 (core) to ~$41 (everything)** on the paid Gemini
3 Pro Image API, or effectively **$0** via the free tier (§9).

**Engine path.** A **canvas-2D-first** design reaches ~80% of the target. Because the owner is open to
bigger changes, §7 also specs an **optional WebGL post-processing layer** for the final mile (real-time 2D
lights, true bloom, god-rays) — explicitly a stretch goal that must not regress the canvas-2D path.

---

## 2. Reference study — techniques & sources

Six research dimensions were each **adversarially fact-checked**; attributions that didn't survive are
flagged here so we don't build on a myth.

### Verified, adopt
| Technique | Origin / source | What it gives us |
|---|---|---|
| **Baked AO / lighting into 2D art** | Hades (Art of Hades, Jen Zee interviews; *gamedeveloper.com*); also Don't Starve, Songs of Conquest | The single biggest fidelity lever; zero runtime cost. |
| **Layered painted composition + pure-black framing edges** | Hades; Blade Runner "pools of light" (Deakins, confirmed quote) | Depth + readability + mood without a camera/3D. |
| **Strong dark linework lets you splash accent color** | Darkest Dungeon (art-director quote, confirmed) | How to stay dark yet readable with neon accents. |
| **Dual-grid autotiling (16 tiles = marching squares)** | Oskar Stålberg (origin); [RedBlobGames](https://www.redblobgames.com/) writeup | Corner-perfect biome borders from 16 tiles vs 47. |
| **AoE2 "Blendomatic" alpha-mask terrain seams** | openage reverse-engineering docs — **9 modes / 31 masks** | The richest possible seam blends (priority-ordered). |
| **Poisson-disc / blue-noise decal scatter** | Factorio decoratives (FFF-358); Sean Barrett & demofox blue-noise point sets (primary) | Detail scatter with no clumps and no grid. |
| **`AltitudeLayer` draw-order bands** | RimWorld (`Verse/AltitudeLayer.cs`, enum confirmed real) | Deterministic layering; kills "corpse over building" bugs. |
| **Hi-res dynamic light over lower-res art** | Children of Morta (4× HD art under hi-res lights) | The cheap way to "light" pixel art (note: real version is WebGL). |
| **Parallax + dark out-of-focus foreground occluders; additive/multiply fake lighting; baked DoF** | Ori (GDC 2015 notes, primary) | Framing & depth via foreground, not geometry. |
| **Composite/blend-mode tricks** (`lighter`, `destination-out`, radial gradients) | MDN `globalCompositeOperation` / `createRadialGradient` | The canvas-2D toolbox for glow, light-holes, vignette. |

### Flagged / corrected (do **not** cite these as Hades)
- **Froxel fog, SDF shoreline ripples, SH volumetric lightmaps, "pondering orbs"** → these are **COCOON**
  (Mikkel Svendsen's *"Pondering Orbs"* talk), **not Hades**. Excluded.
- **Per-sprite normal maps** and a literal **"warm-focal-pool shader"** are **unattributed to Hades** —
  use them as generic design patterns, not as "what Hades does."
- **"Asphodel = saturated red"** is a mislabel (Asphodel is the green/blue break). Don't lean on it.
- **Songs of Conquest** lightmap-camera detail is **medium confidence** (80.lv, no vendor tech talk).
- **Children of Morta "volumetric god rays + normal maps"** claim = **doubtful** (video-title only); the
  4×-art-under-hi-res-light part is solid.
- **Factorio** two-pass hazard-concrete trick is **FFF-214, not FFF-199** (both FFF pages 403'd → second-hand).

### Needs WebGL / out of scope (see §4)
Real-time per-pixel normal-map relighting (Dead Cells / Children of Morta look), Hades 2's real-time 3D
characters, true radial-blur god rays (GPU Gems 3 ch.13), Project Zomboid Build-42 depth buffer.

---

## 3. The "Hades formula" distilled

What specifically makes Hades floors and worlds look alive — the things to actually steal:

1. **Lighting is baked, not real-time.** AO / curvature / thickness are rendered into the pixels offline.
   The floor already contains its light. There is no live lighting system "making it feel alive" — the art does.
2. **Layered painted composition, not tiling.** Backgrounds are stacked painted planes; depth and
   readability are built *compositionally* (foreground framing, focal-accent placement).
3. **Pure-black edges sculpt volume *and* frame the play space.** The arena periphery crushes to black —
   oppressive mood *and* it isolates and legibilizes the combat floor, pushing detail to the rim.
4. **One dominant palette per biome.** Each region reads instantly from a single cohesive hue family;
   depth comes from value/saturation *within* a few hues, not from adding more hues.
5. **Motion = authored 2D frame-animation + particle FX**, not procedural sim. Flowing lava, embers,
   flicker, foliage are hand-painted flipbooks plus heavy additive particle layering (32k+ FX frames).
6. **Animated painted light over flat areas.** Hex light-halos and saturated highlights animate additively
   across otherwise-flat paint — cheap, high-impact "life."
7. **Small unscripted moments sell "alive."** A drip, a flicker, a drifting mote. Cheap to fake, big payoff.
8. **Readability beats art-for-its-own-sake — and this is load-bearing for us.** Hades 2 itself drew
   complaints that small enemies get lost on busy floors. **STARLEFT is an RTS with many small units; unit
   legibility is a hard ceiling on floor detail.** Every detail layer must be value-suppressed relative to units.

*[design pattern, not documented Hades]* **Warm focal pool vs. cool/black surround** is the cheapest
single "feels-like-Hades" lever available in canvas: two gradient fills.

---

## 4. Current STARLEFT render audit

### What's there (and good)
- **Top-down orthographic**, `TILE=32`, smooth zoom/pan, **depth-sorted sprite classes**
  ([render.js:350-444](../js/render.js#L350-L444)) — mega, building, feature, goldmine, unit, echo, NPC,
  drawn Y-sorted for pixel-correct occlusion.
- **8×8 terrain chunk cache** ([renderTerrainChunks](../js/render.js#L751-L772)): static atlas tiles baked
  to an offscreen canvas once, re-baked only on zoom/dpr/map change or fog reveal. **Water and procedural
  tiles draw live on top.** This is the seam we exploit: anything *baked* is ~free while scrolling.
- **Alive water** ([js/water.js](../js/water.js)): distance-to-shore depth ramp, caustics, Almeros
  height-field tide (desktop) / analytic swell (mobile), device-tiered, zero per-frame alloc.
- **Additive FX vocabulary already in place**: laser bolts, heal beams, hero/villain **neon glow layers**
  ([drawMegaNeonLayer](../js/megasprites.js#L353-L408)), A&O storm FX, all via `globalCompositeOperation='lighter'`.
- **Ambient particles** ([js/particles.js]) pre-allocated and device-tiered; **idle breathing/fidget** on units.
- **2-pass fog of war** ([drawFog](../js/render.js#L1997-L2022)): unexplored black + explored dim, union-filled.
- **Perf scaffold**: `?perf=1` **PERF.ab** A/B harness with pixel-diff gate ([js/perf.js]); **QUAL**
  adaptive quality auto-degrade ([js/quality.js]); minimap cache; **zero-per-frame-allocation** discipline.

### What's missing (the gap)
- **Floors:** one tile per biome → reads as a stamp. `drawFloorDeco` adds only a few strokes; no decals,
  no variation beyond rotate/mirror, no grunge, no baked light.
- **No contact shadows** under units/props → everything floats; no grounding.
- **No biome blending** — biome borders are hard tile cuts.
- **No atmosphere/post** — no vignette, no focal light, no color grade, no film grain, no ambient air.
- **Topography** is opaque (transparent-canopy "Phase 2" still pending) and snapped to a lattice; trees/
  rocks are always walk-under blockers, never pure scenic deco.
- **Depth sort is one global sort by ground-line Y** — works, but has no explicit bands, so new layers
  (decals, shadows, canopy ghosts) have nowhere clean to slot in.

### Hard constraints the revamp must hold
- **No build step, no ES modules, single global scope** (CLAUDE.md). Canvas 2D.
- **Save compatibility is mandatory** ([js/save.js]) — render-only layers add no persisted state.
- **Three sim paths** (solo / host / client): cosmetic render layers run for all three; **client must not
  gain gameplay mutations.** Anything random must be **render-only, outside `update(G,dt)`, never
  `simRandom`** — see the determinism rule in §11.
- **Mobile + GitHub Pages deploy**: `ctx.filter` and exotic blend modes are unreliable off-Chromium and
  can be slow on mobile GPUs → always keep an `rgba` fallback, gate behind QUAL, benchmark on a real phone.
- **Procedural fallback parity**: assets are optional; if a sheet fails to load the procedural path must
  still look acceptable.
- **Art direction: never bright.**

---

## 5. The layered terrain stack (A/B/C model)

Meta-principle: **sim grid ≠ visual grid.** None of this touches pathing, placement, fog logic, snapshot
packing, or `save.js`. The stack splits across three cost zones aligned to the existing chunk-cache vs.
live boundary.

### A. Baked into the chunk cache (cost paid once; free while scrolling)
Extends [_tcBake / renderTerrainChunks](../js/render.js#L731-L772). Bake order, bottom → top:

1. **Base terrain fill** — the biome floor cell (as today).
2. **Material seams** — dual-grid 16-tile edges *and/or* a **bake-time noise-mask crossfade** (draw biome
   A, then biome B through a tileable noise alpha mask) for organic, non-repeating borders. Blendomatic
   alpha masks where the richest seams are wanted.
3. **Per-tile variation** — hash `(tx,ty)` → pick among N floor variants + rotate/mirror (extends the
   existing `variant`/`blitTileOriented` path to *N* tiles instead of 1). Kills the checkerboard for ~free.
4. **Low-frequency tint/grunge** — one big stretched noise/gradient `drawImage` over the whole chunk. The
   biggest "not-a-grid" win per byte; breaks tile boundaries with large-scale value variation.
5. **Decal layer** (separate, per-biome toggle) — blue-noise/Poisson-placed debris, cracks, scorch,
   foliage tufts, stains, vents. **Seeded from chunk coords** so host and client bake identical decals.
6. **Baked cliff faces + rim highlights** (fake height) and **static AO / contact darkening** where terrain
   meets walls/features.

> Cost note: A leaves steady-state scroll cost essentially unchanged — it's all in the bake, which already
> only fires on reveal/zoom. The decal and grunge passes add a few `drawImage`s per chunk *at bake time*.

### B. Per-frame, in ordered draw bands
Replace the single global sort ([render.js:411-444](../js/render.js#L411-L444)) with named bands
(RimWorld `AltitudeLayer` model). Y-sort by **contact point (feet)**, not bounding box, and only *within*
the unit/prop bands. Oversized props (Dark Tower, big rocks) split per-tile footprint so units stand
"inside" them correctly.

```
1. Chunk terrain blits ............ (the baked cache from A)
2. Dynamic ground decals .......... combat scorch, road wear (not bakeable — they change)
3. Contact shadows ................ OWN band, under all units: cached blob oval, one light dir
4. Units & props .................. Y-sort on contact point; big props split by footprint
5. Walk-under canopy / overhangs .. drawn AFTER units; dither-alpha "ghost" when feet-in-footprint
6. Additive FX band ............... set 'lighter' ONCE: flicker glows, god-ray sprites,
                                    ambient particles, weather — then reset
7. Fog of war ..................... existing 2-pass; can double as a darkness-mask light-hole layer
```

> Cost note: B adds ~one cached blob-oval blit per visible unit and ~one ghost-blit per occluded prop.
> Both are cheap; the blob gradient is cached once, never rebuilt per frame.

### C. Full-screen post stack (after the scene; QUAL-gated; A/B'd via `?perf=1`)
Each step is 1–2 viewport fills. In order:

1. **Per-biome color grade** — a `multiply` tint (cool/desaturate shadows) + a `screen`/`soft-light`
   highlight split, descriptors interpolated across biome transitions. *Fallback: flat low-alpha `rgba`
   wash where blend modes are unreliable.*
2. **Pseudo-bloom** — draw the emissive layer (neon, lava, glows) into a ¼-res buffer, blur, composite
   back with `lighter`. *No-blur fallback off-Chromium: multi-draw a scaled buffer.*
3. **Light shafts (optional)** — a few additive skewed gradient quads from windows/gaps (the BR
   "pools of light"), slow-pulsed.
4. **Vignette + warm focal pool** — colored radial gradients, pure-black edges, centered on the
   selection/camera focus. The cheapest "Hades" lever (two fills).
5. **Film grain** — cycle 3–6 **pre-baked** noise tiles at low alpha (`soft-light`, α ≈ 0.03–0.08).
   **Never** per-frame `getImageData`.

> Cost note: C ≈ five viewport fills. These are the only `ctx.filter`-dependent passes; all are QUAL-gated
> and pixel-diff-verified. Drop the whole stack at QUAL level ≥ 2 for free.

### Cost discipline (applies everywhere)
Pool every particle. **Cache every gradient/glow sprite** — never `createRadialGradient` per particle or
per frame. Batch by blend mode (flip `lighter` once, draw all additive, flip back). Everything new must
pass the existing `?perf=1` pixel-diff/perf gate before it ships.

---

## 6. Per-biome + HUB art/FX bible

Each environment gets a **dominant palette** (already in [BIOME_PAL](../js/config.js#L67-L75)), a **decal
set**, a **particle set**, a **color-grade tint**, and **one "signature alive element."** Moods are mapped
to the campaign's story beats per [docs/world-bible.md](world-bible.md). The golden rule from §3.8 holds:
**every layer is value-suppressed beneath the units.**

| Biome (palette) | Story mood | Decal set (baked) | Ambient particles (live) | Color grade | **Signature alive element** |
|---|---|---|---|---|---|
| **Grass** `#1c2a1e/#243524` | Scrappy origin (Ep I) | dead-grass tufts, dirt patches, twigs, puddles, scattered debris | drifting pollen/spores, occasional firefly mote | cool green-grey multiply, faint warm highlight | wind ripple across grass tufts (per-prop sway) |
| **Mountain** `#24262b/#2d2f35` | Ruined highlands | rubble, scree, cracks, violet-rim ore flecks | sparse dust fall, rock-grit drift | cold charcoal multiply, violet rim accent | violet ore-vein glow flicker on rocks |
| **Water/coast** `#0c2230/#103040` | Toxic ocean | wet silt, barnacle clusters, foam scum, oil sheen | low mist over water, rare bubble | near-black teal, cyan glint highlight | *(reuse existing)* tide + caustics; add fake shoreline reflection (QUAL-gated) |
| **Tech** `#14181f/#1b2129` | Monopoly achieved (Ep IV/X+) | panel seams, rivets, cable runs, scorch, coolant puddles | coolant steam vents, data-grid flicker motes | very-dark metal multiply, cyan+magenta emissive | data-grid seam flicker + coolant steam plume |
| **Desert** `#3f3526/#4a4030` | Brutal exposure (Ep II/VII) | dune ripples, grit, cracked hardpan, bone/scrap | blowing dust/sand sheets, heat shimmer (subtle) | grimy ochre multiply, ember highlight | wind-driven sand sheet + cactus ember glow |
| **Ice** `#2c3742/#37454f` | Betrayal / freeze (Ep VI/IX/XII) | cracked ice, frost rime, slush, buried debris | drifting snow, frost sparkle | dirty blue-grey multiply (NOT white), cyan rim | drifting snow + frost-rim shimmer on rocks |
| **Volcanic** `#16110e/#201913` | Revenge / fire (Ep V) | basalt cracks, ash drifts, scorched scrap | **ember rain** (rising additive), ash fall | near-black basalt multiply, orange-red emissive | lava-crack pulse glow + ember rain (the showpiece) |
| **HUB city** (roads `#0d1016`) | Home base, neon noir | wet-asphalt sheen, paint wear, manhole/grate, trash, puddles | rain streaks, neon-reflection drift, holographic mote drift | cool noir multiply, saturated neon accents | wet-street **neon reflection wash** + rain (the signature) |

**HUB note:** the HUB already has a bespoke road/sidewalk render ([drawRoads](../js/render.js#L848-L869),
cyan neon lane lines) and a night tint. The revamp extends it with a **reflection wash** (sample neon
colors, smear them downward at low alpha on wet asphalt) and **rain** (a particle sheet + the global grade),
plus puddle decals — turning the showcase map into the most cinematic environment.

---

## 7. Engine path — canvas-2D-first, optional WebGL stretch

### Canvas-2D path (primary — must ship first and stand alone)
Reaches ~80% of the Hades target with zero architecture change:
- **A (baked):** variation, grunge, decals, seams, baked cliff/AO — all into the existing chunk cache.
- **B (bands):** contact shadows, canopy fade, additive FX band — extends the existing depth sort.
- **C (post):** color grade, vignette/focal pool, film grain, pseudo-bloom (with fallbacks).
- **Baked-light art (§8/P7):** the biggest single jump, and it's *art*, not code.

This honors CLAUDE.md (no build, no modules, canvas 2D) and the perf/save/co-op constraints completely.

### Optional WebGL post layer (stretch — gated, only if a gap remains)
The owner is open to bigger changes. *If* P0–P7 leave a visible last-mile gap, a **single WebGL overlay
canvas** stacked over the 2D canvas could add what canvas-2D genuinely can't:
- **Real-time 2D lights** (per-unit/muzzle/neon light casting onto the floor) via a lightmap pass.
- **True bloom** (threshold → Gaussian → additive) instead of the ¼-res fake.
- **Real god-rays** (radial blur) and **per-pixel grade/LUT**.
- **Normal-mapped relighting** of sprites/tiles (the Dead Cells / Children of Morta look), which **cannot**
  be done per-pixel on the CPU at frame rate — the original authors moved it to WebGL for exactly this reason.

**Tradeoffs to weigh before greenlighting:** it adds a second renderer and likely a tiny build/asset step
(shaders), cutting against the no-build ethos; it must degrade cleanly where WebGL is unavailable; and it
must **not regress** the canvas-2D path (which remains the shipping baseline). Treat as **P8**, post-P7,
decided on evidence (does the 2D result actually fall short?), not upfront.

**Rejected even with WebGL on the table:** Hades 2's real-time 3D characters (categorically wrong tool for
this game); anything that compromises the dark art direction.

---

## 8. Art-pipeline changes

The existing pipeline is **Gemini gen → Python slice → WebP optimize → LOADER tiered load (+ procedural
fallback)**: [gen_terrain_biomes.mjs] → [slice_terrain.py] / [slice_features.py] → [optimize_assets.py] →
[js/loader.js] / [js/assets.js]. Prompts live in [_dev/prompts/terrain-dark.md]. The revamp extends it:

1. **New/updated generators** (`_dev/gen/`):
   - `gen_terrain_biomes.mjs` — **re-gen with explicit baked AO/lighting** in the prompt (the §3.1 secret),
     at higher resolution; produce **N floor variants per biome** (not 1).
   - **`gen_decals.mjs`** (new) — per-biome decal atlases (debris/cracks/scorch/foliage) on a clean
     transparent/magenta key for slicing.
   - **`gen_features.mjs`** — more rock/tree variants per biome, transparent, baked-light.
   - **`gen_hub_overlays.mjs`** (new) — wet-asphalt sheen, rain, neon-reflection, holo-drift, road decals.
   - *(optional)* cliff-face/rim strips; mega/landmark re-gen with baked light.
2. **New slicers** — `slice_decals.py` (atlas → transparent decal cells with clean alpha, like
   `slice_features.py`'s morphology/feather pipeline); extend `slice_terrain.py` for the N-variant floor sheets.
3. **Atlas layout** — `tileset.webp` widens to hold N floor variants per biome; add `decals.webp` and
   `hub_overlays.webp`. All optional (procedural fallback if absent).
4. **LOADER wiring** — register new atlases at the right tier (decals = T_AMBIENT, base tiles = T_CRITICAL),
   all `optional:true` so a failed load never wedges the mission gate. Bump `sw.js` cache version on asset URL change.
5. **New prompts** — a `terrain-dark-v2.md` that bakes AO + the §6 per-biome decal/signature language, and a
   `decals.md` / `hub-overlays.md`. Keep the magenta-gutter convention the slicers depend on.
6. **Noise masks** for the bake-time seam crossfade and the grunge overlay are **generated procedurally**
   (tileable value noise) — no Gemini cost.

---

## 9. Asset-generation budget — Gemini 3 Pro Image ("Nano Banana Pro"), step-wise

**Verified official rates** (model `gemini-3-pro-image-preview`, late-2025/2026):
- Output image **1K–2K = 1120 tokens ≈ $0.134/image**; **4K = 2000 tokens ≈ $0.24/image** (output billed
  at $120 / 1M tokens). Text input $2/1M; image input 560 tok ≈ $0.0011.
- **Batch API = 50% off** (24-hour turnaround). **AI Studio free tier = 1,500 images/day** (interactive, not scripted).
- The *existing* pipeline uses **Gemini 2.5 Flash Image ≈ $0.039/image**; Pro 3 is ~3.4× pricier but the
  fidelity is the crux for **baked-light** tiles, so this table prices Pro 3. Prompt-input cost is
  negligible (<$0.001/gen); the spend is the **output images**.

**Step-wise inventory & cost** (final images; a "sheet" packs 4–16 cells sliced downstream; default 2K unless noted):

| Step | Asset (phase) | What it is | Imgs | Res | $/img | Subtotal |
|---|---|---|---|---|---|---|
| 1 | Base biome tilesets, baked-light re-gen (**P7**) | floor/rock/tree composite, AO+light baked in | 7 | 4K | $0.24 | **$1.68** |
| 2 | Floor variant sheets (**P1**) | ~4 distinct floors/biome to kill the stamp | 7 | 2K | $0.134 | **$0.94** |
| 3 | Decal atlases (**P5**) | debris/cracks/scorch/foliage: 2 sheets/biome + 2 shared combat | 16 | 2K | $0.134 | **$2.14** |
| 4 | Feature variant sheets (**P3**) | transparent rock+tree variants/biome | 7 | 2K | $0.134 | **$0.94** |
| 5 | HUB overlays/decals (**HUB**) | neon-reflection wash, rain, holo drift, road/asphalt wear | 10 | 2K | $0.134 | **$1.34** |
| 6 | Biome seams — noise-mask path (**P4**) | organic crossfade is **procedural → no art** | 0 | — | — | **$0.00** |
| **Core subtotal** | | | **47** | | | **≈ $7.04** |
| 7 | *(opt)* Explicit dual-grid transition tiles (**P4 alt**) | only if not using the noise-mask path | 12 | 2K | $0.134 | $1.61 |
| 8 | *(opt)* Cliff-face/rim height strips (**P3**) | else procedural baked rim | 7 | 2K | $0.134 | $0.94 |
| 9 | *(opt)* Ambient/FX painted sprites (**P6**) | god-ray shaft, fog plane, motes — else procedural | 8 | 2K | $0.134 | $1.07 |
| 10 | *(opt)* Mega/landmark re-gen, baked light (**P7**) | megabuilding/mountain/ruin/volcano ×6 each | 24 | 4K | $0.24 | $5.76 |
| **Optional subtotal** | | | **51** | | | **≈ $9.38** |

**Iteration multiplier (the real budget driver):** a usable asset lands in ~2–3 attempts (composition,
magenta-gutter alignment, clean alpha). Apply **×2.5**.

| Scenario | Final imgs | 1-attempt | **×2.5 realistic** | Batch (−50%) |
|---|---|---|---|---|
| **Core only** (steps 1–6) | 47 | $7.04 | **≈ $17.6** | ≈ $8.8 |
| **Full** (core + optional) | 98 | $16.42 | **≈ $41.1** | ≈ $20.5 |

**Bottom line:** the whole revamp's *new* art is **~$18 (core) to ~$41 (everything), realistically** on the
paid API — or **effectively $0** generated interactively via AI Studio's 1,500-images/day free tier
(trading scripting for manual gen).

*Rate sources:* [Google AI for Developers — Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing),
[pricepertoken.com](https://pricepertoken.com/pricing-page/model/google-gemini-3-pro-image-preview),
[aifreeapi.com — Nano Banana Pro price](https://www.aifreeapi.com/en/posts/nano-banana-pro-price).

---

## 10. Phased build roadmap

Ordered by the research's **verified, low-risk, high-leverage sequence.** Each phase is independently
shippable, cosmetic/render-only (no save/net change) unless flagged, and measured on the existing
`?perf=1` pixel-diff/perf harness before it lands.

| Phase | Goal | Primary files | Art needed | Gate / verification | Risk |
|---|---|---|---|---|---|
| **P0** | **Draw-order bands + contact shadows** — refactor the global sort into named `AltitudeLayer` bands; add a contact-shadow band (cached blob oval under feet, one light dir) | [js/render.js](../js/render.js#L350-L444) | none | pixel-diff vs. baseline (only shadows + ordering change); visual: units grounded | Low (pure code) — biggest grounding win, unblocks the rest |
| **P1** | **Chunk variation + grunge** — hash → N floor variants + rotate/mirror; one low-freq grunge overlay per chunk | [renderTerrainChunks](../js/render.js#L751-L772) | floor variant sheets (step 2) | perf: scroll cost unchanged (baked); visual: no checkerboard | Low |
| **P2** | **Post stack: per-biome grade + vignette/focal pool** — QUAL-gated full-screen grade + vignette + warm focal pool | [js/render.js](../js/render.js#L580-L620), grade descriptors in [js/config.js](../js/config.js#L67-L77) | none | A/B on `?perf=1`; `rgba` fallback verified off-Chromium; phone bench | Med (`ctx.filter` portability) |
| **P3** | **Walk-under canopy fade + fake height** — dither-alpha canopy ghost when feet-in-footprint; baked cliff face + rim | [js/render.js](../js/render.js#L1036-L1109) | feature variant sheets; *(opt)* cliff strips | visual: units read under canopy; props "pop" | Low–Med (finishes pending Phase 2) |
| **P4** | **Biome seams** — bake-time noise-mask crossfade (default) and/or dual-grid 16-tile | [renderTerrainChunks](../js/render.js#L751-L772) | none (noise-mask) or transition tiles (opt) | visual: organic borders; baked, no scroll cost | Med |
| **P5** | **Decal scatter layer** — blue-noise/Poisson decals per biome, **seeded from chunk coords** | [renderTerrainChunks](../js/render.js#L751-L772), new scatter helper | decal atlases (step 3) | **co-op determinism check** (host/client identical bake); perf bake cost | Med (determinism — see §11) |
| **P6** | **Ambient life** — per-biome particle sets + flicker glows + fake god-rays + drifting fog/weather | [js/particles.js](../js/particles.js), additive FX band | *(opt)* FX sprites (step 9) | pooled, zero-alloc; QUAL-gated; perf gate | Low–Med |
| **P7** | **Baked-light art regen** — re-gen tilesets/features/(props) with AO/lighting baked in | [_dev/gen/], [_dev/prompts/] | base tilesets (step 1), *(opt)* mega (step 10) | side-by-side; procedural fallback still acceptable | Med (art iteration) — **the real Hades secret** |
| **P8** | *(stretch, gated)* **Optional WebGL post layer** — real-time lights / true bloom / god-rays | new overlay canvas | shaders | must not regress 2D path; degrades where WebGL absent | High — only if P0–P7 leave a clear gap |

**Suggested first slice to ship:** P0 → P1 → P2. That trio (grounding + de-checkerboarding + grade/vignette)
is all low-risk, mostly code, needs only the step-2 floor sheets, and already transforms the look.

---

## 11. Risks & non-negotiables

- **Determinism (the sharpest trap).** Every decal/lighting/ambient effect must be **cosmetic, render-only,
  and run OUTSIDE `update(G,dt)`**, driven by `performance.now()` / a local visual RNG — **never
  `simRandom`**. Decal scatter must **seed from tile/chunk coordinates** so host and client paint
  byte-identical terrain. This is the same cosmetic-only contract already used by the Reborn marker, the
  off-hours camera, and the cyberware FX. A decal layer that rolls `simRandom` would desync co-op.
- **Save/serialization invariance.** No new persisted fields. All new visuals derive from existing per-tile
  data (`tiles`/`biome`/`variant`/`feat`) + coordinate hashes. Any layer that *would* need new state must
  be called out and re-justified — none in P0–P7 should.
- **Performance budget.** Hold zero-per-frame-allocation: pool particles, **cache all gradients/glow
  sprites**, batch by blend mode. Every phase must pass the `?perf=1` A/B pixel-diff gate. The post stack
  (C) must drop cleanly at QUAL ≥ 2. Big maps + busy HUB are the worst cases — bench there.
- **`ctx.filter` / blend-mode portability.** Unreliable on Firefox/non-Chromium, slow on some mobile GPUs.
  Always keep a no-filter `rgba` fallback; gate behind QUAL; **benchmark on a real phone** (STARLEFT ships
  to mobile + GitHub Pages).
- **Procedural-fallback parity.** New atlases are optional; if a sheet fails to load the procedural path
  must still look acceptable. Don't make the game depend on an asset that might 404 on mobile.
- **Readability ceiling (§3.8).** Units are small and numerous. Every detail/atmosphere layer is
  value-suppressed beneath units; decals never compete with unit silhouettes; grade never lifts the floor
  brighter than the units. If a screenshot makes a unit hard to find, the layer is too strong.
- **Art direction: never bright.** Bloom stays tight-threshold; grades stay dark/cool with disciplined neon
  accents. Hollow victories, real losses, no hope-core.
- **What we are NOT doing:** real-time per-pixel CPU normal-map relighting, Hades 2-style 3D characters,
  true GPU god-rays in canvas — all WebGL-or-bust and parked behind P8.

---

*This document is the design source for the terrain/world-render revamp. Implementation proceeds per §10,
each phase gated on `?perf=1` and the §11 non-negotiables. Related: [docs/world-bible.md](world-bible.md)
(biome moods/story), [docs/perf/RESULTS.md](perf/RESULTS.md) (perf harness & shipped opts),
[_dev/prompts/terrain-dark.md](../_dev/prompts/terrain-dark.md) (current terrain art prompt).*
