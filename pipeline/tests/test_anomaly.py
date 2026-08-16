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


def test_seasonal_reference_beats_the_year_round_marks():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves, states_for

    seasonal = pd.DataFrame(
        [
            # A dry-season day: normal is 185, the record low for the date is 7.
            dict(station="a", doy=226, lo=7, p10=82, p25=120, p50=185, p75=240, p90=295, hi=497),
            # A wet-season day at the same gauge sits much higher.
            dict(station="a", doy=26, lo=90, p10=200, p25=260, p50=340, p75=430, p90=520, hi=800),
        ]
    )
    curves = seasonal_curves(seasonal)
    assert set(curves) == {("a", 226), ("a", 26)}

    station = np.array(["a", "a"])
    cm = np.array([185.0, 185.0])
    doy = np.array([226, 26])
    got = states_for({}, station, cm, doy, curves)
    # The identical reading is normal in August and a drought in January.
    assert round(float(got[0]), 2) == 0.0
    assert got[1] < -0.5


def test_a_record_for_the_date_lands_on_minus_one():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves, states_for

    seasonal = pd.DataFrame(
        [dict(station="a", doy=226, lo=7, p10=82, p25=120, p50=185, p75=240, p90=295, hi=497)]
    )
    curves = seasonal_curves(seasonal)
    got = states_for({}, np.array(["a"]), np.array([7.0]), np.array([226]), curves)
    assert round(float(got[0]), 2) == -1.0


def test_nearest_doy_wraps_around_new_year():
    from wasserlinie.anomaly import nearest_doy

    sampled = np.array([1, 91, 181, 271, 361])
    # Day 364 is three days before 361 but only two days before day 1 once the
    # year wraps, so the wrap has to win.
    assert list(nearest_doy(sampled, np.array([3, 364, 200, 350]))) == [1, 1, 181, 361]
