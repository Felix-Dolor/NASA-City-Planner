// DOM interface: status strip, the three tabs (Build | Plan | Missions), tooltips, speech bubbles
// and the Deputy City Manager's transmission panel.
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render, S = CP.sprites, missions = CP.missions;
  const $ = (s) => document.querySelector(s);
  const ui = (CP.ui = { tab: "missions", selected: null, metric: 0 });

  const arrow = '<span class="arrow">→</span>';

  ui.init = function () {
    // ----- Build -----
    $("#build-list").innerHTML = Object.entries(CP.BUILDINGS).map(([id, b]) => {
      const fx = b.gain.map((g, i) => [g, i]).filter(([g]) => g > 0).sort((a, c) => c[0] - a[0]);
      const tags = fx.map(([g, i]) => `<span class="fx ${g >= 20 ? "major" : ""}" title="${CP.DOMAINS[i].label}">${CP.DOMAINS[i].icon}${g >= 20 ? " " + CP.DOMAINS[i].label : ""}</span>`).join("");
      return `<button class="bld" data-type="${id}">
        <canvas width="104" height="96"></canvas>
        <span class="bld-main"><span class="bld-name">${b.name}</span><span class="bld-fx">${tags}</span></span>
        <span class="bld-cost">${CP.money(b.cost)}</span></button>`;
    }).join("");
    document.querySelectorAll("#build-list .bld").forEach((el) => {
      const c = el.querySelector("canvas").getContext("2d");
      c.scale(2, 2);
      S.building(c, el.dataset.type, 26, 36, 0.25, 0, { plate: false });
    });
    $("#build-list").addEventListener("click", (e) => {
      const b = e.target.closest(".bld");
      if (!b) return;
      if (b.classList.contains("locked")) { CP.audio.error(); return; }
      ui.select(ui.selected === b.dataset.type ? null : b.dataset.type);
      CP.audio.click();
    });

    // ----- Plan -----
    $("#metric-list").innerHTML = CP.DOMAINS.map((d, i) => `<button class="metric" data-m="${i}"><span>${d.icon} ${d.label}</span><span class="mchip" id="mchip-${i}"></span></button>`).join("");
    $("#metric-list").addEventListener("click", (e) => {
      const b = e.target.closest(".metric");
      if (b) { ui.setMetric(+b.dataset.m); CP.audio.click(); }
    });
    $("#band-legend").innerHTML = CP.BANDS.slice().reverse().map((b) => `<span class="band" style="background:${b.color};color:${b.ink}">${b.name}</span>`).join("");

    // ----- Missions -----
    $("#mission-list").addEventListener("click", (e) => {
      const el = e.target.closest(".mission");
      if (!el) return;
      const m = missions.active.find((x) => x.id === el.dataset.id);
      if (m) CP.game.showDistrict(m.d);
    });

    // ----- tabs & misc -----
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (b) { ui.setTab(b.dataset.tab); CP.audio.click(); }
    });
    $("#btn-sound").onclick = (e) => (e.target.textContent = CP.audio.toggle() ? "🔇" : "🔊");
    $("#btn-sound").textContent = CP.audio.muted ? "🔇" : "🔊";
    $("#dcm-next").onclick = () => ui.dcmNext();
    $("#dcm-name").textContent = CP.STORY.dcm.name;
    $("#dcm-title").textContent = CP.STORY.dcm.title;
    drawPortrait($("#dcm-face").getContext("2d"));
    ui.setMetric(0);
    ui.setTab("missions");
  };

  ui.setTab = function (tab) {
    ui.tab = tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tabpanel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab));
    if (tab !== "build") ui.select(null);
    R.overlayMetric = tab === "plan" ? ui.metric : null;
    R.focusDistricts = tab === "missions" ? missions.active.map((m) => m.d) : null;
    ui.hideTooltip();
  };

  ui.select = function (type) {
    ui.selected = type;
    R.preview = null;
    document.querySelectorAll(".bld").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    $("#game").classList.toggle("placing", !!type);
  };

  ui.setMetric = function (i) {
    ui.metric = i;
    if (ui.tab === "plan") R.overlayMetric = i;
    document.querySelectorAll(".metric").forEach((b) => b.classList.toggle("active", +b.dataset.m === i));
    const d = CP.DOMAINS[i];
    $("#metric-about").innerHTML = `<b>${d.icon} ${d.label}</b><p>${d.plain}</p>`;
  };

  // ---------- refresh everything that depends on scores or money ----------
  let lastBudget = null;
  ui.update = function () {
    const bEl = $("#budget");
    bEl.textContent = CP.money(Math.floor(sim.budget));
    if (lastBudget !== null && Math.abs(sim.budget - lastBudget) >= 2) {
      bEl.classList.remove("flash-good", "flash-bad");
      void bEl.offsetWidth;
      bEl.classList.add(sim.budget > lastBudget ? "flash-good" : "flash-bad");
    }
    lastBudget = sim.budget;
    $("#equity").innerHTML = CP.chip(sim.overall());
    // Build: grey out what the player can't afford
    document.querySelectorAll(".bld").forEach((b) => b.classList.toggle("locked", !sim.canAfford(CP.BUILDINGS[b.dataset.type].cost)));
    if (ui.selected && !sim.canAfford(CP.BUILDINGS[ui.selected].cost)) ui.select(null);
    // Plan: city-wide band per metric
    CP.DOMAINS.forEach((_, i) => ($("#mchip-" + i).innerHTML = CP.chip(sim.metricAvg(i))));
    // Missions
    $("#mission-count").textContent = `${missions.done.length}/${CP.MISSIONS.total}`;
    let html = missions.active.map((m) => {
      const cur = missions.current(m);
      return `<div class="mission" data-id="${m.id}" title="Click to find ${CP.esc(m.d.name)} on the map">
        <div class="mt">${m.icon} ${CP.esc(m.title)}</div>
        <div class="mrow"><span>Now ${CP.chip(cur)}</span>${arrow}<span>Goal ${CP.chip(m.target)}</span></div>
        <div class="prog"><span style="width:${missions.progress(m) * 100}%"></span></div>
        <div class="mrow"><span class="muted">Progress ${Math.round(missions.progress(m) * 100)}%</span><span class="grant">Grant ${CP.money(m.grant)}</span></div>
      </div>`;
    }).join("");
    if (!missions.active.length) html = `<p class="muted">All contracts are complete. Keep building until your term ends.</p>`;
    html += `<div class="mdone muted">Completed: ${missions.done.length} of ${CP.MISSIONS.total}</div>`;
    $("#mission-list").innerHTML = html;
    if (ui.tab === "missions") R.focusDistricts = missions.active.map((m) => m.d);
  };

  ui.tick = function (timeLeft) {
    const el = $("#timer");
    el.textContent = CP.clock(timeLeft);
    el.classList.toggle("low", timeLeft <= 60);
  };

  // ---------- tooltips ----------
  ui.districtTip = function (d) {
    return `<div class="tt-h">${CP.esc(d.name)}</div>
      <div class="tt-row tt-all"><span>Overall equity</span>${CP.chip(d.overall)}</div>
      ${CP.DOMAINS.map((dm, i) => `<div class="tt-row ${ui.tab === "plan" && ui.metric === i ? "sel" : ""}"><span>${dm.icon} ${dm.label}</span>${CP.chip(d.score[i])}</div>`).join("")}`;
  };
  ui.buildTip = function (type, site) {
    const b = CP.BUILDINGS[type];
    let html = `<div class="tt-h">${b.icon} ${b.name} · ${CP.money(b.cost)}</div>`;
    if (!site.ok) return html + `<div class="neg">Not allowed here: ${site.why}</div>`;
    const after = sim.after(type, site.d);
    html += `<div class="muted" style="margin-bottom:4px">In ${CP.esc(site.d.name)} this would change:</div>`;
    b.gain.forEach((g, i) => {
      if (!g) return;
      const before = site.d.score[i];
      const same = CP.bandIndex(before) === CP.bandIndex(after[i]);
      html += `<div class="tt-row"><span>${CP.DOMAINS[i].icon} ${CP.DOMAINS[i].label}</span><span>${CP.chip(before)}${
        before >= 100 ? ' <span class="muted">already at its best</span>' : same ? ' <span class="pos">▲ a little</span>' : arrow + CP.chip(after[i])}</span></div>`;
    });
    return html + `<div class="muted" style="margin-top:5px">Click to build.</div>`;
  };
  const tt = () => $("#tooltip");
  ui.tooltip = function (html, x, y) {
    const el = tt();
    el.innerHTML = html;
    el.classList.remove("hidden");
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(window.innerWidth - w - 10, x + 20)) + "px";
    el.style.top = Math.max(8, Math.min(window.innerHeight - h - 10, y + 20)) + "px";
  };
  ui.hideTooltip = () => tt().classList.add("hidden");
  ui.toast = function (html, cls) {
    const el = document.createElement("div");
    el.className = "toast " + (cls || "");
    el.innerHTML = html;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3900);
  };

  // ---------- speech bubble (opening scene and residents) ----------
  ui.speech = function (name, sub, text, sx, sy, mood) {
    const el = $("#speech");
    const key = name + "|" + text;
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = `<div class="sp-name">${CP.esc(name)}${sub ? ` <span>· ${CP.esc(sub)}</span>` : ""}</div><div class="sp-text">${CP.esc(text)}</div>`;
    }
    el.className = mood || "";
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = CP.clamp(sx - w / 2, 8, window.innerWidth - w - 8) + "px";
    el.style.top = Math.max(8, sy - h - 14) + "px";
  };
  ui.hideSpeech = function () {
    const el = $("#speech");
    el.className = "hidden";
    el.dataset.key = "";
  };

  // ---------- Deputy City Manager panel ----------
  // ui.dcm(["page one", "page two"], { done, button, extra, report })
  let dcm = null, typer = null;
  ui.dcmOpen = () => !!dcm;
  ui.dcm = function (pages, opts) {
    opts = opts || {};
    if (dcm && !opts.replace) { dcm.pages.push(...pages); showPageCount(); return; } // already talking: add to the queue
    dcm = { pages: pages.slice(), i: 0, opts };
    $("#dcm").className = opts.report ? "report" : "";
    $("#dcm-extra").innerHTML = "";
    if (CP.game.started) CP.game.paused = true;
    ui.hideTooltip();
    CP.audio.radio();
    typePage();
  };
  function showPageCount() {
    $("#dcm-page").textContent = dcm.pages.length > 1 ? `${dcm.i + 1} / ${dcm.pages.length}` : "";
  }
  function typePage() {
    const text = dcm.pages[dcm.i], el = $("#dcm-text");
    const last = dcm.i === dcm.pages.length - 1;
    let n = 0;
    el.textContent = "";
    el.classList.add("typing");
    $("#dcm-next").textContent = last ? dcm.opts.button || "Continue ▸" : "Continue ▸";
    showPageCount();
    clearInterval(typer);
    typer = setInterval(() => {
      n = Math.min(text.length, n + 1);
      el.textContent = text.slice(0, n);
      if (n % 3 === 0) CP.audio.blip();
      if (n >= text.length) finishTyping();
    }, 22);
  }
  function finishTyping() {
    clearInterval(typer);
    typer = null;
    $("#dcm-text").textContent = dcm.pages[dcm.i];
    $("#dcm-text").classList.remove("typing");
    if (dcm.i === dcm.pages.length - 1 && dcm.opts.extra) $("#dcm-extra").innerHTML = dcm.opts.extra;
  }
  // Continue: first finishes the typing, then moves to the next page, then closes
  ui.dcmNext = function () {
    if (!dcm) return;
    if (typer) return finishTyping();
    CP.audio.click();
    if (dcm.i < dcm.pages.length - 1) { dcm.i++; return typePage(); }
    const done = dcm.opts.done;
    ui.dcmClose();
    if (done) done();
  };
  ui.dcmClose = function () {
    clearInterval(typer);
    typer = null;
    dcm = null;
    $("#dcm").className = "hidden";
    CP.game.paused = false;
  };

  // original portrait of the Deputy City Manager, drawn with canvas shapes
  function drawPortrait(c) {
    c.scale(2, 2); // canvas is 224x264 for sharpness, drawn as 112x132
    const g = c.createLinearGradient(0, 0, 0, 132);
    g.addColorStop(0, "#0d3a5c"); g.addColorStop(1, "#06182c");
    c.fillStyle = g; c.fillRect(0, 0, 112, 132);
    // window behind her: a faint skyline
    c.fillStyle = "rgba(94,230,255,0.16)";
    [[6, 70, 12], [20, 52, 10], [32, 62, 9], [72, 58, 11], [85, 44, 9], [96, 66, 12]].forEach(([x, y, w]) => c.fillRect(x, y, w, 132 - y));
    c.fillStyle = "rgba(94,230,255,0.3)"; c.fillRect(89, 30, 1.5, 14);
    // shoulders: navy blazer, white blouse
    c.fillStyle = "#16284a";
    c.beginPath(); c.moveTo(4, 132); c.quadraticCurveTo(8, 96, 40, 92); c.lineTo(72, 92); c.quadraticCurveTo(104, 96, 108, 132); c.closePath(); c.fill();
    c.fillStyle = "#f4f7fb";
    c.beginPath(); c.moveTo(44, 92); c.lineTo(56, 116); c.lineTo(68, 92); c.closePath(); c.fill();
    c.strokeStyle = "#0b1730"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(40, 93); c.lineTo(54, 124); c.moveTo(72, 93); c.lineTo(58, 124); c.stroke();
    // city pin
    c.fillStyle = "#ffd166"; c.beginPath(); c.arc(80, 108, 3.2, 0, 7); c.fill();
    // neck
    c.fillStyle = "#7a4a2b"; c.fillRect(49, 78, 14, 18);
    // hair: high puff + short sides
    c.fillStyle = "#17110f";
    c.beginPath(); c.arc(56, 28, 17, 0, 7); c.fill();
    c.beginPath(); c.ellipse(56, 54, 27, 29, 0, 0, 7); c.fill();
    // face
    c.fillStyle = "#8d5a34";
    c.beginPath(); c.ellipse(56, 60, 21, 25, 0, 0, 7); c.fill();
    c.fillStyle = "#17110f";
    c.beginPath(); c.moveTo(34, 52); c.quadraticCurveTo(56, 26, 78, 52); c.quadraticCurveTo(56, 40, 34, 52); c.fill();
    // ears + earrings
    c.fillStyle = "#8d5a34"; c.beginPath(); c.arc(35, 62, 4, 0, 7); c.arc(77, 62, 4, 0, 7); c.fill();
    c.fillStyle = "#5ee6ff"; c.beginPath(); c.arc(34.5, 69, 2.2, 0, 7); c.arc(77.5, 69, 2.2, 0, 7); c.fill();
    // eyes, brows, nose, smile
    c.fillStyle = "#fff"; c.beginPath(); c.ellipse(47, 58, 4.2, 2.8, 0, 0, 7); c.ellipse(65, 58, 4.2, 2.8, 0, 0, 7); c.fill();
    c.fillStyle = "#1c1210"; c.beginPath(); c.arc(47.5, 58, 2, 0, 7); c.arc(65.5, 58, 2, 0, 7); c.fill();
    c.strokeStyle = "#17110f"; c.lineWidth = 1.8; c.lineCap = "round";
    c.beginPath(); c.moveTo(41.5, 51.5); c.quadraticCurveTo(47, 49, 52, 51.5); c.moveTo(60, 51.5); c.quadraticCurveTo(65, 49, 70.5, 51.5); c.stroke();
    c.strokeStyle = "#6b3f22"; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(56, 60); c.lineTo(54.5, 68); c.lineTo(58, 68.5); c.stroke();
    c.strokeStyle = "#5a1f24"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(48.5, 75); c.quadraticCurveTo(56, 80, 63.5, 75); c.stroke();
    // headset
    c.strokeStyle = "#cfd8e3"; c.lineWidth = 2;
    c.beginPath(); c.arc(56, 52, 26, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.beginPath(); c.moveTo(31, 62); c.quadraticCurveTo(34, 80, 47, 79); c.stroke();
    c.fillStyle = "#cfd8e3"; c.fillRect(28.5, 55, 5, 11);
    c.fillStyle = "#5ee6ff"; c.beginPath(); c.arc(47.5, 79, 2, 0, 7); c.fill();
  }

  // ---------- final report card ----------
  ui.report = function () {
    const fs = sim.finalScore();
    const overall = sim.overall();
    const rows = sim.districts.map((d) => {
      const changed = CP.bandIndex(d.startOverall) !== CP.bandIndex(d.overall);
      return `<div class="rep-d"><span>${CP.esc(d.name)}</span><span>${changed ? CP.chip(d.startOverall) + arrow : ""}${CP.chip(d.overall)}</span></div>`;
    }).join("");
    const extra = `
      <div class="rep-top">
        <div class="rep-score"><span class="lbl">Final score</span><span class="num">${fs.total.toLocaleString()}</span></div>
        <div class="rep-break">
          <span>Calgary's overall equity ${CP.chip(overall)}</span><span>${fs.equity.toLocaleString()} pts</span>
          <span>Budget left over (${CP.money(Math.floor(sim.budget))})</span><span>${fs.budget.toLocaleString()} pts</span>
          <span class="muted">Missions completed</span><span class="muted">${missions.done.length} of ${CP.MISSIONS.total}</span>
          <span class="muted">Buildings built</span><span class="muted">${sim.buildings.length}</span>
        </div>
      </div>
      <div class="rep-h">District report</div>
      <div class="rep-grid">${rows}</div>`;
    ui.dcm([CP.STORY.report[CP.bandIndex(overall)]], { replace: true, report: true, extra, button: "Start a new term ↻", done: () => location.reload() });
  };
})();
