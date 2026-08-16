from shapely.geometry import LineString, Polygon

from wasserlinie.network import extract, longest_path, stitch


def test_longest_path_walks_the_diameter():
    # A trunk with a short spur: the stem must skip the spur.
    trunk = [LineString(seg) for seg in ([(0, 0), (100, 0)], [(100, 0), (250, 0)], [(250, 0), (300, 0)])]
    spur = [LineString([(100, 0), (100, 30)])]
    order, flags = longest_path(trunk + spur)
    assert sorted(order) == [0, 1, 2]
    stem = stitch(trunk + spur, order, flags)
    assert stem.length == 300


def test_extract_bridges_a_gap_between_lines():
    a = LineString([(0, 0), (1000, 0)])
    b = LineString([(1500, 0), (3000, 0)])  # 500 m gap, well within BRIDGE_M
    stem, arms = extract([a, b], [])
    assert stem is not None
    assert stem.length == 3000
    assert arms == []


def test_extract_uses_polygon_skeleton():
    poly = Polygon([(0, 0), (5000, 0), (5000, 400), (0, 400)])
    stem, _ = extract([], [poly])
    assert stem is not None
    assert 4000 < stem.length < 5200
    # Spurs run into the corners at both ends; the body sits on the medial axis.
    inner = [y for x, y in stem.coords if 600 < x < 4400]
    assert inner and all(150 < y < 250 for y in inner)
