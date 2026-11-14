// Game tuning: domains, buildings, zones, overlays and data insights.
(function () {
  const CP = window.CP;

  CP.START_BUDGET = 900; // $M
  CP.STAR_POINTS = 150; // per mission star

  // Order matches CEI_DATA.domains. In the CEI a HIGHER score means MORE need / barriers.
  CP.DOMAINS = [
    { key: "econ", label: "Economic Opportunity", short: "Economy", icon: "💼", color: "#f5b942" },
    { key: "access", label: "Accessibility & Amenities", short: "Access", icon: "🚏", color: "#46b8f0" },
    { key: "health", label: "Population Health", short: "Health", icon: "❤️", color: "#f25f7a" },
    { key: "belong", label: "Belonging & Safety", short: "Belonging", icon: "🤝", color: "#b28cff" },
    { key: "social", label: "Human & Social Wellbeing", short: "Wellbeing", icon: "🌱", color: "#58d68d" },
    { key: "climate", label: "Climate & Environment", short: "Climate", icon: "🌳", color: "#2ec4a6" },
  ];
  const E = (econ, access, health, belong, social, climate) => [econ, access, health, belong, social, climate];

  // effects: domain "points" applied to every tract inside `radius` (linear falloff),
  // multiplied by rel(t) - how much that tract actually lacks this service (0..~1.3).
  // Negative effects are real costs (noise, land, churn) and are NOT scaled by rel.
  CP.BUILDINGS = {
    childcare: {
      name: "Childcare Centre", icon: "🧸", cost: 6, radius: 1600, color: "#ff9fd0", h: 8, key: "1",
      gain: E(5, 6, 0, 1, 5, 0), cost_fx: E(0, 0, 0, 0, 0, 0),
      rel: (n) => 0.55 * n.lackChildcare + 0.65 * n.children,
      why: "Parents (often women) can return to work; kids get an early start. Best where there are many children and few spaces.",
    },
    grocery: {
      name: "Grocery Store", icon: "🛒", cost: 12, radius: 1800, color: "#7ed957", h: 9, key: "2",
      gain: E(2, 8, 5, 1, 1, 0), cost_fx: E(0, 0, 0, 0, 0, 0.5),
      rel: (n) => 0.65 * n.lackGrocery + 0.45 * n.poverty,
      why: "Fixes food deserts. Fresh food lowers diabetes risk. Best where proximity to groceries is low and poverty is high.",
    },
    library: {
      name: "Library", icon: "📚", cost: 22, radius: 2600, color: "#ffd166", h: 12, key: "3",
      gain: E(3, 5, 0, 6, 7, 0), cost_fx: E(0, 0, 0, 0, 0, 0),
      rel: (n) => 0.45 * n.lackLibrary + 0.35 * n.noCert + 0.35 * n.lowVote,
      why: "Free space, internet, newcomer and literacy programs. Tracts with low voter turnout and many adults without a diploma gain the most.",
    },
    pharmacy: {
      name: "Pharmacy", icon: "💊", cost: 4, radius: 1400, color: "#6ee7f9", h: 7, key: "4",
      gain: E(0, 4, 6, 0, 1, 0), cost_fx: E(0, 0, 0, 0, 0, 0),
      rel: (n) => 0.55 * n.lackPharmacy + 0.5 * n.diabetes,
      why: "Medication access for chronic illness. Diabetes is 0.87 correlated with overall need.",
    },
    school: {
      name: "School", icon: "🏫", cost: 38, radius: 2400, color: "#f4a261", h: 12, key: "5",
      gain: E(6, 5, 1, 3, 8, 0), cost_fx: E(0, 0, 0, 0, 0, 0.5),
      rel: (n) => 0.35 * n.lackSchool + 0.45 * n.children + 0.35 * n.noCert,
      why: "No-certificate rate is the single indicator most tied to need (0.91). New suburbs with lots of kids also lack schools.",
    },
    clinic: {
      name: "Health Clinic", icon: "🩺", cost: 14, radius: 2200, color: "#ff8fa3", h: 9, key: "6",
      gain: E(1, 3, 8, 1, 1, 0), cost_fx: E(0, 0, 0, 0, 0, 0),
      rel: (n) => n.healthGap,
      why: "Gives people a regular care provider. Cheaper than a hospital but smaller reach.",
    },
    hospital: {
      name: "Hospital", icon: "🏥", cost: 180, radius: 6500, color: "#ff5c7a", h: 34, key: "7", big: true,
      gain: E(4, 6, 17, 2, 2, 0), cost_fx: E(0, 0, 0, 1, 0, 1.5),
      rel: (n) => n.healthGap,
      why: "Huge reach - but costly, and sirens add noise. Put it where proximity to healthcare is low AND few people have a regular provider.",
    },
    transit: {
      name: "CTrain Station", icon: "🚉", cost: 45, radius: 1700, color: "#4dabf7", h: 8, key: "8",
      gain: E(6, 9, 0, 0, 2, 3), cost_fx: E(0, 0, 0, 1.5, 0, 1),
      rel: (n) => 0.6 * n.lowTransit + 0.5 * n.longCommute + 0.2 * n.poverty,
      why: "Cuts commute times and car dependence. Adds noise and churn near the platform.",
    },
    community: {
      name: "Community Centre", icon: "🤝", cost: 10, radius: 2000, color: "#c39bff", h: 9, key: "9",
      gain: E(1, 2, 2, 8, 5, 0), cost_fx: E(0, 0, 0, 0, 0, 0),
      rel: (n) => 0.55 * n.lowVote + 0.5 * n.lowBelonging + 0.2 * n.churn,
      why: "Voter turnout is the strongest 'good' signal in the data (-0.76 with need). Gathering spaces build it.",
    },
    park: {
      name: "Park", icon: "⛲", cost: 5, radius: 1100, color: "#52c27a", h: 0, key: "P",
      gain: E(0, 2, 4, 3, 2, 7), cost_fx: E(1, 0, 0, 0, 0, 0),
      rel: (n) => 0.6 * n.lackPark + 0.4 * n.heat + 0.2 * n.lackParkProx,
      why: "Cools heat islands and gives dense areas breathing room. One Beltline tract has 0% park area. Costs a bit of developable land.",
    },
    trees: {
      name: "Plant Trees", icon: "🌳", cost: 0.4, radius: 700, color: "#2f9e44", h: 0, key: "T", brush: true,
      gain: E(0, 0, 1.5, 0.5, 0, 5), cost_fx: E(0, 0, 0, 0, 0, 0),
      rel: (n) => 0.7 * n.lowCanopy + 0.45 * n.heat,
      why: "Canopy follows money and age: new suburbs sit under 0.5%, Glenmore Park has 37.6%. Plant where it is hot and bare.",
    },
  };

  // Zones are painted on the 250 m planning grid.
  CP.ZONE_CELL = 250;
  CP.ZONES = {
    dense: {
      name: "Dense Residential", icon: "🏢", cost: 1.5, color: "#ff7b54", key: "Z",
      gain: E(2, 5, 0, 0, 0, 1), cost_fx: E(0, 0, 0.5, 2, 1.5, 2),
      rel: (n) => 0.5 + 0.6 * n.transit,
      penalty: (n) => 0.6 + 1.2 * n.children,
      why: "Density buys walkability and transit, but costs noise, park space and families. Walkable tracts have few kids (-0.47).",
    },
    suburban: {
      name: "Suburban Residential", icon: "🏡", cost: 1, color: "#ffd93d", key: "X",
      gain: E(0, 0, 1, 3, 2.5, 0), cost_fx: E(0, 3, 0, 0, 0, 2),
      rel: (n) => 0.5 + 0.6 * n.children,
      penalty: (n) => 0.6 + 0.8 * n.carDependent,
      why: "Suburbs buy space and children, but cost commute time and car dependence (walkability vs driving: -0.67).",
    },
    commercial: {
      name: "Commercial", icon: "🏬", cost: 2, color: "#4dabf7", key: "C",
      gain: E(5, 2, 0, 0, 0.5, 0), cost_fx: E(0, 0, 0, 1, 0, 1),
      rel: (n) => 0.5 + 0.7 * n.unemployment,
      penalty: () => 1,
      why: "Local jobs and shops. Some traffic, and more transient foot traffic.",
    },
    industrial: {
      name: "Industrial", icon: "🏭", cost: 2.5, color: "#a0a0b0", key: "I",
      gain: E(8, 0, 0, 0, 0.5, 0), cost_fx: E(0, 0, 3, 1, 0, 5),
      rel: (n) => 0.5 + 0.7 * n.unemployment,
      penalty: (n) => 0.7 + 0.6 * n.heat,
      why: "Big employment boost, but heat, noise and pollution land on whoever lives next door.",
    },
  };

  // Overlay layers. `fn(t)` returns a value, `good` = higher is better (colour inverted).
  const f = (k) => (t) => t[k];
  CP.OVERLAYS = [
    { id: "total", group: "Equity Index", label: "Total Equity Score (need)", fn: (t) => t.live.total, min: 15, max: 80, unit: "" },
    { id: "d0", group: "Equity Index", label: "Economic Opportunity need", fn: (t) => t.live.need[0], min: 0, max: 100 },
    { id: "d1", group: "Equity Index", label: "Accessibility need", fn: (t) => t.live.need[1], min: 0, max: 100 },
    { id: "d2", group: "Equity Index", label: "Population Health need", fn: (t) => t.live.need[2], min: 0, max: 100 },
    { id: "d3", group: "Equity Index", label: "Belonging & Safety need", fn: (t) => t.live.need[3], min: 0, max: 100 },
    { id: "d4", group: "Equity Index", label: "Social Wellbeing need", fn: (t) => t.live.need[4], min: 0, max: 100 },
    { id: "d5", group: "Equity Index", label: "Climate & Environment need", fn: (t) => t.live.need[5], min: 0, max: 100 },
    { id: "impact", group: "Equity Index", label: "Your impact (change in total)", fn: (t) => t.base.total - t.live.total, min: -4, max: 4, diverging: true },
    { id: "healthGap", group: "Health", label: "Healthcare gap (challenge)", fn: (t) => t.n.healthGap * 100, min: 0, max: 100, unit: "" },
    { id: "proximity_healthcare", group: "Health", label: "Proximity to healthcare", fn: f("proximity_healthcare"), min: 0, max: 0.3, good: true },
    { id: "regular_care_provider_yes_perc", group: "Health", label: "Has regular care provider %", fn: f("regular_care_provider_yes_perc"), min: 68, max: 100, good: true, unit: "%" },
    { id: "diabetes_agestd_perc", group: "Health", label: "Diabetes prevalence %", fn: f("diabetes_agestd_perc"), min: 3, max: 12, unit: "%" },
    { id: "tree_canopy", group: "Environment", label: "Tree canopy %", fn: f("tree_canopy"), min: 0, max: 30, good: true, unit: "%" },
    { id: "land_surface_temp", group: "Environment", label: "Land surface temperature", fn: f("land_surface_temp"), min: 22, max: 28.6, unit: "°C" },
    { id: "park_area_perc", group: "Environment", label: "Park area %", fn: f("park_area_perc"), min: 0, max: 30, good: true, unit: "%" },
    { id: "noise_pollution_score", group: "Environment", label: "Noise pollution", fn: f("noise_pollution_score"), min: 2, max: 20 },
    { id: "proximity_grocerystores", group: "Amenities", label: "Proximity to grocery", fn: f("proximity_grocerystores"), min: 0, max: 0.2, good: true },
    { id: "proximity_childcare", group: "Amenities", label: "Proximity to childcare", fn: f("proximity_childcare"), min: 0, max: 0.5, good: true },
    { id: "proximity_library", group: "Amenities", label: "Proximity to library", fn: f("proximity_library"), min: 0, max: 0.15, good: true },
    { id: "proximity_pharmacies", group: "Amenities", label: "Proximity to pharmacies", fn: f("proximity_pharmacies"), min: 0, max: 0.12, good: true },
    { id: "proximity_primary_education", group: "Amenities", label: "Proximity to schools", fn: f("proximity_primary_education"), min: 0, max: 0.25, good: true },
    { id: "average_walkscore", group: "Mobility", label: "Walk Score", fn: f("average_walkscore"), min: 0, max: 100, good: true },
    { id: "average_transitscore", group: "Mobility", label: "Transit Score", fn: f("average_transitscore"), min: 20, max: 85, good: true },
    { id: "average_commute_time", group: "Mobility", label: "Commute time (min)", fn: f("average_commute_time"), min: 18, max: 32, unit: " min" },
    { id: "children_perc", group: "People", label: "Children (0-14) %", fn: f("children_perc"), min: 3, max: 30, neutral: true, unit: "%" },
    { id: "seniors_65_perc", group: "People", label: "Seniors (65+) %", fn: f("seniors_65_perc"), min: 2, max: 35, neutral: true, unit: "%" },
    { id: "voter_turnout_rate", group: "People", label: "Voter turnout %", fn: f("voter_turnout_rate"), min: 23, max: 62, good: true, unit: "%" },
    { id: "educ_no_cert_perc", group: "People", label: "No certificate/diploma %", fn: f("educ_no_cert_perc"), min: 2, max: 25, unit: "%" },
    { id: "population_in_poverty_perc", group: "People", label: "Population in poverty %", fn: f("population_in_poverty_perc"), min: 2, max: 25, unit: "%" },
    { id: "renter_households_perc", group: "People", label: "Renter households %", fn: f("renter_households_perc"), min: 0, max: 90, neutral: true, unit: "%" },
    { id: "person_crime_rate", group: "People", label: "Person crime rate", fn: f("person_crime_rate"), min: 0, max: 1500 },
  ];

  CP.INSIGHTS = [
    { title: "The spread is huge", text: "Total equity scores run from 16.8 (Elbow Park / Upper Mount Royal) to 78.1 (Forest Lawn), with a median of 39.3.", overlay: "total" },
    { title: "Quadrants are unequal", text: "The NE averages 54.5 against 36.6 in the SW. The NE also has the least tree canopy (7% vs 15.5%) and the lowest voter turnout (38% vs 48%).", overlay: "total" },
    { title: "Walkability isn't equity", text: "Walk score barely tracks equity (correlation 0.08). The Beltline scores 98 and Alpine Park scores 1, yet both sit mid-table.", overlay: "average_walkscore" },
    { title: "Walkable areas have few kids", text: "Correlation -0.47. Beltline tracts are 4-5% children; Auburn Bay is up to 34.5%.", overlay: "children_perc" },
    { title: "Trees follow money and age", text: "Canopy tracks income inequality (0.58) and seniors (0.53). Cornerstone and Carrington are under 0.5%; Glenmore Park / Oakridge is 37.6%.", overlay: "tree_canopy" },
    { title: "Rich areas are internally unequal", text: "Upper Mount Royal has the highest income inequality ratio (13.7) but one of the best overall scores.", overlay: "total" },
    { title: "Voting is the strongest good signal", text: "Voter turnout correlates -0.76 with overall need. It ranges from 23% in Penbrooke Meadows to 62% in Lakeview.", overlay: "voter_turnout_rate" },
    { title: "Education and health move with need", text: "Adults with no certificate (0.91) and diabetes rate (0.87) are the indicators most tied to the overall score.", overlay: "educ_no_cert_perc" },
    { title: "Downtown is a trade-off", text: "The core has the best transit (score 82, up to 30% transit commuting) but also the most noise, the fewest parks (0% in one Beltline tract) and the highest crime rates.", overlay: "noise_pollution_score" },
    { title: "Renting means churn", text: "Renter share and 'moved in the last year' correlate at 0.71. Beltline tracts turn over about a third of residents a year.", overlay: "renter_households_perc" },
  ];
})();
