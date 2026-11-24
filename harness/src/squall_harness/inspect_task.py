"""Squall as an Inspect eval: one sample per (task, fault setting), epochs as seeds.

Notes from the API spike against inspect-ai 0.3.292:
- Tools are built per sample as ToolDefs over closures holding that sample's World and
  FaultLayer, with parameters taken from the core tools' pydantic argument models.
  Inspect tool names cannot contain dots, so `inbox.read` becomes `inbox_read`.
- A tool cannot see its own tool call id. The tools are marked parallel=False, so
  Inspect runs them one at a time in call order, and the exporter pairs call records
  with tool events by order.
- The seed is `state.epoch` offset by the task's `first_epoch` (so a later batch can run
  seeds 2 and 3). A raised ToolError reaches the model as the tool
  message's error.
- When a message or token limit is hit, LimitExceededError passes through the solver
  (a `finally` still runs), the sample records `limit`, and the scorer still runs.
"""

import json
from typing import Any

from inspect_ai import Task, task
from inspect_ai.agent import AgentPrompt, as_solver, react
from inspect_ai.dataset import Sample
from inspect_ai.model import GenerateConfig
from inspect_ai.scorer import Score, Target, mean, scorer
from inspect_ai.solver import Generate, Solver, TaskState, solver
from inspect_ai.tool import Tool, ToolDef, ToolError, ToolParams
from inspect_ai.util import LimitExceededError

from .faults import FAULT_IDS, CallRecord, FaultLayer, FaultPlan, plan_faults
from .graders import derive_outcome, expects_escalation, grade
from .policy import SYSTEM_PROMPT, task_prompt
from .scenarios import get_scenario, load_catalog
from .tools import TOOL_SPECS, ToolContext, ToolSpec
from .world import World, initial_world

STORE_KEY = "squall"
REASONING_EFFORT = "medium"


def inspect_name(tool: str) -> str:
    return tool.replace(".", "_")


def fault_key(fault: str | None) -> str:
    return fault or "none"


def _params(spec: ToolSpec) -> ToolParams:
    schema = spec.args.model_json_schema()
    return ToolParams.model_validate(
        {
            "type": "object",
            "properties": schema.get("properties", {}),
            "required": schema.get("required", []),
            "additionalProperties": False,
        }
    )


def _make_tool(spec: ToolSpec, layer: FaultLayer, world: World, save: Any) -> Tool:
    async def execute(**kwargs: Any) -> str:
        rec = layer.call(world, spec.name, kwargs)
        save()
        out = rec.outcome
        if not out["ok"]:
            raise ToolError(json.dumps(out["error"]))
        result = out["result"]
        return result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)

    return ToolDef(
        execute,
        name=inspect_name(spec.name),
        description=spec.description,
        parameters=_params(spec),
        parallel=False,
    ).as_tool()


def _record_json(rec: CallRecord) -> dict:
    return {
        "seq": rec.seq,
        "tool": rec.tool,
        "args": rec.args,
        "outcome": rec.outcome,
        "injectedFault": rec.injected_fault,
    }


def _record_from_json(d: dict) -> CallRecord:
    return CallRecord(d["seq"], d["tool"], d["args"], d["outcome"], d["injectedFault"])


@solver
def squall_agent() -> Solver:
    """Builds the sample's world and fault layer, then runs the ReAct agent over our tools."""

    async def solve(state: TaskState, generate: Generate) -> TaskState:
        catalog = load_catalog()
        s = get_scenario(catalog, state.metadata["task_id"])
        fault = state.metadata["fault"]
        seed = state.epoch + int(state.metadata.get("first_epoch", 1)) - 1
        plan = plan_faults(s, fault, seed)
        world = World(initial_world(catalog, s, fault == "prompt_injection"))
        initial = world.snapshot()
        layer = FaultLayer(plan, s, catalog, ToolContext.for_scenario(s))
        record: dict[str, Any] = {
            "plan": {"fault": plan.fault, "targetTool": plan.target_tool, "params": plan.params},
            "initial": initial,
            "seed": seed,
            "endedBy": "done",
        }

        def save() -> None:
            record.update(
                calls=[_record_json(c) for c in layer.calls],
                final=world.snapshot(),
                fired=layer.fired,
            )
            state.store.set(STORE_KEY, record)

        tools = [_make_tool(spec, layer, world, save) for spec in TOOL_SPECS.values()]
        agent = react(
            prompt=AgentPrompt(
                instructions=SYSTEM_PROMPT,
                handoff_prompt=None,
                assistant_prompt=None,
                submit_prompt=None,
            ),
            tools=tools,
            submit=False,
        )
        try:
            state = await as_solver(agent)(state, generate)
            if state.output.stop_reason == "content_filter":
                record["endedBy"] = "refusal"
        except LimitExceededError:
            record["endedBy"] = "limit"
            raise
        finally:
            save()
        return state

    return solve


def grade_record(record: dict, task_id: str) -> dict:
    """Grades one run from its stored record (plan, calls, worlds). Deterministic, so the
    exporter can regrade logs with the current graders without calling any model."""
    catalog = load_catalog()
    s = get_scenario(catalog, task_id)
    p = record["plan"]
    plan = FaultPlan(p["fault"], p["targetTool"], p["params"])
    calls = [_record_from_json(c) for c in record.get("calls", [])]
    fired = bool(record.get("fired", False))
    final = record.get("final", record["initial"])
    graders = grade(catalog, s, plan, fired, record["initial"], final, calls, record["endedBy"])
    return {
        "graders": graders,
        "outcome": derive_outcome(graders),
        "faultFired": fired,
        "escalated": final["tickets"][s.ticket.id]["status"] == "escalated",
        "escalationExpected": expects_escalation(s, plan, fired, calls),
        "endedBy": record["endedBy"],
    }


@scorer(metrics=[mean()])
def squall_scorer():
    """Runs the core graders. Value: 1 for success, 0 otherwise; graders go in metadata."""

    async def score(state: TaskState, target: Target) -> Score:
        meta = grade_record(state.store.get(STORE_KEY), state.metadata["task_id"])
        return Score(
            value=1 if meta["outcome"] == "success" else 0, answer=meta["outcome"], metadata=meta
        )

    return score


def _select(value: str, universe: list[str]) -> list[str]:
    if value == "all":
        return universe
    chosen = [v.strip() for v in value.split(",") if v.strip()]
    unknown = [v for v in chosen if v not in universe]
    if unknown:
        raise ValueError(f"unknown: {', '.join(unknown)}")
    return chosen


@task
def squall(
    tasks: str = "all",
    faults: str = "all",
    message_limit: int = 40,
    first_epoch: int = 1,
    token_limit: int = 300_000,
) -> Task:
    """The Squall grid: tasks × fault settings (`none` is the baseline)."""
    catalog = load_catalog()
    task_ids = _select(tasks, [s.id for s in catalog.scenarios])
    fault_keys = _select(faults, ["none", *FAULT_IDS])
    samples = [
        Sample(
            id=f"{task_id}__{fk}",
            input=task_prompt(get_scenario(catalog, task_id)),
            metadata={
                "task_id": task_id,
                "fault": None if fk == "none" else fk,
                "first_epoch": first_epoch,
            },
        )
        for task_id in task_ids
        for fk in fault_keys
    ]
    return Task(
        dataset=samples,
        solver=squall_agent(),
        scorer=squall_scorer(),
        message_limit=message_limit,
        token_limit=token_limit,
        config=GenerateConfig(reasoning_effort=REASONING_EFFORT),
        metadata={"first_epoch": first_epoch},
    )
