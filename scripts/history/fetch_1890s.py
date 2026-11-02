"""Mosaic the NLS OS London Town Plan (1893-96) tiles onto the terrain's OSGB grid.

uv run --with pyproj --with pillow --with numpy python scripts/history/fetch_1890s.py  ->  web/public/terrain/tower-bridge/color-1890s.jpg
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
from PIL import Image, ImageFilter
from pyproj import Transformer

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


def corridor(h, w, near=150.0, feather=50.0):
    """1 within `near` m of the bridge axis (out to the bbox ends), 0 past near + feather: the ground the end views see."""
    meta = json.loads((OUT / "meta.json").read_text())
    oE, oN = meta["origin_osgb"][:2]
    t = math.radians(meta["bridge_axis_deg"])
    x = (np.arange(w) + 0.5) + BBOX[0] - oE
    z = oN - (BBOX[3] - (np.arange(h) + 0.5))
    X, Z = np.meshgrid(x, z)
    u = np.abs(X * math.cos(t) + Z * math.sin(t))  # across the axis (bareEarth.js frame)
    return np.clip(1 - (u - near) / feather, 0, 1)[..., None]


def main():
    out, n = osgb_mosaic()
    im = Image.fromarray(out)
    # ink lines are ~1 px; a 3 px min filter thickens them so they survive the mipmaps seen from orbit
    inked = np.asarray(im.filter(ImageFilter.MinFilter(3)), float)
    # near the bridge the camera sits low, so the sheet's lettering read as print on the ground and the ramps:
    # a 5 px grey closing (max then min) wipes ink thinner than 5 m, keeping the water and block tints
    clean = np.asarray(im.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)), float)
    m = corridor(*out.shape[:2])
    Image.fromarray((clean * m + inked * (1 - m)).round().astype(np.uint8)).save(OUT / "color-1890s.jpg", quality=85)
    print(f"{n} tiles -> {OUT / 'color-1890s.jpg'}")


if __name__ == "__main__":
    main()
