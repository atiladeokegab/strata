"""Through your own eyes: a photo of the real bridge -> the parts in it and where the photographer stood."""
import base64
import binascii
import json
from functools import cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
# Timed on 2 Commons photos: sol/low ~11 s, both right; terra/low ~5 s but wrong bank on one; sol default ~24 s.
MODEL, EFFORT = "gpt-6.1-sol", "low"
MAX_BYTES = 6 * 1024 * 1024
MAGIC = {"jpeg": (b"\xff\xd8\xff",), "png": (b"\x89PNG\r\n\x1a\n",), "webp": (b"RIFF",)}

router = APIRouter()


class IdentifyIn(BaseModel):
    image: str  # data URL


@cache
def client():
    return OpenAI(timeout=60)


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["is_bridge", "parts", "where", "camera"],
    "properties": {
        "is_bridge": {"type": "boolean", "description": "true only if the photo shows the real Tower Bridge in London"},
        "parts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "box"],
                "properties": {
                    "id": {"type": "string"},
                    "box": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["x0", "y0", "x1", "y1"],
                        "description": "normalized 0..1, origin top-left of the photo",
                        "properties": {k: {"type": "number"} for k in ("x0", "y0", "x1", "y1")},
                    },
                },
            },
        },
        "where": {"type": "string", "description": "roughly where the photographer stood, in plain words"},
        "camera": {
            "type": "object",
            "additionalProperties": False,
            "required": ["x", "y", "z"],
            "properties": {k: {"type": "number"} for k in ("x", "y", "z")},
        },
    },
}

FRAME = """Scene frame, in metres: origin at the centre of the Tower Bridge road deck, x east, y up, z south.
The bridge runs north-south across the Thames, which flows west to east here. The north bank (z < 0) has the
Tower of London to the north-west and St Katharine Docks to the north-east. The south bank (z > 0) has City Hall
and More London to the south-west and Shad Thames / Butler's Wharf to the south-east. The two towers rise about
55 m above the deck, centred at z = -45.5 (north) and z = +45.5 (south); the 61 m opening between them holds the
two bascules; the side spans reach the banks at about z = -140 and z = +140. Upstream (west)
is London Bridge; downstream (east) is the Pool of London towards Wapping. River level is about 9 m below the deck."""


def decode(data_url: str) -> bytes:
    head, _, b64 = data_url.partition(",")
    kind = head.removeprefix("data:image/").removesuffix(";base64")
    if not head.startswith("data:image/") or not head.endswith(";base64") or kind not in MAGIC:
        raise HTTPException(415, "send a jpeg, png or webp data URL")
    if len(b64) > MAX_BYTES * 4 // 3 + 4:
        raise HTTPException(413, "image over 6 MB")
    try:
        raw = base64.b64decode(b64, validate=True)
    except binascii.Error:
        raise HTTPException(400, "bad base64")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "image over 6 MB")
    if not raw.startswith(MAGIC[kind]) or (kind == "webp" and raw[8:12] != b"WEBP"):
        raise HTTPException(415, f"not a {kind} image")
    return raw


def clamp(v: float) -> float:
    return min(1.0, max(0.0, float(v)))


@router.post("/api/identify")
def identify(body: IdentifyIn):
    decode(body.image)
    place = json.loads((ROOT / "data" / "places" / "tower-bridge.json").read_text())
    known = {p["id"] for p in place["parts"]}
    parts = "\n".join(f"- {p['id']}: {p['name']}. {p['summary']}" for p in place["parts"])
    prompt = f"""Is this a photo of the real Tower Bridge in London? If not, set is_bridge false, parts empty,
camera 0,0,0 and say in `where` what the photo shows instead.
If it is, list each of these parts that is visible in the photo, by id, with a tight normalized box:
{parts}
Then estimate where the photographer stood: `where` in plain words (bank, side, rough distance, height if raised),
and `camera` as a position in this frame:
{FRAME}"""
    try:
        r = client().responses.create(
            model=MODEL,
            reasoning={"effort": EFFORT},
            input=[{"role": "user", "content": [
                {"type": "input_text", "text": prompt},
                {"type": "input_image", "image_url": body.image},
            ]}],
            text={"format": {"type": "json_schema", "name": "identify", "schema": SCHEMA, "strict": True}},
        )
        out = json.loads(r.output_text)
    except Exception as e:  # the model or the network; the client sees a plain 502
        raise HTTPException(502, f"vision model failed: {type(e).__name__}")
    is_bridge = out["is_bridge"] is True
    return {
        "is_bridge": is_bridge,
        "parts": [
            {"id": p["id"], "box": {k: clamp(p["box"][k]) for k in ("x0", "y0", "x1", "y1")}}
            for p in out["parts"] if is_bridge and p["id"] in known
        ],
        "camera": {k: float(out["camera"][k]) for k in ("x", "y", "z")},
        "where": out["where"],
    }
