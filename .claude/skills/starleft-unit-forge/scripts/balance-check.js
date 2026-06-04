#!/usr/bin/env node
/* balance-check.js — comparative stat/cost sanity check for a STARLEFT unit.
 *
 * STARLEFT has no balance FORMULA — DEF stats are hand-tuned. So "balanced" means: this unit sits
 * inside the envelope its tier-peers already define, and it doesn't dominate them on every axis or
 * become a carried-veteran that outclasses the whole roster. This script loads the live DEF + the
 * BUILD_HIRES producer map, builds the comparative table for the unit's production tier, and prints
 * advisory flags. It is a DESIGN AID, not a gate — the hard gate is simulate_balance.js --gate run
 * against a real map (that one accounts for js/balance.js veteran scaling).
 *
 * Metrics:
 *   dps      = dmg / cd                     (sustained damage; healers use heal/cd as "hps")
 *   dps/cost                                (offensive gold-efficiency; soldier ≈ the frontline benchmark)
 *   ehp      = hp                           (durability; armor/regen not modeled)
 *   ehp/cost                                (defensive gold-efficiency)
 *   cv       = ehp * dps / 1000             (combat value — same shape simulate_balance.js uses)
 *   cv/cost                                 (overall power per gold)
 *   cv@L5    = cv * (1+0.33*5) * (1+0.15*5) (a level-5 veteran's combat value — the carryover ceiling)
 *
 * Usage:
 *   node balance-check.js <type>                      # a unit already in DEF (e.g. ranger)
 *   node balance-check.js --draft '<json>' [--producer barracks]   # a not-yet-wired draft unit
 *   node balance-check.js --table                     # dump the whole roster, grouped by tier
 * Pass the repo root as a trailing arg if autodetection fails.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

/* ---- args ---- */
const argv = process.argv.slice(2);
let type = null, draft = null, producerArg = null, table = false, rootArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--table') table = true;
  else if (a === '--draft') draft = JSON.parse(argv[++i]);
  else if (a === '--producer') producerArg = argv[++i];
  else if (a.startsWith('--')) { /* ignore unknown flags */ }
  else if (!type && !draft) type = a;
  else rootArg = a;
}

/* ---- locate repo root + load DEF / BUILD_HIRES from js/config.js in a stub sandbox ---- */
function findRoot(arg) {
  const guesses = [arg, path.resolve(__dirname, '..', '..', '..', '..'), process.cwd()].filter(Boolean);
  for (const g of guesses) { let d = path.resolve(g);
    for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(d, 'js', 'config.js'))) return d;
      const up = path.dirname(d); if (up === d) break; d = up; } }
  return null;
}
const ROOT = findRoot(rootArg);
if (!ROOT) { console.error('✗ could not find js/config.js (pass the repo root as an argument)'); process.exit(1); }

function loadConfig() {
  // config.js touches document/canvas at top level; a fake DOM lets it define DEF/BUILD_HIRES headlessly.
  const fakeEl = { getContext: () => ({}), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const s = { Math, JSON, console, isNaN, parseInt, parseFloat, Array, Object, Number, String, Date,
    document: { getElementById: () => fakeEl, createElement: () => fakeEl, querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener() {}, body: fakeEl },
    navigator: { userAgent: '' }, location: { href: '' }, innerWidth: 1280, innerHeight: 800 };
  s.window = s; s.globalThis = s; s.window.devicePixelRatio = 1;
  vm.createContext(s);
  const src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8')
    + '\n;globalThis.__cfg = { DEF: typeof DEF!=="undefined"?DEF:null, BUILD_HIRES: typeof BUILD_HIRES!=="undefined"?BUILD_HIRES:null };';
  vm.runInContext(src, s, { filename: 'config.js' });
  return s.__cfg;
}
const { DEF, BUILD_HIRES } = loadConfig();
if (!DEF) { console.error('✗ DEF not found in js/config.js'); process.exit(1); }

/* career multipliers — mirror js/career.js (CAREER.dmgPerStar / hpPerStar). Update if those change. */
const DMG_PER_STAR = 0.15, HP_PER_STAR = 0.33;
const vetMul = (L) => (1 + HP_PER_STAR * L) * (1 + DMG_PER_STAR * L);

/* ---- which producer trains a type (the prereq tier) ---- */
function producerOf(t) {
  if (BUILD_HIRES) for (const [b, list] of Object.entries(BUILD_HIRES)) if (list.includes(t)) return b;
  return null;
}
const TIER_ORDER = ['hq', 'barracks', 'garage', 'launchpad'];

/* ---- metrics for one unit ---- */
function metrics(t, d) {
  const healer = !!(d.heal || d.action === 'heal' || (d.dmg || 0) === 0);
  const out = (d.heal || d.dmg || 0) / (d.cd || 1);           // dps, or hps for healers
  const cv = healer ? (d.hp * out / 1000) : (d.hp * out / 1000);
  return {
    type: t, name: d.name, cost: d.cost, build: d.build, hp: d.hp, dmg: d.dmg || 0, cd: d.cd || 0,
    range: d.range || 0, speed: d.speed || 0, supply: d.supply ?? 0,
    dps: round(out), dpsCost: d.cost ? round(out / d.cost, 3) : 0,
    ehpCost: d.cost ? round(d.hp / d.cost, 2) : 0,
    cv: round(cv, 2), cvCost: d.cost ? round(cv / d.cost, 4) : 0, cv5: round(cv * vetMul(5), 1),
    healer, role: roleTags(d),
  };
}
function roleTags(d) {
  const t = [];
  if (d.air) t.push('air'); if (d.vehicle) t.push('vehicle'); if (d.antiAir) t.push('antiAir');
  if (d.splash) t.push('splash'); if (d.siege) t.push('siege');
  if (d.heal || d.action === 'heal') t.push('heal'); if ((d.range || 0) > 2 && (d.dmg || 0) > 0) t.push('ranged');
  if ((d.range || 0) <= 2 && (d.dmg || 0) > 0) t.push('melee');
  return t.join(',') || '—';
}
function round(n, p = 1) { const f = 10 ** p; return Math.round(n * f) / f; }
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padL(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

function rosterRows() { return Object.entries(DEF).filter(([, d]) => d.kind === 'unit').map(([t, d]) => metrics(t, d)); }

function printTable(rows, title) {
  console.log('\n' + title);
  console.log('  ' + pad('unit', 12) + padL('cost', 5) + padL('hp', 5) + padL('dmg', 5) + padL('cd', 5)
    + padL('dps', 6) + padL('dps/$', 7) + padL('hp/$', 6) + padL('cv', 6) + padL('cv/$', 7) + padL('cv@5', 7)
    + padL('rng', 5) + padL('spd', 5) + padL('sup', 4) + '  role');
  for (const r of rows) {
    console.log('  ' + pad(r.type, 12) + padL(r.cost, 5) + padL(r.hp, 5) + padL(r.dmg, 5) + padL(r.cd, 5)
      + padL(r.dps, 6) + padL(r.dpsCost, 7) + padL(r.ehpCost, 6) + padL(r.cv, 6) + padL(r.cvCost, 7) + padL(r.cv5, 7)
      + padL(r.range, 5) + padL(r.speed, 5) + padL(r.supply, 4) + '  ' + r.role);
  }
}

/* ---- whole-roster dump ---- */
if (table) {
  const rows = rosterRows();
  for (const tier of TIER_ORDER) {
    const list = (BUILD_HIRES && BUILD_HIRES[tier]) || [];
    const tr = rows.filter(r => list.includes(r.type));
    if (tr.length) printTable(tr, `Tier: ${tier}  (producer cost ${DEF[tier] ? DEF[tier].cost : '?'})`);
  }
  const orphan = rows.filter(r => !producerOf(r.type));
  if (orphan.length) printTable(orphan, 'Untrained (no producer in BUILD_HIRES)');
  process.exit(0);
}

/* ---- single-unit check (existing type or draft) ---- */
let target, producer;
if (draft) {
  if (!draft.cost || !draft.hp) { console.error('✗ --draft needs at least { cost, hp, dmg, cd, ... }'); process.exit(1); }
  target = metrics(draft.type || 'DRAFT', draft);
  producer = producerArg || producerOf(draft.type) || guessProducer(draft);
} else if (type) {
  if (!DEF[type]) { console.error(`✗ unknown unit '${type}'. Known: ${rosterRows().map(r => r.type).join(', ')}`); process.exit(1); }
  target = metrics(type, DEF[type]);
  producer = producerArg || producerOf(type) || guessProducer(DEF[type]);
} else {
  console.error('usage: balance-check.js <type> | --draft \'<json>\' [--producer barracks] | --table');
  process.exit(1);
}

function guessProducer(d) {
  if (d.air) return 'launchpad';
  if (d.vehicle || d.cost > 150 || (d.supply || 0) >= 3) return 'garage';
  return 'barracks';
}

/* peers = other units trained by the same producer */
const peerTypes = ((BUILD_HIRES && BUILD_HIRES[producer]) || []).filter(t => t !== target.type && DEF[t]);
const peers = peerTypes.map(t => metrics(t, DEF[t]));
const rows = rosterRows();
const rosterMaxCv = Math.max(...rows.filter(r => r.type !== target.type).map(r => r.cv));
const rosterMaxCvUnit = rows.find(r => r.cv === rosterMaxCv);

printTable([target, ...peers], `Unit vs ${producer} tier peers  (producer cost ${DEF[producer] ? DEF[producer].cost : '?'})`);

/* ---- advisory flags ---- */
const flags = [];
const combatPeers = peers.filter(p => !p.healer);
if (!target.healer && combatPeers.length) {
  const maxDpsCost = Math.max(...combatPeers.map(p => p.dpsCost));
  const maxEhpCost = Math.max(...combatPeers.map(p => p.ehpCost));
  const minCvCost = Math.min(...combatPeers.map(p => p.cvCost));
  const maxCvCost = Math.max(...combatPeers.map(p => p.cvCost));
  if (target.dpsCost > maxDpsCost * 1.05 && target.ehpCost > maxEhpCost * 1.05)
    flags.push(`DOMINANT: beats every ${producer} peer on BOTH dps/cost and hp/cost — give it a real weakness (raise cost, cut range/speed/durability) so it trades off like the others.`);
  if (target.cvCost > maxCvCost * 1.3)
    flags.push(`OVERPOWERED for cost: cv/cost ${target.cvCost} is >1.3× the best peer (${maxCvCost}). Raise cost or trim hp/dmg.`);
  if (target.cvCost < minCvCost * 0.7)
    flags.push(`UNDERPOWERED for cost: cv/cost ${target.cvCost} is <0.7× the weakest peer (${minCvCost}). Lower cost or buff a stat, or it's dead weight.`);
}
if (target.cv > rosterMaxCv && target.cost < (DEF[rosterMaxCvUnit.type] ? DEF[rosterMaxCvUnit.type].cost : Infinity))
  flags.push(`CARRYOVER RUNAWAY RISK: cv ${target.cv} tops the whole roster (was ${rosterMaxCvUnit.type} ${rosterMaxCv}) yet is cheaper — a level-5 veteran (cv@5 ${target.cv5}) would outclass everything. Match the cost/supply of capital units (founder/bomber) or pull stats down. Confirm with simulate_balance.js --gate.`);
/* supply sanity vs combat value */
const expSupply = target.cv < 4 ? 1 : target.cv < 9 ? 2 : target.cv < 14 ? 3 : 6;
if (!target.healer && Math.abs((target.supply || 1) - expSupply) >= 2)
  flags.push(`SUPPLY mismatch: cv ${target.cv} suggests supply ~${expSupply}, but it's ${target.supply}. Low supply on a strong unit lets the player spam it; high supply on a weak one makes it not worth the cap.`);
if ((target.range || 0) > 2 && (target.dmg || 0) > 0)
  flags.push(`RANGED (range ${target.range} > 2): needs a MUZZLE[${target.type}] entry — run the muzzle calibrator (Phase 6). Until then it fires from MUZZLE_FALLBACK.`);
if (producer === 'launchpad' && !(BUILD_HIRES && BUILD_HIRES.garage))
  flags.push(`PREREQ: launchpad units require a Garage first — make sure ui.js gates the Launch Pad on hasFinished('garage').`);
/* antiAir coverage hint */
if (!rows.some(r => DEF[r.type] && DEF[r.type].antiAir) && !DEF[target.type]?.antiAir)
  flags.push(`AIR COVERAGE: no unit in the roster has antiAir — consider giving one tier (often this unit) antiAir so air can be contested.`);

console.log('\nProducer / prerequisite:  ' + producer + (producer === 'launchpad' ? '  (requires Garage)' : ''));
console.log('Flags:');
if (!flags.length) console.log('  ✓ within the tier envelope — no balance flags. Still confirm on a map with simulate_balance.js --gate.');
else for (const f of flags) console.log('  ⚠ ' + f);
console.log('');
