# Terrain tileset prompts

Produces `tileset.png`. Seven biomes: grassland, mountains, water/ocean, tech
foundations, desert/sand, ice/snow, volcanic. Each biome supplies: ground floor,
rock, tree/flora, water.

> Terrain tiles are **opaque** (no chroma background) — they're separated only by
> magenta gutters and sliced on those. Ground tiles should be seamlessly tileable.

---

## ⭐ Primary — one-shot 7×4 biome atlas (best consistency)
```
A top-down 2D game terrain TILESET ATLAS for a sci-fi RTS, arranged as a clean grid: 7 rows × 4 columns, on a 2048×2048 image. Each cell is a separate 512×512 game tile. Separate every cell with a 4px solid magenta (#ff00ff) gutter so the tiles can be sliced apart. No text, no numbers, no labels, no icons, no UI.

VIEW & LIGHTING (identical for every single tile — this is critical):
- Strict ORTHOGRAPHIC TOP-DOWN view, camera pointing straight down at 90°. No perspective, no isometric angle, no horizon, no vanishing point.
- Flat, even, ambient lighting from directly above. NO directional sun, NO long cast shadows, NO drop shadows extending past a tile edge. Tiny contact shadows only.
- Each GROUND tile must be SEAMLESSLY TILEABLE — edges wrap so copies placed edge-to-edge show no seam.

ART STYLE (identical for every tile):
- Muted, slightly desaturated sci-fi RTS look. Semi-flat with soft gradient shading and gentle highlights. Clean, readable silhouettes. Subtle texture, not photorealistic, not cartoonish, no outlines.

COLUMNS (left → right):
  Col 1 = GROUND (seamless floor texture for this biome)
  Col 2 = ROCK / boulder outcrop, centered, on this biome's ground
  Col 3 = TREE / vegetation, centered, on this biome's ground
  Col 4 = WATER / liquid surface for this biome

ROWS (top → bottom), with exact palettes:
  Row 1 GRASSLAND — ground deep green #33502e/#3a5a34; rock grey #5b626c/#393e45; lush round tree canopy #3f7a36; water blue #1a466a/#1d4f73.
  Row 2 MOUNTAINS — ground rocky grey-brown #574f47/#615850; large jagged stone outcrop #7b7268/#4d463f; sparse pine #356a2e; cold blue water #1a466a.
  Row 3 WATER/OCEAN — ground wet dark sand #234e6e; barnacled rock #4a4f57; mangrove shrub #356a2e; deep rippling blue water #1a466a/#1d4f73.
  Row 4 TECH FOUNDATIONS — ground dark metal panels #27313d/#2c3744 with thin cyan grid seams #5ac8ff and small glowing rivets; metallic boulder #4a4f57; antenna/console prop with cyan glow; coolant pool dark teal with cyan glow.
  Row 5 DESERT/SAND — ground warm sand #bd9c5e/#c8a869 with dune ripples; sandstone rock #b89a64/#8a6f43; green cactus #3f7a4a; small oasis water #1d4f73.
  Row 6 ICE/SNOW — ground pale snow #bcd2dd/#cde0ea with hairline cracks; frosted blue-grey rock #cde0ea/#90a8b6; snow-laden evergreen #5e7d63 with white caps; frozen pale-blue ice surface #9fc4d8.
  Row 7 VOLCANIC — ground dark basalt #2b2320/#332a25 with glowing orange lava cracks #ff6a1e; reddish scorched rock #5a3a30/#2a1c18; charred dead tree #2a201a; molten lava pool #5a1606 with bright orange flow #ff6a1e/#ffd24d.

Consistent scale across all 28 tiles. Crisp, game-ready, high detail.
```

### Avoid
```
Avoid: perspective/3D angle, isometric, drop shadows, vignette, text, numbers, watermark, frame/border, character or creature, glossy photoreal, blurry edges, mismatched lighting between tiles.
```

---

## Fallback — one biome per image (sharper per tile)
Paste the STYLE BLOCK, then append one biome line.

### STYLE BLOCK (paste unchanged each time)
```
Top-down 2D RTS game tiles, strict orthographic 90° overhead view — no perspective, no isometric. Flat even ambient top-down lighting, no directional sun, no long/drop shadows. Muted desaturated sci-fi style, semi-flat with soft gradient shading, clean readable shapes, no outlines, no text/labels/UI. Output a 1024×1024 image, 2×2 grid of four 512×512 tiles separated by a 4px magenta (#ff00ff) gutter: [top-left] seamless tileable GROUND texture, [top-right] a centered ROCK outcrop on that ground, [bottom-left] a centered TREE/plant on that ground, [bottom-right] a WATER/liquid surface. Consistent scale. Game-ready, crisp.
```

### Biome lines (append one)
| Biome | Append |
|---|---|
| Grassland | `BIOME = grassland: ground green #33502e/#3a5a34, grey rock #5b626c, lush round tree #3f7a36, blue water #1a466a.` |
| Mountains | `BIOME = rocky mountains: rocky grey-brown ground #574f47, jagged stone outcrop #7b7268, sparse pine #356a2e, cold water #1a466a.` |
| Water/Ocean | `BIOME = ocean shore: wet dark-sand ground #234e6e, barnacled rock #4a4f57, mangrove shrub #356a2e, deep rippling blue water #1a466a/#1d4f73.` |
| Tech foundations | `BIOME = tech foundation: dark metal panel ground #27313d/#2c3744 with cyan grid seams #5ac8ff and glowing rivets, metal boulder #4a4f57, glowing antenna prop, dark-teal coolant pool with cyan glow.` |
| Desert/Sand | `BIOME = desert: warm sand ground #bd9c5e/#c8a869 with dune ripples, sandstone rock #b89a64, green cactus #3f7a4a, small oasis water #1d4f73.` |
| Ice/Snow | `BIOME = snow/ice: pale snow ground #bcd2dd/#cde0ea with hairline cracks, frosted rock #cde0ea/#90a8b6, snow-capped evergreen #5e7d63, frozen pale-blue ice #9fc4d8.` |
| Volcanic | `BIOME = volcanic: dark basalt ground #2b2320 with glowing orange lava cracks #ff6a1e, scorched red rock #5a3a30, charred dead tree #2a201a, molten lava pool #5a1606 with bright flow #ffd24d.` |

---

## Note: Desert needs a clean sand floor
The first atlas had no usable plain-sand ground tile (its desert cells baked in a
rock+cactus / oasis), so Desert ground is currently rendered procedurally in-game.
Regenerate just that biome with the fallback prompt above to get a clean tileable sand floor.
```
Using this image as the exact style reference, replace the desert area with a clean 6-cell desert row: [1] seamless plain sand ground, [2] sand with a single sandstone boulder, [3] sand with a single green cactus, [4] dune sand, [5] sand with a shallow blue oasis, [6] cracked dry sand. Same top-down view, lighting, and palette. Change nothing else.
```
