/* js/net/rollback-boot.js — the project's 2nd ES module (after trystero-boot.js). Imports the vendored
   rollback-netcode bundle and republishes a classic-callable facade on window.RB, then signals readiness so
   the 30+ classic scripts can build a rollback session without becoming modules. Loaded via
   <script type="module"> after the classic scripts. Vendored bundle first (offline-capable); esm.sh fallback.
   Mirrors trystero-boot.js. The Game/transport/input glue stays classic JS (rollback-game/-transport/-input). */
let mod = null, loadErr = null;

async function loadRB(){
  try { mod = await import('../vendor/rollback-netcode.min.js'); return true; }
  catch(e1){ loadErr = e1;
    try { mod = await import('https://esm.sh/rollback-netcode?bundle'); return true; }
    catch(e2){ loadErr = e2; return false; }
  }
}

function finishReady(){
  window.__RB_READY = true;
  try { window.dispatchEvent(new Event('rb:ready')); } catch(_){}
  if (Array.isArray(window.__rbReadyQueue)) { window.__rbReadyQueue.forEach(fn => { try{ fn(); }catch(_){} }); window.__rbReadyQueue.length = 0; }
}

(async () => {
  if (!(await loadRB())) {
    window.RB = { unavailable:true, _err:String(loadErr) };   // facade absent → USE_ROLLBACK stays off, host-auth keeps shipping
    finishReady();
    return;
  }
  // Republish exactly the bits the classic rollback wiring needs.
  window.RB = {
    unavailable:false,
    createSession:             mod.createSession,
    Session:                   mod.Session,
    LocalTransport:            mod.LocalTransport,
    createLocalTransportGroup: mod.createLocalTransportGroup,
    WebRTCTransport:           mod.WebRTCTransport,
    TransformingTransport:     mod.TransformingTransport,
    Topology:                  mod.Topology,
    DesyncAuthority:           mod.DesyncAuthority,
    PlayerRole:                mod.PlayerRole,
    PauseReason:               mod.PauseReason,
    SessionState:              mod.SessionState,
    PlayerConnectionState:     mod.PlayerConnectionState,
    DEFAULT_INPUT_PREDICTOR:   mod.DEFAULT_INPUT_PREDICTOR,
    DEFAULT_SESSION_CONFIG:    mod.DEFAULT_SESSION_CONFIG,
    asPlayerId:                mod.asPlayerId,
    encodeMessage:             mod.encodeMessage,
    decodeMessage:             mod.decodeMessage,
    _mod:                      mod,
  };
  finishReady();
})();
