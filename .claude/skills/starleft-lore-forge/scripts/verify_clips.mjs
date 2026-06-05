#!/usr/bin/env node
/* verify_clips.mjs — after `bash _dev/gen/gen_voices.sh new`, confirm every clip the *_new.json
   manifests asked for now exists as an mp3 under assets/audio/voice/<cat>/, spot-check a few for a
   sane duration, and surface any failures the TTS engine logged in local_tts_stats.json.
   Run: node .claude/skills/starleft-lore-forge/scripts/verify_clips.mjs   (exit 1 if clips missing) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRoot(start){ let d=start; for(let i=0;i<10;i++){ if(fs.existsSync(path.join(d,'_dev','gen'))&&fs.existsSync(path.join(d,'rts.html'))) return d; const u=path.dirname(d); if(u===d) break; d=u; } return process.cwd(); }
const ROOT  = findRoot(HERE);
const GEN   = path.join(ROOT, '_dev', 'gen');
const VOICE = path.join(ROOT, 'assets', 'audio', 'voice');
const cat = f => f.includes('_lore') ? 'lore' : 'barks';

const news = fs.readdirSync(GEN).filter(f => /^voice_manifest_.*_new\.json$/.test(f));
if(!news.length){ console.log('No *_new.json manifests found — nothing was queued to render (run filter_new_clips.mjs first).'); process.exit(0); }

let expected = 0, present = 0; const missing = []; const sample = [];
for(const mf of news){
  let items; try { items = JSON.parse(fs.readFileSync(path.join(GEN, mf), 'utf8')); } catch(e){ console.error(`! ${mf}: ${e.message}`); continue; }
  const dir = path.join(VOICE, cat(mf));
  for(const it of items){
    expected++;
    const mp3 = path.join(dir, it.id + '.mp3');
    if(fs.existsSync(mp3) && fs.statSync(mp3).size > 0){ present++; if(sample.length < 8) sample.push(mp3); }
    else missing.push(`${cat(mf)}/${it.id}.mp3`);
  }
}

// spot-check duration with ffprobe (best-effort; skipped if ffprobe absent)
let probed = 0, tooShort = 0;
let haveFfprobe = true; try { execSync('ffprobe -version', { stdio:'ignore' }); } catch(e){ haveFfprobe = false; }
if(haveFfprobe) for(const f of sample){
  try { const d = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim()); probed++; if(!(d >= 0.1)) tooShort++; }
  catch(e){}
}

// surface engine-side failures from the batch stats (TMP scratch dir)
const TMP = path.join(process.env.TMPDIR || '/tmp', 'sl_voice');
let statFails = 0, statBad = 0;
for(const c of ['lore','barks']){
  const sp = path.join(TMP, c, 'local_tts_stats.json');
  if(!fs.existsSync(sp)) continue;
  try { const st = JSON.parse(fs.readFileSync(sp,'utf8'));
    statFails += st.failures || 0;
    for(const it of (st.items||[])) if(it.ok===false || (it.chars_per_sec!=null && (it.chars_per_sec<4 || it.chars_per_sec>30))) statBad++;
  } catch(e){}
}

const line = '─'.repeat(56);
console.log(line);
console.log(`verify_clips — ${present}/${expected} expected clips present`);
console.log(line);
if(haveFfprobe) console.log(`  duration spot-check: ${probed} probed, ${tooShort} under 0.1s`);
else console.log('  (ffprobe not found — skipped duration spot-check)');
if(statFails || statBad) console.log(`  TTS stats: ${statFails} hard failure(s), ${statBad} clip(s) with off-range speech rate (review before shipping)`);
if(missing.length){
  console.log(`\n✗ ${missing.length} clip(s) MISSING (render did not produce them):`);
  for(const m of missing.slice(0, 40)) console.log('    ' + m);
  if(missing.length > 40) console.log(`    … and ${missing.length-40} more`);
  console.log('\nRe-run `bash _dev/gen/gen_voices.sh new` (or check the venv/preflight). Exit 1.');
  process.exit(1);
}
console.log(tooShort || statFails ? '\n⚠ all present, but review the flags above.' : '\n✓ all expected clips rendered and look sane.');
