/* units.js — units, pathfinding, commands, production/building, combat & movement (findPath, updateUnit, separation, applyHit, …). */
/* =====================================================================
   PATHFINDING (A* on tile grid using blocked array)
   ===================================================================== */
function findPath(state, sx,sy, gx,gy){
  const W=state.W,H=state.H, B=state.blocked;
  if(gx<0||gy<0||gx>=W||gy>=H) return null;
  // if goal blocked, find nearest passable around it
  if(B[gy*W+gx]){
    let best=null,bd=1e9;
    for(let r=1;r<=4&&!best;r++){
      for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
        const nx=gx+x,ny=gy+y; if(nx<0||ny<0||nx>=W||ny>=H)continue;
        if(!B[ny*W+nx]){ const d=x*x+y*y; if(d<bd){bd=d;best=[nx,ny];} }
      }
    }
    if(!best) return null; gx=best[0]; gy=best[1];
  }
  if(sx===gx&&sy===gy) return [[gx,gy]];
  const open=[]; const came=new Map(); const gScore=new Map();
  const key=(x,y)=>y*W+x;
  const h=(x,y)=>Math.abs(x-gx)+Math.abs(y-gy);
  gScore.set(key(sx,sy),0);
  open.push({x:sx,y:sy,f:h(sx,sy)});
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  let iter=0;
  while(open.length){
    if(++iter>9000) break;
    // get lowest f (linear; fine for our sizes)
    let bi=0; for(let i=1;i<open.length;i++) if(open[i].f<open[bi].f) bi=i;
    const cur=open.splice(bi,1)[0];
    if(cur.x===gx&&cur.y===gy){
      // reconstruct
      const path=[]; let k=key(gx,gy);
      while(k!==undefined){ const x=k%W,y=(k/W)|0; path.push([x,y]); k=came.get(k); }
      path.reverse(); return path;
    }
    const cg=gScore.get(key(cur.x,cur.y));
    for(const [dx,dy] of dirs){
      const nx=cur.x+dx, ny=cur.y+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(B[key(nx,ny)]) continue;
      if(dx&&dy){ // no diagonal through wall corners
        if(B[key(cur.x+dx,cur.y)]||B[key(cur.x,cur.y+dy)]) continue;
      }
      const ng=cg + ((dx&&dy)?1.414:1);
      const nk=key(nx,ny);
      if(!gScore.has(nk)||ng<gScore.get(nk)){
        gScore.set(nk,ng); came.set(nk,key(cur.x,cur.y));
        const f=ng+h(nx,ny);
        const ex=open.find(o=>o.x===nx&&o.y===ny);
        if(ex) ex.f=f; else open.push({x:nx,y:ny,f});
      }
    }
  }
  return null;
}

function issueMove(state, unit, wx, wy, cmd){
  if(unit.air){ unit.path=null; unit.pathIdx=0; unit.dest={x:wx,y:wy}; unit.cmd=cmd||{type:'move',x:wx,y:wy}; return; } // flyers go straight, ignoring terrain
  const sx=(unit.x/TILE)|0, sy=(unit.y/TILE)|0;
  const gx=(wx/TILE)|0, gy=(wy/TILE)|0;
  const path=findPath(state,sx,sy,gx,gy);
  if(path&&path.length){
    unit.path=path; unit.pathIdx= path.length>1?1:0;
    unit.dest={x:wx,y:wy};
  } else {
    unit.path=null; unit.dest={x:wx,y:wy};
  }
  unit.cmd=cmd||{type:'move',x:wx,y:wy};
}

/* =====================================================================
   COMMANDS (right-click context)
   ===================================================================== */
function commandUnits(state, wx, wy, target){
  const sel = state.selection.filter(e=>!e.dead);
  if(!sel.length) return;

  // If only buildings selected → set rally point
  const units = sel.filter(e=>e.kind==='unit'&&e.owner==='player');
  const buildings = sel.filter(e=>e.kind==='building'&&e.owner==='player');
  if(units.length===0 && buildings.length){
    buildings.forEach(b=>{ if(!b.constructing){ b.rally={x:wx,y:wy}; }});
    toast('Rally point set'); spawnRing(wx,wy,'#7fd6ff');
    return;
  }

  if(target && target.owner && target.owner!=='player'){
    // attack
    units.forEach(u=> attackTarget(state,u,target));
    spawnRing(target.x,target.y,'#ff6b6b');
    return;
  }
  // assign worker(s) to an unfinished friendly building (resume/assist construction)
  if(target && target.owner==='player' && target.kind==='building' && target.constructing){
    const builders=units.filter(u=>u.type==='worker');
    builders.forEach(u=> assignBuild(state,u,target));
    units.filter(u=>u.type!=='worker').forEach(u=>{ resetMotion(u); issueMove(state,u,target.x,target.y); });
    toast(builders.length ? 'Intern assigned to construction' : 'Select an Intern to build');
    spawnRing(target.x,target.y,'#8effb0');
    return;
  }
  if(target && target.type==='goldmine'){
    units.filter(u=>u.type==='worker').forEach(u=> gatherFrom(state,u,target));
    units.filter(u=>u.type!=='worker').forEach((u,i)=>{ resetMotion(u); issueMove(state,u,target.x+(i%3-1)*22,target.y+22); });
    spawnRing(target.x,target.y,'#ffd86b');
    return;
  }
  // move (formation offsets)
  const n=units.length; const cols=Math.ceil(Math.sqrt(n));
  units.forEach((u,i)=>{
    const ox=((i%cols)-(cols-1)/2)*26, oy=((Math.floor(i/cols))-(cols-1)/2)*26;
    resetMotion(u);
    issueMove(state,u, wx+ox, wy+oy); // plain move — obey the order, don't divert to auto-attack
  });
  spawnRing(wx,wy,'#7fd6ff');
}

// Clear all transient movement/targeting state so a fresh command isn't
// blocked by leftover flags from a previous one (e.g. a stale _toMine flag
// that would stop a worker from ever pathing to a newly clicked mine).
function resetMotion(u){
  u._toMine=false; u._toDep=false; u._reTarget=null; u._chaseTimer=0;
  u.autoTarget=null; u.path=null; u.pathIdx=0; u.dest=null;
  u._stuckT=0; u._lastTargD=undefined; u._toBuild=false; u._buildRepath=0;
}
function attackTarget(state,u,target){
  resetMotion(u);
  u.cmd={type:'attack',target};
  u.state='attack';
}
function gatherFrom(state,u,mine){
  resetMotion(u);
  u.cmd={type:'gather',mine};
  u.state='gather';
}

/* =====================================================================
   PRODUCTION & BUILDING
   ===================================================================== */
function tryTrain(state, building, type){
  const d=DEF[type];
  if(state.gold < d.cost){ toast('Not enough gold'); return; }
  if(d.supply && state.supply + (state.queuedSupply||0) + d.supply > state.supplyCap){
    toast('Not enough supply — build a Command Center'); return;
  }
  state.gold -= d.cost;
  building.prodQueue.push(type);
  if(building.prodTotal===0){ building.prodTotal=d.build; building.prodTime=0; }
}

function tryPlace(state, type){
  const sel = state.selection.find(e=>e.kind==='unit'&&e.type==='worker'&&!e.dead);
  if(!sel){ toast('Select a Worker first'); return; }
  const d=DEF[type];
  if(state.gold < d.cost){ toast('Not enough gold'); return; }
  state.placing = { type, def:d, builder:sel };
  toast('Tap a spot to build the '+d.name+' (Cancel / Esc to abort)');
}

function canPlaceAt(state, type, tx, ty){
  const d=DEF[type];
  for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++){
    const cx=tx+x, cy=ty+y;
    if(cx<0||cy<0||cx>=state.W||cy>=state.H) return false;
    if(state.blocked[cy*state.W+cx]) return false;
    if(!state.explored[cy*state.W+cx]) return false;
  }
  // not on top of entities
  for(const e of state.entities){
    if(e.dead||e.type==='goldmine'&&false) {}
    if(e.kind==='unit') continue;
    if(e.kind==='building'){
      if(tx< e.tx+e.w && tx+d.w>e.tx && ty< e.ty+e.h && ty+d.h>e.ty) return false;
    }
    if(e.type==='goldmine'){
      const gx=(e.x/TILE-0.5)|0, gy=(e.y/TILE-0.5)|0;
      if(tx<=gx+0 && tx+d.w>gx && ty<=gy && ty+d.h>gy) return false;
    }
  }
  return true;
}

// Nearest passable tile in the ring around a building's footprint (incl.
// diagonals) — where a worker should stand to construct it.
function nearestFreeAdjTile(state, b, fromX, fromY){
  let best=null, bd=1e18;
  for(let y=-1;y<=b.h;y++) for(let x=-1;x<=b.w;x++){
    if(x>=0&&x<b.w&&y>=0&&y<b.h) continue;          // inside footprint
    const tx=b.tx+x, ty=b.ty+y;
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) continue;
    if(state.blocked[ty*state.W+tx]) continue;       // wall / another building
    const cx=tx*TILE+TILE/2, cy=ty*TILE+TILE/2;
    const d=(cx-fromX)**2+(cy-fromY)**2;
    if(d<bd){ bd=d; best={x:cx,y:cy}; }
  }
  return best;
}
// Assign a worker to (continue) building b: walk to the nearest free adjacent tile.
function assignBuild(state, u, b){
  resetMotion(u);
  u.cmd={type:'build', building:b};
  u.state='build';
  const spot=nearestFreeAdjTile(state,b,u.x,u.y) || {x:b.x,y:b.y};
  issueMoveKeepCmd(state,u,spot.x,spot.y);
  u._toBuild=true; u._buildRepath=1.2;
}

function placeBuilding(state, type, tx, ty, builder){
  const d=DEF[type];
  state.gold -= d.cost;
  const b = mkBuilding(state,type,'player',tx,ty,false);
  b.hp=1;
  assignBuild(state, builder, b);     // robust approach + re-pathing
  recomputeSupply(state);
  toast('Construction started');
}

/* =====================================================================
   UPDATE LOOP
   ===================================================================== */
// can this attacker hit air units? ranged (>=2.5 tiles) or explicitly anti-air
function canHitAir(e){ const d=DEF[e.type]||{}; return !!(d.antiAir || (d.range||0)>=2.5); }
function nearestEnemy(state, e, radius){
  let best=null,bd=radius*radius; const air=canHitAir(e);
  for(const o of state.entities){
    if(o.dead||o.owner==null||o.owner===e.owner) continue;
    if(o.owner!=='player'&&o.owner!=='enemy') continue;
    if(o.air && !air) continue;                 // melee/no-AA units ignore flyers
    const dx=o.x-e.x,dy=o.y-e.y,d=dx*dx+dy*dy;
    if(d<bd){bd=d;best=o;}
  }
  return best;
}
// apply a hit with optional area splash to nearby enemies of the same target
function applyHit(state, attacker, target, dmg, splash, splashR){
  damage(state, target, dmg, attacker);
  if(splash){ const R=(splashR||1.3)*TILE;
    for(const o of state.entities){ if(o.dead||o===target||o.owner==null||o.owner===attacker.owner) continue;
      if(o.owner!=='player'&&o.owner!=='enemy') continue;
      if(o.air && !target.air) continue;        // ground splash doesn't hit flyers and vice-versa
      if(!o.air && target.air) continue;
      if(dist(o,target)<=R) damage(state,o,splash,attacker); }
  }
}
function nearestDeposit(state, e){
  let best=null,bd=1e18;
  for(const o of state.entities){
    if(o.dead||o.owner!==e.owner) continue;
    if(o.kind!=='building'||o.constructing) continue;
    if(!(o.type==='hq')) continue;
    const dx=o.x-e.x,dy=o.y-e.y,d=dx*dx+dy*dy; if(d<bd){bd=d;best=o;}
  }
  return best;
}

function entRadius(e){ return e.kind==='building' ? Math.max(e.w,e.h)*TILE*0.5 : (e.r||10); }

function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }


function spawnTrained(state,b,type){
  // spawn near building, send to rally
  let sx=b.tx+b.w, sy=b.ty+b.h-1;
  // find free tile around
  outer:
  for(let r=1;r<=4;r++) for(let y=-r;y<=r;y++) for(let x=-r;x<=r;x++){
    const tx=b.tx+x+ (x>=0?b.w:0), ty=b.ty+y;
  }
  let placed=null;
  for(let r=0;r<=5&&!placed;r++){
    for(let a=0;a<8;a++){
      const tx=Math.round(b.tx+b.w/2 + Math.cos(a/8*6.28)*(r+1));
      const ty=Math.round(b.ty+b.h/2 + Math.sin(a/8*6.28)*(r+1));
      if(tx>=0&&ty>=0&&tx<state.W&&ty<state.H&&!state.blocked[ty*state.W+tx]){ placed=[tx,ty]; break; }
    }
  }
  if(!placed) placed=[b.tx,b.ty+b.h];
  const u=mkUnit(state,type,b.owner,placed[0],placed[1]);  // mkUnit already pushes to entities
  if(b.rally){ if(b.owner==='player'){ issueMove(state,u,b.rally.x,b.rally.y,{type:'amove',x:b.rally.x,y:b.rally.y}); } }
  recomputeSupply(state);
}

function updateUnit(state,u,dt){
  const cmd=u.cmd;
  const def=DEF[u.type];
  u._actState=null;   // set to 'attack' / 'mine' / 'heal' below (drives action sprites)

  // ---- siege auto-deploy (Auditor): set up when enemies near & not moving ----
  if(def.siege){
    const sg=def.siege;
    const moving = cmd && (cmd.type==='move'||cmd.type==='hold'); // move or Stop/hold breaks siege
    const foe = nearestEnemy(state,u, sg.range*TILE);
    if(foe && !moving){ u._setupT=(u._setupT||0)+dt; if(u._setupT>=sg.setup) u.sieged=true; }
    else { u._setupT=0; u.sieged=false; }
  }

  // ---- auto-heal (Recruiter / Courier): follow & mend the most-hurt ally in sight ----
  if(def.heal){
    if(!cmd || cmd.type==='amove' || cmd.type==='move' || u.state==='idle'){
      let best=null,bd=(u.sight*TILE)**2;
      for(const o of state.entities){ if(o.dead||o.owner!==u.owner||o.kind!=='unit'||o===u)continue; if(o.hp>=o.maxHp)continue;
        const dx=o.x-u.x,dy=o.y-u.y,dd=dx*dx+dy*dy; if(dd<bd){bd=dd;best=o;} }
      u._healTarget=best;
    }
    const tgt=u._healTarget;
    if(tgt && !tgt.dead && tgt.hp<tgt.maxHp){
      const reach=u.range*TILE+entRadius(tgt);
      if(dist(u,tgt)<=reach){ u.path=null; faceTo(u,tgt); u._actState='heal'; u._face=tgt.x<u.x?-1:1;
        tgt.hp=Math.min(tgt.maxHp, tgt.hp + def.heal*dt); }
      else { if(!u._toHeal||(u._healRepath||0)<=0){ issueMoveKeepCmd(state,u,tgt.x,tgt.y); u._toHeal=true; u._healRepath=0.5; } u._healRepath-=dt; followPath(state,u,dt); }
      return;
    } else u._toHeal=false;   // nothing to heal → fall through to move/idle (healers don't fight)
  }

  // ---- auto-acquire for any combat unit (not workers, not healers) ----
  if(def.dmg>0 && u.type!=='worker' && (!cmd || cmd.type==='amove')){
    const acqR=(def.siege && u.sieged ? def.siege.range : u.sight*0.9)*TILE;
    const aggro = nearestEnemy(state,u,acqR);
    if(aggro){ u.autoTarget=aggro; } else if(u.autoTarget&&u.autoTarget.dead) u.autoTarget=null;
  }
  // turret-like worker defense: workers fight back if adjacent enemy and idle
  if(u.type==='worker' && !cmd){
    const near=nearestEnemy(state,u, u.range*TILE+8);
    if(near) u.autoTarget=near; else u.autoTarget=null;
  }

  // ---- handle attack target (explicit or auto) ----
  let atk = (cmd&&cmd.type==='attack'&&cmd.target&&!cmd.target.dead) ? cmd.target : null;
  if(!atk && u.autoTarget && !u.autoTarget.dead) atk=u.autoTarget;
  if(atk && atk.air && !canHitAir(u)){ atk=null; u.autoTarget=null; if(cmd&&cmd.type==='attack')u.cmd=null; }  // can't reach flyers

  if(atk){
    // effective stats (Auditor gains range/dmg/splash while sieged)
    let aRange=u.range, aDmg=u.dmg, aSplash=def.splash||0, aSplashR=def.splashR||1.3;
    if(def.siege && u.sieged){ const sg=def.siege; aRange=sg.range; aDmg=sg.dmg; aSplash=Math.round(sg.dmg*0.6); aSplashR=sg.splashR; }
    const reach = aRange*TILE + entRadius(atk);
    const d=dist(u,atk);
    if(d<=reach){
      // in range — stop & attack
      u.path=null;
      faceTo(u,atk);
      u._actState='attack'; u._face = atk.x<u.x?-1:1;
      if(u.cd<=0){ applyHit(state,u,atk,aDmg,aSplash,aSplashR);
        u.cd = def.cd;
        u._actStamp = state.time;   // timestamps the strike so the swing/shot frame lands on it
        if(aRange>2) u.shootFx={x:atk.x,y:atk.y,t:0.1};
      }
    } else if(def.siege && u.sieged){
      // rooted while sieged — hold fire until the target re-enters range
    } else {
      // chase
      if(!u.path || u._reTarget!==atk.id || (u._chaseTimer||0)<=0){
        issueMoveKeepCmd(state,u,atk.x,atk.y); u._reTarget=atk.id; u._chaseTimer=0.5;
      }
      u._chaseTimer-=dt;
      followPath(state,u,dt);
    }
    return;
  } else { u._reTarget=null; }

  // ---- gather ----
  if(cmd&&cmd.type==='gather'){
    const mine=cmd.mine;
    if(!mine||mine.dead||mine.amount<=0){
      // find another mine
      const m=nearestMine(state,u); if(m){ cmd.mine=m; } else { u.cmd=null; u.state='idle'; }
      return;
    }
    if(u.carrying>=14){
      // return to deposit
      const dep=nearestDeposit(state,u);
      if(!dep){ u.state='idle'; return; }
      const reach=entRadius(dep)+14;
      if(dist(u,dep)<=reach){
        state.gold += u.carrying; state.gold_collected+=u.carrying; u.carrying=0;
        u.path=null;
      } else {
        if(!u._toDep){ issueMoveKeepCmd(state,u,dep.x,dep.y); u._toDep=true; u._toMine=false; }
        followPath(state,u,dt);
      }
    } else {
      const reach=entRadius(mine)+14;
      if(dist(u,mine)<=reach){
        u.path=null; u.gatherTimer+=dt;
        u._actState='mine'; u._face = mine.x<u.x?-1:1;
        if(u.gatherTimer>=0.55){ const take=Math.min(3,mine.amount); mine.amount-=take; u.carrying+=take; u.gatherTimer=0; }
        u._toMine=false;
      } else {
        if(!u._toMine){ issueMoveKeepCmd(state,u,mine.x,mine.y); u._toMine=true; u._toDep=false; }
        followPath(state,u,dt);
      }
    }
    return;
  }

  // ---- build ----
  if(cmd&&cmd.type==='build'){
    const b=cmd.building;
    if(!b||b.dead){ u.cmd=null; u.state='idle'; u._toBuild=false; return; }
    if(!b.constructing){ u.cmd=null; u.state='idle'; u._toBuild=false; return; }
    // generous reach: any adjacent tile (incl. diagonal) counts as "at the site"
    const reach = Math.max(b.w,b.h)*TILE*0.5 + TILE*1.2;
    if(dist(u,b)<=reach){
      u.path=null; u._toBuild=false;
      b.buildProg += dt;
      b.hp = Math.min(b.maxHp, (b.buildProg/b.buildTime)*b.maxHp);
      if(b.buildProg>=b.buildTime){ b.constructing=false; b.hp=b.maxHp; u.cmd=null; u.state='idle';
        recomputeSupply(state); toast(DEF[b.type].name+' complete'); refreshUI(); }
    } else {
      // (re)path to the nearest reachable tile next to the site; re-path on a
      // timer or if the path ran out short — never sit stuck beyond reach.
      if(!u._toBuild || (u._buildRepath||0)<=0 || !u.path){
        const spot=nearestFreeAdjTile(state,b,u.x,u.y) || {x:b.x,y:b.y};
        issueMoveKeepCmd(state,u,spot.x,spot.y);
        u._toBuild=true; u._buildRepath=1.2;
      }
      u._buildRepath-=dt;
      followPath(state,u,dt);
    }
    return;
  }

  // ---- plain move / amove ----
  if(cmd&&(cmd.type==='move'||cmd.type==='amove')){
    if(followPath(state,u,dt)){ u.cmd=null; u.state='idle'; }
    return;
  }
  u.state='idle';
}

function issueMoveKeepCmd(state,u,wx,wy){
  const savedCmd=u.cmd;
  issueMove(state,u,wx,wy);
  u.cmd=savedCmd;
}

function nearestMine(state,u){
  let best=null,bd=1e18;
  for(const o of state.entities){ if(o.dead||o.type!=='goldmine'||o.amount<=0)continue;
    const d=(o.x-u.x)**2+(o.y-u.y)**2; if(d<bd){bd=d;best=o;} } return best;
}

function faceTo(u,t){ u.dir=Math.atan2(t.y-u.y,t.x-u.x); }

// returns true when arrived
function followPath(state,u,dt){
  if(!u.path){
    if(u.dest){ // direct
      const dx=u.dest.x-u.x, dy=u.dest.y-u.y, d=Math.hypot(dx,dy);
      if(d<4){ u.dest=null; return true; }
      const sp=u.speed*TILE*dt; u.x+=dx/d*Math.min(sp,d); u.y+=dy/d*Math.min(sp,d); u.dir=Math.atan2(dy,dx);
      return false;
    }
    return true;
  }
  const node=u.path[u.pathIdx];
  if(!node){ u.path=null; return true; }
  const tx=node[0]*TILE+TILE/2, ty=node[1]*TILE+TILE/2;
  const dx=tx-u.x, dy=ty-u.y, d=Math.hypot(dx,dy);
  const sp=u.speed*TILE*dt;
  if(d<6){
    u.pathIdx++;
    if(u.pathIdx>=u.path.length){ u.path=null;
      // final approach to dest
      if(u.dest){ const ddx=u.dest.x-u.x,ddy=u.dest.y-u.y,dd=Math.hypot(ddx,ddy);
        if(dd>4){ u.x+=ddx/dd*Math.min(sp,dd); u.y+=ddy/dd*Math.min(sp,dd);} }
      return true;
    }
  } else {
    u.x+=dx/d*Math.min(sp,d); u.y+=dy/d*Math.min(sp,d); u.dir=Math.atan2(dy,dx);
  }
  return false;
}

function separation(state,dt){
  const list=state.entities.filter(e=>e.kind==='unit'&&!e.dead);
  for(let i=0;i<list.length;i++){
    const a=list[i];
    for(let j=i+1;j<list.length;j++){
      const b=list[j];
      const dx=b.x-a.x, dy=b.y-a.y; const d2=dx*dx+dy*dy;
      const min=(a.r+b.r);
      if(d2< min*min && d2>0.01){
        const d=Math.sqrt(d2); const overlap=(min-d)/2;
        const ux=dx/d, uy=dy/d;
        a.x-=ux*overlap*0.5; a.y-=uy*overlap*0.5;
        b.x+=ux*overlap*0.5; b.y+=uy*overlap*0.5;
      }
    }
  }
  // keep units out of blocked tiles (flyers are exempt — they ignore terrain)
  for(const a of list){
    if(a.air) continue;
    const tx=(a.x/TILE)|0, ty=(a.y/TILE)|0;
    if(tx>=0&&ty>=0&&tx<state.W&&ty<state.H&&state.blocked[ty*state.W+tx]){
      // push to nearest open neighbor
      let bx=a.x,by=a.y,found=false;
      for(let r=1;r<=3&&!found;r++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
        const nx=tx+x,ny=ty+y; if(nx<0||ny<0||nx>=state.W||ny>=state.H)continue;
        if(!state.blocked[ny*state.W+nx]){ bx=nx*TILE+TILE/2; by=ny*TILE+TILE/2; found=true; break; }
      }
      a.x=bx; a.y=by;
    }
  }
}

/* =====================================================================
   STUCK RESOLUTION
   Units path on the static terrain grid and ignore each other, so a
   stationary unit sitting on a route can physically pin a moving unit in
   place forever (separation just jitters it). Detect a unit that is failing
   to make progress toward its current target and nudge the blocker aside.
   ===================================================================== */
function currentTargetPoint(u){
  if(u.path && u.pathIdx < u.path.length){ const n=u.path[u.pathIdx]; return {x:n[0]*TILE+TILE/2, y:n[1]*TILE+TILE/2}; }
  if(u.dest) return {x:u.dest.x, y:u.dest.y};
  return null;
}
// A unit that may be told to step aside: idle, or one that has basically
// reached its own move destination and is just loitering. Busy units
// (gathering / building / attacking / still travelling) are left alone.
function yieldable(o){
  if(!o.cmd) return true;
  if(o.cmd.type==='move' || o.cmd.type==='amove'){
    if(o.cmd.x!=null && Math.hypot(o.cmd.x-o.x, o.cmd.y-o.y) < TILE*1.5) return true;
  }
  return false;
}
function shoveAside(state, b, fromX, fromY){
  // push the blocker away from the stuck unit; try straight-away first, then the
  // two perpendiculars, picking the first that lands on a passable tile.
  let ax=b.x-fromX, ay=b.y-fromY; const al=Math.hypot(ax,ay)||1; ax/=al; ay/=al;
  const dirs=[[ax,ay],[-ay,ax],[ay,-ax],[-ax,-ay]];
  for(const [dx,dy] of dirs){
    const wx=b.x+dx*TILE*1.4, wy=b.y+dy*TILE*1.4;
    const tx=(wx/TILE)|0, ty=(wy/TILE)|0;
    if(tx<0||ty<0||tx>=state.W||ty>=state.H) continue;
    if(state.blocked[ty*state.W+tx]) continue;
    b._toMine=false; b._toDep=false; b._stuckT=0; b._lastTargD=undefined;
    b.path=null; b.pathIdx=0;
    b.dest={x:tx*TILE+TILE/2, y:ty*TILE+TILE/2};
    b.cmd={type:'move', x:b.dest.x, y:b.dest.y};
    b.state='move';
    return true;
  }
  return false;
}
function handleStuck(state, u){
  const tp=currentTargetPoint(u); if(!tp) return;
  let fx=tp.x-u.x, fy=tp.y-u.y; const fl=Math.hypot(fx,fy)||1; fx/=fl; fy/=fl;
  // find the best yieldable, same-side blocker roughly in front of the stuck unit
  let blocker=null, best=-1;
  for(const o of state.entities){
    if(o===u || o.dead || o.kind!=='unit' || o.owner!==u.owner) continue;
    const dx=o.x-u.x, dy=o.y-u.y; const dist=Math.hypot(dx,dy);
    if(dist > u.r+o.r+10) continue;
    const fwd = dist>0.01 ? (dx*fx+dy*fy)/dist : 1;   // 1 = directly ahead
    if(fwd < 0.25) continue;                           // must be in our way, not beside/behind
    if(!yieldable(o)) continue;
    const score = fwd - dist/200;
    if(score>best){ best=score; blocker=o; }
  }
  if(blocker && shoveAside(state, blocker, u.x, u.y)) return;
  // nobody to shove — try slipping past the contested waypoint
  if(u.path && u.pathIdx < u.path.length-1){ u.pathIdx++; return; }
  // last resort: if we're essentially at the destination, just finish the move
  if(u.dest){
    const dd=Math.hypot(u.dest.x-u.x, u.dest.y-u.y);
    if(dd < TILE*1.3){
      u.path=null; u.dest=null;
      if(u.cmd && (u.cmd.type==='move'||u.cmd.type==='amove')){ u.cmd=null; u.state='idle'; }
    }
  }
}
function resolveStuck(state, dt){
  for(const u of state.entities){
    if(u.dead || u.kind!=='unit') continue;
    const moving = (u.path && u.pathIdx<u.path.length) || !!u.dest;
    if(!moving){ u._stuckT=0; u._lastTargD=undefined; continue; }
    const tp=currentTargetPoint(u); if(!tp){ u._stuckT=0; continue; }
    const d=Math.hypot(tp.x-u.x, tp.y-u.y);
    // progress check: did we get meaningfully closer this frame?
    const want=u.speed*TILE*dt*0.3;
    if(u._lastTargD!==undefined && (u._lastTargD - d) < want) u._stuckT=(u._stuckT||0)+dt;
    else u._stuckT=Math.max(0,(u._stuckT||0)-dt*1.5);
    u._lastTargD=d;
    if(u._stuckT > 0.4){ handleStuck(state,u); u._stuckT=0; u._lastTargD=undefined; }
  }
}

function damage(state, t, amt, src){
  if(t.dead) return;
  t.hp-=amt;
  t.hitFx=0.12;
  // retaliate: if target is idle unit, fight back
  if(t.kind==='unit'&&!t.cmd&&!t.autoTarget && src){ t.autoTarget=src; }
}

function killEntity(state,e){
  e.dead=true;
  if(e.kind==='building') markBuilding(state,e,false);
}

