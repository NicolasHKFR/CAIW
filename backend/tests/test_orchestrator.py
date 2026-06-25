import pytest
from app.models.schemas import DesignDefinition, RoomSpec, DoorSpec
from app.solver.layout import (
    solve_layout, validate_layout, auto_generate_hallway,
    _compute_doors, _auto_fit_furniture, _furniture_overlap,
    _shared_edge_length, _group_by_floor,
    FOOTPRINT_PAD,
)


def test_auto_fit_furniture_repositions_overlap():
    room = RoomSpec(
        id="test", type="bedroom", targetArea=16,
        x=0, y=0, w=4, h=4,
        furniture=[
            {"id": "bed", "name": "double bed", "x": 0.5, "y": 0.5, "width": 2.0, "length": 1.6},
            {"id": "wardrobe", "name": "wardrobe", "x": 0.6, "y": 0.6, "width": 1.0, "length": 0.6},
        ],
    )
    _auto_fit_furniture([room])
    overlap = False
    for i, a in enumerate(room.furniture):
        for j, b in enumerate(room.furniture):
            if i >= j: continue
            if _furniture_overlap(a, b):
                overlap = True
    assert not overlap, "Furniture items should not overlap after auto_fit"


def test_compute_doors():
    rooms = [
        RoomSpec(id="a", type="living_room", targetArea=20, x=0, y=0, w=5, h=4, preferredConnections=["b"]),
        RoomSpec(id="b", type="bedroom", targetArea=12, x=0, y=4, w=5, h=3, preferredConnections=["a"]),
    ]
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=32,
        rooms=rooms,
    )
    doors = _compute_doors(definition)
    assert len(doors) == 1, "Should find one door for connected rooms"
    assert doors[0].roomA == "a" or doors[0].roomA == "b"


def test_compute_doors_no_connection():
    rooms = [
        RoomSpec(id="a", type="living_room", targetArea=20, x=0, y=0, w=5, h=4, preferredConnections=[]),
        RoomSpec(id="b", type="bedroom", targetArea=12, x=0, y=4, w=5, h=3, preferredConnections=[]),
    ]
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=32,
        rooms=rooms,
    )
    doors = _compute_doors(definition)
    assert len(doors) == 0, "Should not add door between non-connected rooms"


def test_solve_multi_floor_basic():
    rooms = [
        RoomSpec(id="living", type="living_room", targetArea=25, preferredConnections=["hallway_g"], floor=1),
        RoomSpec(id="kitchen", type="kitchen", targetArea=12, preferredConnections=["hallway_g"], floor=1),
        RoomSpec(id="hallway_g", type="hallway", targetArea=6, preferredConnections=[], floor=1),
        RoomSpec(id="stairs_g", type="stairs", targetArea=6, preferredConnections=["hallway_g"], connectedFloor=2, floor=1),
        RoomSpec(id="bedroom", type="bedroom", targetArea=18, preferredConnections=["hallway_u"], floor=2),
        RoomSpec(id="bathroom", type="bathroom", targetArea=6, preferredConnections=["hallway_u"], floor=2),
        RoomSpec(id="hallway_u", type="hallway", targetArea=6, preferredConnections=[], floor=2),
        RoomSpec(id="stairs_u", type="stairs", targetArea=8, preferredConnections=["hallway_u"], connectedFloor=1, floor=2),
    ]
    definition = DesignDefinition(buildingType="house", totalSurfaceArea=180, rooms=rooms)
    result = solve_layout(definition)
    floors = _group_by_floor(result.rooms)
    assert 1 in floors and 2 in floors, "Both floors should be present after solving"
    assert len(floors[1]) == 4, f"Ground floor should have 4 rooms, got {len(floors[1])}"
    assert len(floors[2]) == 4, f"Upper floor should have 4 rooms, got {len(floors[2])}"


def test_stairs_vertical_alignment():
    """After solving, stairs rooms on different floors should share the same position."""
    rooms = [
        RoomSpec(id="living", type="living_room", targetArea=30, preferredConnections=["stairs_g"], floor=1),
        RoomSpec(id="kitchen", type="kitchen", targetArea=14, preferredConnections=["stairs_g"], floor=1),
        RoomSpec(id="stairs_g", type="stairs", targetArea=8, preferredConnections=[], connectedFloor=2, floor=1),
        RoomSpec(id="bedroom", type="bedroom", targetArea=18, preferredConnections=["stairs_u"], floor=2),
        RoomSpec(id="bathroom", type="bathroom", targetArea=8, preferredConnections=["stairs_u"], floor=2),
        RoomSpec(id="stairs_u", type="stairs", targetArea=8, preferredConnections=[], connectedFloor=1, floor=2),
    ]
    definition = DesignDefinition(buildingType="house", totalSurfaceArea=200, rooms=rooms)
    result = solve_layout(definition)
    stairs_rooms = [r for r in result.rooms if r.type == "stairs"]
    assert len(stairs_rooms) >= 1
    if len(stairs_rooms) > 1:
        s1 = stairs_rooms[0]
        s2 = stairs_rooms[1]
        assert s1.x == s2.x and s1.y == s2.y, "Stairs rooms should be vertically aligned"


def test_zone_solver_auto_hallway():
    """auto_generate_hallway respects ground-floor zones for hallway placement."""
    rooms = [
        RoomSpec(id="living", type="living_room", targetArea=28, preferredConnections=["hallway_g"], floor=1),
        RoomSpec(id="kitchen", type="kitchen", targetArea=14, preferredConnections=["hallway_g"], floor=1),
        RoomSpec(id="bedroom", type="bedroom", targetArea=16, preferredConnections=["hallway_g"], floor=1),
        RoomSpec(id="hallway_g", type="hallway", targetArea=6, preferredConnections=[], floor=1),
    ]
    definition = DesignDefinition(buildingType="house", totalSurfaceArea=140, rooms=rooms)
    result = auto_generate_hallway(definition)
    result = solve_layout(result)
    is_valid, errors = validate_layout(result)
    assert is_valid, f"Auto-generated hallway layout should be valid: {errors}"
    hallways = [r for r in result.rooms if r.type == "hallway"]
    assert len(hallways) >= 1
    assert hallways[0].h >= 1.2, f"Hallway height should be >= 1.2m, got {hallways[0].h}"


def test_hallway_area_starvation_fix():
    """Small rooms should not drop below minimum area when hallway is auto-generated."""
    rooms = [
        RoomSpec(id="living", type="living_room", targetArea=14, preferredConnections=[], floor=1),
        RoomSpec(id="bedroom", type="bedroom", targetArea=10, preferredConnections=[], floor=1),
        RoomSpec(id="bathroom", type="bathroom", targetArea=4, preferredConnections=[], floor=1),
    ]
    definition = DesignDefinition(buildingType="apartment", totalSurfaceArea=28, rooms=rooms)
    result = auto_generate_hallway(definition)
    for r in result.rooms:
        if r.type == "bedroom":
            assert r.targetArea >= 9.0, f"Bedroom should stay above min area, got {r.targetArea}"
