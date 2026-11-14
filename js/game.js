// Game loop, camera, input and tool actions.
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render, ui = CP.ui, world = CP.world;
  const $ = (s) => document.querySelector(s);

  const game = (CP.game = { paused: false, started: false });
  let canvas;
  let tween = null;
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, button: 0, dragged: false, sx: 0, sy: 0, lastTree: null, lastCell: null };

  // ---------- camera ----------
  function clampCam() {
    const c = R.cam;
    c.z = CP.clamp(c.z, R.minZoom(), R.maxZoom);
    const lim = world.PLANET_R * 0.9;
    const d = Math.hypot(c.x, c.y);
    if (d > lim) { c.x *= lim / d; c.y *= lim / d; }
  }
  game.flyTo = function (x, y, z, dur) {
    const c = R.cam;
    tween = { from: { x: c.x, y: c.y, z: c.z, rot: c.rot }, to: { x, y, z: z || c.z, rot: 0 }, t: 0, dur: dur || 1.2 };
  };
  function stepTween(dt) {
    if (!tween) return;
    tween.t += dt;
    const k = CP.smooth(CP.clamp(tween.t / tween.dur, 0, 1));
    const c = R.cam, f = tween.from, to = tween.to;
    // zoom interpolates in log space so the descent feels even
    c.z = Math.exp(CP.lerp(Math.log(f.z), Math.log(to.z), k));
    c.x = CP.lerp(f.x, to.x, k);
    c.y = CP.lerp(f.y, to.y, k);
    c.rot = CP.lerp(f.rot, to.rot, k);
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

  // ---------- tool actions ----------
  function validSite(x, y) {
    const t = sim.tractAt(x, y);
    if (!t) return { ok: false, why: "Outside Calgary's census tracts" };
    if (world.waterAt(x, y, 5)) return { ok: false, why: "That's in the river!" };
    return { ok: true, t };
  }

  function describeImpact(res, cost) {
    const net = Math.round(res.scoreDelta - cost * 0.5);
    const rows = CP.DOMAINS.map((d, i) => [d, res.delta[i]]).filter(([, v]) => Math.abs(v) > 0.0005);
    let html = rows.map(([d, v]) => `<div class="tt-row"><span>${d.icon} ${d.short}</span><span class="${v > 0 ? "pos" : "neg"}">${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%</span></div>`).join("");
    if (res.best && Math.abs(res.best.dt) > 0.01)
      html += `<div style="margin-top:5px" class="muted">Biggest effect: <b style="color:var(--text)">${CP.esc(res.best.t.name)}</b> ${CP.signed(-res.best.dt, 2)} need</div>`;
    html += `<div class="tt-row" style="margin-top:5px"><span>Net score</span><span class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${net}</span></div>`;
    return { html, net };
  }

  let lastPreview = 0;
  function updateHover(force) {
    if (!game.started || game.paused) return;
    const [wx, wy] = R.toWorld(mouse.x, mouse.y);
    const tract = sim.tractAt(wx, wy);
    R.hoverTract = tract;
    if (tract) ui.showTract(tract);
    const [lat, lon] = CP.unproject(wx, wy);
    $("#coords").textContent = `${lat.toFixed(4)}°N ${(-lon).toFixed(4)}°W`;
    const now = performance.now();
    if (!force && now - lastPreview < 50) return;
    lastPreview = now;
    const tool = ui.tool;
    const spec = ui.toolSpec(tool);
    if (mouse.down && mouse.dragged && (tool === "inspect" || mouse.button !== 0)) { ui.hideTooltip(); return; }

    if (spec) {
      let x = wx, y = wy, cell = null;
      if (spec.kind === "zone") {
        const cx = Math.floor(wx / CP.ZONE_CELL), cy = Math.floor(wy / CP.ZONE_CELL);
        cell = [cx * CP.ZONE_CELL, cy * CP.ZONE_CELL];
        x = cell[0] + CP.ZONE_CELL / 2; y = cell[1] + CP.ZONE_CELL / 2;
      }
      const v = validSite(x, y);
      if (!v.ok) {
        R.preview = { x, y, radius: spec.radius, score: -1, icon: spec.icon, cell, color: spec.color };
        ui.clearGhost();
        ui.tooltip(`<div class="tt-h">${spec.icon} ${spec.name}</div><span class="neg">${v.why}</span>`, mouse.x, mouse.y);
        return;
      }
      const res = sim.preview({ kind: spec.kind, type: spec.type, x, y });
      const { html, net } = describeImpact(res, spec.cost);
      R.preview = { x, y, radius: spec.kind === "zone" ? 900 : spec.radius, score: net, icon: spec.kind === "zone" ? null : spec.icon, cell, color: spec.color };
      ui.showGhost(res.delta);
      const afford = sim.canAfford(spec.cost);
      ui.tooltip(`<div class="tt-h">${spec.icon} ${spec.name} · ${CP.money(spec.cost)}${afford ? "" : ' <span class="neg">(can\'t afford)</span>'}</div>
        <div class="muted" style="margin-bottom:4px">${CP.esc(v.t.name)}</div>${html}`, mouse.x, mouse.y);
    } else if (tool === "bulldoze") {
      const target = pickTarget(wx, wy);
      if (!target) {
        R.preview = null;
        ui.clearGhost();
        ui.tooltip(`<div class="tt-h">🚜 Bulldoze</div><span class="muted">Point at a building, landmark, tree grove or zone.</span>`, mouse.x, mouse.y);
        return;
      }
      const res = sim.previewDestroy(target);
      const refund = refundOf(target);
      const net = Math.round(res.scoreDelta + refund * 0.5);
      R.preview = { x: target.x, y: target.y, target, radius: 0, score: net };
      ui.showGhost(res.delta);
      const { html } = describeImpact(res, -refund);
      ui.tooltip(`<div class="tt-h">🚜 Demolish ${CP.esc(nameOf(target))}</div><div class="tt-row"><span>Refund</span><span class="pos">+${CP.money(refund)}</span></div>${html}`, mouse.x, mouse.y);
    } else {
      R.preview = null;
      ui.clearGhost();
      if (tract) {
        const lm = CP.LANDMARKS.find((l) => !l.placement.removed && CP.dist(l.pos[0], l.pos[1], wx, wy) < Math.max(80, 14 / R.cam.z));
        ui.tooltip(`<div class="tt-h">${CP.esc(tract.name)}</div>
          ${lm ? `<div style="color:var(--accent2)">★ ${lm.name}</div><div class="muted" style="margin-bottom:4px">${lm.blurb}</div>` : ""}
          <div class="tt-row"><span>Total Equity Score</span><b>${tract.live.total.toFixed(1)}</b></div>
          <div class="tt-row"><span>Rank by need</span><span>#${tract.rank} / 288</span></div>`, mouse.x, mouse.y);
      } else ui.hideTooltip();
    }
  }

  function nameOf(p) {
    if (p.kind === "landmark") return p.landmark.name;
    if (p.kind === "zone") return CP.ZONES[p.type].name + " zone";
    const s = CP.BUILDINGS[p.type];
    return (p.kind === "existing" ? "existing " : "") + s.name;
  }
  function refundOf(p) {
    if (p.kind === "building") return CP.BUILDINGS[p.type].cost * 0.6;
    if (p.kind === "zone") return 0;
    if (p.kind === "landmark") return p.spec.refund;
    return CP.BUILDINGS[p.type].cost * 0.45;
  }
  function pickTarget(wx, wy) {
    const z = R.cam.z;
    let best = null, bd = Infinity;
    for (const p of sim.placements) {
      if (p.removed || p.kind === "zone") continue;
      if (p.kind === "existing" && z < 0.12) continue;
      const r = (p.kind === "landmark" ? 40 : 20) / z + (p.kind === "landmark" ? 60 : 20);
      const d = CP.dist(p.x, p.y, wx, wy);
      if (d < r && d < bd) { best = p; bd = d; }
    }
    if (best) return best;
    return world.zoneAt(wx, wy) || null;
  }

  function placeAt(spec, x, y, quiet) {
    const v = validSite(x, y);
    if (!v.ok) { if (!quiet) { ui.toast(v.why, "bad"); CP.audio.error(); } return null; }
    if (!sim.canAfford(spec.cost)) {
      if (!quiet) { ui.toast("💸 Not enough budget — bulldoze something or end your term.", "bad"); CP.audio.error(); }
      return null;
    }
    let res;
    if (spec.kind === "zone") {
      const cx = Math.floor(x / CP.ZONE_CELL), cy = Math.floor(y / CP.ZONE_CELL);
      const prev = world.zones.get(cx + "," + cy);
      if (prev && prev.type === spec.type) return null;
      if (prev) sim.removeZoneAt(cx, cy);
      res = sim.place("zone", spec.type, (cx + 0.5) * CP.ZONE_CELL, (cy + 0.5) * CP.ZONE_CELL, { cx, cy });
      if (res.ok) {
        world.zones.set(cx + "," + cy, res.p);
        world.invalidate(res.p.x, res.p.y, CP.ZONE_CELL);
      }
    } else {
      res = sim.place("building", spec.type, x, y);
      if (res.ok) world.invalidate(x, y, spec.type === "park" ? 300 : spec.type === "hospital" ? 160 : 90);
    }
    if (!res.ok) return null;
    afterChange(res.p, quiet);
    return res.p;
  }

  function afterChange(p, quiet) {
    const spec = p.kind === "zone" ? CP.ZONES[p.type] : CP.BUILDINGS[p.type];
    const d = p.scoreDelta;
    if (p.type === "trees") {
      CP.audio.tree();
      R.burst(p.x, p.y, d > 0 ? "🌱" : "🍂", 1, { size: 18 });
    } else if (p.kind === "zone") {
      if (!quiet) CP.audio.click();
      if (Math.random() < 0.3) R.burst(p.x, p.y, d > 0 ? "🙂" : "😒", 1, { size: 16 });
    } else {
      CP.audio.place(d > 0);
      const n = CP.clamp(Math.round(Math.abs(d) / 25), 2, 14);
      const faces = d > 40 ? ["😊", "😄", "🥳", "❤️", "👏"] : d > 0 ? ["🙂", "😊", "👍"] : ["😟", "😠", "👎"];
      for (let i = 0; i < n; i++) R.burst(p.x, p.y, faces[i % faces.length], 1);
      R.floatText(p.x, p.y, `-${CP.money(spec.cost)}`, "#ffd166");
      // tell the story in the ticker
      const contrib = p.contrib.slice().sort((a, b) => b.gain.reduce((x, y) => x + y, 0) - a.gain.reduce((x, y) => x + y, 0))[0];
      if (contrib) {
        const t = contrib.t;
        const top = CP.DOMAINS.map((dm, i) => [dm, t.base.need[i] - t.live.need[i]]).sort((a, b) => b[1] - a[1]).slice(0, 2).filter((x) => x[1] > 0.05);
        const name = t.name.split(",")[0];
        const mood = d > 60 ? "🎉 Residents of" : d > 0 ? "🙂 People in" : "😟 Hmm — people in";
        ui.ticker(`${spec.icon} <b>${spec.name}</b> opened. ${mood} <b>${CP.esc(name)}</b> ${top.length ? "see " + top.map(([dm, v]) => `${dm.icon} ${dm.short} need −${v.toFixed(1)}`).join(", ") : "barely notice"} · <span style="color:${d >= 0 ? "var(--good)" : "var(--bad)"}">${d >= 0 ? "+" : ""}${Math.round(d)} pts</span>`);
      }
    }
    checkChallenges();
    ui.update();
  }

  function checkChallenges() {
    CP.challenges.evaluate();
    for (const ch of CP.CHALLENGES) {
      if (ch.justCompleted) {
        const s = ch.state.stars;
        ui.toast(`${ch.icon} Mission complete: <b>${ch.title}</b> ${"★".repeat(s)}${"☆".repeat(3 - s)}<br><small>${ch.custom ? "" : Math.round(ch.state.ratio * 100) + "% of the ideal placement · "}+${s * CP.STAR_POINTS} pts</small>`, "gold");
        CP.audio.fanfare();
        R.confetti();
      } else if (ch.state.done && ch.starsGained > 0) {
        ui.toast(`${ch.icon} ${ch.title}: upgraded to ${"★".repeat(ch.state.stars)}!`, "gold");
        CP.audio.coin();
      } else if (ch.id === "hospital" && ch.state.done && ch.state.stars === 0 && ch.starsGained === 0 && !ch._warned) {
        ch._warned = true;
        ui.toast("🏥 That hospital reaches few people lacking care. Try the 🔦 Hint in Missions.", "bad");
      }
    }
  }

  function bulldoze(wx, wy) {
    const target = pickTarget(wx, wy);
    if (!target) return;
    if (target.kind === "landmark" && !confirm(`Demolish ${target.landmark.name}? Calgarians will not be pleased.`)) return;
    const res = sim.destroy(target);
    if (!res) return;
    if (target.kind === "zone") world.zones.delete(target.cx + "," + target.cy);
    world.invalidate(target.x, target.y, 400);
    CP.audio.destroy();
    if (res.refund > 0) { R.floatText(target.x, target.y, `+${CP.money(res.refund)}`, "#4ef0a0"); setTimeout(CP.audio.coin, 250); }
    R.burst(target.x, target.y, "💥", 3);
    const sad = res.delta < -1;
    for (let i = 0; i < (sad ? 6 : 2); i++) R.burst(target.x, target.y, sad ? (i % 2 ? "😢" : "😠") : "🧱", 1);
    ui.ticker(`🚜 Demolished <b>${CP.esc(nameOf(target))}</b>: ${res.refund ? "+" + CP.money(res.refund) + " back" : "no refund"} · <span style="color:${res.delta >= 0 ? "var(--good)" : "var(--bad)"}">${res.delta >= 0 ? "+" : ""}${Math.round(res.delta)} pts</span>`);
    checkChallenges();
    ui.update();
    updateHover(true);
  }

  // ---------- input ----------
  function bindInput() {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", (e) => {
      if (!game.started || game.paused) return;
      mouse.down = true; mouse.button = e.button; mouse.dragged = false;
      mouse.sx = e.clientX; mouse.sy = e.clientY;
      mouse.lastTree = null; mouse.lastCell = null;
      const spec = ui.toolSpec(ui.tool);
      if (e.button === 0 && spec && (spec.brush || spec.kind === "zone")) brushAt(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (mouse.down) {
        if (Math.hypot(e.clientX - mouse.sx, e.clientY - mouse.sy) > 4) mouse.dragged = true;
        const spec = ui.toolSpec(ui.tool);
        const brush = mouse.button === 0 && spec && (spec.brush || spec.kind === "zone");
        if (brush) brushAt(e.clientX, e.clientY);
        else if (mouse.dragged && (mouse.button !== 0 || ui.tool === "inspect" || keys.has(" ") || !spec)) {
          if (mouse.button === 0 && ui.tool === "bulldoze" && !keys.has(" ")) return;
          R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
          clampCam();
          canvas.classList.add("pan");
        }
      }
      if (e.target === canvas) updateHover();
      else { ui.hideTooltip(); }
    });
    window.addEventListener("mouseup", (e) => {
      if (!mouse.down) return;
      mouse.down = false;
      canvas.classList.remove("pan");
      if (!game.started || game.paused || mouse.dragged || e.button !== 0 || e.target !== canvas) return;
      const [wx, wy] = R.toWorld(e.clientX, e.clientY);
      const spec = ui.toolSpec(ui.tool);
      if (ui.tool === "inspect") {
        const t = sim.tractAt(wx, wy);
        ui.pinned = null;
        if (t) ui.showTract(t, true);
      } else if (ui.tool === "bulldoze") bulldoze(wx, wy);
      else if (spec && !spec.brush && spec.kind !== "zone") { placeAt(spec, wx, wy); updateHover(true); }
    });
    canvas.addEventListener("mouseleave", () => { ui.hideTooltip(); R.hoverTract = null; });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!game.started || game.paused) return;
      tween = null;
      zoomAt(e.clientX, e.clientY, Math.pow(1.0018, -e.deltaY));
      updateHover(true);
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") {
        if (!$("#modal").classList.contains("hidden")) ui.closeModal();
        else { ui.setTool("inspect"); ui.pinned = null; ui.toggleDrawer("none"); }
        return;
      }
      if (!game.started || game.paused) return;
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === "b") return ui.setTool("bulldoze");
      if (k === "m") return ui.toggleDrawer("missions");
      if (k === "l") {
        const i = CP.OVERLAYS.findIndex((o) => o.id === R.overlay);
        return ui.setOverlay(CP.OVERLAYS[(i + (e.shiftKey ? -1 + CP.OVERLAYS.length : 1)) % CP.OVERLAYS.length].id);
      }
      for (const [id, s] of Object.entries(CP.BUILDINGS)) if (s.key.toLowerCase() === k) return ui.setTool(id);
      for (const [id, s] of Object.entries(CP.ZONES)) if (s.key.toLowerCase() === k) return ui.setTool("zone:" + id);
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => keys.clear());
  }

  function brushAt(sx, sy) {
    const spec = ui.toolSpec(ui.tool);
    const [wx, wy] = R.toWorld(sx, sy);
    if (spec.brush) {
      const step = Math.max(110, 26 / R.cam.z);
      if (mouse.lastTree && CP.dist(mouse.lastTree[0], mouse.lastTree[1], wx, wy) < step) return;
      const quiet = !!mouse.lastTree;
      mouse.lastTree = [wx, wy];
      placeAt(spec, wx, wy, quiet);
    } else {
      const cx = Math.floor(wx / CP.ZONE_CELL), cy = Math.floor(wy / CP.ZONE_CELL);
      const key = cx + "," + cy;
      if (mouse.lastCell === key) return;
      const quiet = !!mouse.lastCell;
      mouse.lastCell = key;
      placeAt(spec, wx, wy, quiet);
    }
    updateHover(true);
  }

  // ---------- loop ----------
  let last = performance.now();
  let hudT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepTween(dt);
    if (!game.started) R.cam.rot += dt * 0.03;
    if (game.started && !game.paused && !tween) {
      const sp = 700 / R.cam.z;
      if (keys.has("w") || keys.has("arrowup")) R.cam.y -= sp * dt;
      if (keys.has("s") || keys.has("arrowdown")) R.cam.y += sp * dt;
      if (keys.has("a") || keys.has("arrowleft")) R.cam.x -= sp * dt;
      if (keys.has("d") || keys.has("arrowright")) R.cam.x += sp * dt;
      if (keys.has("q") || keys.has("-")) zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.pow(0.25, dt));
      if (keys.has("e") || keys.has("=") || keys.has("+")) zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.pow(4, dt));
      clampCam();
    }
    R.draw(dt);
    hudT += dt;
    if (hudT > 0.15) {
      hudT = 0;
      const alt = (window.innerWidth / R.cam.z) * 1.1;
      $("#alt").textContent = alt > 1500 ? `${(alt / 1000).toFixed(alt > 20000 ? 0 : 1)} km` : `${Math.round(alt)} m`;
    }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  // click or key during the descent skips it
  game.skipIntro = function () {
    if (!game.started && tween && tween.done) { tween.t = tween.dur; stepTween(0); }
  };
  window.addEventListener("pointerdown", () => game.skipIntro());

  function start() {
    $("#title").classList.add("fade");
    CP.audio.whoosh();
    const b = window.CEI_DATA.bounds;
    const fit = Math.min(window.innerWidth / (b[2] - b[0]), window.innerHeight / (b[3] - b[1])) * 0.85;
    tween = {
      from: { x: R.cam.x, y: R.cam.y, z: R.cam.z, rot: ((R.cam.rot + Math.PI) % (2 * Math.PI)) - Math.PI },
      to: { x: (b[0] + b[2]) / 2 + 2500, y: (b[1] + b[3]) / 2, z: fit, rot: 0 },
      t: 0, dur: 3.6,
      done: () => {
        game.started = true;
        $("#title").classList.add("hidden");
        ["#topbar", "#toolbar", "#rightcol", "#legend", "#ticker"].forEach((s) => $(s).classList.remove("hidden"));
        ui.update();
        ui.help(true);
      },
    };
  }

  // Dev/screenshot hooks: index.html#play skips the intro; extra params:
  // demo (scripted placements), cam=x,y,z, tool=<id>, drawer=<id>, hover=sx,sy, end, help
  function devHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("play")) return;
    start();
    game.skipIntro();
    ui.closeModal();
    if (h.has("demo")) {
      const B = CP.BUILDINGS;
      const top = (type, n) => sim.tracts.slice().sort((a, b) => B[type].rel(b.n) - B[type].rel(a.n)).slice(0, n);
      const hb = CP.challenges.hospitalBest();
      placeAt(ui.toolSpec("hospital"), hb.x, hb.y, true);
      [["grocery", 3], ["childcare", 3], ["library", 2], ["pharmacy", 3], ["community", 2]].forEach(([ty, n]) =>
        top(ty, n).forEach((t) => placeAt(ui.toolSpec(ty), t.c[0], t.c[1], true)));
      top("trees", 8).forEach((t) => placeAt(ui.toolSpec("trees"), t.c[0], t.c[1] + 200, true));
    }
    if (h.has("cam")) {
      const [x, y, z] = h.get("cam").split(",").map(Number);
      Object.assign(R.cam, { x, y, z });
    }
    if (h.has("tool")) ui.setTool(h.get("tool"));
    if (h.has("drawer")) ui.toggleDrawer(h.get("drawer"), true);
    if (h.has("end")) ui.endGame();
    if (h.has("help")) ui.help(true);
    if (h.has("hover")) {
      const [sx, sy] = h.get("hover").split(",").map(Number);
      mouse.x = sx; mouse.y = sy;
      updateHover(true);
    }
  }

  window.addEventListener("load", () => {
    canvas = $("#game");
    R.init(canvas);
    setTimeout(() => {
      world.build();
      ui.init();
      CP.challenges.evaluate();
      sim.challengeBonus = 0;
      R.cam.z = R.minZoom() * 1.05;
      R.cam.x = 0; R.cam.y = 0;
      bindInput();
      $("#loading").classList.add("hidden");
      $("#btn-start").onclick = start;
      requestAnimationFrame(frame);
      devHash();
    }, 30);
  });
})();
