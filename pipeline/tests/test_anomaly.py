import numpy as np

from wasserlinie.anomaly import ranks_for, reference_curve, station_curves


def marks(**kw: float) -> dict[str, float]:
    return dict(kw)


def test_curve_needs_three_increasing_marks():
    assert reference_curve(marks(MNW=100, MHW=400)) is None
    assert reference_curve(marks(MNW=100, MW=200, MHW=400)) is not None
    # Contradictory statistics are dropped rather than silently reordered.
    assert reference_curve(marks(MNW=300, MW=200, MHW=400)) is None


def test_tidal_gauges_get_no_rank():
    assert reference_curve(marks(NNW=0, MNW=100, MW=200, MHW=400, HHW=600, MTnw=50, MThw=350)) is None


def test_rank_follows_the_published_marks():
    curve = reference_curve(marks(NNW=0, MNW=100, MW=200, MHW=400, HHW=600))
    assert curve is not None
    values = np.array([-50.0, 0.0, 100.0, 200.0, 400.0, 600.0, 900.0])
    got = np.interp(values, curve[0], curve[1], left=0.0, right=1.0)
    assert list(np.round(got, 3)) == [0.0, 0.0, 0.05, 0.5, 0.95, 1.0, 1.0]
    # Halfway between MW and MHW sits halfway between their ranks.
    assert round(float(np.interp(300.0, curve[0], curve[1])), 3) == 0.725


def test_ranks_for_leaves_stations_without_a_curve_as_nan():
    stations = [
        {"uuid": "a", "refYears": 20, "marks": marks(NNW=0, MNW=100, MW=200, MHW=400, HHW=600)},
        {"uuid": "b", "refYears": 20, "marks": marks(MNW=100, MHW=400)},
        {"uuid": "c", "refYears": 2, "marks": marks(NNW=0, MNW=100, MW=200, MHW=400, HHW=600)},
    ]
    curves = station_curves(stations)
    assert set(curves) == {"a"}
    station = np.array(["b", "a", "c", "a"])
    cm = np.array([200.0, 200.0, 200.0, 400.0])
    got = ranks_for(curves, station, cm)
    assert np.isnan(got[0]) and np.isnan(got[2])
    assert round(float(got[1]), 3) == 0.5
    assert round(float(got[3]), 3) == 0.95
