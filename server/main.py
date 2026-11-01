"""Strata API: place data, the docent, and the built web app."""
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="Strata")
from server.voice import router as voice_router; app.include_router(voice_router)  # noqa: E402

from server.reimagine import router as reimagine_router  # noqa: E402
app.include_router(reimagine_router)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/places/{place_id}")
def place(place_id: str):
    path = ROOT / "data" / "places" / f"{place_id}.json"
    if not place_id.replace("-", "").isalnum() or not path.exists():
        raise HTTPException(404, "no such place")
    return json.loads(path.read_text())


dist = ROOT / "web" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
