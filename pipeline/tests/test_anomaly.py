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


def test_a_held_level_gets_no_seasonal_reference():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves

    # A canal reach held at 65 cm: the whole distribution is a millimetre wide,
    # so a 2 cm wobble would otherwise be drawn as a record for the date.
    canal = dict(station="canal", doy=226, lo=64.8, p10=64.9, p25=65.0, p50=65.1, p75=65.2, p90=65.3, hi=65.4)
    river = dict(station="river", doy=226, lo=7, p10=82, p25=120, p50=185, p75=240, p90=295, hi=497)
    curves = seasonal_curves(pd.DataFrame([canal, river]))
    assert set(curves) == {("river", 226)}


def test_a_gap_in_the_seasonal_record_falls_back_to_the_marks():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves, states_for

    # A gauge that only has a usable reference in January.
    seasonal = pd.DataFrame(
        [dict(station="a", doy=26, lo=90, p10=200, p25=260, p50=340, p75=430, p90=520, hi=800)]
    )
    curves = seasonal_curves(seasonal)
    marks_curves = station_curves([{"uuid": "a", "refYears": 20, "marks": FULL}])
    station, cm = np.array(["a"]), np.array([340.0])

    # Four days from the sampled day: inside the window the reference was built
    # from, so 340 is the median for the date.
    near = states_for(marks_curves, station, cm, np.array([30]), curves)
    assert round(float(near[0]), 3) == 0.0
    # In August the nearest sampled day is 165 days away. Judging the reading
    # against January would be a lie, so it drops back to the year-round marks,
    # where 340 sits between MW and MHW.
    far = states_for(marks_curves, station, cm, np.array([226]), curves)
    assert round(float(far[0]), 3) == 0.35


def test_a_distant_seasonal_day_without_marks_stays_unplaced():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves, states_for

    seasonal = pd.DataFrame(
        [dict(station="a", doy=26, lo=90, p10=200, p25=260, p50=340, p75=430, p90=520, hi=800)]
    )
    curves = seasonal_curves(seasonal)
    got = states_for({}, np.array(["a"]), np.array([340.0]), np.array([226]), curves)
    # No marks to fall back to: grey is the honest answer, not January's curve.
    assert np.isnan(got[0])


def test_basis_only_claims_seasonal_where_the_reference_reaches():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves, tag_basis

    seasonal = pd.DataFrame(
        [dict(station="a", doy=26, lo=90, p10=200, p25=260, p50=340, p75=430, p90=520, hi=800)]
    )
    curves = seasonal_curves(seasonal)
    stations = [{"uuid": "a", "refYears": 20, "marks": FULL}]
    marks_curves = station_curves(stations)

    tag_basis(stations, marks_curves, curves, doy=30)
    assert stations[0]["basis"] == "seasonal"
    # Far from the only sampled day the panel must not promise a seasonal
    # comparison, because the reading was not placed on one.
    tag_basis(stations, marks_curves, curves, doy=226)
    assert stations[0]["basis"] == "marks"


def test_nearest_doy_wraps_around_new_year():
    from wasserlinie.anomaly import nearest_doy

    sampled = np.array([1, 91, 181, 271, 361])
    # Day 364 is three days before 361 but only two days before day 1 once the
    # year wraps, so the wrap has to win.
    assert list(nearest_doy(sampled, np.array([3, 364, 200, 350]))) == [1, 1, 181, 361]


def test_seasonal_reference_skips_a_gauge_that_swings_all_day():
    import pandas as pd

    from wasserlinie.archive import seasonal_reference

    days = pd.date_range("2000-01-01", "2020-12-31", freq="D")
    rng = np.random.default_rng(3)
    mean = 400 + rng.normal(0, 30, len(days))
    frame = []
    for name, swing in (("inland", 4.0), ("tideway", 300.0)):
        frame.append(
            pd.DataFrame(
                {
                    "station": name,
                    "day": days,
                    "mean": mean,
                    "min": mean - swing / 2,
                    "max": mean + swing / 2,
                }
            )
        )
    out = seasonal_reference(pd.concat(frame, ignore_index=True))
    # Both have the same daily means; only one of them is described by them.
    # A gauge that runs out three metres every low tide publishes no MTnw here,
    # so the swing is the only thing that gives it away.
    assert set(out["station"].unique()) == {"inland"}


def test_a_scale_error_in_the_archive_is_not_a_reference():
    import pandas as pd

    from wasserlinie.anomaly import seasonal_curves

    # Velsdorf's raw archive jumps a factor of 100 between eras.
    broken = dict(
        station="broken", doy=226, lo=2082, p10=5604, p25=9e4, p50=5.6e5, p75=5.61e5, p90=5.617e5, hi=5.63e5
    )
    river = dict(station="river", doy=226, lo=7, p10=82, p25=120, p50=185, p75=240, p90=295, hi=497)
    assert set(seasonal_curves(pd.DataFrame([broken, river]))) == {("river", 226)}


def test_seasonal_reference_skips_tidal_gauges():
    import pandas as pd

    from wasserlinie.archive import seasonal_reference

    days = pd.date_range("2000-01-01", "2020-12-31", freq="D")
    level = np.linspace(100, 200, len(days))
    daily = pd.concat(
        [
            pd.DataFrame({"station": u, "day": days, "mean": level, "min": level - 2, "max": level + 2})
            for u in ("inland", "tidal")
        ],
        ignore_index=True,
    )
    out = seasonal_reference(daily, skip={"tidal"})
    # A tidal gauge must not get a reference an instantaneous reading would be
    # placed on; its level swings between two tides every day.
    assert set(out["station"].unique()) == {"inland"}
