"""Runtime browser config: the Google Map Tiles key (a referrer-restricted browser key, safe to hand to the page)."""
import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/config")
def config():
    return {"google_tiles_key": os.environ.get("GOOGLE_TILES_KEY", "")}
