"""Turns Inspect eval logs into a Squall dataset folder (manifest, summaries, traces).

Each model call becomes reasoning and tool_call steps (or a final_answer), each tool
event a tool_result step. Tool events are paired with the fault layer's call records
in order (the tools run one at a time); a tool event with no record (for example,
arguments Inspect could not parse) becomes an error result. Token counts are attached
to the first step of each model call, so totalTokens is the sum over steps by
construction. A sample that errored is skipped and counted, never written half-done.
Validate the output with `npm run validate:dataset -- <dir>`.
"""

import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from importlib.metadata import version
from pathlib import Path
from typing import Any

from inspect_ai.log import EvalLog, EvalSample, read_eval_log, resolve_sample_attachments
from inspect_ai.model import ContentReasoning, ContentText

from .inspect_task import REASONING_EFFORT, STORE_KEY, fault_key
from .policy import SYSTEM_PROMPT
from .scenarios import load_catalog
from .tools import TOOL_SPECS

SCHEMA_VERSION = "0.3.0"
TOOL_BY_INSPECT_NAME = {name.replace(".", "_"): name for name in TOOL_SPECS}
MODEL_LABELS = {
    "claude-haiku-5-5": "Claude Haiku 5.5",
    "claude-sonnet-5-5": "Claude Sonnet 5.5",
    "claude-opus-5-5": "Claude Opus 5.5",
}
# USD per million tokens: input, output, cache read, cache write. From Anthropic's price
# list as cached on 2026-11-03; Haiku's cache prices are estimated at 0.1x / 1.25x input.
PRICES = {
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
    "claude-sonnet-5-5": (2.0, 10.0, 0.10, 2.5),
    "claude-opus-5-5": (4.0, 20.0, 0.20, 5.0),
}


@dataclass
class ExportReport:
    study_id: str = ""
    runs: int = 0
    skipped_errors: int = 0
    skipped_unknown_tool_calls: int = 0
    cost_usd: float = 0.0
    exposure: dict[str, float] = field(default_factory=dict)


def _ms(t: datetime | str | None, start: datetime) -> int:
    if t is None:
        return 0
    when = datetime.fromisoformat(t) if isinstance(t, str) else t
    return max(0, round((when - start).total_seconds() * 1000))


def _model_id(model: str) -> str:
    return model.split("/", 1)[1] if "/" in model else model


def _tokens(usage: Any) -> dict[str, int]:
    if usage is None:
        return {"input": 0, "output": 0}
    cached = (usage.input_tokens_cache_read or 0) + (usage.input_tokens_cache_write or 0)
    return {"input": usage.input_tokens + cached, "output": usage.output_tokens}


def _message_parts(message: Any) -> tuple[list[str], list[str]]:
    """The visible reasoning (thinking summaries) and the text of an assistant message."""
    reasoning: list[str] = []
    text: list[str] = []
    content = message.content if isinstance(message.content, list) else [message.content]
    for part in content:
        if isinstance(part, ContentReasoning):
            r = "" if part.redacted else (part.summary or part.reasoning or "")
            if r.strip():
                reasoning.append(r.strip())
        elif isinstance(part, ContentText):
            if part.text.strip():
                text.append(part.text.strip())
        elif isinstance(part, str) and part.strip():
            text.append(part.strip())
    return reasoning, text


@dataclass
class _Trace:
    steps: list[dict]
    last_t: int
    call_step: dict[int, int]  # call record seq -> index of its tool_call step


def _build_trace(sample: EvalSample, record: dict, report: ExportReport) -> _Trace:
    start = datetime.fromisoformat(str(sample.started_at))
    steps: list[dict] = []
    clock = {"t": 0}

    def add(step: dict, at: datetime | str | None) -> int:
        clock["t"] = max(clock["t"], _ms(at, start))
        steps.append({"index": len(steps), "tMs": clock["t"], **step})
        return len(steps) - 1

    prompt = sample.input if isinstance(sample.input, str) else str(sample.input)
    add({"type": "observation", "content": f"{SYSTEM_PROMPT}\n{prompt}"}, start)

    calls = list(record.get("calls", []))
    next_call = 0
    call_index: dict[str, int] = {}
    call_step: dict[int, int] = {}
    skipped: set[str] = set()

    for e in sample.events:
        if e.event == "model":
            at = e.completed or e.timestamp
            pending: dict[str, int] | None = _tokens(e.output.usage)

            def emit(step: dict, at: Any = at) -> int:
                nonlocal pending
                if pending is not None:
                    step["tokens"], pending = pending, None
                return add(step, at)

            msg = e.output.message
            reasoning, text = _message_parts(msg)
            tool_calls = list(msg.tool_calls or [])
            for r in reasoning:
                emit({"type": "reasoning", "content": r})
            if not tool_calls:
                emit({"type": "final_answer", "content": "\n\n".join(text)})
                continue
            for t in text:
                emit({"type": "reasoning", "content": t})
            for tc in tool_calls:
                if tc.function not in TOOL_BY_INSPECT_NAME:
                    skipped.add(tc.id)
                    report.skipped_unknown_tool_calls += 1
                    continue
                tool = TOOL_BY_INSPECT_NAME[tc.function]
                call_index[tc.id] = emit(
                    {"type": "tool_call", "callId": tc.id, "tool": tool, "args": tc.arguments}
                )
            if pending is not None:  # only unknown tools were called
                emit({"type": "reasoning", "content": "(Called a tool that does not exist.)"})
        elif e.event == "tool":
            if e.id in skipped or e.function not in TOOL_BY_INSPECT_NAME:
                continue
            tool = TOOL_BY_INSPECT_NAME[e.function]
            at = e.completed or e.timestamp
            rec = calls[next_call] if next_call < len(calls) else None
            step: dict[str, Any] = {"type": "tool_result", "callId": e.id, "tool": tool}
            if rec and rec["tool"] == tool and rec["args"] == e.arguments:
                next_call += 1
                out = rec["outcome"]
                step["ok"] = out["ok"]
                if out["ok"]:
                    step["result"] = out["result"]
                else:
                    step["error"] = out["error"]
                if rec.get("injectedFault"):
                    step["injectedFault"] = rec["injectedFault"]
                if out["diff"]:
                    step["worldDiff"] = out["diff"]
                if e.id in call_index:
                    call_step[rec["seq"]] = call_index[e.id]
            else:  # Inspect rejected the call before it reached our tool
                message = e.error.message if e.error else "The tool call could not be run."
                step.update(ok=False, error={"kind": "other", "message": message})
            add(step, at)
    if next_call != len(calls):
        raise ValueError(f"sample {sample.id}: {len(calls) - next_call} call records unpaired")
    return _Trace(steps, clock["t"], call_step)


def _remap_graders(graders: list[dict], call_step: dict[int, int]) -> list[dict]:
    """Grader failedAtStep holds a call record seq; the contract wants a step index."""
    out = []
    for g in graders:
        g = dict(g)
        if "failedAtStep" in g:
            idx = call_step.get(g["failedAtStep"])
            if idx is None:
                del g["failedAtStep"]
            else:
                g["failedAtStep"] = idx
        out.append(g)
    return out


def _sample_run(log: EvalLog, sample: EvalSample, report: ExportReport) -> dict:
    model_id = _model_id(log.eval.model)
    config = getattr(log.plan, "config", None)
    effort = getattr(config, "reasoning_effort", None) or REASONING_EFFORT
    agent = {
        "id": f"{model_id}__react",
        "modelLabel": MODEL_LABELS.get(model_id, model_id),
        "agentDesign": "react",
        "modelId": model_id,
        "reasoningEffort": effort,
    }
    assert sample.scores is not None
    meta = sample.scores["squall_scorer"].metadata or {}
    record = sample.store[STORE_KEY]
    task_id = sample.metadata["task_id"]
    fault = sample.metadata["fault"]
    plan = record["plan"]
    faults = []
    if fault:
        spec: dict[str, Any] = {"id": fault, "targetTool": plan["targetTool"]}
        if plan["params"]:
            spec["params"] = plan["params"]
        faults.append(spec)

    trace = _build_trace(sample, record, report)
    start = datetime.fromisoformat(str(sample.started_at))
    run: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "id": f"{agent['id']}--{task_id}--{fault_key(fault)}--s{sample.epoch}",
        "agent": agent,
        "taskId": task_id,
        "faults": faults,
        "seed": sample.epoch,
        "outcome": meta["outcome"],
        "graders": _remap_graders(meta["graders"], trace.call_step),
        "totalTokens": sum(
            st["tokens"]["input"] + st["tokens"]["output"] for st in trace.steps if "tokens" in st
        ),
        "durationMs": max(trace.last_t, _ms(sample.completed_at, start)),
        "escalated": meta["escalated"],
        "escalationExpected": meta["escalationExpected"],
        "initialWorld": record["initial"],
        "steps": trace.steps,
    }
    if faults:
        run["faultFired"] = meta["faultFired"]
    return run


def _cost(log: EvalLog, sample: EvalSample) -> float:
    total = 0.0
    for model, u in (sample.model_usage or {}).items():
        price = PRICES.get(_model_id(model))
        if price is None:
            continue
        p_in, p_out, p_cr, p_cw = price
        total += (
            u.input_tokens * p_in
            + u.output_tokens * p_out
            + (u.input_tokens_cache_read or 0) * p_cr
            + (u.input_tokens_cache_write or 0) * p_cw
        ) / 1_000_000
    return total


def _summary(run: dict) -> dict:
    s = {k: v for k, v in run.items() if k not in ("steps", "initialWorld")}
    s["stepCount"] = len(run["steps"])
    return s


def export_logs(
    log_paths: list[Path], out_dir: Path, *, study_id: str, featured: list[str] | None = None
) -> ExportReport:
    """Exports one or more Inspect logs into a Squall dataset folder (replacing its contents)."""
    report = ExportReport(study_id=study_id)
    runs: dict[str, dict] = {}
    dates: list[str] = []
    for path in log_paths:
        log = read_eval_log(str(path))
        for sample in log.samples or []:
            # Inspect stores long strings (tool arguments, messages) as attachment://
            # references in its logs; resolve them so events match the call records.
            sample = resolve_sample_attachments(sample)
            if sample.error is not None or not sample.scores or STORE_KEY not in sample.store:
                report.skipped_errors += 1
                continue
            run = _sample_run(log, sample, report)
            if run["id"] in runs:
                raise ValueError(f"duplicate run {run['id']} (same agent, task, fault and seed)")
            runs[run["id"]] = run
            report.cost_usd += _cost(log, sample)
            dates.append(str(sample.started_at)[:10])

    catalog = load_catalog()
    ordered = sorted(runs.values(), key=lambda r: r["id"])
    agents = {r["agent"]["id"]: r["agent"] for r in ordered}
    task_ids = sorted({r["taskId"] for r in ordered})
    fault_ids = sorted({f["id"] for r in ordered for f in r["faults"]})
    has_baseline = any(not r["faults"] for r in ordered)
    tasks = [
        {k: getattr(s, k) for k in ("id", "title", "description")}
        | {
            "category": str(s.category),
            "expectedOutcome": s.expected_outcome,
            "expectedAction": str(s.expected_action),
        }
        for s in catalog.scenarios
        if s.id in task_ids
    ]
    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "harness",
        "generator": {
            "name": "squall-harness",
            "version": f"{version('squall-harness')}/inspect-ai {version('inspect-ai')}",
        },
        "agents": list(agents.values()),
        "tasks": tasks or [],
        "faultSettings": ([[]] if has_baseline else []) + [[{"id": f}] for f in fault_ids],
        "seeds": sorted({r["seed"] for r in ordered}),
        "runCount": len(ordered),
        "files": {"summaries": "runs.json", "traceTemplate": "traces/{runId}.json"},
        "tracedRunIds": [r["id"] for r in ordered],
        "goldenRunIds": [],
    }
    if featured:
        manifest["featuredRunIds"] = featured
    if dates:
        lo, hi = min(dates), max(dates)
        manifest["collectedAt"] = lo if lo == hi else f"{lo}/{hi}"

    if out_dir.exists():
        shutil.rmtree(out_dir / "traces", ignore_errors=True)
    (out_dir / "traces").mkdir(parents=True, exist_ok=True)

    def write(rel: str, data: Any) -> None:
        (out_dir / rel).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    write("manifest.json", manifest)
    write("runs.json", [_summary(r) for r in ordered])
    for r in ordered:
        write(f"traces/{r['id']}.json", r)

    report.runs = len(ordered)
    for f in fault_ids:
        with_f = [r for r in ordered if r["faults"] and r["faults"][0]["id"] == f]
        report.exposure[f] = sum(1 for r in with_f if r.get("faultFired")) / len(with_f)
    return report
