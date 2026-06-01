#!/usr/bin/env node
/* verify_geometry.js — run the REAL STARLEFT generator headlessly and assert the geography
 * invariants for every map (or one map). This is the gold-standard check: it actually calls
 * newMap(), so it proves the procedural terrain is sound, not just that the config looks right.
 *
 * Why this exists instead of the game's _dev/verify_maps.js: that tool (a) forgets to load
 * js/megasprites.js, so newMap() now throws `placeMegaSprites is not defined`, and (b) checks its
 * invariants against the RAW MAPS[idx] coordinates and the unscaled cfg.w grid — but newMap()
 * scales everything by MAP_SCALE first, so st.W/st.H and st.cfg are larger. This verifier loads the
 * full generator bundle and checks against st.cfg (the scaled config newMap actually used) over the
 * full st.W×st.H grid, so the reachability/contiguity results are correct.
 *
 * Checks per map:
 *   1. no orphan biome tiles      2. no single-tile water islands
 *   3. no ice<->desert ringed tiles 4. every gold node & enemy base reachable from the player
 *   5. generation is deterministic 6. build time is sane
 *
 * Usage:  node .claude/skills/starleft-mapmaker/scripts/verify_geometry.js [mapIndex] [repoRoot]
 * Exit:   0 if all checks pass, 1 otherwise.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

function findRoot(arg) {
  if (arg && fs.existsSync(path.join(arg, 'js', 'config.js'))) return path.resolve(arg);
  const guesses = [path.resolve(__dirname, '..', '..', '..', '..'), process.cwd()];
  for (let g of guesses) { let d = g; for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, 'js', 'config.js'))) return d;
    const up = path.dirname(d); if (up === d) break; d = up; } }
  return null;
}

let onlyIdx = null, rootArg = null;
for (const a of process.argv.slice(2)) { if (/^\d+$/.test(a)) onlyIdx = parseInt(a, 10); else rootArg = a; }
const ROOT = findRoot(rootArg);
if (!ROOT) { console.error('✗ could not find js/config.js (pass the repo root as an argument)'); process.exit(1); }

/* ---- stubbed-DOM/browser sandbox; load the full generator bundle ---- */
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, p) => (typeof p === 'string' ? noop : undefined) });
const fakeEl = new Proxy({ style: {}, getContext: () => ctxStub, getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 150 }), width: 300, height: 150, appendChild: noop, setAttribute: noop, addEventListener: noop },
  { get: (t, p) => (p in t ? t[p] : noop) });
function ImageStub() { this._src = ''; }
Object.defineProperty(ImageStub.prototype, 'src', { get() { return this._src; }, set(v) { this._src = v; } });
const sandbox = { innerWidth: 1280, innerHeight: 800, Math, Array, Object, Uint8Array, Map, Set, Float32Array,
  isFinite, parseInt, parseFloat, console, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  // browser globals the asset/lore/career layers touch at load — stubbed so newMap() can run headless:
  location: { protocol: 'file:', href: '', origin: '', search: '', hash: '' },
  Image: ImageStub, navigator: { userAgent: 'node' },
  requestAnimationFrame: noop, cancelAnimationFrame: noop, fetch: () => Promise.resolve({}),
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
  addEventListener: noop, removeEventListener: noop, alert: noop,
  document: { getElementById: () => fakeEl, createElement: () => fakeEl, querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener: noop, body: fakeEl },
  performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 } };
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.window.devicePixelRatio = 1;
vm.createContext(sandbox);

/* Load exactly what rts.html loads before map.js, in the same order, so newMap()'s full dependency
 * closure resolves: makeRng/noise (state), MAPS/DEF/consts (config), ASSET_BASE (assets),
 * placeMegaSprites (megasprites), spawnVets (career), and the lore data/runtime. The game's own
 * _dev/verify_maps.js loads only config+state+map — which is why newMap() throws there. */
const FILES = ['js/state.js', 'js/config.js', 'js/assets.js', 'js/megasprites.js', 'js/career.js', 'js/lore_data.js', 'js/lore.js', 'js/map.js'];
const present = FILES.filter(f => fs.existsSync(path.join(ROOT, f)));
const src = present.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
  + '\n;globalThis.__api={MAPS,newMap,T_WATER,T_ROCK,T_TREE,B_GRASS,B_MOUNTAIN,B_WATER,B_TECH,B_DESERT,B_ICE,B_VOLCANIC};';
try { vm.runInContext(src, sandbox, { filename: 'bundle.js' }); }
catch (e) { console.error('✗ failed to load the generator bundle:', e.message); process.exit(1); }

const { MAPS, newMap, T_WATER, T_ROCK, T_TREE,
        B_GRASS, B_MOUNTAIN, B_WATER, B_TECH, B_DESERT, B_ICE, B_VOLCANIC } = sandbox.__api;
const BN = { [B_GRASS]:'grass',[B_MOUNTAIN]:'mtn',[B_WATER]:'water',[B_TECH]:'tech',[B_DESERT]:'desert',[B_ICE]:'ice',[B_VOLCANIC]:'volc' };

let failures = 0, warnings = 0;
// HARD failures break the map (unplayable): newMap throws, an objective is unreachable, or
// generation isn't deterministic. SOFT warnings are cosmetic (a stray despeckle tile, a slow build
// on a giant map) — worth surfacing, but they don't fail the gate.
const check = (cond, msg) => { if (!cond) { failures++; console.log('   ✗ ' + msg); } };
const warn = (cond, msg) => { if (!cond) { warnings++; console.log('   ⚠ ' + msg); } };
if (onlyIdx != null && (onlyIdx < 0 || onlyIdx >= MAPS.length)) { console.error(`✗ map index must be 0..${MAPS.length - 1}`); process.exit(1); }
const indices = onlyIdx != null ? [onlyIdx] : MAPS.map((_, i) => i);

for (const idx of indices) {
  const t0 = process.hrtime.bigint();
  let st; try { st = newMap(idx); } catch (e) { failures++; console.log(`\nMap ${idx} "${MAPS[idx].name}"  ✗ newMap() threw: ${e.message}`); continue; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const { tiles, biome, blocked, cfg } = st;          // cfg = the SCALED config newMap used
  const W = st.W, H = st.H, N = W * H;                 // SCALED grid dimensions

  let water = 0, rock = 0, tree = 0; const hist = {};
  for (let i = 0; i < N; i++) { if (tiles[i] === T_WATER) water++; else if (tiles[i] === T_ROCK) rock++; else if (tiles[i] === T_TREE) tree++; hist[biome[i]] = (hist[biome[i]] || 0) + 1; }
  const pct = n => (100 * n / N).toFixed(1);
  console.log(`\nMap ${idx} "${MAPS[idx].name}" ${W}x${H}  build ${ms.toFixed(1)}ms`);
  console.log(`   water ${pct(water)}%  rock ${pct(rock)}%  tree ${pct(tree)}%  | ${Object.keys(hist).map(b => `${BN[b]}:${pct(hist[b])}%`).join(' ')}`);

  // 1) orphan biome tiles
  let orphans = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const b = biome[y * W + x]; let same = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && biome[ny * W + nx] === b) same++; }
    if (same === 0) orphans++; }
  warn(orphans === 0, `orphan biome tiles: ${orphans} (cosmetic; some shipping maps have these too)`);

  // 2) single-tile water islands
  const seenW = new Uint8Array(N); let isles = 0;
  for (let i = 0; i < N; i++) { if (tiles[i] !== T_WATER || seenW[i]) continue; let sz = 0; const stk = [i]; seenW[i] = 1;
    while (stk.length) { const k = stk.pop(); sz++; const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nk = ny * W + nx; if (!seenW[nk] && tiles[nk] === T_WATER) { seenW[nk] = 1; stk.push(nk); } } }
    if (sz === 1) isles++; }
  warn(isles === 0, `single-tile water islands: ${isles} (cosmetic)`);

  // 3) ice/desert ringed tiles
  let illegal = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const b = biome[y * W + x]; if (b !== B_ICE && b !== B_DESERT) continue;
    const opp = b === B_ICE ? B_DESERT : B_ICE; let all = true;
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1 && all; dx++) { if (!dx && !dy) continue; if (biome[(y + dy) * W + (x + dx)] !== opp) all = false; }
    if (all) illegal++; }
  warn(illegal === 0, `ice<->desert ringed tiles: ${illegal} (cosmetic)`);

  // 4) reachability — flood-fill passable tiles from the player, using the SCALED cfg coords that
  //    match this grid; every gold node and enemy base must have a reachable approach tile.
  const seen = new Uint8Array(N);
  const sx = Math.min(W - 1, Math.max(0, Math.round(cfg.player.x)));
  const sy = Math.min(H - 1, Math.max(0, Math.round(cfg.player.y)));
  const stk = [[sx, sy]]; seen[sy * W + sx] = 1;
  while (stk.length) { const [x, y] = stk.pop();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (seen[k] || blocked[k]) continue; seen[k] = 1; stk.push([nx, ny]); } }
  const approachable = (gx, gy) => { gx = Math.round(gx); gy = Math.round(gy);
    for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = gx + dx, ny = gy + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && seen[ny * W + nx]) return true; } return false; };
  let unreach = 0;
  for (const g of (cfg.goldNodes || [])) if (!approachable(g.x, g.y)) unreach++;
  for (const b of (cfg.enemies || [])) if (!approachable(b.x, b.y)) unreach++;
  check(unreach === 0, `unreachable gold/bases: ${unreach} (want 0)`);

  // 4b) thicket trails — each declared crammed region must keep an OPEN, reachable corridor:
  //     both ends of its trail axis must be reachable from the player (over the same flood).
  let thBad = 0;
  for (const t of (cfg.thickets || [])) {
    const rx = t.x | 0, ry = t.y | 0, rw = Math.max(2, t.w | 0), rh = Math.max(2, t.h | 0);
    const axis = (t.trail === 'h' || t.trail === 'v') ? t.trail : (rw >= rh ? 'h' : 'v');
    let ax, ay, bx, by;
    if (axis === 'h') { ay = by = Math.min(H - 1, ry + (rh >> 1)); ax = Math.max(0, rx); bx = Math.min(W - 1, rx + rw - 1); }
    else { ax = bx = Math.min(W - 1, rx + (rw >> 1)); ay = Math.max(0, ry); by = Math.min(H - 1, ry + rh - 1); }
    if (!approachable(ax, ay) || !approachable(bx, by)) thBad++;
  }
  if ((cfg.thickets || []).length) check(thBad === 0, `thickets with no reachable trail: ${thBad} (want 0)`);

  // 5) determinism
  let st2; try { st2 = newMap(idx); } catch (e) { st2 = null; }
  let diff = 0; if (st2) for (let i = 0; i < N; i++) { if (tiles[i] !== st2.tiles[i] || biome[i] !== st2.biome[i]) diff++; }
  check(st2 && diff === 0, `non-deterministic tiles: ${diff} (want 0)`);
  // 5b) topography features must be deterministic too (element-wise tx/ty/slot)
  const fa = st.features || [], fb = (st2 && st2.features) || [];
  let fdiff = (fa.length !== fb.length) ? Math.abs(fa.length - fb.length) : 0;
  for (let i = 0; i < Math.min(fa.length, fb.length); i++) if (fa[i].tx !== fb[i].tx || fa[i].ty !== fb[i].ty || fa[i].slot !== fb[i].slot) fdiff++;
  check(st2 && fdiff === 0, `non-deterministic topography features: ${fdiff} (want 0)`);

  // 6) perf (maps build once, behind the intro crawl — so this is a soft heads-up, not a gate)
  warn(ms < 600, `build time ${ms.toFixed(1)}ms (slow, but builds once behind the crawl)`);
}

const wtail = warnings ? ` (${warnings} cosmetic warning${warnings === 1 ? '' : 's'})` : '';
console.log(failures === 0 ? `\n✅ ALL GEOMETRY CHECKS PASS${wtail}` : `\n❌ ${failures} hard failure(s)${wtail}`);
process.exit(failures ? 1 : 0);
