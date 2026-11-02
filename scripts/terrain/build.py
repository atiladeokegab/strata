# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "tifffile", "pillow", "httpx"]
# ///
"""Build the Tower Bridge terrain assets from real UK LiDAR.

    uv run scripts/terrain/build.py

Writes web/public/terrain/tower-bridge/{height.png, bare.png, color.jpg, meta.json} and
web/public/terrain/waternormals.jpg. height.png is the DSM (surface: roofs, trees), drawn only as the LiDAR point view;
bare.png is the DTM (ground), the terrain mesh. Both get the same river, bridge-cut, abutment and engine-house edits.

height.png is RGB-encoded 16-bit: v = R*256 + G, h = min_h + v/65535 * (max_h - min_h), metres OD.
Row 0 is the north edge, column 0 the west edge, one pixel per metre (pixel centres).
"""

import io
import json
from pathlib import Path

import httpx
import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/public/terrain/tower-bridge"
CACHE = Path(__file__).resolve().parent / ".cache"

WCS = "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-last-return-dsm-1m/wcs"
COVERAGE = "9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m"
DTM_WCS = "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs"
DTM_COVERAGE = "13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m"
IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"

HINT = (533782, 180242)  # brief's guess; refined from the towers below
HALF = 750  # metres either side of the origin
IMG_PX = 4096  # imagery is fetched as 2x2 tiles of 2048, the export's working limit
BRIDGE_CUT = {"length": 270.0, "width": 64.0}  # metres, along / across the bridge axis
ABUTMENT_END = 153.0  # m along the axis: the shore abutments stand just outside the cut, ending about here



# Engine house and pump house (bridge-local x 16-47.5, z 140.5-169.5 south) plus a 2 m apron: the DSM there is the
# real buildings beside the south approach, which bury our free-standing house and any camera framing it.
ENGINE_HOUSE = {"across": (14.0, 49.5), "along": (-171.5, -138.5), "y": -3.4}  # m; along is north-positive, so -z


def carve_engine_house(a, along, across, origin_h, encode=lambda h: h):
    m = (across >= ENGINE_HOUSE["across"][0]) & (across < ENGINE_HOUSE["across"][1])
    m &= (along >= ENGINE_HOUSE["along"][0]) & (along < ENGINE_HOUSE["along"][1])
    a[m] = encode(origin_h + ENGINE_HOUSE["y"])


def fill_abutments(a, along, across, axis):
    """The DSM sees the shore abutments' roofs as an 18 m wall across the road (|along| 135-143). Our procedural
    abutments replace them, so fill that band from the street just beyond, keeping the road open. Mutates a."""
    L = BRIDGE_CUT["length"] / 2
    band = (np.abs(along) >= L - 2) & (np.abs(along) < ABUTMENT_END) & (np.abs(across) < 20)
    ys, xs = np.nonzero(band)
    street = []
    for k in (3, 6, 9):  # step out along the axis to the street; the lowest of three skips lamp posts and railings
        d = np.sign(along[ys, xs]) * (ABUTMENT_END + k) - along[ys, xs]
        sy = np.clip(np.round(ys - d * axis[1]).astype(int), 0, a.shape[0] - 1)  # rows run south
        sx = np.clip(np.round(xs + d * axis[0]).astype(int), 0, a.shape[1] - 1)
        street.append(a[sy, sx])
    a[ys, xs] = np.minimum.reduce(street)


# The approach roads stand on viaducts and embankments (1894 onwards), which the DTM drops with the buildings, leaving
# the bridge's ramp ends in mid-air. Keep the DSM along both approaches, no higher than the road itself (the lowest point
# within `road` of the centre line, bin by bin), so the roofs and trees lining the corridor do not stand as cliffs.
APPROACH = {"from": 133.0, "to": 320.0, "half": 20.0, "road": 6.0}  # m along / either side of the axis / road half-width; bareEarth.js has the same


def keep_approaches(bare, surface, along, across):
    """Raise bare earth to the approach roads' surface, binned along the axis (2 m bins). Mutates and returns bare."""
    a, c = np.abs(along), np.abs(across)
    corridor = (a >= APPROACH["from"]) & (a < APPROACH["to"]) & (c < APPROACH["half"])
    bins = np.floor((along + APPROACH["to"]) / 2.0).astype(int)
    road = np.full(int(np.ceil(2 * APPROACH["to"] / 2.0)), np.inf)
    on = corridor & (c < APPROACH["road"])
    np.minimum.at(road, bins[on], surface[on])
    # the ramps only descend away from the bridge: where the straight axis runs under a building past the road's
    # bend, its roof is not the road, so no bin may stand above the one nearer the bridge
    mid = int(APPROACH["to"] // 2.0)
    road[mid:] = np.minimum.accumulate(road[mid:])
    road[:mid + 1] = np.minimum.accumulate(road[:mid + 1][::-1])[::-1]
    bare[corridor] = np.maximum(bare[corridor], np.minimum(surface[corridor], road[bins[corridor]]))
    return bare


def check_keep_approaches():
    """Self-check on a synthetic tile: a viaduct kept, a roadside roof capped at road level, the rest left alone."""
    along, across = np.meshgrid(np.arange(-400, 400) + 0.5, np.arange(-60, 60) + 0.5)
    ramp = np.clip(13 - (np.abs(along) - 133) * 0.03, 6, 13)  # the deck at 13 m, descending away from the bridge
    surface = np.where(np.abs(across) < 8, ramp, 3.0)
    surface[(np.abs(across - 12) < 3) & (np.abs(along - 200) < 5)] = 30.0  # a roadside building in the corridor
    surface[(np.abs(across) < 8) & (np.abs(along + 250) < 3)] = 25.0  # a building over the axis past the bend
    surface[(np.abs(across - 40) < 3) & (np.abs(along - 200) < 5)] = 30.0  # a building outside the corridor
    kept = keep_approaches(np.full(surface.shape, 3.0), surface, along, across)
    at = lambda al, ac: kept[int(ac + 60), int(al + 400)]
    assert abs(at(200, 0) - ramp[0, 600]) < 0.1, "the viaduct is kept (to its 2 m bin's low end)"
    assert at(200, 12) <= ramp[0, 600] + 0.01, "the roadside roof is capped at the road"
    assert at(-250, 0) <= ramp[0, 150] + 0.31, "the roof over the axis is capped at the bin nearer the bridge"
    assert at(200, 40) == 3.0 and at(50, 0) == 3.0, "outside the corridor and inside the bridge cut, untouched"


def get(url, params, name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        r = httpx.get(url, params=params, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path.read_bytes()


def dsm(minE, minN, maxE, maxN, wcs=WCS, coverage=COVERAGE, kind="dsm"):
    params = {
        "service": "WCS", "version": "2.0.1", "request": "GetCoverage", "CoverageId": coverage,
        "format": "image/tiff", "subset": [f"E({minE},{maxE})", f"N({minN},{maxN})"],
    }
    raw = get(wcs, params, f"{kind}_{minE}_{minN}_{maxE}_{maxN}.tif")
    a = tifffile.imread(io.BytesIO(raw)).astype(np.float64)
    assert a.shape == (maxN - minN, maxE - minE), a.shape
    return a


def imagery(minE, minN, maxE, maxN):
    tile, half = IMG_PX // 2, (maxE - minE) / 2
    out = Image.new("RGB", (IMG_PX, IMG_PX))
    for ty in range(2):
        for tx in range(2):
            e0, n1 = minE + tx * half, maxN - ty * half
            params = {"bbox": f"{e0},{n1 - half},{e0 + half},{n1}", "bboxSR": 27700, "imageSR": 27700,
                      "size": f"{tile},{tile}", "format": "jpg", "f": "image"}
            raw = get(IMAGERY, params, f"img_{e0}_{n1}_{tile}.jpg")
            out.paste(Image.open(io.BytesIO(raw)).convert("RGB"), (tx * tile, ty * tile))
    return out


def towers(a, minE, maxN):
    """Centroids (E, N) of the two biggest blobs above 55 m near the centre: the towers (the walkways join them at 40 m)."""
    lab, n = ndimage.label(a > 55)
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    cy, cx = np.array(a.shape) / 2
    blobs = []
    for i in np.argsort(sizes)[::-1]:
        y, x = ndimage.center_of_mass(lab == i + 1)
        if abs(y - cy) < 150 and abs(x - cx) < 200 and 100 < sizes[i] < 2000:
            blobs.append((minE + x + 0.5, maxN - y - 0.5))
        if len(blobs) == 2:
            break
    assert len(blobs) == 2, "could not find both towers"
    return sorted(blobs, key=lambda b: -b[1])  # north tower first


def main():
    # 1. find the towers in a first window around the hint, then centre on the deck between them
    hE, hN = HINT
    first = dsm(hE - HALF, hN - HALF, hE + HALF, hN + HALF)
    (nE, nN), (sE, sN) = towers(first, hE - HALF, hN + HALF)
    oE, oN = round((nE + sE) / 2, 1), round((nN + sN) / 2, 1)
    axis = np.array([nE - sE, nN - sN]) / np.hypot(nE - sE, nN - sN)  # unit vector, south tower -> north tower
    minE, minN, maxE, maxN = round(oE) - HALF, round(oN) - HALF, round(oE) + HALF, round(oN) + HALF

    a = dsm(minE, minN, maxE, maxN)
    E = minE + 0.5 + np.arange(a.shape[1])[None, :]
    N = maxN - 0.5 - np.arange(a.shape[0])[:, None]
    along = (E - oE) * axis[0] + (N - oN) * axis[1]
    across = (E - oE) * axis[1] - (N - oN) * axis[0]

    # deck road level: low percentile of the strip between the towers (walkways sit above it)
    gap = np.hypot(nE - sE, nN - sN)
    strip = (np.abs(along) < gap / 2 - 12) & (np.abs(across) < 6)
    origin_h = round(float(np.percentile(a[strip], 30)), 2)

    # 2. water: the river is the one big, flat, low region (the river walls stand above 4 m OD)
    flat = ndimage.maximum_filter(a, 5) - ndimage.minimum_filter(a, 5) < 0.15
    lab, n = ndimage.label(flat & (a < 3.6))
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    river = np.isin(lab, 1 + np.flatnonzero(sizes > 20000))
    river = ndimage.binary_closing(river, iterations=4)
    lab, n = ndimage.label(~river)  # swallow specks of noise; real boats (HMS Belfast, piers) are bigger
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    river |= np.isin(lab, 1 + np.flatnonzero(sizes < 150))
    water_h = round(float(np.median(a[river])), 2)
    bed = water_h - 2.0

    bank = ndimage.binary_dilation(river, iterations=12) & ~river
    w, L = BRIDGE_CUT["width"] / 2, BRIDGE_CUT["length"] / 2
    cut = (np.abs(along) < L) & (np.abs(across) < w)

    def edit(a):
        """The river, bank, bridge-cut, abutment and engine-house edits (the masks come from the DSM)."""
        # carve: the river and the noisy pixels below it go to a bed under the water plane
        a = np.where(a < bed, ndimage.median_filter(a, 7), a)
        a[river] = bed
        a = np.maximum(a, bed)
        # banks: moored boats, piers and wall-top noise make spikes; a 5 m median over a 12 m strip calms them
        a[bank] = ndimage.median_filter(a, 5)[bank]
        # cut the bridge out: fill its footprint from the ground either side of it
        ys, xs = np.nonzero(cut)
        sides = []
        for sign in (1, -1):  # step out across the axis to just beyond the footprint
            d = sign * (w + 3) - across[ys, xs]
            sy = np.clip(np.round(ys + d * axis[0]).astype(int), 0, a.shape[0] - 1)  # +across is (axis_n, -axis_e) in (E, N); rows run south
            sx = np.clip(np.round(xs + d * axis[1]).astype(int), 0, a.shape[1] - 1)
            sides.append(a[sy, sx])
        a[ys, xs] = np.minimum(*sides)
        fill_abutments(a, along, across, axis)
        carve_engine_house(a, along, across, origin_h)
        return a

    a = edit(a)
    # the ground: the EA DTM has buildings, trees and the bridge removed, and the approach viaducts with them
    check_keep_approaches()
    b = keep_approaches(edit(dsm(minE, minN, maxE, maxN, DTM_WCS, DTM_COVERAGE, "dtm")), a, along, across)

    min_h, max_h = float(np.floor(min(a.min(), b.min()))), float(np.ceil(max(a.max(), b.max())))

    def encode(a):
        v = np.round((a - min_h) / (max_h - min_h) * 65535).astype(np.uint16)
        rgb = np.dstack([v >> 8, v & 255, np.zeros_like(v)]).astype(np.uint8)
        decoded = min_h + ((rgb[..., 0].astype(int) << 8) + rgb[..., 1]) / 65535 * (max_h - min_h)
        assert np.abs(decoded - a).max() < 0.01  # self-check of the encoding
        return rgb

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(encode(a)).save(OUT / "height.png", optimize=True)
    Image.fromarray(encode(b)).save(OUT / "bare.png", optimize=True)
    imagery(minE, minN, maxE, maxN).save(OUT / "color.jpg", quality=84, optimize=True, progressive=True)
    water_normals(OUT.parent / "waternormals.jpg")

    meta = {
        "bbox_osgb": [minE, minN, maxE, maxN],
        "size_px": [a.shape[1], a.shape[0]],
        "min_h": min_h,
        "max_h": max_h,
        "origin_osgb": [oE, oN],
        "origin_h": origin_h,
        "water_h": water_h,
        "towers_osgb": [[round(nE, 1), round(nN, 1)], [round(sE, 1), round(sN, 1)]],
        "bridge_axis_deg": round(float(np.degrees(np.arctan2(axis[0], axis[1]))), 2),
        "bridge_cut": BRIDGE_CUT,
        "encoding": "RGB 16-bit: v = R*256+G; h = min_h + v/65535*(max_h-min_h) metres OD; row 0 north, 1 px = 1 m",
        "source": {
            "height": f"Environment Agency National LIDAR Programme, LIDAR Composite DSM 1 m (last return), WCS {WCS} coverage {COVERAGE}",
            "bare": f"Environment Agency National LIDAR Programme, LIDAR Composite DTM 1 m, WCS {DTM_WCS} coverage {DTM_COVERAGE}; the approach viaducts kept from the DSM",
            "color": f"Esri World Imagery, MapServer export {IMAGERY}",
        },
        "licence": {
            "height": "Open Government Licence v3.0. Contains Environment Agency information © Environment Agency copyright and/or database right 2022.",
            "color": "Esri World Imagery terms of use. Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community.",
        },
        "attribution": "LiDAR © Environment Agency (OGL v3). Imagery © Esri, Maxar, Earthstar Geographics.",
    }
    prev = OUT / "meta.json"  # keep what others add (near.py's near and files, credits)
    meta = {**(json.loads(prev.read_text()) if prev.exists() else {}), **meta}
    prev.write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps({k: meta[k] for k in ("origin_osgb", "origin_h", "water_h", "min_h", "max_h", "bridge_axis_deg")}))
    for p in sorted(OUT.parent.rglob("*.*")):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size / 1e6:.2f} MB")


def water_normals(path, n=512):
    """A tileable normal map of summed waves for the Thames surface."""
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:n, 0:n] / n * 2 * np.pi
    hgt = np.zeros((n, n))
    for _ in range(40):
        kx, ky = rng.integers(-12, 13, 2)
        if kx == ky == 0:
            continue
        hgt += np.sin(kx * x + ky * y + rng.uniform(0, 2 * np.pi)) / np.hypot(kx, ky) ** 1.2
    gy, gx = np.gradient(hgt)
    flat = np.percentile(np.hypot(gx, gy), 95) / 0.35  # gentle: 95% of the surface tilts under ~19 degrees
    nrm = np.dstack([-gx, -gy, np.full_like(hgt, flat)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save(path, quality=90)


if __name__ == "__main__":
    main()
