/* villain_neon_maps.js — per-frame, per-action neon glow anchors for VILLAINS, twin of
   hero_neon_maps.js (HERO_NEON_MAPS) and mega_neon_maps.js. Authored later via the extended
   muzzle-calibrator dev tool; until then this is empty and villains render with only their
   code-synthesized body aura (see drawVillainGlow in render.js — the aura needs no data here).

   Shape (same as hero/mega maps):
     VILLAIN_NEON_MAPS.sprites[neonId][action].frames[fi].glows = [
       { id, kind:'spot'|'ring'|'bar', x, y, rx, ry, rot, color:[r,g,b], alpha, phase, pulse, sparkle }
     ]
   `x,y,rx,ry` are normalized 0..1 within the drawn (boss-scaled) sprite box. | STARLEFT */

const VILLAIN_NEON_MAPS = { sprites: {
  // cyanNinja: { walk:{ frames:[...] }, attack:{ frames:[...] } },
  // rex:       { walk:{ frames:[...] }, attack:{ frames:[...] } },
} };

if(typeof window!=='undefined') window.VILLAIN_NEON_MAPS = VILLAIN_NEON_MAPS;
