"""Bake the 1890s riverside around Tower Bridge from the OS London Town Plan (1893-96) itself.

uv run --with pyproj --with pillow --with numpy --with scipy --with scikit-image --with shapely \
    python scripts/history/period_city.py   ->  web/public/buildings/tower-bridge-1890s.json

Footprints: the town plan shades every building (solid grey on the Southwark sheets, hatching north of the river).
Shaded land is traced into blocks, split along a 22 m grid turned to the bridge axis so long terraces read as
separate houses, and extruded. Buildings dated to 1894 or earlier (OSM start_date, or modern_dates.py: the Tower of
London precinct) are cut out:
Buildings.jsx already draws those from OSM, so nothing overlaps. A plot under an OSM building dated 1895-1949 stands
until that year, when Buildings.jsx shows the new one. Nothing is traced inside the Tower of London or its moat.
"landmarks": buildings OSM has only as multipolygons, which bake.py skips (the PLA building, 1922); Buildings.jsx draws
them with the OSM ones.
Heights (status inferred): there are no surveyed 1890s heights, so each block gets a period height by use:
riverside and dock warehouses (within 70 m of the water) 15-22 m, one lot in ten of a large inland block (breweries,
works) 13-17 m, terraced houses and shops 9-14 m (3-4 storeys). Ground: the bare-earth surface Terrain.jsx draws before 1950, so walls meet it.
The Blitz (wiki-st-katharine-docks): "All the warehouses around the eastern basin were destroyed, and the site they had
occupied remained derelict until the 1960s." Buildings within 40 m of the east basin end in 1940 ("e") and leave, until
1950 when the period city hands over to the modern one, a low rubble heap ("k": "r") with a few gutted wall stubs
standing on their outline (where and how high is illustrative).
Chimneys: one brick stack through each roofed house's hip (chimney()).
Roofs: within ROOFED m of the bridge, a near-rectangular plot gets a hipped slate roof over its minimum rectangle
("p": the four corners, ridge along the long side; Buildings.jsx builds it). Slate roofs on London stock brick are
the period's common build (status inferred; the plan shows footprints only, not roof forms).
"""
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring, unary_union
from skimage import measure

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_1890s import BBOX, osgb_mosaic  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TERRAIN = ROOT / "web/public/terrain/tower-bridge"
OSM = ROOT / "web/public/buildings/tower-bridge.json"
DATES = ROOT / "web/public/buildings/tower-bridge-dates.json"  # modern_dates.py: the Tower of London precinct, etc.
OUT = ROOT / "web/public/buildings/tower-bridge-1890s.json"
PX = 0.5  # m per pixel of the traced plan
PLOT = 22.0  # m: party-wall grid
ORIGIN = Point(0, 0)  # the bridge centre, in the scene frame
BUILT_BY = 1894
EAST_BASIN = (534060, 180470)  # a point inside St Katharine's east dock (OSGB)
BLITZ, MODERN = 1940, 1950
MOAT = 25.0  # m round the Tower's outer towers: the moat (drained in 1843, so grass in the period) and its banks
ROOFED = 650  # m from the bridge centre: pitched roofs where the camera usually is
# Tower Bridge Road (south) and Tower Bridge Approach (north), cut through the old streets for the bridge and opened
# with it in 1894: OSM carriageway centrelines (OSGB, ODbL) and a 20 m street. A traced plot mostly on it stands until then.
ROAD_1894 = [[(533616, 180118), (533565, 179985), (533515, 179854), (533423, 179515)],
             [(533733, 180417), (533743, 180458), (533760, 180619), (533768, 180689), (533774, 180705)]]
ROAD_HALF = 10.0


def bare_earth(meta, name="bare.png"):
    """The ground the scene draws in every era: bare.png, the EA LiDAR DTM (scripts/terrain/build.py), metres OD, 1 m grid.
    height.png is the DSM (roofs) on the same grid."""
    rgb = np.asarray(Image.open(TERRAIN / name).convert("RGB")).astype(np.float64)
    return meta["min_h"] + (rgb[..., 0] * 256 + rgb[..., 1]) / 65535 * (meta["max_h"] - meta["min_h"])


# The Port of London Authority building, 10 Trinity Square, the interwar landmark seen from the bridge. OSM has it as a
# multipolygon (relation 1020011, ODbL), which bake.py skips; outline and courtyard copied here in OSGB, 2026-11-02.
# Built 1912-1922 (OSM year_of_construction), so it stands from 1922.
PLA_FROM = 1922
PLA_OUTER = [(533487.5, 180839.9), (533476.0, 180838.7), (533476.3, 180837.3), (533423.8, 180829.6), (533423.5, 180832.1),
             (533412.6, 180830.6), (533413.8, 180820.1), (533416.0, 180820.3), (533422.5, 180766.2), (533420.6, 180766.0),
             (533421.8, 180756.2), (533427.0, 180756.8), (533432.3, 180757.3), (533432.2, 180758.8), (533459.6, 180761.5),
             (533459.8, 180759.8), (533471.4, 180761.1), (533471.1, 180763.4), (533471.9, 180764.0), (533472.8, 180762.9),
             (533492.1, 180787.4), (533491.1, 180788.5), (533491.2, 180789.2), (533493.5, 180789.7), (533492.2, 180801.4),
             (533490.4, 180801.4), (533487.3, 180828.1), (533488.9, 180828.5)]
PLA_INNER = [(533435.9, 180776.6), (533431.8, 180812.7), (533434.0, 180815.8), (533470.5, 180819.9), (533472.8, 180818.4),
             (533474.8, 180801.2), (533469.9, 180795.1), (533452.6, 180808.4), (533442.3, 180806.9), (533443.4, 180796.9),
             (533459.6, 180783.9), (533458.5, 180782.4), (533460.0, 180781.0), (533457.2, 180777.5), (533438.5, 180775.0)]


def landmarks(meta, ground):
    """The PLA building for Buildings.jsx, in the scene frame: the block to the DSM's 80th percentile over its footprint,
    and its tower, the cells within 3 m of the highest return, as a box to that height."""
    (oE, oN), oH = meta["origin_osgb"], meta["origin_h"]
    minE, _, _, maxN = meta["bbox_osgb"]
    dsm = bare_earth(meta, "height.png")
    m = Image.new("1", (dsm.shape[1], dsm.shape[0]))
    ImageDraw.Draw(m).polygon([(e - minE, maxN - n) for e, n in PLA_OUTER], fill=1)
    ImageDraw.Draw(m).polygon([(e - minE, maxN - n) for e, n in PLA_INNER], fill=0)
    inside = np.asarray(m)
    flat = lambda ring: [round(v, 1) for e, n in ring for v in (e - oE, oN - n)]
    base, top, peak = float(ground[inside].min()) - oH - 0.6, float(np.percentile(dsm[inside], 80)) - oH, float(dsm[inside].max())
    rr, cc = np.nonzero(inside & (dsm > peak - 3))
    tower = [(minE + cc.min(), maxN - rr.max() - 1), (minE + cc.max() + 1, maxN - rr.max() - 1), (minE + cc.max() + 1, maxN - rr.min()), (minE + cc.min(), maxN - rr.min())]
    keep = {"k": "s", "s": PLA_FROM, "n": "Port of London Authority"}
    return [{"id": "r1020011", "b": round(base, 1), "t": round(top, 1), "o": flat(PLA_OUTER), "h": [flat(PLA_INNER)], **keep},
            {"id": "r1020011-tower", "b": round(top - 1, 1), "t": round(peak - oH, 1), "o": flat(tower), **keep}]


def chimney(b):
    """A house's stack: 3 x 1.2 m on the middle of one short side of its roof rectangle, 1.5 m in, standing 1.2 m clear
    of the hip's ridge (Buildings.jsx's rise, pitch 0.7 capped at 3.5 m). Dimensions illustrative."""
    c = np.array(b["p"]).reshape(4, 2)
    if np.linalg.norm(c[1] - c[0]) > np.linalg.norm(c[2] - c[1]):
        c = np.roll(c, -1, axis=0)  # now c0-c1 is a short side
    mid, along = (c[0] + c[1]) / 2, (c[3] - c[0]) / np.linalg.norm(c[3] - c[0])
    across = (c[1] - c[0]) / np.linalg.norm(c[1] - c[0])
    centre = mid + along * 2.1
    pts = [centre + i * across * 1.5 + j * along * 0.6 for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    rise = min(np.linalg.norm(c[1] - c[0]) / 2 * 0.7, 3.5)
    out = {"b": round(b["t"] - 1, 1), "t": round(b["t"] + rise + 1.2, 1), "k": "b", "o": [round(float(v), 1) for q in pts for v in q]}
    return out | {k: b[k] for k in ("s", "e") if k in b}


def main():
    meta = json.loads((TERRAIN / "meta.json").read_text())
    minE, minN, maxE, maxN = BBOX
    oE, oN = meta["origin_osgb"]
    oH, water = meta["origin_h"], meta["water_h"]
    theta = math.radians(meta["bridge_axis_deg"])
    ground = bare_earth(meta)  # 1500 x 1500, row 0 north
    road = unary_union([LineString([(e - oE, oN - n) for e, n in line]).buffer(ROAD_HALF) for line in ROAD_1894])
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
    land = up(ground) > water - 1.0  # the DTM carves the river bed to water_h - 2 (terrain/build.py); low Bermondsey is ~2 m OD
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
    u = XX * math.cos(theta) + ZZ * math.sin(theta)  # along the river, as three.js rotation-y turns the grid
    v = -XX * math.sin(theta) + ZZ * math.cos(theta)  # along the bridge, south +
    # the bridge's own ground: bareEarth.js BRIDGE_GROUND (piers and spans, approach roadway, engine house), 1 m clear
    cut = (np.abs(u) < 33) & (np.abs(v) < 146)
    cut |= (np.abs(u) < 11) & (np.abs(v) < 321)
    cut |= (u > 14.5) & (u < 42) & (v > 139.5) & (v < 167.5)
    cut |= (u > 41) & (u < 45) & (v > 145) & (v < 151)  # the house's NE corner by the chimney, which BRIDGE_GROUND leaves to Anchor Brewhouse
    shaded &= ~cut

    # OSM buildings already dated to the period are drawn from OSM: cut them out (1 m clear)
    osm = json.loads(OSM.read_text())
    dates = json.loads(DATES.read_text())["dates"]
    keep = Image.new("1", (W, H), 0)
    d = ImageDraw.Draw(keep)
    later = []  # OSM buildings dated 1895-1949 (Adelaide House, 1925): Buildings.jsx shows them from that year
    castle = []  # the Tower of London's buildings and towers (modern_dates.py)
    marks = landmarks(meta, ground)
    later.append((Polygon(list(zip(marks[0]["o"][0::2], marks[0]["o"][1::2]))).buffer(0), PLA_FROM))
    for b in osm["buildings"]:
        date = dates.get(b["id"].split("-")[0], {})
        s = date.get("s", b.get("s"))
        if date.get("src") == "wiki-tower-of-london":
            castle.append(Polygon(list(zip(b["o"][0::2], b["o"][1::2]))).buffer(0))
        if s is not None and BUILT_BY < s < MODERN:
            later.append((Polygon(list(zip(b["o"][0::2], b["o"][1::2]))).buffer(0), s))
        if s is not None and s <= BUILT_BY:
            o = b["o"]
            d.polygon([((o[i] + oE - minE) / PX, (maxN - (oN - o[i + 1])) / PX) for i in range(0, len(o), 2)], fill=1)
    shaded &= ~ndi.binary_dilation(np.asarray(keep), iterations=2)

    # St Katharine's east dock: the plan tints each basin's edge, so fill the outline and take the one holding EAST_BASIN
    basins, _ = ndi.label(ndi.binary_fill_holes(ndi.binary_opening((rgb[..., 2] - rgb[..., 0]) > 12, iterations=2)))
    east = basins == basins[int((maxN - EAST_BASIN[1]) / PX), int((EAST_BASIN[0] - minE) / PX)]
    assert 4000 < east.sum() * PX * PX < 40000, "east dock not found on the plan"
    blitzed = ndi.distance_transform_edt(~east) * PX < 40

    # inside the walls and the moat the plan's shading is the Tower itself, drawn from OSM: no houses on the green
    precinct = unary_union(castle).convex_hull.buffer(MOAT)
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
        if poly.geom_type != "Polygon" or poly.area < 25 or precinct.contains(poly.centroid):
            continue
        rr, cc = np.nonzero(mask)
        rr, cc = rr + sl[0].start, cc + sl[1].start
        g = ground[np.clip(rr // 2, 0, 1499), np.clip(cc // 2, 0, 1499)]
        block_area = sizes[blocks[rr[0], cc[0]]]
        if near_water[rr, cc].mean() > 0.5:
            height, kind = rng.uniform(15, 22), "w"  # warehouse
        elif block_area > 2500 and rng.random() < 0.1:  # terraces join into big blocks, so only a few lots are works
            height, kind = rng.uniform(13, 17), "w"
        else:
            height, kind = rng.uniform(9, 14), "b"
        base = float(g.min()) - oH - 0.6  # sunk so no gap shows on a slope
        top = float(np.median(g)) - oH + height
        xs, zs = poly.exterior.coords.xy
        o = [round(float(v), 1) for p in zip(list(xs)[:-1], list(zs)[:-1]) for v in p]
        if blitzed[rr, cc].mean() > 0.5:
            out.append({"b": round(base, 1), "t": round(top, 1), "k": kind, "e": BLITZ, "o": o})
            ground_y = float(np.median(g)) - oH
            out.append({"b": round(base, 1), "t": round(ground_y + rng.uniform(1.5, 3.5), 1), "k": "r", "s": BLITZ, "e": MODERN, "o": o})
            ring = poly.exterior
            for _ in range(int(rng.integers(2, 6))):  # gutted shells: stretches of outer wall left standing
                a0 = rng.uniform(0, ring.length)
                seg = substring(ring, a0, min(a0 + rng.uniform(6, 18), ring.length))
                wall = seg.buffer(0.35, cap_style="flat")
                if wall.geom_type != "Polygon" or wall.area < 2:
                    continue
                wall = wall.simplify(0.1)
                wx, wz = wall.exterior.coords.xy
                out.append({"b": round(base, 1), "t": round(ground_y + rng.uniform(4, 0.8 * height), 1), "k": "w", "s": BLITZ,
                            "e": MODERN, "o": [round(float(v), 1) for q in zip(list(wx)[:-1], list(wz)[:-1]) for v in q]})
        else:
            b = {"b": round(base, 1), "t": round(top, 1), "k": kind, "o": o}
            if poly.intersection(road).area > 0.25 * poly.area:
                b["e"] = BUILT_BY  # cleared for the new road
            for shape, year in later:  # the plot it was built on stands until then
                if poly.intersection(shape).area > 0.25 * poly.area:
                    b["e"] = min(b.get("e", MODERN), year)
            rect = poly.minimum_rotated_rectangle
            if poly.centroid.distance(ORIGIN) < ROOFED and poly.area > 0.85 * rect.area:
                b["p"] = [round(float(v), 1) for q in list(rect.exterior.coords)[:4] for v in q]
            out.append(b)
            if "p" in b and kind == "b":
                out.append(chimney(b))
    frame = {"origin_osgb": meta["origin_osgb"], "origin_h": oH, "axis_deg": meta["bridge_axis_deg"], "bbox_osgb": meta["bbox_osgb"]}
    source = ("Footprints traced from the OS London Town Plan 1:1056, 1893-96, reproduced with the permission of the "
              "National Library of Scotland (CC-BY); heights inferred by use, see scripts/history/period_city.py")
    OUT.write_text(json.dumps({"frame": frame, "source": source, "buildings": out, "landmarks": marks}, separators=(",", ":")))
    print(f"{len(out)} period buildings -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
