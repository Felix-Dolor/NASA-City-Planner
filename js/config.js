// Game tuning: pacing, economy, equity bands, metrics, CEI indicators, zones, buildings, districts,
// residents, random events and story text. Everything a designer would want to tweak lives in this file.
(function () {
  const CP = window.CP;

  // ---------- pacing & economy ----------
  CP.TERM_SECONDS = 300; // length of the term (5 minutes for the presentation demo); pauses while the Deputy City Manager is talking
  // Presentation demo: a scripted run that hits the story beats in order (see js/demo.js).
  //   1. Forest Lawn mission (Belonging + Wellbeing): needs a Community Centre AND a Library.
  //   2. A planning mission (two hidden metrics) appears in the first slot: Falconridge, Health + Wellbeing
  //      (a Clinic and a School).
  //   3. When it is done a house fire breaks out; the camera holds on it until the presenter clicks or presses a key.
  //   4. With chaosAt seconds left, every kind of disaster hits at once. Then the timer ends and the scoreboard shows.
  // Random disasters are switched off and the coach marks are skipped. Set CP.DEMO = null for the normal game.
  CP.DEMO = {
    first: { district: "Forest Lawn", metrics: [3, 4], target: 40 },
    second: { district: "Falconridge", metrics: [2, 4], target: 40,
      quote: "People around here keep getting sick, and our kids are falling behind." },
    fire: { district: "Marlborough", type: "fire" },
    chaosAt: 45, // seconds left on the timer when everything goes wrong
    chaos: ["flood", "tornado", "storm", "earthquake", "lightning", "collapse", "rain"],
    chaosGap: 0.9, // seconds between each disaster
  };
  CP.START_BUDGET = 30; // $M - enough for 2-3 buildings
  CP.INCOME_PER_MIN = 6; // $M per minute of city revenue (paid in small amounts every few seconds)
  CP.PAYOUT_EVERY = 5; // seconds between revenue/upkeep payouts
  CP.UNDO_SECONDS = 8; // how long a placement can be undone for a full refund
  CP.DEMOLISH = { cost: 3, gain: [0, 0, 0, -2, -4, 0] }; // building over an existing house: extra cost + lost housing equity
  CP.REZONE = { cost: 3, goodwill: 3 }; // rezoning a lot: extra cost + Belonging & Safety lost in that district
  CP.PROTEST = { seconds: 30, homes: 1200 }; // an unbuffered harmful building reaching this many homes sparks a protest
  CP.PARK_BUFFER = 2600; // metres: a park this close to a polluter absorbs most of its harm
  CP.BUFFER_KEEP = 0.25; // share of the harm that still gets through a park buffer
  CP.PEOPLE_PER_TRACT = 4500; // Calgary 2021: ~1.3M people in 288 census tracts
  CP.PEOPLE_PER_HOME = 2.6;
  CP.FINAL = { perEquityPoint: 100, perBudgetM: 2 }; // final score = equity * 100 + leftover $M * 2
  CP.MISSIONS = {
    active: 3, // accepted missions you can hold at once
    offers: 2, // civilians on the map with a "!" waiting to give you a mission
    offerDelay: 6, // seconds before a new civilian offer appears after one is taken or declined
    grantBase: 12, // $M
    grantPerPoint: 0.7, // + $M per metric point the contract asks for
    districtGrantPerPoint: 0.5, // same, for "raise the whole district" contracts (points summed over 6 metrics)
    timedSeconds: 100, // time limit on bonus contracts (starts when you accept)
    timedBonus: 1.6, // grant multiplier on bonus contracts
    planBonus: 2, // planning missions pay this many times a standard mission
    buildBonus: 1.4, // build missions pay this many times the building's cost
    unlockEvery: 2, // locked lots open after every N completed contracts
  };
  CP.EVENTS = { count: 3, from: 0.2, to: 0.85 }; // disasters per term, spread between 20% and 85% of the term
  // A disaster stays until the player repairs it. Meanwhile its district pays no revenue and its
  // residents' happiness (Belonging & Safety) slowly drops; happiness lost while waiting does not come back.
  CP.DISASTER = { moodMetric: 3, moodPerSec: 0.12, moodMax: 12, tornadoSpeed: 95 };
  CP.CIVILIANS = { jokeGap: 60, jokeEvery: [9, 16], jokeSeconds: 6.5 }; // per-civilian gap, citywide pacing, bubble life

  // ---------- equity bands ----------
  // Every score is 0-100 (higher = more equitable). Each band also has a symbol so it never relies on colour alone.
  CP.BANDS = [
    { name: "Terrible", min: 0, color: "#e03131", ink: "#fff", sym: "✖" },
    { name: "Bad", min: 20, color: "#ff9a8d", ink: "#3a0d0a", sym: "▼" },
    { name: "Average", min: 40, color: "#f5d142", ink: "#3a2f00", sym: "●" },
    { name: "Good", min: 60, color: "#3fa650", ink: "#fff", sym: "▲" },
    { name: "Perfect", min: 80, color: "#19f07a", ink: "#003a18", sym: "★" },
  ];
  CP.bandIndex = (s) => CP.clamp(Math.floor(s / 20), 0, 4);
  CP.bandOf = (s) => CP.BANDS[CP.bandIndex(s)];
  // band chip: symbol + name, and optionally the score (opts.num)
  CP.chip = (s, num) => {
    const b = CP.bandOf(s);
    return `<span class="band" style="background:${b.color};color:${b.ink}"><i>${b.sym}</i> ${b.name}${num ? ` <b>${Math.round(s)}</b>` : ""}</span>`;
  };

  // How raw CEI domain scores (higher = more need) become 0-100 equity scores:
  // each tract is placed between Calgary's 5th and 95th percentile tract for that domain.
  CP.SCORE_SCALE = { best: 90, span: 80, min: 5, max: 95 };

  // ---------- the 6 equity metrics (order matches CEI_DATA.domains) ----------
  CP.DOMAINS = [
    { key: "econ", label: "Economic Opportunity", short: "Economy", icon: "💼", color: "#f5b942",
      plain: "Can people here find good jobs and earn enough to live on? This looks at work, incomes and poverty." },
    { key: "access", label: "Accessibility & Amenities", short: "Access", icon: "🚏", color: "#46b8f0",
      plain: "How easy is it to reach everyday things like groceries, schools, childcare and transit without a long trip?" },
    { key: "health", label: "Population Health", short: "Health", icon: "❤️", color: "#f25f7a",
      plain: "How healthy are the people who live here, and can they see a doctor when they need one?" },
    { key: "belong", label: "Belonging & Safety", short: "Belonging", icon: "🤝", color: "#b28cff",
      plain: "Do people feel safe, welcome and connected to their neighbours?" },
    { key: "social", label: "Human & Social Wellbeing", short: "Wellbeing", icon: "🌱", color: "#58d68d",
      plain: "Are people getting the education, housing and support they need to do well in life?" },
    { key: "climate", label: "Climate & Environment", short: "Climate", icon: "🌳", color: "#2ec4a6",
      plain: "Trees, parks and clean air, and how well the area copes with heat, noise and floods." },
  ];
  const E = (econ, access, health, belong, social, climate) => [econ, access, health, belong, social, climate];

  // ---------- real CEI indicators, grouped under the six metrics ----------
  // dir: +1 higher is better, -1 lower is better, 0 = context (who lives here). fmt: how the value is shown.
  // Labels follow the City of Calgary field aliases (2024_CEI_Data_Field_Names_Alias.csv).
  const I = (key, domain, dir, fmt, label) => ({ key, domain, dir, fmt, label });
  CP.INDICATORS = [
    I("lim_at_perc", 0, -1, "pct", "Low income (after tax)"),
    I("population_in_poverty_perc", 0, -1, "pct", "Population in poverty"),
    I("unemployment_rate_perc", 0, -1, "pct", "Unemployment rate"),
    I("working_poor_18to64_perc", 0, -1, "pct", "Working poor"),
    I("social_assistance_perc", 0, -1, "pct", "On social assistance"),
    I("part_time_employment_perc", 0, -1, "pct", "Part-time or part-year work"),
    I("seniors_in_poverty_perc", 0, -1, "pct", "Seniors in poverty"),
    I("single_parent_econ_dependency", 0, -1, "num", "Single-parent economic dependency"),
    I("gender_income_ratio", 0, 1, "ratio", "Gender income ratio"),
    I("income_inequality_ratio", 0, -1, "ratio", "Income inequality (P90/P10)"),

    I("average_walkscore", 1, 1, "score", "Walk Score"),
    I("average_transitscore", 1, 1, "score", "Transit Score"),
    I("proximity_grocerystores", 1, 1, "idx", "Proximity to grocery stores"),
    I("proximity_healthcare", 1, 1, "idx", "Proximity to healthcare"),
    I("proximity_pharmacies", 1, 1, "idx", "Proximity to pharmacies"),
    I("proximity_childcare", 1, 1, "idx", "Proximity to childcare"),
    I("proximity_library", 1, 1, "idx", "Proximity to a library"),
    I("proximity_primary_education", 1, 1, "idx", "Proximity to primary schools"),
    I("proximity_secondary_education", 1, 1, "idx", "Proximity to secondary schools"),
    I("spatial_access_primary_secondary_education_transit", 1, 1, "idx", "School access by transit"),
    I("average_commute_time", 1, -1, "min", "Commute time"),
    I("commute_transit_perc", 1, 1, "pct", "Commute by transit"),

    I("regular_care_provider_yes_perc", 2, 1, "pct", "Has a regular health care provider"),
    I("perceived_health_vg_excellent_perc", 2, 1, "pct", "Very good or excellent health"),
    I("perceived_mental_vg_excellent_perc", 2, 1, "pct", "Very good or excellent mental health"),
    I("diabetes_agestd_perc", 2, -1, "pct", "Diabetes"),
    I("copd_agestd_perc", 2, -1, "pct", "COPD"),
    I("mental_illness_agestd_perc", 2, -1, "pct", "Mental illness"),
    I("activity_limitation_relative_severity_perc", 2, -1, "pct", "Activity limitation (severity)"),

    I("sense_of_belonging_perc", 3, 1, "pct", "Sense of belonging"),
    I("person_crime_rate", 3, -1, "rate", "Person crime rate"),
    I("property_crime_rate", 3, -1, "rate", "Property crime rate"),
    I("social_disorder_rate", 3, -1, "rate", "Social disorder rate"),
    I("physical_disorder_rate", 3, -1, "rate", "Physical disorder rate"),
    I("voter_turnout_rate", 3, 1, "pct", "Municipal voter turnout"),
    I("movers_1_year_ago", 3, -1, "pct", "Moved in the last year"),

    I("educ_no_cert_perc", 4, -1, "pct", "No certificate, degree or diploma"),
    I("youth_neet_perc", 4, -1, "pct", "Youth not in work, education or training"),
    I("core_housing_renter_perc", 4, -1, "pct", "Core housing need (renters)"),
    I("core_housing_owner_perc", 4, -1, "pct", "Core housing need (owners)"),
    I("no_official_languages_perc", 4, -1, "pct", "No English or French"),
    I("adult_litp", 4, -1, "pct", "Low-income transit pass (adults)"),
    I("seniors_living_alone_perc", 4, -1, "pct", "Seniors living alone"),
    I("single_parent_woman_perc", 4, 0, "pct", "Single-parent (woman+) households"),
    I("recent_immigration_perc", 4, 0, "pct", "Recent immigrants"),
    I("refugee_perc", 4, 0, "pct", "Refugees"),
    I("indigenous_perc", 4, 0, "pct", "Indigenous identity"),

    I("tree_canopy", 5, 1, "pct", "Tree canopy"),
    I("tree_density", 5, 1, "num", "Tree density"),
    I("park_area_perc", 5, 1, "pct", "Park area"),
    I("proximity_neighbourhood_parks", 5, 1, "idx", "Proximity to neighbourhood parks"),
    I("land_surface_temp", 5, -1, "temp", "Summer land surface temperature"),
    I("noise_pollution_score", 5, -1, "num", "Noise pollution"),
    I("flood_susceptibility", 5, -1, "num", "Flood susceptibility"),
  ];
  CP.CONTEXT_INDICATORS = [
    I("children_perc", -1, 0, "pct", "Children (0-14)"),
    I("seniors_65_perc", -1, 0, "pct", "Seniors (65+)"),
    I("renter_households_perc", -1, 0, "pct", "Renter households"),
    I("first_generation_perc", -1, 0, "pct", "First-generation immigrants"),
    I("commute_vehicle_perc", -1, 0, "pct", "Commute by car"),
  ];
  CP.fmtIndicator = function (ind, v) {
    switch (ind.fmt) {
      case "pct": return v.toFixed(1) + "%";
      case "score": return Math.round(v) + "/100";
      case "idx": return v.toFixed(2);
      case "min": return v.toFixed(0) + " min";
      case "temp": return v.toFixed(1) + " °C";
      case "ratio": return v.toFixed(2);
      case "rate": return Math.round(v).toLocaleString();
      default: return v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
    }
  };

  // ---------- zones ----------
  CP.ZONES = {
    R: { name: "Residential", icon: "🏠", color: "#ffd43b" },
    C: { name: "Commercial", icon: "🏬", color: "#4dabf7" },
    I: { name: "Industrial", icon: "🏭", color: "#b197fc" },
    O: { name: "Open space", icon: "🌳", color: "#69db7c" },
  };

  // ---------- buildings ----------
  // gain: equity points added to each metric of the district the building stands in (20 points = one band).
  // area: an effect circle (radius r, metres) that reaches every home inside it, across district borders.
  //       Each district gets area.gain scaled by the share of its homes inside the circle.
  //       harm: true = pollution-type effect (parks buffer it, it can spark protests, harmed homes show it).
  //       rent: the Belonging loss is doubled in high-rent districts.
  // zones: lots this building may stand on. upkeep / income: $M per minute.
  // relates: the real CEI indicators this building is meant to move.
  CP.BUILDINGS = {
    clinic: { name: "Health Clinic", icon: "🩺", cost: 12, upkeep: 0.5, color: "#19b5b0", zones: "RC", gain: E(0, 6, 26, 0, 0, 0),
      area: { r: 2000, gain: E(0, 0, 8, 0, 0, 0), what: "care nearby" },
      relates: ["regular_care_provider_yes_perc", "proximity_healthcare"] },
    hospital: { name: "Hospital", icon: "🏥", cost: 30, upkeep: 2.5, color: "#e53935", zones: "CO", gain: E(8, 12, 45, 0, 0, 0),
      area: { r: 1500, gain: E(0, 0, 0, -6, 0, -4), what: "traffic noise" },
      relates: ["perceived_health_vg_excellent_perc", "proximity_healthcare"], risk: "Expensive upkeep and traffic noise next door" },
    grocery: { name: "Grocery Store", icon: "🛒", cost: 10, upkeep: 0.2, color: "#3faa4a", zones: "CR", gain: E(4, 24, 8, 0, 0, 0),
      relates: ["proximity_grocerystores", "average_walkscore"] },
    jobs: { name: "Jobs Hub", icon: "💼", cost: 14, upkeep: 0.5, income: 0.5, color: "#3b82c4", zones: "CI", gain: E(28, 0, 0, 0, 6, 0),
      area: { r: 1800, gain: E(0, 0, 0, 0, 0, -6), what: "traffic" },
      relates: ["unemployment_rate_perc", "lim_at_perc"], risk: "Traffic and a small Climate hit" },
    community: { name: "Community Centre", icon: "🤝", cost: 10, upkeep: 0.5, color: "#845ef7", zones: "RCO", gain: E(0, 0, 0, 28, 8, 0),
      relates: ["sense_of_belonging_perc", "social_disorder_rate"] },
    school: { name: "School", icon: "🏫", cost: 16, upkeep: 1, color: "#d9774a", zones: "RC", gain: E(10, 0, 0, 6, 28, 0),
      relates: ["educ_no_cert_perc", "youth_neet_perc"] },
    park: { name: "Park", icon: "⛲", cost: 10, upkeep: 0.3, color: "#58b368", zones: "OR", gain: E(0, 0, 6, 6, 0, 26),
      area: { r: 2000, gain: E(0, 0, 4, 0, 0, 10), what: "green space" }, buffer: true,
      relates: ["tree_canopy", "park_area_perc"], risk: "Uses a lot that could hold housing or services" },
    childcare: { name: "Childcare Centre", icon: "🧸", cost: 8, upkeep: 0.4, color: "#ff7ab8", zones: "RC", gain: E(12, 0, 0, 0, 14, 0),
      relates: ["proximity_childcare", "single_parent_econ_dependency"] },
    library: { name: "Library", icon: "📚", cost: 12, upkeep: 0.5, color: "#c98a1b", zones: "RC", gain: E(0, 0, 0, 14, 20, 0),
      relates: ["proximity_library", "no_official_languages_perc"] },
    transit: { name: "CTrain Station", icon: "🚉", cost: 18, upkeep: 1.5, color: "#1c6fd9", zones: "COI", gain: E(10, 16, 0, 0, 0, 4),
      area: { r: 3500, gain: E(4, 18, 0, -8, 0, 2), rent: true, what: "transit access, but rents rise" },
      relates: ["average_transitscore", "commute_transit_perc"], risk: "Rents rise nearby, so low-income residents can be pushed out" },
    factory: { name: "Factory", icon: "🏭", cost: 14, upkeep: 0.5, income: 1.5, color: "#868e96", zones: "I", gain: E(24, 0, 0, 0, 0, 0),
      area: { r: 2400, gain: E(0, 0, -36, -14, 0, -38), harm: true, what: "smoke and pollution" },
      relates: ["unemployment_rate_perc", "working_poor_18to64_perc"], risk: "Pollution lowers Health and Climate for nearby homes" },
    datacentre: { name: "AI Data Centre", icon: "🖥️", cost: 24, upkeep: 0.5, income: 3, color: "#5c7cfa", zones: "I", gain: E(30, 0, 0, -6, 0, -10),
      area: { r: 3000, gain: E(0, 0, 0, -4, 0, -10), harm: true, what: "power and water use" },
      relates: ["lim_at_perc", "income_inequality_ratio"], risk: "Few local jobs, heavy power and water use, lower Climate" },
    wastewater: { name: "Wastewater Plant", icon: "💧", cost: 16, upkeep: 1, color: "#22b8cf", zones: "IO", gain: E(0, 0, 16, 0, 0, 18),
      area: { r: 1800, gain: E(0, 0, 0, -10, 0, 0), what: "odour" },
      relates: ["flood_susceptibility", "diabetes_agestd_perc"], risk: "Nobody wants to live next to it: lower Belonging nearby" },
  };
  // one short line per building for the build bar
  const SHORT = {
    clinic: "Gives nearby families a local doctor.",
    hospital: "Keeps nearby residents healthy.",
    grocery: "Puts fresh food within walking distance.",
    jobs: "Brings good jobs close to home.",
    community: "Gives neighbours a place to meet.",
    school: "Helps kids learn and finish school.",
    park: "Adds trees, shade and clean air.",
    childcare: "Lets parents get back to work.",
    library: "Free books, classes and internet.",
    transit: "Fast trips across the city by train.",
    factory: "Lots of jobs, but pollutes nearby homes.",
    datacentre: "Big tax money, few jobs, heavy power use.",
    wastewater: "Cleans water and cuts flood risk.",
  };
  for (const k in SHORT) CP.BUILDINGS[k].short = SHORT[k];
  // real infrastructure that is already standing when the term starts (not in the build bar)
  CP.BUILDINGS.reservoir = { name: "Reservoir & Water Plant", icon: "💧", cost: 0, upkeep: 0, color: "#22b8cf", zones: "O", gain: E(0, 0, 10, 0, 0, 12),
    short: "Clean drinking water for the city.", relates: ["flood_susceptibility"] };

  // in the Build list, most useful first
  CP.BUILD_ORDER = ["clinic", "grocery", "community", "park", "childcare", "library", "school", "jobs", "transit", "hospital", "factory", "wastewater", "datacentre"];
  CP.HOUSE_ICON = "🏠";

  // ---------- districts ----------
  // Calgary's 288 census tracts are grouped into 24 districts named after real communities: each tract joins the nearest
  // seed point. lots: zone of each building lot (4-6), cost: land-price multiplier, traits: flood / highRent.
  // Each district has one representative resident with a unique look (see sprites.js -> S.resident).
  const L = (skin, hair, style, top, bottom, extra) => ({ skin, hair, style, top, bottom, extra: extra || {} });
  const R = (name, look) => ({ name, look });
  CP.DISTRICTS = [
    { name: "Downtown", at: [51.045, -114.07], lots: "CCCC", cost: 1.6, traits: { highRent: true },
      story: "Towers, offices and the river paths, but rents push families further out every year.",
      resident: R("Priya Sharma", L("#c68642", "#1b1b1f", "long", "#c2255c", "#1f2a44", { glasses: true })) },
    { name: "Bridgeland", at: [51.058, -114.035], lots: "RRCO", cost: 1.2,
      story: "An old hillside neighbourhood across the Bow, filling up with new condos.",
      resident: R("Luca Romano", L("#e8b98f", "#3b2a20", "short", "#2f9e44", "#343a40", { bag: "#c92a2a" })) },
    { name: "Inglewood", at: [51.033, -114.02], lots: "RCIIO", cost: 1, traits: { flood: true },
      story: "Calgary's oldest main street sits right where the Bow and the Elbow meet.",
      resident: R("Jess Cardinal", L("#b07a4f", "#141414", "long", "#e8590c", "#1c3d6e", { headphones: "#212529" })) },
    { name: "Forest Lawn", at: [51.038, -113.958], lots: "RRIIC", cost: 0.9,
      story: "International Avenue: dozens of cultures on one street, and industry right next to homes.",
      resident: R("Amira Hassan", L("#d9a066", "#0f8a8a", "hijab", "#e0a526", "#5b5f66", {})) },
    { name: "Marlborough", at: [51.062, -113.968], lots: "RRCIO", cost: 0.9,
      story: "A busy northeast hub where many newcomers start their Calgary life.",
      resident: R("Minh Tran", L("#f1c27d", "#15151a", "short", "#d6336c", "#2b4c7e", { backpack: "#2f9e44", hood: true })) },
    { name: "Falconridge", at: [51.098, -113.948], lots: "RRCIO", cost: 0.9,
      story: "Young families, long commutes and not enough services close to home.",
      resident: R("Fatima Noor", L("#a86b3c", "#5f3dc4", "hijab", "#12b886", "#343a40", { bag: "#f59f00" })) },
    { name: "Saddle Ridge", at: [51.138, -113.948], lots: "ROOCRO", cost: 0.9,
      story: "One of the fastest-growing corners of the city, with open land still waiting for services.",
      resident: R("Harpreet Gill", L("#b9773f", "#f08c00", "turban", "#1971c2", "#c9b28a", { beard: "#2a2a2a" })) },
    { name: "Country Hills", at: [51.155, -114.065], lots: "RRCOO", cost: 1,
      story: "Quiet north-end streets where almost everyone needs a car to get anywhere.",
      resident: R("Kwame Mensah", L("#6b4226", "#141414", "afro", "#fcc419", "#1b1b1f", { headphones: "#e03131" })) },
    { name: "Evanston", at: [51.172, -114.115], lots: "RROOC", cost: 1,
      story: "Brand-new suburbs on the city's northern edge. The houses arrived before the services did.",
      resident: R("Daniel Kim", L("#f1c27d", "#111111", "short", "#ff6b6b", "#495057", { backpack: "#1971c2" })) },
    { name: "Thorncliffe", at: [51.1, -114.065], lots: "RRCO", cost: 1,
      story: "Post-war bungalows near Nose Hill, home to many seniors and new families.",
      resident: R("Rosa Delgado", L("#d4a373", "#6b3f1d", "curly", "#f8f9fa", "#7a4a2a", { apron: "#2f9e44" })) },
    { name: "Edgemont", at: [51.128, -114.145], lots: "RRCO", cost: 1.1,
      story: "Ravines and big yards on the hills of the northwest.",
      resident: R("Grace Okafor", L("#5a3825", "#1b1b1f", "bun", "#fab005", "#2b8a3e", { glasses: true })) },
    { name: "Tuscany", at: [51.128, -114.24], lots: "RROC", cost: 1.1,
      story: "The last stop on the Red Line, looking out at the foothills.",
      resident: R("Liam O'Connor", L("#f6d0b1", "#c2410c", "curly", "#228be6", "#212529", { small: true })) },
    { name: "Bowness", at: [51.09, -114.2], lots: "RRCO", cost: 1, traits: { flood: true },
      story: "A river village inside the city. The 2013 flood is still a fresh memory here.",
      resident: R("Tom Fraser", L("#f3cfb3", "#e9ecef", "cowboy", "#a61e4d", "#33507a", { plaid: "#3b1f16", cane: true, beard: "#e9ecef" })) },
    { name: "Varsity", at: [51.085, -114.14], lots: "RCCO", cost: 1.3, traits: { highRent: true },
      story: "Students and hospital staff near the university, where rents keep climbing.",
      resident: R("Mei Lin Wong", L("#f6d5b0", "#20151a", "bun", "#b197fc", "#f1f3f5", { scarf: "#ff922b", book: "#1c7ed6" })) },
    { name: "Killarney", at: [51.032, -114.128], lots: "RRCC", cost: 1.2,
      story: "Inner-city infills and old bungalows along 17 Avenue SW.",
      resident: R("Noah Bergstrom", L("#f3cfb3", "#d9a441", "cap", "#495057", "#1c7ed6", { beard: "#a0522d" })) },
    { name: "Signal Hill", at: [51.018, -114.175], lots: "RRCO", cost: 1.1,
      story: "West-side hills with big-box shopping and mountain views.",
      resident: R("Sofia Petrov", L("#fbdcc4", "#f2c94c", "ponytail", "#4dabf7", "#4dabf7", { stripe: "#ffffff" })) },
    { name: "Glenmore", at: [50.978, -114.105], lots: "RRCO", cost: 1.1,
      story: "Neighbourhoods around the reservoir that supplies much of the city's drinking water.",
      resident: R("Elena Kowalski", L("#eec9a8", "#adb5bd", "bob", "#7048e8", "#2b8a3e", { glasses: true, bag: "#8d5524" })) },
    { name: "Acadia", at: [50.97, -114.05], lots: "RRCI", cost: 1,
      story: "Affordable 1960s homes between Macleod Trail and the industrial east.",
      resident: R("Rina Patel", L("#c68642", "#2b1d14", "ponytail", "#f06595", "#343a40", { scarf: "#20c997" })) },
    { name: "Ogden", at: [50.988, -114.005], lots: "IIIRC", cost: 0.8,
      story: "Rail yards and warehouses, with a small neighbourhood squeezed in between.",
      resident: R("Marco Silva", L("#c99a6e", "#e8590c", "cap", "#fd7e14", "#495057", { vest: "#ffd43b", beard: "#2a2a2a" })) },
    { name: "Woodbine", at: [50.938, -114.135], lots: "RROC", cost: 1.1,
      story: "Leafy southwest streets on the edge of Fish Creek Park.",
      resident: R("Ruth Anderson", L("#f8d9c0", "#dee2e6", "bob", "#7950f2", "#868e96", { cane: true, glasses: true })) },
    { name: "Midnapore", at: [50.912, -114.075], lots: "RRCO", cost: 1,
      story: "Lake communities in the deep south, a long ride from downtown.",
      resident: R("Ahmed Yusuf", L("#8d5524", "#1c3d6e", "cap", "#868e96", "#343a40", { vest: "#ff922b", beard: "#1b1b1f" })) },
    { name: "McKenzie Towne", at: [50.915, -113.965], lots: "ROOOC", cost: 0.9,
      story: "A planned town-square suburb with open land still to fill.",
      resident: R("Chloe Tremblay", L("#ffe0c7", "#e03131", "toque", "#f783ac", "#0ca678", { small: true, mitts: "#e03131" })) },
    { name: "Seton", at: [50.875, -113.95], lots: "OOORCO", cost: 0.9,
      story: "The newest district in the southeast, built around a hospital and empty fields.",
      resident: R("Joseph Abara", L("#4a2f1d", "#141414", "afro", "#15aabf", "#343a40", { book: "#e03131" })) },
    { name: "Silverado", at: [50.875, -114.085], lots: "RROOC", cost: 1,
      story: "Young suburbs at the city's southern tip, where the prairie begins.",
      resident: R("Ana Reyes", L("#d8a273", "#3b1f16", "long", "#40c057", "#1864ab", { bag: "#7048e8" })) },
  ];

  // What a resident says about their district's weakest metric. Indicator lines quote the real CEI value
  // for the district ({v}) and for Calgary ({avg}); the plain lines are used when no indicator fits.
  CP.INDICATOR_LINES = {
    lim_at_perc: "{v} of people here live on a low income. Across Calgary it's {avg}.",
    population_in_poverty_perc: "{v} of my neighbours live in poverty. Citywide it's {avg}.",
    unemployment_rate_perc: "Unemployment here is {v}. The city average is {avg}. People want to work.",
    working_poor_18to64_perc: "I work full time and still can't cover rent. {v} of adults here are working poor.",
    social_assistance_perc: "{v} of people here rely on social assistance. We need jobs close to home.",
    average_walkscore: "Our Walk Score is {v}. There's nothing within walking distance.",
    average_transitscore: "Our Transit Score is {v}. Without a car you can't get anywhere.",
    proximity_grocerystores: "The nearest grocery store is three bus transfers away.",
    proximity_healthcare: "The nearest doctor is across the city.",
    spatial_access_primary_secondary_education_transit: "My kids ride two buses to get to school.",
    average_commute_time: "My commute is {v} each way. That's time away from my kids.",
    regular_care_provider_yes_perc: "Only {v} of us have a regular doctor. Across Calgary it's {avg}.",
    perceived_health_vg_excellent_perc: "Only {v} of people here say their health is very good. Citywide it's {avg}.",
    diabetes_agestd_perc: "Diabetes here is {v}, against {avg} citywide. We need care close to home.",
    copd_agestd_perc: "So many people here struggle to breathe. COPD is {v} here.",
    mental_illness_agestd_perc: "{v} of people here live with mental illness, and help is far away.",
    sense_of_belonging_perc: "Only {v} of us feel we belong here. There's nowhere to meet.",
    person_crime_rate: "I don't feel safe walking home at night.",
    social_disorder_rate: "There's trouble on our streets most nights. People need somewhere to go.",
    voter_turnout_rate: "Only {v} of people here voted last time. Nobody thinks City Hall listens.",
    educ_no_cert_perc: "{v} of adults here never finished school. Our kids deserve better.",
    youth_neet_perc: "{v} of young people here aren't working or in school.",
    core_housing_renter_perc: "{v} of renters here are in core housing need. Rent eats everything.",
    no_official_languages_perc: "{v} of my neighbours don't speak English or French yet. They need classes.",
    adult_litp: "{v} of adults here need a low-income transit pass to get around.",
    tree_canopy: "Tree canopy here is only {v}. Summers are scorching.",
    land_surface_temp: "The ground here hits {v} in summer. There's no shade at all.",
    park_area_perc: "Only {v} of our land is park. The kids play in parking lots.",
    noise_pollution_score: "The noise here never stops, day or night.",
    flood_susceptibility: "Every spring we watch the river and worry. Flood risk here is high.",
  };
  CP.NEED_LINES = [
    ["There's no steady work around here. I ride two hours for a part-time shift.", "Our young people have to leave the neighbourhood to find a decent job."],
    ["The nearest grocery store is three bus transfers away.", "Without a car, you can't get anywhere from here."],
    ["We need a clinic nearby. The closest doctor is 40 minutes away.", "My mother waited all night in emergency. We need care closer to home."],
    ["I barely know my neighbours, and I don't feel safe walking home at night.", "There's nowhere around here for people to come together."],
    ["Our kids need a real place to learn. The classrooms are overflowing.", "Families here are stretched thin. We need support, not sympathy."],
    ["There isn't a single tree on my street. Summers here are scorching.", "The kids have no park to play in, only parking lots."],
  ];
  CP.THANKS_LINES = [
    "I start my new job on Monday, ten minutes from home. Thank you, Director!",
    "I can finally get what I need close to home. That changes everything. Thank you!",
    "I saw a doctor today, right here in the neighbourhood. Thank you, Director!",
    "The whole street came out last night. It finally feels like a community. Thank you!",
    "My daughter loves her new classroom. You gave us a real chance. Thank you!",
    "Shade, grass and birdsong. I never thought I'd see that here. Thank you!",
  ];
  CP.CONTENT_LINE = "Life feels fair here now. Go and help the other districts, Director!";
  // what residents say when a building harms their homes (by building type)
  CP.COMPLAINTS = {
    factory: ["The factory smoke is making my kid cough.", "We can't even open our windows any more. That smoke!"],
    datacentre: ["That data centre hums all night and drinks our water.", "Our power bills went up and the creek went down."],
    transit: ["The train is great, but my rent just went up 30%.", "My landlord says the new station means new prices. Where do I go?"],
    hospital: ["Ambulances and traffic all night next to my house.", "The new hospital is great, but the traffic is not."],
    wastewater: ["You can smell that plant from my backyard.", "Who decided to put the sewage plant next to our playground?"],
    jobs: ["The traffic to that jobs hub is backed up past my house.", "More jobs, sure, but I can't cross my own street now."],
    rezone: ["They rezoned our street without asking anyone.", "Nobody asked us before changing the zoning."],
    demolish: ["They knocked down the Hendersons' house. Where are they supposed to live?", "Another family home gone."],
    protest: ["We're not moving until City Hall listens!", "Not next to our homes!"],
  };

  // ---------- disasters ----------
  // Each drops one metric in one district by a full band and stays on the map until the player clicks it
  // and pays the repair cost. weight: real indicator used to pick where it strikes (higher = more likely).
  // tint: colour the district pulses while it is hit. The tornado wanders from district to district.
  CP.EVENT_TYPES = {
    flood: { name: "Flood", icon: "🌊", metric: 5, cost: 7, tint: "#2f8fff", weight: "flood_susceptibility", trait: "flood",
      text: "{river} has burst its banks in {d}. Homes are flooded." },
    fire: { name: "House fire", icon: "🔥", metric: 3, cost: 5, tint: "#ff6a00",
      text: "A house is on fire in {d}. Families have lost their home." },
    storm: { name: "Storm", icon: "⛈️", metric: 1, cost: 5, tint: "#7c5cff",
      text: "A violent storm is battering {d}. Power and roads are down." },
    tornado: { name: "Tornado", icon: "🌪️", metric: 4, cost: 8, tint: "#9aa4b5", moves: true,
      text: "A tornado is tearing across {d}!" },
    rain: { name: "Heavy rain", icon: "🌧️", metric: 5, cost: 5, tint: "#3fa7ff", weight: "flood_susceptibility",
      text: "Heavy rain is flooding basements across {d}." },
    lightning: { name: "Lightning", icon: "⚡", metric: 0, cost: 6, tint: "#ffe14d",
      text: "Lightning knocked out power to businesses in {d}. Shops are closed." },
    earthquake: { name: "Earthquake", icon: "🌍", metric: 2, cost: 7, tint: "#c98a4b",
      text: "A rare earthquake has cracked the streets of {d}. People are hurt." },
    collapse: { name: "Building collapse", icon: "🏚️", metric: 4, cost: 6, tint: "#b0a090",
      text: "A badly built apartment block has collapsed in {d}." },
  };

  // ---------- civilians ----------
  // vague complaints used by planning missions: the player has to open Plan to find what is wrong
  CP.PLAN_LINES = [
    ["Nobody around here can find decent work.", "Everyone on my street is struggling to make rent."],
    ["Getting anywhere from here takes forever.", "We can never get to the things we need."],
    ["People around here keep getting sick.", "Folks here just don't feel well, and nobody knows why."],
    ["Our neighbourhood feels unsafe.", "Nobody here knows each other any more."],
    ["Our kids are falling behind.", "Families here are stretched to breaking point."],
    ["It's an oven here every summer.", "This place is all concrete and no green."],
  ];
  // short, friendly jokes civilians say now and then
  CP.JOKES = [
    "Calgary has two seasons: winter and road construction.",
    "I wore shorts yesterday. Today I'm wearing three jackets.",
    "My GPS just says 'good luck' when I get on Deerfoot.",
    "I named my cat Deerfoot. He's always jammed up.",
    "The pothole on my street is so big it has its own postal code.",
    "I'm not saying it's windy, but my hat just moved to Airdrie.",
    "Chinook today! Time to wash the car before it snows again.",
    "Parallel parking in a snowbank is my cardio.",
    "I put my winter tires on in July. Just to be safe.",
    "Stampede week is the only time my boss wears more denim than me.",
    "My neighbour shovels his snow onto my driveway. He calls it sharing.",
    "Plus fifteen in February? Break out the t-shirts!",
    "I tried to catch some fog this morning. Mist.",
    "My kid thinks the Calgary Tower is a giant lamp. I didn't correct her.",
    "Smile, everyone! The Director is watching from space.",
    "Why did the cowboy get a dachshund? He wanted a long little doggie.",
    "I told a joke about the CTrain. It went right over the Bow.",
    "I'd tell you a construction joke, but I'm still working on it.",
    "My dog barks at the mountains. He thinks they're big clouds.",
    "Hail in June, sun in January. Calgary keeps us guessing.",
    "My cactus moved here for the dry heat. Then winter happened.",
    "Every Calgarian owns one cowboy hat and zero horses.",
    "I asked for a chinook. Got a wind warning instead.",
    "If you don't like the weather, wait five minutes. It'll be worse.",
  ];

  // what civilians say when a mission they gave you ends
  CP.CIV_LINES = {
    done: [
      'You did it, Director! "{title}" is done. City Hall has sent you a {grant} grant.',
      'I can already feel the difference. Thank you for "{title}". Your {grant} grant is on its way.',
      'The whole street is talking about it! "{title}" is done, and {grant} is yours.',
    ],
    failed: [
      'Time ran out on "{title}". We\'ll manage somehow, Director, but it stings.',
      'You didn\'t make it in time for "{title}". Maybe next time.',
    ],
  };

  // ---------- story ----------
  CP.STORY = {
    dcm: { name: "Maya Okonkwo", title: "Deputy City Manager · City of Calgary" },
    introDistrict: "Forest Lawn",
    introVisitor: "Marlborough",
    // who: 0 = the district's own resident, 1 = the visitor
    intro: [
      { who: 0, text: "Another clinic closed. The nearest doctor is across the city now." },
      { who: 1, text: "Out west they have parks, libraries and trains. We have a bus that never comes." },
      { who: 0, text: "Same city, completely different lives. Somebody up there must be able to see it..." },
    ],
    briefing: [
      "Director, this is Deputy City Manager Maya Okonkwo at City Hall. The planning satellite CEI-SAT 1 is now under your command.",
      "Your job: make Calgary the most equitable city on the planet. You have a 5-minute term and $30M. Every building also costs upkeep each minute.",
      "Start with MISSIONS and press Go. PLAN shows where life is least fair, using real 2024 Calgary Equity Index data. Then BUILD on a lot in that district.",
      "Residents with a ❗ over their heads have jobs for you: click them to hear them out. If disaster strikes, click it on the map to repair it. Good luck, Director.",
    ],
    missionDone: [
      'Contract complete: "{title}". A grant of {grant} has been wired to your budget.',
      'Well done, Director. You finished "{title}", and {grant} in grant money is now yours to spend.',
      'City Hall is impressed. "{title}" is complete, so I have released a {grant} grant.',
    ],
    lotsUnlocked: "Good news: council has approved more land. New lots are open in several districts.",
    // closing line of the final report, by overall band (Terrible .. Perfect)
    report: [
      "Director, your term is over. I'll be blunt: Calgary is still a deeply unfair city. The residents deserved better.",
      "Director, your term is over. A few districts are better off, but most of Calgary is still waiting for its fair share.",
      "Director, your term is over. Calgary is fairer than you found it, but 'average' is not what we promised people.",
      "Director, your term is over. Calgary is now one of the most equitable cities anywhere. People can feel the difference.",
      "Director, your term is over, and you did it. Calgary is the most equitable city on the planet. City Hall salutes you.",
    ],
  };

  // ---------- tutorial (guided first mission) ----------
  CP.TUTORIAL = [
    { id: "go", text: "Start here: press <b>Go</b> on your first mission." },
    { id: "plan", text: "This is the <b>Plan</b> view. The colours show how fair each district is. Your target is outlined in gold. Now open <b>Build</b>." },
    { id: "pick", text: "Pick a building tagged <b>Helps mission</b>." },
    { id: "lot", text: "Hover a lot: <b>green</b> means allowed. The card shows what will change. Click to build." },
  ];
})();
