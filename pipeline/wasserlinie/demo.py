"""Synthetic data, so the app can be run without the network.

Everything this writes is invented: the coastline is not a real country, the
rivers are not real rivers and the readings never happened. The point is to
exercise exactly the code paths the real pipeline feeds — the same file
formats, the same state scale, the same seasonal reference — in a couple of
seconds, with no download, no account and no key.

State values come from `anomaly`, not from anything made up here, so a demo run
cannot quietly disagree with a real one about what a colour means.

Deliberately not part of `all`: it overwrites public/data, and nobody wants
that as a side effect of refreshing real readings.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from . import anomaly
from .config import Paths, log
from .fetch import write_json
from .names import water_key

# Fixed, so two runs produce the same country, the same gauges and the same
# readings. A demo that reshuffles itself is a demo you cannot screenshot.
SEED = 20260817

DAYS = 31
FORECAST_HOURS = 72
STEP_HOURS = 1

# The app clamps its viewport to roughly this box (`map.bounds` in tokens.ts),
# so an invented country still has to sit inside it to be visible at all.
LON0, LON1 = 6.0, 15.0
LAT0, LAT1 = 47.5, 54.5

RIVER_NAMES = [
    "Aalbach",
    "Moorstrom",
    "Wendel",
    "Kieselaue",
    "Nordach",
    "Steinlauf",
    "Birkenau",
    "Hallach",
    "Sandstrom",
    "Weidbach",
    "Forstach",
    "Lindeaue",
]
TOWN_NAMES = [
    "Aalbrück",
    "Moorhaven",
    "Wendelstadt",
    "Kieselfurt",
    "Nordhafen",
    "Steinau",
    "Birkenfurt",
    "Hallbrück",
    "Sandwerder",
    "Weidhausen",
    "Forstheim",
    "Lindenwehr",
    "Ostmünde",
    "Talbrück",
    "Uferstadt",
    "Grünwehr",
    "Hochfurt",
    "Seeforst",
    "Marschau",
    "Rohrbach",
]
TRIBUTARY_SUFFIX = ("Ach", "Bach", "Lauf")


def _coastline(rng: np.random.Generator) -> list[list[float]]:
    """A closed ring that reads as a landmass and is plainly not Germany."""
    steps = 96
    cx, cy = (LON0 + LON1) / 2, (LAT0 + LAT1) / 2
    rx, ry = (LON1 - LON0) / 2 * 0.86, (LAT1 - LAT0) / 2 * 0.86
    # Three low harmonics: enough for bays and headlands, few enough that the
    # outline stays smooth enough for every river to reach the edge.
    phase = rng.uniform(0, 2 * math.pi, 3)
    ring = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        wobble = (
            1
            + 0.12 * math.sin(3 * a + phase[0])
            + 0.07 * math.sin(5 * a + phase[1])
            + 0.04 * math.sin(8 * a + phase[2])
        )
        ring.append([round(cx + rx * wobble * math.cos(a), 4), round(cy + ry * wobble * math.sin(a), 4)])
    ring.append(ring[0])
    return ring


def _polyline(
    rng: np.random.Generator, start: tuple[float, float], end: tuple[float, float], points: int
) -> list[list[float]]:
    """A wandering course between two points that never doubles back."""
    xs = np.linspace(start[0], end[0], points)
    ys = np.linspace(start[1], end[1], points)
    # Drift sideways only, so the river keeps making progress downstream.
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    px, py = -dy / length, dx / length
    drift = np.cumsum(rng.normal(0, 0.035, points))
    drift -= np.linspace(0, drift[-1], points)
    return [
        [round(float(x + px * d), 4), round(float(y + py * d), 4)]
        for x, y, d in zip(xs, ys, drift, strict=True)
    ]


def _length_km(coords: list[list[float]]) -> float:
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:], strict=False):
        mid = math.radians((lat1 + lat2) / 2)
        total += math.hypot((lon2 - lon1) * 111.32 * math.cos(mid), (lat2 - lat1) * 110.57)
    return total


def _network(
    rng: np.random.Generator, ring: list[list[float]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Trunk rivers out to the coast, each with a couple of tributaries."""
    cx, cy = (LON0 + LON1) / 2, (LAT0 + LAT1) / 2
    main: list[dict[str, Any]] = []
    detail: list[dict[str, Any]] = []
    river_id = 0
    for i, name in enumerate(RIVER_NAMES):
        mouth = ring[int(len(ring) * i / len(RIVER_NAMES))]
        # Sources sit part of the way out towards their own mouth rather than
        # all near the middle, so the rivers read as separate catchments
        # instead of spokes on a wheel.
        reach = rng.uniform(0.15, 0.45)
        source = (
            cx + (mouth[0] - cx) * reach + rng.uniform(-0.5, 0.5),
            cy + (mouth[1] - cy) * reach + rng.uniform(-0.35, 0.35),
        )
        coords = _polyline(rng, source, (mouth[0], mouth[1]), 26)
        cls = 200 if i < 3 else 125 if i < 6 else 42
        main.append(
            {
                "id": river_id,
                "name": name,
                "cls": cls,
                "km": round(_length_km(coords), 1),
                "coords": coords,
                "gauges": [],
            }
        )
        river_id += 1
        for t in range(int(rng.integers(2, 4))):
            join = coords[int(rng.integers(6, 20))]
            head = (join[0] + rng.uniform(-0.7, 0.7), join[1] + rng.uniform(-0.5, 0.5))
            sub = _polyline(rng, head, (join[0], join[1]), 12)
            detail.append(
                {
                    "id": river_id,
                    "name": f"{name}er {TRIBUTARY_SUFFIX[t % len(TRIBUTARY_SUFFIX)]}",
                    "cls": 12,
                    "km": round(_length_km(sub), 1),
                    "coords": sub,
                    "gauges": [],
                }
            )
            river_id += 1
    return main, detail


def _stations(rng: np.random.Generator, main: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gauges spaced along each trunk, each carrying a full set of marks."""
    out: list[dict[str, Any]] = []
    towns = iter(TOWN_NAMES * 6)
    for river in main:
        count = 12 if river["cls"] == 200 else 8 if river["cls"] == 125 else 5
        for k in range(count):
            s = round((k + 0.5) / count, 4)
            lon, lat = river["coords"][int(s * (len(river["coords"]) - 1))]
            mw = float(rng.uniform(120, 420))
            span = float(rng.uniform(90, 260))
            uuid = f"demo-{river['id']:02d}-{k:02d}"
            out.append(
                {
                    "uuid": uuid,
                    "name": next(towns),
                    "water": river["name"].upper(),
                    "waterKey": water_key(river["name"]),
                    "lon": round(lon, 5),
                    "lat": round(lat, 5),
                    "km": round(s * river["km"], 1),
                    "zero": round(float(rng.uniform(20, 300)), 2),
                    "mw": round(mw, 1),
                    "low": round(mw - span * 0.5, 1),
                    "high": round(mw + span * 0.9, 1),
                    "ref": "extremes",
                    "marks": {
                        "NNW": round(mw - span, 1),
                        "MNW": round(mw - span * 0.5, 1),
                        "MW": round(mw, 1),
                        "MHW": round(mw + span * 0.9, 1),
                        "HHW": round(mw + span * 1.8, 1),
                    },
                    "refYears": 26,
                    "hasData": True,
                }
            )
            river["gauges"].append({"uuid": uuid, "s": s})
    return out


def _levels(rng: np.random.Generator, stations: list[dict[str, Any]], now: datetime) -> pd.DataFrame:
    """Hourly readings with a slow drift, some noise and the odd rise."""
    hours = DAYS * 24
    ts = pd.date_range(end=pd.Timestamp(now).floor("h"), periods=hours, freq="1h", tz="UTC")
    frames = []
    for st in stations:
        mw = st["marks"]["MW"]
        span = st["marks"]["MW"] - st["marks"]["MNW"]
        # Each gauge gets its own mood, so the country is not uniformly dry.
        drift = np.linspace(0, rng.uniform(-1.4, 0.9) * span, hours)
        wave = 0.25 * span * np.sin(np.linspace(0, rng.uniform(2, 5) * math.pi, hours) + rng.uniform(0, 6))
        noise = np.cumsum(rng.normal(0, 0.02 * span, hours))
        noise -= np.linspace(0, noise[-1], hours)
        value = mw + drift + wave + noise
        if rng.random() < 0.25:
            # A rise that recedes, so the wet half of the scale is exercised too.
            peak = int(rng.integers(hours // 3, hours - 24))
            value = value + np.exp(-0.5 * ((np.arange(hours) - peak) / 26.0) ** 2) * span * rng.uniform(
                1.2, 2.4
            )
        frames.append(pd.DataFrame({"station": st["uuid"], "ts": ts, "value": value.astype("float32")}))
    return pd.concat(frames, ignore_index=True)


def _seasonal(stations: list[dict[str, Any]]) -> pd.DataFrame:
    """A reference for every fifth day of the year, per gauge.

    Without this the demo would fall back to year-round marks and could not
    show the app's actual claim, which is a comparison with the same date.
    """
    rows = []
    for st in stations:
        mw = st["marks"]["MW"]
        span = st["marks"]["MW"] - st["marks"]["MNW"]
        for doy in range(1, 366, 5):
            # Lower in late summer, higher in spring: a plausible regime.
            centre = mw - 0.45 * span * math.sin(2 * math.pi * (doy - 110) / 365)
            rows.append(
                {
                    "station": st["uuid"],
                    "doy": doy,
                    "lo": centre - span * 1.05,
                    "p10": centre - span * 0.5,
                    "p25": centre - span * 0.26,
                    "p50": centre,
                    "p75": centre + span * 0.3,
                    "p90": centre + span * 0.62,
                    "hi": centre + span * 1.6,
                }
            )
    return pd.DataFrame(rows)


def _forecast(
    rng: np.random.Generator,
    levels: pd.DataFrame,
    curves: dict[str, Any],
    seasonal: dict[Any, Any],
    now: datetime,
) -> pd.DataFrame:
    """A band that widens with lead time, carried on from the last reading."""
    last = levels.sort_values("ts").groupby("station").tail(1).set_index("station")
    start = pd.Timestamp(now).floor("h")
    rows = []
    for uuid, row in last.iterrows():
        base = float(row["value"])
        slope = float(rng.normal(0, 0.4))
        for h in range(STEP_HOURS, FORECAST_HOURS + 1, STEP_HOURS):
            p50 = base + slope * h
            width = 2.5 * math.sqrt(h)
            rows.append(
                {
                    "station": uuid,
                    "ts": start + timedelta(hours=h),
                    "p10": p50 - width,
                    "p50": p50,
                    "p90": p50 + width,
                }
            )
    df = pd.DataFrame(rows)
    doy = df["ts"].dt.tz_convert("Europe/Berlin").dt.dayofyear.to_numpy()
    station = df["station"].to_numpy()
    for col, source in (("state", "p50"), ("stateLow", "p10"), ("stateHigh", "p90")):
        df[col] = anomaly.states_for(curves, station, df[source].to_numpy(), doy, seasonal)
    return df


def run(paths: Paths) -> None:
    rng = np.random.default_rng(SEED)
    now = datetime.now(UTC)

    ring = _coastline(rng)
    main, detail = _network(rng, ring)
    stations = _stations(rng, main)
    levels = _levels(rng, stations, now)

    seasonal_df = _seasonal(stations)
    seasonal_df.to_parquet(paths.seasonal, index=False, compression="zstd")
    curves = anomaly.station_curves(stations)
    seasonal = anomaly.seasonal_curves(seasonal_df)

    doy = levels["ts"].dt.tz_convert("Europe/Berlin").dt.dayofyear.to_numpy()
    levels["state"] = anomaly.states_for(
        curves, levels["station"].to_numpy(), levels["value"].to_numpy(), doy, seasonal
    )
    today = min(int(pd.Timestamp(now).tz_convert("Europe/Berlin").dayofyear), 365)
    anomaly.tag_basis(stations, curves, seasonal, today)
    levels.to_parquet(paths.levels, index=False, compression="zstd", row_group_size=50_000)

    forecast = _forecast(rng, levels, curves, seasonal, now)
    run_id = pd.Timestamp(now).strftime("%Y-%m-%dT%H")
    filename = f"{run_id}.parquet"
    forecast.to_parquet(paths.forecast_dir / filename, index=False, compression="zstd")
    write_json(
        paths.manifest,
        {
            "runs": [
                {
                    "id": run_id,
                    "model": "demo",
                    "issued": now.isoformat(timespec="seconds"),
                    "generated": now.isoformat(timespec="seconds"),
                    "horizonHours": FORECAST_HOURS,
                    "stepHours": STEP_HOURS,
                    "file": filename,
                    "stations": int(forecast["station"].nunique()),
                }
            ]
        },
    )

    write_json(paths.stations, {"generated": now.isoformat(timespec="seconds"), "stations": stations})
    write_json(paths.rivers, {"rivers": main})
    write_json(paths.rivers_detail, {"rivers": detail})
    write_json(paths.germany, {"rings": [ring]})

    placed = int(np.isfinite(levels["state"]).sum())
    log.info("demo data written to %s - invented, not measured", paths.out)
    log.info(
        "  %d gauges on %d rivers, %d readings (%d placed), %d forecast rows",
        len(stations),
        len(main),
        len(levels),
        placed,
        len(forecast),
    )
