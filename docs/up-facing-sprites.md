# Up-Facing Unit Sprites — Design, Generation & Cost

**Status:** design / proposal (nothing generated or wired yet)
**Author trigger:** units "walk backwards" when moving up-screen — their single camera-facing sprite never shows a back.
**Scope:** add a **back/up-facing** walk + action sprite for **every unit, hero, and boss**, then wire the renderer to pick front-vs-back by movement direction.

---

## 1. Context & problem

Every unit sprite today is a single **camera-facing ("down"/toward-viewer) 10-frame strip** that is only ever **mirrored left↔right** via `u._face` ([assets.js:443-444](../js/assets.js#L443)). There are no up/down frames. So when a unit moves up-screen, its drawn front keeps facing the camera and it reads as **driving/flying backwards**.

An interim **lean/bank hack** is currently shipped for vehicles + air only (`updateUnitRot`/`rotBegin` in [render.js](../js/render.js#L2295), `ROT_LEAN`): it tilts those sprites ≤24° into an up-diagonal. That softens the effect but cannot show a back. **This doc is the real fix** — true back-facing art — and it **supersedes the lean** (see §8 cleanup).

### Why this works with only ONE new direction
The engine already mirrors L↔R. Adding a single **back ("up") view** per animation gives, with the existing mirror:

| Movement | Sheet used | Mirror |
|---|---|---|
| down / down-left / down-right | **front** (existing) | as needed |
| up / up-left / up-right | **back** (new) | as needed |
| pure left / right | front (existing) | as needed |

So **front + back + horizontal flip ≈ 6-way facing** — no side sheets, no per-diagonal art. This is the standard 2.5D approach and matches the request exactly.

---

## 2. The roster — exactly what to generate

The unit of cost is **one Gemini call = one 10-frame strip** ([gen_units.mjs:144-154](../_dev/gen/gen_units.mjs#L144)). The `_enemy` (red) and `_ao` (black/green) faction twins are **free pixel recolors** ([slice_units.py](../_dev/gen/slice_units.py), [recolor_ao.py](../_dev/gen/recolor_ao.py)); the `psychologist` is a **free white recolor of the recruiter** ([recolor_white.py](../_dev/gen/recolor_white.py)). So we pay **only** for distinct bespoke art × new animation.

Each type needs an **up walk** + its **up action**. Action per type mirrors what exists today (mine / attack / heal).

| Group | Types | Up strips each | Paid strips | Notes |
|---|---|---|---|---|
| **Base units** | worker, soldier, ranger, recruiter, hustler, lobbyist, foodtruck, auditor, founder, courier, bomber | walk_up + action_up = 2 | **22** | actions: worker=mine; recruiter/courier=heal; rest=attack |
| **psychologist** | psychologist | — | **0** | free white-recolor of `recruiter_*_up` |
| **Heroes** | nino, biba, rust | 2 | **6** | bespoke palettes (no `_ao`); `_enemy` twin still free. *If nino is a pure lobbyist recolor (verify [gen_nino.mjs](../_dev/gen/gen_nino.mjs)), drop to 4.* |
| **Bosses** | ninja, rex, ex_terminator | ninja/rex = 2; ex_terminator = 4 | **8** | ex_terminator has 3 attack strips (melee/pistol/minigun) + walk; `idle_up` skipped (no strong facing) |
| | | | **= 36 paid strips** | |

**Free fan-out after generation:** each paid strip → `_enemy` (all) + `_ao` (13 non-skip types) + psychologist white set ⇒ **~100 new runtime WebP files** (mirrors today's 99). Skip-`_ao` list: psychologist, nino, biba, rust, ex_terminator ([recolor_ao.py:36](../_dev/gen/recolor_ao.py#L36)).

**Excluded:** `zeca` (defined in the generator but **no base art exists yet** — generating its up set means generating its base first; out of scope here). `npc_parts` (hub-cosmetic wardrobe, not directional combatants).

---

## 3. Cost

Rate (repo ledger + Google, `gemini-3-pro-image`, 2K tier): **$0.134 / strip** ([_spend.mjs:17](../_dev/gen/_spend.mjs#L17)). `_enemy`/`_ao`/white recolors are **$0**.

| Group | Paid strips | First-try | Realistic (×2.5 retries\*) | Batch (½, first-try) |
|---|---|---|---|---|
| Base units | 22 | $2.95 | ~$7.4 | $1.47 |
| Heroes | 6 | $0.80 | ~$2.0 | $0.40 |
| Bosses | 8 | $1.07 | ~$2.7 | $0.54 |
| **TOTAL (36)** | **36** | **$4.82** | **~$12** | **$2.41** |

\* The existing ledger shows **$11.834 spent** ([.gen_spend.json](../_dev/gen/.gen_spend.json)) for ~36 final API strips ⇒ ≈ **2.5× iteration** in practice (sprite gen rarely lands first try). Budget for it.

**Budget context:** cap is **$30**, **$18.17 remaining**. First-try fits comfortably; realistic non-batch (~$12) fits but is tight; **Batch API halves it** (24h turnaround) and is the recommended mode. Reset/raise `CAP` in [_spend.mjs:16](../_dev/gen/_spend.mjs#L16) if needed.

**Single biggest cost lever:** feed the **existing front strip as a reference image** (see §4) — it cuts the iteration multiplier hard by anchoring the character design, so realistic cost trends toward first-try.

---

## 4. Generation pipeline

### 4.1 Extend `gen_units.mjs` with a back-view mode
The current `VIEW`/`HERO_VIEW` blocks say *"facing toward the viewer / forward."* For up sprites we swap in a **back view** and forbid the front. Add:

```js
// VIEW override for the up/back set
const VIEW_BACK = `

VIEW: a 3/4 top-down-ish view FROM BEHIND (camera slightly above and BEHIND the unit), the unit facing AWAY from the viewer — walking UP/away into the screen so we see its BACK. Same character, same scale and framing as the front strip; we now see the back of the head/helmet/hood/chassis and the back of any backpack, booster, scarf, engine or rotor. NOT a front view, NO visible face, no flat side view, no pure top-down, no horizon. No text, labels, numbers, UI, or health bars.`;
const AVOID_BACK = ` Also avoid: a FRONT view or the unit facing the viewer, any visible face/eyes, a side profile — the unit MUST be seen from BEHIND, facing away, walking up into the screen.`;
```

Drive it with a `--up` flag so the same SUBJECT + motion specs are reused (consistency), only the view changes, and output goes to `unit_<type>_<tag>_up.png`:

```js
const UP = args.includes('--up');
// ... inside the type loop:
const view  = UP ? VIEW_BACK : (u.heroView || VIEW_FRONT);   // VIEW_FRONT = today's VIEW/HERO_VIEW
const avoid = (u.avoid || AVOID) + (UP ? AVOID_BACK : '');
const tagSuffix = UP ? '_up' : '';
// jobs: ['walk'+tagSuffix, ...], [u.action.name+tagSuffix, ...]
// dst: unit_<t>_<walk|action>${tagSuffix}.png
// prompt: `${styleHeader}\n\nSUBJECT: ${u.subj}. ${motion}\n${view}\n\n${avoid}`
```

The motion specs (`WALK_HUMANOID`, `ATK_MELEE`, per-unit `action.spec`) are **reused unchanged** — a walk cycle from behind is the same leg/arm motion, just viewed from the rear. ex_terminator's 3 attack strips reuse their existing specs with `VIEW_BACK`.

### 4.2 Strongly recommended: reference-image consistency
`generate()` is text-only today ([gen_units.mjs:121-123](../_dev/gen/gen_units.mjs#L121)). `gemini-3-pro-image` accepts image inputs. Pass the **already-sliced front strip** (or raw front PNG) as a reference part so the back view matches design/colors/weapon exactly:

```js
async function generate(prompt, refPngPath){
  const parts = [{ text: prompt }];
  if (refPngPath && existsSync(refPngPath))
    parts.unshift({ inlineData:{ mimeType:'image/png', data: readFileSync(refPngPath).toString('base64') }});
  const body = { contents:[{ parts }], generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio:'1:1' } } };
  // ...unchanged model loop...
}
// call: generate(`${prompt}\n\nThe attached image is the SAME unit seen from the FRONT — match its exact design, colours, armor/chassis and weapon; redraw it from BEHIND.`, frontPng)
```

This is the single biggest quality+cost win (anchors the character → fewer rejected gens).

### 4.3 Slice + recolor (no code change beyond glob)
- **Slice:** `slice_units.py` already chroma-keys the green bg, splits the 5×2 grid, baseline-aligns to a 10-frame strip, and derives the `_enemy` twin for free. Point it at the new `*_up.png` files → emits `assets/units/<type>/<tag>_up.webp` + `<tag>_up_enemy.webp`. (Heroes use their bespoke slicers `slice_nino.py` / `slice_biba.py` / `slice_rust.py`; ex_terminator uses `pack_exterminator.py` — run the up files through the same.)
- **A&O recolor:** `recolor_ao.py` → free `<tag>_up_ao.webp` for the 13 non-skip types.
- **psychologist:** `recolor_white.py` on `recruiter_*_up` → free psychologist up set.
- **Optimize:** `optimize_assets.py` (WebP).

### 4.4 Generation order (cheapest path)
1. Generate **base units first** with `--up` + reference image, Batch mode.
2. Eyeball each; regen only the rejects (`--force <type>`).
3. Derive psychologist (white recolor) — free.
4. Heroes + bosses last.

---

## 5. Renderer wiring (render-only, no save/sync change)

Two lookups gain an optional `up` arg (default `false` ⇒ 100% backward compatible), and `drawUnit` computes a sticky `u._faceUp` like `u._face`.

### 5.1 Load both orientations ([assets.js:334](../js/assets.js#L334))
Extend `walkPair` to also load the `_up` strips as **optional/ambient** (missing ones stay `!ready` and fall back — same precedent as `_ao` today, so partial rollout never breaks the game or the load gate):

```js
function walkPair(type, act){
  // ...existing player/enemy/ao...
  return { player, enemy, ao,
    player_up: loadWalk(unitSheet(type, act+'_up', false), 0,0,null, metaUp('player')),
    enemy_up:  loadWalk(unitSheet(type, act+'_up', true),  0,0,null, metaUp('enemy')),
    ao_up:     loadWalk(unitSheetFac(type, act+'_up','ao'),0,0,null, metaUp('ao')) };   // metaUp: T_AMBIENT, optional:true
}
```

### 5.2 Pick the up variant, fall back to front ([assets.js:393](../js/assets.js#L393), [:433](../js/assets.js#L433))
```js
function unitWalk(type, owner, faction, up){
  const e = UNIT_WALK[type]; if(!e) return null;
  const fk = (faction && e[faction] && e[faction].ready) ? faction : factionKey(owner);
  if(up){ const upv = e[fk+'_up']; if(upv && upv.ready) return upv; }   // back view if present
  const a = e[fk]; return (a && a.ready) ? a : null;                     // else fall back to front
}
// actionAnim: same trailing `up` param + same `action+'_up'` ready-check-then-fallback.
```

### 5.3 Compute `u._faceUp` in `drawUnit` (both LOD + full paths)
Right next to the existing `_face` line ([render.js:2317](../js/render.js#L2317) and [:2346](../js/render.js#L2346)) — a sticky front/back switch with a dead-band so near-horizontal motion doesn't flicker, and aim-based facing while attacking:

```js
// back view when clearly moving up-screen; hold across the dead-band; aim-based while attacking
if(u._actState && u.dir!=null)      u._faceUp = Math.sin(u.dir) < -0.25;   // firing up/away → show back
else if(md>0.4){
  const up = -mvy/md;                                                       // +1 = straight up
  if(up >  0.35) u._faceUp = true;
  else if(up < 0.15) u._faceUp = false;                                     // else keep previous (hysteresis)
}
```
`_faceUp` is a render-only transient (underscore, like `_face`/`_walkDist`) — **not saved, not synced**. The client derives it from interpolated position + the snapshotted `u.dir`, so it holds for solo/host/client with zero `save.js`/`sync.js` change.

### 5.4 Thread `u._faceUp` into the lookups
Pass it at the call sites that resolve a strip:
- `unitWalk(sType, u.owner, fac, u._faceUp)` — LOD ([render.js:2311](../js/render.js#L2311)) + full ([render.js:2393](../js/render.js#L2393)).
- `actionAnim(sType, u._actState, u.owner, fac, u._faceUp)` — LOD ([render.js:2323](../js/render.js#L2323)) + full ([render.js:2396](../js/render.js#L2396)).
- `muzzleWorld` ([assets.js:457](../js/assets.js#L457)) — pass `u._faceUp` to its internal `actionAnim`/`unitWalk` so the muzzle box matches the up strip (see §7 muzzle).

The overlay helpers (glow/rim/cloak) already receive the **chosen** `useAnim`, so they inherit the up strip automatically — no change there beyond what they already do.

---

## 6. The horizontal flip still applies
`blitFrame`'s `_face` mirror is unchanged: up-left vs up-right is the back strip mirrored, exactly like front. No interaction to manage — the back strip is authored facing straight up; the mirror handles the diagonals.

---

## 7. Edge cases & calibration

- **Muzzle anchors (attacking units).** Lasers originate from `MUZZLE[type]` normalized to the strip ([assets.js:457](../js/assets.js#L457)). The back-view attack puts the barrel on the far side / top, so the front anchor will be wrong for up attacks. **Add an `_up` muzzle anchor per attacking type** (reuse the existing muzzle calibrator workflow) and have `muzzleWorld` pick it when `u._faceUp`. Non-attacking up movement is unaffected.
- **Reborn optic / hero glow anchors.** `REBORN_OPTIC` ([render.js:2187](../js/render.js#L2187)) and `heroNeonFrame` anchors are per-front-frame. For the back view the head optic should sit at the back of the head; either add `_up` anchor rows or accept that these FX hide on the back view. Low priority (cosmetic, only on reborn/hero up movement).
- **Idle.** Idle keeps the front strip (no `idle_up`); a stopped unit faces the camera, which is natural.
- **Air/vehicles.** `courier`/`bomber`/`foodtruck`/`auditor`/`founder` get up strips like everyone else; the back view of a flyer/vehicle is just its rear.

---

## 8. Cleanup: retire the interim lean
Once a unit has up art, the vehicle/air **lean/bank** is redundant and can fight the back view. Recommended on landing:
- Set `ROT_LEAN = 0` (or remove `updateUnitRot`/`rotBegin`/`rotEnd` and their call sites) in [render.js:2295+](../js/render.js#L2295), and the `muzzleWorld` `_rot` branch in [assets.js](../js/assets.js#L457).
- Keep `?norotate` only if you want a quick A/B during the transition.
This is the owner's call; the two systems can briefly coexist (lean on diagonals, up-art on verticals) but the clean end-state is up-art only.

---

## 9. netRole / save / performance
- **Render-only & transient:** `_faceUp` joins `_face`/`_walkDist`/`_rot` — never serialized, never networked. `save.js` and `net/sync.js` untouched. Holds for **solo / host / client** (client derives from interpolated pos + networked `u.dir`).
- **Loader:** up strips registered **optional/ambient** → cannot wedge the load gate; missing files fall back to the front strip (same as `_ao`). Safe partial rollout (ship per-unit as art arrives).
- **Perf:** lookup adds one ready-check; no extra per-frame draw. Negligible.

---

## 10. Verification (manual, in-browser)
Serve: `python3 -m http.server 8000` → `http://localhost:8000/rts.html`.
1. **Before art:** with the wiring in but no `_up` files, confirm everything still renders (front strips, fallback path) — no regression, no gate hang.
2. **Per unit with up art:** move it straight up and on both up-diagonals — confirm it shows its **back** and the L/R flip is correct; move down/horizontal — confirm it shows the **front** (no flicker at the dead-band boundary).
3. **Attacking up:** order an attack on a target above the unit — confirm back-view attack plays and the **laser fires from the barrel** (muzzle `_up` anchor).
4. **Factions:** check player (cyan), enemy (red `_enemy`), and an A&O map (`_ao`) all show correct up art.
5. **Heroes/bosses:** Nino/Biba/Rust and ninja/rex/ex_terminator up views read correctly at their larger scales.
6. **Co-op (client):** a host-driven unit moving up shows the back view from interpolated motion (no save/sync change expected).
7. **Reduced motion / LOD:** zoom out past `SPRITE_LOD_ZOOM` and confirm the up strip still selects.

---

## 11. Execution checklist
- [ ] Add `VIEW_BACK`/`AVOID_BACK` + `--up` mode + reference-image support to `gen_units.mjs` (§4.1–4.2).
- [ ] Batch-generate base-unit up strips with reference images; eyeball; `--force` regen rejects.
- [ ] Slice (`slice_units.py` + bespoke hero/boss slicers) → `*_up.webp` (+ free `_enemy`).
- [ ] `recolor_ao.py` (free `_ao_up`), `recolor_white.py` (free psychologist up), `optimize_assets.py`.
- [ ] `walkPair` loads `_up` variants (optional/ambient) (§5.1).
- [ ] `unitWalk`/`actionAnim` gain `up` arg with front fallback (§5.2).
- [ ] `drawUnit` computes `u._faceUp` (both paths) + thread into lookups + `muzzleWorld` (§5.3–5.4).
- [ ] Add `_up` muzzle anchors for attacking types (§7).
- [ ] Generate heroes + bosses; verify (§10).
- [ ] Retire the interim lean (§8).

**Cost to clear this checklist:** ~**$4.8 first-try / ~$12 realistic / ~$2.4 batch** in Gemini spend (§3); the real effort is **art consistency** (mitigated by reference images) and the **muzzle re-anchor** pass — the code wiring is small and render-only.
