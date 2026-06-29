/* corpses.js — Ep XVI "dead-body memory" mechanic.

   Five dead bodies are scattered across the escape stripe (cfg.memBodies). Each is a real
   neutral `kind:'corpse'` entity that SITS ON ITS SPOT TILE and is rendered as an actual gory
   dead person built from a unit sprite (see corpseSprite/drawCorpse in render.js). Walking — or
   commanding — a player unit onto a body extracts the memory chip in its skull: a paragraph of
   that person's last hours pops, and the `reveal` body fires Rust's "Dell Tusk is a cyborg"
   cutscene. Collecting all five is the `collectMemories` quest (quests.js).

   This reuses the MADOSIS echo *logic* pattern (neutral entity + per-frame walk-over sweep +
   id-keyed determinism) but the body is the visible click/walk target — there is no floating
   beacon. The body PERSISTS after extraction (reached=true, never dead) so the battlefield keeps
   its corpses.

   Determinism / co-op: pickup is pure proximity (no simRandom), host/solo only (clients receive
   `reached` via snapshots, sync.js). Cosmetic toasts/rings are skipped during rollback resim
   (window._rbReplaying), matching the rest of the codebase. Memory TEXT is authored once on
   cfg.memBodies and resolved by id — never stored on the entity, so saves stay lean.

   Depends on globals: TILE (config.js), mkEntity (map.js), eventToast/toast (ui.js),
   spawnRing (render.js), fireTuskReveal (cutscene.js, optional). */

// proximity (in tiles) at which a player unit harvests a body's chip. Forgiving so a hero commanded
// onto the body (which lands ~1 tile off, with squad-separation spread) reliably reaches it.
const CORPSE_REACH = 1.8;

// ---- AUTHORITATIVE cyborg classification — the single source of truth for "does this body bleed
// synthetic/neon coolant instead of oxblood". OWNER RULE: ALL cyborgs bleed synthetic — Growth
// Cyborgs (soldier), Founder Mechs (founder, incl. Rust), Biba, the EX-TERMINATOR/REX, A&O units,
// and the player's Wake-resurrected (reborn) units. Humans (Intern, Consultant, Lobbyist/Nino,
// Zeca) bleed oxblood. Drives corpse gore (render.js corpseSprite); reusable for any future blood FX.
const CYBORG_SPRITE_OVERRIDE = { biba:true, rust:true, ex_terminator:true, rex:true, nino:false, zeca:false };
function isCyborgBody(src, faction, reborn){
  if(reborn) return true;                              // Wake-resurrected → cyborg
  if(faction==='ao' || src==='ao') return true;        // A&O are synthetic
  if(CYBORG_SPRITE_OVERRIDE[src]!=null) return CYBORG_SPRITE_OVERRIDE[src];   // hero/villain sprite override
  const d = (typeof DEF!=='undefined') && DEF[src];
  return !!(d && d.cyborg);                            // DEF.cyborg: Growth Cyborg (soldier), Founder Mech (founder)
}

// spawn every dead body declared on the map. Called from newMap (map.js) after heroes spawn.
// cfg.memBodies: [{ x, y, src:'civilian'|'<unitType>'|'ao', id, text, reveal?, gore? }]
//   src   — which sprite the corpse is built from ('civilian'→worker skin; a unit type; 'ao'→A&O recolor)
//   gore  — optional dismemberment override ('headshot'|'legless'|'bleeding'); else seeded from id
//   reveal— the dead A&O unit Rust pulls his file from → fires the Tusk-cyborg reveal on pickup
// nearest walkable tile to (tx,ty) — a body authored on a rock/tree/water tile would shove an
// approaching hero out of reach, so snap it onto passable ground at spawn.
function _corpseSnap(state, tx, ty){
  const W=state.W, H=state.H, blocked=state.blocked;
  const ok=(x,y)=> x>=1 && y>=1 && x<W-1 && y<H-1 && !(blocked && blocked[y*W+x]);
  if(ok(tx,ty)) return [tx,ty];
  for(let r=1;r<=10;r++){
    for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
      if(ok(tx+dx,ty+dy)) return [tx+dx,ty+dy];
    }
  }
  return [tx,ty];
}
function spawnMemBodies(state, cfg){
  const list = cfg && cfg.memBodies;
  if(!list || !list.length) return;
  list.forEach((b, i)=>{
    const xy=_corpseSnap(state, b.x|0, b.y|0);
    const e = mkEntity(state, 'corpse', 'neutral', xy[0], xy[1], {
      kind:'corpse', src:(b.src||'civilian'), memId:(b.id||('mem'+i)),
      group:(b.group||'route'),     // which objective this body belongs to ('route' = the 5 Tusk-thread bodies)
      reveal:!!b.reveal, gore:(b.gore||null), reached:false,
      r:10, sight:0, hp:1, maxHp:1,
    });
    state.entities.push(e);
  });
}

/* ---- "THE OTHER UNITS": the player's carried veterans rode the FRONT half of the bomber, which
   landed closer to the H.U.B. 90% survived (walking to the H.U.B.); ~10% died on the landing. Their
   bodies lie by the front-half wreck (cfg.crewWreck), built from the REAL veterans (their sprite +
   dossier as the memory), and those vets are PERMANENTLY removed from the roster. Host/solo computes
   the dynamic set (seeded → co-op syncs the corpse entities); the client skips it. ---- */
function _crewRng(seed){ let a=(seed>>>0)||1; return ()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function _pickK(n, k, rng){ const a=[]; for(let i=0;i<n;i++) a.push(i);
  for(let i=0;i<k && i<n;i++){ const j=i+Math.floor(rng()*(n-i)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a.slice(0, Math.min(k,n)); }
// one dead veteran's memory paragraph, from their dossier; the LAST one carries the survivors→H.U.B. beat.
function _crewMemText(vet, i, total){
  let name='One of your own', home='', line='';
  if(vet && vet.lore && typeof buildDossier==='function'){
    try{ const d=buildDossier({type:vet.type, lore:vet.lore});
      name=d.full||d.first||name; home=d.home||'';
      line = d.dream ? (' The chip still loops the last thing they wanted: '+d.dream+'.')
           : d.trauma ? (' The chip won\'t stop replaying '+d.trauma+'.') : '';
    }catch(e){}
  }
  const unit=(typeof DEF!=='undefined' && DEF[vet&&vet.type] && DEF[vet.type].name) || 'trooper';
  let txt = name + (home?(' — '+home):'') + ', '+unit+'. They rode the front half down. It came in hard, and this one didn\'t get back up.'+line;
  if(i===total-1) txt += ' The rest crawled out and made the tree line. Ninety of them are on foot to the H.U.B. right now — without you.';
  return txt.trim();
}
function spawnCrewBodies(state, cfg){
  if(!cfg || !cfg.crewWreck) return;
  if(typeof netRole!=='undefined' && netRole==='client') return;   // dynamic → host/solo computes; client gets the corpse entities via sync
  const front=cfg.crewWreck;            // {x,y} (scaled) — the front-half wreck = the cluster centre
  const rng=_crewRng((state.seed||0) ^ 0x6c0de5);
  const vets=(typeof carryoverVets!=='undefined' && Array.isArray(carryoverVets)) ? carryoverVets.slice() : [];
  let dead=[];
  if(vets.length){
    const n=Math.max(2, Math.min(5, Math.round(vets.length*0.1)));
    dead=_pickK(vets.length, Math.min(n, vets.length), rng).map(i=>vets[i]);
    // PERMANENT loss (host/solo, ONE-SHOT): drop the dead from CAMPAIGN.roster — the persistent source
    // of truth (carryoverVets is rebuilt from it at the next dispatch, so this is the real, lasting loss).
    if(typeof CAMPAIGN!=='undefined' && CAMPAIGN && !CAMPAIGN._crewLost){
      CAMPAIGN._crewLost=true;
      const deadSeeds=new Set(dead.map(v=>v.lore && v.lore.seed).filter(s=>s!=null));
      if(deadSeeds.size && Array.isArray(CAMPAIGN.roster))
        CAMPAIGN.roster=CAMPAIGN.roster.filter(r=>!(r && r.lore && deadSeeds.has(r.lore.seed)));
    }
  } else {
    dead=[{type:'soldier'},{type:'ranger'},{type:'soldier'}];   // fallback (sandbox / wiped squad): generic crew
  }
  dead.forEach((v,i)=>{
    const ang=rng()*6.283, rad=2+rng()*4;
    const xy=_corpseSnap(state, Math.round(front.x+Math.cos(ang)*rad), Math.round(front.y+Math.sin(ang)*rad));
    const e=mkEntity(state, 'corpse', 'neutral', xy[0], xy[1], {
      kind:'corpse', src:(v&&v.type)||'soldier', group:'crew', memId:'crew'+i,
      memText:_crewMemText(v, i, dead.length), reborn:!!(v&&v.reborn),
      gore:null, reached:false, r:10, sight:0, hp:1, maxHp:1,
    });
    state.entities.push(e);
  });
}

// the two crashed Buzzword-Bomber halves (cfg.wrecks:[{x,y,half:'back'|'front'}]) — neutral, non-blocking,
// non-selectable render props (drawWreck + smoke in render.js). The bomber split: heroes rode the BACK
// half (player start), the rest the FRONT half (left, near the H.U.B.).
function spawnWrecks(state, cfg){
  const list=cfg && cfg.wrecks; if(!list || !list.length) return;
  list.forEach(w=>{
    const e=mkEntity(state, 'wreck', 'neutral', w.x|0, w.y|0, { kind:'wreck', half:(w.half||'back'), r:14, sight:0, hp:1, maxHp:1 });
    state.entities.push(e);
  });
}

// resolve a body's memory paragraph from cfg (authored in one place; not serialized on the entity).
function corpseMemText(state, corpse){
  const list = (state.cfg && state.cfg.memBodies) || [];
  const b = list.find(x => (x.id||'') === corpse.memId);
  return (b && b.text) || corpse.memText || '';
}

// count of bodies still un-harvested (the collectMemories quest polls this). Optional `group` filters
// to one objective's bodies ('route' = the 5 Tusk-thread bodies, 'crew' = the dead veterans); null = all.
function corpsesRemaining(state, group){
  let n = 0;
  for(const e of state.entities){ if(!e.dead && e.kind==='corpse' && !e.reached && (group==null || (e.group||'route')===group)) n++; }
  return n;
}
// total bodies of a group (reached or not) — the quest GOAL (handles the dynamic crew count).
function corpsesTotal(state, group){
  let n = 0;
  for(const e of state.entities){ if(!e.dead && e.kind==='corpse' && (group==null || (e.group||'route')===group)) n++; }
  return n;
}

// extract ONE body's chip — the shared resolution for the walk-over sweep and the click command.
// The body STAYS on the map (reached=true, not dead); it just stops being a pickup target.
function corpseExtract(state, corpse, collector){
  if(!corpse || corpse.dead || corpse.reached) return;
  corpse.reached = true;
  if(window._rbReplaying) return;   // rollback resim: no UI side-effects
  if(typeof spawnRing==='function') spawnRing(corpse.x, corpse.y, corpse.reveal?'#ff5b6e':'#5fe0ff');
  const txt = corpseMemText(state, corpse), isReveal = !!corpse.reveal;
  // the reveal body (dead A&O unit) → Rust reads his file → the Tusk-cyborg cutscene (one-shot), fired
  // AFTER the player dismisses the service-record dialog.
  const afterClose = ()=>{ if(isReveal && !state._tuskRevealDone){ state._tuskRevealDone=true; if(typeof fireTuskReveal==='function') fireTuskReveal(state, collector); } };
  // a PERSISTENT dialog box (click to close) — NOT a transient toast. Falls back to a toast with no DOM.
  if(typeof showMemoryDialog==='function') showMemoryDialog(txt, isReveal, afterClose);
  else { if(typeof eventToast==='function') eventToast('🧠 '+txt, 9000); afterClose(); }
}

// per-frame walk-over sweep (host/solo only — called from core.js update, missions only): ANY player
// unit standing on an un-harvested body extracts it, regardless of its current command. Pure
// proximity → deterministic across save/load/rollback/co-op.
function corpsesTick(state, dt){
  if(state.hub) return;
  if(typeof window!=='undefined' && window._memDialogOpen) return;   // a memory is being read → don't harvest another yet
  const reach = CORPSE_REACH*TILE;
  for(const e of state.entities){
    if(e.dead || e.kind!=='corpse' || e.reached) continue;
    for(const u of state.entities){
      if(u.dead || u.storedIn || u.kind!=='unit' || u.owner!=='player' || u.subdued || u.madDog) continue;
      if(Math.hypot(e.x-u.x, e.y-u.y) > reach) continue;
      corpseExtract(state, e, u);
      return;   // one body per tick — its dialog gates the rest until dismissed
    }
  }
}

// expose for core.js / map.js / quests.js / render.js / console (classic-script shared scope).
if(typeof window!=='undefined'){
  window.spawnMemBodies=spawnMemBodies; window.spawnCrewBodies=spawnCrewBodies; window.spawnWrecks=spawnWrecks; window.corpsesTick=corpsesTick;
  window.corpseExtract=corpseExtract; window.corpsesRemaining=corpsesRemaining;
  window.corpsesTotal=corpsesTotal;
  window.corpseMemText=corpseMemText; window.isCyborgBody=isCyborgBody;
}
