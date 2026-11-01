"""Regenerate the Reimagine cache (web/public/reimagine) after the scene changes.

Run the API (uv run --env-file .env uvicorn server.main:app --port 8097) and the web app (cd web && npx vite --port 5198), then:
  uv run --with playwright python scripts/reimagine_cache.py web/public/reimagine http://127.0.0.1:5198 http://127.0.0.1:8097 [hero-1894,aerial-2026]
Look at every image; rerun with the keys of any that add buildings that were not there.
"""
import base64, json, sys, time
from concurrent.futures import ThreadPoolExecutor
import httpx
from playwright.sync_api import sync_playwright

OUT, APP, API = sys.argv[1], sys.argv[2], sys.argv[3]
only = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None  # e.g. aerial-1894 to regenerate one
VIEWS = ["hero", "south-bank", "aerial"]
YEARS = [(1894, "1894"), (1944, "1944"), (2026, "Today")]
caps = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.set_default_timeout(900000)  # software WebGL on a busy box can take minutes a frame burst
    pg.route("**/api/**", lambda r: r.fulfill(response=r.fetch(url=r.request.url.replace(APP, API), timeout=120000)))
    pg.goto(APP + "/")
    pg.click(".home-enter", timeout=900000)  # past the museum landing, without starting the tour
    pg.wait_for_function("window.strataReimagine && document.querySelector('canvas')", timeout=900000)
    pg.wait_for_timeout(15000)  # terrain and textures
    for y, _ in YEARS:
        pg.evaluate(f"window.strataReimagine.setYear({y})")
        for v in VIEWS:
            pg.evaluate(f"window.strataReimagine.goto('{v}')")
            pg.wait_for_timeout(2500)
            assert pg.evaluate("window.strataReimagine.nearView()") == v, v
            c = pg.evaluate("window.strataReimagine.capture()")
            caps[(v, y)] = c
            print("captured", v, y, flush=True)
            open(f"{OUT}/{v}-{y}-3d.jpg", "wb").write(base64.b64decode(c["image"].split(",", 1)[1]))
    b.close()

def gen(key):
    v, y = key
    if only and f"{v}-{y}" not in only:
        return key, "skip"
    t = time.time()
    r = httpx.post(API + "/api/reimagine", json={"image": caps[key]["image"], "year": y}, timeout=120)
    if r.status_code != 200:
        return key, f"HTTP {r.status_code} {r.text[:200]}"
    open(f"{OUT}/{v}-{y}.jpg", "wb").write(base64.b64decode(r.json()["image"].split(",", 1)[1]))
    return key, f"ok {time.time() - t:.0f}s"

with ThreadPoolExecutor(5) as ex:
    for k, msg in ex.map(gen, caps):
        print(k, msg, flush=True)
items = [{"view": v, "year": y, "label": label, "file": f"{v}-{y}.jpg", "before": f"{v}-{y}-3d.jpg", "aspect": round(caps[(v, y)]["aspect"], 4)}
         for v in VIEWS for y, label in YEARS]
json.dump({"model": "gpt-image-2.5-flare", "items": items}, open(f"{OUT}/manifest.json", "w"), indent=1)
