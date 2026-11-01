"""No-network retrieval checks for the README's Tower Bridge demo facts."""
import json

from server.docent import retrieve, validate_answer
from server.graph import load_place


def test_construction_duration_is_retrieved_as_an_explicit_cited_eight():
    place = load_place("tower-bridge")
    evidence = retrieve(place, "How long did construction take?")
    duration = next(fact for fact in evidence
                    if "8 year" in json.dumps(fact).lower() or fact.get("value") == 8)

    assert "tb-timeline" in duration["cite"]
    assert not validate_answer("Construction took 8 years [tb-timeline].", evidence)["refused"]
    assert validate_answer("Construction took 800 years [tb-timeline].", evidence)["refused"]


def test_opening_date_is_retrieved_from_the_historical_event():
    place = load_place("tower-bridge")
    evidence = retrieve(place, "When did Tower Bridge open?")
    opening = next(fact for fact in evidence if fact.get("year") == 1894 and
                   "open" in f"{fact.get('title', '')} {fact.get('text', '')}".lower())

    assert "tb-timeline" in opening["cite"]
    assert not validate_answer("Tower Bridge opened on 30 June 1894 [tb-timeline].", evidence)["refused"]
    assert validate_answer("Tower Bridge opened on 30 June 1984 [tb-timeline].", evidence)["refused"]


def test_original_hydraulic_pressure_is_retrieved_and_numbers_are_checked():
    place = load_place("tower-bridge")
    evidence = retrieve(place, "What pressure did the original hydraulic machinery use?")
    pressure = next(fact for fact in evidence if "tb-history" in fact["cite"] and
                    "pressure" in json.dumps(fact).lower() and
                    all(number in json.dumps(fact) for number in ("700", "800")))

    assert "700" in json.dumps(pressure) and "800" in json.dumps(pressure)
    assert "tb-history" in pressure["cite"]
    assert not validate_answer(
        "The original accumulators worked at 700–800 pounds per square inch [tb-history].", evidence
    )["refused"]
    assert validate_answer(
        "The original accumulators worked at 700–900 pounds per square inch [tb-history].", evidence
    )["refused"]
