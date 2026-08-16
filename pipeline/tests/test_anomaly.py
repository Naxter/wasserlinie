import numpy as np

from wasserlinie.anomaly import reference_curve, state_of, states_for, station_curves


def marks(**kw: float) -> dict[str, float]:
    return dict(kw)


FULL = marks(NNW=0, MNW=100, MW=200, MHW=400, HHW=600)


def test_curve_needs_the_low_and_high_water_pair():
    assert reference_curve(FULL) is not None
    # MNW and MHW carry the scale; without them the middle would be guesswork.
    assert reference_curve(marks(NNW=0, MW=200, HHW=600)) is None
    # A gauge whose statistics contradict each other is dropped, not reordered.
    assert reference_curve(marks(MNW=300, MW=200, MHW=400)) is None
    # A pair that barely spans anything says nothing useful either.
    assert reference_curve(marks(MNW=100, MW=105, MHW=110)) is None


def test_tidal_gauges_get_no_scale():
    assert reference_curve(marks(**FULL, MTnw=50, MThw=350)) is None


def test_named_levels_land_on_their_own_anchors():
    curve = reference_curve(FULL)
    assert curve is not None
    got = state_of(curve, np.array([0.0, 100.0, 200.0, 400.0, 600.0]))
    assert [round(float(v), 3) for v in got] == [-1.0, -0.5, 0.0, 0.5, 1.0]
    # Halfway between MW and MHW sits halfway between their states.
    assert round(float(state_of(curve, np.array([300.0]))[0]), 3) == 0.25


def test_record_breaking_levels_keep_moving():
    curve = reference_curve(FULL)
    assert curve is not None
    # Below the record low the scale continues instead of piling up on -1,
    # so a historic drought still shows degrees.
    below = state_of(curve, np.array([-50.0, -100.0]))
    assert below[0] < -1.0
    assert below[1] < below[0]
    above = state_of(curve, np.array([700.0]))
    assert above[0] > 1.0


def test_states_for_leaves_unplaceable_stations_as_nan():
    stations = [
        {"uuid": "a", "refYears": 20, "marks": FULL},
        {"uuid": "b", "refYears": 20, "marks": marks(NNW=0, MW=200)},
        {"uuid": "c", "refYears": 2, "marks": FULL},
    ]
    curves = station_curves(stations)
    assert set(curves) == {"a"}
    station = np.array(["b", "a", "c", "a"])
    cm = np.array([200.0, 200.0, 200.0, 400.0])
    got = states_for(curves, station, cm)
    assert np.isnan(got[0]) and np.isnan(got[2])
    assert round(float(got[1]), 3) == 0.0
    assert round(float(got[3]), 3) == 0.5
