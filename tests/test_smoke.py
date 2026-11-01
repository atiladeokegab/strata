from fastapi.testclient import TestClient

from server.main import app


def test_health_and_place():
    c = TestClient(app)
    assert c.get("/api/health").json() == {"ok": True}
    p = c.get("/api/places/tower-bridge").json()
    assert p["id"] == "tower-bridge" and p["parts"] and p["sources"]
    assert c.get("/api/places/nope").status_code == 404
