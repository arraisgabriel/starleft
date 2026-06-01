Plan on how to create a new dialog system for the game.

The dialog will be seen in game world, and it will be a dialog window that will be shown above the head of the unit when it needs to say or think something.

At first it will be used to render text when a unit is single selected by the player, for instance when an intern is selected to mine or build something.

And also will be used to render unit dialog when a new lore event is triggered by the unit level increase.

Each unit type MUST have it's own possible dialog lines:

The "unit selected" dialog MUST be random selected from a pool of **pre generated 25 lines for each unit type**. Plan on how to generate and wire this new static "unit selected" dialog lines pool. For instance the unit type "intern" can say "Huh? What am I supposed to do, i'm confused". All dialogs MUST have clear connections to the unit type role in a company, add a pinch of dark comedy to the dialogs.

The "lore event" dialogs MUST be constructed from the lore event text, and have a direct connection with each possible generated "lore event". The unit MUST speak about the occured event in a dark, sometimes funny way. So the "lore event" dialogs are procedurally generated like the "lore event" text at game runtime.

The dialog text MUST have a approximate maximum letter count in order to not occupy a big space on screen. Make the soft limit, something around 50 characters. It is not possible to calculate a hard limit for "lore event" dialogs because there are unknown parts to it that will be filled in-game runtime.

The dialog text box MUST appear on top of the unit's head, and be on screen for something like 8 seconds. it MUST be a tiny, but readable box with a functional but not bloating text box.



Future updates will add more dialog types, so make "unit selected" and "lore event" as the first two types, more will be added on the future.