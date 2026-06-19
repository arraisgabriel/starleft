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
// + campaign-aware tokens {fallen}/{lastmap} (degrade to neutral phrasing if the data isn't there yet).
function ohFill(text, vet, npcId){
  if(text==null) return '';
  let s=String(text);
  if(vet && vet.lore && typeof buildDossier==='function'){ try{ s = buildDossier(vet).fill(s); }catch(_){ } }
  s = s.replace(/\{npc\}|\{them\}/g, npcId ? ohPartyName(npcId) : '');
  if(s.indexOf('{fallen}')>=0) s = s.replace(/\{fallen\}/g, ohFallenName(vet));
  if(s.indexOf('{lastmap}')>=0) s = s.replace(/\{lastmap\}/g, ohLastMap());
  return s;
}
// a fallen comrade's first name — deterministic per vet so a scene names the same person each time. Safe noun.
function ohFallenName(vet){
  const F=(typeof fallenVets!=='undefined' && Array.isArray(fallenVets))?fallenVets:[];
  if(!F.length) return 'the ones who didn’t make it back';
  const seed=(vet&&vet.lore&&vet.lore.seed!=null)?(vet.lore.seed>>>0):0;
  const f=F[seed % F.length]; const nm=(f&&f.name)?String(f.name).split(' ')[0]:''; return nm||'them';
}
function ohLastMap(){ return (typeof G!=='undefined' && G && G.cfg && G.cfg.name) ? G.cfg.name : 'the last drop'; }

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
// vet↔vet kind at mint: a wide star gap → mentor (senior takes a junior under their wing); otherwise friend/rival by
// compatibility. Romance is NEVER minted here — it is never the first conversation type. It DRIFTS out of a close
// friendship (ohMaybeRomance) so the player builds to it. Deterministic; idempotent (never changes an existing kind).
function ohSeedClub(vetKeyA, vetA, vetKeyB, vetB){
  if(!vetKeyA || !vetKeyB) return null;
  const T=OFFHOURS.tune.compat, score=ohCompat(vetA, vetB);
  const gap=Math.abs((vetA&&vetA.stars||0)-(vetB&&vetB.stars||0));
  const kind = (gap >= (T.mentorGap||3)) ? 'mentor' : ohCompatKind(score);   // friend | rival | mentor — never romance
  return ohEnsureBond(vetKeyA, vetKeyB, kind);
}
// romantic chemistry — SEPARATE from ohCompat and deliberately PERMISSIVE: a high positive baseline and NO shared-
// hometown requirement. Rewards SHARED VALUES (same hometown / same dream / opposite archetype) that genuinely vary
// pair-to-pair, so a real spread emerges instead of "everyone clicks". Deterministic (seeded off the pair's lore
// seeds), range 0..1. Reads dossiers; returns 0 if either lacks one (so it never flips). Drives ohRomanceSpeed.
function ohRomanceSpark(a, b){
  if(!a || !b || !a.lore || !b.lore || typeof buildDossier!=='function') return 0;
  let da, db; try{ da=buildDossier(a); db=buildDossier(b); }catch(_){ return 0; }
  const T=OFFHOURS.tune.compat; let c = (T.romancePull!=null ? T.romancePull : 0.38);   // baseline pull → easy
  if(da.home  && da.home===db.home)   c += 0.16;   // the SAME hometown — an uncommon, real draw (NOT required)
  if(da.dream && da.dream===db.dream) c += 0.13;   // the SAME dream — kindred ambition
  if(a.type!==b.type)                 c += 0.06;   // opposites attract; same archetype is a touch flat…
  else                                c -= 0.05;   // …two of a kind cool slightly
  if(da.trauma && db.trauma)          c += 0.05;   // two haunted people lean on each other
  const seed=(_loHash(((a.lore.seed ^ b.lore.seed ^ 0x9e3779b9) >>> 0))) % 233280;   // distinct from ohCompat's seed
  c += (makeRng(seed)() - 0.5) * 0.34;            // wide jitter → genuine spread (some pairs just never click)
  return Math.max(0, Math.min(1, c));
}
// the friend tier at which a pair's friendship drifts into romance: strong chemistry couples FAST (the first eligible
// tier), faint chemistry is a slow burn a tier or two on, and only a near-zero spark stays platonic forever. So it's
// easy to make almost ANY two hook up — chemistry sets the SPEED, not whether — yet a few pairs stay just friends.
function ohRomanceSpeed(spark){
  const T=OFFHOURS.tune.compat, base=(T.romanceTier!=null ? T.romanceTier : 1);
  if(spark < (T.romanceFloor!=null ? T.romanceFloor : 0.30)) return Infinity;        // never clicks → platonic
  if(spark >= (T.romanceFast!=null ? T.romanceFast : 0.58)) return base;             // strong → couples fast
  if(spark >= (T.romanceWarm!=null ? T.romanceWarm : 0.45)) return base+1;           // warm → a tier later
  return base+2;                                                                     // faint → a slow burn
}
// E7 — a vet↔vet bond drifts into romance. Call on a bond's tier-up: once it reaches the chemistry-set drift tier
// (always >= romanceTier, so never the opener), a friend / rival / mentor bond becomes a romance — friends fall for
// each other, rivals can't quit each other (enemies-to-lovers), a mentor bond deepens — and the early romance scenes
// (the held look, the smoke break) then play as the courtship. ANY vet↔vet relationship can get there so the player
// can couple almost any two they choose (the "must be easy to hook up" rule); only the rare low-spark pair stays as
// it was. The bond's seen[]/tier/points are untouched (romance scenes have their own indices), so it's a clean kind
// flip. Returns true if it just flipped. Host-authoritative (only applyOffhoursCommit calls it).
function ohMaybeRomance(state, bond, aKey, bKey){
  if(!bond) return false;
  if((bond.k|0) === ohKindCode('romance')) return false;                      // already a couple
  if(!/^(lore:|hero:|unit:)/.test(bKey||'')) return false;                    // vet↔vet only (excludes kin/bartender)
  const a=_ohFindVet(state, aKey), b=_ohFindVet(state, bKey);
  if(!a || !b) return false;
  if((bond.t|0) < ohRomanceSpeed(ohRomanceSpark(a, b))) return false;         // chemistry-gated tier (never < romanceTier)
  bond.k = ohKindCode('romance');                                            // friend / rival / mentor → romance
  return true;
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
  if(r.need==='fallen' && !(typeof fallenVets!=='undefined' && fallenVets && fallenVets.length)) return false;   // campaign-aware: only fires once the player has losses
  const entry = (scene.beats && scene.beats[0]) ? scene.beats[0].choices : scene.choices;   // multi-beat gates on the ENTRY beat
  if(!entry || !entry.some(c => _ohVetHas(vet, c.gate))) return false;   // every entry choice gated out → skip
  return true;
}
// the venue's current scene for (vet, npc): one of the eligible, unseen scenes matching venue (+kind).
// When several are eligible we pick DETERMINISTICALLY among them — stable within a hub visit, but rotating
// across visits (and as scenes get marked seen). No Math.random → solo/host/client agree, saves replay the same.
function ohSceneFor(venue, kind, vet, bond){
  const elig=[];
  for(let i=0;i<OFFHOURS.scenes.length;i++){ const s=OFFHOURS.scenes[i];
    if(s.venue!==venue) continue; if(kind && s.kind && s.kind!==kind) continue;
    if(ohSceneEligible(s, i, vet, bond)) elig.push({ scene:s, idx:i });
  }
  if(elig.length<2) return elig[0] || null;
  const visit=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?(CAMPAIGN.visit|0):0;
  const seed=_loHash((((visit+1)*73856093) ^ (((bond?bond.p|0:0)+1)*19349663) ^ (elig.length*83492791)) >>> 0) % 233280;
  return elig[(makeRng(seed)() * elig.length) | 0];
}
// pick one opening line for a scene — `open` may be a single string or an array of variants. Deterministic per
// (visit, bond) so it's stable within a visit and rotates across visits. Always returns a string (legacy-safe).
function ohSceneOpen(scene, bond){
  if(!scene) return '';
  const o = (scene.beats && scene.beats[0]) ? scene.beats[0].open : scene.open;   // multi-beat: the entry beat opens
  if(!Array.isArray(o)) return o||'';
  if(o.length<2) return o[0]||'';
  const visit=(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?(CAMPAIGN.visit|0):0;
  const seed=_loHash((((visit+1)*2971215073) ^ (o.length*433494437) ^ (((bond?bond.p|0:0)+1)*28657)) >>> 0) % 233280;
  return o[(makeRng(seed)() * o.length) | 0] || o[0] || '';
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
// resolve ONE beat-choice deterministically WITHOUT mutating — shared by the UI (to navigate a conversation) and by
// the host (to re-derive the taken path on commit), so client and host always agree. Returns the chosen land/miss
// branch and the next beat index (null = terminal/scene-ends). Works for legacy single-beat scenes too (beatIdx 0).
function ohBeatStep(sceneIdx, scene, beatIdx, choiceIdx, bond, visit){
  const beat = (scene && scene.beats) ? scene.beats[beatIdx|0] : null;
  const choice = beat ? (beat.choices||[])[choiceIdx|0] : ((scene&&scene.choices)?scene.choices[choiceIdx|0]:null);
  if(!choice) return null;
  const seed = (scene && scene.beats) ? ((beatIdx|0)*101 + (choiceIdx|0)) : (choiceIdx|0);   // distinct per (beat,choice)
  const landed = choice.check ? ohCheckLands(bond, sceneIdx|0, seed, visit, choice.approach) : true;
  const br = landed ? choice.land : (choice.miss || choice.land);
  const next = (br && br.next!=null) ? (br.next|0) : null;
  return { landed:landed, br:br, choice:choice, next:next };
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
    const romanced = ohMaybeRomance(state, g, payload.vetKey, payload.npcId);   // a gift can be the move that tips a friendship over
    return { ok:true, gift:true, keepsake:first, romanced:romanced, tier:g.t,
      reply: romanced ? 'You bring something worth more than M3rit$. They go still — then their hand closes over yours and stays.'
           : first ? 'You bring something worth more than M3rit$. They keep it — and press something back into your hand.'
                   : 'They take it with a nod. The gauge ticks up.' };
  }
  const scene = OFFHOURS.scenes[payload.sceneIdx|0]; if(!scene) return null;
  const npcId = payload.npcId || (scene.with==='bartender' ? OFFHOURS.barNpc : null);
  const vet = _ohFindVet(state, payload.vetKey);
  const bond = ohEnsureBond(payload.vetKey, npcId, scene.kind); if(!bond) return null;
  if(ohHasSeen(bond, payload.sceneIdx|0)) return { already:true };          // idempotent
  // economy: a whole scene costs M3$ ONCE (not per beat). Ambient/caught are free & never committed here.
  if(typeof hubSpend==='function' && !hubSpend(OFFHOURS.tune.sceneCost|0)) return { broke:true };  // M3$ is the only gate (the per-visit 'nights' cap was removed)
  const visit = (typeof CAMPAIGN!=='undefined' && CAMPAIGN) ? (CAMPAIGN.visit|0) : 0;
  // re-walk the taken path: multi-beat scenes carry payload.path[] (one choiceIdx per beat); legacy scenes have a
  // single payload.choiceIdx. ohBeatStep is the SAME resolver the UI used to navigate, so the host re-derives identically.
  const branches=[]; let lastLanded=true, lastReply='…';
  if(Array.isArray(scene.beats) && scene.beats.length){
    const path = Array.isArray(payload.path) ? payload.path : [payload.choiceIdx|0];
    let bi=0, step=0;
    while(bi!=null && bi>=0 && bi<scene.beats.length && step<path.length && step<16){
      const r=ohBeatStep(payload.sceneIdx|0, scene, bi, path[step]|0, bond, visit); if(!r) break;
      branches.push({ br:r.br, approach:r.choice.approach, landed:r.landed });
      lastLanded=r.landed; lastReply=r.br.reply; bi=r.next; step++;
    }
  } else {
    const r=ohBeatStep(payload.sceneIdx|0, scene, 0, payload.choiceIdx|0, bond, visit); if(!r) return null;
    branches.push({ br:r.br, approach:r.choice.approach, landed:r.landed });
    lastLanded=r.landed; lastReply=r.br.reply;
  }
  if(!branches.length) return null;
  // points: sum each branch on the path; the terminal branch defaults to scenePts×approach-weight, mid-beats to 0
  let totalPts=0;
  branches.forEach(function(b,i){ const term=(i===branches.length-1);
    totalPts += (b.br.pts!=null) ? (b.br.pts|0) : (term ? Math.round(OFFHOURS.tune.scenePts*ohApproachWeight(b.approach)) : 0); });
  const lvl = ohGrantPoints(bond, totalPts, visit);
  // E7 — a close-enough friendship quietly becomes a couple once it reaches the chemistry-set tier (never the first
  // night; gated inside ohMaybeRomance). Cheap to call every commit — it early-returns for non-friend/non-vet bonds.
  const romanced = ohMaybeRomance(state, bond, payload.vetKey, npcId);
  ohMarkSeen(bond, payload.sceneIdx|0);                                       // a scene is logged seen ONCE, on completion
  branches.forEach(function(b){ if(b.br.fl && OH_FL[b.br.fl]!=null) ohSetFlag(bond, OH_FL[b.br.fl], true); });  // e.g. ARC_UNLOCKED
  if(bond.t>=OFFHOURS.tune.maxTier) ohSetFlag(bond, OH_FL.ARC_DONE, true);   // arc complete → "unburdened" barks (M2)
  // CANON write: the last branch on the path that carries an ev wins (the meaningful outcome) → vet's dossier (oh:1)
  let wrote=null, evVal=null;
  branches.forEach(function(b){ if(b.br.ev!=null) evVal=b.br.ev|0; });
  // dedup by (line, counterpart): a relationship milestone is logged ONCE — later nights deepen the bond, not re-log it.
  if(evVal!=null && vet && vet.lore){
    if(!Array.isArray(vet.lore.events)) vet.lore.events=[];
    const dup=vet.lore.events.some(function(e){ return e&&e.oh&&(e.i|0)===evVal&&(e.npc||null)===(npcId||null); });
    if(!dup){
      vet.lore.events.push({ lvl:(visit||(vet.stars|0)), i:evVal, oh:1, npc:npcId||null });
      wrote = evVal;
      if(typeof _npcEvPush==='function' && CAMPAIGN.npc && CAMPAIGN.npc.byId && npcId && CAMPAIGN.npc.byId[npcId]
         && OFFHOURS.npcEvents && OFFHOURS.npcEvents[evVal])
        _npcEvPush(CAMPAIGN.npc.byId[npcId], visit, 4000 + evVal);
    }
  }
  // vet↔vet: the OTHER veteran shares the night — mirror the dossier line into their file too (also deduped)
  if(evVal!=null && npcId && /^(lore:|hero:|unit:)/.test(npcId)){
    const other=_ohFindVet(state, npcId);
    if(other && other.lore){ if(!Array.isArray(other.lore.events)) other.lore.events=[];
      const dup2=other.lore.events.some(function(e){ return e&&e.oh&&(e.i|0)===evVal&&(e.npc||null)===payload.vetKey; });
      if(!dup2) other.lore.events.push({ lvl:(visit||(other.stars|0)), i:evVal, oh:1, npc:payload.vetKey }); }
  }
  // light fx — capstone delegates to the existing dream-fulfillment path; relief reuses the field-relief shape
  branches.forEach(function(b){ if(b.br.fx && vet){
    if(b.br.fx.t==='capstone' && typeof applyEventFx==='function') applyEventFx(vet, b.br.fx, state);
    else if(b.br.fx.t==='relief') ohApplyRelief(vet, b.br.fx, state);
  } });
  return { ok:true, landed:lastLanded, reply: ohFill(lastReply, vet, npcId), leveled: lvl.leveled, romanced: romanced, tier: bond.t, points: bond.p, wrote };
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
  window.ohRomanceSpark = ohRomanceSpark; window.ohRomanceSpeed = ohRomanceSpeed; window.ohMaybeRomance = ohMaybeRomance;
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
  window.ohSceneFor = ohSceneFor; window.ohSceneOpen = ohSceneOpen; window.ohSceneChoices = ohSceneChoices; window.ohSceneEligible = ohSceneEligible; window.ohBeatStep = ohBeatStep;
  window.ohApproachWeight = ohApproachWeight; window.applyOffhoursCommit = applyOffhoursCommit;
  window.ohVetHas = _ohVetHas;
}
