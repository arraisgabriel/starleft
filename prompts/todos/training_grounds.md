Plan on how to add a training grounds facility to the HUB area.

The training grounds MUST work like a level transfering/upgrading (more like level cloning) between two units of the same type. It has it's own menu panel

For a unit to be trained, it MUST enter the training grounds with another higher leveled unit with the same type.

The higher level unit serves as a mentor to the junior one. At the end of the training process, the levels of the two units get to 1 level above the biggest level between them both.

For instance, a level 16 lobyist and a level 11 lobyist enter a training ground. After the end of the training period them both leave the training grounds in level 17.

For the entire duration of the training, Both the units are kept locked inside it, the player can't use them in nowhere else.

This mechanic will be used so the player can "replace" squad (dispatched) higher level units by lesse leved ones. 

## Training grounds alocation
Units can be commanded in and out of the training grounds facility using the same mechanic used in M.D.C.s around the HUB. Reproduce the exact UX used there to let players move units inside/outside the facility. 

## Training conditions
The train sessions MUST only occur between units that have at maximum 6 levels of difference. "You are too junior for my league, grow a pair first".

There must be a maximum limit of six training sessions (pairs of units) training at the same time.

For the training session to start BOTH UNITS must be commanded inside the training gorunds facility (in HUB map) and the player MUST click on the "Create Training Session" button inside Training grounds Menu panel

## Training session duration
For each missing level, the training takes 1 in-game hour. The hours counter MUST pass when the player is in a mission or in the HUB. But the counter MUST NEVER consider the time outside in-game, only the time that the player spent playing the game, in hub or other missions.

For the entire duration of the training, Both the units are kept locked inside it, the player can't use them in missions or in other HUB POIs.

If the player chooses to remove units from the training ground before the training duration time, the junior unit looses all gained XP, it leaves with nothing.

The training grounds menu panel MUST show the training duration in hours before the player starts the training.

For each training pair inside the training grounds there MUST be inside training grounds menu a regressive counter diplaying how much time left until the training is complete

## Training grounds sprite generation
The training ground is a BIG, detailed, still(not animated, 1 frame only) sprite that is designed to show the current training units inside it. It MUST have for instance a VISIBLE shooting range, for shooter units to train on, all the shooting units will appear live inside it for the training duration, humans, vehicles and flying units. So the Training Grounds Sprite MUST be big enough to allow up to 6 pairs of units training in it's shooting range at the same time, and also leave breathing room for a beautifull Cyberpunk Military Academy like visual. The sprite art direction MUST follow the game references Hades 1 and 2 and Cyberpunk 2077. 

Use gemini image pro model to render a beautifull yet dark neon cyberpunk training ground inspired by Hades 2 art direction. Use the api key in @_dev/ti-image.env for calling gemini. 

Consult _dev/prompts folder for art direction prompting tips. For instance:
```
## STYLE block (in gen_buildings.mjs)
Dark steel-grey/gunmetal/charcoal megastructure, Hades/Jen-Zee painterly, deep near-black
shadows, **cyan/blue neon used sparingly**; near-top-down high 3/4 so the building shows
height; centered, base at the bottom, filling ~90% of the cell; **no cast shadow** (flat
green only);.
``` 

## Training grounds Menu panel
The training grounds facility MUST have it's own menu panel, accessible by clicking in a button on the facility bottom menu, that shows Cards for each training pair, with their unit iddle animations playing with them around 200px size (both iddle animated units appear together). 

The training session card also shows the training information like, the end resulting level for both units and the remaining training session time, add here all the important information for training sessions. 

Add a "Create Training Session" button inside Training grounds menu panel, so the player can create new training sessions for units that meet the training conditions and are inside the training grounds facility 

## Training grounds HUB positioning

The training grounds MUST replace the lauchpad giant sprite placed to the mid-up right part of the HUB. The new training grounds sprite MUST be placed there. Alter the HUB map terrain so it can fit