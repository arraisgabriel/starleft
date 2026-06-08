/* villains.js — the VILLAINS (BIG BOSSES) runtime.

   A villain is a named, oversized ENEMY unit that owns its own arena map, gates the campaign
   between episodes, and fights with hero-style abilities + HP-based phases. It is a normal
   `kind:'unit'` entity (so it reuses all of updateUnit combat/movement, separation, snapshot
   packing and save serialization) carrying a few boss flags:

     u.villain      true — marks it as a boss (render glow, win condition, AI exclusion)
     u.villainId    key into VILLAINS (stats, colors, abilities, taunts) — present on every client
     u.villainName  display name (boss HP bar / taunts)
     u.bossPhase    1, bumps to 2 at a low-HP threshold (Rex's themed "Madosis")
     u.bossScale    drawn-size multiplier vs a normal sprite (render: unitDrawH)
     u.neonId       glow-map key (VILLAIN_NEON_MAPS, authored later; aura works without it)
     u.bossDmgMul   outgoing-damage multiplier (read at the fire site in units.js)
     u._bossCd      per-instance attack cooldown (read at the fire site in units.js)
     u._fleeing     ninja is sprinting for a map edge to ESCAPE
     u.escaped      reached the edge and left the map (despawned; counts as a "fled" win)
     u.madFlavor    pure visual flag — Rex's phase-2 "Madosis" red-glow shift (NOT real Madosis)

   The real Madosis system (madosis.js) is gated owner==='player' and is never touched here; Rex's
   phase 2 only borrows the THEME. All balance lives in VILLAINS (one file, like MADOSIS/KENNEL).

   Depends on globals: DEF/TILE (config.js), mkUnit (map.js), nearestEnemy/issueMove/applyHit/dist/
   findPath (units.js), spawnRing (render.js), pushDialog (dialogs.js), MAPS/CAMPAIGN (config/hub),
   netRole (state.js). Loaded after units.js so its runtime calls resolve. | STARLEFT */

/* DURABILITY KNOBS (per villain): bosses must stay a real fight across wildly different army sizes.
   - hp          : floor effective HP before scaling (a boss, not a trooper — keep it high)
   - dmgReduce   : flat % of incoming damage shrugged off (damage(), units.js). 0.35 ≈ +54% effective HP
   - hpVpiScale  : extra HP per point of player career power (VPI, balance.js) measured at spawn, so a
                   leveled veteran army faces a proportionately tougher boss. hp *= (1 + vpi*hpVpiScale)
   - dmgVpiScale : same idea for the boss's outgoing damage (gentler)
   Effective HP ≈ hp * (1 + vpi*hpVpiScale) / (1 - dmgReduce). Tune HERE — one file. */
const VILLAINS = {
  cyan_ninja: {
    name:'THE CYAN NINJA',
    base:'soldier',            // Growth Cyborg sprite (melee range fits a ninja); stats overridden below
    spriteType:'soldier',      // visual sheet (a bespoke cyan recolor can replace this later)
    neonId:'cyanNinja', neonColor:'#50e6ff', auraColor:[80,230,255], bossScale:2.2,
    hp:7000, dmg:50, range:1.8, cd:0.42, speed:4.6, sight:11,
    dmgReduce:0.35, hpVpiScale:1/60, dmgVpiScale:1/140,   // ≈ 10.8k effective HP at VPI 0, far more vs a veteran army
    abilities:[ {k:'blink', cd:4, range:7} ],
    fleeHpFrac:0.20, fleeSpeedMul:1.7,
    phases:[ {at:0.50, dmgMul:1.35, cdMul:0.7, speedMul:1.15, tint:[120,235,255]} ],   // cyan enrage at half HP (faster, hits harder)
    taunts:{
      intro:['You burn fast. I burn faster.', 'A duel, then. Try to keep up.'],
      phase:['Quaint. Now I stop holding back.', 'Faster. Always faster.'],
      flee:['Enough. You are not worth the blade.', 'This round goes to you. Not the war.'],
      escaped:['Gone. Like funding in a downturn.'],
      death:['A clean… exit.'],
    },
  },
  rex: {
    name:'REX',
    base:'founder', ao:true,   // founder mech sprite + the existing A&O _ao green recolor (set map enemyFaction:'ao')
    neonId:'rex', neonColor:'#7bff5b', auraColor:[120,255,90], bossScale:4.0,
    hp:18000, dmg:80, range:4.0, cd:1.3, speed:1.5, sight:10,
    dmgReduce:0.28, hpVpiScale:1/80, dmgVpiScale:1/160,   // ≈ 25k effective HP at VPI 0 — the finale superboss
    abilities:[ {k:'slam', cd:9, range:3, splash:70, splashR:2.6} ],
    phases:[ {at:0.40, dmgMul:1.8, cdMul:0.6, speedMul:1.25, madFlavor:true, tint:[255,70,60]} ],
    flee:false,
    taunts:{
      intro:['LIQUIDATION PROTOCOL ENGAGED.', 'You are an expense. I am the write-off.'],
      phase:['SYSTEMS CRITICAL. OVERCLOCKING.', 'NOW you have my full attention.'],
      death:['Acquisition… reversed.'],
    },
  },
};

/* ---- spawn (called from newMap, after the enemy bases/guards/captives exist) ---- */
function spawnVillain(state){
  const cfg=state.cfg; if(!cfg || !cfg.villain) return;
  const list = Array.isArray(cfg.villain) ? cfg.villain : [cfg.villain];
  for(const v of list){
    const def = VILLAINS[v.id]; if(!def || typeof mkUnit!=='function') continue;
    const u = mkUnit(state, def.base, 'enemy', v.x, v.y);     // pushed to state.entities; seeds DEF stats
    u.villain=true; u.villainId=v.id; u.villainName=def.name; u.guard=true;   // guard → excluded from waves/prod cap (ai.js)
    u.bossPhase=1; u.bossScale=def.bossScale; u.neonId=def.neonId;
    if(def.spriteType) u.spriteType=def.spriteType;           // render uses spriteType over type
    // scale HP/dmg to the player's carried career power (VPI, computed in newMap before this) so a
    // leveled veteran army faces a proportionately tougher boss — never trivial, never an instant melt.
    const vpi = state._vpi || 0;
    u.maxHp = u.hp = Math.round(def.hp * (1 + vpi*(def.hpVpiScale||0)));
    u.dmg   = Math.round(def.dmg * (1 + vpi*(def.dmgVpiScale||0)));
    if(def.dmgReduce>0) u.dmgReduce = def.dmgReduce;          // flat incoming-damage mitigation (damage(), units.js)
    u.range=def.range; u.speed=def.speed; u.sight=def.sight;
    u._bossCd=def.cd; u.cd=0; u.bossDmgMul=1;
    u.r = Math.round((DEF[def.base].r||12) * def.bossScale * 0.6);   // collision grows sub-linearly (pathing stays sane)
    u._abilCd={};                                            // {blink:0, slam:0}
    state._villainSpawned=true;
    if(!window._rbReplaying) bossTaunt(state, u, 'intro');
  }
}

/* ---- per-frame driver (called from the core.js unit loop; authoritative path only) ---- */
function updateVillain(state, u, dt){
  if(state.hub || u.dead || !u.villain) return;
  const def = VILLAINS[u.villainId]; if(!def) return;

  // (a) phase transitions — Rex's themed "Madosis" enrage
  if(def.phases) for(const ph of def.phases){
    if(u.bossPhase<2 && u.hp <= u.maxHp*ph.at){
      u.bossPhase=2;
      if(ph.dmgMul) u.bossDmgMul=ph.dmgMul;
      if(ph.cdMul)  u._bossCd=def.cd*ph.cdMul;
      if(ph.speedMul) u.speed=def.speed*ph.speedMul;
      if(ph.madFlavor) u.madFlavor=true;
      u._abilCastT=state.time;                               // glow peak on the transition
      if(!window._rbReplaying) bossTaunt(state, u, 'phase');
    }
  }

  // (b) ninja flee — sprint for the nearest map edge and ESCAPE
  if(def.fleeHpFrac && !u.escaped){
    if(!u._fleeing && u.hp <= u.maxHp*def.fleeHpFrac){
      u._fleeing=true; u.speed=def.speed*(def.fleeSpeedMul||1.6);
      if(!window._rbReplaying) bossTaunt(state, u, 'flee');
    }
    if(u._fleeing){
      u.autoTarget=null; u.cmd=null; u.guard=true;            // drop combat each tick so updateUnit can't re-engage
      const W=state.W, H=state.H;
      if(u.x<TILE*1.5 || u.y<TILE*1.5 || u.x>(W-1.5)*TILE || u.y>(H-1.5)*TILE){
        u.escaped=true; u.dead=true; state._villainEscaped=true;   // despawn (core.js cleanup removes it)
        if(!window._rbReplaying) bossTaunt(state, u, 'escaped');
        return;
      }
      if(!u._fleeDest || (typeof dist==='function' && dist(u,u._fleeDest)<TILE)){
        const edge=nearestMapEdge(state,u); u._fleeDest=edge;
        if(typeof issueMove==='function') issueMove(state, u, edge.x, edge.y, {type:'amove', x:edge.x, y:edge.y});
      }
      return;                                                 // flee overrides abilities/combat
    }
  }

  // (c) abilities — cooldown-gated, reusing the normal combat helpers
  const tgt = u.autoTarget || (u.cmd && u.cmd.target);
  if(!tgt || tgt.dead) return;
  for(const a of (def.abilities||[])){
    u._abilCd[a.k] = (u._abilCd[a.k]||0) - dt;
    if(u._abilCd[a.k] > 0) continue;
    const d = (typeof dist==='function') ? dist(u,tgt) : 1e9;
    if(a.k==='blink'){
      if(d <= a.range*TILE && d > u.range*TILE){              // close a gap that's within blink reach
        const dx=tgt.x-u.x, dy=tgt.y-u.y, dd=Math.hypot(dx,dy)||1;
        const bx=tgt.x-(dx/dd)*(u.range*TILE*0.8), by=tgt.y-(dy/dd)*(u.range*TILE*0.8);
        const tx=(bx/TILE)|0, ty=(by/TILE)|0;
        if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx])){
          u.x=bx; u.y=by; u.path=null; u.pathIdx=0;
          if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,def.neonColor||'#3fffff');
          u._abilCastT=state.time; u._abilCd[a.k]=a.cd;
        }
      }
    } else if(a.k==='slam'){
      if(d <= a.range*TILE){
        const dmg=Math.round(u.dmg*(u.bossDmgMul||1));
        if(typeof applyHit==='function') applyHit(state, u, tgt, dmg, a.splash, a.splashR);
        if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,def.neonColor||'#ff5a3c');
        u._actStamp=state.time; u._abilCastT=state.time; u._abilCd[a.k]=a.cd;
      }
    }
  }
}

/* ---- taunt: a boss speech bubble (cosmetic; skipped during rollback re-sim) ---- */
function bossTaunt(state, u, key){
  if(typeof pushDialog!=='function') return;
  const def=VILLAINS[u.villainId], pool=def && def.taunts && def.taunts[key];
  if(!pool || !pool.length) return;
  const line = pool[(u._tauntN=(u._tauntN||0)+1) % pool.length];   // cycle deterministically (no RNG)
  pushDialog(u, line, {type:'lore', tone:'neg', ttl:5});
}

/* ---- nearest passable border tile (where a fleeing ninja exits) ---- */
function nearestMapEdge(state, u){
  const W=state.W, H=state.H, B=state.blocked;
  const tx=Math.floor(u.x/TILE), ty=Math.floor(u.y/TILE);
  const dL=tx, dR=W-1-tx, dT=ty, dB=H-1-ty, m=Math.min(dL,dR,dT,dB);
  let ex=tx, ey=ty, vertical=false;
  if(m===dL){ ex=1; vertical=true; } else if(m===dR){ ex=W-2; vertical=true; }
  else if(m===dT){ ey=1; } else { ey=H-2; }
  for(let r=0;r<=14;r++){                                     // walk along the edge for a passable cell
    for(const d of (r===0?[0]:[ -r, r ])){
      const cx = vertical ? ex : ex+d, cy = vertical ? ey+d : ey;
      if(cx<1||cy<1||cx>=W-1||cy>=H-1) continue;
      if(B && B[cy*W+cx]) continue;
      return { x:cx*TILE+TILE/2, y:cy*TILE+TILE/2 };
    }
  }
  return { x:ex*TILE+TILE/2, y:ey*TILE+TILE/2 };
}

/* =====================================================================
   WIN / LOSE — a boss map's outcome is decided by the named villain's fate, taking precedence
   over the normal "no enemy buildings = win" rule (a boss arena may have NO enemy buildings).
   Called from checkWinLose (core.js); returns true to short-circuit the normal flow.
   ===================================================================== */
function villainCheckWinLose(state){
  if(!state._villainSpawned) return true;                     // not spawned yet → never auto-win
  const aliveBoss = state.entities.some(e=>e.villain && !e.dead && !e.escaped);
  if(!aliveBoss){
    if(state._villainEscaped) bossOutcome(state, 'fled');     // ninja slipped the net — partial win, still gates
    else bossOutcome(state, 'win');                           // boss(es) killed
    return true;
  }
  bossDefeatChecks(state);                                    // the player can still LOSE while the boss lives
  return true;                                                // ALWAYS short-circuit (no enemy-building win on a boss map)
}

// mirror checkWinLose's win flow (solo extraction / host hub / else over+onVictory). 'fled' is a
// win with a cosmetic _fledBoss flag so the end screen reads "it got away" while still advancing.
function bossOutcome(state, kind){
  if(kind==='fled'){ state._fledBoss=true; if(typeof toast==='function' && !window._rbReplaying) toast('🌫️ The boss slipped away — but the field is yours.'); }
  if(netRole==='solo' && typeof beginExtractionPhase==='function'){ beginExtractionPhase(state); return; }
  if(netRole==='host' && typeof window!=='undefined' && window.MP_SESSION && MP_SESSION.mode==='campaign' && typeof enterHubFromCombat==='function'){ enterHubFromCombat(state); return; }
  state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory();
}

// player-loss conditions only — the boss-map analogue of checkWinLose's lose checks, with NO
// enemy-building win (the boss living is what keeps the map going).
function bossDefeatChecks(state){
  const playerHq = state.entities.some(e=>e.owner==='player'&&e.type==='hq'&&!e.dead);
  const canRecoverHq = state.entities.some(e=>e.owner==='player'&&e.type==='worker'&&!e.dead&&!e.storedIn);
  const playerHas = state.entities.some(e=>e.owner==='player'&&!e.dead&&(e.kind==='building'||e.kind==='unit'));
  if((!playerHq && !canRecoverHq) || !playerHas){
    state.over=true; state._outcome='lose'; if(!window.USE_ROLLBACK && typeof onDefeat==='function') onDefeat();
  }
}

/* =====================================================================
   CAMPAIGN GATING — villain maps are APPENDED to MAPS (indices ≥13) so existing episode indices
   never shift. A villain with gateAfter===idx interrupts the linear sequence the first time the
   player finishes episode `idx`; finishing the villain map routes to its `returnTo`. Cleared
   villains (CAMPAIGN.villainCleared) are not re-gated on replays.
   ===================================================================== */
function villainIsCleared(i){ return !!(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.villainCleared && CAMPAIGN.villainCleared[i]); }
function markVillainCleared(i){ if(typeof CAMPAIGN!=='undefined' && CAMPAIGN){ CAMPAIGN.villainCleared = CAMPAIGN.villainCleared || {}; CAMPAIGN.villainCleared[i]=1; } }

// the highest non-villain index — villain maps are APPENDED past the linear campaign, so the
// linear "last episode" is the last entry that isn't a villain.
function lastEpisodeIndex(){ let k=MAPS.length-1; while(k>0 && MAPS[k] && MAPS[k].isVillain) k--; return k; }

// The LINEAR next index after finishing `finishedIdx`. Critically this NEVER returns a villain
// index (villains are reached via the dispatch gate below), so CAMPAIGN.nextMapIndex stays on the
// 0..lastEpisode track — keeping every existing index-keyed system (rebornUnlockIdx, the MAPS[7]
// Nino reintro, Madosis episode numbers) correct. Finishing a villain map resumes at its returnTo
// and marks it cleared.
function villainNextLinear(finishedIdx){
  if(typeof MAPS==='undefined') return finishedIdx+1;
  const m=MAPS[finishedIdx];
  if(m && m.isVillain){ markVillainCleared(finishedIdx); return Math.max(0, Math.min(m.returnTo!=null?m.returnTo:finishedIdx, MAPS.length-1)); }
  let n=finishedIdx+1; while(MAPS[n] && MAPS[n].isVillain) n++;   // skip appended villain entries
  return Math.min(n, lastEpisodeIndex());
}

// At dispatch: if an UNCLEARED villain is gated to be played right before episode `nextIdx`
// (returnTo===nextIdx), return its index so the player fights it first; else -1. This is how the
// villain interrupts the linear sequence without ever sitting in CAMPAIGN.nextMapIndex.
function villainGateBefore(nextIdx){
  if(typeof MAPS==='undefined') return -1;
  for(let i=0;i<MAPS.length;i++){ const v=MAPS[i]; if(v && v.isVillain && v.returnTo===nextIdx && !villainIsCleared(i)) return i; }
  return -1;
}

/* expose for core.js / hub.js / ui.js / map.js (classic-script shared scope) and the console. */
if(typeof window!=='undefined'){
  window.VILLAINS=VILLAINS; window.spawnVillain=spawnVillain; window.updateVillain=updateVillain;
  window.bossTaunt=bossTaunt; window.nearestMapEdge=nearestMapEdge;
  window.villainCheckWinLose=villainCheckWinLose; window.bossOutcome=bossOutcome; window.bossDefeatChecks=bossDefeatChecks;
  window.villainIsCleared=villainIsCleared; window.markVillainCleared=markVillainCleared;
  window.villainNextLinear=villainNextLinear; window.villainGateBefore=villainGateBefore; window.lastEpisodeIndex=lastEpisodeIndex;
}
