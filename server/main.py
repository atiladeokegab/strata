"""Strata API: place data, the docent, and the built web app."""
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from httpx import HTTPError
from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.middleware.gzip import GZipMiddleware

from . import docent
from .graph import get_place
from .search import semantic_search, warm_search

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


@asynccontextmanager
async def lifespan(app):
    client = AsyncOpenAI(timeout=15, max_retries=0) if os.getenv("OPENAI_API_KEY") else None
    app.state.openai = client
    try:
        data = await run_in_threadpool(place, "tower-bridge")
        await warm_search(data, client=client)
        if client is not None:
            try:
                # Pay the first inference cost before accepting a visitor's question.
                await client.responses.create(
                    model=os.getenv("OPENAI_DOCENT_MODEL", docent.DEFAULT_MODEL),
                    input="Reply ready.", max_output_tokens=16, store=False, timeout=8,
                )
            except (OpenAIError, HTTPError, TimeoutError):
                pass
        yield
    finally:
        if client is not None:
            await client.close()
        app.state.openai = None


app = FastAPI(title="Strata", lifespan=lifespan)
from server.voice import router as voice_router; app.include_router(voice_router)  # noqa: E402
from server.reimagine import router as reimagine_router; app.include_router(reimagine_router)  # noqa: E402
from server.identify import router as identify_router; app.include_router(identify_router)  # noqa: E402
from server.config import router as config_router; app.include_router(config_router)  # noqa: E402


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
    client = getattr(request.app.state, "openai", None)
    if body.part and not any(part["id"] == body.part for part in data["parts"]):
        raise HTTPException(404, "no such part")
    if stream or "text/event-stream" in request.headers.get("accept", ""):
        async def events():
            async for event, payload in docent.answer_events(data, body.question, body.part, client=client):
                yield f"event: {event}\ndata: {json.dumps(payload)}\n\n"
        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    return await docent.ask(data, body.question, body.part, client=client)


@app.get("/api/search")
async def find(request: Request, q: Annotated[str, Query(min_length=1, max_length=200)], place_id: str = "tower-bridge"):
    data = await run_in_threadpool(place, place_id)
    return await semantic_search(data, q, client=getattr(request.app.state, "openai", None))


class WebFiles(StaticFiles):
    """Vite build: hashed /assets/* never change; index.html must always revalidate."""

    def file_response(self, full_path, stat_result, scope, status_code=200):
        response = super().file_response(full_path, stat_result, scope, status_code)
        if scope["path"].startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif str(full_path).endswith(".html"):
            response.headers["Cache-Control"] = "no-cache"
        return response


def web_app(directory):
    # Gzip only the static site (not the API's SSE or audio); jpg/png are already compressed.
    return GZipMiddleware(WebFiles(directory=directory, html=True), minimum_size=1000,
                          exclude_content_types=("image/jpeg", "image/png", "text/event-stream"))


dist = ROOT / "web" / "dist"
if dist.exists():
    app.mount("/", web_app(dist), name="web")
