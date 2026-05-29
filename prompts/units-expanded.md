# Expanded roster — 8 new Terran-inspired units

Each unit gets a **WALK** strip and an **ACTION** strip. Prepend the `[RULES]` block
from [shared-blocks.md](shared-blocks.md) to every prompt; generate the BLUE version,
then run `RECOLOR` for the RED (enemy) twin. Append `AVOID` if it drifts.

> `[RULES]` = the reusable preamble (512×512 ×4 strip → 2048×512, magenta gutters,
> solid `#00ff00` bg, identical-subject consistency, player blue/cyan accents).
> **Walk-frame defaults** for humanoids and the vehicle/flyer variants are in shared-blocks.md.

## Roster & SC2 inspiration
| Unit | SC2 | From | Role | Air |
|---|---|---|---|---|
| Recruiter | Medic | People Ops | healer/support | – |
| Hustler | Reaper | People Ops | fast raider, splash grenade | – |
| Lobbyist | Ghost | People Ops | long-range sniper (glass cannon) | – |
| Food Truck | Hellion | The Garage | fast light vehicle, flame cone | – |
| Auditor | Siege Tank | The Garage | siege artillery (deploys) | – |
| Founder Mech | Thor | Launch Pad | capstone heavy walker | – |
| Courier Drone | Medivac | Launch Pad | flying healer/transport | ✈️ |
| Buzzword Bomber | Battlecruiser | Launch Pad | flying capital, "Viral Campaign" | ✈️ |

## Drop-in `DEF` stat blocks
```js
recruiter: { name:'Recruiter', icon:'🧑‍🏫', kind:'unit', hp:80,  cost:75,  build:14, sight:6, supply:1, speed:2.5, dmg:0,  range:4.0, cd:1.0, r:9,
             heal:9, flavor:'Heals burnout. "We\'re like a family." Mends Interns instead of shooting.' },
hustler:   { name:'Hustler', icon:'🛹', kind:'unit', hp:70,  cost:70,  build:11, sight:7, supply:1, speed:3.6, dmg:10, range:1.8, cd:0.7, r:9,
             splash:18, raid:1.5, flavor:'Moves fast, breaks things, never replies to email. Harasses your economy.' },
lobbyist:  { name:'Lobbyist', icon:'🎩', kind:'unit', hp:70,  cost:140, build:20, sight:9, supply:2, speed:2.2, dmg:38, range:7.5, cd:2.3, r:9,
             flavor:'Buys senators wholesale. One devastating shot, then a long reload.' },
foodtruck: { name:'Food Truck', icon:'🚚', kind:'unit', hp:110, cost:90,  build:15, sight:6, supply:2, speed:3.8, dmg:12, range:3.0, cd:1.0, r:11,
             vehicle:true, cone:true, flavor:'Free cold brew & napalm. Shreds clustered Interns.' },
auditor:   { name:'Auditor', icon:'📊', kind:'unit', hp:200, cost:175, build:28, sight:8, supply:3, speed:1.8, dmg:18, range:5.0, cd:1.4, r:12,
             vehicle:true, siege:{dmg:45,range:9,splash:true,setup:1.5}, flavor:'Deploys spreadsheets. Sieges into a long-range due-diligence cannon.' },
founder:   { name:'Founder Mech', icon:'🦄', kind:'unit', hp:600, cost:400, build:45, sight:8, supply:6, speed:1.6, dmg:45, range:4.0, cd:1.5, r:16,
             vehicle:true, antiAir:true, flavor:'Visionary in a 12-ft exosuit. Pivots through walls.' },
courier:   { name:'Courier Drone', icon:'🛸', kind:'unit', hp:120, cost:90,  build:16, sight:7, supply:2, speed:3.0, dmg:0, range:4.0, cd:1.0, r:10,
             air:true, heal:7, transport:4, flavor:'Same-day delivery of medkits and morale.' },
bomber:    { name:'Buzzword Bomber', icon:'🛩️', kind:'unit', hp:500, cost:450, build:50, sight:9, supply:6, speed:1.8, dmg:30, range:6.0, cd:0.9, r:16,
             air:true, nuke:{name:'Viral Campaign',dmg:300,cd:60}, flavor:'Drops a Viral Campaign that levels a campus.' },
```

---

## 1) Recruiter (Medic) — People Ops
*Reference: Consultant + Intern sprites.*

**WALK**
```
[RULES] Subject: the RECRUITER — a friendly field-medic operative in light steel-grey armor with a soft cyan cross emblem on the chest, a backpack with a glowing cyan vial, holding a compact medical wand. WALK CYCLE (4 frames): use the humanoid walk defaults (F1 contact left, F2 passing+bob, F3 contact right, F4 passing); the wand stays held forward, only legs and a subtle body bob change.
```
**ACTION — heal beam**
```
[RULES] Subject: the RECRUITER (same as the walk reference). A HEAL-BEAM action that loops: F1 raises the wand, tip starts to glow cyan; F2 a soft cyan healing beam/spray projects forward from the wand with a small sparkle; F3 the beam at full brightness, gentle cyan particles around the tip; F4 beam fades, wand lowering toward F1. Body stays planted; only the casting arm and the beam change.
```

## 2) Hustler (Reaper) — People Ops
*Reference: Growth Hacker + Consultant sprites.*

**WALK (fast skater-style run)**
```
[RULES] Subject: the HUSTLER — a lean, lightly-armored skirmisher in a steel-grey hoodie-jacket with cyan trim, a small jetpack/booster on the back, holding a stubby grenade launcher; energetic posture. RUN CYCLE (4 frames): an athletic fast run — F1 big stride left leg forward leaning forward, F2 push-off airborne (both feet near the ground), F3 big stride right leg forward, F4 recover; backpack booster emits a faint cyan flicker; only legs/lean/booster change.
```
**ACTION — toss grenade**
```
[RULES] Subject: the HUSTLER (same as walk reference). A GRENADE-THROW action: F1 cocks the launcher back (wind-up); F2 swings forward and a small glowing cyan grenade leaves the muzzle; F3 follow-through arm extended, a faint cyan muzzle puff; F4 recover to ready. Feet planted; only arms/torso and the projectile change.
```

## 3) Lobbyist (Ghost) — People Ops
*Reference: Consultant sprite.*

**WALK**
```
[RULES] Subject: the LOBBYIST — a tall, slim operative in a sharp dark-grey suit-armor with cyan pinstripe accents and a wide-brimmed hat, carrying a very long high-tech sniper rifle. Humanoid WALK defaults (F1–F4), rifle held across the body, only legs and a subtle bob change.
```
**ACTION — sniper shot**
```
[RULES] Subject: the LOBBYIST (same as walk reference). A SNIPER-SHOT action: F1 raises and shoulders the long rifle, taking aim forward; F2 FIRES — a bright concentrated cyan muzzle flash and a thin straight cyan tracer leaving the barrel, body braced; F3 hard recoil, rifle kicked up, faint cyan smoke at the muzzle; F4 settling the rifle back to aim. Feet planted; only arms/rifle/flash change.
```

## 4) Food Truck (Hellion) — The Garage
*Reference: buildings.png (mechanical/metal style) + a unit for scale.*

**WALK (drive cycle)**
```
[RULES] Subject: the FOOD TRUCK — a small fast armored buggy/food-truck hybrid, steel-grey plating with cyan trim and a roof-mounted flame-nozzle, seen 3/4 from above-front, four chunky wheels. DRIVE CYCLE (4 frames): wheels rotate (spokes at 4 rotation angles), subtle chassis bounce, faint cyan exhaust flicker at the rear; the body design is identical every frame, only wheel rotation + a 1–2px bounce change. No legs.
```
**ACTION — flame cone**
```
[RULES] Subject: the FOOD TRUCK (same as drive reference), stationary. A FLAMETHROWER action: F1 nozzle ignites, small cyan flame at the tip; F2 a wide cyan flame CONE projects forward; F3 the cone at full length and brightness with cyan-white core; F4 flame recedes toward F1. Chassis still; only the flame cone changes.
```

## 5) Auditor (Siege Tank) — The Garage
*Reference: buildings.png + Food Truck (once made).*

**WALK (tread roll, mobile mode)**
```
[RULES] Subject: the AUDITOR — a heavy tracked tank, steel-grey angular armor with cyan accents and a forward cannon, 3/4 from above-front, on two tank treads. ROLL CYCLE (4 frames): the tread pattern scrolls (4 offsets), small chassis vibration, cannon held forward and identical each frame; only tread scroll + tiny shake change. No legs, no wheels.
```
**ACTION — siege fire (deployed)**
```
[RULES] Subject: the AUDITOR (same tank), in DEPLOYED SIEGE stance with stabilizer legs/braces extended and the cannon raised. A SIEGE-FIRE action: F1 braced, cannon charging with a cyan glow at the muzzle; F2 FIRES — large bright cyan muzzle blast and recoil, the whole cannon kicks back; F3 heavy recoil, cyan smoke ring at the muzzle, chassis pushed back; F4 cannon returns and re-braces. Treads/braces planted; only cannon recoil + blast change.
```

## 6) Founder Mech (Thor) — Launch Pad
*Reference: buildings.png + Growth Hacker (armored vibe).*

**WALK (heavy stomp)**
```
[RULES] Subject: the FOUNDER MECH — a massive bipedal battle-mech (a tiny "founder" visible in a cockpit visor), bulky steel-grey armor with cyan power-core accents, twin shoulder cannons and big fists. HEAVY STOMP CYCLE (4 frames): slow weighty walk — F1 left foot planted forward, body low, F2 right foot lifting/passing with a bigger up-bob, F3 right foot stomps forward, F4 passing; arms/cannons sway slightly with the gait. Identical mech every frame; only legs + heavier bob change.
```
**ACTION — cannon barrage**
```
[RULES] Subject: the FOUNDER MECH (same as walk reference), planted. A CANNON-BARRAGE action: F1 shoulder cannons raise and charge with cyan glow; F2 FIRE — both cannons emit bright cyan muzzle blasts, body braced; F3 recoil with cyan smoke and spent-energy flicker; F4 cannons lower to ready. Feet planted; only cannons/blast/recoil change.
```

## 7) Courier Drone (Medivac) — ✈️ Launch Pad
*Reference: buildings.png + Recruiter (once made).*

**WALK (hover/fly cycle)**
```
[RULES] Subject: the COURIER DRONE — a small rounded hover-dropship/quadcopter, steel-grey with cyan underglow and four cyan-glowing thruster rotors, seen 3/4 from above-front, NO legs (it flies). HOVER CYCLE (4 frames): the craft bobs gently up/down (1–3px) and the four rotor-glows pulse/flicker through 4 phases; faint cyan thruster wash beneath; body identical each frame, only bob + rotor glow change.
```
**ACTION — heal beam (airborne)**
```
[RULES] Subject: the COURIER DRONE (same craft), hovering. A HEAL-BEAM action: F1 underside emitter starts glowing cyan; F2 a soft cyan healing beam projects downward-forward with sparkles; F3 beam at full brightness with gentle cyan particles; F4 beam fades. Craft holds a gentle hover; only the beam + glow change.
```

## 8) Buzzword Bomber (Battlecruiser) — ✈️ Launch Pad
*Reference: buildings.png + Courier Drone (once made).*

**WALK (cruise/hover cycle)**
```
[RULES] Subject: the BUZZWORD BOMBER — a large armored airship/capital flyer, steel-grey hull with cyan engine glows and side gun pods, seen 3/4 from above-front, NO legs. CRUISE CYCLE (4 frames): slow majestic hover bob (2–3px) with the rear engine glows pulsing through 4 phases and a faint cyan exhaust trail; hull identical each frame, only bob + engine pulse change.
```
**ACTION — broadside / "Viral Campaign"**
```
[RULES] Subject: the BUZZWORD BOMBER (same airship), hovering. A WEAPONS action: F1 side gun pods + a large bow emitter charge with building cyan glow; F2 FIRE — multiple bright cyan muzzle blasts from the gun pods plus a large bow energy flash; F3 sustained fire, cyan tracers and smoke; F4 weapons cool, glow fades. Hull holds steady; only weapon flashes/glow change.
```

---

## Recolor reminder
After each blue strip, run `RECOLOR` (see [shared-blocks.md](shared-blocks.md)) to produce the
red enemy twin (`unit_<type>_walk_enemy.png` / `unit_<type>_<action>_enemy.png`).
