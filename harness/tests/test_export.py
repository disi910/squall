import json
import shutil
import subprocess
from pathlib import Path

import pytest
from inspect_ai import eval
from inspect_ai.model import ChatMessageAssistant, ModelOutput, get_model
from inspect_ai.tool import ToolCall
from scripted import CATALOG, as_outputs, correct_steps

from squall_harness.export import export_logs
from squall_harness.inspect_task import squall
from squall_harness.scenarios import get_scenario

REPO = Path(__file__).resolve().parents[2]


def make_log(tmp_path: Path, outputs, tasks="T01", faults="none", name="log") -> Path:
    log_dir = tmp_path / name
    model = get_model("mockllm/model", custom_outputs=outputs)
    eval(
        squall(tasks=tasks, faults=faults),
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
