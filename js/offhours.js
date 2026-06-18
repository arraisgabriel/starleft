/* offhours.js — runtime for The Off-Hours HUB district: the Relationship Ledger.
   The first relationship STATE the game has ever had. Pure bond math + accessors over
   CAMPAIGN.offhours.bonds (defined in js/hub.js hubDefaultCampaign, legacy-safe). Reads the
   static OFFHOURS pools + tuning (js/offhours_data.js). Loaded after npc_lore.js, before ui.js.

   Depends (at call time) on: OFFHOURS (offhours_data.js), CAMPAIGN (hub.js), makeRng (state.js),
   buildDossier (lore.js), buildNpcDossier/npcParseId (npc_lore.js).

   A bond is ALWAYS veteran↔veteran or veteran↔NPC — there is no Founder/third party.
   bondId = the two stable ids sorted + joined, so it's order-independent and collision-free.
   Party id spaces (already stable across save/load/rollback):
     vet : 'lore:<seed>' | 'hero:<id>' | 'unit:<id>' (fallback)
     npc : 'nr:<vetKey>' | 'nf:<vetKey>:<k>' | 'np:<poiId>:<slot>' | 'nu:<slot>'

   BondRecord (compact, save-cheap, append-only seen[]):
     v    OFFHOURS content-version at mint (pool-shape freeze; mirrors lore.js dossier.v)
     k    kind code: 0 kin · 1 friend · 2 rival · 3 romance · 4 mentor · 5 confidant
     t    tier 0..maxTier
     p    cumulative points toward tiers
     fl   flags: 1 closest/nemesis · 2 strained · 4 arc-unlocked(favor done) · 8 arc-done · 16 keepsake-granted
     lv   CAMPAIGN.visit of last meaningful interaction (decay / "haven't talked" cues)
     seen [] APPEND-ONLY indices of scenes already played (no repeats) */

/* ---- content-version helpers (clone of lore.js _latestVersion/_poolLens/_loPickN) ---- */
function ohLatestVersion(){ const V = (typeof OFFHOURS!=='undefined') && OFFHOURS.versions; return (V && V.length) ? V.length : 1; }
function ohPoolLens(v){
  const V = (typeof OFFHOURS!=='undefined') && OFFHOURS.versions;
  if(!V || !V.length) return null;                                   // no table → full-length picks
  return V[Math.min(Math.max((v|0)||1, 1), V.length) - 1];
}
// version-gated pick: caps the draw to the first `n` entries; consumes exactly one rng() step regardless of n
function ohPickN(rng, arr, n){ return arr[(rng()*((n>0)?n:arr.length))|0]; }

/* ---- stable party ids ---- */
const _OH_PREFIX = ['lore:', 'hero:', 'unit:', 'nr:', 'nf:', 'np:', 'nu:'];
function _ohValidId(s){ if(typeof s!=='string' || !s) return false; for(const p of _OH_PREFIX) if(s.indexOf(p)===0) return true; return false; }
// a veteran's stable id (matches the npc_lore vetKey scheme: lore:/hero:)
function ohUnitKey(u){
  if(!u) return '';
  if(u.heroId) return 'hero:'+u.heroId;
  if(u.lore && u.lore.seed!=null) return 'lore:'+u.lore.seed;
  return 'unit:'+(u.id||0);
}
// order-independent bond id over two valid party ids
function ohBondId(a, b){
  if(!_ohValidId(a) || !_ohValidId(b) || a===b) return '';
  return (a < b) ? (a+'|'+b) : (b+'|'+a);
}

/* ---- ledger access ---- */
function ohLedger(){ return (typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.offhours) ? CAMPAIGN.offhours : null; }
function ohBonds(){ const L=ohLedger(); return (L && L.bonds && typeof L.bonds==='object') ? L.bonds : null; }
function ohKindCode(kind){ const i = OFFHOURS.kinds.indexOf(kind); return i<0 ? 1 : i; }   // default 'friend'
function ohKindName(k){ return OFFHOURS.kinds[k|0] || 'friend'; }

function ohGetBond(a, b){ const B=ohBonds(); if(!B) return null; const id=ohBondId(a,b); return id ? (B[id]||null) : null; }
// create (idempotent) — never duplicates or downgrades. `kind` may be a name or code.
function ohEnsureBond(a, b, kind, startTier){
  const B=ohBonds(); if(!B) return null;
  const id=ohBondId(a,b); if(!id) return null;
  let rec=B[id];
  const kc = (typeof kind==='number') ? (kind|0) : ohKindCode(kind||'friend');
  if(!rec){
    const t0 = Math.max(0, Math.min(OFFHOURS.tune.maxTier, startTier|0));
    rec = B[id] = { v: ohLatestVersion(), k: kc, t: t0, p: OFFHOURS.tune.tierPts[t0]||0, fl: 0,
                    lv: (typeof CAMPAIGN!=='undefined' && CAMPAIGN ? (CAMPAIGN.visit|0) : 0), seen: [] };
    const L=ohLedger(); if(L && !L.v) L.v = ohLatestVersion();
  }
  return rec;
}

/* ---- tiers + points ---- */
function ohTierFor(points){ const T=OFFHOURS.tune.tierPts; let t=0; for(let i=1;i<T.length;i++){ if(points>=T[i]) t=i; } return t; }
function ohTierName(rec){ const names=OFFHOURS.tierNames[ohKindName(rec&&rec.k||0)]; return (names && names[(rec&&rec.t)||0]) || ''; }
// award points; recompute tier honoring the locked-tier favor gate. Returns {leveled, from, to}.
function ohGrantPoints(rec, pts, visit){
  if(!rec) return { leveled:false, from:0, to:0 };
  const from = rec.t|0;
  rec.p = Math.max(0, (rec.p|0) + (pts|0));
  rec.lv = (visit!=null) ? (visit|0) : (typeof CAMPAIGN!=='undefined' && CAMPAIGN ? (CAMPAIGN.visit|0) : 0);
  let nt = ohTierFor(rec.p);
  const lock = OFFHOURS.tune.lockedTier|0;
  if(nt > lock && !(rec.fl & 4)) nt = lock;          // Hades locked heart: needs the arc 'favor' (fl&4)
  rec.t = Math.max(from, nt);                          // tiers never regress from a point bump
  return { leveled: rec.t > from, from: from, to: rec.t };
}
// record a played scene (append-only, no repeats). Returns true if newly added.
function ohMarkSeen(rec, sceneCode){
  if(!rec || sceneCode==null) return false;
  if(!Array.isArray(rec.seen)) rec.seen = [];
  if(rec.seen.indexOf(sceneCode) >= 0) return false;
  rec.seen.push(sceneCode); return true;
}
function ohHasSeen(rec, sceneCode){ return !!(rec && Array.isArray(rec.seen) && rec.seen.indexOf(sceneCode) >= 0); }

/* ---- flag helpers ---- */
const OH_FL = { CLOSEST:1, STRAINED:2, ARC_UNLOCKED:4, ARC_DONE:8, KEEPSAKE:16 };
function ohSetFlag(rec, bit, on){ if(!rec) return; if(on===false) rec.fl = (rec.fl|0) & ~bit; else rec.fl = (rec.fl|0) | bit; }
function ohHasFlag(rec, bit){ return !!(rec && ((rec.fl|0) & bit)); }

/* ---- fixed-identity NPCs (D2/D3): the bartender confidant ---- */
function ohFixedNpc(key, id){
  const F = OFFHOURS.fixedNpcs && OFFHOURS.fixedNpcs[key]; if(!F) return null;
  const first=F.first||'', full=F.full||first, home=F.home||'parts unknown';
  const fill=(t)=> (t||'').replace(/\{me\}/g,first).replace(/\{full\}/g,full).replace(/\{home\}/g,home).replace(/\{prof\}/g,F.profession||'');
  return { id:id||'', role:'provider', fixed:key, first, last:F.last||'', full, gender:F.gender||'f', home,
           rel:'', vetKey:null, vetFirst:'', vetFull:'', profession:F.profession||'', workPoiName:'THE LATE SHIFT',
           condoName:'', backstoryText:F.backstoryText||'', chores:F.chores||['',''], fill };
}
// the counterpart's first name for {npc} slot-fill
function ohNpcName(npcId){
  if(typeof buildNpcDossier==='function'){ try{ const d=buildNpcDossier(npcId); if(d && d.first) return d.first; }catch(_){ } }
  const p=(typeof npcParseId==='function')?npcParseId(npcId):null;
  return (p && p.poiId) ? 'the bartender' : 'them';
}
// the display name of ANY counterpart id — an NPC (np:/nr:/nf:/nu:) or another veteran (lore:/hero:/unit:)
function ohPartyName(id){
  if(typeof id!=='string' || !id) return '';
  if(/^(np:|nr:|nf:|nu:)/.test(id)) return ohNpcName(id);
  const ents=(typeof G!=='undefined' && G && G.entities)?G.entities:[];
  for(const e of ents){ if(e && !e.dead && e.kind==='unit' && ohUnitKey(e)===id){ try{ return buildDossier(e).first; }catch(_){ return 'them'; } } }
  if(typeof CAMPAIGN!=='undefined' && CAMPAIGN.roster){ for(const rs of CAMPAIGN.roster){ if(rs && rs.key===id && rs.lore){ try{ return buildDossier({type:rs.type, lore:rs.lore}).first; }catch(_){ } } } }
  return 'them';
}
// slot-fill a line for a (vet, counterpart) pair: vet-dossier slots + {npc}/{them} (the counterpart's name)
function ohFill(text, vet, npcId){
  if(text==null) return '';
  let s=String(text);
  if(vet && vet.lore && typeof buildDossier==='function'){ try{ s = buildDossier(vet).fill(s); }catch(_){ } }
  s = s.replace(/\{npc\}|\{them\}/g, npcId ? ohPartyName(npcId) : '');
  return s;
}

/* ---- compatibility (B3) — deterministic vet↔vet bias (RimWorld/Wildermyth) ---- */
function ohCompat(a, b){
  if(!a || !b || !a.lore || !b.lore || typeof buildDossier!=='function') return 0;
  let da, db; try{ da=buildDossier(a); db=buildDossier(b); }catch(_){ return 0; }
  const T=OFFHOURS.tune.compat; let c=0;
  if(da.home && da.home===db.home) c += T.home;                          // shared hometown clicks
  if(a.type===b.type) c += T.type;                                       // same archetype
  if(da.trauma && db.trauma) c += T.trauma*0.5;                          // two haunted people grind
  if((!!da.crime) !== (!!db.crime)) c += T.crime*0.5;                    // one carries a crime the other might judge
  const seed=(_loHash(((a.lore.seed^b.lore.seed)>>>0))) % 233280;        // deterministic jitter so it's not all ties
  c += (makeRng(seed)()-0.5) * 0.4;
  return Math.max(-1, Math.min(1, c));
}
function ohCompatKind(score){ const T=OFFHOURS.tune.compat; return (score<=T.rivalT) ? 'rival' : 'friend'; }
function ohSeedClub(vetKeyA, vetA, vetKeyB, vetB){
  if(!vetKeyA || !vetKeyB) return null;
  const kind = ohCompatKind(ohCompat(vetA, vetB));
  return ohEnsureBond(vetKeyA, vetKeyB, kind);
}

/* ---- the thin mood layer (G1) — transient/derived, NEVER identity ---- */
function ohVetMood(u){
  if(!u) return { morale:0.5, loneliness:0, want:null };
  const B=ohBonds(), k=ohUnitKey(u); let lastLv=-1;
  if(B) for(const id in B){ if(id.indexOf(k)>=0 && (B[id].lv|0)>lastLv) lastLv=B[id].lv|0; }
  const visit=(typeof CAMPAIGN!=='undefined' && CAMPAIGN)?(CAMPAIGN.visit|0):0;
  const loneliness=Math.max(0, Math.min(1, lastLv<0 ? 0.6 : (visit-lastLv)/4));
  const morale=Math.max(0, Math.min(1, 0.7 - (u.madosis||0)*0.01 - (u._vetGrief?0.2:0) + (u.dreamDone?0.1:0)));
  const want = loneliness>0.5 ? 'wants a night out' : null;
  return { morale, loneliness, want };
}
// G2 — roster vets who want a night out, loneliest first (Persona-style nudge list)
function ohNeedsNight(){
  const out=[]; const ents=(typeof G!=='undefined' && G && G.entities)?G.entities:[];
  for(const e of ents){ if(e && !e.dead && e.kind==='unit' && e.owner==='player' && e.lore){ const m=ohVetMood(e); if(m.want) out.push({ key:ohUnitKey(e), unit:e, loneliness:m.loneliness }); } }
  out.sort((a,b)=> b.loneliness - a.loneliness);
  return out;
}

/* ---- payoffs: deploy synergy (H3) + grief partners (H6) — query functions; combat/death wiring is light ---- */
// the opt-in bonus a bonded pair gets when deployed together. Returns 0 if not bonded / not a friend|romance.
function ohDeploySynergy(a, b){
  const ka=ohUnitKey(a), kb=ohUnitKey(b); const bond=ohGetBond(ka,kb); if(!bond) return 0;
  const kind=ohKindName(bond.k);
  if(kind==='friend' || kind==='romance' || kind==='confidant') return 0.02 + 0.02*(bond.t|0);   // tiny per-tier
  if(kind==='rival') return 0.015*(bond.t|0);                                                     // competitive edge
  return 0;
}
// H5 — a tiny carried bonus per keepsake the veteran holds (a bond that received a gift). Opt-in flavor.
function ohKeepsakeBonus(u){
  const B=ohBonds(); if(!B || !u) return 0; const k=ohUnitKey(u); if(!k) return 0; let n=0;
  for(const id in B){ if(id.indexOf(k)>=0 && (B[id].fl & OH_FL.KEEPSAKE)) n++; }
  return Math.min(0.05, n*0.02);
}
// the bonded partners of a (fallen) veteran key — read by grief beats (H6) to deepen the loss.
function ohGriefPartners(vetKey){
  const B=ohBonds(); if(!B || !vetKey) return [];
  const out=[];
  for(const id in B){ const i=id.indexOf(vetKey); if(i<0) continue; const rec=B[id];
    if((rec.t|0)>=3 || (rec.fl & OH_FL.CLOSEST)){ const other=id.split('|').find(p=>p!==vetKey); if(other) out.push({ id:other, bond:rec }); } }
  return out;
}



/* ---- seeding (B2) ---- */
function ohSeedConfidant(vetKey){ return vetKey ? ohEnsureBond(vetKey, OFFHOURS.barNpc, 'confidant', 0) : null; }
function ohSeedVetBonds(vetKey, vet){
  if(!vetKey || !ohLedger()) return;
  if(vetKey.indexOf('lore:')===0 && vet && vet.lore && typeof buildDossier==='function'){   // kin from the named relative
    let d; try{ d=buildDossier(vet); }catch(_){ d=null; }
    if(d && d.rel){
      const estr=/estrang|haven'?t|cut off|disown|left|silence|gone/i.test(((d.familyText||'')+' '+(d.trauma||'')));
      ohEnsureBond(vetKey, 'nr:'+vetKey, 'kin', estr?0:1);
    }
  }
}

/* ---- scene eligibility + pick (E2) ---- */
function _ohVetHas(vet, aspect){
  if(!aspect) return true;
  if(!vet || !vet.lore || typeof buildDossier!=='function') return false;
  let d; try{ d=buildDossier(vet); }catch(_){ return false; }
  if(aspect==='crime') return !!d.crime;
  if(aspect==='trauma') return !!d.trauma;
  if(aspect==='dream') return !!d.dream;
  return true;
}
function ohSceneEligible(scene, idx, vet, bond){
  if(!scene || !scene.req) return false;
  const tier = bond ? (bond.t|0) : 0;
  if(bond && ohHasSeen(bond, idx)) return false;
  const r=scene.req;
  if(r.minTier!=null && tier < r.minTier) return false;
  if(r.maxTier!=null && tier > r.maxTier) return false;
  if(r.gate && !_ohVetHas(vet, r.gate)) return false;
  if(!scene.choices.some(c => _ohVetHas(vet, c.gate))) return false;   // every choice gated out → skip
  return true;
}
// the venue's current scene for (vet, npc): the lowest-index eligible, unseen scene matching venue (+kind)
function ohSceneFor(venue, kind, vet, bond){
  for(let i=0;i<OFFHOURS.scenes.length;i++){ const s=OFFHOURS.scenes[i];
    if(s.venue!==venue) continue; if(kind && s.kind && s.kind!==kind) continue;
    if(ohSceneEligible(s, i, vet, bond)) return { scene:s, idx:i };
  }
  return null;
}
// the choices a vet can actually pick in a scene (aspect-gated by their dossier)
function ohSceneChoices(scene, vet){ return scene ? scene.choices.filter(c => _ohVetHas(vet, c.gate)) : []; }

/* ---- the light check (E5) — deterministic ---- */
function ohApproachWeight(ap){ const a=OFFHOURS.tune.approach[ap]; return a?a[0]:1; }
function ohApproachBias(ap){ const a=OFFHOURS.tune.approach[ap]; return a?a[1]:0; }
function ohCheckLands(bond, sceneIdx, choiceIdx, visit, approach){
  const T=OFFHOURS.tune, tier=bond?(bond.t|0):0;
  const p=Math.max(T.checkMin, Math.min(T.checkMax, T.checkBase + T.checkPerTier*tier + ohApproachBias(approach)));
  const seed=(_loHash((sceneIdx+1)*131 ^ (choiceIdx+1)*977 ^ ((visit|0)+1)*2654435761 ^ (bond?(bond.p|0):0)>>>0)) % 233280;
  return makeRng(seed)() < p;
}

/* ---- commit a scene outcome (E6) — HOST-AUTHORITATIVE (entered via netOffhoursCommit) ---- */
// payload: { vetKey, npcId, sceneIdx, choiceIdx }
function applyOffhoursCommit(state, payload){
  if(!payload) return null;
  const L=ohLedger(); if(!L) return null;
  // I3 — a gift opens/accelerates a bond and returns a keepsake (Hades first-nectar). Host-authoritative.
  if(payload.gift){
    const g=ohEnsureBond(payload.vetKey, payload.npcId, payload.kind||'friend'); if(!g) return null;
    if(typeof hubSpend==='function' && !hubSpend(OFFHOURS.tune.giftCost|0)) return { broke:true };
    const first=!(g.fl & OH_FL.KEEPSAKE);
    ohGrantPoints(g, OFFHOURS.tune.giftPts, (typeof CAMPAIGN!=='undefined'?(CAMPAIGN.visit|0):0));
    ohSetFlag(g, OH_FL.KEEPSAKE, true);                         // first gift returns a keepsake (H5)
    return { ok:true, gift:true, keepsake:first, tier:g.t,
      reply: first ? 'You bring something worth more than M3rit$. They keep it — and press something back into your hand.'
                   : 'They take it with a nod. The gauge ticks up.' };
  }
  const scene = OFFHOURS.scenes[payload.sceneIdx|0]; if(!scene) return null;
  const choice = scene.choices[payload.choiceIdx|0]; if(!choice) return null;
  const npcId = payload.npcId || (scene.with==='bartender' ? OFFHOURS.barNpc : null);
  const vet = _ohFindVet(state, payload.vetKey);
  const bond = ohEnsureBond(payload.vetKey, npcId, scene.kind); if(!bond) return null;
  if(ohHasSeen(bond, payload.sceneIdx|0)) return { already:true };          // idempotent
  // economy: a deep scene costs M3$ + a downtime night (host-gated). Ambient/caught are free & never committed here.
  if(typeof hubSpend==='function' && !hubSpend(OFFHOURS.tune.sceneCost|0)) return { broke:true };
  if(L.nights!=null) L.nights = Math.max(0, (L.nights|0) - 1);
  const visit = (typeof CAMPAIGN!=='undefined' && CAMPAIGN) ? (CAMPAIGN.visit|0) : 0;
  const landed = choice.check ? ohCheckLands(bond, payload.sceneIdx|0, payload.choiceIdx|0, visit, choice.approach) : true;
  const br = landed ? choice.land : (choice.miss || choice.land);
  const pts = (br.pts!=null) ? (br.pts|0) : Math.round(OFFHOURS.tune.scenePts * ohApproachWeight(choice.approach));
  const lvl = ohGrantPoints(bond, pts, visit);
  ohMarkSeen(bond, payload.sceneIdx|0);
  if(br.fl && OH_FL[br.fl]!=null) ohSetFlag(bond, OH_FL[br.fl], true);       // e.g. ARC_UNLOCKED (the Hades favor)
  if(bond.t>=OFFHOURS.tune.maxTier) ohSetFlag(bond, OH_FL.ARC_DONE, true);   // arc complete → "unburdened" barks (M2)
  // CANON write: a new life-event line in the vet's dossier (ohCode sentinel `oh:1`; rendered by dossierFileHTML)
  let wrote=null;
  if(br.ev!=null && vet && vet.lore){
    if(!Array.isArray(vet.lore.events)) vet.lore.events=[];
    vet.lore.events.push({ lvl:(visit||(vet.stars|0)), i:(br.ev|0), oh:1, npc:npcId||null });
    wrote = br.ev|0;
    // the NPC counterpart's own life-event log (NPC-perspective pool; off-hours codes 4000+; rendered by npcStatusEvents)
    if(typeof _npcEvPush==='function' && CAMPAIGN.npc && CAMPAIGN.npc.byId && npcId && CAMPAIGN.npc.byId[npcId]
       && OFFHOURS.npcEvents && OFFHOURS.npcEvents[br.ev|0])
      _npcEvPush(CAMPAIGN.npc.byId[npcId], visit, 4000 + (br.ev|0));
  }
  // vet↔vet: the OTHER veteran shares the night — mirror the dossier line into their file too
  if(br.ev!=null && npcId && /^(lore:|hero:|unit:)/.test(npcId)){
    const other=_ohFindVet(state, npcId);
    if(other && other.lore){ if(!Array.isArray(other.lore.events)) other.lore.events=[];
      other.lore.events.push({ lvl:(visit||(other.stars|0)), i:(br.ev|0), oh:1, npc:payload.vetKey }); }
  }
  // light fx — capstone delegates to the existing dream-fulfillment path; relief reuses the field-relief shape
  if(br.fx && vet){
    if(br.fx.t==='capstone' && typeof applyEventFx==='function') applyEventFx(vet, br.fx, state);
    else if(br.fx.t==='relief') ohApplyRelief(vet, br.fx, state);
  }
  return { ok:true, landed, reply: ohFill(br.reply, vet, npcId), leveled: lvl.leveled, tier: bond.t, points: bond.p, wrote };
}
function _ohFindVet(state, vetKey){
  const ents = (state && state.entities) ? state.entities : ((typeof G!=='undefined'&&G)?G.entities:[]);
  for(const e of ents){ if(e && !e.dead && e.kind==='unit' && e.owner==='player' && ohUnitKey(e)===vetKey) return e; }
  return null;
}
function ohApplyRelief(u, fx, state){      // H1 — reuse the Mindfulness-Facilitator field-relief shape (js/madosis.js)
  const frac=(fx&&fx.frac)||0.3, room=(u.madosis||0)-(u.madRelief||0);
  const add=Math.max(0, Math.min((u.madosis||0)*frac - (u.madRelief||0), room));
  if(add>0){ u.madRelief=(u.madRelief||0)+add; u.madReliefT=(typeof MADOSIS!=='undefined'&&MADOSIS.fieldRelief?MADOSIS.fieldRelief.durationSec:30); u._madTendedAt=(state?state.time:0); }
}

// M2: does this veteran have any completed Off-Hours arc (fl & ARC_DONE)? → "unburdened" barks.
function ohVetHasArc(u){
  const B=ohBonds(); if(!B || !u) return false; const k=ohUnitKey(u); if(!k) return false;
  for(const id in B){ if(id.indexOf(k)>=0 && ((B[id].fl|0) & OH_FL.ARC_DONE)) return true; }
  return false;
}

/* ---- publish on window (classic global-scope) ---- */
if(typeof window !== 'undefined'){
  window.ohVetHasArc = ohVetHasArc;
  window.ohPartyName = ohPartyName;
  window.ohCompat = ohCompat; window.ohCompatKind = ohCompatKind; window.ohSeedClub = ohSeedClub;
  window.ohVetMood = ohVetMood; window.ohNeedsNight = ohNeedsNight;
  window.ohDeploySynergy = ohDeploySynergy; window.ohGriefPartners = ohGriefPartners; window.ohKeepsakeBonus = ohKeepsakeBonus;
  window.ohLatestVersion = ohLatestVersion; window.ohPoolLens = ohPoolLens; window.ohPickN = ohPickN;
  window.ohUnitKey = ohUnitKey; window.ohBondId = ohBondId;
  window.ohLedger = ohLedger; window.ohBonds = ohBonds; window.ohKindCode = ohKindCode; window.ohKindName = ohKindName;
  window.ohGetBond = ohGetBond; window.ohEnsureBond = ohEnsureBond;
  window.ohTierFor = ohTierFor; window.ohTierName = ohTierName; window.ohGrantPoints = ohGrantPoints;
  window.ohMarkSeen = ohMarkSeen; window.ohHasSeen = ohHasSeen;
  window.OH_FL = OH_FL; window.ohSetFlag = ohSetFlag; window.ohHasFlag = ohHasFlag;
  window.ohFixedNpc = ohFixedNpc; window.ohNpcName = ohNpcName; window.ohFill = ohFill;
  window.ohSeedConfidant = ohSeedConfidant; window.ohSeedVetBonds = ohSeedVetBonds;
  window.ohSceneFor = ohSceneFor; window.ohSceneChoices = ohSceneChoices; window.ohSceneEligible = ohSceneEligible;
  window.ohApproachWeight = ohApproachWeight; window.applyOffhoursCommit = applyOffhoursCommit;
  window.ohVetHas = _ohVetHas;
}
