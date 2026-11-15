// Simulation: groups Calgary's census tracts into districts, scores every district on the six equity
// metrics (0-100, higher = more equitable), lays out building lots and works out what every building does:
// its own district's gain, its effect circle across district borders, upkeep, demolition, rezoning and events.
(function () {
  const CP = window.CP;
  const D = window.CEI_DATA;
  const ND = 6;

  const sim = (CP.sim = {
    tracts: D.tracts,
    districts: [],
    lots: [],
    buildings: [], // everything the player has placed
    penalties: [], // active random-event damage: {d, m, amount, ev, fixed}
    protests: new Map(), // district id -> seconds left
    budget: CP.START_BUDGET,
    spent: 0,
    nextId: 1,
    version: 0, // bumps on every change (preview cache key)
  });

  // ---------- tract prep ----------
  const pct = (arr, p) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  };
  const col = (k) => D.tracts.map((t) => t[k]);
  const mean = (arr) => arr.reduce((a, v) => a + v, 0) / (arr.length || 1);
  const SC = CP.SCORE_SCALE;
  const lo = D.domains.map((k) => pct(col(k), 0.05));
  const hi = D.domains.map((k) => pct(col(k), 0.95));
  D.tracts.forEach((t, i) => {
    t.idx = i;
    // CEI domain score (higher = more need) -> equity score (higher = better), relative to the rest of Calgary
    t.s = D.domains.map((k, j) => CP.clamp(SC.best - (SC.span * (t[k] - lo[j])) / (hi[j] - lo[j] || 1), SC.min, SC.max));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of t.rings) for (let k = 0; k < r.length; k += 2) {
      x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
    }
    t.bbox = [x0, y0, x1, y1];
  });

  // Calgary-wide averages of every real indicator and of the raw CEI domain scores (for the Plan tab and the report)
  const ALL_IND = CP.INDICATORS.concat(CP.CONTEXT_INDICATORS);
  sim.cityInd = {};
  for (const ind of ALL_IND) sim.cityInd[ind.key] = mean(col(ind.key));
  sim.realDomain = D.domains.map((k) => mean(col(k)));

  // ---------- tract spatial index ----------
  const GS = 1000;
  const gkey = (gx, gy) => (gx + 500) * 4096 + gy + 500;
  const tgrid = new Map();
  D.tracts.forEach((t) => {
    for (let gx = Math.floor(t.bbox[0] / GS); gx <= Math.floor(t.bbox[2] / GS); gx++)
      for (let gy = Math.floor(t.bbox[1] / GS); gy <= Math.floor(t.bbox[3] / GS); gy++) {
        const k = gkey(gx, gy);
        if (!tgrid.has(k)) tgrid.set(k, []);
        tgrid.get(k).push(t);
      }
  });
  sim.tractAt = function (x, y) {
    const c = tgrid.get(gkey(Math.floor(x / GS), Math.floor(y / GS)));
    if (!c) return null;
    for (const t of c) {
      const b = t.bbox;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && CP.pointInRings(x, y, t.rings)) return t;
    }
    return null;
  };

  // ---------- districts ----------
  sim.districts = CP.DISTRICTS.map((def, id) => {
    const [x, y] = CP.project(def.at[0], def.at[1]);
    return {
      id, name: def.name, def, x, y, traits: def.traits || {}, tracts: [], loops: [], lots: [], homes: [], homeW: 0,
      base: new Array(ND).fill(0), add: new Array(ND).fill(0), score: new Array(ND).fill(0), overall: 0, ind: {},
    };
  });
  for (const t of sim.tracts) {
    let best = null, bd = Infinity;
    for (const d of sim.districts) {
      const dd = CP.dist(d.x, d.y, t.c[0], t.c[1]);
      if (dd < bd) { bd = dd; best = d; }
    }
    t.d = best;
    best.tracts.push(t);
  }
  function refresh(d) {
    let s = 0;
    for (let i = 0; i < ND; i++) {
      d.score[i] = CP.clamp(d.base[i] + d.add[i], 0, 100);
      s += d.score[i];
    }
    d.overall = s / ND;
  }
  for (const d of sim.districts) {
    for (let i = 0; i < ND; i++) d.base[i] = mean(d.tracts.map((t) => t.s[i]));
    for (const ind of ALL_IND) d.ind[ind.key] = mean(d.tracts.map((t) => t[ind.key]));
    d.population = d.tracts.length * CP.PEOPLE_PER_TRACT;
    d.households = Math.round(d.population / CP.PEOPLE_PER_HOME);
    refresh(d);
    d.startScore = d.score.slice();
    d.startOverall = d.overall;
  }

  // the district's worst real indicators in one metric, relative to Calgary (most behind first)
  sim.worstIndicators = function (d, m) {
    return CP.INDICATORS.filter((ind) => ind.domain === m && ind.dir !== 0 && sim.cityInd[ind.key])
      .map((ind) => {
        const v = d.ind[ind.key], avg = sim.cityInd[ind.key];
        return { ind, v, avg, gap: (ind.dir * (avg - v)) / (Math.abs(avg) || 1) }; // > 0 = worse than Calgary
      })
      .sort((a, b) => b.gap - a.gap);
  };

  // ---------- district raster: fast lookups, label points and clean outlines ----------
  // Tract outlines were simplified independently, so they don't share edges. Rasterising the
  // districts on a 60 m grid and tracing that grid gives gap-free outlines for thick borders.
  const G = 60;
  const gx0 = D.bounds[0], gy0 = D.bounds[1];
  const GW = Math.ceil((D.bounds[2] - gx0) / G), GH = Math.ceil((D.bounds[3] - gy0) / G);
  const ids = new Int8Array(GW * GH).fill(-1);
  for (let cy = 0; cy < GH; cy++)
    for (let cx = 0; cx < GW; cx++) {
      const t = sim.tractAt(gx0 + (cx + 0.5) * G, gy0 + (cy + 0.5) * G);
      if (t) ids[cy * GW + cx] = t.d.id;
    }
  // close hairline gaps between neighbouring tracts
  for (let pass = 0; pass < 2; pass++)
    for (let cy = 1; cy < GH - 1; cy++)
      for (let cx = 1; cx < GW - 1; cx++) {
        const i = cy * GW + cx;
        if (ids[i] >= 0) continue;
        if (ids[i - 1] >= 0 && ids[i + 1] >= 0) ids[i] = ids[i - 1];
        else if (ids[i - GW] >= 0 && ids[i + GW] >= 0) ids[i] = ids[i - GW];
      }
  const idAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= GW || cy >= GH ? -1 : ids[cy * GW + cx]);
  sim.districtAt = function (x, y) {
    const k = idAt(Math.floor((x - gx0) / G), Math.floor((y - gy0) / G));
    return k < 0 ? null : sim.districts[k];
  };

  // label point = the spot deepest inside each district (breadth-first distance from its border)
  (function labelPoints() {
    const dist = new Int16Array(GW * GH);
    const queue = new Int32Array(GW * GH);
    let head = 0, tail = 0;
    for (let cy = 0; cy < GH; cy++)
      for (let cx = 0; cx < GW; cx++) {
        const i = cy * GW + cx, k = ids[i];
        if (k < 0) continue;
        if (idAt(cx - 1, cy) !== k || idAt(cx + 1, cy) !== k || idAt(cx, cy - 1) !== k || idAt(cx, cy + 1) !== k) {
          dist[i] = 1;
          queue[tail++] = i;
        }
      }
    const best = sim.districts.map(() => [0, 0]);
    while (head < tail) {
      const i = queue[head++], k = ids[i], dv = dist[i];
      if (dv > best[k][0]) best[k] = [dv, i];
      const cx = i % GW;
      const nb = [cx > 0 ? i - 1 : -1, cx < GW - 1 ? i + 1 : -1, i - GW, i + GW];
      for (const j of nb) {
        if (j < 0 || j >= ids.length || ids[j] !== k || dist[j]) continue;
        dist[j] = dv + 1;
        queue[tail++] = j;
      }
    }
    sim.districts.forEach((d, k) => {
      const i = best[k][1];
      d.label = [gx0 + ((i % GW) + 0.5) * G, gy0 + (Math.floor(i / GW) + 0.5) * G];
      d.inradius = best[k][0] * G;
    });
  })();

  // trace each district's outline from the grid, then smooth the staircase
  (function outlines() {
    const VW = GW + 1;
    const maps = sim.districts.map(() => new Map());
    const add = (k, ax, ay, bx, by) => {
      const a = ay * VW + ax;
      let l = maps[k].get(a);
      if (!l) maps[k].set(a, (l = []));
      l.push(by * VW + bx);
    };
    for (let cy = 0; cy < GH; cy++)
      for (let cx = 0; cx < GW; cx++) {
        const k = ids[cy * GW + cx];
        if (k < 0) continue;
        if (idAt(cx, cy - 1) !== k) add(k, cx, cy, cx + 1, cy);
        if (idAt(cx + 1, cy) !== k) add(k, cx + 1, cy, cx + 1, cy + 1);
        if (idAt(cx, cy + 1) !== k) add(k, cx + 1, cy + 1, cx, cy + 1);
        if (idAt(cx - 1, cy) !== k) add(k, cx, cy + 1, cx, cy);
      }
    sim.districts.forEach((d, k) => {
      const m = maps[k];
      for (const [start, ends] of m) {
        while (ends.length) {
          const loop = [start];
          let cur = ends.pop(), guard = 0;
          while (cur !== start && guard++ < 1e6) {
            loop.push(cur);
            const l = m.get(cur);
            if (!l || !l.length) break;
            cur = l.pop();
          }
          if (loop.length < 10) continue; // ignore specks
          // midpoints of the grid edges turn staircases into diagonals; one Chaikin pass rounds corners
          const n = loop.length, mids = [];
          for (let i = 0; i < n; i++) {
            const a = loop[i], b = loop[(i + 1) % n];
            mids.push([((a % VW) + (b % VW)) / 2, (Math.floor(a / VW) + Math.floor(b / VW)) / 2]);
          }
          const pts = [];
          for (let i = 0; i < n; i++) {
            const p = mids[i], q = mids[(i + 1) % n];
            pts.push([gx0 + (0.75 * p[0] + 0.25 * q[0]) * G, gy0 + (0.75 * p[1] + 0.25 * q[1]) * G]);
            pts.push([gx0 + (0.25 * p[0] + 0.75 * q[0]) * G, gy0 + (0.25 * p[1] + 0.75 * q[1]) * G]);
          }
          d.loops.push(pts);
        }
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const loop of d.loops) for (const [x, y] of loop) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      d.bbox = [x0, y0, x1, y1];
    });
  })();

  // neighbouring districts (share a border on the raster)
  (function neighbours() {
    const nb = sim.districts.map(() => new Set());
    for (let cy = 0; cy < GH; cy++)
      for (let cx = 0; cx < GW - 1; cx++) {
        const a = ids[cy * GW + cx], b = ids[cy * GW + cx + 1], c = cy < GH - 1 ? ids[(cy + 1) * GW + cx] : -1;
        if (a >= 0 && b >= 0 && a !== b) { nb[a].add(b); nb[b].add(a); }
        if (a >= 0 && c >= 0 && a !== c) { nb[a].add(c); nb[c].add(a); }
      }
    sim.districts.forEach((d, k) => (d.neighbours = [...nb[k]].map((j) => sim.districts[j])));
  })();

  // ---------- homes and lots (need the world module, so they are set up after it loads) ----------
  sim.initWorld = function () {
    const world = CP.world, B = world.CELL, b = D.bounds;
    const W = { house: 1, midrise: 3, tower: 6 };
    for (let bx = Math.floor(b[0] / B); bx <= Math.floor(b[2] / B); bx++)
      for (let by = Math.floor(b[1] / B); by <= Math.floor(b[3] / B); by++) {
        const c = world.cell(bx, by);
        if (!c.t || !W[c.cls]) continue;
        const d = sim.districtAt(c.cx, c.cy) || c.t.d;
        d.homes.push({ x: c.cx, y: c.cy, w: W[c.cls], bx, by });
      }
    for (const d of sim.districts) {
      if (!d.homes.length) d.homes = d.tracts.map((t) => ({ x: t.c[0], y: t.c[1], w: 1 }));
      d.homeW = d.homes.reduce((a, h) => a + h.w, 0);
    }
    makeLots();
  };

  // 4-6 lots per district, spread out near its centre, away from water, highways and landmarks
  function makeLots() {
    const world = CP.world;
    const rand = CP.rng(1875);
    const inside = (d, x, y, m) =>
      sim.districtAt(x, y) === d && sim.districtAt(x - m, y) === d && sim.districtAt(x + m, y) === d &&
      sim.districtAt(x, y - m * 0.6) === d && sim.districtAt(x, y + m * 0.6) === d;
    let id = 0;
    for (const d of sim.districts) {
      const zones = d.def.lots.split("");
      const cands = [];
      for (let x = d.bbox[0]; x <= d.bbox[2]; x += 220)
        for (let y = d.bbox[1]; y <= d.bbox[3]; y += 220)
          if (sim.districtAt(x, y) === d) cands.push([x, y]);
      const pick = (spacing, margin, strict) => {
        const got = [];
        const ok = cands.filter(([x, y]) => inside(d, x, y, margin) && !world.waterAt(x, y, strict ? 500 : 250) &&
          !world.highwayAt(x, y, strict ? 420 : 200) && !world.landmarkNear(x, y, strict ? 1 : 0.6));
        ok.sort((a, b) => CP.dist(a[0], a[1], d.label[0], d.label[1]) - CP.dist(b[0], b[1], d.label[0], d.label[1]));
        for (const p of ok) {
          if (got.length >= zones.length) break;
          if (got.every((q) => Math.abs(q[0] - p[0]) / 1.9 + Math.abs(q[1] - p[1]) > spacing)) got.push(p);
        }
        return got;
      };
      let pts = pick(1050, 650, true);
      if (pts.length < Math.min(4, zones.length)) pts = pick(950, 450, false);
      if (pts.length < Math.min(4, zones.length)) pts = pick(820, 250, false);
      d.lots = pts.map(([x, y], i) => {
        const zone = zones[i];
        const lot = {
          id: id++, d, x, y, zone, origZone: zone, building: null,
          house: zone === "R" && rand() < 0.55, // an existing home: building here means demolishing it
          lock: i >= 4 ? i - 3 : 0, // the 5th and 6th lots open as contracts are completed
        };
        sim.lots.push(lot);
        return lot;
      });
    }
  }
  sim.unlockedTier = 0;
  sim.isLocked = (lot) => lot.lock > sim.unlockedTier;

  // share of a district's homes inside a circle
  function homeFrac(d, x, y, r) {
    if (!d.homeW) return 0;
    const bb = d.bbox;
    if (x + r < bb[0] || x - r > bb[2] || y + r < bb[1] || y - r > bb[3]) return 0;
    let s = 0;
    const r2 = r * r;
    for (const h of d.homes) {
      const dx = h.x - x, dy = h.y - y;
      if (dx * dx + dy * dy <= r2) s += h.w;
    }
    return s / d.homeW;
  }
  // per-district shares for a building at (x, y) with an effect radius r
  function fracsFor(x, y, r) {
    const out = [];
    for (const d of sim.districts) {
      const f = homeFrac(d, x, y, r);
      if (f > 0) out.push([d, f]);
    }
    return out;
  }

  // ---------- the effect model ----------
  const buffered = (b, list) => list.some((p) => p !== b && CP.BUILDINGS[p.type].buffer && CP.dist(p.x, p.y, b.x, b.y) < CP.PARK_BUFFER);

  // adds per district for a list of buildings (plus the active event penalties)
  function contributions(list) {
    const add = sim.districts.map(() => new Array(ND).fill(0));
    let harmedHomes = 0, helpedHomes = 0;
    const harm = []; // [{b, homes, buffered}]
    for (const b of list) {
      const spec = CP.BUILDINGS[b.type], own = add[b.d.id];
      for (let i = 0; i < ND; i++) own[i] += spec.gain[i];
      if (b.demolished) for (let i = 0; i < ND; i++) own[i] += CP.DEMOLISH.gain[i];
      if (b.rezoned) own[3] -= CP.REZONE.goodwill;
      const a = spec.area;
      if (!a) continue;
      if (!b.fracs) b.fracs = fracsFor(b.x, b.y, a.r);
      const buf = a.harm && buffered(b, list) ? CP.BUFFER_KEEP : 1;
      const neg = a.gain.some((g) => g < 0), pos = a.gain.some((g) => g > 0);
      let homes = 0;
      for (const [d, f] of b.fracs) {
        const t = add[d.id];
        for (let i = 0; i < ND; i++) {
          let g = a.gain[i];
          if (!g) continue;
          if (g < 0) g *= buf;
          if (i === 3 && a.rent && d.traits.highRent && g < 0) g *= 2;
          t[i] += g * f;
        }
        homes += f * d.households;
      }
      if (neg) harmedHomes += homes * (a.harm ? buf : 1);
      if (pos) helpedHomes += homes;
      if (neg) harm.push({ b, homes: Math.round(homes), buffered: buf < 1 });
    }
    for (const p of sim.penalties) if (!p.fixed) add[p.d.id][p.m] -= p.amount;
    return { add, harm, harmedHomes: Math.round(harmedHomes), helpedHomes: Math.round(helpedHomes) };
  }

  function apply() {
    const c = contributions(sim.buildings);
    for (const d of sim.districts) {
      d.add = c.add[d.id];
      refresh(d);
    }
    sim.harm = c.harm;
    sim.version++;
  }
  sim.recompute = apply;

  // ---------- scores ----------
  sim.overall = () => sim.districts.reduce((a, d) => a + d.overall, 0) / sim.districts.length;
  sim.metricAvg = (i) => sim.districts.reduce((a, d) => a + d.score[i], 0) / sim.districts.length;
  sim.startAvg = CP.DOMAINS.map((_, i) => sim.metricAvg(i));
  sim.startOverall = sim.overall();
  sim.weakest = function (d) {
    let m = 0;
    for (let i = 1; i < ND; i++) if (d.score[i] < d.score[m]) m = i;
    return m;
  };
  sim.upkeep = () => sim.buildings.reduce((a, b) => a + (CP.BUILDINGS[b.type].upkeep || 0), 0);
  sim.income = () => CP.INCOME_PER_MIN + sim.buildings.reduce((a, b) => a + (CP.BUILDINGS[b.type].income || 0), 0);
  sim.netPerMin = () => sim.income() - sim.upkeep();

  // ---------- placing buildings ----------
  sim.canAfford = (cost) => sim.budget >= cost - 1e-6;
  const round05 = (v) => Math.round(v * 2) / 2;
  sim.baseCost = (type, d) => round05(CP.BUILDINGS[type].cost * (d ? d.def.cost : 1));

  // can this building go on this lot, and what does it cost?
  sim.lotCheck = function (type, lot, rezone) {
    const spec = CP.BUILDINGS[type];
    const out = { lot, d: lot.d, ok: false, base: sim.baseCost(type, lot.d), demolish: lot.house ? CP.DEMOLISH.cost : 0, rezone: 0 };
    out.allowed = spec.zones.includes(lot.zone);
    out.cost = out.base + out.demolish;
    if (lot.building) return Object.assign(out, { why: `This lot already has a ${CP.BUILDINGS[lot.building.type].name}.` });
    if (sim.isLocked(lot)) return Object.assign(out, { locked: true, why: `Locked. Opens after ${lot.lock * CP.MISSIONS.unlockEvery} completed missions.` });
    const pr = sim.protests.get(lot.d.id);
    if (pr > 0) return Object.assign(out, { protest: true, why: `Residents are protesting. Building here resumes in ${Math.ceil(pr)} s.` });
    if (!out.allowed) {
      out.toZone = spec.zones[0];
      out.why = `${spec.name}: ${zoneList(spec.zones)} lots only. This lot is ${CP.ZONES[lot.zone].name}.`;
      if (!rezone) return out;
      out.rezone = CP.REZONE.cost;
      out.cost += out.rezone;
    }
    if (!sim.canAfford(out.cost)) return Object.assign(out, { short: true, why: `Not enough budget: you need ${CP.money(out.cost)}.` });
    out.ok = true;
    return out;
  };
  const zoneList = (z) => z.split("").map((k) => CP.ZONES[k].name).join(" or ");
  sim.zoneList = zoneList;

  // what would change if this building went on this lot (cached until the city changes)
  let pcache = { key: "", val: null };
  sim.preview = function (type, lot, rezone) {
    const key = `${type}|${lot.id}|${rezone ? 1 : 0}|${sim.version}|${Math.floor(sim.budget)}`;
    if (pcache.key === key) return pcache.val;
    const check = sim.lotCheck(type, lot, rezone);
    const spec = CP.BUILDINGS[type];
    const hyp = { type, x: lot.x, y: lot.y, d: lot.d, demolished: lot.house, rezoned: !check.allowed };
    const c = contributions(sim.buildings.concat([hyp]));
    const diffs = [];
    let overallAfter = 0;
    for (const d of sim.districts) {
      const after = d.base.map((v, i) => CP.clamp(v + c.add[d.id][i], 0, 100));
      const ov = after.reduce((a, v) => a + v, 0) / ND;
      overallAfter += ov;
      const delta = after.map((v, i) => v - d.score[i]);
      if (delta.some((v) => Math.abs(v) >= 0.5)) diffs.push({ d, before: d.score.slice(), after, delta, own: d === lot.d });
    }
    diffs.sort((a, b) => b.own - a.own || Math.max(...b.delta.map(Math.abs)) - Math.max(...a.delta.map(Math.abs)));
    const h = c.harm.find((x) => x.b === hyp);
    const val = Object.assign(check, {
      type, spec, diffs, r: spec.area ? spec.area.r : 0,
      harmedHomes: h ? h.homes : 0, buffered: h ? h.buffered : false,
      helpedHomes: spec.area && spec.area.gain.some((g) => g > 0) ? Math.round(fracsFor(lot.x, lot.y, spec.area.r).reduce((a, [d, f]) => a + f * d.households, 0)) : 0,
      overallBefore: sim.overall(), overallAfter: overallAfter / sim.districts.length,
    });
    val.protestRisk = !!(spec.area && spec.area.harm && h && !h.buffered && h.homes >= CP.PROTEST.homes);
    pcache = { key, val };
    return val;
  };

  sim.place = function (type, lot, rezone) {
    const check = sim.lotCheck(type, lot, rezone);
    if (!check.ok) return { ok: false, why: check.why };
    const d = lot.d;
    const before = d.score.slice(), overallBefore = sim.overall();
    const b = {
      id: sim.nextId++, type, lot, x: lot.x, y: lot.y, d, cost: check.cost, built: performance.now(),
      demolished: lot.house, rezoned: !check.allowed, fromZone: lot.zone, fixed: [],
    };
    if (b.rezoned) lot.zone = check.toZone;
    lot.house = false;
    lot.building = b;
    sim.buildings.push(b);
    sim.budget -= check.cost;
    sim.spent += check.cost;
    // a matching building recovers event damage in its district
    for (const p of sim.penalties)
      if (!p.fixed && p.d === d && CP.EVENT_TYPES[p.ev].fix.includes(type)) { p.fixed = true; b.fixed.push(p); }
    apply();
    const h = sim.harm.find((x) => x.b === b);
    if (h && !h.buffered && CP.BUILDINGS[type].area.harm && h.homes >= CP.PROTEST.homes) {
      sim.protests.set(d.id, CP.PROTEST.seconds);
      b.protest = true;
    }
    return { ok: true, b, d, before, after: d.score.slice(), overallBefore, harm: h, check };
  };

  // undo a placement: full refund, the lot goes back to how it was
  sim.undo = function (b) {
    const i = sim.buildings.indexOf(b);
    if (i < 0) return false;
    sim.buildings.splice(i, 1);
    b.lot.building = null;
    b.lot.zone = b.fromZone;
    b.lot.house = b.demolished;
    sim.budget += b.cost;
    sim.spent -= b.cost;
    for (const p of b.fixed) p.fixed = false;
    if (b.protest) sim.protests.delete(b.d.id);
    apply();
    return true;
  };

  // ---------- random events ----------
  sim.addPenalty = function (d, m, ev) {
    const s = d.score[m], idx = CP.bandIndex(s);
    const amount = idx === 0 ? Math.min(8, s) : CP.clamp(s - ((idx - 1) * 20 + 12), 8, 20); // one band down
    const p = { d, m, ev, amount, fixed: false };
    sim.penalties.push(p);
    apply();
    return p;
  };

  sim.tickProtests = function (dt) {
    for (const [k, v] of sim.protests) {
      if (v - dt <= 0) sim.protests.delete(k);
      else sim.protests.set(k, v - dt);
    }
  };

  // ---------- final score ----------
  sim.finalScore = function () {
    const equity = Math.round(sim.overall() * CP.FINAL.perEquityPoint);
    const budget = Math.round(Math.max(0, sim.budget) * CP.FINAL.perBudgetM);
    return { equity, budget, total: equity + budget };
  };
})();
