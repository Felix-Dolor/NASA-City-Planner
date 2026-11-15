// Simulation: groups Calgary's census tracts into districts, scores every district on the six
// equity metrics (0-100, higher = more equitable) and applies the buildings the player places.
(function () {
  const CP = window.CP;
  const D = window.CEI_DATA;
  const ND = 6;

  const sim = (CP.sim = {
    tracts: D.tracts,
    districts: [],
    buildings: [], // everything the player has placed
    budget: CP.START_BUDGET,
    spent: 0,
    nextId: 1,
  });

  // ---------- tract prep ----------
  const pct = (arr, p) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  };
  const col = (k) => D.tracts.map((t) => t[k]);
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
    return { id, name: def.name, def, x, y, tracts: [], base: new Array(ND).fill(0), add: new Array(ND).fill(0), score: new Array(ND).fill(0), overall: 0, loops: [] };
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
    for (let i = 0; i < ND; i++) d.base[i] = d.tracts.reduce((a, t) => a + t.s[i], 0) / d.tracts.length;
    refresh(d);
    d.startScore = d.score.slice();
    d.startOverall = d.overall;
  }

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
    });
  })();

  // ---------- scores ----------
  sim.overall = () => sim.districts.reduce((a, d) => a + d.overall, 0) / sim.districts.length;
  sim.metricAvg = (i) => sim.districts.reduce((a, d) => a + d.score[i], 0) / sim.districts.length;
  sim.weakest = function (d) {
    let m = 0;
    for (let i = 1; i < ND; i++) if (d.score[i] < d.score[m]) m = i;
    return m;
  };
  // what district d's six scores would be after adding a building of this type
  sim.after = (type, d) => d.score.map((v, i) => Math.min(100, v + CP.BUILDINGS[type].gain[i]));

  // ---------- placing buildings ----------
  sim.canAfford = (cost) => sim.budget >= cost - 1e-6;

  sim.siteCheck = function (x, y) {
    const d = sim.districtAt(x, y);
    if (!d) return { ok: false, why: "Outside Calgary's city limits" };
    if (CP.world.waterAt(x, y, 60)) return { ok: false, why: "You can't build on water", d };
    for (const p of sim.buildings)
      if (CP.dist(p.x, p.y, x, y) < CP.MIN_SPACING) return { ok: false, why: `Too close to the ${CP.BUILDINGS[p.type].name}. Spread buildings out.`, d };
    return { ok: true, d };
  };

  sim.place = function (type, x, y) {
    const spec = CP.BUILDINGS[type];
    const site = sim.siteCheck(x, y);
    if (!site.ok) return { ok: false, why: site.why };
    if (!sim.canAfford(spec.cost)) return { ok: false, why: "Not enough budget" };
    const d = site.d;
    const before = d.score.slice();
    for (let i = 0; i < ND; i++) d.add[i] += spec.gain[i];
    refresh(d);
    const p = { id: sim.nextId++, type, x, y, d, built: performance.now() };
    sim.buildings.push(p);
    sim.budget -= spec.cost;
    sim.spent += spec.cost;
    return { ok: true, p, d, before, after: d.score.slice() };
  };

  // ---------- final score ----------
  sim.finalScore = function () {
    const equity = Math.round(sim.overall() * CP.FINAL.perEquityPoint);
    const budget = Math.round(sim.budget * CP.FINAL.perBudgetM);
    return { equity, budget, total: equity + budget };
  };
})();
