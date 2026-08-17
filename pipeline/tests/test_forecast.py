import numpy as np
import pandas as pd

from wasserlinie.forecast import (
    LOOKBACK,
    calibrate,
    features_at,
    fit,
    issue_index,
    predict,
    standardise,
    training_set,
)


def test_the_run_is_anchored_on_a_populated_hour():
    # 40 gauges over 30 hours, but the newest two hours have only just started
    # to fill: 5 gauges and 12 of 40.
    z = np.zeros((40, 30))
    z[5:, -1] = np.nan
    z[12:, -2] = np.nan
    assert issue_index(z) == 27
    # With nothing missing the newest hour is the right one.
    assert issue_index(np.zeros((40, 30))) == 29


def _synthetic(stations: int = 3, hours: int = 400) -> np.ndarray:
    t = np.arange(hours)
    rng = np.random.default_rng(1)
    rows = [200 + 30 * np.sin(2 * np.pi * t / 100 + k) + rng.normal(0, 1, hours) for k in range(stations)]
    return np.array(rows, dtype=np.float32)


def test_standardise_is_per_station():
    z, mean, std = standardise(_synthetic())
    assert z.shape == (3, 400)
    assert np.allclose(np.nanmean(z, axis=1), 0, atol=1e-5)
    assert np.all(std > 1)


def test_features_and_training_set_shapes():
    z, _, _ = standardise(_synthetic())
    hours = np.arange(400) % 24
    x = features_at(z, hours, LOOKBACK, 6.0)
    assert x.shape == (3, 10)
    xs, ys = training_set(z, hours)
    assert xs.shape[0] == ys.shape[0] > 0
    assert xs.shape[1] == 10


def test_fit_and_predict_orders_quantiles():
    cm = _synthetic()
    z, mean, std = standardise(cm)
    hours = np.arange(400) % 24
    xs, ys = training_set(z, hours)
    models = fit(xs, ys)
    stations = [{"uuid": f"s{k}"} for k in range(3)]
    df = predict(models, z, mean, std, hours, stations, pd.Timestamp("2026-08-16T12:00Z"))
    assert set(df["station"]) == {"s0", "s1", "s2"}
    assert (df["p10"] <= df["p50"]).all() and (df["p50"] <= df["p90"]).all()
    assert df["ts"].min() > pd.Timestamp("2026-08-16T12:00Z")


def test_calibrate_widens_the_band_towards_the_target():
    cm = _synthetic(stations=6, hours=500)
    z, _, _ = standardise(cm)
    hours = np.arange(500) % 24
    split = 380
    models = fit(*training_set(z[:, :split], hours[:split]))
    factors = calibrate(models, z, hours, split)
    assert factors, "expected a widening factor per lead"
    assert all(1.0 <= k <= 6.0 for k in factors.values())
    # A band that already covers enough is left alone rather than shrunk.
    assert min(factors.values()) >= 1.0
