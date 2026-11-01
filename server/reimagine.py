"""See it in <year>: turn a capture of the 3D view into a period photograph with OpenAI image edit."""
import base64
import binascii
import os
import re
from datetime import date

import openai
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

FIRST_YEAR = 1886  # Tower Bridge construction began
MAX_DATA_URL = 6 * 1024 * 1024
DATA_URL = re.compile(r"^data:image/(jpeg|png|webp);base64,(.+)$", re.S)


class ReimagineIn(BaseModel):
    image: str
    year: int


def client():
    return openai.OpenAI(timeout=28, max_retries=0)


def era(year: int) -> str:
    if year < 1915:
        return (
            "a Victorian albumen print, warm sepia, fine grain, soft vignetting and slight silvering at the edges. "
            "On the river: steam tugs with tall black funnels trailing smoke, Thames sailing barges with "
            "rust-red spritsails, lighters and rowing wherries. On the quays and roadway: horse-drawn carts "
            "and hansom cabs, men in bowler hats, top hats and frock coats, women in long skirts and bonnets, "
            "dockers in flat caps. Gas lamps, coal smoke haze."
        )
    if year < 1960:
        return (
            f"a {year} black-and-white press photograph, silver gelatin, deep blacks, gentle film grain. "
            "On the river: coal-fired steam colliers, tugs and lighters, a few motor launches. On the roadway: "
            "London buses and black cars of the period, men in trilbies and long overcoats, women in "
            "knee-length coats and hats. Hazy London air."
        )
    if year < 2000:
        return (
            f"a {year} colour photograph on 35mm film stock, slightly warm, period colour rendering and grain. "
            "Period river traffic, cars, red buses and people dressed in the fashion of that year."
        )
    return (
        "a sharp modern colour photograph from a high-end digital camera, natural light. On the river: "
        "Thames Clippers, tourist cruise boats, RIB speedboats. On the roadway: red double-decker buses, "
        "black cabs, cyclists, tourists in contemporary clothes taking photos."
    )


def prompt(year: int) -> str:
    return (
        f"Turn this 3D render into a real photograph of this exact scene as it looked in {year}. "
        "Keep the exact camera position, angle, lens and framing. Keep every structure exactly where it is, "
        "with the same shape, proportions and layout: the towers, the walkways, the bascules, the "
        "suspension chains and the river banks. Replace the flat 3D materials with real stone, granite, "
        "painted steel and water, with realistic light, reflections and weather. "
        f"Render it as {era(year)} "
        "Add period-correct river traffic, street life and people's dress at a believable scale. "
        "Do not add any landmark, tower, bridge or building that is not in the render; only the low "
        "riverside wharves of that period may show faintly along the distant banks, in the haze. "
        "No text, captions, borders or watermarks."
    )


@router.post("/api/reimagine")
def reimagine(body: ReimagineIn):
    if len(body.image) > MAX_DATA_URL:
        raise HTTPException(413, "That capture is too large (6 MB at most).")
    m = DATA_URL.match(body.image)
    if not m:
        raise HTTPException(422, "Send the view as a JPEG, PNG or WebP data URL.")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "That image could not be read.")
    year = min(max(body.year, FIRST_YEAR), date.today().year)
    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2.5-flare")
    try:
        out = client().images.edit(
            model=model,
            image=(f"view.{m.group(1)}", raw, f"image/{m.group(1)}"),
            prompt=prompt(year),
            quality="high",
            output_format="jpeg",
            timeout=28,
        )
    except openai.APITimeoutError:
        raise HTTPException(504, "The photograph took too long. Try again.")
    except openai.OpenAIError:
        raise HTTPException(502, "The image service could not make a photograph just now. Try again.")
    return {"image": "data:image/jpeg;base64," + out.data[0].b64_json, "year": year, "model": model}
