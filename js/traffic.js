// Live traffic on the real road network (OpenStreetMap freeways and arterials).
// Thousands of small vehicles drive along the actual roads. How busy each road is depends on:
//   - the land around it (commercial + industrial land pulls trips, parks and homes pull fewer),
//   - the time of day (morning and evening rush hours across the 10-minute term),
//   - what you build (a Jobs Hub or Factory adds trips nearby, a CTrain station takes cars off the road),
//   - incidents (a flood, fire or collapse closes the roads around it and the queues build up).
// The city-wide Traffic index feeds back into the budget: gridlock costs the city tax revenue.
(function () {
  const CP = window.CP;
  const G = CP.GEO;
  const sim = CP.sim;
  const T = (CP.traffic = { ready: false, index: 0, ways: [], cars: [], closures: [], label: "Light", mult: 1 });

  const FREE = { 1: 70, 2: 100, 3: 160 }; // game-world m/s, time-compressed so the motion reads on screen
  const WIDTH = { 1: 11, 2: 20, 3: 30 };
  // trips added (+) or removed (-) around a building, within RADIUS metres
  const EFFECT = { jobs: 0.3, factory: 0.22, datacentre: 0.05, hospital: 0.16, school: 0.1, grocery: 0.06, library: 0.04, childcare: 0.05, community: 0.03, park: -0.04, transit: -0.42, clinic: 0.04, wastewater: 0.02 };
  const RADIUS = 2400;
  const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  // rush hours at ~20% and ~72% of the term
  T.rush = (f) => 0.55 + 0.45 * Math.max(gauss(f, 0.2, 0.07), gauss(f, 0.72, 0.08));

  const linePath = (line) => {
    const p = new Path2D();
    p.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) p.lineTo(line[i][0], line[i][1]);
    return p;
  };

  T.init = function () {
    if (!G.hasOSM) return;
    const src = G.roads;
    for (const r of src) {
      const cum = [0];
      for (let i = 1; i < r.line.length; i++) cum.push(cum[i - 1] + CP.dist(r.line[i - 1][0], r.line[i - 1][1], r.line[i][0], r.line[i][1]));
      const len = cum[cum.length - 1];
      if (len < (r.cls === 1 ? 260 : 120)) continue;
      const mid = r.line[Math.floor(r.line.length / 2)];
      const bb = r.bb;
      const mix = CP.world.zoneMix(mid[0], mid[1], 700);
      const n = mix.n || 1;
      // trips pulled by the surrounding land use: jobs areas are busiest
      const pull = (mix.C * 1.0 + mix.I * 0.8 + mix.R * 0.45 + mix.P * 0.1) / n;
      const cls = r.cls;
      T.ways.push({ line: r.line, cum, len, cls, mid, bb, base: CP.clamp(0.1 + pull * 0.9 + (cls === 3 ? 0.12 : 0), 0, 0.9), c: 0.25, target: 0.25, closed: false, path: linePath(r.line), name: r.name, d: sim.districtAt(mid[0], mid[1]) });
    }
    // vehicles, spread over the ways in proportion to length and importance
    const rand = CP.rng(404);
    const wt = T.ways.map((w) => w.len * (w.cls === 3 ? 2.4 : w.cls === 2 ? 1.5 : 0.35));
    const tot = wt.reduce((a, v) => a + v, 0);
    const N = 1100;
    const PAL = ["#ffffff", "#f1f3f5", "#ffd43b", "#ff6b6b", "#4dabf7", "#2b2f3a", "#63e6be", "#ced4da"];
    for (let i = 0; i < N; i++) {
      let r = rand() * tot, k = 0;
      while (k < wt.length - 1 && (r -= wt[k]) > 0) k++;
      const w = T.ways[k];
      T.cars.push({ w, s: rand() * w.len, dir: rand() < 0.5 ? 1 : -1, f: 0.75 + rand() * 0.5, seg: 0, col: PAL[Math.floor(rand() * PAL.length)] });
    }
    T.cityWays = T.ways.filter((w) => w.cls >= 2);
    T.refresh(0.25, 1);
    T.ready = true;
  };

  // closures from incidents: [{id, x, y, r}] -> the ways inside the circle stop
  T.closeRoads = function (id, x, y, r) {
    T.closures.push({ id, x, y, r });
    return T.markClosed();
  };
  T.openRoads = function (id) {
    T.closures = T.closures.filter((c) => c.id !== id);
    T.markClosed();
  };
  T.markClosed = function () {
    let n = 0;
    for (const w of T.ways) {
      w.closed = T.closures.some((c) => w.cls >= 2 && CP.dist(w.mid[0], w.mid[1], c.x, c.y) < c.r);
      if (w.closed) n++;
    }
    T.dirty = true;
    return n;
  };
  // how many ways would a closure of radius r at (x, y) shut?
  T.countNear = (x, y, r) => T.ways.reduce((a, w) => a + (w.cls >= 2 && CP.dist(w.mid[0], w.mid[1], x, y) < r ? 1 : 0), 0);

  // target congestion of every way from land use, time of day, buildings and closures
  T.refresh = function (dayFrac, dt) {
    const rush = T.rush(CP.clamp(dayFrac, 0, 1));
    const blds = sim.buildings.filter((b) => EFFECT[b.type] !== undefined).map((b) => ({ x: b.x, y: b.y, e: EFFECT[b.type] })).concat(sim.removals.map((r) => ({ x: r.x, y: r.y, e: r.spec.traffic || 0 })));
    let sum = 0, wsum = 0;
    for (const w of T.ways) {
      let add = 0;
      for (const b of blds) {
        const dx = w.mid[0] - b.x, dy = w.mid[1] - b.y;
        if (Math.abs(dx) > RADIUS || Math.abs(dy) > RADIUS) continue;
        const d = Math.hypot(dx, dy);
        if (d < RADIUS) add += b.e * (1 - d / RADIUS);
      }
      // a tiny per-road wobble keeps the picture alive
      const wob = 0.06 * Math.sin(performance.now() / 2600 + w.mid[0] * 0.0007 + w.mid[1] * 0.0011);
      w.target = w.closed ? 1 : CP.clamp((w.base + add) * (0.45 + 0.9 * rush) + wob, 0.02, 0.98);
      w.c += (w.target - w.c) * Math.min(1, dt * 1.2);
      const bk = w.closed ? 3 : w.c < 0.38 ? 0 : w.c < 0.62 ? 1 : 2;
      if (bk !== w.bk) { w.bk = bk; T.dirty = true; } // only repaint the road colours when a road changes colour
      if (w.cls >= 2) {
        const wgt = w.len * (w.cls === 3 ? 1.6 : 1);
        sum += w.c * wgt;
        wsum += wgt;
      }
    }
    T.index = wsum ? sum / wsum : 0;
    T.label = T.index < 0.3 ? "Light" : T.index < 0.45 ? "Moderate" : T.index < 0.62 ? "Heavy" : "Gridlock";
    // gridlock costs tax revenue: up to -14%
    T.mult = 1 - 0.14 * Math.pow(CP.clamp((T.index - 0.25) / 0.6, 0, 1), 1.3);
  };

  // ---------- per frame ----------
  let acc = 0;
  T.update = function (dt, dayFrac) {
    if (!T.ready) return;
    acc += dt;
    if (acc > 0.5) { T.refresh(dayFrac === null || dayFrac === undefined ? 0.3 : dayFrac, acc); acc = 0; }
    for (const v of T.cars) {
      const w = v.w;
      const spd = w.closed ? 0 : FREE[w.cls] * (1 - 0.88 * w.c) * v.f;
      v.s += v.dir * spd * dt;
      if (v.s > w.len) { v.s = 0; v.seg = 0; } else if (v.s < 0) { v.s = w.len; v.seg = w.line.length - 2; }
    }
  };

  const COL = (c, closed) => (closed ? "#2a2d3a" : c < 0.38 ? "#37c871" : c < 0.62 ? "#ffb703" : "#ef3b3b");
  // the arterials on screen, painted by how busy they are (only for ways in view, and only when zoomed in)
  T.drawRoads = function (ctx, z, hit) {
    if (!T.ready || z < 0.05) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.9;
    for (const w of T.cityWays) {
      if (!hit(w.bb)) continue;
      ctx.strokeStyle = COL(w.c, w.closed);
      ctx.lineWidth = Math.max(w.cls === 3 ? 26 : 18, 2.6 / z);
      ctx.stroke(w.path);
    }
    ctx.globalAlpha = 1;
  };

  // vehicles (world-space), only the ones in view
  T.drawCars = function (ctx, z, view) {
    if (!T.ready || z < 0.045) return;
    const L = Math.max(46, 6.5 / z), Wd = L * 0.5;
    const [x0, y0, x1, y1] = view;
    for (const v of T.cars) {
      const w = v.w;
      const bb = w.bb;
      if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) continue;
      // locate the segment
      let i = Math.min(Math.max(v.seg, 0), w.line.length - 2);
      while (i < w.line.length - 2 && w.cum[i + 1] < v.s) i++;
      while (i > 0 && w.cum[i] > v.s) i--;
      v.seg = i;
      const a = w.line[i], b = w.line[i + 1];
      const segLen = w.cum[i + 1] - w.cum[i] || 1;
      const t = (v.s - w.cum[i]) / segLen;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (v.dir < 0 ? Math.PI : 0);
      // keep to the right-hand lane
      const off = Wd * 0.7;
      const ox = -Math.sin(ang) * -off, oy = Math.cos(ang) * -off;
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(20,24,40,0.55)";
      ctx.fillRect(-L / 2 - Wd * 0.12, -Wd / 2 - Wd * 0.12, L + Wd * 0.24, Wd + Wd * 0.24);
      ctx.fillStyle = w.closed ? "#ff6b6b" : v.col;
      ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      ctx.restore();
    }
  };

  // busiest named roads right now (for the info card)
  T.busiest = function (n) {
    return T.cityWays.filter((w) => w.name).sort((a, b) => b.c - a.c).filter((w, i, arr) => arr.findIndex((q) => q.name === w.name) === i).slice(0, n || 3);
  };
  // congestion around a district (average of its arterials)
  T.districtIndex = function (d) {
    let s = 0, n = 0;
    for (const w of T.cityWays) if (w.d === d) { s += w.c; n++; }
    return n ? s / n : 0;
  };
})();
