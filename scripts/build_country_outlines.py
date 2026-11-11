#!/usr/bin/env python3
"""Build data/country-outlines.json: simplified Natural Earth 50m country polygons.

The Natural Earth shapefile is not committed (public domain). The derived,
simplified GeoJSON is committed so CI need not run this or ship the shapefile.

ISO codes follow the same rule as scripts/build_country_climates.py:
ISO_A2 if it is a real 2-letter code, otherwise ISO_A2_EH (Taiwan, Norway, …).
"""
from __future__ import annotations

import json, re, sys
from collections import defaultdict
from pathlib import Path

import shapefile
from shapely.geometry import mapping, shape, GeometryCollection, MultiPolygon, Polygon
from shapely import make_valid, union_all, set_precision

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "country-outlines.json"
SHAPE_CANDIDATES = [
    Path("/tmp/ne/ne_50m_admin_0_countries.shp"),
    ROOT / "data/naturalearth/ne_50m_admin_0_countries.shp",
]
# ~5–6 km at the equator; enough for a country inset, small on the wire.
TOLERANCE_DEG = 0.05
# Round to ~100 m so the JSON stays compact.
PRECISION = 0.001


def iso_of(rec: dict) -> str | None:
    for key in ("ISO_A2", "ISO_A2_EH"):
        v = str(rec.get(key) or "").strip().upper()
        if re.fullmatch(r"[A-Z]{2}", v):
            return v
    return None


def as_multipolygon(geom):
    geom = make_valid(geom)
    if geom.is_empty:
        return None
    if isinstance(geom, Polygon):
        return MultiPolygon([geom]) if geom.area > 0 else None
    if isinstance(geom, MultiPolygon):
        parts = [p for p in geom.geoms if not p.is_empty and p.area > 0]
        return MultiPolygon(parts) if parts else None
    if isinstance(geom, GeometryCollection):
        parts = []
        for g in geom.geoms:
            m = as_multipolygon(g)
            if m:
                parts.extend(m.geoms)
        return MultiPolygon(parts) if parts else None
    return None


def coords_of(geom) -> list:
    """GeoJSON MultiPolygon coordinates, lon/lat rounded to 3 decimals, closed rings."""
    polys = []
    for poly in geom.geoms:
        rings = []
        for ring in [poly.exterior, *poly.interiors]:
            pts = []
            for x, y in ring.coords:
                x, y = round(float(x), 3), round(float(y), 3)
                if not pts or pts[-1] != [x, y]:
                    pts.append([x, y])
            if len(pts) >= 4:
                if pts[0] != pts[-1]:
                    pts.append(pts[0])
                if len(pts) >= 4:
                    rings.append(pts)
        if rings:
            polys.append(rings)
    return polys


def main() -> int:
    shp = next((p for p in SHAPE_CANDIDATES if p.exists()), None)
    if not shp:
        print("Natural Earth shapefile not found. Expected one of:", file=sys.stderr)
        for p in SHAPE_CANDIDATES:
            print(f"  {p}", file=sys.stderr)
        return 1

    reader = shapefile.Reader(str(shp))
    by_iso: dict[str, list] = defaultdict(list)
    skipped = 0
    for sr in reader.iterShapeRecords():
        rec = sr.record.as_dict()
        iso = iso_of(rec)
        if not iso:
            skipped += 1
            continue
        try:
            geom = as_multipolygon(shape(sr.shape.__geo_interface__))
        except Exception as e:
            print(f"skip {iso}: {e}", file=sys.stderr)
            skipped += 1
            continue
        if geom:
            by_iso[iso].append(geom)
    reader.close()

    countries = {}
    for iso, geoms in sorted(by_iso.items()):
        merged = as_multipolygon(union_all(geoms) if len(geoms) > 1 else geoms[0])
        if not merged:
            continue
        simple = as_multipolygon(merged.simplify(TOLERANCE_DEG, preserve_topology=True))
        if not simple:
            simple = merged
        try:
            simple = as_multipolygon(set_precision(simple, PRECISION)) or simple
        except Exception:
            pass
        coords = coords_of(simple)
        if not coords:
            continue
        countries[iso] = {"type": "MultiPolygon", "coordinates": coords}

    payload = {
        "attribution": (
            "Country outlines are simplified from Natural Earth Admin 0 – Countries, "
            "1:50m (public domain). They are for map display only and are not an "
            "authoritative boundary dataset."
        ),
        "license": "public-domain",
        "source": "Natural Earth Admin 0 – Countries, 1:50m",
        "source_url": "https://www.naturalearthdata.com/",
        "tolerance_deg": TOLERANCE_DEG,
        "countries": countries,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    size = OUT.stat().st_size
    print(f"Wrote {OUT} ({size:,} bytes, {len(countries)} countries, {skipped} records skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
