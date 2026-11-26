# Squall harness

Runs real models as ReAct agents against Squall's simulated order-support desk, injects faults into tool results, grades every run in code, and exports datasets in the Squall data format that the website reads.

- **Squall core** (no Inspect imports): the shared scenario catalog ([`../scenarios/catalog.json`](../scenarios/catalog.json)), the world with recorded diffs, the 9 tools, the seeded fault layer and the graders, in [`src/squall_harness/`](src/squall_harness/).
- **Inspect layer** ([`inspect_task.py`](src/squall_harness/inspect_task.py)): one sample per task and fault setting, epochs as seeds, Inspect's `react()` agent without a submit tool, reasoning effort `medium`, prompt caching on.
- **Export** ([`export.py`](src/squall_harness/export.py)): Inspect logs to `manifest.json`, `runs.json` and `traces/`. Check the result with the TypeScript validator before publishing.

## Setup

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12 (uv installs it if needed).

```bash
cd harness
```

```bash
uv sync
```

For real runs, put your Anthropic API key in `harness/.env` (copy `.env.example`; the file is git-ignored), or sign in with `ant auth login`. The harness never prints or stores the key.

## Run

Every run against a real model prints the run count and an estimated cost, and starts only after you type `yes`. Setting a spend limit in the Anthropic Console is a good second guard.

```bash
uv run squall-harness run --model anthropic/claude-haiku-5-5 --epochs 1 --log-dir logs/haiku-trial
```

Limit the grid with `--tasks T01,T02` and `--faults none,timeout`. Inspect's log viewer works on the logs: `uv run inspect view --log-dir logs/haiku-trial`.

Choose a reference agent design with `--design`:

- `react` (the default): Inspect's ReAct loop.
- `react_with_verifier`: the same loop, plus one verification turn.
- `plan_execute`: a planner, the ReAct loop as executor and a replanner.

All three share the handbook, tools, faults and graders. [The design spec](../docs/superpowers/specs/2026-11-26-agent-designs.md) has their exact prompts and limits. The export names each run after its design (`claude-haiku-5-5__plan_execute--T01--none--s1`), so logs from several designs merge into one dataset.

## Export and validate

```bash
uv run squall-harness export logs/haiku-trial/*.eval --out ../datasets/haiku-trial --study haiku-trial
```

```bash
npm run validate:dataset -- datasets/haiku-trial
```

The export prints the run count, skipped samples, the estimated cost and how often each fault actually reached the agent.

## Development

```bash
uv run pytest -q
```

```bash
uv run ruff check && uv run ruff format --check && uv run pyright
```

Tests use scripted agents and Inspect's `mockllm` model: no API key, no cost. After changing a zod schema, run `npm run schema:export` at the repository root, then `bash scripts/gen_models.sh` here; a test fails if the generated models are out of date.

## What is real and what is simulated

The agents are real models making real decisions. The world, the tools and the faults are simulated. Fault plans are seeded, so every run meets the same fault again, but model outputs are not reproducible: these models do not accept a temperature setting, so seeds are repeated trials, and the confidence intervals capture the variation.
