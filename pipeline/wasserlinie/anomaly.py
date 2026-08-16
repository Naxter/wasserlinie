from __future__ import annotations

from typing import Any

import numpy as np

# How unusual is this level *for this gauge*?
#
# The intended reference was the gauge's own history in a ±15-day window across
# all years. PEGELONLINE cannot deliver that: it is a live API with a rolling
# window of roughly a month (absolute dates in the past come back empty), and
# the only open multi-year German level archive, CAMELS-DE, covers state
# catchment gauges and matches just 15 of our 691 stations.
#
# What every gauge does publish is its own long-term summary statistics, each
# with the period they were computed over. Those five marks are read as points
# on the gauge's level distribution and interpolated into a reference curve, so
# a reading becomes a rank between 0 and 1. The rank is therefore long-term but
# NOT seasonal: low water in August ranks the same as low water in March.
#
# Plotting positions are the conventional reading of the German marks: NNW and
# HHW are the extremes ever recorded, MNW and MHW the means of the yearly
# extremes, MW the long-term mean.
ANCHORS = (("NNW", 0.0), ("MNW", 0.05), ("MW", 0.5), ("MHW", 0.95), ("HHW", 1.0))
MIN_ANCHORS = 3
MIN_REFERENCE_YEARS = 5

# Tidal gauges are deliberately left without a rank. Their level swings between
# low and high water twice a day, so a rank against MTnw/MThw would encode the
# phase of the tide, not whether anything unusual is happening.
TIDAL_MARKS = ("MTnw", "MThw", "NTnw", "HThw")


def reference_curve(marks: dict[str, float]) -> tuple[np.ndarray, np.ndarray] | None:
    """Level marks (cm) and their ranks, ready for interpolation. None if too thin."""
    if any(k in marks for k in TIDAL_MARKS):
        return None
    levels: list[float] = []
    ranks: list[float] = []
    for name, rank in ANCHORS:
        value = marks.get(name)
        if value is None:
            continue
        # The marks must increase; a gauge with contradictory statistics is skipped.
        if levels and value <= levels[-1]:
            return None
        levels.append(value)
        ranks.append(rank)
    if len(levels) < MIN_ANCHORS:
        return None
    return np.array(levels, dtype=np.float64), np.array(ranks, dtype=np.float64)


def rank(curve: tuple[np.ndarray, np.ndarray], cm: np.ndarray) -> np.ndarray:
    """Rank of each reading on the reference curve, clamped to 0..1."""
    levels, ranks = curve
    return np.interp(cm, levels, ranks, left=0.0, right=1.0)


def station_curves(stations: list[dict[str, Any]]) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    curves = {}
    for st in stations:
        if (st.get("refYears") or 0) < MIN_REFERENCE_YEARS:
            continue
        curve = reference_curve(st.get("marks") or {})
        if curve is not None:
            curves[st["uuid"]] = curve
    return curves


def ranks_for(
    curves: dict[str, tuple[np.ndarray, np.ndarray]], station: np.ndarray, cm: np.ndarray
) -> np.ndarray:
    """Rank per row; NaN where the station has no usable reference."""
    out = np.full(len(cm), np.nan, dtype=np.float32)
    order = np.argsort(station, kind="stable")
    grouped = station[order]
    edges = np.flatnonzero(np.r_[True, grouped[1:] != grouped[:-1], True])
    for start, stop in zip(edges[:-1], edges[1:], strict=True):
        curve = curves.get(grouped[start])
        if curve is None:
            continue
        rows = order[start:stop]
        out[rows] = rank(curve, cm[rows]).astype(np.float32)
    return out
