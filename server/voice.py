"""Talk to the docent: mints an ephemeral OpenAI Realtime secret. The API key never leaves the server."""
import json
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("STRATA_REALTIME_MODEL", "gpt-realtime-2.1")
VOICE = "marin"
router = APIRouter()

RULES = """You are the docent for {name}, speaking aloud to a visitor exploring a 3D model of it.
Rules, which you never break:
- Answer only from the CORPUS below. If the corpus does not cover the question, say you do not have a source for that.
- Never state a number (a year, size, angle, count, date) that is not in the corpus. If asked for one, say the corpus has no figure for it.
- Cite the source by its title when you state a fact, briefly, for example "according to Tower Bridge, Wikipedia".
- Keep every answer to two or three short sentences. Calm, warm, plain English.
- When you talk about a specific part, call select_part with its id so the visitor sees it highlighted.
CORPUS (JSON):
{corpus}"""

TOOLS = [{
    "type": "function",
    "name": "select_part",
    "description": "Highlight a part of the structure in the 3D view.",
    "parameters": {
        "type": "object",
        "properties": {"id": {"type": "string", "description": "A part id from the corpus."}},
        "required": ["id"],
    },
}]


def instructions(place_id: str = "tower-bridge") -> str:
    # Read on every request so corpus edits reach the next session.
    place = json.loads((ROOT / "data" / "places" / f"{place_id}.json").read_text())
    corpus = {k: place[k] for k in ("name", "parts", "events", "sources")}
    return RULES.format(name=place["name"], corpus=json.dumps(corpus, separators=(",", ":")))


@router.post("/api/voice/session")
def voice_session():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "voice is not configured")
    text = instructions()
    session = {
        "type": "realtime",
        "model": MODEL,
        "instructions": text,
        "tools": TOOLS,
        "audio": {
            "input": {"transcription": {"model": "gpt-4o-mini-transcribe"}},
            "output": {"voice": VOICE},
        },
    }
    try:
        r = httpx.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers={"Authorization": f"Bearer {key}"},
            json={"expires_after": {"anchor": "created_at", "seconds": 600}, "session": session},
            timeout=15,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"could not start a voice session: {type(e).__name__}")
    data = r.json()
    # Only the short-lived secret goes to the browser; it also needs the rules to rebuild them on session.update.
    return {"value": data["value"], "expires_at": data["expires_at"], "model": MODEL, "instructions": text}
