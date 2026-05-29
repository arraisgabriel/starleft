# STARLEFT — Nano Banana sprite prompts

All the image-generation prompts used (and reusable) for STARLEFT's hand-drawn art,
plus the slicing pipeline that turns generated sheets into game-ready sprites.

Generator: **Gemini "Nano Banana"** (Gemini 2.5 Flash Image).

## Files
| File | Contents |
|---|---|
| [shared-blocks.md](shared-blocks.md) | Reusable `RULES` / `RECOLOR` / `AVOID` blocks, walk-frame defaults, consistency loop, hard-won lessons. **Paste these into the per-asset prompts.** |
| [terrain.md](terrain.md) | Terrain tileset: one-shot 7×4 biome atlas + per-biome fallback prompts. |
| [buildings.md](buildings.md) | Building atlas (HQ / People Ops / Legal Team × player/enemy). |
| [units-core.md](units-core.md) | The 3 starting units: static sheet, walk-cycle strip, action sheet, recolor. |
| [units-expanded.md](units-expanded.md) | The 8 new Terran-inspired units: walk + action prompt for each. **(Generated via the Nano Banana API and fully wired into the game — units, 2 production buildings, mechanics, enemy AI, and Desert tiles are all live in `rts.html`.)** |

## Faction color convention (IMPORTANT)
Sprite atlases are keyed by faction string: **`player` = BLUE art**, **`enemy` = RED art**.
Always **generate the BLUE (player) version first**, then run the `RECOLOR` block to produce
the RED (enemy) twin so the two are frame-for-frame identical.
> In-game the human side currently renders RED (`PLAYER_IS_RED = true` in `rts.html`), but that
> is just a render-time remap of the same two atlases — generation convention stays blue→recolor-red.

## Canonical specs (every prompt must match these)
- **Key colors:** magenta gutter `#ff00ff`; chroma background `#00ff00` (units/characters) — terrain/building tiles use opaque tiles separated by magenta gutters.
- **Cell size:** 512×512. **Walk/action strips:** 4 frames → 2048×512. **Building atlas:** 3×2 of 512 → 1536×1024. **Terrain atlas:** 7×4 of 512 → 2048×2048.
- **Gutter width:** 4px (terrain) / 6–8px (buildings, units).
- **No** text, labels, numbers, UI, drop shadows, or transparency/checkerboard backgrounds.

## Slicing pipeline (how the generated sheets become sprites)
The slicer (a small Node script using `pngjs`) does, per sheet:
1. **Detect gutters** — scan rows/cols for the magenta fraction (`r>150 && b>150 && g<min(r,b)-28`); cells are the spans *between* consecutive gutters, treating image edges as boundaries.
2. **Key the background to alpha:**
   - **Green chroma (units):** global key — a pixel is background if green-dominant (`g>120 && g>r+35 && g>b+35`). Safe because no character pixel is green-dominant (cyan glows have high B, so survive).
   - **Grey checkerboard (buildings, when Nano Banana fakes transparency):** flood-fill from the borders removing **only TIGHTLY neutral** checker shades (`|r-g|,|g-b|,|r-b| ≤ ~6` AND avg value 80–140). The tight neutral test is critical — building glass/metal has a slight color tint and must survive (a loose tolerance ate the HQ's glass facade once).
   - Also kill stray magenta/pink AA.
3. **Cell-isolate each frame** — copy ONLY pixels inside that cell's bounds (inset ~3–5px to clip gutter AA) into its own slot, so a wide crop never bleeds a sliver of the neighbouring sprite.
4. **Align** — share a baseline (max bottom) and center on content so the animation doesn't jitter.

## Asset → atlas filenames produced
- Terrain → `tileset.png` (+ `tiles/*.png`)
- Buildings → `buildings.png`
- Unit walks → `unit_<type>_walk.png`, `unit_<type>_enemy_walk.png`
- Unit actions → `unit_<type>_<action>.png`, `..._enemy.png`

## Generating consistent results
- **Generate everything for one subject in a single image** when possible (the model self-matches its own style across a single canvas).
- **Reference loop:** attach the best prior result and say *"use this as the exact style/scale/lighting reference; regenerate, fixing only [cells X]; change nothing else."* This is your "seed" — Nano Banana exposes none.
- **4 frames is the sweet spot** for animation; more frames = more drift.
- If a frame is off-model, fix only that frame referencing the others.
