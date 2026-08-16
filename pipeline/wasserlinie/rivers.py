from __future__ import annotations

import json
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import shapefile
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import transform, unary_union

from . import network
from .config import DLM1000_URL, VG2500_URL, Paths, log
from .fetch import write_json
from .names import normalize

# DLM1000 attribute codes: BRG is the width class in metres, WDM the
# waterway status (1310 federal waterway, 1320 first-order water).
MIN_WIDTH_CLASS = 42
WATERWAY_CODES = {"1310", "1320"}
MAIN_WIDTH_CLASS = 125  # everything narrower is background, unless it has a gauge
MIN_STEM_KM = 1.5
MIN_ARM_KM = 4.0
SIMPLIFY_M = 120.0
GAUGE_SNAP_M = 4000.0

to_wgs84 = Transformer.from_crs("EPSG:25832", "EPSG:4326", always_xy=True).transform
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True).transform


@dataclass
class River:
    name: str
    key: str
    cls: int
    line: LineString  # EPSG:25832
    oriented: bool = False
    gauges: list[dict[str, Any]] = field(default_factory=list)

    @property
    def length_km(self) -> float:
        return self.line.length / 1000.0


def download(url: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    log.info("downloading %s", url)
    with httpx.stream("GET", url, timeout=600.0, follow_redirects=True) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(".part")
        with tmp.open("wb") as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
        tmp.replace(dest)
    return dest


def extract_layer(archive: Path, member_prefix: str, into: Path) -> Path:
    """Pull one shapefile (all its sidecars) out of a zip; returns the .shp path."""
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if name.startswith(member_prefix):
                z.extract(name, into)
    return into / f"{member_prefix}.shp"


@dataclass
class Lines:
    by_name: dict[str, list[LineString]] = field(default_factory=lambda: defaultdict(list))
    flow: dict[str, list[LineString]] = field(default_factory=lambda: defaultdict(list))
    width: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    wanted: set[str] = field(default_factory=set)


def load_lines(shp: Path) -> Lines:
    """Axis lines grouped by name, plus the widest class per name and the names worth drawing.

    Segments flagged FLR=1 are digitised in flow direction; they are kept
    separately to orient the merged rivers afterwards.
    """
    reader = shapefile.Reader(str(shp), encoding="utf-8")
    out = Lines()
    for rec, geom in zip(reader.iterRecords(), reader.iterShapes(), strict=True):
        d = rec.as_dict()
        name = (d.get("NAM") or "").strip()
        if not name or "hafen" in name.lower():
            continue
        g = shape(geom.__geo_interface__)
        parts = [p for p in (g.geoms if isinstance(g, MultiLineString) else [g]) if p.length > 0]
        out.by_name[name].extend(parts)
        if d.get("FLR") == 1:
            out.flow[name].extend(parts)
        brg = int(d.get("BRG") or 0)
        out.width[name] = max(out.width[name], brg)
        if brg >= MIN_WIDTH_CLASS or d.get("WDM") in WATERWAY_CODES:
            out.wanted.add(name)
    return out


def load_polygons(shp: Path) -> dict[str, list[Polygon]]:
    """Wide rivers only exist as water areas in the DLM; these get a skeleton later."""
    reader = shapefile.Reader(str(shp), encoding="utf-8")
    polygons: dict[str, list[Polygon]] = defaultdict(list)
    for rec, geom in zip(reader.iterRecords(), reader.iterShapes(), strict=True):
        d = rec.as_dict()
        name = (d.get("NAM") or "").strip()
        if not name or d.get("OBJART_TXT") != "AX_Fliessgewaesser" or "hafen" in name.lower():
            continue
        g = shape(geom.__geo_interface__)
        polygons[name].extend(list(g.geoms) if isinstance(g, MultiPolygon) else [g])
    return polygons


def flows_forward(line: LineString, flow_segments: list[LineString]) -> bool | None:
    """Majority vote of the flow-oriented source segments projected onto the merged line."""
    votes = 0
    for seg in flow_segments:
        if seg.distance(line) > 50:
            continue
        a = line.project(Point(seg.coords[0]))
        b = line.project(Point(seg.coords[-1]))
        if abs(b - a) < 1:
            continue
        votes += 1 if b > a else -1
    if votes == 0:
        return None
    return votes > 0


def build_rivers(lines: Lines, polygons: dict[str, list[Polygon]]) -> list[River]:
    rivers: list[River] = []
    names = lines.wanted | set(polygons)
    for name in sorted(names):
        polys = polygons.get(name, [])
        merged = unary_union(polys) if polys else None
        poly_list = [merged] if isinstance(merged, Polygon) else list(merged.geoms) if merged else []
        stem, arms = network.extract(lines.by_name.get(name, []), poly_list)
        cls = max(lines.width.get(name, 0), 200 if polys else 0)
        parts = [(stem, MIN_STEM_KM)] if stem else []
        parts += [(arm, MIN_ARM_KM) for arm in arms]
        for part, min_km in parts:
            if part.length < min_km * 1000:
                continue
            line = part.simplify(SIMPLIFY_M)
            forward = flows_forward(line, lines.flow.get(name, []))
            if forward is False:
                line = LineString(list(line.coords)[::-1])
            river = River(name=name, key=normalize(name), cls=cls, line=line, oriented=forward is not None)
            rivers.append(river)
    log.info("%d river parts from %d named waters", len(rivers), len(names))
    return rivers


def attach_gauges(rivers: list[River], stations: list[dict[str, Any]]) -> None:
    """Snap each gauge to the closest part of its water and remember where along it sits."""
    by_key: dict[str, list[River]] = defaultdict(list)
    for r in rivers:
        by_key[r.key].append(r)
    hits = 0
    for st in stations:
        candidates = by_key.get(st["waterKey"])
        if not candidates:
            continue
        p = Point(to_utm(st["lon"], st["lat"]))
        best = min(candidates, key=lambda r: r.line.distance(p))
        if best.line.distance(p) > GAUGE_SNAP_M:
            continue
        s = best.line.project(p, normalized=True)
        best.gauges.append({"uuid": st["uuid"], "s": s, "zero": st.get("zero")})
        hits += 1
    log.info("%d gauges snapped onto rivers", hits)


def orient_by_gauge_datum(river: River) -> None:
    """Fallback for parts without flow-flagged segments: gauge datums drop downstream."""
    if river.oriented:
        return
    with_zero = sorted((g for g in river.gauges if g.get("zero") is not None), key=lambda g: g["s"])
    if len(with_zero) < 2:
        return
    if with_zero[-1]["zero"] > with_zero[0]["zero"] + 0.5:
        river.line = LineString(list(river.line.coords)[::-1])
        for g in river.gauges:
            g["s"] = 1.0 - g["s"]


def river_records(rivers: list[River]) -> list[dict[str, Any]]:
    out = []
    for i, r in enumerate(sorted(rivers, key=lambda r: (-r.cls, -r.length_km))):
        wgs = transform(to_wgs84, r.line)
        out.append(
            {
                "id": i,
                "name": r.name,
                "cls": r.cls,
                "km": round(r.length_km, 1),
                "coords": [[round(x, 4), round(y, 4)] for x, y in wgs.coords],
                "gauges": [
                    {"uuid": g["uuid"], "s": round(g["s"], 4)} for g in sorted(r.gauges, key=lambda g: g["s"])
                ],
            }
        )
    return out


def build_outline(shp: Path) -> list[list[list[float]]]:
    reader = shapefile.Reader(str(shp), encoding="utf-8")
    land = [
        transform(to_wgs84, shape(geom.__geo_interface__))
        for rec, geom in zip(reader.iterRecords(), reader.iterShapes(), strict=True)
        if rec.as_dict().get("GF") == 9
    ]
    merged = unary_union(land).simplify(0.003, preserve_topology=True)
    polys = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    return [[[round(x, 4), round(y, 4)] for x, y in p.exterior.coords] for p in polys if p.area > 0.001]


def run(paths: Paths) -> None:
    dlm = download(DLM1000_URL, paths.cache / "dlm1000.zip")
    lines = load_lines(extract_layer(dlm, "dlm1000_ebenen/gew01_l", paths.cache / "dlm1000"))
    polygons = load_polygons(extract_layer(dlm, "dlm1000_ebenen/gew01_f", paths.cache / "dlm1000"))
    rivers = build_rivers(lines, polygons)

    if paths.stations.exists():
        stations = json.loads(paths.stations.read_text(encoding="utf-8"))["stations"]
        attach_gauges(rivers, stations)
        for r in rivers:
            orient_by_gauge_datum(r)
    else:
        log.warning("no stations.json yet, rivers get no gauges")

    records = river_records(rivers)
    # Split so the browser can draw the rivers that carry data before the
    # fine background network has even arrived.
    main = [r for r in records if r["gauges"] or r["cls"] >= MAIN_WIDTH_CLASS]
    main_ids = {r["id"] for r in main}
    detail = [r for r in records if r["id"] not in main_ids]
    write_json(paths.rivers, {"rivers": main})
    write_json(paths.rivers_detail, {"rivers": detail})
    log.info(
        "rivers.json: %d parts, %d with gauges; rivers-detail.json: %d parts",
        len(main),
        sum(1 for r in main if r["gauges"]),
        len(detail),
    )

    vg = download(VG2500_URL, paths.cache / "vg2500.zip")
    outline = build_outline(extract_layer(vg, "vg2500/VG2500_STA", paths.cache / "vg2500"))
    write_json(paths.germany, {"rings": outline})
    log.info("germany.json: %d rings", len(outline))
