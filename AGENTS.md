# STARLEFT Agent Notes

This file is repo-specific context for coding agents. Keep it current when the architecture or workflow changes.

## Project Shape

- STARLEFT is a no-build browser RTS loaded from `rts.html`.
- The runtime is plain HTML, CSS, and classic JavaScript scripts sharing one global scope.
- There is no bundler, package manager, framework, or module graph for the main game.
- `rts.html` script order is the dependency graph. `js/config.js` loads first; `js/main.js` loads last.
- The only runtime ES module is `js/net/trystero-boot.js`, loaded after the classic scripts to expose `window.MP`.
- Shared mutable game state is global `G`, defined in `js/state.js`.
- Most systems use globals such as `DEF`, `MAPS`, `TILE`, `cv`, `ctx`, `netRole`, `LOCAL_CTRL`, and helper functions from earlier-loaded scripts.

## Main Runtime Flow

- `rts.html` defines the canvas, HUD, menus, multiplayer lobby, save/load UI, roster/events screens, intro crawl, and script includes.
- `js/config.js` defines constants, canvas refs, terrain/biome constants, and unit/building definitions in `DEF`.
- `js/maps_data.js` holds the campaign maps (`MAPS` array) — extracted from config.js (loaded right after it) so the map editor can rewrite this file in isolation. `js/map_paint.js` defines the per-tile `cfg.paint` terrain-override codec applied by `newMap`.
- `js/state.js` defines global game/session state, deterministic RNG helpers, multiplayer role globals, and economy helpers.
- `js/map.js` creates maps with `newMap(idx)`: scales map config, generates terrain/biomes, builds passability grids, places resources, player/enemy bases, co-op starts, captives, outposts, and entities.
- `js/main.js` registers input listeners, wires UI buttons, starts menu features, and runs the `requestAnimationFrame` loop.
- `js/core.js` is the per-tick simulation coordinator: production, unit updates, separation, AI, reclaim/free-captive checks, fog, particles, water, dialogs, death cleanup, and win/loss.
- `js/units.js` contains pathfinding, command execution, movement/combat/gather/build behavior, production, placement, and entity factories.
- `js/input.js` contains input handler functions: selection, command dispatch, box select, control groups, camera pan/zoom, entity picking.
- `js/render.js` owns fog-of-war visibility and all canvas drawing: terrain, water, particles, depth-sorted entities/features, placement ghosts, selection effects, dialogs, and minimap.
- `js/ui.js` owns DOM-facing game UI: HUD refresh, command buttons, production queue, toasts/events, menu navigation, map loading, intro crawl, victory/defeat flow, roster/dossier screens.
- `js/save.js` serializes/deserializes `G` to browser `localStorage`, including entity reference relinking.
- `js/assets.js` is the single source of truth for runtime image/audio paths and sprite loading helpers. Sprite sheets ship as WebP (converted by `_dev/gen/optimize_assets.py`).
- `js/loader.js` (parses BEFORE assets.js) is the central image registry: tiered download queue, retry/backoff on failure, settle-on-first-event semantics, and the mission-gate API (`LOADER.beginMission`/`missionReady`) that `gateMission()` in ui.js uses to hold the world view behind the `#loadGate` loading screen until a map's critical sprites arrive. Every runtime Image must register through it (never assign `img.src` directly).
- `sw.js` (repo root) is a runtime cache-first service worker for `assets/` only — never code. Bump its `CACHE` version when shipped asset URLs change.

## Simulation Model

- Solo mode: `main.js` calls `update(G, dt)` every RAF tick while running.
- Host co-op mode: the host is authoritative and advances the simulation through the host clock/sync layer.
- Client co-op mode: clients do not simulate gameplay. They apply host snapshots, interpolate unit positions, run cosmetic updates, compute local fog, and render.
- Avoid adding client-side gameplay mutations unless they are explicitly cosmetic or local UI state.
- Selection, camera, zoom, and control groups are local-only in multiplayer.
- Networked gameplay commands should go through the `net*` wrappers from `js/net/commands.js` so solo, host, and client paths stay consistent.

## Multiplayer Files

- `js/net/mp-ready.js`: readiness helpers for the deferred `window.MP` facade.
- `js/net/commands.js`: wraps command/train/place/stop/cancel actions; clients send commands, host validates and replays them through existing gameplay functions.
- `js/net/sync.js`: host-authoritative full snapshots and compact entity snapshots.
- `js/net/host-clock.js`: keeps host simulation/snapshot broadcasting alive when RAF stalls.
- `js/net/mp.js`: room lifecycle, role transitions, lobby-to-match handshake, peer drop handling, campaign advance.
- `js/net/lobby.js`, `js/net/mp-ui.js`: multiplayer lobby/presence/UI behavior.
- `js/net/voice-chat.js`: WebRTC voice/comms behavior.
- `js/net/features.js`: feature availability and network quality helpers.
- `js/net/trystero-boot.js`: only ES module; loads vendored Trystero/Nostr WebRTC and publishes `window.MP`.

## Important Constraints

- Preserve classic global script order in `rts.html`.
- Do not convert files to modules, add bundling, or introduce a framework unless explicitly requested.
- Keep edits scoped. Many systems rely on side effects and global ordering.
- Be careful with save compatibility in `js/save.js`; old saves may lack newer fields.
- All save/load changes MUST be retrocompatible with older save files. Treat missing fields as legacy data, infer safe defaults, and do not require newly-added metadata for a save to appear in the Load Game list.
- When adding persistent state, update save serialization/deserialization intentionally.
- When adding entity reference fields, ensure save/load reference encoding still handles them.
- When changing entity shape or IDs, consider multiplayer snapshot packing/unpacking in `js/net/sync.js`.
- When changing commands or simulation mutations, consider both solo and co-op paths.
- When changing map generation or terrain passability, verify resource/base reachability and feature masks.
- When changing UI command buttons, preserve `refreshUI()`'s signature-based rebuild pattern; rebuilding buttons too often can eat clicks.
- Runtime paths should remain relative so the game works from GitHub Pages subpaths.
- Generated/runtime art is optional where code has procedural fallbacks; do not assume every optional asset exists.

## Newer Systems (2026-06 critique pass — see docs/critique_tasks.md)

- `js/sfx.js` — WebAudio combat/UI one-shots (rate-limited, missing-file-safe); clips generated by `_dev/gen/gen_sfx.py` into `assets/audio/sfx/`. `MUSIC.playAmbient(biome)` plays per-biome drone beds in missions.
- `js/telemetry.js` — `TELE.event(name, props)`; endpoint EMPTY by default (sends nothing), consent + DNT gated.
- `js/achievements.js` — `ACH.fire(event, ctx)` hooks at existing sites; localStorage-only; rendered in the Roster overlay.
- `js/sharecard.js` — `shareCard(unit_or_fallen)` renders a dark PNG card offscreen; share/clipboard/download ladder. Buttons in dossier, roster rows, carry chooser, fallen interstitial.
- `js/fallen_scene.js` — solo-gated ~2.6s memorial beat on a Lv2+ veteran death (called from `recordFallen`).
- `js/skirmish_gen.js` + `js/mutators.js` — solo Skirmish/Daily/Random (seed-rolled cfg in a transient `MAPS` slot; never saved) + stackable mutators (skirmish-only). `rollDuelConfig`/`installDuelConfig` build the PvP arena.
- **Win verbs (T2-1):** `cfg.winCondition` `{type:'survive'|'escort'|'reachAndHold',…}` branches `checkWinLose` via `checkAltWin` (core.js); escort VIPs flagged `u._vip` in map.js; gold objective beacon in render.js.
- **Scripted events (T2-8):** `cfg.events` `[{atTime, toast/objective/aggression/spawnSquad/villain}]` processed once each in `update()` (`runMapEvent`).
- **Abilities & stances (T2-2/T2-3):** `ABILITIES`/`castAbility`, `commandAttackMove`, `setStance` in units.js; replicated via `netAbility`/`netAmove`/`netStance` (commands.js + rollback-input.js). `u.abilCd`/`u.stance` are sim state with legacy-safe defaults.
- **Counter axis (T2-4):** `DEF.armor` (flat % reduction) vs `DEF.pierce` (ignores armor) in `damage()`.
- **Economy (T2-5):** `ECON` knobs in config.js applied in newMap (home-node trim + auto contested node; `cfg.noEconRebalance` opts a map out). Satellite Office grants supply.
- **Difficulty (T4-2):** `DIFFICULTY` table; the choice is stamped on `state._difficulty` at map load so peers agree; sim reads via `diffOf(state)`.
- **Campaign routing (T2-7/T4-1):** REX is `finale:true`; `villainNextLinear` advances PAST the last episode (unlocking The Wake); `hubNextDeployIndex()` is the single source of truth for the next hub deployment; appended side missions use `isVillain` gating with `winCondition` instead of a boss.
- **PvP duel (T4-5):** `MP_SESSION.mode==='duel'` stamps `G._pvp`; `isHostile` splits player-vs-player by `ctrl`; last-founder-standing check in `checkWinLose`; `_pvp`/`_pvpWinner` ride the snapshot scalars.
- **NG+ (T3-1):** `CAMPAIGN.ngPlus` (legacy default 0) scales aggression at cfg-derivation + vetScaling; `startNgPlus()` in ui.js.
- The death/damage feedback layer (deathFx, floaters, kill streaks, heal beams, cooldown rings) lives in render.js/units.js and is `_rbReplaying`-gated; co-op clients derive it from snapshot deltas in sync.js.

## Common Edit Targets

- Unit/building stats, costs, names, flavor: `js/config.js`. Map definitions (`MAPS`): `js/maps_data.js` (per-tile terrain overrides: `js/map_paint.js`).
- New terrain/map-generation behavior: `js/map.js`.
- Unit behavior, combat, gathering, building, production, pathfinding: `js/units.js`.
- Overall per-frame simulation sequencing: `js/core.js`.
- Selection/commands/camera/gestures: `js/input.js` plus listener wiring in `js/main.js`.
- Canvas visuals/fog/minimap: `js/render.js`.
- HUD/menus/buttons/toasts/game flow: `js/ui.js`.
- Save/load/export/import: `js/save.js`.
- Asset paths/sprite loading: `js/assets.js`.
- Enemy production/waves/fortification: `js/ai.js`.
- Career/veterans/heroes: `js/career.js`, `js/lore.js`, and related data files.
- Live news stream: `js/lns.js`, `css/lns.css`.
- Water visuals: `js/water.js`.
- Ambient effects: `js/particles.js`.
- In-world speech/dialogs: `js/dialogs.js`, `js/dialog_data.js`, `js/lore_data.js`.
- Multiplayer: `js/net/*`.

## Data And Assets

- Runtime assets live under `assets/`.
- Generated/intermediate asset scripts and source material live under `_dev/`.
- Prompt/reference material lives under `prompts/` and `_dev/prompts/`.
- `assets/atlas/` contains terrain/building/feature atlases used at runtime.
- `assets/units/<type>/` contains unit animation strips.
- `assets/buildings/` contains building animation strips.
- `assets/audio/voice/` contains optional voice/crawl/bark MP3s.

## Testing And Verification

- There is no standard automated test command in this repo.
- For browser behavior, open `rts.html` directly or serve the directory with a simple static server if needed.
- After gameplay changes, manually verify at least: starting a map, selecting units, issuing move/attack/gather commands, building placement, production, saving/loading if touched, and co-op paths if network code was touched.
- For rendering/layout changes, check both desktop and narrow/mobile viewport behavior because HUD heights drive canvas viewport math.

## Worktree Notes

- A dirty worktree may include user or generated changes. Do not revert unrelated changes.
- Current generated/config artifacts may appear under `js/starleft-config-episode12*`, `prompts/starleft-mapmaker/`, or `prompts/todos/`; treat them as user work unless told otherwise.
