import numpy as np

from wasserlinie.config import INDEX_OFFSET, INDEX_SCALE
from wasserlinie.field import build_field, encode, sample_river


def test_sample_river_interpolates_and_holds_ends():
    values = sample_river(np.array([0.25, 0.75]), np.array([0.0, 1.0]), 8)
    assert values[0] == 0.0 and values[-1] == 1.0
    assert abs(values[3] - 0.375) < 1e-6
    assert np.all(np.diff(values) >= 0)


def test_encode_round_trips_the_index():
    level = np.array([[INDEX_OFFSET, 0.0, 1.0, INDEX_OFFSET + INDEX_SCALE]], dtype=np.float32)
    ones = np.ones_like(level)
    packed = encode(level, ones, ones * 0.5)
    decoded = packed[..., 0] / 255 * INDEX_SCALE + INDEX_OFFSET
    assert np.allclose(decoded, level, atol=0.01)
    assert packed[0, 0, 1] == 255 and packed[0, 0, 2] == 127


def test_build_field_prefers_measurements_and_marks_forecast():
    rivers = [{"id": 7, "gauges": [{"uuid": "a", "s": 0.2}, {"uuid": "b", "s": 0.8}]}]
    station_index = {"a": 0, "b": 1}
    measured = np.array([[0.2, np.nan], [0.6, np.nan]], dtype=np.float32)
    forecast = np.array([[np.nan, 0.3], [np.nan, 0.7]], dtype=np.float32)
    spread = np.array([[np.nan, 0.1], [np.nan, 0.5]], dtype=np.float32)
    ids, grid = build_field(rivers, station_index, measured, forecast, spread, np.array([0, 1]), 4)
    assert ids == [7]
    assert grid.shape == (1, 2, 4, 3)
    assert grid[0, 0, :, 1].min() == 255  # step 0 fully measured
    assert grid[0, 1, :, 1].max() == 0  # step 1 is forecast only
    assert grid[0, 1, 0, 2] < grid[0, 1, -1, 2]  # spread grows towards the second gauge
