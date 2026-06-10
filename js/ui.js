/* ui.js — menu / HUD: refreshUI, command panel, toasts, intro crawl, win/lose, game-flow (startGame/loadMap/buildMapSelect). */
/* =====================================================================
   UI (command panel + info)
   ===================================================================== */
const elCmd=document.getElementById('commands');
const elTitle=document.getElementById('sel-title');
const elDesc=document.getElementById('sel-desc');
const elStats=document.getElementById('sel-stats');
const elDossierBtn=document.getElementById('sel-dossier');

// Persistent map-wide boss HP bar (#bossbar). Shows while a VILLAIN lives, hides otherwise. Reads
// only synced entity fields (villain/villainName/villainId/hp/maxHp/bossPhase) so it is correct on
// a co-op CLIENT too. Per-villain color comes from the global VILLAINS table (present everywhere);
// phase 2 swaps the --boss-color to red and adds the crack/shake via the .bossbar--rage class.
function updateBossBar(){
  const bb=document.getElementById('bossbar'); if(!bb) return;
  const boss = G && G.entities && G.entities.find(e=>e.villain && !e.dead && !e.escaped);
  if(!boss){ if(bb.style.display!=='none') bb.style.display='none'; return; }
  const def=(typeof VILLAINS!=='undefined') && VILLAINS[boss.villainId];
  bb.style.display='';
  // themed "Madosis" enrage (Rex phase 2): red + crack + shake. Derive from synced bossPhase + the static
  // VILLAINS def so it's correct on a co-op CLIENT too (boss.madFlavor itself isn't synced).
  const rage = !!boss.madFlavor || (boss.bossPhase>=2 && def && def.phases && def.phases.some(ph=>ph.madFlavor));
  bb.classList.toggle('bossbar--rage', rage);
  // inline --boss-color wins over the stylesheet, so set the rage RED here (else the .bossbar--rage rule can't apply)
  bb.style.setProperty('--boss-color', rage ? '#ff5b5b' : ((def && def.neonColor) || '#50e6ff'));
  document.getElementById('bossbar-name').textContent = boss.villainName || (def && def.name) || 'BOSS';
  const frac=Math.max(0, Math.min(1, boss.maxHp ? boss.hp/boss.maxHp : 0));
  document.getElementById('bossbar-fill').style.width=(frac*100)+'%';
  const hpEl=document.getElementById('bossbar-hp'); if(hpEl) hpEl.textContent=Math.round(frac*100)+'%';
}
// T2-5: income/sec — a rolling ~3s delta of gold_collected (deposits + Satellite trickle).
// Local HUD read only; pruned sample window, no sim impact.
let _incomeSamples=[];
function incomePerSec(eco){
  const now=performance.now()/1000, v=eco.gold_collected||0;
  _incomeSamples.push({t:now, v});
  while(_incomeSamples.length>2 && now-_incomeSamples[0].t>3) _incomeSamples.shift();
  const first=_incomeSamples[0];
  const dt=now-first.t;
  if(dt<0.5) return null;
  return Math.max(0,(v-first.v)/dt);
}
function refreshUI(){
  if(!G) return;
  const _eco=playerEco(G, LOCAL_CTRL);              // HUD shows THIS client's own pool
  document.getElementById('gold').textContent = (G.hub && typeof CAMPAIGN!=='undefined') ? ('M3$ '+(CAMPAIGN.m3|0)) : (_eco.gold|0);
  const _inc=document.getElementById('income');
  if(_inc){ const r=(!G.hub && !G.over) ? incomePerSec(_eco) : null; _inc.textContent = r==null ? '' : ('+'+r.toFixed(1)+'/s'); }
  document.getElementById('supply').textContent = _eco.supply+'/'+_eco.supplyCap;
  document.getElementById('mapname').textContent = G.cfg.name;
  document.getElementById('objective').textContent = G.cfg.objective;
  updateBossBar();

  const sel=G.selection.filter(e=>!e.dead);

  // ---- in-world "unit selected" bark: fires only when the selection becomes a NEW single unit ----
  if(typeof onSelectionRefresh==='function') onSelectionRefresh(sel);

  // ---- info text (cheap text updates — safe to refresh every call) ----
  // While placing a building, preview what it does (and who it hires) so the
  // player can decide before dropping it — takes over the panel from selection.
  if(G.placing){
    showPlacingInfo(G.placing);
  } else if(!sel.length){
    elTitle.textContent='Nothing selected';
    elStats.textContent=''; if(elDossierBtn) elDossierBtn.style.display='none';
    // HUB has no combat — a concise, relevant line (also keeps the idle bar short on desktop).
    elDesc.innerHTML = G.hub
      ? 'Select a <b>unit</b>, or walk one up to a facility (<b>CONDO</b> · <b>M.D.C.</b> · <b>ULTRA</b> · <b>Training</b>) to manage it. <b>Drag</b> to pan, <b>pinch</b>/wheel to zoom.'
      : '<b>Tap</b> a unit to select; tap an enemy/mine/ground to attack, gather or move. <b>Drag</b> to pan, <b>pinch</b> (or wheel / +−) to zoom.<br><b>Units box-select:</b> Shift+drag or the <b>Select box</b> button. Select a <b>Worker</b> then a build button, then tap a spot. <b>Shift+1-9</b> set / <b>1-9</b> recall control group.';
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
      // T1-5: madosis readout for units with a minted sanity threshold — same amber/red escalation as the world bar
      let madSt='';
      if(e.owner==='player' && typeof madThreshold==='function'){
        const thr=madThreshold(e);
        if(thr>0){ const fr=Math.min(1,(e.madosis||0)/thr);
          const col=(typeof madColor==='function')?madColor(fr):(fr>0.85?'#ff5b6b':fr>0.6?'#ffb13f':'#b08cff');
          madSt=`<span class="st" style="color:${col}" title="Madosis — trauma vs. breaking point">🧠 ${Math.round(e.madosis||0)}/${Math.round(thr)}</span>`; }
      }
      // T2-4: surface the counter axis — armor shrugs small-arms, pierce ignores armor
      let counterSt='';
      if(d.armor>0) counterSt+=`<span class="st" title="Armor — takes ${Math.round(d.armor*100)}% less damage from non-piercing attacks">🛡 ${Math.round(d.armor*100)}%</span>`;
      if(d.pierce)  counterSt+=`<span class="st" title="Piercing — ignores enemy armor">🗡 AP</span>`;
      if(e.sprinting) counterSt+=`<span class="st" style="color:#7fd6ff" title="Sprinting — running and ignoring fire">💨 sprinting</span>`;   // T2-6 legibility
      elStats.innerHTML=`<span class="st">★ Lv ${lvl}</span><span class="st">❤ ${e.hp|0}/${e.maxHp}</span><span class="st">⚔ ${dmg}</span>`+counterSt+madSt;
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
    } else if(e.type==='hq' && typeof hqStoredUnits==='function'){
      const stored=hqStoredUnits(G,e).length;
      if(stored) extra=`${stored} unit${stored===1?'':'s'} stored`;
    } else if(G.hub && e.hubPoi && e.hubPoi.kind==='mdc' && typeof hqStoredUnits==='function'){
      const stored=hqStoredUnits(G,e).length;
      if(stored) extra=`${stored} unit${stored===1?'':'s'} staged`;
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
  // reveal the placement preview's description on mobile (where .desc is normally hidden)
  const si=document.getElementById('selinfo'); if(si) si.classList.toggle('placing', !!G.placing);

  // production-queue cards live in the selected building's info panel
  updateProdQueue((sel.length===1 && sel[0].kind==='building' && (sel[0].owner==='player' || (G.hub && sel[0].hubPoi))) ? sel[0] : null);

  // Layout hooks for the responsive bottom bar: flag HUB mode + the idle (nothing-selected)
  // state so CSS can slim the desktop panel/minimap when idle in the HUB. Toggling #bottom's
  // height trips the ResizeObserver, which re-syncs VIEW_BOT so the canvas viewport follows.
  const bottomEl=document.getElementById('bottom');
  if(bottomEl) bottomEl.classList.toggle('sel-empty', !G.placing && !sel.length);
  document.body.classList.toggle('in-hub', !!G.hub);
  // tutorial: re-attach the step's button highlight (buttons rebuild on signature change) and
  // re-assert its objective line (overwritten at line 17 each tick). No-op when inactive.
  if(typeof TUTORIAL!=='undefined') TUTORIAL.reapplyHighlight();
}

// Preview a building in the info panel while the player is choosing where to
// drop it (G.placing). Reuses the building's flavor as the "what it does" blurb
// and lists the roster it can hire (BUILD_HIRES) so the player knows what the
// building is for before committing the Funding.
function showPlacingInfo(p){
  const d=p.def, t=p.type;
  elTitle.textContent=(d.icon?d.icon+' ':'')+d.name;
  if(elDossierBtn) elDossierBtn.style.display='none';
  elStats.innerHTML=`<span class="st">💰 ${d.cost}</span><span class="st">❤ ${d.hp}</span><span class="st">🏗 ${d.build}s</span>`;
  let html = d.flavor ? `<span style="color:#9e7780;font-style:italic;">${d.flavor}</span>` : '';
  const hires=(typeof BUILD_HIRES!=='undefined' && BUILD_HIRES[t]) || null;
  if(hires){
    const names=hires.map(u=>DEF[u]&&DEF[u].name).filter(Boolean).join(', ');
    if(names) html+=(html?'<br>':'')+`<b>Hires:</b> ${names}`;
  }
  html+=(html?'<br>':'')+`<span style="color:#7fa8c8;">Tap a spot to build · Esc to cancel</span>`;
  elDesc.innerHTML=html;
}

// Build / refresh the queue cards for a selected player building (or clear them).
// Cards (DOM) rebuild only when the queue contents change; the active card's
// progress bar and each idle sprite refresh every call.
function updateProdQueue(b){
  const wrap=document.getElementById('prod-queue'); if(!wrap) return;
  const q=(b && b.prodQueue) ? b.prodQueue : [];
  const stored=(b && typeof hqStoredUnits==='function' && (b.type==='hq' || (G.hub && b.hubPoi && b.hubPoi.kind==='mdc'))) ? hqStoredUnits(G,b) : [];
  if(!b || (!q.length && !stored.length)){
    if(wrap._sig){ wrap.innerHTML=''; wrap._sig=''; }
    return;
  }
  const sig=b.id+':q:'+q.join(',')+':s:'+stored.map(u=>u.id).join(',');
  if(sig!==wrap._sig){ wrap._sig=sig; buildProdCards(wrap,b,stored); }
  for(const card of wrap.children){
    drawCardSprite(card, card._type, card._owner);
    const pi=card.querySelector('.pq-prog>i');
    if(pi) pi.style.width = (card._queueIndex===0 && b.prodTotal>0 ? Math.min(100,(b.prodTime/b.prodTotal*100))|0 : 0)+'%';
  }
}
function buildProdCards(wrap,b,stored){
  wrap.innerHTML='';
  (b.prodQueue||[]).forEach((type,i)=>{
    const card=document.createElement('div'); card.className='pq-card'; card.title='Cancel '+(DEF[type].name||type);
    card._type=type; card._owner=b.owner; card._queueIndex=i;
    const cv=document.createElement('canvas'); cv.width=40; cv.height=40; cv.className='pq-spr'; card.appendChild(cv);
    if(i===0){ const pr=document.createElement('div'); pr.className='pq-prog'; pr.innerHTML='<i></i>'; card.appendChild(pr); }
    const x=document.createElement('button'); x.className='pq-x'; x.textContent='✕';
    x.onclick=(ev)=>{ ev.stopPropagation(); if(typeof isGamePaused==='function' && isGamePaused()) return; (typeof netCancelTrain==='function'?netCancelTrain:cancelTrain)(G, b, [...wrap.children].indexOf(card)); refreshUI(); };
    card.appendChild(x);
    wrap.appendChild(card);
  });
  stored.forEach(u=>{
    const card=document.createElement('button'); card.className='pq-card pq-stored'; card.title='Release '+(DEF[u.type].name||u.type);
    card._type=u.type; card._owner=u.owner; card._queueIndex=-1;
    const cv=document.createElement('canvas'); cv.width=40; cv.height=40; cv.className='pq-spr'; card.appendChild(cv);
    const out=document.createElement('span'); out.className='pq-out'; out.textContent='↩'; card.appendChild(out);
    card.onclick=(ev)=>{
      ev.stopPropagation();
      if(typeof isGamePaused==='function' && isGamePaused()) return;
      if(G.hub && b.hubPoi && b.hubPoi.kind==='mdc' && typeof hubReleaseFromMdc==='function') hubReleaseFromMdc(hubUnitKey(u));
      else (typeof netReleaseStored==='function'?netReleaseStored:releaseStoredUnit)(G,b,u.id);
    };
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
    c.font='22px '+GAME_FONT; c.textAlign='center'; c.textBaseline='middle';
    c.fillText((DEF[type]&&DEF[type].icon)||'•', cv.width/2, cv.height/2+1);
  }
}

// Signature of which command buttons should be shown for the current selection.
function cmdSig(sel){
  if(G && G.hub) return 'hub:'+sel.map(e=>e.id+':'+(e.hubPoi?e.hubPoi.kind:'')+':'+(e.type||'')).join(',')+':'+(typeof CAMPAIGN!=='undefined'?CAMPAIGN.m3:0)+':'+((typeof CAMPAIGN!=='undefined'&&CAMPAIGN.dispatch&&CAMPAIGN.dispatch.staged)||[]).join('|');
  if(!sel.length) return 'empty';
  const owned=sel.filter(e=>e.owner==='player');
  if(!owned.length) return 'enemy';
  const has=t=>owned.some(e=>e.type===t&&!e.constructing);
  const hasG=G.entities.some(e=>!e.dead&&e.owner==='player'&&e.type==='garage'&&!e.constructing); // gates Launch Pad button
  // Extraction button: rebuild when the phase opens or the selected HQ's garrison count changes (gates clickable).
  const xr=G.extractReady?1:0;
  const selHq=owned.find(e=>e.type==='hq'&&!e.constructing);
  const xs=(xr && selHq && typeof hqStoredUnits==='function') ? hqStoredUnits(G,selHq).length : 0;
  // T2-2/T2-3: tactics buttons rebuild when the combat selection's stance or ability-type set changes
  const combat=owned.filter(e=>e.kind==='unit'&&!e.storedIn&&e.type!=='worker');
  const stSig=combat.length?(combat[0].stance||'aggr'):'-';
  const abSig=(typeof ABILITIES!=='undefined')?[...new Set(combat.filter(u=>ABILITIES[u.type]).map(u=>u.type))].sort().join('.'):'';
  return 'h'+(has('hq')?1:0)+'b'+(has('barracks')?1:0)+'g'+(has('garage')?1:0)+'l'+(has('launchpad')?1:0)
       +'w'+(owned.some(e=>e.type==='worker')?1:0)+'G'+(hasG?1:0)
       +'u'+(owned.some(e=>e.kind==='unit')?1:0)+'c'+(combat.length?1:0)+'s'+stSig+'a'+abSig
       +'x'+xr+'X'+xs;
}
// Resolve a live, selected, finished building of a given type at click time
// (handlers must not capture stale entity refs, since buttons now persist).
function selectedBuilding(type){
  return G.selection.find(e=>!e.dead && e.owner==='player' && e.type===type && !e.constructing);
}
function buildCommands(sel){
  elCmd.innerHTML='';
  if(G && G.hub){ buildHubCommands(sel); return; }
  const owned=sel.filter(e=>e.owner==='player');
  if(!owned.length){ elCmd.classList.remove('has-cmds'); syncCmdLine(); return; }
  const hasFinished=t=>G.entities.some(e=>!e.dead&&e.owner==='player'&&e.type===t&&!e.constructing);
  const train=(bType,uType)=>{ const b=selectedBuilding(bType); if(b) (typeof netTrain==='function'?netTrain:tryTrain)(G,b,uType); };
  if(owned.some(e=>e.type==='hq'&&!e.constructing)){
    addCmd(DEF.worker.icon,'Hire Intern',DEF.worker.cost,()=>train('hq','worker'),null,'hire-intern');
    // Post-victory extraction: appears once the mission is won, clickable only when a unit is garrisoned.
    if(G.extractReady){
      const hq=selectedBuilding('hq');
      const ready = !!hq && typeof hqStoredUnits==='function' && hqStoredUnits(G,hq).length>0;
      addCmd('🚁','Extraction',null,()=>tryStartExtraction(), ready?'':'disabled','extraction');
    }
  }
  if(owned.some(e=>e.type==='barracks'&&!e.constructing)){
    addCmd(DEF.soldier.icon,'Growth Cyborg',DEF.soldier.cost,()=>train('barracks','soldier'),null,'train-soldier');
    addCmd(DEF.ranger.icon,'Consultant',DEF.ranger.cost,()=>train('barracks','ranger'),null,'train-ranger');
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
    addCmd(DEF.courier.icon,'Drugztore Delivery Drone',DEF.courier.cost,()=>train('launchpad','courier'));
    addCmd(DEF.bomber.icon,'Buzzword Bomber',DEF.bomber.cost,()=>train('launchpad','bomber'));
  }
  if(owned.some(e=>e.type==='worker')){
    addCmd(DEF.hq.icon,'Open-Plan HQ',350,()=>tryPlaceFixed('hq'));
    addCmd(DEF.outpost.icon,'Satellite Office',DEF.outpost.cost,()=>tryPlace(G,'outpost'));
    addCmd(DEF.barracks.icon,'People Ops',DEF.barracks.cost,()=>tryPlace(G,'barracks'),null,'build-barracks');
    addCmd(DEF.turret.icon,'Legal Team',DEF.turret.cost,()=>tryPlace(G,'turret'),null,'build-turret');
    addCmd(DEF.garage.icon,'The Garage',DEF.garage.cost,()=>tryPlace(G,'garage'));
    if(hasFinished('garage')) addCmd(DEF.launchpad.icon,'Launch Pad',DEF.launchpad.cost,()=>tryPlace(G,'launchpad'));
  }
  // ---- unit tactics (T2-2/T2-3): attack-move, stance cycle, manual ability ----
  const combat=owned.filter(e=>e.kind==='unit'&&!e.storedIn&&e.type!=='worker');
  if(combat.length){
    if(combat.length>=3 && typeof TUTORIAL!=='undefined' && TUTORIAL.fireContextual) TUTORIAL.fireContextual('amove-tip', G);   // teach it the first time a real squad is selected (T2-3)
    addCmd('⚔','Attack-Move',null,()=>{ if(typeof armAttackMove==='function') armAttackMove(true); },'amove-btn','attack-move');
    const st=combat[0].stance||'aggr';
    const stLbl = st==='hold'?'Hold Ground' : st==='def'?'Defensive' : 'Aggressive';
    const stIco = st==='hold'?'🛡' : st==='def'?'🚧' : '🔥';
    addCmd(stIco,'Stance: '+stLbl,null,()=>{
      const next = st==='aggr'?'def' : st==='def'?'hold' : 'aggr';
      (typeof netStance==='function'?netStance:(g,s)=>setStance(g,g.selection,s))(G,next);
      G._cmdSig=null; refreshUI();
    },null,'stance');
    if(typeof ABILITIES!=='undefined'){
      const abTypes=[...new Set(combat.filter(u=>ABILITIES[u.type]).map(u=>u.type))].slice(0,3);
      for(const t of abTypes){
        const spec=ABILITIES[t];
        addCmd(spec.icon, spec.name, null, ()=>{ (typeof netAbility==='function'?netAbility:(g)=>castAbility(g,g.selection))(G); }, 'abil-btn', 'ability-'+t);
        const btn=elCmd.lastChild; if(btn){ btn._abilType=t; btn.title=spec.hint||''; }
      }
    }
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
function buildHubCommands(sel){
  if(typeof hubCanAct==='function' && !hubCanAct()){
    elCmd.classList.toggle('has-cmds', false);
    syncCmdLine();
    return;
  }
  const owned=sel.filter(e=>e.owner==='player');
  const poi=sel.find(e=>e.hubPoi);
  const unit=owned.find(e=>e.kind==='unit');
  // Each HUB facility opens its full-screen menu in the reusable shell (openHubMenu).
  if(poi && poi.hubPoi.kind==='condo')    addCmd('🏙️','CONDO',null,()=>openCondoMenu(poi));
  if(poi && poi.hubPoi.kind==='mdc')      addCmd('🛰️','M.D.C.',null,()=>openMdcMenu(poi));
  if(poi && poi.hubPoi.kind==='ultra')    addCmd('◆','ULTRA',null,()=>openUltraMenu());
  if(poi && poi.hubPoi.kind==='training') addCmd('🎯','TRAINING GROUNDS',null,()=>openTrainingMenu());
  if(poi && poi.hubPoi.kind==='mentalhealth') addCmd('🧠','MENTAL HEALTH',null,()=>openHealingMenu());
  if(poi && poi.hubPoi.kind==='wake')     addCmd('⚡','THE WAKE',null,()=>openWakeMenu());
  if(!poi && !unit) addCmd('🕯','VETERANS & MEMORIAL',null,()=>showRoster());   // top-level in the HUB (T1-7)
  if(unit){
    const key=hubUnitKey(unit), up=(CAMPAIGN.upgrades[key]||{}), il=up.implantLevel||0;
    addCmd('🧬','Implant',HUB.implantCosts[il]==null?null:HUB.implantCosts[il],()=>hubUpgradeSelectedUnit('implant'));
    addCmd('🧥','Style',up.styleId?null:HUB.styleCost,()=>hubUpgradeSelectedUnit('style'));
    addCmd('🎓','Academy',up.academyVisit===CAMPAIGN.visit?null:HUB.academyCost,()=>hubUpgradeSelectedUnit('academy'));
  }
  elCmd.classList.toggle('has-cmds', elCmd.children.length>0);
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
  sb.disabled = !!(typeof isGamePaused==='function' && isGamePaused()) ||
    !(G && G.selection.some(e=>!e.dead && e.kind==='unit' && e.owner==='player'));
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
  const _g=(G && G.hub && typeof CAMPAIGN!=='undefined') ? CAMPAIGN.m3 : playerEco(G, LOCAL_CTRL).gold;
  for(const b of kids){
    if(b._cost!=null) b.classList.toggle('disabled', _g < b._cost);
    // T2-2: ability buttons dim while every selected unit of that type is still on cooldown
    if(b._abilType){
      const ready=G.selection.some(u=>!u.dead && u.type===b._abilType && (u.abilCd||0)<=0);
      b.classList.toggle('disabled', !ready);
    }
  }
}
// HQ has cost 0 in DEF (starting), but expanding should cost something:
function tryPlaceFixed(type){
  if(type==='hq'){ // override cost for extra HQ
    if(playerEco(G, LOCAL_CTRL).gold<350){ toast('Extra Command Center costs 350 gold'); return; }
    const sel=G.selection.find(e=>e.kind==='unit'&&e.type==='worker'&&!e.dead);
    if(!sel){ toast('Select a Worker first'); return; }
    G.placing={type:'hq', def:Object.assign({},DEF.hq,{cost:350}), builder:sel};
    toast('Tap a spot for the Command Center (Cancel / Esc to abort)');
  }
}

function addCmd(emoji,label,cost,fn,extraClass,key){
  const b=document.createElement('div'); b.className='cmd-btn'+(extraClass?' '+extraClass:'');
  if(key) b.dataset.cmd = key;                 // stable, viewport-independent hook for the tutorial highlight
  b._cost = cost;                              // used by updateAffordability()
  const funds=(G && G.hub && typeof CAMPAIGN!=='undefined') ? CAMPAIGN.m3 : playerEco(G, LOCAL_CTRL).gold;
  if(cost!=null && funds<cost) b.classList.add('disabled');
  b.innerHTML=`<span class="emoji">${emoji}</span><span>${label}</span>${cost!=null?`<span class="cost">${cost}🪙</span>`:''}`;
  b.onclick=()=>{ if(typeof isGamePaused==='function' && isGamePaused()) return; fn(); refreshUI(); };
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
function toast(msg,ms){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.remove('event'); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=null;
  if(ms!==0) toastTimer=setTimeout(()=>t.classList.remove('show'),ms==null?1800:ms);
  logEvent(msg,false);
}
function clearToast(){
  const t=document.getElementById('toast'); if(!t) return;
  clearTimeout(toastTimer); toastTimer=null; t.classList.remove('show');
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
function inPregameMenu(){ return !(G && running); }
function showSub(id){ const el=document.getElementById(id); if(el) el.style.display='flex';
  if(id==='startScreen' && typeof syncContinueButton==='function') syncContinueButton();   // refresh ▶ Continue (T0-8)
  if(typeof MUSIC!=='undefined' && inPregameMenu()) MUSIC.enterMenu();
}
function hideSub(id){ const el=document.getElementById(id); if(el) el.style.display='none'; }

// career v3: per-unit dossier modal + campaign roster/memorial
// The dossier is a two-column panel: LEFT is the personnel file (dossierHTML);
// RIGHT is a live H.U.B.-style player card (animated idle sprite + name/type +
// HP bar synced to the world-view bar + a madosis bar). The game keeps running
// while it's open, so dossierTick() refreshes the card every frame from the live unit.
let dossierUnit=null, dossierRaf=0;
function showDossier(u){
  if(!u || !u.lore || typeof dossierHTML!=='function') return;
  const keepRunning = !!(G && running && !G.over);
  dossierUnit = u;
  document.getElementById('dossierBody').innerHTML = dossierBodyHTML(u);
  document.body.classList.add('dossier-open');   // hide the bottom HUD so the z-19 panel reads as full-bleed (HUB-menu behavior)
  showSub('dossierScreen');
  dossierSyncTop();                       // sit the full-bleed panel just below the (responsive) topbar
  dossierSyncHud();                       // recompute VIEW_BOT with #bottom hidden (drops the LNS to bottom:0)
  if(keepRunning) running=true;
  if(!dossierRaf) dossierRaf=requestAnimationFrame(dossierTick);
}
// keep the full-bleed dossier below the (possibly 2-row, responsive) topbar — mirrors hubMenuSyncTop.
function dossierSyncTop(){
  const v=document.getElementById('dossierScreen'); if(!v) return;
  if(typeof VIEW_TOP==='number'){ const t=VIEW_TOP+'px'; if(v.style.top!==t) v.style.top=t; }
}
function dossierSyncHud(){
  if(typeof syncHud==='function'){ syncHud(); if(typeof G!=='undefined' && G && typeof clampCam==='function') clampCam(G); }
}
// close + tear down: restore the bottom HUD and the gameplay viewport (mirrors closeHubMenu).
function closeDossier(){
  hideSub('dossierScreen');
  document.body.classList.remove('dossier-open');
  if(dossierRaf){ cancelAnimationFrame(dossierRaf); dossierRaf=0; }
  dossierUnit=null;
  dossierSyncHud();
}
function dossierBodyHTML(u){
  // Left column: a header row [Back button | name+role] so Back is reachable without scrolling
  // and sits cleanly beside the player name; then the personnel file below at full width.
  return `<div class="dossier-2col">`
    + `<div class="dossier-col-left">`
    +   `<div class="dossier-headrow">`
    +     `<button class="sc-btn back dossier-back" onclick="closeDossier()">◀ Back</button>`
    +     `<div class="dossier dossier-head">${dossierHeadHTML(u)}</div>`
    +     (typeof shareCard==='function' ? `<button class="sc-btn back dossier-share" onclick="shareCard(dossierUnit)" title="Share this personnel file as an image">⇪ Share File</button>` : '')
    +   `</div>`
    +   `<div class="dossier">${dossierFileHTML(u)}</div>`
    + `</div>`
    + `<div class="dossier-col-right">${dossierCardHTML(u)}</div>`
    + `</div>`;
}
// the live player card markup — a big version of the HUB unit card (hubMenuUnitCard).
// The bar <i> widths/colors and the sprite are driven live by dossierTick().
function dossierCardHTML(u){
  const def=DEF[u.type], lvl=u.stars||0;
  let name='';
  try{ const d=(u.lore && typeof buildDossier==='function')?buildDossier(u):null; name=(d&&d.full)?d.full:(u.heroId||def.name); }
  catch(e){ name=u.heroId||def.name; }
  const type=(def.icon?def.icon+' ':'')+(lvl>0?careerTitle(lvl)+' ':'')+def.name+' · Lv '+lvl;
  return `<div class="dcard">`
    + `<canvas class="dcard-spr" width="220" height="220" data-type="${u.type}" data-sprite="${u.spriteType||''}"></canvas>`
    + `<div class="dcard-name">${name}</div>`
    + `<div class="dcard-type">${type}</div>`
    + `<div class="dcard-bars">`
    +   `<div class="dcard-bar dcard-hp"><i></i><span class="dcard-bar-cap">HP</span><span class="dcard-bar-val"></span></div>`
    +   `<div class="dcard-bar dcard-mad"><i></i><span class="dcard-bar-cap">Madosis</span><span class="dcard-bar-val"></span></div>`
    + `</div></div>`;
}
// per-frame refresh of the live card; self-terminates when the dossier is hidden.
function dossierTick(){
  const scr=document.getElementById('dossierScreen');
  if(!scr || scr.style.display==='none' || !dossierUnit){
    dossierRaf=0; dossierUnit=null;
    if(document.body.classList.contains('dossier-open')){ document.body.classList.remove('dossier-open'); dossierSyncHud(); }  // fallback teardown if hidden without closeDossier()
    return;
  }
  dossierSyncTop();                        // track responsive topbar height changes while open
  const u=dossierUnit, body=document.getElementById('dossierBody');
  if(body){
    const cv=body.querySelector('canvas.dcard-spr');
    if(cv) drawTrainCanvas(cv, cv.dataset.type, cv.dataset.sprite||'', performance.now()/1000);
    // HP — same fraction + hpColor thresholds the world-view bar uses; 0 once dead.
    const maxHp=u.maxHp||1, hp=u.dead?0:Math.max(0,u.hp||0), hpFrac=Math.max(0,Math.min(1,hp/maxHp));
    const hpI=body.querySelector('.dcard-hp>i'); if(hpI){ hpI.style.width=(hpFrac*100)+'%'; hpI.style.background=hpColor(hpFrac); }
    const hpV=body.querySelector('.dcard-hp .dcard-bar-val'); if(hpV) hpV.textContent=(hp|0)+' / '+(maxHp|0);
    // Madosis — accumulated points vs the unit's effective break threshold (0 = no mind to break yet).
    const thr=(typeof madThreshold==='function')?madThreshold(u):(u.sanityThreshold||0);
    const mad=u.madosis||0, madFrac=thr>0?Math.max(0,Math.min(1,mad/thr)):0;
    const madBar=body.querySelector('.dcard-mad');
    const madI=body.querySelector('.dcard-mad>i'); if(madI) madI.style.width=(madFrac*100)+'%';
    const madV=body.querySelector('.dcard-mad .dcard-bar-val'); if(madV) madV.textContent=thr>0?(Math.round(mad)+' / '+Math.round(thr)):'—';
    if(madBar) madBar.classList.toggle('over', thr>0 && mad>=thr);
  }
  dossierRaf=requestAnimationFrame(dossierTick);
}
function showRoster(){
  const b=document.getElementById('rosterBody'); if(!b || typeof rosterHTML!=='function') return;
  b.innerHTML = rosterHTML();
  b.querySelectorAll('.roster-row[data-uid]').forEach(el=>{
    el.onclick=()=>{ const id=+el.dataset.uid; const u=G&&G.entities.find(e=>e.id===id&&!e.dead); if(u){ hideSub('rosterScreen'); showDossier(u); } };
  });
  // share-card buttons (T0-6): living rows by unit id, fallen rows by memorial index
  if(typeof shareCard==='function'){
    b.querySelectorAll('.roster-share[data-share-uid]').forEach(el=>{
      el.onclick=(ev)=>{ ev.stopPropagation(); const u=G&&G.entities.find(e=>e.id===+el.dataset.shareUid&&!e.dead); if(u) shareCard(u); };
    });
    b.querySelectorAll('.roster-share[data-share-fidx]').forEach(el=>{
      el.onclick=(ev)=>{ ev.stopPropagation(); const f=(typeof fallenVets!=='undefined')&&fallenVets[+el.dataset.shareFidx]; if(f) shareCard(f); };
    });
  }
  showSub('rosterScreen');
}

/* =====================================================================
   HUB MENU SYSTEM — reusable full-screen building-menu shell.
   One controller drives a pluggable `spec` for each facility (Training Grounds,
   M.D.C., Condo, ULTRA). A spec = { id, icon, title, subtitle, build(body),
   tick?(body), signature?() }. The shell keeps #topbar + the LNS ticker visible,
   dims the HUB behind, rebuilds on signature change, and animates every unit-card
   canvas in the body. Facilities open it from buildHubCommands.
   ===================================================================== */
let hubMenu = { raf:0, sig:'', spec:null };
function hubMenuOpen(){ const v=document.getElementById('hubMenuView'); return !!(v && v.style.display!=='none'); }
function openHubMenu(spec){
  if(!spec) return;
  hubMenu.spec=spec; hubMenu.sig='';
  const set=(id,html)=>{ const e=document.getElementById(id); if(e) e.innerHTML=html||''; };
  set('hubMenuIcon', spec.icon); set('hubMenuTitle', spec.title); set('hubMenuSub', spec.subtitle);
  buildHubMenuBody();
  document.body.classList.add('hub-menu-open');
  showSub('hubMenuView');
  hubMenuSyncTop();
  if(typeof syncHud==='function'){ syncHud(); if(typeof G!=='undefined'&&G&&typeof clampCam==='function') clampCam(G); }
  if(!hubMenu.raf) hubMenu.raf=requestAnimationFrame(hubMenuTick);
}
function closeHubMenu(){
  hideSub('hubMenuView');
  document.body.classList.remove('hub-menu-open');
  if(hubMenu.raf){ cancelAnimationFrame(hubMenu.raf); hubMenu.raf=0; }
  hubMenu.spec=null;
  if(typeof syncHud==='function'){ syncHud(); if(typeof G!=='undefined'&&G&&typeof clampCam==='function') clampCam(G); }
}
function buildHubMenuBody(){
  const body=document.getElementById('hubMenuBody'), spec=hubMenu.spec; if(!body||!spec) return;
  hubMenu.sig = spec.signature ? spec.signature() : '';
  body.innerHTML=''; spec.build(body);
}
// keep the panel below the (possibly 2-row, responsive) topbar — VIEW_TOP is the measured topbar height
function hubMenuSyncTop(){
  const v=document.getElementById('hubMenuView'); if(!v) return;
  if(typeof VIEW_TOP==='number'){ const t=VIEW_TOP+'px'; if(v.style.top!==t) v.style.top=t; }
}
function hubMenuTick(){
  const v=document.getElementById('hubMenuView');
  if(!v || v.style.display==='none'){ hubMenu.raf=0; return; }
  const spec=hubMenu.spec, body=document.getElementById('hubMenuBody');
  if(spec){
    if(spec.signature){ const s=spec.signature(); if(s!==hubMenu.sig) buildHubMenuBody(); }
    if(spec.tick && body) spec.tick(body);
  }
  // shared: animate every unit-card portrait in the body (any facility menu)
  if(body){ const tnow=performance.now()/1000;
    body.querySelectorAll('canvas.train-spr').forEach(cv=>drawTrainCanvas(cv, cv.dataset.type, cv.dataset.sprite||'', tnow)); }
  hubMenuSyncTop();
  hubMenu.raf=requestAnimationFrame(hubMenuTick);
}

/* ---- reusable building-menu sub-components ---- */
function hubMenuSection(title){ const h=document.createElement('div'); h.className='train-h'; h.textContent=title; return h; }
// rigid column layout: hubMenuColumns(n) → a grid of n columns (collapses to 1 on narrow); each
// hubMenuColumn() is a stacked column. Building panels lay their sections into columns.
function hubMenuColumns(n){ const g=document.createElement('div'); g.className='hub-cols c'+(n||1); return g; }
function hubMenuColumn(scroll){ const c=document.createElement('div'); c.className='hub-col'+(scroll?' scroll':''); return c; }
// effective max HP for a roster snapshot / unit, INCLUDING its condo + implant H.U.B. bonuses, so
// cards reflect condo HP upgrades live. Mirrors applyVetHp()'s formula (career.js).
function hubUnitMaxHp(u){
  // the live H.U.B. unit's maxHp is the source of truth the world view shows — prefer it so the card
  // can never disagree with the in-world HP bar (the condo upgrade re-bakes that live maxHp).
  if(typeof G!=='undefined' && G && G.entities && u.key && typeof hubUnitKey==='function'){
    for(const e of G.entities){ if(!e.dead && e.kind==='unit' && e.owner==='player' && e.maxHp && hubUnitKey(e)===u.key) return e.maxHp; }
  }
  const def=DEF[u.type]; if(!def) return u.maxHp||0;
  const hpPerStar=(typeof CAREER!=='undefined'&&CAREER.hpPerStar)||0;
  let mul=1;
  if(typeof hubCondoForUnit==='function' && typeof CAMPAIGN!=='undefined' && CAMPAIGN.condos && u.key){
    const c=hubCondoForUnit(u.key), cl=c?(c.level||0):0;
    const up=(CAMPAIGN.upgrades && CAMPAIGN.upgrades[u.key])||{};
    mul=1 + cl*0.04 + (up.implantLevel||0)*0.03;
  }
  return Math.round(def.hp * (1 + hpPerStar*(u.stars||0)) * mul) || (u.maxHp||0);
}
// a card with a live-animated portrait (drawTrainCanvas, animated by hubMenuTick) + caption + optional action.
// `u` is a roster snapshot or a live unit (both expose type/stars/spriteType/lore/heroId).
function hubMenuUnitCard(u, opts){
  opts=opts||{};
  const card=document.createElement(opts.onClick?'button':'div');
  card.className='train-card'+(opts.sel?' sel':'');
  const cv=document.createElement('canvas'); cv.width=200; cv.height=200; cv.className='train-spr';
  cv.dataset.type=u.type; cv.dataset.sprite=u.spriteType||''; card.appendChild(cv);
  const cap=document.createElement('div'); cap.className='train-cap'; cap.innerHTML=opts.caption||trainTypeName(u); card.appendChild(cap);
  // HP: a compact green bar showing effective max HP (incl. condo/implant bonuses) so the player can
  // watch HP climb as they upgrade the condo. Units rest at full HP in the H.U.B., so it reads full.
  const _maxHp=hubUnitMaxHp(u);
  if(_maxHp>0){
    const hpBar=document.createElement('div');
    hpBar.style.cssText='position:relative;width:86%;height:13px;margin:4px auto 1px;background:rgba(0,0,0,.5);border:1px solid #5a2f3a;border-radius:4px;overflow:hidden';
    hpBar.title='Max HP '+_maxHp;
    const hi=document.createElement('i');
    hi.style.cssText='display:block;height:100%;width:100%;background:'+((typeof hpColor==='function')?hpColor(1):'#4cd964');
    hpBar.appendChild(hi);
    const hl=document.createElement('span'); hl.textContent='❤ '+_maxHp;
    hl.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#06210d;letter-spacing:.3px';
    hpBar.appendChild(hl);
    card.appendChild(hpBar);
  }
  // MADOSIS: a compact purple sanity bar under the name/type, once a unit can break (has a threshold).
  const _thr=(typeof madThreshold==='function')?madThreshold(u):(u.sanityThreshold||0);
  if(_thr>0){
    const mad=u.madosis||0, frac=Math.max(0,Math.min(1, mad/_thr)), over=mad>=_thr;
    const bar=document.createElement('div');
    bar.style.cssText='position:relative;width:86%;height:7px;margin:3px auto 1px;background:rgba(0,0,0,.5);border:1px solid #5a2f3a;border-radius:4px;overflow:hidden';
    bar.title='Madosis '+Math.round(mad)+' / '+Math.round(_thr)+(u.scarred?' · scarred':'');
    const i=document.createElement('i');
    i.style.cssText='display:block;height:100%;width:'+(frac*100)+'%;background:linear-gradient(90deg,#7a35ff,#b06bff)'+(over?';box-shadow:0 0 8px rgba(255,90,255,.85)':'');
    bar.appendChild(i); card.appendChild(bar);
  }
  if(opts.onClick) card.onclick=opts.onClick;
  if(opts.action){ const a=document.createElement('button'); a.className='hub-card-act'; a.textContent=opts.action.label;
    a.onclick=(ev)=>{ ev.stopPropagation(); opts.action.onClick(); }; card.appendChild(a); }
  return card;
}
// a wrapped grid of unit cards (the shared "card list" used by Training "Awaiting orders" + M.D.C. enlisted,
// so both render identically). `optsFn(u,i)` returns the per-card opts passed to hubMenuUnitCard.
function hubMenuUnitGrid(units, optsFn, cls){
  const grid=document.createElement('div'); grid.className=cls||'hub-cards';
  (units||[]).forEach((u,i)=>{ grid.appendChild(hubMenuUnitCard(u, optsFn?optsFn(u,i):{})); });
  return grid;
}
// a themed primary action button; `cost` (M3$) dims/disables it when unaffordable (null = free)
function hubMenuActionBtn(label, cost, enabled, onClick){
  const b=document.createElement('button');
  const afford = cost==null || (typeof CAMPAIGN!=='undefined' && (CAMPAIGN.m3|0)>=cost);
  const ok = enabled!==false && afford;
  b.className='sc-btn hub-action'+(ok?'':' disabled');
  b.innerHTML=label+(cost!=null?' · <b>M3$ '+cost+'</b>':'');
  b.onclick=()=>{ if(ok) onClick(); };
  return b;
}

/* ---- shared helpers (used by the menus) ---- */
// real-seconds → "Hh MMm" / "Mm SSs" countdown (1 in-game hour = HUB.trainHourSeconds real seconds)
function fmtTrainRemain(sec){
  sec=Math.max(0, Math.ceil(sec));
  const h=(sec/3600)|0, m=((sec%3600)/60)|0, s=sec%60;
  if(h>0) return h+'h '+String(m).padStart(2,'0')+'m';
  if(m>0) return m+'m '+String(s).padStart(2,'0')+'s';
  return s+'s';
}
// draw one big animated idle frame for a unit into its card canvas
function drawTrainCanvas(cv, type, spriteType, tnow){
  const c=cv.getContext('2d'); c.clearRect(0,0,cv.width,cv.height);
  const sType=spriteType||type;
  const anim=(typeof unitWalk==='function')?unitWalk(sType,'player'):null;
  if(anim && anim.ready && anim.frames){
    const n=anim.frames.length, fi=((tnow*4)|0)%n, fr=anim.frames[fi], fw=fr[2], fh=fr[3];
    const s=Math.min(cv.width/fw, cv.height/fh)*0.9, dw=fw*s, dh=fh*s;
    c.drawImage(anim.img, fr[0],fr[1],fw,fh, (cv.width-dw)/2, (cv.height-dh)/2, dw, dh);
  } else {
    c.font='72px '+GAME_FONT; c.textAlign='center'; c.textBaseline='middle';
    c.fillStyle='#bfe6ff'; c.fillText((DEF[type]&&DEF[type].icon)||'•', cv.width/2, cv.height/2);
  }
}
// Display name for a roster snapshot OR live unit: hero → heroId; career unit → dossier full name; else type.
function trainUnitName(s){
  if(!s) return '';
  if(s.heroId) return s.heroId;
  try { if(typeof buildDossier==='function' && s.lore){ const d=buildDossier({type:s.type, lore:s.lore, id:s.id}); if(d&&d.full) return d.full; } } catch(e){}
  return (DEF[s.type]&&DEF[s.type].name)||s.type;
}
function trainTypeName(s){ return ((DEF[s.type]&&DEF[s.type].name)||s.type)+' <b>'+trainUnitName(s)+'</b>'; }

/* ---- Training Grounds menu (the first facility migrated into the shell) ---- */
let trainSel=[];          // up to 2 selected staged unit keys (for pairing)
function trainPanelSignature(){
  const t=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.training)||{staged:[],sessions:[]};
  return 'st:'+(t.staged||[]).map(s=>s.key+'@'+(s.stars||0)).join(',')
       +'|se:'+(t.sessions||[]).map(s=>s.id+':'+(s.done?1:0)).join(',')
       +'|sel:'+trainSel.join(',');
}
function toggleTrainSel(key){
  const i=trainSel.indexOf(key);
  if(i>=0) trainSel.splice(i,1);
  else { trainSel.push(key); if(trainSel.length>2) trainSel.shift(); }
  buildHubMenuBody();
}
function buildTrainingBody(body){
  const t=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.training)||{staged:[],sessions:[]};
  const staged=t.staged||[], sessions=t.sessions||[];

  const sum=document.createElement('div'); sum.className='hub-stat';
  sum.innerHTML='Sessions <b>'+sessions.length+' / '+HUB.trainPairCap+'</b> · Trainees inside <b>'+(staged.length+sessions.length*2)+' / '+(HUB.trainPairCap*2)+'</b>';
  body.appendChild(sum);

  // rigid 2-column layout: LEFT = Awaiting orders, RIGHT = In training
  const cols=hubMenuColumns(2), left=hubMenuColumn(true), right=hubMenuColumn(true);
  cols.appendChild(left); cols.appendChild(right); body.appendChild(cols);

  // ---- LEFT: Awaiting orders (staged trainees + pairing) ----
  left.appendChild(hubMenuSection('Awaiting orders'));
  if(!staged.length){
    const m=document.createElement('div'); m.className='muted';
    m.textContent='Walk two same-type veterans into the Training Grounds (≤'+HUB.trainMaxGap+' levels apart), then pair them here.';
    left.appendChild(m);
  } else {
    left.appendChild(hubMenuUnitGrid(staged, s=>({
      sel: trainSel.includes(s.key),
      caption: trainTypeName(s)+'<br>'+(typeof careerTitle==='function'?careerTitle(s.stars||0):'')+' · Lv '+(s.stars||0),
      onClick: ()=>toggleTrainSel(s.key)
    })));

    const pc=document.createElement('div'); pc.className='train-pairctl';
    const a=staged.find(s=>s.key===trainSel[0]), b=staged.find(s=>s.key===trainSel[1]);
    let info='Select two units to train together.', canStart=false;
    if(trainSel.length>=2 && typeof hubTrainValidatePair==='function'){
      const v=hubTrainValidatePair(a,b);
      if(v.ok){ info='→ Both reach <b>Level '+v.target+'</b> · duration <b>'+v.hours+' in-game hour'+(v.hours===1?'':'s')+'</b>'; canStart=true; }
      else info=v.reason;
    }
    const txt=document.createElement('div'); txt.className='train-pairinfo'; txt.innerHTML=info; pc.appendChild(txt);
    const btn=document.createElement('button'); btn.className='sc-btn train-start'+(canStart?'':' disabled'); btn.textContent='Start Training';
    btn.onclick=()=>{ if(canStart && hubTrainCreateSession(trainSel[0],trainSel[1])){ trainSel=[]; buildHubMenuBody(); } };
    pc.appendChild(btn);
    left.appendChild(pc);
  }

  // ---- RIGHT: In training (active mentorship sessions) ----
  right.appendChild(hubMenuSection('In training'));
  if(!sessions.length){ const m=document.createElement('div'); m.className='muted'; m.textContent='No active mentorships.'; right.appendChild(m); }
  for(const ses of sessions){
    const card=document.createElement('div'); card.className='train-session'; card.dataset.sesid=ses.id;
    const pair=document.createElement('div'); pair.className='train-pair';
    [ses.a, ses.b].forEach(who=>{
      const slot=document.createElement('div'); slot.className='train-pair-slot';
      const cv=document.createElement('canvas'); cv.width=200; cv.height=200; cv.className='train-spr';
      cv.dataset.type=who.type; cv.dataset.sprite=who.spriteType||''; slot.appendChild(cv);
      const lab=document.createElement('div'); lab.className='train-cap';
      lab.innerHTML='<b>'+(who===ses.a?'Mentor':'Junior')+'</b><br>'+trainTypeName(who)+'<br>Lv '+(who.stars||0)+' → <b>Lv '+ses.target+'</b>';
      slot.appendChild(lab); pair.appendChild(slot);
    });
    card.appendChild(pair);
    const meta=document.createElement('div'); meta.className='train-meta';
    meta.innerHTML='<div class="train-countdown">…</div><div class="train-bar"><i></i></div>'
      +'<div class="muted">'+((DEF[ses.type]&&DEF[ses.type].name)||ses.type)+' · both → Level '+ses.target+'</div>';
    card.appendChild(meta);
    const wb=document.createElement('button'); wb.className='sc-btn train-withdraw'; wb.textContent='Withdraw — junior loses all gains';
    wb.onclick=()=>{ if(typeof hubTrainWithdraw==='function' && hubTrainWithdraw(ses.a.key)) buildHubMenuBody(); };
    card.appendChild(wb);
    right.appendChild(card);
  }
}
function openTrainingMenu(){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN.training) return;
  trainSel=[];
  openHubMenu({
    id:'training', icon:'🎯', title:'Training Grounds',
    subtitle:"Mentor a junior up to the senior's level + 1 — both lock in for the session",
    signature: trainPanelSignature,
    build: buildTrainingBody,
    tick: function(body){
      body.querySelectorAll('[data-sesid]').forEach(el=>{
        const ses=(CAMPAIGN.training.sessions||[]).find(s=>s.id===el.dataset.sesid); if(!ses) return;
        const total=ses.hoursTotal*HUB.trainHourSeconds, remain=Math.max(0, total-(ses.secElapsed||0));
        const bar=el.querySelector('.train-bar>i'); if(bar) bar.style.width=Math.min(100, (total?(ses.secElapsed||0)/total*100:100))+'%';
        const cd=el.querySelector('.train-countdown'); if(cd) cd.textContent=ses.done?'✓ COMPLETE':fmtTrainRemain(remain);
      });
    }
  });
}

/* ---- The Wake (resurrection tower) menu — two columns: the fallen (left) → in the lattice (right) ---- */
function wakeSignature(){
  const r=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.reborn)||{sessions:[],done:[]};
  return 'unlk:'+((typeof rebornUnlocked==='function'&&rebornUnlocked())?1:0)
       +'|f:'+((typeof fallenVets!=='undefined')?fallenVets.length:0)
       +'|done:'+((r.done||[]).join(','))
       +'|se:'+((r.sessions||[]).map(s=>s.id+':'+(s.done?1:0)).join(','))
       +'|m3:'+((typeof CAMPAIGN!=='undefined')?(CAMPAIGN.m3|0):0);
}
// map a fallen record → a card snapshot hubMenuUnitCard understands (type/stars/spriteType/lore)
function fallenCardSnap(f){
  return { type:f.type, stars:(f.stars!=null?f.stars:f.lvl)||0, spriteType:f.spriteType||null,
    lore:(typeof fallenDossierSnap==='function')?fallenDossierSnap(f):(f.lore||null),
    heroId:f.heroId||null, key:'wakecard:'+((typeof fallenStableId==='function')?fallenStableId(f):(f.name||'')),
    madosis:0, sanityThreshold:0 };
}
function buildWakeBody(body){
  const r=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.reborn)||{sessions:[],done:[]};
  const sessions=r.sessions||[], fallen=(typeof fallenVets!=='undefined')?fallenVets:[];
  const unlocked=(typeof rebornUnlocked==='function')?rebornUnlocked():true;
  const charges=(typeof rebornChargesLeft==='function')?rebornChargesLeft():0;
  const cap=HUB.rebornTotalCap||0;

  const sum=document.createElement('div'); sum.className='hub-stat';
  sum.innerHTML = unlocked
    ? ('The storm holds <b>'+charges+'</b> of its <b>'+cap+'</b> writes — ever. In the lattice now: <b>'+sessions.length+' / '+(HUB.rebornSlotCap||1)+'</b>. One soul at a time; the rest stay names.')
    : '⚠ LATTICE OFFLINE — resurrection unlocks at the GRAAL.';
  body.appendChild(sum);

  if(!unlocked){
    // T1-7: pre-XIII the Wake is still the MEMORIAL — every hub visit walks past the dead.
    const m=document.createElement('div'); m.className='muted';
    m.innerHTML='Take A&O’s transfer lattice and pull your dead’s backups out of the purge (Episodes XII–XIII). Then the storm has something to write.';
    body.appendChild(m);
    body.appendChild(hubMenuSection('The fallen ('+fallen.length+')'));
    if(!fallen.length){
      const e=document.createElement('div'); e.className='muted'; e.textContent='No one yet. Keep it that way.';
      body.appendChild(e);
    } else {
      for(const f of fallen){
        const row=document.createElement('div'); row.className='hub-stat';
        row.innerHTML='🕯 <b>'+f.name+'</b> — '+(typeof careerTitle==='function'?careerTitle(f.lvl):'')+' · Lv '+(f.lvl||0)
          +' · fell at '+(f.map||'the front')+' · '+(f.dreamDone?'dream fulfilled ✓':'dream unfulfilled: '+(f.dream||'unknown'));
        body.appendChild(row);
      }
    }
    return;
  }

  const cols=hubMenuColumns(2), colL=hubMenuColumn(true), colR=hubMenuColumn(true);
  cols.appendChild(colL); cols.appendChild(colR); body.appendChild(cols);

  // ---- LEFT: the fallen ----
  colL.appendChild(hubMenuSection('The fallen'));
  if(!fallen.length){
    const m=document.createElement('div'); m.className='muted';
    m.textContent='No one has fallen yet. The lattice waits, humming, for its first body.';
    colL.appendChild(m);
  } else {
    colL.appendChild(hubMenuUnitGrid(fallen.map(fallenCardSnap), (snap,i)=>{
      const f=fallen[i];
      const already=(typeof rebornIsDone==='function')?rebornIsDone(f):false;
      const cost=(typeof rebornCost==='function')?rebornCost(f):0;
      // T4-1: the choice is dream-aware — who they were and what they never finished sits ON the card
      let dreamLine='';
      try{ if(typeof buildDossier==='function' && typeof fallenDossierSnap==='function'){
        const d=buildDossier({type:f.type, lore:fallenDossierSnap(f)});
        if(d&&d.dream) dreamLine='<br><i style="color:#9fb6c8">'+(f.dreamDone?'✓ ':'✗ ')+'“'+d.dream+'”</i>'; } }catch(e){}
      return {
        caption: trainTypeName(snap)+'<br>'+(typeof careerTitle==='function'?careerTitle(snap.stars||0):'')+' · Lv '+(snap.stars||0)
          +' · fell at '+(f.map||'the front')+(already?' · <i>reborn</i>':'')+dreamLine,
        action: { label: already ? 'Reborn' : ('Resurrect · M3$ '+cost),
          onClick: ()=>{ if(typeof hubWakeStart==='function' && hubWakeStart(fallenStableId(f))) buildHubMenuBody(); } }
      };
    }));
  }

  // ---- RIGHT: in the lattice ----
  colR.appendChild(hubMenuSection('In the lattice'));
  if(!sessions.length){ const m=document.createElement('div'); m.className='muted'; m.textContent='The coils are cold.'; colR.appendChild(m); }
  for(const ses of sessions){
    const card=document.createElement('div'); card.className='train-session'; card.dataset.wakeid=ses.id;
    const cv=document.createElement('canvas'); cv.width=200; cv.height=200; cv.className='train-spr';
    cv.dataset.type=ses.type; cv.dataset.sprite=ses.spriteType||''; card.appendChild(cv);
    const lab=document.createElement('div'); lab.className='train-cap';
    lab.innerHTML='<b>'+(ses.name||trainUnitName(ses))+'</b><br>Lv '+(ses.stars||0)+' · reassembling';
    card.appendChild(lab);
    const meta=document.createElement('div'); meta.className='train-meta';
    meta.innerHTML='<div class="train-countdown">…</div><div class="train-bar"><i></i></div>'
      +'<div class="muted">'+((DEF[ses.type]&&DEF[ses.type].name)||ses.type)+' · written by lightning</div>';
    card.appendChild(meta);
    colR.appendChild(card);
  }
}
function openWakeMenu(){
  if(typeof CAMPAIGN==='undefined') return;
  if(CAMPAIGN.reborn==null) CAMPAIGN.reborn={sessions:[],done:[]};
  openHubMenu({
    id:'wake', icon:'⚡', title:'The Wake',
    subtitle:'A bootleg of A&O’s tower — the stolen lattice, fed your rescued dead, powered by the storm. Nothing it gives back is whole.',
    signature: wakeSignature,
    build: buildWakeBody,
    tick: function(body){
      body.querySelectorAll('[data-wakeid]').forEach(el=>{
        const ses=((CAMPAIGN.reborn&&CAMPAIGN.reborn.sessions)||[]).find(s=>s.id===el.dataset.wakeid); if(!ses) return;
        const total=ses.hoursTotal*(HUB.rebornHourSeconds||3600), remain=Math.max(0, total-(ses.secElapsed||0));
        const bar=el.querySelector('.train-bar>i'); if(bar) bar.style.width=Math.min(100, (total?(ses.secElapsed||0)/total*100:100))+'%';
        const cd=el.querySelector('.train-countdown'); if(cd) cd.textContent=ses.done?'✓ RISEN':fmtTrainRemain(remain);
      });
    }
  });
}

/* ---- Mental Health Facility menu (madosis healing — single-unit, visit-timed) ---- */
function healPanelSignature(){
  const h=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.healing)||{staged:[],sessions:[]};
  return 'hst:'+(h.staged||[]).map(s=>s.key+'@'+Math.round(s.madosis||0)).join(',')
       +'|hse:'+(h.sessions||[]).map(s=>s.id+':'+((s.unit&&s.unit.key)||'')).join(',')
       +'|v:'+((typeof CAMPAIGN!=='undefined'&&CAMPAIGN.visit)||0)
       +'|m3:'+((typeof CAMPAIGN!=='undefined'&&(CAMPAIGN.m3|0))||0);
}
function buildHealingBody(body){
  const h=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.healing)||{staged:[],sessions:[]};
  const staged=h.staged||[], sessions=h.sessions||[];
  const cap=(typeof MADOSIS!=='undefined'&&MADOSIS.healCap)||6;
  const fracPct=Math.round((((typeof MADOSIS!=='undefined'&&MADOSIS.heal&&MADOSIS.heal.fracOfMax)||0.7))*100);

  const sum=document.createElement('div'); sum.className='hub-stat';
  sum.innerHTML='In care <b>'+(staged.length+sessions.length)+' / '+cap+'</b> · M3$ <b>'+((CAMPAIGN.m3|0))+'</b>';
  body.appendChild(sum);

  const cols=hubMenuColumns(2), left=hubMenuColumn(true), right=hubMenuColumn(true);
  cols.appendChild(left); cols.appendChild(right); body.appendChild(cols);

  // ---- LEFT: awaiting treatment (staged) — per-unit Start button ----
  left.appendChild(hubMenuSection('Awaiting treatment'));
  if(!staged.length){
    const m=document.createElement('div'); m.className='muted';
    m.textContent='Walk a frayed veteran (one carrying madosis) into the facility, then begin treatment here.';
    left.appendChild(m);
  } else {
    left.appendChild(hubMenuUnitGrid(staged, s=>{
      const cost=(typeof hubHealCost==='function')?hubHealCost(s):0;
      return {
        caption: trainTypeName(s)+'<br>'+(typeof careerTitle==='function'?careerTitle(s.stars||0):'')+' · Lv '+(s.stars||0),
        action: { label:'Start · M3$ '+cost, onClick:()=>{ if(typeof hubHealStartSession==='function' && hubHealStartSession(s.key)) buildHubMenuBody(); } }
      };
    }));
    const note=document.createElement('div'); note.className='muted';
    note.textContent='Treatment recovers up to '+fracPct+'% of a unit’s maximum madosis and occupies it for one mission.';
    left.appendChild(note);
  }

  // ---- RIGHT: in treatment (active sessions) ----
  right.appendChild(hubMenuSection('In treatment'));
  if(!sessions.length){ const m=document.createElement('div'); m.className='muted'; m.textContent='No one in treatment.'; right.appendChild(m); }
  for(const ses of sessions){
    const who=ses.unit||{};
    const card=document.createElement('div'); card.className='train-session'; card.dataset.healid=ses.id;
    card.appendChild(hubMenuUnitGrid([who], s=>({ caption: trainTypeName(s)+'<br>recovering <b>'+(ses.heal||0)+'</b> madosis' })));
    const meta=document.createElement('div'); meta.className='train-meta';
    meta.innerHTML='<div class="train-countdown">IN CARE</div><div class="train-bar"><i style="width:30%"></i></div>'
      +'<div class="muted">Completes after the next mission.</div>';
    card.appendChild(meta);
    const cb=document.createElement('button'); cb.className='sc-btn train-withdraw'; cb.textContent='Cancel — no recovery, no refund';
    cb.onclick=()=>{ if(typeof hubHealCancel==='function' && hubHealCancel(who.key)) buildHubMenuBody(); };
    card.appendChild(cb);
    right.appendChild(card);
  }
}
function openHealingMenu(){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN.healing) return;
  openHubMenu({
    id:'mentalhealth', icon:'🧠', title:'Mental Health Facility',
    subtitle:'Treat a frayed veteran — recover most of its max madosis over one mission, paid up-front.',
    signature: healPanelSignature,
    build: buildHealingBody,
    tick: function(){}   // visit-based — nothing per-frame (card portraits are animated by hubMenuTick)
  });
}

/* ---- M.D.C. (Mission Dispatch) menu ---- */
// spoiler-free teaser for the next deployment: prefer the authored crawl.summary; fall back to the
// first ~2 sentences of the crawl text (legacy/future maps with no summary), then the objective.
function hubEpisodeSummary(m){
  const cr=(m&&m.crawl)||{};
  if(cr.summary) return cr.summary;
  if(cr.text){
    const plain=String(cr.text).replace(/\s+/g,' ').trim();
    const parts=plain.split(/(?<=[.!?])\s+/);
    return parts.slice(0,2).join(' ');
  }
  return (m&&m.objective)||'';
}
// the "Next deployment" briefing card built from MAPS[idx]: episode tag, big title, enemy, summary, objective.
function hubMdcBriefCard(idx){
  const m=(typeof MAPS!=='undefined'&&MAPS[idx])||null;
  const wrap=document.createElement('div'); wrap.className='mdc-brief';
  if(!m){
    const done=document.createElement('div'); done.className='mdc-brief-sum';
    done.textContent='No further deployments scheduled — the campaign is complete.'; wrap.appendChild(done);
    return wrap;
  }
  const cr=m.crawl||{};
  const tag=document.createElement('div'); tag.className='mdc-brief-tag'; tag.textContent=cr.episode||('EPISODE '+(idx+1)); wrap.appendChild(tag);
  const title=document.createElement('div'); title.className='mdc-brief-title'; title.textContent=cr.title||m.name||''; wrap.appendChild(title);
  if(m.enemyName){ const en=document.createElement('div'); en.className='mdc-brief-enemy'; en.innerHTML='⚔ <b>'+_escHtml(m.enemyName)+'</b>'; wrap.appendChild(en); }
  const sum=document.createElement('div'); sum.className='mdc-brief-sum'; sum.textContent=hubEpisodeSummary(m); wrap.appendChild(sum);
  if(m.objective){ const ob=document.createElement('div'); ob.className='mdc-brief-obj'; ob.innerHTML='<span>OBJECTIVE</span> '+_escHtml(m.objective); wrap.appendChild(ob); }
  return wrap;
}
function openMdcMenu(poi){
  openHubMenu({
    id:'mdc', icon:'🛰️', title:'M.D.C. — Mission Dispatch',
    subtitle:'Enlist veterans here, then launch the next quarterly deployment',
    signature: function(){ const d=(CAMPAIGN.dispatch&&CAMPAIGN.dispatch.staged)||[];
      return 'mdc:'+d.join(',')+'|m3:'+(CAMPAIGN.m3|0)+'|nx:'+(CAMPAIGN&&CAMPAIGN.nextMapIndex!=null?CAMPAIGN.nextMapIndex:-1); },
    build: function(body){
      const cap=(typeof hubDispatchVetCap==='function')?hubDispatchVetCap():6;
      const live=(typeof hubEnlistedUnits==='function')?hubEnlistedUnits(G):[];
      const vets=live.filter(u=>!u.hero), heroes=live.filter(u=>u.hero);
      let idx=(typeof hubNextDeployIndex==='function') ? hubNextDeployIndex()
            : ((CAMPAIGN&&CAMPAIGN.nextMapIndex!=null)?CAMPAIGN.nextMapIndex:0);   // gate villains + finale routing (T2-7)

      const sum=document.createElement('div'); sum.className='hub-stat';
      sum.innerHTML='Enlisted <b>'+vets.length+' / '+cap+'</b> vets'+(heroes.length?' + <b>'+heroes.length+'</b> hero'+(heroes.length>1?'es':''):'');
      body.appendChild(sum);

      // rigid 2-column layout: LEFT = enlisted veterans (same card as Training "Awaiting orders"),
      // RIGHT = the next-deployment briefing distilled from the episode's lore + crawl.
      const cols=hubMenuColumns(2), left=hubMenuColumn(true), right=hubMenuColumn(true);
      cols.appendChild(left); cols.appendChild(right); body.appendChild(cols);

      // ---- LEFT: Enlisted for the next mission ----
      left.appendChild(hubMenuSection('Enlisted for the next mission'));
      if(!live.length){ const m=document.createElement('div'); m.className='muted';
        m.textContent='Walk veterans into a red M.D.C. to enlist them for the next deployment.'; left.appendChild(m); }
      else {
        left.appendChild(hubMenuUnitGrid(live, u=>({
          caption: trainTypeName(u)+'<br>'+(typeof careerTitle==='function'?careerTitle(u.stars||0):'')+' · Lv '+(u.stars||0)+(u.hero?' · ⭐ hero':''),
          action: u.hero?null:{ label:'↩ Release', onClick:()=>{ if(hubReleaseFromMdc(hubUnitKey(u))) buildHubMenuBody(); } }
        })));
      }

      // ---- RIGHT: Next deployment briefing ----
      right.appendChild(hubMenuSection('Next deployment'));
      right.appendChild(hubMdcBriefCard(idx));

      // ---- FOOTER (full width): vet-cap note + DISPATCH ----
      const foot=document.createElement('div'); foot.className='hub-footer';
      const info=document.createElement('div'); info.className='grow';
      info.innerHTML='The next quarter only requires <b>'+cap+'</b> units. Heroes auto-deploy and don’t count.';
      foot.appendChild(info);
      foot.appendChild(hubMenuActionBtn('🚀 DISPATCH — Launch Episode '+(idx+1), null, live.length>0, ()=>{ closeHubMenu(); hubDispatchNextEpisode(); }));
      body.appendChild(foot);
    }
  });
}

/* ---- Condo (resident housing) menu ---- */
function openCondoMenu(poi){
  const id = (poi && poi.hubPoi) ? poi.hubPoi.id : null;
  const nm = (poi && poi.hubPoi && poi.hubPoi.name) ? poi.hubPoi.name : 'Unit Condo';
  openHubMenu({
    id:'condo', icon:'🏙️', title:nm,
    subtitle:'Upgrade resident housing — +4% max HP per level for everyone who lives here',
    signature: function(){ const c=(CAMPAIGN.condos&&CAMPAIGN.condos[id])||{}; return 'condo:'+id+':'+(c.level||0)+'|m3:'+(CAMPAIGN.m3|0); },
    build: function(body){
      const c=(CAMPAIGN.condos&&CAMPAIGN.condos[id])||{level:0,residents:[]};
      const lvl=c.level||0, cost=HUB.condoCosts[lvl];
      // present residents = condo resident keys that resolve to a current roster snapshot. Keys for
      // veterans no longer on the roster (fell / not extracted) are dropped, not shown as raw keys.
      const units=(c.residents||[]).map(k=>(CAMPAIGN.roster||[]).find(x=>x.key===k)).filter(Boolean);
      const s=document.createElement('div'); s.className='hub-stat';
      s.innerHTML='Level <b>'+lvl+'</b> · Residents <b>'+units.length+'</b> · HP bonus <b>+'+(lvl*4)+'%</b>';
      body.appendChild(s);
      body.appendChild(hubMenuSection('Residents'));
      if(!units.length){ const m=document.createElement('div'); m.className='muted'; m.textContent='No residents yet — veterans move in as they join your roster.'; body.appendChild(m); }
      // render animated player cards (the same component the Training Grounds / M.D.C. menus use)
      else body.appendChild(hubMenuUnitGrid(units));
      const foot=document.createElement('div'); foot.className='hub-footer';
      const info=document.createElement('div'); info.className='grow';
      info.innerHTML = cost==null ? 'This condo is fully upgraded.' : 'Next level: <b>+4% max HP</b> for its residents.';
      foot.appendChild(info);
      foot.appendChild(hubMenuActionBtn('🏙️ Upgrade Condo', cost, cost!=null, ()=>{ hubUpgradeSelectedCondo(); buildHubMenuBody(); }));
      body.appendChild(foot);
    }
  });
}

/* ---- ULTRA Headquarters menu ---- */
function openUltraMenu(){
  openHubMenu({
    id:'ultra', icon:'◆', title:'ULTRA Headquarters',
    subtitle:'The company that fabricates life for everyone, everywhere',
    signature: function(){ return 'ultra:'+(CAMPAIGN.m3|0)+'|g:'+(CAMPAIGN.gambled?1:0)+'|v:'+(CAMPAIGN.visit|0)+'|si:'+(CAMPAIGN.seriesInf|0); },
    build: function(body){
      const s=document.createElement('div'); s.className='hub-stat';
      s.innerHTML='Treasury <b>M3$ '+(CAMPAIGN.m3|0)+'</b> · H.U.B. visit <b>#'+(CAMPAIGN.visit|0)+'</b>';
      body.appendChild(s);
      // T3-9: Series \u221e — the uncapped sink. Rising cost, +1% roster HP per closed round.
      body.appendChild(hubMenuSection('Series \u221e Desk'));
      const si=document.createElement('div'); si.className='hub-note';
      si.textContent='Round '+((CAMPAIGN.seriesInf|0)+1)+' of \u221e. Every closed round: +1% max HP for the whole roster, forever. Current bonus: +'+(CAMPAIGN.seriesInf|0)+'%.';
      body.appendChild(si);
      const siFoot=document.createElement('div'); siFoot.className='hub-footer';
      const siInfo=document.createElement('div'); siInfo.className='grow';
      siInfo.innerHTML='Dilution is for other people.';
      siFoot.appendChild(siInfo);
      siFoot.appendChild(hubMenuActionBtn('\ud83d\udcc8 Close the round', (typeof seriesInfCost==='function')?seriesInfCost():300, true, ()=>{ hubBuySeriesInf(); buildHubMenuBody(); }));
      body.appendChild(siFoot);
      body.appendChild(hubMenuSection('Speculation Kiosk'));
      const note=document.createElement('div'); note.className='hub-note';
      note.textContent = CAMPAIGN.gambled ? 'The kiosk already liquidated your optimism this visit.'
        : 'Stake M3$ '+HUB.gambleStake+' on the market. Sometimes it pays out; mostly it calls the loss "learning".';
      body.appendChild(note);
      const foot=document.createElement('div'); foot.className='hub-footer';
      const info=document.createElement('div'); info.className='grow';
      info.innerHTML='Implants, styles and academy training are bought by selecting a resident out on the map.';
      foot.appendChild(info);
      foot.appendChild(hubMenuActionBtn('📈 Speculate', HUB.gambleStake, !CAMPAIGN.gambled, ()=>{ hubGamble(); buildHubMenuBody(); }));
      body.appendChild(foot);
    }
  });
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
  if(idx===0 && typeof TELE!=='undefined') TELE.event('new_campaign');
  // Quarter I (idx 0) first asks whether the player wants the guided tutorial; the prompt's
  // Yes/No calls back into beginRun(0). Every other map starts immediately.
  if(idx===0 && typeof TUTORIAL!=='undefined'){ TUTORIAL.prompt(0); return; }
  beginRun(idx);
}
function beginRun(idx){
  idx = idx|0;
  if(typeof MUSIC!=='undefined') MUSIC.leaveMenu();
  ['startScreen','mapScreen','docScreen','tutorialPromptScreen','loadScreen'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  // fresh campaign / map-select replay: clear carried units so a previous run's veterans or heroes
  // don't bleed into this one (heroes persist WITHIN a run, not across a brand-new start).
  if(typeof setCarryover==='function') setCarryover([]);
  if(typeof resetHeroes==='function') resetHeroes();
  if(typeof resetFallen==='function') resetFallen();   // {fallen} crawl var: empty memorial on a fresh start
  if(typeof resetHubCampaign==='function') resetHubCampaign();
  mapIndex=idx; showCrawl(idx, ()=>{ loadMap(idx); });
}
/* ---- T4-2/T4-3: Settings & accessibility panel + the difficulty picker ---- */
function _lsFlag(k){ try{ return localStorage.getItem(k)==='1'; }catch(_){ return false; } }
function _lsSetFlag(k,v){ try{ localStorage.setItem(k, v?'1':'0'); }catch(_){ } }
function buildDifficultyRow(elId){
  const row=document.getElementById(elId||'difficultyRow'); if(!row || typeof DIFFICULTY==='undefined') return;
  const cur=(typeof difficultyKey==='function')?difficultyKey():'a';
  row.innerHTML='';
  for(const [k,d] of Object.entries(DIFFICULTY)){
    const b=document.createElement('button');
    b.className='diff-btn'+(k===cur?' sel':'');
    b.innerHTML='<b>'+d.name+'</b><span>'+d.desc+' \u00b7 score \u00d7'+d.score+'</span>';
    b.onclick=()=>{ setDifficultyKey(k); buildDifficultyRow(elId); const sb=document.getElementById('settingsBody'); if(sb && sb.childElementCount) buildSettingsBody(); };
    row.appendChild(b);
  }
}
function buildSettingsBody(){
  const body=document.getElementById('settingsBody'); if(!body) return;
  const togg=(label,desc,key,onflip)=>{
    const on=_lsFlag(key);
    return `<label class="set-row"><input type="checkbox" data-set="${key}" ${on?'checked':''}> <b>${label}</b> <span>${desc}</span></label>`;
  };
  let h='';
  h+='<div class="panel-label">Difficulty (applies at the next map load)</div><div id="settingsDiffRow" class="diff-row"></div>';
  h+='<div class="panel-label">Accessibility</div>';
  h+=togg('Colorblind-safe bars','HP & madosis switch to a blue \u2192 white \u2192 red ramp','starleft_colorblind');
  h+=togg('Larger HUD text','scales the HUD typography up','starleft_bigtext');
  h+=togg('Reduce FX','forces the reduced-motion path (fewer particles, no strobes)','starleft_reducefx');
  h+='<div class="panel-label">Audio &amp; privacy</div>';
  h+=`<label class="set-row"><input type="checkbox" data-aud="voice" ${ (typeof VOICE!=='undefined'&&VOICE.isEnabled())?'checked':''}> <b>Voices</b> <span>unit barks, narrator, tutorial coach</span></label>`;
  h+=`<label class="set-row"><input type="checkbox" data-aud="music" ${ (typeof MUSIC!=='undefined'&&MUSIC.isEnabled())?'checked':''}> <b>Music &amp; ambient</b> <span>menu theme + in-mission biome beds</span></label>`;
  h+=`<label class="set-row"><input type="checkbox" data-aud="sfx" ${ (typeof SFX!=='undefined'&&SFX.isEnabled())?'checked':''}> <b>Combat SFX</b> <span>lasers, impacts, deaths, UI clicks</span></label>`;
  h+=`<label class="set-row"><input type="checkbox" data-aud="tele" ${ (typeof TELE!=='undefined'&&TELE.isEnabled())?'checked':''}> <b>Anonymous analytics</b> <span>cookieless funnel counts \u2014 nothing is sent unless an endpoint is configured; Do-Not-Track always wins</span></label>`;
  body.innerHTML=h;
  buildDifficultyRow('settingsDiffRow');
  body.querySelectorAll('input[data-set]').forEach(inp=>{
    inp.onchange=()=>{
      _lsSetFlag(inp.dataset.set, inp.checked);
      if(inp.dataset.set==='starleft_colorblind') window._colorblind=inp.checked;
      if(inp.dataset.set==='starleft_reducefx') window._reduceFx=inp.checked;
      if(inp.dataset.set==='starleft_bigtext') document.body.classList.toggle('big-text', inp.checked);
    };
  });
  body.querySelectorAll('input[data-aud]').forEach(inp=>{
    inp.onchange=()=>{
      if(inp.dataset.aud==='voice' && typeof VOICE!=='undefined'){ VOICE.setEnabled(inp.checked); if(typeof syncVoiceBtn==='function') syncVoiceBtn(); }
      if(inp.dataset.aud==='music' && typeof MUSIC!=='undefined') MUSIC.setEnabled(inp.checked);
      if(inp.dataset.aud==='sfx'   && typeof SFX!=='undefined') SFX.setEnabled(inp.checked);
      if(inp.dataset.aud==='tele'  && typeof TELE!=='undefined') TELE.setEnabled(inp.checked);
    };
  });
}
function showSettings(){ buildSettingsBody(); showSub('settingsScreen'); }

/* ---- T3-2/T3-4: skirmish setup screen — mutator checkboxes + daily/random + the map grid ---- */
function skirmishSelectedMutators(){
  return [...document.querySelectorAll('#skirmish-mutators input:checked')].map(i=>i.value);
}
function showSkirmish(){
  const mu=document.getElementById('skirmish-mutators');
  if(mu && typeof MUTATORS!=='undefined' && !mu.childElementCount){
    mu.innerHTML = Object.entries(MUTATORS).map(([k,m])=>
      `<label class="mut-row"><input type="checkbox" value="${k}"> <b>${m.icon} ${m.name}</b> <span>${m.desc} \u00b7 score \u00d7${m.mult}</span></label>`).join('');
  }
  // T3-9: meta-currency as roguelite run-investment — campaign M3$ buys one-run boosts
  const bo=document.getElementById('skirmish-boosts');
  if(bo){
    const m3=((typeof CAMPAIGN!=='undefined'&&CAMPAIGN&&CAMPAIGN.m3)|0);
    bo.innerHTML=`<label class="mut-row"><input type="checkbox" value="bigger" ${m3<150?'disabled':''}> <b>\u{1F4B0} Buy a Bigger Round</b> <span>+600 starting Funding \u00b7 M3$ 150 (treasury: ${m3})</span></label>`
      +`<label class="mut-row"><input type="checkbox" value="lobby" ${m3<200?'disabled':''}> <b>\u{1F3A9} Hire Lobbyists</b> <span>2 free Lv3 Lobbyist veterans \u00b7 M3$ 200</span></label>`;
  }
  const wrap=document.getElementById('skirmishMapButtons');
  if(wrap){ wrap.innerHTML='';
    MAPS.forEach((m,i)=>{
      if(m.skirmish) return;                         // the transient generated-map slot
      const sub=(m.name.split('\u2014')[1]||m.name).trim();
      const label=m.isVillain ? ((m.villain?'Boss ':'Op ')+(m.displayEp||'')) : ('Quarter '+(i+1));
      const b=document.createElement('button'); b.className='map-btn'+(m.isVillain?' map-btn--boss':'');
      b.innerHTML=`<b>${label}</b><span class="mn">${sub}</span><small>vs ${m.enemyName||'rivals'}</small>`;
      b.onclick=()=>startSkirmish(i,{ mutators:skirmishSelectedMutators() });
      wrap.appendChild(b);
    });
  }
  showSub('skirmishScreen');
}

// Build a "jump to any Quarter" row on the title screen from the MAPS list.
function buildMapSelect(){
  const wrap=document.getElementById('mapButtons'); if(!wrap) return;
  wrap.innerHTML='';
  MAPS.forEach((m,i)=>{
    const sub=(m.name.split('—')[1]||m.name).trim();
    const label = m.isVillain ? ((m.villain?'Boss ':'Op ')+(m.displayEp||'')) : ('Quarter '+(i+1));   // gated maps show their display episode (boss duel vs side op), not an array-index Quarter
    const b=document.createElement('button'); b.className='map-btn'+(m.isVillain?' map-btn--boss':'');
    b.innerHTML=`<b>${label}</b><span class="mn">${sub}</span><small>vs ${m.enemyName||'rivals'}</small>`;
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
  if(typeof MUSIC!=='undefined') MUSIC.leaveMenu();
  if(typeof CAMPAIGN!=='undefined') CAMPAIGN.mode='combat';
  G=newMap(idx); if(typeof resetDialogs==='function') resetDialogs(); syncHud(); clampCam(G); refreshUI(); running=true;
  if(typeof TELE!=='undefined') TELE.event('episode_started', { idx });
  // T0-3: sparse per-biome ambient bed while in a mission (stopped on menu/hub return)
  if(typeof MUSIC!=='undefined' && MUSIC.playAmbient){ const tb=G.cfg&&G.cfg.terrain&&G.cfg.terrain.biomes; MUSIC.playAmbient(tb&&tb[0]); }
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  if(typeof TUTORIAL!=='undefined') TUTORIAL.init(G);   // Quarter I guided tutorial (solo only; no-op otherwise)
  toast('Quarter '+(idx+1)+': '+G.cfg.name);
}

/* ---- Star-Wars-style intro crawl ---- */
// The crawl scroll is PACED TO THE NARRATION so every line the voice reads is on screen as it is
// read. The body text rises through the readable mask band (#crawl-viewport masks 24%–54% opaque);
// CRAWL_ANCHOR is where (as a fraction of viewport height, 0=top) a line should sit when spoken.
// We match the scroll speed to the narration (no drift), skip the long dead lead-in, start the
// voice when the first line reaches the anchor, and auto-advance shortly after the last line fades.
const CRAWL_ANCHOR  = 0.36;   // read position of the spoken line (fraction of viewport height)
const CRAWL_EXIT    = 0.15;   // above this a line has scrolled/faded out of view ("came off the top")
const CRAWL_LEAD_S  = 2.2;    // seconds the first line eases up into the anchor before narration
const CRAWL_WPS     = 2.7;    // narrated words/sec (measured) — reading-pace estimate when no clip
// Sample the (paused) crawl animation to find, in progress-space [0..1], when the first body line
// and the last body line cross CRAWL_ANCHOR; from the narration length A (seconds) derive a matched
// scroll duration and the lead-in skip. Returns { anim, pStartMs, voiceMs, finishMs } or null if the
// geometry can't be measured (caller then keeps a safe, slower-than-voice fallback). Leaves the
// animation paused at pStart, ready for the caller to play().
function crawlSchedule(content, A){
  const vp = document.getElementById('crawl-viewport');
  const txt = document.getElementById('crawl-text');
  const anim = content.getAnimations ? content.getAnimations()[0] : null;
  if(!anim || !txt) return null;
  const H = (vp && vp.clientHeight) || window.innerHeight || 800;
  try {
    anim.pause();
    const base = (anim.effect && anim.effect.getTiming().duration) || 86970;  // ms; progress = currentTime/base
    const topAt = (p)=>{ anim.currentTime = p*base; return txt.getBoundingClientRect().top / H; };
    const botAt = (p)=>{ anim.currentTime = p*base; return txt.getBoundingClientRect().bottom / H; };
    let pTopA=null, pBotA=null, pGone=null;
    let pt=topAt(0), pb=botAt(0), pp=0;            // bodyTop / bodyBot screen-fraction at progress 0
    for(let p=0.02; p<=1.0001; p+=0.02){
      const t=topAt(p), b=botAt(p);
      // first body line crossing the anchor (it scrolls upward, so the value decreases past ANCHOR)
      if(pTopA==null && (pt-CRAWL_ANCHOR)*(t-CRAWL_ANCHOR)<=0 && pt!==t) pTopA = pp + (CRAWL_ANCHOR-pt)/(t-pt)*(p-pp);
      // last body line crossing the anchor
      if(pBotA==null && (pb-CRAWL_ANCHOR)*(b-CRAWL_ANCHOR)<=0 && pb!==b) pBotA = pp + (CRAWL_ANCHOR-pb)/(b-pb)*(p-pp);
      // last body line fading out the top (only meaningful after it has passed the anchor)
      if(pGone==null && pBotA!=null && (pb-CRAWL_EXIT)*(b-CRAWL_EXIT)<=0 && pb!==b) pGone = pp + (CRAWL_EXIT-pb)/(b-pb)*(p-pp);
      pt=t; pb=b; pp=p;
    }
    if(pTopA==null || pBotA==null || pBotA<=pTopA){ anim.currentTime=0; anim.play(); return null; }
    const sweep = pBotA - pTopA;                  // progress span the body takes to cross the anchor
    const D = A / sweep;                          // seconds for the full keyframe at reading pace
    let pStart = pTopA - CRAWL_LEAD_S/D, voiceMs;
    if(pStart < 0){ pStart = 0; voiceMs = pTopA*D*1000; } else { voiceMs = CRAWL_LEAD_S*1000; }
    if(pGone == null) pGone = Math.min(1, pBotA + sweep*0.45);
    const tailMs = Math.min(Math.max((pGone-pBotA)*D*1000, 1500), 9000);   // last line fades after the voice ends
    content.style.animationDelay = '0s';
    content.style.animationDuration = D + 's';
    const a2 = (content.getAnimations && content.getAnimations()[0]) || anim;  // duration change keeps the anim
    const pStartMs = pStart*D*1000;
    a2.currentTime = pStartMs;
    return { anim:a2, pStartMs, voiceMs, finishMs: voiceMs + A*1000 + tailMs };
  } catch(e){ try { anim.currentTime=0; anim.play(); } catch(_){} return null; }
}
function showCrawl(idx, done){
  if(typeof MUSIC!=='undefined') MUSIC.leaveMenu();
  if(idx>0 && typeof LNS!=='undefined' && LNS.ultraEvent) LNS.ultraEvent('episodeReached', { idx });
  running=false;
  const cfg=MAPS[idx], cr=cfg.crawl;
  const scr=document.getElementById('crawlScreen');
  document.getElementById('crawl-ep').textContent=cr.episode;
  document.getElementById('crawl-title').textContent=cr.title;
  const _ct=document.getElementById('crawl-text');
  let _text=cr.text;
  try { _text = (typeof fillCrawl==='function')
        ? fillCrawl(cr.text, typeof crawlVars==='function'?crawlVars():{}) : cr.text; }
  catch(e){ _text = cr.text; }                   // never soft-lock the crawl on a templating/data error
  _ct.textContent = _text;
  document.getElementById('crawl-intro').style.display = idx===0? 'block':'none';
  // restart the CSS animation by reflow, then freeze it until we know the narration length so the
  // first (default-speed) frames never flash before we re-pace the scroll.
  const content=document.getElementById('crawl-content');
  scr.classList.remove('fast'); content.style.animation='none'; void content.offsetWidth;
  content.style.animation=''; content.style.animationPlayState='paused';
  scr.style.display='flex';

  let finished=false, voiceTimer=null, playTimer=null, timer=null, _skipped=false;
  const finish=()=>{ if(finished) return; finished=true;
    clearTimeout(timer); clearTimeout(voiceTimer); clearTimeout(playTimer);
    content.style.animationPlayState='';
    if(typeof VOICE!=='undefined') VOICE.stopCrawl();     // stop narration on skip OR auto-advance
    if(typeof TELE!=='undefined') TELE.event(_skipped?'crawl_skipped':'crawl_watched', { idx });
    scr.style.display='none'; done&&done(); };
  document.getElementById('crawl-skip').onclick=()=>{ _skipped=true; finish(); };

  // Episode I plays a 5s "A long sprint ago…" introFade first; hold the scroll + voice for it.
  const introMs = idx===0 ? 5000 : 0;
  // Start the schedule once we know A: the real narration length when a clip exists (perfect sync),
  // otherwise a reading-pace estimate from the word count (also keeps long un-narrated crawls — e.g.
  // Episode XIII — readable instead of flying past).
  const words = (_text||'').trim().split(/\s+/).filter(Boolean).length;
  const estA = Math.max(10, words / CRAWL_WPS);
  const begin = (A)=>{
    if(finished) return;
    const plan = crawlSchedule(content, A);
    if(plan){
      // MDC dispatch: pace the single bomber pass to the whole crawl so it exits as the map loads
      if(G && G.dispatchFlight) G.dispatchFlight.dur = (introMs + plan.finishMs)/1000;
      const play = ()=>{ content.style.animationPlayState=''; plan.anim.play(); };   // clear the freeze, then run
      if(introMs>0){                              // keep the scroll below view under the introFade
        plan.anim.currentTime = 0;
        playTimer = setTimeout(()=>{ if(finished) return; plan.anim.currentTime = plan.pStartMs; play(); }, introMs);
      } else { play(); }
      if(typeof VOICE!=='undefined') voiceTimer = setTimeout(()=>{ if(!finished) VOICE.playCrawl(idx); }, introMs + plan.voiceMs);
      timer = setTimeout(finish, introMs + plan.finishMs);
    } else {
      // Geometry unavailable (no Web Animations API): degrade to a duration that is at least slower
      // than the voice, scrolling from the start, and a generous skippable auto-advance.
      const D = Math.max(70, A*2.4);
      if(G && G.dispatchFlight) G.dispatchFlight.dur = introMs/1000 + A + CRAWL_LEAD_S + 10;
      content.style.animationDuration = D + 's'; content.style.animationPlayState='';
      if(typeof VOICE!=='undefined') voiceTimer = setTimeout(()=>{ if(!finished) VOICE.playCrawl(idx); }, introMs + CRAWL_LEAD_S*1000);
      timer = setTimeout(finish, introMs + (A + CRAWL_LEAD_S + 10)*1000);
    }
  };
  if(typeof VOICE!=='undefined' && VOICE.crawlDuration)
    VOICE.crawlDuration(idx, (A)=> begin((A!=null && isFinite(A) && A>1) ? A : estA), 400);
  else begin(estA);
}

function onVictory(){
  running=false;
  if(typeof TELE!=='undefined') TELE.event('episode_won', { idx: (typeof mapIndex==='number'?mapIndex:0) });
  if(typeof ACH!=='undefined'){ const _m=MAPS[mapIndex]||{};
    ACH.fire('victory', { idx:mapIndex, villainId:_m.villain&&_m.villain.id, finale:!!_m.finale,
      wc:_m.winCondition&&_m.winCondition.type, daily:!!(G&&G._skirmishDaily) });
    if(G&&G._skirmishDaily) ACH.fire('daily');
  }
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  const es=document.getElementById('endScreen');
  const beaten=G.cfg.enemyName||'the competition';
  // ---- T3-2: skirmish never advances the campaign — its own cleared screen + Valuation ----
  if(G._skirmish){
    es.className='overlay win'; es.style.display='flex';
    es.innerHTML=`<div class="big">\u{1F3B2}</div><h1>SKIRMISH CLEARED</h1>
      <h2>${G._skirmishDaily?'Daily Disruption \u2014 compare Valuations':'No stakes. All bragging rights.'}</h2>
      ${victorySummaryHTML()}
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" onclick="replaySkirmish()">\u21BB Play Again</button>
        <button class="btn" onclick="document.getElementById('endScreen').style.display='none'; showSkirmish();">\u{1F3B2} Pick Another</button>
        <button class="btn" style="background:linear-gradient(180deg,#566,#344);" onclick="location.reload()">\u23CF Main Menu</button>
      </div>`;
    return;
  }
  // villain maps are APPENDED past the linear campaign, so the linear end is the last non-villain
  // map. T2-7: the campaign no longer IPOs there — an uncleared FINALE villain (REX) gates the IPO,
  // so the war ends on its best fight; beating the finale villain (or replaying it cleared) IPOs.
  const lastEp = (typeof lastEpisodeIndex==='function') ? lastEpisodeIndex() : (MAPS.length-1);
  const isVillainMap = !!(MAPS[mapIndex] && MAPS[mapIndex].isVillain);
  const finaleWon = isVillainMap && MAPS[mapIndex].finale;
  if(finaleWon && typeof markVillainCleared==='function') markVillainCleared(mapIndex);
  const fvIdx = (!isVillainMap && mapIndex>=lastEp && typeof finaleVillainIndex==='function') ? finaleVillainIndex() : -1;
  if(!finaleWon && (mapIndex < lastEp || isVillainMap || fvIdx>=0)){
    // infiltration map (Ep X, cfg.noCarryVets): no vets deployed here, so don't run the chooser and
    // don't overwrite the carryover — the roster waiting outside rejoins unchanged next quarter.
    const keepRoster = !!(G.cfg && G.cfg.noCarryVets);
    const vets = (!keepRoster && typeof eligibleVets==='function') ? eligibleVets(G) : [];
    // next index: skip appended villains, resume at returnTo after a boss, and honor a gated villain.
    let nextIdx = (typeof villainNextLinear==='function') ? villainNextLinear(mapIndex) : Math.min(mapIndex+1, MAPS.length-1);
    if(typeof villainGateBefore==='function'){ const g=villainGateBefore(nextIdx); if(g>=0) nextIdx=g; }
    if(fvIdx>=0) nextIdx=fvIdx;   // T2-7: the linear campaign is done — the FINALE boss is the next deployment
    const cap  = (typeof vetCarryCountFor==='function') ? vetCarryCountFor(nextIdx) : 0;
    // boss-aware headline (killed vs the ninja's escape), else the normal corporate-takeover screen
    const vdef = (G.cfg && G.cfg.villain && typeof VILLAINS!=='undefined') ? VILLAINS[(Array.isArray(G.cfg.villain)?G.cfg.villain[0]:G.cfg.villain).id] : null;
    let head;
    if(vdef && G._fledBoss) head=`<div class="big">🌫️</div><h1>IT GOT AWAY</h1><h2>${vdef.name} slipped the net — but you held the line</h2>`;
    else if(vdef)          head=`<div class="big">⚔️</div><h1>BOSS DOWN</h1><h2>${vdef.name} is scrap</h2>`;
    else                   head=`<div class="big">📉</div><h1>ACQUIHIRED</h1><h2>${beaten} has pivoted to bankruptcy</h2>`;
    es.className='overlay win'; es.style.display='flex';
    es.innerHTML=`${head}
      <p>Their assets are yours, their founders are "exploring new opportunities," and TechCrunch loves you.</p>
      ${victorySummaryHTML()}
      ${vets.length? `<div class="carry-head">Who deploys to the next quarter? <span class="carry-count" id="carry-count"></span></div>
        <div class="carry-list" id="carry-list"></div>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" id="nextBtn">▶ Next Quarter</button>
        <button class="btn" style="background:linear-gradient(180deg,#3a4656,#222b36);" onclick="showRoster()">🕯 Veterans &amp; Memorial</button>
      </div>`;
    const proceed=(chosen)=>{ es.style.display='none'; if(!keepRoster) setCarryover(chosen);
      if(typeof captureHeroes==='function') captureHeroes(G);   // heroes auto-carry (not chooser-driven) until they die — incl. freed Biba
      G._fledBoss=false; mapIndex=nextIdx; showCrawl(mapIndex, ()=>loadMap(mapIndex)); };
    if(vets.length){ buildCarryChooser(document.getElementById('carry-list'), document.getElementById('carry-count'), vets, cap, document.getElementById('nextBtn'), proceed); }
    else { document.getElementById('nextBtn').onclick=()=>proceed([]); }
  } else {
    es.className='overlay win'; es.style.display='flex';
    const lap=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.ngPlus)|0;
    es.innerHTML=`<div class="big">🦄</div><h1>IPO!</h1>
      <h2>Total market domination achieved${lap?` — lap ${lap+1}`:''}</h2>
      ${victorySummaryHTML()}
      <p>${beaten} is rubble, regulators are "looking into it," and you are now the monopoly you swore to disrupt.
      The ping-pong table finally gets used. Congratulations, you played yourself — and won.</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;">
        <button class="btn" onclick="startNgPlus()">💸 Take the Money and Disrupt Again</button>
        <button class="btn" style="background:linear-gradient(180deg,#566,#344);" onclick="location.reload()">↻ Found a New Startup</button>
        <button class="btn" style="background:linear-gradient(180deg,#3a4656,#222b36);" onclick="showRoster()">🕯 Veterans &amp; Memorial</button>
      </div>`;
    if(typeof recordLedgerRun==='function') recordLedgerRun('ipo');   // T3-6: the run enters the Founder's Ledger
    if(typeof ACH!=='undefined') ACH.fire('ipo');   // T3-5
  }
}
// T3-1 NEW GAME+: keep the roster, the memorial and the whole CAMPAIGN meta (M3$/condos/upgrades),
// bump the lap counter, and lap back to Quarter I — harder (newMap scales aggression by ngPlus and
// balance.js musters extra defenders). No resets: this is the same company, richer and more haunted.
function startNgPlus(){
  if(typeof ACH!=='undefined') ACH.fire('ngplus');   // T3-5: Serial Founder
  if(typeof eligibleVets==='function' && typeof setCarryover==='function') setCarryover(eligibleVets(G)||[]);
  if(typeof captureHeroes==='function') captureHeroes(G);
  if(typeof CAMPAIGN!=='undefined'){
    CAMPAIGN.ngPlus=(CAMPAIGN.ngPlus|0)+1;
    CAMPAIGN.nextMapIndex=0;
    CAMPAIGN.villainCleared={};        // the lap re-fights its bosses (incl. the finale)
    CAMPAIGN.mode='combat';
  }
  const es=document.getElementById('endScreen'); if(es) es.style.display='none';
  mapIndex=0; showCrawl(0, ()=>loadMap(0));
}
// T1-9: the "state of my company" run summary — pure reads of already-computed state.
// Reward breakdown comes from hubRewardFor; promotions/fallen/peakSupply/unitsLost from hubStats.
function victorySummaryHTML(){
  if(!G || typeof hubRewardFor!=='function') return '';
  let h='';
  try{
    const r=hubRewardFor(G), s=(typeof hubEnsureStats==='function')?hubEnsureStats(G):{};
    const elapsed=(typeof fmtElapsed==='function')?fmtElapsed(G.time|0):((G.time|0)+'s');
    const val=(typeof valuationFor==='function')?valuationFor(G):null;
    let best=0;
    if(val && typeof valuationBest==='function'){ best=valuationBest(G); if(typeof valuationRecord==='function') valuationRecord(G, val.points); }
    h+=`<div class="vic-sum">`;
    h+=`<span class="vs">⚔ kills <b>${s.unitKills||0}</b></span><span class="vs">🏚 razed <b>${s.buildingKills||0}</b></span>`
      +`<span class="vs">🏢 HQs <b>${s.hqKills||0}</b></span><span class="vs">💰 funding <b>${teamGoldCollected(G)|0}</b></span>`
      +`<span class="vs">⏱ <b>${elapsed}</b></span><span class="vs">👥 peak <b>${s.peakSupply||0}</b></span>`
      +`<span class="vs">★ promoted <b>${s.promotions||0}</b></span><span class="vs">🕯 lost <b>${s.unitsLost||0}</b></span>`
      +`<span class="vs">M3$ reward <b>+${r.total}</b></span>`;
    if(val) h+=`<span class="vs vs-score">📈 Valuation <b>${val.label}</b>${val.points>=best&&best>0?' · new best':(best>0?' · best $'+(best/100).toFixed(1)+'B':'')}</span>`;
    h+=`</div>`;
    // the fallen this quarter — names, not numbers
    const here=(typeof fallenVets!=='undefined')?fallenVets.filter(f=>f.map===(G.cfg&&G.cfg.name)):[];
    if(here.length) h+=`<div class="vic-fallen">🕯 The Fallen this quarter: ${here.map(f=>'<b>'+f.name+'</b>').join(' · ')}</div>`;
  }catch(e){ return ''; }
  return h;
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
    // T1-5: the carry chooser shows each veteran's madosis load — picking a frayed mind is a choice
    let madBar='';
    if(typeof madThreshold==='function'){
      const thr=madThreshold(v);
      if(thr>0){ const fr=Math.min(1,(v.madosis||0)/thr), col=(typeof madColor==='function')?madColor(fr):'#b05bff';
        madBar=`<span class="cc-mad" title="Madosis ${Math.round(v.madosis||0)}/${Math.round(thr)}"><i style="width:${(fr*100).toFixed(0)}%;background:${col}"></i></span>`; }
    }
    card.innerHTML = `<span class="cc-top">${DEF[v.type].icon||''} <b>${name}</b></span>
      <span class="cc-stat">★ Lv ${v.stars||0} · ❤ ${v.hp|0}/${v.maxHp}</span>${madBar}${teaser}`;
    if(typeof shareCard==='function' && v.lore){   // T0-6: share this veteran's card from the victory chooser
      const sh=document.createElement('span'); sh.className='cc-share'; sh.textContent='⇪'; sh.title='Share this file as an image';
      sh.onclick=(ev)=>{ ev.stopPropagation(); shareCard(v); };
      card.appendChild(sh);
    }
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
  if(typeof TELE!=='undefined') TELE.event('episode_lost', { idx: (typeof mapIndex==='number'?mapIndex:0) });
  if(typeof syncPauseBtn==='function') syncPauseBtn();
  const es=document.getElementById('endScreen');
  es.className='overlay lose'; es.style.display='flex';
  es.innerHTML=`<div class="big">💸</div><h1>OUT OF RUNWAY</h1>
    <h2>The board has "decided to go in a different direction"</h2>
    <p>Your funding is gone, your Interns have unionized, and ${G.cfg.enemyName||'the rival'} just bought your domain name.</p>
    <div style="display:flex;gap:14px;">
      <button class="btn" id="retryBtn">↻ Pivot &amp; Retry</button>
      <button class="btn" style="background:linear-gradient(180deg,#566,#344);" onclick="if(typeof recordLedgerRun==='function')recordLedgerRun('collapse');location.reload()">⟲ Restart Campaign</button>
    </div>`;
  document.getElementById('retryBtn').onclick=()=>{ es.style.display='none'; loadMap(mapIndex); };
}
