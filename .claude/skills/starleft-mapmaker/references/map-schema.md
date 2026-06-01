# STARLEFT — Map Schema & Cookbook

Everything needed to write a valid `MAPS[]` entry in `js/config.js`. A map is **pure data**: you
define a skeleton, and `newMap()` (`js/map.js`) procedurally generates terrain from a seed, validates
reachability, carves bridges to any stranded objective, places landmark megasprites, and spawns all
entities. You never write tiles by hand.

## Contents
1. The coordinate system (read this first)
2. Full field reference
3. Biome cookbook (copy-paste recipes)
4. Difficulty escalation table
5. Feature-placement guidance
6. Worked example
7. Common pitfalls

---

## 1. The coordinate system

- `w`, `h` are the map's tile dimensions **before** scaling.
- **Every coordinate you write** (`player`, `enemies`, `goldNodes`, `lakes`, `rockClusters`,
  `forests`, `lostBases`) is a **pre-scale tile coordinate** and must satisfy
  `0 ≤ x ≤ w-1` and `0 ≤ y ≤ h-1`.
- On load, `newMap()` multiplies the whole config by `MAP_SCALE = 1.7` (dims and all coordinates
  together), so the playable map is bigger but the *relative* layout you authored is preserved.
  **Never pre-multiply coordinates yourself** — write them in the `w`×`h` space.
- Origin `(0,0)` is top-left; `x` grows right, `y` grows down.

---

## 2. Full field reference

```js
{
  // ---- identity & narrative (see world-bible.md §8) ----
  name:      'VIII — The Title',        // Roman numeral MUST match array position & episode
  enemyName: 'THE FACTION',             // appears in crawl + objective (cohesion)
  crawl: {
    episode: 'EPISODE VIII',            // 'EPISODE ' + Roman, matches name
    title:   'THE TITLE',               // uppercase
    text:    'Para 1.\n\nPara 2.\n\nDark closing line....',
  },
  objective: 'THE FACTION holds N campuses — liquidate all N.',  // N == enemies.length

  // ---- dimensions & generation ----
  w: 80, h: 66,                         // tiles, pre-scale (see escalation table for ranges)
  seed: 8,                              // UNIQUE across all maps; drives the procedural terrain

  // ---- terrain recipe (see biome cookbook) ----
  terrain: {
    biomes: ['grass'],                  // any of: 'grass','desert','ice','tech','volcanic'
    seaFrac: 0.10,                      // ~0.05–0.20 — fraction of map that is sea
    mtnFrac: 0.08,                      // ~0.03–0.12 — fraction that is mountain/rock ridge
    centralSea: 0,                      // >0 forces a circular central sea (fraction of min(w,h)); VII uses 0.18
    temp:   { axis:'none', base:0.5, gradient:0, noise:0.2 }, // axis: 'x'|'y'|'diag'|'none'
    moist:  { base:0.55, noise:0.45 },
    freeze: 0.30,                       // temp below → snow/ice  (default 0.30)
    hot:    0.70,                       // temp above (and dry)  → desert (default 0.70)
    dry:    0.42,                       // moisture below → arid (default 0.42; set 1.0 to gate desert by temp only)
    forest: 0.06,                       // grove density on moist grass (0–0.10; use 0 on tech/volcanic)
    beach:  true,                       // sandy shore band where land meets sea
  },

  // ---- economy & pressure (omit to take early-game defaults) ----
  startGold:     300,                   // default 300; ramps to 1600
  startWorkers:  4,                     // default 4;   ramps to 8
  startSoldiers: 2,                     // default 2;   ramps to 6
  startBarracks: false,                 // default false; true from Episode III on
  aggression:    1.0,                   // enemy AI intensity, ~1.0–2.0
  graceTime:     90,                    // frames before the first enemy attack (~88–125)
  waveTimer:     100,                   // frames between attack waves (~96–125)

  // ---- spawns & resources (pre-scale coords) ----
  player:  { x:6, y:58 },               // player HQ center
  enemies: [                            // OR legacy single `enemy: {x,y,...}`
    { x:68, y:10, defenders:3, extraBarracks:true },
    { x:34, y:8,  defenders:3 },
  ],
  goldNodes: [ { x:3, y:54, amt:3000 }, /* ... */ ],   // amt ~1500–4000

  // ---- hand-placed terrain features (all optional; pre-scale coords) ----
  lakes:        [ { x:40, y:32, r:6 } ],              // circular water, r ~3–7
  rockClusters: [ { x:48, y:20, n:18 } ],             // n ~10–18 rocks, scatter-walked
  forests:      [ { x:18, y:54, n:28 } ],             // n ~16–34 trees
  lostBases:    [ { x:36, y:50 } ],                   // OPTIONAL: neutral HQs the player reclaims by walking a unit up (VII only so far)

  // ---- cramped "thicket" regions (OPTIONAL): pack a rectangle wall-to-wall with 2x2
  //      walk-under trees/rocks, then carve a GUARANTEED traversable trail through it ----
  thickets:     [ { x:30, y:14, w:16, h:12, density:0.85, mix:0.5, trail:'auto' } ],
  // x,y = top-left (pre-scale); w,h = size (pre-scale); density 0..1 (lattice fill, ~0.7);
  // mix 0..1 = P(tree) vs rock; trail 'h'|'v'|'auto' (carve along the longer axis).
}
```

Notes on consumption by the generator:
- `enemies[i].defenders` = starting soldier count at that campus; `extraBarracks:true` gives it a
  second People Ops (tougher to crack).
- If a `goldNode` or base lands on water/rock, the generator clears its footprint and carves a land
  bridge so it's always reachable — but keep them on sensible ground anyway for good layouts.
- `temp.axis:'y'` makes a north-cold→south-hot gradient (VII); `'x'` is west→east; `'diag'` diagonal;
  `'none'` flat with only noise.

---

## 3. Biome cookbook (copy-paste, then tune)

These are the exact recipes the shipping maps use. Pick by the mood you want (see world-bible §6).

**Grassland — scrappy origin / deceptive calm** (Ep I)
```js
terrain:{ biomes:['grass'], seaFrac:0.08, mtnFrac:0.07, moist:{base:0.62,noise:0.45}, forest:0.10 },
```

**Flooded grassland — a messy merger** (Ep III)
```js
terrain:{ biomes:['grass'], seaFrac:0.20, mtnFrac:0.06, moist:{base:0.60,noise:0.5}, forest:0.08 },
```

**Desert wastes — brutal scaling / exposure** (Ep II)
```js
terrain:{ biomes:['desert','grass'], temp:{base:0.74,noise:0.18}, hot:0.6, dry:0.65,
          moist:{base:0.42,noise:0.5}, seaFrac:0.05, mtnFrac:0.12, forest:0.02 },
```

**Tech server-farm — you became the monopoly** (Ep IV)
```js
terrain:{ biomes:['tech'], seaFrac:0.13, mtnFrac:0.08, forest:0 },
```

**Volcanic badlands — revenge / scorched ruin** (Ep V)
```js
terrain:{ biomes:['volcanic'], seaFrac:0.10, mtnFrac:0.10, forest:0 },
```

**Frozen winter — betrayal / corporate winter** (Ep VI)
```js
terrain:{ biomes:['ice'], temp:{base:0.20,noise:0.15}, freeze:0.50, seaFrac:0.12, mtnFrac:0.10 },
```

**Frozen-and-scorched, dead central sea — apocalyptic end** (Ep VII)
```js
terrain:{ biomes:['desert','ice'], centralSea:0.18, seaFrac:0.15, mtnFrac:0.03,
          temp:{ axis:'y', base:0.5, gradient:0.72, noise:0.12 },
          freeze:0.36, hot:0.6, dry:1.0, forest:0.03, beach:true },
```

> Adding a new biome *combination* (e.g. `['tech','ice']`) is fine — the generator blends them.
> Adding a new biome *kind* requires new art + renderer/palette work (`js/config.js` `BIOME_PAL`,
> `js/render.js`, atlases). Flag that as separate work; don't invent a kind in data alone.

---

## 4. Difficulty escalation table (the curve to sit on)

The shipping campaign, for calibration. A new map should interpolate to its arc position, not spike.

| Ep | w×h | enemies | startGold | Wk | Sol | Barracks | aggr | grace | wave |
|----|------|---------|-----------|----|-----|----------|------|-------|------|
| I  | 48×40 | 2 | 300* | 4* | 2* | no* | 1.0 | def | def |
| II | 54×46 | 2 | 300* | 4* | 2* | no* | 1.5 | def | def |
| III| 64×54 | 3 | 600 | 6 | 3 | yes | 1.4 | 95 | 105 |
| IV | 72×60 | 3 | 800 | 6 | 4 | yes | 1.6 | 100 | 110 |
| V  | 80×66 | 4 | 1000 | 7 | 4 | yes | 1.8 | 95 | 105 |
| VI | 88×72 | 4 | 1300 | 8 | 5 | yes | 2.0 | 100 | 110 |
| VII| 124×102 | 8 | 1600 | 8 | 6 | yes | 1.7 | 125 | 125 |

`*` = field omitted in config, so the early-game default applies (300 / 4 / 2 / false). From
Episode III on, every economy field is set explicitly — do the same for any mid/late map.

Rules of thumb:
- **Map area and gold-node count** grow together. Roughly 5–7 nodes early, scaling to ~15 late; the
  big finale (VII) has 15 nodes across a huge map. Give the player a defensible cluster of 3–5 nodes
  near their start, then contested nodes in the middle, then nodes near each enemy.
- **Enemy count == the number in your objective.** This is the single most important balance/cohesion
  link.
- **`aggression`** generally climbs; the finale dips slightly (1.7) because the *scale* (8 bases) is
  the difficulty, not per-base ferocity. Use that kind of judgment.

---

## 4b. Balancing for carryover (the simulator + the vetScaling module)

The escalation table tunes a map for a *fresh* start, but in real play the player **carries career
units between episodes**, and a leveled roster can trivialize a map balanced for raw starters. Two
things address this — know both when you set difficulty.

**The carry table** — how many veterans deploy into each map (`vetCarryCountFor`, `js/career.js`),
and how strong they are (`js/career.js`: +15% dmg, +33% HP per level):

| entering map idx | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| veterans carried | 2 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 |

A level-5 unit is ×1.75 dmg / ×2.65 HP; a level-10 is ×2.50 / ×4.30. So three L5 vets + a couple of
healers can clear a mid map in minutes — fine when *earned*, but it means raw map stats undersell the
real difficulty. **Named heroes** (e.g. Nino, `cfg.heroes`) add to this and persist until death,
*outside* the carry cap.

**`js/balance.js` (always on)** answers carried power at runtime: it computes a **Veteran Power
Index** (VPI = Σ `stars·dmgMul·hpMul` over the player's career units at map load) and adds
proportional **bonus defenders to every enemy base** (`vetScalingBonus`, capped at `VET_MAXBONUS`).
With no carryover VPI is 0 and nothing changes — so the shipping no-carry baseline is untouched; the
more career power you bring, the more the enemy musters. Tunables (`VET_SCALE`, `VET_MAXBONUS`,
`VET_MINT_MAX`) live at the top of `js/balance.js`.

**The gate** (`scripts/simulate_balance.js --gate`) is a **deterministic power-ratio check** (no RNG):
it computes player combat power (economy army + carried veterans × their career multipliers) vs the
enemy's defensive power *after* `js/balance.js` scaling, for fresh / typical / invested profiles, and
prints the ratio of each. Read its verdict like this:
- **typical & invested ratio ≥ ~1.0** → winnable. Below → too hard (hard fail).
- **carryover swing (invested ÷ fresh ratio) ≤ 1.5×** → vetScaling is containing carried power. Above
  → carryover trivializes the map (hard fail); raise enemy pressure or `VET_SCALE`/`maxBonus`.
- **swing ≈ 0.8–1.0×** (the shipping norm) → vetScaling fully offsets carryover; the enemy grows to
  match the roster you bring. (If you *want* investing to still feel rewarding, lower `VET_SCALE` a
  little so the swing sits slightly above 1.)
- **arc-position note** ("easy/hard for its slot vs the shipping curve") is advisory — the ratio
  legitimately declines ~18→2 across the campaign, so "high ratio" on an early or restart map is fine.

`--calibrate` prints every map's ratios (the curve the bands are anchored to). The optional `--play`
flag adds an auto-player advisory that only flags *absurd* outcomes (a base nothing can crack, or a
fresh faceroll); it never changes pass/fail — the deterministic ratio is the gate. Don't tune purely
off the static table for mid/late maps — run `--gate` and react to what carryover actually does.

## 5. Feature-placement guidance

- **Player start** in a corner/edge with breathing room and a nearby gold cluster (3–5 nodes) so the
  early economy is safe. Existing starts: `(5,33)`, `(6,6)`, `(6,46)`, `(7,7)`, `(6,58)`, `(8,94)`.
- **Enemy bases** spread around the map, generally opposite/far from the player; give richer
  `defenders`/`extraBarracks` to the ones guarding key ground. Keep ≥ ~15 tiles between the player
  start and the nearest enemy so the opening isn't a rush.
- **Gold nodes**: `amt` ~1500–1800 for peripheral/contested, ~2400–4000 for a prized central node.
  Mirror amounts roughly between the player's cluster and each enemy's so no side is starved.
- **lakes / rockClusters / forests** are texture and chokepoints. Use them to shape lanes between
  bases; don't wall a base in completely (the generator will bridge, but it looks forced). `r` for
  lakes ~3–7; `n` for rocks ~10–18; `n` for forests ~16–34. Scattered trees/rocks render as **2×2
  walk-under features**: the lower 2 tiles block, the upper 2 are passable and units walk *under*
  the canopy (depth-sorted). Mountain-range rock stays an impassable single-tile wall.
- **thickets** (optional): a dense maze region — packs a `w×h` rectangle with 2×2 walk-under
  trees/rocks at `density`, then carves and *guarantees* one traversable `trail` ('h'/'v'/'auto')
  through it. The generator keeps a keep-out around spawns/bases/gold and re-validates reachability,
  so it can't wall off an objective. Great for ambush corridors and "fight through the forest" beats.
- **lostBases** (optional, the reclaim mechanic): neutral HQs placed in contested no-man's-land that
  the player captures by walking a unit to them — a strong narrative device for "reclaim what was
  lost." Mention them in the objective if used.

---

## 6. Worked example (a new Episode VIII, appended)

A frozen-tech "post-IPO" beat: you've won, and now you fight the hollow machine you built.

```js
{
  name:'VIII — The Dead Cap Table',
  enemyName:'THE ESTATE',
  aggression:1.9,
  startGold:1500, startWorkers:8, startSoldiers:6, startBarracks:true,
  graceTime:115, waveTimer:118,
  crawl:{ episode:'EPISODE VIII', title:'THE DEAD CAP TABLE',
    text:'You went public. The confetti is already landfill.\n\nWhat\'s left of everyone you liquidated has been rolled into THE ESTATE — an automated holding company with no people in it, only standing orders and your own playbook turned against you.\n\nThe ones who carried names this far are tired. Reclaim the cold campuses, shut down the machine, and find out if winning was ever a thing that could happen....' },
  w:96, h:78,
  seed:8,
  // a tech grid gone to frost — the monopoly you built, abandoned and freezing over
  terrain:{ biomes:['tech','ice'], temp:{base:0.28,noise:0.16}, freeze:0.46, seaFrac:0.12, mtnFrac:0.08, forest:0 },
  enemies:[ {x:86,y:68, extraBarracks:true, defenders:5}, {x:88,y:14, extraBarracks:true, defenders:5},
            {x:48,y:70, defenders:4}, {x:52,y:12, defenders:4}, {x:78,y:40, extraBarracks:true, defenders:5} ],
  objective:'THE ESTATE runs FIVE automated campuses — liquidate all five. There is no one left to negotiate with.',
  lakes:[ {x:46,y:38,r:6},{x:26,y:20,r:4},{x:64,y:54,r:4} ],
  rockClusters:[ {x:50,y:22,n:18},{x:32,y:40,n:16},{x:66,y:30,n:14},{x:24,y:54,n:12} ],
  forests:[ {x:20,y:20,n:24},{x:70,y:60,n:22},{x:60,y:18,n:18} ],
  goldNodes:[ {x:4,y:72,amt:3200},{x:10,y:74,amt:3000},{x:3,y:66,amt:2600},
              {x:90,y:70,amt:1800},{x:92,y:12,amt:1800},{x:50,y:6,amt:1800},{x:46,y:74,amt:1800},
              {x:48,y:40,amt:3500},{x:30,y:30,amt:2400},{x:70,y:48,amt:2400} ],
}
```
*(Treat the example as a starting point — always run the previewer and both validators and react to
what they report before shipping.)*

---

## 7. Common pitfalls (the validator catches the first three)

1. **Off-map coordinate** — any `x ≥ w` or `y ≥ h` (or negative). Easy to do after copy-pasting.
2. **Duplicate `seed`** — two maps sharing a seed generate identical-feeling terrain. Each map needs
   its own.
3. **Renumbering slip** — after *inserting*, a later map's `name` Roman numeral or `crawl.episode`
   no longer matches its array position. Check every map, not just the new one.
4. **Objective/enemy mismatch** — objective says "FOUR campuses" but `enemies` has three (or vice
   versa). Pure narrative break; scripts can only warn, so verify by hand.
5. **Biome/story mismatch** — a betrayal chapter on cheerful grassland. Re-read world-bible §6.
6. **Pre-scaled coordinates** — multiplying by 1.7 yourself. Don't; write in `w`×`h` space.
7. **Stranded economy** — all rich gold next to enemies, none near the player (or vice versa). The
   previewer's distance read helps catch this.
