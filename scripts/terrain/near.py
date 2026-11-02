# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "tifffile", "imagecodecs", "pillow", "httpx", "pyproj"]
# ///
"""Build the desktop near-field tier: a 600 m square around Tower Bridge at the finest resolution available.

    uv run scripts/terrain/build.py   # first: the outer 1.5 km tile and meta.json
    uv run scripts/terrain/near.py

Writes web/public/terrain/tower-bridge/near/{height.png, color.jpg, color-1890s.jpg}, the first-load tile
lo/{bare.png, color.jpg, color-1890s.jpg} (under 500 KB, shown first on every device), and adds `near`, `lite` and a per-file `files` map (source + licence) to meta.json. Same encoding and min_h/max_h as
height.png, 0.5 m pixels. Phones and ?lite=1 never load these.

Height: EA's finest data here is the 2012 0.5 m time-stamped DSM (the composites stop at 1 m). It is
ten years older than the 1 m 2022 composite, so it is used only where the two agree; anything built,
demolished or edited since (and the carved river, banks and bridge cut from build.py) keeps the 2022 tile.
"""

import io
import json
import math
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np
import tifffile
from PIL import Image
from pyproj import Transformer
from scipy import ndimage

from build import CACHE, OUT, dsm

sys.path.append(str(Path(__file__).resolve().parents[1] / "history"))
from fetch_1890s import finish  # noqa: E402

NEAR = (533370, 180040, 533970, 180640)  # 600 m: the bridge, both approaches, the Tower of London and Shad Thames
RES = 0.5  # m per height pixel
IMG_PX = 4096  # 0.146 m per pixel; Esri z19 is 0.186 m on the ground here, NLS z20 0.093 m
DSM_URL = "https://environment.data.gov.uk/tiles/collections/survey/lidar_tiles_dsm/2012/0.5/TQ3080"
DSM_TILES = ["DSM_D0155383_20120402_20120416.tif", "DSM_D0154364_20111219_20120105.tif"]  # TQ3380, April 2012 first
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
ESRI_Z = 19  # London's deepest Esri level (z20 is "Map data not yet available"); the export API stops at ~0.3 m/px
NLS = "https://mapseries-tilesets.s3.amazonaws.com/london_1890s/{z}/{x}/{y}.png"
NLS_Z = 20  # z21 exists but is upsampled from the same scans (checked by eye); z20 is the sheet's native detail
LO = 4  # m per pixel of the first-load tile
CHANGED = 3.0  # m: a 1 m cell where 2012 and 2022 differ more than this is a changed building


def decode(path, meta):
    px = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    return meta["min_h"] + (px[..., 0] * 256 + px[..., 1]) / 65535 * (meta["max_h"] - meta["min_h"])


def tiles2012(minE, minN, maxE, maxN):
    """The 2012 0.5 m DSM over the bbox, NaN where neither flight covers it."""
    folder = CACHE / "dsm2012"
    if not all((folder / t).exists() for t in DSM_TILES):
        import zipfile
        folder.mkdir(parents=True, exist_ok=True)
        zpath = CACHE / "dsm2012-TQ38sw.zip"
        if not zpath.exists():
            with httpx.stream("GET", DSM_URL, timeout=600) as r:
                r.raise_for_status()
                with open(zpath, "wb") as f:
                    for chunk in r.iter_bytes():
                        f.write(chunk)
        with zipfile.ZipFile(zpath) as z:
            for t in DSM_TILES:
                z.extract(t, folder)
    out = np.full((round((maxN - minN) / RES), round((maxE - minE) / RES)), np.nan)
    for name in reversed(DSM_TILES):  # later in the list is the fallback, so it is pasted first
        with tifffile.TiffFile(folder / name) as t:
            page = t.pages[0]
            e0, n1 = page.tags["ModelTiepointTag"].value[3:5]
            a = page.asarray().astype(np.float64)
        assert page.tags["ModelPixelScaleTag"].value[:2] == (RES, RES)
        a[a < -100] = np.nan
        r0, c0 = round((n1 - maxN) / RES), round((minE - e0) / RES)
        sub = a[r0:r0 + out.shape[0], c0:c0 + out.shape[1]]
        assert sub.shape == out.shape, "near bbox must sit inside the 2012 tile"
        out = np.where(np.isnan(sub), out, sub)
    return out


def upsample(a, outer_bbox, minE, maxN, shape):
    """Bilinear sample of a 1 m outer grid at the near grid's 0.5 m pixel centres."""
    ominE, _, _, omaxN = outer_bbox
    i = (omaxN - 0.5) - (maxN - RES / 2 - np.arange(shape[0]) * RES)
    j = (minE + RES / 2 + np.arange(shape[1]) * RES) - (ominE + 0.5)
    ii, jj = np.meshgrid(i, j, indexing="ij")
    return ndimage.map_coordinates(a, [ii, jj], order=1, mode="nearest")


def xyz(url, z, name, px, bbox=NEAR):
    """Web-mercator XYZ tiles at zoom z, mosaicked and resampled (bilinear) onto the OSGB bbox, row 0 north."""
    minE, minN, maxE, maxN = bbox
    s = (maxE - minE) / px
    E, N = np.meshgrid(minE + s / 2 + np.arange(px) * s, maxN - s / 2 - np.arange(px) * s)
    lon, lat = Transformer.from_crs(27700, 4326, always_xy=True).transform(E, N)
    n = 2 ** z
    fx = (lon + 180) / 360 * n * 256
    fy = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n * 256
    x0, y0, x1, y1 = int(fx.min() // 256), int(fy.min() // 256), int(fx.max() // 256), int(fy.max() // 256)
    folder = CACHE / f"{name}{z}"
    folder.mkdir(parents=True, exist_ok=True)

    def tile(xy):
        p = folder / f"{xy[0]}_{xy[1]}"
        if not p.exists():
            r = httpx.get(url.format(z=z, x=xy[0], y=xy[1]), timeout=30, headers={"User-Agent": "strata-hackathon"})
            r.raise_for_status()
            p.write_bytes(r.content)
        return np.asarray(Image.open(p).convert("RGB"))

    xys = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), np.uint8)
    with ThreadPoolExecutor(16) as pool:
        for (x, y), im in zip(xys, pool.map(tile, xys)):
            mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = im
    out = np.dstack([ndimage.map_coordinates(mosaic[..., c], [fy - y0 * 256 - 0.5, fx - x0 * 256 - 0.5], order=1)
                     for c in range(3)]).astype(np.uint8)
    assert out.std() > 10, f"{name} mosaic is blank"
    return Image.fromarray(out), len(xys)


def encode(h, meta):
    """RGB 16-bit height.png pixels (build.py's encoding), self-checked to 1 cm."""
    h = np.clip(h, meta["min_h"], meta["max_h"])
    v = np.round((h - meta["min_h"]) / (meta["max_h"] - meta["min_h"]) * 65535).astype(np.uint16)
    rgb = np.dstack([v >> 8, v & 255, np.zeros_like(v)]).astype(np.uint8)
    decoded = meta["min_h"] + ((rgb[..., 0].astype(int) << 8) + rgb[..., 1]) / 65535 * (meta["max_h"] - meta["min_h"])
    assert np.abs(decoded - h).max() < 0.01  # self-check of the encoding
    return rgb


def lite(meta):
    """The first-load tile every device shows while the full one streams: 4 m ground, 768 px colour, 512 px 1890s.
    Made from the committed full-res files, so it carries build.py's carving, bridge cut and abutment fill."""
    out = OUT / "lo"
    out.mkdir(exist_ok=True)
    h = decode(OUT / "bare.png", meta)  # the ground only: the LiDAR view waits for the full DSM
    for res, path in ((LO, out / "bare.png"), (2, OUT / "bare-2m.png")):  # first-load; phones' full tile (~0.3 MB, not 1.7)
        n = h.shape[0] // res
        small = h[:n * res, :n * res].reshape(n, res, n, res).mean(axis=(1, 3))
        small = np.round(small / 0.05) * 0.05  # 5 cm steps: invisible at 2-4 m, and the PNG halves
        Image.fromarray(encode(small, meta)).save(path, optimize=True)
    for name, px, q in (("color.jpg", 768, 65), ("color-1890s.jpg", 512, 70)):
        Image.open(OUT / name).convert("RGB").resize((px, px), Image.LANCZOS).save(out / name, quality=q, optimize=True, progressive=True)
    meta["lite"] = {"size_px": [h.shape[0] // LO] * 2, "res_m": LO, "note": "Shown first on every device, then replaced by the full tile."}
    total = sum(f.stat().st_size for f in out.iterdir())
    assert total < 500_000, f"first-load tile is {total} bytes"
    assert (OUT / "bare-2m.png").stat().st_size < 400_000, "the phone tier's ground grew past 0.4 MB"
    return {f"lo/{f}": {"source": f"Downsampled from {f} ({'block mean' if f.endswith('.png') else 'Lanczos'})", "licence": meta["files"][f]["licence"]}
            for f in ("bare.png", "color.jpg", "color-1890s.jpg")} | {
        "bare-2m.png": {"source": "Downsampled from bare.png (2 m block mean); the phone tier's full tile", "licence": meta["files"]["bare.png"]["licence"]}}


def save_jpg(im, path, quality):
    """Progressive JPEG under 8 MB (the tier's per-file budget), stepping quality down if needed."""
    while True:
        im.save(path, quality=quality, optimize=True, progressive=True)
        if path.stat().st_size < 8e6:
            return quality
        quality -= 5


def main():
    meta = json.loads((OUT / "meta.json").read_text())
    outer = meta["bbox_osgb"]
    minE, minN, maxE, maxN = NEAR
    assert outer[0] < minE and outer[1] < minN and maxE < outer[2] and maxN < outer[3]

    # height: 2012 0.5 m where nothing has changed, else the processed 2022 1 m tile (bilinear)
    built = decode(OUT / "height.png", meta)  # carved river, calmed banks, bridge cut
    raw = dsm(*outer)  # the 2022 composite as flown, from build.py's cache
    fine = tiles2012(*NEAR)
    shape = fine.shape
    up_built = upsample(built, outer, minE, maxN, shape)
    up_raw = upsample(raw, outer, minE, maxN, shape)
    coarse = np.nanmean(fine.reshape(shape[0] // 2, 2, shape[1] // 2, 2), axis=(1, 3))  # 2012 at 1 m
    r0, c0 = outer[3] - maxN, minE - outer[0]
    raw1 = raw[r0:r0 + coarse.shape[0], c0:c0 + coarse.shape[1]]
    built1 = built[r0:r0 + coarse.shape[0], c0:c0 + coarse.shape[1]]
    edited = np.abs(built1 - raw1) > 0.05  # build.py's river, bank and bridge-cut edits
    flat = ~edited & (ndimage.maximum_filter(raw1, 3) - ndimage.minimum_filter(raw1, 3) < 0.3)
    bias = float(np.nanmedian((coarse - raw1)[flat]))  # survey-to-survey offset on open ground (a few cm)
    # changed buildings: a 5 m median of the difference, so a lone edge pixel or car does not count
    diff = np.nan_to_num(np.abs(coarse - bias - raw1), nan=99.0)  # no 2012 data counts as changed
    changed = ndimage.median_filter(diff, 5) > CHANGED
    keep = ndimage.binary_dilation(changed | edited, iterations=2) | (diff > 20)  # spikes: cranes, birds
    keep = np.repeat(np.repeat(keep, 2, 0), 2, 1) | np.isnan(fine)
    keep[:4], keep[-4:], keep[:, :4], keep[:, -4:] = True, True, True, True  # seam: the border matches the outer mesh
    # open ground carries ~5 cm of survey grain that reads as noise in close-up shading; smooth only where it is flat
    calm = np.nan_to_num(ndimage.gaussian_filter(np.nan_to_num(fine), 1.0))
    open_ground = ndimage.maximum_filter(fine, 3) - ndimage.minimum_filter(fine, 3) < 0.3
    h = np.where(keep, up_built, np.where(open_ground, calm, fine) - bias)

    rgb = encode(h, meta)
    assert np.abs(h[0] - up_built[0]).max() < 0.01  # self-check of the seam

    near = OUT / "near"
    near.mkdir(exist_ok=True)
    Image.fromarray(rgb).save(near / "height.png", optimize=True)
    img, nimg = xyz(ESRI, ESRI_Z, "esri", IMG_PX)
    q_img = save_jpg(img, near / "color.jpg", 82)
    old, ntiles = xyz(NLS, NLS_Z, "nls", IMG_PX)
    # the outer sheet's finish (thickened ink; no lettering or blank paper by the bridge): scripts/history/fetch_1890s.py
    q_old = save_jpg(Image.fromarray(finish(np.asarray(old), NEAR)), near / "color-1890s.jpg", 82)

    fine_share = round(float(1 - keep.mean()), 3)
    ea22 = "Open Government Licence v3.0. Contains Environment Agency information © Environment Agency copyright and/or database right 2022."
    meta["near"] = {
        "bbox_osgb": list(NEAR),
        "size_px": [shape[1], shape[0]],
        "res_m": RES,
        "color_px": [IMG_PX, IMG_PX],
        "dsm_2012_share": fine_share,
        "dsm_2012_bias_m": round(bias, 3),
        "note": f"Desktop tier only. Height is the EA 2012 0.5 m DSM on {fine_share:.0%} of the tile; where 2012 and the 2022 1 m composite differ by over {CHANGED} m (changed buildings), and on the carved river, banks and bridge cut, it is the 2022 tile resampled.",
    }
    meta.setdefault("files", {}).update({
        "height.png": {"source": meta["source"]["height"], "licence": ea22},
        "bare.png": {"source": meta["source"]["bare"], "licence": ea22},
        "color.jpg": {"source": meta["source"]["color"], "licence": meta["licence"]["color"]},
        "color-1890s.jpg": {
            "source": "National Library of Scotland, OS London Five-foot Town Plan 1893-96, tiles https://mapseries-tilesets.s3.amazonaws.com/london_1890s/ z18 (scripts/history/fetch_1890s.py)",
            "licence": "CC-BY. Reproduced with the permission of the National Library of Scotland, https://maps.nls.uk/copyright.html",
        },
        "near/height.png": {
            "source": f"Environment Agency LIDAR Tiles DSM 2012 0.5 m, tile TQ3380 (flights D0155383, April 2012, and D0154364, Dec 2011), {DSM_URL}; merged with height.png (2022 1 m composite) where changed",
            "licence": "Open Government Licence v3.0. Contains Environment Agency information © Environment Agency copyright and/or database right 2012 and 2022.",
        },
        "near/color.jpg": {
            "source": f"Esri World Imagery, cached tiles {ESRI} at z{ESRI_Z} ({nimg} tiles, 0.19 m), resampled to OSGB {IMG_PX} px over 600 m, JPEG q{q_img}",
            "licence": meta["licence"]["color"],
        },
        "near/color-1890s.jpg": {
            "source": f"National Library of Scotland, OS London Five-foot Town Plan 1893-96, tiles {NLS} at z{NLS_Z} ({ntiles} tiles), resampled to OSGB, JPEG q{q_old}",
            "licence": "CC-BY. Reproduced with the permission of the National Library of Scotland, https://maps.nls.uk/copyright.html",
        },
        "../waternormals.jpg": {"source": "Procedural: 40 summed sine waves (scripts/terrain/build.py)", "licence": "Project's own"},
    })
    meta["files"].update(lite(meta))
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta["near"], indent=1))
    for p in sorted([*near.iterdir(), *(OUT / "lo").iterdir()]):
        print(f"{p.relative_to(OUT)}  {p.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
