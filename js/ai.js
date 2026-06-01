/* ai.js — enemy AI: enemyAI tick, enemyFortify, pickPlayerTarget. */
/* =====================================================================
   ENEMY AI
   ===================================================================== */
function enemyAI(state,dt){
  const aggr = state.cfg.aggression || (state.cfg.enemy && state.cfg.enemy.aggression) || 1;
  const grace = state.time < state.graceTime;   // early-game peace: enemy builds up but won't attack yet
  if(!grace && !state._graceWarned){ state._graceWarned=true;
    toast('📣 '+(state.cfg.enemyName||'The rival')+' just closed a funding round — incoming!'); }
  // enemy barracks auto-produce soldiers (free) up to a cap that grows over time
  // `guard` units (Episode X corridor/cell squads) are excluded: they don't count toward the
  // production cap and are never swept into a wave, so they hold their post instead of marching off.
  const enemyUnits = state.entities.filter(e=>e.owner==='enemy'&&e.kind==='unit'&&!e.dead&&!e.guard);
  const enemyBarracks = state.entities.filter(e=>e.owner==='enemy'&&e.type==='barracks'&&!e.dead&&!e.constructing);
  // smaller standing force early, ramps up to a fixed ceiling (so a massed
  // player army can eventually overwhelm them instead of being out-scaled forever)
  // scale the enemy army by how many bases still stand — multi-base maps field a
  // much larger force, and the enemy weakens as you destroy each base.
  const nBases = Math.max(1, state.entities.filter(e=>e.owner==='enemy'&&e.type==='hq'&&!e.dead).length);
  let hardCap, cap;
  if(nBases<=1){
    hardCap = grace? 3 : Math.round(4 + 2*aggr);                            // ~6 (map1), ~7 (map2)
    cap = Math.min(hardCap, (grace?3:5) + Math.floor(state.time/50)*2*aggr);
  } else {
    hardCap = grace? 3*nBases : Math.round((4 + 2*aggr) * nBases * 0.6);    // ~9 (map3/4): harder than 1-base maps, still beatable
    cap = Math.min(hardCap, ((grace?3:5) + Math.floor(state.time/45)*2*aggr) * nBases);
  }

  const enemyGarages = state.entities.filter(e=>e.owner==='enemy'&&e.type==='garage'&&!e.dead&&!e.constructing);
  state.enemySpawnTimer-=dt;
  if(state.enemySpawnTimer<=0 && enemyUnits.length<cap && (enemyBarracks.length||enemyGarages.length)){
    // slow trickle during grace, slower replacement afterwards (so a player
    // assault that kills units faster than they respawn can break the base)
    state.enemySpawnTimer = grace? 18 : Math.max(7, 12/aggr);
    if(enemyGarages.length && !grace && Math.random()<0.25){
      // a vehicle rolls out of the rival's garage
      const b=enemyGarages[(Math.random()*enemyGarages.length)|0];
      spawnTrained(state,b, Math.random()<0.3?'auditor':'foodtruck');
    } else if(enemyBarracks.length){
      // varied infantry: mostly Growth Hackers/Consultants, plus Hustlers, Lobbyists, and the odd Recruiter
      const b=enemyBarracks[(Math.random()*enemyBarracks.length)|0];
      const pool=['soldier','soldier','soldier','ranger','ranger','hustler','lobbyist','recruiter'];
      spawnTrained(state,b, pool[(Math.random()*pool.length)|0]);
    }
  }

  // waves: send only the SURPLUS beyond a home garrison, so the base stays guarded
  state.enemyWaveTimer-=dt;
  if(!grace && state.enemyWaveTimer<=0){
    state.enemyWaveTimer = Math.max(20, 38/aggr);   // calmer cadence between waves
    const idle=enemyUnits.filter(u=>!u.cmd||u.cmd.type==='amove'||u.state==='idle');
    const garrison = Math.round((2 + aggr) * (nBases>1?1.4:1));  // keep more home when defending multiple bases
    if(idle.length > garrison + 2){
      const wave = idle.slice(garrison);            // leave the garrison guarding the base
      const target = pickPlayerTarget(state);
      if(target){
        wave.forEach((u,i)=>{
          const ox=((i%4)-1.5)*26, oy=((Math.floor(i/4))-1)*26;
          issueMove(state,u,target.x+ox,target.y+oy,{type:'amove',x:target.x+ox,y:target.y+oy});
        });
        state.waveCount++;
      }
    }
  }

  // fortify: the rival reinvests in base security over time, raising Guard
  // Turrets (Legal Teams) around its HQ — so a late-game base is no pushover.
  state.enemyFortifyTimer-=dt;
  if(!grace && state.enemyFortifyTimer<=0){
    // slow cadence: at most one turret every ~40s, so a focused assault can
    // out-pace rebuilds and break through (no hydra), yet the base stays
    // defended again between attacks.
    state.enemyFortifyTimer = 18;   // faster watchtower progression (was 40s)
    const maxTur = Math.round(1 + aggr*2);                                   // per base: 3 (map1) .. 5 (map6)
    const target = Math.min(maxTur, 1 + Math.floor((state.time-state.graceTime)/18));
    enemyFortify(state, target);   // fortifies the neediest base (per-base turret cap)
  }
  // idle garrison + turrets auto-engage handled in updateUnit / turret loop
}

// Fortify the enemy base most in need: pick the HQ with the fewest nearby
// turrets (below the per-base cap) and raise one on a free tile facing the
// player. Built unmanned (self-constructs). Works for any number of bases.
function enemyFortify(state, perBaseTarget){
  const hqs = state.entities.filter(e=>e.owner==='enemy'&&e.type==='hq'&&!e.dead);
  if(!hqs.length) return;
  const phq = state.entities.find(e=>e.owner==='player'&&e.type==='hq'&&!e.dead)
           || state.entities.find(e=>e.owner==='player'&&e.kind==='building'&&!e.dead);
  let chosen=null, fewest=1e9;
  for(const hq of hqs){
    const near = state.entities.filter(e=>e.owner==='enemy'&&e.type==='turret'&&!e.dead && Math.abs(e.tx-hq.tx)<=8 && Math.abs(e.ty-hq.ty)<=8).length;
    if(near<perBaseTarget && near<fewest){ fewest=near; chosen=hq; }
  }
  if(!chosen) return;
  const cx=chosen.tx, cy=chosen.ty;
  let best=null, bestScore=-1e9;
  for(let r=2;r<=6;r++) for(let y=-r;y<=r;y++) for(let x=-r;x<=r;x++){
    if(Math.max(Math.abs(x),Math.abs(y))!==r) continue;       // only the ring at radius r
    const tx=cx+x, ty=cy+y;
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) continue;
    if(state.blocked[ty*state.W+tx]) continue;
    let onMine=false;
    for(const g of state.entities){ if(g.type==='goldmine'&&!g.dead && ((g.x/TILE)|0)===tx && ((g.y/TILE)|0)===ty){ onMine=true; break; } }
    if(onMine) continue;
    const wx=tx*TILE+TILE/2, wy=ty*TILE+TILE/2;
    let score = -r*0.5;
    if(phq){ const a1=Math.atan2(phq.y-chosen.y,phq.x-chosen.x), a2=Math.atan2(wy-chosen.y,wx-chosen.x);
      score += Math.cos(a1-a2)*2.0; }
    score += (Math.random()-0.5)*0.5;
    if(score>bestScore){ bestScore=score; best={tx,ty}; }
  }
  if(best) mkBuilding(state,'turret','enemy',best.tx,best.ty,false);
}
function pickPlayerTarget(state){
  let hq=state.entities.find(e=>e.owner==='player'&&e.type==='hq'&&!e.dead);
  if(hq) return hq;
  let b=state.entities.find(e=>e.owner==='player'&&e.kind==='building'&&!e.dead);
  if(b) return b;
  return state.entities.find(e=>e.owner==='player'&&e.kind==='unit'&&!e.dead);
}

