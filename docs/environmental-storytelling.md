# Environmental Storytelling — Design Roadmap

> **Status:** design-only spec (no code shipped). A ranked, code-accurate catalog of HUB and
> in-mission mechanics that deepen STARLEFT's environmental storytelling. Pull work from §5 when
> ready; each entry names its real codebase hooks, save-compat + three-netRole reach, effort, and
> the smallest shippable first slice.
>
> Companion docs: `docs/world-bible.md` (canon), `docs/story-polish.md` (narrative pass),
> `docs/audit/coop-campaign-parity.md` (what co-op does/doesn't mirror).

---

## 1. Purpose & scope

STARLEFT already has an unusually deep environmental-storytelling base: living NPCs who *mourn*,
*take pride*, and *react to The Wake* when your veterans fall/level/return; dead-body memory chips
you read by walking the battlefield; madosis echoes; crashed wrecks; a campaign-aware memorial.

So this is **not** a "build a storytelling system" doc. It is a map of the **highest-payoff
extensions of systems that already exist** — and, repeatedly, of wiring that is *already written but
called nowhere*. The recommendations were produced by codebase inventory + cross-game web research
+ per-proposal adversarial vetting against the four hard constraints below. Eleven mechanics were
assessed; all are feasible. Graffiti/signage is parked (§7) as the one low-ROI outlier.

Three themes organize the catalog, per the directions chosen for this pass:
- **A — The city remembers your campaign** (HUB, reactive)
- **B — The battlefield feels authored** (in-mission)
- **C — The world darkens with the arc** (atmosphere/mood)

---

## 2. The four hard constraints (every mechanic honors these)

1. **No-build / single global scope.** Plain HTML+CSS+classic JS sharing one global scope; script
   order *is* the dependency graph. No bundler, no modules, no new build step.
2. **Single global `G`.** Render-only transients that must live on `G` follow the `state._shake`
   precedent: set on an event, decayed in `render.js`, and **deliberately excluded** from `save.js`
   and `net/sync.js`.
3. **Three netRole paths.** Solo, host (authoritative, broadcasts snapshots), client (render-only —
   **never simulates**; applies host snapshots, interpolates, computes local fog, renders). Every
   mechanic below states explicitly where it reaches the co-op client vs. is host/solo-only. The
   co-op parity audit already accepts host-only for parts of the HUB; we are explicit per item
   rather than silent.
4. **Save-compat is mandatory.** Missing fields = legacy default; no `SAVE_VERSION`-gated reads.
   New persistent fields must degrade to a safe default for old saves with no version bump.

A mechanic that needs a snapshot-shape change (e.g. folding a new field into the hub snapshot) is
flagged inline as a **net-shape change**, because that is the one thing that breaks the otherwise
clean "client renders for free" story.

---

## 3. What STARLEFT already does (the foundation)

So the roadmap reads as *"extend X"*, not *"build Y"*:

### HUB (the persistent city)
| System | What it already does | Files |
|---|---|---|
| Living-NPC population | Veterans' named relatives + friends walk daily routines and **react to campaign events**: `mourning` when a vet falls, *pride* on level-up, *reborn-shock* after The Wake — logged as per-visit life-events in their dossier | [js/hub_npcs.js](../js/hub_npcs.js), [js/npc_lore.js](../js/npc_lore.js) |
| Ambient barks | `npcAmbientLine(id)` already selects a reactive pool by NPC flag (`fl&1`→mourning, `fl&2`→reborn) | [js/npc_lore.js:173](../js/npc_lore.js), [js/npc_lore_data.js](../js/npc_lore_data.js) |
| The Wake memorial | A POI that **already renders a sorted, named wall of the fallen** | [js/ui.js](../js/ui.js) (`~1538-1600`), `fallenVets` global [js/lore.js:214](../js/lore.js) |
| Off-Hours relationship ledger | `CAMPAIGN.offhours.bonds[id] = {p,t,…}` — cumulative points + tier 0–4, raised by Gift/Talk/Sit, scenes gate on `req.minTier/maxTier`, a Hades-style locked heart at `lockedTier:3` | [js/offhours.js](../js/offhours.js), [js/offhours_data.js](../js/offhours_data.js) |
| ULTRA news ticker | `LNS.ultraEvent(kind, payload)` — a **session-only reactive deed-broadcaster** already wired to unit death / hero life-events / achievements / `episodeReached` | [js/lns.js:186](../js/lns.js), [js/ultra_news_data.js](../js/ultra_news_data.js) |
| Day/night clock, HUB objectives, condos, Dark Tower, drones | Ambient city life + dynamic per-episode objectives | hub_npcs.js, [js/hub_objectives.js](../js/hub_objectives.js), [js/hub.js](../js/hub.js) |

### Battlefield (in-mission)
| System | What it already does | Files |
|---|---|---|
| Dead-body memory chips | Walk/command any player unit onto a `kind:'corpse'` entity → extract a paragraph of its last hours; the reveal body fires the Tusk-is-a-cyborg cutscene. **Engine is map-agnostic** (`corpsesTick` runs on every non-hub map; text authored on `cfg.memBodies`, never serialized; only `reached` persists) | [js/corpses.js](../js/corpses.js), [js/quests.js](../js/quests.js) |
| Permanent crew-body loss | Ep XVI builds corpses from the player's *real* dead carryover vets and strips ~10% from `CAMPAIGN.roster` permanently | [js/corpses.js](../js/corpses.js) `spawnCrewBodies` |
| Madosis echoes | Feral-vet rescue drops readable `kind:'echo'` memory facets | [js/madosis.js](../js/madosis.js) |
| Scripted beats | `cfg.events:[{atTime,…}]` fire once each, in order, via `runMapEvent` | [js/core.js:80-92](../js/core.js) |
| Reactive FX vocabulary | `spawnSmoke`/`spawnScorch`/`spawnRing`, `drawLightFX`, `state._shake`, `deathFx` (smoke column + scorch on death, fires on all three netRoles) | [js/render.js](../js/render.js) |
| Cutscene engine, crawls, decals, wrecks, megasprites | Authored cinematic + set-dressing layer | [js/cutscene.js](../js/cutscene.js), render.js |

### Named gaps (the opportunity list)
- The SE wasteland is story-thin (toxic green glow is **unexplained** in-world).
- **Ep XVI permanent crew deaths never reach the memorial** — they vanish silently.
- The HUB never *evolves* across the Arc 1→3 descent (only night-tint + The Wake rising change).
- `cfg.events` is **clock-only** — the battlefield can't react to what the *player* does.
- The corpse-memory mechanic is only *authored* on Ep XVI, though the engine works anywhere.
- `ohKeepsakeBonus()` / `ohDeploySynergy()` are **fully implemented but called nowhere** — Off-Hours
  bonds never translate into a felt combat payoff.

---

## 4. Research synthesis (cross-game)

**Theory** (Henry Jenkins' embedded vs. emergent narrative; Don Carson / Disney Imagineering): the
environment is a *frozen record* the player reads and infers a story from. The strongest device is
**before/after on a revisited space** — the same place, changed by events, tells the story for free.
Found objects must be **missable** (pulled, not pushed), so discovering them feels earned.

**RTS & between-mission hubs.** The hub works best as a **pressure-gauge of campaign state**:
StarCraft II's *Hyperion* (crew, news screen, bar that record the war), Company of Heroes / Iron
Harvest (graded battlefield destruction as a readable transcript of the fight), Homeworld (the
persistent fleet that carries your losses forward), Frostpunk / Northgard (a reactive city / seasons
that *are* the narrative pressure).

**Hub-as-narrative-space.** Hades' *House* is the model: ~21k reactive lines shipped as a **flat,
weighted, tagged bucket** gated by story flags and marked "spoken", plus **per-NPC affinity** that
gates dialogue tiers and small perks. Darkest Dungeon's hamlet, Mass Effect's *Normandy*, Persona's
social links — all use **cheap set-dressing swaps as a progress ledger** rather than expensive
bespoke cinematics.

**Reactive world.** Audio-logs / data-shards (System Shock, BioShock); **reactive deed-radio**
(Fallout 3's *Three Dog* narrating your actions back to you); persistent corpses and battle scars;
atmosphere souring as the story descends; **memorials for the named dead**.

> **Key takeaway:** the cheapest high-payoff environmental storytelling is **reactive primitives
> applied liberally**, not new geometry. STARLEFT already owns most of the primitives — the work is
> wiring them to campaign state and authoring content into them.

---

## 5. The roadmap

Format per entry — **Pitch · Payoff · How it works · Hooks (corrected) · Save/netRole · Effort ·
First slice.** Effort is `S/M/L`; "risk" is the adversarial-vetting risk. Ordered within each theme
by payoff-per-effort. *Hooks reflect the vetting corrections — several proposals named the wrong
file; the versions below are verified against the code.*

### Theme A — The city remembers your campaign

#### A1 · Three-Dog ULTRA: mission outcomes in the news ticker — **S, low risk**
- **Pitch:** route mission results into `LNS.ultraEvent` so the city ticker names your body counts
  and lost sectors and spins them as A&O corporate propaganda.
- **Payoff:** the cheapest reactive channel, and STARLEFT half-built it — `ultraEvent` is already a
  session-only deed-broadcaster. An ULTRA slant reframes your win as "terrorism contained"; **mission
  order becomes a story variable for free.** Zero new art (existing copy is already dark
  corporate-satire — *"reclassified as a load-bearing structure"*).
- **How it works:** add `missionWon` / `missionLost` / `bossDefeated` kinds → slanted headline
  templates (player line + corporate-spin line by faction); ULTRA-bias the ticker on HUB entry.
- **Hooks (corrected):** kinds + templates in [js/ultra_news_data.js](../js/ultra_news_data.js) and
  the `ultraEvent` dispatch in [js/lns.js:186](../js/lns.js). **Fire from `onVictory` / `onDefeat`
  *and* `clientEndScreen` in [js/ui.js](../js/ui.js)** — *not* core.js/quests.js, which the proposal
  named: `onVictory`/`onDefeat` early-return for clients, so a single call there drops the co-op
  client. Precedent: `ultraEvent('episodeReached')` already fires from `showCrawl`, which clients run.
- **Save/netRole:** session-only, never serialized, save-clean. Gate on `!window._rbReplaying`.
  `bossDefeated` **must respect the boss-*fled* case** (`questsDeclareVictory`→`bossOutcome`) or it
  claims a kill that didn't happen.
- **First slice:** add the two template arrays to `ultra_news_data.js` (inert until dispatched — zero
  behavior change), then wire `missionWon`/`missionLost` at the three ui.js chokepoints.
- **Deferred:** per-quest kinds (`captivesFreed`/`outpostReclaimed`) need a client-side `G.quests`
  diff-watcher (model on `questToasts`, ui.js) — that's S→M, ship outcome kinds first.

#### A2 · Hub-remembers contextual bark bucket — **S, low risk (partly shipped)**
- **Pitch:** give living-hub NPCs a reactive line tier so the first walk home reacts to your last run.
- **Payoff:** the highest-ROI "city-remembers-me" upgrade — the Hades flat-bucket pattern, on a
  dispatcher (`npcAmbientLine` + `_ambientTrySpeak`) and append-only pools that already exist.
- **How it works:** add a reactive branch to `npcAmbientLine` gated on persisted campaign flags; the
  per-visit "already spoke" set already exists in `hub_npcs.js _reset`.
- **Hooks (corrected):** first slice touches **only** [js/npc_lore_data.js](../js/npc_lore_data.js)
  (add a `NPC_LORE.ambient.cleanrun` pool) + one branch in [js/npc_lore.js](../js/npc_lore.js)
  `npcAmbientLine`, gated on the already-persisted `CAMPAIGN.storyFlags.perfectExtraction`. Put the
  gate **before** the salt pick, mirroring the existing `fl`-flag branch. The ambient pool is
  explicitly exempt from the append-only/versions contract (read fresh, never stored).
- **Save/netRole:** persists + syncs to the client for free (`serializeHubCampaign` deep-clones
  CAMPAIGN); cosmetic dialog-bubble path, already rollback-skipped.
- **First slice:** the `cleanrun` pool + `perfectExtraction` branch (one data file + one gate).
- **Deferred:** richer tags (units-lost band, hero-leveled) — combat `G._vetLost`/`hubStats` are
  discarded when `G=newHubMap()` runs, so these need **one new defaulted `CAMPAIGN` field** written
  in `enterHubFromCombat` (trivial, legacy-safe).

#### A3 · Fix the memorial loop — Ep XVI deaths reach The Wake — **S–M, the real work is tiny**
- **Pitch:** make permanently-dead crew veterans appear on the memorial the prose already assumes.
- **Payoff:** closes a loop the writing wrote (chores/Off-Hours lines reference the wall). Turns Ep
  XVI permanent losses into a monument read every visit.
- **How it works / Hooks (corrected):** the proposed *new* memorial POI is **redundant** — The Wake
  already renders a sorted named wall. The genuine gap: `spawnCrewBodies` strips dead vets from
  `CAMPAIGN.roster` by `lore.seed` but **never calls `recordFallen`**, so they never enter
  `fallenVets`. Fix = in the host/solo one-shot block ([js/corpses.js](../js/corpses.js) `~line 113`,
  guarded by `CAMPAIGN._crewLost`) also push each dead vet into the memorial via `recordFallen`
  ([js/lore.js:228](../js/lore.js)).
- **Save/netRole:** `fallenVets` already persists under the `fallen` META key — save-clean.
  **Net-shape caveat:** `fallenVets` is *not* in the hub snapshot, so a co-op **client** wall renders
  empty (consistent with the HUB being host/p1-only per the parity audit). True co-op parity = fold
  `fallen` into `serializeHubCampaign` (a net-shape change). **Default: host-faithful**; note the gap.
- **First slice:** the one `recordFallen` call in the existing host/solo crew-loss block. Verify: lose
  vets in XVI → open The Wake → see their names.

#### A4 · Mission-aftermath dressing — the hub district as the "after photo" — **M**
- **Pitch:** after a battle, dress the returns-district with frozen evidence of the fight you just
  fought (medics if casualties were high, faction-correct corpse props, scorch).
- **Payoff:** the strongest device from the theory (before/after on a revisited space) tying the
  strategic layer to embedded narrative — the *Hyperion-records-the-war* read, done with props.
- **How it works / Hooks (corrected):** **(blocker 1)** the casualty data the pitch wants is
  discarded — `unitsLost`/`_vetLost` live on the combat `state.hubStats`/`G._vetLost`, thrown away
  when `enterHubFromCombat` does `G=newHubMap()`. Capture `CAMPAIGN.lastMission={unitsLost, vetLost,
  mapIndex}` **before** `newHubMap()`. **(blocker 2)** `scorches` is a 12-second decaying FX queue —
  it *cannot* hold a frozen mark; use corpse/wreck **entities** (the corpses.js model). Hang a
  deterministic `hubDressAftermath(state)` off `newHubMap` beside `hubBuildRoads` — the co-op client
  also runs `newHubMap`, so a pass seeded off synced `CAMPAIGN` reproduces byte-identically.
  Faction-correct gore via the single `isCyborgBody` source of truth.
- **Save/netRole:** new `CAMPAIGN.lastMission` field is legacy-safe (`Object.assign` default → old
  saves no-op). **Note:** hub entities *do* serialize (`save.js` serializes `G.entities`) — design for
  **deterministic re-derivation**, not regeneration, to avoid double-spawn on load.
- **First slice:** capture `CAMPAIGN.lastMission` + spawn ONE deterministic faction-correct corpse
  prop near the returns plaza. Scale up the dressing set after the loop is proven across solo/host/
  client + save/load.

#### A5 · Affinity → combat perk — **S, ~80% already shipped**
- **Pitch:** let an Off-Hours relationship translate into a small felt stake when that vet deploys.
- **Payoff:** the Hades/Persona affinity primitive — bonds the player built in the bar now matter on
  the battlefield, giving non-story players a reason to engage the narrative.
- **How it works / Hooks (corrected):** **do NOT add a new counter** — affinity already lives as
  `bond.t` (tier 0–4) in `CAMPAIGN.offhours.bonds`, and lore-tier gating already works via scene
  `req.minTier/maxTier`. The real work: wire the **orphan** `ohKeepsakeBonus()` /
  `ohDeploySynergy()` ([js/offhours.js:243](../js/offhours.js), implemented, grep-confirmed called
  nowhere) into the authoritative deploy / `applyVetHp` path in [js/units.js](../js/units.js) as a
  **transient deploy-time buff**.
- **Save/netRole:** bonds already round-trip through hub load; no new field, no `SAVE_VERSION`. Perk
  is host/solo-authoritative; the client renders the resulting stat from the snapshot — it must hook
  the deploy/`applyVetHp` path, **never** run client-side, or co-op stats diverge.
- **First slice:** call `ohKeepsakeBonus(u)` in the vet HP-apply path. **Avoid:** the condo-level
  `+HP` path (that's the upgrade economy — different system) and hub-service discounts (touches
  `hubSpend` call sites — wider blast radius, defer).

#### A-parked · Dress the wasteland — **M, fits but lower priority**
- Stage the empty SE blast-zone (a buried wreck, the cold scar, a cordon sign) so the one scar tells
  its story and **pays off the unexplained toxic-green haze** (`drawWastelandRockFog`, real).
- **Hooks (corrected):** the hub is built by `newHubMap`/`hubBuildTerrain` in [js/hub.js](../js/hub.js),
  **not** `map.js`'s `newMap` — so `cfg.wrecks`/`spawnWrecks` (map.js-only) does **not** apply. Inject
  an optional `HUB.wrecks` array and spawn via the existing `mkEntity(state,'wreck','neutral',…)`
  shape in `newHubMap`. Use a **cold, no-fire wreck variant** (`drawWreck` spawns permanent
  per-frame fire+smoke — perf cost + reads as a *fresh* crash, fighting the years-old-scar art
  direction). Avoid the existing `waste_ruin_1..4` + `mdc_waste` footprints. The clickable cordon
  **sign** is a new selectable entity kind (selection + net pack + UI panel + mobile tap) — a
  separate later slice.
- **Save/netRole:** neutral render props, netRole-safe exactly as the Dark Tower precedent proves;
  hub entities re-spawn deterministically on load.

### Theme B — The battlefield feels authored

#### B1 · Walkable data-shards / audio-logs on any map — **S, ~90% already shipped**
- **Pitch:** promote the Ep XVI "walk over and read the dead" pattern into reusable found-object lore
  (data-shards, holo-logs, memos) any episode can scatter.
- **Payoff:** the richest in-mission mechanic is currently locked to one episode by *content*, not
  engine. A missable found-object turns traversal into optional, *pulled* lore discovery.
- **How it works / Hooks (corrected):** the mechanic is **already map-agnostic** — `corpsesTick` runs
  on every non-hub map, spawning is data-driven by `cfg.memBodies`, text is authored on cfg and never
  serialized, and `collectMemories` ([js/quests.js](../js/quests.js)) **already takes a `group`**.
  **Do NOT clone `corpsesTick`** — a second sweep + a second `_memDialogOpen`-style gate would race
  the existing harvest gate. **Extend** the corpse path: add a `src:'shard'` render variant in
  `corpseSprite`/`drawCorpse` ([js/render.js](../js/render.js)) — a **dark, derelict datachip /
  blood-slick terminal**, not a clean glowing pickup (art direction).
- **Save/netRole:** already correct — only the extracted set persists (missing = not-collected); the
  client receives shard entities via the neutral-entity snapshot path and only renders.
- **First slice:** author one `cfg.memBodies` entry with `src:'shard'` + a `group`-scoped
  `collectMemories` quest on a non-Ep-XVI map — proves the mechanic is already portable with zero new
  systems. The render variant is the only optional code touch.

#### B2 · Condition-triggered map events — **S–M, low risk**
- **Pitch:** extend `cfg.events` beyond `atTime` so beats fire on what the player *does* (reach a
  place, raze a building, enter a zone) — "you took out the comms tower, so the district goes dark."
- **Payoff:** the Half-Life cause-and-effect read — the most *earned* storytelling, because the
  player's own action triggered it. Makes maps feel authored, not static.
- **How it works / Hooks (corrected):** add an `onReach:{at,radius}` branch to the `cfg.events` loop
  ([js/core.js:85-90](../js/core.js)) **before** the `atTime` gate (mirror cutscene reach-detection,
  cutscene.js). `e.at` is already coord-scaled by `scaleCfg`. The fired-set (`state._eventsFired`) is
  already legacy-safe (plain `G` prop, missing→`{}`), and the FX actions (`spawnScorch`/`spawnSmoke`)
  are already rollback-gated.
- **Save/netRole:** evaluation is host/solo-only (this whole update path is). **Co-op client sees
  nothing** — `cfg` is not in the snapshot scalar list and FX run on the host canvas (a *pre-existing*
  limitation for `atTime` events too). Ship v1 as **host/solo presentation; do not claim co-op
  parity.**
- **First slice:** `onReach` only + one authored beat (toast + `spawnScorch`) to verify.
- **Deferred:** `onKills`/`onBuildingDestroyed` need their own bounded entity scan (quests.js keeps no
  standing tally); `onZoneEnter` must be added to `scaleCfg` or it desyncs on scaled maps.

#### B3 · Reactive ambient FX — the battlefield breathes — **S (safe slice)**
- **Pitch:** let particle/light systems respond to big events — a razed base leaves a lingering smoke
  column, a holdout breach throws alarm light, a boss arrival darkens the sky.
- **Payoff:** `particles.js`/`drawLightFX` never react to events today. A smoke column where a base
  died narrates *"a battle happened here"* for the rest of the mission; a darkening sky on boss
  arrival sells dread before a line lands. (CoH/Iron Harvest battlefield-as-transcript.)
- **How it works / Hooks (corrected):** **first slice lives entirely in `deathFx`**
  ([js/render.js](../js/render.js)) — lengthen the existing debris-smoke life for HQ/large footprints
  so a razed base smolders on. This is the one path that **already fires on all three netRoles**
  (clients run `_clientDeathFx` on snapshot entity-removal), needs zero save.js/sync.js changes, and
  touches no boss/wave code.
- **Save/netRole:** render-only, module-local. **Deferred (host-only without explicit mirror):**
  boss-arrival sky-darken + holdout alarm hook `villains.js`/`waves.js`, which **clients never run** —
  they need an explicit `mpcue` mirror + a `G._skyDark` transient (modeled on `state._shake`, excluded
  from save/sync) + a POST-band draw pass cooperating with the existing vignette/grade/haze. Every new
  FX site needs the `!window._rbReplaying` guard (host rollback double-fires otherwise).
- **First slice:** the lingering smoke column in `deathFx` for razed bases.

### Theme C — The world darkens with the arc

#### C1 · HUB arc-descent skin — **M, split into slices**
- **Pitch:** drive HUB lighting/weather/A&O-signage/NPC-mood off the campaign arc so early hopeful
  episodes and late dystopian ones don't look identical.
- **Payoff:** the biggest *structural* gap — the HUB barely evolves. Frostpunk proves the reactive
  city can *be* the descent; gloom tied to the arc index is the strongest emotional lever for
  render-only cost.
- **How it works / Hooks:** derive an arc value from the already-persisted `CAMPAIGN.nextMapIndex`
  (`arc = clamp(nextMapIndex/(MAPS.length-1))`). First slice: arc-bias the existing night-tint in
  [js/render.js:~847](../js/render.js) (today driven purely by `HUBNPC.nightAlpha()` — time-of-day,
  no arc input).
- **Save/netRole:** derived from a field that already persists + syncs to the client — no new save
  field, no `SAVE_VERSION`, render-only (~0ms). Gate behind reduced-motion + existing QUAL. *Caveat:*
  the hub time clock drifts on clients (tracks rAF dt), so only the **arc** component is peer-
  identical — fine for cosmetic.
- **Critical tuning gate:** **clamp the combined darkness ceiling.** Night-tint + post-grade vignette
  + grunge + decals already stack near `NIGHT_MAX=0.14`; an *additive* arc floor crushes late-arc
  deep-night to illegible mud. Cap the combined alpha — "dark but readable."
- **First slice:** the single arc-tint fill with the clamped ceiling, A/B-able.
- **Deferred (independent slices):** scaffolded hub weather → arc-gated ash/smog (`drawHubRain`),
  A&O drone livery bias (`AO_SHARE`), POI-neon dimming (touches per-faction building-neon — defer),
  ui.js subtitle swaps.

---

## 6. Suggested sequencing

A *quick-wins-first* ladder for when implementation begins — low-risk, mostly-already-built items
land first for immediate payoff:

1. **A1** ULTRA news ticker outcomes — zero art, biggest reactive bang.
2. **A3-fix** Ep XVI deaths → The Wake — one call, closes a written loop.
3. **B1** data-shards on a second map — proves the mechanic is already portable.
4. **A2** `cleanrun` bark pool — one data file + one gate.
5. **B3-smoke** lingering smoke column in `deathFx` — all-netRole-safe.
6. **A5** wire `ohKeepsakeBonus` — turns existing bonds into stakes.

Then the M-effort staging/atmosphere items: **C1** (arc-tint), **A4** (aftermath dressing),
**A-parked** (dress the wasteland). **B2** (condition events) is the in-mission authoring backbone —
ship `onReach` once, then it pays off across many maps.

---

## 7. Appendix

### Parked — Factional graffiti & corporate signage (**M, lowest ROI**)
De-prioritized for this pass. Recorded so the reasons aren't re-litigated:
- **Posters-on-walls is a new vertical render concept.** The decal system (`bakeDecals`, render.js;
  assets.js) is **ground-tile-only and biome-keyed** — no faction dimension, no wall surface.
- **No territory/region-control state exists** to bias placement — combat maps carry only a single
  `cfg.enemyFaction` string (grep: no `regionControl`/`territory`/`tileOwner`). So placement collapses
  to **hand-authored coords**, defeating the "near-zero authoring cost" pitch.
- **No poster/signage art exists**, and the dark-cyberpunk-only rule means a new atlas must be
  authored. Effort is M, not the originally-pitched S.
- Keep as a future option **if** a dark-cyberpunk poster atlas gets authored; a static `cfg.posters[]`
  array + a render-only `drawPosters(state)` (behind a `?noposters` A/B flag) is the constraint-safe
  shape when that day comes.

### Cross-cutting: co-op parity
Several mechanics reach the co-op **client** for free (anything derived from synced `CAMPAIGN` or from
snapshot entity-removal); several are **host/solo-only** (anything evaluated in `update()` on
host-only systems, or any global not folded into a snapshot). Each entry above states which. Any
decision to invest in true client parity (e.g. A3's wall, B2's beats) should reference
`docs/audit/coop-campaign-parity.md`, which already catalogs the structural gaps — don't re-derive
them.
