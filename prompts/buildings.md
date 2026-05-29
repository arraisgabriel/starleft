# Building atlas prompt

Produces `buildings.png`. 3 columns (HQ / Barracks / Turret) × 2 rows (player / enemy)
= 6 transparent sprites.

> **Background:** ask for transparent, but Nano Banana usually bakes a grey checkerboard
> as opaque pixels — slice with the **tight neutral checkerboard key** (tolerance ≤6,
> value 80–140) via border flood-fill (see [shared-blocks.md](shared-blocks.md) lessons).

Reference: attach `tileset.png` (the terrain atlas) so the style matches.

---

## ⭐ Building atlas
```
Match the art style, palette, lighting, and strict top-down perspective of this attached terrain tileset.

A top-down 2D game BUILDING TILESET for a sci-fi / startup-satire RTS, on a 1536×1024 image arranged as a 3-column × 2-row grid of six 512×512 sprite cells. Separate every cell with a 6px solid magenta (#ff00ff) gutter so the sprites can be sliced apart. Each building sprite sits on a FULLY TRANSPARENT background — no ground, no grass, no tile, no terrain, no backdrop. Only a small soft contact shadow directly under each building (no long cast shadow). No text, no labels, no numbers, no UI, no health bars.

VIEW & STYLE (identical for every sprite, matched to the terrain tileset):
- Orthographic top-down view from directly overhead (~90°), with only a slight sense of height via soft top-face shading and a thin ambient-occlusion edge. No perspective, no isometric angle, no horizon, no long shadows.
- Painterly semi-flat sci-fi style: soft gradient shading, gentle highlights, clean readable silhouettes, subtle surface texture, no hard outlines, muted slightly-desaturated palette, even ambient lighting from above.
- Consistent scale and lighting across all six sprites.

FACTION COLOR-CODING:
- Row 1 (top) = PLAYER faction: cool steel-grey structures with blue/cyan accents (#3b7fd0, glowing cyan #7fd6ff).
- Row 2 (bottom) = ENEMY faction: the SAME three buildings, identical shapes, but with hostile red accents (#ff6b6b, dark red #9a3b3b) replacing every cyan/blue accent.

COLUMNS (same building per column; player on top, enemy below):
- Col 1 = HQ "Open-Plan HQ": a sleek modern glass-and-steel startup headquarters. LARGE, filling ~90% of the cell, roughly square footprint. Flat rooftop with a faction-colored landing/logo pad, a tiny rooftop ping-pong table detail, a glowing accent strip, and a small antenna. Reads clearly as the main base.
- Col 2 = BARRACKS "People Ops": a modular recruiting/training facility. LARGE, ~85% of the cell, square footprint. Boxy connected office modules with a rooftop entry pad, vents, and a faction-colored beacon sign. More utilitarian and industrial than the HQ.
- Col 3 = TURRET "Legal Team": a compact defensive turret. SMALL, filling only ~55% of the cell, centered (it is a 1-tile structure, visibly smaller than the others). An armored kiosk/tower with a rotating dish or short barrel emitter glowing in the faction color. Clearly a weapon emplacement.

Crisp, game-ready, high detail, transparent PNG.
```

### Avoid
```
Avoid: opaque or colored background, any ground/grass/tile under the buildings, isometric or 3D perspective, long drop shadows, text/labels/numbers, health bars, people or characters, units, blurry edges, neon glow overload, mismatched lighting or scale between cells.
```

---

## New production buildings (to draw next)
The expanded roster adds two production buildings; generate them with the SAME 3×2
faction-atlas format (or extend to a 5-column atlas). Suggested cells:
- **The Garage** (Factory) — an industrial vehicle bay / open garage with roller doors, tool racks, a faction-colored sign; bulkier and lower than the HQ.
- **Launch Pad** (Starport) — a rocket/drone launch platform with a circular pad, gantry, faction-colored landing lights and a small docked craft.

> Same palette, faction rows (blue player / red enemy), transparent background (tight checker key on slice), 6px magenta gutters.
