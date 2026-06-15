#!/usr/bin/env node
/* preview_map.js — ASCII layout preview of a STARLEFT map's HAND-PLACED points.
 *
 * The terrain itself is procedural (generated from the seed at load), so this can't show the final
 * land. What it CAN show — and what actually matters when you're authoring — is the spatial
 * arrangement of the things YOU place: the player start, enemy bases, gold nodes, lakes, rock
 * clusters, forests, and reclaimable lost bases. Seeing them on a grid catches an enemy crammed in
 * a corner, gold stranded on the far side of the map, or a start that's dangerously exposed, before
 * you ever run the full generator.
 *
 * Usage:  node .claude/skills/starleft-mapmaker/scripts/preview_map.js <mapIndex> [repoRoot]
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

function findRoot() {
  const argRoot = process.argv[3];
  if (argRoot && fs.existsSync(path.join(argRoot, 'js', 'config.js'))) return path.resolve(argRoot);
  const guesses = [path.resolve(__dirname, '..', '..', '..', '..'), process.cwd()];
  for (let g of guesses) { let d = g; for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, 'js', 'config.js'))) return d;
    const up = path.dirname(d); if (up === d) break; d = up; } }
  return null;
}
const ROOT = findRoot();
if (!ROOT) { console.error('✗ could not find js/config.js (pass the repo root as the 2nd argument)'); process.exit(1); }

function loadMaps(root) {
  const noop = () => {};
  const sandbox = { Math, Array, Object, JSON, Uint8Array, Float32Array, Map, Set, String, Number, Boolean,
    isFinite, parseInt, parseFloat, console,
    document: { getElementById: () => ({ style: {}, getContext: () => new Proxy({}, { get: () => noop }) }) },
    innerWidth: 1280, innerHeight: 800 };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const mapsPath = path.join(root, 'js', 'maps_data.js');   // MAPS was extracted from config.js → maps_data.js
  const src = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8')
    + '\n;\n' + (fs.existsSync(mapsPath) ? fs.readFileSync(mapsPath, 'utf8') : '')
    + '\n;globalThis.__MAPS = (typeof MAPS!=="undefined") ? MAPS : null;';
  vm.runInContext(src, sandbox, { filename: 'config.js' });
  return sandbox.__MAPS;
}

let MAPS;
try { MAPS = loadMaps(ROOT); } catch (e) { console.error('✗ failed to evaluate js/config.js:', e.message); process.exit(1); }
if (!Array.isArray(MAPS)) { console.error('✗ MAPS array not found'); process.exit(1); }

const idx = parseInt(process.argv[2], 10);
if (!Number.isInteger(idx) || idx < 0 || idx >= MAPS.length) {
  console.error(`✗ map index must be 0..${MAPS.length - 1}. Available:`);
  MAPS.forEach((m, i) => console.error(`    ${i}: ${m.name || '(unnamed)'}`));
  process.exit(1);
}
const m = MAPS[idx];
const W = m.w, H = m.h;

/* ---- draw into a full w×h symbol grid (priority: later wins) ---- */
const grid = Array.from({ length: H }, () => new Array(W).fill('.'));
const PRIO = { '.': 0, '~': 1, 'T': 2, '#': 3, '$': 4, 'O': 5, 'E': 6, 'P': 7 };
const put = (x, y, ch) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  if (PRIO[ch] >= PRIO[grid[y][x]]) grid[y][x] = ch;
};
const disk = (cx, cy, r, ch) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x*x + y*y <= r*r) put(cx + x, cy + y, ch); };

(m.lakes || []).forEach(l => disk(l.x, l.y, Math.max(1, l.r | 0), '~'));
(m.forests || []).forEach(f => disk(f.x, f.y, Math.max(1, Math.round(Math.sqrt(f.n || 9) / 2)), 'T'));
(m.rockClusters || []).forEach(c => disk(c.x, c.y, Math.max(1, Math.round(Math.sqrt(c.n || 9) / 2)), '#'));
(m.goldNodes || []).forEach(g => put(g.x, g.y, '$'));
(m.lostBases || []).forEach(b => put(b.x, b.y, 'O'));
const bases = Array.isArray(m.enemies) ? m.enemies : (m.enemy ? [m.enemy] : []);
bases.forEach(b => put(b.x, b.y, 'E'));
if (m.player) put(m.player.x, m.player.y, 'P');

/* ---- downsample to fit a terminal (collapse blocks by priority) ---- */
const MAXW = 108, MAXH = 56;
const sx = Math.max(1, Math.ceil(W / MAXW)), sy = Math.max(1, Math.ceil(H / MAXH));
const outW = Math.ceil(W / sx), outH = Math.ceil(H / sy);
const rows = [];
for (let oy = 0; oy < outH; oy++) {
  let row = '';
  for (let ox = 0; ox < outW; ox++) {
    let best = '.';
    for (let y = oy * sy; y < Math.min(H, (oy + 1) * sy); y++)
      for (let x = ox * sx; x < Math.min(W, (ox + 1) * sx); x++)
        if (PRIO[grid[y][x]] > PRIO[best]) best = grid[y][x];
    row += best;
  }
  rows.push(row);
}

/* ---- header + summary ---- */
const dist = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));
const biomes = (m.terrain && m.terrain.biomes) ? m.terrain.biomes.join('+') : '(default grass)';
console.log(`\n  ${m.name}   vs ${m.enemyName}`);
console.log(`  ${W}×${H} tiles · seed ${m.seed} · biome ${biomes} · ${bases.length} enemy base(s) · ${(m.goldNodes||[]).length} gold node(s)`);
const eco = `startGold ${m.startGold ?? 300} · workers ${m.startWorkers ?? 4} · soldiers ${m.startSoldiers ?? 2} · barracks ${m.startBarracks ? 'yes' : 'no'}`;
console.log(`  ${eco} · aggression ${m.aggression ?? 1.0}` + (sx > 1 || sy > 1 ? `   [downsampled ${sx}×${sy}→1]` : ''));
console.log('  legend: P=player  E=enemy  $=gold  O=lostBase  #=rock  T=forest  ~=water  .=open\n');

const border = '  +' + '-'.repeat(outW) + '+';
console.log(border);
for (const r of rows) console.log('  |' + r + '|');
console.log(border);

if (m.player && bases.length) {
  console.log('\n  player → enemy distances (tiles):');
  bases.forEach((b, k) => console.log(`    base ${k} (${b.x},${b.y})  d=${dist(m.player, b)}` +
    (b.defenders ? `  defenders ${b.defenders}` : '') + (b.extraBarracks ? '  +barracks' : '')));
  const ds = bases.map(b => dist(m.player, b));
  console.log(`    nearest ${Math.min(...ds)} · farthest ${Math.max(...ds)}`);
  if (Math.min(...ds) < 15) console.log('    ⚠ nearest base is < 15 tiles from the player start — the opening may be a rush.');
}
console.log('');
