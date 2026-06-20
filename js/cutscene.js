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
  const CUT_START_DELAY=2.0;           // seconds to hold on the speaker (already snapped to ZOOM_MAX) before the first line
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

  // All the live ENTITIES taking part in the active cutscene — the default focus (cs.speaker, already
  // an entity) plus every distinct per-line `speaker` (heroId) resolved the same way lineFocus does.
  // De-duped by entity. Used by the camera (frame everyone) and by render.js (hide any sprite that
  // would draw over a participant). Returns null when there's no cutscene / no one on the field.
  function cutsceneParticipants(state){
    const cs=state && state.flashCutscene; if(!cs) return null;
    const ents=state.entities, out=[], seen=new Set();
    const add=e=>{ if(e && e.kind==='unit' && !e.dead && !e.storedIn && !seen.has(e)){ seen.add(e); out.push(e); } };
    add(cs.speaker);
    const ids=new Set();
    for(const ln of cs.lines) if(ln && ln.speaker) ids.add(ln.speaker);
    for(const id of ids) add(ents && ents.find(x=>x.heroId===id && !x.dead && !x.storedIn));
    return out.length ? out : null;
  }
  window.cutsceneParticipants=cutsceneParticipants;

  function endFlashCutscene(state){
    if(!state) return;
    const cs=state.flashCutscene;
    const onEnd = cs && cs._onEnd;
    const coopHold = !!(cs && cs._coopHold);   // this was a co-op host-frozen map cutscene → resume the sim + unfreeze the client
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
    // CO-OP: a host-frozen map cutscene ends → resume the sim and tell the client to unfreeze. The client's
    // own endFlashCutscene never resumes (host-authoritative) — it waits for this resume cue.
    if(coopHold && typeof netRole!=='undefined' && netRole==='host'){
      if(typeof NET!=='undefined' && NET.cueResume) NET.cueResume();
      if(!state.over) running=true;
    }
    if(typeof refreshUI==='function') refreshUI();
    // T1-7: the Ep VII flash monologue resolves onto the MEMORIAL — the canonical moment the
    // whole roster joins it. Auto-open once, right after Nino's last line fades.
    if(state.hub && typeof fallenVets!=='undefined' && fallenVets.length && typeof showRoster==='function')
      setTimeout(()=>{ try{ showRoster(); }catch(e){} }, 700);
    if(typeof onEnd==='function'){ try{ onEnd(); }catch(e){} }   // deferred continuation (e.g. boss victory routing after the death lines)
  }

  // Begin the cutscene; falls back to simply framing the hub if there's nothing (or no speaker) to play.
  // onEnd (optional): a callback fired once the last line closes — used to DEFER a boss's victory routing
  // until its death lines have played (villains.js bossOutcome).
  window.startFlashCutscene=function(state, speaker, lines, onEnd){
    if(!state) return;
    if(!speaker || !lines || !lines.length){
      if(typeof hubFocusUltra==='function') hubFocusUltra(state);
      if(typeof clampCam==='function') clampCam(state);
      if(typeof onEnd==='function') onEnd();           // nothing to play → run the continuation immediately
      return;
    }
    state.flashCutscene={ lines, i:0, t:0, speaker, clipDone:false, started:false, _onEnd:onEnd||null,
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
    // EX-TERMINATOR escape rides the cutscene with its OWN monotonic progress — cs.t resets to 0 each line
    // (showLine), so a clock-keyed bomber would restart per line. Pace it to LINE progress instead: ONE bomber
    // smoothly approaches across the lines (target 0→1 over first→last line) and extracts on the LAST line.
    const be=state.bossExtract;
    if(be && cs.started){
      const N=Math.max(1, cs.lines.length);
      const target = N>1 ? Math.min(1, (cs.i+1)/N) : 1;                  // appears on the FIRST line (>0), arrives (1) by the LAST
      be.aprP = (be.aprP==null?0:be.aprP) + (target-(be.aprP==null?0:be.aprP))*Math.min(1, dt*1.2);   // smooth MONOTONIC chase (never resets per line)
      const onLast=(cs.i||0) >= N-1;
      if(onLast && (be.aprP>=0.92 || (be.lastT||0)>3)) be.boardT=(be.boardT||0)+dt;   // he boards + the bomber lifts off — only once it has actually ARRIVED (or a 3s grace)
      if(onLast) be.lastT=(be.lastT||0)+dt;
    }
    // ABRUPT CUT (no easing): snap the camera to ZOOM_MAX framing the scene's characters. If every
    // participant fits at max zoom, frame them together (centered on their bounding box); if they're
    // too far apart to share the frame, cut to whoever is speaking THIS line (lineFocus). Re-evaluated
    // each frame, so a line change that crosses to a far speaker reads as a hard cut, not a pan.
    if(typeof viewW==='function'){
      const zt=(typeof ZOOM_MAX!=='undefined'?ZOOM_MAX:2.0);
      state.zoom=zt;
      const vw=viewW()/zt, vh=viewH()/zt;
      const parts=cutsceneParticipants(state);
      const sp=lineFocus(state, cs);
      let cx, cy;
      if(parts && parts.length>1){
        let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;
        for(const p of parts){ if(p.x<a)a=p.x; if(p.x>b)b=p.x; if(p.y<c)c=p.y; if(p.y>d)d=p.y; }
        if((b-a)<=vw*0.82 && (d-c)<=vh*0.82){ cx=(a+b)/2; cy=(c+d)/2; }   // all fit at max zoom → frame together
      }
      if(cx==null){ const f=(sp && !sp.dead)?sp:(parts&&parts[0]); if(f){ cx=f.x; cy=f.y; } }   // else cut to the speaker
      if(cx!=null){ state.camX=cx-vw/2; state.camY=cy-vh/2; if(typeof clampCam==='function') clampCam(state); }
    }
    // opening hold: keep the camera on the speaker for CUT_START_DELAY, THEN begin the first line (showLine resets cs.t)
    if(!cs.started){ if(cs.t>=CUT_START_DELAY){ cs.started=true; showLine(cs); } return; }
    // a hold-last cutscene (e.g. the EX-TERMINATOR escape) parks on its FINAL line indefinitely — only the
    // player's click (advanceFlashCutscene) closes it, so the last beat doesn't auto-dismiss with the action.
    if(cs._holdLast && cs.i >= cs.lines.length-1) return;
    // VILLAIN cutscenes (every boss arrival + death/escape) advance ONLY on the player's click — on EVERY
    // line, not just the last — so the boss's lines never auto-skip while the player is still reading. The
    // speaker is the villain entity on solo/host AND on the co-op client mirror (mp.js focuses the villain),
    // so each peer's sim correctly waits for its own click (no per-line sync needed). A generic cs.manual
    // flag lets any future cutscene opt into the same click-to-advance behavior.
    if(cs.manual || (cs.speaker && cs.speaker.villain)) return;
    // advance when the clip has finished (and the floor has elapsed) or the hard cap is hit
    if((cs.clipDone && cs.t>=MIN_LINE) || cs.t>=MAX_LINE) advanceFlashCutscene();
  };

  /* Generic per-tick driver for MAP-level scripted cutscenes (story-polish §5). Solo-only; the sim is
     frozen by main.js while a cutscene plays, so this only fires between cutscenes. One-shot per name.
       cfg.introCutscene : 'NAME'                       → play once at mission start (state.time < 4s)
       cfg.reachCutscene : { name, at:{x,y}, radius }   → play once when a player unit reaches the spot
       cfg.villainCutscene : 'NAME' (+ villainCutsceneRadius) → play once when a player unit gets NEAR the
           LIVE boss (so the player can SEE him); waits for a deferred boss to surface. Focuses the boss.
     If no named speaker is on the field, the beat is silently skipped (still marked done — no retry loop). */
  function armByName(state, name){
    const lines = (typeof window!=='undefined' && window[name]) || null;
    if(!lines || !lines.length) return;
    let focus=null;
    for(const ln of lines){ if(!ln.speaker) continue; const e=state.entities.find(x=>x.heroId===ln.speaker && !x.dead && !x.storedIn); if(e){ focus=e; break; } }
    // villain bosses have no heroId — let them narrate their own arrival by focusing the live boss
    if(!focus) focus=state.entities.find(x=>x.villain && !x.dead && !x.storedIn);
    if(!focus) return;
    // CO-OP host: freeze the sim behind the cutscene (running=false → host-clock stops stepping + no
    // snapshots) and mirror it to the client as a hold-cue so the ally plays the SAME beat, also frozen.
    // The client finds the speaker by heroId in its synced entities; endFlashCutscene resumes both peers.
    // Solo plays it locally with no freeze — the main-loop guard already pauses update() while a cutscene runs.
    if(typeof netRole!=='undefined' && netRole==='host' && typeof cinematic==='function'){
      running=false;
      cinematic('mapcut', { linesKey:name, speaker: focus.heroId||null }, function(){
        window.startFlashCutscene(state, focus, lines);
        if(state.flashCutscene) state.flashCutscene._coopHold=true;     // mark so endFlashCutscene resumes + sends the resume cue
      }, { hold:true });
    } else {
      window.startFlashCutscene(state, focus, lines);
    }
  }
  window.mapCutsceneTick=function(state){
    if(!state || state.hub || state.over || state.flashCutscene) return;
    if(typeof netRole!=='undefined' && netRole==='client') return;             // the client plays map cutscenes only via host cues (it has no authoritative positions)
    if(typeof window!=='undefined' && window._rbReplaying) return;
    const cfg=state.cfg; if(!cfg) return;
    const played = state._csPlayed || (state._csPlayed={});                    // transient one-shot guard (per session)
    const intro=cfg.introCutscene;
    if(intro && !played[intro] && (state.time||0) < 4){ played[intro]=1; armByName(state, intro); return; }
    const rc=cfg.reachCutscene;
    if(rc && rc.name && rc.at && !played[rc.name]){
      const T=(typeof TILE!=='undefined')?TILE:32, rad=((rc.radius||3))*T, ax=(rc.at.x+0.5)*T, ay=(rc.at.y+0.5)*T, r2=rad*rad;
      for(const e of state.entities){
        if(e.dead || e.owner!=='player' || e.kind!=='unit') continue;
        const dx=e.x-ax, dy=e.y-ay;
        if(dx*dx+dy*dy<=r2){ played[rc.name]=1; armByName(state, rc.name); return; }
      }
    }
    // VILLAIN ARRIVAL: fire once when a player unit gets NEAR the LIVE boss (so the player can SEE him).
    // Anchored to the boss ENTITY, not a fixed tile, so it works for an immediate boss AND a deferred one
    // (it waits until the boss has surfaced). NEVER fires on map load. armByName focuses the live boss.
    const vc=cfg.villainCutscene;
    if(vc && !played[vc]){
      const boss=state.entities.find(e=>e.villain && !e.dead && !e.storedIn);
      if(boss){
        const T=(typeof TILE!=='undefined')?TILE:32, rad=((cfg.villainCutsceneRadius||7))*T, r2=rad*rad;
        for(const e of state.entities){
          if(e.dead || e.owner!=='player' || e.kind!=='unit') continue;
          const dx=e.x-boss.x, dy=e.y-boss.y;
          if(dx*dx+dy*dy<=r2){ played[vc]=1; armByName(state, vc); return; }
        }
      }
    }
  };
})();
