---
name: starleft-mapmaker
description: >-
  Design new maps / levels / missions / episodes / "quarters" for the STARLEFT RTS, with the
  game's story woven through every step so the campaign stays narratively coherent. Use this
  whenever the user wants to add, create, design, insert, or extend a STARLEFT map or campaign
  level — even if they only say "add a level", "new mission", "another episode", "a desert map
  where X happens", or "extend the campaign". Also use when writing a new enemy faction, opening
  crawl, mission briefing, or objective, or rebalancing/renumbering the campaign sequence. Treat
  references to the campaign, episodes, missions, quarters, battlefields, chapters, or its enemy
  factions (DISRUPTR INC., MEGACORP, A&O, THE BOARD, …) as STARLEFT even when the game isn't named.
  This skill knows the map schema in js/config.js, the procedural generator, the career/dossier lore
  system, the campaign's moral-descent arc, and the TTS pipeline that voices each chapter's opening
  crawl. Reach for it before hand-editing the MAPS array, so
  the new map fits the schema, validates, and lands on the right story beat. Skip only non-campaign
  code: bug fixes, AI/balance tuning, new unit or building types, save/serialization code, and
  art/sprite generation.
---

# STARLEFT Mapmaker

A guided, **story-first** workflow for adding maps to STARLEFT's campaign. Every map in this game
is also a chapter: it carries an opening crawl, an enemy faction, and an objective that must follow
from the chapter before it and set up the one after. A map that's mechanically fine but narratively
adrift breaks the campaign. So this skill treats narrative and geometry as one job — the phases
below build the story beat first, then make the land and the fight *express* that beat.

You are collaborating, not autogenerating. Confirm the story beat with the user before you commit
coordinates — the layout serves the narrative, so the narrative has to be agreed first.

## Before you start: load the world

Two reference files hold everything you need so you don't re-derive the world from scratch. Read
them at the start of any mapmaking task:

- **`references/world-bible.md`** — the setting, tone, the seven-episode moral-descent arc, how
  enemy factions escalate, the satirical unit/building roster, the career/veteran/dossier system,
  the place-name and jargon glossary. This is what keeps a new map *coherent* with the campaign.
- **`references/map-schema.md`** — every field of a map config object, with valid ranges and
  defaults, the biome cookbook (which terrain recipe expresses which mood), the difficulty
  escalation table, feature-placement guidance, and a full worked example.

Then read the live source so you're matching reality, not a summary:
- `js/config.js` — the `MAPS` array (the maps you'll be inserting into) and the unit/building `DEF`.
- Skim `js/map.js` only if you need to understand how a field is consumed by the generator.

## The phases

Work through these in order. Each one ends with something concrete the user can react to.

### Phase 1 — Read the campaign, then place the map

You cannot write a coherent chapter without reading the book. Read every map's `crawl` and
`objective` in `js/config.js` so you hold the whole arc in mind, and skim the arc summary in the
world bible.

Then settle **where** the new map goes, because that decision drives everything downstream:
- **Extend** — append after the current last episode, continuing the descent past it.
- **Insert** — drop a new chapter *between* two existing episodes. This is powerful but has a cost:
  every later map's Roman numeral, `crawl.episode` label, and any "Episode N" reference shifts by
  one (handled in Phase 5). The inserted chapter must also bridge cleanly — its opening should
  follow from the *previous* map's ending, and its closing should still leave the *next* map's
  opening making sense.

State your read of the arc position in one or two sentences ("this sits between the OMNICORP
monopoly turn and the CARTEL revenge beat, so the player is at peak power and just starting to make
enemies") and confirm placement with the user before moving on.

### Phase 2 — Write the story beat first (faction, crawl, summary, objective)

Before a single coordinate. Decide and draft, in prose:

- **The enemy faction.** Take it from the world bible's canon, which overrides any default — the
  bible names the current campaign enemy and the arc beats (e.g. the post-VII immortality arc and its
  designated foe). Only fall back to inventing one — in the corporate-menacing register
  (`DISRUPTR INC.`, `OMNICORP`, `THE BOARD`) — if the bible leaves the choice open for the beat
  you're writing. Whatever you use should reflect the player's stage of corruption at that point.
- **The opening crawl** — `crawl: { episode, title, text }`. Star-Wars-style, second person, dark
  cyberpunk-startup satire, **never triumphal** (see the tone rules in the world bible). It should
  pick up from where the previous chapter left the player emotionally and financially.
- **The deployment summary** — `crawl.summary`. A **2–4 sentence, spoiler-free briefing** shown on
  the M.D.C. (Mission Dispatch) screen before the player launches this episode. Distill it from the
  crawl and the arc: name the **stage** (where the player stands now), the **enemy**, and the
  **stakes** — but **never the twist**. No nukes/betrayal/resurrection/who-dies reveals; nothing the
  crawl itself withholds until the player is in-mission. Same dark startup-satire voice as the crawl,
  plain text (no `{token}` templating). Think back-of-the-box teaser, not the plot. If you skip it,
  the M.D.C. briefing falls back to the first two sentences of the crawl — so writing one is how you
  control what the player sees up front.
- **The objective** — the terse in-HUD win condition. It names the faction and how many
  bases/campuses/strongholds must fall, and it must agree with the enemy count you'll place in
  Phase 4.

Where it's natural, let the writing acknowledge the campaign's living systems — carried-over
veterans, the fallen memorial, the dreams units chase (see the career system in the world bible).
This is what makes the campaign feel continuous rather than a list of skirmishes.

Show the user the faction + crawl + summary + objective and get a thumbs-up before building terrain.
The land is about to be shaped to match this, so it has to be right first.

### Phase 3 — Make the geography express the story

Now choose the **biome** whose mood matches the beat, using the biome cookbook in
`references/map-schema.md`. The mapping is deliberate and already load-bearing in the campaign:
grassland = scrappy origin; desert wastes = brutal scaling; flooded ground = a messy merger;
dark tech server-farm = you've become the monopoly; volcanic hellscape = revenge of the ruined;
frozen winter = betrayal by your own board; mixed desert+ice around a dead sea = the apocalyptic end.

Copy the matching `terrain: {...}` recipe and adjust. A new beat may warrant a new biome
*combination* (the generator supports `biomes: [...]`, gradients, and a `centralSea`), but a brand
new biome *kind* needs new art and renderer support — flag that to the user rather than inventing one
silently. Pick a **unique `seed`** not used by any existing map.

### Phase 4 — Lay out and balance for the campaign position

The map's scale and pressure should sit on the difficulty curve at its arc position — see the
escalation table in the schema reference. Concretely:

- **Dimensions** (`w`, `h`) grow gently across the campaign.
- **Enemy bases** — place `enemies: [{x,y,defenders,extraBarracks}, ...]`; the count must equal the
  number stated in your objective.
- **Economy & pressure** — `startGold`, `startWorkers`, `startSoldiers`, `startBarracks`,
  `aggression`, `graceTime`, `waveTimer` all ramp with progression.
- **Player start, gold nodes, and hand-placed features** — `player`, `goldNodes`, `lakes`,
  `rockClusters`, `forests`, and optional `lostBases`. All coordinates are **pre-scale tile
  coordinates** and must fall inside `[0, w-1] × [0, h-1]` (the generator multiplies everything by
  `MAP_SCALE` on load — never pre-scale them yourself).

Run the preview to sanity-check the spatial layout before you commit it:

```bash
node .claude/skills/starleft-mapmaker/scripts/preview_map.js <mapIndex>
```

This renders an ASCII map of the hand-placed points (player, enemies, gold, water, etc.) and prints
player→enemy distances, so you can catch an enemy crammed in a corner, gold stranded across water, or
a start that's too exposed — *before* running the full generator. (Add the map to `MAPS` first, even
as a draft, since the previewer reads the live array.)

### Phase 5 — Insert into config.js and renumber

Edit `js/config.js` to place the new object in `MAPS` at the correct **array position = play
order**. If you inserted rather than appended, renumber every subsequent map so the campaign stays
sequential:
- `name` Roman numeral (`'VIII — ...'`),
- `crawl.episode` (`'EPISODE VIII'`),
- any "Episode N" / ordinal references inside crawl or objective text.

Keep the seed unique. Don't touch the procedural generator or save format — a new map is pure data.

### Phase 6 — Validate (hybrid: scripts + narrative checklist)

Two automated checks plus a human read.

1. **Campaign coherence + schema** (this skill's checker):
   ```bash
   node .claude/skills/starleft-mapmaker/scripts/validate_campaign.js
   ```
   Verifies required fields, that Roman numerals and `EPISODE` labels are sequential and aligned to
   array order (catches renumbering slips), unique seeds, all coordinates on-map, valid biome
   values, and that each map's `enemyName` actually appears in its crawl and objective (cohesion).

2. **Geometry / reachability / determinism** — runs the *real* `newMap()`, the gold standard,
   because it builds the actual procedural terrain. Check your new map by index first:
   ```bash
   node .claude/skills/starleft-mapmaker/scripts/verify_geometry.js <idx>    # just your new map
   node .claude/skills/starleft-mapmaker/scripts/verify_geometry.js          # the whole campaign
   ```
   The gate is the **hard** checks (printed with `✗`): `newMap()` builds without throwing, every gold
   node and enemy base is reachable from the player, and generation is deterministic. Your new map
   must show zero `✗`. The script may also print `⚠` **cosmetic warnings** — a stray despeckle tile, a
   single-tile water pond, a slow build on a very large map — which don't fail the gate and which some
   shipping maps already have, so don't chase them unless they're on your map and bother you. A clean
   run ends in `✅ ALL GEOMETRY CHECKS PASS` (warnings, if any, are noted in parentheses).
   (This bundles the full generator itself; the game's own `_dev/verify_maps.js` has been repaired to
   match — it previously omitted `js/megasprites.js`/`js/assets.js` so `newMap()` threw, and it
   checked unscaled coordinates.)

3. **Balance gate** — checks the map is neither unwinnable nor trivialized by carried career units
   (the thing the difficulty table can't see). It has two tiers:
   ```bash
   node .claude/skills/starleft-mapmaker/scripts/simulate_balance.js <idx> --gate          # mandatory
   node .claude/skills/starleft-mapmaker/scripts/simulate_balance.js <idx> --gate --play   # + advisory bot
   node .claude/skills/starleft-mapmaker/scripts/simulate_balance.js --calibrate            # curve, all maps
   ```
   **The mandatory gate is a deterministic power-ratio check** (no RNG, instant). It computes, for
   three carry profiles (fresh / typical / invested), the player's combat power entering the map
   (economy-buildable army + carried veterans with their real career multipliers) vs the enemy's
   total defensive power *after* `js/balance.js` has added its carry-scaled bonus defenders, and
   prints the ratio per profile. It **hard-fails only on position-independent bugs**:
   - **unwinnable** — `typical` (or `invested`) power ratio below ~1.0 (player under parity), or
   - **carryover run-away** — `invested` ratio more than **1.5× the fresh ratio**, meaning carried
     veterans trivialize the map and `js/balance.js` vetScaling isn't compensating. (This is the
     exact failure the whole feature exists to prevent; the gate's swing metric directly measures
     whether vetScaling is working — turn vetScaling off and the swing jumps, fail fires.)

   It does **not** hard-fail "too easy in absolute terms," because the shipping campaign's ratio
   legitimately declines ~18→2 across the arc — that decline *is* the difficulty curve. Instead it
   prints an **advisory** comparing the map to the shipping curve at its slot ("easy/hard for its arc
   position — OK if intentional, e.g. a restart map"). `--calibrate` dumps every map's ratios so the
   bands (`PR` in the script) can be re-derived if engine stats change. Aim for `✅ POWER GATE PASS`.
   See "Balancing for carryover" in `references/map-schema.md` for tuning. If `invested` runs away,
   raise enemy pressure (defenders / `aggression` / base count) or `VET_SCALE`/`maxBonus` in
   `js/balance.js`.

   **`--play` adds an auto-player ADVISORY only — it never affects pass/fail.** A scripted bot plays
   the map and flags *absurd extremes the power model could miss*: an invested deathball that can't
   clear at all (suspect an unreachable / over-walled base — eyeball the layout) or a fresh start that
   wins in under ~2.5 min (suspect far-too-easy). The bot is a heuristic, not a champion — it can't
   reliably win fortified maps, so it is deliberately kept out of the gate and only surfaces gross
   anomalies. Trust the deterministic ratio for pass/fail; use the bot as a sanity nudge.

4. **Narrative-coherence checklist** — read these yourself; scripts can't judge story:
   - Does the crawl follow emotionally and financially from the *previous* episode's ending?
   - After this insertion, does the *next* episode's opening still make sense?
   - Is the tone dark, satirical, second-person, and un-triumphal (per the world bible)?
   - Faction, biome, and difficulty all matching the same arc position?
   - Objective's base count == placed enemy count == crawl's stated count?

Fix and re-run until the schema + geometry scripts are clean, the balance gate passes, and the
checklist holds.

### Phase 7 — Render the chapter's crawl voiceover

A chapter isn't finished until its opening crawl is *spoken*. The intro narration is a pre-rendered
clip the game plays over the crawl — `assets/audio/voice/crawl/ep_NN.mp3`, in the "rod" narrator
voice. It's **non-blocking**: a missing clip just plays silent (the game never depends on audio), so
this step *completes* the chapter rather than gating it — but a shipped chapter should narrate.

The clip id is keyed by **map array index** (`ep_NN` == the map's position in `MAPS`, the same index
`showCrawl`/`crawlPath` use), which drives how much you must re-render:
- **Append** — only the new episode's clip is new.
- **Insert** — every later episode's index shifted in Phase 5, so their existing `ep_NN.mp3` now maps
  to the wrong chapter. The manifest is rebuilt from the live `MAPS`, so re-rendering crawls realigns
  the whole tail automatically — but you *must* re-render the crawls, not just the one new map.

Run from the repo root, only once the crawl text is final and the map is at its final index:

1. Rebuild the TTS manifests from the shipped data — writes `_dev/gen/voice_manifest_rod.json`, one
   `{id:"ep_NN", text}` per map crawl (crawl `{?key}`/`{^key}` show/fallback tokens are neutralized):
   ```bash
   node _dev/gen/build_voice_manifests.mjs
   ```
2. Render + transcode **just the crawls** into `assets/audio/voice/crawl/`:
   ```bash
   bash _dev/gen/gen_voices.sh crawl
   ```
   (No arg = full barks+lore+crawl run; `crawl` does only the narration, which is all a new map needs.)

This needs the local Qwen3-TTS / "rod"-clone toolchain that `gen_voices.sh` documents in its header
(Apple-Silicon venv, ffmpeg, the twilightZone setup). **If that toolchain isn't on this machine, don't
fake it** — tell the user, hand them the two commands above to run where it's set up, and note the map
ships and simply narrates silently until the clip exists. After rendering, listen to
`assets/audio/voice/crawl/ep_NN.mp3` and confirm it matches the final crawl text.

Then summarize for the user what was added, where in the arc, the validation/balance results, and
whether the crawl voiceover was rendered here or handed off.

## Optional follow-through

- **Play-test cue.** Maps build behind the intro crawl, so a wrong coordinate won't crash but can
  ship a frustrating level. Offer to launch the game (the `run` skill, or open `rts.html`) so the
  user can play the new quarter from the Map Selection menu.
- **New art.** A genuinely new biome/landmark needs sprites; see `prompts/` for the existing asset
  generation prompts and `js/megasprites.js` for how landmarks are placed. Flag this as separate
  work — it's out of scope for a data-only map.
- **New mechanics implied by lore.** Some canon beats are *systems*, not map data — e.g. the post-VII
  reset where the whole roster dies and you rebuild a new company, or the episode-14 "Reborn Cyborg"
  that resurrects a chosen fallen career unit. A map config can carry the *story* for those episodes
  (crawl, enemy = A&O, objective, an apt biome), but the death-reset, the carryover override, and any
  new unit/building type live in code (`career.js`, `lore.js`, `units.js`, `config.js` `DEF`). Build
  the map; tell the user the mechanic is separate code work rather than implying the map delivers it.

## Guardrails

- Coordinates are pre-scale and must stay within `w`×`h`. Seeds must be unique. The objective's base
  count must match the placed enemies. These are the three mistakes that most often slip through —
  the validator catches them, so always run it.
- Don't fabricate lore that contradicts the world bible (e.g. a heroic, bright, or redemptive
  ending). The campaign is a descent; keep new chapters honest to that.
- The crawl voiceover is keyed by map **index** (`ep_NN.mp3`), so an *insert* (not an append) shifts
  every later chapter's narration — after renumbering, re-render the crawls (Phase 7), don't just
  voice the new map. Audio is non-blocking (missing clips play silent), so a map can ship before its
  clip exists, but the chapter isn't "done" until the narration matches the text.
- If the user's request is vague ("add a cool map"), don't guess the whole thing — propose a story
  beat and placement from the arc and let them steer. Narrative cohesion is the whole point.
