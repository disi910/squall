"""Command line: `squall-harness run` (with a cost confirmation) and `squall-harness export`.

A run against a real model prints the run count and an estimated cost, and starts
only after you type "yes" (or pass --yes). Inspect's mockllm model never asks.
"""

import argparse
import sys
from pathlib import Path

from inspect_ai import eval

from .export import PRICES, export_logs
from .faults import FAULT_IDS
from .inspect_task import DESIGNS, squall
from .scenarios import load_catalog

# Average tokens per run measured in the Haiku trial (datasets/haiku-trial: 483 runs,
# prompt caching on): uncached input, output, cache read, cache write, in the order of
# export.PRICES. Priced at Haiku's rates this is about $0.0009 per run, the trial's figure.
MEASURED_ON = "claude-haiku-5-5"
MEASURED_TOKENS_PER_RUN = (13, 1186, 13967, 1515)


def estimate_cost_per_run(model_id: str) -> float | None:
    """USD per run: the trial's measured token use at this model's prices, if it has any."""
    price = PRICES.get(model_id)
    if price is None:
        return None
    return sum(t * p for t, p in zip(MEASURED_TOKENS_PER_RUN, price, strict=True)) / 1_000_000


def _usd(amount: float) -> str:
    """Two decimals, or enough digits that a small run doesn't read as $0.00."""
    return f"${amount:.2f}" if amount >= 0.01 else f"${amount:.4f}"


def _count(value: str, universe: list[str], what: str) -> int:
    if value == "all":
        return len(universe)
    chosen = [v.strip() for v in value.split(",") if v.strip()]
    unknown = [v for v in chosen if v not in universe]
    if unknown:
        raise SystemExit(f"Unknown {what}: {', '.join(unknown)}")
    return len(chosen)


def _confirm(model: str, runs: int, assume_yes: bool, design: str = "react") -> bool:
    model_id = model.split("/", 1)[-1]
    per_run = estimate_cost_per_run(model_id)
    if per_run is None:
        print(f"{runs} runs on {model}: an unknown cost.")
    elif model_id == MEASURED_ON:
        print(
            f"{runs} runs on {model}: about {_usd(per_run * runs)} "
            "(estimate from the token use measured in the Haiku trial, with prompt caching)."
        )
    else:
        print(
            f"{runs} runs on {model}: about {_usd(per_run * runs)} (estimate: the token use "
            "measured in the Haiku trial at this model's prices; a larger model may use more)."
        )
    if per_run is not None and design != "react":
        print(f"The {design} design adds scaffold calls, so expect it to cost more than that.")
    if assume_yes:
        return True
    return input('This calls a paid API. Type "yes" to start: ').strip().lower() == "yes"


def cmd_run(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    n_tasks = _count(args.tasks, [s.id for s in catalog.scenarios], "task")
    n_faults = _count(args.faults, ["none", *FAULT_IDS], "fault")
    runs = n_tasks * n_faults * args.epochs
    real = not args.model.startswith("mockllm/")
    if real and not _confirm(args.model, runs, args.yes, args.design):
        print("Not started.")
        return 1
    eval(
        squall(
            tasks=args.tasks,
            faults=args.faults,
            first_epoch=args.first_epoch,
            design=args.design,
        ),
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
    run.add_argument(
        "--first-epoch",
        type=int,
        default=1,
        help="Seed of the first epoch (e.g. 2 to add seeds 2+).",
    )
    run.add_argument(
        "--design",
        choices=DESIGNS,
        default="react",
        help="Reference agent design (default: react).",
    )
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
