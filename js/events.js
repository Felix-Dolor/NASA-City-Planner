// Random events: a few natural or human disasters per term. Each knocks one metric in one district
// down a band; a matching building placed in that district recovers it (see sim.place).
// Where an event strikes follows the real data: floods and heavy rain favour districts with high
// CEI flood susceptibility and districts on the river (Bowness, Inglewood).
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const rand = CP.rng(2013);

  const ev = (CP.events = { schedule: [], log: [] });

  ev.init = function () {
    const keys = Object.keys(CP.EVENT_TYPES);
    // always one water event (Calgary's real risk), the rest drawn at random
    const pool = keys.filter((k) => k !== "flood");
    const picks = ["flood"];
    while (picks.length < CP.EVENTS.count && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
    const n = picks.length, span = CP.EVENTS.to - CP.EVENTS.from;
    ev.schedule = picks.map((type, i) => ({ type, at: CP.TERM_SECONDS * (CP.EVENTS.from + (span * (i + 0.25 + rand() * 0.5)) / n) }));
  };

  function pickDistrict(t) {
    // strike where it knocks the metric down a whole band (fall back to anywhere it still hurts)
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
  function nearestRiver(d) {
    let best = null, bd = Infinity;
    for (const r of CP.GEO.rivers) {
      const x = CP.distToLine(d.label[0], d.label[1], r.line);
      if (x < bd) { bd = x; best = r; }
    }
    return best ? best.name : "river";
  }

  // call every frame with the seconds elapsed in the term; returns an event when one fires
  ev.tick = function (elapsed) {
    const next = ev.schedule[0];
    if (!next || elapsed < next.at) return null;
    ev.schedule.shift();
    return ev.fire(next.type);
  };

  ev.fire = function (key) {
    const t = CP.EVENT_TYPES[key];
    const d = pickDistrict(t);
    const before = d.score[t.metric];
    const p = sim.addPenalty(d, t.metric, key);
    const fixNames = t.fix.map((f) => CP.BUILDINGS[f].name);
    const out = {
      key, t, d, p, before, after: d.score[t.metric],
      text: t.text.replace("{d}", d.name).replace("{river}", nearestRiver(d)),
      fix: fixNames.join(" or "),
    };
    ev.log.push(out);
    return out;
  };
})();
