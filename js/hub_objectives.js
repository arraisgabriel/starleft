/* hub_objectives.js — H.U.B.-side objectives. Drives the SAME topbar component as in-mission quests
   (the #obj-chip chip + #quest-panel dropdown rendered by updateQuestHud in ui.js), but off the
   persistent CAMPAIGN state instead of the per-mission G.quests, and pays merits (M3$) IMMEDIATELY
   on completion (the HUB has no extraction edge to pay at).

   Two kinds, one gating model:
     - episode-keyed (def.ep:N)         → visible ONLY while hubObjEpisodeNo()===N (exact episode;
                                          forfeited silently if the player launches the next quarter undone).
     - contextual    (def.epMin/epMax)  → visible across an episode window; one-time (lifetime) OR
                                          `repeatable` (re-arms each HUB visit via CAMPAIGN.visit).

   Completion: a monotonic METRIC (a number that only ever rises) vs a baseline captured at activation.
     delta    (default):     metric() - base >= count
     absolute (def.absolute): metric()        >= count
   `base` (snapshotted in hubObjEnsure) stops an objective instant-completing on already-accrued
   progress; CAMPAIGN.objectives.completed[] stops any re-award after a reload.

   State (persists in CAMPAIGN, serialized via serializeHubCampaign; legacy-safe defaults in hub.js):
     CAMPAIGN.objectives = { byId:{ [id]:{cur,base,done,visit,doneVisit?} }, completed:[ids] }
     CAMPAIGN.stats      = { trainSessions, wakeStarts, healedHighMad }   // monotonic lifetime counters

   Host/solo only: hubObjTick() is called from core.js update() (which never runs on clients); the
   netRole==='client' guard is belt-and-suspenders. Clients receive CAMPAIGN via co-op snapshots and
   just render it. The completion toast fires host-side from the tick, consistent with the other HUB
   systems (hubGraduateSession / hubWakeComplete / updateTrainingSessions all toast host-side). */

const HUB_OBJECTIVES = [
  // episode-keyed teaching beats (exact episode; ep === hubObjEpisodeNo())
  { id:'onboardDeploy', type:'mdcStaged',    ep:1,    count:1, absolute:true, reward:90,
    text:'Stage a unit at a red M.D.C., then launch the next quarter' },
  { id:'condoUpgrade',  type:'condoUpgrade', ep:3,    count:1,               reward:115,
    text:'Upgrade a condo — give your people somewhere to come home to' },
  { id:'trainSession',  type:'trainSession', ep:4,    count:1,               reward:105,
    text:'Start a training session in the Grounds' },
  { id:'wakeStart',     type:'wakeStart',    ep:12,   count:1,               reward:140,
    text:'Power The Wake — begin writing a fallen name back into metal' },
  // contextual / windowed
  { id:'mdcSquad',      type:'mdcStaged',    epMin:2, count:5, absolute:true, repeatable:true, reward:95,
    text:'Garrison a full squad — five units staged for deployment' },
  { id:'healHighMad',   type:'healHighMad',  epMin:6, count:3, absolute:true, reward:125,
    text:'Pull three units back from the edge — heal their madosis' },
];

// monotonic metrics — each returns a count that only ever rises (so delta/absolute math is stable)
const HUB_OBJ_METRIC = {
  condoUpgrade(){ let n=0; const c=(CAMPAIGN&&CAMPAIGN.condos)||{}; for(const k in c) n+=(c[k]&&c[k].level)||0; return n; },
  trainSession(){ return (CAMPAIGN&&CAMPAIGN.stats&&CAMPAIGN.stats.trainSessions)||0; },
  wakeStart(){    return (CAMPAIGN&&CAMPAIGN.stats&&CAMPAIGN.stats.wakeStarts)||0; },
  healHighMad(){  return (CAMPAIGN&&CAMPAIGN.stats&&CAMPAIGN.stats.healedHighMad)||0; },
  mdcStaged(){    return ((CAMPAIGN&&CAMPAIGN.dispatch&&CAMPAIGN.dispatch.staged)||[]).length; },
};

// 1-based UPCOMING episode the player is prepping for in the HUB (Episode N = MAPS[N-1]).
function hubObjEpisodeNo(){ return ((typeof CAMPAIGN!=='undefined'&&CAMPAIGN&&CAMPAIGN.nextMapIndex)|0)+1; }

// lazy guard so a legacy save / early boot never crashes a reader
function hubObjStore(){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN) return {byId:{},completed:[]};
  let o=CAMPAIGN.objectives;
  if(!o || typeof o!=='object'){ o=CAMPAIGN.objectives={byId:{},completed:[]}; }
  if(!o.byId || typeof o.byId!=='object') o.byId={};
  if(!Array.isArray(o.completed)) o.completed=[];
  return o;
}

function hubObjMetric(def){ const m=def&&HUB_OBJ_METRIC[def.type]; return m?(m()|0):0; }

function hubObjApplies(def, ep){
  if(!def) return false;
  if(!def.repeatable && hubObjStore().completed.indexOf(def.id)>=0) return false;   // one-time: done forever
  if(def.ep!=null) return ep===def.ep;                                             // exact episode
  return ep>=(def.epMin||0) && ep<=(def.epMax!=null?def.epMax:Infinity);           // window
}

// create / re-arm the per-objective record. Captures base BEFORE any eval reads the metric this tick,
// so a freshly-applicable objective sitting on already-accrued progress reads cur=0 (delta) instead of
// instant-completing. Repeatable objectives re-arm when the HUB visit number changes (CAMPAIGN.visit).
function hubObjEnsure(){
  const st=hubObjStore(), ep=hubObjEpisodeNo(), visit=(CAMPAIGN.visit|0);
  for(const def of HUB_OBJECTIVES){
    if(!hubObjApplies(def, ep)) continue;
    let rec=st.byId[def.id];
    if(!rec){ st.byId[def.id]={cur:0, base:hubObjMetric(def), done:0, visit}; continue; }
    if(def.repeatable && rec.visit!==visit){ rec.base=hubObjMetric(def); rec.cur=0; rec.done=0; rec.visit=visit; rec.doneVisit=undefined; }
  }
}

function hubObjEval(def, rec){
  const goal=def.count||1, metric=hubObjMetric(def);
  const raw=def.absolute ? metric : Math.max(0, metric-(rec.base||0));
  rec.cur=Math.min(raw, goal);
  return raw>=goal ? 'done' : 'run';
}

// host/solo per-tick — called from core.js update() gated on state.hub
function hubObjTick(){
  if(typeof netRole!=='undefined' && netRole==='client') return;   // clients never simulate campaign state
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN) return;
  hubObjEnsure();
  const st=hubObjStore(), ep=hubObjEpisodeNo();
  let changed=false;
  for(const def of HUB_OBJECTIVES){
    if(!hubObjApplies(def, ep)) continue;
    const rec=st.byId[def.id]; if(!rec || rec.done) continue;
    if(hubObjEval(def, rec)==='done'){
      rec.done=1; rec.doneVisit=(CAMPAIGN.visit|0);
      if(!def.repeatable && st.completed.indexOf(def.id)<0) st.completed.push(def.id);
      CAMPAIGN.m3=(CAMPAIGN.m3|0)+(def.reward|0);                 // paid on the spot, no extraction gate
      if(typeof netRole!=='undefined' && netRole!=='solo') CAMPAIGN.m3p2=(CAMPAIGN.m3p2|0)+(def.reward|0);   // CO-OP: ×player-count — the ally's pool earns the same reward (hub.js enterHubFromCombat pattern)
      if(typeof ACH!=='undefined' && def.ach) ACH.fire(def.ach);
      if(typeof eventToast==='function') eventToast('🏅 <b>H.U.B. OBJECTIVE</b> — '
        +(typeof _escHtml==='function'?_escHtml(def.text):def.text)+' <b>+'+(def.reward|0)+' M3$</b>', 7000);
      if(typeof narrate==='function') narrate('toast',{ html:'🏅 <b>H.U.B. OBJECTIVE</b> — '
        +(typeof _escHtml==='function'?_escHtml(def.text):def.text)+' <b>+'+(def.reward|0)+' M3$</b>', ev:1, ms:7000 });   // CO-OP: the ally sees + gets paid the same beat
      changed=true;
    }
  }
  if(changed && !window._rbReplaying && typeof refreshUI==='function') refreshUI();
}

// defs the HUB chip should render this frame: applicable now, PLUS anything completed THIS visit
// (so the ✔ + reward stays visible until the player launches the next quarter).
function hubObjActiveDefs(){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN) return [];
  const st=hubObjStore(), ep=hubObjEpisodeNo(), visit=(CAMPAIGN.visit|0), out=[];
  for(const def of HUB_OBJECTIVES){
    if(hubObjApplies(def, ep)){ out.push(def); continue; }
    const rec=st.byId[def.id];
    if(rec && rec.done && rec.doneVisit===visit) out.push(def);   // keep the freshly-earned ✔ on screen
  }
  return out;
}

// adapt a HUB objective record into the {cur,goal,done,failed,na} shape updateQuestHud already renders
function hubObjUiState(def){
  const goal=(def&&def.count)||1, rec=def && hubObjStore().byId[def.id];
  if(!rec) return {cur:0, goal, done:0, failed:0, na:0};
  return {cur:rec.cur||0, goal, done:rec.done?1:0, failed:0, na:0};
}
