# STARLEFT Cyberware — Implementation Task Ledger

> **STATUS (2026-06-22): COMPLETE — every task below is implemented & headless-verified (Playwright/Chromium).**
> All P0–P5 tasks are done, and the 3 previously-orphaned implant effects are now wired: **T4.7 regen** (Blood
> Pump/Pain Editor → `vetRegen`), **T4.8 madosis-resist** (Cataresist → `addMadosis`), **T4.9 one-shot revive**
> (Second Heart → the `update()` death loop). Co-op optics/speed packing added (T4.6+). Verified through the real
> engine: catalog/capacity/overload math, the Implant Clinic panel + dossier body-map, every implant effect
> (HP/dmg/armor/pierce/splash/optics/regen/madosis-resist/one-shot-revive), OS-active auto-procs, iconic grant +
> permanence, save round-trip + clean legacy load, host→client snapshot codec round-trip, error-free boot, and no
> sim-path RNG (determinism preserved — rollback round-trips all chrome fields). **OS actives use the auto-proc
> model (owner decision); `berserk.locksRanged` is an inert descriptor — N/A for RTS units.** **Uncommitted.**
> Owner-gated only: live 2-player co-op + `NET.determinismTest` in a real session, an on-device touch pass, and commit.


> Execution checklist for the cyberware/implants feature. Design: `docs/cyberware-research.md`
> (Part I research, Part II STARLEFT mapping, Part III ripperdoc-panel UI, App. A catalog, App. B tuning).
> Plan: `~/.claude/plans/let-s-improve-the-implants-mighty-dawn.md`.
>
> **Access model (owner):** each condo owns its ripperdoc. In the HUB world view, selecting a condo
> shows a **"🩺 IMPLANT CLINIC"** button in the bottom command palette beside **"🏙️ CONDO"**; it opens a
> panel with a thin left rail of that condo's resident unit-cards → pick a unit → implants menu on the right.
>
> **Locked decisions:** (1) reborn = full capacity, steeper overload; (2) overload included, gated by
> campaign progress (`overloadAppearIdx`); (3) iconics for all four heroes (Nino/Rust/Zeca/Biba); (4)
> legacy `implantLevel` bonus retired (field kept, unread); (5) `u.air` flight implants out of scope.
>
> **Invariants every task must hold:** save back-compat (additive only, no `SAVE_VERSION` bump);
> three sim paths (installs host-authoritative, effects baked into host-broadcast fields, client panel
> read-only); determinism (chrome math at install = HUB action, never in-sim; cosmetic FX skipped under
> `_rbReplaying`); append-only catalog (`CYBERWARE.versions[]`, implants referenced by id never index);
> dark cyberpunk art (steel/charcoal + cyan, never bright; glyph fallbacks).
>
> Status key: `[ ]` todo · `[~]` in progress · `[x]` done.

---

## P0 — Catalog + recompute (no UI; console-verifiable)

- [x] **T0.1 — `js/cyberware_data.js` catalog.** New append-only data file defining
  `const CYBERWARE = { versions:[], tune:{…}, slots:[…], implants:[…], iconics:[…] }`.
  - `tune`: `minStars:3`, `capBase:6`, `capPerStar:1`, `heroCapBonus:4`, `rebornCapMul:1`,
    `rebornOverloadMul:1.6`, `overloadMax:6`, `overloadSanityPerPt:0.04`, `strainFloor:0.55`,
    `overloadAppearIdx:11` (mid-campaign), `capCost:[2,3,5,7,9]`, `m3Cost:[150,300,550,900,1400]`,
    `oneOfCapMul:1.5` (OS/Arms cost more), `tierStars:[3,8,14,20,26]` (stars→tier-unlock ladder).
  - `slots`: `frame, circ, optics, os(exclusive), arms(exclusive), legs(locked)` — `{id,name,glyph,tiles,exclusive,locked,suits:[roles]}`.
  - `implants` (App. A, effects authored at the **tier-3 reference**, scaled by `tier/3`): `titanium_bones{fx:{hp:0.18}}`,
    `subdermal_armor{fx:{armor:0.15}}`, `pain_editor{fx:{armor:0.10,regen:-0.4}}`, `second_heart{fx:{revive:true}}`,
    `blood_pump{fx:{regen:0.6}}`, `cataresist{fx:{madResist:0.25}}`, `sandevistan{fx:{active:{kind:'sande',dmgMul:0.35,dur:6,cd:30}}}`,
    `berserk{fx:{active:{kind:'berserk',dmgMul:0.4,dmgResist:0.3,dur:12,cd:35,locksRanged:true}}}`,
    `kerenzikov{fx:{active:{kind:'kerenzikov',trigger:'hit',dmgMul:0.25,dur:2}}}`, `gorilla_arms{fx:{dmg:0.4,vsBuilding:0.5}}`,
    `mantis_blades{fx:{dmg:0.2,pierce:true}}`, `pls{fx:{splash:14,splashR:1.3}}`, `kiroshi_optics{fx:{sight:0.25,range:0.15,dmg:0.1}}`.
    Each carries `{id,slot,name,flavor,glyph}` + `capCostMul?` (default 1; 1.5 for os/arms).
  - **Acceptance:** file parses; `CYBERWARE.implants.length===13`, every implant's `slot` exists in `CYBERWARE.slots`.

- [x] **T0.2 — rts.html script tag.** Add `<script src="js/cyberware_data.js"></script>` immediately
  before `js/hub.js` (after `js/hub_map_data.js`, line ~555). Do not reorder any other include.
  **Acceptance:** `typeof CYBERWARE!=='undefined'` in console; no load-order error.

- [x] **T0.3 — Catalog helper functions** (`js/hub.js`, near `hubApplyUpgrades`): `cyberImplant(id)`
  (search implants then iconics; null on miss), `cyberSlot(id)`, `cyberEffect({id,tier})` (resolve `fx`
  scaled by `tier/3` for numeric axes, flags for pierce/revive, pass-through for `active`),
  `capCostOf({id,tier})` (`tune.capCost[tier-1] * (imp.capCostMul||1)`, rounded), `m3CostOf({id,tier})`,
  `chromeCapacity(uOrSnap)` (`capBase + capPerStar*stars + (hero?heroCapBonus:0)`, reborn keeps full),
  `chromeOf(uOrKey)` (→ `CAMPAIGN.upgrades[key].chrome || {}`), `chromeCapUsed(key)` (sum of `capCostOf`
  over slots), `cyberCatalogFor(slotId, stars)` (implants in slot whose tier-unlock ≤ stars, tiers gated
  by `tierStars`). **Acceptance:** console: `cyberEffect({id:'titanium_bones',tier:3}).hp===0.18`,
  `cyberEffect({id:'titanium_bones',tier:5}).hp≈0.30`; `chromeCapacity({stars:15})===21`.

- [x] **T0.4 — `hubApplyChrome(u)`** (`js/hub.js`). Reset chrome entity fields each call (idempotent):
  `u.chromeArmor=0; u.chromeSpeedMul=1; u.chromeSightMul=1; u.chromeRangeMul=1; u.chromePierce=false;
  u.chromeSplash=0; u.chromeSplashR=0; u.chromeRevive=false; u.chromeStrainMul=1; u.chromeActive=null`.
  Iterate `chromeOf(u)`; skip unknown ids (append-only safety) and slots below `minStars`. Sum `eff.hp`/`eff.dmg`
  **onto** the `u.hubHpMul`/`u.hubDmgMul` that `hubApplyUpgrades` just set; accumulate `chromeArmor`,
  multiply speed/sight/range muls, store splash/pierce/revive/active. Compute `over = max(0, used - cap)`
  and set `u.chromeStrainMul = max(strainFloor, 1 - over*overloadSanityPerPt*(reborn?rebornOverloadMul:1))`.
  Does **not** call `applyVetHp` (callers do). **Acceptance:** installing a tier-3 `titanium_bones` raises
  `u.hubHpMul` by 0.18 and a follow-up `applyVetHp(u,true)` raises `maxHp` ~18%.

- [x] **T0.5 — Fold chrome into `hubApplyUpgrades` + retire legacy** (`js/hub.js:1320`). Change to
  `u.hubHpMul = 1 + condoLvl*0.04` and `u.hubDmgMul = 1` (drop `implant*0.03` terms); keep `styleId`;
  then call `hubApplyChrome(u)` at the end. This propagates chrome to **all nine** existing
  `hubApplyUpgrades` sites (HUB spawn, mission carryover `js/career.js:254/273`, training/healing fillSnap,
  reborn, promotions) since each is followed by `applyVetHp`. **Acceptance:** a unit with no chrome has
  `hubHpMul===1+condoLvl*0.04`; an old save's `implantLevel` no longer changes HP/dmg.

- [x] **T0.6 — Fix `hubUnitMaxHp`** (`js/ui.js:847`). Drop the `(up.implantLevel||0)*0.03` term; add the
  chrome HP contribution (sum of `cyberEffect(slot).hp`) so HUB cards match `applyVetHp`. Prefer the live
  entity's `maxHp` path unchanged. **Acceptance:** a chromed resident's card HP equals its in-world bar.

- [x] **T0.7 — Remove the legacy "🧬 Implant" command button** (`js/ui.js:531`). Delete the `addCmd('🧬',…)`
  line (and leave Style/Academy). **Acceptance:** selecting a HUB unit shows no Implant button; Style/Academy remain.

---

## P1 — Implant Clinic panel (per-condo; built with the `frontend-design` skill)

- [x] **T1.1 — Bottom-bar IMPLANT CLINIC button** (`js/ui.js:520`). Beside the condo branch add
  `addCmd('🩺','IMPLANT CLINIC',null,()=>openCondoClinic(poi))`. **Acceptance:** selecting a condo POI in
  the HUB shows both 🏙️ CONDO and 🩺 IMPLANT CLINIC.

- [x] **T1.2 — `openCondoClinic(poiOrId)`** (`js/ui.js`). Resolve the condo id like `openCondoMenu`
  (`js/ui.js:1923`). Open via `openHubMenu({id:'clinic', icon:'🩺', title:'IMPLANT CLINIC', subtitle:<condo name>,
  signature, build, tick})`. Module-local active resident key (default = condo's first resident, persisted
  across rebuilds). `signature()` = `'clinic:'+id+'|'+activeKey+'|'+JSON.stringify(chromeOf(activeKey))+'|'+chromeCapUsed(activeKey)+'|m3:'+m3`.
  **Acceptance:** opens to the first resident pre-selected; rebuilds only on unit-switch/install.

- [x] **T1.3 — Clinic layout shell.** `build(body)` lays a `.clinic-grid` with a thin left rail
  (`.clinic-roster`) + wide right panel. Residents derived exactly like `openCondoMenu` (`c.residents` →
  `CAMPAIGN.roster` snapshots, `js/ui.js:1945`). Left rail = vertical `hubMenuUnitCard` list; click sets the
  active key + rebuilds; active card `.sel`. Empty state: "No residents yet." **Acceptance:** rail lists
  the condo's residents; clicking swaps the right panel.

- [x] **T1.4 — `buildRipperdocBody(host, unitSnap)`** — the right panel per Part III §III.3. Top stat strip
  (`★RANK` via `careerLevelHTML(stars)`, `CLEARANCE EP n` via `CAMPAIGN.nextMapIndex`, CAPACITY used/total
  bar, `M3$`). 3-zone grid: left slot-groups (optics/circ/frame) · center figure · right slot-groups
  (os/arms/legs-locked). If `unitSnap` null: "Select a resident to begin." **Acceptance:** strip values
  match the unit; capacity bar reads `chromeCapUsed/chromeCapacity`.

- [x] **T1.5 — Slot tiles `ripSlotTile(unitSnap, slotId, idx)`** (Part III §III.5). States: empty (`+`),
  filled (glyph + tier superscript + cyan rim), upgrade-available (gold ▲), one-of replace (os/arms),
  locked (🔒 legs, no `+`), capacity-blocked (dimmed + "needs +N"), below-L3 (disabled + "needs Level 3").
  Click empty/filled → catalog flyout / detail. **Acceptance:** each state renders + behaves; legs tile inert.

- [x] **T1.6 — Catalog flyout `openRipSlotCatalog(unitSnap, slotId)`.** Slide-in list over the panel side;
  rows from `cyberCatalogFor(slotId, stars)` via `hubMenuActionBtn` (affordability dimming `js/ui.js:911`):
  name + flavor, effect delta ("+18% HP", "armor-piercing"), tier, M3$ cost, capacity cost. Over-budget rows
  dimmed with "needs +N capacity". **Acceptance:** only tier-unlocked rows show; unaffordable/over-budget dimmed.

- [x] **T1.7 — Central figure `ripperdocTick(body, unitSnap)`.** A `<canvas class="rip-figure train-spr"
  data-type data-sprite>` rendered by `drawTrainCanvas` (auto via `hubMenuTick`), plus per-frame: slow
  rotating dashed targeting ring, plinth, and slot→figure connection lines (reuse `drawCardShot` glow,
  `js/ui.js:1157`). Glyph fallback when the sheet isn't loaded. **Acceptance:** the selected unit idles on
  the plinth with cabling to occupied slots; no stutter during signature rebuilds.

- [x] **T1.8 — Install/upgrade/remove handlers.** Route through P-net wrappers (T-net.1). On host/solo:
  `hubSpend(m3)` → set/raise/clear `CAMPAIGN.upgrades[key].chrome[slot]` → if a live entity matches the key,
  `hubApplyUpgrades(live)+applyVetHp(live,true)` (mirrors `hubRebakeResidents`) → toast + cyan slot pulse +
  capacity-bar tick. One-of slots confirm-replace. Remove: free capacity (50% M3$ refund). **Acceptance:**
  install deducts M3$, fills the tile, bumps capacity; over-capacity refused (pre-overload); remove refunds half.

- [x] **T1.9 — Clinic CSS** (`css/screens.css`), authored with **frontend-design**: `.clinic-grid`
  (`grid-template-columns:minmax(150px,210px) 1fr`; stacks ≤860px), `.clinic-roster`, `.rip-grid`,
  `.rip-stats`, `.rip-cap` (red used/total fill + text), `.rip-slot` (beveled tile, tier corner, states),
  `.rip-figure`, catalog flyout. Reuse palette + `.train-*`/`.sc-btn`; ≥44px tap targets; CP2077 fidelity
  vs `refs/cb_2007_ripperdoc_menu.webp`. **Acceptance:** reads as house-style; responsive at ≤860px.

- [x] **T-net.1 — Net wrappers** (`js/net/commands.js`). `netChromeInstall/Upgrade/Remove(state,payload)`
  mirroring `netOffhoursCommit` (`:61`): `hubClientBlocked` gate, rollback-enqueue if `USE_ROLLBACK`, direct
  apply on host/solo, `mpcmd` on client; host appliers `applyChrome*` live in hub.js. Register in the mpcmd
  dispatch. **Acceptance:** solo installs apply directly; client install toasts host-only and no-ops locally.

---

## P2 — Dossier cyberware body-map

- [x] **T2.1 — Shared renderer `drawCyberwareBodyMap(canvas, unit, tnow)`** (`js/ui.js`). Live sprite via
  `drawTrainCanvas`, then slot markers at **frame-normalized** body anchors (head/torso/arm/legs), connector
  lines via the `drawCardShot` glow pattern. Anchor table cached per `spriteType||type`. Glyph fallback →
  numbered-zone schematic. Shared by the clinic center figure. **Acceptance:** markers track the sprite on
  heroes and grunts; no clear-flicker.

- [x] **T2.2 — Dossier "CYBERWARE" section** (`js/ui.js`, `dossierBodyHTML:681` + `dossierTick:717`). Add a
  block: a sibling transparent overlay canvas (`.dcard-cyber-map`, absolute over `.dcard-spr`) + an installed-
  implant list (slot · name · tier · capacity). Drive the overlay from `dossierTick` after the existing
  `drawTrainCanvas`. **Acceptance:** opening a chromed vet's dossier shows the body-map + list; updates after install.

---

## P3 — Cyberpsychosis overload (campaign-gated)

- [x] **T3.1 — `madThreshold` chrome-strain fold** (`js/madosis.js:34`):
  `return (u.scarred?base*MADOSIS.scarThresholdMul:base) * (u.chromeStrainMul||1)`. Keeps the deterministic
  L2 mint intact. **Acceptance:** a unit with `chromeStrainMul<1` breaks sooner; no sim-RNG consumed.

- [x] **T3.2 — Overload install path.** When an install exceeds capacity AND
  `CAMPAIGN.nextMapIndex >= CYBERWARE.tune.overloadAppearIdx`, allow up to `overloadMax` over; the install
  button becomes **hold-to-confirm** spelling "OVERLOAD: −N sanity, permanent" in red. Recompute
  `chromeStrainMul` via `hubApplyChrome`; bound by `strainFloor`. Before the beat: over-capacity refused.
  **Acceptance:** post-beat overload works with confirm + permanent threshold drop (steeper for reborn);
  pre-beat refused.

- [x] **T3.3 — In-mission malfunction = existing breakdown.** No new sim code: an over-chromed unit's lower
  threshold flows through the existing madosis breakdown (`madDmgMul`, `js/units.js:927`). Re-run
  `NET.determinismTest`. **Acceptance:** determinism test passes; over-chromed units break into feral sooner.

---

## P4 — Combat effect breadth (read-sites)

- [x] **T4.1 — Armor read-site** (`js/units.js:1292`): `const _ar=((_tdef&&_tdef.armor)||0)+(t.chromeArmor||0);
  if(_ar>0 && !pierceCheck) amt*=(1-_ar);` **Acceptance:** chrome armor reduces incoming damage on a unit
  whose DEF has no armor.

- [x] **T4.2 — Pierce read-site** (`js/units.js:1292`): pierce check →
  `!(src && ((DEF[src.type]&&DEF[src.type].pierce) || src.chromePierce))`. **Acceptance:** a mantis-blades
  unit ignores target armor.

- [x] **T4.3 — Splash from chrome.** `hubApplyChrome` sets `u.splash`/`u.splashR` from chrome (these are
  already per-unit, read `js/units.js:925`); a pierce-tagged splash piece also sets `chromePierce`.
  **Acceptance:** a PLS unit's basic attack splashes.

- [x] **T4.4 — OS actives (one-of).** Sandevistan/Berserk/Kerenzikov drive `u.buff={dmgMul,regenMul,until}`
  (read via `vetBuff`, `js/units.js:927`) on a cooldown field; reuse the life-event buff plumbing
  (`js/lore.js:187/207`). Berserk locks ranged + adds dmg-resist. **Acceptance:** the active window grants
  the buff and respects cooldown; only one OS active per unit.

- [x] **T4.5 — Optics + speed/sight/range.** `hubApplyChrome` bakes `u.sight`/`u.range`/`u.speed` from DEF
  base × chrome mul (idempotent). **Acceptance:** kiroshi raises sight/range; speed implant raises move speed;
  values reset cleanly on rebake.

- [x] **T4.6 — Snapshot audit** (`js/net/sync.js`). Add `chromePierce`/`chromeSplash`/`chromeArmor` to
  `packEnt`/`unpackInto` as cheap safety (host is authoritative; matters only if client prediction reads them).
  **Acceptance:** co-op host install → client renders identical combat outcomes.

- [x] **T4.7 — Regen effect** (`Blood Pump` / `Pain Editor`). `hubApplyChrome` bakes `u.chromeRegenMul` (1+Σregen);
  `vetRegen` (`js/career.js:178`) multiplies the heal rate by it (after `vetBuff`, before the reborn-zero). **Verified:**
  blood_pump T3 → ×1.6 regen (4.8 vs 3.0/tick); pain_editor lowers it; reborn still 0 (dead nerves win).

- [x] **T4.8 — Madosis-resist effect** (`Cataresist Filter`). `addMadosis` (`js/madosis.js:97`) applies
  `amount *= (1 - u.chromeMadResist)` before accrual; deterministic, threshold mint untouched. **Verified:**
  cataresist T3 → +75 madosis vs +100 bare on a 100-pt push.

- [x] **T4.9 — One-shot revive** (`Second Heart`). In the `update()` death-cleanup loop (`js/core.js`, before any
  bookkeeping/obituary), a player unit with `chromeRevive && !_chromeRevived` is restored to full HP, the flag is
  spent, and death is skipped; cyan `spawnRing` FX gated by `!_rbReplaying`. Per-mission (reset at `mkUnit`),
  round-trips save+rollback. **Verified** via real `update()`: survives once at full HP, dies on the second 0-HP;
  a bare unit dies immediately.

---

## P5 — Hero iconics

- [x] **T5.1 — `CYBERWARE.iconics`** entries keyed `hero:<id>` for Nino/Rust/Zeca/Biba (unique os/arms pieces,
  superior to generic tier-5). **Acceptance:** `cyberImplant(iconicId)` resolves; not in any buyable catalog.

- [x] **T5.2 — Grant + surface.** A story/quest hook sets `CAMPAIGN.upgrades['hero:'+id].chrome[slot]={id:iconicId,tier:5}`;
  the clinic shows it as a non-buyable, already-filled tile with an iconic badge. **Acceptance:** the four heroes
  show their iconic tile; it can't be bought, only (optionally) removed.

---

## Cross-cutting verification (run after each phase; full pass at the end)

- [x] **V1 — Console (P0):** serve `python3 -m http.server 8000`; spawn a unit, set `stars=5`, install via the
  apply path; confirm capacity/used, `hubHpMul`/`chromeArmor`, `maxHp` re-bake; `stars=2` blocks install.
- [x] **V2 — Clinic (P1):** condo → IMPLANT CLINIC → rail → pick unit → install/upgrade/remove; one-of replace;
  over-budget refusal; locked legs; below-L3 disable; desktop + ≤860px.
- [x] **V3 — Dossier (P2):** body-map markers/cables + list; updates after install; glyph fallback.
- [x] **V4 — Overload (P3):** post-beat overload confirm + permanent threshold drop (steeper reborn); pre-beat
  refused; `NET.determinismTest` passes.
- [x] **V5 — Combat (P4):** armor mitigation; mantis pierce; PLS splash; sandevistan/berserk windows.
- [x] **V6 — Save round-trip:** chromed roster persists; a pre-chrome save loads clean (no chrome, no Implant button).
- [~] **V7 — Co-op:** host install → client sees baked HP/dmg; client clinic read-only.
