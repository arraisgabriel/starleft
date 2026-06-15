# Episode VIII Career Unit Limit

Episode VIII currently allows **5 normal veteran units** to carry over into the mission.

## Where The Limit Comes From

- The cap is defined in [`js/career.js`](/Users/gabriel.bussular/Workspace/starleft/js/career.js) by:

```js
function vetCarryCountFor(idx){ return 2 + Math.floor(Math.max(0, idx-1)/2); }
```

- Episode VIII is map index `7` in [`js/maps_data.js`](/Users/gabriel.bussular/Workspace/starleft/js/maps_data.js), so:

```js
vetCarryCountFor(7) === 5
```

## What Counts Toward It

- Normal veteran units count toward the cap.
- Named heroes do not count toward the normal veteran limit. They use the separate hero carryover track.

## Where To Change It

1. Edit [`js/career.js`](/Users/gabriel.bussular/Workspace/starleft/js/career.js) if you want to change the carry rule itself.
2. Edit [`js/maps_data.js`](/Users/gabriel.bussular/Workspace/starleft/js/maps_data.js) if you want to reorder maps or change which episode index a mission uses.
3. Update [`js/ui.js`](/Users/gabriel.bussular/Workspace/starleft/js/ui.js) and [`js/net/mp.js`](/Users/gabriel.bussular/Workspace/starleft/js/net/mp.js) if you change the rule in a way that should stay in sync with the victory chooser or multiplayer host flow.

## How To Find The Relevant Code Quickly

- Search for `vetCarryCountFor` to find the source of truth for the cap.
- Search for `Episode VIII` in `js/maps_data.js` to confirm the episode index and map entry.
- Search for `setCarryover(` to see where the selected units are truncated before the next mission starts.

## Practical Change Examples

- To make Episode VIII allow 6 units instead of 5, change the carry formula in `js/career.js`.
- To make Episode VIII a special case without changing other episodes, branch on `idx === 7` inside `vetCarryCountFor`.
- To make heroes count toward the limit, remove the hero exclusion in the HUB/carry selection paths that filter `!e.hero`.
