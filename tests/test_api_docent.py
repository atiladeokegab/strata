import json
import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from server.docent import answer_events, ask, refusal, retrieve, validate_answer
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


def test_real_corpus_specific_questions_retrieve_the_1894_event():
    data_path = Path(__file__).parents[1] / "data/places/tower-bridge.json"
    data = json.loads(data_path.read_text())
    expected = next(event["title"] for event in data["events"] if event["year"] == 1894)
    for question in ("When did Tower Bridge open?", "What happened during construction in 1894?", "What happened during construction in1894?"):
        evidence = retrieve(data, question)
        assert 0 < len(evidence) <= 4
        assert any(fact.get("title") == expected and fact.get("year") == 1894 for fact in evidence), (question, [fact.get("fact_id") for fact in evidence])


def test_citation_required_for_each_sentence(place):
    evidence = retrieve(place, "north tower height")
    assert validate_answer("It is 65 m tall [bridge-guide]. It is made of gold.", evidence)["refused"]


def test_missing_key_returns_extractive_cited_fallback(monkeypatch, place):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    async def collect():
        return [event async for event in answer_events(place, "How is the north tower built?")]
    events = asyncio.run(collect())
    assert events[-1][0] == "done" and not events[-1][1]["refused"]
    assert events[-1][1]["citations"] == ["bridge-guide"]
    assert events[-1][1]["answer"] == "Granite tower [bridge-guide]."
    assert not validate_answer(events[-1][1]["answer"], retrieve(place, "How is the north tower built?"))["refused"]


def test_fallback_cites_each_extracted_sentence(monkeypatch, place):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    place["parts"][0]["summary"] = "Granite tower. It rises from the north river pier."
    async def collect():
        return [event async for event in answer_events(place, "How is the north tower built?")]
    result = asyncio.run(collect())[-1][1]
    assert result["answer"].count("[bridge-guide]") == 2
    assert not result["refused"]


@pytest.mark.parametrize("failure", ["refuse", "error"])
def test_model_refusal_or_error_uses_relevant_fallback(monkeypatch, place, failure):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    class Stream:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def __aiter__(self): return self.events()
        async def events(self):
            if failure == "refuse":
                yield SimpleNamespace(type="response.output_text.delta", delta="REFUSE")
    class Client:
        def __init__(self, **kwargs): self.responses = self
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def create(self, **kwargs):
            if failure == "error":
                raise TimeoutError()
            return Stream()
    monkeypatch.setattr("server.docent.AsyncOpenAI", Client)
    async def collect():
        return [event async for event in answer_events(place, "How is the north tower built?")]
    events = asyncio.run(collect())
    assert not events[-1][1]["refused"]
    assert events[-1][1]["answer"] == "Granite tower [bridge-guide]."


def test_fallback_chooses_power_fact_over_year_only_event(monkeypatch, place):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    place["events"].append({"year": 1894, "title": "Tower Bridge opened", "text": "The bridge opened on 30 June.", "sources": ["bridge-guide"]})
    place["facts"] = [{"id": "power-source", "title": "Power source", "text": "Steam-powered hydraulic machinery lifts the bascules.", "source": "bridge-guide", "status": "text-attested"}]
    async def collect():
        return [event async for event in answer_events(place, "How was the bridge powered?")]
    result = asyncio.run(collect())[-1][1]
    assert "Steam-powered hydraulic machinery" in result["answer"]
    assert "1894" not in result["answer"]


def test_fabricated_citation_still_refuses_without_fallback(monkeypatch, place):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    class Stream:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def __aiter__(self): return self.events()
        async def events(self):
            yield SimpleNamespace(type="response.output_text.delta", delta="Granite tower [invented-source].")
    class Client:
        def __init__(self, **kwargs): self.responses = self
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def create(self, **kwargs): return Stream()
    monkeypatch.setattr("server.docent.AsyncOpenAI", Client)
    async def collect():
        return [event async for event in answer_events(place, "How is the north tower built?")]
    result = asyncio.run(collect())[-1][1]
    assert result["refused"] and result["citations"] == []


def test_construction_duration_beats_generic_history(place):
    place["name"] = "Tower Bridge"
    place["events"].extend({"year": year, "title": "Construction", "text": "Tower Bridge construction continued.", "sources": ["bridge-guide"]} for year in range(1886, 1894))
    place["facts"] = [{"id": "duration", "title": "Construction time", "text": "Tower Bridge took eight years to build.", "value": 8, "unit": "years", "source": "bridge-guide", "status": "text-attested"}]
    for question in ("How long did construction take?", "How long did it take to build Tower Bridge?"):
        evidence = retrieve(place, question)
        assert any(fact["fact_id"] == "duration" for fact in evidence)
        assert not validate_answer("Construction took 8 years [bridge-guide].", evidence)["refused"]
        assert validate_answer("Construction took 800 years [bridge-guide].", evidence)["refused"]


def test_unicode_pressure_range_does_not_corrupt_supported_numbers(place):
    place["facts"] = [{"id": "pressure", "title": "Hydraulic pressure", "text": "The accumulators worked at 700–800 pounds per square inch.", "source": "bridge-guide", "status": "text-attested"}]
    evidence = retrieve(place, "What hydraulic pressure did they use?")
    assert not validate_answer("They worked at 700–800 psi [bridge-guide].", evidence)["refused"]
    assert not validate_answer("They worked at 700-800 psi [bridge-guide].", evidence)["refused"]
    assert validate_answer("They worked at 700–900 psi [bridge-guide].", evidence)["refused"]
    assert validate_answer("They worked at 700–2013800 psi [bridge-guide].", evidence)["refused"]
    assert validate_answer("They worked at -700 psi [bridge-guide].", evidence)["refused"]


def test_unrelated_when_question_does_not_retrieve_arbitrary_events(place):
    assert retrieve(place, "When did zzzzquasar happen?") == []


def test_place_name_filter_keeps_the_requested_part_topic(place):
    place["name"] = "Tower Bridge"
    evidence = retrieve(place, "Which towers make up Tower Bridge?")
    assert any(fact["fact_id"] == "north-tower" for fact in evidence)


def test_verified_height_survives_rich_pipe_context(place, monkeypatch):
    from server.docent import ask
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    place["facts"] = [
        {"id": f"pipe-{i}", "title": "North tower hydraulic mains height",
         "text": "The north tower pipes travel high into the tower, supplying the north tower machinery.",
         "source": "bridge-guide", "status": "text-attested"}
        for i in range(6)
    ]
    evidence = retrieve(place, "How tall is the north tower?")
    assert len(evidence) <= 4 and evidence[0]["fact_id"] == "north-tower"
    result = asyncio.run(ask(place, "How tall is the north tower?"))
    assert not result["refused"] and "65" in result["answer"]
    assert result["citations"] == ["bridge-guide"]


def test_access_question_is_not_a_lift_time_measurement(place, monkeypatch):
    from server.docent import ask
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    place["parts"].append({"id": "engine-room", "name": "Engine room", "summary": "The engine room powers the lifts.", "sources": ["bridge-guide"], "dims": {"lift_time": {"value": 60, "unit": "s", "status": "text-attested", "source": "bridge-guide"}}})
    place["facts"] = [{"id": "access", "text": "Stairs and lifts carried pedestrians to the walkways.", "source": "bridge-guide", "status": "text-attested"}]
    result = asyncio.run(ask(place, "What were the stairs and lifts for?"))
    assert not result["refused"] and "pedestrians" in result["answer"]


def test_high_walkway_purpose_is_distinct_from_height(place, monkeypatch):
    from server.docent import ask
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    place["parts"] = [{"id": "walkway", "name": "High walkways", "summary": "The high walkways carry pedestrians above the road.", "sources": ["bridge-guide"], "dims": {"height": {"value": 42, "unit": "m", "status": "text-attested", "source": "bridge-guide"}}}]
    purpose = asyncio.run(ask(place, "What were the high walkways for?"))
    assert "pedestrians" in purpose["answer"] and "42" not in purpose["answer"]
    height = asyncio.run(ask(place, "How high are the walkways?"))
    assert "42" in height["answer"] and height["citations"]


def test_how_question_prefers_operation_over_opening_width(place, monkeypatch):
    from server.docent import ask
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    place["facts"] = [
        {"id": "width", "text": "The bascule opening is 200 feet wide.", "source": "bridge-guide", "status": "text-attested"},
        {"id": "operation", "text": "Steam powers hydraulic engines that pivot the bascules open.", "source": "bridge-guide", "status": "text-attested"},
    ]
    result = asyncio.run(ask(place, "How do the bascules open?"))
    assert not result["refused"] and "hydraulic" in result["answer"]


@pytest.fixture
def sourced_graph():
    return {
        "sources": [{"id": "guide", "title": "Guide"}, {"id": "archive", "title": "Archive"}],
        "parts": [], "events": [],
        "people": [{"name": "Horace Jones", "role": "architect", "sources": ["guide"]}],
        "related_places": [{"name": "Tower of London", "relationship": "nearby historic landmark", "sources": ["archive"]}],
        "facts": [
            {"id": "tower-materials", "text": "North tower materials: granite and steel.", "source": "guide", "status": "text-attested"},
            {"id": "unverified-span", "text": "The span is 400 metres.", "source": "guide", "status": "inferred", "value": 400},
        ],
    }


def test_retrieves_person_role_with_source_citation(sourced_graph):
    evidence = retrieve(sourced_graph, "Who designed the bridge?")
    architect = next(fact for fact in evidence if fact.get("name") == "Horace Jones")
    assert architect["role"] == "architect" and architect["cite"] == ["guide"]
    assert not validate_answer("Horace Jones was the architect [guide].", [architect])["refused"]


def test_retrieves_single_source_material_fact(sourced_graph):
    sourced_graph["parts"] = [
        {"id": f"north-tower-{i}", "name": "North tower", "summary": "A tower on the north side.", "sources": ["guide"]}
        for i in range(5)
    ]
    evidence = retrieve(sourced_graph, "What materials are used in the north tower?")
    materials = next(fact for fact in evidence if fact.get("fact_id") == "tower-materials")
    assert materials["cite"] == ["guide"]
    assert not validate_answer("The record lists granite and steel [guide].", [materials])["refused"]
    selected = retrieve(sourced_graph, "What materials are used in the north tower?", "north-tower-0")
    assert selected[0]["fact_id"] == "north-tower-0"
    assert any(fact["fact_id"] == "tower-materials" for fact in selected)


def test_inferred_fact_is_excluded(sourced_graph):
    evidence = retrieve(sourced_graph, "What is the inferred span length?")
    assert all(fact.get("fact_id") != "unverified-span" for fact in evidence)


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


def test_supplied_client_is_reused_and_not_closed(monkeypatch, place):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    answer = "The north tower is 65 m tall [bridge-guide]."

    class Stream:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def __aiter__(self): return self.events()
        async def events(self):
            yield SimpleNamespace(type="response.output_text.delta", delta=answer)

    class Client:
        def __init__(self):
            self.closed = False
            self.responses = self
        async def create(self, **kwargs):
            assert kwargs["model"] == "gpt-5.4-nano"
            return Stream()
        async def __aexit__(self, *args):
            self.closed = True
        async def close(self):
            self.closed = True

    client = Client()
    monkeypatch.setattr("server.docent.AsyncOpenAI", lambda **kwargs: pytest.fail("unexpected client construction"))
    result = asyncio.run(ask(place, "tower height", client=client))
    assert result["answer"] == answer and not result["refused"]
    assert not client.closed


def test_stream_accepts_period_split_across_deltas(monkeypatch, place):
    monkeypatch.setenv("OPENAI_API_KEY", "fake")
    chunks = ["The bridge opened in 1894 [bridge-guide]", ".", " ", "Hydraulic tests followed [bridge-guide]", "."]

    class Stream:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def __aiter__(self): return self.events()
        async def events(self):
            for chunk in chunks:
                yield SimpleNamespace(type="response.output_text.delta", delta=chunk)
    class Client:
        def __init__(self, **kwargs): self.responses = self
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def create(self, **kwargs): return Stream()
    monkeypatch.setattr("server.docent.AsyncOpenAI", Client)
    async def collect():
        return [item async for item in answer_events(place, "When did it open?")]
    events = asyncio.run(collect())
    assert events[-1][1]["answer"] == "The bridge opened in 1894 [bridge-guide]. Hydraulic tests followed [bridge-guide]."
    assert not events[-1][1]["refused"]
