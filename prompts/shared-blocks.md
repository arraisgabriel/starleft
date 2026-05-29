# Shared prompt blocks

Reusable building blocks. Paste the relevant ones into each per-asset prompt
(see the unit prompts, which reference `[RULES]`, `RECOLOR`, `AVOID`).

---

## `RULES` — prepend to every UNIT walk/action prompt
```
Match the exact art style, proportions, palette, and 3/4 front-facing top-down-ish view of these attached reference sprites. A single horizontal strip of 4 frames, each 512×512, separated by 8px solid magenta (#ff00ff) gutters (final image 2048×512). Fill EVERY frame's background with SOLID FLAT PURE GREEN #00ff00 — NO transparency, NO checkerboard, no gradient, no texture, no shadow. No text, no labels, no numbers, no UI.
CONSISTENCY (critical): the subject is IDENTICAL in all 4 frames — same design, colors, armor/chassis, and weapon; ONLY the motion described changes. Centered in every frame, on the SAME baseline; no drifting, resizing, or rotating between frames. Painterly semi-flat sci-fi style, soft shading, bold readable silhouette legible at ~28px, no hard outlines, even lighting, consistent scale.
PLAYER FACTION COLORS: steel-grey with blue/cyan accents (#3b7fd0, glowing cyan #7fd6ff); any energy/weapon glow is cyan.
```

## `RECOLOR` — run on each finished BLUE strip to make the RED (enemy) twin
```
Recolor this exact 4-frame strip: replace all blue/cyan accents and energy glow (#3b7fd0, #7fd6ff) with hostile red (#ff6b6b, dark red #c0392b). Keep every pose, the green background, the magenta gutters, and everything else 100% identical. Do not change the animation or redesign the subject.
```

## `AVOID` — append if the model drifts
```
Avoid: transparent or checkerboard background (use solid flat #00ff00), any shadow, text/labels/numbers, the subject changing design/colors/size between frames, drifting/rotating between frames, switching to a side or pure top-down view, motion-blur smears, extra limbs, props extending past the green margin into the gutter.
```

---

## Walk-frame defaults (humanoid units)
Reuse this 4-frame cycle for any bipedal unit:
- **F1 — CONTACT:** left leg striding forward, right leg back, opposite arm swung forward; body at its lowest.
- **F2 — PASSING:** legs together passing under the body, body lifted ~2px (up bob).
- **F3 — CONTACT:** right leg striding forward, left leg back, arms swapped; body lowest.
- **F4 — PASSING:** legs together again, body lifted (up bob).
The held tool/weapon and upper body stay in the same grip throughout — only legs/arms swing and the body bobs.

**Vehicles:** swap to a tread-scroll / wheel-rotation cycle (4 offsets) + a 1–2px chassis bounce; no legs.
**Flyers:** a gentle hover bob (1–3px) + thruster/rotor glow pulsing through 4 phases; no legs.

## Consistency loop (use on every retry)
```
Use this as the exact style/scale/lighting/palette reference. Regenerate the same strip with the same green background and magenta gutters, fixing only [the cells that look wrong]. Do not change the art style or any other cell.
```

---

## Hard-won lessons (read before generating/slicing)
- **Nano Banana fakes transparency** — it bakes a grey checkerboard as opaque pixels. So ask for a **solid flat color** background (green `#00ff00` for characters) instead of "transparent." It's far cleaner to chroma-key than to undo a baked checkerboard.
- **Green key is safe** for characters: nothing on a steel/cyan/red unit is green-dominant, so `g>120 && g>r+35 && g>b+35` removes only the background (cyan glow has high blue → survives).
- **Checkerboard key must be TIGHT:** use neutral tolerance ≤ ~6. A loose tolerance (16) once removed the HQ's red-tinted glass facade because it read as "neutral grey." Building surfaces have a slight tint; the checker is strictly neutral.
- **Cell-isolate frames:** a uniform crop box can be wider than the cell and bleed a sliver of the neighbouring sprite (showed up as a vertical "border line"). Copy only within each cell's bounds and inset a few px to clip gutter AA.
- **Share a baseline** across frames (align bottoms, center on content) so walks don't jitter.
- **Keep weapons/effects inside the green margin** — anything touching the magenta gutter gets clipped or bleeds.
