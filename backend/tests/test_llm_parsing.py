import json
import pytest
from app.services.llm_service import _parse_llm_response, _to_definition, _strip_reasoning


def test_parse_clean_json():
    raw = '{"buildingType": "apartment", "totalSurfaceArea": 90, "style": "modern", "rooms": []}'
    result = _parse_llm_response(raw)
    assert result["buildingType"] == "apartment"
    assert result["totalSurfaceArea"] == 90


def test_parse_json_with_markdown_fence():
    raw = '```json\n{"buildingType": "house", "totalSurfaceArea": 120, "style": "scandinavian", "rooms": []}\n```'
    result = _parse_llm_response(raw)
    assert result["buildingType"] == "house"


def test_parse_json_with_code_block():
    raw = '```\n{"buildingType": "studio", "totalSurfaceArea": 40, "style": "modern", "rooms": []}\n```'
    result = _parse_llm_response(raw)
    assert result["buildingType"] == "studio"


def test_parse_json_with_surrounding_text():
    raw = 'Here is your design:\n\n{"buildingType": "apartment", "totalSurfaceArea": 90, "style": "minimalist", "rooms": []}\n\nLet me know if you need changes.'
    result = _parse_llm_response(raw)
    assert result["style"] == "minimalist"


def test_parse_malformed_json():
    with pytest.raises(Exception):
        _parse_llm_response("not json at all")


def test_to_definition_full():
    data = {
        "buildingType": "apartment",
        "totalSurfaceArea": 80,
        "style": "japanese",
        "rooms": [
            {
                "id": "living",
                "type": "living_room",
                "targetArea": 30,
                "preferredConnections": ["kitchen"],
                "furniture": [
                    {"id": "sofa_1", "name": "sofa", "x": 1.0, "y": 1.0, "width": 2.0, "length": 0.9}
                ],
            }
        ],
    }
    defn = _to_definition(data)
    assert defn.buildingType == "apartment"
    assert defn.totalSurfaceArea == 80
    assert defn.style == "japanese"
    assert len(defn.rooms) == 1
    assert defn.rooms[0].id == "living"
    assert len(defn.rooms[0].furniture) == 1


def test_to_definition_empty_rooms():
    data = {
        "buildingType": "apartment",
        "totalSurfaceArea": 50,
        "style": "modern",
        "rooms": [],
    }
    defn = _to_definition(data)
    assert len(defn.rooms) == 0


def test_to_definition_missing_fields():
    data = {}
    defn = _to_definition(data)
    assert defn.buildingType == "apartment"
    assert defn.totalSurfaceArea == 90
    assert defn.style == "scandinavian"


def test_strip_reasoning_think_tags():
    text = "<think>Let me analyze this request...</think>response{\"buildingType\": \"apartment\"}"
    result = _strip_reasoning(text)
    assert "<think>" not in result


def test_strip_reasoning_think_brackets():
    text = "[THINK]Some reasoning here[/THINK]{\"buildingType\": \"house\"}"
    result = _strip_reasoning(text)
    assert "[THINK]" not in result


def test_to_definition_furniture_fallback_name():
    data = {
        "buildingType": "apartment",
        "totalSurfaceArea": 50,
        "style": "modern",
        "rooms": [
            {
                "id": "living",
                "type": "living_room",
                "targetArea": 30,
                "preferredConnections": [],
                "furniture": [
                    {"id": "item_1", "type": "sofa", "x": 1.0, "y": 1.0, "width": 2.0, "length": 0.9}
                ],
            }
        ],
    }
    defn = _to_definition(data)
    assert defn.rooms[0].furniture[0].name == "sofa"
