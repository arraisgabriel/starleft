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

/* Pure: extra enemy soldiers per base for a given VPI. idx is reserved for future per-arc tuning. */
function vetScalingBonus(vpi, idx){
  if(!(vpi > 0)) return 0;
  return Math.max(0, Math.min(VET_MAXBONUS, Math.round(vpi / VET_SCALE)));
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
}
