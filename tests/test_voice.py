import httpx
from fastapi.testclient import TestClient

from server import voice
from server.main import app


def test_voice_session_mints_ephemeral_secret_without_leaking_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret-test")
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return httpx.Response(200, json={"value": "ek_test", "expires_at": 123},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(voice.httpx, "post", fake_post)
    r = TestClient(app).post("/api/voice/session")
    assert r.status_code == 200
    body = r.json()
    assert body["value"] == "ek_test" and "sk-secret-test" not in r.text
    assert sent["url"].endswith("/v1/realtime/client_secrets")
    assert sent["headers"]["Authorization"] == "Bearer sk-secret-test"
    s = sent["json"]["session"]
    assert s["type"] == "realtime" and s["tools"][0]["name"] == "select_part"
    # The corpus is embedded, with its source title and the refusal rule.
    assert "Tower Bridge, Wikipedia" in s["instructions"] and "north-tower" in s["instructions"]
    assert "Never state a number" in s["instructions"]


def test_voice_session_upstream_failure_is_502(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-x")

    def boom(url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(voice.httpx, "post", boom)
    assert TestClient(app).post("/api/voice/session").status_code == 502


def test_voice_session_without_key_is_503(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert TestClient(app).post("/api/voice/session").status_code == 503
