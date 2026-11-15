// Over-the-top disaster art drawn on the map: a house in tall flames, a huge roaming tornado, a flood
// lake with floating debris, storm and rain clouds, lightning strikes, earthquake cracks and a collapse.
// S.disaster(ctx, dis, sx, sy, s, t): (sx, sy) = ground point on screen, s = screen px per design unit.
// Returns the screen box [x0, y0, x1, y1] used for clicking.
(function () {
  const CP = window.CP;
  const S = CP.sprites;
  const TAU = Math.PI * 2;

  function glow(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, CP.hexA(col, a));
    g.addColorStop(1, CP.hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // one flickering tongue of fire, base centred on (x, y)
  function flame(ctx, x, y, w, h, sway, cols) {
    const g = ctx.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, cols[0]); g.addColorStop(0.45, cols[1]); g.addColorStop(1, cols[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.bezierCurveTo(x - w * 0.7, y - h * 0.45, x + sway - w * 0.2, y - h * 0.7, x + sway, y - h);
    ctx.bezierCurveTo(x + sway + w * 0.15, y - h * 0.65, x + w * 0.75, y - h * 0.45, x + w / 2, y);
    ctx.quadraticCurveTo(x, y + w * 0.25, x - w / 2, y);
    ctx.fill();
  }
  function fireBlaze(ctx, x, y, width, height, s, t, seed) {
    const n = 7;
    const layers = [
      [1, ["rgba(255,60,0,0.95)", "rgba(255,90,0,0.85)", "rgba(200,20,0,0)"]],
      [0.72, ["rgba(255,170,0,1)", "rgba(255,130,0,0.9)", "rgba(255,80,0,0)"]],
      [0.42, ["rgba(255,255,220,1)", "rgba(255,230,90,0.95)", "rgba(255,200,0,0)"]],
    ];
    for (const [k, cols] of layers)
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const bx = x - width / 2 + f * width;
        const centre = 1 - Math.abs(f - 0.5) * 1.3;
        const fl = 0.78 + 0.22 * Math.sin(t * 11 + i * 1.7 + seed) + 0.12 * Math.sin(t * 23 + i * 3.1);
        const h = height * centre * fl * k;
        flame(ctx, bx, y, (width / n) * 1.9 * k, h, Math.sin(t * 7 + i) * 10 * s, cols);
      }
  }
  function smokeColumn(ctx, x, y, s, t, seed, height, dark) {
    for (let i = 0; i < 9; i++) {
      const k = (t * 0.22 + i / 9 + seed * 0.07) % 1;
      const px = x + (k * 70 + Math.sin(k * 7 + seed) * 14) * s;
      const py = y - k * height * s;
      ctx.fillStyle = dark ? `rgba(40,36,38,${0.62 * (1 - k)})` : `rgba(150,145,140,${0.5 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(px, py, (18 + k * 46) * s, 0, TAU); ctx.fill();
    }
  }
  function cloud(ctx, x, y, w, s, t, col, dark) {
    const puffs = [[-0.42, 0.1, 0.3], [-0.2, -0.12, 0.36], [0.05, -0.18, 0.4], [0.3, -0.06, 0.34], [0.46, 0.12, 0.26], [0, 0.14, 0.38]];
    ctx.fillStyle = dark;
    for (const [dx, dy, r] of puffs) { ctx.beginPath(); ctx.arc(x + dx * w + Math.sin(t * 0.8 + dx * 5) * 4 * s, y + dy * w * 0.5 + 10 * s, r * w * 0.55, 0, TAU); ctx.fill(); }
    ctx.fillStyle = col;
    for (const [dx, dy, r] of puffs) { ctx.beginPath(); ctx.arc(x + dx * w + Math.sin(t * 0.8 + dx * 5) * 4 * s, y + dy * w * 0.5, r * w * 0.5, 0, TAU); ctx.fill(); }
  }
  function rain(ctx, x, y0, y1, w, s, t, n, slant, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const fx = CP.hash(i, 3, 9) - 0.5;
      const k = (t * 1.6 + CP.hash(i, 7, 2)) % 1;
      const yy = y0 + (y1 - y0) * k;
      const xx = x + fx * w + slant * (yy - y0) * 0.35;
      ctx.moveTo(xx, yy); ctx.lineTo(xx + slant * 9 * s, yy + 22 * s);
    }
    ctx.stroke();
  }
  function bolt(ctx, x0, y0, x1, y1, s, seed, a) {
    const pts = [[x0, y0]];
    const n = 9;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      pts.push([CP.lerp(x0, x1, f) + (CP.hash(i, seed, 5) - 0.5) * 60 * s, CP.lerp(y0, y1, f)]);
    }
    pts.push([x1, y1]);
    ctx.lineJoin = "miter";
    for (const [wd, col] of [[16, `rgba(160,190,255,${0.35 * a})`], [7, `rgba(220,235,255,${0.9 * a})`], [2.5, `rgba(255,255,255,${a})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wd * s;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    }
  }
  function sparks(ctx, x, y, s, t, n, col) {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const k = (t * 1.8 + CP.hash(i, 1, 4)) % 1;
      const a = CP.hash(i, 2, 4) * Math.PI - Math.PI;
      const r = k * 60 * s;
      ctx.globalAlpha = (1 - k) * ctx.globalAlpha;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9 + k * k * 40 * s, 3 * s, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function house(ctx, x, y, s, wall, roof) {
    S.ambient(ctx, { kind: "house", wall, roof, h: 14 }, x, y, 2.1 * s);
  }
  function pole(ctx, x, y, s, lean) {
    ctx.strokeStyle = "#5b4630"; ctx.lineWidth = 6 * s; ctx.lineCap = "round";
    const tx = x + lean * 60 * s, ty = y - 120 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.moveTo(tx - 26 * s, ty + 10 * s); ctx.lineTo(tx + 26 * s, ty + 4 * s); ctx.stroke();
    ctx.fillStyle = "#7d8792"; ctx.fillRect(tx - 9 * s, ty + 12 * s, 18 * s, 22 * s);
    return [tx, ty];
  }
  function blob(ctx, x, y, rx, ry, seed, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU;
      const k = 0.78 + 0.32 * CP.hash(i % 24, seed, 13);
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  const D = {};

  D.fire = (ctx, x, y, s, t, dis) => {
    glow(ctx, x, y - 40 * s, 230 * s, "#ff7a00", 0.55 + 0.1 * Math.sin(t * 9));
    smokeColumn(ctx, x, y - 160 * s, s, t, dis.id, 300, true);
    house(ctx, x, y, s, "#5a4a42", "#2e2420");
    fireBlaze(ctx, x, y - 20 * s, 170 * s, 340 * s, s, t, dis.id);
    // embers
    ctx.fillStyle = "#ffd36b";
    for (let i = 0; i < 14; i++) {
      const k = (t * 0.6 + CP.hash(i, 5, dis.id) ) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(x + (CP.hash(i, 6, 1) - 0.5) * 160 * s + Math.sin(t * 3 + i) * 12 * s, y - 60 * s - k * 300 * s, 3.2 * s, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return [x - 120 * s, y - 380 * s, x + 120 * s, y + 30 * s];
  };

  D.tornado = (ctx, x, y, s, t) => {
    const H = 380 * s, N = 30;
    // dust ring at the base
    for (let i = 0; i < 10; i++) {
      const a = t * 3 + (i / 10) * TAU;
      ctx.fillStyle = `rgba(150,125,95,${0.45})`;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 70 * s, y + Math.sin(a) * 18 * s, 38 * s, 20 * s, 0, 0, TAU); ctx.fill();
    }
    const cx = (f) => x + Math.sin(t * 1.7 + f * 3.2) * 34 * s * f + Math.sin(t * 0.9) * 10 * s;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const r = (12 + Math.pow(f, 1.7) * 135) * s;
      const yy = y - f * H;
      const g = ctx.createLinearGradient(cx(f) - r, 0, cx(f) + r, 0);
      g.addColorStop(0, "rgba(70,74,84,0.92)"); g.addColorStop(0.55, "rgba(150,155,165,0.9)"); g.addColorStop(1, "rgba(95,100,110,0.92)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx(f), yy, r, r * 0.28 + 4 * s, 0, 0, TAU); ctx.fill();
    }
    // spinning streaks
    ctx.strokeStyle = "rgba(235,238,245,0.55)";
    ctx.lineWidth = 2.5 * s;
    for (let i = 0; i < N; i += 2) {
      const f = i / N, r = (12 + Math.pow(f, 1.7) * 135) * s, a = t * 9 + i;
      ctx.beginPath(); ctx.ellipse(cx(f), y - f * H, r * 0.92, (r * 0.28 + 4 * s) * 0.9, 0, a % TAU, (a % TAU) + 1.6); ctx.stroke();
    }
    cloud(ctx, cx(1), y - H - 10 * s, 380 * s, s, t, "#5d6270", "#3c404b");
    // debris flying around the funnel, including one very surprised cow
    for (let i = 0; i < 9; i++) {
      const f = 0.15 + (i / 9) * 0.75;
      const a = t * (3 + i * 0.3) + i * 2.1;
      const r = (40 + Math.pow(f, 1.7) * 150) * s;
      const px = cx(f) + Math.cos(a) * r, py = y - f * H + Math.sin(a) * r * 0.28;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a * 1.3);
      if (i === 4) {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(0, 0, 16 * s, 10 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(-5 * s, -2 * s, 4 * s, 0, TAU); ctx.arc(6 * s, 3 * s, 3 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(17 * s, -5 * s, 6 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = "#222"; [-10, -3, 4, 11].forEach((lx) => ctx.fillRect(lx * s, 8 * s, 3 * s, 7 * s));
      } else if (i % 3 === 0) {
        ctx.fillStyle = "#c0504d"; ctx.fillRect(-14 * s, -7 * s, 28 * s, 12 * s);
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(-8 * s, 6 * s, 4 * s, 0, TAU); ctx.arc(8 * s, 6 * s, 4 * s, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = i % 2 ? "#8c5a3c" : "#a9a9a9"; ctx.fillRect(-16 * s, -3 * s, 32 * s, 6 * s);
      }
      ctx.restore();
    }
    return [x - 170 * s, y - H - 60 * s, x + 170 * s, y + 30 * s];
  };

  D.flood = (ctx, x, y, s, t, dis) => {
    blob(ctx, x, y, 230 * s, 105 * s, dis.id, "rgba(30,110,200,0.55)");
    blob(ctx, x, y, 190 * s, 85 * s, dis.id + 3, "rgba(55,140,225,0.75)");
    // rings of ripples
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2.5 * s;
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.45 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(x, y, (40 + k * 170) * s, (16 + k * 75) * s, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const bob = (i) => Math.sin(t * 2.2 + i) * 5 * s;
    // a house drowned up to its roof, a floating car and a barrel
    const p = S.pen(ctx, x - 50 * s, y - 10 * s + bob(0), 2.2 * s);
    p.gable(-16, -14, 0, 32, 28, 12, "#a9746e", "#f2e6d0");
    ctx.save(); ctx.translate(x + 85 * s, y + 20 * s + bob(1)); ctx.rotate(Math.sin(t * 1.3) * 0.18);
    ctx.fillStyle = "#e03131"; ctx.beginPath(); ctx.roundRect(-30 * s, -12 * s, 60 * s, 18 * s, 6 * s); ctx.fill();
    ctx.fillStyle = "#a5d8ff"; ctx.fillRect(-16 * s, -22 * s, 30 * s, 11 * s);
    ctx.restore();
    ctx.fillStyle = "#c98a1b"; ctx.beginPath(); ctx.ellipse(x - 130 * s, y + 35 * s + bob(2), 11 * s, 14 * s, 0, 0, TAU); ctx.fill();
    // waves and splash
    ctx.strokeStyle = "#e7f5ff"; ctx.lineWidth = 3.5 * s; ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const wx = x + (CP.hash(i, 8, dis.id) - 0.5) * 300 * s, wy = y + (CP.hash(i, 9, dis.id) - 0.5) * 130 * s + Math.sin(t * 3 + i) * 4 * s;
      ctx.beginPath(); ctx.arc(wx, wy, 12 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    return [x - 220 * s, y - 110 * s, x + 220 * s, y + 100 * s];
  };

  function stormish(ctx, x, y, s, t, dis, heavy) {
    const cy = y - 260 * s;
    rain(ctx, x, cy + 30 * s, y + 20 * s, 300 * s, s, t, heavy ? 90 : 60, heavy ? 0.25 : 0.9, "rgba(190,215,255,0.8)");
    cloud(ctx, x, cy, 360 * s, s, t, heavy ? "#7a8394" : "#4a4f63", heavy ? "#5a6273" : "#2d3142");
    return cy;
  }

  D.storm = (ctx, x, y, s, t, dis) => {
    // trees bent flat by the wind and a downed power line throwing sparks
    for (const [dx, k] of [[-120, 1], [-70, 0.8], [110, 0.9]]) {
      const bend = 0.6 + Math.sin(t * 5 + dx) * 0.2;
      ctx.strokeStyle = "#6b4f2a"; ctx.lineWidth = 6 * s * k;
      ctx.beginPath(); ctx.moveTo(x + dx * s, y); ctx.quadraticCurveTo(x + dx * s + 10 * s, y - 40 * s * k, x + dx * s + bend * 50 * s, y - 60 * s * k); ctx.stroke();
      ctx.fillStyle = "#2f9e44"; ctx.beginPath(); ctx.ellipse(x + dx * s + bend * 60 * s, y - 68 * s * k, 30 * s * k, 18 * s * k, 0.5, 0, TAU); ctx.fill();
    }
    const [tx, ty] = pole(ctx, x + 20 * s, y, s, 0.45);
    sparks(ctx, tx, ty + 20 * s, s, t, 10, "#ffe066");
    const cy = stormish(ctx, x, y, s, t, dis, false);
    const flash = (t * 0.8 + dis.id * 0.37) % 1;
    if (flash < 0.12) bolt(ctx, x - 40 * s, cy + 20 * s, x - 100 * s, y - 10 * s, s, Math.floor(t * 0.8) + dis.id, 1 - flash / 0.12);
    return [x - 190 * s, cy - 110 * s, x + 190 * s, y + 30 * s];
  };

  D.rain = (ctx, x, y, s, t, dis) => {
    blob(ctx, x, y + 10 * s, 170 * s, 70 * s, dis.id, "rgba(60,140,220,0.55)");
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.9 + i / 5) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 2 * s;
      const px = x + (CP.hash(i, 1, dis.id) - 0.5) * 240 * s, py = y + (CP.hash(i, 2, dis.id) - 0.3) * 80 * s;
      ctx.beginPath(); ctx.ellipse(px, py, (6 + k * 30) * s, (3 + k * 12) * s, 0, 0, TAU); ctx.stroke();
    }
    house(ctx, x - 40 * s, y, s, "#e8d8c3", "#5d6d7e");
    house(ctx, x + 60 * s, y + 20 * s, s, "#d9d4cc", "#8c5a3c");
    ctx.fillStyle = "rgba(40,120,210,0.6)";
    ctx.fillRect(x - 100 * s, y - 14 * s, 220 * s, 34 * s);
    const cy = stormish(ctx, x, y, s, t, dis, true);
    return [x - 190 * s, cy - 110 * s, x + 190 * s, y + 60 * s];
  };

  D.lightning = (ctx, x, y, s, t, dis) => {
    const cy = y - 280 * s;
    cloud(ctx, x, cy, 330 * s, s, t, "#3d4157", "#25283a");
    const [tx, ty] = pole(ctx, x, y, s, 0);
    const cyc = (t * 1.6 + dis.id * 0.3) % 1;
    if (cyc < 0.35) {
      const a = 1 - cyc / 0.35;
      glow(ctx, tx, ty, 220 * s, "#fff3a0", 0.55 * a);
      bolt(ctx, x - 30 * s, cy + 30 * s, tx, ty, s, Math.floor(t * 1.6) + dis.id, a);
    }
    glow(ctx, tx, ty + 20 * s, 70 * s, "#ffd43b", 0.5 + 0.3 * Math.sin(t * 20));
    sparks(ctx, tx, ty + 20 * s, s, t, 16, "#fff3a0");
    // dark shop windows
    S.ambient(ctx, { kind: "shops", wall: "#6b6e76", roof: "#3c3f46" }, x + 110 * s, y + 10 * s, 2.2 * s);
    return [x - 170 * s, cy - 100 * s, x + 170 * s, y + 40 * s];
  };

  D.earthquake = (ctx, x, y, s, t, dis) => {
    const shake = Math.sin(t * 47) * 4 * s + Math.sin(t * 31) * 2 * s;
    x += shake;
    // cracks radiating out of the ground, glowing from below
    for (let c = 0; c < 6; c++) {
      const a0 = (c / 6) * TAU + CP.hash(c, 1, dis.id);
      const len = (140 + CP.hash(c, 2, dis.id) * 110) * (0.85 + 0.15 * Math.sin(t * 2 + c));
      const pts = [[x, y]];
      for (let i = 1; i <= 6; i++) {
        const f = i / 6, a = a0 + (CP.hash(c, i, dis.id + 7) - 0.5) * 0.7;
        pts.push([x + Math.cos(a) * len * f * s, y + Math.sin(a) * len * f * s * 0.45]);
      }
      for (const [w, col] of [[14, "rgba(255,120,40,0.45)"], [8, "#1c1410"], [3, "#ff8a3d"]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * s; ctx.lineJoin = "miter";
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
    }
    ctx.save(); ctx.translate(x + 70 * s, y - 10 * s); ctx.rotate(0.22 + Math.sin(t * 13) * 0.03);
    house(ctx, 0, 0, s, "#e0cda9", "#7a6a5a");
    ctx.restore();
    // bouncing rubble and dust
    for (let i = 0; i < 10; i++) {
      const k = (t * 1.3 + CP.hash(i, 3, dis.id)) % 1;
      const px = x + (CP.hash(i, 4, dis.id) - 0.5) * 260 * s, py = y - Math.sin(k * Math.PI) * 60 * s;
      ctx.fillStyle = i % 2 ? "#8d8279" : "#6f655d";
      ctx.fillRect(px - 7 * s, py - 7 * s, 14 * s, 11 * s);
    }
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.5 + i / 6) % 1;
      ctx.fillStyle = `rgba(190,170,140,${0.45 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(x + (CP.hash(i, 5, dis.id) - 0.5) * 240 * s, y - k * 90 * s, (20 + k * 30) * s, 0, TAU); ctx.fill();
    }
    return [x - 220 * s, y - 150 * s, x + 220 * s, y + 90 * s];
  };

  D.collapse = (ctx, x, y, s, t, dis) => {
    // what's left of the block: a broken stub, a heap of rubble and a huge dust cloud
    const p = S.pen(ctx, x + 40 * s, y - 10 * s, 2.4 * s);
    p.box(-18, -15, 0, 36, 30, 34, "#cfc4b5", "#9a8f80", { win: true });
    p.poly([[-18, 15, 34], [18, 15, 34], [18, 15, 46], [6, 15, 40], [-6, 15, 50], [-18, 15, 42]], "#bfb3a3");
    for (let i = 0; i < 16; i++) {
      const px = x + (CP.hash(i, 1, dis.id) - 0.6) * 200 * s, py = y + (CP.hash(i, 2, dis.id) - 0.3) * 50 * s;
      ctx.save(); ctx.translate(px, py); ctx.rotate(CP.hash(i, 3, dis.id) * 3);
      ctx.fillStyle = ["#9c9186", "#b7aa9b", "#7a7068", "#c9bfb2"][i % 4];
      ctx.fillRect(-16 * s, -9 * s, 32 * s, 18 * s);
      ctx.restore();
    }
    smokeColumn(ctx, x - 20 * s, y - 20 * s, s * 1.3, t * 0.7, dis.id, 220, false);
    fireBlaze(ctx, x - 50 * s, y, 60 * s, 90 * s, s, t, dis.id);
    return [x - 170 * s, y - 280 * s, x + 170 * s, y + 50 * s];
  };

  S.disasterScale = (z) => CP.clamp(z * 6, 0.55, 2.2);
  S.disaster = function (ctx, dis, sx, sy, s, t) {
    // pulsing danger ring on the ground
    const pr = (150 + Math.sin(t * 5) * 14) * s;
    ctx.strokeStyle = `rgba(255,40,60,${0.65 + 0.3 * Math.sin(t * 5)})`;
    ctx.lineWidth = 4 * s;
    ctx.setLineDash([14 * s, 10 * s]);
    ctx.lineDashOffset = -t * 40 * s;
    ctx.beginPath(); ctx.ellipse(sx, sy, pr * 1.3, pr * 0.5, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    return (D[dis.key] || D.fire)(ctx, sx, sy, s, t, dis);
  };
})();
