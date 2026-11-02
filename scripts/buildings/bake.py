# /// script
# requires-python = ">=3.11"
# dependencies = ["pyproj", "numpy", "pillow"]
# ///
"""Bake OpenStreetMap building footprints around Tower Bridge into web/public/buildings/tower-bridge.json.

uv run scripts/buildings/bake.py <overpass.json> <terrain dir with meta.json + height.png> [out.json]

Overpass query used (any Overpass mirror; the main one is often at capacity):
  [out:json][timeout:120];
  ( way["building"](51.4987,-0.0862,51.5122,-0.0645); relation["building"](51.4987,-0.0862,51.5122,-0.0645);
    way["building"]["height"](51.4960,-0.0960,51.5190,-0.0600); way["building"]["building:levels"](51.4960,-0.0960,51.5190,-0.0600);
    relation["building"]["height"](51.4960,-0.0960,51.5190,-0.0600); );
  out tags geom;
The inner box (~1.5 km) takes every building; the outer box adds only tagged-height ones (the City towers, the Shard).

Frame: the terrain's grid frame (x = E - origin E, y = metres OD - origin_h, z = origin N - N), the same one
build-terrain uses; the scene turns it by frame.axis_deg so the real bridge lies on z.
Heights: the Environment Agency LiDAR DSM where the terrain tile covers the footprint, else OSM height,
else building:levels x 3.3 m.
"""

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer

raw, terrain = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).resolve().parents[2] / "web/public/buildings/tower-bridge.json"
meta = json.loads((terrain / "meta.json").read_text())
minE, minN, maxE, maxN = meta["bbox_osgb"]
oE, oN = meta["origin_osgb"]
oH = meta["origin_h"]
theta = math.radians(meta["bridge_axis_deg"])
rgb = np.asarray(Image.open(terrain / "height.png").convert("RGB")).astype(np.float64)
dsm = meta["min_h"] + (rgb[..., 0] * 256 + rgb[..., 1]) / 65535 * (meta["max_h"] - meta["min_h"])  # row 0 north, 1 m px
to_osgb = Transformer.from_crs("EPSG:4326", "EPSG:27700", always_xy=True)
CITY_GROUND = 12.0  # m OD, typical street level north of the river, for towers outside the LiDAR tile
TALL = 40.0  # m: with no start_date, a building this tall is taken as post-1950


def num(v):
    m = re.match(r"\s*(\d+(?:\.\d+)?)", v or "")
    return float(m.group(1)) if m else None


def stitch(ways):
    """Join member ways end to end into closed rings (OSM multipolygons split rings across ways)."""
    rings, ways = [], [list(w) for w in ways if len(w) > 1]
    while ways:
        ring = ways.pop(0)
        while ring[0] != ring[-1]:
            for i, w in enumerate(ways):
                if w[0] == ring[-1]: ring += w[1:]
                elif w[-1] == ring[-1]: ring += w[::-1][1:]
                elif w[-1] == ring[0]: ring = w[:-1] + ring
                elif w[0] == ring[0]: ring = w[::-1][:-1] + ring
                else: continue
                ways.pop(i)
                break
            else:
                break  # an open ring: OSM data is incomplete here, keep what closes
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def lonlat(geom):
    return [(round(p["lon"], 7), round(p["lat"], 7)) for p in geom]


def grid(ring):
    E, N = to_osgb.transform([p[0] for p in ring], [p[1] for p in ring])
    return np.array(E), np.array(N)


def lidar_heights(E, N):
    """(ground, roof) metres OD from the DSM, or None when the footprint is not inside the tile."""
    if E.min() < minE + 8 or E.max() > maxE - 8 or N.min() < minN + 8 or N.max() > maxN - 8:
        return None
    c0, c1 = int(E.min() - minE) - 6, int(E.max() - minE) + 7
    r0, r1 = int(maxN - N.max()) - 6, int(maxN - N.min()) + 7
    win = dsm[r0:r1, c0:c1]
    mask = Image.new("1", (c1 - c0, r1 - r0))
    ImageDraw.Draw(mask).polygon([(e - minE - c0, maxN - n - r0) for e, n in zip(E, N)], fill=1)
    inside = np.asarray(mask, dtype=bool)
    if inside.sum() < 4 or (~inside).sum() < 4:
        return None
    return float(np.percentile(win[~inside], 5)), float(np.percentile(win[inside], 90))


def kind(tags, height, start, osm_id):
    mat = (tags.get("building:material") or tags.get("building:facade:material") or "").lower()
    if "glass" in mat: return "g"
    if "brick" in mat: return "b"
    if mat in ("stone", "limestone", "sandstone", "granite", "concrete", "plaster"): return "s"
    if height > TALL and (start is None or start >= 1950): return "g"
    if tags.get("historic") or tags.get("heritage") or tags.get("building") in ("castle", "church", "cathedral", "chapel"): return "s"
    if tags.get("building") in ("warehouse", "industrial"): return "b"
    return "b" if osm_id % 5 < 3 else "s"  # London stock brick, with Portland stone fronts mixed in


def in_bridge_cut(x, z):
    u = x * math.cos(theta) + z * math.sin(theta)  # same turn as the scene (three.js rotation-y): along the river
    v = -x * math.sin(theta) + z * math.cos(theta)  # along the bridge
    return abs(u) < meta["bridge_cut"]["width"] / 2 and abs(v) < meta["bridge_cut"]["length"] / 2


buildings, skipped = [], {"bridge": 0, "no height": 0, "bad ring": 0}
for el in json.loads(raw.read_text())["elements"]:
    tags = el.get("tags", {})
    if tags.get("building") in (None, "roof", "bridge", "no"):
        continue
    if el["type"] == "way":
        outers, inners = stitch([lonlat(el.get("geometry", []))]), []
    else:
        members = el.get("members", [])
        outers = stitch([lonlat(m.get("geometry", [])) for m in members if m.get("role") == "outer"])
        inners = stitch([lonlat(m.get("geometry", [])) for m in members if m.get("role") == "inner"])
    if not outers:
        skipped["bad ring"] += 1
        continue
    start_m = re.search(r"\d{4}", tags.get("start_date", ""))
    start = int(start_m.group()) if start_m else None
    for n_outer, outer in enumerate(outers):
        E, N = grid(outer)
        x, z = E - oE, oN - N
        if in_bridge_cut(x.mean(), z.mean()):
            skipped["bridge"] += 1
            continue
        lidar = lidar_heights(E, N)
        tagged = num(tags.get("height")) or (num(tags.get("building:levels")) or 0) * 3.3 or None
        if lidar and lidar[1] - lidar[0] >= 2.5:
            ground, height = lidar[0], lidar[1] - lidar[0] + 0.3  # roof 0.3 m clear of the terrain's own LiDAR roof: no z-fight
        elif tagged:
            ground, height = (lidar[0] if lidar else CITY_GROUND), tagged
        else:
            skipped["no height"] += 1
            continue
        holes = []
        for ring in inners:
            hE, hN = grid(ring)
            holes.append([round(float(v), 1) for p in zip(hE - oE, oN - hN) for v in p])
        b = {
            "id": f"{el['type'][0]}{el['id']}" + (f"-{n_outer}" if n_outer else ""),
            "b": round(ground - oH - 1.0, 1),  # sunk 1 m so no gap shows at the kerb
            "t": round(ground - oH + height, 1),
            "s": start if start is not None else (1950 if height > TALL else None),
            "k": kind(tags, height, start, el["id"]),
            "o": [round(float(v), 1) for p in zip(x, z) for v in p],
        }
        if tags.get("name"): b["n"] = tags["name"]
        if holes: b["h"] = holes
        if lidar: b["l"] = 1  # inside the terrain tile: the roof wears the terrain's aerial photo
        buildings.append(b)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    "credit": "© OpenStreetMap contributors",
    "licence": "Open Database License (ODbL) 1.0, https://www.openstreetmap.org/copyright",
    "heights": "Environment Agency LIDAR Composite DSM 1 m (OGL v3) inside the terrain tile; OSM height or levels beyond it",
    "frame": {"origin_osgb": [oE, oN], "origin_h": oH, "axis_deg": meta["bridge_axis_deg"], "bbox_osgb": meta["bbox_osgb"]},
    "start_rule": "s = OSM start_date year; with none, 1950 for buildings over 40 m (taken as modern); null = always shown",
    "buildings": buildings,
}, separators=(",", ":"), ensure_ascii=False))
print(f"{len(buildings)} buildings -> {out} ({out.stat().st_size // 1024} KB); skipped {skipped}")
