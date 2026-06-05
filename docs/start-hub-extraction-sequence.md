Easiest is a console one-liner during an active solo session (served over http, not file://). Open DevTools and paste one of these:

Play the whole cinematic (bomber flies in over your HQ → hover → leaves → 13s panorama → hub) — recommended, shows it in context:


beginExtractionPhase(G);
hubStartExtractFlight(G, G.entities.find(e => e.owner==='player' && e.type==='hq' && !e.dead));
Skip straight to the new panorama (fastest, ~13s then lands in the hub):


beginExtractionPhase(G);                          // sets extractReady + CAMPAIGN.nextMapIndex
G.extractFlight = { phase:'panorama', t:0 };       // jump past the bomber-over-HQ part
document.body.classList.add('scene-hubload');      // hide the HUD now (updateExtraction adds it otherwise)


The natural way (no internals) — instantly clear the map, then garrison a unit and press the Extraction button:

G.entities.forEach(e => { if (e.owner==='enemy' && e.kind==='building') e.dead = true; });
Notes:

beginExtractionPhase/hubStartExtractFlight only run in netRole==='solo' — they no-op in co-op (host co-op intentionally cuts straight to the hub, no panorama).
To freeze the scene for inspection: running=false halts the 13s timer; set G.extractFlight.t to scrub the bomber across (0 → 13), and bump G.time to advance the neon/tower twinkle. running=true resumes and it auto-transitions.
Want me to wire this into a proper dev helper (e.g. a triggerExtraction() in docs/ console helpers, or a debug key) so you don't have to paste it each session?
the bomber is too big, reduce it to 65% of the size and too up on the sky, make it fly a little less higher. Also make it have red neon glowing lights mapped to it's engine thursters on it's back
Good notes. Let me look at the actual bomber sprite so I can map the red thruster glows to the real engine positions (not guess), then make the three changes.

Bash Inspect bomber walk sprite dimensionßs
IN
cd /Users/gabriel.bussular/Workspace/starleft
ls -la assets/units/bomber/ 2>/dev/null
python3 -c "
from PIL import Image
im=Image.open('assets/units/bomber/walk.png'); W,H=im.size
print('walk.png', W,H)
# walk strips in this project: UNIT_FRAMES frames side by side. Guess frame count by aspect.
for n in (8,10,12,6):
    fw=W/n
    print('if',n,'frames -> fw',round(fw,1),'aspect',round(fw/H,2))
"


