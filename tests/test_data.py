import copy
import json
from pathlib import Path
import re

import pytest

from scripts.validate import assert_valid, validate
from server import graph

PLACE_PATH = Path(__file__).resolve().parents[1] / "data/places/tower-bridge.json"


@pytest.fixture
def place():
    return json.loads(PLACE_PATH.read_text())


def test_exhibit_has_sourced_yearly_stages_and_engineering_primary_source(place):
    assert validate(place) == []
    assert {event["year"]: event["stage"] for event in place["events"] if 1886 <= event["year"] <= 1894} == {
        year: year - 1886 for year in range(1886, 1895)
    }
    assert any(source["kind"].startswith("primary") for source in place["sources"])
    assert all(event["sources"] for event in place["events"])


def test_every_inferred_dimension_explains_its_method(place):
    inferred = [dim for part in place["parts"] for dim in part["dims"].values()
                if dim["status"] == "inferred"]
    assert inferred
    assert all(dim.get("method") for dim in inferred)


@pytest.mark.parametrize("mutate, expected", [
    (lambda p: p["parts"][0]["dims"].update(height=42), "dimension needs"),
    (lambda p: p["parts"][0]["dims"][next(iter(p["parts"][0]["dims"]))].pop("source"), "dimension needs"),
    (lambda p: p["parts"][0]["dims"][next(iter(p["parts"][0]["dims"]))].update(source="missing"), "unknown source"),
    (lambda p: p["parts"][0]["dims"][next(iter(p["parts"][0]["dims"]))].update(value=float("nan")), "finite"),
    (lambda p: p["parts"][0]["dims"][next(iter(p["parts"][0]["dims"]))].update(status="guess"), "invalid status"),
    (lambda p: p["sources"][0].update(url="javascript:alert(1)"), "HTTP(S)"),
    (lambda p: p["sources"].append(copy.deepcopy(p["sources"][0])), "duplicate source id"),
])
def test_poison_facts_fail_validation(place, mutate, expected):
    mutate(place)
    assert any(expected in error for error in validate(place))


def test_missing_part_source_fails(place):
    place["parts"][0]["sources"] = []
    assert any("missing sources" in error for error in validate(place))


def test_inferred_dimensions_need_a_method(place):
    for part in place["parts"]:
        for dim in part["dims"].values():
            if dim["status"] == "inferred":
                dim.pop("method", None)
                assert any("inferred dimension needs method" in e for e in validate(place))
                return
    pytest.fail("fixture should contain at least one inferred dimension")


def test_local_loader_rejects_traversal_and_returns_missing_for_unknown(monkeypatch):
    monkeypatch.delenv("SURREAL_URL", raising=False)
    assert graph.get_place("../etc/passwd") is None
    assert graph.get_place("no-such-place") is None


def test_surreal_read_falls_back_to_validated_file(place, monkeypatch):
    monkeypatch.setenv("SURREAL_URL", "http://surreal.invalid")
    monkeypatch.setattr(graph, "_query", lambda *_: (_ for _ in ()).throw(RuntimeError("offline")))
    assert graph.get_place(place["id"]) == place


def test_surreal_read_rejects_poisoned_stored_payload(place, monkeypatch):
    monkeypatch.setenv("SURREAL_URL", "http://surreal.invalid")
    poisoned = copy.deepcopy(place)
    poisoned["parts"][0]["dims"][next(iter(poisoned["parts"][0]["dims"]))].pop("source")
    monkeypatch.setattr(graph, "_query", lambda *_: [{"status": "OK", "result": [{"payload": poisoned}]}])
    assert graph.get_place(place["id"]) == place


def test_seed_uses_parameterized_idempotent_scoped_graph(place, monkeypatch):
    calls = []
    monkeypatch.setattr(graph, "_query", lambda sql, variables: calls.append((sql, variables)))
    graph.seed_place(place)
    graph.seed_place(place)
    assert len(calls) == 2
    for sql, variables in calls:
        assert sql.startswith("BEGIN TRANSACTION;") and sql.endswith("COMMIT TRANSACTION;")
        assert "DELETE has_part WHERE exhibit = $slug" in sql
        assert "->cites->" in sql and "->has_event->" in sql
        assert "Tower Bridge" not in sql
        assert variables["place"] == place


def test_seed_rejects_invalid_facts_before_writing(place, monkeypatch):
    writes = []
    monkeypatch.setattr(graph, "_query", lambda *args: writes.append(args))
    place["parts"][0]["dims"][next(iter(place["parts"][0]["dims"]))].pop("source")
    with pytest.raises(ValueError, match="dimension needs"):
        graph.seed_place(place)
    assert writes == []


def test_sql_transport_preserves_json_values_and_filters_let_results(monkeypatch):
    monkeypatch.setenv("SURREAL_URL", "http://surreal.test/")
    value = 'Timeline: “Opening” 😀; quote="; slash=\\; injection=\'; DELETE place; '
    captured = {}

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return ([{"status": "OK", "result": None}] +
                    [{"status": "OK", "result": [{"payload": value}]}])

    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return Response()

    monkeypatch.setattr(graph.httpx, "post", post)
    results = graph._query("SELECT $source;", {"source": value})

    assert results == [{"status": "OK", "result": [{"payload": value}]}]
    assert captured["url"] == "http://surreal.test/sql"
    assert captured["headers"]["Content-Type"] == "text/plain"
    let_line, query = captured["content"].split("\n", 1)
    match = re.fullmatch(r"LET \$source = (.*);", let_line)
    assert match and json.loads(match.group(1)) == value
    assert query == "SELECT $source;"


def test_sql_transport_round_trips_whole_place_payload_and_surfaces_query_error(place, monkeypatch):
    monkeypatch.setenv("SURREAL_URL", "http://surreal.test")
    response_rows = []
    query_status = ["OK"]

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return ([{"status": "OK", "result": None}] +
                    [{"status": query_status[0], "result": response_rows}])

    monkeypatch.setattr(graph.httpx, "post", lambda *_args, **_kwargs: Response())
    response_rows.append({"payload": place})
    assert graph.get_place(place["id"]) == place

    response_rows.clear()
    query_status[0] = "ERR"
    with pytest.raises(RuntimeError, match="statement failed"):
        graph._query("SELECT payload FROM place;", {})
