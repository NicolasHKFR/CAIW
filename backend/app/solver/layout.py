import math
import logging
import random
from collections import deque
from dataclasses import dataclass
from typing import Optional

from typing import Any

from app.models.schemas import DesignDefinition, RoomSpec, DoorSpec, FurnitureItem

logger = logging.getLogger(__name__)


class LayoutError(Exception):
    """Raised when layout validation fails after exhausting retry attempts."""
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


# ── Constants ──

CLEARANCE = 0.30
GUEST_WC_MIN_W = 1.4
GUEST_WC_MIN_H = 1.6
LARGE_HOUSE_THRESHOLD = 250.0
AREA_RATIO_MIN = 0.85
MAX_RETRIES = 10
FOOTPRINT_PAD = 1.35  # Give 35% extra footprint room for min dimensions + guillotine overhead


@dataclass
class RoomConstraint:
    min_width: float
    min_height: float


ROOM_CONSTRAINTS: dict[str, RoomConstraint] = {
    "bedroom":          RoomConstraint(3.0, 3.0),
    "bedroom_2":        RoomConstraint(3.0, 3.0),
    "bedroom_3":        RoomConstraint(3.0, 3.0),
    "bedroom_4":        RoomConstraint(3.0, 3.0),
    "bedroom_5":        RoomConstraint(3.0, 3.0),
    "bathroom":         RoomConstraint(1.8, 1.8),
    "ensuite":          RoomConstraint(2.0, 2.0),
    "kitchen":          RoomConstraint(2.5, 2.5),
    "laundry":          RoomConstraint(1.8, 2.0),
    "walk_in_closet":   RoomConstraint(1.5, 1.5),
    "hallway":          RoomConstraint(1.2, 1.2),
    "hall":             RoomConstraint(1.2, 1.2),
    "landing":          RoomConstraint(2.0, 2.0),
    "stairs":           RoomConstraint(2.0, 3.0),
    "living_room":      RoomConstraint(4.0, 4.0),
    "dining_room":      RoomConstraint(3.0, 3.0),
    "family_room":      RoomConstraint(3.5, 3.5),
    "master_suite":     RoomConstraint(4.0, 4.0),
    "master_bathroom":  RoomConstraint(2.0, 2.0),
    "guest_wc":         RoomConstraint(1.4, 1.6),
    "terrace":          RoomConstraint(2.0, 2.0),
    "storage":          RoomConstraint(1.5, 1.5),
    "pantry":           RoomConstraint(1.5, 1.5),
    "garage":           RoomConstraint(3.0, 6.0),
}

GROUND_ZONE_DEFS: dict[str, set[str]] = {
    "public":     {"living_room", "dining_room", "kitchen", "family_room", "terrace"},
    "private":    {"master_suite", "master_bathroom", "walk_in_closet"},
    "service":    {"laundry", "storage", "pantry", "garage"},
}

UPPER_ZONE_DEFS: dict[str, set[str]] = {
    "bedroom":      {"bedroom", "bedroom_2", "bedroom_3", "bedroom_4", "bedroom_5", "ensuite"},
    "circulation":  {"hallway", "hall", "landing", "stairs"},
}

# Items that are never placed by the LLM — used only for rule validation
SPECIAL_FURNITURE: dict[str, tuple[float, float, float, float | None, float | None]] = {
    "double bed":      (2.0, 1.6, 0.30, None, None),
    "bathtub":         (1.7, 0.7, 0.15, 2.4, 2.0),
    "kitchen island":  (1.5, 0.8, 0.90, None, None),
    "stairs":          (1.0, 2.5, 0.15, None, None),
    "guest_wc":        (0.4, 0.5, 0.20, GUEST_WC_MIN_W, GUEST_WC_MIN_H),
    "toilet":          (0.4, 0.5, 0.20, None, None),
    "washbasin":       (0.6, 0.5, 0.15, None, None),
}

# Furniture name → 3D shape mapping (mirrors frontend FurnitureMesh.tsx)
FURNITURE_SHAPE_MAP: dict[str, str] = {
    "sofa": "sofa", "couch": "sofa", "canapé": "sofa", "canape": "sofa",
    "bed": "bed", "double bed": "bed", "single bed": "bed", "bunk bed": "bed",
    "table": "table", "coffee table": "table", "dining table": "table", "side table": "table",
    "chair": "chair", "armchair": "chair", "chaise": "chair",
    "cabinet": "cabinet", "showcase": "cabinet",
    "bathtub": "bathtub", "bath": "bathtub", "tub": "bathtub",
    "toilet": "toilet", "wc": "toilet",
    "desk": "desk", "writing desk": "desk", "computer desk": "desk",
    "bookshelf": "shelf", "bookcase": "shelf", "shelf": "shelf",
    "stairs": "stairs", "staircase": "stairs",
    "wardrobe": "wardrobe", "closet": "wardrobe", "armoire": "wardrobe",
    "kitchen island": "cabinet",
    "shoe cabinet": "cabinet", "coat rack": "cabinet",
    "tv unit": "cabinet", "television unit": "cabinet",
    "nightstand": "cabinet", "sideboard": "cabinet",
    "sink": "cabinet", "washbasin": "cabinet",
}


# ── Helpers ──

def _rect_area(r: RoomSpec) -> float:
    return (r.w or 0) * (r.h or 0)


def _shared_edge(a: RoomSpec, b: RoomSpec) -> bool:
    if a.x is None or a.y is None or a.w is None or a.h is None:
        return False
    if b.x is None or b.y is None or b.w is None or b.h is None:
        return False
    horiz = (abs(a.y - b.y - b.h) < 0.01 or abs(b.y - a.y - a.h) < 0.01)
    vert = (abs(a.x - b.x - b.w) < 0.01 or abs(b.x - a.x - a.w) < 0.01)
    if horiz:
        left = max(a.x, b.x)
        right = min(a.x + a.w, b.x + b.w)
        return right - left > 0.01
    if vert:
        top = max(a.y, b.y)
        bottom = min(a.y + a.h, b.y + b.h)
        return bottom - top > 0.01
    return False


def _shared_edge_length(a: "RoomSpec | _Rect", b: "RoomSpec | _Rect") -> float:
    """Return the length of shared edge between two rooms, or 0 if none."""
    if a.x is None or a.y is None or a.w is None or a.h is None:
        return 0.0
    if b.x is None or b.y is None or b.w is None or b.h is None:
        return 0.0
    horiz = (abs(a.y - b.y - b.h) < 0.01 or abs(b.y - a.y - a.h) < 0.01)
    vert = (abs(a.x - b.x - b.w) < 0.01 or abs(b.x - a.x - a.w) < 0.01)
    if horiz:
        left = max(a.x, b.x)
        right = min(a.x + a.w, b.x + b.w)
        return max(0.0, right - left)
    if vert:
        top = max(a.y, b.y)
        bottom = min(a.y + a.h, b.y + b.h)
        return max(0.0, bottom - top)
    return 0.0


@dataclass
class _Rect:
    x: float
    y: float
    w: float
    h: float


def _can_fit(rect: _Rect, room: RoomSpec) -> bool:
    const = ROOM_CONSTRAINTS.get(room.type)
    if const:
        return rect.w >= const.min_width - 0.01 and rect.h >= const.min_height - 0.01
    return rect.w >= 0.5 and rect.h >= 0.5


def _room_sort_key(r: RoomSpec):
    """Sort by restrictiveness: large min-dim product + large area first."""
    const = ROOM_CONSTRAINTS.get(r.type)
    if const:
        restrictiveness = const.min_width * const.min_height
    else:
        restrictiveness = 0.25
    return (-restrictiveness, -r.targetArea, r.id or "")


def _adjacency_sort(rooms: list[RoomSpec]) -> list[RoomSpec]:
    """Sort rooms so connected rooms are placed consecutively in BSP."""
    circulation = [r for r in rooms if r.type in ("hallway", "hall", "landing", "stairs")]
    rest = [r for r in rooms if r.type not in ("hallway", "hall", "landing", "stairs")]

    if len(rest) <= 2:
        rest.sort(key=_room_sort_key)
        return circulation + rest

    id_map = {r.id: r for r in rest}
    adj: dict[str, set[str]] = {r.id: set() for r in rest}
    for r in rest:
        for cid in (r.preferredConnections or []):
            if cid in adj:
                adj[r.id].add(cid)
                adj[cid].add(r.id)

    # BFS from most connected room
    seed = max(rest, key=lambda r: len(adj.get(r.id, set())))
    ordered: list[RoomSpec] = []
    visited: set[str] = set()
    queue: deque[str] = deque([seed.id])
    while queue:
        rid = queue.popleft()
        if rid in visited:
            continue
        visited.add(rid)
        ordered.append(id_map[rid])
        for nid in sorted(adj.get(rid, set()), key=lambda x: -len(adj.get(x, set()))):
            if nid not in visited:
                queue.append(nid)

    # Any remaining islands (rooms with no connections)
    for r in rest:
        if r.id not in visited:
            ordered.append(r)

    return circulation + ordered


def _place_rooms_guillotine(
    rooms: list[RoomSpec], footprint_w: float, footprint_h: float,
    shuffle_rest: bool = False,
    room_constraints: dict[str, RoomConstraint] | None = None,
) -> list[RoomSpec]:
    free: list[_Rect] = [_Rect(0, 0, footprint_w, footprint_h)]
    placed: list[RoomSpec] = []
    constraints = ROOM_CONSTRAINTS if room_constraints is None else room_constraints

    if shuffle_rest:
        sorted_rooms = list(rooms)
        random.shuffle(sorted_rooms)
    else:
        sorted_rooms = _adjacency_sort(rooms)

    for idx, room in enumerate(sorted_rooms):
        remaining = sorted_rooms[idx + 1:]
        target = room.targetArea
        const = constraints.get(room.type)
        min_req_w = const.min_width if const else 0.5
        min_req_h = const.min_height if const else 0.5

        if not free:
            logger.warning("[BSP] No space left for %s", room.id)
            room.x = room.y = 0.0
            room.w = max(min_req_w, 0.5)
            room.h = max(min_req_h, 0.5)
            placed.append(room)
            continue

        # Apply adjacency bonus for preferred connections
        connected_placed = {p.id for p in placed if p.id in (room.preferredConnections or [])}

        def _rect_adjacent_score(rect):
            bonus = 0.0
            for cp in placed:
                if cp.id in connected_placed and _shared_edge_length(rect, cp) > 0.01:
                    bonus += 100000.0
            return bonus

        best_idx = -1
        best_score = float("inf")
        for i, rect in enumerate(free):
            score = rect.w * rect.h - target - _rect_adjacent_score(rect)
            if rect.w >= min_req_w and rect.h >= min_req_h and rect.w * rect.h >= target and score < best_score:
                best_score = score
                best_idx = i

        if best_idx < 0:
            for i, rect in enumerate(free):
                score = rect.w * rect.h - target - _rect_adjacent_score(rect)
                if rect.w * rect.h >= target and score < best_score:
                    best_score = score
                    best_idx = i

        if best_idx < 0:
            best_idx = 0
            best_score = float("-inf")
            for i, rect in enumerate(free):
                area = rect.w * rect.h + _rect_adjacent_score(rect)
                if area > best_score:
                    best_score = area
                    best_idx = i

        rect = free.pop(best_idx)

        # First circulation room becomes a full-width spine for better adjacency.
        # If the floor has a hallway spine that runs the full width, split vertically
        # below the spine so remaining rooms can be placed on both sides.
        is_spine = (
            idx == 0
            and room.type in ("hallway", "hall", "landing", "stairs")
            and rect.x == 0
        )

        if is_spine:
            rw = rect.w
            rh = max(min_req_h, target / rw if rw > 0 else min_req_h)
            if rh > rect.h:
                rh = rect.h
            # After placing spine, also add a vertical split so rooms
            # can be placed to the right as well as below
            if rect.y == 0 and rw > rh * 2:
                pass
            else:
                use_v_split = False
        else:
            rw = min(rect.w, max(min_req_w, math.sqrt(target * (rect.w / rect.h))))
            rh = max(min_req_h, target / rw if rw > 0 else min_req_h)
            if rh > rect.h:
                rh = rect.h
                rw = max(min_req_w, target / rh if rh > 0 else min_req_w)
            if rw > rect.w:
                rw = rect.w
                rh = max(min_req_h, target / rw if rw > 0 else min_req_h)
            # If room has pending connected rooms, prefer wider aspect to leave
            # vertical space for them to be placed adjacently below.
            pending_connected = any(r.id in (room.preferredConnections or []) for r in remaining)
            if pending_connected and target >= 20.0:
                alt_rh = max(min_req_h, target / rect.w)
                alt_rw = min(rect.w, max(min_req_w, target / alt_rh))
                if alt_rh < rh and alt_rw >= min_req_w:
                    rw = alt_rw
                    rh = alt_rh

        if rw < min_req_w or rh < min_req_h:
            rw = rect.w
            rh = rect.h

        rw = min(rw, rect.w)
        rh = min(rh, rect.h)

        h_left = rect.h - rh
        v_left = rect.w - rw

        # Minimum viable vertical strip width: any remaining room must fit
        min_v_w = max(
            [constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_width for r in remaining] + [1.0]
        ) if remaining else 0.5

        use_h_split = h_left > 0.5 and any(
            _Rect(rect.x, rect.y + rh, rect.w, h_left).w >= (constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_width - 0.01)
            and _Rect(rect.x, rect.y + rh, rect.w, h_left).h >= (constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_height - 0.01)
            for r in remaining
        ) if remaining else h_left > 0.5
        use_v_split = v_left > 0.5 and any(
            _Rect(rect.x + rw, rect.y, v_left, rh).w >= (constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_width - 0.01)
            and _Rect(rect.x + rw, rect.y, v_left, rh).h >= (constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_height - 0.01)
            for r in remaining
        ) if remaining else v_left > 0.5

        # Suppress narrow vertical strips: if v_left can't fit any remaining
        # room's min_width AND horizontal split works, extend room full width.
        if v_left < min_v_w and use_h_split:
            rw = rect.w
            rh = max(min_req_h, target / rw if rw > 0 else min_req_h)
            if rh > rect.h:
                rh = rect.h
            h_left = rect.h - rh
            use_v_split = False
            use_h_split = h_left > 0.5 and any(
                _Rect(rect.x, rect.y + rh, rect.w, h_left).w >= (constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_width - 0.01)
                and _Rect(rect.x, rect.y + rh, rect.w, h_left).h >= (constraints.get(r.type, RoomConstraint(0.5, 0.5)).min_height - 0.01)
                for r in remaining
            ) if remaining else h_left > 0.5

        if use_h_split:
            free.append(_Rect(rect.x, rect.y + rh, rect.w, h_left))
        if use_v_split:
            free.append(_Rect(rect.x + rw, rect.y, v_left, rh))

        if not use_h_split and not use_v_split and (h_left > 0.5 or v_left > 0.5):
            if h_left > v_left:
                rh = rect.h
            else:
                rw = rect.w

        room.x = round(rect.x, 2)
        room.y = round(rect.y, 2)
        room.w = round(rw, 2)
        room.h = round(rh, 2)
        placed.append(room)

        logger.info(
            "[BSP] Placed %s (%s) target=%.1f at (%.2f, %.2f) size=%.2f×%.2f",
            room.id, room.type, target, rect.x, rect.y, rw, rh,
        )

    for r in placed:
        if r.x is None or r.y is None or r.w is None or r.h is None:
            r.x = r.y = 0.0
            r.w = max(constraints.get(r.type, RoomConstraint(2.0, 2.0)).min_width, 2.0)
            r.h = max(constraints.get(r.type, RoomConstraint(2.0, 2.0)).min_height, 2.0)

    return placed


def _group_by_floor(rooms: list[RoomSpec]) -> dict[int, list[RoomSpec]]:
    floors: dict[int, list[RoomSpec]] = {}
    for r in rooms:
        floors.setdefault(r.floor, []).append(r)
    return floors


# ── Zone system ──

def _classify_rooms_into_zones(
    rooms: list[RoomSpec], floor_num: int
) -> dict[str, list[RoomSpec]]:
    zone_defs = UPPER_ZONE_DEFS if floor_num > 1 else GROUND_ZONE_DEFS

    # Add a circulation zone on any floor that has hallway/hall rooms
    all_zone_defs = dict(zone_defs)
    has_circulation_rooms = any(r.type in ("hallway", "hall", "landing", "stairs") for r in rooms)
    if has_circulation_rooms and "circulation" not in all_zone_defs:
        all_zone_defs["circulation"] = {"hallway", "hall", "landing", "stairs"}

    classified: dict[str, list[RoomSpec]] = {}
    unassigned: list[RoomSpec] = []

    for room in rooms:
        assigned = False
        for zone_name, type_set in all_zone_defs.items():
            if room.type in type_set:
                classified.setdefault(zone_name, []).append(room)
                assigned = True
                break
        if not assigned:
            unassigned.append(room)

    if unassigned:
        fallback = next(iter(all_zone_defs))
        classified.setdefault(fallback, [])
        classified[fallback].extend(unassigned)
        logger.info(
            "[ZONE] %d unclassified room(s) on floor %d assigned to '%s'",
            len(unassigned), floor_num, fallback,
        )

    for name, zrooms in classified.items():
        logger.info(
            "[ZONE] Floor %d | %s (%d rooms) total=%.1fm²",
            floor_num, name, len(zrooms), sum(r.targetArea for r in zrooms),
        )

    return classified


def _allocate_zone_footprints(
    zones: dict[str, list[RoomSpec]], total_w: float, total_h: float
) -> dict[str, tuple[float, float, float, float]]:
    """Returns {zone_name: (zone_w, zone_h, offset_x, offset_y)} stacked vertically."""
    total_requested = sum(sum(r.targetArea for r in rooms) for rooms in zones.values())
    if total_requested <= 0:
        total_requested = 1.0

    sorted_zones = sorted(zones.items(), key=lambda kv: -sum(r.targetArea for r in kv[1]))
    footprints: dict[str, tuple[float, float, float, float]] = {}
    y_offset = 0.0

    for zone_name, zone_rooms in sorted_zones:
        zone_requested = sum(r.targetArea for r in zone_rooms)
        ratio = zone_requested / total_requested

        zone_h = total_h * ratio
        zone_h = max(zone_h, 1.0)
        zone_w = total_w

        if zone_h > total_h - y_offset:
            zone_h = total_h - y_offset

        footprints[zone_name] = (zone_w, zone_h, 0.0, y_offset)
        y_offset += zone_h

    return footprints


# ── Enhanced validation ──

def validate_layout(definition: DesignDefinition) -> tuple[bool, list[str]]:
    """Returns (is_valid, errors) checking all 10 acceptance criteria."""
    errors: list[str] = []

    # 1 + 2: Room area + min dimensions
    for room in definition.rooms:
        _validate_room_area(room, errors)
        _validate_room_dimensions(room, errors)

    # 3 + 4: Furniture fit + rules
    for room in definition.rooms:
        f_errors = _validate_furniture(room)
        errors.extend(f_errors)

    # 5: Stair constraints
    _validate_stairs(definition, errors)

    # 6: Room overlap
    _validate_overlaps(definition, errors)

    # 7: Adjacency preservation
    _validate_adjacencies(definition, errors)

    # 8: Circulation (BFS)
    _validate_circulation(definition, errors)

    return len(errors) == 0, errors


def _validate_room_area(room: RoomSpec, errors: list[str]) -> None:
    if room.x is None or room.y is None or room.w is None or room.h is None:
        return
    area = _rect_area(room)
    min_area = room.targetArea * AREA_RATIO_MIN
    if area < min_area:
        errors.append(
            f"Room '{room.id}' ({room.type}) area {area:.1f}m² is below "
            f"{AREA_RATIO_MIN*100:.0f}% of target {room.targetArea}m² "
            f"(min {min_area:.1f}m²)"
        )


def _validate_room_dimensions(room: RoomSpec, errors: list[str]) -> None:
    if room.w is None or room.h is None:
        return
    constraint = ROOM_CONSTRAINTS.get(room.type)
    if constraint is None:
        return

    if room.w < constraint.min_width - 0.01:
        errors.append(
            f"Room '{room.id}' ({room.type}) width {room.w}m < min {constraint.min_width}m"
        )
    if room.h < constraint.min_height - 0.01:
        errors.append(
            f"Room '{room.id}' ({room.type}) height {room.h}m < min {constraint.min_height}m"
        )

    # Guest WC hard minimum
    if room.type == "guest_wc":
        if room.w < GUEST_WC_MIN_W - 0.01 or room.h < GUEST_WC_MIN_H - 0.01:
            errors.append(
                f"Guest WC '{room.id}' ({room.w}×{room.h}) below absolute minimum "
                f"{GUEST_WC_MIN_W}×{GUEST_WC_MIN_H}m"
            )


def _validate_stairs(definition: DesignDefinition, errors: list[str]) -> None:
    floors_with_rooms = set(r.floor for r in definition.rooms)
    stairs_rooms = [r for r in definition.rooms if r.type == "stairs"]
    connected_floors: set[int] = set()
    for s in stairs_rooms:
        if s.connectedFloor is not None:
            connected_floors.add(s.floor)
            connected_floors.add(s.connectedFloor)

    if len(floors_with_rooms) > 1:
        unconnected = floors_with_rooms - connected_floors
        if unconnected:
            errors.append(f"Floors without stairs connection: {sorted(unconnected)}")

    for s in stairs_rooms:
        if s.w is not None and s.h is not None:
            rule = SPECIAL_FURNITURE.get("stairs")
            if rule:
                stair_w, stair_l, *_ = rule
                if s.w < stair_w - 0.01:
                    errors.append(f"Stairs room '{s.id}' width {s.w}m too narrow for stair {stair_w}m")
                if s.h < stair_l - 0.01:
                    errors.append(f"Stairs room '{s.id}' height {s.h}m too short for stair {stair_l}m")


def _validate_overlaps(definition: DesignDefinition, errors: list[str]) -> None:
    for i, a in enumerate(definition.rooms):
        for j, b in enumerate(definition.rooms):
            if i >= j:
                continue
            if a.floor != b.floor:
                continue
            if a.x is None or a.y is None or a.w is None or a.h is None:
                continue
            if b.x is None or b.y is None or b.w is None or b.h is None:
                continue
            if a.x < b.x + b.w and a.x + a.w > b.x and a.y < b.y + b.h and a.y + a.h > b.y:
                errors.append(f"Overlap detected between '{a.id}' and '{b.id}'")


def _validate_adjacencies(definition: DesignDefinition, errors: list[str]) -> None:
    id_map = {r.id: r for r in definition.rooms if r.id}

    # Build shared-wall adjacency graph (for BFS fallback)
    wall_adj: dict[str, set[str]] = {r.id: set() for r in definition.rooms if r.id}
    rooms_list = list(definition.rooms)
    for i, a in enumerate(rooms_list):
        if a.id is None:
            continue
        for b in rooms_list[i + 1:]:
            if b.id is None or a.floor != b.floor:
                continue
            if _shared_edge_length(a, b) >= 0.01:
                wall_adj[a.id].add(b.id)
                wall_adj[b.id].add(a.id)

    for room in definition.rooms:
        for conn_id in (room.preferredConnections or []):
            target = id_map.get(conn_id)
            if target is None:
                continue
            if room.floor != target.floor:
                continue
            # Circulation adjacency is validated by BFS reachability instead.
            # Real houses use doorways, not shared walls.
            if target.type in ("hallway", "hall", "landing", "stairs"):
                continue
            shared = _shared_edge_length(room, target)
            if shared >= 0.01:
                if shared < 0.5:
                    errors.append(
                        f"Adjacency weak: '{room.id}' shares only {shared:.2f}m wall "
                        f"with '{conn_id}'"
                    )
                continue
            # Fallback: BFS through shared-wall graph
            visited = {room.id}
            queue: deque[str] = deque([room.id])
            found = False
            while queue and not found:
                cur = queue.popleft()
                for nid in wall_adj.get(cur, set()):
                    if nid == conn_id:
                        found = True
                        break
                    if nid not in visited:
                        visited.add(nid)
                        queue.append(nid)
            if not found:
                errors.append(
                    f"Adjacency fail: '{room.id}' ({room.type}) does not share a wall "
                    f"with preferred connection '{conn_id}' ({target.type})"
                )


def _validate_circulation(definition: DesignDefinition, errors: list[str]) -> None:
    by_floor = _group_by_floor(definition.rooms)

    for floor_num, floor_rooms in by_floor.items():
        hall_nodes = [
            r for r in floor_rooms
            if r.type in ("hallway", "hall", "landing", "stairs")
        ]

        if len(floor_rooms) <= 2:
            continue

        if not hall_nodes:
            # No hallways on a floor with >2 rooms — flag as potential issue
            errors.append(
                f"Floor {floor_num} has {len(floor_rooms)} rooms but no hallway/circulation"
            )
            continue

        # Build adjacency graph
        adj: dict[str, set[str]] = {r.id: set() for r in floor_rooms}
        for i, a in enumerate(floor_rooms):
            for j, b in enumerate(floor_rooms):
                if i >= j or not a.id or not b.id:
                    continue
                if _shared_edge(a, b):
                    adj[a.id].add(b.id)
                    adj[b.id].add(a.id)

        # BFS from all hallway/stairs nodes
        start_ids = [r.id for r in hall_nodes if r.id]
        if not start_ids:
            continue

        reached: set[str] = set(start_ids)
        q: deque[str] = deque(start_ids)
        while q:
            current = q.popleft()
            for neighbor in adj.get(current, set()):
                if neighbor not in reached:
                    reached.add(neighbor)
                    q.append(neighbor)

        unreachable = [r.id for r in floor_rooms if r.id and r.id not in reached]
        if unreachable:
            errors.append(
                f"Floor {floor_num}: rooms {unreachable} are not reachable from circulation"
            )


def _furniture_overlap(a: Any, b: Any) -> bool:
    return a.x < b.x + b.width and a.x + a.width > b.x and a.y < b.y + b.length and a.y + a.length > b.y


def _auto_fit_furniture(rooms: list[RoomSpec]) -> None:
    """Clamp furniture positions to fit within room dimensions + clearance.
    Repositions overlapping items by scanning for available space."""
    for room in rooms:
        if room.w is None or room.h is None:
            continue
        placed: list[FurnitureItem] = []
        for f in room.furniture or []:
            max_x = room.w - f.width - CLEARANCE
            max_y = room.h - f.length - CLEARANCE
            if max_x < CLEARANCE:
                f.x = round(CLEARANCE, 2)
            else:
                f.x = round(max(CLEARANCE, min(f.x, max_x)), 2)
            if max_y < CLEARANCE:
                f.y = round(CLEARANCE, 2)
            else:
                f.y = round(max(CLEARANCE, min(f.y, max_y)), 2)

            # Resolve overlap by scanning for free space
            for _ in range(50):
                overlap = False
                for p in placed:
                    if _furniture_overlap(f, p):
                        overlap = True
                        break
                if not overlap:
                    break
                # Shift down-right by clearance step
                f.x = round(f.x + CLEARANCE, 2)
                if f.x + f.width > room.w - CLEARANCE:
                    f.x = round(CLEARANCE, 2)
                    f.y = round(f.y + CLEARANCE, 2)
                elif f.y + f.length > room.h - CLEARANCE:
                    f.y = round(CLEARANCE, 2)
                    f.x = round(CLEARANCE, 2)

            placed.append(f.model_copy(deep=True))


def _patch_constraints_for_furniture(rooms: list[RoomSpec]) -> dict[str, RoomConstraint]:
    """Return updated constraints dict that accounts for special furniture minimums."""
    constraints = dict(ROOM_CONSTRAINTS)
    for room in rooms:
        for f in room.furniture or []:
            rule = SPECIAL_FURNITURE.get(f.name.lower())
            if rule and (rule[3] is not None or rule[4] is not None):
                _, _, _, min_rw, min_rh = rule
                cur = constraints.get(room.type, RoomConstraint(0.5, 0.5))
                new_w = max(cur.min_width, min_rw) if min_rw is not None else cur.min_width
                new_h = max(cur.min_height, min_rh) if min_rh is not None else cur.min_height
                if new_w > cur.min_width or new_h > cur.min_height:
                    constraints[room.type] = RoomConstraint(new_w, new_h)
    return constraints


def _validate_furniture(room: RoomSpec) -> list[str]:
    errors: list[str] = []
    if room.x is None or room.y is None or room.w is None or room.h is None:
        return errors

    for f in (room.furniture or []):
        # Basic bounds
        if f.x < 0 or f.y < 0:
            errors.append(f"Furniture '{f.id}' is outside room '{room.id}' (negative offset)")

        # Clearance from walls
        if f.x < CLEARANCE - 0.01:
            errors.append(f"Furniture '{f.id}' x={f.x}m < clearance {CLEARANCE}m in '{room.id}'")
        if f.y < CLEARANCE - 0.01:
            errors.append(f"Furniture '{f.id}' y={f.y}m < clearance {CLEARANCE}m in '{room.id}'")
        if f.x + f.width > room.w - CLEARANCE + 0.01:
            errors.append(
                f"Furniture '{f.id}' right edge {f.x+f.width}m exceeds "
                f"room '{room.id}' width {room.w}m minus {CLEARANCE}m clearance"
            )
        if f.y + f.length > room.h - CLEARANCE + 0.01:
            errors.append(
                f"Furniture '{f.id}' bottom edge {f.y+f.length}m exceeds "
                f"room '{room.id}' height {room.h}m minus {CLEARANCE}m clearance"
            )

        # Specific furniture rules
        rule = SPECIAL_FURNITURE.get(f.name.lower())
        if rule:
            fw, fl, fclear, min_rw, min_rh = rule
            if min_rw is not None and room.w is not None and room.w < min_rw - 0.01:
                errors.append(
                    f"Room '{room.id}' width {room.w}m too small for {f.name} "
                    f"(needs ≥{min_rw}m)"
                )
            if min_rh is not None and room.h is not None and room.h < min_rh - 0.01:
                errors.append(
                    f"Room '{room.id}' height {room.h}m too small for {f.name} "
                    f"(needs ≥{min_rh}m)"
                )

    return errors


def _assign_furniture_shapes(result: DesignDefinition) -> None:
    """Set shape field on each FurnitureItem based on FURNITURE_SHAPE_MAP."""
    name_lower = {k.lower(): v for k, v in FURNITURE_SHAPE_MAP.items()}
    for room in result.rooms:
        for f in room.furniture:
            if f.shape:
                continue
            key = f.name.strip().lower()
            if key in name_lower:
                f.shape = name_lower[key]
            else:
                for pattern, shape in name_lower.items():
                    if pattern in key or key in pattern:
                        f.shape = shape
                        break
                else:
                    f.shape = "box"


# ── Solver ──

def solve_layout(definition: DesignDefinition) -> DesignDefinition:
    """Solve layout with 12-step pipeline and retry on failure."""
    base_ar = definition.aspectRatio or 1.3

    for attempt in range(MAX_RETRIES):
        ar = base_ar
        if attempt > 0:
            ar_var = random.uniform(-0.2, 0.2)
            ar = base_ar * (1.0 + ar_var)

        working = definition.model_copy(deep=True)

        try:
            result = _solve_attempt(working, ar, attempt)
            is_valid, errors = validate_layout(result)
            if is_valid:
                logger.info(
                    "[SOLVER] Layout valid on attempt %d/%d | %d rooms",
                    attempt + 1, MAX_RETRIES, len(result.rooms),
                )
                _assign_furniture_shapes(result)
                return result

            logger.warning(
                "[SOLVER] Attempt %d/%d invalid (%d errors): %s",
                attempt + 1, MAX_RETRIES, len(errors), "; ".join(errors[:5]),
            )
        except Exception as e:
            logger.error("[SOLVER] Attempt %d/%d crashed: %s", attempt + 1, MAX_RETRIES, e)

    raise LayoutError([
        f"Layout solver failed after {MAX_RETRIES} attempts — "
        "could not produce a valid layout"
    ])


def _solve_attempt(definition: DesignDefinition, ar: float, attempt: int) -> DesignDefinition:
    """Single attempt at solving a layout (steps 1-12)."""
    total_area = definition.totalSurfaceArea
    needs_zones = total_area > LARGE_HOUSE_THRESHOLD

    by_floor = _group_by_floor(definition.rooms)
    solved_all: list[RoomSpec] = []

    shuffle_rooms = attempt > 0

    room_constraints = _patch_constraints_for_furniture(definition.rooms)

    stairs_aligned: dict[str, RoomSpec] = {}

    for floor_num in sorted(by_floor.keys()):
        floor_rooms = list(by_floor[floor_num])

        floor_requested = sum(r.targetArea for r in floor_rooms)
        logger.info(
            "[SOLVER] Floor %d | %d rooms | requested=%.1fm² | attempt=%d",
            floor_num, len(floor_rooms), floor_requested, attempt + 1,
        )

        accounted = sum(r.targetArea for r in solved_all)
        remaining = max(0.0, total_area - accounted)

        if floor_requested > remaining:
            scale = remaining / floor_requested if floor_requested > 0 else 0.1
            for r in floor_rooms:
                r.targetArea = round(r.targetArea * scale, 1)
            floor_requested = sum(r.targetArea for r in floor_rooms)

        base_w = math.sqrt(floor_requested * ar) if floor_requested > 0 else 1.0
        base_h = floor_requested / base_w if base_w > 0 else 1.0
        width = round(base_w * FOOTPRINT_PAD, 2)
        height = round(base_h * FOOTPRINT_PAD, 2)
        width = max(width, 2.0)
        height = max(height, 2.0)

        if needs_zones:
            zones = _classify_rooms_into_zones(floor_rooms, floor_num)
            zone_fp = _allocate_zone_footprints(zones, width, height)

            for zone_name in sorted(zones.keys()):
                zw, zh, ox, oy = zone_fp.get(zone_name, (width, height, 0.0, 0.0))
                zw = max(zw, 1.0)
                zh = max(zh, 1.0)

                zone_rooms = zones[zone_name]
                placed = _place_rooms_guillotine(zone_rooms, zw, zh, shuffle_rest=shuffle_rooms, room_constraints=room_constraints)
                for r in placed:
                    r.x = round((r.x or 0) + ox, 2)
                    r.y = round((r.y or 0) + oy, 2)
                solved_all.extend(placed)
        else:
            placed = _place_rooms_guillotine(floor_rooms, width, height, shuffle_rest=shuffle_rooms, room_constraints=room_constraints)
            solved_all.extend(placed)

    _auto_fit_furniture(solved_all)

    # Align stairs positions across floors so they stack vertically
    stairs_rooms = [r for r in solved_all if r.type == "stairs"]
    if len(stairs_rooms) > 1:
        # Find the first placed stairs room as reference
        ref = min(stairs_rooms, key=lambda r: r.floor)
        for sr in stairs_rooms:
            if sr.id != ref.id and sr.x is not None and ref.x is not None:
                sr.x = ref.x
            if sr.id != ref.id and sr.y is not None and ref.y is not None:
                sr.y = ref.y

    solved_all.sort(key=lambda r: r.id or "")
    definition.rooms = solved_all
    definition.doors = _compute_doors(definition)

    _log_adjacency_summary(definition)
    return definition


def _compute_doors(definition: DesignDefinition) -> list[DoorSpec]:
    """Compute door positions at shared-wall midpoints between connected rooms."""
    doors: list[DoorSpec] = []
    id_map = {r.id: r for r in definition.rooms if r.id}
    rooms = list(definition.rooms)
    done: set[tuple[str, str]] = set()

    for i, a in enumerate(rooms):
        if a.id is None: continue
        for j, b in enumerate(rooms):
            if i >= j or b.id is None: continue
            key = tuple(sorted([a.id, b.id]))
            if key in done: continue
            if a.floor != b.floor: continue

            is_connected = (a.id in (b.preferredConnections or [])) or (b.id in (a.preferredConnections or []))
            if not is_connected: continue

            edge_len = _shared_edge_length(a, b)
            if edge_len < 0.5: continue

            done.add(key)

            if abs(a.y - b.y - b.h) < 0.01:
                # b is below a (north wall of a)
                center = max(a.x, b.x) + edge_len / 2
                doors.append(DoorSpec(roomA=a.id, roomB=b.id, side="north", position=round(center - a.x, 2)))
            elif abs(b.y - a.y - a.h) < 0.01:
                # b is above a (south wall of a)
                center = max(a.x, b.x) + edge_len / 2
                doors.append(DoorSpec(roomA=a.id, roomB=b.id, side="south", position=round(center - a.x, 2)))
            elif abs(a.x - b.x - b.w) < 0.01:
                # b is to the right of a (west wall of a)
                center = max(a.y, b.y) + edge_len / 2
                doors.append(DoorSpec(roomA=a.id, roomB=b.id, side="west", position=round(center - a.y, 2)))
            elif abs(b.x - a.x - a.w) < 0.01:
                # b is to the left of a (east wall of a)
                center = max(a.y, b.y) + edge_len / 2
                doors.append(DoorSpec(roomA=a.id, roomB=b.id, side="east", position=round(center - a.y, 2)))

    return doors


def _log_adjacency_summary(definition: DesignDefinition) -> None:
    adjacency_ok = 0
    adjacency_total = 0
    id_map = {r.id: r for r in definition.rooms if r.id}
    for room in definition.rooms:
        for conn_id in (room.preferredConnections or []):
            target = id_map.get(conn_id)
            if target is None or room.floor != target.floor:
                continue
            adjacency_total += 1
            if _shared_edge(room, target):
                adjacency_ok += 1

    by_floor = _group_by_floor(definition.rooms)
    floor_keys = sorted(by_floor.keys())
    floor_summary = ", ".join(f"F{r}:{len(by_floor[r])}r" for r in floor_keys)
    logger.info(
        "[SOLVER] Layout complete | floors=[%s] | total=%d rooms | "
        "adjacencies satisfied=%d/%d",
        floor_summary, len(definition.rooms), adjacency_ok, adjacency_total,
    )


def validate_layout_with_errors(definition: DesignDefinition) -> list[str]:
    """Legacy wrapper — returns just the error list for backward compat."""
    _, errors = validate_layout(definition)
    return errors


# ── Hallway auto-generation ──

def _has_hallway(rooms: list[RoomSpec]) -> bool:
    return any(r.type in ("hallway", "hall") for r in rooms)


def auto_generate_hallway(definition: DesignDefinition) -> DesignDefinition:
    rooms = [r.model_copy(deep=True) for r in definition.rooms]
    by_floor = _group_by_floor(rooms)

    new_rooms: list[RoomSpec] = []
    for floor_num in sorted(by_floor.keys()):
        floor_rooms = by_floor[floor_num]
        if len(floor_rooms) < 3 or _has_hallway(floor_rooms):
            new_rooms.extend(floor_rooms)
            continue

        floor_requested = sum(r.targetArea for r in floor_rooms)
        hall_area = max(6.0, floor_requested * 0.08)

        # Deduct proportionally from each room's surplus above min area
        available = 0.0
        room_surplus: list[tuple[RoomSpec, float]] = []
        for r in floor_rooms:
            const = ROOM_CONSTRAINTS.get(r.type)
            min_area = (const.min_width * const.min_height) if const else 4.0
            surplus = r.targetArea - min_area
            if surplus > 0:
                available += surplus
                room_surplus.append((r, surplus))

        if room_surplus and available > 0:
            to_deduct = min(hall_area, available)
            total_surplus = sum(s for _, s in room_surplus)
            for r, surplus in room_surplus:
                deduction = to_deduct * (surplus / total_surplus)
                r.targetArea = round(r.targetArea - deduction, 1)

        hall_connections = [r.id for r in floor_rooms if r.id]
        hall = RoomSpec(
            id=f"hallway_auto_f{floor_num}",
            type="hallway",
            targetArea=round(hall_area, 1),
            preferredConnections=hall_connections,
            furniture=[{"id": "shoe_auto", "name": "shoe cabinet", "x": 0.3, "y": 0.3, "width": 0.8, "length": 0.3}],
            floor=floor_num,
        )
        floor_rooms.append(hall)

        for r in floor_rooms:
            if r.preferredConnections is None:
                r.preferredConnections = []
            if r.id != hall.id:
                r.preferredConnections.append(hall.id)

        new_rooms.extend(floor_rooms)

    definition.rooms = new_rooms
    return definition


MOCK_DEFINITION = DesignDefinition(
    buildingType="apartment",
    totalSurfaceArea=90,
    style="scandinavian",
    rooms=[
        RoomSpec(id="living_room", type="living_room", targetArea=35,
                 preferredConnections=["kitchen", "hallway"],
                 x=0.0, y=0.0, w=7.0, h=5.0,
                 furniture=[{"id": "sofa_1", "name": "sofa", "x": 1.5, "y": 2.5, "width": 2.2, "length": 0.9},
                            {"id": "table_1", "name": "dining table", "x": 5.0, "y": 1.5, "width": 1.6, "length": 0.9}]),
        RoomSpec(id="bedroom", type="bedroom", targetArea=16,
                 preferredConnections=["hallway"],
                 x=7.0, y=0.0, w=4.0, h=4.0,
                 furniture=[{"id": "bed_1", "name": "double bed", "x": 8.0, "y": 1.0, "width": 2.0, "length": 1.6}]),
        RoomSpec(id="kitchen", type="kitchen", targetArea=14,
                 preferredConnections=["living_room", "hallway"],
                 x=0.0, y=5.0, w=4.5, h=3.1,
                 furniture=[{"id": "counter_1", "name": "kitchen island", "x": 1.0, "y": 6.0, "width": 2.5, "length": 0.8}]),
        RoomSpec(id="bathroom", type="bathroom", targetArea=8,
                 preferredConnections=["hallway"],
                 x=4.5, y=5.0, w=2.5, h=3.2,
                 furniture=[{"id": "tub_1", "name": "bathtub", "x": 4.8, "y": 5.5, "width": 1.7, "length": 0.7}]),
        RoomSpec(id="hallway", type="hallway", targetArea=17,
                 preferredConnections=[],
                 x=7.0, y=4.0, w=4.0, h=4.2,
                 furniture=[]),
    ]
)
