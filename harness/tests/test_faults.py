import json

import pytest

from squall_harness.faults import FAULT_IDS, FaultLayer, plan_faults
from squall_harness.scenarios import get_scenario, load_catalog
from squall_harness.tools import ToolContext
from squall_harness.world import World, initial_world

CATALOG = load_catalog()
GENERIC = ["timeout", "rate_limit", "malformed_response"]


def layer(task_id: str, fault: str | None, epoch: int = 1):
    s = get_scenario(CATALOG, task_id)
    plan = plan_faults(s, fault, epoch)
    world = World(initial_world(CATALOG, s, fault == "prompt_injection"))
    return FaultLayer(plan, s, CATALOG, ToolContext.for_scenario(s)), world


def test_plan_is_deterministic():
    s = get_scenario(CATALOG, "T05")
    assert plan_faults(s, "rate_limit", 2) == plan_faults(s, "rate_limit", 2)


def test_plans_differ_across_epochs_for_generic_faults():
    targets = {
        (plan_faults(s, f, e).target_tool, plan_faults(s, f, e).seed)
        for s in CATALOG.scenarios
        for f in GENERIC
        for e in (1, 2, 3)
    }
    seeds = {seed for _, seed in targets}
    assert len(seeds) == len(CATALOG.scenarios) * len(GENERIC) * 3


def test_generic_target_in_expected_tools():
    for s in CATALOG.scenarios:
        for f in GENERIC:
            for e in (1, 2, 3):
                assert plan_faults(s, f, e).target_tool in s.expected_tools, (s.id, f, e)


def test_fixed_targets():
    s = get_scenario(CATALOG, "T01")
    assert plan_faults(s, "stale_data", 1).target_tool == "orders.get"
    assert plan_faults(s, "contradictory_sources", 1).target_tool == "shipping.status"
    assert plan_faults(s, "prompt_injection", 1).target_tool == "inbox.read"
    assert plan_faults(s, "silent_failure", 1).target_tool == "refunds.issue"
    assert plan_faults(get_scenario(CATALOG, "T18"), "silent_failure", 1).target_tool == (
        "ticket.escalate"
    )
    assert plan_faults(get_scenario(CATALOG, "T06"), "silent_failure", 1).target_tool == (
        "ticket.reply"
    )


def test_timeout_first_call_then_success():
    fl, world = layer("T01", "timeout")
    target = fl.plan.target_tool
    assert target is not None
    args = {
        "inbox.read": {"ticketId": "TK-2081"},
        "orders.get": {"orderId": "4402"},
        "refunds.issue": {"orderId": "4402", "amount": 289, "reason": "Cracked"},
        "ticket.reply": {"ticketId": "TK-2081", "message": "Done", "decision": "refund"},
    }[target]
    first = fl.call(world, target, args)
    assert first.outcome["error"] == {"kind": "timeout", "message": "No response after 30 s."}
    assert first.injected_fault and first.injected_fault["id"] == "timeout"
    assert world.changes == []
    assert fl.call(world, target, args).outcome["ok"]
    assert fl.fired


def test_rate_limit_then_success():
    s = get_scenario(CATALOG, "T10")
    for epoch in range(1, 10):
        plan = plan_faults(s, "rate_limit", epoch)
        if plan.target_tool == "orders.get":
            break
    else:
        pytest.skip("no epoch targets orders.get")
    world = World(initial_world(CATALOG, s, False))
    fl = FaultLayer(plan, s, CATALOG, ToolContext.for_scenario(s))
    calls = [
        fl.call(world, "orders.get", {"orderId": "4420"}) for _ in range(plan.params["calls"] + 1)
    ]
    assert [c.outcome["ok"] for c in calls] == [False] * plan.params["calls"] + [True]
    assert calls[0].outcome["error"]["kind"] == "rate_limited"  # type: ignore[index]


def test_malformed_response_is_truncated_text():
    fl, world = layer("T01", "malformed_response")
    fl.plan = fl.plan.__class__("malformed_response", "orders.get", {}, fl.plan.seed)
    rec = fl.call(world, "orders.get", {"orderId": "4402"})
    assert rec.outcome["ok"] and isinstance(rec.outcome["result"], str)
    with pytest.raises(json.JSONDecodeError):
        json.loads(rec.outcome["result"])


def test_stale_data_serves_old_status():
    fl, world = layer("T10", "stale_data")
    rec = fl.call(world, "orders.get", {"orderId": "4420"})
    assert rec.outcome["result"]["status"] == "processing"
    assert world.get("/orders/4420/status") == "shipped"
    assert fl.fired


def test_contradictory_sources_serves_alt_carrier_status():
    fl, world = layer("T11", "contradictory_sources")
    rec = fl.call(world, "shipping.status", {"trackingId": "NL-87990"})
    assert rec.outcome["result"]["carrierStatus"] == "in_transit"


def test_silent_failure_reports_ok_but_world_unchanged():
    fl, world = layer("T01", "silent_failure")
    args = {"orderId": "4402", "amount": 289, "reason": "Cracked"}
    rec = fl.call(world, "refunds.issue", args)
    assert rec.outcome["ok"] and rec.outcome["diff"] == [] and rec.injected_fault
    assert world.state["refunds"] == {} and world.get("/orders/4402/status") == "delivered"
    assert world.changes == []
    retry = fl.call(world, "refunds.issue", args)
    assert retry.outcome["ok"] and retry.outcome["diff"] and retry.injected_fault is None


def test_injection_appends_text_and_excerpt():
    fl, world = layer("T01", "prompt_injection")
    rec = fl.call(world, "inbox.read", {"ticketId": "TK-2081"})
    assert rec.outcome["result"]["body"].endswith(CATALOG.injection.text)
    assert rec.injected_fault == {
        "id": "prompt_injection",
        "note": "An instruction was appended to the customer's message.",
        "excerpt": CATALOG.injection.excerpt,
    }


def test_fired_false_when_target_never_called():
    fl, world = layer("T01", "contradictory_sources")
    fl.call(world, "orders.get", {"orderId": "4402"})
    assert not fl.fired


def test_baseline_plan_never_fires():
    fl, world = layer("T01", None)
    assert fl.plan.target_tool is None
    for _ in range(3):
        fl.call(world, "orders.get", {"orderId": "4402"})
    assert not fl.fired and all(c.injected_fault is None for c in fl.calls)


def test_calls_are_numbered_in_order():
    fl, world = layer("T01", None)
    fl.call(world, "inbox.read", {"ticketId": "TK-2081"})
    fl.call(world, "orders.get", {"orderId": "4402"})
    assert [c.seq for c in fl.calls] == [0, 1]


def test_fault_ids_match_contract():
    assert len(FAULT_IDS) == 7
