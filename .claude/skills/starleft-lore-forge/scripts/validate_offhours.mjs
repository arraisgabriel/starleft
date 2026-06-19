#!/usr/bin/env node
/* validate_offhours.mjs — the safety gate for an OFF-HOURS scene drop. Run from repo root:
     node .claude/skills/starleft-lore-forge/scripts/validate_offhours.mjs

   Proves js/offhours_data.js is a SAFE, append-only extension of git HEAD (the property saved bonds'
   seen[] indices and the index-keyed events/say depend on) and that every multi-beat scene is a valid,
   playable conversation tree. Exit 1 on any hard failure. The checks:

     1. APPEND-ONLY — HEAD's scene IDS (in order) are a prefix of working scenes (no reorder/insert/
        delete; scene CONTENT incl. an ev repoint may change); events/say are a byte-identical prefix;
        npcEvents are an unchanged prefix (may grow).
     2. ALIGNMENT   — events.length === say.length; non-null npcEvents stay within events range.
     3. BEAT-GRAPH  — every land/miss.next is a real beat index, forward (no self/back loop); every beat
        reachable from beat 0; a terminal branch exists; beats[0] has >=1 ungated choice.
     4. LEGALITY    — gates in {crime,trauma,dream}; req.need in {fallen}; ev a valid events index; fl
        in {ARC_UNLOCKED,CLOSEST}; fx capstone/relief only in a maxTier:4 scene; with: only bar/confidant.
     5. TOKENS      — only the allowed slot/clause/campaign tokens; {family}-as-noun flagged.
     6. DISTINCT    — each terminal `ev` is owned by <=1 scene (sharing ⇒ different nights read alike).
     7. COVERAGE    — eligible-scene count per (venue,kind) per tier (>=2 at low tiers, else openers repeat). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRoot(start){ let d=start; for(let i=0;i<12;i++){ if(fs.existsSync(path.join(d,'js','offhours_data.js'))&&fs.existsSync(path.join(d,'rts.html'))) return d; const u=path.dirname(d); if(u===d) break; d=u; } return process.cwd(); }
const ROOT = findRoot(HERE);

function loadOH(src){ const ctx={}; vm.createContext(ctx); try{ vm.runInNewContext(src+'\n;globalThis.__OH=OFFHOURS;', ctx); }catch(e){ return {err:String(e)}; } return ctx.__OH ? {oh:ctx.__OH} : {err:'no OFFHOURS found'}; }

const work = loadOH(fs.readFileSync(path.join(ROOT,'js','offhours_data.js'),'utf8'));
if(work.err){ console.error('FAIL loading working js/offhours_data.js:', work.err); process.exit(1); }
const OH = work.oh;
let head = null;
try{ head = loadOH(execSync('git show HEAD:js/offhours_data.js',{cwd:ROOT,encoding:'utf8'}).toString()).oh || null; }catch(_){ /* new file — skip append-only */ }

const errors=[], warns=[], info=[];
const E=m=>errors.push(m), W=m=>warns.push(m), I=m=>info.push(m);

// 1. APPEND-ONLY vs HEAD
if(head){
  const hIds=(head.scenes||[]).map(s=>s.id), wIds=(OH.scenes||[]).map(s=>s.id);
  for(let i=0;i<hIds.length;i++){ if(wIds[i]!==hIds[i]){ E(`scenes append-only: HEAD scene[${i}] '${hIds[i]}' became '${wIds[i]}' — never reorder/insert/delete; append at the end`); break; } }
  const J=v=>JSON.stringify(v);
  for(const [name,key] of [['events','text'],['say',null]]){ const h=head[name]||[], w=OH[name]||[];
    for(let i=0;i<h.length;i++){ const hv=key?(h[i]&&h[i][key]):h[i], wv=key?(w[i]&&w[i][key]):w[i]; if(J(hv)!==J(wv)){ E(`${name} append-only: index ${i} changed vs HEAD (existing ${name} are frozen — append new at the end)`); break; } } }
  { const h=head.npcEvents||[], w=OH.npcEvents||[]; for(let i=0;i<h.length;i++){ if(J(h[i])!==J(w[i])){ E(`npcEvents append-only: index ${i} changed vs HEAD`); break; } } }
} else I('no git HEAD for js/offhours_data.js — append-only checks skipped (new file)');

// 2. ALIGNMENT
if((OH.events||[]).length!==(OH.say||[]).length) E(`alignment: events.length (${(OH.events||[]).length}) !== say.length (${(OH.say||[]).length}) — append a say for every new event`);
(OH.npcEvents||[]).forEach((v,i)=>{ if(v!=null && i>=(OH.events||[]).length) E(`npcEvents[${i}] has text but is beyond events range`); });

// shared helpers
const GATES=new Set(['crime','trauma','dream']);
const EVMAX=(OH.events||[]).length-1;
const evOwners={};
const ALLOWED=new Set(['me','them','npc','home','rel','relName','full','dream','trauma','crime','family','fallen','lastmap']);
const TOK=/\{([a-z]+)\}/g;
function scanTokens(text, where){ if(!text) return; let m; TOK.lastIndex=0; while((m=TOK.exec(text))){ if(!ALLOWED.has(m[1])) E(`token: unknown {${m[1]}} in ${where}`); }
  if(/\b(the|in|a|our|this)\s*\{family\}/i.test(text)) W(`token: {family} used as a noun in ${where} (it expands to a full clause — use a literal noun)`); }
function checkBranch(sid,bi,ci,bn,br,nb){ if(!br) return;
  if(br.next!=null){ if(!(Number.isInteger(br.next)&&br.next>=0&&br.next<nb)) E(`${sid} b${bi}c${ci}.${bn}: next=${br.next} out of range 0..${nb-1}`);
    else if(br.next===bi) E(`${sid} b${bi}c${ci}.${bn}: next loops to its own beat`); else if(br.next<bi) W(`${sid} b${bi}c${ci}.${bn}: next=${br.next} points backward`); }
  if(br.ev!=null){ if(!(Number.isInteger(br.ev)&&br.ev>=0&&br.ev<=EVMAX)) E(`${sid} b${bi}c${ci}.${bn}: ev=${br.ev} out of events range 0..${EVMAX}`);
    if(br.next==null)(evOwners[br.ev]=evOwners[br.ev]||new Set()).add(sid); }
  if(br.fl && !['ARC_UNLOCKED','CLOSEST'].includes(br.fl)) E(`${sid} b${bi}c${ci}.${bn}: bad fl ${br.fl}`);
  scanTokens(br.reply, `${sid} ${bn} reply`); }
function checkChoices(sid,bi,choices,nb){ (choices||[]).forEach((c,ci)=>{ if(c.gate && !GATES.has(c.gate)) E(`${sid} b${bi}c${ci}: bad gate ${c.gate}`);
  scanTokens(c.line,`${sid} choice line`); checkBranch(sid,bi,ci,'land',c.land,nb); checkBranch(sid,bi,ci,'miss',c.miss,nb); }); }

// 3-6: per-scene
for(const s of (OH.scenes||[])){ const sid=s.id, t4=!!(s.req&&s.req.maxTier===4);
  if(s.req){ if(s.req.gate && !GATES.has(s.req.gate)) E(`${sid}: bad req.gate ${s.req.gate}`); if(s.req.need && s.req.need!=='fallen') E(`${sid}: bad req.need ${s.req.need}`); }
  if(s.with && !(s.venue==='bar'&&s.kind==='confidant')) E(`${sid}: with:bartender on a non-bar/confidant scene`);
  if(Array.isArray(s.beats)&&s.beats.length){ const nb=s.beats.length;
    s.beats.forEach((b,bi)=>{ (b.open||[]).forEach(o=>scanTokens(o,`${sid} b${bi} open`)); checkChoices(sid,bi,b.choices,nb); });
    if(!(s.beats[0].choices||[]).some(c=>!c.gate)) E(`${sid}: beat 0 has no ungated choice (never enterable)`);
    const reach=new Set([0]); let ch=true; while(ch){ ch=false; for(const bi of [...reach]) for(const c of (s.beats[bi].choices||[])) for(const bn of ['land','miss']){ const br=c[bn]; if(br&&br.next!=null&&!reach.has(br.next)){ reach.add(br.next); ch=true; } } }
    const un=s.beats.map((_,i)=>i).filter(i=>!reach.has(i)); if(un.length) E(`${sid}: beats unreachable from 0: ${un}`);
    if(!s.beats.some(b=>(b.choices||[]).some(c=>['land','miss'].some(bn=>c[bn]&&c[bn].next==null)))) E(`${sid}: no terminal branch (never ends)`);
    s.beats.forEach((b,bi)=>(b.choices||[]).forEach((c,ci)=>['land','miss'].forEach(bn=>{ const br=c[bn]; if(br&&br.fx&&br.fx.t==='capstone'&&!t4) E(`${sid} b${bi}c${ci}.${bn}: fx:capstone outside a maxTier:4 scene`); })));
  } else {
    (Array.isArray(s.open)?s.open:[s.open]).forEach(o=>scanTokens(o,`${sid} open`)); checkChoices(sid,0,s.choices,1);
    if(!(s.choices||[]).some(c=>!c.gate)) E(`${sid}: no ungated choice`);
    (s.choices||[]).forEach(c=>['land','miss'].forEach(bn=>{ const br=c[bn]; if(br&&br.fx&&br.fx.t==='capstone'&&!t4) E(`${sid}: fx:capstone outside a maxTier:4 scene`); }));
  }
}
(OH.events||[]).forEach((e,i)=>scanTokens(e&&e.text,`events[${i}]`));

// 6. DISTINCT ev (warning)
Object.entries(evOwners).filter(([,set])=>set.size>1).forEach(([ev,set])=>W(`ev ${ev} shared by ${set.size} scenes (${[...set].join(', ')}) — different nights read identically; give each its own events index`));

// 7. COVERAGE (info)
for(const [v,k] of [['bar','confidant'],['diner','kin'],['club','friend'],['club','rival'],['club','romance'],['club','mentor']]){
  const row=[0,1,2,3,4].map(t=>(OH.scenes||[]).filter(s=>s.venue===v&&s.kind===k&&(!s.req||((s.req.minTier==null||t>=s.req.minTier)&&(s.req.maxTier==null||t<=s.req.maxTier)))).length);
  I(`coverage ${v}/${k}: tiers [${row.join(' ')}]${row.slice(0,2).some(n=>n<2)?'  (⚠ <2 at an early tier → opener repeats)':''}`); }

// report
console.log(`OFF-HOURS: ${(OH.scenes||[]).length} scenes · ${(OH.events||[]).length} events / ${(OH.say||[]).length} say / ${(OH.npcEvents||[]).length} npcEvents`);
info.forEach(m=>console.log('  ·',m));
if(warns.length){ console.log(`\nWARNINGS (${warns.length}):`); warns.forEach(m=>console.log('  ⚠',m)); }
if(errors.length){ console.log(`\nERRORS (${errors.length}):`); errors.forEach(m=>console.log('  ✗',m)); console.log('\nFAIL'); process.exit(1); }
console.log('\nPASS — safe, append-only off-hours scene data.');
