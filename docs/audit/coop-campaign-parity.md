# Co-op Campaign Parity — Adversarial Audit

**Question:** does a 2-player **co-op campaign** give *both* players the same campaign **experience** that a **single-player** campaign gives?

**Verdict: No.** The **host** gets ≈ full parity with solo. The **client (p2)** gets a *"spectator with a mouse"* experience — it can fight its half of every mission, but it is locked out of nearly the entire between-mission metagame and is mute for most of the moment-to-moment narrative/feedback layer. **Nothing softlocks** — the campaign always *progresses* identically (0 critical gaps) — but the client's *experience* is a fraction of solo's.

> Diagnostic only — **nothing in this doc is implemented.** Findings are adversarially verified against code with file:line evidence.

## Method

Multi-agent workflow (`coop-campaign-parity-audit`, run `wf_33bcb84c-d0b`): 6 auditors enumerated SP-vs-host-vs-client behavior across the campaign phases (mission-start, in-mission, mission-end, hub-facilities, persistence, narrative/meta); every claimed gap of severity ≥ medium was re-checked by an independent adversarial verifier; a completeness critic then hunted for missed cross-cutting issues.

- **136** features enumerated · **98** gap claims · **50 confirmed** · **8 refuted** · **2 unverified** (verifier timeouts).
- By severity: **0 critical · 10 high · 29 medium · ~11 low/cosmetic**.
- By role: **0 host-only · 40 client-only · 10 both**. The host is essentially at parity; the client is the entire problem.

## What IS at parity (verified working — including recent co-op-cutscene work)

The sim itself (both players fight, with synced units/combat/fog/quest-progress); the **opening crawl display**, the **Ep VII nuke finale**, the **returning-Nino post-flash monologue**, the **normal victory / IPO / "TO BE CONTINUED" screens**, and **P1 veteran carryover** were all checked and **refuted as gaps** — they reach the client (the recent cue-channel / `clientEndScreen` / `coopCampaignWin` work holds up). CAMPAIGN state is serialized to the client via `mphub`/`mpsnap.campaign`.

## The root causes (the real story — 7 structural issues behind the 50 surface gaps)

The individual gaps are symptoms. Fixing these roots collapses most of the list:

1. **`packEnt` strips identity → the client's dossiers are permanently empty.** The snapshot serializes only `e.stars` (visual rank), never `e.lore`/`e.xp`/`e.heroId` (`js/net/sync.js:108-135`); the id-merge then replaces any lore-bearing client entity with a lore-less host copy. So on the client **no unit ever shows a dossier or character name — including the client's own hard-won veterans.** The whole "bond with your soldier" career pillar is invisible to p2.
2. **No `toast`/`eventToast` relay → the client's narrative/feedback layer is mute.** The cue channel (`NET.playCue`, `js/net/mp.js`) mirrors only `mapcut`/`flash`/`finale`; every `toast`/`eventToast` beat fires inside `update()` (host/solo only) and is never cued: promotions, OBJECTIVE COMPLETE/BONUS, madosis onset, dream-fulfilled, holdout TRANSFER/boss prompts, "LATTICE ONLINE", achievements. **This single missing relay is the dominant reason p2 feels like a spectator.**
3. **The H.U.B. is structurally p1-only.** `hubCanAct()` = `solo || LOCAL_CTRL==='p1'` (`js/hub.js:163`) gates ~19 facility actions, and `buildHubCommands` early-returns for a non-host (`js/ui.js:510-515`) so the client never even sees the facility buttons. The client cannot walk a unit to a POI, open any facility (M.D.C./Training/Mental Health/The Wake/Implant Clinic/ULTRA/Condos/Off-Hours), spend the shared `CAMPAIGN.m3`, enlist/stage units, or launch the next mission. **The entire between-mission metagame is host-only.**
4. **No pacing agency or readiness handshake.** On every win the client is parked on a "Waiting for the host to choose the next move" card, then enters a hub it cannot operate, then is teleported into the next mission's unskippable crawl. Across a 3+-mission loop the client experiences the whole metagame as a non-interactive observer with no briefing, no ready-up, and no sense of how long it will wait.
5. **Asymmetric disconnect survival.** A **host drop is terminal for the client's campaign** — saving is host-authoritative and only the host can `mpHostStartFromSave` (`js/net/mp.js:573`), so the client can never re-host the shared save it co-built. An **ally drop**, by contrast, lets the host adopt p2's units and continue solo-co-op. The campaign survives a client drop but dies on a host drop.
6. **The interactive extraction/garrison decision is skipped for BOTH roles.** `beginExtractionPhase` bails for non-solo (`js/hub.js:245`), so neither player ever gets the "garrison your Lv2+ survivors, who do I leave behind?" beat or the Buzzword-Bomber approach cinematic. This is a host gap too, not just a client gap.
7. **Named heroes are always p1.** `spawnHeroes` runs before the p2 base exists and tags every hero `ctrl='p1'` (`js/map.js:559`); there is no p2-hero path. The client can never own, select, command, or trigger an ability of Nino/Biba.

## Confirmed gaps — HIGH (10)

| # | Feature | Who | Root |
|---|---------|-----|------|
| 1 | Level-up **life-event** gold box + lore VOICE + ★promotion/📖 toasts + hero-mentor bark | client | #2,#1 |
| 2 | **Walk a veteran to a POI** (`hubCommandPoi`) | client | #3 |
| 3 | **Facility command buttons** (M.D.C./ULTRA/Training/Mental Health/Wake/Condo/Clinic/Off-Hours/Style/Academy) | client | #3 |
| 4 | **M.D.C. enlist / stage** units for dispatch (choose who deploys) | client | #3 |
| 5 | **Off-Hours scenes** (bar/club/diner relationship beats) | client | #3,#1 |
| 6 | **M3$ spending** (shared treasury `hubSpend`) | client | #3 |
| 7 | **Named heroes** (Nino/Biba) — client can never own one | client | #7 |
| 8 | **H.U.B. agency / progression spending** (umbrella: condos, Style/Academy, ULTRA/Series∞, Training, Mental Health, The Wake, Clinic, dispatch) | client | #3 |
| 9 | Career **life-event eventToast** (📖) on every level-up | client | #2 |
| 10 | **Achievements** (per-device localStorage; client unlocks a different set, misses host-only fires) | client | #2 |

## Confirmed gaps — MEDIUM (29, grouped)

- **Narrative/feedback the client misses (root #2/#1):** opening-crawl *templated vars*, reach-cutscene, holdout per-phase flavor toasts, holdout first-arrival reveal cutscene, mid-mission `ev.objective` text swap, obituary toast, dream-fulfilled climax, in-world life-event bubble + `VOICE.playLore`, run-summary (`victorySummaryHTML`), per-run HUB stats/valuation.
- **Hub facilities the client can't use (root #3):** Training Grounds, Mental Health Facility, The Wake (reborn), Implant Clinic/cyberware, Condos, Off-Hours bonds, vet-carryover chooser.
- **Mission-end set-pieces missing for BOTH:** fallen-veteran memorial interstitial, EX-TERMINATOR death cutscene ("I'll be back") + flee/airlift cinematic, the interactive extraction/garrison phase (root #6), NG+/IPO endgame nuances, p2 extraction *choice*.
- **Persistence:** p2 (ally) veteran carryover works at the dispatch loop but the client can't *read* its own vets' dossiers (root #1), and the carryover intent isn't persisted across a mid-battlefield save/resume.
- **Memorial:** the live "The Fallen" wall is host-only — the client's `fallenVets` is empty mid-session (no obituaries/scenes for comrades it watched die) until a resume.
- **Tutorial (both):** Quarter-I guided coaching + Rod narrator is solo-gated, so neither co-op player gets onboarding.

## Confirmed gaps — LOW (~10)

Intro cutscene, "next deployment" briefing card, boss taunts, defeat/restart client handling, M.D.C. release, dispatch/launch visibility, resident Style/Academy, in-mission story toasts, hub-entry narrative beats (perfect-extraction duet, "LATTICE ONLINE"), Founder's Ledger, the read-only `clientEndScreen` (cosmetic). Plus a latent landmine: the dead `mpAdvanceCampaign` path would wipe p2 carryover if ever wired up.

## Unverified (2 — verifier agents timed out, not assessed)

- **Madosis RESCUE** (memory-echo pickup / one-at-a-time relief) — likely client-degraded (madosis runs in `update()`), needs a manual check.
- **Mid-mission scripted beats** (`cfg.events`/`runMapEvent` spawns & effects) — sim-side effects sync via snapshot, but the `toast`/`objective` payloads do not (see medium gaps).

## Recommendations (prioritized — fixing roots, not symptoms)

1. **Add a generic `toast`/`eventToast` relay over the cue channel** (root #2). One mechanism mirrors promotions, objectives, madosis, dream beats, holdout prompts, and achievements to the client — the single highest-leverage fix for "p2 feels like a spectator."
2. **Carry `lore`/`xp`/`heroId` in `packEnt`** (or hydrate client roster entities from the synced `CAMPAIGN.roster` by a stable key) so the client's dossiers — *especially its own veterans'* — are populated (root #1). Unlocks the entire career/dossier pillar for p2.
3. **Decide the H.U.B. product stance** (root #3). Either (a) keep host-authority but give the client a *read-only hub* (browse roster/dossiers/upgrades/ULTRA odds, read Off-Hours scene text the host triggers) + a **ready-up/pacing handshake** so it isn't a blank wait; or (b) grant real p2 agency by routing hub intents (enlist/heal/clinic/off-hours for p2's *own* units) through the existing host-authoritative `net*`/`mpcmd` replay layer.
4. **Make a host drop survivable** (root #5): let the client's mirrored save be re-hostable, so a crash doesn't end the co-founders' campaign.
5. **Lower-effort wins:** mirror the fallen-wall/obituaries to the client; sync `G.objective` text; un-gate the tutorial for co-op; give p2 build/train rejection feedback.

---
*Generated by the `coop-campaign-parity-audit` workflow (65 agents, ~4.2M tokens). Raw findings: the run's task output. This is design analysis — no code was changed.*
