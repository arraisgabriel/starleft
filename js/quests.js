/* quests.js — multi-objective quest system. A map's MAPS entry declares `quests:[…]`; victory is
   "all required quests done" (checkWinLose's quest branch, core.js). Maps WITHOUT cfg.quests keep
   the legacy chain (villain / winCondition / razeAll) untouched.

   Quest DEF (declarative, lives on the MAPS entry — re-derived via scaleCfg on every load, so
   text/reward are never serialized):
     { id:'raze',                 — unique per map; quest STATE is keyed by it (reorder/save-proof)
       text:'Raze all three …',  — HUD line (quest tracker, briefing, victory screen)
       type:'razeAll',           — one of QUEST_EVAL below
       required:true,            — absent = BONUS quest (pays `reward` M3$ via hubRewardFor)
       reward:75,                — M3$ paid on victory if done (bonus quests only)
       winsAlone:true,           — OR-victory: this quest alone ends the mission (interlude raze-shortcut parity)
       count/unit/by/amount }    — type params (see evaluators)

   Quest STATE (G.quests[id], plain JSON — serializes with the save and rides rollback snapshots
   automatically): { cur, goal, done:0|1, failed:0|1, na:0|1, t?, prevT? }.

   AUTHORING INVARIANTS:
   - required quests must be completable from any mid-mission state (legacy saves lazily re-init
     here): only razeAll / defeatVillain / survive / escort / reachAndHold / holdout — all derived
     from serialized state (holdout reads state.holdout, maintained by waves.js) — may be `required`.
     Hook-counted (trainUnits) or unique-unit-dependent
     (freeCaptives — only Nino frees captives) quests must stay bonus or they can softlock.
   - everything is POLLED from serialized state each tick (self-correcting, idempotent,
     rollback-safe) except trainUnits (underivable → 2-line hook in spawnTrained).
   Evaluated host/solo only (questsTick runs inside update()'s checkWinLose — clients never
   simulate; they receive G.quests via snapshots and render it). Toasts are UI-side
   (questToasts in ui.js diffs done/failed flips), so they fire on clients too. */

/* ---------- lazy init — the _eventsFired pattern: one code path covers fresh maps,
   legacy saves, imports and rollback restores. Goals derive from cfg or live state,
   so initializing mid-mission (old save) still lands on correct values. ---------- */
function questsEnsure(state){
  const Q = state.quests || (state.quests={});
  const defs = (state.cfg && state.cfg.quests) || [];
  for(const def of defs){ if(!Q[def.id]) Q[def.id]=questInit(state, def); }
  return Q;
}
function questInit(state, def){
  const q={cur:0, goal:1, done:0, failed:0};
  const wc=state.cfg && state.cfg.winCondition;
  switch(def.type){
    case 'razeAll':          q.goal=0; break;                                   // recomputed live each tick
    case 'survive':          q.goal=(wc&&wc.forSec)||300; break;
    case 'reachAndHold':     q.goal=(wc&&wc.holdSec)||45; q.t=state._holdT||0; break;  // adopt a legacy save's accumulator
    case 'winBy':            q.goal=def.by||def.count||600; break;
    case 'trainUnits': case 'killUnits': case 'peakSupply': case 'promotions':
                             q.goal=def.count||1; break;
    case 'accumulateFunding':q.goal=def.amount||def.count||1000; break;
    case 'maxUnitsLost':     q.goal=def.count|0; break;
    case 'reclaimOutposts':  q.goal=def.count||((state.cfg.lostBases||[]).length||1); break;
    case 'freeCaptives':     q.goal=def.count||((state.cfg.captives||[]).length||1); break;
    case 'heroesAlive':{     // carryover-dependent: no hero on the field this run → not applicable (hidden, unpaid)
      const hero=state.entities.some(e=>!e.dead && e.kind==='unit' && e.owner==='player' && e.hero && !e.captive);
      if(!hero) q.na=1; break;
    }
    case 'holdout':          q.goal=((state.cfg.holdout&&state.cfg.holdout.waves)||[]).length||1; break;   // waves cleared → the transfer bar
  }
  return q;
}

/* ---------- evaluators — return 'run' | 'done' | 'failed'; mutate q.cur/q.goal only ---------- */
const QUEST_TIMER_TYPES={survive:1, reachAndHold:1, winBy:1};   // UI renders these as ⏳ countdowns
const QUEST_PROGRESS_TYPES={holdout:1};   // UI renders these as a ▰▰▱▱ progress bar (cur/goal), not an (n/m) counter
const QUEST_FINALIZE_TYPES={maxUnitsLost:1, winBy:1, heroesAlive:1, noVetDeaths:1, bossNoFlee:1};   // invariant quests: fail mid-run, done at the win edge

const QUEST_EVAL={
  // done = no live enemy building — byte-identical predicate to checkWinLose's razeAll default.
  // goal grows when the enemy AI fortifies (new turrets), so the counter stays honest.
  razeAll(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    let live=0; for(const e of state.entities){ if(e.owner==='enemy'&&e.kind==='building'&&!e.dead) live++; }
    q.cur=hs.buildingKills||0; q.goal=q.cur+live;
    return live===0 ? 'done' : 'run';
  },
  // mirror of villainCheckWinLose's predicate (villains.js): spawned-guard + alive-scan.
  // A FLED boss still counts done (the mission is a win) — bossNoFlee is the distinction.
  defeatVillain(state, def, q){
    q.goal=1;
    if(!state._villainSpawned) return 'run';
    if(state.entities.some(e=>e.villain && !e.dead && !e.escaped)) return 'run';
    q.cur=1; return 'done';
  },
  // holdout: the reusable wave-defense engine (waves.js) owns the staging; this just mirrors its
  // progress (cur=waves cleared → the transfer bar) and flips done when state.holdout reaches 'done'.
  holdout(state, def, q){
    const hd=state.cfg&&state.cfg.holdout; q.goal=((hd&&hd.waves)||[]).length||1;
    const H=state.holdout;
    if(!H) return 'run';
    q.cur=Math.min(q.goal, H.cleared||0);
    return H.phase==='done' ? 'done' : 'run';
  },
  // survive/escort/reachAndHold share core.js's evalSurvive/evalEscort/evalReachAndHold (one body
  // of logic with the quest-less checkAltWin fallback); params stay on cfg.winCondition so
  // map.js VIP-flagging and the render.js beacon keep working unmodified.
  survive(state, def, q){
    const wc=(state.cfg&&state.cfg.winCondition)||{};
    q.goal=wc.forSec||300; q.cur=Math.min(state.time|0, q.goal);
    const r=(typeof evalSurvive==='function')?evalSurvive(state,wc):'run';
    return r==='win'?'done' : r==='lose'?'failed' : 'run';
  },
  escort(state, def, q){
    const wc=state.cfg&&state.cfg.winCondition; if(!wc||!wc.to) return 'run';
    const r=(typeof evalEscort==='function')?evalEscort(state,wc):'run';
    if(r==='win'){ q.cur=1; return 'done'; }
    return r==='lose'?'failed':'run';
  },
  reachAndHold(state, def, q){
    const wc=state.cfg&&state.cfg.winCondition; if(!wc||!wc.at) return 'run';
    q.goal=wc.holdSec||45;
    if(typeof evalReachAndHold!=='function') return 'run';
    const res=evalReachAndHold(state, wc, q.t||0, q.prevT);
    q.t=res.t; q.prevT=res.prevT; q.cur=Math.min(q.goal, Math.floor(q.t));
    return res.r==='win'?'done':'run';
  },
  reclaimOutposts(state, def, q){
    const cfgTotal=(state.cfg.lostBases||[]).length||q.goal;
    let liveAb=0; for(const e of state.entities){ if(!e.dead && e.abandoned) liveAb++; }
    q.cur=Math.min(q.goal, Math.max(0, cfgTotal-liveAb));
    return q.cur>=q.goal ? 'done' : 'run';
  },
  freeCaptives(state, def, q){
    const cfgTotal=(state.cfg.captives||[]).length||q.goal;
    let caged=0; for(const e of state.entities){ if(!e.dead && e.captive) caged++; }
    q.cur=Math.min(q.goal, Math.max(0, cfgTotal-caged));
    return q.cur>=q.goal ? 'done' : 'run';
  },
  guardsCleared(state, def, q){
    if(!(state.cfg.guards && state.cfg.guards.length)) return 'run';   // never authored without cfg.guards
    q.goal=1;
    const live=state.entities.some(e=>!e.dead && e.owner==='enemy' && e.guard);
    if(live) return 'run';
    q.cur=1; return 'done';
  },
  trainUnits(state, def, q){            // cur is incremented by questNotifyTrained (spawnTrained hook)
    return (q.cur||0)>=q.goal ? 'done' : 'run';
  },
  killUnits(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    q.cur=Math.min(q.goal, hs.unitKills||0);
    return q.cur>=q.goal ? 'done' : 'run';
  },
  accumulateFunding(state, def, q){
    q.cur=Math.min(q.goal, Math.floor((typeof teamGoldCollected==='function')?teamGoldCollected(state):0));
    return q.cur>=q.goal ? 'done' : 'run';
  },
  peakSupply(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    q.cur=Math.min(q.goal, hs.peakSupply||0);
    return q.cur>=q.goal ? 'done' : 'run';
  },
  promotions(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    q.cur=Math.min(q.goal, hs.promotions||0);
    return q.cur>=q.goal ? 'done' : 'run';
  },
  // ---- invariant (finalize) quests: 'failed' the moment the invariant breaks, 'done' only at the win edge ----
  maxUnitsLost(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    q.cur=hs.unitsLost||0;
    return q.cur>q.goal ? 'failed' : 'run';
  },
  winBy(state, def, q){
    q.cur=Math.min(state.time|0, q.goal);
    return state.time>q.goal ? 'failed' : 'run';
  },
  heroesAlive(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    return (hs.heroDeaths||0)>0 ? 'failed' : 'run';
  },
  noVetDeaths(state, def, q){
    const hs=(typeof hubEnsureStats==='function')?hubEnsureStats(state):{};
    return (hs.vetDeaths||0)>0 ? 'failed' : 'run';
  },
  bossNoFlee(state, def, q){
    return state._villainEscaped ? 'failed' : 'run';
  },
};

/* ---------- per-tick evaluation (called from checkWinLose's quest branch, host/solo only) ---------- */
function questsTick(state){
  const defs=state.cfg && state.cfg.quests; if(!defs || !defs.length) return;
  const Q=questsEnsure(state);
  let changed=false;
  for(const def of defs){
    const q=Q[def.id]; if(!q || q.done || q.failed || q.na) continue;
    const ev=QUEST_EVAL[def.type]; if(!ev) continue;   // unknown type: inert (forward-compat with newer saves/maps)
    const r=ev(state, def, q);
    if(r==='done'){ q.done=1; changed=true; }
    else if(r==='failed'){ q.failed=1; changed=true; }
  }
  if(changed && !window._rbReplaying && typeof refreshUI==='function') refreshUI();
}

/* ---------- victory/defeat predicates ---------- */
function questsAllRequiredDone(state){
  const defs=state.cfg.quests, Q=state.quests||{};
  let any=false;
  for(const def of defs){
    if(!def.required) continue;
    any=true;
    const q=Q[def.id]; if(!q || !q.done) return false;
  }
  return any;   // a map with NO required quests never auto-wins (winsAlone may still end it)
}
function questsAnyRequiredFailed(state){
  const defs=state.cfg.quests, Q=state.quests||{};
  for(const def of defs){
    if(!def.required) continue;
    const q=Q[def.id]; if(q && q.failed) return true;
  }
  return false;
}
function questsAnyWinsAloneDone(state){
  const defs=state.cfg.quests, Q=state.quests||{};
  for(const def of defs){
    if(!def.winsAlone) continue;
    const q=Q[def.id]; if(q && q.done) return true;
  }
  return false;
}

/* ---------- win edge: invariant quests whose fail condition never tripped are earned ---------- */
function questsFinalize(state){
  const defs=state.cfg && state.cfg.quests; if(!defs) return;
  const Q=questsEnsure(state);
  for(const def of defs){
    const q=Q[def.id]; if(!q || q.done || q.failed || q.na) continue;
    if(QUEST_FINALIZE_TYPES[def.type]) q.done=1;
  }
}

/* ---------- victory routing — reuse the PROVEN flows so boss gating / extraction / hub / finale
   behavior cannot diverge: villain cfgs go through bossOutcome (fled toast + _fledBoss + REX
   finale/IPO routing + markVillainCleared), everything else through altWinTriggered
   (skirmish / solo extraction / host hub / over+onVictory). ---------- */
function questsDeclareVictory(state){
  questsFinalize(state);
  if(state.cfg && state.cfg.villain && typeof bossOutcome==='function'){
    bossOutcome(state, state._villainEscaped ? 'fled' : 'win');
    return;
  }
  altWinTriggered(state);
}

/* ---------- the one event hook: trained units are not derivable from state ---------- */
function questNotifyTrained(state, type){
  const defs=state.cfg && state.cfg.quests; if(!defs || !defs.length) return;
  const Q=questsEnsure(state);
  for(const def of defs){
    if(def.type!=='trainUnits') continue;
    if(def.unit && def.unit!==type) continue;
    const q=Q[def.id]; if(!q || q.done || q.failed) continue;
    q.cur=(q.cur||0)+1;   // 'done' is flagged by the evaluator on the next questsTick (state flips stay in one place)
  }
}
