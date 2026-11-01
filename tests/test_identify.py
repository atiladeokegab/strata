import base64
import json
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server import identify

JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 100).decode()


def app_with(monkeypatch, reply, calls=None):
    class Responses:
        def create(self, **kw):
            if calls is not None:
                calls.append(kw)
            return SimpleNamespace(output_text=json.dumps(reply))

    monkeypatch.setattr(identify, "client", lambda: SimpleNamespace(responses=Responses()))
    app = FastAPI()
    app.include_router(identify.router)
    return TestClient(app)


def test_identify_keeps_known_parts_and_clamps(monkeypatch):
    calls = []
    c = app_with(monkeypatch, {
        "is_bridge": True,
        "parts": [{"id": "north-tower", "box": {"x0": -0.1, "y0": 0.2, "x1": 0.5, "y1": 1.4}},
                  {"id": "made-up", "box": {"x0": 0, "y0": 0, "x1": 1, "y1": 1}}],
        "camera": {"x": 140, "y": -5, "z": 180},
        "where": "south bank, east side, about 200 m away",
    }, calls)
    r = c.post("/api/identify", json={"image": JPEG}).json()
    assert r["is_bridge"] is True
    assert r["parts"] == [{"id": "north-tower", "box": {"x0": 0.0, "y0": 0.2, "x1": 0.5, "y1": 1.0}}]
    assert r["camera"] == {"x": 140.0, "y": -5.0, "z": 180.0} and "south bank" in r["where"]
    prompt = calls[0]["input"][0]["content"][0]["text"]
    assert "bascule-north" in prompt and "z south" in prompt
    assert calls[0]["text"]["format"]["strict"] is True


def test_not_a_bridge_has_no_parts(monkeypatch):
    c = app_with(monkeypatch, {"is_bridge": False, "parts": [{"id": "north-tower", "box": {"x0": 0, "y0": 0, "x1": 1, "y1": 1}}],
                  "camera": {"x": 0, "y": 0, "z": 0}, "where": "a cat"})
    r = c.post("/api/identify", json={"image": JPEG}).json()
    assert r["is_bridge"] is False and r["parts"] == []


def test_rejects_bad_images(monkeypatch):
    c = app_with(monkeypatch, {})
    post = lambda img: c.post("/api/identify", json={"image": img}).status_code
    assert post("data:image/gif;base64,R0lGODlh") == 415
    assert post("data:image/png;base64," + base64.b64encode(b"\xff\xd8\xff").decode()) == 415  # jpeg bytes, png label
    assert post("data:image/jpeg;base64,!!!") == 400
    assert post("https://example.com/a.jpg") == 415
    big = base64.b64encode(b"\xff\xd8\xff" + b"0" * (6 * 1024 * 1024)).decode()
    assert post("data:image/jpeg;base64," + big) == 413


def test_fast_answer_falls_back_to_sure_when_insane(monkeypatch):
    replies = {
        "gpt-6.1-terra": {"is_bridge": True, "parts": [], "camera": {"x": 200, "y": -5, "z": -100}, "where": "on the river"},
        "gpt-6.1-sol": {"is_bridge": True, "parts": [], "camera": {"x": -200, "y": -5, "z": 160}, "where": "More London"},
    }

    class Responses:
        def create(self, **kw):
            return SimpleNamespace(output_text=json.dumps(replies[kw["model"]]))

    monkeypatch.setattr(identify, "client", lambda: SimpleNamespace(responses=Responses()))
    r = identify.identify(identify.IdentifyIn(image=JPEG))
    assert r["model"] == "gpt-6.1-sol" and r["where"] == "More London"


def test_sane_catches_mirrored_and_river_cameras():
    def r(cam, n=None, s=None):
        parts = [{"id": i, "box": dict(zip(("x0", "y0", "x1", "y1"), b))} for i, b in (("north-tower", n), ("south-tower", s)) if b]
        return {"is_bridge": True, "parts": parts, "camera": dict(zip("xyz", cam))}
    # the Diliff night shot from More London: north tower left and smaller
    n, s = (0.31, 0.18, 0.43, 0.74), (0.65, 0.03, 0.78, 0.73)
    assert identify.sane(r((-200, -5, 160), n, s))
    assert not identify.sane(r((200, -6, 150), n, s))  # wrong side: east
    assert not identify.sane(r((-200, -5, -160), n, s))  # wrong bank: the north tower would look taller
    assert not identify.sane(r((200, -5, -100)))  # in the river
    assert identify.sane(r((5, 2, 150)))  # on the southern approach
    assert not identify.sane({"is_bridge": False, "parts": [], "camera": {"x": 0, "y": 0, "z": 0}})
