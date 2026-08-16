from datetime import UTC, datetime, timedelta

import pandas as pd

from wasserlinie.fetch import hourly_frame, merge_levels
from wasserlinie.pegelonline import parse_station


def test_hourly_frame_averages_quarter_hours():
    rows = [
        {"timestamp": "2026-08-01T10:00:00+02:00", "value": 100},
        {"timestamp": "2026-08-01T10:15:00+02:00", "value": 102},
        {"timestamp": "2026-08-01T10:30:00+02:00", "value": 104},
        {"timestamp": "2026-08-01T11:00:00+02:00", "value": 110},
    ]
    df = hourly_frame("abc", rows)
    assert list(df["value"]) == [102.0, 110.0]
    assert df["ts"].iloc[0] == pd.Timestamp("2026-08-01T08:00:00Z")
    assert set(df["station"]) == {"abc"}


def test_merge_levels_dedupes_and_trims_history():
    now = datetime(2026, 8, 16, tzinfo=UTC)
    old = pd.DataFrame(
        {
            "station": ["a", "a"],
            "ts": [now - timedelta(days=100), now - timedelta(days=10)],
            "value": [1.0, 2.0],
        }
    )
    new = pd.DataFrame({"station": ["a", "a"], "ts": [now - timedelta(days=10), now], "value": [2.5, 3.0]})
    merged = merge_levels(old, new, now)
    assert len(merged) == 2
    assert merged["value"].tolist() == [2.5, 3.0]


def test_parse_station_picks_reference_pair():
    raw = {
        "uuid": "u",
        "longname": "TESTPEGEL",
        "longitude": 8.0,
        "latitude": 50.0,
        "water": {"shortname": "X", "longname": "TESTFLUSS"},
        "timeseries": [
            {
                "shortname": "W",
                "gaugeZero": {"value": 12.5},
                "characteristicValues": [
                    {"shortname": "MNW", "value": 100.0},
                    {"shortname": "MHW", "value": 400.0},
                    {"shortname": "MW", "value": 200.0},
                ],
            }
        ],
    }
    st = parse_station(raw)
    assert st is not None
    assert (st.low, st.high, st.ref, st.zero) == (100.0, 400.0, "mean", 12.5)


def test_parse_station_without_level_series_is_skipped():
    assert parse_station({"uuid": "u", "longitude": 1, "latitude": 2, "timeseries": []}) is None
