# Interior Tilesets — Implementation Tasks

> **Companion to [interior-tilesets.md](interior-tilesets.md).** That doc is the *design* (why + the
> code-accurate catalog); this is the *execution checklist* (what to do, in order, with `[ ]`
> trackers). Every subtask names a real file + symbol and was verified against the code on the `main`
> branch. Tick a box when its slice is implemented **and** manually verified in-browser.
>
> **Nothing here is shipped yet** — this is a backlog. The design goal: render entire maps (or walled
> sub-zones) as **real interiors in every layer** (Dark Tower / Spacecraft / Clinic / Industrial),
> CP2077 × The Ascent × Hades, on the **playable sim path** (units/pathing/fog/co-op/save), at **max
> fidelity** (blob-47/48 walls, 4K Gemini art).

---

## How to use this checklist

- Each **Task** (`E#` engine, `G#` art-gen, `M#` campaign) is split into five groups, always in order:
  1. **Prep / locate** — confirm the anchors before touching anything (read-only).
  2. **First slice (ship this)** — the smallest shippable implementation.
  3. **Deferred / follow-on slices** — optional expansions; do later or never.
  4. **Constraints & safety** — save-compat, the three netRole paths, determinism, reachability, perf, art direction.
  5. **Verification** — concrete in-browser steps that prove it works.
- A task is **Done** when its *First slice* + *Constraints & safety* + *Verification* boxes are all ticked.
- **No build step exists** — edit the JS, hard-refresh `rts.html`. Serve locally so multiplayer works:
  `python3 -m http.server 8000` → open `http://localhost:8000/rts.html`.
- **Art is offline & separate.** `G#` tasks run `_dev/gen/*.mjs` (needs `GEMINI_API_KEY` in `_dev/.env`)
  and `_dev/gen/*.py`; they never block the `E#` engine tasks, which ship playable with procedural
  fallbacks first.
- Honor the global constraints (next section) on *every* task — not repeated per-task except where a
  specific gotcha applies.

---

## Global constraints (apply to EVERY task)

- [ ] **No-build / single global scope** — plain classic JS, no modules/bundler; respect script order in
  `rts.html` (it *is* the dependency graph). New file `js/autotile.js` loads **before** `js/render.js`
  and **after** `js/config.js`. New globals are read by later scripts only.
- [ ] **Single global `G`** — render-only interior transients (e.g. `state.interiorFeatures`) follow the
  `feat`/`blocked`/`megaSprites` precedent: either **excluded** from `js/save.js` `SKIP` and rebuilt on
  load, or a JSON-safe array — never a DOM/function ref.
- [ ] **Three netRole paths** — solo, host (authoritative), client (render-only, never simulates). Interiors
  are terrain: the client regenerates them via its own `newMap` from the same `cfg`
  ([save.js:138](../js/save.js#L138)). **No interior data enters a snapshot** (`js/net/sync.js` untouched).
  Never add client-side gameplay mutation.
- [ ] **Save-compat is mandatory** — `B_INTERIOR` is APPENDED as biome id 7; interior geometry re-derives
  from `cfg` on load; **no `SAVE_VERSION` bump** ([save.js:6](../js/save.js#L6)). Old saves must load and
  behave.
- [ ] **Determinism** — every autotile bitmask, variant, decal, mirror is a pure function of `h2(tx,ty)`
  ([render.js:96](../js/render.js#L96)). NEVER `Math.random`/`simRandom` in tile selection (desyncs co-op /
  breaks rollback replay).
- [ ] **Art direction** — dark / devastated / Hades-inspired, never bright. Floor plane stays dark; neon
  reserved for doors/objectives. No clean glowing pickups.

---

## Recommended build order

Ship the engine **art-agnostic first** (playable flat-dark rooms, procedural fallback), then dress it:

1. **E1** biome+palette → **E2** `js/autotile.js` → **E3** atlas registration → **E4** floor/decal hooks
   → **E5** wall/prop features → **E6** neon+POST grade. *(The whole tileset system, procedural fallback.)*
2. **E7** `cfg.interiors`+paint authoring → **E8** save/co-op wiring. *(Author a room; make it persist.)*
3. **G1** `gen_interiors.mjs` → **G2** `slice_interiors.py` → **G3** Dark Tower. *(First real art.)*
4. **G4** Spacecraft → **G5** Clinic + **G6** Industrial (topology reskins) → **G7** recolors.
5. **M1** first interior episode via `starleft-mapmaker`.

**Budget gate before any `G#`:** ledger reads `$12.37 / $30` ([_dev/gen/.gen_spend.json](../_dev/gen/.gen_spend.json));
max-fidelity ×4 ≈ $14–18 incl. iteration. **Decide up-front:** run generation through the **Batch API
(−50%, fits $30)** *or* raise `_spend.mjs` `CAP` to `$50`. The ledger THROWS on exceed mid-run.

---

## Task index

- [ ] **E1** — `B_INTERIOR=7` biome + palette + `CLIMATE.interior`  *(S)*
- [ ] **E2** — `js/autotile.js` — blob-48 wall / dual-grid-16 floor bitmask + LUT  *(M)*
- [ ] **E3** — Interior atlas registration + `interior*Rect` helpers  *(S)*
- [ ] **E4** — `drawTile` floor branch + `drawFloorDeco` decal case  *(S)*
- [ ] **E5** — `state.interiorFeatures` walls/caps/props/overhang in the depth sort  *(M)*
- [ ] **E6** — `INTERIOR_NEON` emissive pass + `BIOME_GRADE[B_INTERIOR]` post grade  *(M)*
- [ ] **E7** — `cfg.interiors` room stamps + `map_paint.js` interior keys  *(M)*
- [ ] **E8** — Save `SKIP` + on-load `applyInteriors` rebuild (no version bump)  *(S)*
- [ ] **G1** — `_dev/gen/gen_interiors.mjs` (Gemini, spend-capped)  *(S)*
- [ ] **G2** — `_dev/gen/slice_interiors.py` (magenta-key → webp atlas)  *(S)*
- [ ] **G3** — Dark Tower theme sheets  *(M)*
- [ ] **G4** — Spacecraft theme sheets  *(M)*
- [ ] **G5** — Clinic theme (Spacecraft-topology reskin)  *(S–M)*
- [ ] **G6** — Industrial/Slum theme (Spacecraft-topology reskin)  *(S–M)*
- [ ] **G7** — Faction recolors via `recolor_ao.py` ($0)  *(S)*
- [ ] **M1** — First interior episode (Dark Tower interior) via `starleft-mapmaker`  *(M)*

---

## Track E — the `B_INTERIOR` tileset engine

### Task E1 — Append `B_INTERIOR=7`, its palette rows, and `CLIMATE.interior`

#### E1 · Prep / locate
- [ ] Confirm the biome enum at [config.js:62](../js/config.js#L62): `const B_GRASS=0, B_MOUNTAIN=1, B_WATER=2, B_TECH=3, B_DESERT=4, B_ICE=5, B_VOLCANIC=6;` — 7 ids, 0-based. `B_INTERIOR` must be `=7` (append; **never** insert mid-list — `biome[]` stores these ints and old saves would shift).
- [ ] Confirm the four parallel palette tables keyed by biome id: `BIOME_PAL` ([config.js:67](../js/config.js#L67), `{a,b,dirt}` per biome), `BIOME_MINI` ([config.js:77](../js/config.js#L77), a **7-element array** of minimap colors — index = biome id), `BIOME_GRADE` ([config.js:82](../js/config.js#L82), `{mult:[r,g,b,alpha]}`), and `CLIMATE` ([config.js:99](../js/config.js#L99), `{grass:B_GRASS, desert:B_DESERT, ice:B_ICE, tech:B_TECH, volcanic:B_VOLCANIC}` — the string→id map `terrain.biomes` uses).
- [ ] Confirm `BIOME_KINDS` ([config.js:63](../js/config.js#L63)) is the *random climate* pool — `B_INTERIOR` must **NOT** be added here (interiors are authored, never rolled).
- [ ] Confirm `cfgLandBiome(cfg)` ([map.js:428](../js/map.js#L428)) resolves `CLIMATE[P.biomes[0]]` and the allow-set at [map.js:493](../js/map.js#L493) maps `P.biomes` through `CLIMATE` — so `CLIMATE.interior` is the one hook that makes `terrain:{biomes:['interior']}` authorable.
- [ ] Confirm the procedural floor fallback reads `BIOME_PAL[b] || BIOME_PAL[B_GRASS]` at [render.js:1228](../js/render.js#L1228) — a `BIOME_PAL[7]` entry gives interiors a real fallback color with zero other code.

#### E1 · First slice (ship this)
- [ ] In [config.js:62](../js/config.js#L62), append `, B_INTERIOR=7` to the biome enum line.
- [ ] Add `[B_INTERIOR]: { a:'#0c0e12', b:'#12151b', dirt:'#0a0c10' }` to `BIOME_PAL` ([config.js:67](../js/config.js#L67)) — near-black corporate default (themes override via atlas art, this is the fallback).
- [ ] Add an 8th element to the `BIOME_MINI` array ([config.js:77](../js/config.js#L77)): `'#0c0e12'` (keep index == biome id).
- [ ] Add `[B_INTERIOR]: { mult:[110,118,130,0.14] }` to `BIOME_GRADE` ([config.js:82](../js/config.js#L82)) — a cool, near-neutral graphite grade (per-theme override lands in E6).
- [ ] Add `interior:B_INTERIOR` to `CLIMATE` ([config.js:99](../js/config.js#L99)) so `terrain:{biomes:['interior']}` resolves.
- [ ] Do NOT touch `BIOME_KINDS` ([config.js:63](../js/config.js#L63)).

#### E1 · Deferred / follow-on slices
- [ ] Per-theme `BIOME_PAL`/`BIOME_GRADE` variants (tower-green vs ship-steel vs clinic-white vs rust) — deferred to E6/E7 once a map can declare which theme it is (a `cfg.interiorTheme` string, or derived from the room `template`).

#### E1 · Constraints & safety
- [ ] Save-compat: appending id 7 leaves ids 0–6 untouched; an old save's `biome[]` loads identically. No `SAVE_VERSION` bump.
- [ ] netRole: palette/CLIMATE are static config read identically on solo/host/client.
- [ ] Legacy `biome[]==7` on a save that predates any interior map is impossible (no old map produced it); if it ever appears it renders as the near-black fallback — safe.

#### E1 · Verification
- [ ] Temporarily set a scratch map's `terrain.biomes` to `['interior']`, load it: the ground renders flat near-black via the procedural fallback (no crash, minimap shows the dark tone).
- [ ] Save & reload that scratch map — biome persists, no console error.
- [ ] Revert the scratch edit.

---

### Task E2 — `js/autotile.js`: neighbor-aware bitmask + LUT (blob-48 walls, dual-grid-16 floors)

#### E2 · Prep / locate
- [ ] Confirm the determinism primitive `h2(x,y)` ([render.js:96](../js/render.js#L96)) — the ONLY randomness source tile selection may use (co-op/rollback safe). Note the file-level rule comment at [render.js:95](../js/render.js#L95).
- [ ] Confirm the existing flat variant-pick pattern to mirror: `floorVarRect(biome, (h2(tx,ty)*FLOOR_VAR_N)|0)` ([assets.js:77](../js/assets.js#L77)) and `featVarRect(biome,slot,idx)` ([assets.js:144](../js/assets.js#L144)). Autotile is the neighbor-aware upgrade of exactly this.
- [ ] Confirm `rts.html` script order: `js/config.js` first, `js/assets.js` before `js/render.js`. `js/autotile.js` must load **after config, before render** (and before assets if assets' `interior*Rect` will call the LUT — otherwise after assets is fine; place it right after `js/map_paint.js`).
- [ ] Decide the "same-material" adjacency predicate: for a floor tile, a neighbor "matches" if it's also `B_INTERIOR` floor of the same material key; for a wall, if it's an interior wall. Read `state.biome[i]`, `state.interiorFeatures` membership (E5), or a small `state.interiorMat` side-array authored in E7.

#### E2 · First slice (ship this)
- [ ] Create `js/autotile.js` as an IIFE publishing `window.AUTOTILE`. Implement `mask8(state,tx,ty,matchFn)` → an 8-bit N/E/S/W + 4-corner bitmask (corners only counted when both adjacent edges match — the blob rule).
- [ ] Implement the **blob-47/48** LUT: precompute once (module load) a `Uint8Array(256)` mapping every 8-bit mask to one of ≤48 canonical wall tile indices (standard 47-blob + the fully-surrounded case). Expose `AUTOTILE.wallIndex(mask)`.
- [ ] Implement the **dual-grid-16** floor scheme: `AUTOTILE.floorIndex(state,tx,ty,matchFn)` from the 4 corner-cell memberships (16 combos) — the cheaper, seam-free floor transition. Add an optional `blob47Floor` path for a material that needs inner corners.
- [ ] Add `AUTOTILE.variant(tx,ty,n)` = `(h2(tx,ty)*n)|0` for within-index variety, and `AUTOTILE.mirror(tx,ty)` = `h2(tx+7,ty+3)>0.5` for deterministic flips — same style as the existing hash picks.
- [ ] Keep it pure/stateless (no globals mutated); everything derives from args + `h2`.

#### E2 · Deferred / follow-on slices
- [ ] Wang/edge-trim tiles for floor↔floor material seams between two *different* interior materials (only if a map mixes materials in one room).
- [ ] A headless unit-test harness (Node) that asserts LUT coverage (all 256 masks map to a valid index) and determinism (same coords → same index) — cheap insurance; run before wiring art.

#### E2 · Constraints & safety
- [ ] Determinism: the LUT is static; `variant`/`mirror` use only `h2`. Zero `Math.random`. Verify no call path reads `state.time` (would animate the geometry → desync).
- [ ] Perf: build the 256-entry LUT ONCE at module load, never per-tile; `wallIndex`/`floorIndex` are array lookups + a few comparisons.
- [ ] netRole/save: pure function, nothing serialized.

#### E2 · Verification
- [ ] In the browser console: `AUTOTILE.wallIndex(0b11111111)` returns the surrounded-index; a straight-edge mask returns an edge index; a lone tile returns the isolated index.
- [ ] `AUTOTILE.floorIndex` for a 3×3 patch returns interior=full, edges=edge, corners=corner (spot-check the 16 dual-grid combos).
- [ ] Confirm identical output for the same coords across two page loads (determinism).

---

### Task E3 — Interior atlas registration + `interior*Rect` helpers

#### E3 · Prep / locate
- [ ] Confirm the resilient-atlas pattern to clone: the floors block ([assets.js:70-80](../js/assets.js#L70)) — `const ATLAS_FLOORS=ASSET_BASE+'atlas/floors.webp'`; `new Image()` + `let FLOOR_VAR_READY=false`; `onload/onerror` set the flag; `LOADER.register(img, src, {tag, tier:LOADER.T_GAMEPLAY, weight:1, optional:true})`; `FLOOR_VAR_CELL=128, FLOOR_VAR_N=4`; `floorVarRect(biome,idx){ if(!FLOOR_VAR_READY) return null; … }`.
- [ ] Confirm the multi-slot variant block ([assets.js:109-149](../js/assets.js#L109)) — `FEAT_VAR_CELL=256`, `FEAT_VAR_ROCK_N=8`, `FEAT_VAR_TREE_N=16`, `featVarRect(biome,slot,idx)` returns `[c*CELL, r*CELL, CELL, CELL]`. Interior sheets are laid out the same way: **material rows × tile-index cols**.
- [ ] Confirm `ASSET_BASE='assets/'` ([assets.js:7](../js/assets.js#L7)) and the loader tiers `T_CRITICAL/T_GAMEPLAY/T_AMBIENT` used at [assets.js:52/75/93/160](../js/assets.js#L52).
- [ ] Confirm the blit primitive `_blitOrientedTo(g, img, r, px, py, v, full)` ([render.js:1008](../js/render.js#L1008)) that interior floor tiles will use (same call the floor-variant path uses at [render.js:1222](../js/render.js#L1222)).

#### E3 · First slice (ship this)
- [ ] In [assets.js](../js/assets.js) (after the water block ~line 180), add per-slot interior atlases mirroring the floors block: `ATLAS_INTERIOR_FLOOR = ASSET_BASE+'atlas/interior_floor.webp'`, `..._WALL`, `..._PROP`, `..._DECAL`, `..._EMISSIVE`; an `Image()` + `INTERIOR_*_READY` flag each; `LOADER.register(..., {tag:'atlas:interior-*', tier:LOADER.T_GAMEPLAY, weight:2, optional:true})`.
- [ ] Define layout consts: `INTERIOR_CELL=256` (match `FEAT_VAR_CELL`), `INTERIOR_MAT_ROWS` (one row per material/theme), and the col count = the blob LUT size (≤48) for walls / 16 for floors.
- [ ] Add `interiorFloorRect(mat, idx)`, `interiorWallRect(mat, idx)`, `interiorPropRect(mat, idx)`, `interiorDecalRect(mat, idx)` — each `if(!INTERIOR_*_READY) return null;` then `[col*CELL, row*CELL, CELL, CELL]`, exactly like `featVarRect`.
- [ ] Return `null` from all of them until the webps exist — the E4 render hooks fall back to procedural, so the game runs art-free.

#### E3 · Deferred / follow-on slices
- [ ] Precompute a per-material opaque-bounds trim for props (mirror `buildMtnTrim` at [assets.js:126](../js/assets.js#L126)) so props crop tight — only needed once real prop art lands.

#### E3 · Constraints & safety
- [ ] All interior atlases `optional:true` — a missing webp keeps `INTERIOR_*_READY=false` and the renderer falls back to procedural (the save/perf/co-op story is unchanged when art is absent).
- [ ] netRole/save: art only; nothing serialized or networked.

#### E3 · Verification
- [ ] With no interior webps present, load a `biomes:['interior']` map — no console errors, `interiorFloorRect(...)` returns `null`, floor renders procedurally.
- [ ] Drop a placeholder `assets/atlas/interior_floor.webp` — `INTERIOR_FLOOR_READY` flips true on load and `interiorFloorRect` returns a rect.

---

### Task E4 — `drawTile` floor branch + `drawFloorDeco` decal case

#### E4 · Prep / locate
- [ ] Confirm `drawTile(state,tx,ty,px,py)` ([render.js:1207](../js/render.js#L1207)): it reads `t=tiles[i]`, `b=biome[i]`, `v=variant[i]`; water short-circuits ([render.js:1213](../js/render.js#L1213)); `slot = t===T_ROCK?'rock':t===T_TREE?'tree':'floor'` ([render.js:1219](../js/render.js#L1219)); the `FLOOR_VAR_READY` branch blits `FLOOR_VAR_IMG` and returns ([render.js:1220-1223](../js/render.js#L1220)); else `spriteFor(b,slot)` ([render.js:1224](../js/render.js#L1224)); else procedural `BIOME_PAL` fill + `drawFloorDeco` ([render.js:1227-1233](../js/render.js#L1227)).
- [ ] Confirm the same floor-var branch also exists in the **chunk-bake** path ([render.js:1053](../js/render.js#L1053) / `_blitOrientedTo` at [render.js:1058](../js/render.js#L1058)) — big zoomed-out maps bake static terrain into offscreen chunks, so the interior floor branch must be added **in both places** or interiors won't show when baked.
- [ ] Confirm `drawFloorDeco(state,b,v,px,py)` ([render.js:1238](../js/render.js#L1238)) is a `switch(b)` with cases `B_TECH`/`B_DESERT`/`B_ICE`/`B_VOLCANIC`/`default` — the `B_INTERIOR` decal case slots in here.
- [ ] Confirm `bakeDecals(g,state,tx0,ty0)` ([render.js:202](../js/render.js#L202), called from the chunk bake at [render.js:1070](../js/render.js#L1070)) is where baked `GROUND_DECAL`-band ground detail lives.

#### E4 · First slice (ship this)
- [ ] In `drawTile` right after the `FLOOR_VAR_READY` block ([render.js:1220](../js/render.js#L1220)): add `if(b===B_INTERIOR && typeof INTERIOR_FLOOR_READY!=='undefined' && INTERIOR_FLOOR_READY){ const mi=interiorMatFor(state,tx,ty); const idx=AUTOTILE.floorIndex(state,tx,ty,interiorFloorMatch); const r=interiorFloorRect(mi, idx); if(r){ _blitOrientedTo(ctx, INTERIOR_FLOOR_IMG, r, px, py, v, true); return; } }`.
- [ ] Mirror that exact branch into the chunk-bake loop (~[render.js:1053](../js/render.js#L1053)) blitting into the chunk ctx `g` via `_blitOrientedTo(g, INTERIOR_FLOOR_IMG, r, (tx-tx0)*TILE, (ty-ty0)*TILE, v, true)`.
- [ ] Add a `case B_INTERIOR:` to `drawFloorDeco` ([render.js:1238](../js/render.js#L1238)): deterministically scatter a couple of procedural interior marks (panel seam line, occasional rivet/scuff) gated by `v`/`h2(tx,ty)` at ~5–15% density — this is the art-free fallback and the base under baked decals.
- [ ] When the decal sheet lands, extend the case to blit `interiorDecalRect(mi, (h2(tx,ty)*N)|0)` for hash-selected tiles (route baked stamps through `bakeDecals`).

#### E4 · Deferred / follow-on slices
- [ ] Wet-floor neon reflection smears (baked into the floor variant art, not code) — index a "wet" floor variant near emissive props.
- [ ] Material-transition trim tiles (E2 deferred) if a room mixes interior materials.

#### E4 · Constraints & safety
- [ ] Determinism: material + index + scatter all derive from coords/`h2`; no `state.time` in the floor branch (static floor). Verify the baked-chunk path produces the same pixels as the live path (the codebase already guarantees this via the shared `_blitOrientedTo` scaling — [render.js:1026](../js/render.js#L1026) note).
- [ ] netRole: render-only, identical host/client.
- [ ] Art direction: floor stays dark; decals subtle.

#### E4 · Verification
- [ ] `biomes:['interior']` map with `INTERIOR_FLOOR_READY` false: floor shows procedural interior deco (panel seams), no grid checkerboard.
- [ ] With a floor webp present: tiles autotile (edges/corners differ from centers), no visible seams at the 50%-scroll test, and **fully zoom out** to force chunk-bake — baked interior matches the live tiles.
- [ ] Toggle `?perf=1` and confirm no p95 regression vs a normal biome (floor path is one blit like the others).

---

### Task E5 — `state.interiorFeatures`: walls / caps / props / overhangs in the depth sort

#### E5 · Prep / locate
- [ ] Confirm the depth-collection block in `render()` ([render.js:591-650](../js/render.js#L591)): features push `depth.push({y:(f.ty+fh)*TILE, f, dim:…})` ([render.js:608](../js/render.js#L608)); buildings `{y:(e.ty+e.h)*TILE, b:e, dim}` ([render.js:640](../js/render.js#L640)); units `{y:e.y, u:e}` ([render.js:644](../js/render.js#L644)). The array is sorted `(a.y-b.y) || ((a.tie||0)-(b.tie||0))` at [render.js:672](../js/render.js#L672) (deterministic tiebreak).
- [ ] Confirm the draw switch consumes those keys (`d.f`/`d.b`/`d.u`/`d.m`/`d.chain`/`d.corpse`/`d.wreck`) after the sort — a new `d.interior` case joins there.
- [ ] Confirm the walk-under canopy + occluded-unit ghost: `drawFeatureSprite` ([render.js:1680](../js/render.js#L1680)) with `if(under) ctx.globalAlpha*=0.42` ([render.js:1585](../js/render.js#L1585)); the ghost re-draw uses `u._ghostBlit` set at [render.js:2615](../js/render.js#L2615) and consumed ~[render.js:732-745](../js/render.js#L732). Overhangs inherit this — no new occlusion code.
- [ ] Confirm how passability is set: `state.blocked[i]` (0/1) with `baseBlocked(state,i)` the default; features set the mask (`state.feat[i]===2` = blocking, e.g. [map.js:246](../js/map.js#L246)). Interior walls set `blocked[i]=1` and a feat mask so pathing and the shore-carve treat them as solid.

#### E5 · First slice (ship this)
- [ ] Introduce `state.interiorFeatures = []` (populated in E7), each `{tx,ty,w,h,room,slot,mask,variant}` with `slot ∈ {wall,wallcap,pillar,prop,door,overhang}`.
- [ ] In the depth-collection block ([render.js:~630](../js/render.js#L630)), iterate visible+fog-gated `interiorFeatures` and `depth.push({y:(inf.ty+inf.h)*TILE, interior:inf, tie:(inf.tx*131+inf.ty)&255, dim:state.visible[si]!==1})` (deterministic `tie` so overlapping walls layer identically cross-peer).
- [ ] Add `else if(d.interior) drawInteriorFeature(state, d.interior, d.dim)` to the draw switch.
- [ ] Implement `drawInteriorFeature`: for `slot==='wall'`, compute `AUTOTILE.wallIndex(mask8(...))`, blit `interiorWallRect(mat,idx)` at the tile; then blit `interiorWallRect(mat, capIndex)` **offset up by wall-height px** as the cap (same depth entry → sorts as one tall object). For `slot==='overhang'`, draw in the CANOPY band (after actors) so units pass under. Props/pillars/doors are single Y-sorted blits like features. Procedural fallback = a flat dark rectangle + rim when `INTERIOR_WALL_READY` is false.
- [ ] Ensure walls set `state.blocked[i]=1` at stamp time (E7) so units path around them.

#### E5 · Deferred / follow-on slices
- [ ] 2×2–4×2 **set-pieces** (GRAAL altar, reactor core, airlock) as multi-tile `interiorFeatures` with a `w`/`h` footprint and a single large sprite — the periodicity-breakers from the design doc.
- [ ] Destructible interior props (crates as cover) — only if a mission wants it; default interior props are scenery-static (like `e.scenery`).
- [ ] Door open/close animation tied to unit proximity (cosmetic, `!_rbReplaying`-guarded like [villains.js:282](../js/villains.js#L282)).

#### E5 · Constraints & safety
- [ ] Determinism: `mask8`/`wallIndex`/`variant`/`tie` all coord-derived; no `Math.random`. Overhang alpha uses the existing ghost path, not time-based flicker.
- [ ] Pathing: walls must be in `blocked[]` **before** `carveBridgesToTargets` ([map.js:652](../js/map.js#L652)) — enforced by stamping in E7 pre-carve. Verify a wall ring around a gold node gets a carved door, never strands it.
- [ ] Perf (fill-bound): wall = 2 blits (face+cap); cap only when the tile has an open top neighbor. Cull off-screen `interiorFeatures` before push (mirror the feature cull). Gate any emissive to E6.
- [ ] netRole: geometry from `cfg`, identical everywhere; nothing serialized (E8).

#### E5 · Verification
- [ ] Author a test room (E7) — walls Y-sort with units: a unit **above** a wall is occluded by it (walks behind), a unit **below** draws in front; the cap sits above the face.
- [ ] Command a unit across the room — it paths **around** walls, **through** the door gap; never onto a wall tile.
- [ ] Place an `overhang` (catwalk) — a unit passing under it renders as the faint ghost (existing occlusion), the catwalk draws over.
- [ ] Fog: walls in unexplored fog are hidden; revealed on scout.

---

### Task E6 — `INTERIOR_NEON` emissive pass + `BIOME_GRADE[B_INTERIOR]` post grade

#### E6 · Prep / locate
- [ ] Confirm `drawMegaNeonLayer(state, m, glows, dx,dy,dw,dh, layer)` ([megasprites.js:391](../js/megasprites.js#L391)): `layer==='core'` uses `globalCompositeOperation='lighter'` (additive), `'aura'` uses `source-over`; `m.noBreath` freezes animation, `m.cacheGrad` reuses gradients — the exact opts buildings pass ([render.js:1939-1965](../js/render.js#L1939)).
- [ ] Confirm the LOD/QUAL gates the neon must copy: `NEON_LOD_ZOOM=0.8` ([render.js:94](../js/render.js#L94)) and the `if(QUAL.level>=2) return;` drop used across the FX passes ([render.js:1123](../js/render.js#L1123), [render.js:1173](../js/render.js#L1173)).
- [ ] Confirm `applyPostStack(state,z,vx,vy)` ([render.js:246](../js/render.js#L246)) runs the per-biome `BIOME_GRADE` multiply + vignette and early-returns under `QUAL.level>=2` ([render.js:247](../js/render.js#L247)).
- [ ] Confirm the FX band ordering: `drawLightFX` runs at [render.js:790](../js/render.js#L790) (after actors, before fog) — `INTERIOR_NEON` belongs in the same FX window.

#### E6 · First slice (ship this)
- [ ] Add `drawInteriorNeon(state, ox,oy, x0,y0,x1,y1)` called in the FX band (near [render.js:790](../js/render.js#L790)); early-return on `QUAL.level>=2` and when zoom `< NEON_LOD_ZOOM` (single cheap layer below, full below-that as megas do).
- [ ] For each on-screen emissive interior feature (doors, objective props, `slot`-tagged emissive tiles), build a small `glows` list and call `drawMegaNeonLayer(state, {seed:(inf.tx*73+inf.ty), noBreath:true, cacheGrad:true}, glows, dx,dy,dw,dh, 'core')` — additive, static, cached (perf).
- [ ] Reserve the **brightest** glow for doors/objectives/resource nodes; ambient strip glow (if any) stays dim — the readability rule.
- [ ] Add a real `BIOME_GRADE[B_INTERIOR]` per-theme tint (E1 set a neutral default) — small alpha ~0.12–0.16 so units stay legible.

#### E6 · Deferred / follow-on slices
- [ ] Per-theme emissive maps (`INTERIOR_NEON_MAPS`, mirroring [building_neon_maps.js](../js/building_neon_maps.js)) auto-derived from the emissive webp — only when the emissive sheets exist.
- [ ] Optional breathing/flicker (`noBreath:false`) on damaged-panel/warning props per theme — perf-gate first.
- [ ] `?nointneon=1` A/B flag (mirror the megas' `?nomtnchain` pattern) for perf comparison.

#### E6 · Constraints & safety
- [ ] Perf: `noBreath:true` + `cacheGrad:true` (static, cached gradients); gate on `QUAL.level<2` + `NEON_LOD_ZOOM`; cull to the visible rect. Measure on `?perf=1` and a real mobile GPU **before** shipping (render is fill-bound).
- [ ] Determinism/netRole: neon is cosmetic-local (`seed` from coords, no sim state) — safe on clients, never networked, never serialized.
- [ ] Art direction: additive light is an ACCENT on a dark floor; if the floor starts glowing, dial `BIOME_GRADE` alpha down and cut ambient strips.

#### E6 · Verification
- [ ] Doors/objectives glow; the floor stays dark; units and selection rings read clearly against every theme.
- [ ] `?perf=1` A/B: p95 within budget vs neon-off; on a narrow/mobile viewport the pass drops at `QUAL.level>=2` with no pop.
- [ ] Zoom below `NEON_LOD_ZOOM` — neon degrades to the cheap layer, never disappears entirely.

---

### Task E7 — `cfg.interiors` room stamps + `map_paint.js` interior keys

#### E7 · Prep / locate
- [ ] Confirm the `cfg.scenery` sibling to mirror: schema `[{type,x,y}]` in maps_data ([maps_data.js:482](../js/maps_data.js#L482)); placed by `spawnScenery`/`applyScenery` ([map.js:433-445](../js/map.js#L433)); factored out of `newMap` specifically so the save loader can re-run it ([map.js:422](../js/map.js#L422) comment).
- [ ] Confirm `newMap` ordering ([map.js:472](../js/map.js#L472)): terrain gen → `despeckleWater` ([map.js:595](../js/map.js#L595)) → `blocked` init ([map.js:648](../js/map.js#L648)) → `carveBridgesToTargets(cfg.goldNodes.concat(bases))` ([map.js:652](../js/map.js#L652)) → `despeckleBiome` ([map.js:656](../js/map.js#L656)) → `applyPaintLayer` ([map.js:662](../js/map.js#L662)) → water-depth rebuild ([map.js:665](../js/map.js#L665)) → scenery props ([map.js:762](../js/map.js#L762)) → node-unbury ([map.js:809](../js/map.js#L809)) → `clearStartBuildingGround` ([map.js:850](../js/map.js#L850)). **Interior stamping must run before the reachability carve** (or re-carve after, like paint does).
- [ ] Confirm `applyPaintLayer(state,cfg,targets)` ([map.js:448](../js/map.js#L448)) calls `MAP_PAINT.apply` then **re-runs** `carveBridgesToTargets` ([map.js:451](../js/map.js#L451)) — the template for "stamp overrides, then guarantee reachability."
- [ ] Confirm `MAP_PAINT` in [map_paint.js](../js/map_paint.js): `TARGETS` char-keyed with `{ch,tile,biome,feat,clearFeat}` ([map_paint.js:20-39](../js/map_paint.js#L20)); `apply` guards W/H and `applyOps` writes sorted-by-index (deterministic) ([map_paint.js:79-110](../js/map_paint.js#L79)). Adding interior keys here makes them paintable in `map-editor.html`.

#### E7 · First slice (ship this)
- [ ] Add `applyInteriors(state, cfg)` in [map.js](../js/map.js) next to `applyScenery`/`applyPaintLayer` (~[map.js:422-455](../js/map.js#L422)): for each `cfg.interiors[]` room `{tx,ty,w,h,room,template}`, stamp the floor (`biome[i]=B_INTERIOR`, `tiles[i]=T_DIRT` passable) across the footprint, set `blocked[i]=1` + a wall feat mask on the perimeter (leaving `door` gaps), and push `interiorFeatures` (walls/caps/pillars/props from the `template`).
- [ ] Call `applyInteriors(state,cfg)` in `newMap` **before** the reachability carve at [map.js:652](../js/map.js#L652) (so a wall can be bridged with a door), OR immediately after and re-run `carveBridgesToTargets(state, cfg.goldNodes.concat(bases), cfgLandBiome(cfg))` like `applyPaintLayer` does — pick one and document it. Prefer the paint pattern (stamp then re-carve) for symmetry.
- [ ] Add interior `TARGETS` to [map_paint.js:20](../js/map_paint.js#L20): `i` → `{ch:'i', tile:T_DIRT, biome:B_INTERIOR}` (interior floor), `W` → `{ch:'W', tile:T_DIRT, biome:B_INTERIOR, feat:<INTERIOR_WALL>}` (interior wall). This makes freeform rooms paintable; `cfg.interiors` handles rectangular rooms + templated props.

#### E7 · Deferred / follow-on slices
- [ ] Map-editor UI: add the interior floor/wall targets to the paint dropdown in `map-editor.html`/[map-editor.js](../js/map-editor.js) so rooms are mouse-drawn.
- [ ] Room `template` library (e.g. `'graal-altar'`, `'reactor-hall'`, `'ripperdoc-bay'`) that pre-places set-pieces + props procedurally from a small data table — the fastest way to author varied rooms.
- [ ] `cfg.interiorTheme` per map (or per room) selecting the material atlas + `BIOME_GRADE` (E1 deferred).

#### E7 · Constraints & safety
- [ ] Reachability: after stamping, EVERY gold node + base + objective must stay reachable — rely on the post-stamp `carveBridgesToTargets` (map's own guard). Test a room that encloses a node → a door is carved.
- [ ] Determinism: room stamping is a pure function of `cfg` (fixed coords) + `h2` for prop variety; no rng except the seeded `makeRng` paint uses ([map.js:450](../js/map.js#L450)).
- [ ] Save-compat: `cfg.interiors` unset → `applyInteriors` is a no-op → fully backward compatible (like `cfg.paint`/`cfg.scenery`).

#### E7 · Verification
- [ ] Author a `cfg.interiors:[{tx,ty:…,w:12,h:10,template:'test'}]` on a scratch map; load: a walled room appears with a door, dark interior floor inside, open terrain outside.
- [ ] Place a gold node inside the room → confirm it's mineable (a door was carved; the node-unbury pass at [map.js:809](../js/map.js#L809) didn't have to fire, but reachability holds).
- [ ] Paint an `i`/`W` room in `map-editor.html`, save the map, reload the game — the painted room persists via `cfg.paint`.

---

### Task E8 — Save `SKIP` + on-load `applyInteriors` rebuild (no version bump)

#### E8 · Prep / locate
- [ ] Confirm `SAVE_VERSION=2` ([save.js:6](../js/save.js#L6)) and `saveVersionOk` ([save.js:44](../js/save.js#L44)) — the target is to add interiors with **no bump**.
- [ ] Confirm the state-level `SKIP` set ([save.js:111](../js/save.js#L111)): `{cfg, visible, ..., blocked, explored, feat, waterDepth, ..., roadTiles, roadMask, roadCost, roadAxis}` — the DERIVED grids that are rebuilt on load, never serialized. `serializeGame` writes everything not in `SKIP` ([save.js:114](../js/save.js#L114)), including `tiles`/`biome`/`megaSprites` (JSON-safe arrays).
- [ ] Confirm the on-load re-derivation that interiors mirror: `deserializeGame` ([save.js:163](../js/save.js#L163)) rebuilds `g.cfg=scaleCfg(MAPS[idx])` ([save.js:171](../js/save.js#L171)), then re-runs `applyScenery(g,cfg)` ([save.js:146](../js/save.js#L146)) and `applyPaintLayer(g,cfg,…)` ([save.js:153-155](../js/save.js#L153)); the feature mask `feat` is rebuilt from `features[]` ([save.js:190](../js/save.js#L190)) and `waterDepth` from `tiles` ([save.js:196](../js/save.js#L196)).
- [ ] Note: `blocked` is `SKIP`'d and NOT explicitly re-stamped for interior walls unless `applyInteriors` runs on load — so the on-load `applyInteriors` call is what restores wall passability.

#### E8 · First slice (ship this)
- [ ] Add `interiorFeatures:1` to the `SKIP` set ([save.js:111](../js/save.js#L111)) so it's never serialized (it's fully derivable from `cfg.interiors`/`cfg.paint`).
- [ ] In `deserializeGame`, next to the existing `applyScenery`/`applyPaintLayer` calls ([save.js:146-155](../js/save.js#L146)), add `if(typeof applyInteriors==='function') applyInteriors(g, cfg);` — this re-stamps `blocked[]` walls + repopulates `interiorFeatures` from `cfg`. Order it **before** any reachability re-carve it triggers, matching `applyPaintLayer`.
- [ ] Confirm `tiles[]`/`biome[]` (serialized) already carry the interior floor tiles, so the floor renders immediately on load; only the derived walls/features need the `applyInteriors` rebuild.

#### E8 · Deferred / follow-on slices
- [ ] If a mission ever mutates interiors at runtime (a destructible wall blown open), persist just that delta as a small `cfg`-independent field (append-only, legacy-default empty) — not needed for static interiors.

#### E8 · Constraints & safety
- [ ] Save-compat: no `SAVE_VERSION` bump; an old save with no `cfg.interiors` → `applyInteriors` no-op → loads identically. A save of an interior map re-derives geometry from `MAPS[idx]` cfg on load (the same source `newMap` used).
- [ ] netRole: co-op clients already regen terrain via their own `newMap` from `cfg` ([save.js:138](../js/save.js#L138)) → identical interiors host+client with **no snapshot field** (`js/net/sync.js` untouched).
- [ ] Determinism: on-load stamp uses the same `cfg` + seeded rng as `newMap`, so a loaded interior is byte-identical to a freshly-generated one.

#### E8 · Verification
- [ ] Load an interior map, save mid-mission, reload the save: the room, walls (pathing), doors, props, and floor are identical; units still path around walls.
- [ ] Load a **legacy** save (pre-interior map) — loads with no error, no `SAVE_VERSION` warning.
- [ ] Co-op: host on an interior map, client joins — client's interior matches host's exactly (walls, doors, decals); confirm nothing interior-related appears in the snapshot.

---

## Track G — art generation (offline; needs `_dev/.env` `GEMINI_API_KEY`)

> **Do the budget gate first** (see build order). All `G#` bill against [_spend.mjs](../_dev/gen/_spend.mjs)
> (`$0.134`/img ≤2K, `$0.24`/img 4K; hard `$30` cap that THROWS; `.gen_spend.json` = `$12.37` spent).

### Task G1 — `_dev/gen/gen_interiors.mjs`

#### G1 · Prep / locate
- [ ] Read [gen_floor_variants.mjs](../_dev/gen/gen_floor_variants.mjs) end-to-end — the ideal clone: reads `GEMINI_API_KEY` from `_dev/.env`; `MODEL='gemini-3-pro-image-preview'`; `generationConfig:{responseModalities:['IMAGE'], imageConfig:{aspectRatio:'1:1', imageSize:'2K'}}`; concurrency 5; retry on 5xx/429; **skip-if-exists** so re-runs fill only gaps.
- [ ] Read [_spend.mjs](../_dev/gen/_spend.mjs): `PRICE={'1K':0.134,'2K':0.134,'4K':0.24}`, `CAP=30`, `addSpent(priceFor(res))` throws if it would exceed. Import and call it per successful image.
- [ ] Note the seamless-tile prompt contract in [gen_floor_variants.mjs:20](../_dev/gen/gen_floor_variants.mjs#L20) and [terrain-dark.md](../_dev/prompts/terrain-dark.md): *"seamless TILEABLE … UNIFORM edge to edge … strict top-down, flat even lighting, no cast shadows … dark devastated cyberpunk … no text/UI/frame."* Reuse it verbatim for interior floors/walls.

#### G1 · First slice (ship this)
- [ ] Create `_dev/gen/gen_interiors.mjs`: a `THEME × SHEET` job list (Dark Tower / Spacecraft / Clinic / Industrial × floor_A/floor_B/floor_decals/wall_face/wall_cap/props/setpieces/overhang/emissive), each with its own prompt built from a shared `STYLE` contract + a per-sheet material clause.
- [ ] Use `imageSize:'4K'` for dense autotile grids (`wall_face` blob-48, floors) and `'2K'` for decal/overhang/emissive; **generate each material as ONE seamless grid** (the model fills a labeled N×M cell layout with magenta gutters), never 48 separate images.
- [ ] Lock lighting/perspective in EVERY prompt (`"flat even lighting, lit from top-left, no cast shadows, no vignette, orthographic top-down"`) + a per-theme locked palette clause — the anti-seam / anti-drift mitigations.
- [ ] Import `_spend.mjs`; `resetIfFlag()`; abort before a call if `remaining()<=0`; `addSpent(priceFor(res))` on each saved image. Save `interior_<theme>_<sheet>.png`.
- [ ] **If the budget gate chose Batch:** add a `--batch` path that submits the job list to the Gemini Batch endpoint (−50%) instead of the sync `generateContent` loop.

#### G1 · Constraints & safety
- [ ] Spend cap: never bypass `_spend.mjs`; the run must abort cleanly (not half-write a sheet) when the cap is hit.
- [ ] Idempotent: skip-if-exists so a re-run after a cap-abort resumes without re-billing done sheets.
- [ ] Determinism is a GAME concern, not a gen concern — but keep the cell layout fixed so `slice_interiors.py` (G2) can index it.

#### G1 · Verification
- [ ] Dry-run the job list (log prompts + projected cost) BEFORE spending; confirm the projected total fits `remaining()`.
- [ ] Generate ONE Dark Tower floor sheet; open the PNG — seamless grid, magenta gutters, dark palette, correct top-down lighting; `.gen_spend.json` incremented by exactly one image's price.

### Task G2 — `_dev/gen/slice_interiors.py`

#### G2 · Prep / locate
- [ ] Read [slice_feature_variants.py](../_dev/gen/slice_feature_variants.py) — the clone: chroma-keys a solid-magenta grid → transparent cut-outs, despills the magenta fringe, crops, scales to fit the cell, feathers the alpha, packs a `BIOMES-rows × COLS` webp; consts `CELL=256`, `FIT=236`, output path under `assets/atlas/`.
- [ ] Confirm the slice grid must match the E3 atlas layout consts (`INTERIOR_CELL`, material rows, wall/floor col counts) — the Python `CELL`/`COLS`/rows are the source of truth the JS `interior*Rect` mirrors (see the *"must match FEAT_VAR_ROCK_N/TREE_N in js/assets.js"* comments at [slice_feature_variants.py:19-22](../_dev/gen/slice_feature_variants.py#L19)).

#### G2 · First slice (ship this)
- [ ] Create `_dev/gen/slice_interiors.py`: for each theme/sheet PNG from G1, magenta-key → transparent, crop each labeled cell, feather, and pack into `assets/atlas/interior_<slot>.webp` (floor/wall/prop/decal/emissive), material rows × tile-index cols, `CELL=256`.
- [ ] Emit a tiny manifest (rows→material, cols→tile-index) so E3's `interior*Rect` indexing is unambiguous; keep the col order = the E2 blob/dual-grid LUT order.
- [ ] Run [optimize_assets.py](../_dev/gen/optimize_assets.py) (q85) on the output webps, as the other atlases do.

#### G2 · Constraints & safety
- [ ] Magenta key (not green) so interior neon/cyan art isn't keyed as background (the design-doc gotcha).
- [ ] The wall sheet keeps hard edges (walls are opaque with a lit cap) — don't over-feather wall cells or the autotile seams show.

#### G2 · Verification
- [ ] Slice the G1 Dark Tower floor sheet → `assets/atlas/interior_floor.webp`; load the game on an interior map — `INTERIOR_FLOOR_READY` true, floor autotiles from real art, no magenta fringe, no seams at the 50%-scroll test.

### Tasks G3–G6 — the four themes

> Each theme = author the per-sheet prompts (material clauses) in G1's job list, generate, slice (G2),
> register (already done in E3), and tune. **G5/G6 reuse G4's wall/floor cell topology** (same layout,
> different material words) so only the material/palette changes — cost stays per-material.

#### G3 · Dark Tower (first real theme)
- [ ] Prep: reconfirm the palette/material brief (near-black polished panel + toxic-green seams; matte-black bulkheads + tinted glass + logo signage; GRAAL altar set-piece; gold rim on hero props) against [interior-tilesets.md §5 G3](interior-tilesets.md) and canon in [world-bible.md](world-bible.md).
- [ ] First slice: generate floor_A/floor_B/wall_face/wall_cap/floor_decals + the GRAAL-altar setpiece; slice; load on a scratch interior map; tune palette + `BIOME_GRADE[B_INTERIOR]` tower variant.
- [ ] Deferred: props (server racks, netrunner chairs, corpse-rigs), overhang (catwalks/ducts), emissive (green seam strips, logo signage), A&O-green recolor (G7).
- [ ] Constraints: floor stays dark; green is an ACCENT; gold ONLY on hero props. Determinism/save = engine's (art is passive).
- [ ] Verify: the room reads as an A&O corporate altar; units + rings legible; `?perf=1` clean.

#### G4 · Spacecraft
- [ ] Prep: material brief (riveted gunmetal deck + grating-over-void; ribbed bulkheads, blast doors, airlocks, conduits; reactor-core setpiece; cyan/teal + amber). This theme DEFINES the reusable wall/floor topology G5/G6 inherit.
- [ ] First slice: floor_A (deck) / floor_B (grating) / wall_face / wall_cap / reactor setpiece; slice; tune.
- [ ] Deferred: props (cryo-pods/consoles/coolant tanks/hatches), overhang (pipe runs), emissive (cyan seams / amber warnings / panel flicker), the see-through-grating lower-deck plate (design-doc parked item).
- [ ] Verify: reads as an Ascent-style starship deck; grating vs deck floors autotile distinctly; perf clean.

#### G5 · Clinic (reskin of G4 topology)
- [ ] Prep: reuse G4's wall/floor cell layout; swap material words to ripperdoc (sickly-green/off-white tile + blood-drain grids; prosthesis-display wall insets; med couches / robot-assembly / ice baths / VR chairs; ONE hot magenta-red hazard accent).
- [ ] First slice: regenerate ONLY the material sheets that differ (floor_A/B, wall_face insets, floor_decals, key props); reuse G4 `wall_cap`/topology where identical.
- [ ] Verify: reads as a CP2077 ripperdoc bay; the single hazard accent pops; floor stays dark-clinical.

#### G6 · Industrial/Slum (reskin of G4 topology)
- [ ] Prep: reuse G4 topology; material words → cracked concrete / rusted steel platforms / corrugated-rust walls + graffiti + dead CRTs; machinery/barrels/crates/pipes/neon-sign props; rust + sodium-amber neon.
- [ ] First slice: regenerate differing material sheets; reuse shared topology; add flickering-sign emissive.
- [ ] Verify: reads as CP2077 entropism/Ascent grime; harsh sodium pools against deep shadow; perf clean.

### Task G7 — Faction recolors ($0)
- [ ] Prep: read [recolor_ao.py](../_dev/gen/recolor_ao.py) (cyan→toxic-green pure-pixel transform, `$0`, accepts webp).
- [ ] First slice: produce A&O-green (Dark Tower), and any corpo-red / rust faction skins of shared corpo/industrial sheets via the recolor transform; register the recolored webps in E3's loader block.
- [ ] Constraints: recolor is a hue transform, NOT a material change — only use it for faction TINTS of the same art, never to fake a different material (that needs real generation).
- [ ] Verify: the recolored sheet loads and reads as the faction variant; `.gen_spend.json` unchanged ($0).

---

## Track M — campaign wiring

### Task M1 — First interior episode (Dark Tower interior) via `starleft-mapmaker`
- [ ] Prep: use the `starleft-mapmaker` skill (owns the `MAPS` schema, generator, lore, crawl/TTS; see [CLAUDE.md](../CLAUDE.md)) — do NOT hand-edit the `MAPS` array. Confirm the Dark Tower already anchors the GRAAL/Ep XI holdout ([maps_data.js:482-500](../js/maps_data.js#L482)) as the natural story beat for "storm the tower's inside."
- [ ] First slice: author one map (or convert an existing tower-adjacent map's interior sub-zone) with `terrain:{biomes:['interior']}` (or a mixed exterior→`cfg.interiors` interior room), a Dark Tower `interiorTheme`, objectives inside the walls, and the reachability guard verified.
- [ ] Deferred: spacecraft/clinic/industrial episodes on later beats; crawl + TTS via the mapmaker pipeline.
- [ ] Constraints: run the map through the mapmaker's schema validation + headless verify (note the stale-harness fixups tracked in project memory) — bases/resources/objectives reachable, no masks stranded by interior walls.
- [ ] Verify (full loop): load the interior episode; select units, move/attack/gather, place a building, train a unit, win/lose; save/load; co-op host+client. Check desktop AND narrow/mobile viewports (HUD height drives viewport math).

---

## Cross-cutting verification (run once the engine + first theme land)

- [ ] **Determinism/co-op** — host + client on the same interior map: identical autotiling, decals, wall layout, door positions (proves every pick is `h2`-pure); nothing interior in the snapshot (`js/net/sync.js` unchanged).
- [ ] **Save round-trip** — save/reload an interior map: geometry + pathing identical; a legacy pre-interior save still loads (no `SAVE_VERSION` bump).
- [ ] **Reachability** — a room enclosing a gold node/base/objective always gets a carved door; `carveBridgesToTargets` never strands.
- [ ] **Perf** — `?perf=1` p95 within budget vs a normal biome, with walls + neon on; re-check on a **real mobile GPU** (render is fill-bound). Emissive drops cleanly at `QUAL.level>=2`.
- [ ] **Readability** — units, selection rings, floaters, and fog read against all four themes on desktop and narrow/mobile; floor stays dark, neon only on objectives.
- [ ] **Budget** — final `.gen_spend.json` under the (possibly-raised) cap; log any sheet dropped for budget so coverage isn't silently truncated.
