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

/* ---- publish on window (classic global-scope) ---- */
if(typeof window !== 'undefined'){
  window.ohLatestVersion = ohLatestVersion; window.ohPoolLens = ohPoolLens; window.ohPickN = ohPickN;
  window.ohUnitKey = ohUnitKey; window.ohBondId = ohBondId;
  window.ohLedger = ohLedger; window.ohBonds = ohBonds; window.ohKindCode = ohKindCode; window.ohKindName = ohKindName;
  window.ohGetBond = ohGetBond; window.ohEnsureBond = ohEnsureBond;
  window.ohTierFor = ohTierFor; window.ohTierName = ohTierName; window.ohGrantPoints = ohGrantPoints;
  window.ohMarkSeen = ohMarkSeen; window.ohHasSeen = ohHasSeen;
  window.OH_FL = OH_FL; window.ohSetFlag = ohSetFlag; window.ohHasFlag = ohHasFlag;
}
