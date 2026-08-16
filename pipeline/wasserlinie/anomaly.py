from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# How low or high is this gauge right now, on a scale everyone can read?
#
# The intended measure was a seasonal percentile: the gauge's own history in a
# ±15-day window across all years. That is not available. PEGELONLINE is a live
# API with a rolling window of about a month (absolute dates in the past come
# back empty), and the only open multi-year German level archive, CAMELS-DE,
# covers state catchment gauges and matches just 15 of our 691 stations.
#
# What every gauge does publish is its own named levels. They are used as
# anchors on a diverging scale:
#
#   -1.0  NNW   lowest level ever recorded here
#   -0.5  MNW   mean low water — the usual bottom of the year
#    0.0  MW    mean water — normal
#   +0.5  MHW   mean high water — the usual top of the year
#   +1.0  HHW   highest level ever recorded here
#
# Piecewise linear in between. Two properties matter. Zero means normal, so the
# sign alone says drought or flood. And the low-water range gets a full quarter
# of the scale instead of the 5% a percentile rank would give it, which is what
# makes a dry summer readable at all: right now a quarter of all gauges sit
# below MNW, and on a percentile scale they would all collapse into one colour.
#
# This is long-term but NOT seasonal: low water in August counts the same as low
# water in March.
ANCHORS = (("NNW", -1.0), ("MNW", -0.5), ("MW", 0.0), ("MHW", 0.5), ("HHW", 1.0))

# With `wasserlinie history` fetched, a gauge is judged against its own record
# for this time of year instead of against year-round marks. The scale keeps
# exactly the same meaning — 0 normal, ±0.5 worth pointing at — so nothing
# downstream changes; only the sentence in the panel gets more specific,
# from "low for this gauge" to "low for mid-August".
SEASONAL_ANCHORS = (
    ("lo", -1.0),
    ("p10", -0.5),
    ("p25", -0.25),
    ("p50", 0.0),
    ("p75", 0.25),
    ("p90", 0.5),
    ("hi", 1.0),
)
MIN_SPAN_CM = 20.0
MIN_REFERENCE_YEARS = 5

# Tidal gauges are deliberately left out. Their level swings between low and
# high water twice a day, so a position between MTnw and MThw would encode the
# phase of the tide, not whether anything unusual is happening.
TIDAL_MARKS = ("MTnw", "MThw", "NTnw", "HThw")


def reference_curve(marks: dict[str, float]) -> tuple[np.ndarray, np.ndarray] | None:
    """Level marks (cm) and their place on the scale. None if the gauge cannot be placed."""
    if any(k in marks for k in TIDAL_MARKS):
        return None
    levels: list[float] = []
    states: list[float] = []
    for name, state in ANCHORS:
        value = marks.get(name)
        if value is None:
            continue
        # The marks must increase; a gauge with contradictory statistics is skipped.
        if levels and value <= levels[-1]:
            return None
        levels.append(value)
        states.append(state)
    # MNW and MHW carry the scale. Without both, the middle is guesswork.
    if "MNW" not in marks or "MHW" not in marks or marks["MHW"] - marks["MNW"] < MIN_SPAN_CM:
        return None
    return np.array(levels, dtype=np.float64), np.array(states, dtype=np.float64)


def state_of(curve: tuple[np.ndarray, np.ndarray], cm: np.ndarray) -> np.ndarray:
    """Where each reading sits on the gauge's scale.

    Beyond the outermost anchors the slope of the last segment is continued, so a
    record-breaking level keeps moving instead of piling up on the end stop.
    """
    levels, states = curve
    out = np.interp(cm, levels, states)
    low = cm < levels[0]
    if low.any():
        slope = (states[1] - states[0]) / (levels[1] - levels[0])
        out[low] = states[0] + (cm[low] - levels[0]) * slope
    high = cm > levels[-1]
    if high.any():
        slope = (states[-1] - states[-2]) / (levels[-1] - levels[-2])
        out[high] = states[-1] + (cm[high] - levels[-1]) * slope
    return np.clip(out, -2.0, 2.0)


def seasonal_curves(seasonal: pd.DataFrame) -> dict[tuple[str, int], tuple[np.ndarray, np.ndarray]]:
    """One curve per gauge and sampled day of the year, keyed for lookup."""
    states = np.array([s for _, s in SEASONAL_ANCHORS], dtype=np.float64)
    columns = [c for c, _ in SEASONAL_ANCHORS]
    out: dict[tuple[str, int], tuple[np.ndarray, np.ndarray]] = {}
    for row in seasonal.itertuples(index=False):
        levels = np.array([getattr(row, c) for c in columns], dtype=np.float64)
        # A flat or contradictory reference cannot rank anything.
        if not np.all(np.diff(levels) > 0):
            continue
        out[(row.station, int(row.doy))] = (levels, states)
    return out


def nearest_doy(available: np.ndarray, doy: np.ndarray) -> np.ndarray:
    """Snap each day to the nearest sampled day of the year, wrapping at new year."""
    delta = np.abs(available[None, :] - doy[:, None])
    return available[np.argmin(np.minimum(delta, 365 - delta), axis=1)]


def station_curves(stations: list[dict[str, Any]]) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    curves = {}
    for st in stations:
        if (st.get("refYears") or 0) < MIN_REFERENCE_YEARS:
            continue
        curve = reference_curve(st.get("marks") or {})
        if curve is not None:
            curves[st["uuid"]] = curve
    return curves


def states_for(
    curves: dict[str, tuple[np.ndarray, np.ndarray]],
    station: np.ndarray,
    cm: np.ndarray,
    doy: np.ndarray | None = None,
    seasonal: dict[tuple[str, int], tuple[np.ndarray, np.ndarray]] | None = None,
) -> np.ndarray:
    """State per row; NaN where the gauge has no usable scale.

    Where a seasonal reference exists for the gauge it wins, because "low for
    October" is a sharper statement than "low". The year-round marks stay as the
    fallback for gauges the archive could not place.
    """
    out = np.full(len(cm), np.nan, dtype=np.float32)
    order = np.argsort(station, kind="stable")
    grouped = station[order]
    edges = np.flatnonzero(np.r_[True, grouped[1:] != grouped[:-1], True])
    sampled_doy: dict[str, np.ndarray] = {}
    if seasonal:
        for uuid, day in seasonal:
            sampled_doy.setdefault(uuid, []).append(day)  # type: ignore[arg-type]
        sampled_doy = {k: np.array(sorted(v)) for k, v in sampled_doy.items()}

    for start, stop in zip(edges[:-1], edges[1:], strict=True):
        uuid = grouped[start]
        rows = order[start:stop]
        days = sampled_doy.get(uuid) if seasonal is not None and doy is not None else None
        if days is not None and len(days):
            snapped = nearest_doy(days, doy[rows])
            for day in np.unique(snapped):
                curve = seasonal.get((uuid, int(day)))  # type: ignore[union-attr]
                if curve is None:
                    continue
                subset = rows[snapped == day]
                out[subset] = state_of(curve, cm[subset]).astype(np.float32)
            continue
        curve = curves.get(uuid)
        if curve is not None:
            out[rows] = state_of(curve, cm[rows]).astype(np.float32)
    return out


def load_seasonal(paths: Any) -> dict[tuple[str, int], tuple[np.ndarray, np.ndarray]] | None:
    """The seasonal reference from `wasserlinie history`, if it has been run."""
    if not paths.seasonal.exists():
        return None
    return seasonal_curves(pd.read_parquet(paths.seasonal))


def tag_basis(
    stations: list[dict[str, Any]],
    curves: dict[str, tuple[np.ndarray, np.ndarray]],
    seasonal: dict[tuple[str, int], tuple[np.ndarray, np.ndarray]] | None,
) -> None:
    """Record what each gauge is judged against, so the app can word it honestly."""
    seasonal_stations = {uuid for uuid, _ in (seasonal or {})}
    for st in stations:
        uuid = st["uuid"]
        if uuid in seasonal_stations:
            st["basis"] = "seasonal"
        elif uuid in curves:
            st["basis"] = "marks"
        else:
            st["basis"] = None
