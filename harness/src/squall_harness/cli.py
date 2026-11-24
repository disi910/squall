"""Command line: `squall-harness run` (with a cost confirmation) and `squall-harness export`.

A run against a real model prints the run count and an estimated cost, and starts
only after you type "yes" (or pass --yes). Inspect's mockllm model never asks.
"""

import argparse
import sys
from pathlib import Path

from inspect_ai import eval

from .export import export_logs
from .faults import FAULT_IDS
from .inspect_task import squall
from .scenarios import load_catalog

# Rough USD per run without prompt caching (about 41k input and 4k output tokens), from
# the price list cached on 2026-11-03. The trial measures the real figure.
EST_COST_PER_RUN = {
    "claude-haiku-5-5": 0.006,
    "claude-sonnet-5-5": 0.12,
    "claude-opus-5-5": 0.24,
}


def _count(value: str, universe: list[str], what: str) -> int:
    if value == "all":
        return len(universe)
    chosen = [v.strip() for v in value.split(",") if v.strip()]
    unknown = [v for v in chosen if v not in universe]
    if unknown:
        raise SystemExit(f"Unknown {what}: {', '.join(unknown)}")
    return len(chosen)


def _confirm(model: str, runs: int, assume_yes: bool) -> bool:
    model_id = model.split("/", 1)[-1]
    per_run = EST_COST_PER_RUN.get(model_id)
    estimate = f"about ${per_run * runs:.2f}" if per_run is not None else "an unknown cost"
    print(f"{runs} runs on {model}: {estimate} (estimate, before prompt caching).")
    if assume_yes:
        return True
    return input('This calls a paid API. Type "yes" to start: ').strip().lower() == "yes"


def cmd_run(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    n_tasks = _count(args.tasks, [s.id for s in catalog.scenarios], "task")
    n_faults = _count(args.faults, ["none", *FAULT_IDS], "fault")
    runs = n_tasks * n_faults * args.epochs
    if not args.model.startswith("mockllm/") and not _confirm(args.model, runs, args.yes):
        print("Not started.")
        return 1
    eval(
        squall(tasks=args.tasks, faults=args.faults),
        model=args.model,
        epochs=args.epochs,
        log_dir=args.log_dir,
    )
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    featured = [f.strip() for f in args.featured.split(",") if f.strip()] if args.featured else None
    report = export_logs(
        [Path(p) for p in args.logs],
        Path(args.out),
        study_id=args.study,
        featured=featured,
        replace=args.replace,
    )
    print(f"study: {report.study_id}")
    print(f"runs: {report.runs}")
    print(f"skipped (errored samples): {report.skipped_errors}")
    print(f"skipped tool calls to unknown tools: {report.skipped_unknown_tool_calls}")
    if report.replaced:
        print(f"replaced by later logs: {report.replaced}")
    print(f"estimated cost: ${report.cost_usd:.4f}")
    for fault, share in sorted(report.exposure.items()):
        print(f"exposure {fault}: {share:.0%}")
    print(f"Validate with: npm run validate:dataset -- {args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="squall-harness", description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Run the Squall grid with Inspect.")
    run.add_argument("--model", required=True, help="e.g. anthropic/claude-haiku-5-5")
    run.add_argument("--epochs", type=int, default=1, help="Seeds per task and fault.")
    run.add_argument("--tasks", default="all", help="Comma-separated task ids, or 'all'.")
    run.add_argument("--faults", default="all", help="Comma-separated faults ('none' = baseline).")
    run.add_argument("--log-dir", default="logs", help="Where Inspect writes its logs.")
    run.add_argument("--yes", action="store_true", help="Skip the cost confirmation.")
    run.set_defaults(func=cmd_run)

    exp = sub.add_parser("export", help="Export Inspect logs as a Squall dataset.")
    exp.add_argument("logs", nargs="+", help="Inspect .eval log files.")
    exp.add_argument("--out", required=True, help="Dataset folder to write.")
    exp.add_argument("--study", required=True, help="Study id, e.g. haiku-trial.")
    exp.add_argument("--featured", help="Comma-separated run ids to feature on the site.")
    exp.add_argument(
        "--replace", action="store_true", help="Let later logs replace runs from earlier ones."
    )
    exp.set_defaults(func=cmd_export)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
