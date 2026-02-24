"""
Fetch road centerlines from swisstopo swissTLM3D via REST API,
buffer them into polygons for STL mesh generation.

Road sub-tiles are fetched **concurrently** and results are cached on disk.
"""

import asyncio
import hashlib
import json
import logging
import math
import os
import time
from typing import Optional

import httpx
import numpy as np
from shapely.geometry import LineString, MultiLineString, box
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

API_URL = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify"
LAYER = "all:ch.swisstopo.swisstlm3d-strassen"
PAGE_LIMIT = 200
MAX_RETRIES = 3
ROAD_CONCURRENCY = 12

CACHE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "cache", "roads",
)
os.makedirs(CACHE_DIR, exist_ok=True)

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


def _tile_cache_key(min_e: float, min_n: float, max_e: float, max_n: float) -> str:
    raw = f"{min_e:.0f}_{min_n:.0f}_{max_e:.0f}_{max_n:.0f}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _load_tile_cache(key: str) -> Optional[list]:
    path = os.path.join(CACHE_DIR, f"{key}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


def _save_tile_cache(key: str, features: list):
    path = os.path.join(CACHE_DIR, f"{key}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(features, f)
    except Exception as e:
        logger.warning(f"Failed to cache roads tile {key}: {e}")


async def _fetch_subtile(
    client: httpx.AsyncClient,
    min_e: float, min_n: float, max_e: float, max_n: float,
) -> list[dict]:
    """Fetch all pages for one road sub-tile with retry logic."""
    cache_key = _tile_cache_key(min_e, min_n, max_e, max_n)
    cached = _load_tile_cache(cache_key)
    if cached is not None:
        return cached

    all_results: list[dict] = []
    offset = 0

    while True:
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

        results = []
        for attempt in range(MAX_RETRIES):
            try:
                resp = await client.get(API_URL, params=params)
                resp.raise_for_status()
                results = resp.json().get("results", [])
                break
            except (httpx.HTTPStatusError, httpx.TransportError) as e:
                if attempt < MAX_RETRIES - 1:
                    wait = 2 ** attempt
                    logger.warning(
                        f"Road API error ({min_e:.0f},{min_n:.0f} offset={offset}, "
                        f"attempt {attempt+1}/{MAX_RETRIES}): {e} — retry in {wait}s"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"Road API failed after {MAX_RETRIES} attempts: {e}")
                    results = []

        all_results.extend(results)
        if len(results) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT

    _save_tile_cache(cache_key, all_results)
    return all_results


def _parse_geometry(geom_dict) -> Optional[MultiLineString]:
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
    Sub-tiles are fetched concurrently for maximum speed.
    """
    from pyproj import Transformer
    wgs_to_lv95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
    min_e, min_n = wgs_to_lv95.transform(min_lon, min_lat)
    max_e, max_n = wgs_to_lv95.transform(max_lon, max_lat)

    logger.info(f"Fetching roads for LV95 bbox [{min_e:.0f},{min_n:.0f},{max_e:.0f},{max_n:.0f}]")

    tile_size = 500
    e_tiles = max(1, math.ceil((max_e - min_e) / tile_size))
    n_tiles = max(1, math.ceil((max_n - min_n) / tile_size))
    e_step = (max_e - min_e) / e_tiles
    n_step = (max_n - min_n) / n_tiles
    total_tiles = e_tiles * n_tiles

    logger.info(f"Roads: {total_tiles} sub-tiles ({e_tiles}x{n_tiles}), concurrency={ROAD_CONCURRENCY}")

    semaphore = asyncio.Semaphore(ROAD_CONCURRENCY)
    completed = 0

    async def _fetch_one(ei: int, ni: int, client: httpx.AsyncClient) -> list[dict]:
        nonlocal completed
        te0 = min_e + ei * e_step
        tn0 = min_n + ni * n_step
        te1 = min_e + (ei + 1) * e_step
        tn1 = min_n + (ni + 1) * n_step

        async with semaphore:
            result = await _fetch_subtile(client, te0, tn0, te1, tn1)

        completed += 1
        if on_progress and (completed % 5 == 0 or completed == total_tiles):
            on_progress(int((completed / total_tiles) * 50.0))
        return result

    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [
            _fetch_one(ei, ni, client)
            for ei in range(e_tiles)
            for ni in range(n_tiles)
        ]
        tile_results = await asyncio.gather(*tasks)

    seen_ids: set = set()
    all_features: list[dict] = []
    for tile_feats in tile_results:
        for f in tile_feats:
            fid = f.get("featureId") or f.get("id")
            if fid and fid not in seen_ids:
                seen_ids.add(fid)
                all_features.append(f)

    logger.info(f"Fetched {len(all_features)} unique road segments from {total_tiles} sub-tiles")

    clip_box = box(min_e, min_n, max_e, max_n)
    road_polygons: list[tuple[list, str]] = []
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

        if clipped.geom_type == "Polygon":
            coords = list(clipped.exterior.coords)
            if len(coords) >= 3:
                road_polygons.append((coords, objektart))
        elif clipped.geom_type == "MultiPolygon":
            for poly in clipped.geoms:
                coords = list(poly.exterior.coords)
                if len(coords) >= 3:
                    road_polygons.append((coords, objektart))

        if on_progress and ((idx + 1) % 50 == 0 or (idx + 1) == total_features):
            on_progress(50 + int(((idx + 1) / total_features) * 50.0))

    logger.info(f"Roads: {len(road_polygons)} polygons from {len(all_features)} segments")
    if on_progress:
        on_progress(100)

    return road_polygons
