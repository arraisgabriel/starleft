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

  // the bar's confidant NPC (fixed-identity staff, slot 0 of THE LATE SHIFT).
  barNpc: 'np:late_shift:0',
  // venue kind → fixed-identity key for staff slot 0 (read by hubSyncNpcs staff-mint).
  venueStaffFixed: { bar:'bartender' },

  // ---- hand-authored fixed NPC identities (D3). buildNpcDossier short-circuits to these (D2). ----
  fixedNpcs: {
    bartender: {
      first:'Sable', last:'Voss', full:'Sable Voss', gender:'f',
      home:'the first campus', profession:'bartender',
      backstoryText:"Flew a founder-mech two arcs back and outlived the whole unit. Now she pours for whoever's left and keeps their names. She is not your boss; she's the one who's still here.",
      chores:['drying the same glass twice','listening more than she pours'],
    },
  },

  // ---- content pools (APPEND-ONLY — never reorder/delete; see header) ----
  // events[i] = { text } : an off-hours dossier life-event line (slot-filled via d.fill + {npc}); i is the ohCode.
  events: [
    { text:"Sat at the Late Shift and let someone who'd buried three rosters name the dead with {me}." },   // 0
    { text:"Said out loud, to a stranger pouring drinks, what {me} actually wants: {dream}." },             // 1
    { text:"Told {npc} what {me} did before the company — {crime} — for the first time, out loud." },       // 2
    { text:"Became a regular at the Late Shift. The city finally has one place that knows {me} by name." }, // 3
    { text:"Went back to {home} to settle the old thing. {npc} kept the stool." },                          // 4
    { text:"Sat across from {npc} at Marisol's and let the broth go cold instead of leaving." },             // 5
    { text:"Finally told {npc} the thing about {trauma} — said it at a noodle counter, of all places." },    // 6
    { text:"Made peace with {npc} over bad noodles. Family again." },                                        // 7
    { text:"Took the key {npc} slid across the counter. There's a door back in {home} that's {me}'s again." },// 8
  ],
  // say[i] : first-person reaction, index-aligned to events (text-only until the lore-forge voice gate).
  say: [
    "Didn't plan to talk. Didn't hate it.",            // 0
    "Yeah. That's the thing I want. Said it now.",     // 1
    "First time out loud.",                            // 2
    "Place knows my name now.",                        // 3
    "Going home to settle it.",                        // 4
    "Didn't leave. That's something.",                 // 5
    "Said it. At a noodle counter.",                   // 6
    "We're alright. We're family.",                    // 7
    "There's a way home now.",                         // 8
  ],
  // scenes[] : Scene objects. The counterpart OPENS; the bulleted choices are the VETERAN's lines.
  //   req: {venue, kind, minTier, maxTier, gate}  · choice: {approach, gate, line, check, land, miss}
  //   land/miss: {reply, pts?, ev?, npcEv?, fx?, fl?}  (pts default = scenePts × approach weight; ev = ohCode)
  scenes: [
    { id:'bar.first_round', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:0, maxTier:1},
      open:"{npc} slides {me} a knockoff whiskey {me} didn't order. \"On the house. Three rosters I've poured for — you've all got the same look on the way in.\"",
      choices:[
        { approach:'warm', line:"Take the glass. Let her talk.",
          land:{ reply:"{npc} starts naming the dead you have in common. The ice outlasts the small talk, and {me} stays.", ev:0 } },
        { approach:'blunt', line:"Slide it back — \"I'm not here to get read.\"", check:true,
          land:{ reply:"{npc} shrugs and pours anyway, slower. \"Suit yourself. I'll be here.\"" },
          miss:{ reply:"{me} goes quiet and nurses it alone. Nothing said tonight.", pts:0 } },
        { approach:'probing', gate:'dream', line:"Ask if she ever wanted out of this city.",
          land:{ reply:"It turns into {me} saying it instead — {dream} — out loud, for once.", ev:1 } },
      ] },
    { id:'bar.regulars', venue:'bar', kind:'confidant', req:{minTier:0, maxTier:3},
      open:"{npc} nods at {me} like a regular now. \"Usual?\"",
      choices:[
        { approach:'warm', line:"Sit. Trade the week's bad news.",
          land:{ reply:"You trade the kind of small talk that only means anything after a war. {me} leaves lighter.", ev:3 } },
        { approach:'probing', line:"Ask her what keeps her pouring.",
          land:{ reply:"\"Somebody's got to remember the names,\" she says, and tops you off." } },
      ] },
    { id:'bar.the_thing', venue:'bar', kind:'confidant', req:{minTier:2, maxTier:3, gate:'crime'},
      open:"{npc} doesn't look up from the glass she's drying. \"You came in heavier than usual. Say it.\"",
      choices:[
        { approach:'probing', gate:'crime', line:"Finally say what {me} did before the company.",
          land:{ reply:"{npc} doesn't flinch. \"Yeah. I figured it was something like that.\" It's lighter, said.", ev:2, fl:'ARC_UNLOCKED' } },
        { approach:'blunt', line:"Deflect. Talk about the war instead.",
          land:{ reply:"She lets it slide. \"Another night, maybe.\" The glass keeps turning in her hands." } },
      ] },
    { id:'bar.last_call', venue:'bar', kind:'confidant', req:{minTier:4, maxTier:4},
      open:"Last call. {npc} sets two glasses down and charges for neither.",
      choices:[
        { approach:'warm', line:"Tell her about the thing back in {home}.",
          land:{ reply:"{npc} nods, slow. \"Then go settle it. I'll keep your stool.\"", ev:4, fx:{t:'capstone'} } },
      ] },
    // --- MARISOL'S (diner) — veteran ↔ kin NPC (the relative the dossier named; {npc} = their name) ---
    { id:'diner.doorway', venue:'diner', kind:'kin', req:{minTier:0, maxTier:1},
      open:"{npc} is already in the back booth, both hands around a bowl of broth going cold. \"So you finally showed.\"",
      choices:[
        { approach:'warm', line:"Sit. Say {npc}'s name before anything else.",
          land:{ reply:"The broth goes colder while you talk. Nobody walks out. It's a start.", ev:5 } },
        { approach:'probing', gate:'trauma', line:"Finally say the thing about {trauma}.",
          land:{ reply:"It lands hard and quiet. {npc} reaches across the table instead of leaving.", ev:6, fl:'ARC_UNLOCKED' } },
        { approach:'blunt', line:"Stay in the doorway, arms crossed.",
          land:{ reply:"{npc} waits, then gathers a coat. \"Another time, then.\" Recoverable — just not tonight.", pts:0 } },
      ] },
    { id:'diner.mending', venue:'diner', kind:'kin', req:{minTier:2, maxTier:3},
      open:"{npc} saved you the stool by the window. The broth's already ordered.",
      choices:[
        { approach:'warm', line:"Talk like family, not like a debrief.",
          land:{ reply:"For a few minutes it's just two people and a bad noodle place. {me} leaves lighter than {me} came.", ev:7, fx:{t:'relief'} } },
      ] },
    { id:'diner.peace', venue:'diner', kind:'kin', req:{minTier:4, maxTier:4},
      open:"Last bowl. {npc} slides a key across the counter. \"Place back home's still yours, if you ever want it.\"",
      choices:[
        { approach:'warm', line:"Take the key. Mean it.",
          land:{ reply:"Family again. Whatever the war does next, it can't unmake this one.", ev:8, fx:{t:'capstone'} } },
      ] },
  ],
  // gossip[] = ambient world-bubble lines — Phase 3 (G3).
  gossip: [],
  // gifts[]  = luxury gift items + dossier-derived affinities — Phase 4 (I3).
  gifts: [],
  // npcEvents[i] : NPC-perspective off-hours line, SAME ohCode index as events[] (sparse). Stored as 4000+i in rec.ev.
  npcEvents: [ null, null, null, null, null,
    "{vet} came by Marisol's and didn't bolt for once.",                  // 5
    "{vet} finally said the thing. Hard to hear — glad they said it.",    // 6
    "Made peace with {vet} over bad noodles. We're alright now.",         // 7
    "Slid {vet} the key. There's a door back home that's theirs again.",  // 8
  ],
  // bark[] : "unburdened" selection barks for a veteran whose confidant/kin arc is done (fl&8). Text-only.
  bark: [
    "Settled some things. Lighter now.",
    "Somebody back home knows my name again.",
    "Said the thing out loud. Sky didn't fall.",
  ],
};

if (typeof window !== 'undefined') window.OFFHOURS = OFFHOURS;
