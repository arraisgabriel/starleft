/* tips.js — static pool of gameplay tips. Shown (random + rotating) in the
   main-menu "Field Tip" panel via pickTip()/startTipRotation() in ui.js.
   Plain strings (light HTML allowed). Loaded before ui.js. | STARLEFT */
const GAME_TIPS = [
  "<b>Commanding:</b> tap a unit to select it, then tap an enemy to attack, a crystal to mine, or the ground to move. Drag to pan, pinch (or the +/− buttons) to zoom.",
  "<b>Grab an army fast:</b> Shift-drag a selection box — or tap the ▭ Select-box button, then drag — to scoop up every unit inside it at once.",
  "<b>Control groups:</b> bind a squad with Ctrl/⌘ + 1–9, then tap that number to reselect it. Double-tap the number to snap the camera straight to them.",
  "<b>Funding wins games.</b> Keep every Intern 🧑‍💻 mining and hire a second wave early — an idle Intern is wasted runway.",
  "<b>Satellite Office 📡:</b> mining a far-off crystal? Drop one beside it — Interns deposit there instead of trekking home, and its rig auto-trickles a little Funding on its own.",
  "<b>Hitting your Headcount cap?</b> Build another Open-Plan HQ 🏢 — each one raises how many units you can field.",
  "<b>Mix your army.</b> Never mass one unit type: a blob of melee melts to a Food Truck's flames. Put Growth Hackers 🚀 up front and Consultants 💼 + Lobbyists 🎩 firing from behind.",
  "<b>Lobbyist 🎩:</b> devastating from extreme range but a slow reload — keep them safe behind the front line and let tankier units soak the hits.",
  "<b>Hustlers 🛹</b> are cheap and fast — send a pack to raid the enemy's Interns and stall their economy while you tech up.",
  "<b>Recruiters 🧑‍🏫 don't fight — they heal.</b> Tuck one or two behind your army and the whole squad lasts roughly twice as long.",
  "<b>Food Truck 🚚:</b> its flame cone shreds tightly-packed enemies — brutal against swarms, but weak against a few tough units.",
  "<b>Auditor 📊:</b> auto-deploys into a long-range siege cannon when enemies are near — park it behind your line to out-range turrets and clusters. It can't fire point-blank, so screen it.",
  "<b>Air rules:</b> only ranged units, turrets, and the Founder Mech can hit flyers — a pure-melee army can't touch a Courier or Bomber. Always keep some anti-air.",
  "<b>Founder Mech 🦄:</b> a slow, pricey wrecking ball that hits ground AND air. One or two anchor a deathball — just don't expect them to react quickly.",
  "<b>Tech tree:</b> People Ops 🎯 trains infantry; build The Garage 🔧 for vehicles, then a Launch Pad 🚀 (needs a Garage) for flyers. Climb it as your Funding grows.",
  "<b>Defend chokes</b> with Legal Team ⚖️ turrets, and let your HQ 🏢 chip attackers with its rooftop shot — a couple of turrets buy time to rally a counter-attack.",
  "<b>Units fight back</b> on their own when attacked, and nearby allies pile in automatically. A plain <b>Move</b> order ignores enemies, though — use it to retreat cleanly.",
  "<b>Pull wounded units out.</b> Veterans slowly heal when out of combat (faster near a Recruiter or Courier). A rescued unit is free reinforcement next fight.",
  "<b>Production queue:</b> select a building to see its hire line — each card is a queued unit. Tap the ✕ to cancel one and get the Funding back.",
  "<b>Keep dying on a map?</b> Stop attacking and fix the economy first: more Interns, a Satellite Office, then a bigger <i>mixed</i> army with a healer. Out-produce the rival, then push as one group and regroup between fights.",
  "<b>Lazy Interns 🧑‍💻:</b> they're unpaid and it shows — every so often an Intern just <i>quiet-quits</i> mid-task, ghosting a build before it starts or downing tools halfway through mining. It's a feature, not a bug (honest). Re-issue the order — tap the site or crystal again — to nudge them back to work, and keep an eye on idle Interns.",
];
