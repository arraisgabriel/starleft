/* js/net/voice-chat.js — CLASSIC. P2P voice ("Comms") over the same Trystero room.
   getUserMedia → MP.addVoice (room.addStream); incoming streams → hidden <audio> + an AnalyserNode
   speaking meter. Opt-in (the mic is NOT auto-requested on join — that races the RTC handshake).
   Push-to-talk on V (confirmed free of clashes). Independent of the TTS VOICE module. */
(function(){
  const COMMS = window.COMMS = {};
  let micStream=null, enabled=false, selfMuted=false, ptt=false, pttHeld=false;
  let ac=null;                                   // shared AudioContext for the meters
  const peerAudio=new Map();                     // peerId -> { el, raf }

  function setBtns(){
    const mic=document.getElementById('mp-mic'); if(mic){ mic.textContent = enabled ? '🎙 Comms on' : '🎙 Comms off'; mic.classList.toggle('on', enabled); }
    const mute=document.getElementById('mp-mute'); if(mute){ mute.disabled=!enabled; mute.textContent = selfMuted ? '🔈 Unmute' : '🔇 Mute'; mute.classList.toggle('on', selfMuted); }
  }
  function outgoingLive(){ return enabled && !selfMuted && (!ptt || pttHeld); }
  function applyOutgoing(){ if(micStream) micStream.getAudioTracks().forEach(t=> t.enabled = outgoingLive()); }

  COMMS.toggleMic = async function(){
    if(enabled){ disable(); return; }
    if(!(window.MP && MP.inRoom)){ toast('Join a room first'); return; }
    try{
      micStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
      enabled=true; applyOutgoing();
      MP.addVoice(micStream);
      try{ ac = ac || new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==='suspended') ac.resume(); }catch(_){}
      toast('🎙 Comms live — hold V for push-to-talk'); setBtns();
    }catch(e){ toast('Mic blocked — allow microphone in your browser'); }
  };
  function disable(){ if(micStream){ try{ MP.removeVoice(micStream); }catch(_){} micStream.getTracks().forEach(t=>t.stop()); }
    micStream=null; enabled=false; setBtns(); }
  COMMS.toggleMute = function(){ if(!enabled) return; selfMuted=!selfMuted; applyOutgoing(); setBtns(); };
  COMMS.setPTT = function(on){ ptt=!!on; applyOutgoing(); };
  COMMS.enabled = ()=>enabled;
  COMMS.leave = function(){ disable();
    peerAudio.forEach(p=>{ if(p.raf) cancelAnimationFrame(p.raf); if(p.el){ p.el.srcObject=null; p.el.remove(); } });
    peerAudio.clear(); };

  // incoming peer voice → hidden <audio> + speaking meter
  function bindIncoming(){
    if(!(window.MP) || MP.unavailable) return;
    MP.onVoice((stream, peerId)=>{
      const sink=document.getElementById('mp-audio-sinks')||document.body;
      const el=new Audio(); el.autoplay=true; el.srcObject=stream; sink.appendChild(el); el.play().catch(()=>{});
      let raf=0;
      try{
        ac = ac || new (window.AudioContext||window.webkitAudioContext)();
        const src=ac.createMediaStreamSource(stream), an=ac.createAnalyser(); an.fftSize=256; src.connect(an);
        const buf=new Uint8Array(an.frequencyBinCount);
        const tick=()=>{ an.getByteFrequencyData(buf); let s=0; for(let i=0;i<buf.length;i++) s+=buf[i];
          setSpeaking(peerId, (s/buf.length) > 12); raf=requestAnimationFrame(tick); };
        tick();
      }catch(_){}
      peerAudio.set(peerId,{ el, raf });
    });
    MP.onLeave((peerId)=>{ const p=peerAudio.get(peerId); if(p){ if(p.raf) cancelAnimationFrame(p.raf); if(p.el){ p.el.srcObject=null; p.el.remove(); } peerAudio.delete(peerId); } });
  }
  function setSpeaking(peerId, on){ document.querySelectorAll('.mp-speak').forEach(el=>{ if(el.getAttribute('data-pid')===peerId) el.classList.toggle('on', on); }); }

  // push-to-talk: V (its own listener, additive; no preventDefault → can't disturb panning)
  addEventListener('keydown', e=>{ if((e.key==='v'||e.key==='V') && !e.repeat && enabled){ pttHeld=true; applyOutgoing(); } });
  addEventListener('keyup',   e=>{ if(e.key==='v'||e.key==='V'){ pttHeld=false; applyOutgoing(); } });

  whenMP(()=>bindIncoming());
})();
