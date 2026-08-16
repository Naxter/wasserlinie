from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from .config import Paths


def load_stations(paths: Paths) -> list[dict[str, Any]]:
    return json.loads(paths.stations.read_text(encoding="utf-8"))["stations"]


def hourly_index(start: pd.Timestamp, end: pd.Timestamp) -> pd.DatetimeIndex:
    return pd.date_range(start.floor("1h"), end.floor("1h"), freq="1h", tz="UTC")


def level_matrix(
    levels: pd.DataFrame, stations: list[dict[str, Any]], index: pd.DatetimeIndex, fill_hours: int = 6
) -> np.ndarray:
    """Levels in cm, one row per station, one column per hour. NaN where unknown; short gaps bridged."""
    wide = levels.pivot_table(index="ts", columns="station", values="value").reindex(index)
    out = np.full((len(stations), len(index)), np.nan, dtype=np.float32)
    for i, st in enumerate(stations):
        if st["uuid"] not in wide.columns:
            continue
        series = wide[st["uuid"]].interpolate(limit=fill_hours, limit_area="inside")
        out[i] = series.to_numpy(dtype=np.float32)
    return out


def to_index(cm: np.ndarray, stations: list[dict[str, Any]]) -> np.ndarray:
    """cm → position between the low (0) and high (1) reference; NaN without a reference."""
    low = np.array([s["low"] if s.get("low") is not None else np.nan for s in stations], dtype=np.float32)
    high = np.array([s["high"] if s.get("high") is not None else np.nan for s in stations], dtype=np.float32)
    return (cm - low[:, None]) / (high - low)[:, None]
