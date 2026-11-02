"""Mosaic the NLS OS London Town Plan (1893-96) tiles onto the terrain's OSGB grid.

uv run --with pyproj --with pillow --with numpy --with scipy python scripts/history/fetch_1890s.py  ->  web/public/terrain/tower-bridge/color-1890s.jpg
Same bbox and 1 m pixels as color.jpg (row 0 north), so Terrain.jsx can swap it in for years before 1950.
Tiles: OS London Five-foot to the mile 1893-96, "Reproduced with the permission of the National Library of Scotland"
(CC-BY, https://maps.nls.uk/copyright.html); credit it on screen with a link to https://maps.nls.uk/.
"""
import io
import json
import math
from pathlib import Path
import urllib.request

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/public/terrain/tower-bridge"
URL = "https://mapseries-tilesets.s3.amazonaws.com/london_1890s/{z}/{x}/{y}.png"
Z = 18
BBOX = (532920, 179515, 534420, 181015)  # meta.json bbox_osgb
CACHE = Path("/tmp/claude-1001/nls-tiles")


def tile(x, y):
    p = CACHE / f"{Z}_{x}_{y}.png"
    if not p.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers={"User-Agent": "strata-hackathon"})
        try:
            p.write_bytes(urllib.request.urlopen(req, timeout=20).read())
        except Exception:
            return None
    return Image.open(io.BytesIO(p.read_bytes())).convert("RGB")


def osgb_mosaic(px=1.0):
    """The town plan resampled onto the terrain's OSGB bbox at px metres per pixel (row 0 north), RGB uint8."""
    minE, minN, maxE, maxN = BBOX
    w, h = round((maxE - minE) / px), round((maxN - minN) / px)
    E, N = np.meshgrid((np.arange(w) + 0.5) * px + minE, maxN - (np.arange(h) + 0.5) * px)
    lon, lat = Transformer.from_crs(27700, 4326, always_xy=True).transform(E, N)
    n = 2 ** Z
    px = (lon + 180) / 360 * n * 256
    py = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n * 256
    x0, y0 = int(px.min() // 256), int(py.min() // 256)
    x1, y1 = int(px.max() // 256), int(py.max() // 256)
    mosaic = np.full(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), 236, np.uint8)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            im = tile(tx, ty)
            if im is not None:
                mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = np.asarray(im)
    ix = np.clip((px - x0 * 256).astype(int), 0, mosaic.shape[1] - 1)
    iy = np.clip((py - y0 * 256).astype(int), 0, mosaic.shape[0] - 1)
    out = mosaic[iy, ix]
    assert out.shape == (h, w, 3) and out.std() > 10, "mosaic is blank: tiles did not load"
    return out, (x1 - x0 + 1) * (y1 - y0 + 1)


def grid(bbox, shape):
    """The scene's u (across the bridge axis, bareEarth.js frame) and E, N at each pixel centre of an OSGB bbox, row 0 north."""
    meta = json.loads((OUT / "meta.json").read_text())
    oE, oN = meta["origin_osgb"][:2]
    t = math.radians(meta["bridge_axis_deg"])
    h, w = shape
    E = bbox[0] + (np.arange(w) + 0.5) * (bbox[2] - bbox[0]) / w
    N = bbox[3] - (np.arange(h) + 0.5) * (bbox[3] - bbox[1]) / h
    E, N = np.meshgrid(E, N)
    return (E - oE) * math.cos(t) + (oN - N) * math.sin(t), E, N, meta


def finish(img, bbox, ink=3):
    """The draped sheet from a raw mosaic (uint8 RGB on the OSGB bbox, row 0 north), at any pixel size.

    Ink lines are ~1 px, so an `ink` px min filter thickens them to survive the mipmaps seen from orbit. Near the bridge
    the camera sits low, so the lettering read as print on the ground and the ramps: within 150 m of the axis (feathered
    over 50 m) a 5 m grey closing (max then min) wipes ink thinner than 5 m and keeps the water and block tints. Open
    paper by today's river, where the sheet draws the old foreshore or a blank wharf yard but the ground is quay, read
    as a flat pale slab (south foreshore, hero-1890): it becomes stone flags."""
    h, w = img.shape[:2]
    px = (bbox[2] - bbox[0]) / w  # m per pixel
    m = lambda metres: max(1, round(metres / px))
    u, E, N, meta = grid(bbox, (h, w))
    inked = ndimage.minimum_filter(img, (ink, ink, 1)).astype(float)
    clean = ndimage.grey_closing(img, (m(5), m(5), 1)).astype(float)
    a = np.clip(1 - (np.abs(u) - 150) / 50, 0, 1)[..., None]
    out = clean * a + inked * (1 - a)

    rgb = np.asarray(Image.open(OUT / "bare.png").convert("RGB")).astype(float)  # 1 m, the outer bbox
    ground = meta["min_h"] + (rgb[..., 0] * 256 + rgb[..., 1]) / 65535 * (meta["max_h"] - meta["min_h"])
    bed, _ = ndimage.label(ground < meta["water_h"] - 1.5)  # the carved bed (water_h - 2) and low pits such as the Scoop
    river = bed == np.bincount(bed.ravel())[1:].argmax() + 1  # the river is the largest
    river = ndimage.distance_transform_edt(~river) < 40
    ob = meta["bbox_osgb"]
    r = np.clip((ob[3] - N).astype(int), 0, ground.shape[0] - 1)
    c = np.clip((E - ob[0]).astype(int), 0, ground.shape[1] - 1)
    # warm paper (not the pale blue-green water) once thin ink is closed away, open for 9 m (not a street between blocks)
    paper = (clean.min(-1) > 200) & (np.ptp(clean, -1) < 40) & (clean[..., 1] <= clean[..., 0])
    paper = ndimage.minimum_filter(paper, m(9))
    q = ndimage.gaussian_filter(((ground[r, c] >= meta["water_h"]) & river[r, c] & paper).astype(float), m(1))[..., None]

    # stone flags 3 x 2 m in courses, each a little lighter or darker, with dark joints; mid-tone so the era grade draws
    # weathered stone, not paper
    rng = np.random.default_rng(1890)
    fu, fv = (E - ob[0]) / 3, (ob[3] - N) / 2
    fu = fu + (fv.astype(int) % 2) * 0.5
    flag = rng.normal(0, 8, (int(fv.max()) + 1, int(fu.max()) + 1))[fv.astype(int), fu.astype(int)]
    joint = ((fv % 1 < max(px, 0.15) / 2) | (fu % 1 < max(px, 0.15) / 3)) * -14.0
    stone = np.clip(np.array([160.0, 150, 134]) + (flag + joint)[..., None], 0, 255)
    return (stone * q + out * (1 - q)).round().astype(np.uint8)


def main():
    out, n = osgb_mosaic()
    img = finish(out, BBOX)
    Image.fromarray(img).save(OUT / "color-1890s.jpg", quality=85)
    print(f"{n} tiles -> {OUT / 'color-1890s.jpg'}")


if __name__ == "__main__":
    main()
