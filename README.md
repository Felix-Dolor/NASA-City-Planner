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
| **Map** | Each district has its own colour for its border and name label. Calgary landmarks are drawn 5× size. Real infrastructure is already built and working on its own lots: the five hospitals, the Central Library, Chinook Centre, the University of Calgary and the Glenmore Reservoir. Starting scores still equal the real 2024 CEI, which already includes them. Residents tell short jokes now and then (at most once a minute each). |
| **Two zoom levels** | City view shows districts only. Click a district (or press **Go** on a mission) to zoom in. You can only build in the district you are zoomed into. `Esc` or **◂ City view** goes back. |
| **Lots & zones** | Each district has 4–6 lots: 🏠 Residential, 🏬 Commercial, 🏭 Industrial or 🌳 Open space. Buildings snap to lots, and each building lists the zones it may use. Hold `Shift` and click to rezone a lot (costs money and goodwill). Some residential lots already have a family home: building there means demolition (extra cost, less housing). Locked lots open as you complete missions. Downtown has few, expensive commercial lots; Saddle Ridge, McKenzie Towne and Seton have open land; Forest Lawn and Ogden have industrial lots next to homes. |
| **Ghost preview** | With a building selected, hovering a lot turns it green or red, draws the effect circle and shows a card with every rating that changes (in this district and next door), the homes affected, the cost, upkeep and the change in Calgary Equity. In city view, hovering a district shows the rating changes and outlines it in red if you can't afford it. |
| **Buildings** | 13 buildings, each with trade-offs. Factory, AI Data Centre, CTrain, Hospital, Jobs Hub and Wastewater Plant all have an effect circle that reaches homes across district borders. Factory pollution near homes makes a district worse; a Park within 2.6 km buffers 75% of the harm. CTrain rents rise more in high-rent districts (Downtown, Varsity). |
| **Money** | City revenue is +$6M/min, paid every 5 s, split between districts by population. A district hit by a disaster pays nothing until it is repaired. Every building has upkeep, and some add business tax. The top bar shows the net rate (hover it for the breakdown). Mission grants are the big payouts. |
| **Undo** | Undo your last placement for 8 s with a full refund (`Ctrl+Z` or the button). You can't undo a building that completed a contract. |
| **Missions tab** (default) | Residents give missions: a resident with one waves, glows and has a **!** over their head. Click them (or **Talk** in the list) and the camera zooms in while they pitch it, with **Accept** / **Decline**; the camera then flies back. When a mission succeeds or fails, that resident tells you in a portrait dialogue. Kinds: one metric, two metrics, a whole district, "any 3 more districts", time-limited bonus grants, **planning** missions (a vague complaint like "Our neighbourhood feels unsafe"; use Plan to find the problem; 2× grant) and **build** missions ("Build a X in Y"; pays 1.4× the building's cost). Any accepted mission can be **discarded** for a free replacement. Disasters sit on top as emergencies and can't be discarded. |
| **Plan tab** | Plan view colours districts by band for the chosen metric. Normal view (Missions/Build) shows zones and buildings. The panel lists every real CEI indicator in that metric for the hovered district next to the Calgary average. |
| **Build tab** | A horizontal bar along the bottom: one card per building with a one-line description and its cost. Hover a card for the full effects, risk, zones, upkeep and tax. Buildings that help the active mission come first with a *Helps mission* tag. |
| **Residents** | One resident per district. Their need quotes their district's real CEI numbers ("Only 81% of us have a regular doctor. Across Calgary it's 88%."). They complain when something harms them. Homes inside a pollution circle get a red outline and 😟 faces. |
| **Risk** | An unbuffered polluter that reaches 1,200+ homes sparks a 30-second protest in that district. Three disasters per term (always a flood and the tornado, which roams from district to district) appear on the map as big animated scenes. Each drops one metric a band and stays until you click it and pay to repair it ($5–8M). While it is active, the district pays no revenue and its happiness (Belonging & Safety) drains, and that loss is permanent. |
| **Ending** | The report compares your Calgary with the real 2024 CEI for each of the six metrics, names the biggest gain and the biggest loss (and what caused it), and lists every district. Save your run to the local leaderboard. Final score = Calgary Equity × 100 + leftover budget ($M) × 2. |

**Controls:** scroll wheel or touchpad pinch to zoom, drag or two-finger swipe to pan, `WASD`/arrow keys to move, `Q`/`E` to zoom, `1` `2` `3` for Missions / Plan / Build, `P` to pause, `M` to mute, `Shift`+click to rezone, `Ctrl+Z` to undo, `Enter`/`Space` to continue a message, right-click or `Esc` to cancel. ⚙ Settings has volume, background music and scroll/zoom speed.

**Dev hooks** (for testing and the demo): `index.html#play` skips the opening, `&notips` skips the tutorial, `&go` jumps into the first mission's district with a building picked, `&t=30` sets the seconds left, `&event=flood` (or `fire`, `storm`, `tornado`, `rain`, `lightning`, `earthquake`, `collapse`) fires a disaster (`&event=all` fires every kind), `&orbit` shows the satellite view, and `&end` jumps to the report.

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
js/challenges.js      missions: civilian offers, accept/decline/discard, kinds and grants
js/events.js          disasters: where they strike, the roaming tornado, revenue loss, repairs
js/disaster-sprites.js the disaster art
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
