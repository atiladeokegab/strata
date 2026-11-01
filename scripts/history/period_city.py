"""Bake the 1890s riverside around Tower Bridge from the OS London Town Plan (1893-96) itself.

uv run --with pyproj --with pillow --with numpy --with scipy --with scikit-image --with shapely \
    python scripts/history/period_city.py   ->  web/public/buildings/tower-bridge-1890s.json

Footprints: the town plan shades every building (solid grey on the Southwark sheets, hatching north of the river).
Shaded land is traced into blocks, split along a 22 m grid turned to the bridge axis so long terraces read as
separate houses, and extruded. Buildings dated by OSM to 1894 or earlier (the Tower, a few churches) are cut out:
Buildings.jsx already draws those from OSM, so nothing overlaps.
Heights (status inferred): there are no surveyed 1890s heights, so each block gets a period height by use:
riverside and dock warehouses (within 70 m of the water) 18-24 m, large inland blocks (breweries, works) 14-18 m,
terraced houses and shops 9-13 m. Ground: the bare-earth surface Terrain.jsx draws before 1950, so walls meet it.
"""
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Polygon
from skimage import measure

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_1890s import BBOX, osgb_mosaic  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TERRAIN = ROOT / "web/public/terrain/tower-bridge"
OSM = ROOT / "web/public/buildings/tower-bridge.json"
OUT = ROOT / "web/public/buildings/tower-bridge-1890s.json"
PX = 0.5  # m per pixel of the traced plan
PLOT = 22.0  # m: party-wall grid
BUILT_BY = 1894


def bare_earth(meta):
    """Same opening as web/src/scene/bareEarth.js (60 m window, 1.5 m kept), metres OD, 1 m grid."""
    rgb = np.asarray(Image.open(TERRAIN / "height.png").convert("RGB")).astype(np.float64)
    dsm = meta["min_h"] + (rgb[..., 0] * 256 + rgb[..., 1]) / 65535 * (meta["max_h"] - meta["min_h"])
    opened = ndi.grey_opening(dsm, size=(61, 61), mode="nearest")
    return np.minimum(dsm, opened + 1.5)


def main():
    meta = json.loads((TERRAIN / "meta.json").read_text())
    minE, minN, maxE, maxN = BBOX
    oE, oN = meta["origin_osgb"]
    oH, water = meta["origin_h"], meta["water_h"]
    theta = math.radians(meta["bridge_axis_deg"])
    ground = bare_earth(meta)  # 1500 x 1500, row 0 north
    up = lambda a: np.kron(a, np.ones((2, 2)))[: int((maxN - minN) / PX), : int((maxE - minE) / PX)]  # 1 m -> 0.5 m

    rgb, _ = osgb_mosaic(PX)
    rgb = rgb.astype(np.float32)
    lum = rgb.mean(-1)
    blur = ndi.uniform_filter(lum, 5)  # 2.5 m: hatching becomes a flat tone
    # local paper tone (sheets are tinted differently): 92nd percentile in 4 m cells, max over ~44 m, smoothed
    H, W = blur.shape
    cells = blur.reshape(H // 8, 8, W // 8, 8).transpose(0, 2, 1, 3).reshape(H // 8, W // 8, 64)
    paper = np.kron(ndi.uniform_filter(ndi.maximum_filter(np.percentile(cells, 92, axis=-1), 11), 5), np.ones((8, 8)))
    blue = ndi.binary_dilation((rgb[..., 2] - rgb[..., 0]) > 12, iterations=4)  # hand-tinted water and docks
    land = up(ground) > water + 1.0
    shaded = (paper - blur > 10) & ~blue & land  # the plan's building shading is ~10-15 levels under its paper
    # a sheet margin west of the Tower prints darker than its neighbour and reads as a 40 m wide wall: drop it
    E = (np.arange(W) + 0.5) * PX + minE
    N = maxN - (np.arange(H) + 0.5) * PX
    shaded[np.ix_((N > 180200) & (N < 180730), (E > 533478) & (E < 533532))] = False
    shaded = ndi.binary_opening(shaded, iterations=4)  # drop lettering, tree symbols, single walls (< 4 m)
    shaded = ndi.binary_closing(shaded, iterations=2) & land
    if "--debug" in sys.argv:
        Image.fromarray((shaded * 255).astype(np.uint8)).resize((750, 750)).save("/tmp/claude-1001/shaded.png")

    # scene frame per pixel centre: x = E - oE, z = oN - N
    X = (np.arange(W) + 0.5) * PX + minE - oE
    Z = oN - (maxN - (np.arange(H) + 0.5) * PX)
    XX, ZZ = np.meshgrid(X, Z)
    u = XX * math.cos(theta) - ZZ * math.sin(theta)  # across the bridge (along the river)
    v = XX * math.sin(theta) + ZZ * math.cos(theta)  # along the bridge
    cut = (np.abs(u) < meta["bridge_cut"]["width"] / 2 + 4) & (np.abs(v) < meta["bridge_cut"]["length"] / 2 + 4)
    shaded &= ~cut

    # OSM buildings already dated to the period are drawn from OSM: cut them out (1 m clear)
    osm = json.loads(OSM.read_text())
    keep = Image.new("1", (W, H), 0)
    d = ImageDraw.Draw(keep)
    for b in osm["buildings"]:
        if b.get("s") is not None and b["s"] <= BUILT_BY:
            o = b["o"]
            d.polygon([((o[i] + oE - minE) / PX, (maxN - (oN - o[i + 1])) / PX) for i in range(0, len(o), 2)], fill=1)
    shaded &= ~ndi.binary_dilation(np.asarray(keep), iterations=2)

    near_water = ndi.distance_transform_edt(~(blue | ~land)) * PX < 70
    plots = (np.floor(u / PLOT).astype(np.int64) * 1000 + np.floor(v / PLOT).astype(np.int64))
    blocks, nb = ndi.label(shaded)
    sizes = ndi.sum(np.ones_like(blocks), blocks, index=np.arange(nb + 1)) * PX * PX
    rng = np.random.default_rng(1894)
    out = []
    lots = blocks.astype(np.int64) * 10_000_000 + (plots - plots.min())
    lots[blocks == 0] = 0
    ids, inv = np.unique(lots, return_inverse=True)
    inv = inv.reshape(lots.shape)
    objs = ndi.find_objects(inv + 1)
    for k, sl in enumerate(objs):
        if sl is None or ids[k] == 0:
            continue
        mask = inv[sl] == k
        area = mask.sum() * PX * PX
        if area < 30:
            continue
        pad = np.pad(mask, 1)
        rings = measure.find_contours(pad.astype(float), 0.5)
        if not rings:
            continue
        ring = max(rings, key=len)
        r0, c0 = sl[0].start - 1, sl[1].start - 1
        pts = [(X[0] + (c + c0) * PX, Z[0] + (r + r0) * PX) for r, c in ring]
        poly = Polygon(pts).buffer(0).simplify(0.7, preserve_topology=True)
        if poly.geom_type != "Polygon" or poly.area < 25:
            continue
        rr, cc = np.nonzero(mask)
        rr, cc = rr + sl[0].start, cc + sl[1].start
        g = ground[np.clip(rr // 2, 0, 1499), np.clip(cc // 2, 0, 1499)]
        block_area = sizes[blocks[rr[0], cc[0]]]
        if near_water[rr, cc].mean() > 0.5:
            height, kind = rng.uniform(18, 24), "w"  # warehouse
        elif block_area > 2500:
            height, kind = rng.uniform(14, 18), "w"
        else:
            height, kind = rng.uniform(9, 13), "b"
        base = float(g.min()) - oH - 0.6  # sunk so no gap shows on a slope
        top = float(np.median(g)) - oH + height
        xs, zs = poly.exterior.coords.xy
        out.append({"b": round(base, 1), "t": round(top, 1), "k": kind,
                    "o": [round(float(v), 1) for p in zip(list(xs)[:-1], list(zs)[:-1]) for v in p]})
    frame = {"origin_osgb": meta["origin_osgb"], "origin_h": oH, "axis_deg": meta["bridge_axis_deg"], "bbox_osgb": meta["bbox_osgb"]}
    source = ("Footprints traced from the OS London Town Plan 1:1056, 1893-96, reproduced with the permission of the "
              "National Library of Scotland (CC-BY); heights inferred by use, see scripts/history/period_city.py")
    OUT.write_text(json.dumps({"frame": frame, "source": source, "buildings": out}, separators=(",", ":")))
    print(f"{len(out)} period buildings -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
