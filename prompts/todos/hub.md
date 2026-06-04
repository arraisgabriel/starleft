# H.U.B.

Hurban Ultra Buildings

The HUB or H.U.B is the central map where all units live and build their lifes. Something like a stardew valley but cyberpunk. 

H.U.B. has a Huge map, like episode 7 one.

I'ts a cyberpunk life-sim like huge map, where the career units and heroes use the in-game currency, The m3rits, or M3$. There is no battle here, only living, upgrading and spending m3rit$.

## M3rit$
M3rit$, or m3 (m3$10,00), are accumulated after each completed episode in career mode by counting and multiplying enemy units killed, enemy bases destroyed, or extra points for finishig a multiplayer episode. It's a balanced system that allows units and heroes slow progression throught the campaign episodes (think in 40 episodes total).

M3rit$ can be spent to upgrade Condos for units and heroes to improve their living, buy implants and clothes in shops so they can upgrade and change their style an so on.

## HUB Points of interest
For now there are 10 points of interest scaterred through the HUB area.
- 3 Units Condos Suburbs
- 5 Mission Dispatch Center or MDCs 
- THE URBAN HEADQUARTERS
- The Wasteland (nuclear bomb explosion site)

## Units Condos Suburbs

Scattered across the HUB (on 3 corners of the map) are the **middle sized** 3 condos / suburbs that the units and heroes live.  
Units and heroes live randomly scattered through the condos/suburbs throughout the HUB.
Condos can be updated to provide health upgrades to the units and heroes that live in it. This upgrades and unit upgrades cost M3rit$. It's a balanced system that allows units and heroes slow progression throught the campaign episodes (think in 40 episodes total).

## M.D.C.s (going to the next episode)
A Mission Dispatch Center is the **little sized** place that the units go to start a new mission. You can choose the units that you want to take with you to next episode by commanding them to enter a M.D.C. before leaving.

There are 5 M.D.C. scattered across the HUB area. One somewhat near to every Point of interest in the HUB area.

## ULTRA HEADQUARTERS
At the middle of HUB, in HUB's donwtown area, sits the **huge sized** biggest building ever seen in human history, The ULTRA HEADQUARTES. ULTRA is the company that fabricates life for every one, everywhere (their slogan).

The ULTRA HEADQUARTERS asset sprite is the megabuilding @assets/mega/megabuilding_3.png animation sprites. But it MUST be huge, approximately 5 times bigger (if the sprites resolution allows it). It haves it's own set of canvas/css animations for it's neons, matching their color and position on the animated sprite.

The ULTRA HEADQUARTERS is surrounded by the HUB Downtown, where all the interesting things in HUB happen. There we have shops, academies, story events (like game quests) and maybe some gambling?? "Here you can show)spend) all your M3rit$ if need to".

## Wasteland area

Southeast of the map we have a wasteland created by a nuclear explosion.

It's topography is desert/sand (with some magma topography sprites) and it has Big ruins megasprites (3 times the in-game size) scattered through it like the condos and buildings are abandoned for decades. They have their own set of canvas/css animations for it's parts, in a radiation green smoky fashion.

When the player enters it he starts to see a css redish wash, and a persitent fog that clouds all the wasteland (like mountain topography animations, but in all wasteland)

## Getting into the HUB (wiring HUB into the game)

From now on, after a episode ends (the last enemy HQ is destroyed), the player MUST command a unit to enter a player HQ. If the last player HQ is destroyed and there are no more interns/money, from now on is game over.

When the unit enters the player HQ a Flying Buzzword Bomber spawns near  it (but outside player's view) and makes a flight to the top of the HQ and then hovers to leave the map. It then proceeds to the nearest border of the map. If the Flying Buzzword Bomber succeds leaving the map the player world view changes to the HUB area.