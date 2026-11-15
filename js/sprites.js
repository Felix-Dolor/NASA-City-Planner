// Drawing primitives: true 2.5D isometric boxes (top + both visible sides, each shaded differently),
// the player buildings, the decorative city fabric, Calgary landmarks, and the residents.
(function () {
  const CP = window.CP;
  const S = (CP.sprites = {});
  const HF = 0.62; // landmark height factor (screen px per metre of height, relative to zoom)
  const OX = 0; // isometric view: height goes straight up the screen
  S.HF = HF;

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = CP.clamp(((n >> 16) & 255) * k, 0, 255), g = CP.clamp(((n >> 8) & 255) * k, 0, 255), b = CP.clamp((n & 255) * k, 0, 255);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  S.shade = shade;

  // ---------- isometric pen ----------
  // Local axes: +x runs down-right on screen, +y runs down-left, +z straight up.
  // (cx, cy) is the screen position of the local origin on the ground; k = screen px per unit.
  const IA = 0.72, IB = 0.36, IC = 0.8;
  const OUTLINE = "rgba(18,22,40,0.55)";
  const LIGHT = { top: 1.12, right: 0.9, left: 0.64 };
  function Pen(ctx, cx, cy, k) {
    const X = (x, y) => cx + (x - y) * IA * k;
    const Y = (x, y, z) => cy + (x + y) * IB * k - z * IC * k;
    const pen = { line: true, X, Y, k, ctx };
    const poly = (pts, fill, noLine) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(X(pts[0][0], pts[0][1]), Y(pts[0][0], pts[0][1], pts[0][2]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0], pts[i][1]), Y(pts[i][0], pts[i][1], pts[i][2]));
      ctx.closePath();
      ctx.fill();
      if (pen.line && !noLine) { ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.lineJoin = "round"; ctx.stroke(); }
    };
    pen.poly = poly;
    // box with its three visible faces: left wall (darkest), right wall, top (lightest)
    pen.box = function (x, y, z, w, d, h, wall, roof, o) {
      const x1 = x + w, y1 = y + d, z1 = z + h;
      poly([[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], shade(wall, LIGHT.left));
      poly([[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]], shade(wall, LIGHT.right));
      if (o && o.win && h * IC * k > 12) {
        const rows = Math.max(2, Math.min(9, Math.round(h / 11)));
        const glass = o.glass ? "rgba(255,255,255,0.32)" : "rgba(35,60,100,0.55)";
        for (let r = 0; r < rows; r++) {
          const a = z + (h * (r + 0.3)) / rows, b = z + (h * (r + 0.72)) / rows;
          poly([[x + w * 0.1, y1, a], [x1 - w * 0.1, y1, a], [x1 - w * 0.1, y1, b], [x + w * 0.1, y1, b]], glass, true);
          poly([[x1, y + d * 0.1, a], [x1, y1 - d * 0.1, a], [x1, y1 - d * 0.1, b], [x1, y + d * 0.1, b]], glass, true);
        }
      }
      poly([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], roof || shade(wall, LIGHT.top));
    };
    // pitched roof with the ridge running along x
    pen.gable = function (x, y, z, w, d, h, roof, wall) {
      const x1 = x + w, y1 = y + d, ym = y + d / 2, z1 = z + h;
      poly([[x, y, z], [x1, y, z], [x1, ym, z1], [x, ym, z1]], shade(roof, 1.12));
      poly([[x, y1, z], [x1, y1, z], [x1, ym, z1], [x, ym, z1]], shade(roof, 0.78));
      poly([[x1, y, z], [x1, y1, z], [x1, ym, z1]], shade(wall, LIGHT.right));
    };
    pen.pyramid = function (x, y, z, w, d, h, col) {
      const x1 = x + w, y1 = y + d, ap = [x + w / 2, y + d / 2, z + h];
      poly([[x, y, z], [x1, y, z], ap], shade(col, 1.1));
      poly([[x, y, z], [x, y1, z], ap], shade(col, 0.95));
      poly([[x, y1, z], [x1, y1, z], ap], shade(col, LIGHT.left));
      poly([[x1, y, z], [x1, y1, z], ap], shade(col, LIGHT.right));
    };
    const grad = (ex, rx, col) => {
      const g = ctx.createLinearGradient(ex - rx, 0, ex + rx, 0);
      g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.65, shade(col, 0.95)); g.addColorStop(1, shade(col, 0.82));
      return g;
    };
    const stroke = () => { if (pen.line) { ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke(); } };
    pen.disc = function (x, y, z, r, col, noLine) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(X(x, y), Y(x, y, z), r * IA * 1.414 * k, r * IB * 1.414 * k, 0, 0, 7); ctx.fill();
      if (!noLine) stroke();
    };
    pen.cyl = function (x, y, z, r, h, wall, top) {
      const ex = X(x, y), e0 = Y(x, y, z), e1 = Y(x, y, z + h), rx = r * IA * 1.414 * k, ry = r * IB * 1.414 * k;
      ctx.fillStyle = grad(ex, rx, wall);
      ctx.beginPath();
      ctx.ellipse(ex, e0, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(ex - rx, e1);
      ctx.ellipse(ex, e1, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath(); ctx.fill(); stroke();
      pen.disc(x, y, z + h, r, top || shade(wall, LIGHT.top));
    };
    pen.dome = function (x, y, z, r, h, col) {
      const ex = X(x, y), ey = Y(x, y, z), rx = r * IA * 1.414 * k, ry = r * IB * 1.414 * k;
      ctx.fillStyle = grad(ex, rx, col);
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, h * IC * k, 0, Math.PI, 0);
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI);
      ctx.closePath(); ctx.fill(); stroke();
    };
    pen.cone = function (x, y, z, r, h, col) {
      const ex = X(x, y), ey = Y(x, y, z), rx = r * IA * 1.414 * k, ry = r * IB * 1.414 * k;
      ctx.fillStyle = grad(ex, rx, col);
      ctx.beginPath();
      ctx.moveTo(ex - rx, ey); ctx.lineTo(ex, ey - h * IC * k); ctx.lineTo(ex + rx, ey);
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI);
      ctx.closePath(); ctx.fill(); stroke();
    };
    pen.flat = (x, y, z, w, d, col, noLine) => poly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], col, noLine);
    pen.seg = function (a, b, col, wpx) {
      ctx.strokeStyle = col; ctx.lineWidth = wpx; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(X(a[0], a[1]), Y(a[0], a[1], a[2])); ctx.lineTo(X(b[0], b[1]), Y(b[0], b[1], b[2])); ctx.stroke();
    };
    // soft ground shadow thrown to the right of a footprint
    pen.shadow = function (x, y, w, d, h) {
      const s = Math.min(h * 0.35, 30);
      poly([[x, y + d, 0], [x + w, y + d, 0], [x + w + s, y + d + s * 0.2, 0], [x + w + s, y + s * 0.2, 0], [x + w, y, 0]], "rgba(15,25,40,0.22)", true);
    };
    // round tree: trunk + ball
    pen.tree = function (x, y, r, col) {
      pen.seg([x, y, 0], [x, y, r * 1.3], "#6b4f2a", Math.max(1, r * 0.3 * k));
      const ex = X(x, y), ey = Y(x, y, r * 2.1);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, r * k, 0, 7); ctx.fill(); stroke();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(ex - r * k * 0.3, ey - r * k * 0.3, r * k * 0.45, 0, 7); ctx.fill();
    };
    return pen;
  }
  S.pen = Pen;

  // generic box used by the landmark routines: (sx, sy) = top-left of the footprint in screen px,
  // w/d in px, hz = height in px. Drawn as an isometric box centred on that footprint.
  S.box = function (ctx, sx, sy, w, d, hz, o) {
    const p = Pen(ctx, sx + w / 2, sy + d / 2, 1);
    p.line = w + d > 30;
    const wall = o.glass || o.wall || "#dddddd";
    const h = hz / IC;
    p.shadow(-w / 2, -d / 2, w, d, h);
    p.box(-w / 2, -d / 2, 0, w, d, h, wall, o.house ? null : o.roof, { win: o.windows, glass: !!o.glass });
    if (o.house) p.gable(-w / 2, -d / 2, h, w, d, h * 0.6, o.roof || "#8c5a3c", wall);
    if (o.shop && hz > 6) p.box(w / 2, -d * 0.45, h * 0.45, Math.max(1.5, w * 0.04), d * 0.9, h * 0.25, ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#e9c46a"][(o.sign || 0) % 5]);
  };

  S.tree = function (ctx, sx, sy, s, hue, z) {
    const r = s * z;
    const col = `rgb(${(40 + hue * 30) | 0},${(110 + hue * 60) | 0},${(50 + hue * 20) | 0})`;
    if (r < 3) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(sx, sy - r, r, 0, 7); ctx.fill();
      return;
    }
    ctx.fillStyle = "rgba(20,40,20,0.25)";
    ctx.beginPath(); ctx.ellipse(sx + r * 0.5, sy + r * 0.15, r * 1.1, r * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(sx - r * 0.12, sy - r * 1.1, r * 0.24, r * 1.1);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sx, sy - r * 1.5, r, 0, 7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 1.8, r * 0.45, 0, 7); ctx.fill();
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

  // Chinook Centre: an isometric car park with the mall at the back, anchor stores, a glass atrium and parked cars
  const MALL_CARS = ["#e63946", "#f1faee", "#457b9d", "#2b2d42", "#e9c46a", "#8d99ae", "#a8dadc", "#1d3557"];
  LM.mall = (ctx, sx, sy, z) => {
    const p = Pen(ctx, sx, sy, z * 0.8);
    p.line = z > 0.25;
    const H = 16 * HF / IC; // 16 m tall
    // asphalt with a kerb, painted stall rows and a planted edge
    p.flat(-130, -110, 0, 260, 220, "#a9adb3", true);
    p.flat(-124, -104, 0.2, 248, 208, "#5d636b", true);
    const lane = "rgba(255,255,255,0.55)";
    for (const [y0, y1] of [[18, 46], [62, 90]]) for (let x = -110; x <= 110; x += 14) p.flat(x, y0, 0.4, 1.4, y1 - y0, lane, true);
    for (const [x0, x1] of [[72, 92], [100, 120]]) for (let y = -96; y <= 0; y += 14) p.flat(x0, y, 0.4, x1 - x0, 1.4, lane, true);
    // mall: long main hall, a west wing and two taller anchor stores
    p.shadow(-110, -100, 170, 90, H);
    p.box(-110, -100, 0, 170, 70, H, "#e8dfd0", "#cfd3d8");
    p.box(-110, -30, 0, 60, 40, H * 0.85, "#e8dfd0", "#cfd3d8");
    p.box(30, -100, 0, 34, 70, H * 1.25, "#b8c4cf", "#9aa7b3"); // anchor (east)
    p.box(-118, -108, 0, 40, 40, H * 1.2, "#d9b38c", "#bf9a74"); // anchor (west)
    // glass atrium running along the roof
    p.box(-60, -78, H, 80, 26, H * 0.35, "#8fd3f4", "#bfe8fb");
    // entrance canopy + coloured shop signs on the front wall
    p.box(-20, -32, H * 0.45, 26, 4, H * 0.12, "#c8102e");
    ["#e63946", "#2a9d8f", "#f4a261", "#457b9d"].forEach((c, i) => p.box(-100 + i * 34, -31, H * 0.55, 18, 1.5, H * 0.2, c));
    // parked cars (fixed pattern so they do not flicker)
    const car = (x, y, w, d, i) => p.box(x, y, 0.5, w, d, 3.5, MALL_CARS[i % MALL_CARS.length]);
    let i = 0;
    for (const y of [20, 64]) for (let x = -108; x <= 104; x += 14) if ((x * 7 + y * 3) % 5 !== 0) car(x + 2, y + 4, 10, 18, i++);
    for (const x of [74, 102]) for (let y = -94; y <= -6; y += 14) if ((x + y * 5) % 4 !== 0) car(x + 2, y + 2, 16, 9, i++);
    // trees along the front edge
    for (let x = -118; x <= 118; x += 26) p.tree(x, 104, 4.5, "#4f9a4a");
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

  // Glenmore dam and water treatment plant: a curved concrete dam, an intake tower and settling tanks
  LM.reservoir = (ctx, sx, sy, z, t) => {
    const p = Pen(ctx, sx, sy, z * 0.9);
    p.flat(-70, -60, 0, 140, 120, "#b8c2cc");
    p.shadow(-60, -50, 120, 100, 20);
    p.box(-64, -58, 0, 128, 12, 18, "#d5d0c4", "#e6e1d6");
    for (const [x, y] of [[-30, 0], [10, 0], [-30, 36]]) {
      p.cyl(x, y, 0, 15, 10, "#ced4da", "#22b8cf");
      p.disc(x, y, 10.2, 11, "#66d9e8", true);
      const a = (t || 0) * 0.8 + x;
      p.seg([x, y, 10.5], [x + Math.cos(a) * 11, y + Math.sin(a) * 11, 10.5], "#495057", Math.max(1, p.k * 1.4));
    }
    p.box(24, 18, 0, 36, 34, 22, "#eef3f7", "#1098ad", { win: true });
    p.cyl(44, -30, 0, 9, 38, "#d5d0c4", "#a5a092");
    p.box(38, -36, 38, 12, 12, 8, "#1098ad");
  };

  S.landmark = function (ctx, l, sx, sy, z, t) {
    (LM[l.kind] || LM.tower)(ctx, sx, sy, z, t, l);
  };

  // ---------- the ten player buildings ----------
  // Each is designed in a ~100 x 100 unit footprint and must be recognisable by silhouette and colour alone.
  function clockFace(p, x, y, z, r) {
    const c = p.ctx, cx = p.X(x, y), cy = p.Y(x, y, z), rp = r * p.k;
    c.fillStyle = "#fffdf5"; c.beginPath(); c.ellipse(cx, cy, rp * 0.75, rp, 0, 0, 7); c.fill();
    c.strokeStyle = "#3b2a20"; c.lineWidth = Math.max(1, rp * 0.18); c.stroke();
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - rp * 0.6); c.moveTo(cx, cy); c.lineTo(cx + rp * 0.35, cy + rp * 0.15); c.stroke();
  }
  const BUILD = {
    // white block, teal band, red cross on the roof
    clinic(p) {
      p.shadow(-30, -25, 60, 50, 30);
      p.box(-30, -25, 0, 60, 50, 22, "#f4fbff");
      p.box(-31, -26, 22, 62, 52, 6, "#19b5b0");
      p.box(-30, -25, 28, 60, 50, 3, "#f4fbff", "#e3f4f6");
      p.flat(-6, -19, 31.2, 12, 38, "#e53935");
      p.flat(-19, -6, 31.3, 38, 12, "#e53935", true);
      p.box(30, -8, 0, 3, 16, 13, "#0f8a86");
    },
    // tall white tower with a red band and cross, low wing with a helipad
    hospital(p) {
      p.shadow(-50, -35, 96, 76, 60);
      p.box(-50, -8, 0, 46, 48, 26, "#eef3f7", "#cfd8df", { win: true });
      p.disc(-27, 16, 26.2, 15, "#5d6b78");
      p.disc(-27, 16, 26.3, 11, "#ffd43b", true);
      p.disc(-27, 16, 26.4, 8.5, "#5d6b78", true);
      p.box(-4, -35, 0, 50, 70, 70, "#f7fafc", null, { win: true });
      p.box(-5, -36, 70, 52, 72, 8, "#e53935");
      p.box(-4, -35, 78, 50, 70, 3, "#f7fafc", "#e9eff3");
      p.flat(15, -24, 81.2, 12, 48, "#e53935");
      p.flat(-3, -6, 81.3, 48, 12, "#e53935", true);
    },
    // wide, low cream box with a green roof, striped awning and an orange sign
    grocery(p) {
      p.shadow(-46, -30, 92, 60, 22);
      p.box(-46, -30, 0, 92, 60, 20, "#fff8e1", "#3faa4a");
      for (let i = 0; i < 6; i++) p.box(46, -28 + i * 9.4, 11, 9, 9.4, 3, i % 2 ? "#ffffff" : "#e63946");
      p.box(-14, -12, 20, 5, 5, 16, "#8a8f98");
      p.box(-26, -16, 34, 30, 13, 15, "#ff7f11");
    },
    // gold building with a pitched roof, front steps and white columns
    library(p) {
      p.shadow(-42, -32, 84, 64, 40);
      p.box(-44, -34, 0, 90, 68, 5, "#d9cdb4");
      p.box(-36, -27, 5, 70, 54, 30, "#f3dfa8");
      for (let i = 0; i < 5; i++) p.box(34, -24 + i * 11, 5, 5, 5, 30, "#fffdf5");
      p.box(-38, -29, 35, 80, 58, 4, "#fffdf5");
      p.gable(-38, -29, 39, 80, 58, 20, "#c98a1b", "#f3dfa8");
    },
    // long brick building with a clock tower, pointed roof and flag
    school(p) {
      p.shadow(-52, -22, 104, 46, 40);
      p.box(-52, -22, 0, 78, 44, 26, "#d9774a", "#8f4a2c", { win: true });
      p.box(26, -25, 0, 26, 50, 50, "#e08a5e");
      p.pyramid(24, -27, 50, 30, 54, 20, "#7a3b22");
      clockFace(p, 52, 0, 37, 8);
      p.seg([39, 0, 70], [39, 0, 90], "#555555", Math.max(1, p.k * 1.4));
      p.poly([[39, 0, 90], [39, 14, 86], [39, 0, 81]], "#ffd43b");
    },
    // pink block with three toy bricks on the roof
    childcare(p) {
      p.shadow(-34, -28, 68, 56, 30);
      p.box(-34, -28, 0, 68, 56, 22, "#ffd9ec", "#ff7ab8");
      p.box(34, -9, 0, 3, 18, 14, "#e64980");
      p.box(-24, -20, 22, 18, 18, 18, "#4dabf7");
      p.box(2, -14, 22, 18, 18, 18, "#ffd43b");
      p.pyramid(2, -14, 40, 18, 18, 12, "#e03131");
      p.box(-14, 4, 22, 18, 18, 18, "#69db7c");
    },
    // round purple hall with a domed roof
    community(p) {
      p.shadow(-34, -34, 70, 70, 40);
      p.cyl(0, 0, 0, 38, 22, "#e5dbff", "#d0bfff");
      p.box(30, -9, 0, 14, 18, 16, "#b197fc");
      p.dome(0, 0, 22, 30, 30, "#845ef7");
      p.seg([0, 0, 59], [0, 0, 70], "#ffd43b", Math.max(1.5, p.k * 2));
    },
    // tall blue glass tower on a grey podium with a gold crown
    jobs(p) {
      p.shadow(-34, -34, 68, 68, 80);
      p.box(-34, -34, 0, 68, 68, 14, "#b8c4d6");
      p.box(-22, -22, 14, 44, 44, 92, "#3b82c4", null, { win: true, glass: true });
      p.box(-24, -24, 106, 48, 48, 7, "#f5b942");
      p.box(-12, -12, 113, 24, 24, 8, "#2f6aa3");
      p.seg([0, 0, 121], [0, 0, 140], "#d0d6dd", Math.max(1, p.k * 1.3));
    },
    // long grey platform, blue canopy on posts, white-and-red train alongside
    transit(p) {
      p.flat(-58, -40, 0, 116, 22, "#5b5f66");
      p.box(-52, -37, 2, 104, 15, 9, "#f8f9fa");
      p.box(-52.5, -37.5, 11, 105, 16, 5, "#e2202c");
      p.box(-52, -37, 16, 104, 15, 3, "#f8f9fa", "#dfe3e8");
      p.box(-56, -14, 0, 112, 32, 5, "#c9ced6");
      for (const x of [-44, 0, 44]) p.box(x - 2, 0, 5, 4, 4, 22, "#7f8a99");
      p.box(-52, -12, 27, 104, 28, 5, "#1c6fd9", "#3d8bf0");
    },
    // green lawn with trees, a pond and a path
    park(p, t) {
      p.flat(-54, -54, 0, 108, 108, "#58b368");
      p.flat(-6, -54, 0.2, 12, 108, "#e3d6a8", true);
      p.disc(22, 18, 0.3, 17, "#4aa3d8");
      p.tree(-34, -34, 11, "#2f9e44");
      p.cone(22, -32, 0, 10, 36, "#1e7d3a");
      p.tree(-34, 2, 9, "#51cf66");
      p.cyl(22, 18, 0.3, 4, 5, "#e9ecef");
      const spray = 5 + Math.sin((t || 0) * 4) * 1.5;
      p.seg([22, 18, 5], [22, 18, 5 + spray * 2], "rgba(255,255,255,0.9)", Math.max(1, p.k * 1.5));
      p.cone(-24, 34, 0, 9, 30, "#237a3c");
      p.tree(6, 40, 10, "#37b24d");
      p.tree(42, -6, 8, "#2f9e44");
    },
    // grey sheds with a saw-tooth roof and two smoking chimneys
    factory(p, t) {
      p.shadow(-50, -34, 100, 70, 40);
      p.box(-50, -34, 0, 74, 68, 22, "#adb5bd", "#868e96");
      for (let i = 0; i < 4; i++) p.box(-50 + i * 18.5, -34, 22, 18.5, 68, 7, "#ced4da", i % 2 ? "#74c0fc" : "#a5d8ff");
      p.box(24, -20, 0, 24, 40, 30, "#868e96", "#6c757d", { win: true });
      p.cyl(-30, -14, 29, 6, 40, "#a61e4d", "#5c0f2c");
      p.cyl(-6, 14, 29, 6, 32, "#a61e4d", "#5c0f2c");
      p.box(-50, -34, 22.2, 74, 3, 2, "#e03131");
      smoke(p, -30, -14, 69, t, 1);
      smoke(p, -6, 14, 61, t, 1.7);
    },
    // long dark server halls, cooling fans on the roof, blinking status lights
    datacentre(p, t) {
      p.shadow(-54, -38, 108, 76, 30);
      p.box(-54, -38, 0, 108, 76, 26, "#343a40", "#495057");
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        p.cyl(-36 + i * 24, -18 + j * 36, 26, 8, 3, "#adb5bd", "#212529");
        const a = ((t || 0) * 6 + i + j) % 6.28;
        p.seg([-36 + i * 24 - Math.cos(a) * 6, -18 + j * 36 - Math.sin(a) * 6, 29.5], [-36 + i * 24 + Math.cos(a) * 6, -18 + j * 36 + Math.sin(a) * 6, 29.5], "#dee2e6", Math.max(1, p.k * 1.4));
      }
      const blink = Math.floor((t || 0) * 3) % 3;
      for (let i = 0; i < 6; i++) p.box(54, -32 + i * 11, 6, 0.6, 6, 3, i % 3 === blink ? "#69db7c" : "#5c7cfa");
      p.box(-58, -42, 0, 3, 84, 32, "#5c7cfa");
    },
    // round settling tanks of blue water beside a small control building
    wastewater(p, t) {
      p.flat(-58, -58, 0, 116, 116, "#b8c2cc");
      p.shadow(-50, -50, 100, 100, 14);
      for (const [x, y] of [[-26, -26], [26, -26], [-26, 26]]) {
        p.cyl(x, y, 0, 21, 12, "#ced4da", "#22b8cf");
        p.disc(x, y, 12.2, 15, "#66d9e8", true);
        const a = (t || 0) * 0.8 + x;
        p.seg([x, y, 12.5], [x + Math.cos(a) * 15, y + Math.sin(a) * 15, 12.5], "#495057", Math.max(1, p.k * 1.6));
      }
      p.box(12, 12, 0, 34, 30, 18, "#e9ecef", "#1098ad", { win: true });
    },
  };

  // rising, fading smoke puffs from a chimney top
  function smoke(p, x, y, z, t, seed) {
    const c = p.ctx;
    for (let i = 0; i < 5; i++) {
      const k = (((t || 0) * 0.35 + i / 5 + seed * 0.13) % 1);
      const sx = p.X(x, y) + (k * 22 + Math.sin(k * 6 + seed) * 4) * p.k;
      const sy = p.Y(x, y, z) - k * 46 * p.k;
      c.fillStyle = `rgba(90,94,104,${0.55 * (1 - k)})`;
      c.beginPath(); c.arc(sx, sy, (5 + k * 12) * p.k, 0, 7); c.fill();
    }
  }

  // an empty building lot: zone-tinted iso plate with a dashed outline (and an existing home, if any)
  S.lot = function (ctx, lot, cx, cy, k, o) {
    o = o || {};
    const p = Pen(ctx, cx, cy, k);
    const z = CP.ZONES[lot.zone];
    if (!o.housesOnly) {
      p.flat(-62, -62, 0, 124, 124, o.fill || CP.hexA(z.color, o.locked ? 0.12 : 0.34), true);
      ctx.save();
      ctx.setLineDash(o.solid ? [] : [8, 6]);
      ctx.strokeStyle = o.stroke || (o.locked ? "rgba(40,40,50,0.7)" : CP.hexA(z.color, 1));
      ctx.lineWidth = o.width || 2.4;
      ctx.stroke();
      ctx.restore();
    }
    if (lot.house && !o.ghost) {
      const hk = k * 1.25;
      S.ambient(ctx, { kind: "house", wall: "#f2e6d0", roof: "#a9746e", h: 13 }, p.X(-22, -10), p.Y(-22, -10, 0), hk);
      S.ambient(ctx, { kind: "house", wall: "#e8d8c3", roof: "#5d6d7e", h: 12 }, p.X(22, 18), p.Y(22, 18, 0), hk);
    }
  };

  // the CEI-SAT 1 satellite (shown big when zoomed out): gold body, two solar wings, dish and antenna
  S.satellite = function (ctx, cx, cy, s, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(t * 0.4) * 0.05 - 0.12);
    ctx.scale(s, s);
    // solar wings
    for (const dir of [-1, 1]) {
      ctx.fillStyle = "#adb5bd";
      ctx.fillRect(dir > 0 ? 26 : -46, -2, 20, 4);
      ctx.save();
      ctx.translate(dir * 98, 0);
      ctx.fillStyle = "#1c3d6e"; ctx.strokeStyle = "#a5d8ff"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(-52, -24, 104, 48); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(165,216,255,0.55)"; ctx.lineWidth = 0.8;
      for (let i = -39; i < 52; i += 13) { ctx.beginPath(); ctx.moveTo(i, -24); ctx.lineTo(i, 24); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-52, 0); ctx.lineTo(52, 0); ctx.stroke();
      const g = ctx.createLinearGradient(-52, -24, 52, 24);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, `rgba(255,255,255,${0.12 + 0.1 * Math.sin(t * 1.3 + dir)})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(-52, -24, 104, 48);
      ctx.restore();
    }
    // body: gold foil box
    const bg = ctx.createLinearGradient(-26, -30, 26, 30);
    bg.addColorStop(0, "#ffe8a3"); bg.addColorStop(0.5, "#e0a526"); bg.addColorStop(1, "#9c6b0c");
    ctx.fillStyle = bg; ctx.strokeStyle = "#5c3d06"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-26, -32, 52, 64, 6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(92,61,6,0.45)"; ctx.lineWidth = 1;
    for (let y = -20; y < 32; y += 12) { ctx.beginPath(); ctx.moveTo(-26, y); ctx.lineTo(26, y + 3); ctx.stroke(); }
    // red & white YYC band
    ctx.fillStyle = "#c8102e"; ctx.fillRect(-26, -6, 52, 9);
    ctx.fillStyle = "#fff"; ctx.font = "700 7px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("CEI-SAT 1", 0, -1.5);
    // camera lens looking down at Calgary
    ctx.fillStyle = "#212529"; ctx.beginPath(); ctx.arc(0, 40, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "#4dabf7"; ctx.beginPath(); ctx.arc(0, 40, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(-2, 38, 2, 0, 7); ctx.fill();
    // dish + antenna
    ctx.strokeStyle = "#dee2e6"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(0, -48); ctx.stroke();
    ctx.fillStyle = "#f1f3f5"; ctx.beginPath(); ctx.ellipse(0, -52, 16, 6, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#868e96"; ctx.lineWidth = 1; ctx.stroke();
    const blink = Math.sin(t * 4) > 0.6;
    ctx.fillStyle = blink ? "#ff4d6d" : "#7a1f2e"; ctx.beginPath(); ctx.arc(20, -28, 2.5, 0, 7); ctx.fill();
    ctx.restore();
  };

  // k = px per design unit. o.plate === false hides the coloured lot; o.ring overrides its outline colour.
  S.building = function (ctx, type, cx, cy, k, t, o) {
    o = o || {};
    const p = Pen(ctx, cx, cy, k);
    const spec = CP.BUILDINGS[type];
    if (o.plate !== false) {
      p.flat(-62, -62, 0, 124, 124, CP.hexA(spec.color, 0.3), true);
      ctx.strokeStyle = o.ring || spec.color;
      ctx.lineWidth = o.ring ? 2.5 : 2;
      ctx.stroke();
    }
    BUILD[type](p, t);
  };
  // how big buildings are drawn: about 10x real size, and never smaller than ~45 px across
  S.buildScale = (z) => Math.max(z * 10, 0.36);

  // ---------- decorative city fabric ----------
  S.ambient = function (ctx, it, cx, cy, k) {
    const p = Pen(ctx, cx, cy, k);
    p.line = k > 0.3;
    if (it.kind === "house") {
      p.shadow(-14, -12, 28, 24, it.h + 6);
      p.box(-14, -12, 0, 28, 24, it.h, it.wall);
      p.gable(-16, -14, it.h, 32, 28, 10, it.roof, it.wall);
    } else if (it.kind === "midrise") {
      p.shadow(-18, -15, 36, 30, it.h);
      p.box(-18, -15, 0, 36, 30, it.h, it.wall, "#9aa0a6", { win: true });
    } else if (it.kind === "tower") {
      p.shadow(-17, -17, 34, 34, it.h);
      p.box(-17, -17, 0, 34, 34, it.h, it.wall, "#7d8790", { win: true, glass: true });
    } else if (it.kind === "shops") {
      p.shadow(-25, -17, 50, 34, 12);
      p.box(-25, -17, 0, 50, 34, 11, it.wall, "#cfd2d6");
      p.box(25, -15, 5, 4, 30, 3, it.roof);
    } else if (it.kind === "industrial") {
      p.shadow(-27, -20, 54, 40, 14);
      p.box(-27, -20, 0, 54, 40, 13, it.wall, it.roof);
      if (it.stack) p.cyl(-14, -8, 13, 4, 20, "#9a9a9a");
    }
  };

  // small props for the opening street scene
  S.prop = function (ctx, kind, cx, cy, k) {
    const p = Pen(ctx, cx, cy, k);
    if (kind === "bench") {
      p.box(-9, -2.5, 3, 18, 5, 1.5, "#a8703c");
      p.box(-9, -3.5, 4.5, 18, 1.2, 5, "#8d5a2b");
      p.box(-8, -2, 0, 1.5, 4, 3, "#444444");
      p.box(6.5, -2, 0, 1.5, 4, 3, "#444444");
    } else if (kind === "lamp") {
      p.seg([0, 0, 0], [0, 0, 50], "#3d4450", Math.max(1.5, k * 1.2));
      p.seg([0, 0, 50], [5, 0, 50], "#3d4450", Math.max(1.5, k * 1.2));
      ctx.fillStyle = "#ffe9a8";
      ctx.beginPath(); ctx.arc(p.X(5, 0), p.Y(5, 0, 48.5), Math.max(2, k * 2), 0, 7); ctx.fill();
    } else if (kind === "stop") {
      p.seg([0, 0, 0], [0, 0, 34], "#6c757d", Math.max(1.5, k));
      p.box(-0.5, -4, 34, 1, 8, 7, "#1c6fd9");
    } else if (kind === "path") {
      p.flat(-170, -10, 0, 340, 20, "#d9d2c0", true);
    }
  };

  // ---------- residents ----------
  // One per district; `L` (look) makes each unmistakable: skin, hair/headwear, clothes, accessories.
  // (sx, sy) = feet on screen, u = px per unit, the figure is about 100 units tall.
  S.resident = function (ctx, sx, sy, u, L, a) {
    const X = L.extra;
    if (X.small) u *= 0.82;
    const sw = a.moving ? Math.sin(a.phase) : 0;
    const bob = a.moving ? Math.abs(Math.cos(a.phase)) * 2 * u : 0;
    const dir = a.dir || 1;
    const ink = "rgba(15,18,35,0.75)";
    const lw = Math.max(1, u * 1.1);
    const hx = sx, hy = sy - 84 * u - bob, hr = 14 * u;
    const outline = () => { ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke(); };
    const rr = (x, y, w, h, r, fill, line) => {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
      if (line !== false) outline();
    };
    const circ = (x, y, r, fill, line) => {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (line !== false) outline();
    };
    const limb = (x0, y0, x1, y1, w, col) => {
      ctx.lineCap = "round";
      ctx.strokeStyle = ink; ctx.lineWidth = w + lw * 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    };
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(sx, sy, 17 * u, 5 * u, 0, 0, 7); ctx.fill();
    if (X.cane) limb(sx + 24 * u, sy - 44 * u - bob, sx + 27 * u, sy - 1 * u, 2.4 * u, "#6b4f2a");
    // hair / headwear that sits behind the head
    if (L.style === "afro") circ(hx, hy - 3 * u, hr * 1.55, L.hair);
    if (L.style === "long") rr(hx - hr * 1.15, hy - hr * 0.6, hr * 2.3, hr * 2.5, hr * 0.5, L.hair);
    if (L.style === "hijab") {
      ctx.fillStyle = L.hair;
      ctx.beginPath(); ctx.moveTo(hx - hr * 1.3, hy); ctx.lineTo(hx - 17 * u, sy - 58 * u - bob); ctx.lineTo(hx + 17 * u, sy - 58 * u - bob); ctx.lineTo(hx + hr * 1.3, hy); ctx.closePath(); ctx.fill();
      outline();
    }
    if (L.style === "ponytail") circ(hx - dir * hr * 1.05, hy + 3 * u + sw * 2 * u, hr * 0.55, L.hair);
    if (X.backpack) rr(sx - dir * 15 * u - 6 * u, sy - 70 * u - bob, 12 * u, 26 * u, 4 * u, X.backpack);
    // legs + shoes
    limb(sx - 6.5 * u, sy - 36 * u - bob, sx - 6.5 * u + sw * 7 * u, sy - 4 * u, 8.5 * u, L.bottom);
    limb(sx + 6.5 * u, sy - 36 * u - bob, sx + 6.5 * u - sw * 7 * u, sy - 4 * u, 8.5 * u, L.bottom);
    rr(sx - 12 * u + sw * 7 * u, sy - 5 * u, 11 * u, 5 * u, 2 * u, "#2b2b33", false);
    rr(sx + 1 * u - sw * 7 * u, sy - 5 * u, 11 * u, 5 * u, 2 * u, "#2b2b33", false);
    // arms + hands (a.wave: the arm on the facing side is raised and waving back and forth)
    const waveSide = a.wave !== undefined ? dir : 0;
    for (const side of [-1, 1]) {
      const shX = sx + side * 15 * u, shY = sy - 64 * u - bob;
      if (side === waveSide) {
        const ang = -Math.PI / 2 + side * (0.45 + 0.4 * Math.sin(a.wave * 9));
        const hx2 = shX + Math.cos(ang) * 30 * u, hy2 = shY + Math.sin(ang) * 30 * u;
        limb(shX, shY, hx2, hy2, 7 * u, L.top);
        circ(hx2, hy2 - 1 * u, 4.6 * u, X.mitts || L.skin, false);
        continue;
      }
      limb(shX, shY, sx + side * (20 * u + sw * 5 * u), sy - 42 * u - bob, 7 * u, L.top);
      circ(sx + side * (20 * u + sw * 5 * u), sy - 40 * u - bob, 4 * u, X.mitts || L.skin, false);
    }
    if (X.book && waveSide !== 1) rr(sx + 16 * u + sw * 5 * u, sy - 50 * u - bob, 10 * u, 13 * u, 1.5 * u, X.book);
    if (X.bag && waveSide !== -1) rr(sx - 27 * u - sw * 5 * u, sy - 40 * u - bob, 12 * u, 11 * u, 2 * u, X.bag);
    // torso
    const tx = sx - 15 * u, ty = sy - 70 * u - bob, tw = 30 * u, th = 38 * u;
    rr(tx, ty, tw, th, 7 * u, L.top);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 7 * u); ctx.clip();
    if (X.plaid) {
      ctx.strokeStyle = X.plaid; ctx.lineWidth = 2 * u;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(tx + (tw * i) / 4, ty); ctx.lineTo(tx + (tw * i) / 4, ty + th); ctx.stroke(); }
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(tx, ty + (th * i) / 5); ctx.lineTo(tx + tw, ty + (th * i) / 5); ctx.stroke(); }
    }
    if (X.stripe) { ctx.fillStyle = X.stripe; ctx.fillRect(tx, ty + th * 0.3, tw, 3.5 * u); ctx.fillRect(tx, ty + th * 0.48, tw, 3.5 * u); }
    if (X.apron) { ctx.fillStyle = X.apron; ctx.fillRect(tx + 5 * u, ty + 9 * u, tw - 10 * u, th); ctx.fillRect(tx + 9 * u, ty, 3 * u, 10 * u); ctx.fillRect(tx + tw - 12 * u, ty, 3 * u, 10 * u); }
    if (X.vest) { ctx.fillStyle = X.vest; ctx.fillRect(tx, ty, 10 * u, th); ctx.fillRect(tx + tw - 10 * u, ty, 10 * u, th); ctx.fillStyle = "#f1f3f5"; ctx.fillRect(tx, ty + th * 0.55, tw, 3 * u); }
    if (X.hood) { ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(tx + 9 * u, ty + 18 * u, tw - 18 * u, 9 * u); }
    ctx.restore();
    if (X.scarf) { rr(sx - 13 * u, sy - 73 * u - bob, 26 * u, 7 * u, 3 * u, X.scarf); rr(sx + 4 * u, sy - 70 * u - bob, 7 * u, 17 * u, 2 * u, X.scarf); }
    if (X.headphones) { ctx.strokeStyle = X.headphones; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(hx, hy, hr * 1.25, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    // head
    circ(hx, hy, hr, L.skin);
    // hair / headwear in front of the head
    const cap = (k2, col) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.1, hr * k2, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      outline();
    };
    switch (L.style) {
      case "short": case "long": case "ponytail": case "afro": cap(1.06, L.hair); break;
      case "bob":
        cap(1.08, L.hair);
        rr(hx - hr * 1.12, hy - hr * 0.2, hr * 0.42, hr * 1.1, hr * 0.2, L.hair);
        rr(hx + hr * 0.7, hy - hr * 0.2, hr * 0.42, hr * 1.1, hr * 0.2, L.hair);
        break;
      case "bun": cap(1.06, L.hair); circ(hx, hy - hr * 1.25, hr * 0.48, L.hair); break;
      case "curly":
        for (let i = 0; i < 6; i++) circ(hx - hr + (i * hr * 2) / 5, hy - hr * (0.55 + 0.3 * Math.sin((i / 5) * Math.PI)), hr * 0.46, L.hair);
        break;
      case "hijab":
        ctx.strokeStyle = L.hair; ctx.lineWidth = hr * 0.5;
        ctx.beginPath(); ctx.arc(hx, hy, hr * 1.02, Math.PI * 0.72, Math.PI * 2.28); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(hx, hy, hr * 1.27, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
        break;
      case "turban":
        ctx.fillStyle = L.hair;
        ctx.beginPath(); ctx.ellipse(hx, hy - hr * 0.62, hr * 1.18, hr * 0.78, 0, 0, 7); ctx.fill();
        outline();
        ctx.beginPath(); ctx.moveTo(hx - hr * 0.9, hy - hr * 0.3); ctx.lineTo(hx, hy - hr * 0.95); ctx.lineTo(hx + hr * 0.9, hy - hr * 0.3); ctx.stroke();
        break;
      case "cap":
        cap(1.06, L.hair);
        rr(dir > 0 ? hx : hx - hr * 1.5, hy - hr * 0.45, hr * 1.5, hr * 0.28, hr * 0.14, L.hair);
        break;
      case "toque":
        cap(1.1, L.hair);
        rr(hx - hr * 1.1, hy - hr * 0.45, hr * 2.2, hr * 0.36, hr * 0.15, "#ffffff");
        circ(hx, hy - hr * 1.25, hr * 0.34, "#ffffff");
        break;
      case "cowboy":
        rr(hx - hr * 1.0, hy - hr * 0.35, hr * 0.3, hr * 0.7, hr * 0.1, L.hair, false);
        rr(hx + hr * 0.7, hy - hr * 0.35, hr * 0.3, hr * 0.7, hr * 0.1, L.hair, false);
        ctx.fillStyle = "#9c7448";
        ctx.beginPath(); ctx.ellipse(hx, hy - hr * 0.55, hr * 1.95, hr * 0.38, 0, 0, 7); ctx.fill();
        outline();
        rr(hx - hr * 0.85, hy - hr * 1.55, hr * 1.7, hr * 1.05, hr * 0.35, "#9c7448");
        rr(hx - hr * 0.86, hy - hr * 0.82, hr * 1.72, hr * 0.22, 0, "#5c3d1e", false);
        break;
    }
    // face
    const fd = dir * hr * 0.12;
    ctx.fillStyle = "#1b1b24";
    ctx.beginPath();
    ctx.arc(hx - hr * 0.36 + fd, hy + hr * 0.08, Math.max(0.8, hr * 0.11), 0, 7);
    ctx.arc(hx + hr * 0.36 + fd, hy + hr * 0.08, Math.max(0.8, hr * 0.11), 0, 7);
    ctx.fill();
    if (X.beard) { ctx.fillStyle = X.beard; ctx.beginPath(); ctx.arc(hx + fd * 0.5, hy + hr * 0.25, hr * 0.82, Math.PI * 0.08, Math.PI * 0.92); ctx.closePath(); ctx.fill(); }
    if (hr > 5) {
      ctx.strokeStyle = X.beard ? "#f3d9c9" : "#7a2e2e"; ctx.lineWidth = Math.max(1, hr * 0.09); ctx.lineCap = "round";
      ctx.beginPath();
      if (a.talk) ctx.ellipse(hx + fd, hy + hr * 0.5, hr * 0.16, hr * (0.08 + 0.1 * Math.abs(Math.sin(a.talk * 9))), 0, 0, 7);
      else ctx.arc(hx + fd, hy + hr * 0.36, hr * 0.26, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    if (X.glasses) {
      ctx.strokeStyle = "#1b1b24"; ctx.lineWidth = Math.max(1, hr * 0.1);
      ctx.beginPath();
      ctx.arc(hx - hr * 0.36 + fd, hy + hr * 0.08, hr * 0.27, 0, 7);
      ctx.moveTo(hx + hr * 0.63 + fd, hy + hr * 0.08);
      ctx.arc(hx + hr * 0.36 + fd, hy + hr * 0.08, hr * 0.27, 0, 7);
      ctx.moveTo(hx - hr * 0.09 + fd, hy + hr * 0.08); ctx.lineTo(hx + hr * 0.09 + fd, hy + hr * 0.08);
      ctx.stroke();
    }
  };
  // residents are drawn big enough to see and click from orbit
  S.residentScale = (z) => Math.max(z * 1.35, 0.46);
})();
