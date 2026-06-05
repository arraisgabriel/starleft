# Unit creation guide — schema, wiring, balance, heroes, muzzle

The single reference for *what to edit and why* when forging a STARLEFT unit. Read this before
Phase 2. Everything here matches the live code as of writing — when in doubt, read the source
(`js/config.js`, `js/assets.js`, `js/ui.js`) so you're matching reality, not this summary.

## Table of contents
1. The DEF schema (every field)
2. The wiring checklist (where a unit must be registered)
3. Prerequisites & the producer-building tier
4. Balance: the roster table + the heuristics
5. The hero branch (named characters)
6. Muzzle calibration recap
7. Save / multiplayer safety

---

## 1. The DEF schema

A unit is a data object in the `DEF` table in `js/config.js`. `mkUnit()` (`js/map.js`) copies a
subset onto each entity (`hp, maxHp, sight, speed, r, dmg, range, cd, air`); every other field is
read from `DEF[type]` at runtime, which is why adding optional fields never breaks old saves.

**Required** (a buildable combat unit):
- `name` — display name (satirical corporate register: "Growth Cyborg", "Consultant").
- `icon` — one emoji (shown on the train button).
- `kind` — always `'unit'`.
- `hp` — max life.
- `cost` — Funding (gold) to train.
- `build` — train time in seconds.
- `sight` — vision radius in tiles (drives fog reveal).
- `supply` — population the unit eats (1 infantry … 6 capital). Players have a supply cap.
- `speed` — move speed in tiles/sec.
- `dmg` — damage per hit (`0` for pure healers/support).
- `range` — attack range in tiles. **`range > 2` = "ranged" → fires the laser bolt and needs a muzzle.**
- `cd` — attack cooldown in seconds (so DPS = `dmg / cd`).
- `r` — collision radius in px (≈ physical size; not the drawn size).

**Optional** (role tags & extras):
- `splash`, `splashR` — area damage amount + radius multiplier (hustler, foodtruck, founder).
- `vehicle: true` — a vehicle (no legs; affects nothing mechanical but signals the art style).
- `air: true` — flyer: ignores terrain, drawn raised, only `antiAir` units can hit it.
- `antiAir: true` — can target flyers. **Keep ≥1 antiAir unit in the roster or air goes uncontested.**
- `siege: { dmg, range, splashR, setup }` — deploy-mode heavy cannon (auditor); roots & outranges.
- `action: 'heal' | 'mine'` — non-attack action; healers set `dmg: 0` + `heal: <amount/sec>`.
- `heal` — heal-per-second for support units (recruiter, courier).
- `facesLeft: true` — the art faces LEFT by default (bomber); the renderer mirrors accordingly.
- `flavor` — one-line lore string shown in the info panel.

Draft example (a barracks marksman):
```js
sniper: { name:'Short-Seller', icon:'🎯', kind:'unit', hp:90, cost:120, build:18,
          sight:8, supply:1, speed:2.3, dmg:28, range:6.5, cd:1.8, r:9,
          flavor:'Calls the top from a rooftop. One shot, long reload.' },
```

---

## 2. The wiring checklist

Run `scripts/verify-wiring.js <type>` at the end to confirm all of this. Every buildable unit needs:

| # | File | What to add |
|---|------|-------------|
| 1 | `js/config.js` `DEF` | the unit object (§1) |
| 2 | `js/config.js` `BUILD_HIRES` | append the type to its producer's array (§3) |
| 3 | `js/ui.js` `buildCommands()` | an `addCmd(DEF.<type>.icon, '<Name>', DEF.<type>.cost, ()=>train('<producer>','<type>'))` under that producer's `if(owned.some(... ==='<producer>'))` gate |
| 4 | `js/assets.js` `UNIT_WALK` | `<type>: walkPair('<type>','walk')` |
| 5 | `js/assets.js` `UNIT_ACTION` | `<type>: { <action>: walkPair('<type>','<action>') }` (`attack`/`heal`/`mine`) |
| 6 | `js/assets.js` `UNIT_SPRITE_H` | `<type>: <draw height px>` — pick relative to peers (worker 46 … founder 92, bomber 96) |
| 7 | `assets/units/<type>/` | `walk.png`, `walk_enemy.png`, `<action>.png`, `<action>_enemy.png` (produced by the slicer) |
| 8 | `js/muzzle_data.js` `MUZZLE` | **ranged only** — `<type>: { mx, my, w }` (§6) |
| 9 | `js/muzzle-calibrator.js` | **ranged only** — add `'<type>'` to its `UNITS` array (+ a seed in `DATA`, `UNIT_SPRITE_H`, and `FACES_LEFT` if `facesLeft`) so the tool can tune it |
| 10 | `js/ai.js` (optional) | add `'<type>'` to an enemy production pool (`ai.js` ~lines 38-48) if enemies should build it |

Notes:
- `BUILD_HIRES` (`js/config.js`, ~line 150) is the **single source of truth** for "which building
  hires which unit" — it drives the info-panel roster preview. The `ui.js` button must match it.
- `refreshUI()` rebuilds command buttons from a signature of owned buildings — don't fight that;
  just add your `addCmd` in the right gated block.
- If the unit needs a **new producer building**, that's a bigger change (new `DEF` building entry +
  `BUILD_HIRES` key + a place-building button gated on its prereq + map placement). Prefer an
  existing tier; if a new building is truly needed, consider the `starleft-mapmaker` skill for the
  building/economy side.

---

## 3. Prerequisites & the producer-building tier

There is **no `prereq` field**. A unit's prerequisite *is* the building that trains it, gated in
`ui.js`. The tiers (and their place cost — note the rising cost = rising tier):

| Producer | Place cost | Gate | Trains today |
|----------|-----------|------|--------------|
| `hq` | free | always | worker |
| `barracks` | 150 | — | soldier, ranger, recruiter, hustler, lobbyist (infantry/support) |
| `garage` | 200 | — | foodtruck, auditor, founder (vehicles) |
| `launchpad` | 250 | **requires a Garage** (`hasFinished('garage')` in ui.js) | courier, bomber (air) |

**Suggesting a prerequisite** (Phase 2): pick the producer from the unit's role/cost/supply —
- infantry / cheap (cost ≲150, supply 1) → `barracks`
- vehicle / mid-heavy (cost ≳150 or supply ≥3) → `garage`
- air (`air: true`) → `launchpad` (and it inherits the garage prereq)

For a deeper "only after X" gate, add a compound `hasFinished('<X>')` check in `ui.js` (the Launch
Pad-requires-Garage pattern). Always tell the user the suggested producer + any extra gate and why.

---

## 4. Balance: roster table + heuristics

STARLEFT has **no balance formula** — DEF is hand-tuned. So a new unit is "balanced" when it lives
inside the envelope its tier-peers already define and doesn't dominate them on every axis. Use
`scripts/balance-check.js <type|--draft>` — it prints this table for the unit's tier and flags
outliers. (`scripts/balance-check.js --table` dumps the whole roster.)

Shipping roster (dps = dmg/cd; cv = hp·dps/1000; the efficiency benchmark is the **soldier**):

| tier | unit | cost | hp | dmg | cd | dps | dps/$ | hp/$ | cv | range | spd | sup | role |
|------|------|-----:|---:|----:|---:|----:|------:|-----:|----:|------:|----:|----:|------|
| barracks | soldier | 80 | 140 | 17 | 0.9 | 18.9 | 0.236 | 1.75 | 2.6 | 1.3 | 2.4 | 1 | melee |
| barracks | ranger | 95 | 95 | 14 | 1.1 | 12.7 | 0.134 | 1.00 | 1.2 | 5.0 | 2.4 | 1 | ranged |
| barracks | hustler | 70 | 70 | 10 | 0.7 | 14.3 | 0.204 | 1.00 | 1.0 | 1.6 | 3.5 | 1 | melee/splash |
| barracks | lobbyist | 196 | 70 | 36 | 2.3 | 15.7 | 0.080 | 0.36 | 1.1 | 7.5 | 2.2 | 2 | ranged/sniper |
| barracks | recruiter | 99 | 80 | 0 | 1.0 | — | — | 0.81 | — | 4.0 | 2.5 | 1 | heal |
| garage | foodtruck | 90 | 110 | 11 | 1.0 | 11.0 | 0.122 | 1.22 | 1.2 | 3.0 | 3.6 | 2 | ranged/splash |
| garage | auditor | 175 | 200 | 18 | 1.4 | 12.9 | 0.073 | 1.14 | 2.6 | 5.0 | 1.8 | 3 | ranged/siege/antiAir |
| garage | founder | 599 | 600 | 45 | 1.5 | 30.0 | 0.050 | 1.00 | 18.0 | 3.5 | 1.6 | 6 | melee/splash/antiAir |
| launchpad | courier | 90 | 120 | 0 | 1.0 | — | — | 1.33 | — | 4.0 | 3.0 | 2 | air/heal |
| launchpad | bomber | 630 | 480 | 26 | 0.9 | 28.9 | 0.046 | 0.76 | 13.9 | 6.0 | 1.7 | 6 | air/ranged/antiAir |

Heuristics the checker encodes (and you should hold in mind):
- **Efficiency declines as you go up-cost/up-tier.** You pay a premium for concentrated power, long
  range, splash, durability, and flight. The frontline `soldier` (~0.236 dps/$, 1.75 hp/$) is the
  efficiency ceiling; specialists trade efficiency for utility. A new unit shouldn't beat its tier
  on **both** dps/cost **and** hp/cost — that's a dominant unit with no weakness.
- **Every unit has one strength + one weakness.** founder = strong but slow & expensive & high
  supply; hustler = cheap & fast but fragile; lobbyist = huge range/burst but slow cd & squishy &
  pricey. Give yours a clear trade.
- **Supply tracks power**: 1 (infantry) → 2 (mid vehicle/sniper) → 3 (auditor) → 6 (capital). Low
  supply on a strong unit invites spam; high supply on a weak one makes it not worth the cap.
- **Carryover ceiling**: a level-5 veteran multiplies hp×1.65 and dmg×1.75 (≈4.6× combat value).
  The `founder` (cv 18) is the current roster ceiling; a unit whose `cv` tops that while being
  cheaper is a carryover-runaway risk — `balance-check.js` flags it. Confirm on a map with
  `node scripts/simulate_balance.js <mapIdx> --gate` (the real, vetScaling-aware gate).
- **Air coverage**: keep ≥1 antiAir unit so flyers can be contested.

`balance-check.js` is a design aid (advisory). `simulate_balance.js --gate` is the mandatory gate
(it accounts for `js/balance.js` veteran scaling against an actual map).

---

## 5. The hero branch (named characters)

Heroes (Nino, Biba) are **not produced** — they're story characters placed on a map and carried
across episodes. A hero is a normal unit type *visually overridden* plus lore.

Differences from a rank-and-file unit:
- **No `BUILD_HIRES` / no train button / no producer.** Skip checklist rows 2, 3, 10.
- **`spriteType` visual override**: the hero uses a base unit's gameplay `type` (e.g. `lobbyist`)
  but its own recolored sprite set under `assets/units/<heroSprite>/` (e.g. `nino`). Heroes draw
  15% larger (`HERO_SCALE`).
- **Custom recolor slice**: write a `_dev/gen/slice_<hero>.py` modeled on `slice_nino.py` /
  `slice_biba.py` that **skips** the cyan→red enemy recolor (writes the same art to both
  `walk.png` and `walk_enemy.png`) and applies the hero's hand-authored palette. Use the
  `HERO_STYLE`/`HERO_AVOID` override in `gen_units.mjs` (the Biba example) at generation time so
  white/silver/non-cyan signature colors survive.
- **Map placement + dossier**: add to a map's `heroes[]` array in `js/config.js`:
  ```js
  heroes: [ { name:'Nino', type:'lobbyist', sprite:'nino', level:11, dossier:{
    first:'Nino', last:'', home:'the Glitch Sprawl', rel:'crew', relName:'the first team',
    family:'…', trauma:'…', dream:'…', crime:'…' } } ]
  ```
  `spawnHeroes()` (`js/career.js`) spawns it at HQ with `u.hero=true`, `u.heroId=name`,
  `u.spriteType=sprite`, `u.lore.fixed=dossier`. Heroes persist across maps via `carryoverHeroes[]`.
- **Dossier tone**: dark, satirical, second-person-adjacent; the fields feed the in-game dossier
  panel and the campaign's career/memorial system. Keep it coherent with the world bible
  (`docs/world-bible.md`).

A hero still goes through art-gen → slice → DEF? No: if the hero reuses an existing base `type`'s
stats, you do **not** add a new `DEF` entry — only the recolored sprite set + the `heroes[]` entry.
Add a new `DEF` type only if the hero is mechanically distinct.

---

## 6. Muzzle calibration recap (ranged units)

A unit with `range > 2` and `dmg > 0` fires the glowing laser bolt (`render.js drawLaserBolt`,
spawned in `units.js` only when `aRange>2`). The bolt's origin is the unit's gun muzzle, read from
`MUZZLE[type] = { mx, my, w }` in `js/muzzle_data.js`:
- `mx`, `my` — the barrel tip as a **normalized fraction of one attack frame** (0,0 = top-left;
  mx 1 = right edge; my 1 = the unit's feet). Measured on the un-flipped sprite; the engine mirrors
  and scales it automatically (`muzzleWorld` in `js/assets.js`).
- `w` — beam-width multiplier (bigger mechs read larger; founder 1.5, bomber 1.4).

To author it: register the new type in `js/muzzle-calibrator.js` (`UNITS` + a `DATA` seed +
`UNIT_SPRITE_H` + `FACES_LEFT` if it faces left), open `muzzle-calibrator.html`, scrub to the
firing frame, click the barrel tip, tune `w`, and paste the exported entry into `muzzle_data.js`.
Melee/support units need no entry — `MUZZLE_FALLBACK` covers them (and they don't fire a bolt anyway).

---

## 7. Save / multiplayer safety

- **Saves**: plain DEF stat units are backward-compatible automatically — old saves never referenced
  the new type, and `DEF` lookups fall back gracefully. You only touch `js/save.js` if you add a
  **new persisted entity field** (rare; a unique mechanic). Don't.
- **Multiplayer**: training routes through `netTrain` (`js/net/commands.js`) → `tryTrain`, identical
  across solo/host/client. A plain unit needs no `js/net/sync.js` change. Only a **new entity field**
  with special mechanics would need snapshot packing/unpacking — flag it to the user if so.
- **Paths stay relative** (`assets/units/<type>/…`) so the game works from a GitHub Pages subpath.
- **Missing-art fallback**: if a sprite is absent the renderer falls back to a procedural vector for
  the few hand-coded types (worker/soldier/ranger) and otherwise draws nothing useful — so confirm
  the slicer wrote the four PNGs before shipping.
