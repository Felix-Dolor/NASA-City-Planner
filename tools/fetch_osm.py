"""Build js/data/osm.js: real Calgary roads, rivers, parks, land-use zones, C-Train and facilities.

Usage:  python tools/fetch_osm.py [cache_dir]

Downloads OpenStreetMap data (c) OpenStreetMap contributors, ODbL, through the Overpass API into
cache_dir (default tools/.osm-cache), then projects it to the same game-metre grid as cei-data.js,
simplifies it and writes a plain JS file the game loads with a <script> tag.
Files already in the cache are reused, so re-running is cheap.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, ".osm-cache")
OUT = os.path.join(HERE, "..", "js", "data", "osm.js")
os.makedirs(CACHE, exist_ok=True)

BB = "50.84,-114.32,51.22,-113.85"  # south, west, north, east
HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
QUERIES = {
    "roads": f'way["highway"~"^(motorway|trunk|primary)$"]({BB});out geom',
    "water": f'(way["waterway"="river"]({BB});way["natural"="water"]["name"]({BB});way["landuse"="reservoir"]({BB});relation["natural"="water"]["name"]({BB});relation["landuse"="reservoir"]({BB}););out geom',
    "lrt": f'(way["railway"="light_rail"]({BB});node["railway"="station"]["station"="light_rail"]({BB}););out geom',
    "poi": f'(nwr["amenity"~"^(hospital|library)$"]({BB});nwr["amenity"="school"]["name"]({BB}););out center tags',
    "parks": f'way["leisure"~"^(park|nature_reserve)$"]({BB});out geom',
    "landuse": f'way["landuse"~"^(residential|commercial|retail|industrial)$"]({BB});out geom',
}


def fetch(name):
    path = os.path.join(CACHE, name + ".json")
    if os.path.exists(path) and os.path.getsize(path) > 100:
        return json.load(open(path))
    body = urllib.parse.urlencode({"data": f"[out:json][timeout:120];{QUERIES[name]};"}).encode()
    for attempt in range(4):
        for host in HOSTS:
            try:
                req = urllib.request.Request(host, body, {"User-Agent": "equity-map-builder/1.0"})
                with urllib.request.urlopen(req, timeout=150) as r:
                    data = r.read()
                json.loads(data)
                open(path, "wb").write(data)
                print(f"fetched {name}: {len(data) // 1024} KB")
                return json.loads(data)
            except Exception as e:  # noqa: BLE001
                print(f"  {name} via {host}: {e}")
        time.sleep(8 * (attempt + 1))
    sys.exit(f"could not fetch {name}")


# ---- projection (must match tools/build_data.py and js/core.js) ----
R = 6378137.0
OLAT, OLON = 51.0447, -114.0719
K = math.cos(math.radians(OLAT))
merc = lambda lat, lon: (R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))  # noqa: E731
OX, OY = merc(OLAT, OLON)


def proj(lat, lon):
    x, y = merc(lat, lon)
    return ((x - OX) * K, -(y - OY) * K)


def simplify(pts, tol):
    """Douglas-Peucker on a list of (x, y)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(pts, tol):
    """Closed ring: split at the point farthest from the start so Douglas-Peucker has a real chord to work with."""
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 4:
        return pts
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = simplify(pts[: far + 1], tol)
    b = simplify(pts[far:] + [pts[0]], tol)
    return a[:-1] + b[:-1]


def geom(way):
    return [proj(g["lat"], g["lon"]) for g in way.get("geometry", [])]


def flat(pts):
    return [int(round(v)) for p in pts for v in p]


def area(pts):
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2


# keep only what is in or near the city (the census-tract bounds, padded)
BOUNDS = (-19000, -21000, 17000, 24500)
inside = lambda p: BOUNDS[0] <= p[0] <= BOUNDS[2] and BOUNDS[1] <= p[1] <= BOUNDS[3]  # noqa: E731

out = {}

# ---- roads: class by OSM highway tag ----
roads = []
for w in fetch("roads")["elements"]:
    pts = [p for p in geom(w) if True]
    if len(pts) < 2 or not any(inside(p) for p in pts):
        continue
    t = w["tags"]
    cls = {"motorway": 3, "trunk": 3, "primary": 2}.get(t["highway"])
    if not cls:
        continue  # secondary streets are left out: only freeways and main arterials are drawn
    roads.append({"c": cls, "n": t.get("name", ""), "p": flat(simplify(pts, 18))})

def stitch(ways):
    """Join the outer member ways of a multipolygon into closed rings (lists of (x, y))."""
    segs = [list(w) for w in ways if len(w) > 1]
    rings = []
    while segs:
        ring = segs.pop()
        grown = True
        while grown and ring[0] != ring[-1]:
            grown = False
            for i, sg in enumerate(segs):
                if sg[0] == ring[-1]:
                    ring += sg[1:]
                elif sg[-1] == ring[-1]:
                    ring += sg[::-1][1:]
                elif sg[-1] == ring[0]:
                    ring = sg[:-1] + ring
                elif sg[0] == ring[0]:
                    ring = sg[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                grown = True
                break
        if len(ring) > 3:
            rings.append(ring)
    return rings


# ---- rivers, lakes ----
rivers, lakes = [], []
for w in fetch("water")["elements"]:
    t = w.get("tags", {})
    if w["type"] == "relation":
        # big lakes and reservoirs (Glenmore Reservoir) are multipolygon relations
        outer = [[proj(g["lat"], g["lon"]) for g in m.get("geometry", [])] for m in w.get("members", []) if m.get("role") == "outer" and m.get("type") == "way"]
        for ring in stitch(outer):
            if any(inside(p) for p in ring) and area(ring) > 60000:
                lakes.append({"n": t.get("name", ""), "p": flat(simplify_ring(ring, 25))})
        continue
    if w["type"] != "way":
        continue
    pts = geom(w)
    if len(pts) < 2 or not any(inside(p) for p in pts):
        continue
    if t.get("waterway") == "river":
        rivers.append({"n": t.get("name", ""), "p": flat(simplify(pts, 15))})
    elif len(pts) > 3 and area(pts) > 60000:
        lakes.append({"n": t.get("name", ""), "p": flat(simplify_ring(pts, 25))})

# ---- C-Train ----
lrt, stations = [], []
for e in fetch("lrt")["elements"]:
    if e["type"] == "way":
        pts = geom(e)
        if len(pts) > 1 and any(inside(p) for p in pts):
            lrt.append({"p": flat(simplify(pts, 15))})
    elif e["type"] == "node":
        p = proj(e["lat"], e["lon"])
        if inside(p):
            stations.append([int(p[0]), int(p[1]), e.get("tags", {}).get("name", "")])

# ---- parks and land-use zones (polygons) ----
parks = []
for w in fetch("parks")["elements"]:
    pts = geom(w)
    if len(pts) > 3 and any(inside(p) for p in pts) and area(pts) > 90000:
        parks.append({"n": w.get("tags", {}).get("name", ""), "p": flat(simplify_ring(pts, 30))})

ZONE = {"residential": "R", "commercial": "C", "retail": "C", "industrial": "I"}
landuse = []
for w in fetch("landuse")["elements"]:
    pts = geom(w)
    if len(pts) > 3 and any(inside(p) for p in pts) and area(pts) > 40000:
        landuse.append({"z": ZONE[w["tags"]["landuse"]], "p": flat(simplify_ring(pts, 30))})

# ---- facilities ----
poi = []
for e in fetch("poi")["elements"]:
    c = e.get("center") or ({"lat": e.get("lat"), "lon": e.get("lon")} if "lat" in e else None)
    if not c:
        continue
    p = proj(c["lat"], c["lon"])
    if inside(p):
        poi.append([int(p[0]), int(p[1]), e["tags"]["amenity"][0], e["tags"].get("name", "")])  # h / l / s

data = {
    "source": "OpenStreetMap contributors (ODbL), downloaded via Overpass API",
    "roads": roads, "rivers": rivers, "lakes": lakes, "lrt": lrt, "stations": stations,
    "parks": parks, "landuse": landuse, "poi": poi,
}
js = "// Generated by tools/fetch_osm.py - do not edit by hand.\nwindow.OSM_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n"
open(OUT, "w").write(js)
print({k: len(v) for k, v in data.items() if isinstance(v, list)}, f"{len(js) // 1024} KB ->", os.path.relpath(OUT))
