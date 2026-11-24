import subprocess
from pathlib import Path

import pytest

from squall_harness.scenarios import get_scenario, load_catalog

HARNESS = Path(__file__).resolve().parents[1]


def test_catalog_loads_20_scenarios():
    assert len(load_catalog().scenarios) == 20


def test_get_scenario_T01_refund_is_289():
    assert get_scenario(load_catalog(), "T01").refund == 289


def test_unknown_task_raises_KeyError():
    with pytest.raises(KeyError):
        get_scenario(load_catalog(), "T99")


def test_models_up_to_date(tmp_path):
    out = tmp_path / "models.py"
    subprocess.run(["bash", str(HARNESS / "scripts" / "gen_models.sh"), str(out)], check=True)
    assert out.read_text() == (HARNESS / "src" / "squall_harness" / "models.py").read_text()
