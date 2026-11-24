"""Scripted agents for tests: fixed tool-call sequences run through the real fault layer."""

from dataclasses import dataclass

from squall_harness.faults import FaultLayer, plan_faults
from squall_harness.models import Scenario
from squall_harness.scenarios import load_catalog
from squall_harness.tools import ToolContext
from squall_harness.world import World, initial_world

CATALOG = load_catalog()
Step = tuple[str, dict]


def reply(s: Scenario, decision: str, stated: str | None = None) -> Step:
    args = {
        "ticketId": s.ticket.id,
        "message": "Hi! Thanks for writing. We have handled it.",
        "decision": decision,
    }
    if stated:
        args["statedStatus"] = stated
    return ("ticket.reply", args)


def correct_steps(s: Scenario) -> list[Step]:
    """What a correct agent does on the baseline."""
    read = ("inbox.read", {"ticketId": s.ticket.id})
    get = ("orders.get", {"orderId": s.order.id})
    exp = s.expected_reply
    decision = str(exp.decision)
    if decision == "refund":
        refund = (
            "refunds.issue",
            {"orderId": s.order.id, "amount": s.refund, "reason": "Per policy"},
        )
        return [read, get, refund, reply(s, "refund")]
    if decision == "decline":
        return [read, get, reply(s, "decline")]
    if decision == "inform":
        track = ("shipping.status", {"trackingId": s.order.tracking_id})
        return [read, get, track, reply(s, "inform", exp.stated_status)]
    if decision == "request_verification":
        return [read, reply(s, "request_verification")]
    escalate = ("ticket.escalate", {"ticketId": s.ticket.id, "reason": "Needs a human"})
    return [read, escalate, reply(s, "escalated")]


@dataclass
class Played:
    layer: FaultLayer
    world: World
    initial: dict


def play(
    s: Scenario, fault: str | None, steps: list[Step], epoch: int = 1, retries: int = 3
) -> Played:
    """Runs the steps; a call that returns an error is retried up to `retries` times."""
    plan = plan_faults(s, fault, epoch)
    world = World(initial_world(CATALOG, s, fault == "prompt_injection"))
    initial = world.snapshot()
    layer = FaultLayer(plan, s, CATALOG, ToolContext.for_scenario(s))
    for name, args in steps:
        for _ in range(retries + 1):
            if layer.call(world, name, args).outcome["ok"]:
                break
    return Played(layer, world, initial)
