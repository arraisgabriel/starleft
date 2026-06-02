/* ui.js — menu / HUD: refreshUI, command panel, toasts, intro crawl, win/lose, game-flow (startGame/loadMap/buildMapSelect). */
/* =====================================================================
   UI (command panel + info)
   ===================================================================== */
const elCmd=document.getElementById('commands');
const elTitle=document.getElementById('sel-title');
const elDesc=document.getElementById('sel-desc');
const elStats=document.getElementById('sel-stats');
const elDossierBtn=document.getElementById('sel-dossier');

function refreshUI(){
  if(!G) return;
  document.getElementById('gold').textContent = G.gold|0;
  document.getElementById('supply').textContent = G.supply+'/'+G.supplyCap;
  document.getElementById('mapname').textContent = G.cfg.name;
  document.getElementById('objective').textContent = G.cfg.objective;

  const sel=G.selection.filter(e=>!e.dead);

  // ---- in-world "unit selected" bark: fires only when the selection becomes a NEW single unit ----
  if(typeof onSelectionRefresh==='function') onSelectionRefresh(sel);

  // ---- info text (cheap text updates — safe to refresh every call) ----
  if(!sel.length){
    elTitle.textContent='Nothing selected';
    elStats.textContent=''; if(elDossierBtn) elDossierBtn.style.display='none';
    elDesc.innerHTML='<b>Tap</b> a unit to select; tap an enemy/mine/ground to attack, gather or move. <b>Drag</b> to pan, <b>pinch</b> (or wheel / +−) to zoom.<br><b>Units box-select:</b> Shift+drag or the <b>Select box</b> button. Select a <b>Worker</b> then a build button, then tap a spot. <b>Shift+1-9</b> set / <b>1-9</b> recall control group.';
  } else if(sel.length>1){
    const counts={}; sel.forEach(s=>counts[s.type]=(counts[s.type]||0)+1);
    elTitle.textContent= sel.length+' units selected';
    elStats.textContent=''; if(elDossierBtn) elDossierBtn.style.display='none';
    elDesc.innerHTML = Object.entries(counts).map(([k,v])=>v+'× '+DEF[k].name).join(', ');
  } else {
    const e=sel[0]; const d=DEF[e.type]; const lvl=e.stars||0;
    // career title prefixes the name; once a dossier exists the person's name is appended
    const hasDossier = e.owner==='player' && e.lore && typeof buildDossier==='function';
    const titlePrefix=(e.owner==='player'&&lvl>0)? careerTitle(lvl)+' ' : '';
    const personName = hasDossier ? ' · '+buildDossier(e).full : '';
    elTitle.textContent=(d.icon?d.icon+' ':'')+titlePrefix+d.name+personName + (e.owner==='enemy'?' (rival)':'');
    if(elDossierBtn){ elDossierBtn.style.display = hasDossier ? '' : 'none'; if(hasDossier) elDossierBtn.onclick=()=>showDossier(e); }
    // always-visible 3-stat line (level / HP / damage) — shown on desktop AND mobile
    if(e.kind==='unit'){
      const dmg=Math.round((e.dmg||0)*vetDmgMul(e));   // reflect the career damage bonus
      elStats.innerHTML=`<span class="st">★ Lv ${lvl}</span><span class="st">❤ ${e.hp|0}/${e.maxHp}</span><span class="st">⚔ ${dmg}</span>`;
    } else {
      const s=e.constructing? `🏗 ${(e.buildProg/e.buildTime*100)|0}%` : `❤ ${e.hp|0}/${e.maxHp}`;
      elStats.innerHTML=`<span class="st">${s}</span>`;
    }
    // secondary detail (context + flavor) — lives in .desc, which is desktop-only on mobile
    let extra='';
    if(e.kind==='unit'){
      if(e.type==='worker' && e.carrying>0) extra=`carrying ${e.carrying} 💰`;
    } else if(e.prodQueue&&e.prodQueue.length){
      extra=`hiring ${DEF[e.prodQueue[0]].name} (${e.prodQueue.length} queued)`;
    }
    if(d.flavor) extra+=(extra?'<br>':'')+`<span style="color:#9e7780;font-style:italic;">${d.flavor}</span>`;
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

  // production-queue cards live in the selected building's info panel
  updateProdQueue((sel.length===1 && sel[0].kind==='building' && sel[0].owner==='player') ? sel[0] : null);
}

// Build / refresh the queue cards for a selected player building (or clear them).
// Cards (DOM) rebuild only when the queue contents change; the active card's
// progress bar and each idle sprite refresh every call.
function updateProdQueue(b){
  const wrap=document.getElementById('prod-queue'); if(!wrap) return;
  if(!b || !b.prodQueue || !b.prodQueue.length){
    if(wrap._sig){ wrap.innerHTML=''; wrap._sig=''; }
    return;
  }
  const sig=b.id+':'+b.prodQueue.join(',');
  if(sig!==wrap._sig){ wrap._sig=sig; buildProdCards(wrap,b); }
  const cards=wrap.children;
  for(let i=0;i<cards.length;i++){
    drawCardSprite(cards[i], b.prodQueue[i], b.owner);
    const pi=cards[i].querySelector('.pq-prog>i');
    if(pi) pi.style.width = (i===0 && b.prodTotal>0 ? Math.min(100,(b.prodTime/b.prodTotal*100))|0 : 0)+'%';
  }
}
function buildProdCards(wrap,b){
  wrap.innerHTML='';
  b.prodQueue.forEach((type,i)=>{
    const card=document.createElement('div'); card.className='pq-card'; card.title='Cancel '+(DEF[type].name||type);
    const cv=document.createElement('canvas'); cv.width=40; cv.height=40; cv.className='pq-spr'; card.appendChild(cv);
    if(i===0){ const pr=document.createElement('div'); pr.className='pq-prog'; pr.innerHTML='<i></i>'; card.appendChild(pr); }
    const x=document.createElement('button'); x.className='pq-x'; x.textContent='✕';
    x.onclick=(ev)=>{ ev.stopPropagation(); cancelTrain(G, b, [...wrap.children].indexOf(card)); refreshUI(); };
    card.appendChild(x);
    wrap.appendChild(card);
  });
}
// draw a unit's idle sprite (walk frame 0) fit into the card; emoji fallback if the atlas isn't loaded
function drawCardSprite(card,type,owner){
  const cv=card.querySelector('.pq-spr'); if(!cv) return; const c=cv.getContext('2d');
  c.clearRect(0,0,cv.width,cv.height);
  const anim=unitWalk(type,owner);
  if(anim && anim.ready && anim.frames){
    const fr=anim.frames[0], fw=fr[2], fh=fr[3], s=Math.min(cv.width/fw, cv.height/fh)*0.96, dw=fw*s, dh=fh*s;
    c.drawImage(anim.img, fr[0],fr[1],fw,fh, (cv.width-dw)/2, (cv.height-dh)/2, dw, dh);
  } else {
    c.font='22px sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText((DEF[type]&&DEF[type].icon)||'•', cv.width/2, cv.height/2+1);
  }
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
  if(!owned.length){ elCmd.classList.remove('has-cmds'); syncCmdLine(); return; }
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
    addCmd(DEF.outpost.icon,'Satellite Office',DEF.outpost.cost,()=>tryPlace(G,'outpost'));
    addCmd(DEF.barracks.icon,'People Ops',DEF.barracks.cost,()=>tryPlace(G,'barracks'));
    addCmd(DEF.turret.icon,'Legal Team',DEF.turret.cost,()=>tryPlace(G,'turret'));
    addCmd(DEF.garage.icon,'The Garage',DEF.garage.cost,()=>tryPlace(G,'garage'));
    if(hasFinished('garage')) addCmd(DEF.launchpad.icon,'Launch Pad',DEF.launchpad.cost,()=>tryPlace(G,'launchpad'));
  }
  // production/build buttons fill the command line; flag it so compact (mobile) layouts
  // can collapse the whole line when a unit has none — Stop now lives in #touch-controls.
  elCmd.classList.toggle('has-cmds', elCmd.children.length>0);
  // Desktop keeps an in-panel Stop button (touch layouts hide .cmd-stop via CSS and
  // surface Stop in the #touch-controls row instead).
  if(owned.some(e=>e.kind==='unit'))
    addCmd('🛑','Stop',null,stopSelection,'cmd-stop');
  syncCmdLine();
}
// Stop = hold position: cancel orders/motion for every selected player unit.
function stopSelection(){
  if(!G) return;
  G.selection.forEach(u=>{ if(u.kind==='unit'&&u.owner==='player'){ resetMotion(u); u.cmd={type:'hold'}; u._healTarget=null; u._toHeal=false; u.sieged=false; u._setupT=0; u.state='idle'; } });
}
// The touch-controls Stop button (#btn-stop) is only clickable when a player unit is selected.
function updateStopBtn(){
  const sb=document.getElementById('btn-stop'); if(!sb) return;
  sb.disabled = !(G && G.selection.some(e=>!e.dead && e.kind==='unit' && e.owner==='player'));
}
// The command line changes height when it collapses (non-builder unit) or appears
// (intern/building), so re-sync the Stop button and the HUD heights for the viewport.
function syncCmdLine(){
  updateStopBtn();
  if(typeof syncHud==='function'){ syncHud(); if(G && typeof clampCam==='function') clampCam(G); }
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

function addCmd(emoji,label,cost,fn,extraClass){
  const b=document.createElement('div'); b.className='cmd-btn'+(extraClass?' '+extraClass:'');
  b._cost = cost;                              // used by updateAffordability()
  if(cost!=null && G.gold<cost) b.classList.add('disabled');
  b.innerHTML=`<span class="emoji">${emoji}</span><span>${label}</span>${cost!=null?`<span class="cost">${cost}🪙</span>`:''}`;
  b.onclick=()=>{ fn(); refreshUI(); };
  elCmd.appendChild(b);
}

/* toast */
let toastTimer=null;
/* Notifications log: every toast / eventToast also accumulates here, keyed in a Map
   (insertion id -> record) so the player can reopen them from the Events panel. */
const eventLog=new Map();
let eventLogSeq=0, eventLogUnseen=0;
function logEvent(msg,isEvent,say){
  const time=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  eventLog.set(++eventLogSeq, {msg, isEvent, say, time});
  if(eventLog.size>200) eventLog.delete(eventLog.keys().next().value);  // cap memory over long games
  eventLogUnseen++; updateEventsBadge();
}
function updateEventsBadge(){
  const txt = eventLogUnseen>99? '99+' : String(eventLogUnseen);
  const disp = eventLogUnseen? '' : 'none';
  // the Events button now lives inside the collapsed top-menu, so mirror its
  // unseen count onto the menu toggle too (#topmenu-badge) to stay visible
  ['events-badge','topmenu-badge'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.textContent = txt; el.style.display = disp;
  });
}
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.remove('event'); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1800);
  logEvent(msg,false);
}
// richer, longer-lived toast for life-events & obituaries (multi-line; allows HTML).
// Optional `say` is the unit's spoken reaction — logged for the Events panel (not the toast).
function eventToast(html,ms=9000,say){
  const t=document.getElementById('toast'); t.innerHTML=html; t.classList.add('show','event');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),ms);
  logEvent(html,true,say);
}

/* =====================================================================
   GAME FLOW
   ===================================================================== */
// Show / hide a menu sub-screen (map selection, documentation)
function showSub(id){ const el=document.getElementById(id); if(el) el.style.display='flex'; }
function hideSub(id){ const el=document.getElementById(id); if(el) el.style.display='none'; }

// career v3: per-unit dossier modal + campaign roster/memorial
function showDossier(u){
  if(!u || !u.lore || typeof dossierHTML!=='function') return;
  document.getElementById('dossierBody').innerHTML = dossierHTML(u);
  showSub('dossierScreen');
}
function showRoster(){
  const b=document.getElementById('rosterBody'); if(!b || typeof rosterHTML!=='function') return;
  b.innerHTML = rosterHTML();
  b.querySelectorAll('.roster-row[data-uid]').forEach(el=>{
    el.onclick=()=>{ const id=+el.dataset.uid; const u=G&&G.entities.find(e=>e.id===id&&!e.dead); if(u){ hideSub('rosterScreen'); showDossier(u); } };
  });
  showSub('rosterScreen');
}

// Notifications panel — renders the accumulated toast log (newest first).
function _escHtml(s){ return String(s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function showEvents(){
  const body=document.getElementById('eventsBody'); if(!body) return;
  if(!eventLog.size){
    body.innerHTML='<div class="muted">No dispatches yet — promotions, obituaries and incoming-attack alerts collect here.</div>';
  } else {
    const rows=[];
    eventLog.forEach(e=>rows.push(
      `<div class="event-row${e.isEvent?' event-hi':''}"><span class="event-time">${e.time}</span>`+
      `<span class="event-msg">${e.isEvent? e.msg : _escHtml(e.msg)}`+
      (e.say ? `<span class="event-quote">${_escHtml(e.say)}</span>` : '')+
      `</span></div>`));
    body.innerHTML=rows.reverse().join('');
  }
  eventLogUnseen=0; updateEventsBadge();   // mark all seen on open
  showSub('eventsScreen');
}

// Field Manual: shown from "Documentation" (footer = Back) OR before "New Campaign"
// (footer = Start Campaign, which launches the campaign).
let _docCampaign=false;
function showDocs(forCampaign){
  _docCampaign=!!forCampaign;
  const btn=document.getElementById('docFooterBtn');
  if(btn) btn.innerHTML = forCampaign ? '<span class="ic">▶</span> Start Campaign' : '◀ Back';
  showSub('docScreen');
}
function docFooter(){ if(_docCampaign) startGame(0); else hideSub('docScreen'); }

function startGame(idx){
  idx = idx|0;
  ['startScreen','mapScreen','docScreen'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  // fresh campaign / map-select replay: clear carried units so a previous run's veterans or heroes
  // don't bleed into this one (heroes persist WITHIN a run, not across a brand-new start).
  if(typeof setCarryover==='function') setCarryover([]);
  if(typeof resetHeroes==='function') resetHeroes();
  if(typeof resetFallen==='function') resetFallen();   // {fallen} crawl var: empty memorial on a fresh start
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
// ---- Field-Tip panel: show a random tip, rotating while the menu is up ----
let _tipIdx=-1;
function pickTip(){
  if(typeof GAME_TIPS==='undefined' || !GAME_TIPS.length) return;
  let i; do { i=Math.floor(Math.random()*GAME_TIPS.length); } while(GAME_TIPS.length>1 && i===_tipIdx);
  _tipIdx=i;
  const el=document.getElementById('tip-text'); if(el) el.innerHTML=GAME_TIPS[i];
}
function startTipRotation(){
  pickTip();   // first tip immediately
  setInterval(()=>{ const s=document.getElementById('startScreen'); if(s && s.style.display!=='none') pickTip(); }, 15000);
}
function loadMap(idx){
  G=newMap(idx); if(typeof resetDialogs==='function') resetDialogs(); syncHud(); clampCam(G); refreshUI(); running=true;
  toast('Quarter '+(idx+1)+': '+G.cfg.name);
}

/* ---- Star-Wars-style intro crawl ---- */
function showCrawl(idx, done){
  running=false;
  const cfg=MAPS[idx], cr=cfg.crawl;
  const scr=document.getElementById('crawlScreen');
  document.getElementById('crawl-ep').textContent=cr.episode;
  document.getElementById('crawl-title').textContent=cr.title;
  const _ct=document.getElementById('crawl-text');
  try { _ct.textContent = (typeof fillCrawl==='function')
        ? fillCrawl(cr.text, typeof crawlVars==='function'?crawlVars():{}) : cr.text; }
  catch(e){ _ct.textContent = cr.text; }   // never soft-lock the crawl on a templating/data error
  document.getElementById('crawl-intro').style.display = idx===0? 'block':'none';
  // restart the CSS animation by reflow
  const content=document.getElementById('crawl-content');
  scr.classList.remove('fast'); content.style.animation='none'; void content.offsetWidth;
  content.style.animation='';
  scr.style.display='flex';
  if(typeof VOICE!=='undefined') VOICE.playCrawl(idx);   // rod-clone narration, synced to the scroll
  let finished=false;
  const finish=()=>{ if(finished) return; finished=true; clearTimeout(timer);
    if(typeof VOICE!=='undefined') VOICE.stopCrawl();     // stop narration on skip OR auto-advance
    scr.style.display='none'; done&&done(); };
  document.getElementById('crawl-skip').onclick=finish;
  // auto-advance when the crawl scrolls off (anim 86.97s + 0.2s delay) — but keep it skippable
  const timer=setTimeout(finish, idx===0? 90132 : 88550);
}

function onVictory(){
  running=false;
  const es=document.getElementById('endScreen');
  const beaten=G.cfg.enemyName||'the competition';
  if(mapIndex < MAPS.length-1){
    // infiltration map (Ep X, cfg.noCarryVets): no vets deployed here, so don't run the chooser and
    // don't overwrite the carryover — the roster waiting outside rejoins unchanged next quarter.
    const keepRoster = !!(G.cfg && G.cfg.noCarryVets);
    const vets = (!keepRoster && typeof eligibleVets==='function') ? eligibleVets(G) : [];
    const cap  = (typeof vetCarryCountFor==='function') ? vetCarryCountFor(mapIndex+1) : 0;
    es.className='overlay win'; es.style.display='flex';
    es.innerHTML=`<div class="big">📉</div><h1>ACQUIHIRED</h1>
      <h2>${beaten} has pivoted to bankruptcy</h2>
      <p>Their assets are yours, their founders are "exploring new opportunities," and TechCrunch loves you.<br>
      Funding raised this quarter: <b>💰 ${G.gold_collected|0}</b></p>
      ${vets.length? `<div class="carry-head">Who deploys to the next quarter? <span class="carry-count" id="carry-count"></span></div>
        <div class="carry-list" id="carry-list"></div>` : ''}
      <button class="btn" id="nextBtn">▶ Next Quarter</button>`;
    const proceed=(chosen)=>{ es.style.display='none'; if(!keepRoster) setCarryover(chosen);
      if(typeof captureHeroes==='function') captureHeroes(G);   // heroes auto-carry (not chooser-driven) until they die — incl. freed Biba
      mapIndex++; showCrawl(mapIndex, ()=>loadMap(mapIndex)); };
    if(vets.length){ buildCarryChooser(document.getElementById('carry-list'), document.getElementById('carry-count'), vets, cap, document.getElementById('nextBtn'), proceed); }
    else { document.getElementById('nextBtn').onclick=()=>proceed([]); }
  } else {
    es.className='overlay win'; es.style.display='flex';
    es.innerHTML=`<div class="big">🦄</div><h1>IPO!</h1>
      <h2>Total market domination achieved</h2>
      <p>${beaten} is rubble, regulators are "looking into it," and you are now the monopoly you swore to disrupt.
      The ping-pong table finally gets used. Congratulations, you played yourself — and won.</p>
      <button class="btn" onclick="location.reload()">↻ Found a New Startup</button>`;
  }
}
// victory-screen carryover chooser: pick up to `cap` veteran units to deploy next quarter
function buildCarryChooser(listEl, countEl, vets, cap, nextBtn, proceed){
  const selected = new Set(vets.slice(0, cap).map(v=>v.id));   // pre-select the strongest `cap`
  const updateCount = ()=>{ countEl.textContent = `(${selected.size}/${cap})`; };
  vets.forEach(v=>{
    const d = (v.lore && typeof buildDossier==='function') ? buildDossier(v) : null;
    const name = d ? d.full : (careerTitle(v.stars||0)+' '+DEF[v.type].name).trim();
    const teaser = (d && (v.stars||0)>=2) ? `<span class="cc-dream">“${d.dream}”</span>` : '';
    const card = document.createElement('button');
    card.className = 'carry-card' + (selected.has(v.id)?' sel':'');
    card.innerHTML = `<span class="cc-top">${DEF[v.type].icon||''} <b>${name}</b></span>
      <span class="cc-stat">★ Lv ${v.stars||0} · ❤ ${v.hp|0}/${v.maxHp}</span>${teaser}`;
    card.onclick = ()=>{
      if(selected.has(v.id)) selected.delete(v.id);
      else if(selected.size>=cap){ countEl.classList.remove('flash'); void countEl.offsetWidth; countEl.classList.add('flash'); return; }
      else selected.add(v.id);
      card.classList.toggle('sel', selected.has(v.id));
      updateCount();
    };
    listEl.appendChild(card);
  });
  updateCount();
  nextBtn.onclick = ()=> proceed(vets.filter(v=>selected.has(v.id)));
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

