// Events tab, emergency bar, map-layer switcher and the traffic readout.
(function () {
  const CP = window.CP;
  const sim = CP.sim, R = CP.render, ui = CP.ui, events = CP.events, T = CP.traffic;
  const $ = (s) => document.querySelector(s);
  const esc = CP.esc;
  const clock = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  // ---------- respond: zoom to the district, open Build, pick the first matching fix ----------
  CP.respond = function (inc, type) {
    CP.game.enterDistrict(inc.d, false, inc);
    ui.setTab("build");
    ui.select(type || inc.t.fix[0]);
  };

  // ---------- emergency bar: one card per active disaster, with Respond and Crews ----------
  const HOWTXT = { built: "fixed with a building", crews: "emergency crews" };
  function renderEvents() {
    const alerts = events.active.filter((i) => !i.good);
    $("#alerts").innerHTML = alerts.slice(0, 3).map((i) => `<div class="alert-card" data-id="${i.id}"><span class="ai">${i.t.icon}</span><span>${i.t.name} in ${esc(i.d.name)}</span><span class="at">−${CP.money(i.dmg)}/min</span><button class="btn" data-act="respond">Build fix</button><button class="btn" data-act="crews" ${sim.canAfford(i.crew) ? "" : "disabled"}>🚒 ${CP.money(i.crew)}</button></div>`).join("");
  }
  ui.renderEvents = renderEvents;
  function incOf(el) {
    const card = el.closest("[data-id]");
    return card ? events.active.find((i) => i.id === +card.dataset.id) : null;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const inc = incOf(b);
    if (!inc) return;
    if (b.dataset.act === "respond") { CP.respond(inc); CP.audio.click(); }
    else if (b.dataset.act === "crews") {
      const out = events.dispatch(inc);
      if (!out.ok) { ui.toast(out.why, "bad"); CP.audio.error(); }
      ui.update();
      renderEvents();
    }
  });

  // ---------- zone card: click a zone to inspect it, remove its buildings, or rezone it ----------
  const sgn = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(0);
  const KN = { R: "Residential", C: "Commercial", I: "Industrial", P: "Park" };
  const KI = { R: "🏠", C: "🏬", I: "🏭", P: "🌳" };
  const KC = { R: CP.ZONES.R.color, C: CP.ZONES.C.color, I: CP.ZONES.I.color, P: CP.ZONES.O.color };
  const zs = { zone: null, cl: null };
  CP.zoneCardOpen = () => !!zs.zone;
  CP.closeZoneCard = function () {
    zs.zone = null; zs.cl = null;
    R.selZone = null; R.selCluster = null;
    $("#zone-card").classList.add("hidden");
  };
  // "Economic −14 · Health +14 (nearby)": the biggest rating changes
  function diffLine(prev) {
    const parts = [];
    for (const df of prev.diffs.slice(0, 3)) {
      const ms = df.delta.map((v, i) => [v, i]).filter(([v]) => Math.abs(v) >= 0.5).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 3);
      parts.push(`${df.own ? "" : esc(df.d.name) + " "}${ms.map(([v, i]) => `<b class="${v > 0 ? "pos" : "neg"}">${CP.DOMAINS[i].icon}${sgn(v)}</b>`).join(" ")}`);
    }
    return parts.join(" · ") || "No change to ratings";
  }
  function renderZone() {
    const { zone, cl } = zs;
    if (!zone) return;
    const d = R.focus;
    const el = $("#zone-card");
    const live = zone.clusters.filter((c) => !c.removed && c.kind !== "P");
    let rows = "";
    if (zone.kind === "P") rows = `<div class="zrow"><div class="zw">Green space. Lifts Climate and Health, and buffers pollution from factories.</div></div>`;
    else if (!live.length) rows = `<div class="zrow"><div class="zw">Open land. Nothing built here.</div></div>`;
    else rows = live.map((c) => {
      const k = CP.CLUSTER_KINDS[c.kind], pv = sim.removalPreview(c);
      return `<div class="zrow ${cl === c ? "sel" : ""}" data-cid="${c.id}"><div class="zr"><span class="zi" style="font-size:22px">${k.icon}</span><div><div class="zn">${esc(c.label)}</div></div>
        <button class="btn small primary" data-zact="remove" data-cid="${c.id}" ${pv.ok ? "" : "disabled"}>Remove ${CP.money(k.cost)}</button></div>
        <div class="zd">If removed: ${diffLine(pv)}</div></div>`;
    }).join("");
    let rez = "";
    if (zone.kind !== "P") {
      rez = `<h5>Rezone to</h5><div class="zbtns">` + ["R", "C", "I"].filter((k) => k !== zone.kind).map((k) =>
        `<button class="zbtn" data-zact="rezone" data-kind="${k}" ${sim.canAfford(CP.ZONE_REZONE.cost) ? "" : "disabled"}><div class="zn">${KI[k]} ${KN[k]} · ${CP.money(CP.ZONE_REZONE.cost)}</div></button>`).join("") + `</div>`;
    }
    el.innerHTML = `<div class="zh"><span class="zi">${KI[zone.kind]}</span><div><div class="zt">${KN[zone.kind]} ${zone.kind === "P" ? "" : "zone"}</div>
      <div class="zs">${d ? esc(d.name) + " · " : ""}${(zone.area / 1e6).toFixed(1)} km²</div></div>
      <button class="btn small zx" data-zact="close">✕</button></div>
      ${rows}${rez}`;
  }
  CP.zoneCard = function (zone, cl) {
    zs.zone = zone; zs.cl = cl && !cl.removed ? cl : null;
    R.selZone = zone; R.selCluster = zs.cl;
    $("#zone-card").classList.remove("hidden");
    zsig = "";
    renderZone();
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zact]");
    if (!b || !zs.zone) return;
    const act = b.dataset.zact;
    if (act === "close") CP.closeZoneCard();
    else if (act === "remove") {
      const c = CP.world.clusters[+b.dataset.cid];
      if (c) { CP.game.removeCluster(c); zs.cl = null; R.selCluster = null; renderZone(); }
    } else if (act === "rezone") { CP.game.rezoneZone(zs.zone, b.dataset.kind); renderZone(); }
  });
  document.addEventListener("mouseover", (e) => {
    const row = e.target.closest(".zrow[data-cid]");
    R.selCluster = row ? CP.world.clusters[+row.dataset.cid] : zs.cl;
  });
  // keep the card fresh when money or ratings change
  let zsig = "";
  setInterval(() => {
    if (!zs.zone) return;
    const sig = Math.floor(sim.budget) + "|" + zs.zone.kind + "|" + zs.zone.clusters.filter((c) => !c.removed).map((c) => c.id).join(",");
    if (sig !== zsig) { zsig = sig; renderZone(); }
  }, 600);

  // ---------- layers: one compact row of toggles (double-click one to see only that one) ----------
  const LAYERS = ["R", "C", "I", "P", "traffic"];
  function renderLayers() {
    document.querySelectorAll(".layer").forEach((b) => b.classList.toggle("on", !!R.layers[b.dataset.layer]));
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".layer");
    if (!b) return;
    R.layers[b.dataset.layer] = !R.layers[b.dataset.layer];
    renderLayers();
    CP.audio.click();
  });
  document.addEventListener("dblclick", (e) => {
    const b = e.target.closest(".layer");
    if (!b || b.dataset.layer === "traffic") return;
    for (const k of LAYERS) if (k !== "traffic") R.layers[k] = k === b.dataset.layer;
    renderLayers();
  });

  // ---------- slow tick: alert bar + layers visibility ----------
  function tick() {
    const live = !$("#topbar").classList.contains("hidden");
    $("#layers").classList.toggle("hidden", !live);
    if (live) renderEvents();
  }
  renderLayers();
  setInterval(tick, 500);
})();
