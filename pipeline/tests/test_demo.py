"""The demo has to produce what the app loads, or the quickstart is a lie.

These assert the contract between `wasserlinie demo` and the browser: the file
set, the station record shape (`Station` in src/data/types.ts), and that the
readings actually land on a scale. A demo that writes plausible-looking files
the app cannot read is worse than no demo at all.
"""

from __future__ import annotations

import json

import pandas as pd

from wasserlinie import demo
from wasserlinie.config import Paths

# Every key src/data/types.ts declares on Station.
STATION_KEYS = {
    "uuid",
    "name",
    "water",
    "waterKey",
    "lon",
    "lat",
    "km",
    "zero",
    "mw",
    "low",
    "high",
    "ref",
    "marks",
    "refYears",
    "basis",
    "hasData",
}


def seed(tmp_path) -> Paths:
    paths = Paths(out=tmp_path / "data", cache=tmp_path / "cache")
    demo.run(paths)
    return paths


def test_writes_everything_the_app_loads(tmp_path):
    paths = seed(tmp_path)
    for path in (
        paths.stations,
        paths.levels,
        paths.rivers,
        paths.rivers_detail,
        paths.germany,
        paths.manifest,
    ):
        assert path.exists(), path.name

    manifest = json.loads(paths.manifest.read_text(encoding="utf-8"))
    run = manifest["runs"][0]
    assert (paths.forecast_dir / run["file"]).exists()


def test_station_records_carry_every_field_the_app_reads(tmp_path):
    paths = seed(tmp_path)
    stations = json.loads(paths.stations.read_text(encoding="utf-8"))["stations"]
    assert stations
    for st in stations:
        assert set(st) == STATION_KEYS, st["uuid"]


def test_readings_land_on_a_scale(tmp_path):
    paths = seed(tmp_path)
    levels = pd.read_parquet(paths.levels)
    assert set(levels.columns) >= {"station", "ts", "value", "state"}
    # Nothing to look at if the gauges cannot be judged.
    assert levels["state"].notna().all()
    # The scale is not clamped: a reading past the record extrapolates beyond
    # +/-1 on purpose, and only the ramp clamps. Bound it loosely, which still
    # catches a reference curve that has collapsed.
    assert levels["state"].between(-3.0, 3.0).all()
    # A demo where everything sits at normal would show none of the ramp.
    assert (levels["state"].abs() > 0.5).any()


def test_the_demo_exercises_the_seasonal_basis(tmp_path):
    paths = seed(tmp_path)
    stations = json.loads(paths.stations.read_text(encoding="utf-8"))["stations"]
    # Falling back to year-round marks would demo the weaker of the two claims.
    assert all(st["basis"] == "seasonal" for st in stations)


def test_gauges_on_rivers_exist_as_stations(tmp_path):
    paths = seed(tmp_path)
    stations = json.loads(paths.stations.read_text(encoding="utf-8"))["stations"]
    rivers = json.loads(paths.rivers.read_text(encoding="utf-8"))["rivers"]
    known = {st["uuid"] for st in stations}
    placed = 0
    for river in rivers:
        for gauge in river["gauges"]:
            assert gauge["uuid"] in known
            assert 0.0 <= gauge["s"] <= 1.0
            placed += 1
    assert placed == len(stations)


def test_forecast_carries_the_band_the_chart_draws(tmp_path):
    paths = seed(tmp_path)
    manifest = json.loads(paths.manifest.read_text(encoding="utf-8"))
    forecast = pd.read_parquet(paths.forecast_dir / manifest["runs"][0]["file"])
    assert set(forecast.columns) >= {"station", "ts", "p10", "p50", "p90", "state", "stateLow", "stateHigh"}
    assert (forecast["p10"] <= forecast["p50"]).all()
    assert (forecast["p50"] <= forecast["p90"]).all()


def test_two_runs_agree(tmp_path):
    """Seeded, so a screenshot taken today still matches the data tomorrow."""
    first = json.loads(seed(tmp_path / "a").stations.read_text(encoding="utf-8"))["stations"]
    second = json.loads(seed(tmp_path / "b").stations.read_text(encoding="utf-8"))["stations"]
    assert [st["uuid"] for st in first] == [st["uuid"] for st in second]
    assert [st["marks"] for st in first] == [st["marks"] for st in second]
