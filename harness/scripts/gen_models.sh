#!/usr/bin/env bash
# Generates src/squall_harness/models.py (or the path given as $1) from the
# committed JSON Schema contract in ../schema, so the Python models can never
# drift from the TypeScript zod schemas. Run after `npm run schema:export`.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$here/src/squall_harness/models.py}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
uv run --project "$here" python - "$here/../schema" "$tmp/contract.json" <<'PY'
import json, sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
def load(name):
    d = json.loads((src / name).read_text())
    d.pop("$id", None); d.pop("$schema", None)
    return d
docs = {"run": "run.schema.json", "runSummary": "run-summary.schema.json",
        "manifest": "manifest.schema.json", "catalog": "scenario-catalog.schema.json"}
contract = {"$schema": "https://json-schema.org/draft/2020-12/schema", "title": "SquallContract",
            "type": "object", "properties": {k: load(v) for k, v in docs.items()}}
dst.write_text(json.dumps(contract, indent=2))
PY
uv run --project "$here" datamodel-codegen \
  --input "$tmp/contract.json" --input-file-type jsonschema \
  --output "$out" --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.12 --reuse-model --use-title-as-name \
  --snake-case-field --allow-population-by-field-name \
  --extra-fields forbid --use-standard-collections --use-union-operator \
  --disable-timestamp --use-double-quotes --formatters ruff-format 2>/dev/null
# Format with fixed settings so the output is the same wherever it is written.
uv run --project "$here" ruff format --isolated --line-length 100 --config "format.skip-magic-trailing-comma = true" --quiet "$out"
