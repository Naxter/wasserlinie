from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from .config import FIELD_SAMPLES, FIELD_STEP_HOURS, FORECAST_HOURS, INDEX_OFFSET, INDEX_SCALE, Paths, log
from .forecast import latest_run
from .grid import hourly_index, level_matrix, load_stations, to_index

# The field is what the river shader reads: for every river part with gauges,
# a small grid of (time step × position along the river) with three bytes per
# cell — level index, measured-or-forecast, forecast spread. Interpolating
# between gauges happens here, once, so the browser never has to.


def forecast_matrices(
    forecast: pd.DataFrame | None, stations: list[dict[str, Any]], index: pd.DatetimeIndex
) -> tuple[np.ndarray, np.ndarray]:
    """Hourly p50 and (p90 - p10) per station in cm over `index`, NaN outside the forecast."""
    p50 = np.full((len(stations), len(index)), np.nan, dtype=np.float32)
    spread = np.full_like(p50, np.nan)
    if forecast is None or forecast.empty:
        return p50, spread
    fc = forecast.copy()
    fc["ts"] = pd.to_datetime(fc["ts"], utc=True)
    by_station = {k: g.set_index("ts").sort_index() for k, g in fc.groupby("station")}
    for i, st in enumerate(stations):
        g = by_station.get(st["uuid"])
        if g is None:
            continue
        rein = g[["p10", "p50", "p90"]].reindex(g.index.union(index))
        rein = rein.interpolate(method="time").reindex(index)
        p50[i] = rein["p50"].to_numpy(dtype=np.float32)
        spread[i] = (rein["p90"] - rein["p10"]).to_numpy(dtype=np.float32)
    return p50, spread


def sample_river(gauge_pos: np.ndarray, values: np.ndarray, samples: int) -> np.ndarray:
    """Linear interpolation along the river; beyond the outermost gauges the value is held."""
    xs = (np.arange(samples) + 0.5) / samples
    return np.interp(xs, gauge_pos, values)


def encode(level: np.ndarray, measured: np.ndarray, spread: np.ndarray) -> np.ndarray:
    out = np.empty(level.shape + (3,), dtype=np.uint8)
    out[..., 0] = np.clip((level - INDEX_OFFSET) / INDEX_SCALE, 0, 1) * 255
    out[..., 1] = np.clip(measured, 0, 1) * 255
    out[..., 2] = np.clip(spread, 0, 1) * 255
    return out


def build_field(
    rivers: list[dict[str, Any]],
    station_index: dict[str, int],
    measured_level: np.ndarray,
    forecast_level: np.ndarray,
    forecast_spread: np.ndarray,
    step_columns: np.ndarray,
    samples: int,
) -> tuple[list[int], np.ndarray]:
    ids: list[int] = []
    grids: list[np.ndarray] = []
    steps = len(step_columns)
    for river in rivers:
        gauges = [(g["s"], station_index[g["uuid"]]) for g in river["gauges"] if g["uuid"] in station_index]
        if not gauges:
            continue
        pos = np.array([s for s, _ in gauges])
        rows = np.array([i for _, i in gauges])
        level = np.full((steps, samples), 0.5, dtype=np.float32)
        measured = np.zeros((steps, samples), dtype=np.float32)
        spread = np.zeros((steps, samples), dtype=np.float32)
        for k, col in enumerate(step_columns):
            m = measured_level[rows, col]
            f = forecast_level[rows, col]
            value = np.where(np.isnan(m), f, m)
            ok = ~np.isnan(value)
            if not ok.any():
                continue
            level[k] = sample_river(pos[ok], value[ok], samples)
            measured[k] = sample_river(pos[ok], (~np.isnan(m[ok])).astype(np.float32), samples)
            sp = np.where(np.isnan(m[ok]), forecast_spread[rows[ok], col], 0.0)
            spread[k] = sample_river(pos[ok], np.nan_to_num(sp), samples)
        ids.append(river["id"])
        grids.append(encode(level, measured, spread))
    return ids, np.stack(grids) if grids else np.zeros((0, steps, samples, 3), dtype=np.uint8)


def run(paths: Paths) -> None:
    stations = load_stations(paths)
    station_index = {s["uuid"]: i for i, s in enumerate(stations)}
    rivers = json.loads(paths.rivers.read_text(encoding="utf-8"))["rivers"]
    levels = pd.read_parquet(paths.levels)
    levels["ts"] = pd.to_datetime(levels["ts"], utc=True)

    run_meta = latest_run(paths)
    forecast = pd.read_parquet(paths.forecast_dir / run_meta["file"]) if run_meta else None

    now = levels["ts"].max().floor("1h")
    t0 = levels["ts"].min().floor(f"{FIELD_STEP_HOURS}h")
    end = now + pd.Timedelta(hours=FORECAST_HOURS)
    index = hourly_index(t0, end)
    measured = to_index(level_matrix(levels, stations, index), stations)
    measured[:, index > now] = np.nan
    fc_p50, fc_spread = forecast_matrices(forecast, stations, index)
    fc_level = to_index(fc_p50, stations)
    span = np.array([(s["high"] - s["low"]) if s.get("low") is not None else np.nan for s in stations])
    fc_spread = fc_spread / span[:, None].astype(np.float32)

    step_columns = np.arange(0, len(index), FIELD_STEP_HOURS)
    ids, grid = build_field(rivers, station_index, measured, fc_level, fc_spread, step_columns, FIELD_SAMPLES)

    paths.field_bin.write_bytes(grid.tobytes())
    meta = {
        "t0": index[0].isoformat(),
        "now": now.isoformat(),
        "stepHours": FIELD_STEP_HOURS,
        "steps": int(len(step_columns)),
        "samples": FIELD_SAMPLES,
        "channels": 3,
        "indexOffset": INDEX_OFFSET,
        "indexScale": INDEX_SCALE,
        "horizonHours": FORECAST_HOURS,
        "forecastRun": run_meta["id"] if run_meta else None,
        "rivers": ids,
    }
    paths.field_meta.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    log.info("field.bin: %d rivers × %d steps × %d samples (%.1f MB)", *grid.shape[:3], grid.nbytes / 1e6)
