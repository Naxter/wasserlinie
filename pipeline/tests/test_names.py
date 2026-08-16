from wasserlinie.names import normalize, water_key


def test_normalize_ignores_case_umlauts_and_punctuation():
    assert normalize("Elbe-Lübeck-Kanal") == normalize("ELBE-LÜBECK-KANAL") == "elbeluebeckkanal"
    assert normalize("STORKOWER GEWAESSER") == normalize("Storkower Gewässer")
    assert normalize("Weiße Elster") == "weisseelster"


def test_water_key_maps_waterway_names_to_river_names():
    assert water_key("UNTERE HAVEL-WASSERSTRASSE") == normalize("Havel")
    assert water_key("ELBESEITENKANAL") == normalize("Elbe-Seitenkanal")
    assert water_key("RHEIN") == "rhein"
