import asyncio
import json
from pathlib import Path

import pytest

from server.docent import answer_events, refusal


def place():
    return json.loads((Path(__file__).parents[1] / "data/places/tower-bridge.json").read_text())


def collect(data, question, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    async def run():
        return [event async for event in answer_events(data, question)]
    return asyncio.run(run())


def test_horse_traffic_uses_only_the_verified_fact(monkeypatch):
    data = place()
    fact = next(fact for fact in data["facts"] if fact["id"] == "horse-drawn-traffic")
    monkeypatch.setattr("server.docent.AsyncOpenAI", lambda **kwargs: pytest.fail("horse fast path called the model"))
    events = collect(data, "Why are there horses?", monkeypatch)
    answer = events[-1][1]
    text = fact["text"].strip()
    expected = text if text.endswith((".", "!", "?")) else f"{text}."
    assert answer == {"answer": f"{expected} [{fact['source']}]", "citations": [fact["source"]], "refused": False}
    assert events[0] == ("delta", {"text": answer["answer"]})


@pytest.mark.parametrize("question", ["Why horses here?", "Why are there horses on Tower Bridge?", "Why are there horses in this scene?"])
def test_supported_scene_why_questions_use_same_fact(monkeypatch, question):
    data = place()
    fact = next(fact for fact in data["facts"] if fact["id"] == "horse-drawn-traffic")
    assert collect(data, question, monkeypatch)[-1][1]["citations"] == [fact["source"]]


@pytest.mark.parametrize("question", [
    "Were there 8,000 horses?", "How many horse-drawn vehicles?", "When did horse-drawn traffic stop?",
    "Why are there horses on Mars?", "What happened to horse-drawn traffic in 1894?",
])
def test_unsupported_horse_intents_refuse_without_streaming(monkeypatch, question):
    events = collect(place(), question, monkeypatch)
    assert events == [("done", refusal())]


def test_missing_or_unverified_horse_fact_refuses(monkeypatch):
    data = place()
    data["facts"] = [fact for fact in data["facts"] if fact["id"] != "horse-drawn-traffic"]
    assert collect(data, "Why are there horses?", monkeypatch)[-1][1] == refusal()

    data = place()
    next(fact for fact in data["facts"] if fact["id"] == "horse-drawn-traffic")["status"] = "inferred"
    assert collect(data, "Why are there horses?", monkeypatch)[-1][1] == refusal()


def test_unregistered_horse_fact_source_refuses(monkeypatch):
    data = place()
    next(fact for fact in data["facts"] if fact["id"] == "horse-drawn-traffic")["source"] = "unregistered-source"
    assert collect(data, "How many horse-drawn vehicles?", monkeypatch)[-1][1] == refusal()


@pytest.mark.parametrize("mutation", [
    lambda fact: fact.update(status="measured"),
    lambda fact: fact.update(source="unregistered-source"),
    lambda fact: fact.update(source="tb-inside"),
    lambda fact: fact.update(source_excerpt="  "),
    lambda fact: fact.update(source_excerpt="Tower Bridge opened in 1894."),
    lambda fact: fact.update(locator="wrong section"),
    lambda fact: fact.update(locator={"section": "29 July 1894"}),
    lambda fact: fact.update(text=8000),
    lambda fact: fact.update(text="In July 1894, 13,000 horse-drawn vehicles crossed each day."),
    lambda fact: fact.update(text=fact["text"].replace("horse-drawn vehicles", "horses")),
])
def test_horse_fact_requires_attested_primary_located_evidence(monkeypatch, mutation):
    data = place()
    mutation(next(fact for fact in data["facts"] if fact["id"] == "horse-drawn-traffic"))
    assert collect(data, "Why are there horses?", monkeypatch)[-1][1] == refusal()


def test_horse_source_requires_exact_official_url(monkeypatch):
    data = place()
    source = next(source for source in data["sources"] if source["id"] == "tb-timeline")
    source["url"] = "https://example.test/forged"
    assert collect(data, "Why are there horses?", monkeypatch)[-1][1] == refusal()


def test_horsepower_does_not_enter_horse_fact_path(monkeypatch):
    data = place()
    events = collect(data, "How much horsepower did the engine make?", monkeypatch)
    assert events[-1][1] == refusal()
    assert events[0][0] == "done"
