// DOM user interface: toolbar, meters, tract card, missions, insights, modals, leaderboard.
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render;
  const $ = (s) => document.querySelector(s);
  const ui = (CP.ui = { tool: "inspect", pinned: null });

  const TOOL_GROUPS = [
    ["Survey", [["inspect", "🔍", "Inspect", "Esc"], ["bulldoze", "🚜", "Bulldoze", "B"]]],
    ["Community services", ["childcare", "grocery", "library", "pharmacy", "school", "community"]],
    ["Health", ["clinic", "hospital"]],
    ["Mobility", ["transit"]],
    ["Green", ["trees", "park"]],
    ["Zoning (250 m blocks)", ["zone:dense", "zone:suburban", "zone:commercial", "zone:industrial"]],
  ];
  ui.toolSpec = function (id) {
    if (id.startsWith("zone:")) return Object.assign({ kind: "zone", type: id.slice(5) }, CP.ZONES[id.slice(5)]);
    if (CP.BUILDINGS[id]) return Object.assign({ kind: "building", type: id }, CP.BUILDINGS[id]);
    return null;
  };

  // base need ranks
  const ranked = sim.tracts.slice().sort((a, b) => b.base.total - a.base.total);
  ranked.forEach((t, i) => (t.rank = i + 1));

  ui.init = function () {
    // toolbar
    const tb = $("#toolbar");
    let html = "";
    for (const [group, tools] of TOOL_GROUPS) {
      html += `<h4>${group}</h4><div class="tools">`;
      for (const tl of tools) {
        if (Array.isArray(tl)) {
          html += `<button class="tool" data-tool="${tl[0]}" title="${tl[2]}"><span class="kb">${tl[3]}</span><span class="ic">${tl[1]}</span><span class="nm">${tl[2]}</span></button>`;
        } else {
          const s = ui.toolSpec(tl);
          const cost = s.brush ? `${CP.money(s.cost)} / grove` : s.kind === "zone" ? `${CP.money(s.cost)} / block` : CP.money(s.cost);
          html += `<button class="tool" data-tool="${tl}" title="${CP.esc(s.name + " — " + s.why)}"><span class="kb">${s.key}</span><span class="ic">${s.icon}</span><span class="nm">${s.name}</span><span class="cs">${cost}</span></button>`;
        }
      }
      html += "</div>";
    }
    tb.innerHTML = html;
    tb.addEventListener("click", (e) => {
      const b = e.target.closest(".tool");
      if (b) { ui.setTool(b.dataset.tool); CP.audio.click(); }
    });

    // meters
    $("#meter-list").innerHTML = CP.DOMAINS.map((d, i) => `
      <div class="meter" id="meter-${i}" style="color:${d.color}">
        <div class="top"><b style="color:var(--text)">${d.icon} ${d.label}</b><span><span class="delta" id="md-${i}"></span> <span id="mv-${i}" style="color:var(--text)">0%</span></span></div>
        <div class="bar"><div class="fill" id="mf-${i}" style="background:linear-gradient(90deg, ${d.color}aa, ${d.color})"></div><div class="ghost" id="mg-${i}"></div><div class="shine"></div></div>
      </div>`).join("");

    // overlays
    const sel = $("#overlay-select");
    let groups = {};
    CP.OVERLAYS.forEach((o) => (groups[o.group] = groups[o.group] || []).push(o));
    sel.innerHTML = Object.entries(groups).map(([g, os]) => `<optgroup label="${g}">${os.map((o) => `<option value="${o.id}">${o.label}</option>`).join("")}</optgroup>`).join("");
    sel.addEventListener("change", () => ui.setOverlay(sel.value));
    $("#overlay-alpha").addEventListener("input", (e) => (R.overlayAlpha = e.target.value / 100));
    $("#labels-toggle").addEventListener("change", (e) => (R.showLabels = e.target.checked));
    ui.setOverlay("total");

    // insights
    $("#insight-list").innerHTML = CP.INSIGHTS.map((s, i) => `<div class="insight" data-i="${i}"><b>${s.title}</b>${s.text}</div>`).join("");
    $("#insight-list").addEventListener("click", (e) => {
      const el = e.target.closest(".insight");
      if (el) ui.setOverlay(CP.INSIGHTS[el.dataset.i].overlay);
    });

    // buttons
    $("#btn-missions").onclick = () => ui.toggleDrawer("missions");
    $("#btn-insights").onclick = () => ui.toggleDrawer("insights");
    $("#btn-leaderboard").onclick = () => ui.leaderboard();
    $("#btn-title-leaderboard").onclick = () => ui.leaderboard();
    $("#btn-help").onclick = () => ui.help();
    $("#btn-end").onclick = () => ui.confirmEnd();
    $("#btn-sound").onclick = (e) => (e.target.textContent = CP.audio.toggle() ? "🔇" : "🔊");
    $("#btn-sound").textContent = CP.audio.muted ? "🔇" : "🔊";
    document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => ui.toggleDrawer(b.dataset.close, false)));
    $("#mission-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const ch = CP.CHALLENGES.find((c) => c.id === b.dataset.id);
      if (b.dataset.act === "layer") ui.setOverlay(ch.overlay);
      if (b.dataset.act === "tool" && ch.types) ui.setTool(ch.types[0].startsWith("dense") ? "zone:dense" : ch.types[0]);
      if (b.dataset.act === "show") ui.showTopTracts(ch);
    });
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") ui.closeModal(); });
    ui.setTool("inspect");
  };

  ui.setTool = function (id) {
    ui.tool = id;
    document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === id));
    const cv = $("#game");
    cv.classList.toggle("bulldoze", id === "bulldoze");
    R.preview = null;
    ui.clearGhost();
    const s = ui.toolSpec(id);
    if (s) ui.ticker(`${s.icon} <b>${s.name}</b> — ${s.why}`);
    else if (id === "bulldoze") ui.ticker("🚜 <b>Bulldoze</b> — click any building, landmark or zone. You get money back, but losing services hurts the people who used them.");
    else ui.ticker("🔍 <b>Inspect</b> — hover districts to read their data. Drag to pan, scroll to zoom all the way to street level.");
  };

  ui.setOverlay = function (id) {
    R.overlay = id;
    $("#overlay-select").value = id;
    const ov = CP.OVERLAYS.find((o) => o.id === id);
    const stops = ov.diverging ? CP.IMPACT_STOPS : ov.neutral ? [[40, 60, 120], [90, 140, 220], [180, 120, 255], [255, 140, 220]] : ov.good ? CP.GOOD_STOPS : CP.NEED_STOPS;
    $("#legend-bar").style.background = `linear-gradient(90deg, ${stops.map((c) => CP.rgba(c, 1)).join(",")})`;
    const u = ov.unit || "";
    $("#legend-min").textContent = ov.min + u;
    $("#legend-max").textContent = ov.max + u;
    $("#legend-label").textContent = ov.diverging ? "worse ← → better" : ov.neutral ? "low → high" : ov.good ? "worse → better" : "less need → more need";
    if (R.overlayAlpha < 0.2) { R.overlayAlpha = 0.55; $("#overlay-alpha").value = 55; }
  };

  // ---------- per-frame-ish updates ----------
  let lastScore = null, lastBudget = null;
  ui.update = function () {
    const sc = sim.score();
    $("#budget").textContent = CP.money(sim.budget);
    $("#budget").style.color = sim.budget < 20 ? "var(--bad)" : "";
    const avg = sim.tracts.reduce((a, t) => a + t.live.total, 0) / sim.tracts.length;
    const avg0 = sim.tracts.reduce((a, t) => a + t.base.total, 0) / sim.tracts.length;
    $("#cityneed").innerHTML = `${avg.toFixed(2)} <small style="font-size:11px;color:${avg <= avg0 ? "var(--good)" : "var(--bad)"}">${CP.signed(avg - avg0, 2)}</small>`;
    const g = sim.gap();
    $("#gap").innerHTML = `${g.toFixed(2)} <small style="font-size:11px;color:${g <= sim.baseGap ? "var(--good)" : "var(--bad)"}">${CP.signed(g - sim.baseGap, 2)}</small>`;
    const scEl = $("#score");
    scEl.textContent = sc.total.toLocaleString();
    if (lastScore !== null && sc.total !== lastScore) flash(scEl, sc.total > lastScore);
    lastScore = sc.total;
    if (lastBudget !== null && sim.budget > lastBudget) flash($("#budget"), true);
    lastBudget = sim.budget;
    sc.meters.forEach((v, i) => {
      const f = $("#mf-" + i);
      const pct = CP.clamp(v, -1, 1.25);
      if (pct >= 0) { f.classList.remove("neg"); f.style.width = Math.min(100, pct * 100) + "%"; f.style.left = "0"; f.style.right = ""; }
      else { f.style.width = Math.min(100, -pct * 100) + "%"; f.style.left = "0"; f.style.background = "linear-gradient(90deg,#ff5c7a,#ff8fa3)"; }
      if (pct >= 0) f.style.background = `linear-gradient(90deg, ${CP.DOMAINS[i].color}aa, ${CP.DOMAINS[i].color})`;
      $("#mv-" + i).textContent = Math.round(v * 100) + "%";
      $("#meter-" + i).classList.toggle("full", v >= 1);
    });
    const done = CP.CHALLENGES.filter((c) => c.state && c.state.stars > 0).length;
    $("#mission-count").textContent = `${done}/${CP.CHALLENGES.length}`;
    ui.renderMissions();
    if (ui.pinned) ui.showTract(ui.pinned, true);
  };
  function flash(el, good) {
    el.classList.remove("flash-good", "flash-bad");
    void el.offsetWidth;
    el.classList.add(good ? "flash-good" : "flash-bad");
  }

  ui.showGhost = function (delta) {
    const m = sim.meters();
    delta.forEach((d, i) => {
      const g = $("#mg-" + i);
      const v = CP.clamp(m[i], 0, 1);
      const end = CP.clamp(m[i] + d, 0, 1);
      g.classList.toggle("bad", d < 0);
      g.style.left = Math.min(v, end) * 100 + "%";
      g.style.width = Math.abs(end - v) * 100 + "%";
      const el = $("#md-" + i);
      if (Math.abs(d) >= 0.002) {
        el.textContent = (d > 0 ? "+" : "") + (d * 100).toFixed(1) + "%";
        el.style.color = d > 0 ? "var(--good)" : "var(--bad)";
      } else el.textContent = "";
    });
  };
  ui.clearGhost = function () {
    CP.DOMAINS.forEach((_, i) => {
      $("#mg-" + i).style.width = "0";
      $("#md-" + i).textContent = "";
    });
  };

  // ---------- tract card ----------
  function tags(t) {
    const out = [];
    const n = t.n;
    if (n.healthGap > 0.6) out.push(["Healthcare gap", "bad"]);
    if (n.lackGrocery > 0.95 && n.poverty > 0.4) out.push(["Food desert", "bad"]);
    if (n.lowCanopy > 0.8 && n.heat > 0.6) out.push(["Heat island", "bad"]);
    if (t.voter_turnout_rate < 35) out.push(["Low turnout", "bad"]);
    if (t.children_perc > 22) out.push(["Young families", ""]);
    if (t.seniors_65_perc > 22) out.push(["Many seniors", ""]);
    if (t.average_walkscore > 85) out.push(["Very walkable", "good"]);
    if (t.average_walkscore < 20) out.push(["Car-dependent", ""]);
    if (t.park_area_perc < 3) out.push(["Few parks", "bad"]);
    if (t.tree_canopy > 20) out.push(["Leafy", "good"]);
    if (t.educ_no_cert_perc > 15) out.push(["Learning gap", "bad"]);
    if (t.movers_1_year_ago > 25) out.push(["High churn", ""]);
    return out;
  }
  function needColor(v) {
    return CP.rgba(CP.rampRGB(CP.NEED_STOPS, (v - 15) / 65), 1);
  }
  ui.showTract = function (t, pinned) {
    if (!t) return;
    if (pinned) ui.pinned = t;
    if (!pinned && ui.pinned && ui.pinned !== t) return;
    const d = t.base.total - t.live.total;
    const kv = [
      ["Has regular care provider", t.regular_care_provider_yes_perc.toFixed(1) + "%"],
      ["Diabetes prevalence", t.diabetes_agestd_perc.toFixed(1) + "%"],
      ["Tree canopy", t.tree_canopy.toFixed(1) + "%"],
      ["Land surface temp", t.land_surface_temp.toFixed(1) + "°C"],
      ["Park area", t.park_area_perc.toFixed(1) + "%"],
      ["Walk / Transit score", `${t.average_walkscore.toFixed(0)} / ${t.average_transitscore.toFixed(0)}`],
      ["Children / Seniors", `${t.children_perc.toFixed(1)}% / ${t.seniors_65_perc.toFixed(1)}%`],
      ["Population in poverty", t.population_in_poverty_perc.toFixed(1) + "%"],
      ["No certificate", t.educ_no_cert_perc.toFixed(1) + "%"],
      ["Voter turnout", t.voter_turnout_rate.toFixed(1) + "%"],
      ["Renters", t.renter_households_perc.toFixed(1) + "%"],
      ["Commute time", t.average_commute_time.toFixed(1) + " min"],
    ];
    const tool = ui.toolSpec(ui.tool);
    let fit = "";
    if (tool && tool.rel) {
      const r = CP.clamp(tool.rel(t.n), 0, 1.3);
      fit = `<div style="margin:8px 0 2px;font-size:12px">${tool.icon} Need for <b>${tool.name}</b> here: <b style="color:${r > 0.7 ? "var(--good)" : r > 0.4 ? "var(--accent2)" : "var(--bad)"}">${r > 0.85 ? "Very high" : r > 0.65 ? "High" : r > 0.4 ? "Moderate" : "Low"}</b> (${Math.round(r * 100)})</div>`;
    }
    $("#info-body").innerHTML = `
      <div class="tract-name">${CP.esc(t.name)}</div>
      <div class="tract-sub">${t.q} quadrant · Census tract ${t.id} · #${t.rank} of 288 by need ${pinned ? "· 📌 pinned" : ""}</div>
      <div class="score-badge" style="background:${needColor(t.live.total)}33;border:1px solid ${needColor(t.live.total)}">
        <span class="big">${t.live.total.toFixed(1)}</span><span>Total Equity Score</span>
        ${Math.abs(d) > 0.005 ? `<span style="color:${d > 0 ? "var(--good)" : "var(--bad)"}">${CP.signed(-d, 2)}</span>` : ""}
      </div>
      ${CP.DOMAINS.map((dm, i) => {
        const v = t.live.need[i], b = t.base.need[i];
        return `<div class="dom-row" title="${dm.label} need (higher = more barriers)"><span>${dm.icon}</span><div class="mini"><span style="width:${b}%;background:${dm.color}44"></span><span style="width:${v}%;background:${dm.color}"></span></div><span class="num">${v.toFixed(1)}${Math.abs(v - b) > 0.05 ? `<small style="color:${v < b ? "var(--good)" : "var(--bad)"}"> ${CP.signed(v - b, 1)}</small>` : ""}</span></div>`;
      }).join("")}
      ${fit}
      <div style="margin-top:6px">${tags(t).map(([s, c]) => `<span class="tag ${c}">${s}</span>`).join("")}</div>
      <div class="kv">${kv.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`;
  };

  // ---------- tooltip / toast / ticker ----------
  const tt = () => $("#tooltip");
  ui.tooltip = function (html, x, y) {
    const el = tt();
    el.innerHTML = html;
    el.classList.remove("hidden");
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(window.innerWidth - w - 10, x + 18) + "px";
    el.style.top = Math.min(window.innerHeight - h - 10, y + 18) + "px";
  };
  ui.hideTooltip = () => tt().classList.add("hidden");
  ui.toast = function (html, cls) {
    const el = document.createElement("div");
    el.className = "toast " + (cls || "");
    el.innerHTML = html;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3900);
  };
  ui.ticker = function (html) {
    const el = $("#ticker");
    el.innerHTML = html;
  };

  // ---------- drawers ----------
  ui.toggleDrawer = function (id, force) {
    ["missions", "insights"].forEach((d) => {
      const el = $("#" + d);
      const open = d === id ? (force !== undefined ? force : !el.classList.contains("open")) : false;
      el.classList.toggle("open", open);
    });
  };

  ui.renderMissions = function () {
    const el = $("#mission-list");
    el.innerHTML = CP.CHALLENGES.map((ch) => {
      const s = ch.state || { have: 0, ratio: 0, stars: 0 };
      const prog = ch.custom ? s.ratio : s.have / ch.count;
      const starStr = "★".repeat(s.stars) + "☆".repeat(3 - s.stars);
      const quality = !ch.custom && s.have ? `Placement quality: <b>${Math.round(s.ratio * 100)}%</b> of ideal` : ch.custom ? s.label || "" : "Not started";
      return `<div class="mission ${s.stars > 0 ? "done" : ""}">
        <div class="mh"><span class="mt">${ch.icon} ${ch.title}</span><span class="stars" style="color:${s.stars ? "var(--accent2)" : "var(--muted)"}">${starStr}</span></div>
        <p>${ch.brief}</p>
        <div class="prog"><span style="width:${CP.clamp(prog, 0, 1) * 100}%"></span></div>
        <div class="acts"><span class="muted" style="flex:1">${ch.custom ? quality : `${Math.min(s.have, ch.count)}/${ch.count} · ${quality}`}</span>
          <button class="btn" data-act="layer" data-id="${ch.id}" title="Show the relevant data layer">🗺️ Layer</button>
          ${ch.types ? `<button class="btn" data-act="tool" data-id="${ch.id}">🛠️ Tool</button>` : ""}
          ${!ch.custom ? `<button class="btn" data-act="show" data-id="${ch.id}" title="Highlight the neediest tracts for this mission">🔦 Hint</button>` : ""}
        </div></div>`;
    }).join("");
  };

  ui.showTopTracts = function (ch) {
    let top;
    if (ch.id === "hospital") {
      top = sim.tracts.slice().sort((a, b) => b.n.healthGap - a.n.healthGap).slice(0, 8);
      ui.toast("🔦 Highlighted the tracts with the biggest healthcare gap. The best site also covers many of them at once.");
    } else {
      top = sim.tracts.slice().sort((a, b) => ch.rel(b) - ch.rel(a)).slice(0, 6);
      ui.toast(`🔦 Highlighted the top tracts for <b>${ch.title}</b>.`);
    }
    R.focusTracts = top;
    ui.setOverlay(ch.overlay);
    clearTimeout(ui._focusT);
    ui._focusT = setTimeout(() => (R.focusTracts = null), 12000);
    CP.game.flyTo(top[0].c[0], top[0].c[1], Math.max(R.cam.z, 0.05));
  };

  // ---------- modals ----------
  ui.modal = function (html) {
    $("#modal-card").innerHTML = html;
    $("#modal").classList.remove("hidden");
    CP.game.paused = true;
  };
  ui.closeModal = function () {
    $("#modal").classList.add("hidden");
    CP.game.paused = false;
  };

  ui.help = function (first) {
    ui.modal(`
      <h2>${first ? "🛰️ Mission briefing" : "❔ How to play"}</h2>
      <p>You're aboard <b>CEI-SAT 1</b>, looking down on Calgary. Each coloured district is a real census tract from the <b>2024 Calgary Equity Index</b>. Hot colours = more barriers to wellbeing.</p>
      <div class="grid2">
        <div>
          <h3>🏗️ Build</h3>
          <p>Pick a service on the left and click the map. Every building raises scores in a radius — <b>more</b> where that service is missing. Hover first: the preview shows who benefits and how your six meters move.</p>
          <h3>🌳 Plant & zone</h3>
          <p>Drag to plant tree groves or paint zoning. Density buys walkability and transit but costs noise, parks and families. Suburbs buy space and kids but cost commutes.</p>
        </div>
        <div>
          <h3>📊 Score</h3>
          <p>Fill the six <b>wellbeing meters</b>. They fill <b>faster</b> when you help the neediest tracts, and your weakest meter earns a balance bonus. Missions add stars. Shrinking the gap between the neediest and least-needy tracts adds more.</p>
          <h3>🚜 Bulldoze</h3>
          <p>Demolishing returns money, but removing a library, grocery or hospital hurts the people who relied on it.</p>
        </div>
      </div>
      <h3>⌨️ Controls</h3>
      <div class="keys">
        <span><kbd>Scroll</kbd></span><span>Zoom from orbit to street level (watch the people!)</span>
        <span><kbd>Drag</kbd> / <kbd>Right-drag</kbd></span><span>Pan (left-drag pans with Inspect)</span>
        <span><kbd>W A S D</kbd></span><span>Pan · <kbd>Q</kbd>/<kbd>E</kbd> zoom</span>
        <span><kbd>1</kbd>–<kbd>9</kbd>, <kbd>P</kbd>, <kbd>T</kbd></span><span>Building tools · <kbd>Z X C I</kbd> zoning · <kbd>B</kbd> bulldoze · <kbd>Esc</kbd> inspect</span>
        <span><kbd>M</kbd> / <kbd>L</kbd></span><span>Missions · Cycle data layers</span>
      </div>
      <div class="modal-actions"><button class="btn primary big" onclick="CP.ui.closeModal(); ${first ? "CP.ui.toggleDrawer('missions', true)" : ""}">${first ? "Show me the missions 🎯" : "Got it"}</button></div>`);
  };

  ui.confirmEnd = function () {
    ui.modal(`
      <h2>🏁 End your term?</h2>
      <p>Council will tally your city's wellbeing meters, missions and remaining budget. You have <b>${CP.money(sim.budget)}</b> left.</p>
      <div class="modal-actions"><button class="btn" onclick="CP.ui.closeModal()">Keep building</button><button class="btn primary" onclick="CP.ui.endGame()">Submit to Council</button></div>`);
  };

  function grade(total) {
    return total >= 11000 ? "S" : total >= 9000 ? "A" : total >= 7000 ? "B" : total >= 5000 ? "C" : total >= 3000 ? "D" : "F";
  }

  ui.endGame = function () {
    const sc = sim.score();
    const g = grade(sc.total);
    const movers = sim.tracts.filter((t) => Math.abs(t.base.total - t.live.total) > 0.05).sort((a, b) => (b.base.total - b.live.total) - (a.base.total - a.live.total));
    const best = movers.slice(0, 5), worst = movers.filter((t) => t.live.total > t.base.total).slice(-3).reverse();
    const stars = CP.CHALLENGES.reduce((a, c) => a + (c.state ? c.state.stars : 0), 0);
    const built = sim.active((p) => p.kind === "building").length;
    const destroyed = sim.placements.filter((p) => p.removed && p.kind !== "building" && p.kind !== "zone").length;
    const ne = sim.quadAvg("NE", true) - sim.quadAvg("NE"), sw = sim.quadAvg("SW", true) - sim.quadAvg("SW");
    CP.audio.fanfare();
    R.confetti();
    ui.modal(`
      <h2>📜 Council Report Card</h2>
      <div class="grid2">
        <div>
          <div class="grade">${g}</div>
          <div style="text-align:center;font-family:var(--display);font-size:28px;color:var(--accent2)">${sc.total.toLocaleString()} pts</div>
          <div style="text-align:center" class="muted">${built} buildings · ${stars}★ · ${destroyed} demolitions · ${CP.money(sim.spent)} spent</div>
        </div>
        <div class="breakdown">
          ${CP.DOMAINS.map((d, i) => `<span>${d.icon} ${d.short} meter (${Math.round(sc.meters[i] * 100)}%)</span><span>${Math.round(Math.min(sc.meters[i], 1.25) * 1000)}</span>`).join("")}
          <span>⚖️ Balance bonus (weakest meter)</span><span>${Math.round(sc.balance)}</span>
          <span>📉 Equity gap change (${CP.signed(sim.gap() - sim.baseGap, 2)})</span><span>${Math.round(sc.gapPts)}</span>
          <span>🎯 Missions (${stars}★)</span><span>${sc.challenge}</span>
          <span>💰 Budget left</span><span>${Math.round(sc.budget)}</span>
          <span class="total">Total</span><span class="total">${sc.total.toLocaleString()}</span>
        </div>
      </div>
      <h3>🌟 Biggest improvements</h3>
      <p>${best.length ? best.map((t) => `<b>${CP.esc(t.name)}</b> (${t.base.total.toFixed(1)} → ${t.live.total.toFixed(1)})`).join(" · ") : "No tract changed. Council is… unimpressed."}</p>
      ${worst.length ? `<h3>⚠️ Made worse</h3><p>${worst.map((t) => `<b>${CP.esc(t.name)}</b> (${t.base.total.toFixed(1)} → ${t.live.total.toFixed(1)})`).join(" · ")}</p>` : ""}
      <p class="muted">NE quadrant average improved by ${ne.toFixed(2)}; SW by ${sw.toFixed(2)}. ${ne > sw ? "You directed help where the need is greatest. 👏" : "The SW gained more than the NE — equity means going where the need is."}</p>
      <h3>🏆 Sign the leaderboard</h3>
      <div style="display:flex;gap:10px"><input class="text" id="lb-name" maxlength="20" placeholder="Planner name" value="${CP.esc(localStorage.getItem("cei-name") || "")}" /><button class="btn primary" id="lb-submit">Submit</button></div>
      <div class="modal-actions"><button class="btn" onclick="CP.ui.closeModal()">Keep playing</button><button class="btn" onclick="location.reload()">🔄 New term</button></div>`);
    $("#lb-name").focus();
    $("#lb-submit").onclick = () => {
      const name = ($("#lb-name").value || "Anonymous Planner").trim().slice(0, 20);
      localStorage.setItem("cei-name", name);
      const entry = { id: Date.now(), name, score: sc.total, grade: g, stars, built, date: new Date().toISOString().slice(0, 10), meters: sc.meters.map((m) => Math.round(m * 100)) };
      const lb = ui.loadLB();
      lb.push(entry);
      lb.sort((a, b) => b.score - a.score);
      localStorage.setItem("cei-leaderboard", JSON.stringify(lb.slice(0, 50)));
      ui.leaderboard(entry.id);
    };
  };

  ui.loadLB = function () {
    try { return JSON.parse(localStorage.getItem("cei-leaderboard")) || []; } catch (e) { return []; }
  };
  ui.leaderboard = function (highlight) {
    const lb = ui.loadLB();
    const rows = lb.slice(0, 15).map((e, i) => `
      <tr class="${e.id === highlight ? "me" : ""}"><td>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td><td>${CP.esc(e.name)}</td><td>${e.grade}</td><td>${"★".repeat(Math.min(e.stars, 30))}<span class="muted"> ${e.stars}</span></td>
      <td class="muted">${CP.DOMAINS.map((d, k) => `${d.icon}${e.meters[k]}`).join(" ")}</td><td class="muted">${e.date}</td><td class="num">${e.score.toLocaleString()}</td></tr>`).join("");
    ui.modal(`
      <h2>🏆 Leaderboard</h2>
      <p class="muted">Top planners on this device.</p>
      ${lb.length ? `<table class="lb"><tr><th>#</th><th>Planner</th><th>Grade</th><th>Stars</th><th>Meters %</th><th>Date</th><th style="text-align:right">Score</th></tr>${rows}</table>` : `<p>No terms completed yet — be the first planner on the board!</p>`}
      <div class="modal-actions">${lb.length ? `<button class="btn" id="lb-clear">Clear</button>` : ""}<button class="btn primary" onclick="CP.ui.closeModal()">Close</button></div>`);
    const c = $("#lb-clear");
    if (c) c.onclick = () => { if (confirm("Clear the leaderboard on this device?")) { localStorage.removeItem("cei-leaderboard"); ui.leaderboard(); } };
  };
})();
