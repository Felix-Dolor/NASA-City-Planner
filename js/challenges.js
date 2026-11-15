// Missions: contracts from the Deputy City Manager. Each one asks the player to lift a metric
// (or a whole district) to a named equity band and pays a grant into the budget when it is done.
// Contracts are written from the current state of the city, neediest districts first.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const M = CP.MISSIONS;
  const TARGETS = [40, 60, 80]; // Average, Good, Perfect
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

  const missions = (CP.missions = { active: [], done: [], issued: 0 });
  const metricUse = [0, 0, 0, 0, 0, 0]; // spread contracts across the six metrics
  const districtUse = new Map(); // and across districts
  const used = new Set();

  const current = (m) => (m.kind === "metric" ? m.d.score[m.m] : m.d.overall);
  missions.current = current;
  missions.progress = (m) => CP.clamp((current(m) - m.start) / (m.target - m.start), 0, 1);

  function queue() {
    const busy = new Set(missions.active.map((m) => m.d));
    const key = (d) => d.overall + 15 * (districtUse.get(d) || 0);
    return sim.districts.filter((d) => !busy.has(d)).sort((a, b) => key(a) - key(b));
  }

  function finish(m) {
    m.id = "m" + missions.issued++;
    m.bandName = CP.bandOf(m.target).name;
    if (m.kind === "metric") {
      const dm = CP.DOMAINS[m.m];
      m.title = `Bring ${dm.label} in ${m.d.name} to ${m.bandName}`;
      m.icon = dm.icon;
      metricUse[m.m]++;
      used.add(m.d.id + ":" + m.m);
    } else {
      m.title = `Raise ${m.d.name}'s overall equity to ${m.bandName}`;
      m.icon = "⚖️";
      used.add(m.d.id + ":all");
    }
    districtUse.set(m.d, (districtUse.get(m.d) || 0) + 1);
    missions.active.push(m);
    return m;
  }

  // "Bring <metric> in <district> to <band>"
  function metricContract(idx) {
    const minNeed = idx < M.active ? 12 : 22; // the first contracts need only one building
    for (const d of queue()) {
      const ms = [0, 1, 2, 3, 4, 5]
        .filter((m) => d.score[m] < 68 && !used.has(d.id + ":" + m))
        .sort((a, b) => metricUse[a] - metricUse[b] || d.score[a] - d.score[b]);
      for (const m of ms) {
        const s = d.score[m];
        const target = TARGETS.find((t) => t - s >= minNeed && t - s <= 50) || TARGETS.find((t) => t - s >= 12 && t - s <= 50);
        if (!target) continue;
        return finish({ kind: "metric", d, m, start: s, target, grant: round5(M.grantBase + M.grantPerPoint * (target - s)) });
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

  function issue() {
    if (missions.issued >= M.total) return null;
    const idx = missions.issued;
    const wantDistrict = idx === 3 || idx === 7;
    return (wantDistrict && districtContract()) || metricContract(idx) || districtContract();
  }
  function refill() {
    while (missions.active.length < M.active && issue());
  }

  missions.init = refill;

  // pays out anything that is complete and returns the list of contracts just finished
  missions.evaluate = function () {
    const completed = [];
    for (const m of missions.active.slice()) {
      if (current(m) < m.target - 1e-6) continue;
      m.done = true;
      missions.active.splice(missions.active.indexOf(m), 1);
      missions.done.push(m);
      sim.budget += m.grant;
      completed.push(m);
    }
    if (completed.length) refill();
    return completed;
  };
  missions.allDone = () => missions.issued >= M.total && !missions.active.length;
})();
