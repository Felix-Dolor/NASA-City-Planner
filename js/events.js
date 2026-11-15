// Events: natural and human disasters that STAY until you deal with them, plus the odd piece of good news.
// A disaster has a place on the map, a radius, an effect on one rating, a money drain per minute and closed roads
// (which jam up the live traffic). Left alone it escalates: it grows, hurts a second rating and spreads to the
// neighbouring district. You end it by building the matching fix in that district, or by paying for emergency crews.
// Where it strikes follows the real data: floods and heavy rain favour districts with high CEI flood susceptibility
// and the river districts (Bowness, Inglewood).
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const rand = CP.rng(2013);
  const C = CP.EVENTS;

  const ev = (CP.events = { schedule: [], active: [], history: [], nextId: 1, damage: 0, handled: 0, onFire: null, onResolve: null, onEscalate: null });

  ev.init = function () {
    const keys = Object.keys(CP.EVENT_TYPES);
    // always one water event (Calgary's real risk), the rest drawn at random
    const pool = keys.filter((k) => k !== "flood");
    const picks = ["flood"];
    while (picks.length < C.count && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const good = Object.keys(CP.GOOD_EVENTS);
    for (let i = 0; i < C.good; i++) picks.push(good[i % good.length]);
    for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
    const n = picks.length, span = C.to - C.from;
    ev.schedule = picks.map((type, i) => ({ type, at: CP.TERM_SECONDS * (C.from + (span * (i + 0.2 + rand() * 0.6)) / n) }));
  };

  // ---------- where ----------
  function pickDistrict(t) {
    let cands = sim.districts.filter((d) => d.score[t.metric] >= 24);
    if (cands.length < 3) cands = sim.districts.filter((d) => d.score[t.metric] >= 10);
    const w = cands.map((d) => {
      let x = 1;
      if (t.weight) x = 0.3 + d.ind[t.weight] / (sim.cityInd[t.weight] || 1);
      if (t.trait && d.traits[t.trait]) x *= 8;
      return x;
    });
    let r = rand() * w.reduce((a, v) => a + v, 0);
    for (let i = 0; i < cands.length; i++) if ((r -= w[i]) <= 0) return cands[i];
    return cands[cands.length - 1] || sim.districts[0];
  }
  function riverPoint(d) {
    const pts = [];
    for (const r of CP.GEO.rivers) if (r.width >= 40) for (const p of r.line) if (sim.districtAt(p[0], p[1]) === d) pts.push(p);
    return pts.length ? pts[Math.floor(rand() * pts.length)] : null;
  }
  function nearestRiver(d) {
    let best = null, bd = Infinity;
    for (const r of CP.GEO.rivers) {
      const x = CP.distToLine(d.label[0], d.label[1], r.line);
      if (x < bd) { bd = x; best = r; }
    }
    return best && best.name ? best.name : "the river";
  }
  function spot(key, d) {
    let p = null;
    if (key === "flood") p = riverPoint(d);
    else if ((key === "fire" || key === "collapse" || key === "lightning") && d.homes.length) {
      const h = d.homes[Math.floor(rand() * d.homes.length)];
      p = [h.x, h.y];
    }
    if (!p) p = [d.label[0] + (rand() - 0.5) * 900, d.label[1] + (rand() - 0.5) * 700];
    if (sim.districtAt(p[0], p[1]) !== d) p = [d.label[0], d.label[1]];
    return p;
  }

  // households inside a circle, per district: [{d, homes}]
  function affectedHomes(x, y, r) {
    const out = [];
    let total = 0;
    for (const d of sim.districts) {
      const b = d.bbox;
      if (x + r < b[0] || x - r > b[2] || y + r < b[1] || y - r > b[3]) continue;
      let w = 0;
      for (const h of d.homes) if (CP.dist(h.x, h.y, x, y) <= r) w += h.w;
      if (!w) continue;
      const n = Math.round((w / (d.homeW || 1)) * d.households);
      out.push({ d, homes: n });
      total += n;
    }
    return { list: out, total };
  }

  // ---------- fire ----------
  ev.tick = function (elapsed, dt) {
    const fired = [];
    while (ev.schedule.length && elapsed >= ev.schedule[0].at) fired.push(ev.fire(ev.schedule.shift().type));
    dt = dt || 0;
    for (const inc of ev.history.slice()) if (inc.how === "built" && inc.p && !inc.p.fixed) ev.reopen(inc); // the fixing building was undone
    for (const inc of ev.active.slice()) {
      inc.age += dt;
      // fixed by a building (or un-fixed again by undo)
      const wasFixed = inc.p && inc.p.fixed;
      if (inc.good) {
        if (inc.age >= inc.seconds) ev.resolve(inc, "over");
        continue;
      }
      if (wasFixed && inc.status === "active") { ev.resolve(inc, "built"); continue; }
      // money drain while it burns
      const drain = (inc.dmg * dt) / 60;
      const lost = Math.min(sim.budget, drain);
      sim.budget -= lost;
      inc.cost$ += lost;
      ev.damage += lost;
      // escalate when ignored
      if (!inc.escalated && inc.age >= C.escalateAfter) ev.escalate(inc);
    }
    return fired;
  };

  ev.fire = function (key) {
    if (CP.GOOD_EVENTS[key]) return fireGood(key);
    const t = CP.EVENT_TYPES[key];
    const d = pickDistrict(t);
    const [x, y] = spot(key, d);
    const before = d.score[t.metric];
    const p = sim.addPenalty(d, t.metric, key);
    const aff = affectedHomes(x, y, t.r);
    const inc = {
      id: ev.nextId++, key, t, d, x, y, r: t.r, p, ps: [p], status: "active", age: 0, escalated: false, level: 1,
      dmg: t.dmg, cost$: 0, before, after: d.score[t.metric], homes: aff.total, homeList: aff.list, closed: 0,
      fixNames: t.fix.map((f) => CP.BUILDINGS[f].name),
      fix: t.fix.map((f) => CP.BUILDINGS[f].name).join(" or "),
      text: t.text.replace("{d}", d.name).replace("{river}", nearestRiver(d)),
      crew: t.cost, hit: [{ d, m: t.metric, before, after: d.score[t.metric] }],
    };
    // road closures are keyed to the incident so they reopen when it ends
    if (CP.traffic && CP.traffic.ready && t.close) inc.closed = CP.traffic.closeRoads(inc.id, x, y, t.close);
    ev.active.push(inc);
    if (ev.onFire) ev.onFire(inc);
    return inc;
  };

  function fireGood(key) {
    const t = CP.GOOD_EVENTS[key];
    const d = t.metric !== undefined ? sim.districts.filter((x) => x.score[t.metric] < 70)[Math.floor(rand() * 6)] || sim.districts[0] : null;
    const inc = {
      id: ev.nextId++, key, t, d, good: true, status: "active", age: 0, seconds: t.seconds,
      text: t.text.replace("{d}", d ? d.name : ""), p: null, ps: [], homes: 0, closed: 0, dmg: 0, cost$: 0,
      x: d ? d.label[0] : 0, y: d ? d.label[1] : 0, r: t.r || 0, hit: [],
    };
    if (t.money) { sim.budget += t.money; inc.gain = t.money; }
    if (t.boost && d) {
      const before = d.score[t.metric];
      inc.p = sim.addPenalty(d, t.metric, key, -t.boost);
      inc.hit = [{ d, m: t.metric, before, after: d.score[t.metric] }];
      if (CP.traffic && CP.traffic.ready) inc.closed = 0;
    }
    ev.active.push(inc);
    if (ev.onFire) ev.onFire(inc);
    return inc;
  }

  // an ignored disaster grows, hurts a second rating and spreads to the neighbouring district
  ev.escalate = function (inc) {
    inc.escalated = true;
    inc.level = 2;
    inc.dmg *= 1.8;
    inc.r *= 1.5;
    const t = inc.t, d = inc.d;
    const p2 = sim.addPenalty(d, t.m2, inc.key);
    inc.ps.push(p2);
    inc.hit.push({ d, m: t.m2, before: p2.before, after: d.score[t.m2] });
    if (t.spread) {
      const nb = d.neighbours.slice().sort((a, b) => CP.dist(a.label[0], a.label[1], inc.x, inc.y) - CP.dist(b.label[0], b.label[1], inc.x, inc.y))[0];
      if (nb) {
        const p3 = sim.addPenalty(nb, t.metric, inc.key);
        inc.ps.push(p3);
        inc.spreadTo = nb;
        inc.hit.push({ d: nb, m: t.metric, before: p3.before, after: nb.score[t.metric] });
      }
    }
    const aff = affectedHomes(inc.x, inc.y, inc.r);
    inc.homes = aff.total;
    inc.homeList = aff.list;
    if (CP.traffic && CP.traffic.ready && t.close) { CP.traffic.openRoads(inc.id); inc.closed = CP.traffic.closeRoads(inc.id, inc.x, inc.y, t.close * 1.5); }
    if (ev.onEscalate) ev.onEscalate(inc);
  };

  // pay emergency crews to end it at once
  ev.dispatch = function (inc) {
    if (inc.good || inc.status !== "active") return { ok: false, why: "Nothing to fix." };
    if (!sim.canAfford(inc.crew)) return { ok: false, why: `Crews need ${CP.money(inc.crew)}.` };
    sim.budget -= inc.crew;
    sim.spent += inc.crew;
    inc.crewPaid = inc.crew;
    for (const p of inc.ps) p.fixed = true;
    sim.recompute();
    ev.resolve(inc, "crews");
    return { ok: true };
  };

  ev.resolve = function (inc, how) {
    if (inc.status !== "active") return;
    inc.status = how === "over" ? "over" : "fixed";
    inc.how = how;
    inc.endedAt = inc.age;
    for (const p of inc.ps) p.fixed = true;
    if (CP.traffic && CP.traffic.ready) CP.traffic.openRoads(inc.id);
    sim.recompute();
    if (!inc.good) {
      ev.handled++;
      // a fast response earns a bonus from the province
      if (inc.age <= C.quickBonus.within && how !== "over") { sim.budget += C.quickBonus.money; inc.bonus = C.quickBonus.money; }
    }
    ev.active.splice(ev.active.indexOf(inc), 1);
    ev.history.unshift(inc);
    if (ev.onResolve) ev.onResolve(inc, how);
  };
  // un-fixed again (e.g. undo of the building that fixed it): bring it back
  ev.reopen = function (inc) {
    if (inc.status !== "fixed") return;
    inc.status = "active";
    ev.history.splice(ev.history.indexOf(inc), 1);
    ev.active.push(inc);
    if (CP.traffic && CP.traffic.ready && inc.t.close) inc.closed = CP.traffic.closeRoads(inc.id, inc.x, inc.y, inc.t.close);
  };

  // flood-risk watch from the real CEI flood-susceptibility indicator: where the next water event is likely
  ev.risk = function () {
    return sim.districts
      .map((d) => ({ d, v: d.ind.flood_susceptibility * (d.traits.flood ? 2 : 1) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3);
  };
})();
