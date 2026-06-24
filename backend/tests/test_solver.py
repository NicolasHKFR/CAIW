import pytest
from app.models.schemas import DesignDefinition, RoomSpec
from app.solver.layout import solve_layout, validate_layout, auto_generate_hallway, MOCK_DEFINITION


def test_solver_basic_5_rooms():
    definition = MOCK_DEFINITION.model_copy(deep=True)
    for r in definition.rooms:
        r.x = r.y = r.w = r.h = None
        r.furniture = []
        r.preferredConnections = []
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
    assert errors == [], f"Layout validation failed: {errors}"


def test_solver_area_approximation():
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
    total_placed = sum(r.w * r.h for r in result.rooms if r.w and r.h)
    assert total_placed >= 45.0, f"Total placed area {total_placed}m² is too low (expected ≥45m²)"


def test_solver_single_room():
    definition = DesignDefinition(
        buildingType="studio",
        totalSurfaceArea=30,
        style="minimalist",
        rooms=[
            RoomSpec(id="studio", type="living_room", targetArea=30, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    assert len(result.rooms) == 1
    r = result.rooms[0]
    assert r.x == 0
    assert r.y == 0
    assert r.w == pytest.approx(6.25, abs=0.2)
    assert r.h == pytest.approx(4.80, abs=0.2)


def test_solver_furniture_preserved():
    furniture = [
        {"id": "sofa_1", "name": "sofa", "x": 1.0, "y": 1.0, "width": 2.0, "length": 0.9}
    ]
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=50,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=50, preferredConnections=[], furniture=furniture),
        ],
    )
    result = solve_layout(definition)
    assert len(result.rooms[0].furniture) == 1
    assert result.rooms[0].furniture[0].id == "sofa_1"


def test_solver_minimum_dimensions():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=30, preferredConnections=[]),
            RoomSpec(id="hallway", type="hallway", targetArea=70, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    for r in result.rooms:
        assert r.w >= 0.5
        assert r.h >= 0.5


def test_validate_layout_identifies_overlap():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="a", type="living_room", targetArea=25, preferredConnections=[], x=0, y=0, w=5, h=5),
            RoomSpec(id="b", type="bedroom", targetArea=25, preferredConnections=[], x=3, y=3, w=5, h=5),
        ],
    )
    _valid, errors = validate_layout(definition)
    assert any("Overlap" in e for e in errors)


def test_validate_area_ratio_below_85pct():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="a", type="living_room", targetArea=50, preferredConnections=[], x=0, y=0, w=7, h=7),
            RoomSpec(id="b", type="bedroom", targetArea=50, preferredConnections=[], x=7, y=0, w=1, h=2),
        ],
    )
    valid, _ = validate_layout(definition)
    assert not valid, "Should reject room with <85% target area"


def test_validate_bedroom_min_dimensions():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="bed", type="bedroom", targetArea=25, preferredConnections=[], x=0, y=0, w=2.5, h=2.5),
        ],
    )
    valid, _ = validate_layout(definition)
    assert not valid, "Bedroom should fail min 3.0×3.0"


def test_validate_bathroom_min_dimensions():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="bath", type="bathroom", targetArea=8, preferredConnections=[], x=0, y=0, w=1.5, h=1.5),
        ],
    )
    valid, _ = validate_layout(definition)
    assert not valid, "Bathroom should fail min 1.8×1.8"


def test_validate_hallway_min_width():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="h", type="hallway", targetArea=10, preferredConnections=[], x=0, y=0, w=1.0, h=5.0),
        ],
    )
    valid, errors = validate_layout(definition)
    assert not valid, "Hallway should fail min 1.2m width"


def test_validate_guest_wc_minimum():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="wc", type="guest_wc", targetArea=4, preferredConnections=[], x=0, y=0, w=1.2, h=1.2),
        ],
    )
    valid, _ = validate_layout(definition)
    assert not valid, "Guest WC should fail min 1.4×1.6"


def test_validate_furniture_clearance():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(
                id="living", type="living_room", targetArea=50,
                preferredConnections=[], x=0, y=0, w=5, h=5,
                furniture=[{"id": "sofa", "name": "sofa", "x": 0.1, "y": 0.1, "width": 2.0, "length": 0.9}],
            ),
        ],
    )
    valid, errors = validate_layout(definition)
    assert not valid, "Furniture with x=0.1 should fail 0.30m clearance"


def test_validate_adjacency_enforced():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="kitchen", type="kitchen", targetArea=20, preferredConnections=["dining"], x=0, y=0, w=4, h=4),
            RoomSpec(id="dining", type="dining_room", targetArea=20, preferredConnections=[], x=10, y=10, w=4, h=4),
        ],
    )
    valid, errors = validate_layout(definition)
    assert not valid, "Should detect missing adjacency"


def test_validate_circulation_connectivity():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="hall", type="hallway", targetArea=10, preferredConnections=[], x=0, y=0, w=2, h=4),
            RoomSpec(id="living", type="living_room", targetArea=30, preferredConnections=[], x=3, y=0, w=5, h=4),
            RoomSpec(id="isolated", type="bedroom", targetArea=20, preferredConnections=[], x=10, y=10, w=4, h=4),
        ],
    )
    valid, errors = validate_layout(definition)
    assert not valid, "Should detect unreachable room"


def test_validate_stairs_fit():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="s", type="stairs", targetArea=6, preferredConnections=[], x=0, y=0, w=1.5, h=2.5),
        ],
    )
    valid, errors = validate_layout(definition)
    assert not valid, "Stairs room 1.5×2.5 should fail min 2.0×3.0"


def test_solver_retry_on_invalid():
    definition = DesignDefinition(
        buildingType="house",
        totalSurfaceArea=200,
        style="modern",
        rooms=[
            RoomSpec(id="living", type="living_room", targetArea=50, preferredConnections=[]),
            RoomSpec(id="kitchen", type="kitchen", targetArea=25, preferredConnections=[]),
            RoomSpec(id="master", type="master_suite", targetArea=40, preferredConnections=[]),
            RoomSpec(id="bath1", type="master_bathroom", targetArea=10, preferredConnections=[]),
            RoomSpec(id="dining", type="dining_room", targetArea=20, preferredConnections=[]),
            RoomSpec(id="hall", type="hallway", targetArea=10, preferredConnections=[]),
        ],
    )
    result = solve_layout(definition)
    for r in result.rooms:
        assert r.x is not None and r.y is not None and r.w is not None and r.h is not None
        assert r.w >= 0.5 and r.h >= 0.5


def test_validate_layout_clean():
    definition = DesignDefinition(
        buildingType="apartment",
        totalSurfaceArea=100,
        style="modern",
        rooms=[
            RoomSpec(id="a", type="living_room", targetArea=25, preferredConnections=[], x=0, y=0, w=5, h=5),
            RoomSpec(id="b", type="bedroom", targetArea=25, preferredConnections=[], x=5, y=0, w=5, h=5),
        ],
    )
    _valid, errors = validate_layout(definition)
    assert errors == []
