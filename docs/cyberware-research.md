# STARLEFT Cyberware — Research & Design (Cyberpunk 2077 → STARLEFT)

> **Status:** Research + design proposal (no code shipped). · **Date:** 2026-06-18 · **Branch context:** authored alongside `feat/offhours-hub`.
> **Canonical CP2077 basis:** Update **2.0 / 2.1 / 2.2** (Phantom Liberty era). · **Recommended adaptation:** the **Medium** fidelity tier (§II.7).
> **Reference image:** `refs/cb_2007_ripperdoc_menu.webp` (CP2077 ripperdoc panel — see Part III).
> **Related docs:** `docs/world-bible.md`, `docs/hub-offhours-tuning.md`, `AGENTS.md`, `CLAUDE.md`.

## Purpose & scope

Three jobs, in one file:

1. **Research (Part I).** A detailed, sourced description of how Cyberpunk 2077's cyberware/implant system actually works in the current (2.0+) game — the slots, the Capacity budget, quality tiers, what gates access, the economy, the cyberpsychosis theme, and a reusable taxonomy of *what implants do*. Every quantitative claim is patch-tagged and cross-checked; where sources disagree the language is hedged. Methodology and the full source list are in Appendix D.
2. **Design (Part II).** A concrete proposal for connecting a comparable system into STARLEFT, mapped onto mechanisms the game **already has** — the M3rit$ economy, the per-unit upgrade ledger, the career-level system, and (the keystone) the **madosis sanity system**, which is an almost exact mechanical analogue of cyberpsychosis. Appendices A–B give an implementation-ready draft catalog and tuning numbers.
3. **The Ripperdoc panel (Part III).** A UI spec for the install screen itself — a dark-cyberpunk HUD that mirrors Cyberpunk 2077's ripperdoc screen, but with the selected unit's **live idle sprite** as the centerpiece instead of a generic body. Layout, the complete UX, and the reference-fidelity mapping.

This is a planning artifact. **No game code is changed by this document.** It exists to make the build decision well-informed; the phased roadmap in §II.12 scopes the actual work.

## TL;DR

- CP2077's cyberware (post-2.0) is gated by exactly two things: **character Level** (which tier a ripperdoc stocks) and **Cyberware Capacity** (a per-character point budget every implant spends). Attribute and Street-Cred *requirements were removed* in 2.0; attributes now only *scale* implants ("attunement").
- **Cyberpsychosis is not a player mechanic** in the game — it's narrative. The only mechanical "overload cost" is the *Edgerunner* perk: exceed Capacity by up to +50, pay −0.5% max HP per point.
- STARLEFT already has the load-bearing pieces: **M3rit$** (= eddies), a **per-unit upgrade ledger** keyed by `hubUnitKey`, **career stars** (= Level/tier gating), combat-time **multiplier fields** every effect can land on, and **madosis** (= cyberpsychosis). It even ships a primitive `implantLevel` (0–4, flat +3% HP/dmg).
- **Recommendation:** build the **Medium** tier — ~5 slots (two mutually exclusive, faithful to CP2077's OS/Arms rules), ~8–12 implants whose effects reuse existing fields, a real **Capacity ceiling** from `u.stars`, and an optional **Edgerunner-style overload that pays in madosis** — letting STARLEFT realize the cyberpsychosis fantasy the game itself dropped. It is save-safe by construction and adds no new simulation machinery. A ripperdoc-clinic interior + full slot taxonomy + iconic hero chrome is a clean additive later phase.

---

# Part I — How Cyberpunk 2077's cyberware system works (research)

> **Canonical version:** Cyberpunk 2077 Update **2.0 / 2.1 / 2.2** (the Phantom Liberty-era reworked system). This is treated as the definitive current system. The launch-era **1.x** model is referenced only to explain lineage. Quantitative claims are tagged with the patch they apply to, e.g. `[2.0]`. Where a value changed across versions, the change is noted. Where the underlying sources disagree or could not be pinned down, the language is hedged ("sources vary"; "approximately") rather than asserting a precise number.

---

## 1. System overview — chrome as the power axis & the ripperdoc loop

In *Cyberpunk 2077*, **cyberware ("chrome") is the primary character-power axis.** After Update 2.0 it carries nearly all of V's combat identity, armor, and special abilities — clothing became purely cosmetic, with armor now coming almost entirely from cyberware (Skeleton + Integumentary). `[2.0]` Your build is defined less by what gun you carry and more by which implants you can fit.

The **ripperdoc loop** is the central economic gameplay cycle:

1. **Earn eddies** (eurodollars, written **e$**) from gigs, NCPD events, and selling loot.
2. **Visit any ripperdoc** — in-fiction back-alley implant surgeons. After 2.0 the catalog is unified, so *which* clinic you visit no longer matters in the base game (Dogtown is the exception).
3. **Buy** an implant your **character Level** (which gates the tier sold) and **Cyberware Capacity** (a point budget) allow, paying eddies; it installs on the ripperdoc screen.
4. As you out-level a piece, **feed crafting components** to **upgrade it up the tier ladder** (Tier 1 → 5 → 5+ → 5++), which is generally cheaper than re-buying.
5. At each new 10-level breakpoint, the next tier becomes purchasable, and the cycle repeats.

The load-bearing constraint is **Cyberware Capacity, not slots or Street Cred.** `[2.0]`

**The single most important structural fact for the definitive system:** installing cyberware has **no attribute requirement and no Street Cred requirement.** What you can install is bounded by only two things — your **Level** (gates the tier a ripperdoc stocks) and your **Cyberware Capacity** (a per-character point budget every implant draws down). Attributes still matter, but as a *scaling* lever ("attunement"), not a gate. `[2.0+]`

A crucial **mechanic-vs-lore** caveat threads through the whole system: the franchise's famous **cyberpsychosis** ("too much chrome strips your soul") is in *Cyberpunk 2077* **almost entirely a narrative/world-building theme, not a player-facing mechanic.** The dread is authored; the math is just a budget (see §7).

---

## 2. Body-system slots

Update 2.0 kept the launch-era body-area slots but **re-cast them as organizational categories** layered under the global Cyberware Capacity budget. There are **eleven body systems**. (A note on counts: some renderings of Fextralife enumerate "10 distinct body systems" by omitting the Immune System; once Immune System — confirmed at 2 slots — is included, the count is eleven.)

| Body system | Slots `[2.0+]` | What goes there | Mutual-exclusion / unlock rule | Example named cyberware |
|---|---|---|---|---|
| **Frontal Cortex** | 3 | Quickhack/RAM and cooldown enhancers (the "brain") | None internal; all 3 can be filled | Memory Boost; RAM Upgrade; Bioconductor; Camillo RAM Manager; Axolotl |
| **Ocular System** (the eyes; some guides label it "Face") | 1 base, **2nd via the Phantom Liberty main quest *Birds with Broken Wings*** | Optics granting zoom + a vision/scanner buff | The 2nd slot is tied to the story **Behavioral Imprint-Synced Faceplate** item — sources lean toward it being story-item-specific, not a free general optics slot | Kiroshi Optics Mk.1/Mk.2/Mk.3; Sensory Amplifier; Kiroshi "Cockatrice" |
| **Circulatory System** | 3 | Health, healing, stamina, adrenaline, low-health damage | None internal | Second Heart; Biomonitor; Blood Pump; Heal-on-Kill; Syn-Lungs; Adrenaline Booster |
| **Immune System** | 2 | Resistance, status/quickhack defense, toxin/EMP mitigation | None internal | Shock-n-Awe; resistance implants (e.g. Detoxifier, Cataresist) |
| **Nervous System** | 3 | Reaction/time-dilation triggers, evasion, stun resist | None internal | Kerenzikov; Reflex Tuner; Visual Cortex Support |
| **Integumentary System** (Skin) | 3 | Armor and defensive/utility skin layers | None internal | Subdermal Armor; Optical Camo; Pain Editor; Heat Converter |
| **Operating System** | **1** | Your "core superpower" module | **Exactly ONE** of three mutually exclusive families (see below) | Cyberdeck; Sandevistan; Berserk |
| **Hands** | 1 base, **2nd via the *Ambidextrous* perk** (Technical Ability, req. 15 Tech) | Weapon-handling (ranged) mods | None internal beyond the unlock | Smart Link; Ballistic Coprocessor; Shock Absorber |
| **Arms** | **1** | A built-in weapon arm | **Exactly ONE weapon arm** (see below) | Mantis Blades; Gorilla Arms; Monowire; Projectile Launch System |
| **Skeleton** | 2 base, **3rd via the *License to Chrome* perk** (Technical Ability, req. 15 Tech) | Structural HP/armor/carry/mantis-dash mods | None internal beyond the unlock | Titanium Bones; Dense Marrow; Epimorphic Skeleton; Bionic Joints |
| **Legs** | 1 | Mobility module | Leg-mobility pieces are alternatives — one installed = one movement mode | Reinforced Tendons; Fortified Ankles; Lynx Paws |

### The two hard mutual-exclusion rules (the load-bearing mechanics)

1. **Operating System = one core power.** The single OS slot accepts a **Cyberdeck** (quickhacking/netrunning), a **Sandevistan** (toggled time-slow), **or** a **Berserk** (melee/tank buff). With one slot, the three are mutually exclusive in the vanilla game — you commit your whole build to one, though you can swap freely at a ripperdoc. (Confirmed by Game8 and multiple guides; RPG Site frames the OS as your "core superpower" but does not carry the exact mutual-exclusion sentence verbatim.) `[2.0]`
2. **Arms = one weapon arm.** The single Arms slot holds exactly one of **Mantis Blades, Gorilla Arms, Monowire, or Projectile Launch System.** `[2.0]`

By contrast, the multi-slot systems (Frontal Cortex 3, Circulatory 3, Nervous 3, Integumentary 3, Immune 2, Skeleton 2–3) have **no internal exclusivity** — you stack different pieces up to the slot count, bounded only by total Cyberware Capacity. The extra Hands (1→2), Skeleton (2→3), and Ocular (1→2) slots are unlocked by *Ambidextrous*, *License to Chrome*, and the *Birds with Broken Wings* main quest respectively. `[2.0]`

**Lineage.** At launch (1.x) each body area had a small fixed number of slots gated by Street Cred and the per-part count; you filled them up to the printed limit. 2.0 kept the areas but layered the global **Cyberware Capacity** budget on top, so the real constraint became "do I have enough total Capacity?" rather than "do I have a free slot here?" — you can have empty slots you cannot fill because Capacity is exhausted. `[2.0]`

**Cross-patch stability.** The slot structure itself did **not change** across 2.0/2.1/2.2 — the eleven systems and their counts are stable. 2.1 made balance changes touching Capacity and OS items (below), not the layout; no 2.2 note alters the slot/exclusivity framework. `[patch — 2.2 left this system structurally untouched]`

---

## 3. Cyberware Capacity

**Cyberware Capacity (CWC)** is the master resource introduced in Update 2.0 that gates how much chrome V can install. It replaced the launch-era model in which cyberware was constrained per-body-slot and behind raw Attribute thresholds, turning "buy and bolt on everything you can afford" into a build-defining budgeting decision. `[2.0]`

### What it is and what it replaced

At launch (1.x), the limits were (a) a fixed set of body slots and (b) per-implant **Attribute requirements**; there was no shared budget. Update 2.0 added a single shared pool — **Cyberware Capacity**, measured in points. As CD Projekt Red's 2.0 preview put it, "the cyberware capacity system determines exactly how high that limit is for you," and your "cyberware limit increases with every level." `[2.0 → 2.2]`

### How it is measured and consumed (the mechanic)

- Capacity is an integer pool shown on the Cyberware screen as **used / total** (e.g. 180/201).
- **Every installed implant consumes a fixed amount of Capacity**, varying by implant: cheap utility pieces cost a few points; powerful Frontal Cortex / Operating-System and high-tier (Tier 4/5+) pieces cost far more. Upgrading to a higher tier generally raises the cost.
- This is a genuine **in-game mechanic**, not flavor: the menu **blocks an install** if the cost would push *used* above *total* — regardless of how many eddies you have or whether the body slot is empty. The only sanctioned way to exceed the ceiling is the **Edgerunner** perk (below).

### How total capacity grows

| Source | Amount | Notes / patch |
|---|---|---|
| **Base (player Level)** | 24 at Lv 1, **+3 per level**, 201 at Lv 60 | Vanilla formula `21 + (3 × Level)`; the largest single contributor. (e.g. L15 = 66, L30 = 111.) `[2.0]` |
| **Cyberware Capacity Shards** | up to **+80 total** (≈+60 base game / **+80 with Phantom Liberty**) | Permanent, instant pickups from corpses/containers/airdrops; the game **stops awarding** them once you've gained the cap, so they are finite. `[2.0 / 2.1+]` |
| **Technical Ability — Engineer skill** | +5 at Engineer Rank 10, +10 at Rank 30 (**+15 total**) | Milestone rewards. *Source conflict:* Game Rant lists the first +5 at Engineer Rank/Level 5; the better-sourced reading is Rank 10. `[2.0]` |
| **Renaissance Punk (perk)** | **+4 per Attribute at level 9+** (max +20) | Technical Ability tree; unlocks around Technical Ability 9. `[2.0]` |
| **Edgerunner (perk) — overcapacity** | exceed the ceiling by **up to +50**, costing **−0.5% max HP per point over** (−25% max HP at the full +50) | Capstone-style Technical Ability perk (commonly cited as requiring Technical Ability 20; prerequisite not independently re-confirmed). The *only* way to exceed the ceiling. `[2.0]` |
| **All Things Cyber (perk)** | −20% Capacity *cost* of Integumentary & Skeleton cyberware | Lowers consumption (more headroom) rather than raising the pool; single-sourced. `[2.0]` |

The base per-level number (+3/level) is reported by editorial guides (Gamerant); Game8's Capacity page does **not** state a number, so treat the figure as the better-sourced editorial reading.

### Practical maximum

Editorial guides put the standard-play maximum — `201 (Lv 60 base) + 15 (Engineer) + 20 (Renaissance Punk) + 50 (Edgerunner) + 80 (max shards)` — at **366 CWC**, "without operational overrides." `[2.1]` Beyond that, installing the **Chrome Compressor** (an Operating-System cyberware that adds Capacity but occupies your OS slot, so no Cyberdeck/Sandevistan/Berserk) pushes higher; **the exact Chrome Compressor bonus is source/patch-dependent** — Game8 cites **+42** (bringing a build to a 328 total), while later 2.1/2.2 community guides cite **+70** (≈436 theoretical max). The +42 figure is better-confirmed; +70 is single-sourced. 2.1 **increased the Chrome Compressor's Capacity bonus and lowered its price.** `[2.1]`

CD PROJEKT RED does **not** publish a single canonical "max Capacity" number, so any ~280–330 / 366 / 436 figure should be read as an editorial estimate, not an official figure. `[patch]`

### Patch lineage

- **2.0** introduced the whole system (Capacity pool, per-implant costs, shards, Edgerunner overcapacity, armor-from-cyberware), replacing the launch slot+attribute model.
- **2.1 / 2.2** are not reported to change the *formula* or progression; the base 24 → 201 curve and the +3/level rule appear unchanged. 2.1 **reduced the Capacity cost of many pieces** (e.g. Memory Boost, Bioconductor, Kerenzikov Boost System, Reflex Tuner, Axolotl, Camillo RAM Manager, Microgenerator, and others). Note this cross-patch stability is inferred from an *absence of reported change* rather than a positive "no change" statement.

---

## 4. Quality tiers & upgrading (incl. iconic)

### Lineage: why "Tiers" replaced "rarity" (1.x → 2.0)

At launch (1.x), cyberware used the same five-step rarity ladder as weapons/clothing — **Common, Uncommon, Rare, Epic, Legendary** (grey/green/blue/purple/orange) — with equip limits enforced by fixed slots. The official 2.0 note states CDPR "**Replaced old rarity levels … with Tiers (from Tier 1 to 5++),**" and replaced per-slot caps with the body-wide Cyberware Capacity budget. So post-2.0 there is, in effect, **one** quality axis (Tier), not two — the old color words still map 1:1 and guides use them interchangeably:

| Tier (2.0+) | Legacy rarity (1.x) | Color | Earliest in Ripperdoc stock |
|---|---|---|---|
| Tier 1 | Common | Grey | Level 1 |
| Tier 2 | Uncommon | Green | Level 10 |
| Tier 3 | Rare | Blue | Level 20 |
| Tier 4 | Epic | Purple | Level 30 |
| Tier 5 | Legendary | Gold/Orange | Level 40 |
| Tier 5+ / 5++ | (none — new) | Gold | **Upgrade-only** (not sold) |

The thresholds gate **stocking** (a piece appears once you hit the level), not a hard requirement, and in 2.0 nearly every ripperdoc sells nearly all cyberware. `[2.0/2.1]` From **Tier 3+**, cyberware *attunes* to an Attribute for a scaling bonus.

### How Tier scales an implant

Two mechanics stack:

1. **Tier raises the raw numbers and the *count* of stat bonuses.** A piece "gains one specific stat bonus at Tier 1 … and a second at Tier 2," with higher tiers raising magnitudes. A **third** bonus is unlocked *globally* — across all equipped cyberware — by the **Driver Update** perk (Technical Ability tree, available at 9 Technical Ability after maxing All Things Cyber). This third stat is **perk-gated, not tier-gated.** `[2.0]`
2. **Attribute Attunement.** Per CDPR: "Cyberware implants are now **Attuned to specific Attributes** — the higher the Attribute, the stronger the stat bonus." (RPG Site cites ~+0.5% damage per point on a Body-attuned example; exact per-point figures vary by implant and are not independently re-verified.) Attunement values were tuned in 2.1. The **Chipware Connoisseur** perk re-rolls a secondary stat; 2.1 fixed those re-rolled stats from randomizing on save/load. `[2.0; 2.1]`

### The upgrade path (Ripperdoc)

Upgrading is the **only** way past Tier 5 — the highest tier *sold* — up to **Tier 5++.** `[2.0+]`

- **Where/how:** 2.0 moved upgrading onto the ripperdoc screen; a small **yellow arrow** on the item icon signals an upgrade is available. Each tier has a base and a "plus" stage, so the late-game ladder is Tier 5 → 5+ → 5++.
- **Cost:** consumes **Item Components** matching the target tier plus eddies, and is generally **cheaper than buying fresh** at that tier. Top-end upgrades use Tier 5 Item Components. Components convert **5-to-1** (5× Tier-1 → 1× Tier-2, etc.). **Exact per-step component/eddie costs are item-specific and not standardized across sources** — editorial guides cite legendary-grade upgrades costing tens of thousands of eddies. `[patch-current]`
- **Exception:** virtually all cyberware can be pushed to Tier 5++ **except the Biomonitor.**

### Iconic cyberware

"Iconic" is a distinct designation layered on top of the tier ladder. The **Iconic Rating is exclusive to Tier 5 cyberware and produces an effect superior to other Tier 5** pieces (Game8; Fextralife). Iconics carry unique names/lore and a one-off bonus the generic version lacks (e.g. better duration or lower RAM cost). They can still be upgraded to Tier 5++, and some can be found at lower tiers and tiered up.

Iconic cyberware is mostly **not** ripperdoc stock — it comes from quests, fixed-world acquisitions (often killing a specific NPC), or **Dogtown airdrops** (semi-random Phantom Liberty crates). Phantom Liberty added a wave of new iconics sold by the four Dogtown ripperdocs or dropped via airdrops.

**Notable examples (all Tier 5 iconic; PL-era):**

| Iconic piece | Slot | How obtained |
|---|---|---|
| Militech "Apogee" Sandevistan | Operating System | Dogtown Ripperdoc, ~e$118,681 (Lv 40+) |
| Militech "Falcon" Sandevistan | Operating System | Ripperdoc, ~e$84,772 (Lv 30+) |
| MaxTac Mantis Blades | Arms | Kill MaxTac officer Melissa Rory in the side job **"Bullets"** (Jinguji) |
| COX-2 Cybersomatic Optimizer | Frontal Cortex | ~e$50,869 or Dogtown airdrops |
| Kiroshi "Cockatrice" Optics | Ocular | ~e$25,438 (Lv 35+) |
| Quantum Tuner | Operating System | Free; PL quest ("From Her to Eternity" / "King of Wands" ending) |
| Canto Mk.6 | Cyberdeck | Quest reward, "This Corrosion" |
| Behavioral Imprint-Synced Faceplate | Integumentary/Ocular | Free, "Birds with Broken Wings" |
| Chrome Compressor | Operating System | Dogtown vendor or airdrop |

(Acquisitions per TheGamer; eddie figures are Tier-5 prices — lower-tier variants cost less and vary by source/roll.)

**2.2 note:** 2.2 was primarily a **cosmetic** expansion (100+ customization options — cosmetic cyberware, makeup, tattoos, piercings, nails, eye colors); no surfaced source shows a tier/upgrade *mechanic* change, though the full official 2.2 notes could not be exhaustively fetched.

---

## 5. Gating & requirements

### The headline change: 2.0 moved gating from Attributes/Street Cred to Level + Capacity

The single most important fact for the definitive system: **installing cyberware no longer has any Attribute requirement and no Street Cred requirement.** In 2.0, "cyberware no longer requires you to meet any attribute thresholds like in previous versions," and "Street Cred/Attribute requirements for Cyberware have been removed." What you can install is bounded only by:

1. **Player Level** — gates the *tier* a ripperdoc stocks/sells. `[2.0+]`
2. **Cyberware Capacity** — the per-character point budget; you cannot equip more chrome than you have Capacity for. `[2.0+]`

### Player-Level gating of tiers (the real gate in 2.0+)

Ripperdoc inventories step up every 10 levels — Tier 1 (Lv 1), Tier 2 (Lv 10), Tier 3 (Lv 20), Tier 4 (Lv 30), Tier 5 (Lv 40+). This is the **player Level** ladder (max level 50 base game, 60 in Phantom Liberty), not the Attribute ladder, and is consistent across 2.0/2.1/2.2. Reaching a breakpoint makes that tier "widely available"; per CDPR, **each Tier also has a Tier+ variant with *no* additional level requirement.** A community heuristic of "upgrade-into" levels (~L15/L25/L35) is **not** in CDPR's official documentation and should be treated as unverified.

### Ripperdoc inventory under 2.0+

The old "different ripperdocs carry different exclusive stock" model was flattened: **almost every ripperdoc sells essentially the full standard (non-Iconic) catalog,** and what you can *buy* is set by Level (the tier ladder) and eddies. Iconic cyberware is no longer ripperdoc stock. Phantom Liberty-exclusive cyberware appears specifically at Dogtown ripperdocs / airdrops.

### Attributes still shape cyberware — via "Attunement," not requirements

In 2.0+, Rare-tier-and-above cyberware is **Attuned** to one of the five attributes. The implant works the moment it's installed; attunement just scales its bonus with that attribute. Representative per-point scaling (Gamer Guides / Sportskeeda; **illustrative — exact values vary by implant and are not independently re-verified**):

| Attuned to | Example scaling per attribute point | Family it tends to favor |
|---|---|---|
| Body | +0.5 Health, +0.5% damage, +0.5% DoT resist | Skeleton, Integumentary (armor/health) |
| Reflexes | +0.5% damage, +0.1% Crit Chance | OS / mobility (e.g. Kerenzikov-style) |
| Technical Ability | +0.5 Armor, +0.5% damage, tech/health-item efficiency | High-end utility; also governs Capacity |
| Intelligence | +0.05–0.1% all/Smart-weapon damage | Netrunner / cyberdeck implants |
| Cool | +0.2% headshot/weakspot dmg, +0.1% damage reduction | Stealth / crit-oriented |

So the old "which attribute gates which family" framing survives only as a **soft steer** — nothing stops a Body=3 character from slotting an Intelligence-attuned deck; it just gives a smaller bonus. `[2.0+]`

### Technical Ability uniquely gates *how much* chrome you can run

No attribute is required to install anything, but **Technical Ability is the de facto gate on total chrome**, because its perks expand Capacity: **Renaissance Punk** (unlocks ~Technical Ability 9; +4 per Attribute ≥9, up to +20), **Edgerunner** (capstone, commonly cited as Technical Ability 20; exceed Capacity by +50 at −0.5% max HP/point), and **All Things Cyber** (−20% Capacity cost of Integumentary & Skeleton). `[2.0+]`

### Lineage: what this replaced

At launch (1.x), cyberware was gated three ways at once — limited slots, **Street Cred** to unlock vendor stock, and **hard Attribute requirements**. Concrete examples that no longer apply: the **Legendary Kerenzikov required Reflexes 18** (rarity-tiered: Rare 12 / Epic 15 / Legendary 18), and the **Legendary Reinforced Tendons required Body 18 and Reflexes 15**. Rarity variants were also Street-Cred-locked at roughly **20 (Rare) / 25 (Epic) / 45 (Legendary)** Street Cred (these exact figures are lower-confidence). 2.0 collapsed all of that into the Level + Capacity model. In short, the definitive system answers "can I install this?" with **"are you a high enough Level for that tier, and do you have Capacity left?"** — never "is your Body/Reflexes/Street Cred high enough?" `[2.0/2.1/2.2]`

---

## 6. Economy

### The currency: eddies (e$)

Eurodollars — "eddies," **e$** — are the game's single universal currency, used for cyberware, weapons, vehicles, consumables, and quest payouts alike. Cyberware is purchased outright with eddies; **upgrading** consumes crafting components (rather than, or in addition to, eddies). `[2.0]`

### Ripperdocs as vendors

The most commonly cited base-game count is **~12 ripperdoc clinics across seven districts**, plus **4 in Dogtown** (Eron, Costin, Farida, Anderson) added by Phantom Liberty — roughly **16 total** — though sources vary (Fextralife reads ~13; Game8 tallies up to 17 depending on how unnamed/duplicate clinics and the Dogtown four are counted). They span every district: Watson (Viktor Vektor, Cassius Ryder, Buck's, Dr. Chrome, Instant Implants), Westbrook (Fingers M.D., Dr. Kraviz), Heywood, Santo Domingo (Octavio's), City Center, Pacifica, the Badlands (Aldecaldo mobile camp), and Dogtown. `[2.0]`

**Lineage / why this changed.** At launch each ripperdoc carried a distinct, largely fixed inventory, and power was capped by fixed per-part slots. 2.0 **unified the catalog** (every base-game clinic stocks the same "almost all cyberware" list) and replaced slots with **Cyberware Capacity** — so *what* a ripperdoc sells no longer depends on which clinic you visit. The exception: Dogtown ripperdocs carry a few iconics and Phantom Liberty-exclusive cyberware (also lootable from "Airdrop" content). `[2.0, Phantom Liberty]`

### How stock is gated — Level, not Street Cred

Post-2.0, stock is gated by **V's character Level**, not Street Cred. The CDPR official cyberware purchase breakpoints (which differ from *weapon* thresholds):

| Tier | Level it becomes widely available to **buy** (CDPR official) |
|---|---|
| Tier 1 | Level 1 |
| Tier 2 | Level 10 |
| Tier 3 | Level 20 |
| Tier 4 | Level 30 |
| Tier 5 | Level 40 |

Per CDPR, **each Tier also has a Tier+ variant with no additional level requirement** — so the intended loop is to buy low and upgrade up until the next full tier becomes purchasable.

### Buying vs. selling vs. upgrading

- **Buying:** on the ripperdoc screen with eddies; bounded by Cyberware Capacity (Edgerunner lets you exceed it at a health cost). `[2.0]`
- **Selling / disassembling:** general vendors and drop-boxes handle unwanted loot. 2.0 changed component economics — **vendors no longer sell crafting components**, and netrunner vendors stock quickhack-component crafting *specs* (which must be bought) rather than the components themselves. Players get components mainly by **disassembling loot** (a cheap weapon yields ~5 components of its tier) and looting Access Points/enemies/containers. 2.1 added a **Favorite** lock so favorited **weapons** can't be accidentally sold/disassembled/dropped. `[2.0, 2.1]`
- **Upgrading:** moved onto the ripperdoc screen in 2.0, simplified to **one component type** (down from multiple at launch) plus the **5-to-1** component conversion ladder. Upgrading is generally **cheaper than re-buying** at the higher tier. `[2.0]`

### Rough price ranges (eddies)

Cyberware spans a wide band — low-tier utility in the hundreds to low thousands, mid-tier OS/boosters around **e$10,000–30,000**, and top-end Legendary/Iconic into the **tens of thousands to ~e$100,000+**. High-tier figures verified against Game Rant; **low/mid-tier figures were not independently re-verified this pass** and vary by tier rolled:

| Cyberware (high-tier example) | Eddie cost |
|---|---|
| Self-ICE (Legendary) | e$16,961 |
| Ex-Disk (Legendary) | e$22,400 |
| Kerenzikov Boost System (Legendary) | e$33,915 |
| Axolotl (Epic) | e$57,874 |
| Gorilla Arms (Legendary) | e$100,250 |
| Mantis Blades (Legendary) | e$100,350 |
| COX-2 Cybersomatic Optimizer (Legendary) | e$101,732 |

Treat these as representative ripperdoc list prices, not fixed constants. No source gives a clean per-step eddie+component upgrade formula.

### Free & quest-reward cyberware

Several pieces bypass the eddie economy: **Tyger Claws Dermal Imprint** (free from Cassius Ryder), **Behavioral Imprint-Synced Faceplate** (PL story), **Axolotl** (all of Regina Jones's gigs — 2.1 retroactively grants it, replacing the older Neofiber reward), **Quantum Tuner** and Militech **"Canto"** cyberdeck (specific PL endings), and **MaxTac Mantis Blades** (the "Bullets" gig / a Mr. Hands PL ending). `[2.0/2.1, Phantom Liberty]`

### Patch notes

- **2.0** established the modern economy (unified catalog, Capacity, Tiers 1–5++, on-screen upgrading, single-component crafting, vendors no longer selling components).
- **2.1** was mostly a **rebalance** (lower Capacity costs on many implants; new cyberware like Feen-X, Cogito Lattice; Tier 4/5 weapon mods buyable; higher mod drop rates; the Favorite lock for weapons; the Regina/Axolotl swap). No fundamental economy change.
- **2.2** is primarily a **cosmetic** expansion of the ripperdoc menu (100+ customization options); it did **not** alter the buy/sell/craft economy.

---

## 7. Cyberpsychosis & the humanity theme

Cyberpsychosis is the franchise's central cautionary metaphor: replacing too much flesh with chrome erodes your capacity to care for others until you snap into homicidal psychosis. In *Cyberpunk 2077* (the **game**) this is overwhelmingly a **narrative/world-building theme, not a player-facing mechanic.** The literal humanity-loss system from the tabletop was effectively cut before launch, and the 2.0 rework only ever expresses it abstractly via the Cyberware Capacity ceiling. **The single most important distinction for a designer:** the dread is authored, the math is just a budget.

### Tabletop lineage — where the mechanic actually lived

In **Cyberpunk 2020** and **Cyberpunk RED** (tabletop), cyberpsychosis is a hard, quantified rule on two linked stats:

| Stat | Tabletop rule |
|---|---|
| **Empathy (EMP)** | A core attribute — the ability to relate to and care for others; explicitly "offsets the effects of cyberpsychosis." |
| **Humanity (HUM)** | A derived pool. **1 point of Empathy = 10 points of Humanity** (EMP 5 → HUM 50). |

Installing cyberware carries a **Humanity Cost** deducted on install; **every 10 Humanity lost = 1 Empathy lost**; when both reach 0, the character **becomes a cyberpsycho and is taken over by the GM as an NPC.** (Drawn from a WebSearch summary of the Cyberpunk Fandom Empathy page, which returned HTTP 403 on direct fetch — so exact per-implant Humanity Cost tables were not captured.) This is the literal "too much chrome strips your soul" loop the game chose **not** to ship.

### What the game actually shipped

The retail game has **no Humanity stat, no Empathy stat, and no cyberpsychosis penalty applied to V** — which is why V can chrome up heavily without going psycho. (Community mods re-add the tabletop loop, confirming its absence.) The widely-reported — but secondhand, not a verbatim CDPR quote — rationale is that letting V descend into cyberpsychosis would strip player agency and derail V's authored story. The theme instead survives through four channels:

1. **The Cyberware Capacity ceiling — the closest thing to a mechanic.** 2.0's unified Capacity budget is the mechanical *descendant* of the Humanity pool (a scarcity ceiling on chrome), but it is purely a build-economy number with **no psychosis, empathy, or morality dimension.** `[2.0]`
2. **The Edgerunner perk — a deliberate "going over the edge" nod.** Exceed Capacity by **up to +50** at **−0.5% Max Health per point** (−25% at the full +50), plus a **Fury** payoff: on neutralizing an enemy, a **0.1% chance per point over** to enter Fury for **12s** (+10% Damage, +30% Crit Chance, +50% Crit Damage). The name and risk/reward are an explicit wink at the anime — but the only consequence is lost health, never psychosis. `[2.0; values inferred consistent through 2.1/2.2]`
3. **Cyberpsycho Sightings — the theme as side content.** The **"Psycho Killer"** questline, given by fixer **Regina Jones** (who believes cyberpsychosis is *treatable*), comprises **17 cyberpsycho encounters**; she urges V to subdue them **non-lethally** for therapy, with a better outcome the more you spare. Narrative/quest design — not a stat on V.
4. **Lore archetypes.** **Adam Smasher** is a near-total (~96%) full-body-conversion cyborg embodying "metal over meat"; canon frames his stability as engineered — his Dragoon frame runs a **Behavioral Inhibitor Program** plus psychoactives. The police unit **MAX-TAC** exists to put down cyberpsychos. Pure lore.

### Cyberpunk: Edgerunners (anime) and the cultural reference

The 2022 Netflix anime *Cyberpunk: Edgerunners* is the franchise's clearest dramatization of the humanity-loss loop: **David Martinez** over-chromes around a military **Sandevistan**; crewmates warn of cyberpsychosis (blackouts, hallucinations, violent mood swings, framed as **irreversible**), and his rise-and-fall ends in death. It fed back into the game via the **Edgerunners Update (Patch 1.6, Sept 6 2022)** — free tie-in content, **not** a humanity mechanic: the side quest **"Over the Edge"** (Megabuilding H4) rewarding **David's Jacket**, plus **Rebecca's iconic shotgun "Guts."** The 2.0 Edgerunner perk's Capacity-overload + Fury framing is the closest the live game comes to honoring the anime's premise mechanically: push past your limits for power, pay with your body.

### Designer takeaway (mechanic vs. narrative)

| Element | In-game mechanic? | Notes |
|---|---|---|
| Humanity / Empathy stat | **No** (game) / Yes (tabletop) | Cut before launch; only mods restore it |
| V going cyberpsycho | **No** | Deliberately omitted to preserve player agency |
| Cyberware Capacity ceiling | **Yes** `[2.0]` | Build budget; replaced 1.x slots; no morality axis |
| Edgerunner overload (−0.5% HP/pt, +50, Fury) | **Yes** `[2.0+]` | Only chrome-overload "cost" — health, not psychosis |
| Cyberpsycho Sightings (17, non-lethal) | Quest content | Theme delivered as narrative + spare/kill choice |
| Adam Smasher / MAX-TAC / David | Pure lore / cultural reference | The theme's emotional payload |

---

## 8. Effect taxonomy

This maps **what cyberware actually does mechanically** under the 2.0 framework, organized by *effect kind* (the reusable axis), cross-referenced to the *slot* each implant lives in. Two structural rules every effect plugs into: **slots + Cyberware Capacity** replaced launch slot-tiers (each piece has a Capacity cost — e.g. Second Heart 30, Militech Berserk 35, Reinforced Tendons 8), and **Tiers (1 → 5++)** replaced rarity. Also restructured in 2.0: **armor comes almost entirely from cyberware** (Skeleton + Integumentary), making clothing cosmetic.

### (a) Flat passive stats (always-on numbers)

The "stat stick" category — by far the most common.

| Effect | Example implant (slot) | What it grants `[2.0]` |
|---|---|---|
| Max armor / mitigation | **Subdermal Armor** (Integumentary) | Flat Armor, +0.5 Armor per attribute point at T5 |
| Conditional-but-passive armor | **Rangeguard** (Integumentary) | +90 Armor while no enemy within 6 m (T5) |
| Incoming-damage reduction | **Pain Editor** (Integumentary) | −7% all incoming damage (T5), +0.1% per attribute pt |
| Max RAM | **RAM Upgrade**, **Ex-Disk** (Frontal Cortex) | +Max RAM / +Max RAM + upload speed (exact T5 values unverified) |
| Crit chance | **Kiroshi "Cockatrice" Optics** (Ocular/Face) | +Crit Chance — **sources conflict**: Fextralife T5 = 25%, Fandom = 30%; ~30–35% only at 5+/5++ |
| Quickhack crit | **Bioconductor** (Frontal Cortex) | Crit Chance with quickhacks (cited ~35% T5; unverified) |
| Movement speed | **Leeroy Ligament System** (Legs, Iconic) | flat +15% (Fextralife) to +20% at T5 (RPG Site, verified); Dogtown-only |
| Body-check / melee power | **Gorilla Arms** (Arms) | +Body checks (+1 → +6) plus melee damage |
| Stamina / regen | **Adrenaline Booster** (Circulatory) | stamina on melee-kill + regen bonuses |

Most 2.0 implants *also* carry small per-attribute-point attunement bonuses, so even "movement" or "weapon" pieces double as stat sticks (specific per-point figures cited but unverified).

### (b) Active abilities with cooldowns (player-triggered, timed)

The headline category — and the **Operating System slot holds exactly one** of Sandevistan / Berserk / Cyberdeck, forcing the build's identity.

- **Sandevistan (OS) — time-slow.** Top model **Militech "Apogee"**: slows time **85%**, duration **6s**, cooldown **30s → 25s at T5+**; +15% Headshot/Crit Chance/Crit Damage (+17% at 5+, +20% at 5++); a kill while active extends duration **+20%** and refunds +22% Stamina. Purchasable at Lv 40. `[2.0, stable through 2.x]`
- **Berserk (OS) — melee rage/invuln.** Timed melee-power state that **locks out ranged weapons, grenades, and items**, −100% melee Stamina cost; +25% Health per enemy neutralized during it. Most models prevent Health dropping below 25%; the **Militech Berserk** is fully invulnerable (Health can't drop), +30% attack speed, +20% move speed, up to +50% damage under 20% HP, **12s / 35s cooldown, Capacity 35** (T5). (2.1 gave all Berserks except the Militech Berserk a damage-reduction bonus.) `[2.0/2.1]`
- **Cyberdeck (OS) — quickhack engine.** Lets V slot/upload **Quickhacks** (active, RAM-cost — see (f)). Decks define **RAM units, Buffer size (Breach Protocol), and Quickhack slots** scaling with tier (commonly cited ~6/9/12/18 RAM, 2/3/4/6 Buffer, up to 7–8 slots — illustrative, exact ladder unverified). `[2.0]`
- **Optical Camo (Integumentary) — active cloak.** −90% visibility for 7s, 50s cooldown (T5) — an active ability that lives in the skin slot, not the OS slot. `[2.0]`

### (c) Triggered passives (auto-fire on a game condition)

The "safety net / snowball" category — no button; the implant watches a condition (HP threshold, kill, damage taken).

- **Second Heart (Circulatory) — auto-revive.** At 0 Health, instantly restores **+100% Health**; cooldown **240s** at T5 (lower tiers longer, ~up to 300s — band is tier-dependent). Capacity 30.
- **Biomonitor (Circulatory)** — auto-uses your Health Item when Health drops **below 35%.**
- **Heal-on-Kill (Circulatory)** — restores a % of Health per enemy neutralized.
- **Camillo RAM Manager (Frontal Cortex)** — recovers a chunk of Max RAM (~23% cited) when available RAM falls to ~20% (exact % unverified).
- **Self-ICE (Frontal Cortex)** — auto-negates an incoming enemy quickhack (~45s cooldown cited), +2 Max RAM (unverified).
- **Shock-N-Awe (Integumentary)** — on taking damage, 10% chance to emit a ~500-damage electroshock (T5).
- **Countershell (Integumentary)** — +50% Mitigation Chance for 4s if V loses 35% Health within 3s.
- **Threatevac (Circulatory)** — **+25% movement speed when Health drops to 25%, scaling up to +35%** as Health falls further.

Distinct: the **Blood Pump** (Circulatory) is *player-activated* (Health-Item slot — instantly restores 45–85 Health then +9–17/s for 6s, 180s cooldown, Capacity 15), so it belongs to (b)/consumables, not the auto-trigger group.

### (d) Movement / traversal — the Legs slot

2.0 turned the old binary into a five-way choice (one installed = one mode):

| Implant (Legs) | Movement effect `[2.0]` |
|---|---|
| **Reinforced Tendons** | **Double jump**; Capacity 8 |
| **Fortified Ankles** | **Charge jump** (hold→release), reduced fall damage; the launch-era hover was removed in 2.0; Capacity 6 |
| **Lynx Paws** | −50% movement noise + up to +12% crouched move speed (T5); Capacity 5 |
| **Jenkins' Tendons** | Burst sprint speed (sources vary ~+30% to +60%, decaying to +10% over 5s) |
| **Leeroy Ligament System** (Iconic) | Flat all-the-time movement speed (+15–20% T5); Dogtown-only |

The **Relic skill tree** (Phantom Liberty) adds a mid-air **Air Dash**. Skeleton pieces (Bionic Joints, Para Bellum) are mostly carry/armor passives that reinforce mobility builds. `[2.0+]`

### (e) Weapon arms (the Arms slot)

Exactly one weapon-arm, each a melee/ranged tool with a basic combo plus a **charged/active attack**. All come in elemental variants (Physical→Bleed, Electrical→Shock, Thermal→Burn, Chemical→Poison; ~7–20% status chance by tier).

- **Mantis Blades** — fast slashing; charged leap attack; Bleed on Physical.
- **Gorilla Arms** — blunt fists; heavy charged stagger; also grant Body-check bonuses (see (a)).
- **Monowire** — whip hitting multiple enemies at range; chargeable; strong with electrical/quickhack builds.
- **Projectile Launch System** — fires an explosive projectile (active, quickslot-bound); charging adds +30% damage, +25% radius, +40–100% status chance.

All four gain extra charged/overcharged abilities from the **Relic "Jailbreak" tree** — **Phantom Liberty-gated** (unlocked via Songbird; points from Militech Data Terminals in Dogtown). `[2.0+]`

### (f) Utility / netrunning / scanning

Output is information, hacks, or build-enabling — not direct stats or weapons.

- **Kiroshi Optics (Ocular/Face) — scanning + targeting.** Story-installed (Viktor) optics unlock the **scanner** (highlight/analyze enemies, devices, loot; reveal weakspots and quickhack targets) and **optical zoom** (~10x). Higher variants add combat stats (e.g. "Cockatrice" crit chance — 25%/30% conflict above; others add headshot/weakspot damage). `[2.0]`
- **Cyberdeck Quickhacks (OS) — netrunning.** RAM-cost, cooldown-bearing active hacks split into **Combat** (Overheat, Short Circuit, Contagion), **Control** (Reboot Optics, System Reset), **Covert**, and **Ultimate** (Suicide, Cyberpsychosis, Detonate Grenade). Scales with Intelligence and Frontal Cortex RAM pieces. `[2.0]`
- **Frontal Cortex utility** — RAM economy & counter-netrunning: **Ex-Disk / RAM Upgrade**, **Self-ICE** (auto-deflect hacks), **Mechatronic Core** (bonus vs drones/robots/turrets, ~+35% cited), **Camillo RAM Manager**. (Exact % values unverified.)
- **Relic-tree utility (PL)** — **Emergency Cloak / Sensory Protocol**, **Vulnerability Analytics / Machine Learning** (detect armor/cyberware weakpoints for guaranteed crits, armor pen, EMP bursts). `[2.0+, PL-gated]`

### Quick mapping summary (for porting effects to another game)

| Category | Trigger model | Resource | Canonical examples |
|---|---|---|---|
| (a) Flat passive | always-on | none | Subdermal Armor, Pain Editor, RAM Upgrade, Cockatrice Optics |
| (b) Active w/ cooldown | player button | cooldown (+ sometimes RAM/Stamina) | Sandevistan, Berserk, Optical Camo, Cyberdeck quickhacks |
| (c) Triggered passive | game condition (HP/kill/hit) | internal cooldown | Second Heart, Biomonitor, Heal-on-Kill, Shock-N-Awe |
| (d) Movement | passive or contextual press | none/short | Reinforced Tendons, Fortified Ankles, Lynx Paws, Jenkins' Tendons |
| (e) Weapon arm | basic combo + charged attack | Stamina; PLS uses quickslot | Mantis Blades, Gorilla Arms, Monowire, Projectile Launch System |
| (f) Utility/netrun/scan | passive/active hacks/scan | RAM (hacks) | Kiroshi Optics scanning, Quickhacks, Self-ICE, Mechatronic Core |

All quantitative values are 2.0 mechanics that persisted through 2.1/2.2 unless noted (e.g. Apogee's 5+/5++ scaling, the 2.0 removal of Fortified Ankles' hover, the 2.1 Berserk damage-reduction add). The Operating-System exclusivity, the Cyberware Capacity budget, tier-not-rarity scaling, and armor-from-chrome are the load-bearing structural rules any effect map must respect.

---

# Part II — Connecting it to STARLEFT (design)

## II.1 — STARLEFT systems inventory (the hooks this design builds on)

Every mechanism below was confirmed by reading source. Part II points at these by name so implementers never re-derive them.

| STARLEFT mechanism | Where | What it is |
|---|---|---|
| **M3rit$** (`CAMPAIGN.m3`) | `js/hub.js` | The persistent campaign meta-currency. Spent host-authoritatively via `hubSpend(cost)` (`js/hub.js:~1423`); `hubCanAct()` (`js/hub.js:154`) gates spends to solo or the co-op host. The universal HUB sink (condos, implants, off-hours, reborn). |
| **Existing implant primitive** | `js/hub.js:14`, `:1222-1228` | `CAMPAIGN.upgrades[hubUnitKey(u)] = {implantLevel:0–4, styleId, …}`; `HUB.implantCosts=[150,300,550,900,1400]`. `hubApplyUpgrades(u)` folds it into `u.hubHpMul = 1 + condoLvl*0.04 + implant*0.03` and `u.hubDmgMul = 1 + implant*0.03` — today just flat +3% HP / +3% dmg per level. |
| **Per-unit persistent key** | `js/hub.js` | `hubUnitKey(u)` → `hero:<id>` \| `lore:<seed>` \| `unit:<id>`. All persistent per-unit state in `CAMPAIGN` is keyed by this; it survives carryover/save. |
| **Career level** | `js/career.js:55`, `:88` | `u.stars` (0–30). `vetDmgMul(u)=1+dmgPerStar*stars`; `applyVetHp(u)` re-bakes `u.maxHp = base*(1+hpPerStar*stars)*(u.hubHpMul||1)*…`. The natural analogue of player Level + the tier gate. |
| **Combat-time effect injection points** | `js/units.js:926`, `:1291` | Damage chain: `_m = vetDmgMul(u)*(u.hubDmgMul||1)*vetBuff(u,state).dmgMul*madDmgMul(u)*(u.bossDmgMul||1)`. Armor: `if(armor>0 && !pierce) amt *= (1 - armor)`. **These two lines are where every chrome effect lands.** |
| **Madosis (= cyberpsychosis)** | `js/madosis.js` | `u.madosis`, `u.sanityThreshold` (deterministic mint at L2, `:75`), `u.scarred` (breaks 30% sooner, `:34`), `madEffective(u)` (`:50`), `addMadosis(u,amt,reason)` (`:92`), `madDmgMul(u)` (`:62`), breakdown episodes tremor→defiance→feral. `u.reborn` cyborgs already exist: over-chromed survivors, +HP, no self-heal, scarred. All rolls are rollback-safe (`simRandom`/`makeRng`). |
| **Progress gating (= Street Cred era stock)** | `js/hub.js:47` | `CAMPAIGN.nextMapIndex` + `hubPoiAvailable(p)`. Precedent: The Wake unlocks at idx≥11, off-hours venues at idx≥4 (`HUB.offhoursAppearIdx`). |
| **Ripperdoc-clinic template** | `js/offhours_data.js:59,76`; `js/offhours_interior.js:74`; `js/hub.js:1256-1264` | The in-progress off-hours interior: `OFFHOURS.interiors[kind]` layouts + `OFFHOURS.fixedNpcs` identities; `openInterior(poi,who)` → canvas room → pie-menu → scenes. `hubUnitArrivedPoi` already routes `bar/club/diner/landing` POIs to `openInterior`. A clinic is a new venue of this exact shape. |
| **Timed buff field** | `js/lore.js:207`; read `js/units.js:926` | `u.buff = {dmgMul, regenMul, until}`, read via `vetBuff(u,state)`. The plumbing a Sandevistan/Berserk-style active window reuses. |
| **Save** | `js/hub.js:121-151` | `serializeHubCampaign` = JSON clone; `deserializeHubCampaign` rebuilds defaults then `Object.assign(CAMPAIGN, data)` + per-subobject merges. Additive fields are legacy-safe by construction (this is exactly how `training`/`healing`/`offhours` were added). |
| **Append-only content contract** | `js/offhours_data.js:6-12` | Indexed content pools (lore_data, npc_lore_data, offhours_data) grow only by appending, with a `versions[]` freeze table. Saves reference content by index. A new `js/cyberware_data.js` follows the same contract. |

## II.2 — Design pillars (every proposal below is checked against these)

1. **Save compatibility is mandatory.** New fields default safely; old saves load and play unchanged (`CLAUDE.md`).
2. **Three sim paths.** Solo / host-authoritative / client-applies-snapshots. Chrome *installs* are HUB transactions (host only). Chrome *effects* are baked into unit fields the host already broadcasts — clients never recompute them.
3. **Determinism for rollback.** Any in-mission chrome behavior uses `simRandom`/`makeRng`, mints identity from the lore seed, and skips cosmetic FX under `_rbReplaying`.
4. **Append-only content.** The catalog never reorders/deletes indexed entries; it carries a `versions[]` table.
5. **Don't over-rebuild the UI.** Reuse the host-gated upgrade path; respect `refreshUI()`'s signature-based rebuild.
6. **Art is dark/devastated cyberpunk** — steel/charcoal + cyan, never bright; procedural fallbacks exist.

## II.3 — The core mapping

The headline research finding makes the mapping *cleaner* than first expected: because 2.0 **removed attribute and Street-Cred install requirements**, the canonical gate is just **Level + Capacity** — and STARLEFT already has both (`u.stars` + a budget we derive from it). There is no "attribute gap" to paper over.

| CP2077 concept | STARLEFT mapping | Fit |
|---|---|---|
| **Eddies (e$)** | `CAMPAIGN.m3` via `hubSpend` | Exact. No new currency. |
| **Ripperdoc vendor** | Medium: the existing **HUB unit panel** (generalized `hubUpgradeSelectedUnit`). Faithful: a new `clinic` off-hours interior + `OFFHOURS.fixedNpcs.ripperdoc`. | Strong; reuses proven flows. |
| **Cyberware slots** | `CAMPAIGN.upgrades[key].chrome = { <slotId>: {id, tier} }`; slot/implant catalog in new `js/cyberware_data.js` | `hubUnitKey` already gives stable per-unit persistence. Slots are *data*, not new entity fields. |
| **Capacity ceiling (the real gate)** | `chromeCapacity(u) = capBase + capPerStar * u.stars`; `capUsed` summed from slotted implants; install refused over budget (toast, like `hubSpend`) | Faithful — capacity, not slots/cred, is the binding constraint, exactly as in 2.0. |
| **Player-Level tier gate** | `u.stars` gates which **tier** is purchasable (mirrors Level → tier stock) | Direct. |
| **Quality tiers (1→5++)** | `chrome[slot].tier` (1–5); tier scales the effect magnitude and the capacity/M3$ cost (parallels today's `implant*0.03`) | Direct. |
| **Iconic cyberware** | Hero-bound unique implants keyed by `hero:<id>`; story/quest-granted, not buyable | Heroes already carry fixed dossiers and steadier madosis — natural home. |
| **Attribute requirements** | **Dropped** (faithful to 2.0). Optional flavor: "attunement" = a small bonus when an implant suits a unit's `DEF[u.type]` role. Never a gate. | Resolved by the canonical system itself. |
| **Street Cred (stock unlock)** | `CAMPAIGN.nextMapIndex` + `hubPoiAvailable` (higher-tier catalog / the clinic unlock with campaign progress) | Precedent exists (Wake idx≥11). |
| **Cyberpsychosis / Humanity** | `u.madosis` / `u.sanityThreshold` / `u.scarred`. **STARLEFT's deliberate divergence** (§II.5): realize the theme the game omitted. | The single best thematic fit in the codebase. |
| **Edgerunner overload (−HP past the cap)** | Optional: allow exceeding `chromeCapacity`, paying with a permanent `sanityThreshold` reduction (+ optional max-HP cost) | Faithful to the perk's "push past your limit, pay with your body." |
| **Cyberware Malfunction** | Madosis breakdown episode (tremor→defiance→feral) on an over-chromed unit | Already simulated, rollback-safe. |

### Effect-type → STARLEFT field mapping

The taxonomy in Part I §8 lands almost 1:1 on fields STARLEFT already reads at combat time:

| CP2077 effect category | Example | STARLEFT field (read site) |
|---|---|---|
| (a) Flat passive — armor | Subdermal Armor, Pain Editor | `u.armor` (`js/units.js:1291`) — chrome sets/adds it per unit |
| (a) Flat passive — max HP | Titanium Bones | `u.hubHpMul` → `applyVetHp(u)` (`js/career.js:88`) |
| (a) Flat passive — damage/crit | Cybersomatic Optimizer | `u.hubDmgMul` (`js/units.js:926`) |
| (b) Active w/ cooldown | Sandevistan, Berserk | `u.buff={dmgMul,regenMul,until}` + an ability cooldown field; **mutually-exclusive OS-style slot** |
| (c) Triggered passive — revive | Second Heart | a one-shot `u.chromeRevive` flag → on-death restore (mirrors `u.reborn` revive concept) |
| (c) Triggered passive — regen / heal-on-kill | Heal-on-Kill, Blood Pump | `u.buff.regenMul`; or a small heal hook on kill |
| (d) Movement — speed | Lynx Paws, Leeroy Ligaments | `u.speed` |
| (d) Movement — flight/jump | Reinforced Tendons | `u.air` — **DEFER** (perturbs pathing/targeting; balance + determinism risk) |
| (e) Weapon arms | Gorilla / Mantis / Monowire / PLS | `u.dmg`, `u.pierce`, `u.splash`, melee range — **mutually-exclusive Arms-style slot** |
| (f) Utility / scan | Kiroshi Optics | `u.sight` (+ optional reveal, cf. the `intel` scan building) |

> **Read-site note (accuracy):** `u.hubHpMul`, `u.hubDmgMul`, `u.armor`, `u.speed`, and `u.sight` are already per-entity values read directly in the sim, so chrome sets them with **no engine change**. **`pierce` and `splash` are the exception:** pierce is read as `DEF[src.type].pierce` at `js/units.js:1291`, and splash flows from the attacker's effective stats into `applyHit(state, attacker, target, dmg, splash, splashR)` (`js/units.js:673`, effective stats computed near `:923`). A chrome pierce/splash effect therefore needs a *one-line read-site extension* per site (e.g. `DEF[src.type].pierce || src.chromePierce`), not just a field set — called out so it isn't mistaken for free.

## II.4 — Data model

**Per-unit, persistent (in `CAMPAIGN.upgrades[key]`, additive):**

```js
// CAMPAIGN.upgrades[hubUnitKey(u)] — extend the existing object, don't replace it:
{
  implantLevel: 0,            // LEGACY (kept; still contributes via hubApplyUpgrades)
  styleId: null,              // LEGACY
  chrome: {                   // NEW — slotId -> installed implant
    frame:  { id: 'titanium_bones', tier: 3 },
    arms:   { id: 'gorilla_arms',  tier: 2 },   // mutually-exclusive slot
    os:     { id: 'sandevistan',   tier: 2 },   // mutually-exclusive slot
    // optics, circ … (absent slot = empty)
  },
  capUsed: 17,                // NEW — denormalized sum (recomputable; cached for UI)
}
```

**Static catalog — new `js/cyberware_data.js` (append-only, mirrors `offhours_data.js`):**

```js
const CYBERWARE = {
  versions: [],               // freeze table; empty = full current lengths
  tune: { capBase: 6, capPerStar: 1, rebornCapMul: 0.7, heroCapBonus: 4,
          overloadMax: 6, overloadSanityPerPt: 0.04 /* … see Appendix B */ },
  slots: [ /* id, name, exclusive?, which DEF roles it suits (attunement) */ ],
  implants: [ /* id, slot, name, flavor, effects-by-tier, capCost-by-tier, m3Cost-by-tier */ ],
  iconics: [ /* heroId-bound unique implants */ ],
};
```

**The recompute — a sibling to `hubApplyUpgrades` (`js/hub.js:1222`):**

```js
function hubApplyChrome(u){
  const up = CAMPAIGN.upgrades[hubUnitKey(u)] || {};
  const chrome = up.chrome || {};
  // start from the legacy/condo multipliers hubApplyUpgrades already set, then ADD chrome:
  let hp = u.hubHpMul || 1, dmg = u.hubDmgMul || 1, armor = 0, speed = 1;
  for (const slot in chrome){
    const eff = cyberEffect(chrome[slot]);   // catalog lookup by id+tier
    hp += eff.hp; dmg += eff.dmg; armor += eff.armor; speed *= (1 + (eff.speed||0));
    if (eff.pierce) u.chromePierce = true;
    if (eff.splash) u.chromeSplash = Math.max(u.chromeSplash||0, eff.splash);
    if (eff.revive) u.chromeRevive = true;
    // OS active → eff.activeBuff descriptor stored for the ability system
  }
  u.hubHpMul = hp; u.hubDmgMul = dmg; u.armor = (DEF[u.type].armor||0) + armor; u.chromeSpeedMul = speed;
  applyChromeSanity(u, up);                  // §II.5
  if (typeof applyVetHp === 'function') applyVetHp(u, true);   // re-bake maxHp
}
```

Call it where `hubApplyUpgrades(u)` is already called (roster spawn, `js/hub.js:1219`), and re-bake on install/remove exactly like `hubRebakeResidents` does today for condos.

## II.5 — Cyberpsychosis ↔ madosis (the keystone, and an honest divergence)

**The honest framing the doc must keep front-and-center:** *Cyberpunk 2077 itself does not make cyberpsychosis a player mechanic* — it cut the tabletop Humanity loop and represents the theme only narratively (Part I §7). STARLEFT is therefore **not "porting" a CP2077 mechanic here — it is using its own madosis system to realize the franchise fantasy the game declined to ship.** That's a feature, not a misread of the source; the doc states it plainly so the divergence is intentional.

Two layers, mirroring the two things CP2077 *does* have:

1. **The Capacity ceiling = a clean budget, no morality** (faithful to 2.0). Installing chrome *within* `chromeCapacity(u)` costs only M3$ + capacity. No madosis. This keeps the common case friction-free, exactly like the game.
2. **The Edgerunner overload = the cautionary edge** (faithful to the perk + the theme). Optionally let a unit exceed its capacity by up to `overloadMax` points. Each point over **permanently lowers `u.sanityThreshold`** (and optionally shaves max HP, like the perk's −0.5%/pt). The unit is stronger *and* breaks into a feral "malfunction" sooner under field stress. Bound the total reduction (cf. `OFFHOURS.tune.strainMax:6`, which deliberately stays well below threshold) so it is a real risk, not an instant death sentence.

**Reborn units are the living warning.** `u.reborn` cyborgs are already `scarred` (break 30% sooner) with no self-heal — canonically over-chromed survivors. Give them either reduced capacity *or* the steepest overload cost; surface which in tuning (Appendix B). This makes the existing Reborn arc and the chrome system reinforce each other thematically.

**Determinism:** the sanity-threshold reduction is applied at install time (a HUB action), not in the sim, and is folded into the deterministic `madRollThreshold` mint or applied as a stored multiplier — it consumes no sim RNG. Heroes keep their steadier `heroThresholdMul`.

## II.6 — The ripperdoc (UI surface)

> **Full panel spec in Part III** — layout, the complete UX, and the CP2077 reference mapping live there. This subsection is the system-level summary.

- **Medium (recommended now):** reuse the **HUB unit panel** — generalize `hubUpgradeSelectedUnit('implant')` (`js/hub.js:~1452`) into a slot+tier picker. All spends via `hubSpend`; all gated by `hubCanAct`. No new interior, no new command buttons, no `refreshUI()` churn.
- **Faithful (later phase):** a **ripperdoc clinic** as a new off-hours interior venue — a `clinic` POI kind gated by `hubPoiAvailable`, an `OFFHOURS.interiors.clinic` layout (surgical chairs, diagnostic wall), and an `OFFHOURS.fixedNpcs.ripperdoc` identity. The pie-menu's verbs become **Install / Upgrade / Remove / Examine** instead of bond scenes. This is purely additive on top of Medium.

## II.7 — Fidelity tiers & recommendation

| | Lightweight | **Medium (recommended)** | Faithful |
|---|---|---|---|
| Slots | none (rename `implantLevel` 0–4 as named pieces) | ~5 (2 mutually exclusive) | full ~10-system taxonomy |
| Implants | ~5 | ~8–12 across effect types | 25+ across 5 tiers |
| Capacity | none | real ceiling from `u.stars` | ceiling + shards (M3$ sink) |
| Cyberpsychosis | one-time madosis at max | overload→`sanityThreshold` + reborn tie-in | full per-slot humanity cost + malfunctions |
| Ripperdoc UI | existing button | existing HUB unit panel | new clinic interior |
| Iconics | — | hero-bound (optional) | full, story-granted |
| New entity fields | maybe `u.armor` | `u.armor`, `u.chromeSpeedMul`, flags | + active-ability state |
| Effort | S | **M** | L–XL |

**Recommend Medium**, architected so Faithful is a later additive phase. Rationale: every Medium effect lands on a field STARLEFT already reads at combat time → **no new sim machinery, rollback preserved for free**; one additive `chrome` sub-object → **save-safe by construction**; it reuses the host-gated upgrade path → **no UI over-build**; and it delivers the *power-vs-humanity tension* — the actual soul of CP2077's system — via madosis, which the lightweight tier can't and the faithful tier doesn't need a clinic to achieve. **Defer `u.air`/flight implants indefinitely** (the one effect that perturbs pathing/targeting and risks both balance and determinism).

## II.8 — Save compatibility & migration

- `chrome` and `capUsed` are added inside the existing `CAMPAIGN.upgrades[key]` object. `deserializeHubCampaign` already does `CAMPAIGN.upgrades = data.upgrades || {}` — old saves simply have no `chrome` key, and `hubApplyChrome` treats an absent `chrome` as "no implants." **No migration required; old saves load unchanged.**
- **Legacy `implantLevel` coexists.** `hubApplyUpgrades` keeps contributing its flat +3%/+3%; `hubApplyChrome` adds chrome on top. Optionally, a one-time soft-migration can convert `implantLevel:n` into a free Frame implant of tier `n` and zero `implantLevel` — but this is not required and should be reversible/opt-in.
- If chrome sets **entity** fields read in combat (`u.armor`, `u.chromeSpeedMul`, `u.chromePierce`, `u.chromeRevive`), confirm `js/save.js` round-trips them (they serialize as plain fields) and `js/net/sync.js` packs them in host→client snapshots.

## II.9 — Netcode (three sim paths)

- **Install / upgrade / remove** are HUB transactions: host-authoritative, gated by `hubCanAct()`, spent via `hubSpend`. Route any networked trigger through the `net*` wrappers (`js/net/commands.js`).
- **Effects** are baked into unit fields by `hubApplyChrome` on the host (and solo). Clients **do not** run `hubApplyChrome`; they receive `u.hubHpMul`, `u.hubDmgMul`, `u.armor`, `u.maxHp`, etc. via snapshots — same as today's condo/implant multipliers. Confirm any *new* effect field is in the snapshot packing (`js/net/sync.js`).

## II.10 — UI/UX notes

- Reuse `hubMenuUnitCard` / `hubMenuActionBtn` patterns; show **capacity used/total** as a bar (like CP2077's `used/total`), and refuse installs over budget with a toast.
- Respect `refreshUI()`'s signature-based command rebuild — the slot picker lives in the HUB menu body, not the bottom command palette.
- Art: chrome icons and any clinic interior use the dark steel/charcoal + cyan palette; provide procedural fallbacks (don't assume generated art is present).

## II.11 — Balance notes

Chrome stacks **multiplicatively** on top of career stars (to L30) and Series∞ in the existing `applyVetHp` / `js/units.js:926` chains, so summed contributions can produce runaway veterans. The **Capacity ceiling** and the **madosis overload cost** are the intended counterweights — tune `chromeCapacity` and per-tier magnitudes (Appendix B) against the existing power envelope, and bound the overload's `sanityThreshold` hit (cf. `strainMax:6`). Reborn interactions need care: `scarred` already lowers the threshold; stacking chrome penalties on a reborn unit must not make it unplayable.

## II.12 — Phased implementation roadmap (each phase shippable & save-safe)

1. **P0 — Catalog + recompute.** Add `js/cyberware_data.js` (slots, ~8 implants, tier tables), `hubApplyChrome`, the `chrome`/`capUsed` fields, and `chromeCapacity`. Wire `hubApplyChrome` into roster spawn. No UI yet; verify via console.
2. **P1 — HUB unit-panel UI.** Slot+tier picker on the existing unit panel; capacity bar; `hubSpend` integration; over-budget refusal. Tier gating on `u.stars`.
3. **P2 — Cyberpsychosis layer.** Edgerunner overload → `sanityThreshold` reduction; reborn tie-in; in-mission malfunction reuses the existing breakdown path. Determinism re-verified (`NET.determinismTest`).
4. **P3 — Effect breadth.** Mutually-exclusive OS (active buff) + Arms (pierce/splash/melee) slots; optics/sight. Snapshot-packing audit for any new entity fields.
5. **P4 (Faithful, optional).** Ripperdoc clinic interior; full slot taxonomy; iconic hero chrome; capacity shards as an M3$ sink. (`u.air` legs implants remain out of scope.)

## II.13 — Risks & open questions

1. **Save compat** — primary constraint; covered by the additive design (§II.8), but every new *entity* field needs a save + snapshot check.
2. **Determinism** — sanity reductions applied at install (HUB), not sim; in-mission malfunction must use `simRandom` and skip cosmetic toasts under `_rbReplaying`.
3. **Append-only catalog** — `js/cyberware_data.js` carries a `versions[]` table; saved units reference implants by id; never reorder/delete.
4. **Balance runaway** — capacity ceiling + madosis cost are the counterweights; needs tuning against the live envelope.
5. **Open design questions for the owner:** (a) reborn = *more* capacity-but-steeper-cost, or *less* capacity? (b) is the Edgerunner overload always available, or gated behind a hub facility / campaign beat? (c) should iconic hero chrome be tied to specific heroes (Nino/Rust/etc.) and which? (d) keep legacy `implantLevel` forever, or soft-migrate it?

---

# Part III — The Ripperdoc panel (UI spec)

> Scope: the **install/upgrade/remove screen** itself — layout, the complete UX, and how to render it in STARLEFT's no-build HUD. It realizes the §II.6 "ripperdoc" surface and is the visual centerpiece of the whole feature. It deliberately mirrors Cyberpunk 2077's cyberware screen, with **one defining change: the central figure is the selected unit's live idle sprite animation, not a generic body.**

## III.1 — The reference (CP2077 cyberware screen)

Reference image: `refs/cb_2007_ripperdoc_menu.webp` (Viktor's Clinic). Anatomy of what we are matching:

| Region | CP2077 element | Notes |
|---|---|---|
| **Top-left** | `23 LEVEL` (with a fill bar) + `33 STREET CRED` (green bar) | Player progression — gates which tier the clinic stocks. |
| **Top-center** | tabs `TRADE ‹ CYBERWARE › TRADE` (CYBERWARE active, cyan diamond) | Buy / installed-loadout / sell. |
| **Top-right** | `⛓ 340 / 392` (red, lock glyph) + `€$ 19954` (gold) | **Cyberware Capacity used/total** and **eddies**. |
| **Left column** | `FRONTAL CORTEX`, `OCULAR`, `CIRCULATORY`, `IMMUNE`, `NERVOUS`, `INTEGUMENTARY` — each a red label + an "AVAILABLE ITEMS n" / "NO CYBERWARE TO INSTALL" line + a row of slot tiles | Tiles are filled (implant icon + a small tier corner) or empty (a `+`). |
| **Center** | A glowing orange/red wireframe **body** (V) on a dashed targeting ring, with green nerve-lines and cables routing out to the occupied slots. | **This is the piece we replace with the unit's idle sprite.** |
| **Right column** | `OPERATING SYSTEM`, `SKELETON`, `HANDS`, `ARMS`, `LEGS` — same group format | OS / Arms show a single tile (one-of). |
| **Right card** | `VIKTOR'S CLINIC` vendor card + `€$ 56172` (the ripperdoc's own funds) | Identity of the surgeon. |
| **Bottom-right** | `◉ Close` | Dismiss. |
| **Atmosphere** | near-black bg with faint red vertical scanline texture, crimson section labels, cyan active accents, gold currency, green progress/nerves; beveled slot tiles with corner notches; a technical HUD frame. | This palette is already STARLEFT's house style. |

## III.2 — Design direction

**Aesthetic:** STARLEFT's HUD palette *is* the CP2077 ripperdoc palette — near-black panels, crimson labels, cyan highlights, gold currency, green/purple bars (verified in `css/screens.css` / `css/menu.css`). We do **not** introduce a new look or webfont — we reuse the existing **`GAME_FONT`** display face and the established frame styling so the panel reads as part of the game, not a bolt-on. Art direction stays dark/devastated cyberpunk (never bright); implant icons fall back to glyphs (like `DEF.icon`) until real art exists.

**The one bold divergence — the living figure.** CP2077 shows an abstract anatomical mannequin. STARLEFT shows **the actual veteran being chromed**, idle-animating on the clinic plinth, framed by their own implants. This ties the panel to the game's core attachment loop (named, persistent veterans with dossiers and madosis arcs) — you are operating on *Nino*, not a generic body. It is also cheaper and more on-brand than authoring a bespoke wireframe body.

**Motion philosophy (per the frontend pass):** one well-orchestrated open (staggered slot-group reveal + the figure scaling onto its plinth), then restraint — a slow-rotating targeting ring, the idle sprite's breathing loop, cyan install pulses, and a capacity bar that fills/flashes. High-impact moments, not scattered fidget.

## III.3 — Layout & anatomy

A three-zone grid — **left slot-groups · central living figure · right slot-groups** — under a top stat strip, inside the existing full-bleed `#hubMenuView` overlay.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🩺 RIPPERDOC — "RATCHET"        ★RANK 14 · CLEARANCE EP XI      ✕ Close          │
│ ⛓ CAPACITY ▰▰▰▰▰▱▱▱ 17/36                                  M3$ 4,820           │
├──────────────────────────────────────────────────────────────────────────────┤
│ OPTICS           ┌────┐┌────┐          ╎            OPERATING SYSTEM  (one only)│
│ ▸ 1 to install   │👁³ ││ +  │          ╎  ┌────┐    ▸ 2 to install              │
│                  └────┘└────┘ ╲        ╎  │ ⚡² │    ┌────┐                       │
│                                ╲    ___╎___ └────┘   │ ⚙  │                       │
│ CIRCULATORY      ┌────┐┌────┐   ╲  /  IDLE  \        └────┘                       │
│ ▸ 0 to install   │♥² ││♥³ │    ●─( SPRITE  )──●  ARMS              (one only)    │
│                  └────┘└────┘     \  ANIM  /        ▸ 2 to install              │
│ FRAME            ┌────┐┌────┐    ╱ \__ ___/         ┌────┐                       │
│ ▸ 1 to install   │▦⁴ ││ +  │   ╱  targeting ring   │ +  │                       │
│                  └────┘└────┘  ╱_______╎_________   └────┘                       │
│                                         ╎           LEGS  🔒 (coming soon)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Top stat strip — CP2077 mappings:**

| CP2077 | STARLEFT | Source field |
|---|---|---|
| `23 LEVEL` | `★ RANK n` — the unit's career level | `u.stars` (render via `careerLevelHTML`) |
| `33 STREET CRED` | `CLEARANCE EP n` — campaign progress that gates catalog tier | `CAMPAIGN.nextMapIndex` |
| `340 / 392` capacity | `CAPACITY u/t` red bar | `capUsed` / `chromeCapacity(u)` (§II.5, App. B) |
| `€$ 19954` | `M3$ n` gold | `CAMPAIGN.m3` |
| tabs TRADE/CYBERWARE/TRADE | single **CHROME** view; per-slot catalog opens as a flyout (no sell tab needed v1) | — |
| VIKTOR'S CLINIC card | ripperdoc identity in the header subtitle | new `OFFHOURS.fixedNpcs.ripperdoc` |

**Slot-group arrangement** (the Medium 5-slot model laid out to read like CP2077's flanked body):

- **Left:** OPTICS (2 tiles) · CIRCULATORY (2) · FRAME (2)
- **Right:** OPERATING SYSTEM (1, *one-of*) · ARMS (1, *one-of*) · LEGS (1, **locked** — present but disabled, so the silhouette matches CP2077's slot density and signals the Faithful-phase expansion)

Each group header = a `.train-h` red label + a live "▸ n to install" count (how many catalog items the unit's rank unlocks for that slot that fit remaining capacity).

## III.4 — The central figure (live idle sprite)

**Requirement:** the middle of the panel renders the selected unit's **idle animation**, on a clinic plinth with a slow targeting ring, replacing CP2077's wireframe body.

**Reuse, do not reinvent:**

- The simplest path is already proven: a `<canvas class="train-spr" data-type="…" data-sprite="…">` placed in the menu body is **auto-animated every frame** by `hubMenuTick` → `drawTrainCanvas(cv, type, spriteType, tnow)` (`js/ui.js:783`, `:1069`). `drawTrainCanvas` calls `unitWalk(spriteType||type,'player')` (`js/assets.js:303`) and blits the current frame at `((tnow*4)|0) % frames` — i.e. a ~4 fps idle loop — with an automatic glyph fallback when the sprite sheet isn't loaded yet. **Dropping one larger `.train-spr` canvas in the center gives the living figure with zero new animation code.**
- For the CP2077-style **plinth, targeting ring, and cabling**, use a dedicated `rip-figure` canvas driven from `spec.tick`: clear → draw the rotating dashed ring and the connection lines from each occupied slot tile to the figure → blit the sprite via a local `_blitSprite(ictx, u, px, py, anim, S, fi)` (the offhours pattern, `js/offhours_interior.js:254`; the global `blitFrame` at `js/assets.js:342` is hardwired to the main `ctx`, so copy it). Scale with `unitDrawH(u)` / `UNIT_SPRITE_H` (`js/assets.js:294,313`) so each unit type is sized correctly; heroes already get `HERO_SCALE`.
- Sprite identity: `u.spriteType || u.type` (heroes like `nino`/`rust` resolve to their own sheets; faction recolor via the `owner`/faction arg).

**Recommendation:** ship the panel with the dedicated `rip-figure` canvas (ring + wires + breathing bob) for fidelity; the bare `.train-spr` auto-animate is the fallback/MVP if the wire-routing is deferred.

## III.5 — Slot tiles (the interactive atoms)

A slot tile is a small beveled button, styled off `.train-card`'s frame language (`css/screens.css:465`).

| State | Look | Behavior |
|---|---|---|
| **Empty** | dark tile, centered `+` | click → open the slot's catalog flyout |
| **Filled** | implant icon, **tier superscript** in the corner (¹–⁵), faint cyan rim | click → detail (upgrade / remove); hover → stat tooltip |
| **Upgrade available** | a gold ▲ arrow badge (CP2077's yellow arrow) | click → upgrade to next tier (cost shown) |
| **One-of slot (OS/Arms)** | single tile; installing a different piece replaces the current (confirm) | enforced in the install handler, not the data |
| **Locked (Legs v1)** | dimmed, 🔒, no `+` | tooltip "Unlocks in a later update" |
| **Capacity-blocked** | tile/catalog row dimmed with a red capacity hint | install refused unless Overload is used (§II.5) |

## III.6 — Complete UX flow

**Entry.**
- *Medium (now):* select a HUB veteran → a "CHROME ⛓" command/button → `openRipperdocPanel(u)`.
- *Faithful (later):* walk a unit to a **clinic** POI; `hubUnitArrivedPoi` (`js/hub.js:1256`) routes `kind:'clinic'` → `openRipperdocPanel(u)` (mirrors how bar/club/diner route to `openInterior`).

**Main loop.**
1. Panel opens; top strip shows rank, clearance, capacity bar, M3$. The figure scales onto the plinth; slot groups stagger in.
2. Player clicks a **slot tile** → a **catalog flyout** slides in over that side, listing the implants available for that slot, filtered by `u.stars` (tier gate) and annotated with capacity fit. Each row: name + flavor, **effect delta** ("+18% HP", "armor-piercing"), **tier**, **M3$ cost**, **capacity cost**, and an Install/Upgrade button (`hubMenuActionBtn` handles M3$ affordability dimming, `js/ui.js:885`). Rows that don't fit remaining capacity are dimmed with a "needs +N capacity" hint.
3. Hovering a catalog row shows a **live stat preview** on the figure/stat strip (projected HP/dmg/armor and the projected capacity bar), so the trade-off is legible before committing.
4. **Install:** host-authoritative (`hubCanAct`, `js/hub.js:154`). `hubSpend(m3)` (`:1423`) → set `CAMPAIGN.upgrades[hubUnitKey(u)].chrome[slot] = {id,tier}` → recompute `capUsed` → `hubApplyChrome(u)` → `applyVetHp(u,true)`. A cyan pulse runs on the slot, the connecting wire animates to the figure, the capacity bar ticks up, a `toast()` confirms. The flyout closes; the slot tile is now filled.
5. **Upgrade:** same path, raises `tier`, shows the gold ▲ until maxed; cost per App. B.
6. **Remove:** frees capacity (and the M3$ is not refunded, or a partial refund — owner decision); `hubApplyChrome` re-bakes.

**Edge cases & states.**
- **Over capacity:** install refused with a toast. If the *Edgerunner overload* (§II.5) is enabled for that unit, the button becomes a **hold-to-confirm** that spells out the cost ("OVERLOAD: −N sanity, permanent") in red before applying — never a silent penalty.
- **Co-op client:** the panel is **read-only**; any action toasts "Only the host can operate the clinic" (`hubCanAct`). Effects arrive baked via host snapshots (§II.9).
- **Sprite still loading:** the figure shows the unit glyph fallback (already handled by `drawTrainCanvas`).
- **Reborn unit:** the strip flags reduced capacity / steeper overload (§II.5) so the cautionary-tale framing is visible.
- **Close:** `closeHubMenu()` (cancels the RAF, hides `#hubMenuView`).

## III.7 — Implementation plan

**Shell (recommended): reuse `openHubMenu`, not a canvas interior.** The screen is mostly crisp text + tiles + one figure, which the DOM shell renders sharply and responsively; a full `openInterior` canvas would fight text legibility and re-implement layout. Use a single canvas only for the figure/ring/wires.

```js
function openRipperdocPanel(u){
  openHubMenu({
    id:'ripperdoc', icon:'🩺', title:'RIPPERDOC',
    subtitle: ripperdocName()+' · '+careerLevelHTML(u.stars,false),
    signature: ()=> hubUnitKey(u)+'|'+JSON.stringify(chromeOf(u))+'|'+capUsed(u),  // rebuild body on chrome change
    build: (body)=> buildRipperdocBody(body, u),       // top strip + 3-zone grid + slot groups
    tick:  (body)=> ripperdocTick(body, u),            // draw rip-figure canvas (ring, wires, idle sprite)
  });
}
```

- `buildRipperdocBody` lays out a `.rip-grid` (CSS grid: `left | center | right`), a `.rip-stats` top strip (rank/clearance/capacity bar/M3$), the slot-group columns from `CYBERWARE.slots`, and the center `<canvas class="rip-figure train-spr" data-type data-sprite>`.
- `ripSlotTile(u, slotId, idx)` → tile button per §III.5; `openRipSlotCatalog(u, slotId)` → flyout built from `cyberCatalogFor(slotId, u.stars)`, rows via `hubMenuActionBtn`.
- Install/upgrade/remove go through a `net*` wrapper so solo/host/client stay consistent (§II.9), then `hubApplyChrome` + `applyVetHp`.
- The `signature` rebuilds the body when chrome changes; the canvas keeps animating via the shared `hubMenuTick` `.train-spr` loop, so the figure never stutters during rebuilds.

**Files touched:** `js/ui.js` (panel/flyout/tile builders), `css/screens.css` (`.rip-grid`, `.rip-slot`, `.rip-stats`, `.rip-figure`, `.rip-cap` — reusing palette + `.train-*`/`.sc-btn` styles), `js/cyberware_data.js` (slots + catalog + tier tables, §II.4 / App. A–B), `js/hub.js` (`hubApplyChrome`, capacity helpers, and — Faithful phase — the `clinic` POI route). **No new overlay markup needed** — it lives in the existing `#hubMenuView`.

**Phasing** (folds into the §II.12 roadmap):
- **UI-P0:** static panel — top strip, 3-zone grid, slot tiles reading existing `chrome`, the auto-animated `.train-spr` figure. Read-only.
- **UI-P1:** catalog flyout + install/upgrade/remove wired to `hubApplyChrome`; capacity bar + affordability; toasts.
- **UI-P2:** the `rip-figure` polish (rotating ring, slot→figure cabling, install pulse, breathing bob) + hover stat preview.
- **UI-P3 (Faithful):** clinic POI + ripperdoc NPC identity card; Overload hold-to-confirm; later, sell/remove economy.

## III.8 — Responsive, accessibility & fidelity

- **Responsive:** the `.hub-cols` pattern already collapses multi-column to single-column at ≤860px (`css/screens.css`). On narrow/mobile, stack as **figure on top, slot groups below**; tiles enlarge to ≥44px tap targets.
- **Accessibility:** every tile/row is a real `<button>` (focusable); capacity/affordability states aren't color-only (icons + text: `+`, ▲, 🔒, "needs +N"); the capacity bar carries a text value, not just a fill.
- **Performance:** one canvas + signature-gated DOM rebuilds (no per-frame DOM churn) — respects the `refreshUI()` rule against eager command rebuilds.

**Reference fidelity checklist** (how close to `refs/cb_2007_ripperdoc_menu.webp`):

| CP2077 element | STARLEFT equivalent | v1 |
|---|---|---|
| Level + Street Cred | Rank (`u.stars`) + Clearance (`nextMapIndex`) | ✓ |
| Capacity used/total (red) | `capUsed/chromeCapacity` bar | ✓ |
| Eddies (gold) | M3$ (gold) | ✓ |
| Flanked body-system groups + tiles | 5 slot-groups (left/right) + tier-cornered tiles | ✓ |
| Central wireframe body | **live idle unit sprite on a plinth** | ✓ (the divergence) |
| Cabling slot→body | slot→figure connection lines | ✓ (UI-P2) |
| Vendor (Viktor's Clinic) card | ripperdoc NPC identity | ✓ (header v1, card UI-P3) |
| TRADE/CYBERWARE/TRADE tabs | single CHROME view + per-slot flyout | adapted |
| Close | `closeHubMenu()` | ✓ |

---

# Appendix A — Draft implant catalog (implementation-ready)

Slots (Medium tier; CP2077 systems folded to fit an RTS unit). Two slots are **mutually exclusive** internally — one implant only — faithfully reproducing CP2077's OS and Arms rules.

| STARLEFT slot | Folds CP2077 | Exclusive? | Effect axis |
|---|---|---|---|
| **frame** | Skeleton + Integumentary | no | armor, max HP |
| **circ** | Circulatory + Immune | no | regen, revive, madosis resist |
| **os** | Operating System + Nervous | **yes (one of)** | a "core power" active/triggered buff |
| **arms** | Arms | **yes (one of)** | weapon-arm: damage shape |
| **optics** | Frontal Cortex + Ocular | no | sight, range, damage/crit |

Draft implants (effects shown at **Tier 3**; scale per Appendix B). `+x%` = additive into the relevant multiplier; `armor` is flat (0–1, like `DEF.auditor` 0.25).

| id | slot | name (dark-cyberpunk flavor) | Tier-3 effect | maps to |
|---|---|---|---|---|
| `titanium_bones` | frame | Titanium Lattice | +18% max HP | `u.hubHpMul` |
| `subdermal_armor` | frame | Subdermal Plating | +0.15 armor | `u.armor` |
| `pain_editor` | frame | Pain Editor | +0.10 armor, −regen | `u.armor`, `buff.regenMul` |
| `second_heart` | circ | Second Pump | one-shot revive at 0 HP (per mission) | `u.chromeRevive` |
| `blood_pump` | circ | Blood Pump | +60% out-of-combat regen | `buff.regenMul` |
| `cataresist` | circ | Cataresist Filter | −25% madosis accrual in field | madosis hook |
| `sandevistan` | os | Sandevistan (Reflex) | active: +35% dmg / +speed window, cooldown | `u.buff` + ability |
| `berserk` | os | Berserk (Rage) | active: melee rage, +dmg, dmg-resist, locks ranged | `u.buff` + ability |
| `kerenzikov` | os | Kerenzikov (Reflex) | triggered: brief dmg/evasion spike on taking a hit | `u.buff` |
| `gorilla_arms` | arms | Gorilla Arms | +40% melee dmg, bonus vs buildings | `u.dmg` |
| `mantis_blades` | arms | Mantis Blades | +crit, **armor-piercing** | `u.dmg`, `u.chromePierce` |
| `pls` | arms | Projectile Launch System | adds **splash** | `u.chromeSplash` |
| `kiroshi_optics` | optics | Kiroshi Optics | +sight, +range, +crit | `u.sight`, `u.range`, `u.hubDmgMul` |

**Iconic (hero-bound, story-granted; Faithful phase):** e.g. a unique `os` Sandevistan for a Reflex hero, a unique `arms` piece for Rust — keyed `hero:<id>`, not buyable. (Owner to pick which heroes — §II.13.5c.)

# Appendix B — Capacity & cyberpsychosis tuning numbers (starting values)

All numbers are **starting proposals** to be balanced against the live envelope — not final.

**Capacity:**
- `chromeCapacity(u) = capBase + capPerStar * u.stars`, with `capBase = 6`, `capPerStar = 1` → L1 unit ≈ 7, L15 ≈ 21, L30 ≈ 36. (Mirrors CP2077's level-driven growth in shape, not magnitude.)
- Reborn: `× rebornCapMul = 0.7` **or** full capacity with steeper overload — owner decision (§II.13.5a).
- Hero: `+ heroCapBonus = 4` (the "Technical Ability" analogue — heroes run more chrome).

**Per-implant capacity cost by tier** (parallels `HUB.implantCosts` shape):

| Tier | capacity cost | M3$ cost |
|---|---|---|
| 1 | 2 | 150 |
| 2 | 3 | 300 |
| 3 | 5 | 550 |
| 4 | 7 | 900 |
| 5 | 9 | 1400 |

(OS/Arms "core" implants cost ~1.5× capacity, like CP2077's heavier OS pieces.)

**Effect magnitude by tier** (multiplier examples; linear-ish, tune to taste):

| Tier | HP mul add | dmg mul add | armor add |
|---|---|---|---|
| 1 | +0.06 | +0.06 | +0.05 |
| 2 | +0.12 | +0.12 | +0.10 |
| 3 | +0.18 | +0.18 | +0.15 |
| 4 | +0.24 | +0.24 | +0.20 |
| 5 | +0.30 | +0.30 | +0.25 |

**Edgerunner overload (the cyberpsychosis cost):**
- Allow up to `overloadMax = 6` capacity points over the ceiling.
- Each point over **permanently** lowers the unit's effective sanity threshold by `overloadSanityPerPt = 4%` of its base (max −24% at full overload — comparable to `scarred`'s −30%, deliberately bounded below it).
- Optional HP echo of the perk: also −0.5% max HP per point over.
- Reborn + overload should be capped so a unit can't be pushed below a playable threshold floor.

# Appendix C — CP2077 glossary

- **Eddie (e$ / Eurodollar)** — Cyberpunk 2077's single universal currency, used to buy cyberware, weapons, vehicles, and consumables; cyberware is purchased with eddies while upgrades consume crafting components.
- **Ripperdoc** — An in-fiction back-alley implant surgeon and the game's dedicated cyberware vendor; installs/removes/upgrades implants on the ripperdoc screen. After 2.0 the base-game catalog is unified across clinics.
- **Cyberware Capacity (CWC)** — The global point budget (introduced in 2.0) that every installed implant spends; the binding constraint on how much chrome V can run. Grows mainly by leveling (24 at Lv 1, +3/level, 201 at Lv 60) plus shards and perks.
- **Tier (1 → 5++)** — The 2.0 quality axis that replaced the old Common/Uncommon/Rare/Epic/Legendary rarity ladder. Tier 5 is the highest sold; Tier 5+ and 5++ are reached only by upgrading.
- **Iconic cyberware** — A designation exclusive to Tier 5 pieces with a unique name, lore, and an effect superior to generic Tier 5 cyberware; acquired from quests, world drops, or Dogtown airdrops rather than normal ripperdoc stock.
- **Attunement** — From Tier 3+, an implant is tied to one of the five Attributes (Body/Reflexes/Technical Ability/Intelligence/Cool); the higher that Attribute, the stronger the implant's bonus. A scaling lever, not an install gate.
- **Operating System (OS) slot** — The single 'core superpower' slot holding exactly one mutually exclusive family: Cyberdeck, Sandevistan, or Berserk.
- **Sandevistan** — An Operating System cyberware that slows time for everyone but V for a few seconds on a cooldown.
- **Berserk** — An Operating System cyberware granting a timed melee-rage state that locks out ranged weapons/grenades/items in exchange for melee power and survivability.
- **Cyberdeck** — An Operating System cyberware that enables netrunning — slotting and uploading Quickhacks; defines RAM, Buffer size, and Quickhack slots.
- **Quickhack** — An active, RAM-cost, cooldown-bearing netrunner ability uploaded via a cyberdeck; classes include Combat, Control, Covert, and Ultimate.
- **Edgerunner (perk)** — A Technical Ability perk letting V exceed Cyberware Capacity by up to +50 points at a cost of −0.5% Max Health per point over (−25% at +50), and granting a chance to enter the Fury state. The only sanctioned way past the ceiling.
- **Fury** — A 12-second buff (+10% Damage, +30% Crit Chance, +50% Crit Damage) with a per-kill chance of 0.1% per point of Cyberware Capacity over the limit, tied to the Edgerunner overload.
- **Cyberware Capacity Shard** — A lootable item that permanently and instantly raises Cyberware Capacity; finite (the game stops awarding them once a cap of roughly +60 base / +80 with Phantom Liberty is reached).
- **Cyberpsychosis** — The franchise's metaphor for losing one's humanity to excessive cyberware. A hard mechanic in the tabletop RPG, but in Cyberpunk 2077 a narrative theme only — V is never subject to it.
- **Cyberpsycho Sighting / Psycho Killer** — A side-content questline given by fixer Regina Jones (17 encounters) where V can subdue cyberpsychos non-lethally for therapy; the game's primary diegetic delivery of the humanity theme.
- **Renaissance Punk (perk)** — A Technical Ability perk granting +4 Cyberware Capacity for each Attribute at level 9 or higher (up to +20).
- **All Things Cyber (perk)** — A Technical Ability perk that reduces the Capacity cost of Integumentary and Skeleton cyberware by 20%, effectively granting more headroom.
- **Chrome Compressor** — An Operating System cyberware that adds Cyberware Capacity but occupies the OS slot (forfeiting Cyberdeck/Sandevistan/Berserk). Bonus is source/patch-dependent (Game8 +42; community guides +70); 2.1 increased the bonus and lowered its price.
- **Dogtown** — The Phantom Liberty expansion zone; home to four extra ripperdocs and semi-random 'Airdrop' loot crates that drop several iconic cyberware pieces.
- **Item Components** — Crafting materials consumed (with eddies) to upgrade cyberware tiers; 2.0 simplified crafting to a single component type that converts up 5-to-1, and vendors no longer sell components (obtained by disassembling loot).

# Appendix D — Research methodology, sources, conflicts & gaps

**Method.** A multi-agent web sweep across seven dimensions (slots, capacity, tiers, gating, economy, cyberpsychosis, effect taxonomy). Each dimension was researched, then **independently adversarially re-verified** against ≥2 reputable sources before assembly. Canonical basis: Update **2.0/2.1/2.2**; every quantitative claim is patch-tagged, and where sources disagree the language is hedged rather than asserting a precise number. Source priority: CD Projekt Red official notes → Cyberpunk Fandom & Fextralife wikis → reputable editorial guides (IGN/PC Gamer/Polygon/GameSpot/etc.) → community (only to resolve discrepancies).

## Open conflicts (sources disagree; not silently resolved)

1. Chrome Compressor Capacity bonus: Game8 cites +42 (→328 total); later 2.1/2.2 community guides cite +70 (→~436). The +42 figure is better-confirmed; +70 is single-sourced. Likely a rebalance across versions or differing baseline assumptions — unresolved without official patch-note confirmation.
2. Maximum total Cyberware Capacity: no official CDPR figure exists. Editorial estimates range ~280–330 (base build), 366 (full standard-play accounting, 2.1-era), and ~436 (with Chrome Compressor). Treated as estimates, flagged [patch].
3. Kiroshi 'Cockatrice' Optics crit chance: Fextralife's Tier-5 detail says 25%; Cyberpunk Fandom says 30%; ~30–35% only at 5+/5++. Reported as a conflict rather than a single number.
4. Engineer skill Capacity milestone: most sources place the first +5 at Engineer Rank 10 (with +10 at Rank 30, +15 total); Game Rant places the first +5 at Engineer Level/Rank 5. The Rank 10 reading is used as the better-sourced majority.
5. Ripperdoc count: sources vary — Fextralife ~13, Game8 up to 17 (counting all four Dogtown clinics and unnamed entries), with ~12 base + 4 Dogtown (≈16) as the central reconciliation. Discrepancy is about how Dogtown and duplicate/unnamed clinics are tallied.
6. Jenkins' Tendons burst sprint peak: RPG Site says ~+30% decaying to +10% over 5s; a Fextralife summary cites ~+60% — likely a tier-scaling difference; the +10% floor and 5s window agree.
7. Leeroy Ligament System movement speed: Fextralife +15% vs RPG Site +20% at T5 — likely Tier 5 vs 5+/5++ scaling; reported as a +15–20% band.
8. Second Heart cooldown: variously cited ~240s (confirmed T5), up to ~300s at lower tiers; the revive-to-100%-HP mechanic is consistent but the cooldown is a tier-dependent band.
9. Per-level Cyberware Capacity gain: editorial guides (Gamerant/GameSkinny) state +3/level, but Game8's Capacity page and the official 2.0 notes do not restate a number; +3/level is the better-sourced but not officially confirmed figure.
10. RPG Site is quoted in some drafts as stating the OS mutual-exclusion sentence verbatim; on fetch the page describes the OS as a 'core superpower' and lists the three families but does not contain that exact sentence. The mechanic itself is confirmed by Game8 and multiple guides.

## Known gaps (could not be pinned to an authoritative source this pass)

1. No official CD PROJEKT RED patch note numerically states the base Capacity formula (24 at L1, +3/level, 201 at L60); it was confirmed via a Nexus mod that modifies the vanilla value plus editorial guides, not a primary CDPR source.
2. Exact per-implant Cyberware Capacity point costs (and how cost scales by tier) are not enumerated from a single authoritative table; only a subset is confirmed (e.g. Second Heart 30, Militech Berserk 35, Reinforced Tendons 8, Fortified Ankles 6, Lynx Paws 5, Blood Pump 15, Biomonitor 14).
3. Exact eddie + component costs per upgrade step (e.g. Tier 3 → 4, or Tier 5 → 5+ → 5++) are item-specific and not standardized across sources; guides give only ballpark figures and the 5-to-1 conversion rule.
4. Whether 2.1 or 2.2 altered the base per-level Capacity formula is unconfirmed; cross-patch stability is inferred from an absence of reported change rather than an explicit 'no change' statement, and the full official 2.2 patch notes could not be fetched.
5. Precise numeric stat deltas between tiers for a representative implant (e.g. exact armor/damage at T1 vs T3 vs T5) are not given; sources describe the count of bonuses and attunement qualitatively. Most quoted figures are Tier 5/Legendary values.
6. The exact 1.x Street Cred thresholds for rarity variants (~20 Rare / 25 Epic / 45 Legendary) are single-sourced and lower-confidence.
7. Tabletop Humanity/Empathy details rely on a WebSearch summary because the Cyberpunk Fandom Empathy and Cyberpsychosis pages returned HTTP 403; exact per-implant Humanity Cost tables were not captured.
8. Several specific effect values are cited but unverified this pass (Cockatrice crit %, Camillo RAM ~23%, Self-ICE 45s/+2 RAM, Mechatronic Core ~+35%, Bioconductor ~35%, cyberdeck RAM/Buffer/slot ladder, Reinforced Tendons per-Reflexes attunement, low/mid-tier eddie prices, Second Heart lower-tier cooldowns).
9. Full enumeration of Immune System and Nervous System slot contents (beyond Shock-n-Awe, Kerenzikov, Reflex Tuner) is only partial; some item names did not render in fetched pages.
10. No on-the-record CDPR developer quote was located explaining the decision to cut a Humanity/cyberpsychosis player mechanic; the 'preserve player agency' rationale is reported secondhand by editorial outlets.

## Sources

- https://cyberpunk2077.wiki.fextralife.com/Cyberware
- https://cyberpunk2077.wiki.fextralife.com/Frontal+Cortex
- https://cyberpunk2077.wiki.fextralife.com/Immune+System
- https://cyberpunk2077.wiki.fextralife.com/Operating+System
- https://cyberpunk2077.wiki.fextralife.com/Kiroshi+Optics+Mk.2
- https://cyberpunk2077.wiki.fextralife.com/BioMonitor
- https://cyberpunk2077.wiki.fextralife.com/Stats
- https://cyberpunk2077.wiki.fextralife.com/Kerenzikov
- https://cyberpunk2077.wiki.fextralife.com/Ripperdocs
- https://cyberpunk2077.wiki.fextralife.com/Edgerunner
- https://cyberpunk2077.wiki.fextralife.com/Psycho+Killer
- https://cyberpunk2077.wiki.fextralife.com/Edgerunners+Update+(Patch+1.6)
- https://cyberpunk2077.wiki.fextralife.com/Legs+Cyberware
- https://cyberpunk2077.wiki.fextralife.com/Arms+Cyberware
- https://cyberpunk2077.wiki.fextralife.com/Circulatory+System
- https://cyberpunk2077.wiki.fextralife.com/Integumentary+System
- https://www.rpgsite.net/feature/10602-cyberpunk-2077-21-cyberware-list-best-cyberware-where-to-get-legendary-cyberware-in-phantom-liberty
- https://www.rpgsite.net/feature/10592-cyberpunk-2077-20-charge-jump-double-jump-all-leg-cyberware-compared
- https://www.rpgsite.net/guide/15222-the-best-berserk-in-cyberpunk-2077-20-lets-you-hulk-out
- https://game8.co/games/Cyberpunk-2077/archives/Cyberware-Overhaul
- https://game8.co/games/Cyberpunk-2077/archives/Cyberware-Capacity-Limit
- https://game8.co/games/Cyberpunk-2077/archives/Cyberware
- https://game8.co/games/Cyberpunk-2077/archives/Perks-Driver-Update
- https://game8.co/games/Cyberpunk-2077/archives/Perks-Edgerunner
- https://game8.co/games/Cyberpunk-2077/archives/Cyberware-Second-Heart
- https://game8.co/games/Cyberpunk-2077/archives/Ripperdoc-Locations-and-Cyberware-List
- https://game8.co/games/Cyberpunk-2077/archives/Relics
- https://game8.co/games/Cyberpunk-2077/archives/Clothing-Davids-Jacket
- https://game8.co/games/Cyberpunk-2077/archives/314205
- https://game8.co/games/Cyberpunk-2077/archives/427122
- https://www.cyberpunk.net/en/news/49597/update-2-1-patch-notes
- https://www.cyberpunk.net/en/news/49129/whats-coming-in-2-0-cyberware
- https://www.cyberpunk.net/en/news/49060/update-2-0
- https://www.cyberpunk.net/en/news/51028/update-2-2-is-live
- https://www.cyberpunk.net/us/en/update-2.2
- https://screenrant.com/cyberpunk-2077-increase-cyberware-capacity/
- https://screenrant.com/cyberpunk-2077-cyberpsychosis-2-0-update-cyberware/
- https://www.sportskeeda.com/esports/cyberpunk-2077-phantom-liberty-2-0-guide-how-increase-cyberware-capacity
- https://sportskeeda.com/esports/cyberpunk-2077-phantom-liberty-2-0-all-engineer-skill-progression-levels-rewards
- https://www.sportskeeda.com/esports/cyberpunk-2077-phantom-liberty-2-0-militech-apogee-sandevistan-how-get-stat-bonuses
- https://www.gamerguides.com/cyberpunk-2077/guide/cyberware-and-armor/cyberware/armor-and-cyberware-in-cyberpunk-patch-2-0
- https://gamerant.com/cyberpunk-2077-increase-cyberware-capacity-shard-location-where/
- https://gamerant.com/cyberpunk-2077-legendary-ballistic-coprocessor-guide-tier-5-ripperdoc-upgrade/
- https://gamerant.com/cyberpunk-2077-maxtac-mantis-blades/
- https://gamerant.com/cyberpunk-2077-best-ripperdoc-upgrades-ranked/
- https://gamerant.com/cyberpunk-2077-2-0-best-cyberdeck-get-how-location-netrunner/
- https://eip.gg/cyberpunk-2077/guides/ocular-system-cyberpunk-2077-cyberware/
- https://eip.gg/cyberpunk-2077/guides/operating-system-cyberpunk-2077-cyberware/
- https://kotaku.com/cyberpunk-2077-update-2-0-patch-notes-skills-cyberware-1850861309
- https://www.gameshub.com/news/news/cyberpunk-2077-update-2-0-patch-notes-2629765/
- https://prodigygamers.com/2026/05/23/cyberpunk-2077-cyberware-capacity-guide-how-to-max-out-your-chrome/
- https://www.cyberpunk2077mod.com/more-cyberware-capacity-per-level/
- https://www.nexusmods.com/cyberpunk2077/mods/10276
- https://www.gameslearningsociety.org/wiki/what-is-the-max-cyberware-capacity-in-cyberpunk/
- https://www.shacknews.com/article/137236/how-to-increase-cyberware-capacity-cyberpunk-2077
- https://playerassist.com/what-is-the-maximum-cyberware-capacity-in-cyberpunk-2077-answered/
- https://cyberpunk.fandom.com/wiki/Cyberpunk_2077_Cyberware
- https://cyberpunk.fandom.com/wiki/Driver_Update
- https://cyberpunk.fandom.com/wiki/MaxTac_Mantis_Blades
- https://cyberpunk.fandom.com/wiki/Cyberware_Capacity_Shard
- https://cyberpunk.fandom.com/wiki/Cyberpunk_2077_Stats
- https://cyberpunk.fandom.com/wiki/Empathy_(stat)
- https://cyberpunk.fandom.com/wiki/Adam_Smasher
- https://cyberpunk.fandom.com/wiki/Cyberpsychosis
- https://cyberpunk.fandom.com/wiki/Edgerunner_(perk)
- https://cyberpunk.fandom.com/wiki/Militech_Apogee
- https://cyberpunk.fandom.com/wiki/Kiroshi_Cockatrice_Optics
- https://cyberpunk.fandom.com/wiki/Sandevistan
- https://www.thegamer.com/cyberpunk-2077-iconic-cyberware-phantom-liberty-guide/
- https://www.thegamer.com/cyberpunk-2077-phantom-liberty-maxtac-mantis-blades/
- https://www.thegamer.com/cyberpunk-2077-mod-humanity-cyberpsychosis/
- https://www.exitlag.com/blog/cyberpunk-2077-update-2-2/
- https://www.escapistmagazine.com/all-2-0-patch-notes-cyberpunk-2077/
- https://gamespace.com/all-articles/news/cyberpunk-2077-received-massive-patch-2-2/
- https://support.cdprojektred.com/en/cyberpunk/pc/gameplay/issue/2593/item-tiers-in-loot-and-vendors
- https://www.gosunoob.com/cyberpunk-2077/2-0-crafting-explained/
- https://www.gosunoob.com/cyberpunk-2077/send-information-to-regina-cyberpunk-cyberpsycho-sightings/
- https://www.gosunoob.com/cyberpunk-2077/best-sandevistan/
- https://progameguides.com/cyberpunk-2077/all-cyberware-changes-in-cyberpunk-2077-2-0/
- https://progameguides.com/cyberpunk-2077/how-cyberpsychosis-works-in-cyberpunk-2077-2-0/
- https://steamcommunity.com/sharedfiles/filedetails/?id=3462738566
- https://vulkk.com/2023/09/21/cyberpunk-2077-update-2-0-breakdown-of-all-major-changes-and-new-features/
- https://segmentnext.com/cyberpunk-2077-cyberpsycho-sightings-locations/
- https://www.peliplat.com/en/article/10031427/david-martinez-the-hero-who-was-never-meant-to-be-cyberpunk-edgerunners
- https://simplyputpsych.co.uk/gaming-psych/the-tragic-descent-of-david-martinez
- https://comicbook.com/gaming/news/cyberpunk-2077-patch-notes-edgerunners-update/
- https://twinfinite.net/guides/all-edgerunners-perks-cyberpunk-2077-2-0-update/
- https://www.pcgamer.com/cyberpunk-2077-davids-jacket-edgerunners/
- https://www.pcgamer.com/cyberpunk-2077-rebecca-shotgun-guts/
- https://gameranx.com/features/id/368640/article/cyberpunk-2077-where-to-find-rebeccas-shotgun-guts-shotgun-location/
- https://www.gameskinny.com/tips/cyberpunk-2077-how-to-increase-cyberware-capacity-in-2-0-phantom-liberty/
- https://www.ggrecon.com/guides/cyberpunk-2077-2-0-update-changes/
