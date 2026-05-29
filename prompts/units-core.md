# Core units — Intern, Growth Hacker, Consultant

The three starting units. Each ended up with: a static design sheet, a 4-frame
**walk** strip (per unit, recolored for enemy), and a 4-frame **action** sheet
(mine / slash / shoot, recolored for enemy).

> The static-sheet prompt below asked for strict overhead, but Nano Banana returned a
> **3/4 front view** — which looked better and is what every later strip matches. Keep 3/4.

Produces: `unit_worker_walk.png`, `unit_soldier_walk.png`, `unit_ranger_walk.png`
(+ `_enemy` twins), and `unit_worker_mine.png`, `unit_soldier_attack.png`,
`unit_ranger_attack.png` (+ `_enemy`).

---

## 1) Static design sheet (3×2) — establishes the characters
Reference: attach `buildings.png` (+ terrain) for style.
```
Match the art style, palette, lighting, and strict top-down perspective of these attached building/terrain sprites.

A 2D game UNIT SPRITE SHEET for a sci-fi / startup-satire RTS, on a 1536×1024 image arranged as a 3-column × 2-row grid of six 512×512 cells. Separate every cell with an 8px solid magenta (#ff00ff) gutter. CRITICAL: fill the background of every cell with SOLID, FLAT, PURE GREEN (#00ff00) — a clean chroma-key fill. Do NOT use transparency, do NOT draw a checkerboard, do NOT use gradients or texture in the background. Just flat green behind each character.

VIEW & STYLE (identical for all six):
- 3/4 front-facing view (seen slightly from above and the front), each character facing toward the viewer with a clear front so it reads which way it faces.
- No isometric, no horizon. Even ambient lighting. NO cast shadow and NO ground shadow under the unit (flat green only).
- Painterly semi-flat style, soft shading, clean BOLD readable silhouettes that stay legible when shrunk to ~24px. No hard black outlines. Subtle detail only.
- Each unit centered, filling ~70% of its cell, with green margin around it. Consistent scale and lighting across all six (a worker, a trooper, and a ranged unit at believable relative sizes).

FACTION COLOR-CODING:
- Row 1 (top) = PLAYER faction: cool steel-grey gear with blue/cyan accents (#3b7fd0, glowing cyan #7fd6ff).
- Row 2 (bottom) = ENEMY faction: the SAME three units, identical shapes, but with hostile red accents (#ff6b6b, dark red #c0392b) replacing the cyan/blue.

COLUMNS (same unit per column; player on top, enemy below):
- Col 1 = INTERN (worker/harvester): a compact young engineer. Team-colored hard-hat, a small backpack, holding a glowing mining pickaxe. Smallest, rounded silhouette. Reads as a builder/gatherer.
- Col 2 = GROWTH HACKER (melee assault): a bulky armored trooper. Team-colored helmet with a forward visor, broad angular shoulder pads, a small booster/rocket pack on the back, gripping a short glowing energy blade. Aggressive, widest silhouette.
- Col 3 = CONSULTANT (ranged): a sleek slim operative. Team-colored armor and a small antenna, holding a long thin energy rifle ("buzzword projector"). Slender silhouette, clearly a ranged unit.

Crisp, game-ready, high contrast, clean shapes.
```

---

## 2) Walk-cycle strip (run once per character)
Attach the static sheet as reference; swap the 👉…👈 line per character.
```
Use the character in this attached reference sheet as the EXACT model — same proportions, armor, colors, gear, and 3/4 front view.

Generate a WALK-CYCLE SPRITE STRIP for ONE character: the 👉 INTERN (top-left, blue worker with the pickaxe) 👈.

Layout: a single horizontal strip of 4 equal frames, each 512×512, separated by 8px solid magenta (#ff00ff) gutters (final image 2048×512). Fill every frame's background with SOLID FLAT PURE GREEN (#00ff00) — no transparency, no checkerboard, no gradient, no texture, no shadow. No text, no labels, no numbers.

VIEW & CONSISTENCY (critical):
- Keep the SAME 3/4 front-facing view as the reference, character facing toward the viewer.
- The character must look IDENTICAL in all 4 frames — same colors, armor, helmet, backpack, and held tool/weapon. ONLY the legs and a subtle body bob change. Do not redesign anything.
- Center the character horizontally in every frame and keep its feet on the SAME baseline (bottom). Do not drift the character left/right or up/down between frames beyond a 1–2px vertical bob.
- Same painterly semi-flat sci-fi style, soft shading, bold readable silhouette, no hard outlines, even top-down-ish lighting. Same scale in all frames.

THE 4 WALK FRAMES (a standard walk cycle):
- Frame 1 — CONTACT: left leg striding forward, right leg back, opposite arm swung forward; body at its lowest.
- Frame 2 — PASSING: legs together passing under the body, body lifted ~2px (up bob).
- Frame 3 — CONTACT: right leg striding forward, left leg back, arms swapped; body lowest.
- Frame 4 — PASSING: legs together again, body lifted (up bob).
The held tool/weapon and upper body stay in the same grip throughout — only legs/arms swing and the body bobs.

Crisp, game-ready, high contrast, loops seamlessly from frame 4 back to frame 1.
```
Swap the reference line:
- Intern: `the INTERN (top-left, blue worker with the pickaxe)`
- Growth Hacker: `the GROWTH HACKER (top-middle, blue bulky armored trooper with the energy blade)`
- Consultant: `the CONSULTANT (top-right, blue slim operative with the long rifle)`

---

## 3) Action sheet (4×3) — mine / slash / shoot
Attach the walk/static sprites as reference.
```
Use the characters in these attached reference sprites as the EXACT models — same proportions, armor, colors, gear, weapons, and 3/4 front-facing view.

A 2D game UNIT ACTION SPRITE SHEET for a sci-fi RTS, on a 2048×1536 image arranged as a 4-column × 3-row grid of twelve 512×512 cells. Separate every cell with an 8px solid magenta (#ff00ff) gutter. CRITICAL: fill every cell's background with SOLID, FLAT, PURE GREEN (#00ff00) — a clean chroma key. Do NOT use transparency, do NOT draw a checkerboard, no gradient, no texture, no shadow. No text, no labels, no numbers, no UI.

EACH ROW = one character performing its signature action across 4 left-to-right animation frames. EACH ROW IS A DIFFERENT CHARACTER, but within a row the character must be IDENTICAL frame-to-frame — same colors, armor, helmet, backpack, and weapon; ONLY the action pose (arms/weapon/torso) changes. Player faction: cool steel-grey with blue/cyan accents (#3b7fd0, glowing cyan #7fd6ff); weapon energy glows cyan.

VIEW & CONSISTENCY (all 12 cells):
- Same 3/4 front-facing view as the reference, facing slightly to the right.
- Character CENTERED in every cell, feet on the SAME baseline; do not drift, resize, or rotate between frames. Consistent scale and lighting across the whole sheet.
- Painterly semi-flat sci-fi style, soft shading, bold readable silhouette legible at ~28px, no hard outlines.

ROW 1 — INTERN (blue worker with pickaxe), a MINING SWING that loops:
- F1: pickaxe raised high overhead, body leaning back (wind-up).
- F2: pickaxe swinging down through a diagonal arc, arms mid-motion.
- F3: pickaxe strikes the ground in front, body bent forward at impact, small cyan spark at the tip.
- F4: pulling the pickaxe back up, recovering toward the F1 pose (loops smoothly).

ROW 2 — GROWTH HACKER (blue bulky armored trooper with energy blade), a MELEE BLADE SLASH:
- F1: glowing blade cocked back over the shoulder, body coiled (wind-up).
- F2: blade slashing across the front in a bright arc with a glowing motion trail.
- F3: blade fully extended forward in a lunge, brightest glow, body committed.
- F4: pulling back to a ready guard stance (recover).

ROW 3 — CONSULTANT (blue slim operative with long rifle), a RIFLE SHOT:
- F1: raising the rifle, taking aim forward.
- F2: FIRING — a bright cyan muzzle flash at the barrel tip, body braced against recoil.
- F3: recoil — rifle kicked up slightly, faint energy/smoke at the muzzle.
- F4: settling the rifle back down to the aim/ready pose.

Crisp, game-ready, high contrast, clean shapes; each row reads as a smooth 4-frame action.
```

### Avoid (units)
```
Avoid: transparent or checkerboard background (use solid flat #00ff00), any drop/ground shadow, text/labels/numbers, the character changing design/colors/size/gear between frames, the character drifting or rotating between frames, switching to side/top-down view, full-frame motion-blur smear, extra limbs, mixing the three characters within a single row, uneven frame spacing.
```

---

## 4) Enemy recolor (run on each finished blue strip/sheet)
```
Recolor this exact [strip/sheet]: replace all blue/cyan accents and weapon glow (#3b7fd0, #7fd6ff) with hostile red (#ff6b6b, dark red #c0392b). Keep every pose, the green background, the magenta gutters, and everything else 100% identical. Do not change the animation or redesign the character.
```
