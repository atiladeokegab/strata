"""Strata API: place data, the docent, and the built web app."""
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from . import docent
from .graph import get_place
from .search import semantic_search, warm_search

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


@asynccontextmanager
async def lifespan(app):
    await warm_search(place("tower-bridge"))
    yield


app = FastAPI(title="Strata", lifespan=lifespan)
from server.voice import router as voice_router; app.include_router(voice_router)  # noqa: E402
from server.reimagine import router as reimagine_router; app.include_router(reimagine_router)  # noqa: E402
from server.identify import router as identify_router; app.include_router(identify_router)  # noqa: E402


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/places/{place_id}")
def place(place_id: str):
    result = get_place(place_id)
    if result is None:
        raise HTTPException(404, "no such place")
    return result


class AskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    place: str = Field(default="tower-bridge", pattern=r"^[a-z0-9-]{1,80}$")
    part: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,80}$")
    question: str = Field(min_length=1, max_length=1200)


@app.post("/api/ask")
async def ask(body: AskRequest, request: Request, stream: bool = False):
    data = await run_in_threadpool(place, body.place)
    if body.part and not any(part["id"] == body.part for part in data["parts"]):
        raise HTTPException(404, "no such part")
    if stream or "text/event-stream" in request.headers.get("accept", ""):
        async def events():
            async for event, payload in docent.answer_events(data, body.question, body.part):
                yield f"event: {event}\ndata: {json.dumps(payload)}\n\n"
        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    return await docent.ask(data, body.question, body.part)


@app.get("/api/search")
async def find(q: Annotated[str, Query(min_length=1, max_length=200)], place_id: str = "tower-bridge"):
    data = await run_in_threadpool(place, place_id)
    return await semantic_search(data, q)


dist = ROOT / "web" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
