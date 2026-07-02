# Environmental Storytelling — Implementation Tasks

> **Companion to [environmental-storytelling.md](environmental-storytelling.md).** That doc is the
> *design* (why + the ranked catalog); this is the *execution checklist* (what to do, in order, with
> `[ ]` trackers). Every subtask below names a real file + symbol and was verified against the code on
> the `main` branch. Tick a box when its slice is implemented **and** manually verified in-browser.
>
> **Nothing here is shipped yet** — this is a backlog. Pick a task, do its *First slice* group, run its
> *Verification* group, then move to *Deferred* slices only if you want the expansion.

---

## How to use this checklist

- Each **Task** (one env-storytelling mechanic) is split into five groups, always in this order:
  1. **Prep / locate** — confirm the anchors before touching anything (read-only).
  2. **First slice (ship this)** — the smallest shippable implementation.
  3. **Deferred / follow-on slices** — optional expansions; do later or never.
  4. **Constraints & safety** — save-compat, the three netRole paths, rollback guards, art direction.
  5. **Verification** — concrete in-browser steps that prove it works.
- A task is **Done** when its *First slice* + *Constraints & safety* + *Verification* boxes are all ticked.
- **No build step exists** — edit the JS, hard-refresh `rts.html`. Serve locally so multiplayer works:
  `python3 -m http.server 8000` → open `http://localhost:8000/rts.html`.
- Honor the four global constraints (next section) on *every* task — they are not repeated per-task
  except where a specific gotcha applies.

---

## Global constraints (apply to EVERY task)

- [ ] **No-build / single global scope** — plain classic JS, no modules/bundler; respect script order in
  `rts.html` (it *is* the dependency graph). New globals are read by later scripts only.
- [ ] **Single global `G`** — any render-only transient that must live on `G` follows the `state._shake`
  precedent: set on event, decayed in `render.js`, and **excluded** from `js/save.js` and `js/net/sync.js`.
- [ ] **Three netRole paths** — solo, host (authoritative), client (render-only, never simulates). Each
  task states where it reaches the co-op client vs. is host/solo-only. Never add client-side gameplay
  mutation; route networked gameplay through the `net*` wrappers in `js/net/commands.js`.
- [ ] **Save-compat is mandatory** — missing fields = legacy default; no `SAVE_VERSION`-gated reads; old
  saves must load and behave. Flag any **net-shape change** (a new field folded into a snapshot) loudly.
- [ ] **Art direction** — dark / devastated / Hades-inspired, never bright. No clean glowing pickups.

---

## Recommended build order (quick-wins first)

Low-risk, mostly-already-built items first (from the design doc §6):

1. **A1** ULTRA news ticker outcomes — zero art, biggest reactive bang.
2. **A3** Ep XVI deaths → The Wake — one call, closes a written loop.
3. **B1** data-shards on a second map — proves the mechanic is already portable.
4. **A2** `cleanrun` bark pool — one data file + one gate.
5. **B3** lingering smoke column in `deathFx` — all-netRole-safe.
6. **A5** wire `ohKeepsakeBonus` — turns existing bonds into stakes.

Then the M-effort staging/atmosphere items: **C1** (arc-tint) → **A4** (aftermath dressing) → **AX**
(dress the wasteland). **B2** (condition events) is the in-mission authoring backbone — ship `onReach`
once, then it pays off across many maps. **PARK** (graffiti) stays blocked until a poster atlas exists.

---

## Task index

Top-level tracker — tick when the whole task (first slice + constraints + verification) is done.

- [ ] **A1** — ULTRA news ticker — mission outcomes as A&O propaganda  *(effort: S)*
- [ ] **A2** — Hub-remembers contextual bark bucket (cleanrun)  *(effort: S)*
- [ ] **A3** — Ep XVI permanent deaths reach The Wake memorial  *(effort: S)*
- [ ] **A4** — Mission-aftermath dressing — the hub as the after-photo  *(effort: M)*
- [ ] **A5** — Affinity → combat perk (wire the orphan Off-Hours bonuses)  *(effort: S)*
- [ ] **AX** — Dress the wasteland — a cold buried wreck (lower priority)  *(effort: M)*
- [ ] **B1** — Walkable data-shards / audio-logs on any map  *(effort: S)*
- [ ] **B2** — Condition-triggered map events (onReach first)  *(effort: S-M)*
- [ ] **B3** — Reactive ambient FX — razed-base lingering smoke  *(effort: S)*
- [ ] **C1** — HUB arc-descent skin — arc-biased night-tint  *(effort: M)*
- [ ] **PARK** — Factional graffiti & corporate signage (blocked on art)  *(effort: M)*

---

## Theme A — The city remembers your campaign

### Task A1 — ULTRA news ticker — route mission outcomes (won/lost/bossDefeated) into LNS.ultraEvent as A&O propaganda headlines

**Goal.** When a mission ends, push an A&O-slanted ULTRA NEWS headline (won / lost / boss-killed) into the session-only news ticker — for solo, host, AND co-op client.

**Effort:** S  ·  **Risk:** low — additive new ultraEvent kinds + data templates; session-only, never serialized; three call sites in ui.js that already exist; main trap is the co-op-client early-return and the boss-fled false-claim, both explicitly handled.

> **No net-shape change.** No entity/snapshot shape change. ULTRA headlines live in the session-only in-memory `ultraEvents` array in lns.js (capped at MAX_ULTRA_EVENTS=30), are never written to localStorage saves or to the host snapshot in js/net/sync.js, and each client fires its OWN local ultraEvent from its OWN end-screen code path (clientEndScreen / showCrawl), exactly like the existing episodeReached precedent. No new persistent fields, no save_version bump, no packEnt change.

**Files touched:** `js/ultra_news_data.js`, `js/lns.js`, `js/ui.js`

**Corrections found vs. the design doc:**
- Design doc cites the ultraEvent dispatch at js/lns.js:186 — confirmed accurate (function ultraEvent is at line 186; the if/else-if branch chain runs 189-216).
- Design doc says fire 'from onVictory / onDefeat AND clientEndScreen' — confirmed correct and load-bearing: onVictory (ui.js:2849) and onDefeat (ui.js:3046) BOTH early-return into clientEndScreen (ui.js:2829) for non-pvp clients, so clientEndScreen is genuinely the third required site, not optional.
- Boss-fled detection: the doc says respect the boss-fled case via questsDeclareVictory→bossOutcome. The concrete, victory-time-readable flag is `G._fledBoss` (set in bossOutcome villains.js:1278, still set when onVictory runs, cleared only at the advance step ui.js:2928). `_villainEscaped` is the underlying sim cause but `_fledBoss` is the right thing to test in the ui.js dispatch. onVictory already reads `G._fledBoss` at line 2913 and resolves the villain def `vdef` at 2911 — reuse that exact pattern.
- ultra_news_data.js structure: `templates` is one object (lines 77-92) holding per-kind arrays; `episodes`/`foreshadow`/`memorialDread` are sibling ARRAYS and `achievement` is a sibling MAP — the new mission-outcome kinds belong under `templates` (so chooseTemplate finds them), NOT as new top-level siblings.
- No new token needed beyond the existing `\{(\w+)\}` convention; `{boss}`/`{map}`/`{enemy}` resolve from G.cfg at the call site (the caller passes them in payload) — lns.js's expandTemplate already supports arbitrary tokens, so no expandTemplate change is required.

#### A1 · Prep / locate

- [ ] Confirm in js/lns.js the `ultraEvent(kind, payload)` dispatch (lns.js:186-217): an `if/else if` chain on `kind` that calls `chooseTemplate(kind, salt)` → `expandTemplate(tpl, data)` → `pushUltra(...)`; note that `pushUltra` already dedups + caps to MAX_ULTRA_EVENTS=30 and that `ultraEvent` returns early if `ultraData()` is null. New kinds = new `else if` branches with the same shape.
- [ ] Confirm in js/lns.js that `chooseTemplate(kind, salt)` reads `ULTRA_NEWS.templates[kind]` and picks `list[Math.abs(salt)%list.length]` — so each new kind needs an array under `ULTRA_NEWS.templates`, and `salt` must be a stable per-event integer (use `mapIndex`).
- [ ] Confirm in js/ultra_news_data.js that `ULTRA_NEWS.templates` (lines 77-92) holds `unitDeath`/`heroLifeEvent`/`dreamFulfilled` arrays of `'B.I.G. PAPA: …{token}…'` strings, and that `{name}`/`{unit}`/`{map}` are the existing `expandTemplate` tokens — new mission-outcome templates must reuse the same `\{(\w+)\}` token convention.
- [ ] Confirm in js/ui.js that `onVictory()` (ui.js:2849) and `onDefeat()` (ui.js:3046) BOTH early-return into `clientEndScreen(true/false)` when `netRole==='client' && !(G&&G._pvp)` — proving a single call in onVictory/onDefeat would DROP the co-op client, so clientEndScreen (ui.js:2829) is the third required call site.
- [ ] Confirm in js/ui.js that `showCrawl` (ui.js:2757) already fires `LNS.ultraEvent('episodeReached',{idx})` unconditionally (clients run showCrawl) — this is the precedent the win/loss wiring mirrors for client reach.
- [ ] Confirm in js/ui.js the boss-fled signal available at victory time: `G._fledBoss` (read at ui.js:2913, cleared only when advancing at ui.js:2928) and the villain def lookup `vdef` (ui.js:2911, reads `G.cfg.villain` array-or-object form). These let `bossDefeated` fire ONLY on a villain map that was actually killed.
- [ ] Confirm in js/villains.js `bossOutcome(state, kind)` (villains.js:1277): `kind==='fled'` sets `state._fledBoss=true`; `_villainEscaped` (villains.js:572,1361) is the sim cause; questsDeclareVictory (quests.js:251-258) routes `state._villainEscaped ? 'fled' : 'win'`. So `!G._fledBoss` on a `G.cfg.villain` map == a real kill.
- [ ] Confirm `!window._rbReplaying` is the established suppression guard for one-shot side effects (used in bossOutcome villains.js:1278) and that ultraEvent itself is otherwise side-effect-free — the new ui.js call sites must be wrapped in this guard so rollback re-simulation never double-pushes headlines.

#### A1 · First slice (ship this)

- [ ] In js/ultra_news_data.js, add three new arrays under `ULTRA_NEWS.templates`: `missionWon`, `missionLost`, `bossDefeated` — each 3 entries, dark A&O corporate-satire in the existing 'B.I.G. PAPA: …' voice (e.g. missionWon → 'terrorism contained / sector secured', missionLost → 'insurgent setback / the board notes the variance', bossDefeated → uses `{boss}` token, 'asset retired / hostile decommissioned'). Reuse only `{map}`, `{boss}`, `{enemy}` tokens (all resolvable from G.cfg).
- [ ] In js/lns.js `ultraEvent`, add `else if(kind==='missionWon'){ ... }`: call `chooseTemplate('missionWon', payload.idx|0)`, then `pushUltra(expandTemplate(tpl, { map: payload.map||'the sector', enemy: payload.enemy||'the competition' }))`. Read map/enemy from payload only (caller supplies them) so lns.js stays G-agnostic.
- [ ] In js/lns.js `ultraEvent`, add `else if(kind==='missionLost'){ ... }` mirroring missionWon (template list `missionLost`, salt `payload.idx|0`, same `{map}`/`{enemy}` tokens).
- [ ] In js/lns.js `ultraEvent`, add `else if(kind==='bossDefeated'){ ... }`: call `chooseTemplate('bossDefeated', payload.idx|0)` and `pushUltra(expandTemplate(tpl, { boss: payload.boss||'the asset', map: payload.map||'the sector' }))`. Do NOT detect fled here — the caller is responsible for not firing this kind on a fled boss.
- [ ] In js/ui.js `onVictory()` (after the `running=false`/client early-return, before the screen branches), add a guarded dispatch: `if(!window._rbReplaying && typeof LNS!=='undefined' && LNS.ultraEvent){ const m=MAPS[mapIndex]||{}; const enemy=(G&&G.cfg&&(G.cfg.enemyName||G.cfg.enemyFaction))||'the competition'; const mapName=(G&&G.cfg&&G.cfg.name)||(m.crawl&&m.crawl.title)||'the sector'; LNS.ultraEvent('missionWon',{idx:mapIndex, map:mapName, enemy}); if(m.villain && !G._fledBoss){ const vl=Array.isArray(G.cfg.villain)?G.cfg.villain[0]:G.cfg.villain; const vdef=(typeof VILLAINS!=='undefined'&&vl)?VILLAINS[vl.id]:null; LNS.ultraEvent('bossDefeated',{idx:mapIndex, boss:(vdef&&vdef.name)||'the asset', map:mapName}); } }` — bossDefeated fires ONLY when the map has a villain AND `!G._fledBoss` (real kill).
- [ ] In js/ui.js `onDefeat()` (after the client early-return / `running=false`), add a guarded dispatch: `if(!window._rbReplaying && typeof LNS!=='undefined' && LNS.ultraEvent){ const mapName=(G&&G.cfg&&G.cfg.name)||'the sector'; const enemy=(G&&G.cfg&&(G.cfg.enemyName||G.cfg.enemyFaction))||'the competition'; LNS.ultraEvent('missionLost',{idx:(typeof mapIndex==='number'?mapIndex:0), map:mapName, enemy}); }`.
- [ ] In js/ui.js `clientEndScreen(win)` (ui.js:2829, the co-op-client mirror onVictory/onDefeat hand off to), add the SAME guarded dispatch keyed on `win`: fire `missionWon` (+ the villain/`!G._fledBoss` `bossDefeated` branch, reading the same `MAPS[mapIndex]`/`G.cfg` fields) when `win` is true, else `missionLost`. This is the ONLY way the co-op client gets the headline, since onVictory/onDefeat already returned before reaching their dispatch.
- [ ] Verify the headlines are read into the ticker with no extra wiring: `pushUltra` already calls `scheduleRebuild()`, and `mixedItems`/`ultraItems` already pull from `ultraEvents`, so the new lines appear on the next marquee rebuild (HUB or in-game) automatically.

#### A1 · Deferred / follow-on slices

- [ ] Defer `captivesFreed` / `outpostReclaimed` per-quest ULTRA kinds: they require a client-side `G.quests` diff-watcher because clients never run quests.js — model it on `questToasts` (js/ui.js:265), watching quest `done`-flag transitions per frame and firing `LNS.ultraEvent('captivesFreed'|'outpostReclaimed', {…})`. S→M effort; ship the outcome kinds first.
- [ ] When the deferred slice lands, add matching `captivesFreed`/`outpostReclaimed` template arrays under `ULTRA_NEWS.templates` plus the `else if` branches in lns.js `ultraEvent`, same pattern as the outcome kinds.
- [ ] Optional polish: ULTRA-bias the in-game/HUB ticker right after a mission ends so the fresh headline leads — `mixedItems(ultraBias=true)` already exists (used by the menu); could pass `true` for one HUD rebuild on HUB entry. Not required for the first slice.

#### A1 · Constraints & safety

- [ ] Save-compat: change is session-only — `ultraEvents` is an in-memory array in the lns.js closure, never serialized by js/save.js and never packed in js/net/sync.js. No SAVE_VERSION bump, no legacy-default handling needed; an old save loads and behaves identically (headlines simply start empty until the next mission ends).
- [ ] Three netRole paths — SOLO: core.js / bossOutcome / hub.js call `onVictory`/`onDefeat` directly (USE_ROLLBACK gates the rollback path), so the dispatch in those functions runs. HOST: same `onVictory`/`onDefeat` run host-locally; the host pushes to its OWN ticker only. CLIENT: onVictory/onDefeat early-return into `clientEndScreen` (and a campaign WIN routes the client through showCrawl→HUB), so the client gets its headline from the `clientEndScreen` dispatch (this slice) — verify the client branch fires for both win and loss.
- [ ] Each player fires its own local ultraEvent (NOT relayed over the net) — this matches the `episodeReached` precedent and keeps the ticker honest per-machine. Do NOT add an mpcue/snapshot field to broadcast headlines; that would be a net-shape change for zero benefit.
- [ ] Rollback guard: wrap every new ui.js dispatch in `!window._rbReplaying` so rollback re-simulation / replay never double-pushes a headline (mirrors bossOutcome's toast guard at villains.js:1278). lns.js `ultraEvent` itself stays side-effect-free aside from `pushUltra`.
- [ ] Boss-fled correctness: `bossDefeated` MUST be gated on `MAPS[mapIndex].villain && !G._fledBoss` — `_fledBoss` is set by bossOutcome('fled') when `_villainEscaped` is true and is still set at onVictory/clientEndScreen time (cleared only at the advance step ui.js:2928). Never fire `bossDefeated` on a fled boss or it claims a kill that didn't happen.
- [ ] Determinism: dispatch uses `mapIndex|0` as the template salt (stable per map), not Date.now()/Math.random() for selection, so headline choice is deterministic per mission; `ts` defaults to Date.now() inside `ultraItem` but that only affects display ordering, never the sim.
- [ ] Art-direction: headline copy must stay dark/devastated corporate-satire in the existing 'B.I.G. PAPA:' ULTRA NEWS voice (cf. 'reclassified as a load-bearing structure'), never triumphant or bright — the slant reframes the player's win as A&O propaganda ('terrorism contained').

#### A1 · Verification

- [ ] Serve the repo: `python3 -m http.server 8000` from /Users/gabriel.bussular/Workspace/starleft, open http://localhost:8000/rts.html (file:// disables co-op, so use the server).
- [ ] SOLO missionWon: start a campaign mission, ensure the in-game News ticker is ON (btn-news / lns-ingame), win the mission (or use a console helper to force win), and on the victory/HUB transition confirm a new 'B.I.G. PAPA: …' missionWon headline scrolls in the ticker.
- [ ] SOLO missionLost: lose a mission (let the base fall) and confirm a missionLost ULTRA headline appears on the OUT OF RUNWAY screen's ticker / next ticker rebuild.
- [ ] SOLO bossDefeated — real kill: play a villain map (e.g. a `cfg.villain` map), KILL the boss, and confirm BOTH a missionWon AND a bossDefeated headline naming the villain appear. Then replay and let the boss FLEE (escape) — confirm missionWon still appears but NO bossDefeated headline (proves the `!G._fledBoss` gate).
- [ ] CO-OP client reach: host on one browser, join as client on another, finish a mission; on the CLIENT confirm the headline appears (the client gets it via clientEndScreen, not onVictory). Confirm a co-op LOSS shows missionLost on the client too.
- [ ] Rollback/no-double: with rollback enabled, confirm a single mission end produces exactly ONE headline of each applicable kind (no duplicates from replay) — inspect by counting matching lines in the ticker.
- [ ] Save/load clean-check: the feature does NOT persist — save a game mid-mission, reload rts.html, load the save, and confirm no errors and an empty ULTRA outcome history (headlines are session-only by design); finishing a mission then repopulates them. Confirm an OLD pre-feature save still loads without error.

**Verification summary.** Read all four named files plus villains.js bossOutcome and the onVictory/onDefeat call graph. Confirmed: (1) ultraEvent at lns.js:186 is an if/else-if kind dispatch using chooseTemplate→expandTemplate→pushUltra; new kinds are additive branches reading ULTRA_NEWS.templates[kind]. (2) New templates go under ULTRA_NEWS.templates in ultra_news_data.js. (3) The win/loss client split is real — onVictory (ui.js:2849) and onDefeat (ui.js:3046) early-return into clientEndScreen (ui.js:2829) for non-pvp clients, so all THREE sites must fire (matching the showCrawl/episodeReached precedent at ui.js:2757 which clients run). (4) Boss-fled is detectable at victory time via G._fledBoss (bossOutcome villains.js:1278; cleared only on advance at ui.js:2928), so bossDefeated gates on `MAPS[mapIndex].villain && !G._fledBoss`. Feature is session-only (no save.js / sync.js change), guarded by !window._rbReplaying, deterministic via mapIndex salt. captivesFreed/outpostReclaimed correctly deferred to a questToasts-modeled client diff-watcher.

---

### Task A2 — cleanrun bark bucket — reactive ambient line pool spoken by ordinary NPCs after a perfect (zero-vet-lost) extraction

**Goal.** Ordinary hub NPCs speak a new "cleanrun" ambient line on the first walk home after a perfect extraction, gated on the already-persisted CAMPAIGN.storyFlags.perfectExtraction.

**Effort:** S  ·  **Risk:** low

> **No net-shape change.** No net-shape change. perfectExtraction is already inside CAMPAIGN.storyFlags, deep-cloned wholesale by serializeHubCampaign (hub.js:125), so the co-op client receives it for free and renders its own cleanrun barks locally — no new mpcue, no sync.js packing change. The cleanrun pool is static code, never serialized.

**Files touched:** `js/npc_lore_data.js`, `js/npc_lore.js`

**Corrections found vs. the design doc:**
- Design doc says 'Put the gate before the salt pick, mirroring the existing fl-flag branch' — confirmed accurate, but more precisely: place the cleanrun branch AFTER the rec.fl&1 (mourning) and rec.fl&2 (reborn) checks (npc_lore.js:181-182) and BEFORE the role branches (183-185), so grief/reborn correctly take precedence over a clean run and the generic role lines do not pre-empt cleanrun. The doc's single phrase 'before the salt pick' is true but underspecifies the intra-chain ordering.
- Design doc lists hub_npcs.js (_ambientTrySpeak + _reset _spoken) under FILES TO READ as if it may need editing — confirmed it needs NO change for the first slice: _ambientTrySpeak already calls npcAmbientLine(s.id) (hub_npcs.js:425) and the path is already _rbReplaying-guarded (line 411) and cosmetic/local. It is a read-only anchor, not an edit site.
- perfectExtraction is set ONLY in enterHubFromCombat (hub.js:580), NOT in the Ep VII flash-aftermath paths (epSevenFlashAftermath / enterHubFlashAftermath, hub.js:615+/631+). This is harmless for cleanrun (the flash kills everyone, so a flash run is never 'clean'), but worth noting that a flash extraction will not arm the cleanrun bucket.
- Deferred slice's CAMPAIGN.lastMission is correctly NOT a net-shape change as the doc implies by silence — it rides the same CAMPAIGN deep-clone as perfectExtraction; the only requirement is the legacy-safe Object.assign default, mirroring storyFlags at hub.js:117/149.

#### A2 · Prep / locate

- [ ] Confirm js/npc_lore.js npcAmbientLine (lines 173-192): the pool-selection if/else-if chain is rec.fl&1 -> A.mourning (181), else rec.fl&2 -> A.reborn (182), else role branches ultra/provider (183-184), else A.general (185); the salt pick (lines 188-190: const salt=...; const line=pool[salt % pool.length]) runs AFTER the chain. The new cleanrun gate must be inserted inside this if/else-if chain BEFORE the salt pick (and before the role branches, since a clean run should override the generic general/commuter/staff line).
- [ ] Confirm js/npc_lore_data.js NPC_LORE.ambient (lines 20-53) is an object of string[] pools (mourning/reborn/staff/commuter/tusk/general) and that the header comment (lines 15-19) explicitly marks the ambient key EXEMPT from the append-only/versions contract (read fresh, never stored) — so appending a new cleanrun pool needs NO new versions row.
- [ ] Confirm js/npc_lore.js npcAmbientLine uses desc.fill(line) (line 191) so the new pool's {me}/{vet}/{home}/{condo} tokens resolve via buildNpcDossier's fill — author cleanrun lines using only those documented tokens (npc_lore_data.js:12).
- [ ] Confirm js/hub.js CAMPAIGN.storyFlags.perfectExtraction is defaulted false in hubDefaultCampaign (line 117) AND re-defaulted via Object.assign in deserializeHubCampaign (line 149) — legacy saves are safe with no SAVE_VERSION read.
- [ ] Confirm js/hub.js enterHubFromCombat sets CAMPAIGN.storyFlags.perfectExtraction = !state._vetLost (line 579-580) BEFORE G=newHubMap() (line 595), and that it gates on CAMPAIGN.nextMapIndex>=7 for the existing Nino/Biba toast — decide whether cleanrun barks should respect the same Arc-2 gate (recommend: no extra gate, barks fire whenever the flag is true).
- [ ] Confirm js/hub_npcs.js _ambientTrySpeak (lines 416-433) already calls npcAmbientLine(s.id) (425) and dedups via _spoken (created in _reset at 378 and re-guarded at 418); the whole path is rollback-guarded (!window._rbReplaying, line 411) and cosmetic/local — so NO change is needed in hub_npcs.js for the first slice.

#### A2 · First slice (ship this)

- [ ] Add a new NPC_LORE.ambient.cleanrun string[] pool in js/npc_lore_data.js (inside the ambient: {...} object, lines 20-53), with 3-4 dark-cyberpunk lines that react to a flawless run from a civilian's perspective (e.g. relatives/friends relieved their vet walked out, providers noting an empty intake queue). Use only the documented tokens {me}/{vet}/{home}/{condo}/{prof}/{poi}. Keep the air grim, not celebratory (the city never feels safe).
- [ ] In js/npc_lore.js npcAmbientLine, add a gate inside the pool-selection chain that fires cleanrun when CAMPAIGN.storyFlags && CAMPAIGN.storyFlags.perfectExtraction && A.cleanrun && A.cleanrun.length AND the NPC is an ordinary civilian (NOT mourning/reborn-flagged — i.e. place the new branch AFTER the rec.fl&1 / rec.fl&2 checks at lines 181-182 but BEFORE the role branches at 183-185). Set pool=A.cleanrun there.
- [ ] Keep the existing fallback intact (the `if(!pool || !pool.length) pool=A.general;` lines 186-187) so a missing/empty cleanrun pool degrades gracefully to general — guarantees legacy/partial-data safety.
- [ ] Leave the salt-based pick (npc_lore.js:188-190) untouched so cleanrun varies deterministically per NPC per visit exactly like every other pool.

#### A2 · Deferred / follow-on slices

- [ ] Author a new defaulted CAMPAIGN.lastMission field (e.g. {unitsLost, vetLost, mapIndex}) in js/hub.js: add it to hubDefaultCampaign's object and re-default it via Object.assign in deserializeHubCampaign (mirror the storyFlags pattern at lines 117 + 149) so legacy saves no-op.
- [ ] Capture CAMPAIGN.lastMission = {unitsLost: state.hubStats && state.hubStats.unitsLost, vetLost: state._vetLost, mapIndex} in js/hub.js enterHubFromCombat BEFORE the G=newHubMap() call (line 595) — combat state.hubStats (hub.js:211) and state._vetLost are discarded the instant newHubMap() reassigns G, so the read must precede it.
- [ ] Add richer-tag branches to npcAmbientLine (e.g. a heavyLoss pool when lastMission.unitsLost is high, a heroLeveled pool) gated on the new CAMPAIGN.lastMission, each appended to NPC_LORE.ambient as new exempt pools, slotted into the same if/else-if chain.
- [ ] Optionally clear/reset CAMPAIGN.storyFlags.perfectExtraction (and lastMission tags) freshness so a bark only fires on the FIRST hub visit after the run, not every revisit — currently the flag persists until the next extraction overwrites it; consider a per-visit 'consumed' guard if repeat barks feel stale.

#### A2 · Constraints & safety

- [ ] Save-compat: no new persistent field in the first slice — cleanrun rides the already-persisted, already-defaulted CAMPAIGN.storyFlags.perfectExtraction (hub.js:117/149). The line pool is static code, never serialized. No SAVE_VERSION bump. (Deferred CAMPAIGN.lastMission MUST default safely via Object.assign per the storyFlags precedent.)
- [ ] netRole — reaches the client: solo and host set perfectExtraction in enterHubFromCombat; the client receives it for free because serializeHubCampaign deep-clones all of CAMPAIGN (hub.js:125) over the hub snapshot. The bark itself is rendered locally on each peer via _ambientTrySpeak/npcAmbientLine — no host-only evaluation, no mpcue needed. So all three netRoles speak cleanrun lines off the same synced flag (note: client's exact bark TIMING/selection is independent/cosmetic, which is already true for all ambient barks).
- [ ] Rollback guard: no new FX site — the ambient path is already wrapped in !(window._rbReplaying) in hub_npcs.js:411, so cleanrun inherits the guard; do not add a second bark trigger outside it.
- [ ] Determinism: do not introduce any new RNG — reuse the existing salt pick (npc_lore.js:189, salted by npcStrHash(id) ^ CAMPAIGN.visit). npcAmbientLine must stay a pure read (no state mutation), preserving the function's documented contract (npc_lore.js:168-172).
- [ ] Art-direction (visual = speech bubble text): cleanrun lines must stay dark/devastated/grim — relief tempered by dread, never bright or triumphant — matching the existing general/commuter tone (e.g. 'savor it, it won't last').

#### A2 · Verification

- [ ] Serve the repo: python3 -m http.server 8000 from /Users/gabriel.bussular/Workspace/starleft, open http://localhost:8000/rts.html.
- [ ] Solo: play (or use console helpers) to win a mission at episode >=7 with ZERO veterans lost so enterHubFromCombat sets perfectExtraction=true (confirm via console: CAMPAIGN.storyFlags.perfectExtraction === true). On arrival in the H.U.B., wait ~AMBIENT_EVERY (9s of hub time) and watch passing civilian NPCs — confirm a cleanrun line appears in a speech bubble.
- [ ] Solo negative case: win a mission losing >=1 veteran (perfectExtraction=false) and confirm NPCs speak the normal general/commuter/staff lines, NOT cleanrun.
- [ ] Console fast-path: set CAMPAIGN.storyFlags.perfectExtraction=true; call window.npcAmbientLine(id) for a known civilian id (e.g. from hubNpcRoster()[0].id) and confirm it returns a cleanrun line; flip the flag false and confirm it returns a general line.
- [ ] Mourning/reborn precedence: pick an NPC with rec.fl&1 (mourning) while perfectExtraction=true and confirm they still speak the mourning line (the cleanrun branch sits after the fl checks, so grief wins).
- [ ] Save/load: with perfectExtraction=true, save the hub game, reload rts.html, load the save, re-enter the hub, and confirm CAMPAIGN.storyFlags.perfectExtraction is still true and cleanrun barks still fire (proves persistence + legacy-safe default).
- [ ] Co-op (host + client): host wins a clean run, both peers enter the H.U.B.; confirm on the CLIENT that CAMPAIGN.storyFlags.perfectExtraction is true (synced via serializeHubCampaign) and the client's own NPCs speak cleanrun lines. Then load an OLD pre-feature save and confirm it loads without error and defaults perfectExtraction=false (no cleanrun, no crash).

**Verification summary.** Manual in-browser only (no build/test). First slice touches exactly two files: js/npc_lore_data.js (append NPC_LORE.ambient.cleanrun pool — exempt from the versions contract) and js/npc_lore.js (one gate in npcAmbientLine, placed inside the if/else-if pool-selection chain after the rec.fl&1/&2 checks and before the role branches, hence before the salt pick). No save.js/sync.js/hub_npcs.js change. Verify: solo clean win at ep>=7 -> cleanrun bark appears; lossy win -> general line; console toggle of CAMPAIGN.storyFlags.perfectExtraction flips the returned line; mourning NPCs still mourn (precedence); save/load round-trips the flag; co-op client speaks cleanrun off the synced CAMPAIGN flag and an old save loads with the flag defaulting false.

---

### Task A3 — Ep XVI permanently-dead crew vets reach The Wake memorial

**Goal.** Call recordFallen for each permanently-removed Ep XVI crew vet in the host/solo one-shot crew-loss block so they enter fallenVets and appear on the existing Wake wall.

**Effort:** S  ·  **Risk:** low

> **No net-shape change.** First slice adds NO net-shape change: fallenVets persists via the existing `fallen` META save key (save.js:165/319/347) and is not packed in the hub snapshot, matching every other code path. The OPTIONAL deferred slice (fold `fallen` into serializeHubCampaign so the co-op CLIENT wall is populated) WOULD be a net-shape change to the mphub/snapshot.campaign payload (sync.js:300/322, mp.js:541) and deserializeHubCampaign (hub.js:126) — deferred, default host-faithful.

**Files touched:** `js/corpses.js`

**Corrections found vs. the design doc:**
- Design doc cites the insertion point as 'js/corpses.js ~line 113' — verified accurate: the CAMPAIGN._crewLost one-shot block spans lines 110-115, with line 113-114 being the roster-strip. The recordFallen call should go right after the strip, still inside that guard.
- Design doc says recordFallen is at js/lore.js:228 — verified exact.
- Doc's Wake-wall anchor 'js/ui.js ~1538-1600' — verified: buildWakeBody is at ui.js:1538; note there are TWO render paths in it (the pre-GRAAL locked memorial list at ~1558-1568 AND the post-GRAAL fallen-card grid at ~1578-1600), both fed by displayFallen() — so recorded crew appear on the wall regardless of GRAAL state. The doc's single range slightly understates this.
- Unstated in the doc: recordFallen's `_fallenIds` dedup keys on `u.id`, which crew snapshots do NOT have — so dedup does not apply to crew records; the one-shot `_crewLost` guard is the sole protection against double-recording. The implementer must keep the recordFallen loop inside that guard (not in the per-body forEach).
- Unstated in the doc: recordFallen's vet gate `(u.stars||0) < 2` means Lv1 crew casualties are silently excluded from the wall (consistent with displayFallen, but worth an explicit owner decision). The doc implies 'each dead vet' enters fallenVets without noting the Lv2+ filter.
- The dead-crew records carry `stars` (not `lvl`); recordFallen reads `u.stars` directly (and stores both `lvl:u.stars||0` and `stars:u.stars||0`), so the {type,lore,reborn,stars,xp} crew snapshot shape is sufficient — confirming the prompt's question: YES, the spawnCrewBodies dead records carry enough to build a valid fallenVets entry, since they are full carryoverVets snapshots (career.js:235), not just {type,lore}.

#### A3 · Prep / locate

- [ ] Confirm js/corpses.js `spawnCrewBodies` (line ~98-129): the host/solo guard is `if(netRole==='client') return;` (line 100) and the PERMANENT-loss roster strip is inside `if(CAMPAIGN && !CAMPAIGN._crewLost){ CAMPAIGN._crewLost=true; ... CAMPAIGN.roster=CAMPAIGN.roster.filter(...) }` (lines 110-115). This `_crewLost` block is the exact one-shot insertion point for the recordFallen calls — NOT the per-body forEach below it (that runs every map-gen).
- [ ] Confirm the dead set: `dead` (line 104-118) is an array of `carryoverVets` snapshots picked by `_pickK`, each shaped `{type, stars, xp, lore, madosis, sanityThreshold, scarred, reborn}` (career.js:235). The sandbox fallback (line 117) is `[{type:'soldier'},...]` with NO `lore`/`stars` — recordFallen will no-op on those (good, they're generic crew).
- [ ] Confirm js/lore.js `recordFallen(u)` (line 228): single-arg, reads `u.lore` (early-return `if(!u.lore) return`), the vet gate `if(!u.hero && (u.stars||0) < 2) return` (line 230), the dedup `if(u.id!=null){ if(_fallenIds.has(u.id)) return; _fallenIds.add(u.id) }` (line 231), then `buildDossier(u)` and pushes `{name,type,lvl:u.stars||0,dream,home,map:G.cfg.name,dreamDone:!!u.dreamDone,fid,lore,xp,stars,hero,heroId,spriteType,sanityThreshold,reborn:false}`. A crew snapshot supplies `type/stars/xp/lore/reborn`; missing `id/hero/dreamDone/heroId/spriteType` resolve to safe `||` defaults — so a crew record is a valid `u` EXCEPT it has no `u.id`, so the `_fallenIds` dedup does NOT fire for it (the `_crewLost` one-shot guard is what prevents double-recording instead).
- [ ] Confirm the vet-gate consequence: dead crew with `stars:1` (carryoverVets come from eligibleVets requiring `stars>=1`, career.js:230) will be SILENTLY DROPPED by recordFallen's `(u.stars||0) < 2` test, and only appear at all if `>=2`. Note this is the SAME predicate displayFallen()/The Wake already use (lore.js:226-227, ui.js:1542) — so it is consistent: Lv1 crew die permanently but never get a wall plaque. Decide (owner call) whether that is acceptable for the first slice (recommended: yes, keep it consistent).
- [ ] Confirm js/lore.js `fallenVets` (line 214) is a module-global array; `displayFallen()` (line 227) = `fallenVets.filter(fallenIsVet)` (hero or Lv>=2); The Wake wall (ui.js:1542 `buildWakeBody`, and the locked-pre-GRAAL path lines 1558-1568) renders `displayFallen()`. So a recorded crew vet appears on the wall with no further UI work.
- [ ] Confirm save-compat: js/save.js META includes `fallen:1` (line 165); serialize writes `payload.fallen=fallenVets` (lines 319/347/371); load calls `restoreFallen(s.fallen)` (line 231 → lore.js:221). fallenVets persists with no schema bump needed.
- [ ] Confirm net caveat: serializeHubCampaign (hub.js:125) deep-clones only CAMPAIGN; `fallenVets` is a separate global NOT in it, and the hub snapshot (sync.js:300/322, mp.js:541) ships only `snap.campaign`. So on a co-op CLIENT the wall renders empty — pre-existing HUB-is-host/p1-only behavior per the parity audit.

#### A3 · First slice (ship this)

- [ ] In js/corpses.js `spawnCrewBodies`, INSIDE the existing `if(CAMPAIGN && !CAMPAIGN._crewLost){ ... }` one-shot block (lines 110-115), AFTER setting `CAMPAIGN._crewLost=true` and AFTER the `CAMPAIGN.roster` strip, add a loop that calls `recordFallen` once per dead crew vet: `if(typeof recordFallen==='function') dead.forEach(v=>{ if(v && v.lore) recordFallen(v); });`. Gate on `v.lore` so the sandbox fallback `{type:'soldier'}` crew are skipped (recordFallen would no-op anyway, but this avoids the obituary toast firing for nameless filler).
- [ ] Keep the call INSIDE the `_crewLost` guard so it is strictly host/solo (the function already returns early for clients at line 100) AND strictly one-shot — re-running newMap on the same campaign session will not re-record because `_crewLost` is already true. Do not put the recordFallen loop in the per-body `dead.forEach` render loop below (lines 119-128), which runs on every map-gen.
- [ ] Pass the crew snapshot object `v` directly to recordFallen — do NOT synthesize a fake entity. `v` already carries `type/stars/xp/lore/reborn`; recordFallen reads exactly those plus optional fields, and `buildDossier(v)` works because `v.lore` has the frozen `{seed,v,events,fixed?}` shape it needs (lore.js:111).
- [ ] Leave The Wake render (ui.js buildWakeBody) and displayFallen UNTOUCHED — they already read fallenVets/displayFallen and will surface the new records automatically.

#### A3 · Deferred / follow-on slices

- [ ] (Optional, NET-SHAPE) Co-op CLIENT parity: fold the memorial into the hub snapshot so the client wall is populated. Add `fallen: (typeof fallenVets!=='undefined'?fallenVets:null)` alongside `campaign` in the two host snapshot writers (js/net/sync.js ~line 300 and ~322) and the mphub broadcast (js/net/mp.js:541), and call `restoreFallen(snap.fallen)` on the client in the matching deserialize sites (sync.js:71/84, mp.js:384). Guard all reads with legacy defaults (missing `fallen` → leave client memorial as-is). Defer unless owner wants true client wall parity.
- [ ] (Optional) Surface a one-line Wake toast/dialog beat the FIRST hub visit after Ep XVI (e.g. 'N new names joined the wall') keyed off `CAMPAIGN._crewLost`, to make the loop legible — author via the lore-forge/off-hours pipeline, not hand-edited here.
- [ ] (Optional) Reconsider the Lv1-crew drop: if owner wants EVERY permanently-dead crew vet on the wall (not just Lv2+), that requires loosening recordFallen's vet gate or adding a crew-specific record path — a behavior change beyond this mechanic; defer and decide separately.

#### A3 · Constraints & safety

- [ ] Save-compat: NO new save fields and NO SAVE_VERSION bump — fallenVets already serializes under the `fallen` META key (save.js:165) and restoreFallen (lore.js:221) treats a missing array as empty/legacy. A pre-A3 save that never recorded crew simply has fewer fallen; nothing to migrate.
- [ ] netRole — solo: spawnCrewBodies runs (not client), `_crewLost` block executes, recordFallen fires → wall populated locally. Correct.
- [ ] netRole — host: identical to solo; host is authoritative, the crew loss + recordFallen happen host-side and fallenVets lives host-side. Host's own Wake wall is populated.
- [ ] netRole — client: spawnCrewBodies early-returns at line 100, so recordFallen is NEVER called client-side; fallenVets is not in the hub snapshot, so the client Wake wall stays empty. This is the documented, intended host-faithful behavior — do NOT add a client-side recordFallen call (clients must not mutate gameplay/lore state).
- [ ] Rollback guard: recordFallen's cosmetic side-effects (eventToast obituary line 242, ACH.fire line 244, sayHeroEvent line 246, fallenSceneMaybe line 243) already self-gate on `window._rbReplaying` internally where required. spawnCrewBodies runs at map-gen (newMap, map.js:732), NOT inside the per-frame sim, so it is not part of the rollback replay path — no extra `!window._rbReplaying` guard is needed around the new loop.
- [ ] Determinism: the dead set is already chosen by the seeded `_crewRng` (line 102) and `_pickK` — the new recordFallen loop iterates that fixed `dead` array in order and consumes NO additional RNG, so determinism is unchanged. recordFallen's own dedup is bypassed (no `v.id`), so correctness relies solely on the `_crewLost` one-shot guard — keep the call inside it.
- [ ] Art-direction: no visual/FX added beyond the existing dark obituary toast and the already-dark Wake wall; nothing to vet for brightness.

#### A3 · Verification

- [ ] Serve the repo: `python3 -m http.server 8000` from repo root, open http://localhost:8000/rts.html.
- [ ] SOLO path: start/continue a campaign, level at least 2-3 vets to Lv2+ and carry them through the hub dispatch into Ep XVI (the heroEscape map with cfg.crewWreck). On map load, console-check `fallenVets.length` increased and `CAMPAIGN._crewLost===true`; walking the front-half wreck you should see the dead crew corpses.
- [ ] Return to the H.U.B., open The Wake POI, and confirm the newly-dead Lv2+ crew vets now appear by NAME in the fallen wall (pre-GRAAL: the locked memorial list; post-GRAAL: the left 'the fallen' grid). Cross-check the names match the corpse memory-dialog names from the wreck.
- [ ] Vet-gate spot-check: confirm a Lv1 crew casualty does NOT appear on the wall (expected, consistent with displayFallen) and a Lv2+ one does.
- [ ] SAVE/LOAD persistence: after Ep XVI, save the game, reload the page, Load that slot, open The Wake — the crew vets must still be on the wall (proves the `fallen` META key round-trips). Then re-enter/regenerate the map and confirm they are NOT recorded twice (proves the `_crewLost` one-shot guard holds across reload).
- [ ] HOST/CLIENT path: run two browser tabs over http (host + client), co-op through Ep XVI. Confirm the HOST's Wake wall shows the crew vets and the CLIENT's wall is empty (documented host-faithful behavior) — and that no client-side error/duplicate occurs. If the deferred net-shape slice is later built, re-run and confirm the client wall now matches the host.

**Verification summary.** Read and verified all named anchors against live source: corpses.js spawnCrewBodies one-shot `_crewLost` block (host/solo gated, lines 100/110-115), lore.js recordFallen signature + vet gate + dedup + fallenVets global (lines 214-258), ui.js The Wake wall render via displayFallen (1538-1600), save.js `fallen` META key round-trip (165/231/319), and the net path (serializeHubCampaign deep-clones only CAMPAIGN; hub snapshot ships snap.campaign only — confirming the client-empty caveat). First slice is a single guarded recordFallen loop inside the existing one-shot block in js/corpses.js: no net-shape change, no save bump, save/load and host/solo verified by the steps above; client wall intentionally empty (host-faithful).

---

### Task A4 — Mission-aftermath dressing — the hub returns-district as the "after photo"

**Goal.** After a battle, dress the hub with deterministic, faction-correct, inert corpse props re-derived from synced CAMPAIGN.lastMission so the returns-district reads as evidence of the fight you just fought.

**Effort:** M  ·  **Risk:** Low-to-medium. Pure-additive: one new legacy-safe CAMPAIGN field + one new deterministic spawn hook inside newHubMap reusing the proven corpses.js entity model and render path. Main hazards are (a) double-spawn on save-load and (b) co-op client divergence — both avoided by re-deriving ONLY inside newHubMap (never on load) and seeding off synced CAMPAIGN with NO netRole client-skip. No new entity shape, no SAVE_VERSION bump, no net packing change.

> **No net-shape change.** The dressing corpse reuses the EXISTING kind:'corpse' neutral entity shape (mkEntity in map.js:1127; same fields corpses.js spawnMemBodies already uses: src/reached/r/sight/hp/maxHp/gore). It serializes via the generic serializeEntity field-copy (save.js:101) and survives load with no relink work. The only new persistent state is the scalar CAMPAIGN.lastMission={unitsLost,vetLost,mapIndex} object, which already rides the existing serializeHubCampaign/deserializeHubCampaign JSON path and the 'mphub' campaign payload (mp.js:541) — so net snapshot packing (sync.js) is UNCHANGED.

**Files touched:** `js/hub.js`, `js/corpses.js`

**Corrections found vs. the design doc:**
- newHubMap() is PARAMETERLESS and returns a fresh state — the doc's 'hubDressAftermath(state) off newHubMap' must be called INSIDE newHubMap on its local `state` (after hubSpawnRoster, before return state), not passed an external state.
- There is no numeric 'vetLost' — _vetLost is a BOOLEAN flag living on G._vetLost (set in lore.js:248, read as state._vetLost in hub.js:579). The casualty COUNT is state.hubStats.unitsLost via hubEnsureStats. So lastMission.vetLost should be captured as `!!state._vetLost`, and unitsLost from hubEnsureStats(state).unitsLost.
- The doc says hub entities 'do serialize → design for deterministic re-derivation not double-spawn' but the actual mechanism that PREVENTS double-spawn is concrete: on load, deserializeGame (save.js:198) restores hub entities from the snapshot and does NOT call newHubMap — only hubBuildRoads/hubSpawnTrainees/hubSpawnHealers re-run. So as long as hubDressAftermath lives ONLY inside newHubMap, the serialized prop is preserved and never re-derived on load. No idempotency check is needed inside hubDressAftermath itself.
- The dressing prop MUST set reached:true — the doc doesn't mention it, but drawCorpse (render.js:2892) draws a pulsing cyan pickup beacon + chip-glint for any corpse with reached falsy, which would make a 'prop' look like an interactive Ep XVI memory body. corpsesTick's state.hub early-return only stops harvesting, not the render affordance.
- The capture must use the GLOBAL mapIndex (state.js:6), which still holds the just-played mission at the capture point — it is only reassigned to CAMPAIGN.nextMapIndex AFTER newHubMap (hub.js:596). The doc's lastMission.mapIndex is correct but the implementer must capture it BEFORE line 595, not after.
- Unlike spawnCrewBodies (corpses.js:100), hubDressAftermath must NOT short-circuit on netRole==='client' — the client reaches it through its own newHubMap (mp.js:385 / sync.js:72) and reproduces the prop deterministically from synced CAMPAIGN; a client-skip would make the prop host-only and break the before/after read for player 2.

#### A4 · Prep / locate

- [ ] Confirm in js/hub.js enterHubFromCombat (line ~565) that the capture point is BEFORE line 595 `G=newHubMap()`: the combat `state` is still live there, the global `mapIndex` (js/state.js:6) still holds the just-played mission (it is only reassigned at line 596 AFTER newHubMap), and `state._vetLost` (boolean, set in js/lore.js:248) + `hubEnsureStats(state).unitsLost` (js/hub.js:209-211) are both readable.
- [ ] Confirm in js/hub.js newHubMap (line 839) that it takes NO args and returns a freshly-built `state`; the hook must be added INSIDE it operating on the local `state`, placed AFTER hubSpawnRoster(state) (line 856) and before `return state` (line 864), mirroring the hubBuildRoads(state) call at line 854.
- [ ] Confirm in js/hub.js that newHubMap seeds via `makeRng(424242 + CAMPAIGN.visit*17)` (line 840) — the dressing RNG must derive purely from synced CAMPAIGN fields (visit + lastMission), NOT Math.random, so all three netRoles agree.
- [ ] Confirm in js/net/mp.js (beginClientHub, lines 380-385) and js/net/sync.js (lines 70-72) that the co-op CLIENT reconstructs the hub by running `deserializeHubCampaign(msg.campaign)` then `G=newHubMap()` — so a pass seeded off synced CAMPAIGN re-derives byte-identically on the client with no extra wiring.
- [ ] Confirm in js/save.js deserializeGame (lines 198-217) that on LOAD the hub `g.entities` are restored from the serialized snapshot and newHubMap is NOT re-run (only hubBuildRoads/hubSpawnTrainees/hubSpawnHealers re-run) — therefore a dressing pass living ONLY inside newHubMap cannot double-spawn on load.
- [ ] Confirm in js/corpses.js corpsesTick (line 182-183) that it early-returns on `state.hub` — so any kind:'corpse' entity in the hub is inert (never harvested, no memory dialog), making it a safe prop.
- [ ] Confirm in js/render.js drawCorpse (line 2888-2902) that a corpse with `reached` falsy draws a pulsing cyan pickup beacon + chip-glint (line 2892) — therefore the dressing prop MUST set `reached:true` to read as a silent prop.
- [ ] Confirm in js/render.js _corpseSource (line 2777-2785) + corpseSprite (line 2813) that faction-correct gore (neon coolant vs oxblood) is driven by `corpse.src` through isCyborgBody (js/corpses.js:33) — src:'ao' → A&O synthetic, src:'civilian' → worker/oxblood, src:'<unitType>' → DEF.cyborg-derived.
- [ ] Confirm in js/hub.js hubDefaultCampaign (lines 94-122) that there is NO `lastMission` key today, and deserializeHubCampaign uses `Object.assign(CAMPAIGN, data)` (line 130) — so adding a default makes old saves legacy-safe (missing key → default).

#### A4 · First slice (ship this)

- [ ] In js/hub.js hubDefaultCampaign (line ~109, beside `lastReward:null`), add `lastMission:null` so the field always exists and old saves default to null via the Object.assign merge.
- [ ] In js/hub.js enterHubFromCombat, BEFORE line 595 `G=newHubMap()` (place it right after the reward/storyFlags block, e.g. after line 585), capture `CAMPAIGN.lastMission = { unitsLost: (hubEnsureStats(state).unitsLost||0), vetLost: !!state._vetLost, mapIndex: mapIndex };` using the global `mapIndex` (still the just-played mission at this point).
- [ ] In js/corpses.js, add a new function `hubDressAftermath(state)` that: reads `lm = (typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.lastMission)`; returns early if `!lm`; builds a deterministic RNG via the makeRng family seeded off synced CAMPAIGN only, e.g. `makeRng((424242 + CAMPAIGN.visit*17 + 0xAF7E + (lm.mapIndex||0)*131) >>> 0)`; derives the corpse `src` faction-correctly from `lm.mapIndex` (read the just-played map's enemy faction from MAPS[lm.mapIndex] — A&O maps → src:'ao', else src:'civilian'); picks ONE tile near the returns plaza deterministically (anchor on HUB.player {x:60,y:58} jittered by the seeded RNG, e.g. dx/dy in [-4..4]); snaps it to walkable via the existing _corpseSnap(state, tx, ty) (js/corpses.js:48); then spawns ONE inert prop with mkEntity: `mkEntity(state,'corpse','neutral',tx,ty,{ kind:'corpse', src, reached:true, hubProp:true, gore:(rng()<0.5?'bleeding':null), r:10, sight:0, hp:1, maxHp:1 })` and pushes it onto state.entities — with NO memId and NO group (so quests/pickup never see it).
- [ ] In js/corpses.js hubDressAftermath, do NOT add any `netRole==='client'` early-return (unlike spawnCrewBodies line 100) — the client must run it inside its own newHubMap to reproduce the prop; it is fully deterministic from synced CAMPAIGN so this is safe.
- [ ] In js/corpses.js, expose the new function on window in the `if(typeof window!=='undefined')` block (lines 198-202), e.g. `window.hubDressAftermath=hubDressAftermath;`, matching the existing exports.
- [ ] In js/hub.js newHubMap, add `if(typeof hubDressAftermath==='function') hubDressAftermath(state);` immediately after `hubSpawnRoster(state);` (line 856), guarded by typeof so script-order load never throws.

#### A4 · Deferred / follow-on slices

- [ ] Scale the dressing SET: drive corpse count off `lm.unitsLost` (e.g. min(1+floor(unitsLost/3), cap)) and cluster them with seeded jitter around the plaza, all from the same deterministic RNG.
- [ ] Add a frozen scorch DECAL as a baked prop (NOT the 12s scorches[] FX queue in render.js:3272 — it decays; introduce a render-only `hubScorch` entity kind or a persistent feature mark instead) so burn marks survive.
- [ ] Add a faction-correct WRECK prop when `lm.mapIndex` was a heavy/boss map, reusing the kind:'wreck' entity + drawWreck (render.js:3022); keep it neutral/non-blocking like spawnWrecks (js/corpses.js:134).
- [ ] Gate on `lm.vetLost` to optionally spawn a medic/mourner NPC near the plaza, reusing the hub_npcs.js medic NPC pattern (note: NPC routines must stay visit-pure per the living-hub contract).
- [ ] Add an in-world memorial micro-beat (a toast or one-line dialog on first hub frame) reading the casualty count from CAMPAIGN.lastMission, host/solo-authoritative only.

#### A4 · Constraints & safety

- [ ] Save-compat: CAMPAIGN.lastMission defaults to null in hubDefaultCampaign (legacy saves merge to null via Object.assign in deserializeHubCampaign) → hubDressAftermath no-ops on old saves; do NOT bump SAVE_VERSION.
- [ ] Save-compat / no double-spawn: keep hubDressAftermath called ONLY inside newHubMap. On load, deserializeGame restores hub entities from the snapshot and never calls newHubMap (save.js:198-217), so the already-serialized prop is preserved and never re-derived → no duplicate.
- [ ] Solo (netRole 'solo'): enterHubFromCombat captures lastMission, then newHubMap → hubDressAftermath spawns the prop locally. Reaches the player directly.
- [ ] Host (netRole 'host'): identical capture+spawn path; the prop is a real entity included in the authoritative snapshot AND CAMPAIGN.lastMission rides serializeHubCampaign in the 'mphub' payload (mp.js:541) and snapshots.
- [ ] Client (netRole 'client'): does NOT capture (host-only) but DOES re-derive — beginClientHub/sync.js run deserializeHubCampaign(synced lastMission) then G=newHubMap() → hubDressAftermath reproduces the identical prop from the seeded RNG. Verify the seed uses only CAMPAIGN fields the client has (visit + lastMission), never state.seed/Math.random/local time.
- [ ] Determinism: seed the RNG strictly from `424242 + CAMPAIGN.visit*17 + constant + lm.mapIndex*k` (the same makeRng family newHubMap already uses); _corpseSnap is deterministic; do NOT read wall-clock, Math.random, or per-machine state. The dressing must be byte-identical across solo/host/client for the same CAMPAIGN.
- [ ] Rollback guard: this is hub-only entity SPAWN at map construction, not a per-tick FX, so no `!window._rbReplaying` guard is needed here (rollback resims combat ticks, never newHubMap). Do NOT call spawnRing/toast/dialog inside hubDressAftermath. If a later slice adds spawn FX, gate it with `if(window._rbReplaying) return;` like corpseExtract (js/corpses.js:168).
- [ ] Inert-prop safety: set `reached:true` (suppresses the cyan pickup beacon in drawCorpse render.js:2892) and omit memId/group so corpsesRemaining/corpsesTotal/the collectMemories quest never count it; corpsesTick already skips it via the state.hub early-return (corpses.js:183).
- [ ] Art-direction (dark): reuse the existing corpseSprite gore (cold death tint + matte oxblood / neon-coolant for synth) — it is already dark/devastated cyberpunk; do NOT add bright bloom beyond the synthetic coolant the sprite path already emits.
- [ ] Faction-correctness: derive src from MAPS[lm.mapIndex] enemy faction so A&O maps produce src:'ao' (synthetic, neon) and others produce src:'civilian' (oxblood), routing through the single isCyborgBody source of truth (corpses.js:33).

#### A4 · Verification

- [ ] Serve the repo: `python3 -m http.server 8000` from /Users/gabriel.bussular/Workspace/starleft, then open http://localhost:8000/rts.html.
- [ ] Solo: start a campaign mission, lose at least one unit (so unitsLost>0 / _vetLost may be true), complete it and extract to the H.U.B.; observe ONE faction-correct corpse prop near the returns plaza (HUB.player ~tile 60,58). Confirm it is silent (no pulsing cyan beacon, no memory dialog when a unit walks over it).
- [ ] Faction check: replay distinct missions — an A&O map should produce a neon/synthetic corpse (coolant pool + bloom), a non-A&O map an oxblood civilian corpse — confirming isCyborgBody routing.
- [ ] Save/load persistence: in the dressed hub, Save Game, reload rts.html, Load Game; confirm the SAME corpse prop reappears at the SAME spot and is NOT duplicated (proves serialize round-trip + no re-derivation on load).
- [ ] Co-op host/client parity: serve over http(s), host a co-op campaign, win a mission so both peers transition to the H.U.B.; confirm BOTH the host and the client see the corpse prop at the identical tile (proves CAMPAIGN.lastMission rode 'mphub' and the client's newHubMap re-derived byte-identically).
- [ ] Legacy save: load a pre-existing hub save written before this change; confirm it loads cleanly with NO corpse prop (CAMPAIGN.lastMission===null → hubDressAftermath no-ops) and no console error.
- [ ] Determinism spot-check: from the same hub visit, console-run `hubDressAftermath(G)` twice is NOT needed — instead confirm re-entering the hub on the same CAMPAIGN.visit/lastMission yields the prop at the same tile across solo and a second client join.

**Verification summary.** Verified by reading the real anchors: hub.js (enterHubFromCombat capture point before line 595, newHubMap parameterless at 839 with hubBuildRoads at 854 / hubSpawnRoster at 856 / return at 864, hubDefaultCampaign 91-122 with no lastMission key + Object.assign merge), corpses.js (mkEntity-based corpse spawn pattern in spawnMemBodies 60-73, isCyborgBody 33, corpsesTick state.hub early-return 183, window exports 198-202), render.js (drawCorpse pickup-beacon gated on !reached 2892, corpseSprite/_corpseSource faction-correct gore 2777-2887, scorches 12s decaying FX 3272-3288), save.js (hub entities restored from snapshot not re-run via newHubMap 198-217), net/mp.js + net/sync.js (client rebuilds hub via deserializeHubCampaign+newHubMap, 'mphub' carries campaign 541), map.js (mkEntity signature 1127). First slice = capture CAMPAIGN.lastMission before newHubMap + ONE deterministic faction-correct inert corpse prop re-derived inside newHubMap, safe across solo/host/client and save/load.

---

### Task A5 — Affinity → combat perk: wire orphan ohKeepsakeBonus()/ohDeploySynergy() into the deploy-time HP buff

**Goal.** Translate Off-Hours bond tier (bond.t) into a small transient deploy-time max-HP buff for the owning player's veterans, by wiring the already-implemented-but-orphan ohKeepsakeBonus()/ohDeploySynergy() into the authoritative applyVetHp() rebake.

**Effort:** S  ·  **Risk:** Low — no new counter, no save field, no snapshot-shape change; the orphan functions are pure read-only queries over CAMPAIGN.offhours.bonds, and the HP rebake already runs host/solo-authoritative with hp/maxHp synced to the client for free. Main pitfall: applyVetHp() is also re-called during HUB condo/implant rebakes, so the buff must be scoped to in-mission deploy (or to player units in a non-hub state) so it does not leak into HUB stat displays or stack on every rebake.

> **No net-shape change.** No snapshot-shape change. The perk only alters u.maxHp/u.hp, which sync.js already packs per entity (o.hp line 113, o.mh maxHp line 113, o.st stars line 122). The co-op client receives the host-computed HP through the existing entity merge and renders it — no new field is folded into any snapshot, and no save field is added (the perk is derived live from CAMPAIGN.offhours.bonds, which already round-trips through hub serialize/load).

**Files touched:** `js/career.js (applyVetHp — fold a keepsake-derived multiplicative factor, gated to in-mission player vets; this is the single edit for the first slice)`, `js/offhours.js (READ-ONLY for first slice — ohKeepsakeBonus/ohDeploySynergy already defined + published on window; only touched if a later slice needs a new accessor)`, `js/offhours_data.js (READ-ONLY — tierPts/tune reference, no change)`

**Corrections found vs. the design doc:**
- Design doc (A5, lines 211-216) says to wire the perk into 'the authoritative deploy / applyVetHp path in js/units.js'. STALE: applyVetHp() lives in js/career.js (lines 85-90), NOT units.js. units.js contains no applyVetHp and only references .stars at lines 966/1542 (target-scoring and an unrelated check). The deploy call sites (spawnVets/spawnVetsP2/_placeHero/spawnHeroes) are also all in career.js.
- Design doc cites 'js/offhours.js:243' for both functions; precise lines are ohDeploySynergy at ~235 and ohKeepsakeBonus at ~243 (243 is the keepsake function, matching the doc's anchor, but the synergy fn is a few lines above).
- Confirmed (not a correction, but worth flagging vs the doc's 'call ohKeepsakeBonus(u) in the vet HP-apply path'): applyVetHp is also re-invoked during HUB condo/implant rebakes (hub.js:1359/1818/1860/etc.), so the first slice MUST gate the factor to in-mission player units — a detail the doc's one-line first-slice phrasing omits and which is necessary to avoid the buff leaking into / compounding in the HUB.
- ohDeploySynergy(a,b) requires TWO units (a co-deployed bonded partner) and returns a pair-bonus, so it cannot drop into applyVetHp(u) as-is; the doc lists both functions together but only ohKeepsakeBonus(u) fits the single-unit deploy-time rebake for the first slice — synergy is correctly a follow-on.

#### A5 · Prep / locate (confirm anchors before touching anything)

- [ ] Confirm js/offhours.js ohDeploySynergy(a,b) (line ~235): takes TWO units, returns a small FRACTION (0.02 + 0.02*tier for friend/romance/confidant, 0.015*tier for rival, else 0) — a pair-bonus, needs a partner unit, not a single-unit query.
- [ ] Confirm js/offhours.js ohKeepsakeBonus(u) (line ~243): takes ONE unit, scans bonds whose id contains ohUnitKey(u) with OH_FL.KEEPSAKE (16) set, returns Math.min(0.05, n*0.02) — a per-unit fraction, the natural first-slice driver (no partner needed).
- [ ] Confirm via grep that BOTH functions are called nowhere in the sim — only defined and published on window in js/offhours.js (verified: grep finds only the def + the window.* publish line). They are true orphans.
- [ ] Confirm js/career.js applyVetHp(u, fullHeal) (lines 85-90) is THE authoritative HP rebake: maxHp = round(base * (1 + hpPerStar*stars) * (u.hubHpMul||1) * reborn * seriesInf), then hp = round(maxHp*ratio). This is the multiplicative-factor chokepoint, NOT a units.js function (design doc says units.js — STALE).
- [ ] Confirm the deploy call sites that run applyVetHp(u,true) at mission start: spawnVets (career.js:264, solo/host p1 carryover), spawnVetsP2 (career.js:247, co-op p2 ally track), _placeHero via spawnHeroes (career.js:373/393, named heroes). All set u.stars then call applyVetHp(u,true).
- [ ] Confirm applyVetHp is ALSO re-called inside the HUB (hub.js:1359, 1818, 1828, 1859-1860, 2296, 2340, 2499 etc.) on condo/implant upgrades — so any new factor folded into applyVetHp must be gated to NOT apply (or be neutral) while in the HUB, or HUB unit cards / world HP will show the perk and it will compound on every rebake.
- [ ] Confirm CAMPAIGN is a module global (hub.js:89 let CAMPAIGN=hubDefaultCampaign()) persisting across newMap, and ohBonds() reads CAMPAIGN.offhours.bonds — so the bond ledger IS readable in-mission at deploy time (legacy-safe: bonds defaults to {} per hub.js:152-153).
- [ ] Confirm sync.js packs per-entity hp (line 113, o.hp/o.mh=maxHp) and stars (line 122) — so a host-computed maxHp buff reaches the co-op client through the normal snapshot with no sync.js change.
- [ ] Confirm OFFHOURS.tune.tierPts (offhours_data.js:21 = [0,100,250,450,700], maxTier 4) and that bond.t (tier 0..4) is the affinity the perk reads — no new counter needed.

#### A5 · First slice (ship this) — keepsake max-HP buff at deploy

- [ ] In js/career.js applyVetHp(u, fullHeal), add a deploy-time keepsake factor: after computing base/ratio/seriesInf, derive const keepMul = (u.owner==='player' && typeof ohKeepsakeBonus==='function') ? (1 + ohKeepsakeBonus(u)) : 1; and multiply it into the maxHp expression alongside hubHpMul (e.g. * keepMul). Keep it the LAST factor so it reads clearly as the affinity stake.
- [ ] Guard the factor so it does NOT apply in the HUB: gate keepMul on the unit being in a combat mission, e.g. only apply when (typeof G==='undefined' || !G || G.mode!=='hub') AND u.owner==='player' — confirm the exact in-mission discriminator (G.mode / G.hub / state.cfg.isHub) by reading how other code distinguishes HUB vs mission, and use the same predicate. This prevents the perk from inflating HUB roster cards (ui.js hubUnitMaxHp) and from compounding on every condo rebake.
- [ ] Verify the factor stays correct under applyVetHp's ratio-preservation: since deploy uses fullHeal=true (ratio=1), the buff lands as extra max HP at full health; on later in-mission rebakes (fullHeal=false) the ratio is preserved so the buff does not heal the unit — confirm no double-apply by re-reading the formula (it recomputes from base every call, so it is idempotent, not cumulative).
- [ ] Do NOT touch the condo-level +HP path (u.hubHpMul, set in hub.js:1368 / hubApplyUpgrades) — that is the upgrade economy, a different system. Do NOT touch hubSpend / service-discount call sites (wider blast radius, explicitly deferred).
- [ ] Manually sanity-check the magnitude: ohKeepsakeBonus caps at 0.05 (+5% max HP for a vet holding 3+ keepsakes) — confirm this reads as a small felt stake, not a balance swing, against DEF[type].hp values in config.js.

#### A5 · Deferred / follow-on slices

- [ ] Wire ohDeploySynergy(a,b) as a SEPARATE pair-bonus: when two bonded vets deploy on the same map, grant each the synergy fraction. This needs a deploy-time pairing pass (after all of spawnVets/spawnVetsP2/spawnHeroes have placed units) that, for each player vet, finds the best-bonded co-deployed partner and folds (1+ohDeploySynergy) into a re-applyVetHp — defer because it requires a post-spawn second pass and partner-selection rules, vs the single-unit keepsake which drops straight into applyVetHp.
- [ ] Optionally surface the perk in the UI: a small affinity/keepsake glyph or tooltip on the carry-chooser / dossier so non-story players SEE that bar-built bonds gave a battlefield edge (purely cosmetic, ui.js).
- [ ] Optionally extend ohDeploySynergy to non-HP stats (small dmg or madosis-resist) once the HP slice is proven — keep each stat in its authoritative rebake (vetDmgMul etc.), never client-side.

#### A5 · Constraints & safety

- [ ] Save-compat: NO new persistent field and NO SAVE_VERSION bump — the perk is derived live from CAMPAIGN.offhours.bonds (bond.t / OH_FL.KEEPSAKE), which already round-trips through hub serialize/load; an old save with no bonds yields ohKeepsakeBonus===0 (empty bonds → loop finds nothing → returns 0), so legacy saves deploy at baseline HP with zero behavior change.
- [ ] netRole — solo: applyVetHp runs in spawnVets at mission start; the buff applies directly. State this is the reference path.
- [ ] netRole — host: applyVetHp runs host-authoritatively in spawnVets/spawnVetsP2/spawnHeroes; the resulting maxHp/hp are packed per-entity in the snapshot (sync.js:113 o.hp/o.mh) and reach the client RENDERED, not recomputed.
- [ ] netRole — client: clients NEVER run applyVetHp / the deploy spawns — they only apply host snapshots. Therefore the perk MUST live entirely in applyVetHp (host/solo path) and must NOT be added to any client-side stat computation, or co-op HP diverges. Add an explicit code comment at the new factor noting 'host/solo-authoritative; client renders the synced maxHp'.
- [ ] Determinism: ohKeepsakeBonus is a pure deterministic read (no Math.random, no rng) over the bonds object; the factor is a stable function of bond flags, so host and any rollback re-sim produce identical maxHp. No simRandom involvement.
- [ ] Rollback guard: the HP rebake is DETERMINISTIC SIM STATE and MUST replay (mirroring promoteIfReady, career.js:105 which deliberately omits the guard) — do NOT add !window._rbReplaying around the maxHp math. Only add the guard if a COSMETIC cue (toast/floater) is introduced; the first slice adds no FX, so no guard is needed.
- [ ] Art-direction: first slice is a stat buff with no new visual; if a later slice adds a keepsake glyph, keep it dark/devastated-cyberpunk per project rule.
- [ ] Confirm the perk does not stack on every applyVetHp call: because applyVetHp recomputes maxHp from DEF base each time (not from current maxHp), the keepsake factor is applied once-per-rebake and never compounds — verify by re-reading lines 86-89.

#### A5 · Verification

- [ ] Serve: python3 -m http.server 8000 from repo root, open http://localhost:8000/rts.html.
- [ ] Set up a bond: play to the HUB, open The Off-Hours, GIFT a veteran (sets OH_FL.KEEPSAKE on a bond) so ohKeepsakeBonus(u) for that vet returns >0; note the vet's identity.
- [ ] SOLO check: dispatch to a mission carrying that vet. In console run the vet's entity and confirm its maxHp is ~2% higher than an equivalent same-type/same-stars vet WITHOUT a keepsake (e.g. compare two carried vets, one gifted one not). Confirm a vet with NO keepsake deploys at exactly the legacy maxHp (regression guard).
- [ ] HUB-leak check: back in the HUB, open the roster/dossier and confirm the keepsake vet's HUB card maxHp (hubUnitMaxHp/ui.js) does NOT show the +HP perk and that opening a condo upgrade and re-baking does not compound HP — proves the in-mission gate works.
- [ ] Save/load check: with the keepsake bond set, save, reload the page, Load Game, re-dispatch — confirm the buff re-derives identically (no new field needed). Then load an OLD save made before this change and confirm it loads and vets deploy at baseline HP (legacy default).
- [ ] CO-OP check (host + client, served over http): host a co-op game with a keepsake vet carried, dispatch a mission. On the HOST confirm the buffed maxHp; on the CLIENT confirm the same vet renders the SAME maxHp/hp bar (received via snapshot) — proving the client renders the host-authored stat and does not diverge. Verify a p2 (spawnVetsP2) vet with a keepsake also shows the buff on both screens.

**Verification summary.** Verified by reading the actual code: ohKeepsakeBonus(u) (offhours.js:243) and ohDeploySynergy(a,b) (offhours.js:235) are grep-confirmed orphans (defined + published on window only, zero sim call sites). ohKeepsakeBonus returns a per-unit fraction capped at 0.05 from KEEPSAKE-flagged bonds; ohDeploySynergy returns a per-pair fraction needing a partner. The authoritative HP rebake is applyVetHp(u,fullHeal) at career.js:85-90 (NOT units.js as the doc claims), called at every deploy site (spawnVets:264, spawnVetsP2:247, _placeHero:373) and at HUB rebakes. CAMPAIGN.offhours.bonds is readable in-mission (CAMPAIGN is a module global persisting across newMap; bonds defaults to {} → legacy-safe). sync.js packs hp/maxHp/stars per entity, so a host-side maxHp buff reaches the co-op client rendered, with no save or snapshot-shape change. First slice = one gated multiplicative factor in applyVetHp.

---

### Task AX — A-parked · Dress the wasteland — a cold buried wreck staging the SE blast-zone

**Goal.** Spawn an optional HUB.wrecks array as neutral, cold (no-fire) wreck render-props in newHubMap so the empty SE wasteland tells a years-old-scar story and pays off the unexplained toxic-green haze.

**Effort:** M  ·  **Risk:** Low-Med. Main hidden risk is the hub schema normalizer silently dropping a new HUB_MAP_DATA key (design doc missed this). Render perf of a fire/smoke wreck if cold-variant flag is forgotten. Everything else (entity shape, netRole, save) follows existing precedents.

> **No net-shape change.** HUB is host/p1-only and is NOT snapshot-synced (the parity audit accepts the hub as p1-only). The wreck is a neutral render-prop spawned in newHubMap, which the co-op client also runs locally off synced CAMPAIGN — so it reproduces with zero snapshot change. (Combat-map packEnt at sync.js:166 already sends wreck.half but NOT a new cold flag; that only matters for non-hub maps, which are out of scope for this mechanic. If a cold wreck is ever placed on a combat map via cfg.wrecks, add o.cd=e.cold to packEnt + unpack — note as a deferred caveat, not required here.)

**Files touched:** `js/hub_map_schema.js (add wrecks to HUB_MAP_DEFAULTS + HUB_MAP_ALLOWED.root + normalizeWreck mapper + out.wrecks + validation warning)`, `js/render.js (drawWreck ~line 3022-3027: guard drawWreckFire + _wreckSmoke behind if(!e.cold))`, `js/hub.js (newHubMap ~after line 855: HUB.wrecks spawn loop via mkEntity neutral wreck)`, `js/hub_map_data.js (add root-level wrecks:[{id,x,y,half,cold}] array with one entry in the wasteland)`

**Corrections found vs. the design doc:**
- The design doc says to inject HUB.wrecks consumed by newHubMap, but MISSES that js/hub_map_schema.js `hubNormalizeMapData` (line 178) rebuilds a whitelisted `out` object and SILENTLY DROPS unknown keys — so a bare `wrecks` key in HUB_MAP_DATA never reaches HUB.wrecks. The schema (HUB_MAP_DEFAULTS line 20 + HUB_MAP_ALLOWED.root line 11 + a normalizeWreck mapper + out.wrecks line) MUST be extended first, or the whole mechanic is a no-op. This is the single most important correction.
- The prompt names a `mdc_waste` footprint to avoid — it DOES NOT EXIST. The MDCs are mdc_nw/ne/sw/ultra (hub_map_data.js:55-134) and none fall inside the wasteland rect (mdc_ultra is at 51,52, outside x0:66). The only footprints to dodge in the wasteland are the four waste_ruin_1..4 (hub_map_data.js:555-626, all tagged hubWaste).
- The design doc's save/netRole note ('hub entities re-spawn deterministically on load') is imprecise: js/save.js:120 SERIALIZES hub entities and js/save.js:198 RESTORES them directly — newHubMap is NOT re-run on load. So the wreck round-trips from the save (not re-derived), which is actually SAFER (no double-spawn). Re-derivation only happens on a fresh hub entry / on the co-op client's local newHubMap.
- `drawWreck` (render.js:3022) has NO existing cold/no-fire path — the design doc implies a 'cold wreck variant' flag exists or is trivial; it must be ADDED as an `if(!e.cold)` guard around BOTH drawWreckFire (3026) and _wreckSmoke (3027). wreckSprite itself (the hull/scorch/dirt/debris) is fire-independent and needs no change.
- For the HUB target specifically, NO net-shape change is needed (the doc already says netRole-safe like the Dark Tower, which is correct) — but the combat-map packEnt at sync.js:166 currently sends only `half`, not a `cold` flag; that only matters if a cold wreck is ever placed on a non-hub map, which is explicitly out of scope here.

#### AX · Prep / locate

- [ ] Confirm js/hub.js:839 `newHubMap()` — the build sequence (hubBuildTerrain → hubApplyTopography/buildTopoFeatures → baseBlocked loop → hubPlacePois → hubBuildRoads → hubBuildRoadCost → hubSpawnRoster → hubRevealAll → recomputeSupply → clusterTopoFeatures → return state). The wreck spawn loop goes AFTER hubBuildRoadCost (line 855) and BEFORE return (line 864); wrecks are non-blocking (sight:0) so road order is cosmetic, but place after roads so it reads as set-dressing.
- [ ] Confirm js/corpses.js:134 `spawnWrecks(state,cfg)` + line 137 the exact wreck mkEntity shape: `mkEntity(state,'wreck','neutral', w.x|0, w.y|0, {kind:'wreck', half:(w.half||'back'), r:14, sight:0, hp:1, maxHp:1})`. This is the shape to mirror for the hub wreck (NOT call spawnWrecks itself — it reads cfg.wrecks, map.js-only).
- [ ] Confirm js/map.js:1127 `mkEntity(state,type,owner,tx,ty,extra)` — it assigns id from state.nextId, x/y from tile centre, selected:false, dead:false, merges extra; neutral owner gets NO ctrl tag. Available as a global to hub.js (loaded after map.js per hub.js header comment line 3).
- [ ] Confirm js/render.js:3022 `drawWreck(state,e,ox,oy)` ALWAYS calls drawWreckFire (line 3026) + _wreckSmoke (line 3027) — there is NO existing cold/no-fire flag. A `e.cold` guard must be added around both calls. Confirm wreckSprite (line 2914) renders the rotated/buried/scorched/debris hull independent of fire — so a cold wreck still draws the hull, just without live fire+smoke.
- [ ] Confirm js/render.js:648-650 + 728 the depth-sort dispatch: `else if(e.kind==='wreck'){ depth.push({y:e.y, wreck:e}) }` then `else if(d.wreck) drawWreck(...)`. A hub wreck with kind:'wreck' flows through this unchanged — no render-dispatch edit needed beyond the cold guard.
- [ ] Confirm js/render.js:1648 `drawWastelandRockFog` is real (the toxic-green [86,235,74]/[92,255,82] haze blobs) — this is the haze the wreck is meant to explain. Used for narrative justification only; no edit.
- [ ] Confirm js/hub_map_data.js wasteland region = {x0:66,y0:68,x1:123,y1:101} (line 9) and the four occupied footprints to AVOID: waste_ruin_1 (tx79,ty72,11x9), waste_ruin_2 (tx107,ty69,13x9), waste_ruin_3 (tx96,ty93,15x9), waste_ruin_4 (tx74,ty91,12x9) — all tagged hubWaste (hub_map_data.js:555-626). NOTE: the prompt's `mdc_waste` footprint DOES NOT EXIST — the four MDCs are mdc_nw/ne/sw/ultra and none fall inside the wasteland rect; only waste_ruin_1..4 must be dodged.
- [ ] Confirm the netRole-safe precedent: the Dark Tower is a `cfg.scenery`/`e.scenery` neutral prop made non-selectable at js/input.js:242 (`if(e.scenery) continue`). The wreck needs NO scenery flag — selection box at input.js:157 already filters to kind==='unit'&&owner==='player', so a neutral kind:'wreck' is non-selectable for free.
- [ ] BLOCKER (design-doc miss) — Confirm js/hub_map_schema.js:178 `hubNormalizeMapData` builds a fresh whitelisted `out` object (lines 183-207) and does NOT copy unknown keys; HUB = Object.assign(defaults, hubNormalizeMapData(HUB_MAP_DATA)) at hub.js:7-10. A bare `wrecks` key in HUB_MAP_DATA is SILENTLY DROPPED → HUB.wrecks is always undefined. Confirm the whitelist HUB_MAP_ALLOWED.root (line 11) and HUB_MAP_DEFAULTS (line 20) must both be extended for wrecks to survive.
- [ ] Confirm save path: js/save.js:120 `s.entities = G.entities.map(serializeEntity)` — hub entities ARE serialized (the `entities:1` in SKIP at line 111 belongs to a different serialize loop; the real write is line 120). And js/save.js:198 `g.entities = s.entities.map(...)` restores them DIRECTLY on load — newHubMap is NOT re-run on load, so the wreck is round-tripped from the save, not re-derived → no double-spawn risk.

#### AX · First slice (ship this)

- [ ] In js/hub_map_schema.js add `wrecks:[]` to HUB_MAP_DEFAULTS (the object starting line 20) so the default merge always yields an array.
- [ ] In js/hub_map_schema.js add `'wrecks'` to the HUB_MAP_ALLOWED.root array (line 11) so validation does not warn 'Unknown root field: wrecks'.
- [ ] In js/hub_map_schema.js add a `normalizeWreck(w, fallback, idx, W, H)` mapper (mirror normalizeRect at line 115): clamp x/y into [0,W-1]/[0,H-1], default half to 'back', coerce cold to boolean (default true for hub scars), carry an optional id. Add an `out.wrecks = (Array.isArray(src.wrecks)?src.wrecks:base.wrecks).map((w,i)=>normalizeWreck(...))` line inside hubNormalizeMapData's `out` build (alongside line 204's megaSprites). Add a `wreck` key to HUB_MAP_ALLOWED with its field whitelist + a hubUnknownKeys warning loop in hubValidateMapData (mirror the mega block ~line 236).
- [ ] In js/render.js guard the fire+smoke in `drawWreck` (lines 3026-3027): wrap `drawWreckFire(...)` and `_wreckSmoke(...)` in `if(!e.cold){ ... }` so a cold wreck draws only the baked hull/scorch/dirt/debris from wreckSprite — a years-old buried scar, not a fresh crash (art direction: dark/devastated, no live flame).
- [ ] In js/hub.js `newHubMap()` add a wreck spawn loop after hubBuildRoadCost (line 855), before return (line 864): `for(const w of (HUB.wrecks||[])){ const e=mkEntity(state,'wreck','neutral', w.x|0, w.y|0, {kind:'wreck', half:(w.half||'back'), cold:(w.cold!==false), r:14, sight:0, hp:1, maxHp:1}); state.entities.push(e); }`. Mirror spawnWrecks (corpses.js:137) exactly, plus the new `cold` field. Default cold to true.
- [ ] Author ONE wreck entry in js/hub_map_data.js root: `"wrecks": [{ "id":"waste_wreck_1", "x":<tx>, "y":<ty>, "half":"front", "cold":true }]`. Pick (x,y) inside the wasteland rect (66-123 × 68-101) but clear of waste_ruin_1..4 footprints — e.g. around tx 90-100, ty 80-88 (the open gap between waste_ruin_2 at the top and waste_ruin_3 below). Verify the chosen tile is not under a ruin and reads against the green haze.
- [ ] Verify wreckSprite anchoring at the chosen hub coords: the sprite is ~bomber*1.7 and extends well above/around (e.x,e.y); confirm in-browser it doesn't visually collide with a waste_ruin sprite or the wasteland's desert/scorch terrain in an ugly way; nudge x/y in hub_map_data.js if so.

#### AX · Deferred / follow-on slices

- [ ] Clickable cordon SIGN — a NEW selectable entity kind (e.g. kind:'sign'): requires (a) a render sprite, (b) selection support in js/input.js (it is currently filtered out like every non-unit), (c) a UI panel / dossier-style readout in js/ui.js for the cordon lore text, (d) mobile tap-to-select, and (e) if ever on a combat map, net pack/unpack in js/net/sync.js. Out of scope for the first slice — ship the cold wreck alone first.
- [ ] Additional cold wrecks / cold scar props — once one wreck is proven across solo/host/client + save-load, expand HUB.wrecks to 2-3 entries staging the full blast-zone; optionally a deterministic scorch/crater decal at each wreck base (entity-based, NOT the 12s decaying scorches[] FX queue — that cannot hold a frozen mark, per the A4 finding).
- [ ] Combat-map cold wrecks — if a cold wreck is ever wanted on a non-hub map via cfg.wrecks, add `if(e.cold) o.cd=1;` to packEnt (js/net/sync.js:166-167) + read it in the client unpack so the co-op client also draws it cold. Not needed for the hub-only first slice.

#### AX · Constraints & safety

- [ ] Save-compat (legacy default): HUB.wrecks defaults to [] in HUB_MAP_DEFAULTS, so an old HUB_MAP_DATA with no wrecks key → empty loop → no behavior change. The `cold` field defaults true via `w.cold!==false`. Hub entities serialize (save.js:120) and restore directly (save.js:198) — an old save written before this lands simply has no wreck entity; entering the hub fresh (newHubMap) spawns it, so old saves gain the wreck on next hub visit with no SAVE_VERSION bump.
- [ ] netRole — solo: main.js runs update/newHubMap directly; wreck spawns in newHubMap → renders. Host: same path, authoritative; wreck is a neutral non-blocking prop, no sim effect. Client: the HUB is host/p1-only and NOT snapshot-synced, but the co-op client runs its OWN newHubMap off synced CAMPAIGN (visit count is the seed), so HUB.wrecks (static data, identical on both peers) spawns the SAME wreck deterministically on the client. Exactly the Dark Tower / megaSprite precedent — reaches the client for free, no net-shape change.
- [ ] Rollback guard (!window._rbReplaying): NOT required for spawn — newHubMap is not in the rollback resim path. The fire/smoke FX in drawWreck are render-only and already self-contained (WeakMap/Map pools keyed by entity id); with the cold variant they don't even run. No new FX site is added that fires during update(), so no _rbReplaying guard is needed.
- [ ] Determinism: the wreck position is static authored data (HUB_MAP_DATA.wrecks), mkEntity id comes from the deterministic state.nextId counter — byte-identical across peers and reloads. wreckSprite uses e.id for its debris jitter (deterministic per entity).
- [ ] Art direction (dark): the cold variant is mandatory — drawWreckFire produces bright additive orange flame (255,170,85) that reads as a FRESH crash and fights the years-old-scar / dark-devastated-cyberpunk direction (and costs per-frame fill). The cold wreck shows only the burnt/buried/scorched hull, consistent with the dead wasteland.
- [ ] Perf: a cold wreck skips the per-frame fire (9 flame tongues + glow) and the capped smoke particle pool (up to 36 parts) — so it is render-cheap (one cached hull blit). Keep cold:true the default for hub scars.

#### AX · Verification

- [ ] Serve: `python3 -m http.server 8000` from repo root, open http://localhost:8000/rts.html.
- [ ] Solo: enter the H.U.B. (extract from a mission or load a hub save), pan the camera to the SE wasteland (tiles ~66-123 × 68-101). Confirm: the buried wreck hull is visible among the green haze, NO live fire, NO rising smoke column, and it sits clear of the four waste_ruin ruins. Confirm the toxic-green drawWastelandRockFog haze now reads as 'this wreck poisoned the ground'.
- [ ] Selection check: left-click and box-drag over the wreck — confirm it is NOT selectable (no selection ring, click falls through to ground), matching the Dark Tower behavior.
- [ ] Save/load: while in the hub, save the game, reload the page, Load Game. Confirm the wreck is still present at the same spot, still cold, exactly once (no double-spawn) — proving the serialize(save.js:120)/restore(save.js:198) round-trip.
- [ ] Legacy save: load a HUB save written before this change (or temporarily comment the HUB_MAP_DATA wrecks entry, save, restore it) — confirm no crash, and on a fresh newHubMap (re-enter hub) the wreck appears. Confirm hubValidateMapData in the map editor shows no 'Unknown root field: wrecks' warning.
- [ ] Co-op host+client: host a session, join as client, both go to the hub. Confirm BOTH peers render the wreck at the identical wasteland coordinate (deterministic newHubMap spawn) with no flicker/desync — confirming the no-net-shape, client-runs-newHubMap-locally path.
- [ ] Mobile/narrow viewport: shrink the window or use device emulation, re-check the wasteland — confirm the wreck draws correctly and the HUD-driven canvas viewport math still frames it.

**Verification summary.** Read all four named files plus js/map.js (mkEntity), js/save.js (serialize/deserialize), js/net/sync.js (packEnt), js/input.js (selection), and js/hub_map_schema.js (the normalizer the design doc omitted). Confirmed: the exact wreck mkEntity shape (corpses.js:137), the newHubMap insertion point (hub.js:855-864), the unconditional fire+smoke in drawWreck (render.js:3026-3027) needing a cold guard, the four waste_ruin footprints (no mdc_waste exists), the netRole-safe Dark-Tower precedent (neutral non-selectable, client runs newHubMap locally), and the save round-trip (entities serialized at save.js:120, restored at save.js:198). Surfaced the blocking correction that hubNormalizeMapData strips unknown root keys, so the schema must be extended for HUB.wrecks to exist at all.

---

## Theme B — The battlefield feels authored

### Task B1 — Walkable data-shards / audio-logs on any map

**Goal.** Promote the Ep XVI corpse-memory mechanic into reusable found-object lore (data-shards) on any map by authoring content + a dark 'shard' render variant — the engine is already map-agnostic, so do NOT clone corpsesTick.

**Effort:** S (first slice ~half a day: 1 data entry + 1 quest line + ~2 render branches)  ·  **Risk:** low — the mechanic is ~90% shipped and proven on Ep XVI. The only real code is a cosmetic render branch. Risk is purely art-direction (shard must read as a derelict datachip, not a clean glowing pickup) + not accidentally routing a shard through corpseSprite's human-body build.

> **No net-shape change.** No snapshot-shape change. corpse entities already round-trip through sync.js packEnt/unpack (js/net/sync.js:163-166 pack o.src/o.mid/o.rv/o.gr/o.rc; :251-252 unpack). The 'shard' look is keyed on corpse.src, and o.src=e.src IS synced — so the client renders the shard variant for free. NOTE: e.group is NOT packed in sync.js, but group is only used host-side for quest counting (corpsesTotal/corpsesRemaining poll live host entities), so the client never needs it. Only the extracted-set (reached) persists; missing memBodies = legacy default (no entry → no spawn).

**Files touched:** `js/render.js (add src==='shard' branch in _corpseSource ~2777, shard short-circuit in corpseSprite ~2813, shard affordance in drawCorpse ~2892)`, `js/maps_data.js (author one src:'shard' memBodies entry + a group-scoped collectMemories quest into MAPS[1] 'II — The Silicon Wastes')`

**Corrections found vs. the design doc:**
- Design doc says add the 'shard' variant in 'corpseSprite/drawCorpse'. More precisely: the src-switch chokepoint is js/render.js _corpseSource (~line 2777), which corpseSprite calls — the src==='shard' branch belongs there, plus a short-circuit at the top of corpseSprite (~2813) so a shard skips the human-body band/gore/wound build, plus an affordance branch in drawCorpse (~2892). It is not a single edit point.
- Design doc lists hooks as 'corpseSprite/drawCorpse (js/render.js)' and quests.js for collectMemories — confirmed accurate. showMemoryDialog confirmed in js/ui.js (~670), NOT dialogs.js — the doc's parenthetical 'not dialogs.js' is correct.
- Net-shape: the design doc says 'the client receives shard entities via the neutral-entity snapshot path and only renders' — confirmed, BUT note the corpse pack in sync.js (:163-166) carries o.src/o.mid/o.rv/o.gr/o.rc and does NOT carry e.group. This is fine (group is host-only quest bookkeeping; the shard LOOK is keyed on src, which IS synced) — but it means a shard's group is unavailable client-side, so never make client rendering depend on group.
- Map.js scaleCfg (~line 56) already scales+preserves memBodies (incl. a 'shard' src and a 'group') and carveTrails (~269) registers memBody coords as reachability POIs — so an authored shard on a scaled or procedurally-generated map stays reachable with no extra wiring (the doc didn't call this out).

#### B1 · Prep / locate (confirm anchors — all verified in this pass)

- [ ] Confirm js/corpses.js spawnMemBodies (line ~60): cfg.memBodies entry shape is {x,y,src,id,text,reveal?,gore?,group?}; group defaults to 'route', memId defaults to 'mem'+i, reached:false — authoring a new entry needs NO new field.
- [ ] Confirm js/corpses.js corpsesTick (line ~182) and spawnMemBodies are called UNCONDITIONALLY from non-hub maps: map.js:731 spawns, core.js:123 ticks, with NO Ep XVI / displayEp / heroEscape gate — so any map with cfg.memBodies works today.
- [ ] Confirm js/quests.js collectMemories (line ~133) reads def.group (null=all) and derives goal from corpsesTotal(state, group)/corpsesRemaining(state, group) (corpses.js:151-161) — a 'group'-scoped quest already works.
- [ ] Confirm the render src-switch chokepoint is js/render.js _corpseSource (line ~2777) — the function corpseSprite (line ~2813) calls it; this (NOT a literal 'corpseSprite' edit) is where a src==='shard' branch belongs.
- [ ] Confirm js/render.js drawCorpse (line ~2888) draws the cached sprite then an UN-reached affordance: a cyan pulsing ground ellipse + chip-glint at c.headX/headY (line ~2892-2901) — this is the second branch point for a shard-appropriate affordance.
- [ ] Confirm showMemoryDialog lives in js/ui.js (line ~670), NOT dialogs.js — and that corpseExtract (corpses.js:165) calls it with isReveal=false for a normal (non-reveal) body, so a shard reuses the existing 'MEMORY RECOVERED' dialog with zero UI work.
- [ ] Confirm the harvest gate: window._memDialogOpen is set in ui.js showMemoryDialog (:680), gates the sim in main.js:444 AND corpsesTick in corpses.js:184 — so a shard auto-harvests on walk-over exactly like a corpse, one-at-a-time.
- [ ] Confirm js/map.js scaleCfg (line ~56) maps cfg.memBodies coords through S() (scale) while keeping src/id/text/reveal/gore — a 'shard' src and any 'group' are preserved across scaled maps; also js/map.js carveTrails (line ~269) adds memBody coords as POIs, so a shard tile stays reachable.
- [ ] Pick the authoring target: js/maps_data.js MAPS[1] 'II — The Silicon Wastes' (line ~67, w:54 h:46, desert wastes — story-thin per the design doc's named gaps, has NO memBodies, optional non-required quest list) is the recommended non-Ep-XVI host map for the first shard.

#### B1 · First slice (ship this) — one shard on a non-XVI map + the render variant

- [ ] Add a src==='shard' branch at the TOP of js/render.js _corpseSource (line ~2777), BEFORE the 'ao'/'civilian' checks: return early-distinguishable info so corpseSprite does NOT build a human body — e.g. return { type:null, owner:'neutral', faction:null, synth:false, shard:true }.
- [ ] Add a shard short-circuit at the TOP of js/render.js corpseSprite (line ~2813, right after _corpseSource): if srcInfo.shard, build & cache a dark derelict datachip/blood-slick terminal bitmap (small canvas: a matte charcoal chip/handheld on a dark slick, a hairline dead-screen rim, NO emissive bloom, NO neon — art-direction: looks years-dead, never a clean glowing pickup) and return { canvas, ax, ay, headX, headY } so the WeakMap cache + drawCorpse blit path is reused unchanged.
- [ ] In js/render.js drawCorpse (line ~2888), when the entity is a shard and NOT reached, replace the cyan corpse affordance (ellipse + bright chip-glint, :2892-2901) with a SUBTLE shard cue — a low-alpha dim ground ellipse + a faint single dead-pixel flicker (dark cyberpunk, missable-by-design); keep it gated on !e.reached so it disappears after extraction exactly like a corpse.
- [ ] Author ONE shard entry into js/maps_data.js MAPS[1] 'II — The Silicon Wastes' memBodies (add a memBodies:[] array; e.g. { x:27, y:24, src:'shard', group:'shards', id:'shard_wastes_1', text:'<a dark, missable found-object paragraph in the established corporate-satire voice>' }) — place it on/near a traversed but off-critical-path tile so discovery feels pulled, not pushed.
- [ ] Add the scoped quest to js/maps_data.js MAPS[1] quests: { id:'shards', text:'Recover the abandoned data-shard', type:'collectMemories', group:'shards', reward:50 } — OPTIONAL (no required:true) for the first slice so a missed shard never softlocks victory; the engine derives goal from the live 'shards' group count.
- [ ] Manually verify in-browser (see Verification) that the shard spawns, renders as the dark datachip, walk-over auto-extracts it, the MEMORY RECOVERED dialog shows the authored text, and the optional quest ticks to done — proving portability with zero new systems.

#### B1 · Deferred / follow-on slices

- [ ] Add 2-4 more shards across other non-XVI maps (each a memBodies entry + reusing the same group/quest pattern) once the variant is proven — content-only, no code.
- [ ] Add further src render variants beyond 'shard' (e.g. 'hololog' = a flickering holo-projector, 'memo' = a printed dossier) by extending the _corpseSource + corpseSprite shard short-circuit into a small switch on src — same engine, new authored looks.
- [ ] OPTIONAL distinct extract toast/icon per non-corpse src (e.g. a 📟 glyph vs corpseExtract's 🧠) by passing a kind hint into corpseExtract→showMemoryDialog; defer — the existing 'MEMORY RECOVERED' dialog is fine for the first slice.
- [ ] If a shard quest is ever made required:true on a hand-authored map, verify the shard tile is reachable under that map's procedural terrain (carveTrails already adds memBody coords as POIs, but confirm per-map).

#### B1 · Constraints & safety

- [ ] Save-compat: add NOTHING new to js/save.js — only the existing corpse.reached round-trips (already serialized via the corpse entity path); a map with no memBodies legacy-defaults to no shards. Confirm an old save with no 'shards' quest loads (collectMemories returns 'done' vacuously when corpsesTotal==0, quests.js:136) — no SAVE_VERSION bump.
- [ ] netRole — solo: corpsesTick (host/solo) harvests on walk-over and fires showMemoryDialog directly; works unchanged.
- [ ] netRole — host: host is authoritative — corpsesTick sets reached + shows the dialog on the host; the shard entity (with src) is broadcast via sync.js packEnt (corpse case, :163-166).
- [ ] netRole — client: client NEVER simulates — it receives the shard entity via the neutral corpse snapshot path (sync.js unpack :251-252 sets e.src/e.reached), so the client RENDERS the shard variant (keyed on synced corpse.src) and the un-reached affordance, and stops showing it once reached arrives. The MEMORY dialog itself is host/solo-only (a known, pre-existing corpse-mechanic behavior — do NOT add a client-side mpcue in this slice). State this explicitly: shard VISUAL reaches the client; shard TEXT reveal is host/solo.
- [ ] Rollback guard: do NOT touch corpseExtract's existing window._rbReplaying short-circuit (corpses.js:168, returns before any UI side-effect). The new render code (_corpseSource/corpseSprite/drawCorpse) is render-only and never runs in the sim, so it needs no _rbReplaying guard; do NOT add any FX spawn (spawnRing/etc.) inside the render variant.
- [ ] Determinism: the shard bitmap must be built deterministically — seed any procedural detail from (corpse.id) exactly as corpseSprite already does (_corpseRng((corpse.id||0)*…, render.js:2821), and cache in the existing _CORPSE_CACHE WeakMap so host/client/save-reload produce an identical sprite. No simRandom, no Date/Math.random in the render path.
- [ ] Art-direction (visual): the shard MUST be dark/devastated/derelict — matte charcoal datachip on a dark slick, NO neon bloom, NO bright glowing-pickup affordance (that fights the years-dead read). Reuse the corpse's muted palette, never an emissive synthetic-coolant glow (that's reserved for cyborg bodies via isCyborgBody).

#### B1 · Verification (manual, in-browser)

- [ ] Serve the repo: run `python3 -m http.server 8000` from the repo root, open http://localhost:8000/rts.html.
- [ ] Solo: start campaign Episode II 'The Silicon Wastes' (or jump to MAPS[1] via the map-select). Pan to the authored shard tile (~x:27,y:24) — confirm it renders as a DARK derelict datachip (NOT a glowing pickup) with a subtle missable affordance, distinct from any human corpse.
- [ ] Solo extract: walk/command any player unit onto the shard — confirm it auto-harvests (one-at-a-time gate), the 'MEMORY RECOVERED' dialog shows the authored text, click dismisses it, the affordance disappears, and the optional 'Recover the abandoned data-shard' quest flips to done in the HUD.
- [ ] Save/load persistence: extract the shard, save, reload the save — confirm the shard renders as already-reached (no affordance) and is NOT re-harvestable (corpse.reached round-trips).
- [ ] Co-op host: serve over http(s), host a co-op game on the same map, have a unit extract the shard on the HOST — confirm the host sees the dialog and the quest tick.
- [ ] Co-op client: on the CLIENT, confirm the shard RENDERS as the dark datachip and that after the host extracts it the client's affordance disappears (reached synced). Confirm the client does NOT independently pop the memory dialog (expected host/solo-only, matching the existing corpse mechanic).
- [ ] Regression: load Ep XVI 'THE SEVERANCE PACKAGE' and confirm the original corpse bodies (src:'civilian'/'soldier'/'ao') still render as gory bodies (NOT shards) and the route/crew collectMemories quests still complete — proving the src==='shard' branch is additive and didn't alter the human-corpse path.

**Verification summary.** Verified by reading the actual code, not the doc's line numbers. corpsesTick (corpses.js:182) and spawnMemBodies (corpses.js:60, called map.js:731) run on EVERY non-hub map with zero Ep XVI gate — engine is genuinely map-agnostic. cfg.memBodies shape confirmed {x,y,src,id,text,reveal?,gore?,group?} with group→'route' default. collectMemories (quests.js:133) takes def.group. corpse.src drives the sprite via _corpseSource (render.js:2777) → corpseSprite (render.js:2813). drawCorpse affordance at render.js:2892. showMemoryDialog confirmed in ui.js:670 (not dialogs.js). _memDialogOpen gate confirmed main.js:444 + corpses.js:184. sync.js packs o.src/o.mid/o.rc but not group (host-only). First slice = author 1 shard into MAPS[1] 'II — The Silicon Wastes' + a group-scoped quest + the src==='shard' dark-datachip render branch; the render variant is the only code touch.

---

### Task B2 — Condition-triggered map events — onReach branch in the cfg.events loop

**Goal.** Let cfg.events fire on player action (reach a place) not just the clock, by adding an onReach:{at,radius} branch before the atTime gate.

**Effort:** S-M  ·  **Risk:** low — purely additive to an existing host/solo loop; reuses the proven reach-detection math; no save-shape or net-shape change in the first slice

> **No net-shape change.** No snapshot/save field added in the first slice. state._eventsFired pre-exists as a plain state prop. The deferred onZoneEnter slice requires only a scaleCfg geometry edit (map.js), still no net/save-shape change. Deferred onBuildingDestroyed/onKills add transient per-event baselines on the cfg event object (not serialized) — also no net-shape change.

**Files touched:** `js/core.js`, `js/maps_data.js (or a chosen non-hub map's cfg — author one onReach beat for verification)`

**Corrections found vs. the design doc:**
- Doc cites the cfg.events loop at 'js/core.js:85-90'; the actual loop body spans lines 85-91 inside the guard at 83-92 (lazy-init at 84). Minor but the implementer should target line 87 'const ev=...' as the insertion point and 88 as the atTime gate to wrap.
- Doc cites runMapEvent at ~194; the function declaration is at line 203 (the JSDoc/comment block starts at 192). The 'Coordinates are unscaled map tiles; scaleCfg already scaled ev.at' comment is at lines 200-201 and confirms the e.at-only scaling.
- Confirmed accurate: scaleCfg (map.js line 84-85) scales ONLY e.at for events (`if(e.at) e.at=pt(e.at)`) — a future onZoneEnter zone rect is NOT scaled and MUST be added there, as the doc states.
- Confirmed accurate: state._eventsFired is a plain state prop (core.js line 84), no special handling in save.js/sync.js, legacy-safe (missing → re-inited to {}).
- Confirmed accurate: quests.js has no standing per-event razed/kill tally — collectMemories/guardsCleared/freeCaptives recompute from live entity scans and killUnits reads the running hubEnsureStats().unitKills; so deferred onBuildingDestroyed/onKills each need their own bounded scan as the doc states.
- Confirmed accurate: this whole event path is host/solo-only (inside update(), which clients don't run) and runMapEvent's FX/toast/refreshUI are already !window._rbReplaying-guarded (lines 221-222). The reachCutscene math to mirror is exactly at cutscene.js 217-225 (tile-center +0.5, squared-distance), radius in raw tiles ×TILE.

#### B2 · Prep / locate

- [ ] Open js/core.js and confirm the cfg.events loop at lines 83-92: the host/solo guard `if(!state.hub && !state.over && state.cfg && state.cfg.events && state.cfg.events.length)`, the lazy-init `state._eventsFired = state._eventsFired || {}` (line 84), the per-index `if(state._eventsFired[i]) continue` gate (line 86), the atTime gate `if((state.time||0) < (ev.atTime||0)) continue` (line 88), then `state._eventsFired[i]=1; runMapEvent(state, ev)` (lines 89-90). Confirm there is exactly one fired-set keyed by array index i.
- [ ] Confirm `state._eventsFired` is a plain state prop only ever read/written as `_eventsFired[i]` — no special serialization in js/save.js and no entry in js/net/sync.js (legacy default = missing → re-inited to {} on load; safe).
- [ ] Open js/cutscene.js lines 217-225 and confirm the reachCutscene detection to mirror: `const T=(typeof TILE!=='undefined')?TILE:32, rad=((rc.radius||3))*T, ax=(rc.at.x+0.5)*T, ay=(rc.at.y+0.5)*T, r2=rad*rad;` then a loop `for(const e of state.entities){ if(e.dead || e.owner!=='player' || e.kind!=='unit') continue; const dx=e.x-ax, dy=e.y-ay; if(dx*dx+dy*dy<=r2){ ... } }`. Note it uses tile-center `+0.5` and squared-distance — copy that exactly.
- [ ] Open js/map.js lines 45-86 (scaleCfg) and confirm the events branch at lines 84-85: `if(cfg.events) c.events = cfg.events.map(ev=>{ const e=Object.assign({}, ev); if(e.at) e.at=pt(e.at); return e; });` — ONLY `e.at` is scaled (radius and any future zone fields are NOT). Confirm `pt` scales x,y (and r if present) by MAP_SCALE=1.7. This means onReach.at is pre-scaled but onReach.radius is authored in raw tiles (multiply by TILE only, like reachCutscene's rad).
- [ ] Confirm in js/quests.js (lines 133-160) that progress is recomputed from live entity scans (collectMemories→corpsesRemaining, guardsCleared→state.entities.some, freeCaptives→count caged) and that killUnits reads a running hubEnsureStats().unitKills — i.e. there is NO standing per-event 'buildings destroyed since' tally. This confirms the deferred onKills/onBuildingDestroyed each need their own bounded entity scan.
- [ ] Read runMapEvent at js/core.js lines 203-224 and confirm it already handles aggression/objective/spawnSquad/villain/toast actions, that the toast/refreshUI calls are guarded by `!window._rbReplaying`, and that ev.at is the supplied spawn anchor — i.e. an onReach event can carry the SAME action payload (toast/spawnSquad/spawnScorch/etc.) and reuse runMapEvent unchanged.

#### B2 · First slice (ship this)

- [ ] In js/core.js, inside the cfg.events for-loop (after `const ev=state.cfg.events[i];` at line 87, BEFORE the atTime gate at line 88), add an onReach branch: `if(ev.onReach){ if(!eventReachHit(state, ev.onReach)) continue; } else if((state.time||0) < (ev.atTime||0)) continue;` — so an event with onReach fires on proximity and skips the clock gate, while events without onReach keep the existing atTime behavior unchanged.
- [ ] In js/core.js, add a small helper `eventReachHit(state, oz)` (place it just above runMapEvent near line 192) mirroring cutscene.js reachCutscene math: `const T=(typeof TILE!=='undefined')?TILE:32, rad=((oz.radius||3))*T, ax=(oz.at.x+0.5)*T, ay=(oz.at.y+0.5)*T, r2=rad*rad; for(const e of state.entities){ if(e.dead||e.owner!=='player'||e.kind!=='unit') continue; const dx=e.x-ax, dy=e.y-ay; if(dx*dx+dy*dy<=r2) return true; } return false;` — note oz.at is already scaled by scaleCfg, radius is raw tiles ×TILE.
- [ ] Keep the existing fire-once mechanics: do NOT change line 89-90 — after the onReach/atTime gate passes, `state._eventsFired[i]=1; runMapEvent(state, ev)` still fires the event exactly once (the i-keyed fired-set covers onReach for free).
- [ ] Extend the runMapEvent doc-comment block (js/core.js lines 192-202) to document the new `onReach:{at,radius}` trigger alongside `atTime`: state that at is in map tiles (scaled by scaleCfg), radius is raw tiles, and it fires once when any player unit enters the radius.
- [ ] Author ONE verification beat in the chosen non-hub map's cfg in js/maps_data.js: add to that map's `events:[ ... ]` an entry like `{ onReach:{ at:{x:..,y:..}, radius:4 }, toast:'The district goes dark.', spawnScorch:{...}|aggression:.. }` placed on a tile the player will walk to early. Use an existing already-supported runMapEvent action (toast + a spawnScorch/aggression) so no new action code is needed for v1.
- [ ] If the chosen beat uses spawnScorch as the FX, confirm runMapEvent (or the action it calls) routes through spawnScorch with the `!window._rbReplaying` guard already present for toast/refreshUI; if adding a new `ev.scorch` action to runMapEvent, wrap the spawnScorch call in `if(!window._rbReplaying && typeof spawnScorch==='function')` to keep host rollback from double-firing it.

#### B2 · Deferred / follow-on slices

- [ ] onZoneEnter:{zone:{x,y,w,h}} — add zone scaling to scaleCfg (js/map.js line 84-85): inside the events map, also scale the rect, e.g. `if(e.onZoneEnter && e.onZoneEnter.zone){ e.onZoneEnter=Object.assign({},e.onZoneEnter,{zone:scaleRect(e.onZoneEnter.zone)}); }` — onReach.at is already covered by the existing `if(e.at)`, but a NEW zone field is NOT scaled today and would desync on the ×1.7 maps if skipped. Then add an onZoneEnter branch in core.js mirroring eventReachHit but with a rect-containment test.
- [ ] onBuildingDestroyed:{owner?, type?, count?} — add its own bounded scan in core.js (quests.js keeps no standing razed tally). Track a per-event baseline of matching live enemy buildings on first sight and fire when the live count drops by `count` (or to zero), or snapshot `state.entities.filter(e=>e.kind==='building'&&e.owner==='enemy'&&!e.dead).length` into a transient like `ev._baseN` and compare each tick. Reuse the i-keyed _eventsFired one-shot.
- [ ] onKills:{owner?, type?, count?} — reuse the running hubEnsureStats(state).unitKills tally (quests.js killUnits precedent) for a total-kills threshold, or do a per-event baseline scan for typed kills. Author once, fire via runMapEvent like the others.
- [ ] After multiple onReach/onZone beats prove out, consider a shared scaleCfg helper so every future event geometry (at, zone, spawn anchors) is scaled in one place — currently only e.at is.

#### B2 · Constraints & safety

- [ ] Save-compat: no SAVE_VERSION bump and no js/save.js edit. `state._eventsFired` already lazy-inits to {} (core.js line 84), so old saves with no fired-set just start fresh; onReach/onZoneEnter cfg fields are read off state.cfg (re-derived from MAPS via scaleCfg on every load), never serialized — a legacy save loads and behaves identically.
- [ ] netRole — solo: update(G,dt) runs the cfg.events loop directly → onReach fires for the solo player (full reach). host: same loop runs authoritatively; the fired event's results (spawned squads, objective text, aggression) reach the client via the normal snapshot path. client: clients do NOT run update(), so the onReach evaluation never executes on the client — exactly like atTime events today. State this in the code comment; do NOT add client-side reach evaluation (would diverge the sim).
- [ ] Co-op client FX caveat: spawnScorch/spawnSmoke/toast from runMapEvent draw on the HOST canvas only (cfg is not in the snapshot scalar list); the co-op client sees the gameplay consequences (entities/objective) but not the host-side FX/toast. This is a PRE-EXISTING limitation shared with atTime events — ship v1 as host/solo presentation; do not claim parity (ref docs/audit/coop-campaign-parity.md).
- [ ] Rollback guard: any FX action invoked by an onReach beat (spawnScorch/spawnSmoke/eventToast/refreshUI) must be behind `!window._rbReplaying` so host rollback re-sim does not double-spawn FX — the existing runMapEvent toast/refreshUI calls already do this (lines 221-222); match that for any new FX action you add.
- [ ] Determinism: eventReachHit uses only entity positions and event geometry — no RNG, no Math.random — so host and any rollback re-sim agree, and the i-keyed _eventsFired fire-once is order-stable. Keep it RNG-free. (spawnSquad spawn jitter in runMapEvent is positional, not random — unchanged.)
- [ ] Art direction: if the authored beat uses a visual (spawnScorch / smoke column), keep it dark/devastated — scorch + dim smoke reads as 'the district went dark', never a bright flash. No new art needed for the first slice.

#### B2 · Verification

- [ ] Serve the repo: run `python3 -m http.server 8000` from the repo root and open http://localhost:8000/rts.html.
- [ ] Solo: load the map whose cfg got the onReach beat. Walk a player unit toward the authored at-tile and confirm the event fires ONCE the unit enters the radius (toast appears / scorch spawns / aggression changes), and that walking back and forth does NOT re-fire it (i-keyed _eventsFired one-shot).
- [ ] Solo regression: on the same or another map that has atTime events, confirm those still fire purely on the clock (the onReach branch must not break the existing `(state.time||0) < ev.atTime` path for events without onReach).
- [ ] Scaled-map check: because scaleCfg scales at by ×1.7, confirm the trigger lands at the intended in-game location (the unit triggers it where you authored it, not offset) — verifies onReach.at scaling and the raw-tile ×TILE radius are correct.
- [ ] Co-op host: start a host+client co-op session on that map; on the HOST, walk a unit into the zone and confirm the beat fires for the host and its gameplay consequences (spawned squad / objective text) appear on the CLIENT via snapshot. Confirm the host-side toast/scorch does NOT appear on the client (expected pre-existing limitation) and nothing desyncs or errors in the client console.
- [ ] Save/load: in solo, BEFORE entering the zone, save; reload from that slot; walk in and confirm the event still fires once (proves the missing/partial _eventsFired re-inits safely and the cfg event survives re-derivation). Then save AFTER the event has fired, reload, and confirm it does NOT re-fire (the fired-set persisted with state).

**Verification summary.** Verified all four named anchors against live code: (1) js/core.js cfg.events loop at lines 83-92 with i-keyed state._eventsFired one-shot and the atTime gate at 88, runMapEvent at 203; (2) js/cutscene.js reachCutscene detection at lines 217-225 (tile-center +0.5, squared distance, player-unit filter) is the precedent to mirror; (3) js/map.js scaleCfg lines 84-85 scales ONLY e.at for events (so onReach.at is pre-scaled, radius stays raw-tile, and a future onZoneEnter zone must be added to scaleCfg); (4) js/quests.js (133-160) recomputes progress from live entity scans with no standing razed tally, confirming deferred onKills/onBuildingDestroyed each need their own bounded scan. The whole path runs inside update() → host/solo-only, FX on host canvas only; pre-existing for atTime, so v1 does not claim co-op parity. First slice = onReach branch + eventReachHit helper + one authored beat, no save/net-shape change.

---

### Task B3 — Reactive ambient FX — razed-base lingering smoke column (first slice in deathFx)

**Goal.** Make a razed base (HQ / large-footprint building) leave a lingering, dark smoke column so the spot reads "a battle happened here" for the rest of the mission — implemented entirely inside deathFx so it fires on all three netRoles for free.

**Effort:** S  ·  **Risk:** Low — first slice is render-only and module-local (no save.js/sync.js/state.js touch, no boss/wave code); the only real risks are the particle cap (smokes>240 early-return) starving the new long-life puffs on mass deaths, and over-tuning life so the additive 'lighter' column reads bright instead of dark (art-direction).

> **No net-shape change.** No entity/snapshot/save shape change for the first slice: it only lengthens/darkens existing module-local smokes[] particles in render.js's deathFx, which never touch G, save.js, or net/sync.js. (The deferred sky-darken/alarm add a render-only G._skyDark/G._alarm transient modeled on state._shake — which is confirmed absent from save.js and sync.js — and must likewise be excluded from both, so they are not persisted/synced shape changes either.)

**Files touched:** `js/render.js`

**Corrections found vs. the design doc:**
- Design doc line ~285 says the deferred transient is `G._skyDark` 'modeled on state._shake, excluded from save/sync' — confirmed correct: grep shows _shake appears only in render.js (set in deathFx, decayed in the camera-shake block ~518-521) and NOT in js/save.js or js/net/sync.js, so the precedent is real and the exclusion requirement stands.
- Design doc references a generic `particles.js` ('particles.js/drawLightFX never react to events today', lines 275/74) — there is NO js/particles.js in this repo; all the particle pools (smokes/rings/explosions/shockwaves) and the smoke spawn/draw/decay live in js/render.js (pools declared line 3174, drawn/decayed in drawRings ~3467-3486). The first slice correctly lands in js/render.js, but the doc's 'particles.js' file reference is stale/nonexistent.
- The design doc's hook is accurate that the first slice is 'lengthen the existing debris-smoke life' — confirmed the exact target is the building-branch loop at js/render.js ~3369-3373 where `life:1.1+(i%3)*0.5` is set; the doc gives no line number for it, so this breakdown pins it precisely (deathFx at ~3344, building branch ~3360, lingering-smoke loop ~3369-3373).
- Confirmed (not contradicted, but worth flagging) the hard cap `if(smokes.length>240) return;` sits at line ~3357 ABOVE the building branch — the doc does not mention it, but lengthening life raises steady-state count so the implementer must respect this cap; noted in Prep and Constraints.

#### B3 · Prep / locate

- [ ] Confirm `deathFx(state, e)` in js/render.js (line ~3344) and its `if(e.kind==='building'){...}` branch (lines ~3360-3375): the 'debris + lingering dark smoke column' loop is `const D=...; for(let i=0;i<D;i++){ smokes.push({... life:1.1+(i%3)*0.5}) }` at lines ~3369-3373 — this is the exact spot to lengthen smoke life for a razed base.
- [ ] Confirm the building branch already reads `fw=(e.w||2), fh=(e.h||2), foot=Math.max(fw,fh)` and `hq=(e.type==='hq')` (lines ~3361-3362) so per-footprint / HQ scaling is available without new lookups.
- [ ] Confirm the hard particle cap `if(smokes.length>240) return;` (line ~3357) sits BEFORE the building branch — longer-lived puffs increase steady-state count, so verify the new life still respects this cap (and consider gating the extra-long puffs to fewer particles on HQ only).
- [ ] Confirm the additive draw + decay of `smokes[]` lives in `drawRings(ox,oy)` (lines ~3467-3486): `ctx.globalCompositeOperation='lighter'`, env fade-in over first 15% then slow fade-out, `s.t-=1/(s.life*60)`, filtered by `s.t>0` — so larger `life` directly = longer-lived column with the existing billow/rise physics; no new draw code needed for the first slice.
- [ ] Confirm the dark, source-over occluding precedent `_wreckSmoke(state,e,...)` (lines ~2956-2974) exists as the reference for 'thick DARK smoke' if a non-additive look is wanted later — but note first slice intentionally reuses the existing additive `smokes[]` puffs (the building branch already pushes dark-grey `cr/cg/cb: i%3?96:rgb...` puffs at line ~3373).
- [ ] Confirm `deathFx` is invoked from js/units.js line 1531: `if(!window._rbReplaying && typeof deathFx==='function') deathFx(state,e);` — this is the solo/host live death site and is already `!window._rbReplaying`-guarded.
- [ ] Confirm clients fire deathFx via `_clientDeathFx` in js/net/sync.js (defined line 359, called lines 366 & 371 on full-snap removal and on delta `snap.gone`) — this is the proof the smoke reaches the CLIENT netRole with no extra wiring.
- [ ] Confirm `state._shake=Math.max(state._shake||0, ...)` is set in deathFx (lines ~3375/3385/3392), consumed/decayed in the render camera-shake block (lines ~518-521), and is ABSENT from js/save.js and js/net/sync.js (grep returns nothing) — this is the exact precedent to copy for the DEFERRED `G._skyDark` transient.
- [ ] Confirm the deferred boss/holdout hooks: js/waves.js gates host/solo-only paths with `if(netRole!=='solo') return` (line ~160) and `if(window._rbReplaying) return` (line ~87/161), and js/villains.js boss logic is the authoritative path guarded by `!window._rbReplaying` — so clients NEVER run these, proving the deferred slices need an explicit `mpcue` mirror.
- [ ] Confirm the `mpcue` mirror mechanism for deferred slices: `cinematic(type,data,playLocalFn,opts)` in js/net/commands.js (line 166) plays locally + on host emits `NET.cueSend`; client mirrors via `NET.playCue` (js/net/mp.js line 238 `MP.on('mpcue', ...)`).
- [ ] Confirm the deferred POST-band cooperation point: `applyPostStack(state, z, vx, vy)` in js/render.js (line 246) draws the per-biome multiply grade + warm focal pool + vignette (gated `QUAL.level>=2` off, `RENDER.grade/RENDER.vignette`), invoked at line ~854 — a `G._skyDark` darken pass would cooperate here in the POST band (LAYER.POST=7, line 99).

#### B3 · First slice (ship this)

- [ ] In js/render.js `deathFx`, inside the `if(e.kind==='building'){...}` branch, lengthen the lingering-smoke `life` in the debris loop (~line 3373): replace `life:1.1+(i%3)*0.5` with a footprint/HQ-scaled value, e.g. `life:(hq?5.0:2.6)+(foot*0.4)+(i%3)*0.5` so HQ/large bases smolder for several seconds instead of ~1.6s while small buildings barely change.
- [ ] In the same loop, bias the lingering puffs DARKER and slower-rising for a true smoke 'column' read: keep the grey tone (`cr:i%3?96:rgb[0]` etc.) but reduce upward velocity for the longest-lived puffs (e.g. `vy:Math.sin(a)*sp*0.5-0.22` instead of `-0.35`) so the column hangs and drifts rather than dissipating fast — preserving the existing additive `lighter` draw.
- [ ] Gate the extra count: only add the +1/+2 extra long-life column puffs when `hq || foot>=3` (large footprints) so small buildings keep their current quick puff and the steady-state `smokes[]` count stays well under the `smokes.length>240` cap.
- [ ] Keep ALL changes inside the existing `smokes.push({...})` calls in deathFx — do NOT add a new array, a new draw function, or any field on `e`/`G`; the first slice is purely tuning existing module-local particle params so it inherits `drawRings` decay, the off-screen cull, the fog cull, and the reduced-motion `N` clamp already at the top of deathFx.
- [ ] Leave the unit branch (`else { ... big / small ... }`, lines ~3376-3393) untouched — the razed-BASE smoke is a building-only first slice.

#### B3 · Deferred / follow-on slices

- [ ] Boss-arrival sky-darken: add a render-only transient `G._skyDark` (0..1) set on the host in js/villains.js at the boss-entry/intro site (guard `!window._rbReplaying`), decayed each frame in render.js exactly like `state._shake` (lines ~518-521), and EXCLUDED from js/save.js + js/net/sync.js (mirror the `_shake` precedent so it never serializes/syncs).
- [ ] Mirror the darken to the CLIENT: wrap the host trigger in `cinematic('skydark', {amt}, ()=>{G._skyDark=amt}, {})` (js/net/commands.js) so host plays locally + emits an `mpcue`, and the client sets `G._skyDark` via `NET.playCue`; never let the client originate it (clients don't run villains.js).
- [ ] Holdout-breach alarm light: same pattern from js/waves.js (on undefended/breach) — set a render-only `G._alarm` transient (NOT in save/sync) on host, mirror via `cinematic('alarm', ...)` mpcue so the client sees the alarm wash too.
- [ ] Add a POST-band darken/alarm draw pass that cooperates with `applyPostStack` (js/render.js line 246): draw a screen-space dark/red wash in the POST layer (LAYER.POST=7) AFTER/within the grade+vignette so it composites with them rather than fighting them; QUAL-gate it (`QUAL.level>=2` off) like the rest of the post stack.
- [ ] Guard every new deferred FX trigger with `!window._rbReplaying` (host rollback re-sim double-fires otherwise) — the same guard already wrapping every spawn* call in villains.js/waves.js.

#### B3 · Constraints & safety

- [ ] Save-compat: NONE required for the first slice — it adds no entity/G/persistent field, only tunes existing `smokes[]` particle params; do NOT bump SAVE_VERSION and do NOT touch js/save.js. (Deferred `G._skyDark`/`G._alarm` MUST be treated as legacy-absent render transients: never written by save.js, default 0 when missing.)
- [ ] netRole — solo: deathFx is called directly from js/units.js:1531 each death; the longer smoke just works.
- [ ] netRole — host: identical to solo (host runs the same units.js death path); host also broadcasts the entity removal so the client can fire its own copy.
- [ ] netRole — client: clients do NOT simulate, but `_clientDeathFx` (js/net/sync.js:359) calls deathFx on snapshot entity-removal (full-snap line 366 and delta `snap.gone` line 371) — so the lingering smoke renders on the client for free with NO sync.js change. (Deferred sky-darken/alarm DO require the explicit `mpcue` mirror because their triggers live in host-only villains.js/waves.js.)
- [ ] Rollback guard: the first-slice spawn is already inside deathFx, whose only live caller (units.js:1531) is `!window._rbReplaying`-gated, so host rollback re-sim will not double-spawn the smoke — do NOT add a second guard inside deathFx. Any NEW deferred trigger added directly in villains.js/waves.js MUST add its own `!window._rbReplaying` guard.
- [ ] Determinism: keep the puff layout deterministic — reuse the existing golden-angle `a=i*2.39996+e.y*0.011` spread and `e.x/e.y`-seeded offsets already in the loop; introduce NO Math.random (FX is cosmetic and must stay reproducible so host/client visuals stay coherent).
- [ ] Art-direction (dark): the lingering column must read DARK/sooty against the devastated-cyberpunk palette — bias the long-life puffs toward the existing grey tone (~96,100,108), not the bright owner color; verify on a dark biome that the additive `lighter` blend does not wash the column bright. Never make a razed base look cheerful or glowing.
- [ ] Perf/cap: longer life raises the live particle count — verify the `smokes.length>240` early-return (line 3357) still protects mass-base-raze scenarios, and that `megaReducedMotion()` still clamps the puff count via the existing `reduced` `N`/`D` reductions.

#### B3 · Verification

- [ ] Serve locally: run `python3 -m http.server 8000` from repo root and open http://localhost:8000/rts.html.
- [ ] Solo: load a campaign map with an enemy base (or console `mkUnit`/spawn an enemy HQ), destroy the enemy HQ and a large building; observe a thick dark smoke column that lingers several seconds (clearly longer than the brief unit/small-building puff) and reads dark, not bright.
- [ ] Solo edge: raze several buildings at once and confirm no runaway particle growth / framerate cliff (the smokes>240 cap holds) and that the column still appears for at least the HQ.
- [ ] Host co-op: serve over http, start a host session, raze an enemy base — confirm the host sees the lingering column (same as solo).
- [ ] Client co-op: with a second browser joined as client, raze a base on the host — confirm the CLIENT also sees the lingering smoke column appear on the entity-removal snapshot (proves `_clientDeathFx` path); confirm it is NOT a desync (both screens show smoke at the same razed tile, roughly in sync).
- [ ] Off-screen/fog: raze a base off-camera or in fog (enemy) and confirm no smoke spawns (existing camera-cull line ~3350 and fog-cull line ~3353 still suppress it), then pan back to confirm no retroactive pop.
- [ ] Save/load: this slice persists NOTHING — verify by saving mid-mission AFTER a base is razed, reloading, and confirming the save loads cleanly with no smoke restored (expected: lingering smoke is transient and gone on reload, which is correct/by-design) and that an OLD pre-change save still loads (no new required field).
- [ ] Reduced motion: set the reduced-motion toggle/flag and confirm the column degrades to the smaller `reduced` puff count without errors.

**Verification summary.** First slice is verified entirely in-browser via python3 -m http.server 8000 then rts.html: solo (raze enemy HQ/large building, observe a dark multi-second smoke column vs the brief unit puff), host (same), and client (second browser joined — razing on host shows the lingering column on the client too, proving the _clientDeathFx snapshot-removal path delivers it to all three netRoles with zero sync.js change). Plus off-screen/fog cull check, a mass-raze perf/cap check, a reduced-motion degrade check, and a save/load check confirming nothing persists and old saves still load. No automated tests exist (no build/lint/test in this repo), so verification is manual per CLAUDE.md.

---

## Theme C — The world darkens with the arc

### Task C1 — HUB arc-descent skin — arc-biased night-tint with a clamped combined-darkness ceiling

**Goal.** Sour the HUB across the campaign descent by biasing the existing night-tint fill with a clamped arc value derived from CAMPAIGN.nextMapIndex, capping combined darkness so late-arc deep-night stays readable.

**Effort:** M (first slice S — a single arc term + ceiling clamp in one render.js block; deferred slices push it to M)  ·  **Risk:** Low for the first slice: render-only, no save/net/shape change, no new simulation. Main risk is purely visual — an over-strong arc floor stacking on grade+vignette+grunge crushes the HUB to illegible mud (the design doc's explicit tuning gate). Mitigated by the clamped combined ceiling + an A/B flag.

> **No net-shape change.** No snapshot/save shape change. The arc is derived at render time from CAMPAIGN.nextMapIndex, which already persists (serializeHubCampaign → save.js:127/169) and already syncs host→client (net/sync.js:300/322 as snap.campaign, applied via deserializeHubCampaign). No new persistent field, no SAVE_VERSION bump, no new packed entity field — the client renders the souring 'for free' from data it already receives.

**Files touched:** `js/render.js`

**Corrections found vs. the design doc:**
- Denominator is WRONG in the design doc: it says arc = clamp(nextMapIndex/(MAPS.length-1)). MAPS.length is 24 but ~12 entries are isVillain appended/interleaved maps, and CAMPAIGN.nextMapIndex rides the LINEAR 0..lastEpisode track (villainNextLinear never returns a villain index). Using MAPS.length-1 (=23) makes arc cap well below 1.0 at the final episode. Correct denominator is lastEpisodeIndex() (js/villains.js:1427), which walks back past trailing isVillain maps.
- The night-tint block is at js/render.js:844-852 (the doc's ~847 points at the `const _na=HUBNPC.nightAlpha();` line itself — accurate, just noting the full block spans 844-852).
- nightAlpha() (js/hub_npcs.js:140) takes NO arc argument and is a private closure inside the HUBNPC IIFE; the cleanest first slice applies arc at the render.js call site (CAMPAIGN is a global there), NOT by threading a new param through hub_npcs.js — the doc's phrasing 'arc-bias the existing night-tint' is right but the implementation location matters.
- The doc lists 'reduced-motion + QUAL gates' as something to honor for this fill, but the night-tint is a STATIC single fillRect (not animated) and is currently NOT reduced-motion/QUAL gated; the arc term adds no motion, so a reduced-motion gate is unnecessary. (applyPostStack, which stacks on top, IS QUAL.level>=2 gated.)
- Combined-darkness ceiling is confirmed real: night-tint stacks under applyPostStack's per-biome multiply grade (alpha ≤0.5) + pure-black vignette + the baked grunge overlay — so the doc's 'clamp the combined ceiling, dark but readable' caveat is the load-bearing constraint, not a nicety.

#### C1 · Prep / locate

- [ ] Confirm the night-tint block at js/render.js:844-852 (inside the main draw scope after drawFog): it is gated `if(state.hub && typeof HUBNPC!=='undefined')`, reads `const _na=HUBNPC.nightAlpha()`, gates on `_na>0.004`, and draws `ctx.fillStyle='rgba(10,16,38,'+_na.toFixed(3)+')'; ctx.fillRect(vx, vy, viewW()/z, viewH()/z);` — confirm vx/vy/z are in scope here (established at js/render.js:522 for this draw function).
- [ ] Confirm js/hub_npcs.js:140-147 `nightAlpha()` returns a TIME-ONLY value in 0..NIGHT_MAX (NIGHT_MAX=0.14 at js/hub_npcs.js:49), takes no arc argument, and is a zero-arg closure inside the IIFE reading module-private `_cityC()` — i.e. arc must be applied at the render.js call site (where CAMPAIGN is global), not inside hub_npcs.js, to avoid threading a new param through the IIFE export at js/hub_npcs.js:722-724.
- [ ] Confirm the stacking darkening passes that compose ON TOP of the night-tint so a combined ceiling can be computed: applyPostStack (js/render.js:246-271, called at :857) adds a per-biome multiply grade (alpha clamped ≤0.5, js/render.js:261) + a pure-black-edged vignette gradient (js/render.js:268); the baked grunge overlay (js/render.js:1063) adds more dark mottle. The HUB still runs applyPostStack, so the arc term must NOT push combined darkness past a readable cap.
- [ ] Confirm CAMPAIGN.nextMapIndex is the campaign arc cursor: defaulted to 0 at js/hub.js:97, advanced via villainNextLinear (js/hub.js:248), and that it rides the LINEAR 0..lastEpisode track (never sits on an isVillain index — see villainNextLinear comment js/villains.js).
- [ ] Confirm the correct arc denominator is lastEpisodeIndex() (js/villains.js:1427: `let k=MAPS.length-1; while(k>0 && MAPS[k].isVillain) k--;`) and NOT MAPS.length-1 — MAPS has 24 entries but ~12 are isVillain appended/interleaved maps, so MAPS.length-1(23) would make arc never reach 1.0 at the final episode. (This is a correction to the design doc.)
- [ ] Confirm the persistence + client-sync chain so no new save field is needed: serializeHubCampaign() deep-clones all of CAMPAIGN (js/hub.js:125) → save.js writes it at js/save.js:127 and reads it via deserializeHubCampaign at js/save.js:169 → net/sync.js packs it as snap.campaign at js/net/sync.js:300 and :322 (host→client), client applies via deserializeHubCampaign. So nextMapIndex already persists AND reaches the co-op client for free.
- [ ] Confirm CAMPAIGN is a readable global inside render.js (already used at js/render.js:1482, :1850, :2088) and that QUAL is the existing gate object (applyPostStack drops at QUAL.level>=2, js/render.js:247).

#### C1 · First slice (ship this)

- [ ] Add a small helper near the top of js/render.js (module scope, beside the other RENDER/PERF helpers) e.g. `function hubArc(){ if(typeof CAMPAIGN==='undefined'||!CAMPAIGN) return 0; const denom=(typeof lastEpisodeIndex==='function'?lastEpisodeIndex():(typeof MAPS!=='undefined'?MAPS.length-1:1))||1; return Math.max(0, Math.min(1, (CAMPAIGN.nextMapIndex||0)/denom)); }` — guard every global (CAMPAIGN/lastEpisodeIndex/MAPS) with typeof since load order is the dependency graph.
- [ ] In the night-tint block at js/render.js:846-852, after `const _na=HUBNPC.nightAlpha();`, compute an arc-biased target alpha rather than drawing _na directly: add a tunable max arc contribution constant (e.g. `const ARC_TINT_MAX=0.05;`) and `const arc=hubArc();`.
- [ ] Compute the combined-darkness ceiling clamp: define a readable peak (e.g. `const NIGHT_TINT_CEIL=0.16;` — slightly above HUBNPC's NIGHT_MAX=0.14 so a fully-dark late-arc night reads as 'dark but legible', NOT mud) and set `const _a=Math.min(NIGHT_TINT_CEIL, _na + arc*ARC_TINT_MAX);` so the arc only ADDS toward the cap and never blows past it when night-tint is already at peak.
- [ ] Optionally bias the tint HUE colder/sicker with arc (dark-cyberpunk souring, no brightness change): keep the base 'rgba(10,16,38,…)' at arc 0 and lerp a touch toward a sicker desaturated blue-green at arc 1 (e.g. green channel down, slight cyan), staying low-luminance — but ship the alpha-only version first if hue lerp risks the readability budget.
- [ ] Replace the draw with the clamped value: keep the `if(_a>0.004)` gate, use `ctx.fillStyle='rgba(10,16,38,'+_a.toFixed(3)+')'` (or the hue-lerped color) and the unchanged `ctx.fillRect(vx, vy, viewW()/z, viewH()/z)`.
- [ ] Add an A/B kill flag mirroring the other ?no… toggles (e.g. read `?noarctint=1` once into a RENDER-style boolean, or reuse the RENDER off() pattern at js/render.js:88) and short-circuit the arc term to 0 when set, so the souring can be visually A/B'd against the time-only baseline.
- [ ] Leave HUBNPC.nightAlpha() (js/hub_npcs.js) untouched — do NOT thread arc through the IIFE; all arc logic lives at the render.js call site so the time-only clock helper stays single-purpose.

#### C1 · Deferred / follow-on slices

- [ ] Arc-gated ash/smog weather: reuse the drawHubRain scaffold (js/render.js:120, called at :787) — add a second screen-space additive pass that ramps drifting ash/smog particle density with hubArc(); keep its existing reduced-motion / QUAL.level>=2 / ?norain-style gating (js/render.js:122-123).
- [ ] A&O drone livery bias: bias drone tint/markings with hubArc() via the AO_SHARE livery in js/hub_drones.js (confirm AO_SHARE symbol there) so late-arc skies show more A&O-branded patrol craft — render-only, no save/net change.
- [ ] POI-neon dimming with arc (DEFER per design doc): touches the per-faction building-neon pipeline (drawMegaNeonLayer / map_building_neon outputs) — higher blast radius, schedule after the building-neon system is stable.
- [ ] ui.js subtitle / crumb / objective copy swaps keyed on hubArc() bands (hopeful → grim) for the HUB chrome — text-only, no render-budget cost.

#### C1 · Constraints & safety

- [ ] Save-compat: add NO new persistent field. hubArc() reads CAMPAIGN.nextMapIndex which already persists (js/save.js:127/169) and defaults to 0 (js/hub.js:97); legacy saves missing it fall through `(CAMPAIGN.nextMapIndex||0)` → arc 0 → identical to today's time-only tint. No SAVE_VERSION bump.
- [ ] netRole — solo: render runs every frame, hubArc() reads the local CAMPAIGN; works directly. No change to update()/sim.
- [ ] netRole — host: host owns CAMPAIGN and renders its own arc tint locally; the value is broadcast as snap.campaign (js/net/sync.js:300/322).
- [ ] netRole — client: client is render-only and applies snap.campaign via deserializeHubCampaign, so CAMPAIGN.nextMapIndex is peer-identical → the ARC component of the tint matches the host. Note the time-of-day clock drifts on the client (tracks local rAF dt, per design doc), so the night-tint base may differ slightly, but the arc bias is peer-identical — acceptable for a cosmetic fill. Do NOT mutate CAMPAIGN or any sim state from the render path.
- [ ] Rollback guard: the arc tint is a pure draw with zero alloc and no event side-effects, so it does NOT need a `!window._rbReplaying` guard (that guard is for FX that SPAWN particles/sounds during replay). Verify the implementation spawns nothing — if a deferred slice (ash/smog) spawns particles, gate THAT slice on `!window._rbReplaying`.
- [ ] Determinism: hubArc() is a pure function of CAMPAIGN.nextMapIndex + lastEpisodeIndex() (no Math.random, no time, no per-peer state), so it never touches the sim RNG and never affects gameplay outcomes — it is render-only.
- [ ] Art direction (dark cyberpunk): the arc term only ADDS darkness toward a clamped ceiling and any hue lerp goes COLDER/sicker, never brighter — honors the dark/devastated/Hades direction. The combined ceiling (NIGHT_TINT_CEIL ≈ 0.16) plus the multiply-grade/vignette/grunge stack must stay 'dark but readable'; verify the HUD/labels/dialogs still read at full arc.
- [ ] QUAL parity: the arc fill is cheap (one rect, no animation), so reduced-motion gating is not strictly required (nothing moves). Mirror the existing convention — if applyPostStack is dropped at QUAL.level>=2, it is acceptable for the arc tint to keep drawing (it is a single fill); confirm with a perf glance rather than adding an unnecessary gate.

#### C1 · Verification

- [ ] Serve the repo: `python3 -m http.server 8000` from the repo root, open http://localhost:8000/rts.html.
- [ ] Solo baseline: start a fresh campaign (or use a save at an early episode) so CAMPAIGN.nextMapIndex≈0, enter the H.U.B., and observe the night-tint looks essentially unchanged from today (arc≈0).
- [ ] Solo late-arc: in console set `CAMPAIGN.nextMapIndex = lastEpisodeIndex()` then `refreshUI()` / re-enter the HUB, and observe the city is visibly darker/sicker than early-arc — confirm the HUD, POI labels, the day/night clock chip, and any open dialog all remain LEGIBLE (the combined-ceiling clamp working).
- [ ] Time-of-day cross-check: with a high nextMapIndex, scrub the hub clock through day→dusk→night (or set the clock) and confirm at peak night the combined alpha is clamped at the ceiling (no mud) and at day the arc still adds a faint sour tint.
- [ ] A/B flag: reload with http://localhost:8000/rts.html?noarctint=1 at the same high nextMapIndex and confirm the HUB reverts to the time-only baseline tint (proves the arc term is isolated and A/B-able).
- [ ] Save/load persistence: at a high nextMapIndex save the game, reload the page, Load the slot, enter the HUB, and confirm the darkened arc tint returns (proves it rides the already-persisted nextMapIndex with no new field).
- [ ] Co-op client reach: serve over http, host a co-op session at a high nextMapIndex and join as a client; confirm the client's HUB shows the same arc-level darkening as the host (arc component peer-identical via snap.campaign), and confirm the client never errors or mutates state. A small base-tint difference from clock drift is expected and acceptable.
- [ ] Perf glance: with ?perf=1 confirm the HUB overlay pass cost is unchanged within noise (the arc tint is one extra clamp + the same single fillRect).

**Verification summary.** First slice is verified manually in-browser across all three netRoles: serve via python3 -m http.server 8000, open rts.html. Solo — early-arc HUB looks unchanged (arc≈0); set CAMPAIGN.nextMapIndex=lastEpisodeIndex() in console and confirm the HUB is visibly darker/sicker yet HUD/labels/clock/dialogs stay legible (combined-ceiling clamp). A/B with ?noarctint=1 reverts to the time-only baseline. Save at high nextMapIndex, reload, Load → arc tint returns (rides the already-persisted field, no new save key). Co-op — host renders its arc locally and broadcasts snap.campaign; client applies it via deserializeHubCampaign so the arc darkening is peer-identical (base time-tint may drift slightly — acceptable cosmetic). Perf with ?perf=1 unchanged within noise (one extra clamp + the same single fillRect). No sim mutation, no RNG, no save/net-shape change.

---

## Appendix — Parked (future / optional)

### Task PARK — Parked: factional graffiti & corporate signage (future, optional) — static cfg.posters[] + render-only drawPosters behind ?noposters

**Goal.** A future, art-blocked, hand-authored poster/signage layer: a static per-map cfg.posters[] array drawn by a render-only drawPosters(state) gated on a ?noposters A/B flag.

**Effort:** M (blocked — do not start until a dark-cyberpunk poster atlas is authored)


**Files touched:** `js/assets.js (new POSTER_IMG/POSTER_READY/posterRect + LOADER.register an optional posters.webp atlas — mirrors decals at ~155-166)`, `js/render.js (add `posters` to the RENDER flag IIFE at 85-92; add render-only drawPosters(state) near bakeDecals; call it once per frame in the render path)`, `js/maps_data.js (author a static cfg.posters[] of hand-placed {x,y,idx} entries on one pilot map)`, `assets/atlas/posters.webp (NEW dark-cyberpunk poster/signage atlas — does not exist; hard prerequisite, art-blocked)`

#### PARK · Prep / locate (blockers — confirm before any code)

- [ ] BLOCKED — STATE THIS FIRST: this mechanic is the §7 parked, lowest-ROI outlier and CANNOT begin until two prerequisites exist: (a) a NEW hand-authored dark-cyberpunk poster/signage WebP atlas (no poster art exists today), and (b) acceptance that placement is HAND-AUTHORED per-map coords — there is NO territory/region-control state to drive placement (grep confirms only a single cfg.enemyFaction string per map; no regionControl/territory/tileOwner). Do not pitch this as 'near-zero authoring cost'.
- [ ] Confirm js/render.js:202 bakeDecals(g,state,tx0,ty0) is GROUND-TILE-ONLY and BIOME-KEYED: line 212 skips anything but T_GRASS/T_DIRT, line 213 picks the palette by state.biome[i] — there is no faction dimension and no wall/vertical surface, so posters must be a SEPARATE pass, not an extension of bakeDecals.
- [ ] Confirm the decal atlas idiom in js/assets.js:155-166 (ATLAS_DECALS const, DECAL_IMG = new Image(), DECAL_READY load flag, LOADER.register(DECAL_IMG, ATLAS_DECALS, {tag,tier:LOADER.T_AMBIENT,optional:true}), DECAL_CELL/DECAL_N grid, decalRect(biome,idx) returning an [sx,sy,sw,sh] cell rect) — this is the exact pattern a new POSTER atlas must copy (register via LOADER, never img.src; mark optional:true so a missing atlas degrades silently).
- [ ] Confirm the A/B flag idiom in js/render.js:85-92: the RENDER IIFE builds flags via off=k=>RegExp('[?&]no'+k+'=1') so adding `posters:!off('posters')` to the returned object wires `?noposters=1` with zero extra plumbing (mirrors decals/grunge/grade).
- [ ] Confirm cfg flows to render: combat maps come from the MAPS array in js/maps_data.js and cfg.enemyFaction (e.g. maps_data.js:259/812) is the ONLY faction signal available to tint/select a poster — there is no per-tile owner to vary it spatially, so each poster entry must carry its own explicit {x,y} (and optionally a faction/variant index).

#### PARK · First slice (ONLY once the atlas is authored — smallest shippable)

- [ ] Add the poster atlas to js/assets.js mirroring assets.js:155-166: a POSTER_IMG = new Image(), POSTER_READY load flag, LOADER.register(POSTER_IMG, ATLAS_BASE+'atlas/posters.webp', {tag:'atlas:posters', tier:LOADER.T_AMBIENT, weight:1, optional:true}), plus POSTER_CELL/POSTER_N grid consts and a posterRect(idx) helper returning the cell [sx,sy,sw,sh] (return null when !POSTER_READY).
- [ ] Add `posters:!off('posters')` to the RENDER object returned at js/render.js:88-91 so `?noposters=1` disables the layer.
- [ ] Author a static, HAND-PLACED cfg.posters array on ONE pilot map in js/maps_data.js — shape `posters:[{x,y,idx,scale?,faction?}]` (tile coords; idx selects an atlas cell; faction optional, defaults to cfg.enemyFaction) — keep it tiny (2-4 entries) to prove the pass.
- [ ] Add a render-only `drawPosters(state)` function in js/render.js (near bakeDecals / the world-overlay passes): early-return if `!RENDER.posters || !POSTER_READY || !state.cfg || !state.cfg.posters`; for each entry compute the world position from {x,y}*TILE, skip if its tile is unexplored (`!state.explored[i]` — mirror bakeDecals:211 fog gate), and g.drawImage the posterRect(idx) cell at a dark, value-suppressed globalAlpha (~0.6, mirror bakeDecals:221) so it honors the dark art direction. Read coords directly (no mutation, no entity spawn).
- [ ] Call drawPosters(state) ONCE per frame from the existing render path after the world/feature draw and before the post-stack/HUD (a live overlay pass, NOT inside bakeDecals' chunk bake, since posters are placed by explicit coords not chunk-jitter).

#### PARK · Constraints & safety

- [ ] Save-compat: cfg.posters is authored STATIC map data (read-only at runtime), never serialized — old saves with no posters field simply render nothing (treat missing as legacy empty). No SAVE_VERSION bump, no js/save.js change, no js/net/sync.js change.
- [ ] Three netRoles: drawPosters reads only state.cfg (static map data) + state.explored (local fog) and mutates NOTHING — solo, host, AND client all render it identically because every map loads the same cfg and computes its own fog. It reaches the co-op client FOR FREE (no snapshot dependency), unlike host-only update() systems.
- [ ] Determinism: placement is fully deterministic (explicit authored coords, no RNG) — no jitter/hash, so it is byte-identical across peers; if any per-poster variation is ever added it must be seeded off the authored entry (e.g. idx), never Math.random.
- [ ] Rollback/FX guard: drawPosters is a pure draw with no particle/FX spawns and no sim mutation, so it does NOT need the !window._rbReplaying guard (it never fires events). If a later slice adds reactive FX (flicker/spawn), THAT site must add !window._rbReplaying.
- [ ] Art direction: the authored atlas and the draw alpha MUST be dark/devastated cyberpunk (grimy, value-suppressed, never bright/clean) — match the decal/grunge darken-dominant treatment; reject any glowing clean-poster look.

#### PARK · Verification (once unblocked)

- [ ] Serve via `python3 -m http.server 8000` and open http://localhost:8000/rts.html; load the pilot map carrying cfg.posters and confirm the authored posters appear at their hand-placed tiles, dark and grime-blended, only after their tiles are explored (move a unit to reveal one — it should pop in with fog, not before).
- [ ] Open the same map with http://localhost:8000/rts.html?noposters=1 and confirm the poster layer is fully gone (A/B proves the flag), with no console errors and no change to terrain/decals.
- [ ] Temporarily rename/remove the posters.webp (or load before it finishes) and confirm the game runs with NO posters and NO errors (optional:true atlas degrades silently — the dark-art procedural-fallback discipline).
- [ ] Co-op smoke check: host a game on the pilot map, join as client; confirm BOTH players see identical posters at identical tiles as fog reveals them (client renders from its own cfg+fog, no snapshot needed).
- [ ] Save/load: since cfg.posters is static map data (not serialized), save mid-map and reload the slot — confirm posters re-render unchanged with no double-draw and no save error.

**Verification summary.** Confirmed every anchor by reading the code: bakeDecals (render.js:202-229) is ground-only/biome-keyed (T_GRASS/T_DIRT gate at 212, biome palette at 213) with no faction/wall dimension, so posters must be a separate render pass; the decal atlas idiom (assets.js:155-166: const+Image()+READY flag+LOADER.register optional:true+CELL/N grid+decalRect) is the exact template a new optional posters.webp atlas must copy; cfg.enemyFaction (maps_data.js, e.g. 259/812) is genuinely the ONLY faction signal and there is no territory/tileOwner state, so placement is hand-authored coords as the doc states; and the RENDER flag IIFE (render.js:85-92) uses off=k=>/no<k>=1/ so `posters:!off('posters')` cleanly wires ?noposters. The §7 design text is accurate — no stale anchors found. This stays a brief 4-group skeleton (2 of which are the small Prep + First-slice cores requested) and is explicitly blocked on new art + hand-authored coords.

---

