# Episode VII ending — "The Flash" (nuke + Nino at the H.U.B.)

Episode VII (`MAPS[6]`, "The Dunes and the Drifts" / THE CONGLOMERATE) has an exclusive ending that
realizes the canonical *flash* beat (see `docs/world-bible.md` §2): after the player wins and launches
extraction, the Buzzword Bomber reaches the HQ roof — and instead of flying out, a nuke detonates and
consumes the whole map (including the bomber). The entire roster dies and is written to the memorial;
nobody carries forward. The player is dropped into the H.U.B. with the returning **Nino** spawned and
the camera framed on him, and a mandatory, voiced, multi-line monologue plays (he came back to fix
things and save the fallen — a subtle resurrection hint, no GRAAL mention yet).

## Flow (solo only — extraction is solo-only; co-op host gets the gameplay aftermath without the cinematic)
`checkWinLose` → `beginExtractionPhase` → player garrisons a Lv2+ unit in an Open-Plan HQ and presses
**Extraction** → `hubStartExtractFlight` → bomber `'in'` → `'hover'` (on the roof). On Ep VII the seam
(`updateExtraction`, `js/hub.js`) branches `'hover'` → a new **`'nuke'`** phase instead of `'out'`:
- the FX (`js/nuke_finale.js` `drawNukeFinale`, drawn from `render.js`) runs on a fixed timeline driven
  by `extractFlight.t` (synced to the music, which starts at the bomb drop): **0→10s** a big bomb falls to
  the crash site (map intact); **10s** impact — explosion bloom + ground shockwave + debris; **10→28s** a
  large, dense charcoal mushroom cloud rises & inflates to ~`NUKE_CAP_W_FRAC` (≈44%) of the screen width
  **while the white flash AND the camera-shake grow with it** over 18s, all peaking at full white at **28s**;
  **28s** (≈28s into the cinematic/music) the **STARLEFT neon logo** (red, ~70% of viewport width, centred,
  'Glitch Goblin' font) fades in over the full-white screen and **stays rendered**; **28→38s** the white
  holds (10s) with the logo; **38s** the white fades out (`NUKE_WHITE_FADE`) to *invisibly*-revealed
  **extraction panorama** (hub-city skyline + ULTRA tower + drifting drones + neon, **without** the Buzzword
  Bomber, via `drawHubLoadingScene(state, {noBomber:true})`) — the logo stays over it; **38→67s** the
  panorama+logo scene holds while the music plays; at **67s** the music **stops**; **67→73s** a resounding
  echo rings out (`NUKE_T_ECHO_TAIL`=6s) over the still-shown panorama+logo; **73s** → the hub. `NUKE_DURATION`
  = 67s (music end); the hub follows after the echo, at 67+6 = **73s**. Screen-shake (in `hub.js`) is nothing
  during the fall, then a **big, slow, heavy rumble that builds from impact to a violent peak over the full
  18s** to the white-out (amp 42, low frequencies). **The base, buildings and units STAY on the map** through
  the blast (just shaken, then whited out) — they are memorialized but never erased on screen. Pointer input
  is blocked for the whole cinematic. Tunables at the top of `js/nuke_finale.js`: `NUKE_T_IMPACT` /
  `NUKE_T_ANIM_END` / `NUKE_T_TITLE_IN` / `NUKE_T_WHITE_FADE_START` / `NUKE_WHITE_FADE` / `NUKE_T_PANO_END` /
  `NUKE_T_ECHO_TAIL` / `NUKE_CAP_W_FRAC` (+ the smoke palette `SMOKE`); shake amplitude/frequency is in `js/hub.js`.
- **Distant horizon nukes:** during the panorama, **two small, far nukes** burst on the horizon over the bay
  (centre third of the image), reusing the Ep VII bomb→explosion→mushroom structure at tiny scale
  (`drawDistantNukes`/`drawDistantNuke`/`drawDistantMushroom` in `js/nuke_finale.js`, anchored to the
  panorama via `hubPanoMetrics` image-fractions `DIST_PTS`, clipped to the image). They run **one at a
  time**: starting at `NUKE_T_DISTANT_START`=41 (once the white has faded), bomb #1 falls for
  `NUKE_DISTANT_FALL`=10s → bursts at 51; bomb #2 starts falling when #1 bursts → bursts at 61; both lit
  grey-tan mushroom clouds (lit by their fireball, so they read against the night sky) then linger to the
  hub at 73. Size is `NUKE_DISTANT_SCALE` (≈6% of screen height).
- **Music:** the Gorillaz track `assets/audio/music/gorillaz-the-sad-god.mp3` (`MUSIC_FLASH`) is cued via
  `MUSIC.playCinematic()` the instant the bomb starts dropping (nuke-phase start). Over its **last 6s**
  (61→67, `MUSIC.cinematicEcho(t01)` ramped from `hub.js`) a Web-Audio feedback-delay echo **intensifies**;
  at **67s** `MUSIC.stopCinematic()` stops the source and bumps the feedback so the echo **resounds** for
  `NUKE_T_ECHO_TAIL`=6s (67→73), then the graph is torn down. The scene cuts to the hub only AFTER the echo
  ends. (`stopCinematic` is idempotent — `enterHubFlashAftermath` calls it again at 73 as a no-op.) Respects
  the music mute toggle/volume; independent of the menu-only theme (already paused during gameplay).
- **Lyric subtitles:** a neon-red song subtitle at the bottom, synced to the music (`drawLyricSubtitle` in
  `js/nuke_finale.js`, shown `NUKE_T_LYRICS_START`=28s — when the singer starts — through the music end at
  67s). The song text is **never stored in code** — `js/lyrics.js` (`LYRICS.load`) fetches it from
  `assets/scenes/hub/sad_god_lyrics.*` at runtime and renders the current line by timestamp. For **true
  per-line sync**, provide `assets/scenes/hub/sad_god_lyrics.lrc` in standard karaoke format
  (`[mm:ss.xx] line`; a timestamp with no text clears the line for instrumental gaps). With only the plain
  `.md`, timing falls back to a length-weighted spread across 28→67s — **approximate** (lines will race,
  since the full song is longer than the 67s cut); the `.lrc` is how you make it match the singer exactly.
  Served over http(s) so `fetch` works (on `file://` there are simply no subtitles).
- **detonation** (t≥`NUKE_T_IMPACT`=10s, the impact moment): `epSevenFlashAftermath()` memorializes
  every dossier'd player veteran (`recordFallen`) and empties `CAMPAIGN.roster` + the carryover — but the
  **entities are NOT killed** (the base stays on the map; the flash takes them off-screen, not off the board).
- at the end (t≥73s, i.e. `NUKE_DURATION`+`NUKE_T_ECHO_TAIL`) → `enterHubFlashAftermath()`: grant the normal
  mission reward (meta M3rit$ survives), enter the H.U.B. (`mapIndex` → Ep VIII), spawn Nino (Lv 11), and
  `startFlashCutscene()` with `NINO_FLASH_LINES` — which holds on Nino for `CUT_START_DELAY`=2s before his first line.

The mandatory monologue (`js/cutscene.js`): the camera eases onto Nino at the **maximum zoom** (`ZOOM_MAX`),
holds `CUT_START_DELAY`=2s, then each line shows the `#cutsceneCaption` lower-third + plays the voice clip
(`VOICE.playScene`, `assets/audio/voice/scene/nino_flash_NN.mp3`, Nino's `cast1` clone) at **`SCENE_RATE`=0.90×
(10% slower, pitch-preserved)**; the caption advances when the (slowed) clip ends, so the subtitles stay in
sync. A click or the clip ending advances; input is gated until the last line, then the HUD is restored.
Ep VIII re-introduces Nino via its own `heroes:[]`, so the hub Nino is a cutscene actor.

## Dev trigger (console, solo session served over http)
```js
// jump into Episode VII and watch the whole sequence
startGame(); loadMap(6); mapIndex = 6;
const hq = G.entities.find(e=>e.owner==='player'&&e.type==='hq'&&!e.dead);
// optional: spawn a few veterans so the memorial fills with named dead
for(let i=0;i<3;i++){ const u=mkUnit(G,'soldier','player',hq.tx+2+i,hq.ty+2); u.stars=5; u.xp=CAREER.xpFor(5); ensureDossier(u); }
beginExtractionPhase(G); hubStartExtractFlight(G, hq);
// (impatient? skip the fly-in:)  const f=G.extractFlight; f.phase='hover'; f.t=2; f.x=f.hqX; f.y=f.hqY;
```
Watch: bomber → roof → **flash/shockwave/mushroom + shake** → fade → H.U.B. with Nino, camera zooming
in, and his six-line monologue (voiced). Open the roster afterward — the squad is under **The Fallen**,
`CAMPAIGN.roster` is empty, and the reward toast shows the M3rit$ gain.

## Files
`js/hub.js` (seam + `epSevenFlashAftermath`/`enterHubFlashAftermath`), `js/nuke_finale.js` (FX),
`js/cutscene.js` (sequencer), `js/render.js` (nuke draw hook), `js/voice.js` + `js/assets.js`
(`scene` channel), `js/dialog_data.js` (`NINO_FLASH_LINES`), `js/main.js` + `js/input.js` (tick + input
gate), `rts.html` (scripts + `#cutsceneCaption`), `css/screens.css` (caption + `scene-flash`/`scene-cutscene`).
Voice clips render via `node _dev/gen/build_voice_manifests.mjs` → `bash _dev/gen/gen_voices.sh scene`.
An optional painted mushroom sprite at `assets/scenes/nuke/mushroom.png` is layered over the procedural FX
when present (procedural is the always-available fallback).
