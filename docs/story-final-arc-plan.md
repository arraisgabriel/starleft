# STARLEFT — Story Review & Final-Arc Plan

> Status: review + build plan, 2026-06-15. Consolidates the implemented campaign with the approved-but-unbuilt Arc 3 design in [story-next-steps-ceo-arc.md](story-next-steps-ceo-arc.md). Code line numbers are indicative (verify at build time).

## 1. Purpose & scope

This document is a single source of truth for the developer to (a) see exactly what campaign story is **implemented today** in `js/maps_data.js`, `js/villains.js`, `js/hub.js`, and `js/dialog_data.js`; (b) understand the moral-descent narrative and faction ladder that frames it; (c) read the canonical-but-thin endgame (Episodes XII–XIII + the REX finale); and (d) review the fully-designed-but-unbuilt final arc (Arc 3 / the A&O CEO arc, Eps XIV–XXIII) in `docs/story-next-steps-ceo-arc.md`, with gaps, conflicts, and a phased build plan. Everywhere it matters, content is tagged **IMPLEMENTED** vs **[PLANNED — design only]** vs **[PARTIALLY IMPLEMENTED]**. The goal is a decision-ready review, not new plot.

---

## 2. Where the story stands today (implemented)

The campaign is **13 linear episodes (I–XIII)** plus **4 routed villain interludes**, **1 hidden/retired interlude**, and **1 REX finale** — all living in the `MAPS` array in `js/maps_data.js`. The play order is:

> I → II → III → IV → V → VI → **VII** (Severancier duel inside the map) → **VIII** (Nino joins) → **[8.5 LAND GRAB]** → **IX** → **[9.5 RECOVERY AGENT]** → **X** (Biba freed) → **[10.5 EXTRACTION CLAUSE]** → **XI** (seize GRAAL; Wake unlocks) → **XII** → **[12.5 BRIDGE ROUND]** → **XIII** → **FINALE: REX** → IPO/victory.

### Linear episodes (IMPLEMENTED)

| Ep (idx) | Map name | Enemy faction | Plot (1–2 lines) | Hero recruited |
|---|---|---|---|---|
| I (0) | I — The Garage | DISRUPTR INC. | Zero-revenue startup mines Funding and razes a rival startup's positions before the runway dies. Tutorial. | — |
| II (1) | II — The Silicon Wastes | MEGACORP | You've gone unicorn; a bloated incumbent with a litigation army hunts you. Raze every MEGACORP campus. | — |
| III (2) | III — The Merger | SYNERGY CORP | The two rivals you bankrupted merged into a hydra. Liquidate every campus before the all-hands. | — |
| IV (3) | IV — The Monopoly Endgame | OMNICORP | The pivot: you're now the threat. OMNICORP is the mirror of what you're becoming. Raze every HQ. | — |
| V (4) | V — The Cartel | THE CARTEL | Your bankrupt victims pool severance into a revenge coalition. Liquidate every campus. | — |
| VI (5) | VI — The Hostile Board | THE BOARD | Your own investors coup you for "synergistic leadership." Raze every stronghold. Seeds "older money." | — |
| VII (6) | VII — The Dunes and the Drifts | THE CONGLOMERATE (boss: THE SEVERANCIER) | All survivors fuse; eight campuses ring a dead sea. Razing all eight deferred-spawns THE SEVERANCIER (A&O's contractor) for a duel. Ends in "the flash." | — |
| VIII (7) | VIII — The Down Round | A&O | You wake broke in the crater of your empire; A&O bought the wreckage at auction. Rebuild and retake two campuses. | **NINO** (Lobbyist) |
| IX (8) | IX — The Proof of Concept | A&O | You torched A&O's vault and walked out with the sabotaged GRAAL blueprint. Stand up the lab; raze three research campuses. | — (Nino carries) |
| X (9) | X — The Acquihire | A&O | Infiltrate A&O's prison-office to free the GRAAL's architect; Nino must physically reach her cell. | **BIBA** (Recruiter/healer, captiveHero) |
| XI (10) | XI — The Launch | A&O | Fight down a peninsula to the Dark Tower and hold the altar to seize the GRAAL (holdout, `ao_ninja` mini-boss). **Extraction unlocks the Wake.** | — (Nino + Biba carry) |
| XII (11) | XII — The Continuity Farm | A&O | A&O leases the dead into refrigerated bodies on subscription. Crack six campuses; seize the transfer lattice. (`reachCutscene: EP12_FARM_LINES`.) | — |
| XIII (12) | XIII — The Vesting Cliff | A&O | The lattice is empty — the minds are upstream, booked as inventory and scheduled for purge. Crack seven vault campuses. (`reachCutscene: EP13_VAULT_LINES`.) | — |

### Interludes & finale (IMPLEMENTED, appended after the linear track)

| displayEp / name | Routing | Enemy / villain | Plot | Status |
|---|---|---|---|---|
| 7.5 THE SEVERANCIER | `hidden:true`, **no gate** | `cyan_ninja` | Standalone Severancier duel arena. **RETIRED/orphan** — the fight now happens inside Ep VII. Kept only to freeze appended indices (permanent spacer). | Dead content |
| 8.5 THE LAND GRAB | gateAfter 7 → returnTo 8 | A&O (reachAndHold) | Seize and hold the crater's uplink ridge against A&O claim bots. | Active |
| 9.5 THE RECOVERY AGENT | gateAfter 8 → returnTo 9 | `ao_enforcer` | Duel A&O's asset-recovery agent blocking the route to Biba. | Active |
| 10.5 THE EXTRACTION CLAUSE | gateAfter 9 → returnTo 10 | A&O (escort) | Escort Biba back into A&O to pull the GRAAL master schematic. Seeds the unseen managing partner (Tusk). | Active |
| 12.5 THE BRIDGE ROUND | gateAfter 11 → returnTo 12 | A&O (survive) | Survive A&O's repossession injunction until the markets open. Seeds REX. | Active |
| FINALE: REX | `finale:true` | `rex` | A&O fields REX, a five-story walking-foreclosure mech that enrages below 40% HP. Beat it → IPO/victory. (`introCutscene: REX_PRELUDE_LINES`.) | Active finale |

**Villain ids actually referenced by a live map:** `cyan_ninja` (7.5), `ao_enforcer` (9.5), `ao_ninja` (Ep XI holdout final wave, `js/maps_data.js:590`; def `js/villains.js:79`), `rex` (finale). **Orphaned (no map):** `tower_guardian` — see §6.3.

### This session's changes (CONFIRMED in the live files)

- **Episode 11.5 "GROUNDS DISPUTE" was removed.** No such entry exists in `js/maps_data.js` (grep for `GROUNDS DISPUTE`, `tower_guardian`, `11.5` all empty). The campaign now flows **XI → HUB → XII** with **no guardian duel**.
- **The `tower_guardian` villain is now orphaned.** Still fully defined in `js/villains.js:122` (a violet A&O Founder-mech with a `stomp`), but no map references it. Residual references: the `evicted` achievement (`js/achievements.js:32`) and a neon-anchor comment (`js/villain_neon_maps.js:36`). Its stomp taunt is literally `'Settling the ground dispute.'` (`js/villains.js:136`) — a residual flavor link to the removed Ep 11.5.
- **GRAAL / Reborn resurrection now unlocks earlier.** `js/hub.js:26-27` set `wakeAppearIdx:11` and `rebornUnlockIdx:11` — the Wake appears and resurrection is usable **after extracting from Episode XI** (seizing the GRAAL at the Dark Tower), instead of the older `>=13` (post-XIII) gate.

---

## 3. The storyline & themes so far

**Throughline (canon, `docs/world-bible.md`):** *"The campaign is a moral descent, never a heroic rise."* Victories are hollow, losses are permanent, there is no sunlight or hope-core. The art direction is dark/devastated cyberpunk (Hades, not Marvel).

**The moral-descent ladder (Arc 1, I–VII):** Each enemy is a mirror of a later stage of your own corruption, and the enemy keeps getting closer to home:
- **I–III:** scrappy underdog → unicorn → "category leader." Conquest replaces scrappiness.
- **IV (the pivot):** "No longer a startup, you're a *threat*." OMNICORP is what you've *become*.
- **V:** your bankrupt victims take revenge (you made your own enemies).
- **VI:** your own investors coup you — "the real enemy was always upstairs."
- **VII:** everyone fuses into one and it ends in **"the flash"** — mutual annihilation. The startup *fails*; the only thing that scaled is the memorial.

**The factions ladder:** garage rival (DISRUPTR) → bloated incumbent (MEGACORP) → merged rivals (SYNERGY) → the monopoly you became (OMNICORP) → revenge coalition (THE CARTEL) → your investors' coup (THE BOARD) → all of them fused (THE CONGLOMERATE) → **A&O** (the fixed standing enemy from VIII on, "the fund that buys the beginning and the end"). **THE BOARD is the spine** — "the board is watching" from Ep I, the coup at VI, and "older money buys the wreckage" seeding A&O at VII–VIII.

**Arc 2 (VIII–XIII) — the resurrection arc:** Rebuild broke from the crater; chase the GRAAL (A&O's consciousness-transfer chip) to undo death — and discover A&O has already turned the afterlife into a subscription (the Continuity Farm). "Death is just another thing capital has already priced." The moral climax is the **Reborn dilemma**: resurrecting anyone uses the exact machine Biba sabotaged and A&O monetized — **you and the enemy run the same machine.**

**Key characters:**
- **NINO** — weary Lobbyist fixer running on guilt; the connective conscience of Arc 2. The only unit who can free captives (`freeCaptives`, `js/core.js:221`, hardcoded to `heroId==='Nino'`).
- **BIBA** — warm field-medic Recruiter who is secretly an **A&O-built healer android**; her work *became* the GRAAL and she may be its first success. Her android truth is hard-gated to stay implied until the Ep XI altar reveal (`EP11_ALTAR_LINES`).
- **A&O / GRAAL** — faceless capital incarnate; the GRAAL is its product/MacGuffin (the cure for death turned subscription).
- **THE BOARD** — the Arc-1 "watching constant," set up by the polish spec as the path to A&O.

**Polish status:** The approved story-polish spec (`docs/story-polish.md`) — Arc-1 Board-spine rewrite, count fixes, Tusk/Biba seeds, the Reborn moral beat, hero voice tiers/duets, in-mission cutscenes, reactive ticker/NPC texture — is **fully implemented and audio-rendered** per `docs/story-polish-tasks.md`. Only its **Arc-3 portions remain out of scope.**

---

## 4. Episode XII and beyond — what happens

### Episode XII — The Continuity Farm — IMPLEMENTED
A&O leases the dead into refrigerated prototype bodies and bills subscriptions for memories that used to belong to people ("immortality with a cancellation clause"). You crack six campuses and seize the **transfer lattice**, then "decide which ghost gets equity again." Delivers Arc 2's ironic twist: the company you rebuilt "was never alive — a cap table wearing a grief mask."
- **Story config:** `reachCutscene:{name:'EP12_FARM_LINES', at:{x:55,y:48}, radius:6}` (seeds Tusk). Quests: `raze` (required), `kills` 150, `churn` <20. **Fully implemented, including its cutscene.**

### Episode XIII — The Vesting Cliff — IMPLEMENTED
The lattice is an empty machine: bodies with no minds. The minds are upstream, encrypted and booked as inventory by A&O, which has filed to **purge** them as delinquent assets. Crack seven backup-vault campuses (three hardened) and pull the dead out before the cliff zeroes them. Arc-2 difficulty peak.
- **Story config:** `reachCutscene:{name:'EP13_VAULT_LINES', at:{x:88,y:46}, radius:6}` (seeds Tusk). Quests: `raze` (required), `fast` <25 min, `wall` zero vet deaths. **Fully implemented, including its cutscene.**

### Current ending — FINALE: REX — IMPLEMENTED but THIN narratively
After Episode XIII the campaign routes **through** REX; the IPO/victory only fires once REX falls. REX is "the foreclosure made flesh" — a five-story A&O Founder-base mech that enrages below 40% HP.
- **Story config:** `introCutscene:'REX_PRELUDE_LINES'`. Quests: `rex` defeatVillain (required), `heroes` heroesAlive, `lean` <12 losses.
- **What is thin/placeholder:** REX is a strong *boss fight* but a **bare narrative ending**. There is no human antagonist, no thematic resolution scene beyond the prelude lines, and the "older money / managing partner / Diaspora" seeds planted across XII–XIII and interludes **have no payoff**. REX is mechanically the finale but narratively a cliff edge — exactly the gap Arc 3 is designed to fill.

**Summary:** XII and XIII are **fully implemented** (maps, quests, cutscenes, carryover heroes). REX is **fully implemented as a fight** but **narratively unresolved** — it is the routing destination, not a story climax, and it leaves the Tusk/A&O-CEO thread dangling by design.

---

## 5. The planned final arc (Arc 3 / CEO arc, XIV onward)

> **Source:** `docs/story-next-steps-ceo-arc.md`, status **"approved design reference, not yet built."** **Everything in this section is [PLANNED — design only]** unless tagged otherwise. It is the production spec the `starleft-mapmaker`, `starleft-unit-forge`, and `starleft-lore-forge` skills execute against.

**Premise [PLANNED]:** A&O's managing partner — a man who already beat death and bills for it — moves to *foreclose the company and erase the dead a second time* so resurrection becomes his subscription forever; the two heroes you reach are the two *keys* that take his plan apart, and the names on the wall are the price of the war.

**Scope [PLANNED]:** 10 numbered episodes (XIV–XXIII) + 2 interludes (XV.5, XVII.5) = **12 maps**, all appended as `MAPS[13+]` (append-only).

### Tusk's master plan — PROJECT CHAPTER ELEVEN [PLANNED]

| Plank | What Tusk does | What strips it |
|---|---|---|
| 1. REPOSSESS | Declares the GRAAL/Wake stolen IP; forecloses the company with a foreclosure-mech army from one foundry. | **Rust's Foundry Raid (XV)** → finale fields *one* REX, not a swarm; his chassis is the body that survives REX. |
| 2. PURGE | A countdown that erases the upstream backup pool, so the wall's dead can never be written home. | **Zeca's Overclock (XVII–XIX)** → his vault heist seizes the custody keys and saves the pool. |
| 3. IPO | Relaunch the cure for death as a Tusk-only subscription, forever. | **The finale (XXII–XXIII)** → raze the keynote, liquidate the man inside REX, take the hollow IPO. |

**The interlock (why the heroes are literally the keys) [PLANNED]:** Tusk is a GRAAL backup → killing him normally re-instantiates him; the custody keys Zeca seizes in XIX hold *Tusk's own backup*, so owning them is the only way he stays dead (**Zeca makes Tusk killable**). A hero Founder Mech is the only body that tanks REX's stomp, and Rust's raid strips the foundry to one REX (**Rust makes the finale survivable**). Neither recruitment is optional flavor.

### The planned episode skeleton [PLANNED — design only]

| Ep | Title | A&O sub-brand | Beat | Recruit / hook | Win-verb |
|---|---|---|---|---|---|
| XIV | THE RECALL NOTICE | Asset Recovery & Reconciliation | Tusk surfaces, names himself, serves CHAPTER ELEVEN; purge countdown begins. Survive the first repo wave. | — | `survive` |
| XV | THE FOUNDRY RAID | Fabrication & Founder Programs | Raid the mech foundry → strips Tusk's army. | **Duel RUST** | `razeAll` + boss |
| XV.5 | THE NON-COMPETE | Legal Enforcement (Founder-warden) | Tusk litigates Rust's exit; a Founder-warden hunts him. | **Rust defects** (captiveHero) — `gateAfter`/`returnTo` to seat between XV and XVI; **reuses `tower_guardian` base** | `defeatVillain` |
| XVI | THE SEVERANCE PACKAGE | Repossession & Recovery | A&O repossesses its "depreciated asset"; defend Rust. First "Tusk is a render" seed. | Rust fully aboard (Stomp/Recall) | `razeAll`/`survive` |
| XVII | THE GROWTH TEAM | Growth & Velocity (Intern sweatshop) | Free the engine of A&O's cruelty. | **Rescue ZECA** (Nino-proximity) | `escort`/`reachAndHold` |
| XVII.5 | THE PERFORMANCE REVIEW | People Ops (Enforcer-hunter) | A hunter "reviews" Zeca's departure; shield him. | **reuses `ao_enforcer` base** | `defeatVillain` |
| XVIII | THE VELOCITY TRAP | Velocity Division | First real race; Overclock out-builds an A&O push. | — | `survive`/`winBy` |
| XIX | THE DATA VAULT | Upstream Custody | Zeca's Overclock cracks the vault; seize custody keys → backups saved; keys also hold Tusk's backup. | — | `razeAll`/`winBy` |
| XX | THE BURN RATE | Risk & Liquidation | Tusk triggers manual purge and comes for the keys. Starved survive/escort. | — | `survive`/`escort` |
| XXI | THE OFFSITE | Orbital & Continuity | Raze Tusk's off-world soul-server launch site so he can't flee his own death. Musk-satire beat. | — | `razeAll` |
| XXII | THE GOLDEN PARACHUTE | Office of the Managing Partner | Raze the keynote stage under the purge clock; full Tusk reveal; he flees into REX. | `heroesAlive` (NINO, BIBA, RUST, ZECA) | `razeAll` |
| XXIII | THE LIQUIDATION EVENT | REX (Tusk inside) | Liquidate the man inside the foreclosure. One REX, survivable, permanently killable. Hollow IPO. | — | `defeatVillain`, `finale:true` |

*Optional, not required:* an `XX.5` "Risk lieutenant" duel between XX and XXI for a third rhythm-break.

### Antagonist — DELL TUSK [PLANNED]
A&O's managing partner — not a leader of capital but **capital wearing a man**. **The locked twist:** Tusk is the **first successful GRAAL write**, a re-instantiating backup of A&O's long-churned founder; he wants to *own* resurrection because *he is the proof of concept*. This pays off Biba's shipped android reveal and makes him the player's dark mirror ("you both run the same machine; only the price differs"). **Never redeemed** — his defeat is "a write-off." Reveal schedule: indifferent/"migration" talk in XIV → Rust's render-seed in XVI → full reveal at the XXII keynote. Musk-satire register: Mars-as-backup-drive → off-world soul-server "Diaspora"; mass layoffs → "death-as-data-migration"; the memorial as "a liability we're rightsizing."

### Hero recruits [PLANNED] — exactly two
- **PEDRO "RUST"** (Mechfounder, Ep XV) — boss-duel→defection (recommended: on `bossOutcome(state,'win')` spawn him as a neutral `captiveHero`, reusing the Biba `freeCaptives` path; **do not add a new `bossOutcome('recruit')` kind**). Kit: a guaranteed hero Founder Mech every map (`DEF.founder`, the only REX-tanking body), **STOMP** (reuse the `rex`/founder stomp ability in `js/villains.js`), **RECALL** (yank the most-wounded ally — *must route through a `net*` wrapper / host-only*). Aura `[255,140,60]`. Gallows-corporate voice.
- **ZECA OKONKWO** (Gifted Intern, Ep XVII) — Nino-proximity rescue (Biba pattern via `cfg.captives` with `hero:true`; **zero new rescue code because Nino is carried by XVII**). Kit: passive **OVERCLOCK** aura that scales the per-`dt` increment UP at build/production/gather timers (accelerate the increment, never reduce a `buildTime`), plus an active **CRUNCH** burst (instant-complete nearby builds, cooldown-gated). Near-defenceless on purpose. Aura teal `[60,210,200]`. Burnt-out-prodigy voice.

### The Reborn dilemma in Arc 3 [PLANNED — explicit non-change]
The arc adds **no gate, no freeze, no unlock** to resurrection. The Wake stays 3-ever / 1-at-a-time / comes-back-wrong; that scarcity is declared **"sacred."** The new stakes are **the purge of the upstream backup *pool*** the dead are written *from* — XIX saves the pool, but "the Wake still writes only 3." The arc deliberately does *not* make resurrection itself the unlock-reward.

### The Board & the GRAAL in the endgame [PLANNED]
**THE BOARD is NOT a named participant in Arc 3's finale** — the endgame organization is **A&O**, personified for the first time by Tusk. **The GRAAL is both the contested prize and the kill-switch:** Tusk seeks to repossess it as IP and relaunch it as a subscription; the custody keys (holding the dead *and* Tusk's backup) are what make him mortal.

### The intended ending [PLANNED, with [PARTIALLY IMPLEMENTED] machinery]
**XXII** razes Tusk's bunker-campus + keynote stage (`razeAll`); Biba names him into his microphone; as his HQ falls he flees into REX. **XXIII is the existing REX superboss re-skinned as Tusk's escape vehicle** — one REX, survivable (Rust's chassis), permanently killable (you hold his backup). **Hollow by design:** "Ring the bell in an empty room and feel exactly nothing, because the wall is still the wall, and you only ever got to write three of them home." **The REX finale machinery is [PARTIALLY IMPLEMENTED] / reused 1:1** — `finaleVillainIndex()` (`js/villains.js:890`) and the `bossOutcome` finale branch (`js/villains.js:822`, `if(state.cfg && state.cfg.finale)` at `:826`) are flag-based (`cfg.finale`), so REX keeps `finale:true` with **zero `villains.js` rewrite** — the change is a crawl/taunt re-skin plus an optional Tusk-in-cockpit sprite.

---

## 6. Review: gaps, inconsistencies & adjustments

### 6.1 REX vs. the planned CEO-arc ending — RESOLVED by design (verify routing)
**REX is NOT superseded.** The Arc-3 plan reuses REX 1:1 as the finale and **re-skins it** as Tusk's escape vehicle (XXIII). REX keeps `finale:true`; no `villains.js` rewrite. **Action — verify, do FIRST (gates everything):** appending ten numbered episodes extends the linear track to XXIII *before* REX. Confirm `lastEpisodeIndex()` (`js/villains.js:858`), `villainNextLinear` (`:865`, with the `if(m.finale) return lastEpisodeIndex()+1` marker at `:869`), and `finaleVillainIndex()` (`:890`) still seat REX *after* XXIII. This is "a routing check, not a rewrite." **Decision for the user:** keep REX as the literal Arc-3 finale (planned), or author a bespoke Tusk boss. If a *new* `finale:true` boss is ever added, **REX must lose `finale:true`** or routing stops at REX (only one finale should exist).

### 6.2 Earlier GRAAL/Reborn unlock vs. Reborn-dilemma pacing — NO conflict, but note it
The Arc-3 doc was authored when resurrection unlocked at `>=13`. This session moved it to **`>=11`** (`js/hub.js:26-27`). The arc explicitly leaves `rebornUnlockIdx`/`wakeAppearIdx` alone and only requires Reborn be live by Ep XIV — which the earlier unlock satisfies *more strongly*. **No conflict.** **One pacing consideration for the user (not a bug):** players now have ~2 episodes (XII–XIII) of resurrection access *before* Arc 3's "purge the pool" stakes land. This is fine thematically (the dilemma is the *scarcity*, not the unlock), but you may want a fresh ticker/NPC beat reaffirming the 3-ever cap as Arc 3 raises the pool stakes.

### 6.3 Orphaned `tower_guardian` + dormant "Evicted" achievement — REUSE opportunity
`tower_guardian` (violet A&O Founder-mech with `stomp`, full taunt pool, `js/villains.js:122`) is fully statted but **referenced by no map** since the 11.5 removal. The `evicted` achievement (`js/achievements.js:32`) and a neon-anchor comment (`js/villain_neon_maps.js:36`) still point at it — **the achievement is currently un-earnable.** Its stomp taunt `'Settling the ground dispute.'` (`js/villains.js:136`) is a residual link to the removed Ep 11.5 "GROUNDS DISPUTE." The Arc-3 plan **already calls for reusing `tower_guardian` as the XV.5 Founder-warden's base** (the non-compete enforcer hunting Rust). **Action:** wire `tower_guardian` into XV.5 (this also re-arms the `evicted` achievement and reuses the neon anchor) — or, if XV.5 is deferred, decide whether to retire the achievement or repoint it. The cleanest single fix in the review.

### 6.4 Numbering / routing of new interludes — defined, append-only
New interludes are `.5` `isVillain` entries appended as `MAPS[13+]` with `gateAfter`/`returnTo`/`displayEp` (the shipped Cyan-Ninja/Recovery-Agent pattern). **Watch-out:** `gateAfter` is a **0-based array-index gate**, so the value must be the *index* of the episode it follows, not the display number — confirm each new linear episode's final index when laying out the appends. Cleared interludes must call `markVillainCleared` so replays don't re-gate.

### 6.5 Save-compat constraints — mandatory
- **Append-only, never insert.** Episodes I–XIII (`MAPS[0..12]`) and the appended interludes/REX must not shift — hardcoded `mapIndex===6`/`MAPS[7]` Nino hooks, `rebornUnlockIdx`/`wakeAppearIdx` gates, and Madosis episode numbers depend on it. Every Arc-3 map is `MAPS[13+]`.
- **The hidden 7.5 Severancier arena must stay** — removing it shifts every appended index (REX → wrong slot). Treat it as a permanent index spacer.
- **Append-only line pools.** `HERO_SELECT_LINES`, `LORE` event pools, `NPC_LORE` versioned pools are index-keyed to voice clips — new heroes/lines go in **new pools/speaker keys** (`HERO_TIER_LINES`, `HERO_DUET_LINES`), never reorder existing ones.
- **Legacy-safe flags.** New `CAMPAIGN` flags (e.g. a `vetCarryOverride`) must default safe when absent (legacy save = flag false). New persistent state needs both serialization *and* reference-encoding updates in `js/save.js`.
- **Solo-only cutscenes / host-authoritative mutation.** Cutscenes and taunts are solo-only; co-op keeps the toast. Rust's RECALL (mutates a non-hero ally's position) must route through a `net*` wrapper / host-only.

### 6.6 Crawl count vs. objective drift — known pattern, re-check on new maps
Ep XI's crawl says "SIX labs" while the objective/map define **five**. The polish pass already fixed four such count contradictions (Eps III–VI). **Action:** when authoring Arc-3 crawls, keep enemy-base counts generic ("every campus") or exactly match the placed `enemies` to avoid re-introducing the drift, since crawls are TTS-rendered and expensive to re-voice.

### 6.7 Tusk/Diaspora seeds have no payoff yet — the core gap
Tusk, "older money," the unseen managing partner, and the off-world "Diaspora" are seeded across XII–XIII crawls, the EP12/EP13 cutscenes, interlude 10.5/12.5 summaries, and NPC lore — but **nothing pays them off.** Arc 3 *is* the payoff. Until it ships, the campaign ends on an unresolved hook (REX with no human author). This is the single biggest narrative gap and the reason to build Arc 3.

---

## 7. Proposed implementation roadmap

Phased so each phase is shippable and the campaign stays winnable end-to-end. Use the **`starleft-mapmaker`** skill for every new map (it owns the `maps_data.js` schema, the generator, crawl/TTS pipeline, and the moral-descent arc), **`starleft-unit-forge`** for Rust/Zeca sprites + DEF wiring + aura/muzzle calibration, and **`starleft-lore-forge`** for dossiers, barks, and the lore→TTS recording (respecting the append-only voice-clip contract).

> All map work appends as `MAPS[13+]`. Numbers below are *scope sketches*, not balance commitments. Code line refs are indicative — verify at build time.

### Phase 0 — Engine prerequisites & routing (do FIRST; gates everything)
- **Finale-routing re-verification** (§6.1): confirm REX still seats after XXIII once ten episodes are appended (`js/villains.js:858/865/869/890`).
- **Vet-carry cap freeze:** add a save-safe `vetCarryOverride` (e.g. 7) for `idx >= 12` so the late arc doesn't balloon the carry cap.
- **Two `heroAura()` color lines** in `js/render.js:1486` (foundry orange for Rust, teal for Zeca).
- **Decide** Crunch cooldown/strength (balance pass) and whether XV's duel + XV.5 defection are one map or two.
- *Scope: small, code-only, no new maps. Highest risk if skipped.*

### Phase 1 — Heroes & systems (Rust + Zeca), unblocks the whole arc
- **Rust:** `starleft-unit-forge` sprite + `DEF.founder`-based hero; **STOMP** (reuse the `rex`/founder stomp ability in `js/villains.js`); **RECALL** via a `net*` wrapper (host-authoritative); captiveHero defection on `bossOutcome(state,'win')` (no new outcome kind). `starleft-lore-forge` dossier + barks + TTS.
- **Zeca:** `starleft-unit-forge` near-defenceless Intern hero; **OVERCLOCK** aura scaling the per-`dt` increment up at the verified timer sites — build `js/core.js:25` (`b.buildProg += dt`) and crew-assist `js/units.js:966` (mind `ASSIST_BUILD_RATE`, `js/config.js:6`), production `js/core.js:53` (`b.prodTime += dt`), gather `js/units.js:942` (`u.gatherTimer += dt`) — accelerate the increment, never reduce a `buildTime`; **CRUNCH** active burst (cooldown-gated). `cfg.captives` hero entry; Nino-proximity rescue is zero-code (`freeCaptives`, `js/core.js:221`, `heroId==='Nino'` at `:225`). Dossier + barks + TTS.
- *Scope: medium-large (new abilities + net wrappers + two content passes). The arc cannot be authored meaningfully without these.*

### Phase 2 — CEO intro + Mechfounder block (XIV, XV, XV.5, XVI)
- `starleft-mapmaker` for XIV (survive / purge-countdown), XV (razeAll + Rust boss-duel), **XV.5** (reuse `tower_guardian`; re-arms the `evicted` achievement, §6.3), XVI (defend Rust; first "render" seed).
- Tusk surfaces and names himself; the foundry raid demotes the finale to one REX.
- *Scope: 4 maps + crawls/TTS + Rust life-events. First playable slice of Arc 3.*

### Phase 3 — Intern block + the pivot (XVII, XVII.5, XVIII, XIX)
- XVII (rescue Zeca, Nino-proximity), **XVII.5** (reuse `ao_enforcer`), XVIII (first Overclock-tuned race), XIX (vault heist — dead saved, Tusk made mortal, the keys seized).
- This is the mechanical pivot; tune XVIII/XIX race clocks assuming the Overclock aura.
- *Scope: 4 maps + Zeca life-events + race-clock balance. Lands the central twist.*

### Phase 4 — Endgame & finale (XX, XXI, XXII, XXIII)
- XX (starved escort, both heroes load-bearing), XXI (raze the off-world Diaspora launch site — Musk-satire beat), XXII (raze keynote; full Tusk reveal; flee into REX; `heroesAlive` quest for all four heroes), **XXIII** (REX re-skin: crawl/taunt re-skin, optional Tusk-in-cockpit sprite, `finale:true` 1:1).
- Author the Tusk keynote cutscene / `REX_PRELUDE_LINES` successor; ensure the hollow-IPO ending lands.
- *Scope: 4 maps + finale re-skin + a keynote cutscene. Closes the campaign.*

### Phase 5 — Optional polish fast-follows
- A visibly-distinct Reborn sprite/voice/scarred-mind ability (`starleft-unit-forge`, explicitly **not** part of Arc 3).
- Optional `XX.5` "Risk lieutenant" duel for a third rhythm-break.
- Bespoke Tusk-in-REX cockpit sprite (vs. taunt-only re-skin).
- Widen `freeCaptives` rescuer beyond Nino (optional; not required).
- A new ticker/NPC beat reaffirming the 3-ever cap as the pool stakes rise (§6.2).

---

## 8. Open decisions for the developer

- **Arc length:** Build the full planned 12 maps (XIV–XXIII + 2 interludes), or a leaner cut (e.g. drop one interlude / compress the Intern block) for a faster ship?
- **REX as the finale:** Keep REX reused 1:1 and re-skinned as Tusk's escape vehicle (planned, cheapest), or author a bespoke Tusk boss? (If bespoke, REX must lose `finale:true`.)
- **Tusk-in-REX presentation:** Taunt/crawl re-skin only, or commission a bespoke Tusk-in-cockpit sprite?
- **Reborn dilemma given the earlier unlock:** Leave the 3-ever caps untouched and raise stakes via the *pool* purge (planned) — confirm now that players get the Wake ~2 episodes earlier (post-XI). Add a new beat reaffirming the cap as Arc 3 lands?
- **Ending tone:** Confirm the intended hollow, non-redemptive ending ("ring the bell in an empty room … the wall is still the wall") — or a softer/alternate beat? (Canon says do not soften.)
- **`tower_guardian` / `evicted` achievement:** Reuse `tower_guardian` in XV.5 as planned (re-arming the achievement), or retire/repoint the orphaned achievement if XV.5 is cut?
- **XV duel vs. XV.5 defection:** One map or two for Rust's duel-then-defect?
- **Crunch balance:** What cooldown/strength for Zeca's active Crunch burst (needs its own pass)?
- **Optional rhythm-break:** Add the `XX.5` "Risk lieutenant" duel, or keep the arc at 12 maps?
- **Build sequencing:** Ship Arc 3 in playable slices (Phase 2 → 3 → 4) with interim "to be continued" framing after REX, or hold until the full arc is complete?
