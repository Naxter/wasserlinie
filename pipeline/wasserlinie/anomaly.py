from __future__ import annotations

from typing import Any

import numpy as np

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
    curves: dict[str, tuple[np.ndarray, np.ndarray]], station: np.ndarray, cm: np.ndarray
) -> np.ndarray:
    """State per row; NaN where the gauge has no usable scale."""
    out = np.full(len(cm), np.nan, dtype=np.float32)
    order = np.argsort(station, kind="stable")
    grouped = station[order]
    edges = np.flatnonzero(np.r_[True, grouped[1:] != grouped[:-1], True])
    for start, stop in zip(edges[:-1], edges[1:], strict=True):
        curve = curves.get(grouped[start])
        if curve is None:
            continue
        rows = order[start:stop]
        out[rows] = state_of(curve, cm[rows]).astype(np.float32)
    return out
