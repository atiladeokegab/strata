import asyncio
from types import SimpleNamespace

from server import search as module


def place():
    return {"id": "test", "parts": [
        {"id": "tower", "name": "North tower", "summary": "Tall stone tower", "sources": ["a"]},
        {"id": "leaf", "name": "Bascule leaf", "summary": "Counterweighted opening roadway", "sources": ["b"]}],
        "events": [{"year": 1894, "title": "Opened", "text": "Bridge opened to traffic", "sources": ["a"]}],
        "sources": [{"id": "a", "title": "Tower facts", "url": "https://example.test/a"},
                    {"id": "b", "title": "Bascule facts", "url": "https://example.test/b"}]}


def test_keyword_search_keeps_response_shape_and_handles_opened():
    results = module.search(place(), "when did it open?")
    assert results[0] == {"kind": "event", "id": "1894", "title": "1894 · Opened", "snippet": "Bridge opened to traffic"}
    assert set(results[0]) == {"kind", "id", "title", "snippet"}


def test_semantic_search_uses_startup_cache(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    monkeypatch.setattr(module, "_cache", {})

    async def fake_embed(texts):
        return [[1.0, 0.0] if "tower" in text.lower() or "height" in text.lower() else [0.0, 1.0] for text in texts]

    monkeypatch.setattr(module, "_embed", fake_embed)
    data = place()
    asyncio.run(module.warm_search(data))
    result = asyncio.run(module.semantic_search(data, "height of the spire"))
    assert result[0]["id"] == "tower"
    assert module.EMBEDDING_MODEL == "text-embedding-3-small"


def test_warmup_without_key_and_failed_embedding_fall_back(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(module, "_cache", {})
    asyncio.run(module.warm_search(place()))
    assert asyncio.run(module.semantic_search(place(), "north tower"))[0]["id"] == "tower"

    monkeypatch.setenv("OPENAI_API_KEY", "fake")

    async def fail(_):
        raise ConnectionError("offline")

    monkeypatch.setattr(module, "_embed", fail)
    asyncio.run(module.warm_search(place()))
    assert asyncio.run(module.semantic_search(place(), "north tower"))[0]["id"] == "tower"


def test_cached_embedding_failure_uses_keyword_fallback(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    monkeypatch.setattr(module, "_cache", {})

    async def embed(texts):
        if len(texts) == 1:
            raise TimeoutError()
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(module, "_embed", embed)
    data = place()
    asyncio.run(module.warm_search(data))
    result = asyncio.run(module.semantic_search(data, "north tower"))
    assert result[0]["id"] == "tower"
