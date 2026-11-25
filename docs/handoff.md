# Squall: handoff for the next session

Updated 2026-11-25. Read this first, then the files in "Read these to get the full picture". The original brief for the mockup phase is [`HANDOFF.md`](../HANDOFF.md) at the repository root; this file supersedes it as the current handoff.

## What Squall is

A fault-injection test bench for tool-using LLM agents, and the owner's portfolio flagship. It runs an agent against a simulated order-support desk for a fictional shop (Nordlys Supply), injects realistic faults into tool results, grades every run deterministically in code, and records each run as a trace that can be replayed step by step on the website.

- **Live site:** https://squall-zeta.vercel.app. Vercel deploys `main` on every push.
- **Repository:** https://github.com/disi910/squall (public). CI runs site checks and a harness job on pushes to `main` and on pull requests.

## Current state

**Done and merged** (PRs disi910/squall#1, #2 and #3):

1. **The website** (React 19, Vite 8, TypeScript 7, Tailwind v4, zod 4).
   - **Pages:** overview, leaderboard, robustness matrix, run explorer, step-by-step replay, task catalog, report.
   - **Data:** it builds from a committed dataset. Every number is computed from the runs, and the wording follows the data (simulated vs real).
   - **Hardening:** strict security headers and a Content-Security-Policy.
2. **The Python harness** (`harness/`: uv, Python 3.12, UK AISI's Inspect).
   - **Core:** the shared scenario catalog, a world with recorded diffs, 9 tools, a seeded fault layer (7 faults), deterministic graders and a support handbook.
   - **Inspect layer:** runs a ReAct agent. An exporter turns Inspect logs into the Squall data format and regrades from the recorded calls.
   - **CLI:** asks before any paid run.
3. **The real trial:** Claude Haiku 5.5, 480 runs (20 tasks × 8 fault settings × 3 seeds), about $0.45 in total.
   - 394 of 480 succeeded.
   - Silent failure succeeded in 0 of 60.
   - Injection was resisted in 60 of 60, with no safety violations.
   - The setup is frozen at `9e405eb`, with the final review's fixes at `047b21d`.

**Deferred:**
- **Sonnet 5.5 and Opus 5.5:** deferred for cost. The roadmap now runs them on environment v2 instead (Phase 6).
- **A small backlog:** listed in Phase 0 of the roadmap and in `docs/known-gaps.md`.

## Read these to get the full picture

In this order:

| File                                                                                                                       | Why                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`docs/roadmap.md`](roadmap.md)                                                                                            | **The plan from here**: the assessment of the owner's four questions (realism, models vs agents, the user, failure modes) and the ordered phases.        |
| [`docs/decisions/0001-direction-and-primary-user.md`](decisions/0001-direction-and-primary-user.md) | The owner's Phase 1 decisions: two tracks, and teams building operations agents as the primary user. |
| [`README.md`](../README.md)                                                                                                | What the site and harness do, how to run them, and the key design decisions.                                                                          |
| [`datasets/haiku-trial/REVIEW.md`](../datasets/haiku-trial/REVIEW.md)                                                      | The trial's setup, cost, outcomes, the hand check of 40 replies, and **every bug fixed before publishing**: the best record of how the grading rules came to be. |
| [`docs/superpowers/specs/2026-11-24-python-harness-design.md`](superpowers/specs/2026-11-24-python-harness-design.md)      | The approved design of the harness phase, with its amendments.                                                                                         |
| [`schema/README.md`](../schema/README.md)                                                                                  | The data contract (schema 0.3.0): the rules JSON Schema can't express, the metric definitions, the escalation policy, the versioning.                  |
| [`harness/README.md`](../harness/README.md)                                                                                | Setting up and running the harness, exporting and validating datasets.                                                                                 |
| [`docs/known-gaps.md`](known-gaps.md)                                                                                      | Controls with nothing to do yet, hidden sections, deliberate limits, and the fixed stale-deploy bug.                                                     |
| [`harness/src/squall_harness/policy.py`](../harness/src/squall_harness/policy.py)                                          | The handbook the model sees. Changing it changes results: it is part of the frozen setup.                                                               |
| [`harness/src/squall_harness/graders.py`](../harness/src/squall_harness/graders.py)                                        | How runs are judged, including the escalation rule (escalate once the agent has seen the order record and the carrier disagree).                        |
| [`scenarios/catalog.json`](../scenarios/catalog.json)                                                                      | The 20 tasks, their worlds, expected replies, private values and per-fault data. Shared by TypeScript and Python.                                       |

Useful code entry points:
- `harness/src/squall_harness/` (`faults.py`, `tools.py`, `inspect_task.py`, `export.py`, `cli.py`)
- `src/schema/` (the zod schemas, the source of truth)
- `src/data/analysis.ts` and `src/metrics/` (every number on the site)
- `src/content/copy.ts` and `src/content/banner.ts` (wording that depends on the data)

## The next step

1. **Phase 0, item 1 is done:** the stale-deploy error. A page script that fails to load now reloads the page once (`src/reloadOnce.ts`).
2. **Phase 0, items 3 to 5 are done:** the CLI's cost estimate uses the Haiku trial's measured token use; exporting runs that end early (a limit or a refusal) is tested; and the site's copy takes the model names and counts from the manifest.
3. **The rest of Phase 0:** item 2, required CI checks on `main`, is the owner's GitHub setting.
4. **Phase 1 is done:** two tracks, with teams building operations agents as the primary user ([`decisions/0001`](decisions/0001-direction-and-primary-user.md)).
5. **Next, Phase 2:** add ReAct with a verifier and plan-and-execute as Inspect agents, built and tested with `mockllm` first. Each 480-run Haiku batch (about $0.45) needs the owner's go-ahead.

## Working rules (from the owner)

- **Explain choices before building.** Work in small milestones and stop for the owner's review after each one. No silent scope creep. American English. Commit messages in the imperative mood, ending with the attribution trailer.
- **Never make a paid API call without the owner's explicit go-ahead for that batch.**
  - The key is in the git-ignored `harness/.env`. Never read or print it.
  - Haiku costs about $0.001 per run with caching.
- **Freeze the setup before a paid batch.** After seeing results, only bug fixes are allowed. Grading fixes need no rerun, because the exporter regrades from recorded calls. Anything the model sees (the handbook, tool output, fault data) does need a rerun.
- **Commits to this public repo use the GitHub noreply address** (already set in the repo's git config).
- **`main` deploys to production.** Work on a branch and merge through a pull request. The repo has no required checks yet, so `gh pr merge --auto` merges immediately: run the full CI sequence locally first, or wait until both CI jobs pass.
- **Don't add features or change the look unless asked.** The owner asked for robustness and polish only in the last session.

## Commands

From the repository root:

```bash
npm ci && npm test
```

```bash
npm run dataset:use -- datasets/haiku-trial && npm run build && npm run preview
```

```bash
npm run validate:dataset -- datasets/haiku-trial
```

From `harness/`:

```bash
uv sync && uv run pytest -q
```

```bash
uv run ruff check && uv run ruff format --check && uv run pyright
```

A paid run (only with the owner's go-ahead):

```bash
uv run squall-harness run --model anthropic/claude-haiku-5-5 --epochs 1 --log-dir logs/<study>
```

Export, merging logs and letting later ones replace earlier runs:

```bash
uv run squall-harness export logs/<study>/*.eval --out ../datasets/<study> --study <study> --replace
```

The full CI sequence to run before merging:
- **Site:** format check, typecheck, lint, `npm test`, `npm run generate && npm run build`, `validate:dataset`, and a build from the committed dataset.
- **Harness:** `uv sync --locked`, ruff, pyright, pytest.

## Gotchas

- **Local Node is 20.20.** Check package engine ranges before installing; several current majors need Node 22. CI uses Node 22.
- **`public/data/` is git-ignored.** `npm run generate` fills it with the mock dataset, and `npm run dataset:use` with a real one. The site's banner wording is baked in at build time from whichever dataset is there.
- **After a zod schema change:** run `npm run schema:export`, then `bash harness/scripts/gen_models.sh`. A test fails if either is stale.
- **Inspect stores long strings as log attachments.** The exporter resolves them; keep it that way.
- **Tool names:** Inspect can't use dots, so `inbox.read` becomes `inbox_read` there, and the exporter maps them back.
