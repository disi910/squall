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


def test_haiku_estimate_uses_the_measured_trial_cost():
    # The Haiku trial measured about $0.0009 per run with prompt caching.
    assert cli.estimate_cost_per_run("claude-haiku-5-5") == pytest.approx(0.00092, abs=0.00002)


def test_unmeasured_models_price_haikus_tokens():
    sonnet = cli.estimate_cost_per_run("claude-sonnet-5-5")
    assert sonnet is not None and sonnet == pytest.approx(0.0171, abs=0.0001)
    # Opus costs exactly twice Sonnet on every token type.
    assert cli.estimate_cost_per_run("claude-opus-5-5") == pytest.approx(2 * sonnet)
    assert cli.estimate_cost_per_run("some-other-model") is None


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("anthropic/claude-haiku-5-5", ["about $0.15", "measured in the Haiku trial"]),
        ("anthropic/claude-sonnet-5-5", ["about $2.73", "may use more"]),
        ("openai/some-model", ["an unknown cost"]),
    ],
)
def test_confirmation_prints_the_estimate(monkeypatch, capsys, model, expected):
    monkeypatch.setattr("builtins.input", lambda prompt="": "")
    assert cli.main(["run", "--model", model, "--epochs", "1"]) == 1
    out = capsys.readouterr().out
    assert "before prompt caching" not in out
    for text in expected:
        assert text in out


def test_tiny_estimates_keep_their_digits(monkeypatch, capsys):
    monkeypatch.setattr("builtins.input", lambda prompt="": "")
    cli.main(["run", "--model", "anthropic/claude-haiku-5-5", "--tasks", "T01", "--faults", "none"])
    assert "about $0.0009" in capsys.readouterr().out


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


def test_design_is_passed_to_the_task(monkeypatch):
    started = {}
    monkeypatch.setattr(cli, "eval", lambda task, **kw: started.update(task=task) or [])
    argv = ["run", "--model", "mockllm/model", "--tasks", "T01", "--design", "plan_execute"]
    assert cli.main(argv) == 0
    assert started["task"].metadata["design"] == "plan_execute"
    assert started["task"].message_limit == 80


def test_design_estimate_warns_it_costs_more(monkeypatch, capsys):
    monkeypatch.setattr("builtins.input", lambda prompt="": "")
    argv = ["run", "--model", "anthropic/claude-haiku-5-5", "--design", "react_with_verifier"]
    assert cli.main(argv) == 1
    assert "react_with_verifier design adds scaffold calls" in capsys.readouterr().out
