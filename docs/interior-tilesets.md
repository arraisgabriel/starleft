# Interior Tilesets — Design Roadmap

> **Status:** design-only spec (no code shipped). A code-accurate plan for rendering entire STARLEFT
> maps — or sub-areas of a map (inside the Dark Tower, the belly of a spacecraft) — as **real
> building/ship interiors in every layer** (floors, walls, props, overheads, lighting), heavily
> inspired by **Cyberpunk 2077**, **The Ascent**, and **Hades**. Pull work from §6 / the tasks doc
> when ready; each entry names its real codebase hook, save-compat + three-netRole reach, effort,
> and the smallest shippable first slice.
>
> **Companion docs:** [interior-tilesets-tasks.md](interior-tilesets-tasks.md) (the execution
> checklist), [world-bible.md](world-bible.md) (canon — the Dark Tower / A&O / GRAAL),
> [environmental-storytelling.md](environmental-storytelling.md) (the sibling design-roadmap this
> pair mirrors in structure). Art-direction rule of record: dark / devastated / Hades-inspired,
> never bright.

---

## 1. Purpose & scope

Every STARLEFT episode currently reads as one of seven **open-terrain biomes** (grass / mountain /
water / tech / desert / ice / volcanic). The wasteland is beautiful but same-y: a desert map and a
"corporate raid" map are painted from the same seven-row atlas. This doc plans the opposite — a way
to make a map (or a walled sub-zone of a map) render as a distinct **authored interior**: a polished
A&O tower floor, a riveted starship deck, a ripperdoc clinic, a rusted industrial sub-basement.

This is **not** "build a renderer." STARLEFT's terrain path already does exactly the thing interiors
need — *"map each tile's `(biome, slot)` to an atlas cell, with a `*_READY` flag and a procedural
fallback, every variant/mirror decision a pure function of tile coords."* Interiors are a **new
biome row + a wall/prop feature slot + four generated themes** riding that existing machinery. §4
inventories the foundation so the catalog in §6 reads as *"extend X"*, not *"build Y"*.

**Decisions locked for this pass** (owner):
- **Playable RTS maps.** Interiors live on the real sim path — units, pathing, fog, co-op, and saves
  all "just work" through `newMap` + the render/save pipeline. This is *not* a decoupled DOM overlay
  like [offhours_interior.js](../js/offhours_interior.js) (presentation-only, no grid/passability).
- **All four themes:** **Dark Tower** (A&O corporate altar), **Spacecraft**, **Clinic** (ripperdoc),
  **Industrial/Slum**.
- **Max fidelity:** full **blob-47/48** wall autotiling, generated at **4K** via Gemini
  `gemini-3-pro-image` ("Nano Banana Pro"), the owner's "Gemini Image 3 Pro".

---

## 2. The hard constraints (every mechanic honors these)

The four global rules from the codebase, plus two that are specific to a walled, tile-authored biome:

1. **No-build / single global scope.** Plain HTML+CSS+classic JS sharing one global scope; script
   order in `rts.html` *is* the dependency graph. A new `js/autotile.js` slots into that order; no
   bundler, no modules.
2. **Single global `G`.** Render-only interior transients follow the `state._shake` / `megaSprites`
   precedent — set at map build, read in [render.js](../js/render.js), and either **excluded from
   save** ([save.js:111](../js/save.js#L111) `SKIP`) or re-derived from `cfg` on load.
3. **Three netRole paths.** Solo, host (authoritative, broadcasts snapshots), client (render-only —
   **never simulates**). Interiors are terrain: the client regenerates identical terrain via its own
   `newMap` (per [save.js:138](../js/save.js#L138) — *"co-op clients regen terrain via their own
   newMap + host entities"*), so **nothing about an interior needs to enter a snapshot**. Interior
   neon/emissive is cosmetic-local and safe.
4. **Save-compat is mandatory.** Missing fields = legacy default; no `SAVE_VERSION`-gated reads.
   `B_INTERIOR` is **appended** as biome id 7 so old `biome[]` ints never shift; interior geometry is
   re-derived from `cfg` on load — **no [`SAVE_VERSION`](../js/save.js#L6) bump.**

**Interior-specific:**

5. **Co-op-deterministic tile selection.** Every autotile bitmask, floor variant, decal scatter, and
   mirror/rotate MUST be a pure function of tile coords via [`h2(tx,ty)`](../js/render.js#L96) — the
   exact rule [`floorVarRect`](../js/assets.js#L77)/[`featVarRect`](../js/assets.js#L144) already
   follow. A single `Math.random` in tile selection desyncs host/client.
6. **Reachability-after-stamping.** Interior walls set `blocked[]`. Room geometry must be stamped
   **before** [`carveBridgesToTargets`](../js/map.js#L234) / [`clearStartBuildingGround`](../js/map.js#L459)
   run, so a wall can never strand a gold node, base, or objective — the same guard the paint layer
   already relies on ([map.js:658-662](../js/map.js#L658)).

A mechanic that would need a snapshot-shape change is flagged inline as a **net-shape change**.
Interiors are designed to need **none**.

---

## 3. Reference-game research synthesis (cross-game)

How CP2077, The Ascent, and Hades build the spaces we're imitating, distilled to what a tile renderer
can actually reproduce:

- **The Ascent** (isometric cyberpunk, the closest reference): density is *authored*, not baked.
  Clean base floor tiles are dressed at runtime with a **separate scatter-decal library** and large
  hand-placed **set-pieces**; a "see-through grating over a darker lower deck" trick fakes vertical
  depth. Lesson: keep floors clean, drop grime/props as a separate layer, break the grid with 2×2–4×2
  set-pieces rather than per-tile busyness.
- **Cyberpunk 2077**: a consistent **material + light language** — matte-black corpo stone with a
  single surgical accent (Arasaka), wet reflective floors doubling the apparent neon, exposed
  cabling/pipes, holographic signage, dirt-and-luxury contrast. Lesson: **≤3 accent hues per theme**,
  reflections baked into wet-floor variants, brightest light reserved for doors/objectives.
- **Hades** (Supergiant / Jen Zee): painterly, high-contrast, **dark background + luminous rim** so
  units read; per-region palette scripting (Tartarus ≠ Elysium) keeps each area distinct yet
  cohesive; depth faked with foreground occluders + painted AO, not a 3D camera. Lesson: one shared
  black shadow, a tight alpha-driven silhouette rim, a 3-tone bake per tile to fake an overhead key.

**The 9-layer interior model** these converge on maps 1:1 onto STARLEFT's existing 8-band render
stack ([render.js:99](../js/render.js#L99),
`LAYER = { TERRAIN:0, GROUND_DECAL:1, SHADOW:2, ACTORS:3, CANOPY:4, FX:5, FOG:6, POST:7 }`):

| # | Interior layer | Purpose | STARLEFT band → hook |
|---|---|---|---|
| 1 | **Floor base** (autotiled per material) | seamless walkable plane; material transitions | `TERRAIN` → [`drawTile()`](../js/render.js#L1207) new `B_INTERIOR` branch |
| 2 | **Floor variants + decals** (deterministic scatter) | cracks / oil / scorch / hazard-chevron / cable; wet-floor neon smears | `GROUND_DECAL` → [`drawFloorDeco()`](../js/render.js#L1238) `B_INTERIOR` case + [`bakeDecals()`](../js/render.js#L202) |
| 3 | **Shadow / AO** | contact shadow under walls/props | `SHADOW` → existing contact-blob pass ([render.js:695](../js/render.js#L695)) + AO baked into art seams |
| 4 | **Wall face** (blob-48, Y-sorted, blocks path) | the lit vertical bulkhead | `ACTORS` depth array → `interiorFeatures{slot:'wall'}` |
| 5 | **Wall cap / top** (own bitmask, offset up) | correct height-sort for tall walls | same `ACTORS` entry, 2nd blit offset up by wall height |
| 6 | **Props + set-pieces** (2×2–4×2) | clutter, cover, landmarks | `ACTORS`, Y-sorted with units like buildings/features |
| 7 | **Overhang / foreground occluders** (pipes / catwalks / ducts) | draw over units passing under | `CANOPY` walk-under band; occluded-unit ghost pass ([render.js:732](../js/render.js#L732)) fades the unit |
| 8 | **Emissive / neon** (additive strips, console glow) | brightest reserved for doors/objectives | `FX` → `INTERIOR_NEON` pass reusing [`drawMegaNeonLayer()`](../js/megasprites.js#L391) |
| 9 | **Post grade** (multiply tint + vignette) | theme identity | `POST` → `BIOME_GRADE[B_INTERIOR]` in [`applyPostStack()`](../js/render.js#L246) |

**Global art grammar (applied to every theme):** dark low-value base; one shared pure-black shadow;
a tight **alpha-driven silhouette rim** (edge, never halo) so units/props pop off the dark floor;
emissive on its own additive pass, hue-matched per theme; **≤3 saturated accent hues per theme**; a
3-tone bake per tile (top-lit / base-face / side-dark) to fake an overhead key with **no runtime
light** (the engine has none). **RTS readability rule:** the walkable **floor stays dark**; the
brightest neon marks gameplay-relevant points (doors, objectives, resource nodes, extraction) — neon
*guides the eye*, never floods. This lines up with the existing per-faction light convention
(player=red / enemy=blue / A&O=green) and the small-alpha biome grades ([`BIOME_GRADE`](../js/config.js#L82),
~0.12–0.16).

---

## 4. What STARLEFT already does (the foundation)

So the catalog reads as *"extend X"*:

### The terrain atlas system (the whole point — interiors are a new consumer)
| System | What it already does | Files |
|---|---|---|
| `(biome, slot)` → atlas cell | Each tile maps to one atlas cell; `SPRITES[b] = {floor,rock,tree}` built from `atlasRect(b,slot)`; `spriteFor(b,slot)` returns the rect or `null` if the sheet isn't loaded | [assets.js:55-59](../js/assets.js#L55) |
| Resilient optional atlases | Every terrain sheet registers `optional:true` with a `*_READY` flag; if the webp is missing the renderer falls back cell→procedural. `floors.webp`, `features.webp`, `features_var.webp`, `decals.webp`, `water.webp` all follow this | [assets.js:70-180](../js/assets.js#L70) |
| Deterministic variant pick | `floorVarRect(b, (h2(tx,ty)*FLOOR_VAR_N)|0)` hash-picks one of N floor variants; `featVarRect(b,slot,idx)` picks one of `FEAT_VAR_ROCK_N=8`/`FEAT_VAR_TREE_N=16` shapes — **coords-only → co-op/save safe** | [assets.js:77](../js/assets.js#L77), [assets.js:144](../js/assets.js#L144) |
| Per-biome procedural floor deco | `drawFloorDeco()` runs a `switch(b)` overlay (tech grid, desert dune, ice sparkle, animated volcanic lava) — the exact place a `B_INTERIOR` decal case slots in | [render.js:1238](../js/render.js#L1238) |
| Depth-sorted actors (Y-sort) | One `depth[]` array collects megas/features/mountain-chains/buildings/units/NPCs, sorted by ground-line `y` with a deterministic `tie` tiebreak; walls/props join here | [render.js:591-672](../js/render.js#L591) |
| Walk-under canopy + occluded-unit ghost | Tall features draw in `CANOPY`; a unit behind a taller sprite is re-drawn as a faint ghost (`_ghostBlit`) — free overhang behavior for interiors | [render.js:732-745](../js/render.js#L732), [render.js:1680](../js/render.js#L1680) |
| Additive neon layer | `drawMegaNeonLayer(state, m, glows, dx,dy,dw,dh, layer)` draws cached, LOD-gated, per-color glow — reused by megas AND `building_neon_maps.js`; `INTERIOR_NEON` is one more caller | [megasprites.js:391](../js/megasprites.js#L391), [render.js:1939-1965](../js/render.js#L1939) |
| Per-biome post grade | `applyPostStack()` multiply-tints + vignettes per biome (`BIOME_GRADE`), dropped under load (`QUAL.level>=2`) | [render.js:246](../js/render.js#L246), [config.js:82](../js/config.js#L82) |
| Deterministic hash | `h2(x,y)` — pure 2D hash → [0,1); the single source of every cross-peer-identical tile decision | [render.js:96](../js/render.js#L96) |

### Map authoring & generation
| System | What it already does | Files |
|---|---|---|
| `cfg.paint` override layer | The map editor writes a compact per-tile override string; `MAP_PAINT.apply` decodes it and stamps `tile`/`biome`/`feat` per tile, then re-carves bridges. Char-keyed `TARGETS` — *add interior floor/wall keys here* | [map_paint.js](../js/map_paint.js), applied at [map.js:662](../js/map.js#L662) |
| `cfg.scenery` landmark props | `[{type,x,y}]` places indestructible neutral props (the Dark Tower) via `spawnScenery`; `e.scenery` makes them unselectable + damage-immune. `cfg.interiors` is designed as a **sibling** array | [maps_data.js:482](../js/maps_data.js#L482), [map.js:433-445](../js/map.js#L433) |
| `terrain.biomes` → biome id | `cfgLandBiome(cfg)` resolves `CLIMATE[P.biomes[0]]`; adding `interior:B_INTERIOR` to `CLIMATE` makes `terrain:{biomes:['interior']}` authorable with zero new plumbing | [map.js:428](../js/map.js#L428), [config.js:99](../js/config.js#L99) |
| Reachability guards | `carveBridgesToTargets` floods from the player start and bridges any unreachable gold node/base; `clearStartBuildingGround` clears base footprints. Both run **after** paint/scenery stamping | [map.js:234](../js/map.js#L234), [map.js:459](../js/map.js#L459), [map.js:650-662](../js/map.js#L650) |
| On-load re-derivation | `deserializeGame` **re-runs** `applyScenery` and `applyPaintLayer` from `cfg` after load (grids like `feat`/`blocked`/`waterDepth` are `SKIP`'d and rebuilt) — the exact pattern interior geometry rebuilds through | [save.js:146-155](../js/save.js#L146), [save.js:111](../js/save.js#L111), [save.js:190-196](../js/save.js#L190) |

### The offline art pipeline (unchanged — interiors are one more consumer)
| System | What it already does | Files |
|---|---|---|
| Gemini gen scripts | `gen_*.mjs` POST text→PNG to `gemini-3-pro-image-preview` (`imageConfig.imageSize` `2K`/`4K`, magenta/green chroma key), concurrency 5, retry, **skip-if-exists** (idempotent re-runs) | [_dev/gen/gen_floor_variants.mjs](../_dev/gen/gen_floor_variants.mjs), `gen_feature_variants.mjs` |
| Slice → atlas | `slice_*.py` chroma-keys the magenta gutters, crops, feathers, and packs a fixed **N-biome-row × M-col** webp into `assets/atlas/` | [_dev/gen/slice_feature_variants.py](../_dev/gen/slice_feature_variants.py) |
| Faction recolor ($0) | `recolor_ao.py` cyan→toxic-green pure-pixel transform → A&O skin with **no** new generation | [_dev/gen/recolor_ao.py](../_dev/gen/recolor_ao.py) |
| Hard spend ledger | `_spend.mjs` meters every image against a **$30 cap that throws on exceed**; `.gen_spend.json` persists the running total across script runs | [_dev/gen/_spend.mjs](../_dev/gen/_spend.mjs) |

### Named gaps (the opportunity)
- **No interior biome.** Seven biomes (`B_GRASS=0 … B_VOLCANIC=6`); no walled/indoor material set.
- **No wall slot.** `drawTile` knows only `floor/rock/tree` ([render.js:1219](../js/render.js#L1219)); there is no autotiled vertical wall with a height-offset cap.
- **No autotiling.** Variant selection is a flat hash-pick, never neighbor-aware — interiors need blob/dual-grid transitions.
- **The Dark Tower has no inside.** `cfg.scenery` places it as an indestructible exterior prop only ([maps_data.js:482](../js/maps_data.js#L482)); "inside the tower" doesn't exist yet.

---

## 5. The design catalog

Each entry: the mechanic, its real hook, save + three-netRole reach, effort (**S/M/L**), and the
smallest shippable first slice. Task IDs (E#/G#/M#) match [interior-tilesets-tasks.md](interior-tilesets-tasks.md).

### Engine — the `B_INTERIOR` tileset system (art-agnostic; ships playable with procedural fallback first)

**E1 · `B_INTERIOR=7` biome + palette (S).** Append `B_INTERIOR=7` to the biome enum
([config.js:62](../js/config.js#L62)); add matching entries to `BIOME_PAL[7]`
([config.js:67](../js/config.js#L67)), `BIOME_MINI[7]` ([config.js:77](../js/config.js#L77)),
`BIOME_GRADE[7]` ([config.js:82](../js/config.js#L82)), and `CLIMATE.interior=B_INTERIOR`
([config.js:99](../js/config.js#L99)). *Do not* add it to `BIOME_KINDS`
([config.js:63](../js/config.js#L63)) — that array drives random climate assignment and interiors are
authored, never rolled. **Save:** append-only int → legacy saves unaffected, no version bump.
**netRole:** terrain, regenerated identically everywhere. **First slice:** the biome + a dark palette
so `terrain:{biomes:['interior']}` renders as a flat dark floor via the existing procedural fallback
([render.js:1228](../js/render.js#L1228)) with zero art.

**E2 · `js/autotile.js` — neighbor-aware bitmask + LUT (M).** A new classic-JS file (in `rts.html`
order before `render.js`) that builds an 8-neighbour bitmask from same-material adjacency and maps it
via a precomputed LUT to a tile index. **Walls: full blob-48** (covers the fully-surrounded case — the
max-fidelity choice). **Floors: dual-grid-16** by default (visually equivalent to blob-47 for floor
material at ~⅓ the tiles; a specific floor upgrades to blob-47 only if it needs distinct inner
corners). Bitmask + variant pick derive from [`h2(tx,ty)`](../js/render.js#L96) — same determinism
contract as `floorVarRect`. **First slice:** the LUT + a `interiorTileIndex(state,tx,ty,slot)` helper,
unit-testable headless before any art exists.

**E3 · Interior atlas registration (S).** In [assets.js](../js/assets.js), add `ATLAS_INTERIOR_*`
consts + `LOADER.register(..., {tier:LOADER.T_GAMEPLAY, weight:2, optional:true})` mirroring the
floors block ([assets.js:70-80](../js/assets.js#L70)) and feature-var block
([assets.js:109-149](../js/assets.js#L109)); add `INTERIOR_READY` flags and
`interiorFloorRect/interiorWallRect/interiorPropRect` helpers mirroring `floorVarRect`/`featVarRect`;
precompute the bitmask→cell LUT once at load. **Save/netRole:** none (art only). **First slice:**
registration + rect helpers returning `null` until the sheets exist (procedural fallback holds).

**E4 · Floor + decal render hooks (S).** In [`drawTile`](../js/render.js#L1207), right after the
`FLOOR_VAR_READY` block ([render.js:1220](../js/render.js#L1220)):
`if(b===B_INTERIOR && INTERIOR_READY){ const r=interiorFloorRect(state,tx,ty); if(r){ _blitOrientedTo(ctx,INTERIOR_FLOOR_IMG,r,px,py,v,true); return; } }`.
In [`drawFloorDeco`](../js/render.js#L1238), add a `B_INTERIOR` case scattering interior decals via
`h2(tx,ty)` at ~5–15% density (baked ones route through [`bakeDecals`](../js/render.js#L202)).
**netRole:** deterministic, render-only. **First slice:** floor autotile blit + a couple of procedural
decal strokes so it reads before the decal sheet lands.

**E5 · Interior features — walls / caps / props / overhangs (M).** Add
`state.interiorFeatures=[{tx,ty,w,h,room,slot:'wall'|'wallcap'|'pillar'|'prop'|'door'|'overhang',mask,variant}]`,
collected cull+fog-gated into the existing depth array
([render.js:591-650](../js/render.js#L591)) as `depth.push({y:(inf.ty+inf.h)*TILE, interior:inf})`,
with a `else if(d.interior) drawInteriorFeature(...)` in the draw switch. The **wall face** Y-sorts
with units; the **wall cap** is a 2nd blit in the *same* depth entry offset up by wall height (so tall
walls sort correctly). **Overhangs** route to the `CANOPY` band and inherit the occluded-unit ghost
([render.js:732](../js/render.js#L732)) for free. Walls set `blocked[]`. **Save:** `interiorFeatures`
is runtime-only (E8). **netRole:** deterministic geometry from `cfg`. **First slice:** wall face+cap
only (flat blocks via procedural fallback), proving Y-sort + pathing; props/overhang follow.

**E6 · `INTERIOR_NEON` emissive + POST grade (M).** An additive `FX`-band pass reusing
[`drawMegaNeonLayer()`](../js/megasprites.js#L391) (pass `noBreath`/`cacheGrad` like buildings do at
[render.js:1939](../js/render.js#L1939)), keyed per emissive tile/prop, brightest on doors/objectives.
Gate on `QUAL.level<2` + [`NEON_LOD_ZOOM`](../js/render.js#L94) exactly as megas/buildings do. Plus a
`BIOME_GRADE[B_INTERIOR]` per-theme multiply tint (small alpha ~0.12–0.16) in
[`applyPostStack`](../js/render.js#L246). **netRole:** cosmetic-local (safe on clients). **First
slice:** the POST grade + door/objective glows; per-strip emissive is polish.

### Authoring — putting a room on a map

**E7 · `cfg.interiors` room stamps + paint keys (M).** Two authoring levers, both applied in
[`newMap`](../js/map.js#L472) *before* the reachability carve:
- **`cfg.interiors = [{tx,ty,w,h,room,template}]`** — room footprints (sibling to
  [`cfg.scenery`](../js/maps_data.js#L482)), scanned in `newMap` to stamp passable interior floor
  (`biome[i]=B_INTERIOR`), set `blocked[]` on wall perimeters, and emit `interiorFeatures`. Factor the
  stamp into an `applyInteriors(state,cfg)` next to [`applyScenery`](../js/map.js#L433)/
  [`applyPaintLayer`](../js/map.js#L448) so the save loader can re-run it.
- **`cfg.paint` interior keys** — add char-keyed `TARGETS` in [map_paint.js](../js/map_paint.js) (e.g.
  `'i'`=interior-floor `{tile:T_DIRT, biome:B_INTERIOR}`, `'W'`=interior-wall
  `{tile:T_DIRT, biome:B_INTERIOR, feat:<wall>}`) for hand-drawn rooms in the map editor.
**Ordering (critical):** interior stamping must precede [`carveBridgesToTargets`](../js/map.js#L652)
so a wall can't strand an objective — same rule paint already obeys
([map.js:658-662](../js/map.js#L658)). **First slice:** `cfg.interiors` rectangular rooms; freeform
paint keys are follow-on.

**E8 · Save + co-op wiring (S).** Add `interiorFeatures` to the [save.js:111](../js/save.js#L111)
`SKIP` set (never serialized), and call `applyInteriors(g,cfg)` in `deserializeGame` alongside the
existing on-load [`applyScenery`](../js/save.js#L146)/[`applyPaintLayer`](../js/save.js#L153) so the
room rebuilds from `cfg`. Because `tiles[]`/`biome[]` **are** serialized
([save.js:114](../js/save.js#L114)) but the derived `feat`/`blocked` grids are rebuilt on load
([save.js:190](../js/save.js#L190)), interior walls must be re-stamped into `blocked[]` on load — the
`applyInteriors` call covers it. **No `SAVE_VERSION` bump.** **netRole:** co-op clients already regen
terrain via their own `newMap` ([save.js:138](../js/save.js#L138)); the same `cfg.interiors` produces
identical rooms host+client, so **no snapshot change**.

### Art generation — the four themes

**G1 · `gen_interiors.mjs` (S).** Clone [gen_feature_variants.mjs](../_dev/gen/gen_feature_variants.mjs)/
[gen_floor_variants.mjs](../_dev/gen/gen_floor_variants.mjs): import [_spend.mjs](../_dev/gen/_spend.mjs)
for the cap, `imageSize:'4K'` for dense autotile grids and `'2K'` for decal/prop/emissive sheets,
magenta chroma key, concurrency 5, skip-if-exists.

**G2 · `slice_interiors.py` (S).** Clone [slice_feature_variants.py](../_dev/gen/slice_feature_variants.py):
magenta-key → transparent → pack per-theme webps into `assets/atlas/` at a fixed
material-row × tile-col grid; **generate each material as one seamless grid then slice** (never 48
independent images — the #1 AI-tileset seam failure).

**G3 · Dark Tower theme (M).** A&O corporate altar — near-black polished panel floors with toxic-green
seam strips; matte-black monolithic bulkheads, tinted glass, floating logo signage; props = server
racks, the **GRAAL forge/altar** set-piece, netrunner chairs, corpse-to-product rigs (canon), cover
pillars; surgical-green key on near-black fill, **gold rim on hero props** (Tusk-gilded). A&O-green is a
`recolor_ao.py` pass on a base corpo sheet ($0). Palette: near-black + toxic-green + gold.

**G4 · Spacecraft theme (M).** Ascent density × Hades steel — riveted gunmetal deck, see-through
**grating over darker lower-deck plates** (faked vertical layering), glowing seam strips; ribbed
bulkheads, blast doors, airlocks, conduit runs, backlit viewports; props = reactor-core set-piece,
cryo-pods, consoles, coolant tanks, hatches; cyan/teal base + amber warning emissive, flicker on
damaged panels. Palette: steel/graphite + cyan/teal + amber.

**G5 · Clinic theme — reskin of Spacecraft topology (S–M).** Ripperdoc — sickly-green/off-white tile
with perimeter blood-drain grids, coolant puddles; panel walls with prosthesis-display insets; props =
med couches w/ syringe rails, robot-assembly stations, ice baths, VR/netrunner chairs, soldering rigs;
clinical green base + **one hot magenta/red hazard accent**. Reuses Spacecraft's wall/floor cell
topology (same grid layout & prompt scaffold, different material words), so generation is
per-*material*, not per-theme-from-scratch.

**G6 · Industrial/Slum theme — reskin of Spacecraft topology (S–M).** CP2077 entropism × Ascent grime —
cracked concrete, oil stains, rusted steel platforms, puddles; corrugated-rust walls, exposed brick,
heavy graffiti, dead CRT screens; props = machinery, barrels, crates, pipes, flickering neon signs,
maintenance bots; warm rust + harsh sodium/neon pools against deep shadow. Palette: rust/grime-brown +
sodium-amber neon.

**G7 · Faction recolors ($0).** `recolor_ao.py`-style hue transforms produce faction skins of shared
corpo/industrial sheets (A&O-green, corpo-red, rust) at zero generation cost.

### Wiring into the campaign

**M1 · First interior episode (M).** Author the first interior map via the `starleft-mapmaker` skill
(it owns the `MAPS` schema, generator, and lore) so the interior lands on the right story beat. The **Dark Tower interior** is the natural first consumer — it's
canon ([world-bible.md](world-bible.md)), the GRAAL/Ep XI holdout already anchors on the tower
([maps_data.js:482-500](../js/maps_data.js#L482)), and "storm the tower's inside" is a beat the arc
wants.

---

## 6. Art generation & cost

**Pipeline (unchanged):** `gen_interiors.mjs` → PNG on magenta key → `slice_interiors.py` →
`assets/atlas/*.webp` → `LOADER.register` (E3) → `interior*Rect` index. Model
`gemini-3-pro-image` ("Nano Banana Pro") is the owner's "Gemini Image 3 Pro" and Google's flagship
image model (4K, best text-in-image, multi-image style locking). Verified pricing (token-metered,
$120/1M output-image tokens) — **exactly** the constants already in
[_spend.mjs](../_dev/gen/_spend.mjs):

| Resolution | Price / image (sheet) | Batch API (−50%) |
|---|---|---|
| 1K / 2K | **$0.134** | $0.067 |
| 4K | **$0.24** | $0.12 |

The **billed unit is a sheet**, not a sprite — one Gemini image is a multi-cell grid, sliced in Python.

**Per-theme sheets (max fidelity, ~10–11 sheets):** `floor_A`, `floor_B` (dual-grid-16, 4K),
`floor_decals` (~24, 2K), `wall_face` (blob-48, 4K), `wall_cap` (blob, 4K), `props` (~30–40 → 1–2
sheets, 4K), `setpieces` (~6–8 large, 4K), `overhang` (~12–16, 2K), `emissive` (~12–16, 2K).
Clinic & Industrial **reuse Spacecraft's autotile cell topology**, keeping cost per-*material*.

| | Sheets/theme | Blend | First pass | ×4 themes |
|---|---|---|---|---|
| 4K autotile floor/wall/props/setpiece | ~7 | $0.24 | $1.68 | $6.72 |
| 2K decal/overhang/emissive | ~3–4 | $0.134 | ~$0.47 | ~$1.88 |
| **Per theme first pass** | ~10–11 | — | **~$2.1** | **~$8.6** |
| Iteration/regens (autotile seams are the reliable failure) | 1.5–2× on floor/wall | — | — | **+$4–8** |
| Faction recolors | recolor_ao.py | $0 | $0 | $0 |
| **Realistic total** | | | | **~$14–18** |

**Budget decision (record it in the tasks doc).** Ledger: **$12.37 spent / $30 cap → $17.63
remaining** ([_spend.mjs](../_dev/gen/_spend.mjs), `.gen_spend.json`). Max-fidelity ×4-themes lands
**right at the edge** — a clean first pass fits, but realistic iteration can trip the cap (which
*throws*). Either lever resolves it:
- **Recommended — Batch API (−50%, async, no quality loss):** ~$7–9 total, comfortably inside the
  existing $30 cap. Needs `gen_interiors.mjs` adapted to the batch endpoint (modest).
- **Or — raise `_spend.mjs` `CAP` from `$30 → $50`** (one line) for headroom on the synchronous path.

---

## 7. Suggested sequencing

Ship the engine **art-agnostic first**, so interiors are playable (as flat dark rooms) before a single
image is generated — then dress them:

1. **E1 → E2 → E3 → E4 → E5 → E6** — the `B_INTERIOR` system with procedural fallbacks. Playable,
   deterministic, save/co-op-safe with zero art. Validates the sim path first.
2. **E7 → E8** — authoring (`cfg.interiors` + paint) and save/co-op wiring; drop one test room into a
   scratch map.
3. **G1 → G2 → G3** — the generation scripts + the **Dark Tower** theme (first real art; A&O-green
   recolor). Tune palette/emissive against the readability rule.
4. **G4**, then **G5 / G6** as Spacecraft-topology reskins; **G7** recolors.
5. **M1** — wire the first interior into an episode via `starleft-mapmaker`.

---

## 8. Appendix

### Parked / optional
- **Multi-floor "see-through grating over lower decks" (Ascent trick).** Faked with darker background
  plates under grated floor variants; adds art and a second floor-plate layer. Nice depth, not required
  for v1 — ship single-plane interiors first.
- **Animated emissive (flicker/scanlines).** The `INTERIOR_NEON` pass can breathe/flicker like megas,
  but start static (`noBreath`) for perf; add motion per-theme only where it earns it.

### Cross-cutting
- **Perf.** STARLEFT's render is **fill-bound** (see building-neon notes). Interior walls add a Y-sort
  pass + a wall-cap 2nd blit + an additive neon pass across many cells. Cache the bitmask LUT and neon
  gradients; gate emissive on `QUAL.level<2` + `NEON_LOD_ZOOM`; verify p95 on the `?perf=1` harness and
  a **real mobile GPU** before shipping emissive.
- **Readability.** Dark interiors risk burying units. Keep the floor plane dark, neon on objectives,
  `BIOME_GRADE[B_INTERIOR]` alpha small (~0.12–0.16); verify units, selection rings, and floaters read
  against all four themes on **desktop and narrow/mobile** (HUD height drives viewport math).
- **Co-op parity.** Interiors are pure terrain regenerated from `cfg` on every peer — no snapshot
  change, no host-only divergence. This is the cleanest possible co-op story and should stay that way:
  never fold interior geometry into a snapshot.
