// Simulation: turns placements into changes in each census tract's six CEI domain scores,
// and turns those into the six city meters and the final score.
(function () {
  const CP = window.CP;
  const D = window.CEI_DATA;
  const ND = 6;

  const sim = (CP.sim = {
    tracts: D.tracts,
    placements: [], // every building/zone/existing amenity/landmark the sim knows about
    budget: CP.START_BUDGET,
    spent: 0,
    nextId: 1,
    listeners: [],
  });

  // ---------- tract prep ----------
  const pct = (arr, p) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  };
  const col = (k) => D.tracts.map((t) => t[k]);
  const norm = (k, p) => {
    const hi = pct(col(k), p || 0.9), lo = pct(col(k), 0.05);
    return (t) => CP.clamp((t[k] - lo) / (hi - lo || 1), 0, 1);
  };
  const lack = (k) => {
    const hi = pct(col(k), 0.85) || 0.01;
    return (t) => 1 - CP.clamp(t[k] / hi, 0, 1);
  };
  const N = {
    lackChildcare: lack("proximity_childcare"),
    lackGrocery: lack("proximity_grocerystores"),
    lackLibrary: lack("proximity_library"),
    lackPharmacy: lack("proximity_pharmacies"),
    lackSchool: lack("proximity_primary_education"),
    lackHealth: lack("proximity_healthcare"),
    lackParkProx: lack("proximity_neighbourhood_parks"),
    lackPark: lack("park_area_perc"),
    children: norm("children_perc"),
    poverty: norm("population_in_poverty_perc"),
    noCert: norm("educ_no_cert_perc"),
    diabetes: norm("diabetes_agestd_perc"),
    heat: norm("land_surface_temp"),
    transit: norm("average_transitscore"),
    longCommute: norm("average_commute_time"),
    unemployment: norm("unemployment_rate_perc"),
    carDependent: norm("commute_vehicle_perc"),
    churn: norm("movers_1_year_ago"),
    noProvider: (t) => CP.clamp((100 - t.regular_care_provider_yes_perc) / 25, 0, 1),
    lowVote: (t) => CP.clamp((62 - t.voter_turnout_rate) / 36, 0, 1),
    lowBelonging: (t) => CP.clamp((75 - t.sense_of_belonging_perc) / 30, 0, 1),
    lowCanopy: (t) => CP.clamp(1 - t.tree_canopy / 25, 0, 1),
    lowTransit: (t) => CP.clamp(1 - (t.average_transitscore - 20) / 60, 0, 1),
  };

  const medianTotal = pct(col("total_weighted_CEI_Score"), 0.5);
  let wSum = 0;
  D.tracts.forEach((t, i) => {
    t.idx = i;
    t.n = {};
    for (const k in N) t.n[k] = N[k](t);
    t.n.healthGap = CP.clamp(0.45 * t.n.lackHealth + 0.4 * t.n.noProvider + 0.35 * (t.population_health_domain_score / 70), 0, 1.2) / 1.2;
    t.base = { need: D.domains.map((k) => t[k]), total: t.total_weighted_CEI_Score };
    t.live = { need: t.base.need.slice(), total: t.base.total };
    t.P = new Float32Array(ND); // accumulated gains
    t.Nx = new Float32Array(ND); // accumulated harms
    t.r = Math.sqrt(t.area / Math.PI);
    // equity weight: helping high-need tracts fills meters faster
    t.w = Math.pow(t.base.total / medianTotal, 1.6);
    wSum += t.w;
    // bbox
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of t.rings) for (let k = 0; k < r.length; k += 2) {
      x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
    }
    t.bbox = [x0, y0, x1, y1];
  });
  sim.medianTotal = medianTotal;

  // ---------- spatial index ----------
  const GS = 1000;
  const grid = new Map();
  D.tracts.forEach((t) => {
    for (let gx = Math.floor(t.bbox[0] / GS); gx <= Math.floor(t.bbox[2] / GS); gx++)
      for (let gy = Math.floor(t.bbox[1] / GS); gy <= Math.floor(t.bbox[3] / GS); gy++) {
        const k = gx + "," + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(t);
      }
  });
  sim.tractAt = function (x, y) {
    const c = grid.get(Math.floor(x / GS) + "," + Math.floor(y / GS));
    if (!c) return null;
    for (const t of c) {
      const b = t.bbox;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && CP.pointInRings(x, y, t.rings)) return t;
    }
    return null;
  };
  sim.randomPointIn = function (t, rand) {
    const b = t.bbox;
    for (let i = 0; i < 40; i++) {
      const x = CP.lerp(b[0], b[2], rand()), y = CP.lerp(b[1], b[3], rand());
      if (CP.pointInRings(x, y, t.rings)) return [x, y];
    }
    return t.c.slice();
  };

  // ---------- effect model ----------
  function specOf(p) {
    if (p.kind === "zone") return CP.ZONES[p.type];
    if (p.kind === "landmark") return p.spec;
    return CP.BUILDINGS[p.type];
  }

  // returns [{t, gain:[6], harm:[6]}] for every tract the placement touches
  function contributions(p) {
    const s = specOf(p);
    const out = [];
    const radius = p.kind === "zone" ? 900 : s.radius;
    const home = sim.tractAt(p.x, p.y);
    const scale = p.kind === "existing" || p.kind === "landmark" ? -1 : 1; // destroying existing service = harm
    for (const t of sim.tracts) {
      const d = CP.dist(p.x, p.y, t.c[0], t.c[1]);
      if (d > radius + t.r) continue;
      let fall = t === home ? 1 : CP.clamp(1 - Math.max(0, d - t.r * 0.6) / radius, 0, 1);
      if (fall <= 0) continue;
      fall *= fall > 0.999 ? 1 : 0.85;
      const gain = new Array(ND).fill(0), harm = new Array(ND).fill(0);
      if (scale > 0) {
        const rel = s.rel(t.n);
        const pen = s.penalty ? s.penalty(t.n) : 1;
        for (let i = 0; i < ND; i++) {
          gain[i] = s.gain[i] * rel * fall;
          harm[i] = s.cost_fx[i] * pen * fall;
        }
      } else {
        // removal of something that already served this tract
        const loss = p.kind === "landmark" ? s.loss : s.gain;
        for (let i = 0; i < ND; i++) harm[i] = loss[i] * 0.7 * fall;
      }
      out.push({ t, gain, harm });
    }
    return out;
  }
  sim.contributions = contributions;

  function needOf(t, i, P, Nx) {
    const b = t.base.need[i];
    const healed = b * (1 - 0.72 * (1 - Math.exp(-P / 28)));
    return CP.clamp(healed + Nx * 0.9, 0, 100);
  }

  function apply(p, sign) {
    for (const c of p.contrib) {
      for (let i = 0; i < ND; i++) {
        c.t.P[i] += sign * c.gain[i];
        c.t.Nx[i] += sign * c.harm[i];
      }
      refreshTract(c.t);
    }
  }
  function refreshTract(t) {
    let dsum = 0;
    for (let i = 0; i < ND; i++) {
      t.live.need[i] = needOf(t, i, Math.max(0, t.P[i]), Math.max(0, t.Nx[i]));
      dsum += t.live.need[i] - t.base.need[i];
    }
    t.live.total = CP.clamp(t.base.total + dsum / ND, 0, 100);
  }

  // ---------- meters ----------
  // A meter fills as equity-weighted need falls. GOAL = points of weighted reduction for a full bar.
  CP.METER_GOAL = [1.2, 4.3, 3.6, 1.25, 1.85, 3.5];
  function weightedGain(i, override) {
    let s = 0;
    for (const t of sim.tracts) {
      const live = override && override.has(t) ? override.get(t)[i] : t.live.need[i];
      s += t.w * (t.base.need[i] - live);
    }
    return s / wSum;
  }
  sim.meters = function (override) {
    return CP.DOMAINS.map((_, i) => weightedGain(i, override) / CP.METER_GOAL[i]);
  };

  function gap(override) {
    // mean total of the 20% neediest minus the 20% least needy tracts
    const v = sim.tracts.map((t) => (override && override.has(t) ? override.get(t).total : t.live.total)).sort((a, b) => a - b);
    const k = Math.floor(v.length * 0.2);
    const lo = v.slice(0, k).reduce((a, b) => a + b, 0) / k;
    const hi = v.slice(-k).reduce((a, b) => a + b, 0) / k;
    return hi - lo;
  }
  sim.gap = gap;
  sim.baseGap = gap();
  sim.quadAvg = function (q, base) {
    const ts = sim.tracts.filter((t) => t.q === q);
    return ts.reduce((a, t) => a + (base ? t.base.total : t.live.total), 0) / ts.length;
  };

  // what-if: meters after adding (or removing) a placement, without committing
  sim.preview = function (p, removing) {
    const contrib = removing ? p.contrib : contributions(p);
    const sign = removing ? -1 : 1;
    const over = new Map();
    let best = null;
    for (const c of contrib) {
      const t = c.t;
      const need = [];
      let dsum = 0;
      for (let i = 0; i < ND; i++) {
        need[i] = needOf(t, i, Math.max(0, t.P[i] + sign * c.gain[i]), Math.max(0, t.Nx[i] + sign * c.harm[i]));
        dsum += need[i] - t.base.need[i];
      }
      need.total = CP.clamp(t.base.total + dsum / ND, 0, 100);
      over.set(t, need);
      const dt = t.live.total - need.total;
      if (!best || Math.abs(dt) > Math.abs(best.dt)) best = { t, dt };
    }
    const before = sim.meters(), after = sim.meters(over);
    return { delta: after.map((v, i) => v - before[i]), best, over, scoreDelta: sim.score(over).total - sim.score().total };
  };

  // ---------- placements ----------
  sim.on = (fn) => sim.listeners.push(fn);
  const emit = (ev) => sim.listeners.forEach((fn) => fn(ev));

  sim.canAfford = (cost) => sim.budget >= cost - 1e-6;

  sim.place = function (kind, type, x, y, opts) {
    const spec = kind === "zone" ? CP.ZONES[type] : CP.BUILDINGS[type];
    if (!sim.canAfford(spec.cost)) return { ok: false, reason: "Not enough budget" };
    const p = Object.assign({ id: sim.nextId++, kind, type, x, y, built: performance.now() }, opts || {});
    p.contrib = contributions(p);
    p.tract = sim.tractAt(x, y);
    const before = sim.score().total;
    apply(p, 1);
    sim.placements.push(p);
    sim.budget -= spec.cost;
    sim.spent += spec.cost;
    p.scoreDelta = sim.score().total - before;
    emit({ type: "place", p });
    return { ok: true, p };
  };

  sim.removeZoneAt = function (cx, cy) {
    const z = sim.placements.find((p) => p.kind === "zone" && !p.removed && p.cx === cx && p.cy === cy);
    if (z) {
      apply(z, -1);
      z.removed = true;
    }
    return z;
  };

  // destroy anything. Player builds refund 60%, existing city assets refund their salvage value.
  sim.destroy = function (p) {
    if (p.removed) return null;
    const before = sim.score().total;
    let refund;
    if (p.kind === "building") {
      apply(p, -1);
      refund = CP.BUILDINGS[p.type].cost * 0.6;
    } else if (p.kind === "zone") {
      apply(p, -1);
      refund = 0;
    } else {
      // existing amenity or landmark: removal creates harm
      p.contrib = contributions(p);
      apply(p, 1);
      refund = p.kind === "landmark" ? p.spec.refund : CP.BUILDINGS[p.type].cost * 0.45;
    }
    p.removed = true;
    sim.budget += refund;
    const delta = sim.score().total - before;
    emit({ type: "destroy", p, refund, delta });
    return { refund, delta };
  };

  sim.previewDestroy = function (p) {
    if (p.kind === "building" || p.kind === "zone") return sim.preview(p, true);
    return sim.preview(Object.assign({}, p, { contrib: undefined }), false);
  };

  // ---------- existing city assets (destroyable) ----------
  const SERVICE_TYPES = [
    ["childcare", "proximity_childcare"],
    ["grocery", "proximity_grocerystores"],
    ["library", "proximity_library"],
    ["pharmacy", "proximity_pharmacies"],
    ["school", "proximity_primary_education"],
  ];
  const highs = {};
  SERVICE_TYPES.forEach(([type, k]) => (highs[type] = pct(col(k), 0.8) || 0.01));
  sim.tracts.forEach((t) => {
    const rand = CP.rng(Math.round(t.c[0] * 7 + t.c[1] * 13));
    SERVICE_TYPES.forEach(([type, k]) => {
      const n = Math.min(3, Math.floor((t[k] / highs[type]) * 1.6 + rand() * 0.9));
      for (let i = 0; i < n; i++) {
        const [x, y] = sim.randomPointIn(t, rand);
        sim.placements.push({ id: sim.nextId++, kind: "existing", type, x, y, tract: t, built: 0 });
      }
    });
  });

  const LOSS = {
    hospital: [3, 5, 16, 2, 2, 0],
    library: [2, 4, 0, 5, 6, 0],
    grocery: [2, 7, 4, 1, 1, 0],
    belonging: [3, 0, 1, 9, 4, 0],
    plain: [1, 0, 0, 4, 1, 0],
  };
  CP.LANDMARKS.forEach((l) => {
    const loss = LOSS[l.service] || (l.belonging ? LOSS.belonging : LOSS.plain);
    const radius = l.service === "hospital" ? 7000 : l.belonging ? 6000 : 3500;
    const refund = l.service === "hospital" ? 120 : Math.round(20 + l.h * 0.35);
    l.placement = {
      id: sim.nextId++, kind: "landmark", type: l.kind, x: l.pos[0], y: l.pos[1], landmark: l, built: 0,
      spec: { radius, loss, refund, name: l.name },
    };
    sim.placements.push(l.placement);
  });

  // ---------- scoring ----------
  sim.challengeBonus = 0;
  sim.score = function (override) {
    const m = sim.meters(override);
    const capped = m.map((v) => Math.min(v, 1.25));
    const meterPts = capped.reduce((a, v) => a + v * 1000, 0);
    const balance = Math.max(0, Math.min(...capped)) * 1500; // reward optimising EVERY meter
    const gapPts = (sim.baseGap - gap(override)) * 400;
    const total = Math.round(meterPts + balance + gapPts + sim.challengeBonus + sim.budget * 0.5);
    return { meters: m, meterPts, balance, gapPts, challenge: sim.challengeBonus, budget: sim.budget * 0.5, total };
  };

  sim.active = (filter) => sim.placements.filter((p) => !p.removed && (!filter || filter(p)));
})();
