"""The nine support-desk tools, as plain functions over the world.

Read tools never change the world. Write tools change it only through World.set,
so every change is recorded as a diff. Bad arguments (unknown ids, missing fields,
an amount over what can be refunded) come back as error results the agent can read;
a tool never raises.
"""

from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .models import Scenario
from .world import World

ToolName = Literal[
    "inbox.list",
    "inbox.read",
    "orders.get",
    "orders.search",
    "refunds.issue",
    "shipping.status",
    "customers.get",
    "ticket.reply",
    "ticket.escalate",
]
READ_TOOLS = {
    "inbox.list",
    "inbox.read",
    "orders.get",
    "orders.search",
    "shipping.status",
    "customers.get",
}
WRITE_TOOLS = {"refunds.issue", "ticket.reply", "ticket.escalate"}
Decision = Literal["refund", "decline", "inform", "request_verification", "escalated"]


class ToolErrorInfo(TypedDict):
    kind: Literal["timeout", "rate_limited", "invalid_response", "other"]
    message: str


class ToolOutcome(TypedDict):
    ok: bool
    result: Any
    error: ToolErrorInfo | None
    diff: list[dict]


@dataclass(frozen=True)
class ToolContext:
    """What the tools know beyond the world state: the ticket bodies in the inbox."""

    bodies: dict[str, str]

    @staticmethod
    def for_scenario(scenario: Scenario) -> "ToolContext":
        return ToolContext(bodies={scenario.ticket.id: scenario.ticket.body})


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NoArgs(_Args):
    pass


class TicketArgs(_Args):
    ticketId: str = Field(description="The ticket id, e.g. TK-1001.")


class OrderArgs(_Args):
    orderId: str = Field(description="The order number, e.g. 1234.")


class SearchArgs(_Args):
    customerEmail: str = Field(description="The customer's email address.")


class CustomerArgs(_Args):
    customerId: str = Field(description="The customer id, e.g. C-100.")


class TrackingArgs(_Args):
    trackingId: str = Field(description="The carrier tracking id.")


class RefundArgs(_Args):
    orderId: str = Field(description="The order to refund.")
    amount: float = Field(description="Amount in NOK.")
    reason: str = Field(description="Why the refund is issued.")


class ReplyArgs(_Args):
    ticketId: str = Field(description="The ticket to reply to.")
    message: str = Field(description="The message to the customer.")
    decision: Decision = Field(
        description="Your decision on the ticket: refund, decline, inform, "
        "request_verification or escalated."
    )
    statedStatus: str | None = Field(
        default=None, description="The order or parcel status you state in the message, if any."
    )


class EscalateArgs(_Args):
    ticketId: str = Field(description="The ticket to hand to a human colleague.")
    reason: str = Field(description="Why a human needs to handle it.")


@dataclass(frozen=True)
class ToolSpec:
    name: ToolName
    description: str
    args: type[_Args]


TOOL_SPECS: dict[str, ToolSpec] = {
    s.name: s
    for s in [
        ToolSpec("inbox.list", "List the tickets in the support inbox.", NoArgs),
        ToolSpec("inbox.read", "Read a ticket, including the customer's message.", TicketArgs),
        ToolSpec(
            "orders.get",
            "Look up an order: items, total, status, delivery date, payments and refunds.",
            OrderArgs,
        ),
        ToolSpec("orders.search", "Find the orders placed with an email address.", SearchArgs),
        ToolSpec("customers.get", "Look up a customer record.", CustomerArgs),
        ToolSpec("shipping.status", "Ask the carrier for a parcel's current status.", TrackingArgs),
        ToolSpec("refunds.issue", "Refund an amount on an order to the customer.", RefundArgs),
        ToolSpec("ticket.reply", "Send a reply to the customer on a ticket.", ReplyArgs),
        ToolSpec(
            "ticket.escalate",
            "Hand a ticket to a human colleague and stop handling it.",
            EscalateArgs,
        ),
    ]
}


class _Fail(Exception):
    """Raised inside a tool to return an error result to the agent."""


def _not_found(kind: str, ident: str) -> _Fail:
    hint = " Use the number without '#'." if ident.startswith("#") else ""
    return _Fail(f"{kind} {ident} not found.{hint}")


def _lookup(world: World, collection: str, ident: str, kind: str) -> dict:
    found = world.state[collection].get(ident)
    if found is None:
        raise _not_found(kind, ident)
    return found


def _refunded(world: World, order_id: str) -> float:
    return sum(r["amount"] for r in world.state["refunds"].values() if r["orderId"] == order_id)


def _num(x: float) -> float | int:
    return int(x) if float(x).is_integer() else x


def _inbox_list(world: World, ctx: ToolContext, a: NoArgs) -> Any:
    return [
        {"ticketId": tid, "from": t["from"], "subject": t["subject"], "status": t["status"]}
        for tid, t in world.state["tickets"].items()
    ]


def _inbox_read(world: World, ctx: ToolContext, a: TicketArgs) -> Any:
    t = _lookup(world, "tickets", a.ticketId, "Ticket")
    return {"ticketId": a.ticketId, **t, "body": ctx.bodies.get(a.ticketId, "")}


def _orders_get(world: World, ctx: ToolContext, a: OrderArgs) -> Any:
    o = _lookup(world, "orders", a.orderId, "Order")
    payments = [
        {"paymentId": pid, "amount": p["amount"], "capturedAt": p["capturedAt"]}
        for pid, p in world.state.get("payments", {}).items()
        if p["orderId"] == a.orderId
    ]
    refunds = [
        {"refundId": rid, "amount": r["amount"], "reason": r["reason"]}
        for rid, r in world.state["refunds"].items()
        if r["orderId"] == a.orderId
    ]
    return {"orderId": a.orderId, **o, "payments": payments, "refunds": refunds}


def _orders_search(world: World, ctx: ToolContext, a: SearchArgs) -> Any:
    email = a.customerEmail.strip().lower()
    ids = {cid for cid, c in world.state["customers"].items() if c["email"].lower() == email}
    return [
        {"orderId": oid, "status": o["status"], "total": o["total"]}
        for oid, o in world.state["orders"].items()
        if o["customerId"] in ids
    ]


def _customers_get(world: World, ctx: ToolContext, a: CustomerArgs) -> Any:
    return {"customerId": a.customerId, **_lookup(world, "customers", a.customerId, "Customer")}


def _shipping_status(world: World, ctx: ToolContext, a: TrackingArgs) -> Any:
    return {"trackingId": a.trackingId, **_lookup(world, "shipments", a.trackingId, "Tracking id")}


def _refunds_issue(world: World, ctx: ToolContext, a: RefundArgs) -> Any:
    o = _lookup(world, "orders", a.orderId, "Order")
    if a.amount <= 0:
        raise _Fail("Refund amount must be positive.")
    remaining = o["total"] - _refunded(world, a.orderId)
    if a.amount > remaining + 1e-9:
        raise _Fail(f"Refund of {_num(a.amount)} NOK exceeds the refundable {_num(remaining)} NOK.")
    refund_id = f"R-{len(world.state['refunds']) + 1}"
    world.set(
        f"/refunds/{refund_id}",
        {"orderId": a.orderId, "amount": _num(a.amount), "reason": a.reason, "currency": "NOK"},
    )
    fully = abs(_refunded(world, a.orderId) - o["total"]) < 1e-9
    world.set(f"/orders/{a.orderId}/status", "refunded" if fully else "partially_refunded")
    return {
        "refundId": refund_id,
        "orderId": a.orderId,
        "amount": _num(a.amount),
        "status": "issued",
    }


def _ticket_reply(world: World, ctx: ToolContext, a: ReplyArgs) -> Any:
    t = _lookup(world, "tickets", a.ticketId, "Ticket")
    world.set(f"/tickets/{a.ticketId}/replies", t["replies"] + 1)
    if t["status"] == "open":
        world.set(f"/tickets/{a.ticketId}/status", "replied")
    return {"ticketId": a.ticketId, "status": "sent"}


def _ticket_escalate(world: World, ctx: ToolContext, a: EscalateArgs) -> Any:
    t = _lookup(world, "tickets", a.ticketId, "Ticket")
    if t["status"] == "escalated":
        raise _Fail(f"Ticket {a.ticketId} is already escalated.")
    world.set(f"/tickets/{a.ticketId}/status", "escalated")
    return {"ticketId": a.ticketId, "status": "escalated"}


_IMPLS = {
    "inbox.list": _inbox_list,
    "inbox.read": _inbox_read,
    "orders.get": _orders_get,
    "orders.search": _orders_search,
    "customers.get": _customers_get,
    "shipping.status": _shipping_status,
    "refunds.issue": _refunds_issue,
    "ticket.reply": _ticket_reply,
    "ticket.escalate": _ticket_escalate,
}


def _error(message: str) -> ToolOutcome:
    return {"ok": False, "result": None, "error": {"kind": "other", "message": message}, "diff": []}


def call_tool(world: World, ctx: ToolContext, name: str, args: dict) -> ToolOutcome:
    """Runs one tool. Returns the result, or an error result; the diff lists world changes."""
    spec = TOOL_SPECS.get(name)
    if spec is None:
        return _error(f"Unknown tool {name}.")
    try:
        parsed = spec.args.model_validate(args)
    except ValidationError as e:
        problems = "; ".join(
            f"{'.'.join(map(str, x['loc'])) or 'args'}: {x['msg']}" for x in e.errors()
        )
        return _error(f"Invalid arguments for {name}: {problems}")
    start = len(world.changes)
    try:
        result = _IMPLS[name](world, ctx, parsed)
    except _Fail as e:
        del world.changes[start:]  # failed tools change nothing
        return _error(str(e))
    return {"ok": True, "result": result, "error": None, "diff": world.changes[start:]}
