/* hero_neon_maps.js — per-frame hero glow anchors (HUB-parity glow for named heroes).
 *
 * Same record shape as mega_neon_maps.js (consumed unchanged by drawMegaNeonLayer): each glow is
 *   { id, kind, x, y, rx, ry, rot, color:[r,g,b], alpha, phase, pulse, sparkle }
 * with x/y/rx/ry normalized to the sprite frame box (0..1, x=left→right, y=top→feet).
 *
 * Keyed spriteType→action→frames[].glows. ONLY the moving emitter (Nino's gold gun-tip / Biba's
 * purple healing orb) lives here — the body AURAS (Nino purple / Biba white) are code-synthesized in
 * render.js heroAura(). Anchors were calibrated from the art (gold rifle barrel / green heal orb):
 *   - nino.walk   : barrel tip, held low at the lower-right (~0.95,0.70)
 *   - nino.attack : raised muzzle at the upper-right (~0.95,0.18), lowering through the recovery frames
 *   - biba.heal   : the orb/beam source in her raised hand (purple over the green mechanism)
 * Biba has NO 'walk' entry on purpose: she carries no device while walking, so only her white aura
 * shows at idle/walk; the purple mechanism glow appears only while healing.
 * Re-tune in hero-glow-calibrator.html and regenerate. Render ignores frameSize (scales to the live box). */
var HERO_NEON_MAPS = {
  version: 1,
  sprites: {
    nino: {
      walk: {
        frameSize:{ w:235, h:320 },
        frames: [
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.700, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.710, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.710, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.700, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.700, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.700, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.700, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.710, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.710, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.700, rx:0.055, ry:0.055, rot:0, color:[255,200,70], alpha:0.90, phase:0.50, pulse:0.55, sparkle:0 } ] },
        ],
      },
      attack: {
        frameSize:{ w:239, h:276 },
        frames: [
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.190, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.900, y:0.190, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.180, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.190, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.900, y:0.190, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.950, y:0.130, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.930, y:0.180, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.910, y:0.300, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.910, y:0.360, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.870, y:0.280, rx:0.065, ry:0.065, rot:0, color:[255,200,70], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
        ],
      },
    },
    biba: {
      heal: {
        frameSize:{ w:292, h:341 },
        frames: [
          { glows:[ { id:0, kind:'spot', x:0.690, y:0.090, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.700, y:0.080, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.790, y:0.100, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.810, y:0.090, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.550, y:0.110, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.550, y:0.100, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.490, y:0.160, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.570, y:0.150, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.420, y:0.150, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
          { glows:[ { id:0, kind:'spot', x:0.650, y:0.080, rx:0.075, ry:0.075, rot:0, color:[170,82,240], alpha:0.95, phase:0.50, pulse:0.60, sparkle:0 } ] },
        ],
      },
    },
  },
};
if(typeof window!=='undefined') window.HERO_NEON_MAPS = HERO_NEON_MAPS;
