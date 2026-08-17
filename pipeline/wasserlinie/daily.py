from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from . import anomaly
from .config import STATE_OFFSET, STATE_SCALE, Paths, log
from .grid import load_stations

# The whole record, one value per day, in the shape the browser can scrub
# through: a byte per gauge per day.
#
# `levels.parquet` is hourly but only reaches back about a month, because that
# is all the live API serves. The archive behind `wasserlinie history` reaches
# to 2000 but is a daily mean. So the long view gets its own asset rather than
# being squeezed into the hourly grid:
#
#   history.bin   state per gauge per day, one byte, gauge-major
#   history.json  which gauges, which days, how to decode
#   history/<uuid>.bin   that gauge's daily means in cm, for the chart
#
# 691 gauges x 9,726 days is 6.7 MB raw and about 3 MB gzipped, so it is loaded
# only when the long view is actually opened.

# 0 is reserved for "no reading", so the scale lives in 1..255 — 255 levels
# across a three-wide scale, about 0.012 per step. The frontend undoes exactly this.
NO_DATA = 0
STATE_LEVELS = 255
# int16 holds every real German gauge reading with room to spare; the few
# corrupt archive values are clipped rather than allowed to wrap.
CM_MISSING = -32768
CM_LIMIT = 32767


def encode_state(state: np.ndarray) -> np.ndarray:
    """State to a byte, keeping 0 free to mean nothing was measured."""
    known = np.isfinite(state)
    # NaN has to go before the cast, not after: casting it to uint8 is undefined.
    scaled = np.clip((np.where(known, state, STATE_OFFSET) - STATE_OFFSET) / STATE_SCALE, 0.0, 1.0)
    out = (np.rint(scaled * (STATE_LEVELS - 1)) + 1).astype(np.uint8)
    return np.where(known, out, NO_DATA).astype(np.uint8)


def decode_state(code: np.ndarray) -> np.ndarray:
    """The inverse, for tests and for checking what the browser will see."""
    state = STATE_OFFSET + (code.astype(np.float64) - 1) / (STATE_LEVELS - 1) * STATE_SCALE
    return np.where(code == NO_DATA, np.nan, state)


def states_by_day(
    daily: pd.DataFrame,
    stations: list[dict[str, Any]],
    seasonal: dict[tuple[str, int], tuple[np.ndarray, np.ndarray]] | None,
) -> pd.Series:
    """Every daily mean placed on its gauge's scale, the same way `fetch` does it.

    Ranked station by station: `states_for` groups internally, and handing it
    five million rows at once buys nothing but a very large sort.
    """
    curves = anomaly.station_curves(stations)
    doy = daily["day"].dt.dayofyear.clip(upper=365).to_numpy()
    station = daily["station"].to_numpy()
    cm = daily["mean"].to_numpy(dtype=np.float64)
    out = np.full(len(daily), np.nan, dtype=np.float32)
    edges = np.flatnonzero(np.r_[True, station[1:] != station[:-1], True])
    for start, stop in zip(edges[:-1], edges[1:], strict=True):
        rows = slice(start, stop)
        out[rows] = anomaly.states_for(curves, station[rows], cm[rows], doy[rows], seasonal)
    return pd.Series(out, index=daily.index)


def run(paths: Paths) -> None:
    if not paths.history.exists():
        raise SystemExit("no history.parquet — run `python -m wasserlinie history` first")
    stations = load_stations(paths)
    known = {s["uuid"]: s for s in stations}
    daily = pd.read_parquet(paths.history)
    daily = daily[daily["station"].isin(known)].sort_values(["station", "day"]).reset_index(drop=True)
    if daily.empty:
        raise SystemExit("history.parquet holds no gauge that is still in stations.json")

    days = pd.date_range(daily["day"].min(), daily["day"].max(), freq="D")
    column = pd.Series(np.arange(len(days)), index=days)
    uuids = list(dict.fromkeys(daily["station"]))
    row = {uuid: i for i, uuid in enumerate(uuids)}

    seasonal = anomaly.load_seasonal(paths)
    state = states_by_day(daily, stations, seasonal)

    r = daily["station"].map(row).to_numpy()
    c = column.reindex(daily["day"]).to_numpy()
    grid = np.full((len(uuids), len(days)), NO_DATA, dtype=np.uint8)
    grid[r, c] = encode_state(state.to_numpy())
    paths.history_bin.write_bytes(grid.tobytes())

    # One file per gauge, fetched when a gauge is opened: 19 KB each beats
    # shipping 13 MB of centimetres nobody has asked for yet.
    out_dir = paths.history_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.bin"):
        stale.unlink()
    cm_all = np.full((len(uuids), len(days)), CM_MISSING, dtype=np.int16)
    cm_all[r, c] = np.clip(np.rint(daily["mean"].to_numpy()), -CM_LIMIT, CM_LIMIT).astype(np.int16)
    for uuid, i in row.items():
        (out_dir / f"{uuid}.bin").write_bytes(cm_all[i].tobytes())

    paths.history_meta.write_text(
        json.dumps(
            {
                "t0": days[0].strftime("%Y-%m-%d"),
                "days": len(days),
                "stateOffset": STATE_OFFSET,
                "stateScale": STATE_SCALE,
                "stateLevels": STATE_LEVELS,
                "noData": NO_DATA,
                "cmMissing": CM_MISSING,
                "stations": uuids,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    placed = int((grid != NO_DATA).sum())
    log.info(
        "history.bin: %d gauges × %d days (%s to %s), %d placed (%.0f%%), %.1f MB",
        len(uuids),
        len(days),
        days[0].date(),
        days[-1].date(),
        placed,
        100 * placed / grid.size,
        grid.nbytes / 1e6,
    )
