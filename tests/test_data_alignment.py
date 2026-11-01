import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_place_scene_origin_matches_cited_lidar_terrain_alignment():
    place = json.loads((ROOT / "data/places/tower-bridge.json").read_text())
    terrain = json.loads((ROOT / "web/public/terrain/tower-bridge/meta.json").read_text())
    location = place["location"]
    source_ids = {source["id"] for source in place["sources"]}

    assert location["osgb"] == pytest.approx(terrain["origin_osgb"], rel=0, abs=0.01)
    assert location["source"] == "osm-tb"
    assert location["status"] == "inferred"
    assert {"ea-lidar-origin", "osm-tb"} <= set(location["sources"]) <= source_ids
