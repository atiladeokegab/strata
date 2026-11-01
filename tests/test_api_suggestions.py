"""The actual question chips and visible selectable parts must have cited answers."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.main import app

QUESTIONS = json.loads((Path(__file__).parents[1] / "web/src/ui/docentQuestions.json").read_text())
TOPICS = {
    "How do the bascules open?": ("hydraulic", "steam", "oil", "counterweight"),
    "Why are there horses on the bridge?": ("horse", "cart", "cab"),
    "How long did it take to build?": ("8", "eight"),
    "What powered it in 1894?": ("steam", "coal", "water"),
    "What were the stairs and lifts for?": ("pedestrian", "walkway", "access"),
    "Why do the traffic gates close?": ("bascule", "raise", "opening", "lift"),
}


def test_question_chips_have_a_small_tested_catalog():
    assert 4 <= len(QUESTIONS) <= 6
    assert len(QUESTIONS) == len(set(QUESTIONS))
    assert all(question in TOPICS for question in QUESTIONS)


@pytest.mark.parametrize("question", QUESTIONS)
def test_suggested_question_gets_relevant_cited_answer_without_provider(question, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(app)
    response = client.post("/api/ask", json={"place": "tower-bridge", "question": question})
    assert response.status_code == 200
    answer = response.json()
    assert answer["refused"] is False, (question, answer)
    assert answer["citations"]
    sources = {source["id"] for source in client.get("/api/places/tower-bridge").json()["sources"]}
    assert set(answer["citations"]) <= sources
    assert any(topic in answer["answer"].lower() for topic in TOPICS[question]), (question, answer)


@pytest.mark.parametrize("part", ["traffic", "ship", "stairs-north", "stairs-south", "lift-north", "lift-south", "works-north", "works-south", "barrier-north", "barrier-south"])
def test_visible_scene_selection_can_be_asked_about(part, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = TestClient(app).post("/api/ask", json={"place": "tower-bridge", "part": part, "question": "Explain this part."})
    assert response.status_code == 200, (part, response.text)
    answer = response.json()
    assert not answer["refused"] and answer["citations"], (part, answer)
