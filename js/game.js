// Game loop, camera (city view <-> district view), input, placement on lots, undo, random events,
// protests, revenue and upkeep, the opening sequence and the 10-minute term.
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render, ui = CP.ui, world = CP.world, res = CP.residents, missions = CP.missions, events = CP.events;
  const $ = (s) => document.querySelector(s);

  // phase: title -> talk (street scene) -> pullback -> briefing -> play -> ended
  const game = (CP.game = { paused: false, userPaused: false, started: false, ended: false, phase: "title", timeLeft: CP.TERM_SECONDS, elapsed: 0 });
  let canvas;
  let tween = null;
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, dragged: false, sx: 0, sy: 0, over: false, shift: false };
  const live = () => game.started && !game.paused && !game.userPaused && !game.ended;

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
    zoomGoal = null;
    tween = { from: { x: c.x, y: c.y, z: c.z }, to: { x, y, z: z || c.z }, t: 0, dur: dur || 1.2, done };
  }
  function stepTween(dt) {
    if (!tween) return;
    tween.t += dt;
    const k = CP.smooth(CP.clamp(tween.t / tween.dur, 0, 1));
    const c = R.cam, f = tween.from, to = tween.to;
    // zoom interpolates in log space so the climb to orbit feels even; position follows the zoom
    c.z = Math.exp(CP.lerp(Math.log(f.z), Math.log(to.z), k));
    const kp = Math.abs(f.z - to.z) < 1e-9 ? k : (1 / c.z - 1 / f.z) / (1 / to.z - 1 / f.z);
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
  // smooth zoom: wheel/pinch input accumulates here and is eased in over a few frames
  let zoomGoal = null;
  function queueZoom(sx, sy, factor) {
    tween = null;
    if (!zoomGoal) zoomGoal = { f: 1, x: sx, y: sy };
    zoomGoal.f *= factor;
    zoomGoal.x = sx; zoomGoal.y = sy;
  }
  function stepZoom(dt) {
    if (!zoomGoal) return;
    const k = 1 - Math.exp(-dt * 16);
    const step = Math.pow(zoomGoal.f, k);
    zoomAt(zoomGoal.x, zoomGoal.y, step);
    zoomGoal.f /= step;
    if (Math.abs(Math.log(zoomGoal.f)) < 0.002) zoomGoal = null;
    afterCameraMove();
  }

  // the whole city, fitted between the side panel and the right edge
  function cityView() {
    const b = window.CEI_DATA.bounds;
    const z = Math.min((window.innerWidth - 380) / (b[2] - b[0]), (window.innerHeight - 110) / (b[3] - b[1])) * 0.94;
    return { x: (b[0] + b[2]) / 2 - 170 / z, y: (b[1] + b[3]) / 2 - 24 / z, z };
  }
  // one district, fitted between the side panel (left) and its profile card (right)
  function districtView(d) {
    // lots are what matters: frame them (falls back to the label point)
    const pts = d.lots.length ? d.lots : [{ x: d.label[0], y: d.label[1] }];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], padX = 1500, padY = 1300;
    const aw = Math.max(320, window.innerWidth - 380 - 340), ah = Math.max(260, window.innerHeight - 150);
    const z = CP.clamp(Math.min(aw / (b[2] - b[0] + padX * 2), ah / (b[3] - b[1] + padY * 2)), cityView().z * 1.8, 0.22);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { x: cx - 20 / z, y: cy + 10 / z, z };
  }
  game.cityView = cityView;

  // ---------- district zoom ----------
  let focusZ = 0;
  game.enterDistrict = function (d, quick) {
    if (!d) return;
    R.focus = d;
    const v = districtView(d);
    focusZ = v.z;
    flyTo(v.x, v.y, v.z, quick ? 0.6 : 0.9);
    ui.profile(d);
    ui.update();
    CP.audio.click();
  };
  game.exitDistrict = function (noFly) {
    if (!R.focus) return;
    R.focus = null;
    R.preview = null;
    ui.profile(null);
    ui.update();
    if (!noFly) { const v = cityView(); flyTo(v.x, v.y, v.z, 0.8); }
  };
  function afterCameraMove() {
    // zooming far out of a district drops back to city view
    if (R.focus && R.cam.z < focusZ * 0.55) game.exitDistrict(true);
  }

  // Mission "Go": zoom to the district, open Plan on the right metric, light the district up
  game.goMission = function (m) {
    ui.mission = m;
    const d = missions.focus(m);
    R.highlight = d;
    ui.setTab("plan");
    ui.setMetric(missions.metrics(m)[0]);
    game.enterDistrict(d);
    ui.tutStep("go");
  };

  // ---------- placing buildings ----------
  let lastPlaced = null; // { b, t } for undo
  function tryPlace(lot, rezone) {
    const type = ui.selected, spec = CP.BUILDINGS[type];
    const pv = sim.preview(type, lot, rezone);
    if (!pv.allowed && !rezone && !pv.locked && !pv.protest && !lot.building) {
      ui.toast(`${spec.name} can't go on a ${CP.ZONES[lot.zone].name} lot. Hold <b>Shift</b> and click to rezone it (+${CP.money(CP.REZONE.cost)}).`, "bad");
      CP.audio.error();
      return;
    }
    const out = sim.place(type, lot, rezone);
    if (!out.ok) {
      ui.toast("Not allowed: " + out.why, "bad");
      CP.audio.error();
      return;
    }
    const b = out.b;
    CP.audio.place(true);
    R.floatText(lot.x, lot.y, `−${CP.money(b.cost)}`, "#ffd166");
    if (b.demolished) {
      R.dust(lot.x, lot.y);
      CP.audio.destroy();
      ui.toast(`🏚 A family home was demolished in ${CP.esc(lot.d.name)}.`, "bad");
    }
    if (b.rezoned) {
      ui.toast(`Rezoned to ${CP.ZONES[lot.zone].name}. Residents lost some goodwill.`, "bad");
      complain(lot.d, "rezone");
    }
    // band changes in the district, and any harm next door
    let n = 0;
    CP.DOMAINS.forEach((dm, i) => {
      const a = CP.bandOf(out.before[i]), c = CP.bandOf(out.after[i]);
      if (a !== c) R.floatText(lot.x, lot.y, `${dm.icon} ${a.name} → ${c.name}`, c.color, 0.65 * ++n);
    });
    if (spec.gain.some((g) => g > 0)) R.burst(lot.x, lot.y, "😊", 2, { size: 18 });
    for (const p of b.fixed) {
      const t = CP.EVENT_TYPES[p.ev];
      ui.toast(`${t.icon} Recovered: ${CP.esc(p.d.name)}'s ${CP.DOMAINS[p.m].label} is back after the ${t.name.toLowerCase()}.`, "good");
    }
    if (out.harm && out.harm.homes > 0) {
      const worst = (b.fracs || []).slice().sort((a, c) => c[1] * c[0].households - a[1] * a[0].households)[0];
      if (worst && (spec.area.harm || out.harm.homes > 600)) complain(worst[0], b.type);
    }
    if (b.protest) {
      CP.audio.protest();
      ui.banner(`📢 Protest in <b>${CP.esc(lot.d.name)}</b>: residents are blocking new building for ${CP.PROTEST.seconds} s. "${CP.esc(pick(CP.COMPLAINTS.protest))}"<div class="small">A park within ${(CP.PARK_BUFFER / 1000).toFixed(1)} km would have buffered the pollution.</div>`, "bad");
      R.burst(lot.d.label[0], lot.d.label[1], "📢", 4, { spread: 200 });
    }
    lastPlaced = { b, t: CP.UNDO_SECONDS, completed: false };
    ui.tutStep("placed");
    afterChange(out.overallBefore, lastPlaced);
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  game.undo = function () {
    if (!lastPlaced || lastPlaced.t <= 0 || game.ended) return;
    const { b } = lastPlaced;
    if (lastPlaced.completed) {
      ui.toast("That building already completed a contract, so it can't be undone.", "bad");
      CP.audio.error();
      return;
    }
    const before = sim.overall();
    sim.undo(b);
    lastPlaced = null;
    ui.showUndo(null);
    CP.audio.undo();
    R.floatText(b.x, b.y, `+${CP.money(b.cost)} refund`, "#4ef0a0");
    ui.toast(`↶ Undone: ${CP.BUILDINGS[b.type].name}. Full ${CP.money(b.cost)} refund.`);
    afterChange(before);
  };

  function complain(d, kind, line) {
    const r = res.complain(d, kind, line);
    if (r) game.pinResident(r, 7);
  }

  function afterChange(overallBefore, placed) {
    for (const r of res.onChange()) R.burst(r.x, r.y, "💚", 3);
    if (overallBefore !== undefined) ui.equityDelta(sim.overall() - overallBefore);
    const completed = missions.evaluate();
    if (completed.length) {
      if (placed) placed.completed = true;
      CP.audio.fanfare();
      setTimeout(() => CP.audio.grant(), 450);
      R.confetti();
      const lines = CP.STORY.missionDone;
      const pages = completed.map((m, i) => {
        const d = missions.focus(m);
        R.floatText(d.label[0], d.label[1], `+${CP.money(m.grant)} grant`, "#4ef0a0", 0.4);
        return lines[(missions.done.length + i) % lines.length].replace("{title}", m.title).replace("{grant}", CP.money(m.grant));
      });
      if (missions.unlocked) { missions.unlocked = false; pages.push(CP.STORY.lotsUnlocked); }
      if (missions.allDone()) pages.push(CP.STORY.allMissionsDone);
      if (ui.mission && completed.includes(ui.mission)) { ui.mission = null; R.highlight = null; }
      setTimeout(() => { if (!game.ended) ui.dcm(pages); }, 700);
    }
    ui.update();
  }

  // ---------- hover: ghost preview, cards, tooltips, residents ----------
  let hoverRes = null, pinned = null, pinT = 0;
  game.pinResident = function (r, secs) { pinned = r; pinT = secs || 7; };
  function updateHover() {
    R.preview = null;
    R.hoverLot = null;
    R.hoverWarn = false;
    if (!live() || !mouse.over || (mouse.down && mouse.dragged) || tween) {
      R.hoverDistrict = null;
      hoverRes = null;
      ui.hideTooltip();
      canvas.classList.remove("talk");
      return;
    }
    const [wx, wy] = R.toWorld(mouse.x, mouse.y);
    const d = sim.districtAt(wx, wy);
    hoverRes = res.pick(mouse.x, mouse.y);
    const lot = R.focus ? R.lotAt(mouse.x, mouse.y) : null;
    R.hoverDistrict = d;
    if (ui.tab === "plan") ui.renderIndicators(d && d !== R.focus ? d : null);
    if (lot) {
      R.hoverLot = lot;
      hoverRes = null;
      if (ui.selected) {
        const pv = sim.preview(ui.selected, lot, mouse.shift);
        R.preview = { lot, type: ui.selected, pv };
        ui.tooltip(ui.previewCard(pv), mouse.x, mouse.y, "card " + (pv.ok ? "ok" : "no"));
      } else ui.tooltip(ui.lotTip(lot), mouse.x, mouse.y);
    } else if (hoverRes) {
      ui.hideTooltip();
    } else if (d && d !== R.focus) {
      if (ui.selected) {
        R.hoverWarn = !sim.canAfford(sim.baseCost(ui.selected, d));
        ui.tooltip(ui.cityBuildTip(ui.selected, d), mouse.x, mouse.y, R.hoverWarn ? "warnbox" : "");
      } else ui.tooltip(ui.districtTip(d), mouse.x, mouse.y);
    } else ui.hideTooltip();
    canvas.classList.toggle("talk", !!hoverRes);
    canvas.classList.toggle("lot", !!lot);
  }

  // speech bubble for the hovered (or recently clicked / complaining) resident
  function updateSpeech(dt) {
    if (game.phase !== "play") return;
    if (pinT > 0) pinT -= dt; else pinned = null;
    const r = live() ? hoverRes || pinned : null;
    for (const x of res.list) x.talking = x === r;
    if (!r) return ui.hideSpeech();
    const [hx, hy] = res.headPos(r);
    if (hx < -50 || hx > window.innerWidth + 50 || hy < -50 || hy > window.innerHeight + 50) return ui.hideSpeech();
    const s = res.say(r);
    ui.speech(r.name, r.d.name, s.text, hx, hy - 26, s.mood);
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
      mouse.shift = e.shiftKey;
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
      if (e.button !== 0) { ui.select(null); updateHover(); return; }
      click(e.clientX, e.clientY, e.shiftKey);
      updateHover();
    });
    canvas.addEventListener("mouseleave", () => { mouse.over = false; updateHover(); });
    // mouse wheel zooms; touchpad pinch (ctrl+wheel) zooms; touchpad two-finger swipe pans
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!live()) return;
      const sp = ui.scrollSpeed;
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit, dx = e.deltaX * unit;
      const swipe = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(dx) > 0.5 || (Math.abs(dy) < 40 && dy % 1 !== 0));
      if (e.ctrlKey) queueZoom(e.clientX, e.clientY, Math.exp(-dy * 0.012 * sp));
      else if (swipe) {
        tween = null;
        R.cam.x += (dx * sp) / R.cam.z;
        R.cam.y += (dy * sp) / R.cam.z;
        clampCam();
      } else queueZoom(e.clientX, e.clientY, Math.pow(1.0016, -dy * sp));
      updateHover();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.target && e.target.tagName === "INPUT") return;
      mouse.shift = e.shiftKey;
      if (e.key === "Enter" || e.key === " ") {
        if (ui.dcmOpen()) { e.preventDefault(); return ui.dcmNext(); }
        if (game.phase === "talk") return nextLine();
      }
      if (e.key === "Escape") {
        if (!game.started && game.phase !== "title") return skipIntro();
        if (game.userPaused) return game.togglePause(false);
        if (ui.selected) { ui.select(null); return updateHover(); }
        if (R.focus) return game.exitDistrict();
        pinned = null;
        return updateHover();
      }
      if (game.started && !game.ended && (e.key === "p" || e.key === "P") && !ui.dcmOpen()) return game.togglePause();
      if (e.key === "m" || e.key === "M") return $("#btn-sound").click();
      if (!live()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return game.undo(); }
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === "1") ui.setTab("missions");
      if (k === "2") ui.setTab("plan");
      if (k === "3") ui.setTab("build");
      if (k === "shift") updateHover();
    });
    window.addEventListener("keyup", (e) => {
      keys.delete(e.key.toLowerCase());
      mouse.shift = e.shiftKey;
      if (e.key === "Shift") updateHover();
    });
    window.addEventListener("blur", () => keys.clear());
  }

  function click(x, y, shift) {
    const [wx, wy] = R.toWorld(x, y);
    const lot = R.focus ? R.lotAt(x, y) : null;
    if (lot) {
      if (ui.selected) return tryPlace(lot, shift);
      if (!lot.building) { ui.setTab("build"); return ui.toast(`${CP.ZONES[lot.zone].icon} ${CP.ZONES[lot.zone].name} lot. Pick a building to place here.`); }
      return;
    }
    const r = res.pick(x, y);
    if (r) { game.pinResident(r, 7); CP.audio.click(); return; }
    const d = sim.districtAt(wx, wy);
    if (d && d !== R.focus) return game.enterDistrict(d);
    if (!d && R.focus) return game.exitDistrict();
  }

  // ---------- pause ----------
  game.togglePause = function (force) {
    if (!game.started || game.ended) return;
    game.userPaused = force === undefined ? !game.userPaused : force;
    $("#paused").classList.toggle("hidden", !game.userPaused);
    $("#btn-pause").textContent = game.userPaused ? "▶" : "⏸";
    if (game.userPaused) CP.audio.stopMusic(); else if (CP.audio.wantMusic) CP.audio.startMusic();
    updateHover();
  };

  // ---------- opening sequence ----------
  const intro = { i: -1, t: 0, a: null, b: null };
  function setupIntro() {
    const home = sim.districts.find((d) => d.name === CP.STORY.introDistrict) || sim.districts[0];
    const guest = sim.districts.find((d) => d.name === CP.STORY.introVisitor) || sim.districts[1];
    // a quiet street: away from highways, water and lots, so nothing is drawn across the houses
    let [x, y] = home.label, best = Infinity;
    for (let r = 0; r <= 3000; r += 150)
      for (let a = 0; a < 6.28; a += 0.4) {
        const px = home.label[0] + Math.cos(a) * r, py = home.label[1] + Math.sin(a) * r;
        if (sim.districtAt(px, py) !== home || world.highwayAt(px, py, 900) || world.waterAt(px, py, 700)) continue;
        if (sim.lots.some((l) => CP.dist(l.x, l.y, px, py) < 1100)) continue;
        if (r < best) { best = r; x = px; y = py; }
      }
    world.reserved.push([x, y, 1300]);
    world.clearCells();
    intro.a = home.resident; intro.b = guest.resident;
    Object.assign(intro.a, { scripted: true, x: x - 58, y, dir: 1, moving: false });
    Object.assign(intro.b, { scripted: true, x: x + 58, y, dir: -1, moving: false });
    const house = (dx, dy, wall, roof) => ({ kind: "house", x: x + dx, y: y + dy, it: { kind: "house", wall, roof, h: 13 } });
    const tree = (dx, dy, s, hue) => ({ kind: "tree", x: x + dx, y: y + dy, s, hue });
    R.props = [
      { kind: "path", x, y: y + 6 }, { kind: "bench", x: x - 190, y: y - 40 }, { kind: "lamp", x: x + 185, y: y - 34 }, { kind: "stop", x: x - 300, y: y - 30 },
      house(-390, -230, "#e8d8c3", "#8c5a3c"), house(40, -260, "#d9d4cc", "#5d6d7e"), house(440, -220, "#f2e6d0", "#a9746e"),
      tree(-175, -150, 22, 0.3), tree(255, -135, 26, 0.7), tree(360, 150, 24, 0.5), tree(-430, 130, 28, 0.1),
    ];
    Object.assign(R.cam, { x, y: y - 62, z: 1.6, rot: 0 });
  }
  function nextLine() {
    if (game.phase !== "talk") return;
    intro.i++;
    const line = CP.STORY.intro[intro.i];
    if (!line) return pullBack();
    intro.t = Math.max(3.2, 2 + line.text.length * 0.05);
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
  // street level -> past the city -> orbit (where the satellite is shown)
  function pullBack() {
    game.phase = "pullback";
    ui.hideSpeech();
    intro.a.talking = intro.b.talking = false;
    CP.audio.whoosh();
    flyTo(0, 0, R.minZoom() * 1.3, 5, () => {
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
    R.dayFrac = 0;
    ["#topbar", "#panel"].forEach((s) => $(s).classList.remove("hidden"));
    ui.setTab("missions");
    ui.update();
    ui.tick(game.timeLeft);
    const v = cityView();
    R.cityZ = v.z;
    flyTo(v.x, v.y, v.z, dur, () => ui.startTutorial());
    CP.audio.beginMusic();
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
    ui.speech(who.name, who.d.name, line.text, hx, hy - 8, "", "Click to continue ▸");
    intro.t -= dt;
    if (intro.t <= 0) nextLine();
  }

  // ---------- the term ----------
  let payT = 0;
  function stepTerm(dt) {
    if (!live()) return;
    game.timeLeft -= dt;
    game.elapsed += dt;
    R.dayFrac = game.elapsed / CP.TERM_SECONDS;
    // revenue minus upkeep, paid in small amounts
    payT += dt;
    if (payT >= CP.PAYOUT_EVERY) {
      payT -= CP.PAYOUT_EVERY;
      const amt = (sim.netPerMin() * CP.PAYOUT_EVERY) / 60;
      sim.budget += amt;
      ui.budgetPop(amt);
      ui.update();
    }
    // protests
    const had = sim.protests.size;
    sim.tickProtests(dt);
    if (sim.protests.size !== had) { ui.toast("📢 The protest is over. Building can resume."); ui.update(); }
    // time-limited contracts
    for (const m of missions.tick(dt)) ui.toast(`⏱ The bonus contract "${CP.esc(m.title)}" ran out of time.`, "bad"), ui.update();
    // random events
    const ev = events.tick(game.elapsed);
    if (ev) onEvent(ev);
    // undo window
    if (lastPlaced) {
      lastPlaced.t -= dt;
      ui.showUndo(lastPlaced.t > 0 && !lastPlaced.completed ? lastPlaced.b : null, lastPlaced.t);
      if (lastPlaced.t <= 0) lastPlaced = null;
    }
    ui.tick(game.timeLeft);
    if (game.timeLeft <= 0) endTerm();
  }
  function onEvent(ev) {
    const before = sim.overall();
    CP.audio.alarm();
    R.flash(ev.d);
    R.burst(ev.d.label[0], ev.d.label[1], ev.t.icon, 6, { spread: 260, size: 30 });
    ui.banner(`<span class="big">${ev.t.icon}</span> <b>${ev.t.name} in ${CP.esc(ev.d.name)}</b>: ${CP.esc(ev.text)}
      <div class="small">${CP.DOMAINS[ev.t.metric].icon} ${CP.DOMAINS[ev.t.metric].label} fell ${CP.bandOf(ev.before).name} → ${CP.bandOf(ev.after).name}. Build a <b>${ev.fix}</b> there to recover.</div>`, "event");
    complain(ev.d, "event", `${ev.t.icon} ${ev.text} We need help, Director!`);
    afterChange(before);
  }
  function endTerm() {
    game.ended = true;
    game.phase = "ended";
    ui.select(null);
    R.preview = null;
    R.hoverDistrict = null;
    ui.showUndo(null);
    ui.hideTooltip();
    ui.hideSpeech();
    ui.endTutorial();
    ui.tick(0);
    ui.update();
    CP.audio.fanfare();
    R.confetti();
    if (R.focus) game.exitDistrict();
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
    stepZoom(dt);
    if (live() && !tween) {
      const sp = (700 / R.cam.z) * ui.scrollSpeed;
      let moved = false;
      if (keys.has("w") || keys.has("arrowup")) { R.cam.y -= sp * dt; moved = true; }
      if (keys.has("s") || keys.has("arrowdown")) { R.cam.y += sp * dt; moved = true; }
      if (keys.has("a") || keys.has("arrowleft")) { R.cam.x -= sp * dt; moved = true; }
      if (keys.has("d") || keys.has("arrowright")) { R.cam.x += sp * dt; moved = true; }
      if (keys.has("q") || keys.has("-")) { zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.pow(0.25, dt)); afterCameraMove(); }
      if (keys.has("e") || keys.has("=") || keys.has("+")) zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.pow(4, dt));
      clampCam();
      if (moved) updateHover();
    }
    if (!game.paused && !game.userPaused && !game.ended) res.update(dt);
    stepTerm(dt);
    R.draw(dt);
    stepIntro(dt);
    updateSpeech(dt);
    if (game.started) ui.frame(dt);
    hudT += dt;
    if (hudT > 0.15) {
      hudT = 0;
      const alt = (window.innerWidth / R.cam.z) * 1.1;
      $("#alt").textContent = alt > 1500 ? `${(alt / 1000).toFixed(alt > 20000 ? 0 : 1)} km` : `${Math.round(alt)} m`;
      if (game.started && !tween && mouse.over) updateHover();
    }
    requestAnimationFrame(frame);
  }

  // Dev hooks: index.html#play skips the opening; add &end to jump to the report, &t=30 to set the seconds
  // left, &event=flood to fire an event right away, &notips to skip the tutorial.
  function devHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("play")) return;
    if (h.has("notips")) ui.tut.on = false;
    skipIntro();
    if (h.has("t")) game.timeLeft = +h.get("t");
    if (h.has("event")) setTimeout(() => onEvent(events.fire(h.get("event"))), 1200);
    if (h.has("go")) setTimeout(() => {
      const m = missions.active[0];
      game.goMission(m);
      ui.setTab("build");
      ui.select(CP.BUILD_ORDER.find((t) => missions.metrics(m).some((i) => CP.BUILDINGS[t].gain[i] >= 20)));
    }, 1000);
    if (h.has("orbit")) setTimeout(() => flyTo(0, 0, R.minZoom() * 1.3, 0.1), 1000);
    if (h.has("end")) endTerm();
  }

  window.addEventListener("load", () => {
    canvas = $("#game");
    R.init(canvas);
    setTimeout(() => {
      world.build();
      sim.initWorld();
      sim.recompute();
      res.init();
      missions.init();
      events.init();
      ui.init();
      setupIntro();
      bindInput();
      R.cityZ = cityView().z;
      $("#loading").classList.add("hidden");
      $("#btn-start").onclick = begin;
      $("#btn-skip").onclick = skipIntro;
      canvas.addEventListener("click", () => { if (game.phase === "talk") nextLine(); });
      requestAnimationFrame(frame);
      devHash();
    }, 30);
  });
})();
