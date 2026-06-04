---
name: starleft-unit-forge
description: >-
  Create a new playable UNIT or named HERO for the STARLEFT RTS, end to end — generate its animated
  sprite sheets from a text description with the Gemini image API, wire it into the game (DEF stats,
  cost, production button, sprite tables), verify it's balanced against the existing roster, suggest
  its build prerequisite, and calibrate its muzzle laser FX. Use this WHENEVER the user wants to add,
  create, design, or invent a STARLEFT unit, trooper, vehicle, mech, flyer, healer, or hero — even
  if they only say "add a unit", "make a new trooper", "design a sniper", "create a hero like Nino",
  "what if we had a stealth drone", or describe a unit concept without naming the game. Treat a
  description of a combat unit, its weapon/role, or a named character to recruit as a STARLEFT
  unit-forge task. It knows the art pipeline in _dev/gen + _dev/prompts, the DEF/BUILD_HIRES wiring,
  the production-building prerequisite system, the hand-tuned balance envelope, the career/dossier
  hero system, and the laser muzzle calibrator. Reach for it before hand-editing DEF or the sprite
  tables, so the unit fits the schema, balances, animates, and fires from the right barrel. SKIP for:
  tweaking an existing unit's numbers (just edit DEF), questions about how an existing unit works,
  new campaign maps/episodes/factions (use starleft-mapmaker), and pure bug fixes.
---

# STARLEFT Unit Forge

A guided pipeline for adding a unit or hero to STARLEFT. Adding one touches six systems — the Gemini
art pipeline, the `DEF` stats, the production menu and its prerequisites, the sprite-loader tables,
the laser-muzzle data, and (for heroes) the dossier/career system — and missing any one fails
quietly: a unit that renders tiny, can't be trained, or fires its laser from its feet. This skill
runs all of it in order, so art, balance, and wiring stay one job rather than six chances to slip.

You are **collaborating, not autogenerating.** Sprite generation costs API credits and is
non-deterministic, balance is a judgment call, and the muzzle calibrator is a visual click tool — so
each phase ends with something concrete for the user to react to before you spend the next round.
Confirm the stat/cost draft before generating art, and confirm the art before wiring it in.

## Before you start: load the world

Read these so you're matching the game, not re-deriving it:
- **`references/unit-creation-guide.md`** — the `DEF` schema (every field), the full wiring
  checklist, the producer-building prerequisite tiers, the comparative balance table + heuristics,
  the hero branch, and the muzzle recap. This is the backbone of Phases 2 and 5.
- **`references/art-prompt-guide.md`** — how to turn a description into a `UNITS[type]` entry in
  `_dev/gen/gen_units.mjs` and run the generate→slice pipeline (the shared style rules are already
  baked into the generator). The backbone of Phases 3–4.
- For lore/faction tone (especially heroes), skim `../starleft-mapmaker/references/world-bible.md`.

Then read the live source so your edits match reality:
- `js/config.js` — the `DEF` table (and `BUILD_HIRES` just below it) and, for heroes, the `MAPS`
  `heroes[]` entries.
- `js/assets.js` — `UNIT_WALK` / `UNIT_ACTION` / `UNIT_SPRITE_H`. `js/ui.js` — `buildCommands()`.

## The phases

Work through these in order. Each ends with a checkpoint.

### Phase 1 — Concept

Pin down what the unit *is* before any numbers or art. From the user's description settle:
- **Name + role** — melee / ranged / support-heal / vehicle / air, and the satirical title.
- **Silhouette & weapon** — the readable 28px shape and the thing it fights with (this becomes its
  art and its muzzle).
- **Tier & size** — cheap-and-small harasser … capital-and-huge investment. This drives both stats
  and the producer building.
- **Hero or rank-and-file** — a buildable unit, or a named character that's placed on a map and
  carried across episodes (the hero branch skips production and adds a dossier).

Read the current `DEF` roster so the new unit has a *niche* the roster lacks rather than a
near-duplicate. State your read of the concept and its niche in a sentence or two and confirm with
the user before drafting stats.

### Phase 2 — Stats, cost & prerequisite (with the balance check)

Draft the `DEF` entry from the concept (see the schema in the guide). Pick the **producer building /
prerequisite** from role + cost + supply: infantry/cheap → `barracks`; vehicle/mid-heavy (cost ≳150
or supply ≥3) → `garage`; air → `launchpad` (which itself requires a Garage). There is no separate
prereq field — the producer *is* the prerequisite.

Run the comparative balance check and iterate until it's clean:
```bash
node .claude/skills/starleft-unit-forge/scripts/balance-check.js --draft '{"type":"<t>","name":"…","cost":…,"hp":…,"dmg":…,"cd":…,"range":…,"speed":…,"supply":…}' --producer <tier>
```
It prints the unit beside its tier-peers (dps, dps/cost, hp/cost, cv, supply, role) and flags
problems: a unit that beats its tier on **both** offense and defense efficiency (no weakness), an
over/under-priced unit, a carryover-runaway risk (a level-5 veteran that would outclass the whole
roster), or a supply mismatch. The goal isn't to match peers exactly — it's to have **one clear
strength and one clear weakness**, like every shipping unit. (`balance-check.js --table` dumps the
whole roster for context.)

Show the user the drafted `DEF` block, the suggested producer + any extra gate, and the balance
read. Get a thumbs-up before generating art — art is the expensive, slow step.

### Phase 3 — Generate the sprites (review loop)

Compose the `subj` / `walk` / `action` strings from the description using
`references/art-prompt-guide.md`, and add the `UNITS['<type>']` entry to `_dev/gen/gen_units.mjs`
(for a hero, also set the `style`/`avoid` HERO override). Then generate:
```bash
node _dev/gen/gen_units.mjs <type>          # add --force to regenerate an existing strip
```
This calls the Gemini image API (`gemini-3-pro-image` → flash fallbacks; key from `_dev/.env`) and
writes `_dev/gen/unit_<type>_walk.png` + `unit_<type>_<action>.png`.

**Review every frame** (read the PNGs): is the subject identical across all 10 cells, feet on a
shared baseline, the weapon fully inside its cell, and — for ranged units — a clear cyan muzzle
flash on the firing frame? Re-run with `--force` until the strips are on-model. If the API is down
or rate-limited it retries across three models; if all fail, tell the user and offer to retry rather
than faking art. Show the user the frames and confirm before slicing.

### Phase 4 — Slice into game sprites

```bash
python3 _dev/gen/slice_units.py <type>
```
This green-keys, baseline-aligns to a 10-frame strip, and writes
`assets/units/<type>/{walk,<action>}.png` plus the recolored `_enemy` twins. For a **hero**, write a
bespoke `_dev/gen/slice_<hero>.py` (modeled on `slice_nino.py` / `slice_biba.py`) that skips the
cyan→red recolor and applies the hero's palette. Verify the four PNGs exist and look right (open
them); a jittery or mis-baselined strip means Phase 3 wasn't on-model — go back.

### Phase 5 — Wire it into the game

Follow the checklist in `references/unit-creation-guide.md` §2. For a **buildable unit**:
- `js/config.js` — add the `DEF` entry and append the type to its producer's `BUILD_HIRES` array.
- `js/ui.js` — add the train button in `buildCommands()` under that producer's gate (mirror the
  existing `addCmd(DEF.<t>.icon, '<Name>', DEF.<t>.cost, ()=>train('<producer>','<t>'))` pattern; a
  new gate uses `hasFinished('<prereq>')`).
- `js/assets.js` — add `UNIT_WALK`, `UNIT_ACTION`, and a `UNIT_SPRITE_H` draw-height (chosen
  relative to peers).
- `js/ai.js` (optional) — add the type to an enemy production pool so the AI fields it too.

For a **hero**, skip production entirely: add the recolored sprite set, author the dossier, and
place it in a map's `MAPS[idx].heroes[]` (guide §5). Only add a new `DEF` type if the hero is
mechanically distinct from its base unit.

Then confirm the wiring:
```bash
node .claude/skills/starleft-unit-forge/scripts/verify-wiring.js <type>
```
It checks the unit is present and coherent across `DEF`, `BUILD_HIRES`, `ui.js`, the `assets.js`
tables, the sprite files, and (for ranged units) the muzzle data — and lists anything missing.

### Phase 6 — Calibrate the muzzle laser (ranged units only)

If `range > 2` and `dmg > 0`, the unit fires the glowing laser bolt and needs a `MUZZLE['<type>']`
entry so the bolt leaves its barrel (not its feet). First register the new type in the calibrator so
it appears in the tool — add `'<type>'` to the `UNITS` array in `js/muzzle-calibrator.js` (and a
seed in its `DATA`, a `UNIT_SPRITE_H`, and `FACES_LEFT['<type>']=true` if it faces left). Then:
```bash
python3 -m http.server 8000   # then open http://localhost:8000/muzzle-calibrator.html
```
Pick the unit, scrub to the firing frame, click the barrel tip to set `(mx,my)`, tune the width `w`,
and paste the exported entry into `js/muzzle_data.js`. Melee/support units skip this — they don't
fire a bolt and `MUZZLE_FALLBACK` covers anything that does.

### Phase 7 — Verify in-game

Serve and open the game, then exercise the unit:
```bash
python3 -m http.server 8000   # http:// (co-op needs it); then localhost:8000/rts.html
```
- Console: `mkUnit(G,'<type>','player', tx, ty); refreshUI();` spawns one. Confirm it renders at a
  sane size, walks, and (ranged) its laser leaves the muzzle — player-red, enemy-blue.
- Build the producer building and train it from the menu (the button appears under the right gate).
- Issue move/attack; save and reload (the unit persists); for a hero, click it and confirm the
  dossier renders.
- Re-run `verify-wiring.js <type>` (all green) and, if the unit will ship in the campaign, run the
  real balance gate on a representative map:
  `node .claude/skills/starleft-unit-forge/scripts/simulate_balance.js <mapIdx> --gate`.

Then summarize for the user: the unit's stats/role/niche, its producer/prerequisite, the balance
read, and what was generated vs. handed off.

## Guardrails

- **Don't duplicate a `DEF` key** — adding `DEF['<t>']` over an existing one silently overwrites it.
  Check first; warn the user before any overwrite.
- **`BUILD_HIRES` is the single prerequisite source** — don't invent a `prereq` field. Gate via the
  producer building (and a compound `hasFinished()` for "requires X", like Launch Pad → Garage).
- **Balance is one-strength-one-weakness**, not "beats everything." Heed `balance-check.js` flags;
  for a campaign unit, clear `simulate_balance.js --gate` (it sees the veteran-scaling the static
  table can't). Keep ≥1 antiAir unit in the roster or air goes uncontested.
- **Art holds the dark Hades/cyberpunk palette** — desaturated steel/charcoal, player cyan/blue
  (enemy is the red recolor), never bright/pastel. Keep the strict 5×2 green-screen grid the slicer
  needs; an off-model strip breaks slicing.
- **Save/net stay free** for plain DEF units (DEF-driven, backward-compatible). Only a genuinely new
  *entity field* needs `js/save.js` + `js/net/sync.js` care — flag it if the unit has a novel
  mechanic. Asset paths stay relative.
- **Register ranged units in the calibrator** (`muzzle-calibrator.js` UNITS) so the muzzle is
  tunable, and add the `UNIT_SPRITE_H` everywhere it's mirrored.
- **Never print or commit `GEMINI_API_KEY`** (it lives in `_dev/.env`).

## Optional follow-through

- **Use it in the campaign.** Want enemies to field the unit, or to place a hero in a chapter? That's
  map data — offer the `starleft-mapmaker` skill for the `enemies`/`heroes` placement and any
  faction/crawl tie-in.
- **Voice barks / lore.** Named heroes and flavorful units can get TTS barks (the `_dev/gen/`
  voice pipeline) and dossier lore — separate work; flag it rather than faking it.
- **A new producer building** (beyond barracks/garage/launchpad) is a bigger change — a new building
  `DEF` + `BUILD_HIRES` key + a gated place-button + map placement. Prefer an existing tier; if a new
  one is truly needed, scope it explicitly with the user.
