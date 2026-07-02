/* tutorial.js — Quarter I guided tutorial. PURELY LOCAL / COSMETIC.

   Reads live G state, drives a DOM "Rod comms" coach panel (#tutorialCoach), a world-space
   focus ring (drawn by render.js via TUTORIAL.drawWorld), and a HUD-button highlight arrow
   (#tutorialArrow), and plays the Rod-clone narrator voice. It MUTATES NO SIMULATION STATE,
   so it is safe and gated to netRole==='solo'. All state is module-local — NEVER written onto
   G or into save.js / net/sync.js (mirrors dialogs.js's _dialogs).

   Flow: ui.js startGame(0) → TUTORIAL.prompt(0) shows the yes/no screen → choosePrompt() →
   beginRun() (ui.js) → crawl → loadMap(0) → TUTORIAL.init(G). update() (core.js) polls the
   live state each tick and advances when the player performs the gated action.

   Step copy adapts to the input mode (mouse vs touch) — `text` may be a {mouse,touch} pair —
   because the same action is a different gesture on each (right-click vs tap, etc). The Rod
   voice has an optional `<id>_touch` clip for the gesture-specific steps; VOICE.playTutorial
   falls back to the base clip when it's absent.

   Depends on globals: VOICE (voice.js), toast/eventToast/refreshUI/beginRun (ui.js),
   playerEco/LOCAL_CTRL (units.js/state.js), netRole/mapIndex/G (state.js), ctx (config.js). */
const TUTORIAL = (function(){
  const LS_KEY = 'starleft_tutorial';

  let requested = false;   // player chose "yes" on the prompt (reset each time the prompt shows)
  let active    = false;   // running on the current map
  let stepIdx   = -1;
  let stepT     = 0;       // seconds the current step has been shown
  let advT      = 0;       // beat timer once a step's condition is satisfied
  let worldFocus = null;   // {entity} | {x,y} | null — drawn each frame by drawWorld()
  let domKey    = null;    // data-cmd of the HUD button to highlight, or null
  let baseObjective = '';  // restore #objective when the tutorial ends
  let curObjective = '';   // current step's objective text (re-asserted each refreshUI tick)
  let enemyBldgStart = 0;  // enemy-building count at init (for the "raze one" step)
  let promptIdx = 0;       // map index the prompt is gating
  const mem = {};          // per-step baselines captured in _show()

  let contextualSeen = {};
  try { contextualSeen = (JSON.parse(localStorage.getItem(LS_KEY) || '{}').contextualSeen) || {}; } catch(e){}
  const _saveSeen = ()=>{ try { localStorage.setItem(LS_KEY, JSON.stringify({ contextualSeen })); } catch(e){} };

  /* ---------------- input-mode + copy ---------------- */
  function isTouch(){ try { return matchMedia('(hover:none), (pointer:coarse)').matches; } catch(e){ return false; } }
  function copy(o){ const t=o&&o.text!==undefined?o.text:o; if(t && typeof t==='object') return isTouch() ? (t.touch||t.mouse||'') : (t.mouse||t.touch||''); return t||''; }
  // touch-variant clip id only for steps/lines flagged touchVoice — others have one neutral clip.
  function voiceId(o){ return (o && o.touchVoice && isTouch()) ? (o.id + '_touch') : (o && o.id); }
  function playVoice(o){ if(typeof VOICE!=='undefined' && VOICE.playTutorial) VOICE.playTutorial(voiceId(o)); }

  /* ---------------- live-state helpers ---------------- */
  function ents(){ return (G && G.entities) ? G.entities : []; }
  function players(){ return ents().filter(e=>e.owner==='player' && !e.dead); }
  function pUnits(type){ return players().filter(e=>e.kind==='unit' && (!type || e.type===type)); }
  function pBuild(type){ return players().filter(e=>e.kind==='building' && (!type || e.type===type)); }
  function hq(){ return pBuild('hq').find(b=>!b.constructing) || pBuild('hq')[0] || null; }
  function eco(){ try { return playerEco(G, (typeof LOCAL_CTRL!=='undefined' ? LOCAL_CTRL : 'p1')); } catch(e){ return { gold:0, gold_collected:0 }; } }
  function enemyBuildings(){ return ents().filter(e=>e.owner==='enemy' && e.kind==='building' && !e.dead); }
  function nearestGold(){
    const mines = ents().filter(e=>e.type==='goldmine' && !e.dead);
    if(!mines.length) return null;
    const h = hq(); if(!h) return mines[0];
    let best=mines[0], bd=Infinity;
    for(const m of mines){ const d=(m.x-h.x)*(m.x-h.x)+(m.y-h.y)*(m.y-h.y); if(d<bd){ bd=d; best=m; } }
    return best;
  }
  function nearestEnemyBldg(){
    const bs = enemyBuildings(); if(!bs.length) return null;
    const h = hq(); if(!h) return bs[0];
    let best=bs[0], bd=Infinity;
    for(const b of bs){ const d=(b.x-h.x)*(b.x-h.x)+(b.y-h.y)*(b.y-h.y); if(d<bd){ bd=d; best=b; } }
    return best;
  }
  function armyCount(){ return pUnits().filter(u=>u.type!=='worker').length; }
  function workerBuilding(){ return pUnits('worker').some(u=> u._toBuild || (u.cmd && u.cmd.type==='build')); }
  function workerMining(){ return pUnits('worker').some(u=> u._toMine || u.state==='gather' || (u.cmd && u.cmd.type==='gather')); }
  function hasGroup(){ try { return Object.values(G.groups||{}).some(a=>a && a.length); } catch(e){ return false; } }

  /* =====================================================================
     THE CORE SPINE — each step gates on the player performing its action.
     ===================================================================== */
  const STEPS = [
    { id:'tut-look',
      text:'Welcome to the grind, founder. Drag to look around, pinch or scroll to zoom, and tap one of your fighters to select them.',
      objective:'Tutorial — get your bearings: pan, zoom, select a unit.',
      when:()=> (G.selection||[]).length>0, beat:0.4 },

    // FIGHT FIRST (T0-1): the squad you start with hits the weak DISRUPTR outpost before any chores.
    { id:'tut-strike', touchVoice:true, hintS:6,
      text:{ mouse:'DISRUPTR INC. parked an outpost on your lawn. Select your Growth Cyborgs and right-click it — burn it down.',
             touch:'DISRUPTR INC. parked an outpost on your lawn. Tap a Growth Cyborg, then tap the outpost — burn it down.' },
      objective:'Tutorial — first blood: attack the DISRUPTR outpost.',
      hint:'Tap or click one of your Growth Cyborgs (the armed ones), then tap the glowing enemy structure.',
      focus:()=> { const b=nearestEnemyBldg(); return b?{entity:b}:null; },
      enter:()=>{ mem.eb0 = enemyBuildings().length; },
      when:()=> enemyBuildings().length < (mem.eb0||1)
             || pUnits().some(u=>u.type!=='worker' && ((u.cmd && u.cmd.type==='attack') || (u.autoTarget && !u.autoTarget.dead))) },

    { id:'tut-mine', touchVoice:true,
      text:{ mouse:'That’s the job. Now sustain it — Funding pays for everything. Select an Intern, then right-click a glowing Funding crystal.',
             touch:'That’s the job. Now sustain it — Funding pays for everything. Tap an Intern, then tap a glowing Funding crystal.' },
      objective:'Tutorial — mine Funding: send an Intern to a crystal.',
      focus:()=> { const m=nearestGold(); return m?{entity:m}:null; },
      enter:()=>{ mem.gold0 = eco().gold_collected||0; },
      when:()=> workerMining() || (eco().gold_collected||0) > (mem.gold0||0)+1 },

    { id:'tut-hire',
      text:'Keep that economy growing. Select your HQ and hire another Intern — an idle payroll is wasted runway.',
      objective:'Tutorial — hire another Intern from the HQ.',
      focus:()=> { const h=hq(); return h?{entity:h}:null; },
      domTarget:'hire-intern',
      enter:()=>{ mem.workers0 = pUnits('worker').length; const h=hq(); mem.hq=h; },
      when:()=> { const h=hq(); return pUnits('worker').length > (mem.workers0||0) || (h && (h.prodQueue||[]).indexOf('worker')>=0); } },

    { id:'tut-build-barracks',
      text:'Time to scale the team. Select an Intern, open the build list, and place a People Ops — it trains your fighters.',
      objective:'Tutorial — build a People Ops (barracks).',
      domTarget:'build-barracks',
      when:()=> pBuild('barracks').length>0 },

    { id:'tut-assign', touchVoice:true,
      text:{ mouse:'Buildings need hands. Right-click the People Ops site with an Intern to raise it.',
             touch:'Buildings need hands. Tap the People Ops site with an Intern to raise it.' },
      objective:'Tutorial — send an Intern to build the People Ops.',
      focus:()=> { const b=pBuild('barracks')[0]; return b?{entity:b}:null; },
      when:()=> pBuild('barracks').some(b=>!b.constructing) || workerBuilding() },

    { id:'tut-train',
      text:'Now field an army. Select the People Ops and train Growth Cyborgs and Consultants — mix melee up front with ranged behind.',
      objective:'Tutorial — train combat units at People Ops.',
      focus:()=> { const b=pBuild('barracks').find(x=>!x.constructing); return b?{entity:b}:null; },
      domTarget:'train-soldier',
      enter:()=>{ mem.army0 = armyCount(); const b=pBuild('barracks')[0]; mem.bar=b; },
      when:()=> { const b=pBuild('barracks')[0]; return armyCount() > (mem.army0||0) || (b && (b.prodQueue||[]).length>0); } },

    { id:'tut-army', touchVoice:true,
      text:{ mouse:'Gather your forces. Shift-drag a box around your fighters (or just press F2 to grab the whole army), then click open ground to move out.',
             touch:'Gather your forces. Tap the ▭ Select-box button and drag around your fighters (or ⛶ selects everyone), then tap open ground to move out.' },
      objective:'Tutorial — select your army and move out.',
      when:()=> pUnits().some(u=>u.type!=='worker' && u.cmd && u.cmd.type==='move') },

    { id:'tut-turret',
      text:'Hold what you take. Select an Intern and build a Legal Team turret by your base — it auto-fires on anything that comes close.',
      objective:'Tutorial — build a Legal Team turret to defend.',
      domTarget:'build-turret',
      when:()=> pBuild('turret').length>0 },

    { id:'tut-raze',
      text:'Break them. Push onto a DISRUPTR INC. base and tear another building down — raze every one to win the quarter.',
      objective:'Tutorial — destroy a DISRUPTR INC. building.',
      focus:()=> { const b=nearestEnemyBldg(); return b?{entity:b}:null; },
      enter:()=>{ mem.eb0 = enemyBuildings().length; },
      when:()=> enemyBuildings().length < (mem.eb0||1) || G.extractReady },

    // brief flavor beat only (T0-9): madosis is taught just-in-time by the 'madosis-live'
    // contextual the first time a breakdown actually begins — not lectured here.
    { id:'tut-madosis',
      text:'One more thing — your veterans carry trauma. You’ll learn what that costs when it happens.',
      objective:'Tutorial — veterans carry trauma (madosis).',
      holdMs:3000 },

    { id:'tut-extract', touchVoice:true,
      text:{ mouse:'Clearing the map won’t fly you home. When the dust settles, right-click your HQ with a survivor to garrison, then hit Extraction.',
             touch:'Clearing the map won’t fly you home. When the dust settles, tap your HQ with a survivor to garrison, then hit Extraction.' },
      objective:'Tutorial — extract: garrison a survivor in your HQ.',
      focus:()=> { const h=hq(); return h?{entity:h}:null; },
      domTarget:'extraction',
      // gate on the player actually garrisoning a survivor / launching extraction — NOT on extractReady
      // alone, which the win flips automatically (beginExtractionPhase) the moment the last building falls.
      when:()=> G.extractStarted || pUnits().some(u=>u.storedIn) || pUnits().some(u=>u.cmd && u.cmd.type==='enterhq') },
  ];

  /* Optional one-time contextual pop-ups — fired (once) when the mechanic naturally surfaces.
     They never gate progress; they reuse the toast lane + Rod voice. */
  const CONTEXTUAL = [
    { id:'tut-c-sprint',  when:s=> s.sprint && s.sprint.active,
      text:'That’s the Sprint — keep tapping a spot and your squad runs there, ignoring fire. Hammer fresh spots to kite and flee.' },
    { id:'tut-c-healer',  when:()=> pUnits('recruiter').length>0,
      text:'A Recruiter doesn’t fight — it heals. Tuck one behind your line and the whole squad lasts about twice as long.' },
    { id:'tut-c-group',   when:()=> hasGroup(),
      text:'Control group bound. Tap its number to reselect that squad in a snap — double-tap to jump the camera to them.' },
    // T2-6: sprint-kiting taught the first time the player is genuinely being chased (2+ enemies
    // hunting one unit) while they have a fighting force to bait them into.
    { id:'sprint-kite', when:(s)=>{
        if((s.time||0)<60) return false;
        const counts={}; let chased=false;
        for(const e of s.entities){
          if(e.dead||e.storedIn||e.owner!=='enemy'||e.kind!=='unit') continue;
          const t=e.autoTarget||((e.cmd&&e.cmd.type==='attack')?e.cmd.target:null);
          if(!t||t.dead||t.owner!=='player'||t.kind!=='unit') continue;
          counts[t.id]=(counts[t.id]||0)+1;
          if(counts[t.id]>=2){ chased=true; break; }
        }
        return chased && armyCount()>=2;
      },
      text:'You\'re being chased — double-tap the ground repeatedly to SPRINT, and loop them past your turrets or army into the crossfire.' },
  ];
  const CONTEXTUAL_MAP = {}; CONTEXTUAL.forEach(c=>CONTEXTUAL_MAP[c.id]=c);
  // deferred hint fired from madosis.js the first time a breakdown actually begins (later episodes)
  CONTEXTUAL_MAP['madosis-live'] = { id:'madosis-live',
    text:'There it is — madosis. That veteran’s mind is cracking. A Recruiter or healer hero can talk them back; otherwise you’ll have to put them down. Keep your people rested.' };
  // personhood discovery (T0-5): fired from dialogs.js the first time a single combat unit is selected
  CONTEXTUAL_MAP['dossier-discover'] = { id:'dossier-discover',
    text:'Every one of your people has a name and a story. Select one and open their file from the info panel — and try to bring them home.' };
  // attack-move discovery (T2-3): fired from ui.js the first time 3+ combat units are selected
  CONTEXTUAL_MAP['amove-tip'] = { id:'amove-tip',
    text:{ mouse:'Press A then click the ground to ADVANCE AND FIGHT — your squad engages everything on the way instead of marching past it.',
           touch:'Tap the ⚔ Attack-Move button, then tap the ground — your squad advances and engages everything on the way.' } };
  // headcount/supply (T2-5): fired from tryTrain the first time the cap actually blocks a hire
  CONTEXTUAL_MAP['supply-cap'] = { id:'supply-cap',
    text:'Headcount is your hiring ceiling. Every Open-Plan HQ houses 24 and a Satellite Office 8 — build one forward to expand AND grow the cap.' };
  // advanced-unit necessity (T2-6): fired from the sim the first time each mechanic surfaces
  CONTEXTUAL_MAP['antiair-needed'] = { id:'antiair-needed',
    text:'Enemy AIR inbound — ground rifles can\'t touch it. Field Auditors 📊, Founder Mechs 🦄 or Buzzword Bombers 🛩️ — they\'re your only anti-air.' };
  CONTEXTUAL_MAP['auditor-siege'] = { id:'auditor-siege',
    text:'Your Auditor just SIEGED — rooted, but massive range and splash. Park it behind your line to out-range turrets; it can\'t fire point-blank, so screen it.' };

  /* =====================================================================
     DOM coach panel + highlight
     ===================================================================== */
  function $(id){ return document.getElementById(id); }
  let _wired = false;
  function _wire(){
    if(_wired) return; _wired = true;
    const skip = $('tut-skip'); if(skip) skip.onclick = ()=>skip_();
    window.addEventListener('resize', reflow, { passive:true });
    window.addEventListener('orientationchange', reflow, { passive:true });
  }
  function _showPanel(text){
    const c = $('tutorialCoach'); if(!c) return;
    const t = $('tut-text'); if(t) t.textContent = text;
    c.style.display = 'flex';
  }
  function _hidePanel(){ const c=$('tutorialCoach'); if(c) c.style.display='none'; const a=$('tutorialArrow'); if(a) a.style.display='none'; }

  // (re)apply the pulsing highlight to the current step's HUD button — called at the end of refreshUI()
  // because #commands buttons are rebuilt every tick (so the class is lost on each rebuild).
  function reapplyHighlight(){
    const root = $('commands'); if(!root) return;
    root.querySelectorAll('.cmd-btn.tut-pulse').forEach(el=>el.classList.remove('tut-pulse'));
    if(!active) return;
    if(curObjective){ const ob=$('objective'); if(ob) ob.textContent = curObjective; }   // re-assert (refreshUI overwrote it)
    if(!domKey) return;
    const btn = root.querySelector('[data-cmd="'+domKey+'"]');
    if(btn) btn.classList.add('tut-pulse');
    reflow();
  }
  // position the #tutorialArrow above the highlighted button from its LIVE rect (the HUD reflows by
  // viewport, so never use fixed coords); hide it gracefully when the target isn't on screen.
  function reflow(){
    const arrow = $('tutorialArrow'); if(!arrow) return;
    if(!active || !domKey){ arrow.style.display='none'; return; }
    const root = $('commands');
    const btn = root && root.querySelector('[data-cmd="'+domKey+'"]');
    if(!btn || btn.offsetParent===null){ arrow.style.display='none'; return; }   // missing/collapsed at this breakpoint → text-only
    const r = btn.getBoundingClientRect();
    arrow.style.display = 'block';
    arrow.style.left = (r.left + r.width/2) + 'px';
    arrow.style.top  = (r.top - 10) + 'px';
  }

  /* =====================================================================
     World-space focus ring (drawn inside render.js's world transform)
     ===================================================================== */
  function drawWorld(state){
    if(!active || !worldFocus || typeof ctx==='undefined') return;
    let x, y;
    if(worldFocus.entity){ const e=worldFocus.entity; if(!e || e.dead) return; x=e.x; y=e.y; }
    else { x=worldFocus.x; y=worldFocus.y; }
    if(x==null || y==null) return;
    const t = state.time || 0;
    ctx.save();
    ctx.lineWidth = 2.5;
    for(let i=0;i<2;i++){
      const ph = ((t*0.85 + i*0.5) % 1);
      const r = 16 + ph*42;
      ctx.globalAlpha = (1-ph)*0.85;
      ctx.strokeStyle = '#ffd86b';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* =====================================================================
     Lifecycle
     ===================================================================== */
  // show the yes/no prompt before Quarter I (ui.js startGame routes idx 0 here)
  function prompt(idx){
    promptIdx = idx|0;
    _wire();
    const scr = $('tutorialPromptScreen');
    if(!scr){ requested = false; if(typeof beginRun==='function') beginRun(promptIdx); return; }
    ['startScreen','mapScreen','docScreen'].forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
    if(typeof buildDifficultyRow==='function') buildDifficultyRow('difficultyRow');   // T4-2: pick the lap's difficulty here
    scr.style.display = 'flex';
    if(typeof MUSIC!=='undefined' && MUSIC.enterMenu) MUSIC.enterMenu();
  }
  function choosePrompt(yes){
    requested = !!yes;
    if(typeof TELE!=='undefined') TELE.event('tutorial_optin', { accepted: !!yes });
    if(yes){ try { localStorage.setItem(LS_KEY, JSON.stringify({ contextualSeen, accepted:true })); } catch(e){} }
    const scr = $('tutorialPromptScreen'); if(scr) scr.style.display='none';
    if(typeof beginRun==='function') beginRun(promptIdx);
  }

  function init(state){
    end();                                   // clear any prior run's overlay/state
    if(!requested) return;
    // (C5) co-op runs the SAME guided tutorial via coopInit() below, which sets `requested`; solo sets it
    // via choosePrompt. No netRole gate here — the fresh/QuarterI/non-hub gates below keep it Quarter-I-only.
    if(!state || !state.cfg || state.hub) return;
    if((typeof mapIndex==='number' ? mapIndex : 0) !== 0) return;   // Quarter I only
    if((state.time||0) > 1) return;                                  // fresh map only (never a loaded save)
    _wire();
    active = true; stepIdx = -1; stepT = 0; advT = 0;
    enemyBldgStart = enemyBuildings().length;
    baseObjective = (state.cfg && state.cfg.objective) || '';
    _advance(state);
  }

  let hintFired = false;   // one guiding toast per stalled step (T0-1 stall detection)
  function _show(step, state){
    stepT = 0; advT = 0; hintFired = false;
    for(const k in mem) delete mem[k];
    if(step.enter){ try { step.enter(state); } catch(e){} }
    worldFocus = step.focus ? (step.focus(state) || null) : null;
    domKey = step.domTarget || null;
    curObjective = step.objective || '';
    _showPanel(copy(step));
    reapplyHighlight();
    playVoice(step);
  }

  function _advance(state){
    stepIdx++;
    if(stepIdx >= STEPS.length){ _finish(); return; }
    _show(STEPS[stepIdx], state);
  }

  function _finish(){
    const line = 'Nice work, founder. You’ve got the fundamentals — the rest you’ll learn by breaking things. Now go disrupt.';
    if(typeof eventToast==='function') eventToast('<b>ROD:</b> '+line, 9000);
    else if(typeof toast==='function') toast(line, 6000);
    if(typeof VOICE!=='undefined' && VOICE.playTutorial) VOICE.playTutorial('tut-done');
    end();
  }

  function update(state, dt){
    if(!state || state.over) return;
    if(state.hub){ if(active) end(); return; }   // reached the H.U.B. (extraction done) — tear down cleanly
    // one-time contextual pop-ups fire whether or not the guided tutorial is running — they teach
    // mechanics at the moment they surface (madosis-live already worked this way). CO-OP: the HOST
    // polls them too (it runs update(), so the when() predicates are valid) and fireContextual relays
    // the id to the ally via narrate('ctut'); the CLIENT never polls (it receives the relay instead).
    if(typeof netRole==='undefined' || netRole!=='client')
      for(const c of CONTEXTUAL){ if(!contextualSeen[c.id] && c.when(state)) fireContextual(c.id, state); }
    if(!active) return;
    // keep the arrow glued to the (reflowing) button
    if(domKey) reflow();
    const step = STEPS[stepIdx]; if(!step) return;
    stepT += dt;
    let done;
    if(step.holdMs!=null) done = (stepT*1000 >= step.holdMs);
    else done = step.when ? !!step.when(state) : false;
    if(done){ advT += dt; if(advT >= (step.beat!=null ? step.beat : 0.55)) _advance(state); }
    else {
      advT = 0;
      // stall detection (T0-1): one guiding nudge per step if there's no progress for a while
      if(!hintFired && step.holdMs==null && stepT > (step.hintS!=null ? step.hintS : 9)){
        hintFired = true;
        const h = step.hint || copy(step);
        if(h && typeof toast==='function') toast('💡 '+h, 6000);
      }
    }
  }

  function fireContextual(id, state){
    if(contextualSeen[id]) return;
    const c = CONTEXTUAL_MAP[id]; if(!c) return;
    contextualSeen[id] = true; _saveSeen();
    const txt = copy(c);
    if(typeof eventToast==='function') eventToast('<b>ROD:</b> '+txt, 9000);
    else if(typeof toast==='function') toast(txt, 6000);
    playVoice(c);
    // CO-OP: relay the id (not the text) — the client re-renders its OWN copy() (mouse/touch per device),
    // plays its own Rod clip and marks its own contextualSeen. narrate self-gates (solo/client no-op),
    // and the client's own fireContextual can't recurse (its narrate no-ops).
    if(typeof narrate==='function') narrate('ctut', { id:id });
  }

  function skip_(){ if(typeof VOICE!=='undefined' && VOICE.stopTutorial) VOICE.stopTutorial(); end(); }

  // C5 — co-op onboarding: run the SAME Quarter-I guided tutorial for BOTH co-founders. There's no opt-in
  // prompt in the co-op start flow, so auto-request ONLY the first time this device ever engages the tutorial
  // (mirrors solo's first-time behavior via the same LS 'accepted' flag) — repeat players aren't nagged, and
  // it's fully skippable. Called from the host (mpHostStart) + client (NET.onFullApplied); init() re-checks
  // fresh/QuarterI/non-hub, so this is a no-op on every other map. It never writes the sim → cannot desync.
  function coopInit(state){
    if(typeof netRole==='undefined' || netRole==='solo') return;        // solo uses the prompt flow
    if(typeof MP_SESSION!=='undefined' && MP_SESSION.mode && MP_SESSION.mode!=='campaign') return;  // campaign only
    let seen=false; try{ seen=!!(JSON.parse(localStorage.getItem(LS_KEY)||'{}').accepted); }catch(e){}
    if(seen) return;                                                    // already onboarded once on this device
    requested = true;
    init(state);
    if(active){ try{ localStorage.setItem(LS_KEY, JSON.stringify({ contextualSeen, accepted:true })); }catch(e){} }  // mark onboarded so it won't re-fire next co-op run
  }

  function end(){
    active = false; stepIdx = -1; worldFocus = null; domKey = null; curObjective = '';
    _hidePanel();
    const root = $('commands'); if(root) root.querySelectorAll('.cmd-btn.tut-pulse').forEach(el=>el.classList.remove('tut-pulse'));
    if(typeof VOICE!=='undefined' && VOICE.stopTutorial) VOICE.stopTutorial();
  }

  return { prompt, choosePrompt, init, coopInit, update, drawWorld, reapplyHighlight, reflow, fireContextual, skip:skip_, end,
           isActive:()=>active };
})();
