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
    compat: { home:0.30, dream:0.25, trauma:-0.30, crime:-0.35, type:0.12, friendT:0.33, rivalT:-0.20, romanceT:0.45, mentorGap:3 },
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

  // ---- INTERIOR room layouts (Sims-like view, js/offhours_interior.js). Virtual room space 960×560.
  // Canvas-drawn for now (the single swap point for a future Gemini background). Coords are virtual units. ----
  interiors: {
    bar: {
      name:'THE LATE SHIFT', accent:'#ffce6a', floorA:'#14181f', floorB:'#1b2129', wall:'#0c0f15',
      counter:{ x:140, y:108, w:680, h:58 },      // the long bar (bartender works behind it)
      shelf:{ x:160, y:52, w:640, h:42 },          // bottle shelf on the back wall
      bartender:{ x:480, y:138 },                  // fixed bartender position behind the counter
      sign:'THE LATE SHIFT',
      stools:[ {x:240,y:236},{x:360,y:236},{x:480,y:236},{x:600,y:236},{x:720,y:236} ],
      tables:[ {x:300,y:440,r:52},{x:690,y:440,r:52} ],
      seats:[ {x:240,y:236},{x:360,y:236},{x:480,y:236},{x:600,y:236},{x:720,y:236},
              {x:244,y:452},{x:356,y:452},{x:634,y:452},{x:746,y:452} ],
      door:{ x:70, y:498 },                          // called-in vets enter here
      wander:[ {x:320,y:350},{x:560,y:360},{x:470,y:320},{x:660,y:345},{x:200,y:380} ],
    },
    // MARISOL'S — warm amber neon through grime; each vet sits at a booth across from their kin.
    diner: {
      name:"MARISOL'S", accent:'#e8923c', accent2:'#ff6a4d', floorA:'#191310', floorB:'#221a14', wall:'#0d0a07',
      counter:{ x:332, y:116, w:296, h:46 }, counterTop:'#3a2a1a', counterBot:'#241710',   // service counter + pie-case
      sign:"MARISOL'S",
      booths:[ {x:150,y:240,w:98,h:50}, {x:150,y:402,w:98,h:50}, {x:712,y:240,w:98,h:50}, {x:712,y:402,w:98,h:50} ],
      seats:[ {x:199,y:216},{x:199,y:314},{x:199,y:378},{x:199,y:476},{x:761,y:216},{x:761,y:314},{x:761,y:378},{x:761,y:476} ],
      door:{ x:70, y:500 },
      wander:[ {x:430,y:300},{x:520,y:380},{x:400,y:430},{x:560,y:300} ],
    },
    // STATIC — electric magenta + cyan; a pulsing dance floor is the showpiece, vets bond vet↔vet.
    club: {
      name:'STATIC', accent:'#cf6bff', accent2:'#3df0ff', floorA:'#0e0a14', floorB:'#150e1d', wall:'#070509', neonWalls:true,
      dancefloor:{ x:330, y:248, w:300, h:212 },
      djbooth:{ x:410, y:104, w:140, h:40 },
      bar:{ x:96, y:126, w:208, h:44 },
      hightops:[ {x:782,y:248,r:30},{x:822,y:404,r:30},{x:726,y:454,r:30} ],
      sign:'STATIC',
      crowd:[ {x:392,y:300},{x:470,y:340},{x:560,y:306},{x:420,y:404},{x:530,y:418},{x:486,y:362} ],
      seats:[ {x:782,y:248},{x:822,y:404},{x:726,y:454} ],
      door:{ x:70, y:500 },
      wander:[ {x:230,y:404},{x:690,y:300},{x:300,y:484},{x:664,y:474},{x:170,y:300} ],
    },
  },

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
    { text:"Found something like a brother in {them} — over bad music and worse drinks at Static." },         // 9
    { text:"Made an enemy of {them} the honest way: face to face, over the thing neither would drop." },      // 10
    { text:"Found, in {them}, the one warm thing this city hadn't taken yet." },                              // 11
    { text:"Took the drink {me} hadn't ordered at the Late Shift and traded the week's dead with {npc} — names, never numbers — till the ice in the glass was gone." },   // 12
    { text:"Asked {npc} if she ever wanted out, and somehow it was {me} who answered — said what {me} wants: {dream}, across the rail to a stranger." },   // 13
    { text:"Came off {lastmap} too heavy and set part of it down at the Late Shift — {npc} remembered {fallen} too, so {me} carried out a little less." },   // 14
    { text:"Told {npc} what {me} did before the company — {crime} — and she didn't flinch, just said she'd figured it was always something that shape." },   // 15
    { text:"Sat where {npc} could read {me} and gave her the names instead — the dead {me} carries traded for hers — until the corners stopped mattering." },   // 16
    { text:"Learned the Late Shift's one rule — nobody finishes a war in here — and took the gap at the dark end of the rail until it was {me}'s by habit." },   // 17
    { text:"Asked {npc} about flying again; she'd buried a founder-mech and traded the sky for a rag and a glass, on purpose. Found out {me} was just whoever the same war left." },   // 18
    { text:"Told {npc} {me} was done drinking with strangers and got told {me} stopped being one four visits back — then just kept showing up." },   // 19
    { text:"Said it straight to {npc} — the thing {me} actually wants: {dream} — and out loud, for the first time, it didn't sound stupid." },   // 20
    { text:"Told {npc} who {fallen} actually was — the person, not the soldier — and she didn't fill the gaps with comfort, just kept them, the way she keeps all of them." },   // 21
    { text:"Finally said the thing about {trauma} to {npc}, who wouldn't lie that it gets better — she stayed all the way through and poured one for each, so it stopped being only {me}'s." },   // 22
    { text:"Took the name {npc} wrote on a coaster — someone back in {home} who still owes the dead a favor — and left to settle the one thing there that's still alive." },   // 23
    { text:"Ate the cold broth {npc} had ordered without asking — the apology neither of them could say out loud." },   // 24
    { text:"Handed {npc} one small survivable truth about the war, and watched them keep it like it was worth more." },   // 25
    { text:"Said the dead were gone — flat, no comfort in it — but said it at {npc}'s counter, where it landed on someone." },   // 26
    { text:"Gave {npc} the part of {fallen} that wasn't a soldier — the laugh, the bad habit — so two people carry the name now." },   // 27
    { text:"Named one old wound at {npc}'s counter and owned their half of it — no ceremony, one thing off the list." },   // 28
    { text:"Let {npc} talk around the creased photo — who was alive, what {home} smelled like — and sat in a life that was good once." },   // 29
    { text:"Left the creased photo with {npc} to keep somewhere they'd see it — so one of them still remembers who {me} was." },   // 30
    { text:"Gave {npc} the edges of the unsaid thing, not the center — and got told to bring the rest when {me} could carry it." },   // 31
    { text:"Said the thing about {trauma} all the way through, and {npc} reached across the cold bowls and took {me}'s hand." },   // 32
    { text:"Left {npc}'s battered handset on the formica, but quit pretending the line to {home} wasn't there." },   // 33
    { text:"Picked up {npc}'s handset and let someone back in {home} hear {me} was still breathing." },   // 34
    { text:"Caught the key {npc} slid down the counter — a door back in {home} that isn't a barracks, that the war can't reach." },   // 35
    { text:"Drank with someone who crawled off the same ridge as {me}, different years — no shared roster, just the same dirt under both their nails." },   // 36
    { text:"Asked {them} at Static what they'd do if the noise ever quit, and got back {me}'s own answer: go find a louder room." },   // 37
    { text:"Traded the cheapest good night from before the war with {them} — two leftovers, comparing the scraps it didn't get to." },   // 38
    { text:"Pointed out the bar-fight lie of a scar, then the real one, and watched {them} do the same — done explaining to anyone but each other." },   // 39
    { text:"Finished, at Static, the war story {me} never finishes — {them} didn't fix it or flinch, just logged the debt." },   // 40
    { text:"Guarded the question of whose call killed {fallen} alongside {them}, so neither carried it alone, and raised a glass at the full one without a word." },   // 41
    { text:"Told {them} the thing about {fallen} that sounds like a lie to anyone who wasn't there — {them} was there. {fallen} was real in that booth." },   // 42
    { text:"Told {them} {me}'d have made the same bad call and carried it the same — and the call picked up a second name in the dark of the booth." },   // 43
    { text:"Made {them} run the no-trade math out loud till it landed nowhere clean, then refused to leave {them} alone with the result." },   // 44
    { text:"Sat through the long quiet while {them} found the first inch back up from the one they couldn't reach. Not forgiveness — standing." },   // 45
    { text:"Handed {them} the name {me} couldn't reach in time — ghost for ghost — so neither was the only one at the table holding a short list." },   // 46
    { text:"Said it plain to {them}: the last good thing this burned-down city hadn't taken yet — and learned it ran both ways." },   // 47
    { text:"Told {them} that whatever the city does next, {me} wants {them} on the wrong end of it alongside — and got the real grin the war took." },   // 48
    { text:"Swore it over last call and got it answered the only way {them} answers — {me}'s glass held against {me}'s hand a beat too long." },   // 49
    { text:"Heard {them} admit they'd figured on burning out alone, till {me} turned up facing the same door — the one survivor that made the wreckage livable." },   // 50
    { text:"Held the stool against {them} till they called it stubborn — and neither one slid off. Respect, the only way {them} gives it." },   // 51
    { text:"Told {them} straight {me} doesn't like them and won't fake it — and got poured a drink next to that anyway." },   // 52
    { text:"Sat across from {them} and named the trade out loud: A&O sells the dead, and the two of you laid every brick." },   // 53
    { text:"Swore to {them} {me} would hold their flank — the last good thing {me} had left to give, and they took it." },   // 54
    { text:"Handed {them} the worst of it before anyone {me} actually likes — because {them}'s the one who'd never flatter {me} about it." },   // 55
    { text:"The war took the unit, the company, {home} — everyone easy to love. Never got its hands on {them}." },   // 56
    { text:"Closed the gap with {them} at Static, one stool at a time, and never put a word to why." },   // 57
    { text:"Asked who {them} was holding the door open for, and the answer, low, was {me}." },   // 58
    { text:"Traded the edges of the war with {them} past last call, the parts that aren't anybody's medal." },   // 59
    { text:"Laid out what {me} carries — {trauma} — to drive {them} off, and {them} didn't flinch and didn't reach to fix it." },   // 60
    { text:"Stood shoulder to shoulder with {them} by the fire door at Static, close enough the cold quit mattering." },   // 61
    { text:"Called {them} the one thing the city hadn't put a price on, and agreed to keep it quiet so it stayed that way." },   // 62
    { text:"Turned down the walk home with {them} on the last song, and regretted it before the door even shut." },   // 63
    { text:"Took the long way out of Static with {them}, looped the wet block twice rather than let the night end." },   // 64
    { text:"Sat in the stool {them} had been guarding for {me}, and let two degrees of lean carry the whole of it." },   // 65
    { text:"Reached across the sticky table and {them} met {me} halfway — the one thing the war never got to cash in." },   // 66
    { text:"Watched a dead-voiced merc hum past at Static and told {them} the odds were worth it — {them} had decided long before." },   // 67
    { text:"Said the whole of it under the dying neon, and {them} answered by pressing a forehead to {me}'s and not letting go." },   // 68
    { text:"Took the next stool over from the new one and taught {them} the only trick that keeps a green vet old: pick one reason to walk back." },   // 69
    { text:"Taught {them} to sit with the door in sight — passed the first rule of staying alive across a sticky table at Static." },   // 70
    { text:"Sat with {them} through their first one lost and handed down the only mercy on the menu: keep the name, carry the weight." },   // 71
    { text:"Told {them} the thing nobody told {me}: being good at the job is the company spending you. Said keep your own books." },   // 72
    { text:"Told {them}, grown now, the thing {me} stopped softening years ago: we won by becoming the enemy, and {me} built them for it too." },   // 73
    { text:"Watched {them} cross the floor to a scared new face and hand down {me}'s exact words. The list is in steadier hands now." },   // 74
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
    "Bad music, good company.",                        // 9
    "Some people you respect by fighting them.",       // 10
    "Didn't expect to find that here.",                // 11
    "Names, not numbers. Ice went.",   // 12
    "Asked her. Ended up answering.",   // 13
    "She remembered them. Walked lighter.",   // 14
    "Weighed a few grams less, said.",   // 15
    "Gave her the names. Corners quit.",   // 16
    "Left the war at the door.",   // 17
    "She gave up the sky on purpose.",   // 18
    "Stopped being a stranger. Kept coming.",   // 19
    "Said it plain. Didn't sound stupid.",   // 20
    "The person. She kept them.",   // 21
    "Not only mine now. The mercy.",   // 22
    "Got a coaster. Going to settle it.",   // 23
    "Ate it cold. That was the sorry.",   // 24
    "Gave them one true thing. Just one.",   // 25
    "They're gone. Somebody heard me.",   // 26
    "Now someone else carries the name.",   // 27
    "Owned my half. One off the list.",   // 28
    "Sat in the good part. Let it stand.",   // 29
    "Keep it. So somebody remembers.",   // 30
    "Gave the edges. Kept the center.",   // 31
    "Said all of it. They held on.",   // 32
    "Didn't call. Stopped hiding the line.",   // 33
    "Called home. Let them hear me.",   // 34
    "Caught the key. A door that's mine.",   // 35
    "Same ground. Different year. Close enough.",   // 36
    "Neither of us trusts the quiet.",   // 37
    "Compared scraps. Wasn't nothing.",   // 38
    "Quit explaining. Except to {them}.",   // 39
    "Finished it. Just a nod, logged.",   // 40
    "Some weight you hold together.",   // 41
    "Said it. The one who'd believe it did.",   // 42
    "Two names on it now.",   // 43
    "No trade. Not letting them sit alone.",   // 44
    "Stayed for the inch back up.",   // 45
    "Traded ghosts. Two lists, leaned together.",   // 46
    "Last good thing. It's mutual.",   // 47
    "The wrong end. Where else.",   // 48
    "Never says it back. Doesn't have to.",   // 49
    "We take the next one together.",   // 50
    "Neither of us slid off. That holds.",   // 51
    "Don't like them. Drank next to them.",   // 52
    "We built it. Neither of us clean.",   // 53
    "Told them I'd hold their flank.",   // 54
    "Trusted the one who won't flatter.",   // 55
    "Too mean to lose each other.",   // 56
    "Moved down a stool. Said nothing.",   // 57
    "Turned out they waited on me.",   // 58
    "Stayed past close. Didn't clock it.",   // 59
    "They let me keep it whole.",   // 60
    "Close enough the cold quit.",   // 61
    "Don't tell. They'd price it.",   // 62
    "Said no. Almost didn't.",   // 63
    "Looped the block. Twice.",   // 64
    "The stool was mine. It held.",   // 65
    "Named it. Off the books.",   // 66
    "Decided. Same as them.",   // 67
    "Said all of it. Once.",   // 68
    "Pointed the kid the right way. Once.",   // 69
    "Showed them how the old ones sit.",   // 70
    "Their first one. Helped carry it.",   // 71
    "Told them the part nobody told me.",   // 72
    "Couldn't lie to that one anymore.",   // 73
    "The kid's the senior now. It's theirs.",   // 74
  ],
  // scenes[] : Scene objects. The counterpart OPENS; the bulleted choices are the VETERAN's lines.
  //   req: {venue, kind, minTier, maxTier, gate}  · choice: {approach, gate, line, check, land, miss}
  //   land/miss: {reply, pts?, ev?, npcEv?, fx?, fl?}  (pts default = scenePts × approach weight; ev = ohCode)
  scenes: [
    { id:'bar.first_round', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:0, maxTier:1},
      open:[
        "{npc} slides {me} a knockoff whiskey {me} didn't order. \"On the house. Three rosters I've poured for — you've all got the same look on the way in.\"",
        "{npc} sets a knockoff whiskey in front of {me} before {me} can wave it off. \"On the house. You carry it in the shoulders. They all do.\"",
        "{npc} pours one {me} didn't ask for and doesn't ring it up. \"First one's mine. I know the walk in.\""],
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
      open:[
        "{npc} nods at {me} like a regular now. \"Usual?\"",
        "{npc} already has the bottle off the shelf when {me} sits. \"Figured. Long week?\"",
        "{npc} sets {me}'s usual down without a word and leans on the rail. \"You're early. Good sign or bad one.\"",
        "\"Still standing,\" {npc} says, reaching for {me}'s glass. \"Same?\""],
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
      open:[
        "{npc} is already in the back booth, both hands around a bowl of broth going cold. \"So you finally showed.\"",
        "{npc} is in the back booth, both hands around a bowl going cold. Doesn't turn around. \"Stood in that doorway long enough. Sit or go.\"",
        "{npc} saved the booth, the one by the window that was always {home}'s side of the table. \"Broth's getting cold. So am I.\"",
        "{npc} looks up from the cold broth, older than you remember. \"Thought about not coming. Came anyway. That's family, the long way around.\""],
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
    // --- STATIC (club) — veteran ↔ veteran ({them} = the other vet; you direct {me}, they react by compatibility) ---
    { id:'club.first_table', venue:'club', kind:'friend', req:{minTier:0, maxTier:2},
      open:[
        "{me} and {them} end up at the same sticky table, sizing each other up over the bass.",
        "The only open seat is across from {them}, and {them} kicks the other chair out with a boot. \"It's a chair. Sit.\"",
        "{me} and {them} reach for the last booth at the same moment, and rather than fight the bass over it, take a side each.",
        "Someone's spilled the far end of the bar, so {me} and {them} get crowded onto one sticky table, strangers shoulder to shoulder under the speakers."],
      choices:[
        { approach:'warm', line:"Buy the round. Bring up the op {them} dragged {me} out of.",
          land:{ reply:"You trade the war story only the two of you have. Something clicks — easy as that.", ev:9 } },
        { approach:'probing', line:"Ask {them} what they did before all this.",
          land:{ reply:"Turns out you came up the same kind of hard. The drinks go down easier after.", ev:9 } },
      ] },
    { id:'club.tight', venue:'club', kind:'friend', req:{minTier:2, maxTier:4},
      open:"{them} saves {me} a seat without being asked. The bass is the only thing louder than the quiet between you.",
      choices:[
        { approach:'warm', line:"Tell {them} you'd take the next bad call with them and no one else.",
          land:{ reply:"{them} doesn't say it back. Doesn't have to. Inseparable, now.", ev:9, fl:'CLOSEST' } },
      ] },
    { id:'club.friction', venue:'club', kind:'rival', req:{minTier:0, maxTier:4},
      open:[
        "{me} and {them} keep ending up at the same end of the bar, and neither will give the other the satisfaction of leaving first.",
        "{them} is at {me}'s end of the bar again. The air goes tight, the way it does before a bad order comes down.",
        "{me} and {them} have worked the same three feet of bar all night, each waiting for the other to call it.",
        "{them} catches {me}'s eye across the bottles. Neither looks away. Old habit — nobody blinks first."],
      choices:[
        { approach:'blunt', line:"Needle {them} about the call that got someone killed.",
          land:{ reply:"It gets sharp, fast. Neither backs down. It's not friendship — but it's a kind of bond.", ev:10 } },
      ] },
    // --- BROADENED early-tier pool (B2): more low-tier scenes per arc so a fresh bond rotates instead of
    //     repeating one opener. Appended (indices 10+) to keep saved bond seen[] indices valid. ---
    { id:'club.exits', venue:'club', kind:'friend', req:{minTier:0, maxTier:2},
      open:[
        "{them} catches {me} clocking the exits before the first drink lands, and almost smiles. \"You too. Can't switch it off, huh.\"",
        "Two seats down, {them} sits with their back to the wall, same as {me}. The bass swallows everything but the look they trade.",
        "{them} takes the stool that watches the door, sees {me} already wanted it, and slides over one. \"We'll split the angle.\""],
      choices:[
        { approach:'warm', line:"Take the open stool. Say nothing about why it's the good one.",
          land:{ reply:"You sit the way you both still sit. Backs covered, eyes on the room. Nobody names it. It doesn't need naming.", ev:9 } },
        { approach:'probing', line:"Ask {them} how long since they slept with the lights off.",
          land:{ reply:"\"Longer than I'll admit sober.\" {them} doesn't dress it up. Neither do you. The bass takes the rest.", ev:11 } },
        { approach:'blunt', line:"Tell {them} the war's over and the chair won't move itself.", check:true,
          land:{ reply:"{them} snorts. \"Says the one facing the door.\" Caught, both of you. First easy thing in weeks.", ev:9 },
          miss:{ reply:"It comes out harder than {me} meant. {them} just nods, slow, and lets the bass have the table back.", pts:0 } },
      ] },
    { id:'club.tab', venue:'club', kind:'friend', req:{minTier:1, maxTier:2},
      open:[
        "{them}'s card gets declined at the bar — pension's late again — and {me} is sliding chits across before anyone can frown.",
        "Kitchen's out of everything but the cheap stuff, so {them} buys two of the worst drinks in the place and sets one in front of {me} like a dare.",
        "{them} is short for the round and trying not to show it. {me} covers it without making it a thing."],
      choices:[
        { approach:'warm', line:"Wave off the thanks. \"You'd have done it. Drink.\"",
          land:{ reply:"{them} drinks. Doesn't make a speech of it. Next bad week you both know who picks up the chits. It stops being a question.", ev:9 } },
        { approach:'blunt', line:"Tell {them} the company still owes you both more than a round.", check:true,
          land:{ reply:"\"More than they'll ever pay,\" {them} says, and clinks the bad drink against yours. Two people the same machine used up, splitting what it left them.", ev:11 },
          miss:{ reply:"{them} goes quiet at the bitterness in it. \"Yeah,\" is all. The drinks go warm before either of you tries again.", pts:0 } },
        { approach:'probing', line:"Ask if the pension's ever once come on time.",
          land:{ reply:"{them} laughs, tired. \"Not since the first roster.\" You trade the small humiliations of getting paid late by people who spend you freely. Grim. But not alone." } },
      ] },
    { id:'club.measure', venue:'club', kind:'rival', req:{minTier:0, maxTier:2},
      open:[
        "{them} is on the stool {me} was walking toward. Doesn't move. \"Plenty of bar.\"",
        "{them} clocks {me} in the mirror without turning around. \"Look who it is.\"",
        "{them} sets the glass down hard enough to hear over the bass. \"Didn't figure you for the type that drinks here.\""],
      choices:[
        { approach:'blunt', line:"Take the next stool over. Don't give an inch.", check:true,
          land:{ reply:"{them} snorts. \"Stubborn.\" Neither moves. Neither has to. It's not warmth, but it holds.", ev:10 },
          miss:{ reply:"{them} drinks, eyes on the bottles. The silence wins. Nothing settles tonight.", pts:0 } },
        { approach:'probing', line:"Ask {them} which front they came off of.",
          land:{ reply:"{them} names it. {me} names {me}'s. Same war, wrong ends of it. That doesn't make {them} family. Makes {them} someone {me} can't write off." } },
        { approach:'blunt', line:"Match {them}'s drink. Order the same, say nothing.", check:true,
          land:{ reply:"{them} watches the pour, then lifts the glass an inch. Not a toast. A line drawn. {me} lifts back.", ev:10 },
          miss:{ reply:"{them} leaves before the second round. {me} drinks both. Some respect you earn twice.", pts:0 } },
      ] },
    { id:'diner.cold_broth', venue:'diner', kind:'kin', req:{minTier:0, maxTier:1},
      open:[
        "{npc} doesn't get up. Slides the second bowl across the table with one finger. \"Sit before it goes stone-cold like the last one.\"",
        "{npc} is in the corner booth again, two bowls already steaming. \"Knew you'd come the long way around. You always did. Runs in the blood.\""],
      choices:[
        { approach:'warm', line:"Sit. Eat the broth {npc} ordered without being asked.",
          land:{ reply:"You eat in the quiet that isn't a fight, for once. {npc} watches the bowl go empty and says nothing. That's plenty.", ev:5 } },
        { approach:'probing', line:"Ask if {npc} still keeps the booth on the bad weeks.",
          land:{ reply:"\"Every week's a bad week,\" {npc} says, not unkind. \"Booth's here. So am I.\" Said like it costs nothing. It costs plenty." } },
        { approach:'blunt', line:"Say it straight — you didn't think {npc} would still be waiting.", check:true,
          land:{ reply:"{npc} sets the spoon down. \"I'm stubborn. Runs in the blood.\" Not a smile. Close to one. Recoverable ground." },
          miss:{ reply:"{npc} just nods at the bowl. \"Eat. We don't have to do the rest tonight.\" The words wait for another day.", pts:0 } },
      ] },
    { id:'diner.same_side', venue:'diner', kind:'kin', req:{minTier:0, maxTier:2},
      open:[
        "{npc} is wiping a spot on the table that was already clean. \"You look like {home} looks now. Tired. Still standing.\"",
        "Same booth, same chipped formica. {npc} looks up slow, older than you let yourself remember. \"Long time since you sat on this side.\""],
      choices:[
        { approach:'warm', line:"Tell {npc} you think about {home} more than you let on.",
          land:{ reply:"{npc} goes still. \"Yeah. Me too. Every time the broth comes out right.\" Nobody leaves. The booth holds two again.", ev:5 } },
        { approach:'probing', line:"Ask what's left back home, with you gone this long.",
          land:{ reply:"\"Dust. The booth. Me.\" {npc} turns the cup a half-turn. \"Enough to come back to, if you wanted.\" Said low, no weight on it. All the weight on it." } },
        { approach:'blunt', line:"Ask if {npc} blames you for the years you stayed gone.", check:true,
          land:{ reply:"\"I did. For a while.\" {npc} turns the cup again. \"Then I just missed you. Sit down.\" The blame's older than the missing now." },
          miss:{ reply:"{npc}'s jaw works. \"Don't make me answer that over noodles.\" Fair. Some questions need a better night.", pts:0 } },
      ] },
    { id:'bar.closing_time', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:0, maxTier:1},
      open:[
        "{npc} wipes the rail in front of {me} without being asked. \"You hold a glass like somebody taught you to ration it. Sit. It's slow tonight.\"",
        "The place is near empty. {npc} sets a glass down at the dark end of the bar and tips her head at the stool. \"Take the quiet one. Easier where the lights don't reach.\""],
      choices:[
        { approach:'warm', line:"Take the stool. Ask how long she's worked this bar.",
          land:{ reply:"\"Long enough to stop counting,\" {npc} says. \"You learn the ones who come back and the ones who don't.\" She doesn't say which {me} is. The night goes easy after that." } },
        { approach:'probing', line:"Ask if it gets to her — pouring for the ones who don't come back.",
          land:{ reply:"{npc} keeps drying the same glass. \"Somebody's at the bar when the news comes in. Better me than a wall.\" She lets the quiet sit. {me} sits in it with her.", ev:0 } },
        { approach:'blunt', line:"\"I didn't come here to get figured out.\"", check:true,
          land:{ reply:"\"Nobody does,\" {npc} says, and slides the glass over anyway. \"I'm not figuring. I'm just still here.\" {me} drinks, and the wall comes down a little on its own." },
          miss:{ reply:"{npc} lets it drop and moves down the bar. {me} finishes the drink alone and keeps the rest to {me}.", pts:0 } },
      ] },
    // --- MULTI-BEAT confidant scenes (B-multi vertical slice / TEMPLATE) — a scene is a `beats[]` conversation tree.
    //     A choice's land/miss may carry `next` (advance to that beat index); no `next` = terminal (the night ends).
    //     Played locally beat-by-beat; committed ONCE at the terminal branch via payload.path[] (host re-derives). ---
    { id:'bar.weight', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{npc} slides a drink {me} didn't order and leans on the rail. \"Three rosters I've poured for. You've all got the same walk in. Sit.\"",
            "{npc} sets a glass at the dark end of the bar and tips her head at it. \"Slow night. Take the weight off — I've got nowhere to be.\""],
          choices:[
            { approach:'warm', line:"Take the glass. Let her talk.",
              land:{ reply:"\"Good,\" {npc} says. \"It's the ones who don't drink I watch.\" She pours herself a short one and waits.", next:1 } },
            { approach:'probing', gate:'dream', line:"Ask if she ever wanted out of this city.",
              land:{ reply:"\"Out?\" She almost laughs. \"Tell me yours first.\" And somehow it's {me} saying it — {dream} — out loud, to a stranger pouring drinks.", ev:13 } },
            { approach:'blunt', line:"\"I'm not here to get read.\"",
              land:{ reply:"\"Wasn't reading. Pouring.\" She slides it closer anyway, slower. \"I'll be here when you are.\"", pts:0 } } ] },
        { choices:[
            { approach:'warm', line:"Trade the week's dead. Names, not numbers.",
              land:{ reply:"{npc} starts naming the ones you have in common. The ice outlasts the small talk, and {me} stays till the glass sweats.", ev:12 } },
            { approach:'probing', line:"Ask what keeps her behind this bar.",
              land:{ reply:"\"Somebody's got to remember the names,\" she says, and tops {me} off like that settles it. Maybe it does." } } ] }
      ] },
    { id:'bar.unloading', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:2, maxTier:3},
      beats:[
        { open:[
            "{npc} doesn't look up from the glass she's drying. \"You came in heavier than {lastmap} should've cost. Talk or drink. Both work.\"",
            "\"{fallen} would've had something to say about that face,\" {npc} says, not unkind. \"Talk, or just sit. I'll keep pouring.\""],
          choices:[
            { approach:'warm', line:"Sit. Let it out.",
              land:{ reply:"She sets the glass down and gives {me} the room. \"Start anywhere. I've heard worse, and I've poured for worse.\"", next:1 } },
            { approach:'blunt', line:"Just drink. Not tonight.",
              land:{ reply:"\"Suit yourself.\" She doesn't push. \"I'll keep the names till you want them.\"", next:2 } } ] },
        { choices:[
            { approach:'probing', gate:'crime', line:"Finally say what {me} did before the company: {crime}.",
              land:{ reply:"{npc} doesn't flinch. \"Yeah. Figured it was something that shape.\" Said out loud, to someone who stayed, it weighs a few grams less.", ev:15, fl:'ARC_UNLOCKED' } },
            { approach:'warm', line:"Talk about {fallen} instead — the ones who didn't walk back out.",
              land:{ reply:"You trade the kind of small talk that only means anything after a war. {npc} remembers {fallen} too. {me} leaves a little lighter.", ev:14 } } ] },
        { choices:[
            { approach:'warm', line:"Name one of the dead with her. Just one.",
              land:{ reply:"\"{fallen},\" she repeats, like she's filing it somewhere safe. \"Got it. They don't get lost in here.\"", ev:14 } },
            { approach:'blunt', line:"Nothing. Just the burn of the drink.",
              land:{ reply:"{npc} lets the quiet do its work and leaves the bottle in reach. Sometimes that's the whole conversation.", pts:0 } } ] }
      ] },
    // --- bar/confidant (multi-beat) ---
    { id:'bar.read', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{npc} clocks {me} from the dark end of the bar and doesn't reach for a bottle yet. \"New face. Or an old one I haven't placed. Sit, and I'll figure out which.\"",
            "{npc} sets a clean glass down and leaves it empty. \"I pour to the walk-in. Haven't read yours. Take a stool, give me a minute.\"",
            "{npc} doesn't ask what {me} wants. Just watches the door shut. \"You came in checking corners. So did the last three rosters. Sit.\""],
          choices:[
        { approach:'warm', line:"Sit where she can see {me}. Let her work it out.",
          land:{ reply:"She studies {me} a beat, then pours without asking. \"Whiskey. The story comes when it comes.\" The first one goes down quiet.", next:1 } },
        { approach:'blunt', line:"\"You read people for tips?\"", check:true,
          land:{ reply:"\"I read people so I don't waste good liquor on someone who won't come back.\" She slides {me} the glass. \"You'll come back.\"", next:1 },
          miss:{ reply:"She shrugs and turns back to the glasses. \"Or don't.\" {me} drinks alone, eyes on the door. Nothing learned tonight.", pts:0 } },
        { approach:'probing', line:"Ask how long she's worked this bar.",
          land:{ reply:"\"Long enough to outlive the people who taught me the pours.\" She doesn't make it sad. Just sets it on the rail next to the glass.", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Trade names. The dead {me} carries, for the ones she does.",
          land:{ reply:"{npc} names hers, slow, like she's done it a hundred nights. {me} adds a few. The ice outlasts the talk, and the corners stop mattering for a while.", ev:16 } },
        { approach:'probing', line:"Ask what she figured out about {me}.",
          land:{ reply:"\"You're not running from anyone in this room. You're running from one back wherever home was.\" She tops {me} off. \"Ten minutes. Don't be impressed. Everyone in here's the same.\"" } },
          ] }
      ] },
    { id:'bar.house_rules', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "Two stools down, a chromed merc with a dead singer loaded in his skull hums something nobody alive wrote. {npc} watches him a second, then turns to {me}. \"Harmless. Mostly. House rule: nobody settles a war in here. You good with that?\"",
            "{npc} wipes the rail in front of {me}'s gap. \"One rule. Whatever you did out there stays out there. The names you bring in, I keep. The grudges, you check at the door.\"",
            "Somebody reaches for a bottle behind the bar and {npc} doesn't even look. \"Hand. Off.\" Then, to {me}, dry: \"Two rules. No reaching back here. No finishing fights you started somewhere else.\""],
          choices:[
        { approach:'warm', line:"Tell her {me}'s here for the quiet, not the trouble.",
          land:{ reply:"\"Good. The quiet's the only thing I stock that doesn't run out.\" She nods {me} toward the dark end. \"That's the seat for it.\"", next:1 } },
        { approach:'blunt', line:"\"And if someone brings the war in anyway?\"", check:true,
          land:{ reply:"\"Then they leave it on the floor on the way out. One way or the other.\" Flat, no heat. \"Hasn't come to that in a while. Don't make it tonight.\"", next:1 },
          miss:{ reply:"She gives {me} a long look, the kind that files something away. \"Asking that on night one. Noted.\" She moves down the bar. {me} drinks alone.", pts:0 } },
        { approach:'probing', line:"Ask who taught her the rules.",
          land:{ reply:"\"A bar I drank in before I owned one. The keep there kept everybody's names and nobody's secrets.\" A thin line of a smile. \"I do better.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Settle in at the dark end. Make it a habit.",
          land:{ reply:"By the third visit she has the bottle down before {me} sits. The city stays loud and gone outside. In here, the gap at the rail is {me}'s. That's the trade, and it holds.", ev:17 } },
        { approach:'blunt', line:"Ask if the chromed merc ever pays his tab.",
          land:{ reply:"\"He pays in songs from a dead man. I let it slide.\" She pours one more. \"Everybody in here runs on borrowed somebody. You'll fit.\"", ev:17 } },
          ] }
      ] },
    { id:'bar.shop_talk', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{npc} sets {me}'s usual down and lingers. \"Heard your company won by becoming the thing it was hired to put down. True, or just what they tell at the other end of the bar?\"",
            "\"You came up off {lastmap},\" {npc} says, not a question. \"I flew a founder-mech two arcs back. Probably burned the same sky. Different seats.\"",
            "{npc} pours and nods at the scarring under {me}'s sleeve. \"That's not factory. That's a bad extraction. I had one. Tell me yours, I'll tell you mine.\""],
          choices:[
        { approach:'warm', line:"Tell her about the seat she flew. Trade the war, pilot to grunt.",
          land:{ reply:"She talks about the mech like a person she buried. \"Outlived the unit and the machine both. Now I pour for whoever's left.\" {me} is, apparently, whoever's left.", next:1 } },
        { approach:'blunt', line:"\"We won by becoming the enemy. That's the whole story.\"", check:true,
          land:{ reply:"She doesn't blink. \"Yeah. That's how anybody wins anything out there now.\" She pours herself a short one. \"A&O bought the wreckage and sells it back as a miracle. We're the part they don't advertise.\"", next:1 },
          miss:{ reply:"It comes out harder than {me} meant, a confession with the edges still on. {npc} lets it sit. \"Easy. I'm not keeping score.\" The talk goes somewhere else after.", next:1, pts:0 } },
        { approach:'probing', line:"Ask what the founder-mech felt like going down.",
          land:{ reply:"\"Quiet. Nobody warns you about that part. All that fire and then just — quiet.\" She sets the glass aside. \"You already know. Why else ask.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Say it plain — better not to drink with strangers anymore.",
          land:{ reply:"\"You stopped being a stranger about four visits ago.\" She tops {me} off, the bottle already half-knowing the pour. \"Don't make it weird. Just keep showing up.\"", ev:19 } },
        { approach:'probing', line:"Ask if she ever thinks about flying again.",
          land:{ reply:"\"Every time something loud goes over.\" She glances at the ceiling like she can see through it. \"Then it passes, and there's a glass to dry. I made that trade on purpose.\"", ev:18 } },
          ] }
      ] },
    { id:'bar.want', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{npc} catches {me} staring through the bottles at nothing. \"That's the look of somebody who wants something they won't say out loud. I get the same one in the mirror at close.\"",
            "Slow night. {npc} leans on the rail across from {me}. \"Going to ask the thing nobody asks in a place like this. What do you want? Not tonight. After all this.\"",
            "\"Everybody in here drinks toward something,\" {npc} says, sliding the glass over. \"Forgetting, mostly. Not you. You're drinking toward an idea. What is it.\""],
          choices:[
        { approach:'warm', line:"Sit with it. Then start to answer her honest.",
          land:{ reply:"She doesn't rush {me}. Dries the same glass twice, gives the silence room to turn into words.", next:1 } },
        { approach:'blunt', line:"\"People like us don't get an after.\"", check:true,
          land:{ reply:"\"Maybe. But you've got the want anyway, or you'd already be gone.\" She doesn't let {me} off the hook. \"So. Say it.\"", next:1 },
          miss:{ reply:"\"Sure,\" she says, and lets it drop. \"No after. Drink your nothing, then.\" The conversation cools where {me} left it. Another night, maybe.", pts:0 } },
        { approach:'probing', line:"Turn it back — ask what she wants.",
          land:{ reply:"\"To die before I forget a single name.\" She says it like a grocery list. \"Your turn. Don't dodge. I answered.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', gate:'dream', line:"Say it. The thing {me} actually wants: {dream}.",
          land:{ reply:"{npc} sets the glass down and listens, all the way to the end. \"That's a real one,\" she says when {me}'s done. \"Hold onto it. They don't make many.\" Out loud, for once. It doesn't sound stupid.", ev:20 } },
        { approach:'blunt', line:"Order another instead. Some wants stay in the glass.",
          land:{ reply:"\"Fair,\" {npc} says, and pours it. \"It'll keep. They always keep.\" She leaves the bottle in reach and lets the want stay nameless one more night." } },
          ] }
      ] },
    { id:'bar.bad_run', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:2, maxTier:3, need:'fallen'},
      beats:[
        { open:[
            "{npc} takes one look at {me} coming off {lastmap} and pulls the good bottle, the one she doesn't ring up. \"How many didn't walk back.\"",
            "\"{fallen} isn't with you tonight,\" {npc} says, quiet, counting the empty stool the way she counts everything. \"Sit. Don't make me drag it out of you.\"",
            "The door barely shuts before {npc} has the glass poured. \"That's the {lastmap} face. I've worn it. Sit down before you fall down.\""],
          choices:[
        { approach:'warm', line:"Say {fallen}'s name. Get it into the room.",
          land:{ reply:"\"{fallen},\" {npc} repeats, and writes it somewhere only she can read. \"Got them. They don't get lost in here.\" She pours a second glass and leaves it full, across from {me}.", next:1 } },
        { approach:'blunt', line:"\"Don't. I just want to drink and not feel my hands.\"", check:true,
          land:{ reply:"\"Then drink.\" No argument. She slides the bottle into reach and steps back. \"I'll keep their name till you can carry it again.\"", next:2 },
          miss:{ reply:"It lands sharp, aimed at the wrong person. {npc} takes it without a word — she's been the wrong person before. \"Yeah,\" is all. She pours, and the bar's noise closes over it.", next:2, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell her what {fallen} was actually like. Not the soldier. The person.",
          land:{ reply:"{me} talks until the ice goes to water — what they laughed at, what they couldn't stand. {npc} doesn't fill the gaps with comfort. She keeps them, the way she keeps all of them. That's the only kind that lasts.", ev:21 } },
        { approach:'probing', line:"Ask how she stops their faces blurring together.",
          land:{ reply:"\"I don't. I just say them out loud so the blur doesn't win.\" She nods at the full glass across from {me}. \"That's what that's for. Say one more before you go.\"", ev:21 } },
          ] },
        { choices:[
        { approach:'warm', line:"Before {me} leaves — give her the name. Just once.",
          land:{ reply:"\"{fallen},\" she says back, filing it somewhere safe. \"Got it. Come back when you can stand it, and we'll say the rest.\" {me} leaves the same weight, set down better than {me} found it.", ev:21 } },
        { approach:'blunt', line:"Finish the drink. Leave nothing on the bar but the glass.",
          land:{ reply:"{npc} watches {me} go and doesn't say goodbye — she's learned not to spend them. She clears the full glass last. Sometimes that's the whole eulogy.", pts:0 } },
          ] }
      ] },
    { id:'bar.the_wound', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:2, maxTier:3, gate:'trauma'},
      beats:[
        { open:[
            "{npc} doesn't look up from the glass she's drying. \"You've sat here a dozen nights and never once said the one thing. I hear the shape of it in the quiet. Tonight, or never. I'm not asking again.\"",
            "\"{lastmap} shook something loose, didn't it,\" {npc} says, setting the rag down. \"You came in carrying the thing you usually leave at the door. Leave it on the bar instead.\"",
            "The place is empty but for {me} and the chromed merc humming a dead man's chorus. {npc} pours and stays. \"He drinks to drown one voice. You're drinking to keep one quiet. The quiet one — let it talk. I've got all night.\""],
          choices:[
        { approach:'warm', line:"Take the opening. Tell her there is a thing.",
          land:{ reply:"\"I know there's a thing,\" {npc} says, gentle as she gets. \"Knew it the first night. Take your time. I've poured for worse, and they all walked back out.\"", next:1 } },
        { approach:'blunt', line:"\"Some things you don't get to put down.\"", check:true,
          land:{ reply:"\"Not down. Just set it where someone else can see it.\" She doesn't look away. \"You carry it alone because nobody asked. I'm asking.\"", next:1 },
          miss:{ reply:"{me} closes up tighter than {me} came in. {npc} lets it go without a fight. \"Alright. It'll be here. So will I.\" The thing stays where it's always been — for now.", next:2, pts:0 } },
        { approach:'probing', line:"Ask if she's ever said her own worst thing out loud.",
          land:{ reply:"\"Once. To a keep in a bar that's rubble now.\" Her jaw sets. \"Didn't fix anything. It just stopped being only mine. That's all it ever does. It's enough.\"", next:1 } },
          ] },
        { choices:[
        { approach:'probing', gate:'trauma', line:"Finally say the thing about {trauma}.",
          land:{ reply:"{npc} doesn't reach over, doesn't soften it, doesn't say it gets better — she knows better than to lie. She stays, all the way through, and pours one for each of {me}. \"Now it's not only yours. That's the only mercy this job has.\" Said to someone who stayed, it stops being a stone {me} carries alone.", ev:22, fl:'ARC_UNLOCKED' } },
        { approach:'blunt', line:"Get to the edge of it — then pull back to the war.",
          land:{ reply:"{npc} lets {me} steer away. \"Another night, maybe.\" The glass keeps turning in her hands. The thing about {trauma} stays caged. \"It'll keep. They always keep. I'll be here.\"", next:2 } },
          ] },
        { choices:[
        { approach:'warm', line:"Trade the dead instead. The names {me} can say.",
          land:{ reply:"{me} gives her the ones {me} can talk about, and keeps the one {me} can't. {npc} takes them all without weighing which is which. \"These count too. Come back for the rest when you're ready.\"", ev:22 } },
        { approach:'blunt', line:"Nothing more tonight. Just the burn.",
          land:{ reply:"{npc} leaves the bottle in reach and the question open. \"No rush. The thing's not going anywhere. Neither am I.\" Sometimes the not-saying is the whole conversation.", pts:0 } },
          ] }
      ] },
    { id:'bar.the_road_home', venue:'bar', kind:'confidant', with:'bartender', req:{minTier:4, maxTier:4},
      beats:[
        { open:[
            "Last call, the real one. {npc} sets two glasses down and charges for neither. \"You've named every dead thing you carry at this bar except one. The one that's still alive, back in {home}. Time we talked about that.\"",
            "{npc} locks the door, flips the sign, pours like there's nowhere either of you has to be. \"Years of your names, and you never once said you wanted to go back. Tonight you've got the look. So go. Not stupid. Tell me what's waiting.\"",
            "The place is empty. Just {me}, {npc}, and the chromed merc gone home with his dead man's voice. \"I've kept your stool and your names long enough,\" she says. \"There's a thing in {home} you left undone. I hear you deciding to finish it. Let me help you not die doing it.\""],
          choices:[
        { approach:'warm', line:"Tell her about the one thing back in {home} {me} never finished.",
          land:{ reply:"{npc} listens to all of it, the part {me}'s never said even here. When {me}'s done she doesn't call it a good idea. She tells {me} how to do it and walk back out. \"I flew home once, after. Did it wrong. Do it better than I did.\"", next:1 } },
        { approach:'blunt', line:"\"I might not come back from this one.\"",
          land:{ reply:"\"Then you go knowing somebody kept the names while you were gone, and somebody'll keep yours after.\" She doesn't flinch from it. \"But you'll come back. You're too stubborn to give A&O the body. Sit. Let's plan it right.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Take the road she maps. Mean it. Go settle it.",
          land:{ reply:"{npc} writes a name and an address on a coaster and slides it over — someone in {home} who still owes the dead a favor. \"Use it. Then come tell me how it went, or don't, and I'll know it went the other way.\" She pours the last two. \"Go settle it. I'll keep your stool. I keep everything.\"", ev:23, fx:{t:'capstone'} } },
        { approach:'blunt', line:"Ask her to keep one name above all the rest while {me}'s gone.",
          land:{ reply:"\"Tell me which.\" {me} does. {npc} sets it at the top of the list only she can read. \"Above the rest. Done. Now go do the thing that name's been asking you to do since before you walked in here.\" She charges for nothing. \"Go home. The stool's yours till you're back.\"", ev:23, fx:{t:'capstone'} } },
          ] }
      ] },
    // --- diner/kin (multi-beat) ---
    { id:'diner.gone_cold', venue:'diner', kind:'kin', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{npc} is in the back booth with two bowls already going cold. \"Ordered for you. Same as you always got. Figured if I waited for you to ask, I'd wait all night.\"",
            "{npc} doesn't look up from the cold broth. \"Sit before it skins over. I'm not reheating it twice for somebody who almost didn't come.\"",
            "{npc} saved {home}'s side of the table, the window seat. \"Broth's cold. So's most of what's between us. Sit anyway.\""],
          choices:[
        { approach:'warm', line:"Sit. Say {npc}'s name first, before anything else.",
          land:{ reply:"{npc}'s shoulders come down half an inch. \"Yeah. There it is.\" The broth's cold. Nobody gets up. \"So. You're in one piece. Mostly.\"", next:1 } },
        { approach:'probing', line:"Ask why {npc} kept the booth all these years.",
          land:{ reply:"\"Habit,\" {npc} says, too fast to be true. \"Same booth, same broth. Somebody in this family ought to keep one thing the same.\" Sit, then.", next:1 } },
        { approach:'blunt', line:"Stay standing. \"Why now.\"", check:true,
          land:{ reply:"\"Because I'm tired, you're not dead yet, and one of those won't last.\" {npc} kicks the seat out. \"Sit down before I lose the nerve.\"", next:1 },
          miss:{ reply:"It comes out like an accusation. {npc} just nods, slow, and pulls the second bowl back. \"Right. Another time.\" Recoverable. Not tonight.", pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Eat the cold broth without complaining. Let the quiet sit.",
          land:{ reply:"You eat it cold, both of you, like that's the apology neither can say yet. The broth goes colder. Nobody walks out.", ev:24 } },
        { approach:'blunt', line:"Ask if {npc} actually wants {me} here or just wanted to win the argument.",
          land:{ reply:"\"Both,\" {npc} says, and the honesty of it almost gets a laugh out of you. \"Eat your broth. We'll fight about the rest later.\" Later means coming back.", ev:24 } },
          ] }
      ] },
    { id:'diner.what_to_call_you', venue:'diner', kind:'kin', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{npc} sets down the menu nobody reads here. \"I don't even know what to call what you do now. Soldier. Merc. The papers had another word.\"",
            "{npc} watches {me} clock the diner's exits on the way in and says nothing about it. Just: \"You sit different than you used to.\"",
            "\"You came back wearing somebody else's face,\" {npc} says, not cruel. \"I keep looking for the {rel} I knew under it.\""],
          choices:[
        { approach:'warm', line:"\"Same {rel} you knew. Just used harder.\"",
          land:{ reply:"{npc} studies {me} a long moment. \"Used harder. Yeah. That I can sit across from.\" Coffee comes that neither of you ordered. The place knows family when it sees a feud.", next:1 } },
        { approach:'probing', line:"Ask what they said about {me} back in {home} after {me} left.",
          land:{ reply:"\"Nothing good. Nothing I argued with, either.\" {npc} turns the cup. \"That's the part I'm not proud of. I let them say it.\"", next:1 } },
        { approach:'blunt', line:"\"You want the word, it's the one the papers used. Don't pretend it isn't.\"", check:true,
          land:{ reply:"{npc} doesn't blink. \"Fine. I can hold that and still want you at the table. Sit.\" Pure family, that stubbornness.", next:1 },
          miss:{ reply:"It lands too hard and you both feel it. {npc} looks out the window a while. \"Eat something,\" is all. The cup goes cold between you.", next:1, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {npc} one small true thing about the war. Just one.",
          land:{ reply:"You give them one — small, survivable, true. {npc} takes it like it's worth more than it is. \"There. Now I know one thing about it. Come back, I'll learn the next.\"", ev:25 } },
        { approach:'probing', line:"Ask {npc} to tell {me} what {me} missed back in {home}.",
          land:{ reply:"{npc} talks. Births, deaths, the corner store A&O bought and gutted. {me} listens to a life that kept going without {me} in it, and stays anyway. The broth goes cold, unnoticed.", ev:25 } },
          ] }
      ] },
    { id:'diner.who_ordered', venue:'diner', kind:'kin', req:{minTier:0, maxTier:2, need:'fallen'},
      beats:[
        { open:[
            "{npc} sets out an extra bowl by old habit, then catches it. \"Force of habit. We always ordered one too many.\" A beat. \"Who'd you lose out there?\"",
            "\"You flinch every time the door chimes,\" {npc} says, quiet. \"You're counting somebody who isn't walking in. Tell me their name.\"",
            "{npc} pushes the bread over. \"You eat like someone's saving you the rest. Like there's a chair you're keeping. Who is it?\""],
          choices:[
        { approach:'warm', line:"Say {fallen}'s name out loud at the table.",
          land:{ reply:"\"{fallen},\" {npc} repeats, careful, getting it right. \"Tell me about them. Not how they died. Who they were.\" And so you do, over cold broth.", next:1 } },
        { approach:'blunt', line:"\"You don't want that list. It's long.\"",
          land:{ reply:"\"Then we'll be here a while,\" {npc} says, and waves off the check the waitress is bringing. \"I'm not anywhere else tonight. Start with one.\"", next:1 } },
        { approach:'probing', line:"Ask if {npc} really wants to carry that with {me}.",
          land:{ reply:"\"That's what family was for, before we let it break.\" {npc} folds both hands on the table. \"So. One name. I'll hold my half.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {npc} the small thing about {fallen} — the laugh, the bad habit, the thing only {me} would remember.",
          land:{ reply:"You give {npc} the part of {fallen} that wasn't a soldier. {npc} laughs in the right place, goes quiet in the right place. \"Sounds like they were good to know. Sorry I never did.\" Now there's a second person who carries the name.", ev:27 } },
        { approach:'blunt', line:"\"They're gone. Saying it at a noodle counter doesn't change that.\"",
          land:{ reply:"\"No,\" {npc} agrees. \"But you said it where someone heard. That's not nothing.\" The bowl's cold. {npc} orders two more, like the night's worth keeping open.", ev:26 } },
          ] }
      ] },
    { id:'diner.small_repairs', venue:'diner', kind:'kin', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{npc} slides {me} the stool by the window without a word, the way you do for someone who's becoming a regular again.",
            "{npc}'s already flagged the broth before {me} sits. \"Same as last time. We're building a habit. Don't ruin it.\"",
            "There's a chipped mug at {me}'s place that wasn't there before. \"Found it in a box from the old house,\" {npc} says, not looking up. \"Yours. From before.\""],
          choices:[
        { approach:'warm', line:"Notice the mug. Hold it like it matters.",
          land:{ reply:"\"Don't make it a thing,\" {npc} warns, which is how you know it's a thing. \"I just had it. That's all.\" {me} drinks from {me}'s own old mug. Small repair.", next:1 } },
        { approach:'probing', line:"Ask what else survived from the old house.",
          land:{ reply:"\"Not much. A&O took the block, you know that.\" {npc} turns the mug. \"Box of nothing, mostly. But your nothing's in there too. Thought you should have a piece.\"", next:1 } },
        { approach:'blunt', line:"\"You kept my stuff this whole time and stayed mad at me?\"", check:true,
          land:{ reply:"\"You can do both,\" {npc} says, even. \"Keep someone's mug and stay furious. That's most of what family is.\" No heat in it. Just truth, set down between you.", next:1 },
          miss:{ reply:"{npc} sets the mug down a little too hard. \"Forget I dug it out.\" The window fogs. You let too much air out of the night with one line.", next:1, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Settle one small old thing tonight — own {me}'s half of the one you can actually name.",
          land:{ reply:"You name the small old wound and own your half. {npc} doesn't make a ceremony of it. \"Okay. That one's settled. There's a list. But that one's off it.\" {me} leaves lighter.", ev:28 } },
        { approach:'probing', line:"Ask what's still on the list, between you.",
          land:{ reply:"\"Long,\" {npc} admits. \"Shorter than it was. We work it backward, one bad bowl of broth at a time.\" Not fixed. Not nothing. {me} leaves lighter.", ev:28 } },
          ] }
      ] },
    { id:'diner.photo_left', venue:'diner', kind:'kin', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{npc} slides a creased photo across the formica before the broth lands. \"Found this. Both of us, the year before {home} went the way it went. Look how dumb we were.\"",
            "There's a photo face-down by {me}'s spoon. \"Don't have to look,\" {npc} says, already looking. \"But I needed to bring it. The two of us, before.\"",
            "{npc} sets a faded picture between the bowls. \"Last good one. Of {home}, of us, of any of it. Came out before the company found you. I keep it where I'll see it.\""],
          choices:[
        { approach:'warm', line:"Pick it up. Find the version of {me} that hadn't learned to clock exits yet.",
          land:{ reply:"{me} looks a long time. The face in it didn't flinch at doors. \"That {rel}'s still in there,\" {npc} says, quiet. \"I see them. Sometimes. Like just now.\"", next:1 } },
        { approach:'blunt', line:"Push it back. \"That person's dead. The war saw to it.\"", check:true,
          land:{ reply:"\"Maybe,\" {npc} says, sliding it right back. \"But I'm not throwing out a picture of someone you used to be just because you stopped liking them. Hold it.\" And {me} does.", next:1 },
          miss:{ reply:"{npc} takes the photo back without a word and pockets it. \"Forget it.\" Something closes a little. The broth comes; you eat it in a thinner quiet.", next:1, pts:0 } },
        { approach:'probing', line:"Ask who took the picture.",
          land:{ reply:"{npc} names a neighbor, a street, a day. The whole gone world of {home} in three sentences. \"Rubble now. All of it. Except this. Except, maybe, us.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {npc} to keep it. \"Somewhere you'll see it. So one of us remembers who I was.\"",
          land:{ reply:"{npc} slips it back in a pocket, careful. \"I'll keep it where I'll see it. And you'll keep coming back, so I've got the new version to set beside it.\" {me} leaves lighter.", ev:30 } },
        { approach:'probing', line:"Ask {npc} to tell {me} something the photo doesn't show.",
          land:{ reply:"{npc} talks about the day around the picture — who was alive, what {home} smelled like, the dumb argument right after. {me} sits in a life that was good once and lets it be true. The broth goes cold, unmourned.", ev:29 } },
          ] }
      ] },
    { id:'diner.reckoning', venue:'diner', kind:'kin', req:{minTier:2, maxTier:3, gate:'trauma'},
      beats:[
        { open:[
            "{npc} waits until the waitress is gone. \"You've sat across from me a few times now, and there's a thing you're not saying. It's in your hands. Say it. I'm done eating around it.\"",
            "{npc} pushes the bowls aside, clears a space on the table. \"No broth tonight till you tell me the thing you carried back. The real one. I can see it sitting on you.\"",
            "\"I've been patient,\" {npc} says, quiet and level. \"More than you maybe earned. But I want the whole {rel}, not the half you let me have. Tell me the thing about it.\""],
          choices:[
        { approach:'warm', line:"Ask if {npc} is sure. \"Once it's out, you can't unhear it.\"",
          land:{ reply:"\"I've unheard nothing in my life,\" {npc} says. \"And I'm still here. Try me.\" The diner's empty enough. There's room on the table now. Say it.", next:1 } },
        { approach:'blunt', line:"\"You don't want it. It's not a story with a soft side.\"",
          land:{ reply:"\"I didn't ask for soft. I asked for true.\" {npc} folds their hands and waits, the way family waits — like they've got all night and nowhere they'd rather lose it.", next:1 } },
        { approach:'probing', line:"Ask why it has to be tonight.",
          land:{ reply:"\"Because I'm not getting younger and you're not getting safer,\" {npc} says, \"and I'm tired of loving the parts of you I'm allowed to see. Tonight. Please.\" The please does it.", next:1 } },
          ] },
        { choices:[
        { approach:'probing', gate:'trauma', line:"Finally say the thing about {trauma}. At a noodle counter, of all places.",
          land:{ reply:"It lands hard and quiet, the thing about {trauma}, said all the way through for the first time. {npc} doesn't recoil. {npc} reaches across the cold bowls, takes {me}'s hand, doesn't let go. \"I've got you. Should've had you the whole time.\"", ev:32, fl:'ARC_UNLOCKED' } },
        { approach:'warm', line:"Get most of the way there. Stop short of the worst of it.",
          land:{ reply:"You give {npc} the shape of it, the edges, not the center. {npc} nods slow. \"More than I had. Keep the rest till you can carry it across the table. I'll be in the booth.\" Closer. Not all the way.", ev:31 } },
          ] }
      ] },
    { id:'diner.the_call_home', venue:'diner', kind:'kin', req:{minTier:2, maxTier:3},
      beats:[
        { open:[
            "{npc} sets a battered handset on the table next to the broth. \"There's people back in {home} who still ask after you. Same number it always was. I'm not dialing it for you. But it's there.\"",
            "Halfway through the bowl, {npc} says it plain. \"They had a service for you, back home. Empty box. The number that called it in is still good, if you ever wanted to tell them otherwise.\"",
            "{npc} slides a folded scrap across the formica. A number, a name from {home}. \"They think you're dead. You could leave it that way. Cleaner, maybe. Your call.\""],
          choices:[
        { approach:'warm', line:"Ask {npc} to tell {me} who's still left back in {home}.",
          land:{ reply:"{npc} runs the short list. Shorter than it was. A&O thinned it the way they thin everything. \"Not many. But the ones left would want to hear your voice. Not a casualty form.\"", next:1 } },
        { approach:'blunt', line:"\"Easier for them if I stay dead. You know what I came back as.\"",
          land:{ reply:"\"I know exactly what came back,\" {npc} says, not flinching. \"And I'm still sitting here. So's that number.\" The handset doesn't move. Neither do you.", next:1 } },
        { approach:'probing', line:"Ask why {npc} kept the number working all this time.",
          land:{ reply:"\"In case the box was wrong,\" {npc} says. \"It was wrong once. Figured I'd leave the line open for the next time it was.\" The broth goes cold while the handset sits there.", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Pick up the handset. Let {npc} hear {me} say {me}'s still breathing.",
          land:{ reply:"You dial with {npc} watching. Somebody back in {home} answers, goes quiet, then says your name like it costs them. You don't say much. You don't have to. {npc} just nods, like a debt got paid down a little.", ev:34 } },
        { approach:'blunt', line:"Leave the handset on the table. \"Not tonight. Maybe not ever. But you can stop hiding it.\"",
          land:{ reply:"{npc} pockets it without argument. \"It'll be in my coat. You decide.\" Not the call. But you stopped pretending the line wasn't there. {npc} takes the smaller thing and doesn't push for the larger.", ev:33 } },
          ] }
      ] },
    { id:'diner.the_door', venue:'diner', kind:'kin', req:{minTier:4, maxTier:4},
      beats:[
        { open:[
            "Last bowl of the night. {npc} sets a key on the formica and slides it the length of the counter, slow, so {me} can stop it or not. \"Place back in {home}. It's standing again. Yours, if you want a door that isn't a barracks.\"",
            "{npc} doesn't touch the broth. Just sets a key down between you. \"Fixed up the old place. Took me years. There's a door in {home} again with your name on the lease. Take it or leave it on the counter. Either way, I had to offer.\"",
            "{npc} waits till the last bowl's cleared, then puts a key on the table. \"You spent the whole war becoming the enemy to win it. Come home. There's a place that'll let you just be the {rel} again.\""],
          choices:[
        { approach:'warm', line:"Cover the key with {me}'s hand before it stops moving.",
          land:{ reply:"{me}'s hand closes over the key while it's still sliding. {npc} lets out a breath held for years. \"Good,\" is all. Whatever the war does next, it can't reach this. There's a door back in {home}, and it's {me}'s.", ev:35, fl:'CLOSEST', fx:{t:'capstone'} } },
        { approach:'probing', line:"Ask {npc} why they held the place through all of it, even the years they couldn't stand {me}.",
          land:{ reply:"\"Because I always meant to give it back,\" {npc} says, simple. \"Even when I couldn't stand you. Even then.\" {me} takes the key. Someone held the door the whole time {me} was gone, and never said so till now.", ev:35, fx:{t:'capstone'} } },
          ] }
      ] },
    // --- club/friend (multi-beat) ---
    { id:'club.same_war', venue:'club', kind:'friend', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{them} drops onto the next stool, clocks how {me} read the door before the drink, and lifts a glass an inch. \"Easy. Same war, probably.\"",
            "The bass is too loud for talk, so {them} just points two fingers at {me}'s drink, then their own. \"You buying or am I.\"",
            "{them} got the last good stool and slides over a half-inch anyway. \"Plenty of bar. You've stood in worse lines than this one.\""],
          choices:[
        { approach:'warm', line:"Buy the round. Let {them} talk first.",
          land:{ reply:"{them} doesn't make {me} ask twice. Drinks come, the bass eats the awkward part, the talking starts on its own.", next:1 } },
        { approach:'probing', line:"Ask {them} which front they came off of.",
          land:{ reply:"{them} names it. {me} names {me}'s. Different ends of the same machine. Close enough to drink on.", next:1 } },
        { approach:'blunt', line:"\"I don't do the catch-up thing.\"", check:true,
          land:{ reply:"\"Didn't ask you to.\" {them} drinks. \"Sit there quiet, then. Free country, or what's left of it.\" The quiet turns out fine.", next:1 },
          miss:{ reply:"It comes out colder than the bass deserves. {them} shrugs and turns to the room. {me} drinks alone, which was the plan, and the plan's worse than {me} remembered.", pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Trade the one op you both probably touched.",
          land:{ reply:"No shared roster, but a shared coordinate — some godforsaken ridge you both crawled off of, different years. Something clicks.", ev:36 } },
        { approach:'probing', line:"Ask what {them} did before the company found them.",
          land:{ reply:"Same kind of hard, different gutter. The drinks go down easier with nobody pretending otherwise.", ev:36 } },
          ] }
      ] },
    { id:'club.leftovers', venue:'club', kind:'friend', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "A chromed merc drifts past, humming a song nobody's written yet — dead rockstar wired in behind his eyes, they say. {them} watches him go. \"This place gets all the leftovers. Us included.\"",
            "{them} tips a glass at the merc with the borrowed voice in his skull, then back at {me}. \"Everybody in here's running on somebody else's leftovers. You drinking yours or nursing it?\"",
            "{them} kicks the next stool out. \"Last quiet pocket in the noise. Strangers, then. For now.\""],
          choices:[
        { approach:'warm', line:"Order two of the worst drinks in the place. Make {them} suffer one.",
          land:{ reply:"The drinks are an insult. {me} makes {them} finish theirs. {them} does, out of spite, and the spite's almost fun.", next:1 } },
        { approach:'probing', line:"Ask if {them} ever found a city that felt like the lights came back on.",
          land:{ reply:"\"No.\" {them} turns the glass. \"But the noise here covers the part of my head that won't shut up. So.\"", next:1 } },
        { approach:'blunt', line:"\"Half this room's wearing a dead man's voice. We fit right in.\"", check:true,
          land:{ reply:"{them} snorts. \"Speak for yourself. I'm only haunted by the usual.\" Bleak enough to drink to.", next:1 },
          miss:{ reply:"{them} lets it sit, then turns back to the bass. The merc with the borrowed voice moves on. So does the moment.", pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Trade the cheapest good night either of you remembers from before.",
          land:{ reply:"{them} digs one up. {me} matches it. Two leftovers comparing the scraps the war didn't get to. It's not much. It's more than this dump usually gives.", ev:38 } },
        { approach:'probing', line:"Ask what {them} would do if the noise ever stopped for good.",
          land:{ reply:"\"Wouldn't know what to do with the quiet,\" {them} admits. \"Probably go looking for the next loud room.\" {them} lifts the glass. {me} lifts back.", ev:37 } },
          ] }
      ] },
    { id:'club.scar_count', venue:'club', kind:'friend', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{them} saved {me} a seat and shoves a drink over before {me} sits. \"You came off {lastmap} looking like {lastmap} came off worse. Talk.\"",
            "{them}'s two in and grinning at nothing. \"Tell me a good one. Been counting the bad ones all week, the math's depressing.\"",
            "\"Sit,\" {them} says, kicking the stool out. \"Loud in here. Easier to say the ugly stuff when the bass eats half of it.\""],
          choices:[
        { approach:'warm', line:"Trade the war. The absurd parts first.",
          land:{ reply:"You start dumb — a requisition that came in wrong, an officer who saluted a vending machine. {them} matches you. The laughing's real, which surprises you both.", next:1 } },
        { approach:'blunt', line:"\"You first. You're the one grinning.\"", check:true,
          land:{ reply:"\"Fine.\" {them} tells one. It's not funny, it's just true, and the true version earns the next round.", next:1 },
          miss:{ reply:"The grin slips. \"Forget it.\" The story goes back wherever {them} keeps it. The bass fills the gap.", next:2 } },
          ] },
        { choices:[
        { approach:'probing', line:"Ask {them} which scar they tell people came from a bar fight.",
          land:{ reply:"{them} taps the wrong one — the easy lie — then taps the real one and says nothing. {me} does the same. Two people who quit explaining themselves to anyone but each other.", ev:39 } },
        { approach:'warm', line:"Tell {them} the one you don't usually finish.",
          land:{ reply:"{me} finishes it this time. {them} doesn't fix it or flinch — just nods, like a debt logged. Lighter, said to the one person who gets it.", ev:40 } },
          ] },
        { choices:[
        { approach:'warm', line:"Drop it. Just drink with {them} till the song turns over.",
          land:{ reply:"No stories. Two glasses, a bad song, and neither of you leaving first. Does more than talking would have.", ev:39 } },
        { approach:'blunt', line:"Nothing. Let the silence ride and the drinks empty.",
          land:{ reply:"{them} lets the quiet work. The week doesn't shrink, but it gets carried by two for an hour.", pts:0 } },
          ] }
      ] },
    { id:'club.fallen_we_knew', venue:'club', kind:'friend', req:{minTier:1, maxTier:3, need:'fallen'},
      beats:[
        { open:[
            "{them} sets a third glass on the table nobody's going to drink, and doesn't explain it. {me} knows the shape of it. \"{fallen},\" {them} says. Just the name. \"You knew them too.\"",
            "{them} catches {me} staring at nothing and reads it right. \"You're somewhere else. Bet I know who with.\" {them} slides a glass over for the one who isn't here.",
            "\"They'd have hated this place,\" {them} says over the bass. \"{fallen}. Too loud. Too many strangers.\" {them} orders one anyway, and leaves it."],
          choices:[
        { approach:'warm', line:"Touch the third glass. \"They'd have hated us missing them more.\"",
          land:{ reply:"{them} almost laughs and almost doesn't. \"They'd have called us soft.\" The glass stays full. So does the space they left.", next:1 } },
        { approach:'probing', line:"Ask {them} where they were standing when {fallen} went down.",
          land:{ reply:"{them} tells {me}, to the meter. {me} tells {me}'s. Two angles on the same hole in the world. Nobody had the one that mattered.", next:1 } },
        { approach:'blunt', line:"\"Don't. I came here to not do this.\"",
          land:{ reply:"{them} pulls the third glass back, slow. \"Another night.\" Doesn't drink it. Doesn't pour it out either.", next:2 } },
          ] },
        { choices:[
        { approach:'warm', line:"Say the thing about {fallen} only the two of you would believe.",
          land:{ reply:"{me} tells the story that sounds like a lie to anyone who wasn't there. {them} was there. \"Yeah. They really did that.\" {fallen}'s realer in this booth than anywhere in the city tonight.", ev:42 } },
        { approach:'blunt', line:"\"We don't talk about whose call it was. Not ever.\"",
          land:{ reply:"{them} holds {me}'s eyes, doesn't blink. \"No. We don't.\" Some things you guard together so neither carries them alone. The glass stays where it is.", ev:41 } },
          ] },
        { choices:[
        { approach:'warm', line:"Lift {me}'s own glass at the full one. Don't say the name out loud.",
          land:{ reply:"{them} lifts back. No toast — the bass would eat it. Just two people letting the dead sit at the table a while longer.", ev:41 } },
        { approach:'probing', line:"Ask if {them} still hears from anyone else off the old roster.",
          land:{ reply:"\"You. That's the list.\" {them} says it flat. The roster's down to two stools and a full glass. {me} doesn't fill the silence. {them} doesn't need {me} to.", pts:0 } },
          ] }
      ] },
    { id:'club.bad_call', venue:'club', kind:'friend', req:{minTier:2, maxTier:3},
      beats:[
        { open:[
            "{them} isn't grinning tonight. Turns a glass, doesn't drink it. \"There's an op I don't tell people about. You're not people anymore. So.\"",
            "{them} waves the next round off and leans in under the bass. \"You ever make a call you'd still make, knowing what it cost? Got one. Want to say it to someone who won't lie to me about it.\"",
            "The booth's the only dark in the place, and {them} steers {me} into it. \"No stories tonight. One thing. The thing.\""],
          choices:[
        { approach:'warm', line:"\"Say it. I'm not going anywhere.\"",
          land:{ reply:"{them} says it — the order that was right on paper and buried people who trusted them. Watches {me} for the flinch. {me} doesn't give it.", next:1 } },
        { approach:'probing', line:"Ask {them} the question they're circling instead of waiting for it.",
          land:{ reply:"\"Would you have made it different.\" {them} lands on the real one. \"That's it. That's what I can't put down.\" {them} lays the whole call out, flat, for {me} to weigh.", next:1 } },
        { approach:'blunt', line:"\"If you're confessing, don't expect absolution. I don't have any.\"", check:true,
          land:{ reply:"\"Good. Absolution's for people who get to forget. I want a witness.\" {them} tells it knowing {me} won't soften it.", next:1 },
          miss:{ reply:"{them} closes back up like a door. \"Right. My mistake.\" Drinks the round {them} waved off and the thing goes back unsaid.", next:2 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {them} the truth: you'd have made the same call. And carried it the same.",
          land:{ reply:"{them} lets out a breath {them}'s looked like {them} held for years. \"Then we carry the same one.\" Said it to {me} because {me} won't drop it or absolve it. The bad call's got two names on it now.", ev:43, fl:'ARC_UNLOCKED' } },
        { approach:'probing', line:"Ask who {them} would've traded to take it back — and watch {them} find no one.",
          land:{ reply:"{them} runs the math {them}'s run a thousand times and lands nowhere clean. \"No trade. There never was.\" {me} doesn't fix it. {me} just won't let {them} sit with it solo from here.", ev:44 } },
          ] },
        { choices:[
        { approach:'warm', line:"\"When you're ready. I'll be on this stool.\"",
          land:{ reply:"{them} nods at the bottles. \"Yeah. You will.\" Didn't land tonight, but {them} knows where {me} sits now.", pts:0 } },
        { approach:'blunt', line:"Let it go. Order for both of you and talk about anything else.",
          land:{ reply:"You bury it under noise and a worse song. Still unsaid, but you walked it back from the edge together.", ev:43 } },
          ] }
      ] },
    { id:'club.couldnt_save', venue:'club', kind:'friend', req:{minTier:3, maxTier:3},
      beats:[
        { open:[
            "{them} is staring at {them}'s own hands like they belong to someone else. \"There was one I couldn't reach. Had the angle, ran out of seconds. You ever run out of seconds?\"",
            "\"I keep a list,\" {them} says over the bass, not looking up. \"Ones I got out. Ones I didn't. The didn't list is shorter. Worse, because I remember every one.\"",
            "{them} clocks {me} sitting and skips the small talk. \"Only one I'd say this to. There's a kid — was a kid — I couldn't get to in time.\""],
          choices:[
        { approach:'warm', line:"\"Tell me their name. I'll carry it too.\"",
          land:{ reply:"{them} says the name like it costs blood, because it does. {me} says it back, once, so it lands somewhere besides {them}'s own skull.", next:1 } },
        { approach:'probing', line:"Ask {them} what {them} would've needed — gear, time, an order that came faster.",
          land:{ reply:"{them} lists it: ten more seconds, a line that didn't go dead, a road that wasn't cut. None of it {them}'s to give. {them} blames {them}self anyway, the way you do.", next:1 } },
        { approach:'blunt', line:"\"You couldn't. That's not the same as you didn't.\"", check:true,
          land:{ reply:"{them} flinches, then lets it in. \"...Say that again.\" {me} does. {them} doesn't believe it yet. But {them} stops looking at {them}'s hands.", next:1 },
          miss:{ reply:"{them} hears a let-off and bristles. \"Don't excuse it for me.\" Guards the guilt like the last thing {them}'s got. Maybe it is. {me} backs off.", next:2 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {them} the one you couldn't reach. Trade ghost for ghost.",
          land:{ reply:"{me} gives {them} {me}'s own — the reach that came up short — so {them}'s not the only one at the table holding a name. {them} takes it like it matters that {me} trusted them with it. Two short lists, leaned against each other.", ev:46, fl:'CLOSEST' } },
        { approach:'probing', line:"Ask what {them} thinks the one they lost would want from them now.",
          land:{ reply:"{them} sits with it a long time under the bass. \"Not this. Not me half-dead on a stool.\" Not forgiveness. The first inch toward standing up under it. {me} stays for the inch.", ev:45 } },
          ] },
        { choices:[
        { approach:'warm', line:"Don't push the guilt. Just refuse to let {them} drink it alone tonight.",
          land:{ reply:"{me} matches {them} drink for drink and skips the consoling thing {them} doesn't want. By the dregs {them}'s not fixed, but {them}'s not solo, and tonight that's the only honest offer.", ev:45 } },
        { approach:'blunt', line:"\"Keep the list, then. But you're not the only name on it as of now.\"",
          land:{ reply:"{them} looks at {me} like {me} just signed something binding. \"...Yeah. Alright.\" The guilt stays {them}'s. The carrying gets split.", pts:0 } },
          ] }
      ] },
    { id:'club.no_one_else', venue:'club', kind:'friend', req:{minTier:3, maxTier:4},
      beats:[
        { open:[
            "{them} has the seat already, two drinks already, eyes on the door already — covering it so {me} doesn't have to. \"Sit. I've got the room.\"",
            "Same bass it's always been. {them} just tips a glass at {me}, no word. You've run out of things you need to say to start. That's the point of {them} now.",
            "{them} saved {me} the stool that watches the floor, like {them}'s done a hundred times. It's settled. {them} nods {me} into it."],
          choices:[
        { approach:'warm', line:"Sit. Tell {them} you stopped counting exits when they're in the room.",
          land:{ reply:"{them} goes still a second, then drinks to cover it. \"Don't get soft on me.\" But {them} doesn't argue it. {them} watches the door for both of you, like always.", next:1 } },
        { approach:'probing', line:"Ask {them} when the two of you stopped needing the noise to talk.",
          land:{ reply:"\"Couldn't tell you.\" {them} turns the glass. \"Somewhere between the bad call and now, the quiet stopped being the enemy.\" You sit in the proof of it.", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"\"Whatever the city does next — I want you on the wrong end of it with me.\"",
          land:{ reply:"{them} lets the grin all the way out, the real one the war took. \"The wrong end. Where else.\" Not said back word for word. Doesn't have to be.", ev:48 } },
        { approach:'blunt', line:"\"You're the last good thing in this burned-down dump and we both know it.\"", check:true,
          land:{ reply:"{them} doesn't deny it. \"Low bar. But yeah.\" Clinks {me}'s glass hard enough to spill. The one warm thing the city hadn't taken — now it knows it's mutual.", ev:47 },
          miss:{ reply:"It lands heavier than the bass can cover and {them} looks away. \"Don't make it a eulogy. We're not dead yet.\" Fair. You drink instead.", pts:0 } },
          ] }
      ] },
    { id:'club.next_bad_call', venue:'club', kind:'friend', req:{minTier:4, maxTier:4},
      beats:[
        { open:[
            "Last call, and the bass finally drops to something you could talk under. {them} sets two glasses down. \"So. Whatever's coming. Same way?\"",
            "The place is thinning. {them} clocks the door one more time, then stops, because {me}'s got it now and {them} knows it. \"That's new. Trusting someone else to watch the door.\"",
            "{them} waits till the floor clears. \"There's always a next bad call. You know there is. I'm not doing the next one with strangers.\""],
          choices:[
        { approach:'warm', line:"\"The next bad call, the next bad roster, the next bad city — you and me. No one else.\"",
          land:{ reply:"{them} doesn't say it back. {them} never says it back. Just slides {me}'s glass against {me}'s hand and holds it there a beat too long. That's the whole vow. Whatever the war does next, it does it to the two of you.", ev:49, fl:'CLOSEST', fx:{t:'capstone'} } },
        { approach:'probing', line:"Ask if {them} ever figured it'd be one other survivor that made the wreckage livable.",
          land:{ reply:"\"No,\" {them} says, honest to the end. \"Figured I'd burn out alone like the rest. Then there was you, facing the same door.\" {them} lifts the glass. \"Next bad call, we take it together. No one else gets a vote.\" The city took everything but this.", ev:50, fl:'CLOSEST', fx:{t:'capstone'} } },
          ] }
      ] },
    // --- club/rival (multi-beat) ---
    { id:'club.deadweight', venue:'club', kind:'rival', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{them} doesn't move off the stool {me} was headed for. \"Plenty of room. You walked the whole length to crowd me.\"",
            "{them} clocks {me} in the bottle-mirror and keeps drinking. \"Long bar. You picked my three feet of it.\""],
          choices:[
        { approach:'blunt', line:"Take the next stool over. Don't give the inch.", check:true,
          land:{ reply:"{them} grunts, stays put. \"Stubborn.\" Neither slides off. Not warmth. But it holds.", next:1 },
          miss:{ reply:"It reads as a shove. \"Easy.\" {them} turns a shoulder. The three feet go cold.", next:1, pts:0 } },
        { approach:'probing', line:"Ask {them} which front spat them out.",
          land:{ reply:"{them} names it. {me} names {me}'s. Same war, wrong ends. Doesn't make {them} family. Makes {them} someone {me} can't write off.", next:1 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Tell {them} {me} doesn't drink with people {me} respects, and {me}'s still on this stool.",
          land:{ reply:"{them} holds the look, then drinks. \"Same.\" Said like a complaint. Whatever that is, you both know it's real.", ev:51 } },
          ] }
      ] },
    { id:'club.samefront', venue:'club', kind:'rival', req:{minTier:0, maxTier:2},
      beats:[
        { open:[
            "{them} sets the glass down hard enough to carry over the bass. \"Didn't peg you for the type that drinks where I drink.\""],
          choices:[
        { approach:'blunt', line:"Match {them}'s drink. Order the same. Say nothing.", check:true,
          land:{ reply:"{them} watches the pour, lifts the glass an inch. Not a toast. A line drawn. {me} lifts back.", next:1 },
          miss:{ reply:"{them} leaves before the second round. {me} drinks both. Some standoffs you win alone.", next:2, pts:0 } },
        { approach:'probing', line:"Ask {them} who they lost to make them this much of a problem.",
          land:{ reply:"{them} goes flat. \"Everyone. Same as you.\" The needle skips. Not a thaw. An accounting.", next:1 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Tell {them} {me} doesn't like them and isn't going to start pretending.",
          land:{ reply:"\"Good. I can drink next to honest.\" Two people who won't bother lying to each other. It works.", ev:52 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Let it go. Some nights the bar wins.",
          land:{ reply:"{me} finishes both glasses and walks. {them} did the same thing once, probably. Nothing settled. Nothing owed." } },
          ] }
      ] },
    { id:'club.thetrade', venue:'club', kind:'rival', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "It stops being about the drinks. {them} jabs a knuckle at the bottles. \"Your end of the war. You made it cheap for them to win.\""],
          choices:[
        { approach:'blunt', line:"Tell {them} everyone left upright made the same trade — including {them}.", check:true,
          land:{ reply:"{them} wants to swing and doesn't. \"...Yeah. We did.\" The fight bleeds out of it. Nobody clean in this room.", next:1 },
          miss:{ reply:"It lands like blame. \"Don't hang it on me.\" Uglier first, then. Let it go ugly.", next:1, pts:0 } },
        { approach:'probing', line:"Ask {them} who they're really still angry at.",
          land:{ reply:"\"Not you.\" {them} says it like it costs something. \"The ones who bought what we sold them.\" The bottles, not each other.", next:1 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Say it plain: A&O owns the wreckage now, and the two of you laid every brick.",
          land:{ reply:"\"They sell resurrection off our dead and call it a service. We're the only ones in this city who remember the dead were people.\" Neither drinks for a while. That silence is the closest thing to trust either of you has left.", ev:53 } },
          ] }
      ] },
    { id:'club.thecall', venue:'club', kind:'rival', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{them} is still chewing on {lastmap}. \"You'd have called it the other way. I can read it on you from here.\""],
          choices:[
        { approach:'blunt', line:"Tell {them} {me} has made worse calls and is still on this stool, so skip the lecture.", check:true,
          land:{ reply:"{them} goes still. \"...So have I.\" The needle drops out of the song. Two who've signed their name under a body count.", next:1 },
          miss:{ reply:"It comes out a brag. \"Proud of that, are you.\" The table ices over. {them} isn't wrong to.", next:1, pts:0 } },
        { approach:'probing', line:"Ask {them} what call still wakes them up.",
          land:{ reply:"{them} doesn't answer fast. \"The one I got right. Cost the same as the wrong ones.\" {me} knows that math.", next:1 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Tell {them} {me} would hold their flank in a fight, and that's the highest thing {me} has left to give.",
          land:{ reply:"{them} nods once, hard. \"Don't say it twice. I'll hold you to it the rest of my life.\" A vow with the friction left in.", ev:54 } },
          ] }
      ] },
    { id:'club.crossed', venue:'club', kind:'rival', req:{minTier:2, maxTier:3, need:'fallen'},
      beats:[
        { open:[
            "{them} says {fallen}'s name out loud, slow, and lets it sit on the table between you. Everything else in the room drops away."],
          choices:[
        { approach:'blunt', line:"Don't deny it. \"Yeah. That one's mine. Now what.\"", check:true,
          land:{ reply:"{them} got the truth, not a swing. \"...Then carry it the way I carry mine.\" The line you crossed is the one {them} lives behind too.", next:1 },
          miss:{ reply:"{me} snarls, {them} snarls, it nearly goes to fists. Then {me} stops. Nothing here to win. \"Sit down. We're the same animal.\"", next:1, pts:0 } },
        { approach:'probing', gate:'crime', line:"Ask {them} why they put {fallen}'s name in {me}'s face like that — and then tell them about the thing about {crime}.",
          land:{ reply:"\"Everyone else lies to you about it.\" {them} doesn't blink at the rest. \"Figured you'd want one person who won't.\" The cruelest mercy {me}'s been handed in this city.", next:1 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Tell {them} {me} will never like them — but {me} trusts them with the worst of it before anyone {me} does like.",
          land:{ reply:"\"Worst thing anyone's ever said to me. And the only one I believe.\" The respect of someone who'll never flatter you. The easy ones never give you this.", ev:55, fl:'ARC_UNLOCKED' } },
          ] }
      ] },
    { id:'club.nemesis', venue:'club', kind:'rival', req:{minTier:4, maxTier:4},
      beats:[
        { open:[
            "{them} has the corner booth, two bad drinks poured, one shoved across at {me}. \"Sit. We're not friends. Drink anyway.\""],
          choices:[
        { approach:'blunt', line:"Sit. Tell {them} {me} would take the next bad call beside them and nobody softer.", check:true,
          land:{ reply:"\"I'd take it beside you too. Don't let that go to your head.\" No warmth in the words. All of it underneath them. It holds because neither of you ever lied to build it.", next:1 },
          miss:{ reply:"Blunter than {them} braced for. A short laugh. \"Knew you couldn't say a kind thing straight.\" The edge was always the point.", next:1 } },
          ] },
        { choices:[
        { approach:'blunt', line:"Make it plain: enemies who'd bleed out for each other. Drink to it once, then never say it again.",
          land:{ reply:"\"To being too mean to lose each other.\" You drink. The war took the unit, the company, {home}, everyone who was easy to love. It couldn't get its hands on this one — the bond made out of friction and kept honest the whole way down.", ev:56, fl:'CLOSEST', fx:{t:'capstone'} } },
          ] }
      ] },
    // --- club/romance (multi-beat) ---
    { id:'club.held_look', venue:'club', kind:'romance', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "The bass is doing most of the talking. {them} catches {me} looking and doesn't look away. Holds it a beat past where strangers usually quit.",
            "{them} is two stools down, neon cutting their face into pieces. They glance over. {me} glances back. The look runs longer than it should, and neither of you fixes it.",
            "Across the table {them} lifts their drink an inch — not a toast, just an excuse to keep watching {me} over the rim. {me} catches it. Neither blinks."],
          choices:[
        { approach:'warm', line:"Hold the look. Let the bass cover for both of you.",
          land:{ reply:"Nobody says anything. There's nothing to say yet. The room thins out around the two of you, and {me} stays in it a while longer.", next:1 } },
        { approach:'probing', line:"Tip your glass at {them}. Make them speak first.",
          land:{ reply:"\"You're staring,\" {them} says, not like a complaint. \"So are you,\" {me} says. {them} doesn't argue it.", next:1 } },
        { approach:'blunt', line:"Look away first. Pretend it was nothing.", check:true,
          land:{ reply:"{me} breaks it off, casual. {them} lets {me} have the out — then catches {me} looking again two minutes later. Some things don't take the hint.", next:1 },
          miss:{ reply:"{me} looks away too fast, and {them} clocks exactly why. A small thing, given away. The bass takes the rest.", next:1, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Move down a stool. Close the gap, say nothing about it.",
          land:{ reply:"{me} sits where the look doesn't have to travel so far. {them} makes room without making a thing of it. The night goes quiet in the middle of all that noise.", ev:57 } },
        { approach:'probing', line:"Ask {them} who they were watching the door for.",
          land:{ reply:"\"Nobody,\" {them} says. Then, quieter: \"Not till you sat down.\" {me} lets that lie where it fell and doesn't pick at it.", ev:58 } },
          ] }
      ] },
    { id:'club.bad_sleeper', venue:'club', kind:'romance', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "Closing in on three and {them} is still here, same as {me}. \"You don't go home either,\" they say. Not a question. \"The quiet's worse than this.\"",
            "{them} drops onto the next stool, eyes red at the edges. \"You've got the no-sleep look. I know it. I wear it.\"",
            "\"Place is dead, bartender wants us gone, and we're both still on these stools,\" {them} says. \"Tells you something. Or tells you about us.\""],
          choices:[
        { approach:'warm', line:"Say the noise is easier to sit in than the silence at the end of it.",
          land:{ reply:"\"Easier,\" {them} agrees. \"At least in here something's loud enough to drown the rest.\" The drinks come. The talk goes where it wants — toward each other, mostly.", next:1 } },
        { approach:'blunt', line:"Tell {them} you don't usually let anyone sit this close this late.", check:true,
          land:{ reply:"\"Yeah, well.\" {them} doesn't move. \"Neither do I. So we're even.\" {them} stays exactly where they are, and {me} doesn't ask them to go.", next:1 },
          miss:{ reply:"It comes out harder than {me} meant, an edge on it. {them} just nods, slow. \"Loud and clear.\" They don't leave, either.", next:1, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Trade the small stuff. What keeps you up. What used to.",
          land:{ reply:"Not the war. The edges of it. {them} laughs at the wrong thing, the way only somebody who was there can. {me} stays past last call without clocking it.", ev:59 } },
        { approach:'probing', gate:'trauma', line:"Tell {them} the thing about {trauma} — just to see if it scares them off.",
          land:{ reply:"{them} doesn't flinch and doesn't try to fix it. \"Mine's worse,\" they say, almost level. \"We'll compare another night.\" Nobody's let {me} keep a thing without trying to mend it in a long time.", ev:60 } },
          ] }
      ] },
    { id:'club.smoke_break', venue:'club', kind:'romance', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{them} jerks their head at the fire door. \"Air. Before the bass rearranges my teeth.\" Doesn't wait to see if {me} follows. Doesn't have to.",
            "Out where the alley swallows the music, {them} is already leaning on the wall. \"Knew you'd come out. Nobody stays in there for the company.\""],
          choices:[
        { approach:'warm', line:"Lean on the same wall. Let the cold and the quiet do the talking.",
          land:{ reply:"Two soldiers in a wet alley, not saying much, neon bleeding through the grime. It's the closest thing to settled {me} has felt in a long stretch of not feeling it.", next:1 } },
        { approach:'probing', line:"Ask why {them} really came out here.",
          land:{ reply:"\"Couldn't hear myself think.\" {them} looks sideways at {me}. \"Could hear you fine, though.\" And lets that hang in the cold.", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Stand close enough that the cold stops mattering.",
          land:{ reply:"{them} doesn't move away. {me} doesn't either. Nobody names what the closeness is for. The bass leaks through the door and covers the rest.", ev:61 } },
        { approach:'blunt', line:"Tell {them} this is the only good thing the city hasn't found a price for yet.", check:true,
          land:{ reply:"{them} goes still. \"Then we don't tell anyone,\" they say. \"They'd find one.\" {me} agrees without a word. Some things you guard by keeping quiet about them.", ev:62 },
          miss:{ reply:"{them} hears the weight in it and isn't carrying that weight tonight. \"Easy,\" they murmur. Not no. Just — not yet. The cold gets back into the conversation.", ev:61, pts:0 } },
          ] }
      ] },
    { id:'club.leaving_together', venue:'club', kind:'romance', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "Last song. {them} stands, pulls their coat on, and stops at the edge of the table — waiting, not pretending they aren't. \"Walking my way?\"",
            "The lights come up ugly and the night's done. {them} doesn't head for the door alone. They look at {me} first. \"Don't make me ask.\""],
          choices:[
        { approach:'warm', line:"Get your coat. Walk out beside {them}.",
          land:{ reply:"You hit the street together, the bass still ringing in your ears. {them} matches {me}'s pace without thinking about it. Nobody decides where you're going. You just go the same way.", next:1 } },
        { approach:'probing', line:"Ask {them} what they're really asking for.",
          land:{ reply:"{them} shrugs, but it isn't careless. \"Company that doesn't need the lights on to feel safe.\" Then, lower: \"Yours, specifically.\" {me} gets the coat.", next:1 } },
        { approach:'blunt', line:"Say you don't do the walk-someone-home thing.", check:true,
          land:{ reply:"\"Good. Neither do I.\" {them} holds the door. \"So it's not that. Come on.\" And it isn't that. It's something with no name yet, and {me} follows it out.", next:1 },
          miss:{ reply:"{them} takes it at face value and steps back. \"Fair.\" They go alone — but at the door they glance back once, to see if {me} changed {me}'s mind. {me} almost did.", ev:63, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Take the long way. Stretch the walk out.",
          land:{ reply:"You loop the block twice rather than end it. {them} notices and doesn't say so. The place is a wreck and the rain's coming, and {me} would walk it all night anyway.", ev:64 } },
        { approach:'probing', line:"Ask {them} where they actually sleep, when they sleep.",
          land:{ reply:"\"Wherever the door locks twice.\" {them} says it light, but {me} hears the years in it. \"Tonight I'm not in a hurry to get there.\" Neither is {me}.", ev:63 } },
          ] }
      ] },
    { id:'club.the_unspoken', venue:'club', kind:'romance', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{them} is already there, two drinks down, a hand flat on the second stool like it's spoken for. Because it is. Nobody said so. Everybody at the bar knows.",
            "{me} walks in and {them}'s shoulders drop an inch — that small tell of someone who'd been watching the door for exactly {me}. They slide the spare drink over before {me} sits."],
          choices:[
        { approach:'warm', line:"Take the stool that's been waiting. Don't make it a question.",
          land:{ reply:"{me} sits where {me} is expected now. {them} relaxes the rest of the way. There's a whole conversation in the not-talking, and you've both gone fluent in it.", next:1 } },
        { approach:'blunt', line:"Point out the bar's started calling that seat yours.", check:true,
          land:{ reply:"{them} doesn't deny it. \"Let 'em.\" A pause. \"Easier than explaining what it is.\" {me} hasn't got a word for it either. The not-having is its own kind of comfortable.", next:1 },
          miss:{ reply:"{them} stiffens — too soon to say it out loud, even sideways. \"It's a seat,\" they mutter, and waves for another round to bury it. {me} lets them.", next:1, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Sit shoulder to shoulder and let the bad music be enough.",
          land:{ reply:"You don't fill the quiet. You've stopped needing to. {them} leans a degree, {me} leans a degree, and the meaning lives entirely in those two degrees. Nobody names it. It holds anyway.", ev:65 } },
        { approach:'probing', gate:'dream', line:"Tell {them} the thing {me} still wants, under all of it: {dream}.",
          land:{ reply:"{them} listens like it's classified. When {me} finishes, they're quiet a long time. \"First time you've told anyone that?\" {me} nods. \"Then I'll keep it,\" they say. And {me} believes they will.", ev:65 } },
          ] }
      ] },
    { id:'club.naming_it', venue:'club', kind:'romance', req:{minTier:2, maxTier:3},
      beats:[
        { open:[
            "The club's emptying out. {them} turns their glass slow and doesn't drink it. \"We keep ending the night the same place,\" they say, not looking up. \"You going to say what that is, or do I have to.\"",
            "{them} catches {me}'s wrist as {me} reaches for the round — light, just enough to make {me} stop and look. \"Before the bass starts again,\" they say. \"I want to say a thing while it's still quiet enough to hear it.\""],
          choices:[
        { approach:'warm', line:"Say it. Out loud, where the bass can't bury it.",
          land:{ reply:"{me} says the thing neither of you has said. {them} lets out a breath like they'd been holding it since the first held look. \"Yeah,\" they say. \"Yeah. Same.\"", next:1 } },
        { approach:'probing', line:"Ask {them} to say it first.",
          land:{ reply:"{them} almost laughs. \"Coward.\" No heat in it. \"Fine.\" And they say it — plain, no armor on it — then look at {me} like it's {me}'s turn now.", next:1 } },
        { approach:'blunt', line:"Ask why it needs a name at all.", check:true,
          land:{ reply:"\"Because the city names everything else and gets it wrong,\" {them} says. \"I'd rather we got this one right.\" {me} runs out of reasons to keep it nameless.", next:1 },
          miss:{ reply:"It comes out like a wall going up, and {them} reads it as one. \"Right.\" They sit back. \"Forget I said it.\" They don't leave, and the question's still on the table between you.", next:1, pts:0 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {them} this is the one thing you'd actually fight to keep.",
          land:{ reply:"{them} goes quiet, the real kind. \"Everything we ever fought for, somebody else cashed in,\" they say. \"Not this. This one doesn't go on the books.\" {me} reaches across the sticky table, and {them} meets {me} halfway. Whatever it is, it's named now.", ev:66, fl:'ARC_UNLOCKED' } },
        { approach:'blunt', gate:'crime', line:"Lay out the worst of {me} first — what {me} did: {crime} — so they know what they're naming.",
          land:{ reply:"{me} lays it out, the thing from before the company. {them} doesn't pull back. \"I know what we all were,\" they say. \"I'm not naming the soldier. I'm naming you.\" And it holds. Out loud, it holds.", ev:66, fl:'ARC_UNLOCKED' } },
          ] }
      ] },
    { id:'club.passing_through', venue:'club', kind:'romance', req:{minTier:2, maxTier:3},
      beats:[
        { open:[
            "There's a chromed merc passing through tonight — too much hardware, an old dead voice buzzing somewhere behind his eyes, gone before the next song. {them} watches him go and pulls {me} a little closer. \"Easy to end up like that. Just chrome and a dead man's hum. We didn't.\"",
            "{them} is waiting in the booth with two of the worst drinks in the place and a look {me} has learned to read. \"Long week,\" they say. \"Sit on my side.\""],
          choices:[
        { approach:'warm', line:"Slide in on their side. Stop pretending there's a reason to take the other.",
          land:{ reply:"{me} sits where {me} sits now. {them} fits an arm along the back of the booth, not touching, just claiming the air. You've stopped rationing the closeness. It got too expensive to keep saving it up.", next:1 } },
        { approach:'probing', line:"Ask if this scares {them} as much as it scares {me}.",
          land:{ reply:"\"Every day,\" {them} says, no hesitation. \"Lost everyone I ever let this close. So yeah. Most dangerous thing I do.\" A beat. \"Still doing it, though.\" So is {me}.", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Tell {them} you've decided the odds are worth it.",
          land:{ reply:"\"Decided.\" {them} tries the word out like it's heavier than it sounds. \"Me too. Decided a while back. Just didn't have the nerve to say it.\" The bad drinks go warm. Neither of you minds.", ev:67 } },
        { approach:'blunt', gate:'trauma', line:"Show {them} the truth about {trauma} — the part you never let anyone see.",
          land:{ reply:"{me} shows them the worst of it. {them} doesn't look away once. When {me} runs out of words, they take {me}'s hand under the table, out of sight of the room. \"Still here,\" they say. They keep saying it. {me} doesn't quite believe it yet, but {me} stops bracing for them to go.", ev:67 } },
          ] }
      ] },
    { id:'club.devoted', venue:'club', kind:'romance', req:{minTier:4, maxTier:4},
      beats:[
        { open:[
            "The club's nearly dead, the quiet one on the door already pulling the grate — never says a name, just keeps the count of who comes back. {them} doesn't reach for their coat. They reach for {me}'s hand on the table and hold it where anyone can see. No more guarding it.",
            "Last call, and {them} has been quiet all night — the good quiet, the settled kind. Then: \"I want to say the thing soldiers don't say. While we've both still got a tomorrow to say it in.\""],
          choices:[
        { approach:'warm', line:"Tell {them} you'd take the next bad call beside them and nobody else.",
          land:{ reply:"\"I know,\" {them} says. \"I'd take it beside you, too.\" They've stopped flinching when they say what they mean. \"Say the rest of it.\"", next:1 } },
        { approach:'probing', line:"Ask {them} what they want, now that the war's finally let go.",
          land:{ reply:"\"This,\" {them} says. \"A door that locks twice, my back covered, somebody who keeps my name and means it. Stopped wanting more than that a long time ago.\" They look at {me}. \"Didn't think I'd get it.\"", next:1 } },
          ] },
        { choices:[
        { approach:'warm', line:"Say it plain, the whole of it, no armor left.",
          land:{ reply:"{me} says it — all of it, the way you only get to once. {them} doesn't say it back in words. They press their forehead to {me}'s in the dying neon and stay there, and that's the whole of the answer. The city's billed {me} for everything else. It doesn't get this. Two soldiers, one warm thing, kept off the books.", ev:68, fl:'CLOSEST', fx:{t:'capstone'} } },
        { approach:'blunt', line:"Skip the speech. Just don't let go of their hand.",
          land:{ reply:"{me} hasn't got the words and doesn't reach for them. {me} just keeps {them}'s hand in {me}'s and doesn't let the night end on its own. {them} reads it the way only the two of you can. \"Yeah,\" they breathe. \"That's the one. That'll hold.\" The grate comes down. You stay.", ev:68, fl:'CLOSEST', fx:{t:'capstone'} } },
          ] }
      ] },
    // --- club/mentor (multi-beat) ---
    { id:'club.intake', venue:'club', kind:'mentor', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{them} is the new one — clocked the room twice, hasn't touched the drink. {me} takes the next stool. Somebody has to.",
            "The bass pushes {them} onto {me}'s table, war still on them like a coat that doesn't fit. \"You're the one they said to find.\"",
            "{them} hasn't earned the thousand-yard stare yet. Just the flinch. {me} slides the bad drink an inch their way and says nothing for a beat."],
          choices:[
        { approach:'warm', line:"\"Drink it slow. First thing you learn off the line.\"",
          land:{ reply:"{them} drinks slow. Watches {me} like the words might be a trap. \"Nobody told me that part,\" {them} says.", next:1 } },
        { approach:'probing', line:"Ask {them} which front they came off of.",
          land:{ reply:"{them} names it. {me} doesn't name {me}'s back. Just nods. The kid clocks that {me} listened and gave nothing. Files it.", next:1 } },
        { approach:'blunt', line:"\"You flinch like that on a drop, you're meat. Fix it here where it's cheap.\"", check:true,
          land:{ reply:"{them} stiffens, then nods, slow. \"Yeah. Okay.\" Heard it right — a thing that keeps them breathing, not a knock.", next:1 },
          miss:{ reply:"Comes out the wrong shape. {them} goes hard and quiet, reads it as contempt. The bass takes the table back.", next:2, pts:0 } },
          ] },
        { open:[
            "{them} turns the empty glass the way {me} used to. \"So how do you do it. Stay in. Not go—\" Doesn't finish."],
          choices:[
        { approach:'probing', line:"\"You don't stay whole. You stay alive. Two different jobs.\"",
          land:{ reply:"{them} chews on that. \"That supposed to help.\" \"No,\" {me} says. \"It's supposed to make you old.\" That's the whole offer. The kid takes it.", ev:69 } },
        { approach:'warm', line:"\"Pick one person worth coming back for. Doesn't have to be a good reason.\"",
          land:{ reply:"{them} almost laughs. \"That's it.\" \"That's the trick,\" {me} says. The kid looks less like meat. Pointed the right way, which is the most {me} can do tonight.", ev:69 } },
          ] },
        { open:[
            "{them} keeps their back to {me} now, drinking through the silence."],
          choices:[
        { approach:'warm', line:"Let it cool. Buy the next round, no words on it.",
          land:{ reply:"{me} sets it down and walks. {them} doesn't say thanks. But the glass is empty when {me} looks back. A door left open a crack. Enough for one night." } },
          ] }
      ] },
    { id:'club.cover', venue:'club', kind:'mentor', req:{minTier:0, maxTier:1},
      beats:[
        { open:[
            "{them} sits with the door at their back, wrong angle, eyes on the drink. {me} can read the whole room from where the kid put themselves. \"Bad seat.\"",
            "{them} took the open stool fast, never read the room. {me} clocks it before the kid does. \"You let me walk up on you. Twice now.\"",
            "{them} is louder than the bass already, two drinks in, telling a drop they survived too loud. {me} takes the seat {them} should've."],
          choices:[
        { approach:'warm', line:"\"Switch with me. You watch the room, I watch your back.\"",
          land:{ reply:"{them} switches without arguing. Sees the whole floor now. \"Huh.\" Like the city went a degree quieter. First thing {me} ever taught that took.", next:1 } },
        { approach:'probing', line:"Ask what {them} was before the company pulled them in.",
          land:{ reply:"{them} tells it — shorter than the version they'd tell sober. {me} doesn't trade {me}'s own back. Just listens. The kid notices the listening more than any drill.", next:1 } },
        { approach:'blunt', line:"\"In here it costs you a bruised ego. Out there it costs you. Move.\"", check:true,
          land:{ reply:"{them} moves. Doesn't like it. Will like it less the day it saves them, more the day after. \"Fine,\" they grind out, and take the angle.", next:1 },
          miss:{ reply:"{them} bristles, plants harder in the bad seat out of pride. \"I can handle a bar.\" {me} lets it go. Some lessons you wait for the field to teach.", next:2, pts:0 } },
          ] },
        { open:[
            "{them} has the angle now, watching the door like it's already second nature. \"You always sit like this.\""],
          choices:[
        { approach:'warm', line:"\"Every day since {lastmap}. You will too. Stops being a choice.\"",
          land:{ reply:"{them} nods, slow, filing it. \"That's grim.\" \"That's old,\" {me} says. \"Grim's how you get there.\" The kid's learning the grammar of staying alive. That's the whole curriculum.", ev:70 } },
        { approach:'probing', line:"\"What do you do when the door's the only thing you can't watch.\"",
          land:{ reply:"{them} thinks. \"Find someone who'll watch it for me.\" \"Now you've got it,\" {me} says. Doesn't add that the someone gets spent too. The kid'll find that part out alone.", ev:70 } },
          ] },
        { open:[
            "{them} stays in the bad seat, jaw set, proving a point to nobody."],
          choices:[
        { approach:'warm', line:"Drop it. Sit where you can cover them anyway.",
          land:{ reply:"{me} takes the angle the kid won't. Watches the door for both of you, quiet. {them} pretends not to notice. Pretends, but notices. The lesson lands sideways, the way most of them do." } },
          ] }
      ] },
    { id:'club.first_loss', venue:'club', kind:'mentor', req:{minTier:1, maxTier:2, need:'fallen'},
      beats:[
        { open:[
            "{them} is drinking like they mean to drown someone. {me} knows the look. {fallen} went down on {lastmap}, and the kid was close enough to see it. \"It was my call. I sent them left.\"",
            "{them} hasn't said a word since {lastmap}. {me} finds them cornered, knuckles white on the glass. The first one they lost. \"Don't,\" they say before {me} sits. \"Don't tell me it wasn't on me.\"",
            "The kid's staring at nothing, the way you do after the first one. {fallen}'s name is the thing neither of you is saying. {me} sits down inside the silence."],
          choices:[
        { approach:'warm', line:"\"I won't tell you it wasn't your call. It was. Now you carry it. That's the job.\"",
          land:{ reply:"{them} looks up, raw. Expected a lie, got the truth. \"How do you—\" \"You don't put it down,\" {me} says. \"You get strong enough to walk with it.\" The kid hears it. Hates it. Keeps it.", next:1 } },
        { approach:'probing', line:"Ask {them} what {fallen} was like, before.",
          land:{ reply:"{them} talks. Small things — the laugh, the bad coffee, the way {fallen} always took point. {me} lets it run. Doesn't fix it. Some grief only wants a second pair of ears.", next:1 } },
        { approach:'blunt', line:"\"You'll lose more. You don't get to stop because of {fallen}. Neither do they, wherever they are.\"", check:true,
          land:{ reply:"{them} flinches at the name, then steadies on it. \"That's cold.\" \"That's true,\" {me} says. \"Cold keeps. Warm rots.\" The kid sets the glass down. Still here. That was the whole point.", next:1 },
          miss:{ reply:"The name lands like a slap instead of a hand. {them} shoves back from the bar. \"Don't say it like you knew them.\" Walks. {me} lets them go. Grief doesn't take coaching on a schedule.", next:2, pts:0 } },
          ] },
        { open:[
            "{them} is quieter now. The worst of it has gone somewhere heavier and more permanent. \"Does it get easier. Honest.\""],
          choices:[
        { approach:'probing', line:"\"No. Longer list, thicker skin. That's the trade. That's all of it.\"",
          land:{ reply:"{them} nods. Doesn't ask for comfort, because they can tell there isn't any. \"Keep their name, though,\" {me} adds. \"Somebody should.\" {them} writes {fallen} down somewhere only they'll find it. The lesson that costs. Learned.", ev:71 } },
        { approach:'warm', line:"\"It gets familiar. That's the closest thing to easier you'll be offered. Take it.\"",
          land:{ reply:"{them} almost smiles, the broken kind. \"Familiar.\" \"You'll know the weight before you lift it,\" {me} says. \"Means you stop dropping things.\" The kid's older now than an hour ago. {me} did that. There's no clean way to feel about it.", ev:71 } },
          ] },
        { open:[
            "{them} drinks alone at the far end now, having walked off the worst of it."],
          choices:[
        { approach:'warm', line:"Go back over. Say {fallen}'s name once, plain, and nothing else.",
          land:{ reply:"{me} says it. Just the name. {them} looks up — startled someone else carried it too. Doesn't speak. Makes room at the bar. The grief is split now. The only mercy on the menu. It's something." } },
          ] }
      ] },
    { id:'club.dirty_lesson', venue:'club', kind:'mentor', req:{minTier:1, maxTier:2},
      beats:[
        { open:[
            "{them} is wired, proud — pulled off the thing on {lastmap} the way {me} drilled them. \"Clean. In and out. You'd have been proud.\" The bass is loud enough to hide what {me} has to say next.",
            "{them} did everything right on {lastmap} and now wants the gold star. {me} buys the round instead, because the gold star is the lie. \"Sit. I owe you a thing nobody told me.\"",
            "{them} is high on a job done well, the way {me} used to before {me} learned to count the cost. \"Say it,\" the kid grins. \"Say I did good.\""],
          choices:[
        { approach:'warm', line:"\"You did good. Now hear the part that comes with it.\"",
          land:{ reply:"{them}'s grin cools a half-degree. \"There's always a part.\" \"With this company, always,\" {me} says, and the kid leans in instead of away. Wants the truth more than the praise. Bad sign, in the end. But honest.", next:1 } },
        { approach:'probing', line:"Ask {them} how it felt. Really.",
          land:{ reply:"{them} starts to say good, then stops. \"Easy,\" they admit. \"It felt easy.\" \"Hold onto that word,\" {me} says. \"The day it stays easy is the day to worry.\" The kid frowns, not following yet. They will.", next:1 } },
        { approach:'blunt', line:"\"You did exactly what they trained you to. That's not the compliment you think it is.\"", check:true,
          land:{ reply:"{them} blinks. \"...what.\" \"Sit,\" {me} says. \"You're good at this because they built you for it. That's the thing to be scared of.\" The kid sits. Grin gone. Listening now.", next:1 },
          miss:{ reply:"Comes out like {me} is stealing the win. {them} pulls back, stung. \"Forget it. Forget I asked.\" Pride takes the round. The lesson waits for a worse night.", next:2, pts:0 } },
          ] },
        { open:[
            "{them} has stopped grinning. \"So what's the part. The thing nobody told you.\""],
          choices:[
        { approach:'probing', line:"\"The job pays best for the worst you can do. Get good at those and one day you won't notice you became the enemy. We did. Watch for it.\"",
          land:{ reply:"{them} goes still. \"Hell of a thing to tell someone you trained.\" \"Only thing worth telling,\" {me} answers. \"Stay alive. Keep your name. Notice when the company's spending the second one.\" The kid carries that further than any drill. The lesson that costs the teacher.", ev:72 } },
        { approach:'warm', line:"\"Every clean job spends a little of you. Nobody hands you the bill. Keep your own books.\"",
          land:{ reply:"{them} nods slow, the praise forgotten, the warning lodged. \"How do I keep the books.\" \"Count what scares you,\" {me} says. \"The day a thing stops scaring you, that's the page that matters.\" The kid's eyes are older now. That's on {me}.", ev:72 } },
          ] },
        { open:[
            "{them} drinks the praise they came for and not the warning, talking too fast about the next job already."],
          choices:[
        { approach:'warm', line:"Let them have the win tonight. The bill comes either way.",
          land:{ reply:"{me} clinks the bad drink and says \"You did good,\" and means the half that's true. The kid glows. {me} remembers glowing. Remembers what it cost to stop. Some lessons only land on a person who's already paid for them." } },
          ] }
      ] },
    { id:'club.the_truth', venue:'club', kind:'mentor', req:{minTier:2, maxTier:3},
      beats:[
        { open:[
            "{them} isn't a kid anymore — {me} can read it in how they sit, how they clock the room without trying. They've started asking the questions with no clean answer. \"What we did. Back when the company won. Were we the bad guys.\"",
            "{them} corners {me} past the bass, with the look of someone who's done the math and hates the total. \"Straight. No teacher voice. Did we become the thing we were hired to put down.\"",
            "{them} has earned the real conversation and knows it. \"You've dodged this for three rosters. Not tonight. Tell me what the company does to people. To us. All the way down.\""],
          choices:[
        { approach:'warm', line:"\"Sit. You've earned the long answer, not the short one.\"",
          land:{ reply:"{them} sits. Doesn't fidget. Whatever's coming, they came to hear it whole. \"Don't soften it,\" they say. \"I'm past that.\" \"I know,\" {me} says. That's why {me} stopped softening it years ago, only nobody noticed but the kid.", next:1 } },
        { approach:'probing', line:"\"What answer did you already land on, before you asked me.\"",
          land:{ reply:"{them} holds {me}'s eye. \"That we were the worst of it and called it winning.\" \"Then you don't need me,\" {me} says. \"You need to hear it from someone who was there.\" {them} nods. \"That's the part I came for.\" {me} sits down to give it.", next:1 } },
        { approach:'blunt', line:"\"Bad guys is a kid's word. We were the efficient ones. That's worse. And you're good at it because I made you good.\"", check:true,
          land:{ reply:"{them} takes it without flinching — the thing {me} spent years drilling into them. \"Then teach me the last thing. How to stop before it stops me.\" {me} doesn't have a clean answer. Says so. \"Sit,\" {me} adds. \"I'll give you the dirty one.\"", next:1 },
          miss:{ reply:"Comes out as a wall when they needed a door. {them} reads it as another dodge. \"Forget it. I'll figure it myself.\" They leave with the question open. It'll fester. {me} knows — it festered in {me} too.", next:2, pts:0 } },
          ] },
        { open:[
            "{them} sits with it, the whole ugly shape of it, finally named out loud between two people who lived it. \"So say it. All of it.\""],
          choices:[
        { approach:'warm', line:"\"Yeah. We won by becoming the enemy. A&O bought the wreckage and sells it back as salvation. And I trained you into the same machine. That part's on me.\"",
          land:{ reply:"{them} doesn't look away. \"Why tell me. After all this.\" \"Because you're the one I couldn't lie to anymore,\" {me} says. \"Stay alive. Keep your name. Get out cleaner than I did — that's the only order I've got left.\" Something locks between you that doesn't come undone. Not a happy thing. A true one.", ev:73, fl:'ARC_UNLOCKED' } },
        { approach:'probing', line:"\"You can't unknow it now. Good. The ones who stay whole are the ones who didn't look. You looked.\"",
          land:{ reply:"{them} nods, hollowed and steadier for it. \"Doesn't feel like a gift.\" \"It's not,\" {me} says. \"It's a weight. But it's yours, eyes open. The most this war lets you keep.\" The kid {me} raised is grown, and what they grew into is a clear-eyed thing in a machine that wanted neither clear nor eyed. {me} did that. No clean name for how it sits.", ev:73 } },
          ] },
        { open:[
            "{them} drinks alone now, the unanswered question sitting between you like a third stool nobody took."],
          choices:[
        { approach:'warm', line:"Go back. Give them the straight answer you couldn't the first time.",
          land:{ reply:"{me} says it plain this time — that yes, we became the enemy, and yes, {me} made them part of it. {them} listens to the end. \"Took you long enough,\" is all they say. But they stay. The door's open again. Narrower than it would've been." } },
          ] }
      ] },
    { id:'club.torch', venue:'club', kind:'mentor', req:{minTier:4, maxTier:4},
      beats:[
        { open:[
            "A new one across the room tonight — flinching, reading the door wrong, drinking too fast. {them} sees it the same instant {me} does. The kid {me} raised is the senior in the room now. \"That's the look,\" {them} says quietly. \"That was me.\"",
            "{them} carries the war easy these days, the way {me} used to envy. Across the bar a fresh recruit sits back-to-the-door, all nerves and no name yet. {them} reaches for the bad drink to send over before {me} can. \"I've got this one.\"",
            "{them} clocks the scared new face the same instant {me} does, and for once {them} moves first — already up, already knowing the script. {me} stays seated. Hands it over heavier than it looks from the giving end."],
          choices:[
        { approach:'warm', line:"\"Go on. You know the words. I taught you every one.\"",
          land:{ reply:"{them} crosses the floor, sits beside the scared kid, slides the bad drink an inch closer. \"Drink it slow,\" {me} hears them say. \"First thing you learn off the line.\" The exact words, handed down whole — and the whole grim machine handed down with them. The line continues past {me}. Not saved. Just continued. {me} can't tell if that's mercy or just more of the same. Doesn't matter now. It's theirs.", ev:74, fl:'CLOSEST', fx:{t:'capstone'} } },
        { approach:'probing', line:"\"You're better at this than I ever was. How do you keep them alive.\"",
          land:{ reply:"{them} looks at {me} a long moment. \"Same as you kept me. Stay alive yourself so there's someone to come back to.\" The student outran the teacher and circled back to carry them. \"Go home,\" {them} says. \"I've got the bar tonight. And the kid. And the names.\" {me} goes. The list is in steadier hands. The most a survivor gets to call a win, which is to say not much.", ev:74, fl:'CLOSEST', fx:{t:'capstone'} } },
        { approach:'blunt', line:"\"Don't lie to them the way the company lied to us. Truth early. Promise me.\"", check:true,
          land:{ reply:"{them} doesn't blink. \"Been giving them the truth since before you noticed. Where do you think I learned it.\" The line lands and {me} has no answer for it but the obvious one. \"Then I'm done,\" {me} says. \"You've got it.\" \"Had it a while,\" {them} says, not unkind. The handover happened years ago. {me} was just the last to know. Bonded all the way through — and quietly, finally, replaced.", ev:74, fl:'CLOSEST', fx:{t:'capstone'} },
          miss:{ reply:"Comes out like {me} doesn't trust them, after everything. {them} bristles — then lets it go, because they got better at letting go than {me} ever taught. \"I'll do right by them,\" they say. \"Should've trusted you raised someone who would.\" They cross to the scared kid. {me} watches the same words pass to a fresh pair of ears, carried by a hand steadier than {me}'s. Maybe that's the last lesson — knowing when to stop teaching. {me} doesn't feel taught. Just done.", ev:74, fl:'CLOSEST', fx:{t:'capstone'} } },
          ] }
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
    null,   // 9
    null,   // 10
    null,   // 11
    null,   // 12
    null,   // 13
    null,   // 14
    null,   // 15
    null,   // 16
    null,   // 17
    null,   // 18
    null,   // 19
    null,   // 20
    null,   // 21
    null,   // 22
    null,   // 23
    "Ordered for {vet} before they asked. They ate it cold. Neither of us said sorry.",   // 24
    "{vet} gave me one thing about the war. One. I'm keeping it for the next.",   // 25
    "{vet} named their dead at my counter. Flat, no comfort. I heard it anyway.",   // 26
    "{vet} told me the real {fallen} — the laugh, not the rank. I carry the name too now.",   // 27
    "{vet} owned their half of an old one. No ceremony. We crossed it off.",   // 28
    "{vet} let me talk around the old photo. Sat in {home} a while. Didn't bolt.",   // 29
    "{vet} left me the old photo to keep, and promised a new one to set beside it.",   // 30
    "{vet} gave me the edges of it. Told them to keep the rest till they can carry it.",   // 31
    "{vet} finally said the whole thing about {trauma}. Took their hand. Should've had it sooner.",   // 32
    "{vet} left the handset on the table. Didn't call {home}. But quit pretending there was no line.",   // 33
    "{vet} picked up the handset and called {home}. Someone there said their name. A debt came down.",   // 34
    "{vet} caught the key before it stopped sliding. Held that place for them through it all. Worth it.",   // 35
    null,   // 36
    null,   // 37
    null,   // 38
    null,   // 39
    null,   // 40
    null,   // 41
    null,   // 42
    null,   // 43
    null,   // 44
    null,   // 45
    null,   // 46
    null,   // 47
    null,   // 48
    null,   // 49
    null,   // 50
    null,   // 51
    null,   // 52
    null,   // 53
    null,   // 54
    null,   // 55
    null,   // 56
    null,   // 57
    null,   // 58
    null,   // 59
    null,   // 60
    null,   // 61
    null,   // 62
    null,   // 63
    null,   // 64
    null,   // 65
    null,   // 66
    null,   // 67
    null,   // 68
    null,   // 69
    null,   // 70
    null,   // 71
    null,   // 72
    null,   // 73
    null,   // 74
  ],
  // bark[] : "unburdened" selection barks for a veteran whose confidant/kin arc is done (fl&8). Text-only.
  bark: [
    "Settled some things. Lighter now.",
    "Somebody back home knows my name again.",
    "Said the thing out loud. Sky didn't fall.",
  ],
};

if (typeof window !== 'undefined') window.OFFHOURS = OFFHOURS;
