/* js/net/trystero-boot.js — the project's ONLY ES module.
   Imports the vendored Trystero (serverless WebRTC P2P over public Nostr relays), publishes a
   small classic-callable facade on window.MP, and signals readiness so the 28 classic scripts can
   use it without becoming modules themselves. Loaded LAST via <script type="module"> (deferred),
   so classic code must reach it through whenMP()/mpAvailable() (js/net/mp-ready.js), never eagerly.

   "Serverless" caveat: no app/game server and no signaling server we run — but Trystero still uses
   public Nostr relays for signaling and STUN for NAT discovery. STUN-only connects ~80-85% of peer
   pairs; symmetric-NAT pairs need a TURN relay the user can paste in the lobby (MP.setRelay). */

const APP_ID = 'starleft-coop-v1';      // Trystero appId namespace (isolates our rooms)
let RTC = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
] };

let joinRoom = null, selfId = null, loadErr = null;

// Phase 2b: track each peer's data channels so MP.bufferedAmount() can read SCTP send-queue depth for
// snapshot backpressure (Trystero hides its channels). Patch the prototype once, fully guarded.
try{
  if(typeof RTCPeerConnection!=='undefined' && !RTCPeerConnection.prototype.__sl_dcPatched){
    const _cdc = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function(){
      const dc = _cdc.apply(this, arguments);
      try{ (this.__sl_dcs || (this.__sl_dcs = [])).push(dc); }catch(_){}
      return dc;
    };
    RTCPeerConnection.prototype.__sl_dcPatched = true;
  }
}catch(_){}

// Vendored bundle first (offline-capable); esm.sh as a last-resort runtime fallback.
async function loadTrystero(){
  try { const m = await import('../vendor/trystero-nostr.min.js'); joinRoom = m.joinRoom; selfId = m.selfId; return true; }
  catch(e1){ loadErr = e1;
    try { const m = await import('https://esm.sh/trystero@0.21.5/nostr?bundle'); joinRoom = m.joinRoom; selfId = m.selfId; return true; }
    catch(e2){ loadErr = e2; return false; }
  }
}

function finishReady(){
  window.__MP_READY = true;
  try { window.dispatchEvent(new Event('mp:ready')); } catch(_){}
  if (Array.isArray(window.__mpReadyQueue)) { window.__mpReadyQueue.forEach(fn => { try{ fn(); }catch(_){} }); window.__mpReadyQueue.length = 0; }
}

(async () => {
  if (!(await loadTrystero())) {
    // Graceful unavailable stub — every method is a harmless no-op; the lobby disables itself.
    const off = () => () => {};
    window.MP = { unavailable:true, _err:String(loadErr), isReady:()=>false, inRoom:false,
      enter(){}, hostRoom(){}, joinRoom(){}, leaveRoom(){}, peers(){return[];},
      onPeer:off, onLeave:off, send(){}, on:off, bufferedAmount(){return 0;}, addVoice(){}, removeVoice(){}, onVoice:off,
      setRelay(){}, presence:{ join(){}, leave(){}, send(){}, on:off } };
    finishReady();
    return;
  }

  let room = null, presenceRoom = null, presSend = null;
  const actions = {};                                  // game-room tag -> { send }
  const listeners = {};                                // game-room tag -> Set(fn)
  const peerCbs = { join:new Set(), leave:new Set(), stream:new Set() };
  const presListeners = new Set();

  function ensureAction(tag){
    if (actions[tag]) return actions[tag];
    if (!room) return { send(){} };
    const [send, get] = room.makeAction(tag);          // Trystero typed data-channel action (tag ≤12 bytes)
    get((data, peerId) => { const s = listeners[tag]; if (s) s.forEach(fn => { try{ fn(data, peerId); }catch(_){} }); });
    return (actions[tag] = { send });
  }

  window.MP = {
    selfId, unavailable:false,
    isReady(){ return true; },
    get inRoom(){ return !!room; },

    // Append a user-supplied TURN relay for hard (symmetric-NAT) networks. Optional; STUN-only by default.
    setRelay(url, username, credential){
      if (url) RTC = { iceServers: RTC.iceServers.concat([{ urls:url, username, credential }]) };
    },

    // Host and join are symmetric in Trystero — both call joinRoom; mp.js decides netRole.
    enter(code){
      if (room) this.leaveRoom();
      room = joinRoom({ appId:APP_ID, rtcConfig:RTC }, code);
      room.onPeerJoin(id => peerCbs.join.forEach(fn => { try{ fn(id); }catch(_){} }));
      room.onPeerLeave(id => peerCbs.leave.forEach(fn => { try{ fn(id); }catch(_){} }));
      room.onPeerStream((stream, id) => peerCbs.stream.forEach(fn => { try{ fn(stream, id); }catch(_){} }));
      // Register the Trystero action for every listener bound BEFORE the room existed (e.g. lobby chat/emote,
      // wired at page load via whenMP). Without this their receiver is never created, so the peer only starts
      // RECEIVING that tag after it first SENDS on it — which is why client chat didn't reach the host.
      for (const tag in listeners) { try { ensureAction(tag); } catch(_){} }
      return code;
    },
    hostRoom(code){ return this.enter(code); },
    joinRoom(code){ return this.enter(code); },
    leaveRoom(){ if (room){ try{ room.leave(); }catch(_){} } room=null;
      for (const k in actions) delete actions[k]; for (const k in listeners) delete listeners[k]; },
    peers(){ try { return room ? Object.keys(room.getPeers()) : []; } catch(_){ return []; } },

    // Phase 2b: max SCTP send-queue depth across peer data channels (0 if unobservable) — drives snapshot backpressure.
    bufferedAmount(){
      try{
        if(!room || !room.getPeers) return 0;
        const peers = room.getPeers(); let max = 0;
        for(const id in peers){ const pc = peers[id], dcs = pc && pc.__sl_dcs; if(!dcs) continue;
          for(const dc of dcs){ const b = (dc && dc.bufferedAmount) || 0; if(b > max) max = b; } }
        return max;
      }catch(_){ return 0; }
    },

    onPeer(fn){ peerCbs.join.add(fn);  return () => peerCbs.join.delete(fn); },
    onLeave(fn){ peerCbs.leave.add(fn); return () => peerCbs.leave.delete(fn); },

    // data channel (typed actions). toPeerId omitted = broadcast.
    send(tag, data, toPeerId){ ensureAction(tag).send(data, toPeerId); },
    on(tag, fn){ (listeners[tag] || (listeners[tag] = new Set())).add(fn); ensureAction(tag);
      return () => { const s = listeners[tag]; if (s) s.delete(fn); }; },

    // voice (WebRTC media streams)
    addVoice(stream){ if (room) try{ room.addStream(stream); }catch(_){} },
    removeVoice(stream){ if (room) try{ room.removeStream(stream); }catch(_){} },
    onVoice(fn){ peerCbs.stream.add(fn); return () => peerCbs.stream.delete(fn); },

    // global presence room (opt-in discovery of online friends) — a 2nd, separate Trystero room
    presence: {
      join(){ if (presenceRoom) return;
        presenceRoom = joinRoom({ appId:APP_ID, rtcConfig:RTC }, 'starleft-presence');
        const [s, g] = presenceRoom.makeAction('pres'); presSend = s;
        g((d, id) => presListeners.forEach(fn => { try{ fn(d, id); }catch(_){} }));
        presenceRoom.onPeerLeave(id => presListeners.forEach(fn => { try{ fn({ kind:'leave', peerId:id }, id); }catch(_){} }));
      },
      leave(){ if (presenceRoom){ try{ presenceRoom.leave(); }catch(_){} presenceRoom=null; presSend=null; } },
      send(data){ if (presSend) presSend(data); },
      on(fn){ presListeners.add(fn); return () => presListeners.delete(fn); },
    },
  };
  finishReady();
})();
