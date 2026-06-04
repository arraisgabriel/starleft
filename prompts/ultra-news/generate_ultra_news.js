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
