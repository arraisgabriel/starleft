#!/usr/bin/env node
/* simulate_balance.js — balance check for STARLEFT maps, accounting for CAREER UNITS the player
 * carries between episodes (the thing the static difficulty table can't see).
 *
 * Two tiers:
 *  1) MANDATORY deterministic power-ratio gate (--gate): no RNG, instant. Computes player combat
 *     power (economy-buildable army + carried veterans × their career multipliers) vs the enemy's
 *     defensive power AFTER the always-on js/balance.js vetScaling has added carry-scaled defenders,
 *     for three carry profiles (fresh/typical/invested). Hard-fails only on position-independent
 *     bugs (unwinnable, or carryover outrunning vetScaling), judged against the shipping campaign's
 *     own measured envelope. Drives the exit code.
 *  2) ADVISORY auto-player (--play): a scripted bot plays the map and only flags ABSURD outcomes
 *     (a base nothing can crack; a fresh faceroll). Never affects pass/fail — the bot is a heuristic,
 *     not a champion, and deliberately kept out of the gate.
 *
 * Usage:
 *   node .../simulate_balance.js <mapIndex> --gate            # mandatory deterministic gate
 *   node .../simulate_balance.js <mapIndex> --gate --play     # + advisory bot
 *   node .../simulate_balance.js --calibrate                  # dump power ratios for every map
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

/* ----------------------------- args ----------------------------- */
const argv = process.argv.slice(2);
let mapIdx = null, gate = false, play = false, calibrate = false, rootArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--gate') gate = true;                 // exit nonzero if the deterministic power gate fails
  else if (a === '--play') play = true;            // also run the auto-player ADVISORY (absurd-only)
  else if (a === '--calibrate') calibrate = true;  // dump power ratios for every map (threshold tuning)
  else if (/^\d+$/.test(a) && mapIdx === null) mapIdx = parseInt(a, 10);
  else rootArg = a;
}

function findRoot(arg) {
  if (arg && fs.existsSync(path.join(arg, 'js', 'config.js'))) return path.resolve(arg);
  const guesses = [path.resolve(__dirname, '..', '..', '..', '..'), process.cwd()];
  for (let g of guesses) { let d = g; for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, 'js', 'config.js'))) return d;
    const up = path.dirname(d); if (up === d) break; d = up; } }
  return null;
}
const ROOT = findRoot(rootArg);
if (!ROOT) { console.error('✗ could not find js/config.js (pass repo root as an argument)'); process.exit(1); }

/* ----------------------- engine bootstrap ----------------------- */
// Fresh sandbox with the full runtime loaded; rebuilt per state so module-global engine state
// (carryoverVets, fallenVets, _dossierCache, mapIndex) never leaks between measurements.
function bootstrap() {
  const noop = () => {};
  const ctxStub = new Proxy({}, { get: () => noop });
  const fakeEl = new Proxy({ style:{}, getContext:()=>ctxStub, getBoundingClientRect:()=>({left:0,top:0,width:300,height:150}),
    width:300, height:150, appendChild:noop, setAttribute:noop, addEventListener:noop, classList:{add:noop,remove:noop,toggle:noop} },
    { get:(t,p)=> (p in t ? t[p] : noop) });
  function ImageStub(){ this._src=''; }
  Object.defineProperty(ImageStub.prototype,'src',{ get(){return this._src;}, set(v){this._src=v;} });
  const s = { innerWidth:1280, innerHeight:800, Math, Array, Object, Uint8Array, Map, Set, Float32Array,
    isFinite, parseInt, parseFloat, console, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    location:{protocol:'file:',href:'',origin:'',search:'',hash:''}, Image:ImageStub, navigator:{userAgent:'node'},
    requestAnimationFrame:noop, cancelAnimationFrame:noop, fetch:()=>Promise.resolve({}),
    localStorage:{getItem:()=>null,setItem:noop,removeItem:noop,clear:noop}, addEventListener:noop, removeEventListener:noop, alert:noop,
    document:{ getElementById:()=>fakeEl, createElement:()=>fakeEl, querySelector:()=>fakeEl, querySelectorAll:()=>[], addEventListener:noop, body:fakeEl },
    performance:{ now:()=>Number(process.hrtime.bigint()/1000n)/1000 } };
  s.window = s; s.globalThis = s; s.window.devicePixelRatio = 1;
  // UI/render hooks the engine calls but whose files we don't load → harmless no-ops.
  for (const k of ['toast','eventToast','refreshUI','syncHud','clampCam','spawnRing','computeFog',
                   'onVictory','onDefeat','render','updateCamera','drawAll','buildMapSelect','showRoster'])
    s[k] = noop;
  vm.createContext(s);
  const FILES = ['js/state.js','js/config.js','js/assets.js','js/megasprites.js','js/units.js',
                 'js/career.js','js/balance.js','js/lore_data.js','js/lore.js','js/ai.js','js/core.js','js/map.js'];
  const src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
    + '\n;globalThis.__api={ newMap, update, MAPS, DEF, CAREER, TILE,'
    + '   setCarryover, resetHeroes, computePlayerVPI, vetScalingBonus, vetCarryCountFor,'
    + '   gatherFrom, tryTrain, placeBuilding, attackTarget, issueMove, canPlaceAt, nearestMine, dist, entRadius,'
    + '   setMapIndex:function(i){mapIndex=i;}, setG:function(g){G=g;} };';
  vm.runInContext(src, s, { filename: 'bundle.js' });
  return s.__api;
}

/* --------------------------- helpers ---------------------------- */
const TICK = 0.05;                 // fixed dt → 20 ticks per game-second
const CAP_MIN = 20;                // hard timeout for the advisory bot: 20 game-minutes
const MACRO_EVERY = 1.0;           // advisory bot macro cadence (game seconds)

let API = null;
const pUnits  = (st) => st.entities.filter(e => !e.dead && e.owner==='player' && e.kind==='unit');
const pWorkers= (st) => pUnits(st).filter(u => u.type==='worker');
const pBuild  = (st,t) => st.entities.filter(e => !e.dead && e.owner==='player' && e.kind==='building' && (!t || e.type===t));
const eBuild  = (st) => st.entities.filter(e => !e.dead && e.owner==='enemy' && e.kind==='building');
function DEFheal(u){ return !!(API.DEF[u.type] && API.DEF[u.type].heal); }
const pCombat  = (st) => pUnits(st).filter(u => u.type!=='worker' && !DEFheal(u));   // attackers (incl. vets/heroes)
const pHealers = (st) => pUnits(st).filter(u => DEFheal(u));

function assaultTargetBase(st, from) {                  // nearest enemy HQ (or any building if none)
  const hqs = eBuild(st).filter(e=>e.type==='hq');
  const pool = hqs.length ? hqs : eBuild(st);
  let best=null, bd=Infinity;
  for (const e of pool) { const d=(e.x-from.x)**2+(e.y-from.y)**2; if(d<bd){bd=d;best=e;} }
  return best;
}
function freeTileNear(st, cx, cy, type) {
  for (let r=2; r<=10; r++) for (let dy=-r; dy<=r; dy++) for (let dx=-r; dx<=r; dx++) {
    if (Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
    if (API.canPlaceAt(st, type, cx+dx, cy+dy)) return {tx:cx+dx, ty:cy+dy};
  }
  return null;
}

/* ---------------------- carry profiles -------------------------- */
// Carry records {type,stars,xp} for a profile entering a map: fresh = none; typical = a player who
// fought but didn't grind; invested = a leveled squad (the steamroll case).
function carryRoster(api, idx, profile) {
  if (profile === 'fresh') return [];
  const cap = api.vetCarryCountFor(idx);
  const lvl = profile === 'typical' ? Math.max(1, Math.min(30, 2 + idx))
                                    : Math.max(1, Math.min(30, 8 + Math.floor(idx/2)));
  const mix = ['soldier','soldier','ranger','soldier','recruiter','soldier'];
  const out = [];
  for (let i=0; i<cap; i++) out.push({ type: mix[i % mix.length], stars:lvl, xp: api.CAREER.xpFor(lvl) });
  return out;
}
function vpiOf(api, st) { return Math.round(api.computePlayerVPI(st)); }

/* ============================================================================
 * DETERMINISTIC POWER MODEL  (drives the mandatory gate)
 * ========================================================================== */
// Per-unit combat value = effective-HP × DPS with career multipliers, scaled to readable numbers.
function cvType(api, type, level) {
  const d = api.DEF[type]; if (!d) return 0;
  const L = level || 0;
  if (d.heal) return (d.heal * (1 + api.CAREER.hpPerStar * L)) * 0.9 / 10;     // support ≈ damage mitigated/s
  if (!(d.dmg > 0)) return 0;
  const hp = d.hp * (1 + api.CAREER.hpPerStar * L);
  const dps = (d.dmg / (d.cd || 1)) * (1 + api.CAREER.dmgPerStar * L);
  return hp * dps / 1000;
}
function cvUnit(api, u) {
  const d = api.DEF[u.type]; if (!d) return 0;
  const L = u.stars || 0;
  if (d.heal) return (d.heal * (1 + api.CAREER.hpPerStar * L)) * 0.9 / 10;
  if (!(d.dmg > 0)) return 0;
  const hp = u.maxHp || d.hp;
  const dps = (d.dmg / (d.cd || 1)) * (1 + api.CAREER.dmgPerStar * L);
  return hp * dps / 1000;
}
function cvBuilding(api, e) {
  const d = api.DEF[e.type]; if (!d) return 0;
  let v = 0;
  if (d.dmg > 0) v += (e.maxHp || d.hp) * (d.dmg / (d.cd || 1)) / 1000;        // defensive fire + HP sink
  if (e.type==='barracks' || e.type==='garage' || e.type==='launchpad') v += 4;  // production sustain
  return v;
}

function buildState(idx, profile) {
  const api = bootstrap(); API = api;
  api.setMapIndex(idx);
  api.setCarryover(carryRoster(api, idx, profile));
  api.resetHeroes();
  return { api, st: api.newMap(idx) };
}

// Economy-buildable army a competent player sustains: supply-capped (1 HQ = 24, modest expansion on
// bigger maps), funded by the map's gold. Near-constant by design — difficulty differentiation lives
// on the ENEMY side, which is correct.
function economyArmyValue(api, idx) {
  const cfg = api.MAPS[idx];
  const nBases = Math.max(1, (cfg.enemies||[cfg.enemy]).filter(Boolean).length);
  const goldTotal = (cfg.startGold||300) + (cfg.goldNodes||[]).reduce((a,g)=>a+(g.amt||0),0) * 0.5; // ~half reachable
  const affordable = goldTotal / api.DEF.soldier.cost;
  const supplyCeil = 20 + 3 * nBases;
  return Math.min(affordable, supplyCeil) * cvType(api, 'soldier', 0);
}

let _gateApi = null;   // the last bootstrapped api — powerGate reads MAPS[idx] through it
function powerProfile(idx, profile) {
  const { api, st } = buildState(idx, profile);
  _gateApi = api;
  let field = 0;
  for (const e of st.entities) {
    if (e.dead || e.owner!=='player' || e.kind!=='unit') continue;
    field += cvUnit(api, e);
  }
  const econ = economyArmyValue(api, idx);
  const player = field + econ;

  const aggr = st.cfg.aggression || 1;
  const nBases = Math.max(1, st.entities.filter(e=>!e.dead && e.owner==='enemy' && e.type==='hq').length);
  let enemy = 0;
  for (const e of st.entities) {
    if (e.dead || e.owner!=='enemy') continue;
    if (e.kind==='building') enemy += cvBuilding(api, e);
    else if (e.kind==='unit') enemy += cvUnit(api, e);
  }
  enemy += nBases * Math.round(1 + aggr*2) * cvType(api,'turret',0) * 0.6;     // fortification it WILL build
  const eProd = st.entities.filter(e=>!e.dead && e.owner==='enemy' && (e.type==='barracks'||e.type==='garage')).length;
  enemy += eProd * aggr * 3;                                                    // production sustain

  return { vpi: vpiOf(api, st), player, field, econ, enemy, ratio: player/Math.max(0.01,enemy), nBases };
}

/* CALIBRATION ANCHOR — the absolute ratio is arbitrary to this model's formula, so thresholds are
 * derived from the SHIPPING maps (0..6), which are known well-tuned. These are the model's measured
 * ratios for them (regenerate with --calibrate if engine stats change). Shipping `typical` ratio
 * legitimately DECLINES across the arc — that decline IS the difficulty curve — and shipping `swing`
 * (invested÷fresh) sits ~1.3–1.8. So the mandatory gate fails only OUTSIDE that envelope; "tuned for
 * its exact slot" is a curve-relative ADVISORY, never a hard fail (a deliberately-easy restart map
 * must be allowed). */
const SHIP_TYPICAL = [0.74, 0.53, 0.42, 0.41, 0.32, 0.37, 0.28];   // measured typical ratio, maps 0..6
const SHIP_SWING   = [1.32, 1.39, 1.39, 1.51, 1.55, 1.79, 1.63];   // measured invested÷fresh, maps 0..6
const MIN_SHIP_TYPICAL = Math.min(...SHIP_TYPICAL);                 // 0.28 (hardest shipped)
const MAX_SHIP_SWING   = Math.max(...SHIP_SWING);                   // 1.79
const WINNABLE_FLOOR = 0.5 * MIN_SHIP_TYPICAL;   // ≈0.14 — below = harder than anything shipped ⇒ unwinnable
const SWING_CEILING  = 1.4 * MAX_SHIP_SWING;     // ≈2.5 — above = carryover egregiously outruns vetScaling
function expectedRatio(idx){ return SHIP_TYPICAL[Math.min(idx, SHIP_TYPICAL.length-1)]; }

function powerGate(idx) {
  const profs = { fresh:powerProfile(idx,'fresh'), typical:powerProfile(idx,'typical'), invested:powerProfile(idx,'invested') };
  const fails = [], notes = [];
  const t = profs.typical, f = profs.fresh, v = profs.invested;
  const swing = v.ratio / Math.max(0.01, f.ratio);

  // NON-RAZE missions (boss arenas via cfg.villain; survive/escort/reachAndHold via cfg.winCondition):
  // the player-army-vs-enemy-BASE ratio this model computes is not the win condition — their pressure
  // lives in boss stats / wave timers / guards the model can't see. The ratio stays ADVISORY only.
  // (The shipped boss maps 13/14 predate this and never passed the raze-model gate either.)
  const m = (_gateApi && _gateApi.MAPS[idx]) || {};
  const nonRaze = !!(m.villain || (m.winCondition && m.winCondition.type && m.winCondition.type !== 'razeAll'));
  if (nonRaze) {
    notes.push(`non-raze mission (${m.villain ? 'boss arena' : m.winCondition.type}) — power ratio is advisory; tune via boss stats / waves / timers and play-test`);
    notes.push(`carryover swing ${swing.toFixed(2)}× · typical ratio ${t.ratio.toFixed(2)} (raze-model numbers, for reference only)`);
    return { profs, fails, notes };
  }

  // HARD FAILS — genuine bugs, judged against the shipping envelope (not an absolute number):
  if (t.ratio < WINNABLE_FLOOR)
    fails.push(`typical ratio ${t.ratio.toFixed(2)} < ${WINNABLE_FLOOR.toFixed(2)} (½ the hardest shipping map) — too hard / likely unwinnable for normal play`);
  if (v.ratio < WINNABLE_FLOOR)
    fails.push(`invested ratio ${v.ratio.toFixed(2)} < ${WINNABLE_FLOOR.toFixed(2)} — even a carried roster can't win; far too hard`);
  if (swing > SWING_CEILING)
    fails.push(`carryover run-away: invested is ${swing.toFixed(2)}× fresh's ratio (> ${SWING_CEILING.toFixed(2)}) — carried veterans outrun vetScaling; raise enemy pressure or VET_SCALE/maxBonus in js/balance.js`);

  // ADVISORY NOTES — curve-relative / design-dependent; never fail the gate:
  notes.push(`carryover swing ${swing.toFixed(2)}× (shipping 1.3–1.8) — vetScaling grew the enemy ${(v.enemy/f.enemy).toFixed(2)}× to absorb it` + (swing<=1.05 ? '; fully offset — lower VET_SCALE if you want investing to still feel rewarding' : ''));
  const exp = expectedRatio(idx), rel = t.ratio/exp;
  if (rel > 2.0)      notes.push(`typical ratio ${t.ratio.toFixed(2)} is ${rel.toFixed(1)}× the shipping curve's ${exp.toFixed(2)} at slot ${Math.min(idx,6)} — easier than its arc position (fine if intentional, e.g. a restart map)`);
  else if (rel < 0.5) notes.push(`typical ratio ${t.ratio.toFixed(2)} is ${rel.toFixed(2)}× the shipping curve's ${exp.toFixed(2)} — harder than its arc position`);
  if (f.ratio < WINNABLE_FLOOR) notes.push(`fresh ratio ${f.ratio.toFixed(2)} is very low — a no-carryover player likely can't win; OK if this map assumes carryover`);
  return { profs, fails, notes };
}

/* ============================================================================
 * ADVISORY AUTO-PLAYER  (--play; absurd-only, never gates)
 * ========================================================================== */
const STRATEGIES = {
  rush:     { mix:{soldier:1.0},                            nbar:3, tech:'barracks' },
  ranged:   { mix:{ranger:0.55, soldier:0.45},              nbar:3, tech:'barracks' },
  healball: { mix:{soldier:0.75, recruiter:0.25},           nbar:3, tech:'barracks' },
  vehicle:  { mix:{soldier:0.5, foodtruck:0.3, auditor:0.2},nbar:2, tech:'garage' },
};
const STRAT_NAMES = Object.keys(STRATEGIES);

function pickType(mix, st) {
  const army = pCombat(st), total = Math.max(1, army.length);
  let bestType=null, bestGap=-1e9;
  for (const [type,w] of Object.entries(mix)) {
    const have = army.filter(u=>u.type===type).length / total;
    if (w - have > bestGap) { bestGap = w - have; bestType = type; }
  }
  return bestType || 'soldier';
}
function idleWorker(st){ return pWorkers(st).find(u => !u.cmd || u.cmd.type==='gather'); }

function autoPlayer(api, st, strat) {
  const DEF = api.DEF, TILE = api.TILE;
  const hq = pBuild(st,'hq')[0]; if (!hq) return;
  const nodes = st.entities.filter(e=>!e.dead && e.type==='goldmine').length;
  const nEnemyBases = Math.max(1, st.entities.filter(e=>!e.dead && e.owner==='enemy' && e.type==='hq').length);
  const wTarget = Math.min(10, Math.max(6, nodes));

  for (const w of pWorkers(st)) if (!w.cmd || (w.cmd.type!=='gather' && w.cmd.type!=='build')) { const m=api.nearestMine(st,w); if(m) api.gatherFrom(st,w,m); }
  const wq = (hq.prodQueue||[]).filter(t=>t==='worker').length;
  const needWorkers = pWorkers(st).length + wq < wTarget;
  if (needWorkers && st.gold >= DEF.worker.cost) api.tryTrain(st, hq, 'worker');
  const armyGold = needWorkers ? st.gold - DEF.worker.cost : st.gold;

  // supply expansion: extra HQs (free, build-time only) so the army isn't capped at ~24
  if (st.supply >= (st.supplyCap||24)-4 && pBuild(st,'hq').length < 3 && !pBuild(st,'hq').some(b=>b.constructing)) {
    const w = idleWorker(st); if (w) { const sp=freeTileNear(st,hq.tx,hq.ty,'hq'); if(sp) api.placeBuilding(st,'hq',sp.tx,sp.ty,w); }
  }
  const bars = pBuild(st,'barracks');
  if (bars.length < strat.nbar && st.gold >= DEF.barracks.cost+40) { const w=idleWorker(st); if(w){ const sp=freeTileNear(st,hq.tx,hq.ty,'barracks'); if(sp) api.placeBuilding(st,'barracks',sp.tx,sp.ty,w); } }
  if (strat.tech==='garage' && bars.some(b=>!b.constructing) && !pBuild(st,'garage').length && st.gold >= DEF.garage.cost+40) { const w=idleWorker(st); if(w){ const sp=freeTileNear(st,hq.tx,hq.ty,'garage'); if(sp) api.placeBuilding(st,'garage',sp.tx,sp.ty,w); } }

  for (const b of [...pBuild(st,'barracks'), ...pBuild(st,'garage')]) {
    if (b.constructing || (b.prodQueue?b.prodQueue.length:0) >= 1 || st.supply >= st.supplyCap) continue;
    let type = pickType(strat.mix, st);
    if (b.type==='garage') { if (type!=='foodtruck' && type!=='auditor') type='foodtruck'; }
    else if (type==='foodtruck' || type==='auditor') type='soldier';
    if (armyGold >= DEF[type].cost) api.tryTrain(st, b, type);
  }

  // mass → assault. Hold near HQ until a real army, then force the ball onto the nearest perimeter
  // building (peel the wall before the HQ) so it sieges instead of feeding piecemeal.
  const haveProd = pBuild(st,'barracks').some(b=>!b.constructing) || pBuild(st,'garage').some(b=>!b.constructing);
  const army = pCombat(st);
  const supplyArmyMax = Math.max(6, (st.supplyCap||24) - wTarget - 1);
  const commitBar = Math.max(10, Math.min(supplyArmyMax-1, 12 + 3*nEnemyBases));
  const supplyFull = st.supply >= (st.supplyCap||24)-2;
  st._phase = st._phase || 'mass';
  if (st._phase==='mass' && haveProd && (army.length >= commitBar || (supplyFull && army.length >= 8))) st._phase='assault';
  if (st._phase==='assault' && army.length <= 3) st._phase='mass';
  const base = assaultTargetBase(st, hq);
  if (st._phase==='mass' || !base) {
    for (const u of army) {
      const away = (u.x-hq.x)**2+(u.y-hq.y)**2 > (7*TILE)**2;
      const busy = (u.cmd && u.cmd.type==='attack' && u.cmd.target && !u.cmd.target.dead) || (u.autoTarget && !u.autoTarget.dead);
      if (away && !busy) api.issueMove(st, u, hq.x+2*TILE, hq.y+3*TILE, {type:'amove', x:hq.x, y:hq.y});
    }
  } else {
    let cx=0, cy=0; for (const u of army){ cx+=u.x; cy+=u.y; } cx/=army.length; cy/=army.length;
    let focus = st._focus && !st._focus.dead ? st._focus : null;
    if (!focus) {
      const nb = eBuild(st).filter(e=>(e.x-base.x)**2+(e.y-base.y)**2 < (12*TILE)**2);
      const pool = nb.filter(e=>e.type!=='hq'); const pick = (pool.length?pool:nb).length ? (pool.length?pool:nb) : eBuild(st);
      let bd=Infinity; for (const e of pick){ const d=(e.x-cx)**2+(e.y-cy)**2; if(d<bd){bd=d;focus=e;} }
      focus = focus || base; st._focus = focus;
    }
    for (const u of army) { const onFocus=(u.cmd&&u.cmd.type==='attack'&&u.cmd.target===focus); if(!onFocus) api.attackTarget(st,u,focus); }
    for (const h of pHealers(st)) { const moving=h.cmd&&h.cmd.type==='amove'; if(!moving) api.issueMove(st,h,base.x,base.y,{type:'amove',x:base.x,y:base.y}); }
  }
}

function runMatch(idx, profile, stratName) {
  const api = bootstrap(); API = api;
  api.setMapIndex(idx);
  api.setCarryover(carryRoster(api, idx, profile));
  api.resetHeroes();
  const st = api.newMap(idx);
  api.setG(st);
  if (st.explored && st.explored.fill) st.explored.fill(1);   // no fog (computeFog stubbed): full knowledge
  const strat = STRATEGIES[stratName];
  const CAP = Math.round(CAP_MIN * 60 / TICK);
  let t = 0, macroT = 0, peak = 0;
  for (; t < CAP && !st.over; t++) {
    macroT += TICK;
    if (macroT >= MACRO_EVERY) { macroT = 0; try { autoPlayer(api, st, strat); } catch(e){ /* keep simming */ } }
    api.update(st, TICK);
    const a = pCombat(st).length; if (a > peak) peak = a;
  }
  const minutes = (t * TICK) / 60;
  const enemyLeft = eBuild(st).length;
  const playerLeft = pUnits(st).length + pBuild(st).length;
  const result = enemyLeft===0 ? 'WIN' : (playerLeft===0 ? 'LOSS' : 'TIMEOUT');
  return { result, minutes, peak };
}

// flags only ABSURD outcomes; advisory, never affects exit code
function advisoryPlay(idx) {
  const lines = [];
  const oneRun = (profile) => { let best=null;
    for (const strat of STRAT_NAMES) { const r = runMatch(idx, profile, strat);
      if (!best || (r.result==='WIN' && (best.result!=='WIN' || r.minutes<best.minutes))) best = r; }
    return best; };
  const inv = oneRun('invested'), fr = oneRun('fresh');
  if (!(inv && inv.result==='WIN'))
    lines.push(`⚠ even an INVESTED deathball didn't clear in ${CAP_MIN}m (best: ${inv?inv.result:'n/a'}). The power gate may still pass on paper — eyeball the layout for an unreachable/over-walled base. (Auto-player is approximate; not a failure.)`);
  if (fr && fr.result==='WIN' && fr.minutes < 2.5)
    lines.push(`⚠ a FRESH start cleared in ${fr.minutes.toFixed(1)}m (<2.5m) — likely far too easy. (Advisory.)`);
  if (!lines.length)
    lines.push(`no absurdities (invested ${inv?inv.result:'?'}${inv&&inv.result==='WIN'?' '+inv.minutes.toFixed(1)+'m':''}, fresh ${fr?fr.result:'?'}). Approximate — trust the power gate.`);
  return lines;
}

/* ----------------------------- main ----------------------------- */
function main() {
  const api0 = bootstrap();
  const N = api0.MAPS.length;

  if (calibrate) {
    console.log('\nPOWER-RATIO CALIBRATION (player / enemy; higher = easier for the player)');
    console.log('idx  map                          fresh  typical  invested  | enemyF→I  swing');
    console.log('—'.repeat(82));
    for (let i=0;i<N;i++){
      const f=powerProfile(i,'fresh'), t=powerProfile(i,'typical'), v=powerProfile(i,'invested');
      const nm=(api0.MAPS[i].name||'').slice(0,27).padEnd(27);
      console.log(`${String(i).padStart(2)}   ${nm} ${f.ratio.toFixed(2).padStart(5)}  ${t.ratio.toFixed(2).padStart(6)}  ${v.ratio.toFixed(2).padStart(7)}  | ${(v.enemy/f.enemy).toFixed(2)}×    ${(v.ratio/Math.max(0.01,f.ratio)).toFixed(2)}×`);
    }
    console.log('—'.repeat(82));
    console.log(`hard thresholds (from shipping envelope): ratio ≥ ${WINNABLE_FLOOR.toFixed(2)}, swing ≤ ${SWING_CEILING.toFixed(2)}×`);
    return;
  }

  if (mapIdx == null || mapIdx < 0 || mapIdx >= N) {
    console.error(`✗ map index must be 0..${N-1}.`); api0.MAPS.forEach((m,i)=>console.error(`   ${i}: ${m.name}`));
    process.exit(1);
  }
  const cap = api0.vetCarryCountFor(mapIdx);

  const g = powerGate(mapIdx);
  console.log(`\n${api0.MAPS[mapIdx].name}   (carry cap ${cap})`);
  console.log('—'.repeat(72));
  console.log('profile     VPI   field + econ =  player    enemy   ratio');
  for (const p of ['fresh','typical','invested']) {
    const r = g.profs[p];
    console.log(`${p.padEnd(9)} ${String(r.vpi).padStart(4)}   ${r.field.toFixed(1).padStart(5)} + ${r.econ.toFixed(0).padStart(3)} = ${r.player.toFixed(1).padStart(6)}   ${r.enemy.toFixed(1).padStart(6)}   ${r.ratio.toFixed(2).padStart(5)}`);
  }
  console.log('—'.repeat(72));
  console.log(`GATE (hard): typical & invested ratio ≥ ${WINNABLE_FLOOR.toFixed(2)}; carryover swing ≤ ${SWING_CEILING.toFixed(2)}×  (derived from shipping maps)`);
  g.notes.forEach(n=>console.log('  • '+n));
  if (g.fails.length) { g.fails.forEach(f=>console.log('  ✗ '+f)); console.log('\n❌ POWER GATE FAIL'); }
  else console.log('\n✅ POWER GATE PASS');

  if (play) {
    console.log('—'.repeat(72));
    console.log('AUTO-PLAYER ADVISORY (recommendation only — does NOT gate):');
    for (const l of advisoryPlay(mapIdx)) console.log('  ' + l);
  }

  console.log('');
  if (gate) process.exit(g.fails.length ? 1 : 0);
}
main();
