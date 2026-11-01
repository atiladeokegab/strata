"""Date the city around Tower Bridge, so 1950-2011 shows only what had been built (Google's tiles take over in 2012).

uv run --with pyproj --with shapely python scripts/history/modern_dates.py  ->  web/public/buildings/tower-bridge-dates.json

OSM rarely carries start_date here (about 1 building in 25). Many of the large modern buildings carry a wikidata tag
instead, and Wikidata records when each opened or was built. For every building way or relation in the tile with a
wikidata tag: the year of the date of official opening (P1619), else the service entry (P729), else the inception
(P571). Status: inferred from Wikidata (crowd-sourced; each id is in the output so it can be checked).
A Wikidata year fills only a building OSM leaves undated (or bake.py's 1950 guess for tall ones), and only from 1950:
an earlier one often dates the institution, not the walls (All Hallows-by-the-Tower was gutted in 1940 and rebuilt).
The Tower of London (wiki-tower-of-london): every building inside its walls (OSM way 370870741) stood by 1894. "The
White Tower ... was built by William the Conqueror in 1078"; the latest named build is the Waterloo Barracks, "begun
in 1845", and "between 1845 and 1885" the post-medieval structures left vacant were demolished. The ravens'
enclosure is left undated.
HMS Belfast (wiki-hms-belfast): moored in the Pool of London after the trust took her in July 1971 (Wikidata gives her launch).
Output: {"source": ..., "dates": {"w123": {"s": 2002, "q": "Q123", "p": "P1619"} | {"s": 1971, "src": "wiki-hms-belfast"}}}
"""
import json
from pathlib import Path
import urllib.parse
import urllib.request

from pyproj import Transformer
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
BUILDINGS = ROOT / "web/public/buildings/tower-bridge.json"
OUT = ROOT / "web/public/buildings/tower-bridge-dates.json"
UA = {"User-Agent": "strata-hackathon (github.com/atiladeokegab/strata)"}
OVERPASS = ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter")
PROPS = ("P1619", "P729", "P571")  # opening, service entry, inception: first one present wins
MODERN, GUESS = 1950, 1950  # Wikidata years count from 1950; bake.py's start for an undated building over 40 m
CASTLE, WHITE_TOWER = 370870741, "w369135772"
OVERRIDES = {"w5006061": {"s": 1971, "src": "wiki-hms-belfast"}}


def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def year_of(claims):
    for p in PROPS:
        for c in claims.get(p, []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            t = v.get("time") if isinstance(v, dict) else None
            if t and v.get("precision", 0) >= 9:  # a year or finer
                return int(t[1:5]), p
    return None, None


def overpass(q):
    for api in OVERPASS:  # the public instances are often busy
        try:
            return fetch(api, urllib.parse.urlencode({"data": q}).encode())
        except OSError as err:
            print(f"{api}: {err}")
    raise SystemExit("no Overpass instance answered")


def main():
    data = json.loads(BUILDINGS.read_text())
    (oE, oN), buildings = data["frame"]["origin_osgb"], data["buildings"]
    xs = [v for b in buildings for v in b["o"][0::2]]
    zs = [v for b in buildings for v in b["o"][1::2]]
    to_wgs = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
    (w, s), (e, n) = to_wgs.transform(oE + min(xs), oN - max(zs)), to_wgs.transform(oE + max(xs), oN - min(zs))
    osm = overpass(f'[out:json][timeout:90];(way["building"]["wikidata"]({s},{w},{n},{e});relation["building"]["wikidata"]({s},{w},{n},{e}););out tags;')
    tagged = {("w" if el["type"] == "way" else "r") + str(el["id"]): el["tags"]["wikidata"] for el in osm["elements"]}
    qids = sorted(set(tagged.values()))
    entities = {}
    for i in range(0, len(qids), 50):
        r = fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" + "|".join(qids[i:i + 50]))
        entities.update(r.get("entities", {}))
    undated = {b["id"].split("-")[0] for b in buildings if b["s"] is None or (b["s"] == GUESS and b["t"] - b["b"] > 40)}
    dates = {}
    for oid, qid in sorted(tagged.items()):
        y, p = year_of(entities.get(qid, {}).get("claims", {}))
        if y and y >= MODERN and oid in undated:
            dates[oid] = {"s": y, "q": qid, "p": p}

    to_osgb = Transformer.from_crs("EPSG:4326", "EPSG:27700", always_xy=True)
    ring = overpass(f"[out:json][timeout:60];way({CASTLE});out geom;")["elements"][0]["geometry"]
    walls = Polygon([(E - oE, oN - N) for E, N in (to_osgb.transform(p["lon"], p["lat"]) for p in ring)])
    assert 30000 < walls.area < 50000, f"Tower of London outline is {walls.area:.0f} m2"
    for b in buildings:
        oid = b["id"].split("-")[0]
        if b.get("n") != "Ravens Enclosure" and walls.contains(Polygon(list(zip(b["o"][0::2], b["o"][1::2]))).representative_point()):
            dates[oid] = {"s": b["s"] if b["s"] is not None else (1078 if oid == WHITE_TOWER else 1845), "src": "wiki-tower-of-london"}
    dates.update(OVERRIDES)
    assert dates[WHITE_TOWER]["s"] == 1078 and all(d["s"] <= 1894 for d in dates.values() if "src" in d and d["src"] == "wiki-tower-of-london")
    OUT.write_text(json.dumps({
        "source": "OSM wikidata tags (ODbL) -> Wikidata (CC0): opening P1619, else service entry P729, else inception P571; "
                  "src: a place source (see scripts/history/modern_dates.py)",
        "status": "inferred",
        "dates": dates,
    }, separators=(",", ":")))
    print(f"{len(tagged)} tagged buildings, {len(dates)} dated -> {OUT}")


if __name__ == "__main__":
    main()
