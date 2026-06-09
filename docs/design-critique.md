# STARLEFT — Design Critique & Player-Hook Roadmap

> **Purpose:** an honest, code-grounded grilling of the whole game, turned into a checklist you can work through one item at a time.
> **Method:** a 29-agent review — 12 subsystem deep-reads of the source, 12 design lenses, 4 player-persona first-session playthroughs, and 1 adversarial skeptic that threw out generic/incorrect advice. Every "Where" pointer below came from an agent that actually read the file; verify line numbers before editing.
> **Generated:** 2026-06-08. Legend: **Impact** = effect on hooking/retention/virality · **Effort** = S(hours) / M(a day or two) / L(several days) / XL(weeks).

---

## TL;DR — the unvarnished verdict

STARLEFT is an unusually *ambitious* hobby RTS whose **shell is far more polished than its core**. The dark-cyberpunk art, neon pipeline, water sim, P2P rollback co-op, a 13-episode moral-descent satire, TTS-narrated crawls, a live news ticker — all impressive. But the thing players actually *do* — combat — is a competent-but-thin **"a-move blob → raze N buildings,"** repeated for the entire campaign, and it is **sensorially dead**: units die with no FX, there is no SFX directory at all, no in-mission music, a 7-frame hit flash, and no damage numbers.

**Your real, defensible identity is not the RTS. It's the procedurally-seeded veteran dossier + permadeath memorial + madosis system** — a *Darkest-Dungeon / RimWorld-grade attachment engine* bolted onto an RTS that mostly hides it. All four player personas — a casual, an RTS veteran, a narrative-game lover, and a streamer — **independently fell in love with the same four things** (the unit barks, the startup-satire premise, the named-veteran dossiers, the Episode VII nuke) and **independently quit at the same four things** (forced manual gate → economy dead-air → silent weightless combat → an 11-second tutorial lecture about content five episodes away).

**The #1 problem is a surfacing-and-feedback failure:** the best content is invisible in the first 5 minutes where players decide to stay, while the thing they *do* see feels broken because it's silent. **The #1 untapped hook is procedural personhood as a viral artifact** — "pour one out for Kade from the flooded arcologies, dream unfulfilled, fell at The Continuity Farm" is a Wordle/RimWorld-grade share machine, and the game currently has **zero in-game share surface.**

Fix three things and a forgettable browser RTS becomes a quotable one: **get the player into a fight in ~45 seconds, make units die with impact (and sound), and surface the named-veteran personhood early — then give them a one-tap card to share it.**

---

## What's already great (do NOT break these while fixing the rest)

- **The writing.** 35 barks per unit type in a consistent corporate-nihilist register ("My equity vests right after I die," "Day 400 of my 90-day internship," "Conversion rate: corpse per click"). Every persona called this the single biggest delight.
- **The premise & the crawls.** "Run a startup, become the monopoly you fought, get nuked" is a one-sentence pitch people *text to a friend*. The opening crawl explains the whole game in ~10 seconds and is genuinely funny. The voiced TTS narration is a real production-value signal.
- **The career/dossier/memorial system.** Procedural names, hometowns, families, traumas, dreams, crimes; level-up life events; a permadeath memorial wall; madosis (units accumulate trauma and go feral, with a rescue minigame). This is the deepest, most original thing in the game.
- **The boss design.** The Cyan Ninja's 0.4s rooted/armor-dropped wind-up as your only punish window, and REX's telegraphed missile/stomp specials, are the only encounters that demand positioning — and they're *good*. The RTS vet specifically wanted more of exactly this.
- **The engineering discipline.** No-build, deterministic tick, working rollback co-op, a `?perf` A/B harness with auto-degrade, the seed-deterministic generator. These are assets you can *build on* (endless mode, daily maps, share cards all reuse infra you already have).
- **The Sprint mechanic & Auditor auto-siege.** Real, responsive micro/positioning depth that's currently almost completely hidden.

The throughline: **the soul of this game lives in its captions, its characters, and its cutscenes — not yet in its play.** Almost every fix below is about moving that soul into the seconds the player actually spends.

---

## ⚠️ Landmines — read before you touch anything below

These are the things the lenses got *excited* about that will bite you. The skeptic flagged each as a real risk no single lens handled.

- **`[LEGAL]` Pull the unlicensed Gorillaz track before ANY growth push.** `assets/audio/music/gorillaz-the-sad-god.mp3` powers the Episode VII flash. A free game that goes viral on this premise is *exactly* the kind that gets a DMCA takedown of the entire Vercel deploy. Replace it with original/licensed audio first. **Success on the current build is the thing that kills the build.**
- **`[NETCODE]` "Cosmetic" combat juice is not free in co-op/rollback.** Death FX in `killEntity()`, floating numbers in `applyHit()` etc. run inside the host-authoritative tick that clients mirror *and* that the rollback resim replays. Spawn FX **gated behind the existing `_rbReplaying` flag** (the pattern is already in `villains.js`) and from snapshot HP deltas on clients — get it wrong and you silently desync co-op or corrupt `NET.simHash`. Half the "just spawn a particle" fixes share this trap.
- **`[PERF]` Verify juice on the biggest maps.** Episodes VII/X/XII run 118×96–90×270 tiles, 8 bases, VPI-scaled armies — hundreds of entities. Per-hit floating text + per-death bursts + per-unit cooldown rings is exactly what the `?perf` harness and QUAL auto-degrade exist to protect. Pool everything, cap counts, cull off-screen, and re-run the perf bench before/after.
- **`[MOBILE]` The mobile onboarding path is more broken than any one lens caught, and that's where cold-link traffic lands.** Discord/iMessage shares open on phones, but the tutorial teaches desktop-only Shift+drag box-select (step 7), the `▭` helper is touch-only, control groups halve to 4, and the `.desc` selection panel is hidden on mobile. The literacy gaps compound on the device most shared links arrive on.
- **`[CONTENT]` The campaign's emotional thesis has no ending yet.** The GRAAL/resurrection climax (The Wake / REBORN) is shipped *infrastructure with no payoff map*. You cannot honestly sell "push to Episode XIII for the resurrection choice" when the choice isn't there. Several retention arguments below lean on a payoff that needs to actually ship.

---

## Verify-first (contested findings)

The skeptic flagged these specific claims as possibly contradicting the real code. **Confirm current behavior before building on them** — don't relitigate, just check:

- "Move/command orders have **no** on-canvas confirmation (only sprint does)." → Check whether a click marker already exists before adding one.
- "The madosis meter is **completely** invisible." → Check whether *any* indicator already surfaces it; the fix may be "make persistent" not "create."
- "Skirmish exists but is locked behind multiplayer — just expose the MP skirmish to solo." → Verify there's actually a reusable solo path; there may not be (treat the solo-skirmish item below as "build," not "unhide").
- The exact main-menu button labels — don't hardcode assumptions; read `rts.html` around the menu region.

---

## How to use this doc

Tiers are ordered by **return on effort**, not by subsystem. Tier 0 is the "conversion pack" — the cheapest changes that most reduce early quit and unlock virality. Check items off as you go; each has a stable ID so we can discuss "let's do T0-3 next."

---

## TIER 0 — The Conversion Pack (ship first; mostly S, mostly cosmetic/local)

*Goal: stop the bleeding in the first 90 seconds and the first fight, and make the game shareable. Every persona quit inside this window.*

- [ ] **T0-1 — Front-load a fight; cut the forced Field Manual gate.** `[Impact: very high · Effort: S–M]`
  Route "New Campaign" straight to the tutorial opt-in (skip the `showDocs(true)` wall; keep the manual reachable from a Documentation button + in-game menu). Seed Quarter I with a small pre-built squad (`startSoldiers:3` — the schema already supports it, see Episode III) and one weak nearby enemy structure, and **reorder the tutorial STEPS so "select these fighters and attack" is step 2–3**, with mine/build/hire taught *after* the first kill. *Where:* `rts.html` New-Campaign button + `ui.js`; `MAPS[0]` in `js/config.js`; STEPS array in `js/tutorial.js`. **This is the single highest-leverage retention change in the codebase.**

- [ ] **T0-2 — Make units die with impact.** `[Impact: high · Effort: S]`
  Wire `killEntity()` to spawn a unit-scaled death burst — reuse the **already-existing** `spawnSmoke`/`spawnExplosion`/`spawnRing`/`spawnShockwave` (currently villain-gated). Color-key by owner (player red / enemy blue / A&O toxic-green), bump `state._shake` (1–3px units, 8 for mechs, footprint-scaled for buildings). Gate with `!window._rbReplaying`. ~40 lines, zero new art. *Where:* `units.js:~950` (`killEntity`) and the cleanup block in `core.js`. **This event fires hundreds of times per mission across all 13 episodes.**

- [ ] **T0-3 — Give combat sound.** `[Impact: high · Effort: S–M (code) + sourcing ~12 clips]`
  There is no `assets/audio/sfx/` directory at all. Add `js/sfx.js` (a tiny WebAudio one-shot player mirroring `voice.js`'s iOS-unlock + graceful-missing-file pattern, rate-limited/pooled) and ~12 clips: laser_player, laser_enemy, impact, unit_death, explosion_big, siege_deploy, heal_tick, ui_click, build_complete, train_ready. Add **one sparse ambient drone per biome** so missions aren't dead air — silence currently reads as "broken," not "bleak." *Where:* new `js/sfx.js`, fired from `render.js` laser spawn + `killEntity`. **`[LEGAL]` applies — no ripped audio.**

- [ ] **T0-4 — Floating damage/heal numbers + a kill toast.** `[Impact: high · Effort: M]`
  Lightweight pooled `G._floaters` array (mirror the `rings[]` pattern), spawned in `applyHit` (damage) and on heal (green +N), drawn additive after units, fading ~0.7s, scaled `1/zoom`, capped/culled, **skipped during rollback resim**. Bonus, on-brand: a satirical multi-kill toast ("LAYOFF SPREE: 5 headcount eliminated," "RIF x3") via the existing toast system. *Where:* `units.js:~432` + `render.js`. **Closes the action→feedback loop every persona missed.**

- [ ] **T0-5 — Surface the personhood in session one.** `[Impact: high · Effort: S–M]`
  The emotional hook is invisible during the entire first mission. (a) Add a contextual tutorial pop the first time a single combat unit is selected: "Every one of your people has a name and a story — open their file." (b) Mint a lightweight identity (name + hometown) at **Lv1 / first selection** via `ensureDossier`, with full prose still unlocking at Lv2. (c) Occasionally substitute a dossier-aware bark on select for any unit that has a dossier (`{first}/{home}/{dream}` are already exposed). *Where:* `tutorial.js` CONTEXTUAL; `lore.js` `ensureDossier`; `dialogs.js` `sayUnitSelected`.

- [ ] **T0-6 — The veteran / memorial SHARE CARD.** `[Impact: high (the only natural viral loop you have) · Effort: M]`
  Add `js/sharecard.js` (load after `lore.js`): render a dark `#05080d` card to an offscreen canvas — sprite + full dossier name + rank + hometown + their best bark + dream (✓/✗) + "fell at {map}" / "★Lv{n} active" + a `starleft.vercel.app` footer — then `canvas.toBlob → navigator.share({files})` with a clipboard/download fallback (the same fallback ladder already used for co-op QR/invite). **Reuse the live card-draw code that already exists** for hub menus (`ui.js:~571–610`) — render one frame to a blob. Wire a "Share File" button into the roster rows, the dossier modal, and the victory/extraction chooser. *This is the one feature that turns your best asset into growth.*

- [ ] **T0-7 — Open Graph / Twitter Card meta tags + a real OG image.** `[Impact: high (cheapest growth win in the game) · Effort: S]`
  `rts.html` `<head>` has zero OG/Twitter tags, so every pasted link is a dead grey URL — fatal for a *visual* game shared on Discord/Twitter/iMessage. Add a full block + a purpose-built 1200×630 card (menu key art + logo + tagline like *"Run a startup. Become the monopoly. Get nuked."*) composited via your `_dev/gen` pipeline. Add a root `index.html` that redirects to `rts.html`. One static edit, no runtime cost.

- [ ] **T0-8 — A "▶ Continue" button on the main menu.** `[Impact: high · Effort: S]`
  A returning player today must remember Load Game, open a list, and decode an unlabeled "★ " row — most won't, and a paused 13-episode campaign is exactly what people come back to days later. Add a top "▶ Continue" reading the autosave (`AUTO_KEY`), labeled with the resolved episode + elapsed time ("EPISODE VIII — THE DOWN ROUND · 14:32"). Also enrich the Load list rows with episode labels. *Where:* `rts.html` menu + `ui.js`/`save.js`. **Highest retention-per-line in the codebase.**

- [ ] **T0-9 — Delete/shorten the 11-second madosis lecture; teach it just-in-time.** `[Impact: med-high · Effort: S]`
  All four personas hit this unskippable wall of text about content 5 episodes away. Drop the hold to ~3s or remove the step — the `CONTEXTUAL_MAP['madosis-live']` hint already fires when a breakdown actually begins, which is the correct teaching moment. Reclaim the time for a victory payoff. *Where:* `tutorial.js` `tut-madosis`.

- [ ] **T0-10 — Lightweight, privacy-respecting analytics.** `[Impact: high (makes everything else measurable) · Effort: S]`
  Growth and churn are completely blind right now. Add a cookieless beacon (`js/telemetry.js`, `navigator.sendBeacon`, respects DNT, consent toggle in localStorage, no PII) firing at funnel chokepoints: session_start, menu_shown, new_campaign, tutorial_optin (accept/decline), crawl_skipped, episode_started/won/lost (idx), hub_entered, coop_session. ~10 one-line calls. **Without this you can't tell which of these fixes worked.**

- [ ] **T0-11 — Two near-free polish fixes.** `[Impact: med · Effort: S]`
  (a) Fix the boot button glyph: the literal first thing every player sees may render as "Simulate ?" — verify UTF-8 / use a clean "Simulate ▶". (b) Bias the menu ticker toward the *fake* ULTRA NEWS on the title screen and swap the rotating menu "tips" from UI-mechanic strings to your sharpest barks/pull-quotes, so the first impression is the *satire voice*, not Reuters/how-to. *Where:* `rts.html:~127`; `js/lns.js`, `js/tips.js`.

---

## TIER 1 — Feel & Attachment (make the play match the writing)

*Goal: make combat feel good and make the career system land emotionally. This is where "interesting" becomes "I have to see what happens to MY people."*

- [ ] **T1-1 — The "Fallen" interstitial.** `[Impact: high · Effort: M]`
  Losing a Lv2+ veteran is currently a 10-second toast. Trigger a brief (~2.5s, skippable, solo-gated) beat from `recordFallen`: dim/freeze the canvas, show the unit's drawn portrait, full name, rank, hometown, and their **dream line with ✓/✗**. Queue multiple deaths; only the first per N seconds gets the full beat (a wipe must not be 12 modals). *Where:* new `fallen-scene.js` / `lore.js`. **This is what makes a player say "I can't let this one die."**

- [ ] **T1-2 — A combat-juice pass (shake + flash + cooldown read).** `[Impact: high · Effort: S–M]`
  Proportional micro-shake in `applyHit`/`killEntity` (scaled by attacker size & killing-blow, on-screen only, well under REX's 15). Brighten the hit flash + a 1-frame white core on the killing blow. Draw a **cooldown sweep on the selection ring** for selected units (pure `render.js`, no sim change) so alpha-strike units (Lobbyist, sieged Auditor) become skill-expressive. `[NETCODE]`/`[PERF]` apply.

- [ ] **T1-3 — Make the healer visible (Biba's whole role is invisible).** `[Impact: med · Effort: M]`
  In the render shot-FX block, add a parallel pass for active healers: an additive purple/white tether + traveling orb (recolor the cached laser glow) + a green +HP sparkle, driven off the existing heal timing. Pair with the `heal_tick` SFX. Turns a glowing statue into a hero.

- [ ] **T1-4 — Smarter healer targeting (triage, not nearest).** `[Impact: med · Effort: S]`
  Change auto-heal scoring from nearest to most-urgent: weight by `(1 - hp/maxHp)` boosted for high-star vets and heroes; keep closest as tiebreak. Make focus-heal "sticky priority" (top-offs others when the locked target is full). ~10 lines that directly protect the lore units players are attached to. *Where:* `units.js:~544`.

- [ ] **T1-5 — Surface madosis as a managed-tension bar.** `[Impact: high · Effort: S]`
  (Verify-first: confirm it isn't already shown.) Draw a thin sub-bar under the selection ring for Lv2+ units (`u.madosis/threshold`, amber >0.6, red >0.85, **slow ~2Hz pulse, not the per-frame strobe**) and on the selection-info panel + carry-chooser cards. It's data you already compute every frame — purely a draw call. Converts an opaque rug-pull into a system players manage. Also throttle the existing mad-dog aura strobe to ~2–3Hz and gate amplitude on `prefers-reduced-motion` (photosensitivity).

- [ ] **T1-6 — Dossier-aware barks + grief reactions.** `[Impact: med · Effort: M]`
  Add a small pool of dossier-templated barks for Lv2+ units (`{me}/{home}/{dream}/{trauma}`, text-only so the TTS pipeline isn't blocked, ~30% bias on select). When a comrade falls, have the highest-madosis nearby survivor speak a short grief bark — making the invisible trauma accrual *audible*. Use the **starleft-lore-forge skill** (it owns the append-only / version-frozen contract). *Where:* `dialogs.js` + `dialog_data.js`.

- [ ] **T1-7 — Surface the memorial at the moments it earns weight.** `[Impact: high · Effort: M]`
  (a) Render fallen names on/near The Wake tower in the HUB so every visit walks past your dead. (b) Auto-open the memorial as the Episode VII flash resolves — the canonical moment the whole roster joins it. (c) Add a "Veterans & Memorial" button to victory/HUB screens, not just a buried dropdown. All reuse `rosterHTML`; pure wiring. *Where:* `hub.js`, `ui.js`, `lore.js`.

- [ ] **T1-8 — Voice the tutorial coach (Rod).** `[Impact: med · Effort: S–M]`
  Rod is the only character a player meets in session one, and he's silently captioned right after a fully-voiced crawl — every persona read it as "unfinished." The `VOICE.playTutorial` API and `_touch` fallback are already wired; just generate the clips via the existing lore-forge/TTS path (the missing `tutorial/` folder).

- [ ] **T1-9 — Victory run-summary + dream-fulfilled payoff.** `[Impact: med · Effort: M]`
  Extend `onVictory` to show the already-computed reward breakdown (kills/buildings/HQ/funding) + "Vets promoted" + "The Fallen this quarter," plus elapsed/peakSupply/unitsLost. When a unit's `dreamDone` flips, fire a held toast + gold dialog bubble ("I outlasted it. The thing I built is still standing.") and a `{dreamFulfilled:name}` crawl token. Turns invisible flags into the emergent-story payoffs people share.

---

## TIER 2 — Depth & Variety (retention past Episode 3)

*Goal: give the campaign more than one verb and the roster more than stat-sliders, so players reach the GRAAL arc instead of stopping at Episode V.*

- [ ] **T2-1 — A second & third win verb (`winCondition` schema field).** `[Impact: high · Effort: L]`
  Every one of 13 missions is "raze N buildings." Add `cfg.winCondition` and branch `checkWinLose` *before* the existing `if(!enemyBuildings)` (default `razeAll`, so old saves/maps are unchanged). Ship: **'survive'** (reuse the wave spawner, just don't grace-gate it), **'escort'** (reuse captive/abandoned tagging + `reclaimOutposts` proximity), **'reachAndHold'**. This is the keystone that unlocks every variety item below. *Where:* `core.js:~170`, map schema in `config.js`.

- [ ] **T2-2 — One manual active ability per combat unit.** `[Impact: high · Effort: L]`
  The whole roster is passive stat-sliders. Add a `cmd.type==='ability'` handler + per-unit `u.abilCd`, each effect **reusing tech that already exists**: Auditor siege → *manual toggle*; Hustler "Caffeine Dash" (sprint mult); Foodtruck "Napalm Cone" (boosted `applyHit` splash); Lobbyist "Lobby Blitz" (cooldown reset); Founder "Stomp" (scaled `stepMech` quake). Button next to Stop; cooldown drawn as a radial sweep. Biggest depth multiplier for the least new code. *Where:* `units.js`, `ui.js` buildCommands, `render.js`.

- [ ] **T2-3 — Attack-move + stances.** `[Impact: high · Effort: M]`
  The command vocabulary is below genre baseline. Surface attack-move ("A then click" + an ⚔ touch button; the `amove` handler and auto-acquire respect already exist). Add a Hold/Defensive/Aggressive stance pip writing `u.stance`, checked in the auto-target and retaliation gates — the RTS vet quit specifically because always-on retaliation makes tactical fallback impossible. Issue orders through the net wrappers. *Where:* `input.js`, `main.js` keydown, `units.js:564/940`.

- [ ] **T2-4 — A real counter axis (armor / piercing).** `[Impact: med · Effort: M]`
  The roster reads as identical. Generalize the dmg-reduction path that **already exists for the ninja** (`units.js:933`) into an `armor` stat on vehicles/mechs + a `pierce` flag on Lobbyist/Auditor cannon. Now "they have mechs → build Lobbyists" is a real read, and the M.D.C. squad-picking actually matters. Encode in `DEF`, branch in `damage()`.

- [ ] **T2-5 — Make Funding scarce + the Satellite Office a real expansion race.** `[Impact: high · Effort: S–M, mostly data]`
  Macro has zero tension because the home cluster funds a winning army. Cut home-node `goldNodes` ~40–50% and place 1–2 high-value contested mid-map nodes (Ep XII's center node already gestures at this — make it the norm). Give the Satellite Office `supply` + a fatter trickle so expansion has a *vehicle* and "expand vs. push" becomes the decision the macro layer is missing. Add an **income/sec readout** to the top bar (highest-value-per-line economy UX). Pure config tuning + one HUD span.

- [ ] **T2-6 — Teach the advanced units by necessity.** `[Impact: high · Effort: M]`
  Auditor/Founder/Courier/Bomber are never required, so most players never discover the depth. Use terrain + an enemy *air* wave to force anti-air in one mid map (flyers already gate to `def.antiAir`), a turret-ringed vault that wants a sieged Auditor in another — surfaced via the **existing** CONTEXTUAL tip pipeline. Also make Sprint legible (afterimage on sprinting units; a contextual "double-tap past your turret to bait them" the first time you're chased) — it's the cheapest way to raise the perceived skill ceiling.

- [ ] **T2-7 — More boss beats; promote REX into the mainline.** `[Impact: high · Effort: M]`
  Only 2 boss fights in 15 maps, and the better-paced one (REX) is optional/post-campaign. Add 2–3 "lieutenant" duels using the existing villain framework (`hpVpiScale`/phases/flee scale for free): an A&O enforcer between IX–X, a Dark-Tower guardian *as* the Episode XI climax (also satisfies T2-1 for that map). Re-route the campaign to end *through* REX. Use the **starleft-mapmaker skill.**

- [ ] **T2-8 — Recur the Episode-X infiltration & add mid-mission beats.** `[Impact: med · Effort: M]`
  Episode X (corridors/captives/no-economy) is the campaign's best mission and never recurs — the systems are generic engine features, not Ep-X hardcode. Build 1–2 more (a data-heist that escorts a stolen-lattice unit *out* — combine with T2-1's escort). Add a `cfg.events` array of `{atTime, action}` processed after the AI tick for authored pacing (quiet build → mid-mission crisis → finale push), solo/host-only so clients just receive results.

- [ ] **T2-9 — Make Arc 2 re-escalate; tie supply into mission design.** `[Impact: med · Effort: S]`
  The difficulty curve plateaus (the comments admit it). Ramp Ep VIII–XIII aggression to a clean 1.2→2.2 and bump `VET_MAXBONUS` per-arc via the **reserved `idx` param** in `vetScalingBonus`, so a player who carried a strong roster feels Episode XIII as the *hardest* fight, not a victory lap. Author 1–2 deliberately economy-starved "down round" maps (pure config) so the single-resource economy finally matters as a difficulty knob.

---

## TIER 3 — Replayability & the Growth Engine (the 50th session)

*Goal: a reason to play after the campaign, and loops that pull new players in. The campaign-only structure can never provide this.*

- [ ] **T3-1 — New Game+.** `[Impact: high · Effort: M]`
  The endgame is literally `location.reload()`. On the IPO screen offer "Take the Money and Disrupt Again": keep `carryoverVets`/`carryoverHeroes`/`fallenVets`/`CAMPAIGN`, set an `ngPlus` counter feeding a flat enemy bonus in `balance.js` + `aggression × (1 + 0.15·ngPlus)`. Serialize `ngPlus`. ~30 lines reusing every existing persistence/scaling system. Turns the deep-but-disposable career into a thing worth maxing.

- [ ] **T3-2 — Solo Skirmish + Daily/Random maps.** `[Impact: high · Effort: M]`
  (Verify-first per the contested list.) Give solo players a non-campaign mode: a "Skirmish" nav button into the existing map grid routed to a `startSkirmish(i)` that skips crawl/carryover and shows a "Play Again / Pick Another" end screen. Then `js/skirmish_gen.js`'s `rollSkirmishConfig(seed)` on top of your **seed-deterministic generator**: "Daily Disruption" uses `seed = dateToSeed(YYYYMMDD)` (identical for everyone that day → the unit of social sharing), "Random" uses a random seed. Highest content-per-line in the game because the generator already exists.

- [ ] **T3-3 — A run score / "Valuation."** `[Impact: high · Effort: M]`
  No quantified reason to improve. Build a score from data you already collect (kills/buildings/HQ/funding + time + unitsLost): "Valuation = funding + kills·X − time − losses·Y, ×mutator_mult." Show it on victory/skirmish-clear, persist per-seed bests in localStorage, display "Best: $X.XB." For daily maps this is what people screenshot. ~40 lines.

- [ ] **T3-4 — Mutators (skirmish/endless only — keep the campaign authored).** `[Impact: high · Effort: L]`
  `js/mutators.js` with ~8 toggles, each a 5–15-line hook into existing systems: Crunch Time (no grace, half wave timer), Sanity Collapse (madosis ×3), Bull Market (gold ×2), Down Round (startGold 0, capture to fund), Hold the Pitch (survive — reuses T2-1), Sudden Death (no self-heal). Checkboxes on skirmish setup; bank a score multiplier per stacked mutator.

- [ ] **T3-5 — Achievements tied to YOUR unique systems.** `[Impact: med · Effort: M]`
  Not generic "kill 100 units" — `js/achievements.js` with ~25 startup-satire entries hooked to your real events: "Down Round" (continue after the flash), "Equity Vested" (a vet fulfills their dream), "Whatever It Takes" (Lv30 vet), "Pet Project" (rescue a mad-dog). Surface as a tab in the under-used Roster overlay. Each test is 1–3 lines on an existing event hook.

- [ ] **T3-6 — Cross-run "Founder's Ledger" / Hall of Fame.** `[Impact: high · Effort: M]`
  The stickiest asset — named veterans + memorial — is destroyed on completion. Append each run's survivors + memorial to a capped, *orthogonal* localStorage key (save-compat-safe by construction). Lifetime stats: campaigns completed, total fallen, longest-lived vet, dreams fulfilled. Optionally let one legend be re-hired into a new campaign as a costed perk. The strongest possible reason to start campaign #2.

- [ ] **T3-7 — Distribution actions (no/low code).** `[Impact: high · Effort: S–M]`
  Write a `README.md` (hero GIF, the satire one-liner, a big "PLAY NOW →" link, the procedural-dossiers/permadeath-memorial/no-build angles devs love). Set the GitHub repo description + topics (rts, browser-game, webrtc, no-build, startup-satire). Package the static bundle as an **itch.io HTML5 game** (the highest-intent discovery channel, currently unused) with screenshots + a devlog, then a "Show HN" / r/WebGames post anchored on your first shareable clip. Reconcile the deploy URL across docs (vercel.app appears canonical; MEMORY says Pages — stale).

- [ ] **T3-8 — Make co-op an *active* growth loop.** `[Impact: med · Effort: S]`
  The strongest organic loop is locked behind already being in-game. Add an in-game-menu "Invite a friend" that opens a room and fires `navigator.share`/clipboard with the invite link + "Co-found my startup — drop into co-op" (reuse `mpInviteLink` + the QR/copy fallback). Once T0-7 lands, make the `#mp=CODE` link carry the rich OG card so an invite looks like an invitation, not spam.

- [ ] **T3-9 — Give M3$ an infinite, on-theme sink.** `[Impact: med · Effort: M]`
  The HUB metagame caps out. Add a repeatable rising-cost "Series ∞" roster buff and let M3$ *buy skirmish/endless modifiers* ("Buy a Bigger Round" +startGold; "Hire Lobbyists" free starting vets) — turning the meta-currency into roguelite run-investment. Also make the HUB gamble actually random (replace the deterministic `visit*37` check with seeded RNG).

---

## TIER 4 — Bigger Bets (high ceiling, plan deliberately)

- [ ] **T4-1 — Ship the resurrection-choice payoff (`[CONTENT]` landmine).** `[Impact: high · Effort: L]`
  The Wake/REBORN infrastructure exists with no payoff map. Even before a full Episode XIV, frame The Wake as the summit: on unlock fire a crawl beat ("You can bring ONE of them back. Choose."), and make resurrection a ceremonious overlay listing the fallen *with their dreams* (reuse `fallenDossierSnap`), surfacing the 3-ever cap as in-fiction scarcity. Then land the dedicated map via the mapmaker skill. **The campaign's entire emotional thesis currently has no ending.**

- [ ] **T4-2 — Difficulty selector.** `[Impact: med · Effort: S]`
  "Bootstrap / Series A / Unicorn / Burn Rate" as a single global multiplier read where the knobs already live (`aggression`, `VET_MAXBONUS` cap, mint speed, `graceTime`). Surfaces the invisible VPI system as a player-facing dial and feeds the score multiplier. ~15 lines.

- [ ] **T4-3 — Accessibility & settings panel.** `[Impact: med · Effort: M]`
  No settings panel exists; bars are red-green only. Add a Settings overlay (reuse the dossier/roster modal pattern): colorblind-safe HP/madosis ramps (blue→white→red + hatch), larger-HUD-text class, a reduce-FX override. Plus a `beforeunload`/`visibilitychange` autosave so a tab-close doesn't lose 60s (solo-gated, reuses the existing autosave path).

- [ ] **T4-4 — Mobile onboarding repair (`[MOBILE]` landmine).** `[Impact: high for mobile traffic · Effort: M]`
  Restore a compact selection summary on mobile (one-line `.desc`: "💰3 · queue: soldier 40%"), draw a translucent selection rectangle during touch box-drag, make the control-group chips scroll to expose 5–9, and add a desktop "Select Army" helper so tutorial step 7 stops being a literacy wall. The casual persona's biggest single quit-risk.

- [ ] **T4-5 — PvP / competitive ceiling (RTS-vet retention).** `[Impact: med, niche · Effort: L–XL]`
  Co-op-vs-AI only means no skill-mastery endgame for competitive players. A 1v1 duel mode (p2 hostile, two-HQ maps) reuses the existing host/command/sync layer. Replays (low priority, XL) could ride the rollback input log. Treat as a deliberate, separate project — not a quick win.

---

## Appendix A — The first-15-minutes funnel (where each persona quits)

Convergence is the headline: **the same four moments threaten all four personas.** Fixing T0-1, T0-2/3/4, T0-5, T0-9 directly addresses every row.

| When | What happens | Casual | RTS vet | Narrative | Streamer |
|---|---|:--:|:--:|:--:|:--:|
| ~0:30 | Forced Field Manual gate before any play | 🔴 | — | 🟡 | 🟢 |
| ~2:30 | Flat tech tree — no build-order puzzle | — | 🔴 | — | — |
| 3–5:00 | Economy chores + 180s grace dead-air, silent | 🟠 | 🟠 | — | 🔴 |
| ~5:30 | No hold/attack-move; always-on retaliation | — | 🔴 | — | — |
| ~7:00 | First combat: silent, weightless, no numbers | 🟢 | 🟠 | 🟠 | 🔴 |
| ~9:00 | 11-sec madosis lecture about Ep-6 content | 🟠 | 🟠 | 🟠 | — |
| ~13:00 | Realizing every map is "raze N buildings" | — | 🟠 | 🟠 | 🟠 |

🔴 high quit-risk · 🟠 med · 🟡/🟢 low. (RTS-vet also caps out at "co-op only, no PvP.")

**What every persona said would hook them (unprompted, all four):** the unit barks · the startup-satire premise/crawl · the named-veteran dossiers + memorial · the Episode VII nuke. *Your job is to move those four things earlier and louder.*

---

## Appendix B — Deliberately rejected (so we don't relitigate)

The skeptic culled these as **generic** (could be pasted into any game's review) — intentionally *not* in the roadmap:

- "Add achievements" *(as a generic ask — T3-5 only survives because it's tied to YOUR madosis/dossier/flash events)*
- "Add a difficulty selector" *(kept as T4-2 only because your VPI knobs make it ~15 lines; not a headline)*
- "Add rock-paper-scissors / build orders / be more like StarCraft" *(kept as the narrow, cheap T2-4 armor/pierce axis; rejected as a wholesale 'be a different game')*
- "Be more like Hades — screenshake everywhere" *(kept only as the specific, restraint-respecting T0-2/T1-2; rejected as a vibe)*
- "Add analytics because growth is blind" *(kept as concrete T0-10; the generic phrasing alone isn't a plan)*

And flagged as **possibly wrong** vs. the real code — see **Verify-first** above before acting: move-order confirmation, madosis visibility, solo-skirmish-already-exists, exact menu labels.

---

## Suggested first sprint

If you want a single high-ROI batch: **T0-1, T0-2, T0-3, T0-4, T0-8, T0-9** (get into a fight fast, make it feel alive, let people come back) plus **T0-7 + T0-10** (so the next share gets a click and you can measure it). Then **T0-6** (the share card) and **T1-1** (the Fallen interstitial) to turn your real identity into the loop. And before any of it ships publicly: the **`[LEGAL]` Gorillaz swap.**
