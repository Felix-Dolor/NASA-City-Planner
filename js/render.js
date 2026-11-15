// Frame renderer: orbit view -> flat-colour map of Calgary, district borders, Plan overlay, lots,
// effect circles, isometric buildings, residents, day/night light, the satellite and particles.
(function () {
  const CP = window.CP;
  const sim = CP.sim, world = CP.world, S = CP.sprites, G = CP.GEO;
  const BOUNDS = window.CEI_DATA.bounds;

  const R = (CP.render = {
    cam: { x: 0, y: 0, z: 0.006, rot: 0 },
    overlayMetric: null, // index of the metric shown as band colours (Plan view) or null (normal view)
    particles: [],
    props: [], // extra scenery for the opening scene: {kind, x, y}
    hoverDistrict: null,
    hoverWarn: false, // outline the hovered district in red (e.g. budget too short)
    focus: null, // the district zoomed into (its lots are shown and buildable)
    highlight: null, // the active mission's district (gold pulse)
    pins: [], // mission pins: [{d, icon}]
    preview: null, // {lot, type, pv} ghost building on a lot
    hoverLot: null,
    flashes: [], // [{d, t, color}] event flashes
    showNeeds: false, // need icons above residents' heads
    dayFrac: null, // 0..1 through the term (dawn -> noon -> dusk)
    cityZ: 0.02, // zoom of the whole-city view (set by game.js)
    time: 0,
  });

  let canvas, ctx, W = 0, H = 0, DPR = 1;
  let stars = null;
  const clouds = [];

  R.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext("2d");
    R.resize();
    window.addEventListener("resize", R.resize);
    // starfield tile
    stars = document.createElement("canvas");
    stars.width = stars.height = 1024;
    const s = stars.getContext("2d");
    s.fillStyle = "#03040b";
    s.fillRect(0, 0, 1024, 1024);
    const rnd = CP.rng(42);
    for (let i = 0; i < 900; i++) {
      const a = rnd();
      s.fillStyle = `rgba(${200 + rnd() * 55},${200 + rnd() * 55},255,${0.3 + a * 0.7})`;
      const r = a > 0.97 ? 1.6 : a > 0.85 ? 1 : 0.6;
      s.beginPath(); s.arc(rnd() * 1024, rnd() * 1024, r, 0, 7); s.fill();
    }
    const g = s.createRadialGradient(700, 300, 10, 700, 300, 380);
    g.addColorStop(0, "rgba(120,60,200,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = g;
    s.fillRect(0, 0, 1024, 1024);
    const crnd = CP.rng(7);
    for (let i = 0; i < 22; i++) {
      const a = crnd() * Math.PI * 2, d = Math.sqrt(crnd()) * world.PLANET_R * 0.95;
      const puffs = [];
      for (let k = 0; k < 7 + crnd() * 7; k++) puffs.push([(crnd() - 0.5) * 9000, (crnd() - 0.5) * 3500, 2000 + crnd() * 3000]);
      clouds.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, puffs, v: 60 + crnd() * 80 });
    }
  };

  R.resize = function () {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
  };
  R.size = () => [W, H];
  R.minZoom = () => Math.min(W, H) / (2 * world.PLANET_R * 1.15);
  R.maxZoom = 0.45;

  // ---------- transforms ----------
  R.toScreen = (x, y) => {
    const c = R.cam;
    return [(x - c.x) * c.z + W / 2, (y - c.y) * c.z + H / 2];
  };
  R.toWorld = (sx, sy) => {
    const c = R.cam;
    return [(sx - W / 2) / c.z + c.x, (sy - H / 2) / c.z + c.y];
  };
  const screenTransform = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // ---------- lots ----------
  R.lotScale = () => S.buildScale(R.cam.z);
  R.lotsShown = () => (R.focus ? R.focus.lots : []);
  // the lot under a screen point (iso diamond hit test)
  R.lotAt = function (px, py) {
    const k = R.lotScale();
    const hw = 62 * 2 * 0.72 * k, hh = 62 * 2 * 0.36 * k;
    for (const lot of R.lotsShown()) {
      const [sx, sy] = R.toScreen(lot.x, lot.y);
      if (Math.abs(px - sx) / hw + Math.abs(py - sy) / hh <= 1.05) return lot;
    }
    return null;
  };

  // ---------- particles ----------
  R.burst = function (x, y, emoji, n, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      R.particles.push({
        x, y, emoji, t: 0, life: 1.8 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * (opts.spread || 60), vy: -40 - Math.random() * 60, size: opts.size || 22 + Math.random() * 10, delay: i * 0.06,
      });
    }
  };
  R.floatText = function (x, y, text, color, delay) {
    R.particles.push({ x, y, text, color, t: 0, life: 2.8, vx: 0, vy: -34, size: 17, delay: delay || 0 });
  };
  R.confetti = function () {
    for (let i = 0; i < 160; i++) {
      R.particles.push({
        screen: true, x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.35, t: 0, life: 2.5 + Math.random(),
        vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 500, size: 6 + Math.random() * 6,
        color: ["#c8102e", "#ffffff", "#ffd166", "#06d6a0", "#118ab2"][i % 5], spin: Math.random() * 10,
      });
    }
  };
  // demolition dust
  R.dust = function (x, y) {
    for (let i = 0; i < 14; i++)
      R.particles.push({ dust: true, x, y, t: 0, life: 1 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 160, vy: -20 - Math.random() * 60, size: 10 + Math.random() * 14, delay: 0 });
  };
  R.flash = (d, color) => R.flashes.push({ d, t: 0, color: color || "#ff4d4d" });

  // ---------- main draw ----------
  R.draw = function (dt) {
    R.time += dt;
    const t = R.time;
    const c = R.cam;
    const z = c.z;
    screenTransform();
    const px = (-c.x * z * 0.02) % 1024, py = (-c.y * z * 0.02) % 1024;
    for (let x = px - 1024; x < W; x += 1024) for (let y = py - 1024; y < H; y += 1024) ctx.drawImage(stars, x, y);

    ctx.save();
    const [pcx, pcy] = R.toScreen(0, 0);
    const pr = world.PLANET_R * z;
    const glow = ctx.createRadialGradient(pcx, pcy, pr * 0.96, pcx, pcy, pr * 1.12);
    glow.addColorStop(0, "rgba(90,170,255,0.55)");
    glow.addColorStop(0.4, "rgba(70,140,255,0.22)");
    glow.addColorStop(1, "rgba(40,80,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr * 1.12, 0, 7); ctx.fill();

    // planet surface (world coordinates)
    ctx.save();
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.clip();
    const cur = ctx.getTransform();
    ctx.setTransform(cur.multiply(new DOMMatrix([z, 0, 0, z, W / 2 - c.x * z, H / 2 - c.y * z])));
    const far = world.far, city = world.city;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(far.canvas, far.x0, far.y0, far.W * far.mpp, far.H * far.mpp);
    ctx.drawImage(city.canvas, city.x0, city.y0, city.W * city.mpp, city.H * city.mpp);

    const near = CP.clamp((z - 0.1) / 0.25, 0, 1); // 0 from orbit, 1 close to the ground
    const map = CP.clamp((z - 0.008) / 0.006, 0, 1); // map furniture fades in as the city fills the view

    // Plan view: each district filled with the band colour of the chosen metric
    if (R.overlayMetric !== null && map > 0) {
      ctx.globalAlpha = 0.6 * map;
      for (const d of sim.districts) {
        ctx.fillStyle = CP.bandOf(d.score[R.overlayMetric]).color;
        ctx.fill(d.path, "evenodd");
      }
      ctx.globalAlpha = 1;
    }
    if (map > 0) {
      ctx.globalAlpha = map;
      drawWaterAndRoads(z);
      ctx.lineCap = "round";
      for (const l of G.ctrain) {
        ctx.strokeStyle = l.color;
        ctx.lineWidth = Math.max(2 / z, 10);
        ctx.setLineDash([9 / z, 7 / z]);
        ctx.stroke(l.path);
      }
      ctx.setLineDash([]);
      // focus mode: dim every other district
      if (R.focus) {
        ctx.fillStyle = "rgba(8,12,30,0.38)";
        for (const d of sim.districts) if (d !== R.focus) ctx.fill(d.path, "evenodd");
      }
      // thick district borders: dark casing + bright line, constant width on screen
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(6,10,28,0.9)";
      ctx.lineWidth = 7 / z;
      for (const d of sim.districts) ctx.stroke(d.path);
      ctx.strokeStyle = "rgba(255,255,255,0.96)";
      ctx.lineWidth = 2.8 / z;
      for (const d of sim.districts) ctx.stroke(d.path);
      ctx.globalAlpha = 1;
    }
    // protests: red hatch over the district
    for (const [id, left] of sim.protests) {
      const d = sim.districts[id];
      ctx.fillStyle = `rgba(255,60,60,${0.12 + 0.06 * Math.sin(t * 6)})`;
      ctx.fill(d.path, "evenodd");
    }
    // event flashes
    for (let i = R.flashes.length - 1; i >= 0; i--) {
      const f = R.flashes[i];
      f.t += dt;
      if (f.t > 4) { R.flashes.splice(i, 1); continue; }
      ctx.globalAlpha = 0.45 * Math.abs(Math.sin(f.t * 5)) * (1 - f.t / 4);
      ctx.fillStyle = f.color;
      ctx.fill(f.d.path, "evenodd");
      ctx.globalAlpha = 1;
    }
    if (R.highlight && map > 0.3) {
      ctx.fillStyle = `rgba(255,212,59,${0.1 + 0.07 * Math.sin(t * 4)})`;
      ctx.fill(R.highlight.path, "evenodd");
      ctx.strokeStyle = "#ffd43b";
      ctx.lineWidth = (5 + Math.sin(t * 5) * 2) / z;
      ctx.stroke(R.highlight.path);
    }
    for (const p of R.pins) {
      if (p.d === R.highlight || map < 0.5) continue;
      ctx.strokeStyle = "rgba(255,212,59,0.85)";
      ctx.lineWidth = (3 + Math.sin(t * 5) * 1.2) / z;
      ctx.stroke(p.d.path);
    }
    if (R.hoverDistrict && R.hoverDistrict !== R.focus) {
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.fill(R.hoverDistrict.path, "evenodd");
      ctx.strokeStyle = R.hoverWarn ? "#ff4d6d" : "#5ee6ff";
      ctx.lineWidth = 4.5 / z;
      ctx.stroke(R.hoverDistrict.path);
    }
    if (R.focus) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 6 / z;
      ctx.stroke(R.focus.path);
    }
    drawEffectFields(z, t);
    ctx.restore(); // planet clip

    // night side of the planet
    const shadowG = ctx.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
    shadowG.addColorStop(0, "rgba(0,0,20,0)");
    shadowG.addColorStop(0.75, "rgba(0,0,20,0)");
    shadowG.addColorStop(1, "rgba(0,0,30,0.55)");
    ctx.fillStyle = shadowG;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.fill();

    if (map > 0) {
      drawLots(t);
      drawObjects(t, map);
      drawDaylight(pcx, pcy, pr);
      drawLabels(map * (1 - near * 0.7), t);
    }

    const cloudA = CP.clamp(1 - (z - R.minZoom() * 1.2) / (R.minZoom() * 1.3), 0, 1) * 0.9;
    if (cloudA > 0.01) drawClouds(cloudA, dt);

    drawPreview(t);
    drawParticles(dt, t);
    ctx.restore();
    drawSatellite(t);
  };

  function visibleBounds(pad) {
    const [x0, y0] = R.toWorld(-pad, -pad);
    const [x1, y1] = R.toWorld(W + pad, H + pad);
    return [x0, y0, x1, y1];
  }
  function cellRange(pad) {
    const B = world.CELL;
    const [x0, y0, x1, y1] = visibleBounds(pad);
    return [
      Math.floor(Math.max(x0, BOUNDS[0]) / B), Math.floor(Math.max(y0, BOUNDS[1]) / B),
      Math.floor(Math.min(x1, BOUNDS[2]) / B), Math.floor(Math.min(y1, BOUNDS[3]) / B),
    ];
  }

  // Rivers and MAJOR roads only (highways and main arteries), drawn as vectors so they stay crisp.
  function drawWaterAndRoads(z) {
    ctx.lineCap = ctx.lineJoin = "round";
    for (const r of G.rivers) {
      ctx.strokeStyle = "#2b6f9c"; ctx.lineWidth = Math.max(r.width * 1.5, 3.2 / z); ctx.stroke(r.path);
      ctx.strokeStyle = "#4b9ad0"; ctx.lineWidth = Math.max(r.width, 1.8 / z); ctx.stroke(r.path);
    }
    for (const l of G.lakes) { ctx.fillStyle = "#3f8fc2"; ctx.fill(l.path); }
    for (const r of G.roads) {
      const hw = r.w >= 30;
      ctx.strokeStyle = "rgba(52,54,62,0.95)"; ctx.lineWidth = Math.max(r.w * 3, (hw ? 5 : 3.6) / z); ctx.stroke(r.path);
    }
    for (const r of G.roads) {
      const hw = r.w >= 30;
      ctx.strokeStyle = hw ? "#ffc857" : "#f3ecd8"; ctx.lineWidth = Math.max(r.w * 1.8, (hw ? 2.8 : 1.7) / z); ctx.stroke(r.path);
    }
  }

  // green glow around parks, a faint red haze around polluters, and the preview's effect circle
  function drawEffectFields(z, t) {
    for (const b of sim.buildings) {
      const a = CP.BUILDINGS[b.type].area;
      if (!a) continue;
      if (CP.BUILDINGS[b.type].buffer) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, a.r);
        g.addColorStop(0, "rgba(80,220,120,0.32)");
        g.addColorStop(1, "rgba(80,220,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, a.r, 0, 7); ctx.fill();
      } else if (a.harm) {
        const h = (sim.harm || []).find((x) => x.b === b);
        const k = h && h.buffered ? 0.35 : 1;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, a.r);
        g.addColorStop(0, `rgba(120,110,100,${0.38 * k})`);
        g.addColorStop(0.7, `rgba(200,60,60,${0.16 * k})`);
        g.addColorStop(1, "rgba(200,60,60,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, a.r, 0, 7); ctx.fill();
      }
    }
    const p = R.preview;
    if (p && p.pv && p.pv.r) {
      const harm = CP.BUILDINGS[p.type].area.gain.some((g) => g < 0);
      const col = CP.BUILDINGS[p.type].area.harm ? "#ff4d6d" : harm ? "#ffa94d" : "#4ef0a0";
      ctx.fillStyle = CP.hexA(col, 0.12);
      ctx.beginPath(); ctx.arc(p.lot.x, p.lot.y, p.pv.r, 0, 7); ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 / z;
      ctx.setLineDash([12 / z, 8 / z]);
      ctx.lineDashOffset = -t * 30 / z;
      ctx.stroke();
      ctx.setLineDash([]);
      if (p.pv.buffered) {
        ctx.strokeStyle = "#69db7c";
        ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(p.lot.x, p.lot.y, CP.PARK_BUFFER, 0, 7); ctx.stroke();
      }
    }
  }

  // empty lots of the zoomed-in district
  function drawLots(t) {
    const lots = R.lotsShown();
    if (!lots.length) return;
    const k = R.lotScale();
    const sel = CP.ui && CP.ui.selected;
    for (const lot of lots) {
      if (lot.building) continue;
      const [sx, sy] = R.toScreen(lot.x, lot.y);
      if (sx < -300 || sx > W + 300 || sy < -300 || sy > H + 300) continue;
      const locked = sim.isLocked(lot);
      const isPrev = R.preview && R.preview.lot === lot;
      const allowed = sel && CP.BUILDINGS[sel].zones.includes(lot.zone);
      const o = { locked };
      if (isPrev) {
        const ok = R.preview.pv.ok;
        o.fill = ok ? "rgba(78,240,160,0.55)" : "rgba(255,77,109,0.5)";
        o.stroke = ok ? "#2fe28a" : "#ff4d6d";
        o.width = 4;
        o.solid = true;
      } else if (sel && !locked) {
        if (!allowed) o.fill = "rgba(120,120,130,0.18)";
        o.width = allowed ? 3.4 : 1.6;
      } else if (lot === R.hoverLot) o.width = 3.6;
      ctx.globalAlpha = sel && !allowed && !isPrev ? 0.6 : 1;
      S.lot(ctx, lot, sx, sy, k, o);
      ctx.globalAlpha = 1;
      // zone badge (or lock)
      ctx.font = `700 ${Math.round(CP.clamp(11 * k, 10, 14))}px Inter, "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const z = CP.ZONES[lot.zone];
      const txt = locked ? `🔒 ${lot.lock * CP.MISSIONS.unlockEvery} missions` : `${z.icon} ${z.name}${lot.house ? " · home" : ""}`;
      const tw = ctx.measureText(txt).width + 14;
      const by = sy + 62 * 0.72 * k + 12;
      ctx.fillStyle = locked ? "rgba(30,30,40,0.85)" : "rgba(255,255,255,0.92)";
      ctx.beginPath(); ctx.roundRect(sx - tw / 2, by - 10, tw, 20, 10); ctx.fill();
      ctx.strokeStyle = locked ? "#555" : z.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = locked ? "#ddd" : "#1a2038";
      ctx.fillText(txt, sx, by + 0.5);
    }
  }

  function nearLot(x, y, r) {
    for (const lot of sim.lots) if (Math.abs(lot.x - x) < r * 1.8 && Math.abs(lot.y - y) < r) return true;
    return false;
  }
  // harmful effect circles (for unhappy homes)
  function harmCircles() {
    const out = [];
    for (const h of sim.harm || []) {
      const a = CP.BUILDINGS[h.b.type].area;
      if (a.harm && !h.buffered) out.push([h.b.x, h.b.y, a.r * a.r]);
    }
    return out;
  }
  const inCircles = (cs, x, y) => cs.some(([cx, cy, r2]) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2);

  // everything that stands on the map, sorted back to front
  function drawObjects(t, alpha) {
    const z = R.cam.z;
    const items = [];
    const harmed = harmCircles();
    if (z >= 0.045) {
      const [bx0, by0, bx1, by1] = cellRange(200);
      for (let bx = bx0; bx <= bx1; bx++)
        for (let by = by0; by <= by1; by++)
          for (const it of world.cell(bx, by).items) {
            if (nearLot(it.x, it.y, 620)) continue; // keep lots and player buildings unobstructed
            items.push(it);
          }
    }
    if (z >= 0.03) for (const l of CP.LANDMARKS) items.push({ type: "lm", l, x: l.pos[0], y: l.pos[1] + 60 });
    for (const p of sim.buildings) items.push({ type: "bld", p, x: p.x, y: p.y });
    // existing homes on lots outside the zoomed-in district
    if (z >= 0.045) for (const lot of sim.lots) if (lot.house && lot.d !== R.focus) items.push({ type: "lothouse", lot, x: lot.x, y: lot.y });
    for (const p of R.props) items.push({ type: "prop", p, x: p.x, y: p.y, sortY: p.kind === "path" ? -1e9 : p.y }); // paths are ground: drawn under everything
    for (const r of CP.residents.list) if (!r.hidden) items.push({ type: "res", r, x: r.x, y: r.y });
    items.sort((a, b) => (a.sortY !== undefined ? a.sortY : a.y) - (b.sortY !== undefined ? b.sortY : b.y));

    ctx.globalAlpha = alpha;
    const kA = z * 8, kB = S.buildScale(z), uR = S.residentScale(z);
    const now = performance.now();
    const sad = [];
    for (const it of items) {
      const [sx, sy] = R.toScreen(it.x, it.y);
      if (sx < -260 || sx > W + 260 || sy < -300 || sy > H + 420) continue;
      if (it.type === "tree") {
        if (it.s * z >= 1.3) S.tree(ctx, sx, sy, it.s, it.hue, z);
      } else if (it.type === "amb") {
        const hurt = harmed.length && it.kind !== "industrial" && it.kind !== "shops" && inCircles(harmed, it.x, it.y);
        if (hurt) {
          ctx.strokeStyle = "#ff3b3b";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(sx, sy, 26 * kA, 13 * kA, 0, 0, 7); ctx.stroke();
          sad.push([sx, sy - (it.h || 14) * kA * 0.8 - 22 * kA]);
        }
        S.ambient(ctx, it, sx, sy, kA);
      } else if (it.type === "lm") {
        const [lx, ly] = R.toScreen(it.l.pos[0], it.l.pos[1]);
        S.landmark(ctx, it.l, lx, ly, z * world.LM_SCALE, t);
      } else if (it.type === "bld") {
        const grow = CP.smooth(CP.clamp((now - it.p.built) / 600, 0, 1));
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, 0.15 + 0.85 * grow);
        S.building(ctx, it.p.type, 0, 0, kB, t);
        ctx.restore();
      } else if (it.type === "lothouse") {
        S.lot(ctx, it.lot, sx, sy, kB, { housesOnly: true });
      } else if (it.type === "prop") {
        if (it.p.kind === "house") S.ambient(ctx, it.p.it, sx, sy, z * 7);
        else if (it.p.kind === "tree") S.tree(ctx, sx, sy, it.p.s, it.p.hue, z);
        else S.prop(ctx, it.p.kind, sx, sy, z * 3);
      } else if (it.type === "res") {
        const r = it.r;
        S.resident(ctx, sx, sy, uR, r.look, { phase: r.phase, moving: r.moving, dir: r.dir, talk: r.talking ? t : 0 });
        const icon = r.complaint ? "😠" : r.icon;
        if (R.showNeeds && icon) needIcon(sx, sy - 100 * uR * (r.look.extra.small ? 0.82 : 1) - 18 - Math.sin(t * 3 + r.d.id) * 2.5, icon, r);
      }
    }
    // unhappy faces over harmed homes
    ctx.font = `${Math.round(CP.clamp(16 * kA, 12, 22))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [x, y] of sad) ctx.fillText("😟", x, y + Math.sin(t * 3 + x) * 2);
    // landmark dots from far away, names up close
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    if (z < 0.03) {
      for (const l of CP.LANDMARKS) {
        const [sx, sy] = R.toScreen(l.pos[0], l.pos[1]);
        ctx.fillStyle = "#ffd166";
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.fill();
        ctx.strokeStyle = "#0b1020"; ctx.lineWidth = 1.2; ctx.stroke();
      }
    } else if (z > 0.09) {
      for (const l of CP.LANDMARKS) {
        const [sx, sy] = R.toScreen(l.pos[0], l.pos[1]);
        if (sx < -100 || sx > W + 100 || sy < -100 || sy > H + 100) continue;
        label(l.name, sx, sy + 22);
      }
    }
    ctx.globalAlpha = 1;
  }

  // small bubble above a resident's head showing which metric they need (or a heart / angry face)
  function needIcon(sx, sy, icon, r) {
    const happy = r.state !== "need" && !r.complaint;
    ctx.fillStyle = r.complaint ? "#ffd8d8" : happy ? "#d8f5a2" : "#ffffff";
    ctx.strokeStyle = "rgba(15,18,35,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(sx - 15, sy - 13, 30, 26, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 4, sy + 12.5); ctx.lineTo(sx, sy + 18); ctx.lineTo(sx + 4, sy + 12.5); ctx.closePath();
    ctx.fill();
    ctx.font = '15px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(icon, sx, sy + 0.5);
  }

  function label(text, sx, sy, dot, sym) {
    const w = ctx.measureText(text).width + 14 + (dot ? 18 : 0);
    ctx.fillStyle = "rgba(8,12,30,0.82)";
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - 11, w, 22, 11); ctx.fill();
    if (dot) {
      ctx.fillStyle = dot;
      ctx.beginPath(); ctx.arc(sx - w / 2 + 12, sy, 7, 0, 7); ctx.fill();
      if (sym) {
        ctx.fillStyle = "#111";
        ctx.font = "700 9px Inter, system-ui, sans-serif";
        ctx.fillText(sym, sx - w / 2 + 12, sy + 0.5);
        ctx.font = "700 12px Inter, system-ui, sans-serif";
      }
    }
    ctx.fillStyle = "#e8f1ff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sx + (dot ? 9 : 0), sy);
  }

  // district names (always visible), band colour + symbol in Plan view, and mission pins
  function drawLabels(alpha, t) {
    if (alpha <= 0.02) return;
    ctx.globalAlpha = Math.max(alpha, R.focus ? 0.9 : 0);
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const d of sim.districts) {
      const [sx, sy] = R.toScreen(d.label[0], d.label[1]);
      if (sx < -80 || sx > W + 80 || sy < -40 || sy > H + 40) continue;
      if (d === R.focus) continue; // its name is on the profile card
      const ov = R.overlayMetric !== null ? CP.bandOf(d.score[R.overlayMetric]) : null;
      label(d.name, sx, sy + 16, ov ? ov.color : null, ov ? ov.sym : null);
    }
    // mission pins
    for (const p of R.pins) {
      const d = p.d;
      const [sx, sy0] = R.toScreen(d.label[0], d.label[1]);
      const sy = sy0 - 14 - Math.abs(Math.sin(t * 3)) * 6;
      ctx.fillStyle = "#c8102e";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - 18, 15, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(sx, sy);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.font = '14px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(p.icon, sx, sy - 19);
      ctx.font = "700 12px Inter, system-ui, sans-serif";
    }
    ctx.globalAlpha = 1;
  }

  // dawn -> bright day -> dusk over the term
  function drawDaylight(pcx, pcy, pr) {
    if (R.dayFrac === null) return;
    const f = CP.clamp(R.dayFrac, 0, 1);
    const a = 0.3 * Math.pow(1 - Math.sin(Math.PI * f), 1.6);
    if (a < 0.01) return;
    const k = f; // dawn blue -> dusk orange-purple
    const r = CP.lerp(30, 120, k), g = CP.lerp(45, 40, k), b = CP.lerp(120, 70, k);
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.fill();
  }

  // the satellite itself, big on the right whenever the camera is out in orbit
  function drawSatellite(t) {
    const z = R.cam.z;
    const a = CP.clamp((R.cityZ * 0.75 - z) / (R.cityZ * 0.35), 0, 1);
    if (a <= 0.01 || W < 700) return;
    screenTransform();
    ctx.globalAlpha = a;
    const s = CP.clamp(Math.min(W, H) / 620, 0.7, 1.5);
    S.satellite(ctx, W - 210 * s, H * 0.44 + Math.sin(t * 0.8) * 8, s, t);
    ctx.font = "600 11px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "center";
    ctx.fillText("CEI-SAT 1 · 408 km above Calgary", W - 210 * s, H * 0.44 + 105 * s);
    ctx.globalAlpha = 1;
  }

  function drawClouds(alpha, dt) {
    const z = R.cam.z;
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > world.PLANET_R) c.x = -world.PLANET_R;
      if (Math.hypot(c.x, c.y) > world.PLANET_R * 0.95) continue;
      for (const [dx, dy, r] of c.puffs) {
        const [sx, sy] = R.toScreen(c.x + dx, c.y + dy);
        const rr = r * z;
        ctx.fillStyle = `rgba(0,0,30,${0.05 * alpha})`;
        ctx.beginPath(); ctx.arc(sx + rr * 0.5, sy + rr * 0.5, rr, 0, 7); ctx.fill();
      }
      for (const [dx, dy, r] of c.puffs) {
        const [sx, sy] = R.toScreen(c.x + dx, c.y + dy);
        const rr = r * z;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
        g.addColorStop(0, `rgba(255,255,255,${0.75 * alpha})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 7); ctx.fill();
      }
    }
  }

  // ghost of the selected building on the hovered lot (green = allowed, red = not)
  function drawPreview(t) {
    const p = R.preview;
    if (!p) return;
    const k = S.buildScale(R.cam.z);
    const [sx, sy] = R.toScreen(p.lot.x, p.lot.y);
    ctx.globalAlpha = p.pv.ok ? 0.8 + Math.sin(t * 5) * 0.08 : 0.42;
    S.building(ctx, p.type, sx, sy, k, t, { ring: p.pv.ok ? "#4ef0a0" : "#ff4d6d" });
    ctx.globalAlpha = 1;
    if (!p.pv.ok) {
      const r = 22;
      ctx.strokeStyle = "#ff4d6d";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx - r, sy - r - 10); ctx.lineTo(sx + r, sy + r - 10);
      ctx.moveTo(sx + r, sy - r - 10); ctx.lineTo(sx - r, sy + r - 10);
      ctx.stroke();
    }
  }

  function drawParticles(dt, t) {
    const ps = R.particles;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t > p.life) { ps.splice(i, 1); continue; }
      const k = p.t / p.life;
      if (p.screen) {
        p.vy += 900 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.99;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.t * p.spin);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        continue;
      }
      const [sx, sy] = R.toScreen(p.x, p.y);
      const x = sx + p.vx * p.t, y = sy + p.vy * p.t - (p.text ? 40 : 0);
      if (p.dust) {
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.fillStyle = "#b5a58c";
        ctx.beginPath(); ctx.arc(x, y, p.size * (0.6 + k), 0, 7); ctx.fill();
        continue;
      }
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - CP.clamp((k - 0.6) / 0.4, 0, 1);
      if (p.text) {
        ctx.font = `800 ${p.size}px Inter, "Segoe UI Emoji", system-ui, sans-serif`;
        ctx.lineWidth = 5;
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(6,10,28,0.85)";
        ctx.strokeText(p.text, x, y);
        ctx.fillStyle = p.color || "#fff";
        ctx.fillText(p.text, x, y);
      } else {
        ctx.font = `${p.size * (1 + Math.sin(k * Math.PI) * 0.3)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        ctx.fillText(p.emoji, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }
})();
