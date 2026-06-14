/* cutscene.js — a minimal MANDATORY scripted-dialog sequencer for the H.U.B. Currently drives Nino's
   monologue after Episode VII's "flash" (started from enterHubFlashAftermath in hub.js). It plays a
   queue of voiced lines with the camera eased onto a speaker; a line advances when its voice clip
   finishes (after a minimum) OR after a hard timeout (so a missing/blocked clip never hangs), and a
   tap advances early. Input is gated while it runs (see gestureBegin + updateCamera).

   State lives on `state.flashCutscene` (transient — never serialized). Classic global; loaded after
   voice.js / ui.js / input.js, before main.js. Caption is the #cutsceneCaption lower-third (rts.html);
   the HUD is hidden by body.scene-cutscene while it plays. */

(function(){
  'use strict';
  const MIN_LINE=4.0, MAX_LINE=12.0;   // seconds: floor before a finished clip may advance; hard cap if it never reports
  const CAM_EASE=2.4;                  // the cutscene zooms the camera to the game's ZOOM_MAX (max close-up on the speaker)
  const CUT_START_DELAY=2.0;           // seconds to hold on the speaker (camera easing in) before the first line
  const SCENE_RATE=0.90;               // the speaker's HUB speech plays at 0.90× (10% slower); the caption follows the slowed clip

  function captionEl(){ return (typeof document!=='undefined') ? document.getElementById('cutsceneCaption') : null; }

  function showLine(cs){
    const line=cs.lines[cs.i]; if(!line) return;
    cs.t=0; cs.clipDone=false;
    const el=captionEl();
    if(el){
      const tx=el.querySelector('.cs-text'), hn=el.querySelector('.cs-hint');
      if(tx) tx.textContent=(typeof line.text==='string')?line.text:'';
      if(hn) hn.textContent=(cs.i<cs.lines.length-1)?'▸ click to continue':'▸ click to close';
      el.classList.add('show');
    }
    if(typeof VOICE!=='undefined' && VOICE.playScene) VOICE.playScene(line.id, ()=>{ cs.clipDone=true; }, SCENE_RATE);
  }

  // resolve the camera focus for the CURRENT line: a line may name a `speaker` (heroId, e.g. 'Biba'/
  // 'Nino') so a two-person exchange follows whoever is talking. Falls back to the cutscene's default
  // speaker when the line has none or that hero isn't on the field (dead/stored). NINO_FLASH_LINES carry
  // no per-line speaker → always the default speaker (unchanged behavior).
  function lineFocus(state, cs){
    const ln=cs.lines[cs.i];
    if(ln && ln.speaker && state && state.entities){
      const e=state.entities.find(x=>x.heroId===ln.speaker && !x.dead && !x.storedIn);
      if(e) return e;
    }
    return cs.speaker;
  }

  function endFlashCutscene(state){
    if(!state) return;
    const cs=state.flashCutscene;
    // mid-mission cutscenes zoom the camera onto the speaker; restore the player's prior view on exit
    // (hub cutscenes intentionally stay framed on the hub, so _camRestore is only set off-hub).
    if(cs && cs._camRestore){
      state.zoom=cs._camRestore.zoom; state.camX=cs._camRestore.camX; state.camY=cs._camRestore.camY;
      if(typeof clampCam==='function') clampCam(state);
    }
    state.flashCutscene=null;
    if(typeof document!=='undefined') document.body.classList.remove('scene-cutscene');
    const el=captionEl(); if(el) el.classList.remove('show');
    if(typeof VOICE!=='undefined' && VOICE.stopScene) VOICE.stopScene();
    if(typeof refreshUI==='function') refreshUI();
    // T1-7: the Ep VII flash monologue resolves onto the MEMORIAL — the canonical moment the
    // whole roster joins it. Auto-open once, right after Nino's last line fades.
    if(state.hub && typeof fallenVets!=='undefined' && fallenVets.length && typeof showRoster==='function')
      setTimeout(()=>{ try{ showRoster(); }catch(e){} }, 700);
  }

  // Begin the cutscene; falls back to simply framing the hub if there's nothing (or no speaker) to play.
  window.startFlashCutscene=function(state, speaker, lines){
    if(!state) return;
    if(!speaker || !lines || !lines.length){
      if(typeof hubFocusUltra==='function') hubFocusUltra(state);
      if(typeof clampCam==='function') clampCam(state);
      return;
    }
    state.flashCutscene={ lines, i:0, t:0, speaker, clipDone:false, started:false,
      // off-hub (in-mission) reveals zoom onto the speaker — remember the player's view to restore on end
      _camRestore: state.hub ? null : { zoom:state.zoom||1, camX:state.camX||0, camY:state.camY||0 } };
    if(typeof document!=='undefined') document.body.classList.add('scene-cutscene');
    // hold on the speaker (camera easing onto him) for CUT_START_DELAY before his first line — see updateFlashCutscene
  };

  // Advance to the next line (or end after the last). Called by the per-frame timer and by a tap.
  window.advanceFlashCutscene=function(){
    const state=(typeof G!=='undefined')?G:null;
    const cs=state && state.flashCutscene; if(!cs) return;
    if(!cs.started){ cs.started=true; showLine(cs); return; }   // a tap during the opening hold just begins the dialogue
    if(typeof VOICE!=='undefined' && VOICE.stopScene) VOICE.stopScene();
    cs.i++;
    if(cs.i>=cs.lines.length){ endFlashCutscene(state); return; }
    showLine(cs);
  };

  window.updateFlashCutscene=function(state, dt){
    const cs=state && state.flashCutscene; if(!cs) return;
    cs.t+=dt;
    // ease camera onto the CURRENT line's speaker + zoom in for the close-up (follows a two-person exchange)
    const sp=lineFocus(state, cs);
    if(sp && !sp.dead && typeof viewW==='function'){
      const k=Math.min(1, CAM_EASE*dt);
      const zt=(typeof ZOOM_MAX!=='undefined'?ZOOM_MAX:2.0);   // ease all the way to the maximum zoom (closest on the speaker)
      state.zoom += (zt-(state.zoom||1))*k;
      const vw=viewW()/state.zoom, vh=viewH()/state.zoom;
      state.camX += ((sp.x - vw/2) - state.camX)*k;
      state.camY += ((sp.y - vh/2) - state.camY)*k;
      if(typeof clampCam==='function') clampCam(state);
    }
    // opening hold: keep the camera on the speaker for CUT_START_DELAY, THEN begin the first line (showLine resets cs.t)
    if(!cs.started){ if(cs.t>=CUT_START_DELAY){ cs.started=true; showLine(cs); } return; }
    // advance when the clip has finished (and the floor has elapsed) or the hard cap is hit
    if((cs.clipDone && cs.t>=MIN_LINE) || cs.t>=MAX_LINE) advanceFlashCutscene();
  };
})();
