from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import httpx

from .config import PEGELONLINE_URL, log

TIMEOUT = httpx.Timeout(60.0, connect=15.0)


@dataclass(frozen=True)
class Station:
    uuid: str
    name: str
    water: str
    water_long: str
    lon: float
    lat: float
    km: float | None
    zero: float | None  # gauge datum in metres above sea level
    mw: float | None
    low: float | None  # reference low water (cm)
    high: float | None  # reference high water (cm)
    ref: str | None  # which pair: "mean" (MNW/MHW), "tidal" (MTnw/MThw), "extremes" (NW/HW)
    marks: dict[str, float]  # every published long-term mark, in cm
    ref_years: int | None  # years the marks were computed over


# Gauge zeros are arbitrary, so raw centimetres are not comparable between
# stations. Every level is expressed as where it sits between a low- and a
# high-water reference: 0 at the low mark, 1 at the high mark.
REFERENCE_PAIRS = (("mean", "MNW", "MHW"), ("tidal", "MTnw", "MThw"), ("extremes", "NW", "HW"))

# Long-term statistics a gauge may publish, used to rank a reading against the
# gauge's own history (see anomaly.py).
MARK_KEYS = ("NNW", "MNW", "MW", "MHW", "HHW", "NW", "HW", "NTnw", "MTnw", "MThw", "HThw")


def _characteristic(timeseries: dict[str, Any], key: str) -> float | None:
    for cv in timeseries.get("characteristicValues", []):
        if cv.get("shortname") == key and cv.get("value") is not None:
            return float(cv["value"])
    return None


def _gauge_zero(timeseries: dict[str, Any]) -> float | None:
    zero = timeseries.get("gaugeZero") or {}
    return float(zero["value"]) if zero.get("value") is not None else None


def _marks(timeseries: dict[str, Any]) -> dict[str, float]:
    out = {}
    for key in MARK_KEYS:
        value = _characteristic(timeseries, key)
        if value is not None:
            out[key] = value
    return out


def _reference_years(timeseries: dict[str, Any]) -> int | None:
    """Longest period any of the averaged marks was computed over."""
    years = []
    for cv in timeseries.get("characteristicValues", []):
        start, end = cv.get("timespanStart"), cv.get("timespanEnd")
        if start and end:
            years.append(int(end[:4]) - int(start[:4]) + 1)
    return max(years) if years else None


def _reference(timeseries: dict[str, Any]) -> tuple[float | None, float | None, str | None]:
    for kind, low_key, high_key in REFERENCE_PAIRS:
        low, high = _characteristic(timeseries, low_key), _characteristic(timeseries, high_key)
        if low is not None and high is not None and high - low >= 20:
            return low, high, kind
    return None, None, None


def parse_station(raw: dict[str, Any]) -> Station | None:
    """Return the station if it has a water level series and coordinates."""
    series = next((t for t in raw.get("timeseries", []) if t.get("shortname") == "W"), None)
    if series is None or raw.get("longitude") is None or raw.get("latitude") is None:
        return None
    water = raw.get("water") or {}
    low, high, ref = _reference(series)
    return Station(
        uuid=raw["uuid"],
        name=str(raw.get("longname") or raw.get("shortname") or "").strip(),
        water=str(water.get("shortname") or "").strip(),
        water_long=str(water.get("longname") or water.get("shortname") or "").strip(),
        lon=float(raw["longitude"]),
        lat=float(raw["latitude"]),
        km=float(raw["km"]) if raw.get("km") is not None else None,
        zero=_gauge_zero(series),
        mw=_characteristic(series, "MW"),
        low=low,
        high=high,
        ref=ref,
        marks=_marks(series),
        ref_years=_reference_years(series),
    )


def fetch_stations(client: httpx.Client) -> list[Station]:
    r = client.get(
        f"{PEGELONLINE_URL}/stations.json",
        params={"includeTimeseries": "true", "includeCharacteristicValues": "true"},
    )
    r.raise_for_status()
    stations = [s for s in (parse_station(raw) for raw in r.json()) if s is not None]
    log.info("%d stations with a water level series", len(stations))
    return stations


def fetch_measurements(client: httpx.Client, uuid: str, days: int) -> list[dict[str, Any]]:
    """Raw 15-minute readings. The API caps history at roughly a month regardless of `days`."""
    r = client.get(f"{PEGELONLINE_URL}/stations/{uuid}/W/measurements.json", params={"start": f"P{days}D"})
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return r.json()


def fetch_all_measurements(
    stations: list[Station], days: int, workers: int = 6
) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": "wasserlinie-pipeline"}) as client:

        def one(station: Station) -> tuple[str, list[dict[str, Any]]]:
            try:
                return station.uuid, fetch_measurements(client, station.uuid, days)
            except httpx.HTTPError as exc:
                log.warning("%s: %s", station.name, exc)
                return station.uuid, []

        with ThreadPoolExecutor(max_workers=workers) as pool:
            for i, (uuid, rows) in enumerate(pool.map(one, stations), 1):
                out[uuid] = rows
                if i % 100 == 0:
                    log.info("  %d/%d stations fetched", i, len(stations))
    return out
