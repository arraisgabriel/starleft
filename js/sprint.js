/* sprint.js — "The Sprint": while the player KEEPS TAPPING a spot on the map, the
   selected squad RUNS there. The run accelerates a little (up to 1.5×) and the units
   IGNORE incoming fire — they keep running instead of fighting back — for as long as
   the taps keep coming. Stop tapping and the run ends: they coast to the last tapped
   point and resume normal behavior. A pulsing CSS ripple (#sprint-ripple) marks the
   destination. State lives on G.sprint (init in map.js) + a transient per-unit flag
   u.sprinting; the actual movement/combat hooks are in units.js. */

// One ground tap is a normal move; the sprint ENGAGES once the player keeps tapping
// (>=2 taps inside the decaying window). Called from input.js dispatchTap on an
// empty-ground tap, BEFORE commandUnits — so commandUnits' move branch sees an active
// sprint and sends the squad as a tight pack to the exact point (no formation spread).
function registerSprintTap(state, wx, wy){
  if(!running || !state || state.over) return;     // never initiate while paused / match over
  const s = state.sprint; if(!s) return;
  s.tapCount = (s.window > 0) ? s.tapCount + 1 : 1; // taps within the window chain together
  s.window = SPRINT_TAP_WINDOW;
  s.x = wx; s.y = wy;                               // ripple + re-aim target = latest tap
  if(s.tapCount >= 2 && state.selection.some(e=>!e.dead && e.kind==='unit' && e.owner==='player')){
    if(!s.active){ s.active = true; s.t = 0; }      // fresh engage → reset the accel ramp
    setSprinters(state);
  }
}

// Flag exactly the current selection's living player units as sprinting (and clear the
// flag everywhere else), so a unit deselected mid-sprint reliably reverts to normal.
function setSprinters(state){
  const sel = state.selection;
  for(const e of state.entities){
    if(e.kind!=='unit'){ continue; }
    const on = !e.dead && e.owner==='player' && sel.indexOf(e)>=0;
    if(on){ e.sprinting = true; e.autoTarget = null; }   // drop any target it was chasing
    else if(e.sprinting){ e.sprinting = false; }
  }
}

// Per-frame tick (called from core.js update(), so it freezes with the sim on pause).
// Decays the tap window, ramps the acceleration multiplier, and ends the sprint when
// the taps stop, all sprinters die, or the match ends.
function updateSprint(state, dt){
  const s = state && state.sprint; if(!s) return;
  if(s.window > 0) s.window -= dt;
  if(s.active){
    if(s.window <= 0){ endSprint(state); return; }       // stopped tapping → end the run
    s.t += dt;
    s.mul = 1 + Math.min(SPRINT_MAX_BONUS, SPRINT_ACCEL * s.t);
    // if every sprinter is gone, stop showing a ripple over an empty squad
    let anyAlive = false;
    for(const e of state.entities){ if(e.sprinting && !e.dead){ anyAlive = true; break; } }
    if(!anyAlive) endSprint(state);
  } else if(s.window <= 0){
    s.tapCount = 0;                                        // window lapsed → next tap starts fresh
  }
}

// End the sprint: clear the per-unit flags (combat + normal speed resume) and reset the
// state. Units keep their last move command, so they COAST to the last tapped point at
// normal speed rather than freezing mid-stride. (For a hard stop instead, replace the
// flag-clear with stopSelection-style cmd={type:'hold'} on each sprinter.)
function endSprint(state){
  if(!state) return;
  for(const e of state.entities){ if(e.sprinting) e.sprinting = false; }
  const s = state.sprint;
  if(s){ s.active = false; s.window = 0; s.t = 0; s.mul = 1; s.tapCount = 0; }
}

// Position the CSS ripple at the world destination each frame (inverse of screenToWorld,
// input.js:23-26), so it tracks camera pan + zoom. Self-hides when no sprint is active.
function updateSprintRipple(state){
  const el = document.getElementById('sprint-ripple'); if(!el) return;
  const s = state && state.sprint;
  if(!s || !s.active || state.over){ if(el.style.display !== 'none') el.style.display = 'none'; return; }
  const z = state.zoom || 1;
  el.style.left = ((s.x - state.camX) * z) + 'px';
  el.style.top  = ((s.y - state.camY) * z + VIEW_TOP) + 'px';
  el.style.display = 'block';
}
