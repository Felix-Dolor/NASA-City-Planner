// Game loop, camera, input, the opening sequence and the 8-minute term.
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render, ui = CP.ui, world = CP.world, res = CP.residents, missions = CP.missions;
  const $ = (s) => document.querySelector(s);

  // phase: title -> talk (street scene) -> pullback -> briefing -> play -> ended
  const game = (CP.game = { paused: false, started: false, ended: false, phase: "title", timeLeft: CP.TERM_SECONDS });
  let canvas;
  let tween = null;
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, dragged: false, sx: 0, sy: 0, over: false };
  const live = () => game.started && !game.paused && !game.ended;

  // ---------- camera ----------
  function clampCam() {
    const c = R.cam;
    c.z = CP.clamp(c.z, R.minZoom(), R.maxZoom);
    const lim = world.PLANET_R * 0.9;
    const d = Math.hypot(c.x, c.y);
    if (d > lim) { c.x *= lim / d; c.y *= lim / d; }
  }
  function flyTo(x, y, z, dur, done) {
    const c = R.cam;
    tween = { from: { x: c.x, y: c.y, z: c.z }, to: { x, y, z: z || c.z }, t: 0, dur: dur || 1.2, done };
  }
  function stepTween(dt) {
    if (!tween) return;
    tween.t += dt;
    const k = CP.smooth(CP.clamp(tween.t / tween.dur, 0, 1));
    const c = R.cam, f = tween.from, to = tween.to;
    // zoom interpolates in log space so the climb to orbit feels even; position follows the zoom
    c.z = Math.exp(CP.lerp(Math.log(f.z), Math.log(to.z), k));
    const kp = f.z === to.z ? k : (1 / c.z - 1 / f.z) / (1 / to.z - 1 / f.z);
    c.x = CP.lerp(f.x, to.x, kp);
    c.y = CP.lerp(f.y, to.y, kp);
    if (tween.t >= tween.dur) { const done = tween.done; tween = null; if (done) done(); }
  }
  function zoomAt(sx, sy, factor) {
    const [wx, wy] = R.toWorld(sx, sy);
    R.cam.z *= factor;
    clampCam();
    const [nx, ny] = R.toWorld(sx, sy);
    R.cam.x += wx - nx;
    R.cam.y += wy - ny;
    clampCam();
  }
  // the whole city, fitted to the window and nudged right of the side panel
  function cityView() {
    const b = window.CEI_DATA.bounds;
    const z = Math.min((window.innerWidth - 340) / (b[2] - b[0]), (window.innerHeight - 90) / (b[3] - b[1])) * 0.94;
    return { x: (b[0] + b[2]) / 2 - 150 / z, y: (b[1] + b[3]) / 2 - 20 / z, z };
  }
  game.showDistrict = function (d) {
    R.focusDistricts = [d];
    const v = cityView();
    flyTo(d.label[0] - 150 / (v.z * 2.2), d.label[1], v.z * 2.2, 0.9);
  };

  // ---------- placing buildings ----------
  function place(wx, wy) {
    const type = ui.selected, spec = CP.BUILDINGS[type];
    const out = sim.place(type, wx, wy);
    if (!out.ok) {
      ui.toast("Not allowed: " + out.why, "bad");
      CP.audio.error();
      return;
    }
    CP.audio.place(true);
    R.floatText(wx, wy, `−${CP.money(spec.cost)}`, "#ffd166");
    R.burst(wx, wy, "😊", 2, { size: 18 });
    // announce every metric that moved up a band
    let n = 0;
    CP.DOMAINS.forEach((dm, i) => {
      const a = CP.bandOf(out.before[i]), b = CP.bandOf(out.after[i]);
      if (a !== b) R.floatText(wx, wy, `${dm.icon} ${a.name} → ${b.name}`, b.color, 0.65 * ++n);
    });
    afterChange();
  }

  function afterChange() {
    for (const r of res.onChange()) R.burst(r.x, r.y, "💚", 3);
    const completed = missions.evaluate();
    if (completed.length) {
      CP.audio.fanfare();
      R.confetti();
      const lines = CP.STORY.missionDone;
      const pages = completed.map((m, i) => {
        R.floatText(m.d.label[0], m.d.label[1], `+${CP.money(m.grant)} grant`, "#4ef0a0", 0.4);
        return lines[(missions.done.length + i) % lines.length].replace("{title}", m.title).replace("{grant}", CP.money(m.grant));
      });
      if (missions.allDone()) pages.push(CP.STORY.allMissionsDone);
      setTimeout(() => { if (!game.ended) ui.dcm(pages); }, 700);
    }
    ui.update();
  }

  // ---------- hover: ghost preview, tooltips, residents ----------
  let hoverRes = null, pinned = null, pinT = 0;
  function updateHover() {
    if (!live() || !mouse.over || (mouse.down && mouse.dragged)) {
      R.preview = null;
      R.hoverDistrict = null;
      hoverRes = null;
      ui.hideTooltip();
      return;
    }
    const [wx, wy] = R.toWorld(mouse.x, mouse.y);
    const d = sim.districtAt(wx, wy);
    R.hoverDistrict = d;
    hoverRes = res.pick(mouse.x, mouse.y);
    if (ui.selected) {
      const site = sim.siteCheck(wx, wy);
      R.preview = { type: ui.selected, x: wx, y: wy, ok: site.ok, why: site.why };
      ui.tooltip(ui.buildTip(ui.selected, site), mouse.x, mouse.y);
      hoverRes = null;
    } else {
      R.preview = null;
      if (hoverRes) ui.hideTooltip();
      else if (d) ui.tooltip(ui.districtTip(d), mouse.x, mouse.y);
      else ui.hideTooltip();
    }
    canvas.classList.toggle("talk", !!hoverRes);
  }

  // speech bubble for the hovered (or recently clicked) resident
  function updateSpeech(dt) {
    if (game.phase !== "play") return;
    if (pinT > 0) pinT -= dt; else pinned = null;
    const r = live() ? hoverRes || pinned : null;
    for (const x of res.list) x.talking = x === r;
    if (!r) return ui.hideSpeech();
    const [hx, hy] = res.headPos(r);
    ui.speech(r.name, r.d.name, r.line, hx, hy - 26, r.state === "need" ? "" : "happy");
  }

  // ---------- input ----------
  function bindInput() {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", (e) => {
      if (!live()) return;
      mouse.down = true; mouse.dragged = false;
      mouse.sx = e.clientX; mouse.sy = e.clientY;
    });
    window.addEventListener("mousemove", (e) => {
      const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
      mouse.x = e.clientX; mouse.y = e.clientY;
      mouse.over = e.target === canvas;
      if (mouse.down && live()) {
        if (Math.hypot(e.clientX - mouse.sx, e.clientY - mouse.sy) > 5) mouse.dragged = true;
        if (mouse.dragged) {
          tween = null;
          R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
          clampCam();
          canvas.classList.add("pan");
        }
      }
      updateHover();
    });
    window.addEventListener("mouseup", (e) => {
      if (!mouse.down) return;
      mouse.down = false;
      canvas.classList.remove("pan");
      if (!live() || mouse.dragged || e.target !== canvas) return;
      const [wx, wy] = R.toWorld(e.clientX, e.clientY);
      if (e.button !== 0) { ui.select(null); updateHover(); return; }
      if (ui.selected) place(wx, wy);
      else {
        const r = res.pick(e.clientX, e.clientY);
        if (r) { pinned = r; pinT = 6; CP.audio.click(); }
      }
      updateHover();
    });
    canvas.addEventListener("mouseleave", () => { mouse.over = false; updateHover(); });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!live()) return;
      tween = null;
      zoomAt(e.clientX, e.clientY, Math.pow(1.0018, -e.deltaY));
      updateHover();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (ui.dcmOpen()) { e.preventDefault(); return ui.dcmNext(); }
        if (game.phase === "talk") return nextLine();
      }
      if (e.key === "Escape") {
        if (!game.started && game.phase !== "title") return skipIntro();
        ui.select(null);
        pinned = null;
        return updateHover();
      }
      if (!live()) return;
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === "1") ui.setTab("build");
      if (k === "2") ui.setTab("plan");
      if (k === "3") ui.setTab("missions");
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => keys.clear());
  }

  // ---------- opening sequence ----------
  const intro = { i: -1, t: 0, a: null, b: null };
  function setupIntro() {
    const home = sim.districts.find((d) => d.name === CP.STORY.introDistrict) || sim.districts[0];
    const guest = sim.districts.find((d) => d.name === CP.STORY.introVisitor) || sim.districts[1];
    const [x, y] = home.label;
    world.reserved.push([x, y, 1300]);
    world.clearCells();
    intro.a = home.resident; intro.b = guest.resident;
    Object.assign(intro.a, { scripted: true, x: x - 58, y, dir: 1, moving: false });
    Object.assign(intro.b, { scripted: true, x: x + 58, y, dir: -1, moving: false });
    const house = (dx, dy, wall, roof) => ({ kind: "house", x: x + dx, y: y + dy, it: { kind: "house", wall, roof, h: 13 } });
    const tree = (dx, dy, s, hue) => ({ kind: "tree", x: x + dx, y: y + dy, s, hue });
    R.props = [
      { kind: "path", x, y: y - 14 }, { kind: "bench", x: x - 190, y: y - 40 }, { kind: "lamp", x: x + 185, y: y - 34 }, { kind: "stop", x: x - 300, y: y - 30 },
      house(-390, -190, "#e8d8c3", "#8c5a3c"), house(40, -215, "#d9d4cc", "#5d6d7e"), house(440, -180, "#f2e6d0", "#a9746e"),
      tree(-175, -150, 22, 0.3), tree(255, -135, 26, 0.7), tree(360, 150, 24, 0.5), tree(-430, 130, 28, 0.1),
    ];
    Object.assign(R.cam, { x, y: y - 62, z: 1.6, rot: 0 });
  }
  function nextLine() {
    intro.i++;
    const line = CP.STORY.intro[intro.i];
    if (!line) return pullBack();
    intro.t = Math.max(3, 1.6 + line.text.length * 0.055);
    intro.a.talking = line.who === 0;
    intro.b.talking = line.who === 1;
    CP.audio.click();
  }
  function begin() {
    $("#title").classList.add("fade");
    setTimeout(() => $("#title").classList.add("hidden"), 800);
    $("#btn-skip").classList.remove("hidden");
    game.phase = "talk";
    nextLine();
  }
  function endScene() {
    ui.hideSpeech();
    R.props = [];
    world.reserved.length = 0;
    world.clearCells();
    if (intro.a.scripted) { res.release(intro.a); res.release(intro.b); }
  }
  // street level -> past the city -> orbit
  function pullBack() {
    game.phase = "pullback";
    ui.hideSpeech();
    intro.a.talking = intro.b.talking = false;
    CP.audio.whoosh();
    flyTo(0, 0, R.minZoom() * 1.3, 6, () => {
      endScene();
      game.phase = "briefing";
      ui.dcm(CP.STORY.briefing, { button: "Begin my term ▸", done: () => startPlay(2.2) });
    });
  }
  function startPlay(dur) {
    $("#btn-skip").classList.add("hidden");
    game.phase = "play";
    game.started = true;
    R.showNeeds = true;
    ["#status", "#tabs", "#panel"].forEach((s) => $(s).classList.remove("hidden"));
    ui.setTab("missions");
    ui.update();
    ui.tick(game.timeLeft);
    const v = cityView();
    flyTo(v.x, v.y, v.z, dur);
  }
  function skipIntro() {
    if (game.started) return;
    tween = null;
    $("#title").classList.add("hidden");
    if (ui.dcmOpen()) ui.dcmClose();
    endScene();
    startPlay(0.9);
  }
  function stepIntro(dt) {
    if (game.phase !== "talk") return;
    const line = CP.STORY.intro[intro.i];
    const who = line.who === 0 ? intro.a : intro.b;
    const [hx, hy] = res.headPos(who);
    ui.speech(who.name, who.d.name, line.text, hx, hy - 8);
    intro.t -= dt;
    if (intro.t <= 0) nextLine();
  }

  // ---------- the term ----------
  let incomeT = 0;
  function stepTerm(dt) {
    if (!live()) return;
    game.timeLeft -= dt;
    incomeT += dt;
    if (CP.INCOME.amount && incomeT >= CP.INCOME.every) {
      incomeT -= CP.INCOME.every;
      sim.budget += CP.INCOME.amount;
      ui.update();
    }
    ui.tick(game.timeLeft);
    if (game.timeLeft <= 0) endTerm();
  }
  function endTerm() {
    game.ended = true;
    game.phase = "ended";
    ui.select(null);
    R.preview = null;
    R.hoverDistrict = null;
    ui.hideTooltip();
    ui.hideSpeech();
    ui.tick(0);
    ui.update();
    CP.audio.fanfare();
    R.confetti();
    ui.report();
  }
  game.endTerm = endTerm;

  // ---------- loop ----------
  let last = performance.now();
  let hudT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepTween(dt);
    if (live() && !tween) {
      const sp = 700 / R.cam.z;
      if (keys.has("w") || keys.has("arrowup")) R.cam.y -= sp * dt;
      if (keys.has("s") || keys.has("arrowdown")) R.cam.y += sp * dt;
      if (keys.has("a") || keys.has("arrowleft")) R.cam.x -= sp * dt;
      if (keys.has("d") || keys.has("arrowright")) R.cam.x += sp * dt;
      if (keys.has("q") || keys.has("-")) zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.pow(0.25, dt));
      if (keys.has("e") || keys.has("=") || keys.has("+")) zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.pow(4, dt));
      clampCam();
    }
    if (!game.paused && !game.ended) res.update(dt);
    stepTerm(dt);
    R.draw(dt);
    stepIntro(dt);
    updateSpeech(dt);
    hudT += dt;
    if (hudT > 0.15) {
      hudT = 0;
      const alt = (window.innerWidth / R.cam.z) * 1.1;
      $("#alt").textContent = alt > 1500 ? `${(alt / 1000).toFixed(alt > 20000 ? 0 : 1)} km` : `${Math.round(alt)} m`;
    }
    requestAnimationFrame(frame);
  }

  // Dev hooks: index.html#play skips the opening; add &end to jump to the report, &t=30 to set the seconds left.
  function devHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("play")) return;
    skipIntro();
    if (h.has("t")) game.timeLeft = +h.get("t");
    if (h.has("end")) endTerm();
  }

  window.addEventListener("load", () => {
    canvas = $("#game");
    R.init(canvas);
    setTimeout(() => {
      world.build();
      res.init();
      missions.init();
      ui.init();
      setupIntro();
      bindInput();
      $("#loading").classList.add("hidden");
      $("#btn-start").onclick = begin;
      $("#btn-skip").onclick = skipIntro;
      canvas.addEventListener("click", () => { if (game.phase === "talk") nextLine(); });
      requestAnimationFrame(frame);
      devHash();
    }, 30);
  });
})();
