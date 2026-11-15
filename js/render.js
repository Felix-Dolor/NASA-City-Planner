// Frame renderer: orbit view -> satellite map of Calgary, district borders, equity overlay,
// isometric buildings, residents and particles.
(function () {
  const CP = window.CP;
  const sim = CP.sim, world = CP.world, S = CP.sprites, G = CP.GEO;
  const BOUNDS = window.CEI_DATA.bounds;

  const R = (CP.render = {
    cam: { x: 0, y: 0, z: 0.006, rot: 0 },
    overlayMetric: null, // index of the metric shown as band colours (Plan tab) or null
    particles: [],
    props: [], // extra scenery for the opening scene: {kind, x, y}
    hoverDistrict: null,
    focusDistricts: null, // districts outlined in gold (mission targets)
    preview: null, // ghost building under the cursor: {type, x, y, ok, why}
    showNeeds: false, // need icons above residents' heads
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
  R.maxZoom = 0.4;

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
  R.floatText = function (x, y, text, color, delay) {
    R.particles.push({ x, y, text, color, t: 0, life: 2.6, vx: 0, vy: -34, size: 17, delay: delay || 0 });
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
    ctx.drawImage(city.canvas, city.x0, city.y0, city.W * city.mpp, city.H * city.mpp);

    const near = CP.clamp((z - 0.1) / 0.25, 0, 1); // 0 from orbit, 1 close to the ground
    const map = CP.clamp((z - 0.008) / 0.006, 0, 1); // map furniture fades in as the city fills the view
    if (near > 0) drawGround(near);

    // equity overlay: each district filled with the band colour of the chosen metric
    if (R.overlayMetric !== null && map > 0) {
      ctx.globalAlpha = 0.62 * map * (1 - near * 0.4);
      for (const d of sim.districts) {
        ctx.fillStyle = CP.bandOf(d.score[R.overlayMetric]).color;
        ctx.fill(d.path, "evenodd");
      }
      ctx.globalAlpha = 1;
    }
    if (map > 0) {
      ctx.globalAlpha = map;
      drawWaterAndRoads(z);
      // CTrain lines
      ctx.lineCap = "round";
      for (const l of G.ctrain) {
        ctx.strokeStyle = l.color;
        ctx.lineWidth = Math.max(2 / z, 10);
        ctx.setLineDash([9 / z, 7 / z]);
        ctx.stroke(l.path);
      }
      ctx.setLineDash([]);
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
    if (R.hoverDistrict) {
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.fill(R.hoverDistrict.path, "evenodd");
      ctx.strokeStyle = "#5ee6ff";
      ctx.lineWidth = 4 / z;
      ctx.stroke(R.hoverDistrict.path);
    }
    if (R.focusDistricts && map > 0.5) {
      ctx.strokeStyle = "#ffd43b";
      ctx.lineWidth = (4 + Math.sin(t * 5) * 1.5) / z;
      for (const d of R.focusDistricts) ctx.stroke(d.path);
    }
    ctx.restore(); // planet clip

    // night side
    const shadowG = ctx.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
    shadowG.addColorStop(0, "rgba(0,0,20,0)");
    shadowG.addColorStop(0.75, "rgba(0,0,20,0)");
    shadowG.addColorStop(1, "rgba(0,0,30,0.55)");
    ctx.fillStyle = shadowG;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.fill();

    if (map > 0) {
      drawObjects(t, map);
      drawLabels(map * (1 - near));
    }

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
  // the fabric cells that are on screen and inside the city's bounding box
  function cellRange(pad) {
    const B = world.CELL;
    const [x0, y0, x1, y1] = visibleBounds(pad);
    return [
      Math.floor(Math.max(x0, BOUNDS[0]) / B), Math.floor(Math.max(y0, BOUNDS[1]) / B),
      Math.floor(Math.min(x1, BOUNDS[2]) / B), Math.floor(Math.min(y1, BOUNDS[3]) / B),
    ];
  }

  // Close to the ground the satellite texture is too coarse, so flat ground colours fade in over it.
  const GROUND = { lawn: "#93c06f", plaza: "#b4c29a", park: "#62ad52", lot: "#a9ad9f" };
  function drawGround(alpha) {
    const B = world.CELL;
    const [bx0, by0, bx1, by1] = cellRange(B * R.cam.z);
    ctx.globalAlpha = alpha * 0.9;
    for (let bx = bx0; bx <= bx1; bx++)
      for (let by = by0; by <= by1; by++) {
        const c = world.cell(bx, by);
        if (!GROUND[c.ground]) continue;
        ctx.fillStyle = GROUND[c.ground];
        ctx.fillRect(bx * B - 2, by * B - 2, B + 4, B + 4);
      }
    ctx.globalAlpha = 1;
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

  function nearBuilding(x, y, r) {
    for (const p of sim.buildings) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true;
    return false;
  }

  // everything that stands on the map, sorted back to front
  function drawObjects(t, alpha) {
    const z = R.cam.z;
    const items = [];
    if (z >= 0.045) { // the decorative city fabric only appears once you zoom in, so orbit stays uncluttered
      const [bx0, by0, bx1, by1] = cellRange(200);
      for (let bx = bx0; bx <= bx1; bx++)
        for (let by = by0; by <= by1; by++)
          for (const it of world.cell(bx, by).items) {
            if (nearBuilding(it.x, it.y, it.type === "amb" ? 1150 : 800)) continue; // keep player buildings unobstructed
            items.push(it);
          }
    }
    if (z >= 0.03) for (const l of CP.LANDMARKS) items.push({ type: "lm", l, x: l.pos[0], y: l.pos[1] + 60 });
    for (const p of sim.buildings) items.push({ type: "bld", p, x: p.x, y: p.y });
    for (const p of R.props) items.push({ type: "prop", p, x: p.x, y: p.y });
    for (const r of CP.residents.list) if (!r.hidden) items.push({ type: "res", r, x: r.x, y: r.y });
    items.sort((a, b) => a.y - b.y);

    ctx.globalAlpha = alpha;
    const kA = z * 8, kB = S.buildScale(z), uR = S.residentScale(z);
    const now = performance.now();
    for (const it of items) {
      const [sx, sy] = R.toScreen(it.x, it.y);
      if (sx < -260 || sx > W + 260 || sy < -260 || sy > H + 420) continue;
      if (it.type === "tree") {
        if (it.s * z >= 1.3) S.tree(ctx, sx, sy, it.s, it.hue, z);
      } else if (it.type === "amb") {
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
      } else if (it.type === "prop") {
        if (it.p.kind === "house") S.ambient(ctx, it.p.it, sx, sy, z * 7);
        else if (it.p.kind === "tree") S.tree(ctx, sx, sy, it.p.s, it.p.hue, z);
        else S.prop(ctx, it.p.kind, sx, sy, z * 3);
      } else if (it.type === "res") {
        const r = it.r;
        S.resident(ctx, sx, sy, uR, r.look, { phase: r.phase, moving: r.moving, dir: r.dir, talk: r.talking ? t : 0 });
        if (R.showNeeds && r.icon) needIcon(sx, sy - 100 * uR * (r.look.extra.small ? 0.82 : 1) - 18 - Math.sin(t * 3 + r.d.id) * 2.5, r);
      }
    }
    // landmark dots from far away, names up close
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
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

  // small bubble above a resident's head showing which metric they need (or a heart when thankful)
  function needIcon(sx, sy, r) {
    const thanks = r.state !== "need";
    ctx.fillStyle = thanks ? "#d8f5a2" : "#ffffff";
    ctx.strokeStyle = "rgba(15,18,35,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(sx - 13, sy - 12, 26, 23, 9); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 4, sy + 10.5); ctx.lineTo(sx, sy + 16); ctx.lineTo(sx + 4, sy + 10.5); ctx.closePath();
    ctx.fill();
    ctx.font = '13px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(r.icon, sx, sy + 0.5);
  }

  function label(text, sx, sy, dot) {
    const w = ctx.measureText(text).width + 14 + (dot ? 14 : 0);
    ctx.fillStyle = "rgba(8,12,30,0.8)";
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - 10, w, 20, 10); ctx.fill();
    if (dot) {
      ctx.fillStyle = dot;
      ctx.beginPath(); ctx.arc(sx - w / 2 + 11, sy, 5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#e8f1ff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sx + (dot ? 7 : 0), sy);
  }

  // district names (with the band colour of the chosen metric while the overlay is on)
  function drawLabels(alpha) {
    if (alpha <= 0.02) return;
    ctx.globalAlpha = alpha;
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const d of sim.districts) {
      const [sx, sy] = R.toScreen(d.label[0], d.label[1]);
      label(d.name, sx, sy + 16, R.overlayMetric !== null ? CP.bandOf(d.score[R.overlayMetric]).color : null);
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

  // ghost of the selected building under the cursor; red and crossed out when the spot isn't allowed (the tooltip says why)
  function drawPreview(t) {
    const p = R.preview;
    if (!p) return;
    const k = S.buildScale(R.cam.z);
    const [sx, sy] = R.toScreen(p.x, p.y);
    ctx.globalAlpha = p.ok ? 0.78 + Math.sin(t * 5) * 0.08 : 0.45;
    S.building(ctx, p.type, sx, sy, k, t, { ring: p.ok ? "#4ef0a0" : "#ff4d6d" });
    ctx.globalAlpha = 1;
    if (!p.ok) {
      const r = 20;
      ctx.strokeStyle = "#ff4d6d";
      ctx.lineWidth = 5;
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
