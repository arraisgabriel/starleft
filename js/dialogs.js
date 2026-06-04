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
  // named heroes (Nino, Biba) speak from their OWN pool keyed by heroId; everyone else
  // falls back to their unit type's pool.
  const heroPool = (u.hero && u.heroId && typeof HERO_SELECT_LINES!=='undefined') ? HERO_SELECT_LINES[u.heroId] : null;
  const usedHero = !!(heroPool && heroPool.length);
  const pool = usedHero ? heroPool : ((typeof SELECT_LINES!=='undefined' && SELECT_LINES[u.type]) || null);
  if(!pool || !pool.length) return;
  const line = _pickLine(u, pool);
  pushDialog(u, line, { type:'select', tone:'neutral' });
  // voice bark: the clip is keyed by the SPEAKER (heroId or unit type) and the line's index
  if(typeof VOICE!=='undefined'){
    const idx = (u._lastLineIdx!=null) ? u._lastLineIdx : pool.indexOf(line);
    VOICE.playBark(usedHero ? u.heroId : u.type, idx);
  }
}
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

// pick a pool line, avoiding an immediate repeat for the same unit
function _pickLine(u, pool){
  if(pool.length===1) return pool[0];
  let i; do { i=(Math.random()*pool.length)|0; } while(i===u._lastLineIdx);
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
