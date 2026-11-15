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
  // roads and tracks are merged into one Path2D per class, so a frame needs only a handful of strokes
  const merge = (list, mk) => {
    const p = new Path2D();
    for (const r of list) p.addPath(mk(r));
    return p;
  };
  // roads are grouped into 4 km tiles so a frame only strokes the tiles that are on screen
  const TILE = 4000;
  G.roadTiles = new Map();
  for (const r of G.roads) {
    const mid = r.line[Math.floor(r.line.length / 2)];
    const key = Math.floor(mid[0] / TILE) + "," + Math.floor(mid[1] / TILE);
    let t = G.roadTiles.get(key);
    if (!t) G.roadTiles.set(key, (t = { 2: new Path2D(), 3: new Path2D(), bb: [Infinity, Infinity, -Infinity, -Infinity] }));
    t[r.cls === 3 ? 3 : 2].addPath(linePath(r.line));
    t.bb = [Math.min(t.bb[0], r.bb[0]), Math.min(t.bb[1], r.bb[1]), Math.max(t.bb[2], r.bb[2]), Math.max(t.bb[3], r.bb[3])];
  }
  G.roads.forEach((r) => { if (!r.cls) r.path = linePath(r.line); }); // hand-traced fallback roads only
  G.ctrainPath = merge(G.ctrain, (r) => linePath(r.line));
  for (const l of G.landuse) { l.kind = l.z; l.path = polyPath(l.poly); }
  world.polyPath = polyPath;
  G.airportPath = polyPath(G.airport);

  // ---------- spatial queries ----------
  const inBB = (bb, x, y, pad) => !bb || (x >= bb[0] - pad && x <= bb[2] + pad && y >= bb[1] - pad && y <= bb[3] + pad);
  world.waterAt = function (x, y, pad) {
    pad = pad || 0;
    for (const r of G.rivers) if (inBB(r.bb, x, y, r.width + pad) && CP.distToLine(x, y, r.line) < r.width / 2 + pad) return true;
    for (const l of G.lakes) if (inBB(l.bb, x, y, 0) && CP.pointInPoly(x, y, l.poly)) return true;
    return false;
  };
  world.bigParkAt = function (x, y) {
    for (const l of G.bigParks) if (inBB(l.bb, x, y, 0) && CP.pointInPoly(x, y, l.poly)) return l;
    return null;
  };
  world.highwayAt = function (x, y, pad) {
    pad = pad || 0;
    for (const r of G.roads) if (inBB(r.bb, x, y, r.w + pad) && CP.distToLine(x, y, r.line) < r.w / 2 + pad) return r;
    return null;
  };

  // ---------- land-use raster: which zone is at any point ----------
  // Every OSM land-use polygon is painted once onto an 80 m grid (R/C/I, then parks, then water on top), so
  // zoneAt() is a single array lookup. Codes: 0 none, 1 residential, 2 commercial, 3 industrial, 4 park, 5 water.
  const CODE_OF = { R: 1, C: 2, I: 3 };
  const ZG = 80, ZB = D.bounds;
  const ZW = Math.ceil((ZB[2] - ZB[0] + 6000) / ZG), ZH = Math.ceil((ZB[3] - ZB[1] + 6000) / ZG);
  const zx0 = ZB[0] - 3000, zy0 = ZB[1] - 3000;
  const zoneGrid = new Uint8Array(ZW * ZH);
  (function paintZones() {
    const c = document.createElement("canvas");
    c.width = ZW; c.height = ZH;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.setTransform(1 / ZG, 0, 0, 1 / ZG, -zx0 / ZG, -zy0 / ZG);
    const paint = (path, code) => { g.fillStyle = `rgb(${code},0,0)`; g.fill(path); };
    for (const l of G.landuse) paint(l.path, CODE_OF[l.z]);
    for (const l of G.bigParks) paint(l.path, 4);
    G.lakes.forEach((l) => paint(l.path, 5));
    g.strokeStyle = "rgb(5,0,0)";
    for (const r of G.rivers) { g.lineWidth = Math.max(r.width, ZG); g.stroke(r.path); }
    const px = g.getImageData(0, 0, ZW, ZH).data;
    for (let i = 0; i < zoneGrid.length; i++) zoneGrid[i] = px[i * 4 + 3] < 128 ? 0 : Math.round(px[i * 4] / 1);
  })();
  const ZONE_CODE = ["", "R", "C", "I", "P", "W"];
  world.zoneAt = function (x, y) {
    const cx = Math.floor((x - zx0) / ZG), cy = Math.floor((y - zy0) / ZG);
    if (cx < 0 || cy < 0 || cx >= ZW || cy >= ZH) return "";
    return ZONE_CODE[zoneGrid[cy * ZW + cx]] || "";
  };
  // share of residential / commercial / industrial / park land in a square around a point (for traffic and stats)
  world.zoneMix = function (x, y, r) {
    const out = { R: 0, C: 0, I: 0, P: 0, W: 0, n: 0 };
    for (let yy = y - r; yy <= y + r; yy += ZG * 2)
      for (let xx = x - r; xx <= x + r; xx += ZG * 2) {
        const z = world.zoneAt(xx, yy);
        out.n++;
        if (z) out[z]++;
      }
    return out;
  };

  // ---------- satellite terrain (pixel-level, fast) ----------
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // Flat-colour ground: every tract gets one calm colour from its real land use (no per-pixel noise),
  // so lots, buildings and borders stand out.
  function buildCityTerrain() {
    const M = 3000;
    const b = D.bounds;
    const mpp = 18; // metres per pixel
    const x0 = b[0] - M, y0 = b[1] - M;
    const W = Math.ceil((b[2] - b[0] + 2 * M) / mpp), H = Math.ceil((b[3] - b[1] + 2 * M) / mpp);
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.setTransform(1 / mpp, 0, 0, 1 / mpp, -x0 / mpp, -y0 / mpp);
    ctx.fillStyle = world.GROUND;
    ctx.strokeStyle = world.GROUND;
    ctx.lineWidth = mpp * 1.5; // seal hairline gaps between tracts
    D.tracts.forEach((t) => { ctx.fill(t.path); ctx.stroke(t.path); });
    drawVectorTerrain(ctx, mpp);
    return { canvas: c, x0, y0, mpp, W, H };
  }

  // Flat-colour land use drawn once into the terrain canvas: zones, parks, water, then roads on top.
  world.GROUND = "#ebe9e1";
  world.ZONE_FILL = { R: "#f7e7a8", C: "#f6b9c6", I: "#d3c4f3" };
  world.PARK_FILL = "#b4e0a4";
  world.WATER_FILL = "#82c0ea";
  function drawVectorTerrain(ctx, mpp) {
    ctx.lineCap = ctx.lineJoin = "round";
    const city = (world.cityPath = new Path2D());
    D.tracts.forEach((t) => city.addPath(t.path));
    ctx.fillStyle = "rgba(150,150,150,0.55)";
    ctx.fill(G.airportPath);
    const [ax, ay] = CP.project(51.128, -114.02);
    ctx.strokeStyle = "#555a60";
    ctx.lineWidth = 60;
    [[0, -2400, 0, 2400], [-1800, -900, 1500, 900], [-2000, 1200, 1600, 1500]].forEach(([a, b, c, d]) => {
      ctx.beginPath(); ctx.moveTo(ax + a, ay + b); ctx.lineTo(ax + c, ay + d); ctx.stroke();
    });
    G.rivers.forEach((r) => {
      ctx.strokeStyle = world.WATER_FILL;
      ctx.lineWidth = Math.max(r.width * 1.2, mpp * 1.6);
      ctx.stroke(r.path);
    });
    G.lakes.forEach((l) => { ctx.fillStyle = world.WATER_FILL; ctx.fill(l.path); });
    // road network, quiet: thin white streets, wider arterials, amber freeways
    const road = (path, casing, fill, wc, wf) => {
      ctx.strokeStyle = casing; ctx.lineWidth = Math.max(wc, mpp * 1.4); ctx.stroke(path);
      ctx.strokeStyle = fill; ctx.lineWidth = Math.max(wf, mpp * 0.9); ctx.stroke(path);
    };
    for (const t of G.roadTiles.values()) {
      road(t[2], "rgba(90,90,100,0.7)", "#ffffff", 34, 22);
      road(t[3], "rgba(90,70,30,0.8)", "#ffc857", 48, 32);
    }
    // C-Train
    ctx.strokeStyle = "#d71920"; ctx.lineWidth = Math.max(26, mpp * 1.6); ctx.stroke(G.ctrainPath);
  }

  function buildFarTerrain() {
    const R = world.PLANET_R;
    const mpp = 200;
    const W = Math.ceil((2 * R) / mpp);
    const c = makeCanvas(W, W);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(W, W);
    const px = img.data;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const wx = -R + x * mpp, wy = -R + y * mpp;
        const n = CP.hash(Math.floor(wx / 2400), Math.floor(wy / 2400), 1); // big calm patches, no pixel speckle
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
          if (n < 0.35) col = [72, 104, 70];
        } else if (west > 30000) {
          col = n < 0.25 ? [120, 140, 92] : [140, 152, 102];
        } else {
          // quarter-section farmland: gentle variations of prairie gold and green
          const fx = Math.floor(wx / 800), fy = Math.floor(wy / 800);
          const f = CP.hash(fx, fy, 21);
          const pal = [[194, 186, 140], [186, 182, 132], [190, 184, 138], [182, 180, 128], [196, 190, 146], [184, 182, 134]]; // calm, low-contrast fields
          col = pal[Math.floor(f * pal.length)];
          const edge = (wx - fx * 800 < 110 || wy - fy * 800 < 110);
          if (edge) col = [col[0] * 0.97, col[1] * 0.97, col[2] * 0.96];
        }
        const k = 1.14;
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
  // is (x, y) on top of a landmark sprite? (scale < 1 relaxes the check)
  world.landmarkNear = function (x, y, scale) {
    for (const l of CP.LANDMARKS) if (CP.dist(l.pos[0], l.pos[1], x, y) < ((LM_CLEAR[l.kind] || 50) * world.LM_SCALE + 350) * (scale || 1)) return true;
    return false;
  };

  // ---------- zone clusters ----------
  // Instead of scattering buildings, each real land-use polygon gets a few compact, recognisable clusters:
  //   residential -> a neighbourhood block of houses (towers/midrises where the tract is dense),
  //   commercial  -> a business/shopping centre (towers downtown, shops in the suburbs),
  //   industrial  -> a plant: one big factory with stacks plus a few sheds,
  //   parks       -> a grove of trees.
  // The rest of the zone stays flat colour, so the map reads as zones with a few landmarks, not as noise.
  const CODE = { R: 1, C: 2, I: 3 };
  const polyArea = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  };
  world.clusters = [];
  const cellItems = new Map();
  const homeSites = [];
  const SITE_CELL = (x, y) => Math.floor(x / world.CELL) * 4096 + Math.floor(y / world.CELL);
  let curKind = null;
  let curItems = null; // the cluster currently being built collects its own items (so it can be removed later)
  function pushItem(it) {
    if (world.waterAt(it.x, it.y, 60) || world.highwayAt(it.x, it.y, 80) || isReserved(it.x, it.y)) return false;
    const k = SITE_CELL(it.x, it.y);
    let l = cellItems.get(k);
    if (!l) cellItems.set(k, (l = []));
    l.push(it);
    if (curKind) it.zk = curKind; // which zone layer this belongs to (for the layer toggles)
    if (curItems) curItems.push(it);
    return true;
  }
  function anchors(poly, bb, kind, n, sep) {
    const cands = [];
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    for (let x = bb[0]; x <= bb[2]; x += 250)
      for (let y = bb[1]; y <= bb[3]; y += 250)
        if (world.zoneAt(x, y) === kind && world.zoneAt(x + 120, y) === kind && world.zoneAt(x - 120, y) === kind && world.zoneAt(x, y + 120) === kind && world.zoneAt(x, y - 120) === kind && sim.tractAt(x, y)) cands.push([x, y]);
    cands.sort((a, b) => CP.dist(a[0], a[1], cx, cy) - CP.dist(b[0], b[1], cx, cy));
    const got = [];
    for (const c of cands) {
      if (got.length >= n) break;
      if (got.every((g) => CP.dist(g[0], g[1], c[0], c[1]) > sep)) got.push(c);
    }
    return got;
  }
  // one compact cluster of buildings of a given kind at (x, y); size = how many nearby clusters were merged into it
  // (bigger groups get a bigger block). Returns { label, r } where r is its footprint radius in metres.
  function genCluster(kind, x, y, t, rand, size) {
    size = size || 1;
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const walk = t.average_walkscore, transit = t.average_transitscore, canopy = t.tree_canopy / 100;
    if (kind === "R") {
      // existing residential: a block of homes; merged neighbourhoods become one bigger block
      const cols = Math.min(6, 3 + Math.floor(size * 0.8)), rows = size > 3 ? 3 : 2;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const hx = x + (i - (cols - 1) / 2) * 190 + (rand() - 0.5) * 30, hy = y + (j - (rows - 1) / 2) * 190 + (rand() - 0.5) * 30;
          const k = walk > 84 && rand() < 0.5 ? "tower" : walk > 68 && rand() < 0.5 ? "midrise" : "house";
          const base = { type: "amb", kind: k, x: hx, y: hy };
          if (k === "house") Object.assign(base, { wall: pick(WALLS), roof: pick(ROOFS), h: 11 + rand() * 4 });
          else if (k === "midrise") Object.assign(base, { wall: pick(WALLS), h: 30 + rand() * 28 });
          else Object.assign(base, { wall: pick(GLASS), h: 70 + rand() * 70 });
          pushItem(base);
        }
      for (let i = 0; i < Math.round(canopy * 3 + size); i++) pushItem({ type: "tree", x: x + (rand() - 0.5) * cols * 190, y: y + (rand() - 0.5) * rows * 190, s: 42 + rand() * 30, hue: rand() });
      return { label: "Existing residential", r: Math.max(420, (cols * 190) / 2 + 170) };
    }
    if (kind === "C") {
      const down = walk > 86 && transit > 70;
      const cols = Math.min(4, 2 + Math.floor(size / 2));
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < 2; j++) {
          const hx = x + (i - (cols - 1) / 2) * 240, hy = y + (j - 0.5) * 220;
          const k = down ? (rand() < 0.6 ? "tower" : "midrise") : walk > 62 ? (rand() < 0.6 ? "midrise" : "shops") : "shops";
          const it = { type: "amb", kind: k, x: hx, y: hy };
          if (k === "tower") Object.assign(it, { wall: pick(GLASS), h: 70 + rand() * 70 });
          else if (k === "midrise") Object.assign(it, { wall: pick(WALLS), h: 30 + rand() * 28 });
          else Object.assign(it, { wall: "#f0e4cc", roof: pick(["#e63946", "#2a9d8f", "#f4a261", "#457b9d"]) });
          pushItem(it);
        }
      return { label: down ? "Business core" : walk > 62 ? "Mixed-use centre" : "Shopping centre", r: Math.max(400, (cols * 240) / 2 + 130) };
    }
    pushItem({ type: "amb", kind: "industrial", x, y, wall: "#c9c5bb", roof: "#8fa3b5", stack: true });
    const sheds = [[-260, 40], [250, -30], [10, 240], [-30, -250], [300, 230]].slice(0, 2 + Math.min(3, size));
    for (const [dx, dy] of sheds) pushItem({ type: "amb", kind: "industrial", x: x + dx, y: y + dy, wall: "#c9c5bb", roof: "#b0b4b8", stack: false });
    return { label: "Industrial plant", r: 440 + (size > 1 ? 60 : 0) };
  }
  const KIND_LABEL = { R: "Existing residential", C: "Shopping centre", I: "Industrial plant" };
  // a spot for a new cluster inside a zone: the most central open point, or its centroid
  world.zoneAnchor = function (zone) {
    const a = anchors(zone.poly, zone.bb, zone.kind, 1, 1);
    if (a.length) return { x: a[0][0], y: a[0][1] };
    return { x: zone.poly.reduce((s, p) => s + p[0], 0) / zone.poly.length, y: zone.poly.reduce((s, p) => s + p[1], 0) / zone.poly.length };
  };
  world.addCluster = function (kind, x, y, zone) {
    const t = sim.tractAt(x, y) || D.tracts[0];
    const cl = { id: world.clusters.length, kind, x, y, label: KIND_LABEL[kind], items: [], removed: false, zone, d: sim.districtAt(x, y) };
    world.clusters.push(cl);
    curItems = cl.items;
    curKind = kind;
    const g = genCluster(kind, x, y, t, CP.rng(cl.id * 97 + 5), 1);
    cl.label = g.label;
    cl.r = g.r;
    curItems = null;
    curKind = null;
    if (zone) zone.clusters.push(cl);
    return cl;
  };

  function buildClusters() {
    const rand = CP.rng(77);
    const mk = (kind, x, y, label, zone) => {
      const cl = { id: world.clusters.length, kind, x, y, label, items: [], removed: false, zone };
      world.clusters.push(cl);
      zone.clusters.push(cl);
      curItems = cl.items;
      curKind = kind;
      return cl;
    };
    world.zones = G.landuse.concat(G.bigParks);
    for (const z of world.zones) { z.clusters = []; if (!z.kind) z.kind = "P"; z.area = polyArea(z.poly); if (!z.path) z.path = world.polyPath(z.poly); }
    // 1) every candidate anchor in every real zone polygon
    const found = [];
    for (const l of G.landuse) {
      const area = l.area;
      const cfg = l.z === "R" ? [0.3e6, 1.2e6, 3, 1500] : l.z === "C" ? [0.1e6, 0.6e6, 3, 1000] : [0.6e6, 3.0e6, 3, 1700];
      if (area < cfg[0]) continue;
      const n = Math.max(1, Math.min(cfg[2], Math.round(area / cfg[1])));
      for (const [x, y] of anchors(l.poly, l.bb, l.z, n, cfg[3])) if (sim.tractAt(x, y)) found.push({ kind: l.z, x, y, zone: l });
    }
    // 2) anchors of the same kind that sit close together become ONE group (one bigger cluster, one label)
    const JOIN = { R: 2600, C: 1700, I: 2300 };
    // bounded greedy grouping (not chained): each seed takes up to 3 unused neighbours of its kind within JOIN metres
    const used = new Set();
    const groups = new Map();
    found.forEach((f, i) => {
      if (used.has(i)) return;
      used.add(i);
      const g = [f];
      for (let j = i + 1; j < found.length && g.length < 4; j++)
        if (!used.has(j) && found[j].kind === f.kind && CP.dist(f.x, f.y, found[j].x, found[j].y) < JOIN[f.kind]) { g.push(found[j]); used.add(j); }
      groups.set(i, g);
    });
    for (const g of groups.values()) {
      const kind = g[0].kind;
      const cx = g.reduce((a, f) => a + f.x, 0) / g.length, cy = g.reduce((a, f) => a + f.y, 0) / g.length;
      // keep the centre on land of this kind: fall back to the member nearest the centre
      const near = g.slice().sort((a, b) => CP.dist(a.x, a.y, cx, cy) - CP.dist(b.x, b.y, cx, cy))[0];
      const ok = world.zoneAt(cx, cy) === kind && sim.tractAt(cx, cy);
      const x = ok ? cx : near.x, y = ok ? cy : near.y;
      const t = sim.tractAt(x, y);
      if (!t) continue;
      const cl = mk(kind, x, y, "", near.zone);
      const res = genCluster(kind, x, y, t, rand, g.length);
      cl.label = res.label;
      cl.r = res.r;
      cl.merged = g.length;
    }
    // parks: one grove each
    for (const p of G.bigParks) {
      if (p.area < 0.6e6) continue;
      for (const [x, y] of anchors(p.poly, p.bb, "P", 1, 1500)) {
        mk("P", x, y, p.name || "Park", p);
        for (let i = 0; i < 6; i++) pushItem({ type: "tree", x: x + (rand() - 0.5) * 420, y: y + (rand() - 0.5) * 320, s: 48 + rand() * 30, hue: rand() });
      }
    }
    curItems = null;
    curKind = null;
    // homes (for effect circles): every residential 300 m site, whether or not it is drawn
    const b = D.bounds;
    for (let x = b[0]; x < b[2]; x += 300)
      for (let y = b[1]; y < b[3]; y += 300) {
        if (world.zoneAt(x, y) !== "R") continue;
        const t = sim.tractAt(x, y);
        if (!t) continue;
        homeSites.push({ x, y, w: t.average_walkscore > 84 ? 6 : t.average_walkscore > 68 ? 3 : 1 });
      }
  }
  world.build = (function (orig) {
    return function () { orig(); buildClusters(); };
  })(world.build);
  world.homeSites = () => homeSites;

  // ---------- zones you can hover, click, remove from and rezone ----------
  // the zone polygon under a point (residential / commercial / industrial / park), preferring the one the raster says is there
  world.zoneAtPoint = function (x, y) {
    const want = world.zoneAt(x, y);
    if (!want || want === "W") return null;
    let best = null;
    for (const z of world.zones) {
      const b = z.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3] || !CP.pointInPoly(x, y, z.poly)) continue;
      const fit = z.kind === want;
      if (!best || (fit && !best.fit) || (fit === best.fit && z.area < best.z.area)) best = { z, fit };
    }
    return best ? best.z : null;
  };
  // share of a district's land by zone, from the raster (R / C / I / P / none)
  const mixCache = new Map();
  world.districtMix = function (d) {
    if (mixCache.has(d.id)) return mixCache.get(d.id);
    const out = { R: 0, C: 0, I: 0, P: 0, none: 0, n: 0 };
    for (let x = d.bbox[0]; x <= d.bbox[2]; x += 160)
      for (let y = d.bbox[1]; y <= d.bbox[3]; y += 160) {
        if (sim.districtAt(x, y) !== d) continue;
        const z = world.zoneAt(x, y);
        out.n++;
        out[z && z !== "W" ? z : "none"]++;
      }
    mixCache.set(d.id, out);
    return out;
  };
  // change a zone's land use: repaint the raster and the zone fills
  world.setZoneKind = function (zone, kind) {
    zone.kind = kind;
    const code = CODE[kind];
    for (let y = zone.bb[1]; y <= zone.bb[3]; y += ZG)
      for (let x = zone.bb[0]; x <= zone.bb[2]; x += ZG) {
        if (!CP.pointInPoly(x, y, zone.poly) || world.zoneAt(x, y) === "W") continue;
        const cx = Math.floor((x - zx0) / ZG), cy = Math.floor((y - zy0) / ZG);
        if (cx >= 0 && cy >= 0 && cx < ZW && cy < ZH) zoneGrid[cy * ZW + cx] = code;
      }
    zone.rezoned = true;
    world.rezoned = G.landuse.filter((l) => l.rezoned);
    mixCache.clear();
  };

  // the removable cluster under a world point, inside one district (parks are scenery, not removable)
  world.clusterAt = function (x, y, d) {
    let best = null, bd = Infinity;
    for (const cl of world.clusters) {
      if (cl.kind === "P" || cl.removed) continue;
      if (cl.d === undefined) cl.d = sim.districtAt(cl.x, cl.y);
      if (d && cl.d !== d) continue;
      const dd = CP.dist(cl.x, cl.y, x, y);
      if (dd < (cl.r || 420) && dd < bd) { bd = dd; best = cl; }
    }
    return best;
  };
  // take a cluster's buildings off the map
  world.removeCluster = function (cl) {
    cl.removed = true;
    for (const it of cl.items) {
      const l = cellItems.get(SITE_CELL(it.x, it.y));
      if (l) { const i = l.indexOf(it); if (i >= 0) l.splice(i, 1); }
    }
  };

  // the scenery in one 900 m cell (items placed by the clusters above)
  world.cell = function (bx, by) {
    return { cx: (bx + 0.5) * world.CELL, cy: (by + 0.5) * world.CELL, items: cellItems.get(bx * 4096 + by) || [] };
  };
})();
