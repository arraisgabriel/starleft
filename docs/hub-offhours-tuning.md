# THE OFF-HOURS — tuning spec

> Canonical source for every Off-Hours number. The constants live in [js/offhours_data.js](../js/offhours_data.js) (`OFFHOURS.tune`); this doc explains and **cites** each one to the game it's drawn from. Re-tune here first, then mirror into `OFFHOURS.tune`. All values are *starting points* — deliberately conservative, "attachment over power" (design §2.1).

## Bond progression
| Knob | `tune` key | Value | Rationale / source |
|---|---|---|---|
| Tiers | `maxTier` | 5 tiers (0–4) | Hades affinity hearts / Stardew 10-heart bands compressed to 5 named ranks (design §5.4). |
| Tier thresholds (cumulative points to **reach** tier *i*) | `tierPts` | `[0, 100, 250, 450, 700]` | Stardew uses 250 pts/heart; we scale to the HUB-**visit** cadence (a few interactions per visit, not daily), so thresholds rise super-linearly like Persona ranks. |
| Scene choice points | `scenePts` | base **30**, ×{1,2,3} by approach weight | Persona Confidant "notes": an interaction grants base×{1,2,3}; a strong, on-character line is worth triple ([Persona]). |
| Approach weights | `approachBias` table feeds both points and the check | warm 1, probing 2, blunt 1 (points); check bias +0.10 / 0 / −0.12 | warm reliably lands; probing risks more for more; blunt is high-variance (Disco Elysium tone). |
| Misfire | — | **0 points, never negative** | Disco Elysium / Citizen Sleeper "failure is content," never punishment (design §6.2). |
| Gift | `giftPts` | **+60**, opens tier 0→1, returns a keepsake | Hades: the *first* Nectar opens the relationship and hands back a Keepsake ([Hades]). |
| Ambient / caught tick | `ambientPts` / `helloPts` | **+8** (free) / **+4** | Persona free day-off invites give bonus contact without spending a slot; these cost **no** downtime budget. |
| Locked tier | `lockedTier` | **3** | Hades "locked heart": affinity caps at a mid tier until you complete a **Favor/quest**. Here, the `crime`-confession (bar) / reconciliation (diner) scene is the favor that sets `fl&4` (arc-unlocked) and lets the bond pass to tier 4 ([Hades]). |

## The light check (Disco Elysium / Citizen Sleeper)
`p(land) = clamp(checkBase + checkPerTier·tier + approachBias, checkMin, checkMax)`
= `clamp(0.45 + 0.13·tier + bias, 0.20, 0.95)`, seeded deterministically by `(bondId, sceneId, choiceIdx, CAMPAIGN.visit)` via `makeRng`. Disco Elysium rolls 2d6 + skill vs difficulty; we fold "skill" into bond tier so trust makes lines land. A miss routes to the scene's `miss` branch (different, often more revealing reply).

## Compatibility (vet↔vet) — RimWorld / Wildermyth
Deterministic score `C ∈ [−1, 1]` from the two dossiers (`tune.compat`):
`+0.30` shared hometown · `+0.25` complementary dream themes · `−0.30` clashing trauma · `−0.35` one carries a `crime` the other's nature judges · `±` small unit-type archetype friction.
- `C > 0.33` (`friendT`) → trends **friend** (→ romance if sustained + eligible, opt-in).
- `C < −0.20` (`rivalT`) → trends **rival**.
RimWorld biases random social outcomes by compatibility; we make it deterministic (netRole-safe) the Wildermyth way (over procedural characters via dossier slots).

## Vet↔vet bond ladder (XCOM 2: WotC)
Cohesion accrues from Off-Hours nights **and** co-deployments. XCOM resets cohesion and raises the bar each level (10 → +15 → +20); `tune.cohesion = {l1:10, l2:15, l3:20}` (per-level increments). Per-level **opt-in** synergy when the pair is deployed together — tiny, scaled to STARLEFT's envelope: L1 a small shared-morale aura, L2 a minor adjacency edge, L3 a modest combo. Rivalry pairs get a symmetric competitive variant. A bonded partner's death deepens the existing grief beats (no stat effect).

## Economy & scarcity (Persona calendar / Citizen Sleeper dice)
| Knob | `tune` key | Value | Source |
|---|---|---|---|
| Downtime budget | `nightsPerVisit` / `nightsCap` | **3** nights/visit, +1 per ULTRA tier, cap **5** | Persona's scarce calendar; deep scenes spend a night, ambient/caught are free. |
| Scene cost | `sceneCost` | **40** M3$ | a round/the meal — a HUB economy sink via `hubSpend` (js/hub.js:1408). |
| Gift cost | `giftCost` | **120** M3$ | luxury item; a meaningful but not blocking spend. |

## Downside (CK3)
`strainMax` = **6**: directing a vet *against their nature* adds a tiny, capped amount to true `u.madosis` (well below the breakdown threshold) — CK3's "acting against your traits costs you," kept soft so it never decides a run.

## Append-only / version-gating
`OFFHOURS.events` / `OFFHOURS.say` / `OFFHOURS.scenes` / `OFFHOURS.gossip` / `OFFHOURS.gifts` grow **only by appending**; `OFFHOURS.versions[]` freezes a bond's pool shape at mint (mirrors `LORE_DATA.versions` / `_poolLens`, js/lore.js:30-35). `OFFHOURS.say` is index-aligned to scene/event lines so voice clips (a future, separately-gated lore-forge pass) stay index-keyed. Reordering is forbidden.

### Sources
- Stardew Valley friendship/heart math — https://gamerant.com/stardew-valley-friendship-point-system-guide/
- Persona 5 Confidant points/notes — https://megamitensei.fandom.com/wiki/Confidant
- Hades affinity / Nectar / locked-heart favor — https://hades.fandom.com/wiki/Nectar
- XCOM 2: WotC soldier bond cohesion ladder — https://xcom.fandom.com/wiki/Bonding
- RimWorld social/compatibility — https://rimworldwiki.com/wiki/Social
