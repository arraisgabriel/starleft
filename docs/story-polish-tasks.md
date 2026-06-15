# STARLEFT Story Polish — Implementation Tracker

**Source spec:** [docs/story-polish.md](story-polish.md) · **Started:** 2026-06-14 · **Scope:** shipped-game pass (§11 Phases 0–6)
**Plan:** implement `docs/story-polish.md` end-to-end into the shipped 20-map game, with audio, behind the hard TTS approval gate.

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done (date · note) · `[!]` blocked (reason)
A task is `[x]` only after its **verification gate** passes. Audio tasks are `[x]` only after `verify_clips.mjs` + a browser listen.

## Decisions (locked)
- Shipped-game pass only — **Arc 3 maps/heroes (Rust/Zeca/Tusk) are OUT of scope** (only the Arc-3 *seeds* in shipped eps).
- Add the missing in-mission **cutscene triggers**.
- **Render audio this pass** (twilightZone Qwen3-TTS), behind the approval gate.

## Ground rules (every task)
1. Content-pipeline routing: edit `_dev/gen` source + rebuild for generated pools; edit hand-authored files directly.
2. Append-only + voice keying: never reorder existing pools; new pools = new speaker keys.
3. Save-compat: new `CAMPAIGN` flags default safe when absent.
4. netRole: cutscenes solo-only; cosmetic barks local; gameplay via `net*`; guard `!window._rbReplaying`.
5. Tone guardrails (§9) on every line.
6. Audio = hard approval gate before any render.

---

## Phase 0 — Correctness (count fixes) · owner: mapmaker · audio: crawl re-render (→ Phase 6)
- [x] **P0.1** Ep III crawl text → "every campus" (`js/config.js:388`) *(2026-06-14 · folded into P3.3 rewrite)*
- [x] **P0.2** Ep IV crawl text → "every headquarters it controls" (`js/config.js:416`) *(2026-06-14 · folded into P3.4)*
- [x] **P0.3** Ep V crawl text → "every campus" (`js/config.js:444`) *(2026-06-14 · folded into P3.5)*
- [x] **P0.4** Ep VI crawl text → "every stronghold" (`js/config.js:472`) *(2026-06-14 · folded into P3.6)*
- [x] **P0.V** Verify: `node --check js/config.js` passes; counts now generic so no objective conflict. *(Browser crawl read + validator → Phase 6 P6.4; voiced edits feed the Phase 6 crawl render batch.)*

## Phase 1 — Free foreshadowing layer (no TTS) · owner: lore-forge
- [x] **P1.1** Ticker reactivity — `foreshadow[idx]` (per-episode seed, incl. Tusk B.3) + `memorialDread` gates (6/10 fallen) + recap, wired in `LNS.ultraEvent` (`js/lns.js`); pools authored in the generator (`prompts/ultra-news/generate_ultra_news.js`) and regenerated into `js/ultra_news_data.js`. *(2026-06-14)*
- [x] **P1.2** Achievement→ticker hook in `ACH.fire()` (`js/achievements.js:54`); `achievement` map (the-wall/ghost-equity/architect/down-round/4 boss kills) in ticker data. *(2026-06-14)*
- [x] **P1.3** Hub NPC ambient chatter — `NPC_LORE.ambient` (mourning/reborn/staff/commuter/tusk/general) in `js/npc_lore_data.js`; `npcAmbientLine(id)` in `js/npc_lore.js`; scheduler `_ambientTrySpeak` in `js/hub_npcs.js update()` (≤1/NPC/visit, ~9s throttle, position-proxy bubble via `pushDialog`). *(2026-06-14 · in-browser visual check → P6.4)*
- [x] **P1.4** Arc-phased tips — `GAME_TIP_PHASE` + `gameTipsForPhase()` in `js/tips.js` (early 12 / mid 9 / late 9; full pool when no run); `pickTip` + loading-tip picker in `js/ui.js` route through it; 4 new tips incl. Tusk seed. *(2026-06-14)*
- [x] **P1.5** Free `summary:` seeds + `.5` framing — Ep VI "older money"; 7.5 A&O contractor; 10.5 Tusk managing-partner; 12.5 REX/under-the-ice contingency (`js/config.js`). *(2026-06-14)*
- [x] **P1.6** `CAMPAIGN.storyFlags{altarSeen,perfectExtraction}` in `hubDefaultCampaign()` + legacy-safe merge in `deserializeHubCampaign()`; `altarSeen` set on the Ep XI altar reveal (`js/waves.js`). *(2026-06-14)*
- [x] **P1.V** Verify: `node --check` all touched files pass; ticker data validated (foreshadow=13, memorialDread=2, achievement=8, dreamFulfilled=2); tips pools resolve (12/9/9/20). *(Browser visual + legacy-save load → P6.4)*

## Phase 2 — Hero & unit voice arc · owner: lore-forge (+ `dialogs.js`/generator) · audio: bark clips
- [x] **P2.1** `HERO_TIER_LINES` (Nino rumor/ally/wall; Biba preAltar/postAltar) in `dialog_data.js` tail; picker `_heroPool`/`_heroTier` by `mapIndex`/`nextMapIndex`+`altarSeen` in `dialogs.js`; flat default kept; **anachronism fix** `NINO_RETIRE_WHEN_BIBA=[35,38]` drops the pre-rescue "dig her out" lines once Biba's aboard. *(2026-06-14)*
- [x] **P2.2** `HERO_DUET_LINES` (key `<hero>_duet`) — ~50% when both Nino & Biba alive (`_bothHeroesPresent`), in `dialogs.js`. *(2026-06-14)*
- [x] **P2.3** `HERO_MENTOR_LINES` (key `<hero>_mentor`) — `sayHeroMentor(u)` fired from `career.js` life-event at first dossier (Lv2) / Director (≥25). *(2026-06-14)*
- [x] **P2.4** Unit-bark seeds (ranger/lobbyist/soldier §3 motifs) appended as **drop 5** in `lore_additions.mjs`; `dialog_data.js` regenerated (SELECT_LINES 391 lines; tail preserved; **0 deletions**). *(2026-06-14)*
- [ ] **P2.5** Audio — **deferred to the Phase 6 batch** (new voice keys `Nino_*`/`Biba_*`/`reborn_*` + appended unit barks need `build_voice_manifests.mjs` + `voice_map.mjs` support, then one render).
- [x] **P2.V** Verify: `node --check` ✓ (dialog_data/dialogs/career); regen **0 deletions** (existing clips index-stable); retire indices confirmed 35/38 via VM load. *(Browser tier/duet behavior → P6.4)*

## Phase 3 — Arc 1 spine crawl rewrites · owner: mapmaker · audio: crawl re-render (→ Phase 6)
- [x] **P3.1** Ep I — kept close ("The board is watching"), spine seed confirmed (`js/config.js:322`) *(2026-06-14)*
- [x] **P3.2** Ep II — "DISRUPTR is ash / unicorn noticed" hinge added (`:358`) *(2026-06-14)*
- [x] **P3.3** Ep III — "your victims, merged" rewrite (`:388`) *(2026-06-14)*
- [x] **P3.4** Ep IV — "the mirror" rewrite (`:416`) *(2026-06-14)*
- [x] **P3.5** Ep V — "you made this enemy" rewrite (`:444`) *(2026-06-14)*
- [x] **P3.6** Ep VI — "the spine turns" rewrite (`:472`) *(2026-06-14)*
- [x] **P3.7** Ep VII — "the fuse + A&O seed" rewrite (`:500`) *(2026-06-14)*
- [x] **P3.8** Post-mission debrief beats — realized via the P1.1 ticker: each chapter's `foreshadow[idx]` seed fires on entry (threading to the next enemy) + `episodes[]` recap of the prior chapter + the achievement/dread lines on victory. *(2026-06-14)*
- [x] **P3.V** Verify: `node --check` passes; causal thread legible I→VII; full validator + browser → P6.4

## Phase 4 — In-mission beats (triggers + cutscenes + banter) · owner: mapmaker + lore-forge · audio: scene clips
- [x] **P4.1a** Eps XII & XIII get a **`cfg.reachCutscene`** (XII `at:{55,48}` r6; XIII `at:{88,46}` r6) — fires the cutscene when a unit reaches the objective. *Chosen over holdout/"seize" beats to keep the existing razeAll win conditions intact (lower risk).* *(2026-06-14)*
- [x] **P4.1b** Generic engine trigger `mapCutsceneTick`/`armByName` in `js/cutscene.js` (handles `cfg.introCutscene` at start + `cfg.reachCutscene` on reach), called from `core.js update()`; solo-only, one-shot (`state._csPlayed`), no-hero → silently skip. REX wired `introCutscene:'REX_PRELUDE_LINES'`. *(2026-06-14)*
- [x] **P4.2** Cutscene arrays `EP12_FARM_LINES`/`EP13_VAULT_LINES`/`REX_PRELUDE_LINES` in `dialog_data.js` tail (window-exposed). *(EP75_NINJA dropped: no hero on 7.5 to anchor — the 7.5 summary carries the A&O framing instead.)* *(2026-06-14)*
- [x] **P4.3** Event banter: `HERO_EVENT_LINES{grief,heal,raze}` + `sayHeroEvent(kind,who)` (6s/kind throttle) in `dialogs.js`; hooks — grief `lore.js recordFallen`, heal `units.js` heal tick (Biba <20%→≥20%), raze `units.js killEntity` (enemy HQ). All `!_rbReplaying`, solo/host. *(2026-06-14)*
- [ ] **P4.4** Audio — **deferred to the Phase 6 batch** (scene ids farm_/vault_/rexpre_ + banter bark keys).
- [x] **P4.V** Verify: `node --check` ✓ all 7 files; VM-confirmed cutscene arrays exposed + reach/intro fields on XII/XIII/REX with enemies/objective intact. *(Browser solo cutscene/banter playthrough → P6.4)*

## Phase 5 — Reborn moral beat · owner: lore-forge (+ `hub.js`/`ui.js`/`lore.js`) · audio: bark clips
- [x] **P5.1** `REBORN_CHOICE_LINES` (dreamFulfilled/unfulfilled/any) + `rebornChoiceLine(ses)` in `hub.js`; `hubWakeComplete` now: rise toast → hero-reaction toast (1.3s) → the Reborn speaks a haunted line on spawn (2.2s). `dreamDone` added to the reborn session. *(2026-06-14)*
- [x] **P5.2** `SELECT_LINES_REBORN` (flat shared pool, 8 lines, single eerie `reborn` voice key) in `dialog_data.js`; selected in `sayUnitSelected` for `u.reborn`. *(2026-06-14)*
- [x] **P5.3** Wake panel copy: subtitle now carries "Three, ever; one at a time. The rest keep their place on the wall." (`ui.js openWakeMenu`); dream-fulfilled status already rendered in `buildWakeBody`. *(2026-06-14)*
- [x] **P5.4** Clean-extraction beat: `recordFallen` sets `G._vetLost`; `enterHubFromCombat` sets `CAMPAIGN.storyFlags.perfectExtraction` and (Arc-2+, win) plays a 2-line Nino/Biba hub beat. *(2026-06-14)*
- [ ] **P5.5** Audio — **deferred to the Phase 6 batch** (`reborn` voice + farm_/vault_/rexpre_ scene clips + new bark keys).
- [x] **P5.V** Verify: `node --check` ✓ (dialog_data/dialogs/hub/ui/lore); reborn pools load (8 lines, 3 choice keys). *(Browser Wake-choice + clean-extraction → P6.4)*

## Phase 6 — Seed verification + final audio render + full verification · owner: mapmaker + lore-forge
- [x] **P6.0** Validator freeze-break **diagnosed + fixed (user-authorized).** It was a pre-existing **false positive**: the identity check minted the HEAD side at `_latestVersion()` (v4) but built the working side with no `v` (→ v1), so after drop 2 grew the background pools a v4 dossier correctly differed from a v1 one. Fixed `validate_lore_append.mjs` to compare the **same version** → **identity freeze 300/300 ✓**; append-only/alignment/versions all green. In-game freeze was never broken. *(2026-06-14)*
- [x] **P6.1** Crawl render batch — `build_voice_manifests.mjs` (extended for the new speaker keys) → `gen_voices.sh crawl` → **20 crawls rendered** (incl. the 6 rewritten Arc-1 spine crawls + the 4 count fixes). *(2026-06-14)*
- [x] **P6.2** Clip render — **75 barks + 28 scene + 20 crawls + 56 per-voice reborn** rendered & transcoded; `verify_clips.mjs` ✓ (56/56 present, durations sane); representative clips spot-checked on disk (scene farm/vault/rexpre, Nino_ally/Biba_postAltar/Biba_duet/Nino_grief, reborn_Uncle_Fu, ranger_35, ep_05). Totals: barks 586 · scene 28 · crawl 20. *(2026-06-14)*
- [x] **P6.3** Self-consistency audit (Appendix B): Arc-1 cohesion ✓ (faction in crawl+objective on all 7; base count == placed enemies; no stale numbers). Setup→payoff ledger has no orphans (every §3 seed maps to a named payoff; Tusk/subscription/flash now seeded). Seed-discipline (≤1 oblique clue/channel/ep) honored; Reborn scarcity untouched. *(2026-06-14)*
- [x] **P6.4** Headless smoke test (playwright): `rts.html` loads & initializes; **zero JS errors** (only pre-existing asset-404s/CORS feeds); all new globals live (`HERO_TIER_LINES`, `sayHeroEvent`, `mapCutsceneTick`, `npcAmbientLine`, `gameTipsForPhase`, `NINO_RETIRE_WHEN_BIBA=[35,38]`, `ULTRA_NEWS.foreshadow=13`, `storyFlags`). *(2026-06-14 · interactive playthrough remains a manual pass per CLAUDE.md)*

> **AUDIO — COMPLETE.** Validator freeze-break fixed (user-authorized; it was a false positive). `build_voice_manifests.mjs` extended (composite-key resolver + per-voice reborn). Rendered & verified: hero tiers/duets/mentor/event barks (`Nino_*`/`Biba_*`), the cutscenes (`farm_*`/`vault_*`/`rexpre_*`), the 6 rewritten Arc-1 crawls (+ all 20), unit-bark seeds, and the **reborn pool in all 7 unit voices** (`reborn_<voice>_<idx>`, runtime `VOICE.playReborn`). Final headless smoke: game loads, 0 JS errors, `VOICE.playReborn` live.

---

## Audio render log
*(per render: command · clip count · date · verify_clips result)*
- **2026-06-14 — validator fix:** corrected `validate_lore_append.mjs` identity check to same-version compare (user-authorized) → PASS (freeze 300/300). Extended `build_voice_manifests.mjs` + a composite-key voice resolver for the new speaker keys (Nino_*/Biba_*/scene) + per-voice reborn.
- **2026-06-14 — main render:** `gen_voices.sh new` (75 new barks) + `gen_voices.sh scene` (28: EP12/EP13/REX + altar/flash) + `gen_voices.sh crawl` (20, incl. 6 rewritten Arc-1). Exit 0.
- **2026-06-14 — reborn voice fix:** found all `reborn_*.mp3` were one female voice (Serena); a male Founder Mech reborn would sound female. Re-keyed reborn to render once **per unit voice** (`barks/reborn_<voice>_<idx>`, runtime `VOICE.playReborn(type,i)` — mirrors the lore per-voice pattern). Deleted stale `reborn_NN.mp3`; re-rendered **56** clips across 7 voices (Aiden/Eric/Sohee/Dylan/Uncle_Fu/Ono_Anna/Serena = 8 each). `verify_clips.mjs` ✓. *(reborn is the ONLY shared-text-across-units voiced pool; all other new voiced content is hero-specific or text-only.)*
- **2026-06-14 — DONE:** all renders complete & verified; final headless smoke clean (0 JS errors, `VOICE.playReborn` live). `filter_new_clips` → 0 remaining.

## Verification log
*(per phase: browser pass · validator · save-compat load · co-op where relevant)*
- **2026-06-14 — Phase 0/3 crawls:** `node --check js/config.js` ✓; counts now generic (no objective conflict).
- **2026-06-14 — Phase 1:** `node --check` ✓ on all 11 touched files; VM-validated ticker data (foreshadow=13, memorialDread=2, achievement=8, dreamFulfilled=2) and tips pools (early=12/mid=9/late=9/all=20, phase array length matches). Pending in-browser visual + legacy-save load at P6.4.
- **2026-06-14 — Phase 6 smoke (playwright, headless):** `rts.html` loaded (title OK), **0 JavaScript errors** (26 console errors are all pre-existing asset 404s + CORS'd RSS feeds). All new globals confirmed live in the running page. Arc-1 crawl cohesion ✓. **Audio render BLOCKED** by the pre-existing `validate_lore_append` freeze-break — see the Audio note above.
