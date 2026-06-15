/* achievements.js — startup-satire achievements hooked to STARLEFT's OWN systems (T3-5):
   madosis, dossiers/dreams, the memorial, heroes, the flash, The Wake, the new win verbs.
   Event-driven: hooks call ACH.fire(event, ctx) (1 line per site); each entry's test() is 1–3
   lines on that event's ctx. Unlocked set persists in localStorage — fully orthogonal to saves.
   Surfaced as a strip in the Roster overlay (achievementsHTML ← lore.js rosterHTML). */

const ACH = (function(){
  const KEY = 'starleft_achievements';
  let unlocked = {};
  try { unlocked = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){}
  const save = ()=>{ try { localStorage.setItem(KEY, JSON.stringify(unlocked)); } catch(e){} };

  const LIST = [
    // ---- firsts & the grind ----
    { id:'mvv',        ev:'victory',  icon:'🚀', name:'Minimum Viable Victory',  desc:'Win Quarter I.',                              test:c=>c.idx===0 },
    { id:'first-promo',ev:'promote',  icon:'★',  name:'Now With Trauma',         desc:'Promote your first veteran to Level 2.',      test:c=>c.stars>=2 },
    { id:'wit',        ev:'promote',  icon:'😵', name:'Whatever It Takes',       desc:'Push one veteran to Level 20.',               test:c=>c.stars>=20 },
    { id:'first-loss', ev:'fallen',   icon:'🕯', name:'Cost of Doing Business',  desc:'Lose your first named veteran.',              test:c=>c.count>=1 },
    { id:'the-wall',   ev:'fallen',   icon:'🧱', name:'The Wall Grows',          desc:'Ten names on the memorial in one campaign.',  test:c=>c.count>=10 },
    { id:'vested',     ev:'dream',    icon:'🏆', name:'Equity Vested',           desc:'A veteran fulfills their dream.' },
    { id:'portfolio',  ev:'dream',    icon:'💼', name:'Dream Portfolio',         desc:'Five dreams fulfilled across your career.',   test:()=>{ try{ return (ledgerLoad().stats.dreamsFulfilled||0)+1>=5; }catch(e){ return false; } } },
    // ---- madosis ----
    { id:'pet-project',ev:'rescue',   icon:'🐕', name:'Pet Project',             desc:'Talk a mad dog back from the edge.' },
    { id:'severance',  ev:'putdown',  icon:'📋', name:'Severance Package',       desc:'Put a feral veteran down yourself.' },
    // ---- the flash & Arc 2 ----
    { id:'down-round', ev:'flash',    icon:'☢️', name:'Down Round',              desc:'Keep founding after the flash takes everyone.' },
    { id:'architect',  ev:'architect',icon:'🧠', name:'The Architect',           desc:'Break BIBA out of the open-plan prison.' },
    { id:'ghost-equity',ev:'reborn',  icon:'⚡', name:'Ghost Equity',            desc:'Bring one of the fallen back through The Wake.' },
    // ---- bosses & the new verbs ----
    { id:'knife-net',  ev:'victory',  icon:'🥷', name:'Knife the Network',       desc:'Put down THE SEVERANCIER.',                   test:c=>c.villainId==='cyan_ninja' },
    { id:'unrecovered',ev:'victory',  icon:'🟢', name:'Asset Unrecovered',       desc:'Put down THE A&O ENFORCER.',                  test:c=>c.villainId==='ao_enforcer' },
    { id:'evicted',    ev:'victory',  icon:'🏚', name:'Evicted',                 desc:'Scrap THE DARK TOWER GUARDIAN.',              test:c=>c.villainId==='tower_guardian' },
    { id:'foreclosed', ev:'victory',  icon:'🦖', name:'Foreclosure Foreclosed',  desc:'Destroy REX and end the war.',                test:c=>!!c.finale },
    { id:'land-grab',  ev:'victory',  icon:'📡', name:'Possession, Nine Tenths', desc:'Win a reach-and-hold claim.',                 test:c=>c.wc==='reachAndHold' },
    { id:'clause',     ev:'victory',  icon:'🚪', name:'Extraction Clause',       desc:'Walk a VIP out alive (escort win).',          test:c=>c.wc==='escort' },
    { id:'bridge',     ev:'victory',  icon:'⏳', name:'Bridge Round Closed',     desc:'Survive an injunction (survive win).',        test:c=>c.wc==='survive' },
    // ---- combat flavor ----
    { id:'mass-rif',   ev:'rif',      icon:'📉', name:'Mass RIF',                desc:'Eliminate 6+ headcount in one swing.',        test:c=>c.n>=6 },
    { id:'siege-cpa',  ev:'siege',    icon:'📐', name:'Spreadsheet Artillery',   desc:'Deploy an Auditor into siege mode.' },
    { id:'acquihired', ev:'hq-raze',  icon:'🏢', name:'Acquihired',              desc:'Raze a rival HQ.' },
    // ---- meta ----
    { id:'ipo',        ev:'ipo',      icon:'🦄', name:'Exit Achieved',           desc:'Reach the IPO.' },
    { id:'serial',     ev:'ngplus',   icon:'♻️', name:'Serial Founder',          desc:'Take the money and disrupt again (NG+).' },
    { id:'daily',      ev:'daily',    icon:'📅', name:'Daily Disruption',        desc:'Clear a Daily Disruption skirmish.' },
  ];

  function fire(ev, ctx){
    let any=false;
    for(const a of LIST){
      if(a.ev!==ev || unlocked[a.id]) continue;
      let ok=false;
      try { ok = !a.test || !!a.test(ctx||{}); } catch(e){ ok=false; }
      if(!ok) continue;
      unlocked[a.id]={ t:Date.now() }; any=true;
      if(!window._rbReplaying){
        if(typeof eventToast==='function') eventToast(`🏆 <b>${a.icon} ${a.name}</b> — ${a.desc}`, 9000);
        else if(typeof toast==='function') toast('🏆 '+a.name, 6000);
        // the world's ticker reacts to story milestones (story-polish §8.4); silent if the id is unmapped
        if(typeof LNS!=='undefined' && LNS.ultraEvent) LNS.ultraEvent('achievement', { id:a.id });
      }
    }
    if(any) save();
  }

  function html(){
    const n=Object.keys(unlocked).length;
    let h=`<div class="ach"><h3>🏆 Achievements (${n}/${LIST.length})</h3><div class="ach-grid">`;
    for(const a of LIST){
      const got=!!unlocked[a.id];
      h+=`<div class="ach-card${got?' got':''}" title="${a.desc}"><span class="ach-ic">${got?a.icon:'🔒'}</span><b>${got?a.name:'———'}</b><span class="ach-desc">${got?a.desc:'keep disrupting'}</span></div>`;
    }
    h+=`</div></div>`;
    return h;
  }

  return { fire, html, isUnlocked:(id)=>!!unlocked[id], count:()=>Object.keys(unlocked).length, total:()=>LIST.length };
})();
function achievementsHTML(){ return (typeof ACH!=='undefined') ? ACH.html() : ''; }
