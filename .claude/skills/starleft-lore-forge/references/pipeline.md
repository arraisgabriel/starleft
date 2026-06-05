# Pipeline & TTS reference

Every command a content drop runs, in order, what each does, and the local Qwen3-TTS prerequisites
the voice step depends on. Run everything from the STARLEFT repo root.

## The scripts

Dev-time generators live under the **gitignored** `_dev/gen/` (local tools the user already has).
The skill's own helpers are under the tracked `.claude/skills/starleft-lore-forge/scripts/`.

| Step | Command | Writes | Reversible? |
|---|---|---|---|
| author | edit `_dev/gen/lore_additions.mjs` (append a block) | the ledger | yes |
| lore data | `node _dev/gen/gen_lore.mjs` | `js/lore_data.js` (events + pools + `versions`) | yes |
| dialog data | `node _dev/gen/build_dialog_data.mjs` | `js/dialog_data.js` (`LORE_SAY`/barks/hero) | yes |
| manifests | `node _dev/gen/build_voice_manifests.mjs` | `_dev/gen/voice_manifest_*.json` (full) | yes |
| filter | `node .claude/skills/starleft-lore-forge/scripts/filter_new_clips.mjs` | `_dev/gen/*_new.json` (only-new) | yes |
| validate | `node .claude/skills/starleft-lore-forge/scripts/validate_lore_append.mjs` | — (checks, exit 1 on fail) | — |
| **GATE** | — present summary, get explicit approval — | — | — |
| record | `bash _dev/gen/gen_voices.sh new` | `assets/audio/voice/{lore,barks}/*.mp3` | overwrites files |
| verify | `node .claude/skills/starleft-lore-forge/scripts/verify_clips.mjs` | — (checks) | — |

Everything above the GATE is text/JSON only and fully reversible (revert the block, re-run
`gen_lore.mjs` + `build_dialog_data.mjs`). `gen_lore.mjs` aborts before writing if the result isn't
append-only vs git HEAD, so a green run is already safe.

## What `gen_voices.sh new` does

The incremental mode renders ONLY the `*_new.json` manifests (built by `filter_new_clips.mjs`) and
never re-records existing clips:

1. `source $TZ/local-tts/.venv/bin/activate` + `python …/tts/scripts/preflight.py`
2. `tts_generate.py --batch voice_manifest_lore_new.json` (preset career voices) and
   `--batch voice_manifest_barks_new.json` (preset bark speakers) — CustomVoice model, one load.
3. `clone_voice.py --name <V> --batch voice_manifest_clone_<V>_{lore,barks}_new.json` per clone
   voice (e.g. `Brad_Pitt` → committed as `cast1`, for Nino) — Base model.
4. `ffmpeg -ac 1 -b:a 56k` transcodes each 24 kHz WAV → 56 kbps mono mp3 into
   `assets/audio/voice/{lore,barks}/`.

New variable-free lore lines are rendered across **all** career voices, so any unit type can speak
them — that's the "for all units" coverage. Other `gen_voices.sh` modes are unchanged:
`full` (everything), `crawl` (map intro narration — mapmaker territory), `clone`, `smoke`.

## Local Qwen3-TTS (twilightZone) prerequisites

Voice generation reuses the twilightZone project's local, offline TTS. `gen_voices.sh` expects:

- **`TZ_ROOT=/Users/gabriel.bussular/Workspace/twilightZone`** with:
  - venv: `local-tts/.venv` (mlx-audio pinned; Python 3.11+)
  - models: `models/Qwen3-TTS-12Hz-1.7B-{CustomVoice,Base}-8bit` (~6 GB)
  - clone voices enrolled in `local-tts/voices/registry.json` (e.g. `rod`, `Brad_Pitt`)
  - skills: `.claude/skills/tts/scripts/tts_generate.py`, `voice-clone/scripts/clone_voice.py`,
    and the `preflight.py` checks
- **Apple Silicon** (MLX is Mac-only) + **`ffmpeg`** (`brew install ffmpeg`).

If the preflight fails (wrong machine, venv/models absent), surface the error and offer to retry —
do not fabricate audio. The game degrades gracefully (a missing clip is a silent no-op), so shipping
the text now and recording later is a valid fallback if the TTS host isn't available.

### Voice catalog (already assigned — do not reassign)

CustomVoice presets: Ryan, Aiden, Serena, Vivian (EN); Uncle_Fu, Dylan, Eric (ZH); Ono_Anna (JA);
Sohee (KO). Clones (Base model): `rod` (crawl narrator), `Brad_Pitt`→`cast1` (Nino). The
unit→voice mapping is `_dev/gen/voice_map.mjs` (mirror `js/voice.js`). `CAREER_VOICES` (7) =
the distinct voices life-event lines render in.

## Sizing the render (for the Phase-5 gate)

`validate`/`filter` print the exact new-clip count:
- new variable-free lore lines **× 7 career voices**, plus new barks (1 each, in their speaker's voice).

Time, on an M-series Mac: each batch pays a model load (~5–10 s) once, plus a one-time ~60 s Metal
JIT warmup on the first generation; thereafter a few seconds per clip. So ~`(2 model loads + ~60 s
warmup) + N × ~few s`. A ~25-line drop (≈ 25×7 ≈ 175 lore clips + a handful of barks) is on the order
of a few minutes to ~15 minutes depending on line length and hardware. Quote a range, not a promise.

## Manual in-game verification (Phase 7)

```bash
python3 -m http.server 8000     # then open http://localhost:8000/rts.html
```
- Spawn/level a career unit (e.g. console `mkUnit(G,'soldier','player',tx,ty); refreshUI();`, then
  grant XP / play it past level 2–3) — confirm new events appear in the dossier and the new lore
  lines play in the unit's assigned voice.
- Select units / a hero — confirm new barks play.
- Load a **pre-update save** — the veteran's name + backstory must be unchanged (version freeze), and
  new events only show up at *future* level-ups, never rewriting logged ones.
