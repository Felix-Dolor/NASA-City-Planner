// Frame renderer: orbit view -> satellite map -> street level, plus agents & particles.
(function () {
  const CP = window.CP;
  const sim = CP.sim, world = CP.world, S = CP.sprites, G = CP.GEO;

  const R = (CP.render = {
    cam: { x: 0, y: 0, z: 0.006, rot: 0 },
    overlay: "total",
    overlayAlpha: 0.55,
    showLabels: true,
    particles: [],
    hoverTract: null,
    preview: null, // {x,y,radius,color,type,kind,delta}
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
    // a faint nebula
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
  R.maxZoom = 5;

  // ---------- transforms ----------
  R.toScreen = (x, y) => {
    const c = R.cam;
    return [(x - c.x) * c.z + W / 2, (y - c.y) * c.z + H / 2];
  };
  R.toWorld = (sx, sy) => {
    const c = R.cam;
    return [(sx - W / 2) / c.z + c.x, (sy - H / 2) / c.z + c.y];
  };
  function screenTransform() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // ---------- particles ----------
  R.burst = function (x, y, emoji, n, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      R.particles.push({
        x, y, emoji, t: 0, life: 1.8 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, size: opts.size || 22 + Math.random() * 10, delay: i * 0.06,
      });
    }
  };
  R.floatText = function (x, y, text, color) {
    R.particles.push({ x, y, text, color, t: 0, life: 2.2, vx: 0, vy: -30, size: 16, delay: 0 });
  };
  R.confetti = function () {
    for (let i = 0; i < 160; i++) {
      R.particles.push({
        screen: true, x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.35, t: 0, life: 2.5 + Math.random(),
        vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 500, size: 6 + Math.random() * 6,
        color: ["#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#9b5de5"][i % 5], spin: Math.random() * 10,
      });
    }
  };

  // ---------- overlay colouring ----------
  function overlayColor(ov, t) {
    const v = ov.fn(t);
    let k = (v - ov.min) / (ov.max - ov.min);
    if (ov.diverging) return CP.rampRGB(CP.IMPACT_STOPS, CP.clamp(k, 0, 1));
    if (ov.neutral) return CP.rampRGB([[40, 60, 120], [90, 140, 220], [180, 120, 255], [255, 140, 220]], k);
    return CP.rampRGB(ov.good ? CP.GOOD_STOPS : CP.NEED_STOPS, k);
  }
  R.overlayColor = overlayColor;

  // ---------- main draw ----------
  R.draw = function (dt) {
    R.time += dt;
    const t = R.time;
    const c = R.cam;
    const z = c.z;
    screenTransform();
    // space
    const px = (-c.x * z * 0.02) % 1024, py = (-c.y * z * 0.02) % 1024;
    for (let x = px - 1024; x < W; x += 1024) for (let y = py - 1024; y < H; y += 1024) ctx.drawImage(stars, x, y);

    ctx.save();
    if (c.rot) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(c.rot);
      ctx.translate(-W / 2, -H / 2);
    }
    const [pcx, pcy] = R.toScreen(0, 0);
    const pr = world.PLANET_R * z;
    // atmosphere glow
    const glow = ctx.createRadialGradient(pcx, pcy, pr * 0.96, pcx, pcy, pr * 1.12);
    glow.addColorStop(0, "rgba(90,170,255,0.55)");
    glow.addColorStop(0.4, "rgba(70,140,255,0.22)");
    glow.addColorStop(1, "rgba(40,80,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr * 1.12, 0, 7); ctx.fill();

    // planet surface
    ctx.save();
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.clip();
    const cur = ctx.getTransform();
    ctx.setTransform(cur.multiply(new DOMMatrix([z, 0, 0, z, W / 2 - c.x * z, H / 2 - c.y * z])));
    const far = world.far, city = world.city;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(far.canvas, far.x0, far.y0, far.W * far.mpp, far.H * far.mpp);
    // feather city into farmland
    ctx.drawImage(city.canvas, city.x0, city.y0, city.W * city.mpp, city.H * city.mpp);

    const street = CP.clamp((z - 0.32) / 0.35, 0, 1);
    if (street > 0) drawStreetGround(street);

    // overlay
    const ov = CP.OVERLAYS.find((o) => o.id === R.overlay);
    const ovA = street > 0.6 ? 0 : R.overlayAlpha * (1 - street * 0.75);
    if (ov && ovA > 0.02) {
      ctx.globalAlpha = ovA;
      for (const tr of sim.tracts) {
        ctx.fillStyle = CP.rgba(overlayColor(ov, tr), 1);
        ctx.fill(tr.path);
      }
      ctx.globalAlpha = 1;
      if (street < 0.3) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1 / z;
        for (const tr of sim.tracts) ctx.stroke(tr.path);
      }
    }
    // zones (cells)
    if (world.zones.size && street < 1) {
      ctx.globalAlpha = 0.45 * (1 - street);
      for (const zp of world.zones.values()) {
        ctx.fillStyle = CP.ZONES[zp.type].color;
        ctx.fillRect(zp.cx * CP.ZONE_CELL, zp.cy * CP.ZONE_CELL, CP.ZONE_CELL, CP.ZONE_CELL);
      }
      ctx.globalAlpha = 1;
    }
    // CTrain
    if (z > 0.012 && street < 0.9) {
      ctx.lineCap = "round";
      for (const l of G.ctrain) {
        ctx.strokeStyle = l.color;
        ctx.globalAlpha = 0.85 * (1 - street);
        ctx.lineWidth = Math.max(3 / z, 8);
        ctx.setLineDash([12 / z, 8 / z]);
        ctx.stroke(l.path);
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (R.hoverTract) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 / z;
      ctx.stroke(R.hoverTract.path);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fill(R.hoverTract.path);
    }
    if (R.focusTracts) {
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = (2.5 + Math.sin(t * 5)) / z;
      for (const tr of R.focusTracts) ctx.stroke(tr.path);
    }
    ctx.restore(); // planet clip

    // night side
    const shadowG = ctx.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
    shadowG.addColorStop(0, "rgba(0,0,20,0)");
    shadowG.addColorStop(0.75, "rgba(0,0,20,0)");
    shadowG.addColorStop(1, "rgba(0,0,30,0.55)");
    ctx.fillStyle = shadowG;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.fill();

    // street-level objects & agents
    if (street > 0) drawStreetObjects(street, t);

    // markers for placements at low zoom
    drawMarkers(1 - street, t);
    // landmark pins
    if (z < 0.5 && R.showLabels) drawLandmarkPins(z);

    // clouds
    const cloudA = CP.clamp(1 - (z - R.minZoom() * 1.2) / (R.minZoom() * 1.3), 0, 1) * 0.9;
    if (cloudA > 0.01) drawClouds(cloudA, dt);

    drawPreview(t);
    drawParticles(dt, t);
    ctx.restore();
  };

  function visibleBounds(pad) {
    const [x0, y0] = R.toWorld(-pad, -pad);
    const [x1, y1] = R.toWorld(W + pad, H + pad);
    return [x0, y0, x1, y1];
  }

  // ground-level fills for each visible block (in world transform)
  const GROUND = { lawn: "#8fbf6a", plaza: "#c9c3b8", park: "#5fae4f", lot: "#a3a3a0", farm: null, water: "#3f8fc2" };
  function drawStreetGround(alpha) {
    const B = world.BLOCK;
    const [x0, y0, x1, y1] = visibleBounds(60 * R.cam.z + 200);
    const z = R.cam.z;
    ctx.globalAlpha = alpha;
    for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++)
      for (let by = Math.floor(y0 / B); by <= Math.floor(y1 / B); by++) {
        const b = world.block(bx, by);
        if (b.ground === "farm") continue;
        if (b.ground === "water") continue;
        ctx.fillStyle = "#55585e"; // asphalt
        ctx.fillRect(bx * B, by * B, B, B);
        ctx.fillStyle = "#bdb8ad"; // sidewalk
        ctx.fillRect(b.x0 - 2.5, b.y0 - 2.5, b.x1 - b.x0 + 5, b.y1 - b.y0 + 5);
        ctx.fillStyle = GROUND[b.ground];
        ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        if (b.ground === "park" && b.path) {
          ctx.strokeStyle = "#d8cfa8";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(b.x0, b.y0 + 20); ctx.quadraticCurveTo(b.cx, b.cy - 30, b.x1, b.y1 - 20); ctx.stroke();
        }
        if (b.pond) {
          ctx.fillStyle = "#4aa3d8";
          ctx.beginPath(); ctx.ellipse(b.pond.x, b.pond.y, b.pond.r, b.pond.r * 0.7, 0, 0, 7); ctx.fill();
        }
        if (b.parking) {
          ctx.fillStyle = "#7d7f84";
          ctx.fillRect(b.x0 + 4, b.y1 - (b.y1 - b.y0) * 0.38, b.x1 - b.x0 - 8, (b.y1 - b.y0) * 0.34);
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 0.5;
          for (let x = b.x0 + 8; x < b.x1 - 6; x += 4) {
            ctx.beginPath(); ctx.moveTo(x, b.y1 - (b.y1 - b.y0) * 0.38); ctx.lineTo(x, b.y1 - (b.y1 - b.y0) * 0.26); ctx.stroke();
          }
        }
      }
    if (z > 1.2) {
      // lane markings, one batched path
      ctx.strokeStyle = "rgba(255,230,120,0.7)";
      ctx.lineWidth = 0.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++)
        for (let by = Math.floor(y0 / B); by <= Math.floor(y1 / B); by++) {
          const b = world.block(bx, by);
          if (b.ground === "farm" || b.ground === "water") continue;
          ctx.moveTo(bx * B, by * B); ctx.lineTo((bx + 1) * B, by * B); ctx.moveTo(bx * B, by * B); ctx.lineTo(bx * B, (by + 1) * B);
        }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // highways + rivers on top
    ctx.lineCap = ctx.lineJoin = "round";
    for (const r of G.rivers) {
      ctx.strokeStyle = "#2f7fb3"; ctx.lineWidth = r.width + 16; ctx.stroke(r.path);
      ctx.strokeStyle = "#4b9ad0"; ctx.lineWidth = r.width; ctx.stroke(r.path);
    }
    for (const l of G.lakes) { ctx.fillStyle = "#3f8fc2"; ctx.fill(l.path); }
    for (const r of G.roads) {
      ctx.strokeStyle = "#4a4d52"; ctx.lineWidth = r.w + 6; ctx.stroke(r.path);
      ctx.strokeStyle = "#6a6d72"; ctx.lineWidth = r.w; ctx.stroke(r.path);
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.8; ctx.setLineDash([6, 6]); ctx.stroke(r.path); ctx.setLineDash([]);
    }
    for (const l of G.ctrain) {
      ctx.strokeStyle = "#555"; ctx.lineWidth = 6; ctx.stroke(l.path);
      ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.setLineDash([1.5, 1.5]); ctx.stroke(l.path); ctx.setLineDash([]);
    }
    // trees planted by the player: a soft canopy blot under the trees
    for (const p of sim.active((p) => p.kind === "building" && p.type === "trees")) {
      ctx.fillStyle = "rgba(60,120,50,0.35)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 55, 0, 7); ctx.fill();
    }
    for (const p of sim.active((p) => p.kind === "building" && p.type === "park")) {
      ctx.fillStyle = "rgba(95,174,79,0.9)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 150, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // per-tract mood for the agents, cached per frame
  function moodOf(tr) {
    if (!tr) return null;
    if (tr._moodT === R.time) return tr._mood;
    const healthNeed = tr.live.need[2];
    const improved = tr.base.total - tr.live.total;
    tr._mood = {
      sick: CP.clamp((healthNeed - 30) / 70, 0, 0.45) * (0.5 + tr.n.healthGap),
      amb: healthNeed > 42 && tr.n.healthGap > 0.45 ? CP.clamp((healthNeed - 42) / 60 + 0.04, 0, 0.14) : 0,
      happy: CP.clamp(improved / 2.5, 0, 0.6),
      sad: CP.clamp((tr.live.total - 50) / 40, 0, 0.4),
      kids: tr.children_perc / 100,
      density: CP.clamp(0.25 + tr.average_walkscore / 110, 0.25, 1),
    };
    tr._moodT = R.time;
    return tr._mood;
  }

  function drawStreetObjects(alpha, t) {
    const z = R.cam.z;
    const B = world.BLOCK;
    const [x0, y0, x1, y1] = visibleBounds(250 * z + 100);
    ctx.globalAlpha = alpha;
    S.lowDetail = z < 0.75;
    const bubbles = [];
    // ---- agents (drawn before buildings; buildings occlude agents behind them) ----
    if (z > 0.7) drawAgents(x0, y0, x1, y1, t, bubbles);
    // ---- objects ----
    const items = [];
    for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++)
      for (let by = Math.floor(y0 / B); by <= Math.floor(y1 / B); by++) {
        const b = world.block(bx, by);
        for (const it of b.items) items.push(it);
      }
    for (const p of sim.placements) {
      if (p.removed || p.x < x0 - 300 || p.x > x1 + 300 || p.y < y0 - 300 || p.y > y1 + 300) continue;
      if (p.kind === "building" && p.type === "trees") {
        const rnd = CP.rng(p.id * 31);
        for (let i = 0; i < 14; i++) items.push({ type: "tree", x: p.x + (rnd() - 0.5) * 100, y: p.y + (rnd() - 0.5) * 100, s: 4 + rnd() * 3, hue: rnd(), grow: p.built });
      } else if (p.kind === "building" && p.type === "park") {
        const rnd = CP.rng(p.id * 17);
        for (let i = 0; i < 16; i++) {
          const a = rnd() * 7, d = Math.sqrt(rnd()) * 135;
          items.push({ type: "tree", x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, s: 5 + rnd() * 3, hue: rnd(), grow: p.built });
        }
        items.push({ type: "fountain", x: p.x, y: p.y });
      } else if (p.kind === "building" || p.kind === "existing") {
        items.push({ type: "service", p, x: p.x, y: p.y + 15 });
      } else if (p.kind === "landmark") {
        items.push({ type: "landmark", p, x: p.x, y: p.y + 30 });
      }
    }
    items.sort((a, b) => (a.y + (a.d || 0)) - (b.y + (b.d || 0)));
    const minTree = 1.2 / z; // trees smaller than ~1px radius aren't worth drawing
    const now = performance.now();
    for (const it of items) {
      const [sx, sy] = R.toScreen(it.x, it.y);
      if (it.type === "tree") {
        if (it.s < minTree) continue;
        const g = it.grow ? CP.clamp((now - it.grow) / 1200, 0.05, 1) : 1;
        S.tree(ctx, sx, sy, it.s * g, it.hue, z);
      } else if (it.type === "box") {
        S.box(ctx, sx, sy, it.w * z, it.d * z, it.h * z * S.HF, it);
        if (it.stack && z > 0.9) smoke(sx + it.w * z * 0.8 + it.h * z * S.HF * 0.32, sy - it.h * z * S.HF, t, it.x);
      } else if (it.type === "service") {
        const p = it.p;
        const grow = p.built ? CP.clamp((now - p.built) / 600, 0, 1) : 1;
        ctx.save();
        ctx.translate(sx, sy - 15 * z);
        ctx.scale(1, CP.smooth(grow));
        S.service(ctx, p.type, 0, 0, z);
        ctx.restore();
        if (p.kind === "building" && z > 0.8 && grow >= 1) {
          // happy residents around new services
          const k = Math.floor(t * 0.8 + p.id);
          if (CP.hash(p.id, k, 5) < 0.5) bubbles.push([sx + (CP.hash(p.id, k, 6) - 0.5) * 60, sy - 40 * z - 20, "😊", (t * 0.8 + p.id) % 1]);
        }
      } else if (it.type === "landmark") {
        const [lx, ly] = R.toScreen(it.p.x, it.p.y);
        const ld = S.lowDetail;
        S.lowDetail = false;
        S.landmark(ctx, it.p.landmark, lx, ly, z, t);
        S.lowDetail = ld;
      } else if (it.type === "playground") {
        ctx.fillStyle = "#e9c46a"; ctx.fillRect(sx - 8 * z, sy - 6 * z, 16 * z, 12 * z);
        ctx.fillStyle = "#e63946"; ctx.fillRect(sx - 6 * z, sy - 9 * z, 3 * z, 9 * z);
        ctx.fillStyle = "#457b9d"; ctx.fillRect(sx + 2 * z, sy - 7 * z, 5 * z, 2 * z);
      } else if (it.type === "fountain") {
        ctx.fillStyle = "#a8dadc"; ctx.beginPath(); ctx.ellipse(sx, sy, 14 * z, 9 * z, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 5; i++) {
          const a = t * 3 + i * 1.3, r = ((t * 20 + i * 7) % 12) * z;
          ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r * 0.6, sy - 6 * z - Math.sin(a) * r * 0.3 - 8 * z, 1.4 * z, 0, 7); ctx.fill();
        }
      }
    }
    // landmark names at street level
    if (R.showLabels && z > 0.5) {
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const l of CP.LANDMARKS) {
        if (l.placement.removed) continue;
        const [sx, sy] = R.toScreen(l.pos[0], l.pos[1]);
        if (sx < -100 || sx > W + 100 || sy < -100 || sy > H + 200) continue;
        label(l.name, sx, sy + 30);
      }
    }
    // emoji bubbles on top
    ctx.font = `${Math.round(Math.min(22, 10 + z * 4))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [bx, by, e, ph] of bubbles) {
      ctx.globalAlpha = alpha * (0.35 + 0.65 * Math.sin(ph * Math.PI));
      ctx.fillText(e, bx, by - ph * 14);
    }
    ctx.globalAlpha = 1;
  }

  function label(text, sx, sy) {
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = "rgba(8,12,30,0.75)";
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - 9, w, 18, 9); ctx.fill();
    ctx.fillStyle = "#e8f1ff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sx, sy);
  }

  function smoke(sx, sy, t, seed) {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.5 + i / 4 + seed * 0.001) % 1;
      ctx.fillStyle = `rgba(200,200,200,${0.5 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(sx + ph * 18, sy - ph * 40, 3 + ph * 10, 0, 7); ctx.fill();
    }
  }

  const CAR_COLORS = ["#e63946", "#1d3557", "#f1faee", "#457b9d", "#2a9d8f", "#e9c46a", "#264653", "#bdbdbd", "#111111"];
  function drawAgents(x0, y0, x1, y1, t, bubbles) {
    const z = R.cam.z;
    const B = world.BLOCK;
    let budget = z < 1.3 ? 320 : 450;
    const lines = [];
    for (let k = Math.floor(y0 / B); k <= Math.ceil(y1 / B); k++) lines.push([true, k]);
    for (let k = Math.floor(x0 / B); k <= Math.ceil(x1 / B); k++) lines.push([false, k]);
    const showFaces = z > 0.9;
    for (const [horiz, k] of lines) {
      const fixed = k * B;
      const a0 = horiz ? x0 : y0, a1 = horiz ? x1 : y1;
      // lanes: [offset from road centre, direction, speed m/s, spacing m, kind]
      const lanes = [[-3.2, 1, 11, 55, "car"], [3.2, -1, 10, 60, "car"], [-8.5, 1, 1.4, 16, "ped"], [8.5, -1, 1.3, 18, "ped"]];
      for (let li = 0; li < lanes.length && budget > 0; li++) {
        const [off, dir, v, sp, kind] = lanes[li];
        const shift = t * v * dir;
        const n0 = Math.floor((a0 - shift) / sp) - 1, n1 = Math.ceil((a1 - shift) / sp) + 1;
        for (let n = n0; n <= n1 && budget > 0; n++) {
          const seed = CP.hash(n, k * 7 + li, horiz ? 1 : 2);
          const a = n * sp + shift + seed * sp * 0.6;
          const wx = horiz ? a : fixed + off, wy = horiz ? fixed + off : a;
          // only on real streets: the block beside this lane must be urban
          const blk = world.block(Math.floor(wx / B), Math.floor((horiz ? wy - off * 2 : wy) / B));
          if (!blk.t || blk.ground === "water" || blk.ground === "farm") continue;
          const m = moodOf(blk.t);
          if (seed > m.density * (kind === "car" ? 0.9 : 1)) continue;
          const [sx, sy] = R.toScreen(wx, wy);
          if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
          budget--;
          if (kind === "car") {
            const amb = CP.hash(n, k, 99) < m.amb;
            S.car(ctx, sx, sy, z, horiz, dir, CAR_COLORS[Math.floor(seed * 1000) % CAR_COLORS.length], t, amb);
          } else {
            const r2 = CP.hash(n, k * 3 + li, 7);
            const sick = r2 < m.sick;
            const kid = !sick && CP.hash(n, k, 13) < m.kids * 1.4;
            // sick people stumble and walk slower
            const wob = sick ? Math.sin(t * 3 + n) * 1.5 : 0;
            const [px, py] = horiz ? [sx, sy + wob * z] : [sx + wob * z, sy];
            S.person(ctx, px, py, z, seed, t, { sick, kid });
            if (showFaces) {
              const win = Math.floor(t / 3 + seed * 5);
              const ph = (t / 3 + seed * 5) % 1;
              const roll = CP.hash(n, win, k);
              if (sick && roll < 0.35) bubbles.push([px, py - 22 * Math.min(1.6, z * 0.7), roll < 0.15 ? "🤒" : "🤧", ph]);
              else if (!sick && roll < m.happy * 0.5) bubbles.push([px, py - 22 * Math.min(1.6, z * 0.7), roll < m.happy * 0.25 ? "😊" : "😄", ph]);
              else if (!sick && roll > 1 - m.sad * 0.2) bubbles.push([px, py - 22 * Math.min(1.6, z * 0.7), "😟", ph]);
            }
          }
        }
      }
    }
  }

  function drawMarkers(alpha, t) {
    if (alpha <= 0.02) return;
    const z = R.cam.z;
    ctx.globalAlpha = alpha;
    const size = CP.clamp(z * 900, 9, 26);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const now = performance.now();
    for (const p of sim.placements) {
      if (p.removed || p.kind === "zone" || p.kind === "landmark") continue;
      const [sx, sy] = R.toScreen(p.x, p.y);
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
      if (p.kind === "existing") {
        if (z < 0.12) continue;
        ctx.fillStyle = "rgba(10,16,38,0.7)";
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill();
        ctx.fillStyle = CP.BUILDINGS[p.type].color;
        ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 7); ctx.fill();
        continue;
      }
      const spec = CP.BUILDINGS[p.type];
      if (p.type === "trees") {
        ctx.fillStyle = "rgba(47,158,68,0.75)";
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, 60 * z), 0, 7); ctx.fill();
        continue;
      }
      const pop = CP.clamp((now - p.built) / 400, 0, 1);
      const s = size * (spec.big ? 1.4 : 1) * (0.6 + 0.4 * CP.smooth(pop)) * (pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.4 : 1);
      if (p.type === "park") {
        ctx.fillStyle = "rgba(82,194,122,0.6)";
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(s * 0.6, 150 * z), 0, 7); ctx.fill();
      }
      ctx.fillStyle = "rgba(8,12,30,0.85)";
      ctx.beginPath(); ctx.arc(sx, sy, s * 0.72, 0, 7); ctx.fill();
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.font = `${Math.round(s * 0.8)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
      ctx.fillText(spec.icon, sx, sy + 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawLandmarkPins(z) {
    const a = CP.clamp((0.5 - z) / 0.2, 0, 1) * CP.clamp((z - 0.009) / 0.006, 0, 1);
    if (a <= 0.02) return;
    ctx.globalAlpha = a;
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const l of CP.LANDMARKS) {
      if (l.placement.removed) continue;
      const [sx, sy] = R.toScreen(l.pos[0], l.pos[1]);
      ctx.fillStyle = l.service === "hospital" ? "#ff5c7a" : "#ffd166";
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = "#0b1020"; ctx.lineWidth = 1.5; ctx.stroke();
      if (z > 0.035 || l.service === "hospital" || l.kind === "calgaryTower") label(l.name, sx, sy - 14);
    }
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
        // shadow
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

  function drawPreview(t) {
    const p = R.preview;
    if (!p) return;
    const z = R.cam.z;
    const [sx, sy] = R.toScreen(p.x, p.y);
    if (p.radius) {
      const good = p.score >= 0;
      ctx.fillStyle = good ? "rgba(80,230,160,0.12)" : "rgba(255,80,110,0.14)";
      ctx.strokeStyle = good ? "rgba(80,230,160,0.9)" : "rgba(255,80,110,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(sx, sy, p.radius * z, 0, 7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.cell) {
      const [cx, cy] = R.toScreen(p.cell[0], p.cell[1]);
      ctx.fillStyle = p.color + "88";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.fillRect(cx, cy, CP.ZONE_CELL * z, CP.ZONE_CELL * z);
      ctx.strokeRect(cx, cy, CP.ZONE_CELL * z, CP.ZONE_CELL * z);
    }
    if (p.target) {
      const [tx, ty] = R.toScreen(p.target.x, p.target.y);
      ctx.strokeStyle = "#ff4d6d";
      ctx.lineWidth = 3;
      const r = 18 + Math.sin(t * 8) * 3;
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx - r * 0.7, ty - r * 0.7); ctx.lineTo(tx + r * 0.7, ty + r * 0.7); ctx.moveTo(tx + r * 0.7, ty - r * 0.7); ctx.lineTo(tx - r * 0.7, ty + r * 0.7); ctx.stroke();
    }
    if (p.icon) {
      ctx.globalAlpha = 0.85;
      ctx.font = `28px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.icon, sx, sy - 6 + Math.sin(t * 6) * 3);
      ctx.globalAlpha = 1;
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
      const x = sx + p.vx * p.t, y = sy + p.vy * p.t;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - CP.clamp((k - 0.6) / 0.4, 0, 1);
      if (p.text) {
        ctx.font = `800 ${p.size}px Inter, system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
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
