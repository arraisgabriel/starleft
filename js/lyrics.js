/* lyrics.js — timed song subtitles for the Episode VII flash cinematic. The song text is NOT stored in
   code: it is fetched at runtime from the asset under assets/scenes/hub/ and only displayed. Two formats:
     • <base>.lrc — standard karaoke timestamps "[mm:ss.xx] line" → precise, real per-line sync. A line
       with a timestamp but no text acts as a "clear" marker (use it for instrumental gaps).
     • <base>.md  — plain lyrics (no timing) → a best-effort fallback that length-weights the lines across
       the vocal window [start,end]. This is APPROXIMATE; drop in a <base>.lrc for true sync.
   The renderer (drawLyricSubtitle, js/nuke_finale.js) shows the current line in neon red at the bottom.
   Served over http(s) so fetch works (file:// → no subtitles, like other optional assets). */
const LYRICS = (function(){
  let lines=[];                 // [{t, text}] sorted by t (t = seconds from the start of the music)
  let loaded=false, loading=false, approx=false;

  function parseLRC(txt){
    const out=[], reG=/\[(\d+):(\d+(?:\.\d+)?)\]/g;
    txt.split(/\r?\n/).forEach(raw=>{
      const text=raw.replace(reG,'').trim();
      let m; reG.lastIndex=0;
      while((m=reG.exec(raw))) out.push({ t:(+m[1])*60 + parseFloat(m[2]), text });   // text may be '' → a clear marker
    });
    return out.sort((a,b)=>a.t-b.t);
  }
  // length-weighted spread of plain lines across [start,end]; longer lines get proportionally more time
  function autoDistribute(raw, start, end){
    const ls=raw.split(/\r?\n/).map(s=>s.replace(/^\s*\d+[.)]?\s*/,'').trim()).filter(Boolean);
    if(!ls.length) return [];
    const span=Math.max(1, end-start), w=ls.map(s=>Math.max(8, s.length)), tot=w.reduce((a,b)=>a+b,0);
    let acc=start; const out=[];
    for(let i=0;i<ls.length;i++){ out.push({ t:acc, text:ls[i] }); acc += span*(w[i]/tot); }
    return out;
  }
  function load(base, start, end){
    if(loaded || loading) return; loading=true;
    const get=(u)=> (typeof fetch==='function') ? fetch(u).then(r=>r.ok?r.text():null).catch(()=>null) : Promise.resolve(null);
    get(base+'.lrc').then(lrc=>{
      if(lrc && /\[\d+:\d+/.test(lrc)){ lines=parseLRC(lrc); approx=false; loaded=true; loading=false; return; }
      return get(base+'.md').then(md=>{ if(md){ lines=autoDistribute(md, start, end); approx=true; } loaded=true; loading=false; });
    }).catch(()=>{ loading=false; });
  }
  // the line currently being sung at time t (most recent line whose timestamp has passed)
  function lineAt(t){ let cur=null; for(let i=0;i<lines.length;i++){ if(lines[i].t<=t) cur=lines[i]; else break; } return cur; }

  return { load, lineAt, isLoaded:()=>loaded, isApprox:()=>approx, count:()=>lines.length };
})();
if(typeof window!=='undefined') window.LYRICS = LYRICS;
