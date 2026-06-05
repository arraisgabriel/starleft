# Lore data schema & contracts

The authoritative shapes for everything the lore/life-event system reads, and the invariants a
content drop must preserve. Read this before authoring a block.

## Table of contents
1. Where the data lives
2. `LORE_DATA` (js/lore_data.js) — pools, events, paras, versions
3. Event object schema + slot vocabulary
4. `dialog_data.js` — `LORE_SAY`, `SELECT_LINES`, `HERO_SELECT_LINES`, fallback
5. Per-unit storage (`u.lore`) + how a dossier/event is built at runtime
6. The voice map & clip-id naming
7. The append-only + version-gate contracts (the rules the validator enforces)
8. The `ADD_BLOCKS` ledger shape

---

## 1. Where the data lives

| File | Tracked? | Role |
|---|---|---|
| `js/lore_data.js` | yes (ships) | `const LORE_DATA = {…}` — all static pools + 485 events + prose + `versions` |
| `js/dialog_data.js` | yes (ships) | `SELECT_LINES`, `HERO_SELECT_LINES`, `LORE_SAY`, `LORE_SAY_FALLBACK` |
| `js/lore.js` | yes (ships) | runtime: `ensureDossier`, `buildDossier`, `rollLifeEvent`, version-gating |
| `js/voice.js` | yes (ships) | `VOICE.playBark/playLore`, `SPEAKER_VOICE` (mirror of voice_map) |
| `assets/audio/voice/{barks,lore}/*.mp3` | yes (ships) | the rendered clips, named by index |
| `_dev/gen/gen_lore.mjs` | **gitignored** | builds `lore_data.js` from the base pools + the ledger |
| `_dev/gen/build_dialog_data.mjs` | **gitignored** | builds `dialog_data.js` from `dialog_content.raw.json` + the ledger |
| `_dev/gen/lore_additions.mjs` | **gitignored** | `ADD_BLOCKS` — the append-only content ledger you write to |
| `_dev/gen/voice_map.mjs` | **gitignored** | `SPEAKERS`, `CAREER_VOICES`, `CLONE_VOICES`, `VOICE_LABEL` |
| `_dev/gen/build_voice_manifests.mjs`, `gen_voices.sh` | **gitignored** | TTS manifest builder + render driver |

The `_dev/gen/*` scripts are local dev tools (the whole `_dev/` tree is gitignored). What ships is
the generated `js/*` data and the `assets/audio/voice/*` mp3s. The skill's own helper scripts live
under the tracked `.claude/skills/starleft-lore-forge/scripts/`.

---

## 2. `LORE_DATA`

```
LORE_DATA = {
  firstNames: string[],   // generic relative-name pool ({relName}); any gender
  namesM:     string[],   // unit first-name pools, gender-matched to the unit's VOICE gender
  namesF:     string[],
  namesX:     string[],   // unisex; valid for either gender (male pool = namesM+namesX, etc.)
  surnames:   string[],
  hometowns:  string[],   // dark-cyberpunk place names, mostly written with a leading "the "
  family:     { rel:string, text:string }[],   // text uses {me}{home}{rel}{relName}
  traumas:    string[],   // NOUN phrases, slots {me}/{home}/{relName}
  dreams:     string[],   // NOUN phrases (the thing wanted), e.g. "a grave somewhere with actual trees"
  crimes:     string[],   // descriptions; only surfaced for units that rolled a crime (45% chance)
  events:     Event[],    // the life-event pool (APPEND-ONLY; indices are referenced by saves+audio)
  paras:      { origin,family,trauma,dream,crime,assessment: string[] },  // dossier prose (NOT grown here)
  versions:   PoolLens[],  // per content-version background-pool lengths (see §7)
}
```

`PoolLens` = `{ firstNames, namesM, namesF, namesX, surnames, hometowns, family, traumas, dreams, crimes: number }`.
`versions[0]` is v1 (the launch/base lengths); each content drop that touches the ledger appends a row.

Current launch counts (v1): events 485 (family 112 / trauma 72 / dream 72 / crime 57 / any 172);
firstNames 80, namesM 28, namesF 33, namesX 19, surnames 74, hometowns 51, family 30, traumas 25,
dreams 24, crimes 20.

---

## 3. Event object

```js
{
  req:  'family' | 'trauma' | 'dream' | 'crime' | 'any',   // which aspect it connects to ('any' = generic)
  tone: 'neg' | 'pos' | 'neutral',                          // emotional valence (drives fallback bucket + UI accent)
  text: "<one sentence, slots filled at runtime>",
  fx?:  { t:'buff', dmg?:number, regen?:number, dur?:number }   // temporary multipliers (dur seconds, default 25)
      | { t:'heal' }                                            // full heal
      | { t:'fine', gold:number }                               // deduct gold (player only)
      | { t:'capstone', dmg?:number, regen?:number, dur?:number }, // like buff + marks dream fulfilled
  min?: number,   // minimum unit level the event may roll at (use for rare capstones, e.g. 15/18)
}
```

**Slot vocabulary** (the only legal `{…}` in event/family/trauma/dream/crime text):
`{me}` first name · `{full}` full name · `{home}` hometown · `{rel}` relation noun (sister/…) ·
`{relName}` relative's name · `{dream}` the resolved dream phrase · `{trauma}` the resolved trauma ·
`{crime}` the resolved crime — **only valid in events with `req:'crime'`** (a unit without a crime
falls back to "an old mistake"). Unknown slots, or `{crime}` outside a crime event, fail validation.

`req:'crime'` events only roll for the ~45% of units that have a crime; weight your mix accordingly.
Events with `req !== 'any'` are "aspect-connected" and are favored 70% of the time by the roller, so
they're what make the system feel personal — prefer them over generic `any` unless adding texture.

---

## 4. `dialog_data.js`

- `SELECT_LINES[type]: string[]` — 25 "unit selected" barks per unit type (random-picked at select).
- `HERO_SELECT_LINES[heroId]: string[]` — 25 bespoke barks per named hero (Nino, Biba).
- `LORE_SAY[i]: string|null` — first-person reaction to `LORE_DATA.events[i]`, **index-aligned and
  append-only**. `null` → runtime uses `LORE_SAY_FALLBACK[req][tone]`. A line containing a forbidden
  slot (`{me}`/`{trauma}`/`{dream}`/`{crime}`) is dropped to `null` by the builder's safety pass.
- `LORE_SAY_FALLBACK[aspect][tone]: string[]` — the never-mute safety net.

**Voicing rule:** a `say` line earns a pre-rendered clip only if it is non-null **and variable-free**
(no `{ }`). Templated/null lines stay text-only. So write `say` lines without slots when you want
them voiced. `LORE_SAY.length` is kept equal to `events.length` (one say — possibly `null` — per
event).

---

## 5. Per-unit storage & runtime build

```js
u.lore = { seed:<uint32>, events:[{lvl, i}], v:<int>, fixed?:<heroSpec> }
```
- `seed` minted once at level 2 (`ensureDossier`), frozen, saved. Mixes `G.runSalt` so fresh recruits
  differ each game; carried veterans keep their seed.
- `v` = the content-version stamped **at mint** → freezes which background-pool lengths this unit
  draws from. Missing `v` (legacy save) is read as v1.
- `events` = the append-only log; each `{lvl,i}` replays the same event text by index on load.
- `fixed` = a hand-authored hero dossier (bypasses the seed/pools entirely).

`buildDossier(u)` (pure, memoized by `seed|gender|v`) draws, in a fixed order, exactly one rng step
per field: name → surname → hometown → family → relName → trauma → dream → crime-gate(→crime) →
6 paras. Version-gating caps each draw to `versions[v-1]` lengths, so adding entries never disturbs an
existing seed's draws. `rollLifeEvent(u, level)` draws an unused event index (aspect-biased), pushes
`{lvl,i}`, and returns `{text, fx, tone, say, sayIdx}`; `sayIdx` is non-null only for a variable-free
`LORE_SAY[i]` (→ a voice clip plays).

---

## 6. Voice map & clip ids

From `_dev/gen/voice_map.mjs` (mirrored in `js/voice.js` `SPEAKER_VOICE` — keep in sync):

```
worker→Ryan  soldier→Aiden  ranger→Eric  recruiter→Sohee  hustler→Dylan  lobbyist→Uncle_Fu
foodtruck→Sohee  auditor→Ono_Anna  founder→Uncle_Fu  courier→Serena  bomber→Dylan
Nino→Brad_Pitt(label cast1, CLONE)  Biba→Vivian
CAREER_VOICES = [Aiden, Eric, Dylan, Uncle_Fu, Sohee, Ono_Anna, Brad_Pitt]   // 7 distinct → lore lines render once per voice
CLONE_VOICES  = [Brad_Pitt]   VOICE_LABEL = { Brad_Pitt: 'cast1' }   LORE_EMOTION = 'reflective, quiet, first-person inner monologue'
```

Clip filenames (built by `assets.js` `barkPath`/`lorePath`):
- bark: `assets/audio/voice/barks/<speakerKey>_<NN>.mp3` (2-digit index; `<speakerKey>` = unit type or heroId)
- lore: `assets/audio/voice/lore/<voice>_<NNN>.mp3` (3-digit event index; `<voice>` = a career voice or `cast1`)

So one new variable-free lore line costs **× len(CAREER_VOICES) = 7 clips** (6 preset + 1 clone);
one new bark costs 1 clip in that speaker's voice.

---

## 7. Contracts the validator enforces

1. **Append-only vs git HEAD**: HEAD's `events`, each background pool, `LORE_SAY`, and `versions` are
   an unchanged **prefix** of the regenerated arrays. Nothing reordered/renamed/deleted.
2. **Alignment**: `LORE_SAY.length === events.length`.
3. **Legality**: every event has a valid `req`/`tone`, slots are in the allowed set, `{crime}` only in
   `req:'crime'`; no duplicate event `text`.
4. **Versions**: rows are non-decreasing per pool, and the last row equals the live pool lengths.
5. **Identity freeze**: for sampled seeds, HEAD's `lore.js`+data and the working `lore.js`+data yield
   byte-identical dossiers for a v1/legacy unit.
6. **Coverage report**: counts new variable-free lore lines × career voices + new barks, cross-checked
   against the `*_new.json` manifests.

`gen_lore.mjs` independently re-checks (1) at generation time and aborts before writing.

---

## 8. The `ADD_BLOCKS` ledger

`_dev/gen/lore_additions.mjs` exports `ADD_BLOCKS` — an array of content drops applied, in order,
after the frozen base. Append a NEW block per drop; never edit an existing one. Shape:

```js
{
  note: 'short label + date',
  backgrounds: {                 // optional; each array appended to the matching pool, bumps the version
    firstNames:[], namesM:[], namesF:[], namesX:[], surnames:[], hometowns:[],
    family:[ {rel:'sister', text:"{me} … {relName} … {home}."} ], traumas:[], dreams:[], crimes:[],
  },
  events: [ { req, tone, text, fx?, min?, say? } ],   // appended to events; say → LORE_SAY[that index]
  barks:  { soldier:[…], worker:[…] },               // appended to SELECT_LINES[type]
  heroLines: { Nino:[…], Biba:[…] },                 // appended to HERO_SELECT_LINES[id]
}
```

`gen_lore.mjs` consumes `backgrounds` + `events` (+ emits `versions`); `build_dialog_data.mjs`
consumes `events[].say` + `barks` + `heroLines`. Both iterate `ADD_BLOCKS` and each block's `events`
in array order, which is what keeps `events` and `LORE_SAY` index-aligned.
