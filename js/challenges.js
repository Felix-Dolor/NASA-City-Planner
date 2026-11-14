// Data-driven missions. Each placement challenge grades WHERE you built against the best
// possible locations in the real CEI data (stars = % of the ideal).
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const B = CP.BUILDINGS;

  // ---- hospital coverage model: who lacks care, and how far are they from existing hospitals? ----
  const hospitals = () => CP.LANDMARKS.filter((l) => l.service === "hospital");
  const H_R = B.hospital.radius;
  function hospitalValue(x, y) {
    let v = 0;
    for (const t of sim.tracts) {
      const d = CP.dist(x, y, t.c[0], t.c[1]);
      if (d > H_R) continue;
      if (t._remote === undefined) {
        let near = Infinity;
        for (const h of hospitals()) near = Math.min(near, CP.dist(h.pos[0], h.pos[1], t.c[0], t.c[1]));
        t._remote = CP.clamp(near / 7000, 0.25, 1);
      }
      v += t.n.healthGap * t._remote * (1 - d / H_R);
    }
    return v;
  }
  let hospitalBest = null;
  function computeHospitalBest() {
    const b = window.CEI_DATA.bounds;
    let best = { v: 0, x: 0, y: 0 };
    for (let x = b[0]; x <= b[2]; x += 500)
      for (let y = b[1]; y <= b[3]; y += 500) {
        if (!sim.tractAt(x, y)) continue;
        const v = hospitalValue(x, y);
        if (v > best.v) best = { v, x, y };
      }
    hospitalBest = best;
    return best;
  }

  // ---- generic tract-relevance grading ----
  function tractIdeal(rel, count, perTract) {
    const vals = sim.tracts.map((t) => rel(t)).sort((a, b) => b - a);
    const out = [];
    for (const v of vals) {
      for (let k = 0; k < perTract && out.length < count; k++) out.push(v);
      if (out.length >= count) break;
    }
    return out.reduce((a, b) => a + b, 0) / count;
  }
  function gradePlacements(ch) {
    const ps = sim.active((p) => (p.kind === "building" || p.kind === "zone") && ch.types.includes(p.type));
    const perTract = new Map();
    const vals = [];
    for (const p of ps) {
      const t = p.tract;
      if (!t) continue;
      const used = perTract.get(t) || 0;
      if (used >= ch.perTract) continue;
      perTract.set(t, used + 1);
      vals.push(ch.value ? ch.value(p) : ch.rel(t));
    }
    vals.sort((a, b) => b - a);
    const top = vals.slice(0, ch.count);
    const have = top.length;
    if (!ch._ideal) ch._ideal = ch.ideal ? ch.ideal() : tractIdeal(ch.rel, ch.count, ch.perTract);
    const mean = have ? top.reduce((a, b) => a + b, 0) / have : 0;
    const ratio = CP.clamp(mean / ch._ideal, 0, 1);
    return { have, ratio, done: have >= ch.count };
  }

  const stars = (r) => (r >= 0.9 ? 3 : r >= 0.75 ? 2 : r >= 0.5 ? 1 : 0);

  CP.CHALLENGES = [
    {
      id: "hospital", icon: "🏥", title: "Code Blue",
      brief: "Place ONE hospital where it helps the most people lacking access to healthcare. Look for tracts with low proximity to healthcare, few people with a regular care provider, poor health scores - and far from the existing five hospitals.",
      overlay: "healthGap", types: ["hospital"], count: 1, perTract: 1,
      value: (p) => hospitalValue(p.x, p.y),
      ideal: () => (hospitalBest || computeHospitalBest()).v,
    },
    {
      id: "trees", icon: "🌳", title: "Urban Forest Initiative",
      brief: "Plant 30 tree groves in the districts that need canopy most: the hottest land surface temperatures and the lowest tree canopy. (Hint: trees follow money and age.)",
      overlay: "tree_canopy", types: ["trees"], count: 30, perTract: 4,
      rel: (t) => B.trees.rel(t.n),
    },
    {
      id: "food", icon: "🛒", title: "Food Deserts",
      brief: "Open 3 grocery stores where proximity to groceries is lowest and poverty is highest.",
      overlay: "proximity_grocerystores", types: ["grocery"], count: 3, perTract: 1,
      rel: (t) => B.grocery.rel(t.n),
    },
    {
      id: "kids", icon: "🧸", title: "Room to Grow",
      brief: "Build 3 childcare centres for young families. New suburbs like Auburn Bay are up to 34.5% children - and short on spaces.",
      overlay: "children_perc", types: ["childcare"], count: 3, perTract: 1,
      rel: (t) => B.childcare.rel(t.n),
    },
    {
      id: "voice", icon: "🗳️", title: "Civic Voice",
      brief: "Voter turnout is the strongest 'good' signal in the data. Build 2 libraries or community centres in the tracts where turnout is lowest (23% in Penbrooke Meadows!).",
      overlay: "voter_turnout_rate", types: ["library", "community"], count: 2, perTract: 1,
      rel: (t) => t.n.lowVote,
    },
    {
      id: "learning", icon: "🎓", title: "Learning Gap",
      brief: "Share of adults with no certificate is the indicator most tied to need (0.91). Put 2 schools where it is highest.",
      overlay: "educ_no_cert_perc", types: ["school"], count: 2, perTract: 1,
      rel: (t) => 0.7 * t.n.noCert + 0.3 * t.n.children,
    },
    {
      id: "breathe", icon: "⛲", title: "Downtown Breathing Room",
      brief: "The core has the best transit but the fewest parks (0% in one Beltline tract). Designate 2 parks in tracts with the least park area.",
      overlay: "park_area_perc", types: ["park"], count: 2, perTract: 1,
      rel: (t) => t.n.lackPark * (0.5 + 0.5 * t.n.transit),
    },
    {
      id: "tod", icon: "🏢", title: "Transit-Oriented Density",
      brief: "Zone 6 blocks of Dense Residential near great transit, but away from family-heavy tracts. Density buys walkability; it costs families space.",
      overlay: "average_transitscore", types: ["dense"], count: 6, perTract: 3,
      rel: (t) => CP.clamp(0.65 * t.n.transit + 0.35 * (1 - t.n.children), 0, 1),
    },
    {
      id: "ne", icon: "🧭", title: "Close the Quadrant Gap",
      brief: "The NE averages 54.5 on the equity index vs 36.6 in the SW. Lower the NE average by 1.5 points.",
      overlay: "total", custom: true,
      grade: () => {
        const drop = sim.quadAvg("NE", true) - sim.quadAvg("NE");
        const r = CP.clamp(drop / 1.5, 0, 1);
        return { have: r, ratio: r, done: r >= 1, label: `NE ${sim.quadAvg("NE").toFixed(1)} (−${drop.toFixed(2)} / 1.5)` };
      },
    },
    {
      id: "divide", icon: "⚖️", title: "Shrink the Divide",
      brief: "Close the gap between the neediest 20% of tracts and the least needy 20% by 1.5 points. Help the tracts that need it most.",
      overlay: "impact", custom: true,
      grade: () => {
        const drop = sim.baseGap - sim.gap();
        const r = CP.clamp(drop / 1.5, 0, 1);
        return { have: r, ratio: r, done: r >= 1, label: `Gap ${sim.gap().toFixed(2)} (−${drop.toFixed(2)} / 1.5)` };
      },
    },
  ];

  CP.challenges = {
    hospitalValue,
    hospitalBest: () => hospitalBest || computeHospitalBest(),
    evaluate() {
      let bonus = 0;
      for (const ch of CP.CHALLENGES) {
        const g = ch.custom ? ch.grade() : gradePlacements(ch);
        g.stars = ch.custom ? (g.done ? 3 : 0) : g.done ? stars(g.ratio) : 0;
        g.preStars = stars(g.ratio);
        const was = ch.state;
        ch.state = g;
        ch.justCompleted = g.done && g.stars > 0 && !(was && was.done && was.stars > 0);
        ch.starsGained = was ? g.stars - was.stars : 0;
        bonus += g.stars * CP.STAR_POINTS;
      }
      sim.challengeBonus = bonus;
      return CP.CHALLENGES;
    },
  };
})();
