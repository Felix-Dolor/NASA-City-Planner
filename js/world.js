// World generation: pre-rendered satellite terrain + deterministic street-level blocks.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const G = CP.GEO;
  const D = window.CEI_DATA;

  const world = (CP.world = {});
  world.PLANET_R = 72000; // radius of the visible "planet" disc in metres
  world.CELL = 900; // spacing of the sparse "city fabric" buildings (one cluster per cell)

  // ---------- tract paths for overlays ----------
  D.tracts.forEach((t) => {
    const p = new Path2D();
    for (const r of t.rings) {
      p.moveTo(r[0], r[1]);
      for (let k = 2; k < r.length; k += 2) p.lineTo(r[k], r[k + 1]);
      p.closePath();
    }
    t.path = p;
  });

  // district outlines (traced in sim.js) for borders, overlays and highlights
  sim.districts.forEach((d) => {
    const p = new Path2D();
    for (const loop of d.loops) {
      p.moveTo(loop[0][0], loop[0][1]);
      for (let k = 1; k < loop.length; k++) p.lineTo(loop[k][0], loop[k][1]);
      p.closePath();
    }
    d.path = p;
  });

  const polyPath = (poly) => {
    const p = new Path2D();
    p.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]);
    p.closePath();
    return p;
  };
  const linePath = (line) => {
    const p = new Path2D();
    p.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) p.lineTo(line[i][0], line[i][1]);
    return p;
  };
  G.rivers.forEach((r) => (r.path = linePath(r.line)));
  G.lakes.forEach((l) => (l.path = polyPath(l.poly)));
  G.bigParks.forEach((l) => (l.path = polyPath(l.poly)));
  G.roads.forEach((r) => (r.path = linePath(r.line)));
  G.ctrain.forEach((r) => (r.path = linePath(r.line)));
  G.airportPath = polyPath(G.airport);

  // ---------- spatial queries ----------
  world.waterAt = function (x, y, pad) {
    pad = pad || 0;
    for (const r of G.rivers) if (CP.distToLine(x, y, r.line) < r.width / 2 + pad) return true;
    for (const l of G.lakes) if (CP.pointInPoly(x, y, l.poly)) return true;
    return false;
  };
  world.bigParkAt = function (x, y) {
    for (const l of G.bigParks) if (CP.pointInPoly(x, y, l.poly)) return l;
    return null;
  };
  world.highwayAt = function (x, y, pad) {
    for (const r of G.roads) if (CP.distToLine(x, y, r.line) < r.w / 2 + (pad || 0)) return r;
    return null;
  };

  // ---------- satellite terrain (pixel-level, fast) ----------
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function buildCityTerrain() {
    const M = 3000;
    const b = D.bounds;
    const mpp = 18; // metres per pixel
    const x0 = b[0] - M, y0 = b[1] - M;
    const W = Math.ceil((b[2] - b[0] + 2 * M) / mpp), H = Math.ceil((b[3] - b[1] + 2 * M) / mpp);
    // 1) tract id map
    const idc = makeCanvas(W, H);
    const ic = idc.getContext("2d");
    ic.imageSmoothingEnabled = false;
    ic.setTransform(1 / mpp, 0, 0, 1 / mpp, -x0 / mpp, -y0 / mpp);
    D.tracts.forEach((t, i) => {
      const v = i + 1;
      ic.fillStyle = `rgb(${v & 255},${v >> 8},77)`;
      ic.fill(t.path);
    });
    const ids = ic.getImageData(0, 0, W, H).data;
    // 2) colour every pixel from its tract's real data
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(W, H);
    const px = img.data;
    const tracts = D.tracts;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const wx = x0 + x * mpp, wy = y0 + y * mpp;
        let id = 0;
        if (ids[o + 2] > 60 && ids[o + 2] < 95) id = ids[o] + (ids[o + 1] << 8);
        const t = id > 0 && id <= tracts.length ? tracts[id - 1] : null;
        const n = CP.hash(x >> 1, y >> 1, 3); // 2x2 pixel blocks: calmer texture from orbit
        let r, g, bl;
        if (!t) {
          px[o + 3] = 0; // let the regional farmland show through
          continue;
        } else {
          const dens = t.average_walkscore / 100;
          const canopy = t.tree_canopy / 100;
          const park = t.park_area_perc / 100;
          const zone = CP.hash(Math.floor(wx / 260), Math.floor(wy / 260), 11);
          if (zone < park * 0.9) {
            const k = 0.9 + n * 0.15;
            r = 92 * k; g = 150 * k; bl = 76 * k;
            if (n < canopy * 1.6 + 0.1) { r = 52; g = 102 + n * 30; bl = 52; }
          } else if (n < canopy * 1.25) {
            r = 54 + n * 30; g = 104 + n * 40; bl = 56;
          } else {
            // soft roof/lawn mottling only: no street grid (major roads are drawn as vectors)
            const roof = CP.hash(x >> 2, y >> 2, 7);
            const light = 0.9 + roof * 0.16;
            const cool = dens; // denser = greyer, suburbs = warmer roofs / lawns
            r = CP.lerp(190, 156, cool) * light;
            g = CP.lerp(180, 156, cool) * light;
            bl = CP.lerp(150, 160, cool) * light;
            if (roof < 0.25 && dens < 0.6) { r = 136; g = 164; bl = 104; } // lawns
          }
        }
        px[o] = r; px[o + 1] = g; px[o + 2] = bl; px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 3) vector features
    ctx.setTransform(1 / mpp, 0, 0, 1 / mpp, -x0 / mpp, -y0 / mpp);
    drawVectorTerrain(ctx, mpp);
    return { canvas: c, x0, y0, mpp, W, H };
  }

  function drawVectorTerrain(ctx, mpp) {
    ctx.lineCap = ctx.lineJoin = "round";
    // parks are clipped to the city so rough outlines don't spill into farmland
    ctx.save();
    const city = new Path2D();
    D.tracts.forEach((t) => city.addPath(t.path));
    ctx.clip(city);
    G.bigParks.forEach((p) => {
      ctx.fillStyle = "rgba(70,128,64,0.85)";
      ctx.fill(p.path);
    });
    ctx.restore();
    ctx.fillStyle = "rgba(150,150,150,0.55)";
    ctx.fill(G.airportPath);
    // runways
    const [ax, ay] = CP.project(51.128, -114.02);
    ctx.strokeStyle = "#555a60";
    ctx.lineWidth = 60;
    [[0, -2400, 0, 2400], [-1800, -900, 1500, 900], [-2000, 1200, 1600, 1500]].forEach(([a, b, c, d]) => {
      ctx.beginPath(); ctx.moveTo(ax + a, ay + b); ctx.lineTo(ax + c, ay + d); ctx.stroke();
    });
    G.rivers.forEach((r) => {
      ctx.strokeStyle = "#2b6f9c";
      ctx.lineWidth = Math.max(r.width * 1.6, mpp * 2.5);
      ctx.stroke(r.path);
      ctx.strokeStyle = "#3f8fc2";
      ctx.lineWidth = Math.max(r.width, mpp * 1.5);
      ctx.stroke(r.path);
    });
    G.lakes.forEach((l) => {
      ctx.fillStyle = "#357fb0";
      ctx.fill(l.path);
    });
    G.roads.forEach((r) => {
      ctx.strokeStyle = "rgba(70,70,74,0.9)";
      ctx.lineWidth = Math.max(r.w * 1.6, mpp * 2);
      ctx.stroke(r.path);
      ctx.strokeStyle = "rgba(235,225,200,0.9)";
      ctx.lineWidth = Math.max(r.w * 0.6, mpp * 0.8);
      ctx.stroke(r.path);
    });
  }

  function buildFarTerrain() {
    const R = world.PLANET_R;
    const mpp = 110;
    const W = Math.ceil((2 * R) / mpp);
    const c = makeCanvas(W, W);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(W, W);
    const px = img.data;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const wx = -R + x * mpp, wy = -R + y * mpp;
        const n = CP.hash(x, y, 1);
        let col;
        // the Rockies to the west, foothills between
        const west = -wx + Math.sin(wy / 9000) * 4000 + Math.sin(wy / 2300) * 1500;
        if (west > 62000) {
          const ridge = Math.abs(Math.sin(wx / 2100 + Math.sin(wy / 1700) * 2) + Math.sin(wy / 2900 + wx / 5000));
          const snow = ridge + (west - 62000) / 9000 + n * 0.25;
          col = snow > 1.5 ? [236, 240, 246] : snow > 1.0 ? [170, 172, 184] : ridge > 0.6 ? [104, 108, 122] : [78, 84, 96];
        } else if (west > 48000) {
          const k = (west - 48000) / 14000;
          col = [CP.lerp(86, 70, k), CP.lerp(118, 98, k), CP.lerp(70, 84, k)];
          if (n < 0.35) col = [50, 84, 54];
        } else if (west > 30000) {
          col = n < 0.25 ? [60, 100, 58] : [128, 146, 88];
        } else {
          // quarter-section farmland: gentle variations of prairie gold and green
          const fx = Math.floor(wx / 800), fy = Math.floor(wy / 800);
          const f = CP.hash(fx, fy, 21);
          const pal = [[201, 184, 128], [176, 176, 112], [190, 172, 120], [160, 168, 104], [208, 194, 146], [150, 160, 98]];
          col = pal[Math.floor(f * pal.length)];
          const edge = (wx - fx * 800 < 110 || wy - fy * 800 < 110);
          if (edge) col = [col[0] * 0.92, col[1] * 0.92, col[2] * 0.9];
        }
        const k = 0.95 + n * 0.07;
        px[o] = col[0] * k; px[o + 1] = col[1] * k; px[o + 2] = col[2] * k; px[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    ctx.setTransform(1 / mpp, 0, 0, 1 / mpp, R / mpp, R / mpp);
    ctx.lineCap = ctx.lineJoin = "round";
    // extend the Bow upstream (Banff) and downstream (east)
    const bow = G.rivers[0].line;
    const ext = [[-70000, -26000], [-52000, -20000], [-38000, -14000], [-24000, -9000]].concat(bow).concat([[22000, 26000], [42000, 40000], [70000, 52000]]);
    ctx.strokeStyle = "#3a82b4";
    ctx.lineWidth = 260;
    ctx.beginPath();
    ext.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    // highways leaving town
    ctx.strokeStyle = "rgba(90,90,90,0.8)";
    ctx.lineWidth = 140;
    [[[0, 0], [0, -72000]], [[0, 0], [0, 72000]], [[0, 0], [-72000, -16000]], [[0, 0], [72000, 2000]]].forEach((l) => {
      ctx.beginPath(); ctx.moveTo(l[0][0], l[0][1]); ctx.lineTo(l[1][0], l[1][1]); ctx.stroke();
    });
    return { canvas: c, x0: -R, y0: -R, mpp, W, H: W };
  }

  world.build = function () {
    world.city = buildCityTerrain();
    world.far = buildFarTerrain();
  };

  // ---------- city fabric ----------
  // A sparse layer of large, simple buildings and trees that hints at what each area is like
  // (towers downtown, houses in the suburbs, sheds in industrial land). One cluster per 900 m cell,
  // drawn about 10x real size so it still reads from orbit. Purely decorative.
  const cache = new Map();
  world.reserved = []; // [x, y, radius] spots kept clear, e.g. for the opening scene

  const ROOFS = ["#c0504d", "#8c5a3c", "#5d6d7e", "#a9746e", "#6b8e23", "#7a6a5a", "#3e5c76", "#b5651d"];
  const WALLS = ["#f2e6d0", "#e8d8c3", "#d9d4cc", "#f5efe6", "#e0cda9", "#cfd8dc"];
  const GLASS = ["#6fa8dc", "#7fb3d5", "#5d8aa8", "#9bc4e2", "#4f7fa6", "#8fb9c9"];

  function classify(t, h) {
    const walk = t.average_walkscore, kids = t.children_perc;
    if (walk > 88 && t.average_transitscore > 75) return h < 0.6 ? "tower" : "midrise";
    if (walk > 72) return h < 0.15 ? "tower" : h < 0.7 ? "midrise" : "house";
    if (walk < 30 && kids < 9 && t.renter_households_perc < 30) return h < 0.7 ? "industrial" : "house";
    if (walk < 45 && h < 0.1) return "shops";
    return h < 0.1 ? "midrise" : "house";
  }

  // land kept clear around landmarks (their sprites are drawn LM_SCALE times real size)
  const LM_CLEAR = { campus: 170, mall: 190, zoo: 190, airport: 220, stampede: 120, stadium: 110, hospital: 85, kidsHospital: 70, cityHall: 70, saddledome: 85, heritage: 110, skiJump: 60, library: 75, studioBell: 50, spark: 75, bow: 60, calgaryTower: 30, tower: 35, peaceBridge: 20, fort: 50 };
  world.LM_SCALE = 3;
  function isReserved(x, y) {
    for (const l of CP.LANDMARKS) if (CP.dist(l.pos[0], l.pos[1], x, y) < (LM_CLEAR[l.kind] || 50) * world.LM_SCALE + 220) return true;
    for (const r of world.reserved) if (CP.dist(r[0], r[1], x, y) < r[2]) return true;
    return false;
  }
  world.clearCells = () => cache.clear();

  world.cell = function (bx, by) {
    const key = bx * 4096 + by;
    let c = cache.get(key);
    if (c) return c;
    const B = world.CELL;
    const rand = CP.rng(bx * 92821 + by * 68917 + 7);
    const cx = (bx + 0.3 + rand() * 0.4) * B, cy = (by + 0.3 + rand() * 0.4) * B;
    const t = sim.tractAt(cx, cy);
    c = { cx, cy, t, items: [], ground: null };
    cache.set(key, c);
    if (!t) return c;
    if (world.waterAt(cx, cy, 170)) { c.ground = "water"; return c; }

    const h = rand();
    const bigPark = world.bigParkAt(cx, cy);
    const isPark = bigPark || CP.hash(bx, by, 11) < (t.park_area_perc / 100) * 0.9;
    const cls = isPark ? "park" : classify(t, h);
    c.ground = cls === "park" ? "park" : cls === "industrial" ? "lot" : cls === "house" ? "lawn" : "plaza";
    const canopy = t.tree_canopy / 100;
    const tree = (x, y) => {
      for (const r of world.reserved) if (CP.dist(r[0], r[1], x, y) < r[2]) return;
      if (!world.waterAt(x, y, 60) && !world.highwayAt(x, y, 60)) c.items.push({ type: "tree", x, y, s: 42 + rand() * 30, hue: rand() });
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    if (cls === "park") {
      const n = Math.round(3 + canopy * 12 + (bigPark ? 3 : 0));
      for (let i = 0; i < n; i++) tree(cx + (rand() - 0.5) * B * 0.8, cy + (rand() - 0.5) * B * 0.8);
      return c;
    }
    const clear = !world.highwayAt(cx, cy, 190) && !isReserved(cx, cy);
    if (clear) {
      if (cls === "house") c.items.push({ type: "amb", kind: "house", x: cx, y: cy, wall: pick(WALLS), roof: pick(ROOFS), h: 11 + rand() * 4 });
      else if (cls === "midrise") c.items.push({ type: "amb", kind: "midrise", x: cx, y: cy, wall: pick(WALLS), h: 30 + rand() * 28 });
      else if (cls === "tower") c.items.push({ type: "amb", kind: "tower", x: cx, y: cy, wall: pick(GLASS), h: 70 + rand() * 70 });
      else if (cls === "shops") c.items.push({ type: "amb", kind: "shops", x: cx, y: cy, wall: "#f0e4cc", roof: pick(["#e63946", "#2a9d8f", "#f4a261", "#457b9d"]) });
      else if (cls === "industrial") c.items.push({ type: "amb", kind: "industrial", x: cx, y: cy, wall: "#c9c5bb", roof: rand() < 0.5 ? "#8fa3b5" : "#b0b4b8", stack: rand() < 0.5 });
    }
    const nTrees = cls === "house" ? Math.round(canopy * 14 + rand()) : cls === "industrial" ? 0 : Math.round(canopy * 6);
    for (let i = 0; i < nTrees; i++) {
      const a = rand() * 7, r = 230 + rand() * 180;
      tree(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
    }
    return c;
  };
})();
