/* balance.js — dynamic difficulty: scale the enemy to the player's carried CAREER power.
   ALWAYS ON. Loaded before main.js (classic script, shared scope). A player who invests in
   veterans and carries a strong roster between episodes would otherwise trivialize a map tuned for
   fresh starters (e.g. 3×L5 vets + a few healers clearing Episode IV in minutes). To keep every
   quarter a fight, each enemy base musters extra defenders in proportion to a Veteran Power Index
   (VPI) computed from the player units already on the field at map load.

   How it plugs in: newMap() spawns the player's start units, carried vets (spawnVets) and named
   heroes (spawnHeroes) BEFORE it builds the enemy bases, then buildEnemyBase() asks this module how
   many bonus soldiers to add. With no carryover VPI is 0 and the bonus is 0 — so a fresh run and the
   shipping campaign's no-carry baseline are completely unchanged.

   Depends on globals: DEF, CAREER, vetDmgMul, mkUnit (config.js / career.js / map.js). */

/* --- tunables (kept here so balance is easy to adjust in one place) --- */
// Co-op enemy multiplier: extra human players each add COOP_PER_PLAYER of enemy throughput.
// Deliberately sub-linear (2p → 1.85×, not 2×) so it doesn't compound with the nBases + VPI
// scaling into an unwinnable wall. players<=1 → 1 → shipping single-player values exactly.
const COOP_PER_PLAYER = 0.85;
function coopFactor(players){ return 1 + (Math.max(1, players||1) - 1) * COOP_PER_PLAYER; }

const VET_SCALE   = 25;   // VPI per +1 enemy soldier per base (≈ 3×L5 vets, VPI~70 → +3)
const VET_MAXBONUS = 4;   // hard cap on bonus defenders per base (never an unwinnable wall)
const VET_MINT_MAX = 0.25; // up to -25% enemy mint interval at very high VPI (faster reinforcement)
const VET_MINT_VPI = 200;  // VPI at which the mint speedup reaches its max

/* Per-career-unit power: stars weighted by the same damage×HP product the game actually grants.
   Level 0 (un-promoted) units contribute 0, so only real veterans/heroes move the needle. */
function unitVetPower(u){
  const s = u.stars || 0;
  if(s <= 0) return 0;
  const dmgMul = 1 + CAREER.dmgPerStar * s;   // matches vetDmgMul
  const hpMul  = 1 + CAREER.hpPerStar  * s;   // matches applyVetHp
  return s * dmgMul * hpMul;
}

/* VPI = total carried career power on the field: live player combat units + named heroes.
   Workers and un-leveled fresh units add nothing. Called at map load (player units already placed). */
function computePlayerVPI(state){
  let vpi = 0;
  for(const e of state.entities){
    if(e.dead || e.owner!=='player' || e.kind!=='unit') continue;
    // count anything that can climb the ladder (vets) plus heroes (e.g. a hero healer still counts)
    const ladder = (typeof isCombatVet==='function') ? isCombatVet(e) : ((DEF[e.type]&&DEF[e.type].dmg>0)&&e.type!=='worker');
    if(ladder || e.hero) vpi += unitVetPower(e);
  }
  return vpi;
}

/* Combat power of a unit TYPE at a star level: effective damage × effective HP (the same dmg×HP
   product the game grants per level). Unlike unitVetPower (which is 0 for un-promoted units), this
   counts everyone — used by MADOSIS to size a Kennel squad against ALL units guarding a rescued dog,
   fresh recruits included. Healers/workers (no dmg) get a small presence value so they still matter. */
function typePower(type, stars){
  const d=DEF[type]||{}; const s=stars||0;
  const dmg=(d.dmg||0)>0 ? d.dmg : ((d.heal||0)>0 ? 2 : 1);   // healers count a little; workers minimally
  const hp=d.hp||1;
  return dmg*(1+CAREER.dmgPerStar*s) * hp*(1+CAREER.hpPerStar*s);
}
function combatPower(u){ return u ? typePower(u.type, u.stars||0) : 0; }

/* Pure: extra enemy soldiers per base for a given VPI. idx is reserved for future per-arc tuning. */
function vetScalingBonus(vpi, idx){
  if(!(vpi > 0)) return 0;
  return Math.max(0, Math.min(VET_MAXBONUS, Math.round(vpi / VET_SCALE)));
}

/* Per-squad reinforcement for the Episode X corridor guard squads (map.js). Deliberately lighter than
   the per-base bonus and tightly capped — a guarded corridor must stay passable for a small elite
   squad while still tightening up for a heavy carried roster. The scale is set so Nino's own power
   (he is always present, VPI~135) lands the small-squad case on +1 (a ~58-unit corridor), and only a
   genuinely heavy carried roster (VPI>~180) reaches the +2 ceiling (~67) — a real two-step ramp, not
   an all-or-nothing jump. */
const GUARD_VET_SCALE = 120;  // VPI per +1 guard reinforcing a squad's anchor type
const GUARD_VET_MAXBONUS = 2; // hard cap on extra guards per squad
function guardVetBonus(vpi){
  if(!(vpi > 0)) return 0;
  return Math.max(0, Math.min(GUARD_VET_MAXBONUS, Math.round(vpi / GUARD_VET_SCALE)));
}

/* Mint-interval multiplier (<=1) so a heavily-veteran player also faces faster reinforcement. */
function vetMintFactor(vpi){
  if(!(vpi > 0)) return 1;
  const t = Math.min(1, vpi / VET_MINT_VPI);
  return 1 - VET_MINT_MAX * t;
}

/* Add the bonus defenders to one freshly-built enemy base. Called from buildEnemyBase with the
   base origin and the VPI computed once for the map. Mirrors buildEnemyBase's own muster placement. */
function applyVetScalingToBase(state, base, idx, vpi){
  const bonus = vetScalingBonus(vpi, idx);
  if(!bonus) return 0;
  const ax = base.x, ay = base.y;
  // stagger the extra soldiers on the row below the base's normal muster so they don't stack
  for(let i=0;i<bonus;i++) mkUnit(state,'soldier','enemy', ax+1+(i%4), ay+7+((i/4)|0));
  return bonus;
}

// expose (harmless under classic-script shared scope; explicit for the headless sim's sandbox)
if(typeof window!=='undefined'){
  window.computePlayerVPI=computePlayerVPI; window.vetScalingBonus=vetScalingBonus;
  window.vetMintFactor=vetMintFactor; window.applyVetScalingToBase=applyVetScalingToBase;
  window.guardVetBonus=guardVetBonus;
  window.typePower=typePower; window.combatPower=combatPower;
}
