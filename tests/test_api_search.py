import asyncio
from types import SimpleNamespace

from server import search as module


def place():
    return {"id": "test", "parts": [
        {"id": "tower", "name": "North tower", "summary": "Tall stone tower", "sources": ["a"]},
        {"id": "leaf", "name": "Bascule leaf", "summary": "Counterweighted opening roadway", "sources": ["b"]},
        {"id": "engine-house", "name": "Engine house", "summary": "Steam-powered hydraulic machinery raised the bridge.", "sources": ["b"]}],
        "events": [{"year": 1894, "title": "Opened", "text": "Bridge opened to traffic", "sources": ["a"]},
                   {"year": 1893, "title": "Horse-drawn traffic", "text": "Horse-drawn carriages crossed the bridge.", "sources": ["a"]}],
        "sources": [{"id": "a", "title": "Tower facts", "url": "https://example.test/a"},
                    {"id": "b", "title": "Bascule facts", "url": "https://example.test/b"}]}


def test_keyword_search_keeps_response_shape_and_handles_opened():
    results = module.search(place(), "when did it open?")
    assert results[0] == {"kind": "event", "id": "1894", "title": "1894 · Opened", "snippet": "Bridge opened to traffic"}
    assert set(results[0]) == {"kind", "id", "title", "snippet"}


def test_keyword_search_splits_hyphens_and_matches_powered():
    data = place()
    horses = module.search(data, "where did horses cross?")
    assert any(item["kind"] == "event" and item["title"].endswith("Horse-drawn traffic") for item in horses)
    powered = module.search(data, "what powered the bridge?")
    assert any(item["kind"] == "part" and item["id"] == "engine-house" for item in powered)
    tower = module.search(data, "north towers")
    assert tower[0]["kind"] == "part" and tower[0]["id"] == "tower"


def test_semantic_search_uses_startup_cache(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    monkeypatch.setattr(module, "_cache", {})

    async def fake_embed(texts, client=None):
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

    async def fail(_, client=None):
        raise ConnectionError("offline")

    monkeypatch.setattr(module, "_embed", fail)
    asyncio.run(module.warm_search(place()))
    assert asyncio.run(module.semantic_search(place(), "north tower"))[0]["id"] == "tower"


def test_cached_embedding_failure_uses_keyword_fallback(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    monkeypatch.setattr(module, "_cache", {})

    async def embed(texts, client=None):
        if len(texts) == 1:
            raise TimeoutError()
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(module, "_embed", embed)
    data = place()
    asyncio.run(module.warm_search(data))
    result = asyncio.run(module.semantic_search(data, "north tower"))
    assert result[0]["id"] == "tower"


def test_supplied_client_is_reused_and_not_closed(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    monkeypatch.setattr(module, "_cache", {})
    calls = []

    class Client:
        closed = False

        class embeddings:
            @staticmethod
            async def create(*, model, input, timeout):
                assert timeout == 8
                calls.append((model, input))
                return SimpleNamespace(data=[SimpleNamespace(index=i, embedding=[1.0, 0.0]) for i, _ in enumerate(input)])

        async def close(self):
            self.closed = True

    async def run():
        client = Client()
        data = place()
        await module.warm_search(data, client=client)
        await module.semantic_search(data, "north tower", client=client)
        assert not client.closed

    asyncio.run(run())
    assert len(calls) == 2
    assert len(calls[0][1]) == 5
    assert calls[1][1] == ["north tower"]
