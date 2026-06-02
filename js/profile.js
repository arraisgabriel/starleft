/* js/profile.js — CLASSIC. Local multiplayer identity + known-players ("friends") list.
   No server: identity is a stable UUID + an editable handle in localStorage (starleft.mp.*).
   Friends are people you've actually played with, auto-remembered after a match. */
const MP_PROFILE_KEY = 'starleft.mp.profile';
const MP_FRIENDS_KEY = 'starleft.mp.friends';

function _mpUuid(){
  try { if(self.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(_){}
  return 'u' + Date.now().toString(36) + '-' + Math.floor(Math.random()*1e9).toString(36);
}
function getOrCreateProfile(){
  let p=null; try { p=JSON.parse(localStorage.getItem(MP_PROFILE_KEY)); } catch(_){}
  if(!p || !p.id){ p={ id:_mpUuid(), handle:'' }; saveProfile(p); }
  if(!p.handle) p.handle = 'Operator-' + String(p.id).replace(/[^a-z0-9]/gi,'').slice(0,4);
  return p;
}
function saveProfile(p){ try { localStorage.setItem(MP_PROFILE_KEY, JSON.stringify(p)); } catch(_){} }
function setHandle(h){ const p=getOrCreateProfile(); p.handle=(h||'').trim().slice(0,20)||p.handle; saveProfile(p); return p.handle; }

function getFriends(){ try { return JSON.parse(localStorage.getItem(MP_FRIENDS_KEY))||[]; } catch(_){ return []; } }
function rememberFriend(id, handle){
  if(!id) return;
  const list=getFriends(), now=Date.now(), f=list.find(x=>x.id===id);
  if(f){ f.handle=handle||f.handle; f.lastSeen=now; }
  else list.push({ id, handle:handle||'Operator', lastSeen:now });
  list.sort((a,b)=>b.lastSeen-a.lastSeen);
  try { localStorage.setItem(MP_FRIENDS_KEY, JSON.stringify(list.slice(0,50))); } catch(_){}
}
