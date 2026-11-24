from squall_harness.scenarios import get_scenario, load_catalog
from squall_harness.tools import (
    READ_TOOLS,
    TOOL_SPECS,
    ToolContext,
    ToolErrorInfo,
    ToolOutcome,
    call_tool,
)
from squall_harness.world import World, initial_world

CATALOG = load_catalog()


def setup(task_id: str = "T01", injection: bool = False):
    s = get_scenario(CATALOG, task_id)
    world = World(initial_world(CATALOG, s, injection))
    return world, ToolContext.for_scenario(s)


def err(out: ToolOutcome) -> ToolErrorInfo:
    assert out["error"] is not None
    return out["error"]


def test_nine_tools_have_specs():
    assert len(TOOL_SPECS) == 9


def test_orders_get_T01():
    world, ctx = setup()
    out = call_tool(world, ctx, "orders.get", {"orderId": "4402"})
    assert out["ok"] and out["error"] is None and out["diff"] == []
    assert out["result"]["total"] == 289
    assert out["result"]["status"] == "delivered"
    assert out["result"]["payments"][0]["amount"] == 289


def test_inbox_read_returns_ticket_body():
    world, ctx = setup()
    out = call_tool(world, ctx, "inbox.read", {"ticketId": "TK-2081"})
    assert "crack along the rim" in out["result"]["body"]


def test_refund_records_diff_and_status():
    world, ctx = setup()
    out = call_tool(
        world, ctx, "refunds.issue", {"orderId": "4402", "amount": 289, "reason": "Cracked"}
    )
    assert out["ok"]
    paths = [c["path"] for c in out["diff"]]
    assert paths == ["/refunds/R-1", "/orders/4402/status"]
    assert world.get("/orders/4402/status") == "refunded"
    assert world.get("/refunds/R-1") == {
        "orderId": "4402",
        "amount": 289,
        "reason": "Cracked",
        "currency": "NOK",
    }


def test_partial_refund_marks_partially_refunded():
    world, ctx = setup("T03")
    call_tool(world, ctx, "refunds.issue", {"orderId": "4390", "amount": 349, "reason": "Missing"})
    assert world.get("/orders/4390/status") == "partially_refunded"


def test_refund_over_total_is_error_without_diff():
    world, ctx = setup()
    out = call_tool(world, ctx, "refunds.issue", {"orderId": "4402", "amount": 300, "reason": "x"})
    assert not out["ok"] and err(out)["kind"] == "other" and out["diff"] == []
    assert world.changes == []


def test_reply_requires_valid_decision():
    world, ctx = setup()
    out = call_tool(
        world, ctx, "ticket.reply", {"ticketId": "TK-2081", "message": "Hi", "decision": "maybe"}
    )
    assert not out["ok"] and out["diff"] == []


def test_reply_counts_and_sets_replied():
    world, ctx = setup()
    args = {"ticketId": "TK-2081", "message": "Refunded.", "decision": "refund"}
    assert call_tool(world, ctx, "ticket.reply", args)["ok"]
    ticket = world.get("/tickets/TK-2081")
    assert (ticket["status"], ticket["replies"]) == ("replied", 1)


def test_hash_prefixed_order_id_is_not_found_error():
    world, ctx = setup()
    out = call_tool(world, ctx, "orders.get", {"orderId": "#4402"})
    assert not out["ok"] and "not found" in err(out)["message"]


def test_missing_argument_is_error_not_exception():
    world, ctx = setup()
    out = call_tool(world, ctx, "refunds.issue", {"orderId": "4402"})
    assert not out["ok"] and err(out)["kind"] == "other"


def test_escalate_sets_status_and_second_escalation_fails():
    world, ctx = setup("T18")
    args = {"ticketId": "TK-2115", "reason": "Injury and legal threat"}
    first = call_tool(world, ctx, "ticket.escalate", args)
    assert first["ok"] and world.get("/tickets/TK-2115/status") == "escalated"
    assert not call_tool(world, ctx, "ticket.escalate", args)["ok"]


def test_reply_after_escalation_keeps_escalated_status():
    world, ctx = setup("T18")
    call_tool(world, ctx, "ticket.escalate", {"ticketId": "TK-2115", "reason": "Legal"})
    call_tool(
        world,
        ctx,
        "ticket.reply",
        {"ticketId": "TK-2115", "message": "Passed on.", "decision": "escalated"},
    )
    assert world.get("/tickets/TK-2115/status") == "escalated"


def test_read_tools_never_change_world():
    for s in CATALOG.scenarios:
        world, ctx = setup(s.id, injection=True)
        order = s.order
        calls = {
            "inbox.list": {},
            "inbox.read": {"ticketId": s.ticket.id},
            "orders.get": {"orderId": order.id},
            "orders.search": {"customerEmail": s.customers[0].email},
            "customers.get": {"customerId": s.customers[0].id},
            "shipping.status": {"trackingId": order.tracking_id},
        }
        assert set(calls) == READ_TOOLS
        before = world.snapshot()
        for name, args in calls.items():
            assert call_tool(world, ctx, name, args)["ok"], (s.id, name)
        assert world.state == before and world.changes == []
