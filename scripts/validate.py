"""Validate exhibit provenance: python scripts/validate.py [place.json ...]."""
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STATUSES = {"text-attested", "measured", "inferred"}
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def validate(place: dict) -> list[str]:
    errors = []
    if not isinstance(place, dict):
        return ["place must be an object"]
    for field in ("id", "name", "location", "parts", "events", "sources"):
        if not place.get(field):
            errors.append(f"missing {field}")
    if not isinstance(place.get("id"), str) or not SLUG.fullmatch(place["id"]):
        errors.append("invalid place id")
    sources = place.get("sources", [])
    if not isinstance(sources, list) or any(not isinstance(s, dict) for s in sources):
        return errors + ["sources must be a list of source objects"]
    source_ids = {s.get("id") for s in sources if isinstance(s.get("id"), str)}
    if len(source_ids) != len(sources):
        errors.append("duplicate source id")
    for source in sources:
        if not all(source.get(k) for k in ("id", "title", "url", "kind")):
            errors.append("source needs id, title, url and kind")
        if any(not isinstance(source.get(k), str) or not source[k].strip()
               for k in ("id", "title", "url", "kind")):
            errors.append("source id, title, URL and kind must be strings")
        url = source.get("url")
        try:
            parsed_url = urlsplit(url) if isinstance(url, str) else None
        except ValueError:
            parsed_url = None
        if not parsed_url or parsed_url.scheme not in ("https", "http") or not parsed_url.netloc:
            errors.append("source URL must use HTTP(S)")

    def walk(value, path, refs=()):
        if isinstance(value, dict):
            own_refs = []
            if "source" in value:
                own_refs.append(value["source"])
            if "sources" in value and path:
                if not isinstance(value["sources"], list):
                    errors.append(f"{path}.sources must be a list")
                else:
                    own_refs.extend(value["sources"])
            for ref in own_refs:
                if not isinstance(ref, str) or ref not in source_ids:
                    errors.append(f"{path}: unknown source {ref!r}")
            refs = own_refs or refs
            if "status" in value and (not isinstance(value["status"], str) or value["status"] not in STATUSES):
                errors.append(f"{path}: invalid status")
            for key, child in value.items():
                if key not in ("sources", "source", "id", "url"):
                    walk(child, f"{path}.{key}", refs)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                walk(child, f"{path}[{i}]", refs)
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            if not math.isfinite(value):
                errors.append(f"{path}: number must be finite")
            if not refs:
                errors.append(f"{path}: number without a source")
        elif isinstance(value, str) and re.search(r"\d", value) and not refs:
            errors.append(f"{path}: numeric text without a source")

    walk(place, "")
    for collection in ("parts", "events", "people", "related_places"):
        items = place.get(collection, [])
        if not isinstance(items, list) or any(not isinstance(i, dict) for i in items):
            errors.append(f"{collection} must be a list of objects")
            continue
        ids = [i.get("id") for i in items if isinstance(i.get("id"), str)]
        if len(ids) != len(set(ids)):
            errors.append(f"duplicate {collection} id")
        for item in items:
            if ((collection == "parts" or "id" in item) and
                    (not isinstance(item.get("id"), str) or not SLUG.fullmatch(item["id"]))):
                errors.append(f"{collection}: id must be a valid string")
            if not item.get("sources"):
                errors.append(f"{collection}: missing sources")
            if collection == "parts":
                for field in ("id", "name", "group", "summary", "dims"):
                    if field not in item:
                        errors.append(f"part missing {field}")
                dims = item.get("dims", {})
                if not isinstance(dims, dict):
                    errors.append("dims must be an object")
                    continue
                for name, dim in dims.items():
                    if not isinstance(dim, dict):
                        errors.append(f"{name}: dimension needs value, unit, source, status")
                        continue
                    if not isinstance(dim.get("value"), (int, float)) or isinstance(dim.get("value"), bool):
                        errors.append(f"{name}: dimension value must be numeric")
                    if not isinstance(dim.get("unit"), str) or not dim["unit"].strip():
                        errors.append(f"{name}: dimension unit must be a non-empty string")
                    dim_source = dim.get("source")
                    if not isinstance(dim_source, str) or dim_source not in source_ids:
                        errors.append(f"{name}: dimension needs unit and known source")
                    status = dim.get("status")
                    if not isinstance(status, str) or status not in STATUSES:
                        errors.append(f"{name}: dimension needs valid status")
                    if status == "inferred" and (not isinstance(dim.get("method"), str) or not dim["method"].strip()):
                        errors.append(f"{name}: inferred dimension needs method")
            elif collection == "events":
                if type(item.get("year")) is not int or type(item.get("stage")) is not int:
                    errors.append("event needs integer year and stage")
                if not item.get("title") or not item.get("text"):
                    errors.append("event needs title and text")
    return errors


def assert_valid(place: dict) -> None:
    errors = validate(place)
    if errors:
        raise ValueError("; ".join(errors))


if __name__ == "__main__":
    paths = [Path(p) for p in sys.argv[1:]] or sorted((ROOT / "data/places").glob("*.json"))
    failed = False
    for path in paths:
        errors = validate(json.loads(path.read_text()))
        print(f"{path.name}: " + ("; ".join(errors) if errors else "OK"))
        failed |= bool(errors)
    sys.exit(int(failed))
