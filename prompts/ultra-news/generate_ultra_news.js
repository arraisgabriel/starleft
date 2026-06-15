#!/usr/bin/env node
/* Dev-time ULTRA NEWS generator.
   Reads GAME_TIPS and MAPS from classic scripts, then writes a static runtime
   data file. No generation happens in the browser. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const outFile = path.join(root, 'js', 'ultra_news_data.js');

function readClassic(file){
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function stripHtml(s){
  return String(s||'').replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}
function loadGameData(){
  const ctx = {
    console,
    window:{ devicePixelRatio:1 },
    document:{ getElementById(){ return { getContext(){ return {}; } }; } },
    innerWidth:1280,
    innerHeight:720,
  };
  vm.createContext(ctx);
  vm.runInContext(readClassic('js/config.js')+'\nthis.MAPS = MAPS;', ctx, { filename:'js/config.js' });
  vm.runInContext(readClassic('js/tips.js')+'\nthis.GAME_TIPS = GAME_TIPS;', ctx, { filename:'js/tips.js' });
  return {
    tips: ctx.GAME_TIPS || [],
    maps: ctx.MAPS || [],
  };
}

const tipFrames = [
  'B.I.G. PAPA: {tip} The lesson is simple: empathy is a rounding error when the numbers are late.',
  'B.I.G. PAPA: {tip} Management reminds you that suffering is not a blocker unless it affects throughput.',
  'B.I.G. PAPA: {tip} Society may object, but society has not shipped this quarter.',
  'B.I.G. PAPA: {tip} Treat this as guidance, not morality; morality has poor margins.',
];
function tipHeadline(tip, i){
  const text = stripHtml(tip).replace(/\.$/, '');
  return tipFrames[i % tipFrames.length].replace('{tip}', text+'.');
}
function episodeHeadline(map, i){
  const cr = map && map.crawl || {};
  const title = cr.title || ('EPISODE '+(i+1));
  return 'B.I.G. PAPA: '+(cr.episode||('Episode '+(i+1)))+' closes the file on '+title+'. Losses become learnings; learnings become invoices.';
}
function q(s){ return JSON.stringify(s); }

const data = loadGameData();
const tips = data.tips.map(tipHeadline);
const episodes = data.maps.map(episodeHeadline);

// --- Hand-authored REACTIVE pools (story-polish §3/§8). NOT derived from tips/crawls; authored
//     here so a regen preserves them. `foreshadow` is indexed by MAPS index (entry i fires when the
//     player enters MAPS[i]); Voss/Arc-3 seeds stay oblique and only appear in Arc-2 entries. ---
const foreshadow = [
  "B.I.G. PAPA: There are bigger fish up the food chain than DISRUPTR. There always are — and they are watching this one with interest.",                 // 0  Ep I
  "B.I.G. PAPA: Unicorn status logged. Two rival decks just opened merger talks; synergy is coming, and it has teeth.",                                    // 1  Ep II
  "B.I.G. PAPA: You are the category now. The monopoly you are becoming already has a name and a floor of antitrust lawyers.",                              // 2  Ep III
  "B.I.G. PAPA: Your bankrupt victims are comparing severance. A cartel needs no charter — only a grudge with financing.",                                 // 3  Ep IV
  "B.I.G. PAPA: The board smells blood in its own portfolio. Governance is no longer a metaphor.",                                                         // 4  Ep V
  "B.I.G. PAPA: Everyone you broke is fusing into one last entity — and older money than all of it is already watching the dunes.",                          // 5  Ep VI
  "B.I.G. PAPA: Someone always profits from the dead. Whoever it is has already filed the paperwork for what comes after the fire.",                         // 6  Ep VII (A&O/flash seed)
  "B.I.G. PAPA: A&O's managing partner never shows at auctions. He just buys what is left. No one has seen him age.",                                       // 7  Ep VIII (Voss)
  "B.I.G. PAPA: Sources say A&O did not invent the cure — it copied the founder's own notes. And the founder, oddly, is still here.",                       // 8  Ep IX (Voss)
  "B.I.G. PAPA: Once a decade A&O archives a person instead of firing them. Nobody has ever come back from archive.",                                       // 9  Ep X (Rust/Zé)
  "B.I.G. PAPA: The tower writing the dead into metal is the new wing. Repairing old shells in the sub-basement has quietly run for years.",                // 10 Ep XI (Voss)
  "B.I.G. PAPA: A&O's Diaspora Initiative — off-world soul-server capacity — is operational and scaling. Details redacted.",                                // 11 Ep XII (Voss/offsite)
  "B.I.G. PAPA: Every backup is locked with the founder's cipher. Nothing deletes until he says so. And he never dies.",                                    // 12 Ep XIII (Voss/purge)
];
// fired from a vet-death tick once each, when the memorial crosses these gates (handled in lns.js).
const memorialDread = [
  "B.I.G. PAPA: The memorial is growing faster than the org chart. The board files it under cost optimization.",                                            // gate 6
  "B.I.G. PAPA: The wall hit double digits. The board sent flowers; the condos sent grief. Every name you write down, somebody upstream reads in the dark.", // gate 10
];
// keyed by achievement id (js/achievements.js); pushed from ACH.fire on unlock.
const achievement = {
  "the-wall":     "B.I.G. PAPA: Casualty milestone reached. The memorial has been reclassified as a load-bearing structure.",
  "ghost-equity": "B.I.G. PAPA: A resurrection on record. The Wake worked, and the board is very interested in the IP.",
  "architect":    "B.I.G. PAPA: A&O confirms an unscheduled departure from its retention wing. The asset declined to comment.",
  "down-round":   "B.I.G. PAPA: The company is founding again from ash and debt. Resilience is cheaper when everyone else is dead.",
  "knife-net":    "B.I.G. PAPA: A contractor in cyan failed to file his escape. The crater keeps its secrets a little longer.",
  "unrecovered":  "B.I.G. PAPA: A recovery agent has been recovered. A&O is reviewing the irony for billable potential.",
  "evicted":      "B.I.G. PAPA: The Dark Tower's guardian has been scrapped. Property values on the peninsula remain catastrophic.",
  "foreclosed":   "B.I.G. PAPA: The foreclosure that walks has stopped walking. Somewhere a quarterly call goes very quiet.",
};

const body = `/* ultra_news_data.js — checked-in ULTRA NEWS copy generated from Field Tips
   and campaign crawls. Runtime is static data only; regenerate with
   prompts/ultra-news/generate_ultra_news.js after changing tips or episode crawls. */
const ULTRA_NEWS = {
  source: 'ULTRA NEWS',
  byline: 'B.I.G. PAPA',
  tips: [
${tips.map(s=>'    '+q(s)).join(',\n')}
  ],
  episodes: [
${episodes.map(s=>'    '+q(s)).join(',\n')}
  ],
  foreshadow: [
${foreshadow.map(s=>'    '+q(s)).join(',\n')}
  ],
  memorialDread: [
${memorialDread.map(s=>'    '+q(s)).join(',\n')}
  ],
  achievement: {
${Object.entries(achievement).map(([k,v])=>'    '+q(k)+': '+q(v)).join(',\n')}
  },
  templates: {
    unitDeath: [
      'B.I.G. PAPA: {name} has exited payroll permanently. The unit\\'s remaining value has been reclassified as atmosphere.',
      'B.I.G. PAPA: {name} fell at {map}. Morale impact negative; budget clarity improved.',
      'B.I.G. PAPA: {unit} loss recorded. People are volatile assets, which is why the market prefers facilities.'
    ],
    heroLifeEvent: [
      'B.I.G. PAPA: {name} experienced personal growth. Management is investigating whether it can be patented.',
      'B.I.G. PAPA: {name} developed a life event. Productivity may briefly suffer while identity tries to negotiate.',
      'B.I.G. PAPA: {name} reports meaning. Shareholders request a cleaner metric.'
    ],
    dreamFulfilled: [
      'B.I.G. PAPA: {name} fulfilled a lifelong dream on company time. Legal is checking whether the company owns it.',
      'B.I.G. PAPA: {name} finally got what they always wanted. Shareholders request the achievement be made repeatable and cheaper.'
    ]
  }
};
`;

if(process.argv.includes('--check')){
  console.log('ULTRA NEWS generator ok: '+tips.length+' tips, '+episodes.length+' episode headlines.');
} else {
  fs.writeFileSync(outFile, body);
  console.log('Wrote '+path.relative(root, outFile)+' with '+tips.length+' tips and '+episodes.length+' episode headlines.');
}
