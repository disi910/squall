from pathlib import Path

import pytest
from scripted import CATALOG, as_outputs, correct_steps

from squall_harness import cli
from squall_harness.scenarios import get_scenario


def no_input(prompt: str = "") -> str:
    raise AssertionError("asked for confirmation")


def test_run_requires_confirmation_for_real_model(monkeypatch, capsys):
    def fail(*a, **k):
        raise AssertionError("eval started without confirmation")

    monkeypatch.setattr(cli, "eval", fail)
    monkeypatch.setattr("builtins.input", lambda prompt="": "")
    code = cli.main(["run", "--model", "anthropic/claude-haiku-5-5", "--epochs", "1"])
    assert code == 1
    out = capsys.readouterr().out
    assert "160 runs" in out and "$" in out


def test_confirmed_real_run_starts_eval(monkeypatch):
    started = {}
    monkeypatch.setattr(cli, "eval", lambda task, **kw: started.update(kw) or [])
    monkeypatch.setattr("builtins.input", lambda prompt="": "yes")
    code = cli.main(
        ["run", "--model", "anthropic/claude-haiku-5-5", "--epochs", "1", "--tasks", "T01"]
    )
    assert code == 0 and started["model"] == "anthropic/claude-haiku-5-5" and started["epochs"] == 1


def test_mockllm_needs_no_confirmation(monkeypatch):
    started = {}
    monkeypatch.setattr(cli, "eval", lambda task, **kw: started.update(kw) or [])
    monkeypatch.setattr("builtins.input", no_input)
    assert cli.main(["run", "--model", "mockllm/model", "--epochs", "2", "--tasks", "T01"]) == 0
    assert started["epochs"] == 2


def test_unknown_task_is_an_error(capsys):
    with pytest.raises(SystemExit):
        cli.main(["run", "--model", "mockllm/model", "--tasks", "T99"])


def test_export_prints_report(tmp_path: Path, capsys):
    from inspect_ai import eval
    from inspect_ai.model import get_model

    from squall_harness.inspect_task import squall

    outs = as_outputs(correct_steps(get_scenario(CATALOG, "T01")))
    eval(
        squall(tasks="T01", faults="none"),
        model=get_model("mockllm/model", custom_outputs=outs),
        display="none",
        log_dir=str(tmp_path / "logs"),
    )
    (log,) = (tmp_path / "logs").glob("*.eval")
    code = cli.main(["export", str(log), "--out", str(tmp_path / "ds"), "--study", "t"])
    assert code == 0
    out = capsys.readouterr().out
    assert "runs: 1" in out and (tmp_path / "ds" / "manifest.json").exists()


def test_first_epoch_is_passed_to_the_task(monkeypatch):
    started = {}
    monkeypatch.setattr(cli, "eval", lambda task, **kw: started.update(task=task, **kw) or [])
    assert (
        cli.main(
            [
                "run",
                "--model",
                "mockllm/model",
                "--tasks",
                "T01",
                "--epochs",
                "2",
                "--first-epoch",
                "2",
            ]
        )
        == 0
    )
    assert started["epochs"] == 2
    assert started["task"].metadata["first_epoch"] == 2
