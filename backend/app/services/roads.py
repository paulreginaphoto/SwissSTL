"""
Fetch road centerlines from swisstopo swissTLM3D via REST API,
buffer them into polygons for STL mesh generation.
"""

import logging
import math
from typing import Optional

import httpx
import numpy as np
from shapely.geometry import LineString, MultiLineString, box
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

API_URL = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify"
LAYER = "all:ch.swisstopo.swisstlm3d-strassen"
PAGE_LIMIT = 200

# Road width (meters) by objektart code
ROAD_WIDTHS = {
    0: 5.0,    # default
    4: 6.0,    # Verbindung
    6: 8.0,    # Zufahrt
    8: 7.0,    # 3. Klass
    10: 4.0,   # 4. Klass
    11: 3.0,   # Quartier
    20: 5.0,   # Weg
    21: 2.5,   # Fussweg
}


def _fetch_roads_page(min_e, min_n, max_e, max_n, offset=0):
    """Fetch one page of road features from the swisstopo REST API."""
    params = {
        "geometryType": "esriGeometryEnvelope",
        "geometry": f"{min_e},{min_n},{max_e},{max_n}",
        "tolerance": "0",
        "layers": LAYER,
        "sr": "2056",
        "returnGeometry": "true",
        "geometryFormat": "geojson",
        "limit": str(PAGE_LIMIT),
        "offset": str(offset),
    }
    resp = httpx.get(API_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("results", [])


def _parse_geometry(geom_dict) -> Optional[MultiLineString]:
    """Convert GeoJSON geometry to Shapely MultiLineString."""
    gtype = geom_dict.get("type")
    coords = geom_dict.get("coordinates", [])
    if not coords:
        return None

    if gtype == "MultiLineString":
        lines = [LineString(line) for line in coords if len(line) >= 2]
    elif gtype == "LineString":
        if len(coords) >= 2:
            lines = [LineString(coords)]
        else:
            return None
    else:
        return None

    return MultiLineString(lines) if lines else None


async def get_road_polygons(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    on_progress=None,
) -> list[tuple[list, str]]:
    """
    Fetch road centerlines for the bbox and buffer them into polygons.
    Returns list of (polygon_exterior_coords_Nx2, road_type_str).
    Coordinates are in LV95 (E, N).
    """
    from pyproj import Transformer
    wgs_to_lv95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)

    min_e, min_n = wgs_to_lv95.transform(min_lon, min_lat)
    max_e, max_n = wgs_to_lv95.transform(max_lon, max_lat)

    logger.info(f"Fetching roads for LV95 bbox [{min_e:.0f},{min_n:.0f},{max_e:.0f},{max_n:.0f}]")

    # Split large areas into sub-tiles to handle the 200-per-request limit
    tile_size = 500  # meters per sub-tile
    e_tiles = max(1, math.ceil((max_e - min_e) / tile_size))
    n_tiles = max(1, math.ceil((max_n - min_n) / tile_size))
    e_step = (max_e - min_e) / e_tiles
    n_step = (max_n - min_n) / n_tiles

    all_features = []
    seen_ids = set()
    total_tiles = e_tiles * n_tiles
    tiles_done = 0

    for ei in range(e_tiles):
        for ni in range(n_tiles):
            te0 = min_e + ei * e_step
            tn0 = min_n + ni * n_step
            te1 = min_e + (ei + 1) * e_step
            tn1 = min_n + (ni + 1) * n_step

            offset = 0
            while True:
                features = _fetch_roads_page(te0, tn0, te1, tn1, offset)
                for f in features:
                    fid = f.get("featureId") or f.get("id")
                    if fid and fid not in seen_ids:
                        seen_ids.add(fid)
                        all_features.append(f)
                if len(features) < PAGE_LIMIT:
                    break
                offset += PAGE_LIMIT
            tiles_done += 1
            if on_progress:
                fetch_pct = int((tiles_done / total_tiles) * 50.0)
                on_progress(fetch_pct)

    logger.info(f"Fetched {len(all_features)} unique road segments")

    # Buffer centerlines into polygons
    clip_box = box(min_e, min_n, max_e, max_n)
    road_polygons = []

    total_features = max(1, len(all_features))
    for idx, feat in enumerate(all_features):
        geom = feat.get("geometry")
        if not geom:
            continue

        mls = _parse_geometry(geom)
        if mls is None:
            continue

        props = feat.get("properties", {})
        objektart = props.get("objektart", 0)
        width = ROAD_WIDTHS.get(objektart, 4.0)

        buffered = mls.buffer(width / 2.0, cap_style=2, join_style=2)
        clipped = buffered.intersection(clip_box)

        if clipped.is_empty:
            continue

        # Extract polygon exterior coordinates
        if clipped.geom_type == "Polygon":
            coords = list(clipped.exterior.coords)
            if len(coords) >= 3:
                road_polygons.append((coords, objektart))
        elif clipped.geom_type == "MultiPolygon":
            for poly in clipped.geoms:
                coords = list(poly.exterior.coords)
                if len(coords) >= 3:
                    road_polygons.append((coords, objektart))
        if on_progress and ((idx + 1) % 25 == 0 or (idx + 1) == total_features):
            buffer_pct = int(((idx + 1) / total_features) * 50.0)
            on_progress(50 + buffer_pct)

    logger.info(f"Roads: {len(road_polygons)} polygons from {len(all_features)} segments")

    if on_progress:
        on_progress(100)

    return road_polygons
