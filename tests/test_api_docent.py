import json
import asyncio
from types import SimpleNamespace

import pytest

from server.docent import answer_events, refusal, retrieve, validate_answer
from server.main import app


@pytest.fixture
def place():
    return {
        "sources": [{"id": "bridge-guide", "title": "Guide"}],
        "parts": [{"id": "north-tower", "name": "North tower", "summary": "Granite tower.",
                   "sources": ["bridge-guide"], "dims": {"height": {"value": 65, "unit": "m", "status": "text-attested", "source": "bridge-guide"}}}],
        "events": [{"id": "opened", "year": 1894, "title": "Opened", "text": "Bridge opened in 1894.", "sources": ["bridge-guide"]}],
    }


def test_prompt_context_separates_fact_ids_from_citations(place):
    evidence = retrieve(place, "How tall is the north tower?")
    assert evidence[0]["fact_id"] == "north-tower"
    assert evidence[0]["cite"] == ["bridge-guide"]
    assert "fact_id" not in evidence[0] or evidence[0]["fact_id"] != evidence[0]["cite"][0]
    assert "dims" in evidence[0]


def test_valid_source_citation_and_fact_id_is_not_a_citation(place):
    evidence = retrieve(place, "How tall is the north tower?")
    assert not validate_answer("The north tower is 65 m tall [bridge-guide].", evidence)["refused"]
    assert validate_answer("The north tower is 65 m tall [north-tower].", evidence)["refused"]
    assert validate_answer("The north tower is 65 m tall [invented].", evidence)["refused"]
    assert validate_answer("The north tower is 999 m tall [bridge-guide].", evidence)["refused"]
    assert not validate_answer("The north tower is 65 m tall. [bridge-guide]", evidence)["refused"]


def test_retrieves_event_by_year_and_open_word(place):
    by_year = retrieve(place, "What happened in 1894?")
    by_open = retrieve(place, "When did the bridge open?")
    assert any(fact.get("year") == 1894 for fact in by_year)
    assert any(fact.get("year") == 1894 for fact in by_open)


def test_citation_required_for_each_sentence(place):
    evidence = retrieve(place, "north tower height")
    assert validate_answer("It is 65 m tall [bridge-guide]. It is made of gold.", evidence)["refused"]


def test_answer_stream_never_yields_unsupported_number(monkeypatch, place):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    class Stream:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def __aiter__(self): return self.chunks()
        async def chunks(self):
            yield SimpleNamespace(type="response.output_text.delta", delta="The tower is 999 m tall [bridge-guide].")
    class Client:
        def __init__(self, **kwargs): self.responses = self
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def create(self, **kwargs):
            assert "fact_id" in json.loads(kwargs["input"])["evidence"][0]
            return Stream()
    monkeypatch.setattr("server.docent.AsyncOpenAI", Client)
    async def collect():
        return [item async for item in answer_events(place, "tower height")]
    events = asyncio.run(collect())
    assert events == [("done", refusal())]
