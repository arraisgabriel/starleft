#!/usr/bin/env node
/* filter_new_clips.mjs — write *_new.json voice manifests that contain ONLY the clips not yet
   rendered, so `gen_voices.sh new` records new lore/bark lines without re-rendering the existing
   thousands. A clip id <id> is "already rendered" iff assets/audio/voice/<cat>/<id>.mp3 exists.

   Run AFTER  node _dev/gen/build_voice_manifests.mjs  (which emits the full manifests), from the
   repo root or anywhere:   node .claude/skills/starleft-lore-forge/scripts/filter_new_clips.mjs

   Emits (next to the full manifests, under _dev/gen/), only when non-empty:
     voice_manifest_lore_new.json, voice_manifest_barks_new.json,
     voice_manifest_clone_<voice>_{lore,barks}_new.json
   A stale *_new.json is deleted when nothing is new, so the `new` render won't re-emit it. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRoot(start){
  let d = start;
  for(let i=0;i<10;i++){
    if(fs.existsSync(path.join(d,'_dev','gen')) && fs.existsSync(path.join(d,'rts.html'))) return d;
    const up = path.dirname(d); if(up===d) break; d = up;
  }
  return process.cwd();
}
const ROOT  = findRoot(HERE);
const GEN   = path.join(ROOT, '_dev', 'gen');
const VOICE = path.join(ROOT, 'assets', 'audio', 'voice');

// full-manifest filename -> the category dir its clips render into
const targets = [
  ['voice_manifest_barks.json', 'barks'],
  ['voice_manifest_lore.json',  'lore'],
];
for(const f of fs.readdirSync(GEN)){
  const m = /^voice_manifest_clone_.*_(barks|lore)\.json$/.exec(f);
  if(m) targets.push([f, m[1]]);
}

let totalNew = 0, totalAll = 0;
const report = [];
for(const [mf, cat] of targets){
  const p = path.join(GEN, mf);
  if(!fs.existsSync(p)) continue;
  let items;
  try { items = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch(e){ console.error(`! ${mf}: ${e.message}`); process.exitCode = 1; continue; }
  const dir = path.join(VOICE, cat);
  const fresh = items.filter(it => it && it.id && !fs.existsSync(path.join(dir, it.id + '.mp3')));
  totalAll += items.length; totalNew += fresh.length;
  const outP = path.join(GEN, mf.replace(/\.json$/, '_new.json'));
  if(fresh.length) fs.writeFileSync(outP, JSON.stringify(fresh));
  else if(fs.existsSync(outP)) fs.unlinkSync(outP);
  report.push(`  ${mf.padEnd(42)} ${String(items.length).padStart(5)} total  ${String(fresh.length).padStart(5)} new`);
}

console.log('filter_new_clips — clips missing from assets/audio/voice/:');
report.forEach(r => console.log(r));
console.log(`  ${''.padEnd(42)} ${String(totalAll).padStart(5)} total  ${String(totalNew).padStart(5)} NEW`);
console.log(totalNew
  ? `\n→ ${totalNew} clip(s) to record. Run (after the approval gate):  bash _dev/gen/gen_voices.sh new`
  : `\n→ Nothing new to record — every manifested clip already exists.`);
