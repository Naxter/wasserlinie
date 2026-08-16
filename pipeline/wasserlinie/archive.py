from __future__ import annotations

import io
import json
import time
import zipfile
from datetime import date, datetime
from typing import Any

import httpx
import numpy as np
import pandas as pd

from .config import PEGELONLINE_HOST, Paths, log

# PEGELONLINE keeps unvalidated raw readings back to 1 January 2000, but not on
# the REST API — that one only answers for the last ~31 days. The archive sits
# behind the download form on a gauge's master-data page and works in two steps:
#
#   1. POST .../historische-zeitreihen/prepare-download with the gauge uuid and
#      a date range. It answers 303 with a one-shot filename in Location.
#   2. GET that location. The body is a zip holding one JSON array of
#      {timestamp, value} plus the terms of use.
#
# A session cookie from any page on the host is required; without one the
# endpoint answers 500.
#
# The readings are 15-minutely and relative to each gauge's own datum (PNP),
# same as the live API, so the two series stitch together without conversion.

ARCHIVE_START = date(2000, 1, 1)
# The seasonal curve is already smoothed by a ±15-day window, so storing it for
# every day of the year is five times the bytes for no extra information. Every
# fifth day is sampled and the app interpolates between them.
SEASONAL_STEP_DAYS = 5
PARAMETER = "WASSERSTAND ROHDATEN"
PREPARE = "/gast/historische-zeitreihen/prepare-download"
SEED = "/gast/pegeltabelle"

# A federal agency's server, fetched for a hobby project: one request at a time,
# with a pause, and everything cached so a rerun costs nothing.
PAUSE_SECONDS = 1.5
TIMEOUT = httpx.Timeout(600.0, connect=30.0)


def open_session() -> httpx.Client:
    """A client carrying the JSESSIONID the archive endpoint insists on."""
    return httpx.Client(
        base_url=PEGELONLINE_HOST,
        timeout=TIMEOUT,
        follow_redirects=False,
        headers={"User-Agent": "wasserlinie-pipeline (hobby project; github.com/Naxter/wasserlinie)"},
    )


def download_zip(client: httpx.Client, uuid: str, start: date, end: date) -> bytes:
    form = {
        "uuid": uuid,
        "parameter": PARAMETER,
        "start": f"{start.isoformat()}T01:00:00+01",
        "end": f"{end.isoformat()}T23:00:00+01",
        "format": "json",
    }
    prepared = client.post(PREPARE, data=form)
    if prepared.status_code != 303:
        raise RuntimeError(f"prepare-download answered {prepared.status_code} for {uuid}")
    location = prepared.headers["location"]
    payload = client.get(location)
    payload.raise_for_status()
    return payload.content


def readings_from_zip(blob: bytes) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.endswith(".json"))
        rows = json.loads(z.read(name))
    if not rows:
        return pd.DataFrame(columns=["ts", "value"])
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["timestamp"], utc=True, format="ISO8601")
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    return df.dropna(subset=["value"])[["ts", "value"]]


def to_daily(df: pd.DataFrame, uuid: str) -> pd.DataFrame:
    """15-minute readings to one row per day. Daily means carry the seasonal signal."""
    if df.empty:
        return pd.DataFrame(columns=["station", "day", "mean", "min", "max", "n"])
    # Local calendar days: a "day" of water level is a German day, not a UTC one.
    local = df["ts"].dt.tz_convert("Europe/Berlin")
    grouped = df.assign(day=local.dt.date).groupby("day")["value"]
    daily = grouped.agg(["mean", "min", "max", "count"]).reset_index()
    daily.columns = ["day", "mean", "min", "max", "n"]
    daily.insert(0, "station", uuid)
    daily["day"] = pd.to_datetime(daily["day"])
    for c in ("mean", "min", "max"):
        daily[c] = daily[c].astype("float32")
    daily["n"] = daily["n"].astype("int16")
    # A day with only a couple of readings is not a daily mean.
    return daily[daily["n"] >= 24].reset_index(drop=True)


def cached_daily(client: httpx.Client, paths: Paths, uuid: str, until: date) -> pd.DataFrame:
    """Daily history for one gauge, downloading it once and reusing it afterwards."""
    raw_dir = paths.cache / "archive"
    raw_dir.mkdir(parents=True, exist_ok=True)
    daily_path = raw_dir / f"{uuid}.parquet"
    if daily_path.exists():
        return pd.read_parquet(daily_path)

    blob = download_zip(client, uuid, ARCHIVE_START, until)
    daily = to_daily(readings_from_zip(blob), uuid)
    daily.to_parquet(daily_path, index=False, compression="zstd")
    time.sleep(PAUSE_SECONDS)
    return daily


def seasonal_reference(daily: pd.DataFrame, window_days: int = 15, min_years: int = 5) -> pd.DataFrame:
    """For each gauge and day of the year, the spread of daily means around that date.

    The window is ±`window_days` calendar days across every year on record, which
    is what makes "low for the time of year" a different statement from "low".
    """
    if daily.empty:
        return pd.DataFrame(columns=["station", "doy", "p10", "p25", "p50", "p75", "p90", "years"])
    frame = daily.copy()
    frame["doy"] = frame["day"].dt.dayofyear.clip(upper=365)
    frame["year"] = frame["day"].dt.year
    rows = []
    for station, group in frame.groupby("station", sort=False):
        values = group["mean"].to_numpy()
        doy = group["doy"].to_numpy()
        years = group["year"].to_numpy()
        for target in range(1, 366, SEASONAL_STEP_DAYS):
            # Wrap around the turn of the year so 1 January sees late December.
            delta = np.abs(doy - target)
            near = np.minimum(delta, 365 - delta) <= window_days
            if not near.any():
                continue
            sample = values[near]
            n_years = len(np.unique(years[near]))
            if n_years < min_years or sample.size < 30:
                continue
            p10, p25, p50, p75, p90 = np.percentile(sample, [10, 25, 50, 75, 90])
            rows.append((station, target, p10, p25, p50, p75, p90, n_years))
    out = pd.DataFrame(rows, columns=["station", "doy", "p10", "p25", "p50", "p75", "p90", "years"])
    for c in ("p10", "p25", "p50", "p75", "p90"):
        out[c] = out[c].astype("float32")
    out["doy"] = out["doy"].astype("int16")
    out["years"] = out["years"].astype("int16")
    return out


def run(paths: Paths, limit: int | None = None, only: str | None = None) -> None:
    stations: list[dict[str, Any]] = json.loads(paths.stations.read_text(encoding="utf-8"))["stations"]
    if only:
        wanted = only.upper()
        stations = [s for s in stations if wanted in s["name"].upper() or wanted in s["water"].upper()]
        if not stations:
            raise SystemExit(f"no station matching {only!r}")
    if limit:
        stations = stations[:limit]

    today = datetime.now().date()
    frames = []
    with open_session() as client:
        client.get(SEED)  # sets JSESSIONID
        for i, station in enumerate(stations, 1):
            try:
                daily = cached_daily(client, paths, station["uuid"], today)
            except (httpx.HTTPError, RuntimeError, zipfile.BadZipFile) as exc:
                log.warning("%s: %s", station["name"], exc)
                continue
            if daily.empty:
                continue
            frames.append(daily)
            if i % 25 == 0 or i == len(stations):
                rows = sum(len(f) for f in frames)
                log.info("  %d/%d gauges, %d daily rows so far", i, len(stations), rows)

    if not frames:
        raise SystemExit("no history downloaded")
    history = pd.concat(frames, ignore_index=True).sort_values(["station", "day"]).reset_index(drop=True)
    history.to_parquet(paths.history, index=False, compression="zstd")
    span = history.groupby("station")["day"].agg(["min", "max"])
    log.info(
        "history.parquet: %d gauges, %d daily rows, %s to %s",
        history["station"].nunique(),
        len(history),
        span["min"].min().date(),
        span["max"].max().date(),
    )

    seasonal = seasonal_reference(history)
    seasonal.to_parquet(paths.seasonal, index=False, compression="zstd")
    log.info(
        "seasonal.parquet: %d gauges with a seasonal reference, median %d years",
        seasonal["station"].nunique(),
        int(seasonal["years"].median()) if len(seasonal) else 0,
    )
