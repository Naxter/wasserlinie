from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .config import FORECAST_HOURS, FORECAST_STEP_HOURS, Paths, log
from .forecast import (
    BAND_COVERAGE,
    LOOKBACK,
    MODEL_VERSION,
    QUANTILES,
    calibrate,
    features_at,
    fit,
    standardise,
    training_set,
)
from .grid import hourly_index, level_matrix, load_stations

# Does the forecast earn the uncertainty band it draws?
#
# The stored history is cut into three: the model trains on the first part,
# calibrates its band on the second and is judged on a third it has never seen.
# That mirrors what `wasserlinie forecast` ships. Two numbers matter: the median
# error, and coverage — the share of observations inside p10..p90, which should
# sit near BAND_COVERAGE. Much less and the band lies by being too narrow; much
# more and it is too wide to say anything.

TRAIN_FRACTION = 0.6
CALIBRATION_FRACTION = 0.15
ORIGIN_STRIDE_HOURS = 6


def evaluate(
    models: dict[float, Any],
    z: np.ndarray,
    std: np.ndarray,
    hours: np.ndarray,
    start: int,
    widening: dict[int, float],
) -> pd.DataFrame:
    rows = []
    for origin in range(start, z.shape[1] - FORECAST_STEP_HOURS, ORIGIN_STRIDE_HOURS):
        for lead in range(FORECAST_STEP_HOURS, FORECAST_HOURS + 1, FORECAST_STEP_HOURS):
            target = origin + lead
            if target >= z.shape[1]:
                break
            x = features_at(z, hours, origin, lead)
            truth = z[:, target]
            ok = ~np.isnan(x).any(axis=1) & ~np.isnan(truth) & ~np.isnan(std)
            if not ok.any():
                continue
            preds = np.column_stack([models[q].predict(x[ok]) for q in QUANTILES])
            preds.sort(axis=1)
            k = widening.get(lead, 1.0)
            preds[:, 0] = preds[:, 1] - (preds[:, 1] - preds[:, 0]) * k
            preds[:, 2] = preds[:, 1] + (preds[:, 2] - preds[:, 1]) * k
            base = z[ok, origin]
            scale = std[ok]
            rows.append(
                pd.DataFrame(
                    {
                        "lead": lead,
                        # back to centimetres so the error is readable
                        "p10": (base + preds[:, 0]) * scale,
                        "p50": (base + preds[:, 1]) * scale,
                        "p90": (base + preds[:, 2]) * scale,
                        "truth": truth[ok] * scale,
                        "persistence": base * scale,
                    }
                )
            )
    return pd.concat(rows, ignore_index=True)


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.assign(
        error=(df["p50"] - df["truth"]).abs(),
        naive=(df["persistence"] - df["truth"]).abs(),
        covered=(df["truth"] >= df["p10"]) & (df["truth"] <= df["p90"]),
        width=df["p90"] - df["p10"],
    )
    out = df.groupby("lead").agg(
        samples=("error", "size"),
        mae_cm=("error", "mean"),
        persistence_mae_cm=("naive", "mean"),
        coverage=("covered", "mean"),
        band_width_cm=("width", "mean"),
    )
    out["skill_vs_persistence"] = 1 - out["mae_cm"] / out["persistence_mae_cm"]
    return out.round(3)


def report(summary: pd.DataFrame, meta: dict[str, Any]) -> str:
    useful = summary.index[summary["skill_vs_persistence"] > 0.05]
    horizon = f"+{max(useful)} h" if len(useful) else "under +3 h"
    lines = [
        "# Forecast skill",
        "",
        f"Model `{meta['model']}`. Reproduce with `python -m wasserlinie backtest`.",
        "",
        f"Trained on {meta['train_hours']} hours, band calibrated on the next {meta['calib_hours']}, then",
        f"judged on {meta['test_hours']} hours it had never seen, across {meta['stations']} inland gauges",
        f"({meta['samples']} forecast/observation pairs).",
        "",
        "Tidal gauges get no forecast at all: the model has no tide features, and a hindcast put",
        "its error there near a metre with the band covering 31% of observations.",
        "",
        "`skill vs persistence` compares the median forecast against assuming the level simply stays",
        "where it is. Positive means the model adds something, zero or below means it does not. On",
        f"this history it stops adding anything beyond about **{horizon}**.",
        "",
        f"Coverage is the share of observations inside p10..p90 and should sit near {meta['target']:.2f}.",
        "",
        "| lead | MAE (cm) | persistence MAE (cm) | skill | coverage | band width (cm) |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for lead, row in summary.iterrows():
        lines.append(
            f"| +{lead} h | {row['mae_cm']:.1f} | {row['persistence_mae_cm']:.1f} | "
            f"{row['skill_vs_persistence']:+.2f} | {row['coverage']:.2f} | {row['band_width_cm']:.1f} |"
        )
    lines += [
        "",
        f"Generated {meta['generated']} from {meta['history_days']} days of stored history. The window",
        "is short because PEGELONLINE only serves about a month; it grows as the daily refresh",
        "accumulates, and these numbers are worth re-checking when it does.",
        "",
    ]
    return "\n".join(lines)


def run(paths: Paths) -> None:
    stations = load_stations(paths)
    levels = pd.read_parquet(paths.levels)
    levels["ts"] = pd.to_datetime(levels["ts"], utc=True)
    index = hourly_index(levels["ts"].min(), levels["ts"].max())
    z, _, std = standardise(level_matrix(levels, stations, index))
    hours = index.hour.to_numpy()

    tidal = np.array([s.get("ref") == "tidal" for s in stations])
    z[tidal] = np.nan

    train_end = int(len(index) * TRAIN_FRACTION)
    calib_end = train_end + int(len(index) * CALIBRATION_FRACTION)
    if train_end <= LOOKBACK + FORECAST_HOURS or calib_end >= len(index) - FORECAST_STEP_HOURS:
        raise SystemExit("not enough stored history to hold out a test period yet")
    log.info("train 0..%d, calibrate ..%d, test ..%d", train_end, calib_end, len(index))

    models = fit(*training_set(z[:, :train_end], hours[:train_end]))
    widening = calibrate(models, z[:, :calib_end], hours[:calib_end], train_end)
    df = evaluate(models, z, std, hours, calib_end, widening)
    summary = summarise(df)
    log.info("\n%s", summary.to_string())

    meta = {
        "model": MODEL_VERSION,
        "generated": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
        "train_hours": train_end,
        "calib_hours": calib_end - train_end,
        "test_hours": len(index) - calib_end,
        "stations": int((np.isfinite(std) & ~tidal).sum()),
        "samples": int(len(df)),
        "target": BAND_COVERAGE,
        "history_days": round((index[-1] - index[0]).total_seconds() / 86400, 1),
    }
    out = paths.out.parent.parent / "docs" / "forecast-skill.md"
    out.write_text(report(summary, meta), encoding="utf-8")
    log.info("wrote %s", out)

    worst = summary["coverage"].min()
    if abs(worst - BAND_COVERAGE) > 0.1:
        log.warning("coverage drops to %.2f, the band still misstates itself", worst)
