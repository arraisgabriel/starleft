# Resource node — Funding Crystal

The gatherable resource ("Funding") is a **brilliant purple enigmatic crystal**.
The in-engine renderer (`drawGoldmine` in `js/render.js`) adds the **shiny animation**
— a pulsing purple aura, a specular gleam that sweeps the facets, and floating
sparkles — so the generated sprite only needs the **crystal body** (no baked glow).

- Output path after slicing: **`assets/resource/crystal.png`**
- The game auto-uses it once present (`crystalSprite()` in `js/assets.js`); until then it draws a procedural faceted crystal with the same animation.

## ⭐ Nano Banana prompt
> Attach a couple of existing unit/building sprites as a style reference.
```
Match the painterly semi-flat sci-fi art style, soft gradient shading, and 3/4-from-above view of these attached reference sprites.

A single top-down 2D game RESOURCE NODE sprite: a cluster of BRILLIANT PURPLE, enigmatic, alien crystals — a tight group of 3–5 sharp angular faceted shards rising from the ground, one tall central shard flanked by smaller ones. Deep violet core (#3a1066) shading up through vivid magenta-purple lit facets (#8a3ff0) to pale lilac highlight edges (#e0b0ff), with a faint inner glow as if lit from within. Crisp clean facets, gentle rim light, subtle translucency, no hard black outlines.

The crystals stand on the ground with only a small soft contact shadow. Centered, filling ~70% of the frame, at a believable resource-node scale.

Background: SOLID FLAT PURE GREEN #00ff00 — NO transparency, NO checkerboard, no gradient, no texture, no extra shadow, NO border/frame. No text, no labels, no numbers, no UI.

Output a single square image. Game-ready, high detail.
```

### Avoid
```
Avoid: purple background or purple haze bleeding into the green (keep the bg pure flat #00ff00 so it keys cleanly), transparency/checkerboard, any border or frame, text/labels, gold/orange/yellow tint (it must read clearly PURPLE), top-down-flat or isometric (keep the same 3/4 view as the references), busy background props.
```

## Slicing → game
1. Green-key the background to alpha (same pipeline as the unit sprites: remove `#00ff00`-dominant pixels, despeckle stray islands, keep the crystal blob).
2. Save as `assets/resource/crystal.png`.
3. Done — `drawGoldmine` blits it under the animated aura + sweeping gleam + sparkles, with the amount label below.

> Optional: generate a 2×2 of 4 crystal **variations** instead; then slice to 4 and have `drawGoldmine` pick by `e.id % 4` for per-node variety (small code tweak).
