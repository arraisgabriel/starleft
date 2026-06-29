# Episode XVI — THE SEVERANCE PACKAGE — build tasks

Rework of Ep XVI into a hero-escape episode (Nino/Rust/Biba shot down → fight left across a 25:9
jungle stripe → harvest memory chips from gory corpses → Tusk-is-a-cyborg reveal → raise the
left-edge HQ → TO BE CONTINUED). Full design + rationale: `~/.claude/plans/episode-xvi-the-abundant-reef.md`.

Locked decisions: EX-TERMINATOR = escapable **pursuer** (no `cfg.villain`); crash transition fires
**after 15.5 THE NON-COMPETE**; escape feel = **running battle**.

## Phase 0 — scaffolding
- [x] **T0.1** Create this tasks doc.

## Phase 1 — engine: hero-escape start (no HQ, no instant-loss)
- [x] **T1.1** `cfg.heroEscape` in `js/map.js` (~613): skip player HQ + optional barracks spawn.
- [x] **T1.2** Guard `standardDefeatChecks` (`js/core.js` ~348): when `heroEscape`, lose only on `!playerHas`.
- [x] **T1.3** Sanity-spawn check: syntax OK + boot OK (full in-game spawn verified once XVI is loadable, Phase 6).

## Phase 2 — engine: dead-body memory mechanic (logic reuses madosis echo; body is a real corpse)
- [x] **T2.1** `corpse` entity + `spawnMemBodies(state,cfg)` reading `cfg.memBodies` (`js/corpses.js`); body on the spot tile.
- [x] **T2.2** Pickup `corpsesTick` (core.js update): proximity → `reached`, show memory, reveal hook (`fireTuskReveal`, Phase 4).
- [x] **T2.2b** Memory shows as a PERSISTENT DIALOG BOX (`#memoryDialog` + `showMemoryDialog`), not a toast — stays until the player
  clicks to close; freezes the sim via `window._memDialogOpen` (main-loop guard, NO PAUSED overlay); one body harvested at a time;
  reveal body = red "A&O SERVICE RECORD" variant → chains the Rust cutscene on dismiss. Full flow re-verified → win. (owner directive)
- [x] **T2.3** `corpse-lab.html` calibration lab (CP2077×Hades) — screenshot-verified; matte oxblood vs neon synthetic.
- [x] **T2.4** `corpseSprite(body)` renderer (`js/render.js`): prone pose + source-atop death tint + procedural dismemberment
  + organic wound decals + synth bloom/sparks + fluid pool; offscreen WeakMap-cached; **no per-pixel masking**; seeded by body id.
- [x] **T2.5** Draw corpse in `js/render.js` (depth-sorted) + grounded affordance while `!reached` (no floating beacon).
- [x] **T2.6** `collectMemories` evaluator in `js/quests.js` (count corpses with `!reached`); `required`-safe.
- [x] **T2.7** Click-to-extract: `pickEntity` (input.js) + `commandUnits` branch (units.js); any player unit harvests on contact.
- [x] **T2.8** CYBORG BLOOD RULE: `isCyborgBody` classifier (corpses.js) + `DEF.cyborg` on soldier/founder → synthetic/neon
  for Growth Cyborgs, Founder Mech/Rust, Biba, EX-TERMINATOR/REX, A&O, reborn; humans bleed oxblood. (owner directive)

## Phase 3 — map: author XVI as the escape stripe
- [x] **T3.1** Rewrote XVI entry (`js/maps_data.js`): 175×63 (25:9) stripe, jungle(grass+forest)→tech, heroEscape,
  hero-only roster (Nino/Rust/Biba), 400 gold, `toBeContinued`, removed `cfg.villain`/`villainCutscene`.
- [x] **T3.2** `memBodies`: 5 bodies L→R (civilian + cyborg srcs); `reveal:true` A&O body far-left; 4 flavor memories + Tusk reveal text.
- [x] **T3.3** Left-edge finish: `lostBases` derelict Open-Plan HQ; reclaim hook in core.js (deduct 400, spawn intern, beat). Verified.
- [x] **T3.4** Running-battle enemies: REBALANCED — removed the 5 PRODUCING bases (snowballed into unsurvivable
  escalating waves vs 3 heroes) → 6 STATIC `cfg.guards` checkpoints (`scale:false`, hold position, no reinforcement)
  fought one at a time with lulls; light/spaced pursuit (t=45/135, small squads, no aggression ramp); aggression 1.7→1.0;
  EX-TERMINATOR pushed to t=200. Checkpoint sizes ramp **6→14 units** (62 total: soldiers/rangers/hustlers + medics,
  snipers, Auditor siege-walls, 2 Founder-Mech anchors). Headless-verified: 62 guards spawn, bounded count, guards don't rush a parked squad.
- [x] **T3.5** EX-TERMINATOR pursuer: `events` `villain:{id:'ex_terminator_mk2'}` at t=120 (no `cfg.villain` → victory stays quest-driven).
- [x] **T3.6** Quests: required `collectMemories` + `reclaimOutposts`(1); bonus `heroesAlive` + `killUnits`. Full win path headless-verified.
- [x] **T3.x** FIXES: `memBodies` now scaled in `scaleCfg`; corpses snap to walkable ground (`_corpseSnap`); reach 1.4→1.8.
- [ ] **T3.7** Suppress XVI crawl; `introCutscene:'XVI_CRASH_WAKE'` (heroes wake in the wreck) — **deferred to Phase 4** (with the lines + crash chain).

## Phase 4 — cinematics: reveal + crash transition
- [x] **T4.1** `RUST_TUSK_REVEAL` lines in `js/dialog_data.js` (5 Rust beats — file-pull → marketing-render → cyborg).
- [x] **T4.2** `fireTuskReveal` (cutscene.js, reuses `armByName`) fired from `corpseExtract` on the `reveal` body. Verified.
- [x] **T4.3** Crash chain (solo): `crashChainTo` on 15.5 → `bossOutcome`/`altWinTriggered` hook → `beginCrashChain` → `crashChainTick` → `loadMap(XVI)`. Verified 15.5→XVI.
- [x] **T4.4** Bomber-crash render `drawCrashChain` (render.js, screen-space): fly-in → A&O bomb streak → hit flash → spin-fall + fire/smoke trail → impact burst → fade. Screenshot-verified.
- [x] **T4.5** `XVI_CRASH_WAKE` lines (Nino/Biba/Rust) + `introCutscene` on XVI; clean hand-off (crash → loadMap → intro). Verified.

## Phase 5 — co-op parity (host + client)
- [x] **T5.1** Pack/unpack corpse (`src`/`memId`/`reveal`/`gore`/`reached`) in `js/net/sync.js` — clients build the gore sprite + track harvested state.
- [~] **T5.2** Reveal cutscene already rides `armByName`'s co-op host mirror (`cinematic('mapcut',… {hold:true})`). Crash-cinematic mirror still to wire.
- [ ] **T5.3** Co-op crash chain: route 15.5→XVI via the host next-map path (`mpHostStart`) so the client follows. **REMAINING.**
- [x] **T5.4** Determinism: chip pickup is pure proximity (no `simRandom`) → host/client/rollback safe.

> Co-op crash-chain (T5.3) + full live co-op verify remain — per the owner's solo-first cadence. Solo is complete + headless-verified end to end.

## Extension — "THE OTHER UNITS" (front-half wreck + crew bodies)
- [x] **E1** `wreck` entity + `spawnWrecks` (corpses.js) from `cfg.wrecks`; scaled in `scaleCfg`; co-op pack/unpack (sync.js).
- [x] **E2** `drawWreck` + `wreckSprite` (render.js): bomber sprite cropped to its half (nose/tail), tilted, burnt-dark, scorch pool; depth-sorted.
- [x] **E3** `_wreckEmitSmoke`: continuous ash + ember plume into the `smokes[]` pool (all roles; reduced-motion aware).
- [x] **E2/E3 REWORK** (looked terrible — visible diagonal cut + tiny white-dot fire): `wreckSprite` now rotates each half so the
  BROKEN end digs in, FEATHERS the cut (destination-out → no hard line), buries it under a dirt furrow + debris + scorch, and
  anchors the fire ~30% into the hull. `drawWreck` draws a real flickering FIRE (base glow + hot core + 9 teardrop tongues) +
  ember sparks + a thick NON-ADDITIVE dark-smoke column (`_WRECK_SMOKE_PARTS`, the `drawMushroom` puff/charcoal-ramp pattern —
  the additive `smokes[]` could only glow). Gated (reduced-motion/QUAL), capped (36/wreck). Both halves screenshot-verified; bounded; no errors.
- [x] **E4** `spawnCrewBodies` (corpses.js): dynamic 10%-of-`carryoverVets` REAL-vet bodies (dossier memories) + generic fallback;
  **permanent** roster loss via `CAMPAIGN.roster` filter, one-shot `_crewLost`. `noCarryVets:true` so the vets don't deploy.
- [x] **E5** corpse `group` field (`route`/`crew`) + `corpsesRemaining(group)`/`corpsesTotal(group)` + `collectMemories` `def.group` filter.
- [x] **E6** `XVI_FRONT_WRECK` discover beat (Biba/Nino/Rust: 90 walked to the H.U.B., these 10 didn't) + crew memories from real dossiers.
- [x] **E7** XVI cfg: `wrecks` (back@start, front@x46), `crewWreck`, `reachCutscene`, required `crew` quest, `noCarryVets`.
- [x] **E8** FIX: `scaleCfg` now scales `reachCutscene.at`/`radius` (was unscaled → never fired; also corrects EP12's latent case).
  Verified headless: 2 wrecks + smoke render; fallback (3 generic) AND dynamic (10 vets → 2 die, roster 10→8 once, real-vet dossier memories);
  discover beat fires at the wreck; full win path (5 route + crew + reclaim) → `outcome:'win'`; zero JS errors.

## Jungle topography (real jungle + trails)
- [x] **J1** `carveTrails(state,cfg,rng,landBiome)` (map.js, opt-in `cfg.trails`): enumerate POIs (player/HQ/enemies/guards/
  gold/bodies/wrecks), carve a meandering SPINE (player→guards by x→crew→HQ) + a branch from every off-spine POI + a few
  DEAD-END pockets; clears whole features along the corridor (`dropFeaturesAt`) + worn-dirt centerline. Deterministic; run before `blocked` build.
- [x] **J2** `terrain.forestClump` option (map.js): low-frequency mask on the ambient forest → GROVES + open CLEARINGS (not a uniform grid/striped walls).
- [x] **J3** XVI cfg: dropped the 4 grid `thickets`; **`forest:0.46 + forestClump:0.85`** (owner: "increase a lot" — fills the empty space, ~73–82% tree coverage) + ~14 dense copses; `trails:true`.
- [x] **J3b** WEB upgrade to `carveTrails` (owner: "real jungle WITHOUT exclusive paths between POIs / can't move up-down"):
  dense `forestClump:0.85` alone dropped land-connectivity to **59%** (trails became the only routes + horizontal walk-under
  banding blocked vertical movement). Added (a) **cross-links** — loop trails between spine arms that swing back within ~26 tiles,
  and (b) **vertical game-trails** — 6–8 meandering N↔S cuts (random vertical span + x-jitter → organic, not a regular grid)
  that slice the horizontal banding so units move UP/DOWN. Connectivity → **96%** while keeping ~73% tree coverage.
- [x] **J4** Verified (top-down passability/coverage schematic + in-game tree views + win path): **73–82% tree coverage** (dense
  real jungle, empty space filled — confirmed via schematic, not just LOD-shrunk zoom-out); a WEB of trails (spine + branches +
  dead-ends + cross-link loops + vertical cuts) connects all **19 POIs (reachable) at 96% land connectivity** (non-exclusive,
  up/down weaveable); full win path intact (8 corpses → route+crew+extract → `outcome:'win'`, Tusk reveal fires); zero JS errors.
  Other maps untouched — both flags opt-in (Ep XII thickets + Ep I build clean with no trails flag).
- [x] **J5** DE-GRID the trees (owner: "trees still rendered in an exact grid… look hand-placed in a rectangular grid";
  "more tree sprites MUST be placed over the same covered space so they look cramped up"). Root cause: `buildTopoFeatures`
  snaps every tree to the FEAT_SIZE=3 lattice and `drawFeature` draws ONE sprite per cell → visible rows/cols + gaps.
  Fix = RENDER-ONLY `drawTreeClump` (js/render.js): each tree feature now draws a deterministic CLUSTER of 3–4 overlapping
  crowns — a primary shoved ~±0.5 tile off the lattice node + 2–3 satellites fanned ~1–1.8 tiles into the diagonal voids
  between neighbouring clumps, each with its own jittered pos/size/mirror and same-alive-or-dead variant. Neighbour crowns
  merge → cramped continuous canopy, grid dissolved. All offsets are coords-only `h2(f.tx,f.ty)` hashes (host/client/reload
  identical); **footprint/feat[]/blocked[]/depth-sort untouched** (pure visual); `drawFeatureSprite` gained an optional
  `{vidx,flip}` crown override (default path byte-identical). Gated: `?nofeatjit=1` A/B, skipped at zoom<0.5 and QUAL≥2.
  Verified: cramped at tight/mid/wide zoom; trails+POI clearings stay readable (wreck/HQ visible); clean boot; win path intact;
  zero save/sync change (features dropped from wire, rebuilt from footprint). Perf +4.6ms headless-software fill (overstated
  vs GPU; bounded + QUAL/zoom-gated). Trees only (rocks/mountain-chains untouched).

## EX-TERMINATOR HUNTER rework (Ep XVI pursuer)
Owner: the EX-TERMINATOR had to be ground to FULL HP-zero (insane vs 3 fragile heroes) AND spawned at a fixed
edge tile far from the fleeing squad with only `sight:12` → the fight never started. Reworked into a relentless
hunter you DRIVE OFF (hidden, level-scaled damage pool), not kill. Scope: Ep XVI pursuer ONLY (opt-in `hunter`
flag); Ep 3.5 set-piece `ex_terminator` (cfg.villain) untouched. Plan: `~/.claude/plans/episode-xvi-the-abundant-reef.md`.
- [x] **X1** HUNTER spawn OUT OF SIGHT + run in: `villain:{id:'ex_terminator_mk2', hunter:true}` (dropped the fixed `at`).
  `hunterSpawnPos` (villains.js) = the NEAREST passable tile the player CANNOT currently see (`state.visible[i]!==1`,
  fog), biased to the BEHIND side (toward the start) — so it appears off-screen (~just beyond hero sight) and is NEVER
  seen to pop in (owner: no "magical teleport"). It then RUNS IN at full speed (`HUNTER_APPROACH_SPEED 1.8×` in hunterTick,
  settling to normal cadence once in engage range). No fog reveal on (re)spawn (it emerges from the dark). Wired in
  `runMapEvent` + the return loop (core.js/villains.js). Verified: spawn tile `visible=0`, sprint seen, closes in.
- [x] **X2** Relentless pursuit: `hunterTick` sets `u.autoTarget` IGNORING `sight` each tick (chase in updateUnit follows);
  `hunterTarget` FIXATES on the toughest hero (tank holds aggro, squishies burst from cover — the survivability key).
- [x] **X3** Hidden damage pool: `damage()` (units.js) banks post-mitigation player damage to `u._poolDealt`; repel when
  `_poolDealt>=_poolTarget` OR hp≤16% (the OVERHEAT/EXPOSED window naturally fills it faster). `_poolTarget =
  (340 + 16·Σ hero★)·(1+0.10·repels, cap+60%)` → Ep XVI (29★)=**804**; scales with level so higher squads bank more.
- [x] **X4** Repel→retreat→return loop: on repel → "I'll be back" + stagger + first-time teaching toast; BOLTS to an edge
  (1.8× speed, 6s hard timeout) → despawn → `state._hunterReturnAt=+30s`; `hunterReturnTick` (core.js) respawns it near
  the squad's NEW position with a fresh, ramped pool. NEVER dies: hp≤0 intercepted in core.js cleanup (no airlift/win);
  `fleeExtract` guarded with `!e._hunter`. Ep XVI has no `cfg.villain` so `villainCheckWinLose` is never engaged.
- [x] **X5** Clue = escalating glow + stagger ONLY (escalating green rim by `_poolFrac` + stagger flare; render.js
  `drawRebornRim`; synced `hu`/`pf` so co-op clients render it). OWNER RULE (the mechanic is DISCOVERED, never
  informed): **NO HP/boss bar** — `#bossbar` excludes `_hunter` (ui.js `updateBossBar`) AND the small per-unit hp
  bar is suppressed for `_hunter` (render.js ~2659); **NO mechanic-explaining toast** — removed the teaching toast;
  the arrival event toast is pure flavor ("locked onto your squad"). Normal bosses' bar UNAFFECTED (regression-checked).
- [x] **X6** Balance (verified headless, owner live-tune knobs at top of villains.js): pool≈800 + `HUNTER_DMG_MUL=0.8` +
  `HUNTER_CD_MUL=1.5` (healing gaps) + tank-priority → **realistic play (spread, ranged kept back): all 3 survive**,
  2 repels/80s; pathological glued-no-micro clustered case loses heroes (not real play). Functional ALL pass (spawn-near,
  beyond-sight pursuit, repel-not-airlift, despawn, return-near, level-scaling); Ep 3.5 boss unchanged; XVI win path intact;
  save/load preserves hunter state; clue renders; clean boot, zero JS errors. Event moved t:200→t:120 (recurring throughline).
  Co-op live-verify + owner playtest pending; uncommitted.
- [x] **X7** Size: shrunk `ex_terminator_mk2` `bossScale` 3.2→**1.76** so it draws the SAME size as hero Rust (owner)
  — `unitDrawH` = sprite-h 60 ×1.76 = 105.6 ≈ Rust 92 ×1.15 = 105.8 (verified). Collision `r` + green rim + glow are
  all `vh`-relative so they shrank together. Synced (`bsc`) → correct on co-op clients. Ep 3.5 fight 1 (bossScale 2.0) untouched.

## Phase 6 — verification
- [x] **T6.1** Solo path headless-verified piecewise: 15.5→crash→XVI load; harvest all 5 (reveal fires on the A&O body);
  reclaim HQ (intern + 400 spent) → `outcome:'win'` → TO BE CONTINUED. Clean 8s sim, zero JS errors. (Owner live full-play still nice-to-have.)
- [x] **T6.2** Failure paths: squad wipe → defeat (no false insta-loss while alive); 1 hero lost → other heroes still harvest all 5 (no softlock; only bonus `heroesAlive` fails).
- [x] **T6.3** Save/load mid-XVI: JSON round-trip preserves all 5 corpses + `src`/`gore`/`reveal` + 2 harvested + `memories` 2/5; heroEscape intact.
- [x] **T6.x** Cutscene rule: ALL flash cutscenes click-to-advance, none auto-skip (`startFlashCutscene` `manual:true`). Verified: 25s no-click holds line 0; click advances; closes only by clicking.
- [ ] **T6.4** Co-op live: both players see crash, get trio, extract chips, see reveal + cliffhanger. **OWNER-GATED** (needs 2 peers).
- [ ] **T6.5** Real mobile device viewport + perf. **OWNER-GATED.**
- [ ] **T6.6** (Deferred) Voice TTS for `RUST_TUSK_REVEAL` / `XVI_CRASH_WAKE` — lines work as on-screen text meanwhile.
