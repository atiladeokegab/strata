import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from server import docent
from server.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.parametrize("warmup_fails", [False, True])
def test_startup_warms_search_cache(monkeypatch, warmup_fails):
    from server import main
    warmed = []
    owned = SimpleNamespace(closed=False, responses=SimpleNamespace(create=AsyncMock()))
    if warmup_fails:
        owned.responses.create.side_effect = main.OpenAIError("warmup unavailable")
    async def close():
        owned.closed = True
    owned.close = close
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(main, "AsyncOpenAI", lambda **kwargs: owned)
    async def warm(place, client=None):
        warmed.append((place["id"], client))
    monkeypatch.setattr(main, "warm_search", warm)
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"ok": True}
        assert app.state.openai is owned and not owned.closed
    assert warmed == [("tower-bridge", owned)]
    assert owned.closed and app.state.openai is None
    assert owned.responses.create.call_args.kwargs["input"] == "Reply ready."
    assert owned.responses.create.call_args.kwargs["max_output_tokens"] == 16


def test_routes_reuse_lifespan_provider_client(monkeypatch):
    from server import main
    used = []
    owned = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock()))
    async def close():
        pass
    owned.close = close
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(main, "AsyncOpenAI", lambda **kwargs: owned)
    async def warm(place, client=None):
        used.append(("warm", client))
    async def search(place, question, client=None):
        used.append(("search", client))
        return []
    async def answer(place, question, part_id=None, client=None):
        used.append(("ask", client))
        return {"answer": "No source.", "citations": [], "refused": True}
    monkeypatch.setattr(main, "warm_search", warm)
    monkeypatch.setattr(main, "semantic_search", search)
    monkeypatch.setattr(main.docent, "ask", answer)
    with TestClient(app) as client:
        assert client.get("/api/search?q=tower").status_code == 200
        assert client.post("/api/ask", json={"question": "height?"}).json()["refused"]
    assert used == [("warm", owned), ("search", owned), ("ask", owned)]


def test_search_parts_events_sources(client):
    parts = client.get("/api/search", params={"q": "tower"}).json()
    assert any(item["kind"] == "part" and item["id"] == "north-tower" for item in parts)
    events = client.get("/api/search", params={"q": "1894"}).json()
    assert any(item["kind"] == "event" for item in events)
    sources = client.get("/api/search", params={"q": "Tower Bridge"}).json()
    assert any(item["kind"] == "source" for item in sources)
    assert client.get("/api/search", params={"q": "zzzzquasar"}).json() == []
    assert client.get("/api/search", params={"q": "x", "place_id": "missing"}).status_code == 404


def test_api_validation(client):
    assert client.post("/api/ask", json={"question": "   "}).status_code == 422
    assert client.post("/api/ask", json={"question": "x" * 1201}).status_code == 422
    assert client.post("/api/ask", json={"question": "height?", "place": "../.env"}).status_code == 422
    assert client.post("/api/ask", json={"question": "height?", "part": "missing"}).status_code == 404
    assert client.get("/api/search", params={"q": "x" * 201}).status_code == 422


@pytest.fixture
def fake_model(monkeypatch):
    state = {"text": "", "kwargs": None, "calls": 0}
    class Stream:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        def __aiter__(self):
            return self.chunks()
        async def chunks(self):
            for i in range(0, len(state["text"]), 3):
                yield SimpleNamespace(type="response.output_text.delta", delta=state["text"][i:i + 3])
    class Client:
        def __init__(self, **kwargs):
            self.responses = self
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def create(self, **kwargs):
            state["calls"] += 1
            state["kwargs"] = kwargs
            return Stream()
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(docent, "AsyncOpenAI", Client)
    return state


def sourced_answer(client):
    part = client.get("/api/places/tower-bridge").json()["parts"][0]
    dimension = part["dims"]["height"]
    return f'The tower is {dimension["value"]} {dimension["unit"]} tall [{dimension["source"]}].'


def test_cited_json_answer_and_model_setting(client, fake_model, monkeypatch):
    monkeypatch.setenv("OPENAI_DOCENT_MODEL", "chosen-fast-model")
    fake_model["text"] = sourced_answer(client)
    result = client.post("/api/ask", json={"question": "How tall is the north tower?", "part": "north-tower"}).json()
    assert result["refused"] is False and result["citations"]
    assert result["answer"] == fake_model["text"]
    assert fake_model["kwargs"]["model"] == "chosen-fast-model"
    assert len(json.loads(fake_model["kwargs"]["input"])["evidence"]) <= 4


@pytest.mark.parametrize("text", [
    "The tower is 999999 m tall [wiki-tb].",
    "The tower is tall [invented-source].",
    "The tower is tall.",
])
def test_refuses_uncited_or_invented_answers(client, fake_model, text):
    fake_model["text"] = text
    result = client.post("/api/ask", json={"question": "How tall is the north tower?"}).json()
    assert result["refused"] is True and result["citations"] == []


@pytest.mark.parametrize("number", ["999999 m", "999999m", "65e9 m"])
def test_unsupported_number_with_valid_source(client, fake_model, number):
    source = client.get("/api/places/tower-bridge").json()["sources"][0]["id"]
    fake_model["text"] = f'The tower is {number} tall [{source}].'
    assert client.post("/api/ask", json={"question": "How tall is the tower?"}).json()["refused"]


def test_model_refusal_uses_relevant_verified_dimension(client, fake_model):
    fake_model["text"] = "REFUSE"
    result = client.post("/api/ask", json={"question": "How tall is the north tower?"}).json()
    assert not result["refused"] and result["citations"]
    assert "65" in result["answer"]


def test_unrelated_question_never_calls_model(client, fake_model):
    result = client.post("/api/ask", json={"question": "zzzzquasar"}).json()
    assert result["refused"] and fake_model["calls"] == 0


def test_stream_emits_validated_text_and_final_citations(client, fake_model):
    fake_model["text"] = sourced_answer(client)
    response = client.post("/api/ask", json={"question": "How tall is the north tower?"}, headers={"Accept": "text/event-stream"})
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = response.text.strip().split("\n\n")
    assert frames[0].startswith("event: delta\n")
    assert frames[-1].startswith("event: done\n")
    result = json.loads(frames[-1].split("data: ", 1)[1])
    assert result["answer"] == fake_model["text"] and not result["refused"]


def test_unsupported_claim_is_not_streamed(client, fake_model):
    source = client.get("/api/places/tower-bridge").json()["sources"][0]["id"]
    fake_model["text"] = f'The tower is 999999 m tall [{source}].'
    response = client.post("/api/ask?stream=true", json={"question": "How tall is the tower?"})
    assert "event: delta" not in response.text
    assert '"refused": true' in response.text


def test_uncited_trailing_claim_refused(client, fake_model):
    fake_model["text"] = sourced_answer(client) + " It is made of chocolate."
    result = client.post("/api/ask", json={"question": "How tall is the tower?"}).json()
    assert result["refused"]
