/* npc_lore.js — living-city NPC identity, persistence and dossiers.
   The H.U.B.'s civilian population: each veteran's RELATIVE (the exact person their
   dossier names) and 0-2 FRIENDS, per-facility SERVICE PROVIDERS, and ULTRA HQ
   commuters. Identity is derived, never stored: a persisted record in CAMPAIGN.npc.byId
   holds only the derivation inputs + life-event log + flags; names/backstories regenerate
   deterministically from seeds (same philosophy as buildDossier in lore.js).

   Movement/schedules/rendering live in js/hub_npcs.js (HUBNPC); this file owns WHO
   exists and WHAT their story is. Loaded after lore.js (uses _loHash/_loPickN/_poolLens/
   buildDossier/LORE_DATA at call time) and after npc_lore_data.js (NPC_LORE pools).

   Persisted record (CAMPAIGN.npc.byId[id], all fields short on purpose — saves carry them):
     v    NPC_LORE content-version at mint (gates NPC pools)
     lvD  LORE_DATA content-version at mint (gates name/surname/hometown picks)
     mv   CAMPAIGN.visit at mint (life-event accrual starts here)
     t    relatives/friends: linked vet's unit type (shapes the vet's name stream)
     lvv  relatives/friends: linked vet's lore.v (replays the vet dossier exactly)
     hc   home condo id ('' = off-map commuter)
     ls   relatives/friends: last-seen vet stars (level-up linkage diff)
     fl   flags bitfield: 1=mourning, 2=reborn-seen, 4=dreamDone-seen
     ev   life-event log, FLAT [visit, code, visit, code, ...] pairs, capped 12 events.
          code < 1000 → NPC_LORE.events[code]; 1000+i linkGrief; 2000+i linkProud; 3000+i linkReborn. */

/* ---- ids: pure functions of what they describe (re-derivable, collision-free) ----
   nr:<vetKey>        relative (lore-keyed vets only — a hero's {rel} isn't one person)
   nf:<vetKey>:<k>    friend k (lore vets + heroes)
   np:<poiId>:<slot>  service-provider staff slot
   nu:<slot>          ULTRA HQ commuter slot */
function npcStrHash(s){ let h=0x811c9dc5; s=s||''; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); } return h>>>0; }
function npcParseId(id){
  if(typeof id!=='string') return null;
  const c=id.split(':');
  if(c[0]==='nr' && c.length>=3) return { role:'relative', vetKey:c[1]+':'+c[2] };
  if(c[0]==='nf' && c.length>=4) return { role:'friend', vetKey:c[1]+':'+c[2], k:(+c[3]|0) };
  if(c[0]==='np' && c.length>=3) return { role:'provider', poiId:c[1], slot:(+c[2]|0) };
  if(c[0]==='nu' && c.length>=2) return { role:'ultra', slot:(+c[1]|0) };
  return null;
}
function _npcVetHash(vetKey){
  if(vetKey && vetKey.indexOf('lore:')===0){ const n=+vetKey.slice(5); if(isFinite(n)) return n>>>0; }
  return npcStrHash(vetKey);
}
function npcSeedFor(id){
  const p=npcParseId(id); if(!p) return 0;
  if(p.role==='relative') return _loHash((_npcVetHash(p.vetKey) ^ 0x52454C)>>>0);
  if(p.role==='friend')   return _loHash((_npcVetHash(p.vetKey) ^ (0x465249 + Math.imul((p.k|0)+1, 2654435761)))>>>0);
  const salt=(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.npc && CAMPAIGN.npc.seed)||1;
  if(p.role==='provider') return _loHash((salt ^ npcStrHash(p.poiId) ^ Math.imul((p.slot|0)+1, 2654435761))>>>0);
  return _loHash((salt ^ 0x554C5452 ^ Math.imul((p.slot|0)+1, 2654435761))>>>0);
}

/* ---- NPC_LORE content versioning (clone of lore.js's _latestVersion/_poolLens) ---- */
function npcLatestVersion(){ const V=(typeof NPC_LORE!=='undefined')&&NPC_LORE.versions; return (V&&V.length)?V.length:1; }
function npcPoolLens(v){
  const V=(typeof NPC_LORE!=='undefined')&&NPC_LORE.versions;
  if(!V||!V.length) return null;
  return V[Math.min(Math.max((v|0)||1,1),V.length)-1];
}

/* ---- population shape ---- */
const NPC_STAFF_COUNT = { mentalhealth:3, mdc:2, training:2, ultra:3, bar:1, club:1, diner:1 };   // providers per POI kind
// friend count per veteran: 25% none / 45% one / 30% two — derived, never stored
function _npcFriendCount(vetKey){
  const r=makeRng(_loHash((_npcVetHash(vetKey) ^ 0x4643)>>>0) % 233280);
  const x=r(); return x<0.25?0 : x<0.70?1 : 2;
}
const _NPC_REL_GENDER = { sister:'f', mother:'f', daughter:'f', grandmother:'f', aunt:'f',
                          brother:'m', father:'m', son:'m', grandfather:'m', uncle:'m' };
const _NPC_BLOOD = { sister:1, brother:1, mother:1, father:1, son:1, daughter:1,
                     grandmother:1, grandfather:1, uncle:1, aunt:1, cousin:1 };
// profession pool per role/POI kind → [pool array, versions-row key]
function _npcProfPool(p){
  const P=NPC_LORE.professions;
  if(p.role==='ultra') return [P.ultra,'profUltra'];
  if(p.role==='provider'){
    const cfg=(typeof hubPoiConfig==='function')?hubPoiConfig(p.poiId):null;
    const kind=(cfg&&cfg.kind)||p.poiId;
    if(kind==='training')     return [P.training,'profTraining'];
    if(kind==='mdc')          return [P.mdc,'profMdc'];
    if(kind==='mentalhealth') return [P.mentalhealth,'profMentalhealth'];
    return [P.ultraservice,'profUltraservice'];
  }
  return [P.civilian,'profCivilian'];
}
function _npcNamePool(g, L){
  const X=(LORE_DATA.namesX||[]).slice(0, L?L.namesX:undefined);
  const base=(g==='f'?(LORE_DATA.namesF||[]):(LORE_DATA.namesM||[])).slice(0, L?(g==='f'?L.namesF:L.namesM):undefined);
  const pool=base.concat(X);
  return pool.length?pool:(LORE_DATA.firstNames||['Unknown']);
}
function _npcPoiName(id){
  const cfg=(typeof hubPoiConfig==='function')?hubPoiConfig(id):null;
  return (cfg&&cfg.name)||id||'the H.U.B.';
}
// the linked veteran's dossier, replayed exactly as the vet sees it (their type + lore.v)
function _npcVetDossier(p, rec){
  if(!p || !p.vetKey) return null;
  if(p.vetKey.indexOf('lore:')===0){
    const seed=+p.vetKey.slice(5);
    if(!isFinite(seed)) return null;
    try{ return buildDossier({ type:rec.t||'soldier', lore:{ seed:seed>>>0, v:rec.lvv||1, events:[] } }); }
    catch(_){ return null; }
  }
  const nm=p.vetKey.slice(p.vetKey.indexOf(':')+1) || 'a veteran';   // hero:<id> → the id IS the display name
  return { first:nm, full:nm, last:'', home:'parts unknown', rel:'', relName:'' };
}

/* ---- dossier generation (pure + memoized) ----
   FROZEN RNG DRAW ORDER — append-only forever, every role consumes the same stream:
   1 gender coin · 2 first name · 3 surname · 4 hometown · 5 profession · 6 backstory · 7-8 chores.
   Relatives consume the draws then OVERWRITE name/surname/hometown from the veteran's own
   dossier so the prose matches ("kid sister, Maria" → NPC Maria, family surname, same town). */
const _npcDossierCache = new Map();
function buildNpcDossier(id){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN || !CAMPAIGN.npc) return null;
  const rec=CAMPAIGN.npc.byId && CAMPAIGN.npc.byId[id];
  const p=npcParseId(id);
  if(!rec || !p) return null;
  // hand-authored fixed-identity NPCs (the Off-Hours bartender confidant — D2/D3): short-circuit the seeded draw.
  if(rec.fixed && typeof ohFixedNpc==='function'){ const fd=ohFixedNpc(rec.fixed, id); if(fd) return fd; }
  const ck=id+'|'+(rec.v||1)+'|'+(rec.lvD||1)+'|'+(rec.t||'')+'|'+(rec.lvv||0)+'|'+(rec.hc||'');
  if(_npcDossierCache.has(ck)) return _npcDossierCache.get(ck);
  const seed=npcSeedFor(id);
  const L=_poolLens(rec.lvD||1);          // LORE_DATA pools as they stood at NPC mint
  const NL=npcPoolLens(rec.v||1);         // NPC_LORE pools at NPC mint
  const r=makeRng(seed % 233280);
  const gRoll=r();                                                        // 1
  const vd=_npcVetDossier(p, rec);
  const relWord=(p.role==='relative' && vd && vd.rel)?vd.rel:(p.role==='friend'?'friend':'');
  let gender=_NPC_REL_GENDER[relWord] || (gRoll<0.5?'m':'f');
  let first=_loPick(r, _npcNamePool(gender, L));                          // 2
  let last=_loPickN(r, LORE_DATA.surnames, L&&L.surnames);                // 3
  let home=_loPickN(r, LORE_DATA.hometowns, L&&L.hometowns);              // 4
  const pp=_npcProfPool(p);
  const profession=_loPickN(r, pp[0], NL&&NL[pp[1]]) || '';               // 5
  const backPool=NPC_LORE.back[p.role==='ultra'?'ultra':p.role] || NPC_LORE.back.friend;
  const backKey={relative:'backRelative', friend:'backFriend', provider:'backProvider', ultra:'backUltra'}[p.role];
  const backT=_loPickN(r, backPool, NL&&NL[backKey]) || '';               // 6
  const chT1=_loPickN(r, NPC_LORE.chores, NL&&NL.chores) || '';           // 7
  const chT2=_loPickN(r, NPC_LORE.chores, NL&&NL.chores) || '';           // 8
  // relative coherence: the dossier already named this person — replay, don't re-derive
  if(p.role==='relative' && vd){
    if(vd.relName) first=vd.relName;
    if(_NPC_BLOOD[relWord] && vd.last) last=vd.last;   // partners keep their own surname
    if(vd.home) home=vd.home;
  }
  const full=(first+' '+(last||'')).trim();
  const vetFirst=(vd&&vd.first)||'the veterans';
  const vetFull=(vd&&vd.full)||'the veterans';
  const poiName=(p.role==='provider')?_npcPoiName(p.poiId):(p.role==='ultra'?_npcPoiName('ultra'):'the H.U.B.');
  const condoName=rec.hc?_npcPoiName(rec.hc):'the outer sprawl';
  const fill=(t)=> (t||'')
    .replace(/\{me\}/g, first).replace(/\{full\}/g, full)
    .replace(/\{home\}/g, home)
    .replace(/\{rel\}/g, relWord||'friend')
    .replace(/\{vetFull\}/g, vetFull).replace(/\{vet\}/g, vetFirst)
    .replace(/\{prof\}/g, profession)
    .replace(/\{poi\}/g, poiName)
    .replace(/\{condo\}/g, condoName);
  const d={ id, role:p.role, first, last, full, gender, home, rel:relWord,
    vetKey:p.vetKey||null, vetFirst:(vd?vetFirst:''), vetFull:(vd?vetFull:''),
    profession, workPoiName:poiName, condoName,
    backstoryText:_loCap(fill(backT)), chores:[chT1, chT2], fill };
  _npcDossierCache.set(ck, d);
  return d;
}

/* Ambient spoken line for a passing NPC (story-polish §8.2). Pure read of the NPC's persisted
   flags + dossier + campaign progress — never mutates state, never stored. Category: a mourning/
   reborn-flagged NPC speaks to that; ULTRA commuters carry a Tusk seed only in Arc 2 and only for a
   deterministic third of them (oblique, ≤1 channel/episode); providers get facility lines; everyone
   else gets the war-from-home pool. Returns a filled string, or null if nothing fits. */
function npcAmbientLine(id){
  if(typeof NPC_LORE==='undefined' || !NPC_LORE.ambient) return null;
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN || !CAMPAIGN.npc || !CAMPAIGN.npc.byId) return null;
  const rec=CAMPAIGN.npc.byId[id]; if(!rec) return null;
  const desc=(typeof buildNpcDossier==='function')?buildNpcDossier(id):null; if(!desc) return null;
  const A=NPC_LORE.ambient;
  const idx=(typeof CAMPAIGN.nextMapIndex==='number')?CAMPAIGN.nextMapIndex:0;
  let pool;
  if(rec.fl & 1) pool=A.mourning;                                   // a linked vet fell
  else if(rec.fl & 2) pool=A.reborn;                                // a linked vet was written back
  else if(desc.role==='ultra') pool=(idx>=7 && A.tusk && A.tusk.length && (npcStrHash(id)%3===0)) ? A.tusk : A.commuter;
  else if(desc.role==='provider') pool=A.staff;
  else pool=A.general;
  if(!pool || !pool.length) pool=A.general;
  if(!pool || !pool.length) return null;
  // deterministic-ish pick salted by id + hub visit → the same NPC varies its line across visits
  const salt=(npcStrHash(id) ^ Math.imul((CAMPAIGN.visit||0)+1, 0x9e3779b1)) >>> 0;
  const line=pool[salt % pool.length];
  return (desc.fill?desc.fill(line):line) || null;
}
if(typeof window!=='undefined') window.npcAmbientLine = npcAmbientLine;

/* ---- life-event log ---- */
function _npcEvPush(rec, visit, code){
  rec.ev.push(visit|0, code|0);
  while(rec.ev.length>24) rec.ev.splice(0,2);   // cap 12 events; prose regenerates, trimming is lossless
}
// per-visit roll: pure function of (seed, V) → re-running a visit can never reroll differently
function _npcAccrue(rec, seed, visit){
  let last=rec.mv|0;
  for(let i=0;i<rec.ev.length;i+=2) if(rec.ev[i]>last) last=rec.ev[i];
  const NL=npcPoolLens(rec.v||1);
  const evLen=Math.min(NL?NL.events:NPC_LORE.events.length, NPC_LORE.events.length);
  const linked=!!(rec.t!=null || rec.lvv!=null);
  for(let V=last+1; V<=visit; V++){
    const r=makeRng((((seed + V*101 + 13)>>>0)) % 233280);
    if(r()>=0.45) continue;
    const used=new Set(); for(let i=1;i<rec.ev.length;i+=2){ if(rec.ev[i]<1000) used.add(rec.ev[i]); }
    let pool=[];
    for(let i=0;i<evLen;i++){ const e=NPC_LORE.events[i];
      if(used.has(i)) continue;
      if(e.req==='linked' && !linked) continue;
      pool.push(i);
    }
    if(!pool.length) for(let i=0;i<evLen;i++){ const e=NPC_LORE.events[i]; if(e.req!=='linked'||linked) pool.push(i); }
    if(!pool.length) continue;
    _npcEvPush(rec, V, pool[(r()*pool.length)|0]);
  }
}
// linkage events (vet fell / leveled / came back) — diff-gated, seeded by (npc, visit)
function _npcLinkEvent(rec, seed, visit, base, poolKey, vKey){
  const NL=npcPoolLens(rec.v||1);
  const len=Math.min(NL?NL[vKey]:NPC_LORE[poolKey].length, NPC_LORE[poolKey].length);
  if(!len) return;
  const r=makeRng(_loHash((seed ^ Math.imul((visit|0)+1, 131))>>>0) % 233280);
  _npcEvPush(rec, visit, base + ((r()*len)|0));
}
// resolved life-event log for UI: [{visit, text}]
function npcStatusEvents(id){
  const rec=(typeof CAMPAIGN!=='undefined' && CAMPAIGN && CAMPAIGN.npc && CAMPAIGN.npc.byId)?CAMPAIGN.npc.byId[id]:null;
  const d=buildNpcDossier(id);
  if(!rec || !d) return [];
  const out=[];
  for(let i=0;i+1<rec.ev.length;i+=2){
    const V=rec.ev[i], code=rec.ev[i+1];
    let t=null;
    if(code>=4000) t=(typeof OFFHOURS!=='undefined' && OFFHOURS.npcEvents && OFFHOURS.npcEvents[code-4000]) ? OFFHOURS.npcEvents[code-4000] : null;   // Off-Hours NPC-perspective lines
    else if(code>=3000) t=NPC_LORE.linkReborn[code-3000];
    else if(code>=2000) t=NPC_LORE.linkProud[code-2000];
    else if(code>=1000) t=NPC_LORE.linkGrief[code-1000];
    else t=NPC_LORE.events[code] && NPC_LORE.events[code].text;
    if(t) out.push({ visit:V, text:_loCap(d.fill(t)) });
  }
  return out;
}

/* ---- minting + roster diffs (idempotent; called on every hub entry + save-load) ---- */
let _npcRosterCache=null;
function _npcMint(byId, id, fields){
  if(byId[id]) return byId[id];
  byId[id]=Object.assign({ v:npcLatestVersion(), lvD:_latestVersion(),
    mv:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN)?(CAMPAIGN.visit|0):0,
    hc:'', fl:0, ev:[] }, fields||{});
  return byId[id];
}
// least-NPC-populated condo (deterministic tie-break by condo order) — providers move in here
function _npcQuietestCondo(byId){
  const ids=(typeof hubCondoIds==='function')?hubCondoIds():[];
  if(!ids.length) return '';
  let best=ids[0], bestN=Infinity;
  for(const cid of ids){
    let n=0; for(const k in byId) if(byId[k].hc===cid) n++;
    if(n<bestN){ best=cid; bestN=n; }
  }
  return best;
}
function _npcCondoForVet(vetKey, seed){
  const condo=(typeof hubCondoForUnit==='function')?hubCondoForUnit(vetKey):null;
  if(condo && condo.id) return condo.id;
  const ids=(typeof hubCondoIds==='function')?hubCondoIds():[];
  return ids.length?ids[seed % ids.length]:'';
}
function hubSyncNpcs(){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN) return;
  if(typeof NPC_LORE==='undefined' || typeof LORE_DATA==='undefined' || typeof makeRng!=='function') return;
  if(!CAMPAIGN.npc || typeof CAMPAIGN.npc!=='object') CAMPAIGN.npc={seed:0, byId:{}};
  const N=CAMPAIGN.npc;
  if(!N.byId || typeof N.byId!=='object') N.byId={};
  if(!(N.seed>0)) N.seed=((Math.random()*0x7fffffff)|0)||1;   // campaign-stable salt, minted once
  const byId=N.byId, visit=CAMPAIGN.visit|0;

  // -- statics: facility staff + ULTRA commuters (existence keyed by id → idempotent) --
  for(const poi of ((typeof HUB!=='undefined' && HUB.pois)||[])){
    const cnt=NPC_STAFF_COUNT[poi.kind]||0;
    for(let s=0;s<cnt;s++){
      const id='np:'+poi.id+':'+s;
      if(!byId[id]){
        const fields={ hc:_npcQuietestCondo(byId) };
        // Off-Hours venue staff slot 0 is a hand-authored fixed identity (e.g. the bartender confidant).
        if(s===0 && typeof OFFHOURS!=='undefined' && OFFHOURS.venueStaffFixed && OFFHOURS.venueStaffFixed[poi.kind]) fields.fixed=OFFHOURS.venueStaffFixed[poi.kind];
        _npcMint(byId, id, fields);
      }
    }
  }
  { const r=makeRng(_loHash((N.seed ^ 0x554C)>>>0) % 233280);
    const cnt=8+((r()*7)|0);                                  // 8-14 commuters, campaign-stable
    for(let s=0;s<cnt;s++){ const id='nu:'+s; if(!byId[id]) _npcMint(byId, id, { hc:'' }); } }

  // -- vet-linked: relatives + friends, condo follow, level-up linkage --
  const rosterKeys=new Set();
  for(const rsnap of (CAMPAIGN.roster||[])){
    const key=rsnap&&rsnap.key; if(!key) continue;
    rosterKeys.add(key);
    const isLore=key.indexOf('lore:')===0, isHero=key.indexOf('hero:')===0;
    if(!isLore && !isHero) continue;                          // 'unit:' fallback keys have no stable seed
    const vh=_npcVetHash(key);
    const linkFields={ t:rsnap.type||'soldier', lvv:(rsnap.lore&&rsnap.lore.v)||1, ls:rsnap.stars|0 };
    const homeId=_npcCondoForVet(key, vh);
    const ids=[];
    if(isLore) ids.push('nr:'+key);                           // a hero's {rel} isn't one person — friends only
    const fc=_npcFriendCount(key);
    for(let k=0;k<fc;k++) ids.push('nf:'+key+':'+k);
    for(const id of ids){
      const rec=byId[id] || _npcMint(byId, id, Object.assign({ hc:homeId }, linkFields));
      if(rec.t==null) rec.t=linkFields.t;                     // back-fill older records
      if(rec.lvv==null) rec.lvv=linkFields.lvv;
      if(homeId && rec.hc!==homeId) rec.hc=homeId;            // the household moves with the veteran
      if((rsnap.stars|0) > (rec.ls|0)){                       // vet leveled since last sync → pride event
        _npcLinkEvent(rec, npcSeedFor(id), visit, 2000, 'linkProud', 'linkProud');
        rec.ls=rsnap.stars|0;
      }
      if(rec.fl&1){                                           // was mourning + vet is back → The Wake worked
        rec.fl=(rec.fl&~1)|2;
        _npcLinkEvent(rec, npcSeedFor(id), visit, 3000, 'linkReborn', 'linkReborn');
      }
    }
  }

  // -- death diff: linked NPCs whose veteran left the roster into the memorial --
  let fallenIds=null;
  for(const id in byId){
    const p=npcParseId(id);
    if(!p || !p.vetKey || rosterKeys.has(p.vetKey)) continue;
    const rec=byId[id];
    if(rec.fl&1) continue;                                    // already mourning
    if(fallenIds===null){
      fallenIds=new Set();
      if(typeof fallenVets!=='undefined' && typeof fallenStableId==='function')
        for(const f of fallenVets) fallenIds.add(fallenStableId(f));
    }
    if(fallenIds.has('f_'+p.vetKey)){
      rec.fl|=1;
      _npcLinkEvent(rec, npcSeedFor(id), visit, 1000, 'linkGrief', 'linkGrief');
    }
  }

  // -- per-visit life events for everyone --
  for(const id in byId) _npcAccrue(byId[id], npcSeedFor(id), visit);
  _npcRosterCache=null;
}

/* ---- descriptor list for the sim/UI workstreams ---- */
function hubNpcRoster(){
  if(typeof CAMPAIGN==='undefined' || !CAMPAIGN) return [];
  if(!CAMPAIGN.npc || !(CAMPAIGN.npc.seed>0)) hubSyncNpcs();
  if(_npcRosterCache) return _npcRosterCache;
  const out=[], byId=(CAMPAIGN.npc&&CAMPAIGN.npc.byId)||{};
  for(const id in byId){
    const p=npcParseId(id); if(!p) continue;
    const d=buildNpcDossier(id); if(!d) continue;
    const rec=byId[id];
    out.push({ id, seed:npcSeedFor(id), role:p.role, name:d.full, first:d.first, gender:d.gender,
      profession:d.profession, homePoi:rec.hc||'', workPoi:p.role==='provider'?p.poiId:(p.role==='ultra'?'ultra':null),
      linkedVetKey:p.vetKey||null, rel:d.rel||'', vetFull:d.vetFull||'', mourning:!!(rec.fl&1), chores:d.chores });
  }
  out.sort((a,b)=> a.id<b.id?-1:(a.id>b.id?1:0));   // deterministic order for UI/sim stability
  _npcRosterCache=out;
  return out;
}

/* ---- resident file body (the NPC analogue of dossierFileHTML, consumed by ui.js) ---- */
function npcDossierFileHTML(id){
  const d=buildNpcDossier(id);
  if(!d) return '<div class="dk">Resident file</div><div class="dossier-prose"><p>File pending — the registry is still syncing.</p></div>';
  const rec=CAMPAIGN.npc.byId[id];
  let h='';
  h+='<div class="dk">Resident file</div><div class="dossier-prose">';
  h+='<p>'+d.full+', of '+_loCap(d.home)+'.'+(d.vetKey?(' '+_loCap(d.rel||'friend')+' of '+d.vetFull+'.'):'')+'</p>';
  h+='<p>'+d.backstoryText+'</p>';
  if(rec && (rec.fl&1)) h+='<p class="assess">In mourning. The H.U.B. owes this household more than a fruit basket.</p>';
  if(rec && (rec.fl&2)) h+='<p class="assess">Their veteran came back through the Wake. The household is still deciding what that means.</p>';
  h+='</div>';
  h+='<div class="dk">Around town</div><div class="dossier-prose"><p>Usually found '+d.chores[0]+', or '+d.chores[1]+'.</p></div>';
  h+='<div class="dk">Life in the H.U.B.</div><ol class="dossier-log">';
  const evs=npcStatusEvents(id);
  if(!evs.length) h+='<li>No entries yet — the city writes slowly.</li>';
  for(const e of evs) h+='<li><b>Visit '+e.visit+'</b> — '+e.text+'</li>';
  h+='</ol>';
  return h;
}
