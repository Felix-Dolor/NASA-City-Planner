"""Fetch NASA Earth observation layers for Calgary from NASA GIBS and bake them into the game.

Writes:
  assets/nasa/hls-calgary.jpg   true-colour Landsat image (Harmonized Landsat Sentinel-2, HLS L30)
  js/data/nasa-data.js          per-tract summer greenness (MODIS NDVI) and daytime land surface
                                temperature (MODIS LST), plus the image's placement in game metres

All layers come from NASA's Global Imagery Browse Services (GIBS, https://earthdata.nasa.gov/gibs),
requested in Web Mercator (EPSG:3857). The game's map is a scaled Web Mercator grid centred on downtown
Calgary (see js/core.js), so a Web Mercator image lines up with it exactly.

NDVI and LST arrive as colour-mapped PNGs; each colour is turned back into its value with the layer's
published GIBS colour map.

Usage: python tools/build_nasa.py      (needs Pillow and an internet connection)
"""
import io
import json
import math
import os
import re
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"

# true colour: a cloud-free Landsat 8/9 pass over Calgary
HLS = ("HLS_L30_Nadir_BRDF_Adjusted_Reflectance", "2025-08-01")
# summer greenness: MODIS Terra 16-day NDVI composites (250 m)
NDVI = ("MODIS_Terra_L3_NDVI_16Day", ["2025-07-12", "2025-07-28"], "MODIS_L3_NDVI")
# summer daytime surface temperature: MODIS Terra 8-day LST composites (1 km)
LST = ("MODIS_Terra_L3_Land_Surface_Temp_8Day_Day", ["2025-07-12", "2025-07-20", "2025-07-28", "2025-08-05"], "MODIS_Land_Surface_Temp")

# must match js/core.js
R = 6378137
D = json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", open(os.path.join(ROOT, "js/data/cei-data.js")).read(), re.S).group(1))
LAT0, LON0 = D["origin"]["lat"], D["origin"]["lon"]
K = math.cos(math.radians(LAT0))
OX = R * math.radians(LON0)
OY = R * math.log(math.tan(math.pi / 4 + math.radians(LAT0) / 2))

PAD = 4000
b = D["bounds"]
BOX = [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]  # game metres: minx, miny, maxx, maxy (y points south)
MX0, MX1 = BOX[0] / K + OX, BOX[2] / K + OX
MY0, MY1 = -BOX[3] / K + OY, -BOX[1] / K + OY  # mercator y points north


def get(layer, date, w, h, fmt="image/png"):
    q = (f"?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layer}&STYLES=&CRS=EPSG:3857"
         f"&BBOX={MX0:.1f},{MY0:.1f},{MX1:.1f},{MY1:.1f}&WIDTH={w}&HEIGHT={h}&FORMAT={fmt}&TRANSPARENT=TRUE&TIME={date}")
    with urllib.request.urlopen(GIBS + q, timeout=120) as r:
        return r.read()


def colormap(name):
    """rgb -> value (midpoint of the class) for a GIBS colour map; no-data classes are skipped."""
    xml = urllib.request.urlopen(f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{name}.xml", timeout=60).read().decode()
    out = {}
    for e in re.findall(r"<ColorMapEntry[^>]*>", xml):
        if 'nodata="true"' in e or 'transparent="true"' in e:
            continue
        rgb = tuple(int(v) for v in re.search(r'rgb="([^"]+)"', e).group(1).split(","))
        m = re.search(r'value="[\[(]([-\d.]+),([-\d.]+)[\])]"', e)
        if m:
            out[rgb] = (float(m.group(1)) + float(m.group(2))) / 2
    return out


def decode(png, cmap):
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    w, h = im.size
    px = im.load()
    grid = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, bl, a = px[x, y]
            if a:
                grid[y][x] = cmap.get((r, g, bl))
    return grid


def inside(x, y, ring):
    c = False
    n = len(ring) // 2
    j = n - 1
    for i in range(n):
        xi, yi, xj, yj = ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def tract_means(grids, w, h):
    """mean of all valid samples (across every composite) whose cell centre falls inside each tract"""
    cw, ch = (BOX[2] - BOX[0]) / w, (BOX[3] - BOX[1]) / h
    res = {}
    for t in D["tracts"]:
        rings = t["rings"]
        xs = [v for r in rings for v in r[0::2]]
        ys = [v for r in rings for v in r[1::2]]
        tot = n = 0
        for gy in range(max(0, int((min(ys) - BOX[1]) / ch)), min(h, int((max(ys) - BOX[1]) / ch) + 1)):
            wy = BOX[1] + (gy + 0.5) * ch
            for gx in range(max(0, int((min(xs) - BOX[0]) / cw)), min(w, int((max(xs) - BOX[0]) / cw) + 1)):
                wx = BOX[0] + (gx + 0.5) * cw
                if sum(inside(wx, wy, r) for r in rings) % 2 == 0:
                    continue
                for g in grids:
                    v = g[gy][gx]
                    if v is not None:
                        tot += v
                        n += 1
        if not n:  # tiny tract: use the cell under its centre
            gx = min(w - 1, int((t["c"][0] - BOX[0]) / cw))
            gy = min(h - 1, int((t["c"][1] - BOX[1]) / ch))
            vals = [g[gy][gx] for g in grids if g[gy][gx] is not None]
            tot, n = sum(vals), len(vals)
        res[t["id"]] = tot / n if n else None
    return res


def main():
    W = 1600
    H = round(W * (BOX[3] - BOX[1]) / (BOX[2] - BOX[0]))
    os.makedirs(os.path.join(ROOT, "assets/nasa"), exist_ok=True)
    img = get(HLS[0], HLS[1], W, H, "image/jpeg")
    open(os.path.join(ROOT, "assets/nasa/hls-calgary.jpg"), "wb").write(img)
    print("HLS image", W, "x", H, len(img) // 1024, "KB")

    sw, sh = 400, round(400 * H / W)
    ndvi = tract_means([decode(get(NDVI[0], d, sw, sh), colormap(NDVI[2])) for d in NDVI[1]], sw, sh)
    lst = tract_means([decode(get(LST[0], d, sw, sh), colormap(LST[2])) for d in LST[1]], sw, sh)

    out = {
        "source": "NASA GIBS: HLS L30 (Landsat 8/9) true colour, MODIS Terra 16-day NDVI and 8-day daytime land surface temperature",
        "image": {"src": "assets/nasa/hls-calgary.jpg", "box": BOX, "layer": HLS[0], "date": HLS[1]},
        "ndvi": {"layer": NDVI[0], "dates": NDVI[1]},
        "lst": {"layer": LST[0], "dates": LST[1], "units": "°C"},
        "tracts": {tid: [round(ndvi[tid], 3) if ndvi[tid] is not None else None,
                         round(lst[tid] - 273.15, 1) if lst[tid] is not None else None] for tid in ndvi},
    }
    missing = sum(1 for v in out["tracts"].values() if None in v)
    with open(os.path.join(ROOT, "js/data/nasa-data.js"), "w") as f:
        f.write("// Generated by tools/build_nasa.py - do not edit by hand.\n")
        f.write("window.NASA_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    vals = [v for v in out["tracts"].values() if None not in v]
    print("tracts", len(out["tracts"]), "missing", missing,
          "NDVI", min(v[0] for v in vals), "-", max(v[0] for v in vals),
          "LST", min(v[1] for v in vals), "-", max(v[1] for v in vals), "°C")


if __name__ == "__main__":
    main()
