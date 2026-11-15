// Disasters: a few natural or human disasters per term. Each knocks one metric in one district down a band
// and stays on the map until the player clicks it and pays the repair cost. While it is active the district
// pays no revenue and its residents' happiness (Belonging & Safety) slowly drains; that loss is permanent.
// Where a disaster strikes follows the real data: floods and heavy rain favour districts with high
// CEI flood susceptibility and districts on the river (Bowness, Inglewood). The tornado roams across districts.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const DZ = CP.DISASTER;
  const rand = CP.rng(2013);

  const ev = (CP.events = { schedule: [], log: [], active: [], nextId: 1 });
  sim.disrupted = new Set(); // ids of districts with an active disaster (no revenue)

  ev.init = function () {
    const keys = Object.keys(CP.EVENT_TYPES);
    // always one water event (Calgary's real risk) and the tornado, the rest drawn at random
    const pool = keys.filter((k) => k !== "flood" && k !== "tornado");
    const picks = ["flood", "tornado"];
    while (picks.length < CP.EVENTS.count && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
    const n = picks.length, span = CP.EVENTS.to - CP.EVENTS.from;
    ev.schedule = picks.map((type, i) => ({ type, at: CP.TERM_SECONDS * (CP.EVENTS.from + (span * (i + 0.25 + rand() * 0.5)) / n) }));
  };

  function pickDistrict(t) {
    const busy = new Set(ev.active.map((x) => x.d));
    // strike where it knocks the metric down a whole band (fall back to anywhere it still hurts)
    let cands = sim.districts.filter((d) => !busy.has(d) && d.score[t.metric] >= 24);
    if (cands.length < 3) cands = sim.districts.filter((d) => !busy.has(d) && d.score[t.metric] >= 10);
    if (!cands.length) cands = sim.districts.slice();
    const w = cands.map((d) => {
      let x = 1;
      if (t.weight) x = 0.3 + d.ind[t.weight] / (sim.cityInd[t.weight] || 1);
      if (t.trait && d.traits[t.trait]) x *= 8;
      return x;
    });
    let r = rand() * w.reduce((a, v) => a + v, 0);
    for (let i = 0; i < cands.length; i++) if ((r -= w[i]) <= 0) return cands[i];
    return cands[cands.length - 1];
  }
  function nearestRiver(d) {
    let best = null, bd = Infinity;
    for (const r of CP.GEO.rivers) {
      const x = CP.distToLine(d.label[0], d.label[1], r.line);
      if (x < bd) { bd = x; best = r; }
    }
    return best ? best.name : "river";
  }
  // a clear spot in the district for the disaster art: not on a lot, not in water
  function spotIn(d, key) {
    const world = CP.world;
    for (let r = 900; r <= 4000; r += 300)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + r;
        const x = d.label[0] + Math.cos(a) * r, y = d.label[1] + Math.sin(a) * r * 0.7;
        if (sim.districtAt(x, y) !== d || world.waterAt(x, y, key === "flood" ? 0 : 300)) continue;
        if (sim.lots.some((l) => CP.dist(l.x, l.y, x, y) < 1100)) continue;
        if (ev.active.some((o) => CP.dist(o.x, o.y, x, y) < 2500)) continue;
        return [x, y];
      }
    return [d.label[0], d.label[1] - 900];
  }

  // call every frame (while the term runs); returns { fired, moved } so the game can react
  ev.tick = function (elapsed, dt) {
    const out = { fired: null, moved: [] };
    const next = ev.schedule[0];
    if (next && elapsed >= next.at) {
      ev.schedule.shift();
      out.fired = ev.fire(next.type);
    }
    let dirty = false;
    for (const dis of ev.active) {
      dis.age += dt;
      // happiness drains while nobody fixes it (rounded so scores only recompute once per point)
      const m = dis.mood;
      const goal = Math.min(DZ.moodMax, m.raw + DZ.moodPerSec * dt);
      m.raw = goal;
      if (Math.floor(goal) !== m.amount) { m.amount = Math.floor(goal); dirty = true; }
      if (dis.t.moves) {
        const moved = roam(dis, dt);
        if (moved) { out.moved.push(dis); dirty = true; }
      }
    }
    if (dirty) sim.recompute();
    return out;
  };

  // the tornado drifts with a slowly turning heading and stays over the city
  function roam(dis, dt) {
    const b = window.CEI_DATA.bounds;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    dis.heading += (rand() - 0.5) * 1.4 * dt;
    let nx = dis.x + Math.cos(dis.heading) * DZ.tornadoSpeed * dt;
    let ny = dis.y + Math.sin(dis.heading) * DZ.tornadoSpeed * dt;
    const d = sim.districtAt(nx, ny);
    if (!d) {
      // edge of the city: turn back toward the middle
      dis.heading = Math.atan2(cy - dis.y, cx - dis.x) + (rand() - 0.5) * 0.8;
      return false;
    }
    dis.x = nx; dis.y = ny;
    if (d === dis.d) return false;
    if (ev.active.some((o) => o !== dis && o.d === d)) return false; // let the other disaster have that district
    // the damage follows the tornado; happiness lost in the old district stays lost
    sim.disrupted.delete(dis.d.id);
    dis.d = d;
    sim.disrupted.add(d.id);
    dis.p.d = d;
    dis.p.amount = sim.bandDrop(d, dis.p.m);
    dis.mood = { d, m: DZ.moodMetric, amount: 0, raw: 0, ev: dis.key, fixed: false, mood: true };
    sim.penalties.push(dis.mood);
    dis.text = dis.t.text.replace("{d}", d.name);
    return true;
  }

  ev.fire = function (key, where) {
    const t = CP.EVENT_TYPES[key];
    const d = where || pickDistrict(t);
    const before = d.score[t.metric];
    const p = sim.addPenalty(d, t.metric, key);
    const mood = { d, m: DZ.moodMetric, amount: 0, raw: 0, ev: key, fixed: false, mood: true };
    sim.penalties.push(mood);
    const [x, y] = spotIn(d, key);
    const dis = {
      id: ev.nextId++, key, t, d, x, y, p, mood, age: 0, cost: t.cost, heading: rand() * Math.PI * 2,
      before, after: d.score[t.metric],
      text: t.text.replace("{d}", d.name).replace("{river}", nearestRiver(d)),
    };
    ev.active.push(dis);
    sim.disrupted.add(d.id);
    ev.log.push(dis);
    return dis;
  };

  // pay to repair: the disaster's damage is undone and revenue resumes
  ev.repair = function (dis) {
    if (!ev.active.includes(dis)) return { ok: false, why: "Already repaired." };
    if (!sim.canAfford(dis.cost)) return { ok: false, why: `You need ${CP.money(dis.cost)} to repair this.` };
    sim.budget -= dis.cost;
    sim.spent += dis.cost;
    dis.p.fixed = true;
    dis.repaired = true;
    ev.active.splice(ev.active.indexOf(dis), 1);
    sim.disrupted.delete(dis.d.id);
    sim.recompute();
    return { ok: true };
  };

  ev.inDistrict = (d) => ev.active.filter((x) => x.d === d);
  // happiness lost so far by a disaster (all districts it has passed through)
  ev.moodLost = (dis) => sim.penalties.filter((p) => p.mood && p.ev === dis.key && p.d === dis.d).reduce((a, p) => a + p.amount, 0);

  // the disaster whose art is under a screen point (boxes are stored by the renderer each frame)
  ev.pick = function (px, py) {
    for (let i = ev.active.length - 1; i >= 0; i--) {
      const b = ev.active[i].box;
      if (b && px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3]) return ev.active[i];
    }
    return null;
  };
})();
