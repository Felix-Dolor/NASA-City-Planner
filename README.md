# CEI-SAT · Calgary Equity Planner

A city-planning game built on the real **2024 Calgary Equity Index (CEI)**. You are Calgary's Planning Director, in command of a planning satellite above the city. You have one 8-minute term to make Calgary the most equitable city on the planet.

## Play

No build step and no dependencies.

- **Quickest:** open `index.html` in a modern browser (Chrome, Edge, Firefox).
- **Or serve it:** `python serve.py`, then open <http://localhost:8765>.

## How it works

| | |
|---|---|
| **Opening** | Two residents talk at street level, the camera pulls back to orbit, and the Deputy City Manager briefs you. Skippable (button or `Esc`). |
| **Districts** | Calgary's 288 census tracts are grouped into 12 districts. Each district is rated on six metrics: 💼 Economic Opportunity, 🚏 Accessibility & Amenities, ❤️ Population Health, 🤝 Belonging & Safety, 🌱 Human & Social Wellbeing, 🌳 Climate & Environment. |
| **Bands** | Ratings are shown as bands, never numbers: Perfect (80–100), Good (60–79), Average (40–59), Bad (20–39), Terrible (0–19). |
| **Build tab** | Ten buildings, each with a cost and the metrics it improves. Pick one, then click the map. A building raises the metrics of the district it stands in. |
| **Plan tab** | Colours every district by its band for the chosen metric. Hover a district to see all six ratings. |
| **Missions tab** | Contracts from the Deputy City Manager, such as "Bring Population Health in Forest Lawn to Average". Finishing one pays a grant. |
| **Residents** | One resident per district wanders their neighbourhood. Hover or click them to hear what they need; it follows their district's weakest metric. |
| **Ending** | When the timer runs out, the Deputy City Manager delivers a report card. Final score = overall equity × 100 + leftover budget ($M) × 2. |

Controls: scroll to zoom, drag to pan, `WASD`/arrow keys to move, `Q`/`E` to zoom, `1` `2` `3` for the Build / Plan / Missions tabs, `Enter` or `Space` to continue a message, right-click or `Esc` to cancel a building.

For testing, `index.html#play` skips the opening, `#play&t=30` sets the seconds left, and `#play&end` jumps to the report card.

## Tuning

All numbers a designer would want to change are in `js/config.js`: term length, starting budget, income, building costs and gains, band thresholds and colours, mission count and grant sizes, final score weights, district and resident definitions, and all story text.

## Project layout

```
index.html, css/style.css
js/data/cei-data.js   generated tract data + geometry (tools/build_data.py)
js/data/geo.js        rivers, roads, CTrain, parks and landmarks (approximate, hand-traced)
js/core.js            namespace, projection, geometry, helpers
js/config.js          pacing, bands, metrics, buildings, districts, residents, story text
js/sim.js             districts, scores, placement rules, final score
js/challenges.js      mission contracts and grants
js/world.js           satellite terrain and sparse city fabric
js/sprites.js         isometric buildings, landmarks, residents
js/residents.js       resident wandering, needs and thanks
js/render.js          camera, overlay, borders, objects, particles
js/ui.js, js/game.js  interface, Deputy City Manager panel, input, opening, game loop
data/raw/             original City of Calgary CSV + census tract shapefile
```

To regenerate the data: `python tools/build_data.py data/raw`.

## Data

City of Calgary, *Calgary Equity Index 2024* ([data.calgary.ca, dataset i6pu-a35d](https://data.calgary.ca/Demographics/Calgary-Equity-Index-2024/i6pu-a35d)), used under the Open Government Licence – City of Calgary. In the CEI, a higher score means **more** need and barriers; the game flips this so that a higher rating is better.

The game's effect model, costs and grants are simplified game mechanics. They are not predictions of what real investments would do. River, road and landmark positions are approximate.
