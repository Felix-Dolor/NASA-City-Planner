// Missions. Civilians on the map offer them (a "!" over their head); the player accepts or declines.
// Each pays a grant when done. Kinds:
//   metric   - "Bring <metric> in <district> to <band>" (quotes the district's worst real CEI indicator)
//   dual     - two metrics in one district at once
//   district - the district's overall equity
//   multi    - one metric to a band in any 3 more districts
//   timed    - a metric contract with a time limit (from the moment it is accepted) and a bigger grant
//   plan     - a loosely worded complaint ("Our neighbourhood feels unsafe"): the player has to use Plan to
//              find which metric is behind. Pays CP.MISSIONS.planBonus times a standard mission.
//   build    - "Build a <building> in <district>". Pays CP.MISSIONS.buildBonus times the building's cost.
// Contracts are written from the current state of the city. Accepted missions can be discarded at any time
// and are replaced right away, for free.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const M = CP.MISSIONS;
  const TARGETS = [40, 60, 80]; // Average, Good, Perfect
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  const round05 = (v) => Math.round(v * 2) / 2;
  const rand = CP.rng(4077);
  // the order contract kinds are offered in (falls back to "metric" when a kind can't be written)
  const PLAN = ["metric", "build", "plan", "dual", "metric", "timed", "build", "district", "plan", "multi"];

  const missions = (CP.missions = { active: [], offers: [], done: [], expired: [], declined: [], discarded: [], issued: 0, clock: 0, offerT: 0 });
  const metricUse = [0, 0, 0, 0, 0, 0]; // spread contracts across the six metrics
  const districtUse = new Map(); // and across districts
  const used = new Set();

  const countAtLeast = (m, t) => sim.districts.filter((d) => d.score[m] >= t - 1e-6).length;
  const builtSince = (m) => sim.buildings.filter((b) => !b.prebuilt && b.d === m.d && b.type === m.type && b.id >= m.sinceId).length;
  function current(m) {
    if (m.kind === "build") return builtSince(m);
    if (m.kind === "dual" || (m.kind === "plan" && m.m2 != null)) return Math.min(m.d.score[m.m], m.d.score[m.m2]);
    if (m.kind === "metric" || m.kind === "timed" || m.kind === "plan") return m.d.score[m.m];
    if (m.kind === "multi") return countAtLeast(m.m, m.target);
    return m.d.overall;
  }
  missions.current = current;
  missions.goal = (m) => (m.kind === "multi" ? m.start + m.need : m.kind === "build" ? 1 : m.target);
  missions.progress = (m) => CP.clamp((current(m) - m.start) / (missions.goal(m) - m.start || 1), 0, 1);
  missions.metrics = (m) => (m.kind === "build" ? [] : m.kind === "district" ? [sim.weakest(m.d)] : m.m2 != null ? [m.m, m.m2] : [m.m]);
  // planning missions never say which metric is behind: finding it is the point
  missions.secret = (m) => m.kind === "plan";
  // does this building type help with this mission? (used to tag the build bar)
  missions.helps = function (m, t) {
    if (!m) return false;
    if (m.kind === "build") return t === m.type;
    if (missions.secret(m)) return false;
    const b = CP.BUILDINGS[t];
    return missions.metrics(m).some((i) => b.gain[i] >= 10 || (b.area && b.area.gain[i] >= 8));
  };
  // for "multi" contracts, the district closest to the goal is the one to point the player at
  missions.focus = function (m) {
    if (m.kind !== "multi") return m.d;
    const c = sim.districts.filter((d) => d.score[m.m] < m.target).sort((a, b) => b.score[m.m] - a.score[m.m]);
    return c[0] || m.d;
  };

  // districts that can be asked about: not already holding an offer or a mission, with a free lot
  const reserved = new Set(); // districts kept for scripted missions (demo)
  missions.reserve = (d) => d && reserved.add(d);
  const busy = () => new Set(missions.active.concat(missions.offers).map((m) => m.d).concat([...reserved]));
  function queue() {
    const b = busy();
    const key = (d) => d.overall + 15 * (districtUse.get(d) || 0);
    return sim.districts.filter((d) => !b.has(d) && d.lots.some((l) => !sim.isLocked(l) && !l.building)).sort((a, b) => key(a) - key(b));
  }
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const fmtPair = (w) => `${CP.fmtIndicator(w.ind, w.v)} (Calgary ${CP.fmtIndicator(w.ind, w.avg)})`;
  const an = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");

  function finish(m) {
    m.id = "m" + missions.issued++;
    m.giver = m.d.resident;
    const dm = CP.DOMAINS[m.m];
    if (m.kind !== "build") m.bandName = CP.bandOf(m.target).name;
    if (m.kind === "metric" || m.kind === "timed") {
      m.title = `Bring ${dm.label} in ${m.d.name} to ${m.bandName}`;
      m.icon = m.kind === "timed" ? "⏱️" : dm.icon;
      const w = sim.worstIndicators(m.d, m.m)[0];
      if (w && w.gap > 0) m.data = `${w.ind.label}: ${fmtPair(w)}`;
      m.pitch = `${CP.residents.needLine(m.d, m.m).text} Could you bring ${dm.label} here up to ${m.bandName}?`;
      if (m.kind === "timed") m.pitch += ` It's urgent: you'll have ${M.timedSeconds} seconds once you say yes, and the grant is bigger.`;
      used.add(m.d.id + ":" + m.m);
    } else if (m.kind === "plan") {
      const lines = CP.PLAN_LINES[m.m];
      m.quote = m.quote || lines[Math.floor(rand() * lines.length)];
      m.title = `“${m.quote}”`;
      m.doneTitle = `Help ${m.d.name}`;
      m.icon = "🗺️";
      m.data = `Something is wrong in ${m.d.name}. Use the Plan tab to work out what, then fix it.`;
      m.pitch = `${m.quote} I don't know what we need, Director. Can you figure it out? The Plan tab shows how ${m.d.name} compares with the rest of Calgary.`;
      used.add(m.d.id + ":" + m.m);
      if (m.m2 != null) used.add(m.d.id + ":" + m.m2);
    } else if (m.kind === "build") {
      const b = CP.BUILDINGS[m.type];
      m.title = `Build ${an(b.name)} ${b.name} in ${m.d.name}`;
      m.icon = b.icon;
      m.data = `${b.name}: ${b.short}`;
      m.pitch = `We really need ${an(b.name)} ${b.name} here in ${m.d.name}. ${b.short} Could you build one for us?`;
      used.add(m.d.id + ":b:" + m.type);
    } else if (m.kind === "dual") {
      const d2 = CP.DOMAINS[m.m2];
      m.title = `Raise ${dm.short} and ${d2.short} in ${m.d.name} to ${m.bandName}`;
      m.icon = dm.icon + d2.icon;
      const w = sim.worstIndicators(m.d, m.m)[0], w2 = sim.worstIndicators(m.d, m.m2)[0];
      m.data = [w, w2].filter((x) => x && x.gap > 0).map((x) => `${x.ind.label}: ${fmtPair(x)}`).join(" · ") || null;
      m.pitch = `We're falling behind on ${dm.label} and ${d2.label}. Can you raise both to ${m.bandName} here in ${m.d.name}?`;
      used.add(m.d.id + ":" + m.m).add(m.d.id + ":" + m.m2);
    } else if (m.kind === "multi") {
      m.title = `Raise ${dm.label} to ${m.bandName} in ${m.need} more districts`;
      m.icon = dm.icon + "×" + m.need;
      m.data = `${m.start} of ${sim.districts.length} districts are ${m.bandName} or better today.`;
      m.pitch = `It isn't just us. Too many districts are short on ${dm.label}. Can you get ${m.need} more of them up to ${m.bandName}?`;
    } else {
      m.title = `Raise ${m.d.name}'s overall equity to ${m.bandName}`;
      m.icon = "⚖️";
      m.pitch = `Life in ${m.d.name} is harder than it should be, on almost every count. Can you lift our overall equity to ${m.bandName}?`;
      used.add(m.d.id + ":all");
    }
    m.doneTitle = m.doneTitle || m.title;
    if (m.m != null) metricUse[m.m]++;
    if (m.m2 != null) metricUse[m.m2]++;
    districtUse.set(m.d, (districtUse.get(m.d) || 0) + 1);
    return m;
  }

  // "Bring <metric> in <district> to <band>" (also the base of timed and planning missions)
  function metricContract(idx, kind) {
    const minNeed = idx < M.active ? 12 : 22; // the first contracts need only one building
    const maxNeed = idx < M.active ? 26 : 45;
    for (const d of queue()) {
      const ms = [0, 1, 2, 3, 4, 5]
        .filter((m) => d.score[m] < (kind === "plan" ? 58 : 68) && !used.has(d.id + ":" + m))
        .sort((a, b) => metricUse[a] - metricUse[b] || d.score[a] - d.score[b]);
      for (const m of ms) {
        const s = d.score[m];
        const target = TARGETS.find((t) => t - s >= minNeed && t - s <= maxNeed) || TARGETS.find((t) => t - s >= 12 && t - s <= maxNeed);
        if (!target) continue;
        const grant = round5(M.grantBase + M.grantPerPoint * (target - s));
        const c = { kind: kind || "metric", d, m, start: s, target, grant };
        if (kind === "timed") c.grant = round5(grant * M.timedBonus);
        if (kind === "plan") c.grant = round5(grant * M.planBonus);
        return finish(c);
      }
    }
    return null;
  }

  // "Build a <random building> in <random district>" on a lot that can take it
  function buildContract() {
    for (const d of shuffled(queue())) {
      const free = d.lots.filter((l) => !l.building && !sim.isLocked(l));
      const types = CP.BUILD_ORDER.filter((t) => !used.has(d.id + ":b:" + t) && free.some((l) => CP.BUILDINGS[t].zones.includes(l.zone)));
      if (!types.length) continue;
      const type = types[Math.floor(rand() * types.length)];
      return finish({ kind: "build", d, type, start: 0, target: 1, grant: round05(sim.baseCost(type, d) * M.buildBonus) });
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

  // one metric to a band in any 3 more districts (asked by a civilian from the closest district)
  function multiContract() {
    const taken = new Set(missions.active.concat(missions.offers).filter((m) => m.kind === "multi").map((m) => m.m));
    const b = busy();
    const opts = [0, 1, 2, 3, 4, 5].filter((m) => !taken.has(m)).map((m) => {
      const target = 40;
      const below = sim.districts.filter((d) => d.score[m] < target).map((d) => target - d.score[m]).sort((a, b) => a - b);
      return { m, target, below, cost: below.slice(0, 3).reduce((a, v) => a + v, 0) };
    }).filter((o) => o.below.length >= 4).sort((a, b) => a.cost - b.cost);
    const o = opts[0];
    if (!o) return null;
    const d = sim.districts.filter((x) => x.score[o.m] < o.target && !b.has(x)).sort((a, c) => c.score[o.m] - a.score[o.m])[0];
    if (!d) return null;
    return finish({ kind: "multi", d, m: o.m, need: 3, start: countAtLeast(o.m, o.target), target: o.target, grant: round5(M.grantBase * 2 + M.grantPerPoint * o.cost * 0.6) });
  }

  function issue(force) {
    const idx = missions.issued;
    const kind = force || PLAN[idx % PLAN.length];
    return (
      (kind === "dual" && dualContract()) ||
      (kind === "district" && districtContract()) ||
      (kind === "multi" && multiContract()) ||
      (kind === "build" && buildContract()) ||
      (kind === "plan" && metricContract(idx, "plan")) ||
      (kind === "timed" && metricContract(idx, "timed")) ||
      metricContract(idx) || buildContract() || districtContract()
    );
  }

  // a mission starts counting from the moment it is taken on
  function activate(m) {
    m.start = m.kind === "build" ? 0 : current(m);
    if (m.kind === "build") m.sinceId = sim.nextId;
    if (m.kind === "timed") m.expires = missions.clock + M.timedSeconds;
    missions.active.push(m);
    return m;
  }
  function addOffer() {
    const o = issue();
    if (!o) return null;
    missions.offers.push(o);
    o.giver.offer = o;
    return o;
  }
  const dropOffer = (o) => {
    missions.offers.splice(missions.offers.indexOf(o), 1);
    if (o.giver.offer === o) o.giver.offer = null;
  };

  // A hand-written contract (used by the presentation demo): { kind, d, m, m2?, target, quote? }.
  // Added straight to the active list at slot `at` (0 = top). The grant follows the normal formulas.
  missions.scripted = function (spec, at) {
    const c = Object.assign({ start: 0 }, spec);
    const need = [c.m, c.m2].filter((x) => x != null).reduce((a, i) => a + Math.max(0, c.target - c.d.score[i]), 0);
    c.grant = round5((M.grantBase + M.grantPerPoint * need) * (c.kind === "plan" ? M.planBonus : 1));
    finish(c);
    activate(c);
    missions.active.splice(missions.active.indexOf(c), 1);
    missions.active.splice(Math.min(at || 0, missions.active.length), 0, c);
    return c;
  };
  missions.fillOffers = () => { while (missions.offers.length < M.offers && addOffer()); };

  // the term opens with one mission already on the list and civilians waiting with more
  missions.init = function () {
    const first = issue("metric");
    if (first) activate(first);
    while (missions.offers.length < M.offers && addOffer());
  };

  missions.accept = function (o) {
    if (!missions.offers.includes(o)) return { ok: false, why: "That offer has gone." };
    if (missions.active.length >= M.active) return { ok: false, why: `You already have ${M.active} missions. Finish or discard one first.` };
    dropOffer(o);
    activate(o);
    missions.offerT = Math.max(missions.offerT, M.offerDelay);
    return { ok: true };
  };
  missions.decline = function (o) {
    if (!missions.offers.includes(o)) return;
    dropOffer(o);
    missions.declined.push(o);
    missions.offerT = Math.max(missions.offerT, M.offerDelay);
  };
  // throw away an accepted mission and get a fresh one in its place, free of charge
  missions.discard = function (m) {
    const i = missions.active.indexOf(m);
    if (i < 0) return null;
    missions.active.splice(i, 1);
    missions.discarded.push(m);
    const fresh = issue();
    if (!fresh) return null;
    activate(fresh);
    missions.active.splice(missions.active.indexOf(fresh), 1);
    missions.active.splice(i, 0, fresh); // same slot in the list
    return fresh;
  };

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
      if (tier > sim.unlockedTier) { sim.unlockedTier = tier; missions.unlocked = true; }
    }
    return completed;
  };

  // time-limited contracts run out (returned as failed); offers that are already met are withdrawn;
  // new civilian offers appear a few seconds after one is taken
  missions.tick = function (dt) {
    missions.clock += dt;
    const failed = [];
    for (const m of missions.active.slice())
      if (m.expires && missions.clock >= m.expires) {
        missions.active.splice(missions.active.indexOf(m), 1);
        missions.expired.push(m);
        m.failed = true;
        failed.push(m);
      }
    for (const o of missions.offers.slice()) if (current(o) >= missions.goal(o) - 1e-6) dropOffer(o);
    if (missions.offers.length < M.offers) {
      missions.offerT -= dt;
      if (missions.offerT <= 0) {
        missions.offerT = M.offerDelay;
        addOffer();
      }
    }
    return failed;
  };
  missions.timeLeft = (m) => (m.expires ? Math.max(0, m.expires - missions.clock) : null);
})();
