// Disaster visuals. Every active incident is drawn big and animated on the map so it reads from orbit:
// flames and smoke, rising floodwater, a hailstorm with lightning, a tornado funnel, cracks and shock rings,
// a rubble pile with dust. They stay until the incident is resolved. Good news (festival) gets confetti instead.
// world-space drawing: sizes are in metres and scaled up when zoomed out so they never shrink to a dot.
(function () {
  const CP = window.CP;
  const fx = (CP.fx = {});
  const TAU = Math.PI * 2;
  const sin = Math.sin, cos = Math.cos;
  const rnd = (n) => CP.hash(n, n * 7 + 3, 99); // stable pseudo-random from an integer

  const kOf = (z) => Math.max(1, 0.05 / z);

  function glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function flame(ctx, x, y, h, t, seed) {
    const w = h * 0.58, f = 1 + 0.18 * sin(t * 9 + seed * 7), sway = sin(t * 5 + seed * 3) * h * 0.1;
    const g = ctx.createLinearGradient(x, y, x, y - h * f);
    g.addColorStop(0, "#ffe66d"); g.addColorStop(0.35, "#ff9f1c"); g.addColorStop(1, "rgba(220,30,20,0.0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w * 0.65, y - h * 0.5 * f, x + sway, y - h * f);
    ctx.quadraticCurveTo(x + w * 0.65, y - h * 0.5 * f, x + w / 2, y);
    ctx.closePath(); ctx.fill();
    // hot core
    ctx.fillStyle = "rgba(255,250,200,0.85)";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.18, y);
    ctx.quadraticCurveTo(x - w * 0.22, y - h * 0.3 * f, x + sway * 0.6, y - h * 0.55 * f);
    ctx.quadraticCurveTo(x + w * 0.22, y - h * 0.3 * f, x + w * 0.18, y);
    ctx.fill();
  }
  function puff(ctx, x, y, r, a) {
    ctx.fillStyle = `rgba(55,55,62,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function bolt(ctx, x0, y0, x1, y1, seed, w) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const n = 7;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.lineTo(x0 + (x1 - x0) * k + (rnd(seed + i) - 0.5) * Math.abs(y1 - y0) * 0.25, y0 + (y1 - y0) * k);
    }
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = "rgba(190,215,255,0.5)"; ctx.lineWidth = w * 3; ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = w; ctx.stroke();
  }

  const KIND = {
    fire(ctx, inc, t, z, k, R) {
      const n = inc.level > 1 ? 16 : 9;
      glow(ctx, inc.x, inc.y, R * 1.2, "255,110,20", 0.55 + 0.12 * sin(t * 6));
      for (let i = 0; i < n; i++) {
        const a = rnd(inc.id * 31 + i) * TAU, d = Math.sqrt(rnd(inc.id * 17 + i * 5)) * R * 0.75;
        const x = inc.x + cos(a) * d, y = inc.y + sin(a) * d * 0.7;
        flame(ctx, x, y, (420 + rnd(i + 4) * 300) * k, t, i + inc.id);
      }
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.32 + i / 6) % 1;
        puff(ctx, inc.x + sin(t + i) * R * 0.25 + i * 20, inc.y - ph * 700 * k, (70 + ph * 190) * k, 0.45 * (1 - ph));
      }
    },
    flood(ctx, inc, t, z, k, R) {
      ctx.save();
      ctx.beginPath(); ctx.arc(inc.x, inc.y, R, 0, TAU); ctx.clip();
      ctx.fillStyle = "rgba(48,140,230,0.5)";
      ctx.fillRect(inc.x - R, inc.y - R, R * 2, R * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 3.5 / z;
      for (let j = -5; j <= 5; j++) {
        ctx.beginPath();
        for (let i = -12; i <= 12; i++) {
          const x = inc.x + (i / 12) * R, y = inc.y + (j / 5) * R * 0.9 + sin(t * 2 + i * 0.7 + j) * R * 0.04;
          i === -12 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(120,200,255,0.9)";
      ctx.lineWidth = 6 / z;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.35 + i / 3) % 1;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.arc(inc.x, inc.y, R * (0.4 + ph * 0.6), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    storm(ctx, inc, t, z, k, R, rain) {
      glow(ctx, inc.x, inc.y, R, "30,40,70", 0.35);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + t * 0.08;
        ctx.fillStyle = "rgba(48,54,84,0.55)";
        ctx.beginPath(); ctx.ellipse(inc.x + cos(a) * R * 0.45, inc.y - R * 0.25 + sin(a) * R * 0.18, R * 0.42, R * 0.2, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = "rgba(190,220,255,0.7)";
      ctx.lineWidth = 3.5 / z;
      for (let i = 0; i < 60; i++) {
        const a = rnd(inc.id + i) * TAU, d = Math.sqrt(rnd(i * 13 + inc.id)) * R * 0.9;
        const ph = (t * 1.6 + rnd(i + 90)) % 1;
        const x = inc.x + cos(a) * d, y = inc.y + sin(a) * d * 0.8 + ph * R * 0.4 - R * 0.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 50 * k, y + 120 * k); ctx.stroke();
      }
      if (!rain) {
        const phase = (t * 0.5) % 2.4;
        if (phase < 0.22) {
          const sx = inc.x + (rnd(Math.floor(t * 0.5 / 2.4) + inc.id) - 0.5) * R;
          bolt(ctx, sx, inc.y - R * 0.45, sx + 90, inc.y + R * 0.1, Math.floor(t * 4), 9 / z * 0.6);
          ctx.fillStyle = `rgba(255,255,255,${0.16 * (1 - phase / 0.22)})`;
          ctx.beginPath(); ctx.arc(inc.x, inc.y, R, 0, TAU); ctx.fill();
        }
      }
    },
    rain(ctx, inc, t, z, k, R) { KIND.storm(ctx, inc, t, z, k, R, true); KIND.flood(ctx, Object.assign({}, inc), t, z, k, R * 0.55); },
    lightning(ctx, inc, t, z, k, R) {
      glow(ctx, inc.x, inc.y, R * 0.8, "255,230,120", 0.3 + 0.2 * sin(t * 14));
      const ph = (t * 1.3) % 1;
      if (ph < 0.3) bolt(ctx, inc.x + 60, inc.y - 1300 * k, inc.x, inc.y, Math.floor(t * 6), 11 / z * 0.55);
      for (let i = 0; i < 8; i++) {
        const a = t * 3 + i * 0.8, d = R * (0.2 + 0.3 * ((t + i) % 1));
        ctx.fillStyle = "#ffe66d";
        ctx.beginPath(); ctx.arc(inc.x + cos(a) * d, inc.y + sin(a) * d * 0.7, 18 * k, 0, TAU); ctx.fill();
      }
    },
    tornado(ctx, inc, t, z, k, R) {
      // the path it cut across the district
      const sx = inc.x - R * 2.2, sy = inc.y + R * 0.9;
      ctx.strokeStyle = "rgba(60,40,30,0.55)"; ctx.lineWidth = 120 * k; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(inc.x, inc.y); ctx.stroke();
      glow(ctx, inc.x, inc.y, R, "120,100,90", 0.4);
      const H = 1500 * k;
      for (let i = 0; i < 16; i++) {
        const f = i / 15, y = inc.y - f * H;
        const w = (90 + f * f * 520) * k, sway = sin(t * 2 + f * 5) * 90 * f * k;
        ctx.fillStyle = `rgba(${64 + f * 50},${64 + f * 48},${76 + f * 40},${0.9 - f * 0.2})`;
        ctx.beginPath(); ctx.ellipse(inc.x + sway, y, w, w * 0.3, 0, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 26; i++) {
        const f = (rnd(i + inc.id) + t * 0.25) % 1, a = t * (3 + rnd(i) * 3) + i * 1.7;
        const w = (90 + f * f * 520) * k * 1.15;
        ctx.fillStyle = i % 3 ? "#5c4d3c" : "#c9a679";
        ctx.beginPath(); ctx.arc(inc.x + cos(a) * w + sin(t * 2 + f * 5) * 90 * f * k, inc.y - f * H + sin(a) * w * 0.3, 26 * k, 0, TAU); ctx.fill();
      }
    },
    earthquake(ctx, inc, t, z, k, R) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1;
        ctx.strokeStyle = `rgba(255,140,60,${0.7 * (1 - ph)})`;
        ctx.lineWidth = 9 / z;
        ctx.beginPath(); ctx.ellipse(inc.x, inc.y, R * ph, R * ph * 0.72, 0, 0, TAU); ctx.stroke();
      }
      ctx.lineCap = "round";
      for (let i = 0; i < 9; i++) {
        let a = rnd(inc.id * 5 + i) * TAU, x = inc.x, y = inc.y;
        const pts = [[x, y]];
        for (let s = 0; s < 8; s++) {
          a += (rnd(i * 11 + s) - 0.5) * 1.1;
          x += cos(a) * R * 0.14; y += sin(a) * R * 0.1;
          pts.push([x, y]);
        }
        for (const [col, w] of [["rgba(255,90,40,0.55)", 26], ["#2a2020", 11]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w * k;
          ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        }
      }
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.4 + i / 6) % 1;
        puff(ctx, inc.x + (rnd(i) - 0.5) * R * 0.8, inc.y - ph * 500 * k, (90 + ph * 140) * k, 0.4 * (1 - ph));
      }
    },
    collapse(ctx, inc, t, z, k, R) {
      glow(ctx, inc.x, inc.y, R, "150,140,130", 0.4);
      for (let i = 0; i < 14; i++) {
        const a = rnd(inc.id + i) * TAU, d = Math.sqrt(rnd(i * 7 + 2)) * R * 0.4;
        const x = inc.x + cos(a) * d, y = inc.y + sin(a) * d * 0.7, s = (50 + rnd(i + 5) * 70) * k;
        ctx.fillStyle = i % 2 ? "#8d8579" : "#6d675f";
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y - s * 0.9); ctx.lineTo(x + s * 0.7, y - s * 0.6); ctx.lineTo(x + s, y); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.3 + i / 6) % 1;
        puff(ctx, inc.x + (rnd(i + 8) - 0.5) * R * 0.7, inc.y - ph * 550 * k, (90 + ph * 190) * k, 0.45 * (1 - ph));
      }
      // hazard stripes
      ctx.strokeStyle = "#ffd43b"; ctx.lineWidth = 12 / z; ctx.setLineDash([60 * k, 60 * k]);
      ctx.beginPath(); ctx.arc(inc.x, inc.y, R * 0.55, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    },
    festival(ctx, inc, t, z, k, R) {
      glow(ctx, inc.x, inc.y, R, "255,210,90", 0.3 + 0.1 * sin(t * 4));
      const cols = ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c", "#b197fc"];
      for (let i = 0; i < 40; i++) {
        const ph = (t * 0.3 + rnd(i)) % 1, a = rnd(i + 50) * TAU, d = rnd(i + 9) * R * 0.8;
        ctx.fillStyle = cols[i % 5];
        ctx.fillRect(inc.x + cos(a) * d, inc.y + sin(a) * d * 0.7 - ph * 420 * k + 150 * k, 24 * k, 14 * k);
      }
    },
  };

  // world-space visual for one incident
  fx.draw = function (ctx, inc, t, z) {
    const draw = KIND[inc.key];
    if (!draw || inc.status !== "active") return;
    const k = kOf(z), R = inc.r || 800;
    ctx.save();
    ctx.lineCap = "round";
    // pulsing danger ring
    if (!inc.good) {
      ctx.strokeStyle = inc.level > 1 ? "rgba(255,42,74,0.85)" : "rgba(255,92,122,0.7)";
      ctx.lineWidth = (4 + sin(t * 5) * 1.4) / z;
      ctx.setLineDash([26 / z, 18 / z]);
      ctx.beginPath(); ctx.arc(inc.x, inc.y, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    draw(ctx, inc, t, z, k, R);
    ctx.restore();
  };

  // screen-space beacon: visible from orbit, red for disasters, green for good news
  fx.marker = function (ctx, inc, sx, sy, t) {
    if (inc.status !== "active") return;
    const col = inc.good ? "#2fb878" : "#d90429";
    const r = 17 + Math.sin(t * 6) * 1.6;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sx, sy, r + 9 + Math.sin(t * 3) * 4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.font = '19px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(inc.t.icon, sx, sy + 1);
    if (!inc.good) {
      ctx.font = "800 11px Inter, system-ui, sans-serif";
      const txt = inc.t.name.toUpperCase() + (inc.level > 1 ? " · ESCALATING" : "");
      const w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(sx - w / 2, sy + r + 6, w, 18, 9); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(txt, sx, sy + r + 15.5);
    }
    ctx.restore();
  };
})();
