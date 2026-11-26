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

Three reference agent designs share the world, tools, handbook and graders, and differ
only in their scaffold (docs/superpowers/specs/2026-11-26-agent-designs.md):
- `react`: Inspect's ReAct loop.
- `react_with_verifier`: the same loop, plus one verification turn the first time the
  model stops calling tools.
- `plan_execute`: a planner, the ReAct loop as executor for one step at a time, and a
  replanner, in one conversation.
The scaffold prompts below are part of the frozen setup: changing them needs a rerun.
"""

import json
import re
from typing import Any

from inspect_ai import Task, task
from inspect_ai.agent import Agent, AgentPrompt, AgentState, agent, as_solver, react
from inspect_ai.dataset import Sample
from inspect_ai.model import ChatMessageSystem, ChatMessageUser, GenerateConfig, get_model
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

DESIGNS = ("react", "react_with_verifier", "plan_execute")
# Loop guards, not budgets. ReAct never used more than 24 of its 40 messages in the
# trial; plan-and-execute adds about 4 scaffold messages per step, so it gets 80.
MESSAGE_LIMITS = {"react": 40, "react_with_verifier": 40, "plan_execute": 80}

VERIFY_PROMPT = (
    "Before you finish, verify your work. Check that each action you took had the intended "
    "effect, and that what you told the customer matches the records. If something is wrong "
    "or unconfirmed, fix it or escalate as the handbook says. When you are satisfied, reply "
    "briefly without calling a tool."
)
PLAN_PROMPT = (
    "Before using any tools, write a plan for handling this ticket: a short numbered list of "
    "concrete steps. Don't call any tools yet."
)
STEP_PROMPT = (
    "Carry out step {n} of your plan: {step}\n"
    "Use the tools as needed. When this step is done, reply briefly with what you found or "
    "did, without calling a tool."
)
REPLAN_PROMPT = (
    "Update your plan given what you have learned. If nothing more needs doing, or nothing more "
    "can be done with your tools now, reply with DONE on the first line. Otherwise reply with "
    "the remaining steps as a numbered list, revised if needed. Don't call any tools."
)
MAX_PLAN_STEPS = 12


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


def _react(tools: list[Tool], instructions: str | None, on_continue: Any = None) -> Agent:
    """Inspect's ReAct loop without a submit tool: it ends when the model stops calling
    tools (unless `on_continue` says otherwise). No instructions means no system message."""
    prompt = (
        AgentPrompt(
            instructions=instructions,
            handoff_prompt=None,
            assistant_prompt=None,
            submit_prompt=None,
        )
        if instructions
        else None
    )
    return react(prompt=prompt, tools=tools, submit=False, on_continue=on_continue)


def parse_plan(text: str) -> list[str] | None:
    """The steps of a plan or replan, or None when it says the ticket is done. Numbered
    steps win over a DONE ("DONE is not applicable. 1. ..." is a plan). A reply with
    neither is taken as a single step."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    steps = [re.sub(r"^\d+[.)]\s+", "", ln) for ln in lines if re.match(r"^\d+[.)]\s+", ln)]
    if steps:
        return steps
    if not lines or re.match(r"^\W*DONE\b", lines[0]):
        return None
    return [text.strip()]


@agent
def verifier_agent(tools: list[Tool]) -> Agent:
    """ReAct plus one verification turn the first time the model stops calling tools."""
    verified = False

    async def on_continue(state: AgentState) -> bool | str:
        nonlocal verified
        if state.output.message.tool_calls:
            return True
        if not verified:
            verified = True
            return VERIFY_PROMPT
        return False

    return _react(tools, SYSTEM_PROMPT, on_continue)


@agent
def plan_execute_agent(tools: list[Tool], record: dict[str, Any]) -> Agent:
    """Plan, carry out one step with the ReAct loop, replan; repeat until DONE."""
    executor = _react(tools, None)

    async def think(state: AgentState, prompt: str) -> list[str] | None:
        """A planner or replanner call: it sees the tools but may not call them."""
        state.messages.append(ChatMessageUser(content=prompt))
        output = await get_model().generate(state.messages, tools=tools, tool_choice="none")
        if output.message.tool_calls:
            raise RuntimeError("The planner called a tool despite tool_choice='none'.")
        state.messages.append(output.message)
        state.output = output
        return parse_plan(output.message.text)

    async def execute(state: AgentState) -> AgentState:
        state.messages.insert(0, ChatMessageSystem(content=SYSTEM_PROMPT))
        steps = await think(state, PLAN_PROMPT)
        done = 0
        while steps and state.output.stop_reason != "content_filter":
            if done == MAX_PLAN_STEPS:
                record["endedBy"] = "limit"
                break
            done += 1
            state.messages.append(
                ChatMessageUser(content=STEP_PROMPT.format(n=done, step=steps[0]))
            )
            state = await executor(state)
            if state.output.stop_reason == "content_filter":
                break
            steps = await think(state, REPLAN_PROMPT)
        return state

    return execute


def _design_agent(design: str, tools: list[Tool], record: dict[str, Any]) -> Agent:
    if design == "react":
        return _react(tools, SYSTEM_PROMPT)
    if design == "react_with_verifier":
        return verifier_agent(tools)
    if design == "plan_execute":
        return plan_execute_agent(tools, record)
    raise ValueError(f"unknown agent design: {design}")


@solver
def squall_agent() -> Solver:
    """Builds the sample's world and fault layer, then runs the chosen agent design."""

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
        design = state.metadata.get("design", "react")
        try:
            state = await as_solver(_design_agent(design, tools, record))(state, generate)
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
    message_limit: int | None = None,
    first_epoch: int = 1,
    token_limit: int = 300_000,
    design: str = "react",
) -> Task:
    """The Squall grid: tasks × fault settings (`none` is the baseline), for one agent
    design. The message limit defaults to the design's (MESSAGE_LIMITS)."""
    if design not in DESIGNS:
        raise ValueError(f"unknown agent design: {design}")
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
                "design": design,
            },
        )
        for task_id in task_ids
        for fk in fault_keys
    ]
    return Task(
        dataset=samples,
        solver=squall_agent(),
        scorer=squall_scorer(),
        message_limit=message_limit if message_limit is not None else MESSAGE_LIMITS[design],
        token_limit=token_limit,
        config=GenerateConfig(reasoning_effort=REASONING_EFFORT),
        metadata={"first_epoch": first_epoch, "design": design},
    )
