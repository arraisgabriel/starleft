/* waves.js — reusable HOLDOUT / wave-defense engine. A map declares `cfg.holdout {...}` and this
   drives a staged "hold a position through N escalating enemy waves (optionally ending in a boss)"
   objective. Episode XI is the first consumer ("Seize the GRAAL"), but the engine is map-agnostic:
   everything it needs is read from cfg.holdout, so any episode can opt in.

   FLOW (state machine on state.holdout):
     idle     → (a `requires` quest is done, if set) AND a player unit reaches the anchor → arm wave 0
     fighting → a wave is live; clear it (all spawned units + boss dead) to advance, OR lose all
                defenders in the zone to ABORT back to idle (the seize must be defended)
     gap      → a short beat between waves
     done     → all waves cleared; the linked quest flips done (its evaluator reads this phase)

   PRESENTATION: framed as the linked quest's progress (cur=waves cleared, goal=total) so the quest
   HUD renders it as a "transfer" bar (ui.js QUEST_PROGRESS_TYPES) — i.e. the seizure advancing as
   time passes, not raw "Wave N". Per-phase flavor is host-side eventToast.

   NET / SAVE / DETERMINISM: runs host/solo only (called from update(), which clients never run —
   they receive the spawned waves/boss as synced entities and the bar via synced G.quests). All
   state is plain JSON (state.holdout) so it serializes + rides rollback automatically; spawning is
   deterministic (no Math.random). Reuses mkUnit (map.js), issueMove amove (units.js),
   spawnVillainEntry (villains.js), vetWaveCapFactor/coopFactor (balance.js), isVisiblePix (render.js). */

function holdoutEntById(state, id){
  if(id==null) return null;
  for(const e of state.entities){ if(e.id===id) return e; }
  return null;
}
// Anchor in world px + its footprint radius (so zone/reach measure from the structure's EDGE).
function holdoutAnchor(state){
  const h=state.cfg.holdout||{}, a=h.anchor||{};
  if(a.type){
    const e=state.entities.find(x=>x.type===a.type && !x.dead);
    if(e) return { x:(e.tx+e.w/2)*TILE, y:(e.ty+e.h/2)*TILE, br:Math.max(e.w,e.h)*TILE*0.5 };
  }
  if(a.x!=null) return { x:(a.x+0.5)*TILE, y:(a.y+0.5)*TILE, br:0 };
  return { x:state.W*TILE/2, y:state.H*TILE/2, br:0 };
}
function holdoutZone(state){
  const a=holdoutAnchor(state), z=(state.cfg.holdout&&state.cfg.holdout.zone)||{};
  return { x:a.x, y:a.y, r:a.br + ((z.radius!=null?z.radius:5)*TILE) };
}
// scale wave size to the carried veteran roster (VPI) and co-op player count (same knobs as ai.js)
function holdoutRosterFactor(state){
  let f=1;
  if(typeof vetWaveCapFactor==='function') f*=vetWaveCapFactor(state._vpi||0);
  if(typeof coopFactor==='function')       f*=coopFactor(state.players||1);
  return f;
}
// candidate spawn tiles; prefer ones currently OUTSIDE the player's view (in fog) so waves appear off-screen
function holdoutSpawnTiles(state){
  const h=state.cfg.holdout||{};
  let pts=(h.spawns||[]).slice();
  if(!pts.length){ const a=holdoutAnchor(state); pts=[{ x:(a.x/TILE)|0, y:Math.max(0,((a.y/TILE)|0)-7) }]; }
  const fogged=pts.filter(p=> typeof isVisiblePix!=='function' || !isVisiblePix(state,(p.x+0.5)*TILE,(p.y+0.5)*TILE));
  return fogged.length ? fogged : pts;
}
function holdoutRequiresMet(state){
  const req=state.cfg.holdout && state.cfg.holdout.requires;
  if(!req) return true;
  const q=state.quests && state.quests[req];
  return !!(q && q.done);
}
function holdoutReached(state){
  const a=holdoutAnchor(state), rr=(state.cfg.holdout.trigger&&state.cfg.holdout.trigger.reachRadius)!=null
    ? state.cfg.holdout.trigger.reachRadius : 3;
  const reach=a.br + rr*TILE;
  return state.entities.some(e=>e.owner==='player'&&e.kind==='unit'&&!e.dead&&!e.storedIn
    && Math.hypot(e.x-a.x,e.y-a.y)<=reach);
}
function holdoutDefendersPresent(state){
  const z=holdoutZone(state);
  return state.entities.some(e=>e.owner==='player'&&e.kind==='unit'&&!e.dead&&!e.storedIn
    && Math.hypot(e.x-z.x,e.y-z.y)<=z.r);
}
// Abort ONLY after defenders have been absent from the (large) hold zone for a sustained grace window
// (graceSec, default 12s) — a brief push-out mid-fight or chasing a straggler just outside the zone
// never costs progress; only a genuine abandonment resets. undefendedT accumulates on H so absence
// spanning a fighting↔gap transition still counts, and rides save/rollback like gapT.
function holdoutUndefendedAbort(state, dt){
  const hd=state.cfg.holdout, H=state.holdout;
  if(hd.resetOnUndefended===false) return false;
  if(holdoutDefendersPresent(state)){ H.undefendedT=0; return false; }
  H.undefendedT=(H.undefendedT||0)+dt;
  return H.undefendedT >= (hd.graceSec!=null ? hd.graceSec : 12);
}
function holdoutToast(state, msg){
  if(typeof window!=='undefined' && window._rbReplaying) return;
  if(typeof eventToast==='function') eventToast(msg, 8000);
  else if(typeof toast==='function') toast(msg);
  if(typeof narrate==='function') narrate('toast',{ html:msg, ev:1, ms:8000 });   // co-op: mirror holdout arm/transfer%/boss prompts to the client (single choke-point)
}
function holdoutSyncQuest(state){
  const hd=state.cfg.holdout, H=state.holdout;
  if(hd.quest && state.quests && state.quests[hd.quest]){
    const q=state.quests[hd.quest];
    q.goal=(hd.waves||[]).length||1;
    q.cur=Math.min(q.goal, H.cleared||0);
  }
}
// spawn one wave's units (flagged guard so ai.js never sweeps/caps/reinforces them) + optional boss,
// each attack-moving onto the anchor so they march on the defenders and auto-acquire.
function holdoutSpawnWave(state, waveDef){
  const H=state.holdout, a=holdoutAnchor(state), tiles=holdoutSpawnTiles(state);
  const scale=(state.cfg.holdout.scaleWithRoster!==false) ? holdoutRosterFactor(state) : 1;
  H.waveIds=[]; H.bossId=null;
  let pi=0, idx=0;
  for(const pair of (waveDef.comp||[])){
    const type=pair[0]; let count=pair[1]|0;
    if(scale!==1) count=Math.max(1, Math.round(count*scale));
    for(let k=0;k<count;k++){
      const p=tiles[pi%tiles.length]; pi++;
      const tx=(p.x + ((idx%3)-1))|0, ty=(p.y + ((idx/3|0)%3))|0; idx++;
      const u=(typeof mkUnit==='function') ? mkUnit(state, type, 'enemy', tx, ty) : null;
      if(!u) continue;
      u.guard=true; u._holdoutWave=true;
      const jx=((idx%5)-2)*10, jy=((idx%3)-1)*10;
      if(typeof issueMove==='function') issueMove(state, u, a.x+jx, a.y+jy, {type:'amove', x:a.x+jx, y:a.y+jy});
      H.waveIds.push(u.id);
    }
  }
  if(waveDef.boss && typeof spawnVillainEntry==='function'){
    const bt=tiles[pi%tiles.length];
    const before=state.entities.length;
    spawnVillainEntry(state, { id:waveDef.boss.id, x:(bt.x|0), y:(bt.y|0) });
    if(state.entities.length>before){
      const boss=state.entities[before];          // the freshly-pushed villain
      boss._holdoutWave=true;
      if(typeof issueMove==='function') issueMove(state, boss, a.x, a.y, {type:'amove', x:a.x, y:a.y});
      H.bossId=boss.id;
    }
  }
}
function holdoutWaveAlive(state){
  const H=state.holdout;
  for(const id of (H.waveIds||[])){ const e=holdoutEntById(state,id); if(e && !e.dead) return true; }
  if(H.bossId!=null){ const b=holdoutEntById(state,H.bossId); if(b && !b.dead && !b.escaped) return true; }
  return false;
}
function holdoutDespawnWave(state){
  const H=state.holdout;
  for(const id of (H.waveIds||[])){ const e=holdoutEntById(state,id); if(e && !e.dead) e.dead=true; }
  if(H.bossId!=null){ const b=holdoutEntById(state,H.bossId); if(b && !b.dead) b.dead=true; }
  H.waveIds=[]; H.bossId=null;
}
function holdoutAbort(state, msg){
  const H=state.holdout;
  holdoutDespawnWave(state);
  H.phase='idle'; H.wave=0; H.cleared=0; H.gapT=0; H.undefendedT=0;
  holdoutSyncQuest(state);
  holdoutToast(state, msg);
}

// Optional one-shot reveal cutscene the first time the player reaches the anchor (before wave 0).
// SOLO only — it blocks the mission sim (main.js gates update() while G.flashCutscene && !G.hub), which
// co-op can't afford; clients/host keep the existing toast framing. Returns true if it armed a cutscene
// (caller then returns and stays in `idle`; the next tick, after the cutscene ends, spawns wave 0). Needs
// at least one named speaker alive to anchor the camera, else returns false and the hold proceeds normally.
function holdoutTryCutscene(state){
  const hd=state.cfg.holdout||{}, name=hd.framing&&hd.framing.cutscene;
  if(!name) return false;
  if(typeof netRole!=='undefined' && netRole!=='solo') return false;
  if(typeof window!=='undefined' && window._rbReplaying) return false;
  if(typeof startFlashCutscene!=='function') return false;
  const lines=(typeof window!=='undefined' && window[name]) || null;
  if(!lines || !lines.length) return false;
  let focus=null;
  for(const ln of lines){
    if(!ln.speaker) continue;
    const e=state.entities.find(x=>x.heroId===ln.speaker && !x.dead && !x.storedIn);
    if(e){ focus=e; break; }
  }
  if(!focus) return false;
  startFlashCutscene(state, focus, lines);
  // narrative gate (story-polish §6): the Ep XI altar reveal has now played → Biba may speak post-altar
  if(name==='EP11_ALTAR_LINES' && typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.storyFlags) CAMPAIGN.storyFlags.altarSeen=true;
  return true;
}

// main per-tick driver — call from update() (host/solo). Guarded for hub / over / extraction.
function holdoutTick(state, dt){
  const cfg=state.cfg; if(!cfg || !cfg.holdout || !(cfg.holdout.waves||[]).length) return;
  if(state.hub || state.over || state.extractReady) return;
  const hd=cfg.holdout, total=hd.waves.length;
  const H=state.holdout || (state.holdout={ phase:'idle', wave:0, cleared:0, waveIds:[], bossId:null, gapT:0, undefendedT:0 });
  holdoutSyncQuest(state);
  if(H.phase==='done') return;

  const reqMet=holdoutRequiresMet(state);
  if(reqMet && !H._reqToast){ H._reqToast=1; holdoutToast(state, hd.framing&&hd.framing.armPrompt
    ? hd.framing.armPrompt : '📡 Bring a unit to the objective to begin.'); }

  if(H.phase==='idle'){
    if(reqMet && holdoutReached(state)){
      // first arrival: play the reveal cutscene before wave 0 (solo only). It freezes the sim, so this
      // tick just arms it and returns; the NEXT tick (cutscene ended) falls through to spawn wave 0.
      if(!H._cutscenePlayed && holdoutTryCutscene(state)){ H._cutscenePlayed=1; return; }
      H.phase='fighting'; H.wave=0; H.cleared=0; H.undefendedT=0;
      holdoutSpawnWave(state, hd.waves[0]);
      holdoutToast(state, hd.framing&&hd.framing.startToast ? hd.framing.startToast
        : '📡 The hold begins — defend the position.');
      if(hd.waves[0] && hd.waves[0].boss) holdoutBossToast(state, hd.waves[0]);
    }
    return;
  }
  if(H.phase==='fighting'){
    if(holdoutUndefendedAbort(state, dt)){
      holdoutAbort(state, hd.framing&&hd.framing.abortToast ? hd.framing.abortToast
        : '⚠ Position lost — the hold resets. Re-secure it.');
      return;
    }
    if(!holdoutWaveAlive(state)){
      H.cleared++;
      holdoutSyncQuest(state);
      if(H.cleared>=total){ H.phase='done'; H.waveIds=[]; H.bossId=null; return; }
      const label=(hd.framing&&hd.framing.label)||'TRANSFER';
      holdoutToast(state, '📡 '+label+' '+Math.round(H.cleared/total*100)+'% — next intrusion inbound.');
      H.phase='gap'; H.gapT=(hd.gapSec!=null?hd.gapSec:3);
    }
    return;
  }
  if(H.phase==='gap'){
    if(holdoutUndefendedAbort(state, dt)){
      holdoutAbort(state, hd.framing&&hd.framing.abortToast ? hd.framing.abortToast
        : '⚠ Position lost — the hold resets. Re-secure it.');
      return;
    }
    H.gapT-=dt;
    if(H.gapT<=0){
      H.wave=H.cleared;
      holdoutSpawnWave(state, hd.waves[H.wave]);
      if(hd.waves[H.wave] && hd.waves[H.wave].boss) holdoutBossToast(state, hd.waves[H.wave]);
      H.phase='fighting';
    }
    return;
  }
}
function holdoutBossToast(state, waveDef){
  const id=waveDef.boss&&waveDef.boss.id;
  const def=(typeof VILLAINS!=='undefined'&&id)?VILLAINS[id]:null;
  holdoutToast(state, '⚔ '+((def&&def.name)||'A boss')+' moves to defend the objective.');
}
