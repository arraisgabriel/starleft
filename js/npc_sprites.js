/* npc_sprites.js — NPCMIX: the hub-NPC body-part compositor.

   Mechanism only: given a mix {head, torso, legs, owner}, bakes one 10-frame walk strip
   on an offscreen canvas by band-slicing three donor unit walk sheets and stacking the
   bands (legs → torso → head) with feathered seams, then tints it in the same pass.
   Output is anim-shaped {img, ready, fw, fh, frames} — exactly what hub_npcs.js's
   _tinted cache stores and what blitFrame consumes — so the consumer treats a mixed
   sheet like any tinted sheet.

   Policy (which mixes exist, caching, caps, when to bake) lives in js/hub_npcs.js.
   This file holds NO caches, registers NO images, and never touches the DOM beyond
   creating offscreen canvases at bake time. Loads after assets.js (needs unitWalk/DEF
   at call time only) and before hub_npcs.js.

   Geometry: the LEGS donor defines the output frame (feet anchor at +0.3h in blitFrame,
   so keeping legs 1:1 with their source means zero foot-slide). All three donors are
   sampled at the same frame index so the leg cycle and torso bob stay coherent. Bands
   map y: source band → target band exactly (neck/hip lines align by construction) and
   x: full source frame width → full target frame width (every donor centers its
   character in a padded frame). Output is half-res, matching hub_npcs' tint bakes.

   Phase 2 seam: resolvePart() is the only donor-aware code. Dedicated Gemini part
   strips (assets/units/npc_parts/) plug in as {kind:'strip'} descriptors via
   registerPartLib() without touching the compositor core. */
(function(){
  'use strict';

  /* @npc-band-cal-start — tune in npc-part-calibrator.html, then paste this block back.
     neckY/hipY: band cut lines as fractions of the frame height (neck = bottom of head
     band, hip = bottom of torso band). cx/w: content center/width hints (calibrator +
     worst-offenders scoring only — the compositor maps full frame width). phase: frame
     offset applied when this donor supplies a band (gait-sync knob, 0..9).
     Seed values derived from per-row alpha-content scans of the shipped sheets. */
  var NPC_BAND_CAL = {
    version: 1,
    units: {
      worker:    { neckY:0.20, hipY:0.68, cx:0.50, w:0.91, phase:0 },
      soldier:   { neckY:0.11, hipY:0.62, cx:0.50, w:0.99, phase:0 },
      ranger:    { neckY:0.14, hipY:0.55, cx:0.50, w:0.93, phase:0 },
      recruiter: { neckY:0.14, hipY:0.58, cx:0.50, w:0.98, phase:0 },
      hustler:   { neckY:0.10, hipY:0.58, cx:0.50, w:0.78, phase:0 },
      lobbyist:  { neckY:0.13, hipY:0.74, cx:0.50, w:0.72, phase:0 },
    }
  };
  /* @npc-band-cal-end */

  // frozen donor order — hub_npcs' wardrobe rng indexes into this; reordering or
  // inserting (vs appending) would silently reshuffle every NPC's look.
  const DONORS = ['worker','soldier','ranger','recruiter','hustler','lobbyist'];

  const OVERLAP_FRAC = 0.04;     // feathered seam overlap as a fraction of output frame height
  const HALF_RES = 0.5;          // output scale vs source sheets (matches hub_npcs tint bakes)

  // registered Phase-2 part libraries (dedicated Gemini strips). Stored for the future
  // {kind:'strip'} resolvePart branch; nothing consumes them yet.
  const _partLibs = [];

  // reusable band scratch (bake-time only, module-local — NEVER stored on entities)
  let _scr = null, _scrX = null;
  function _scratch(w, h){
    if(!_scr){ _scr = document.createElement('canvas'); }
    if(_scr.width < w) _scr.width = w;
    if(_scr.height < h) _scr.height = h;
    _scrX = _scr.getContext('2d');
    return _scrX;
  }

  /* ---- part resolution (the Phase-2 seam) ----
     desc: {kind:'unit-band', type, band:'head'|'torso'|'legs'}
        or {kind:'strip', ...} (Phase 2 — dedicated part strips; not implemented yet).
     Returns {img, fw, fh, frames, frameCount, y0, y1, facesLeft, phase} or null while
     the donor art streams (caller re-queues — same contract as hub_npcs' tint bakes). */
  function resolvePart(desc, owner){
    if(!desc) return null;
    if(desc.kind === 'unit-band'){
      const anim = (typeof unitWalk === 'function') ? unitWalk(desc.type, owner) : null;
      if(!anim || !anim.ready) return null;
      const cal = NPC_BAND_CAL.units[desc.type];
      if(!cal) return null;
      const neck = cal.neckY * anim.fh, hip = cal.hipY * anim.fh;
      let y0 = 0, y1 = anim.fh;
      if(desc.band === 'head') y1 = neck;
      else if(desc.band === 'torso'){ y0 = neck; y1 = hip; }
      else y0 = hip;                                             // 'legs'
      return { img:anim.img, fw:anim.fw, fh:anim.fh, frames:anim.frames,
               frameCount:anim.frames.length, y0, y1,
               // the donor's own cut lines (fractions) — when this part is the LEGS donor
               // they define the output frame's neck/hip lines (Phase-2 strips carry the
               // canonical lines in their descriptor instead)
               neckFrac: cal.neckY, hipFrac: cal.hipY,
               facesLeft: !!(typeof DEF !== 'undefined' && DEF[desc.type] && DEF[desc.type].facesLeft),
               phase: cal.phase|0 };
    }
    // {kind:'strip'}: Phase-2 dedicated parts — resolve from _partLibs once implemented.
    return null;
  }
  function _desc(v, band){ return (typeof v === 'string') ? { kind:'unit-band', type:v, band } : v; }

  /* ---- band compositing ----
     Samples source rows [sy0, sy1) of the part's frame fi (full frame width) into the
     dest box (dx, dy0, dw, dh) on the strip, via the scratch canvas so left-facing
     donors can be mirrored and the bottom featherPx can be faded (destination-out)
     without touching pixels already composited below this band. */
  function _drawBand(sc, part, fi, sy0, sy1, dx, dy0, dw, dh, featherPx){
    sy0 = Math.max(0, Math.min(part.fh, sy0));
    sy1 = Math.max(sy0 + 1, Math.min(part.fh, sy1));
    dh = Math.max(1, Math.round(dh)); dw = Math.max(1, Math.round(dw));
    const fr = part.frames[fi];
    const x = _scratch(dw, dh);
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, dw, dh);
    if(part.facesLeft){ x.translate(dw, 0); x.scale(-1, 1); }    // normalize to canonical right-facing
    x.drawImage(part.img, fr[0], fr[1] + sy0, part.fw, sy1 - sy0, 0, 0, dw, dh);
    x.setTransform(1, 0, 0, 1, 0, 0);
    if(featherPx > 0){
      const g = x.createLinearGradient(0, dh - featherPx, 0, dh);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = g;
      x.fillRect(0, dh - featherPx, dw, featherPx);
    }
    x.restore();
    sc.drawImage(_scr, 0, 0, dw, dh, dx, dy0, dw, dh);
  }

  /* ---- the bake ----
     mix: {head, torso, legs, owner} — head/torso/legs are donor type names (Phase 1)
     or part descriptors (Phase 2). tintColor/tintAlpha as in hub_npcs (pass
     tintAlpha<=0 to skip the tint — calibrator preview).
     Returns anim-shaped {img(canvas), ready:true, fw, fh, frames} or null while any
     donor sheet is still streaming. Throws only on genuinely broken input/canvas —
     the caller (hub_npcs._bakeMix) treats a throw as a permanent plain fallback. */
  function composeTinted(mix, tintColor, tintAlpha){
    const owner = mix.owner || 'player';
    const legsP  = resolvePart(_desc(mix.legs,  'legs'),  owner);
    const torsoP = resolvePart(_desc(mix.torso, 'torso'), owner);
    const headP  = resolvePart(_desc(mix.head,  'head'),  owner);
    if(!legsP || !torsoP || !headP) return null;                 // art not streamed yet — caller re-queues

    const n = legsP.frameCount;
    const fw = Math.max(1, Math.round(legsP.fw * HALF_RES));
    const fh = Math.max(1, Math.round(legsP.fh * HALF_RES));
    // target cut lines = the legs donor's own lines (legs stay 1:1 → zero foot-slide)
    const neckY = Math.max(1, Math.round((legsP.neckFrac != null ? legsP.neckFrac : 0.18) * fh));
    const hipY  = Math.min(fh - 2, Math.max(neckY + 1, Math.round((legsP.hipFrac != null ? legsP.hipFrac : 0.6) * fh)));
    const OV = Math.max(2, Math.round(OVERLAP_FRAC * fh));

    const strip = document.createElement('canvas');
    strip.width = fw * n; strip.height = fh;
    const sc = strip.getContext('2d');
    if(!sc) throw new Error('npcmix: no 2d context');

    for(let i = 0; i < n; i++){
      const dx = i * fw;
      const fiL = legsP.frameCount  > 1 ? (i + legsP.phase)  % legsP.frameCount  : 0;
      const fiT = torsoP.frameCount > 1 ? (i + torsoP.phase) % torsoP.frameCount : 0;
      const fiH = headP.frameCount  > 1 ? (i + headP.phase)  % headP.frameCount  : 0;
      // LEGS: src band → dst [hipY-OV .. fh], top extended by OV (no feather — bottom layer)
      {
        const spd = (legsP.y1 - legsP.y0) / Math.max(1, fh - hipY);      // src px per dst px
        _drawBand(sc, legsP, fiL, legsP.y0 - OV * spd, legsP.y1, dx, hipY - OV, fw, fh - hipY + OV, 0);
      }
      // TORSO: src band → dst [neckY .. hipY+OV], bottom OV feathered over the legs
      {
        const spd = (torsoP.y1 - torsoP.y0) / Math.max(1, hipY - neckY);
        _drawBand(sc, torsoP, fiT, torsoP.y0, torsoP.y1 + OV * spd, dx, neckY, fw, hipY - neckY + OV, OV);
      }
      // HEAD: src band → dst [0 .. neckY+OV], bottom OV feathered over the torso
      {
        const spd = (headP.y1 - headP.y0) / Math.max(1, neckY);
        _drawBand(sc, headP, fiH, headP.y0, headP.y1 + OV * spd, dx, 0, fw, neckY + OV, OV);
      }
    }

    if(tintColor && tintAlpha > 0){                              // same recipe as hub_npcs._bakeTint
      sc.globalCompositeOperation = 'source-atop';
      sc.globalAlpha = tintAlpha;
      sc.fillStyle = tintColor;
      sc.fillRect(0, 0, strip.width, strip.height);
      sc.globalCompositeOperation = 'source-over';
      sc.globalAlpha = 1;
    }

    const frames = [];
    for(let i = 0; i < n; i++) frames.push([i * fw, 0, fw, fh]);
    return { img:strip, ready:true, fw, fh, frames };
  }

  /* ---- dev / tooling API ---- */
  // console QA: NPCMIX.debugSheet({head:'soldier',torso:'hustler',legs:'worker',owner:'player'}, '#5c6b7a')
  // returns the baked strip canvas (or null while donors stream) — caller appends/inspects it.
  function debugSheet(mix, tintColor, tintAlpha){
    const a = composeTinted(mix, tintColor || null, tintAlpha == null ? (tintColor ? 0.32 : 0) : tintAlpha);
    return a ? a.img : null;
  }
  function getCalibration(){ return NPC_BAND_CAL; }
  function setCalibration(cal){                                  // calibrator live-tuning: merge per-unit fields
    if(!cal || !cal.units) return;
    for(const k in cal.units){
      if(!NPC_BAND_CAL.units[k]) NPC_BAND_CAL.units[k] = {};
      const src = cal.units[k], dst = NPC_BAND_CAL.units[k];
      for(const f in src) dst[f] = src[f];
    }
  }
  // Phase 2: dedicated Gemini part libraries (js/npc_parts_data.js calls this with its
  // manifest). Stored now so the data file can ship independently; consumed once the
  // {kind:'strip'} resolvePart branch lands.
  function registerPartLib(manifest){ if(manifest) _partLibs.push(manifest); return _partLibs.length; }

  window.NPCMIX = { DONORS, resolvePart, composeTinted, debugSheet,
                    getCalibration, setCalibration, registerPartLib };
})();
