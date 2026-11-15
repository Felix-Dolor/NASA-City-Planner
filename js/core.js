// Core helpers shared by every module. Everything hangs off the global CP namespace
// so the game runs from file:// without a bundler.
(function () {
  const CP = (window.CP = window.CP || {});

  // ---------- math ----------
  CP.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  CP.lerp = (a, b, t) => a + (b - a) * t;
  CP.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  CP.smooth = (t) => t * t * (3 - 2 * t);

  // ---------- device ----------
  // phone-sized layout (portrait phones and short landscape phones); keep in sync with css/style.css
  const mq = window.matchMedia("(max-width: 760px), (max-height: 520px)");
  CP.isMobile = () => mq.matches;
  CP.touch = window.matchMedia("(pointer: coarse)").matches;

  // deterministic hash -> [0,1)
  CP.hash = function (x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  CP.rng = function (seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- projection (must match tools/build_data.py) ----------
  const R = 6378137;
  const O = window.CEI_DATA.origin;
  const K = Math.cos((O.lat * Math.PI) / 180);
  const mx = (lon) => (R * lon * Math.PI) / 180;
  const my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const OX = mx(O.lon), OY = my(O.lat);
  CP.project = (lat, lon) => [(mx(lon) - OX) * K, -(my(lat) - OY) * K];
  CP.unproject = function (x, y) {
    const X = x / K + OX, Y = -y / K + OY;
    return [((2 * Math.atan(Math.exp(Y / R)) - Math.PI / 2) * 180) / Math.PI, (X / R) * (180 / Math.PI)];
  };
  CP.projectLine = (pts) => pts.map((p) => CP.project(p[0], p[1]));

  // ---------- geometry ----------
  CP.pointInRings = function (x, y, rings) {
    let inside = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  };
  CP.distToSeg = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy || 1;
    const t = CP.clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  CP.distToLine = function (px, py, line) {
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
      const d = CP.distToSeg(px, py, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
      if (d < best) best = d;
    }
    return best;
  };
  CP.pointInPoly = function (x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  // ---------- formatting ----------
  CP.money = (m) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(m % 1 ? 1 : 0)}M`);
  CP.signed = (v, d = 1) => (v >= 0 ? "+" : "") + v.toFixed(d);
  CP.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  CP.clock = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  };

  // ---------- colour ----------
  CP.hexA = function (hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
})();
