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
    name:'THE SEVERANCIER',    // display name (internal id stays cyan_ninja — save/achievement/sprite keys)
    base:'soldier',            // Growth Cyborg sprite (melee range fits a ninja); stats overridden below
    spriteType:'ninja',        // bespoke cyborg-ninja sprite (assets/units/ninja); gameplay still soldier via base
    spriteFaction:'player',    // render the CYAN player variant (not enemy-red) so the body's own cyan lights match the glow
    neonId:'ninja', neonColor:'#50e6ff', auraColor:[80,230,255], bossScale:2.1,   // own neon map; ao_enforcer keeps 'cyanNinja'
    hp:7000, dmg:8, range:1.8, cd:0.42, speed:4.6, sight:11, killXp:180,    // dmg LOW: he strikes in fast flurries (combo), so each cut is weak — a leveled tank must survive a long duel
    dmgReduce:0.35, hpVpiScale:1/60, dmgVpiScale:1/240,   // ≈ 10.8k effective HP at VPI 0; gentler dmg scaling so a veteran (high-VPI) roster isn't melted
    aiKind:'ninja',            // bespoke hit-and-run AI (updateNinja) fully owns movement+combat; updateUnit yields for it
    ninja:{
      dashSpeed:15,            // tiles/sec while gliding a dash hop (fast — reads as a blade streak)
      hopLen:2.3,              // tiles per diagonal hop
      hopGap:0.38,             // pause between hops (was 0.7). Tighter → faster re-approach AND faster evade, so he
                               // re-engages much sooner; the 0.30s rooted strike windup is still the clickable punish window.
      lungeRange:2.6,          // tiles — commit to a strike from here; the apex flash-lunges to contact (beats the separation jostle)
      strikeWindup:0.30,       // ROOTED, EXPOSED wind-up before the FIRST strike (the player's punish window; was 0.40)
      combo:5,                 // strikes CHAINED per engagement (a blade flurry) before he retreats — the main "attack often" lever
      comboWindup:0.13,        // snappy wind-up for the 2nd+ combo strikes (the 1st keeps the full telegraphed window)
      exposeMul:0.4,           // during the wind-up the ninja's dmgReduce is scaled by this (0.35→0.14 → ~+32% incoming)
      evadeHops:1,             // weave hops away before vanishing (was 3) → far less time spent retreating between strikes
      safeDist:3.5,            // tiles — retreat only this far (was 6) so the re-approach back into lunge range is short
      shooterR:5.5,            // tiles — units within this count as "shooting at me" (evade centroid)
      hideDur:0.4,             // smoke-bomb vanish duration (was 1.5) → re-emerges fast; keeps the ninja flavor, kills the downtime
      hideAlpha:0.16,          // sprite opacity while vanished (render)
      panicRange:1.6,          // tiles — a shooter this close mid-evade triggers an emergency blink
      panicBlink:5,            // tiles — emergency teleport distance
      retargetR:13,            // tiles — target search radius
      escapeAfter:10,          // seconds pinned (unable to vanish into HIDE) before a forced break-out
      escapeDist:11,           // tiles — how far the break-out dash travels (THROUGH the units to open ground)
      escapeSpeed:34,          // tiles/sec for the break-out dash (very fast → slips between the units as a smoke streak)
    },
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
  // A&O black+green recolor of THE SEVERANCIER's sprite — a MINI-boss for the Episode XI "Seize the GRAAL"
  // holdout (waves.js spawns it on the final wave). Same hit-and-run AI/abilities as cyan_ninja but
  // half the HP and the 'ao' sprite set (black body + toxic-green neon — needs ninja/walk_ao+attack_ao).
  ao_ninja: {
    name:'THE A&O NINJA',
    base:'soldier', spriteType:'ninja', spriteFaction:'ao',    // force the black+green _ao sheet (aoSide / _vdef.spriteFaction, render.js)
    neonId:'ninja_ao', neonColor:'#4aee60', auraColor:[74,238,96], bossScale:1.9,   // A&O toxic-green aura (works without a neon map)
    hp:3600, dmg:8, range:1.8, cd:0.42, speed:4.6, sight:11, killXp:300,    // mini-boss: ~half the cyan ninja's 7000
    dmgReduce:0.30, hpVpiScale:1/90, dmgVpiScale:1/240,         // gentler HP scaling than the full duel ninja
    aiKind:'ninja',
    ninja:{
      dashSpeed:15, hopLen:2.3, hopGap:0.38, lungeRange:2.6, strikeWindup:0.30,
      combo:5, comboWindup:0.13, exposeMul:0.4, evadeHops:1, safeDist:3.5, shooterR:5.5,
      hideDur:0.4, hideAlpha:0.16, panicRange:1.6, panicBlink:5, retargetR:13,
      escapeAfter:10, escapeDist:11, escapeSpeed:34,
    },
    fleeHpFrac:0.10, fleeSpeedMul:1.7,                          // rarely flees — it's defending the altar, not dueling (a fled boss still clears the wave)
    phases:[ {at:0.50, dmgMul:1.35, cdMul:0.7, speedMul:1.15, tint:[120,255,150]} ],   // green enrage at half HP
    taunts:{
      intro:['The altar is not yours to take.', 'The GRAAL writes the dying. You will feed it.'],
      phase:['You delay the inevitable.', 'A&O does not lose what it owns.'],
      flee:['The transfer continues without me.', 'You bought seconds, not the war.'],
      escaped:['Filed under acceptable loss.'],
      death:['…re-instantiate… me…'],
    },
  },
  // ---- T2-7 mid-tier "lieutenant" duels — the villain framework scales them to roster power
  // (hpVpiScale) for free; both reuse existing AI kinds (ninja hit-and-run / mech area specials).
  ao_enforcer: {
    name:'THE A&O ENFORCER',
    base:'soldier', spriteType:'soldier',
    neonId:'cyanNinja', neonColor:'#7bff5b', auraColor:[120,255,110], bossScale:1.9,   // A&O toxic-green hunter
    hp:4200, dmg:38, range:1.8, cd:0.5, speed:4.2, sight:11, killXp:240,
    dmgReduce:0.28, hpVpiScale:1/70, dmgVpiScale:1/160,
    aiKind:'ninja',
    ninja:{ dashSpeed:13, hopLen:2.1, hopGap:0.8, lungeRange:2.4, strikeWindup:0.45, exposeMul:0.45,
      evadeHops:3, safeDist:6, shooterR:5.5, hideDur:1.3, hideAlpha:0.18, panicRange:1.6, panicBlink:4,
      retargetR:12, escapeAfter:10, escapeDist:10, escapeSpeed:30 },
    fleeHpFrac:0, fleeSpeedMul:1,                       // a hunter doesn't flee — it dies on the job
    phases:[ {at:0.45, dmgMul:1.3, cdMul:0.75, speedMul:1.1, tint:[150,255,110]} ],
    taunts:{
      intro:['The architect is COMPANY PROPERTY. So are you.', 'Recovery order: one healer, dead or compliant.'],
      phase:['Escalating enforcement.', 'Your warranty just expired.'],
      death:['Asset… unrecovered.'],
    },
  },
  tower_guardian: {
    name:'THE DARK TOWER GUARDIAN',
    base:'founder', ao:true,
    neonId:'rex', neonColor:'#b05bff', auraColor:[176,91,255], bossScale:2.6,   // violet lattice-warden
    hp:9000, dmg:55, range:3.6, cd:1.4, speed:1.05, sight:10, killXp:460,   // speed 1.4→1.05: a slow lattice-warden the player can kite
    dmgReduce:0.25, hpVpiScale:1/75, dmgVpiScale:1/170, hpVpiCap:1.6,
    overheat:{ exposeMul:0.25, dur:5.3, rootDur:4.42, chance:0.7 },   // vents + EXPOSED after its stomp (dur +120% cumulative, 70% chance to trigger)
    abilities:[
      {k:'stomp', cd:11, range:5.5, dmg:48, waveR:3.0, jumpDur:0.65, capFrac:0.45, maxHits:6, overheat:true},
    ],
    phases:[ {at:0.45, dmgMul:1.5, cdMul:0.7, speedMul:1.0, tint:[255,90,200]} ],   // enrage hits harder/faster but NO speed boost (kiting stays viable)
    flee:false,
    taunts:{
      intro:['THE TOWER DOES NOT CHANGE HANDS.', 'Trespass logged. Sentence: immediate.'],
      phase:['STRUCTURAL OVERRIDE. NOTHING LEAVES.', 'The lattice hums for blood.'],
      stomp:['FOUNDATION CHECK.', 'Settling the ground dispute.'],
      death:['The tower… stands… without me.'],
    },
  },
  rex: {
    name:'REX',
    base:'founder', ao:true,   // gameplay stays founder-mech (stats/abilities below); bespoke sprite below
    spriteType:'rex',          // bespoke alien A&O mech sprite (assets/units/rex/*_ao); gameplay still founder via base
    spriteFaction:'ao',        // always render the A&O toxic-green variant (robust even if a map omits enemyFaction:'ao')
    neonId:'rexBoss', neonColor:'#7bff5b', auraColor:[120,255,90], bossScale:4.0,   // own neon map; tower_guardian keeps 'rex'
    hp:18000, dmg:62, range:4.0, cd:1.3, speed:1.0, sight:10, killXp:700,   // finale boss — the biggest payout. speed 1.0 < every player combat unit (Lobbyist 2.2) so ranged units can KITE and escape his barrage. dmg 80→62: a basic no longer one-shots a 70-HP Lobbyist (62×0.90 pierce ≈56), so the squad shrinks per-trade not per-hit (the OVERHEAT window stays the durability lever, not his alpha)
    dmgReduce:0.20, hpVpiScale:1/120, dmgVpiScale:1/160, hpVpiCap:1.6,   // ↓reduce (the OVERHEAT window is now the durability lever) + ↓scale + a HARD cap so a veteran roster faces ≤+160% HP, not a ~5× wall
    overheat:{ exposeMul:0.22, dur:6.19, rootDur:5.08, chance:0.7 },   // after a heavy move (stomp) he VENTS: rooted + EXPOSED (dmgReduce ×0.22) for ~6.2s (dur +120% cumulative); 70% chance to trigger (was always) — the burn window where stacked fire finally pays off
    // two telegraphed AREA specials (updateMech). capFrac caps EACH blast to a % of a unit's maxHp and
    // maxHits caps HOW MANY units one blast fully hits — so a clumped ball loses a few, not all (spread!).
    abilities:[
      {k:'missile', cd:16, range:9,   count:3, dmg:38, splashR:1.9, flight:0.78, spreadTiles:2.2, capFrac:0.34, maxHits:6},   // cd 13→16 (more reposition room) + dmg 46→38 + capFrac .40→.34: the volley chunks ~20% less of a clumped squad, so fewer instant back-rank deaths
      {k:'stomp',   cd:15, range:6.5, dmg:50, waveR:3.4, jumpDur:0.7, capFrac:0.45, maxHits:6, overheat:true},   // cd 13→15 (desync from missile → cleaner spaced EXPOSED windows) + dmg 60→50 (softer melee punish on vets/vehicles; fragile units still capped)
      {k:'summon',  cd:22, comp:[['soldier',3],['ranger',2]], at:'fog', tauntKey:'phase', phaseGate:2},   // P2-unlocked adds: give the army a second job + create ebb/flow burn windows
    ],
    phases:[
      {at:0.60, dmgMul:1.0, cdMul:1.0,  speedMul:1.0, unlocks:['summon'], tint:[120,255,90]},                                   // P2: a NEW mechanic (adds), not bigger numbers
      {at:0.30, dmgMul:1.2, cdMul:0.85, speedMul:1.0, overheatBonus:{durMul:1.3, exposeMul:0.16}, madFlavor:true, tint:[255,70,60]},   // P3: soft-enrage burn — bigger overheat windows, gentle dmg, NO speed boost (kiting stays alive)
    ],
    flee:false,
    taunts:{
      intro:['LIQUIDATION PROTOCOL ENGAGED.', 'You are an expense. I am the write-off.'],
      phase:['SYSTEMS CRITICAL. OVERCLOCKING.', 'NOW you have my full attention.'],
      missile:['Payload itemized.', 'Incoming invoice.'],
      stomp:['DOWNSIZING.', 'Footprint reduction.'],
      death:['Acquisition… reversed.'],
    },
  },
  // Ep XV "THE FOUNDRY RAID" duel boss: A&O's contracted Founder-Mech test pilot. You out-duel him; on
  // the win he defects and joins as the hero "Rust" (recruit hook in bossOutcome). Renders as the A&O
  // founder mech until his bespoke hero sprite lands. Lieutenant-scale (≈ tower_guardian), one stomp.
  rust: {
    name:'PEDRO "RUST"',
    base:'founder', ao:true,
    neonId:'rust', neonColor:'#ff8c3c', auraColor:[255,140,60], bossScale:2.6,   // foundry orange
    hp:9000, dmg:60, range:3.6, cd:1.3, speed:1.05, sight:10, killXp:380,   // speed 1.4→1.05
    dmgReduce:0.24, hpVpiScale:1/78, dmgVpiScale:1/168, hpVpiCap:1.6,
    overheat:{ exposeMul:0.25, dur:5.3, rootDur:4.42, chance:0.7 },   // dur +120% cumulative, 70% chance to trigger
    abilities:[
      {k:'stomp', cd:12, range:6.0, dmg:52, waveR:3.2, jumpDur:0.7, capFrac:0.45, maxHits:6, overheat:true},
    ],
    phases:[ {at:0.45, dmgMul:1.5, cdMul:0.7, speedMul:1.0, tint:[255,140,60]} ],   // no enrage speed boost
    flee:false,
    taunts:{
      intro:['Company property doesn\'t quit. Neither do I.', 'They pay me to lose slow. I\'m good at it.'],
      phase:['Fine. Off the clock now.', 'You want overtime? You\'ve got it.'],
      stomp:['Foreclosure on three.', 'Mind the footprint.'],
      death:['Depreciated asset, huh… we\'ll see.'],
    },
  },
  // THE EX-TERMINATOR — A&O's recurring nemesis machine (Dell Tusk's right hand). FIRST fight (the
  // appended "3.5" interlude after Ep III): a mysterious lone killer. Native dark sprite, NEVER recolored
  // (spriteFaction:'player' forces the base sheet over the enemy-red/_ao paths). base:'soldier' gives a
  // chasing melee chassis; the two AOE specials below are his signature. Egoic, certain — units are a chore.
  ex_terminator: {
    name:'THE EX-TERMINATOR',
    base:'soldier', spriteType:'ex_terminator', spriteFaction:'player',   // render the native sheet — never recolored
    neonId:null, neonColor:'#3cff7a', auraColor:[50,210,110], bossScale:2.0, cyborgRim:true,   // GREEN cyborg rim + aura (render-only FX overlay; body sprite stays native/untouched)
    fleeExtract:true,                                        // DEFEATED → airlifted out by an A&O bomber (escape cinematic), not killed — "I'll be back"
    // FIRST fight = a SKILL CHECK, never a hard gate. A 12-Lobbyist (range 7.5) + 5-Recruiter team that
    // KITES + heals must endure: lighter HP, thin armor, lower damage, and — crucially — speed BELOW the
    // boss's old sprint so the snipers can actually keep their distance (was 3.4 > lobbyist 2.2). The Ep XVI
    // mk2 stays tough; only this opening encounter is softened.
    hp:5200, dmg:17, range:1.9, cd:1.0, speed:2, sight:12, killXp:120,   // movement/cadence UNCHANGED per owner — speed 2 < Lobbyist 2.2 → the snipers can fully kite him
    dmgReduce:0.12, hpVpiScale:1/130, dmgVpiScale:1/210, hpVpiCap:1.2,   // ↓reduce + ↓scale + cap; the OVERHEAT window is the durability lever now
    splashFrac:0.5, splashR:1.9,                             // his BASIC swing still splashes, but softer (~50%)
    overheat:{ exposeMul:0.30, dur:5.3, rootDur:4.42, chance:0.7 },       // after the big pistol burst he VENTS: rooted + EXPOSED — the punish window (dur +120% cumulative, 70% chance to trigger)
    // windup/recover are LONG on purpose: the render plays the 10-frame attack strip across the whole
    // (windup+recover) window, so ~1.3-1.5s per move = a readable ~7fps telegraph, not a 0.8s blur.
    abilities:[
      { k:'melee_aoe',  cd:6.0, range:2.3, dmg:26, splashR:2.5, capFrac:0.20, windup:0.45, recover:0.85, maxHits:5 },   // ~1.3s — nearby units all take a (capped) hit
      { k:'pistol_aoe', cd:8.0, range:8,   dmg:22, splashR:1.9, capFrac:0.18, windup:1.0,  recover:0.90, maxHits:5, overheat:true },   // longer telegraph (windup 0.55→1.0, NOT more frequent — cd stays 8); vents after firing
    ],
    phases:[ {at:0.45, dmgMul:1.28, cdMul:0.8, speedMul:1.10, tint:[90,255,140]} ],   // a gentler enrage, later — stays GREEN (brighter), never red
    flee:false,
    taunts:{
      intro:['You won\'t live long enough to misremember my name.', 'Your army is the part of the day where it stops mattering.'],
      phase:['Recalculating. Conclusion unchanged.', 'Now I stop being polite about it.'],
      melee:['Stand closer. It\'s faster for both of us.', 'Hands are cheaper than ammunition.'],
      pistol:['One each. I itemize.', 'Hold still — you\'re ruining my average.'],
      death:['You bought a quarter. I\'ll be back.'],
    },
  },
  // SECOND fight (the climax of Ep XVI, deferred after the A&O bases fall): same machine, BIGGER frame
  // (bossScale 3.2) and a bigger kit — adds the minigun rake that hits FLYERS too (antiAir on the basic
  // shot as well). Now revealed as Tusk's enforcer. Reuses the same native sprite set; only scale differs.
  ex_terminator_mk2: {
    name:'THE EX-TERMINATOR',
    base:'soldier', spriteType:'ex_terminator', spriteFaction:'player',
    neonId:null, neonColor:'#3cff7a', auraColor:[50,210,110], bossScale:1.76, cyborgRim:true,   // GREEN cyborg rim + aura; sized to MATCH hero Rust per owner (ex_terminator sprite 60 ×1.76 = 105.6 ≈ rust 92 ×1.15 = 105.8). Collision r + rim/glow are vh-relative → all shrink together.
    fleeExtract:true,                                        // also escapes by A&O bomber (drop this line to make the XVI climax a definitive kill)
    hp:16000, dmg:48, range:2.0, cd:0.65, speed:3.2, sight:12, killXp:560,   // movement/cadence UNCHANGED per owner (speed + ability cooldowns untouched)
    dmgReduce:0.22, hpVpiScale:1/110, dmgVpiScale:1/165, hpVpiCap:1.6,   // ↓reduce + ↓scale + cap (the OVERHEAT window covers durability)
    splashFrac:0.7, splashR:2.2,                            // basic swing is area damage too (bigger radius than fight 1)
    overheat:{ exposeMul:0.22, dur:5.75, rootDur:4.64, chance:0.7 },      // vents + EXPOSED after the heavy minigun rake (dur +120% cumulative, 70% chance to trigger)
    // minigun FIRST: the ability dispatch fires the first ready+in-range ability and breaks, so the
    // rarest/biggest move must lead or the short-cooldown melee/pistol would starve it. Result: a big
    // minigun rake roughly every 12s, with melee (adjacent) / pistol (mid-range) filling the gaps.
    abilities:[
      { k:'minigun_aoe', cd:12,  range:9.5, dmg:30, splashR:3.0, capFrac:0.34, windup:1.6,  recover:1.10, sweep:3, maxHits:8, overheat:true },   // longer telegraph (windup 0.8→1.6, cd still 12) → readable + dodgeable; vents after; HITS FLYERS
      { k:'melee_aoe',   cd:4.5, range:2.6, dmg:48, splashR:2.8, capFrac:0.32, windup:0.45, recover:0.85, maxHits:6 },            // ~1.3s
      { k:'pistol_aoe',  cd:6.5, range:8.5, dmg:40, splashR:2.0, capFrac:0.28, windup:0.55, recover:0.90, maxHits:5 },            // ~1.45s
    ],
    phases:[ {at:0.50, dmgMul:1.55, cdMul:0.65, speedMul:1.2, tint:[90,255,140]} ],   // enrage stays GREEN, never red (speed untouched per owner)
    flee:false,
    taunts:{
      intro:['Postponed, not pardoned. Same machine — more of it.', 'Mr. Tusk sends his compliments. I send the rest.'],
      phase:['Escalation authorized. Enjoy.', 'You\'ve cost me forty seconds. A new record.'],
      melee:['Closer. I do my best work in your personal space.', 'Sit down.'],
      pistol:['Three rounds, three obituaries.', 'I never reload in vain.'],
      minigun:['Open the sky. Nothing up there is exempt.', 'EVERYTHING in range. Itemized.'],
      death:['Scrap the chassis — the next one\'s already warm. I\'ll be back.'],
    },
  },
};

/* ---- spawn (called from newMap, after the enemy bases/guards/captives exist) ---- */
function spawnVillain(state){
  const cfg=state.cfg; if(!cfg || !cfg.villain) return;
  const list = Array.isArray(cfg.villain) ? cfg.villain : [cfg.villain];
  for(const v of list){ if(v.after) continue; spawnVillainEntry(state, v); }   // `after` → DEFERRED (villainDeferredSpawn waits for that quest); immediate ones spawn now
}

/* ---- DEFERRED spawn (called every authoritative tick from core.js update) ---- the boss appears
   mid-mission once its `after` quest completes (e.g. THE SEVERANCIER surfaces on Episode VII the moment
   all eight campuses are razed), at a chosen mid-map tile snapped to open ground, with the arena fog
   revealed and a toast so the player can find him. _villainSpawned auto-persists (not in save.js SKIP),
   so a reload never double-spawns. Mirrors the holdoutRequiresMet quest-gate pattern (waves.js). */
function villainDeferredSpawn(state){
  const cfg=state.cfg; if(!cfg || !cfg.villain || state._villainSpawned) return;
  const list = Array.isArray(cfg.villain) ? cfg.villain : [cfg.villain];
  for(const v of list){
    if(!v.after) continue;                                              // immediate villains handled by spawnVillain() at load
    const q = state.quests && state.quests[v.after];
    if(!(q && q.done)) continue;                                        // the gating quest isn't complete yet
    const at = villainSnapOpen(state, v.x|0, v.y|0);                    // deterministic nearest passable tile
    spawnVillainEntry(state, { id:v.id, x:at.x, y:at.y });             // sets state._villainSpawned=true
    // light the arena ~8s so the player SEES where he surfaced (computeFog honors _bossReveal; explored
    // persists after the window, so the minimap keeps the spot). Local fog only — safe outside the FX guard.
    state._bossReveal={ x:at.x, y:at.y, r:9, until:(state.time||0)+8 };
    if(!window._rbReplaying){                                           // cosmetics only on the live path (skipped in rollback re-sim)
      if(typeof computeFog==='function') computeFog(state);             // apply the reveal this tick
      if(typeof viewW==='function' && typeof viewH==='function'){       // one-time camera focus so the arrival is seen (mirrors hubFocusUltra)
        const z=state.zoom||1, cx=at.x*TILE+TILE/2, cy=at.y*TILE+TILE/2;
        state.camX=cx-(viewW()/z)/2; state.camY=cy-(viewH()/z)/2;
        if(typeof clampCam==='function') clampCam(state);
      }
      const def=VILLAINS[v.id];
      if(typeof toast==='function') toast('🥷 '+((def&&def.name)||'A contractor')+' has surfaced — find and finish him.');
      // (the arrival cutscene is NOT fired here — cfg.villainCutscene plays via mapCutsceneTick once a player
      //  unit gets near the now-surfaced boss, so it only triggers when the player can actually see him.)
    }
    break;                                                             // one deferred villain per map
  }
}

// deterministic nearest OPEN-GROUND tile to (tx,ty) — a ring search modelled on ninjaUnstick (no RNG,
// so host/client/rollback agree). Prefers a roomy tile, then any passable tile, else the map interior.
function villainSnapOpen(state, tx, ty){
  const W=state.W, H=state.H, B=state.blocked;
  const open =(x,y)=> x>=1&&y>=1&&x<W-1&&y<H-1 && !(B && B[y*W+x]);
  const roomy=(x,y)=> open(x,y) && open(x-1,y)&&open(x+1,y)&&open(x,y-1)&&open(x,y+1);
  for(const test of [roomy, open]){
    let best=null, bd=1e9;
    for(let r=0;r<=24 && !best;r++){
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
        if(r>0 && Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;   // current ring only
        const x=tx+dx, y=ty+dy; if(!test(x,y)) continue;
        const d=dx*dx+dy*dy; if(d<bd){ bd=d; best={x,y}; }
      }
    }
    if(best) return best;
  }
  return { x:W>>1, y:H>>1 };                                           // last resort → map interior
}

/* =====================================================================
   EX-TERMINATOR HUNTER (Ep XVI escape pursuer) — opt-in via the event `villain:{hunter:true}`.
   Instead of a kill-to-the-bar boss, it appears NEAR the heroes, chases them like a hunter, and is
   driven off when they bank a HIDDEN pool of damage (scaled by hero level), then RETURNS later. It is
   never killed here (the Ep XVI win stays quest-driven). All math derives from synced state + a no-RNG
   snap, so host/client/rollback agree. The Ep 3.5 set-piece `ex_terminator` (cfg.villain) is untouched.
   ===================================================================== */
const HUNTER_POOL_BASE     = 340;    // floor pool a 0-star squad must bank to drive it off (post-mitigation dmg)
const HUNTER_POOL_PER_STAR = 16;     // + per summed hero star → higher levels deal more DPS AND must bank more (repel-time ~constant). Ep XVI (29★)≈800 → a fast, survivable ~10s repel before attrition
const HUNTER_POOL_RAMP     = 0.10;   // each repel makes the next pool +10% (it's adapting)…
const HUNTER_POOL_RAMP_CAP = 0.60;   // …capped at +60% so it never becomes a wall
const HUNTER_HP_FLOOR      = 0.16;   // a burst that chews it below 16% HP also counts as a repel (it never dies)
const HUNTER_RETREAT_COOL  = 120;    // seconds off-field after a repel — MIN 2 minutes before it returns (owner)
const HUNTER_STAGGER_FRAC  = 0.80;   // pool fraction at which it visibly staggers ("about to break off" tell)
const HUNTER_DMG_MUL       = 0.8;    // soften the ENGAGEMENT (not the chase) — paired with the cadence stretch + smaller pool so a fight is tough but a 3-hero squad survives
const HUNTER_CD_MUL        = 1.5;    // stretch the AOE cadence in hunter mode → gaps for Biba to heal + the squad to reposition
const HUNTER_RETREAT_MAX   = 6;      // seconds: hard cap on the retreat sprint so it always leaves the field (even if jungle blocks the edge)
const HUNTER_RETREAT_SPEED = 1.8;    // it BOLTS when driven off
const HUNTER_APPROACH_SPEED = 1.8;   // it RUNS IN at full speed from its off-screen spawn; settles to normal once it reaches the squad

// summed career level of every living player hero on the map (the scaling input)
function heroStarSum(state){
  let s=0; for(const e of state.entities){ if(e.dead||e.storedIn||e.owner!=='player'||!e.hero) continue; s+=(e.stars||0); } return s;
}
// the hidden damage threshold for the CURRENT engagement (grows with hero level + each prior repel)
function hunterPoolTarget(state){
  const ramp = 1 + Math.min(HUNTER_POOL_RAMP_CAP, HUNTER_POOL_RAMP*(state._hunterRepels||0));
  return Math.round((HUNTER_POOL_BASE + HUNTER_POOL_PER_STAR*heroStarSum(state)) * ramp);
}
// centroid of the living heroes (fallback: any player unit) — in world px
function heroCentroid(state){
  let sx=0, sy=0, n=0;
  for(const e of state.entities){ if(e.dead||e.storedIn||e.owner!=='player'||!e.hero) continue; sx+=e.x; sy+=e.y; n++; }
  if(!n) for(const e of state.entities){ if(e.dead||e.storedIn||e.owner!=='player'||e.kind!=='unit') continue; sx+=e.x; sy+=e.y; n++; }
  return n ? { x:sx/n, y:sy/n } : null;
}
// the hunter's pursuit target: it FIXATES on the toughest hero (the founder it was built to reclaim) so the
// tank holds aggro + eats the focused melee/basic fire while the squishy ranged heroes burst it from cover —
// this is what keeps a 3-hero squad alive (a faster hunter chasing the SQUISHIEST would just corner + delete it).
// Falls back to nearest hero, then nearest player unit. maxHp tiebroken by distance so it commits to one target.
function hunterTarget(state, u){
  let best=null, bestHp=-1, bd=1e18;
  for(const e of state.entities){ if(e.dead||e.storedIn||e.owner!=='player'||!e.hero) continue;
    const dx=e.x-u.x,dy=e.y-u.y,d=dx*dx+dy*dy, hp=e.maxHp||0;
    if(hp>bestHp || (hp===bestHp && d<bd)){ bestHp=hp; bd=d; best=e; } }
  if(!best){ for(const e of state.entities){ if(e.dead||e.storedIn||e.owner!=='player'||e.kind!=='unit') continue; const dx=e.x-u.x,dy=e.y-u.y,d=dx*dx+dy*dy; if(d<bd){bd=d;best=e;} } }
  return best;
}
// where the hunter (re)appears: the NEAREST passable tile the player CANNOT currently see (in fog), preferring
// the BEHIND side (toward the start they fled from). It spawns OFF-SCREEN and then runs in at full speed (the
// approach sprint in hunterTick) — no "magical teleport" in view. Deterministic full scan (spawns seconds apart).
function hunterSpawnPos(state){
  const c=heroCentroid(state), W=state.W, H=state.H, B=state.blocked, V=state.visible;
  if(!c){ const px=(state.cfg&&state.cfg.player?state.cfg.player.x:(W>>1))|0, py=(state.cfg&&state.cfg.player?state.cfg.player.y:(H>>1))|0; return villainSnapOpen(state,px,py); }
  const cx=c.x/TILE, cy=c.y/TILE;
  const startX=(state.cfg&&state.cfg.player?state.cfg.player.x:(W>>1));
  const dir=Math.sign(startX-cx)||1;                                  // BEHIND = toward the start the squad fled from
  let best=null, bd=1e18, any=null, ad=1e18;
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x;
    if((B&&B[i]) || (V&&V[i]===1)) continue;                          // must be PASSABLE and NOT currently visible (fog)
    const dx=x-cx, dy=y-cy, d=dx*dx+dy*dy;
    if(d<ad){ ad=d; any={x,y}; }                                      // nearest fog tile in any direction
    if((Math.sign(dx)===dir||dx===0) && d<bd){ bd=d; best={x,y}; }    // …preferring the behind side
  }
  // best = nearest behind-fog; any = nearest fog; villainSnapOpen = last resort (whole map somehow visible)
  return best || any || villainSnapOpen(state, Math.round(cx+dir*6), Math.round(cy));
}
// per-tick hunter driver (called at the top of updateVillain). Returns true when it OWNS the tick (mid-retreat).
function hunterTick(state, u, dt, def){
  u._poolTarget = u._poolTarget || hunterPoolTarget(state);
  u._poolFrac = Math.max(0, Math.min(1, (u._poolDealt||0)/u._poolTarget));
  if(u._staggerT>0) u._staggerT -= dt;
  // (1) RETREATING — sprint to the nearest edge, then vanish + schedule the return
  if(u._huntState==='retreating'){
    u.autoTarget=null; u.cmd=null; u._untargetable=true; u.guard=true;
    u._exposed=false; u._overheatT=0; u._mechAct=null; u._mechAirborne=false; u._aoe=null;
    const W=state.W, H=state.H;
    const atEdge = (u.x<TILE*1.5 || u.y<TILE*1.5 || u.x>(W-1.5)*TILE || u.y>(H-1.5)*TILE);
    if(atEdge || (state.time||0)>=(u._retreatBy||0)){                  // reached an edge OR the sprint timed out (jungle blocked the way)
      u.dead=true;                                                     // despawn (NOT escaped → no win); the return loop respawns it
      state._hunterReturnAt=(state.time||0)+HUNTER_RETREAT_COOL;
      return true;
    }
    if(!u._fleeDest || (typeof dist==='function' && dist(u,u._fleeDest)<TILE)){
      const edge=nearestMapEdge(state,u); u._fleeDest=edge;
      if(typeof issueMove==='function') issueMove(state, u, edge.x, edge.y, {type:'amove', x:edge.x, y:edge.y});
    }
    return true;
  }
  // (2) HUNTING — relentlessly lock the TANK hero, IGNORING sight (the chase in updateUnit follows it)
  const hero = hunterTarget(state, u);
  if(hero){ u.autoTarget=hero; u._huntLock=hero.id; }
  // APPROACH SPRINT — it spawned off-screen (in fog), so it RUNS IN at full speed to reach the squad, then
  // settles to its normal cadence once it's in engage range (so the fight plays at the tuned speed, not a blur).
  { const base=(def&&def.speed)||u.speed||3.2;
    const d2 = hero ? ((typeof dist==='function')?dist(u,hero):1e9) : 1e9;
    u.speed = (d2 <= (u.range*TILE + 4*TILE)) ? base : base*HUNTER_APPROACH_SPEED; }
  // (3) REPEL — enough banked OR chewed below the HP floor → drive it off ("I'll be back"), restore, schedule return
  if((u._poolDealt||0) >= u._poolTarget || u.hp <= u.maxHp*HUNTER_HP_FLOOR){
    u._huntState='retreating'; u._fleeDest=null; u._staggerT=0.9; u.hp=Math.max(1,u.hp);
    u.speed=(def.speed||u.speed)*HUNTER_RETREAT_SPEED; u._retreatBy=(state.time||0)+HUNTER_RETREAT_MAX;   // BOLT for the edge, with a hard timeout so it always leaves
    state._hunterRepels=(state._hunterRepels||0)+1;
    if(!window._rbReplaying){
      bossTaunt(state, u, 'death');                                    // "I'll be back." (in-world taunt only — NO mechanic-explaining toast)
      if(typeof spawnRing==='function') spawnRing(u.x, u.y, '#3cff7a');
      state._shake=Math.max(state._shake||0, 3);
    }
    return true;
  }
  // (4) STAGGER tell — once, as the hidden pool nears full (the "about to break off" cue)
  if(u._poolFrac>=HUNTER_STAGGER_FRAC && !u._staggered){
    u._staggered=true; u._staggerT=0.7;
    if(!window._rbReplaying){ if(typeof spawnRing==='function') spawnRing(u.x, u.y, '#bfffd6'); state._shake=Math.max(state._shake||0, 1.5); }
  }
  return false;
}
// RETURN loop — host/solo per-tick check (called from core.js update, beside villainDeferredSpawn). When the
// retreat cooldown elapses, the hunter reappears NEAR the heroes' new position with a fresh, slightly bigger pool.
function hunterReturnTick(state){
  if(state.hub || state.over || !state._hunterReturnAt) return;
  if(state.entities.some(e=>e._hunter && !e.dead)) return;             // already back (guard)
  if((state.time||0) < state._hunterReturnAt) return;
  state._hunterReturnAt=0;
  const at = hunterSpawnPos(state);
  spawnVillainEntry(state, { id:state._hunterId||'ex_terminator_mk2', x:at.x, y:at.y, hunter:true });
  // NO fog reveal — it spawns in the dark and runs in; the player should see it EMERGE from the fog, not pop in.
  if(!window._rbReplaying && typeof eventToast==='function') eventToast('⚙ THE EX-TERMINATOR is back on your trail.', 7000);
}
// one villain from a {id,x,y} entry — shared by map load and scripted mid-mission events (T2-8)
/* ---- boss HP scaling (shared by spawn + the load-time reconcile below) ----
   The veteran-scaled max HP a boss should have RIGHT NOW given the current DEF and the player's
   carried career power (VPI). hpVpiCap bounds a maxed roster to a tough-but-finite pool (≤+160%
   for most mechs) instead of the old ~5× wall. SINGLE source of truth so spawn and reconcile can
   never drift. */
function villainMaxHp(def, vpi){
  const vpiBonus = Math.min(def.hpVpiCap!=null ? def.hpVpiCap : 99, (vpi||0)*(def.hpVpiScale||0));
  return Math.round(def.hp * (1 + vpiBonus));
}
// LOAD-TIME RECONCILE: an OLD save made before a boss-HP rebalance restored the boss with his
// PRE-cap maxHp (spawnVillainEntry — which applies hpVpiCap — is never re-run on load, so without
// this the loaded fight keeps the stale, possibly ~5× health pool). Recompute the intended maxHp
// from the CURRENT DEF + the saved VPI and scale current hp by the SAME ratio, so the % the player
// has already chewed off is preserved (a half-dead boss stays half-dead, just against a smaller
// bar). Idempotent: a boss already at the capped value rescales by 1.0 (no-op), so it is harmless
// on fresh spawns and on re-saves of an already-reconciled boss. Authoritative path only (called
// from updateVillain); co-op clients render the host's reconciled hp/maxHp via snapshots.
function reconcileVillainHp(state, u, def){
  const want = villainMaxHp(def, state._vpi || 0);
  const have = u.maxHp;
  if(!(have>0) || want===have) return;                 // nothing stored or already at the cap → no-op
  const frac = Math.max(0, Math.min(1, u.hp/have));     // health fraction the player has left
  u.maxHp = want;
  u.hp = Math.max(1, Math.round(want*frac));            // never round a still-living boss down to 0
}
function spawnVillainEntry(state, v){
  {
    const def = VILLAINS[v.id]; if(!def || typeof mkUnit!=='function') return;
    const u = mkUnit(state, def.base, 'enemy', v.x, v.y);     // pushed to state.entities; seeds DEF stats
    u.villain=true; u.villainId=v.id; u.villainName=def.name; u.guard=true;   // guard → excluded from waves/prod cap (ai.js)
    u.bossPhase=1; u._phaseIdx=0; u._overheatT=0; u.bossScale=def.bossScale; u.neonId=def.neonId;   // _phaseIdx: ordered-phase cursor; _overheatT: vent/EXPOSED window timer
    if(def.spriteType) u.spriteType=def.spriteType;           // render uses spriteType over type
    // scale HP/dmg to the player's carried career power (VPI, computed in newMap before this) so a
    // leveled veteran army faces a proportionately tougher boss — never trivial, never an instant melt.
    const vpi = state._vpi || 0;
    // hpVpiCap (applied in villainMaxHp) bounds the veteran HP bonus: a maxed roster faces a
    // tough-but-finite boss (≤+160% HP for most) instead of the old ~5× wall that made the fight a
    // doomed damage-race. _hpReconciled flags this boss as born at the current cap so the load-time
    // reconcile in updateVillain is a no-op for it (only OLD restored bosses lack the flag).
    u.maxHp = u.hp = villainMaxHp(def, vpi); u._hpReconciled=true;
    u.dmg   = Math.round(def.dmg * (1 + vpi*(def.dmgVpiScale||0)));
    if(def.dmgReduce>0) u.dmgReduce = def.dmgReduce;          // flat incoming-damage mitigation (damage(), units.js)
    if(def.splashFrac){ u.splash=Math.max(1, Math.round(u.dmg*def.splashFrac)); u.splashR=def.splashR||1.8; }   // basic attack splashes too (units.js u.splash override) → an AOE bruiser, not a single-target meleer; tracks the VPI-scaled dmg
    u.range=def.range; u.speed=def.speed; u.sight=def.sight;
    u._bossCd=def.cd; u.cd=0; u.bossDmgMul=1;
    u.r = Math.round((DEF[def.base].r||12) * def.bossScale * 0.6);   // collision grows sub-linearly (pathing stays sane)
    u._abilCd={};                                            // {blink:0, slam:0}
    if(def.aiKind==='ninja'){ u._ninjaAI=true; u._ninjaState='approach'; u._zig=1; u._exposeMul=(def.ninja&&def.ninja.exposeMul)||0.4; }   // hand ninja-AI villains (THE SEVERANCIER et al.) to updateNinja
    if((def.abilities||[]).some(a=>a.k==='missile'||a.k==='stomp'||AOE_KINDS[a.k])){ u._mech=true; u._mechImpacts=[]; }   // Rex / EX-TERMINATOR: multi-tick area specials (updateMech)
    if(v.hunter){                                            // Ep XVI pursuer: hidden damage-pool repel + hunt (hunterTick/updateVillain)
      u._hunter=true; state._hunterId=v.id;
      u._poolDealt=0; u._poolTarget=hunterPoolTarget(state); u._poolFrac=0;
      u._huntState='hunting'; u._staggerT=0; u._staggered=false;
      u.bossDmgMul=HUNTER_DMG_MUL;                            // soften the short engagement so 3 heroes survive (basic + all AOE specials read bossDmgMul)
      u._huntCdMul=HUNTER_CD_MUL;                             // + stretch AOE cadence (startAoe) for healing/reposition gaps
    }
    state._villainSpawned=true;
    if(!window._rbReplaying) bossTaunt(state, u, 'intro');
    return u;
  }
}

/* ---- per-frame driver (called from the core.js unit loop; authoritative path only) ---- */
function updateVillain(state, u, dt){
  if(state.hub || u.dead || !u.villain) return;
  const def = VILLAINS[u.villainId]; if(!def) return;

  // (a0) load-time HP-cap migration: an OLD save restored this boss with his pre-rebalance maxHp.
  // Rescale to the current cap (preserving the damage already dealt) ONCE, before the phase check
  // below reads u.maxHp. Idempotent + fresh spawns are pre-flagged, so this fires only for the
  // stale-HP case it exists to fix. See reconcileVillainHp.
  if(!u._hpReconciled){ reconcileVillainHp(state, u, def); u._hpReconciled=true; }

  // (a0.5) HUNTER (Ep XVI pursuer): set the pursuit target + check the hidden damage-pool repel each tick.
  // Owns the tick only while mid-retreat (sprinting off-field); otherwise falls through so its abilities/
  // OVERHEAT still run as a normal boss. The Ep 3.5 set-piece boss has no _hunter flag → unaffected.
  if(u._hunter){ if(hunterTick(state, u, dt, def)) return; }

  // (a) phase transitions — an ORDERED list of HP thresholds; each phase can amp stats AND/OR introduce a
  // NEW mechanic (unlocks adds, bigger overheat windows). bossPhase carries the LEVEL (1 base, 2, 3…) so the
  // bossbar/ninja reads (>=2) still work and a co-op client derives the rage tint from the synced level.
  if(def.phases){
    let idx = u._phaseIdx||0; const start=idx;
    while(idx < def.phases.length && u.hp <= u.maxHp*def.phases[idx].at){
      const ph=def.phases[idx];
      if(ph.dmgMul)        u.bossDmgMul=ph.dmgMul;
      if(ph.cdMul)         u._bossCd=def.cd*ph.cdMul;
      if(ph.speedMul!=null) u.speed=def.speed*ph.speedMul;
      if(ph.madFlavor)     u.madFlavor=true;
      if(ph.unlocks)       u._unlocked=(u._unlocked||[]).concat(ph.unlocks);   // gate new abilities (summon) on by phase
      if(ph.overheatBonus) u._overheatBonus=ph.overheatBonus;                  // bigger/stronger burn windows late
      idx++;
    }
    if(idx>start){
      u._phaseIdx=idx; u.bossPhase=idx+1; u._abilCastT=state.time;             // glow peak on the transition
      if(!window._rbReplaying) bossTaunt(state, u, 'phase');
    }
  }

  // (a2) OVERHEAT window — after a heavy telegraphed move the boss VENTS: ROOTED + EXPOSED (its dmgReduce is
  // scaled by exposeMul → it takes the punish-window bonus, the SAME damage() path the ninja strike uses). This
  // is the burn window where the player's stacked fire finally pays off. Owns the tick (no abilities/movement).
  if(u._overheatT>0){
    if(u._mech) mechUpkeep(state, u, dt, def);                                 // still resolve any in-flight missiles / quake wave while venting
    u._overheatT -= dt;
    u._exposed=true; u._exposeMul = (u._overheatExposeMul!=null) ? u._overheatExposeMul : ((def.overheat&&def.overheat.exposeMul)||0.25);
    const dur=u._overheatDur||((def.overheat&&def.overheat.dur)||u._overheatT);
    const root=(u._overheatRoot!=null)?u._overheatRoot:dur;                    // rooted for the front `root` seconds, then a brief scrambling tail
    u._mechAirborne = (u._overheatT > (dur-root));                            // reuse the jump-stomp root (updateUnit yields)
    if(u._overheatT<=0){ u._overheatT=0; u._exposed=false; u._mechAirborne=false; }
    return;
  }
  if(u._exposed && !(u._ninjaAI)) u._exposed=false;                            // clear a stale mech-expose (the ninja AI manages its own _exposed each tick)

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

  // (c) ninja — bespoke hit-and-run AI owns all movement+combat (updateUnit yields for it; flee in (b) wins)
  if(def.aiKind==='ninja'){ updateNinja(state, u, dt); return; }

  // (c2) MECH (Rex): every tick resolve in-flight missiles + the rolling quake wave; if a special is
  // mid-animation, step it and own the tick (updateUnit yields while airborne so Rex can't shoot mid-leap).
  if(u._mech){
    mechUpkeep(state, u, dt, def);
    if(u._mechAct){ stepMech(state, u, dt, def); return; }
  }

  // (d) abilities — cooldown-gated, reusing the normal combat helpers (Rex et al.)
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
    } else if(a.k==='missile'){
      if(d <= a.range*TILE){ startMissile(state, u, a, tgt, def); break; }   // begin a 3-missile barrage
    } else if(a.k==='stomp'){
      if(d <= a.range*TILE){ startStomp(state, u, a, def); break; }          // begin the thruster jump-stomp
    } else if(a.k==='summon'){
      if(a.phaseGate && (u.bossPhase||1) < a.phaseGate) continue;            // gated until that phase level (adds appear at enrage → ebb/flow + burn windows)
      villainSummon(state, u, a, def); u._abilCd[a.k]=a.cd; break;
    } else if(AOE_KINDS[a.k]){
      if(d <= a.range*TILE){ startAoe(state, u, a, tgt, def); break; }       // EX-TERMINATOR: melee/pistol/minigun area burst
    }
  }
}

/* =====================================================================
   REX — the black/green war-mech. Keeps its baseline ranged cannon (updateUnit); the two telegraphed
   AREA specials below run as a short sub-state machine on the unit (u._mechAct) so each can span the
   ticks of its animation. bossAreaDamage caps every blast to capFrac*maxHp → it can NEVER one-shot.
   Authoritative path only; FX guarded by !_rbReplaying; landing spot via simRandom-free scans.
   ===================================================================== */

// AREA damage with distance falloff and a hard per-unit cap (the "never one-shot / never wipe" rule).
// Optional volleyId: a unit can be hit at most once per volley, so the 3 missiles of one barrage spread
// across the cluster instead of stacking ≥2 blasts on the same body (keeps a single volley ≤ capFrac).
function bossAreaDamage(state, src, cx, cy, R, dmg, capFrac, volleyId, hitAir, maxHits){
  const hits=[];
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    if(hitAir===false && o.air) continue;               // ground-only blasts (melee/pistol); minigun/missile pass true/omit → flyers included
    if(volleyId!=null && o._volleyHit===volleyId) continue;
    const dd=Math.hypot(o.x-cx, o.y-cy);
    if(dd>R) continue;
    hits.push({o, dd});
  }
  // nearest-first, DETERMINISTIC (id tiebreak — no RNG, so host/client/rollback agree)
  hits.sort((a,b)=> (a.dd-b.dd) || ((a.o.id||0)-(b.o.id||0)));
  for(let i=0;i<hits.length;i++){
    const o=hits[i].o, dd=hits[i].dd;
    if(volleyId!=null) o._volleyHit=volleyId;
    let fall = 1 - 0.85*(dd/R);                          // 100% at the center → 15% at the rim: standing at the ring EDGE is meaningfully safer (rewards spacing)
    if(maxHits!=null && i>=maxHits) fall *= 0.15;        // ANTI-WIPE: one blast fully hits only the nearest `maxHits` units; the rest of a clumped ball take a token hit → spreading is the answer
    bossDamageCapped(state, src, o, dmg*fall, capFrac);
  }
}
function bossDamageCapped(state, src, o, dmg, capFrac){
  const amt = Math.min(dmg, o.maxHp*(capFrac||0.45));    // a single blast can never exceed capFrac of maxHp
  if(amt>0 && typeof damage==='function') damage(state, o, amt, src);
}

// Enter the OVERHEAT / EXPOSED window after a heavy telegraphed move whose ability def has overheat:true.
// Reuses the ninja punish-window fields (_exposed/_exposeMul, read by damage() in units.js) and the
// jump-stomp root (_mechAirborne → updateUnit yields). The window is ticked in updateVillain (a2).
function enterOverheatCore(state, u, oh, bonus){
  let dur=oh.dur||2.4, exposeMul=(oh.exposeMul!=null?oh.exposeMul:0.25);
  if(bonus){ if(bonus.durMul) dur*=bonus.durMul; if(bonus.exposeMul!=null) exposeMul=bonus.exposeMul; }   // phase-3 burn phase: longer / stronger windows
  u._overheatT=dur; u._overheatDur=dur;
  u._overheatRoot=(oh.rootDur!=null ? Math.min(oh.rootDur,dur) : dur);
  u._overheatExposeMul=exposeMul; u._exposed=true; u._exposeMul=exposeMul;
  u._mechAirborne=true; u._actState='idle'; u._actStamp=state.time; u._abilCastT=state.time;
  if(!window._rbReplaying && typeof spawnDust==='function') spawnDust(u.x, u.y-(u.r||16)*0.4);   // vent steam
}
function enterOverheat(state, u, def, a){
  if(!def || !def.overheat || !(a && a.overheat)) return;                                       // only the heavy moves (overheat:true) vent
  if(u._overheatT>0) return;                                                                    // don't restack an active window
  const ch=def.overheat.chance;                                                                 // chance<1 → a heavy move only SOMETIMES vents (the coolant node still FORCES it regardless)
  if(ch!=null && ch<1 && (typeof simRandom==='function') && simRandom(state) >= ch) return;     // deterministic roll → co-op / rollback safe
  enterOverheatCore(state, u, def.overheat, u._overheatBonus);
}

// SUMMON adds: the boss calls in a small A&O squad (scaled to roster) that attack-moves onto the player's
// army — giving the fight ebb/flow + the player's big army a correct second job. Reuses the holdout idioms
// (guard/_holdoutWave so ai.js never caps/sweeps them; off-screen fogged spawn tiles). Host/solo only;
// clients receive the adds as ordinary synced enemy units. Deterministic (no RNG → rollback-safe).
function villainSummon(state, u, a, def){
  if(typeof mkUnit!=='function') return;
  const comp=a.comp||[['soldier',2]];
  const scale=(typeof holdoutRosterFactor==='function') ? holdoutRosterFactor(state) : 1;
  let tiles=(typeof holdoutSpawnTiles==='function' && state.cfg && state.cfg.holdout) ? holdoutSpawnTiles(state) : [];
  if(!tiles.length){                                   // no holdout config (duel arenas): a ring of tiles around the boss
    const bx=(u.x/TILE)|0, by=(u.y/TILE)|0;
    for(const off of [[7,0],[-7,0],[0,7],[0,-7],[5,5],[-5,5],[5,-5],[-5,-5]]) tiles.push({x:bx+off[0], y:by+off[1]});
  }
  let pi=0, idx=0; const spawned=[];
  for(const pair of comp){
    let count=pair[1]|0; if(scale!==1) count=Math.max(1, Math.round(count*scale));
    for(let k=0;k<count;k++){
      const p=tiles[pi%tiles.length]; pi++;
      const at=villainSnapOpen(state, (p.x+((idx%3)-1))|0, (p.y+((idx/3|0)%3))|0); idx++;
      const m=mkUnit(state, pair[0], 'enemy', at.x, at.y);
      if(!m) continue;
      m.guard=true; m._holdoutWave=true;               // excluded from ai.js prod caps / wave sweeps
      spawned.push(m);
    }
  }
  const tgt=u.autoTarget||(u.cmd&&u.cmd.target);
  const gx=tgt?tgt.x:u.x, gy=tgt?tgt.y:u.y;
  for(const m of spawned){ if(typeof issueMove==='function') issueMove(state, m, gx, gy, {type:'amove', x:gx, y:gy}); }
  u._abilCastT=state.time;
  if(!window._rbReplaying) bossTaunt(state, u, a.tauntKey||'phase');
}

/* ---- COOLANT NODE (cfg.bossNodes): a capturable arena objective. Hold one (a player unit standing on it
   for holdSec) to FORCE the boss's overheat/EXPOSED window on demand, then it goes on cooldown. Gives the
   player's idle army a "use the map" play and a two-front micro problem. Called from core.js every
   authoritative tick (host/solo only); state.bossNodes is plain JSON on G (auto-saves, rides rollback).
   Deterministic — proximity + state.time only, no RNG. Per-map opt-in. ---- */
function bossNodeTick(state, dt){
  const cfg=state.cfg; if(!cfg || !cfg.bossNodes || !cfg.bossNodes.length) return;
  if(!state.bossNodes || state.bossNodes.length!==cfg.bossNodes.length){     // lazy init / re-derive from cfg (so a legacy save without the field still works)
    state.bossNodes = cfg.bossNodes.map(n=>({ x:n.x|0, y:n.y|0, holdSec:(n.holdSec!=null?n.holdSec:3), cd:(n.cd!=null?n.cd:18), radius:(n.radius!=null?n.radius:1.8), holdT:0, cool:0 }));
  }
  const boss = state.entities.find(e=>e.villain && !e.dead && !e.escaped);
  for(const node of state.bossNodes){
    if(node.cool>0){ node.cool=Math.max(0,node.cool-dt); node.holdT=0; continue; }
    const cx=(node.x+0.5)*TILE, cy=(node.y+0.5)*TILE, RR=node.radius*TILE;
    const held = state.entities.some(e=>e.owner==='player'&&e.kind==='unit'&&!e.dead&&!e.storedIn && Math.hypot(e.x-cx,e.y-cy)<=RR);
    if(held){
      node.holdT+=dt;
      if(node.holdT>=node.holdSec){
        node.holdT=0; node.cool=node.cd;
        const def=boss && VILLAINS[boss.villainId];
        if(boss && def && def.overheat && !(boss._overheatT>0)){              // force the EXPOSED window (don't stomp an active one)
          enterOverheatCore(state, boss, def.overheat, boss._overheatBonus);
          if(!window._rbReplaying){
            if(typeof spawnRing==='function') spawnRing(cx, cy, '#7bdcff');
            if(typeof toast==='function') toast('❄ Coolant vented — '+(boss.villainName||'the boss')+' is EXPOSED!');
          }
        }
      }
    } else node.holdT=Math.max(0, node.holdT-dt*0.5);                         // decay partial progress when abandoned
  }
}

// the tile-cluster the most player units are bunched around (where a stomp wants to land)
function densestCluster(state, u, R){
  const ps=[];
  for(const o of state.entities){ if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    if(Math.hypot(o.x-u.x,o.y-u.y)<=R) ps.push(o); }
  if(!ps.length) return null;
  let best=ps[0], bestN=-1;
  for(const c of ps){ let n=0; for(const o of ps){ if(Math.hypot(o.x-c.x,o.y-c.y)<=2.5*TILE) n++; } if(n>bestN){ bestN=n; best=c; } }
  const tx=(best.x/TILE)|0, ty=(best.y/TILE)|0;
  if(state.blocked && state.blocked[ty*state.W+tx]) return { x:u.x, y:u.y };   // don't land in a wall
  return { x:best.x, y:best.y };
}

// per-tick upkeep: resolve scheduled missile impacts, expand the quake wave, decay screen shake.
function mechUpkeep(state, u, dt, def){
  // (screen-shake decay moved to render() so it runs on every map / path, not just boss maps)
  if(u._mechImpacts && u._mechImpacts.length){
    for(const im of u._mechImpacts){ if(im.done) continue;
      im.t -= dt;
      if(im.t<=0){ im.done=true;
        bossAreaDamage(state, u, im.x, im.y, im.r, Math.round(im.dmg*(u.bossDmgMul||1)), im.capFrac, im.volleyId, undefined, im.maxHits);
        if(!window._rbReplaying && typeof spawnExplosion==='function') spawnExplosion(im.x, im.y);
        state._shake = Math.max(state._shake||0, 5);
      }
    }
    u._mechImpacts = u._mechImpacts.filter(im=>!im.done);
  }
  if(u._quake){                                          // a ground wave that damages units the front NEWLY passes
    const q=u._quake, prevR=q.r;
    q.r += (q.rMax/0.4)*dt;
    for(const o of state.entities){
      if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
      const dd=Math.hypot(o.x-q.x, o.y-q.y);
      if(dd>prevR && dd<=q.r && o._quakeHit!==q.id){
        o._quakeHit=q.id; q.nHit=(q.nHit||0)+1;
        const mul=(q.maxHits!=null && q.nHit>q.maxHits) ? 0.15 : 1;   // ANTI-WIPE: the wavefront expands outward (nearest pass first), so it fully hits the nearest maxHits, the rest a token graze
        bossDamageCapped(state, u, o, Math.round(q.dmg*(u.bossDmgMul||1))*mul, q.capFrac);
      }
    }
    if(q.r>=q.rMax) u._quake=null;
  }
}

// step the active multi-tick special
function stepMech(state, u, dt, def){
  u._mechT = (u._mechT||0)+dt;
  if(u._mechAct==='missile') stepMissile(state, u, dt, def);
  else if(u._mechAct==='stomp') stepStomp(state, u, dt, def);
  else if(AOE_KINDS[u._mechAct]) stepAoe(state, u, dt, def);
  else u._mechAct=null;
}

// ---- MISSILE BARRAGE: 0.35s rear-up windup, then lob `count` arcing plasma missiles at a spread ----
function startMissile(state, u, a, tgt, def){
  u._mechAct='missile'; u._mechT=0;
  u._abilCastT=state.time; u._actStamp=state.time; u._abilCd[a.k]=a.cd;
  u._volley={ a, tx:tgt.x, ty:tgt.y, fired:false };
  if(!window._rbReplaying) bossTaunt(state, u, 'missile');
}
function stepMissile(state, u, dt, def){
  u._actState='attack'; u._face = (u._volley && u._volley.tx<u.x)?-1:1;
  const v=u._volley; if(!v){ u._mechAct=null; return; }
  if(u._mechT < 0.35) return;                            // telegraph
  if(!v.fired){
    v.fired=true;
    const a=v.a, n=a.count||3, R=(a.splashR||1.9)*TILE, fl=a.flight||0.78, cap=a.capFrac||0.4, vid=state.time;
    const muzx=u.x, muzy=u.y - (u.r||16)*1.2;            // cannon muzzle (upper body)
    const pts=missileAimPoints(state, u, v.tx, v.ty, n, (a.spreadTiles||2.2)*TILE);
    for(let i=0;i<pts.length;i++){
      const p=pts[i], delay=i*0.12, t=fl+delay;
      u._mechImpacts.push({ x:p.x, y:p.y, t, r:R, dmg:a.dmg, capFrac:cap, volleyId:vid, maxHits:a.maxHits });
      if(!window._rbReplaying){
        if(typeof spawnMissile==='function') spawnMissile(muzx, muzy, p.x, p.y, t);
        if(typeof spawnDangerDecal==='function') spawnDangerDecal(p.x, p.y, R, t);   // each missile telegraphs its landing zone over its flight time
      }
    }
  }
  if(u._mechT >= 0.6){ const a=u._volley&&u._volley.a; u._mechAct=null; u._volley=null; u._actStamp=state.time; enterOverheat(state, u, def, a); }   // missiles resolve via mechUpkeep
}
// aim points: the target plus the nearest other player units (so extra missiles spread across the cluster)
function missileAimPoints(state, u, tx, ty, n, spread){
  const pts=[{x:tx,y:ty}], cand=[];
  for(const o of state.entities){ if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    const dd=Math.hypot(o.x-tx,o.y-ty); if(dd>1 && dd<=spread*2.5) cand.push({x:o.x,y:o.y,dd}); }
  cand.sort((a,b)=>a.dd-b.dd);
  let ci=0;
  while(pts.length<n){
    if(ci<cand.length){ pts.push({x:cand[ci].x, y:cand[ci].y}); ci++; }
    else { const k=pts.length, ang=k*2.39996 + tx*0.01; pts.push({x:tx+Math.cos(ang)*spread, y:ty+Math.sin(ang)*spread}); }
  }
  return pts.slice(0,n);
}

// ---- JUMP-STOMP: crouch → thruster leap onto the densest cluster → crash → earthquake wave → recover ----
function startStomp(state, u, a, def){
  u._mechAct='stomp'; u._mechT=0; u._stompPhase=1; u._mechAirborne=true;   // rooted/airborne for the whole move
  u._abilCastT=state.time; u._abilCd[a.k]=a.cd;
  const land=densestCluster(state, u, (a.range||6.5)*TILE*1.4) || {x:u.x,y:u.y};
  u._stomp={ a, x0:u.x, y0:u.y, lx:land.x, ly:land.y };
  if(!window._rbReplaying){
    bossTaunt(state, u, 'stomp');
    if(typeof spawnDangerDecal==='function') spawnDangerDecal(land.x, land.y, (a.waveR||3.4)*TILE, 0.45+(a.jumpDur||0.7));   // ground telegraph at the landing spot, filling over crouch+air time
  }
}
function stepStomp(state, u, dt, def){
  const s=u._stomp; if(!s){ u._mechAct=null; u._mechAirborne=false; return; }
  const a=s.a, tCrouch=0.45, tAir=(a.jumpDur||0.7), tRec=0.4, H=(u.r||16)*4.5;
  u._actState='attack';
  if(u._stompPhase===1){                                // CROUCH / spool thrusters
    if(!window._rbReplaying && typeof spawnThruster==='function' && ((u._mechT*60)|0)%2===0) spawnThruster(u.x, u.y+(u.r||16)*0.45, 0, 1.3);
    if(u._mechT>=tCrouch){ u._stompPhase=2; u._mechT=0; }
    return;
  }
  if(u._stompPhase===2){                                // AIRBORNE — thrust up, fly to the landing point
    const p=Math.min(1, u._mechT/tAir);
    u._jumpZ = Math.sin(p*Math.PI)*H;                   // up-arc, apex at mid-flight
    u.x = s.x0 + (s.lx-s.x0)*p; u.y = s.y0 + (s.ly-s.y0)*p;
    u.dir = Math.atan2(s.ly-s.y0, s.lx-s.x0) || u.dir;
    if(!window._rbReplaying && typeof spawnThruster==='function' && p<0.55 && ((u._mechT*60)|0)%2===0) spawnThruster(u.x, u.y+(u.r||16)*0.5, 0, 2.6);
    if(p>=1){ u._stompPhase=3; u._mechT=0; u._jumpZ=0; u.x=s.lx; u.y=s.ly; }
    return;
  }
  if(u._stompPhase===3){                                // LAND / IMPACT — shockwave, dust, quake, shake
    u._jumpZ=0;
    if(!window._rbReplaying){
      if(typeof spawnShockwave==='function') spawnShockwave(u.x, u.y, (a.waveR||3.4)*TILE);
      if(typeof spawnDust==='function') spawnDust(u.x, u.y);
      if(typeof spawnExplosion==='function') spawnExplosion(u.x, u.y);
    }
    state._shake = 15;
    u._quake={ x:u.x, y:u.y, r:0, rMax:(a.waveR||3.4)*TILE, dmg:a.dmg, capFrac:a.capFrac||0.45, id:state.time, maxHits:a.maxHits };
    u._actStamp=state.time; u._abilCastT=state.time;
    u._stompPhase=4; u._mechT=0;
    return;
  }
  // RECOVER — a brief rooted opening, then hand back to normal combat (or VENT into the overheat window)
  if(u._mechT>=tRec){ const a=s.a; u._mechAct=null; u._mechAirborne=false; u._stomp=null; u._stompPhase=0; enterOverheat(state, u, def, a); }
}

/* =====================================================================
   THE EX-TERMINATOR — three telegraphed AREA attacks built on the same u._mechAct
   sub-state machine as Rex's specials, but each resolves its damage in ONE burst at
   the apex (no projectile flight) so it reads as a melee shockwave / a pistol splash /
   a minigun rake. The boss is ROOTED for the move (u._mechAirborne → updateUnit yields,
   units.js) and each distinct attack drives its own action sprite (u._actState). The
   capFrac in bossAreaDamage still guarantees no single burst one-shots a unit.
     melee_aoe   — self-centred ring, GROUND only (fists/kick clear everything adjacent)
     pistol_aoe  — splash at the target, GROUND only
     minigun_aoe — wide multi-centre rake at the target that ALSO hits FLYERS (mk2 only)
   ===================================================================== */
const AOE_KINDS = {
  melee_aoe:   { act:'attack_melee',   self:true,  air:false, taunt:'melee'   },
  pistol_aoe:  { act:'attack_pistol',  self:false, air:false, taunt:'pistol'  },
  minigun_aoe: { act:'attack_minigun', self:false, air:true,  taunt:'minigun' },
};
function startAoe(state, u, a, tgt, def){
  const K=AOE_KINDS[a.k];
  u._mechAct=a.k; u._mechT=0; u._mechAirborne=true; u.vx=0; u.vy=0;     // root: updateUnit yields while this runs
  u._abilCastT=state.time; u._actStamp=state.time; u._actState=K.act; u._abilCd[a.k]=a.cd*(u._huntCdMul||1);   // hunter mode stretches AOE cadence → healing/reposition gaps for a 3-hero squad
  u._actDur=(a.windup||0.28)+(a.recover||0.30);                        // render stretches the attack strip over the FULL move so it's legible (not a 0.8s blur)
  u._aoe={ a, K, tx:K.self?u.x:tgt.x, ty:K.self?u.y:tgt.y, fired:false };
  if(!window._rbReplaying){
    bossTaunt(state, u, K.taunt);
    if(typeof spawnDangerDecal==='function') spawnDangerDecal(u._aoe.tx, u._aoe.ty, (a.splashR||2.2)*TILE*(a.sweep>1?1.5:1), a.windup||0.28);   // ground telegraph sized to the blast (wider for the minigun rake), filling over the windup
  }
}
function stepAoe(state, u, dt, def){
  const v=u._aoe; if(!v){ u._mechAct=null; u._mechAirborne=false; u._actDur=0; return; }
  const a=v.a, K=v.K; u._actState=K.act;
  if(K.self){ v.tx=u.x; v.ty=u.y; } else { u._face=(v.tx<u.x)?-1:1; }
  const wind=a.windup||0.28, rec=a.recover||0.30;
  if(u._mechT < wind) return;                                          // rooted telegraph (the player's punish window)
  if(!v.fired){
    v.fired=true;
    const R=(a.splashR||2.2)*TILE, dmg=Math.round((a.dmg||30)*(u.bossDmgMul||1)), cap=a.capFrac||0.30;
    const sweep=Math.max(1, a.sweep||1), vid=state.time;
    for(let i=0;i<sweep;i++){
      const jx = sweep>1 ? (i-(sweep-1)/2)*TILE*1.4 : 0;               // rake the minigun across the cluster
      bossAreaDamage(state, u, v.tx+jx, v.ty, R, dmg, cap, vid, K.air, a.maxHits);
    }
    if(!window._rbReplaying){
      if(typeof spawnShockwave==='function') spawnShockwave(v.tx, v.ty, R);
      if(typeof spawnExplosion==='function') spawnExplosion(v.tx, v.ty);
      if(typeof spawnDust==='function' && K.self) spawnDust(u.x, u.y);
    }
    state._shake = Math.max(state._shake||0, K.air?13:7);
  }
  if(u._mechT >= wind+rec){ u._mechAct=null; u._aoe=null; u._mechAirborne=false; u._actStamp=state.time; u._actDur=0; enterOverheat(state, u, def, a); }
}

/* =====================================================================
   THE SEVERANCIER (internal id cyan_ninja) and the other ninja-AI villains — a bespoke hit-and-run AI
   (authoritative path only; clients render the
   replicated x/y + the synced _ninjaHidden dim). It glide-dashes IN on a diagonal staircase,
   lands ONE guaranteed strike during a rooted, EXPOSED wind-up (the player's punish window),
   weaves AWAY from whatever is shooting it (emergency blink if cornered point-blank), then drops
   a smoke bomb to vanish (invisible + untargetable) and re-emerges on a fresh target. A 4-state
   machine on u._ninjaState: approach → strike → evade → hide → approach. All tuning lives in
   VILLAINS.cyan_ninja.ninja. Deterministic (simRandom only); FX guarded by !_rbReplaying.
   ===================================================================== */
function updateNinja(state, u, dt){
  const def = VILLAINS[u.villainId] || {}; const N = def.ninja || {};
  if(!u._ninjaState) u._ninjaState='approach';   // defensive init (mid-fight save reload / first tick)
  if(u._zig==null) u._zig=1;
  u._actState=null;   // set to 'attack' only during the strike wind-up/apex below
  u._exposed=false;   // true only while winding up a strike (damage() reads it for the punish window)
  const phase2 = (u.bossPhase||1)>=2;
  const spd = (N.dashSpeed||18) * (phase2?1.18:1);
  const HOP = N.hopLen||2.3, TS = TILE;

  // --- STUCK WATCHDOG (time since last COMPLETED move): the right signal is whether the ninja actually
  // GETS ANYWHERE. _lastMoveT is refreshed only when a hop GLIDE COMPLETES (reaches its tile) or a teleport
  // fires (lunge/blink/unstick) — NOT when a hop merely starts or a glide stalls against a wall. So a tight
  // fight (hops keep completing) never fires, while a terrain wedge (every hop blocked / glides stall, so
  // nothing completes) fires after 2s and smoke-blinks it to open ground. ---
  if(u._lastMoveT==null) u._lastMoveT=state.time;
  if(state.time - u._lastMoveT > 2.0){ ninjaUnstick(state, u, def); return; }

  // --- CORNERED BREAK-OUT: if the ninja has been pinned (can't reach HIDE / vanish) for >escapeAfter seconds
  // while shooters are right on it — like cornered against a map edge where it becomes an easy target — it MUST
  // escape: a very fast smoke-DASH straight THROUGH the units (they don't block movement, only terrain does) to
  // open ground, then it vanishes. _lastHideT is refreshed every tick it's hidden, so in normal play (it hides
  // every ~3-4s) this never fires; only a real pin lets the gap reach escapeAfter. ---
  if(u._lastHideT==null) u._lastHideT=state.time;
  if(u._ninjaState!=='escape' && u._ninjaState!=='hide' && !u._fleeing &&
     state.time - u._lastHideT > (N.escapeAfter||10) &&
     (typeof nearestEnemy==='function' && nearestEnemy(state, u, (N.safeDist||6)*TS*1.5))){
    startNinjaEscape(state, u, N, def); return;
  }

  // --- HIDE timer runs at the TOP so the smoke-vanish always ends on schedule, even mid-flank-dash
  // (the in-flight/hopWait early-returns below would otherwise starve it and the ninja stays gone forever) ---
  if(u._ninjaState==='hide'){
    u._lastHideT=state.time;   // hidden = safe → keep the cornered-break-out timer reset
    u._hideT=(u._hideT||0)+dt;
    if(u._hideT >= (N.hideDur||1.5)*(phase2?0.65:1)){
      u._ninjaHidden=false; u._untargetable=false; u._dash=null;
      if(typeof spawnSmoke==='function' && !window._rbReplaying) spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff');
      u._ninjaState='approach'; return;                       // re-emerge and pick a fresh victim
    }
  }

  // --- advance an in-flight glide hop; if still travelling, that's the whole tick ---
  if(u._dash){
    const esc=!!u._escaping;
    const dx=u._dash.x-u.x, dy=u._dash.y-u.y, dd=Math.hypot(dx,dy), step=(esc?(N.escapeSpeed||34):spd)*TS*dt;
    // ABORT a STALLED glide: a real ≤2.3-tile hop finishes in <0.15s, so if it has run >0.35s, OR the
    // remaining distance came out LARGER than we projected last tick (separation shoved it back off a wall),
    // drop the dash and re-plan THIS tick — the path-validated tryHop below then slides along the obstacle
    // instead of grinding into it. (The break-out dash is long + path-pre-validated → never aborts.)
    if(!esc && ((state.time-(u._dashStartT||state.time) > 0.35) || (u._dashPrevD!=null && dd > u._dashPrevD + step*0.5))){
      u._dash=null; u._dashPrevD=null; u._hopWait=0;
    } else if(dd<=step || dd<2){ u.x=u._dash.x; u.y=u._dash.y; u._dash=null; u._dashPrevD=null; u._lastMoveT=state.time; if(dd>0.01) u.dir=Math.atan2(dy,dx);   // COMPLETED
      if(esc){ u._escaping=false; u._ninjaState='hide'; u._hideT=0; u._lastHideT=state.time; }   // broke out → vanish + reset the pin timer
    }
    else { u.x+=dx/dd*step; u.y+=dy/dd*step; u.dir=Math.atan2(dy,dx); u._dashPrevD=dd-step;
      if(esc && !window._rbReplaying && typeof spawnSmoke==='function' && (u._escSmokeT=(u._escSmokeT||0)+dt)>=0.09){ u._escSmokeT=0; spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff'); }   // smoke trail along the break-out
      return; }
  }
  // defensive: a break-out that somehow lost its dash → resume normal AI (don't strand in 'escape')
  if(u._ninjaState==='escape'){ u._escaping=false; u._ninjaHidden=false; u._untargetable=false; u._ninjaState='approach'; }
  // brief inter-hop pause so dashes read as discrete flicks (skipped in flight above)
  if((u._hopWait = (u._hopWait||0) - dt) > 0) return;

  // launch a DIAGONAL hop along heading (hx,hy): try the diagonal best aligned with the heading, then the
  // others (slides along terrain instead of wedging), shortening the hop until a passable tile is found.
  const tryHop = (hx,hy,len)=>{
    const hd=Math.hypot(hx,hy)||1; hx/=hd; hy/=hd;
    const di=[[1,1],[1,-1],[-1,1],[-1,-1]].map(d=>({sx:d[0], sy:d[1], dot:(d[0]*hx+d[1]*hy)})).sort((a,b)=>b.dot-a.dot);
    for(const {sx,sy} of di){
      for(let L=len; L>=0.75; L-=0.5){
        const wx=u.x + sx*L*TS*0.7071, wy=u.y + sy*L*TS*0.7071;   // equal x/y → Euclidean travel == L tiles
        const tx=(wx/TS)|0, ty=(wy/TS)|0;
        // endpoint open AND the straight glide path is clear → won't wedge against a wall mid-glide
        if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx]) && pathClear(state,u.x,u.y,wx,wy)){
          u._dash={x:wx,y:wy}; u._dashStartT=state.time; u._dashPrevD=null;
          u._hopWait=(N.hopGap||0.06)*(phase2?0.7:1); u.dir=Math.atan2(sy,sx); return true;
        }
      }
    }
    return false;   // fully boxed in (no clear diagonal in any direction)
  };
  const alive = (t)=> t && !t.dead && t.owner==='player';

  // ---------- APPROACH: staircase diagonally toward a chosen victim until in lunge range ----------
  if(u._ninjaState==='approach'){
    u._comboN=0;                                                // fresh engagement → reset the strike-flurry counter
    let t=u._ninjaTgt; if(!alive(t)){ t=pickNinjaTarget(state,u,N); u._ninjaTgt=t; }
    if(!alive(t)) return;                                        // duel map → there is always a target
    const dd=dist(u,t);
    if(dd <= (N.lungeRange||2.6)*TS){ u._ninjaState='strike'; u._strikeT=0; return; }   // close enough → commit a lunge-strike
    tryHop(t.x-u.x, t.y-u.y, Math.min(HOP, Math.max(1.0, dd/TS - 1.0)));
    return;
  }

  // ---------- STRIKE: rooted, EXPOSED wind-up at range, then a flash-LUNGE to a guaranteed hit ----------
  if(u._ninjaState==='strike'){
    let t=u._ninjaTgt;
    if(!alive(t) || dist(u,t) > (N.lungeRange||2.6)*TS + 1.5*TS){ u._comboN=0; u._ninjaState='approach'; return; }   // it slipped away → re-approach
    faceTo(u,t); u._face = t.x<u.x?-1:1; u._exposed=true;
    const wind=((u._comboN>0)?(N.comboWindup||0.14):(N.strikeWindup||0.40))*(phase2?0.7:1);   // 1st strike telegraphed; combo follow-ups snap fast
    u._strikeT=(u._strikeT||0)+dt;
    if(u._strikeT < wind){
      if(!u._abilCastT || state.time-u._abilCastT>0.5) u._abilCastT=state.time;   // peak the charge glow (drawVillainGlow)
      u._actState='attack'; u._actStamp=state.time - u._strikeT;                  // hold the swing on its windup frames
      return;
    }
    // APEX — flash-LUNGE to contact (beats the separation jostle), then a guaranteed hit
    const sx0=u.x, sy0=u.y, dx=t.x-u.x, dy=t.y-u.y, dl=Math.hypot(dx,dy)||1;
    const lx=t.x-(dx/dl)*(entRadius(t)+(u.r||14)*0.8), ly=t.y-(dy/dl)*(entRadius(t)+(u.r||14)*0.8);
    const ltx=(lx/TS)|0, lty=(ly/TS)|0;
    if(ltx>0&&lty>0&&ltx<state.W-1&&lty<state.H-1 && !(state.blocked && state.blocked[lty*state.W+ltx])){ u.x=lx; u.y=ly; }
    u._dash=null; u._lastMoveT=state.time;   // lunge = a move (watchdog)
    const dmg=Math.round(u.dmg*(u.bossDmgMul||1));
    if(typeof applyHit==='function') applyHit(state, u, t, dmg, 0, 1.3);
    u._actState='attack'; u._actStamp=state.time;
    if(!window._rbReplaying){
      if(typeof spawnSlash==='function') spawnSlash({x:sx0,y:sy0}, t, def.neonColor||'#bffcff');   // streak shows the lunge path
      if(typeof spawnRing==='function')  spawnRing(u.x, u.y, def.neonColor||'#50e6ff');
    }
    if(phase2){ const t2=nearestEnemy(state,u,(u.range+0.7)*TS); if(t2&&t2!==t){ applyHit(state,u,t2,dmg,0,1.3); if(typeof spawnSlash==='function'&&!window._rbReplaying) spawnSlash(u,t2,def.neonColor||'#bffcff'); } }
    // COMBO — chain a few quick strikes per engagement (a blade FLURRY) before retreating, so he attacks
    // OFTEN instead of one-and-vanish. Keep re-striking while the victim stays in reach and the cap isn't hit.
    u._comboN=(u._comboN||0)+1; u._strikeT=0; u._exposed=false;
    if(u._comboN < (N.combo||3) && alive(t) && dist(u,t) <= (N.lungeRange||2.6)*TS*1.35){ u._ninjaState='strike'; return; }
    u._comboN=0; u._ninjaState='evade'; u._evadeN=0;
    return;
  }

  // ---------- EVADE: weave away from the shooters; blink out if truly walled in ----------
  if(u._ninjaState==='evade'){
    const c = shooterCentroid(state, u, (N.shooterR||5.5)*TS) || {x:u.x, y:u.y};
    const near = nearestEnemy(state, u, (N.safeDist||6)*TS);
    if(!near){ u._ninjaState='hide'; u._hideT=0; return; }                        // already clear → vanish
    const nd = dist(u, near), cd0=dist(u,c);
    // scan all four diagonals; take the open hop that lands FURTHEST from the cluster (slips a surround / corner)
    let best=null, bestSc=-1e18;
    for(const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
      for(let L=HOP; L>=0.75; L-=0.5){
        const wx=u.x+sx*L*TS*0.7071, wy=u.y+sy*L*TS*0.7071, tx=(wx/TS)|0, ty=(wy/TS)|0;
        if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx]) && pathClear(state,u.x,u.y,wx,wy)){
          const sc=Math.hypot(wx-c.x,wy-c.y) - (sx===u._zdx&&sy===u._zdy?7:0);     // mild anti-repeat → a dodging weave
          if(sc>bestSc){ bestSc=sc; best={x:wx,y:wy,sx,sy}; }
          break;                                                                   // longest clear hop along this diagonal
        }
      }
    }
    if(best && (bestSc>cd0 || nd>(N.panicRange||1.6)*TS)){                          // a hop that gains ground (or we're not pinned)
      u._dash={x:best.x,y:best.y}; u._dashStartT=state.time; u._dashPrevD=null; u._hopWait=(N.hopGap||0.06)*(phase2?0.7:1);
      u.dir=Math.atan2(best.sy,best.sx); u._zdx=best.sx; u._zdy=best.sy; u._evadeStuck=0;
      u._evadeN=(u._evadeN||0)+1;
      if(u._evadeN >= (N.evadeHops||3) && nd > (N.safeDist||6)*TS*0.8){ u._ninjaState='hide'; u._hideT=0; }
      return;
    }
    // pinned point-blank with no ground to gain → smoke-blink straight out; if EVEN that fails, turn and fight
    if((u._panicCd=(u._panicCd||0)-dt) <= 0){ ninjaPanicBlink(state, u, c, N, def); u._panicCd=2.2; u._evadeStuck=0; return; }
    if((u._evadeStuck=(u._evadeStuck||0)+1) >= 3){ u._evadeStuck=0; u._ninjaTgt=near; u._ninjaState='strike'; u._strikeT=0; }   // walled corner → "corner and finish" payoff
    return;
  }

  // ---------- HIDE: smoke-bomb vanish (invisible + untargetable) + slow flank (timer/exit handled at top) ----------
  if(u._ninjaState==='hide'){
    if(!u._ninjaHidden){
      u._ninjaHidden=true; u._untargetable=true;   // player units lose lock (units.js); render dims the sprite
      if(!window._rbReplaying){ if(typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff'); if(typeof spawnRing==='function') spawnRing(u.x,u.y,'#bffcff'); }
    }
    let t=u._ninjaTgt; if(!alive(t)){ t=pickNinjaTarget(state,u,N); u._ninjaTgt=t; }
    if(t) tryHop(t.y-u.y, -(t.x-u.x), HOP*0.7);    // drift to a FLANK (perpendicular to the target) while cloaked
    return;
  }
}

// choose a victim: punish whoever is shooting the ninja, then the wounded, then the near; deprioritize flyers.
function pickNinjaTarget(state, u, N){
  const R=(N.retargetR||13)*TILE; let best=null, bs=-1e18;
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    const dd=dist(u,o); if(dd>R) continue;
    let s=0;
    if(o.autoTarget===u || (o.cmd&&o.cmd.type==='attack'&&o.cmd.target===u)) s+=400;   // it's shooting me → I cut it first
    s += (1-(o.hp/o.maxHp))*150;                         // finish the wounded (drama)
    s -= dd/TILE*8;                                      // prefer closer
    if(o.air) s-=120;                                    // a blade prefers ground
    s += (typeof simRandom==='function'?simRandom(state):0)*20;   // deterministic jitter so picks vary
    if(s>bs){ bs=s; best=o; }
  }
  return best || (typeof nearestEnemy==='function' ? nearestEnemy(state,u,1e9) : null);
}

// centroid of player units within R (the cluster the ninja flees from)
function shooterCentroid(state, u, R){
  let sx=0, sy=0, n=0;
  for(const o of state.entities){
    if(o.dead||o.storedIn||o.owner!=='player'||o.kind!=='unit') continue;
    if(dist(u,o) > R) continue;
    sx+=o.x; sy+=o.y; n++;
  }
  return n ? { x:sx/n, y:sy/n } : null;
}

// emergency teleport directly away from the cluster (only fires at point-blank during evade)
function ninjaPanicBlink(state, u, c, N, def){
  let ax=u.x-c.x, ay=u.y-c.y; const ad=Math.hypot(ax,ay)||1; ax/=ad; ay/=ad;
  if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,def.neonColor||'#50e6ff');
  for(let L=(N.panicBlink||5)*TILE; L>=2*TILE; L-=TILE*0.5){
    const wx=u.x+ax*L, wy=u.y+ay*L, tx=(wx/TILE)|0, ty=(wy/TILE)|0;
    if(tx>0&&ty>0&&tx<state.W-1&&ty<state.H-1 && !(state.blocked && state.blocked[ty*state.W+tx])){
      u.x=wx; u.y=wy; u._dash=null; u._hopWait=(N.hopGap||0.06); u._lastMoveT=state.time;
      if(typeof spawnRing==='function' && !window._rbReplaying) spawnRing(u.x,u.y,'#bffcff');
      return;
    }
  }
}

// is the straight glide line (x0,y0)→(x1,y1) free of blocked tiles? Sampled every ~0.6 tile so a short hop
// can't pass THROUGH a wall (the bug: tryHop only checked the endpoint, so the ninja glided into structures).
function pathClear(state, x0,y0, x1,y1){
  const B=state.blocked; if(!B) return true;
  const W=state.W, H=state.H, TS=TILE;
  const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy), steps=Math.max(1, Math.ceil(d/(TS*0.6)));
  for(let i=1;i<=steps;i++){
    const t=i/steps, tx=((x0+dx*t)/TS)|0, ty=((y0+dy*t)/TS)|0;
    if(tx<0||ty<0||tx>=W||ty>=H || B[ty*W+tx]) return false;
  }
  return true;
}

// unwedge: smoke-blink the ninja to the nearest OPEN ground, then reset to a fresh approach. Fired by the
// stuck watchdog. Pass 1 prefers a tile with elbow room; pass 2 accepts any passable tile; last resort aims
// at the map interior — so it can NEVER no-op and leave the ninja wedged.
function ninjaUnstick(state, u, def){
  const W=state.W, H=state.H, B=state.blocked, TS=TILE;
  const cx=(u.x/TS)|0, cy=(u.y/TS)|0;
  const open =(tx,ty)=> tx>=1&&ty>=1&&tx<W-1&&ty<H-1 && !(B && B[ty*W+tx]);
  const roomy=(tx,ty)=> open(tx,ty) && open(tx-1,ty)&&open(tx+1,ty)&&open(tx,ty-1)&&open(tx,ty+1);
  let best=null, bd=1e9;
  for(const test of [roomy, open]){
    for(let r=1;r<=16 && !best;r++){
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;            // only the current ring
        const tx=cx+dx, ty=cy+dy;
        if(!test(tx,ty)) continue;
        const d=dx*dx+dy*dy; if(d<bd){ bd=d; best={ x:tx*TS+TS/2, y:ty*TS+TS/2 }; }
      }
    }
    if(best) break;
  }
  if(!best) best={ x:(W>>1)*TS+TS/2, y:(H>>1)*TS+TS/2 };                   // last resort → map interior
  if(!window._rbReplaying){ if(typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff'); if(typeof spawnRing==='function') spawnRing(u.x,u.y,'#bffcff'); }
  u.x=best.x; u.y=best.y;
  if(!window._rbReplaying && typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff');
  u._dash=null; u._hopWait=0; u._ninjaState='approach'; u._ninjaTgt=null;
  u._ninjaHidden=false; u._untargetable=false; u._lastMoveT=state.time;   // fresh open spot → watchdog reset
}

// CORNERED BREAK-OUT: a very fast smoke-dash straight THROUGH the shooter cluster to open ground. Units
// don't block movement (only terrain does), so the ninja slips between them as a smoke streak; it's cloaked +
// untargetable for the dash so it can't be killed mid-escape. Drives the _dash glide (the in-flight block runs
// it at escapeSpeed and, on arrival, drops it into HIDE). Falls back to a teleport if no clear lane exists.
function startNinjaEscape(state, u, N, def){
  const TS=TILE;
  // head FROM the ninja THROUGH the shooter centroid (so the dash passes BETWEEN the units) to open ground
  // beyond; fall back to the map interior if there are somehow no shooters.
  const c = (typeof shooterCentroid==='function') ? shooterCentroid(state, u, (N.shooterR||5.5)*TS*2.4) : null;
  let dx = c ? c.x-u.x : state.W*TS*0.5-u.x, dy = c ? c.y-u.y : state.H*TS*0.5-u.y;
  if(Math.hypot(dx,dy)<1){ dx=state.W*TS*0.5-u.x; dy=state.H*TS*0.5-u.y; }
  const dd=Math.hypot(dx,dy)||1; dx/=dd; dy/=dd;
  // farthest TERRAIN-clear point along the ray, up to escapeDist — lands beyond the cluster in open space
  const maxD=(N.escapeDist||11)*TS; let dest=null;
  for(let L=maxD; L>=2.5*TS; L-=TS*0.5){
    const wx=u.x+dx*L, wy=u.y+dy*L, tx=(wx/TS)|0, ty=(wy/TS)|0;
    if(tx>1&&ty>1&&tx<state.W-1&&ty<state.H-1 && !(state.blocked&&state.blocked[ty*state.W+tx]) && pathClear(state,u.x,u.y,wx,wy)){ dest={x:wx,y:wy}; break; }
  }
  if(!dest){ ninjaUnstick(state, u, def); return; }                 // no clear lane → guaranteed teleport-out
  u._ninjaState='escape'; u._escaping=true; u._escSmokeT=0;
  u._ninjaHidden=true; u._untargetable=true;                        // becomes smoke — can't be killed mid-escape
  u._dash={x:dest.x,y:dest.y}; u._dashStartT=state.time; u._dashPrevD=null; u._hopWait=0; u._lastMoveT=state.time;
  if(!window._rbReplaying){
    if(typeof spawnSmoke==='function') spawnSmoke(u.x,u.y,def.neonColor||'#50e6ff');
    if(typeof spawnRing==='function')  spawnRing(u.x,u.y,'#bffcff');
    if(typeof bossTaunt==='function')  bossTaunt(state,u,'flee');   // a dramatic break-out line
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
    // (EX-TERMINATOR death cutscene is gated earlier, at the top of checkWinLose — it fires for quest AND
    // villain maps before any victory routes, then the natural re-check after it closes lands here.)
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
  // Arc-3 recruit beat: out-dueling A&O's Founder-Mech test pilot at Ep XV wins over Pedro "Rust".
  // He DEPLOYS as your hero from XV.5 onward via those maps' cfg.heroes (idiomatic first-appearance,
  // like Nino on Ep VIII) + the normal hero carryover thereafter — captureHeroes() rebuilds carryover
  // from on-field heroes at victory, so we can't just push him here; this is the defection toast only.
  // NB: scaleCfg stores cfg.villain as an ARRAY (map.js) — read the id through the list form.
  if(kind==='win' && typeof toast==='function' && !window._rbReplaying){
    const vl = state.cfg && state.cfg.villain;
    const vids = (Array.isArray(vl) ? vl : (vl ? [vl] : [])).map(v=>v && v.id);
    if(vids.includes('rust')) toast('🦾 Pedro "Rust" lays down his arms — the foreman is with you now.');
  }
  // T2-7: the FINALE boss (REX) ends the war on the spot — no extraction loop, straight to the
  // victory flow, where onVictory's finale routing shows the IPO.
  if(state.cfg && state.cfg.finale){
    if(typeof markVillainCleared==='function') markVillainCleared(typeof mapIndex==='number'?mapIndex:0);
    state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory(); return;
  }
  if(state._skirmish){ state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory(); return; }   // T3-2
  // CRASH CHAIN (Ep 15.5): instead of extraction→HUB, the evac bomber is shot down and the next mission
  // (XVI) loads DIRECTLY through the Hades-style fall cinematic (hub.js beginCrashChain). Solo path.
  if(state.cfg && state.cfg.crashChainTo && netRole==='solo' && typeof beginCrashChain==='function'){ beginCrashChain(state); return; }
  if(netRole==='solo' && typeof beginExtractionPhase==='function'){ beginExtractionPhase(state); return; }
  if(netRole==='host' && typeof window!=='undefined' && window.MP_SESSION && MP_SESSION.mode==='campaign' && typeof coopCampaignWin==='function'){ coopCampaignWin(state); return; }   // Ep VII → finale; else → H.U.B.
  state.over=true; state._outcome='win'; if(!window.USE_ROLLBACK && typeof onVictory==='function') onVictory();
}

// EX-TERMINATOR death cutscene: with the boss down, play his death lines (ending on "I'll be back")
// BEFORE routing the win — startFlashCutscene's onEnd resumes bossOutcome('win') once the lines close, so
// the sim stays frozen on the cutscene meanwhile (main.js). Solo only (co-op keeps the toast flow); one-shot
// via _bossDeathCsDone. Returns true when it takes over the win this tick.
function tryBossDeathCutscene(state){
  if(window._rbReplaying) return false;
  if(typeof netRole!=='undefined' && netRole!=='solo') return false;
  if(typeof startFlashCutscene!=='function') return false;
  const vl=state.cfg && state.cfg.villain;
  const vids=(Array.isArray(vl)?vl:(vl?[vl]:[])).map(v=>v&&v.id);
  let name=null;
  if(vids.includes('ex_terminator')) name='EXTERM_DEATH_1';
  else if(vids.includes('ex_terminator_mk2')) name='EXTERM_DEATH_2';
  if(!name) return false;
  const lines=(typeof window!=='undefined') && window[name];
  if(!lines || !lines.length) return false;
  // the dead boss can't be framed — focus a LIVE player unit (prefer a hero, e.g. Rust on Ep XVI)
  const focus = state.entities.find(e=>e.owner==='player'&&!e.dead&&e.kind==='unit'&&e.hero)
             || state.entities.find(e=>e.owner==='player'&&!e.dead&&e.kind==='unit')
             || state.entities.find(e=>e.owner==='player'&&!e.dead);
  if(!focus) return false;
  state._bossDeathCsDone=true;
  startFlashCutscene(state, focus, lines);   // victory routes on the natural checkWinLose re-check after the cutscene closes
  if(state.flashCutscene) state.flashCutscene.manual=true;   // villain DEATH lines are click-to-advance even though we frame a player unit (the dead boss can't be framed)
  return true;
}

// EX-TERMINATOR FLEE: instead of dying, the beaten boss is AIRLIFTED OUT by an A&O Buzzword Bomber while his
// death lines ("I'll be back") play. He stays on-field (alive + untargetable) so the cutscene can frame the
// extraction; on the cutscene's close he's marked escaped → the defeatVillain quest reads done → a normal
// (fled) WIN that advances the campaign. The bomber + his board-fade are presentation-only (bossExtractFrame,
// read by render.js off the cutscene clock). Solo plays the full cinematic; co-op / rollback finalize at once.
function beginBossExtract(state, boss){
  if(!boss || boss._extracting) return;
  boss._extracting=true; boss._untargetable=true; boss.guard=true;
  boss.hp=Math.max(1, boss.hp);                                   // stay alive (not <=0) so the cleanup loop won't re-kill him
  boss.autoTarget=null; boss.cmd=null; boss.vx=0; boss.vy=0; boss.path=null;
  boss._mechAct=null; boss._mechAirborne=false; boss._aoe=null;   // cancel any in-progress special
  boss._actState='idle'; boss._actStamp=state.time;              // stand in the arms-crossed idle (not frozen mid-punch) while he's extracted
  if(typeof awardVillainKillXp==='function') awardVillainKillXp(state, boss);   // the player DEFEATED him → pay the win XP now (the normal kill path is skipped)
  state._bossDeathCsDone=true;                                    // the death-cutscene gate must not also fire
  const name = (boss.villainId==='ex_terminator_mk2') ? 'EXTERM_DEATH_2' : 'EXTERM_DEATH_1';
  const lines = (typeof window!=='undefined') && window[name];
  const solo = (typeof netRole==='undefined' || netRole==='solo') && !window._rbReplaying;
  if(solo && lines && lines.length && typeof startFlashCutscene==='function'){
    const fromRight = boss.x < state.W*TILE*0.5;                  // enter from whichever side crosses the framed boss
    state.bossExtract = { id:boss.id, ex:boss.x, ey:boss.y, fromRight };
    startFlashCutscene(state, boss, lines, ()=>finalizeBossExtract(state, boss));   // focus the LIVE boss; onEnd finalizes the escape
    if(state.flashCutscene) state.flashCutscene._holdLast=true;                     // his final "I'll be back" stays on screen until the player clicks to skip
  } else {
    if(typeof toast==='function' && !window._rbReplaying) toast('🛩️ THE EX-TERMINATOR is airlifted out by an A&O bomber — "I\'ll be back."');
    finalizeBossExtract(state, boss);
  }
}
function finalizeBossExtract(state, boss){
  if(!boss) return;
  boss.escaped=true; boss.dead=true; boss._extracting=false;     // mirrors the ninja-flee end state
  state._villainEscaped=true; state.bossExtract=null;            // checkWinLose → defeatVillain done (escaped) → WIN
}
// Presentation frame for the extraction (read by render.js): the A&O bomber's world position + facing and the
// boss's board-fade, all computed from the cutscene clock so the bomber and his vanish stay locked to the lines.
function bossExtractFrame(state){
  const bx=state.bossExtract; if(!bx) return null;
  const TS=TILE, ex=bx.ex, ey=bx.ey, face=bx.fromRight?-1:1;
  const aprP=bx.aprP, boardT=bx.boardT||0;   // bx.aprP / bx.boardT advance in updateFlashCutscene (monotonic, line-paced)
  // hidden until the FIRST line begins (aprP stays null through the opening hold)
  if(aprP==null) return { bomberX:ex, bomberY:ey, bomberFace:face, bomberVisible:false, bossFade:0 };
  const hoverX=ex, hoverY=ey-TS*2.3, highY=ey-TS*8, exitY=ey-TS*11;
  const offIn = bx.fromRight ? ex+TS*16 : ex-TS*16;
  const offOut= bx.fromRight ? ex-TS*18 : ex+TS*18;
  const ease=(p)=> p<=0?0 : p>=1?1 : p*p*(3-2*p);
  const e=ease(aprP);
  // ONE bomber: a single continuous approach across the dialogue (offIn → hover), arriving by the last line.
  let X=offIn+(hoverX-offIn)*e, Y=highY+(hoverY-highY)*e, vis=true, fade=0;
  if(boardT>0){                                                 // bomber has ARRIVED over him on the last line:
    X=hoverX; Y=hoverY;
    fade=Math.min(1, boardT/0.6);                               //   he vanishes QUICKLY (boards) the moment it reaches him
    if(boardT>1.6){ const p=ease((boardT-1.6)/2.2); X=hoverX+(offOut-hoverX)*p; Y=hoverY+(exitY-hoverY)*p; }   //   a beat later (he's aboard) the bomber lifts off + exits
    if(boardT>4.0) vis=false;
  }
  return { bomberX:X, bomberY:Y, bomberFace:face, bomberVisible:vis, bossFade: fade<0?0:(fade>1?1:fade) };
}

// SQUAD-WIDE BONUS XP for KILLING a villain (any villain). Every SURVIVING player career unit (combat
// veterans + healers) gets def.killXp — a big lump that levels the survivors, so beating a boss visibly
// makes veterans. Escalates per villain along the campaign (tougher/later boss → more XP). Fired from the
// core.js cleanup the tick the boss reaches 0 HP — a FLED ninja (escaped, hp>0) is skipped, so only a real
// KILL pays out. XP is deterministic sim state (replays); only the toast is cosmetic-guarded.
function awardVillainKillXp(state, dead){
  const def = dead && VILLAINS[dead.villainId]; if(!def) return;
  const amt = def.killXp||0; if(!(amt>0) || typeof awardBonusXp!=='function') return;
  let n=0;
  for(const o of state.entities){
    if(o.dead || o.storedIn || o.owner!=='player' || o.kind!=='unit') continue;
    const before=o.xp||0;
    awardBonusXp(o, amt, state);                       // no-ops on workers / non-hero healers (no career)
    if((o.xp||0) > before) n++;                        // count only units that actually leveled-eligible gained
  }
  if(n && typeof toast==='function' && !window._rbReplaying) toast('🎖️ '+def.name+' DOWN — your '+n+' veterans each earn '+amt+' XP.');
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
  if(m && m.isVillain){ markVillainCleared(finishedIdx);
    if(m.finale) return lastEpisodeIndex()+1;   // T2-7: the finale is past the linear track
    return Math.max(0, Math.min(m.returnTo!=null?m.returnTo:finishedIdx, MAPS.length-1)); }
  let n=finishedIdx+1; while(MAPS[n] && MAPS[n].isVillain) n++;   // skip appended villain entries
  // T2-7/T4-1: finishing the LAST linear episode advances PAST it (lastEp+1) — the post-campaign
  // marker that unlocks The Wake (HUB.rebornUnlockIdx) and routes the hub dispatch to the finale
  // boss (hubNextDeployIndex below). Mid-campaign indices are unchanged.
  return Math.min(n, lastEpisodeIndex()+1);
}

// At dispatch: if an UNCLEARED villain is gated to be played right before episode `nextIdx`
// (returnTo===nextIdx), return its index so the player fights it first; else -1. This is how the
// villain interrupts the linear sequence without ever sitting in CAMPAIGN.nextMapIndex.
function villainGateBefore(nextIdx){
  if(typeof MAPS==='undefined') return -1;
  for(let i=0;i<MAPS.length;i++){ const v=MAPS[i]; if(v && v.isVillain && v.returnTo===nextIdx && !villainIsCleared(i)) return i; }
  return -1;
}

// T2-7: the FINALE villain (REX) — the campaign ends on its best fight. After the last linear
// episode the player routes here instead of the IPO; beating it (or it being already cleared)
// unlocks the IPO. Returns the first uncleared finale villain's index, else -1.
function finaleVillainIndex(){
  if(typeof MAPS==='undefined') return -1;
  for(let i=0;i<MAPS.length;i++){ const v=MAPS[i]; if(v && v.isVillain && v.finale && !villainIsCleared(i)) return i; }
  return -1;
}

// The ACTUAL next deployment from the H.U.B.: the linear next episode, an uncleared gate villain
// that interrupts it, or — past the last episode — the FINALE boss (replaying the last episode if
// everything is already cleared). One source of truth for the MDC brief + dispatch (T2-7).
function hubNextDeployIndex(){
  const lastEp=lastEpisodeIndex();
  const raw=(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.nextMapIndex!=null)?CAMPAIGN.nextMapIndex:0;
  let idx=Math.max(0, Math.min(raw, MAPS.length-1));
  if(idx>lastEp || (MAPS[idx] && MAPS[idx].isVillain)){
    const fv=finaleVillainIndex();
    return fv>=0 ? fv : lastEp;
  }
  const g=villainGateBefore(idx);
  return g>=0 ? g : idx;
}

/* expose for core.js / hub.js / ui.js / map.js (classic-script shared scope) and the console. */
if(typeof window!=='undefined'){
  window.VILLAINS=VILLAINS; window.spawnVillain=spawnVillain; window.villainDeferredSpawn=villainDeferredSpawn; window.villainSnapOpen=villainSnapOpen; window.updateVillain=updateVillain; window.updateNinja=updateNinja; window.ninjaUnstick=ninjaUnstick; window.startNinjaEscape=startNinjaEscape;
  window.mechUpkeep=mechUpkeep; window.stepMech=stepMech; window.bossAreaDamage=bossAreaDamage;
  window.bossTaunt=bossTaunt; window.nearestMapEdge=nearestMapEdge;
  window.villainCheckWinLose=villainCheckWinLose; window.bossOutcome=bossOutcome; window.bossDefeatChecks=bossDefeatChecks; window.awardVillainKillXp=awardVillainKillXp;
  window.beginBossExtract=beginBossExtract; window.finalizeBossExtract=finalizeBossExtract; window.bossExtractFrame=bossExtractFrame;
  window.villainIsCleared=villainIsCleared; window.markVillainCleared=markVillainCleared;
  window.villainNextLinear=villainNextLinear; window.villainGateBefore=villainGateBefore; window.lastEpisodeIndex=lastEpisodeIndex;
  window.finaleVillainIndex=finaleVillainIndex; window.hubNextDeployIndex=hubNextDeployIndex;
}
