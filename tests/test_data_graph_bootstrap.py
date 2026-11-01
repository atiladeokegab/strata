import os
import uuid

import pytest

from server import graph


def test_setup_database_bootstraps_namespace_and_database_from_main(monkeypatch):
    monkeypatch.setenv("SURREAL_URL", "http://surreal.test/")
    monkeypatch.setenv("SURREAL_NS", "fresh-space")
    monkeypatch.setenv("SURREAL_DB", "fresh-db")
    captured = {}

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"status": "OK"}] * 4

    monkeypatch.setattr(graph.httpx, "post", lambda url, **kw: captured.update(url=url, **kw) or Response())
    graph.setup_database()

    assert captured["url"] == "http://surreal.test/sql"
    assert captured["headers"]["Surreal-NS"] == "main"
    assert captured["headers"]["Surreal-DB"] == "main"
    assert captured["content"] == (
        "DEFINE NAMESPACE IF NOT EXISTS `fresh-space`; "
        "USE NS `fresh-space`; USE DB `fresh-db`; "
        "DEFINE DATABASE IF NOT EXISTS `fresh-db`;"
    )


@pytest.mark.parametrize("name", ["bad; DELETE place", "x' OR true", "../strata", "", "a" * 65])
@pytest.mark.parametrize("key", ["SURREAL_NS", "SURREAL_DB"])
def test_setup_database_rejects_sql_identifiers_before_network(monkeypatch, key, name):
    monkeypatch.setenv("SURREAL_URL", "http://surreal.test")
    monkeypatch.setenv(key, name)
    calls = []
    monkeypatch.setattr(graph.httpx, "post", lambda *args, **kwargs: calls.append((args, kwargs)))

    with pytest.raises(ValueError, match="simple identifiers"):
        graph.setup_database()
    assert calls == []


@pytest.mark.skipif(not os.getenv("STRATA_TEST_SURREAL_URL"),
                    reason="set STRATA_TEST_SURREAL_URL to a disposable SurrealDB admin endpoint")
def test_setup_database_against_fresh_surreal_instance(monkeypatch):
    monkeypatch.setenv("SURREAL_URL", os.environ["STRATA_TEST_SURREAL_URL"])
    if os.getenv("STRATA_TEST_SURREAL_USER"):
        monkeypatch.setenv("SURREAL_USER", os.environ["STRATA_TEST_SURREAL_USER"])
        monkeypatch.setenv("SURREAL_PASS", os.getenv("STRATA_TEST_SURREAL_PASS", ""))
    else:
        monkeypatch.delenv("SURREAL_USER", raising=False)
        monkeypatch.delenv("SURREAL_PASS", raising=False)

    # Verify default settings and valid hyphenated identifiers on a fresh server.
    monkeypatch.delenv("SURREAL_NS", raising=False)
    monkeypatch.delenv("SURREAL_DB", raising=False)
    graph.setup_database()
    place = graph.load_place("tower-bridge")
    graph.seed_place(place)
    graph.seed_place(place)
    assert graph.get_place("tower-bridge") == place
    assert graph._query("SELECT count() AS n FROM part WHERE exhibit = $slug GROUP ALL;",
                        {"slug": place["id"]})[0]["result"] == [{"n": len(place["parts"])}]

    database = f"test-{uuid.uuid4().hex[:12]}"
    monkeypatch.setenv("SURREAL_NS", database)
    monkeypatch.setenv("SURREAL_DB", database)
    graph.setup_database()
    graph.seed_place(place)
    assert graph.get_place("tower-bridge") == place
