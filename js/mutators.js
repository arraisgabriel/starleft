/* mutators.js — stackable run modifiers for SKIRMISH/endless only (T3-4). The campaign stays
   authored: applyMutators is only called from startSkirmish (js/skirmish_gen.js). Each mutator is
   a small deterministic hook on systems that already exist; the stacked `mult` feeds the Valuation
   score (state._scoreMul, read by valuationFor in js/hub.js). Solo entry point today — a co-op
   skirmish host would need to ship the keys in mpstart before these can be co-op-enabled. */

const MUTATORS = {
  crunch:  { name:'Crunch Time',     icon:'⏰', desc:'No grace period — pressure from minute zero.',          mult:1.5 },
  sanity:  { name:'Sanity Collapse', icon:'🧠', desc:'Madosis accrues ×3.',                                    mult:1.4 },
  bull:    { name:'Bull Market',     icon:'📈', desc:'Funding nodes hold ×2 — and so does the enemy\'s pace.', mult:0.8 },
  down:    { name:'Down Round',      icon:'📉', desc:'Start with 0 Funding.',                                  mult:1.3 },
  sudden:  { name:'Sudden Death',    icon:'💀', desc:'Veterans never self-heal.',                              mult:1.5 },
  pitch:   { name:'Hold the Pitch',  icon:'🎤', desc:'Survive 6 minutes instead of razing.',                   mult:1.6 },
};

// apply at map load (host/solo). All effects are deterministic state/cfg edits — no RNG, no timers.
function applyMutators(state, keys){
  if(!state || !keys || !keys.length) return;
  state._mutators = keys.slice();
  let mult = 1;
  for(const k of keys){
    const m = MUTATORS[k]; if(!m) continue;
    mult *= m.mult;
    switch(k){
      case 'crunch':
        state.graceTime = 0;
        state.cfg.aggression = (state.cfg.aggression||1) * 1.3;
        break;
      case 'sanity':
        state._madosisMul = 3;                      // read by addMadosis (js/madosis.js)
        break;
      case 'bull':
        for(const e of state.entities){ if(e.type==='goldmine' && !e.dead){ e.amount*=2; e.amount0*=2; } }
        state.cfg.aggression = (state.cfg.aggression||1) * 1.15;
        break;
      case 'down':
        for(const key in (state.eco||{})){ const p=state.eco[key]; if(p){ p.gold=0; } }
        break;
      case 'sudden':
        state._noRegen = true;                      // read by vetRegen (js/career.js)
        break;
      case 'pitch':
        state.cfg.winCondition = { type:'survive', forSec:360, protect:'hq' };   // reuses T2-1's verb
        state.cfg.objective = 'HOLD THE PITCH — survive 6 minutes with your HQ standing.';
        break;
    }
  }
  state._scoreMul = Math.round(((state._scoreMul||1)*mult)*100)/100;   // stacks onto the difficulty multiplier (T3-3/T4-2)
  if(typeof toast==='function' && !window._rbReplaying)
    toast('🧬 Mutators: '+keys.map(k=>MUTATORS[k]?MUTATORS[k].name:k).join(' + ')+' — score ×'+state._scoreMul);
}
