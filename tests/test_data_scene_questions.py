"""No-network scene questions checked against the sourced exhibit corpus."""
import json

import pytest

from server.docent import retrieve, validate_answer
from server.graph import load_place


@pytest.fixture(scope="module")
def place():
    return load_place("tower-bridge")


@pytest.mark.parametrize("question, terms, answer", [
    ("Why are there horses on Tower Bridge?", ("horse", "cab"), "Horse-drawn cabs crossed the bridge."),
    ("What was the engine house for?", ("engine house", "pump"), "The engine house contained pumps."),
    ("How did people reach the high walkways, by stairs or lifts?", ("stair", "lift"),
     "Pedestrians climbed stairs to the high walkways."),
    ("What did the hydraulic mains or pipes carry?", ("main", "pipe", "water"),
     "The hydraulic mains carried pressurised water."),
    ("What did river signals tell vessels?", ("signal", "vessel"),
     "Signals told vessels whether the bridge was open or shut."),
    ("Why do traffic gates close?", ("gate", "traffic"),
     "Traffic gates keep road users off the bascules during a lift."),
    ("Which ship is visible in this era?", ("ship", "reconstruction"),
     "The ships are representative reconstructions rather than verified named vessels."),
    ("What did cranes do during Tower Bridge construction?", ("crane", "construction"),
     "Cranes helped assemble the bridge."),
])
def test_scene_question_has_retrieved_sourced_evidence(place, question, terms, answer):
    evidence = retrieve(place, question)
    source_ids = {source["id"] for source in place["sources"]}
    fact = next((item for item in evidence
                 if all(term in json.dumps(item, ensure_ascii=False).casefold() for term in terms)), None)

    assert fact is not None, f"No evidence containing {terms!r} was retrieved for {question!r}"
    assert fact["cite"] and set(fact["cite"]) <= source_ids
    assert not validate_answer(f"{answer} [{fact['cite'][0]}].", [fact])["refused"]
