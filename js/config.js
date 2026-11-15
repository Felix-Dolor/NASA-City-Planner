// Game tuning: pacing, equity bands, metrics, buildings, districts, residents and story text.
// Everything a designer would want to tweak lives in this file.
(function () {
  const CP = window.CP;

  // ---------- pacing & economy ----------
  CP.TERM_SECONDS = 480; // length of the term (8 minutes); pauses while the Deputy City Manager is talking
  CP.START_BUDGET = 30; // $M - enough for 2-3 buildings
  CP.INCOME = { amount: 1, every: 10 }; // small city revenue trickle: +$1M every 10 s (set amount to 0 to disable)
  CP.MIN_SPACING = 1800; // metres between two player buildings ("spread buildings out")
  CP.FINAL = { perEquityPoint: 100, perBudgetM: 2 }; // final score = equity * 100 + leftover $M * 2
  CP.MISSIONS = {
    total: 10, // contracts available over the whole term
    active: 3, // shown at once
    grantBase: 12, // $M
    grantPerPoint: 0.7, // + $M per metric point the contract asks for
    districtGrantPerPoint: 0.5, // same, for "raise the whole district" contracts (points summed over 6 metrics)
  };

  // ---------- equity bands ----------
  // Every score is 0-100 (higher = more equitable) but is only ever SHOWN as one of these bands.
  CP.BANDS = [
    { name: "Terrible", min: 0, color: "#e03131", ink: "#fff" },
    { name: "Bad", min: 20, color: "#ff9a8d", ink: "#3a0d0a" },
    { name: "Average", min: 40, color: "#f5d142", ink: "#3a2f00" },
    { name: "Good", min: 60, color: "#3fa650", ink: "#fff" },
    { name: "Perfect", min: 80, color: "#19f07a", ink: "#003a18" },
  ];
  CP.bandIndex = (s) => CP.clamp(Math.floor(s / 20), 0, 4);
  CP.bandOf = (s) => CP.BANDS[CP.bandIndex(s)];
  CP.chip = (s) => {
    const b = CP.bandOf(s);
    return `<span class="band" style="background:${b.color};color:${b.ink}">${b.name}</span>`;
  };

  // How raw CEI domain scores (higher = more need) become 0-100 equity scores:
  // each tract is placed between Calgary's 5th and 95th percentile tract for that domain.
  CP.SCORE_SCALE = { best: 90, span: 80, min: 5, max: 95 };

  // ---------- the 6 equity metrics (order matches CEI_DATA.domains) ----------
  CP.DOMAINS = [
    { key: "econ", label: "Economic Opportunity", icon: "💼", color: "#f5b942",
      plain: "Can people here find good jobs and earn enough to live on? This looks at work, incomes and poverty." },
    { key: "access", label: "Accessibility & Amenities", icon: "🚏", color: "#46b8f0",
      plain: "How easy is it to reach everyday things like groceries, schools, childcare and transit without a long trip?" },
    { key: "health", label: "Population Health", icon: "❤️", color: "#f25f7a",
      plain: "How healthy are the people who live here, and can they see a doctor when they need one?" },
    { key: "belong", label: "Belonging & Safety", icon: "🤝", color: "#b28cff",
      plain: "Do people feel safe, welcome and connected to their neighbours?" },
    { key: "social", label: "Human & Social Wellbeing", icon: "🌱", color: "#58d68d",
      plain: "Are people getting the education, housing and support they need to do well in life?" },
    { key: "climate", label: "Climate & Environment", icon: "🌳", color: "#2ec4a6",
      plain: "Trees, parks and clean air, and how well the area copes with heat, noise and floods." },
  ];
  const E = (econ, access, health, belong, social, climate) => [econ, access, health, belong, social, climate];

  // ---------- buildings ----------
  // gain: equity points added to each metric of the district the building stands in.
  // 20 points = one full band. Scores cap at 100, so building where a metric is already high is wasted.
  CP.BUILDINGS = {
    clinic: { name: "Health Clinic", icon: "🩺", cost: 12, color: "#19b5b0", gain: E(0, 6, 30, 0, 0, 0) },
    grocery: { name: "Grocery Store", icon: "🛒", cost: 10, color: "#3faa4a", gain: E(0, 26, 10, 0, 0, 0) },
    jobs: { name: "Jobs Hub", icon: "💼", cost: 14, color: "#3b82c4", gain: E(32, 0, 0, 0, 8, 0) },
    community: { name: "Community Centre", icon: "🤝", cost: 10, color: "#845ef7", gain: E(0, 0, 0, 30, 8, 0) },
    school: { name: "School", icon: "🏫", cost: 16, color: "#d9774a", gain: E(12, 0, 0, 6, 30, 0) },
    park: { name: "Park", icon: "⛲", cost: 10, color: "#58b368", gain: E(0, 0, 8, 6, 0, 30) },
    childcare: { name: "Childcare Centre", icon: "🧸", cost: 8, color: "#ff7ab8", gain: E(14, 0, 0, 0, 14, 0) },
    library: { name: "Library", icon: "📚", cost: 12, color: "#c98a1b", gain: E(0, 0, 0, 16, 20, 0) },
    transit: { name: "CTrain Station", icon: "🚉", cost: 18, color: "#1c6fd9", gain: E(16, 32, 0, 0, 0, 8) },
    hospital: { name: "Hospital", icon: "🏥", cost: 30, color: "#e53935", gain: E(10, 15, 55, 0, 0, 0) },
  };

  // ---------- districts ----------
  // Calgary's 288 census tracts are grouped into 12 districts: each tract joins the nearest seed point.
  // Each district has one representative resident with a unique look (see sprites.js -> S.resident).
  const L = (skin, hair, style, top, bottom, extra) => ({ skin, hair, style, top, bottom, extra: extra || {} });
  CP.DISTRICTS = [
    { name: "Downtown", at: [51.045, -114.075], resident: { name: "Priya Sharma", look: L("#c68642", "#1b1b1f", "long", "#c2255c", "#1f2a44", { glasses: true }) } },
    { name: "Forest Lawn", at: [51.03, -113.965], resident: { name: "Amira Hassan", look: L("#d9a066", "#0f8a8a", "hijab", "#e0a526", "#5b5f66", {}) } },
    { name: "Marlborough", at: [51.07, -113.965], resident: { name: "Minh Tran", look: L("#f1c27d", "#15151a", "short", "#d6336c", "#2b4c7e", { backpack: "#2f9e44", hood: true }) } },
    { name: "Saddle Ridge", at: [51.125, -113.95], resident: { name: "Harpreet Gill", look: L("#b9773f", "#f08c00", "turban", "#1971c2", "#c9b28a", { beard: "#2a2a2a" }) } },
    { name: "Thorncliffe", at: [51.095, -114.065], resident: { name: "Rosa Delgado", look: L("#d4a373", "#6b3f1d", "curly", "#f8f9fa", "#7a4a2a", { apron: "#2f9e44" }) } },
    { name: "Country Hills", at: [51.15, -114.08], resident: { name: "Kwame Mensah", look: L("#6b4226", "#141414", "afro", "#fcc419", "#1b1b1f", { headphones: "#e03131" }) } },
    { name: "Bowness", at: [51.105, -114.21], resident: { name: "Tom Fraser", look: L("#f3cfb3", "#e9ecef", "cowboy", "#a61e4d", "#33507a", { plaid: "#3b1f16", cane: true, beard: "#e9ecef" }) } },
    { name: "Varsity", at: [51.085, -114.135], resident: { name: "Mei Lin Wong", look: L("#f6d5b0", "#20151a", "bun", "#b197fc", "#f1f3f5", { scarf: "#ff922b", book: "#1c7ed6" }) } },
    { name: "Signal Hill", at: [51.03, -114.17], resident: { name: "Sofia Petrov", look: L("#fbdcc4", "#f2c94c", "ponytail", "#4dabf7", "#4dabf7", { stripe: "#ffffff" }) } },
    { name: "Glenmore", at: [50.975, -114.1], resident: { name: "Elena Kowalski", look: L("#eec9a8", "#adb5bd", "bob", "#7048e8", "#2b8a3e", { glasses: true, bag: "#8d5524" }) } },
    { name: "Midnapore", at: [50.915, -114.08], resident: { name: "Ahmed Yusuf", look: L("#8d5524", "#1c3d6e", "cap", "#868e96", "#343a40", { vest: "#ff922b", beard: "#1b1b1f" }) } },
    { name: "McKenzie Towne", at: [50.92, -113.97], resident: { name: "Chloe Tremblay", look: L("#ffe0c7", "#e03131", "toque", "#f783ac", "#0ca678", { small: true, mitts: "#e03131" }) } },
  ];

  // What a resident says about their district's weakest metric (two variants each), and how they say thanks.
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

  // ---------- story ----------
  CP.STORY = {
    dcm: { name: "Maya Okonkwo", title: "Deputy City Manager · City of Calgary" },
    introDistrict: "Forest Lawn",
    introVisitor: "Marlborough",
    // who: 0 = the district's own resident, 1 = the visitor
    intro: [
      { who: 0, text: "Another clinic closed. The nearest doctor is across the city now." },
      { who: 1, text: "Out west they have parks, libraries and trains. We have a bus that never comes." },
      { who: 0, text: "Same city, completely different lives. It isn't fair." },
      { who: 1, text: "We're not asking for favours. We just want Calgary to be equitable." },
      { who: 0, text: "Somebody up there must be able to see it..." },
    ],
    briefing: [
      "Director, this is Deputy City Manager Maya Okonkwo at City Hall. The planning satellite CEI-SAT 1 is now under your command.",
      "You heard them down there. Your job is simple to say and hard to do: make Calgary the most equitable city on the planet.",
      "Your term lasts 8 minutes. Your starting budget is small, only $30M. That buys two or three buildings.",
      "Complete missions to earn grants. Use BUILD to place buildings, PLAN to see where life is least fair, and MISSIONS to see your contracts. Good luck, Director.",
    ],
    missionDone: [
      'Contract complete: "{title}". A grant of {grant} has been wired to your budget.',
      'Well done, Director. You finished "{title}", and {grant} in grant money is now yours to spend.',
      'City Hall is impressed. "{title}" is complete, so I have released a {grant} grant.',
    ],
    allMissionsDone: "That was the last contract I had for you, Director. Keep building until your term ends.",
    // closing line of the final report, by overall band (Terrible .. Perfect)
    report: [
      "Director, your term is over. I'll be blunt: Calgary is still a deeply unfair city. The residents deserved better.",
      "Director, your term is over. A few districts are better off, but most of Calgary is still waiting for its fair share.",
      "Director, your term is over. Calgary is fairer than you found it, but 'average' is not what we promised people.",
      "Director, your term is over. Calgary is now one of the most equitable cities anywhere. People can feel the difference.",
      "Director, your term is over, and you did it. Calgary is the most equitable city on the planet. City Hall salutes you.",
    ],
  };
})();
