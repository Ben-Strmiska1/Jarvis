# Jarvis Farm

A small top-down farming sim that runs in the browser. It is plain HTML, CSS and ES-module JavaScript with no dependencies, no build step and no external assets. Open `farm/` from the Jarvis sidebar (🚜 Farm), or serve the repo root and go to `/farm/`.

## How to play
- **Fields:** use the Hoe to till grass, the Seed tool to plant, and the watering can to water. Crops only grow while they are watered. Watering resets every morning unless it rains. Harvest with the Scythe or Hand, then sell at the Market (prices change ±15% daily).
- **Animals:** build a Coop (chickens, ducks) or a Barn (goats, pigs, sheep, cows), then buy animals in the Shop. Feed them every day with the Feed tool or from the building panel. You can buy feed for $4, or mill wheat, corn or soybeans at a Silo (1 → 4 feed). Collect eggs, milk, wool and truffles with Hand.
- **Shop:** sells seeds, tool upgrades (3×1 and 3×3 area), a tractor with plow, seeder, harvester and sprayer attachments, animals, buildings, decorations and furniture. Items unlock as you level up from XP.
- **Build mode (🏗️ / B):** place silos, coops, barns, wells, fences, soil, paths, ponds and decorations. Tap a building to Move, Rotate or Remove it (removing refunds 50%).
- **Home:** upgrade the farmhouse in place from Shack to Cottage, Farmhouse, then Manor. Design the interior on a grid with walls and furniture, and sleep in your bed to start a new day with full energy. If you are still awake at 02:00, you pass out.
- **Saving:** the game autosaves every game hour, when you leave the tab, and when you close the page. It saves to `localStorage` under `farmsim.save`. Menu → Export/Import moves a save between devices.

## Controls
| Action | Mouse / keyboard | Touch |
|---|---|---|
| Use tool on a tile | Click | Tap |
| Pan | Drag, WASD | Drag |
| Zoom | Mouse wheel | Pinch |
| Tile info | Hold 0.5 s | Long-press |
| Pick tool | 1–7 | Tap hotbar |
| Build mode / rotate / cancel | B / R / Esc | Build button, bar buttons |
| Tractor field work | Select the Tractor, drag a rectangle | Same |

Tap the Seed or Tractor tool a second time to choose a crop or an attachment.

## Tests
```sh
python3 -m http.server 8123 &          # from the repo root
NODE_PATH=/opt/node22/lib/node_modules SHOTS=/tmp node farm/tests/smoke.mjs
```
The smoke test drives `window.__farm` along with real mouse and touch input. It fails on any page or console error.
