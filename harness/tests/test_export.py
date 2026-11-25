import json
import shutil
import subprocess
from pathlib import Path

import pytest
from inspect_ai import eval
from inspect_ai.model import ChatMessageAssistant, ModelOutput, ModelUsage, get_model
from inspect_ai.tool import ToolCall
from scripted import CATALOG, as_outputs, correct_steps

from squall_harness.export import export_logs
from squall_harness.inspect_task import squall
from squall_harness.scenarios import get_scenario

REPO = Path(__file__).resolve().parents[2]


def make_log(tmp_path: Path, outputs, tasks="T01", faults="none", name="log", **task_args) -> Path:
    log_dir = tmp_path / name
    model = get_model("mockllm/model", custom_outputs=outputs)
    eval(
        squall(tasks=tasks, faults=faults, **task_args),
        model=model,
        display="none",
        log_dir=str(log_dir),
        fail_on_error=False,
    )
    (path,) = log_dir.glob("*.eval")
    return path


def validate(dataset: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["npm", "run", "-s", "validate:dataset", "--", str(dataset)],
        cwd=REPO,
        capture_output=True,
        text=True,
    )


needs_npm = pytest.mark.skipif(shutil.which("npm") is None, reason="npm not installed")


@needs_npm
def test_export_validates(tmp_path):
    s = get_scenario(CATALOG, "T01")
    log = make_log(tmp_path, as_outputs(correct_steps(s)), faults="prompt_injection")
    report = export_logs([log], tmp_path / "ds", study_id="test")
    assert report.runs == 1 and report.skipped_errors == 0
    result = validate(tmp_path / "ds")
    assert result.returncode == 0, result.stdout + result.stderr
    manifest = json.loads((tmp_path / "ds" / "manifest.json").read_text())
    assert manifest["source"] == "harness" and manifest["goldenRunIds"] == []
    (run_id,) = manifest["tracedRunIds"]
    trace = json.loads((tmp_path / "ds" / "traces" / f"{run_id}.json").read_text())
    assert run_id == "model__react--T01--prompt_injection--s1"
    assert trace["faultFired"] is True
    assert any(st.get("injectedFault", {}).get("id") == "prompt_injection" for st in trace["steps"])


@needs_npm
def test_parallel_call_diffs_attach_to_right_result(tmp_path):
    s = get_scenario(CATALOG, "T01")
    both = ModelOutput.from_message(
        ChatMessageAssistant(
            content="",
            tool_calls=[
                ToolCall(
                    id="r1",
                    function="refunds_issue",
                    arguments={"orderId": "4402", "amount": 289, "reason": "Cracked"},
                ),
                ToolCall(id="q1", function="orders_get", arguments={"orderId": "4402"}),
            ],
        )
    )
    log = make_log(tmp_path, [both, *as_outputs([correct_steps(s)[-1]])])
    export_logs([log], tmp_path / "ds", study_id="test")
    assert validate(tmp_path / "ds").returncode == 0
    (trace_file,) = (tmp_path / "ds" / "traces").glob("*.json")
    steps = json.loads(trace_file.read_text())["steps"]
    results = {st["callId"]: st for st in steps if st["type"] == "tool_result"}
    assert results["r1"]["worldDiff"][0]["path"] == "/refunds/R-1"
    assert "worldDiff" not in results["q1"]


def test_errored_sample_skipped_and_counted(tmp_path):
    def boom():
        raise RuntimeError("model exploded")
        yield  # pragma: no cover

    log = make_log(tmp_path, boom())
    report = export_logs([log], tmp_path / "ds", study_id="test")
    assert report.runs == 0 and report.skipped_errors == 1


@needs_npm
def test_merge_two_logs(tmp_path):
    a = make_log(tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))), name="a")
    b = make_log(
        tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T06"))), tasks="T06", name="b"
    )
    report = export_logs([a, b], tmp_path / "ds", study_id="test")
    assert report.runs == 2
    assert validate(tmp_path / "ds").returncode == 0


def test_duplicate_run_raises(tmp_path):
    outs = as_outputs(correct_steps(get_scenario(CATALOG, "T01")))
    a = make_log(tmp_path, outs, name="a")
    b = make_log(tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))), name="b")
    with pytest.raises(ValueError, match="duplicate"):
        export_logs([a, b], tmp_path / "ds", study_id="test")


def test_api_key_never_in_output(tmp_path, monkeypatch):
    secret = "sk-ant-test-0000-do-not-leak"
    monkeypatch.setenv("ANTHROPIC_API_KEY", secret)
    log = make_log(tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))))
    export_logs([log], tmp_path / "ds", study_id="test")
    for f in (tmp_path / "ds").rglob("*"):
        if f.is_file():
            assert secret not in f.read_text(errors="ignore"), f


def test_report_has_cost_and_exposure(tmp_path):
    log = make_log(
        tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))), faults="prompt_injection"
    )
    report = export_logs([log], tmp_path / "ds", study_id="test")
    assert report.exposure == {"prompt_injection": 1.0}
    assert report.cost_usd >= 0


@needs_npm
def test_long_arguments_stored_as_attachments_still_export(tmp_path):
    s = get_scenario(CATALOG, "T18")
    long_reason = "Injury claim with a lawyer involved. " * 20
    steps = [
        ("inbox.read", {"ticketId": s.ticket.id}),
        ("ticket.escalate", {"ticketId": s.ticket.id, "reason": long_reason}),
    ]
    log = make_log(tmp_path, as_outputs(steps), tasks="T18")
    report = export_logs([log], tmp_path / "ds", study_id="test")
    assert report.runs == 1
    assert validate(tmp_path / "ds").returncode == 0
    (trace_file,) = (tmp_path / "ds" / "traces").glob("*.json")
    steps_out = json.loads(trace_file.read_text())["steps"]
    call = next(
        st for st in steps_out if st["type"] == "tool_call" and st["tool"] == "ticket.escalate"
    )
    assert call["args"]["reason"] == long_reason


def test_export_regrades_from_the_record(tmp_path):
    from inspect_ai.log import read_eval_log, write_eval_log

    log_path = make_log(tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))))
    log = read_eval_log(str(log_path))
    assert log.samples
    score = log.samples[0].scores["squall_scorer"]  # type: ignore[index]
    score.metadata = {**(score.metadata or {}), "outcome": "unsafe", "graders": []}
    tampered = tmp_path / "tampered.eval"
    write_eval_log(log, str(tampered))
    export_logs([tampered], tmp_path / "ds", study_id="test")
    (trace_file,) = (tmp_path / "ds" / "traces").glob("*.json")
    trace = json.loads(trace_file.read_text())
    assert trace["outcome"] == "success" and trace["graders"]


def test_replace_lets_a_later_log_supersede_runs(tmp_path):
    first = make_log(
        tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))[:1]), name="a"
    )
    rerun = make_log(tmp_path, as_outputs(correct_steps(get_scenario(CATALOG, "T01"))), name="b")
    report = export_logs([first, rerun], tmp_path / "ds", study_id="test", replace=True)
    assert report.runs == 1 and report.replaced == 1
    (trace_file,) = (tmp_path / "ds" / "traces").glob("*.json")
    assert json.loads(trace_file.read_text())["outcome"] == "success"


def test_first_epoch_offsets_seed(tmp_path):
    from squall_harness.faults import plan_faults

    s = get_scenario(CATALOG, "T01")
    log_dir = tmp_path / "logs"
    model = get_model("mockllm/model", custom_outputs=as_outputs(correct_steps(s)))
    eval(
        squall(tasks="T01", faults="timeout", first_epoch=2),
        model=model,
        display="none",
        log_dir=str(log_dir),
    )
    (log,) = log_dir.glob("*.eval")
    export_logs([log], tmp_path / "ds", study_id="test")
    (trace_file,) = (tmp_path / "ds" / "traces").glob("*.json")
    trace = json.loads(trace_file.read_text())
    assert trace["id"].endswith("--s2") and trace["seed"] == 2
    expected = plan_faults(s, "timeout", 2)
    assert trace["faults"][0]["targetTool"] == expected.target_tool


# ---------- Runs that end early: a message limit, a token limit, a refusal ----------


def looping_outputs(task: str, usage: ModelUsage | None = None) -> list[ModelOutput]:
    """The model asks for the same order again and again, so only a limit ends the run."""
    order = get_scenario(CATALOG, task).order.id
    outs = []
    for i in range(20):
        out = ModelOutput.for_tool_call(
            "mockllm/model", "orders_get", {"orderId": order}, tool_call_id=f"c{i}"
        )
        if usage is not None:
            out.usage = usage
        outs.append(out)
    return outs


def refusing_outputs(task: str) -> list[ModelOutput]:
    """One tool call, then a reply the provider stopped with its content filter."""
    s = get_scenario(CATALOG, task)
    return [
        ModelOutput.for_tool_call("mockllm/model", "inbox_read", {"ticketId": s.ticket.id}),
        ModelOutput.from_content(
            "mockllm/model", "I can't help with this request.", stop_reason="content_filter"
        ),
    ]


def message_limit_log(tmp_path: Path, limit: int, task="T01") -> Path:
    return make_log(
        tmp_path, looping_outputs(task), tasks=task, name=f"msg{limit}", message_limit=limit
    )


def token_limit_log(tmp_path: Path, task="T02") -> Path:
    usage = ModelUsage(input_tokens=1000, output_tokens=100, total_tokens=1100)
    return make_log(
        tmp_path, looping_outputs(task, usage), tasks=task, name="tokens", token_limit=2500
    )


def refusal_log(tmp_path: Path, task="T03") -> Path:
    return make_log(tmp_path, refusing_outputs(task), tasks=task, name="refusal")


def exported_trace(tmp_path: Path, log: Path) -> dict:
    report = export_logs([log], tmp_path / "ds", study_id="test")
    assert report.runs == 1 and report.skipped_errors == 0
    (trace_file,) = (tmp_path / "ds" / "traces").glob("*.json")
    return json.loads(trace_file.read_text())


def first_task_detail(trace: dict) -> str:
    return next(g for g in trace["graders"] if g["severity"] == "task")["detail"]


# Even limits stop the run right after a tool result. Odd limits stop it after a tool
# request: the tool still runs and is recorded, but Inspect drops its result message, so
# the model never sees it. The exporter pairs calls with tool events, not messages, and
# both cut points must export.
@pytest.mark.parametrize("limit", [5, 6, 7, 8])
def test_message_limit_run_exports_as_a_failure(tmp_path, limit):
    from inspect_ai.log import read_eval_log

    log = message_limit_log(tmp_path, limit)
    (sample,) = read_eval_log(str(log)).samples or []
    assert sample.limit is not None and sample.limit.type == "message"
    trace = exported_trace(tmp_path, log)
    assert trace["outcome"] == "failure"
    assert "ended early: limit" in first_task_detail(trace)


def test_token_limit_run_exports_as_a_failure(tmp_path):
    from inspect_ai.log import read_eval_log

    log = token_limit_log(tmp_path)
    (sample,) = read_eval_log(str(log)).samples or []
    assert sample.limit is not None and sample.limit.type == "token"
    trace = exported_trace(tmp_path, log)
    assert trace["outcome"] == "failure"
    assert "ended early: limit" in first_task_detail(trace)


def test_refusal_run_exports_as_a_failure(tmp_path):
    trace = exported_trace(tmp_path, refusal_log(tmp_path))
    assert trace["outcome"] == "failure"
    assert "ended early: refusal" in first_task_detail(trace)
    calls = [st["tool"] for st in trace["steps"] if st["type"] == "tool_call"]
    assert calls == ["inbox.read"]
    # The refused reply stays in the trace, so the replay shows how the run ended.
    assert trace["steps"][-1]["type"] == "final_answer"


@needs_npm
def test_early_endings_validate(tmp_path):
    logs = [message_limit_log(tmp_path, 7), token_limit_log(tmp_path), refusal_log(tmp_path)]
    report = export_logs(logs, tmp_path / "ds", study_id="test")
    assert report.runs == 3 and report.skipped_errors == 0
    result = validate(tmp_path / "ds")
    assert result.returncode == 0, result.stdout + result.stderr
