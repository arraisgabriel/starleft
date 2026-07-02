/* js/net/sync.js — CLASSIC. Host-authoritative state-sync engine.
   The host alone runs update(G,dt); it ships the dynamic world to clients. The client runs ZERO
   sim — it regenerates terrain locally from mapIndex (deterministic), applies snapshots, derives
   fog itself (it has every unit's position), and renders. Lockstep is impossible here because
   enemyAI/runSalt use the non-seeded RNG — so state-sync it is.

   Two wire forms (both via the MP transport facade):
     • FULL  ('mpfull', chunked) — serializeForNet() minus the terrain the client regenerates. Sent
       on join + as a ~0.2 Hz keyframe + on a desync. Reuses save.js's serialize/resolveRefs.
     • SNAP  ('mpsnap', ~12 Hz)  — a compact per-entity merge of the hot fields (pos/hp/state/…),
       plus the two economy pools + a couple of scalars. Static DEF-derived stats are looked up
       client-side, never sent. */
window.NET = window.NET || {};
(function(){
  const NET = window.NET;
  NET.tick = 0;            // host authoritative tick counter (stamped into snapshots)
  NET.lastFull = -1;       // client: tick of the last full snapshot applied
  NET.DELTA_HZ = 15;       // compact-snapshot rate (each snap is a full entity set, so it self-heals)
  NET.SMOOTH_RATE = 18;    // client: legacy ease rate (fallback only; Phase 1 uses two-snapshot interpolation)
  NET._sAcc = 0;
  // ---- Phase 1: entity (two-snapshot) interpolation timeline (client-local receive instants, ms) ----
  NET._snapPrevT = null; NET._snapLastT = null;
  // ---- Phase 2: host snapshot send-rate hardening ----
  NET.SEND_HIWATER = 64*1024;     // skip an mpsnap when the data-channel send queue exceeds this (snaps self-heal, so safe)
  NET.SEND_MIN_INTERVAL = 0.4;    // …but never let the send gap exceed this (~2.5 Hz floor) or the client watchdog false-fires
  NET._sinceSend = 0;
  // ---- Phase 3: client-side prediction of own MOVE orders (cosmetic; host stays authoritative) ----
  NET.PREDICT = true;
  NET.PREDICT_TTL = 1.2;          // seconds before an un-acked prediction is abandoned (rejected/lost command safety)
  NET._cmdSeq = 0;                // client: per-command sequence; host echoes the highest applied seq as snap.ack
  NET._cmdAck = 0;                // host: highest command seq processed
  // ---- Phase 4: bandwidth. 4a (eco omission) is always on. 4b/4c entity-delta is gated OFF until co-op-tested. ----
  NET.DELTA = false;
  NET._baseline = new Map();      // host: last packed entity set (delta baseline)
  NET._lastEcoStr = null;         // host: last-sent eco signature (4a)
  NET._lastQuestStr = null;       // host: last-sent quest-progress signature (change-tracked like eco)
  NET._loreSent = new Map();      // host: entityId -> last-sent lore signature (dossier identity ships ONCE per change, off the 12 Hz hot path)
  // ---- Robustness: desync guards + connection reliability ----
  NET._lastAppliedTick = -1;      // client: highest snap.t applied (drop out-of-order / stale snaps)
  NET.CHUNK_TTL = 10000;          // ms: discard a stalled full-snapshot reassembly buffer so a lost chunk can't wedge it forever
  // ---- client host-liveness watchdog: the host streams snapshots ~15Hz; a long gap = crash/disconnect ----
  NET.STALL_MS = 3500;     // no snapshot this long → "connection unstable" hint (still recoverable)
  NET.LOST_MS  = 8000;     // no snapshot this long → host is gone, end the session
  NET.lastRecvAt = 0; NET._stalled = false; NET._hostGone = false;
  function _now(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
  NET.markRecv = function(){ NET.lastRecvAt = _now();
    if(NET._stalled){ NET._stalled = false; if(typeof NET.onReconnected==='function') NET.onReconnected(); } };
  NET.touchWatchdog  = function(){ NET.lastRecvAt = _now(); };                 // grace (e.g. on tab re-focus)
  NET.resetWatchdog  = function(){ NET.lastRecvAt = _now(); NET._stalled = false; NET._hostGone = false; };
  NET.peerCtrl = {};       // host: peerId -> ctrl ('p2'…)
  NET.ctrlPeer = {};       // host: ctrl -> peerId
  NET._chunk = {};         // client: full-snapshot chunk reassembly buffers

  /* ---------------- FULL snapshot (terrain stripped — client regenerates it) ---------------- */
  // serializeGame() already drops cfg/visible/feat/waterDepth and re-adds variant/blocked/explored.
  // For the wire we ALSO drop everything the client rebuilds from mapIndex via newMap().
  const NET_DROP = ['tiles','biome','variant','megaSprites','features','blocked','explored','selection','groups'];
  NET.serializeForNet = function(){
    const s = serializeGame();                 // proven pipeline: entities (refs→{$ref}), eco, scalars, meta
    for(const k of NET_DROP) delete s[k];
    s.netTick = NET.tick;
    return s;
  };
  NET.applyFullSnapshot = function(s){
    // Race guard: 'mpfull' and 'mpstart' are separate Trystero actions with no cross-action ordering.
    // If the full snapshot arrives before the client has built its terrain (G null), stash and replay.
    if(!G){ NET._pendingFull = s; return; }
    // HUB transition guard: a full HUB snapshot can beat the explicit 'mphub'
    // action while the client still has the combat terrain loaded. Rebuild the
    // host-owned HUB locally before overlaying host dynamic state.
    if(s.hubMap && !G.hub && typeof newHubMap==='function'){
      if(s.campaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(s.campaign);
      G = newHubMap();
      if(typeof syncHud==='function') syncHud();
      if(typeof clampCam==='function') clampCam(G);
    }
    // G already came from newMap(mapIndex) on the client, so terrain is correct. Overlay dynamic state:
    const SCALAR = ['eco','players','time','waveCount','graceTime','nextId','runSalt','over',
                    '_outcome','_fledBoss','_villainSpawned','_villainEscaped',   // boss-map outcome → client end screen
                    '_pvp','_pvpWinner',                                          // duel verdict (T4-5)
                    'quests',                                                     // quest progress → client tracker (mid-match joiners get full state here)
                    'scanReveals',                                                // Market Research terrain patches (re-applied below)
                    'enemySpawnTimer','enemyWaveTimer','enemyFortifyTimer','_recalibratedFor','_coopOrigins'];
    for(const k of SCALAR){ if(s[k]!==undefined) G[k]=s[k]; }
    if(s.campaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(s.campaign);
    G.entities = s.entities.map(e=>Object.assign({}, e));
    const byId = new Map(G.entities.map(e=>[e.id,e]));
    G.entities.forEach(e=>resolveRefs(e, byId));            // re-link cmd.target / autoTarget / … (save.js)
    G.entities.forEach(e=>{ if(e.kind==='building' && !e.dead) markBuilding(G,e,true); });   // re-stamp blocked
    if(typeof markFundingNode==='function') G.entities.forEach(e=>{ if(e.type==='goldmine'&&!e.dead) markFundingNode(G,e); });
    G.selection=[]; G.groups={};                            // selection/groups are LOCAL per client
    if(typeof recomputeSupply==='function') recomputeSupply(G);
    if(typeof computeFog==='function') computeFog(G);
    // mid-match joiner: stamp the scan's explored patches (ghost buildings already arrive via o.es)
    if(G.scanReveals && typeof applyScanReveal==='function'){
      G.scanReveals.forEach(p=>applyScanReveal(G,p.x,p.y,p.r));
      G._srApplied=G.scanReveals.length;
    }
    NET.lastFull = s.netTick||0;
    NET._lastAppliedTick = s.netTick||0;   // re-baseline the out-of-order guard (new match / desync resync)
  };
  // called by mp.js right after the client builds terrain (newMap), to replay a snapshot that raced ahead
  NET.flushPendingFull = function(){
    if(NET._pendingFull && G){ const s=NET._pendingFull; NET._pendingFull=null; NET.applyFullSnapshot(s);
      if(typeof NET.onFullApplied==='function') NET.onFullApplied(); }
  };

  /* ---------------- compact per-entity snapshot (the 12 Hz hot path) ---------------- */
  // Dossier identity (lore) is immutable-once-minted and append-only per level; ship it ONCE per change
  // (seed|version|event-count signature) instead of on every snap. The FULL snapshot already carries lore
  // (serializeEntity denylist), so this covers the units that spawn/level AFTER a client joined — trained
  // units and redeployed p2 veterans — which otherwise stay nameless/dossier-less forever on the client.
  function loreSig(e){ return e.lore ? (e.lore.seed+'|'+((e.lore.v|0)||1)+'|'+(e.lore.events?e.lore.events.length:0)+(e.lore.fixed?'|f':'')) : ''; }
  function loreDirty(e){ if(!e.lore) return false; const sig=loreSig(e), prev=NET._loreSent.get(e.id); if(sig!==prev){ NET._loreSent.set(e.id,sig); return true; } return false; }
  function packEnt(e){
    if(e.type==='goldmine'){
      return { id:e.id, gm:1, x:e.x, y:e.y, amt:Math.round(e.amount), a0:e.amount0, ftx:e.ftx, fty:e.fty, r:e.r };
    }
    const o = { id:e.id, t:e.type, o:e.owner, k:e.kind, c:e.ctrl,
                x:Math.round(e.x*10)/10, y:Math.round(e.y*10)/10, hp:Math.round(e.hp), mh:e.maxHp };
    if(e.kind==='unit'){
      if(e.state) o.s=e.state;
      if(e.state==='move'||e.state==='gather') o.mv=1;   // authoritative "locomoting" hint so the client keeps the walk cycle running through the position-ease
      if(e._actState) o.as=e._actState;
      if(e._actState==='attack' && e._actStamp!=null) o.ast=Math.round(e._actStamp*1000)/1000;  // strike time → drives the attack windup frame
      if(e._face) o.f=e._face;
      if(e.dir) o.d=Math.round(e.dir*100)/100;
      if(e.carrying) o.cr=e.carrying;
      if(e.stars) o.st=e.stars;
      if(e.spriteType) o.sp=e.spriteType;
      if(e.heroId) o.hid=e.heroId;                                   // identity: heroId (immutable; load-bearing for cue speaker resolution + p2 hero pools)
      if(loreDirty(e)) o.lo={ s:e.lore.seed, v:e.lore.v, e:e.lore.events.slice(), f:e.lore.fixed||undefined, xp:e.xp||0 };   // dossier identity — client ADOPTS, never mints (mint uses runSalt^id → would mismatch)
      if(e.air) o.air=1;
      if(e.hero) o.h=1;
      if(e.sieged) o.sg=1;
      if(e.captive) o.cap=1;
      if(e.sprinting) o.spr=1;
      if(e._vip) o.vip=1;   // escort-objective VIP (T2-1) — client draws the gold marker from it
      if(e.storedIn) o.si=e.storedIn;
      if(e.cmd && e.cmd.target && !e.cmd.target.dead) o.tg=e.cmd.target.id;   // chase/attack render
      if(e.shootFx && e.shootFx.t>0){ o.sf=1; o.sfx=Math.round(e.shootFx.x*10)/10; o.sfy=Math.round(e.shootFx.y*10)/10; }  // ranged shot endpoint while LIVE → client rebuilds the laser-bolt transient (start derived from synced type/pos/_face). t>0 gate: the expired shootFx object lingers on the host, so without it o.sf would fire forever → client re-loops the beam.
      // MADOSIS (sanity): client renders the bars / feral aura / rescue cue purely from these (it never simulates)
      if(e.madosis) o.mad=Math.round(e.madosis);
      if(typeof madReliefActive==='function'){ const _mr=madReliefActive(e); if(_mr>0) o.mrl=Math.round(_mr); }   // TEMPORARY field relief (host's current decayed value) → client subtracts for the bar
      if(e.sanityThreshold) o.sth=Math.round(e.sanityThreshold);
      if(e.scarred) o.scr=1;
      if(e.reborn) o.rb=1;   // Wake-resurrected → client picks the drained-grey 'reborn' sprite skin (render-only; missing key on a legacy snap = not reborn)
      if(e.madDog) o.md=1;
      if(e.subdued) o.sub=1;
      if(e.calmStage) o.cs=e.calmStage;
      if(e._rescue) o.rsc=1;
      if(e.madEpisode) o.ep = e.madEpisode.phase==='feral'?3 : e.madEpisode.phase==='defiance'?2 : 1;
      // CYBERWARE: combat-relevant chrome (effects are host-authoritative; packed for client prediction/parity)
      if(e.chromeArmor) o.car=Math.round(e.chromeArmor*100)/100;
      if(e.chromePierce) o.cpi=1;
      if(e.chromeSplash){ o.csp=e.chromeSplash; o.cspr=Math.round((e.chromeSplashR||1.3)*100)/100; }
      // CYBERWARE optics/mobility muls → so a co-op client's local fog reveal + movement match the host (Kiroshi sight/range, speed chrome)
      if(e.chromeSightMul && e.chromeSightMul!==1) o.csi=Math.round(e.chromeSightMul*100)/100;
      if(e.chromeRangeMul && e.chromeRangeMul!==1) o.crn=Math.round(e.chromeRangeMul*100)/100;
      if(e.chromeSpeedMul && e.chromeSpeedMul!==1) o.csm=Math.round(e.chromeSpeedMul*100)/100;
      // HERO SIGNATURE render flags (Nino cloak dim/rim; Rust thruster-leap arc) — render-only on clients
      if(e._cloaked) o.clk=1;
      if(e._jumpZ) o.jz=Math.round(e._jumpZ);
      // VILLAIN (boss): client renders the giant size, glow and boss HP bar purely from these — it
      // never simulates the boss. villainId keys the static VILLAINS table (present on every client),
      // so colors/abilities/phases derive locally; only these few fields cross the wire.
      if(e.villain){ o.vil=1; o.vid=e.villainId; o.vn=e.villainName; o.bp=e.bossPhase||1; o.bsc=e.bossScale||1; o.nid=e.neonId; if(e._ninjaHidden) o.nh=1; if(e._jumpZ) o.jz=Math.round(e._jumpZ); if(e._exposed) o.oh=1; if(e._hunter){ o.hu=1; o.pf=Math.round((e._poolFrac||0)*15); } }   // nh: ninja vanish dim; jz: REX leap height; oh: EXPOSED/overheat window; hu/pf: Ep XVI hunter + hidden-pool fraction (damage-stress rim)
    } else if(e.kind==='echo'){
      o.fac=e.facet;   // MADOSIS rescue beacon (x/y/hp already in the base packet); facet drives its color
      if(e.dogId!=null) o.did=e.dogId;   // which mad dog this memory belongs to (tether/arrow grouping)
      if(e.reached) o.rc=1;              // recovered — so client arrows/visuals stop pointing at it
    } else if(e.kind==='corpse'){        // Ep XVI dead body — client builds the gory corpse sprite from these
      o.src=e.src; o.mid=e.memId;
      if(e.reveal) o.rv=1; if(e.gore) o.gr=e.gore; if(e.reached) o.rc=1;
    } else if(e.kind==='wreck'){         // Ep XVI crashed bomber half — client draws the wreck + smoke
      o.hf=e.half;
    } else if(e.kind==='building'){
      o.tx=e.tx; o.ty=e.ty; o.w=e.w; o.h=e.h;
      if(e.constructing){ o.cn=1; o.bp=e.buildProg; o.bt=e.buildTime; }
      if(e.prodQueue && e.prodQueue.length){ o.pq=e.prodQueue.slice(); o.pt=e.prodTime; o.ptt=e.prodTotal; }
      if(e.abandoned) o.ab=1;
      if(e.upgFirerate) o.uf=1;                  // per-turret upgrades — client needs them for its command card
      if(e.upgDamage) o.ud=1;
      if(e.scanTotal>0){ o.scp=Math.round(e.scanProg*10)/10; o.sct=e.scanTotal; }   // Market Research survey → client button/%
      if(e.storedUnits && e.storedUnits.length) o.su=e.storedUnits.slice();
      if(e._everSeen) o.es=1;
      if(e.rally) o.rl={x:e.rally.x,y:e.rally.y};
      if(e.shootFx && e.shootFx.t>0){ o.sf=1; o.sfx=Math.round(e.shootFx.x*10)/10; o.sfy=Math.round(e.shootFx.y*10)/10; }  // turret/HQ shot endpoint while LIVE (t>0 gate: stops the lingering expired shootFx from re-firing the client beam forever)
    }
    return o;
  }
  function unpackInto(e, o, snapTime){
    if(snapTime==null) snapTime = (typeof G!=='undefined' && G && G.time) || 0;
    // stamp the host id on entities created from a compact snap — without it a mid-match spawn
    // never matches `incoming.get(e.id)` again and gets spliced+recreated every snapshot
    // (breaking transient preservation, selection, and the removal=death FX hook above).
    if(e.id==null && o.id!=null) e.id=o.id;
    if(o.gm){ e.type='goldmine'; e.owner=null; e.x=o.x; e.y=o.y; e.amount=o.amt; e.amount0=o.a0;
              e.ftx=o.ftx; e.fty=o.fty; e.r=o.r; e.dead=false; return; }
    // T0-4 client path: floating numbers derive from snapshot hp-deltas (the client never runs damage()).
    // Known entity only (first sighting has no delta); constructing buildings "heal" as they raise → skip.
    const _oldHp = e.hp, _oldStars = e.stars||0;
    if(_oldHp!=null && Number.isFinite(_oldHp) && o.hp!=null && typeof spawnFloater==='function' && o.k!=='echo'){
      const dHp = o.hp - _oldHp;
      if(dHp <= -1) spawnFloater(G, e, -dHp, o.hp<=0?'crit':'dmg');
      // a level-up's applyVetHp bumps maxHp→hp; that's a promotion, not a heal — don't paint a green +N over the arrow
      else if(dHp >= 1 && o.k==='unit' && (o.st||0) <= _oldStars) spawnFloater(G, e, dHp, 'heal');
    }
    const d=DEF[o.t]||{};
    const _prevOwner=e.owner;
    e.type=o.t; e.owner=o.o; e.kind=o.k; e.ctrl=o.c; e.hp=o.hp; e.maxHp=o.mh; e.dead=false;
    if(o.k==='unit'){
      e._cloaked=!!o.clk;                                            // NINO cloak (render dim+rim)
      if(_prevOwner==='enemy' && e.owner==='player') e._convFlashT=1.0;   // BIBA mind-control: client fires the red flash on the enemy→player flip
      // Store the snapshot position as a SMOOTHING TARGET (_sx/_sy); clientTick eases the rendered
      // e.x/e.y toward it so units glide at render rate instead of teleporting at the 15 Hz snap rate.
      // Robustness: reject a corrupt position (NaN/Inf) so a bad packet can't warp the unit off-map; keep
      // the prior position instead. A corrupt first-sighting (no prior) parks at origin rather than NaN.
      if(Number.isFinite(o.x) && Number.isFinite(o.y)){
        if(e.x==null){ e.x=o.x; e.y=o.y; }        // first sighting → snap into place
        // Phase 1 entity interpolation: keep the PREVIOUS authoritative target as _sx0/_sy0 and the new one
        // as _sx/_sy; clientTick interpolates between them over the inter-snapshot interval (~1 snap behind).
        if(e._sx==null){ e._sx0=o.x; e._sy0=o.y; } else { e._sx0=e._sx; e._sy0=e._sy; }
        e._sx=o.x; e._sy=o.y;
      } else if(e.x==null){ e.x=e.y=e._sx=e._sy=e._sx0=e._sy0=0; }
      // static stats come from DEF — the client never simulates, it only renders/picks
      // static stats from DEF, then apply any CYBERWARE optics/mobility muls (o.csi/crn/csm; absent → ×1, self-correcting if chrome is removed)
      e.r=d.r; e.sight=d.sight*(o.csi||1); e.air=!!o.air; e.speed=d.speed*(o.csm||1); e.range=d.range*(o.crn||1); e.dmg=d.dmg;
      e.state=o.s||'idle'; e._actState=o.as||null; e._face=o.f||e._face||1; e.dir=o.d||0;
      e._netMoving=!!o.mv;                               // host-authoritative locomotion flag (see render moving-check)
      // _actStamp is the HOST's state.time at the strike; rebase it into the client's OWN clock so the
      // attack-windup frame (render: t = state.time - _actStamp) stays correct despite client/host G.time
      // drift. Guard on _lastAst so the same swing isn't re-based every snapshot — only on a fresh strike.
      if(o.ast!=null){ if(o.ast!==e._lastAst){ e._actStamp=(G.time||0)-(snapTime-o.ast); e._lastAst=o.ast; } }
      else e._lastAst=null;
      e.carrying=o.cr||0; e.stars=o.st||0; e.spriteType=o.sp||null;
      if((o.st||0) > _oldStars && typeof spawnLevelArrow==='function') spawnLevelArrow(G, e);   // client derives the level-up arrow from the star-delta (never runs promoteIfReady)
      // dossier identity (adopt-only): heroId + lore ride the compact snap once per change (legacy/absent = keep existing).
      // The client never MINTS lore (that would use its own runSalt/id-space → mismatched names); it only adopts the host's.
      if(o.hid) e.heroId=o.hid;
      if(o.lo){
        if(!e.lore) e.lore={ seed:o.lo.s, v:o.lo.v, events:(o.lo.e||[]).slice(), fixed:o.lo.f||undefined };
        else if((o.lo.e||[]).length > (e.lore.events||[]).length) e.lore.events=o.lo.e.slice();   // only GROW the service record (a stale packet can't truncate it)
        if(o.lo.xp!=null) e.xp=o.lo.xp;
      }
      e.hero=!!o.h; e.sieged=!!o.sg; e.captive=!!o.cap; e.sprinting=!!o.spr; e._vip=!!o.vip;
      if(o.si!=null) e.storedIn=o.si; else delete e.storedIn;
      e._tgtId = o.tg!=null ? o.tg : null;
      // ranged shot muzzle-flash: rebuild the transient so the laser-bolt render pass draws
      // it on the client (render decays .t locally at 1/60). Cosmetic only — never simulated.
      if(o.sf) e.shootFx = (e.shootFx && e.shootFx.t>0) ? e.shootFx : { x:(o.sfx!=null?o.sfx:e.x), y:(o.sfy!=null?o.sfy:e.y), t:SHOOTFX_LIFE };
      // MADOSIS (render-only on the client)
      e.madosis=o.mad||0; e.sanityThreshold=o.sth||0; e.scarred=!!o.scr; e.reborn=!!o.rb;   // reborn: render-only grey skin (drawUnit fac), no client sim
      e.chromeArmor=o.car||0; e.chromePierce=!!o.cpi; e.chromeSplash=o.csp||0; e.chromeSplashR=o.cspr||0;   // CYBERWARE combat fields (parity)
      e.madRelief=o.mrl||0; e.madReliefT=null;   // host already decayed o.mrl → madReliefActive carries it straight; madReliefT===null tells madGlobalTick to skip (no client sim)
      e.madDog=!!o.md; e.subdued=!!o.sub; e.calmStage=o.cs||0; e._rescue=!!o.rsc;
      e.madEpisode = o.ep ? { phase:(o.ep===3?'feral':o.ep===2?'defiance':'tremor'), t:0 } : null;
      // VILLAIN (render-only on the client) — bossScale MUST land here or unitDrawH draws a tiny boss
      e.villain=!!o.vil; e.villainId=o.vid||null; e.villainName=o.vn||null; e.bossPhase=o.bp||1; e.bossScale=o.bsc||1; e.neonId=o.nid||null;
      e._ninjaAI = e.villain && (typeof VILLAINS!=='undefined') && VILLAINS[e.villainId] && VILLAINS[e.villainId].aiKind==='ninja';   // enable the afterimage trail on the client (render-only)
      e._ninjaHidden = !!o.nh;
      e._jumpZ = o.jz||0;   // REX leap height (render-only on the client)
      e._exposed = !!o.oh;  // EXPOSED/overheat window (render-only on the client: bossbar pulse + overheat rim)
      e._hunter = !!o.hu; e._poolFrac = o.hu ? ((o.pf||0)/15) : 0;   // Ep XVI hunter damage-stress rim (render-only on the client)
    } else if(o.k==='echo'){
      e.x=o.x; e.y=o.y; e.facet=o.fac; e.r=12;       // MADOSIS rescue beacon (client render)
      e.dogId=(o.did!=null?o.did:null); e.reached=!!o.rc;
    } else if(o.k==='corpse'){                        // Ep XVI dead body (client render only — host harvests)
      e.x=o.x; e.y=o.y; e.src=o.src; e.memId=o.mid; e.reveal=!!o.rv; e.gore=o.gr||null; e.reached=!!o.rc; e.r=10; e.sight=0;
    } else if(o.k==='wreck'){                          // Ep XVI crashed bomber half (client render only)
      e.x=o.x; e.y=o.y; e.half=o.hf||'back'; e.r=14; e.sight=0;
    } else if(o.k==='building'){
      e.x=o.x; e.y=o.y;                          // buildings don't move → snap directly
      e.tx=o.tx; e.ty=o.ty; e.w=o.w; e.h=o.h; e.sight=d.sight; e.cd=e.cd||0;
      e.constructing=!!o.cn; e.buildProg=o.bp||0; e.buildTime=o.bt||d.build;
      e.prodQueue=o.pq||[]; e.prodTime=o.pt||0; e.prodTotal=o.ptt||0;
      e.storedUnits=o.su||[];
      e.abandoned=!!o.ab; e._everSeen=!!o.es; e.rally=o.rl||null;
      e.upgFirerate=!!o.uf; e.upgDamage=!!o.ud;
      e.scanProg=o.scp||0; e.scanTotal=o.sct||0;
      // turret/HQ muzzle-flash: host packs o.sf=1 (+ shot endpoint o.sfx/o.sfy). Rebuild the transient so
      // the shoot-FX render pass can draw the shot line on the client (render decays .t locally at 1/60).
      if(o.sf) e.shootFx = (e.shootFx && e.shootFx.t>0) ? e.shootFx : { x:(o.sfx!=null?o.sfx:e.x), y:(o.sfy!=null?o.sfy:e.y), t:SHOOTFX_LIFE };
    }
  }
  // Quest progress for the wire: QUANTIZED ints only (the reachAndHold float accumulator would
  // otherwise change every tick and defeat the change-tracking), packed compact like eco.
  function packQuests(){
    if(!G.quests || !(G.cfg && G.cfg.quests && G.cfg.quests.length)) return null;
    const qp={};
    for(const k in G.quests){ const q=G.quests[k];
      qp[k]={ c:q.cur|0, g:q.goal|0, d:q.done?1:0, f:q.failed?1:0 }; if(q.na) qp[k].n=1; }
    return qp;
  }
  function snapAttachQuests(snap, force){
    const qp=packQuests(); if(!qp) return;
    const qStr=JSON.stringify(qp);
    if(force || qStr!==NET._lastQuestStr || (NET.tick % NET.DELTA_HZ)===0){ snap.q=qp; NET._lastQuestStr=qStr; }
  }
  // Market Research reveal patches: explored is NOT in snapshots (clients own their fog), so the
  // scan's terrain patches ride along as a tiny {x,y,r} list — attached on growth + ~1 Hz resend
  // (mpsnap is reliable+ordered, the resend just self-heals a stale length across rematches).
  function snapAttachScans(snap, force){
    const sr=G.scanReveals; if(!sr || !sr.length) return;
    if(force || sr.length!==NET._lastSrLen || (NET.tick % NET.DELTA_HZ)===0){ snap.sr=sr; NET._lastSrLen=sr.length; }
  }
  NET.buildSnap = function(){
    const ents=[];
    for(const e of G.entities){ if(!e.dead) ents.push(packEnt(e)); }
    const snap = { t:NET.tick, ents, time:G.time, wave:G.waveCount, over:!!G.over, ack:NET._cmdAck };
    // Phase 4a: eco is a sizeable object re-sent every snap — include it only when it changed (mpsnap is
    // reliable+ordered, so a change is never lost), with a ~1 Hz safety resend.
    const ecoStr = JSON.stringify(G.eco);
    if(ecoStr!==NET._lastEcoStr || (NET.tick % NET.DELTA_HZ)===0){ snap.eco=G.eco; NET._lastEcoStr=ecoStr; }
    snapAttachQuests(snap);
    snapAttachScans(snap);
    if(G.hub && typeof serializeHubCampaign==='function') snap.campaign=serializeHubCampaign();
    return snap;
  };
  // Phase 4b (gated by NET.DELTA): send only entities that CHANGED vs the last baseline + an explicit gone
  // list, with a periodic keyframe to resync. Entity-level delta (whole packed entity) — avoids the
  // field-level partial-merge hazard. OFF by default; fully isolated so the legacy path is unchanged.
  NET.buildDeltaSnap = function(keyframe){
    const live=new Map(), ents=[];
    for(const e of G.entities){ if(e.dead) continue; const o=packEnt(e), id=o.id; live.set(id,o);
      if(keyframe){ ents.push(o); continue; }
      const prev=NET._baseline.get(id);
      if(!prev || JSON.stringify(prev)!==JSON.stringify(o)) ents.push(o);
    }
    const gone=[];
    if(!keyframe){ for(const id of NET._baseline.keys()){ if(!live.has(id)) gone.push(id); } }
    NET._baseline = live;
    const snap = { t:NET.tick, ents, time:G.time, wave:G.waveCount, over:!!G.over, ack:NET._cmdAck, delta:1 };
    if(keyframe) snap.key=1; else if(gone.length) snap.gone=gone;
    const ecoStr=JSON.stringify(G.eco);
    if(keyframe || ecoStr!==NET._lastEcoStr){ snap.eco=G.eco; NET._lastEcoStr=ecoStr; }
    snapAttachQuests(snap, keyframe);
    snapAttachScans(snap, keyframe);
    if(G.hub && typeof serializeHubCampaign==='function') snap.campaign=serializeHubCampaign();
    return snap;
  };
  NET.applySnap = function(snap){
    // Robustness: drop a stale / out-of-order snapshot (older tick than the last applied). Snaps self-heal,
    // so dropping one is safe; applying an OLD one would rubber-band positions. A full snapshot re-baselines.
    if(snap.t!=null && NET._lastAppliedTick>=0 && snap.t < NET._lastAppliedTick) return;
    if(snap.t!=null) NET._lastAppliedTick = snap.t;
    const hadCampaign = !!snap.campaign;
    if(hadCampaign && typeof deserializeHubCampaign==='function') deserializeHubCampaign(snap.campaign);
    if(snap.eco) G.eco = snap.eco;
    // quest progress (quantized {c,g,d,f} → the engine's {cur,goal,done,failed} shape). The quest
    // tracker + completion toasts are UI-side (updateQuestHud diffs done/failed flips on its own),
    // so simply swapping the state in is enough for clients.
    if(snap.q){ const Q={}; for(const k in snap.q){ const p=snap.q[k];
      Q[k]={ cur:p.c||0, goal:p.g||0, done:p.d?1:0, failed:p.f?1:0, na:p.n?1:0 }; } G.quests=Q; }
    // Market Research reveal patches: apply only the entries we haven't applied yet (idempotent —
    // the same list is resent ~1 Hz). computeFog only ORs into explored, so the patches persist.
    if(snap.sr){
      G.scanReveals=snap.sr; G._srApplied=G._srApplied||0;
      const fresh=snap.sr.length>G._srApplied;
      for(let i=G._srApplied;i<snap.sr.length;i++){ const p=snap.sr[i]; if(typeof applyScanReveal==='function') applyScanReveal(G,p.x,p.y,p.r); }
      G._srApplied=snap.sr.length;
      if(fresh && typeof toast==='function') toast('🕵️ Market Research published — rival campus located.');
    }
    // G.time is advanced locally every frame (clientTick) so time-driven sprite animations run at
    // render rate; only HARD-resync it if it has drifted far from the host (e.g. after a background gap).
    if(snap.time!=null && (G.time==null || Math.abs(G.time - snap.time) > 0.5)) G.time = snap.time;
    if(snap.wave!=null) G.waveCount = snap.wave;
    // Phase 1: advance the interpolation timeline (client-local receive instants of the last two snaps).
    NET._snapPrevT = NET._snapLastT; NET._snapLastT = _now();
    // Phase 4b: a delta snapshot carries only CHANGED entities (missing = unchanged) + an explicit 'gone'
    // list; a keyframe (snap.key) or legacy snap is a full self-healing set (missing = dead).
    const isDelta = !!snap.delta && !snap.key;
    // merge entities by id (preserves per-entity render transients: _ax/_ay/hitFx/_walkDist)
    // An entity vanishing from the stream = it died on the host → fire the local death FX (T0-2;
    // cosmetic, fog/off-screen-culled inside deathFx; goldmine depletion is not a "death").
    const _clientDeathFx = (e)=>{ if(typeof deathFx==='function' && e && e.type!=='goldmine' && !e.storedIn) deathFx(G,e); };
    const incoming = new Map(snap.ents.map(o=>[o.id,o]));
    const byId = new Map();
    for(let i=G.entities.length-1;i>=0;i--){
      const e=G.entities[i], o=incoming.get(e.id);
      if(o){ unpackInto(e,o,snap.time); byId.set(e.id,e); incoming.delete(e.id); }
      else if(isDelta){ byId.set(e.id,e); }            // delta: absent → unchanged, keep & index it
      else { _clientDeathFx(e); G.entities.splice(i,1); }   // full snap: gone on the host → remove on the client
    }
    for(const o of incoming.values()){ const e={selected:false}; unpackInto(e,o,snap.time); G.entities.push(e); byId.set(e.id,e); }
    if(isDelta && snap.gone && snap.gone.length){       // delta: explicit removals
      const goneSet=new Set(snap.gone);
      for(let i=G.entities.length-1;i>=0;i--){ if(goneSet.has(G.entities[i].id)){ _clientDeathFx(G.entities[i]); G.entities[i].selected=false; G.entities.splice(i,1); } }
    }
    // resolve unit target refs so chase/attack rendering works (host sent target as an id)
    for(const e of G.entities){ if(e._tgtId!=null){ const t=byId.get(e._tgtId); e.cmd = t?{type:'attack',target:t}:null; e._tgtId=null; } }
    // Phase 3: drop predictions the host has now acked — resume interpolation from the predicted position.
    if(snap.ack!=null){
      for(const e of G.entities){
        if(e._pred && e._predSeq!=null && snap.ack >= e._predSeq){ e._pred=false; e._predSeq=null; e._predTo=null; e._sx0=e.x; e._sy0=e.y; }
      }
    }
    const beforeSel=G.selection.length;
    G.selection=G.selection.filter(e=>{
      const keep=e && !e.dead && !e.storedIn;
      if(!keep && e) e.selected=false;
      return keep;
    });
    if(G.selection.length!==beforeSel && typeof refreshUI==='function') refreshUI();
    if(snap.over && !G.over){ G.over=true; if(typeof NET.onClientGameOver==='function') NET.onClientGameOver(); }
    if(typeof recomputeSupply==='function') recomputeSupply(G);   // keep the joiner's HUD supply honest
    if(hadCampaign && typeof refreshUI==='function') refreshUI();
  };

  /* ---------------- generic chunked send/receive (reused by mpfull + co-op save/resume blobs) ----------------
     12KB framed chunks {id,i,n,d}; the receiver reassembles per-id with a stalled-buffer TTL, then JSON.parses
     and hands the object to onComplete. id is monotonic per sender so transfers on different tags never collide. */
  let chunkSeq = 0;
  NET._sendChunked = function(tag, str, toPeer){
    const CH = 12*1024, id = ++chunkSeq, n = Math.ceil(str.length/CH);
    for(let i=0;i<n;i++) MP.send(tag, { id, i, n, d: str.slice(i*CH,(i+1)*CH) }, toPeer);
    return { id, n, kb: Math.round(str.length/1024) };
  };
  NET._recvChunked = function(p, onComplete){
    const now=_now();
    for(const k in NET._chunk){ if(now - (NET._chunk[k].t0||now) > NET.CHUNK_TTL) delete NET._chunk[k]; }   // expire stalled buffers (lost chunk)
    const b = NET._chunk[p.id] || (NET._chunk[p.id] = { n:p.n, got:0, parts:[], t0:now });
    if(b.parts[p.i]===undefined){ b.parts[p.i]=p.d; b.got++; }
    if(b.got>=b.n){ delete NET._chunk[p.id];
      let obj=null;
      try{ obj=JSON.parse(b.parts.join('')); }
      catch(err){ NET.mpLog && NET.mpLog('err','chunked payload parse failed: '+((err&&err.message)||err)); console.warn('[mp] chunked payload parse failed', err); return; }
      try{ onComplete(obj); }catch(err){ console.warn('[mp] chunked onComplete failed', err); }
    }
  };
  NET.sendFull = function(toPeer){
    const str = JSON.stringify(NET.serializeForNet());
    const info = NET._sendChunked('mpfull', str, toPeer);
    NET.mpLog && NET.mpLog('info','sending full snapshot → '+(toPeer?String(toPeer).slice(0,6)+'…':'all')+' ('+info.kb+'KB, '+info.n+' chunks)');
  };
  NET._recvFull = function(p){
    NET._recvChunked(p, (s)=>{
      NET.applyFullSnapshot(s); NET.mpLog && NET.mpLog('ok','full snapshot applied — synced to host');
      if(typeof NET.onFullApplied==='function') NET.onFullApplied();
    });
  };

  /* ---------------- per-frame driver (called from main.js loop) ---------------- */
  NET.hostTick = function(dt){
    NET.tick++;
    NET._sAcc += dt;
    NET._sAcc = Math.min(NET._sAcc, 2/NET.DELTA_HZ);   // Phase 2a: a backgrounded host can't bank a burst of snaps
    NET._sinceSend += dt;
    // No periodic full keyframe in legacy mode: each compact snap is already a full entity set (adds
    // spawns, drops deaths), so it self-heals — and a recurring full would yank the joiner's camera.
    if(NET._sAcc >= 1/NET.DELTA_HZ){
      NET._sAcc = 0;
      // Phase 2b: under send-queue congestion, skip this snapshot (the next set resyncs everything) so the
      // snapshot backlog can't head-of-line-block mpcmd — but never exceed the min-rate floor.
      const buf = (typeof MP!=='undefined' && MP.bufferedAmount) ? MP.bufferedAmount() : 0;
      if(buf > NET.SEND_HIWATER && NET._sinceSend < NET.SEND_MIN_INTERVAL) return;
      NET._sinceSend = 0;
      if(NET.DELTA){ MP.send('mpsnap', NET.buildDeltaSnap((NET.tick % (NET.DELTA_HZ*2))===0)); }   // Phase 4b: ~0.5 Hz keyframe
      else { MP.send('mpsnap', NET.buildSnap()); }
    }
  };
  NET.clientTick = function(dt){
    if(!G) return;
    // 0) advance the animation clock locally so time-driven sprite anims (attack windup, mine/heal loops,
    //    idle breathing) play smoothly at render rate instead of stepping at the snapshot rate / stalling
    //    under load. applySnap soft-resyncs it to the host's authoritative time when drift is large.
    G.time = (G.time||0) + dt;
    const snap2 = (TILE*2.5)*(TILE*2.5), tnow = _now();
    // 1a) Phase 3 — advance the client's own PREDICTED units locally (instant response to its move orders)
    //     until the host acks; abandon a stale/rejected prediction after PREDICT_TTL so it can't run away.
    for(const e of G.entities){
      if(!e._pred || e.kind!=='unit' || e.dead || !e._predTo) continue;
      if((tnow - (e._predAt||tnow))/1000 > NET.PREDICT_TTL){ e._pred=false; e._predSeq=null; e._predTo=null; e._sx0=e.x; e._sy0=e.y; continue; }
      const dx=e._predTo.x-e.x, dy=e._predTo.y-e.y, d=Math.hypot(dx,dy), step=(e.speed||3)*TILE*dt;   // host base speed = speed*TILE*dt (units.js)
      if(d<=step || d<0.5){ e.x=e._predTo.x; e.y=e._predTo.y; } else { e.x+=dx/d*step; e.y+=dy/d*step; }
      e.state='move'; e._netMoving=true;
    }
    // 1b) Phase 1 — two-snapshot entity interpolation: glide from the previous authoritative target to the
    //     newest over the inter-snapshot interval (renders ~1 snap behind, smooth under jitter). Big jumps
    //     (spawn/teleport/reconcile) snap. Predicted units are driven by 1a, not here.
    let f = 1;
    if(NET._snapPrevT!=null && NET._snapLastT!=null && NET._snapLastT>NET._snapPrevT){
      f = (tnow - NET._snapLastT) / (NET._snapLastT - NET._snapPrevT);
      f = f<0?0:(f>1?1:f);
    }
    for(const e of G.entities){
      if(e.kind!=='unit' || e.dead || e._pred || e._sx==null) continue;
      if(e._sx0==null){ e.x=e._sx; e.y=e._sy; continue; }
      const dx=e._sx-e._sx0, dy=e._sy-e._sy0;
      if(dx*dx+dy*dy > snap2){ e.x=e._sx; e.y=e._sy; }          // teleport / spawn
      else { e.x=e._sx0+dx*f; e.y=e._sy0+dy*f; }
    }
    // 2) cosmetic systems that normally live inside update() — the client skips update(), so without
    //    these the sprint ripple never decays, ambient visuals freeze, and speech boxes stay invisible.
    if(typeof updateSprint==='function')    updateSprint(G, dt);
    if(typeof updateParticles==='function') updateParticles(G, dt);
    if(typeof updateWater==='function')     updateWater(G, dt);
    if(typeof updateDialogs==='function')   updateDialogs(G, dt);
    if(typeof TUTORIAL!=='undefined' && TUTORIAL.update) TUTORIAL.update(G, dt);   // C5: advance the joiner's guided tutorial (the client skips update(); this is cosmetic + never writes the sim)
    // the client owns its fog: it has every unit's position, so computeFog reproduces shared vision.
    if(typeof computeFog==='function')      computeFog(G);
    // 3) host-liveness watchdog: no snapshot for too long → the host crashed/dropped. Warn first, then end.
    //    RTT-aware: a genuinely high-latency (but alive) link gets proportionally more slack before "stall".
    if(netRole==='client' && running && !NET._hostGone && NET.lastRecvAt){
      const gap = _now() - NET.lastRecvAt;
      const stallMs = Math.max(NET.STALL_MS, (window.MP_LAST_RTT||0)*3);   // ~3× RTT floor (laggy ≠ gone)
      if(gap > NET.LOST_MS){ NET._hostGone = true; NET.mpLog && NET.mpLog('err','watchdog: no host snapshot for '+Math.round(gap)+'ms — host lost'); if(typeof NET.onHostLost==='function') NET.onHostLost(); }
      else if(gap > stallMs && !NET._stalled){ NET._stalled = true; NET.mpLog && NET.mpLog('warn','watchdog: snapshot gap '+Math.round(gap)+'ms — connection unstable'); if(typeof NET.onStall==='function') NET.onStall(); }
    }
  };

  /* ---------------- receive wiring (registered once a room is entered) ---------------- */
  NET.bindClientReceivers = function(){
    MP.on('mpfull', (p)=>{ NET.markRecv(); NET._recvFull(p); });
    MP.on('mpsnap', (s)=>{ NET.markRecv(); if(netRole==='client' && G && NET.lastFull>=0) NET.applySnap(s); });
  };
})();
