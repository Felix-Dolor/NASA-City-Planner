// World generation: pre-rendered satellite terrain + deterministic street-level blocks.
(function () {
  const CP = window.CP;
  const sim = CP.sim;
  const G = CP.GEO;
  const D = window.CEI_DATA;

  const world = (CP.world = {});
  world.PLANET_R = 72000; // radius of the visible "planet" disc in metres
  world.BLOCK = 120; // street grid spacing
  world.ROAD = 14; // street width

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
        const n = CP.hash(x, y, 3);
        let r, g, bl;
        if (!t) {
          px[o + 3] = 0; // let the regional farmland show through
          continue;
        } else {
          const dens = t.average_walkscore / 100;
          const canopy = t.tree_canopy / 100;
          const park = t.park_area_perc / 100;
          const blk = Math.round(CP.lerp(9, 5, dens));
          const street = x % blk === 0 || y % blk === 0;
          const zone = CP.hash(Math.floor(wx / 260), Math.floor(wy / 260), 11);
          if (zone < park * 0.9) {
            const k = 0.85 + n * 0.25;
            r = 92 * k; g = 150 * k; bl = 76 * k;
            if (n < canopy * 1.6 + 0.1) { r = 52; g = 102 + n * 30; bl = 52; }
          } else if (n < canopy * 1.25) {
            r = 54 + n * 30; g = 104 + n * 40; bl = 56;
          } else if (street) {
            r = g = bl = 120 + dens * 30;
          } else {
            const roof = CP.hash(x >> 1, y >> 1, 7);
            const light = 0.8 + roof * 0.35;
            const cool = dens; // denser = greyer, suburbs = warmer roofs / lawns
            r = CP.lerp(196, 150, cool) * light;
            g = CP.lerp(182, 150, cool) * light;
            bl = CP.lerp(150, 158, cool) * light;
            if (roof < 0.22 && dens < 0.6) { r = 128; g = 160; bl = 96; } // lawns
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

  // ---------- street-level blocks ----------
  // Each 120 m block becomes lots, buildings and trees according to the tract it sits in
  // (walk score, canopy, park share, children) and any zoning the player painted.
  const cache = new Map();
  world.invalidate = function (x, y, r) {
    for (const [k, v] of cache) if (CP.dist(v.cx, v.cy, x, y) < r + 200) cache.delete(k);
  };
  world.invalidateAll = () => cache.clear();

  world.zoneAt = function (x, y) {
    const cx = Math.floor(x / CP.ZONE_CELL), cy = Math.floor(y / CP.ZONE_CELL);
    return world.zones.get(cx + "," + cy);
  };
  world.zones = new Map(); // "cx,cy" -> placement

  const ROOFS = ["#c0504d", "#8c5a3c", "#5d6d7e", "#a9746e", "#6b8e23", "#7a6a5a", "#3e5c76", "#b5651d", "#8e8e8e"];
  const WALLS = ["#f2e6d0", "#e8d8c3", "#d9d4cc", "#f5efe6", "#e0cda9", "#cfd8dc"];
  const GLASS = ["#6fa8dc", "#7fb3d5", "#5d8aa8", "#9bc4e2", "#4f7fa6", "#8fb9c9"];

  function classify(t, zone, h) {
    if (zone) {
      return { dense: h < 0.25 ? "tower" : "midrise", suburban: "house", commercial: "shops", industrial: "industrial" }[zone.type];
    }
    if (!t) return "farm";
    const walk = t.average_walkscore, kids = t.children_perc;
    if (walk > 88 && t.average_transitscore > 75) return h < 0.6 ? "tower" : "midrise";
    if (walk > 72) return h < 0.15 ? "tower" : h < 0.75 ? "midrise" : "house";
    if (walk < 30 && kids < 9 && t.renter_households_perc < 30) return h < 0.7 ? "industrial" : "house";
    if (walk < 45 && h < 0.07) return "shops";
    return h < 0.08 ? "midrise" : "house";
  }

  // land kept clear of procedural buildings: landmarks and every service building
  const LM_CLEAR = { campus: 170, mall: 190, zoo: 190, airport: 220, stampede: 120, stadium: 110, hospital: 85, kidsHospital: 70, cityHall: 70, saddledome: 85, heritage: 110, skiJump: 60, library: 75, studioBell: 50, spark: 75, bow: 60, calgaryTower: 30, tower: 35, peaceBridge: 20, fort: 50 };
  function reservedNear(cx, cy) {
    const out = [];
    for (const l of CP.LANDMARKS) {
      if (l.placement && l.placement.removed) continue;
      const r = LM_CLEAR[l.kind] || 50;
      if (CP.dist(l.pos[0], l.pos[1], cx, cy) < r + 120) out.push([l.pos[0], l.pos[1], r]);
    }
    for (const p of sim.placements) {
      if (p.removed || (p.kind !== "building" && p.kind !== "existing") || p.type === "trees" || p.type === "park") continue;
      if (Math.abs(p.x - cx) > 200 || Math.abs(p.y - cy) > 200) continue;
      const sh = CP.sprites && CP.sprites.SHAPES[p.type];
      out.push([p.x, p.y, sh ? Math.max(sh.w, sh.d) * 0.6 : 25]);
    }
    return out;
  }

  world.block = function (bx, by) {
    const key = bx + "," + by;
    let c = cache.get(key);
    if (c) return c;
    const B = world.BLOCK, Rd = world.ROAD;
    const x0 = bx * B + Rd / 2, y0 = by * B + Rd / 2, x1 = (bx + 1) * B - Rd / 2, y1 = (by + 1) * B - Rd / 2;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const t = sim.tractAt(cx, cy);
    const zone = world.zoneAt(cx, cy);
    const rand = CP.rng(bx * 92821 + by * 68917 + 7);
    const h = rand();
    c = { cx, cy, x0, y0, x1, y1, t, items: [], ground: null, zone };
    cache.set(key, c);
    if (cache.size > 4000) cache.delete(cache.keys().next().value);

    if (world.waterAt(cx, cy, 25)) { c.ground = "water"; return c; }
    const hw = world.highwayAt(cx, cy, 30);
    const bigPark = world.bigParkAt(cx, cy);
    const playerPark = sim.active((p) => p.kind === "building" && p.type === "park" && CP.dist(p.x, p.y, cx, cy) < 170)[0];
    const parkChance = t ? (t.park_area_perc / 100) * 0.8 : 0;
    let cls = classify(t, zone, h);
    if (playerPark || bigPark || (!zone && t && CP.hash(Math.floor(cx / 260), Math.floor(cy / 260), 11) < parkChance * 0.9)) cls = "park";
    c.cls = cls;
    c.ground = cls === "farm" ? "farm" : cls === "park" ? "park" : cls === "industrial" ? "lot" : cls === "house" ? "lawn" : "plaza";

    const canopy = t ? t.tree_canopy / 100 : 0.02;
    const addTree = (x, y, s) => c.items.push({ type: "tree", x, y, s: s || 4 + rand() * 4, hue: rand() });
    const reserved = reservedNear(cx, cy);
    // keep the skyline readable: generic towers stay short right in front of signature towers
    let heightCap = Infinity;
    for (const l of CP.LANDMARKS) {
      if (l.h < 120) continue;
      const dx = cx - l.pos[0], dy = cy - l.pos[1];
      if (Math.abs(dx) < 260 && dy > -60 && dy < 420) heightCap = Math.min(heightCap, 30 + Math.max(0, dy - 200) * 0.3);
    }
    const box = (x, y, w, d, hh, style) => {
      for (const r of reserved) if (CP.dist(x + w / 2, y + d / 2, r[0], r[1]) < r[2] + Math.max(w, d) / 2) return;
      if (hw && world.highwayAt(x + w / 2, y + d / 2, 10)) return;
      if (world.waterAt(x + w / 2, y + d / 2, 10)) return;
      c.items.push(Object.assign({ type: "box", x, y, w, d, h: Math.min(hh, heightCap) }, style));
    };
    const W = x1 - x0, H = y1 - y0;

    if (cls === "farm") {
      if (rand() < 0.08) box(x0 + 20 + rand() * 40, y0 + 20 + rand() * 40, 14, 10, 6, { roof: "#9b2d20", wall: "#d8c7a8" });
      if (rand() < 0.3) addTree(x0 + rand() * W, y0 + rand() * H, 6);
      c.fieldHue = CP.hash(Math.floor(cx / 800), Math.floor(cy / 800), 9);
    } else if (cls === "park") {
      const n = Math.round(6 + canopy * 40 + (bigPark ? 10 : 0));
      for (let i = 0; i < n; i++) addTree(x0 + rand() * W, y0 + rand() * H);
      c.path = rand() < 0.7;
      if (rand() < 0.25) c.pond = { x: x0 + W * (0.3 + rand() * 0.4), y: y0 + H * (0.3 + rand() * 0.4), r: 10 + rand() * 12 };
      if (rand() < 0.2) c.items.push({ type: "playground", x: x0 + 20 + rand() * (W - 40), y: y0 + 20 + rand() * (H - 40) });
    } else if (cls === "house") {
      // two rows of detached homes facing the streets
      const lotW = 16 + rand() * 4;
      const n = Math.floor(W / lotW);
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < n; i++) {
          const lx = x0 + i * lotW + 2, ly = row === 0 ? y0 + 6 : y1 - 20;
          if (rand() < 0.06) continue;
          const roof = ROOFS[Math.floor(rand() * ROOFS.length)];
          box(lx + 1, ly, lotW - 5, 12, 5 + rand() * 4, { roof, wall: WALLS[Math.floor(rand() * WALLS.length)], house: true });
          if (rand() < canopy * 3 + 0.15) addTree(lx + lotW / 2, row === 0 ? ly + 26 : ly - 10);
        }
      }
      for (let i = 0; i < canopy * 25; i++) addTree(x0 + rand() * W, y0 + H * (0.4 + rand() * 0.2));
    } else if (cls === "midrise") {
      const nx = 2 + Math.floor(rand() * 2), ny = 2;
      const gw = W / nx, gh = H / ny;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          if (rand() < 0.1) { addTree(x0 + (i + 0.5) * gw, y0 + (j + 0.5) * gh, 7); continue; }
          const hh = 12 + rand() * 30;
          box(x0 + i * gw + 3, y0 + j * gh + 3, gw - 6, gh - 6, hh, {
            roof: "#9aa0a6", wall: WALLS[Math.floor(rand() * WALLS.length)], windows: true, shop: j === 1 && rand() < 0.5,
          });
        }
      for (let i = 0; i < canopy * 12; i++) addTree(x0 + rand() * W, y0 - 2 + (rand() < 0.5 ? 0 : H + 4), 4);
    } else if (cls === "tower") {
      const n = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        const w = 26 + rand() * 18, d = 24 + rand() * 18;
        const hh = 60 + rand() * 140;
        box(x0 + (n === 1 ? (W - w) / 2 : i * (W / 2) + 4), y0 + (H - d) / 2 + (rand() - 0.5) * 20, w, d, hh, {
          roof: "#7d8790", glass: GLASS[Math.floor(rand() * GLASS.length)], windows: true,
        });
      }
      for (let i = 0; i < 4; i++) addTree(x0 + rand() * W, y0 + 3, 3.5);
    } else if (cls === "shops") {
      box(x0 + 6, y0 + 6, W - 12, H * 0.45, 7 + rand() * 4, { roof: "#cfd2d6", wall: "#f0e4cc", shop: true, sign: Math.floor(rand() * 5) });
      c.parking = true;
    } else if (cls === "industrial") {
      const n = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        box(x0 + 6 + i * (W / n), y0 + 10, W / n - 12, H * 0.55, 9 + rand() * 6, { roof: rand() < 0.5 ? "#8fa3b5" : "#b0b4b8", wall: "#c9c5bb", industrial: true, stack: rand() < 0.4 });
      }
      c.parking = true;
    }
    return c;
  };
})();
