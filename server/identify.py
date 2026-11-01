"""Through your own eyes: a photo of the real bridge -> the parts in it and where the photographer stood."""
import base64
import binascii
import asyncio
import json
from functools import cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
# Timed on 2 Commons photos: sol/low ~11 s, both right; terra/low ~5 s but wrong bank on one; sol default ~24 s.
# So both run at once: terra's answer wins if it passes sane(), otherwise we wait for sol.
FAST, SURE = ("gpt-6.1-terra", "low"), ("gpt-6.1-sol", "low")
MAX_BYTES = 6 * 1024 * 1024
MAGIC = {"jpeg": (b"\xff\xd8\xff",), "png": (b"\x89PNG\r\n\x1a\n",), "webp": (b"RIFF",)}

router = APIRouter()


class IdentifyIn(BaseModel):
    image: str  # data URL


@cache
def client():
    return AsyncOpenAI(timeout=60)


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


async def ask(model, effort, prompt, image, known):
    r = await client().responses.create(
        model=model,
        reasoning={"effort": effort},
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": image},
        ]}],
        text={"format": {"type": "json_schema", "name": "identify", "schema": SCHEMA, "strict": True}},
    )
    out = json.loads(r.output_text)
    is_bridge = out["is_bridge"] is True
    return {
        "is_bridge": is_bridge,
        "parts": [
            {"id": p["id"], "box": {k: clamp(p["box"][k]) for k in ("x0", "y0", "x1", "y1")}}
            for p in out["parts"] if is_bridge and p["id"] in known
        ],
        "camera": {k: float(out["camera"][k]) for k in ("x", "y", "z")},
        "where": out["where"],
        "model": model,
    }


def sane(r) -> bool:
    """Does the camera agree with the photo? Catches the fast model's mirrored or in-the-river guesses."""
    if not r["is_bridge"]:
        return False  # a "no" is cheap for the sure model to confirm, and a wrong "no" is the worst answer
    x, _, z = r["camera"].values()
    if abs(z) < 110 and abs(x) > 20:
        return False  # on the open river, not a bank or the bridge
    box = {p["id"]: p["box"] for p in r["parts"]}
    n, s = box.get("north-tower"), box.get("south-tower")
    if n and s:
        cx = lambda b: (b["x0"] + b["x1"]) / 2
        h = lambda b: b["y1"] - b["y0"]
        # looking west from the east side, the south tower is on the left; looking east, the north one is
        if abs(x) > 30 and (cx(s) < cx(n)) != (x > 0):
            return False
        # the nearer tower looks taller
        if abs(z) > 50 and abs(h(s) - h(n)) > 0.15 * max(h(s), h(n)) and (h(s) > h(n)) != (z > 0):
            return False
    return True


@router.post("/api/identify")
async def identify(body: IdentifyIn):
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
    fast, sure = (asyncio.create_task(ask(*m, prompt, body.image, known)) for m in (FAST, SURE))
    try:
        r = await fast
        if sane(r):
            sure.cancel()  # closes sol's connection; OpenAI stops the response, input already sent may still bill
            return r
    except Exception:
        pass
    try:
        return await sure
    except Exception as e:  # the model or the network; the client sees a plain 502
        raise HTTPException(502, f"vision model failed: {type(e).__name__}")
