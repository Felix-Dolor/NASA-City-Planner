# CEI-SAT · Calgary Equity Planner

A city-planning game built on the real **2024 Calgary Equity Index (CEI)**. You orbit Calgary in a satellite, then dive down to street level to place services, plant trees, designate parks and paint zoning — and you're scored on how much more *equitable* you make the city.

## Play

No build step and no dependencies.

- **Quickest:** open `index.html` in a modern browser (Chrome, Edge, Firefox).
- **Or serve it:** `python serve.py`, then open <http://localhost:8765>.

## How it works

| | |
|---|---|
| **Map** | All 288 census tracts from the City's CEI shapefile, coloured by any of 30+ data layers (total score, six domains, proximity to amenities, canopy, heat, walk/transit score, turnout, and more). |
| **Build** | Childcare, grocery, library, pharmacy, school, community centre, clinic, hospital, CTrain station, park, tree groves. Each one improves CEI domain scores within a radius, scaled by how much each tract **lacks** that service (e.g. groceries work best where `proximity_grocerystores` is low and poverty is high). |
| **Zone** | Dense residential, suburban, commercial and industrial on a 250 m grid, each with real trade-offs (density: +walkability/transit, −parks/families/noise; suburbs: +space/kids, −commute/car dependence; industry: +jobs, −health/climate). |
| **Bulldoze** | Removes player buildings, the existing amenities (generated from each tract's proximity scores), or Calgary landmarks. You get money back, but losing a service hurts the people who used it. |
| **Meters** | Six city meters (Economic Opportunity, Accessibility, Health, Belonging & Safety, Social Wellbeing, Climate). They fill as equity-weighted need falls: helping high-need tracts fills them faster. |
| **Score** | Meters + a balance bonus for your *weakest* meter + shrinking the gap between the neediest and least-needy 20% of tracts + mission stars + leftover budget. Saved to a local leaderboard. |
| **Missions** | 10 challenges, including *Code Blue* (best hospital site, graded against a search over the whole city), *Urban Forest*, *Food Deserts*, *Civic Voice*, *Learning Gap*, *Transit-Oriented Density* and *Close the Quadrant Gap*. Placement missions grade you against the best possible locations in the data. |
| **Street level** | Procedural blocks driven by each tract's data (walk score → towers vs houses, canopy → trees, park share → parks), landmarks such as the Calgary Tower, The Bow, the Saddledome, the Central Library, the Peace Bridge and the hospitals, and animated residents. Sick residents and ambulances appear where health need is high; happy faces appear where you've helped. |

Controls: scroll to zoom, drag or right-drag to pan, `WASD`/`QE`, `1`–`9` `P` `T` for building tools, `Z X C I` for zoning, `B` to bulldoze, `L` to cycle data layers, `M` for missions, `Esc` to return to Inspect.

## Project layout

```
index.html, css/style.css
js/data/cei-data.js   generated tract data + geometry (tools/build_data.py)
js/data/geo.js        rivers, roads, CTrain, parks and landmarks (approximate, hand-traced)
js/core.js            namespace, projection, geometry, colour ramps
js/config.js          domains, buildings, zones, overlays, data insights
js/sim.js             effect model, meters, scoring, placements
js/challenges.js      missions and grading
js/world.js           satellite terrain and procedural street blocks
js/sprites.js         oblique pseudo-3D buildings, landmarks, people, cars
js/render.js          camera, layers, agents, particles
js/ui.js, js/game.js  interface, input, game loop
data/raw/             original City of Calgary CSV + census tract shapefile
```

To regenerate the data: `python tools/build_data.py data/raw`.

## Data

City of Calgary, *Calgary Equity Index 2024* ([data.calgary.ca, dataset i6pu-a35d](https://data.calgary.ca/Demographics/Calgary-Equity-Index-2024/i6pu-a35d)), used under the Open Government Licence – City of Calgary. In the CEI, a higher score means **more** need and barriers.

The game's effect model, effect radii and costs are simplified game mechanics. They are not predictions of what real investments would do. River, road and landmark positions are approximate.
