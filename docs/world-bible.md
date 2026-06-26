# STARLEFT — World Bible (official canonical narrative reference)

This is the **canon** every map, unit, hero, dossier, and crawl must stay true to. It is the official
game world bible: it lives here in `docs/` (not inside any one skill) so every process can reuse it —
the **`starleft-mapmaker`**, **`starleft-unit-forge`**, and **`starleft-lore-forge`** skills all read
this file, and so should any future tool that writes story.

Source of truth in code (when code and this file disagree, **code wins** — but the *spirit* below is
what keeps the campaign coherent):
- **`js/maps_data.js`** — the `MAPS` campaign array (every episode's `crawl`, `summary`, `objective`,
  enemy, biome, heroes/captives), extracted from config.js. **`js/config.js`** — `DEF` (unit/building stats + flavor) and terrain/biome constants.
- **`js/lore.js` + `js/career.js`** — the career/XP, dossier, memorial, hero-carryover, and
  veteran-carryover runtime.
- **`js/lore_data.js` + `js/dialog_data.js`** — the append-only life-event corpus, hometown/name
  pools, barks, and the pre-rendered voice-clip index.
- **`js/hub.js`** — the H.U.B. campaign meta-layer (extraction, M3rit$, ULTRA, condos, M.D.C.,
  Training Grounds).

## Contents
1. Premise & tone
2. The moral-descent arc (Episodes I–XVI as story beats)
3. How enemy factions escalate
4. The player faction: satirical roster (units & buildings)
5. The H.U.B. — the campaign meta-layer between missions
6. The career / veteran / dossier / memorial system (continuity engine)
7. Biome-as-mood mapping
8. Glossary: factions, places, jargon
9. Writing rules for crawls, summaries & objectives

---

## 1. Premise & tone

STARLEFT is a **dark cyberpunk RTS that satirizes startup culture and venture capitalism**. You play
a scrappy, venture-backed **STARTUP** in a collapsed corporate-feudal near-future. "Funding" (venture
capital, rendered in-world as a glowing purple crystal) is the gatherable resource; your workers are
unpaid **Interns**; your army is made of corporate job titles weaponized. You grow from underdog to
monopoly to tyrant — every level is a **hostile takeover** dressed up as a business transaction
("disrupt", "liquidate", "acquire their assets by force").

**Tone:** grim, cynical, darkly funny, and — crucially — **humanized**. Beneath the satire, the
individual soldiers are real people from devastated places with families, traumas, and impossible
dreams (see §6). The campaign is a **moral descent**, never a heroic rise.

**Art direction (hard constraint, from project memory):** everything is dark, devastated,
Hades-inspired — **never bright**. Deep blacks, cold greys, cold teals, with red and eerie purple
accents; volcanic reds and frozen blue-greys where the biome calls for it. Victories are hollow;
losses are real. No clean triumph, no sunlight, no hope-core.

The campaign runs in **two arcs**. The first (Episodes I–VII) is the *hostile-takeover ladder*: you
climb from garage to monopoly to tyrant, and it ends not in victory but in mutual annihilation. The
second (Episodes VIII onward) is the *resurrection arc*: you rebuild from the ash and chase a literal
cure for death — only to find your enemy has already turned the afterlife into a subscription.

---

## 2. The moral-descent arc (current campaign)

**Sixteen numbered episodes ship today** (Episodes I–XVI in `js/maps_data.js`), plus five `.5` **interludes**
appended to the `MAPS` array and routed between the numbered beats (`gateAfter`/`returnTo`/`displayEp`), and
several **deferred villains** who surface mid-map. The current frontier is **Arc 3 Block 1** (Eps XIV–XVI),
which closes on a `toBeContinued`; everything past XVI is designed but unshipped (see the Arc 3 note below).
The throughline of Arc 1: **you win by becoming the thing you fought.** Each enemy is a mirror of a later
stage of your own corruption. Arc 2 inverts it: having destroyed everyone, including yourself, you try to
undo death — and discover death is just another thing capital has already priced. **Arc 3** is *A&O strikes
back*: capital finally wears a face and moves to foreclose the cure and erase the dead a second time.

| Ep | Map name | Crawl title | Enemy | Biome | Beat (where the player is, morally & financially) |
|----|----------|-------------|-------|-------|----------------------------------------------------|
| I | The Garage | THE MINIMUM VIABLE PRODUCT | DISRUPTR INC. | grass | Scrappy origin. Pitch deck, zero revenue, free cold brew. Plucky underdog vs a rival startup. (Tutorial: long peace.) |
| II | The Silicon Wastes | THE HOSTILE TAKEOVER | MEGACORP | desert+grass | You've gone UNICORN 🦄 — overvalued, out of patience. First real enemy: a bloated incumbent. Conquest, not scrappiness. |
| III | The Merger | THE MERGER | SYNERGY CORP | grass (flooded) | "Category leader." Two rivals merge into a three-campus hydra. War chest overflowing; danger scales with it. |
| IV | The Monopoly Endgame | THE MONOPOLY ENDGAME | OMNICORP | tech | **The pivot.** No longer a startup, you're a *threat*. OMNICORP — owns the cloud, the ads, the antitrust lawyers — is what you've become. Go public, or go home. |
| V | The Cartel | THE CARTEL | THE CARTEL | volcanic | Poetic justice. Your bankrupt victims pool their severance into a coalition sworn to disrupt the disruptor. You made your own enemies. |
| VI | The Hostile Board | THE HOSTILE BOARD | THE BOARD | ice | Betrayal. The people who sign your paychecks stage a coup for "synergistic leadership." The real enemy was capital all along. Vest, or die. |
| VII | The Dunes and the Drifts | THE DUNES AND THE DRIFTS | THE CONGLOMERATE | desert+ice, dead sea | Apocalyptic finale of Arc 1. Every survivor merges into one; eight campuses ring a dead sea. The last quarter — and it ends in **the flash** (a nuke that takes everything and everyone). |
| VIII | The Down Round | THE DOWN ROUND | A&O | tech+grass (the crater) | **Hard reset.** The flash erased the campuses, the war chest, and the names you carried. You come to broke in the crater of your own empire. A&O bought your wreckage at auction. NINO walks back in. Rebuild from nothing. |
| IX | The Proof of Concept | THE PROOF OF CONCEPT | A&O | tech+ice (cryo lab) | Regrowth on a stolen blueprint: the **GRAAL** — a chip that writes a dying mind into another body, metal if it has to be. The names on the memorial stop looking final. First chapter of the long immortality arc; ship a proof of concept before A&O repossesses it. |
| X | The Acquihire | THE ACQUIHIRE | A&O | tech (prison-office) | **Infiltration / rescue.** No economy, no funding — only Nino and the veterans you carried this far. Punch down A&O's open-plan prison to free **BIBA**, the architect A&O built the GRAAL around — and who sabotaged it. The carried roster's time to shine. |
| XI | The Launch | THE LAUNCH | A&O | tech (coolant-sea peninsula) | **The pilgrimage.** A blueprint isn't a factory, and A&O owns the only one that works: the **DARK TOWER**, a black spire on a peninsula where the GRAAL writes the dying into fresh metal and the dead into product. Seize it before the keynote ships. *"It's time to bring them back."* |
| XII | The Siege Line | THE SIEGE LINE | A&O | tech+ice | **Arc 2 climax setup.** You hold the GRAAL and give the product away, so A&O stops litigating and marches: forward staging bases creep up the approaches to the H.U.B. to level the Wake. Shatter all six and break the assault before it reaches the gates. |
| XIII | The Liquidation | THE LIQUIDATION | A&O | tech | **Arc 2 climax / Arc 3 pivot.** A&O fields **REX** — a five-story walking foreclosure-mech — to raze the Wake itself. Kill it before it reaches the H.U.B. (Not the campaign finale; REX is A&O's weapon, and it foreshadows who will pilot the next one.) |
| XIV | The Recall Notice | THE RECALL NOTICE | A&O | tech | **Arc 3 opens.** A&O files **CHAPTER ELEVEN** and gives capital a face: **DELL TUSK**, managing partner, who calls the flash "a migration event" and the memorial "a liability we're rightsizing." Your company and your dead are declared delinquent inventory. Hold the H.U.B. perimeter, or raze four repo camps. |
| XV | The Foundry Raid | THE FOUNDRY RAID | A&O | tech+ice (coolant coast) | Raze five foundry campuses to break Tusk's Founder-Mech assembly line, then out-duel its contracted test pilot — **PEDRO "RUST"**, who reads his own write-off file mid-fight and changes sides. |
| XV.5 | The Non-Compete | THE NON-COMPETE | A&O (Founder-warden) | tech | *Interlude.* A&O litigates Rust's resignation with ordnance — "company property does not get to resign." A Founder-warden hunts him; keep Rust alive. His first deployment as your hero. |
| XVI | The Severance Package | THE SEVERANCE PACKAGE | A&O | tech | A&O's recovery division comes to repossess Rust; raze five bases and put down the returning **EX-TERMINATOR**. Reading Tusk's file, Rust goes quiet at one line — the founder "hasn't aged in a render since the year he supposedly died." Ends on `toBeContinued`. (Current shipped frontier.) |

A new chapter must know which beat it sits next to, and bridge them. Inserting between IV and V, for
example, means: player at peak power, monopoly just consolidated, the first cracks of backlash
beginning — write to *that*. Inserting inside Arc 2 means staying inside the immortality arc against
A&O.

**Interludes & deferred villains.** Five `.5` **interludes** ship between the numbered beats — III.5 THE
CONTRACTOR, VIII.5 THE LAND GRAB, IX.5 THE RECOVERY AGENT, X.5 THE EXTRACTION CLAUSE, XV.5 THE NON-COMPETE —
each a short, focused mission (a duel, a hold, an escort) appended to `MAPS` and slotted in by routing
(`gateAfter`/`returnTo`/`displayEp`), not by array position. Some numbered episodes also end on a **deferred
villain** who only surfaces once the main objective is met: THE SEVERANCIER closes Ep VII, **RUST** is the
duel that ends Ep XV, and THE EX-TERMINATOR caps Ep XVI. (THE EX-TERMINATOR is a recurring A&O nemesis boss —
keep him in his native dark sprites; never recolor him.)

**The flash (end of Arc 1).** Episode VII's "last quarter" ends in mutual annihilation: a nuclear flash
takes everything — the campuses, the war chest, **and every career unit**. The startup *fails*. The
only thing that survives is the **memorial** of the fallen (see §6). This is canon, not a defeat
screen: Arc 2 opens inside the crater the flash left.

**Arc 2 — the resurrection arc (Episodes VIII onward).** From the crater forward, the company chases
the **digital cure for death**: the GRAAL, a chip for transferring consciousness between human and
machine bodies. **From Episode VIII on, the standing enemy is always A&O** (§3). The shipped beats
(VIII → XIII) run: rebuild broke from the crater → steal & prototype the GRAAL → rescue its architect
(Biba) → seize the **Dark Tower** and the GRAAL with it → bring the dead home at the **Wake** → A&O drops
the lawyers and marches (the **Siege Line**) → and fields **REX**, a five-story walking foreclosure, to raze
the Wake (the **Liquidation**) — the hand-off into Arc 3.

**Where Arc 2 was heading (now shipped — see the update below).** The arc's intended destination was the
moment the player **must choose one fallen career unit from the memorial to live again as a Reborn Cyborg**,
the first real consciousness-transfer. The game foreshadows this in voice lines ("Five stars or no
resurrection. Your choice.", "I built the chip so the wall stops being final."). This **shipped not as an
episode but as a standing H.U.B. system** — the Wake (see the next paragraph). Note that this climax is a
**system, not just map data**: the death-reset at the flash,
the hero/carryover overrides, and any Reborn-Cyborg unit type live in code (`career.js`, `lore.js`,
`units.js`, `config.js` `DEF`). A map can carry the *story* (crawl, A&O enemy, objective, biome); the
mechanic is separate code work. Keep new chapters honest to the descent — **never** redemptive, bright,
or triumphant.

**Update — the Reborn-Cyborg system is now SHIPPED and STANDING (not arc-gated).** The Wake (the H.U.B.
resurrection tower) is live: it appears at `CAMPAIGN.nextMapIndex >= 11` and resurrection unlocks at
`>= 13` (`js/hub.js`), letting the player write a chosen fallen veteran home — **3 ever, 1 at a time**,
for M3$ + write-time. No future chapter switches it on; it is a permanent, scarce H.U.B. choice. Any
chapter touching resurrection must protect this — its stakes are about the *backup pool* the dead are
written back from, never about granting the player resurrection they already have.

**Arc 3 — A&O strikes back (Eps XIV–XXIII; design in `docs/story-next-steps-ceo-arc.md`).** With the
resurrection cycle closed (Biba + the cyborgs aboard, the Wake live), A&O finally gives capital a face:
**DELL TUSK**, its managing partner — and secretly **the first successful GRAAL write**, a re-instantiating
backup who wants to *own* the cure because he *is* it (the player's dark mirror; never redeemed). His
**PROJECT CHAPTER ELEVEN** moves to foreclose the company that stole the GRAAL and **purge the upstream
backup pool** so the dead can never be written home again. Across the arc the player reaches and recruits two
A&O cast-offs who are literally the keys that dismantle his plan: **PEDRO "RUST"**, a gallows-humour
Mechfounder hero (a hero Founder Mech, recruited by boss-duel→defection) whose foundry raid strips Tusk's
mech army so the finale fields one REX, not a swarm — *he makes the finale survivable*; and **ZECA
OKONKWO**, a burnt-out Intern prodigy (an Overclock-aura + Crunch-burst tempo accelerator, rescued
Biba-style) whose vault heist seizes the custody keys — including Tusk's own backup — *so Tusk can finally
stay dead* (**Zeca makes Tusk killable**). The finale **re-skins the existing REX superboss as Tusk's escape
vehicle** (`finale:true` routing unchanged). Stay honest to the descent: hollow victory, the wall still
keeps most of its names.

> **Shipped vs. planned (Arc 3).** **Block 1 (Eps XIV–XVI) is SHIPPED:** Tusk is introduced and named (XIV),
> the foundry is raided and **Rust** recruited by duel→defection (XV/XV.5), and A&O's recovery division comes
> for him (XVI) — the block ends on a `toBeContinued`, the current campaign frontier. **Block 2+ (Eps XVII–XXIII)
> is designed but NOT yet shipped** — that is where **Zeca** is rescued (XVII), the backup vault is cracked
> (XIX), and Tusk is run down into REX (XXII–XXIII). See §6 for both heroes.
>
> **⚠ Canonical Zeca secret (seed early, reveal late; Zeca does NOT know yet):** Zeca was raised an orphan as
> Tusk's own personal intern / chore-boy, wired with **Tusk-given implants** that grant his Overclock *and*
> **A&O internal access** (the in-fiction reason his Overclock cracks the vault in XIX). The buried truth:
> Zeca is **Tusk's bastard son**, and **Tusk murdered Zeca's mother** to hide him — making the climax literal
> **patricide-by-data**. It is a *monstrous* Tusk beat, never a sympathetic one (he is never pitied). Reveal
> lands at XXII–XXIII alongside the full Tusk reveal. Full canon + cadence: `docs/story-next-steps-ceo-arc.md`
> §3 HERO 2.

---

## 3. How enemy factions escalate

The Arc 1 ladder: **rival startup → bloated incumbent → merged rivals → the monopoly you became → your
revenge-seeking victims → your own investors → all of them fused.** The logic: *the enemy gets closer to
home and harder to morally separate from yourself.* Then the flash burns it all down.

**From Episode VIII onward, the enemy is A&O — and stays A&O.** This is fixed canon:

- **A&O / Alpha & Omega** — *"the fund that buys the beginning and the end."* A venture-capital /
  private-equity cartel (think the PayPal-mafia-as-antitrust-villain register). After the flash, A&O
  files the paperwork before the dust settles, picks up your wreckage at auction, and calls it a
  *portfolio*. Across Arc 2 it is the entity manufacturing the GRAAL, caging its architect, and monetizing
  resurrection as a subscription — the late-stage mirror: internal, almost indistinguishable from what you
  are. In Arc 3 it moves to foreclose the company outright and purge the dead a second time (§2).
- **All Arc 2 episodes fight A&O.** Do not invent a new standing enemy for a post-VII chapter; the beat
  is the player vs A&O. (A *sub-brand* or named campus of A&O is fine for flavor.)
- **Arc 3 — A&O wears a face.** The enemy is still A&O, but it finally has a managing partner: **DELL TUSK**
  (§2). Arc 3 leans hard on **A&O sub-brands** as the per-episode antagonist skin — *Asset Recovery &
  Reconciliation* (XIV), *Fabrication & Founder Programs* (XV), *Repossession & Recovery* (XVI), and (planned)
  *Growth & Velocity*, *People Ops*, *Upstream Custody*. Its enforcement is no longer just lawyers but a
  **foreclosure-mech army** stamped from one foundry, fronted by recurring mech bosses (REX, the EX-TERMINATOR,
  Founder-wardens). Tusk himself is capital wearing a man — defeating him is a *write-off*, never a death that
  earns sympathy.

If you ever do need a brand-new faction for an open beat the bible doesn't cover, name it in the
**corporate-menacing register** (`DISRUPTR INC.`, `OMNICORP`, `THE BOARD`), give it a one-line identity
that satirizes a real VC/corporate pathology (antitrust, PE rollups, activist investors, IPO mania,
layoffs-as-"rightsizing", AI hype, acquihires), and make it reflect the player's *current* stage of
corruption. Early = external and beatable; late = internal, mirror-like.

The enemy's `defenders` count and `extraBarracks` flags scale how entrenched each campus is.

---

## 4. The player faction: satirical roster

Use these names and voices in crawls, objectives, and dossiers so flavor stays consistent. (Stats and
the canonical flavor strings live in `DEF`, `js/config.js`; which building hires what is `BUILD_HIRES`.)

**Resource:** *Funding* — venture capital, a brilliant purple crystal you mine in-mission. (The *campaign*
currency spent between missions is **M3rit$ / M3$** — see §5.)

**Worker**
- **Intern** (🧑‍💻 `worker`) — "Mines Funding 'for the exposure.' Builds things. Equity will never vest."

**Combat — People Ops (barracks) tier**
- **Growth Cyborg** (🚀 `soldier`) — "Moves fast and breaks things — primarily skulls. Hates meetings,
  loves disruption." *(Was "Growth Hacker"; renamed to Growth **Cyborg**.)*
- **Consultant** (💼 `ranger`) — "Bills $400/hr to lob synergy buzzwords at the enemy from a safe distance."
- **Recruiter** (🧑‍🏫 `recruiter`, healer) — "Heals burnout. 'We're like a family.' Mends teammates instead
  of fighting." *(Biba is a hero Recruiter.)*
- **Hustler** (🛹 `hustler`) — "Moves fast and breaks things. Cheap, fast, harasses your economy." (Splash;
  fast harasser.)
- **Lobbyist** (🎩 `lobbyist`) — "Buys senators wholesale. One devastating long-range shot, then a long
  reload." (Heavy sniper. *Nino is a hero Lobbyist.*)

**Vehicles — The Garage (factory) tier**
- **Food Truck** (🚚 `foodtruck`) — "Free cold brew & napalm. A flame cone shreds clustered enemies."
- **Auditor** (📊 `auditor`) — "Deploys spreadsheets into a long-range due-diligence cannon. Sieges when
  enemies are near." (Anti-air; siege mode.)
- **Founder Mech** (🦄 `founder`) — "A visionary in a 12-ft exosuit. Hits anything, ground or air."

**Air — Launch Pad (starport) tier**
- **Drugztore Delivery Drone** (🛸 `courier`) — "Same-day delivery of medkits and morale. Flies over
  everything." (Flying healer. *Was "Courier Drone".*)
- **Buzzword Bomber** (🛩️ `bomber`) — "Capital airship. Rains cyan ordnance on the campus below." (Also the
  craft that flies the **extraction** cinematic over your HQ — see §5.)

**Combat buildings (built in-mission)**
- **Open-Plan HQ** (🏢 `hq`) — "Stores Funding and onboards unpaid Interns. Fires the occasional warning
  shot from the rooftop." *Also the extraction point: only units garrisoned inside an HQ survive a win.*
- **People Ops** (🎯 `barracks`) — "'Recruiting' department. Turns Funding into Growth Cyborgs and
  Consultants." (Hires soldier, ranger, recruiter, hustler, lobbyist.)
- **Legal Team** (⚖️ `turret`) — "Fires cease-and-desist letters at anything that trespasses on your IP."
- **Satellite Office** (📡 `outpost`) — "A scrappy forward branch — Interns drop Funding here instead of
  trekking back to HQ, and it houses extra Headcount. Cheaper and flimsier than a
  second HQ." (Deposit point + supply/headcount; no passive income.)
- **The Garage** (🔧 `garage`) — "Vehicle bay. Turns Funding into Food Trucks, Auditors and Founder Mechs."
- **Launch Pad** (🚀 `launchpad`) — "Starport. Assembles Drugztore Delivery Drones and Buzzword Bombers.
  Requires a Garage."

Enemy bases are framed as **campuses / HQs / strongholds / labs**; destroying one is **liquidating** it.
*(The H.U.B.-only structures — Unit Condo, M.D.C., ULTRA Headquarters, Training Grounds — are not built in
combat; they live on the hub map and are described in §5.)*

---

## 5. The H.U.B. — the campaign meta-layer between missions

Between missions the player drops into the **H.U.B. — "Hurban Ultra Buildings"** (`js/hub.js`): a
persistent, non-combat hub map where the campaign's continuity is *managed*, not fought. This is the home
of the carryover/memorial systems (§6) and the economic spine of Arc 2's resurrection R&D. A new map
doesn't place these structures, but crawls and objectives can reference them, and the immortality arc
literally runs through them.

- **Extraction.** When you win a mission (solo), the Buzzword Bomber flies a cinematic over your
  **Open-Plan HQ** (in → hover → out → ~13s panorama → land at the hub). **Only Lv2+ units garrisoned
  *inside* an HQ are extracted** to the H.U.B.; ungarrisoned or sub-Lv2 units are **lost permanently** —
  a real, harsh loss condition that makes you choose who comes home. (Co-op uses a legacy "all but plain
  Interns" rule and cuts straight to the hub, no panorama.)
- **M3rit$ (M3$)** — the campaign currency (`CAMPAIGN.m3`), earned from mission rewards and spent only in
  the H.U.B. (Distinct from in-mission *Funding*.)
- **ULTRA Headquarters** (◆) — the central megabuilding at the hub's heart: *"The company that fabricates
  life for everyone, everywhere."* The architectural presence of the meta-corp; hosts services including
  M3$ **speculation** (gamble on the market — "sometimes it pays out; mostly it calls the loss 'learning'").
- **Unit Condo** (🏙️) — "A vertical dormitory for employees who survived quarterly planning." Houses
  residents; upgradeable in tiers with M3$.
- **M.D.C. — Mission Dispatch Center** (🛰️) — "Walk veterans inside to stage them for the next quarterly
  disaster." Enlist/stage your veterans at a red M.D.C., then launch the next mission from it (capacity
  capped). The crawl `summary` field (§9) is the briefing shown here before launch.
- **Training Grounds** (🎯) — "A neon shooting academy. Lock a veteran mentor in with a junior of the same
  type — both walk out one level above the senior." Same-type pairs within ≤6 levels; up to 6 simultaneous
  sessions; trains over real play time.
- **Implants / style** — M3$ upgrades for individual residents.

---

## 6. The career / veteran / dossier / memorial system (continuity engine)

This is what makes STARLEFT a *campaign* and not a string of skirmishes — lean on it for narrative
cohesion. (Runtime: `js/career.js`, `js/lore.js`; corpus: `js/lore_data.js`, `js/dialog_data.js`. The
**`starleft-lore-forge`** skill owns growing this content under an append-only contract.)

- **Leveling.** Combat units earn XP and level **1 → 30**. Per level: **+15% damage, +33% max HP**. From
  **Level 11** they self-heal out of combat (0.3%/s of max HP, doubling every 5 levels), if 4+ seconds
  untouched. Ranks are corporate tiers: **Associate** (1–4), **Junior** (5–9), **Mid-Level** (10–14),
  **Senior** (15–19), **Staff** (20–24), **Director** (25–30).
- **Dossier (born at Level 2).** A unit is minted a procedural **dossier**: a name, a **hometown** (one of
  ~51 devastated zones, §8), a **family** member left behind, a **trauma**, a **dream** (almost always
  impossible), and sometimes a **crime** (~45%), plus prose origin/assessment paragraphs. At each further
  level a **life event** woven from that backstory is logged in the service record. Events are stored by
  **index** and the corpus is **append-only** — never renumber or mutate `lore_data.js` events; saved units
  reference them. A dossier's content version (`u.lore.v`) is **frozen at mint**, so already-minted
  veterans keep their exact identity even as the pools grow later.
- **Veterans carry across maps.** After each victory the player picks the top **N** survivors to bring to
  the next chapter; **N grows through the campaign** (`vetCarryCountFor(idx) = 2 + floor((idx-1)/2)` — 2
  early, 5+ by the back half). They keep their levels, dossiers, and dreams. (Episode X is an infiltration:
  no economy, the roster *is* the army.)
- **The fallen are remembered.** Dead veterans go to a **memorial** that persists across the whole campaign
  (`fallenVets`), each tagged with whether their **dream was fulfilled** (🕯 toast on death; rendered as
  "The Fallen" in the roster). The flash at the end of Arc 1 sends the *entire roster* here at once —
  *"the memorial is the only thing that scaled."* This is the emotional engine of Arc 2: the names on the
  wall are exactly who the GRAAL promises to bring back.

**Named heroes** (fixed dossiers; carried on a separate hero track that **never counts against the vet cap**
and **auto-deploys every map until the hero dies**):
- **NINO** — a returning **Level-11 Lobbyist** (🎩) from **the Glitch Sprawl**. Ran the lobby in the
  company's first life — bought the votes, wrote the laws, and watched every name he hired end up on the
  memorial wall. *Trauma:* being three streets out when the blast turned the campus into a column of light.
  *Dream:* to see one thing he helped build outlast the money that funded it. *Crime:* authoring the
  legislation that made a hundred rivals simply vanish. He walks back into the crater in **Episode VIII** to
  help rebuild, and leads the break-in in **Episode X**.
- **BIBA** — a **Level-10 Recruiter** (🧑‍🏫), and the arc's deepest secret: a **healer android A&O built to
  research immortality**. Her work *became* **the GRAAL**, and she may be its first success — the "human"
  past she carries (the flooded arcologies of **Lagos-2**, six younger siblings raised on relief credits, a
  first squad triaged out of existence by an algorithm) reads as memory but was very likely **written into
  her**. When she saw what the cure was *for* — the dead leased back by the month, the living worked in
  rented bodies until the lease ran dry — she **sabotaged her own research**, so A&O **filed her in a cell**
  rather than fire the machine that turned on it. *Dream:* to keep one team alive long enough to age.
  *Crime:* designing the chip A&O built to chase immortality — then crippling it when she saw who would pay.
  Freed in **Episode X** (Nino chased the rumor under the sabotage to her); carries from **Episode XI**
  onward, where she names all of this at the Dark Tower. **Seed it, then pay it off:** Eps VIII–X only hint
  (Nino's rumor, a sabotaged blueprint, her own unease) — the full reveal (android origin, written-in
  memories) lands in the Ep XI altar cutscene (`EP11_ALTAR_LINES`). Keep earlier crawls/dialogue from
  stating the android truth outright.
- **PEDRO "RUST"** *(shipped — Arc 3 Block 1)* — a **hero Founder Mech** (🦄 `founder`, deploys around Lv6)
  from **the Detroit-Reclamation rustbelt**. A master mechanic who came up tooling exosuits on a **union
  floor** — "the kind of shop where the whole crew signed every chassis" — until A&O bought the floor and the
  signatures with it and set him building **foreclosure-mechs**. The quarter he turned fifty they booked him a
  **DEPRECIATED ASSET**, wrote him off, and kept his face for the Founder-Mech marketing render. *Trauma:* the
  review that scrapped him beside the machines he tooled. *Dream:* to own one thing outright that no quarterly
  review can ever repossess. *Crime:* welding the chassis that now walk on the people he came up with.
  **Recruited in Episode XV** by boss-duel → defection: A&O fields him as its contracted Founder-Mech test
  pilot, you out-duel him, he reads his own file mid-fight, and he changes sides. He carries from **Ep XV.5**
  onward — a guaranteed armored body every map with **STOMP** (a gap-closing AoE) and **RECALL** (yank the
  most-wounded ally to him). His voice is **gallows humour, never hope-core** ("Wrote me off at fifty. I wrote
  back."; "Tusk is a render. I'm the real thing."). In **Ep XVI** he is the first to name what Tusk is — the
  founder who "hasn't aged in a render since the year he supposedly died." *Narrative load:* his foundry raid
  strips Tusk's mech army to a single REX and his chassis is the only body that survives the finale's stomp —
  **he makes the finale survivable.**
- **ZECA OKONKWO** *(planned — Arc 3 Block 2, NOT yet shipped)* — a near-defenceless **hero Intern** (🧑‍💻), a
  burnt-out prodigy from a **Lagos-Overcity / Manila-Floodline** register who "shipped six quarters in one"
  and "was paid in exposure and a memorial slot." His gift is **speed as grief**: a passive **OVERCLOCK** aura
  that accelerates build / production / gather tempo around him, plus an active **CRUNCH** burst that snaps
  nearby sites to completion. He barely fights — keeping him alive is the tension. **Rescued in Episode XVII**
  Biba-style (Nino-proximity), held in an A&O "growth" sweatshop because his throughput is exactly what makes
  Tusk's purge clock viable; his vault heist (**Ep XIX**) seizes the custody keys that save the backup pool
  *and* hold Tusk's own backup. *Voice:* burnt-out, sardonic ("Speed's a wound. Watch me bleed deadlines.";
  "I shipped the purge clock. Now I break it."). **⚠ Canon secret (Zeca does NOT know yet):** Zeca was raised
  an orphan as **Tusk's own personal intern / chore-boy**, wired with **Tusk-given implants** that grant his
  Overclock *and* **A&O internal access** (the in-fiction reason his Overclock can crack the vault), and is
  secretly **Tusk's bastard son** — **Tusk murdered his mother** to hide the boy. A *monstrous* Tusk beat,
  never sympathetic; the reveal lands at **XXII–XXIII** alongside the full Tusk reveal (see §2 +
  `docs/story-next-steps-ceo-arc.md` §3 HERO 2). **Zeca makes Tusk killable.**

When it's natural, let crawls and objectives acknowledge these living systems — the **named survivors** the
player arrives with, the **mounting fallen**, the **dreams** the war keeps deferring. A line like "the ones
who made it this far carry names now, and a list of the ones who didn't" ties a new chapter into the whole.

---

## 7. Biome-as-mood mapping

Geography is narrative in this game. The established pairings (recipes in the mapmaker's `map-schema.md`):

| Biome (recipe) | Mood / story use | Used in |
|----------------|------------------|---------|
| `grass` | Scrappy origin, deceptive calm, "before it got bad" | I, III (flooded) |
| `desert` (+`grass`) | Brutal scaling, exposure, the wastes | II |
| `tech` | You've become the monopoly — dark server-farm, coolant pools | IV |
| `volcanic` | Revenge, scorched ruin, lawlessness | V |
| `ice` | Betrayal, corporate winter, things frozen over | VI |
| `desert`+`ice` w/ `centralSea` | Apocalyptic end — frozen north, burning south, a dead sea between | VII |
| `tech`+`grass` | The graveyard you farm — the old monopoly's dead server-farm, weeds reclaiming the wreckage; rebuilding from the crater | VIII |
| `tech`+`ice` | Cold, sterile cryo-lab; later a frozen siege-front — tech racks under ice, corporate winter as warfront | IX, XII, XV |
| `tech` w/ coolant seas + a peninsula | The inside of A&O at last — endless black server-farm, no growing thing; a guided corridor or road through it | X, XI |
| `tech` (Arc 3 — foreclosure) | A&O strikes back: the H.U.B. perimeter under repo wave, the coolant-coast **foundry** stamping mechs, the repossession yards — lightless industry, capital come to collect | XIII, XIV, XVI |

Pick the biome that *means* the beat. A betrayal chapter wants winter; a revenge chapter wants fire; an
inside-the-enemy chapter wants the lightless server-farm.

---

## 8. Glossary

**Enemy factions (in play order):** DISRUPTR INC. (I), MEGACORP (II), SYNERGY CORP (III), OMNICORP (IV),
THE CARTEL (V), THE BOARD (VI), THE CONGLOMERATE (VII), then **A&O / Alpha & Omega** (VIII onward — the
standing enemy for the rest of the campaign), which in **Arc 3** finally gets a face: managing partner
**DELL TUSK** (XIV onward), fronting A&O sub-brands and a foreclosure-mech army.

**Arc-2 landmarks & concepts (canon):**
- **the flash** — the nuclear annihilation that ends Arc 1 (Ep VII): takes the campuses, the war chest, and
  every career unit. Referenced as the column of light / the blast.
- **the crater** — what's left of your empire; the setting of Ep VIII, where you rebuild broke.
- **the GRAAL** — A&O's consciousness-transfer brain chip: lifts a mind out of a failing body and writes it
  into another (metal, if it has to be). The cure for *"the only churn that ever mattered."* It is the
  product of A&O's immortality research on **Biba** — her work, which she later sabotaged.
- **the Dark Tower** — A&O's GRAAL factory, a black spire on a coolant-sea peninsula; the altar/goal of Ep XI.
  Also where **Biba** herself was written — the site of the Ep XI reveal.
- **the Continuity Farm / the transfer lattice** *(retired episode content — theme still canon)* — A&O's
  subscription-immortality service (the dead leased into refrigerated bodies, billed for memories that used to
  belong to them — "immortality with a cancellation clause") and the consciousness-transfer infrastructure
  inside it. Authored as Arc-2's Ep XII, **since cut/restructured**: the shipped Arc-2 climax is now Ep XII
  **THE SIEGE LINE** → Ep XIII **THE LIQUIDATION** (the REX duel). The subscription-immortality *idea* stays
  canon (it's how A&O monetizes the cure); don't reintroduce the cut episode itself as live.
- **the memorial / the wall** — the persistent roster of the fallen (§6); the names the GRAAL promises back.
- **the Wake / the Reborn Cyborg** — the Wake is the H.U.B. resurrection tower; a **Reborn Cyborg** is a chosen
  fallen veteran written home through it via the GRAAL. **Shipped and standing** as a scarce, permanent H.U.B.
  choice (3 ever, 1 at a time; see §2, §5) — not a future arc reward.
- **the H.U.B. / "Hurban Ultra Buildings"** — the campaign meta-base (§5). **M3rit$ / M3$** — its currency.
  **ULTRA** — the megabuilding at its center.

**Arc-3 landmarks & concepts (canon):**
- **DELL TUSK** — A&O's managing partner; the first time capital wears a face. Secretly the **first successful
  GRAAL write** (a re-instantiating backup), so he wants to *own* resurrection because he *is* it. The
  player's dark mirror; never redeemed — his defeat is a **write-off**, not a death that earns sympathy.
- **PROJECT CHAPTER ELEVEN** — Tusk's three-plank plan: **repossess** the company (a foreclosure-mech army),
  **purge** the upstream backup pool so the dead can't be written home, then **IPO** resurrection as a
  Tusk-only subscription, forever.
- **the foundry / the Founder-Mech line** — A&O's coolant-coast factory that stamps **foreclosure-mechs**
  ("a repossession on legs"); Rust was made to build it, and Rust's raid (Ep XV) breaks it.
- **REX** — the five-story walking **foreclosure-mech** superboss: A&O's siege weapon at Ep XIII and, re-skinned,
  Tusk's escape vehicle in the planned finale.
- **the EX-TERMINATOR** — a recurring A&O nemesis boss (Eps III.5, XVI and beyond); keep his **native dark
  sprites — never recolor him**.
- **the upstream backup pool / Upstream Custody** — the off-site archive the dead are written home *from*.
  Tusk's purge erases it; Zeca's planned heist (Ep XIX) seizes its **custody keys**, which also hold Tusk's own
  backup — the only way to make him stay dead.

**Places (hometowns — flavor for dossiers/crawls; full pool in `js/lore_data.js`):** the Glitch Sprawl,
Sector-7 Arcology, New Songdo Freeport, the Tallinn server-farms, Lagos Overcity, the Rustbelt Tiers,
Kowloon Stack, the Volga Dead-Zone, Neo-Recife, the Bangalore Heat-Sinks, Drift Station Ophir, the Ångström
Slums, Old Cascadia, the Mariana Habitat, Cinder District, the Karoo Solar Fields, Nizhny Undercity, the
Manila Floodline, Hexa Ward, the Detroit Reclamation, Pole Town, the Aral Flats, Junktown-9, the Osaka
Underlevels, Camp Perpetual, the Andes Lift, Saltgate, the Cairo Microgrids, Vostok Hollow, the Belém
Canopy, Ash Harbor, the Yukon Claims, Mosul Spire, the Faro Tidal Works, Quito High-Town, the Bakken
Derricks, Coil City, the Helsinki Cold-Rows, Dust Concession 12, the Naples Catacombs, Brightwell, the
Chennai Saltworks, Magadan Gate, the Sahel Relay, Tin Alley, the Murmansk Docks, Hollow Mesa, the Jakarta
Stilts, Cobalt Reach, the Reykjavík Vents, Lowtown. (Plus hero-specific variants like *the flooded
arcologies of Lagos-2*.) All imply a specific flavor of devastation or corporate control. Reuse these;
don't invent bright places.

**VC / startup jargon (the satirical vocabulary):** Funding, runway, pitch deck, MVP, Series B, UNICORN,
"category leader", synergy, circle back, move fast and break things, all-hands, quarterly review (=
layoffs/executions), antitrust, disrupt, liquidate, hostile takeover, exit strategy / exit interview, IPO /
go public, vesting / equity cliff, synergistic leadership. **Arc-2 additions:** down round, acquihire, proof
of concept, **churn** (death — "the only churn that ever mattered"), **cap table** ("a cap table wearing a
grief mask"), **portfolio** (your wreckage, bought at auction), **subscription / cancellation clause**
(monetized resurrection), continuity, "rightsizing", repossess, blueprint vs. product. **Arc-3
additions:** Chapter Eleven (bankruptcy/foreclosure), delinquent/depreciated asset, write-off, severance
package, non-compete, recall notice, recovery division, "the adult in the room", "migration event" (mass
death rebranded as data-migration), burn rate, golden parachute.

**Recurring imagery:** debt (moral/financial/family), severed comms ("the line went silent"), erased records,
coolant/cold as death, the column of light, the memorial wall, hollow victory, the board always watching,
and — in Arc 2 — resurrection sold as a product.

---

## 9. Writing rules for crawls, summaries & objectives

**`crawl.text`** (the opening scroll):
- Second person ("your startup", "you"). Star-Wars-crawl cadence — a few short paragraphs.
- Open by picking up the player's state from the previous chapter (richer/more powerful/more hated — or, in
  Arc 2, broker/more haunted). Name the enemy faction (A&O, from Ep VIII on) and what it is. End on a dark,
  propulsive line.
- Dark cyberpunk-startup satire throughout. Black comedy is welcome; triumph is not. Wins are framed as grim
  necessity, not glory ("There is no exit strategy but victory....", "Vest, or die.", "Begin again, or stay
  buried.").
- Existing crawls use literal `\n\n` between paragraphs (or a template literal with real newlines). Emoji are
  used sparingly for punch (🦄). Match the surrounding style in `js/config.js`.
- **Contextual template tokens** are supported and used (e.g. Episode XI): `{token}` substitutes a runtime
  value (`{party}`, `{fallen}`, `{biba}`); `{?key}...{/key}` shows a block only if the value is present;
  `{^key}...{/key}` is the fallback when it's absent. Use these to weave in the carried roster and the fallen
  by name when they exist, with a graceful "you walk the road alone" fallback when they don't.

**`crawl.summary`** (the M.D.C. deployment briefing):
- A **2–4 sentence, spoiler-free** briefing shown on the Mission Dispatch screen *before* the player launches
  the episode. Distill it from the crawl and the arc: name the **stage** (where the player stands now), the
  **enemy**, and the **stakes** — but **never the twist**. No nuke/betrayal/resurrection/who-dies reveals;
  nothing the crawl itself withholds until the player is in-mission. Same dark startup-satire voice as the
  crawl, **plain text** (no `{token}` templating). Think back-of-the-box teaser, not the plot. If omitted,
  the briefing falls back to the first two sentences of the crawl — so write one to control what's shown up
  front.

**`crawl.episode` / `crawl.title`:** `'EPISODE <Roman>'` and an uppercase title (`'THE MONOPOLY ENDGAME'`).
The Roman numeral must match the map's intended **play-order slot** and its `name` prefix. Note that with
append-only authoring (interludes appended to `MAPS`, routed by `gateAfter`/`returnTo`/`displayEp`) the **array
index no longer equals the episode number** — e.g. Ep XIV lives at `MAPS[19]`. For an appended interlude, the
displayed number comes from `displayEp`, not its array position.

**`objective`** (terse HUD line): names the faction, states **exactly how many** campuses/HQs/strongholds/labs
must fall (this number must equal the placed enemy count), and may note any special mechanic ("reach the
abandoned outposts to reclaim them", "free Biba and the intern", "hold the H.U.B. perimeter", "keep Rust
alive"). Imperative,
corporate-military: "Liquidate all four."

**Voiceover.** Each crawl is voiced by a pre-rendered TTS clip keyed by **map array index**
(`assets/audio/voice/crawl/ep_NN.mp3`, the "rod" narrator). It is non-blocking — a missing clip plays silent
— but a shipped chapter should narrate. An *insert* (not append) shifts every later chapter's index, so the
whole tail must be re-rendered (see the mapmaker skill's Phase 7).

**Cohesion test:** the faction name should appear in both the crawl and the objective; the stated base count
should match the enemies placed; the chosen biome and difficulty should match the arc position. The mapmaker
validator checks the first two automatically.
