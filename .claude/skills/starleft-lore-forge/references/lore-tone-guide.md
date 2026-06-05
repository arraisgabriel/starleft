# Lore tone & authoring guide

How to write life events, backstory elements, barks, and `say` lines that match the shipped voice
and actually deepen the player–unit bond. Read alongside `data-schema.md` (shapes/slots) before
Phase 2.

## The voice

STARLEFT is **dark cyberpunk-corporate satire** — Hades-bleak, never bright. Soldiers are "assets"
and "line items" to a megacorp that prices their hope, grief, and debt into the next contract. The
register is terse, dry, gallows-humored, human under the grime. Avoid heroic bombast, quippy Marvel
banter, fantasy diction, and anything wholesome-without-a-catch. When in doubt, read the existing
pools in `js/lore_data.js` (the `authored` events, `traumas`, `dreams`, `crimes`, `paras`) and the
existing `LORE_SAY` lines in `js/dialog_data.js` and match their cadence.

Touchstones from the shipped set:
- trauma: *"the face of the first person {me} was ordered to erase"*
- dream: *"a noodle bar where nobody carries a weapon"*, *"a grave somewhere with actual trees"*
- crime: *"fragging an officer and calling it enemy fire"*
- event: *"{me} is handed a commendation and trades the medal for medical supplies."*
- assessment prose: *"Reclassify from 'expendable' to 'load-bearing,' adjust hazard pay downward, and tell {me} neither thing."*

## Life events — the core craft

An event is one sentence of `text` that reads as a beat in this unit's life, plus a short `say`
(their spoken reaction). The whole point is **connection**: an event tagged `family`/`trauma`/
`dream`/`crime` must actually invoke that aspect through its slots, so it lands as *this* veteran's
story, not generic flavor.

- **Connect via slots.** `family` → use `{relName}`/`{rel}`/`{home}`. `trauma` → use `{trauma}`.
  `dream` → use `{dream}`. `crime` → use `{crime}` (only here). `any` → generic; use sparingly, for
  texture (commendations, quiet nights, attrition), not as the bulk.
- **One sentence, present-ish tense, third person using the name.** Text is pronoun-free for the unit
  (it uses `{me}` = first name) so it reads for any gender. Keep it concrete and physical.
- **Tone matches content.** `neg` (loss, threat, freezing up), `pos` (a debt cleared, a line held,
  forgiveness), `neutral` (rituals, grim admin, gallows jokes). Tone also picks the fallback `say`
  bucket and the dialog accent color.
- **Mind the slot grammar.** `{dream}` is a NOUN phrase, so it slots after a verb/preposition
  cleanly: *"the math finally bends toward {dream}."* `{trauma}` is also a noun phrase: *"it's
  {trauma} all over again."* `{crime}` reads as a deed: *"the truth about {crime} is one subpoena
  away."*

**Mix.** The shipped pool skews family (largest), then `any`, then trauma/dream/crime. Unless the
user asks otherwise, keep new events roughly proportional so rolls stay balanced — and remember
`crime` events only reach the ~45% of units that rolled a crime, and aspect-connected events
(`req != 'any'`) are favored 70% of the time, so they carry the experience.

### `fx` — keep it light and earned

Most events carry no `fx`; a minority give a small, temporary nudge that *fits the fiction*:
- `{t:'buff', dmg:1.2, dur:25}` — a surge of resolve (a dream nears, a squad held). `dmg`/`regen` are
  multipliers; `>1` helps, `<1` is a penalty (freezing up under trauma: `dmg:0.85`). `dur` seconds.
- `{t:'heal'}` — a moment of grace patches them up (good news from home).
- `{t:'fine', gold:45}` — a cost lands on the player (a collector visits, a bounty posts).
- `{t:'capstone', dmg:1.5, regen:3, dur:30}` + `min:15` — a rare late-game dream-fulfilled beat;
  marks `dreamDone`. Use 1–2 per drop at most.

Don't power-creep: these are flavor, not a balance lever. Match the sign of the effect to the tone.

## `say` lines — what gets voiced

`say` is the unit's spoken, in-the-moment reaction shown in the gold dialog bubble. To **earn a voice
clip in every career voice**, write it:
- **variable-free** (no `{ }` at all) — a templated line stays text-only;
- **short** — aim ≤ ~48 chars / a clean two lines, like the shipped `LORE_SAY` (avg ~35 chars);
- **first person, in-register** — a clipped, dry inner-monologue beat, delivered "reflective, quiet"
  (`LORE_EMOTION`). It should make sense as a reaction to the event without repeating its text.

Examples (event → say): *family/pos* "Rent's covered. That's something." · *dream/neutral* "The math
almost works now." · *any/neg* "Lucky me. Volunteered again." · *trauma/neg* "I froze. Just for a
second." If a line truly needs a slot, that's fine — leave it slotted and it falls back to the
tone+aspect bucket (still on-screen, just unvoiced).

## Background elements

- **traumas / dreams** — noun phrases (see `data-schema.md` §3), slots `{me}/{home}/{relName}` only.
  Dreams are things *wanted* (so they read after "I want…"/"saving for…"); traumas are wounds carried.
- **crimes** — morally grey deeds the company can use as leverage; deed phrases.
- **family** — `{rel, text}`; `rel` is the relation noun the entry introduces (sister/brother/mother/
  father/daughter/son/grandmother/grandfather/uncle/cousin/partner), `text` a 1-sentence fragment
  using `{me}/{home}/{rel}/{relName}`.
- **names** — `namesM`/`namesF`/`namesX` must read as the right gender for the unit's VOICE (so name,
  voice, and story stay consistent); `firstNames` is the any-gender relative pool; `surnames` plain.
  `hometowns` are dystopian places, usually written with a leading "the " where natural.

Growing any of these auto-bumps the version and **freezes existing veterans** — only new recruits see
them. So you can add freely without rewriting anyone's identity.

## Barks & hero lines

- **`barks[type]`** — 1-line "unit selected" quips in that unit's character (worker = weary deadpan;
  soldier = hyped; ranger = smug; recruiter = saccharine HR; auditor = cold monotone; etc. — see the
  emotions in `_dev/gen/voice_map.mjs`). Keep them snappy and on-archetype.
- **`heroLines[Nino|Biba]`** — bespoke one-liners (≤ ~52 chars so they fit the box cleanly). Nino is a
  gravelly, world-weary statesman (clone voice); Biba is warm, determined, maternal.

Barks are random-picked and never persisted, so they only need to be appended (so existing recordings
stay valid). Each new bark records one clip in the speaker's assigned voice + emotion.

## Anti-patterns

- Heroic/quippy/fantasy tone, or wholesome-with-no-edge.
- Generic `any` events when an aspect-connected one would land harder.
- `{crime}` outside a `crime` event, or invented slots — both fail validation.
- Long or slotted `say` lines when you wanted them voiced.
- Editing existing entries to "improve" them — that breaks the append-only contract; add new ones.
