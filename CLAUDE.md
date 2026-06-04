# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> A detailed per-file map and the full list of editing constraints live in **`AGENTS.md`**. Read it before non-trivial work; this file is the orientation layer.

## What this is

STARLEFT is a **no-build browser RTS**. It is plain HTML + CSS + classic (non-module) JavaScript that all share **one global scope**. There is no bundler, package manager, framework, transpile step, or module graph for the game. The game is loaded from `rts.html`; it deploys as a static site to GitHub Pages.

## Running & verifying

There is no build, lint, or test command — nothing to compile and no automated test suite.

```bash
# Serve from the repo root (needed for multiplayer; file:// disables WebRTC co-op):
python3 -m http.server 8000        # then open http://localhost:8000/rts.html
```

- Open `rts.html` for the game; `hub-map-editor.html` is a standalone tool for editing `js/hub_map_data.js`.
- All runtime paths are **relative** so the game works from a GitHub Pages subpath — keep them relative.
- **Verification is manual.** After gameplay changes, in a browser confirm: load a map, select units, issue move/attack/gather, place a building, train a unit, and (if touched) save/load and co-op. After render/layout changes, check both desktop and a narrow/mobile viewport — HUD height drives canvas viewport math.
- Console helpers exist for quick checks (e.g. `mkUnit(G, 'worker', 'player', x, y); refreshUI();` spawns a unit at tile x,y). See `docs/`.

## Architecture

**Script order in `rts.html` *is* the dependency graph.** `js/config.js` loads first (defines everything later code reads); `js/main.js` loads last (wires input + starts the loop). The only ES module is `js/net/trystero-boot.js`, loaded after the classic scripts to publish `window.MP`. Do not reorder includes, convert files to modules, or add a bundler.

**State is a single global `G`** (defined in `js/state.js`) — the active map/session. Systems also lean on globals like `DEF`, `MAPS`, `TILE`, `cv`/`ctx`, `netRole`, and `LOCAL_CTRL`. Side effects and load order matter; keep edits scoped.

Per-frame flow: `main.js` runs the `requestAnimationFrame` loop → `core.js` (`update(G, dt)`) sequences one tick (production, unit AI, separation, fog, particles, water, dialogs, death cleanup, win/loss) → `render.js` draws the canvas → `ui.js` refreshes the DOM HUD.

Key files (full list in `AGENTS.md`):
- `js/config.js` — `TILE`, terrain/biome constants, `DEF` (unit/building stats), and the `MAPS` campaign array. Most stat/cost/map edits live here.
- `js/map.js` — `newMap(idx)` procedural terrain/biome/passability/resource/base generation.
- `js/units.js` — pathfinding, command execution, movement/combat/gather/build, production, entity factories.
- `js/input.js` — selection, commands, camera, control groups (listeners wired in `main.js`).
- `js/render.js` — fog-of-war + all canvas drawing + minimap.
- `js/ui.js` — HUD, command buttons, queues, toasts, menus, intro crawl, victory/defeat, roster/dossier.
- `js/save.js` — `localStorage` serialize/deserialize with entity-reference relinking.
- `js/ai.js` — enemy production/waves/fortification.

## The three simulation paths (`netRole`)

Every gameplay change must hold for all three:
- **Solo** (`'solo'`): `main.js` calls `update(G, dt)` directly each tick.
- **Host co-op** (`'host'`): host is authoritative and broadcasts snapshots.
- **Client co-op** (`'client'`): clients **do not simulate** — they apply host snapshots, interpolate, compute local fog, and render. Do not add client-side gameplay mutations unless they are explicitly cosmetic or local UI (selection, camera, zoom, control groups are always local).

Route networked gameplay actions through the `net*` wrappers in `js/net/commands.js` so solo/host/client stay consistent. Changing entity shape/IDs means updating snapshot packing in `js/net/sync.js`.

## Non-negotiable constraints

- **Save compatibility is mandatory.** All `js/save.js` changes must be backward-compatible: treat missing fields as legacy, infer safe defaults, and never require new metadata for an old save to load or appear in the Load Game list. When adding persistent state or entity reference fields, update serialization *and* reference encoding intentionally.
- **Map generation:** when changing terrain/passability, verify resource and base reachability and feature masks.
- **UI buttons:** preserve `refreshUI()`'s signature-based rebuild pattern — rebuilding command buttons too eagerly eats clicks.
- **Art direction is dark/devastated cyberpunk** (Hades-inspired), never bright. Procedural fallbacks exist for optional generated art; don't assume every asset file is present.

## Conventions

- `_dev/` (gitignored) holds source art and generation scripts; `assets/` holds runtime art/audio; `prompts/` and `_dev/prompts/` hold reference material.
- To add/extend a campaign map, mission, episode, faction, or opening crawl, use the **`starleft-mapmaker`** skill rather than hand-editing the `MAPS` array — it knows the schema, generator, lore/career system, and TTS crawl pipeline.
