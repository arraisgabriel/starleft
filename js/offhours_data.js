/* offhours_data.js — static, APPEND-ONLY content + tuning for The Off-Hours HUB district.
   The data layer (pools + version table + tuning constants); the runtime lives in js/offhours.js.
   Loaded after npc_lore_data.js / lore.js / npc_lore.js, before ui.js (see rts.html). No deps at
   load time — pure literal. Numbers are explained & cited in docs/hub-offhours-tuning.md.

   APPEND-ONLY CONTRACT (mirrors lore_data.js / npc_lore_data.js):
   - `events`, `say`, `scenes`, `gossip`, `gifts` grow ONLY by appending. NEVER reorder or delete —
     `say` is index-aligned to event/scene lines so a future (separately-gated) voice pass stays
     index-keyed, and saved bonds reference scene indices via their `seen[]` log.
   - `versions[]` freezes a bond's pool shape at mint (clone of LORE_DATA.versions). An empty table
     means "use full current lengths" — identical to the pre-versioning lore behavior. When a future
     RELEASE grows a pool, append a versions row so already-minted bonds keep their shape. */

const OFFHOURS = {
  // ---- content-version table (empty during this feature's development → full-length picks) ----
  versions: [],

  // ---- tuning (canonical doc: docs/hub-offhours-tuning.md) ----
  tune: {
    maxTier: 4,
    tierPts: [0, 100, 250, 450, 700],   // cumulative points to REACH tier i  (Stardew/Persona)
    scenePts: 30,                        // base scene-choice points; ×{1,2,3} by approach weight (Persona notes)
    giftPts: 60,                         // a gift opens 0→1 and returns a keepsake (Hades first-nectar)
    ambientPts: 8,                       // a caught/ambient moment (free — no downtime budget)
    helloPts: 4,                         // a passing hello
    lockedTier: 3,                       // Hades locked-heart: can't pass this tier until the arc 'favor' (fl&4)
    nightsPerVisit: 3, nightsCap: 5,     // downtime budget per hub visit (Persona calendar)
    sceneCost: 40, giftCost: 120,        // M3$ sinks via hubSpend
    strainMax: 6,                        // CK3: act-against-nature adds ≤6 true madosis (well below threshold)
    // light check: p = clamp(checkBase + checkPerTier*tier + approachBias, checkMin, checkMax)
    checkBase: 0.45, checkPerTier: 0.13, checkMin: 0.20, checkMax: 0.95,
    // approach: [pointWeight ×{1,2,3}, checkBias]
    approach: { warm:[1, 0.10], probing:[2, 0.0], blunt:[1, -0.12] },
    // compatibility weights (vet↔vet) — RimWorld/Wildermyth
    compat: { home:0.30, dream:0.25, trauma:-0.30, crime:-0.35, type:0.12, friendT:0.33, rivalT:-0.20 },
    cohesion: { l1:10, l2:15, l3:20 },   // per-level increments to bond up (XCOM cohesion ladder)
  },

  // ---- bond kinds: index = BondRecord.k ----
  kinds: ['kin', 'friend', 'rival', 'romance', 'mentor', 'confidant'],

  // ---- per-kind tier display names (index = tier 0..4) ----
  tierNames: {
    kin:       ['estranged', 'reaching out', 'thawing', 'mended', 'family again'],
    friend:    ['acquaintance', 'familiar', 'tight', 'close', 'inseparable'],
    rival:     ['friction', 'needling', 'feud', 'bitter', 'nemesis'],
    romance:   ['—', 'a spark', 'drawn', 'together', 'devoted'],
    mentor:    ['assigned', 'warming', 'trusted', 'close', 'bonded'],
    confidant: ['a stranger at the bar', 'a face they nod to', 'a regular', 'talks freely', 'tells them everything'],
  },

  // ---- content pools (APPEND-ONLY; filled in Phase 1+) ----
  // events[i] = { text } : an off-hours dossier life-event line (slot-filled via d.fill); i is the ohCode.
  events: [],
  // say[i]   = first-person reaction line, index-aligned to events (text-only until the lore-forge gate).
  say: [],
  // scenes[] = Scene objects (venue, kind, with, req, open, choices[], outcome) — Phase 1 (E1).
  scenes: [],
  // gossip[] = ambient world-bubble lines — Phase 3 (G3).
  gossip: [],
  // gifts[]  = luxury gift items + dossier-derived affinities — Phase 4 (I3).
  gifts: [],
};

if (typeof window !== 'undefined') window.OFFHOURS = OFFHOURS;
