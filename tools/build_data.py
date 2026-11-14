"""Build js/data/cei-data.js from the City of Calgary 2024 Calgary Equity Index download.

Usage:  python tools/build_data.py [data/raw]

Reads 2024_CEI_Data.csv and calgary_census_tracts_2021.shp (Web Mercator),
projects every tract to a local metre grid centred on downtown Calgary,
simplifies the outlines and writes a plain JS file the game loads with a
<script> tag (so index.html works straight from disk).
"""
import csv
import json
import math
import os
import struct
import sys

RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "js", "data", "cei-data.js")

R = 6378137.0
ORIGIN_LAT, ORIGIN_LON = 51.0447, -114.0719  # downtown (Calgary Tower-ish)
K = math.cos(math.radians(ORIGIN_LAT))  # Web Mercator -> true metres at this latitude


def merc(lat, lon):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


OX, OY = merc(ORIGIN_LAT, ORIGIN_LON)


def to_local(x, y):
    # +x east, +y south (screen convention), metres
    return round((x - OX) * K), round(-(y - OY) * K)


def read_dbf(path):
    d = open(path, "rb").read()
    n, hl, rl = struct.unpack("<xxxxIHH", d[:12])
    fields, i = [], 32
    while d[i] != 0x0D:
        fields.append((d[i:i + 11].split(b"\0")[0].decode(), d[i + 16]))
        i += 32
    recs = []
    for r in range(n):
        off = hl + r * rl + 1
        rec = {}
        for name, ln in fields:
            rec[name] = d[off:off + ln].decode("latin1").strip()
            off += ln
        recs.append(rec)
    return recs


def read_shp(path):
    d = open(path, "rb").read()
    shapes, i = [], 100
    while i < len(d):
        _, clen = struct.unpack(">ii", d[i:i + 8])
        i += 8
        st = struct.unpack("<i", d[i:i + 4])[0]
        if st == 0:
            shapes.append([])
        else:
            nparts, npts = struct.unpack("<ii", d[i + 36:i + 44])
            parts = list(struct.unpack("<%di" % nparts, d[i + 44:i + 44 + 4 * nparts]))
            p0 = i + 44 + 4 * nparts
            pts = [struct.unpack("<dd", d[p0 + 16 * k:p0 + 16 * k + 16]) for k in range(npts)]
            parts.append(npts)
            shapes.append([pts[parts[k]:parts[k + 1]] for k in range(nparts)])
        i += clen * 2
    return shapes


def dp(pts, tol):
    """Douglas-Peucker simplification."""
    if len(pts) < 4:
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
        for k in range(a + 1, b):
            px, py = pts[k]
            if L < 1e-6:  # closed ring: segment collapses to a point
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if dist > best:
                best, bi = dist, k
        if best > tol and bi > 0:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring_area(r):
    a = 0
    for k in range(len(r)):
        x1, y1 = r[k]
        x2, y2 = r[(k + 1) % len(r)]
        a += x1 * y2 - x2 * y1
    return a / 2


def centroid(rings):
    # area-weighted centroid of the largest ring (good enough for label/effect centre)
    r = max(rings, key=lambda q: abs(ring_area(q)))
    A = ring_area(r) or 1e-9
    cx = cy = 0
    for k in range(len(r)):
        x1, y1 = r[k]
        x2, y2 = r[(k + 1) % len(r)]
        f = x1 * y2 - x2 * y1
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    return round(cx / (6 * A), 1), round(cy / (6 * A), 1)


DOMAINS = [
    "economic_opportunity_domain_score",
    "accessibility_and_amenities_domain_score",
    "population_health_domain_score",
    "community_belonging_and_safety_domain_score",
    "human_and_social_wellbeing_domain_score",
    "climate_and_environment_domain_score",
]


def main():
    rows = list(csv.DictReader(open(os.path.join(RAW, "2024_CEI_Data.csv"), encoding="utf-8-sig")))
    aliases = {r["Field Name"]: r["Alias"] for r in csv.DictReader(open(os.path.join(RAW, "2024_CEI_Data_Field_Names_Alias.csv"), encoding="utf-8-sig"))}
    dbf = read_dbf(os.path.join(RAW, "calgary_census_tracts_2021.dbf"))
    shp = read_shp(os.path.join(RAW, "calgary_census_tracts_2021.shp"))
    geo = {}
    for rec, rings in zip(dbf, shp):
        if not rings:
            continue
        loc = [[to_local(x, y) for x, y in r] for r in rings]
        loc = [dp(r, 12.0) for r in loc]
        loc = [r for r in loc if len(r) >= 4 and abs(ring_area(r)) > 2000]
        geo[rec["CTUID"]] = loc

    numeric = [k for k in rows[0] if k not in ("CTUID", "Communities", "Quadrant")]
    tracts, missing = [], 0
    for r in rows:
        ct = "%.2f" % float(r["CTUID"])
        rings = geo.get(ct)
        if not rings:
            missing += 1
            continue
        cx, cy = centroid(rings)
        area = sum(abs(ring_area(q)) for q in rings)
        t = {
            "id": ct,
            "name": r["Communities"].title(),
            "q": r["Quadrant"],
            "c": [cx, cy],
            "area": round(area),
            "rings": [[c for p in q for c in p] for q in rings],  # flat x,y lists
        }
        for k in numeric:
            t[k] = float(r[k])
        tracts.append(t)


    xs = [v for t in tracts for q in t["rings"] for v in q[0::2]]
    ys = [v for t in tracts for q in t["rings"] for v in q[1::2]]
    out = {
        "source": "City of Calgary, Calgary Equity Index 2024 (data.calgary.ca i6pu-a35d), Open Government Licence - City of Calgary",
        "origin": {"lat": ORIGIN_LAT, "lon": ORIGIN_LON},
        "bounds": [min(xs), min(ys), max(xs), max(ys)],
        "domains": DOMAINS,
        "aliases": aliases,
        "tracts": tracts,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_data.py - do not edit by hand.\n")
        f.write("window.CEI_DATA = ")
        json.dump(out, f, separators=(",", ":"))
        f.write(";\n")
    print("tracts:", len(tracts), "missing geometry:", missing, "bounds:", out["bounds"])
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
