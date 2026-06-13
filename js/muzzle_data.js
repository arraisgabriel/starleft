/* muzzle_data.js — precalculated gun-muzzle anchor points per unit/building, so the
   laser bolt leaves the exact barrel in the attack sprite (see render.js drawLaserBolt
   + assets.js muzzleWorld/buildingMuzzle). This is dev-time data; author/tune it with
   muzzle-calibrator.html (click the barrel tip on each attack.png firing frame).

   UNITS — (mx,my) are NORMALIZED fractions of ONE attack-strip frame, measured on the
   un-flipped sprite (the art's default facing — RIGHT for everyone except `facesLeft`
   units like the bomber, whose source art faces LEFT). The engine maps them through the
   SAME box + horizontal-flip as blitFrame (x∈[-dw/2,+dw/2], y∈[-0.7h,+0.3h] around the
   unit), so a single normalized point auto-scales with unit size and auto-mirrors with
   facing — no per-frame/per-direction tables needed.
     mx: 0 = left edge of the frame, 1 = right edge.
     my: 0 = top of the frame,       1 = the unit's feet (foot-anchored).
     w : beam-width multiplier (bigger = heavier ray; the big mechs read larger).

   BUILDINGS — (bx,by) are NORMALIZED fractions of the tile FOOTPRINT rect (no flip):
     bx,by: 0,0 = footprint top-left, 1,1 = footprint bottom-right. Rooftop guns sit
     near top-center. */

const MUZZLE = {
  // ---- ranged units ----
  ranger:   { mx:0.74, my:0.43, w:1.00 },   // Consultant — rifle/launcher tip, chest height
  lobbyist: { mx:0.84, my:0.42, w:1.05 },   // Lobbyist sniper — long rifle, muzzle far right
  foodtruck:{ mx:0.76, my:0.50, w:1.10 },   // Food Truck — flame jet from the front grille
  auditor:  { mx:0.72, my:0.40, w:1.30 },   // Auditor — due-diligence cannon (big)
  founder:  { mx:0.74, my:0.40, w:1.50 },   // Founder Mech — arm cannon (biggest)
  rex:      { mx:0.74, my:0.46, w:1.70 },   // REX boss — alien arm/shoulder cannon (4× mech; fine-tune via calibrator)
  bomber:   { mx:0.42, my:0.66, w:1.40 },   // Buzzword Bomber — underside ordnance (facesLeft)

  // ---- defensive buildings (footprint-relative rooftop muzzle) ----
  hq:       { bx:0.50, by:0.12, w:1.00 },   // Open-Plan HQ — rooftop warning shot
  turret:   { bx:0.50, by:0.06, w:1.10 },   // Legal Team turret
};

// Any emitter without an authored point fires from a forward/upper default so it still
// reads as "from the unit" rather than the feet.
const MUZZLE_FALLBACK = { mx:0.70, my:0.42, w:1.00 };
