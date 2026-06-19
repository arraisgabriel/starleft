# Off-Hours scene schema & contracts

The authoritative shapes for the **Off-Hours** relationship system — the after-shift venues (THE LATE
SHIFT / MARISOL'S / STATIC) where you direct veterans through **multi-beat dialogue-tree conversations**
that deepen bonds and write distinct life-events into the dossier you already grieve. Read this before
authoring a scene drop. It is a **text/data** track — there is **no voice-recording step** (off-hours
`say[]` is index-keyed for a *future* voice pass but isn't wired to TTS), so no GPU and no hard gate.

## Table of contents
1. Where the data lives
2. `OFFHOURS` data shapes (scenes / events / say / npcEvents / interiors)
3. The multi-beat scene schema (beats, next, land/miss)
4. Venues × kinds × interiors (who the counterpart is)
5. The engine (selection, commit, the dossier write)
6. The invariants a drop MUST preserve (save-safety)
7. Token vocabulary (and the render-time campaign tokens)
8. The distinct-dossier-line rule
9. Voice + tone

---

## 1. Where the data lives

| File | Tracked? | Role |
|---|---|---|
| `js/offhours_data.js` | yes (ships) | `const OFFHOURS = {…}` — `scenes`, `events`, `say`, `npcEvents`, `interiors`, `tune`, `kinds`, `tierNames`, `fixedNpcs` |
| `js/offhours.js` | yes (ships) | runtime: `ohSceneFor`/`ohSceneEligible`/`ohSceneOpen`, `ohBeatStep`, `applyOffhoursCommit`, `ohFill`, seeding, `ohFallenName`/`ohLastMap` |
| `js/offhours_interior.js` | yes (ships) | the Sims-like dial interior (room render, occupant population, the multi-beat dial UI) |
| `js/lore.js` | yes (ships) | `dossierFileHTML` → `_ohEventLi` renders the `oh:1` service-record lines |
| `js/ui.js` | yes (ships) | the prose-menu fallback (`openVenueMenu`) for any venue without an interior |
| `js/net/commands.js` | yes (ships) | `netOffhoursCommit` — the host-authoritative commit wrapper |

Unlike the life-event track there is **no `_dev/gen` ledger / generator** — off-hours content is edited
**directly in `js/offhours_data.js`** (append-only; see §6) and proven safe by
`scripts/validate_offhours.mjs`. (A generator could be added later; not required.)

## 2. `OFFHOURS` data shapes

- **`scenes[]`** — the conversations. Each is one **single-beat** scene (legacy: top-level `open` +
  `choices`) OR a **multi-beat** scene (`beats[]`). Append-only; the array index is the save key.
- **`events[]`** — `{text}` dossier life-event lines, slot-filled at render. `ev` on a scene branch is
  an index into this array. Append-only.
- **`say[]`** — first-person reaction line, **index-aligned to `events[]`** (text-only until a future
  voice pass; keep aligned). Append-only.
- **`npcEvents[]`** — NPC-perspective line (the kin relative's POV), **sparse**, index-aligned to
  `events[]` (only kin/diner indices carry text; the rest are `null`). Stored as `4000+i`.
- **`interiors{bar,diner,club}`** — the canvas-drawn Sims rooms (presentation; see §4). Adding/altering
  these is the *interior* track, not a scene drop.
- **`tune`** — points/tiers/checks/compat constants. **`kinds`** = `['kin','friend','rival','romance',
  'mentor','confidant']`. **`tierNames`** = per-kind tier labels (0–4).

## 3. The multi-beat scene schema

```js
{ id:'venueprefix.short', venue:'bar'|'diner'|'club', kind:'confidant'|'kin'|'friend'|'rival'|'romance'|'mentor',
  with:'bartender',                                   // ONLY a bar scene that targets the fixed bartender NPC
  req:{ minTier:0..4, maxTier:0..4, gate?:'crime'|'trauma'|'dream', need?:'fallen' },
  beats:[                                             // a small conversation TREE
    { open:["entry line", …1-3 variants],            // the counterpart opens; only beat 0 needs `open`
      choices:[
        { approach:'warm'|'probing'|'blunt', gate?:'crime'|'trauma'|'dream', line:"the VET's line",
          check?:true,                                // adds a light deterministic roll → land vs miss
          land:{ reply:"counterpart response", next?:<beat idx — OMIT = terminal/scene ends>, ev?:<events index>, pts?:<int>, fl?:'ARC_UNLOCKED'|'CLOSEST', fx?:{t:'capstone'|'relief'} },
          miss?:{ reply:"if the check fails", next?:<beat idx>, pts?:0 } } ] } ] }
```

- **Flow**: beat 0 is the entry. A chosen branch's `reply` shows, then if it has `next` the conversation
  advances to that beat (its `choices` appear); a branch with **no `next`** ends the scene (terminal).
  The whole conversation commits **once** at the terminal branch via `payload.path[]`.
- **Beat-graph rules** (the validator enforces): every `next` points to a real beat index, **forward**
  (no self/back loop); every beat reachable from beat 0; at least one terminal branch; beats[0] has
  **≥1 ungated choice** (so the scene is always enterable).
- **`req.gate`** / **`choice.gate`**: only `crime`/`trauma`/`dream` actually gate (the choice/scene only
  appears if the vet's dossier has that slot). **`req.need:'fallen'`** fires the scene only when the
  player has battlefield losses (use for `{fallen}`-heavy scenes).
- **`fl`**: `ARC_UNLOCKED` is the Hades locked-heart favor (put on ONE deep T2-3 confession terminal;
  unlocks tier 4); `CLOSEST` marks the inseparable bond (tier-high only). **`fx`**: `{t:'capstone'}` is
  the dream-fulfillment payoff — **tier-4 (`maxTier:4`) scenes only**; `{t:'relief'}` is the madosis
  field-relief and may appear at any tier.
- **`approach` weights**: `warm`×1, `probing`×2 points, `blunt`×1. `pts` overrides the default
  (`scenePts × approach weight`).
- A **single-beat** scene omits `beats` and uses top-level `open` + `choices` (each choice
  `{approach,gate?,line,check?,land,miss?}`). Still valid; just not a tree.

## 4. Venues × kinds × interiors

| venue | kind | counterpart | interior occupant model |
|---|---|---|---|
| `bar` (THE LATE SHIFT) | `confidant` | **Sable Voss**, the fixed bartender (`OFFHOURS.barNpc='np:late_shift:0'`) | one fixed bartender + your vets |
| `diner` (MARISOL'S) | `kin` | the directed vet's **own relative** `nr:<vetKey>` (per-vet, deterministic) | each vet sits across from their kin at a booth |
| `club` (STATIC) | `friend`/`rival`/`romance`/`mentor` | **another veteran** (`ohUnitKey(other)`) | your vets + a cosmetic ambient crowd |

- The **kind** of a vet↔vet bond is seeded by `ohSeedClub` (star-gap → `mentor`; else `friend`/`rival`
  by compat). The interior routes a vet↔vet "talk" to `venue:'club', kind:ohKindName(bond.k)`.
- **Romance is emergent, never minted.** `ohSeedClub` never returns `romance` — so it is never the first
  conversation type. **Any vet↔vet bond drifts into romance**: on each tier-up `ohMaybeRomance` checks the
  pair's `ohRomanceSpark` (0–1, a *separate* permissive score that rewards the *same* hometown / *same* dream /
  opposite archetype — **not** gated on a shared hometown) and flips `bond.k` (`friend` / `rival` / `mentor`)
  → `romance` once the bond reaches the chemistry-set tier (`ohRomanceSpeed`: strong spark couples at tier 1,
  faint is a slow burn at tier 2–3, only `< romanceFloor` stays platonic — ≈5% of pairs). Friends fall for
  each other, rivals can't quit each other, a mentor bond deepens — so the player can couple almost any two.
  The bond's `seen[]`/tier/points are untouched (romance scenes have their own indices), so it's a clean kind
  flip — host-authoritative, deterministic, save-safe. Tuning lives in `tune.compat`
  (`romancePull/Floor/Warm/Fast/Tier`); full table in `docs/hub-offhours-tuning.md`. **Authoring implication:**
  write `kind:'romance'` scenes for the *courtship after* the drift (the early ones at `minTier:0–1` are
  "a spark" / first flirt); do **not** author a romance scene that assumes it is a *first* meeting — by the
  time `romance` scenes show, the pair already had a history.
- **No Founder/avatar** — every line is the veteran or the counterpart. (Same canon rule as the rest of
  the lore system.)
- **Interiors** are presentation only — `OFFHOURS.interiors[venue]` (canvas-drawn rooms; routing is
  automatic via `openInterior`). Authoring a *scene* never requires touching interiors.

## 5. The engine (what a commit does)

- **`ohSceneFor(venue,kind,vet,bond)`** — returns one **eligible, unseen** scene; when several are
  eligible it picks **deterministically** (stable within a hub visit, rotating across visits). So at a
  given tier there should be **≥2 eligible scenes** or the same opener repeats (a content smell).
- **`ohBeatStep`** — the shared, deterministic resolver the UI uses to navigate and the host uses to
  re-derive the path (so they always agree). No `Math.random`.
- **`applyOffhoursCommit(state, {vetKey,npcId,sceneIdx,path})`** — host-authoritative: charges
  `sceneCost` **once**, sums `pts`, marks `seen[]` **once**, applies `fl`/`fx`, and writes the dossier
  line from the path's `ev` (the **last** branch on the path carrying an `ev`). Deduped by `(ev,npc)`.
- **Dossier write**: pushes `{lvl, i:<ev>, oh:1, npc}` to `vet.lore.events` (and mirrors to the other
  vet for vet↔vet). Rendered by `_ohEventLi` (js/lore.js): `OFFHOURS.events[i].text` → `d.fill` →
  `{npc}/{them}` → `{fallen}/{lastmap}` (see §7), tagged by the counterpart name (or venue fallback).

## 6. Invariants a drop MUST preserve (save-safety)

The validator (`scripts/validate_offhours.mjs`) enforces these against git HEAD:

1. **APPEND-ONLY**:
   - `scenes[]` — HEAD's scene **ids, in order, are an unchanged prefix** of the working scenes (never
     insert/reorder/delete in the middle; append new scenes at the end). A bond's `seen[]` stores the
     scene **index**. Scene *content* MAY change (rewording a reply, or **repointing a scene's `ev`** —
     that only affects future writes; old saved `lore.events` keep their resolved `i`).
   - `events[]` / `say[]` — HEAD entries are a **byte-identical prefix** (saved memories reference them
     by index; changing existing text changes how old saves render — don't). Append new at the end.
   - `npcEvents[]` — HEAD's entries are an unchanged prefix; the array may grow (sparse `null` + text).
2. **ALIGNMENT**: `events.length === say.length`. Every non-null `npcEvents` index is within
   `events` range (and corresponds to a kin/diner outcome). New events ⇒ new `say` in lock-step.
3. **BEAT-GRAPH** valid (§3). **GATES** ∈ {crime,trauma,dream}; `req.need` ∈ {fallen}. **`ev`** is a
   valid `events` index. **`fx`** capstone/relief only in `maxTier:4` scenes.
4. **TOKEN safety** (§7) — no leaked/unknown tokens; clause-tokens embedded; no literal names.
5. **No versioning needed** for scene `ev` repointing (it's a forward-only pointer; `ohMarkSeen` tracks
   the SCENE index, `lore.events` stores the EVENT index — independent). `OFFHOURS.versions` exists
   (mirrors the lore version table) but is empty during development.

## 7. Token vocabulary

Resolved for an event/scene line via the **dossier** `d.fill` + `{npc}/{them}` + (events only) the
render-time campaign tokens:

- **Nouns, always safe**: `{me}` (the directed vet's first name), `{them}` (the OTHER vet — club only),
  `{npc}` (the NPC counterpart — bartender/kin), `{home}`, `{rel}`, `{relName}`.
- **Clause tokens — MUST be embedded** in a sentence (they expand to a full backstory clause, never a
  bare noun): `{dream}`, `{trauma}`, `{crime}`, `{family}`. Use a clause token only on a line whose
  **gate matches** (a `{crime}` line on a `gate:'crime'` choice). `{family}` is the trap — it expands
  to a whole sentence, so "runs in the {family}" garbles; write a literal noun instead.
- **Campaign tokens — events only, resolved at render** (`_ohEventLi`): `{fallen}` → a **deceased
  comrade's first name** (`ohFallenName`, deterministic per vet); `{lastmap}` → a neutral **"the last
  drop"** (it isn't stored per memory, so it won't name a specific mission). Both are safe in `events[]`
  text; reserve `{fallen}` for outcomes that have it (`req.need:'fallen'` scenes).
- **NEVER** write a literal proper name (use `{me}`/`{them}`/`{npc}`). **Venue names** in prose:
  bar = *the Late Shift*, diner = *Marisol's*, club = *Static*.

## 8. The distinct-dossier-line rule

Each scene-outcome should leave its **own** memory: give every ev-bearing terminal branch its **own
`ev` index** (one per distinct outcome). **Sharing an `ev` across scenes** makes different nights with
the same person render the identical service-record line — the validator flags it. The `(i,npc)` dedup
in `applyOffhoursCommit`/`dossierFileHTML` is only a safety net; the fix is distinct indices. So a scene
drop usually appends **one new `events`/`say` entry per scene-outcome** (and `npcEvents` for kin) and
points the terminals at them.

## 9. Voice + tone

The terse, past-tense, dark-cyberpunk war-vet register — see `lore-tone-guide.md`. Scene `reply`s are
spoken-in-the-moment; `events[]` lines are the lasting *memory* (past tense, no "I", concrete image +
emotional undercut, never melodramatic); `say[]` is the gut reaction (5–10 words). Off-hours `say[]`
stays text-only for now but is index-keyed so a future voice pass can record it without re-aligning.
