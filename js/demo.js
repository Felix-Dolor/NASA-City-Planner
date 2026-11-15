// Presentation demo (CP.DEMO in config.js): a scripted 5-minute run that hits the story beats in order.
//   intro -> Forest Lawn mission glows (Belonging + Wellbeing: Community Centre + Library)
//   -> a planning mission with two hidden metrics drops into the first slot (Falconridge: Health + Wellbeing)
//   -> a house fire breaks out; the camera holds on it until the presenter clicks or presses a key, then flies back
//   -> the presenter repairs it and tours the Plan tab
//   -> with CP.DEMO.chaosAt seconds left every kind of disaster hits at once -> the timer ends -> scoreboard.
(function () {
  const CP = window.CP;
  const D = CP.DEMO;
  if (!D) return;
  const sim = CP.sim, missions = CP.missions, events = CP.events, R = CP.render, ui = CP.ui, game = CP.game;
  const byName = (n) => sim.districts.find((d) => d.name === n);

  let stage = 0; // 0: first mission, 1: planning mission, 2: fire done
  let first = null, second = null;
  let chaos = null; // queued disasters [{ key, at }] once the finale starts
  const demo = (CP.demo = { stage: () => stage });

  // the term opens with the Forest Lawn mission on top, glowing, and the usual civilians waiting with offers
  demo.init = function () {
    const f = D.first;
    missions.reserve(byName(D.second.district)); // keep random offers away from the next scripted district
    // empty lots in the scripted districts: building over a family home costs Wellbeing, which could leave a
    // mission a point short whichever lot the presenter happens to click
    for (const n of [f.district, D.second.district]) for (const l of byName(n).lots) l.house = false;
    first = missions.scripted({ kind: "dual", d: byName(f.district), m: f.metrics[0], m2: f.metrics[1], target: f.target }, 0);
    first.spot = true;
    missions.fillOffers();
    events.schedule = []; // no random disasters: the demo fires its own
    ui.tut.on = false; // no coach marks: the presenters explain each step
  };

  // called from game.js when missions complete; returns extra dialogue pages and what to do when it closes
  demo.onComplete = function (completed) {
    if (stage === 0 && completed.includes(first)) {
      stage = 1;
      const s = D.second;
      second = missions.scripted({ kind: "plan", d: byName(s.district), m: s.metrics[0], m2: s.metrics[1], target: s.target, quote: s.quote }, 0);
      second.spot = true;
      return {
        pages: [
          `Great work in ${first.d.name}, Director. A new mission just came in from ${second.d.name}: it is at the top of your list. They can't tell us exactly what is wrong, so open the Plan tab and compare their statistics with the rest of Calgary.`,
          { speaker: second.giver, text: second.pitch },
        ],
      };
    }
    if (stage === 1 && completed.includes(second)) {
      stage = 2;
      return { done: startFire };
    }
    return null;
  };

  // ---------- the fire: camera holds on it until the presenter gives any input ----------
  let back = null, holdSince = 0;
  const hint = document.createElement("div");
  hint.textContent = "Click or press any key to continue";
  hint.style.cssText = "position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:60;padding:9px 18px;border-radius:99px;" +
    "background:rgba(8,12,30,.88);color:#fff;font:600 14px Inter,system-ui,sans-serif;border:1px solid #ff8da1;box-shadow:0 0 22px rgba(255,90,60,.55);" +
    "display:none;pointer-events:none;animation:pulse 1.6s infinite";
  document.body.appendChild(hint);

  function startFire() {
    if (game.ended) return;
    const dis = events.fire(D.fire.type, byName(D.fire.district));
    game.onEvent(dis);
    const c = R.cam;
    back = { x: c.x, y: c.y, z: c.z };
    ui.select(null);
    ui.hideTooltip();
    game.hold = true;
    holdSince = performance.now();
    const z = 0.16;
    R.highlight = dis.d;
    game.flyTo(dis.x, dis.y - 90 / z, z, 1.4);
    hint.style.display = "block";
  }
  function release(e) {
    if (!game.hold || performance.now() - holdSince < 900) { if (game.hold) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    game.hold = false;
    hint.style.display = "none";
    if (back) game.flyTo(back.x, back.y, back.z, 1.2);
    back = null;
  }
  // capture phase on window: runs before the game's own handlers, so the releasing click does nothing else
  for (const t of ["mousedown", "mouseup", "click", "keydown", "wheel"]) window.addEventListener(t, release, { capture: true, passive: false });

  // ---------- the finale: everything at once ----------
  demo.tick = function (g) {
    if (!chaos && g.timeLeft <= D.chaosAt) chaos = D.chaos.map((key, i) => ({ key, at: g.elapsed + i * D.chaosGap }));
    while (chaos && chaos.length && g.elapsed >= chaos[0].at) {
      const { key } = chaos.shift();
      if (CP.EVENT_TYPES[key]) game.onEvent(events.fire(key));
    }
  };
})();
