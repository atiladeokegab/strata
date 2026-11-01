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
