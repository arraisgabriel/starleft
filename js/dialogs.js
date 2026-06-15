/* dialogs.js — in-world unit dialog boxes (speech/thought above a unit's head).
   A tiny dark speech bubble that pops above a unit when it has something to say. Two
   producers ship today, more can be added without touching update/draw:
     • sayUnitSelected(u)         — random bark from the unit-type pool (SELECT_LINES)
     • sayLoreEvent(u, say, tone) — first-person reaction to a fresh career life-event

   Boxes live ONLY here (module-local, never serialized): one per unit, ~8s lifetime,
   aged out by dt from core.update() and drawn last in render()'s world phase so they
   sit on top of every sprite. Selection barks are triggered from refreshUI() via
   onSelectionRefresh(sel) — fires only when the selection becomes a *new* single unit.

   Depends on globals: SELECT_LINES / LORE_SAY_FALLBACK (dialog_data.js), unitDrawH
   (assets.js), roundRect (render.js), ctx (config.js), G (state.js). */

const DIALOG = { fadeIn:0.15, fadeOut:0.6, maxConcurrent:14,
                 maxChars:30, maxLines:2 };        // ~30×2 fits every bark in 2 clean lines, no clip
// on-screen seconds by dialog type (scaled by text length within the range). Lore-event boxes
// linger longer than selection barks so a career milestone reads as a beat, not a blip.
const TTL = { select:{min:3,max:7}, lore:{min:6,max:9} };
const TTL_DEFAULT = { min:3, max:7 };
// left-edge accent. Selection barks tint by tone (grim red / wry green / deadpan cyan);
// lore-event boxes use career GOLD for weight and to set them apart from the selection cyan.
const TONE_ACCENT = { neg:'#ff5b5b', pos:'#5fd98a', neutral:'#7fd6ff' };
const LORE_GOLD = '#ffd24a';

let _dialogs = [];                 // active boxes: {u, lines[], tone, type, age, ttl}
const _lastSel = { id:null };      // last single-selected unit id (selection-bark dedup)

// wipe everything when a map (re)loads — boxes hold live unit refs from the old map
function resetDialogs(){ _dialogs.length = 0; _lastSel.id = null; }

/* ---------------- public producers ---------------- */
function sayUnitSelected(u){
  if(!u || u.kind!=='unit' || u.owner!=='player') return;

  // reborn veterans (story-polish §7.2): one shared haunted pool, spoken in the unit's OWN voice
  // (clips keyed by voice → barks/reborn_<voice>_<idx>, so a male Founder reborn isn't voiced female).
  if(!u.hero && u.reborn && typeof SELECT_LINES_REBORN!=='undefined' && SELECT_LINES_REBORN.length){
    const rl=_pickLine(u, SELECT_LINES_REBORN);
    pushDialog(u, rl, { type:'select', tone:'neutral' });
    if(typeof VOICE!=='undefined' && VOICE.playReborn) VOICE.playReborn(u.type, (u._lastLineIdx!=null)?u._lastLineIdx:SELECT_LINES_REBORN.indexOf(rl));
    return;
  }

  // named heroes (Nino, Biba): episode-tiered / duet / flat pools (story-polish §6.1/§6.2).
  if(u.hero && u.heroId){
    const sel=_heroPool(u);
    if(sel && sel.pool && sel.pool.length){
      const line=_pickLine(u, sel.pool, sel.skip);
      pushDialog(u, line, { type:'select', tone:'neutral' });
      if(typeof VOICE!=='undefined') VOICE.playBark(sel.voiceKey, (u._lastLineIdx!=null)?u._lastLineIdx:sel.pool.indexOf(line));
      return;
    }
  }

  // T0-5/T1-6: a dossier'd non-hero sometimes speaks its OWN backstory (~30%, text-only fallback).
  if(u.lore && typeof DOSSIER_SELECT_LINES!=='undefined' && DOSSIER_SELECT_LINES.length
     && typeof buildDossier==='function' && Math.random()<0.30){
    const d=buildDossier(u);
    pushDialog(u, d.fill(DOSSIER_SELECT_LINES[(Math.random()*DOSSIER_SELECT_LINES.length)|0]), { type:'select', tone:'neutral' });
    return;
  }
  const pool = (typeof SELECT_LINES!=='undefined' && SELECT_LINES[u.type]) || null;
  if(!pool || !pool.length) return;
  const line = _pickLine(u, pool);
  pushDialog(u, line, { type:'select', tone:'neutral' });
  if(typeof VOICE!=='undefined'){ const idx=(u._lastLineIdx!=null)?u._lastLineIdx:pool.indexOf(line); VOICE.playBark(u.type, idx); }
}

// resolve a hero's bark pool + voice key for THIS selection: duet > episode tier > flat (story-polish §6)
function _heroPool(u){
  if(typeof HERO_SELECT_LINES==='undefined') return null;
  const flat=HERO_SELECT_LINES[u.heroId]; if(!flat || !flat.length) return null;
  const tier=_heroTier(u.heroId);
  // duet: both heroes alive on the field → ~50% a two-hander (own voice key)
  if(typeof HERO_DUET_LINES!=='undefined' && HERO_DUET_LINES[u.heroId] && HERO_DUET_LINES[u.heroId].length
     && _bothHeroesPresent() && Math.random()<0.5)
    return { pool:HERO_DUET_LINES[u.heroId], voiceKey:u.heroId+'_duet' };
  // episode tier: arc-appropriate pool, mixed with flat for variety (~55%)
  if(tier && typeof HERO_TIER_LINES!=='undefined' && HERO_TIER_LINES[u.heroId] && HERO_TIER_LINES[u.heroId][tier]
     && HERO_TIER_LINES[u.heroId][tier].length && Math.random()<0.55)
    return { pool:HERO_TIER_LINES[u.heroId][tier], voiceKey:u.heroId+'_'+tier };
  // flat default — once Biba is aboard, suppress Nino's anachronistic pre-rescue lines
  if(u.heroId==='Nino' && (tier==='ally' || tier==='wall') && typeof NINO_RETIRE_WHEN_BIBA!=='undefined')
    return { pool:flat, voiceKey:'Nino', skip:NINO_RETIRE_WHEN_BIBA };
  return { pool:flat, voiceKey:u.heroId };
}

// the campaign tier for a hero's barks, from the live map index / campaign progress
function _heroTier(heroId){
  const idx=(typeof mapIndex==='number') ? mapIndex
          : ((typeof CAMPAIGN!=='undefined' && CAMPAIGN && typeof CAMPAIGN.nextMapIndex==='number') ? CAMPAIGN.nextMapIndex : -1);
  if(heroId==='Nino'){ if(idx>=11) return 'wall'; if(idx>=9) return 'ally'; if(idx>=7) return 'rumor'; return null; }
  if(heroId==='Biba'){
    const altar=(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.storyFlags && CAMPAIGN.storyFlags.altarSeen) || idx>=11;
    return altar ? 'postAltar' : 'preAltar';
  }
  return null;
}

// both named heroes alive & on the field (not stored/dead) — gates the duet pool
function _bothHeroesPresent(){
  if(typeof G==='undefined' || !G || !G.entities) return false;
  let nino=false, biba=false;
  for(const e of G.entities){
    if(e.dead || e.storedIn || e.owner!=='player' || !e.heroId) continue;
    if(e.heroId==='Nino') nino=true; else if(e.heroId==='Biba') biba=true;
    if(nino && biba) return true;
  }
  return false;
}

// a watching hero acknowledges a unit's milestone (story-polish §6.3). Cosmetic; solo/host; skip on rollback.
function sayHeroMentor(u){
  if(!u || (typeof window!=='undefined' && window._rbReplaying)) return;
  if(typeof G==='undefined' || !G || !G.entities || typeof HERO_MENTOR_LINES==='undefined') return;
  const heroes=[];
  for(const e of G.entities){ if(e.dead||e.storedIn||e.owner!=='player'||!e.heroId||e===u) continue; if(HERO_MENTOR_LINES[e.heroId]) heroes.push(e); }
  if(!heroes.length) return;
  const h=heroes[(Math.random()*heroes.length)|0], pool=HERO_MENTOR_LINES[h.heroId];
  if(!pool || !pool.length) return;
  const line=_pickLine(h, pool);
  pushDialog(h, line, { type:'select', tone:'pos' });
  if(typeof VOICE!=='undefined') VOICE.playBark(h.heroId+'_mentor', (h._lastLineIdx!=null)?h._lastLineIdx:pool.indexOf(line));
}
if(typeof window!=='undefined') window.sayHeroMentor=sayHeroMentor;

// event-triggered hero banter (story-polish §5.3): a watching hero reacts to a battlefield event.
// Cosmetic + local; throttled per kind (≥6s) so frequent events (heal/raze) don't spam. `who` pins
// the speaker (e.g. heal → Biba); otherwise any on-field hero with a line for this kind.
const _heroEventLast = {};
function sayHeroEvent(kind, who){
  if(!kind || (typeof window!=='undefined' && window._rbReplaying)) return;
  if(typeof G==='undefined' || !G || !G.entities || typeof HERO_EVENT_LINES==='undefined') return;
  const byKind=HERO_EVENT_LINES[kind]; if(!byKind) return;
  const now=(G && G.time) || 0;
  if(_heroEventLast[kind] && (now - _heroEventLast[kind]) < 6) return;
  const cands=[];
  for(const e of G.entities){
    if(e.dead||e.storedIn||e.owner!=='player'||!e.heroId) continue;
    if(who && e.heroId!==who) continue;
    if(byKind[e.heroId] && byKind[e.heroId].length) cands.push(e);
  }
  if(!cands.length) return;
  const h=cands[(Math.random()*cands.length)|0], pool=byKind[h.heroId];
  const line=_pickLine(h, pool);
  _heroEventLast[kind]=now;
  pushDialog(h, line, { type:'select', tone: kind==='grief'?'neg':(kind==='heal'?'pos':'neutral') });
  if(typeof VOICE!=='undefined') VOICE.playBark(h.heroId+'_'+kind, (h._lastLineIdx!=null)?h._lastLineIdx:pool.indexOf(line));
}
if(typeof window!=='undefined') window.sayHeroEvent=sayHeroEvent;
// sayIdx (when provided) is the LORE_SAY index of a variable-free line → it has a pre-rendered clip.
function sayLoreEvent(u, say, tone, sayIdx){
  if(!u || !say) return;
  pushDialog(u, say, { type:'lore', tone:tone||'neutral' });
  if(typeof VOICE!=='undefined' && sayIdx!=null)
    VOICE.playLore((u.hero && u.heroId) ? u.heroId : u.type, sayIdx);
}

// fired from refreshUI() each HUD tick — bark only on a genuinely NEW single-unit selection
// (the loop calls refreshUI ~5×/s, so we must ignore the same unit persisting/re-refreshing).
function onSelectionRefresh(sel){
  if(!sel || sel.length!==1 || sel[0].kind!=='unit' || sel[0].owner!=='player'){ _lastSel.id=null; return; }
  const u = sel[0];
  if(u.id === _lastSel.id) return;                 // same unit still selected → no re-bark
  _lastSel.id = u.id;
  // T0-5 personhood: mint the lightweight identity on FIRST selection (deterministic seed; the full
  // dossier prose still unlocks at Lv2). Clients never mutate sim state — they read it from snapshots.
  if(u.type!=='worker' && typeof netRole!=='undefined' && netRole!=='client' && typeof ensureDossier==='function') ensureDossier(u);
  if(u.type!=='worker' && typeof TUTORIAL!=='undefined' && TUTORIAL.fireContextual) TUTORIAL.fireContextual('dossier-discover', G);
  sayUnitSelected(u);
}

/* ---------------- core list mgmt ---------------- */
function pushDialog(u, text, opt){
  if(!u || !text) return;
  opt = opt || {};
  const lines = _wrap(text, DIALOG.maxChars, DIALOG.maxLines);
  _dialogs = _dialogs.filter(d => d.u !== u);      // one box per unit (newest wins)
  _dialogs.push({ u, lines, tone:opt.tone||'neutral', type:opt.type||'say',
                  age:0, ttl:opt.ttl||_ttlFor(lines, opt.type||'say') });
  if(_dialogs.length > DIALOG.maxConcurrent) _dialogs.shift();
}
function updateDialogs(state, dt){
  if(!_dialogs.length) return;
  for(const d of _dialogs) d.age += dt;
  _dialogs = _dialogs.filter(d => d.u && !d.u.dead && d.age < d.ttl);
}
function drawDialogs(state){
  if(!_dialogs.length) return;
  for(const d of _dialogs){ if(d.u && !d.u.dead) _drawBox(d); }
}

/* ---------------- helpers ---------------- */
// tone+aspect safety net so a level-up is never mute before per-event LORE_SAY lines exist.
function loreSayFallback(req, tone){
  if(typeof LORE_SAY_FALLBACK==='undefined') return null;
  const byReq = LORE_SAY_FALLBACK[req] || LORE_SAY_FALLBACK.any; if(!byReq) return null;
  const arr = byReq[tone] || byReq.neutral || []; if(!arr.length) return null;
  return arr[(Math.random()*arr.length)|0];
}

// pick a pool line, avoiding an immediate repeat for the same unit (and any `skip` indices,
// e.g. flat-pool lines retired as anachronistic once Biba is aboard — story-polish §6.1)
function _pickLine(u, pool, skip){
  if(pool.length===1) return pool[0];
  let i, tries=0;
  do { i=(Math.random()*pool.length)|0; tries++; }
  while((i===u._lastLineIdx || (skip && skip.indexOf(i)>=0)) && tries<12);
  u._lastLineIdx = i; return pool[i];
}

// word-wrap to <=maxLines of <=maxChars; overflow truncates the last line with an ellipsis
function _wrap(text, maxChars, maxLines){
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for(const w of words){
    if(!cur){ cur = w; continue; }
    if((cur+' '+w).length <= maxChars){ cur += ' '+w; }
    else { lines.push(cur); cur = w; if(lines.length === maxLines) break; }
  }
  if(lines.length < maxLines){ if(cur) lines.push(cur); }
  else {                                              // overflow remained — ellipsize last line
    let last = lines[maxLines-1];
    while(last.length > maxChars-1) last = last.replace(/\s*\S+$/, '');
    lines[maxLines-1] = (last || lines[maxLines-1].slice(0, maxChars-1)) + '…';
  }
  return lines.length ? lines : [''];
}

// on-screen lifetime scales with how much there is to read, within the type's [min,max] range:
// the shortest barks linger at min, a brimming two-liner holds at max.
function _ttlFor(lines, type){
  const r = TTL[type] || TTL_DEFAULT;
  const len = lines.reduce((a,l)=>a+l.length, 0);
  const maxLen = DIALOG.maxChars * DIALOG.maxLines;   // a brimming 2-liner reads the longest
  const f = Math.max(0, Math.min(1, (len - 8) / (maxLen - 8)));
  return r.min + f*(r.max - r.min);
}

function _alpha(d){
  if(d.age < DIALOG.fadeIn) return d.age/DIALOG.fadeIn;
  const left = d.ttl - d.age;
  if(left < DIALOG.fadeOut) return Math.max(0, left/DIALOG.fadeOut);
  return 1;
}

// draw one box in WORLD space (called inside render()'s world transform). The panel keeps a
// constant on-screen size via s=1/zoom, while its vertical anchor scales with the sprite so it
// always clears the unit's rank pips / HP bar at any zoom.
function _drawBox(d){
  const u = d.u, z = (G && G.zoom) || 1, s = 1/z;
  const vh = (typeof unitDrawH==='function') ? unitDrawH(u) : (u.r*2);
  const alt = u.air ? 16 : 0;
  const anchorY = u.y - alt - vh*0.72 - 16;          // box BOTTOM sits here (above pips, world units)
  const cx = u.x;

  const fs = 11*s, padX = 6*s, padY = 4*s, lh = 13*s, tail = 6*s, rad = 4*s;
  ctx.save();
  ctx.font = fs+'px '+GAME_FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
  let tw = 0; for(const ln of d.lines) tw = Math.max(tw, ctx.measureText(ln).width);
  const w = tw + padX*2, h = d.lines.length*lh + padY*2;
  const x = cx - w/2, y = anchorY - h;

  const isLore = d.type === 'lore';
  const accent = isLore ? LORE_GOLD : (TONE_ACCENT[d.tone] || TONE_ACCENT.neutral);
  ctx.globalAlpha = _alpha(d);
  // panel
  roundRect(x, y, w, h, rad);
  ctx.fillStyle = 'rgba(9,13,20,0.92)'; ctx.fill();
  // lore boxes carry a gold, softly-glowing border for extra weight; selects keep a cyan hairline
  if(isLore){ ctx.shadowColor = 'rgba(255,200,70,0.65)'; ctx.shadowBlur = 8*s; }
  ctx.lineWidth = (isLore ? 1.4 : 1)*s;
  ctx.strokeStyle = isLore ? 'rgba(255,210,74,0.62)' : 'rgba(127,214,255,0.40)';
  ctx.stroke();
  ctx.shadowBlur = 0;
  // accent — left edge (thicker for lore)
  ctx.fillStyle = accent;
  ctx.fillRect(x, y+3*s, (isLore ? 3 : 2)*s, h-6*s);
  // downward tail pointing at the unit
  ctx.beginPath();
  ctx.moveTo(cx-4*s, anchorY); ctx.lineTo(cx+4*s, anchorY); ctx.lineTo(cx, anchorY+tail);
  ctx.closePath(); ctx.fillStyle = 'rgba(9,13,20,0.92)'; ctx.fill();
  // text
  ctx.fillStyle = '#dde8f4';
  for(let i=0;i<d.lines.length;i++) ctx.fillText(d.lines[i], cx, y+padY+lh*i + lh/2);
  ctx.restore();
}
