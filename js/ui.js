// DOM interface: top bar, the three tabs (Missions | Plan | Build), district profile card, placement preview
// card, tooltips, speech bubbles, banners, undo, coach marks, settings, the Deputy City Manager's panel
// and the final report (your Calgary vs the real 2024 Calgary Equity Index).
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render, S = CP.sprites, missions = CP.missions;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const ui = (CP.ui = { tab: "missions", selected: null, metric: 0, mission: null, scrollSpeed: +(localStorage.getItem("cei-scroll") || 1) });

  const arrow = '<span class="arrow">→</span>';
  const sgn = (v, d = 0) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
  const num = (v) => `<b class="num">${Math.round(v)}</b>`;

  // ---------- setup ----------
  ui.init = function () {
    // Build list (rows are built once and re-sorted on every update)
    $("#build-list").innerHTML = CP.BUILD_ORDER.map((id) => {
      const b = CP.BUILDINGS[id];
      return `<button class="bld" data-type="${id}">
        <canvas width="104" height="96"></canvas>
        <span class="bld-main">
          <span class="bld-name">${b.name} <span class="helps">Helps mission</span></span>
          <span class="bld-fx">${effectText(b)}</span>
          ${b.risk ? `<span class="bld-risk">⚠ ${b.risk}</span>` : ""}
          <span class="bld-zones">${b.zones.split("").map((z) => `<i style="--zc:${CP.ZONES[z].color}">${CP.ZONES[z].icon} ${CP.ZONES[z].name}</i>`).join("")}</span>
        </span>
        <span class="bld-cost"><span class="c"></span><small>${upkeepText(b)}</small></span></button>`;
    }).join("");
    $$("#build-list .bld").forEach((el) => {
      const c = el.querySelector("canvas").getContext("2d");
      c.scale(2, 2);
      S.building(c, el.dataset.type, 26, 38, 0.24, 0, { plate: false });
    });
    $("#build-list").addEventListener("click", (e) => {
      const b = e.target.closest(".bld");
      if (!b) return;
      ui.select(ui.selected === b.dataset.type ? null : b.dataset.type);
      CP.audio.click();
    });

    // Plan
    $("#metric-list").innerHTML = CP.DOMAINS.map((d, i) => `<button class="metric" data-m="${i}"><span>${d.icon} ${d.label}</span><span class="mchip" id="mchip-${i}"></span></button>`).join("");
    $("#metric-list").addEventListener("click", (e) => {
      const b = e.target.closest(".metric");
      if (b) { ui.setMetric(+b.dataset.m); CP.audio.click(); }
    });
    $("#band-legend").innerHTML = CP.BANDS.slice().reverse().map((b) => `<span class="band" style="background:${b.color};color:${b.ink}"><i>${b.sym}</i> ${b.name} <small>${b.min}+</small></span>`).join("");

    // Missions: Go buttons, card clicks, hover highlights
    const ml = $("#mission-list");
    ml.addEventListener("click", (e) => {
      const el = e.target.closest(".mission");
      if (!el) return;
      const m = missions.active.find((x) => x.id === el.dataset.id);
      if (m) CP.game.goMission(m);
    });
    ml.addEventListener("mouseover", (e) => {
      const el = e.target.closest(".mission");
      const m = el && missions.active.find((x) => x.id === el.dataset.id);
      if (m) R.highlight = missions.focus(m);
    });
    ml.addEventListener("mouseleave", () => (R.highlight = ui.mission ? missions.focus(ui.mission) : null));

    // tabs, top bar, misc
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (b) { ui.setTab(b.dataset.tab); CP.audio.click(); }
    });
    const snd = $("#btn-sound");
    snd.onclick = () => (snd.textContent = CP.audio.toggle() ? "🔇" : "🔊");
    snd.textContent = CP.audio.muted ? "🔇" : "🔊";
    $("#btn-pause").onclick = () => CP.game.togglePause();
    $("#btn-resume").onclick = () => CP.game.togglePause(false);
    $("#btn-settings").onclick = () => $("#settings").classList.toggle("hidden");
    $("#set-close").onclick = () => $("#settings").classList.add("hidden");
    $("#set-volume").value = CP.audio.volume;
    $("#set-volume").oninput = (e) => CP.audio.setVolume(+e.target.value);
    $("#set-music").checked = CP.audio.music;
    $("#set-music").onchange = (e) => CP.audio.setMusic(e.target.checked);
    $("#set-scroll").value = ui.scrollSpeed;
    $("#set-scroll").oninput = (e) => { ui.scrollSpeed = +e.target.value; localStorage.setItem("cei-scroll", e.target.value); };
    $("#btn-city").onclick = () => CP.game.exitDistrict();
    $("#undo").onclick = () => CP.game.undo();
    $("#coach .coach-skip").onclick = () => ui.endTutorial();
    $("#dcm-next").onclick = () => ui.dcmNext();
    $("#dcm-name").textContent = CP.STORY.dcm.name;
    $("#dcm-title").textContent = CP.STORY.dcm.title;
    $("#profile").addEventListener("click", (e) => {
      if (e.target.closest("[data-city]")) CP.game.exitDistrict();
      if (e.target.closest("[data-talk]") && R.focus) CP.game.pinResident(R.focus.resident);
    });
    drawPortrait($("#dcm-face").getContext("2d"));
    ui.setMetric(0);
    ui.setTab("missions");
  };

  // "Main: Health +26 · Also: Access +6" (+ the effect circle, if any)
  function effectText(b) {
    const fx = b.gain.map((g, i) => [g, i]).filter(([g]) => g).sort((a, c) => c[0] - a[0]);
    const main = fx.filter(([g]) => g >= 20), also = fx.filter(([g]) => g > 0 && g < 20), minus = fx.filter(([g]) => g < 0);
    const part = (arr) => arr.map(([g, i]) => `${CP.DOMAINS[i].icon} ${CP.DOMAINS[i].short} ${sgn(g)}`).join(", ");
    let s = "";
    if (main.length) s += `<b>Main:</b> ${part(main)}`;
    if (also.length) s += `${s ? " · " : ""}<b>Also:</b> ${part(also)}`;
    if (minus.length) s += ` · <b class="neg">Costs:</b> ${part(minus)}`;
    if (b.area) {
      const a = b.area, pos = a.gain.map((g, i) => [g, i]).filter(([g]) => g);
      s += `<br><span class="${a.gain.some((g) => g < 0) ? "neg" : "pos"}">◯ ${(a.r / 1000).toFixed(1)} km circle (${a.what}): ${pos.map(([g, i]) => `${CP.DOMAINS[i].icon}${sgn(g)}`).join(" ")}</span>`;
    }
    if (b.buffer) s += `<br><span class="pos">🛡 Buffers pollution within ${(CP.PARK_BUFFER / 1000).toFixed(1)} km</span>`;
    return s;
  }
  function upkeepText(b) {
    let s = `upkeep ${CP.money(b.upkeep)}/min`;
    if (b.income) s += `<br>tax +${CP.money(b.income)}/min`;
    return s;
  }

  ui.setTab = function (tab) {
    ui.tab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tabpanel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab));
    if (tab !== "build") ui.select(null);
    R.overlayMetric = tab === "plan" ? ui.metric : null; // Plan view = equity colours; otherwise normal view
    ui.hideTooltip();
    if (tab === "build") ui.tutStep("build");
    if (tab === "plan") ui.renderIndicators();
  };

  ui.select = function (type) {
    ui.selected = type;
    R.preview = null;
    $$(".bld").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    $("#game").classList.toggle("placing", !!type);
    if (type) ui.tutStep("pick");
  };

  ui.setMetric = function (i) {
    ui.metric = i;
    if (ui.tab === "plan") R.overlayMetric = i;
    $$(".metric").forEach((b) => b.classList.toggle("active", +b.dataset.m === i));
    const d = CP.DOMAINS[i];
    $("#metric-about").innerHTML = `<b>${d.icon} ${d.label}</b><p>${d.plain}</p>`;
    ui.renderIndicators();
  };

  // all of the real CEI indicators for the chosen metric: the hovered/zoomed district next to Calgary
  let indKey = "";
  ui.renderIndicators = function (hover) {
    const d = hover || R.focus || R.highlight || null;
    const key = (d ? d.id : "city") + ":" + ui.metric;
    if (key === indKey) return;
    indKey = key;
    const rows = CP.INDICATORS.filter((x) => x.domain === ui.metric).map((ind) => {
      const avg = sim.cityInd[ind.key], v = d ? d.ind[ind.key] : avg;
      let cls = "";
      if (d && ind.dir && Math.abs(v - avg) > Math.abs(avg) * 0.08) cls = ind.dir * (v - avg) > 0 ? "pos" : "neg";
      return `<tr class="${cls}"><td>${ind.label}</td><td>${CP.fmtIndicator(ind, v)}</td><td class="muted">${CP.fmtIndicator(ind, avg)}</td></tr>`;
    }).join("");
    $("#indicators").innerHTML = `<table><thead><tr><th>Real indicator (2024 CEI)</th><th>${d ? CP.esc(d.name) : "Calgary"}</th><th>Calgary</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted small">${d ? "Green = better than the Calgary average, red = worse." : "Hover a district to compare it with the city."} Your buildings change the game ratings, not these 2024 measurements.</p>`;
  };

  // ---------- refresh everything that depends on scores or money ----------
  let lastBudget = null;
  ui.eqShown = null;
  ui.update = function () {
    const bEl = $("#budget");
    bEl.textContent = CP.money(Math.floor(sim.budget));
    bEl.classList.toggle("neg", sim.budget < 0);
    if (lastBudget !== null && Math.abs(sim.budget - lastBudget) >= 2) {
      bEl.classList.remove("flash-good", "flash-bad");
      void bEl.offsetWidth;
      bEl.classList.add(sim.budget > lastBudget ? "flash-good" : "flash-bad");
    }
    lastBudget = sim.budget;
    const net = sim.netPerMin();
    $("#rate").textContent = `${net >= 0 ? "+" : "−"}${CP.money(Math.abs(net))}/min`;
    $("#rate").className = "rate " + (net >= 0 ? "pos" : "neg");
    $("#budget-hint").innerHTML = `City revenue <b>+${CP.money(CP.INCOME_PER_MIN)}/min</b>` +
      (sim.income() > CP.INCOME_PER_MIN ? ` · business tax <b>+${CP.money(sim.income() - CP.INCOME_PER_MIN)}/min</b>` : "") +
      ` · upkeep <b>−${CP.money(sim.upkeep())}/min</b>. Paid every ${CP.PAYOUT_EVERY} s. Grants arrive when missions are done.`;
    $("#upkeep").textContent = `${CP.money(sim.upkeep())}/min`;
    const ov = sim.overall();
    $("#equity").innerHTML = CP.chip(ov);
    if (ui.eqShown === null) ui.eqShown = ov;
    $("#eq-start").style.left = sim.startOverall + "%";

    // Build: helpers of the active mission first, the rest greyed out (but usable)
    const m = ui.activeMission();
    const helps = (t) => !!m && missions.metrics(m).some((i) => CP.BUILDINGS[t].gain[i] >= 10 || (CP.BUILDINGS[t].area && CP.BUILDINGS[t].area.gain[i] >= 8));
    const list = $("#build-list");
    const rows = [...list.children];
    rows.sort((a, b) => helps(b.dataset.type) - helps(a.dataset.type) || CP.BUILD_ORDER.indexOf(a.dataset.type) - CP.BUILD_ORDER.indexOf(b.dataset.type));
    rows.forEach((el) => {
      const t = el.dataset.type, cost = sim.baseCost(t, R.focus);
      el.classList.toggle("helps", helps(t));
      el.classList.toggle("dim", !!m && !helps(t));
      el.classList.toggle("poor", !sim.canAfford(cost));
      el.querySelector(".c").textContent = CP.money(cost);
      list.appendChild(el);
    });
    $("#build-help").innerHTML = R.focus
      ? `Building in <b>${CP.esc(R.focus.name)}</b>${R.focus.def.cost !== 1 ? ` (land costs ×${R.focus.def.cost})` : ""}. Pick a building, then click a lot.`
      : "Pick a building, then click a district to zoom in and place it on a lot.";

    // Plan: city-wide band per metric
    CP.DOMAINS.forEach((_, i) => ($("#mchip-" + i).innerHTML = CP.chip(sim.metricAvg(i), true)));
    // Missions
    $("#mission-count").textContent = `${missions.done.length}/${CP.MISSIONS.total}`;
    let html = missions.active.map((x) => missionCard(x)).join("");
    if (!missions.active.length) html = `<p class="muted">All contracts are complete. Keep building until your term ends.</p>`;
    html += `<div class="mdone muted">Completed: ${missions.done.length} of ${CP.MISSIONS.total}${missions.expired.length ? ` · expired: ${missions.expired.length}` : ""}</div>`;
    $("#mission-list").innerHTML = html;
    R.pins = missions.active.map((x) => ({ d: missions.focus(x), icon: CP.DOMAINS[missions.metrics(x)[0]].icon }));
    if (ui.mission && !missions.active.includes(ui.mission)) ui.mission = null;
    if (!$("#profile").classList.contains("hidden") && R.focus) ui.profile(R.focus);
    if (ui.tab === "plan") { indKey = ""; ui.renderIndicators(); }
  };
  ui.activeMission = () => (ui.mission && missions.active.includes(ui.mission) ? ui.mission : missions.active[0] || null);

  function missionCard(m) {
    const cur = missions.current(m), goal = missions.goal(m);
    const on = m === ui.activeMission();
    const tries = CP.BUILD_ORDER.filter((t) => missions.metrics(m).some((i) => CP.BUILDINGS[t].gain[i] >= 20)).slice(0, 2)
      .map((t) => `${CP.BUILDINGS[t].icon} ${CP.BUILDINGS[t].name}`).join(", ");
    const nowGoal = m.kind === "multi"
      ? `<span>Now <b>${cur}</b> districts</span>${arrow}<span>Goal <b>${goal}</b></span>`
      : `<span>Now ${CP.chip(cur, true)}</span>${arrow}<span>Goal ${CP.chip(m.target)}</span>`;
    const tl = missions.timeLeft(m);
    return `<div class="mission ${on ? "on" : ""} k-${m.kind}" data-id="${m.id}" title="Go to ${CP.esc(missions.focus(m).name)}">
      <div class="mt">${m.icon} ${CP.esc(m.title)}</div>
      ${m.data ? `<div class="mdata">📊 ${CP.esc(m.data)}</div>` : ""}
      ${tl !== null ? `<div class="mtime">⏱ <span data-timer="${m.id}">${CP.clock(tl)}</span> left · bonus grant</div>` : ""}
      <div class="mrow mnow">${nowGoal}</div>
      <div class="prog"><span style="width:${missions.progress(m) * 100}%"></span></div>
      <div class="mrow"><span class="muted small">${tries ? "Try: " + tries : ""}</span><span class="grant">${CP.money(m.grant)}</span></div>
      <button class="go">Go ▸</button>
    </div>`;
  }

  ui.tick = function (timeLeft) {
    const el = $("#timer");
    el.textContent = CP.clock(timeLeft);
    el.classList.toggle("low", timeLeft <= 60);
  };

  // per-frame bits: equity number animation, timed contracts, undo countdown, coach position
  ui.frame = function (dt) {
    const ov = sim.overall();
    if (ui.eqShown !== null) {
      const prev = ui.eqShown;
      ui.eqShown += (ov - ui.eqShown) * Math.min(1, dt * 3);
      if (Math.abs(ov - ui.eqShown) < 0.01) ui.eqShown = ov;
      if (prev !== ui.eqShown || !ui._eqInit) {
        ui._eqInit = true;
        $("#eq-num").textContent = ui.eqShown.toFixed(1);
        const s = sim.startOverall, v = ui.eqShown;
        $("#eq-fill").style.width = Math.min(s, v) + "%";
        $("#eq-gain").style.left = Math.min(s, v) + "%";
        $("#eq-gain").style.width = Math.abs(v - s) + "%";
        $("#eq-gain").className = v >= s ? "up" : "down";
      }
    }
    for (const m of missions.active) {
      const el = document.querySelector(`[data-timer="${m.id}"]`);
      if (el) el.textContent = CP.clock(missions.timeLeft(m));
    }
    positionCoach();
  };
  // pop a delta next to the equity number
  ui.equityDelta = function (dv) {
    if (Math.abs(dv) < 0.05) return;
    const el = document.createElement("span");
    el.className = "eq-pop " + (dv > 0 ? "pos" : "neg");
    el.textContent = sgn(dv, 1);
    $(".stat-eq").appendChild(el);
    setTimeout(() => el.remove(), 1800);
  };

  // revenue/upkeep payouts: a small "+$0.4M" pop under the budget
  ui.budgetPop = function (v) {
    if (Math.abs(v) < 0.05) return;
    const el = document.createElement("span");
    el.className = "money-pop " + (v > 0 ? "pos" : "neg");
    el.textContent = (v > 0 ? "+" : "−") + CP.money(Math.abs(v));
    $("#stat-budget").appendChild(el);
    setTimeout(() => el.remove(), 1600);
  };

  // ---------- tooltips ----------
  // city view: a district's six ratings with numbers and 1-2 real indicators each
  ui.districtTip = function (d) {
    return `<div class="tt-h">${CP.esc(d.name)} <span class="muted">· click to zoom in</span></div>
      <div class="tt-row tt-all"><span>Overall equity <b>${d.overall.toFixed(1)}</b>/100</span>${CP.chip(d.overall)}</div>
      ${CP.DOMAINS.map((dm, i) => {
        const w = sim.worstIndicators(d, i).slice(0, 2);
        return `<div class="tt-row ${ui.tab === "plan" && ui.metric === i ? "sel" : ""}"><span>${dm.icon} ${dm.label}</span>${CP.chip(d.score[i], true)}</div>
          <div class="tt-ind">${w.map((x) => `${x.ind.label}: <b class="${x.gap > 0.08 ? "neg" : x.gap < -0.08 ? "pos" : ""}">${CP.fmtIndicator(x.ind, x.v)}</b> <span class="muted">(Calgary ${CP.fmtIndicator(x.ind, x.avg)})</span>`).join("<br>")}</div>`;
      }).join("")}`;
  };
  // city view with a building selected: what it would do in the district under the cursor
  ui.cityBuildTip = function (type, d) {
    const b = CP.BUILDINGS[type], cost = sim.baseCost(type, d);
    const short = !sim.canAfford(cost);
    let html = `<div class="tt-h">${b.icon} ${b.name} in ${CP.esc(d.name)}</div>`;
    b.gain.forEach((g, i) => {
      if (g <= 0) return;
      const before = d.score[i], after = Math.min(100, before + g);
      html += `<div class="tt-row"><span>${CP.DOMAINS[i].icon} ${CP.DOMAINS[i].label}</span><span>${CP.chip(before)}${CP.bandIndex(before) === CP.bandIndex(after) ? ' <span class="pos">▲ ' + sgn(after - before) + "</span>" : arrow + CP.chip(after)}</span></div>`;
    });
    html += `<div class="tt-cost ${short ? "neg" : ""}">Cost ${CP.money(cost)}${short ? " · not enough budget" : ""} · upkeep ${CP.money(b.upkeep)}/min</div>`;
    return html + `<div class="muted" style="margin-top:5px">Click to zoom in and choose a lot.</div>`;
  };
  // the net-effect card shown while hovering a lot with a building selected
  ui.previewCard = function (pv) {
    const b = pv.spec;
    let html = `<div class="tt-h">${b.icon} ${b.name} <span class="muted">· ${CP.ZONES[pv.lot.zone].icon} ${CP.ZONES[pv.lot.zone].name} lot</span></div>`;
    if (pv.locked || pv.protest || pv.lot.building) return html + `<div class="neg">${pv.why}</div>`;
    if (!pv.allowed) {
      html += `<div class="neg">✖ ${pv.why}</div>`;
      if (!pv.rezone) html += `<div class="muted">Hold <kbd>Shift</kbd> and click to rezone to ${CP.ZONES[pv.toZone].name} (+${CP.money(CP.REZONE.cost)}, −${CP.REZONE.goodwill} Belonging here).</div>`;
      else html += `<div class="warn">Rezoning to ${CP.ZONES[pv.toZone].name}: +${CP.money(CP.REZONE.cost)} and residents lose goodwill.</div>`;
    }
    for (const x of pv.diffs.slice(0, 5)) {
      const parts = x.delta.map((v, i) => [v, i]).filter(([v]) => Math.abs(v) >= 0.5).map(([v, i]) => {
        const band = CP.bandIndex(x.before[i]) !== CP.bandIndex(x.after[i]) ? ` <span class="muted">(${CP.bandOf(x.before[i]).name} → ${CP.bandOf(x.after[i]).name})</span>` : "";
        return `<span class="${v > 0 ? "pos" : "neg"}">${sgn(v)} ${CP.DOMAINS[i].icon} ${CP.DOMAINS[i].short}</span>${band}`;
      });
      html += `<div class="tt-eff"><b>${CP.esc(x.d.name)}</b>${x.own ? " (this district)" : " (nearby)"}: ${parts.join(", ")}</div>`;
    }
    if (pv.harmedHomes) html += `<div class="neg">◯ ${b.area.what}: about ${pv.harmedHomes.toLocaleString()} homes in range lose out${pv.buffered ? ' <span class="pos">(park buffer: −75% harm)</span>' : ""}</div>`;
    if (pv.helpedHomes && !pv.harmedHomes) html += `<div class="pos">◯ ${b.area.what}: reaches about ${pv.helpedHomes.toLocaleString()} homes</div>`;
    if (pv.protestRisk) html += `<div class="neg">📢 Residents will protest: building here stops for ${CP.PROTEST.seconds} s. A park nearby would buffer it.</div>`;
    if (pv.lot.house) html += `<div class="warn">🏚 Demolishes a family home: +${CP.money(CP.DEMOLISH.cost)} and less housing here.</div>`;
    const dv = pv.overallAfter - pv.overallBefore;
    html += `<div class="tt-row tt-all"><span>Calgary Equity</span><span>${pv.overallBefore.toFixed(1)} → <b class="${dv >= 0 ? "pos" : "neg"}">${pv.overallAfter.toFixed(1)}</b></span></div>`;
    html += `<div class="tt-cost ${pv.short ? "neg" : ""}">Cost <b>${CP.money(pv.cost)}</b>${pv.demolish ? ` (incl. ${CP.money(pv.demolish)} demolition)` : ""}${pv.rezone ? ` (incl. ${CP.money(pv.rezone)} rezoning)` : ""} · upkeep ${CP.money(b.upkeep)}/min${b.income ? ` · tax +${CP.money(b.income)}/min` : ""}</div>`;
    if (pv.short) html += `<div class="neg">${pv.why}</div>`;
    else if (pv.ok) html += `<div class="muted" style="margin-top:4px">Click to build. You can undo for ${CP.UNDO_SECONDS} s.</div>`;
    return html;
  };
  ui.lotTip = function (lot) {
    const z = CP.ZONES[lot.zone];
    const ok = CP.BUILD_ORDER.filter((t) => CP.BUILDINGS[t].zones.includes(lot.zone)).map((t) => CP.BUILDINGS[t].icon).join(" ");
    let html = `<div class="tt-h">${z.icon} ${z.name} lot · ${CP.esc(lot.d.name)}</div>`;
    if (lot.building) return html + `<div>${CP.BUILDINGS[lot.building.type].icon} ${CP.BUILDINGS[lot.building.type].name}</div>`;
    if (sim.isLocked(lot)) return html + `<div class="muted">🔒 Opens after ${lot.lock * CP.MISSIONS.unlockEvery} completed missions.</div>`;
    if (lot.house) html += `<div class="warn">A family home stands here. Building means demolishing it.</div>`;
    return html + `<div class="muted">Allowed here: ${ok}</div><div class="muted">Open <b>Build</b> and pick a building.</div>`;
  };
  const tt = () => $("#tooltip");
  ui.tooltip = function (html, x, y, cls) {
    const el = tt();
    el.innerHTML = html;
    el.className = cls || "";
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(window.innerWidth - w - 10, x + 22)) + "px";
    el.style.top = Math.max(70, Math.min(window.innerHeight - h - 10, y + 22)) + "px";
  };
  ui.hideTooltip = () => (tt().className = "hidden");
  ui.toast = function (html, cls, ms) {
    const el = document.createElement("div");
    el.className = "toast " + (cls || "");
    el.innerHTML = html;
    el.style.setProperty("--life", (ms || 3900) + "ms");
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), ms || 3900);
  };
  let bannerT = null;
  ui.banner = function (html, cls) {
    const el = $("#banner");
    el.innerHTML = html;
    el.className = cls || "";
    clearTimeout(bannerT);
    bannerT = setTimeout(() => el.classList.add("hidden"), 6500);
  };

  // ---------- district profile card ----------
  ui.profile = function (d) {
    const el = $("#profile");
    if (!d) { el.classList.add("hidden"); $("#btn-city").classList.add("hidden"); return; }
    el.classList.remove("hidden");
    $("#btn-city").classList.remove("hidden");
    const r = d.resident;
    const say = CP.residents.say(r);
    const counts = {};
    let locked = 0, free = 0;
    for (const l of d.lots) {
      counts[l.zone] = (counts[l.zone] || 0) + 1;
      if (sim.isLocked(l)) locked++;
      else if (!l.building) free++;
    }
    const traits = [];
    if (d.traits.flood) traits.push(`<span class="trait">🌊 Flood risk: on the river (2013 flood)</span>`);
    if (d.traits.highRent) traits.push(`<span class="trait">💸 High rents: new transit can push people out</span>`);
    if (d.def.cost > 1.2) traits.push(`<span class="trait">🏷 Expensive land ×${d.def.cost}</span>`);
    const pr = sim.protests.get(d.id);
    if (pr > 0) traits.push(`<span class="trait bad">📢 Protest: building paused ${Math.ceil(pr)} s</span>`);
    const evs = sim.penalties.filter((p) => p.d === d && !p.fixed).map((p) => {
      const t = CP.EVENT_TYPES[p.ev];
      return `<div class="pevent">${t.icon} <b>${t.name}</b>: ${CP.DOMAINS[p.m].short} −${Math.round(p.amount)}. Fix it with a ${t.fix.map((f) => CP.BUILDINGS[f].name).join(" or ")}.</div>`;
    }).join("");
    el.innerHTML = `
      <div class="pf-h"><div><h3>${CP.esc(d.name)}</h3><div class="muted small">≈ ${d.population.toLocaleString()} residents · ${d.tracts.length} census tracts</div></div>
        <button class="btn" data-city>◂ City</button></div>
      <p class="pf-story">${CP.esc(d.def.story)}</p>
      ${traits.length ? `<div class="traits">${traits.join("")}</div>` : ""}
      ${evs}
      <div class="tt-row tt-all"><span>Overall equity <b>${d.overall.toFixed(1)}</b>/100</span>${CP.chip(d.overall)}</div>
      ${CP.DOMAINS.map((dm, i) => {
        const moved = Math.abs(d.score[i] - d.startScore[i]) >= 0.5;
        return `<div class="tt-row"><span>${dm.icon} ${dm.label}</span><span>${moved ? `<span class="muted small">was ${Math.round(d.startScore[i])}</span> ` : ""}${CP.chip(d.score[i], true)}</span></div>`;
      }).join("")}
      <div class="pf-res">
        <canvas width="88" height="112"></canvas>
        <div><b>${CP.esc(r.name)}</b> <span class="muted small">lives here</span>
          <div class="pf-say ${say.mood}">“${CP.esc(say.text)}”</div>
          <button class="btn small" data-talk>💬 Talk</button></div>
      </div>
      <div class="pf-lots"><b>${d.lots.length} lots:</b> ${Object.entries(counts).map(([z, n]) => `${CP.ZONES[z].icon} ${CP.ZONES[z].name} ×${n}`).join(" · ")}
        <div class="muted small">${free} open${locked ? ` · ${locked} locked 🔒` : ""}. Real ratings come from the 2024 CEI.</div></div>`;
    const c = el.querySelector("canvas").getContext("2d");
    c.scale(2, 2);
    S.resident(c, 22, 54, 0.46, r.look, { phase: 0, moving: false, dir: 1 });
  };

  // ---------- speech bubble (opening scene and residents) ----------
  ui.speech = function (name, sub, text, sx, sy, mood, hint) {
    const el = $("#speech");
    const key = name + "|" + text + "|" + (hint || "");
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = `<div class="sp-name">${CP.esc(name)}${sub ? ` <span>· ${CP.esc(sub)}</span>` : ""}</div><div class="sp-text">${CP.esc(text)}</div>${hint ? `<div class="sp-hint">${hint}</div>` : ""}`;
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

  // ---------- undo ----------
  ui.showUndo = function (b, left) {
    const el = $("#undo");
    if (!b) return el.classList.add("hidden");
    el.classList.remove("hidden");
    el.innerHTML = `↶ Undo ${CP.BUILDINGS[b.type].name} · full ${CP.money(b.cost)} refund <span>${Math.ceil(left)}s</span> <kbd>Ctrl Z</kbd>`;
  };

  // ---------- coach marks (guided first mission) ----------
  const tut = (ui.tut = { on: localStorage.getItem("cei-tips-done") !== "1", i: 0, anchor: null });
  ui.startTutorial = function () {
    if (!tut.on) return;
    tut.i = 0;
    showCoach();
  };
  ui.endTutorial = function (done) {
    tut.on = false;
    localStorage.setItem("cei-tips-done", "1");
    $("#coach").classList.add("hidden");
    if (done) ui.toast("That's the loop: <b>Missions → Plan → Build</b>. Finish the contract to earn its grant.", "", 5200);
  };
  // the game reports what the player did; the coach moves on when it matches the current step
  ui.tutStep = function (what) {
    if (!tut.on || !CP.game.started) return;
    const step = CP.TUTORIAL[tut.i];
    if (!step) return;
    const next = { go: "go", plan: "build", pick: "pick", lot: "placed" }[step.id];
    if (what === "placed") return ui.endTutorial(true);
    if (what !== next) return;
    tut.i++;
    showCoach();
  };
  function showCoach() {
    const step = CP.TUTORIAL[tut.i];
    if (!step) return ui.endTutorial();
    $("#coach .coach-text").innerHTML = `<span class="coach-n">${tut.i + 1}/${CP.TUTORIAL.length}</span> ${step.text}`;
    $("#coach").classList.remove("hidden");
  }
  function coachAnchor() {
    const step = CP.TUTORIAL[tut.i];
    if (!step) return null;
    const rect = (el) => el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    if (step.id === "go") return { r: rect($("#mission-list .go")), side: "right" };
    if (step.id === "plan") return { r: rect($('.tab[data-tab="build"]')), side: "below" };
    if (step.id === "pick") return { r: rect($("#build-list .bld.helps") || $("#build-list .bld")), side: "right" };
    if (step.id === "lot" && R.focus) {
      const lot = R.focus.lots.find((l) => !l.building && !sim.isLocked(l) && ui.selected && CP.BUILDINGS[ui.selected].zones.includes(l.zone));
      if (lot) { const [x, y] = R.toScreen(lot.x, lot.y); return { r: { left: x - 40, right: x + 40, top: y - 30, bottom: y + 30, width: 80, height: 60 }, side: "right" }; }
    }
    return { r: null };
  }
  function positionCoach() {
    if (!tut.on || $("#coach").classList.contains("hidden")) return;
    const a = coachAnchor(), el = $("#coach");
    const hidden = ui.dcmOpen() || CP.game.paused;
    el.style.visibility = hidden ? "hidden" : "visible";
    if (!a || !a.r) { el.style.left = window.innerWidth / 2 - el.offsetWidth / 2 + "px"; el.style.top = "92px"; el.dataset.side = "none"; return; }
    const r = a.r;
    el.dataset.side = a.side;
    if (a.side === "below") { el.style.left = CP.clamp(r.left + r.width / 2 - el.offsetWidth / 2, 8, window.innerWidth - el.offsetWidth - 8) + "px"; el.style.top = r.bottom + 14 + "px"; }
    else { el.style.left = Math.min(window.innerWidth - el.offsetWidth - 8, r.right + 16) + "px"; el.style.top = Math.max(70, r.top + r.height / 2 - el.offsetHeight / 2) + "px"; }
  }

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
      n = Math.min(text.length, n + 2);
      el.textContent = text.slice(0, n);
      if (n % 4 === 0) CP.audio.blip();
      if (n >= text.length) finishTyping();
    }, 22);
  }
  function finishTyping() {
    clearInterval(typer);
    typer = null;
    $("#dcm-text").textContent = dcm.pages[dcm.i];
    $("#dcm-text").classList.remove("typing");
    if (dcm.i === dcm.pages.length - 1 && dcm.opts.extra) {
      $("#dcm-extra").innerHTML = dcm.opts.extra;
      if (dcm.opts.onExtra) dcm.opts.onExtra();
    }
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
    c.fillStyle = "rgba(94,230,255,0.16)";
    [[6, 70, 12], [20, 52, 10], [32, 62, 9], [72, 58, 11], [85, 44, 9], [96, 66, 12]].forEach(([x, y, w]) => c.fillRect(x, y, w, 132 - y));
    c.fillStyle = "rgba(94,230,255,0.3)"; c.fillRect(89, 30, 1.5, 14);
    c.fillStyle = "#16284a";
    c.beginPath(); c.moveTo(4, 132); c.quadraticCurveTo(8, 96, 40, 92); c.lineTo(72, 92); c.quadraticCurveTo(104, 96, 108, 132); c.closePath(); c.fill();
    c.fillStyle = "#f4f7fb";
    c.beginPath(); c.moveTo(44, 92); c.lineTo(56, 116); c.lineTo(68, 92); c.closePath(); c.fill();
    c.strokeStyle = "#0b1730"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(40, 93); c.lineTo(54, 124); c.moveTo(72, 93); c.lineTo(58, 124); c.stroke();
    c.fillStyle = "#c8102e"; c.beginPath(); c.arc(80, 108, 3.2, 0, 7); c.fill();
    c.fillStyle = "#7a4a2b"; c.fillRect(49, 78, 14, 18);
    c.fillStyle = "#17110f";
    c.beginPath(); c.arc(56, 28, 17, 0, 7); c.fill();
    c.beginPath(); c.ellipse(56, 54, 27, 29, 0, 0, 7); c.fill();
    c.fillStyle = "#8d5a34";
    c.beginPath(); c.ellipse(56, 60, 21, 25, 0, 0, 7); c.fill();
    c.fillStyle = "#17110f";
    c.beginPath(); c.moveTo(34, 52); c.quadraticCurveTo(56, 26, 78, 52); c.quadraticCurveTo(56, 40, 34, 52); c.fill();
    c.fillStyle = "#8d5a34"; c.beginPath(); c.arc(35, 62, 4, 0, 7); c.arc(77, 62, 4, 0, 7); c.fill();
    c.fillStyle = "#5ee6ff"; c.beginPath(); c.arc(34.5, 69, 2.2, 0, 7); c.arc(77.5, 69, 2.2, 0, 7); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.ellipse(47, 58, 4.2, 2.8, 0, 0, 7); c.ellipse(65, 58, 4.2, 2.8, 0, 0, 7); c.fill();
    c.fillStyle = "#1c1210"; c.beginPath(); c.arc(47.5, 58, 2, 0, 7); c.arc(65.5, 58, 2, 0, 7); c.fill();
    c.strokeStyle = "#17110f"; c.lineWidth = 1.8; c.lineCap = "round";
    c.beginPath(); c.moveTo(41.5, 51.5); c.quadraticCurveTo(47, 49, 52, 51.5); c.moveTo(60, 51.5); c.quadraticCurveTo(65, 49, 70.5, 51.5); c.stroke();
    c.strokeStyle = "#6b3f22"; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(56, 60); c.lineTo(54.5, 68); c.lineTo(58, 68.5); c.stroke();
    c.strokeStyle = "#5a1f24"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(48.5, 75); c.quadraticCurveTo(56, 80, 63.5, 75); c.stroke();
    c.strokeStyle = "#cfd8e3"; c.lineWidth = 2;
    c.beginPath(); c.arc(56, 52, 26, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.beginPath(); c.moveTo(31, 62); c.quadraticCurveTo(34, 80, 47, 79); c.stroke();
    c.fillStyle = "#cfd8e3"; c.fillRect(28.5, 55, 5, 11);
    c.fillStyle = "#5ee6ff"; c.beginPath(); c.arc(47.5, 79, 2, 0, 7); c.fill();
  }

  // ---------- leaderboard ----------
  const LB_KEY = "cei-leaderboard";
  const board = () => { try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch (e) { return []; } };
  function saveScore(name, run) {
    const list = board();
    const entry = { name: (name || "Director").slice(0, 18), equity: run.equity, score: run.score, date: new Date().toISOString().slice(0, 10), id: Date.now() };
    list.push(entry);
    list.sort((a, b) => b.equity - a.equity || b.score - a.score);
    localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 20)));
    return entry.id;
  }
  function boardHTML(mine) {
    const list = board().slice(0, 8);
    if (!list.length) return `<p class="muted small">No saved runs yet. Save yours above.</p>`;
    return `<table class="lb"><thead><tr><th>#</th><th>Director</th><th>Calgary Equity</th><th>Score</th><th></th></tr></thead><tbody>${list.map((e, i) =>
      `<tr class="${e.id === mine ? "me" : ""}"><td>${i + 1}</td><td>${CP.esc(e.name)}</td><td><b>${e.equity.toFixed(1)}</b>/100</td><td>${e.score.toLocaleString()}</td><td class="muted">${e.date}</td></tr>`).join("")}</tbody></table>`;
  }

  // ---------- final report: your Calgary vs the real 2024 CEI ----------
  ui.report = function () {
    const fs = sim.finalScore();
    const overall = sim.overall();
    const run = { equity: +overall.toFixed(1), score: fs.total };
    const deltas = CP.DOMAINS.map((_, i) => sim.metricAvg(i) - sim.startAvg[i]);
    const rows = CP.DOMAINS.map((dm, i) => {
      const real = sim.startAvg[i], mine = sim.metricAvg(i), dv = deltas[i];
      const dir = dv >= 0.5 ? `<span class="pos">▲ ${sgn(dv, 1)}</span>` : dv <= -0.5 ? `<span class="neg">▼ ${sgn(dv, 1)}</span>` : `<span class="muted">= ${sgn(dv, 1)}</span>`;
      return `<tr><td>${dm.icon} ${dm.label}</td><td>${CP.chip(real, true)}</td><td>${CP.chip(mine, true)}</td><td>${dir}</td></tr>`;
    }).join("");
    const dOv = overall - sim.startOverall;
    // biggest gain and loss, and where they happened
    const order = deltas.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const where = (i, sign) => sim.districts.slice().sort((a, b) => sign * ((b.score[i] - b.startScore[i]) - (a.score[i] - a.startScore[i])))[0];
    const [gv, gi] = order[0], [lv, li] = order[order.length - 1];
    const lossD = where(li, -1);
    const lossWhy = lossD && sim.buildings.filter((b) => b.d === lossD || (b.fracs || []).some(([d]) => d === lossD)).filter((b) => (CP.BUILDINGS[b.type].area || { gain: [] }).gain[li] < 0 || CP.BUILDINGS[b.type].gain[li] < 0).map((b) => CP.BUILDINGS[b.type].name);
    const lossEv = lossD && sim.penalties.filter((p) => p.d === lossD && p.m === li && !p.fixed).map((p) => CP.EVENT_TYPES[p.ev].name.toLowerCase());
    const gainLine = gv >= 0.3
      ? `<b class="pos">Biggest gain:</b> ${CP.DOMAINS[gi].icon} ${CP.DOMAINS[gi].label}, ${sgn(gv, 1)} points above real Calgary, led by ${CP.esc(where(gi, 1).name)}.`
      : `<b>Biggest gain:</b> none. Calgary looks just like the real 2024 index.`;
    const lossLine = lv <= -0.3
      ? `<b class="neg">Biggest loss:</b> ${CP.DOMAINS[li].icon} ${CP.DOMAINS[li].label}, ${sgn(lv, 1)} points below reality, worst in ${CP.esc(lossD.name)}${lossWhy.length ? ` (${[...new Set(lossWhy)].join(", ")})` : lossEv.length ? ` (${[...new Set(lossEv)].join(", ")})` : ""}.`
      : `<b class="pos">Nothing got worse</b> than real Calgary in any of the six areas.`;
    const drows = sim.districts.slice().sort((a, b) => (b.overall - b.startOverall) - (a.overall - a.startOverall)).map((d) => {
      const dv = d.overall - d.startOverall;
      return `<div class="rep-d"><span>${CP.esc(d.name)}</span><span>${CP.chip(d.startOverall)}${arrow}${CP.chip(d.overall)} <b class="${dv >= 0.05 ? "pos" : dv <= -0.05 ? "neg" : "muted"}">${sgn(dv, 1)}</b></span></div>`;
    }).join("");
    const extra = `
      <div class="rep-top">
        <div class="rep-score"><span class="lbl">Final score</span><span class="num">${fs.total.toLocaleString()}</span></div>
        <div class="rep-break">
          <span>Calgary Equity <b>${overall.toFixed(1)}</b>/100 ${CP.chip(overall)}</span><span>${fs.equity.toLocaleString()} pts</span>
          <span>Budget left over (${CP.money(Math.floor(sim.budget))})</span><span>${fs.budget.toLocaleString()} pts</span>
          <span class="muted">Missions completed</span><span class="muted">${missions.done.length} of ${CP.MISSIONS.total}</span>
          <span class="muted">Buildings built</span><span class="muted">${sim.buildings.length}</span>
        </div>
      </div>
      <div class="rep-h">Your Calgary vs the real Calgary (2024 Calgary Equity Index)</div>
      <table class="rep-cmp"><thead><tr><th></th><th>Real Calgary 2024</th><th>Your Calgary</th><th>Change</th></tr></thead><tbody>${rows}
        <tr class="tot"><td>⚖️ Calgary Equity</td><td>${CP.chip(sim.startOverall, true)}</td><td>${CP.chip(overall, true)}</td><td>${dOv >= 0 ? `<span class="pos">▲ ${sgn(dOv, 1)}</span>` : `<span class="neg">▼ ${sgn(dOv, 1)}</span>`}</td></tr></tbody></table>
      <p class="rep-line">${gainLine}</p>
      <p class="rep-line">${lossLine}</p>
      <p class="muted small">"Real Calgary" is the starting city, built from all 288 census tracts in the City of Calgary's 2024 Calgary Equity Index (flipped so a higher number is fairer).</p>
      <div class="rep-h">Leaderboard</div>
      <div class="lb-save"><input id="lb-name" maxlength="18" placeholder="Your name" value="${CP.esc(localStorage.getItem("cei-name") || "")}" /><button class="btn" id="lb-btn">Save my run</button></div>
      <div id="lb">${boardHTML()}</div>
      <div class="rep-h">District report (biggest change first)</div>
      <div class="rep-grid">${drows}</div>`;
    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const name = $("#lb-name") ? $("#lb-name").value.trim() || "Director" : "Director";
      localStorage.setItem("cei-name", name);
      const id = saveScore(name, run);
      if ($("#lb")) $("#lb").innerHTML = boardHTML(id);
      if ($("#lb-btn")) { $("#lb-btn").disabled = true; $("#lb-btn").textContent = "Saved ✓"; }
    };
    ui.dcm([CP.STORY.report[CP.bandIndex(overall)]], {
      replace: true, report: true, extra, button: "Start a new term ↻",
      onExtra: () => { $("#lb-btn").onclick = save; $("#lb-name").onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") save(); }; },
      done: () => { save(); location.hash = ""; location.reload(); },
    });
  };
})();
