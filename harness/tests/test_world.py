import json
from pathlib import Path

import pytest

from squall_harness.scenarios import load_catalog
from squall_harness.world import World, initial_world

FIXTURE = Path(__file__).parent / "fixtures" / "initial-worlds.json"


def test_initial_world_matches_typescript():
    expected = json.loads(FIXTURE.read_text("utf-8"))
    catalog = load_catalog()
    for s in catalog.scenarios:
        assert initial_world(catalog, s, False) == expected[s.id]["plain"], s.id
        assert initial_world(catalog, s, True) == expected[s.id]["withInjection"], s.id


def _world() -> World:
    catalog = load_catalog()
    return World(initial_world(catalog, catalog.scenarios[0], False))


def test_set_records_before_and_after():
    w = _world()
    change = w.set("/orders/4402/status", "refunded")
    assert change == {"path": "/orders/4402/status", "before": "delivered", "after": "refunded"}
    assert w.get("/orders/4402/status") == "refunded"
    assert w.changes == [change]


def test_set_new_key_has_before_none():
    w = _world()
    change = w.set("/refunds/R-1", {"orderId": "4402", "amount": 289})
    assert change["before"] is None
    assert w.get("/refunds/R-1")["amount"] == 289


def test_get_missing_path_raises_KeyError():
    with pytest.raises(KeyError):
        _world().get("/orders/9999/status")


def test_pointer_escaping():
    w = World({"a/b": {"c~d": 1}})
    assert w.get("/a~1b/c~0d") == 1
    w.set("/a~1b/c~0d", 2)
    assert w.state == {"a/b": {"c~d": 2}}


def test_snapshot_is_a_deep_copy():
    w = _world()
    snap = w.snapshot()
    w.set("/orders/4402/status", "refunded")
    assert snap["orders"]["4402"]["status"] == "delivered"
