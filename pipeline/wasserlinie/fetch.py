from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd

from . import anomaly, pegelonline
from .config import HISTORY_DAYS, Paths, log
from .names import water_key
from .pegelonline import Station

LEVEL_COLUMNS = ["station", "ts", "value", "rank"]


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def hourly_frame(uuid: str, rows: list[dict[str, Any]]) -> pd.DataFrame:
    """15-minute readings → hourly means, timestamps in UTC."""
    if not rows:
        return pd.DataFrame(columns=["station", "ts", "value"])
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["timestamp"], utc=True)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    hourly = df.dropna(subset=["value"]).set_index("ts")["value"].resample("1h").mean().dropna()
    return pd.DataFrame({"station": uuid, "ts": hourly.index, "value": hourly.values.astype("float32")})


def merge_levels(existing: pd.DataFrame | None, fresh: pd.DataFrame, now: datetime) -> pd.DataFrame:
    """Append new readings to what earlier runs collected and keep the last HISTORY_DAYS."""
    kept = [f for f in (existing, fresh) if f is not None and len(f)]
    frames = [f.drop(columns=["rank"], errors="ignore") for f in kept]
    if not frames:
        return pd.DataFrame(columns=["station", "ts", "value"])
    df = pd.concat(frames, ignore_index=True)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.drop_duplicates(subset=["station", "ts"], keep="last")
    df = df[df["ts"] >= now - timedelta(days=HISTORY_DAYS)]
    df = df.sort_values(["station", "ts"]).reset_index(drop=True)
    df["value"] = df["value"].astype("float32")
    return df[["station", "ts", "value"]]


def station_records(stations: list[Station], levels: pd.DataFrame) -> list[dict[str, Any]]:
    have_data = set(levels["station"].unique())
    out = []
    for s in stations:
        out.append(
            {
                "uuid": s.uuid,
                "name": s.name,
                "water": s.water_long,
                "waterKey": water_key(s.water_long),
                "lon": round(s.lon, 5),
                "lat": round(s.lat, 5),
                "km": s.km,
                "zero": s.zero,
                "mw": s.mw,
                "low": s.low,
                "high": s.high,
                "ref": s.ref,
                "marks": s.marks,
                "refYears": s.ref_years,
                "hasData": s.uuid in have_data,
            }
        )
    return out


def run(paths: Paths, days: int = 31, workers: int = 6) -> None:
    now = datetime.now(UTC)
    with httpx.Client(timeout=pegelonline.TIMEOUT, headers={"User-Agent": "wasserlinie-pipeline"}) as client:
        stations = pegelonline.fetch_stations(client)

    log.info("fetching %d days of readings for %d stations", days, len(stations))
    raw = pegelonline.fetch_all_measurements(stations, days, workers)
    fresh = pd.concat([hourly_frame(uuid, rows) for uuid, rows in raw.items()], ignore_index=True)

    existing = pd.read_parquet(paths.levels) if paths.levels.exists() else None
    levels = merge_levels(existing, fresh, now)

    records = station_records(stations, levels)
    curves = anomaly.station_curves(records)
    levels["rank"] = anomaly.ranks_for(curves, levels["station"].to_numpy(), levels["value"].to_numpy())
    levels.to_parquet(paths.levels, index=False, compression="zstd", row_group_size=50_000)
    log.info("levels.parquet: %d rows, %s → %s", len(levels), levels["ts"].min(), levels["ts"].max())

    payload = {"generated": now.isoformat(timespec="seconds"), "stations": records}
    write_json(paths.stations, payload)
    ranked = int(np.isfinite(levels["rank"]).sum())
    log.info(
        "stations.json: %d stations, %d with a reference curve; %d/%d readings ranked",
        len(stations),
        len(curves),
        ranked,
        len(levels),
    )
