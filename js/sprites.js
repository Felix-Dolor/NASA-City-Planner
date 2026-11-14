// Pseudo-3D (oblique, RCT-style) drawing primitives, Calgary landmarks, buildings and agents.
(function () {
  const CP = window.CP;
  const S = (CP.sprites = {});
  const HF = 0.62; // screen px per metre of height (relative to zoom)
  const OX = 0.32; // sideways lean of the oblique projection
  S.HF = HF;

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = CP.clamp(((n >> 16) & 255) * k, 0, 255), g = CP.clamp(((n >> 8) & 255) * k, 0, 255), b = CP.clamp((n & 255) * k, 0, 255);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  S.shade = shade;

  // generic extruded box. (sx,sy) top-left of footprint in screen px, w/d in px, hz = height px
  S.box = function (ctx, sx, sy, w, d, hz, o) {
    const ox = hz * OX, oy = -hz;
    const wall = o.glass || o.wall || "#ddd";
    if (S.lowDetail) {
      ctx.fillStyle = shade(wall, 0.85);
      ctx.fillRect(sx, sy + d + oy, w + ox, -oy);
      ctx.fillStyle = o.roof || wall;
      ctx.fillRect(sx + ox, sy + oy, w, d);
      return;
    }
    // shadow
    ctx.fillStyle = "rgba(20,30,40,0.22)";
    ctx.beginPath();
    ctx.moveTo(sx + w, sy);
    ctx.lineTo(sx + w + hz * 0.55, sy + hz * 0.18);
    ctx.lineTo(sx + w + hz * 0.55, sy + d + hz * 0.18);
    ctx.lineTo(sx + hz * 0.55, sy + d + hz * 0.18);
    ctx.lineTo(sx, sy + d);
    ctx.closePath();
    ctx.fill();
    if (hz < 0.5) {
      ctx.fillStyle = o.roof || wall;
      ctx.fillRect(sx, sy, w, d);
      return;
    }
    // east face
    ctx.fillStyle = shade(wall, 0.72);
    ctx.beginPath();
    ctx.moveTo(sx + w, sy); ctx.lineTo(sx + w, sy + d); ctx.lineTo(sx + w + ox, sy + d + oy); ctx.lineTo(sx + w + ox, sy + oy);
    ctx.closePath(); ctx.fill();
    // south face
    ctx.fillStyle = shade(wall, 0.92);
    ctx.beginPath();
    ctx.moveTo(sx, sy + d); ctx.lineTo(sx + w, sy + d); ctx.lineTo(sx + w + ox, sy + d + oy); ctx.lineTo(sx + ox, sy + d + oy);
    ctx.closePath(); ctx.fill();
    // windows: one stripe per floor band (cheap) - skipped at low detail
    if (o.windows && !S.lowDetail && w > 10 && hz > 14) {
      const rows = Math.min(12, Math.floor(hz / 9));
      ctx.fillStyle = o.glass ? "rgba(255,255,255,0.22)" : "rgba(60,90,120,0.45)";
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        const f0 = (r + 0.3) / rows, f1 = (r + 0.75) / rows;
        ctx.moveTo(sx + ox * f0 + w * 0.06, sy + d + oy * f0);
        ctx.lineTo(sx + ox * f0 + w * 0.94, sy + d + oy * f0);
        ctx.lineTo(sx + ox * f1 + w * 0.94, sy + d + oy * f1);
        ctx.lineTo(sx + ox * f1 + w * 0.06, sy + d + oy * f1);
      }
      ctx.fill();
    }
    if (o.shop && hz > 6) {
      ctx.fillStyle = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#e9c46a"][(o.sign || 0) % 5];
      ctx.fillRect(sx + ox * 0.25, sy + d + oy * 0.25 - Math.max(2, hz * 0.08), w * 0.95, Math.max(2, hz * 0.1));
    }
    // roof
    ctx.fillStyle = o.roof || shade(wall, 1.05);
    ctx.fillRect(sx + ox, sy + oy, w, d);
    if (o.house && w > 6) {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(sx + ox, sy + oy + d / 2, w, d / 2);
    }
    if (o.industrial && w > 12) {
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(sx + ox + (w * i) / 6, sy + oy); ctx.lineTo(sx + ox + (w * i) / 6, sy + oy + d); ctx.stroke();
      }
    }
    if (o.glass && w > 8) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(sx + ox + 2, sy + oy + 2, w * 0.3, d - 4);
    }
  };

  S.tree = function (ctx, sx, sy, s, hue, z) {
    const r = s * z;
    if (S.lowDetail) {
      ctx.fillStyle = `rgb(${40 + hue * 30},${110 + hue * 60},${50 + hue * 20})`;
      ctx.fillRect(sx - r, sy - r * 2.4, r * 2, r * 2);
      return;
    }
    ctx.fillStyle = "rgba(20,40,20,0.25)";
    ctx.beginPath();
    ctx.ellipse(sx + r * 0.6, sy + r * 0.2, r * 1.1, r * 0.55, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(sx - r * 0.12, sy - r * 1.1, r * 0.24, r * 1.1);
    const g = 110 + hue * 60;
    ctx.fillStyle = `rgb(${40 + hue * 30},${g},${50 + hue * 20})`;
    ctx.beginPath();
    ctx.arc(sx, sy - r * 1.5, r, 0, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(sx - r * 0.3, sy - r * 1.8, r * 0.45, 0, 7);
    ctx.fill();
  };

  // ---------- landmarks ----------
  // each routine draws centred on (sx,sy) ground point at zoom z
  const LM = {};
  const boxC = (ctx, sx, sy, z, w, d, h, o) => S.box(ctx, sx - (w * z) / 2, sy - (d * z) / 2, w * z, d * z, h * z * HF, o);

  LM.calgaryTower = (ctx, sx, sy, z, t) => {
    const H = 191 * z * HF;
    ctx.fillStyle = "rgba(20,30,40,0.25)";
    ctx.beginPath(); ctx.ellipse(sx + H * 0.3, sy + H * 0.1, H * 0.35, 5 * z, 0.3, 0, 7); ctx.fill();
    const lean = OX;
    // tapering shaft
    ctx.fillStyle = "#d9d2c5";
    ctx.beginPath();
    ctx.moveTo(sx - 9 * z, sy); ctx.lineTo(sx + 9 * z, sy);
    ctx.lineTo(sx + 5 * z + H * 0.82 * lean, sy - H * 0.82); ctx.lineTo(sx - 5 * z + H * 0.82 * lean, sy - H * 0.82);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b9b0a2";
    ctx.beginPath();
    ctx.moveTo(sx + 2 * z, sy); ctx.lineTo(sx + 9 * z, sy); ctx.lineTo(sx + 5 * z + H * 0.82 * lean, sy - H * 0.82); ctx.lineTo(sx + 1 * z + H * 0.82 * lean, sy - H * 0.82);
    ctx.closePath(); ctx.fill();
    // pod
    const px = sx + H * 0.86 * lean, py = sy - H * 0.86;
    ctx.fillStyle = "#c62828";
    ctx.beginPath(); ctx.ellipse(px, py, 15 * z, 6 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(px - 15 * z, py - 9 * z, 30 * z, 9 * z);
    ctx.fillStyle = "#2b4c6f";
    ctx.fillRect(px - 15 * z, py - 7 * z, 30 * z, 4 * z);
    ctx.fillStyle = "#c62828";
    ctx.beginPath(); ctx.ellipse(px, py - 9 * z, 15 * z, 5 * z, 0, 0, 7); ctx.fill();
    // flame/antenna
    ctx.strokeStyle = "#999"; ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.beginPath(); ctx.moveTo(px, py - 12 * z); ctx.lineTo(px + 6 * z * lean, py - 28 * z); ctx.stroke();
    const fl = (Math.sin(t * 9) + 1) * 0.5;
    ctx.fillStyle = `rgba(255,${150 + fl * 80},40,0.9)`;
    ctx.beginPath(); ctx.ellipse(px + 7 * z * lean, py - 31 * z - fl * 2 * z, 2.5 * z, 5 * z, 0, 0, 7); ctx.fill();
  };

  LM.bow = (ctx, sx, sy, z) => {
    const H = 236 * z * HF;
    const ox = H * OX;
    // crescent footprint opening south
    const crescent = (dx, dy, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sx + dx, sy + dy + 20 * z, 45 * z, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(sx + dx, sy + dy + 30 * z, 40 * z, Math.PI * 1.85, Math.PI * 1.15, true);
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = "rgba(20,30,40,0.22)";
    ctx.beginPath(); ctx.ellipse(sx + H * 0.35, sy + H * 0.08, H * 0.4, 18 * z, 0.2, 0, 7); ctx.fill();
    // extrude by stacking slices
    const steps = Math.max(6, Math.min(60, Math.floor(H / 4)));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      crescent(ox * f, -H * f, i === steps ? "#c5d9e8" : `rgb(${90 + f * 60},${130 + f * 60},${165 + f * 50})`);
    }
    // diagrid
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(sx - 40 * z + i * 10 * z, sy); ctx.lineTo(sx - 40 * z + i * 10 * z + ox, sy - H); ctx.stroke();
    }
  };

  LM.tower = (ctx, sx, sy, z, t, l) => boxC(ctx, sx, sy, z, l.w, l.d, l.h, { glass: l.color, roof: "#6d7a86", windows: true });

  LM.saddledome = (ctx, sx, sy, z) => {
    const H = 30 * z * HF, rx = 66 * z, ry = 50 * z, ox = H * OX;
    ctx.fillStyle = "rgba(20,30,40,0.22)";
    ctx.beginPath(); ctx.ellipse(sx + H * 0.5, sy + H * 0.2, rx, ry, 0, 0, 7); ctx.fill();
    // concrete drum: stacked ellipses
    for (let i = 0; i <= 8; i++) {
      const f = (i / 8) * 0.6;
      ctx.fillStyle = i === 8 ? "#9aa1a9" : `rgb(${110 + i * 6},${116 + i * 6},${124 + i * 6})`;
      ctx.beginPath(); ctx.ellipse(sx + ox * f, sy - H * f, rx, ry, 0, 0, 7); ctx.fill();
    }
    // saddle roof: corners high on the east & west, edges sagging to the north & south
    const cx = sx + ox, cy = sy - H;
    const g = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
    g.addColorStop(0, "#d9dde2"); g.addColorStop(0.5, "#b9bfc6"); g.addColorStop(1, "#e4e7ea");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.02, cy - H * 0.7);
    ctx.bezierCurveTo(cx - rx * 0.5, cy - ry * 0.7, cx + rx * 0.5, cy - ry * 0.7, cx + rx * 1.02, cy - H * 0.7);
    ctx.bezierCurveTo(cx + rx * 0.6, cy + ry * 1.05, cx - rx * 0.6, cy + ry * 1.05, cx - rx * 1.02, cy - H * 0.7);
    ctx.fill();
    ctx.strokeStyle = "#c8102e";
    ctx.lineWidth = Math.max(1.5, 3.5 * z);
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.02, cy - H * 0.7);
    ctx.bezierCurveTo(cx - rx * 0.6, cy + ry * 1.05, cx + rx * 0.6, cy + ry * 1.05, cx + rx * 1.02, cy - H * 0.7);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * rx * 0.25, cy - ry * 0.45); ctx.lineTo(cx + i * rx * 0.3, cy + ry * 0.7); ctx.stroke();
    }
  };

  LM.library = (ctx, sx, sy, z) => {
    const H = 28 * z * HF;
    ctx.fillStyle = "rgba(20,30,40,0.22)";
    ctx.beginPath(); ctx.ellipse(sx + H * 0.5, sy + H * 0.2, 70 * z, 35 * z, 0, 0, 7); ctx.fill();
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      ctx.fillStyle = i === 10 ? "#e8dcc8" : `rgb(${150 + f * 70},${120 + f * 70},${90 + f * 60})`;
      ctx.beginPath(); ctx.ellipse(sx + H * OX * f, sy - H * f, 70 * z, 32 * z, 0, 0, 7); ctx.fill();
    }
    // hex pattern
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(sx + H * OX + i * 18 * z - 8 * z, sy - H - 15 * z); ctx.lineTo(sx + H * OX + i * 18 * z + 8 * z, sy - H + 15 * z); ctx.stroke();
    }
  };

  LM.studioBell = (ctx, sx, sy, z) => {
    [-36, -18, 0, 18, 36].forEach((dx, i) => {
      const h = [30, 44, 40, 36, 26][i];
      boxC(ctx, sx + dx * z, sy + Math.sin(i) * 6 * z, z, 15, 22, h, { wall: "#a0522d", roof: "#7a3e22" });
    });
  };

  LM.peaceBridge = (ctx, sx, sy, z) => {
    const L = 130 * z, w = 9 * z, h = 6 * z * HF;
    ctx.fillStyle = "rgba(20,30,40,0.2)";
    ctx.fillRect(sx - w / 2 + 4 * z, sy - L / 2 + 2 * z, w, L);
    ctx.fillStyle = "#e0222b";
    ctx.beginPath();
    ctx.ellipse(sx, sy - h, w * 0.8, L / 2, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#ff7b7f"; ctx.lineWidth = Math.max(1, z);
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(sx - w * 0.8, sy - h + i * L / 14); ctx.lineTo(sx + w * 0.8, sy - h + i * L / 14 + 5 * z); ctx.stroke();
    }
  };

  LM.cityHall = (ctx, sx, sy, z) => {
    boxC(ctx, sx + 30 * z, sy, z, 60, 50, 50, { glass: "#5a7fa0", roof: "#45607a", windows: true });
    boxC(ctx, sx - 30 * z, sy + 10 * z, z, 40, 30, 18, { wall: "#c8a882", roof: "#7a4a35" });
    boxC(ctx, sx - 30 * z, sy + 10 * z, z, 8, 8, 40, { wall: "#c8a882", roof: "#7a4a35" });
  };

  LM.zoo = (ctx, sx, sy, z, t) => {
    ctx.fillStyle = "#5c9c4c";
    ctx.beginPath(); ctx.ellipse(sx, sy, 160 * z, 90 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a8a3c";
    ctx.beginPath(); ctx.ellipse(sx - 50 * z, sy + 10 * z, 50 * z, 30 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3d85c6";
    ctx.beginPath(); ctx.ellipse(sx + 60 * z, sy - 20 * z, 30 * z, 18 * z, 0, 0, 7); ctx.fill();
    if (z > 0.6) {
      ctx.font = `${Math.max(12, 14 * z)}px serif`;
      ctx.textAlign = "center";
      ["🦒", "🐧", "🦁", "🦖", "🐘"].forEach((e, i) => ctx.fillText(e, sx + Math.cos(t * 0.3 + i * 1.3) * 90 * z, sy + Math.sin(t * 0.4 + i) * 45 * z));
    }
  };

  LM.spark = (ctx, sx, sy, z) => {
    boxC(ctx, sx + 30 * z, sy, z, 50, 40, 14, { wall: "#e6e6e6", roof: "#2b9fd6" });
    const H = 18 * z * HF;
    ctx.fillStyle = "#cfd8dc";
    ctx.beginPath(); ctx.arc(sx - 30 * z + H * OX, sy - H, 28 * z, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#b0bec5";
    ctx.fillRect(sx - 58 * z, sy - H, 56 * z, H);
  };

  LM.stampede = (ctx, sx, sy, z, t) => {
    boxC(ctx, sx, sy, z, 130, 70, 18, { wall: "#d6c7a1", roof: "#b9a57a" });
    // ferris wheel on the midway
    const wx = sx + 110 * z, wy = sy - 10 * z, R = 26 * z, H = 30 * z * HF;
    ctx.strokeStyle = "#555"; ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.beginPath(); ctx.moveTo(wx - 12 * z, wy); ctx.lineTo(wx, wy - H); ctx.lineTo(wx + 12 * z, wy); ctx.stroke();
    ctx.strokeStyle = "#ffcc00";
    ctx.beginPath(); ctx.arc(wx, wy - H, R, 0, 7); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = t * 0.5 + (i * Math.PI) / 4;
      ctx.strokeStyle = "rgba(255,204,0,0.6)";
      ctx.beginPath(); ctx.moveTo(wx, wy - H); ctx.lineTo(wx + Math.cos(a) * R, wy - H + Math.sin(a) * R); ctx.stroke();
      ctx.fillStyle = ["#e63946", "#2a9d8f", "#457b9d", "#f4a261"][i % 4];
      ctx.fillRect(wx + Math.cos(a) * R - 3 * z, wy - H + Math.sin(a) * R, 6 * z, 5 * z);
    }
  };

  LM.stadium = (ctx, sx, sy, z) => {
    const H = 20 * z * HF;
    ctx.fillStyle = "#9e9e9e";
    ctx.beginPath(); ctx.ellipse(sx + H * OX, sy - H, 85 * z, 60 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#c62828";
    ctx.beginPath(); ctx.ellipse(sx + H * OX, sy - H, 72 * z, 48 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3f9b3f";
    ctx.fillRect(sx + H * OX - 50 * z, sy - H - 25 * z, 100 * z, 50 * z);
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(sx + H * OX - 50 * z + i * 10 * z, sy - H - 25 * z); ctx.lineTo(sx + H * OX - 50 * z + i * 10 * z, sy - H + 25 * z); ctx.stroke(); }
  };

  LM.campus = (ctx, sx, sy, z) => {
    [[-80, -40, 50, 40, 25], [0, -50, 60, 30, 40], [80, -30, 40, 50, 20], [-60, 50, 60, 35, 18], [40, 50, 70, 40, 30]].forEach(([dx, dy, w, d, h]) =>
      boxC(ctx, sx + dx * z, sy + dy * z, z, w, d, h, { wall: "#b5651d", roof: "#7a5230", windows: true }));
  };

  LM.hospital = (ctx, sx, sy, z, t, l) => {
    boxC(ctx, sx, sy, z, 110, 70, l.h, { wall: "#f4f6f8", roof: "#dfe6ec", windows: true });
    const H = l.h * z * HF;
    const rx = sx + H * OX, ry = sy - H;
    ctx.fillStyle = "#e53935";
    ctx.fillRect(rx - 4 * z, ry - 14 * z, 8 * z, 28 * z);
    ctx.fillRect(rx - 14 * z, ry - 4 * z, 28 * z, 8 * z);
    // helipad
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, z);
    ctx.beginPath(); ctx.arc(rx + 38 * z, ry, 10 * z, 0, 7); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(6, 11 * z)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("H", rx + 38 * z, ry);
  };

  LM.kidsHospital = (ctx, sx, sy, z) => {
    [["#e63946", -40, 0, 30], ["#f4a261", -10, -10, 36], ["#2a9d8f", 20, 0, 28], ["#457b9d", 50, -5, 24], ["#e9c46a", 5, 25, 20]].forEach(([c, dx, dy, h]) =>
      boxC(ctx, sx + dx * z, sy + dy * z, z, 30, 30, h, { wall: c, roof: S.shade(c, 1.15), windows: true }));
  };

  LM.mall = (ctx, sx, sy, z) => {
    ctx.fillStyle = "#6b6f75";
    ctx.fillRect(sx - 160 * z, sy - 110 * z, 320 * z, 220 * z);
    boxC(ctx, sx, sy - 20 * z, z, 220, 110, 16, { wall: "#e5ddd0", roof: "#c7cbd1", shop: true, sign: 2 });
  };

  LM.skiJump = (ctx, sx, sy, z) => {
    const H = 70 * z * HF;
    ctx.strokeStyle = "#eceff1"; ctx.lineWidth = Math.max(2, 8 * z);
    ctx.beginPath(); ctx.moveTo(sx - 20 * z, sy + 40 * z); ctx.quadraticCurveTo(sx, sy, sx + H * OX, sy - H); ctx.stroke();
    ctx.strokeStyle = "#90a4ae"; ctx.lineWidth = Math.max(1, 3 * z);
    ctx.beginPath(); ctx.moveTo(sx + H * OX, sy - H); ctx.lineTo(sx + H * OX, sy); ctx.stroke();
    boxC(ctx, sx + H * OX, sy - 4 * z, z, 10, 10, 72, { wall: "#cfd8dc", roof: "#e53935" });
  };

  LM.heritage = (ctx, sx, sy, z, t) => {
    for (let i = 0; i < 6; i++) boxC(ctx, sx + (i % 3) * 30 * z - 30 * z, sy + Math.floor(i / 3) * 30 * z, z, 16, 12, 8, { wall: "#e8d7b5", roof: "#7b3f00", house: true });
    const tx = sx + Math.cos(t * 0.2) * 80 * z, ty = sy + Math.sin(t * 0.2) * 50 * z;
    ctx.fillStyle = "#222"; ctx.fillRect(tx - 8 * z, ty - 5 * z, 16 * z, 8 * z);
    ctx.fillStyle = "rgba(220,220,220,0.6)";
    ctx.beginPath(); ctx.arc(tx - 6 * z, ty - 10 * z - (t * 8) % 6 * z, 3 * z, 0, 7); ctx.fill();
  };

  LM.airport = (ctx, sx, sy, z, t) => {
    boxC(ctx, sx, sy, z, 300, 80, 22, { glass: "#8fb9d9", roof: "#d0d6dc", windows: true });
    boxC(ctx, sx + 170 * z, sy - 30 * z, z, 14, 14, 85, { wall: "#e0e0e0", roof: "#4a4a4a" });
  };

  LM.fort = (ctx, sx, sy, z) => {
    ctx.strokeStyle = "#7b5b3a"; ctx.lineWidth = Math.max(2, 4 * z);
    ctx.strokeRect(sx - 40 * z, sy - 40 * z, 80 * z, 80 * z);
    boxC(ctx, sx, sy, z, 30, 18, 8, { wall: "#a47c52", roof: "#6d4c2f" });
  };

  S.landmark = function (ctx, l, sx, sy, z, t) {
    (LM[l.kind] || LM.tower)(ctx, sx, sy, z, t, l);
  };

  // ---------- player / existing service buildings ----------
  const SHAPES = {
    childcare: { w: 26, d: 20, h: 8, wall: "#ffd6ec", roof: "#ff6fb5" },
    grocery: { w: 46, d: 30, h: 9, wall: "#eef7e6", roof: "#5cb85c" },
    library: { w: 36, d: 30, h: 12, wall: "#f6ecd2", roof: "#d4a017" },
    pharmacy: { w: 18, d: 16, h: 7, wall: "#e9fbff", roof: "#17a2b8" },
    school: { w: 60, d: 34, h: 12, wall: "#f3d9b1", roof: "#b5651d" },
    clinic: { w: 30, d: 24, h: 10, wall: "#fff0f3", roof: "#ff6b81" },
    hospital: { w: 110, d: 70, h: 34, wall: "#f4f6f8", roof: "#dfe6ec" },
    transit: { w: 60, d: 14, h: 7, wall: "#dbe9f6", roof: "#1c6fd9" },
    community: { w: 34, d: 30, h: 9, wall: "#efe4ff", roof: "#8e6cff" },
  };
  S.SHAPES = SHAPES;
  S.service = function (ctx, type, sx, sy, z, opts) {
    const s = SHAPES[type];
    if (!s) return;
    if (type === "hospital") return LM.hospital(ctx, sx, sy, z, 0, { h: 34 });
    const hz = s.h * z * HF;
    S.box(ctx, sx - (s.w * z) / 2, sy - (s.d * z) / 2, s.w * z, s.d * z, hz, { wall: s.wall, roof: opts && opts.ghost ? "rgba(255,255,255,0.6)" : s.roof, windows: true });
    if (type === "transit") {
      ctx.fillStyle = "#e2202c";
      ctx.fillRect(sx - 30 * z, sy + 9 * z, 60 * z, 3 * z);
    }
    if (z > 0.5) {
      const icon = CP.BUILDINGS[type].icon;
      ctx.font = `${Math.max(12, 16 * Math.min(z, 2.5))}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, sx + hz * OX, sy - hz - (s.d * z) / 2 - 8);
    }
  };

  // ---------- agents ----------
  const SHIRTS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5", "#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#ffffff"];
  const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#a1665e"];
  S.person = function (ctx, sx, sy, z, seed, t, mode) {
    const k = Math.min(1.6, Math.max(0.8, z * 0.7)) * (mode.kid ? 0.7 : 1);
    const step = Math.sin(t * (mode.sick ? 5 : 9) + seed * 10);
    const bob = Math.abs(step) * 1.2 * k;
    const shirt = SHIRTS[Math.floor(seed * 97) % SHIRTS.length];
    const skin = mode.sick ? "#9ccf6b" : SKIN[Math.floor(seed * 53) % SKIN.length];
    if (z < 1.3) {
      ctx.fillStyle = shirt;
      ctx.fillRect(sx - 2 * k, sy - 8 * k - bob, 4 * k, 7 * k);
      ctx.fillStyle = skin;
      ctx.fillRect(sx - 1.8 * k, sy - 11.5 * k - bob, 3.6 * k, 3.4 * k);
      return;
    }
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(sx - 2.5 * k, sy - 0.6 * k, 5 * k, 1.4 * k);
    // legs
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4 * k - bob); ctx.lineTo(sx - step * 2 * k, sy);
    ctx.moveTo(sx, sy - 4 * k - bob); ctx.lineTo(sx + step * 2 * k, sy);
    ctx.stroke();
    // body + head
    ctx.fillStyle = shirt;
    ctx.fillRect(sx - 2.2 * k, sy - 9 * k - bob, 4.4 * k, 5.5 * k);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(sx, sy - 11 * k - bob, 2.4 * k, 0, 7); ctx.fill();
    if (mode.sick && z > 1.2) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx - 1.6 * k, sy - 10.6 * k - bob, 3.2 * k, 1.2 * k); // mask
    }
  };

  S.car = function (ctx, sx, sy, z, horiz, dir, color, t, amb) {
    const L = Math.max(6, 7 * z), Wd = Math.max(3, 3.6 * z);
    const w = horiz ? L : Wd, h = horiz ? Wd : L;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(sx - w / 2 + 1.5, sy - h / 2 + 1.5, w, h);
    ctx.fillStyle = amb ? "#ffffff" : color;
    ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
    ctx.fillStyle = amb ? "#e53935" : "rgba(160,210,255,0.85)";
    if (horiz) ctx.fillRect(sx + (dir > 0 ? w * 0.05 : -w * 0.35), sy - h / 2 + 1, w * 0.3, h - 2);
    else ctx.fillRect(sx - w / 2 + 1, sy + (dir > 0 ? h * 0.05 : -h * 0.35), w - 2, h * 0.3);
    if (amb) {
      const on = Math.floor(t * 8) % 2;
      ctx.fillStyle = on ? "#ff1744" : "#2979ff";
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, 1.8 * z), 0, 7); ctx.fill();
      ctx.fillStyle = on ? "rgba(255,23,68,0.25)" : "rgba(41,121,255,0.25)";
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(8, 9 * z), 0, 7); ctx.fill();
    }
  };
})();
