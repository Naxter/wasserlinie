from __future__ import annotations

import json
import warnings
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from . import anomaly
from .config import FORECAST_HOURS, FORECAST_STEP_HOURS, Paths, log
from .grid import hourly_index, level_matrix, load_stations

# One deliberately simple model: gradient boosting on the recent shape of the
# level curve plus the lead time, trained across all gauges at once. Levels are
# standardised per station so a canal and the Rhine share one model. It has to
# be honest, not good — the uncertainty band is the point.
# Bump this whenever features, quantiles or hyper-parameters change; the app
# shows it next to the run, so an old forecast can never be mistaken for a new one.
MODEL_VERSION = "gbq-1"
QUANTILES = (0.1, 0.5, 0.9)
TRAIN_LEADS = (3, 6, 12, 24, 48, 72)
LAGS = (3, 6, 12, 24, 72)
LOOKBACK = max(LAGS)
TRAIN_STRIDE_HOURS = 6
KEEP_RUNS = 5


def standardise(cm: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-station z-scores plus the mean and std needed to map predictions back to cm."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        mean = np.nanmean(cm, axis=1)
        std = np.nanstd(cm, axis=1)
    std = np.where(std > 1.0, std, np.nan)  # a flat month gives no signal to learn from
    return (cm - mean[:, None]) / std[:, None], mean, std


def features_at(z: np.ndarray, hours: np.ndarray, t: int, lead: float) -> np.ndarray:
    """Feature rows for every station at hour index `t` for one lead. Shape (stations, features)."""
    r = z[:, t]
    cols = [r]
    cols.extend(r - z[:, t - lag] for lag in LAGS)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        cols.append(np.nanstd(z[:, t - 24 : t + 1], axis=1))
    cols.append(np.full_like(r, np.sin(2 * np.pi * hours[t] / 24)))
    cols.append(np.full_like(r, np.cos(2 * np.pi * hours[t] / 24)))
    cols.append(np.full_like(r, lead))
    return np.column_stack(cols)


def training_set(z: np.ndarray, hours: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    n_hours = z.shape[1]
    for lead in TRAIN_LEADS:
        for t in range(LOOKBACK, n_hours - lead, TRAIN_STRIDE_HOURS):
            x = features_at(z, hours, t, lead)
            y = z[:, t + lead] - z[:, t]
            ok = ~np.isnan(x).any(axis=1) & ~np.isnan(y)
            xs.append(x[ok])
            ys.append(y[ok])
    return np.vstack(xs), np.concatenate(ys)


def fit(x: np.ndarray, y: np.ndarray) -> dict[float, HistGradientBoostingRegressor]:
    models = {}
    for q in QUANTILES:
        m = HistGradientBoostingRegressor(
            loss="quantile",
            quantile=q,
            max_iter=250,
            learning_rate=0.06,
            max_leaf_nodes=31,
            min_samples_leaf=40,
            random_state=7,
        )
        m.fit(x, y)
        models[q] = m
    return models


def predict(
    models: dict[float, HistGradientBoostingRegressor],
    z: np.ndarray,
    mean: np.ndarray,
    std: np.ndarray,
    hours: np.ndarray,
    stations: list[dict[str, Any]],
    issued: pd.Timestamp,
) -> pd.DataFrame:
    t = z.shape[1] - 1
    rows = []
    for lead in range(FORECAST_STEP_HOURS, FORECAST_HOURS + 1, FORECAST_STEP_HOURS):
        x = features_at(z, hours, t, lead)
        ok = ~np.isnan(x).any(axis=1)
        if not ok.any():
            continue
        preds = np.column_stack([models[q].predict(x[ok]) for q in QUANTILES])
        preds.sort(axis=1)  # crossing quantiles are a known GBM artefact; keep p10 <= p50 <= p90
        base = z[ok, t]
        for i, si in enumerate(np.flatnonzero(ok)):
            cm = (base[i] + preds[i]) * std[si] + mean[si]
            rows.append(
                {
                    "station": stations[si]["uuid"],
                    "ts": issued + pd.Timedelta(hours=lead),
                    "p10": float(cm[0]),
                    "p50": float(cm[1]),
                    "p90": float(cm[2]),
                }
            )
    df = pd.DataFrame(rows)
    for c in ("p10", "p50", "p90"):
        df[c] = df[c].astype("float32")
    df = df.sort_values(["station", "ts"]).reset_index(drop=True)
    # The forecast is ranked against the same reference curve as the
    # measurements, so a predicted level is unusual by the same yardstick.
    curves = anomaly.station_curves(stations)
    station_col = df["station"].to_numpy()
    for column, source in (("rank", "p50"), ("rankLow", "p10"), ("rankHigh", "p90")):
        df[column] = anomaly.ranks_for(curves, station_col, df[source].to_numpy())
    return df


def latest_run(paths: Paths) -> dict[str, Any] | None:
    if not paths.manifest.exists():
        return None
    runs = json.loads(paths.manifest.read_text(encoding="utf-8")).get("runs", [])
    return runs[0] if runs else None


def write_manifest(paths: Paths, run: dict[str, Any]) -> None:
    runs = []
    if paths.manifest.exists():
        runs = json.loads(paths.manifest.read_text(encoding="utf-8")).get("runs", [])
    runs = [run] + [r for r in runs if r["id"] != run["id"]]
    for stale in runs[KEEP_RUNS:]:
        (paths.forecast_dir / stale["file"]).unlink(missing_ok=True)
    runs = runs[:KEEP_RUNS]
    paths.manifest.write_text(json.dumps({"runs": runs}, indent=2), encoding="utf-8")


def run(paths: Paths) -> None:
    stations = load_stations(paths)
    levels = pd.read_parquet(paths.levels)
    levels["ts"] = pd.to_datetime(levels["ts"], utc=True)
    index = hourly_index(levels["ts"].min(), levels["ts"].max())
    z, mean, std = standardise(level_matrix(levels, stations, index))
    hours = index.hour.to_numpy()

    x, y = training_set(z, hours)
    log.info("training on %d samples from %d hours", len(y), len(index))
    models = fit(x, y)

    issued = index[-1]
    df = predict(models, z, mean, std, hours, stations, issued)
    run_id = f"{issued.strftime('%Y-%m-%dT%H')}-{MODEL_VERSION}"
    filename = f"{run_id}.parquet"
    df.to_parquet(paths.forecast_dir / filename, index=False, compression="zstd")
    write_manifest(
        paths,
        {
            "id": run_id,
            "model": MODEL_VERSION,
            "issued": issued.isoformat(),
            "generated": datetime.now(UTC).isoformat(timespec="seconds"),
            "horizonHours": FORECAST_HOURS,
            "stepHours": FORECAST_STEP_HOURS,
            "file": filename,
            "stations": int(df["station"].nunique()),
            "trainingSamples": int(len(y)),
            "trainedFrom": index[0].isoformat(),
        },
    )
    log.info("forecast %s: %d rows for %d stations", run_id, len(df), df["station"].nunique())
