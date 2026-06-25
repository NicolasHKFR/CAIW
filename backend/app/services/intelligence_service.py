import json
import math
import logging
from datetime import datetime
from app.models.schemas import DesignDefinition
from app.solver.layout import ROOM_CONSTRAINTS, _furniture_overlap, _rect_area, _group_by_floor, CLEARANCE

logger = logging.getLogger(__name__)

ROOM_IMPORTANCE = {
    "living_room": 3.0, "kitchen": 2.5, "dining_room": 2.0,
    "bedroom": 2.0, "bedroom_2": 2.0, "bedroom_3": 2.0, "bedroom_4": 2.0, "bedroom_5": 2.0,
    "master_suite": 2.5, "master_bathroom": 1.0,
    "bathroom": 1.0, "ensuite": 1.0,
    "hallway": 0.5, "hall": 0.5, "landing": 0.5, "stairs": 0.3,
    "storage": 0.3, "pantry": 0.3, "laundry": 0.5,
    "garage": 0.5, "terrace": 0.5,
    "family_room": 2.0, "office": 2.0,
}


def _get_rooms_list(definition):
    if isinstance(definition, dict):
        return definition.get("rooms", [])
    return definition.rooms


def _get_room_id(room):
    if isinstance(room, dict):
        return room.get("id", "")
    return getattr(room, "id", "")


def _get_room_type(room):
    if isinstance(room, dict):
        return room.get("type", "")
    return getattr(room, "type", "")


def _get_room_target(room):
    if isinstance(room, dict):
        return room.get("targetArea", 0)
    return getattr(room, "targetArea", 0)


def _get_room_x(room):
    if isinstance(room, dict):
        return room.get("x")
    return getattr(room, "x", None)


def _get_room_y(room):
    if isinstance(room, dict):
        return room.get("y")
    return getattr(room, "y", None)


def _get_room_w(room):
    if isinstance(room, dict):
        return room.get("w")
    return getattr(room, "w", None)


def _get_room_h(room):
    if isinstance(room, dict):
        return room.get("h")
    return getattr(room, "h", None)


def _get_room_floor(room):
    if isinstance(room, dict):
        return room.get("floor", 1)
    return getattr(room, "floor", 1)


def _get_room_furniture(room):
    if isinstance(room, dict):
        return room.get("furniture", [])
    return getattr(room, "furniture", [])


def compute_score(definition) -> dict:
    rooms = _get_rooms_list(definition)
    positioned = [r for r in rooms if _get_room_x(r) is not None and _get_room_y(r) is not None and _get_room_w(r) is not None and _get_room_h(r) is not None]
    warnings = []

    total_floor_area = sum(_get_room_w(r) * _get_room_h(r) for r in positioned)

    space_penalties = []
    for r in positioned:
        actual = _get_room_w(r) * _get_room_h(r)
        target = _get_room_target(r)
        if target > 0:
            penalty = min(1.0, abs(actual - target) / target)
            space_penalties.append(penalty)
    space_efficiency = (1.0 - (sum(space_penalties) / max(len(space_penalties), 1))) * 100 if space_penalties else 0

    hallway_area = sum(_get_room_w(r) * _get_room_h(r) for r in positioned if _get_room_type(r) in ("hallway", "hall", "landing"))
    corridor_ratio = hallway_area / max(total_floor_area, 1)
    ideal = 0.15
    deviation = abs(corridor_ratio - ideal) / ideal
    circulation = max(0, 1.0 - deviation) * 100

    light_scores = []
    for r in positioned:
        rx = _get_room_x(r)
        ry = _get_room_y(r)
        rw = _get_room_w(r)
        rh = _get_room_h(r)
        importance = ROOM_IMPORTANCE.get(_get_room_type(r), 1.0)
        exterior_walls = 0
        orientations = []
        for other in positioned:
            if other is r:
                continue
            ox = _get_room_x(other)
            oy = _get_room_y(other)
            ow = _get_room_w(other)
            oh = _get_room_h(other)
            north = abs(ry - (oy + oh)) < 0.01 and max(rx, ox) < min(rx + rw, ox + ow)
            south = abs(ry + rh - oy) < 0.01 and max(rx, ox) < min(rx + rw, ox + ow)
            west = abs(rx - (ox + ow)) < 0.01 and max(ry, oy) < min(ry + rh, oy + oh)
            east = abs(rx + rw - ox) < 0.01 and max(ry, oy) < min(ry + rh, oy + oh)
            if north: exterior_walls |= 1
            if south: exterior_walls |= 2
            if west: exterior_walls |= 4
            if east: exterior_walls |= 8
        uncovered = (~exterior_walls) & 0b1111
        score = 0.0
        count = 0
        if uncovered & 1: count += 1; score += 0.4
        if uncovered & 2: count += 1; score += 1.0
        if uncovered & 4: count += 1; score += 0.7
        if uncovered & 8: count += 1; score += 0.7
        room_score = (score / max(count, 1)) * importance
        light_scores.append(room_score)
    total_weight = sum(ROOM_IMPORTANCE.get(_get_room_type(r), 1.0) for r in positioned)
    natural_light = (sum(light_scores) / max(total_weight, 1)) * 100 if light_scores else 0

    prop_scores = []
    for r in positioned:
        w = _get_room_w(r)
        h = _get_room_h(r)
        ratio = max(w, h) / min(w, h) if min(w, h) > 0 else 10
        if 1.0 <= ratio <= 2.0:
            ps = 1.0
        elif ratio < 1.0:
            ps = ratio
        else:
            ps = max(0, 1.0 - (ratio - 2.0) / 3.0)
        prop_scores.append(ps)
    proportions = (sum(prop_scores) / max(len(prop_scores), 1)) * 100 if prop_scores else 0

    total_items = 0
    problem_items = 0
    for r in positioned:
        rw = _get_room_w(r)
        rh = _get_room_h(r)
        for f in _get_room_furniture(r):
            total_items += 1
            f_id = f.get("id", "") if isinstance(f, dict) else getattr(f, "id", "")
            f_x = f.get("x", 0) if isinstance(f, dict) else getattr(f, "x", 0)
            f_y = f.get("y", 0) if isinstance(f, dict) else getattr(f, "y", 0)
            fw = f.get("width", 1) if isinstance(f, dict) else getattr(f, "width", 1)
            fl = f.get("length", 1) if isinstance(f, dict) else getattr(f, "length", 1)
            if f_x < CLEARANCE - 0.01 or f_y < CLEARANCE - 0.01:
                problem_items += 1
            elif f_x + fw > rw - CLEARANCE + 0.01:
                problem_items += 1
            elif f_y + fl > rh - CLEARANCE + 0.01:
                problem_items += 1
    furniture_fit = ((total_items - problem_items) / max(total_items, 1)) * 100 if total_items > 0 else 100

    overall = (
        space_efficiency * 0.30
        + circulation * 0.25
        + natural_light * 0.20
        + proportions * 0.15
        + furniture_fit * 0.10
    )

    if overall < 50: grade = "D"
    elif overall < 70: grade = "C"
    elif overall < 85: grade = "B"
    else: grade = "A"

    if space_efficiency < 50:
        warnings.append("Poor space efficiency — several rooms deviate significantly from target areas")
    if circulation < 50:
        warnings.append("Circulation space is either insufficient or excessive")
    if natural_light < 50:
        warnings.append("Limited natural light access — consider adding windows or reorienting rooms")
    if proportions < 50:
        warnings.append("Several rooms have awkward aspect ratios")
    if furniture_fit < 80:
        warnings.append("Some furniture items may not fit within their rooms or violate clearance rules")

    return {
        "overall": round(overall, 1),
        "grade": grade,
        "breakdown": {
            "space_efficiency": round(space_efficiency, 1),
            "circulation": round(circulation, 1),
            "natural_light": round(natural_light, 1),
            "proportions": round(proportions, 1),
            "furniture_fit": round(furniture_fit, 1),
        },
        "warnings": warnings,
    }


def compute_sunlight(definition, lat=40.7, lon=-74.0) -> dict:
    rooms = _get_rooms_list(definition)
    positioned = [r for r in rooms if _get_room_x(r) is not None and _get_room_y(r) is not None and _get_room_w(r) is not None and _get_room_h(r) is not None]

    if not positioned:
        return {"rooms": [], "orientation_optimal": 180.0, "energy_estimate": {"heating_kwh": 0, "cooling_kwh": 0}}

    cx = sum(_get_room_x(r) + _get_room_w(r) / 2 for r in positioned) / len(positioned)
    cy = sum(_get_room_y(r) + _get_room_h(r) / 2 for r in positioned) / len(positioned)

    ORIENTATION_HOURS = {
        "north": 2.0,
        "east": 4.0,
        "west": 4.0,
        "south": 6.0,
        "interior": 0.0,
    }

    room_sunlight = []
    for r in positioned:
        rx = _get_room_x(r)
        ry = _get_room_y(r)
        rw = _get_room_w(r)
        rh = _get_room_h(r)
        area = rw * rh

        exterior_walls = 0
        for other in positioned:
            if other is r:
                continue
            ox = _get_room_x(other)
            oy = _get_room_y(other)
            ow = _get_room_w(other)
            oh = _get_room_h(other)
            north = abs(ry - (oy + oh)) < 0.01 and max(rx, ox) < min(rx + rw, ox + ow)
            south = abs(ry + rh - oy) < 0.01 and max(rx, ox) < min(rx + rw, ox + ow)
            west = abs(rx - (ox + ow)) < 0.01 and max(ry, oy) < min(ry + rh, oy + oh)
            east = abs(rx + rw - ox) < 0.01 and max(ry, oy) < min(ry + rh, oy + oh)
            if north: exterior_walls |= 1
            if south: exterior_walls |= 2
            if west: exterior_walls |= 4
            if east: exterior_walls |= 8

        uncovered = (~exterior_walls) & 0b1111
        rm_center_x = rx + rw / 2
        rm_center_y = ry + rh / 2
        dx = rm_center_x - cx
        dy = rm_center_y - cy

        orientations = []
        if uncovered & 1: orientations.append("north")
        if uncovered & 2: orientations.append("south")
        if uncovered & 4: orientations.append("west")
        if uncovered & 8: orientations.append("east")

        if not orientations:
            orientations.append("interior")

        total_hours = sum(ORIENTATION_HOURS.get(o, 0) for o in orientations) / len(orientations)
        annual_kwh = total_hours * area * 0.15

        room_sunlight.append({
            "id": _get_room_id(r),
            "sunlight_hours": round(total_hours, 1),
            "annual_kwh": round(annual_kwh, 1),
            "orientation": orientations[0],
        })

    total_kwh = sum(r["annual_kwh"] for r in room_sunlight)
    return {
        "rooms": room_sunlight,
        "orientation_optimal": 180.0,
        "energy_estimate": {
            "heating_kwh": round(total_kwh * 1.2, 1),
            "cooling_kwh": round(total_kwh * 0.8, 1),
        },
    }


def compute_evolution(designs: list) -> list[dict]:
    entries = []
    for i, d in enumerate(designs):
        if isinstance(d, dict):
            version = d.get("version", 0)
            timestamp = d.get("created_at", "")
            raw = d.get("json_definition", {})
        else:
            version = d.version
            timestamp = str(d.created_at) if hasattr(d, "created_at") else ""
            raw = json.loads(d.json_definition) if isinstance(getattr(d, "json_definition", ""), str) else d.json_definition

        if isinstance(raw, str):
            raw = json.loads(raw)

        current_rooms = {_get_room_id(r) for r in _get_rooms_list(raw)}

        if i == 0:
            entry = {
                "version": version,
                "timestamp": str(timestamp) if not hasattr(timestamp, "isoformat") else timestamp.isoformat(),
                "rooms_added": list(current_rooms),
                "rooms_removed": [],
                "area_change": 0.0,
            }
        else:
            prev = designs[i - 1]
            if isinstance(prev, dict):
                prev_raw = prev.get("json_definition", {})
            else:
                prev_raw = json.loads(prev.json_definition) if isinstance(getattr(prev, "json_definition", ""), str) else prev.json_definition
            if isinstance(prev_raw, str):
                prev_raw = json.loads(prev_raw)

            prev_rooms = {_get_room_id(r) for r in _get_rooms_list(prev_raw)}
            added = current_rooms - prev_rooms
            removed = prev_rooms - current_rooms

            current_area = sum(_get_room_target(r) for r in _get_rooms_list(raw))
            prev_area = sum(_get_room_target(r) for r in _get_rooms_list(prev_raw))

            entry = {
                "version": version,
                "timestamp": str(timestamp) if not hasattr(timestamp, "isoformat") else timestamp.isoformat(),
                "rooms_added": sorted(added),
                "rooms_removed": sorted(removed),
                "area_change": round(current_area - prev_area, 1),
            }

        entries.append(entry)

    return entries
