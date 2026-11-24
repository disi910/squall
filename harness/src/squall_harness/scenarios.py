"""Loads the shared scenario catalog (scenarios/catalog.json) into the generated models."""

import json
from pathlib import Path

from .models import Scenario, ScenarioCatalog

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOG_PATH = REPO_ROOT / "scenarios" / "catalog.json"


def load_catalog(path: Path | None = None) -> ScenarioCatalog:
    """Reads and validates the catalog. Defaults to the repository's shared copy."""
    return ScenarioCatalog.model_validate(json.loads((path or CATALOG_PATH).read_text("utf-8")))


def get_scenario(catalog: ScenarioCatalog, task_id: str) -> Scenario:
    """Returns the scenario with this id; raises KeyError for an unknown id."""
    for s in catalog.scenarios:
        if s.id == task_id:
            return s
    raise KeyError(task_id)
