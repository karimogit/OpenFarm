#!/usr/bin/env python3
"""Build data/country-climates.json: approximate climate-region shares per country.

Assigns each land cell of the Beck et al. (2018) 0.5° Köppen grid (CC BY 4.0) to a
country using Natural Earth Admin 0 1:50m boundaries (public domain), then computes
area-weighted shares (cos(latitude) weights) of OpenFarm climate regions.

Countries too small to contain a 0.5° cell centre, or missing from the 50m
boundaries, get a city-sample fallback from GeoNames cities15000 / country
capitals (CC BY 4.0): the climate is reported from those points, not as an
area share.

The Natural Earth shapefile is not committed. The derived JSON is committed
so CI need not run this.
"""
from __future__ import annotations

import json, math, re, sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TIF = ROOT / "data/koppen/Beck_KG_V1_present_0p5.tif"
LEGEND = ROOT / "data/koppen/legend.txt"
REGIONS = ROOT / "content/regions"
PLACES = ROOT / "data/places.json"
OUT = ROOT / "data/country-climates.json"
SHAPE_CANDIDATES = [
    Path("/tmp/ne/ne_50m_admin_0_countries.shp"),
    ROOT / "data/naturalearth/ne_50m_admin_0_countries.shp",
]


def load_legend():
    val_to_kg = {}
    for line in LEGEND.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*(\d+):\s+(\S+)", line)
        if m:
            val_to_kg[int(m.group(1))] = m.group(2)
    return val_to_kg


def load_kg_to_region():
    mapping = {}
    for p in REGIONS.glob("*.md"):
        text = p.read_text(encoding="utf-8")
        fm = text.split("---", 2)[1]
        slug = None
        kgs = []
        for line in fm.splitlines():
            if line.startswith("slug:"):
                slug = line.split(":", 1)[1].strip()
            if line.startswith("koppen:"):
                kgs = re.findall(r"[A-Z][A-Za-z]+", line)
        if slug:
            for k in kgs:
                mapping[k] = slug
    return mapping


def iso_of(rec, fields):
    def g(k):
        try:
            return str(rec[fields.index(k)]).strip()
        except (ValueError, IndexError):
            return ""
    for key in ("ISO_A2", "ISO_A2_EH"):
        v = g(key).upper()
        if re.fullmatch(r"[A-Z]{2}", v):
            return v
    return None


def load_grid():
    val_to_kg = load_legend()
    kg_to_region = load_kg_to_region()
    grid = np.array(Image.open(TIF)).astype(np.uint8)
    assert grid.shape == (360, 720), grid.shape
    return grid, val_to_kg, kg_to_region


def lookup_cell(grid, val_to_kg, kg_to_region, lon, lat):
    if lat > 90 or lat < -90:
        return None, None
    r = int((90 - lat) / 0.5)
    c = int((lon + 180) / 0.5)
    r = min(max(r, 0), 359)
    c = min(max(c, 0), 719)
    kg = val_to_kg.get(int(grid[r, c]))
    return kg, (kg_to_region.get(kg) if kg else None)


def pcts(d, total):
    if total <= 0:
        return {}
    out = {k: round(100.0 * w / total, 1) for k, w in d.items()}
    return {k: v for k, v in sorted(out.items(), key=lambda kv: -kv[1]) if v >= 0.1}


def core_bbox(cells, min_frac=0.85):
    """Bbox of the lon-cluster that holds most of the weight (drops far-flung overseas)."""
    if not cells:
        return None
    cells = sorted(cells, key=lambda x: x[0])  # lon
    # split into lon-gap clusters (gap > 20°)
    clusters = []
    cur = [cells[0]]
    for cell in cells[1:]:
        if cell[0] - cur[-1][0] > 20:
            clusters.append(cur)
            cur = [cell]
        else:
            cur.append(cell)
    clusters.append(cur)
    # unwrap 180°: first and last cluster may be the same (e.g. Russia, Fiji)
    if len(clusters) >= 2 and (cells[-1][0] - 360) - (-180 if False else cells[0][0] - 360) and (cells[0][0] + 360 - cells[-1][0] <= 20):
        clusters[0] = clusters[-1] + [(lon + 360, lat, w) for lon, lat, w in clusters[0]]
        clusters.pop()
    best = max(clusters, key=lambda cl: sum(w for _, _, w in cl))
    total = sum(w for _, _, w in cells)
    # shrink to the tightest lon/lat window covering min_frac of this cluster
    best = sorted(best, key=lambda x: x[0])
    tw = sum(w for _, _, w in best)
    # use all of principal cluster (already dropped overseas)
    lons = [x[0] for x in best]
    lats = [x[1] for x in best]
    minlon, maxlon = min(lons), max(lons)
    if maxlon > 180:
        # stayed unwrapped; store as-is and let the map handle wrap, or wrap back
        pass
    return [round(minlon if minlon <= 180 else minlon - 360, 3),
            round(min(lats), 3),
            round(maxlon if maxlon <= 180 else (maxlon if maxlon - minlon < 180 else maxlon - 360), 3),
            round(max(lats), 3)]


def main():
    import shapefile
    from shapely.geometry import shape, Point
    from shapely.prepared import prep
    from shapely.ops import unary_union

    shp = next((p for p in SHAPE_CANDIDATES if p.exists()), None)
    if not shp:
        sys.exit("Natural Earth shapefile not found. Download ne_50m_admin_0_countries and place it in /tmp/ne/")

    grid, val_to_kg, kg_to_region = load_grid()

    sf = shapefile.Reader(str(shp))
    fields = [f[0] for f in sf.fields[1:]]
    by_iso = defaultdict(list)
    for rec, shp_rec in zip(sf.records(), sf.shapes()):
        iso = iso_of(rec, fields)
        if not iso:
            continue
        geom = shape(shp_rec.__geo_interface__)
        if geom.is_empty:
            continue
        by_iso[iso].append(geom)

    prepared = {}
    bounds = {}
    for iso, geoms in by_iso.items():
        g = unary_union(geoms)
        if g.is_empty:
            continue
        prepared[iso] = prep(g)
        bounds[iso] = g.bounds

    region_w = defaultdict(lambda: defaultdict(float))
    kg_w = defaultdict(lambda: defaultdict(float))
    total_w = defaultdict(float)
    cells_of = defaultdict(list)
    cell_bbox = defaultdict(lambda: [180, 90, -180, -90])

    rows, cols = grid.shape
    iso_list = list(prepared.items())

    for r in range(rows):
        lat = 90 - (r + 0.5) * 0.5
        weight = math.cos(math.radians(lat))
        if weight <= 0:
            continue
        for c in range(cols):
            v = int(grid[r, c])
            kg = val_to_kg.get(v)
            if not kg:
                continue
            region = kg_to_region.get(kg)
            if not region:
                continue
            lon = -180 + (c + 0.5) * 0.5
            pt = Point(lon, lat)
            hit = None
            for iso, pg in iso_list:
                b = bounds[iso]
                if lon < b[0] or lon > b[2] or lat < b[1] or lat > b[3]:
                    continue
                if pg.contains(pt) or pg.covers(pt):
                    hit = iso
                    break
            if not hit:
                continue
            region_w[hit][region] += weight
            kg_w[hit][kg] += weight
            total_w[hit] += weight
            cells_of[hit].append((lon, lat, weight))
            bb = cell_bbox[hit]
            if lon < bb[0]: bb[0] = lon
            if lat < bb[1]: bb[1] = lat
            if lon > bb[2]: bb[2] = lon
            if lat > bb[3]: bb[3] = lat

    countries = {}
    for iso, tot in sorted(total_w.items()):
        b = cell_bbox[iso]
        countries[iso] = {
            "iso2": iso,
            "method": "area",
            "weight": round(tot, 4),
            "regions": pcts(region_w[iso], tot),
            "koppen": pcts(kg_w[iso], tot),
            "bbox": [round(b[0], 3), round(b[1], 3), round(b[2], 3), round(b[3], 3)],
            "map_bbox": core_bbox(cells_of[iso]) or [round(b[0], 3), round(b[1], 3), round(b[2], 3), round(b[3], 3)],
        }

    # City/capital fallback for countries with no 0.5° cell centre inside their polygon
    places = json.loads(PLACES.read_text(encoding="utf-8"))
    gn_countries = places["countries"]
    cities_by_cc = defaultdict(list)
    for row in places["cities"]:
        name, ascii, cc, admin, lat, lon, pop = row
        cities_by_cc[cc].append((pop or 0, lat, lon, name))

    for cc, row in gn_countries.items():
        if cc in countries:
            continue
        name, capital, clat, clon, pop = (list(row) + [None, None, None, None, 0])[:5]
        samples = []
        if clat is not None and clon is not None:
            samples.append((capital or name, clat, clon, "capital"))
        for pop_c, lat, lon, cname in sorted(cities_by_cc.get(cc, []), reverse=True)[:8]:
            samples.append((cname, lat, lon, "city"))
        # dedupe by rounded coord
        seen = set()
        kg_counts = defaultdict(int)
        region_counts = defaultdict(int)
        n = 0
        lons, lats = [], []
        for cname, lat, lon, _kind in samples:
            key = (round(lat, 2), round(lon, 2))
            if key in seen:
                continue
            seen.add(key)
            kg, region = lookup_cell(grid, val_to_kg, kg_to_region, lon, lat)
            if not region:
                continue
            n += 1
            kg_counts[kg] += 1
            region_counts[region] += 1
            lons.append(lon)
            lats.append(lat)
        if n == 0:
            continue
        countries[cc] = {
            "iso2": cc,
            "method": "cities",
            "sample_count": n,
            "regions": pcts(region_counts, n),
            "koppen": pcts(kg_counts, n),
            "bbox": [round(min(lons), 3), round(min(lats), 3), round(max(lons), 3), round(max(lats), 3)],
            "map_bbox": [round(min(lons) - 0.75, 3), round(min(lats) - 0.5, 3),
                         round(max(lons) + 0.75, 3), round(max(lats) + 0.5, 3)],
        }

    out = {
        "attribution": (
            "Climate shares are approximate. For countries large enough to contain a 0.5° "
            "grid cell centre, they are area-weighted fractions of Beck et al. (2018) "
            "Köppen–Geiger land cells (CC BY 4.0) assigned with Natural Earth Admin 0 1:50m "
            "boundaries (public domain). Tiny territories use a sample of GeoNames capitals "
            "and cities (CC BY 4.0) instead of an area share. Small fragments, coasts, and "
            "overseas holdings can be misclassified at this resolution. The inset map uses "
            "the principal land cluster and may omit far-flung territories."
        ),
        "sources": [
            {
                "title": "Present and future Köppen-Geiger climate classification maps at 1-km resolution",
                "publisher": "Beck et al. (2018), Scientific Data 5, 180214",
                "url": "https://www.gloh2o.org/koppen/",
                "license": "CC-BY-4.0",
            },
            {
                "title": "Natural Earth Admin 0 – Countries, 1:50m",
                "publisher": "Natural Earth",
                "url": "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/",
                "license": "public-domain",
            },
            {
                "title": "GeoNames gazetteer (countryInfo, cities15000)",
                "publisher": "GeoNames",
                "url": "https://download.geonames.org/export/dump/",
                "license": "CC-BY-4.0",
            },
        ],
        "countries": countries,
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(countries)} countries; "
          f"area={sum(1 for c in countries.values() if c['method']=='area')}, "
          f"cities={sum(1 for c in countries.values() if c['method']=='cities')})")


if __name__ == "__main__":
    main()
