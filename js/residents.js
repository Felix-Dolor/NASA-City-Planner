// One representative resident per district. They wander inside their district's borders and
// voice its weakest metric; when that need is met they say thanks, then move on to the next need.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const SPEED = 140; // metres per second (the map is drawn large, so this reads as a stroll)
  const THANKS_SECONDS = 14;
  const rand = CP.rng(2024);

  const res = (CP.residents = { list: [] });

  const inside = (d, x, y) =>
    sim.districtAt(x, y) === d && sim.districtAt(x - 350, y) === d && sim.districtAt(x + 350, y) === d &&
    sim.districtAt(x, y - 350) === d && sim.districtAt(x, y + 350) === d && !CP.world.waterAt(x, y, 120);

  function wanderPoint(r) {
    for (let i = 0; i < 30; i++) {
      const a = rand() * Math.PI * 2, dist = 500 + rand() * 2200;
      const x = r.x + Math.cos(a) * dist, y = r.y + Math.sin(a) * dist;
      if (inside(r.d, x, y)) return [x, y];
    }
    return r.d.label.slice();
  }

  // a need line that quotes the real CEI indicator where the district is furthest behind Calgary
  function needLine(d, m) {
    for (const w of sim.worstIndicators(d, m)) {
      const tpl = CP.INDICATOR_LINES[w.ind.key];
      if (!tpl || w.gap <= 0) continue;
      return { text: tpl.replace("{v}", CP.fmtIndicator(w.ind, w.v)).replace("{avg}", CP.fmtIndicator(w.ind, w.avg)), ind: w.ind };
    }
    return { text: CP.NEED_LINES[m][d.id % 2], ind: null };
  }
  res.needLine = needLine;

  function assignNeed(r) {
    const d = r.d, m = sim.weakest(d), s = d.score[m];
    if (s >= 80) {
      r.state = "content";
      r.icon = "😊";
      r.line = CP.CONTENT_LINE;
      return;
    }
    r.state = "need";
    r.metric = m;
    // met when the metric climbs into the next band (and by at least 10 points)
    r.target = Math.min(100, Math.max((CP.bandIndex(s) + 1) * 20, s + 10));
    r.icon = CP.DOMAINS[m].icon;
    const nl = needLine(d, m);
    r.line = nl.text;
    r.ind = nl.ind;
  }

  // a resident complains about something that just happened to their district (shown for a while)
  res.complain = function (d, kind, line) {
    const r = d.resident;
    if (!r) return null;
    const lines = CP.COMPLAINTS[kind] || [];
    r.complaint = { line: line || lines[Math.floor(rand() * lines.length)] || "This isn't fair to us.", t: 12 };
    return r;
  };

  res.init = function () {
    res.list = sim.districts.map((d) => {
      const r = { d, name: d.def.resident.name, look: d.def.resident.look, x: d.label[0], y: d.label[1], phase: rand() * 6, moving: false, dir: 1, pause: rand() * 3 };
      r.target2 = [r.x, r.y];
      d.resident = r;
      assignNeed(r);
      return r;
    });
  };

  // send a resident back to their own district (after the opening scene)
  res.release = function (r) {
    r.scripted = false;
    r.talking = false;
    r.x = r.d.label[0];
    r.y = r.d.label[1];
    r.target2 = [r.x, r.y];
    r.pause = 1;
  };

  // call after any score change; returns the residents whose need was just met
  res.onChange = function () {
    const happy = [];
    for (const r of res.list) {
      if (r.state === "need" && r.d.score[r.metric] >= r.target - 1e-6) {
        r.state = "thanks";
        r.icon = "💚";
        r.line = CP.THANKS_LINES[r.metric];
        r.thanksT = THANKS_SECONDS;
        happy.push(r);
      } else if (r.state === "content") assignNeed(r);
    }
    return happy;
  };

  res.update = function (dt) {
    for (const r of res.list) {
      if (r.complaint && (r.complaint.t -= dt) <= 0) r.complaint = null;
      if (r.state === "thanks") {
        r.thanksT -= dt;
        if (r.thanksT <= 0) assignNeed(r);
      }
      if (r.scripted || r.talking) { r.moving = false; continue; }
      if (r.pause > 0) { r.pause -= dt; r.moving = false; continue; }
      const dx = r.target2[0] - r.x, dy = r.target2[1] - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist < SPEED * dt + 1) {
        r.pause = 1 + rand() * 3;
        r.target2 = wanderPoint(r);
        continue;
      }
      r.x += (dx / dist) * SPEED * dt;
      r.y += (dy / dist) * SPEED * dt;
      if (Math.abs(dx) > 20) r.dir = dx > 0 ? 1 : -1;
      r.moving = true;
      r.phase += dt * 8;
    }
  };

  // screen position of the top of a resident's head
  res.headPos = function (r) {
    const [sx, sy] = CP.render.toScreen(r.x, r.y);
    const u = CP.sprites.residentScale(CP.render.cam.z) * (r.look.extra.small ? 0.82 : 1);
    return [sx, sy - 112 * u];
  };
  // what a resident says right now (a fresh complaint beats their standing need)
  res.say = function (r) {
    if (r.complaint) return { text: r.complaint.line, mood: "upset" };
    return { text: r.line, mood: r.state === "need" ? "" : "happy" };
  };

  // resident under a screen point, if any
  res.pick = function (px, py) {
    const u = CP.sprites.residentScale(CP.render.cam.z);
    let best = null, bd = Infinity;
    for (const r of res.list) {
      if (r.hidden) continue;
      const [sx, sy] = CP.render.toScreen(r.x, r.y);
      if (Math.abs(px - sx) > 26 * u + 10 || py > sy + 10 || py < sy - 110 * u - 40) continue;
      const dd = Math.abs(px - sx);
      if (dd < bd) { bd = dd; best = r; }
    }
    return best;
  };
})();
