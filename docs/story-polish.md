# STARLEFT — Story Polish: Complete Modification Spec

> **Status:** design reference, not yet built. This is an implementation-ready spec for a full narrative
> pass across the whole campaign. It is **canon-subordinate to `docs/world-bible.md`** (bible wins on
> conflict; *code* wins over both). Execution is owned by the **`starleft-mapmaker`**,
> **`starleft-lore-forge`**, and **`starleft-unit-forge`** skills — each modification below is tagged with
> its owner, channel, TTS cost, and `netRole`/save-compat posture so it can be picked up and built.
>
> **Goal (author):** make the campaign *hook* players and make them love the story. Specifically:
> (1) end-to-end arc polish; (2) the missing **unit↔hero / hero↔hero dialog**; (3) **foreshadowing** —
> plant late-arc clues in earlier episodes so players try to guess what's coming; (4) fix **Arc 1's
> "faction name-parade"** (no connective tissue, no dramatic weight); (5) give the **Reborn-Cyborg
> resurrection dilemma** real moral weight as the late-game emotional climax.

---

## §0 — How to read this doc

**Conventions.** Episode N = `MAPS[N-1]` (Ep I = `MAPS[0]`). Arc 1 = Eps I–VII; Arc 2 = Eps VIII–XIII;
Arc 3 = Eps XIV–XXIII (planned, see `docs/story-next-steps-ceo-arc.md`). `.5` entries are villain/interlude
maps appended past the linear track (`isVillain`, `gateAfter`/`returnTo`/`displayEp`). REX is the current
finale (`finale:true`).

**Channel legend & TTS cost** (audit-confirmed: every `assets/audio/voice/crawl/ep_00..19.mp3` exists):

| Channel | File | TTS cost |
|---|---|---|
| Crawl `text:` (opening scroll) | `js/maps_data.js` MAPS | **VOICED — editing = re-render** |
| Crawl `summary:` (MDC briefing, on-screen) | `js/maps_data.js` MAPS | **free** |
| `objective:` (HUD line) | `js/maps_data.js` MAPS | **free** |
| Unit/hero barks | `js/dialog_data.js` | free (text); a new clip is an *additive* render |
| In-mission cutscene lines | `js/dialog_data.js` + `holdout.framing.cutscene` | free (text); clips additive |
| News ticker (B.I.G. PAPA) | `js/ultra_news_data.js` + `js/lns.js` | **free** |
| Hub NPC ambient lines | `js/npc_lore_data.js` + `js/npc_lore.js` | **free** |
| Tips | `js/tips.js` | **free** |
| Sharecard caption | `js/sharecard.js` | **free** |

**Author decision: all crawls are open for rewrite** — the re-render cost is accepted. Still, where a *free*
channel achieves the same beat, prefer it; reserve voiced `text:` edits for places where the crawl itself is
the right vehicle (Arc 1 connective tissue, the 4 count fixes). Batch all approved `text:` edits into **one**
render pass (§10).

**Seed-discipline rule (hard).** **≤ 1 clue per channel per episode.** Clues must be **oblique** — casual
players miss them, attentive players catch them, and on replay they read as inevitable. **Never state a
withheld twist early:** Biba's android truth stays *implied* until the Ep XI altar (`EP11_ALTAR_LINES`);
Tusk is *felt before seen* (no name/face in Arc 2 — only an ageless, unseen "managing partner").

**Tone (hard, from the bible).** Dark / devastated / Hades — never bright. Hollow victories. Satire with a
beating heart (a human stake under every gag). No redemption arcs for villains. Reborn scarcity is sacred.

---

## §1 — Executive summary (highest-leverage moves)

1. **Rebuild Arc 1's spine** — rewrite Eps I–VII so each enemy is *causally produced by your last victory*,
   with **THE BOARD as the watching constant** (Ep I → coup at VI → "older money" buys the wreckage at VIII).
   Turns seven names into one rising tragedy. *(§2)*
2. **Seed Tusk/Arc 3 across Arc 2** via free channels (ticker/NPC/tips/barks) — today he has **zero**
   foreshadowing anywhere. Biggest setup gap; cheapest fix. *(§3, §7, §8)*
3. **Make the Reborn/Wake choice a moral beat**, not a one-line toast — the campaign's emotional climax. *(§7)*
4. **Give Nino & Biba an evolving, context-aware voice** + the first **hero↔hero and hero↔unit banter**;
   retire the anachronistic "we'll dig her out" lines once Biba has joined. *(§6)*
5. **Wire 4–6 new in-mission cutscenes** with the existing holdout recipe + lighter event-triggered banter. *(§5)*
6. **Fix the 4 ship-blocking base-count errors** in Eps III/IV/V/VI crawl text. *(§4)*
7. **Make the ticker / hub NPCs / tips reactive** to campaign progress (they're strong but static today). *(§8)*
8. **Strengthen Biba's android seeding** (Eps VIII–X) so the Ep XI altar reveal reads as a *payoff*. *(§3)*

---

## §2 — Arc 1: connective tissue & dramatic weight  *(author priority #4)*

### The problem (audit-confirmed)
Eps I–VII introduce seven factions — DISRUPTR INC. → MEGACORP → SYNERGY CORP → OMNICORP → THE CARTEL →
THE BOARD → THE CONGLOMERATE — each named, beaten, and forgotten. The canon logic exists in
`docs/world-bible.md` §2–3 ("each enemy is your own victims / investors / future self; the enemy gets
closer to home; the board always watches") but is **never surfaced in-game**, so it plays as a name-parade
with no dramatic weight and nothing to make the player *care*.

### The fix: one causal chain + one spine
**Principle: you make your own enemies, and the same money sits behind all of them.** Every Arc 1 crawl
should (a) **open on the consequence of the last victory**, (b) **name the new enemy as a product of that
consequence**, and (c) **recur THE BOARD** as the watching constant that finally turns on you.

| Ep | Enemy | What it *is* (surface this) | The thread to make explicit |
|----|-------|------------------------------|------------------------------|
| I | DISRUPTR INC. | a rival startup, like you | "the board is watching" (already there, `config.js:326`) |
| II | MEGACORP | the bloated incumbent | it *noticed the unicorn* — your success summoned it |
| III | SYNERGY CORP | **two rivals you bankrupted, merged** | your own wreckage, refinanced and pointed back at you |
| IV | OMNICORP | the monopoly | the thing **you are becoming** — the mirror/pivot |
| V | THE CARTEL | **your bankrupt victims' revenge coalition** | you *made* this enemy with your wins |
| VI | THE BOARD | **your own investors' coup** | the watching constant turns; the spine pays off |
| VII | THE CONGLOMERATE | everyone fused → **the flash** | older money has already filed paperwork for the ashes (→ A&O) |

### Per-episode crawl rewrites (voiced — batch one re-render)
Current voiced text is quoted, then the rewrite. Rewrites keep the Star-Wars cadence, the satire, and the
propulsive close; they add the causal hinge + the Board motif. (Free `summary:` already carries correct
counts; see §4.)

**Ep I — keep, sharpen the spine seed.** Current close is already "The board is watching. Synergy awaits…."
Keep it; this is the seed the whole spine pays off. *(No re-render needed unless other Ep I tweaks land.)*

**Ep II — make the incumbent a consequence.**
*Add one hinge sentence:* "DISRUPTR is ash, and your win did not go unnoticed — across the Silicon Wastes,
MEGACORP, a bloated incumbent with infinite cash and a litigation army, has decided a unicorn is just a
horse worth hunting." *(Close unchanged: "There is no exit strategy but victory….")*

**Ep III — your victims, merged** *(also fixes the count: text says "BOTH" but 3 enemies, `config.js:388`/`:396`)*:
> "Your war chest is overflowing and the press calls you a category leader — so the two rivals you
> bankrupted last quarter did the math and merged. Your own wreckage, refinanced and rebranded **SYNERGY
> CORP**: a hydra of campuses, double the middle managers, one synergy mandate. The board wired you extra
> Funding to finish what you started. Mine fast, scale faster, and liquidate **every campus** before the
> all-hands. The board calls it consolidation. You call it target practice."

**Ep IV — the mirror** *(count fix: "TWIN headquarters"/"BOTH" but 3 enemies, `:416`/`:424`)*:
> "You are no longer a startup. You are a threat — and you are starting to look like what you fight.
> **OMNICORP** owns the cloud, the ads, and the antitrust lawyers; it lit up **every headquarters it
> controls** to crush you for good. This is the exit. Burn it down and the market is yours. The only
> question left is whether there's a difference between you anymore. Go public, or go home."

**Ep V — you made this enemy** *(count fix: "three-campus coalition"/"all THREE" but 4 enemies, `:444`/`:452`)*:
> "You won. You are the monopoly. And monopolies make enemies — you made these yourself. The companies you
> broke have been comparing scars, and this quarter they pooled their severance into one coalition with a
> single line item: **disrupt the disruptor**. You didn't just make money. You made **THE CARTEL**. The
> board tripled your war chest — it would rather you win than wonder why it's so eager. Liquidate **every
> campus**, one quarterly review at a time."

**Ep VI — the spine turns** *(count fix: "three fortified strongholds"/"all THREE" but 4 enemies, `:472`/`:480`)*:
> "There is one threat left, and it has been watching since the garage. **THE BOARD** signed every check,
> counted every body, and approved every quarter you beat — and it has seen enough. The people who fund you
> are staging a coup of their own, **every stronghold** fortified, infinite lawyers, a vote to replace you
> with synergistic leadership. The real enemy was never across the map. It was always upstairs. **Vest, or
> die.**"

**Ep VII — the fuse + the A&O seed** *(8 enemies, count already correct)*:
> "You crushed the board. You ARE the market — so the survivors did the only thing left and fused into one.
> **THE CONGLOMERATE** rings a dead sea with eight subsidiary campuses across a frozen-and-scorched waste,
> defended by every lawyer money can rent. Reclaim your two lost outposts on the drifts and liquidate all
> eight. This is the last quarter… and somewhere upstream, older money than all of it — the kind that buys
> the beginning and the end — has already filed the paperwork for what comes after the fire. **Make it
> count.**"

> The Ep VII close is the single most important new seed in the game: it plants **A&O** ("buys the
> beginning and the end") and the **flash-as-opportunity-for-someone-else** the instant before the nuke —
> so Ep VIII's "A&O filed before the dust settled" lands as a payoff, not a new fact.

### Free reinforcement (no re-render)
- **B.I.G. PAPA = the connective narrator.** Fire a ticker line on each Arc 1 episode-unlock that
  Chekhov-guns the next faction and tracks the cost (drafted set in §8.1). The anchor's already perfect:
  B.I.G. PAPA is the in-world news anchor who *watched every atrocity*.
- **Post-mission debrief beat** (ticker push or toast on victory) names the human cost and threads to the
  next enemy: e.g. *"You disrupted DISRUPTR. Three interns didn't make payroll — permanently. MEGACORP's
  lawyers are already drafting."*
- **The human-cost ramp is the real weight.** Arc 1 is where attachment is built (career/dossier/memorial,
  `js/career.js`/`js/lore.js`). The flash (Ep VII) erasing the *entire* roster is the dramatic payoff of all
  of Arc 1. Two jobs: (1) **earn it** — surface the memorial/dreams cost as it grows (a one-line hub/toast
  beat when the wall crosses 5 / 10 names; see §8.2); (2) **foreshadow its totality** — the Ep VII A&O seed
  + a late-Arc-1 ticker line ("Every name you write down, somebody upstream reads in the dark.") so the
  wipe reads as *tragedy*, not a cheap twist.

### Constraint (important)
Arc 1 has **no on-field recurring hero** (Nino joins Ep VIII), and the cutscene camera needs a named entity
to anchor (`js/cutscene.js:35`). So Arc 1 dramatic weight rides on **crawls + ticker + debriefs + the
career/memorial engine** — *not* hero cutscenes. *Optional engine note (out of scope this pass):* anchoring
a cutscene on the player HQ would unlock scripted Arc 1 beats (e.g. a Board-coup sting at Ep VI). Flag for a
future engine task; do not assume it here.

---

## §3 — Cross-campaign foreshadowing ledger  *(author priority #3)*

The setup→payoff backbone. Every row: **target ep | artifact (channel) | drafted oblique clue | payoff**.
All clues honor the §0 seed rule (≤1/channel/episode, oblique, no early twist statements). **Free channels
unless noted.**

### B.1 — Arc 1 → Arc 2 (A&O · the GRAAL · subscription-immortality · the flash)

| Ep | Artifact | Drafted clue | Pays off |
|----|----------|--------------|----------|
| I | tip | "Idle interns are a balance-sheet leak with shoes. Somewhere, a fund is already pricing that leak." | A&O as cold accountant (VIII) |
| I | crawl close *(voiced, exists)* | "The board is watching." *(keep)* | the Board spine + A&O behind it |
| II | Consultant bark | "Even dead hardware stays on billing. You pay for a thing forever, once you own it." | "cancellation clause" (XII) |
| III | building-death bark | "Two companies become one. The survivors never do." | A&O as the merger that eats everything |
| IV | OMNICORP enemy bark | "We own the cloud. We own the ads. We own what happens after." | A&O omniscience / the GRAAL "after" |
| V | Cartel grunt bark | "We were born in your ledger. Every name you write down, somebody upstream reads in the dark." | A&O booking the fallen as inventory (XIII) |
| VI | Board bark | "Loyalty's a subscription. Mine expires next quarter." | "cancellation clause" (XII) |
| VI | crawl summary *(free)* | append: "Behind the board is older money — the kind that buys the wreckage when empires fall." | A&O (VIII) |
| VII | crawl close *(voiced, see §2)* | "older money… has already filed the paperwork for what comes after the fire" | A&O "filed before the dust settled" (VIII) |
| VII | post-mission ticker | "Eight mergers walk the dunes. Someone always profits from the dead — and they've already filed the paperwork." | the flash as a *migration event* (Arc 3) |
| 7.5 | crawl summary *(free)* | (the lone operator) "A&O filed a cleanup contract before the ash cooled. This is the contractor." | A&O is already everywhere (VIII) |

### B.2 — Biba android seeds (Eps VIII–X) → pays at the Ep XI altar (`EP11_ALTAR_LINES`)

Strengthen what exists (`dialog_data.js:501-502`); keep oblique per the bible. **Stay short of stating the
android truth.**

| Ep | Artifact | Drafted clue | Pays off |
|----|----------|--------------|----------|
| VIII | Nino bark | "A&O buried someone who remembers how to be human — or remembers *being* human. I can't tell which yet." | `altar_06` ("don't know whose life that was") |
| VIII | ticker | "PERSONNEL NOTICE: A&O quietly decommissioned its immortality project. Site sealed. Staff 'retired.'" | Biba caged for sabotage |
| IX | A&O guard bark | "She designed the vault. She designed how to break it, too. A&O doesn't make mistakes — *she* did." | architect-saboteur reveal |
| X | Biba first-rescue bark *(tier to fire FIRST)* | "I remember a family. Not sure it's mine." *(exists, `:502`)* | `altar_06` written memories |
| X | Nino post-rescue bark | "You weren't imprisoned. You were *stored*. There's a difference. I think." | "filed in a cell" / inventory-not-prisoner |

### B.3 — Arc 2 → Arc 3 (Tusk · Rust · Zeca · Project Chapter Eleven)  *(the biggest gap — all FREE)*

Tusk must be **felt, never seen** in Arc 2: an ageless, absent "managing partner." No name, no face.

| Ep | Artifact | Drafted clue | Pays off |
|----|----------|--------------|----------|
| VIII | ticker | "A&O's managing partner never shows at auctions. He just buys what's left. No one's seen him age." | Tusk = first GRAAL write (XIV+) |
| VIII | NPC (commuter) | "Managing partner's offices? Sealed. No birth, no death, no retirement on file since '87." | Tusk's impossible age (XVI seed→XXII reveal) |
| IX | Biba bark | "A&O didn't invent this cure. It copied the founder's own notes — and the founder is still here." | Tusk solved death *on himself* |
| X | captured-A&O bark | "Once a decade A&O *archives* someone instead of firing them. Nobody comes back from archive." | Rust & Zeca as archived cast-offs (XV/XVII) |
| XI | ticker | "The tower writes the dead into metal — that part's new. Repairing old shells in the sub-basement has run for years." | Tusk re-instantiating in secret |
| XI | tip | "The transfer tech is generic — mind into metal, flesh, a drive, a schedule. Only the market differs." | orbital soul-servers (XXI) |
| XII | NPC | "Subscription's simple: one soul, one body, one billing cycle. Except the line-item: 'Founder's License — perpetual, no renewal.'" | Tusk exempt from his own model |
| XII | ticker | "A&O's 'Diaspora Initiative' — off-world soul-server capacity — is operational and scaling. Details redacted." | THE OFFSITE (XXI) |
| XIII | A&O enforcer bark | "Every backup's locked with the founder's cipher. Nothing deletes until he says. And he never dies." | killing Tusk needs his custody key (XIX) |
| XIII | ticker | "The purge is a 'data-hygiene op' — unclaimed assets zeroed by default unless the owner surrenders the key." | Chapter Eleven mechanics (XIV) |
| 12.5 | crawl summary *(free)* | "A&O stopped relying on lawyers. Something's being built under the black ice." | REX / Tusk-pilots-REX (finale) |

### B.4 — Orphans (setups with no payoff / payoffs with thin setup) — close these

- **The Board** is named the "real enemy" (Ep VI) but never reconnects to A&O. → B.1 Ep VI/VII seeds make
  A&O the *older money behind the Board*, paying it off.
- **The flash** is total and shocking but barely foreshadowed. → B.1 Ep VII close + late-Arc-1 ticker plant it.
- **Subscription-immortality / "cancellation clause"** (Ep XII) arrives cold. → B.1 Ep II & VI barks plant it.
- **Tusk** (entire Arc 3) has no setup at all. → B.3 plants him across VIII–XIII + 12.5.
- **Biba's android reveal** is well-set-up already; B.2 just sharpens the firing order so the Ep X bark lands
  before the Ep XI altar.

---

## §4 — Per-episode crawl polish (all 20, incl. .5 interludes)

**Ship-blocking count fixes (do first; one re-render batch with the §2 Arc 1 rewrites).** The voiced `text:`
contradicts the objective on four maps; the on-screen `summary:` is already correct, so screens are fine in
the interim, but the *voice* is wrong:

| Ep | Voiced text says | Enemies placed | Fix (in the §2 rewrite) |
|----|------------------|----------------|--------------------------|
| III (`config.js:388`) | "BOTH campuses" | **3** (`:395`) | "every campus" |
| IV (`:416`) | "TWIN headquarters / BOTH" | **3** (`:423`) | "every headquarters it controls" |
| V (`:444`) | "three-campus coalition / all THREE" | **4** (`:451`) | "every campus" |
| VI (`:472`) | "three fortified strongholds / all THREE" | **4** (`:479`) | "every stronghold" |

**Per-episode notes (beyond §2's Arc 1 rewrites):**
- **Arc 2 crawls (VIII–XIII): do NOT touch the voiced `text:`** — they are the strongest writing in the game
  (Eps XI & XIII already use the contextual `{party}/{fallen}/{biba}` tokens, `config.js:714`/`:804`). All
  Arc 2 improvements go to **free channels** (barks/ticker/NPC/tips/cutscenes per §3/§5/§6/§8).
- **`.5` interludes — tie each to the spine via the free `summary:`** (they currently read as detached
  arena duels):
  - **7.5 Cyan Ninja:** "A&O filed a cleanup contract before the ash cooled. This is the contractor." (B.1)
  - **8.5 Land Grab / 9.5 Recovery Agent / 11.5 Grounds Dispute:** one summary line each framing the duel as
    an A&O enforcement action against your resurrection project (keeps the standing-enemy logic, world-bible §3).
  - **10.5 Extraction Clause:** already a Biba-escort beat — add a Tusk seed to its summary (B.3 register).
  - **12.5 Bridge Round:** the REX/Tusk bridge seed (B.3).
- **REX finale:** bridge it from a crawl/taunt re-skin per `docs/story-next-steps-ceo-arc.md` §2/§6 when Arc 3
  ships; until then, a pre-fight ticker/toast ("Something's alive in there.") plants the pilot (B.3, `REX_PRELUDE_LINES` §5).

---

## §5 — In-mission dialog & cutscenes  *(author priority #2)*

### §5.1 — The verified wiring recipe (the ONLY current trigger)
The cutscene sequencer (`js/cutscene.js`, `startFlashCutscene`) is generic and reusable, but the **only
in-mission trigger is the holdout reach-anchor** (`js/waves.js:146` `holdoutTryCutscene` → reads
`cfg.holdout.framing.cutscene` → resolves `window[name]` → plays before wave 0, one-shot via
`H._cutscenePlayed`). Today only Ep XI uses it (`config.js:744`). To add one:

1. Append in `js/dialog_data.js`:
   `const MY_SCENE_LINES = [{id:'myscene_00', speaker:'Nino', text:"…"}, …]; if(typeof window!=='undefined') window.MY_SCENE_LINES = MY_SCENE_LINES;`
2. On the map: `holdout:{ …, framing:{ cutscene:'MY_SCENE_LINES', … } }`.
3. Voice optional — clips at `assets/audio/voice/scene/<id>.mp3`; a missing clip plays **silent** (safe).
4. Constraints (do not violate): **solo-only** (`waves.js:149`); fires **once** before wave 0; the camera
   anchors the line's `speaker` (a `heroId`) if alive/on-field, else the focus hero (`cutscene.js:35`); the
   sim is frozen while it plays (`main.js`). **A map without a holdout cannot take a full cutscene** without
   changing its win condition → use §5.3 lighter banter instead.

### §5.2 — Proposed scripted cutscenes (drafted)

**`EP12_FARM_LINES`** — Continuity Farm (requires adding a small holdout/"seize the lattice" beat to Ep XII,
or attach to the existing raze flow via a future trigger; flag the dependency):
```
{id:'farm_00', speaker:'Biba', text:"Refrigerated bodies. Addressed, racked, waiting. But the minds aren't here."}
{id:'farm_01', speaker:'Nino',  text:"Then where? We crossed six campuses for an empty warehouse?"}
{id:'farm_02', speaker:'Biba', text:"Upstream. On his servers. We're cracking a catalog, not a crypt."}
{id:'farm_03', speaker:'Nino',  text:"'His.' You keep saying his."}
{id:'farm_04', speaker:'Biba', text:"There's a perpetual license on one account. No renewal. Somebody built himself an exit and billed everyone else for theirs."}  // Tusk seed (B.3)
```

**`EP13_VAULT_LINES`** — The Vesting Cliff (Ep XIII already has the cold-vault setting; add a holdout/"reach
the deep archive" beat to host it):
```
{id:'vault_00', speaker:'Nino',  text:"Every name on our wall is in these racks. Filed as 'delinquent.'"}
{id:'vault_01', speaker:'Biba', text:"We're not saving them. We're repossessing them. A&O's word. A&O's machine."}
{id:'vault_02', speaker:'Nino',  text:"Then we steal them back and call it something else."}
{id:'vault_03', speaker:'Biba', text:"You can still only write one of them home. The rest stay data. Remember that when you choose."}  // Reborn-dilemma setup (§7)
{id:'vault_04', speaker:'Nino',  text:"Whoever scheduled this purge never signed it. Like he's somewhere we can't reach yet."}  // Tusk seed (B.3)
```

**`REX_PRELUDE_LINES`** — finale bridge + pilot seed (attach to the REX arena's entry):
```
{id:'rexpre_00', speaker:'Nino',  text:"The vaults are empty. A&O stopped sending lawyers."}
{id:'rexpre_01', speaker:'Biba', text:"Because it sent a building. Five stories of foreclosure — and it's warm. Something's alive in there."}
{id:'rexpre_02', speaker:'Nino',  text:"Bring everyone. Bring everything."}
```

**`EP75_NINJA_LINES`** — anchor the 7.5 duel to A&O (needs a named speaker on-field; if none, route to §5.3):
```
{id:'ninja_00', speaker:'Nino',  text:"A&O filed a cleanup contract before the ash cooled. This is the contractor."}
{id:'ninja_01', speaker:'Nino',  text:"Pin him fast. He doesn't want to die here — he wants to leave and report what crawled out."}
```
*(7.5 sits between the flash and Ep VIII; Nino re-enters at VIII, so verify a hero anchor exists on 7.5
before wiring — otherwise deliver these two lines as a ticker/toast.)*

### §5.3 — Lighter event-triggered banter (no holdout; safe in Arc 1 & early Arc 2)
Hook **existing event paths**, not the sequencer. Each is a one-box bark via the `dialogs.js` producers.

| Trigger | Speaker | Line | Hook | netRole |
|---------|---------|------|------|---------|
| Vet dies while a hero is on-field | nearest hero | "Another name. Another debt." | `lore.js` recordFallen | solo/host (cosmetic), local on client |
| Biba heals an ally from <20% HP | Biba | "You're not on the wall today. Keep it that way." | healer tick, `units.js` | cosmetic = local OK |
| Enemy HQ destroyed | nearest hero / unit | faction one-liner (e.g. Ep IV: "OMNICORP is what we're becoming. Burn it anyway.") | base-destroy path, `core.js` | cosmetic = local OK |
| First contact w/ a new faction | — | ticker push (§8.1) | faction-spawn / first-sight | ticker local |

**netRole rule:** purely cosmetic barks may fire locally on any role; anything that *reads or mutates
gameplay state* must be host-authoritative and routed through the `net*` wrappers (`js/net/commands.js`).
Clients never simulate — they show what snapshots carry (world-bible / `CLAUDE.md`).

---

## §6 — Hero & unit voice  *(author priority #2)*

Today Nino (41 barks, `dialog_data.js:421`) and Biba (41, `:463`) are **static across all arcs** and never
converse outside the Ep XI altar. Worse, some are **anachronistic** — Nino still says "A&O buried the one
who brings them back. We dig her out." / "Chased a rumor to a name: Biba. She's the way back." (`:458-461`)
*after Biba is standing next to him.*

### §6.1 — Tiered `HERO_SELECT_LINES` (episode-aware)
Add subpools picked by `mapIndex` (or `CAMPAIGN.nextMapIndex`) at bark-time in `js/dialogs.js`. **The
existing 41 stay as the default tier** (save-compat + clip-index safety — clips are index-keyed, §10). New
tiers are *additional* pools.

**Nino arc:**
- **VIII–IX (hunting the rumor):** "A&O buried the answer. She *is* the answer." · "A blueprint's trash
  without the architect." · "Somewhere under the sabotage there's a name. I'm going to find it."
- **X–XI (alliance formed — retires the 'dig her out' lines):** "You turned the death-machine off and they
  caged you for it. I'd have done worse." · "The cure was hers. The debt is ours. We pay it." · "I dig my
  hires out once. You're the once."
- **XII–XIII (carrying the wall):** "Every name. We carry every name out, or none of it meant anything." ·
  "I wrote them onto that wall. I'm here to read some off." · "A&O calls them inventory. I knew their kids' names."

**Biba arc:**
- **VIII–X (oblique unease — NEVER the android truth):** "I was the cure. Now I'm the cage." · "Lagos-2,
  six siblings… real weights, or data? I can't tell." · "They don't fire a machine that refuses. They file it."
- **XI+ (post-altar; gate on an Ep-XI 'altar seen' flag):** "I'm not the first one resurrected. I'm the
  first one *free* of it." · "I built the wall's way home. I also built the lie under it." · "Salvation,
  theft — the chip can't tell them apart. Neither can I. Hold the line; I'll solder."

### §6.2 — `HERO_DUET_LINES` (the first hero↔hero banter)
New pool keyed by *both heroes alive*; in `dialogs.js` selection, ~50% chance to fire a duet when both Nino
& Biba are on-field. This is where the player *discovers they know each other* — making the altar reveal feel
earned, not imposed.
```
Nino: "You can still back out."            Biba: "Healers don't quit. I never could."
Nino: "A&O's cure is ours now."            Biba: "No. It's ours to destroy."
Biba: "You bought senators."               Nino: "Nobody bought me back. Your move."
Biba: "How many on the wall are yours?"    Nino: "All of them. That's the point."
Nino: "You okay walking back in there?"    Biba: "It built me. I'd like to see its face."   // late-tier only (post-XI)
```

### §6.3 — `HERO_MENTOR_LINES` (hero↔unit)
Heroes acknowledge the rank-and-file (the people the campaign asks you to grieve):
- **Biba on saving a vet:** "Big-sister rule. Nobody gets left behind. Not again."
- **Nino to a fresh recruit (Lv2 dossier mint):** "You've got a name now. Try to keep it off the wall."
- **Either, on a vet hitting Director rank:** "Twenty years of quarterly disasters and still breathing. Buy yourself something."

### §6.4 — Unit-type bark foreshadowing seeds
Append (append-only!) a few Arc-1 unit barks carrying the §3 motifs so the world hums with the future:
- **Consultant:** "Even dead hardware stays on billing." (B.1 subscription)
- **Lobbyist:** "Every name you write down, somebody upstream reads in the dark." (B.1 inventory)
- **Growth Cyborg:** "Move fast, break things. The board calls the things 'people.'" (theme/weight)

---

## §7 — The Reborn-Cyborg moral dilemma & Arc 3  *(author priority #5)*

> The author's note: **the resurrected cyborgs are the moral and emotional climax of the late game.** This
> section designs that weight in full and ties Arc 3 to it. (Mechanics live in `js/hub.js` (the Wake),
> `js/career.js`, `js/lore.js`; Arc 3 map/route spec in `docs/story-next-steps-ceo-arc.md`.)

### §7.1 — The current state (audit)
The Wake is **live and standing** (not arc-gated): appears at `CAMPAIGN.nextMapIndex >= 11`, resurrection
unlocks `>= 13`; **3 ever, 1 at a time** (`rebornTotalCap:3`, `rebornSlotCap:1`). A Reborn returns with
**+15% HP and zero self-heal** (`REBORN.hpMul`/`regenMul`), "scarred." But narratively it is a **silent
mechanic**: choosing whom to raise is mechanically gated and dramatically blank, and completion is a single
toast — *"⚡ A veteran rises from The Wake — a Reborn Cyborg. Nothing came back whole."* No scene, no
reaction, no weight. **This is a wasted climax.**

### §7.2 — The design: make the *choice* the drama
The dilemma is already perfect mechanically (scarcity); it just needs framing. Three layers, all **free**
(no new systems — bark pools + light hub/lore hooks + UI copy):

**(a) The Wall as a choice you have to *read*.** When the player opens the Wake to resurrect, frame it as
walking the memorial: each fallen card already shows name, hometown, career title, last bark/dream, where
they fell, and **dream fulfilled ✓ / unfulfilled ✗** (`ui.js` buildWakeBody, `:1235`). Lean into it — a
header line: *"Three, ever. One at a time. The rest keep their place on the wall. Choose."* The cost of
choosing one **is** seeing the others you didn't.

**(b) What it costs them to come back.** The Reborn returns *wrong* — fragile, no self-heal, a scarred mind.
Make that legible and meaningful: a small bespoke **Reborn bark pool** — fragmentary, haunted, the dream
*broken* (they don't speak like the living):
```
"I remember the wall. I remember being on it. I don't remember leaving."
"You wrote me home. Home is colder than I left it."
"My dream came back blank. Was there one?"
"Thank you. I think. Thanking is a thing I used to know how to mean."
"Nothing churns now. That's not the same as alive."
```
*(Optional unit-forge fast-follow: a visibly-distinct Reborn sprite/voice — flagged in story-next-steps §6;
not required for the narrative beat.)*

**(c) The heroes react to *who* you raised** — `REBORN_CHOICE_LINES`, fired from `hub.js` `hubWakeComplete`
(replacing the lone toast), keyed to the raised unit's relationship:
```
raised a unit Nino hired   → Nino:  "They come back. On my debt. I'll cover it."
raised a unit Biba healed  → Biba: "They come back wrong. But they come back. I'll take wrong."
raised a dream-fulfilled vet → Biba: "They got their wish, then we dragged them back. I hope that's mercy."
raised a dream-unfulfilled vet → Nino: "Unfinished business. Maybe that's why the machine took."
any                         → Biba: "One off the wall. Don't make me tell you how many are left."
```

**(d) Perfect-extraction memorial beat.** If the player pulls every backup (0 vet losses, the Ep XIII `wall`
quest / Eps XII–XIII), set a `CAMPAIGN` flag and play a 2-line hub beat on next entry (free, no sequencer):
*Nino: "Every name. None left on the wall for A&O to bill." / Biba: "They're ours now. Not inventory."*

### §7.3 — The moral core: you and Tusk run the same machine
This is the theme that gives the Reborn weight and binds it to Arc 3. **Resurrecting someone uses the exact
machine Biba sabotaged and the Continuity Farm monetized** — so the player becomes *complicit* in the thing
they spent Arc 2 condemning. The doc makes this explicit (in Biba's late barks and the Wake copy): the GRAAL
"can't tell salvation from theft" (`altar_08`) — and now *you* are running it.

**Tusk is the dark mirror.** He is the **first successful GRAAL write** — he resurrected *himself*, perfectly,
indefinitely, for free, because he *owns* the machine. You get three-ever-one-at-a-time, each returning
wrong. The contrast IS the moral spine of Arc 3:

| | The player | Tusk |
|---|---|---|
| How many | 3, ever | unlimited |
| Cadence | 1 at a time, slow | instant, on death |
| Condition | comes back *wrong* | comes back *whole* |
| Price | M3$ + the wall's other names | exempt — "perpetual, no renewal" |

Defeating Tusk does **not** redeem the machine or expand the player's gift. The wall keeps most of its names.
That permanence is the engine — **do not soften it** (world-bible §2, story-next-steps §7).

### §7.4 — Arc 3 narrative design (woven with the dilemma)
Full beats per `docs/story-next-steps-ceo-arc.md` §4 (12 maps, XIV–XXIII + 2 interludes), here re-centered on
the Reborn stakes:

- **The stakes ARE the dilemma.** Tusk's **PROJECT CHAPTER ELEVEN / the PURGE** zeroes the upstream **backup
  pool** — the very names you might still write home. Arc 3 is a fight to **preserve the dilemma itself**:
  keep the wall's names recoverable at all. (Reborn is **never** re-gated/unlocked/expanded by Arc 3 — its
  stakes are the *pool*, per the bible's hard rule.)
- **XIV — THE RECALL NOTICE:** Tusk surfaces (voice only, never pitied), declares the company + dead
  delinquent inventory, starts the purge clock. *Reborn tie:* the clock = names that can no longer be written
  home if he wins. (Pays off B.3 XIII ticker.)
- **XV / XV.5 — THE FOUNDRY RAID / NON-COMPETE:** recruit **RUST** (boss-duel→defection): his raid strips
  Tusk's foreclosure-mech swarm so the finale fields *one* REX; his chassis is the only body that tanks REX's
  stomp. *He makes the finale survivable.* (Pays off B.3 X "archived" bark.)
- **XVI — THE SEVERANCE PACKAGE:** first hard Tusk seed pays — Rust scans Tusk's marketing render: "hasn't
  aged in a render since the year he supposedly died." (Pays off B.3 VIII NPC.)
- **XVII / XVII.5 — THE GROWTH TEAM / PERFORMANCE REVIEW:** rescue **ZECA** (Nino-proximity, the Biba pattern):
  a prodigy "paid in exposure and a memorial slot," his throughput is the engine of the purge. Overclock aura
  previews. *He makes Tusk killable.*
- **XVIII / XIX — THE VELOCITY TRAP / THE DATA VAULT:** Zeca's Overclock cracks Upstream Custody — **the backup
  pool is saved from the purge**, and inside sits one more backup: **the founder's**. *The keys to the dead
  are the keys to the man.* Now Tusk can die for good. Hollow note: the dead are yours **as data**; the Wake
  still writes only 3. (Pays off B.3 XIII enforcer bark.)
- **XX / XXI — THE BURN RATE / THE OFFSITE:** Tusk triggers the manual purge and comes for the keys; then you
  burn his off-world **soul-server** launch site so he can't flee his own death. (Pays off B.3 XI tip + XII
  Diaspora ticker — the Musk-satire register: death-as-migration.)
- **XXII / XXIII — THE GOLDEN PARACHUTE / THE LIQUIDATION EVENT:** full Tusk reveal — Biba names it at his own
  keynote ("he is what I built, wearing the man who paid for it"); he flees into **REX**, re-skinned as his
  escape vehicle (`finale:true` routing 1:1, no `villains.js` rewrite). You can only end him **because you
  hold his backup**. *No triumph:* the IPO is yours and hollow; **you saved the pool but still only wrote
  three home.** The wall is still the wall.

**Guardrails (story-next-steps §7, restated):** dark/Hades, hollow victory; Tusk never redeemed or pitied
(his defeat is a *write-off*); Rust's humor is gallows not hope-core; Zeca's speed is grief with a stopwatch;
**Reborn stays scarce (3 ever) and never arc-gated.**

---

## §8 — Peripheral texture (all FREE)  *(supports #3 and #4)*

The audit rates these channels strong but **static**. Make them **reactive** — this is the cheapest, highest-
breadth way to carry foreshadowing (§3) and Arc-1 connective tissue (§2) with zero TTS cost.

### §8.1 — News ticker (B.I.G. PAPA) — `js/ultra_news_data.js` + a hook in `js/lns.js`
Add a fire-on-state layer (today the pool is static): trigger on **episode-unlock**, **visit-count gates**,
and **achievements** (one line in `ACH.fire()`, `js/achievements.js`). All B.3 Tusk seeds route here.

**Arc 1 faction Chekhov-guns (fire on the *next* episode's unlock):**
- (after I) "B.I.G. PAPA: Unicorn status confirmed. The incumbent noticed. The litigation army is mobilizing."
- (after II) "B.I.G. PAPA: Your two biggest rivals just filed merger papers. Synergy awaits — and it has teeth."
- (after IV) "B.I.G. PAPA: Your bankrupt victims are pooling severance. THE CARTEL is recruiting across the wastes."
- (after V) "B.I.G. PAPA: The board smells blood. Governance is no longer a metaphor."

**Memorial-dread gates (visit/fallen count):**
- (≥6 fallen) "B.I.G. PAPA: The memorial is growing faster than the org chart. The board calls it cost optimization."
- (≥10 fallen) "B.I.G. PAPA: The wall hit double digits. The board sent flowers. The condos sent grief." *(also the `ACH.fire('wall')` hook)*

**Tusk seeds (Arc 2; see B.3 for placement):** "A&O's managing partner never shows at auctions…", "the
Diaspora Initiative is operational…", "the purge is a 'data-hygiene op'…".

### §8.2 — Hub NPC ambient chatter — `js/npc_lore_data.js` + `js/npc_lore.js`
NPCs have deep lore but **no ambient lines** today. Add chatter tied to **life-event flags + arc progress** —
make the city *react* to your descent. (≤1 per archetype per visit.)
- **Commuter (Tusk seed):** "Managing partner's offices are sealed. No death on file since '87."
- **Mourning household (humanize):** "She keeps his comm charged. Nobody tells her it's off forever."
- **Facility staff (memorial weight):** "Found a helmet in the parts bin. Name scratched inside. Didn't ask who owned it."
- **ULTRA analyst (war-weariness):** "Casualty numbers started trending up in the quarterly slides. I stopped sleeping right after."
- **Arc-2 commuter (Diaspora seed):** "A&O's shipping souls off-world now. 'Diaspora,' they call it."

### §8.3 — Tips — `js/tips.js` (arc-phased selection; 3 sets)
Today all tips are static. Select by campaign phase:
- **Early (I–II):** "Move fast, break things. The things are other startups. The people are collateral."
- **Mid (V–VII):** "Your interns have names now. The casualty feed has their names. The difference is narrowing."
- **Late (IX–XIII):** "Immortality costs a subscription. The quarterly earnings call is in hell." · "A backup
  can't die. Only instances can. One man knows the difference." *(Tusk seed)*

### §8.4 — Achievements & sharecard
- **Achievement → ticker hook** (`js/achievements.js` `ACH.fire`): one line pushes a matching B.I.G. PAPA
  item so the world *notices* the player's milestone (e.g. "Ghost Equity" / first Reborn → "A resurrection.
  The Wake worked. The board is *very* interested in the IP.").
- **Sharecard caption** (`js/sharecard.js`): add campaign context to the memorial PNG — "★ active — N tours"
  or "fell at VI: The Hostile Board — the wall reached 14." Low effort, high pathos.

---

## §9 — Tone guardrails (apply to every drafted line)

- Dark / devastated / Hades — **never bright.** Deep blacks, cold teals, red/violet; coolant-as-death.
- **Hollow victories.** No clean triumph, no sunrise, no team-hug. Wins are grim necessity.
- **Satire with a beating heart.** Every gag sits on a human stake; comedy never undercuts grief.
- **Villains are never redeemed or pitied.** A&O is faceless capital; Tusk is capital wearing a man — his
  defeat is a write-off.
- **Rust = gallows humor, not hope-core; Zeca = speed as grief.**
- **Reborn scarcity (3 ever) is sacred.** The wall keeping most of its names is the emotional engine — do not
  soften it, and never let any chapter expand or re-gate resurrection.

---

## §10 — Production notes & risks

- **Save compatibility (mandatory, `CLAUDE.md`/world-bible).** All new line pools are **append-only**. Never
  reindex `LORE_SAY` (index-aligned to `LORE_DATA.events`) or reorder existing hero/unit bark arrays — **voice
  clips are index-keyed**, so a reorder silently mis-voices shipped lines. New tiers are *additional* subpools;
  the original 41 Nino / 41 Biba barks remain the default tier. New `CAMPAIGN` flags must **default safe when
  absent** (legacy save = flag false).
- **`netRole` (solo/host/client).** In-mission cutscenes are **solo-only by design** (`waves.js:149`); co-op
  keeps the toast framing — keep it. Lore/career events run solo/host only; clients render synced `G`.
  Cosmetic barks may fire locally; any trigger that reads/mutates gameplay must be host-authoritative via the
  `net*` wrappers (`js/net/commands.js`). Snapshot shape changes (none needed here) would touch `js/net/sync.js`.
- **TTS cost.** Every `ep_NN.mp3` exists → voiced `text:` is frozen unless re-rendered. **Batch** the 4 count
  fixes + the §2 Arc 1 rewrites into **one** render pass (the "rod" narrator). New scene/bark clips are
  *additive* renders; the game is **silent-safe**, so ship text first and voice later. (An *insert* would shift
  every later clip index — but every change here is an **append or in-place text edit**, never an insert, so
  indices are preserved.)
- **Append-only lore contract.** Honor lore-forge version-gating that freezes existing veterans' identities
  and the frozen RNG draw order when pools grow.
- **Skill ownership.**
  - **`starleft-mapmaker`** — crawl `text`/`summary`/`objective` edits, the 4 count fixes + re-render batch,
    new `holdout.framing.cutscene` wiring, `.5`/REX framing, Arc-3 map configs (when built). Runs the validator
    (faction-in-crawl-and-objective; base-count == placed enemies).
  - **`starleft-lore-forge`** — all new bark pools (tiered `HERO_SELECT_LINES`, `HERO_DUET_LINES`,
    `HERO_MENTOR_LINES`, unit seeds), cutscene line arrays (`EP12_FARM_LINES`/`EP13_VAULT_LINES`/
    `REX_PRELUDE_LINES`/`EP75_NINJA_LINES`), `REBORN_CHOICE_LINES` + the Reborn bark pool, ticker/NPC/tip lines,
    and the text→TTS pipeline + the **hard approval gate** before any voice is recorded.
  - **`starleft-unit-forge`** — only if Arc-3 Rust/Zeca/Tusk (and the optional distinct Reborn sprite) are built
    (sprites/DEF/stats; lore-forge owns their voice).
- **Risk — over-seeding.** Enforce the §0 rule (≤1 clue/channel/episode). Too many clues turns mystery into
  exposition and breaks the "guess what's coming" payoff the author wants.
- **Dependency flags.** `EP12_FARM_LINES`/`EP13_VAULT_LINES` need a holdout (or a future generic trigger) to
  host them; Eps XII/XIII are raze-flow today. Either add a small "seize"/"reach the archive" holdout beat
  (mapmaker) or defer those two to a generic mission-event trigger (engine task, out of scope here).

---

## §11 — Suggested implementation order (for later greenlight)

| Phase | Work | Owner | TTS |
|------|------|-------|-----|
| **0 — Correctness** | Fix the 4 base-count mismatches (Eps III/IV/V/VI); queue the re-render. | mapmaker | re-render (batched) |
| **1 — Free foreshadowing layer** | All §8 reactive ticker/NPC/tip lines + the `ACH.fire()` ticker hook; plant every B.3 Tusk seed + B.1/B.2 seeds. Fixes Tusk-invisibility & the subscription/inventory orphans in one pass. | lore-forge | none |
| **2 — Hero voice arc** | Episode-tiered `HERO_SELECT_LINES`, `HERO_DUET_LINES`, `HERO_MENTOR_LINES`, Biba VIII–X android-seed tier + post-altar tier; retire anachronistic lines. | lore-forge (+ `dialogs.js` picker) | additive clips |
| **3 — Arc 1 spine** | §2 crawl rewrites (causal chain + Board spine) — into the Phase-0 re-render batch; post-mission debrief beats. | mapmaker | re-render (batched) |
| **4 — In-mission beats** | Wire the cutscene arrays via the holdout recipe (+ any needed holdout beats) and the §5.3 event banter, solo-gated. | mapmaker wires + lore-forge writes | additive clips |
| **5 — Reborn moral beat** | `REBORN_CHOICE_LINES` + Reborn bark pool; Wake copy; dream-fulfilled echo; perfect-extraction hub beat. | lore-forge (+ small `hub.js`/`lore.js`/`ui.js` hooks) | additive clips |
| **6 — Arc 3 seed verification + voice render** | Confirm every Arc-3 reveal has its earlier seed (no orphans); batch-render all approved new clips. | mapmaker + lore-forge | render pass |

---

## Appendix A — Critical files (reference)

- `js/maps_data.js` — `MAPS`: crawls/summaries/objectives/quests; `holdout.framing.cutscene` wiring.
- `js/dialog_data.js` — `SELECT_LINES`, `HERO_SELECT_LINES` (`:421`), `LORE_SAY`, cutscene arrays (`:1164`, `:1181`).
- `js/dialogs.js` — bark producers + selection refresh (where tier/duet/mentor logic hooks).
- `js/cutscene.js` + `js/waves.js` — the sequencer + its only trigger (`holdoutTryCutscene`, `:146`).
- `js/ultra_news_data.js` + `js/lns.js` — B.I.G. PAPA ticker.
- `js/npc_lore_data.js` + `js/npc_lore.js` — hub NPC lore/ambient.
- `js/tips.js`, `js/achievements.js`, `js/sharecard.js` — peripheral channels.
- `js/hub.js` (the Wake/Reborn), `js/lore.js` (memorial/dreams), `js/career.js` (XP/dossier/hero carryover).
- `docs/world-bible.md` (canon) · `docs/story-next-steps-ceo-arc.md` (Arc 3 source).

## Appendix B — Design self-consistency checklist (verify while building)

- [ ] Setup→payoff ledger (§3) has **no orphans** — every clue maps to a named payoff; every major reveal has ≥1 earlier seed.
- [ ] Every crawl/objective keeps **faction-in-crawl-and-objective** cohesion and **base count == placed enemies** (mapmaker validator).
- [ ] Every change states **channel + TTS cost + netRole + save-compat** posture; all pools **append-only**.
- [ ] All drafted text passes the §9 tone guardrails and stays consistent with `docs/world-bible.md` (extensions flagged).
- [ ] Seed-discipline respected: **≤1 oblique clue per channel per episode**; no withheld twist stated early.
- [ ] Reborn scarcity (3 ever, 1 at a time) untouched; Arc 3 never re-gates/expands resurrection.
