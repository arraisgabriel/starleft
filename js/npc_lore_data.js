/* npc_lore_data.js — static lore pools for the living-city H.U.B. NPCs (relatives,
   friends, service providers, ULTRA commuters). Companion of js/npc_lore.js.

   APPEND-ONLY once shipped (same contract as lore_data.js): persisted NPC records store
   event indices into these pools, and `versions` records per-content-version pool lengths
   so an already-minted NPC keeps drawing from the pools as they stood at mint time. Grow a
   pool by APPENDING entries and APPENDING a new `versions` row — never reorder, never edit
   shipped entries in place. Linkage pools (linkGrief/linkProud/linkReborn) are index-coded
   into the same event log with bases 1000/2000/3000 (see npc_lore.js) — keep every pool
   under 1000 entries.

   Template slots (resolved by buildNpcDossier's fill): {me} {full} {home} {rel} {vet}
   {vetFull} {prof} {poi} {condo}. */
const NPC_LORE = {
  // Ambient spoken lines (story-polish §8.2). NOT part of the versioned/indexed dossier pools —
  // read fresh at speak-time, never stored on an NPC record — so this key is EXEMPT from the
  // append-only/`versions` contract and may grow freely. Tokens per buildNpcDossier's fill.
  // Category is chosen in npcAmbientLine() by NPC flags (mourning/reborn) and role (provider/ultra);
  // `voss` is an Arc-2-only, oblique CEO seed (felt, never seen) — gated by progress in npcAmbientLine.
  ambient: {
    mourning: [   // a linked veteran fell — humanize the cost (fl & 1)
      "{me} keeps {vet}'s comm unit charged. Nobody has told them it stopped answering.",
      "They say grief takes weeks. {me} is still on the first one, and the door to {condo} stays shut.",
      "The wake at {condo} is over. The grieving hasn't started. Neither have the flowers.",
      "{me} still hasn't updated the family tree. Deleting {vet} is harder than adding them was.",
    ],
    reborn: [     // a linked veteran came back through The Wake (fl & 2)
      "{me} opens the door for {vet} and can't name what came back wearing that face.",
      "{vet} is home. {me} swears the smile sits a little wrong now.",
      "They wrote {vet} back off the wall. {me} sets a plate and doesn't ask what it cost.",
    ],
    staff: [      // facility service providers — the machine grinding on
      "{me} found a helmet in the parts bin at {poi}. A name was scratched inside. They didn't ask whose.",
      "The intake queue at {poi} is longer than the coffee is hot. {me} stopped counting last quarter.",
      "{me} runs {poi} on overtime now. The scorch marks come in faster than the paperwork.",
    ],
    commuter: [   // ULTRA HQ commuters — detached corporate dread
      "{me} commutes two hours to update spreadsheets about other spreadsheets. The elevator is where the pretending stops.",
      "{me} keeps a resignation letter in the desk drawer, updated every quarter, in case ULTRA ever asks.",
      "Synergy tastes like rust on {me}'s tongue lately. The paycheck is still real, so {me} swallows it.",
    ],
    voss: [       // Arc-2 only, oblique: the ageless, unseen managing partner (story-polish §3 B.3)
      "{me} swears the managing partner's office has been sealed since '87 — no birth, no death, no retirement on file.",
      "{me} processed a perpetual license upstream once. 'Founder's, no renewal.' Nobody would say whose.",
      "Word in the ULTRA elevators: A&O is shipping souls off-world now. They call it the Diaspora. {me} doesn't ask who boards first.",
    ],
    general: [    // relatives & friends — the war seen from home
      "{me} came from {home}. Swears the wasteland was kinder. Probably lying, but quietly.",
      "{me} waits on word from the front. The org chart keeps growing; the letters home don't.",
      "{me} finally heard what 'disruption' means out west. {me} stopped clapping at the keynotes.",
      "{me} lights a candle for {vet} every dispatch. The candles are getting expensive.",
    ],
  },
  professions: {
    // service-provider job titles, keyed by the POI kind they staff
    training: [
      "Range Safety Officer (Probationary, Year Nine)",
      "Ballistics Outcome Coach",
      "Live-Fire Curriculum Designer",
      "Target Replacement Technician",
      "Recoil Compliance Instructor",
      "Veteran Readiness Auditor",
    ],
    mdc: [
      "Dispatch Manifest Clerk",
      "Deployment Queue Wrangler",
      "Boarding Compliance Steward",
      "Departure Paperwork Notary",
      "Cargo-or-Personnel Classifier",
      "Farewell Window Attendant",
    ],
    mentalhealth: [
      "Madosis Intake Counselor",
      "Grief Throughput Specialist",
      "Sanity Threshold Assessor",
      "Night-Terror Shift Orderly",
      "Memory Hygiene Technician",
      "Discharge Optimism Officer",
    ],
    ultraservice: [
      "Implant Aftercare Associate",
      "Cosmetic Chassis Stylist",
      "Academy Curriculum Vendor",
      "Odds Transparency Liaison (Decorative)",
      "Upgrade Financing Advisor",
      "Series ∞ Subscription Retainer",
    ],
    // ULTRA HQ commuters
    ultra: [
      "Synergy Realization Analyst (Tier 4)",
      "Headcount Forecasting Associate",
      "Compliance Liaison to the Compliance Liaisons",
      "Vice-Intern of Narrative Alignment",
      "Quarterly Optimism Auditor",
      "Meeting Pre-Read Summarizer",
      "Org-Chart Topologist",
      "Stakeholder Sentiment Custodian",
      "Innovation Theater Stage Manager",
      "Severance Logistics Planner",
    ],
    // relatives/friends — what they do with their days
    civilian: [
      "Night-market mender",
      "Ration-queue placeholder (professional)",
      "Salvage sorter",
      "Hallway school teacher",
      "Water-filter rebuilder",
      "Memorial wall caretaker",
      "Coupon arbitrage hobbyist",
      "Drone-nest discourager",
      "Unofficial building historian",
      "Soup diplomat",
    ],
  },
  back: {
    relative: [
      "{me} followed {vet} out of {home} when the water came, and now rents a window-shaped photograph of a window in {condo}.",
      "{me} is {vetFull}'s {rel}. The company newsletter calls that 'an emotionally invested stakeholder.'",
      "Every payday, {vet} wires credits home. {me} IS home now — the credits arrive anyway, addressed to a city that flooded.",
      "{me} keeps {vet}'s old service tags in a drawer and a eulogy in draft, just to stay ahead of the paperwork.",
      "{me} learned to read casualty feeds before learning to read menus. {vet} says that's backwards. {me} disagrees.",
      "When {vet} enlisted, {me} inherited the debts, the dog, and the habit of waiting up. Two of the three are still alive.",
      "{me} moved to the H.U.B. to be closer to {vet}, then discovered 'closer' is a billing tier.",
      "{me} writes {vet} a letter every cycle and mails none of them. The drawer is almost full. So is the heart, probably.",
      "{me} once stood in line nine hours to watch {vet}'s transport lift off. The company sold umbrellas at the gate.",
      "{me} tells the neighbors {vet} is 'in logistics.' It's easier than explaining what the lasers are for.",
      "{me} and {vet} split everything growing up in {home} — rations, blame, one good coat. {me} kept the coat.",
      "{me} has {vet}'s power of attorney, three of their secrets, and no idea what to do with either.",
    ],
    friend: [
      "{me} knew {vet} before the stars, back when both queued at the same {home} soup dispenser. {me} still queues.",
      "{me} and {vet} came up running cargo skiffs together. One of them went legit. Opinions differ on which.",
      "{me} owes {vet} a life debt from the {home} riots. The H.U.B. accepts this as collateral on absolutely nothing.",
      "{me} is the friend {vet} calls when the official channels are listening. The unofficial ones are also listening.",
      "{me} taught {vet} how to fight dirty; the company taught them how to invoice for it.",
      "{me} keeps a couch free for {vet} and a story ready for the landlord.",
      "{me} and {vet} swore an oath in {home} that neither remembers and both still honor.",
      "{me} bet {vet} ten credits the war would be short. {me} pays interest in drinks now.",
      "{me} runs a still in {condo}'s sub-basement. {vet} is the only customer who pays.",
      "{me} knew {vet}'s name before the company stenciled it on armor. {me} uses the old one anyway.",
    ],
    provider: [
      "{me} took the {prof} job at {poi} because the recruiter said 'mission-driven.' The mission, it turns out, is invoicing.",
      "{me} has watched a hundred veterans walk into {poi} and learned to read the ones who won't walk out the same.",
      "{me} is technically classified as 'infrastructure' on {poi}'s balance sheet. The dental plan reflects this.",
      "{me} keeps the lights on at {poi} — literally; the contractor stopped answering during the last austerity sprint.",
      "{me} came to the H.U.B. for a fresh start and got a lanyard. {me} is assured these are the same thing.",
      "{me} files an incident report every time {poi}'s machinery sighs. The reports are filed under 'machinery: emotional.'",
      "{me} memorized every veteran's intake face. The exit faces are harder. {me} memorizes those too.",
      "{me} was promoted to {prof} after the previous one 'pursued other opportunities,' a phrase doing remarkable work.",
      "{me} unionized once, in {home}. The H.U.B. posting was the company's idea of a counteroffer.",
      "{me} fixes what the war breaks, eight hours a shift, and tells nobody which parts can't be fixed.",
      "{me} keeps a tip jar at {poi}. Corporate keeps emptying it 'for compliance.'",
      "{me} signed a loyalty oath, a liability waiver, and a birthday card for a founder {me} has never met.",
    ],
    ultra: [
      "{me} commutes two hours each way to ULTRA HQ to optimize a spreadsheet that optimizes other spreadsheets.",
      "{me} survived four reorgs by appearing in no org chart. HR suspects {me} may not exist. {me} encourages this.",
      "{me} once saw the Founder in an elevator. {me}'s performance review now cites 'unearned proximity to vision.'",
      "{me} drafts inspirational posters for a war {me} has only seen through quarterly slides.",
      "{me}'s badge opens four doors. {me} has mapped them all. None of them is an exit.",
      "{me} was hired to 'disrupt complacency' and now maintains the complacency dashboard.",
      "{me} clocks in at ULTRA HQ, clocks out, and keeps the in-between strictly confidential, mostly from {me}.",
      "{me} has a desk by the window. The window has a view of a poster of a window.",
      "{me} files the casualty numbers into a font called Reassuring Sans.",
      "{me} keeps a resignation letter in a drawer, updated quarterly like everything else here.",
    ],
  },
  // short present-tense activity snippets — schedule/status flavor ("running errands — …")
  chores: [
    "queuing at the ration dispenser",
    "haggling at the parts stall",
    "filing a noise complaint",
    "walking the perimeter for 'air'",
    "trading coupons in the plaza",
    "picking up a med-debt statement",
    "delivering mended jackets",
    "looking for honest work, quietly",
    "feeding the alley drones",
    "standing in the wrong line",
    "renewing a residence permit",
    "selling plasma, the legal kind",
    "browsing the surplus bins",
    "waiting out a dust advisory",
    "carrying soup to a neighbor",
    "photographing the skyline for no one",
    "appealing a parking fine for a vehicle they don't own",
    "collecting rainwater above the filtration tax line",
    "swapping batteries at the kiosk",
    "visiting the memorial wall",
    "arguing with a vending machine",
    "mapping which streetlights still work",
    "returning a borrowed ladder",
    "practicing small talk for the clinic",
  ],
  // per-visit NPC life events. req:'linked' = only NPCs with a living-or-fallen veteran link.
  events: [
    {req:"any", text:"Rent on {me}'s unit goes up 4%. The ceiling, in unrelated news, comes down 4%."},
    {req:"any", text:"{me} wins 'Resident of the Cycle.' The prize is a voucher for the thing {me} already pays for."},
    {req:"any", text:"A drone misdelivers someone's severance box to {me}'s door. {me} keeps the stapler."},
    {req:"any", text:"{me} files a noise complaint about the Wake's lightning. It is returned, stamped 'WORKING AS INTENDED.'"},
    {req:"any", text:"{me}'s water ration is upgraded to 'sparkling' for one day due to a pipeline error. Best day of the quarter."},
    {req:"any", text:"{me} finds a cat in the wasteland fence line and names it after a debt collector. It answers to neither."},
    {req:"any", text:"The condo elevator is repaired, celebrated, and re-broken within one billing cycle."},
    {req:"any", text:"{me} starts a rooftop garden. Corporate classifies it as 'unlicensed photosynthesis' and licenses it."},
    {req:"any", text:"{me} learns three new words of bureaucratic Ultranese and forgets one old friend's face. Fair trade, says the form."},
    {req:"any", text:"A survey asks {me} to rate the war from one to five stars. {me} writes an essay. The field accepts integers."},
    {req:"any", text:"{me} queues four hours for bread and meets everyone they have ever known."},
    {req:"any", text:"{me}'s ID photo is retaken. The new one looks more tired, which the clerk calls 'more accurate.'"},
    {req:"any", text:"Power browns out across {condo}. {me} hosts the hallway by candlelight and learns everyone's real opinions."},
    {req:"any", text:"{me} pawns something small and buys something necessary. The receipt says 'discretionary.'"},
    {req:"any", text:"{me} is selected for a wellness pilot program. The pilot is cancelled; the wellness is assumed."},
    {req:"any", text:"A recruiting poster near {me}'s window gets replaced by a bigger recruiting poster. The view improves, technically."},
    {req:"any", text:"{me} repairs a neighbor's heater for free. The neighbor cries. The company sends {me} a cease-and-desist on behalf of heaters."},
    {req:"any", text:"{me} dreams in spreadsheet for the first time. The columns balance. {me} wakes up worried."},
    {req:"any", text:"{me} attends a town hall. Questions are 'collected for a future session.' The future remains unscheduled."},
    {req:"linked", text:"{me} finds {vet}'s face on a morale mural, eight meters tall, smiling in a way {vet} never has."},
    {req:"any", text:"{me} adopts a market stall's loyalty program and is immediately owed more than it can ever pay."},
    {req:"any", text:"The curfew siren plays a new note. Everyone in {condo} agrees it's worse. Morale is reported up."},
    {req:"any", text:"{me} writes a letter to management about the stairwell lights. The reply thanks {me} for the feedback loop."},
    {req:"any", text:"{me} barters two shifts of childcare for one working umbrella. Both parties feel they won."},
    {req:"any", text:"A census taker asks {me} how many people live in the unit. {me} counts the photographs too."},
    {req:"any", text:"{me}'s favorite noodle cart gets an ULTRA franchise sign. The noodles now come with terms of service."},
    {req:"any", text:"{me} sees the ocean on a public screen for thirty seconds. Saves nothing. Keeps everything."},
    {req:"any", text:"{me} is fined for jaywalking on a street with no traffic, no lights, and no other pedestrians."},
    {req:"any", text:"An old song from {home} plays in the plaza. For three minutes the H.U.B. is somewhere else."},
    {req:"any", text:"{me} patches the unit's wall with a campaign poster. Insulation rating: surprisingly good."},
  ],
  // linkage events — fired by roster diffs, not the per-visit roll (event-log codes 1000+i)
  linkGrief: [
    "The doorbell rings twice in {condo}. A folded flag, a fruit basket, and an NDA. {me} signs nothing.",
    "{me} sets a second cup out for {vet} anyway. The company sends a coupon for the first.",
    "The casualty notice spells {vet}'s name right. {me} had braced for everything except that.",
    "{me} requests {vet}'s effects. Receives: one boot, a commendation, and an invoice for the other boot.",
    "{me} stops watching the casualty feeds. Starts watching the door. Neither helps.",
    "Condolence drones circle {condo} for a week. {me} feeds them nothing and they finally leave, like grief doesn't.",
    "{me} tells the story of {vet} at the plaza wall until strangers can tell it back. That's all a memorial is.",
    "HR offers {me} 'bereavement credits,' expiring quarterly. Grief, {me} learns, has a fiscal year.",
  ],
  // (event-log codes 2000+i)
  linkProud: [
    "{vet} made rank again. {me} tells everyone in the ration line, twice.",
    "{vet}'s commendation arrives printed on real paper. {me} frames it over the crack in the wall it cannot fix.",
    "The morale feed shows {vet} for two whole seconds. {me} buys a round the unit cannot afford.",
    "{me} clips {vet}'s name from the bulletin and starts a scrapbook titled 'EVIDENCE.'",
    "Neighbors start calling {me} '{vet}'s {rel}' like a title. {me} stops correcting them.",
    "{vet} sends back pay. {me} fixes the heater and lies about how.",
    "{me} hears {vet}'s voice on a recruitment spot and feels proud and furious in one breath.",
    "{me} bakes for the whole floor when {vet}'s promotion posts. Rationing makes it one biscuit each. Nobody complains.",
  ],
  // (event-log codes 3000+i)
  linkReborn: [
    "Something wearing {vet}'s face knocks on {me}'s door. {me} lets it in. Grief is negotiable; family isn't.",
    "{vet} came back colder, stitched with stormlight. {me} relearns them like a language half-remembered.",
    "The company calls it 'continuity of service.' {me} calls it {vet}, and keeps the porch light on anyway.",
    "{me} catches the new {vet} humming the old song wrong. Close enough. Close enough is everything now.",
    "Paperwork lists {vet} as 'asset, reinstated.' {me} amends the copy on the fridge: 'home.'",
    "{me} buries the eulogy draft in the yard like a seed. Whatever grew back, it knocks like {vet}.",
  ],
  // per-content-version pool lengths (append a row when pools grow; see header)
  versions: [
    { profTraining:6, profMdc:6, profMentalhealth:6, profUltraservice:6, profUltra:10, profCivilian:10,
      backRelative:12, backFriend:10, backProvider:12, backUltra:10,
      chores:24, events:30, linkGrief:8, linkProud:8, linkReborn:6 },
  ],
};
