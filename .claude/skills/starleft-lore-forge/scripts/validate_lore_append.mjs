#!/usr/bin/env node
/* validate_lore_append.mjs — the safety gate for a lore-forge content drop. Run from repo root
   AFTER gen_lore.mjs + build_dialog_data.mjs (+ build_voice_manifests.mjs + filter_new_clips.mjs):
     node .claude/skills/starleft-lore-forge/scripts/validate_lore_append.mjs

   It proves the regenerated data is a SAFE, append-only extension of what's committed at git HEAD —
   the property saved games, the index-keyed lore/<voice>_<i>.mp3 clips, and veteran identities all
   depend on — and reports exactly how many NEW voice clips a render will produce. Exit 1 on any
   hard failure (so the skill stops before the voice gate). The checks:

     1. APPEND-ONLY  — HEAD's events / each background pool / LORE_SAY / versions are an unchanged
                       PREFIX of the working copy (nothing reordered, renamed, or deleted).
     2. ALIGNMENT    — LORE_SAY.length === events.length (each event's reaction line is index-locked).
     3. LEGALITY     — every event has a valid req/tone and only fillable slots ({crime}⇒req:'crime').
     4. VERSIONS     — versions rows are non-decreasing per pool, and the last row equals the live
                       pool lengths (so new recruits draw the full pools; old veterans stay frozen).
     5. IDENTITY     — for sample seeds, HEAD's lore.js+data and the working lore.js+data yield
                       byte-identical dossiers for an already-saved (v1/legacy) unit. The freeze.
     6. COVERAGE     — counts the new variable-free lore lines × career voices + new barks, and
                       cross-checks the *_new.json manifests.  */
import fs from 'node:fs';
import path from 'node:path';
import url, { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRoot(start){ let d=start; for(let i=0;i<10;i++){ if(fs.existsSync(path.join(d,'_dev','gen'))&&fs.existsSync(path.join(d,'rts.html'))) return d; const u=path.dirname(d); if(u===d) break; d=u; } return process.cwd(); }
const ROOT = findRoot(HERE);
const GEN  = path.join(ROOT, '_dev', 'gen');

const fails = [], warns = [], notes = [];
const fail = m => fails.push(m), warn = m => warns.push(m), note = m => notes.push(m);

/* ---- load helpers ---- */
const STUB = new Proxy(function(){}, { get:()=>STUB, apply:()=>STUB, construct:()=>STUB, has:()=>false });
function evalGlobals(src, names){
  const sandbox = { console, document:STUB, window:STUB, navigator:STUB, location:STUB, innerWidth:1280, innerHeight:800, devicePixelRatio:1, __OUT:{} };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(src + '\n;' + names.map(n=>`try{__OUT.${n}=${n}}catch(e){}`).join(';'), sandbox);
  return sandbox.__OUT;
}
const makeRngSrc = `function makeRng(seed){ let s=seed*9301+49297; return ()=>{ s=(s*9301+49297)%233280; return s/233280; }; }`;
function loadLore(loreSrc, LORE_DATA){
  const sandbox = { LORE_DATA, console, G:{ runSalt:0 } }; sandbox.globalThis = sandbox;
  vm.runInNewContext(makeRngSrc+'\n'+loreSrc+'\n;globalThis.__API={ensureDossier,buildDossier};', sandbox);
  return sandbox.__API;
}
const read = p => fs.readFileSync(p, 'utf8');
function gitShow(rel){ try { return execSync(`git show HEAD:${rel}`, { cwd:ROOT, stdio:['ignore','pipe','ignore'] }).toString(); } catch(e){ return null; } }

/* ---- working tree ---- */
const W_LD  = evalGlobals(read(path.join(ROOT,'js','lore_data.js')),  ['LORE_DATA']).LORE_DATA;
const W_DD  = evalGlobals(read(path.join(ROOT,'js','dialog_data.js')),['LORE_SAY','SELECT_LINES','HERO_SELECT_LINES']);
const W_loreSrc = read(path.join(ROOT,'js','lore.js'));
const { CAREER_VOICES } = await import(url.pathToFileURL(path.join(GEN,'voice_map.mjs')).href);

/* ---- HEAD (the "before") ---- */
const head_ld_src = gitShow('js/lore_data.js'), head_dd_src = gitShow('js/dialog_data.js'), head_lore_src = gitShow('js/lore.js');
const H_LD = head_ld_src ? evalGlobals(head_ld_src, ['LORE_DATA']).LORE_DATA : null;
const H_DD = head_dd_src ? evalGlobals(head_dd_src, ['LORE_SAY','SELECT_LINES','HERO_SELECT_LINES']) : null;
if(!H_LD) warn('no git HEAD lore_data.js — skipping append-only & identity checks (first commit?).');

const GROW = ['firstNames','namesM','namesF','namesX','surnames','hometowns','family','traumas','dreams','crimes'];
const deepEq = (a,b)=>JSON.stringify(a)===JSON.stringify(b);
function assertPrefix(name, oldA, newA){
  if(!Array.isArray(oldA)) return;
  if(!Array.isArray(newA) || newA.length < oldA.length){ fail(`${name}: working is shorter than HEAD (${newA&&newA.length} < ${oldA.length}) — not append-only`); return; }
  for(let i=0;i<oldA.length;i++) if(!deepEq(oldA[i],newA[i])){ fail(`${name}[${i}] changed vs HEAD — append-only violated\n    HEAD: ${JSON.stringify(oldA[i])}\n    now:  ${JSON.stringify(newA[i])}`); return; }
}

/* ---- 1) APPEND-ONLY vs HEAD ---- */
if(H_LD){
  assertPrefix('events', H_LD.events, W_LD.events);
  for(const k of GROW) assertPrefix(k, H_LD[k], W_LD[k]);
  if(H_LD.versions) assertPrefix('versions', H_LD.versions, W_LD.versions);
  if(H_LD.paras && !deepEq(H_LD.paras, W_LD.paras)) warn('paras changed vs HEAD — allowed but not version-gated; confirm intentional.');
}
if(H_DD && Array.isArray(H_DD.LORE_SAY)) assertPrefix('LORE_SAY', H_DD.LORE_SAY, W_DD.LORE_SAY);

/* ---- 2) ALIGNMENT ---- */
if(W_DD.LORE_SAY.length !== W_LD.events.length)
  fail(`LORE_SAY length ${W_DD.LORE_SAY.length} != events length ${W_LD.events.length} — say lines must stay index-aligned with events (push one say, or null, per new event).`);

/* ---- 3) LEGALITY ---- */
const ALLOWED = new Set(['me','full','home','rel','relName','dream','trauma','crime']);
const TONES = new Set(['neg','pos','neutral']), REQS = new Set(['any','family','trauma','dream','crime']), FX = new Set(['buff','heal','fine','capstone']);
const slotsOf = t => [...String(t).matchAll(/\{(\w+)\}/g)].map(m=>m[1]);
W_LD.events.forEach((e,i)=>{
  if(!REQS.has(e.req)) fail(`events[${i}] bad req '${e.req}'`);
  if(!TONES.has(e.tone)) fail(`events[${i}] bad/missing tone '${e.tone}'`);
  if(e.fx && !FX.has(e.fx.t)) fail(`events[${i}] bad fx.t '${e.fx.t}'`);
  for(const s of slotsOf(e.text)){ if(!ALLOWED.has(s)) fail(`events[${i}] unknown slot {${s}}`); if(s==='crime'&&e.req!=='crime') fail(`events[${i}] {crime} needs req:'crime'`); }
});
{ const seen=new Set(); W_LD.events.forEach((e,i)=>{ if(seen.has(e.text)) fail(`events[${i}] duplicate text (misaligns LORE_SAY): ${e.text}`); seen.add(e.text); }); }

/* ---- 4) VERSIONS ---- */
if(!Array.isArray(W_LD.versions) || !W_LD.versions.length) fail('LORE_DATA.versions missing/empty — gen_lore.mjs should emit at least v1.');
else {
  const last = W_LD.versions[W_LD.versions.length-1];
  for(const k of GROW) if(last[k] !== W_LD[k].length) fail(`versions last row ${k}=${last[k]} != live pool length ${W_LD[k].length}`);
  for(let i=1;i<W_LD.versions.length;i++) for(const k of GROW)
    if((W_LD.versions[i][k]||0) < (W_LD.versions[i-1][k]||0)) fail(`versions[${i}].${k} (${W_LD.versions[i][k]}) < versions[${i-1}].${k} (${W_LD.versions[i-1][k]}) — pools must be append-only (non-decreasing).`);
}

/* ---- 5) IDENTITY FREEZE (HEAD vs working for an already-saved v1/legacy unit) ---- */
if(H_LD && head_lore_src){
  const headAPI = loadLore(head_lore_src, H_LD), workAPI = loadLore(W_loreSrc, W_LD);
  const TYPES = ['soldier','ranger','recruiter','worker','courier','auditor','founder','bomber','hustler','lobbyist','foodtruck'];
  const KEYS = ['first','last','full','home','rel','relName','trauma','dream','crime','familyText'];
  const snap = d => JSON.stringify(KEYS.map(k=>d[k])) + '|' + JSON.stringify(d.paras);
  let mism = 0; const SAMPLE = 300;
  for(let id=1; id<=SAMPLE; id++){
    const t = TYPES[id % TYPES.length];
    // mint under HEAD to get this unit's frozen seed + the version it was saved at.
    const uh = {id, type:t}; headAPI.ensureDossier(uh); const seed = uh.lore.seed;
    // The freeze = a SAVED unit reproduces byte-identically under working code+data. Compare HEAD vs
    // working at the SAME version. (Never v-mint-vs-v1: once a later drop grows a background pool, a
    // freshly-minted v_latest unit SHOULD differ from a v1 legacy one — that divergence is the
    // versioning feature, not drift.) Check both the unit's HEAD mint version and v1 (legacy saves).
    for(const v of new Set([(uh.lore.v|0) || 1, 1])){
      const dH = headAPI.buildDossier({ id, type:t, lore:{ seed, v, events:[] } });
      const dW = workAPI.buildDossier({ id, type:t, lore:{ seed, v, events:[] } });
      if(snap(dH) !== snap(dW)){ mism++; if(mism<=2) fail(`identity drift for saved unit id ${id} (${t}) at v${v} — freeze broken\n    HEAD:    ${snap(dH)}\n    working: ${snap(dW)}`); break; }
    }
  }
  if(!mism) note(`identity freeze: ${SAMPLE}/${SAMPLE} sampled saved units unchanged ✓`);
} else note('identity freeze: skipped (no HEAD lore.js).');

/* ---- 6) VOICE COVERAGE ---- */
const varFree = arr => new Set((arr||[]).map((s,i)=>[s,i]).filter(([s])=>s && String(s).indexOf('{')<0).map(([,i])=>i));
const wFree = varFree(W_DD.LORE_SAY), hFree = H_DD ? varFree(H_DD.LORE_SAY) : new Set();
const newLoreIdx = [...wFree].filter(i => !hFree.has(i));
let newBarks = 0;
for(const [type, lines] of Object.entries(W_DD.SELECT_LINES||{})) newBarks += Math.max(0, lines.length - (H_DD ? ((H_DD.SELECT_LINES||{})[type]||[]).length : lines.length));
let newHero = 0;
for(const [id, lines] of Object.entries(W_DD.HERO_SELECT_LINES||{})) newHero += Math.max(0, lines.length - (H_DD ? ((H_DD.HERO_SELECT_LINES||{})[id]||[]).length : lines.length));
const expLoreClips = newLoreIdx.length * CAREER_VOICES.length;
note(`coverage: +${newLoreIdx.length} variable-free lore line(s) × ${CAREER_VOICES.length} career voices = ${expLoreClips} lore clips; +${newBarks} unit bark(s) + ${newHero} hero bark(s).`);
note(`         (career voices: ${CAREER_VOICES.join(', ')})`);
// cross-check against the *_new.json manifests if present
let manNew = 0, sawMan = false;
for(const f of fs.readdirSync(GEN)) if(/_new\.json$/.test(f) && /^voice_manifest_/.test(f)){ sawMan = true; try { manNew += JSON.parse(read(path.join(GEN,f))).length; } catch(e){} }
if(sawMan) note(`         *_new.json manifests currently total ${manNew} clip(s) to render.`);
else note(`         (no *_new.json yet — run build_voice_manifests.mjs then filter_new_clips.mjs to size the render.)`);

/* ---- report ---- */
const line = '─'.repeat(64);
console.log(line);
console.log('validate_lore_append — append-only / alignment / version / identity / coverage');
console.log(line);
console.log(`events: ${W_LD.events.length}${H_LD?` (HEAD ${H_LD.events.length}, +${W_LD.events.length-H_LD.events.length})`:''}   LORE_SAY: ${W_DD.LORE_SAY.length}   versions: ${(W_LD.versions||[]).length}`);
for(const m of notes) console.log('  · ' + m);
if(warns.length){ console.log('\nWARNINGS:'); for(const w of warns) console.log('  ! ' + w); }
if(fails.length){ console.log('\nFAILED:'); for(const f of fails) console.log('  ✗ ' + f); console.log('\n✗ VALIDATION FAILED — do NOT proceed to voice generation.'); process.exit(1); }
console.log('\n✓ VALIDATION PASSED — safe to proceed to the approval gate.');
