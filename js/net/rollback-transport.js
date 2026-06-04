/* js/net/rollback-transport.js — CLASSIC. A rollback-netcode `TransportAdapter` over STARLEFT's existing
   Trystero facade (window.MP), so the rollback Session keeps serverless Nostr signaling + STUN/TURN + the
   lobby/chat/voice unchanged. All rollback traffic rides one Trystero action ('rbmsg', binary Uint8Array);
   the library does its own framing/decoding. Trystero's SCTP channel is reliable+ordered, so the adapter's
   `reliable` flag is trivially satisfied (inputs are tiny; the only big payload is the join keyframe).
   Contract: rollback-netcode/src/transport/adapter.ts:28-117. Built lazily so window.MP can boot first. */
(function(){
  const NET = (window.NET = window.NET || {});
  const RBTAG = 'rbmsg';

  function nowMs(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }

  NET.makeTrysteroTransport = function(){
    const peers = new Set();
    const adapter = {
      onMessage: null, onConnect: null, onDisconnect: null, onError: null,
      connectedPeers: peers,
      localPeerId: (window.MP && MP.selfId) || ('local-' + ((nowMs()|0))),

      // Trystero auto-connects every peer in the room (the lobby already called MP.enter), so "connect" just
      // resolves once the peer is actually present (onPeer has fired), with a timeout as a backstop.
      connect(peerId){
        if(peers.has(peerId)) return Promise.resolve();
        return new Promise((resolve)=>{
          const t = setInterval(()=>{ if(peers.has(peerId)){ clearInterval(t); resolve(); } }, 50);
          setTimeout(()=>{ clearInterval(t); resolve(); }, 8000);
        });
      },
      disconnect(peerId){ peers.delete(peerId); },
      disconnectAll(){ peers.clear(); },
      send(peerId, message /*, reliable */){ try{ MP.send(RBTAG, message, peerId); }catch(e){ NET.mpLog && NET.mpLog('err','rollback transport send failed → '+String(peerId).slice(0,6)+'…: '+((e&&e.message)||e)); if(adapter.onError) adapter.onError(peerId, e, 'send'); } },
      broadcast(message /*, reliable */){ try{ MP.send(RBTAG, message); }catch(e){ NET.mpLog && NET.mpLog('err','rollback transport broadcast failed: '+((e&&e.message)||e)); if(adapter.onError) adapter.onError(null, e, 'broadcast'); } },   // omit toPeer = broadcast (trystero-boot facade)
      getConnectionMetrics(/* peerId */){ const ms = window.MP_LAST_RTT; return (ms!=null && isFinite(ms)) ? { rtt:ms, jitter:0, packetLoss:0, lastUpdated:nowMs() } : null; },
      dispose(){ peers.clear(); adapter.onMessage = adapter.onConnect = adapter.onDisconnect = null; },
    };

    // Wire the MP facade → adapter callbacks once MP is ready (handlers survive room re-enter; see trystero-boot).
    whenMP(()=>{
      if(!window.MP || MP.unavailable) return;
      adapter.localPeerId = MP.selfId || adapter.localPeerId;
      try{ MP.peers().forEach(id=>peers.add(id)); }catch(_){}
      MP.on(RBTAG, (data, peerId)=>{
        if(!adapter.onMessage) return;
        const u8 = (data instanceof Uint8Array) ? data : new Uint8Array(data && data.buffer ? data.buffer : data);
        try{ adapter.onMessage(peerId, u8); }catch(e){ NET.mpLog && NET.mpLog('err','rollback transport recv error from '+String(peerId).slice(0,6)+'…: '+((e&&e.message)||e)); if(adapter.onError) adapter.onError(peerId, e, 'recv'); }
      });
      MP.onPeer((peerId)=>{ peers.add(peerId);    NET.mpLog && NET.mpLog('ok','rollback transport: peer '+String(peerId).slice(0,6)+'… connected'); if(adapter.onConnect)    try{ adapter.onConnect(peerId); }catch(_){} });
      MP.onLeave((peerId)=>{ peers.delete(peerId); NET.mpLog && NET.mpLog('warn','rollback transport: peer '+String(peerId).slice(0,6)+'… disconnected'); if(adapter.onDisconnect) try{ adapter.onDisconnect(peerId); }catch(_){} });
    });

    return adapter;
  };
})();
