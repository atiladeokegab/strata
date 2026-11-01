"""Mosaic the NLS OS London Town Plan (1893-96) tiles onto the terrain's OSGB grid.

uv run --with pyproj --with pillow --with numpy python scripts/history/fetch_1890s.py  ->  web/public/terrain/tower-bridge/color-1890s.jpg
Same bbox and 1 m pixels as color.jpg (row 0 north), so Terrain.jsx can swap it in for years before 1950.
Tiles: National Library of Scotland, https://maps.nls.uk/os/townplans-england/ (CC BY 4.0).
"""
import io
import json
import math
from pathlib import Path
import urllib.request

import numpy as np
from PIL import Image
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


def main():
    minE, minN, maxE, maxN = BBOX
    w, h = maxE - minE, maxN - minN
    E, N = np.meshgrid(np.arange(w) + minE + 0.5, maxN - 0.5 - np.arange(h))
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
    Image.fromarray(out).save(OUT / "color-1890s.jpg", quality=85)
    print(f"{(x1 - x0 + 1) * (y1 - y0 + 1)} tiles -> {OUT / 'color-1890s.jpg'}")


if __name__ == "__main__":
    main()
