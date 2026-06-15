# STARLEFT — Story Next-Steps: THE A&O CEO ARC (Arc 3, Episodes XIV–XXIII)

> **Status:** approved design reference, not yet built. This is the production spec the
> **`starleft-mapmaker`**, **`starleft-unit-forge`**, and **`starleft-lore-forge`** skills execute
> against. It is canon-subordinate to **`docs/world-bible.md`** (when this doc and the bible disagree,
> the bible wins; when this doc and *code* disagree, code wins). All code anchors below were verified
> against `main` at authoring time.

---

## 0. Where we pick up (the canon anchor)

The shipped campaign closes the **resurrection cycle**: Episode XIII (**THE VESTING CLIFF**, `MAPS[12]`)
drags the dead out of A&O's purge; **REX** — the five-story walking-foreclosure superboss
(`js/config.js:859`, `isVillain:true finale:true`) — is the current finale; and **THE WAKE**, the H.U.B.
resurrection tower, is already standing **and already functional** (`js/hub.js:26-27`: the spire appears
at `CAMPAIGN.nextMapIndex >= 11`, resurrection *unlocks* at `>= 13`). Biba and the cyborgs have joined;
the player can already write fallen veterans home — **3 ever, 1 at a time**, paid in M3$ + write-time
(`rebornTotalCap:3`, `rebornSlotCap:1`, `js/hub.js:24-25`).

**Arc 3 begins at Episode XIV** and runs to **Episode XXIII**, the new finale. It is the third campaign
cycle: **Arc 1** = the hostile-takeover ladder ending in the flash; **Arc 2** = the resurrection arc
against A&O; **Arc 3** = *A&O strikes back* — its managing partner moves to foreclose the company that
stole the cure for death and erase the dead a second time.

**Hard rules for this arc:**
- **APPEND, never insert.** Every new map is `MAPS[13+]`. No existing index shifts — this keeps save
  compatibility, the hard-coded `mapIndex===6`/`MAPS[7]` hooks, the `wakeAppearIdx`/`rebornUnlockIdx`
  markers, and every pre-rendered `crawl/ep_NN.mp3` clip valid. (See §6 for the finale-routing caveat.)
- **Reborn is NOT a reward of this arc.** Resurrection is already live. Arc 3 adds **no gate, no freeze,
  no unlock**. Its resurrection stakes are about Tusk **purging the backup *pool*** the dead are written
  back *from* — never about switching the Wake on. Do not write a beat where the player "finally" gains
  resurrection; they already have it.
- **Tone stays Arc-canon:** dark, devastated, Hades-not-Marvel, satirical, **never redemptive or
  triumphant**. Victories are hollow; Tusk is never pitied; the heroes' arrival is grim relief, not hope.

---

## 1. Premise & throughline

> **One sentence:** A&O's managing partner — a man who already beat death and bills for it — moves to
> **foreclose the company and erase the dead a second time** so resurrection becomes his subscription
> forever; the two heroes you reach are the two **keys** that take his plan apart, and the names on the
> wall are the price of the war.

### Tusk's plan — PROJECT CHAPTER ELEVEN (three planks)

| Plank | What Tusk does | What strips it |
|-------|----------------|----------------|
| **1. REPOSSESS** | Declares the stolen GRAAL/Wake A&O IP; forecloses the company. His enforcement is a foreclosure-**mech army** stamped out of one foundry. | **RUST's Foundry Raid (XV)** — strips the army so the finale fields *one* REX, not a swarm; his chassis is the body that survives REX. |
| **2. PURGE** | A countdown that erases the upstream backup pool, so the memorial's dead can never be written home again. | **ZECA's Overclock (XVII–XIX)** — the only thing fast enough to out-race the clock; his vault heist seizes the custody keys and saves the pool. |
| **3. IPO** | Relaunch the cure for death as a Tusk-only subscription, forever. | **The finale (XXII–XXIII)** — raze the keynote, liquidate the man inside REX, take the IPO and find it hollow. |

### Why the heroes are *literally* the keys (the interlock)

This is the answer to "make the recruitments matter, not be detours":

- **Tusk is a GRAAL backup** (§2) → killing him normally just **re-instantiates** him. The custody keys
  **Zeca** seizes in XIX **hold Tusk's own backup** → owning them is the only way to make him stay dead.
  **Zeca is what makes Tusk killable.**
- A&O's foreclosure-mech foundry would swarm the finale; **Rust's** raid (XV) strips it to one REX, and a
  **hero Founder Mech is the only body that tanks REX's stomp**. **Rust is what makes the finale survivable.**
- Remove either: no Zeca → the dead are purged and Tusk is immortal; no Rust → the finale is unwinnable.
  Neither recruitment is optional flavor.

### Escalation (canon "the enemy gets closer to home")

Paperwork (XIV) → **A&O's own discarded people turned against it** — both heroes are A&O cast-offs (Rust
expensed as a "depreciated asset", Zeca leased as "velocity") → enforcers (the `.5` interludes) → the
building that walks (REX/Tusk, XXIII). The connective tissue: ***A&O eats its own stars; you recruit the
leftovers.***

---

## 2. Villain spec — DELL TUSK

**Identity.** A&O managing partner; "the man who signed the injunction." He does not *lead* capital — he
is **capital wearing a man**. Defeating him breaks the system that birthed him, not someone the player
might pity (true to world-bible §3: A&O is faceless capital incarnate; Tusk is the first time it wears a
face, and the face is a lie).

**The twist (locked).** Tusk is the **first successful GRAAL write** — a backup of A&O's long-churned
founder, re-instantiating on death. He wants to *own* resurrection because **he is the proof of concept**
and cannot permit a free copy to exist. This pays off Biba's shipped android reveal (`EP11_ALTAR_LINES`,
`js/config.js`) and makes Tusk the **player's dark mirror**: you both run the same machine; only the price
differs. He is never redeemed — defeat is a **write-off**, not a death he earns sympathy for.

**Reveal schedule (seed early, pay late):**
- **XIV** — eerily indifferent to any threat; talks about people as "instances," losses as "migration."
- **XVI** — Rust's insider knowledge plants it: he scanned Tusk's face for a marketing **render** and the
  render "didn't age between fiscal years."
- **XXII–XXIII** — full reveal, mechanically bound to the keys: you can only end him because you hold his
  backup. Biba names it at the keynote ("he is what I built, wearing the man who paid for it").

**Musk-satire register (deadpan, never tragic).** Use sparingly and viciously:
- Mars-as-backup-drive → off-world **soul-server diaspora** (XXI's launch site).
- "Free speech" → consciousness-as-marketplace ("priced per thought, per second").
- Neuralink → the GRAAL immortality subscription itself.
- Mass layoffs → **death-as-data-migration** ("the flash wasn't a tragedy, it was a migration event —
  forty thousand inefficient instances retired").
- Buying-the-company → "I bought your wreckage because I can."
- Calls the memorial "a liability we're rightsizing." Rebrands the fund **X&O** for no reason.
  Livestreams keynotes over the battlefield. Styles himself "the adult in the room."

**Finale format — HYBRID, reuses existing machinery 1:1.** XXII razes his bunker-campus + keynote stage
(`razeAll`); as his HQ falls he **flees into REX**. XXIII is the existing REX superboss **re-skinned as
Tusk's escape vehicle**. Verified: `finaleVillainIndex()` (`js/villains.js:838`) and the finale branch of
`bossOutcome()` (`js/villains.js:774`, `if(state.cfg && state.cfg.finale)`) are **flag-based, not
index-based** → REX keeps `finale:true` and its IPO-on-victory routing with **zero `villains.js`
rewrite**. This is a crawl/taunt re-skin plus (optionally) a bespoke Tusk-in-cockpit sprite — see §6.

---

## 3. Hero spec ×2

Both ride the **hero-carryover track** (`carryoverHeroes[]`, `js/career.js:191,247`): auto-deploy every
map, **never consume a vet slot**, non-selectable, fixed dossier with prose from Lv2+. The proven entry
mechanic is the **`captiveHero` promotion** (`js/core.js:205-210`): a neutral captive flagged as a hero is
freed when a player hero reaches it, then promoted to a full carryover hero exactly like Biba. Each new
hero needs **one new `heroAura()` color line** (`js/render.js:1426`, currently only `nino`/`biba`).
Bespoke sprite sheets → `starleft-unit-forge`; dossiers + voice lines → `starleft-lore-forge`.

### HERO 1 — PEDRO "RUST" · Mechfounder · introduced **Ep XV**

- **Hometown / origin (lore-forge):** a Rustbelt-Tier or Detroit-Reclamation register — built mechs for
  A&O's "Founder Programs," then *became* one of their marketing renders.
- **Recruitment — boss-duel → defection.** A&O fields him *against* you in XV as its contracted
  Founder-Mech test pilot (a bespoke villain on `base:'founder'`, the way `tower_guardian` rides a base
  unit). You out-duel him; the fight ends not in death but in him reading his own file: Tusk booked him a
  **DEPRECIATED ASSET**, written off the quarter he turned 50, his face scanned for the Founder-Mech
  marketing render, the suit repossessed. He defects.
  - **Implementation (recommended, cheapest):** on `bossOutcome(state,'win')` (`js/villains.js:770`), spawn
    Rust as a neutral **`captiveHero`** at the duel site so the *existing* `freeCaptives()` promotion path
    carries him (`js/core.js:208-210`). **Do not add a new `bossOutcome('recruit')` kind** — verified
    absent; the captive-spawn reuses shipped code. (The duel-then-defect can be one map, or the `.5`
    interlude XV.5 can cement it; see skeleton.)
- **Kit — hero Founder Mech** (`DEF.founder`, `js/config.js:152` — `hp:600 cost:599 dmg:45 range:3.5
  supply:6 vehicle:true`, the heaviest, most expensive line unit; confirm splash/anti-air flags off the
  live `DEF` entry when wiring):
  1. **A guaranteed armored body every map** — the line unit is a 599-funding late-game rarity, so simply
     *having* a Founder Mech from turn one is the power. The only thing that tanks REX's stomp in XXIII.
  2. **STOMP** — a short gap-closer/AoE; **reuse `rex.js startStomp/stepStomp`** (cheap).
  3. **RECALL** — yank the most-wounded ally to him (recruiter heal-scan to pick the target + a move
     order). **Mutates a non-hero ally's position → must route through a `net*` wrapper / host-only** (§6).
- **Voice — gallows-corporate; the arc's tonal relief, never hope-core** (lore-forge seeds):
  - "Twelve feet of exosuit and a 401(k) that vested into nothing."
  - "I move like a foreclosure notice — slow, inevitable, bad for property values."
  - "Promoted again. Still no dental."
  - On Tusk: "I built the face he's wearing. Trust me, the warranty's expired."
- **Aura color:** `[255,140,60]` (foundry orange).
- **Finale stake:** the Foundry Raid is *why* XXIII fields one REX; his chassis is *why* the duel survives.

### HERO 2 — ZECA OKONKWO · Gifted Intern · introduced **Ep XVII**

- **Hometown / origin (lore-forge):** a Lagos-Overcity / Manila-Floodline register — a prodigy who
  "shipped six quarters in one" and was paid in exposure and a memorial slot.
- **Recruitment — Nino-proximity rescue** (the Biba pattern, a `cfg.captives` entry with `hero:true`).
  Held in an A&O "growth" sweatshop, kept because he is *faster than the algorithm* — his throughput is
  what makes the purge clock viable in the first place. **Verified:** `freeCaptives()` hardcodes Nino as
  the only rescuer (`js/core.js:215`) and Nino is carried by XVII → **zero new code if Nino reaches him.**
  (Widening the rescuer to "any carried hero" is optional polish, not required.)
- **Kit — "speeds up the game a lot" = Overclock aura + Crunch burst** (the author's two-part ask):
  - **Passive OVERCLOCK aura (~6 tiles):** accelerates tempo by scaling the **per-`dt` increment UP** at
    the three verified timer sites — **build** `b.buildProg += dt` (`js/core.js:24`; crew path
    `js/units.js:910`, mind the `ASSIST_BUILD_RATE` multiplier so you don't double-stack), **production**
    `b.prodTime += dt` (`js/core.js:52`), **gather** `u.gatherTimer += dt` against the `>= 0.55` threshold
    (`js/units.js:886,888`). Economy *and* army tempo speed up around him. **(These timers INCREMENT —
    accelerate by scaling the increment, never by "reducing a buildT".)**
  - **Active CRUNCH burst (cooldown):** instantly completes nearby in-progress builds/production — the
    dramatic "a lot." Needs its own balance pass; gate by cooldown, not cost.
  - He inherits worker-tier `dmg` (≈4) — **near-defenceless on purpose**, so keeping him alive is the
    tension. He is a **non-combat hero**; his power is the clock, not the gun.
- **Voice — burnt-out prodigy; speed-as-grief** (lore-forge seeds):
  - "I shipped six quarters in one. They paid me in exposure and a memorial slot."
  - "Move faster — it's the only thing they ever taught me, and the only thing that outruns the clock."
  - "You want it good, fast, and cheap? I'm the cheap one. I make the other two lie."
- **Aura color:** teal (e.g. `[60,210,200]`), distinct from Biba's healing glow.
- **Finale stake:** his Overclock cracks the vault keys (XIX), out-builds the manual purge (XX), and is the
  reason the dead survive Tusk's death. No Zeca → no keys → Tusk is immortal and the pool is ash.

---

## 4. The episode skeleton (XIV–XXIII + 2 interludes = 12 maps)

Appended as `MAPS[13+]`. Interludes are `.5` `isVillain` entries using the shipped
`gateAfter`/`returnTo`/`displayEp` routing (the Cyan-Ninja / Recovery-Agent pattern). REX keeps
`finale:true`, re-skinned in XXIII. **Biome-as-mood** (world-bible §7): **tech** = inside A&O / dead
server-farm; **+ice** = frozen capital; **+grass** = HUB approaches / ruin reclaimed.

| Ep | Title | A&O sub-brand | Biome | Arc | Beat | Recruit / hook |
|----|-------|---------------|-------|-----|------|----------------|
| **XIV** | THE RECALL NOTICE | Asset Recovery & Reconciliation | tech (crater / HUB perimeter) | CEO | Tusk surfaces, names himself, serves **CHAPTER ELEVEN** — company + dead declared delinquent inventory; the **purge countdown** on the backups begins. Survive the first repo wave. | — |
| **XV** | THE FOUNDRY RAID | Fabrication & Founder Programs | tech + coolant seas | Mechfounder | Raid the mech foundry stamping out foreclosure-mechs → strips Tusk's army. You're a raider now. | **Duel RUST** |
| **XV.5** | THE NON-COMPETE | Legal Enforcement (Founder-warden) | tech (contract-arena slab) | interlude | Tusk serves a non-compete; a Founder-warden hunts Rust — "company property doesn't quit." | **Rust defects** (post-duel `captiveHero` spawn). `gateAfter:14 returnTo:15`, `tower_guardian` base. |
| **XVI** | THE SEVERANCE PACKAGE | Repossession & Recovery | tech | Mechfounder | A&O comes in force to repossess its "depreciated asset"; defend Rust, turn his foundry intel on A&O. Rust hints Tusk is a "render." | Rust fully aboard; Stomp/Recall online. |
| **XVII** | THE GROWTH TEAM | Growth & Velocity (Intern sweatshop) | tech (open-plan, Acquihire register) | Intern | Free the engine of A&O's cruelty to make it yours — grim, not heroic. | **Rescue ZECA** (Nino-proximity). Overclock previews. |
| **XVII.5** | THE PERFORMANCE REVIEW | People Ops (Enforcer-hunter) | tech + ice (cold review-room) | interlude | A&O sends a hunter to "review" Zeca's departure; shield the near-defenceless hero while finishing it. | `gateAfter:16 returnTo:17`, `ao_enforcer` base. |
| **XVIII** | THE VELOCITY TRAP | Velocity Division | tech + ice | Intern | A&O accelerates the purge; first real race — Overclock + Crunch out-build an A&O push. | — |
| **XIX** | THE DATA VAULT | Upstream Custody (backup archive) | tech + ice (deep cold-storage) | Intern | Decisive heist: **Zeca's Overclock cracks the vault in minutes**; seize the custody keys → backup pool saved. The keys also hold **Tusk's own backup** — now he can die for good. Hollow win: the dead are yours as data; the Wake still writes only 3. | — |
| **XX** | THE BURN RATE | Risk & Liquidation | tech + grass (HUB approaches) | CEO | Tusk triggers the **manual purge** and comes for the keys. Starved survive/escort — get the keys home. Both heroes load-bearing. | — |
| **XXI** | THE OFFSITE | Orbital & Continuity Division | tech + ice (frozen spaceport) | CEO | Raze Tusk's off-world **soul-server** launch site so he can't flee his own death — he must field himself. Hard Musk-satire beat. | — |
| **XXII** | THE GOLDEN PARACHUTE | Office of the Managing Partner | tech (bunker-campus + keynote stage) | CEO | Stripped of foundry / vault / launch, Tusk has one asset: the IPO keynote. Raze it under the purge clock; as his HQ falls he **flees into REX**. Full Tusk reveal. | `heroesAlive` quest (NINO, BIBA, RUST, ZECA). |
| **XXIII** | THE LIQUIDATION EVENT | REX (Tusk inside it) | tech (REX arena) | CEO finale | Liquidate the man inside the foreclosure-that-walks. **One** REX (foundry gone), survivable (Rust's chassis), Tusk permanently killable (you hold his backup). No triumph — the foreclosure foreclosed; the IPO is yours and hollow. | REX `finale:true` routing 1:1, crawl re-skinned. |

**Counts:** 10 numbered (XIV–XXIII) + 2 interludes = **12 maps.** Arc split **1 / 2 / 3 / 4** (CEO-intro /
mechfounder / intern / CEO-showdown), escalating. (If a third rhythm-break is wanted, an optional `XX.5`
"Risk lieutenant" duel slots between XX and XXI; not required.)

---

## 5. Per-episode crawl seeds

Draft paragraphs in the established voice (second person, Star-Wars cadence, dark startup satire, end on a
propulsive line). These are **seeds for `starleft-mapmaker`** — final crawls, summaries, objectives, quest
arrays, enemy counts, and contextual `{token}` vars are produced there. Each lists: **win-verb** (all
shipped quest types), **biome-mood**, and the **HUB/career/memorial tie-in**.

### XIV — THE RECALL NOTICE · win-verb: `survive` (hold the HUB perimeter) · tech
> The cure for death is yours, and the invoice just cleared legal. A&O does not send an army first; it
> sends a filing. **CHAPTER ELEVEN** — the fund that owns the beginning and the end declares your company
> a delinquent asset, your dead its repossessed inventory, and the man who signs it finally gives the fund
> a face. He calls the flash a migration event. He calls your memorial a liability. He calls himself the
> adult in the room. Hold the line while the first recovery crews test the fence — the names on the wall
> are on his ledger now, and the clock to zero them has already started.
- **Vars:** `{party}`, `{fallen}`, `{biba}`. **Memorial:** the purge clock = names that can *no longer be
  written home* if Tusk wins (Reborn itself stays fully usable in the HUB throughout).

### XV — THE FOUNDRY RAID · win-verb: `razeAll` (+ embedded boss) · tech + coolant seas
> Tusk does not build soldiers; he stamps them. One foundry on the coolant coast prints the foreclosure —
> a line of Founder Mechs, each a repossession on legs. Burn it down before it floors the quarter, and put
> down the test pilot they send to stop you. He fights like he has nothing to lose. He is about to find out
> he's right.
- **Hook:** Rust fielded as the boss; **win demotes the finale's REX swarm to one.** **Career:** Rust's
  duel.

### XV.5 — THE NON-COMPETE · win-verb: `defeatVillain` · tech (arena slab) · `gateAfter:14 returnTo:15`
> Quitting A&O is a breach of contract, and A&O litigates with ordnance. A Founder-warden walks the slab
> with a non-compete bolted to its chassis: company property does not resign. Stand with the man who just
> changed sides and make the clause unenforceable.
- **Hook:** **Rust defects** (`captiveHero` promotion). **Career:** Rust's first life-event (the
  depreciated-asset trauma) fires.

### XVI — THE SEVERANCE PACKAGE · win-verb: `razeAll` / `survive` · tech
> They expensed Rust the quarter he turned fifty and kept his face for the brochure. Now they want the
> chassis back. A recovery division rolls in with the paperwork pre-signed — and Rust, reading his own
> file off their network, goes quiet at one line: the founder who signed his layoff hasn't aged in a
> render since the year he supposedly died. Defend your new asset. Start asking what Tusk actually is.
- **Reveal:** first seed that **Tusk re-instantiates.**

### XVII — THE GROWTH TEAM · win-verb: `escort`/`reachAndHold` (Nino reaches the cell) · tech (open-plan)
> A&O's purge runs on a person. Down in a glass farm called Growth & Velocity, somebody ships faster than
> the algorithm can bill — so they never let him leave, and his throughput is the engine zeroing your dead.
> Walk Nino through the open plan to the desk they chained him to. Free the fastest hands in the wasteland
> and point them at the clock.
- **Hook:** **Rescue Zeca** (Nino-proximity, Biba pattern). **Career:** Zeca joins the hero track; Overclock
  previews on the walk out.

### XVII.5 — THE PERFORMANCE REVIEW · win-verb: `defeatVillain` (protect Zeca) · tech + ice · `gateAfter:16 returnTo:17`
> Attrition has a department. A&O dispatches a reviewer to mark Zeca's departure as a performance issue,
> permanently. He cannot fight — he can only run the clock. Keep him alive in the cold while you close
> the reviewer's file for good.
- **Career:** Zeca's first life-event (priced-at-exposure trauma).

### XVIII — THE VELOCITY TRAP · win-verb: `survive`/`winBy` race · tech + ice
> Tusk read the same logs you did and moved the purge up a quarter. The only counter to his speed is yours.
> Build into the teeth of a push that is faster than anything A&O has thrown, outpace it on the back of one
> burnt-out prodigy, and prove the Overclock is worth the body you're spending to protect it.
- **Hook:** first map tuned to **assume the Overclock aura** (race clocks set for it).

### XIX — THE DATA VAULT · win-verb: `razeAll`/`winBy` (Overclock-cracked) · tech + ice (cold-storage)
> The dead are not in the ground; they are in a vault, encrypted, booked as inventory. Zeca cracks Upstream
> Custody in the time it takes their security to file the alert — and inside, behind every churned name you
> came for, sits one more backup the fund never meant you to see: the founder's. The keys to the dead are
> the keys to the man. Take them both. You hold the wall now; you also hold the only copy of Tusk that can
> ever be deleted.
- **Pivot:** the dead are **saved from the purge**; **Tusk becomes mortal.** Reborn untouched — the *pool*
  is now safe.

### XX — THE BURN RATE · win-verb: `survive`/`escort` (starved economy) · tech + grass (HUB approaches)
> Stripped of his foundry and his vault, Tusk stops sending departments and triggers the purge by hand —
> then comes for the keys himself, with everything the fund can still field. No funding, no reinforcements,
> one truck of the dead and a road home. Spend everything you have left to still exist next quarter.
- **Both heroes load-bearing.** **On win:** backups secured behind your lines.

### XXI — THE OFFSITE · win-verb: `razeAll` · tech + ice (frozen spaceport)
> Tusk always had an exit: a launch site on the ice, soul-servers fueled for orbit, a backup of himself
> halfway to a planet he bought to die on. Burn the offsite. Ground the diaspora. Make the man who turned
> death into a migration event stay on the surface and field his own body for once.
- **Hardest Musk-satire beat.** **Memorial:** the names he would have migrated and billed.

### XXII — THE GOLDEN PARACHUTE · win-verb: `razeAll` (under purge clock) · tech (bunker + keynote stage)
> One asset left: the keynote. Tusk takes the stage to IPO the cure for death as a subscription with no
> cancellation he doesn't own, and Biba finally says it into his own microphone — he is what she built,
> wearing the man who paid for it. Raze the campus, crash the launch. As the last wall falls he does the
> only thing a backup can do under fire: he climbs into the biggest body A&O ever made and reboots it.
- **Reveal:** full Tusk. **Quest:** `heroesAlive` (NINO, BIBA, RUST, ZECA).

### XXIII — THE LIQUIDATION EVENT · win-verb: `defeatVillain` (`finale:true`, REX re-skin) · tech (arena)
> The foreclosure that walks has a man inside it now, and you finally own the file that says he stays dead.
> One REX — the foundry that would have built a hundred is ash. One body that can tank it — the founder
> they threw away is standing in front of yours. Liquidate Dell Tusk. Take the IPO. Ring the bell in an
> empty room and feel exactly nothing, because the wall is still the wall, and you only ever got to write
> three of them home.
- **Finale.** REX routing 1:1 (`finale:true` → IPO on victory). Reborn remains the player's standing,
  scarce HUB choice — **never** unlocked or expanded by this win.

---

## 6. Systems & build order

Tagged **`[MAP]`** (map-data, `starleft-mapmaker`), **`[ENG]`** (engine code), **`[ART/VOICE]`**
(`starleft-unit-forge` / `starleft-lore-forge`). Dependency-ordered.

1. **`[ENG]` Finale re-routing (do FIRST — it gates everything).** REX currently routes as the finale
   "past the linear track" (`js/villains.js:817` `if(m.finale) return lastEpisodeIndex()+1;`, and the
   marker at `:821` that unlocks the Wake dispatch and routes to the finale). Adding ten numbered episodes
   means the linear track now extends to XXIII *before* REX. Verify `lastEpisodeIndex()` / `gateAfter` /
   `finaleVillainIndex()` still seat REX after XXIII and that `rebornUnlockIdx` (already `>=13`, satisfied)
   is unaffected. **This is a routing check, not a rewrite** — `bossOutcome`'s finale branch is flag-based.
2. **`[ENG]` Vet-carry cap.** `vetCarryCountFor(idx)=2+floor((idx-1)/2)` (`js/career.js:195`) is unbounded
   and, by the high-idx maps, exceeds the HQ `supply:24` (`js/config.js:113`). **Freeze it at 7 for
   idx≥12** via a save-safe per-map `vetCarryOverride:7` (preferred over a global hard-cap; legacy saves
   read the default). Heroes already bypass the cap (`carryoverHeroes[]`), so Rust/Zeca don't count.
3. **`[ENG]` Overclock aura + Crunch burst (Zeca).** Per-frame radius scan scaling the per-`dt` increment at
   the three sites (`js/core.js:24,52`, `js/units.js:886,888,910`). **Host-authoritative + snapshot-safe**
   (clients don't simulate — apply on host, let snapshots carry the result). Thread the crew-build path
   without double-stacking `ASSIST_BUILD_RATE`. Crunch = instant-complete on cooldown via a `net*` wrapper.
   **Tune the aura number first, then set XVIII/XX/XXIII race clocks to *assume* it.** *Medium + balance.*
4. **`[ENG]` Rust STOMP + RECALL.** Stomp reuses `rex.js startStomp/stepStomp` (cheap). **RECALL mutates a
   non-hero ally position → route through a `net*` wrapper / host-only** (`js/net/commands.js`). *Small–med.*
5. **`[ENG]` Post-duel hero recruit (Rust).** On `bossOutcome(state,'win')` spawn Rust as a neutral
   `captiveHero` so `freeCaptives()` promotes him (`js/core.js:208-210`). No new `bossOutcome` kind. *Small–med.*
6. **`[ENG]` Two `heroAura()` lines** (`js/render.js:1426`): Rust `[255,140,60]`, Zeca teal. *Trivial.*
7. **`[MAP]` The 12 map configs** — crawls, summaries, objectives, quests (all shipped quest types),
   biomes, `gateAfter/returnTo/displayEp` routing for the two interludes (reuse `tower_guardian` /
   `ao_enforcer` ids), Rust/Zeca `cfg.captives`/`captiveHero` declarations, and the **Tusk-in-REX crawl
   re-skin** of the existing REX entry. Honor `vetCarryOverride:7`. Verify each map's enemy count equals
   its objective's stated base count (mapmaker validator).
8. **`[ART/VOICE]` Sprites** — Tusk (keynote + in-REX-cockpit), Rust as boss + as hero Founder Mech, Zeca as
   the gifted-Intern sheet → `starleft-unit-forge` (DEF wiring, production/no-production, muzzle calibration
   where relevant). Reuse the `_ao` green recolor for A&O sub-brand enemies.
9. **`[ART/VOICE]` Dossiers + voice lines** — fixed dossiers for Rust & Zeca, life-events (depreciated-asset;
   priced-at-exposure), selection barks, and Tusk's keynote taunts → `starleft-lore-forge` (append-only
   contract; freeze-at-mint).
10. **`[ART/VOICE]` TTS narration** — new crawls **append at idx 13+**, so existing `crawl/ep_NN.mp3` clips
    never re-point (no renumber). Record the new crawls via mapmaker Phase 7 (the "rod" narrator).

**Reborn — explicit non-change.** Resurrection is shipped and live (`js/hub.js:1959-2047`,
`rebornUnlocked()` at `:1959`). Arc 3 changes **none** of `rebornUnlocked()` / `wakeAppearIdx` /
`rebornUnlockIdx` / the caps. (A *visibly-distinct* Reborn sprite/voice/scarred-mind ability — today
`hubSpawnReborn` reuses `r.type` with a `u.reborn` boolean, `js/hub.js:2032` — is a separate optional
`unit-forge` fast-follow, **not** part of this arc.)

---

## 7. Tonal guardrails

- **Dark, devastated, Hades — never bright.** Deep blacks, cold teals, red/violet accents; coolant-as-death.
- **Hollow victory.** XXIII ends on nothing earned: the IPO is yours and it is ash; you saved the pool but
  still write only three home. No sunrise, no team-hug.
- **Tusk is never redeemed or pitied.** He is capital wearing a face; his defeat is a write-off. Do not
  give him a tragic backstory beat that asks for sympathy.
- **Rust's humour is gallows, not hope-core.** Jokes about dental, vesting, foreclosure — relief, never
  optimism.
- **Zeca's speed is grief with a stopwatch.** His gift is a wound; the satire is that capital turned a
  prodigy into a billing engine.
- **Reborn stays scarce (3 ever) and never arc-gated.** The wall keeps most of them. That permanence is the
  emotional engine — do not soften it.

---

## 8. Open decisions (resolved this session)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Arc length | **~10 numbered episodes (XIV–XXIII) + interludes** (~12 maps). |
| 2 | CEO identity | **Dell Tusk**, the **first successful GRAAL write** (re-instantiating backup). |
| 3 | Intern power | **Overclock aura + active Crunch burst.** |
| 4 | Reborn-Cyborg | **Already live; MUST NOT be gated/postponed.** Stakes = Tusk purging the backup *pool*. |

**Still open for whoever builds first (recommendations in §3/§6):** exact Crunch cooldown/strength
numbers; whether XV's duel and XV.5's defection are one map or two; bespoke Tusk-in-REX sprite vs.
taunt-only re-skin; widening `freeCaptives` rescuer beyond Nino (not required).
