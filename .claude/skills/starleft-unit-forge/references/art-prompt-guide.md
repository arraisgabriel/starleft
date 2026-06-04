# Art-prompt guide — turning a description into a sprite sheet

How to generate a unit's `walk` + `action` strips in the game's dark cyberpunk-Hades style, by
filling a `UNITS[type]` entry in `_dev/gen/gen_units.mjs` and running the existing pipeline. The
deeper prompt reference lives in `_dev/prompts/{README,units,units-core,units-expanded,shared-blocks}.md`
— read those if you need terrain/building prompts or the slicer internals; this guide is just the
unit path.

## The pipeline (what the skill runs)
```
edit _dev/gen/gen_units.mjs  →  add UNITS['<type>'] = { subj, walk, action }
node _dev/gen/gen_units.mjs <type> [--force]   →  _dev/gen/unit_<type>_walk.png + unit_<type>_<action>.png
python3 _dev/gen/slice_units.py <type>          →  assets/units/<type>/{walk,<action>}.png (+ _enemy twins)
```
- `gen_units.mjs` already bakes in **all the hard rules** (the strict 5×2 grid of 10 frames, solid
  green `#00ff00` background, 4px magenta `#ff00ff` gutters, identical subject across frames, the
  dark Hades palette, 3/4 top-down-ish view, no text/shadow/UI, weapon fully inside the cell) via
  its `STYLE` / `AVOID` blocks. **You don't repeat those** — you only write the per-unit subject and
  motion. Reads `GEMINI_API_KEY` from `_dev/.env`; tries `gemini-3-pro-image → gemini-3.1-flash-image
  → gemini-2.5-flash-image`.
- The slicer green-keys, baseline-aligns to a 10-frame strip, and derives the **red enemy twin** by
  recolor. Player art is generated in **cyan/blue only**; never prompt for the red version.

## The `UNITS[type]` entry shape
```js
<type>: {
  subj:   `the <NAME> — <one vivid sentence: silhouette + chassis/outfit + weapon/tool + size cue>`,
  walk:   <a motion string, or reuse WALK_HUMANOID>,
  action: { name: 'attack' | 'mine' | 'heal', spec: `<10-frame motion with a cyan flash on the firing frame>` },
  // heroes only — allow non-cyan signature colors:
  style:  HERO_STYLE + HERO_VIEW,  avoid: HERO_AVOID,
}
```

### Writing `subj` (the silhouette)
Pull these from the user's description and pack them into one sentence:
- **role/name** — the satirical title ("the SHORT-SELLER", "the GROWTH HACKER").
- **silhouette + chassis/outfit** — humanoid in plated armor? sleek operative? tracked vehicle?
  bipedal mech? airship? Make it **readable at ~28px** — one bold shape.
- **weapon/tool** — the thing it fights with; this is what the action animates and where the muzzle
  flash will be. Long weapons → "draw the unit smaller so the whole thing fits the cell."
- **palette** — desaturated steel-grey/gunmetal/charcoal with **player cyan/electric-blue accents**
  (`#3b7fd0`, glowing `#7fd6ff`); any energy/weapon glow is **cyan**. Never bright/cheerful/pastel,
  never red (that's the enemy recolor).
- **size cue** — relative scale ("small and skinny, clearly the weakest" / "massive 12-ft exosuit").
  This should track the `UNIT_SPRITE_H` you'll set and the unit's `hp`/`cost` tier.

### Writing `walk`
- **Bipedal** → reuse the shared `WALK_HUMANOID` constant (a clean stride loop; tool stays gripped).
- **Vehicle** (`vehicle:true`) → a tread-scroll / wheel-rotation cycle with a 1–2px chassis bounce,
  faint cyan exhaust; **no legs** ("the body is identical every frame; ONLY wheels/tread/bounce change").
- **Flyer** (`air:true`) → a gentle 1–3px hover bob with rotor/engine glow pulsing through 10 phases;
  no legs.

### Writing `action.spec` (the most important part for ranged units)
The action is a 10-frame **windup → fire/strike → recover** loop with the subject otherwise still.
For a **ranged** unit the firing frames (≈5–6) **must show a clear, concentrated cyan muzzle flash
at the exact barrel tip** — this is what reads as "firing" and what you'll click in the muzzle
calibrator later, so it has to be unambiguous and well inside the cell.
- melee → reuse `ATK_MELEE` (windup → strike with a cyan blade flash → recover).
- ranged → a fire cycle: "shoulders/aims (1–4), FIRES with a bright concentrated cyan muzzle flash
  at the barrel tip + a thin cyan tracer (5–6), recoil with faint cyan smoke (7–8), settles (9–10)."
- heal → "raises the wand, a soft cyan healing beam builds to full brightness (5–7), fades (8–10)."
- mine (worker-likes) → "raises the tool overhead, swings down, cyan spark on impact (5–6), recovers."

Map the action `name` to the unit's role: attackers → `attack`, healers (`dmg:0`) → `heal`,
gatherers → `mine`. It must match the `UNIT_ACTION[type]` key and the output filename
(`assets/units/<type>/<name>.png`).

## Heroes (non-cyan signature palette)
The generic `STYLE`/`AVOID` force cyan-only accents and forbid bright/pastel — which would strip a
hero's signature look (e.g. Biba's white vest + silver hair). For a hero, set `style: HERO_STYLE +
HERO_VIEW` and `avoid: HERO_AVOID` on the entry (see the `biba` example in `gen_units.mjs`). Those
keep the same grid/consistency/view rules and the dark devastated base, but allow the hero's
deliberate signature colors. Heroes also use a bespoke `slice_<hero>.py` that skips the enemy recolor
(see the unit-creation guide §5).

## Reviewing & regenerating (the review loop)
10 consistent character frames is the hardest case for the model — expect to iterate.
- After generation, **look at every frame**: same design/colors/size across all 10? feet on a shared
  baseline? weapon fully inside the cell (nothing crossing a magenta gutter)? a clear cyan flash on
  the firing frame? solid green bg?
- Re-run `node _dev/gen/gen_units.mjs <type> --force` to regenerate (it skips existing files without
  `--force`). If only one strip is off, regenerate just that one (`<type>` runs both walk+action).
- The model exposes no seed; consistency comes from the prompt. If it keeps drifting, tighten the
  `subj` (more specific silhouette/weapon) rather than adding more rules.
- Only proceed to slicing once the strips are on-model — the slicer assumes a clean green grid with a
  consistent figure; off-model frames produce a jittery or mis-baselined animation.

## Extraction checklist (what to get from the user before generating)
1. Name + role (melee / ranged / support-heal / vehicle / air).
2. Silhouette & weapon (the thing that defines its 28px shape and its muzzle).
3. Size/tier cue (cheap-and-small … capital-and-huge) — ties to stats + `UNIT_SPRITE_H`.
4. Hero or rank-and-file (hero → signature palette + dossier, no production).
5. Anything `facesLeft` (weapon/nose points left by default) so it's flagged in DEF + the calibrator.
