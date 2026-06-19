---
name: starleft-lore-forge
description: >-
  Grow the STARLEFT career dossier / life-event system end to end — add MORE procedurally-linked
  unit backstories (family, trauma, dream, crime), MORE level-up life events, MORE selection barks
  and hero one-liners, then run the whole dev-time pipeline from text to local Qwen3-TTS voice
  recording across every unit's already-assigned voice. Use this WHENEVER the user wants to expand,
  add to, or generate new content for the dossier/lore system — "add 80 life events", "more
  backstories", "give veterans new traumas/dreams", "write more career events", "the dossiers feel
  repetitive, add variety", "more unit barks", "new lines for Nino", "voice the new lore", "deepen
  the player–unit bond" — even when they don't name the system or say "lore". Treat any request to
  add narrative life-events, backstory pools, dossier flavor, unit/hero voice lines, or to re-run the
  lore→TTS pipeline as a lore-forge task. It ALSO owns the OFF-HOURS relationship scenes — the
  multi-beat dialogue-tree conversations at THE LATE SHIFT / MARISOL'S / STATIC that deepen bonds and
  write distinct dossier life-events — so "add off-hours scenes", "more bar/Sable conversations",
  "deepen the club/diner dialog", "a new vet↔vet romance/rival/mentor scene", "the off-hours nights
  feel repetitive", "give each scene its own dossier line" are lore-forge tasks too (a TEXT-ONLY
  track — author → validate → verify in-browser, no voice recording). It owns the append-only contract
  that keeps saved games and the index-keyed voice clips valid, the version-gating that freezes
  existing veterans' identities when pools grow, the per-unit voice map, and the HARD approval gate
  before any voice is recorded.
  SKIP for: new playable units/heroes' stats & sprites (use starleft-unit-forge), new campaign
  maps/episodes/factions or intro-crawl narration (use starleft-mapmaker), tweaking ONE existing
  event's wording (edit the source directly), and gameplay/career-XP mechanics changes.
---

# STARLEFT Lore Forge

A guided pipeline for **adding to** the unit dossier / life-event system — the feature that gives
each career unit (level 2+) a seed-built backstory and, at every level-up, a life event woven from
that backstory, many spoken aloud in the unit's voice. Growing it safely touches several coupled
pieces: the static pools in `js/lore_data.js`, the index-aligned reaction lines in
`js/dialog_data.js`, the per-unit voice map, and ~2,800 pre-rendered clips under
`assets/audio/voice/`. Miss the coupling and you corrupt saved games (events are stored by index),
orphan or misname voice clips (files are named by index), or silently rewrite the name and history
of a player's beloved veteran. This skill runs all of it in order so those invariants hold.

You are **collaborating, not autogenerating.** Authoring narrative is a craft, and voice recording
is slow, local, and irreversible-ish (it overwrites files). So the work is staged: you author and
generate the cheap, reversible text/data first, *prove* it's a safe append-only extension, then stop
at a **hard gate** and show the user exactly how many clips will be recorded before spending the GPU.

## The one rule everything depends on: APPEND-ONLY

Saved units store each life event as `{lvl, i}` — an **index** into `LORE_DATA.events`. Voice clips
are named `lore/<voice>_<i>.mp3` by that same index, and `LORE_SAY[i]` (the reaction line) is
index-aligned too. So **existing entries can never be reordered, renamed, or deleted** — only new
ones appended at the end. Background pools (names, hometowns, family, traumas, dreams, crimes) have a
subtler trap: a dossier is rebuilt live from a seed as `pool[floor(rng()*pool.length)]`, so merely
*growing* a pool would remap every already-saved veteran's identity. The fix is **version-gating**:
each content drop is a "version", and a unit minted at version *v* keeps drawing from the pool
lengths frozen at *v* — new entries are only ever seen by recruits minted afterward.

You don't enforce this by hand. All new content goes into one append-only ledger and the generators
+ validator enforce the contract. Read `references/data-schema.md` before authoring.

## Before you start: load the world

- **`references/data-schema.md`** — the exact `LORE_DATA` / event / `LORE_SAY` / `versions` shapes,
  the append-only & version-gate contracts, the slot vocabulary, and the voice/clip-id maps. The
  backbone of Phases 1–4.
- **`references/lore-tone-guide.md`** — the dark cyberpunk-corporate voice, how each event must
  *connect to* a unit's aspect (family/trauma/dream/crime), the `fx` grammar, and how to write
  `say` lines that earn a voice clip. The backbone of Phase 2.
- **`references/pipeline.md`** — every command in order, the gitignored `_dev/gen/*` scripts you
  drive, and the local Qwen3-TTS (twilightZone) prerequisites. The backbone of Phases 3–7.
- **`references/offhours-scenes.md`** — the OFF-HOURS multi-beat scene schema, the venues/kinds, the
  engine, the save-safety invariants, the token vocabulary (incl. the render-time `{fallen}`/`{lastmap}`),
  and the distinct-dossier-line rule. The backbone of the **Off-Hours scene track** below (text-only).

Then skim the live source so your edits match reality: `js/lore.js` (how dossiers/events are rolled),
`_dev/gen/voice_map.mjs` (which unit speaks in which voice), and the current `js/lore_data.js` counts.

## The phases

Work in order. Each ends with a checkpoint; nothing irreversible happens before Phase 5.

### Phase 1 — Read the current state

Establish what exists so additions extend it rather than collide. Report to the user the current
counts and the per-aspect mix, e.g.:

```bash
node -e 'const fs=require("fs"),vm=require("vm");const c={};vm.runInNewContext(fs.readFileSync("js/lore_data.js","utf8")+";globalThis.__=LORE_DATA",c);const D=c.__;const rb=D.events.reduce((a,e)=>((a[e.req]=(a[e.req]||0)+1),a),{});console.log("events",D.events.length,rb,"| versions",D.versions.length,"| traumas",D.traumas.length,"dreams",D.dreams.length,"crimes",D.crimes.length,"family",D.family.length)'
```

Confirm the **scope** with the user: how many life events, and split across which aspects? Any new
background elements (traumas/dreams/crimes/family/names/hometowns)? Any barks (which unit types) or
hero lines (Nino/Biba)? Keeping the aspect mix roughly proportional to what's there (family is the
largest bucket, then `any`, then trauma/dream/crime) keeps the rolls feeling balanced — but follow
the user's intent. State your plan in a sentence or two and confirm before authoring.

### Phase 2 — Author the content drop (the craft step)

Append **one new block** to the end of `ADD_BLOCKS` in `_dev/gen/lore_additions.mjs` (never edit an
existing block — that's the append-only rule; the file's own header documents the shape). Following
`references/lore-tone-guide.md`:

- **Life events** — each `{req, tone, text, say}` (+ optional `fx`, `min`). Make the `text` connect
  to the unit's aspect via its slots (`{relName}`, `{trauma}`, `{dream}`, `{crime}`, `{home}`), and
  write a short, **variable-free** `say` (no `{ }`) so it earns a voice clip in every career voice.
  Every event `text` must be unique vs all existing events (a collision is a hard error — it would
  misalign `LORE_SAY`).
- **Background elements** — append to `backgrounds.{family,traumas,dreams,crimes,…}`. These freeze
  existing veterans automatically (version-gating); only new recruits see them.
- **Barks / hero lines** — `barks:{<unitType>:[…]}` and `heroLines:{Nino|Biba:[…]}`, in the voice
  already assigned to that speaker.

You are the dev-time author here — write the lines yourself, in-voice, rather than reaching for an
external API. Show the user a representative sample of what you wrote before generating; narrative is
a taste call and cheap to revise now.

### Phase 3 — Generate the static data (reversible)

Run the pipeline (details + the gitignored script locations are in `references/pipeline.md`):

```bash
node _dev/gen/gen_lore.mjs            # appends events + grows pools + bumps LORE_DATA.versions
node _dev/gen/build_dialog_data.mjs   # appends say lines (index-aligned) + barks + hero lines
node _dev/gen/build_voice_manifests.mjs                                  # full TTS manifests
node .claude/skills/starleft-lore-forge/scripts/filter_new_clips.mjs     # → *_new.json (only-new)
```

`gen_lore.mjs` self-aborts if anything would shift a committed index (it compares against git HEAD),
so a green run already means the events/pools grew cleanly. This step only writes text/JSON — fully
reversible by reverting the block and re-running.

### Phase 4 — Validate (prove it's safe)

```bash
node .claude/skills/starleft-lore-forge/scripts/validate_lore_append.mjs
```

This must pass before you go near the voice gate. It proves the regenerated data is append-only vs
git HEAD, that `LORE_SAY` stays index-aligned with `events`, that every event's slots/req/tone are
legal, that `versions` is monotonic and matches the live pools, and — the identity guarantee — that
a sample of already-saved (v1/legacy) units get **byte-identical dossiers** under the new data. It
also reports exactly how many new clips a render will produce. If it fails, fix the block and return
to Phase 3; do not proceed.

### Phase 5 — 🚧 HARD APPROVAL GATE (do not skip)

Voice recording is the expensive, slow, local-GPU step, so it never runs without an explicit yes.
Summarize for the user and **stop**:

- new background elements by category, new events by aspect, new barks/hero lines;
- **N new voice clips to record** (from `validate`/`filter`: new variable-free lore lines ×
  career voices + new barks), the voices involved, and the output dirs;
- a rough time estimate (model load ~5–10s + a one-time ~60s JIT warmup per model, then a few
  seconds per clip — see `references/pipeline.md`).

Then ask for explicit approval to record. Wait for a clear "yes" before Phase 6. (This is the gate
the user specifically asked for; honor it even if the drop is small.)

### Phase 6 — Record the voice (gated, incremental)

Only after approval, and only the new clips:

```bash
bash _dev/gen/gen_voices.sh new
```

This drives the local Qwen3-TTS in `references/pipeline.md`: preset career voices + bark speakers via
`tts_generate.py`, clone voices (e.g. Brad_Pitt→`cast1` for Nino) via `clone_voice.py`, then ffmpeg
to 56 kbps mono mp3 into `assets/audio/voice/{lore,barks}/`. It renders ONLY the `*_new.json`
manifests, so the existing thousands of clips are never re-recorded. Requires the twilightZone venv +
models (Apple Silicon) — if the preflight fails, surface it and offer to retry rather than faking
audio. New variable-free lore lines are recorded across **all** career voices so any unit can speak
them — that's the "for all units" coverage.

### Phase 7 — Verify

```bash
node .claude/skills/starleft-lore-forge/scripts/verify_clips.mjs   # every queued clip now exists, durations sane
```

Then suggest a manual in-browser pass (serve, level a unit past 2–3 to see the new events and hear
the new lore in its assigned voice; select units/heroes for new barks; load a pre-update save to
confirm the veteran's identity is unchanged and new events only appear at *future* level-ups). Close
out by summarizing what was added and recorded vs. what was left for the user.

## Off-Hours scene track (a sibling track — TEXT-ONLY, no voice gate)

Authoring **Off-Hours dialogue-tree scenes** (the bar/diner/club conversations that deepen bonds and
write dossier life-events) is the same append-only/index discipline, but **text/data only — no voice
recording, no GPU, no Phase-5 gate**. All content lives directly in `js/offhours_data.js`. Read
`references/offhours-scenes.md` first, then work in order:

### O1 — Read the current state
```bash
node .claude/skills/starleft-lore-forge/scripts/validate_offhours.mjs   # prints scene/event counts + the per-arc coverage table
```
Confirm scope with the user: which arc(s) — bar/confidant (Sable), diner/kin, club/friend·rival·
romance·mentor — how many scenes, which tiers. Aim for **≥2 eligible scenes at each low tier** or the
opener repeats. State the plan in a sentence and confirm before authoring.

### O2 — Author the multi-beat scenes (the craft step)
Append NEW scene objects to the **end** of `OFFHOURS.scenes` (never reorder/insert). Each is a small
conversation tree (`beats[]` with `next`; full schema in the reference): the counterpart opens, the
veteran's choices branch, a terminal branch ends it. Match the terse dark-vet voice
(`lore-tone-guide.md`); gate deep beats on `crime`/`trauma`/`dream`; put ONE `ARC_UNLOCKED` favor on a
T2-3 confession; a tier-4 `capstone`. For a large drop, a parallel author→tighten→validate workflow
keeps the lines distinct and in-voice — but you are the dev-time author; show the user a sample first.

### O3 — Give each outcome its OWN dossier line
Append one `events` entry per scene-outcome (the lasting memory) + an **index-aligned `say`** + (kin/
diner only) an `npcEvents` line, all at the end, then point each terminal branch's `ev` at its new
index. **Never share an `ev` across scenes** — sharing makes different nights render the identical
service-record line (the validator warns). This is the "give each scene its own dossier line" rule.

### O4 — Validate (prove it's safe)
```bash
node .claude/skills/starleft-lore-forge/scripts/validate_offhours.mjs
```
Must exit 0: append-only vs HEAD (scene-id prefix; events/say byte-identical prefix), `events.length
=== say.length`, every beat-graph valid (forward `next`, all beats reachable, a terminal exists,
beat-0 has an ungated choice), gates/`ev`/`fl` legal, `fx:capstone` only at tier 4, tokens safe. Fix
and re-run until clean; ev-sharing is a warning to address, not a blocker.

### O5 — Verify in-browser (no voice gate)
Serve, enter the hub, open the venue's interior, direct a vet through a new scene → it commits (charges
M3$ once, marks `seen` once), writes the **distinct** dossier line (check the unit's Service Record),
and rotates a different opener next visit. Playwright eval against `OFFHOURS` / `applyOffhoursCommit` /
`dossierFileHTML` is the fast path. There is **no Phase-5 voice gate** — off-hours `say` is index-keyed
for a *future* voice pass but isn't recorded today; just keep it aligned. Summarize what was added.

## Guardrails

- **Append, never reorder.** Add a NEW block at the end of `ADD_BLOCKS`; never edit/delete an
  existing block or entry. The generators + `validate_lore_append.mjs` enforce this against git HEAD,
  but understanding *why* (saved indices + clip filenames) keeps you from fighting the guard.
- **Bump the version by growing backgrounds through the ledger.** Don't hand-edit pool arrays in
  `gen_lore.mjs` or the `versions` table — let a block do it, so existing veterans stay frozen.
- **Keep `say` lines variable-free to get voice.** A `say` with a `{slot}` (or `null`) is fine but
  stays text-only (runtime tone+aspect fallback). If the user wants the line voiced, write it without
  slots.
- **Follow the existing voice map.** Units speak in their already-assigned voice
  (`_dev/gen/voice_map.mjs`, mirrored in `js/voice.js`); adding a *new* voice or unit type is out of
  scope — that's unit-forge + a voice-map edit.
- **Never record without the gate.** The text/data half is cheap and safe; recording is not. Always
  land on Phase 5 and get an explicit yes.
- **Save compatibility is sacred.** A legacy save (no `v`, missing fields) must still load with its
  veterans unchanged — `validate` checks this; if it ever fails, stop and diagnose before shipping.
- **Off-Hours scenes are a TEXT-ONLY sibling track.** Append-only `OFFHOURS.scenes`/`events`/`say`/
  `npcEvents` in `js/offhours_data.js`; each scene a valid beat-graph; each outcome its OWN `ev` (never
  shared); gates only crime/trauma/dream; `{fallen}`/`{lastmap}` resolve at render (don't store a map).
  Prove it with `validate_offhours.mjs` — there is **no voice gate**. Schema + invariants in
  `references/offhours-scenes.md`.

## Optional follow-through

- **Crawl narration / new maps** are a different system — offer `starleft-mapmaker`.
- **A new unit or hero** (stats + sprites) is `starleft-unit-forge`; come back here afterward to give
  it barks and weave it into the life-event pools.
- **Tuning roll frequency / aspect bias** lives in `js/lore.js` (`LIFE_FX`) — a small code tweak,
  flag it rather than forcing it through a content drop.
