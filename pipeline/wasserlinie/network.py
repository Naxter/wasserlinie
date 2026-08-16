from __future__ import annotations

import heapq
import math
from collections import defaultdict
from collections.abc import Iterable, Sequence

import shapely
from shapely.geometry import LineString, MultiLineString, MultiPoint, Point, Polygon
from shapely.ops import linemerge, unary_union

# The DLM draws narrow rivers as axis lines but wide ones (Rhine, Elbe,
# Danube) as water polygons without an axis. This module turns polygons into
# a Voronoi skeleton, glues it to the axis lines of the same name and walks
# the longest path through the result: the main stem.

SKELETON_DENSITY_M = 200.0
BRIDGE_M = 3000.0
MIN_POLYGON_AREA_M2 = 1e5

Node = tuple[int, int]


def _node(c: Sequence[float]) -> Node:
    return (round(c[0]), round(c[1]))


def skeleton(poly: Polygon) -> list[LineString]:
    """Voronoi edges of the densified boundary that lie inside the polygon."""
    dense = shapely.segmentize(poly, SKELETON_DENSITY_M)
    points: list[tuple[float, float]] = []
    for ring in (dense.exterior, *dense.interiors):
        points.extend(ring.coords[:-1])
    if len(points) < 4:
        return []
    edges = list(shapely.voronoi_polygons(MultiPoint(points), only_edges=True).geoms)
    shapely.prepare(poly)
    inside = shapely.contains(poly, edges)
    return [e for e, ok in zip(edges, inside, strict=True) if ok]


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[Node, Node] = {}

    def find(self, a: Node) -> Node:
        self.parent.setdefault(a, a)
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def union(self, a: Node, b: Node) -> None:
        self.parent[self.find(a)] = self.find(b)


def bridge_gaps(lines: list[LineString], skeleton_edges: list[LineString]) -> list[LineString]:
    """Straight connectors from loose line ends to the nearest node of another component.

    Only line ends are bridged. Skeleton spurs end near the bank on purpose and
    must not be allowed to short-cut a meander.
    """
    segments = lines + skeleton_edges
    uf = UnionFind()
    degree: dict[Node, int] = defaultdict(int)
    for s in segments:
        a, b = _node(s.coords[0]), _node(s.coords[-1])
        uf.union(a, b)
        degree[a] += 1
        degree[b] += 1
    nodes = list(degree)
    tree = shapely.STRtree([Point(n) for n in nodes])
    candidates: list[tuple[float, Node, Node]] = []
    for s in lines:
        for end in (s.coords[0], s.coords[-1]):
            a = _node(end)
            if degree[a] != 1:
                continue
            for idx in tree.query(Point(a).buffer(BRIDGE_M)):
                b = nodes[idx]
                d = math.dist(a, b)
                if 0 < d <= BRIDGE_M and uf.find(a) != uf.find(b):
                    candidates.append((d, a, b))
    # Shortest gaps first, each one only if it still joins two separate pieces.
    bridges: list[LineString] = []
    for _, a, b in sorted(candidates):
        if uf.find(a) == uf.find(b):
            continue
        bridges.append(LineString([a, b]))
        uf.union(a, b)
    return bridges


def longest_path(segments: list[LineString]) -> tuple[list[int], list[bool]]:
    """Indices of the segments on the graph diameter, plus whether each is walked reversed."""
    adjacency: dict[Node, list[tuple[Node, float, int]]] = defaultdict(list)
    for i, s in enumerate(segments):
        a, b = _node(s.coords[0]), _node(s.coords[-1])
        adjacency[a].append((b, s.length, i))
        adjacency[b].append((a, s.length, i))
    if not adjacency:
        return [], []

    def dijkstra(src: Node) -> tuple[dict[Node, float], dict[Node, tuple[Node, int]]]:
        dist = {src: 0.0}
        prev: dict[Node, tuple[Node, int]] = {}
        heap = [(0.0, src)]
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist[u]:
                continue
            for v, w, i in adjacency[u]:
                nd = d + w
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = (u, i)
                    heapq.heappush(heap, (nd, v))
        return dist, prev

    # The graph may still be several islands; the stem is the diameter of the longest one.
    seen: set[Node] = set()
    best_len = -1.0
    best: tuple[Node, dict[Node, tuple[Node, int]]] | None = None
    for seed in adjacency:
        if seed in seen:
            continue
        dist, _ = dijkstra(seed)
        seen.update(dist)
        start = max(dist, key=dist.__getitem__)
        dist, prev = dijkstra(start)
        end = max(dist, key=dist.__getitem__)
        if dist[end] > best_len:
            best_len = dist[end]
            best = (end, prev)
    assert best is not None
    end, prev = best

    order: list[int] = []
    reversed_flags: list[bool] = []
    node = end
    while node in prev:
        parent, i = prev[node]
        order.append(i)
        reversed_flags.append(_node(segments[i].coords[0]) != parent)
        node = parent
    return order[::-1], reversed_flags[::-1]


def stitch(segments: list[LineString], order: list[int], reversed_flags: list[bool]) -> LineString:
    coords: list[tuple[float, float]] = []
    for i, rev in zip(order, reversed_flags, strict=True):
        c = list(segments[i].coords)
        if rev:
            c.reverse()
        if coords and coords[-1] == c[0]:
            c = c[1:]
        coords.extend(c)
    return LineString(coords)


def merge_parts(lines: Iterable[LineString]) -> list[LineString]:
    lines = [ln for ln in lines if ln.length > 0]
    if not lines:
        return []
    merged = unary_union(lines)
    if isinstance(merged, MultiLineString):
        merged = linemerge(merged)
    if isinstance(merged, LineString):
        return [merged]
    return [p for p in merged.geoms if isinstance(p, LineString)]


def extract(lines: list[LineString], polygons: list[Polygon]) -> tuple[LineString | None, list[LineString]]:
    """Main stem and leftover side arms for one named water."""
    chains = merge_parts(lines)
    skel: list[LineString] = []
    for poly in polygons:
        if poly.area >= MIN_POLYGON_AREA_M2:
            skel.extend(skeleton(poly))
    if not chains and not skel:
        return None, []
    bridges = bridge_gaps(chains, skel) if skel or len(chains) > 1 else []
    segments = chains + skel + bridges
    order, flags = longest_path(segments)
    if not order:
        return None, []
    stem = stitch(segments, order, flags)
    used = set(order)
    leftovers = [s for i, s in enumerate(chains) if i not in used]
    return stem, merge_parts(leftovers)
