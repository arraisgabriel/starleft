/* villain_neon_maps.js — per-frame, per-action neon glow anchors for VILLAINS, twin of
   hero_neon_maps.js (HERO_NEON_MAPS) and mega_neon_maps.js. Rendered through the shared
   drawMegaNeonLayer (via drawVillainGlow in render.js) as a sandwich: a soft halo BEHIND the
   sprite ('aura') + a bright additive core IN FRONT ('core').

   Coords are NORMALIZED 0..1 within the drawn (boss-scaled) sprite box: x=0 left … 1 right,
   y=0 head … 1 feet. Emitters are placed over the GLOWING parts of each sprite so the boss's own
   lights bloom (the cyan blade/visor on the Growth Cyborg; the green chest-core/eyes on the mech).
   One emitter set per action is enough — the lookup wraps any animation-frame index onto frame 0,
   and the torso/head lights barely move across the walk/attack cycle. | STARLEFT */

// THE CYAN NINJA — Growth Cyborg sprite (rendered in its CYAN player variant via spriteFaction).
// Dominant glow = the big lower-torso blade/core; plus visor, arm vents, and a ground wash.
const NINJA_GLOWS = [
  { id:0, kind:'spot', x:0.50, y:0.63, rx:0.18, ry:0.16, color:[95,242,255],  alpha:1.00, pulse:1.30, phase:0.00 },  // lower-torso blade/core (dominant)
  { id:1, kind:'spot', x:0.50, y:0.17, rx:0.080, ry:0.075, color:[160,250,255], alpha:0.95, pulse:1.05, phase:0.35 }, // head / visor
  { id:2, kind:'spot', x:0.385, y:0.46, rx:0.060, ry:0.065, color:[95,242,255], alpha:0.78, pulse:1.00, phase:0.50 }, // left forearm vent
  { id:3, kind:'spot', x:0.615, y:0.46, rx:0.060, ry:0.065, color:[95,242,255], alpha:0.78, pulse:1.00, phase:0.66 }, // right forearm vent
  { id:4, kind:'spot', x:0.50, y:0.91, rx:0.13, ry:0.055, color:[70,220,255],  alpha:0.55, pulse:1.00, phase:0.20 }, // ground wash under the feet
];

// REX — founder mech in its A&O _ao GREEN variant. Dominant glow = the chest reactor core; plus
// eyes, both shoulder pods, leg vents, and a heavy ground wash (it's a 5-story mech — glow a LOT).
const REX_GLOWS = [
  { id:0, kind:'spot', x:0.50, y:0.44, rx:0.22, ry:0.19, color:[125,255,95],  alpha:1.00, pulse:1.35, phase:0.00 },  // chest reactor core (dominant)
  { id:1, kind:'spot', x:0.50, y:0.155, rx:0.095, ry:0.085, color:[175,255,130], alpha:0.95, pulse:1.05, phase:0.30 }, // head / eyes
  { id:2, kind:'spot', x:0.285, y:0.32, rx:0.090, ry:0.090, color:[125,255,95], alpha:0.85, pulse:1.00, phase:0.50 }, // left shoulder pod
  { id:3, kind:'spot', x:0.715, y:0.32, rx:0.090, ry:0.090, color:[125,255,95], alpha:0.85, pulse:1.00, phase:0.62 }, // right shoulder pod
  { id:4, kind:'spot', x:0.395, y:0.70, rx:0.075, ry:0.080, color:[105,242,80], alpha:0.72, pulse:1.00, phase:0.44 }, // left leg vent
  { id:5, kind:'spot', x:0.605, y:0.70, rx:0.075, ry:0.080, color:[105,242,80], alpha:0.72, pulse:1.00, phase:0.56 }, // right leg vent
  { id:6, kind:'spot', x:0.50, y:0.93, rx:0.20, ry:0.07, color:[90,232,70],   alpha:0.60, pulse:1.00, phase:0.15 }, // heavy ground wash
];

const VILLAIN_NEON_MAPS = { sprites: {
  cyanNinja: { walk:{ frames:[{ glows:NINJA_GLOWS }] }, attack:{ frames:[{ glows:NINJA_GLOWS }] } },
  rex:       { walk:{ frames:[{ glows:REX_GLOWS }] },   attack:{ frames:[{ glows:REX_GLOWS }] } },
} };

if(typeof window!=='undefined') window.VILLAIN_NEON_MAPS = VILLAIN_NEON_MAPS;
