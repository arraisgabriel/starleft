# Building placement — manual verification

Per CLAUDE.md, gameplay/render changes are verified in a real browser. Serve and open:

```bash
python3 -m http.server 8000      # then open http://localhost:8000/rts.html
```

Automated pass (headless): open `http://localhost:8000/rts.html?placement-tests=1` and run
`PLACEMENT.runTests()` in the console (or `bash docs/placement/run-placement-test.sh`).

## Placement preview — desktop

- [ ] Start any campaign map, select a Worker, click **People Ops** (barracks).
- [ ] Move the cursor: the preview now shows the building's **real drawn extent** — a translucent
      ghost of the actual sprite plus a dashed outline — not just the small tile footprint. The green
      footprint tint sits at the base; the ghost rises above/around it (HQ towers up; turret is visibly
      wider; **Market Research / intel** ghost is small — its art is smaller than its 1×1 footprint).
- [ ] Hover over open ground → green outline. Hover so the ghost's base overlaps an existing building
      → outline turns **amber** (a crowding *warning*). Hover on blocked/fog/out-of-bounds → red.
- [ ] Confirm amber **still lets you place** (tap/click commits) — it warns, it does not block. Red does
      not place ("Cannot build there").

## Placement preview — narrow / mobile viewport

- [ ] Repeat at ~390px width (HUD height drives the canvas viewport math). The ghost and dashed outline
      must still line up with where the building actually draws once placed — no offset between preview
      and the real sprite.

## Map-start spacing

- [ ] Load maps 0, 1, a mid map, and the last map. The player base (HQ + People Ops) and each enemy
      base should read as **distinct structures**, not a single pile. Side-by-side flankers no longer
      overlap the HQ sprite; intentional front/back depth (e.g. the garage in front of the HQ) is kept.
- [ ] Starting units muster **below/in front** of the HQ (not hidden behind the tall sprite), and bases
      stay reachable (move a unit from your base to an enemy base).

## Regressions to spot-check (CLAUDE.md)

- [ ] Place a building, train a unit, **save + load** — building positions persist identically.
- [ ] Co-op: a client's placement preview is local-only; host placement re-validation is unchanged;
      both peers generate the **same** base layout (determinism — covered by the `F1` assertion).
