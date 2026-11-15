// Missions: contracts from the Deputy City Manager. Each pays a grant when done. Kinds:
//   metric   - "Bring <metric> in <district> to <band>" (quotes the district's worst real CEI indicator)
//   dual     - two metrics in one district at once
//   district - the district's overall equity
//   multi    - one metric to a band in any 3 more districts
//   timed    - a metric contract with a time limit and a bigger bonus grant
// Contracts are written from the current state of the city, neediest districts first.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const M = CP.MISSIONS;
  const TARGETS = [40, 60, 80]; // Average, Good, Perfect
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  // the order contract kinds are offered in (falls back to "metric" when a kind can't be written)
  const PLAN = ["metric", "metric", "dual", "district", "multi", "timed", "metric", "dual", "district", "timed"];

  const missions = (CP.missions = { active: [], done: [], expired: [], issued: 0, clock: 0 });
  const metricUse = [0, 0, 0, 0, 0, 0]; // spread contracts across the six metrics
  const districtUse = new Map(); // and across districts
  const used = new Set();

  const countAtLeast = (m, t) => sim.districts.filter((d) => d.score[m] >= t - 1e-6).length;
  function current(m) {
    if (m.kind === "metric" || m.kind === "timed") return m.d.score[m.m];
    if (m.kind === "dual") return Math.min(m.d.score[m.m], m.d.score[m.m2]);
    if (m.kind === "multi") return countAtLeast(m.m, m.target);
    return m.d.overall;
  }
  missions.current = current;
  missions.goal = (m) => (m.kind === "multi" ? m.start + m.need : m.target);
  missions.progress = (m) => CP.clamp((current(m) - m.start) / (missions.goal(m) - m.start), 0, 1);
  missions.metrics = (m) => (m.kind === "district" ? [sim.weakest(m.d)] : m.kind === "dual" ? [m.m, m.m2] : [m.m]);
  // for "multi" contracts, the district closest to the goal is the one to point the player at
  missions.focus = function (m) {
    if (m.kind !== "multi") return m.d;
    const c = sim.districts.filter((d) => d.score[m.m] < m.target).sort((a, b) => b.score[m.m] - a.score[m.m]);
    return c[0] || m.d;
  };

  function queue() {
    const busy = new Set(missions.active.map((m) => m.d));
    const key = (d) => d.overall + 15 * (districtUse.get(d) || 0);
    return sim.districts.filter((d) => !busy.has(d)).sort((a, b) => key(a) - key(b));
  }
  const fmtPair = (w) => `${CP.fmtIndicator(w.ind, w.v)} (Calgary ${CP.fmtIndicator(w.ind, w.avg)})`;

  function finish(m) {
    m.id = "m" + missions.issued++;
    m.bandName = CP.bandOf(m.target).name;
    const dm = CP.DOMAINS[m.m];
    if (m.kind === "metric" || m.kind === "timed") {
      m.title = `Bring ${dm.label} in ${m.d.name} to ${m.bandName}`;
      m.icon = m.kind === "timed" ? "⏱️" : dm.icon;
      const w = sim.worstIndicators(m.d, m.m)[0];
      if (w && w.gap > 0) m.data = `${w.ind.label}: ${fmtPair(w)}`;
      used.add(m.d.id + ":" + m.m);
    } else if (m.kind === "dual") {
      const d2 = CP.DOMAINS[m.m2];
      m.title = `Raise ${dm.short} and ${d2.short} in ${m.d.name} to ${m.bandName}`;
      m.icon = dm.icon + d2.icon;
      const w = sim.worstIndicators(m.d, m.m)[0], w2 = sim.worstIndicators(m.d, m.m2)[0];
      m.data = [w, w2].filter((x) => x && x.gap > 0).map((x) => `${x.ind.label}: ${fmtPair(x)}`).join(" · ") || null;
      used.add(m.d.id + ":" + m.m).add(m.d.id + ":" + m.m2);
    } else if (m.kind === "multi") {
      m.title = `Raise ${dm.label} to ${m.bandName} in ${m.need} more districts`;
      m.icon = dm.icon + "×" + m.need;
      m.data = `${m.start} of ${sim.districts.length} districts are ${m.bandName} or better today.`;
    } else {
      m.title = `Raise ${m.d.name}'s overall equity to ${m.bandName}`;
      m.icon = "⚖️";
      used.add(m.d.id + ":all");
    }
    if (m.m != null) metricUse[m.m]++;
    if (m.m2 != null) metricUse[m.m2]++;
    districtUse.set(m.d, (districtUse.get(m.d) || 0) + 1);
    missions.active.push(m);
    return m;
  }

  // "Bring <metric> in <district> to <band>"
  function metricContract(idx, kind) {
    const minNeed = idx < M.active ? 12 : 22; // the first contracts need only one building
    const maxNeed = idx < M.active ? 26 : 45;
    for (const d of queue()) {
      const ms = [0, 1, 2, 3, 4, 5]
        .filter((m) => d.score[m] < 68 && !used.has(d.id + ":" + m))
        .sort((a, b) => metricUse[a] - metricUse[b] || d.score[a] - d.score[b]);
      for (const m of ms) {
        const s = d.score[m];
        const target = TARGETS.find((t) => t - s >= minNeed && t - s <= maxNeed) || TARGETS.find((t) => t - s >= 12 && t - s <= maxNeed);
        if (!target) continue;
        let grant = round5(M.grantBase + M.grantPerPoint * (target - s));
        const c = { kind: kind || "metric", d, m, start: s, target, grant };
        if (kind === "timed") {
          c.grant = round5(grant * M.timedBonus);
          c.expires = missions.clock + M.timedSeconds;
        }
        return finish(c);
      }
    }
    return null;
  }

  // two metrics in one district
  function dualContract() {
    for (const d of queue()) {
      const ms = [0, 1, 2, 3, 4, 5].filter((m) => d.score[m] < 52 && !used.has(d.id + ":" + m)).sort((a, b) => d.score[a] - d.score[b]);
      for (let i = 0; i < ms.length; i++)
        for (let j = i + 1; j < ms.length; j++) {
          const lo = Math.min(d.score[ms[i]], d.score[ms[j]]);
          const target = TARGETS.find((t) => t - lo >= 8 && t - lo <= 30);
          if (!target) continue;
          const need = Math.max(0, target - d.score[ms[i]]) + Math.max(0, target - d.score[ms[j]]);
          return finish({ kind: "dual", d, m: ms[i], m2: ms[j], start: lo, target, grant: round5(M.grantBase + M.grantPerPoint * need) });
        }
    }
    return null;
  }

  // "Raise <district>'s overall equity to <band>"
  function districtContract() {
    for (const d of queue()) {
      if (used.has(d.id + ":all")) continue;
      const target = TARGETS.find((t) => t - d.overall >= 5 && t - d.overall <= 18);
      if (!target) continue;
      return finish({ kind: "district", d, start: d.overall, target, grant: round5(M.grantBase + M.districtGrantPerPoint * (target - d.overall) * 6) });
    }
    return null;
  }

  // one metric to a band in any 3 more districts
  function multiContract() {
    const busy = new Set(missions.active.filter((m) => m.kind === "multi").map((m) => m.m));
    const opts = [0, 1, 2, 3, 4, 5].filter((m) => !busy.has(m)).map((m) => {
      const target = 40;
      const below = sim.districts.filter((d) => d.score[m] < target).map((d) => target - d.score[m]).sort((a, b) => a - b);
      return { m, target, below, cost: below.slice(0, 3).reduce((a, v) => a + v, 0) };
    }).filter((o) => o.below.length >= 4).sort((a, b) => a.cost - b.cost);
    const o = opts[0];
    if (!o) return null;
    const start = countAtLeast(o.m, o.target);
    const d = sim.districts.filter((x) => x.score[o.m] < o.target).sort((a, b) => b.score[o.m] - a.score[o.m])[0];
    return finish({ kind: "multi", d, m: o.m, need: 3, start, target: o.target, grant: round5(M.grantBase * 2 + M.grantPerPoint * o.cost * 0.6) });
  }

  function issue() {
    if (missions.issued >= M.total) return null;
    const idx = missions.issued;
    const kind = PLAN[idx % PLAN.length];
    const made =
      (kind === "dual" && dualContract()) ||
      (kind === "district" && districtContract()) ||
      (kind === "multi" && multiContract()) ||
      (kind === "timed" && metricContract(idx, "timed")) ||
      metricContract(idx) || districtContract();
    if (!made) missions.issued = M.total; // nothing sensible left to ask for
    return made;
  }
  function refill() {
    while (missions.active.length < M.active && issue());
  }

  missions.init = refill;

  // pays out anything that is complete and returns the list of contracts just finished
  missions.evaluate = function () {
    const completed = [];
    for (const m of missions.active.slice()) {
      if (current(m) < missions.goal(m) - 1e-6) continue;
      m.done = true;
      missions.active.splice(missions.active.indexOf(m), 1);
      missions.done.push(m);
      sim.budget += m.grant;
      completed.push(m);
    }
    if (completed.length) {
      const tier = Math.floor(missions.done.length / M.unlockEvery);
      refill();
    }
    return completed;
  };

  // time-limited contracts run out; returns the ones that just expired
  missions.tick = function (dt) {
    missions.clock += dt;
    const gone = [];
    for (const m of missions.active.slice())
      if (m.expires && missions.clock >= m.expires) {
        missions.active.splice(missions.active.indexOf(m), 1);
        missions.expired.push(m);
        gone.push(m);
      }
    if (gone.length) refill();
    return gone;
  };
  missions.timeLeft = (m) => (m.expires ? Math.max(0, m.expires - missions.clock) : null);
  missions.allDone = () => missions.issued >= M.total && !missions.active.length;
})();
