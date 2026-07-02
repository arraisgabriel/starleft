#!/usr/bin/env node
/* validate_campaign.js — campaign-level coherence & schema checks for STARLEFT maps.
 *
 * Complements _dev/verify_maps.js: that script runs the REAL generator and proves geometry
 * (reachability, determinism, no orphan/island tiles). THIS script checks the things that live
 * above the geometry — the data schema and the narrative bookkeeping that keeps the campaign
 * coherent after you add or insert a map:
 *   • required fields present and well-typed
 *   • Roman numerals + EPISODE labels are sequential and aligned to array order (renumbering)
 *   • seeds unique across all maps
 *   • every authored coordinate is on-map (0..w-1, 0..h-1)
 *   • terrain.biomes use only known biome kinds
 *   • enemyName actually appears in the crawl and objective (cohesion)        [warn]
 *   • placed enemy count is reflected by a number in the objective            [warn]
 *   • crawl.summary present for the M.D.C. dispatch briefing (2–4 sentences)  [warn]
 *
 * Usage:  node .claude/skills/starleft-mapmaker/scripts/validate_campaign.js [repoRoot]
 * Exit:   0 if no hard errors (warnings allowed), 1 if any hard error.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

/* ---- locate the repo root (folder containing js/config.js) ---- */
function findRoot() {
  if (process.argv[2] && fs.existsSync(path.join(process.argv[2], 'js', 'config.js')))
    return path.resolve(process.argv[2]);
  const guesses = [path.resolve(__dirname, '..', '..', '..', '..'), process.cwd()];
  for (let g of guesses) {
    let d = g;
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(d, 'js', 'config.js'))) return d;
      const up = path.dirname(d); if (up === d) break; d = up;
    }
  }
  return null;
}
const ROOT = findRoot();
if (!ROOT) { console.error('✗ could not find js/config.js (pass the repo root as an argument)'); process.exit(1); }

/* ---- load config.js in a stubbed sandbox and pull out MAPS ---- */
function loadMaps(root) {
  const noop = () => {};
  const sandbox = {
    Math, Array, Object, JSON, Uint8Array, Float32Array, Map, Set, String, Number, Boolean,
    isFinite, parseInt, parseFloat, console,
    document: { getElementById: () => ({ style: {}, getContext: () => new Proxy({}, { get: () => noop }) }) },
    innerWidth: 1280, innerHeight: 800,
  };
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
try { MAPS = loadMaps(ROOT); }
catch (e) { console.error('✗ failed to evaluate js/config.js:', e.message); process.exit(1); }
if (!Array.isArray(MAPS)) { console.error('✗ MAPS array not found in js/config.js'); process.exit(1); }

/* ---- helpers ---- */
const VALID_BIOMES = new Set(['grass', 'desert', 'ice', 'tech', 'volcanic', 'interior']);   // interior = the authored interior tileset (docs/interior-tilesets.md, CLIMATE.interior)
const NUM_WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen'];
function toRoman(n) {
  const t = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let s = ''; for (const [v, sym] of t) while (n >= v) { s += sym; n -= v; } return s;
}

let errors = 0, warnings = 0;
const err  = (i, m) => { errors++;   console.log(`  ✗ [map ${i}] ${m}`); };
const warn = (i, m) => { warnings++; console.log(`  ⚠ [map ${i}] ${m}`); };
const seedSeen = new Map();

console.log(`\nValidating ${MAPS.length} map(s) in ${path.relative(process.cwd(), path.join(ROOT, 'js', 'config.js')) || 'js/config.js'}\n`);

let linearN = 0;   // running count of NON-villain (linear) maps → drives episode numbering (villains are appended out-of-line)
for (let i = 0; i < MAPS.length; i++) {
  const m = MAPS[i] || {};

  /* required scalar fields */
  if (typeof m.name !== 'string' || !m.name) err(i, 'missing `name`');
  if (typeof m.enemyName !== 'string' || !m.enemyName) err(i, 'missing `enemyName`');
  if (typeof m.objective !== 'string' || !m.objective) err(i, 'missing `objective`');
  if (!Number.isFinite(m.w) || m.w <= 0) err(i, '`w` must be a positive number');
  if (!Number.isFinite(m.h) || m.h <= 0) err(i, '`h` must be a positive number');
  if (!Number.isFinite(m.seed)) err(i, '`seed` must be a number');

  /* crawl block */
  if (!m.crawl || typeof m.crawl !== 'object') err(i, 'missing `crawl` block');
  else {
    if (typeof m.crawl.episode !== 'string') err(i, 'missing `crawl.episode`');
    if (typeof m.crawl.title !== 'string') err(i, 'missing `crawl.title`');
    if (typeof m.crawl.text !== 'string' || !m.crawl.text) err(i, 'missing `crawl.text`');
    /* deployment summary (M.D.C. briefing) — warn-only: legacy maps fall back to crawl.text */
    if (m.crawl.summary == null || m.crawl.summary === '')
      warn(i, 'missing `crawl.summary` — the M.D.C. dispatch screen will fall back to the crawl text; write a 2–4 sentence spoiler-free briefing');
    else if (typeof m.crawl.summary !== 'string')
      err(i, '`crawl.summary` must be a string');
    else if (m.crawl.summary.trim().length < 60)
      warn(i, `crawl.summary is very short (${m.crawl.summary.trim().length} chars) — aim for a 2–4 sentence briefing`);
  }

  /* sequence: Roman numeral in name + episode label must match array position.
     Grab the maximal leading run of Roman-numeral letters and compare exactly — robust to the
     "—"/" "/"-" that follows, and avoids word-boundary edge cases.
     VILLAIN maps (isVillain) are APPENDED past the linear campaign with non-numeric display labels
     ("Boss 7.5"/"EPISODE 7.5"), so they are exempt from the index↔Roman-numeral sequencing check. */
  if (!m.isVillain) {
    linearN++;                          // Nth linear map → episode N; villains are appended and skipped
    const roman = toRoman(linearN);
    if (typeof m.name === 'string') {
      const lead = (m.name.trim().match(/^[IVXLCDM]+/) || [null])[0];
      if (lead !== roman)
        err(i, `name "${m.name}" should start with Roman numeral "${roman}" (linear episode ${linearN}, array position ${i})`);
    }
    if (m.crawl && typeof m.crawl.episode === 'string' && m.crawl.episode.trim() !== `EPISODE ${roman}`)
      err(i, `crawl.episode "${m.crawl.episode}" should be "EPISODE ${roman}"`);
  }

  /* unique seed */
  if (Number.isFinite(m.seed)) {
    if (seedSeen.has(m.seed)) err(i, `seed ${m.seed} duplicates map ${seedSeen.get(m.seed)} — each map needs a unique seed`);
    else seedSeen.set(m.seed, i);
  }

  /* biomes */
  const biomes = (m.terrain && m.terrain.biomes) || [];
  if (m.terrain && !Array.isArray(biomes)) err(i, 'terrain.biomes must be an array');
  else for (const b of biomes) if (!VALID_BIOMES.has(b))
    err(i, `unknown biome "${b}" (valid: ${[...VALID_BIOMES].join(', ')})`);

  /* coordinate bounds — every authored point must be on-map */
  const W = m.w, H = m.h;
  const inBounds = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= W - 1 && y <= H - 1;
  const checkPt = (label, p) => { if (!p) return; if (!inBounds(p.x, p.y)) err(i, `${label} (${p.x},${p.y}) is off-map (must be 0..${W - 1} × 0..${H - 1})`); };
  const checkList = (label, arr) => { if (Array.isArray(arr)) arr.forEach((p, k) => checkPt(`${label}[${k}]`, p)); };

  if (Number.isFinite(W) && Number.isFinite(H)) {
    if (!m.player) err(i, 'missing `player` start'); else checkPt('player', m.player);
    const bases = Array.isArray(m.enemies) ? m.enemies : (m.enemy ? [m.enemy] : []);
    // BOSS arenas have NO enemy bases by design — the boss is the encounter (cfg.villain → villains.js).
    // This holds for appended VILLAIN interludes AND for LINEAR boss episodes (e.g. Ep XIII = the REX
    // duel: a non-villain map carrying `villain:{…}` + `finale`). Appended SIDE MISSIONS instead win by
    // an alt verb (cfg.winCondition: survive / escort / reachAndHold — core.js checkAltWin). REQUIRED
    // quests are ALSO a win source (js/quests.js drives victory on every map — e.g. Ep XVI heroEscape
    // wins on its required reclaimOutposts/collectMemories quests with no bases/villain/winCondition).
    const requiredQuest = Array.isArray(m.quests) && m.quests.some(q => q && q.required);
    if (!bases.length && !m.isVillain && !m.villain && !m.winCondition && !requiredQuest) err(i, 'no win source — need `enemies:[...]`, a `villain:{ id, x, y }` duel, a `winCondition:{type,…}`, or a required quest');
    else if (m.isVillain && !m.villain && !m.winCondition) err(i, 'gated map needs a `villain:{ id, x, y }` block or a `winCondition:{type,…}`');
    if (m.winCondition){
      const wc = m.winCondition, types = ['survive', 'escort', 'reachAndHold', 'razeAll'];
      if (!types.includes(wc.type)) err(i, `winCondition.type "${wc.type}" unknown (expected ${types.join('|')})`);
      if (wc.type === 'escort' && !wc.to) err(i, 'escort winCondition needs `to:{x,y}`');
      if (wc.type === 'reachAndHold' && !wc.at) err(i, 'reachAndHold winCondition needs `at:{x,y}`');
      if (wc.to) checkPt('winCondition.to', wc.to);
      if (wc.at) checkPt('winCondition.at', wc.at);
      if (wc.type === 'survive' && !(wc.forSec > 0)) err(i, 'survive winCondition needs `forSec` > 0');
    }
    checkList('enemies', bases);
    if (!Array.isArray(m.goldNodes) || !m.goldNodes.length) err(i, 'no `goldNodes`');
    else { checkList('goldNodes', m.goldNodes); m.goldNodes.forEach((g, k) => { if (!Number.isFinite(g.amt)) err(i, `goldNodes[${k}] missing numeric \`amt\``); }); }
    checkList('lakes', m.lakes);
    checkList('rockClusters', m.rockClusters);
    checkList('forests', m.forests);
    checkList('lostBases', m.lostBases);

    /* cohesion (warnings) */
    const bn = (m.enemyName || '').toLowerCase();
    if (bn && typeof m.crawl?.text === 'string' && !m.crawl.text.toLowerCase().includes(bn))
      warn(i, `enemyName "${m.enemyName}" never appears in the crawl text`);
    if (bn && typeof m.objective === 'string' && !m.objective.toLowerCase().includes(bn))
      warn(i, `enemyName "${m.enemyName}" never appears in the objective`);

    const n = bases.length;
    const obj = (m.objective || '').toLowerCase();
    const word = NUM_WORDS[n];
    if (!m.isVillain && typeof m.objective === 'string' && !(obj.includes(String(n)) || (word && obj.includes(word))))
      warn(i, `objective does not mention the enemy-base count (${n}/"${word}") — verify it matches the ${n} placed bases`);
  }
}

console.log(`\n${errors === 0 ? '✅' : '❌'} ${errors} error(s), ${warnings} warning(s) across ${MAPS.length} map(s).`);
if (errors === 0) console.log('   (Now run `node _dev/verify_maps.js` for geometry / reachability / determinism.)');
process.exit(errors ? 1 : 0);
