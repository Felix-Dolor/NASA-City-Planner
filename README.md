# CEI-SAT · Calgary Equity Planner

A city-planning game built on the real **2024 Calgary Equity Index (CEI)**. You are Calgary's Planning Director, in command of a planning satellite above the city. You have one 10-minute term to make Calgary the most equitable city on the planet.

## Play

No build step and no dependencies.

- **Quickest:** open `index.html` in a modern browser (Chrome, Edge, Firefox).
- **Or serve it:** `python serve.py`, then open <http://localhost:8765>.

## How it works

| | |
|---|---|
| **Opening** | Two residents talk at street level (click to advance each line), the camera pulls back to orbit where you see CEI-SAT 1, and the Deputy City Manager briefs you. Skippable (button or `Esc`). |
| **Districts** | Calgary's 288 census tracts are grouped into 24 districts named after real communities. Each is rated 0–100 on six metrics: 💼 Economic Opportunity, 🚏 Accessibility & Amenities, ❤️ Population Health, 🤝 Belonging & Safety, 🌱 Human & Social Wellbeing, 🌳 Climate & Environment. |
| **Bands** | Every rating also shows a band with a symbol, so colour is never the only cue: ★ Perfect (80+), ▲ Good (60+), ● Average (40+), ▼ Bad (20+), ✖ Terrible. |
| **Calgary Equity** | The top bar shows *Calgary Equity 49.3/100* with a bar. A white tick marks where you started, and green shows what you've gained. |
| **Two zoom levels** | City view shows districts only. Click a district (or press **Go** on a mission) to zoom in. You can only build in the district you are zoomed into. `Esc` or **◂ City view** goes back. |
| **Lots & zones** | Each district has 4–6 lots: 🏠 Residential, 🏬 Commercial, 🏭 Industrial or 🌳 Open space. Buildings snap to lots, and each building lists the zones it may use. Hold `Shift` and click to rezone a lot (costs money and goodwill). Some residential lots already have a family home: building there means demolition (extra cost, less housing). Locked lots open as you complete missions. Downtown has few, expensive commercial lots; Saddle Ridge, McKenzie Towne and Seton have open land; Forest Lawn and Ogden have industrial lots next to homes. |
| **Ghost preview** | With a building selected, hovering a lot turns it green or red, draws the effect circle and shows a card with every rating that changes (in this district and next door), the homes affected, the cost, upkeep and the change in Calgary Equity. In city view, hovering a district shows the rating changes and outlines it in red if you can't afford it. |
| **Buildings** | 13 buildings, each with trade-offs. Factory, AI Data Centre, CTrain, Hospital, Jobs Hub and Wastewater Plant all have an effect circle that reaches homes across district borders. Factory pollution near homes makes a district worse; a Park within 2.6 km buffers 75% of the harm. CTrain rents rise more in high-rent districts (Downtown, Varsity). |
| **Money** | City revenue is +$6M/min, paid every 5 s. Every building has upkeep, and some add business tax. The top bar shows the net rate (hover it for the breakdown). Mission grants are the big payouts. |
| **Undo** | Undo your last placement for 8 s with a full refund (`Ctrl+Z` or the button). You can't undo a building that completed a contract. |
| **Missions tab** (default) | Contracts from the Deputy City Manager. Each card quotes a real CEI indicator, has a **Go** button (zooms in, opens Plan on the right metric, highlights the district) and a pin on the map. Kinds: one metric, two metrics at once, a whole district, "any 3 more districts", and time-limited bonus grants. The first mission is a guided tutorial. |
| **Plan tab** | Plan view colours districts by band for the chosen metric. Normal view (Missions/Build) shows zones and buildings. The panel lists every real CEI indicator in that metric for the hovered district next to the Calgary average. |
| **Build tab** | Each row says "Main: … Also: …", the effect circle, the risk, allowed zones, cost (with the zoomed district's land price), upkeep and tax. Buildings that help the active mission rise to the top with a *Helps mission* tag. |
| **Residents** | One resident per district. Their need quotes their district's real CEI numbers ("Only 81% of us have a regular doctor. Across Calgary it's 88%."). They complain when something harms them. Homes inside a pollution circle get a red outline and 😟 faces. |
| **Risk** | An unbuffered polluter that reaches 1,200+ homes sparks a 30-second protest in that district. Three random events per term (always one flood or heavy rain, which favours districts with high CEI flood susceptibility and the river districts Bowness and Inglewood) drop one metric in a district by a band. Building the matching building there recovers it. |
| **Ending** | The report compares your Calgary with the real 2024 CEI for each of the six metrics, names the biggest gain and the biggest loss (and what caused it), and lists every district. Save your run to the local leaderboard. Final score = Calgary Equity × 100 + leftover budget ($M) × 2. |

**Controls:** scroll wheel or touchpad pinch to zoom, drag or two-finger swipe to pan, `WASD`/arrow keys to move, `Q`/`E` to zoom, `1` `2` `3` for Missions / Plan / Build, `P` to pause, `M` to mute, `Shift`+click to rezone, `Ctrl+Z` to undo, `Enter`/`Space` to continue a message, right-click or `Esc` to cancel. ⚙ Settings has volume, background music and scroll/zoom speed.

**Dev hooks** (for testing and the demo): `index.html#play` skips the opening, `&notips` skips the tutorial, `&go` jumps into the first mission's district with a building picked, `&t=30` sets the seconds left, `&event=flood` (or `fire`, `storm`, `tornado`, `rain`, `lightning`, `earthquake`, `collapse`) fires an event, `&orbit` shows the satellite view, and `&end` jumps to the report.


## Free placement, zones you can click, map layers

- **No fixed lots.** Pick a building in **Build**, then click anywhere free inside the zoomed-in district. The spot takes its zone from the real land use under the cursor (green ghost = allowed, red = blocked, with the reason). Blocked on water, roads, real facilities, other buildings, and the existing clusters.
- **Click a zone** (residential, commercial, industrial, park) to inspect it: its size, the district's land-use mix, and what is built in it. **Remove** an existing cluster (existing residential, shopping centre, industrial plant) to clear the land (it costs money and changes the ratings; removing a plant cuts pollution but also jobs and tax), or **rezone** the whole zone to another land use.
- Nearby existing neighbourhoods are merged into one bigger group, so a district reads as a few clear areas.
- **Map layers** (bottom right): Residential, Commercial, Industrial, Parks, Amenities, C-Train and Traffic are separate toggles. A layer that is off hides its colour and its buildings. Double-click a layer to see only that one.

## Real map data, zones, traffic and disasters

- **Real geography.** `tools/fetch_osm.py` downloads OpenStreetMap data for Calgary (freeways and arterials, the Bow and Elbow rivers, lakes, parks, the C-Train line and stations, hospitals, libraries, schools and land-use polygons) and writes `js/data/osm.js`. Run `python tools/fetch_osm.py` to refresh it. Map data © OpenStreetMap contributors (ODbL).
- **Actual zones.** Residential, commercial and industrial land use come from the OSM polygons. Houses, towers and sheds only appear on land with the matching zone, and every building lot sits on land that really has its zone. The **Map layers** panel (bottom right) toggles Zones, Traffic and Services.
- **Existing infrastructure.** Real hospitals, libraries, schools and C-Train stations are already on the map (Services layer). They are already counted in the real CEI ratings, and lots keep clear of them.
- **Live traffic.** Thousands of vehicles drive the real roads. Roads are coloured green / amber / red by congestion, which depends on the surrounding land use, the time of day (two rush hours per term), what you build (Jobs Hub and Factory add trips, CTrain stations remove them) and road closures from disasters. Gridlock costs up to 14% of tax revenue.
- **Disasters stay until you act.** Each event has a place, a radius, homes affected, closed roads and a money drain per minute. After 45 s it escalates: it hurts a second rating and spreads to the next district. End it with the matching building, or pay emergency crews. A fix inside 30 s earns a bonus. The **Events** tab (key `4`) lists active incidents, a flood watch built from the real CEI flood indicator, and history. Good news (a festival, a federal grant) also happens.

## Decisions (design notes, Phase 0)

- **Timer:** 10 minutes (game, briefing and title all say 10).
- **Districts:** doubled from 12 to 24, all named after real Calgary communities.
- **Backup:** the pre-revamp playtest build is tagged `demo-backup-v1`.

## Deploying (stable URL)

The game is static files, so any static host works. To use GitHub Pages, push to GitHub and set **Settings → Pages → Source** to **GitHub Actions**. The included `.github/workflows/pages.yml` then publishes the `main` branch on every push. On Netlify or Vercel, deploy the repo root with no build command.

## Tuning

All numbers a designer would want to change are in `js/config.js`: term length, budget, income, upkeep, demolition, rezoning, protests and park buffers; bands; the CEI indicator grouping; zones; buildings (cost, zones, gains, effect circles, risk text); districts (seed point, lots, land price, traits, story, resident); random events; mission settings; and all story text.

## Project layout

```
index.html, css/style.css
js/data/cei-data.js   generated tract data + geometry (tools/build_data.py)
js/data/geo.js        rivers, roads, CTrain, parks and landmarks (approximate, hand-traced)
js/core.js            namespace, projection, geometry, helpers
js/config.js          pacing, economy, bands, metrics, indicators, zones, buildings, districts, events, story
js/sim.js             districts, indicators, homes, lots, effect model, preview, placement, undo, final score
js/challenges.js      mission contracts and grants
js/events.js          random events
js/world.js           flat-colour terrain and sparse city fabric
js/sprites.js         isometric buildings, lots, landmarks, residents, the satellite
js/residents.js       resident wandering, needs, thanks and complaints
js/render.js          camera, Plan overlay, borders, lots, effect circles, objects, daylight, particles
js/audio.js           sound effects and background music (one master volume / mute)
js/ui.js, js/game.js  interface, report, leaderboard, tutorial, input, opening, game loop
data/raw/             original City of Calgary CSV + census tract shapefile
```

To regenerate the data: `python tools/build_data.py data/raw`.

## Data

City of Calgary, *Calgary Equity Index 2024* ([data.calgary.ca, dataset i6pu-a35d](https://data.calgary.ca/Demographics/Calgary-Equity-Index-2024/i6pu-a35d)), used under the Open Government Licence – City of Calgary. In the CEI, a higher score means **more** need and barriers; the game flips this so a higher rating is better. Indicators are grouped under the six domains by theme. District values are simple averages of their tracts. Population and home counts are estimates (about 4,500 people per tract).

The game's effect model, costs, grants and events are simplified game mechanics. They are not predictions of what real investments would do. River, road and landmark positions are approximate.
