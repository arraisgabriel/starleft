# THE OFF-HOURS — a HUB life-sim district for STARLEFT

> **Status:** design-only spec (no code). Companion to `docs/story-polish.md` and `docs/save-sync-options.md`.
> **Author intent (locked):** **No Founder/CEO avatar in these scenes** — the player is an unseen director who chooses what each *veteran* says and does. Every scene is **veteran ↔ NPC** (any NPC role) or **veteran ↔ veteran**; NPCs answer in character. Full social web · a blend of authored vignettes + light systemic sim · light, opt-in payoffs.
> **Art direction:** dark / devastated cyberpunk, Hades-inspired, *never bright*. The Off-Hours is a string of after-shift dives in a sprawl that lost the war it's still fighting.

---

## 0. TL;DR

Add a small, campaign-gated **nightlife district** to the H.U.B. — a **dive bar**, a **club**, and a **noodle bar/diner** — where you **direct your veterans through the personal lives they already half-have on paper**: the kin the dossier names, the friends the city already spawned, the bartender who's poured for three rosters of company dead, and each other. **There is no Founder/CEO character.** You are an unseen hand: you pick, line by line, what each *veteran* does; the NPCs answer in character (in a veteran↔veteran scene you direct both, since both are your units). Each venue is a different *kind* of evening, lifted from a different acclaimed life-sim. Scenes **write real life-events into the dossier the player already reads**, and grow a brand-new, save-safe **Relationship Ledger** — the first relationship *state* the game has ever had. A light systemic layer (mood, loneliness, compatibility) decides who "needs a night out" and stages **autonomous background moments** you witness in the world. Payoffs stay small and optional (a morale lift, a deploy-together synergy, a nudge toward a vet's dream). The goal is not power. The goal is that when a veteran joins **The Wake**, you watched them make peace with their kid sister three episodes ago, and it *costs* you.

The rest of this doc is the long version: what the reference games do, why it works, exactly how it maps onto the systems already in this repo, and a phased plan to build it without breaking a single save.

---

## 1. Context & the player fantasy

### 1.1 What already exists (and works)
STARLEFT's H.U.B. is unusually alive for an RTS hub:

- **Living-city NPCs** walk deterministic, closed-form routes — each veteran's named **relative** plus 0–2 **friends**, per-facility **service staff**, and **ULTRA HQ commuters** (`js/npc_lore.js`, `js/hub_npcs.js`). They have professions, hometowns, backstories, and a capped life-event log that accrues over visits.
- **POIs** cover the whole career: condos (housing), MDCs (dispatch), Training Grounds (mentorship), Mental Health (madosis recovery), ULTRA HQ, and **The Wake** (resurrect the fallen as Reborn Cyborgs).
- **Every veteran carries a procedurally-linked dossier** — name, hometown, **family/relative (`rel`/`relName`)**, **trauma**, **dream**, sometimes a **crime** — and a **service record** that grows one woven **life-event per level-up** (`js/lore.js` `rollLifeEvent`). Some events carry light buffs; a capstone fulfills the vet's **dream** (`dreamDone`).
- **The Wake** is the proof-of-concept for emotional weight: a venue whose entire purpose is to make you *feel* a unit's story, and to make death matter (`js/hub.js`, `js/ui.js` Wake menu).

### 1.2 The gap the owner named
> "The POIs are interesting and useful… BUT it is still difficult to create a rapport with veteran units and their HUB life (family and friends)."

The dossier *names* a kid sister "Maria" — and **`hubSyncNpcs` actually spawns her** as a relative NPC who can be **mourning** when the vet falls. But the veteran can never **sit down with her**. You read files; nobody *spends time*. And critically:

> **There is no relationship STATE anywhere in the game today.** `rel`/`relName` is flavor text. The relative/friend NPCs carry only flags + a life-event log. Veterans have **zero** bonds with each other. Attachment is *authored into the dossier* but never *grown by the player's choices*.

### 1.3 The fantasy we're building
**"Author the nights that make a veteran someone you'd grieve."**

You direct, not inhabit. Between deployments you send **Rust** to the bar and choose, line by line, how he finally tells the bartender what he did before the company found him. You walk **Nino** into the noodle place and decide whether he sits with the brother he hasn't spoken to in three episodes — or stays in the doorway with his arms crossed. You put two of your soldiers at the same table and pick, for each of them, the words that make them inseparable — or rivals — over a long campaign. Those nights become **canon**: new lines in the dossier, a relationship that deepens, a dream that finally lands. And because the H.U.B. already remembers the fallen, every choice you make is collateral the game can later spend on you. **There is no "you" in the fiction** — there's the squad, the city, and the choices you author for them.

**Why directing beats inhabiting (here).** Removing the avatar isn't a compromise — it's the *right* attachment model for a roster game. A first-person bond (Hades, Persona) is intense but **singular**: you can only really be one person's friend. An **authorial** bond (The Sims, RimWorld, Wildermyth) scales — you can carry a dozen veterans' inner lives at once *because* you're the showrunner, not a participant. People grieve Sims they only ever *directed*, and RimWorld colonists they never *spoke as*. STARLEFT has a whole roster to make you grieve; the director stance is how you get attached to *all* of them, not just one.

### 1.4 Why this is the right addition *now*
- It **reuses** the dossier, NPC link graph, hub-menu shell, dialog bubbles, voice pipeline, and madosis/capstone hooks — most of the hard parts already exist.
- It **completes** a system the game gestures at but never closes: the relatives, friends, and staff are *already* in the world, already mourning, already commuting. We're giving the veterans a door into those lives and giving the player the pen.
- It is the natural escalation of The Wake: The Wake is about **death**; The Off-Hours is about the **life** that makes death land.

---

## 2. Design pillars & non-negotiables

### 2.1 Pillars
1. **Attachment over power.** The reward is that you *care*. Mechanical payoff is seasoning, never the meal (owner-locked: *light & opt-in*).
2. **Authored warmth on a systemic floor (the "blend").** Hand-written milestone scenes carry the emotional peaks; a light sim fills the valleys with ambient, surprising, unscripted moments so the city keeps breathing between set-pieces.
3. **No avatar — you direct the veterans.** *There is no Founder/CEO/player-character in these scenes.* The player is an unseen director who chooses what each **veteran** says and does; **NPCs respond in character** and are never directly controlled. Every scene is **veteran ↔ NPC** (kin, friend, venue staff, or commuter — *any* NPC role) or **veteran ↔ veteran** (in which case you direct *both* veterans, since both are your units). This is the Sims/Wildermyth "direct your people, the townies react" stance, *not* a first-person host (owner-locked POV).
4. **The full social web, all modalities.** Vets ↔ their kin/friends, vets ↔ venue/staff/commuter NPCs, **and** vets ↔ each other. The district is where the whole graph plays out (owner-locked axis).
5. **Scarcity makes it sacred.** A limited number of nights per visit. You can't develop everyone every time, so each evening is a *choice* (Persona's calendar lesson).
6. **Dark, devastated, funny-in-the-gallows-way.** These are dives in a corporate warzone. The warmth is hard-won and lit by neon through grime.

### 2.2 Non-negotiable engineering constraints (from `CLAUDE.md` / `AGENTS.md`)
Every system below is designed to obey these. They are repeated here because the doc must be *buildable*, not just evocative.

- **Save compatibility is mandatory.** New state defaults to empty/legacy. An old save must load and behave correctly with **zero** Off-Hours data. Missing fields = legacy defaults.
- **Append-only + version-gating doctrine.** Content pools (scene lines, gossip, gifts) grow only by **appending**; a record stamps the **content-version at mint** so already-minted entities never shift identity. This is exactly how `LORE_DATA.versions` / `NPC_LORE.versions` already work (`_poolLens`, `npcPoolLens`). Voice clips are **index-keyed** to lines, so reordering is forbidden.
- **Three netRole paths.** Solo simulates; **host** is authoritative and broadcasts; **client never simulates** gameplay — it renders host snapshots and owns only local UI (selection/camera/menus). All Off-Hours *gameplay mutations* route through the `net*` wrappers in `js/net/commands.js` and are **host-authoritative**; the conversation **UI** is local.
- **Determinism.** All procedural derivations use the game's seeded `makeRng`; **no `Math.random()` in simulated paths**, frozen draw order, so solo/host/client stay byte-identical.
- **HUB routines must stay closed-form.** NPC movement to/from venue tables uses the existing closed-form itinerary system — **never** `hubpoi` commands (`js/hub_npcs.js` constraint).
- **`refreshUI()` signature-rebuild.** Menus rebuild only when their `signature()` changes; never rebuild choice buttons every frame (eats clicks).
- **Art is procedural-fallback-safe.** Don't assume any sprite/audio asset exists; ship procedural fallbacks (the game already does this).

---

## 3. Comparative research — the systems we're stealing from

This is the heart of the doc: **what the best life-sims actually do, why it works, and how it maps onto this HUB.** A master table first, then per-game notes. (Sources in the Appendix.)

> **Note on POV across references:** several of these games *do* put the player in an avatar (Zagreus, the Persona protagonist, the Stardew farmer). We borrow their **structures** — gift loops, rank-up scarcity, thresholded authored scenes — but always re-home the *avatar's* role onto a **veteran** or an **NPC**. Where Hades has "you, Zagreus, gift Nectar to an NPC," we have "you direct a *veteran* to share a drink with an NPC." The relationship is always between two in-world characters; the player is the hand, never a face.

### 3.1 Master mapping table

| # | System (game) | What it does there | Why it works | How it maps into The Off-Hours | Reuses in repo |
|---|---|---|---|---|---|
| 1 | **Nectar → Keepsake → quest → Ambrosia** (Hades) | First gift opens a relationship & returns a gameplay trinket; ~5–6 gifts unlock a personal quest; quest unlocks "hearts" you fill with the rare currency | Couples *mechanical* reward (keepsake) with *narrative* payoff (backstory) so bonding serves both gameplay and story | A first **gift** (a Hades-Nectar-style luxury item) a veteran brings opens *their* bond with an NPC and returns a small **keepsake**; deeper tiers unlock a personal **arc** ending in a capstone | Gift item as economy sink; keepsake → tiny carried buff; arc end → existing `capstone`/`dreamDone` |
| 2 | **Confidants are NPCs** (Hades: Nyx, Achilles, Dusa) | The characters you bond with are *cast members*, not the player; the player is the connective tissue | Proves the deepest one-on-ones don't need a player-avatar — an NPC confidant carries them | The bar's deep one-on-ones are **veteran ↔ an NPC confidant** (the bartender, a friend, or kin) — *no Founder needed* | Venue-staff NPC via the existing `np:<poiId>:<slot>` scheme |
| 3 | **The Taverna / downtime room** (Hades II) | A dedicated room where a character unwinds with one chosen guest; dialogue reacts to your last run | A physical "third place" makes downtime a *destination*; reactivity makes the place feel like it remembers | A venue a **veteran** goes *to*, where the scene reacts to your last mission (who fell, who leveled, what episode) | Reads `CAMPAIGN.visit`, last-map outcome, `fallenVets`, `G._vetLost` |
| 4 | **Confidant rank-up + calendar scarcity** (Persona 5) | Time-gated relationships rank up via dialogue choices; each rank grants story + a perk; *calendar space is the rarest resource* | Scarcity forces meaningful prioritization; interlocking story+perk rewards make every slot count | **Downtime budget**: a few "nights" per HUB visit. You can't develop everyone, so you *choose* whom to send and with whom. Each tier grants a beat + a small opt-in perk | New `CAMPAIGN.offhours.nights` counter, defaulted; tiers in the Ledger |
| 5 | **Heart events** (Stardew Valley) | At friendship thresholds, authored cutscenes fire; gifts move a 10-heart meter with loved-gift & birthday multipliers | Thresholded *authored* scenes feel earned; the gift economy is legible | **Milestone scenes** fire at bond tiers (a vet finally tells the truth about the crime). Gifts have **legible tiers** per recipient, seeded from the dossier | Tier thresholds in Ledger; gift affinity derived from `buildDossier` fields |
| 6 | **Wants & Fears + Traits + Autonomy** (The Sims) | Sims develop wants/fears, traits bias behavior, and they socialize autonomously; *the player directs their own people, townies react* | Emergent desire makes characters feel like they *want* things; the player-directs-my-people stance is exactly ours | The **systemic floor** + the core stance: a vet develops a transient *want* ("wants to see their kid") and *fear* (after a squadmate falls). The player **directs the veteran**; NPCs are the townies | New light `u.mood` (transient, **not** saved as identity); prompts in venue menu |
| 7 | **Opinion + Compatibility + Moodlets + emergent loss** (RimWorld) | Pawns hold numeric opinions; compatibility biases random social outcomes; *players tell stories about colonists they lost* | The compatibility math turns random encounters into *characters with history*; the loss-story is the point | **Compatibility** from two vets' dossiers biases whether a brought-together pair trends **friend/rival/romance**. The loss-story is already STARLEFT's spine (The Wake) | Deterministic compat from `buildDossier` traits; feeds Ledger seeding |
| 8 | **Stress-from-acting-against-personality, lifestyle XP, friend/rival** (Crusader Kings 3) | Acting against your traits accrues stress → mental break; friendships/rivalries are first-class, with a single lifelong best friend | Personality has *teeth* — being yourself is rewarded, betraying yourself costs | Directing a vet *against their nature* (making the loyal one inform, the haunted one relive it) accrues **strain** (a soft cousin of madosis); one **"closest"** bond per vet | Strain folds into existing madosis pressure (soft, capped); "closest" flag in Ledger |
| 9 | **Procedural relationships written before the characters exist** (Wildermyth) | Writers authored romance/rivalry plots not knowing *who* the heroes would be; the player steers their own cast; compatibility decides lovers vs rivals | Proves you can write deeply personal scenes against **procedural** characters you *direct* — exactly STARLEFT's dossier model | Scenes are **templated with dossier slots** (`{me}`, `{rel}`, `{relName}`, `{home}`, `{dream}`, `{trauma}`, `{crime}`) so an authored beat fits any procedural vet you direct | Existing `d.fill()` slot system in `js/lore.js` / `npc_lore.js` |
| 10 | **Skill-check-as-dialogue + dice economy + failure-as-content** (Disco Elysium / Citizen Sleeper) | Dialogue *is* the skill check; a small dice/clock economy gates attempts; *failing* opens new, often better, content | Removes "win/lose" framing; failure is a branch, not a punishment | A **veteran's chosen line** can **land or misfire** on a tier-keyed deterministic roll. A misfire is *content* (they clam up, you learn something sideways), never a stat loss | Deterministic `makeRng` check; outcome branches authored as data |
| 11 | **Soldier Bonds + berserk-on-partner-death** (XCOM 2: WotC) + **Stress/Quirks** (Darkest Dungeon) | Soldiers who fight together bond (compatibility-gated); bonded pairs get synergy; a bonded death can cause berserk; stress accrues, quirks form | Bonds you *built* over a campaign make a battlefield death detonate | **Vet↔vet bonds** form at the club & through co-deployment; deploying a bonded pair grants a small opt-in **synergy**; a partner's death deepens grief beats at The Wake | Ledger bond; opt-in deploy synergy; ties to existing grief/`fallenVets` |
| 12 | **Loyalty missions + companion banter + companion↔companion romance** (Mass Effect / Dragon Age) | Earning trust unlocks a personal mission and ability; companions banter and form their own relationships | Trust feels *earned* through understanding; the cast feels like a *group*, not spokes on a wheel | A maxed **vet↔NPC** bond unlocks a one-scene personal **errand** that fires a capstone; vets form bonds with **each other**, surfaced as ambient banter | Personal errand → `capstone`; vet↔vet Ledger bonds + ambient banter |
| 13 | **Seek-out supports** (Fire Emblem: Three Houses) | Support conversations are physically *found* in the world (icons), not menu-summoned; they gate at support ranks | Discovery makes scenes feel like *moments you caught*, not content you spent | Some scenes **appear in the world** (a prompt over two vets already drinking together) rather than only via the venue menu — you *catch* them | Reuses world-space interaction prompts + dialog bubbles |

### 3.2 Per-game takeaways (the "why," in prose)

**Hades (Taverna + Nectar/Keepsakes/Ambrosia + NPC confidants).** The single most important reference because STARLEFT shares its DNA: a roguelike-adjacent loop, a hub you return to, characters whose stories unspool through repeat visits, and *already* a Hades-inspired art direction. Hades teaches four things. First, **the people you bond with are NPCs** — Nyx, Achilles, Dusa — not a player-avatar; the protagonist is just the connective tissue, which is exactly the stance we need (a *veteran* bonds with an *NPC*; there is no Founder). Second, **a downtime *place* beats a downtime *menu*** — the Taverna and the House lounge are destinations with mood, and dialogue there reacts to your last run, so the place feels like it remembers. Third, **gifts are a clean on-ramp**: a single Nectar opens a relationship and hands back a Keepsake with a gameplay effect, so the *first* social act already pays off both ways. Fourth, **deeper currency (Ambrosia) gates personal quests** — the relationship has a *shape* (open → quest → deepen), not a flat meter. We adopt all four.

**Persona 5 (Confidants).** Persona proves that **scarcity is the engine of meaning**. Calendar space is the rarest resource; every Confidant slot you spend is one you can't spend elsewhere, which makes a quiet character beat feel as consequential as a boss. It also shows the **story+perk interlock**: each rank gives narrative *and* a concrete benefit, so you're never choosing "story or power." We take the scarcity (a downtime budget per visit) and the interlock (each bond tier: a beat + a *light* perk), but deliberately keep the perks small so we stay on the "attachment over power" pillar. (We keep Persona's *structure*, not its first-person POV — here the slot is "send which veteran to which NPC," not "where does *the protagonist* go.")

**Stardew Valley (heart events).** Stardew shows that **thresholded authored scenes feel earned** in a way pure number-go-up never does. At 2/4/6/8 hearts you *walk into a scene* that recontextualizes the character. It also has the most **legible gift economy** in the genre (love/like/neutral/dislike/hate, with loved-gift and birthday multipliers), which we borrow to make gifting readable rather than a wiki lookup — affinities are *derived from the recipient's own dossier* (a vet from a specific hometown loves something from home; an NPC's profession shapes theirs).

**The Sims (wants/fears/traits/autonomy + the director stance).** The Sims is our model for two things. The **systemic floor**: its characters *want* things the player didn't ask for, develop *fears* from lived experience, and socialize autonomously — we take a deliberately *light* version. And, crucially, the **director stance itself**: in The Sims you *control your household and the townies react*. That is exactly our POV — you direct your **veterans**, and the kin/friends/staff/commuters are the townies. There is no avatar standing in the room; there's the people you command and the people who react to them.

**RimWorld (opinion/compatibility/moodlets + the loss-story).** RimWorld is the patron saint of "I lost a pawn and I'll tell you the whole story." It earns that with **compatibility math** (traits bias whether two pawns click or clash) and **opinion numbers** that turn random encounters into history. We borrow compatibility (derived deterministically from dossier traits) to seed whether a brought-together pair trends friend vs rival vs romance — and we note that STARLEFT *already* has the loss-story nailed via The Wake; The Off-Hours just makes the loss hurt more.

**Crusader Kings 3 (personality has teeth).** CK3's best idea is **stress from acting against your own traits** — being yourself is mechanically rewarded; betraying yourself costs. We fold a soft version in: directing a veteran *against their nature* in a scene (making the loyal one inform, making the haunted one relive it) accrues **strain**, a narrative cousin of madosis. CK3 also formalizes **a single lifelong best friend / nemesis**, which we adopt as a "closest bond" slot per vet so the web has peaks.

**Wildermyth (procedural-proof, player-as-director).** Wildermyth is the existence proof that **you can write deeply personal, branching scenes for characters you've never met *and direct from outside*** — its writers authored romances without knowing who'd fall in love, using slotting and compatibility, and the player steers their own heroes through them. This is *exactly* STARLEFT's dossier model (`d.fill()` already resolves `{me}`/`{rel}`/`{relName}`/`{home}`/`{dream}`/`{trauma}`/`{crime}`) *and* our director POV. Every Off-Hours scene is authored as a **slot template** so one hand-written beat fits any procedural veteran you point at it.

**Disco Elysium / Citizen Sleeper (talking as the game).** These prove that **dialogue can be the mechanic** and that **failure is the best content**. A failed check in Disco Elysium often opens a more interesting line than success. We adopt the "white check" feel: a **veteran's chosen line** can **misfire**, and a misfire is *content* — they deflect, and you learn something sideways — never a stat penalty. The dice/clock economy maps onto our downtime budget.

**XCOM 2: WotC + Darkest Dungeon (bonds + stress).** WotC shows that **bonds you built over a campaign make a battlefield death detonate**: bonded soldiers get synergy, and a partner's death can send the survivor berserk. Darkest Dungeon shows **stress and quirks** as character texture. We use these for the **vet↔vet** axis: bonds form at the club and through co-deployment, grant a small *opt-in* synergy, and a partner's fall deepens the grief beats The Wake already plays.

**Mass Effect / Dragon Age (loyalty + a cast that talks to itself).** The "modern companion" standard: trust is **earned through understanding**, unlocking a personal **loyalty mission** and ability; and companions **banter and romance each other**, making the group feel like a group. We map "loyalty mission" to a single capstone **errand scene** at a maxed vet↔NPC bond, and "companions talk to each other" to **ambient vet↔vet banter** in the world.

**Fire Emblem: Three Houses (seek-out supports).** FE3H's supports are *found*, not summoned — you spot an icon and catch a moment. We use this for a subset of scenes that **appear in the world** (a prompt floating over two vets already sharing a drink) so the player feels like they *caught* something private rather than spending a content token.

---

## 4. The Off-Hours district

### 4.1 Placement & gating (exactly like The Wake)
The district is a cluster of new `HUB.pois` entries in `js/hub_map_data.js`, with `megaSprites` for the tall neon facades, gated by campaign progress through the existing `hubPoiAvailable(p)` filter in `js/hub.js`. Suggested unlock: **after the first real loss is plausible** — early enough to build bonds before The Wake exists (The Wake gates at Ep XII), so the player has *authored* attachments the Wake can later cash in. A natural gate is **post-Episode IV–V** (first veterans reach Lv2 and earn dossiers), tunable.

Each venue is a POI with a new `kind` (`bar` / `club` / `diner`) dispatched in `hubUnitArrivedPoi` (the same switch that routes `wake → openWakeMenu()`). The player **walks a veteran to the venue** (the existing hub command), which opens `openVenueMenu(poi, vet)` built on the `openHubMenu(spec)` shell — so the *veteran* is the one who arrives and acts, never a Founder.

### 4.2 The three venues (and a fourth, optional)

**① THE LATE SHIFT — dive bar (flagship).** *Hades' NPC confidants × Persona's depth.*
A long-bar dive under a dead overpass; knockoff bottles, off-shift regulars. This is the **deep one-on-one** room — a **veteran with one NPC**. Its signature counterpart is the house **bartender-confidant**: a single, **hand-authored, recurring cast NPC** (Hades' Nyx/Achilles role) — *not* a procedurally-generated staffer. They get a `fixed` dossier like a named hero (stable name, voice, and backstory campaign-wide), and **every veteran forms their own separate confidant bond with the same bartender** — so the bar accumulates a chorus of private histories around one constant listener. (Strong lore hook: make them a *retired* veteran or a founder-mech survivor who outlived their whole roster — it earns the "poured for three rosters of company dead" line and ties to Marisol's naming.) A vet can alternatively sit with a **friend** NPC here; **deep *kin* scenes are authored deepest at Marisol's** (§4.2③), so the bar stays the confidant/friend room. You direct the *veteran's* side of long, authored, multi-tier arcs (the place a veteran finally talks about the crime). Reactive to your last mission. The flagship and the first thing to build.

**② STATIC — the club.** *The Sims group socials × XCOM bonds × RimWorld party.*
Bass you feel in the floor, a crowd of NPCs and off-duty vets. This is the **veteran ↔ veteran** room: you bring *two or three* of your vets (and direct each of them), and bonds spark — friendships, rivalries, the occasional romance. Lighter and more **systemic**: more ambient autonomy, shorter scenes, compatibility doing more of the work. This is where the squad becomes a *squad*.

**③ MARISOL'S — noodle bar / diner.** *(named in-world for a fallen founder-mech pilot — ties to existing lore.)* *Stardew heart events × Dragon Age camp.*
Steam, cheap broth, a counter that's seen everything. This is the **family** room: you walk a vet in to meet **the kin the dossier named** — the relative NPC `hubSyncNpcs` already spawns. You direct the *veteran* through quiet reunions, reconciliations, and grief (a mourning relative is *here*, not abstract). The warmest and saddest venue.

**④ (optional) THE LANDING — rooftop / shrine.** *FE3H seek-out × memorial.*
An overlook above the sprawl. Not a staffed venue — a **seek-out** space where caught, world-prompted scenes happen (two vets you didn't stage, already up there). Folds the FE3H "catch a moment" idea in without a full venue. Can be P3+ or cut.

### 4.3 Venue personality matrix
| | Late Shift (bar) | Static (club) | Marisol's (diner) |
|---|---|---|---|
| Who's at the table | 1 vet + 1 NPC (bartender-confidant / friend) | 2–3 of your vets | 1 vet + their (or a comrade's) kin NPC |
| Primary bond | Vet ↔ NPC (confidant) | Vet ↔ vet | Vet ↔ kin NPC |
| You direct | the veteran | both/all veterans | the veteran |
| Feel | Deep, slow, confessional | Loud, social, systemic | Warm, quiet, reconciliatory |
| Authored vs systemic | Mostly authored | Mostly systemic | Authored with deep slot-fill |
| Primary references | Hades confidants, Persona | Sims, XCOM, RimWorld | Stardew, Dragon Age |
| Signature payoff | Confidant arc → personal capstone | Deploy-together synergy | Reconciliation → dream capstone |

---

## 5. The Relationship Ledger (the missing state)

This is the one genuinely **new** piece of persistent state. Everything else reuses existing systems.

### 5.1 Where it lives
A new object on `CAMPAIGN` (the cross-extraction persistent campaign blob), mirroring the discipline of `CAMPAIGN.npc`:

```
CAMPAIGN.offhours = {
  v: <int>,                 // OFFHOURS content-version at first write (gates scene/gossip/gift pools)
  nights: <int>,            // downtime budget remaining this visit (reset per visit)
  bonds: { <bondId>: BondRecord },
  visited: { <venueId>: <lastVisit> }   // for "reacts to your last visit" flavor
}
```

**Save-compat:** `deserializeHubCampaign(data)` defaults `offhours` to `{v:CURRENT, nights:DEFAULT, bonds:{}, visited:{}}` when absent. A legacy save loads with an empty ledger and behaves exactly as today. (Same pattern as the existing `CAMPAIGN.npc` / `reborn` defaults in `js/hub.js`.)

### 5.2 Bond identity (reuse existing stable ids — invent nothing)
A bond is always between two **in-world characters** (never a Founder), each addressed by an id the game *already* mints:
- **Veteran:** `lore:<seed>` or `hero:<id>` — the exact keys `CAMPAIGN.roster` and `fallenStableId` already use.
- **NPC (any role):** `nr:<vetKey>` (relative) / `nf:<vetKey>:<k>` (friend) / `np:<poiId>:<slot>` (venue staff / provider, **incl. the new bartender-confidant**) / `nu:<slot>` (commuter) — the exact ids `npcParseId` already parses.

So every bond is **vet↔vet** or **vet↔NPC**. There is no third party type. `bondId = sortedPair(A, B)` (the two ids sorted, joined) so a bond is order-independent and collision-free. Because both id spaces are **already stable across save/load/rollback** (that's how the Wake resurrects and how NPCs persist), the Ledger inherits that stability for free.

**Any veteran with any NPC ("all modalities").** Bonds are *not* restricted to a veteran's own dossier-named kin or friends. The `bondId` scheme is symmetric over the whole id space, so a veteran can bond with **another veteran's** relative (e.g. sitting with a fallen comrade's grieving sister, §10.3), the **bartender-confidant**, a **facility staffer** (`np:`), or an **ULTRA commuter** (`nu:`). The dossier-seeded kin/friend bonds (§5.5) are just the *pre-warmed* starting set; the social web is open to any vet×NPC and any vet×vet pair the player chooses to develop.

### 5.3 BondRecord shape (short fields, save-cheap, append-only log)
```
BondRecord = {
  k: <kindCode>,     // 0 kin · 1 friend · 2 rival · 3 romance · 4 mentor · 5 confidant(venue-staff NPC)
  t: <tier>,         // 0..MAX_TIER (Hades-hearts / Stardew-hearts / Persona-ranks analog)
  p: <points>,       // progress toward next tier
  fl: <bitfield>,    // 1 closest/nemesis · 2 strained · 4 arc-unlocked · 8 arc-done · 16 keepsake-granted
  lv: <lastVisit>,   // CAMPAIGN.visit of last meaningful interaction (decay/"haven't talked" cues)
  seen: [ <sceneCode>... ]   // APPEND-ONLY indices of scenes already played (no repeats; like u.lore.events)
}
```
This is deliberately the same **shape philosophy** as the NPC record in `npc_lore.js` (tiny keys, an append-only `ev`-style log, a flags bitfield, a mint-version). `seen[]` plays the exact role `u.lore.events`/`rec.ev` play: it prevents repeats and is **append-only forever** so old saves stay valid as the scene pool grows. (No `founder-trust` kind — every bond is between a veteran and another veteran or an NPC.)

### 5.4 Tiers (the meter shape)
Five tiers, named per-kind for flavor (numbers identical underneath):
| Tier | kin | friend | rival | romance | confidant (NPC) |
|---|---|---|---|---|---|
| 0 | estranged | acquaintance | friction | — | a stranger at the bar |
| 1 | reaching out | familiar | needling | a spark | a face they nod to |
| 2 | thawing | tight | feud | drawn | a regular |
| 3 | mended | close | bitter | together | talks freely |
| 4 (cap) | family again | inseparable | nemesis | devoted | tells them everything |

Each tier-up **fires an authored milestone scene** (Stardew heart-event style) and, if the owner's *light payoff* applies, grants a small effect (§8). Points per interaction are legible (a good scene > a gift > a passing hello), Stardew-style.

### 5.5 Seeding from what already exists (no cold start)
- **Kin bonds pre-seed at tier 0–1** from each dossier's `rel`/`relName` the moment the vet earns a dossier — the relationship the dossier *asserts* becomes a real, growable bond. (A dossier that says "estranged from his brother" seeds a strained kin bond; a warm one seeds tier 1.) Derivable from `buildDossier`.
- **Friend bonds** seed from the 0–2 friend NPCs `hubSyncNpcs` already mints per vet.
- **Mentor bonds** reuse the **existing Training Grounds pairing** — a mentor/intern pair already exists; promote it to a real Ledger bond so training partners (two veterans) can become friends.
- **Confidant bonds** seed at tier 0 the first time a veteran visits the Late Shift (they meet the bartender-confidant NPC).

### 5.6 Compatibility (RimWorld/Wildermyth/XCOM) — derived, never stored
When you bring two vets together, whether they trend **friend / rival / romance** is biased by a **deterministic compatibility score** computed from their two dossiers — shared `home`, complementary vs clashing `trauma`/`dream` themes, whether one carries a `crime` the other would judge, unit-type archetype friction. Pure function of the two seeds (`makeRng` over the pair), so it's **stable and netRole-safe** and needs no storage. This is the RimWorld idea (compatibility biases outcomes) implemented the Wildermyth way (over procedural characters via slots).

### 5.7 Decay & "closest" (CK3)
- A bond whose `lv` (last visit) falls far behind the current visit gets a gentle **"they haven't talked in a while"** cue (no harsh decay — we never punish; we *invite*). Optional soft point trickle-down at most.
- Exactly **one** `closest` flag per vet (best friend) and at most one **nemesis** — CK3's "lifelong" peaks, so the web has summits, not a flat field.

---

## 6. The Conversation Engine (player-directed, Sims-like choices)

### 6.1 Scene anatomy
A **scene** is authored data (not code), shaped like the existing `LORE_DATA.events`. The player chooses the **veteran's** line/action; the NPC counterpart replies in character (in a vet↔vet scene, the player picks lines for *both* veterans, turn by turn).

```
Scene = {
  id, venue, kind,            // which bond kind it serves
  with,                       // the counterpart: an NPC role/id, or 'vet' for a second veteran
  req,                        // gating: {minTier, needsCrime?, needsTrauma?, needsDream?, episode?, mood?}
  open: <NPC/other beat>,     // the counterpart opens (filled via the OTHER party's d.fill)
  choices: [                  // 2–4 lines/actions FOR THE VETERAN you're directing
    {
      approach: 'warm'|'blunt'|'probing',     // the veteran's demeanor
      gate?: 'crime'|'trauma'|'dream'|null,   // some choices exist only if the vet has that aspect
      line: <the veteran's line/action>,
      check?: { tierBias },                   // optional light roll (else auto-land)
      land:  { reply, fx },                   // the counterpart's response on success
      miss?: { reply, fx }                    // the counterpart's response on misfire (CONTENT, not punishment)
    }
  ],
  sayIdx: <int|null>          // index-keyed voice for the veteran's line (variable-free only), like LORE_SAY
}
```

- **Slots** make one authored scene fit any procedural vet *and* any procedural NPC — reusing `d.fill()` for the veteran and `buildNpcDossier().fill` for the counterpart. A single scene "the thing you did before us" reads correctly for a vet whose `crime` is embezzlement or arson, spoken to whichever NPC is across the table.
- **Approaches** (warm / blunt / probing) are the Disco-Elysium texture: the *demeanor of the veteran's line*. Some approaches **misfire** against some counterparts (a blunt veteran with a grieving relative clams the room up — which is *content*).
- **Aspect gates** mean a vet's *own dossier* unlocks branches: only a `crime`-carrier can choose the confessional line; only a `dream`-holder can choose the "here's what I actually want" line. Attachment deepens because the conversation is *theirs*.

### 6.2 The light check (Disco Elysium / Citizen Sleeper)
When a choice has a `check`, resolve it with a **deterministic** `makeRng` roll seeded by `(bondId, sceneId, choiceIndex, CAMPAIGN.visit)` against a difficulty offset by the current bond tier (higher trust → more lands). **Misfire ≠ failure:** it routes to `miss` (a different, often more revealing, reply from the counterpart) and **never** subtracts points or stats — at worst it spends the night's slot. This keeps the "talking is the game, failing is content" feel while staying fully deterministic for co-op.

### 6.3 Outcomes write *canon* (the killer feature)
A landed scene does up to three things — **all via existing systems**:
1. **Grows the bond** — `+points`, possibly `+tier` (which queues the next milestone scene).
2. **Writes a real life-event into the dossier the player already reads.** A scene outcome can call the existing **`rollLifeEvent`-style append** into the veteran's `u.lore.events` (and into the counterpart NPC's `rec.ev` via the `npc_lore` log; in a vet↔vet scene, into *both* veterans' records). *A night at the bar becomes a line in the service record.* This is the single most important integration: the Off-Hours doesn't bolt on a separate relationship screen — it **feeds the dossier system that already earns the player's attachment.**
3. **Optionally fires a light fx** (§8): a morale lift, a strain tick, or at an arc's end the existing **`capstone`/`dreamDone`** beat.

### 6.4 UI (reuse the hub-menu shell)
- The venue opens via `openHubMenu(spec)` — the same shell the Wake/Training/Condo menus use, with `signature()`-gated rebuilds so choice buttons never get eaten mid-click.
- **Left column:** the scene — the **veteran's** portrait card and the **counterpart's** card (both via `hubMenuUnitCard` / the NPC card), the prose, and **the veteran's choices as buttons**. **Right column:** the bond's state — tier markers, the relationship's history (the `seen[]` scenes as a readable log, like the dossier service record), and any available **gift**.
- **In-world staging (optional polish):** dramatic beats can also play through `pushDialog`/`drawDialogs` (the world-space speech bubbles over the veteran and the NPC) and `cutscene.js`, so a big moment can happen *at the table* in the HUB view, not only in a panel — the way the Episode VII flash cutscene already works.
- **Mobile:** the two-column grid already collapses to one column < 760px; scenes are short enough to read on a phone.

### 6.5 netRole safety
- Opening a venue, reading bonds, scrolling history = **local UI** (allowed on client).
- *Committing* a scene outcome (bond mutation, life-event write, fx) routes through a **new `net*` wrapper** in `js/net/commands.js`, **host-authoritative**; the client applies the result from the host snapshot. `CAMPAIGN.offhours` is part of the host's authoritative campaign state. (Same model as `hubWakeStart`/`updateRebornProduction` guarding `netRole==='client'`.)

---

## 7. The systemic backdrop (the "blend")

The authored scenes are the peaks. The systemic floor keeps the city breathing between them — lightly, so we never drift into a full Sim we'd have to balance and net-sync.

### 7.1 A thin mood layer (The Sims, dialed down)
Each Lv2+ vet carries a **transient** `u.mood` (NOT saved as identity, NOT the authored dossier):
- `morale` (0–1), nudged by recent missions (won clean → up; squadmate fell → down) and by Off-Hours nights (a good scene → up).
- `loneliness` (0–1), rising with visits since their last meaningful interaction (`bond.lv`).
- A derived **want** ("wants to see their kid" / "wants to drink alone" / "wants to bury the hatchet with X") and, post-trauma, a transient **fear/strain**.

Mood is **derived/transient** wherever possible (recomputable from `bond.lv`, recent `fallenVets`, last-map outcome) so it costs almost nothing to persist and can't corrupt a save. Where a tiny amount must persist, it defaults cleanly.

### 7.2 "Needs a night out" prompts
The venue menu surfaces the vets whose mood *wants* something — a Persona-style nudge list ("Rust has been isolating since the GRAAL; send him to the Late Shift"). This turns the systemic floor into *actionable* opportunities and lets the game **point you at the most emotionally live story** without forcing it — you still choose whom to send and with whom.

**NPCs initiate too.** With no Founder pulling everyone together, the NPCs need their *own* pull — so the nudge list runs both directions. An NPC can **ask for a veteran**: a mourning relative "is asking if anyone from {vet}'s unit will come by" (sourced from the existing `fl & 1` mourning flag), the bartender "kept a stool open for {vet}," a friend NPC "left word at the desk." This is reused `npcAmbientLine`/flag data surfaced as a prompt — it costs nothing new and makes the city feel like it's reaching toward the squad, not just waiting to be visited. You still choose whether to answer (and with whom).

### 7.3 Ambient autonomy (RimWorld parties × FE3H catch-a-moment)
Between your staged scenes, the world stages its own — **reusing `npcAmbientLine` and the dialog-bubble system**:
- You walk into the HUB and **see** two of your vets already sharing a drink at Static (their bond ticks up on its own, slightly).
- A **mourning** relative NPC (the `fl & 1` flag `hubSyncNpcs` already sets) is nursing one at Marisol's — and you can send the right veteran to sit with them.
- A rivalry pair trades a barbed line in passing.

These are **closed-form and deterministic** (no `hubpoi` commands, per the routine constraint) — the NPC/vet routing reuses the existing closed-form itinerary system in `js/hub_npcs.js`; the lines reuse the existing ambient pools. Some of these spawn a **seek-out prompt** (FE3H) so you can *catch* the moment and turn it into a directed scene.

### 7.4 Why "light" is the right call
A full autonomy sim (Sims/RimWorld depth) would: (a) need heavy balancing, (b) be hard to keep deterministic across the three netRole paths, and (c) risk *diluting* the authored warmth that's the whole point. The blend — authored peaks, thin reactive floor — gets ~80% of the "alive" feeling for ~20% of the systemic risk.

---

## 8. Payoffs (light & opt-in) — every effect reuses an existing hook

Owner-locked: **small, optional, never required to win.** Each payoff maps to a system already in the repo, so none of this is new balance surface beyond tuning.

| Payoff | Trigger | Reuses | Magnitude |
|---|---|---|---|
| **Morale / madosis relief** | A good scene; a maxed kin reunion | The existing Mindfulness-Facilitator field-relief system (`madReliefActive`/`madEffective`, the `madHeal` flag) — *effective* relief, not a true madosis cure, exactly as that system already distinguishes | Small, temporary; identical envelope to a therapy session |
| **Strain tick (downside, soft)** | Directing a vet against their nature (CK3) | Folds into existing madosis *pressure* (capped, soft) | Tiny; narrative-flavored, never a death sentence |
| **Deploy-together synergy** | Both vets in a friend/romance bond deployed in the same mission | New small combat modifier gated on Ledger bond; **opt-in** (you choose to field them) | XCOM-bond-sized: a few % or a small morale aura |
| **Rivalry edge** | A rival pair deployed together | Same hook, competitive variant (slightly more damage, slightly less cohesion) | Symmetric, tiny |
| **Dream acceleration / capstone** | An arc's final scene (reconciliation with kin, confession to a confidant, a personal errand) | The **existing `capstone`/`dreamDone`** path in `js/lore.js` — fires the same triumphant toast + crawl token | The dream lands *because* of a relationship, not just a level-up |
| **Keepsake trinket (Hades)** | A bond hits cap | Tiny carried bonus, like a Wake-tier reward; `fl & 16` prevents double-grant | One small passive; optional to equip |
| **Grief amplification** | A bonded partner falls | Deepens the **existing** grief beats (`sayHeroEvent('grief')`, the Wake) — the *attachment* is the payoff turned inward | No stat effect; pure story weight |

The throughline: **the strongest "reward" is that a relationship you authored makes an existing emotional beat hit harder.** The keepsake and synergy are garnish.

---

## 9. Economy & scarcity (Persona's calendar lesson)

### 9.1 The downtime budget
`CAMPAIGN.offhours.nights` = a small number of scenes you can stage **per HUB visit** (e.g. 2–3, tunable, possibly scaling with roster size or ULTRA upgrades). Resets each visit. This is the dice/clock economy (Citizen Sleeper) and the calendar (Persona): you **cannot** develop everyone, so each night is a *choice* — which veteran, with which NPC or which other veteran. Ambient/caught (FE3H) moments are **free**, so the budget gates *deep* scenes, not *all* contact.

### 9.2 M3$ sink
Staging a scene costs **M3$** (the round, the meal) — a healthy sink for the hub economy, scaled gently so it's a consideration, not a wall. Spends from the HUB's campaign currency (`CAMPAIGN.m3` — the pool the HUD shows in-hub; `playerEco(G, ctrl)` is the separate in-mission economy), the way training/healing/the Wake already charge.

### 9.3 The optional gift layer (Hades Nectar → Keepsake)
A purchasable **luxury item** (a cyberpunk Nectar analog — pick an on-theme name in the lore-forge pass: contraband single-malt, real coffee, a pre-collapse vinyl). A veteran brings one to an NPC (or to a squadmate). Giving one:
- **Opens** a bond (first gift jumps tier 0→1) and **returns a small keepsake** to the veteran (Hades' exact loop).
- Has **legible affinities** (Stardew): each recipient loves/likes/dislikes categories *derived from their dossier* (a vet from a coastal `home` loves something from the sea; an NPC's `profession` shapes theirs; a `crime`-carrier is prickly about lavish gifts). Readable, not a wiki.
- Is **append-only/version-gated** like every other pool.

Gifts are an *on-ramp and an accelerant*, never a substitute for the scenes — you can't gift your way to a maxed bond without the milestone conversations.

---

## 10. Per-venue deep dives (with example authored scenes)

All example lines are **slot templates** (`{me}` = the directed veteran's first name, `{rel}`/`{relName}` = their named kin, `{home}`, `{dream}`, `{trauma}`, `{crime}`; `{npc}` = the counterpart NPC's name). The counterpart **opens**; the bulleted **choices are the veteran's** lines/actions that you pick. Tone: dark, dry, neon-through-grime.

### 10.1 THE LATE SHIFT (bar) — Veteran ↔ NPC confidant (the bartender), deep authored arc

**Scene `bar.first_round` (tier 0→1, any vet, with = bartender-confidant).**
> *Open (the bartender):* "Slides {me} a knockoff whiskey they didn't order. 'On the house. Three rosters I've poured for. You've all got the same look on the way in.'"
>
> *Choices (what {me} does):*
> - **(warm)** {me} takes the glass, nods, lets the bartender talk. → *land:* the bartender starts naming the dead they have in common; the bond opens. morale↑
> - **(blunt)** {me} slides it back. "I'm not here to get read." → *check (low tier may misfire):* *land:* the bartender respects it and pours anyway — slower burn · *miss:* {me} goes quiet, learns nothing tonight (content — they guard themselves)
> - **(probing, gate: dream)** {me} asks if the bartender ever wanted *out* of this city → mirrors {me}'s own `{dream}` back at them → writes a life-event into {me}'s service record.

**Scene `bar.the_thing_you_did` (tier 2+, gate: `crime`, with = confidant).** {me} finally tells the bartender what they did before the company (`{crime}`). The confessional. Landing it can **fire a capstone** later. Misfiring is {me} deflecting onto the `{trauma}` instead — a different, equally real beat. *This is the Hades "personal quest" gate, with an NPC on the other side of the bar.*

**Scene `bar.last_call` (tier 4, confidant cap, with = confidant).** The arc's summit. The bartender helps {me} resolve the one thing — find {relName}, settle the `{crime}`, get back to {home} one last time. One scene, fires `dreamDone`. **It's a narrative capstone scene, not a new deployable mission/map** — the "errand" resolves *in the conversation* (and in the dossier line it writes), keeping scope contained. No Founder anywhere in it — just a veteran and the person who's listened to them for a whole campaign.

### 10.2 STATIC (club) — Veteran ↔ veteran, systemic + short scenes

**Bring two of your vets; you direct each in turn.** Compatibility (§5.6) pre-biases the night. Example, two compatible soldiers ({A}, {B}):
> *Open:* "{A} and {B} end up at the same sticky table, sizing each other up over the bass."
> *You pick {A}'s move:*
> - **(warm)** {A} buys the round and brings up the op where {B} dragged them out. → friend bond ticks; across visits, can climb to `closest`.
> - **(blunt, low compat)** {A} needles {B} about the call that got someone killed → escalates to a **rivalry** beat — which is *also* desirable content (rivalries grant the competitive deploy edge).
>
> *Then you pick {B}'s reply* (both are your units, so you direct both sides — no NPC, no Founder).

**Ambient (free, caught):** you arrive and two off-duty vets are already here; a floating prompt lets you *stage* the moment (FE3H catch-a-moment) or let their bond tick on its own (RimWorld autonomy).

**Romance** only emerges from sustained high compatibility across multiple nights and is always **opt-in** to escalate (you can keep it a friendship). Tasteful, oblique, on-theme — explicit content is a real possibility; the dark-cyberpunk register is *two people finding warmth in a city that ran out of it.*

### 10.3 MARISOL'S (diner) — Veteran ↔ kin NPC, reconciliation & grief

**Walk a vet in to meet their named relative** (the `nr:<vetKey>` NPC `hubSyncNpcs` spawns). You direct the veteran; the relative answers in character.
> *Open (the relative, estranged, tier 0):* "{relName} is already in the back booth, hands around a bowl of broth, not eating. They look up. 'So you finally showed.'"
> *You pick {me}'s move:*
> - **(warm)** {me} sits, says {relName}'s name before anything else. → thaws the kin bond
> - **(probing, gate: trauma)** {me} finally says the thing about `{trauma}` they couldn't say over comms → big tier jump, writes a life-event for **both** the vet (`u.lore.events`) and the kin NPC (`rec.ev`)
> - **(blunt)** {me} stays standing, arms crossed → {relName} leaves; the bond holds at strained (content — and recoverable next visit)

**Grief variant (kin NPC is `mourning`, `fl & 1`):** the relative of a *fallen* vet is here. You can't send that veteran (they're on the Wall) — but you can send **another veteran who knew them** to sit with the family. This is the emotional ceiling of the whole feature: the dossier already made you care, The Wake already took them, and now their kid sister is across the table from one of their squadmates. A landed scene here can unlock the option to **prioritize that fallen vet at The Wake**, threading the two venues together.

### 10.4 Cross-venue threading
- A vet who reconciled with their kin at **Marisol's** has that referenced when they level (a prouder life-event) and when they fall (the kin's grief is *worse*, and *earned*).
- A **confidant** arc completed at the **Late Shift** changes a vet's barks/ambient lines (reuse the existing bark/ambient pools, version-gated).
- A vet↔vet **bond** from **Static** changes how their deaths land at **The Wake** (XCOM berserk-grief, played as story not stat).

---

## 11. Three worked end-to-end vignettes

**A) Vet ↔ NPC confidant (Late Shift).** Over four visits you direct **Rust** (a `hustler`, carries a `crime`: he sold out his first crew) through nights at the bar with the **bartender-confidant** NPC. Night 1 (warm) — Rust takes the drink; the bond opens. Night 2 you spend a *gift* (real coffee — he's from a place that had it) → keepsake. Night 3 (probing, crime-gate) — Rust confesses to the bartender; a life-event lands in his service record: *"Lv 9 — Told someone what he did to the people from {home}. First time out loud."* Night 4 (tier 4, `bar.last_call`) fires his **dream capstone** — the triumphant toast and crawl token the game already plays. Twelve episodes later, when Rust falls, that service record is what you read at The Wake. **No Founder appears at any point** — it's Rust and the bartender.

**B) Vet ↔ kin (Marisol's).** **Nino's** dossier names an estranged `brother`, "Tomas." `hubSyncNpcs` already has Tomas in the city, in a condo. You walk Nino in. First night you pick *blunt* — Tomas walks. Second night you pick *warm* — it thaws; a shared life-event writes to *both* files. Third night mends it (tier 3) → small madosis relief for Nino. When Nino later dies, Tomas's relative NPC flips to **mourning** — but now it's the brother you watched Nino reconcile with, and the grief beat hits like a truck.

**C) Vet ↔ vet (Static).** Two soldiers, high compatibility. Across three Static nights you direct both of them through friendly jabs and a shared war story, and a co-deployment pushes them to `closest`. Deploying them together grants the small synergy (opt-in). Mid-campaign, one falls — the survivor's grief is amplified (existing `sayHeroEvent('grief')`, deepened), and at The Wake the choice to bring the fallen one back is now *about* the one still standing.

---

## 12. Technical fit (so it's actually buildable)

### 12.1 New surface (small)
- **State:** `CAMPAIGN.offhours` (§5.1) — one new object, defaulted on legacy load in `deserializeHubCampaign` (`js/hub.js`).
- **Content pools (data, not code):** `OFFHOURS` scene/gossip/gift pools with a `versions[]` table — *clone the exact pattern* of `LORE_DATA.versions` / `NPC_LORE.versions` (`_poolLens`/`npcPoolLens`, `_loPickN`). New file, e.g. `js/offhours_data.js`, loaded after `lore_data.js`/`npc_lore_data.js` in `rts.html` (respecting script-order-is-dependency-graph).
- **Runtime:** `js/offhours.js` (bond math, scene resolution, mood) — loaded after `npc_lore.js`, before `ui.js`.
- **UI:** `openVenueMenu(poi, vet)` in `js/ui.js` on the `openHubMenu(spec)` shell.
- **New venue-staff NPCs:** extend `NPC_STAFF_COUNT` in `js/npc_lore.js` so the bar/club/diner mint provider NPCs via the existing `np:<poiId>:<slot>` path — no new id scheme. The **bartender-confidant** is the exception: it's a *hand-authored* recurring NPC, so it carries a `fixed` dossier instead of a procedural one — stable name/voice/backstory campaign-wide. `buildDossier` (`js/lore.js`) **already** short-circuits to a hand-authored identity when `lore.fixed` is set (the named-hero path); `buildNpcDossier` (`js/npc_lore.js`) does **not** yet, so this needs a small parallel addition: a `fixed`-record branch at the top of `buildNpcDossier` that returns the authored dossier and skips the seeded draw stream. Cheap, and it leaves every other staffer procedural.
- **Net:** one new host-authoritative `net*` wrapper in `js/net/commands.js` for committing a scene outcome; include `CAMPAIGN.offhours` in `js/net/sync.js` snapshot packing if it must reach clients (likely just host state + result echo).

### 12.2 Reused functions (the bulk of the work is *wiring*, not inventing)
| Need | Reuse |
|---|---|
| Place & gate venues | `HUB.pois` + `megaSprites` (`js/hub_map_data.js`), `hubPoiAvailable`, `cfg.scenery` (`js/hub.js`) |
| Route walk-to-venue → menu | `hubUnitArrivedPoi` switch (`js/hub.js`) |
| Menu shell + no-eaten-clicks | `openHubMenu(spec)` + `signature()` rebuild, `hubMenuUnitCard` (`js/ui.js`) |
| Slot-fill the veteran's lines | `buildDossier().fill` (`js/lore.js`) |
| Slot-fill the NPC counterpart's lines | `buildNpcDossier().fill` (`js/npc_lore.js`) |
| Write canon outcomes | `rollLifeEvent` / `u.lore.events` append (`js/lore.js`), NPC `ev` log (`js/npc_lore.js`) |
| Dream/capstone payoff | `applyEventFx` `capstone` / `dreamDone` (`js/lore.js`) |
| Morale/strain payoff | existing field-relief envelope (`madReliefActive`/`madEffective`/`madHeal`, psychologist system) |
| In-world staging | `pushDialog`/`drawDialogs` (`js/dialogs.js`), `cutscene.js` |
| Ambient/caught moments | `npcAmbientLine` (`js/npc_lore.js`), closed-form routines (`js/hub_npcs.js`) |
| New venue-staff NPCs | `NPC_STAFF_COUNT` + `np:<poiId>:<slot>` minting (`js/npc_lore.js`) |
| Who-needs-a-night list | `hubVetStatus`/roster (`js/lore.js` `rosterHTML`, `js/hub.js`) |
| Determinism | `makeRng` everywhere (`js/state.js`) |
| Voice new lines | `VOICE.playLore`/index-keyed clips (`js/voice.js`) + `starleft-lore-forge` |

### 12.3 Contract compliance checklist
- ✅ **No avatar:** every bond is vet↔vet or vet↔NPC; no Founder party id exists in the data model.
- ✅ **Save-compat:** legacy → empty `offhours`; every field defaulted; no old save requires Off-Hours data.
- ✅ **Append-only:** `seen[]`, scene/gossip/gift pools grow by append; never reorder (voice indices).
- ✅ **Version-gating:** `offhours.v` stamps content-version at mint; minted bonds keep their pool shape (`_poolLens` clone).
- ✅ **netRole:** client renders, never simulates; outcomes via host-authoritative `net*` wrapper; UI is local.
- ✅ **Determinism:** all rolls via `makeRng` seeded by stable ids + visit; no `Math.random()` in sim paths.
- ✅ **Routines:** venue + NPC routing closed-form, no `hubpoi` cmds.
- ✅ **UI:** `signature()`-gated rebuilds; mobile single-column; HUD-height math untouched (overlay, not new HUD band).
- ✅ **Art:** procedural neon-facade fallback if a venue sprite is absent.

---

## 13. Content pipeline

Authoring and **voicing** the scenes is a `starleft-lore-forge` job — that skill already owns the append-only contract, the per-unit voice map, the version-gating that freezes existing identities as pools grow, and the **hard approval gate before any voice is recorded**.

- **Scene/gossip/gift pools** are authored as slot templates (§6.1) and stamped into `OFFHOURS.versions[]` rows so a bond minted at v=N keeps drawing from v=N forever.
- **Voice:** the **veteran's** variable-free lines get a `sayIdx` and a pre-rendered clip in *that veteran's* existing voice (`SPEAKER_VOICE`), exactly like `LORE_SAY`; templated lines stay text-only. **NPC counterpart lines** are voiced from the NPC's role voice where one exists (the bartender-confidant is a strong candidate for a dedicated cast voice, since they recur across the whole campaign) and otherwise stay text. **There are no Founder lines to voice** — the player is silent, because the player has no body in the scene.
- **Volume targets (initial):** authoring counts per phase in §14 (enough for variety without a wall of work): e.g. P0 ≈ 12–16 bar scenes across tiers + 1 personal-arc skeleton + the bartender-confidant's recurring lines; later phases add club/diner/gift pools.
- **Tone bible:** dark cyberpunk, dry, specific; warmth is earned and rare; no bright/quippy register; lean on the existing `world-bible.md` and `story-polish.md` voice.

---

## 14. Phased rollout (greenlight one phase at a time)

**P0 — Ledger + the Late Shift (vet ↔ confidant NPC).** *The vertical slice.*
- Build `CAMPAIGN.offhours` + BondRecord + save-compat defaults.
- One venue POI (the bar) + the bartender-confidant venue-staff NPC; `openVenueMenu` on the hub-menu shell.
- ~12–16 authored bar scenes across tiers; confidant bond; downtime budget + M3$ cost.
- Outcomes write life-events into the dossier. **No payoffs yet** beyond morale.
- **DoD:** walk a vet to the bar → stage a scene with the bartender → a new line appears in the vet's service record → save/reload preserves the bond → host & client co-op behave (client renders, host commits).

**P1 — Marisol's (vet↔kin) + reconciliation/grief.**
- Diner venue; walk-the-vet-to-their-kin scenes against the existing relative NPCs.
- Dual-write life-events (vet + kin `ev`); mourning-kin grief scene (send a squadmate); thread to The Wake prioritization.
- First capstone payoff (reconciliation → `dreamDone`).
- **DoD:** reconcile a named relative → both files updated → falling that vet worsens the kin's mourning beat.

**P2 — Static (vet↔vet) + ambient sim.**
- Club venue; compatibility math; friend/rival/romance bonds where you direct both veterans; the thin mood layer + "needs a night out" list.
- Ambient/caught (FE3H) moments via `npcAmbientLine`; opt-in deploy-together synergy.
- **DoD:** two vets reach `closest` over multiple nights → deploy-together synergy applies → a partner's death amplifies grief.

**P3 — Gifts, keepsakes, polish, (optional) The Landing.**
- Gift item + affinities + keepsake loop; in-world `cutscene.js` staging for big beats; voice pass (lore-forge, with the hard approval gate); optional rooftop seek-out venue.
- **DoD:** full Hades on-ramp works; voiced milestone scenes; everything still loads a P0-era save cleanly.

---

## 15. Risks & open questions

| Risk / question | Note / mitigation |
|---|---|
| **Scope creep into a full Sim** | The "light" mood layer is a hard line. If P2's autonomy starts needing balance passes, cut it back to caught-moments only. |
| **Authoring volume** | Slot templates + version-gating keep per-scene cost low; lean on lore-forge. Start with the bar's vertical slice before committing to all venues. |
| **Co-op determinism of checks** | All rolls seeded by stable ids + visit via `makeRng`; commit host-authoritative. Verify in live co-op (the repo has a standing "co-op unverified live" debt — budget a real two-client test). |
| **Save bloat** | BondRecords are tiny (short keys, capped `seen[]`). Saves are already LZ-compressed (`saveWrite`/`saveRead`). Cap total bonds if needed (e.g. drop tier-0 untouched bonds). **Never** stash DOM refs on bonds (the `_ghostBlit` lesson). |
| **Mood as identity** | Keep mood transient/derived; the *authored dossier* remains the source of identity truth, never overwritten by mood. |
| **Romance tone** | Oblique, tasteful, dark-cyberpunk; opt-in escalation; explicit content is a real possibility. |
| **Gate timing** | When should the district unlock? Recommend post-Ep IV–V (first dossiers) so bonds predate The Wake. **Open for the owner to set.** |
| **Directing both sides of a vet↔vet scene** | The player picks lines for *both* veterans (both are their units). Confirm this reads as "directing my squad," not "puppeteering a conversation." Mitigation: alternate turns clearly, label whose move it is. **Open.** |
| **NPC voice coverage** | The recurring bartender-confidant likely warrants a dedicated cast voice; one-off relatives/commuters can stay text. Scope the voice budget in the lore-forge pass. **Open.** |
| **Does it dilute The Wake?** | No — it *feeds* it. But sequencing matters: The Off-Hours must unlock *before* The Wake so attachments exist to be cashed in. |

---

## 16. Appendix — sources

**Hades / Hades II (Taverna, Nectar, Keepsakes, Ambrosia, NPC confidants)**
- https://hades.fandom.com/wiki/Keepsakes
- https://hades.fandom.com/wiki/Nectar
- https://hades.fandom.com/wiki/Nectar/Hades_II
- https://hades.fandom.com/wiki/Ambrosia/Hades_II
- https://www.thegamer.com/hades-2-hub-world-characters-story-mechanics/
- https://hades2.wiki.fextralife.com/The+Crossroads
- https://www.rpgsite.net/feature/10266-hades-nectar-guide-who-to-gift-nectar-to-for-keepsakes
- https://www.thegamer.com/hades-2-secret-new-character-references-nectar-ambrosia-use-keepsakes-trade/

**Persona 5 (Confidants / calendar scarcity)**
- https://www.rpgsite.net/feature/5479-persona-5-royal-confidant-guide-conversation-choices-answers-romance-options-gifts-skill-unlocks
- https://megamitensei.fandom.com/wiki/Confidant
- https://psnprofiles.com/guide/9938-persona-5-royal-confidants-guide

**Stardew Valley (heart events / friendship / gifts)**
- https://gamerant.com/stardew-valley-friendship-point-system-guide/
- https://www.switchbladegaming.com/stardew-valley/heart-events-guide/
- https://win.gg/news/your-guide-to-stardew-valley-gifts-hearts-and-friendships/

**The Sims (wants & fears / traits / autonomy / director stance)**
- https://sims.fandom.com/wiki/Wants_and_fears
- https://simscommunity.info/2022/07/27/guide-to-wants-and-fears-in-the-sims-4/
- https://www.thegamer.com/the-sims-4-wants-and-fears-system-explained/

**RimWorld (social / opinion / compatibility / emergent loss)**
- https://rimworldwiki.com/wiki/Social
- https://github.com/rwpsychology/Psychology
- https://neurolaunch.com/rimworld-psychology/

**Crusader Kings 3 (stress / traits / lifestyle / friend-rival)**
- https://gamerant.com/crusader-kings-3-ck3-best-personality-traits/
- https://steamcommunity.com/sharedfiles/filedetails/?id=2868962445 (Trait effects on Stress)
- https://www.neoseeker.com/crusader-kings-iii/Character_Guide

**Wildermyth (procedural relationships / compatibility / comic scenes / player-as-director)**
- https://wildermyth.com/wiki/Relationship
- https://www.superjumpmagazine.com/wordplayer-wildermyth-lays-bare-the-false-promises-of-ai-storytelling/
- https://www.pcgamesn.com/wildermyth/dnd-quiet-moments

**Disco Elysium / Citizen Sleeper (skill-check dialogue / dice economy / failure-as-content)**
- https://www.gabrielchauri.com/disco-elysium-rpg-system-analysis/
- https://discoelysium.wiki.gg/wiki/Skills
- https://games.mxdwn.com/reviews/citizen-sleeper-2-review/

**XCOM 2: War of the Chosen (soldier bonds) / Darkest Dungeon (stress, quirks)**
- https://fextralife.com/xcom-2-details-new-soldier-bonds-war-chosen-dlc/
- https://medium.com/game-design-inspirations/xcom-2-war-of-the-chosens-design-by-assimilation-f0004edf706b
- https://en.wikipedia.org/wiki/XCOM_2:_War_of_the_Chosen

**Mass Effect / Dragon Age (loyalty missions / companion banter / companion romance)**
- https://gamerant.com/dragon-age-veilguard-romance-relationship-level-mass-effect-good-why/
- https://masseffect.fandom.com/wiki/User_blog:Temporaryeditor78/squadmate-mission_matchups_for_maximum_dialogue_immersion

**Fire Emblem: Three Houses (seek-out supports)**
- https://www.rpgsite.net/feature/8759-fire-emblem-three-houses-dialogue-choices-consequences-and-support-guidewalkthrough
- https://www.thegamer.com/fire-emblem-three-houses-best-support-system-conversations-attitudes/

---

*End of spec. Design-only — no code changed. There is no Founder/CEO character: every scene is veteran↔NPC or veteran↔veteran, and the player directs the veterans. Build P0 (Ledger + the Late Shift vertical slice) first; each later phase must still load a P0-era save with zero migration.*
