import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server import docent
from server.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("SURREAL_URL", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-present-but-must-not-be-used")

    def provider_must_not_start(**_):
        raise AssertionError("a sourced horse fact must bypass the model")

    monkeypatch.setattr(docent, "AsyncOpenAI", provider_must_not_start)
    return TestClient(app)


@pytest.fixture
def horse_fact():
    place = json.loads((Path(__file__).parents[1] / "data/places/tower-bridge.json").read_text())
    return next(fact for fact in place["facts"] if fact["id"] == "horse-drawn-traffic")


def cited_text(fact):
    return f'{fact["text"]} [{fact["source"]}]'


@pytest.mark.parametrize("question", [
    "Why are there horses?",
    "Why horses here?",
    "Why the horse-drawn traffic?",
    "Why are there horses on Tower Bridge?",
    "Why are there horses in this scene?",
])
def test_horse_questions_return_exact_sourced_fact_without_model(client, horse_fact, question):
    response = client.post("/api/ask", json={"question": question})
    assert response.status_code == 200
    assert response.json() == {
        "answer": cited_text(horse_fact),
        "citations": ["tb-timeline"],
        "refused": False,
    }


@pytest.mark.parametrize("part", ["north-tower", "traffic"])
def test_selected_part_does_not_hide_horse_fact(client, horse_fact, part):
    response = client.post("/api/ask", json={
        "question": "Why are there horses on the bridge?",
        "part": part,
    })
    assert response.status_code == 200
    assert response.json()["answer"] == cited_text(horse_fact)
    assert response.json()["citations"] == ["tb-timeline"]


def test_unknown_traffic_part_stays_a_404(client):
    assert client.post("/api/ask", json={
        "question": "Why are there horses?", "part": "ghost-traffic",
    }).status_code == 404


@pytest.mark.parametrize("question", [
    "Why are there horses on Mars?",
    "why are there horses on mars?",
    "Why are there horses with blue wings?",
    "How many horses cross now?",
    "When did horses stop?",
    "Were there 8000 horses?",
    "Why are there horses on the bridge in 2026?",
])
def test_unsupported_horse_questions_refuse_without_model(client, question):
    response = client.post("/api/ask", json={"question": question})
    assert response.status_code == 200
    assert response.json()["refused"] is True
    assert response.json()["citations"] == []


@pytest.mark.parametrize("question", [
    "Why are there horses on Mars?",
    "why are there horses on mars?",
    "Why are there horses with blue wings?",
    "How many horses cross now?",
    "When did horses stop?",
    "Were there 8000 horses?",
    "Why are there horses on the bridge in 2026?",
])
def test_unsupported_horse_sse_refuses_without_delta_or_model(client, question):
    response = client.post("/api/ask", json={"question": question},
                           headers={"Accept": "text/event-stream"})
    assert response.status_code == 200
    frames = [frame for frame in response.text.strip().split("\n\n") if frame]
    assert all(frame.startswith("event: done\n") for frame in frames)
    assert len(frames) == 1
    result = json.loads(frames[0].split("\ndata: ", 1)[1])
    assert result["refused"] is True and result["citations"] == []


def test_horse_fact_sse_matches_json_and_streams_only_its_numbers(client, horse_fact):
    response = client.post("/api/ask", json={"question": "Why are there horses?"},
                           headers={"Accept": "text/event-stream"})
    assert response.status_code == 200
    result = None
    deltas = []
    for frame in response.text.strip().split("\n\n"):
        event, payload = frame.split("\ndata: ", 1)
        data = json.loads(payload)
        if event == "event: delta":
            deltas.append(data["text"])
        elif event == "event: done":
            result = data
    assert result == {"answer": cited_text(horse_fact), "citations": ["tb-timeline"], "refused": False}
    streamed = "".join(deltas)
    assert streamed == cited_text(horse_fact)
    assert streamed.removesuffix(" [tb-timeline]") == horse_fact["text"]
    assert "[tb-timeline]" in streamed
    supported_numbers = set(re.findall(r"\d[\d,.]*", horse_fact["text"]))
    assert supported_numbers and set(re.findall(r"\d[\d,.]*", streamed)) == supported_numbers
