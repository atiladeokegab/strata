from fastapi.testclient import TestClient

from server.main import app


def test_config_serves_tiles_key_from_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_TILES_KEY", "test-key")
    assert TestClient(app).get("/api/config").json() == {"google_tiles_key": "test-key"}
    monkeypatch.delenv("GOOGLE_TILES_KEY")
    assert TestClient(app).get("/api/config").json() == {"google_tiles_key": ""}
