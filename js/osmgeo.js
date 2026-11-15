// Swaps the hand-traced geography in geo.js for real OpenStreetMap data (js/data/osm.js, built by
// tools/fetch_osm.py): rivers, lakes, parks, the road network by class, the C-Train, land-use zones
// (residential / commercial / industrial) and existing facilities (hospitals, schools, libraries).
// If osm.js is missing the game keeps working on the old approximate shapes.
(function () {
  const CP = window.CP;
  const G = CP.GEO;
  const O = window.OSM_DATA;
  G.landuse = [];
  G.stations = [];
  G.poi = [];
  G.minorRoads = [];
  G.hasOSM = !!O;
  if (!O) return;

  const pairs = (flat) => {
    const out = new Array(flat.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = [flat[i * 2], flat[i * 2 + 1]];
    return out;
  };
  const bbox = (pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  };

  const oldLakes = G.lakes.slice();
  // rivers: the Bow and Elbow are wide, everything else is a creek
  const RW = { "Bow River": 110, "Elbow River": 55 };
  G.rivers = O.rivers.map((r) => {
    const line = pairs(r.p);
    return { name: r.n || "Creek", width: RW[r.n] || 24, line, bb: bbox(line) };
  });
  G.lakes = O.lakes.map((l) => {
    const poly = pairs(l.p);
    return { name: l.n, poly, bb: bbox(poly) };
  });
  // keep any hand-traced lake OSM didn't deliver (e.g. Glenmore Reservoir)
  for (const old of oldLakes) if (!G.lakes.some((l) => l.name && l.name.includes(old.name.split(" ")[0]))) G.lakes.push({ name: old.name, poly: old.poly, bb: bbox(old.poly) });
  G.bigParks = O.parks.map((l) => {
    const poly = pairs(l.p);
    return { name: l.n, poly, bb: bbox(poly) };
  });

  // roads by class: 3 = freeway/expressway, 2 = main arterial, 1 = secondary arterial
  const WIDTH = { 3: 34, 2: 22, 1: 13 };
  G.roads = [];
  for (const r of O.roads) {
    const line = pairs(r.p);
    const road = { name: r.n, cls: r.c, w: WIDTH[r.c], line, bb: bbox(line) };
    if (r.c >= 2) G.roads.push(road);
  }

  // C-Train: every track piece, plus the stations
  G.ctrain = O.lrt.map((l) => ({ name: "C-Train", color: "#d71920", line: pairs(l.p) }));
  G.stations = O.stations.map(([x, y, name]) => ({ x, y, name }));

  // land-use zones: R residential, C commercial, I industrial
  G.landuse = O.landuse.map((l) => {
    const poly = pairs(l.p);
    return { z: l.z, poly, bb: bbox(poly) };
  });

  // existing facilities: h hospital, l library, s school
  const KIND = { h: "hospital", l: "library", s: "school" };
  G.poi = O.poi.map(([x, y, k, name]) => ({ x, y, kind: KIND[k], name }));
})();
