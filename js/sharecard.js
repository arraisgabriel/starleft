/* sharecard.js — the veteran / memorial SHARE CARD (T0-6).
   shareCard(subject) renders a dark, branded PNG to an OFFSCREEN canvas — sprite + dossier
   name + career title + hometown + latest bark + dream (✓/✗) + "fell at {map}" / "★ active" —
   then exports it: navigator.share files (mobile) → clipboard PNG → download, the same ladder
   the co-op invite uses. `subject` is a LIVE unit, a carryover-vet snapshot ({type,stars,lore,…})
   or a fallen-memorial record from recordFallen ({name,type,lvl,dream,home,map,dreamDone,lore}).
   Pure DOM/canvas cosmetics — never touches G, saves, or the net. | STARLEFT */

const SHARECARD_URL = 'starleft.vercel.app';

// normalize any subject shape into one card model
function _scModel(s){
  if(!s) return null;
  const fallen = !!(s.name && s.kind===undefined && (s.lvl!==undefined || s.map!==undefined));
  const type = s.type || 'soldier';
  const lvl = fallen ? (s.lvl||0) : (s.stars||0);
  let d=null;
  try{
    if(typeof buildDossier==='function'){
      if(fallen && typeof fallenDossierSnap==='function') d=buildDossier({type, lore:fallenDossierSnap(s)});
      else if(s.lore) d=buildDossier({type, lore:s.lore});
    }
  }catch(e){ d=null; }
  const def=(typeof DEF!=='undefined' && DEF[type])||{name:type};
  const title=(typeof careerTitle==='function'?careerTitle(lvl):'')+' '+def.name;
  return {
    type, lvl, fallen,
    sprite: s.spriteType || (s.sprite||null),
    name: (d&&d.full) || s.name || (s.heroId||def.name),
    home: (d&&d.home) || s.home || null,
    dream: (d&&d.dream) || s.dream || null,
    dreamDone: !!(s.dreamDone || s.dreamDone===true),
    title: title.trim(),
    map: fallen ? (s.map||'the front') : ((typeof G!=='undefined'&&G&&G.cfg)?G.cfg.name:''),
    say: _scLatestSay(s, d),
  };
}
// the unit's most personal line: latest life-event say (LORE_SAY index-aligned), else the
// highest-index type bark, else null
function _scLatestSay(s, d){
  try{
    const evs = s.lore && s.lore.events;
    if(evs && evs.length && typeof LORE_SAY!=='undefined' && d){
      for(let k=evs.length-1;k>=0;k--){ const line=LORE_SAY[evs[k].i]; if(line) return d.fill(line); }
    }
    if(typeof SELECT_LINES!=='undefined'){ const p=SELECT_LINES[s.type]; if(p&&p.length) return p[p.length-1]; }
  }catch(e){}
  return null;
}

function _scWrap(c, text, x, y, maxW, lh, maxLines){
  const words=String(text).split(/\s+/); let line='', n=0;
  for(let i=0;i<words.length;i++){
    const t=line?line+' '+words[i]:words[i];
    if(c.measureText(t).width>maxW && line){
      c.fillText(line, x, y+n*lh); line=words[i]; n++;
      if(n>=maxLines-1){ // last line — ellipsize the rest
        let rest=words.slice(i).join(' ');
        while(c.measureText(rest+'…').width>maxW && rest.length>1) rest=rest.slice(0,-1);
        c.fillText(rest+'…', x, y+n*lh); return n+1;
      }
    } else line=t;
  }
  if(line){ c.fillText(line, x, y+n*lh); n++; }
  return n;
}

// draw the card → canvas (offscreen; one frame, not per-frame like the live HUB cards)
function drawShareCard(subject){
  const m=_scModel(subject); if(!m) return null;
  const W=900, H=1125, cvv=document.createElement('canvas'); cvv.width=W; cvv.height=H;
  const c=cvv.getContext('2d');
  const FONT=(typeof GAME_FONT!=='undefined')?GAME_FONT:'monospace';
  // ---- dark devastated bg + vignette + scanlines ----
  c.fillStyle='#05080d'; c.fillRect(0,0,W,H);
  const vg=c.createRadialGradient(W/2,H*0.42,80, W/2,H*0.42,H*0.75);
  vg.addColorStop(0, m.fallen?'rgba(120,40,46,0.20)':'rgba(54,110,140,0.16)');
  vg.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=vg; c.fillRect(0,0,W,H);
  c.globalAlpha=0.05; c.fillStyle='#9fb6c8';
  for(let y=0;y<H;y+=4) c.fillRect(0,y,W,1);
  c.globalAlpha=1;
  // frame
  c.strokeStyle=m.fallen?'#6e2a33':'#2a4a5e'; c.lineWidth=3; c.strokeRect(14,14,W-28,H-28);
  c.strokeStyle='rgba(255,255,255,0.06)'; c.lineWidth=1; c.strokeRect(22,22,W-44,H-44);
  // ---- header ----
  c.textAlign='center'; c.textBaseline='alphabetic';
  c.fillStyle=m.fallen?'#ff8d96':'#7fd6ff';
  c.font='700 26px '+FONT;
  c.fillText(m.fallen?'— IN MEMORIAM —':'— PERSONNEL FILE —', W/2, 78);
  // ---- sprite ----
  const sType=m.sprite||m.type;
  const anim=(typeof unitWalk==='function')?unitWalk(sType,'player'):null;
  const SY=110, SH=380;
  if(anim && anim.ready && anim.frames && anim.frames.length){
    const fr=anim.frames[0], fw=fr[2], fh=fr[3];
    const s=Math.min(520/fw, SH/fh), dw=fw*s, dh=fh*s;
    // soft ground glow under the figure
    const gg=c.createRadialGradient(W/2,SY+SH-8,10, W/2,SY+SH-8,200);
    gg.addColorStop(0, m.fallen?'rgba(255,90,90,0.22)':'rgba(110,200,255,0.20)'); gg.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=gg; c.beginPath(); c.ellipse(W/2,SY+SH-8,200,46,0,0,6.28); c.fill();
    if(m.fallen) c.globalAlpha=0.85;
    c.drawImage(anim.img, fr[0],fr[1],fw,fh, (W-dw)/2, SY+(SH-dh), dw, dh);
    c.globalAlpha=1;
  } else {
    c.font='200px '+FONT; c.fillStyle='#bfe6ff';
    c.fillText((typeof DEF!=='undefined'&&DEF[m.type]&&DEF[m.type].icon)||'•', W/2, SY+SH-60);
  }
  // ---- name + title + home ----
  let y=SY+SH+86;
  c.fillStyle='#f4f7fa'; c.font='700 56px '+FONT;
  c.fillText(m.name, W/2, y); y+=46;
  c.fillStyle='#cfa75a'; c.font='600 30px '+FONT;
  c.fillText(m.title+' · Lv '+m.lvl, W/2, y); y+=40;
  if(m.home){ c.fillStyle='#8fa6b8'; c.font='28px '+FONT; c.fillText('from '+m.home, W/2, y); y+=44; }
  else y+=10;
  // ---- bark (their own words) ----
  if(m.say){
    c.fillStyle='#bcd2e2'; c.font='italic 30px '+FONT;
    y+= 14 + 38*_scWrap(c, '“'+m.say+'”', W/2, y+8, W-200, 38, 3);
  }
  // ---- dream ----
  if(m.dream){
    y+=26;
    c.fillStyle=m.dreamDone?'#7dffa8':'#ff9aa4'; c.font='700 26px '+FONT;
    c.fillText(m.dreamDone?'DREAM FULFILLED ✓':'DREAM UNFULFILLED ✗', W/2, y); y+=38;
    c.fillStyle='#9fb6c8'; c.font='26px '+FONT;
    y+= 34*_scWrap(c, m.dream, W/2, y, W-200, 34, 3);
  }
  // ---- status line ----
  y=H-150;
  c.fillStyle=m.fallen?'#ff7b85':'#7dffa8'; c.font='700 30px '+FONT;
  c.fillText(m.fallen ? ('fell at '+m.map) : ('★ Lv '+m.lvl+' · active duty'), W/2, y);
  // ---- footer brand ----
  c.fillStyle='#5e7486'; c.font='600 24px '+FONT;
  c.fillText('S T A R L E F T', W/2, H-84);
  c.fillStyle='#41545f'; c.font='22px '+FONT;
  c.fillText(SHARECARD_URL, W/2, H-52);
  return cvv;
}

// export ladder: navigator.share(files) → clipboard PNG → download (same as the lobby QR/copy)
function shareCard(subject){
  const cvv=drawShareCard(subject); if(!cvv){ if(typeof toast==='function') toast('No file to share'); return; }
  const slug=((_scModel(subject)||{}).name||'veteran').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  cvv.toBlob(async (blob)=>{
    if(!blob){ if(typeof toast==='function') toast('Card render failed'); return; }
    const file=new File([blob], 'starleft-'+slug+'.png', {type:'image/png'});
    try{
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:'STARLEFT', text:'Personnel file — '+SHARECARD_URL});
        return;
      }
    }catch(e){ if(e && e.name==='AbortError') return; }
    try{
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        if(typeof toast==='function') toast('📋 Card copied — paste it anywhere');
        return;
      }
    }catch(e){}
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='starleft-'+slug+'.png'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    if(typeof toast==='function') toast('⬇ Card downloaded');
  }, 'image/png');
}
