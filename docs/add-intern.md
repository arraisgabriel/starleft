• Run this in the browser console while a map is loaded:

  mkUnit(G, 'worker', 'player', ((G.camX + innerWidth / 2) / TILE) | 0, ((G.camY + innerHeight / 2) / TILE) | 0); refreshUI();

  It adds one Intern near the center of your current camera view.