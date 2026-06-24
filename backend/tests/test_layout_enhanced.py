import pytest
from app.models.schemas import DesignDefinition, RoomSpec
from app.solver.layout import solve_layout, validate_layout, auto_generate_hallway


def test_hallway_auto_generation():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=70,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=25, preferredConnections=["kitchen"]),
            RoomSpec(id="bedroom", type="bedroom", targetArea=15, preferredConnections=[]),
            RoomSpec(id="kitchen", type="kitchen", targetArea=10, preferredConnections=["living"]),
            RoomSpec(id="bathroom", type="bathroom", targetArea=5, preferredConnections=[]),
        ],
    )
    result = auto_generate_hallway(definition)
    types = [r.type for r in result.rooms]
    assert "hallway" in types, "Hallway should be auto-generated for 4-room layouts"


def test_hallway_not_added_when_present():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=70,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=20, preferredConnections=[]),
            RoomSpec(id="hallway", type="hallway", targetArea=8, preferredConnections=[]),
        ],
    )
    result = auto_generate_hallway(definition)
    hallways = [r for r in result.rooms if r.type == "hallway"]
    assert len(hallways) == 1


def test_hallway_not_added_for_2_rooms():
    definition = DesignDefinition(
        buildingType="studio",
        totalSurfaceArea=40,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=30, preferredConnections=[]),
            RoomSpec(id="bathroom", type="bathroom", targetArea=5, preferredConnections=[]),
        ],
    )
    result = auto_generate_hallway(definition)
    assert len(result.rooms) == 2


def test_solver_basic_placement():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=80,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=20, preferredConnections=[]),
            RoomSpec(id="bedroom", type="bedroom", targetArea=15, preferredConnections=[]),
            RoomSpec(id="kitchen", type="kitchen", targetArea=10, preferredConnections=[]),
            RoomSpec(id="bathroom", type="bathroom", targetArea=5, preferredConnections=[]),
            RoomSpec(id="hall", type="hallway", targetArea=8, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    assert len(result.rooms) == 5
    for r in result.rooms:
        assert r.x is not None
        assert r.y is not None
        assert r.w is not None
        assert r.h is not None
        assert r.w >= 0.5
        assert r.h >= 0.5


def test_solver_no_overlaps():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=80,
        style="scandinavian",
        rooms=[
            RoomSpec(id="a", type="living_room", targetArea=30, preferredConnections=["c"]),
            RoomSpec(id="b", type="bedroom", targetArea=20, preferredConnections=[]),
            RoomSpec(id="c", type="kitchen", targetArea=15, preferredConnections=["a"]),
            RoomSpec(id="d", type="bathroom", targetArea=8, preferredConnections=[]),
            RoomSpec(id="e", type="hallway", targetArea=7, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    _valid, errors = validate_layout(result)
    assert errors == [], f"Layout should have no overlaps: {errors}"


def test_validate_furniture_outside_room():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=50,
        style="modern",
        rooms=[
            RoomSpec(
                id="living", type="living_room", targetArea=50,
                preferredConnections=[],
                x=0, y=0, w=7, h=7,
                furniture=[{"id": "sofa_1", "name": "sofa", "x": 8, "y": 1, "width": 2, "length": 0.9}],
            ),
        ],
    )
    _valid, errors = validate_layout(definition)
    assert any("exceeds room" in e for e in errors), f"Should detect furniture outside room: {errors}"


def test_validate_negative_furniture():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=50,
        style="modern",
        rooms=[
            RoomSpec(
                id="living", type="living_room", targetArea=50,
                preferredConnections=[],
                x=0, y=0, w=7, h=7,
                furniture=[{"id": "sofa_1", "name": "sofa", "x": -1, "y": 1, "width": 2, "length": 0.9}],
            ),
        ],
    )
    _valid, errors = validate_layout(definition)
    assert any("negative" in e for e in errors)


def test_zones_skipped_for_small_house():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=40, preferredConnections=[]),
            RoomSpec(id="kitchen", type="kitchen", targetArea=20, preferredConnections=[]),
            RoomSpec(id="bed", type="bedroom", targetArea=20, preferredConnections=[]),
            RoomSpec(id="bath", type="bathroom", targetArea=10, preferredConnections=[]),
            RoomSpec(id="hall", type="hallway", targetArea=10, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    for r in result.rooms:
        assert r.x is not None and r.y is not None and r.w is not None and r.h is not None
        assert r.w >= 0.5 and r.h >= 0.5


def test_zones_large_house_ground_zones():
    from app.solver.layout import _classify_rooms_into_zones
    rooms = [
        RoomSpec(id="living", type="living_room", targetArea=40),
        RoomSpec(id="kitchen", type="kitchen", targetArea=20),
        RoomSpec(id="master", type="master_suite", targetArea=25),
        RoomSpec(id="master_bath", type="master_bathroom", targetArea=10),
        RoomSpec(id="laundry", type="laundry", targetArea=6),
        RoomSpec(id="hall", type="hallway", targetArea=8),
    ]
    zones = _classify_rooms_into_zones(rooms, 1)
    assert "public" in zones
    assert "private" in zones
    assert "service" in zones
    assert sum(len(v) for v in zones.values()) == 6


def test_zones_upper_floor():
    from app.solver.layout import _classify_rooms_into_zones
    rooms = [
        RoomSpec(id="bed2", type="bedroom_2", targetArea=15),
        RoomSpec(id="bed3", type="bedroom_3", targetArea=12),
        RoomSpec(id="ensuite2", type="ensuite", targetArea=6),
        RoomSpec(id="landing", type="landing", targetArea=4),
    ]
    zones = _classify_rooms_into_zones(rooms, 2)
    assert "bedroom" in zones
    assert "circulation" in zones
    assert sum(len(v) for v in zones.values()) == 4


def test_zones_allocate_footprints():
    from app.solver.layout import _allocate_zone_footprints
    zones = {
        "public": [RoomSpec(id="a", type="living_room", targetArea=50)],
        "private": [RoomSpec(id="b", type="master_suite", targetArea=30)],
    }
    fps = _allocate_zone_footprints(zones, 20.0, 10.0)
    total_h = sum(h for _w, h, _ox, _oy in fps.values())
    assert abs(total_h - 10.0) < 0.5


def test_bedroom_2_3_4_5_types():
    definition = DesignDefinition(
        buildingType="house",
        totalSurfaceArea=200,
        style="modern",
        rooms=[
            RoomSpec(id="b1", type="bedroom_2", targetArea=15, preferredConnections=[]),
            RoomSpec(id="b2", type="bedroom_3", targetArea=14, preferredConnections=[]),
            RoomSpec(id="b3", type="bedroom_4", targetArea=13, preferredConnections=[]),
            RoomSpec(id="hall", type="hallway", targetArea=10, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    for r in result.rooms:
        assert r.x is not None and r.y is not None and r.w is not None and r.h is not None
        assert r.w >= 0.5 and r.h >= 0.5
    types = {r.type for r in result.rooms}
    assert "bedroom_2" in types
    assert "bedroom_3" in types
    assert "bedroom_4" in types
    assert "hallway" in types
