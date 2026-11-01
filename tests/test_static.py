from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.main import web_app


def test_static_compression_and_cache(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>" + "x" * 2000 + "</html>")
    (tmp_path / "assets" / "index-abc123.js").write_text("let a = 1;\n" * 500)
    (tmp_path / "color.jpg").write_bytes(b"\xff\xd8" + b"j" * 5000)
    app = FastAPI()
    app.mount("/", web_app(tmp_path))
    c = TestClient(app)
    gz = {"Accept-Encoding": "gzip"}

    r = c.get("/", headers=gz)
    assert r.headers["content-encoding"] == "gzip" and r.headers["cache-control"] == "no-cache"

    r = c.get("/assets/index-abc123.js", headers=gz)
    assert r.headers["content-encoding"] == "gzip"
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert r.text == "let a = 1;\n" * 500

    r = c.get("/assets/index-abc123.js", headers={**gz, "If-None-Match": r.headers["etag"]})
    assert r.status_code == 304 and "immutable" in r.headers["cache-control"]

    r = c.get("/color.jpg", headers=gz)
    assert "content-encoding" not in r.headers and "cache-control" not in r.headers
