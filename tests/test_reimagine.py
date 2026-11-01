import base64
from types import SimpleNamespace

from fastapi.testclient import TestClient

import server.reimagine as r
from server.main import app

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG fake").decode()


class FakeImages:
    def __init__(self, fail=None):
        self.fail, self.calls = fail, []

    def edit(self, **kw):
        self.calls.append(kw)
        if self.fail:
            raise self.fail
        return SimpleNamespace(data=[SimpleNamespace(b64_json="QUJD")])


def fake(monkeypatch, images):
    monkeypatch.setattr(r, "client", lambda: SimpleNamespace(images=images))


def test_reimagine_calls_image_edit_and_clamps_year(monkeypatch):
    images = FakeImages()
    fake(monkeypatch, images)
    res = TestClient(app).post("/api/reimagine", json={"image": PNG, "year": 1700})
    assert res.status_code == 200
    assert res.json() == {"image": "data:image/jpeg;base64,QUJD", "year": 1886, "model": "gpt-image-2.5-flare"}
    kw = images.calls[0]
    assert kw["quality"] == "high" and kw["output_format"] == "jpeg" and kw["timeout"] == 28
    assert kw["image"][1] == b"\x89PNG fake" and "sepia" in kw["prompt"]
    assert "black-and-white" in r.prompt(1944) and "modern colour" in r.prompt(9999)


def test_reimagine_rejects_bad_images(monkeypatch):
    fake(monkeypatch, FakeImages())
    c = TestClient(app)
    assert c.post("/api/reimagine", json={"image": "data:image/gif;base64,AAAA", "year": 1900}).status_code == 422
    assert c.post("/api/reimagine", json={"image": "data:image/png;base64,@@@", "year": 1900}).status_code == 422
    big = "data:image/png;base64," + "A" * (6 * 1024 * 1024)
    assert c.post("/api/reimagine", json={"image": big, "year": 1900}).status_code == 413


def test_reimagine_service_error_is_plain(monkeypatch):
    import openai
    fake(monkeypatch, FakeImages(fail=openai.OpenAIError("boom")))
    res = TestClient(app).post("/api/reimagine", json={"image": PNG, "year": 1944})
    assert res.status_code == 502 and "Try again" in res.json()["detail"]
