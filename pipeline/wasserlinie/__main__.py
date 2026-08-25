from __future__ import annotations

import argparse
import logging
import sys

from . import archive, backtest, daily, fetch, forecast, rivers
from .config import Paths

STEPS = {
    "fetch": fetch.run,
    "rivers": rivers.run,
    "forecast": forecast.run,
    "backtest": backtest.run,
    "history": archive.run,
    "history-grid": daily.run,
}
# `backtest` is deliberately not part of `all`: it retrains the model and is
# something you run when you want to know whether the forecast is any good.
# `history-grid` is, because it is quick and reads what `history` already
# downloaded — but it is skipped when there is no archive to read.
ORDER = ["fetch", "rivers", "forecast", "history-grid"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="wasserlinie", description="Build the data assets for the app.")
    parser.add_argument("step", choices=[*STEPS, "all"], help="which step to run")
    parser.add_argument("--out", help="output directory (default: public/data in the repo)")
    parser.add_argument("--cache", help="download cache (default: pipeline/cache)")
    parser.add_argument("--days", type=int, default=31, help="days of readings to request (fetch)")
    parser.add_argument("--workers", type=int, default=6, help="parallel requests (fetch)")
    parser.add_argument("--only", help="restrict to gauges whose name contains this (history)")
    parser.add_argument("--limit", type=int, help="stop after this many gauges (history)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    kwargs = {}
    if args.out:
        kwargs["out"] = args.out
    if args.cache:
        kwargs["cache"] = args.cache
    paths = Paths(**kwargs)

    steps = ORDER if args.step == "all" else [args.step]
    log = logging.getLogger("wasserlinie")
    for name in steps:
        # A first run has no archive yet, and `all` must still work without one.
        if name == "history-grid" and args.step == "all" and not paths.history.exists():
            log.info("== history-grid skipped, no archive yet (run `wasserlinie history` for the long view)")
            continue
        log.info("== %s", name)
        if name == "fetch":
            fetch.run(paths, days=args.days, workers=args.workers)
        elif name == "history":
            archive.run(paths, limit=args.limit, only=args.only)
        else:
            STEPS[name](paths)
    return 0


if __name__ == "__main__":
    sys.exit(main())
