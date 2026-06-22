/* cyberware_data.js — static, APPEND-ONLY catalog + tuning for the Implant Clinic (cyberware).
   The data layer (slots + implants + iconics + version table + tuning); the runtime lives in
   js/hub.js (hubApplyChrome, capacity helpers) and js/ui.js (the Implant Clinic panel).
   Loaded after config.js (needs nothing at load time — pure literal), BEFORE hub.js (see rts.html).
   Design & citations: docs/cyberware-research.md (Part II mapping, App. A catalog, App. B tuning).

   APPEND-ONLY CONTRACT (mirrors lore_data.js / offhours_data.js):
   - `implants`, `slots`, `iconics` grow ONLY by appending; NEVER reorder or delete. Saved chrome
     references an implant by its string `id` (in CAMPAIGN.upgrades[key].chrome[slot].id), NOT by
     index, so the catalog can grow without breaking old saves. Unknown ids are skipped at apply.
   - `versions[]` freezes catalog shape per release. Empty = "use full current lengths" (dev default).
     When a future RELEASE grows a pool, append a versions row.

   EFFECT MODEL: each implant's `fx` holds its TIER-3 reference magnitudes. cyberEffect({id,tier})
   scales NUMERIC axes by (tier/3) → T1≈⅓, T3=ref, T5≈1.67× (so titanium_bones hp 0.18@T3 → 0.06@T1,
   0.30@T5, matching App. B). Boolean axes (pierce/revive) are on/off; `active` is a pass-through
   descriptor consumed by the OS-active system; `vsBuilding` is a flat anti-structure multiplier. */

const CYBERWARE = {
  // ---- content-version table (empty during development → full-length catalog) ----
  versions: [],

  // ---- tuning (canonical doc: docs/cyberware-research.md App. B) ----
  tune: {
    minStars: 3,            // lore gate: junior units can't handle body modifications (career Level 3+)
    capBase: 6,             // chromeCapacity(u) = capBase + capPerStar*stars (+ heroCapBonus)
    capPerStar: 1,          //   → L3≈9, L15≈21, L30≈36 (mirrors CP2077's level-driven growth in shape)
    heroCapBonus: 4,        // heroes run more chrome (the "Technical Ability" analogue)
    rebornCapMul: 1,        // OWNER DECISION: reborn keep FULL capacity ...
    rebornOverloadMul: 1.6, //   ... but pay a STEEPER overload sanity cost per point over
    overloadMax: 6,         // max capacity points a unit may exceed the ceiling by (Edgerunner +50 analogue)
    overloadSanityPerPt: 0.04,  // each point over permanently lowers the sanity threshold by 4% of base
    strainFloor: 0.55,      // chromeStrainMul never drops below this (a unit can't be made unplayable)
    overloadAppearIdx: 11,  // OWNER DECISION: overload tech unlocks at campaign progress >= this idx
    // per-tier costs (parallels HUB.implantCosts shape); index = tier-1
    capCost: [2, 3, 5, 7, 9],
    m3Cost: [150, 300, 550, 900, 1400],
    oneOfCapMul: 1.5,       // OS/Arms "core" implants cost ~1.5x capacity (heavier CP2077 OS pieces)
    // stars -> highest purchasable tier (mirrors CP2077's Level -> tier-stock ladder); count of
    // thresholds <= u.stars = the cap. tier1 at L3, then L8/L14/L20/L26.
    tierStars: [3, 8, 14, 20, 26],
    refundMul: 0.5,         // M3$ refunded when an implant is removed
  },

  // ---- slots (Medium model; CP2077 systems folded to fit an RTS unit) ----
  // tiles = how many of this slot a unit has; exclusive = one-implant-only (replace on install);
  // locked = present-but-disabled (matches CP2077 slot density, signals the later expansion).
  slots: [
    { id: 'optics', name: 'OPTICS',           glyph: '👁️', tiles: 2, exclusive: false, locked: false, side: 'left',  suits: ['sniper', 'soldier'] },
    { id: 'circ',   name: 'CIRCULATORY',      glyph: '❤️', tiles: 2, exclusive: false, locked: false, side: 'left',  suits: ['medic', 'soldier'] },
    { id: 'frame',  name: 'FRAME',            glyph: '🦴', tiles: 2, exclusive: false, locked: false, side: 'left',  suits: ['tank', 'mech'] },
    { id: 'os',     name: 'CORE SYSTEM',      glyph: '⚡', tiles: 1, exclusive: true,  locked: false, side: 'right', suits: ['soldier', 'sniper'] },
    { id: 'arms',   name: 'ARMS',             glyph: '🦾', tiles: 1, exclusive: true,  locked: false, side: 'right', suits: ['tank', 'soldier'] },
    { id: 'legs',   name: 'LEGS',             glyph: '🦵', tiles: 1, exclusive: true,  locked: true,  side: 'right', suits: [] },
  ],

  // ---- implants (App. A; fx authored at the TIER-3 reference) ----
  // NAMES ARE ORIGINAL STARLEFT chrome — NOT the CP2077 trademarks the design doc referenced. The `id`s
  // are save keys (append-only) and must never change; only the player-facing `name`/`flavor` are ours.
  // The corporate-dystopia tone is deliberate: severance, cutbacks, redaction, platitudes — chrome sold
  // by the same machine that strip-mines the people wearing it.
  implants: [
    // FRAME — armor & max HP
    { id: 'titanium_bones',  slot: 'frame',  name: 'Rebar Lattice',     glyph: '🦴', flavor: 'Construction-grade rebar fused to the bones. Soaks hits that would fold a stock frame.', fx: { hp: 0.18 } },
    { id: 'subdermal_armor', slot: 'frame',  name: 'Riot Weave',        glyph: '🛡️', flavor: 'Crowd-control weave layered under the skin. Small-arms skip right off it.',              fx: { armor: 0.15 } },
    { id: 'pain_editor',     slot: 'frame',  name: 'Nerve Redactor',    glyph: '💊', flavor: 'Redacts the agony — and the warning with it. Tougher, but the body forgets to mend.',     fx: { armor: 0.10, regen: -0.40 } },
    // CIRC — regen, revive, madosis resist
    { id: 'second_heart',    slot: 'circ',   name: 'Failover Pump',     glyph: '❤️', flavor: 'A redundant heart that fails over the instant the first flatlines. One restart per drop.',  fx: { revive: true } },
    { id: 'blood_pump',      slot: 'circ',   name: 'Clotworks',         glyph: '🩸', flavor: 'A pressurized clotting plant in the chest. Wounds seal faster between firefights.',          fx: { regen: 0.60 } },
    { id: 'cataresist',      slot: 'circ',   name: 'Bromide Filter',    glyph: '🧪', flavor: 'Drip-feeds a chemical platitude that scrubs chrome-stress hormones — the mind frays slower.', fx: { madResist: 0.25 } },
    // OS — one "core power" active/triggered buff — exclusive
    { id: 'sandevistan',     slot: 'os',     name: 'Redline Driver',    glyph: '⏱️', flavor: 'Redlines the nervous system. For a few seconds the world crawls and you do not.',            fx: { active: { kind: 'redline',  dmgMul: 0.35, dur: 6,  cd: 30 } } },
    { id: 'berserk',         slot: 'os',     name: 'Severance Protocol', glyph: '💢', flavor: 'Files everyone in reach for termination. Hit harder, shrug off more — but the guns lock out.', fx: { active: { kind: 'severance', dmgMul: 0.40, dmgResist: 0.30, dur: 12, cd: 35, locksRanged: true } } },
    { id: 'kerenzikov',      slot: 'os',     name: 'Reflex Arc',        glyph: '⚡', flavor: 'Reflex wire spliced to the spine. A taken hit snaps you into a brief killing spike.',         fx: { active: { kind: 'reflexarc', trigger: 'hit', dmgMul: 0.25, dur: 2, cd: 8 } } },
    // ARMS — weapon-arm damage shape — exclusive
    { id: 'gorilla_arms',    slot: 'arms',   name: 'Pile Drivers',      glyph: '🦾', flavor: 'Hydraulic demolition fists. Wreck infantry and tear straight through structures.',           fx: { dmg: 0.40, vsBuilding: 0.50 } },
    { id: 'mantis_blades',   slot: 'arms',   name: 'Cutbacks',          glyph: '🗡️', flavor: 'Monomolecular wrist blades. They find the gap in any armor. Nothing personnel.',            fx: { dmg: 0.20, pierce: true } },
    { id: 'pls',             slot: 'arms',   name: 'Payload Arm',       glyph: '🚀', flavor: 'Arm-mounted launcher. Every round bursts on impact.',                                       fx: { splash: 14, splashR: 1.3 } },
    // OPTICS — sight, range, dmg/crit
    { id: 'kiroshi_optics',  slot: 'optics', name: 'Foresight Optics',  glyph: '👁️', flavor: 'Predictive targeting optics. See further, reach further, aim truer.',                       fx: { sight: 0.25, range: 0.15, dmg: 0.10 } },
  ],

  // ---- iconics (hero-bound, story/quest-granted, NOT buyable; P5) — resolved by cyberImplant via id;
  //      `hero` is the heroId (MAPS hero h.id||h.name). Granted on recruit (hubGrantIconics), tier 5,
  //      capacity-efficient (capCostMul 0.8 — legendary engineering), and permanent (iconic flag). ----
  iconics: [
    { id:'nino_founders_edge', slot:'os',     hero:'Nino', name:"Founder's Edge",  glyph:'✦', capCostMul:0.8,
      flavor:"Nino's bespoke reflex driver — he was always a step ahead; now the chrome makes it literal.",
      fx:{ active:{ kind:'redline', dmgMul:0.5, dur:7, cd:22 } } },
    { id:'biba_motherboard',   slot:'circ',   hero:'Biba', name:'Motherboard',      glyph:'✚', capCostMul:0.8,
      flavor:"Biba keeps everyone alive — including herself. A backup heart, fast clotting, and a mind that won't fray.",
      fx:{ revive:true, regen:0.8, madResist:0.3 } },
    { id:'rust_foundry_fists', slot:'arms',   hero:'Rust', name:'Foundry Fists',    glyph:'⚒', capCostMul:0.8,
      flavor:"Pedro built foreclosure-mechs on a union floor. Now those hands are his — and they remember every wall.",
      fx:{ dmg:0.5, vsBuilding:0.7, pierce:true } },
    { id:'zeca_greenhorn',     slot:'os',     hero:'Zeca', name:'Greenhorn Reflex',  glyph:'✸', capCostMul:0.8,
      flavor:"A&O wired the intern cheap and fast. The scared kid's nerves fire before he can think — and that keeps him breathing.",
      fx:{ active:{ kind:'reflexarc', trigger:'hit', dmgMul:0.4, dur:3, cd:6 } } },
  ],
};

// OS/Arms "core" implants cost ~1.5x capacity — derive capCostMul from the slot's exclusivity so the
// catalog stays declarative (no per-implant duplication of the rule).
(function _cyberDeriveCostMuls(){
  const ex = {};
  for(const s of CYBERWARE.slots) ex[s.id] = !!s.exclusive;
  for(const imp of CYBERWARE.implants) if(ex[imp.slot]) imp.capCostMul = CYBERWARE.tune.oneOfCapMul;
})();
