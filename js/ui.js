/* ui.js — menu / HUD: refreshUI, command panel, toasts, intro crawl, win/lose, game-flow (startGame/loadMap/buildMapSelect). */
/* =====================================================================
   UI (command panel + info)
   ===================================================================== */
const elCmd=document.getElementById('commands');
const elTitle=document.getElementById('sel-title');
const elDesc=document.getElementById('sel-desc');

function refreshUI(){
  if(!G) return;
  document.getElementById('gold').textContent = G.gold|0;
  document.getElementById('supply').textContent = G.supply+'/'+G.supplyCap;
  document.getElementById('mapname').textContent = G.cfg.name;
  document.getElementById('objective').textContent = G.cfg.objective;

  const sel=G.selection.filter(e=>!e.dead);

  // ---- info text (cheap text updates — safe to refresh every call) ----
  if(!sel.length){
    elTitle.textContent='Nothing selected';
    elDesc.innerHTML='<b>Tap</b> a unit to select; tap an enemy/mine/ground to attack, gather or move. <b>Drag</b> to pan, <b>pinch</b> (or wheel / +−) to zoom.<br><b>Box-select:</b> Shift+drag or the <b>Select box</b> button. Select a <b>Worker</b> then a build button, then tap a spot. <b>Ctrl/⌘+1-9</b> control group.';
  } else if(sel.length>1){
    const counts={}; sel.forEach(s=>counts[s.type]=(counts[s.type]||0)+1);
    elTitle.textContent= sel.length+' units selected';
    elDesc.innerHTML = Object.entries(counts).map(([k,v])=>v+'× '+DEF[k].name).join(', ');
  } else {
    const e=sel[0]; const d=DEF[e.type];
    elTitle.textContent=(d.icon?d.icon+' ':'')+d.name + (e.owner==='enemy'?' (rival)':'');
    let extra='';
    if(e.kind==='unit'){
      extra = `HP ${e.hp|0}/${e.maxHp}`;
      if(e.type==='worker') extra+=` • carrying ${e.carrying} 💰`;
      if(e.dmg) extra+=` • dmg ${e.dmg}`;
    } else {
      extra = e.constructing? `Building… ${(e.buildProg/e.buildTime*100)|0}%` : `HP ${e.hp|0}/${e.maxHp}`;
      if(e.prodQueue&&e.prodQueue.length) extra+=` • hiring ${DEF[e.prodQueue[0]].name} (${e.prodQueue.length} queued)`;
    }
    if(d.flavor) extra+=`<br><span style="color:#9e7780;font-style:italic;">${d.flavor}</span>`;
    elDesc.innerHTML=extra;
  }

  // ---- command buttons: rebuild ONLY when the applicable set changes ----
  // Rebuilding every frame destroyed buttons mid-click and ate the click
  // (the "needs 2 clicks" bug). Now buttons persist; only affordability refreshes.
  const sig = cmdSig(sel);
  if(sig !== G._cmdSig){ G._cmdSig = sig; buildCommands(sel); }
  updateAffordability();

  // show the Cancel button only while placing a building (touch replacement for Esc)
  const cb=document.getElementById('btn-cancel');
  if(cb) cb.style.display = G.placing ? '' : 'none';
}

// Signature of which command buttons should be shown for the current selection.
function cmdSig(sel){
  if(!sel.length) return 'empty';
  const owned=sel.filter(e=>e.owner==='player');
  if(!owned.length) return 'enemy';
  const has=t=>owned.some(e=>e.type===t&&!e.constructing);
  const hasG=G.entities.some(e=>!e.dead&&e.owner==='player'&&e.type==='garage'&&!e.constructing); // gates Launch Pad button
  return 'h'+(has('hq')?1:0)+'b'+(has('barracks')?1:0)+'g'+(has('garage')?1:0)+'l'+(has('launchpad')?1:0)
       +'w'+(owned.some(e=>e.type==='worker')?1:0)+'G'+(hasG?1:0)
       +'u'+(owned.some(e=>e.kind==='unit')?1:0);
}
// Resolve a live, selected, finished building of a given type at click time
// (handlers must not capture stale entity refs, since buttons now persist).
function selectedBuilding(type){
  return G.selection.find(e=>!e.dead && e.owner==='player' && e.type===type && !e.constructing);
}
function buildCommands(sel){
  elCmd.innerHTML='';
  const owned=sel.filter(e=>e.owner==='player');
  if(!owned.length) return;
  const hasFinished=t=>G.entities.some(e=>!e.dead&&e.owner==='player'&&e.type===t&&!e.constructing);
  const train=(bType,uType)=>{ const b=selectedBuilding(bType); if(b) tryTrain(G,b,uType); };
  if(owned.some(e=>e.type==='hq'&&!e.constructing))
    addCmd(DEF.worker.icon,'Hire Intern',DEF.worker.cost,()=>train('hq','worker'));
  if(owned.some(e=>e.type==='barracks'&&!e.constructing)){
    addCmd(DEF.soldier.icon,'Growth Hacker',DEF.soldier.cost,()=>train('barracks','soldier'));
    addCmd(DEF.ranger.icon,'Consultant',DEF.ranger.cost,()=>train('barracks','ranger'));
    addCmd(DEF.recruiter.icon,'Recruiter',DEF.recruiter.cost,()=>train('barracks','recruiter'));
    addCmd(DEF.hustler.icon,'Hustler',DEF.hustler.cost,()=>train('barracks','hustler'));
    addCmd(DEF.lobbyist.icon,'Lobbyist',DEF.lobbyist.cost,()=>train('barracks','lobbyist'));
  }
  if(owned.some(e=>e.type==='garage'&&!e.constructing)){
    addCmd(DEF.foodtruck.icon,'Food Truck',DEF.foodtruck.cost,()=>train('garage','foodtruck'));
    addCmd(DEF.auditor.icon,'Auditor',DEF.auditor.cost,()=>train('garage','auditor'));
    addCmd(DEF.founder.icon,'Founder Mech',DEF.founder.cost,()=>train('garage','founder'));
  }
  if(owned.some(e=>e.type==='launchpad'&&!e.constructing)){
    addCmd(DEF.courier.icon,'Courier Drone',DEF.courier.cost,()=>train('launchpad','courier'));
    addCmd(DEF.bomber.icon,'Buzzword Bomber',DEF.bomber.cost,()=>train('launchpad','bomber'));
  }
  if(owned.some(e=>e.type==='worker')){
    addCmd(DEF.hq.icon,'Open-Plan HQ',350,()=>tryPlaceFixed('hq'));
    addCmd(DEF.barracks.icon,'People Ops',DEF.barracks.cost,()=>tryPlace(G,'barracks'));
    addCmd(DEF.turret.icon,'Legal Team',DEF.turret.cost,()=>tryPlace(G,'turret'));
    addCmd(DEF.garage.icon,'The Garage',DEF.garage.cost,()=>tryPlace(G,'garage'));
    if(hasFinished('garage')) addCmd(DEF.launchpad.icon,'Launch Pad',DEF.launchpad.cost,()=>tryPlace(G,'launchpad'));
  }
  if(owned.some(e=>e.kind==='unit'))
    addCmd('🛑','Stop',null,()=>{ G.selection.forEach(u=>{ if(u.kind==='unit'&&u.owner==='player'){ resetMotion(u); u.cmd={type:'hold'}; u._healTarget=null; u._toHeal=false; u.sieged=false; u._setupT=0; u.state='idle'; } }); });
}
// Keep the affordability dimming fresh without destroying (and re-creating) buttons.
function updateAffordability(){
  const kids=elCmd.children; if(!kids) return;
  for(const b of kids){ if(b._cost!=null) b.classList.toggle('disabled', G.gold < b._cost); }
}
// HQ has cost 0 in DEF (starting), but expanding should cost something:
function tryPlaceFixed(type){
  if(type==='hq'){ // override cost for extra HQ
    if(G.gold<350){ toast('Extra Command Center costs 350 gold'); return; }
    const sel=G.selection.find(e=>e.kind==='unit'&&e.type==='worker'&&!e.dead);
    if(!sel){ toast('Select a Worker first'); return; }
    G.placing={type:'hq', def:Object.assign({},DEF.hq,{cost:350}), builder:sel};
    toast('Tap a spot for the Command Center (Cancel / Esc to abort)');
  }
}

function addCmd(emoji,label,cost,fn){
  const b=document.createElement('div'); b.className='cmd-btn';
  b._cost = cost;                              // used by updateAffordability()
  if(cost!=null && G.gold<cost) b.classList.add('disabled');
  b.innerHTML=`<span class="emoji">${emoji}</span><span>${label}</span>${cost!=null?`<span class="cost">${cost}🪙</span>`:''}`;
  b.onclick=()=>{ fn(); refreshUI(); };
  elCmd.appendChild(b);
}

/* toast */
let toastTimer=null;
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1800);
}

/* =====================================================================
   GAME FLOW
   ===================================================================== */
function startGame(idx){
  idx = idx|0;
  document.getElementById('startScreen').style.display='none';
  mapIndex=idx; showCrawl(idx, ()=>{ loadMap(idx); });
}
// Build a "jump to any Quarter" row on the title screen from the MAPS list.
function buildMapSelect(){
  const wrap=document.getElementById('mapButtons'); if(!wrap) return;
  wrap.innerHTML='';
  MAPS.forEach((m,i)=>{
    const sub=(m.name.split('—')[1]||m.name).trim();
    const b=document.createElement('button'); b.className='map-btn';
    b.innerHTML=`<b>Quarter ${i+1}</b><span class="mn">${sub}</span><small>vs ${m.enemyName||'rivals'}</small>`;
    b.onclick=()=>startGame(i);
    wrap.appendChild(b);
  });
}
function loadMap(idx){
  G=newMap(idx); syncHud(); clampCam(G); refreshUI(); running=true;
  toast('Quarter '+(idx+1)+': '+G.cfg.name);
}

/* ---- Star-Wars-style intro crawl ---- */
function showCrawl(idx, done){
  running=false;
  const cfg=MAPS[idx], cr=cfg.crawl;
  const scr=document.getElementById('crawlScreen');
  document.getElementById('crawl-ep').textContent=cr.episode;
  document.getElementById('crawl-title').textContent=cr.title;
  document.getElementById('crawl-text').textContent=cr.text;
  document.getElementById('crawl-intro').style.display = idx===0? 'block':'none';
  // restart the CSS animation by reflow
  const content=document.getElementById('crawl-content');
  scr.classList.remove('fast'); content.style.animation='none'; void content.offsetWidth;
  content.style.animation='';
  scr.style.display='flex';
  let finished=false;
  const finish=()=>{ if(finished) return; finished=true; clearTimeout(timer);
    scr.style.display='none'; done&&done(); };
  document.getElementById('crawl-skip').onclick=finish;
  // auto-advance when the crawl scrolls off (anim 55s + 0.2s delay) — but keep it skippable
  const timer=setTimeout(finish, idx===0? 57000 : 56000);
}

function onVictory(){
  running=false;
  const es=document.getElementById('endScreen');
  const beaten=G.cfg.enemyName||'the competition';
  if(mapIndex < MAPS.length-1){
    es.className='overlay win'; es.style.display='flex';
    es.innerHTML=`<div class="big">📉</div><h1>ACQUIHIRED</h1>
      <h2>${beaten} has pivoted to bankruptcy</h2>
      <p>Their assets are yours, their founders are "exploring new opportunities," and TechCrunch loves you.<br>
      Funding raised this quarter: <b>💰 ${G.gold_collected|0}</b></p>
      <button class="btn" id="nextBtn">▶ Next Quarter</button>`;
    document.getElementById('nextBtn').onclick=()=>{ es.style.display='none'; mapIndex++; showCrawl(mapIndex, ()=>loadMap(mapIndex)); };
  } else {
    es.className='overlay win'; es.style.display='flex';
    es.innerHTML=`<div class="big">🦄</div><h1>IPO!</h1>
      <h2>Total market domination achieved</h2>
      <p>${beaten} is rubble, regulators are "looking into it," and you are now the monopoly you swore to disrupt.
      The ping-pong table finally gets used. Congratulations, you played yourself — and won.</p>
      <button class="btn" onclick="location.reload()">↻ Found a New Startup</button>`;
  }
}
function onDefeat(){
  running=false;
  const es=document.getElementById('endScreen');
  es.className='overlay lose'; es.style.display='flex';
  es.innerHTML=`<div class="big">💸</div><h1>OUT OF RUNWAY</h1>
    <h2>The board has "decided to go in a different direction"</h2>
    <p>Your funding is gone, your Interns have unionized, and ${G.cfg.enemyName||'the rival'} just bought your domain name.</p>
    <div style="display:flex;gap:14px;">
      <button class="btn" id="retryBtn">↻ Pivot &amp; Retry</button>
      <button class="btn" style="background:linear-gradient(180deg,#566,#344);" onclick="location.reload()">⟲ Restart Campaign</button>
    </div>`;
  document.getElementById('retryBtn').onclick=()=>{ es.style.display='none'; loadMap(mapIndex); };
}

