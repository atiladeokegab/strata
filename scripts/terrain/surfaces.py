# /// script
# requires-python = ">=3.11"
# dependencies = ["pyproj", "pillow"]
# ///
"""Bake the ground's surfaces mask, web/public/terrain/tower-bridge/surfaces.png, on the terrain tile's 1 m grid
(row 0 north, column 0 west, the same as bare.png). Terrain.jsx samples it by world position, so both tiers share it.

  R  St Katharine Docks' basins and lock (OSM natural=water), still water before the marina opened
  G  the Tower of London's moat ("The Ditch", OSM landuse=grass), dry grass since it was drained in 1843-45
  B  every OSM building footprint in web/public/buildings/tower-bridge.json, so one hidden by its date shows paving, not
     the aerial photo's roof

uv run scripts/terrain/surfaces.py <overpass.json>

Overpass query used (the same inner box as scripts/buildings/bake.py):
  [out:json][timeout:60];
  ( way["natural"="water"](51.4987,-0.0862,51.5122,-0.0645); way["landuse"="grass"](51.5070,-0.0800,51.5095,-0.0740); );
  out tags geom;
Rebake after the buildings are rebaked. Data © OpenStreetMap contributors, ODbL 1.0.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
TERRAIN = ROOT / "web/public/terrain/tower-bridge"
BUILDINGS = ROOT / "web/public/buildings/tower-bridge.json"
DOCKS = {130305344, 256560703, 256564630, 256565163}  # West Dock, East Dock, Central Basin, the lock
MOAT = {370870752}  # The Ditch
SS = 4  # supersampling, so the edges come out soft


def main():
    osm = json.loads(Path(sys.argv[1]).read_text())
    meta = json.loads((TERRAIN / "meta.json").read_text())
    minE, _, maxE, maxN = meta["bbox_osgb"]
    w, h = meta["size_px"]
    res = (maxE - minE) / w
    to_osgb = Transformer.from_crs("EPSG:4326", "EPSG:27700", always_xy=True)
    px = lambda E, N: ((E - minE) / res * SS, (maxN - N) / res * SS)
    layers = [Image.new("L", (w * SS, h * SS)) for _ in range(3)]
    found = {k: 0 for k in ("docks", "moat")}
    for el in osm["elements"]:
        layer, key = (0, "docks") if el["id"] in DOCKS else (1, "moat") if el["id"] in MOAT else (None, None)
        if layer is None or el["type"] != "way":
            continue
        ring = [px(*to_osgb.transform(p["lon"], p["lat"])) for p in el["geometry"]]
        ImageDraw.Draw(layers[layer]).polygon(ring, fill=255)
        found[key] += 1
    assert found == {"docks": len(DOCKS), "moat": len(MOAT)}, f"missing OSM ways: {found}"
    data = json.loads(BUILDINGS.read_text())
    oE, oN = data["frame"]["origin_osgb"]
    draw = ImageDraw.Draw(layers[2])
    for b in data["buildings"]:
        o = b["o"]
        draw.polygon([px(oE + o[i], oN - o[i + 1]) for i in range(0, len(o), 2)], fill=255)
    out = Image.merge("RGB", [l.resize((w, h), Image.BOX) for l in layers])
    out.save(TERRAIN / "surfaces.png", optimize=True)
    print(f"surfaces.png {w}x{h}: {found}, {len(data['buildings'])} footprints")


if __name__ == "__main__":
    main()
