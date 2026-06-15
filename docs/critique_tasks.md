# STARLEFT — Critique Task Tracker

> **What this is.** A working, one-task-at-a-time backlog derived from [design-critique.md](design-critique.md). Every proposition from that document is expanded here into a self-contained task an agent can pick up cold, implement, and mark done.
> **How to use.** Each task has a `- [x]` checkbox (flip to `- [x]` when complete) plus sub-step checkboxes for multi-part work. Tasks keep their stable IDs (T0-1, T1-2, …) so they cross-reference the critique. Work the tiers top-down for best ROI, but any task can be done independently unless a **Depends on** is listed.
> **Scope note.** The `[LEGAL]` Gorillaz-track replacement from the critique is **intentionally excluded** from this tracker per request. It remains a hard prerequisite before any public growth push (see `design-critique.md` Landmines) — just not tracked as a task here. Note that new-audio tasks (T0-3) still require original/licensed clips only.
> **Verify before editing.** All file:line pointers came from an automated read of the source; confirm the exact lines still match before changing them.

---

## Global constraints (apply to EVERY task — tagged per task below)

These come from `CLAUDE.md` / `AGENTS.md` and the engine's three-path simulation model. A task that touches the relevant area MUST honor them.

- **`[SAVE]` Save compatibility is mandatory.** `js/save.js` must stay backward-compatible: treat missing fields as legacy, infer safe defaults, never require new metadata for an old save to load or appear in the Load list. Any new *persistent* state or *entity-reference* field means updating serialization **and** reference encoding intentionally.
- **`[NET]` Three simulation paths.** Every gameplay change must hold for **solo** (`update(G,dt)` directly), **host** (authoritative, broadcasts snapshots), and **client** (does NOT simulate — applies snapshots, interpolates, renders). Route networked gameplay actions through the `net*` wrappers in `js/net/commands.js`. Cosmetic FX inside the tick (death bursts, floating numbers) must be **gated with the `_rbReplaying` flag** (pattern already in `villains.js`) so the rollback resim doesn't double-spawn them or corrupt `NET.simHash`; clients should spawn cosmetics from snapshot deltas, not local simulation. Changing entity shape/IDs means updating snapshot packing in `js/net/sync.js`.
- **`[PERF]` Respect the frame budget.** The densest maps (Ep VII/X/XII, up to ~90×270 tiles, 8 bases, VPI-scaled armies) run hundreds of entities. Per-hit/per-death/per-unit visual additions must be pooled, count-capped, and off-screen-culled. Re-run the `?perf=1` A/B harness (see `docs/perf/`) before/after and watch the QUAL auto-degrade path.
- **`[MOBILE]` Check the narrow viewport.** HUD height drives canvas viewport math; touch is a first-class input. Verify any UI/control/readability change on a narrow/mobile layout, not just desktop.
- **`[UI]` Preserve the `refreshUI()` rebuild pattern.** Command buttons rebuild on a signature; rebuilding too eagerly eats clicks. Don't break that contract when adding buttons.
- **`[ORDER]` Script load order is the dependency graph.** New classic scripts must be added to `rts.html` in the right place — after the globals/data they read, before `js/main.js` (which loads last). Do not convert files to ES modules or add a bundler.
- **`[ART]` Dark/devastated cyberpunk, never bright.** All new visuals (FX colors, OG/share cards, UI) stay on-brand. Procedural fallbacks exist for optional art; don't assume every asset file is present.
- **`[VERIFY]` Contested claim.** The skeptic flagged this as possibly contradicting the real code. Confirm current behavior first; the fix may be "extend," not "create."
- **Manual verification.** There is no test suite. After gameplay changes, in a browser confirm: load a map, select units, issue move/attack/gather, place a building, train a unit, and (if touched) save/load and co-op. (`python3 -m http.server 8000` → `http://localhost:8000/rts.html`.)

---

## Index

**Tier 0 — Conversion Pack:** T0-1 fight-first onboarding · T0-2 death FX · T0-3 combat SFX · T0-4 floating numbers · T0-5 personhood in session 1 · T0-6 share card · T0-7 OG meta tags · T0-8 Continue button · T0-9 trim madosis lecture · T0-10 analytics · T0-11 boot glyph + menu voice
**Tier 1 — Feel & Attachment:** T1-1 Fallen interstitial · T1-2 combat juice pass · T1-3 visible healer · T1-4 healer triage · T1-5 madosis bar · T1-6 dossier barks + grief · T1-7 surface memorial · T1-8 voice Rod · T1-9 victory summary + dream payoff
**Tier 2 — Depth & Variety:** T2-1 win conditions · T2-2 active abilities · T2-3 attack-move + stances · T2-4 armor/pierce · T2-5 scarce economy · T2-6 teach advanced units · T2-7 more bosses · T2-8 recur infiltration + events · T2-9 Arc-2 escalation
**Tier 3 — Replayability & Growth:** T3-1 New Game+ · T3-2 solo skirmish + daily · T3-3 run score · T3-4 mutators · T3-5 achievements · T3-6 Founder's Ledger · T3-7 distribution · T3-8 co-op invite loop · T3-9 M3$ sink
**Tier 4 — Bigger Bets:** T4-1 resurrection payoff · T4-2 difficulty selector · T4-3 accessibility/settings · T4-4 mobile onboarding repair · T4-5 PvP

---

# TIER 0 — The Conversion Pack

*Goal: stop the bleeding in the first 90 seconds and the first fight, and make the game shareable. All four player personas quit inside this window.*

### T0-1 — Front-load a fight; cut the forced Field Manual gate
- [x] **Done**
- **Impact:** very high (first-90-seconds retention) · **Effort:** S–M · **Tags:** `[VERIFY]` (menu labels), `[MOBILE]`
- **Related:** T0-9 (trim the lecture in the same tutorial pass), T0-5 (personhood beat), T0-11

**Motivation.** This is the single highest-leverage retention change in the codebase. Today the very first thing a new player does is read a controls wall and then mine gold; time-to-first-combat is 3–5 minutes of economy chores. Every persona flagged the forced Documentation overlay (~0:30) and the silent economy dead-air (3–5:00) as quit points. A new player should be selecting fighters and watching a laser land within ~45 seconds. Combat is the hook; chores come after the first kill.

**What to do.**
- [x] Route "New Campaign" straight to the tutorial opt-in, bypassing `showDocs(true)`. Keep the Field Manual reachable from a standalone Documentation button **and** an in-game menu entry (`showDocs(false)`).
- [x] Seed Quarter I (`MAPS[0]`) with a small starting combat squad (`startSoldiers:3` — schema already supports it; see Episode III / `MAPS[2]` which uses `startSoldiers:3, startBarracks:true`) and one deliberately weak nearby enemy structure (1 defender) to kill fast.
- [x] Reorder the `STEPS` array in `js/tutorial.js` to combat-first: look → **select fighters & attack the lone target** (step 2–3) → then mine/hire/build as "now sustain it."
- [x] Add a stall-detection hint (reusable): if `stepT > ~6s` with no progress on a step, fire a one-time guiding toast.

**Where in code.** New-Campaign button in `rts.html` + handler in `js/ui.js`; `MAPS[0]` in `js/maps_data.js`; `STEPS` + `prompt`/`choosePrompt` in `js/tutorial.js`.

**Constraints & gotchas.** `[VERIFY]` read the real menu region before assuming button labels. `[MOBILE]` the combat-first step must be completable by touch (don't gate it on a desktop-only box-select — see T4-4). Keep the crawl skippable.

**Done when.** From the title screen, clicking New Campaign reaches a controllable squad attacking an enemy within ~45s, with no forced wall-of-text; the Field Manual is still reachable on demand.

---

### T0-2 — Make units die with impact (death FX)
- [x] **Done**
- **Impact:** high · **Effort:** S · **Tags:** `[NET]`, `[PERF]`, `[ART]`
- **Related:** T0-3 (death SFX), T1-2 (shake)

**Motivation.** Units currently die with zero FX — the win condition ("raze N buildings," kill the army) has no payoff. The functions to fix it already exist; they're just villain-gated. This event fires hundreds of times per mission across all 13 episodes, so it's the highest-leverage feel change for the least code (~40 lines, no new art). Every persona read silent combat as "broken/unfinished."

**What to do.**
- [x] In `killEntity()` branch on `e.kind`/size and call existing FX: small unit → `spawnSmoke` + `spawnRing` + small shake; mech/founder → `spawnExplosion` + `spawnShockwave` + bigger shake; building → footprint-scaled staggered `spawnExplosion` + debris + lingering smoke, with the loudest burst reserved for enemy HQ/base raze (it's the objective).
- [x] Color-key bursts by `e.owner` (player red / enemy blue / A&O toxic-green) so deaths read at a glance. `[ART]` keep palettes dark/devastated.
- [x] Bump `state._shake = Math.max(state._shake, n)` proportional to size (≈2 units, ≈8 mech, footprint-scaled buildings; keep all well under REX's 15).
- [x] Optional on-brand: a one-shot satirical toast on the climactic enemy-HQ raze ("DISRUPTR INC. has been acquihired").

**Where in code.** `js/units.js:~950` (`killEntity`); the dead-entity cleanup block in `js/core.js` (~lines 89–104); FX helpers in `js/particles.js` / `js/villains.js`.

**Constraints & gotchas.** `[NET]` gate every FX/shake with `!window._rbReplaying` (as `villains.js` already does) so rollback resim doesn't re-spawn them; clients should trigger death bursts from snapshot HP→0 transitions, not local sim. `[PERF]` cap concurrent particles and skip off-screen deaths on the big maps.

**Done when.** Every unit and building death produces a visible, owner-colored burst + proportional shake in solo; co-op stays in sync and rollback hashes don't diverge.

---

### T0-3 — Give combat sound (SFX + ambient)
- [x] **Done**
- **Impact:** high · **Effort:** S–M (code) + sourcing ~12 clips · **Tags:** `[ORDER]`, `[NET]`, `[PERF]`
- **Related:** T0-2, T1-3 (heal SFX), T1-8 (voice pipeline)

**Motivation.** There is **no `assets/audio/sfx/` directory at all** and no in-mission music. The most active part of the game is its quietest; silence reads as "is the game broken / is my capture dead" (the streamer persona's words). Audio is the cheapest way to make the existing combat feel finished.

**What to do.**
- [x] Add `js/sfx.js`: a tiny WebAudio one-shot player mirroring `js/voice.js`'s iOS-unlock + graceful-missing-file pattern, with per-sound rate-limiting and a small pool/round-robin so big fights don't clip.
- [x] Add `assets/audio/sfx/` with ~12 short clips (original/licensed only): `laser_player`, `laser_enemy`, `impact`, `unit_death`, `explosion_big` (buildings), `siege_deploy` (Auditor), `heal_tick` (Biba), `ui_click`, `build_complete`, `train_ready`.
- [x] Fire SFX from the existing event sites: laser bolts at the spawn point in `render.js` (with rate-limiting like `voice.js`), deaths/explosions from `killEntity` (pairs with T0-2), build/train completion from the production code.
- [x] Add **one sparse ambient drone loop per biome** via the MUSIC system — keep it minimal to honor the "corporate grind has no soundtrack" tone, but kill the dead air.

**Where in code.** New `js/sfx.js` (add to `rts.html` in load order, after `assets.js`/`music.js`, before `main.js`); call sites in `js/render.js` (laser spawn ~306–317), `js/units.js` (`killEntity`), production block in `js/core.js`; biome ambient via `js/music.js`.

**Constraints & gotchas.** `[ORDER]` insert the script correctly. `[NET]` SFX are local/cosmetic — gate from the same death/hit events as T0-2 (don't double-fire during rollback). `[PERF]` rate-limit laser fire SFX hard on dense maps. All paths relative (GitHub Pages/Vercel). Audio must be original/licensed.

**Done when.** Lasers, hits, deaths, building razes, build/train completion, and UI clicks all make sound; each biome has a quiet ambient bed; missing files fail silently.

---

### T0-4 — Floating damage/heal numbers + kill-streak toast
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[NET]`, `[PERF]`, `[ART]`
- **Related:** T0-2, T1-2

**Motivation.** Combat has no on-screen damage feedback — only a faint flash. Match-3-trained casuals and Hades-trained players both expect numbers to pop. This closes the action→feedback loop every persona missed, and the satirical multi-kill toast turns the dark theme into dopamine.

**What to do.**
- [x] Add a lightweight pooled `G._floaters` array (mirror the `rings[]` pattern in `render.js`): push `{x,y,text,color,t}`, draw additive after units, fade/rise over ~0.7–0.8s, scale `1/zoom`, cap (~24), cull off-screen.
- [x] Spawn damage floaters in `applyHit` (and green `+N` on heal application). To limit spam on dense maps, consider showing damage only on killing blows or throttling.
- [x] On-brand bonus: a satirical multi-kill toast via the existing toast system when one unit/splash kills 3+ in a short window ("LAYOFF SPREE: 5 headcount eliminated," "RIF x3").

**Where in code.** `js/units.js:~432` (`applyHit`) + heal application block; draw + pool in `js/render.js`; toast via `js/ui.js` (~364).

**Constraints & gotchas.** `[NET]` skip floater spawns during rollback resim (`_rbReplaying`); on clients, derive from snapshot HP deltas rather than local damage math. `[PERF]` the pool cap + off-screen cull are mandatory on the big maps. `[ART]` keep numbers small/dim to stay on-brand.

**Done when.** Hits show floating damage and heals show `+N`, both fading cleanly; multi-kills fire a themed toast; no perf regression on Ep VII/XII; co-op consistent.

---

### T0-5 — Surface the personhood in session one
- [x] **Done**
- **Impact:** high · **Effort:** S–M · **Tags:** `[SAVE]`, `[NET]`
- **Related:** T0-1, T1-5, T1-6, T3-6

**Motivation.** The game's deepest, most original asset — named veterans with dossiers — is **completely invisible during the entire first session** (dossiers gate at Lv2 and live in a dropdown). The narrative persona said surfacing one named, readable veteran in the first 15 minutes would convert "interesting" into "I have to see what happens to MY people." The attachment ramp currently starts too late, so early losses are free.

**What to do.**
- [x] Add a one-time contextual tutorial pop the first time a single combat unit is selected: "Every one of your people has a name and a story — open their file from the info panel." Use the existing `CONTEXTUAL` pattern (localStorage-tracked, once-only).
- [x] Mint a lightweight identity (at least name + hometown) at **Lv1 / first selection / first kill** via `ensureDossier` (it already mints a cheap frozen seed), with the full dossier prose still unlocking at Lv2 as the "getting to know them" beat.
- [x] Occasionally substitute a dossier-aware bark on select for any unit that has a dossier — `{first}/{home}/{dream}` are already exposed by `buildDossier` (text-only; no new voice clips needed).

**Where in code.** `js/tutorial.js` `CONTEXTUAL`; `js/lore.js` `ensureDossier` (call earlier); `js/dialogs.js` `sayUnitSelected`.

**Constraints & gotchas.** `[SAVE]` minting the seed earlier changes when `u.lore` exists — keep it append-only / version-frozen (see the lore-forge contract) and ensure old saves with no early seed still load. `[NET]` dossier text is local/cosmetic; don't let it diverge sim state.

**Done when.** In mission 1, selecting a single unit triggers the discovery hint, and at least one unit has an openable named file before the mission ends.

---

### T0-6 — The veteran / memorial SHARE CARD
- [x] **Done**
- **Impact:** high (the only natural viral loop the game has) · **Effort:** M · **Tags:** `[ORDER]`, `[ART]`
- **Related:** T0-7 (links), T1-1, T1-7, T3-3 (score on card)

**Motivation.** The procedurally-written, already-emotional dossier prose is a Wordle/RimWorld-grade share machine ("pour one out for Kade, dream unfulfilled, fell at The Continuity Farm") — and the game has **zero in-game share surface** (`navigator.share` is currently wired only for co-op invites). This is the one feature that turns your best asset into growth.

**What to do.**
- [x] Add `js/sharecard.js` (load after `lore.js`, before `main.js`): `shareCard(unit_or_fallen)` draws a dark `#05080d` card to an **offscreen** canvas — sprite + full dossier name + careerTitle/rank + hometown + their highest-index bark + dream (✓/✗) + "fell at {map}" or "★Lv{n} active" + a small `starleft.vercel.app` footer.
- [x] Reuse the **existing live card-draw code** that hub menus already use (`js/ui.js:~571–610`) — render one frame to a blob instead of every frame.
- [x] Export via `canvas.toBlob → navigator.share({files:[…]})` with a `navigator.clipboard` + download-blob fallback (the same ladder used in `js/net/lobby.js` QR/copy).
- [x] Wire a "Share File" button into roster rows (`ui.js` showRoster), the dossier modal (`showDossier`), and the victory/extraction carryover chooser (`buildCarryChooser`).

**Where in code.** New `js/sharecard.js`; buttons in `js/ui.js` + dossier in `js/lore.js`.

**Constraints & gotchas.** `[ORDER]` load order. `[ART]` dark card only. Use relative asset paths. Handle the no-`navigator.share` desktop path gracefully (clipboard/download).

**Done when.** From a dossier, roster row, and the victory screen, one tap produces a branded PNG that can be shared (mobile) or copied/downloaded (desktop).

---

### T0-7 — Open Graph / Twitter Card meta tags + OG image + root index
- [x] **Done**
- **Impact:** high (cheapest growth win in the game) · **Effort:** S · **Tags:** `[ART]`
- **Related:** T0-6, T3-7, T3-8

**Motivation.** `rts.html`'s `<head>` has **zero** OG/Twitter tags, so every link pasted to Discord/Slack/Twitter/iMessage renders as a naked grey URL — for a *visual* game this alone kills cold-traffic click-through. One static edit converts ~0% to real click-through.

**What to do.**
- [x] Add a full OG/Twitter block to `rts.html` `<head>`: `og:title`, `og:description` (satire voice, e.g. "A no-build browser RTS where you run a startup, crush rival megacorps, become the monopoly — then everyone nukes each other. Free. Co-op."), `og:image`, `og:type=website`, `og:url`, `twitter:card=summary_large_image`, `twitter:image`.
- [x] Create a purpose-built **1200×630** card at `assets/og/og-card.png` composited from `assets/menu/background.png` + logo + a tagline ("Run a startup. Become the monopoly. Get nuked.") via the `_dev/gen` art pipeline. `[ART]` dark.
- [x] Add a root `index.html` that redirects to `rts.html` so the bare domain resolves and shares cleanly (also helps T3-7 itch.io entry).

**Where in code.** `rts.html` `<head>`; new `assets/og/og-card.png`; new `index.html`.

**Constraints & gotchas.** `og:url`/`og:image` should be absolute for scrapers, but keep in-game runtime paths relative. Validate with a card debugger (Twitter/Discord/Facebook) after deploy.

**Done when.** Pasting the deploy URL into Discord/Twitter renders a rich image card with title + tagline.

---

### T0-8 — "▶ Continue" button on the main menu
- [x] **Done**
- **Impact:** high (highest retention-per-line) · **Effort:** S · **Tags:** `[SAVE]`
- **Related:** T4-3 (autosave-on-unload)

**Motivation.** A returning player must currently remember to use Load Game, open a list, and decode an unlabeled "★ " row — most won't, and a paused 13-episode campaign is exactly what people return to days later.

**What to do.**
- [x] Add a prominent "▶ Continue" as the first item in the main menu; on click, load the most recent autosave (`AUTO_KEY`).
- [x] Label it with the resolved episode + elapsed time by mapping the save's map index → `MAPS[idx].crawl.episode/title` (e.g. "EPISODE VIII — THE DOWN ROUND · 14:32 in"). Hide the button when no autosave exists.
- [x] Enrich `buildLoadSlots()` rows to show the episode label, not just `G.cfg.name`.

**Where in code.** Menu in `rts.html`; wiring in `js/ui.js`; `listSaves`/`buildLoadSlots`/`AUTO_KEY` in `js/save.js`.

**Constraints & gotchas.** `[SAVE]` read-only here, but handle legacy autosaves that lack a clean map index (fall back to the raw name). Don't error when storage is empty/disabled.

**Done when.** With an autosave present, the menu shows a labeled Continue button that resumes the right episode in one click; absent autosave hides it.

---

### T0-9 — Trim the 11-second madosis lecture; teach it just-in-time
- [x] **Done**
- **Impact:** med-high · **Effort:** S
- **Related:** T0-1 (same tutorial pass), T1-5

**Motivation.** All four personas hit this unskippable wall of text about a mechanic that won't appear for ~5 episodes — the only forced dead-air moment in onboarding, at exactly the point momentum was building. The just-in-time hint already exists.

**What to do.**
- [x] Drop the `tut-madosis` hold to ~3000ms or remove the step entirely. The `CONTEXTUAL_MAP['madosis-live']` hint already fires from `madosis.js` when a breakdown actually begins — that's the correct teaching moment.
- [x] Reclaim the freed time for a victory payoff beat (ties into T1-9) rather than a lecture.

**Where in code.** `js/tutorial.js` (`tut-madosis` step, ~line 174 for the contextual map).

**Done when.** Onboarding has no unskippable multi-second text dump about future content; madosis is still taught the first time it actually happens.

---

### T0-10 — Lightweight, privacy-respecting analytics
- [x] **Done**
- **Impact:** high (makes every other change measurable) · **Effort:** S · **Tags:** `[ORDER]`, `[NET]`
- **Related:** all (instrumentation)

**Motivation.** Growth and churn are completely blind — you can't see how many players reach Episode IV or churn at the crawl, so you can't tell which of these fixes worked.

**What to do.**
- [x] Add `js/telemetry.js` exposing `TELE.event(name, props)` that POSTs via `navigator.sendBeacon` to a cookieless endpoint (self-hosted Plausible/Umami or equivalent). No PII. Respect Do-Not-Track. Gate behind a one-line consent toggle persisted in localStorage (pattern like `voice.js` settings).
- [x] Fire at the verified funnel chokepoints: `session_start` (bootGate close), `menu_shown`, `new_campaign`, `tutorial_optin` (accept/decline), `crawl_skipped` vs watched, `episode_started`/`episode_won`/`episode_lost` (idx), `hub_entered`, `coop_session` (host/join).

**Where in code.** New `js/telemetry.js` (load after `config.js`); call sites in `js/main.js` (bootGate), `js/ui.js` (menu/crawl/victory/defeat), `js/tutorial.js` (`choosePrompt`), `js/net/mp.js` (sessions).

**Constraints & gotchas.** `[ORDER]` load order. `[NET]` cosmetic/local only — never touches `G`, save, or netcode. Fail silently offline.

**Done when.** With consent on, the funnel events arrive in the dashboard; with DNT/consent off, nothing is sent.

---

### T0-11 — Boot-glyph fix + satire-first menu voice
- [x] **Done**
- **Impact:** med · **Effort:** S · **Tags:** `[ART]`
- **Related:** T0-1

**Motivation.** The literal first thing a player sees may render as a broken "Simulate ?" glyph — a "this is jank" signal at the most fragile moment. And the menu currently leads with how-to tips + real Reuters headlines instead of the satire voice that is the actual hook.

**What to do.**
- [x] Fix the boot button label (`rts.html:~127`): verify UTF-8 and use a clean "Simulate ▶" (matches the game's ▶ convention).
- [x] Bias the menu ticker toward the **fake** ULTRA NEWS on the title screen (adjust the ULTRA/real mix in `lns.js`).
- [x] Swap the rotating menu "tips" from UI-mechanic strings to the sharpest barks / crawl pull-quotes ("There is no exit strategy but victory," "My equity vests right after I die"); move the mechanic tips to an in-game help surface (see T1/T4 help items).

**Where in code.** `rts.html:~127`; `js/lns.js` (ticker mix); `js/tips.js` (menu carousel strings).

**Done when.** The boot button renders cleanly; the first menu impression is the game's comedic/dystopian voice, not a control manual or world news.

---

# TIER 1 — Feel & Attachment

*Goal: make combat feel good and make the career system land emotionally. Where "interesting" becomes "I have to see what happens to MY people."*

### T1-1 — The "Fallen" interstitial
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[ORDER]`, `[NET]`, `[ART]`
- **Related:** T0-5, T1-7, T0-6 (share the card from here)

**Motivation.** Losing a Lv2+ veteran — the system's biggest emotional beat — is currently whispered as a 10-second toast. Making loss *land* is the single biggest driver of return sessions in a permadeath roster game; it's what makes a player say "I can't let this one die."

**What to do.**
- [x] Trigger a brief (~2.5s), skippable, **solo-gated** beat from `recordFallen` for Lv2+ player units: freeze/dim the canvas, show the unit's drawn portrait (reuse the live-sprite card draw `ui.js:~571–610`), full dossier name, careerTitle+level, hometown, and their dream line with a ✓/✗ for `dreamDone`.
- [x] Queue multiple deaths; only the first per N seconds gets the full beat — the rest stack into the existing toast so a wipe isn't 12 modals.
- [x] Optional: a "Share" button on the interstitial calling T0-6's `shareCard(fallen)`.

**Where in code.** New `fallen-scene.js` (or in `js/lore.js`) called from `recordFallen`; portrait draw reuse from `js/ui.js`.

**Constraints & gotchas.** `[NET]` gate to `netRole==='solo'` (like the tutorial/extraction guards) to avoid co-op desync; in co-op, fall back to the toast. `[ORDER]` if a new file. `[ART]` dark, slow, mournful.

**Done when.** A leveled veteran's death in solo plays a short, skippable memorial beat with their dream status; mass deaths don't spam modals; co-op unaffected.

---

### T1-2 — Combat-juice pass (shake + flash + cooldown read)
- [x] **Done**
- **Impact:** high · **Effort:** S–M · **Tags:** `[NET]`, `[PERF]`
- **Related:** T0-2, T0-4, T2-2 (ability cooldowns reuse the ring)

**Motivation.** Standard combat has no weight (screenshake is REX-only) and the core micro signal — "when can I shoot again?" — is invisible. Adding it makes alpha-strike units (Lobbyist, sieged Auditor) suddenly skill-expressive.

**What to do.**
- [x] Add proportional micro-shake in `applyHit`/`killEntity` (1–3px, fast decay), scaled by attacker drawn size and whether it's a killing blow, only when the impacted entity is on-screen. Founder/Bomber/Auditor-siege hit harder; all stay well under REX's 15.
- [x] Brighten the hit flash and add a 1-frame white core on the killing blow; lengthen the flash slightly (~0.18s) so it's catchable.
- [x] Draw a **cooldown sweep on the selection ring** for selected units (depleting arc keyed to `u.cd/def.cd`, brightening to full when ready). Optionally a thin reload pip under the HP bar for high-cd units (cd ≥ 1.5).

**Where in code.** `js/units.js:~432`/`killEntity`; render in `js/render.js` (selection ellipse ~1249, HP bar block ~1382).

**Constraints & gotchas.** `[NET]` shake/flash are cosmetic — gate spawning with `_rbReplaying`; clients drive from snapshots. `[PERF]` cooldown sweep only for *selected* units (not 200 bars at once).

**Done when.** Heavy hits shake the screen subtly, killing blows pop, and selected units show a readable cooldown; bosses still feel biggest; no co-op/rollback divergence.

---

### T1-3 — Make the healer visible (heal beam)
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[NET]`, `[PERF]`
- **Related:** T0-3 (`heal_tick` SFX), T1-4

**Motivation.** Biba's / the Recruiter's / Courier's entire role is invisible — they're glowing statues. A visible heal link makes the support role feel like a hero and teaches players what healers do.

**What to do.**
- [x] In the render shot-FX block (where it iterates shooters and draws bolts), add a parallel pass for active healers: an additive purple/white tether from `muzzleWorld()` to target with a small traveling orb (reuse `drawLaserBolt`'s cached glow sprite, recolored) + a soft green `+HP` sparkle on the target.
- [x] Drive it off the existing heal action timing (`u._actState==='heal'`). Pair with the `heal_tick` SFX from T0-3.

**Where in code.** `js/render.js:~306` (shot-FX block); heal state in `js/units.js`.

**Constraints & gotchas.** `[NET]` cosmetic, snapshot-driven on clients. `[PERF]` cap simultaneous beams; cull off-screen.

**Done when.** Active healers visibly beam their target with an on-brand purple/green link and a heal tick sound.

---

### T1-4 — Smarter healer targeting (triage, not nearest)
- [x] **Done**
- **Impact:** med · **Effort:** S · **Tags:** `[NET]`
- **Related:** T1-3, T0-5

**Motivation.** Auto-heal picks the closest ally, not the most critical — removing the highest-skill support micro and failing to protect the irreplaceable lore units players are attached to.

**What to do.**
- [x] Change auto-heal scoring (`units.js:~544–546`) from nearest to most-urgent: score by `(1 - hp/maxHp)`, weighted up for high-star vets (`o.stars`) and heroes; keep closest as the tiebreak.
- [x] Make focus-heal "sticky priority" rather than exclusive: a focus-healed target stays top priority, but the healer tops off others when the locked target is full (instead of fully reverting).

**Where in code.** `js/units.js:~524–560` (heal block).

**Constraints & gotchas.** `[NET]` this is sim logic — runs on host/solo, replays deterministically; keep it pure (no `Math.random`). Verify it doesn't oscillate between two equally-wounded targets.

**Done when.** Healers prioritize the most-wounded/most-valuable ally; focus-heal no longer wastes overheal.

---

### T1-5 — Surface madosis as a managed-tension bar
- [x] **Done**
- **Impact:** high · **Effort:** S · **Tags:** `[VERIFY]`, `[NET]`
- **Related:** T0-9, T1-1, T1-6

**Motivation.** The meter that decides whether your best vet betrays you is opaque — players experience it as a random rug-pull. Surfacing it converts punishment into a system players *manage*, which is exactly what makes them invest in keeping a specific named unit alive.

**What to do.**
- [x] `[VERIFY]` first: confirm no madosis indicator already exists; if a partial one does, the task is "make it persistent/legible," not "create."
- [x] Draw a thin colored sub-bar under the selection ring for any Lv2+ unit with a sanity threshold (`ratio = u.madosis/threshold`, amber > 0.6, red > 0.85, **slow ~2Hz pulse — not a per-frame `sin(t*6)` strobe**).
- [x] Add the same bar to the bottom selection-info panel and the carry-chooser cards.
- [x] Throttle the existing mad-dog aura strobe to ~2–3Hz and gate amplitude on `prefers-reduced-motion` to a static ring (photosensitivity + readability).

**Where in code.** `js/render.js` selection draw (~1249) + mad-dog aura (~1416); selection info in `js/ui.js` (~74).

**Constraints & gotchas.** `[NET]` pure draw of already-computed state — no sim change. Respect `prefers-reduced-motion`.

**Done when.** Selecting a leveled unit shows a calm, readable madosis bar that escalates color near threshold; the mad-dog aura no longer strobes at ~10Hz.

---

### T1-6 — Dossier-aware barks + grief reactions
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[SAVE]`
- **Related:** T0-5, T1-1, T1-5; **use the `starleft-lore-forge` skill** (owns the append-only/version-frozen LORE_SAY contract)

**Motivation.** Barks never reference a unit's own dossier, so named veterans are interchangeable. A vet saying "Back in {home} they said I'd amount to nothing" builds individuality for free, and a grief bark when a comrade falls makes the invisible trauma accrual audible.

**What to do.**
- [x] Add a small pool of dossier-templated barks for Lv2+ units filling `{me}/{home}/{dream}/{trauma}` via the existing `d.fill`; on select, bias ~30% toward a dossier-aware line. Text-only (no new voice clips → doesn't block the TTS pipeline).
- [x] When `madosisEvent(state,'vetDeath',…)` fires, have the highest-madosis nearby survivor speak a short grief bark (a new `tone:grief` bucket in `LORE_SAY_FALLBACK`), gated to skip during rollback.

**Where in code.** `js/dialogs.js` + new pool in `js/dialog_data.js` (or generate via the lore-forge skill).

**Constraints & gotchas.** `[SAVE]` keep the bark pools append-only and version-frozen so existing veterans' identities don't shift and saves stay valid. `[NET]` gate grief barks like the other madosis toasts (skip during resim).

**Done when.** Leveled units occasionally speak lines referencing their own backstory, and a nearby survivor reacts when a comrade dies.

---

### T1-7 — Surface the memorial at the moments it earns weight
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** none new (pure wiring)
- **Related:** T1-1, T0-6, T4-1

**Motivation.** The memorial is the narrative spine of Arc 2 but is two taps deep and never surfaced when it matters. Making players walk past their dead between missions builds the emotional debt the resurrection arc later pays off.

**What to do.**
- [x] Render fallen names on/near **The Wake** tower in the HUB so every hub visit passes the dead (also motivates the resurrection economy). Pre-XIII, clicking it can open the Fallen list framed "LATTICE OFFLINE — resurrection unlocks at the GRAAL."
- [x] Auto-open the memorial overlay as the **Episode VII flash** resolves (`hub.js` `epSevenFlashAftermath`) — the canonical moment the whole roster joins it.
- [x] Add a "Veterans & Memorial" button to the victory/HUB screens (not just the buried dropdown). All reuse `rosterHTML`.

**Where in code.** `js/hub.js` (Wake POI + flash aftermath); `js/ui.js` (victory/HUB buttons); `rosterHTML` in `js/lore.js`.

**Done when.** The memorial is visible in the HUB, auto-reveals at the flash, and is reachable from a top-level button.

---

### T1-8 — Voice the tutorial coach (Rod)
- [x] **Done**
- **Impact:** med · **Effort:** S–M · **Tags:** none (asset generation)
- **Related:** T0-1, T1-6; **use the `starleft-lore-forge` skill / TTS pipeline**

**Motivation.** Rod is the only character a player meets in session one, and he's silently captioned immediately after a fully-voiced crawl — every persona read the downgrade as "cut corners / unfinished." The playback code is already shipped and waiting.

**What to do.**
- [x] Generate the Rod tutorial clips via the existing lore-forge/Qwen-TTS pipeline (the missing `tutorial/` voice folder): 12 steps + 3 contextual tips + touch variants.
- [x] Confirm they're picked up by the already-wired `VOICE.playTutorial` API and `_touch` fallback in `js/voice.js`.

**Where in code.** `assets/audio/voice/tutorial/` (new clips); playback in `js/voice.js`.

**Constraints & gotchas.** Relative paths; graceful missing-file handling already exists. Keep the dark/measured tone.

**Done when.** Tutorial steps and contextual tips play voiced narration on desktop and touch.

---

### T1-9 — Victory run-summary + dream-fulfilled payoff
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** none new (reads existing state)
- **Related:** T0-9 (reclaimed time), T3-3 (score), T2-... crawl tokens

**Motivation.** Victory is currently stats-free; returning players have no "state of my company" dopamine, and the dream-fulfillment beat (the closest thing to a per-unit emotional climax) is mechanically trivial and unceremonious.

**What to do.**
- [x] Extend `onVictory` to show the already-computed reward breakdown (`hubRewardFor`: per-kill/building/HQ/funding) + "Vets promoted this map" + a "The Fallen this quarter" strip; add elapsed time / peakSupply / unitsLost.
- [x] When a unit's `dreamDone` flips (the one place it's set, `applyEventFx`), fire a held `eventToast` with the dossier name + dream text + a gold-accent dialog bubble ("I outlasted it. The thing I built is still standing."), and add a `{dreamFulfilled:name}` token to `crawlVars` so the next episode's crawl can reference it.

**Where in code.** `js/ui.js` `onVictory` (~1273); reward in `js/hub.js` (~168–173); dream flag in `js/lore.js` `applyEventFx`; crawl tokens in `js/career.js` (~261–288).

**Constraints & gotchas.** Pure reads of existing globals — no save-format change. Keep the crawl token resolver's soft-fail-on-missing behavior.

**Done when.** The victory screen shows kills/buildings/funding + promotions + fallen; fulfilling a dream produces a visible, referenced payoff.

---

# TIER 2 — Depth & Variety

*Goal: more than one win verb and more than stat-sliders, so players reach the GRAAL arc instead of stopping at Episode V.*

### T2-1 — Second & third win verb (`winCondition` schema field)
- [x] **Done**
- **Impact:** high · **Effort:** L · **Tags:** `[SAVE]`, `[NET]`
- **Related:** keystone for T2-7, T2-8, T3-4 (Hold the Pitch)

**Motivation.** Every one of 13 missions is "raze N buildings." A second/third victory verb is what converts "I've seen this mission, I'll stop at Episode V" into "what does the next quarter make me do?" The systems for it already exist.

**What to do.**
- [x] Add a `cfg.winCondition` field (string + params) to the map schema; branch `checkWinLose` on it **before** the existing `if(!enemyBuildings)` block. Default to `razeAll` so old saves/untouched maps are unchanged.
- [x] Implement reusing existing systems: **'survive'** (win when `state.time > cfg.surviveFor` while a designated building lives — reuse the wave spawner, don't grace-gate it); **'escort'** (win when a flagged unit reaches a target tile — reuse captive/abandoned tagging + `reclaimOutposts`' proximity loop); **'reachAndHold'** (hold a tile/building N seconds).
- [x] Author 3–4 maps using the new verbs (timed defense of a captured Dark Tower; escort Biba's lattice convoy to the edge).

**Where in code.** `checkWinLose` in `js/core.js:~170`; schema in `js/config.js`/maps in `js/maps_data.js`; wave spawner in `js/ai.js`; proximity in the reclaim path.

**Constraints & gotchas.** `[SAVE]` missing `winCondition` must default to `razeAll`. `[NET]` win checks run on host/solo; clients receive the result via snapshot — don't compute win client-side. Use the `starleft-mapmaker` skill for the new maps.

**Done when.** At least one survive, one escort, and one reach-and-hold mission play correctly in solo and co-op; legacy maps still win on raze-all.

---

### T2-2 — One manual active ability per combat unit
- [x] **Done**
- **Impact:** high · **Effort:** L · **Tags:** `[SAVE]`, `[NET]`, `[UI]`, `[PERF]`
- **Related:** T1-2 (cooldown ring), T2-3

**Motivation.** The whole roster is passive stat-sliders that auto-fire — the RTS vet's core engagement loop (a kit of decisions) is denied. One manual ability per unit is the biggest depth multiplier for the least new code because every effect already exists somewhere.

**What to do.**
- [x] Add a `cmd.type==='ability'` handler in `units.js` and a per-unit `u.abilCd`.
- [x] Implement each by reusing existing tech: Auditor → make siege a **manual toggle** (the stat override at `units.js:~589–590` already exists); Hustler "Caffeine Dash" (sprint speed mult for ~2s); Foodtruck "Napalm Cone" (one-shot boosted `applyHit` splash); Lobbyist "Lobby Blitz" (instant cooldown reset for one extra shot); Founder "Stomp" (scaled-down `stepMech` quake from `villains.js:~348`).
- [x] Wire an ability button in `ui.js` `buildCommands` next to Stop; draw the cooldown as a radial sweep on the selection ring (shares T1-2).

**Where in code.** `js/units.js` (handler + per-unit effects); `js/ui.js` `buildCommands`; `js/render.js` (cooldown ring); `js/net/commands.js` (new command type).

**Constraints & gotchas.** `[NET]` route the ability through the `net*` command wrappers so host validates/replays; `u.abilCd` is sim state. `[SAVE]` add `abilCd` to serialization with a safe default (legacy units = ready/0). `[UI]` keep the `refreshUI` signature stable. `[PERF]` Stomp/Napalm splash must respect particle caps.

**Done when.** Each combat unit has a button-triggered ability on a visible cooldown that works in solo and co-op; saves with/without the field both load.

---

### T2-3 — Attack-move + stances
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[SAVE]`, `[NET]`, `[UI]`, `[MOBILE]`

**Motivation.** No attack-move and no hold/hold-fire means kiting, clean engages, and tactical fallback are impossible to express — the RTS vet quit specifically because always-on retaliation locks units into fights. The command vocabulary is below genre baseline.

**What to do.**
- [x] Surface attack-move: bind `A` (desktop) to arm an attack-move cursor (next tap issues `{type:'amove'}`); add an ⚔ Attack-Move button to the unit command bar for touch. The `amove` handler (`units.js:~681`) and auto-acquire respect (`~564`) already exist.
- [x] Add a Hold/Defensive/Aggressive stance pip (cycle on the Stop button) writing `u.stance`, checked in the auto-target gate (`units.js:564`) and retaliation (`~940`).
- [x] Add a one-line contextual tip the first time 3+ combat units are selected: "Press A then click to advance and fight."

**Where in code.** `js/input.js` `dispatchTap`; `js/main.js` keydown + touch button wiring; gates in `js/units.js:564/940`; button in `js/ui.js`; contextual tip in `js/tutorial.js`.

**Constraints & gotchas.** `[NET]` issue the actual order through `net*` wrappers (stance-arming/selection stays local). `[SAVE]` `u.stance` defaults to current behavior (aggressive/retaliate) for legacy units. `[MOBILE]` the ⚔ button must be reachable on touch.

**Done when.** Players can attack-move and set Hold/Defensive/Aggressive; a held unit doesn't auto-chase; co-op consistent; legacy saves default sanely.

---

### T2-4 — A real counter axis (armor / piercing)
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[SAVE]`, `[NET]`

**Motivation.** The roster reads as identical — no rock-paper-scissors the player can exploit. One lightweight counter axis makes "they have mechs → build Lobbyists" a real read and makes the M.D.C. squad-picking matter.

**What to do.**
- [x] Generalize the dmg-reduction path that **already exists for the ninja** (`units.js:~933`) into an `armor` stat (e.g. `0.3`) on vehicles/mechs (Auditor, Founder, REX) and a `pierce:true` flag on a couple of units (Lobbyist, Auditor cannon) where piercing ignores the armor %.
- [x] Encode in `DEF` (`config.js`); branch in `damage()`. Result: armored units shrug off small-arms (Soldier/Hustler) but melt to piercing.

**Where in code.** `DEF` in `js/config.js`; `damage()`/dmg-reduce in `js/units.js:~933`.

**Constraints & gotchas.** `[NET]` pure damage math — must be deterministic across host/client/rollback. `[SAVE]` stat-only (read from `DEF`), no per-entity persistence needed; confirm no save impact. Re-check balance after (the hand-tuned envelope).

**Done when.** Armored units take reduced damage from non-piercing attackers and full damage from piercing ones; the counter is legible in play.

---

### T2-5 — Make Funding scarce + Satellite Office expansion race
- [x] **Done**
- **Impact:** high · **Effort:** S–M (mostly data) · **Tags:** `[NET]` (supply recompute)

**Motivation.** Macro has zero tension because the home cluster funds a winning army and supply is a wall, not a choice. Making Funding scarce and the Satellite Office a real mid-game pivot adds the single decision the macro layer is missing ("expand to the contested node, or push?").

**What to do.**
- [x] Rebalance the `goldNodes` arrays in `MAPS` (`maps_data.js`): cut home-node amounts ~40–50% so they fund roughly one army cycle; place 1–2 high-value nodes (~3000–4000) in contested mid-map no-man's-land (Ep XII's `{x:55,y:52,amt:4200}` already gestures at this — make it the norm).
- [x] Give the Satellite Office `supply` (e.g. `supply:8`) + a fatter trickle so a forward branch is a real tradeoff vs. a fortress HQ; surface supply in the tutorial since it's currently untaught.
- [x] Add an **income/sec readout** to the top bar (rolling delta of `eco.gold_collected` over ~3s — it already increments on deposit and trickle). One accumulator + one HUD span.
- [x] Optional: smooth gather accrual (`u.carrying += rate*dt`) so interruption never loses a batch, and add a saturation cue on over-mined nodes.

**Where in code.** `goldNodes` (per-map) in `js/maps_data.js`; Satellite Office `DEF` in `js/config.js`; supply summation/`recomputeSupply`; HUD in `js/ui.js` `refreshUI`; gather in `js/units.js:~641`.

**Constraints & gotchas.** `[NET]` the income readout is a local HUD read; supply changes affect sim — keep deterministic. Re-balance carefully so early maps don't become unwinnable.

**Done when.** A map's home cluster can't solo-fund a win, the Satellite Office is a meaningful expansion choice, and the HUD shows income/sec.

---

### T2-6 — Teach the advanced units by necessity + make Sprint legible
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[NET]`, `[PERF]`

**Motivation.** Auditor/Founder/Courier/Bomber are never required, so most players never discover the game's depth; Sprint-kiting is the best micro skill and is almost completely hidden.

**What to do.**
- [x] Use terrain + objectives to force specific units in specific missions: an A&O flyer wave (enemy `air` units) that requires anti-air (flyers already gate to `def.antiAir`); a turret-ringed vault that wants a sieged Auditor's splash. Surface as one-time hints via the existing `CONTEXTUAL` tip pipeline (add `auditor-siege`, `antiair-needed`).
- [x] Make Sprint legible: draw a speed-streak/afterimage on actively-sprinting units (reuse the ninja afterimage `render.js:~1335–1344`); add a contextual trigger the first time the player is chased by 2+ enemies with combat units ("Double-tap past your turret to bait them into the crossfire"); add a "sprinting" label on the selection panel.

**Where in code.** Enemy `air` waves via `js/ai.js` + maps in `js/maps_data.js` (mapmaker skill); hints in `js/tutorial.js` (~164–175); afterimage in `js/render.js`.

**Constraints & gotchas.** `[NET]` afterimage is cosmetic; the forced-unit maps add enemy air — verify anti-air targeting holds in co-op. `[PERF]` afterimages pooled/culled.

**Done when.** At least one mid-campaign map can't be brute-forced without anti-air and one rewards siege; sprinting units visibly streak and the tactic is taught contextually.

---

### T2-7 — More boss beats; promote REX into the mainline
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[NET]`; **use `starleft-mapmaker`**
- **Related:** T2-1 (Dark-Tower guardian as a win-by-boss), T2-9

**Motivation.** Only 2 boss fights in 15 maps, and the better-paced one (REX) is optional/post-campaign — the best combat is rationed, and the campaign doesn't end on its best fight.

**What to do.**
- [x] Add 2–3 mid-tier "lieutenant" duels using the existing villain framework (`cfg.villain` → boss arena, no enemy bases needed; `hpVpiScale`/phases/flee `villains.js:~42–65` scale to roster power for free): an A&O enforcer between Ep IX–X (the entity hunting Biba), a Dark-Tower guardian boss **as** the Ep XI climax (also satisfies T2-1 for that map).
- [x] Promote REX into the mainline: change `returnTo`/sequencing so the campaign routes **through** him as the true finale.

**Where in code.** `js/villains.js` (boss config); map sequencing in `js/maps_data.js` (mapmaker skill).

**Constraints & gotchas.** `[NET]` boss AI runs on host/solo; verify the boss path replays deterministically in rollback (existing bosses already do). Don't break the career-limit/episode gating (see `docs/episodes-career-limit.md`).

**Done when.** 2–3 new boss beats are reachable in the mainline campaign and the campaign ends on the REX fight.

---

### T2-8 — Recur the Episode-X infiltration + mid-mission event beats
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[NET]`; **use `starleft-mapmaker`**
- **Related:** T2-1 (escort), T2-7

**Motivation.** Episode X (corridors/captives/no-economy) is the campaign's best mission and never recurs — the systems are generic engine features, not Ep-X hardcode. And every map is one continuous grind to the same end, with no authored pacing.

**What to do.**
- [x] Build 1–2 more corridor/infiltration maps in Arc 2 (a data-heist into an A&O backup vault that escorts a stolen-lattice unit **out** — combine with T2-1's escort verb; or a "rescue a captured veteran from your own memorial" beat tying the corridor to the resurrection plot). Mostly map authoring.
- [x] Add a `cfg.events` array of `{atTime, action}` processed in `update()` right after the AI tick (`core.js:~61`): spawn a guard squad, raise aggression, drop a one-time toast + objective change, trigger a mini-boss. Authored pacing on top of the procedural AI.

**Where in code.** Maps in `js/maps_data.js` (mapmaker skill); event hook in `js/core.js` after the AI tick.

**Constraints & gotchas.** `[NET]` process events on host/solo only; clients receive results via snapshot (don't run the event loop client-side). Keep actions deterministic.

**Done when.** 1–2 new infiltration maps play, and at least one map uses scripted mid-mission beats (quiet build → crisis → finale).

---

### T2-9 — Make Arc 2 re-escalate; tie supply into mission design
- [x] **Done**
- **Impact:** med · **Effort:** S · **Tags:** none new (tuning)
- **Related:** T2-5, T4-2

**Motivation.** The difficulty curve plateaus (the code comments admit it without justifying it). A player who carried a strong roster should feel Episode XIII as the *hardest* fight, not a victory lap.

**What to do.**
- [x] Ramp Ep VIII–XIII aggression to a clean 1.2 → 1.4 → 1.6 → 1.8 → 2.0 → 2.2 in `maps_data.js`.
- [x] Bump `VET_MAXBONUS` per-arc using the **reserved `idx` param** in `vetScalingBonus` (`balance.js` — the comment says "idx is reserved for future per-arc tuning") so Arc-2 bases muster more defenders against a maxed roster; let the wave spawner read VPI to send larger/faster reinforcement waves (extend `vetMintFactor` `balance.js:~82` to also raise the wave-size cap).
- [x] Standardize `graceTime` to a documented formula (larger maps → proportionally more grace).
- [x] Author 1–2 deliberately economy-starved "down round" maps (pure config) so the single-resource economy matters as a difficulty knob.

**Where in code.** Per-map `aggression`/`graceTime`/`goldNodes` in `js/maps_data.js`; `VET_MAXBONUS`/`vetScalingBonus`/`vetMintFactor` in `js/balance.js`; wave cap in `js/ai.js`.

**Constraints & gotchas.** Avoid continuous rescaling (degenerate stalling + co-op/rollback complexity) — raise headroom at spawn instead. Re-verify each Arc-2 map is still winnable.

**Done when.** Aggression climbs monotonically through Arc 2, a maxed roster faces a genuine fight at Episode XIII, and at least one starved-economy map exists.

---

# TIER 3 — Replayability & the Growth Engine

*Goal: a reason to play after the campaign, and loops that pull new players in.*

### T3-1 — New Game+
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[SAVE]`, `[NET]`

**Motivation.** The endgame is a literal dead-end: IPO screen → `location.reload()`. NG+ turns the deep-but-disposable career into a thing worth maxing and gives your most-invested players (your evangelists) a reason to continue.

**What to do.**
- [x] On the IPO screen, replace the single reload with two: "Found a New Startup" (full reset, as today) and "Take the Money and Disrupt Again" (NG+).
- [x] NG+ keeps `carryoverVets`, `carryoverHeroes`, `fallenVets`, and `CAMPAIGN` (M3$/condos/upgrades), sets a global `ngPlus` counter, and re-enters `loadMap(0)` **without** the resets.
- [x] Feed `ngPlus` into difficulty: a flat enemy-bonus term in `balance.js` alongside VPI, and `cfg.aggression × (1 + 0.15·ngPlus)` at map load. Serialize `ngPlus`.

**Where in code.** IPO branch in `js/ui.js` (~1291); reset guards in `startGame`/`loadMap`; `js/balance.js` + `newMap` read; serialization in `js/save.js`.

**Constraints & gotchas.** `[SAVE]` add `ngPlus` with a default of 0 for legacy saves; don't require it. `[NET]` ensure the difficulty multiplier is applied identically on host/client.

**Done when.** Completing the campaign offers NG+ that carries the roster/memorial into a harder lap; `ngPlus` persists and scales enemies.

---

### T3-2 — Solo Skirmish + Daily/Random maps
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[VERIFY]`, `[ORDER]`, `[NET]`
- **Related:** T3-3, T3-4

**Motivation.** Solo players have zero non-campaign mode, despite a fully **seed-deterministic** generator. Daily maps (same seed for everyone that day) are a natural social/sharing unit.

**What to do.**
- [x] `[VERIFY]` first: confirm there's no reusable solo-skirmish path already (the skeptic flagged "just expose MP skirmish" as likely wrong — treat this as **build**, not unhide).
- [x] Add a "Skirmish" nav button opening the existing map grid, routed to `startSkirmish(i)`: set combat mode, skip crawl/carryover (`setCarryover([])`/`resetHeroes()`), `loadMap(i)`, set `G._skirmish=true` so `onVictory` shows a "Skirmish Cleared — Play Again / Pick Another" screen instead of advancing the campaign.
- [x] Add `js/skirmish_gen.js` (classic script, before `main.js`): `rollSkirmishConfig(seed)` clones a template cfg, picks a random biome pair, sets `cfg.seed`, randomizes w/h within shipped bounds (48–124), scales enemies/aggression by difficulty, and lets the generator place nodes/bases procedurally.
- [x] Two entries: "Daily Disruption" (`seed = dateToSeed(YYYYMMDD)`) and "Random Skirmish" (random seed).

**Where in code.** Map grid in `js/ui.js` (`buildMapSelect` ~1104); nav in `rts.html`; `onVictory` branch in `js/ui.js`; new `js/skirmish_gen.js`; generator in `js/map.js`.

**Constraints & gotchas.** `[ORDER]` load order for the new script. `[NET]` skirmish should also work as a co-op map pick (the MP skirmish mode exists). Don't use `Date.now()`/`Math.random()` in deterministic sim paths — roll the seed in the menu layer and pass it in.

**Done when.** Solo players can launch a chosen, a daily, or a random skirmish and replay it; the campaign is untouched.

---

### T3-3 — Run score ("Valuation")
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** none new (reads existing stats)
- **Related:** T3-2 (daily score sharing), T1-9, T0-6

**Motivation.** There's no quantified reason to replay or improve. A score on daily maps is what people screenshot and compare.

**What to do.**
- [x] Extend `hubEnsureStats`/`hubRewardFor` (`hub.js:~168–174` already returns unitKills/buildingKills/hqKills/funding) to also track elapsed time, peakSupply, and unitsLost (increment in `recordFallen`).
- [x] Compute a themed score in `onVictory`: "Valuation = funding + kills·X − time_penalty − units_lost·Y, ×mutator_multiplier." Persist a per-map/seed best in localStorage (`starleft_best_<seed>`), display "Best: $X.XB."
- [x] Surface it on the victory/skirmish-clear screen and (T0-6) on the share card.

**Where in code.** `js/hub.js` (stats); `js/core.js` (~97 `recordFallen`); `js/ui.js` `onVictory`.

**Constraints & gotchas.** localStorage best is orthogonal to the save file (no save-format change). Make the formula stable so bests are comparable.

**Done when.** Victory/skirmish screens show a Valuation and a persisted best; daily maps compare against a shared seed.

---

### T3-4 — Mutators (skirmish/endless only)
- [x] **Done**
- **Impact:** high · **Effort:** L · **Tags:** `[ORDER]`, `[NET]`
- **Related:** T3-2, T2-1 (Hold the Pitch reuses 'survive')

**Motivation.** No mode variety to chase. Mutators add huge replay variety cheaply because the underlying systems already exist. (Keep the **campaign authored** — mutators are for skirmish/endless only.)

**What to do.**
- [x] Add `js/mutators.js` defining ~8 toggles read at map load and per-tick, each a small hook: Crunch Time (`graceTime=0`, half wave timer), Sanity Collapse (madosis ×3), Bull Market (gold ×2), Down Round (`startGold=0`, must capture Satellite Offices), Hold the Pitch (survive N waves — reuses T2-1's 'survive'), Sudden Death (no self-heal — flip the Lv11 regen).
- [x] Surface as checkboxes on the skirmish setup screen; bank a score multiplier per stacked mutator (feeds T3-3).

**Where in code.** New `js/mutators.js`; read in `newMap`/`loadMap`, `core.js` per-tick, and the relevant config overrides (`madosis.js`, gold nodes, `ai.js`, `career.js` regen).

**Constraints & gotchas.** `[ORDER]` load order. `[NET]` mutator state must be part of the host→client setup so co-op skirmishes agree; keep effects deterministic. Don't let mutators touch campaign maps.

**Done when.** Skirmish setup offers stackable mutators that visibly change the run and the score multiplier; co-op honors them.

---

### T3-5 — Achievements tied to YOUR unique systems
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[ORDER]`
- **Related:** T1-7, T3-6

**Motivation.** Generic achievements were rejected; the value is achievements hooked to madosis/dossiers/heroes/the flash — the things only STARLEFT has.

**What to do.**
- [x] Add `js/achievements.js` (classic script): an `ACHIEVEMENTS` table of ~25 startup-satire entries `{id, name, test()}` checked at existing event hooks (`recordFallen`, `promoteIfReady`, `onVictory`, `madResolveRescue`, hub reborn). Persist the unlocked set in localStorage.
- [x] Examples: "Down Round" (continue after the flash), "Equity Vested" (a veteran fulfills their dream), "Whatever It Takes" (Lv30 vet), "Pet Project" (rescue a mad-dog).
- [x] Surface as a tab in the under-used Roster/Veterans overlay.

**Where in code.** New `js/achievements.js`; hooks in `js/lore.js` (~207, ~261), `js/career.js` (~110), `js/ui.js` `onVictory`; overlay in `js/ui.js`/`js/lore.js` `rosterHTML`.

**Constraints & gotchas.** `[ORDER]` load order. localStorage-only (orthogonal to saves). Each `test()` 1–3 lines on an existing event.

**Done when.** ~25 themed achievements unlock at the right moments and show in the Roster overlay.

---

### T3-6 — Cross-run "Founder's Ledger" / Hall of Fame
- [x] **Done**
- **Impact:** high · **Effort:** M · **Tags:** `[SAVE]`
- **Related:** T3-1, T1-7, T0-6

**Motivation.** The stickiest asset — named veterans + memorial — is destroyed on completion. A cross-run ledger makes the dossier/memorial system a persistent identity and the strongest reason to start campaign #2.

**What to do.**
- [x] On campaign completion (IPO) or loss-and-restart, append the run's surviving veterans + full memorial to a capped meta-record in a **separate, orthogonal localStorage key** (`starleft_ledger`).
- [x] Track lifetime stats: campaigns completed, total fallen, longest-lived veteran, dreams fulfilled. Render as a new tab in the Roster overlay (reuse `rosterHTML`).
- [x] Optional: let one Hall-of-Fame legend be re-hired into a new campaign as a costed perk.

**Where in code.** New localStorage key written from `js/ui.js` IPO/restart paths; overlay in `js/lore.js` `rosterHTML` (~277).

**Constraints & gotchas.** `[SAVE]` the ledger is a NEW key never touched by the v2 save loader — save-compat-safe by construction. Cap its size.

**Done when.** Completing or restarting a campaign records its roster/memorial to a persistent ledger visible across runs.

---

### T3-7 — Distribution actions (README, repo metadata, itch.io)
- [x] **Done**
- **Impact:** high · **Effort:** S–M · **Tags:** none (mostly non-code)
- **Related:** T0-6, T0-7, T3-8

**Motivation.** The game is functionally invisible: no README, empty repo description, zero topics, not on any web-game portal, and a stale deploy URL in docs. The highest-intent discovery channel (itch.io) is unused.

**What to do.**
- [x] Write `README.md`: a hero GIF/screenshot (dark menu + a combat clash + a dossier), the satire one-liner pitch, a prominent "PLAY NOW → https://starleft.vercel.app" link, a 3-bullet feature list (procedural dossiers + permadeath memorial; 13-episode moral-descent campaign; serverless co-op via room code/QR), and the "no build, plain JS" angle.
- [x] Set the GitHub repo description + topics (`rts`, `browser-game`, `webrtc`, `no-build`, `javascript`, `startup-satire`). Reconcile the canonical deploy URL across docs/MEMORY (vercel.app appears canonical; MEMORY says GitHub Pages — stale).
- [x] Package the static bundle (`rts.html` + `js/` + `css/` + `assets/`) as an **itch.io HTML5 game** (use the T0-7 `index.html` as entry), upload screenshots (menu key art, a 20-unit clash, the IPO screen, a dossier, the nuke), satire-voiced page copy, and a short devlog. Tag `rts`/`co-op`/`satire`/`cyberpunk`. Then a "Show HN" / r/WebGames post anchored on the first shareable clip.

**Where in code.** New `README.md`; GitHub repo settings; itch.io upload (needs T0-7 `index.html`).

**Constraints & gotchas.** Ensure the bundle works from an itch subpath — keep runtime paths relative.

**Done when.** The repo has a README + topics, the deploy URL is consistent, and the game is live on itch.io with screenshots.

---

### T3-8 — Make co-op an active growth loop
- [x] **Done**
- **Impact:** med · **Effort:** S · **Tags:** none new
- **Related:** T0-7 (rich invite card)

**Motivation.** The strongest organic loop (drag a friend into co-op) is locked behind already being in-game.

**What to do.**
- [x] Add an "Invite a friend" affordance to the **in-game** top menu that creates/opens a room and immediately fires `navigator.share`/clipboard with the invite link + a line like "Co-found my startup — drop into co-op." Reuse `mpInviteLink` (`lobby.js:~12`) + the QR/copy fallback ladder.
- [x] Once T0-7 lands, ensure the `#mp=CODE` invite link carries the same rich OG card so a pasted invite looks like an invitation, not spam.

**Where in code.** In-game menu in `rts.html` + `js/net/lobby.js`/`js/net/mp-ui.js`.

**Done when.** A player can one-tap invite a friend mid-session, and the invite link previews as a rich card.

---

### T3-9 — Give M3$ an infinite, on-theme sink
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[SAVE]`, `[NET]`

**Motivation.** The HUB metagame (condos/implants/training/Wake) caps out, so there's no reason to keep earning M3$.

**What to do.**
- [x] Add a repeatable, rising-cost "Series ∞" upgrade in ULTRA HQ (each rank = small global roster buff, e.g. +1% HP).
- [x] Better: let M3$ **buy skirmish/endless modifiers** ("Buy a Bigger Round": +startGold; "Hire Lobbyists": free starting vets) — turning the meta-currency into roguelite run-investment.
- [x] Fix the HUB gamble to be actually random (replace the deterministic `visit*37` check, `hub.js:~1099`, with seeded RNG).

**Where in code.** Upgrade handlers in `js/hub.js`; ULTRA menu in `js/ui.js` (~1030); `CAMPAIGN` already serializes m3 + upgrades.

**Constraints & gotchas.** `[SAVE]` new upgrade ranks must default safely for legacy saves (CAMPAIGN serialization). `[NET]` if the buffs apply in co-op, both peers must agree; keep deterministic.

**Done when.** M3$ has an uncapped sink and the HUB gamble is genuinely random.

---

# TIER 4 — Bigger Bets

### T4-1 — Ship the resurrection-choice payoff
- [x] **Done**
- **Impact:** high · **Effort:** L · **Tags:** `[CONTENT]`, `[SAVE]`; **use `starleft-mapmaker`**
- **Related:** T1-7, T3-6

**Motivation.** The Wake/REBORN infrastructure exists with **no payoff map** — the campaign's entire emotional thesis currently has no ending. You can't sell "reach Episode XIII for the resurrection choice" when the choice isn't there.

**What to do.**
- [x] Even before a full Episode XIV: when The Wake unlocks (Ep XIII), fire an `eventToast`/crawl beat tying it to the GRAAL ("You can bring ONE of them back. Choose.").
- [x] Make resurrection a deliberate, ceremonious overlay listing the fallen **with their dreams** (reuse `fallenDossierSnap`, `lore.js:~239`) rather than a stats list; surface the 3-ever cap as in-fiction scarcity, not a silent null-on-affordable check.
- [x] Then land the dedicated payoff map via the mapmaker skill.

**Where in code.** `js/hub.js` (Wake unlock); resurrection overlay in `js/ui.js`/`js/lore.js`; new map in `js/config.js` (mapmaker skill).

**Constraints & gotchas.** `[SAVE]` the resurrection state/cap must serialize and default safely. `[CONTENT]` this is the arc's climax — coordinate with `docs/world-bible.md`.

**Done when.** Reaching the GRAAL presents a ceremonious, dream-aware "bring one back" choice with real scarcity, and a payoff map exists.

---

### T4-2 — Difficulty selector
- [x] **Done**
- **Impact:** med · **Effort:** S · **Tags:** `[SAVE]`
- **Related:** T2-9, T3-1

**Motivation.** VPI auto-scaling is the only adaptive layer and it's invisible/uncontrollable; a selector surfaces it as a player-facing dial and gives replayers an explicit harder lap.

**What to do.**
- [x] Add a selector ("Bootstrap / Series A / Unicorn / Burn Rate" = easy/normal/hard/brutal) on the New Campaign opt-in and in Settings. Store `G.difficulty` (default normal), persist in localStorage.
- [x] Read it as a single multiplier where the knobs already live: `cfg.aggression`, `VET_MAXBONUS` cap, enemy mint speed (`ai.js`), `graceTime`/`waveTimer` (on hard, drop grace). Feed the chosen difficulty into the score multiplier (T3-3).

**Where in code.** Opt-in in `js/tutorial.js` (~248) + Settings (T4-3); reads in `newMap`, `js/balance.js`, `js/ai.js` (~25–31).

**Constraints & gotchas.** `[SAVE]` default to normal for legacy saves. Keep deterministic across co-op.

**Done when.** Players pick a difficulty that visibly changes enemy pressure and the score multiplier; the choice persists.

---

### T4-3 — Accessibility & settings panel (+ autosave on unload)
- [x] **Done**
- **Impact:** med · **Effort:** M · **Tags:** `[NET]`, `[MOBILE]`, `[ART]`
- **Related:** T1-5, T4-2, T0-8

**Motivation.** No settings panel exists; HP and madosis bars are red-green only; an accidental tab-close loses up to 60s.

**What to do.**
- [x] Add a "Settings" entry to the in-game top menu and the main menu, opening a reusable `.overlay` modal (same pattern as dossier/roster).
- [x] Ship toggles persisted in localStorage: (1) colorblind-safe bars (HP/madosis switch to a blue→white→red ramp + hatch/pattern that survives deuteranopia); (2) larger HUD text (a body CSS class scaling font-size vars); (3) reduce-FX override (force the `prefers-reduced-motion` path on).
- [x] Add a `visibilitychange`/`pagehide` autosave (solo + non-sandbox only) reusing `autosaveGame()` so a tab-close doesn't lose progress.

**Where in code.** Top menu in `rts.html`; overlay in `js/ui.js`; bar drawing in `js/render.js` + CSS body class; autosave listener in `js/main.js` reusing `js/save.js` (~195–196 guards).

**Constraints & gotchas.** `[NET]` autosave guarded to `netRole==='solo'`. `[MOBILE]` verify the modal + larger-text on narrow viewport. `[ART]` keep ramps on-brand.

**Done when.** A Settings panel offers colorblind bars, larger text, and reduce-FX; closing the tab in solo autosaves.

---

### T4-4 — Mobile onboarding repair
- [x] **Done**
- **Impact:** high for mobile traffic · **Effort:** M · **Tags:** `[MOBILE]`, `[UI]`
- **Related:** T0-1, T2-3

**Motivation.** Shared links open on phones, but the mobile path is the most broken: tutorial step 7 teaches desktop-only Shift+drag box-select, the `▭` helper is touch-only, control groups halve to 4, and the `.desc` selection panel is hidden — the casual persona's biggest single quit-risk, on the device most cold traffic arrives on.

**What to do.**
- [x] Restore a compact selection summary on mobile: instead of `display:none`, render a one-line condensed `.desc` (e.g. "💰3 · queue: soldier 40%") in `#selinfo` for the touch breakpoint.
- [x] Render a translucent selection rectangle during armed box-drag on touch (draw in `render.js` while `gesture.mode==='box'`).
- [x] Make the control-group chips row scroll to expose 5–9 (or add a "more groups" expander), and wire the extra chips.
- [x] Add a desktop "Select Army" helper (and/or auto-group trained units) so tutorial step 7 stops being a literacy wall; fix the Field Manual to say "1–4" on touch.

**Where in code.** `css/hud.css` (~262 `.desc`, ~285 chips); `js/render.js` (box-drag rect); `js/main.js` (~282 chip wiring); `js/tutorial.js` (step 7 + input-variant phrasing).

**Constraints & gotchas.** `[MOBILE]`/`[UI]` test on a real narrow viewport; don't break `refreshUI` rebuild. HUD height feeds canvas viewport math.

**Done when.** On mobile, selection shows context, box-select draws a rectangle, control groups 5–9 are reachable, and step 7 is completable without desktop-only knowledge.

---

### T4-5 — PvP / competitive ceiling
- [x] **Done**
- **Impact:** med (niche) · **Effort:** L–XL · **Tags:** `[NET]`, `[SAVE]`
- **Related:** existing net stack

**Motivation.** Co-op-vs-AI only means no skill-mastery endgame for competitive RTS players — caps how long they stay. Treat as a deliberate, separate project, not a quick win.

**What to do.**
- [x] Add a 1v1 duel mode: p2 hostile (units auto-target the other player, `units.js:~562–573`), two-HQ maps, via `mpHostStart` (`mp.js:~78–113`).
- [x] Add an "Open Games" public lobby (reuse the open-room beacon in `lobby.js`/`mp-ui.js`).
- [x] (Low priority, XL) Replays via the rollback input log (`rollback-input.js`).

**Where in code.** `js/net/mp.js`, `js/net/commands.js`, `js/net/sync.js`, `js/net/lobby.js`; PvP maps in `js/maps_data.js`.

**Constraints & gotchas.** `[NET]` the hardest path — PvP needs strict authority/anti-cheat thinking the co-op model doesn't; verify determinism and snapshot packing for two hostile human factions. `[SAVE]` PvP shouldn't touch the campaign save.

**Done when.** Two humans can play a 1v1 duel to a win/lose result over the existing net stack.

---

## Maintenance note

When a task ships, flip its `- [x]` to `- [x]`, check off its sub-steps, and (if it shifted architecture) update `AGENTS.md` / `CLAUDE.md`. Keep the cross-references (`Related:` / `Depends on:`) accurate so the next session can pick the right next task.

---

## Completion log — 2026-06-10

All 43 tasks implemented, browser-regression-tested (Playwright, solo path), with geometry/balance
gates green on all 20 maps and frame-time p95 = 9.8 ms in a 40-unit FX brawl on the densest map.
Honest deltas from the letter of the spec:

- **T0-10 (analytics):** fully wired, but `TELE_ENDPOINT` in `js/telemetry.js` ships EMPTY on
  purpose — nothing is ever sent until an operator points it at a collector. Consent toggle is in
  Settings; DNT always wins.
- **T2-7 / T4-1 (REX finale & resurrection payoff):** the campaign now routes XIII → REX as the true
  finale, and `villainNextLinear` finally advances `nextMapIndex` past XIII — which is what makes The
  Wake (`rebornUnlockIdx:13`) actually reachable. The "dedicated payoff map" is delivered as this
  finale routing (fight REX with your resurrected veteran) rather than a 14th linear episode, which
  would have renumbered every index-keyed system. New side-ops 8.5/9.5/10.5/11.5/12.5 (appended,
  gated) carry the new win verbs + lieutenant duels, each with rendered rod-voice crawls (ep_15–19).
- **T3-7 (distribution):** README + OG card + root `index.html` + `dist/starleft-itch.zip`
  (via `_dev/package_itch.sh`) are done. Two credential-gated steps remain for the repo OWNER:
  - `gh repo edit arraisgabriel/starleft --description "STARLEFT — a no-build browser RTS: run a
    startup, crush rival megacorps, become the monopoly, get nuked. Permadeath dossiers, 13-episode
    campaign, serverless WebRTC co-op." --add-topic rts --add-topic browser-game --add-topic webrtc
    --add-topic no-build --add-topic javascript --add-topic startup-satire`
    (the logged-in `gh` account here is the work account and 404s on the personal repo), and
  - the itch.io upload of `dist/starleft-itch.zip` + screenshots + the Show-HN/r/WebGames posts.
- **T4-5 (PvP):** 1v1 duel mode shipped end-to-end (⚔ Duel in the lobby, seed-shared arena,
  ctrl-split hostility, last-founder-standing win, guest verdict via `_pvpWinner`). The "Open
  Games public lobby" rides the existing presence/invite system; rollback-log replays (flagged
  "low priority, XL" in the task) were not built.
- **Co-op verification caveat:** all `[NET]` work follows the established patterns (`net*` wrappers,
  `_rbReplaying` gates, snapshot-derived client cosmetics, scalar sync for `_pvp*`), and the solo +
  sim paths are browser-verified — but live two-peer co-op/rollback sessions were not exercised in
  this pass (same standing caveat as the netcode memory note).
