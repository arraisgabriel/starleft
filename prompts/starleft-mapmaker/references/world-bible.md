# STARLEFT — World Bible (narrative reference for mapmaking)

This is the canon a new map must stay true to. Source of truth in code: the `MAPS` array and `DEF`
in `js/config.js`, the lore runtime in `js/lore.js`, and the generated corpus in `js/lore_data.js`.
When code and this file disagree, code wins — but the *spirit* below is what keeps the campaign
coherent.

## Contents
1. Premise & tone
2. The moral-descent arc (the seven episodes as story beats)
3. How enemy factions escalate (so a new one slots in)
4. The player faction: satirical roster (units & buildings)
5. The career / veteran / dossier system (the campaign's continuity)
6. Biome-as-mood mapping
7. Glossary: factions, places, jargon
8. Writing rules for crawls & objectives

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
dreams (see §5). The campaign is a **moral descent**, never a heroic rise.

**Art direction (hard constraint, from project memory):** everything is dark, devastated,
Hades-inspired — **never bright**. Deep blacks, cold greys, cold teals, with red and eerie purple
accents; volcanic reds and frozen blue-greys where the biome calls for it. Victories are hollow;
losses are real. No clean triumph, no sunlight, no hope-core.

---

## 2. The moral-descent arc (current campaign)

Seven episodes today (`js/config.js` `MAPS[0..6]`). The throughline: **you win by becoming the thing
you fought.** Each enemy is a mirror of a later stage of your own corruption.

| Ep | Map name | Enemy | Beat (where the player is, morally & financially) |
|----|----------|-------|----------------------------------------------------|
| I | The Garage | DISRUPTR INC. | Scrappy origin. Plucky underdog, zero revenue, free cold brew. You *are* the disruptors. |
| II | The Silicon Wastes | MEGACORP | You've gone UNICORN. First real enemy: a bloated incumbent. Conquest, not scrappiness. |
| III | The Merger | SYNERGY CORP | "Category leader." Two rivals merge into a hydra. The danger scales; so does your war chest. |
| IV | The Monopoly Endgame | OMNICORP | **The pivot.** You're no longer a startup, you're a threat. OMNICORP is what you've become. |
| V | The Cartel | THE CARTEL | Poetic justice. Your bankrupt victims pool their severance for revenge. You made your own enemies. |
| VI | The Hostile Board | THE BOARD | Betrayal. The people who sign your paychecks stage a coup. The real enemy was capital all along. |
| VII | The Dunes and the Drifts | THE CONGLOMERATE | Apocalyptic finale. All survivors die in a nuke explosion; eight campuses around a dead sea. The last quarter. |

A new chapter must know which of these beats it sits next to, and bridge them. Inserting between IV
and V, for example, means: player at peak power, monopoly just consolidated, the first cracks of
backlash beginning — write to *that*.

**If extending past VII:** the descent was nowhere triumphant. Every one is dead because a nuke exploded, all the career units included. The startup failed and you have to start over. At the end of episode' VII everyone dies and the player has to build another company. 

After that, the story arch for the next 7 episodes, to the episode 14, revolves around the company trying to research the digital cure for imortality. A chip that will alow conscience transfer between human and machine bodies. At the end of episode 14 the player MUST chose one of the deceased career units to live again as a Reborn Cyborg.


---

## 3. How enemy factions escalate

The ladder so far: **rival startup → bloated incumbent → merged rivals → the monopoly you became →
your revenge-seeking victims → your own investors → all of them fused.** The logic is *the enemy
gets closer to home and harder to morally separate from yourself.*

To invent the coherent new enemy faction `A&O`:
- Name it in the **corporate-menacing register**: the company `A&O` or `Alpha & Omega`.
- Give it a one-line identity that satirizes a real VC/corporate cartel like the paypal gang (antitrust, private equity rollups, activist investors, IPO mania, layoffs-as-"rightsizing", AI hype, acquihires).
- Make it reflect the player's current stage. Early = external and beatable. Late = internal,
  mirror-like, almost indistinguishable from you.
- **IMPORTANT!!! All episodes from now on will fight A&O**.

The enemy's `defenders` count and `extraBarracks` flags scale how entrenched each campus is.

---

## 4. The player faction: satirical roster

Use these names and voices in crawls and objectives so flavor stays consistent. (Stats live in
`DEF`, `js/config.js`.)

**Resource:** *Funding* — venture capital, a brilliant purple crystal you mine.

**Worker**
- **Intern** (🧑‍💻 worker) — "Mines Funding 'for the exposure.' Builds things. Equity will never vest."

**Combat (People Ops / barracks tier)**
- **Growth Hacker** (🚀 soldier) — "Moves fast and breaks things — primarily skulls."
- **Consultant** (💼 ranger) — "Bills $400/hr to lob synergy buzzwords from a safe distance."
- **Recruiter** (🧑‍🏫 healer) — "Heals burnout. 'We're like a family.'"
- **Hustler** (🛹) — cheap fast harasser.
- **Lobbyist** (🎩) — heavy long-range sniper; one devastating shot, long reload.

**Vehicles (The Garage / factory tier)**
- **Food Truck** (🚚) — "Free cold brew & napalm." Flame cone.
- **Auditor** (📊) — siege; "deploys spreadsheets into a long-range due-diligence cannon."
- **Founder Mech** (🦄) — "A visionary in a 12-ft exosuit."

**Air (Launch Pad / starport tier)**
- **Courier Drone** (🛸) — flying healer, "same-day delivery of medkits and morale."
- **Buzzword Bomber** (🛩️) — capital airship, "rains cyan ordnance on the campus below."

**Buildings**
- **Open-Plan HQ** (🏢) — stores Funding, onboards Interns, fires the odd rooftop warning shot.
- **People Ops** (🎯 barracks) — the "recruiting" department.
- **Legal Team** (⚖️ turret) — "Fires cease-and-desist letters at trespassers on your IP."
- **Satellite Office** (📡 outpost) — scrappy forward branch / deposit point.
- **The Garage** (🔧 factory) — vehicle bay.
- **Launch Pad** (🚀 starport) — builds Courier Drones and Buzzword Bombers.

Enemy bases are framed as **campuses / HQs / strongholds**; destroying them is **liquidating** them.

---

## 5. The career / veteran / dossier system (continuity engine)

This is what makes STARLEFT a *campaign* and not seven disconnected matches — lean on it for
narrative cohesion. (Runtime: `js/career.js`, `js/lore.js`; data: `js/lore_data.js`.)

- Combat units earn XP and level **1→30**. Per level: +damage, +HP; high levels self-heal. Ranks are
  corporate tiers (Associate → Junior → Mid-Level → Senior → Staff → Director).
- At **level 2** a unit is assigned a procedural **dossier**: a name, a **hometown** (one of ~51
  devastated zones), a **family** member left behind, a **trauma**, a **dream** (almost always
  impossible), and maybe a **crime**. At each further level a **life event** woven from that
  backstory is logged.
- **Veterans carry across maps.** After each victory the player picks the top N survivors to bring to
  the next chapter (N grows through the campaign). They keep their levels, dossiers, and dreams.
- **The fallen are remembered.** Dead veterans go to a memorial that persists across the campaign,
  each tagged with whether their dream was fulfilled or not.

Why this matters for a new map: the crawl and objective can (and should, when natural) acknowledge
that the player arrives with **named survivors** of past battles, that **the fallen** are mounting,
that these are **people** chasing dreams the war keeps deferring. A line like "the ones who made it
this far carry names now, and a list of the ones who didn't" ties a new chapter into the whole.

Do **not** redefine or renumber `lore_data.js` events when adding a map — units reference event
indices; that corpus is append-only and unrelated to map data.

---

## 6. Biome-as-mood mapping

Geography is narrative in this game. The established pairings (recipes in `map-schema.md`):

| Biome | Mood / story use | Used in |
|-------|------------------|---------|
| `grass` | Scrappy origin, deceptive calm, "before it got bad" | I, III (flooded) |
| `desert` (+grass) | Brutal scaling, exposure, the wastes | II |
| `tech` | You've become the monopoly — dark server-farm, coolant pools | IV |
| `volcanic` | Revenge, scorched ruin, lawlessness | V |
| `ice` | Betrayal, corporate winter, things frozen over | VI |
| `desert`+`ice` w/ `centralSea` | Apocalyptic end — frozen north, burning south, a dead sea between | VII |

Pick the biome that *means* the beat. A betrayal chapter wants winter; a revenge chapter wants fire.

---

## 7. Glossary

**Enemy factions (in order):** DISRUPTR INC., MEGACORP, SYNERGY CORP, OMNICORP, THE CARTEL, THE
BOARD, THE CONGLOMERATE.

**Places (hometowns — flavor for dossiers/crawls):** Lagos Overcity, the Detroit Reclamation, the
Manila Floodline, the Cairo Microgrids, the Delhi Microgrids, Nizhny Undercity, New Songdo Freeport,
the Bangalore Heat-Sinks, the Murmansk Docks, the Glitch Sprawl, Sector-7 Arcology, Kowloon Stack,
the Aral Flats, Junktown-9, Camp Perpetual, Drift Station Ophir, the Volga Dead-Zone, the Rustbelt
Tiers — and ~30 more in `lore_data.js`. All imply a specific flavor of devastation or corporate
control. Reuse these; don't invent bright places.

**VC / startup jargon (the satirical vocabulary):** Funding, runway, pitch deck, Series B, UNICORN,
"category leader", synergy, circle back, move fast and break things, exit strategy, IPO / go public,
acquisition, vesting / equity cliff, all-hands, quarterly review (= layoffs/executions), antitrust,
disrupt, liquidate, hostile takeover, synergistic leadership.

**Recurring imagery:** debt (moral/financial/family), severed comms ("the line went silent"),
erased records, coolant/cold as death, hollow victory, the board always watching.

---

## 8. Writing rules for crawls & objectives

**`crawl.text`** (the opening scroll):
- Second person ("your startup", "you"). Star-Wars-crawl cadence — a few short paragraphs.
- Open by picking up the player's state from the previous chapter (richer, more powerful, more
  hated). Name the new enemy faction and what it is. End on a dark, propulsive line.
- Dark cyberpunk-startup satire throughout. Black comedy is welcome; triumph is not. Wins are framed
  as grim necessity, not glory ("There is no exit strategy but victory....", "Vest, or die.").
- Existing crawls use literal `\n\n` between paragraphs (or a template literal with real newlines).
  Emoji are used sparingly for punch (🦄). Match the surrounding style in `js/config.js`.

**`crawl.episode` / `crawl.title`:** `'EPISODE <Roman>'` and an uppercase title
(`'THE MONOPOLY ENDGAME'`). The Roman numeral must match the map's position and its `name` prefix.

**`objective`** (terse HUD line): names the faction, states exactly how many campuses/HQs/strongholds
must fall (this number must equal the placed enemy count), and may note any special mechanic ("reach
the abandoned outposts to reclaim them"). Imperative, corporate-military: "Liquidate all four."

**Cohesion test:** the faction name should appear in both the crawl and the objective; the stated
base count should match the enemies you place; the chosen biome and difficulty should match the
arc position. The validator checks the first two automatically.
