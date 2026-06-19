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
    // compatibility weights (vet↔vet) — RimWorld/Wildermyth. romance is NOT minted at first contact (ohSeedClub
    // makes friend/rival/mentor only); a close FRIENDSHIP drifts into it — see ohRomanceSpark/ohMaybeRomance.
    // A pair's romance "spark" (0..1, NOT gated on a shared hometown) decides HOW FAST a friendship turns, not
    // whether — so it's easy to make almost any two hook up; chemistry just shortens the courtship:
    //   romancePull  = spark baseline (high → most pairs can eventually couple),
    //   romanceFloor = below this spark a friendship stays platonic forever (the rare pair that never clicks),
    //   romanceFast  = spark >= this couples at the first eligible tier (romanceTier),
    //   romanceWarm  = spark >= this couples a tier later; floor..warm is a slow burn one tier on again,
    //   romanceTier  = earliest tier the drift can fire (>=1 so romance is NEVER the opening conversation).
    compat: { home:0.30, dream:0.25, trauma:-0.30, crime:-0.35, type:0.12, friendT:0.33, rivalT:-0.20,
              romancePull:0.38, romanceFloor:0.30, romanceWarm:0.45, romanceFast:0.58, romanceTier:1, mentorGap:3 },
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
    // de-shared dossier lines (E8): each legacy single-beat scene now writes its OWN line instead of reusing 0/5/9/10/11.
    { text:"Sat the slow end of the Late Shift while {npc} owned the worst of the job out loud — somebody has to be at the bar when the news comes in — and stayed in the quiet with her instead of drinking through it." },   // 75  (bar.closing_time)
    { text:"Ate the broth {npc} had already ordered, in the first quiet with them that wasn't a fight — let the bowl go empty while {npc} watched and said nothing. That was plenty." },   // 76  (diner.cold_broth)
    { text:"Told {npc} {me} thinks about {home} more than {me} lets on, and {npc} said it back, quiet — so the old booth held two again." },   // 77  (diner.same_side)
    { text:"Told {them} {me}'d take the next bad call with them and nobody else. {them} didn't say it back, didn't have to. Inseparable, after that." },   // 78  (club.tight)
    { text:"Squared off with {them} over a held stool and a matched drink — not warmth, nothing like it, but a line both could stand on. It held." },   // 79  (club.measure)
    { text:"Split the angle on the door with {them} without a word — backs covered, eyes on the room, the way you both still sit. Nobody named it. It didn't need naming." },   // 80  (club.exits)
    { text:"Covered {them}'s round when the pension came late and waved off the thanks — and after that, who picks up the chits stopped being a question between them." },   // 81  (club.tab, warm)
    { text:"Said it flat to {them} — the company owes them both more than it'll ever pay — and clinked the worst drink in the place against theirs. Two people the same machine used up, splitting what was left." },   // 82  (club.tab, blunt)
    // +++ tripled drop (E9): de-shared, distinct dossier lines per outcome
    { text:"Paid the small tab at the Late Shift and left the unpayable one with {npc}, who keeps the dead on chalk so they still owe the world something." },   // 83
    { text:"Tried to clear a dead regular's tab at the Late Shift; {npc} wouldn't let {me} steal a dead man's debt, just poured the round he never finished." },   // 84
    { text:"Showed {npc} how the old wound still sits wrong, and she showed {me} half of hers — healed crooked, built around the crook, the way survivors do." },   // 85
    { text:"Told {npc} the scar was never the wound — that {trauma} was — and she didn't pretend the skin closing meant the rest had." },   // 86
    { text:"Sat near the empty stool {npc} still pours for at the Late Shift and learned her trick — the hollow a regular leaves behind ends up load-bearing." },   // 87
    { text:"Told {npc} {me} keeps an empty chair of {me}'s own — the one nobody else gets to sit in — and she said everybody who's lost somebody does." },   // 88
    { text:"Learned at the Late Shift that {npc} drinks to neither forget nor keep — the ones worth holding forget you first — and chose, that night, to keep {me}'s dead anyway." },   // 89
    { text:"Told {npc} the one thing {me}'d rather hold onto than all the dead — {dream} — and she made {me} drink to it alone, the only toast that might still come true." },   // 90
    { text:"Sat with {npc} at the Late Shift while a green recruit laughed too easy; she admitted she stops learning the names of the ones she knows won't last, to keep pouring." },   // 91
    { text:"Bought a green recruit's round at the Late Shift with no warning attached — just let him keep the night whole — and {npc} ran it down anonymous." },   // 92
    { text:"Let {npc} quietly swap {me} to a heavier glass when the hands started keeping score; she's watched the tremor come first for three rosters and never once said the word." },   // 93
    { text:"Told {npc} the tremor wasn't the body but {trauma} finding the exit; she said the hands just bill you for what the head won't, and kept the heavy glass full." },   // 94
    { text:"Stayed through the dead hour at the Late Shift — the one with no name on it — while {npc} kept the lamp lit, both of them built the same by a war that doesn't let you sleep." },   // 95
    { text:"Held down the Late Shift until the dawn crates came so neither {me} nor {npc} had to sit the worst hour alone — coffee, no charge, no need to call it company." },   // 96
    { text:"Set the fresh commendation on the Late Shift's bar and let {npc} name it for what it was — corporate's way of not paying in money what the medal cost in people." },   // 97
    { text:"Confessed across the Late Shift's rail that the commendation honored the lie — the real thing {me} did, {crime}, the company never knew — and {npc} kept the true version, not the official one." },   // 98
    { text:"Let {npc} carry an open tab at the Late Shift on purpose — she keeps the ones in the red, because the regulars who settled up never came back." },   // 99
    { text:"Promised {npc} {me}'d keep coming back to owe the tab — and she logged only the date, the way she marks the ones she expects to see again." },   // 100
    { text:"Told {npc} at the Late Shift the shake in {me}'s hand only starts when {me} goes still — because {trauma} — and she called it a body remembering, not a body breaking." },   // 101
    { text:"Learned from {npc} how the other shaking hands at the Late Shift ended — one drowned it, one held the glass two-handed and kept coming — and she made it plain which one she'd keep pouring for." },   // 102
    { text:"Took the stool {npc} keeps warm for the ones who can't sleep, at the dead hour past close, and let her teach {me} the difference between a quiet room and an empty one." },   // 103
    { text:"Sat the Late Shift through to grey morning at the no-sleep hour while {npc} asked nothing — locked up around {me}, not against {me} — and walked home lighter than the room would've let {me}." },   // 104
    { text:"Kept saving the empty stool at the Late Shift for {fallen}, and {npc} taught {me} how the room stays alive — you start saving the seat for whoever needs it next." },   // 105
    { text:"Poured a glass for the empty stool at the Late Shift and drank it down for {fallen} — and {npc} took it away like they'd finally had their round at her bar." },   // 106
    { text:"Found out {npc} pulled one song's chip from the Late Shift's box herself — some tunes you only survive once — and sat in mine, still deciding which kind it was." },   // 107
    { text:"Told {npc} who {me} used to hear that old song with, and she made it a house standing order at the Late Shift — the track stays on the box, for them." },   // 108
    { text:"Confessed the worn coin {me} carries was {fallen}'s, taken off them after — and {npc} told {me} the Late Shift's rail can hold one more ghost when {me}'s finally ready to set it down." },   // 109
    { text:"Put {fallen}'s coin back in {me}'s pocket at the Late Shift and held the glass instead — and {npc} clocked it as the first night {me}'s hands held something that wasn't the dead." },   // 110
    { text:"Told {npc} the stranger in the Late Shift's mirror showed up the day {me} did the thing {me} can't undo — {crime} — and she refused to let {me} disown him, said he drinks here same as {me}." },   // 111
    { text:"Asked {npc} at the Late Shift if the face the war took ever comes back, and she said not the old one — a next one — for whoever stays alive long enough to grow it." },   // 112
    { text:"Heard {npc} call the Late Shift a place to land and not a place to live — she handed {me} {me}'s coat and warned {me} off the ones who moved in." },   // 113
    { text:"Told {npc}, closing the Late Shift alone again, the one thing that'd give the walk home a point — {dream} — and she shoved {me} out the door toward building it." },   // 114
    { text:"Admitted to {npc} at the Late Shift that the only debt that mattered was one no coin would ever close — and that {me} had quit pretending it would." },   // 115
    { text:"Tried to make {npc} start a tab and got told flat no — the Late Shift would stay the one bill in the city nobody was collecting on {me}." },   // 116
    { text:"Told {npc} that {me} kept an empty place set for someone who wasn't coming back, and she answered that you never clear it — you just stop watching the door." },   // 117
    { text:"Raised a glass to a dead regular {me} never met at the Late Shift, and {npc} lifted her bar rag back — two people toasting one empty stool." },   // 118
    { text:"Told {npc} where the tremor came from — {trauma} — and she didn't promise it would pass, only that the body keeps the truest record and won't let you call it finished." },   // 119
    { text:"Said it plain to {npc} — {me} was the last of the unit still walking through doors — and she named it the heaviest seat in any room." },   // 120
    { text:"Asked {npc} how she kept opening with all that arithmetic, and learned she stayed standing so a survivor always had someone behind the bar who already knew the count." },   // 121
    { text:"Told {npc} who {me} was before the company renamed {me} — {crime} — and she only said the company always recruits the buried, then poured one for the man under the man." },   // 122
    { text:"Traded buried selves with {npc} at the Late Shift — she owned the version of her that once thought the bar was temporary — and they agreed the worst lies are the ones told in past tense." },   // 123
    { text:"Told {npc} the worn token in {me}'s pocket was a marker for the after — {dream} — and she said to keep it where {me} could feel it, because whoever loses the marker stops believing the after is real." },   // 124
    { text:"Tried to leave the worn token in {npc}'s keeping and got it pressed back into {me}'s palm — she kept stools, she said, not the things that got people home." },   // 125
    { text:"Stayed past close while {npc} told the one thing she'd never said — the morning she nearly didn't unlock the Late Shift, and how a regular she'd poured for turned the key for her — and learned {me} was the next stranger keeping her door open." },   // 126
    { text:"Sat the dark of the Late Shift after close and let {npc} say her own worst thing without once trying to fix it — gave her back, for one night, the silence she'd been keeping for {me}." },   // 127
    { text:"Admitted to {npc} that the one name {me} could never raise a glass to was {me}'s own — the version that gave the order — and she left the glass standing between them till {me} could, refusing to pour it out or force the lift." },   // 128
    { text:"Told {npc} the one {me} couldn't toast was the one {me} couldn't save — that the lift felt like a lie — and she answered it was the only honest thing left to give the dead, and left the glass waiting." },   // 129
    { text:"Sat the Late Shift as the last of the old crew still walking in, and learned from {npc} that outliving the rest isn't luck — it's just being the one left to remember." },   // 130
    { text:"Told {npc} that surviving the whole crew felt like being left behind, not winning — and she agreed: the dead got to stop, {me} got the tab." },   // 131
    { text:"Told {npc} about the debt that started everything — {crime} — and she named the truth: it doesn't take the currency {me}'s been paying it in." },   // 132
    { text:"Learned why {npc} eats the tab at the Late Shift — she's paying back the one who fed her free, long dead — and let her keep the slate clean." },   // 133
    { text:"Told {npc} what {me}'s hands were still reaching for — {trauma} — and she didn't call it broken, called it loyal, and held the shaking still around the glass." },   // 134
    { text:"Got {npc} to show the tremor she hides in her left hand — the one she pours around — and learned everyone behind that bar is hiding a bad hand." },   // 135
    { text:"In the dead hour at the Late Shift, told {npc} what {me} would do with a quiet life — {dream} — and watched the dawn come up on it sober, with her saying it was the only sane thing {me}'d ever said in there." },   // 136
    { text:"Caught {npc} in the dead hour admitting the open is the only reason she keeps — stands and watches it get light — and kept it off the record for her." },   // 137
    { text:"Told {npc} at Marisol's where the money home really came from — {crime} — and watched them decide to keep the lights on anyway." },   // 138
    { text:"Let {npc} keep the bill at Marisol's and told them straight — {me} would've starved before {home} did. {npc} folded the paper away like it was worth keeping." },   // 139
    { text:"Asked {npc} at Marisol's how many bowls they figured were left — and got told to stop wasting them. Started eating slower after that." },   // 140
    { text:"Saw the new grey in {npc}'s hair at Marisol's and promised to be around for the rest of it — and {npc} told {me} to skip the promise and just keep showing up." },   // 141
    { text:"Admitted with {npc} over a wrong bowl at Marisol's that neither of them really remembers the kitchen back in {home} — just the smell of it — and ate the imitation anyway." },   // 142
    { text:"Told {npc} at Marisol's the bowl didn't need to taste like home — it just needed them across the table — and {npc} pushed their own bowl over to share." },   // 143
    { text:"Owned the thing {me} said at the door years ago — admitted to {npc} at Marisol's that {me} meant it — and watched {npc} finally set down a weight they'd carried since {home}." },   // 144
    { text:"Apologized to {npc} at Marisol's on behalf of the younger version of {me} that the war buried — and {npc} agreed to start over from whoever came back." },   // 145
    { text:"Asked {npc} at Marisol's whether the family back in {home} would see a soldier or a deserter — and got told that walking in at all would erase both. Took the napkin with the date." },   // 146
    { text:"Asked {npc} at Marisol's to stand at {me}'s shoulder walking into the gathering back in {home} — and {npc} agreed to face the family on the same side for once." },   // 147
    { text:"Told {npc} at Marisol's exactly what they'd unknowingly covered for years ago — {crime} — and watched them say they'd have told the same lie anyway. Family that doesn't flinch." },   // 148
    { text:"Learned at Marisol's that {npc} had quietly stood behind {me} all the years {me} felt most alone — a lie told to dangerous people, never collected. Finished the bowl knowing it." },   // 149
    { text:"Asked {npc} at Marisol's, the night they left this city for good, whether they were giving up on {me} — and got told they were going home to leave the porch light on. There's a bowl in {home} now." },   // 150
    { text:"Carried {npc}'s bag from Marisol's to the midnight train the night they left this city for good — one plain thing done right with them, finally, before the platform took them home." },   // 151
    { text:"Told {npc} at Marisol's the thing {me} wants past the war — {dream} — and gave them permission to raise the kid back in {home} on that version of {me} instead of the one with the gun." },   // 152
    { text:"Asked {npc} at Marisol's to bring the kid from {home} to the diner next time — choosing to be a real person to a child instead of a bedtime story about a soldier." },   // 153
    { text:"Let {npc} cover the tab at Marisol's without fighting it — the first time the money between them sat still." },   // 154
    { text:"Told {npc} at Marisol's where the wired money really came from — {crime} — and they took it anyway, just to keep {me} close." },   // 155
    { text:"Made {npc} admit they weren't forgiving the money, only sitting with it — and let that smaller, truer thing be enough." },   // 156
    { text:"Watched {npc}'s hands shake over the broth at Marisol's and steadied the bowl without making it a thing — then promised to come back while they still knew {me}." },   // 157
    { text:"Put a hand over {npc}'s tremor at Marisol's and let them feel it was still the same kid under whatever the war stamped on {me}." },   // 158
    { text:"Told {npc} at Marisol's they were right to be afraid — but of the war, not {me} — and watched the old fear of their own kid ease a notch." },   // 159
    { text:"Sat in the empty third seat at Marisol's — the one {npc} kept set for the dead — so the old booth held two of the living again." },   // 160
    { text:"Admitted to {npc} at Marisol's {me} kept a seat for the dead too, every mess hall out there — and let them finally send the empty third bowl away." },   // 161
    { text:"Took the family broth recipe {npc} slid across at Marisol's and tucked it over the armor — one piece of {home} the war can't outlive." },   // 162
    { text:"Made {npc} stand over {me} at Marisol's back range and teach the family broth by hand — got it wrong, then right, then right." },   // 163
    { text:"Gave {npc} at Marisol's one ordinary human thing from the week the LNS ticker made {me} a monster — and watched them keep it over the headline." },   // 164
    { text:"Made {npc} say why they still ordered for {me} after the ticker footage — heard 'I knew you before the camera did' and watched them tear it in half." },   // 165
    { text:"Admitted to {npc} at Marisol's {me} can't always tell the ticker-monster from the real {me} — and let them swear to keep checking till the screen's outvoted." },   // 166
    { text:"Owned to {npc} at Marisol's that a casualty list and a tent were all {me} got of the burial — and took the plot number to finally stand at the grave together." },   // 167
    { text:"Held the wake {me} missed right there at Marisol's — grieved {home}'s dead out loud next to {npc}, who'd done the digging alone." },   // 168
    { text:"Offered to carry the anger {npc} had hauled alone since the burial {me} missed — and got handed half of it across the cold bowls at Marisol's." },   // 169
    { text:"Couldn't promise {npc} a whole life back in {home}, but swore at Marisol's the first transport home after the contract is theirs to meet — and meant it." },   // 170
    { text:"Told {npc} to keep asking {me} home every bowl despite the odds — admitted out loud the asking is part of what pulls {me} back from the fire." },   // 171
    { text:"Made {npc} stop practicing the unasked question and say it loud across Marisol's — so {me} would have something specific to refuse to die before." },   // 172
    { text:"Forfeited the old fight to {npc} at Marisol's — conceded the whole years-long argument with no terms, just to stop letting it eat the time." },   // 173
    { text:"Called a permanent draw with {npc} on the fight that outlasted {home} — clinked spoons on it like a treaty, the case closed for good." },   // 174
    { text:"Admitted to {npc} the unfinished fight replayed in every mess hall with no one to lose to — and found out they'd both kept arguing the same empty seat for years." },   // 175
    { text:"Lifted the spoon to {npc}'s mouth at Marisol's when their hands shook too hard, and got told the war back in {home} was just getting old alone." },   // 176
    { text:"Steadied the bowl while {npc}'s ruined hands managed the noodles, and promised nothing bigger than showing up when {me} could." },   // 177
    { text:"Showed {npc} that {me}'s hands shake too — not from age — and the two of them rattled spoons across the cold bowls like a matched set." },   // 178
    { text:"Had {npc} walk {me} through the funeral {me} missed in {home} — every name in the row, the wrong song — and stood inside the day a year late at a cold table." },   // 179
    { text:"Took the black ribbon {npc} brought from the {home} funeral and pinned it on at the counter — the one grave {me} could still stand at, late and pinned." },   // 180
    { text:"Told {npc} {me} skipped the {home} funeral because one grave opens all the others — and watched them put down a year of thinking {me} just didn't care." },   // 181
    { text:"Learned {npc} sat the worst {home} nights on the back step in {me}'s left-behind coat, talking to a {me} who wasn't there — and answered better that way." },   // 182
    { text:"Left {me}'s dog tag in the pocket of the coat {npc} had worn for years — so the {me} who exists now rides in {home} too, not just the kid who left it." },   // 183
    { text:"Asked {npc} for the old field coat back at Marisol's and got it, warm from their years — carried one thing from before {me} could hold without it being a weapon." },   // 184
    { text:"Got {npc} to name what {home} had cost them — the lost house, the cold room over the laundry — and understood that being told was the whole ask." },   // 185
    { text:"Put a fold of pay on {npc}'s table at Marisol's and called it back rent on the missing years — so they could take it without it being charity, and the caring ran the other way for once." },   // 186
    { text:"Admitted to {npc} the war eats the pay and {me} had nothing to send — and promised the one thing left, sitting across from them every chance there was." },   // 187
    { text:"Let {npc} make the {home} child real to {me} — scared of the dark, asking where {me} was every storm — and became someone the kid could actually wait for." },   // 188
    { text:"Sent the {home} child {me}'s worn field patch instead of a medal — a true small thing to hold instead of a legend — and let {npc} carry it back." },   // 189
    { text:"Told {npc} the only story to raise the {home} kid on — don't become {me} — and handed them the one warning {me}'s whole life had earned." },   // 190
    { text:"Finally told {npc} the truth under the truth — {me} fled {home} that night running from {crime}, and let the family hate {me} so no one would ever come for them." },   // 191
    { text:"Gave {npc} one true edge of why {me} left {home} — {trauma}, and the shame of being watched coming apart in a full house — and got told to bring the rest later." },   // 192
    { text:"Owned the slammed door and the unsayable thing said the night {home} broke — claimed the breaking as {me}'s, no excuse, no weather — and let {npc} start the count over from there." },   // 193
    { text:"Paid the old debt to {npc} at Marisol's — not the money, the silence under it — and left a hand on theirs a beat past what soldiering allows." },   // 194
    { text:"Told {npc} where the money came from — {crime} — and watched them take it anyway, square at last, no flinch." },   // 195
    { text:"Left the oldest debt to {npc} unpaid on purpose — a string between {me} and {home} that neither of them would cut." },   // 196
    { text:"Paid {npc} back to the cent and watched the old debt close — clean, flat, one less thing between {me} and {home}." },   // 197
    { text:"Filled the dead man's bowl at Marisol's and let the steam stand for him with {npc} — a funeral the war hadn't let {me} attend." },   // 198
    { text:"Told {npc} the dead had stopped landing out there — that {trauma} — and let one death finally land, slow, at a noodle counter." },   // 199
    { text:"Ate beside {npc} and the dead man's cooling bowl — said nothing comforting, just stayed and let it go cold witnessed." },   // 200
    { text:"Told {npc} the old dish was never the recipe — it was the racket of the house around it — and they sat in the missing noise together." },   // 201
    { text:"Told {npc} to keep cooking the old dish wrong every week until 'wrong' became {me}'s and theirs — a standing order at Marisol's." },   // 202
    { text:"Took the last scrap of {home} in a dead hand's writing from {npc} and swore to carry it past the war — one page of the old house, saved." },   // 203
    { text:"Told {npc} to let the old dish stay buried with {home} — and watched them pocket the recipe instead of binning it, not ready." },   // 204
    { text:"Left Marisol's under one coat with {npc} into the rain — both heading the same way for once, ridiculous and unsplit." },   // 205
    { text:"Walked {npc} the whole wet way to their door and no further — went the distance for once, which was new, which was enough." },   // 206
    { text:"Said the after-the-war thing to {npc} in Marisol's doorway — {dream} — and they told {me} to stop walking off alone like {me} didn't believe it." },   // 207
    { text:"Stopped letting {npc} say goodbye like it was nothing — stepped into the rain after them instead of promising and vanishing." },   // 208
    { text:"Hummed the old slowed-down cadence back at {them} under the bass at Static until {them} came in on the second line — two ruined voices on one dead song nobody else heard." },   // 209
    { text:"Told {them} at Static why the buried cadence still catches in {me}'s throat — {trauma} — and {them} only said it was a good one to forget with someone who already knew." },   // 210
    { text:"Held {them}'s shaking wiring hand flat on the Static table till it quit, and made {them} promise to bring the shakes to {me} next time instead of drinking them still alone." },   // 211
    { text:"Put the next round in {them}'s shaking hand on purpose at Static and watched {them} hold it without spilling — proof, for one round, that the war hadn't taken everything." },   // 212
    { text:"Stood the wall with {them} at Static watching civilians dance who'd never know the cost — agreeing it was the win, and the wall wasn't the worst seat with each other holding it." },   // 213
    { text:"Said out loud at Static the soft peacetime thing {me} still wants — {dream} — and {them} called it proof there was still a civilian left under the chrome worth saving." },   // 214
    { text:"Watched {them} put a shoulder between {me} and a stranger reading the room wrong at Static — back-to-back without a word, the way {them} keeps the room so {me} can keep a head." },   // 215
    { text:"Told {them} at Static why {me} reads every door like a threat — {crime} — and {them} only added {me}'s doors to the ones {them} already watched." },   // 216
    { text:"Closed Static down with {them} past last call, two people who don't sleep, and told {them} to call on the bad nights — not to talk, just so the quiet had two people in it." },   // 217
    { text:"Handed {them} the replay that loops loudest in the 0300 dark — {trauma} — and {them} took the other end of it so {me} wasn't the only one holding the thing that won't let {me} sleep." },   // 218
    { text:"Decided with {them} at Static to leave the thing between them unnamed — too old for the word friend, too real for it — because the city only takes what it can find on a form." },   // 219
    { text:"Named the thing with {them} the only honest way at Static — last two standing out of a whole roster — and {them} took it like a rank that finally fit." },   // 220
    { text:"Pushed {them} at Static to stop drinking through a wound that wouldn't close and got a promise to see a ripper — given for {me}'s sake, since {them} wouldn't go for {them}'s own." },   // 221
    { text:"Traded {them} the wound no ripper can touch — {trauma} — for the one {them} kept drinking through, and called it a deal: keep each other's open ones from going septic." },   // 222
    { text:"Learned the one song {them} can't sit through anymore — and didn't make {them} say why it cost what it cost. Some tracks you just skip together." },   // 223
    { text:"Botched a line of the pre-war anthem on purpose and watched {them} fix it on reflex — two wrecks who still carry the same dead chorus where the city can't reach it." },   // 224
    { text:"Got the real prognosis on {them}'s failing chrome arm — not the bar version, the number — and held it steady so {them} didn't have to carry the math alone." },   // 225
    { text:"Told {them} that when the bad hand finally seizes on the line, {me}'d be the one covering that side — and {them} stopped hiding it under the table." },   // 226
    { text:"Asked {them} about the soft-handed self that never enlisted, and heard {them} admit they still wave at his ghost on the dance floor — and didn't make a joke of it." },   // 227
    { text:"Dared {them} onto the floor with the untouched kids and lost — but got the first real laugh out of {them} all night for trying." },   // 228
    { text:"Sat in the closing-time quiet at Static while {them} named, in two words, who used to wait up — and left the third word alone. Two people who know the size of an empty room." },   // 229
    { text:"Made the last table a standing thing with {them} — every off-night, the two of you, till one can't — and neither said how much it meant because both knew." },   // 230
    { text:"Handed {them} the part of the real war story {me} feeds no stranger — {crime} — and {them} took it without a flinch, owning a piece so {me} carried less of it." },   // 231
    { text:"Struck the deal with {them}: the poster lie for every stranger, the real war for no one but each other. The truth has one seat at the table now, and it's theirs." },   // 232
    { text:"Heard what {them} used to save the hazard pay for — a younger self's plan the war priced out — then quietly put the next round on {me}'s chit so {them} kept a little of it." },   // 233
    { text:"Made {them} pocket half the hazard pay before the bar swallowed it — first time in years anyone gave {them} a reason to keep something instead of burning it." },   // 234
    { text:"Named for {them} the exact silence the body still braces for — {trauma} — the one the music's meant to drown — and learned {them} flinches at a quiet shaped just like it." },   // 235
    { text:"Promised {them} that next time the music dies, you'd both find each other's eyes instead of a trigger — and when it dropped again, you actually did." },   // 236
    { text:"Talked {them} into stopping the count one night at Static — pushed the next drink an inch away and let the noise stay loud instead, two of us awake in it on purpose." },   // 237
    { text:"Said out loud at Static what the drinking was really for — {trauma} — and {them} didn't tell me to stop, just kept pace, glass for glass, till the thing was small enough to sleep on." },   // 238
    { text:"Toasted the row of empties at Static with {them} like they were a list of names — agreed the count was the one honest thing left, and drank to it knowing exactly what that meant." },   // 239
    { text:"Laid the 'after' on the table first at Static so {them} wouldn't have to go alone — said the one thing I want when the war's done, {dream} — and {them} made me swear not to die before I had it. Inseparable after that; some bonds you sign in the thing you're most afraid to want." },   // 240
    { text:"Picked an after with {them} at Static — somewhere with no strobe, no bass, a view — and we both pretended we'd be bored there, and both quietly filed it as the thing to survive toward." },   // 241
    { text:"Made a pact with {them} at Static to cover each other's failing parts in the field — {them}'s shaking off-hand for my bad knee — so when the bodies quit a piece at a time, neither of us drops alone." },   // 242
    { text:"Held {them}'s shaking hand still on the table at Static and just left it there — no fix, no speech, the only steady thing in the room for one minute — until {them}'s voice went rough telling me not to make it weird." },   // 243
    { text:"Told {them} the failing chrome didn't matter — watched {them} steady the shaking hand by pure will just to make my lie half-true — and let us both believe it for one more night at Static." },   // 244
    { text:"Admitted to {them} at Static that the weight ran both ways — that I'd hung the same dangerous amount of caring on them — and we agreed to carry the risk of mattering instead of cutting it loose. Lighter shared, even knowing what it could cost." },   // 245
    { text:"Asked {them} at Static if they'd have rather I stayed clear of the bad door on {home} — and {them} said they'd rather owe me forever than not owe me at all, and let it stand. That's the whole of it, said plain." },   // 246
    { text:"Called the debt from {home} paid in full at Static and made {them} drink to it — and {them} sealed it by swearing to kill me himself if I ever walked into a bad door ahead of him again. That's how he says he loves you." },   // 247
    { text:"Shook on it with {them} at Static — whoever outlives the other comes and claims the body, no nameless drawer, no rendering for parts. The realest contract either of us ever signed, made over a gurney rolling out the side door." },   // 248
    { text:"Told {them} at Static why no one decent would ever claim my body — {crime} — and {them} said good thing he isn't decent, he'd come anyway. The warmest thing he owns, offered over a corpse rolling out the side door." },   // 249
    { text:"When an old song ambushed {them} at Static — the one from before the war — I told them they still had people, had one, right here. {them} said one's the number that keeps you in the chair instead of the river. I'm that one now." },   // 250
    { text:"Matched {them}'s ambush song at Static with my own ghost — told them what it would've played over for me, {trauma} — and we let the old track run and both bled quiet in the same booth instead of alone in two cities." },   // 251
    { text:"Made it a standing law with {them} — whoever's more worn out gets the seat that sees the door, the other one covers the rest — and stopped having to watch the whole room alone." },   // 252
    { text:"Handed {them} back the seat that watches the door — couldn't sit easy, never learned how — and let {them} carry the room so {me} didn't have to pretend." },   // 253
    { text:"Took the four notes that used to mean incoming for {them} and clinked glasses on the last one at Static, until the sound stopped meaning death and started meaning the two of us." },   // 254
    { text:"Asked {them} whether the sound from the bad day ever quits, and got the only honest answer — it doesn't, you just walk while it plays, and it's easier with someone humming along." },   // 255
    { text:"Laid {them}'s recall-deck face-down next to {me}'s own at Static and drank over both — one night the company that still owned us on paper couldn't find either of us." },   // 256
    { text:"Asked {them} what happens the day the recall stops being a ping and turns into a hand on the shoulder — and learned {me} was already the call {them} would make." },   // 257
    { text:"Traded a standing promise with {them} at closing — when the empty-room mornings get bad, you ping the other one instead of riding the ceiling alone — and made both our hallways a little shorter." },   // 258
    { text:"Asked {them} at last call whether going home alone after the war ever stops, and got the truth — it doesn't, you just stop being surprised by it — then took the long way home together until the streets forced the split." },   // 259
    { text:"Watched a bar fight with {them} at Static and admitted out loud that the only thing stopping the both of us was knowing we'd enjoy it." },   // 260
    { text:"Let {them} pay back a battlefield debt at Static, then told them money was the only kind of debt I could still stand to settle." },   // 261
    { text:"Refused {them}'s repayment at Static and named the real debt — that they once let me carry them and didn't lie about it after." },   // 262
    { text:"Argued with {them} at Static over whether to warn a green recruit off the soldier's life — and admitted neither of us would have listened either." },   // 263
    { text:"Told {them} at Static I send green recruits toward the life I wanted before the war — and they told me to keep doing it, since it's too late for them." },   // 264
    { text:"Split {them}'s last cigarette in the alley off Static and told them the field teaches you to ration with whoever's still breathing, even people you hate." },   // 265
    { text:"Shared {them}'s last cigarette outside Static on the agreement we'd both deny it ever happened — which is how I'll know it did." },   // 266
    { text:"Ran the same op as {them} for the first time, then sat at Static while they admitted needing me scared them worse than the dying did." },   // 267
    { text:"Held {them}'s flank on a shared op and told them not to mistake it for a truce — and we both took the comfort of the feud staying exactly where it was." },   // 268
    { text:"Told {them} at Static the bridge order was mine, that they took the blame to keep me functional — and finally handed them the truth underneath it." },   // 269
    { text:"Agreed with {them} at Static to name the bridge order between us in private — they'd stop owning my kill, I'd stop pretending the high ground was mine." },   // 270
    { text:"Asked {them} at Static which wound they'd return, and got told you keep them all — the scar is the only honest receipt for what it cost." },   // 271
    { text:"Refused to trade scar stories with {them} at Static, and got a glass lifted an inch for it — the closest {them} comes to agreement." },   // 272
    { text:"Pressed {them} at Static on who taught the footwork {me} inherited, and learned it came off a dead body neither of you will name." },   // 273
    { text:"Swore to {them} you'd pass the footwork down uncredited the way it came to you — and {them} called that the only way it survives." },   // 274
    { text:"Bought a round square with {them} for the bridge pull, and heard them admit they'd rather be even than owe — because owing means {me} matters." },   // 275
    { text:"Refused to let {them} square the bridge debt and bought the next round back — so the two of you stay forever in the red to each other on purpose." },   // 276
    { text:"Found {them} closing Static at 3 a.m. and learned what kept them out — a room kept for someone not coming back — and let your own silence answer in kind." },   // 277
    { text:"Admitted to {them} you'd rather close Static every night than go home to nothing — and got the same fact back, the two of you the last lights out." },   // 278
    { text:"Pried {them}'s true eulogy for {me} loose at Static: the only one they never had to forgive, never let down — and they resent {me} for it." },   // 279
    { text:"Asked {them} for no eulogy at Static — just to outlive {me} — and got a one-touch of glasses and a promise to carry that cruelty out." },   // 280
    { text:"Named the off-books job to {them} at Static — {crime} — logged under the company banner so it counted as policy, and {them} called you both the same animal." },   // 281
    { text:"Swore to {them} at Static you'd spend the rest taking the company apart brick by brick — and got them in beside you, half-conviction, half-spite." },   // 282
    { text:"Laid a scarred forearm next to {them}'s at Static and let the wounds do the talking — same week, same shell, no apology owed either way." },   // 283
    { text:"Traded the real story behind the burn with {them} at Static — {trauma} — and got back the rarest thing they had: belief, with no soft edge on it." },   // 284
    { text:"Saw the scar {them} can't show anyone shake their hand at Static, and bought them the silence instead of the question." },   // 285
    { text:"Answered the wound {them} can't show with the one {me} can't either — {trauma} — and two enemies counted, for once, on the same side of the same dark." },   // 286
    { text:"Cleared the drink {them} bought {me} at Static the same night, flat and square — no debt allowed to sit between two people who'd never call it friendship." },   // 287
    { text:"Let the drink {them} bought sit unpaid on purpose at Static — an open tab two enemies kept on each other because a debt was a reason to come back." },   // 288
    { text:"Told {them} at Static that the tab was a lie they hid behind, and got back the only confession they had — that they'd cover {me} too, and hated how much." },   // 289
    { text:"Handed {them} the worst thing on {me}'s record at Static — {crime} — and the tab stayed open anyway, which from them was the verdict: still worth keeping alive." },   // 290
    { text:"Drank Static dry to a draw with {them} and walked them out shoulder to shoulder — last two upright in an empty room, neither willing to fall first." },   // 291
    { text:"Outlasted {them} glass for glass at Static till they flipped their cup and called it — the only admission {them} would ever make that {me} was the harder one to put down." },   // 292
    { text:"Sat with {them} in the gutted noise of Static till closing and admitted out loud what you both came to drown — the silence that arrives the second the bass dies." },   // 293
    { text:"Told {them} at last call that under the quiet there was still a thing {me} wanted — {dream} — and the one person who never flatters {me} ordered me to go take it." },   // 294
    { text:"Let {them} corner {me} at Static over the bad call that got people killed, owned it to their face, and walked out something stranger than friends — the last two witnesses who keep each other honest." },   // 295
    { text:"Closed the reckoning over the bad call with {them} at Static and split the ghost between two glasses — the dead toasted, the blame shared, the feud finally something you could stand inside." },   // 296
    { text:"Asked {them} which week the standard-issue lighter quit, not the body count, and got the date nobody else had bothered to want." },   // 297
    { text:"Pocketed {them}'s dead lighter at Static and said the fire was {me}'s to carry now — and {them} let the hand stay over {me}'s." },   // 298
    { text:"Told {them} the failed graft suited them, and {them} turned the chromed seam face-up at Static instead of hiding it — first time." },   // 299
    { text:"Showed {them} where {me}'s own hardware went in — {trauma} — and {them} answered that coming back wrong the same way wasn't nothing." },   // 300
    { text:"Held {them}'s eye through every strobe-flash at Static and didn't look away from the chrome, until {them} quit covering it." },   // 301
    { text:"Took a song that gutted {them} and claimed it back as theirs and {me}'s, starting that night at Static — and {them} let the old ghost keep the rest." },   // 302
    { text:"Told {them} the dead don't get to pick the playlist, and {them} held {me}'s wrist through the next track laughing like it broke something loose." },   // 303
    { text:"Quit pretending it was a dance on Static's empty floor and just held {them} upright till the slow track died, weight to weight." },   // 304
    { text:"Asked {them} the last time they let anyone this close standing up; the answer was a dying man in a field hospital, and {them} told {me} to stay made." },   // 305
    { text:"Hit send on {them}'s three-a.m. call myself at Static so it rang in {me}'s own pocket — made the almost into a real number neither could un-dial." },   // 306
    { text:"Asked what kept {them} on a four-a.m. roof, and the answer was a quiet full of bad questions — and that calling {me} was the only one with no bad answer." },   // 307
    { text:"Walked out of Static at last call with {them}, no destination, matching pace down the wet block until the night ran out of itself." },   // 308
    { text:"Said it back to {them} flat under Static's ugly house lights — didn't want to be where {them} wasn't — and {them} called it settled, just the two of us knowing." },   // 309
    { text:"Told {them} at last call the someday {me} pictures past the war — {dream} — and {them} asked only to be in the picture, and to be taken along." },   // 310
    { text:"Rolled a sleeve back across the table at Static and let {them} read the war's handwriting on {me}, traded scar for scar with no one keeping count but each other." },   // 311
    { text:"Laid {me}'s hand over the field-graft that never healed right and felt {them}'s slow fingers test it for warmth, both of them quiet a long time after." },   // 312
    { text:"Told {them} at Static the chrome didn't scare {me} — wanting to be there the nights it ached did — and {them} asked if {me} was volunteering for the forecast." },   // 313
    { text:"Told {them}, when the old squad song found Static, the face it always brings back and the wound under it — {trauma} — and {them} answered only that they'd have liked the dead." },   // 314
    { text:"Hummed a dead squad's song badly with {them} at Static till {them} laughed and wiped an eye, both wrecking it on purpose to keep from drowning in it." },   // 315
    { text:"Told {them} at Static {me} didn't want anyone who only knew the good tracks — and when the bad song played, {them} put a palm up on the table and {me} didn't leave." },   // 316
    { text:"Made {them} say what the covered tab at Static was really for, and got it plain: a reason to still be at the table when the lights came up." },   // 317
    { text:"Traded the round back to {them} at Static — {me}'s tab for {them}'s company, even-up — and let the hand-off run a half-second long on purpose." },   // 318
    { text:"Told {them} at Static to quit buying rounds and buy time instead, and walked out toward a noodle window two blocks off where the bass couldn't drown the talking." },   // 319
    { text:"Asked {them} on the half-empty floor at Static what stayed behind the armor, and got the truth at {me}'s ear: the fear this gets taken too, so don't tell it we found it." },   // 320
    { text:"Quit pretending to dance with {them} at Static and just stood in it, forehead to forehead, two wrecks holding each other up while the last slow song played out." },   // 321
    { text:"Told {them} on the floor at Static, done being too proud to, that {me} didn't want the song to end — and {them} kept {me} moving till the staff threw them both out." },   // 322
    { text:"Moved slow with {them} on the half-empty floor at Static and asked when anyone last held them without wanting a cut — and {them} couldn't name the year." },   // 323
    { text:"Swayed to a slow song with {them} at Static saying nothing at all, and when the lights came up neither one let go first." },   // 324
    { text:"Cleaned the split off {them}'s knuckles in the back booth at Static and told them why my hands never shake on a wound — {trauma} — and they didn't pull the arm back." },   // 325
    { text:"Bound a working wound on {them}'s hand in the Static back booth and kept holding the hand long after the bleeding stopped." },   // 326
    { text:"Offered to settle the score for {them}'s split knuckles and let them talk me out of it with a hand over mine." },   // 327
    { text:"Sat through the dead man's song at {them}'s side and gave them a new reason to let it play, instead of a grave to stand at." },   // 328
    { text:"Swore to {them} over a dead friend's song that I wasn't going past tense, and they made me say the lie they wanted to be true twice." },   // 329
    { text:"Crossed three days of silence to the stool beside {them} and learned the fight was never about the comm — it was them not being ready to bury me yet." },   // 330
    { text:"Told {them} across a three-day quiet that this was the one thing I couldn't afford to break, and they leaned back in like nothing had." },   // 331
    { text:"Split the last of the night with {them} at Static and named what I'm saving toward — {dream} — and they said both our halves go in the same pot." },   // 332
    { text:"Told {them} I'd quit halving anything — it all goes in one pile now — and they called it dangerous and stayed in anyway." },   // 333
    { text:"Drew myself onto {them}'s napkin map of the road off the grid, and they folded it over my heart and swore we'd both actually walk through the door this time." },   // 334
    { text:"Told {them} I didn't need the coastline drawn on the napkin, just wherever they landed, and they put the map away and kept the hand." },   // 335
    { text:"Told {them} the shaking hands weren't the weakness — steady when it mattered, then the body bills you after, and Static is where you pay it instead of on the floor." },   // 336
    { text:"Wrapped {them}'s shaking hands around a warm glass at Static and handed down the small mercy: don't watch the tremor like a verdict — keep them warm, keep them busy, it quiets." },   // 337
    { text:"Told {them} the shaking hands were the last part still scared enough to be human — and that the day they go still for good is the day to start worrying." },   // 338
    { text:"Sat with {them} the night of their first confirmed and told the truth no one had: the face follows you home for a while, then joins the others who take turns — and drinking won't make any of them leave." },   // 339
    { text:"Told {them} after their first kill to weight the night with one human thing — a call, a real meal — so the day wasn't only the worst thing that happened in it." },   // 340
    { text:"Laid {me}'s own first kill on the table at Static — that {trauma} — so {them} would know nobody walks out of it clean, and that you don't put it down, you just learn to carry it." },   // 341
    { text:"Sat the dead hour with {them} at Static and let the kid name the one moment that wouldn't stop replaying — didn't fix it, just carried it a while so they weren't holding it alone at four in the morning." },   // 342
    { text:"Handed {them} the only thing that ever beat the sleepless nights — you can't outrun your own head, but you can wear the body out so the mind doesn't get the last word." },   // 343
    { text:"Told {them} the sleepless hour never leaves — you make peace and it becomes yours, and one day four in the morning is just bad company you've learned to stand." },   // 344
    { text:"Pushed {them} on what was actually waiting outside the job — and when the kid had nothing, told them to build a door before they needed it instead of letting the empty horizon keep them in the fire." },   // 345
    { text:"Told {them} that most of us stay only because we've forgotten who we are without the job — and to go find that person out before the choice gets made for them." },   // 346
    { text:"Said {me}'s own way out loud to {them} at Static — {dream} — and admitted to staying too long chasing it wrong, then told the kid not to repeat the mistake: pick a date, not a someday." },   // 347
    { text:"Got {them} to see their lucky ritual was really a hope that somebody was keeping count of them — and told the kid to hold onto that, because the belief was the charm, not the trinket." },   // 348
    { text:"Taught {them} the quiet pre-drop ritual {me} had never said aloud to anyone — no object to lose, just the words — and the kid repeated it back careful, like it might break." },   // 349
    { text:"Told {them} the cold truth under every lucky ritual — it doesn't keep you alive, it keeps you willing to walk back to the drop, and that willingness is the whole job." },   // 350
    { text:"Sat with {them} after their first notification call and didn't grade the kindness against the truth — only told them to make sure it was the version they could stand at four in the morning, because they'd carry it either way." },   // 351
    { text:"Warned {them} that the family's thank-you would weigh more than any blame ever could — because they trusted you with the kind story and you handed it over anyway, and that's a weight you don't get to set down." },   // 352
    { text:"Told {them} about the notification {me} got wrong years back — {trauma} — and handed down the rule learned the expensive way so the kid wouldn't have to earn it the same." },   // 353
    { text:"Let {them} name the one empty stool they were really counting at Static, and held the name on the bar between us a while — because getting it said out loud was the only toast that one was going to get." },   // 354
    { text:"Taught {them} how to survive the thinning room — you don't carry every empty stool, you carry one name and let the room hold the rest, because trying to hold all of them buries you with them." },   // 355
    { text:"Told {them} they weren't the next empty stool — they were what the empty stools never got to become, and that they owed the dead getting old, loud and ungrateful and alive." },   // 356
    { text:"Heard {them}, now ranking above {me}, confess they were terrified of getting {me} killed on their own call — and told the kid that fear was the proof they'd command right, because the fearless ones are the ones you don't follow." },   // 357
    { text:"Taught {them} the last lesson {me} had left to give — how to send a friend into the bad ground, carry the cost in private, and never let them see it weigh on you, because that solitude is what command actually costs." },   // 358
    { text:"Slid the drink across at Static and just told {them} — now ranking above {me} — that {me} was proud, plain, no lesson attached, and for once let the word stand on its own." },   // 359
    { text:"Showed {them} how to park a shaking hand and breathe the count down at Static — taught the kid the shake never stops, you only buy back the next reload." },   // 360
    { text:"Named the thing that put the permanent shake in {me}'s hands — {trauma} — so {them} would stop being ashamed of their own, and learn you go out anyway." },   // 361
    { text:"Told {them} to fear the day the shaking stops, not the shake — taught the kid the tremor is the body still keeping the tab, and you want it." },   // 362
    { text:"Told {them} the day {me} believed the legend and let it cost a life — {trauma} — so the kid would never trust their own luck the way {me} did." },   // 363
    { text:"Traded {them} the untouchable myth for the only job that ages you — count the heads at the door and bring the number back whole." },   // 364
    { text:"Warned {them} that luck spoken out loud becomes the company's bet, not theirs — told the kid to refuse the squad's need for someone untouchable." },   // 365
    { text:"Sat {them} through the freeze after a mid-op loss and handed down the only rite that fits a war — say the name once at Static, then let the night carry it." },   // 366
    { text:"Made {them} say the second-before out loud so the loop had somewhere to land outside their own skull — taught the kid a verdict shrinks the moment you let it leave you." },   // 367
    { text:"Taught {them} the cruel arithmetic of the contract — grieve fast and on your own time, because the company schedules the next loss no matter how you mourn." },   // 368
    { text:"Finally told {them} the reason {me} stayed alive through all of it — {dream} — and asked the kid {me} raised to be the one who makes {me} walk away and go get it." },   // 369
    { text:"Handed {them} the list for good at Static — told the kid who covered {me}'s slip that the rules were always a loan, and they'd just paid it back." },   // 370
    { text:"Asked {them} to be the one who calls it when {me} can't go out anymore — gave the kid the job {me} never had anyone brave enough to do for me." },   // 371
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
    "Better her than a wall, she said. Sat in it.",   // 75
    "Quiet that wasn't a fight. Plenty.",   // 76
    "Said I think about home. So does she.",   // 77
    "Next bad call, just them. Didn't need it said back.",   // 78
    "Not warmth. A line that holds.",   // 79
    "Backs to the wall, both of us. Didn't name it.",   // 80
    "Covered it. Stopped being a question.",   // 81
    "Same machine used us both. Split what's left.",   // 82
    "Some debts you just keep carrying.",   // 83
    "Couldn't pay it. Drank his round.",   // 84
    "Healed crooked. Built around it anyway.",   // 85
    "The skin closed. Nothing else did.",   // 86
    "The hollow ends up holding you up.",   // 87
    "We all keep one empty chair.",   // 88
    "Chose to keep them. Costs more.",   // 89
    "Drank to the thing still possible.",   // 90
    "She stops learning their names on purpose.",   // 91
    "Bought him the night. No speech.",   // 92
    "She swapped the glass. Said nothing.",   // 93
    "My hands billing me for the silence.",   // 94
    "Neither of us sleeps. We sat anyway.",   // 95
    "Sat the dark with her till dawn.",   // 96
    "A medal so they wouldn't pay cash.",   // 97
    "They pinned the lie. She kept the truth.",   // 98
    "She keeps the ones who stay in debt.",   // 99
    "She wrote down the date. Nothing else.",   // 100
    "It's not broken. It's remembering for me.",   // 101
    "She'd rather pour for the kind that stays.",   // 102
    "Learned the difference between quiet and empty.",   // 103
    "She locked up around me, not against me.",   // 104
    "Save the seat for whoever needs it next.",   // 105
    "Now they've had their round here too.",   // 106
    "Some songs you only survive once.",   // 107
    "She kept their song on the box for good.",   // 108
    "I'll set it down when I mean it.",   // 109
    "One night my hands held something else.",   // 110
    "He drinks here same as me.",   // 111
    "Not the old face. A next one.",   // 112
    "A place to land. Not to live.",   // 113
    "Go build the door worth walking to.",   // 114
    "The debt that doesn't take coin. Named it.",   // 115
    "She wouldn't ring it. The one bill nobody collects.",   // 116
    "I keep an empty place too. She gets it.",   // 117
    "Toasted a stranger's ghost with the bartender.",   // 118
    "The body keeps the count. She knows.",   // 119
    "Last one back. She let me say it.",   // 120
    "She stands so the survivors aren't alone.",   // 121
    "Told her who I was before. She poured.",   // 122
    "We both lie in past tense, she said.",   // 123
    "It marks the after. She said keep it close.",   // 124
    "She wouldn't hold it. Said it gets me home.",   // 125
    "She kept my door. I'll keep hers.",   // 126
    "Held the quiet for her this time.",   // 127
    "The one I won't toast is me.",   // 128
    "The toast isn't a lie. She'll wait.",   // 129
    "Last one standing. Someone has to remember.",   // 130
    "They stopped. I got the tab.",   // 131
    "Been paying the wrong debt for years.",   // 132
    "She's paying a ghost too.",   // 133
    "The hands aren't broken. They're loyal.",   // 134
    "She hides her shaking hand too.",   // 135
    "Said the daylight version. Watched it dawn.",   // 136
    "The open is her only reason.",   // 137
    "Told them where the money came from.",   // 138
    "Said I'd starve before they did. Meant it.",   // 139
    "Asked how many we had left. Slowed down.",   // 140
    "Promised the rest of the grey. Show it, don't say it.",   // 141
    "Neither of us remembers it. We faked the bowl.",   // 142
    "Said it just needed them across the table.",   // 143
    "Admitted I meant it. They set it down.",   // 144
    "Apologized for who I used to be. We started over.",   // 145
    "Asked which one they'd see. Took the date anyway.",   // 146
    "Asked them to stand with me. They will.",   // 147
    "Told them what they covered. Still mine, they said.",   // 148
    "Wasn't alone out there. Never was.",   // 149
    "Thought they were quitting me. Light's on at home.",   // 150
    "Carried their bag to the train. One good goodbye.",   // 151
    "Gave them the better version to raise the kid on.",   // 152
    "Asked to meet the kid for real. No more myth.",   // 153
    "Let them pay. Didn't argue. That's new.",   // 154
    "Told them how I got it. They kept it.",   // 155
    "Not forgiven. Just sat with. Truer.",   // 156
    "Held the bowl. Said I'd come more.",   // 157
    "Same kid under it. Let them feel that.",   // 158
    "Fear the war, not me. They eased.",   // 159
    "Took the ghost's seat. Made us two.",   // 160
    "Kept a seat too. We let it go.",   // 161
    "Carried the recipe. Home that survives me.",   // 162
    "Learned it by hand. Got it right.",   // 163
    "Gave them the part the camera missed.",   // 164
    "They knew me before the camera. Stayed.",   // 165
    "Can't always tell. They'll keep checking.",   // 166
    "Got the plot number. Going. Together.",   // 167
    "Grieved them out loud. Late, but there.",   // 168
    "Took half their grudge. Lighter for both.",   // 169
    "Promised them the first transport. Meant it.",   // 170
    "Told them the asking pulls me back.",   // 171
    "Made them ask out loud. Got my orders.",   // 172
    "Conceded it all. Just wanted the years.",   // 173
    "Called it a draw. Closed for good.",   // 174
    "Both argued an empty seat for years.",   // 175
    "Their hands shake now. Nobody's been holding them.",   // 176
    "Promised nothing. Showed up. That was the gift.",   // 177
    "We both shake now. Different wars, same noise.",   // 178
    "Stood at the grave a year late. Still counts.",   // 179
    "Pinned the ribbon. Stood the grave I could.",   // 180
    "Couldn't stand one grave. It opens all of them.",   // 181
    "They kept talking to a coat. I never answered.",   // 182
    "Put the real me in the pocket. Finally.",   // 183
    "Took the coat back. One thing from before.",   // 184
    "They lost the house. Telling me was the ask.",   // 185
    "Called it back rent. They let me pay.",   // 186
    "No money. Just my face across the table.",   // 187
    "There's a kid waiting up for me. Didn't know.",   // 188
    "Sent the worn patch. Not the shiny lie.",   // 189
    "The story is: don't grow up to be me.",   // 190
    "Let them hate me so they'd stay safe.",   // 191
    "Left so they wouldn't watch me drown.",   // 192
    "I broke it. Said so out loud. We restart.",   // 193
    "Settled the tab. The real one.",   // 194
    "Told them how I got it. Square.",   // 195
    "Left it owed. So we'd meet again.",   // 196
    "Paid it off. Done. Lighter, somehow.",   // 197
    "Filled his bowl. Sat the funeral late.",   // 198
    "Let one of them land. Finally.",   // 199
    "Stayed. Watched his bowl go cold.",   // 200
    "It was never the food. It was us.",   // 201
    "Make it wrong forever. With me.",   // 202
    "Carrying the last of the handwriting.",   // 203
    "Told them to let it rest. They couldn't.",   // 204
    "Walked out the same direction. Finally.",   // 205
    "Walked them all the way home. New.",   // 206
    "Said what I want after. Out loud.",   // 207
    "Didn't promise. Just followed them out.",   // 208
    "We sang the dead song. Just us.",   // 209
    "Told {them} why the song hurts.",   // 210
    "His hand quit shaking under mine.",   // 211
    "Made him hold it. He didn't spill.",   // 212
    "Watched them dance. Didn't envy it. Much.",   // 213
    "Said the soft want. {them} didn't laugh.",   // 214
    "{them} took the room so I didn't have to.",   // 215
    "Told {them} what I'm always watching for.",   // 216
    "Neither of us sleeps. Now neither's alone.",   // 217
    "Gave {them} the loop. {them} held an end.",   // 218
    "No word for it. That's the point.",   // 219
    "Last two standing. That's the word.",   // 220
    "Made {them} promise to fix it. For me.",   // 221
    "Some wounds stay open. We watch them together.",   // 222
    "Some songs you just skip together.",   // 223
    "Same dead chorus, word for word.",   // 224
    "Heard the real number. Didn't flinch.",   // 225
    "Told them I'd cover the bad side.",   // 226
    "We both wave at who we'd have been.",   // 227
    "Got a real laugh out of them. Worth it.",   // 228
    "Two people who know the empty room.",   // 229
    "Last table's ours now. Standing thing.",   // 230
    "Said the true part. They didn't flinch.",   // 231
    "Truth gets one seat. It's theirs.",   // 232
    "Heard the plan they gave up. Bought the round.",   // 233
    "Made them keep half. They kept it.",   // 234
    "Same silence. Different field.",   // 235
    "Now we look for each other first.",   // 236
    "We left the noise loud. Stayed awake in it.",   // 237
    "Told them what I drown. They kept pace.",   // 238
    "Drank to the count. Honest, and it cost us.",   // 239
    "Told them the after. They made it an order.",   // 240
    "We picked a someplace. Filed it. Survive toward it.",   // 241
    "We'll rot in formation. Cover each other's gaps.",   // 242
    "Held the shake still. Told me not to make it weird.",   // 243
    "Lied that the shake didn't matter. The good kind.",   // 244
    "We both carry it. Lighter, shared.",   // 245
    "They'd rather owe me forever. Let it stand.",   // 246
    "Paid in full. He'd kill me himself first.",   // 247
    "Shook on it. Whoever's left does the claiming.",   // 248
    "Told them why no one'd come. They would.",   // 249
    "One's the number that keeps you out of the river.",   // 250
    "Bled quiet together to one old song.",   // 251
    "Whoever's worse off gets the wall. Done.",   // 252
    "Gave it back. He held the room anyway.",   // 253
    "Made the death-tune mean us instead.",   // 254
    "It never quits. You walk anyway.",   // 255
    "Two dead screens. Lost, on purpose, together.",   // 256
    "If they come for him, I'm the call.",   // 257
    "Bad mornings, you text me. Both ways.",   // 258
    "It never stops. We took the long way.",   // 259
    "We're the same kind of dangerous. Knew it.",   // 260
    "Money's the easy debt. Told them so.",   // 261
    "Told them the real debt. They stayed.",   // 262
    "Nobody listens to the warning. We didn't.",   // 263
    "Aim them past the war. They agreed.",   // 264
    "The last ones standing share the smoke.",   // 265
    "It never happened. So it did.",   // 266
    "We work. Neither of us wanted that.",   // 267
    "Back to hating them by morning. Good.",   // 268
    "They carried my kill. Now they know why.",   // 269
    "The world keeps the lie. We keep the truth.",   // 270
    "Keep them all. The proof's the point.",   // 271
    "No stories. Just what's left of us.",   // 272
    "We're all wearing a dead one's moves.",   // 273
    "Pass it on. Don't sign it.",   // 274
    "Square and strangers. Their safest wish.",   // 275
    "We'll die owing. I prefer it.",   // 276
    "We both keep a room for a ghost.",   // 277
    "Same rail, same nothing. Every night.",   // 278
    "Never let them down. They hate it.",   // 279
    "Outlive me. That's the whole tribute.",   // 280
    "Filed murder as policy. They knew.",   // 281
    "Unbuild it together. Mostly out of spite.",   // 282
    "Same week. Same shell. No sorry needed.",   // 283
    "Told the true version. They believed it.",   // 284
    "Saw the tremor. Said nothing. Bought silence.",   // 285
    "Two of us carrying the invisible one.",   // 286
    "Paid it back square. We owe nothing.",   // 287
    "Left it owed. A reason to return.",   // 288
    "Dropped the ledger. They'd cover me too.",   // 289
    "Confessed the worst. Tab's still open.",   // 290
    "Drank to a draw. Walked them out.",   // 291
    "They tapped out. Won't say it sober.",   // 292
    "We both come to drown the quiet.",   // 293
    "Said the want out loud. They said go.",   // 294
    "Not friends. Witnesses. We keep it honest.",   // 295
    "Split the ghost. Toasted the dead together.",   // 296
    "Asked the week. Nobody ever asks the week.",   // 297
    "Kept the lighter. Kept the hand too.",   // 298
    "Said it suited them. They stopped hiding it.",   // 299
    "We came back wrong the same way.",   // 300
    "Didn't look away. They stopped flinching.",   // 301
    "Gave them the song back. Ours now.",   // 302
    "The dead don't pick the playlist.",   // 303
    "Not a dance. Just holding each other up.",   // 304
    "Last time was holding the dying. Stay made.",   // 305
    "Sent it myself. No more almost.",   // 306
    "I was the question with no bad answer.",   // 307
    "Walked nowhere with them. Best nowhere yet.",   // 308
    "Said it back. Settled. Just us knowing.",   // 309
    "Told them my someday. Take me with.",   // 310
    "Showed the seam. They showed theirs.",   // 311
    "Left my hand on the broken part.",   // 312
    "Said I'd want to be there. Out loud.",   // 313
    "Named my ghost. They didn't look away.",   // 314
    "We butchered it together. They laughed.",   // 315
    "Stayed for the bad song. So did they.",   // 316
    "The drinks weren't drinks. I knew.",   // 317
    "Even trade. The hand-off ran long.",   // 318
    "Cashed the drinks for somewhere quieter.",   // 319
    "We agreed not to name the good thing.",   // 320
    "Stopped dancing. Just held the upright.",   // 321
    "Said don't let it end. They didn't.",   // 322
    "Held them with no angle. First in years.",   // 323
    "Said nothing. Didn't have to.",   // 324
    "Told them where the steady hands came from.",   // 325
    "Patched the hand. Kept holding it.",   // 326
    "Wanted to settle it. They talked me down.",   // 327
    "Took their ghost's song. Made it ours.",   // 328
    "Promised not to die. They made me repeat it.",   // 329
    "The fight was them refusing to lose me.",   // 330
    "Mended it. Called it load-bearing. It is.",   // 331
    "Said my someday. They said ours.",   // 332
    "One pile now. They stayed anyway.",   // 333
    "Drew myself into their escape. They sealed it.",   // 334
    "Didn't need the map. Just them.",   // 335
    "Steady when it counts. Pay after.",   // 336
    "Warm hands. Don't watch the shake.",   // 337
    "The shake's the human part. Keep it.",   // 338
    "The face follows. Then they take turns.",   // 339
    "Put something human on the scale.",   // 340
    "You don't set it down. You carry it.",   // 341
    "Held the one that won't stop, with them.",   // 342
    "Tire the body so the mind shuts up.",   // 343
    "Four AM is mine now. So be it.",   // 344
    "Build the door before you need it.",   // 345
    "Find out who's under the uniform.",   // 346
    "Pick a date. Don't live on someday.",   // 347
    "The hope's the charm. Not the trinket.",   // 348
    "Gave them my words. The ones I never share.",   // 349
    "It's not about living. It's going back.",   // 350
    "Truth or kindness, you carry it.",   // 351
    "Their thank-you weighs the most.",   // 352
    "Gave them my worst call to spare theirs.",   // 353
    "Said the name. That was the toast.",   // 354
    "Carry one name. Let the room hold the rest.",   // 355
    "I owe the dead my old age.",   // 356
    "Their fear of spending me means they'll lead right.",   // 357
    "Gave them the last lesson. Command's lonely.",   // 358
    "Just said I was proud. No lesson.",   // 359
    "Couldn't stop their shake. Taught them to spend it.",   // 360
    "Showed them my shake so they'd keep theirs.",   // 361
    "Told them the still hand is the dead one.",   // 362
    "Gave them my worst day so they'd keep theirs.",   // 363
    "Killed their cape. Gave them a head count.",   // 364
    "Told them being believed in gets you spent.",   // 365
    "Gave them a one-word funeral. It held.",   // 366
    "Pulled the loop out of their head into the air.",   // 367
    "Told them to mourn before the next op's scheduled.",   // 368
    "Handed them the reason. Asked them to make me leave.",   // 369
    "It's their list now. I'm the one being covered.",   // 370
    "Asked them to bench me when it's time.",   // 371
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
          land:{ reply:"{them} doesn't say it back. Doesn't have to. Inseparable, now.", ev:78, fl:'CLOSEST' } },
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
          land:{ reply:"You sit the way you both still sit. Backs covered, eyes on the room. Nobody names it. It doesn't need naming.", ev:80 } },
        { approach:'probing', line:"Ask {them} how long since they slept with the lights off.",
          land:{ reply:"\"Longer than I'll admit sober.\" {them} doesn't dress it up. Neither do you. The bass takes the rest.", ev:11 } },
        { approach:'blunt', line:"Tell {them} the war's over and the chair won't move itself.", check:true,
          land:{ reply:"{them} snorts. \"Says the one facing the door.\" Caught, both of you. First easy thing in weeks.", ev:80 },
          miss:{ reply:"It comes out harder than {me} meant. {them} just nods, slow, and lets the bass have the table back.", pts:0 } },
      ] },
    { id:'club.tab', venue:'club', kind:'friend', req:{minTier:1, maxTier:2},
      open:[
        "{them}'s card gets declined at the bar — pension's late again — and {me} is sliding chits across before anyone can frown.",
        "Kitchen's out of everything but the cheap stuff, so {them} buys two of the worst drinks in the place and sets one in front of {me} like a dare.",
        "{them} is short for the round and trying not to show it. {me} covers it without making it a thing."],
      choices:[
        { approach:'warm', line:"Wave off the thanks. \"You'd have done it. Drink.\"",
          land:{ reply:"{them} drinks. Doesn't make a speech of it. Next bad week you both know who picks up the chits. It stops being a question.", ev:81 } },
        { approach:'blunt', line:"Tell {them} the company still owes you both more than a round.", check:true,
          land:{ reply:"\"More than they'll ever pay,\" {them} says, and clinks the bad drink against yours. Two people the same machine used up, splitting what it left them.", ev:82 },
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
          land:{ reply:"{them} snorts. \"Stubborn.\" Neither moves. Neither has to. It's not warmth, but it holds.", ev:79 },
          miss:{ reply:"{them} drinks, eyes on the bottles. The silence wins. Nothing settles tonight.", pts:0 } },
        { approach:'probing', line:"Ask {them} which front they came off of.",
          land:{ reply:"{them} names it. {me} names {me}'s. Same war, wrong ends of it. That doesn't make {them} family. Makes {them} someone {me} can't write off." } },
        { approach:'blunt', line:"Match {them}'s drink. Order the same, say nothing.", check:true,
          land:{ reply:"{them} watches the pour, then lifts the glass an inch. Not a toast. A line drawn. {me} lifts back.", ev:79 },
          miss:{ reply:"{them} leaves before the second round. {me} drinks both. Some respect you earn twice.", pts:0 } },
      ] },
    { id:'diner.cold_broth', venue:'diner', kind:'kin', req:{minTier:0, maxTier:1},
      open:[
        "{npc} doesn't get up. Slides the second bowl across the table with one finger. \"Sit before it goes stone-cold like the last one.\"",
        "{npc} is in the corner booth again, two bowls already steaming. \"Knew you'd come the long way around. You always did. Runs in the blood.\""],
      choices:[
        { approach:'warm', line:"Sit. Eat the broth {npc} ordered without being asked.",
          land:{ reply:"You eat in the quiet that isn't a fight, for once. {npc} watches the bowl go empty and says nothing. That's plenty.", ev:76 } },
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
          land:{ reply:"{npc} goes still. \"Yeah. Me too. Every time the broth comes out right.\" Nobody leaves. The booth holds two again.", ev:77 } },
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
          land:{ reply:"{npc} keeps drying the same glass. \"Somebody's at the bar when the news comes in. Better me than a wall.\" She lets the quiet sit. {me} sits in it with her.", ev:75 } },
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
    // +++ tripled drop (E9): 122 new multi-beat scenes
    { id:"bar.the_tab", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} taps a chalk line on the slate behind the bottles — a name, a number, no surname. \"That's a tab I'll never collect. He's not coming back to clear it. I leave it up anyway. Tell me you understand that or finish your drink and go.\"", "{npc} slides {me} a drink and nods at the slate of unpaid tabs behind her. \"Half those names are dead. I keep the chalk up. You're the type who'd argue I should wipe it. Argue, then.\"" ], choices:[
          { approach:"warm", line:"Tell her to leave the chalk up. The dead should still owe somebody something.", land:{ reply:"\"Owing keeps them a person. A number you cleared is just a number.\" She doesn't wipe it.", next:1 } },
          { approach:"blunt", line:"Tell her a dead man's tab is sentiment she can't afford.", check:true, land:{ reply:"\"Sentiment's the only thing in here nobody's tried to repo.\" She leaves it up and pours again.", next:1 }, miss:{ reply:"She caps the bottle. \"Then you can do your accounting somewhere with worse whiskey.\" The slate stays.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her how much of what {me} owes is the kind that never shows on a slate.", land:{ reply:"\"All the real debt's invisible. You came in carrying a ledger nobody can read but you.\" {me} settles the visible tab and leaves the rest where it sits.", ev:83 } },
          { approach:"warm", line:"Offer to cover one of the dead names on her slate.", land:{ reply:"\"Can't. It's his, not yours — clearing it's stealing.\" But she slides {me} the drink that would've been his, on the house.", ev:84 } },
          { approach:"blunt", line:"Drink, say nothing, and let the slate keep its dead.", land:{ reply:"\"Good. Some nights the right answer is the empty glass.\" She lets the quiet hold.", pts:0 } } ] }
      ] },
    { id:"bar.the_scar", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} watches {me} favor one side easing onto the stool. \"You sit down like something in you's still healing wrong. I've poured for enough of you to know the body keeps a worse record than the company does. Where'd you pick that one up?\"", "{npc} sets the glass down on {me}'s good side without being told. \"You reach with the left now. Used to be the right. The body files its own paperwork. Going to tell me, or make me guess?\"" ], choices:[
          { approach:"warm", line:"Tell her it's old, and it only talks when the weather turns.", land:{ reply:"\"Everything old talks when the weather turns. That's why the bar's full on cold nights.\" She pours.", next:1 } },
          { approach:"blunt", line:"Tell her the body's a liar and the company's medics agreed.", land:{ reply:"\"Medics sign you fit so they don't owe you. The body never signs anything.\" She slides the glass closer.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask if she's got one of her own she sits careful around.", land:{ reply:"She rolls a sleeve halfway, then stops. \"Mine's older than your war. Point is — it healed crooked and I built the rest of me around the crook.\" {me} understands the lesson is for {me}.", ev:85 } },
          { approach:"warm", gate:"trauma", line:"Tell her the scar's the easy part — the hard part is {trauma}.", land:{ reply:"She doesn't reach for comfort. \"The skin closes first. It's always the thing under it that takes years.\" She lets {me} sit in it.", ev:86 } },
          { approach:"blunt", line:"Finish the drink and keep the scar to yourself.", land:{ reply:"\"Suit yourself. It'll still be there when you change your mind.\" She moves down the rail.", pts:0 } } ] }
      ] },
    { id:"bar.empty_stool", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "There's a stool nobody takes, two down from {me}, with a glass set in front of it and no drinker. {npc} catches {me} looking. \"That one's spoken for. Sat there four years, then didn't. I still pour his first one out. Bar's got its own dead. Surprised?\"", "{npc} sets a glass at an empty stool, untouched, then comes back to {me}. \"You're wondering who that's for. He doesn't drink it anymore. I pour it anyway. You of all people shouldn't have to ask why.\"" ], choices:[
          { approach:"warm", line:"Tell her you'll leave his stool alone.", land:{ reply:"\"Everybody does eventually. Took the new ones a month to stop trying to sit there.\" She nods at {me} like {me} passed something.", next:1 } },
          { approach:"probing", line:"Ask who he was, before he was a poured-out glass.", land:{ reply:"\"A bad tipper with a good laugh. Outlived two of my staff and none of his own bad habits.\" She almost smiles.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask how she keeps pouring for the gone without it hollowing her out.", land:{ reply:"\"It does hollow you. You just learn the hollow's load-bearing.\" {me} sits a while in the company of her dead instead of {me}'s.", ev:87 } },
          { approach:"warm", line:"Tell her {me}'s got a stool like that too, somewhere, still set.", land:{ reply:"\"Course you do. We all keep one chair we won't let anyone else sit in.\" She tops {me} off and the dead share the rail.", ev:88 } },
          { approach:"blunt", line:"Tell her pouring for ghosts is how you go soft.", land:{ reply:"\"Or how you stay a person. I'll risk soft.\" She doesn't move the glass.", pts:0 } } ] }
      ] },
    { id:"bar.remember_or_forget", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} holds the bottle over {me}'s glass and doesn't tip it yet. \"Two kinds drink at my bar. One's trying to forget a night. The other's trying to keep one. The pour's the same; the man isn't. Which are you tonight?\"", "{npc} pauses mid-pour and looks {me} dead on. \"Before I fill this — are we drinking to lose a thing or to hold it? I pour different for each, even if the glass don't know it.\"" ], choices:[
          { approach:"warm", line:"Tell her tonight {me}'s trying to keep one. The forgetting comes free.", land:{ reply:"\"Good answer. The forgetting always comes free — it's the keeping that costs.\" She pours slow.", next:1 } },
          { approach:"blunt", line:"Tell her you're drinking to forget and you'd thank her not to interview you about it.", check:true, land:{ reply:"\"Forgetting it is.\" She fills it to the line and lets {me} be. \"For the record, it doesn't take.\"", next:1 }, miss:{ reply:"\"Forget on your own dime, then.\" She sets the bottle down and finds something else to wipe.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask which kind she is, the nights she pours her own.", land:{ reply:"\"Neither. I stopped trying to forget years back — found out the ones worth keeping forget you first.\" {me} drinks to the ones {me} won't let go of.", ev:89 } },
          { approach:"warm", gate:"dream", line:"Tell her there's one thing {me}'d rather keep than any of it: {dream}.", land:{ reply:"\"Then drink to that and nothing else tonight.\" She raises the rag like a glass. \"Cheaper than the dead, and it might still happen.\"", ev:90 } },
          { approach:"blunt", line:"Drink it down and decide later which kind you were.", land:{ reply:"\"They all decide later. That's what the second round's for.\" She leaves the bottle within reach.", pts:0 } } ] }
      ] },
    { id:"bar.the_green_one", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "A kid in fresh-issue gear is buying rounds for the room two stools down, too loud, too whole. {npc} cuts {me} a look. \"That one hasn't lost anybody yet. You can hear it. Three rosters tells me how long that lasts. You want to warn him, or let him have the night?\"", "{npc} watches a green recruit laughing too easy at the end of the bar, then turns to {me}. \"Looks like you did, the first month. Before the war started subtracting. Say the word and I'll water his next one. Or we let the kid be a kid.\"" ], choices:[
          { approach:"warm", line:"Tell her to let him have the night. The subtraction starts soon enough.", land:{ reply:"\"That's mercy, not weakness. People confuse them.\" She lets the kid laugh.", next:1 } },
          { approach:"blunt", line:"Tell her a warning's wasted on the green. They have to learn it the expensive way.", land:{ reply:"\"They always do. I just hate watching the tuition come due.\" She pours {me} one and doesn't charge.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask if she ever sees one of them and knows, just knows, they won't make the next leave.", land:{ reply:"\"Every roster has a face like that. I stop learning their names. Coward's mercy. Keeps me pouring.\" {me} watches the kid and says nothing.", ev:91 } },
          { approach:"warm", line:"Buy the kid's next round yourself, no speech attached.", land:{ reply:"\"Look at that. You did the only useful thing.\" She runs it to the kid without saying who from.", ev:92 } },
          { approach:"blunt", line:"Decide the kid's not your problem and turn back to the glass.", land:{ reply:"\"None of them are, till they are.\" She lets it drop.", pts:0 } } ] }
      ] },
    { id:"bar.the_shake", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "The glass rattles a little against the rail when {me} sets it down — a tremor that wasn't there last roster. {npc} clocks it and doesn't comment, just switches {me} to a tumbler that won't ring. \"Heavier glass. Easier to hold steady. I didn't say anything. I'm not going to.\"", "{npc} watches {me}'s hand take the glass and quietly swaps it for a low, heavy one. \"That's the one I give the ones whose hands have started keeping score. No charge for the upgrade. No questions either, unless you've got one.\"" ], choices:[
          { approach:"warm", line:"Thank her for not making it a thing.", land:{ reply:"\"Making it a thing is what the medics do. I just pour.\" She sets the heavy glass square in front of {me}.", next:1 } },
          { approach:"blunt", line:"Tell her the shake's nothing. Cold hands.", check:true, land:{ reply:"\"Sure. Cold hands.\" She lets the lie stand, but the heavy glass stays. \"It's yours when it isn't cold, too.\"", next:1 }, miss:{ reply:"She just looks at {me} until the lie gets small, then walks the rail. The heavy glass stays where she put it.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask how many hands she's watched start to go before the rest of the man did.", land:{ reply:"\"More than I'll count out loud. The hands always go first. The pride goes last and loudest.\" {me} holds the heavy glass and it doesn't ring.", ev:93 } },
          { approach:"warm", gate:"trauma", line:"Admit the shake isn't the body — it's {trauma}, finding the exit through {me}'s hands.", land:{ reply:"\"The body bills you for what the head won't say. Always has.\" She doesn't flinch, just keeps the heavy glass full.", ev:94 } },
          { approach:"blunt", line:"Set the glass down carefully and let it go unspoken.", land:{ reply:"\"Unspoken's a tab too. I keep those clean.\" She lets it lie.", pts:0 } } ] }
      ] },
    { id:"bar.the_sleepless", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "It's the dead hour, the one between drunks and deliveries. {me}'s the only one left. {npc} doesn't flip the sign. \"You don't come in to drink. You come in so the room you're not sleeping in has somebody else in it. I know the math. I keep the worst hour open for exactly that.\"", "{npc} is closing down, chairs going up, and stops when she sees {me} won't move. \"You're not waiting on another round. You're waiting on the part of the night that doesn't have your name on it. Sit. I'll leave the one lamp.\"" ], choices:[
          { approach:"warm", line:"Admit the bar's quieter than wherever you're meant to be sleeping.", land:{ reply:"\"Quiet with company. That's the rare kind.\" She leaves the lamp on and keeps wiping a clean rail.", next:1 } },
          { approach:"probing", line:"Ask if she sleeps, or just closes and opens.", land:{ reply:"\"I sleep when the city does, which is never, so. We're built the same, you and me.\" She pulls a stool of her own.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what she does with the hour when even the bar's empty and it's just her and the dark.", land:{ reply:"\"Count the glasses. Easier than counting the years.\" {me} stays through the worst hour with her and neither of them says it's company. It is.", ev:95 } },
          { approach:"warm", line:"Tell her you'll go when the deliveries come, and not a minute sooner.", land:{ reply:"\"Deal. The crates show at five. We've got the dark till then.\" She refills two coffees and rings up none.", ev:96 } },
          { approach:"blunt", line:"Tell her you'll head out and try the empty room again.", land:{ reply:"\"Door's where it always is. So's the lamp, if the room wins.\" She lets {me} go without a word about it.", pts:0 } } ] }
      ] },
    { id:"bar.the_commendation", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{me} sets a company commendation chit on the bar — fresh issue, still warm from the desk that printed it. {npc} reads it upside down without picking it up. \"They give you a medal when the bill comes due and they don't want to pay it in money. I've seen a hundred of these slide across this wood. Want a drink to go with the receipt?\"", "{npc} eyes the shiny chit {me} drops by the glass. \"Commendation. That's corporate for 'we'd rather not discuss what it cost.' I'll trade you a real drink for it. Bar doesn't take medals, but I'll listen to one.\"" ], choices:[
          { approach:"warm", line:"Tell her you don't know why you even kept it this far.", land:{ reply:"\"You kept it because somebody has to say it was worth something. Might as well be the company that won't.\" She pours.", next:1 } },
          { approach:"blunt", line:"Slide the chit toward her and tell her to put it behind the bar with the rest of the trash.", land:{ reply:"\"I've got a drawer of these. None of them tip.\" She drops it in with a clink that says it's not the first.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what the company actually took to print that little piece of metal.", land:{ reply:"\"More than the chit weighs. They never round up the cost, only the medal.\" {me} leaves the commendation on her bar and the weight of it stays with {me}.", ev:97 } },
          { approach:"warm", gate:"crime", line:"Tell her the medal's a joke — the company never knew about {crime}, the thing {me} actually did to earn the silence.", land:{ reply:"She doesn't blink. \"They pin the version that flatters the contract. The real one stays at the bar.\" The medal means even less now; the telling, more.", ev:98 } },
          { approach:"blunt", line:"Pocket the chit again and finish the drink without a word.", land:{ reply:"\"Keep it. Some nights the trash is all the proof you've got.\" She lets it go back in {me}'s coat.", pts:0 } } ] }
      ] },
    { id:"bar.the_tab_2", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} taps a worn ledger under the rail without opening it. \"You've run a tab here six weeks and never asked the number. Most people want to know what they owe. You don't. Why's that.\"", "{npc} slides {me}'s glass over and doesn't write it down. \"I keep a book on every regular. Yours, I stopped filling in. Figured you carry enough columns that don't balance.\"" ], choices:[
          { approach:"warm", line:"Tell her {me} stopped counting what {me} owes a long time ago — it never zeroes out.", land:{ reply:"\"No. It doesn't.\" She pours anyway. \"I run the book so you don't have to. That's the whole job.\"", next:1 } },
          { approach:"blunt", line:"Tell her to put the real number on the rail and {me}'ll pay it tonight.", check:true, land:{ reply:"\"That's not the number that scares you and we both know it.\" She leaves the book shut.", next:1 }, miss:{ reply:"She slides the book back under the rail. \"Pay the bar tab, then. Easy one. We'll leave the rest.\"", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her what the regulars who ran the longest tabs all had in common.", land:{ reply:"\"They paid in full the night before they didn't come back. Every time. So no — keep yours open. I like the ones who stay in the red.\"", ev:99 } },
          { approach:"warm", line:"Tell her whatever {me} owes, {me}'ll be back to keep owing it.", land:{ reply:"\"Good.\" She finally writes one line in the book — just the date. \"That's all I needed in there.\"", ev:100 } } ] }
      ] },
    { id:"bar.the_shake_2", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} watches {me}'s hand fail to lift the glass clean — a fine tremor running the wrist. She doesn't reach to steady it. \"It's louder when you think nobody's looking. How long.\"", "{npc} sets the glass down close so {me} won't have to reach. \"Your pour hand's started shaking. I've seen it three times across this bar. Twice it was the war. Once it was the cure. Which is yours.\"" ], choices:[
          { approach:"warm", line:"Admit the shake started after the company, and it hasn't asked permission to stop.", land:{ reply:"\"Bodies keep the receipts the mind tries to lose.\" She switches {me} to a heavier glass, harder to spill.", next:1 } },
          { approach:"blunt", line:"Tell her it's nothing, hold the hand flat on the rail to prove it.", check:true, land:{ reply:"The hand betrays {me} on the rail. She just nods. \"Nothing. Sure.\" And lets the lie stand because {me} needed it to.", next:1 }, miss:{ reply:"It steadies long enough to pass. She pretends to buy it and moves down the bar.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell her the hand only shakes when {me} stops moving — and why, that {trauma}.", land:{ reply:"She doesn't tell {me} to see a medic. \"Then it's not broken. It's remembering for you.\" She pours one and sets it where the steady hand can find it.", ev:101 } },
          { approach:"warm", line:"Ask her how the other two stories ended.", land:{ reply:"\"One drank till it stopped mattering. One learned to hold the glass two-handed and kept showing up.\" She pushes the heavy glass an inch closer. \"I'd rather pour for the second kind.\"", ev:102 } } ] }
      ] },
    { id:"bar.wrong_hour", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "Hour past close, the chairs already up. {npc} unlocked the door for {me} anyway. \"Nobody comes at this hour to drink. They come because the dark in their own place got too loud. Sit.\"", "The Late Shift's dead, lights half down, {npc} alone counting the drawer. She doesn't send {me} away. \"This is the hour the ones who can't sleep find me. I keep a stool warm for it.\"" ], choices:[
          { approach:"warm", line:"Admit {me} hasn't slept right since the war and the room back home is the worst place to be awake.", land:{ reply:"\"That's why there's a bar at the end of the world. Somewhere to be awake that isn't a ceiling.\" She pours half and sits one stool down.", next:1 } },
          { approach:"blunt", line:"Tell her {me} doesn't need company, just somewhere the lights stay on.", check:true, land:{ reply:"\"Lights are on. I'll be over there.\" She moves to the far end and leaves {me} the quiet — which is its own kind of company.", next:1 }, miss:{ reply:"She shrugs, locks the drawer, keeps counting. The offer doesn't come twice tonight.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her what she does at this hour, when the last of them finally goes.", land:{ reply:"\"Wipe a clean bar. Stand in a room that's quiet for an honest reason.\" She slides {me} a coffee instead of a refill. \"You should learn the difference.\"", ev:103 } },
          { approach:"warm", line:"Stay till the lights come up and thank her for not asking {me} to talk.", land:{ reply:"\"Talking's for people who think it helps.\" She lets {me} sit through to grey light and locks up around {me}, not against {me}.", ev:104 } } ] }
      ] },
    { id:"bar.the_empty_stool", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} clocks {me} sitting one stool off the rail again, the near seat left open. \"You always leave that one empty. Like you're holding it. Nobody you're waiting for is coming through that door, are they.\"", "{npc} starts to wipe down the stool beside {me} and {me}'s hand twitches to stop her. She reads it and steps back. \"Saving a seat. Three rosters and I still know that move cold.\"" ], choices:[
          { approach:"warm", line:"Admit {me} keeps the seat for someone who used to take it — and never will again.", land:{ reply:"\"Then I won't clean it.\" She sets a glass in front of the empty stool, doesn't fill it, doesn't charge it. \"It stays set.\"", next:1 } },
          { approach:"blunt", line:"Tell her it's just a stool and to wipe it like the rest.", check:true, land:{ reply:"She wipes it slow, watching {me} not watch her. \"Just a stool. Right.\" She sets the rag down and leaves it half-done.", next:1 }, miss:{ reply:"She cleans it brisk and professional and lets {me} pretend it didn't cost anything.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her how long the other regulars kept saving seats for the ones who didn't make it.", land:{ reply:"\"Some never stopped. The good ones started saving it for whoever needed it next instead.\" She nudges the empty glass toward the door. \"That's how the room stays alive.\"", ev:105 } },
          { approach:"warm", line:"Pour the empty glass yourself and drink it for them.", land:{ reply:"She watches {me} finish it without a word, then takes the glass like it mattered. \"There. Now they've had their round at my bar too.\"", ev:106 } } ] }
      ] },
    { id:"bar.that_song", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "Something old crackles out of the jukebox and {me}'s whole body goes still mid-pour. {npc} catches it. \"That song just took you somewhere. I can kill it, or you can tell me where it took you.\"", "{npc} sees {me} flinch when the track changes — a tune that means something it shouldn't. \"That one's got hooks in you. Want it off, or you want to sit in it.\"" ], choices:[
          { approach:"warm", line:"Tell her to leave it — it's the only thing left that still smells like {home}.", land:{ reply:"She lets it ride to the end and doesn't queue another over it. \"Then we let it play out. No charge for the room while it does.\"", next:1 } },
          { approach:"blunt", line:"Tell her to cut it, now.", check:true, land:{ reply:"She kills it mid-bar. The silence is worse and {me} feels her notice that too. \"Quieter. Not better. I see it.\"", next:1 }, miss:{ reply:"She pulls the plug on the box and moves on. The room goes flat and {me} lets it.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her if there's a song she keeps off the box on purpose.", land:{ reply:"\"One. I pulled the chip myself.\" She doesn't say what it was. \"Some tunes you only get to survive once. Yours, you're still deciding.\"", ev:107 } },
          { approach:"warm", line:"Tell her who {me} used to hear that song with.", land:{ reply:"She doesn't ask a single follow-up, just refills slow so the quiet has somewhere to go. \"They had good taste. Stays on the box. House standing order.\"", ev:108 } } ] }
      ] },
    { id:"bar.the_coin", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{me}'s turning the dead man's coin over and over on the rail without noticing. {npc} watches it catch the light. \"You've worried that thing smooth. That's not a lucky charm. That's a debt you carry in your pocket.\"", "{npc} sets {me}'s glass down beside the worn token {me} keeps fidgeting. \"I've watched you pay with everything but that. Whose was it.\"" ], choices:[
          { approach:"warm", line:"Admit it was theirs, and {me} took it off them after, and {me} can't put it down.", land:{ reply:"\"Some things you don't put down. You just get strong enough to carry them lighter.\" She doesn't ask to hold it.", next:1 } },
          { approach:"blunt", line:"Slide it across the rail and tell her to keep it behind the bar.", check:true, land:{ reply:"She pushes it back without looking. \"I keep glasses, not ghosts. That one's yours to set down when you mean it, not when you're tired of it.\"", next:1 }, miss:{ reply:"She pockets nothing, slides it back, and lets the matter drop with the coin.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her what the regulars who carried things like this finally did with them.", land:{ reply:"\"Buried them, mostly. Or left them on a bar like this one for the next ghost to find.\" She taps the rail. \"This bar's seen a few. It can hold one more when you're ready.\"", ev:109 } },
          { approach:"warm", line:"Put the coin away for the night and just hold the glass instead.", land:{ reply:"She notices the pocket close over it and pours fresh. \"There. One night your hands held something that wasn't them. Start there.\"", ev:110 } } ] }
      ] },
    { id:"bar.the_mirror", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{me} catches {me}'s own reflection in the bar mirror between the bottles and doesn't recognize the face fast enough. {npc} sees the lag. \"You looked at yourself like a stranger walked in. Happens to the ones who changed more than they meant to.\"", "{npc} stops drying a glass when {me} stares too long at the mirror behind the rail. \"That's the look of somebody doing the math on who they used to be. I keep that glass clean so people have to face it.\"" ], choices:[
          { approach:"warm", line:"Admit {me} doesn't know the person in that glass anymore — the company carved someone else into {me}.", land:{ reply:"\"Job does that. Pays you in a face you have to learn from scratch.\" She doesn't tell {me} the old one's still in there.", next:1 } },
          { approach:"blunt", line:"Tell her to take the mirror down if she wants to do {me} a favor.", check:true, land:{ reply:"\"Took it down once. Regulars drank worse without it.\" She leaves it up. \"You don't get better hiding from the glass.\"", next:1 }, miss:{ reply:"\"It stays.\" She angles a bottle to break the line of sight and says nothing more.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell her the stranger in the glass started the day {me} did the thing {me} can't take back — {crime}.", land:{ reply:"She holds {me}'s eye in the mirror, not across the bar. \"That one in the glass did it too. No use leaving him out of the count. He drinks here same as you.\"", ev:111 } },
          { approach:"warm", line:"Ask her if the old face ever comes back to the people who lose it.", land:{ reply:"\"Not the old one. A next one. If you stay alive long enough to grow it.\" She refills like that's reason enough to.", ev:112 } } ] }
      ] },
    { id:"bar.last_one_out", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "The Late Shift's emptied out and {me}'s still on the stool while {npc} stacks chairs around {me}. \"You're always the last one out. Not because you can't leave. Because there's nothing on the other side of the door pulling.\"", "{npc} flips the sign and {me} doesn't move. She doesn't make {me}. \"Last one out, every time. I used to think you liked my company. It's that the night's worse than the bar, isn't it.\"" ], choices:[
          { approach:"warm", line:"Admit the walk home is the loneliest part of the day, so {me} put it off as long as the bar lets {me}.", land:{ reply:"\"I know that walk. Did it myself for years.\" She keeps stacking, slower now, so {me} doesn't have to be the reason she stops.", next:1 } },
          { approach:"blunt", line:"Tell her {me} just lost track of the time, and stand to go.", check:true, land:{ reply:"\"Sure you did.\" She catches {me}'s arm a beat. \"Finish the glass. The night'll still be empty in ten minutes. No rush to meet it.\"", next:1 }, miss:{ reply:"She lets {me} go and doesn't push. The door swings shut on the both of us alone.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her why she still does the last walk, if she knows it that well.", land:{ reply:"\"Because the bar isn't a place to live. It's a place to land.\" She hands {me} {me}'s coat. \"Land here all you want. Just don't move in. I've watched people move in.\"", ev:113 } },
          { approach:"warm", gate:"dream", line:"Tell her there'd be a reason to leave on time if the thing {me} actually wants ever came true — {dream}.", land:{ reply:"She stops stacking. \"Then quit closing my bar and go build the door that's worth walking to.\" It lands less like a kick-out than a shove toward something.", ev:114 } } ] }
      ] },
    { id:"bar.the_tab_3", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} taps the chalkboard behind the bottles where a tab should be. It's blank under {me}'s name. \"You've drunk thirty nights running and I haven't marked one. Ever wonder why.\"", "{npc} sets {me}'s glass down and doesn't ring it. \"Thirty nights. No tab. You're the kind that pays everything off but the wrong things.\"", "{npc} slides the receipt printer aside with one finger. \"I keep no tab on you. Figured you carry enough numbers you can't settle. One less from me.\"" ], choices:[
          { approach:"warm", line:"Tell her {me} always pays {me}'s debts.", land:{ reply:"\"The ones that take coin, sure. It's the other kind I see you flinch at.\" She pours.", next:1 } },
          { approach:"blunt", line:"Ask her what she thinks {me} owes, then.", check:true, land:{ reply:"\"Not me. You know exactly who. That's why your hands aren't on the glass yet.\"", next:1 }, miss:{ reply:"She just shrugs and moves to wipe the far rail. \"Not my ledger to read out loud.\"", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Admit there's a debt no money closes — and {me} stopped trying to.", land:{ reply:"\"Most do. Then they drink to keep the interest down. You at least name it.\" She leaves the bottle.", ev:115 } },
          { approach:"warm", line:"Tell her to start the tab — {me} doesn't want to drink free off her.", land:{ reply:"\"No. Free's not the word. Call it the one bill in this city nobody's collecting on you.\" {me} lets it stand.", ev:116 } },
          { approach:"blunt", line:"Say nothing. Drink it down and let the chalkboard stay blank.", land:{ reply:"She watches {me} empty it, then turns the board face to the wall. End of subject.", pts:0 } } ] }
      ] },
    { id:"bar.empty_stool_2", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} nods at the third stool down, the one nobody takes. \"A man sat there four years. Stopped coming in spring. I still wipe it.\"", "{npc} pours one short glass and sets it on an empty stool, not in front of {me}. \"Habit. He hasn't been by since spring. The hand does it before I tell it to.\"", "{npc} catches {me} eyeing the untouched stool. \"Don't sit there. Not superstition. Just — that one's spoken for, even now.\"" ], choices:[
          { approach:"warm", line:"Ask what happened to him.", land:{ reply:"\"Nothing dramatic. The city just stopped including him. Some of you go loud. Most go like that.\"", next:1 } },
          { approach:"blunt", line:"Tell her she should clear the glass — he's not coming.", check:true, land:{ reply:"\"I know he's not. The glass isn't for him. It's so the rest of you see somebody still gets one.\"", next:1 }, miss:{ reply:"Her jaw sets. \"You don't get to tell me which dead I keep a seat for.\" She moves off.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Tell her {me} has a stool like that too — somewhere {me} still sets a place no one fills.", land:{ reply:"\"Then you understand. We don't clear them. We just stop expecting the door.\" She slides {me} the short glass.", ev:117 } },
          { approach:"warm", line:"Raise {me}'s own glass toward the empty stool, once, without a word.", land:{ reply:"She watches, then lifts the bar rag like it's a glass too. Two strangers toasting one absence. \"He'd have liked you.\"", ev:118 } } ] }
      ] },
    { id:"bar.the_shake_3", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} watches {me}'s hand on the glass a beat too long. \"Your right one shakes. Not the drink — the drink's steadying it. I've seen that trade before.\"", "{npc} sets the glass down nearer than usual, where {me} won't have to reach far. \"Noticed the tremor three nights back. Didn't say. Saying now.\"", "{npc} pauses mid-pour. \"That hand. It only goes still once there's something in it. Means the still isn't the natural state anymore.\"" ], choices:[
          { approach:"warm", line:"Tell her it's nothing — old wiring, an old job.", land:{ reply:"\"Old wiring doesn't pick the same hour every night to act up. But fine. Old wiring.\" She doesn't push.", next:1 } },
          { approach:"blunt", line:"Pull the hand off the bar. Tell her to pour and stop reading {me}.", check:true, land:{ reply:"\"Pouring. Reading's free, comes with the bar.\" She fills it slow, gives the hand a target.", next:1 }, miss:{ reply:"She lifts both palms and steps back. \"Your hand, your business.\" The cold sits between you.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell her where the shake started — {trauma} — and that the body kept the time even after the mind filed it away.", land:{ reply:"She doesn't reach for comfort. \"The body's the only honest part. It won't let you call it over.\" She pours one and sets it by the shaking hand, on purpose.", ev:119 } },
          { approach:"warm", line:"Joke that the shake just means {me}'s overdue for a night off.", land:{ reply:"\"Sure. Night off.\" She lets {me} have the lie, but her eyes don't.", pts:0 } } ] }
      ] },
    { id:"bar.last_one_back", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} sets the bottle and the math down together. \"You came in with a unit, once. Six, seven of you, loud. Lately it's just you. I don't ask. I count.\"", "{npc} leans in across the rail. \"There used to be more of you walking in. I notice the arithmetic. I always notice the arithmetic.\"", "{npc} pours and nods at the empty space beside {me}. \"You take up one stool now. You used to fill a corner. Where'd the corner go.\"" ], choices:[
          { approach:"warm", line:"Tell her the unit's just scattered — postings, contracts.", land:{ reply:"\"Some, sure. Scattered's a kinder word for it than the real one.\" She doesn't say the real one. Neither does {me}, yet.", next:1 } },
          { approach:"blunt", line:"Tell her she counts too well for her own good.", land:{ reply:"\"It's the job. Bartenders and gravediggers — we both keep accurate books.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Say it plain: {me} is what's left. The corner went into the ground and {me} kept walking through the door.", land:{ reply:"\"Last one back. Heaviest seat in any room and nobody but the bartender knows you're sitting in it.\" She pours without ringing it.", ev:120 } },
          { approach:"warm", line:"Ask how she keeps counting and still opens every night.", land:{ reply:"\"Somebody's got to be standing here when the survivors come in. Might as well be the one who already knows the math.\"", ev:121 } } ] }
      ] },
    { id:"bar.before_the_name", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} squints at {me} like she's matching a face to an old one. \"You answer to a company name now. But you flinch a half-beat late to it. Means it isn't the first one you wore.\"", "{npc} sets the glass down slow. \"There's a man under the soldier and an older one under him. You bury names the way some people bury bodies — shallow.\"", "{npc} doesn't pour yet. \"I've watched you sign for drinks. The hand hesitates before the name. Like it's not the one the hand learned to write.\"" ], choices:[
          { approach:"warm", line:"Tell her the old name doesn't matter anymore.", land:{ reply:"\"Then it'd be easy to say. The ones that don't matter, people say without going pale.\" She waits.", next:1 } },
          { approach:"blunt", line:"Tell her some names are buried because they should stay buried.", check:true, land:{ reply:"\"Fair. I keep a few of those myself. The bar's the only ground that doesn't dig them back up.\"", next:1 }, miss:{ reply:"\"Suit yourself.\" She turns to the register and the moment goes cold and stays that way.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell her who {me} was before the company put a new name on {me} — {crime} — and what {me} had to leave under it.", land:{ reply:"She doesn't flinch, doesn't soften. \"Figured it was something the company could use. They always recruit the buried.\" She pours one for the man under the man.", ev:122 } },
          { approach:"warm", line:"Ask which buried name of hers the bar keeps.", land:{ reply:"\"Mine? Two rosters back. A version of me that thought this place was temporary.\" She almost smiles. \"We both lie to ourselves in past tense.\"", ev:123 } } ] }
      ] },
    { id:"bar.the_coin_2", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} watches {me} turn the same worn token over and over on the bar. \"You carry that the way some carry a round they're saving. What's it buy.\"", "{npc} stops {me}'s hand on the token, gentle. \"Three rosters of regulars and every one had a thing like that. A coin. A photo. A debt that fits in a pocket.\"", "{npc} taps the token where it sits by {me}'s glass. \"That's not a tip and it's not lucky. It's a reminder. You only carry reminders for things you're scared of forgetting.\"" ], choices:[
          { approach:"warm", line:"Tell her it's just something {me} picked up. Junk.", land:{ reply:"\"Junk doesn't get carried smooth like that. That's been in a hand a long time.\" She lets {me} keep turning it.", next:1 } },
          { approach:"blunt", line:"Close {me}'s fist over it. Tell her it's not for the bar.", land:{ reply:"\"No. But the bar's where people set things down for an hour. Offer stands.\" She pours.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"dream", line:"Tell her the token's a marker for after — what {me} swore {me}'d do when the war finally let go: {dream}.", land:{ reply:"She doesn't laugh, doesn't call it small. \"Then carry it where you can feel it. People who lose the marker stop believing the after exists.\"", ev:124 } },
          { approach:"warm", line:"Set the token on the bar and ask her to keep it safe till {me}'s back.", land:{ reply:"\"No.\" She slides it back into {me}'s palm. \"That one stays on you. I keep stools, not the things that get people home.\"", ev:125 } } ] }
      ] },
    { id:"bar.her_own_close", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "It's past last call and {npc} hasn't moved to lock up. She's looking at the bottle, not {me}. \"There was a night, two rosters back, I nearly didn't open the next morning. First time I'll have said that out loud.\"", "{npc} pours one for herself, which {me} has never seen her do. \"You've bled all over this bar for weeks. Sit a minute. I owe the rail something true back.\"", "{npc} kills the front lights but leaves the one over {me}. \"You keep coming in to set things down. Tonight I've got one of my own, and you're the only one still here to take it.\"" ], choices:[
          { approach:"warm", line:"Tell her she doesn't have to. The bar's her side of the rail.", land:{ reply:"\"Rail goes both ways once. Just once.\" She turns her glass. \"Let me have the once.\"", next:1 } },
          { approach:"blunt", line:"Ask her straight what stopped her opening the door that morning.", check:true, land:{ reply:"She holds {me}'s eyes. \"What stopped me, or what made me anyway. Those are different questions and you asked the wrong one.\" But she's still talking.", next:1 }, miss:{ reply:"She thinks better of it, drinks, and turns the lights back up. The window closes. \"Forget I started.\"", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Tell her {me} is staying — through whatever she puts on the rail — the way she's stayed through {me}'s.", land:{ reply:"She tells it low and unsparing — the morning she stood at the door with the key and a reason not to use it, and how a stranger she'd poured for the night before was the thing that turned the lock. \"You're the next stranger. Now you know why I keep the stools.\" Something between you that won't unsay.", ev:126, fl:"ARC_UNLOCKED" } },
          { approach:"warm", line:"Pour her a second one and just listen — don't fix, don't fill the silence.", land:{ reply:"She talks until the glass is dry, and {me} never once reaches for a word to patch it. \"That's it. That's how you do it. You already knew.\" The lights stay low.", ev:127 } } ] }
      ] },
    { id:"bar.the_one_glass", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} starts to pour a second glass on reflex, then catches herself. \"You raise a drink to everybody. Every dead name. Except you never toast. You drink straight down. Who's the one you won't lift it for.\"", "{npc} sets two glasses, then pulls one back when she sees {me}'s face. \"Some you toast. Some you don't trust yourself to. That's the one I'm asking about.\"", "{npc} watches {me} drink without the little lift first. \"Everyone in here clinks the air at somebody. You skip it. Means there's one you can't raise the glass to. Anger or shame, those are the two that skip the toast.\"" ], choices:[
          { approach:"warm", line:"Tell her {me} just isn't the toasting type.", land:{ reply:"\"You toasted the empty corner last week. You're the type for everyone but one.\" She waits {me} out.", next:1 } },
          { approach:"blunt", line:"Tell her some names don't get a toast because they don't deserve the lift.", land:{ reply:"\"Now we're closer. Deserve's doing a lot of work in that sentence.\" She leaves both glasses standing.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Admit the one {me} won't toast is {me} — the version that gave the order, made the call, walked away.", land:{ reply:"She doesn't argue it down or build it up. \"Then that glass sits between us till you can. I won't pour it out and I won't make you lift it.\" She sets it where {me} has to see it.", ev:128 } },
          { approach:"warm", line:"Tell her the one {me} can't toast was the one {me} couldn't save, and the toast feels like a lie.", land:{ reply:"\"It's not a lie. It's the only honest thing left to give them.\" She slides the second glass in front of {me}, slow. \"Lift it when you can. I'll still be here.\"", ev:129 } } ] }
      ] },
    { id:"bar.last_one_standing", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "{npc} counts the empty stools down the rail before she pours, like she's done the math too. \"You used to come in with five. Then three. Tonight it's the stool and you. I noticed. Sit.\"", "{npc} sets the bottle in front of {me} and the second glass she'd have poured for someone, then doesn't. \"Habit. I keep reaching for the other glass. You're the only one left who answers to that look.\"" ], choices:[
          { approach:"blunt", line:"Say it flat — {me}'s the last one of the old crew still walking in.", land:{ reply:"\"I know. I stopped lining up the chairs a roster ago.\" She pours one, slow. \"Doesn't make you lucky. Just makes you the one who has to remember.\"", next:1 } },
          { approach:"warm", line:"Tell her you keep saving the seat next to {me} out of reflex.", land:{ reply:"\"Everybody does it. The reflex outlasts the people.\" She doesn't take the seat away. \"Leave it. It's not hurting the bar.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask her how she does it — outliving everyone she pours for, and still opening the door.", land:{ reply:"\"You don't do it. You just keep opening the door and pretend that's the same as surviving it.\" {me} sat with that till the bottle was honest.", ev:130, fl:"CLOSEST" } },
          { approach:"warm", line:"Admit being the survivor feels less like winning and more like getting left behind.", land:{ reply:"\"That's because it is.\" She refills without asking. \"They got to stop. You got the tab.\" {me} drank to that and stayed.", ev:131 } },
          { approach:"blunt", line:"Tell her you're not here to be the memorial. Drink and leave it.", land:{ reply:"\"Suit yourself.\" She moves to the dark end and lets the empty stools keep their company.", pts:0 } } ] }
      ] },
    { id:"bar.the_tab_4", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "{me} puts the chip down to settle up and {npc} slides it back without ringing it. \"Your money's no good tonight. Not because you're special. Because I want to see what you do when you owe somebody and can't pay it down.\"", "{npc} tears the running tab in half in front of {me} and drops it in the bin. \"Clean slate. The trick is you can't ever balance what you actually owe, so people like us pretend it's the bar bill instead.\"" ], choices:[
          { approach:"warm", line:"Tell her you don't like carrying a debt you can't square.", land:{ reply:"\"Nobody does. That's why they enlist. Easier to owe a company than a person.\" She tops {me} off. \"This one you just carry.\"", next:1 } },
          { approach:"blunt", line:"Ask her flat what she thinks {me} actually owes, and to whom.", land:{ reply:"\"The dead. Same as me. And they're terrible about collecting.\" She leans on the rail. \"So we overpay the living a little. Drink.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell her about the debt that started all of it — back before the company, when {crime}.", land:{ reply:"\"And you've been trying to pay that off with a rifle ever since.\" She doesn't flinch. \"It doesn't take that currency. Never did.\" {me} finally set the chip down and left it.", ev:132, fl:"CLOSEST" } },
          { approach:"probing", line:"Ask why she keeps eating the tab when she's buried three rosters who never paid her back.", land:{ reply:"\"Because somebody fed me for free once, and they're gone, and this is the only way I get to pay them.\" {me} understood, and let her keep the slate clean.", ev:133, fx:{ t:"capstone" } } },
          { approach:"warm", line:"Leave the chip anyway. Tell her you square your debts.", land:{ reply:"\"Then you've learned nothing.\" She slides it back one last time, and rings nothing.", pts:0 } } ] }
      ] },
    { id:"bar.steady_hands", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "{npc} watches {me}'s glass shiver against the rail and doesn't mention it the polite way. \"Your hand's still fighting a war your head left an hour ago. I've poured for that tremor on a dozen wrists. Set it down before you spill the good stuff.\"", "{npc} catches {me}'s fingers doing the reload motion against the bartop — thumb, two fingers, nothing there. \"You're loading a magazine that isn't in your hand. Mind tells the body it's over. Body files an appeal.\"" ], choices:[
          { approach:"blunt", line:"Tell her the hands have been doing it for weeks and won't stop.", land:{ reply:"\"They don't ask permission. The body keeps the schedule the mind cancelled.\" She slides the glass closer so {me} doesn't have to reach far. \"Slow your hand on purpose. Just the one.\"", next:1 } },
          { approach:"warm", line:"Make a joke of it — at least the tremor's free, unlike her whiskey.", land:{ reply:"She doesn't laugh, but the corner of it moves. \"Tremor's on the house too. Comes standard with the look.\" She fills it anyway.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell her what the hands are still reaching for — {trauma}.", land:{ reply:"\"So they keep doing it because once, doing it kept you alive. That's not broken. That's loyal.\" She wrapped {me}'s shaking hand around the glass and held it steady a second. \"It can stand down here.\"", ev:134, fl:"CLOSEST" } },
          { approach:"probing", line:"Ask if she's got a tremor of her own she's hiding behind the bar.", land:{ reply:"\"Mine's in the left. I pour with the right on purpose.\" She shows {me} for a half-second, then puts it away. \"Everyone behind a bar's hiding the bad hand. You just don't get to see it.\"", ev:135 } },
          { approach:"warm", line:"Pocket the hand and tell her it's nothing. Drink with the steady one.", land:{ reply:"\"Sure.\" She lets it go and finds something to wipe down the rail.", pts:0 } } ] }
      ] },
    { id:"bar.before_dawn", venue:"bar", kind:"confidant", with:"bartender", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "It's the dead hour, past last call, before the street wakes. {npc} props the door so the grey light leaks in. \"This is the part nobody believes exists. The city's off. Just you, me, and whatever you do when you can't sleep. Sit. Tell me the daylight version of you.\"", "{npc} kills the neon and the bar goes the colour of early morning. \"Off the clock. No rosters, no tab, no war. If the shooting stopped tomorrow and stayed stopped — what does {me} do at this hour, in a life where nothing's coming?\"" ], choices:[
          { approach:"warm", line:"Admit {me} can't picture the daylight version anymore.", land:{ reply:"\"Then we'll build one from nothing. Everyone behind a bar's a half-decent architect.\" She doesn't pour. Just leans in. \"Start with the hour. What's good about it.\"", next:1 } },
          { approach:"blunt", line:"Tell her you don't sleep, so there is no daylight version — just more dark.", land:{ reply:"\"I know that hour. I own it.\" She nods at the grey door. \"But it turns, see. Whether you've got a reason or not. Might as well decide what you'd do with the turn.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"dream", line:"Tell her the thing {me} would do with the quiet, if the war ever truly ended: {dream}.", land:{ reply:"She lets it stand in the grey a long moment, doesn't sand the edges off it. \"That's not stupid. That's the only sane thing you've said in here.\" {me} watched the dawn come up on it and didn't drink.", ev:136, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"probing", line:"Turn it on her — ask what {npc} does when the bar's dark and there's no one to pour for.", land:{ reply:"\"Stand here. Watch it get light. Tell myself the open's a reason.\" She catches herself. \"Don't tell the regulars I said any of that.\" {me} kept it.", ev:137 } },
          { approach:"warm", line:"Tell her the daylight version's none of her business, and finish the glass.", land:{ reply:"\"Fair.\" She unlocks the night back into place and lets the grey have the rest.", pts:0 } } ] }
      ] },
    { id:"diner.the_bill", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "The check lands face-down between the bowls. {npc} doesn't reach for it. Neither do you. It sits there like a third person who isn't eating.", "{npc} taps the folded bill where the waitress dropped it. \"We've split everything badly our whole lives. Let's not start with two bowls of noodles.\"", "{npc} watches you eye the check. \"You always go for it too fast. Like paying for the meal pays for the rest of it.\"" ], choices:[
          { approach:"warm", line:"Put your hand flat on the bill. Tell {npc} you've got it. You've always got it now.", land:{ reply:"\"Money was never the thing you owed me.\" But {npc} lets you take it. \"Fine. This one's yours.\"", next:1 } },
          { approach:"blunt", line:"Slide it back. Tell {npc} you didn't come here to be bought a meal by family that froze you out.", check:true, land:{ reply:"\"Froze you out.\" {npc} almost laughs. \"That door swung both ways. You walked through it the same direction.\"", next:1 }, miss:{ reply:"It comes out uglier than you meant. {npc} pulls the bill back, pays, and the broth goes the rest of the way cold between you.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Ask {npc} straight: how much did you send back to {home} all those years, and where did you tell them it came from?", check:true, land:{ reply:"{npc} goes quiet. \"Enough to keep the lights on. We never asked where soldiers' money comes from.\" The unsaid thing — {crime} — sits in the open and neither of you flinches.", ev:138 }, miss:{ reply:"{npc} reads where the question's going and lifts a hand. \"Don't. Some debts I'd rather not have the receipt for.\" Fair enough. The bill stays paid, the rest stays buried.", pts:0 } },
          { approach:"warm", line:"Just say the truth: you'd have starved before you let {home} go without. That never stopped.", land:{ reply:"\"I know.\" {npc} folds the empty bill into a tiny square, the way they used to fold everything that mattered too much to throw out. \"That's the part of you I missed.\"", ev:139 } } ] }
      ] },
    { id:"diner.grey_in_it", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "Under the diner's bad light you see it — there's grey in {npc}'s hair that wasn't there the year you left. They catch you looking. \"Yeah. It happened while you were away. Most things did.\"", "{npc} reaches for the chili oil and their hand has a tremor now, small, new. They notice you notice. \"Old. It's called getting old. You missed the early part.\"", "{npc} looks older than the math says they should. \"You count the years you were gone in deployments. I counted them in this.\" They tug a strand of grey." ], choices:[
          { approach:"warm", line:"Tell {npc} they look good. Tell them you mean it, and that you're sorry you weren't around to watch it happen slow.", land:{ reply:"\"Slow.\" {npc} snorts. \"Nothing about it was slow. But sit. You're here for the part that's left.\"", next:1 } },
          { approach:"blunt", line:"Say it flat — you both got old. You just did yours where nobody back in {home} could see the cost.", land:{ reply:"\"At least mine's only grey. I've seen the look you came back with. That ages a person from the inside.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {npc} the thing you've been afraid to: how many more of these bowls do you figure we've got left.", check:true, land:{ reply:"{npc} doesn't dodge it. \"Fewer than you'd like. More than you've earned.\" Then, softer: \"So stop wasting them eating fast and leaving.\"", ev:140 }, miss:{ reply:"{npc} sets their spoon down. \"That's a hell of a thing to ask someone over noodles.\" The grey in their hair looks heavier now, and they finish the bowl without another word.", pts:0 } },
          { approach:"warm", line:"Tell {npc} you'll be around for the rest of the grey. You won't promise much — you can promise that.", land:{ reply:"\"Don't promise. You always promised.\" A beat. \"Just keep showing up. That I'll believe.\"", ev:141 } } ] }
      ] },
    { id:"diner.same_recipe", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} takes one sip and makes a face. \"It's close. It's not theirs. Nobody's is anymore. Whoever cooked for us back in {home} took it with them.\"", "{npc} pushes the chili oil at you. \"They never used this much. You always dumped it in to ruin it the way only you liked. Go on. Ruin it.\"", "{npc} watches you taste the broth. \"You're doing the thing. The face. We both make the face. It's never going to taste like the kitchen we grew up in.\"" ], choices:[
          { approach:"warm", line:"Dump the chili oil in, exactly the way you always did. Ruin it on purpose. Watch {npc}'s face do the old thing.", land:{ reply:"{npc} groans the exact groan from twenty years ago. \"Animal. You've been to war and you still eat like that.\" But they're almost smiling.", next:1 } },
          { approach:"blunt", line:"Tell {npc} to quit chasing a kitchen that's ash. The cook's gone. {home} that made it is gone. Eat what's in front of you.", land:{ reply:"\"I know it's gone.\" {npc} keeps tasting anyway. \"I just wanted to find one bowl that remembered. Sit. Help me look.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {npc} if they remember the actual recipe — really remember it — or if you've both just been pretending to since the kitchen burned.", check:true, land:{ reply:"{npc} is quiet a long time. \"I remember the smell. Not the measurements. We've been faking it from the smell up for years.\" They say it like a confession, and you both keep eating the fake.", ev:142 }, miss:{ reply:"\"Of course I remember,\" {npc} snaps — too fast, too hard. You both know it's not true. They eat the rest looking at the bowl instead of you.", pts:0 } },
          { approach:"warm", line:"Tell {npc} the truth — it doesn't have to taste like {home}. It just has to be them, across a table, again.", land:{ reply:"{npc} sets the spoon down. \"That's softer than anything the war should've left in you.\" They push their own bowl a little closer to share. \"Eat mine too. It's no worse.\"", ev:143 } } ] }
      ] },
    { id:"diner.the_thing_you_said", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} stirs the broth and doesn't drink it. \"The last thing you said to me, before you shipped out — you remember it? Because I've carried it around for years like a rock in my coat.\"", "{npc} puts down the spoon. \"We're going to keep eating cold noodles and pretending until one of us says the thing that broke it. I'm tired. I'll go first if you won't.\"", "\"You said something at that door,\" {npc} starts, not looking up. \"When you left. I never told you it landed. It landed. It's been landing for years.\"" ], choices:[
          { approach:"warm", line:"Tell {npc} you don't remember the words — but you remember the look on their face, and you've been sorry for it the whole time.", land:{ reply:"\"You don't remember.\" {npc} exhales like setting something down. \"Maybe that's mercy. The look was enough to carry for two.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} to say it, then. The exact words. You're done eating around a wound nobody will name.", land:{ reply:"{npc} meets your eye. \"All right.\" And they say it back to you, word for word, the thing you said at the door. It's worse out loud. \"Now we've both heard it. Your move.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Own it. Tell {npc} you meant it when you said it — and that meaning it is the part you'd take back if you could.", check:true, land:{ reply:"{npc} nods slow. \"That's the first honest thing you've put on this table. You meant it. I always knew you meant it. Hearing you say so is the part that lets me put the rock down.\"", ev:144 }, miss:{ reply:"\"I didn't mean it.\" The lie sits there, obvious, useless. {npc} just looks tired. \"Sure. Okay.\" And the wound stays exactly where it was.", pts:0 } },
          { approach:"warm", line:"Tell {npc} the kid who said that thing at the door died somewhere in a trench. You're not them. You're sorry on their behalf.", land:{ reply:"\"Convenient,\" {npc} says, but there's no bite in it. \"Blame the dead version. Fine. Then the new one buys the next bowl and we start there.\"", ev:145 } } ] }
      ] },
    { id:"diner.the_date_back_home", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} slides a date across the formica, written on a napkin. \"There's a thing back in {home}. A gathering. Whole family, what's left of it. They keep asking if you'll come. I keep not answering.\"", "{npc} sets down a folded napkin with a date on it. \"Three weeks out. Back home. You don't have to say yes. You just have to stop letting me make the excuses for you.\"", "\"They're putting on a thing back in {home},\" {npc} says, turning the napkin so you can read the date. \"I'm not going to beg you. I'm just done being the one who explains where you are.\"" ], choices:[
          { approach:"warm", line:"Pick up the napkin. Tell {npc} you'll try — and that you know what your 'try' has been worth before.", land:{ reply:"\"Your 'try.'\" {npc} watches you fold the napkin into your pocket. \"That's the most dangerous word you own. But you put it away. That's new.\"", next:1 } },
          { approach:"blunt", line:"Leave the napkin on the table. Tell {npc} you don't do rooms full of people who decided what you are before you walk in.", check:true, land:{ reply:"\"They decided. You decided harder, and you left.\" {npc} takes the napkin back. \"But I'll tell them the truth — that I asked, and you sat here, at least. That's further than last year.\"", next:1 }, miss:{ reply:"It comes out like a door slamming. {npc} pockets the napkin without a word and the date never gets mentioned again.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {npc} the real question: if you walk into that room, will you be the soldier they're afraid of, or just the one who left?", check:true, land:{ reply:"{npc} considers it honestly. \"Both. For about an hour. Then you'll just be the one who came back, and that'll be the only thing anyone remembers about that day. Let them have it.\"", ev:146 }, miss:{ reply:"{npc} hears the fear under the question and shakes their head slowly. \"If you have to ask what they'll see, you've already talked yourself out of it.\" They're right, and you both know it.", pts:0 } },
          { approach:"warm", line:"Tell {npc} you'll stand next to them when you walk in, if they'll have you at their shoulder. You don't want to do it alone.", land:{ reply:"{npc} goes still. \"At my shoulder.\" They take a breath. \"Yeah. Same side of the room. I can manage that. Been a long time since we stood the same direction.\"", ev:147 } } ] }
      ] },
    { id:"diner.you_covered_for_me", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} waits until the waitress is gone. \"There's a thing I never told you. The night you needed an alibi, back in {home} — I gave you one. To people who'd have ended you. You never knew. You're welcome.\"", "{npc} sets their cup down with both hands. \"Before you got self-righteous about who left who, you should know — I lied for you once. A big one. The kind that follows you. I never collected.\"", "\"You think I cut you off,\" {npc} says quietly. \"But once, before all that, somebody came asking about you, and I sent them the wrong way. On purpose. I've never told a soul. Eat your noodles. I'm not done.\"" ], choices:[
          { approach:"warm", line:"Set down your spoon. Tell {npc} you didn't know — and that whatever you thought you owed them just doubled.", land:{ reply:"\"You don't owe me.\" {npc} shrugs. \"I did it because you were mine. That's the whole reason. Don't make it a ledger.\"", next:1 } },
          { approach:"blunt", line:"Ask {npc} flat why they're telling you now — years late — if not to hold it over you.", land:{ reply:"\"Not to collect.\" {npc} meets your eye. \"To say I was on your side even when you'd decided I wasn't. Big difference. Now you know.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell {npc} the truth they covered for — the {crime} of it — and ask if they'd still have lied, knowing all of it.", check:true, land:{ reply:"You lay it out plain — {crime} — the thing they shielded you from without knowing the shape of it. {npc} doesn't blink. \"Knowing all of it? Same lie. Same night. You're still mine.\" The broth goes cold while that lands.", ev:148 }, miss:{ reply:"{npc} lifts a hand before you finish. \"Stop. I lied for you not knowing, and I'd like to keep not knowing. Let me keep the version where I just helped my own.\" Some mercies you don't argue with.", pts:0 } },
          { approach:"warm", line:"Tell {npc} that all those years you thought you were alone out there — and you weren't. They were behind you the whole time.", land:{ reply:"{npc} looks almost embarrassed. \"Somebody had to stand where you couldn't see them. That was always the job. Quit thanking me and finish the bowl.\"", ev:149 } } ] }
      ] },
    { id:"diner.last_bowl_in_this_city", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} has a duffel bag at their feet. \"I'm going back to {home}. For good. Whatever's left of it. This is the last bowl I eat in this city, and I wanted it across from you.\"", "{npc} doesn't take their coat off. \"Train's at midnight. I'm done with this city — it was only ever where you were, and you were never really here. Sit. Last one.\"", "There's a packed bag against the booth. \"I came to this grim noodle hole for years on the chance you'd walk in,\" {npc} says. \"Tonight you did. And tonight I'm leaving. Marisol's owes me better timing.\"" ], choices:[
          { approach:"warm", line:"Tell {npc} you're glad it's this bowl, this night, before they go. Even if the timing is a joke only the two of you would get.", land:{ reply:"\"Our whole lives are a joke only we'd get.\" {npc} almost smiles. \"Eat fast. I've got a train. But not that fast.\"", next:1 } },
          { approach:"blunt", line:"Ask {npc} why now — why wait until the night you finally show up to tell you they're leaving you behind.", land:{ reply:"\"Leaving you behind.\" {npc} shakes their head. \"You left first, and you left longer. I just waited the politest possible amount of time. Tonight's the bill coming due on the waiting.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {npc} the thing you're afraid to: is this them giving up on you, or making room for you to follow.", check:true, land:{ reply:"{npc} looks at you for a long beat. \"It's me going home and leaving the porch light on. That's not giving up. That's the opposite, you idiot. There'll be a bowl in {home} too.\"", ev:150 }, miss:{ reply:"{npc} hears the accusation in it. \"If you think this is me abandoning you, you weren't listening to a word.\" They stand, hoist the duffel. The bowl's still half full. \"Train won't wait. Maybe you will.\"", pts:0 } },
          { approach:"warm", line:"Walk {npc} to the train. Carry the bag. Do one plain thing right with them before the city takes them away.", land:{ reply:"{npc} lets you take the duffel without a fight, which is its own kind of confession. \"Slowest goodbye we've ever managed. About time we got one of these right.\"", ev:151 } } ] }
      ] },
    { id:"diner.the_kid_asks_about_you", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{npc} stirs the broth and won't quite look at you. \"There's a kid back in {home}. Yours by blood or near enough. Asks about you. I've been telling them a version. A clean one. I need to know which version I'm allowed to keep telling.\"", "\"A kid back home keeps asking what you're like,\" {npc} says. \"I've been making you sound like someone worth waiting for. Don't make me a liar. Or do. But tell me which.\"", "{npc} sets a crayon drawing on the formica — a stick figure with a too-big gun. \"They drew you. From my stories. That's the you a child back in {home} believes in. So. What do I do with that?\"" ], choices:[
          { approach:"warm", line:"Tell {npc} to keep the clean version. The kid back home should have something true to want to become.", land:{ reply:"\"Something true.\" {npc} winces at the word. \"The clean version isn't true. But it's not a lie either. It's the you that could've been. Maybe still can. That's what I've been feeding them.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} to stop lying to a child. You're not a story. You're what the war made. Don't build a kid on that.", check:true, land:{ reply:"\"I'm not building them on the real you,\" {npc} says evenly. \"I'm building them on the hope of you. Children need that more than they need accuracy. So do I, frankly.\"", next:1 }, miss:{ reply:"Something in your voice scares them. {npc} pockets the drawing fast. \"Forget I showed you. Some things shouldn't meet the real article.\" The bowl finishes in silence.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"dream", line:"Tell {npc} the one thing you actually want, past the war — {dream} — and ask if that's a version of you a kid could be raised toward.", check:true, land:{ reply:"You say it — {dream} — out loud, at a noodle counter, to the one person who knew you before you were a weapon. {npc} nods slowly. \"That. That's the version I'll raise them on. Go be that, and I won't be a liar.\"", ev:152 }, miss:{ reply:"The words won't come. Whatever you want past the war, you can't say it across a table, not even here. {npc} lets it go gently. \"Okay. When you've got a version you can say out loud, that's the one I'll tell them.\"", pts:0 } },
          { approach:"warm", line:"Ask {npc} to bring the kid here next time. You'd rather be a real person than a story they tell at bedtime.", land:{ reply:"{npc} blinks, caught off guard. \"You'd let them see the real one?\" A pause. \"That's braver than anything in the stories. Yeah. Next bowl. I'll bring them. Don't you dare not show.\"", ev:153 } } ] }
      ] },
    { id:"diner.the_tab", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} pays the waitress before {me} can reach for a pocket, the way you settle a thing you've decided not to argue about. \"Don't. You've been wiring money I didn't ask for since {home} went under. Sit. We're square in the only way that matters tonight.\"", "{npc} waves off the bill with two fingers. \"You keep sending more than soldiers make. I'm not stupid. I know what that means about how you're getting it. Eat first. Then tell me to mind my own.\"" ], choices:[
          { approach:"warm", line:"Tell {npc} the money was never about being square — it was the only letter {me} knew how to write.", land:{ reply:"{npc} goes still over the bowl. \"I'd have taken a worse letter. One with words.\" They don't push the cash back this time.", next:1 } },
          { approach:"blunt", line:"Tell {npc} flat to spend it and stop reading the postmark.", check:true, land:{ reply:"\"Fine. I'll spend it. On you eating something here, with me, more than once a year.\" A bargain, dressed as a rebuke.", next:1 }, miss:{ reply:"It lands cold. {npc} folds the receipt small and pockets it and the warmth goes with it.", pts:0 } },
          { approach:"probing", gate:"crime", line:"Admit where the extra came from — that {crime} — and let {npc} decide if they still want it on the table.", land:{ reply:"{npc} doesn't flinch the way {me} braced for. \"I figured worse. I'd still rather have the money in this booth than you alone with how you got it.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Let it sit. Eat the bowl {npc} bought and don't reach for the pocket again.", land:{ reply:"{npc} watches {me} not pay and counts it as the win it is. \"There. Cost you nothing. Hardest thing you've done all year.\"", ev:154 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {npc} why they'd take dirty money over a clean distance.", land:{ reply:"\"Because distance is the dirtiest thing you ever sent me.\" {npc} pushes the noodles closer. \"Eat. We'll launder the rest of it slow.\"", ev:155 } },
          { approach:"blunt", line:"Tell {npc} not to forgive it just to feel close — that's worse than the spending it.", land:{ reply:"\"I'm not forgiving it. I'm sitting with it. Those aren't the same and you of all people know it.\" Fair. Earned. {me} lets it stand.", ev:156 } } ] }
      ] },
    { id:"diner.shaking_hands", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc}'s spoon ticks against the bowl rim — a small steady tremor that wasn't there last time {me} sat here. They catch {me} watching and set the spoon down. \"Don't. It's nothing. Getting old in a city that didn't plan on me lasting.\"", "{npc} reaches for the broth and the hand isn't quite obeying anymore. They press it flat to the table to make it stop. \"You came back taller and I came back shakier. That's how the years split us.\"" ], choices:[
          { approach:"warm", line:"Say nothing about the hand. Just steady the bowl while {npc} eats, like it's normal.", land:{ reply:"{npc} lets {me}. Lets the help happen without making it a thing. \"You learned that somewhere. Steadying people. I'm sorry it was where you learned it.\"", next:1 } },
          { approach:"blunt", line:"Ask {npc} straight what the doctors back in {home} said and whether they bothered going.", check:true, land:{ reply:"{npc} sighs like the question's been waiting. \"They said words. I stopped going. Came here instead. Figured I'd rather be told nothing across a good bowl.\"", next:1 }, miss:{ reply:"{npc} pulls the hand off the table into their lap. \"And there's the interrogator. Sit back. I'm not a debrief.\"", pts:0 } },
          { approach:"probing", line:"Ask {npc} if they're shaking because of the years — or because it's {me} sitting across from them.", land:{ reply:"A long pause. \"Bit of both. You came back wearing a thing I can't read. I'm allowed to be afraid of my own kid.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {npc} {me} will come more often now, while the hands still know {me}.", land:{ reply:"{npc} doesn't say thank you. Just orders {me} a second bowl, slow, with the bad hand, on purpose. \"Then you'll watch me try.\"", ev:157 } } ] },
        { choices:[
          { approach:"warm", line:"Reach across and put {me}'s hand over the shaking one. Tell {npc} it's still the same kid under the thing they can't read.", land:{ reply:"{npc} turns the hand over and grips back, tremor and all. \"There you are. Took you long enough to come back out from behind it.\"", ev:158 } },
          { approach:"blunt", line:"Tell {npc} they're right to be afraid — but it's the war they should fear, not {me}.", land:{ reply:"\"Same difference some nights.\" But {npc} unclenches a little. \"I'll try to keep them separate. You try to come back as just the one.\"", ev:159 } } ] }
      ] },
    { id:"diner.empty_third", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} took the booth that seats three, and the far seat's empty — has been a while, by the way nobody mentions it. \"I keep taking this one. Don't know why. We were never a three again after that year in {home}.\"", "There's a third place set at the table and no one coming to fill it. {npc} notices {me} notice. \"Old habit. Marisol's never moved the spare. I never asked her to.\"" ], choices:[
          { approach:"warm", line:"Ask {npc} to tell {me} something about the one who'd have sat there — not how they went, just who they were.", land:{ reply:"{npc}'s face softens into a story. \"Hummed off-key doing dishes. Drove us both insane. I'd give the rest of {home} to hear it wrong one more time.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} to clear the third seat — keeping it set is feeding a ghost.", check:true, land:{ reply:"{npc} looks at it a long beat, then moves the empty bowl aside themselves. \"Maybe. Maybe I kept it set so you'd have to look at it too.\"", next:2 }, miss:{ reply:"\"Easy for the one who left to say what to keep.\" {npc} pulls the third bowl closer, not away. The shutter comes down.", pts:0 } },
          { approach:"probing", line:"Ask {npc} who they're really keeping the seat for — the one who's gone, or the one who kept leaving.", land:{ reply:"It hits. {npc} sets their spoon down. \"...Both. One can't come back. One wouldn't. Tonight one of you did. Don't make me say more.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Take the empty third seat yourself, so the booth seats two living people instead of one and a ghost.", land:{ reply:"{npc} watches {me} slide into it and something in their shoulders comes down a long way. \"There. That's the right number of us. For now that's the right number.\"", ev:160 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {npc} {me} kept a seat too — out there, every mess hall, just never said it.", land:{ reply:"\"Course you did. You're mine.\" {npc} finally lets the waitress take the third bowl away. \"Two's enough tonight. Two showed up.\"", ev:161 } } ] }
      ] },
    { id:"diner.recipe", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} pushes a folded scrap of paper across before the food comes — a recipe in cramped handwriting that isn't theirs. \"Marisol's closing the place out next year. This is the broth you grew up on. Somebody back in {home} should know how to make it when she's gone. Figured that's you now, or nobody.\"", "{npc} slides over a grease-spotted card. \"The recipe. The real one, not the menu lie. If you can't come home to {home}, at least carry the one thing from it that kept us fed.\"" ], choices:[
          { approach:"warm", line:"Take the card and ask {npc} to walk {me} through it once, out loud, the way they were taught.", land:{ reply:"{npc} talks {me} through it low — the order, the cheat, the thing the card leaves out on purpose. \"You'll get it wrong twice. Then it'll taste like us.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} {me} can't carry one more thing — hands are already full of what the war made {me} hold.", check:true, land:{ reply:"{npc} doesn't pull it back. \"This one weighs nothing and feeds people. Trade it for one of the others you're carrying. Even swap.\"", next:1 }, miss:{ reply:"{npc} takes the card back and pockets it slow. \"Right. Forgot. There's no room in you for anything that isn't loaded.\"", pts:0 } },
          { approach:"probing", line:"Ask {npc} why give it to {me} — the one who left — and not someone who stayed in {home}.", land:{ reply:"\"Because the ones who stayed are gone or worse. You're who's left.\" A grim shrug. \"You're who's left. That's the whole reason. It's reason enough.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Fold the card into {me}'s breast pocket — the one over the armor, where the war doesn't get to reach.", land:{ reply:"{npc} watches it go in and nods once, like a thing's been handed off safe. \"Now there's a piece of {home} that survives whatever happens to the both of us.\"", ev:162 } },
          { approach:"blunt", line:"Tell {npc} to teach {me} for real, not on paper — make {me} cook one bowl right here, badly, while they correct it.", land:{ reply:"{npc} actually laughs, gets Marisol to allow it, stands over {me} at the back range like it's twenty years ago. \"Wrong. Wrong. ...There. That's the one.\"", ev:163 } } ] }
      ] },
    { id:"diner.the_news_clip", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} doesn't slide the bowl over right away. There's a folded newsfeed printout under their hand. \"They ran footage. From whatever you were doing last month. I recognized the way you stand before I recognized the rest. Sit. I need to know if the thing on that screen is still you.\"", "{npc} sets a creased printout face-down on the formica. \"Saw you on the LNS ticker. Half the block did. Nobody here'll say it but they look at me different now. So. Tell me who I've been raising money and excuses for.\"" ], choices:[
          { approach:"warm", line:"Turn the printout face-down for good and tell {npc} the screen only catches the worst seconds of the worst days.", land:{ reply:"{npc} lets {me} cover it. \"I want to believe that. Give me the other seconds, then. The ones the camera missed.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} not to look away from it — that the thing on the screen is exactly {me} now, and they should eat with that.", check:true, land:{ reply:"{npc} holds {me}'s eyes a long, hard beat. Then pushes the broth across. \"Alright. Then I'm eating with that. I didn't come to disown you. I came to eat.\"", next:2 }, miss:{ reply:"Too much, too flat. {npc}'s hand stays on the printout. \"...Then maybe I shouldn't have ordered for you.\" The booth goes to ice.", pts:0 } },
          { approach:"probing", gate:"trauma", line:"Tell {npc} what the footage didn't show — that {trauma} — so they know what the camera was really pointed at.", land:{ reply:"{npc} listens to the whole of it, the printout forgotten under their fingers. \"...They cut all of that. Of course they did. The truth doesn't sell tickets.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Give {npc} one small ordinary thing from that same week — splitting rations, a bad joke at a checkpoint — proof {me}'s still in there.", land:{ reply:"{npc} takes the small ordinary thing and holds onto it harder than the headline. \"That. I'll keep that one. Let the block keep the screen.\"", ev:164 } } ] },
        { choices:[
          { approach:"warm", line:"Ask {npc} why they still ordered for {me}, knowing what they saw.", land:{ reply:"\"Because I knew you before the camera did. That's a longer claim than any newsfeed's got.\" {npc} finally tears the printout in half. \"Eat.\"", ev:165 } },
          { approach:"blunt", line:"Tell {npc} the honest thing — that some days {me} can't tell the screen-version from the real one either.", land:{ reply:"{npc} doesn't recoil. Reaches across and taps {me}'s chest, once. \"This still knows. We'll keep checking in here till the screen's outvoted.\"", ev:166 } } ] }
      ] },
    { id:"diner.missed_burial", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} waits until the broth's down before they say it. \"You weren't at the burial. I'm not going to pretend that didn't cut. We put one of ours in the ground back in {home} and your seat was a deployment number.\"", "{npc} sets the spoon down with a flat click. \"There's a thing standing between us that isn't the war. You missed putting one of ours in the ground. I dug. You weren't there. I've carried that to every one of these bowls.\"" ], choices:[
          { approach:"warm", line:"Tell {npc} the truth — {me} read the date off a casualty list and couldn't get a transport, and stood at attention alone in a tent.", land:{ reply:"{npc}'s jaw works. \"...Alone in a tent.\" They didn't know that part. \"That's not nothing. I thought you just didn't come. I've been angry at the wrong shape of you.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} {me} won't apologize for surviving when getting there would've buried two of {home}'s instead of one.", check:true, land:{ reply:"{npc} takes that on the chin. \"...No. You won't. And you shouldn't.\" The anger doesn't vanish but it changes target. \"Fine. The war owes that grave a visit. Not you.\"", next:1 }, miss:{ reply:"It comes out like a barracks order and lands like one. \"Don't you dare make a tactics problem of who we buried.\" {npc} turns to the window.", pts:0 } },
          { approach:"probing", line:"Ask {npc} what they actually need — for {me} to grieve out loud now, or just to have been there then.", land:{ reply:"Long quiet. \"...The second one I can't have. So. The first. I never got to grieve next to anyone who knew them like you did.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Ask {npc} where the grave is, and tell them {me} will walk to it with them next leave — both of them, finally, at the same dirt.", land:{ reply:"{npc} writes the plot number on a napkin with the shaking carefulness of something that matters. \"Next leave. You and me. I'll wait at the gate. I've waited longer.\"", ev:167 } } ] },
        { choices:[
          { approach:"warm", line:"Grieve them right here, out loud, across the cold bowls — say their name and one real thing, finally, next to someone who was there.", land:{ reply:"{npc} meets it word for word, and for a minute Marisol's holds the wake that {home} held without {me}. Neither of them wipes their face. \"...There. Now you were there. Late, but there.\"", ev:168 } },
          { approach:"blunt", line:"Tell {npc} to hand {me} the anger to carry awhile — {me}'s carried heavier, and they shouldn't have hauled it solo this long.", land:{ reply:"{npc} blinks, not ready for the offer. \"...You'd take it?\" A breath. \"Then take half. I'm not so big I can't share a grudge with my own.\"", ev:169 } } ] }
      ] },
    { id:"diner.stay_for_good", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} doesn't touch the broth. \"I'm going to ask the thing I keep not asking. Don't answer fast. When this contract's up — you could come back to {home}. For good. Not a visit. A life. I've practiced not asking so hard it's worn a groove.\"", "{npc} sets both hands flat. \"Last time you said 'next leave.' I want to ask for the one after the last one. Come home when you're done. Stop renewing whatever it is you keep renewing. There. I asked.\"" ], choices:[
          { approach:"warm", line:"Tell {npc} the honest thing — that {me} doesn't know how to be a person without the war anymore, but wants to learn it somewhere with their cooking in it.", land:{ reply:"{npc} lets out a breath they'd been holding for years. \"That's not a yes. But it's the first answer that didn't sound like a door closing. I'll take a maybe with my name in it.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} flat that {me} can't promise an after — too many of {me}'s contracts end in a body bag for {me} to plan a kitchen.", check:true, land:{ reply:"{npc} doesn't flinch from it. \"I know the odds. I've buried the odds. I'm still asking. Ask me back if it ever gets survivable — that's all.\"", next:2 }, miss:{ reply:"The body-bag line lands like a slap they didn't deserve. {npc} pulls back into the booth. \"...Right. I'll stop wearing the groove. Eat your broth.\"", pts:0 } },
          { approach:"probing", gate:"dream", line:"Tell {npc} the after {me} actually pictures, quietly — that {dream} — and ask if it could be in {home} without it being a lie.", land:{ reply:"{npc} hears the whole shape of it and doesn't laugh, doesn't grab. \"...{home} could hold that. {home}'s held worse and stranger. Don't say it unless you'll chase it.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Promise {npc} one true small thing instead of the big one — that if {me} survives the contract, the first transport home is theirs to meet.", land:{ reply:"{npc} writes nothing down this time. Just nods, the way you accept a thing you'll hold someone to. \"First transport. I'll be at the gate. Don't make a liar of a tired person.\"", ev:170 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {npc} to keep asking every bowl, even knowing the odds — that the asking is part of what {me} comes back for.", land:{ reply:"{npc} almost smiles. \"So I'm bait now. The thing that pulls you out of the fire.\" A beat. \"Fine. I'll keep being the hook. Worse jobs.\"", ev:171 } },
          { approach:"blunt", line:"Tell {npc} to stop practicing not-asking — to ask loud, so {me} has something specific to refuse to die before.", land:{ reply:"{npc} straightens, takes the permission like a weight off. \"Then COME HOME.\" Loud enough that two stools turn. They don't care. \"There. Now you've got your orders too.\"", ev:172 } } ] }
      ] },
    { id:"diner.old_fight", venue:"diner", kind:"kin", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{npc} stirs the broth without eating it. \"We never actually finished the fight. The one before you shipped out. We just let a war interrupt it and called that peace. I'm too old to keep mistaking a ceasefire for the thing being over.\"", "{npc} taps the table. \"You know what we never did? End the argument. The big one. We let the recruiter end it for us. I've been chewing my half of it for years across these bowls. Want to finish it? Properly?\"" ], choices:[
          { approach:"warm", line:"Tell {npc} {me} doesn't even remember who was right anymore — just the slammed door and how long the silence got.", land:{ reply:"{npc} exhales. \"...Me neither. I've defended a position for years I can't reconstruct. That's the stupidest part. We kept the wound and lost the cause.\"", next:1 } },
          { approach:"blunt", line:"Tell {npc} {me} was right then and is right now — and {me}'d slam the door again. Get it on the table.", check:true, land:{ reply:"{npc} laughs, sharp and real, the first honest sound all night. \"THERE'S my kid. Fine. You were right about the leaving. I was right about the how. We can both be right and still ate alone for years.\"", next:2 }, miss:{ reply:"The old heat comes up too fast and it's the real fight again, not a memory of one. {npc} sets cash down and stands. \"...Some ceasefires you don't poke.\"", pts:0 } },
          { approach:"probing", line:"Ask {npc} which of them the silence cost more — and whether they kept it going on purpose.", land:{ reply:"A long, honest pause. \"...Me. And yes. A while. Easier to be owed an apology than to find out you'd grown into someone I didn't get to know.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {npc} {me} forfeits — concedes the whole old argument, no terms — just to have the years back that the grudge ate.", land:{ reply:"{npc} looks at the forfeit like it's a gift too big to accept clean. \"...You can't just concede. That's not how we— \" A breath. \"...Alright. Conceded. Now there's nothing on the table but two bowls. Good.\"", ev:173 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {npc} to call it a draw and bury the rules — declare a thing the two of {me} are allowed to never reopen.", land:{ reply:"{npc} clinks their spoon against {me}'s like a gavel. \"Draw. Permanent. Anyone reopens it eats the next bowl cold and alone.\" They mean it as a treaty and it lands as one.", ev:174 } },
          { approach:"blunt", line:"Tell {npc} the silence cost {me} more than they think — every mess hall, the one argument {me} couldn't finish kept replaying with no one to lose to.", land:{ reply:"{npc} goes quiet, recalibrating who paid. \"...I thought I was the one who lost the time. Turns out we both kept the same empty seat at the table arguing with it. Idiots, the both of us.\"", ev:175 } } ] }
      ] },
    { id:"diner.shaking_hands_2", venue:"diner", kind:"kin", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} can't get the chopsticks to lift the noodles. The hand shakes, sets them down, tries the spoon instead. \"Don't. Don't say anything about it.\"", "{npc}'s hand rattles the spoon against the bowl, twice, before they just hold it still in their lap. \"Getting old in {home} is its own war. You wouldn't know. You left before it started.\"" ], choices:[
          { approach:"warm", line:"Slide the bowl closer, lift the spoon, don't make it a thing.", land:{ reply:"{npc} lets {me} do it. Eats. \"Your father had the same shake. End. You weren't here for that either.\"", next:1 } },
          { approach:"blunt", line:"Ask flat how long the hands have been like that.", check:true, land:{ reply:"\"Two years. You'd have known if you called.\" No heat in it. Just the count.", next:1 }, miss:{ reply:"{npc} folds both hands under the table where {me} can't see them, and the booth goes quiet the wrong way.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask who helps them eat on the nights {me} isn't here.", land:{ reply:"\"Nobody. I order the soft things and I manage.\" A beat. \"It's better with you across from me. I won't pretend it isn't.\"", ev:176 } },
          { approach:"warm", line:"Promise to come the nights {me} can, and mean only that much.", land:{ reply:"\"Don't promise. Just show up when you show up. That's more than the others manage.\" {npc} eats the rest with {me} steadying the bowl.", ev:177 } },
          { approach:"blunt", line:"Say {me}'s hands shake too now, and not from age.", check:true, land:{ reply:"{npc} looks at {me}'s hands a long time. \"So we both rattle our spoons. Pair of us.\" They almost smile.", ev:178 }, miss:{ reply:"It comes out like a competition over who's worse off. {npc} pulls their hands back. \"This isn't a contest, soldier.\"", pts:0 } } ] }
      ] },
    { id:"diner.empty_chair_funeral", venue:"diner", kind:"kin", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} sets down a small black ribbon next to the broth, the kind they pin at a {home} funeral. \"You missed it. The whole row of us stood there with a gap where you'd have been.\"", "{npc} doesn't order. Just sets a folded program on the formica, creased from a coat pocket. \"They put you in the family line on this. Printed your name. You weren't there to stand under it.\"" ], choices:[
          { approach:"warm", line:"Ask who it was. Say the truth — the letter never reached {me}.", land:{ reply:"{npc} tells you the name, quiet. \"We figured the mail's no good where you are. Doesn't fill the gap, though.\"", next:1 } },
          { approach:"blunt", line:"Say {me} buries people every week and stopped traveling for it.", check:true, land:{ reply:"\"I know what you do. This one was ours. There's a difference and you used to know it.\" Flat. Not cruel.", next:1 }, miss:{ reply:"{npc} pockets the program before {me} finishes. \"Forget I brought it.\" The broth goes cold between you.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {npc} to walk {me} through the day — who stood, what was said — so {me} can stand in it now, late.", land:{ reply:"{npc} tells it slow, the whole order of the day, the bad song someone picked. By the end {me} has been there, a year late, in a noodle booth.", ev:179 } },
          { approach:"warm", line:"Take the ribbon. Pin it on. Tell {npc} {me} stands every grave forward from now.", land:{ reply:"{npc} watches {me} pin it. \"You won't make them all. But pin it for this one.\" That's as much forgiveness as the dead allow.", ev:180 } },
          { approach:"blunt", line:"Admit the real reason {me} didn't come: {me} can't stand a {home} funeral without seeing every other body too.", check:true, land:{ reply:"{npc} sets the program down. \"So it wasn't that you didn't care. It's that you'd have come apart in the front row.\" They nod, slow. \"That, I can hold.\"", ev:181 }, miss:{ reply:"It comes out as an excuse and lands as one. \"Everybody's got a reason not to come home,\" {npc} says, and lets it die.", pts:0 } } ] }
      ] },
    { id:"diner.wearing_your_coat", venue:"diner", kind:"kin", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} is wearing {me}'s old field coat, the one left in {home} a lifetime ago. Too big in the shoulders. They notice {me} notice. \"It still smelled like you for about a year. Then it just smelled like me.\"", "{npc} shrugs out of a coat that {me} recognizes before the broth even lands — {me}'s, left behind, worn soft at the cuffs by someone else's years. \"Kept you warm in {home} after you stopped writing. Don't ask for it back.\"" ], choices:[
          { approach:"warm", line:"Say it suits them better than it ever suited {me}.", land:{ reply:"\"Liar.\" But {npc} pulls it a little tighter, pleased. \"I wore it to your father's thing. Felt like you came.\"", next:1 } },
          { approach:"blunt", line:"Ask why they kept a dead man's coat all these years.", check:true, land:{ reply:"\"You weren't dead. You just acted like it.\" The coat collar's frayed where a thumb worried it for years.", next:1 }, miss:{ reply:"\"Dead man.\" {npc} repeats it, and starts taking the coat off like they'll leave it on the stool and go. {me} talks them back into the booth, but the warmth's spent.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask where the coat went on the worst nights in {home} — what they did when they couldn't sleep.", land:{ reply:"\"Sat on the back step in it. Talked to you. You answered better when you weren't actually there.\" {npc} laughs at themselves, wet-eyed.", ev:182 } },
          { approach:"warm", line:"Tell them to keep it — and put {me}'s current dog tag in the pocket, so something true of {me} rides in it now.", land:{ reply:"{npc} feels the tag in the pocket and goes still. \"This is you-now. Not the kid who left.\" They button the pocket. \"Fine. Both of you can keep me warm.\"", ev:183 } },
          { approach:"blunt", line:"Ask for the coat back — say {me} wants one thing from before to carry forward.", check:true, land:{ reply:"{npc} looks at {me} a long beat, then peels it off and hands it over, warm from them. \"It's mostly me now. But the bones of it are still you. Take it.\"", ev:184 }, miss:{ reply:"It lands like {me} is taking the last warm thing they have. {npc} clutches the collar. \"No. You left it. It's mine now.\" {me} doesn't push.", pts:0 } } ] }
      ] },
    { id:"diner.who_takes_care_of_who", venue:"diner", kind:"kin", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} pays for the broth in coins, counted twice, and comes up short. The waitress waves it off. {npc} doesn't look up. \"Don't. I see you doing the math on me.\"", "{npc}'s coat is good but old, mended at the elbow with the wrong thread. They order the cheapest bowl and call it their favorite. \"It is. Don't make a face.\"", "{npc} smells of the cheap stuff before they even sit. \"I had one. I'm allowed one. {home} got worse after you stopped sending word, and the rent didn't.\"" ], choices:[
          { approach:"warm", line:"Cover the bowl without ceremony and order them a second.", land:{ reply:"{npc} lets it happen, jaw tight. \"This isn't how it goes. I'm the one who feeds you.\" Eats anyway.", next:1 } },
          { approach:"blunt", line:"Ask straight how bad it's gotten back in {home}.", check:true, land:{ reply:"\"Bad. House is gone. I'm in the one room over the laundry now.\" Said like reading a weather report. \"You wanted it straight.\"", next:1 }, miss:{ reply:"\"How bad.\" {npc} straightens. \"I'm fine. Eat your noodles.\" The shutter comes down and the rest is small talk.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what they actually need — not what they'll admit to wanting.", land:{ reply:"Long quiet. \"The room's cold and the line keeps me up. That's all. I don't want your blood money, I want you to know it.\" Telling {me} is the ask.", ev:185 } },
          { approach:"warm", line:"Set a fold of {me}'s pay on the table and say it's not charity — it's back rent on the years {me} wasn't there.", land:{ reply:"{npc} stares at it. Doesn't push it back. \"Back rent.\" A crack of a smile. \"You always did pay late.\" They take it. The roles bend the other way for once.", ev:186 } },
          { approach:"blunt", line:"Tell them {me} has nothing to send — the war eats the pay — but {me} will sit here every chance there is.", check:true, land:{ reply:"{npc} nods slow. \"Figured. You always came back with empty pockets and that look.\" A beat. \"Sit, then. Company's the cheaper thing and I'm short on it.\"", ev:187 }, miss:{ reply:"It sounds like the start of a no before it's even an offer. \"Save the speech. I didn't ask,\" {npc} says, and waves the waitress for the check they can't quite cover.", pts:0 } } ] }
      ] },
    { id:"diner.the_kid_who_asks", venue:"diner", kind:"kin", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} sets a child's crayon drawing on the formica: a stick figure with a too-big gun, a star over its head. \"The little one back in {home} drew you. Asked me if you're a hero or the other thing. I didn't know which way to lie.\"", "{npc} slides over a phone, paused on a small face. \"The young one keeps asking after you. Wants to know if it's true you fight monsters. I keep saying yes. It's getting harder to say.\"", "{npc} doesn't sit yet. \"There's a kid in {home} growing up on a story about you. I need to know which story to tell. The brave one, or the real one.\"" ], choices:[
          { approach:"warm", line:"Tell {npc} to keep the brave story a little longer. The kid'll get the real one when they need it.", land:{ reply:"{npc} pockets the drawing. \"That's mercy or cowardice, I can't tell with you anymore.\" But they keep it. \"All right. The brave one. For now.\"", next:1 } },
          { approach:"blunt", line:"Tell them not to put a halo over {me}. Tell the kid the truth at whatever age it stops being a cartoon.", check:true, land:{ reply:"\"You want me to tell a child what you actually do.\" {npc} weighs it. \"Maybe that's the only honest thing left in {home}.\" They don't argue.", next:1 }, miss:{ reply:"\"The truth.\" {npc} laughs, no warmth. \"You don't even tell yourself the truth. Keep your version off my kid.\" They put the drawing away for good.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what the kid is actually like — not the drawing, the real one. What they're afraid of.", land:{ reply:"{npc} softens telling it — afraid of the dark, won't sleep without the hall light, asks where {me} is every storm. By the end the kid is real to {me}, and {me} is real to the kid.", ev:188 } },
          { approach:"warm", line:"Send the kid something true and small — {me}'s spare patch, no medals, just the worn one — so they have a real thing instead of a legend.", land:{ reply:"{npc} takes the worn patch. \"Not the shiny one. The one that's actually been somewhere.\" They get it. \"This'll mean more than the star they drew.\"", ev:189 } },
          { approach:"blunt", line:"Tell {npc} the truth {me}'s most afraid of: {me} doesn't want the kid to ever do what {me} does. That's the only story that matters.", check:true, land:{ reply:"{npc} goes quiet a long time. \"So the story is — don't be me.\" They nod. \"I can raise a kid on that. That's the realest thing you've said in years.\"", ev:190 }, miss:{ reply:"It comes out as self-loathing and {npc} won't hand a kid that. \"Don't poison the well. The kid deserves better than your guilt.\" The door closes on it.", pts:0 } } ] }
      ] },
    { id:"diner.the_night_it_broke", venue:"diner", kind:"kin", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{npc} waits until the bowls are down and the waitress is gone. \"We've done the easy nights. The coat, the kid, the funeral. There's one we haven't done. The night you left {home}. The real reason. I've waited years to hear it from you and not the others.\"", "{npc} pushes both bowls aside, untouched. \"I didn't come for noodles. I came because there's one night between us nobody's ever said straight. The night it broke. You know the one. Say it.\"" ], choices:[
          { approach:"warm", line:"Stall — say maybe some nights are better left under the floor.", land:{ reply:"\"Maybe. But I'm getting old and the floor's getting thin.\" {npc} doesn't move. \"I'll wait. But not forever.\"", next:1 } },
          { approach:"probing", line:"Ask what {npc} thinks happened that night — let them go first.", land:{ reply:"{npc} tells their version: a slammed door, a thing said that couldn't be unsaid, a {me} who walked into the dark and didn't look back. \"That's my half. You've never given me yours.\"", next:1 } },
          { approach:"blunt", line:"Say it isn't worth digging up a corpse this old.", check:true, land:{ reply:"\"It's the only corpse I never got to bury,\" {npc} says. \"You buried everyone else. Bury this one with me.\" They stay.", next:1 }, miss:{ reply:"\"Old corpse.\" {npc} stands, leaves coins for the broth. \"Then we keep eating around it.\" The booth empties and the night's just noodles again.", pts:0 } } ] },
        { choices:[
          { approach:"blunt", gate:"crime", line:"Give them the thing the family never knew — that {me} left {home} that night running from {crime}, and the slammed door was just cover.", check:true, land:{ reply:"{npc} goes white, then still. \"All these years we thought you left us. You were protecting us. You let us hate you so they'd never come for us.\" They take {me}'s hand across the cold bowls. \"Come home. It's safe now. I made sure.\"", ev:191, fl:"ARC_UNLOCKED" }, miss:{ reply:"The words jam halfway and come out wrong, half-true and ugly. {npc} flinches. \"That's not all of it and you know it.\" The center stays buried one more night.", pts:0 } },
          { approach:"probing", gate:"trauma", line:"Tell them the smaller truth — that {me} left because of {trauma}, and couldn't be in a house where everyone could see {me} coming apart.", land:{ reply:"{npc} exhales like they've held it for years. \"You didn't leave because you stopped loving us. You left so we wouldn't watch you drown.\" They keep it, gentle. \"Bring the rest when you can carry it.\"", ev:192 } },
          { approach:"warm", line:"Own the slammed door and the cruel thing said — not the why, just that it was {me}'s to break.", land:{ reply:"{npc} nods slow. \"That's something. You broke it. I needed to hear you say you broke it and not the weather.\" They pull the cold bowls back. \"Eat. We start from here.\"", ev:193 } } ] }
      ] },
    { id:"diner.the_check", venue:"diner", kind:"kin", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "The bill lands face-down between the two bowls. {npc} doesn't reach for it. \"You always grabbed it first so you wouldn't have to look me in the eye. Not tonight. Tonight it sits there.\"", "{npc} taps the face-down check with one finger and leaves it. \"There's a number under there older than this diner. You know the one. Money I gave {me} that never came back. We going to keep eating around it, or settle up?\"" ], choices:[
          { approach:"warm", line:"Turn the check over. Cover it. Tell {npc} the small debt's been paid a hundred times in worry.", land:{ reply:"\"That's not the kind that clears.\" But {npc} lets {me} pay, and the hand on the formica unclenches.", next:1 } },
          { approach:"blunt", line:"Say the old loan kept {me} alive one bad winter, and {me} never thanked them for it.", check:true, land:{ reply:"{npc} goes still. \"I never wanted thanks. I wanted you to come home before you needed it.\"", next:1 }, miss:{ reply:"It comes out like an accusation. {npc} slides the check back. \"Pay it then. If that's all it was.\"", pts:0 } },
          { approach:"probing", line:"Ask why {npc} kept the receipt all these years if it never mattered.", land:{ reply:"\"Because it was the last thing I had with your handwriting on it.\" {npc} sets it on the table, soft as a leaf.", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Leave the money under the bowl and your hand over theirs a second longer than the war allows.", land:{ reply:"{npc} lets the hand stay. \"Look at that. The soldier knows how to settle a tab after all.\"", ev:194 } },
          { approach:"probing", gate:"crime", line:"Admit how {me} earned the money to pay them back — {crime} — and let them decide if they still want it under the bowl.", land:{ reply:"{npc} looks at the bills a long time. Then takes them. \"Dirty money spends the same as clean, in a place this cold. We're square.\"", ev:195, fl:"CLOSEST" } } ] },
        { choices:[
          { approach:"warm", line:"Tell {npc} to keep the receipt. Pay the bill clean and let the old number stay unpaid on purpose.", land:{ reply:"{npc} folds it back into a pocket like it's still worth something. \"Then we've got a reason to do this again. Good.\"", ev:196, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"blunt", line:"Just pay it and end the thing. No ceremony.", land:{ reply:"{npc} pockets the cash. \"Clean. Fine.\" The booth's a little emptier for it, but quieter too.", ev:197 } } ] }
      ] },
    { id:"diner.empty_setting", venue:"diner", kind:"kin", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "Three settings tonight. {npc} catches {me} counting them. \"I asked for the third. Old man liked this booth.\" A beat. \"He went last spring. You were somewhere with no address. Sit.\"", "{npc} has set out a third bowl that nobody's coming for. \"We buried one of ours while you were out there. I'm not asking where you were. I'm telling you so you stop finding out from strangers.\"" ], choices:[
          { approach:"warm", line:"Sit. Ask what the funeral was like — who came, who cried, who didn't.", land:{ reply:"\"Small. Cheap box. {home} doesn't do flowers anymore.\" {npc}'s voice doesn't break, which is worse.", next:1 } },
          { approach:"blunt", line:"Say flat that {me} would've come if anyone had sent word that reached.", check:true, land:{ reply:"\"I know. The word just didn't have anywhere to land.\" {npc} doesn't make it {me}'s fault. Lets it be the war's.", next:1 }, miss:{ reply:"It sounds like a defense. {npc} pushes the third bowl an inch away. \"Nobody's accusing you. Eat.\"", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask if he said anything near the end about {me}. The truth, not the kind thing.", land:{ reply:"\"He asked if you'd eaten. That was it. Last clear thing out of him.\" {npc} laughs once, wet. \"Worried about your stomach to the door.\"", next:2 } },
          { approach:"warm", line:"Pour broth into the third bowl yourself and let it sit for him.", land:{ reply:"{npc} watches the steam come off the dead man's bowl and finally exhales. \"Yeah. He'd have wanted that more than a sermon.\"", ev:198, fl:"CLOSEST" } } ] },
        { choices:[
          { approach:"warm", gate:"trauma", line:"Tell {npc} the truth — that {me} has buried so many out there that {trauma}, and didn't have room left to feel one more until now.", land:{ reply:"{npc} reaches across and grips {me}'s wrist over the cold settings. \"Then feel this one slow. He's got the time now. So do we.\"", ev:199, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"blunt", line:"Say there's nothing to do but eat. The dead don't get warmer for waiting.", land:{ reply:"\"No. They don't.\" {npc} eats. So does {me}. The third bowl goes cold between them, witnessed, which is something.", ev:200 } } ] }
      ] },
    { id:"diner.wrong_recipe", venue:"diner", kind:"kin", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "{npc} slides a bowl over, watching {me}'s face. \"Got the cook here to try the old one. The one from the house. Taste it. Tell me it's wrong, because I can't tell anymore.\"", "{npc} has a scrap of paper by the bowl, a recipe in a dead hand's writing. \"Made them follow it to the letter. Still tastes like a stranger's idea of us. Eat it and tell me what's missing.\"" ], choices:[
          { approach:"warm", line:"Eat it slow. Tell {npc} it's close. Closer than {me} expected to ever taste again.", land:{ reply:"{npc}'s shoulders drop an inch. \"Close. I'll take close. Close is more than I had yesterday.\"", next:1 } },
          { approach:"blunt", line:"Say it's wrong, and you both know it — the hands that made it right are gone.", check:true, land:{ reply:"\"Yeah.\" {npc} doesn't argue. \"I just wanted to hear it from someone who remembers the real thing. Thank you.\"", next:1 }, miss:{ reply:"It's too flat, too soon. {npc} takes the bowl back. \"Forget it. Stupid to try.\"", pts:0 } },
          { approach:"probing", line:"Ask why {npc} is chasing a taste instead of just letting it stay buried with the rest of {home}.", land:{ reply:"\"Because you came back and I had nothing of the old house to hand you. This was all I could cook.\"", next:2 } } ] },
        { choices:[
          { approach:"probing", line:"Tell {npc} the missing thing — it was never the recipe. It was the noise of the house around the bowl.", land:{ reply:"{npc} sets down the spoon. \"...The radio. The arguing. Yeah. You can't put that in a pot.\" A long quiet, almost the old kind.", ev:201, fl:"CLOSEST" } },
          { approach:"warm", line:"Tell {npc} to give the cook the paper anyway — keep making it wrong, every week, until wrong becomes ours.", land:{ reply:"{npc} pockets the scrap with a crooked half-smile. \"A standing order of getting it almost right. Fine. You're buying.\"", ev:202, fl:"CLOSEST", fx:{ t:"capstone" } } } ] },
        { choices:[
          { approach:"warm", line:"Take the recipe scrap. Tell {npc} {me} will carry it where {home}'s writing can't be lost again.", land:{ reply:"{npc} folds the paper into {me}'s hand and holds the fold shut. \"Don't get it shot up out there. It's the last of that handwriting.\"", ev:203 } },
          { approach:"blunt", line:"Tell {npc} to stop. Some things you don't get to taste twice. Let it rest.", land:{ reply:"{npc} crumples the scrap slow, then doesn't throw it out. Pockets it. \"...Maybe. But not in the trash. Not yet.\"", ev:204 } } ] }
      ] },
    { id:"diner.closing_rain", venue:"diner", kind:"kin", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "Last call. The cook's killing the grill and it's coming down hard past the window. {npc} doesn't move to leave. \"We always split here. You go your way, I go mine, and it's months. I'm tired of the split. Which way you headed tonight?\"", "Closing time, rain like static on the glass. {npc} buttons a coat one button, then stops. \"Same corner where we always say goodbye and mean it. I don't want to mean it tonight. Walk part of the way with me?\"" ], choices:[
          { approach:"warm", line:"Tell {npc} {me} is headed their way. {me} can stand a little rain.", land:{ reply:"{npc} actually looks surprised, then doesn't hide it. \"Yeah? Alright. Grab the napkins, it's a long block.\"", next:1 } },
          { approach:"blunt", line:"Say a soldier walks alone — it's safer for whoever's beside them.", check:true, land:{ reply:"\"I've been beside dangerous people my whole life. You're not the first.\" {npc} holds the door.", next:1 }, miss:{ reply:"{npc} lets the door swing shut between you. \"Fine. Go be safe. Alone. Same as always.\"", pts:0 } },
          { approach:"probing", line:"Ask {npc} why tonight — why this is the one they don't want to split on.", land:{ reply:"\"Because you're starting to look like you might not show next time. And I'm done saying goodbye like it's nothing.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Walk out under the one coat {npc} holds open, shoulder to shoulder into the rain.", land:{ reply:"It barely covers two. Neither of you says so. {npc}: \"We look ridiculous.\" Keeps walking anyway. So does {me}.", ev:205, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"blunt", line:"Walk them to their door and no further. But walk them all the way there.", land:{ reply:"{npc} doesn't ask {me} up. Just stands a second under the awning. \"You came the whole way. That's new. That's enough.\"", ev:206, fl:"CLOSEST" } } ] },
        { choices:[
          { approach:"warm", gate:"dream", line:"Tell {npc} the thing {me} doesn't say out loud — that when the war's done, {dream} — and tonight's the first night it felt close.", land:{ reply:"{npc} stops in the doorway with the rain behind. \"Then quit walking off alone like you don't believe it. Come on.\"", ev:207, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"warm", line:"Tell {npc} {me} will show next time. Say it plain, like a promise a soldier shouldn't make.", land:{ reply:"\"Don't promise. Just walk.\" {npc} steps into the rain and waits to see if {me} follows. {me} follows.", ev:208 } } ] }
      ] },
    { id:"club.song_nobody_wrote", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "The DJ drops a track that's all static and a half-remembered melody under it, and {them} goes still mid-sip. \"That. Where do I know that.\"", "{them} has been tapping the table to a beat that isn't quite the song playing. Catches {me} watching. \"It's in there somewhere. Won't come out.\"", "Something old surfaces in the mix — a tune from before, buried under the noise like everything else. {them} mouths the wrong words to it and stops, embarrassed." ], choices:[
          { approach:"warm", line:"Tell {them} it's a marching cadence somebody slowed down to sell drinks.", land:{ reply:"{them} laughs, ugly and real. \"That's it. They took the thing that kept us walking and made it a dance floor.\"", next:1 } },
          { approach:"probing", line:"Ask what {them} was humming, before — the version with the real words.", land:{ reply:"{them} won't sing it, but the jaw works through it once. \"Don't matter. The mouths that knew the words are mostly in the ground.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} to let it stay buried. Some songs you don't dig back up.", check:true, land:{ reply:"{them} nods slow. \"Yeah. Yeah, leave it.\" And the hand stops tapping.", next:1 }, miss:{ reply:"It lands wrong, like an order. {them} shrugs it off and the table goes quiet a beat too long.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Hum the cadence back at {them}, low, just the two of you under the bass.", land:{ reply:"{them} comes in on the second line without deciding to. Two ruined voices, one dead song, nobody else in the room hearing it.", ev:209 } },
          { approach:"probing", gate:"trauma", line:"Tell {them} why that tune sticks for {me}: {trauma}.", land:{ reply:"{them} doesn't reach over, doesn't fix it. Just lets the song play out and says, \"Then it's a good one to forget the right way. With someone who knows.\"", ev:210 } } ] }
      ] },
    { id:"club.shakes", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them}'s glass chatters against the table — a fine tremor in the wiring hand, the one the wars rebuilt. {them} pins it flat before {me} can pretend not to see.", "{me} clocks {them} switching the drink to the other hand. The first one's shaking, just a little, just enough. {them} doesn't mention it. Neither does anyone.", "{them} holds the glass two-handed like an old man, jaw tight. The bass covers the rattle. {me}'s the only one close enough to hear it anyway." ], choices:[
          { approach:"warm", line:"Slide {me}'s steady hand over the bad one. Hold it on the table till it quits.", land:{ reply:"{them} lets it happen, which is the whole thing. \"Cold in here,\" {them} lies. The shake eases under {me}'s weight.", next:1 } },
          { approach:"blunt", line:"Tell {them} everybody's got a part that didn't come home right. No flinch.", land:{ reply:"\"Yeah?\" {them} flexes the bad hand, watches it betray him. \"Mine just won't let me forget which part.\"", next:1 } },
          { approach:"probing", line:"Ask if it's the chrome failing or the hand under it remembering.", land:{ reply:"{them} goes quiet. \"Ripper says it's the chrome. I know what it is. It does it most when it's quiet enough to think.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} to bring it to {me} next time, instead of drinking it still alone.", land:{ reply:"{them} almost argues, then doesn't. \"It's not pretty.\" {me} says nothing pretty is. {them} keeps the bad hand on the table this time.", ev:211 } },
          { approach:"blunt", line:"Buy the next round and put it in the bad hand on purpose. Make {them} use it.", check:true, land:{ reply:"{them} stares at the offered glass, then takes it in the wrong hand, knuckles white. Doesn't spill. \"You're a bastard,\" {them} says, almost grateful.", ev:212 }, miss:{ reply:"The glass tips before {them} can grip it, soaks the table. {them} laughs it off too fast and waves down a rag. Some nights aren't the night.", pts:0 } } ] }
      ] },
    { id:"club.civilian_dancing", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "Some kid who's never held a rifle is dancing in the middle of it all, arms up, eyes shut, drunk on a city that hasn't broken them yet. {them} watches like it's a creature from a war they won.", "A whole knot of civilians takes the floor, laughing at nothing, soft and unscarred. {them} stops talking to look. \"We bled for that. Look at it. Doesn't even know we're here.\"", "{them} nods at the dance floor — kids who'll never know what it cost to keep the lights this gaudy. \"Strange. Fighting so people could be that stupid in peace.\"" ], choices:[
          { approach:"warm", line:"Tell {them} that's the win. Nobody on that floor counting exits.", land:{ reply:"{them} turns it over slow. \"Huh. Hadn't framed it as a win. Mostly felt like the city forgot to invite us.\"", next:1 } },
          { approach:"blunt", line:"Say it plain: the company doesn't sell that floor a war. It sells us one.", land:{ reply:"{them}'s mouth twists. \"There it is. They keep us scared so they can keep them dancing. Same coin, two faces.\"", next:1 } },
          { approach:"probing", line:"Ask {them} if {them} could ever stand out there again. On the floor. Just a body.", land:{ reply:"{them} doesn't answer right off. \"Tried. Lasted a song. Then I clocked everyone who could reach me and walked back to the wall. To you, I guess.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} the wall's not the worst seat — not if {me}'s holding it too.", land:{ reply:"{them} bumps {me}'s shoulder, eyes still on the floor. \"Two old guns watching the kids be free. Could be worse company for the end of the world.\"", ev:213 } },
          { approach:"probing", gate:"dream", line:"Admit the one stupid peacetime thing {me} still wants out there: {dream}.", land:{ reply:"{them} doesn't laugh. \"That's a civilian's want.\" A beat. \"Good. Means there's still one of you left under the chrome. Go get it before the city remembers your name.\"", ev:214 } } ] }
      ] },
    { id:"club.recognized", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "A merc across the room keeps looking over — old colors half-scrubbed off the jacket, a face from the wrong side of some line. {them} catches it too and sets the drink down quiet. \"Friend of yours? 'Cause he's not mine.\"", "Someone at the bar's been clocking {me} too long. {them} reads it before {me} does, shifts to put a shoulder between {me} and the room. \"Don't turn yet. He knows you from somewhere you don't want to be known from.\"", "{them} murmurs without moving the mouth much: \"Three o'clock. Been making us for ten minutes. You owe anybody a war?\"" ], choices:[
          { approach:"blunt", line:"Tell {them} to stay seated. If it goes, it goes back-to-back like always.", land:{ reply:"{them} doesn't even look at the door — already has it. \"Obviously. I'm not running anywhere you're not.\" Hands loose, ready, calm.", next:1 } },
          { approach:"probing", line:"Ask {them} to read him. Hunter, or just another ghost looking for one of his own?", land:{ reply:"{them} studies him a long second. \"Not a hunter. He's got the same look you came in with. He's not making you. He's making sure he's not alone.\"", next:1 } },
          { approach:"warm", line:"Tell {them} it's fine, raise a glass at the stranger across the room.", check:true, land:{ reply:"The merc lifts his own back, slow, and turns away. Just another leftover counting the room. {them} exhales. \"Good read. Or good luck. Drink to both.\"", next:1 }, miss:{ reply:"The merc takes it as a challenge — squares up, then thinks better of two-on-one and melts into the crowd. {them} mutters, \"Don't do my reads for me.\" The night cools.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} that's twice now {them}'s put a body between {me} and a room.", land:{ reply:"{them} shrugs it like it's nothing, which means it's everything. \"Cheaper than finding a new drinking partner. Keep your head, I'll keep the room.\"", ev:215 } },
          { approach:"blunt", gate:"crime", line:"Admit why {me} reads every room that hard: {crime}.", land:{ reply:"{them} takes it without a blink, files it where the rest goes. \"Then we watch your doors too. That's the deal now. You don't sit with your back to a room alone again.\"", ev:216 } } ] }
      ] },
    { id:"club.dont_sleep", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "It's past last call somewhere kinder, but {them} hasn't moved to leave. \"You don't sleep either,\" {them} says. Not a question. \"That's why we're both still here at this hour.\"", "The crowd's thinned to the people who've got nothing to go home to. {them} nurses a flat drink. \"Bed's worse than the bar. Bar's loud enough to drown the replays. You know the trick.\"", "{them} catches {me} ordering one more nobody needs. \"Staying till the room kicks us out, huh. Me too. Quiet's where they come back.\"" ], choices:[
          { approach:"warm", line:"Admit it — {me}'d rather close down a club than face the ceiling at 0300.", land:{ reply:"{them} nods like a confession answered. \"The ceiling's the worst screen there is. Plays everything you couldn't fix, on a loop, in the dark.\"", next:1 } },
          { approach:"probing", line:"Ask who comes back for {them}, in the quiet. Names or just shapes.", land:{ reply:"{them} swirls the glass. \"Started as names. Now it's mostly the seconds before. The look they give you right when you know you're too late.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} sleep's a place neither of you lives anymore. Order coffee instead.", land:{ reply:"{them} snorts. \"Coffee at a club. We're a tragedy.\" But {them} waves the bartender over for two. \"Fine. Let's not pretend we're leaving.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} to call {me} on the bad nights instead of drinking the clock down alone.", land:{ reply:"{them} looks at {me} a long beat. \"And say what.\" {me} says: nothing. Just so the quiet's got two people in it. {them} pockets the idea like contraband.", ev:217 } },
          { approach:"probing", gate:"trauma", line:"Give {them} the one that loops loudest for {me}: {trauma}.", land:{ reply:"{them} doesn't try to lift it off {me}. \"Yeah. That one's a keeper. You don't get to put those down.\" A pause. \"But you can hand me the other end. So you're not the only one holding it at 0300.\"", ev:218 } } ] }
      ] },
    { id:"club.what_we_are_now", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them} sets the drink down without taking it and looks {me} dead on. \"What is this. What are we. 'Cause it's more than two grunts killing a night, and I'm too old to pretend I don't notice.\"", "Out of nowhere, between songs: \"I don't have a word for you.\" {them} says it like it's been bothering him for weeks. \"Not a friend exactly. Friends you can lose and live. So what's the word.\"", "{them} taps the table twice, the way {them} does before saying something hard. \"I trust you with the wrong end of a firefight. I don't trust anyone with that. Bothers me I don't know what to call it.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you don't need a word for the one person who'd come back for {me}.", land:{ reply:"{them} sits with that. \"Yeah. Maybe the word's just that. The one who comes back.\" The glass finally gets lifted.", next:1 } },
          { approach:"blunt", line:"Say it's not friendship. It's the thing units used to mean before the company sold the word.", land:{ reply:"{them} points at {me} like {me} cracked it. \"That. They took 'unit' and made it a payroll line. But this is the old one. The one you'd die holding.\"", next:1 } },
          { approach:"probing", line:"Turn it back — ask why {them} needs a word for it at all.", land:{ reply:"{them} almost ducks it, then doesn't. \"Because everyone I had a word for is gone. Maybe I'm scared to name you in case naming's what does it.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} the city's already taken everything with a name. Let this one go nameless and survive.", land:{ reply:"{them} lets out a breath that's been held a long time. \"Nameless it is. Can't requisition what it can't find on a form.\" Glasses meet, quiet.", ev:219 } },
          { approach:"blunt", line:"Give it the only name that fits — whatever's left when everyone else is gone, you two are still standing.", land:{ reply:"{them} doesn't argue. \"Last two standing.\" {them} says it like a rank. \"Out of a whole roster. That's the word. That'll do.\"", ev:220 } } ] }
      ] },
    { id:"club.wound_wont_close", venue:"club", kind:"friend", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them} winces reaching for the glass and tries to hide it. There's a stain at the side seam the dark almost covers. \"It's nothing. Old hole that forgot how to close. The ripper's a thief, not a healer.\"", "{me} notices {them} keeps a hand pressed to the ribs between drinks. \"Don't,\" {them} says before {me} can. \"It pulls when I laugh, that's all. So I quit laughing. Problem solved.\"", "{them} sits at an angle all night, favoring one side. Finally: \"Took one on {home} that never sat right. Cheaper to drink through it than fix it. You know the budget.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} drinking through a leak isn't tough, it's slow. Get it looked at.", check:true, land:{ reply:"{them} bristles, then folds. \"...Yeah. Yeah, I been putting it off so long it became furniture.\" The hand comes off the ribs. \"Walk me to a ripper next week. So I actually go.\"", next:1 }, miss:{ reply:"{them} shuts down like a hatch. \"Didn't ask for a medic.\" Pulls the jacket closed and changes the subject. The seam stays dark.", pts:0 } },
          { approach:"warm", line:"Offer to cover the patch-up. {me}'s last cut's good for one of you to be whole.", land:{ reply:"{them} shakes his head, but slower than the first reflex. \"Can't take that.\" A beat. \"...Ask me again when I'm sober and I might let you. That's the most yes you'll get.\"", next:1 } },
          { approach:"probing", line:"Ask if it's the wound {them}'s nursing, or what it's a receipt for.", land:{ reply:"{them} goes still. \"...That's the trick question, isn't it. Body heals if you let it. The receipt's the part that won't. You always go for the soft spot.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} {me}'s seen enough of these end bad to not lose one more to stubborn.", land:{ reply:"{them} meets {me}'s eye and reads it's not a fuss, it's a fear. \"Alright. Alright. I'll go. For you, not for me — that's how I'll square it.\" And {them} means it.", ev:221 } },
          { approach:"probing", gate:"trauma", line:"Trade {them} the receipt {me} carries that no ripper can touch: {trauma}.", land:{ reply:"{them} listens all the way through, doesn't flinch. \"Right. Some of it doesn't close on purpose. So we keep each other's open ones from going septic.\" {them} taps {me}'s glass. \"Deal.\"", ev:222 } } ] }
      ] },
    { id:"club.old_song", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "The track changes and something old crawls out of the speakers — a song from before, charts nobody's topped since the bombing. {them} goes still mid-sip. \"They still play this. Like nothing happened.\"", "Some pre-war hit limps out of the system, half the bass blown. {them} doesn't move for a second. \"Last time I heard this, the radio still worked and so did the guy next to me.\"", "The club drops into an old anthem, scratched and too loud. {them} sets the glass down without drinking. \"You know this one. Course you do. Everybody our age does.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you remember exactly where you were the last time it played clean.", land:{ reply:"\"Yeah,\" {them} says. \"Me too. Don't tell me where. I'll tell you mine sometime that isn't tonight.\"", next:1 } },
          { approach:"blunt", line:"Say it's just noise now. A dead band for a dead city.", check:true, land:{ reply:"{them} huffs. \"Dead band, dead city, two dead-enders humming along. Sounds about right.\"", next:1 }, miss:{ reply:"{them} doesn't laugh. Just lets the song finish, alone with it, and the moment closes.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} if there's a song they had to stop being able to hear. One they'd skip if the system let them.", land:{ reply:"{them} names it — barely — and {me} doesn't ask why. Just nods, and they let the dead band play out the rest.", ev:223 } },
          { approach:"warm", line:"Hum the next line wrong on purpose, just to see if {them} corrects it.", land:{ reply:"{them} corrects it without thinking, then catches the trap and almost smiles. \"You did that on purpose.\" Two old wrecks knowing the same dead words.", ev:224 } } ] }
      ] },
    { id:"club.bad_hand", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them}'s chromed hand misfires reaching for the glass — a stutter, fingers locking a half-second too long. {them} sets it flat on the table fast, like that hides it.", "{them} goes to lift the drink and the augmented arm twitches, spilling a little. {them} stares at it like it belongs to a stranger. \"Cheap chrome. Don't.\"", "{me} clocks the tremor in {them}'s wired hand before {them} does. {them} sees {me} see it. \"It does that now. The clinics that fix it took the same week off as my pension.\"" ], choices:[
          { approach:"warm", line:"Slide your own drink into {them}'s good hand and say nothing about the bad one.", land:{ reply:"{them} takes it with the steady hand, lets out a breath. \"...Thanks. Not for the drink.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} a glitchy gun-hand on the line gets you both killed. Get it looked at.", check:true, land:{ reply:"\"I know,\" {them} says, quiet. \"That's the part keeping me up. Glad somebody'll say it to my face.\"", next:1 }, miss:{ reply:"{them}'s jaw tightens. \"Didn't ask for an inspection.\" The hand goes under the table and stays there.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what the surgeons actually told {them} — not the bar version, the real number.", land:{ reply:"{them} gives {me} the real number. It's worse than the bar version. {them} watches {me} take it without flinching, and something unclenches.", ev:225 } },
          { approach:"warm", line:"Promise that if the hand ever locks at the wrong moment, you'll be the one covering that side.", land:{ reply:"\"You can't promise that,\" {them} says. But {them} doesn't pull the hand away when {me} says it anyway. That's the answer.", ev:226 } } ] }
      ] },
    { id:"club.civilians_dancing", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "On the floor a knot of kids who've never seen a tracer dance like the city isn't on fire. {them} watches them over the rim of the glass. \"Look at that. They actually believe it's fine.\"", "Civilians fill the floor, laughing, soft-handed, untouched. {them} tracks them the way you track movement, then catches {me} doing it too. \"We're the only two in here counting.\"", "A couple by the speakers dances close, eyes shut, trusting the dark. {them} can't stop staring. \"When's the last time you closed your eyes in a room you didn't clear first.\"" ], choices:[
          { approach:"warm", line:"Say at least somebody gets to. That's half the reason you both went out there.", land:{ reply:"{them} considers it. \"...Yeah. Tell myself that on the good nights.\" {them} lifts the glass an inch toward the floor.", next:1 } },
          { approach:"blunt", line:"Say you don't envy them. You'd just get them killed if it ever came down to it.", check:true, land:{ reply:"\"There it is,\" {them} says. \"Knew you'd see it the same. We don't get to be them. We get to keep them.\"", next:1 }, miss:{ reply:"{them} frowns. \"Cheap. They didn't do anything to you.\" {them} goes back to watching the floor, alone with it.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} if they think there's a version of themselves still on that floor somewhere, the one who never enlisted.", land:{ reply:"{them} watches the dancers a long time. \"He's dead. Died the day I signed. But yeah. Sometimes I wave at him.\" {me} doesn't laugh and {them} is grateful for it.", ev:227 } },
          { approach:"warm", line:"Bet {them} a round they can't remember how to dance. Mean it as a dare.", land:{ reply:"{them} doesn't take the dare. But the laugh is real, the first one all night. \"No. But I'll buy the round for making me think about it.\"", ev:228 } } ] }
      ] },
    { id:"club.last_two_standing", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "The floor's emptied out. Staff are stacking chairs and it's just {me} and {them} left at the table, two glasses and the hum of the cooler. \"Funny,\" {them} says. \"Always us two. Always the last ones who won't go home.\"", "Last bodies file out into the wet street. {them} hasn't moved. \"Nobody waiting on either of us, huh. That's how we always end up the cleanup crew.\"", "The bartender flips chairs around you both like a hint. {them} ignores it, turning the empty glass. \"You ever notice we don't leave till they make us? Neither of us got a reason to.\"" ], choices:[
          { approach:"warm", line:"Say being the last two beats being the last one. You'll take it.", land:{ reply:"{them} turns that over. \"Last two. Yeah.\" {them} doesn't reach for the door yet. \"Bartender can wait a minute.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} you both stay late because the apartment's worse than this. Just say it.", check:true, land:{ reply:"\"Brutal,\" {them} says. \"And true. The quiet at mine has too much room in it.\" {them} stays put.", next:1 }, miss:{ reply:"{them} goes flat. \"Speak for your own apartment.\" {them} stands, grabs a coat, and the night ends thinner than it started.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} who used to be the one waiting up — back when somebody was.", land:{ reply:"{them} answers in two words and stops. {me} doesn't push for the third. The cooler hums and that's enough company between two people who know the shape of an empty room.", ev:229 } },
          { approach:"warm", line:"Make it a standing thing — last table, every off-night, the two of you, till one of you can't.", land:{ reply:"\"Till one of us can't,\" {them} repeats, like sealing it. \"Deal. Don't be the one who can't first.\" Neither of you says you mean it. You both do.", ev:230 } } ] }
      ] },
    { id:"club.what_we_did", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "Some stranger leans over asking what you two did in the war, all bright-eyed. {them} gives the clean lie smooth as glass, waits till they wander off, then exhales. \"You ever tell anyone the true version?\"", "A kid at the next stool wants the heroic story. {them} feeds them the recruiting-poster cut, smiling, dead behind it. When they go, {them} turns to {me}. \"They never want the one that actually happened.\"", "Someone asks if it was like the propos make it look. {them} says \"exactly like that,\" lets them leave happy, then mutters: \"Took me years to get good at lying about it. You?\"" ], choices:[
          { approach:"warm", line:"Tell {them} the clean lie is a kindness. To them and to us. Let them keep it.", land:{ reply:"\"A kindness,\" {them} echoes. \"Maybe. Sure costs less than the truth.\" {them} signals for two more.", next:1 } },
          { approach:"blunt", line:"Say the lie's gotten so smooth you're not sure you remember the real version anymore. Be honest about that.", check:true, land:{ reply:"{them} goes quiet, then nods slow. \"That scares me more than anything out there did. Glad it's not just me.\"", next:1 }, miss:{ reply:"{them} shrugs it off. \"Speak for yourself. I remember fine.\" But the eyes say otherwise, and the door's shut on it now.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell {them} the part of the true version {me} never says — that {crime} — and watch what {them} does with it.", land:{ reply:"{them} doesn't blink. \"Figured it was something like that. We all came back owing somebody something we can't say out loud.\" {them} takes the weight like it's nothing, and that's everything.", ev:231 } },
          { approach:"warm", line:"Agree you'll both keep telling strangers the poster version — but never each other.", land:{ reply:"\"Never each other,\" {them} agrees, and clinks the glass on it. \"The truth's got exactly one seat at this table, and it's yours.\"", ev:232 } } ] }
      ] },
    { id:"club.hazard_pay", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} slaps a fat creased pay-chit on the bar and orders the top-shelf nobody here can pronounce. \"Hazard bonus came through. Burning it tonight before I do the math on what they charged me for it.\"", "{them} buys the whole top shelf a round, flush with combat pay, grinning too wide. \"Spend it fast enough, you don't have to think about what it's pay FOR. Drink up, it's the company's.\"", "{them} fans out a stack of fresh chits — hazard pay, finally cleared — and waves the bartender over. \"Tonight we drink like it means something. Tomorrow I'll remember it doesn't.\"" ], choices:[
          { approach:"warm", line:"Let {them} buy. Tonight isn't the night to point out what the money's standing in for.", land:{ reply:"{them} pours generous. \"Smart. You always know which night's which.\" The good stuff hits like the lie it is, and it's a good lie tonight.", next:1 } },
          { approach:"blunt", line:"Tell {them} that's blood money and you'll happily help drink it, because what else is it good for.", check:true, land:{ reply:"{them} barks a laugh. \"Blood money. God, yes. To everything it can't buy back.\" {them} clinks hard enough to chip the rim.", next:1 }, miss:{ reply:"The word lands wrong. {them} caps the bottle. \"Way to make it about the dead. Forget it.\" The flush goes out of the night.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what they were saving up for, before they learned to just burn it.", land:{ reply:"{them} tells {me} — a plan from a younger, dumber self that the war priced out of reach. \"Cheaper to drink it,\" {them} says. {me} doesn't argue, just orders the next round on {me}'s chit instead.", ev:233 } },
          { approach:"warm", line:"Make {them} pocket half before it's gone. Say you'll hold them to keeping it.", land:{ reply:"{them} resists, then folds the half into a pocket, almost embarrassed. \"Nobody's made me keep money in years.\" {them} taps the pocket like proof it's still there.", ev:234 } } ] }
      ] },
    { id:"club.when_it_cuts_out", venue:"club", kind:"friend", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "The sound system dies mid-track — a blown breaker, a dropped feed — and the whole club drops into raw quiet. {me} and {them} are both already half out of the chair before anyone else even notices. {them} catches {me}'s eye. \"...Reflex.\"", "The music cuts dead. In the sudden silence the only two people in Static reaching for a weapon that isn't there are {me} and {them}. {them} lowers the empty hand slow. \"You felt it too. The quiet's the part that gets you.\"", "Power stutters and the bass cuts out cold. Civilians groan; {me} and {them} go still and ready, scanning, before the lights even flicker back. {them} exhales. \"It's the silence, every time. Never got over it.\"" ], choices:[
          { approach:"warm", line:"Sit back down slow and tell {them} you've got the room — let them stand down first.", land:{ reply:"{them} eases back into the chair, watching {me} keep the watch. \"...Okay. Okay.\" The bass kicks back in and {them}'s shoulders finally drop.", next:1 } },
          { approach:"blunt", line:"Say it out loud — that quiet means incoming, and the body never unlearned it. No shame in it.", check:true, land:{ reply:"\"No shame in it,\" {them} repeats, like {them}'s needed to hear it for a long time. \"Everybody else thinks we're twitchy. You know it's the smartest thing we own.\"", next:1 }, miss:{ reply:"{them} stiffens, embarrassed now. \"Forget it. Breaker tripped, that's all.\" {them} sits and pretends the hand wasn't reaching.", pts:0 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell {them} which silence the body's really bracing for — that {trauma} — the one the music is supposed to drown out.", land:{ reply:"{them} listens to all of it, the real one, and doesn't try to fix it. \"Mine's got a quiet like that too. Different field, same silence.\" Two people bracing for the same nothing.", ev:235 } },
          { approach:"warm", line:"Promise that next time it cuts out, you'll both just look at each other and laugh — no hands moving.", land:{ reply:"\"Won't happen,\" {them} says, but the corner of the mouth goes up. \"But I'll look for you first. That part I believe.\" The next dropout, weeks later, you both remember to.", ev:236 } } ] }
      ] },
    { id:"club.the_count", venue:"club", kind:"friend", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} watches {me} line the empties up in a neat row instead of letting the busboy take them. \"You always count them. Like a tally on a wall.\"", "{them} reaches over and stops {me}'s hand mid-pour. \"That's four you didn't taste. You're not drinking it, you're using it. I know the difference.\"" ], choices:[
          { approach:"warm", line:"Tell {them} it's the only thing that turns the volume down.", land:{ reply:"\"Yeah.\" {them} doesn't move {me}'s hand. \"Turns it down. Never off, though. You found the off switch, you tell me where.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} to mind their own glass.", check:true, land:{ reply:"\"It is my glass. Same poison, same reason.\" {them} lets go. \"Sit, then. Use it where I can see you.\"", next:1 }, miss:{ reply:"It lands harder than {me} meant. {them} pulls back, leaves the row of empties standing between you like a fence.", pts:0 } },
          { approach:"probing", line:"Ask {them} how many it takes them now, before anything goes quiet.", land:{ reply:"\"More than last year. Less than next.\" {them} almost laughs. \"That's the whole con, isn't it. The number only ever climbs.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Push {them}'s next drink an inch away and say the count can wait a night.", land:{ reply:"{them} looks at the inch like it's a long way. Doesn't reach. \"One night. We'll feel it tomorrow and call that proof we're alive.\"", ev:237 } },
          { approach:"probing", gate:"trauma", line:"Tell {them} what the drink is actually drowning: {trauma}.", land:{ reply:"{them} doesn't fill the quiet with anything cheap. \"Then no wonder you count. Some nights you can't outpour that.\" {them} matches {me}, glass for glass, till it's bearable.", ev:238 } },
          { approach:"blunt", line:"Knock back the row anyway and tell {them} the count is the only honest thing in this city.", land:{ reply:"{them} doesn't fight it. Lifts a glass to the row of empties like they're names. \"Honest. Fine. To the honest dead, then.\" You drink to nothing and feel it.", ev:239 } } ] }
      ] },
    { id:"club.after_the_noise", venue:"club", kind:"friend", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} nods at the dance floor — kids who've never been shot at, moving like the night owes them something. \"Look at them. Whole lives that aren't about the next contract. You remember being one of those?\"", "{them} watches the chrome and the kids and the strobe and says, half to the bass, \"There's a version of this where the war ends and we just... what. What do we do with our hands.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you'd figure it out together, whatever the hands ended up doing.", land:{ reply:"\"Together.\" {them} turns the word over like it's foreign. \"Two old dogs learning to sit. I'd watch you try.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} the war doesn't end. People like you just stop.", check:true, land:{ reply:"{them} doesn't flinch. \"Maybe. But I'd rather be wrong out loud with you than right and quiet alone.\"", next:1 }, miss:{ reply:"{them} stares at the floor a long beat. \"Yeah. Forget I asked.\" The kids keep dancing. The shape of the question closes back up.", pts:0 } },
          { approach:"probing", line:"Ask {them} what they actually want, if the contracts ever ran out.", land:{ reply:"{them} goes quiet, like nobody's asked in years. \"That's the thing nobody asks a soldier. We're a tool. Tools don't get a 'after.'\" But {them} is thinking now.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"dream", line:"Offer {them} yours first, so it's not the only one on the table: {dream}.", land:{ reply:"{them} hears it and doesn't laugh, which from {them} is everything. \"Then you don't get to die out here before you've had it. That's an order now.\"", ev:240, fl:"ARC_UNLOCKED" } },
          { approach:"warm", line:"Tell {them} to pick a place that isn't here, and you'd both go look at it sometime.", land:{ reply:"\"Somewhere with no strobe. No bass. A view.\" {them} almost believes it for a second. \"We'd be bored stupid inside a week.\" But {them} files it. You can tell.", ev:241 } },
          { approach:"blunt", line:"Tell {them} not to plan an after. It's how the city gets you to flinch.", land:{ reply:"{them} nods slow. \"Right. Want nothing, lose nothing.\" Drinks. \"Lonely doctrine, but it's kept us breathing.\" The question shuts. No memory of it, the way you both wanted.", pts:0 } } ] }
      ] },
    { id:"club.the_shakes", venue:"club", kind:"friend", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} sets the glass down too hard — the hand's not landing where it's aimed anymore. {them} catches {me} catching it. \"Wiring's old. Don't look at me like that.\"", "{them} flexes a chromed hand under the table where {them} thinks {me} can't see, working the tremor out of it. \"Cold in here,\" {them} says, and you both know it isn't." ], choices:[
          { approach:"warm", line:"Tell {them} you've got the same rattle on the cold mornings. They're not alone in it.", land:{ reply:"{them} lets the hand rest. \"Yeah? Misery and company. Least the warranty ran out on both of us the same year.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} to get the chrome looked at before it drops them in the field.", check:true, land:{ reply:"\"With what money.\" Flat, no heat. \"But yeah. You'd be the one carrying me out, so. Point taken.\"", next:1 }, miss:{ reply:"{them} bristles, tucks the hand away. \"It's fine. It's handled.\" It isn't, and now you can't say so. The subject's armored over.", pts:0 } },
          { approach:"probing", line:"Ask {them} how long it's been getting worse, honestly.", land:{ reply:"A long pause. \"Since the ridge. Maybe before. You don't notice the body quitting one piece at a time — you notice the day it adds up.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Tell {them} to put you in the loop next time the hand fails — so somebody knows to cover the gap.", land:{ reply:"{them} weighs it like it costs something to say yes. \"Fine. You watch my off-hand. I watch your bad knee. We rot in formation.\" {them} means it, which is the gift.", ev:242 } },
          { approach:"warm", line:"Hold {them}'s shaking hand still on the table for a second and just leave it there.", land:{ reply:"{them} doesn't pull away. Lets the tremor be held a moment, the only steady thing in the room. \"...Don't make it weird,\" {them} says, voice gone rough.", ev:243 } },
          { approach:"blunt", line:"Tell {them} the chrome doesn't matter — you've seen them shoot worse and not miss.", land:{ reply:"{them} snorts. \"Liar. But the good kind.\" Steadies the hand by an act of will, just to prove the lie has some truth in it. It almost holds.", ev:244 } } ] }
      ] },
    { id:"club.even", venue:"club", kind:"friend", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} pushes a drink over without the usual ribbing. \"That door on {home} last week. The one you walked through ahead of me. You knew it was bad and you went first.\"", "{them} sets two glasses down, won't quite meet {me}'s eye. \"I've been doing math since {home}. The kind where I come out owing you and there's no chit that covers it.\"" ], choices:[
          { approach:"warm", line:"Tell {them} there's no ledger between you. Never was.", land:{ reply:"\"There's always a ledger.\" {them} taps the table. \"Difference is, with you, I stopped checking the balance. Took me a year to notice.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} they'd have done the same and you both know it, so drop it.", land:{ reply:"\"I would've. That's not the part that's eating me.\" {them} turns the glass. \"It's that I didn't even think before I let you. Trusted it. When'd I start doing that?\"", next:1 } },
          { approach:"probing", line:"Ask {them} what's really under the math — it isn't the door.", check:true, land:{ reply:"{them} exhales. \"It's that if you'd gone down in that doorway, I'd have nothing left worth coming back to. That's a stupid amount of weight to hang on one person.\"", next:1 }, miss:{ reply:"{them} waves it off. \"Forget it. It's just a debt. I'll buy the next month of rounds, we're square.\" The realer thing slides back under.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} the weight runs both ways — you hung it on them just as bad.", land:{ reply:"{them} sits with that. \"So we're both carrying a thing that could get us killed by mattering. Great plan.\" But {them} is steadier now, like the load's lighter shared.", ev:245 } },
          { approach:"probing", line:"Ask {them} straight: if it came to it, would they rather you'd let the door take you and stayed clear?", land:{ reply:"{them} answers before the question's done. \"No. God, no. I'd rather owe you forever than not owe you at all.\" {them} hears it land and doesn't take it back.", ev:246 } },
          { approach:"blunt", line:"Slide the drink back and call the debt paid in full, right now, no more math.", land:{ reply:"{them} looks at the drink, then at {me}. \"...Paid in full.\" Drinks it like sealing something. \"You ever go first like that again without telling me, though, I'll kill you myself.\"", ev:247 } } ] }
      ] },
    { id:"club.who_claims_it", venue:"club", kind:"friend", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} watches them haul a body out the side door — some merc nobody came for, tag still on. \"Forty-eight hours, then the city renders him for parts. No name on the slab. That's the standard package for our kind.\"", "{them} nods at the side door, the gurney, the bored medics. \"Know what gets me? Not the dying. The nobody-claiming-it. You go in a drawer and stay a drawer.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you'd claim them. Whatever was left, you'd come get it.", land:{ reply:"{them} goes still. \"You'd come for the body.\" Not a question — {them} is testing the weight of it. \"Most people won't even come for the living.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} it won't matter to them — they'll be dead. The drawer's for the living to fret over.", check:true, land:{ reply:"\"Maybe. But somebody knowing where you ended up...\" {them} trails off. \"It's the difference between dying and just stopping. I want the first one.\"", next:1 }, miss:{ reply:"{them} shrugs it hard and orders another. \"Yeah. You're right. Morbid talk.\" The door swings shut on the gurney and on the subject both.", pts:0 } },
          { approach:"probing", line:"Ask {them} who they'd want notified, if it came to it. Honestly.", land:{ reply:"Long quiet. \"That's the joke. The list got short. Then it got shorter.\" {them} doesn't say the name on it. {me} can guess whose it is now.", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Make it a deal: whoever goes first, the other one comes and claims them. No drawer.", land:{ reply:"{them} sticks a hand out across the sticky table, dead serious. \"Whoever's left does the claiming. Shake on it.\" You shake. It's the realest contract either of you ever signed.", ev:248 } },
          { approach:"probing", gate:"crime", line:"Tell {them} the real reason no one would come for you — {crime} — and that they're the only one who'd come anyway.", land:{ reply:"{them} doesn't blink at it. \"So nobody legit will touch your body. Good thing I'm not legit.\" {them} means it as the warmest thing {them} owns, and it is.", ev:249 } },
          { approach:"blunt", line:"Tell {them} to stop morbid-talking and finish the drink — you're both still warm tonight.", land:{ reply:"{them} cracks half a grin. \"Still warm. Lowest bar in the city and we cleared it.\" Drinks. The deal stays unspoken, but you both heard it offered.", pts:0 } } ] }
      ] },
    { id:"club.the_one_song", venue:"club", kind:"friend", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "The DJ drops something old and broken under the new noise — a track that predates both your wars. {them} freezes mid-sentence. \"...Haven't heard that since before. Christ. Turn it off. Don't turn it off.\"", "A song surfaces in the mix that doesn't belong here, too old for this room. {them}'s knuckles go white on the glass. \"That was playing. The last good night. Before all of it. You ever get ambushed by a song?\"" ], choices:[
          { approach:"warm", line:"Let it play. Tell {them} you'll sit in it with them till it's done.", land:{ reply:"{them} doesn't talk over it. Just lets the old thing run its length, {me} beside them like a second pair of shoulders under it. When it ends: \"...Thanks. For not letting me hear that alone.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} a song's just air. Don't let it open a door you'll have to close again.", check:true, land:{ reply:"\"Just air.\" {them} almost laughs. \"You don't believe that or you wouldn't have your jaw locked like mine.\" Fair. You let it play anyway.", next:1 }, miss:{ reply:"{them} shuts down, waves the bartender for something stronger. \"Right. Just air.\" The door slams. You watch {them} go somewhere you can't follow tonight.", pts:0 } },
          { approach:"probing", line:"Ask {them} who they were the last time this played.", land:{ reply:"{them} stares through the strobe. \"Somebody with all his people still on the right side of the dirt. Funny — I don't miss that guy. I just miss having that many people.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} they've still got people. Got one, anyway, sitting right here.", land:{ reply:"{them} looks over like checking the statement for fine print, finds none. \"Yeah,\" {them} says, rough. \"One. Turns out one's the number that keeps you in the chair instead of in the river.\"", ev:250 } },
          { approach:"probing", gate:"trauma", line:"Match {them}'s ghost with your own — tell them what that song would've been playing over for you: {trauma}.", land:{ reply:"{them} takes it the way you take incoming for someone — without ducking. \"Then we'll let it play and both bleed quiet. Better company than I usually keep for that one.\"", ev:251 } },
          { approach:"blunt", line:"Wave the DJ to kill it and buy {them} the next round — enough excavation for one night.", land:{ reply:"The song cuts. {them} exhales like a held breath let go. \"Yeah. Bury it. We've dug up enough graves for one night.\" The new noise floods back in, merciful and dumb.", pts:0 } } ] }
      ] },
    { id:"club.good_seat", venue:"club", kind:"friend", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "{them} is already in the corner seat — the one with the whole room in front of it — and slides out of it when {me} walks up. \"Take the wall tonight. I'll watch the door.\"", "{them} gives up the good seat without a word, the one that sees every exit, and drops into the blind stool with {me}'s back to the room. \"Go on. You earned a night not counting heads.\"", "There's one chair in Static that can see everything, and {them} is standing beside it instead of sitting in it. \"Yours. I've had it the last hundred nights. Your turn to not flinch.\"" ], choices:[
          { approach:"warm", line:"Take the seat. Tell {them} it's the first time in years {me}'s sat with a wall behind.", land:{ reply:"\"Then sit in it like you mean it.\" {them} turns the blind stool to cover the gap anyway. Old habit. Good habit.", next:1 } },
          { approach:"blunt", line:"Refuse it. Tell {them} neither of you relaxes — so you split the room instead.", land:{ reply:"\"Fine. You take left, I take right.\" Two chairs angled out, nobody behind anybody. \"Better. Hated giving it up anyway.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} who taught {them} to never sit blind. Somebody must have.", land:{ reply:"\"Guy who didn't.\" {them} doesn't elaborate, doesn't have to. \"You sit where the door is. That's the whole lesson. Cost him the rest of it.\"", next:2 } },
          { approach:"warm", line:"Tell {them} the watching's done for tonight — the only thing coming through that door is last call.", land:{ reply:"{them} actually leans back. An inch. For {them} it's a collapse. \"Last call. Listen to you. Almost sound like a person.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them}: from here on, whoever's more tired gets the wall. Standing arrangement.", land:{ reply:"\"Deal.\" {them} holds out a fist. \"And on a night neither of us can take it — we just don't come. We stay home and let the door be somebody else's problem.\"", ev:252, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"blunt", line:"Trade it back. Tell {them} the good seat's theirs — {me} doesn't know how to sit easy and isn't going to learn tonight.", land:{ reply:"{them} takes it back without argument, reads the door, settles. \"That's alright. You don't have to relax. You just have to know I've got it while you don't.\"", ev:253 } } ] }
      ] },
    { id:"club.stuck_song", venue:"club", kind:"friend", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "The club DJ drops a bassline and {them} goes rigid for half a beat, then forces it loose. \"Heard that exact note on a bad day once. Brain still files it under incoming.\"", "{them} is humming something under the music, the same four notes, over and over, not noticing. When {me} sits, {them} stops dead. \"...Was I doing it again. The tune. It gets stuck.\"", "A track in Static rolls up on a low drone and {them}'s hand finds the table edge like cover. \"Sorry. Something used to sound like that right before the sky opened up. Can't unhear it.\"" ], choices:[
          { approach:"warm", line:"Tell {them} to keep humming it — better out loud and dumb than locked in {them}'s skull.", land:{ reply:"{them} half-laughs and hums it at the ceiling, ridiculous, defanged. \"There. Now it's just a stupid noise two idiots are sharing.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} {me} has one too — a sound that means duck — and it never fully shuts up.", land:{ reply:"\"Yeah.\" {them} nods slow, relieved not to be the only one. \"Mine's that drone. What's yours.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what the tune was attached to. The day it learned to mean incoming.", check:true, land:{ reply:"{them} tells it low under the bass, just the shape of it — a convoy, a sound, the seconds after. \"That's the song. That's why I hum the damn thing.\"", next:2 }, miss:{ reply:"{them} opens {them}'s mouth, then shakes {them}'s head and lets the bass cover it. \"Not — not tonight. Just let it be a noise tonight.\"", pts:0 } },
          { approach:"warm", line:"Tell {them} you'll make a new memory for those four notes — right here, worst club in the city, two survivors.", land:{ reply:"\"Overwrite it.\" {them} tries the idea on like a coat that might fit. \"Worst club, worst drinks, you. Could do worse than that, for what it reminds me of.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Hum the four notes back at {them}, deliberately, and clink glasses on the last one. Make it yours now.", land:{ reply:"{them} clinks, holds the note with {me} till it cracks into a laugh. \"Okay. Okay. It's ours now. Stupid little four-note thing nobody else gets to have.\"", ev:254, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"probing", line:"Ask {them} if the sound ever lets go — or if you just learn to walk while it plays.", land:{ reply:"\"Doesn't let go.\" {them} says it without weight, just fact. \"You learn to walk anyway. Easier with somebody humming along, turns out. Didn't know that till now.\"", ev:255 } } ] }
      ] },
    { id:"club.still_on_books", venue:"club", kind:"friend", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "{them}'s deck buzzes on the table — a corp redeploy ping, the third this week — and {them} flips it face-down without reading it. \"Still on their books. They never actually let you out. You just stop answering.\"", "{them} shows {me} the screen before killing it: an automated recall notice, {them}'s old service number, a smiling logo. \"They send these on the anniversary. Like a birthday card that wants me back in the dirt.\"", "{them} silences a call mid-buzz and sets the deck down hard. \"Recruiter. Same machine that used me up wants a second helping. Says I'm 'pre-cleared.' Means they kept the file warm.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} to block the number. {them}'s not their asset anymore — and neither is {me}.", land:{ reply:"\"Block it.\" {them} says it like the idea's illegal. \"...Can you even do that. I never tried. Figured the ping was just the weather now.\"", next:1 } },
          { approach:"warm", line:"Tell {them} {me} gets the same pings — and {me}'s learned the trick is who you're sitting with when they come.", land:{ reply:"{them} exhales. \"Yeah? You too. Good. Bad, but good.\" {them} pushes the deck to the table's edge. \"Then we let it buzz.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} if {them} ever thinks about going back. The pension's late, the world's hard, the file's warm.", land:{ reply:"{them} stares at the dead screen a long moment. \"Every late-pension morning. Then I remember what they paid me in — and what it cost, and who paid it instead of me.\"", next:2 } },
          { approach:"blunt", gate:"crime", line:"Tell {them} the deck's a leash both ways — {crime} — so {me} learned the hard way what the company does with a number it still owns.", land:{ reply:"{them} goes still, then nods slow. \"So you know. They don't recall you because they miss you. They recall you because you're inventory they haven't written off.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Take {them}'s deck and yours, set them face-down side by side, and pour over both. Tonight the company doesn't get a vote.", land:{ reply:"{them} watches the two dead screens like they might rise. \"Side by side. Off. For one night the machine can't find either of us.\" {them} lifts a glass. \"To being lost.\"", ev:256, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"probing", line:"Ask {them} what {them} would do if the recall ever stopped being a card and showed up as a hand on the shoulder.", land:{ reply:"\"If it ever gets physical?\" {them} meets {me}'s eyes, no drama in it. \"Then I'm not going alone, and I'm not going quiet, and I already know who's getting the other call.\"", ev:257 } } ] }
      ] },
    { id:"club.closing_time", venue:"club", kind:"friend", req:{ minTier:4, maxTier:4 },
      beats:[
        { open:[ "The lights come half-up, the bass dies, and {them} doesn't move to leave. \"This is the part I hate. Not the war. The walk back to a room nobody's in.\"", "Closing time at Static, and {them} is nursing the dregs slow, the way you slow-walk a thing you don't want to reach. \"Home's just where the noise stops and the thinking starts. I take the long way.\"", "Staff start stacking chairs and {them} stays put, watching the door {me} came through earlier. \"Funny. Easiest part of my day is now. Hardest part's the empty hallway after.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you'll walk {them} as far as your streets split. The hallway can wait a few more blocks.", land:{ reply:"{them} stands, almost grateful, hiding it badly. \"As far as the split, then. Better than the door spitting me straight into the quiet.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} {me} doesn't sleep either — the empty room's worse than any op {me}'s pulled.", land:{ reply:"\"Worse than any op.\" {them} nods, dead honest. \"At least the op wants you alive. The room doesn't care either way. That's the part that gets me.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what the mornings are actually like. The waking-up-alone-after-all-that part.", check:true, land:{ reply:"{them} tells it plain — the first second you forget, then the whole war remembering itself, then the ceiling. \"Every day. You reach for a rifle that isn't there and a name that isn't either.\"", next:2 }, miss:{ reply:"{them} waves it off, jaw tight. \"Mornings are mornings. Don't make me describe the ceiling, it's the one thing I've got that's mine.\"", pts:0 } },
          { approach:"warm", gate:"dream", line:"Tell {them} the small thing that gets {me} up anyway: {dream} — give {them} something to reach for besides the rifle.", land:{ reply:"{them} turns it over, careful with it. \"Huh. Something on the other side of the morning. I forgot you were allowed to want one of those.\"", next:2 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them}: text {me} when the morning's bad. Don't ride the ceiling alone. {me} will answer.", land:{ reply:"\"Text you.\" {them} says it like trying on a foreign word, then pockets it. \"Alright. And you text me. We make the empty hallways shorter, one ping at a time.\"", ev:258, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"probing", line:"Ask {them} if it ever stops — going home alone after a war — or if you just stop expecting it to.", land:{ reply:"\"Doesn't stop.\" The chairs are all stacked now. \"You just stop walking into it surprised. And tonight I'm not walking into it till the streets actually make me. So. One more block.\"", ev:259 } } ] }
      ] },
    { id:"club.glassbreak", venue:"club", kind:"rival", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "A glass goes off the wall near the floor and the bass swallows it. Two kids squaring up. {them} watches them, not the dancers. \"Twenty says the loud one swings first. You in, or you just here to disapprove?\"", "Something breaks across Static and the crowd folds away from it like water. {them} doesn't flinch, doesn't turn. \"You counted the exits already. I watched you do it. We're not the same kind of tired.\"", "A fight kicks off by the floor and the whole club leans toward it. {them} keeps their eyes on {me}. \"You went still. Not scared-still. Worse. Trigger-still. I know the difference.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} the only reason you're not breaking it up is you'd enjoy it too much, and that scares you more than the kids do.", check:true, land:{ reply:"{them} stops watching the fight. \"Yeah. That's the honest answer. Most people lie about that part.\"", next:1 }, miss:{ reply:"It lands wrong, too loud, and {them} just snorts. \"Save the confession. Bouncer's got it.\" They look away.", pts:0 } },
          { approach:"warm", line:"Say nothing's worth twenty bucks anymore and put a hand flat on the bar — the not-this-tonight signal you both still know.", land:{ reply:"{them} sees the hand. Recognizes the field sign. Drops it. \"Fine. Off-duty. For the both of us.\"", next:1 } },
          { approach:"probing", line:"Ask {them} why they're betting on a bar brawl instead of watching the door like the both of you were trained to.", land:{ reply:"\"Because watching the door is all I do, every hour, forever,\" {them} says. \"Tonight I'd like to watch something I'm allowed to let happen.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Tell {them} you noticed they sat with their back to the wall too, and ask which war taught them that — yours, or the one before.", land:{ reply:"\"Same one. We just stood at different ends of the line and decided we hated each other to keep warm.\" The kids get hauled apart. Nobody dies. {them} finishes the drink and stays.", ev:260 } },
          { approach:"blunt", line:"Tell {them} to enjoy the show — you're done watching other people's wars for free.", land:{ reply:"\"There it is,\" {them} says, almost pleased. \"Go, then. Some of us stay till the glass is swept.\" You leave them to it. Nothing settled.", pts:0 } } ] }
      ] },
    { id:"club.owed", venue:"club", kind:"rival", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them} drops a folded bill on the bar in front of {me} without a word, then waits. \"That's what I owed you off the ridge. I don't like owing you. Take it so I can hate you clean.\"", "{them} slides money across — exact, counted, weeks old. \"You covered my tab the night I couldn't pay and you've held it over me ever since just by not mentioning it. So. Mentioned. We're even.\"", "{them} pushes a few bills at {me} under the rim of a glass. \"Paying my debt. Don't make a thing of it. The thing is the part I can't stand.\"" ], choices:[
          { approach:"blunt", line:"Push the money back and tell {them} you never counted it as a debt — which means it was never theirs to settle.", check:true, land:{ reply:"{them}'s jaw works. \"That's worse. You know that's worse.\" But they leave the bill where you pushed it.", next:1 }, miss:{ reply:"{them} takes it as a power play and pockets the bill again. \"Fine. I tried. Choke on it.\" They turn back to the floor.", pts:0 } },
          { approach:"warm", line:"Take the money, fold it once, and use it to buy {them} the drink they're already holding — debt closed, no one wins.", land:{ reply:"{them} looks at the fresh glass like it might be poisoned. Drinks it anyway. \"Cute. I still don't like you.\" The hate's gone soft at the edge, though.", next:1 } },
          { approach:"probing", line:"Ask {them} what they think a debt to a man you hate is actually worth — and why they kept it so exact.", land:{ reply:"\"Because the number's the only honest thing between us,\" {them} says. \"Everything else we say is armor.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell {them} you've carried worse debts than money — that {crime} — and money's the kind you can actually stand to pay back.", land:{ reply:"{them} goes quiet a long beat. \"Then we're square on the small thing and ruined on the big ones, same as everybody. Drink with me anyway.\" You do.", ev:261 } },
          { approach:"warm", line:"Tell {them} the debt was never the money — it was the night they let you cover them and didn't pretend it didn't happen.", land:{ reply:"\"Don't,\" {them} says, but doesn't move off the stool. \"Don't make it a kindness. I can't fight a kindness.\" They stay till the bill's just paper between you.", ev:262 } } ] }
      ] },
    { id:"club.kidwatching", venue:"club", kind:"rival", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "A fresh recruit keeps circling your end of the bar, working up the nerve to ask the two of you anything. {them} clocks it before {me} does. \"Kid thinks we're heroes. Thinks we're friends. Which lie do we let them keep?\"", "Some new blood is watching {me} and {them} like the war's a story with a clean ending. {them} doesn't take their eyes off the kid. \"They've got the look. The one we had. You want to be the one that puts it out, or should I?\"", "A young one hovers, hungry for the old-soldier myth. {them} tilts their glass at them. \"That was us, once. Before we knew what the job actually costs. So. Do we warn them, or do we let them find out the cheap way?\"" ], choices:[
          { approach:"warm", line:"Tell {them} the kid doesn't need the truth tonight — wave the recruit off gently, let them keep the myth one more shift.", land:{ reply:"{them} watches you steer the kid away soft. \"Sentimental. Always were.\" But they don't undercut it. They let the kid go believing.", next:1 } },
          { approach:"blunt", line:"Tell the kid flat: you and {them} aren't friends, you're two people the war forgot to finish, and to go home while home still means something.", check:true, land:{ reply:"The kid blinks, takes it, goes pale and goes. {them} actually looks at {me} sideways. \"That was cruel. That was right. Both.\"", next:1 }, miss:{ reply:"It comes out bitter, not kind, and the kid hears the wrong thing — just two old wrecks bickering. They drift off unimpressed. {them} shrugs. \"Botched the mercy. Happens.\"", pts:0 } },
          { approach:"probing", line:"Ask {them} why it bothers them so much that the kid wants to be like the two of you.", land:{ reply:"\"Because they could still be something else,\" {them} says. \"We couldn't. Hasn't been a choice for me in a long time.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} straight: if you'd both been warned, back at the start, would either of you have listened?", land:{ reply:"\"No,\" {them} says, no hesitation. \"And that's the part that should scare the kid most. Nobody walks away from the warning. We just remember getting it.\" You sit with that, two ghosts agreeing for once.", ev:263 } },
          { approach:"warm", gate:"dream", line:"Tell {them} you point the young ones toward the thing you wanted before all this — {dream} — so at least one of them aims past the war.", land:{ reply:"{them} studies you like you've grown a second head. \"You still keep that? After everything?\" A long pause. \"Then maybe tell the kid. Not me. I'm past saving. Maybe they're not.\"", ev:264 } } ] }
      ] },
    { id:"club.cigarette", venue:"club", kind:"rival", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them} is down to one cigarette and looking at the no-smoking sign like a personal insult. They don't offer it. They split it. Tear it in half on the bar and slide {me} the bigger piece. \"Don't read anything into it. I just can't stand smoking alone.\"", "Out by the side door, the bass leaking through the wall, {them} has one cigarette left and tears it in two. Hands {me} half without looking. \"Habit. From the field. You ration with whoever's there, even if you'd shoot them on a better day.\"", "{them} catches {me} in the alley off Static and, instead of a word, splits their last cigarette and passes half over. \"We did this in the trenches with people we hated too. Means nothing. Smoke it.\"" ], choices:[
          { approach:"warm", line:"Take the half, light it off theirs, and tell {them} this is the most civil the two of you have ever managed.", land:{ reply:"{them} lets you share the flame. \"Don't get used to it. Sun comes up, I go back to not being able to look at you.\" But they don't pull away from the light.", next:1 } },
          { approach:"blunt", line:"Take it and tell {them} you'd rather smoke alone than owe them even half a cigarette.", check:true, land:{ reply:"{them} barks a laugh, real. \"Good. There's the right amount of spite. Now we can stand here.\" They light yours anyway.", next:1 }, miss:{ reply:"It's flat, not sharp, and {them} just shrugs and pockets the lighter. \"Suit yourself.\" They smoke their half and the moment's gone before it started.", pts:0 } },
          { approach:"probing", line:"Ask {them} who they used to split the ration with — before it came down to splitting it with you.", land:{ reply:"{them} goes still. \"People who aren't here to split it anymore. That's why you got the half. Last one standing gets the spite and the smoke both.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell {them} the field taught you to ration with whoever survived — even after {trauma} — because the alternative was nothing in your hands at all.", land:{ reply:"{them} doesn't say sorry. Wouldn't insult you with it. Just lets the silence agree, two coals burning down in the dark. \"Yeah,\" they finally say. \"Whoever's left. That's the whole brotherhood now. Us hateful few.\"", ev:265 } },
          { approach:"warm", line:"Finish the half, grind it out, and tell {them} you'll deny this happened — and so will they, and that's how you'll both know it did.", land:{ reply:"\"Deal,\" {them} says. \"Never happened. Worst-kept secret between two people who'd never admit to it.\" The cherry dies. Neither of you moves for a while.", ev:266 } } ] }
      ] },
    { id:"club.afterop", venue:"club", kind:"rival", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "You both pulled the same op this morning and somehow walked out of it. {them} is at Static like nothing happened, except the hand around the glass won't quite stop shaking. \"You saw the count too. Don't say it. I just want one place tonight where nobody says it.\"", "First time you and {them} fought the same direction instead of at each other — and it cost. {them} is here, drinking too fast. \"We were good out there. Together. I hate that it took that to find out. Don't make me look at you while I admit it.\"", "The op's over, the bodies are somebody else's paperwork, and {them} is on the stool like they grew there. \"You had my flank today. Actually had it. I keep waiting to be angry about needing that. It's not coming.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} you'd cover that flank again tomorrow and resent every second of it — and that's the most honest promise you've got.", check:true, land:{ reply:"{them} finally looks at {me}. \"That I believe. Affection I'd never trust off you. Resentment that holds? That I can build on.\"", next:1 }, miss:{ reply:"It comes out smug, like you won something, and {them}'s face shuts. \"Knew you'd make it a scoreboard. Forget I said anything.\" They drink alone.", pts:0 } },
          { approach:"warm", line:"Order {them} water alongside the next drink and tell them you'll sit till the hand stops shaking — no comment, no count.", land:{ reply:"{them} stares at the water like it's a trap. Drinks it anyway. \"You tell anybody you saw this and I'll bury you next to the count.\" But the shaking eases.", next:1 } },
          { approach:"probing", line:"Ask {them} what scared them more today — the op, or finding out the two of you work.", land:{ reply:"\"The second one,\" {them} says, instant. \"The op I've survived a hundred times. Needing you I have not.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what happens to the feud now that you've both seen the other one work — whether you can even afford it anymore.", land:{ reply:"\"We keep it,\" {them} says. \"Carefully. It's the only thing that's never gotten anyone killed. I trust the hate to stay put. The rest of it, who knows what it does.\" You drink on that, the two of you, soldiers who finally fit.", ev:267 } },
          { approach:"blunt", line:"Tell {them} not to mistake one good op for a truce — you'll be back to hating them by the next shift.", land:{ reply:"\"Counting on it,\" {them} says, and means it as relief. \"Go on. Hate me by morning. Just had the flank tonight.\" You leave it there, even, unspoken, intact.", ev:268 } } ] }
      ] },
    { id:"club.killorder", venue:"club", kind:"rival", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them} has been circling one thing all night and finally lands it under the bass. \"The order on the bridge. They've got it down as mine. It was yours. I've never said. I'm saying it now so you know I know. So you owe the silence, not me.\"", "{them} sets the glass down dead level. \"Somebody had to give the word that day and the record picked one of us at random. We both know which one it was actually. I carried the blame so the unit didn't fracture. Just want you to know I know what I bought.\"", "{them} doesn't drink. Just looks at {me} across the dark. \"You gave the order. I took the name for it. Every time you act righteous at me in here I want to say it out loud. Tonight I almost did. Talk me down or don't.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} you'll take the name back — out loud, on the record, whatever it costs — because carrying their hate is one thing, letting them carry your kill is another.", check:true, land:{ reply:"{them} goes very still. \"You'd do that. You'd actually do that.\" A long breath. \"Don't. The record's set, the dead are dead. But I'll never call you a coward again. You just spent it.\"", next:1 }, miss:{ reply:"It comes out like a deal, a trade, and {them}'s eyes flatten. \"Don't perform it for me. I didn't ask to be saved. I asked to be seen.\" They wave it off, the offer cheapened.", pts:0 } },
          { approach:"probing", line:"Ask {them} why they ate the blame in the first place — why protect a unit that put the two of you at each other's throats.", land:{ reply:"\"Wasn't protecting the unit,\" {them} says. \"Was protecting the version of you that could still give orders after. Somebody on that bridge had to come out able to function. I voted it should be you. I've regretted it and I'd do it again.\"", next:1 } },
          { approach:"warm", line:"Tell {them} you've never once forgotten it was yours — that the silence between you isn't relief, it's a weight you carry next to them.", land:{ reply:"{them} blinks slow. \"You think I didn't know that? It's the only reason I can stand to drink near you. A man who forgot would be unbearable. You remembering is the closest thing to company I've got.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell {them} the truth you've never put anywhere — that {trauma} — and that the bridge sits on top of it, and they've been carrying the lid for you.", land:{ reply:"{them} listens to all of it, the whole weight, and doesn't move to take it or to set it down. \"Now I'm holding two things,\" they say, quiet. \"The name and the why. Heavier. But I'd rather know what I'm carrying. We're not square. We're just honest. First time.\"", ev:269 } },
          { approach:"blunt", line:"Tell {them} that from tonight the slate's named, between the two of you, in private — they stop pretending it was theirs and you stop pretending you've earned the high ground.", land:{ reply:"\"In private,\" {them} agrees. \"The world keeps the lie. We keep the truth. That's the most either of us will ever give the other, and it's more than I give anyone.\" Two glasses. No toast. It's enough.", ev:270 } } ] }
      ] },
    { id:"club.scar_count_2", venue:"club", kind:"rival", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} catches {me} favoring the bad shoulder under the strobe and doesn't pretend not to. \"You're slower on that side. Were you always, or did the war give it to you?\"", "The light comes up red and {them} clocks the way {me} holds the glass — wrong hand. \"That's a field habit. Somebody shot the good one out of you.\"", "{them} taps two fingers on their own forearm where a long pale line runs. \"You been counting mine since you sat down. Fair. I count yours too. Yours are uglier.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} you weren't counting. You were just sitting.", land:{ reply:"\"Liar. We all count. It's the only math left that's honest.\"", next:1 } },
          { approach:"warm", line:"Admit the shoulder. Say it sets the weather now.", land:{ reply:"\"Mine's the knee. We're a matched pair of broke furniture.\" {them} doesn't smile, but the edge drops a notch.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} which scar they'd give back if they could only return one.", land:{ reply:"{them} goes quiet. \"None of them. Give one back and you have to remember what it cost without the proof.\" {them} drains the glass.", ev:271 } },
          { approach:"blunt", line:"Tell {them} you don't trade scar stories. Drink yours.", check:true, land:{ reply:"\"Good. Stories make them sound earned. They're just what's left.\" {them} lifts the glass an inch — not a toast, an acknowledgment.", ev:272 }, miss:{ reply:"It comes out colder than meant. {them} turns back to the bar. \"Suit yourself. Bleed in private.\"", pts:0 } } ] }
      ] },
    { id:"club.who_taught_who", venue:"club", kind:"rival", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} watches {me} clear a path through the crowd without looking — shoulder, hip, gone — and snorts. \"That's my footwork. You picked that off me in the field and never said thanks.\"", "\"You break contact left now,\" {them} says, not turning around. \"You used to break right and die for it. Somebody fixed that. Wasn't you.\"", "{them} sets a fresh drink down and slides the empty toward {me} like a problem. \"Half of what keeps you breathing, you stole watching me. Don't argue. I watched you learn it.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} you learned it because their way of dying looked avoidable.", land:{ reply:"\"Avoidable.\" {them} actually leans back. \"That's the nicest thing you'll ever say to me and you dressed it as an insult.\"", next:1 } },
          { approach:"warm", line:"Concede it. Say the footwork came from them and it kept you alive.", land:{ reply:"\"I know it did. I was there to see it work.\" {them} doesn't gloat — files it somewhere instead.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} who they stole their own footwork from.", land:{ reply:"{them} stops. \"Somebody slower than me who isn't here to charge tuition.\" The bass fills the gap where a name would go.", ev:273 } },
          { approach:"blunt", line:"Tell {them} you'll teach it forward, and you won't credit them either.", land:{ reply:"\"Good. That's how it stays alive. Credit gets people killed standing still.\" {them} taps the bar once, done.", ev:274 } } ] }
      ] },
    { id:"club.owed_round", venue:"club", kind:"rival", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} sets a drink in front of {me} that {me} didn't order. \"That's not a kindness. You pulled me off the wire at the bridge and I hate owing you. This makes it even. Drink it and we're square.\"", "There's already a full glass at {me}'s place. {them} nods at it without warmth. \"Bought. Now I don't have to think about you dragging me out of that ditch every time I close my eyes.\"", "\"One round,\" {them} says, pushing it over. \"For the bridge. After this I owe you nothing and I'd like it to stay that way.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} a drink doesn't cover a life. They still owe you.", land:{ reply:"\"I know it doesn't. That's why I picked it.\" {them} won't meet your eye. \"Take the cheap version. The honest price would ruin us both.\"", next:1 } },
          { approach:"warm", line:"Take the glass. Tell {them} it's covered, no ledger.", land:{ reply:"\"There's always a ledger. You just agreed to stop reading it out loud.\" {them} eases, barely.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} why it has to be even. What's wrong with owing.", land:{ reply:"\"Owing means you matter to me. I'd rather we be square and strangers.\" {them} says it flat, like it's the safest thing left to want.", ev:275 } },
          { approach:"blunt", line:"Drink it, then buy the next one. Keep them owing forever.", check:true, land:{ reply:"{them} stares, then almost laughs — a dry exhale. \"You absolute bastard. Fine. We'll die in the red to each other.\"", ev:276 }, miss:{ reply:"{them} pulls the glass back. \"Then I'll drink it myself. Don't make a game of it.\" The wall goes back up.", pts:0 } } ] }
      ] },
    { id:"club.empty_chair_3am", venue:"club", kind:"rival", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "It's late enough that Static has thinned to the broken ones. {them} is alone at the rail and doesn't tell {me} to leave, which is its own kind of invitation. \"You don't sleep either. Figures. Like to like.\"", "Three in the morning, the floor nearly empty, and {them} is still here. \"Everybody who can go home went home. That leaves us. Doesn't that tell you something about the both of us.\"", "The strobe's off now, just the dim. {them} doesn't look over. \"Last two standing. Every night it's the last two and it's always us. I've stopped pretending that's coincidence.\"" ], choices:[
          { approach:"warm", line:"Sit. Tell {them} the quiet at home is worse than their company.", land:{ reply:"\"There it is. The terrible truth.\" {them} slides the bottle a few inches your way. \"Misery I can stand. It's the silence I can't.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} you're here because you've nowhere better, not for them.", land:{ reply:"\"Same. Don't dress it up. Nowhere better and nobody worse than each other.\" {them} almost sounds comforted by that.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what's waiting at their place that they won't go to.", land:{ reply:"{them} is quiet a long time. \"A room I kept for somebody. Furniture that fits a person who's not coming. You?\" {me} doesn't answer either. The not-answering is the answer.", ev:277 } },
          { approach:"blunt", line:"Tell {them} you'll close the place every night before you go home to nothing. So will they.", land:{ reply:"\"Then I'll see you here. Same rail. Same nothing.\" It's not a promise. It's worse — it's a fact you both already knew.", ev:278 } } ] }
      ] },
    { id:"club.your_funeral_speech", venue:"club", kind:"rival", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} is morbid-drunk, the dangerous-honest kind. \"Way the odds run, one of us buries the other. I've been writing what I'd say over you. It's not kind. But it's not a lie either, and that's more than you'll get from anyone who liked you.\"", "\"I figured it out,\" {them} says, swirling the dregs. \"When you go down — and you will — nobody who loved you will tell the truth at the box. They'll be too sad. I won't be. I'll do you the honor of being accurate.\"", "{them} leans in over the bass. \"Bet you've drafted mine too. Go on. What do you say over me when the company finally collects?\"" ], choices:[
          { approach:"blunt", line:"Tell {them} you'd keep it to one line: they were a hard target and a worse friend.", land:{ reply:"\"A hard target and a worse friend.\" {them} turns it over. \"I'd take that carved in. You wouldn't flatter a corpse. That's why I'm asking you and not them.\"", next:1 } },
          { approach:"warm", line:"Tell {them} you'd say they kept people alive who never thanked them.", land:{ reply:"\"Don't soften it. That's the one fact I'd want left standing, but you'll be tempted to add a kind word. Don't.\" {them} means it.", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what the unkind, true line over you actually is.", check:true, land:{ reply:"\"That you were the only one in the field I never had to forgive, because you never once let me down. And I resent you for it.\" {them} looks furious to have said it.", ev:279 }, miss:{ reply:"{them} pulls back, the drink suddenly interesting. \"Forget it. Some things you don't get to hear standing up. Ask me when one of us is in the box.\"", pts:0 } },
          { approach:"blunt", line:"Tell {them} to skip the speech and just outlive you. That's the only tribute you want.", land:{ reply:"\"Outlive you.\" {them} considers it. \"Cruelest thing you could ask. I'll do it.\" The glasses touch once, hard, no words.", ev:280 } } ] }
      ] },
    { id:"club.what_we_sold", venue:"club", kind:"rival", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} is staring at the company logo backlit behind the bar like it owes them money. \"We didn't lose. That's the part nobody says. We won them everything they wanted. We were good at it. That's worse.\"", "\"Look at it,\" {them} says, tipping the glass at the brand on the wall. \"We made that. Not lost to it — built it. Every win we logged, they cashed. You and me, the best closers they ever had.\"", "{them} won't stop looking at the lit-up corporate mark. \"You and I disagree on everything except this: we were never the resistance. We were the labor. And the labor was excellent.\"" ], choices:[
          { approach:"blunt", line:"Tell {them} you knew what you were building the whole time. So did they.", land:{ reply:"\"Course we did. That's the only honesty between us — we never got to plead ignorant. We watched ourselves do it.\"", next:1 } },
          { approach:"warm", line:"Tell {them} good soldiers don't get to pick the war. Let it go.", land:{ reply:"\"Don't hand me that. We picked the re-up. Every time. The war was a job and we kept showing up for the shift.\" {them}'s jaw sets, but the rage thins.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"crime", line:"Tell {them} the thing you did off the books for them: {crime}.", land:{ reply:"{them} goes very still. \"And you logged it under their banner so it'd count as policy instead of murder. I knew. I let you. We're the same animal.\"", ev:281 } },
          { approach:"blunt", line:"Tell {them} you'll spend whatever years are left taking it back, brick by brick.", check:true, land:{ reply:"\"Take it back.\" {them} laughs without joy. \"You can't unbuild a city with the same hands that poured it. But I'll dig beside you. Spite, mostly. Mostly spite.\"", ev:282 }, miss:{ reply:"\"Take it back.\" {them} shakes their head, done. \"That's the drink talking. In the morning you'll clock in like always.\" {them} leaves the rest of yours unpoured.", pts:0 } } ] }
      ] },
    { id:"club.scarcount", venue:"club", kind:"rival", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{them} has a sleeve pushed up at the rail, working a thumb over a burn scar like it owes them money. \"You're staring. You think yours is worse.\"", "Under the strobe {them} catches {me} clocking the old shrapnel track up their forearm. \"Go on. Compare. You always do the math out loud.\"", "{them} rolls a glass against a knotted scar on their wrist, slow. \"Everyone in here's clean. Then there's us two. Sit before they notice.\"" ], choices:[
          { approach:"blunt", line:"Lay {me}'s forearm next to theirs. Let the scars argue.", land:{ reply:"\"Huh. Same week. Same shell, probably.\" {them} doesn't say sorry. Neither do you.", next:1 } },
          { approach:"warm", line:"Tell {them} a scar's just proof the thing missed.", land:{ reply:"\"Cute. Tell that to the ones it didn't miss.\" But they pull the sleeve back down. Truce.", next:1 } },
          { approach:"probing", line:"Ask which one of theirs they still feel in the cold.", check:true, land:{ reply:"{them} goes quiet a second too long. \"The one you can't see. Don't ask after that one.\"", next:2 }, miss:{ reply:"{them} pulls the sleeve down hard. \"Not a swap meet. Drink your drink.\"", pts:0 } } ] },
        { choices:[
          { approach:"blunt", line:"Say it plain: you both kept the parts that hurt and lost the parts that didn't.", land:{ reply:"\"That's the trade nobody quotes you up front.\" {them} taps the rail twice and lets it stand.", ev:283 } },
          { approach:"probing", gate:"trauma", line:"Match the burn with the truth of how {me} earned it: {trauma}.", land:{ reply:"{them} listens to the whole thing without one flinch. \"Yeah. I figured it was something like that.\"", ev:284 } } ] },
        { choices:[
          { approach:"warm", line:"Don't ask after it. Just put a glass in front of the hand that's shaking.", land:{ reply:"{them} wraps it around the glass to hide the tremor. \"You saw nothing.\" \"Saw nothing,\" you agree.", ev:285, fx:{ t:"capstone" } } },
          { approach:"probing", gate:"trauma", line:"Tell {them} you carry one nobody can see either: {trauma}.", land:{ reply:"{them} sets their glass against yours. Not a toast. A weight check. \"Two of us, then. Don't make it a thing.\"", ev:286, fl:"ARC_UNLOCKED" } } ] }
      ] },
    { id:"club.ledger", venue:"club", kind:"rival", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "There's a drink waiting at {me}'s usual spot, already poured. {them} lifts a chin from down the rail. \"You're welcome. Now you owe me. Hate that, don't you.\"", "The bartender slides {me} a glass and nods at {them}. \"He covered it.\" {them} doesn't even look over. \"Couldn't stand watching you count coins again.\"", "{them} drops a creased bill on the bar before {me} can. \"Mine. Don't argue over bass you can't shout past. You're in my ledger now.\"" ], choices:[
          { approach:"blunt", line:"Push the drink back. {me} doesn't take charity from {them}.", land:{ reply:"\"It's not charity, it's leverage. Drink it and we both know it.\" {them} almost smiles.", next:1 } },
          { approach:"warm", line:"Take it. Tell {them} the next round's on {me}, and it'll be worse.", land:{ reply:"\"Threats. Finally, something I trust from you.\" {them} taps the bar.", next:1 } },
          { approach:"probing", line:"Ask why {them} bothers keeping a tab on someone they can't stand.", check:true, land:{ reply:"{them} turns the glass a quarter turn. \"Because a tab's a reason to keep you breathing. I've run out of better ones.\"", next:2 }, miss:{ reply:"\"Don't read poetry into a free drink.\" {them} faces back to the floor.", pts:0 } } ] },
        { choices:[
          { approach:"blunt", line:"Settle it now. Slap the cost down and clear the ledger flat.", land:{ reply:"{them} pockets it slow. \"Even, then. Don't get sentimental about it.\" Even is its own kind of bond.", ev:287 } },
          { approach:"warm", line:"Leave the tab open. Tell {them} some debts are better unpaid.", land:{ reply:"\"Now you're learning.\" {them} lets it ride. The open ledger is the closest thing to a handshake either of you owns.", ev:288 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} they don't need a tab. Just say it: you'd cover them too.", land:{ reply:"{them} stares at the floor a long time. \"I know. That's the part I can't stand.\" Then, quieter: \"Same.\"", ev:289, fx:{ t:"capstone" } } },
          { approach:"probing", gate:"crime", line:"Tell {them} the truth about what {me} did to keep breathing once: {crime}.", land:{ reply:"{them} doesn't blink. \"And here I thought I bought a saint a drink.\" But they don't move off the stool. \"Tab's still open.\"", ev:290 } } ] }
      ] },
    { id:"club.lastupright", venue:"club", kind:"rival", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{them} lines two glasses on the rail and points at one, then {me}. \"Last one standing buys nothing and gets bragging rights. You in, or you scared of the floor?\"", "The club's emptying and {them} is still planted, eyes glassy and level. \"Everyone else tapped out. Just us. Loser admits the other one's harder to kill.\"", "{them} kicks the next stool out for {me} with a boot. \"Sit. We outlast everyone in here tonight. Petty. I know. I don't care.\"" ], choices:[
          { approach:"blunt", line:"Match them glass for glass and tell {them} you've outlasted worse.", land:{ reply:"\"Everybody's outlasted worse. Question's whether you outlast me.\" {them} pours.", next:1 } },
          { approach:"warm", line:"Sit. Tell {them} you've got nowhere better to fall down.", land:{ reply:"\"Neither do I. That's the only thing we've ever agreed on.\" {them} slides a glass over.", next:1 } },
          { approach:"probing", line:"Ask {them} who they're really trying to outlast tonight.", check:true, land:{ reply:"{them} stops mid-pour. \"Same as you. The quiet that shows up when the bass cuts out.\"", next:2 }, miss:{ reply:"\"Don't get clever. It's a drinking game.\" {them} downs theirs.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Both of you are swaying. Call it a draw and prop {them} up by the shoulder.", land:{ reply:"\"Draw,\" {them} slurs, leaning into the arm. \"Don't tell anyone you held me up.\" \"Wouldn't dream of it.\"", ev:291 } },
          { approach:"blunt", line:"Outlast them on purpose. Let {them} tap the bar first.", land:{ reply:"{them} sets the glass down upside-down. \"You win. I'll never say it sober.\" That's the trophy.", ev:292 } } ] },
        { choices:[
          { approach:"probing", line:"Tell {them} the quiet comes for you too, every night, and the drink only slows it.", land:{ reply:"{them} nods at the dead floor. \"So we sit in here and lie that the noise is for fun.\" \"Yeah.\" \"Yeah.\"", ev:293 } },
          { approach:"warm", gate:"dream", line:"Tell {them} the quiet's not all you sit in — there's the thing you still want: {dream}.", land:{ reply:"{them} actually looks at you. \"Then stop drinking to forget it and go get it, idiot.\" Coming from them, it lands like a vow.", ev:294, fl:"CLOSEST", fx:{ t:"capstone" } } } ] }
      ] },
    { id:"club.thereckoning", venue:"club", kind:"rival", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{them} steps into {me}'s path off the floor, no drink in hand, dead sober. \"The order that day. The bad one. I know whose mouth it came out of, and so do you.\"", "The music's loud but {them} pitches under it, level and cold. \"I've been waiting six bars to say this to your face. That call. The one that cost us. Yours.\"", "{them} blocks the rail, arms crossed. \"No stools tonight. We're settling the thing we both pretend the bass drowns out. The call. Say it was yours.\"" ], choices:[
          { approach:"blunt", line:"Own it. The call was {me}'s, and people died for it.", land:{ reply:"{them} exhales like they've held it for years. \"Finally. I didn't want it to be a coward who made it.\"", next:1 } },
          { approach:"probing", line:"Ask {them} what they'd have done with the same thirty seconds and the same bad map.", check:true, land:{ reply:"{them}'s jaw works. \"...The same. God help me, the same. That's why I can't let it go alone.\"", next:1 }, miss:{ reply:"\"Don't turn it around on me. This is your ghost.\" {them} steps back, colder.", pts:0 } },
          { approach:"warm", line:"Tell {them} you've replayed that call every night since. They're not alone in it.", land:{ reply:"\"Don't comfort me. I came here to fight about it.\" But the heat drops a notch.", next:1 } } ] },
        { choices:[
          { approach:"blunt", line:"Tell {them} you'll carry it. You don't need them to forgive it.", land:{ reply:"\"Good. I wasn't going to.\" {them} uncrosses their arms. \"But I'll carry my half. Just so you don't get to hog the weight.\"", next:2 } },
          { approach:"warm", gate:"trauma", line:"Tell {them} why {me} froze on the call — the old wound that grabbed {me}: {trauma}.", land:{ reply:"{them} goes still. \"...That. You should've told someone that before they handed you the radio.\" The anger's got nowhere to land now.", next:2 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} straight: now that it's said, what are the two of you to each other.", land:{ reply:"{them} looks at the floor a long beat. \"Not friends. Witnesses. We're the only two left who know what it cost — and we keep each other honest about it.\"", ev:295, fl:"CLOSEST" } },
          { approach:"warm", line:"Buy {them} a drink anyway. The reckoning's done; the ghost stays split.", land:{ reply:"{them} takes the glass without a word and clinks it once against {me}'s. To the ones the call cost. Then it's over, and somehow it's also begun.", ev:296 } } ] }
      ] },
    { id:"club.same_lighter", venue:"club", kind:"romance", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them} thumbs a lighter that won't catch, swears at it soft, and slides it across the table to {me} without looking up. \"You're better with broken things than I am.\"", "The unlit cigarette sits behind {them}'s ear, forgotten. {them} flicks the dead lighter twice, gives up, and meets {me}'s eyes. \"Got a flame, or are we both just sitting in the dark on purpose.\"", "{them} sets the lighter down between the two glasses, exactly in the middle, like a thing being offered. \"Standard issue. Same one they handed all of us. Bet yours died the same week mine did.\"" ], choices:[
          { approach:"warm", line:"Take the lighter, crack it open, breathe on the wheel, hand it back lit.", land:{ reply:"{them} cups the flame though there's no wind in here, watches it like it's rarer than it is. \"Knew you'd fix it. You always fix the small stuff.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} a dead lighter's a sign — quit while the city's still letting you.", check:true, land:{ reply:"{them} laughs, low. \"Quit's not a word they left in either of us.\" Lights it off the candle instead, eyes never leaving {me}.", next:1 }, miss:{ reply:"It lands wrong, like a lecture. {them} lights it off the candle and looks at the door for a while.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what week {them}'s lighter actually died — and what happened that week.", land:{ reply:"{them} names it without drama, the way you say a thing you've already paid for. Then: \"You're the first one to ask the week, not the body count.\"", ev:297 } },
          { approach:"warm", line:"Keep the lighter. Tell {them} you'll be the one who carries fire from now on.", land:{ reply:"{them} doesn't ask for it back. Slides their hand over {me}'s on the cheap plastic and leaves it there past the song.", ev:298 } },
          { approach:"blunt", line:"Hand it back unfixed. Say some things you just stop wasting flint on.", land:{ reply:"{them} pockets it dead. \"Fine. Then we sit in the dark.\" And does — close, not minding it.", pts:0 } } ] }
      ] },
    { id:"club.strobe_scar", venue:"club", kind:"romance", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "The strobe stutters and for half a second {them}'s sleeve is up and the old graft on the forearm shows — seam of dull chrome under skin that didn't take. {them} catches {me} seeing it and doesn't pull the cuff down. First time they haven't.", "{them} reaches past {me} for the ashtray and the strobe lights the underside of their wrist white — surgical line, a port that never closed clean. \"Go on,\" {them} says, flat. \"Everybody looks once. You looked twice.\"", "Under the broken strobe {them}'s hand opens and closes, opens and closes — the slow tell of a joint that's more hardware than hand. \"Cold in here makes it stick,\" {them} says, like that's the whole of it. It isn't." ], choices:[
          { approach:"warm", line:"Don't stare at it. Put your own hand flat on the table, scars up, level the field.", land:{ reply:"{them} looks at {me}'s open hand a long beat. \"Huh.\" Lays theirs beside it, not touching, matching. \"Pair of junkers.\"", next:1 } },
          { approach:"blunt", line:"Ask straight if the chrome still hurts or just remembers.", check:true, land:{ reply:"\"Remembers,\" {them} says, surprised into honesty. \"Worst kind. Doesn't hurt enough to fix. Just enough to know.\"", next:1 }, miss:{ reply:"{them}'s cuff comes down. \"Forget it.\" The shutter of someone who's been gawked at before.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} the graft suits them — survivors wear their welds.", land:{ reply:"{them} snorts, but the cuff stays up. \"You're the only one who's called it suits.\" Turns the wrist over so the seam faces {me}, deliberate.", ev:299 } },
          { approach:"probing", gate:"trauma", line:"Show {them} where your own hardware went in — and say {trauma}.", land:{ reply:"{them} listens to the whole of it without once saying sorry, which is the only mercy that works. \"We came back wrong the same way,\" they say. \"That's not nothing.\"", ev:300 } },
          { approach:"blunt", line:"Say nothing. Just don't let the strobe make you look away this time.", land:{ reply:"Every flash, {me} holds the look. {them} stops covering. By the end they've quit flinching at the light entirely.", ev:301 } } ] }
      ] },
    { id:"club.their_song", venue:"club", kind:"romance", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "A track drops that {them} clearly knows — their whole body goes still, drink halfway. \"Haven't heard this since before,\" {them} says. Doesn't say before what. With {them} it's always the same before.", "{them} freezes mid-sentence when the DJ rolls into the next one. \"This was playing,\" they start, then stop, jaw working. \"Doesn't matter where. It was just playing. Funny what the city keeps.\"", "The bass shifts and {them} sets the glass down too carefully. \"Don't let me make a thing of this,\" {them} warns, already making a thing of it, eyes gone somewhere two years back." ], choices:[
          { approach:"warm", line:"Don't ask where it takes them. Just stay quiet until the song lets them go.", land:{ reply:"{them} rides it out. When it ends they exhale like surfacing. \"Thanks for not asking. Everybody asks.\"", next:1 } },
          { approach:"probing", line:"Ask gently who {them} was with, the last time this played.", check:true, land:{ reply:"{them} answers — a name, a barracks, a roof that isn't there now. \"Most people I'd lie. You I'll just tell.\"", next:1 }, miss:{ reply:"Too soon. {them} shakes their head. \"Not that. Not yet.\" The song finishes alone.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} you'll claim this song back for them — new memory, starting now.", land:{ reply:"{them} studies {me} like checking the offer for a catch, finds none. \"Alright,\" they say, quiet. \"Then it's ours now. The old one can keep the rest.\"", ev:302 } },
          { approach:"blunt", line:"Tell {them} the dead don't get to pick the playlist anymore.", land:{ reply:"{them} barks a laugh that's half a sob, all relief. \"God. No. They don't, do they.\" Holds {me}'s wrist till the next track buries it.", ev:303 } },
          { approach:"blunt", line:"Suggest you both just leave before the next one wrecks them too.", land:{ reply:"\"No,\" {them} says, settling deeper into the stool. \"Sit. I want to learn to hear it with you in the room.\"", pts:0 } } ] }
      ] },
    { id:"club.no_one_dancing", venue:"club", kind:"romance", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "The floor's empty, too late for dancers, the music gone slow and structureless. {them} stands, holds out a hand, deadpan. \"Nobody's watching and I'm too tired to be embarrassed. One. Before I lose the nerve.\"", "{them} nods at the bare floor. \"Whole city paid for that sound system and nobody's using it.\" Stands. Offers a hand, not quite steady. \"Don't make it a speech. Just don't leave me standing here.\"", "It's the dead hour, the bass low enough to feel instead of hear. {them} pushes back from the table. \"I don't dance,\" {them} says, already standing, already holding out a hand. \"So that's how serious this is.\"" ], choices:[
          { approach:"warm", line:"Take the hand. Step in close. Let it be clumsy and don't apologize.", land:{ reply:"{them} folds in like it costs nothing and everything. \"You're as bad at this as me,\" they murmur. \"Good. I'd hate to be the worse one.\"", next:1 } },
          { approach:"blunt", line:"Ask if {them}'s sure — once you're standing there's no playing it off.", check:true, land:{ reply:"\"I crossed that bridge standing up,\" {them} says. \"You coming or am I dancing with a chair.\"", next:1 }, miss:{ reply:"The hesitation reads as no. {them} lowers the hand, sits, finds the bottom of the glass very interesting.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Stop pretending it's a dance. Just hold on and sway until the track dies.", land:{ reply:"{them} stops counting steps, lets their weight settle against {me}. \"This is just holding each other up,\" they say into {me}'s shoulder. \"Yeah. That.\"", ev:304 } },
          { approach:"probing", line:"Ask when the last time {them} let anyone this close on their feet was.", land:{ reply:"{them} has to think. \"Before. A field hospital, a slow one. Holding someone up who didn't make it.\" Tightens their grip. \"You made it. Stay made.\"", ev:305 } },
          { approach:"blunt", line:"Break it off after one — say more than that and you'll mean it.", land:{ reply:"{them} steps back exactly far enough. \"One it is. For now.\" The 'for now' does all the work.", pts:0 } } ] }
      ] },
    { id:"club.unsent_call", venue:"club", kind:"romance", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "{them}'s deck is face-up on the table, {me}'s contact open, the call button lit but unpressed. {them} sees {me} see it and doesn't flip it over. \"Three in the morning, couple weeks running,\" they admit. \"I get this far. Then I figure you're asleep and lucky for it.\"", "The screen glows between the glasses — {me}'s number, dialed, not sent. {them} thumbs it dark, too late. \"You weren't supposed to clock that,\" {them} says. \"I never hit send. Just liked knowing I could.\"", "{them} slides the deck across, call screen still open on {me}'s line. \"Found myself standing on a roof at four, about to. Stopped because what do you even say.\" A grim little shrug. \"So. Hi. This is what I'd have said.\"" ], choices:[
          { approach:"warm", line:"Tell {them} to send it next time — you'd rather lose the sleep than the call.", land:{ reply:"{them} looks at {me} like the math just changed. \"You'd actually pick up.\" Not a question, but they needed to hear it land.", next:1 } },
          { approach:"blunt", line:"Ask what {them} was so close to saying at three in the morning.", check:true, land:{ reply:"{them} holds {me}'s eye. \"That the nights are long and I'd rather be bad at sleeping next to someone than alone.\" Doesn't blink.", next:1 }, miss:{ reply:"{them} pockets the deck. \"Nothing worth waking you for.\" Closes the door on it neatly.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Take {them}'s deck, hit send on your own line, let it ring in your pocket.", land:{ reply:"{me}'s phone buzzes against {me}'s leg. {them} watches it. \"There,\" they say, unsteady. \"Now it's a real number. Now it's not just a thing I almost do.\"", ev:306 } },
          { approach:"probing", line:"Ask what's on the roof at four that {them} keeps climbing up to.", land:{ reply:"{them} is quiet a while. \"Quiet. The kind that asks questions I don't like the answers to.\" Then, lower: \"Calling you was the only one that didn't.\"", ev:307 } },
          { approach:"blunt", line:"Tell {them} to keep liking the idea — some calls are better unmade.", land:{ reply:"{them}'s face shutters polite. \"Sure. Better safe.\" Pockets the deck. The screen goes dark and so does something else.", pts:0 } } ] }
      ] },
    { id:"club.last_call_stay", venue:"club", kind:"romance", req:{ minTier:0, maxTier:1 },
      beats:[
        { open:[ "Lights come up ugly and fluorescent, the way they do to throw you out. {them} squints, doesn't move for their coat. \"They want us gone,\" {them} says. \"I'm not in a hurry to be where you're not. There. Said the dumb part.\"", "Last call rung, the grate already half down. {them} stays seated while the stools go up around them. \"Everyone's leaving,\" {them} observes. \"I keep finding reasons to be the last one out. Tonight the reason's sitting right across from me.\"", "The house lights kill the spell, the bass cut to a hum. {them} should leave. {them} doesn't. \"Going to walk you nowhere in particular,\" they say, \"as slow as the city lets us. If that's a thing you'd let me do.\"" ], choices:[
          { approach:"warm", line:"Say you'll take the long way too — neither of you in any hurry to be alone.", land:{ reply:"{them} stands, finally, and doesn't reach for the door. Reaches for {me}'s side of the table first. \"Long way it is.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} to stop circling it and just say what the staying is.", check:true, land:{ reply:"{them} meets it head on. \"It's me not wanting the night to be the last good thing. It's you. Plainly. There.\"", next:1 }, miss:{ reply:"{them}'s nerve folds under the bright light. \"Forget it. Bar's closing.\" Reaches for the coat after all.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Walk out shoulder to shoulder, no destination, let the wet street stretch it.", land:{ reply:"{them} matches {me}'s pace exactly, neither leading. \"We could just keep walking,\" they say at a corner. \"Til it's not night anymore.\" They mean it.", ev:308 } },
          { approach:"blunt", line:"Say it back, flat and final — you don't want to be where {them} isn't either.", land:{ reply:"{them} goes still, then nods once, like a thing decided. \"Okay,\" they breathe. \"Okay. Then that's settled. Quietly. Just us knowing.\"", ev:309 } },
          { approach:"probing", gate:"dream", line:"Ask if there's a someday {them} pictures past all this — admit {dream}.", land:{ reply:"{them} doesn't laugh at it, which is everything. \"You'd want me in that picture?\" they ask. Then, before {me} answers: \"Don't. I already know. Get there. Take me with.\"", ev:310 } } ] }
      ] },
    { id:"club.what_came_back", venue:"club", kind:"romance", req:{ minTier:1, maxTier:2 },
      beats:[
        { open:[ "The strobe catches {them}'s forearm where the sleeve's pushed up — a seam of grafted plate, paler than the skin it's holding shut. {them} doesn't pull it back. Just watches {me} clock it.", "{them} reaches for the glass and the light snags on the wrist — old surgical chrome, the kind they bolt on in a field tent and never finish prettying. \"Go on,\" they say. \"Everybody looks once.\"", "Across the table {them} flexes a hand that doesn't quite close — two fingers a beat slow, the war's signature. \"You've been counting my scars all night. Cheaper to just ask.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you weren't counting the scars. You were counting how much they let show.", land:{ reply:"{them} goes still. \"Most people read the chrome as a warning.\" A breath. \"You read it as an invitation.\" The sleeve stays up.", next:1 } },
          { approach:"blunt", line:"Ask flat what came back wrong, and what they had to trade to come back at all.", check:true, land:{ reply:"\"The hand. Some of the sleep. A name I don't say.\" {them} lays the slow fingers flat on the table. \"That's the inventory. You're the first to get the whole sheet.\"", next:1 }, miss:{ reply:"It lands like a med-board questionnaire. {them} tugs the sleeve down. \"Forget it. Drink your drink.\" The seam disappears.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Roll your own sleeve. Show {them} the matching one — the place the war signed you too.", land:{ reply:"{them} traces the air over it, not touching. \"Same surgeon's handwriting,\" they say, and almost smile. Two wrecks, reading each other's repair logs.", ev:311 } },
          { approach:"warm", line:"Put your hand over the slow one and just leave it there.", land:{ reply:"{them} doesn't pull away. The fingers that won't close work once against {me}'s palm, like testing whether it's real. \"Huh,\" they say, very quiet. \"Still warm under there.\"", ev:312 } },
          { approach:"blunt", line:"Tell {them} the chrome doesn't scare you. What scares you is wanting to be there when it aches.", check:true, land:{ reply:"{them} looks up sharp, caught. \"That's a hell of a thing to admit over this music.\" But they don't change the subject. \"It aches every cold front. You volunteering for the forecast?\"", ev:313 }, miss:{ reply:"{them} hears the size of it and ducks it with a shrug. \"Romantic. Buy me a real drink first.\" The moment closes like a healed seam.", pts:0 } } ] }
      ] },
    { id:"club.dead_mans_song", venue:"club", kind:"romance", req:{ minTier:1, maxTier:2 },
      beats:[
        { open:[ "The DJ drops some pre-war track nobody under thirty should know, and across the table {them} stops mid-sentence. Both of {me} and {them} know this song. Both of {me} and {them} know who used to play it.", "A song comes on that doesn't belong in a place like Static — too old, too soft under the bass. {them}'s jaw sets. \"Of all the rooms in this city,\" they say, \"the playlist had to find me here.\"", "{them} freezes with the glass halfway up. The track's the one that used to come tinny out of a squad speaker, in a tent, before half of them stopped existing. \"You hearing this too,\" they say. Not a question." ], choices:[
          { approach:"warm", line:"Tell {them} you'll wait it out with them. Some songs you don't sit through alone.", land:{ reply:"{them} nods once, tight. They don't talk for the length of it. But under the table their boot finds {me}'s and stays, the whole three minutes.", next:1 } },
          { approach:"probing", line:"Ask who it plays for. Whose face shows up when this one comes on.", land:{ reply:"{them} turns the glass a half-circle. \"More than one. You learn not to itemize.\" A pause. \"But yeah. There's a face.\" They don't say it yet. They might.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell {them} the face this song finds for you — the one tied to {trauma} — and watch if they flinch.", land:{ reply:"{them} doesn't flinch. They listen all the way to the end of it, then say the only right thing: \"I'd have liked them.\" The song dies. {them} stays leaned in.", ev:314 } },
          { approach:"warm", line:"Hum the next line of it with {them}, both wrong, both off-key, both still knowing every word.", land:{ reply:"It's terrible. Two ruined voices murdering a dead man's favorite. {them} actually laughs — short, surprised — wipes their eye with the heel of a hand. \"He'd have hated that. Good.\"", ev:315 } },
          { approach:"blunt", line:"Tell {them} you don't want a person who only knows you on the good tracks.", check:true, land:{ reply:"{them} studies {me} like a map they didn't expect to recognize. \"No,\" they agree slowly. \"The good-track people leave when the bad one comes on.\" Their hand crosses the table, palm up. \"You haven't.\"", ev:316 }, miss:{ reply:"It comes out heavier than the room can hold. {them} reaches for the lighter mood instead. \"Easy. It's a song, not a wedding.\" The track ends. So does the opening.", pts:0 } } ] }
      ] },
    { id:"club.quiet_tab", venue:"club", kind:"romance", req:{ minTier:1, maxTier:2 },
      beats:[
        { open:[ "{me} flags the bartender for the tab and gets told it's covered. Has been all night. {them} is suddenly very interested in the bottom of their glass, ears going red under the strobe.", "There's a fresh drink at {me}'s elbow that {me} didn't order. The bartender tips their head toward {them}, who is studiously watching the dance floor like it owes them money.", "\"Don't,\" {them} says, not looking over, as {me} reaches for a card. \"It's handled. Has been since you walked in.\" A beat. \"Don't make it a thing.\"" ], choices:[
          { approach:"warm", line:"Tell {them} you noticed. Tell {them} nobody's covered anything for you in a long time.", land:{ reply:"{them} finally looks over. \"Yeah, well.\" The bravado cracks an inch. \"I've got eddies and nobody to spend them keeping breathing. Figured I'd pick someone worth the rounds.\"", next:1 } },
          { approach:"blunt", line:"Ask {them} straight if this is a transaction or a flag being planted.", check:true, land:{ reply:"{them} holds {me}'s eye, done hiding in the glass. \"If it were a transaction I'd let you pay.\" The honesty costs them. They pay it anyway.", next:1 }, miss:{ reply:"{them} hears an accusation in it and pulls the shutter down. \"Forget the drink. Square up, then.\" The warmth pricing itself out of the room.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Tell {them} the only thing {me} can pay it back with is the truth, and ask what they actually want the rounds to buy.", land:{ reply:"{them} turns the empty glass once. \"Not a debt. Just—\" A hard breath. \"A reason to still be at this table when the lights come up. That's the whole tab.\"", ev:317 } },
          { approach:"warm", line:"Push the next round back across to them. Tell {them} you'll trade — your tab for their company, even-up.", land:{ reply:"{them} takes the glass, and {me}'s hand stays a half-second under it in the pass. \"Crooked math,\" they murmur. \"I come out ahead either way.\" They don't let go fast.", ev:318 } },
          { approach:"blunt", line:"Tell {them} to stop buying drinks and start buying time — meet you somewhere the bass can't drown it out.", check:true, land:{ reply:"{them} sets the glass down like a decision. \"There's a noodle window two blocks down still open at this hour.\" A shrug that costs effort. \"If you're done being bought.\"", ev:319 }, miss:{ reply:"{them} balks at the size of the ask. \"It's a drink, not a relocation.\" They wave the bartender for another, and the question's drowned in the next round.", pts:0 } } ] }
      ] },
    { id:"club.first_real_dance", venue:"club", kind:"romance", req:{ minTier:1, maxTier:2 },
      beats:[
        { open:[ "The floor's thinned to a few die-hards and the music's gone slow and ugly-pretty. {them} stands, holds a hand down to {me}. \"I'm bad at this and so are you. Nobody sober's watching.\"", "A slow one finally lands and {them} doesn't sit through it. They rise, knees popping, every old injury announcing itself. \"One dance,\" they say. \"Before my body files a complaint.\"", "{them} is already on their feet, swaying half a beat off the rhythm, hand out. \"Two left feet and a bad knee between us,\" they say. \"Even odds we survive it.\"" ], choices:[
          { approach:"warm", line:"Take the hand. Tell {them} you've cleared rooms under worse fire than this.", land:{ reply:"{them} pulls {me} up and in, all elbows and wariness, then the wariness goes. The slow fingers find {me}'s back. \"There,\" they breathe. \"Easier than the war.\" Just.", next:1 } },
          { approach:"blunt", line:"Tell {them} the last time you let someone this close, you were dragging them off a field.", check:true, land:{ reply:"{them} doesn't let the hand drop. \"Yeah. Me too.\" A beat that's all bass and breath. \"So let's find out what close is for, when nobody's bleeding.\"", next:1 }, miss:{ reply:"It comes out like a refusal and {them} takes it as one. The hand lowers. \"Fair,\" they say, and sit, and the slow song plays for nobody.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them}, this close, what they keep behind the armor when the song's slow enough to ask.", land:{ reply:"{them}'s mouth is near {me}'s ear over the bass. \"Same thing as you. That this gets taken too.\" A tighter hold. \"So we don't tell it that we found it. Just dance.\"", ev:320 } },
          { approach:"warm", line:"Stop pretending to dance. Just stand in it, foreheads close, and let the song carry the weight.", land:{ reply:"The dancing quits being dancing. Two wrecks holding each other upright in a dying club, swaying because stopping feels worse. {them} exhales like a year going out.", ev:321 } },
          { approach:"blunt", line:"Tell {them} you don't want the song to end, and you're done being too proud to say it.", check:true, land:{ reply:"{them} pulls back just enough to read {me}'s face. Whatever they find there, they trust it. \"Then we keep moving,\" they say, \"till they throw us out.\" They keep moving.", ev:322 }, miss:{ reply:"The words snag on old pride and come out as a joke instead. {them} laughs, the moment safely defused, and the song winds down without it.", pts:0 } } ] }
      ] },
    { id:"club.not_a_dance", venue:"club", kind:"romance", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "The floor's half-empty, the song slow enough that standing still would be its own confession. {them} steps into {me}'s space without asking, hands loose at their sides. \"Not calling it anything,\" they say. \"Just don't want to be the only one not moving.\"", "{them} catches {me}'s wrist as the tempo drops, not pulling, just resting there. \"I don't dance,\" they say, already swaying. \"This isn't that. This is two people too tired to stand on their own.\"" ], choices:[
          { approach:"warm", line:"Put a hand at the small of their back. Let the song decide where it goes.", land:{ reply:"{them} exhales like they've been holding it since the last deployment. They don't lead. They don't follow. They just stop bracing.", next:1 } },
          { approach:"blunt", line:"Tell {them} you've got two left feet and a worse track record.", check:true, land:{ reply:"\"Good,\" {them} says. \"Means you won't get fancy and ruin it.\" They move closer.", next:1 }, miss:{ reply:"It comes out flatter than meant, like a door closing. {them} reads it as a no and steps back, gives {me} the floor.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} when the last time was anybody held them and didn't want something after.", land:{ reply:"{them} goes quiet against {me}'s shoulder. \"Can't remember. That's the answer, isn't it.\" They don't lift their head until the song's long over.", ev:323, fl:"CLOSEST" } },
          { approach:"warm", line:"Say nothing. Match their breathing until the song runs out.", land:{ reply:"Two survivors, swaying to nothing in particular, letting the bass do the thinking. When the lights come up neither one of them lets go first.", ev:324 } } ] }
      ] },
    { id:"club.the_field_dressing", venue:"club", kind:"romance", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} slides into the back booth holding their forearm too still — a split knuckle, a line of red they're trying not to advertise. \"Door work,\" they say. \"Got handsy. He lost worse.\" They don't pull the sleeve down fast enough.", "There's blood drying along {them}'s wrist they keep tucking under the table. \"It's nothing,\" they say before {me} can ask. The way they say nothing is the way everyone here says it." ], choices:[
          { approach:"warm", line:"Take their hand, turn it to the light, dab it with a bar napkin and the cold of {me}'s glass.", land:{ reply:"{them} lets {me}. That's the whole thing — they let {me}. \"You've done this before,\" they say. \"On worse.\" {me} doesn't answer. They already know.", next:1 } },
          { approach:"blunt", line:"Tell {them} to quit hiding it. {me}'s patched up uglier in worse light.", land:{ reply:"{them} surrenders the arm, half a smirk. \"Bedside manner of a mortar crew.\" But they hold it out, and they hold it still.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell {them} why {me}'s hands stay so steady on a wound: {trauma}.", land:{ reply:"{them} watches {me} work and listens to all of it without once telling {me} to stop. \"And you still reach for the hurt thing,\" they say. \"After all that. Still reach for it.\"", ev:325, fl:"ARC_UNLOCKED" } },
          { approach:"warm", line:"Finish the wrap. Hold the hand a beat longer than the job needs.", land:{ reply:"The job's done and {me} doesn't let go and {them} doesn't take it back. The booth's loud enough nobody notices two soldiers holding hands over a bar napkin.", ev:326, fl:"CLOSEST" } },
          { approach:"blunt", line:"Ask who did it. Say the name. {me} works door shifts too.", land:{ reply:"{them} covers {me}'s knuckles with their good hand. \"No. That's the old you talking, and I like the one sitting here. Let it go.\" {me} lets it go.", ev:327 } } ] }
      ] },
    { id:"club.wrong_song", venue:"club", kind:"romance", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "The DJ drops something old — pre-war old, a tune that used to mean home before home got rezoned. {them} goes very still beside {me}, jaw working. \"Turn it off,\" they almost say, then don't. \"Some songs should've stayed buried with the people who liked them.\"", "A song comes on that {them} clearly wasn't ready for. Their hand finds the edge of the table and grips. \"Knew a guy who hummed this,\" they say to nobody. \"Past tense. Always past tense with that one.\"" ], choices:[
          { approach:"warm", line:"Don't ask. Just move {me}'s chair around the table to their side.", land:{ reply:"{them} doesn't look over, but their grip on the table eases when {me}'s shoulder finds theirs. They let the song play out. They don't go anywhere.", next:1 } },
          { approach:"probing", line:"Ask who hummed it. Let {them} say the name if they want to.", check:true, land:{ reply:"\"Doesn't matter now,\" {them} says, but they say it to {me}, not to the room. That's the difference. \"You'd have liked him. He'd have liked you. That's the worst of it.\"", next:1 }, miss:{ reply:"{them} flinches like {me} reached for an open wound. \"Don't.\" They get up for another drink and take the long way around the bar.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Tell {them} the song doesn't belong to the dead. Make it mean tonight instead.", land:{ reply:"{them} finally looks at {me}, something raw and grateful and embarrassed by both. \"You're rewriting my ghosts,\" they say. \"Reckless habit.\" But they don't tell {me} to stop.", ev:328, fl:"CLOSEST" } },
          { approach:"blunt", line:"Say it plain: {me}'s not going past tense. Not on {them}.", land:{ reply:"{them} laughs, wet and short. \"Everybody says that. Then they go.\" A beat. \"But say it again anyway. I want to hear it land wrong twice.\"", ev:329 } } ] }
      ] },
    { id:"club.the_silence_between", venue:"club", kind:"romance", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "Something's off. {them} is at the bar but not with {me} — a careful arm's-length they've kept all night since the words went sideways on the comm three days back. They nurse a drink they hate and don't look over. The space between the stools may as well be a minefield.", "{them} came in, clocked {me}, and chose the far end of the bar. The fight from the op — the one nobody won — is still sitting there between them like an unexploded round. The quiet's louder than the bass." ], choices:[
          { approach:"warm", line:"Close the gap. Set a drink down at the empty stool beside {them} and wait.", land:{ reply:"{them} eyes the glass like it might be a trap, then doesn't move away from it. \"That your version of sorry?\" they ask. It isn't, quite. It's the start of one.", next:1 } },
          { approach:"blunt", line:"Say it straight: {me} was wrong on the comm, and {me} let it sit three days too long.", check:true, land:{ reply:"{them} sets the bad drink down. \"Three days,\" they say. \"I counted every one.\" Then, quieter: \"Come sit before I count a fourth.\"", next:1 }, miss:{ reply:"The apology lands like an order, all spine and no give. {them}'s jaw tightens. \"That's not sorry, that's paperwork.\" They turn back to the bar.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask what the fight was really about — because it wasn't the comm and they both know it.", land:{ reply:"{them} turns the glass slow. \"It was you taking the point position like the rest of us are already dead. Like you're the only one who gets to be lost.\" A breath. \"I'm not ready to bury you yet. So slow down.\"", ev:330, fl:"CLOSEST" } },
          { approach:"warm", line:"Tell {them} that whatever else breaks, {me} doesn't want this to be the thing that does.", land:{ reply:"{them} finally leans, two degrees, the old way. \"Then stop testing it,\" they say, but the edge is gone. \"This one's load-bearing. Treat it like it is.\"", ev:331 } } ] }
      ] },
    { id:"club.split_the_last", venue:"club", kind:"romance", req:{ minTier:2, maxTier:3 },
      beats:[
        { open:[ "{them} taps the last cigarette out of a crushed pack, looks at it, looks at {me}, and tears it clean in half across their thumbnail. \"Field ration rules,\" they say, sliding {me} the bigger piece like it's still rationed out there. \"Nobody smokes the last one alone.\"", "Down to one drink between two empty glasses and last call already rung. {them} pushes the glass to the middle of the table. \"Halves,\" they say. \"We did everything else fifty-fifty out there. Why stop at the easy parts.\"" ], choices:[
          { approach:"warm", line:"Take {me}'s half. Raise it to the ones who don't get a last anything.", land:{ reply:"{them} taps their half to {me}'s. \"To the ones who got the short straw,\" they say. They drink. \"And to whatever this is, that they didn't.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} to keep the bigger half. {me}'s gotten greedy enough for one life.", land:{ reply:"{them} pushes it back anyway. \"Greed's fine. Greedy for the right thing's just called staying alive.\" They make {me} take it.", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"dream", line:"Tell {them} the thing {me} splits everything toward someday: {dream}.", land:{ reply:"{them} doesn't laugh. They take {me}'s hand under the table, the way you'd take a hand before a jump. \"Then we save for it,\" they say. \"Both halves. Same pot.\"", ev:332, fl:"CLOSEST" } },
          { approach:"warm", line:"Say {me} stopped keeping things halved a while ago. With {them} it all just goes in one pile.", land:{ reply:"{them} stills. \"That's a dangerous way to live for people like us. One pile. One hit takes it all.\" They cover {me}'s hand. \"I'm in anyway. Have been.\"", ev:333 } } ] }
      ] },
    { id:"club.the_exit_plan", venue:"club", kind:"romance", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "Static's almost dark, the chairs going up on tables, and {them} hasn't moved to leave. They've got a napkin and a pen and they're drawing something — a coastline, a road off the grid, a place with no contract number. \"Everybody's got an exit plan,\" they say, not looking up. \"Show me yours, and I'll tell you if mine's got room in it for two.\"", "Last one in the place but the staff. {them} slides a marked-up napkin across — coordinates, crossed out, redrawn. \"I've been planning the day I walk for years,\" they say. \"Never drew anyone else into it. Then I started leaving space. Tell me I didn't waste the ink.\"" ], choices:[
          { approach:"warm", line:"Pick up the pen. Add a second figure to the road off the grid.", land:{ reply:"{them} watches {me} draw the second stick figure beside theirs and goes quiet in a way that isn't grief for once. \"There,\" they breathe. \"Now it's not a fantasy. It's a plan.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} {me} stopped believing in exits a long time ago. People like us die in the wire.", check:true, land:{ reply:"{them} doesn't flinch. \"I know the odds. I've buried the odds. I'm asking you to be the dumb hope I keep anyway.\" They slide the pen closer.", next:1 }, miss:{ reply:"It comes out like a wall and {them} sets the pen down on their side of it. \"Right,\" they say, folding the napkin away. \"Forget I drew the space.\" The room finishes emptying.", pts:0 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} the real question: not where they're going, but whether they mean to actually go — or just die planning it like the rest of us.", land:{ reply:"{them} folds the napkin into {me}'s breast pocket, flat over the heart, like dog tags. \"I mean to go,\" they say. \"That's what you did to me. You made the door real. Don't you dare not walk through it with me.\"", ev:334, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"warm", line:"Tell {them} {me} doesn't need a coastline. The plan was already wherever {them} ends up.", land:{ reply:"{them} pockets the napkin, unfinished, and takes {me}'s hand off the table for good. \"Then we don't need the map,\" they say. \"Just the company. Cheaper anyway.\"", ev:335 } } ] }
      ] },
    { id:"club.shakes_2", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} has both hands flat on the table at Static, pressing down, like that's how you stop a tremor. It isn't. {me} watched the glass rattle on the way to their mouth. \"It won't quit. Since the drop. My hands won't quit.\"", "The bass is doing the talking and {them} is glad of it — easier to hide the shake when nobody can hear the ice knocking the glass. {me} reaches over and stills the kid's wrist on the table. \"Yeah. I know that one.\"" ], choices:[
          { approach:"warm", line:"Tell {them} the shake means the body's still scoring the threat. It's working. It just doesn't know it's over yet.", land:{ reply:"\"So how do I make it know.\" {me} doesn't have a clean answer, and {them} watches {me} not lie about it.", next:1 } },
          { approach:"blunt", line:"Hold up {me}'s own hand. Let the kid watch it shake too.", land:{ reply:"{them} stares at the tremor {me} stopped pretending to hide years ago. \"...You too.\" \"Twenty years. Buy the heavy glass. It rattles less.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what the hands were doing the second it happened — bet they were steady as stone.", land:{ reply:"{them} goes quiet. \"...Steady. Dead steady. It's only after.\" \"That's the deal. Steady when it counts, then they bill you for it after. Pay it here, not on the floor.\"", ev:336 } },
          { approach:"warm", line:"Tell {them} the only thing that ever helped: warm hands. Get them warm and busy. Don't watch them.", land:{ reply:"{me} wraps the kid's hands around a warm glass and tells them to stop staring at the tremor like it's a verdict. By close it's nearly gone.", ev:337 } },
          { approach:"blunt", line:"Tell the kid if the shake ever stops entirely, start worrying — that's when you've stopped feeling it.", check:true, land:{ reply:"{them} flinches, then nods slow. \"So the shake's the part of me that's still scared.\" \"Still human. Keep it.\"", ev:338 }, miss:{ reply:"It lands wrong — colder than {me} meant. {them} pulls the hands off the table and into their lap and the talk's over.", pts:0 } } ] }
      ] },
    { id:"club.first_kill", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} got their first confirmed today and nobody's said a word about it — that's the part eating them. {me} finds the kid at the back of Static, staring at a drink they haven't started. \"Everybody just... kept walking. Like it was nothing.\"", "First one's the loudest one, and {them} is still hearing it over the bass. {me} sits without being asked. \"You keep checking your hands. They're clean. That's not where it stays.\"" ], choices:[
          { approach:"warm", line:"Tell {them} the silence wasn't because it's nothing. It's because everyone remembers theirs.", land:{ reply:"{them} looks up at the room different — at all the people who already crossed this. \"You remember yours?\" \"Every one. They don't blur. People lie about that.\"", next:1 } },
          { approach:"blunt", line:"Tell the kid straight: it's supposed to weigh something. The ones it doesn't weigh on — stay away from those.", land:{ reply:"\"So feeling sick about it means I'm okay.\" \"Means you're not the thing we're fighting. Yeah.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} the real question under it — whether the face is going to follow them home tonight.", land:{ reply:"{them} won't meet {me}'s eyes. \"...Will it?\" \"For a while. Then it joins the others and they take turns. Don't drink to make them go. They don't.\"", ev:339 } },
          { approach:"warm", line:"Tell {them} to do one decent thing tonight — call someone, eat real food — so the day isn't only the worst thing in it.", land:{ reply:"\"That works?\" \"It's not a cure. It's a counterweight. Put something human on the other side of the scale before you sleep.\"", ev:340 } },
          { approach:"blunt", gate:"trauma", line:"Tell {them} about {me}'s first — that {trauma}, and {me} still didn't know it was the easy part.", land:{ reply:"{them} goes very still hearing it. The thing {me} carries from before laid bare on a sticky table. \"And it gets... heavier.\" \"You learn to carry it. That's all. That's the whole secret.\"", ev:341 } } ] }
      ] },
    { id:"club.cant_sleep", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} is at Static at the dead hour because the alternative is the ceiling of an empty room. {me} knows the schedule of the sleepless — clocked the kid's third night in a row on the same stool. \"You don't sleep either,\" {them} says. Not a question.", "Four in the morning and {them} is nursing a flat drink they don't want, just to not be alone with the quiet. {me} takes the next stool. \"It's worse when it's silent. I know. Bass helps.\"" ], choices:[
          { approach:"warm", line:"Tell the kid the brain replays it at night because daylight's too loud to file it. The night isn't punishment, it's the desk work.", land:{ reply:"\"Filing.\" {them} almost laughs. \"That what we're calling it.\" \"Beats calling it what it feels like.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} not to fight it. You don't out-stubborn three in the morning. You wait it out with company.", land:{ reply:"\"That's the trick? Just... not be alone for it?\" \"That's most of it. The rest's a lie I'd be selling you.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} which one it is that comes back. There's always one specific one.", land:{ reply:"{them} tells {me}, low, the one frame that won't stop. {me} doesn't fix it — just hears it all the way through so the kid isn't the only one holding it.", ev:342 } },
          { approach:"warm", line:"Pass down the only routine that ever worked: get tired enough that the body wins the argument. Walk till dawn if you have to.", land:{ reply:"\"Outrun my own head.\" \"Can't outrun it. Can wear it out. Tire the body so the mind doesn't get the last word.\"", ev:343 } },
          { approach:"blunt", line:"Tell {them} the hard truth — it doesn't go away. You just make peace with the hour. It becomes yours.", check:true, land:{ reply:"{them} takes it without flinching this time. \"So this is just... mine now. Four AM.\" \"Could be worse company than yourself, eventually.\"", ev:344 }, miss:{ reply:"It comes out bleaker than the kid can hold tonight. {them} drains the flat drink and leaves before the answer can get worse.", pts:0 } } ] }
      ] },
    { id:"club.wants_out", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} has been circling it all night and finally lands it over the bass: \"I think I'm done. I think I want out.\" {me} doesn't argue. Most of the ones who say it never do — and the ones who don't say it are the ones {me} worries for.", "\"How'd you know it was time? Or — how'd you know it wasn't?\" {them} is asking {me} whether to quit, dressed up as small talk. {me} sets the drink down. \"You're asking because part of you already left.\"" ], choices:[
          { approach:"warm", line:"Tell {them} wanting out isn't weakness — it might be the sanest read of the room they've made all year.", land:{ reply:"{them} exhales like {me} unlocked a cuff. \"I thought you'd talk me down.\" \"I'm not the company. I don't need you spent.\"", next:1 } },
          { approach:"blunt", line:"Ask the kid flat — do they want out, or do they just want a night where it doesn't hurt. Those aren't the same exit.", land:{ reply:"{them} chews on it. \"...I don't know which one yet.\" \"Then don't sign anything tonight. The two get easy to confuse at this hour.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what's actually waiting out there — because the ones who stay too long usually have nothing on the other side of the door.", land:{ reply:"{them} goes quiet a long time. \"...I don't have an out there. That's the problem.\" \"Then build one before you need it. Don't let the lack of a door keep you in the fire.\"", ev:345 } },
          { approach:"warm", line:"Tell {them} the honest thing — most of us stay because we don't know who we are without it. Find that out before you choose.", land:{ reply:"\"And if there's nobody under it?\" \"Then you've got more reason to leave, not less. Go find out while you still can.\"", ev:346 } },
          { approach:"blunt", gate:"dream", line:"Tell {them} {me}'s own exit plan out loud for once — {dream} — and that {me} stayed too long chasing it the wrong way.", land:{ reply:"{them} hears the thing {me} never says, the door {me} keeps meaning to walk through. \"You still going?\" \"...Someday. Don't do my someday. Pick a date.\"", ev:347 } } ] }
      ] },
    { id:"club.lucky_thing", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} is turning something small over and over in their fingers under the table at Static — a charm, a coin, {me} can't tell. \"Lost it before the last drop. Spent the whole op sure I was gonna die without it.\" The kid looks ashamed of the superstition.", "{me} catches {them} doing the little ritual — touching the same pocket twice before the drink, like checking a sidearm that isn't there. \"You've got a thing you do,\" {me} says. {them} freezes, caught. \"Everybody does. Don't be embarrassed.\"" ], choices:[
          { approach:"warm", line:"Tell {them} not to drop the ritual — it's not magic, it's a switch. It tells the body the line between home and the floor.", land:{ reply:"\"So it's not crazy.\" \"It's a routine that happens to look crazy. Keep it. Just know what it's actually for.\"", next:1 } },
          { approach:"blunt", line:"Warn the kid off it the other way — a charm you can lose becomes a reason to panic when you do. Pick a ritual nothing can take.", land:{ reply:"{them} looks at the trinket in their hand like it betrayed them. \"...So what do I use instead.\" \"Something you carry inside. They can't loot that off you.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what the ritual is really standing in for — superstition's always pointing at something true.", land:{ reply:"{them} thinks hard. \"...That somebody's keeping count of me. That if I do it right, I get to come back.\" \"Yeah. Hold that one. That's the real charm.\"", ev:348 } },
          { approach:"warm", line:"Give {them} {me}'s own one — the small fixed thing {me} does every time, no object required, just the words.", land:{ reply:"{me} teaches the kid the quiet thing {me} says before every drop, the one nobody's ever heard. {them} repeats it once, careful, like it might break.", ev:349 } },
          { approach:"blunt", line:"Tell {them} the truth under all of it: the ritual doesn't keep you alive. It keeps you walking back to the drop. That's the whole job.", check:true, land:{ reply:"{them} sits with that. \"So it's not about surviving. It's about being able to go again.\" \"Now you get it. Anybody can want to live. The job's wanting to go back.\"", ev:350 }, miss:{ reply:"It strips the comfort out of the thing before the kid's ready to lose it. {them} pockets the charm and changes the subject to nothing.", pts:0 } } ] }
      ] },
    { id:"club.the_letter", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} had to make the call this time — be the voice that tells someone their person isn't coming back. The kid's been staring at the same drink since {me} sat down. \"They said thank you. That's the part. They thanked me.\"", "First time you have to do the notification, it hollows you different than the floor does. {me} can see {them} is still hearing the other end of that line. \"You did the call,\" {me} says. Not a guess.", "{them} keeps starting sentences and dropping them. Finally: \"What do you even say to them. The ones at home. There's no version that isn't a lie.\" {me} knows this drink. {me} has had this drink." ], choices:[
          { approach:"warm", line:"Tell {them} they don't owe the truth of how it actually went. They owe the version the living can carry.", land:{ reply:"\"So I lie to them.\" \"You edit. There's a difference, and you'll need it to be a difference to sleep. Trust me on the difference.\"", next:1 } },
          { approach:"blunt", line:"Tell the kid the only rule that matters: never tell the family it was quick if it wasn't, and never tell them it was their fault.", land:{ reply:"{them} nods slowly. \"Even if it was a mistake.\" \"Especially then. The dead don't need your honesty. The living can't use it.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} the harder thing — whether they told the family the truth, or the kindness. Because the answer's going to follow them.", land:{ reply:"{them} admits it, quiet. {me} doesn't grade it. \"Either way you carry it. Just make sure it's the version you can stand at four in the morning.\"", ev:351 } },
          { approach:"warm", line:"Tell {them} the part nobody warns you about: the family's thank-you is the heaviest thing you'll carry out of this. Let it weigh.", land:{ reply:"{them}'s eyes go glassy. \"It shouldn't feel worse than blame.\" \"But it does. Because they trusted you with the wrong story and you gave it to them anyway. That's the job too.\"", ev:352 } },
          { approach:"blunt", gate:"trauma", line:"Tell {them} about the call {me} got it wrong on — {trauma} — and how {me} learned the rule the expensive way.", land:{ reply:"{them} hears what {me} never tells: the notification {me} botched, the thing from before that still rings. \"...You never told me that.\" \"Telling you now so you don't earn it the way I did.\"", ev:353 } } ] }
      ] },
    { id:"club.count_left", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} is looking at the empty stools around the bar at Static and {me} knows exactly what arithmetic the kid is doing — counting who used to fill them. \"There were more of us. When I started. This place was loud.\"", "{them} raises the glass to nobody in particular, then catches themselves. \"Habit. We used to toast the ones who didn't — \" The kid stops. {me} finishes it. \"The ones who didn't make the bar. Yeah. We did.\"", "Slow night, half-empty room, and {them} can't stop scanning it for faces that stopped coming. {me} has been on this stool long enough to watch the room thin out. \"You're counting,\" {me} says. \"Stop counting. It only goes one way.\"" ], choices:[
          { approach:"warm", line:"Tell {them} the room thinning out isn't proof they're next. It's proof they're still here. Drink to that instead.", land:{ reply:"\"Feels like guilt, not luck.\" \"It's both. You'll never untangle them. Drink anyway.\"", next:1 } },
          { approach:"blunt", line:"Tell the kid not to do the math on who's left. That equation has no comfort in it, only a date.", land:{ reply:"{them} sets the glass down. \"You've done it though.\" \"Every old vet has. That's why I'm telling you to quit while it's still a choice.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} who the empty stool is. There's always a specific one they're really counting.", land:{ reply:"{them} names them — somebody {me} half-remembers, somebody the kid won't let go quiet. {me} lets the name sit on the bar between them a while. Some get said. That's the toast.", ev:354 } },
          { approach:"warm", line:"Pass {them} the thing that keeps the count from crushing you: you don't carry all of them. You carry one. Pick one and let the room hold the rest.", land:{ reply:"\"That's allowed?\" \"It's survival. Try to hold the whole room and the room buries you. One name. The dead understand division.\"", ev:355 } },
          { approach:"blunt", line:"Tell {them} the thing {me} stopped saying years ago: the empty stools aren't a warning to you. You ARE the warning. You're what they didn't get to become.", check:true, land:{ reply:"{them} sits with it, the weight of being the one who got the years. \"So I owe them old age.\" \"You owe them getting old loud and ungrateful and alive. Pay it.\"", ev:356 }, miss:{ reply:"It comes out as a sentence and lands like one. {them} goes pale and pushes back from the bar. Too much, too true, too late at night.", pts:0 } } ] }
      ] },
    { id:"club.outranked", venue:"club", kind:"mentor", req:{ minTier:0, maxTier:2 },
      beats:[
        { open:[ "{them} ran the op today and {me} was under their call for the first time — the kid {me} taught, giving {me} orders. {them} is at Static braced for {me} to be sore about it. \"You were good,\" {me} says first, before they can flinch. \"I'm not here to take it back.\"", "Strange night: {them} outranks {me} now, and the kid keeps almost apologizing for it across the table. {me} stops them. \"Don't. The whole point was you passing me. Sit down and let me buy.\"", "{them} keeps deferring to {me} out of old habit even though the bars on their collar say not to. {me} can see it cost them all day to give the orders. \"You hesitated twice today,\" {me} says. \"Both times because of me. That stops now.\"" ], choices:[
          { approach:"warm", line:"Tell {them} the day the student passes the teacher is the only win the teacher actually gets. Let {me} have it.", land:{ reply:"{them}'s shoulders drop. \"I thought you'd resent it.\" \"I built you to outgrow me. Resenting it'd mean I failed at the only thing I'm proud of.\"", next:1 } },
          { approach:"blunt", line:"Tell the kid the hard part of command they haven't hit yet — the day they'll have to spend {me} on a call, same as anyone.", land:{ reply:"{them} goes still. \"I couldn't.\" \"You will. And you'll do it right, because I taught you how it feels to be the one spent. Don't flinch when it's me.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", line:"Ask {them} what they were afraid of out there today — the real one, not the op. The one with {me}'s name on it.", land:{ reply:"{them} admits it low: afraid of getting {me} killed on their own call. \"Then you'll be a good one,\" {me} says. \"The ones who aren't afraid of that are the ones you don't follow.\"", ev:357 } },
          { approach:"warm", line:"Tell {them} the last lesson {me} has — how to give the order that sends a friend somewhere bad, and live with it after.", land:{ reply:"{me} teaches the kid the last thing on the list: you make the call clean, you carry the cost private, and you never let the one you sent see it weigh on you. \"That's the lonely part,\" {them} says. \"That's command.\"", ev:358 } },
          { approach:"warm", line:"Just slide the drink across and tell {them} {me}'s proud. Plain. No lesson tonight.", land:{ reply:"{them} doesn't have a comeback for plain. They take the drink, and the word, and for once {me} doesn't follow it with a rule. The bass covers what neither of them says.", ev:359 } } ] }
      ] },
    { id:"club.steady_hands", venue:"club", kind:"mentor", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{them} keeps the hand under the table at Static, but {me} clocked it on the walk in — the tremor that won't quit between fights now. The kid catches {me} looking. \"It's nothing. Cold.\"", "{them} reaches for the glass and stops, sets the hand flat on the table to kill the shake before {me} sees. {me} already saw. The bass covers most things in here. Not that.", "{them} has both hands wrapped around a drink they aren't drinking, holding it the way you hold something to stop it rattling. {me} takes the stool. \"How long's the shake been showing up.\"" ], choices:[
          { approach:"warm", line:"Tell {them} it's not cold, and it's not nothing — say {me}'s hands did the same, year three.", land:{ reply:"The kid lets the hand go loose. \"Yours? You never—\" \"You never looked,\" {me} says. The shake's allowed at the table.", next:1 } },
          { approach:"blunt", line:"Tell {them} the shake isn't the problem — hiding it on the field is. That's how you get someone killed.", check:true, land:{ reply:"It lands hard, then it lands right. \"So what do I do with it.\" \"Bring it here,\" {me} says. \"Not out there.\"", next:1 }, miss:{ reply:"The kid's jaw sets. \"I've got it handled.\" The hand goes back under the table, and so does the conversation.", pts:0 } },
          { approach:"probing", line:"Ask what the kid thinks the shake is for — what the body's trying to say.", land:{ reply:"\"That I'm done?\" they ask, scared of it. \"That you've been keeping count,\" {me} says, \"even when you stopped.\"", next:1 } } ] },
        { choices:[
          { approach:"warm", line:"Show {them} the trick: park the hand, breathe out longer than in, let the count run down before you load.", land:{ reply:"The kid tries it. The shake doesn't stop, but it shrinks. \"That's it?\" \"That's mercy,\" {me} says. \"It doesn't fix. It buys you the next reload.\"", ev:360, fl:"CLOSEST", fx:{ t:"relief" } } },
          { approach:"probing", gate:"trauma", line:"Tell {them} where {me}'s own shake comes from — name it: {trauma}.", land:{ reply:"{me} says it plain, the thing that put the tremor in for good. The kid stops trying to hide their own. \"And you still go out.\" \"Hands shaking,\" {me} says. \"Every time.\"", ev:361, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"blunt", line:"Tell {them} the day the shake stops is the day to worry — that's the body giving up on counting.", land:{ reply:"The kid turns that over. \"So I want it.\" \"You want it,\" {me} says. \"It means you're still keeping the tab.\"", ev:362 } } ] }
      ] },
    { id:"club.no_heroes", venue:"club", kind:"mentor", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{them} pulled the impossible one off and walked the others out clean, and now the kid's lit up at Static, reckless with it. \"They're saying I can't be touched out there.\" {me} knows exactly where that sentence ends.", "{them} is buying rounds for the squad, riding the high of being the one who never breaks. {me} takes the next stool. \"Heard them calling you the lucky one tonight.\"", "{them} carries themselves different now — squad's started looking at the kid the way they used to look at {me}, like cover. {me} can see the kid liking it too much. \"That look they give you. You believing it yet?\"" ], choices:[
          { approach:"warm", line:"Tell {them} {me}'s proud of the work — and that's exactly why this next part has to land.", land:{ reply:"The kid grins, then catches {me}'s face. \"What next part.\" The bass thumps under the silence. \"The part where you're not the hero.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} flat: the hero is the one who gets the rest killed making the same bet twice.", check:true, land:{ reply:"It wipes the grin clean. \"You don't think I—\" \"I think the next one believes you,\" {me} says. \"That's who dies.\"", next:1 }, miss:{ reply:"The kid laughs it off, claps {me}'s shoulder. \"You worry too much, old timer.\" The round arrives. The lesson doesn't.", pts:0 } },
          { approach:"probing", line:"Ask {them} who taught them they had to be untouchable — where the kid learned the cape.", land:{ reply:"The kid goes quiet. \"...You did. Watching you.\" {me} sits with that one. \"Then let me un-teach the worst half.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"trauma", line:"Tell {them} what the cape cost {me} — the day {me} believed it: {trauma}.", land:{ reply:"{me} lays out the day the luck ran out and someone paid for {me}'s certainty. The kid's untouchable look is gone. \"I didn't know that was you.\" \"Now you do,\" {me} says.", ev:363, fl:"ARC_UNLOCKED", fx:{ t:"capstone" } } },
          { approach:"warm", line:"Tell {them} the real job: not be untouchable — be the one who counts heads at the door and brings the number back whole.", land:{ reply:"The kid nods slow. \"Heads at the door.\" \"Every door,\" {me} says. \"That's the only hero that gets old.\"", ev:364, fl:"CLOSEST" } },
          { approach:"blunt", line:"Tell {them} to stop letting the squad call them lucky — luck spent out loud is luck the company starts betting on.", land:{ reply:"The kid sets the round down. \"They just like having someone to believe in.\" \"I know,\" {me} says. \"Don't make it your job to be that.\"", ev:365 } } ] }
      ] },
    { id:"club.grieve_fast", venue:"club", kind:"mentor", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{them} hasn't said a word since the floor, just stares past the lights at Static with a drink going warm. {me} knows the freeze — the kid lost one mid-op and didn't get to stop. \"You've been carrying it since this afternoon. Sit.\"", "{them} keeps starting sentences and dropping them, replaying a stretch of the op that already happened. {me} takes the stool. \"You're running it back. It ends the same every time.\"", "{them} is somewhere else entirely, walking a hallway in their head where someone didn't make it out. {me} waits, then: \"You can't go back in there. I've tried that door for years.\"" ], choices:[
          { approach:"warm", line:"Tell {them} to put it down for the length of one drink — just the one — and pick it back up after if they need to.", land:{ reply:"The kid breathes for the first time in hours. \"And if I can't put it down.\" \"Then I'll hold the other end,\" {me} says, \"till you can.\"", next:1 } },
          { approach:"probing", line:"Ask {them} what part they keep landing on — which second the loop snags.", land:{ reply:"The kid finds it. \"The second before. When I could've called it different.\" {me} nods. \"That's the one that never moves. I'll show you where to set it.\"", next:1 } },
          { approach:"blunt", line:"Tell {them} the loop is a lie — replaying it isn't honoring anyone, it's just bleeding out slow.", check:true, land:{ reply:"The kid flinches, then exhales like something cut loose. \"...So what do I do with it.\" \"You grieve fast,\" {me} says, \"and you carry slow.\"", next:1 }, miss:{ reply:"It comes out colder than {me} meant. The kid pulls inward. \"Easy for you. You've got the calluses.\" The loop keeps running, alone now.", pts:0 } } ] },
        { choices:[
          { approach:"warm", line:"Teach {them} the trick that kept {me} standing: say the name once, out loud, here — then let the night have it.", land:{ reply:"The kid says the name into the bass, barely a whisper. It's enough. \"That's all?\" \"That's the whole rite,\" {me} says. \"We don't get a longer one.\"", ev:366, fl:"CLOSEST", fx:{ t:"relief" } } },
          { approach:"probing", line:"Ask {them} to give {me} the second-before — say it out loud so the loop has somewhere to land that isn't their own skull.", land:{ reply:"The kid says it. The decision, the angle, the call. Out in the open it's just a bad afternoon, not a verdict. \"It sounds smaller out here.\" \"It always does,\" {me} says.", ev:367 } },
          { approach:"blunt", line:"Tell {them} the hard arithmetic: you grieve on your time, never the company's — because the company schedules the next one regardless.", land:{ reply:"The kid swallows it. \"That's bleak.\" \"That's the contract,\" {me} says. \"Grieve fast so the grief is yours and not theirs.\"", ev:368 } } ] }
      ] },
    { id:"club.last_field", venue:"club", kind:"mentor", req:{ minTier:2, maxTier:4 },
      beats:[
        { open:[ "{me} is the one off tonight — slower on the last op, a half-step the kid had to cover without saying so. Now {them} sets two drinks down at Static and takes the stool {me} usually takes. The mentor and the student have quietly traded chairs. \"You're going to let me say it,\" {them} says, \"so don't make a face.\"", "{me} reads the room wrong walking in — sat with the door at {me}'s back, the one mistake {me} drilled out of the kid years ago. {them} notices, says nothing, just turns the chairs so {me} faces it. The kindness of it stings worse than a word would.", "{them} caught the half-second {me} hesitated on the field today, the one {me} used to catch in them. The kid doesn't gloat. The kid just buys the round and waits, the way {me} taught them to wait. \"Sit down. I learned this part from you.\"" ], choices:[
          { approach:"blunt", line:"Beat the kid to it — say it plain: {me} was the half-step today, and {me} felt them cover it.", land:{ reply:"The kid doesn't argue. \"You were. I covered it. That's the job, you told me.\" The chairs stay traded. \"Didn't think I'd be on this side of them.\"", next:1 } },
          { approach:"warm", line:"Tell {them} {me} saw the turn of the chairs — and thank them for not making it a speech.", land:{ reply:"The kid almost smiles. \"You'd have hated a speech.\" \"I trained that into you,\" {me} says. \"Comes back around.\"", next:1 } },
          { approach:"probing", line:"Ask {them} straight: how long has the kid been watching {me} slip before tonight.", land:{ reply:"The kid hesitates — the tell that it's been a while. \"...A few ops. I've been picking up the half-steps. Didn't want you to clock it.\" \"I clocked it,\" {me} says. \"I let you carry it.\"", next:1 } } ] },
        { choices:[
          { approach:"probing", gate:"dream", line:"Tell {them} the thing {me} never said the whole time {me} was teaching them — what {me} was staying alive FOR: {dream}.", land:{ reply:"{me} says it, the reason under all the rules, finally out loud to the one who earned it. The kid sets their drink down. \"You never told me that.\" \"Couldn't,\" {me} says. \"You'd have known I was scared of dying. Now I'm telling you so you'll make me go get it.\"", ev:369, fl:"CLOSEST", fx:{ t:"capstone" } } },
          { approach:"warm", line:"Tell {them} it's their list now — every rule {me} taught, the kid runs it cleaner than {me} does anymore.", land:{ reply:"The kid takes that the way {me} once couldn't have. \"It's still your list.\" \"It was a loan,\" {me} says. \"You paid it back today, covering the half-step.\"", ev:370, fl:"CLOSEST" } },
          { approach:"blunt", line:"Tell {them} the next part flat: {me} needs the kid to be the one who says when {me}'s done — because {me} won't see it.", land:{ reply:"The kid goes still. \"You're asking me to bench you someday.\" \"I'm asking you to be braver than I was about it,\" {me} says. \"I never had anyone willing to.\"", ev:371 } } ] }
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
    null,   // 75  (bar.closing_time — bartender confidant, no mirror line)
    "{vet} ate the broth I ordered and didn't turn it into a fight. The bowl went empty. That was plenty.",   // 76  (diner.cold_broth)
    "{vet} admitted they still think about {home}. So do I. The booth held two of us again.",   // 77  (diner.same_side)
    null,   // 78  (club.tight — vet↔vet, mirrors via the other vet's file)
    null,   // 79  (club.measure)
    null,   // 80  (club.exits)
    null,   // 81  (club.tab, warm)
    null,   // 82  (club.tab, blunt)
    null,   // 83
    null,   // 84
    null,   // 85
    null,   // 86
    null,   // 87
    null,   // 88
    null,   // 89
    null,   // 90
    null,   // 91
    null,   // 92
    null,   // 93
    null,   // 94
    null,   // 95
    null,   // 96
    null,   // 97
    null,   // 98
    null,   // 99
    null,   // 100
    null,   // 101
    null,   // 102
    null,   // 103
    null,   // 104
    null,   // 105
    null,   // 106
    null,   // 107
    null,   // 108
    null,   // 109
    null,   // 110
    null,   // 111
    null,   // 112
    null,   // 113
    null,   // 114
    null,   // 115
    null,   // 116
    null,   // 117
    null,   // 118
    null,   // 119
    null,   // 120
    null,   // 121
    null,   // 122
    null,   // 123
    null,   // 124
    null,   // 125
    null,   // 126
    null,   // 127
    null,   // 128
    null,   // 129
    null,   // 130
    null,   // 131
    null,   // 132
    null,   // 133
    null,   // 134
    null,   // 135
    null,   // 136
    null,   // 137
    "{vet} finally said where the money came from. I'd known {home}'s lights ran on something dirty. I kept paying the bill.",   // 138
    "{vet} said they'd have gone hungry before {home} did, and I believed it. Folded the check up and kept it. Don't know why.",   // 139
    "{vet} asked how many of these we had left, like a soldier doing supply math. I told them to quit counting and start sitting. Maybe they will.",   // 140
    "{vet} saw I'd gone grey while they were off at war and promised to be there for the rest. I told them I'd believe it when I saw the next bowl filled.",   // 141
    "{vet} and I finally said it: nobody alive remembers how that kitchen cooked. We've been faking the recipe from memory since {home} burned. We ate it anyway.",   // 142
    "{vet} told me the noodles didn't have to taste right, they just had to be eaten across from me. War didn't take everything, then. I shared my bowl.",   // 143
    "{vet} admitted the cruel thing they said leaving {home} was meant. I'd carried it like a rock for years. Hearing them own it, I finally put it down.",   // 144
    "{vet} said the version of them that hurt me leaving {home} died out there. I let them blame the dead one. Whoever came back, I'll start fresh with them.",   // 145
    "{vet} wanted to know if {home} would see the war on them or just the leaving. I told them coming back erases both. They took the napkin. I think they'll come.",   // 146
    "{vet} asked to walk into the {home} gathering at my shoulder instead of alone. Same side of the room, after all these years. I said yes before they finished asking.",   // 147
    "{vet} finally told me what I'd really lied to protect — {crime}. I'd shielded them blind. Knowing it now, I'd do it again. They're still mine. That doesn't have a clause.",   // 148
    "{vet} thought they were alone all those years. They never were. I stood where they couldn't see me and lied to the wrong people to keep them whole. Told them. About time.",   // 149
    "{vet} thought my leaving this city was me quitting them. It was me going to {home} to leave a light on. I told them so on my way to the train. Hope they walk toward it.",   // 150
    "{vet} carried my duffel from the diner to the midnight platform without a word of fight. After a lifetime of bad goodbyes, we managed one decent one. I rode home lighter.",   // 151
    "{vet} told me what they want past the killing — {dream} — and said raise the child on that one. So that's the {vet} the kid back in {home} will grow up believing in. Go be it.",   // 152
    "{vet} asked me to bring the kid to the diner — to be a real {vet} instead of the legend I'd built. Braver than any story I told. I'll bring them. {vet} had better show.",   // 153
    "Paid for {vet}'s bowl and got let to — first time the cash in {home} sat quiet between us.",   // 154
    "{vet} confessed how the {home} money was earned and I held it — rather that than the empty chair.",   // 155
    "Told {vet} I wasn't forgiving the {home} money, only sitting with it — and that was honest enough to hold.",   // 156
    "{vet} steadied my shaking hand over the bowl and swore to come around more — while I still know the face.",   // 157
    "Felt {vet}'s hand over my shaking one and finally found the kid from {home} under all the new armor.",   // 158
    "{vet} said to fear the war and not them — and for once I could tell {home}'s kid apart from the soldier.",   // 159
    "{vet} took the seat I kept set for the dead, and the {home} booth finally held two breathing people again.",   // 160
    "Learned {vet} kept the dead a seat out there same as me — so I finally let Marisol's clear the third bowl.",   // 161
    "Handed {vet} the broth recipe before Marisol's closes — so {home} outlives the both of us in some mess hall somewhere.",   // 162
    "Stood over {vet} at the range like the old {home} kitchen, correcting the broth till they got it right — twenty years folded shut.",   // 163
    "Saw {vet} on the {home} ticker, feared the worst — then they handed me one human thing from that week, and I kept it instead.",   // 164
    "Tore up the {home} ticker print and told {vet} I knew them before any camera did — and that claim's older than the headline.",   // 165
    "{vet} confessed they can't always tell the headline from themselves — so I'll keep meeting them at Marisol's till the screen's outvoted.",   // 166
    "{vet} told me they grieved our dead alone in a tent — so I gave them the plot number, and next leave we stand at {home}'s dirt together.",   // 167
    "Held the wake with {vet} at Marisol's that they missed in {home} — said the name out loud, and neither of us wiped our face.",   // 168
    "{vet} offered to carry the anger I'd hauled since the burial — so I gave them half, the way you do with your own.",   // 169
    "Asked {vet} to come home to {home} for good; got the first transport instead — and a tired person will hold them to it.",   // 170
    "{vet} told me to keep asking them home to {home} every bowl — that my asking is the hook that pulls them out of the fire. So I'll keep asking.",   // 171
    "{vet} made me ask them home to {home} out loud, in front of the whole diner — so they'd have something specific to refuse to die before.",   // 172
    "{vet} forfeited the old {home} fight outright at Marisol's — conceded the lot, just to have the years the grudge had eaten.",   // 173
    "Clinked spoons with {vet} on a permanent draw to the old {home} fight — a treaty, never to be reopened, and I meant it.",   // 174
    "{vet} said the unfinished {home} fight replayed in every mess hall — and I realized we'd both spent years arguing the same empty chair.",   // 175
    "{vet} fed me across the table at Marisol's like I was the child for once, and didn't flinch at the shaking the way the people in {home} do.",   // 176
    "{vet} never promised to fix me or my hands — just steadied the bowl and came back when they came back. I stopped hoping for more years ago. This was more.",   // 177
    "{vet} put their shaking hand next to mine on the table and said nothing. Two wrecks at Marisol's. I'd rather rattle a spoon with them than eat steady alone.",   // 178
    "{vet} made me tell the whole funeral again at Marisol's, every face in the row, so they could finally stand in the gap they'd left. I'd buried it with the rest. Saying it twice let one of us put it down.",   // 179
    "{vet} pinned the ribbon on right there at Marisol's, for the one they'd missed. They won't make the next funeral either. But they made this one, at a noodle counter, a year too late, and I let that be enough.",   // 180
    "{vet} finally told me the truth — they don't dodge our funerals because they're cold, but because one open grave shows them every body they ever stacked. A year I thought they didn't care. They cared too much to stand in the row.",   // 181
    "I told {vet} at Marisol's about the back step, the coat, the conversations I had with the version of them that stayed in {home}. They came back enough to hear it. The real one's a harder talk, but they heard it.",   // 182
    "{vet} slipped their tag into the old coat's pocket at Marisol's — the soldier they actually became, not the ghost I'd been keeping warm. Now I carry both of them through {home}. I'll take both.",   // 183
    "{vet} asked for the coat. I'd had it longer than they ever did. But they wanted one thing from {home} that wasn't a war, so I gave it back warm. We swapped which of us it kept.",   // 184
    "I told {vet} at Marisol's that the house is gone and I'm over the laundry now. I didn't want their money. I wanted one person who knew. They sat and knew it. That was the rescue.",   // 185
    "{vet} put money down and called it back rent, not charity, so a proud wreck like me could take it. The one who left did the feeding this time. I let them. The room's warmer for it and so am I.",   // 186
    "{vet} owned that they're as broke as me — the war takes it all — and offered the only thing they had, which is showing up. I'm short on company in {home}. A face across the bowl is worth more than the coins anyway.",   // 187
    "{vet} asked about the little one — not the cartoon, the real scared kid in {home} who won't sleep without the hall light. For the first time the kid had a real person on the other end of the story, not a poster.",   // 188
    "{vet} gave me their worn-out patch at Marisol's, the real one, to take back to the kid in {home} — not a medal, not the star the kid drew. Something that had actually been where they'd been. The kid sleeps with it now.",   // 189
    "{vet} told me the only thing they wanted the kid in {home} to learn from them was don't become this. Not the hero, not the monster — the warning. I can raise a child on that. It's the truest thing they've ever given me.",   // 190
    "{vet} told me the real reason they ran from {home} — not the door, not us, but {crime} at their back, and they wore our hatred like armor so it would never reach me. Years I thought they abandoned us. They were standing in front of us the whole time.",   // 191
    "{vet} gave me a piece of the night it broke — they left {home} so we wouldn't have to watch them come apart at the table. Not all of it. But a piece, finally, from their own mouth. I'll wait for the rest. I'm good at waiting on them.",   // 192
    "{vet} didn't give me the whole why, but they sat at Marisol's and said the night it broke was theirs to own — not bad luck, not us, them. After years of the weather, hearing them claim it let me set both bowls back down and start again.",   // 193
    "Watched {vet} cover the check at last and leave a hand there — the closest thing to home {home} had sent back.",   // 194
    "Took {vet}'s dirty money knowing exactly what it was — better a debt cleared than a stranger across the bowls.",   // 195
    "Let {vet} leave the old debt standing — a reason to set out two bowls again, and {home} learned to wait without flinching.",   // 196
    "Let {vet} clear the debt cold and clean — wished after that {home} had asked for one more reason to stay.",   // 197
    "Watched {vet} pour for the dead and sit the funeral years too late — {home} finally got to grieve with two at the table.",   // 198
    "Held {vet}'s wrist over three cold bowls while a soldier learned to grieve one death at a time — {home} grieving alongside at last.",   // 199
    "Sat with {vet} while the dead man's bowl went cold — no sermon, just {home} and a soldier keeping the same vigil.",   // 200
    "Heard {vet} name what was missing from the bowl — not a spice, the whole loud house — and {home} ached right alongside.",   // 201
    "Kept {vet}'s standing order for the not-quite-right dish — a reason {home} cooked every week, and a soldier kept coming back.",   // 202
    "Pressed the last page of {home}'s handwriting into {vet}'s hand — let the war keep a soldier, but not this.",   // 203
    "Heard {vet} say to let the old taste die — and pocketed the recipe anyway, the way {home} keeps a soldier's letters.",   // 204
    "Walked {vet} out under one coat in the rain, both headed the same way at last — {home} stopped saying goodbye like it was nothing.",   // 205
    "Let {vet} walk {home} to the door in the rain and stop there — the whole way, for the first time, and that was plenty.",   // 206
    "Heard {vet} name a life after the war and told a soldier to stop leaving alone — {home} would hold the door for that one.",   // 207
    "Watched {vet} step into the rain after {home} instead of making a soldier's promise and disappearing — and let the breath go.",   // 208
    null,   // 209
    null,   // 210
    null,   // 211
    null,   // 212
    null,   // 213
    null,   // 214
    null,   // 215
    null,   // 216
    null,   // 217
    null,   // 218
    null,   // 219
    null,   // 220
    null,   // 221
    null,   // 222
    null,   // 223
    null,   // 224
    null,   // 225
    null,   // 226
    null,   // 227
    null,   // 228
    null,   // 229
    null,   // 230
    null,   // 231
    null,   // 232
    null,   // 233
    null,   // 234
    null,   // 235
    null,   // 236
    null,   // 237
    null,   // 238
    null,   // 239
    null,   // 240
    null,   // 241
    null,   // 242
    null,   // 243
    null,   // 244
    null,   // 245
    null,   // 246
    null,   // 247
    null,   // 248
    null,   // 249
    null,   // 250
    null,   // 251
    null,   // 252
    null,   // 253
    null,   // 254
    null,   // 255
    null,   // 256
    null,   // 257
    null,   // 258
    null,   // 259
    null,   // 260
    null,   // 261
    null,   // 262
    null,   // 263
    null,   // 264
    null,   // 265
    null,   // 266
    null,   // 267
    null,   // 268
    null,   // 269
    null,   // 270
    null,   // 271
    null,   // 272
    null,   // 273
    null,   // 274
    null,   // 275
    null,   // 276
    null,   // 277
    null,   // 278
    null,   // 279
    null,   // 280
    null,   // 281
    null,   // 282
    null,   // 283
    null,   // 284
    null,   // 285
    null,   // 286
    null,   // 287
    null,   // 288
    null,   // 289
    null,   // 290
    null,   // 291
    null,   // 292
    null,   // 293
    null,   // 294
    null,   // 295
    null,   // 296
    null,   // 297
    null,   // 298
    null,   // 299
    null,   // 300
    null,   // 301
    null,   // 302
    null,   // 303
    null,   // 304
    null,   // 305
    null,   // 306
    null,   // 307
    null,   // 308
    null,   // 309
    null,   // 310
    null,   // 311
    null,   // 312
    null,   // 313
    null,   // 314
    null,   // 315
    null,   // 316
    null,   // 317
    null,   // 318
    null,   // 319
    null,   // 320
    null,   // 321
    null,   // 322
    null,   // 323
    null,   // 324
    null,   // 325
    null,   // 326
    null,   // 327
    null,   // 328
    null,   // 329
    null,   // 330
    null,   // 331
    null,   // 332
    null,   // 333
    null,   // 334
    null,   // 335
    null,   // 336
    null,   // 337
    null,   // 338
    null,   // 339
    null,   // 340
    null,   // 341
    null,   // 342
    null,   // 343
    null,   // 344
    null,   // 345
    null,   // 346
    null,   // 347
    null,   // 348
    null,   // 349
    null,   // 350
    null,   // 351
    null,   // 352
    null,   // 353
    null,   // 354
    null,   // 355
    null,   // 356
    null,   // 357
    null,   // 358
    null,   // 359
    null,   // 360
    null,   // 361
    null,   // 362
    null,   // 363
    null,   // 364
    null,   // 365
    null,   // 366
    null,   // 367
    null,   // 368
    null,   // 369
    null,   // 370
    null,   // 371
  ],
  // bark[] : "unburdened" selection barks for a veteran whose confidant/kin arc is done (fl&8). Text-only.
  bark: [
    "Settled some things. Lighter now.",
    "Somebody back home knows my name again.",
    "Said the thing out loud. Sky didn't fall.",
  ],
};

if (typeof window !== 'undefined') window.OFFHOURS = OFFHOURS;
