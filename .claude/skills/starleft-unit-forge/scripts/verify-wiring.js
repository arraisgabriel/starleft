#!/usr/bin/env node
/* verify-wiring.js — checklist that a unit is wired across EVERY system it touches.
 *
 * Adding a unit means edits in ~6 places; missing one fails silently (a unit with no UNIT_SPRITE_H
 * renders tiny; one missing from BUILD_HIRES can't be trained; a ranged unit with no MUZZLE entry
 * fires from the wrong spot). This script reports, for a given type, what's present and what's
 * missing across DEF, BUILD_HIRES, ui.js train buttons, the assets.js sprite tables, the sprite
 * FILES on disk, and (for ranged units) muzzle_data.js + the calibrator's unit list.
 *
 * Usage: node verify-wiring.js <type> [repoRoot]
 * Exit code: 0 if everything required is present, 1 if anything required is missing.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const argv = process.argv.slice(2);
const type = argv.find(a => !a.startsWith('--') && !a.includes('/'));
const rootArg = argv.find(a => a.includes('/'));
if (!type) { console.error('usage: verify-wiring.js <type> [repoRoot]'); process.exit(1); }

function findRoot(arg) {
  const guesses = [arg, path.resolve(__dirname, '..', '..', '..', '..'), process.cwd()].filter(Boolean);
  for (const g of guesses) { let d = path.resolve(g);
    for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(d, 'js', 'config.js'))) return d;
      const up = path.dirname(d); if (up === d) break; d = up; } }
  return null;
}
const ROOT = findRoot(rootArg);
if (!ROOT) { console.error('✗ could not find js/config.js (pass repo root as an argument)'); process.exit(1); }
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function loadConfig() {
  const fakeEl = { getContext: () => ({}), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const s = { Math, JSON, console, isNaN, parseInt, parseFloat, Array, Object, Number, String, Date,
    document: { getElementById: () => fakeEl, createElement: () => fakeEl, querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener() {}, body: fakeEl },
    navigator: { userAgent: '' }, location: { href: '' }, innerWidth: 1280, innerHeight: 800 };
  s.window = s; s.globalThis = s; s.window.devicePixelRatio = 1;
  vm.createContext(s);
  vm.runInContext(read('js/config.js') + '\n;globalThis.__cfg={DEF:typeof DEF!=="undefined"?DEF:null,BUILD_HIRES:typeof BUILD_HIRES!=="undefined"?BUILD_HIRES:null};', s, { filename: 'config.js' });
  return s.__cfg;
}
const { DEF, BUILD_HIRES } = loadConfig();
if (!DEF) { console.error('✗ DEF not found'); process.exit(1); }

const d = DEF[type];
const ui = read('js/ui.js'), assets = read('js/assets.js'), muzzle = read('js/muzzle_data.js'), calib = read('js/muzzle-calibrator.js');
const isRanged = !!(d && (d.range || 0) > 2 && (d.dmg || 0) > 0);
const action = (d && d.action) || 'attack';
const has = (src, re) => re.test(src);
const q = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const checks = [];
function check(label, ok, required, detail) { checks.push({ label, ok, required: required !== false, detail: detail || '' }); }

/* --- gameplay --- */
check('DEF entry (js/config.js)', !!d, true, d ? `${d.name} — cost ${d.cost}, hp ${d.hp}, dmg ${d.dmg}, range ${d.range}` : 'missing — unit cannot exist');
const producer = BUILD_HIRES ? Object.keys(BUILD_HIRES).find(b => BUILD_HIRES[b].includes(type)) : null;
check('BUILD_HIRES producer (js/config.js)', !!producer, true, producer ? `trained by ${producer}` : 'not listed under any producer — untrainable');
check('ui.js train button', has(ui, new RegExp(`train\\(\\s*'[^']+'\\s*,\\s*'${q}'`)) || has(ui, new RegExp(`'${q}'`)) && has(ui, new RegExp(`DEF\\.${q}\\b`)), true,
  'a buildCommands() addCmd(...train(<producer>, type)) entry');

/* --- sprite tables (js/assets.js) --- */
check('assets.js UNIT_WALK', has(assets, new RegExp(`\\b${q}\\s*:\\s*walkPair\\(\\s*'${q}'\\s*,\\s*'walk'`)) || has(assets, new RegExp(`\\b${q}\\s*:\\s*walkPair\\(`)), true, `UNIT_WALK['${type}'] = walkPair('${type}','walk')`);
check('assets.js UNIT_ACTION', has(assets, new RegExp(`\\b${q}\\s*:\\s*\\{[^}]*walkPair\\(\\s*'${q}'`)) || has(assets, new RegExp(`UNIT_ACTION[\\s\\S]*\\b${q}\\s*:`)), false, `UNIT_ACTION['${type}'] = { ${action}: walkPair('${type}','${action}') }`);
check('assets.js UNIT_SPRITE_H', has(assets, new RegExp(`UNIT_SPRITE_H[\\s\\S]*\\b${q}\\s*:\\s*[\\d.]`)) || has(assets, new RegExp(`\\b${q}\\s*:\\s*\\d`)), true, `UNIT_SPRITE_H['${type}'] = <draw height px>`);

/* --- sprite files on disk --- */
const dir = `assets/units/${type}`;
check('sprite walk.png', exists(`${dir}/walk.png`), true, `${dir}/walk.png`);
check('sprite walk_enemy.png', exists(`${dir}/walk_enemy.png`), true, `${dir}/walk_enemy.png`);
check(`sprite ${action}.png`, exists(`${dir}/${action}.png`), true, `${dir}/${action}.png`);
check(`sprite ${action}_enemy.png`, exists(`${dir}/${action}_enemy.png`), true, `${dir}/${action}_enemy.png`);

/* --- muzzle (ranged only) --- */
check('muzzle_data.js MUZZLE entry', has(muzzle, new RegExp(`\\b${q}\\s*:\\s*\\{[^}]*mx`)), isRanged, isRanged ? 'MUZZLE entry required (range>2)' : 'not required (melee/support → MUZZLE_FALLBACK)');
check('muzzle-calibrator UNITS list', has(calib, new RegExp(`'${q}'`)) || has(calib, new RegExp(`\\b${q}\\s*:`)), isRanged, isRanged ? `add '${type}' to UNITS + a seed in muzzle-calibrator.js so it's tunable` : 'not required');

/* --- AI (advisory only) --- */
check('ai.js enemy pool (optional)', has(read('js/ai.js'), new RegExp(`'${q}'`)), false, 'add to an ai.js pool if enemies should build it');

/* --- report --- */
console.log(`\nWiring check — ${type}${d ? `  (${d.name})` : ''}${isRanged ? '  [ranged]' : ''}`);
let missingRequired = 0;
for (const c of checks) {
  const mark = c.ok ? '✓' : (c.required ? '✗' : '○');
  if (!c.ok && c.required) missingRequired++;
  console.log(`  ${mark} ${c.label}${c.detail ? '  — ' + c.detail : ''}`);
}
console.log('  legend: ✓ present   ✗ MISSING (required)   ○ optional/not-required');
if (missingRequired === 0) { console.log(`\n✅ ${type} is fully wired.\n`); process.exit(0); }
console.log(`\n✗ ${type} is missing ${missingRequired} required piece(s) — wire them before shipping.\n`);
process.exit(1);
