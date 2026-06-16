/* sandbox.js — LOCALHOST-ONLY in-game battle test tool ("Sandbox").
   ---------------------------------------------------------------------------
   A developer staging ground: load ANY campaign map (or the HUB), freely place
   units & buildings of any side by clicking/painting on the canvas, toggle
   god-mode / full map reveal / frozen win-loss / infinite funding, and scrub the
   sim clock (⏸ · 1× · 2× · 4×) to set up and watch a fight.

   SELF-CONTAINED: this file injects its own control panel, CSS and a capture-phase
   placement click handler. The ONLY touchpoints in game code are guarded and
   no-ops when this file (or window.SANDBOX) is absent, so deleting sandbox.js
   fully removes the feature:
     • ui.js     renders a "🧪 Sandbox" button in Settings behind `typeof SANDBOX`
     • main.js   reads SANDBOX.on + SANDBOX.simSteps()  → sub-step / pause the solo sim
     • core.js   reads state._sandboxNoEnd              → freeze win/loss
     • render.js reads state._sandboxReveal             → reveal fog
     • units.js  reads entity._godmode                  → ignore incoming damage

   GATED to localhost (or ?sandbox) so it can never appear on the deployed build.
   Loaded after main.js, so loadMap / mkUnit / mkBuilding / MAPS / DEF / G / cv /
   screenToWorld / refreshUI / recomputeSupply / playerEco are all defined. */
(function(){
  'use strict';

  /* ---- localhost gate ---------------------------------------------------- */
  const H = location.hostname;
  const ENABLED = H==='localhost' || H==='127.0.0.1' || H==='::1' ||
                  location.protocol==='file:' || /[?&]sandbox(=1)?(&|$)/.test(location.search);
  if(!ENABLED) return;

  /* ---- public state (the contract the game-code hooks read) -------------- */
  const SB = window.SANDBOX = {
    on:false,
    speed:1,              // 0 paused · 1 · 2 · 4  (sub-steps per rAF frame)
    placeType:null,       // armed DEF key placed on the next canvas click (null = normal play)
    owner:'player',       // side for newly placed entities: 'player' | 'enemy' | 'neutral'
    god:false, reveal:true, noEnd:true, funding:false,
    simSteps(){ return this.speed|0; },   // main.js only calls this while .on
    enter, exit,
  };

  /* ---- DEF partitioning: what can be placed ------------------------------ */
  // Built lazily (DEF exists at load, but stay defensive). Excludes anything
  // without a name/kind so synthetic/internal keys never show up.
  function placeable(kind){
    return Object.keys(DEF).filter(k=>{ const d=DEF[k]; return d && d.kind===kind && d.name; });
  }

  /* ====================================================================== */
  /*  STYLES                                                                 */
  /* ====================================================================== */
  const css = `
  #sbx-panel{position:fixed;top:64px;left:8px;width:268px;max-height:calc(100vh - 80px);
    overflow:auto;z-index:9000;display:none;flex-direction:column;gap:8px;
    background:linear-gradient(180deg,#0b0e14f2,#10131bf2);border:1px solid #2a3550;
    border-radius:10px;padding:10px;color:#cdd6e6;font:12px/1.35 "Segoe UI",Tahoma,sans-serif;
    box-shadow:0 10px 40px #000a,0 0 0 1px #00e0ff14 inset;backdrop-filter:blur(3px);}
  #sbx-panel.sbx-min{max-height:none;width:auto;}
  #sbx-panel.sbx-min .sbx-body{display:none;}
  #sbx-panel h4{margin:0;font:700 11px/1 "Segoe UI";letter-spacing:.12em;text-transform:uppercase;color:#7fe7ff;}
  #sbx-panel .sbx-hd{display:flex;align-items:center;gap:6px;}
  #sbx-panel .sbx-hd .sp{flex:1;}
  #sbx-panel .sbx-body{display:flex;flex-direction:column;gap:9px;}
  .sbx-sec{display:flex;flex-direction:column;gap:5px;border-top:1px solid #1d2740;padding-top:7px;}
  .sbx-sec:first-child{border-top:0;padding-top:0;}
  .sbx-lbl{font:600 10px/1 "Segoe UI";letter-spacing:.08em;text-transform:uppercase;color:#7c89a6;}
  .sbx-row{display:flex;gap:5px;flex-wrap:wrap;}
  .sbx-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
  .sbx-btn{appearance:none;cursor:pointer;background:#161c2a;color:#cdd6e6;border:1px solid #2c3856;
    border-radius:6px;padding:5px 7px;font:600 11px/1.1 "Segoe UI";text-align:left;
    display:flex;align-items:center;gap:5px;transition:background .1s,border-color .1s;}
  .sbx-btn:hover{background:#1d2540;border-color:#3d4d78;}
  .sbx-btn.on{background:#103a44;border-color:#22c3e6;color:#aef3ff;box-shadow:0 0 0 1px #22c3e655 inset;}
  .sbx-btn.danger:hover{background:#3a1320;border-color:#e0445f;color:#ffd0d8;}
  .sbx-btn .ic{font-size:14px;line-height:1;width:16px;text-align:center;flex:0 0 auto;}
  .sbx-btn .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .sbx-seg{display:flex;gap:0;border:1px solid #2c3856;border-radius:6px;overflow:hidden;}
  .sbx-seg button{flex:1;appearance:none;cursor:pointer;background:#161c2a;color:#aab6cc;border:0;
    border-left:1px solid #2c3856;padding:6px 0;font:700 12px/1 "Segoe UI";}
  .sbx-seg button:first-child{border-left:0;}
  .sbx-seg button.on{background:#103a44;color:#aef3ff;}
  .sbx-note{font:10px/1.3 "Segoe UI";color:#6f7c98;}
  .sbx-status{font:600 10px/1.3 "Segoe UI";color:#8fb9ff;min-height:13px;}
  .sbx-x{cursor:pointer;background:#241420;border:1px solid #5a2336;color:#ff9bb0;border-radius:6px;
    padding:4px 8px;font:700 11px/1 "Segoe UI";}
  .sbx-x:hover{background:#3a1320;}
  .sbx-coll{cursor:pointer;background:#161c2a;border:1px solid #2c3856;color:#9fb0cc;border-radius:6px;
    padding:4px 7px;font:700 12px/1 "Segoe UI";}
  #sbx-select{width:100%;background:#11151f;color:#cdd6e6;border:1px solid #2c3856;border-radius:6px;padding:5px;font:12px "Segoe UI";}
  #sbx-launch{position:relative;}
  #sbx-ghost{position:fixed;z-index:9001;pointer-events:none;display:none;transform:translate(-50%,-50%);
    font-size:22px;text-shadow:0 0 6px #000,0 0 12px #22c3e6;filter:drop-shadow(0 0 3px #000);}
  `;
  const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);

  /* ====================================================================== */
  /*  MENU ENTRY: the "🧪 Sandbox" button now lives in the Settings panel —  */
  /*  rendered by ui.js buildSettingsBody behind a `typeof SANDBOX` guard    */
  /*  (a no-op when this file is absent, preserving the deletability rule).  */
  /* ====================================================================== */
  /*  CONTROL PANEL                                                          */
  /* ====================================================================== */
  let panel, els={};
  function buildPanel(){
    if(panel) return;
    panel=document.createElement('div'); panel.id='sbx-panel';

    // map options: every MAPS entry + the HUB, ORDERED BY EPISODE NUMBER (not array index). The
    // appended Arc-3 maps (indices 19-22) and the villain `.5` interludes sit out of play-order in the
    // array, so sorting by episode makes the list read I…XVI with each interlude slotted into its
    // story position. Labels use the episode number too (displayEp / leading Roman), never "Q"+(i+1)
    // — that showed Ep XIV as "Q20" and the new chapters were impossible to find.
    const romanToNum=(s)=>{ const M={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; let n=0,prev=0;
      for(let k=s.length-1;k>=0;k--){ const v=M[s[k]]; if(!v) return NaN; if(v<prev) n-=v; else { n+=v; prev=v; } } return n; };
    const epNum=(m,i)=>{ const d=(m.displayEp||'').trim();          // sortable episode number
      if(/^[\d.]+$/.test(d)) return parseFloat(d);                  // '7.5','15.5'
      if(/^[IVXLCDM]+$/.test(d)) return romanToNum(d);              // 'XIII','XIV'
      const lead=((m.name||'').trim().match(/^[IVXLCDM]+/)||[''])[0];
      return lead?romanToNum(lead):(900+i); };                      // unparseable (e.g. REX 'FINALE' spacer) → end
    let opts='<option value="hub">⌂ The H.U.B.</option>';
    if(typeof MAPS!=='undefined'){
      MAPS.map((m,i)=>({m,i})).sort((a,b)=>(epNum(a.m,a.i)-epNum(b.m,b.i))||(a.i-b.i)).forEach(({m,i})=>{
        const sub=((m.name||('Map '+i)).split('—')[1]||m.name||('Map '+i)).trim();
        const ep=m.displayEp || ((m.name||'').trim().match(/^[IVXLCDM]+(?:\.\d+)?/)||[''])[0];
        const tag=m.isVillain?('BOSS '+(m.displayEp||'')):('EP '+(ep||(i+1)));
        opts+=`<option value="${i}">${tag} · ${sub}</option>`;      // value stays the real array index (loadMap)
      });
    }

    const unitBtns=placeable('unit').map(k=>paletteBtn(k)).join('');
    const bldBtns =placeable('building').map(k=>paletteBtn(k)).join('');

    panel.innerHTML=`
      <div class="sbx-hd">
        <h4>🧪 Sandbox</h4><span class="sp"></span>
        <button class="sbx-coll" id="sbx-coll" title="Collapse / expand">▾</button>
        <button class="sbx-x" id="sbx-exit" title="Exit sandbox (reloads)">Exit</button>
      </div>
      <div class="sbx-body">
        <div class="sbx-sec">
          <div class="sbx-lbl">Map</div>
          <select id="sbx-select">${opts}</select>
          <button class="sbx-btn" id="sbx-load" style="justify-content:center"><span class="tx">↻ Load fresh</span></button>
        </div>

        <div class="sbx-sec">
          <div class="sbx-lbl">Sim speed</div>
          <div class="sbx-seg" id="sbx-speed">
            <button data-s="0" title="Pause">⏸</button>
            <button data-s="1" class="on">1×</button>
            <button data-s="2">2×</button>
            <button data-s="4">4×</button>
          </div>
        </div>

        <div class="sbx-sec">
          <div class="sbx-lbl">Toggles</div>
          <div class="sbx-grid">
            <button class="sbx-btn" id="sbx-god"><span class="ic">🛡️</span><span class="tx">God mode</span></button>
            <button class="sbx-btn on" id="sbx-reveal"><span class="ic">👁️</span><span class="tx">Reveal map</span></button>
            <button class="sbx-btn on" id="sbx-noend"><span class="ic">⏹️</span><span class="tx">Freeze end</span></button>
            <button class="sbx-btn" id="sbx-funding"><span class="ic">💰</span><span class="tx">∞ Funding</span></button>
          </div>
        </div>

        <div class="sbx-sec">
          <div class="sbx-lbl">Place as</div>
          <div class="sbx-seg" id="sbx-owner">
            <button data-o="player" class="on">Player</button>
            <button data-o="enemy">Enemy</button>
            <button data-o="neutral">Neutral</button>
          </div>
          <div class="sbx-note">Click a unit/building below, then click (or drag-paint) on the map. Esc / right-click disarms.</div>
        </div>

        <div class="sbx-sec">
          <div class="sbx-lbl">Units</div>
          <div class="sbx-grid" id="sbx-units">${unitBtns}</div>
        </div>

        <div class="sbx-sec">
          <div class="sbx-lbl">Buildings <span class="sbx-note">(placed instantly built)</span></div>
          <div class="sbx-grid" id="sbx-buildings">${bldBtns}</div>
        </div>

        <div class="sbx-sec">
          <div class="sbx-lbl">Actions</div>
          <div class="sbx-row">
            <button class="sbx-btn danger" id="sbx-kill-enemy" style="flex:1;justify-content:center"><span class="tx">☠ Kill enemies</span></button>
            <button class="sbx-btn danger" id="sbx-kill-units" style="flex:1;justify-content:center"><span class="tx">☠ Kill all units</span></button>
          </div>
        </div>

        <div class="sbx-status" id="sbx-status">Ready.</div>
        <div class="sbx-note">Procedural map elements (terrain seed, resource scatter, wave timers, enemy base) regenerate on every load — staged here, not authored. Use the Map Editor to author static layouts.</div>
      </div>`;
    document.body.appendChild(panel);

    const ghost=document.createElement('div'); ghost.id='sbx-ghost'; document.body.appendChild(ghost);
    els.ghost=ghost; els.status=panel.querySelector('#sbx-status'); els.select=panel.querySelector('#sbx-select');

    // header
    panel.querySelector('#sbx-exit').onclick=exit;
    panel.querySelector('#sbx-coll').onclick=()=>{ panel.classList.toggle('sbx-min'); panel.querySelector('#sbx-coll').textContent=panel.classList.contains('sbx-min')?'▸':'▾'; };
    const loadSelected=()=>{ const v=els.select.value; loadInto(v==='hub'?'hub':(v|0)); };
    panel.querySelector('#sbx-load').onclick=loadSelected;
    els.select.onchange=loadSelected;   // picking a map auto-loads it — without this the screen keeps showing the previously-loaded map, making two different maps look "the same"

    // speed
    panel.querySelectorAll('#sbx-speed button').forEach(b=>b.onclick=()=>{
      SB.speed=b.dataset.s|0;
      panel.querySelectorAll('#sbx-speed button').forEach(x=>x.classList.toggle('on',x===b));
      status(SB.speed===0?'Paused':('Speed '+SB.speed+'×'));
    });

    // owner
    panel.querySelectorAll('#sbx-owner button').forEach(b=>b.onclick=()=>{
      SB.owner=b.dataset.o;
      panel.querySelectorAll('#sbx-owner button').forEach(x=>x.classList.toggle('on',x===b));
      status('Placing as '+SB.owner);
    });

    // toggles
    bindToggle('#sbx-god','god','God mode');
    bindToggle('#sbx-reveal','reveal','Reveal map');
    bindToggle('#sbx-noend','noEnd','Freeze win/loss');
    bindToggle('#sbx-funding','funding','Infinite funding');

    // palette
    panel.querySelectorAll('.sbx-pal').forEach(b=>b.onclick=()=>arm(b.dataset.type));

    // actions
    panel.querySelector('#sbx-kill-enemy').onclick=()=>killSide('enemy');
    panel.querySelector('#sbx-kill-units').onclick=()=>killAllUnits();
  }
  function paletteBtn(k){
    const d=DEF[k];
    return `<button class="sbx-btn sbx-pal" data-type="${k}" title="${d.name}"><span class="ic">${d.icon||'▪'}</span><span class="tx">${d.name}</span></button>`;
  }
  function bindToggle(sel,key,label){
    const b=panel.querySelector(sel);
    b.classList.toggle('on', !!SB[key]);
    b.onclick=()=>{ SB[key]=!SB[key]; b.classList.toggle('on',SB[key]); applyFlags(); status(label+': '+(SB[key]?'ON':'off')); };
  }
  function status(m){ if(els.status) els.status.textContent=m; }

  /* ====================================================================== */
  /*  ARM / PLACE                                                            */
  /* ====================================================================== */
  function arm(type){
    SB.placeType = (SB.placeType===type) ? null : type;   // click again to disarm
    if(panel) panel.querySelectorAll('.sbx-pal').forEach(b=>b.classList.toggle('on', b.dataset.type===SB.placeType));
    const g=els.ghost;
    if(SB.placeType){ g.textContent=DEF[type].icon||'▪'; status('Armed: '+DEF[type].name+' — click the map'); }
    else { g.style.display='none'; status('Disarmed'); }
  }

  function tileFor(type, wx, wy){
    const d=DEF[type];
    if(d.kind==='building'){
      // center the footprint on the cursor (same convention as the real build ghost)
      return { tx:Math.floor(wx/TILE-(d.w-1)/2+1e-4), ty:Math.floor(wy/TILE-(d.h-1)/2+1e-4) };
    }
    return { tx:Math.floor(wx/TILE), ty:Math.floor(wy/TILE) };
  }
  function place(type, wx, wy){
    if(!G) return false;
    const d=DEF[type]; let {tx,ty}=tileFor(type,wx,wy);
    const w=d.w||1, h=d.h||1;
    tx=Math.max(0,Math.min(G.W-w,tx)); ty=Math.max(0,Math.min(G.H-h,ty));
    let e;
    if(d.kind==='building') e=mkBuilding(G, type, SB.owner, tx, ty, true);   // instant=true → fully built
    else                    e=mkUnit(G, type, SB.owner, tx, ty);
    if(SB.god && SB.owner==='player') e._godmode=true;
    if(typeof recomputeSupply==='function') recomputeSupply(G);
    if(typeof refreshUI==='function') refreshUI();
    return true;
  }

  // capture-phase pointer handlers: intercept canvas clicks ONLY while a tool is
  // armed, so normal select/command/pan still work when nothing is armed.
  let painting=false, lastTile='';
  function onDown(e){
    if(!SB.on || !SB.placeType || e.target!==cv) return;
    if(e.button===2 || e.button===1 || e.altKey){ arm(null); return; }   // right/middle/alt disarms
    if(e.button!==0) return;
    e.stopPropagation(); e.preventDefault();
    const w=screenToWorld(G, e.clientX, e.clientY);
    place(SB.placeType, w.x, w.y);
    painting=true; lastTile=tileKey(w);
  }
  function onMove(e){
    // ghost follows the cursor while armed & over canvas
    if(SB.on && SB.placeType){
      const over = e.target===cv;
      els.ghost.style.display = over ? 'block':'none';
      els.ghost.style.left=e.clientX+'px'; els.ghost.style.top=e.clientY+'px';
    }
    if(!painting || !SB.on || !SB.placeType || e.target!==cv) return;
    e.stopPropagation(); e.preventDefault();
    const w=screenToWorld(G, e.clientX, e.clientY), k=tileKey(w);
    if(k!==lastTile){ lastTile=k; place(SB.placeType, w.x, w.y); }
  }
  function onUp(){ painting=false; }
  function tileKey(w){ return (w.x/TILE|0)+','+(w.y/TILE|0); }

  /* ====================================================================== */
  /*  FLAGS ENFORCEMENT (covers reloads, trained units, paused state)        */
  /* ====================================================================== */
  function applyFlags(){
    if(!G) return;
    G._sandboxNoEnd = !!(SB.on && SB.noEnd);
    if(SB.on && SB.reveal){ G._sandboxReveal=true; if(G.visible) G.visible.fill(1); if(G.explored) G.explored.fill(1); }
    else G._sandboxReveal=false;
    if(SB.on){
      for(const e of (G.entities||[])){
        if(!e) continue;
        if(SB.god && e.owner==='player') e._godmode=true;
        else if(e._godmode) e._godmode=false;
      }
    }
    if(SB.on && SB.funding){ const eco=playerEco(G, LOCAL_CTRL); if(eco && eco.gold<99999) eco.gold=99999; }
  }
  let flagTimer=0;
  function startEnforce(){ if(!flagTimer) flagTimer=setInterval(applyFlags, 250); }
  function stopEnforce(){ if(flagTimer){ clearInterval(flagTimer); flagTimer=0; } }

  /* ====================================================================== */
  /*  ENTER / LOAD / EXIT                                                    */
  /* ====================================================================== */
  function hideMenus(){
    ['startScreen','mapScreen','docScreen','tutorialPromptScreen','mpScreen','loadScreen','settingsScreen']
      .forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  }
  function loadInto(target){
    if(typeof MUSIC!=='undefined' && MUSIC.leaveMenu) MUSIC.leaveMenu();
    netRole='solo';
    if(target==='hub' && typeof newHubMap==='function'){
      G=newHubMap();
      if(typeof resetDialogs==='function') resetDialogs();
      if(typeof syncHud==='function') syncHud();
      if(typeof clampCam==='function') clampCam(G);
      running=true;
      status('Loaded: The H.U.B.');
    } else {
      const idx=target|0;
      loadMap(idx);                          // sets G=newMap(idx), running=true, refreshUI
      status('Loaded: '+((MAPS[idx]&&MAPS[idx].name)||('Quarter '+(idx+1))));
    }
    applyFlags();
    if(typeof refreshUI==='function') refreshUI();
  }
  function enter(mapIdx){
    buildPanel();
    SB.on=true;
    // fresh-start hygiene (mirror beginRun) so a prior run's veterans/heroes don't bleed in
    if(typeof setCarryover==='function') setCarryover([]);
    if(typeof resetHeroes==='function') resetHeroes();
    if(typeof resetHubCampaign==='function') resetHubCampaign();
    hideMenus();
    panel.style.display='flex';
    loadInto(mapIdx==null?0:mapIdx);
    if(els.select) els.select.value=(mapIdx==='hub')?'hub':String(mapIdx==null?0:mapIdx);
    startEnforce();
    status('Sandbox active.');
  }
  function exit(){
    // clear flags, then hard reload — the simplest way back to a pristine menu/state
    SB.on=false; SB.placeType=null; stopEnforce();
    if(G){ G._sandboxNoEnd=false; G._sandboxReveal=false; }
    location.reload();
  }

  /* ====================================================================== */
  /*  ACTIONS                                                                */
  /* ====================================================================== */
  function killSide(side){
    if(!G) return; let n=0;
    for(const e of (G.entities||[])){
      if(e && !e.dead && e.owner===side){ e.hp=0; e.dead=true; n++; if(e.kind==='building' && typeof markBuilding==='function') markBuilding(G,e,false); }
    }
    if(typeof recomputeSupply==='function') recomputeSupply(G);
    if(typeof refreshUI==='function') refreshUI();
    status('Killed '+n+' '+side+' entities');
  }
  function killAllUnits(){
    if(!G) return; let n=0;
    for(const e of (G.entities||[])){
      if(e && !e.dead && e.kind==='unit'){ e.hp=0; e.dead=true; n++; }
    }
    if(typeof recomputeSupply==='function') recomputeSupply(G);
    if(typeof refreshUI==='function') refreshUI();
    status('Killed '+n+' units');
  }

  /* ====================================================================== */
  /*  WIRING                                                                 */
  /* ====================================================================== */
  // capture phase → fires before main.js' canvas gesture listeners
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('keydown', e=>{
    if(!SB.on) return;
    if(e.key==='Escape' && SB.placeType){ arm(null); }   // disarm tool (game's Esc still clears selection)
  });


  console.log('%c[SANDBOX]%c localhost test tool ready — "🧪 Sandbox" under Settings, or SANDBOX.enter(idx)','color:#22c3e6;font-weight:700','color:inherit');
})();
