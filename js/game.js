// Game loop, camera (city view <-> district view), input, placement on lots, undo, disasters and repairs,
// civilian mission offers (zoom in, Accept / Decline, zoom back out), protests, revenue and upkeep,
// the opening sequence and the 10-minute term.
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

  // screen space left for the map once the panels are placed: [left, right, top, bottom] in px
  const mobile = () => CP.isMobile();
  function insets(district) {
    const top = ($("#topbar").getBoundingClientRect().bottom || 100) + 8;
    if (mobile()) {
      if (window.innerWidth > 760) return district ? [10, 260, top, 150] : [310, 10, top, 10]; // landscape phone: side panels
      return district ? [10, 10, top, 170] : [10, 10, top, Math.round(window.innerHeight * 0.3)];
    }
    return district ? [380, 340, Math.max(70, top), 90] : [360, 20, Math.max(79, top), 31];
  }
  // fit a world box into the free screen area
  function fit(b, ins, scale) {
    const [l, r, t, bt] = ins;
    const aw = Math.max(160, window.innerWidth - l - r), ah = Math.max(160, window.innerHeight - t - bt);
    const z = Math.min(aw / (b[2] - b[0]), ah / (b[3] - b[1])) * scale;
    return { z, dx: (l - r) / 2, dy: (t - bt) / 2 };
  }
  // the whole city, fitted between the side panel and the right edge
  function cityView() {
    const b = window.CEI_DATA.bounds;
    const { z, dx, dy } = fit(b, insets(false), 0.94);
    return { x: (b[0] + b[2]) / 2 - dx / z, y: (b[1] + b[3]) / 2 - dy / z, z };
  }
  // one district, fitted between the side panel (left) and its profile card (right)
  function districtView(d) {
    // lots are what matters: frame them (falls back to the label point)
    const pts = d.lots.length ? d.lots : [{ x: d.label[0], y: d.label[1] }];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], padX = 1500, padY = 1300;
    const f = fit([b[0] - padX, b[1] - padY, b[2] + padX, b[3] + padY], insets(true), 1);
    const z = CP.clamp(f.z, cityView().z * 1.8, 0.22);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { x: cx - f.dx / z, y: cy - f.dy / z, z };
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
    if (mobile()) ui.collapse(true); // give the map the screen on phones
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

  // Mission "Go": zoom to the district and light it up. Most missions open Plan on the right metric;
  // planning missions open Plan without giving the answer away; build missions open Build with the building picked.
  game.goMission = function (m) {
    ui.mission = m;
    const d = missions.focus(m);
    R.highlight = d;
    if (m.kind === "build") {
      ui.setTab("build");
      ui.select(m.type);
    } else {
      ui.setTab("plan");
      if (!missions.secret(m)) ui.setMetric(missions.metrics(m)[0]);
    }
    game.enterDistrict(d);
    ui.tutStep("go");
  };

  game.discardMission = function (m) {
    const fresh = missions.discard(m);
    if (ui.mission === m) { ui.mission = null; R.highlight = null; }
    CP.audio.undo();
    ui.toast(fresh
      ? `🗑 Discarded. New mission from <b>${CP.esc(fresh.giver.name)}</b> in ${CP.esc(fresh.d.name)}: ${CP.esc(fresh.title)}`
      : "🗑 Discarded. No new missions are available right now.");
    ui.update();
  };

  // Clicking a civilian with a "!": the camera zooms in on them and they pitch their mission.
  // Accept or Decline, then the camera flies back to where it was.
  game.talkTo = null;
  game.openOffer = function (r) {
    const o = r && r.offer;
    if (!o || ui.dcmOpen()) return;
    const c = R.cam, back = { x: c.x, y: c.y, z: c.z };
    const [, H] = R.size();
    const z = Math.max(c.z, 0.4);
    flyTo(r.x, r.y + (H * 0.1) / z, z, 0.8);
    game.talkTo = r;
    ui.hideRepair();
    CP.audio.click();
    const full = missions.active.length >= CP.MISSIONS.active;
    const tl = o.kind === "timed" ? ` · ⏱ ${CP.MISSIONS.timedSeconds} s once accepted` : "";
    const reward = `Reward: ${CP.money(o.grant)} grant${o.kind === "plan" ? ` (×${CP.MISSIONS.planBonus}: you have to work out what's wrong)` : ""}${tl}.`;
    const choices = [
      { label: full ? `✔ Accept (you have ${CP.MISSIONS.active} already)` : "✔ Accept", cls: "yes", disabled: full, fn: () => finishOffer(o, true, back) },
      { label: "✖ Decline", cls: "no", fn: () => finishOffer(o, false, back) },
    ];
    if (full) choices.push({ label: "Later", fn: () => finishOffer(o, null, back) });
    ui.dcm([{ text: `${o.pitch}\n\n${reward}`, speaker: r }], { choices, cancel: full ? 2 : 1 });
  };
  function finishOffer(o, accept, back) {
    const r = game.talkTo;
    game.talkTo = null;
    if (r) r.talking = false;
    flyTo(back.x, back.y, back.z, 0.8);
    if (accept === true) {
      const out = missions.accept(o);
      if (!out.ok) { ui.toast(out.why, "bad"); CP.audio.error(); return ui.update(); }
      CP.audio.grant();
      ui.toast(`✔ Mission accepted: <b>${CP.esc(o.title)}</b>`, "good");
      R.burst(o.giver.x, o.giver.y, "💛", 3);
      ui.setTab("missions");
    } else if (accept === false) {
      missions.decline(o);
      ui.toast(`You declined ${CP.esc(o.giver.name)}'s mission. Someone else will ask soon.`);
    }
    ui.update();
  }

  // ---------- disasters ----------
  game.goDisaster = function (dis) {
    R.highlight = dis.d;
    if (R.focus !== dis.d) game.enterDistrict(dis.d, true);
    flyTo(dis.x, dis.y - 120 / Math.max(focusZ, 0.08), Math.max(focusZ * 0.9, 0.08), 0.9);
    ui.toast(`${dis.t.icon} Click the ${dis.t.name.toLowerCase()} to repair it (${CP.money(dis.cost)}).`);
  };
  game.repair = function (dis) {
    const before = sim.overall();
    const out = events.repair(dis);
    if (!out.ok) { ui.toast(out.why, "bad"); CP.audio.error(); return; }
    ui.hideRepair();
    CP.audio.place(true);
    setTimeout(() => CP.audio.grant(), 300);
    R.floatText(dis.x, dis.y, `−${CP.money(dis.cost)} repair`, "#ffd166");
    R.burst(dis.x, dis.y, "🛠️", 4, { spread: 200 });
    R.burst(dis.x, dis.y, "💚", 4, { spread: 160 });
    ui.toast(`🛠 ${dis.t.name} in ${CP.esc(dis.d.name)} repaired. Revenue is flowing again.`, "good");
    if (R.highlight === dis.d && !ui.mission) R.highlight = null;
    const r = dis.d.resident;
    if (r) { r.complaint = { line: "Thank you for fixing it, Director! We can start putting things back together.", t: 7 }; game.pinResident(r, 6); }
    afterChange(before);
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
      const lines = CP.CIV_LINES.done;
      const pages = completed.map((m, i) => {
        const d = missions.focus(m);
        R.floatText(d.label[0], d.label[1], `+${CP.money(m.grant)} grant`, "#4ef0a0", 0.4);
        R.burst(m.giver.x, m.giver.y, "💚", 4);
        return { speaker: m.giver, text: lines[(missions.done.length + i) % lines.length].replace("{title}", m.doneTitle).replace("{grant}", CP.money(m.grant)) };
      });
      if (missions.unlocked) { missions.unlocked = false; pages.push(CP.STORY.lotsUnlocked); }
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
    R.hoverDisaster = null;
    if (!live() || !mouse.over || (mouse.down && mouse.dragged) || tween) {
      R.hoverDistrict = null;
      hoverRes = null;
      if (!ui.barTip) ui.hideTooltip();
      canvas.classList.remove("talk");
      return;
    }
    const [wx, wy] = R.toWorld(mouse.x, mouse.y);
    const d = sim.districtAt(wx, wy);
    const dis = events.pick(mouse.x, mouse.y);
    if (dis) {
      R.hoverDisaster = dis;
      R.hoverDistrict = dis.d;
      hoverRes = null;
      ui.tooltip(ui.disasterTip(dis), mouse.x, mouse.y, "warnbox");
      canvas.classList.add("talk");
      canvas.classList.remove("lot");
      return;
    }
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
      if (hoverRes.offer) ui.tooltip(`<div class="tt-h">❗ ${CP.esc(hoverRes.name)} · ${CP.esc(hoverRes.d.name)}</div><div>Has a mission for you. ${CP.touch ? "Tap" : "Click"} to talk.</div>`, mouse.x, mouse.y);
      else ui.hideTooltip();
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
    if (game.talkTo) { for (const x of res.list) x.talking = x === game.talkTo; return ui.hideSpeech(); }
    const r = live() ? (hoverRes && !hoverRes.offer ? hoverRes : null) || pinned : null;
    for (const x of res.list) x.talking = x === r;
    if (!r) return ui.hideSpeech();
    const [hx, hy] = res.headPos(r);
    if (hx < -50 || hx > window.innerWidth + 50 || hy < -50 || hy > window.innerHeight + 50) return ui.hideSpeech();
    const s = res.say(r);
    ui.speech(r.name, r.d.name, s.text, hx, hy - 26, s.mood);
  }

  // ---------- input ----------
  // Pointer events cover mouse, touch and pen. One finger pans, two fingers pinch-zoom (and pan), a tap clicks.
  // On touch there is no hover, so with a building selected the first tap on a lot shows the preview card
  // and a second tap on the same lot builds.
  const pointers = new Map();
  let pinch = null, armedLot = null;
  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  function bindInput() {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      if (!live()) return;
      CP.touch = e.pointerType !== "mouse";
      document.body.classList.toggle("touch", CP.touch);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinch = pinchInfo();
        mouse.dragged = true; // a pinch is never a tap
        tween = null;
        ui.hideTooltip();
        return;
      }
      if (pointers.size > 2) return;
      mouse.down = true; mouse.dragged = false;
      mouse.sx = e.clientX; mouse.sy = e.clientY;
      mouse.x = e.clientX; mouse.y = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (pinch && pointers.size >= 2) {
        if (!live()) return;
        const n = pinchInfo();
        R.cam.x -= (n.x - pinch.x) / R.cam.z; R.cam.y -= (n.y - pinch.y) / R.cam.z;
        zoomAt(n.x, n.y, n.d / pinch.d);
        afterCameraMove();
        pinch = n;
        return;
      }
      if (e.pointerType !== "mouse" && !p) return; // a finger that didn't start on the map
      const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
      mouse.x = e.clientX; mouse.y = e.clientY;
      mouse.over = e.pointerType === "mouse" ? e.target === canvas : true;
      mouse.shift = e.shiftKey;
      if (mouse.down && live()) {
        if (Math.hypot(e.clientX - mouse.sx, e.clientY - mouse.sy) > (e.pointerType === "mouse" ? 5 : 10)) mouse.dragged = true;
        if (mouse.dragged) {
          tween = null;
          R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
          clampCam();
          canvas.classList.add("pan");
        }
      }
      updateHover();
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 0) { mouse.down = false; mouse.over = false; canvas.classList.remove("pan"); updateHover(); }
        else if (pointers.size === 1) { const [q] = [...pointers.values()]; mouse.x = q.x; mouse.y = q.y; } // keep panning with the other finger
        return;
      }
      if (!mouse.down) return;
      mouse.down = false;
      canvas.classList.remove("pan");
      if (e.pointerType !== "mouse" && (mouse.dragged || e.type === "pointercancel")) { mouse.over = false; updateHover(); } // no hover card left behind after a swipe
      if (e.type === "pointercancel" || !live() || mouse.dragged) return;
      if (e.pointerType === "mouse") {
        if (e.target !== canvas) return;
        if (e.button !== 0) { ui.select(null); updateHover(); return; }
        click(e.clientX, e.clientY, e.shiftKey);
        return updateHover();
      }
      // touch tap: show what's under the finger, then act
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.over = true;
      const lot = R.focus && ui.selected && !events.pick(e.clientX, e.clientY) ? R.lotAt(e.clientX, e.clientY) : null;
      if (lot && (!armedLot || armedLot.lot !== lot || armedLot.type !== ui.selected)) {
        armedLot = { lot, type: ui.selected };
        return updateHover();
      }
      armedLot = null;
      click(e.clientX, e.clientY, false);
      updateHover();
      // a tap that just opened something (district, resident) shouldn't leave a hover card over the map
      if (!R.preview && !events.pick(e.clientX, e.clientY)) { mouse.over = false; ui.hideTooltip(); }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { mouse.over = false; updateHover(); } });
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
        if (ui.dcmHasChoices()) return ui.dcmCancel();
        if (ui.repairOpen()) return ui.hideRepair();
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
      if (k === "n") ui.toggleNasaView();
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
    if (ui.repairOpen()) ui.hideRepair();
    const dis = events.pick(x, y);
    if (dis) { CP.audio.click(); return ui.repair(dis, x, y); }
    const lot = R.focus ? R.lotAt(x, y) : null;
    if (lot) {
      if (ui.selected) return tryPlace(lot, shift);
      if (!lot.building) { ui.setTab("build"); return ui.toast(`${CP.ZONES[lot.zone].icon} ${CP.ZONES[lot.zone].name} lot. Pick a building to place here.`); }
      return;
    }
    const r = res.pick(x, y);
    if (r && r.offer) return game.openOffer(r);
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
    // time-limited contracts fail; the civilian who asked lets you know
    const offers = missions.offers.length;
    const failed = missions.tick(dt);
    if (failed.length) {
      CP.audio.error();
      const lines = CP.CIV_LINES.failed;
      ui.dcm(failed.map((m, i) => ({ speaker: m.giver, text: lines[(missions.expired.length + i) % lines.length].replace("{title}", m.doneTitle) })));
      if (ui.mission && failed.includes(ui.mission)) { ui.mission = null; R.highlight = null; }
    }
    if (failed.length || missions.offers.length !== offers) ui.update();
    // disasters
    const ev = events.tick(game.elapsed, dt);
    if (ev.fired) onEvent(ev.fired);
    for (const dis of ev.moved) {
      ui.toast(`${dis.t.icon} The tornado has moved into <b>${CP.esc(dis.d.name)}</b>!`, "bad");
      complain(dis.d, "event", `${dis.t.icon} The tornado is coming right at us! Help, Director!`);
      ui.update();
    }
    // jokes
    res.tickJokes(dt);
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
    R.burst(ev.x, ev.y, ev.t.icon, 6, { spread: 260, size: 30 });
    ui.banner(`<span class="big">${ev.t.icon}</span> <b>EMERGENCY: ${ev.t.name} in ${CP.esc(ev.d.name)}</b>. ${CP.esc(ev.text)}
      <div class="small">${CP.DOMAINS[ev.t.metric].icon} ${CP.DOMAINS[ev.t.metric].label} fell ${CP.bandOf(ev.before).name} → ${CP.bandOf(ev.after).name}. ${CP.esc(ev.d.name)} pays no revenue and its residents get unhappier until you <b>click the disaster and repair it (${CP.money(ev.cost)})</b>.</div>`, "event");
    complain(ev.d, "event", `${ev.t.icon} ${ev.text} We need help, Director!`);
    afterChange(before);
  }
  function endTerm() {
    game.ended = true;
    game.phase = "ended";
    ui.hideRepair();
    ui.setTab("missions");
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

  // ---------- trailer mode (index.html#trailer) ----------
  // A scripted 28-second tour used to record the game's trailer. It shows its opening card and waits until
  // window.CP_TRAILER_GO() is called (so a screen recording can start first), then runs on its own.
  function trailer() {
    ui.tut.on = false;
    skipIntro();
    tween = null;
    const orbitZ = R.minZoom() * 1.25;
    Object.assign(R.cam, { x: 0, y: 0, z: orbitZ });
    document.body.classList.add("trailer", "trailer-card");
    const el = document.createElement("div");
    el.id = "trailer";
    el.innerHTML = `<div class="tr-card"><div class="tr-kicker">🛰️ NASA Space Apps Challenge 2026</div><h1>CEI<span>·</span>SAT</h1>
      <h2>Make Calgary the most equitable city on the planet</h2></div><div class="tr-cap hidden"></div>
      <div class="tr-mark">Code and trailer made with help from AI (Claude Code)</div>`;
    document.body.appendChild(el);
    const card = el.querySelector(".tr-card"), cap = el.querySelector(".tr-cap");
    const say = (html) => { cap.innerHTML = html; cap.classList.remove("hidden"); cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in"); };
    const showCard = (html) => { card.innerHTML = html; card.classList.remove("hidden"); document.body.classList.add("trailer-card"); cap.classList.add("hidden"); };
    const hideCard = () => { card.classList.add("hidden"); document.body.classList.remove("trailer-card"); };
    const fl = sim.districts.find((d) => d.name === "Forest Lawn") || sim.districts[0];
    const steps = [
      [0, () => flyTo(0, 0, orbitZ * 1.6, 2.8)],
      [2.8, () => { hideCard(); document.body.classList.add("trailer-nopanel"); ui.toggleNasaView(true); const v = cityView(); flyTo(v.x, v.y, v.z, 2.6); say("You command a planning satellite above <b>Calgary</b>"); }],
      [5.6, () => { say("Seeing the city through real <b>NASA Landsat</b> imagery"); const v = cityView(); flyTo(v.x + 800, v.y - 600, v.z * 1.7, 2.8); }],
      [8.6, () => { document.body.classList.remove("trailer-nopanel"); ui.toggleNasaView(false); ui.setTab("plan"); ui.setMetric(3); const v = cityView(); flyTo(v.x, v.y, v.z, 0.9); say("Coloured by the real <b>2024 Calgary Equity Index</b>"); }],
      [11.6, () => { ui.setNasa("lst"); say("<b>NASA MODIS</b> finds the hottest neighbourhoods"); }],
      [14.6, () => {
        ui.setTab("build"); ui.select("park"); game.enterDistrict(fl, true);
        say("Build where life is least fair");
      }],
      [15.6, () => {
        const lots = fl.lots.filter((l) => !l.building && !sim.isLocked(l) && CP.BUILDINGS.park.zones.includes(l.zone)).sort((a, b) => a.house - b.house);
        trailer.lot = lots[0];
        if (!trailer.lot) return;
        const [x, y] = R.toScreen(trailer.lot.x, trailer.lot.y);
        mouse.x = x; mouse.y = y; mouse.over = true;
        updateHover();
      }],
      [17.8, () => { if (trailer.lot) { tryPlace(trailer.lot); mouse.over = false; updateHover(); } say("A park cools a hot district: <b>NASA data changes the plan</b>"); }],
      [20.6, () => { ui.select(null); const ev = events.fire("tornado"); onEvent(ev); game.goDisaster(ev); say("Disasters strike. Every choice has trade-offs."); }],
      [23.8, () => {
        ui.hideBanner && ui.hideBanner();
        const v = cityView(); flyTo(v.x, v.y, v.z * 0.8, 3);
        ui.toggleNasaView(true);
        showCard(`<div class="tr-kicker">Real Calgary equity data + NASA Earth observations</div><h1>CEI<span>·</span>SAT</h1>
          <h2>Play free in your browser</h2><div class="tr-url">felix-dolor.github.io/NASA-City-Planner</div>
          <div class="tr-src">Data: City of Calgary Equity Index 2024 · NASA HLS Landsat &amp; MODIS via NASA GIBS</div>`);
      }],
    ];
    window.CP_TRAILER_GO = () => {
      if (trailer.started) return;
      trailer.started = true;
      for (const [t, fn] of steps) setTimeout(fn, t * 1000);
    };
    if (new URLSearchParams(location.hash.slice(1)).has("autostart")) setTimeout(window.CP_TRAILER_GO, 200);
  }

  // Dev hooks: index.html#play skips the opening; add &end to jump to the report, &t=30 to set the seconds
  // left, &event=flood to fire a disaster right away (&event=all for every kind), &notips to skip the tutorial,
  // &nasa to switch on NASA view, &plan=ndvi or &plan=lst to open Plan on a NASA layer.
  function devHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has("trailer")) return trailer();
    if (!h.has("play")) return;
    if (h.has("notips")) ui.tut.on = false;
    skipIntro();
    if (h.has("t")) game.timeLeft = +h.get("t");
    if (h.has("event")) setTimeout(() => {
      const k = h.get("event");
      for (const key of k === "all" ? Object.keys(CP.EVENT_TYPES) : k.split(",")) onEvent(events.fire(key));
    }, 1200);
    if (h.has("go")) setTimeout(() => {
      const m = missions.active[0];
      game.goMission(m);
      ui.setTab("build");
      ui.select(CP.BUILD_ORDER.find((t) => missions.helps(m, t)) || CP.BUILD_ORDER[0]);
    }, 1000);
    if (h.has("nasa")) setTimeout(() => ui.toggleNasaView(true), 400);
    if (h.has("plan")) setTimeout(() => { ui.setTab("plan"); const k = h.get("plan"); if (k === "ndvi" || k === "lst") ui.setNasa(k); }, 500);
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
