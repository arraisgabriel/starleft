# STARLEFT — 4× Walk-Under Topography + Cramped Thicket Trails

*Implementation plan. Nothing here is built yet — this is the design of record for a future change.*

---

## Context

The topography sprites in `assets/atlas/tileset.png` (trees, rocks, one per biome row) are beautiful, reasonably-sized 128×128 designs that today are squeezed into a single 32px tile. We want to **use them 4× bigger** — each tree / rock occupies a **2×2 block (4 tiles)** instead of one — to improve the game's read and tactical terrain:

- The **lower 2 blocks** (bottom row of the 2×2) must **deny passage**, exactly as the single tile does today.
- The **upper 2 blocks** (top row) must be **traversable**, and units must **walk *under* them** — passing behind the tree's branches / behind the top of a rock (occluded by the canopy, like walking behind a tall building).
- Separately, study/design a map-generation mode that **"cramps up"** trees and stones densely while leaving a **guaranteed traversable trail** winding between them.

Intended outcome: a richer, more vertical battlefield where forests and boulder fields become real cover and chokepoints you fight *through* and *under*, not just flat walls you route around.

> **Art-direction note:** all art stays dark / devastated / Hades-toned cyberpunk — never bright. Any new feature sprites must match the existing atlas palette.

---

## What exists today (the mechanics this builds on)

| Concern | Where | Behavior today |
|---|---|---|
| Tile size | `config.js:5` | `TILE = 32` px |
| Terrain types | `config.js:24-25` | `T_GRASS,T_DIRT,T_WATER,T_ROCK,T_TREE`; `passableTerrain(t)= grass||dirt` |
| Collision grid | `map.js:162,187` | `state.blocked` Uint8Array(W·H); built once: `blocked[i]=passableTerrain(tiles[i])?0:1` |
| Pathfinding | `units.js` `findPath` | A* (8-dir). The **only** traversability predicate is `if(B[key]) continue;` where `B=state.blocked`. No-diagonal-through-corners also reads `B`. |
| Push-out | `units.js` `separation` | ground unit on a blocked tile is shoved to nearest open neighbor; reads `blocked` only |
| Render order | `render.js:84-122` | **(1)** terrain pass draws **every** tile via `drawTile()` — including `T_TREE/T_ROCK` as flat 32px stamps — **before** units. **(2)** depth-sort pass: megaSprites + buildings + units pushed into `depth[]`, sorted by ground-line `y`, drawn in order. **This is the only pass where a sprite can draw *over* a unit** — and it's how units already "walk under tall buildings." Trees/rocks are **not** in it today, so units always draw over trees → no walk-under today. |
| Depth keys | `render.js:111-114` | building `(ty+h)·TILE`, unit `e.y` (center), mega `megaSortY=(ty+h)·TILE` |
| Atlas cells | `assets.js:20-39` | `ATLAS_CELL=128`; `SLOT_COL={floor:0,rock:1,tree:2}`; **each feature cell bakes its own opaque ground** ("a feature tile is the whole 32px blit") → cells are **opaque**, no alpha |
| Generation | `map.js` | noise biomes → mountain-range rock (`map.js:105`, **must stay impassable**) → procedural groves (`:108`) → `cfg.rockClusters` (`:128`) → `cfg.forests` (`:133`) → `clearArea` pads (`:142`) → `despeckleWater` (`:156`) → blocked build (`:187`) → reachability bridge-carve (`:189-205`) → `placeMegaSprites` (`:215`). Seeded LCG `makeRng` (`state.js:9`); `verify_geometry.js` re-runs `newMap` twice and asserts identical `tiles`+`biome`. |
| Save/load | `save.js` | `serializeGame` (`:40-42`) copies **every** non-`SKIP` key on `G` generically (its own comment notes `megaSprites` rides along); `blocked` is explicitly saved (`:46`) and restored verbatim (`:61`), **not** rebuilt on load. |
| Building (un)block | `map.js:414-419` | `markBuilding` reconciles `blocked` from `tiles[]` only |
| Build placement | `units.js:178-185` | `canPlaceAt` rejects a cell if `blocked` or not `explored` |

**Key facts that make this tractable:** `T_TREE`/`T_ROCK` are pure obstacle+decoration (only referenced in `drawTile`, minimap color `render.js:610-611`, and generation — never harvested, never LOS). Pathfinding reads `state.blocked` and nothing else. So **partial passability is achievable by editing only the `blocked` grid** — no pathfinding changes.

---

## Design overview

Introduce a lightweight **topography feature** object, modeled on the existing `megaSprites` system (the proven depth-sorted, fog-gated scenery pattern), but small and static:

- **`state.features[]`** — array of `{slot:'tree'|'rock', tx, ty, biome, v}`, where `(tx,ty)` is the **2×2 top-left anchor**. Plain JSON records.
- **`state.feat`** — `Uint8Array(W·H)` mask: `0` = none, `1` = canopy/top (passable but occupied), `2` = trunk/base (blocker). This mask is the single source of truth that keeps the building-placement invariant honest (see A2).
- **Collision:** bottom row → `blocked=1`; top row → passable. Pathfinding/separation need **zero edits**.
- **Render:** features join the depth-sort `depth[]` keyed at the footprint's bottom edge `(ty+2)·TILE`, drawn bottom-anchored at ~2 tiles tall (like `drawOneMega`). A unit in the top row has a smaller `y`, sorts first, and is occluded by the canopy → **walk-under**.
- **Art:** ship Phase 1 with the existing **opaque** atlas cells scaled 2×2 (correct size/collision/occlusion immediately; top row reads as a solid mound); Phase 2 drops in a **transparent** feature atlas for the true see-through branches with **no JS change**.
- **Generation:** a global conversion turns existing decorative trees/rocks into 2×2 features; a new `thickets` schema field adds deliberately crammed regions with a carved, validated trail.

Reuse, don't reinvent: `depth[]`/depth-sort (`render.js:100-122`), `drawOneMega` (`megasprites.js:231`), the flood-fill reachability pattern (`map.js:189-205` / `megaConnOK`), `blitTileOriented` mirror path (`render.js:165-168`), and the generic save loop. No new pathfinder, no new save format.

---

## Part A — The 2×2 walk-under feature

### A1 · Data model

Add to the `state` literal (`map.js:159-184`), alongside `tiles`/`variant`:

```js
features: [],                       // {slot:'tree'|'rock', tx, ty, biome, v}  (tx,ty = 2x2 top-left)
feat:     new Uint8Array(W*H),      // 0 none | 1 canopy(top,passable) | 2 base(bottom,blocker)
```

Both serialize for free: `features` rides the generic `for(k in G)` loop in `serializeGame` (`save.js:42`, exactly like `megaSprites`); `feat` is a typed array — **add it to the explicit typed-array handling** next to `blocked` (`save.js:46`/`:61`) *or* simply omit it from the save and rebuild it from `features` on load (cheap; preferred — keeps saves small). `blocked` already persists, so the bottom-row blockers survive a round-trip regardless.

**Rejected alternatives:** reusing `megaSprites` (wrong semantics — per-category fps/overhang/connectivity apportionment); keeping a terrain type (a tile carries one passability bit and is drawn flat *before* units, so it can never walk-under).

### A2 · Collision + the passability invariant *(P0 — the highest-risk part)*

A single helper creates every feature and is the **only** writer of `feat`:

```js
// returns true if a 2x2 tree/rock was anchored at (tx,ty)
function addFeature(state, tx, ty, slot, rng){
  const {W,H,tiles,biome,feat}=state;
  for(let y=0;y<2;y++) for(let x=0;x<2;x++){
    const cx=tx+x, cy=ty+y;
    if(cx<0||cy<0||cx>=W||cy>=H) return false;
    const i=cy*W+cx;
    if(!passableTerrain(tiles[i]) || feat[i]) return false;   // skip water / range-rock / claimed
  }
  for(let y=0;y<2;y++) for(let x=0;x<2;x++){
    const i=(ty+y)*W+(tx+x);
    feat[i] = (y===1) ? 2 : 1;                                // bottom blocks, top passable-occupied
  }
  state.features.push({slot, tx, ty, biome:biome[(ty+1)*W+tx], v:rng()});
  return true;
}
```

Then make the blocked grid feature-aware. Factor the passability rule into one place so building (un)blocking can't drift:

```js
// the single source of truth for "is cell i impassable terrain/feature?"
function baseBlocked(state,i){ return (passableTerrain(state.tiles[i]) && state.feat[i]!==2) ? 0 : 1; }
```

- **`map.js:187`** (blocked build) → `state.blocked[i] = baseBlocked(state,i);`
- **`map.js:417`** (`markBuilding` un-block branch) → `state.blocked[i] = blockedVal ? 1 : baseBlocked(state, i);`
  *Without this, demolishing/selling a building next to a tree un-blocks the tree's base.*
- **`units.js:183-184`** (`canPlaceAt`) → add `if(state.feat[cy*state.W+cx]) return false;` so a building can never be dropped on **any** feature cell — including the passable top row (else you'd get a canopy drawn over a barracks and a stale overhang after it dies).

Pathfinding (`findPath`), the no-diagonal-corner check, and `separation` are **unchanged** — they read `state.blocked`, which now blocks bottom rows and leaves top rows open. A* routes *through* the canopy row and *around* the base; stragglers get pushed into the open top row.

### A3 · Rendering — depth sort + the opaque-cell problem

**Depth-sort wiring** (`render.js:100-116`, where `depth[]` is built). Cull and fog-gate *before* pushing (a crammed map can have hundreds of features — don't bloat the per-frame sort):

```js
const fS = state.feat ? null : null;
if(state.features) for(const f of state.features){
  if(f.tx+2 < x0 || f.tx > x1 || f.ty+2 < y0 || f.ty > y1) continue;   // view AABB cull, like terrain (render.js:85)
  const si = (f.ty+1)*state.W + (f.tx+1);                              // the ONE sample cell (see below)
  if(!state.explored[si]) continue;                                    // hidden until explored
  depth.push({ y:(f.ty+2)*TILE, f, dim:!state.visible[si] });          // ground-line = footprint bottom
}
```

Dispatch in the draw loop (`render.js:118-122`): `else if(d.f) drawFeature(state, d.f, ox,oy, d.dim);`

`drawFeature()` mirrors `drawOneMega` (`megasprites.js:231-248`) — bottom-anchored, aspect-preserved, **mirror-only orientation** (reuse `f.v<0.5` like `blitTileOriented`'s feature path `render.js:165-168`; **never** the floor's 8-way rotation — a rotated canopy lies sideways):

```js
function drawFeature(state, f, ox, oy, dim){
  const px=f.tx*TILE+ox, py=f.ty*TILE+oy, w=2*TILE;          // 2-tile footprint
  const spr = featureSprite(f.biome, f.slot);               // alpha atlas (Phase 2) or null
  const overhang = 1.12;                                     // slight upward growth, like buildings
  const dw=w*overhang, dh=dw;                                // square cells; tune per art
  const dx=px+(w-dw)/2, dy=(f.ty+2)*TILE+oy - dh + 2;        // bottom-anchored on the ground line
  if(dim) ctx.globalAlpha*=0.5;
  drawFeatureSprite(f, dx, dy, dw, dh);                      // Phase 1 opaque-cell / Phase 2 alpha / fallback
  ctx.globalAlpha=1;
}
```

**Why occlusion is correct (verified):** feature key `(ty+2)·TILE`; a unit standing in the top row has center `e.y ≈ (ty+0.5)·TILE < (ty+2)·TILE`, so the unit is sorted **first** → drawn first → the canopy draws over it. A unit below the footprint sorts after → draws over the canopy. Identical to how buildings occlude units today.

**The opaque-cell problem (the crux).** The atlas feature cells bake opaque ground (`assets.js:21`). Drawn 2×2 bottom-anchored, the **top row** shows opaque ground around the canopy, so a unit in the top row hides behind a solid 64px square mound — the depth math is right but the *art* reads as a wall, not branches. This will be fixed in another session.

| Option | True see-through? | Use |
|---|---|---|
| **(a) Opaque atlas cell scaled 2×2** | ✗ (square mound) | **Phase 1** — proves size, blocking, occlusion, trails immediately |
| **(b) Transparent feature atlas** (only canopy/rock-top opaque) | ✓ | **Phase 2** — the real "under the branches" look |
| (c) Runtime tricks (upper-rect crop / gradient-alpha / chroma-key) | ✗ approximations, dark-on-dark artifacts | not recommended |

`drawFeatureSprite` falls through cleanly: **alpha feature cell → else opaque atlas cell scaled 2×2 → else procedural `drawTreeTile`/`drawRockTile` scaled 2×**. So Phase 1 ships with zero new art, and Phase 2 is **art-only**: dropping in `assets/atlas/features.png` flips `FEAT_READY` true and `drawFeatureSprite` takes the alpha branch — **no code change** (broken/missing PNG → `onerror` → auto-fallback to Phase 1).

### A4 · Minimap & fog

- **Minimap** (`render.js:604-615`): the footprint cells are now plain floor, so the `T_TREE`/`T_ROCK` color branches stop firing. Add a small pass after the tile loop that dots each feature's **sample cell** `(tx+1,ty+1)` with the existing color literals (`'#16241a'` tree / `'#3a3d44'` rock, biome-tinted) and applies `shade(c,-30)` when `!visible[si]`. Use the **same sample cell** as the depth/fog gate so they never disagree at the explored frontier.
- **Fog:** features are **neutral scenery** → gate draw on `explored`, dim on `!visible` (as in A3), **not** the enemy `isVisiblePix`-skip rule (`render.js:113`) — a tree must never leak enemy info.

### A5 · Save / load

No `save.js` change required for `features` (generic loop) or `blocked` (already explicit). Recommended: rebuild `state.feat` from `features` on load (in `deserializeGame`, after entities) rather than serialize it — smaller saves, and it's pure-derivable. `SAVE_VERSION` need not bump (older saves simply have no `features`/`feat` → empty → behaves like today).

### A6 · Converting existing scattered trees/rocks (the global rollout)

**Recommended:** a single deterministic conversion pass, `buildTopoFeatures(state, makeRng(cfg.seed*1000+909))`, inserted **after the `state` literal (`map.js:184`) and before the blocked build (`map.js:187`)**. At that point `tiles[]` is final (post-`clearArea`, post-`despeckleWater`), so player/base/gold pads already have **no** trees (cleared), and we never need a separate keep-out for them.

Algorithm — greedy row-major 2×2 tiling, geography-preserving (derived rng → main stream untouched → existing maps keep their exact terrain, only trees/rocks change size):

```
for ty in 0..H-1, tx in 0..W-1 (fixed order):
  i = ty*W+tx
  convertible = (tiles[i]==T_TREE) || (tiles[i]==T_ROCK && biome[i]!=B_MOUNTAIN)   // range rock excluded
  if !convertible || feat[i] != 0: continue
  slot = tiles[i]==T_TREE ? 'tree' : 'rock'
  if addFeature(state, tx, ty, slot, rng):        // anchors a 2x2 if it fits on convertible/floor & is unclaimed
     floor-ify the 2x2's tiles[] (any T_TREE/T_ROCK inside -> T_GRASS/T_DIRT, keep biome theme)
  // else: 2x2 didn't fit (map edge / water neighbor) -> leave this tile as a 1x1 terrain tree/rock (fallback)
```

This consumes a forest's single trees ~4-at-a-time into chunky walk-under canopy clusters; boundary tiles that can't host a 2×2 stay as today's single tiles. **Mountain-range rock stays a single impassable wall by construction** (gated out, drawn on the unchanged terrain path).

*Alternative (cleaner long-term, but changes every map's geography):* rewrite the forest/rock/grove placement loops (`map.js:108,128-138`) to emit features via `addFeature` directly instead of writing `T_TREE/T_ROCK`. Use this if a from-scratch generation refresh is acceptable; otherwise prefer the conversion pass above.

**Bridge-carver fix** (`map.js:189-205`): the reachability carve does `B[k]=0; tiles[k]=T_DIRT` and would tunnel through a feature base, leaving a floating trunk over walkable dirt. When the carve opens a cell with `feat[k]===2`, record its feature; after the loop, remove those features from `state.features`, clear their 4 `feat` cells, and re-derive `blocked` for the affected cells via `baseBlocked`. (Rare path — only fires when a node was walled off.)

---

## Part B — Cramped thickets with a guaranteed trail

A new, opt-in generation mode: pack a rectangular region wall-to-wall with 2×2 trees/stones, then carve and *guarantee* a winding passable trail through it. Because only feature **bottom rows** block, canopies still overhang the trail from both sides — a dense, enclosed look with a legible path.

### B1 · Schema field

`thickets: [{ x, y, w, h, density, mix, trail }]` (optional; pre-scale coords, alongside `forests`/`rockClusters`):

| field | meaning |
|---|---|
| `x,y` | top-left of the region (pre-scale tile coords) |
| `w,h` | region size in pre-scale tiles |
| `density` | 0..1 fraction of 2-tile lattice cells that get a feature (default `0.7`; `1.0` = wall-to-wall minus trail) |
| `mix` | 0..1 `P(tree)` vs rock per feature (`rng()<mix → tree`; default `0.5`) |
| `trail` | `'h'` / `'v'` / `'auto'` (carve along the longer axis; default `'auto'`) |

Document it in `.claude/skills/starleft-mapmaker/references/map-schema.md`.

### B2 · `scaleCfg` (`map.js:25`)

Scale geometry only (not `density`/`mix`/`trail`):

```js
if(cfg.thickets) c.thickets = cfg.thickets.map(t=>Object.assign({},t,{x:S(t.x),y:S(t.y),w:S(t.w),h:S(t.h)}));
```

### B3 · Cram + carve + validate *(deterministic)*

`placeThickets(state, rng)` runs **right after** `buildTopoFeatures`, before the blocked build (`map.js:187`). Anchor features on a **2-tile lattice** `(rx+2a, ry+2b)` (no overlap, clean blocker tiling, trail aligns to whole cells). Honor a POI keep-out (`player r7 / base r8 / lostBase r5 / gold r3`, each +1) since this *generates new* features (unlike A6, which only converts existing trees).

```
placeThickets(state, rng):
  for t in cfg.thickets:
    rx,ry,rw,rh = region(t);  axis = t.trail=='auto' ? (rw>=rh?'h':'v') : t.trail

    # (1) carve a serpentine trail FIRST — monotone advance guarantees it reaches the far edge
    trail = Set();  PW = 2                      # path width in tiles
    along = axis=='h' ? rx..rx+rw-1 : ry..ry+rh-1
    cross = midpoint of the other axis
    for s in along:
      for k in 0..PW-1: trail.add(cell on cross-PW/2+k, clamped inside region)
      cross = clamp(cross + ((rng()*3|0)-1), lo+1, hi-2)     # -1/0/+1 organic jitter

    # (2) cram on the lattice, trail-aware  (roll density BEFORE legality so rng-count is content-stable)
    for b in 0..(rh>>1)-1, a in 0..(rw>>1)-1:
      tx=rx+2a; ty=ry+2b
      if rng() >= t.density: continue
      if anyProtected(tx,ty) or touchesTrail(tx,ty,trail): continue
      slot = rng()<t.mix ? 'tree' : 'rock'
      addFeature(state, tx, ty, slot, rng)       # validates fit/passable/unclaimed internally

    # (3) force the trail tiles passable floor (defensive; addFeature already skipped trail cells)
    for i in trail: if !passableTerrain(tiles[i]): tiles[i]=T_GRASS

    # (4) validate on a SCRATCH blocked (the real one isn't built until map.js:187)
    if !thicketReachOK(state, cfg.player, mustReach):     # flood like map.js:192-196 / megaConnOK
      widenTrailGeometrically(trail);  dropFeaturesOnTrail(state, trail)   # NO rng here (see contract)
      # worst-case backstop: the bridge-carver (map.js:189-205) still guarantees every node is reachable
```

`mustReach = goldNodes ∪ bases ∪ lostBases`. `thicketReachOK` builds a scratch mask (terrain-impassable **or** `feat===2`) and 4-neighbor floods from the player, asserting every POI is seen.

### B4 · Integration order (in `newMap`)

```
noise terrain → range rock(:105) → groves(:108) → rockClusters(:128) → forests(:138)
→ clearArea pads(:142) → despeckleWater(:156)
→ state literal(:159, now with features:[] + feat)
→ buildTopoFeatures()        ← A6 global conversion (derived rng)
→ placeThickets()            ← B3 (derived rng, same stream, sequenced after)
→ blocked build(:187, baseBlocked)        → bridge-carve(:189-205, drop tunneled features)
→ despeckleBiome(:209) → placeMegaSprites(:215, its megaConnOK now also routes around thicket walls)
```

Everything feature-related happens after the pads are cleared and before `blocked` is built, so: bases can't be walled in, the bridge-carver sees thicket walls, and megasprites avoid them automatically.

### B5 · Keeping the validator green

`.claude/skills/starleft-mapmaker/scripts/verify_geometry.js`:
- **Determinism:** add an element-wise `st.features` vs `st2.features` assert (compare `tx,ty,slot` in order). `tiles`/`biome` determinism is unaffected (features don't write new terrain ids beyond floor-ifying).
- **Reachability:** unchanged check already catches a thicket that walls off an objective (blockers land in `state.blocked` at `:187`).
- **New per-thicket assert:** flood from each scaled thicket's trail entry to its exit over `st.blocked`; assert connected (catches a carve bug, not a tuning choice).

---

## Determinism contract (must hold or `verify_geometry` fails)

1. All feature creation uses a **derived** seeded rng (`makeRng(cfg.seed*1000+909)`), leaving the main terrain stream untouched.
2. Scans iterate **fixed index order** (row-major); no `Set`/`Map` key-order dependence, no wall-clock, no unseeded randomness.
3. In `placeThickets`: roll `density` per cell **before** legality gates; roll `slot` **only** on passing cells.
4. Trail **repair is purely geometric** — `widenTrail`/`dropFeaturesOnTrail` draw **zero** `rng()` (a content-dependent rng count desyncs the stream and breaks the double-run assert).

---

## Implementation phases

**Phase 1 — mechanics on existing (opaque) art**
1. `state.features[]` + `state.feat` + `addFeature` + `baseBlocked` (A1, A2).
2. Blocked-grid, `markBuilding`, `canPlaceAt` edits (A2).
3. `drawFeature` + depth-sort push w/ cull & fog gate; `drawFeatureSprite` opaque-cell branch + procedural fallback (A3).
4. Minimap feature pass (A4); load-time `feat` rebuild (A5).
5. `buildTopoFeatures` global conversion + bridge-carver fix (A6).
6. → Playable: 4× trees/rocks, bottom-row blocking, walk-under occlusion (top row reads as a mound).

**Phase 2 — true branches (art only, no JS change)**
7. Author `assets/atlas/features.png` — transparent PNG, 7 biome rows × 2 cols (rock-top, tree-canopy), 128px cells, only canopy/rock-top opaque, dark-cyberpunk palette matching the atlas. Generate the same way the rest of the atlas was made; **not** by background-removing the current cells (dark-on-dark keying fails).
8. `assets.js`: `FEAT_IMG` loader + `featureSprite(biome,slot)` mirroring `ATLAS_IMG`/`spriteFor`. `FEAT_READY` flips → `drawFeatureSprite` takes the alpha branch automatically.

**Phase 3 — cramped thickets**
9. `thickets` schema + `scaleCfg` + `placeThickets` (B1–B4); validator asserts (B5); author a test map using it.

**Phase 4 (optional polish)**
10. Canopy-sway frame strip (building/mega `fps` pattern); per-biome silhouette variants keyed on `f.v`.

---

## Important decision: NO GENERATION NOW, USE THE SAME SPRITES

 **opaque now, alpha later** (Phase 1 → Phase 2, no code change between). Alternative: author the transparent atlas first if the square-mound look is unacceptable for early testing.

## Open decisions (recommendations baked into the plan above)

- **Rollout scope:** *recommended* — convert **all** scattered decorative trees/rocks game-wide (forests, rock clusters, groves), exclude mountain-range rock. Alternative: gate behind a per-map flag / `thickets` only. (A6 supports either — the conversion pass is one call.)
- **Footprint:** fixed **2 wide × 2 tall**, bottom row blocks, top row walk-under (matches "lower 2 / upper 2 blocks").

---

## Verification / testing

1. **Generation determinism & reachability:** run the geometry validator headlessly —
   `node .claude/skills/starleft-mapmaker/scripts/verify_geometry.js` — confirm the double-`newMap` `features` assert passes and every gold node / base stays reachable on all maps (incl. any with `thickets`).
2. **In-app walk-under** (`/run` or open `rts.html`): on a forested map, order a unit to march through a tree's top row → it should be **occluded by the canopy** while passing and re-emerge below; it must **never** path through the bottom row. Confirm a building **cannot** be placed on any feature cell, and that **selling a building beside a tree** doesn't open the tree's base (exercises the `markBuilding`/`baseBlocked` fix).
3. **Thicket trail:** load the test map; visually confirm the dense region has a continuous passable trail and units traverse end-to-end; confirm enemies/AI also route through it.
4. **Save/load:** save mid-match on a feature-heavy map, reload → features, blockers, and walk-under all intact; minimap shows trees/rocks.
5. **Fog:** features hidden until explored, dimmed when seen-but-not-visible, never revealing enemy presence.
6. **Perf:** on a max-density thicket map, confirm the per-frame depth sort stays cheap (features culled to the view AABB before the sort).

---

## File-by-file change map

| File | Change |
|---|---|
| `js/map.js` | `state.features`/`state.feat` in state literal; `addFeature`, `baseBlocked`, `buildTopoFeatures`, `placeThickets`; blocked build `:187` → `baseBlocked`; `markBuilding` `:417` → `baseBlocked`; bridge-carve `:189-205` drop tunneled features; `scaleCfg` `:25` maps `thickets` |
| `js/units.js` | `canPlaceAt` `:183` rejects any `state.feat` cell |
| `js/render.js` | depth-sort push for features (cull+fog gate) `:100-116`; dispatch `:118`; new `drawFeature`/`drawFeatureSprite`; minimap feature pass `:604-615` |
| `js/assets.js` | *(Phase 2)* `FEAT_IMG` + `featureSprite` |
| `js/save.js` | none required; *(optional)* rebuild `feat` from `features` in `deserializeGame` |
| `assets/atlas/features.png` | *(Phase 2)* new transparent feature atlas |
| `.claude/skills/starleft-mapmaker/references/map-schema.md` | document `thickets` |
| `.claude/skills/starleft-mapmaker/scripts/verify_geometry.js` | `features` determinism + thicket-trail asserts |

*Pattern references (no change): `js/megasprites.js` `drawOneMega`/`megaConnOK`; `js/state.js:9` `makeRng`.*
