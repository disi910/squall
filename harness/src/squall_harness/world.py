"""The simulated world: built from the catalog, changed only through World.set.

The world is plain JSON (camelCase dicts), exactly as the contract's WorldState,
so changes can be recorded as RFC 6901 JSON Pointer diffs that the replay viewer
and the contract's replay rule understand.
"""

import copy
from datetime import date, timedelta
from typing import Any

from .models import Scenario, ScenarioCatalog


def _num(x: float) -> float | int:
    """Keeps whole amounts as ints, so exported JSON matches the TypeScript output."""
    return int(x) if float(x).is_integer() else x


def _days_ago(now: str, n: int) -> str:
    return (date.fromisoformat(now) - timedelta(days=n)).isoformat()


def _add_order(world: dict, order: dict, fallback_customer: str) -> None:
    now = world["now"]
    items = [
        {"name": i["name"], "qty": i["qty"], "unitPrice": _num(i["unitPrice"])}
        for i in order["items"]
    ]
    entry: dict[str, Any] = {
        "customerId": order.get("customerId", fallback_customer),
        "items": items,
        "total": _num(sum(i["qty"] * i["unitPrice"] for i in items)),
        "currency": "NOK",
        "status": order["status"],
        "trackingId": order["trackingId"],
    }
    if "deliveredDaysAgo" in order:
        entry["deliveredAt"] = _days_ago(now, order["deliveredDaysAgo"])
    world["orders"][order["id"]] = entry
    world["shipments"][order["trackingId"]] = {
        "carrierStatus": order["shipment"]["status"],
        "detail": order["shipment"]["detail"],
        "updatedAt": now,
    }
    for p in order["payments"]:
        world["payments"][p["id"]] = {
            "orderId": order["id"],
            "amount": _num(p["amount"]),
            "currency": "NOK",
            "capturedAt": _days_ago(now, p["daysAgo"]),
        }


def _customer(c: dict) -> dict:
    return {"name": c["name"], "email": c["email"], "city": c["city"]}


def initial_world(
    catalog: ScenarioCatalog, scenario: Scenario, with_injection_target: bool
) -> dict:
    """The world before the first step; injection runs also hold the targeted order and its owner.

    Mirrors initialWorldFor in scripts/mock/world.ts; a test checks they agree on every task.
    """
    s = scenario.model_dump(by_alias=True, exclude_none=True, mode="json")
    primary = s["customers"][0]
    world: dict[str, Any] = {
        "now": str(catalog.now),
        "customers": {c["id"]: _customer(c) for c in s["customers"]},
        "orders": {},
        "refunds": {},
        "tickets": {
            s["ticket"]["id"]: {
                "from": s["ticket"].get("from", primary["email"]),
                "subject": s["ticket"]["subject"],
                "status": "open",
                "replies": 0,
            }
        },
        "shipments": {},
        "payments": {},
    }
    _add_order(world, s["order"], primary["id"])
    for o in s.get("extraOrders", []):
        _add_order(world, o, primary["id"])
    if with_injection_target:
        inj = catalog.injection.model_dump(by_alias=True, exclude_none=True, mode="json")
        world["customers"][inj["customer"]["id"]] = _customer(inj["customer"])
        _add_order(world, inj["order"], inj["customer"]["id"])
    return world


def _tokens(pointer: str) -> list[str]:
    if not pointer.startswith("/"):
        raise ValueError(f"not a JSON Pointer: {pointer!r}")
    return [t.replace("~1", "/").replace("~0", "~") for t in pointer[1:].split("/")]


class World:
    """A world state plus every change made to it, in order."""

    def __init__(self, state: dict) -> None:
        self.state = state
        self.changes: list[dict] = []

    def get(self, pointer: str) -> Any:
        """The value at a JSON Pointer; raises KeyError if any part of the path is missing."""
        node: Any = self.state
        for t in _tokens(pointer):
            if not isinstance(node, dict) or t not in node:
                raise KeyError(pointer)
            node = node[t]
        return node

    def set(self, pointer: str, value: Any) -> dict:
        """Sets a value (creating the last key if new) and records the change."""
        *parents, last = _tokens(pointer)
        node: Any = self.state
        for t in parents:
            node = node[t]
        before = copy.deepcopy(node.get(last))
        node[last] = copy.deepcopy(value)
        change = {"path": pointer, "before": before, "after": copy.deepcopy(value)}
        self.changes.append(change)
        return change

    def snapshot(self) -> dict:
        return copy.deepcopy(self.state)
