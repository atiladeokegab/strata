"""Sourced exhibit graph, with validated JSON available when SurrealDB is offline."""
import json
import logging
import os
from pathlib import Path

import httpx

from scripts.validate import SLUG, assert_valid

DATA = Path(__file__).resolve().parents[1] / "data" / "places"
log = logging.getLogger(__name__)


def load_place(place_id: str) -> dict | None:
    if not SLUG.fullmatch(place_id):
        return None
    path = DATA / f"{place_id}.json"
    if not path.is_file():
        return None
    place = json.loads(path.read_text())
    assert_valid(place)
    return place


def _query(sql: str, variables: dict) -> list:
    url = os.environ["SURREAL_URL"].rstrip("/")
    auth = None
    if os.getenv("SURREAL_USER"):
        auth = (os.environ["SURREAL_USER"], os.getenv("SURREAL_PASS", ""))
    response = httpx.post(
        f"{url}/sql",
        # RPC JSON parameters can coerce colon-containing source titles into record IDs.
        content="\n".join(f"LET ${key} = {json.dumps(value, ensure_ascii=False)};"
                          for key, value in variables.items()) + "\n" + sql,
        headers={"Accept": "application/json", "Content-Type": "text/plain",
                 "Surreal-NS": os.getenv("SURREAL_NS", "strata"),
                 "Surreal-DB": os.getenv("SURREAL_DB", "strata")},
        auth=auth, timeout=5,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError("SurrealDB query failed")
    results = payload[len(variables):]
    if any(r.get("status") != "OK" for r in results):
        raise RuntimeError("SurrealDB statement failed")
    return results


def get_place(place_id: str) -> dict | None:
    if not SLUG.fullmatch(place_id):
        return None
    if os.getenv("SURREAL_URL"):
        try:
            results = _query("SELECT payload FROM place WHERE slug = $slug LIMIT 1;", {"slug": place_id})
            rows = results[0]["result"]
            if rows:
                place = rows[0]["payload"]
                assert_valid(place)
                if place["id"] != place_id:
                    raise ValueError("place id mismatch")
                return place
        except (httpx.HTTPError, ValueError, RuntimeError, KeyError, IndexError, TypeError):
            log.warning("SurrealDB unavailable or invalid; using sourced JSON")
    return load_place(place_id)


def seed_place(place: dict) -> None:
    """Atomically replace this exhibit's nodes and relations; safe to run repeatedly."""
    assert_valid(place)
    slug = place["id"]
    sql = ["BEGIN TRANSACTION;"]
    edges = ("has_part", "cites", "has_event", "involves", "nearby", "has_fact")
    tables = ("place", "part", "event", "person", "related_place", "fact", "source")
    for table in edges:
        sql.append(f"DEFINE TABLE IF NOT EXISTS {table} TYPE RELATION SCHEMALESS;")
    for table in tables:
        sql.append(f"DEFINE TABLE IF NOT EXISTS {table} SCHEMALESS;")
    for table in edges + tables[1:]:
        sql.append(f"DELETE {table} WHERE exhibit = $slug;")
    variables = {"slug": slug, "place": place}
    sql.append("UPSERT type::record('place', $slug) SET slug = $slug, payload = $place;")
    for collection, table, edge in (("sources", "source", None),
                                     ("parts", "part", "has_part"), ("events", "event", "has_event"),
                                     ("people", "person", "involves"), ("related_places", "related_place", "nearby"),
                                     ("facts", "fact", "has_fact")):
        for i, item in enumerate(place.get(collection, [])):
            key = f"{table}_{i}"
            variables[key] = item
            variables[f"{key}_id"] = f"{slug}--{item.get('id', str(i))}"
            record = f"(type::record('{table}', ${key}_id))"
            sql.append(f"UPSERT {record} SET exhibit = $slug, payload = ${key};")
            if edge:
                sql.append(f"RELATE (type::record('place', $slug))->{edge}->{record} SET exhibit = $slug;")
            refs = set(item.get("sources", []))
            if item.get("source"):
                refs.add(item["source"])
            refs.update(dim["source"] for dim in item.get("dims", {}).values())
            for j, source_id in enumerate(sorted(refs)):
                ref = f"{key}_source_{j}"
                variables[ref] = f"{slug}--{source_id}"
                sql.append(f"RELATE {record}->cites->(type::record('source', ${ref})) SET exhibit = $slug;")
    sql.append("COMMIT TRANSACTION;")
    _query("\n".join(sql), variables)


if __name__ == "__main__":
    for path in sorted(DATA.glob("*.json")):
        seed_place(load_place(path.stem))
        print(f"Seeded {path.stem}")
