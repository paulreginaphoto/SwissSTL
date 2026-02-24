"""
Fetch SwissALTI3D terrain elevation data from swisstopo STAC API.
Downloads GeoTIFF tiles for a given bounding box and merges them into
a single elevation grid.
"""

import asyncio
import os
import logging
from typing import Optional

import httpx
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.mask import mask
from rasterio.io import MemoryFile
from pyproj import Transformer
from shapely.geometry import box

logger = logging.getLogger(__name__)

STAC_API = "https://data.geo.admin.ch/api/stac/v1"
COLLECTION = "ch.swisstopo.swissalti3d"

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "cache", "terrain")
os.makedirs(CACHE_DIR, exist_ok=True)

WGS84_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
LV95_TO_WGS84 = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)

DOWNLOAD_SEMAPHORE = asyncio.Semaphore(10)


def wgs84_to_lv95_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float):
    """Convert a WGS84 bbox to LV95 coordinates."""
    min_e, min_n = WGS84_TO_LV95.transform(min_lon, min_lat)
    max_e, max_n = WGS84_TO_LV95.transform(max_lon, max_lat)
    return min_e, min_n, max_e, max_n


def estimate_area_km2(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> float:
    """Estimate area in km² from WGS84 bbox."""
    min_e, min_n, max_e, max_n = wgs84_to_lv95_bbox(min_lon, min_lat, max_lon, max_lat)
    return (max_e - min_e) * (max_n - min_n) / 1e6


async def fetch_terrain_items(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    resolution: str = "2",
    on_progress=None,
) -> list[dict]:
    """Query the STAC API to find SwissALTI3D GeoTIFF tiles covering the bbox."""
    bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
    target_gsd = float(resolution)

    items = []
    seen_hrefs: set[str] = set()
    url: str | None = f"{STAC_API}/collections/{COLLECTION}/items"
    params: dict = {"bbox": bbox_str, "limit": 200}
    page = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        while url:
            page += 1
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

            page_features = data.get("features", [])
            for feature in page_features:
                assets = feature.get("assets", {})
                for _asset_key, asset in assets.items():
                    href = asset.get("href", "")
                    gsd = asset.get("gsd")
                    if (gsd is not None
                            and abs(float(gsd) - target_gsd) < 0.01
                            and href.endswith(".tif")
                            and href not in seen_hrefs):
                        seen_hrefs.add(href)
                        items.append({
                            "id": feature["id"],
                            "href": href,
                            "gsd": float(gsd),
                        })

            if page % 5 == 0:
                logger.info(f"STAC query page {page}: {len(items)} tiles so far...")

            next_link = None
            for link in data.get("links", []):
                if link.get("rel") == "next":
                    next_link = link["href"]
                    break

            if next_link:
                url = next_link
                params = {}
            else:
                url = None

    logger.info(
        f"STAC query done: {page} pages, {len(items)} tiles at {resolution}m "
        f"for bbox {bbox_str}"
    )
    return items


async def download_tile(href: str) -> str:
    """Download a single GeoTIFF tile, using cache if available."""
    filename = href.split("/")[-1]
    cached_path = os.path.join(CACHE_DIR, filename)

    if os.path.exists(cached_path):
        return cached_path

    async with DOWNLOAD_SEMAPHORE:
        if os.path.exists(cached_path):
            return cached_path

        logger.info(f"Downloading: {filename}")
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            resp = await client.get(href)
            resp.raise_for_status()
            with open(cached_path, "wb") as f:
                f.write(resp.content)

        logger.info(f"Downloaded: {filename} ({len(resp.content) / 1024:.0f} KB)")
    return cached_path


async def download_all_tiles(items: list[dict], on_progress=None) -> list[str]:
    """Download all tiles concurrently with a semaphore."""
    total = len(items)
    completed = 0
    paths: list[str | None] = [None] * total

    async def _dl(idx: int, item: dict):
        nonlocal completed
        paths[idx] = await download_tile(item["href"])
        completed += 1
        if on_progress:
            on_progress(completed, total)

    tasks = [_dl(i, item) for i, item in enumerate(items)]
    await asyncio.gather(*tasks)
    return [p for p in paths if p is not None]


async def get_terrain_grid(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    resolution: str = "2",
    on_progress=None,
) -> tuple[np.ndarray, dict]:
    """
    Fetch and merge terrain tiles into a single elevation grid.
    Returns (elevation_array, metadata_dict).
    """
    actual_resolution = resolution
    if resolution == "10":
        actual_resolution = "2"

    items = await fetch_terrain_items(
        min_lon, min_lat, max_lon, max_lat, actual_resolution
    )

    if not items:
        actual_resolution = "0.5"
        items = await fetch_terrain_items(
            min_lon, min_lat, max_lon, max_lat, actual_resolution
        )

    if not items:
        raise ValueError(
            f"No terrain data found for this area. "
            "Make sure the selected zone is within Switzerland."
        )

    logger.info(f"Downloading {len(items)} tiles at {actual_resolution}m resolution...")

    def dl_progress(done, total):
        if on_progress:
            on_progress(5 + int(done / total * 45))

    tile_paths = await download_all_tiles(items, on_progress=dl_progress)

    lv95_bbox = wgs84_to_lv95_bbox(min_lon, min_lat, max_lon, max_lat)
    clip_geom = box(lv95_bbox[0], lv95_bbox[1], lv95_bbox[2], lv95_bbox[3])

    if len(tile_paths) == 1:
        src = rasterio.open(tile_paths[0])
        elevation, transform = mask(src, [clip_geom], crop=True, nodata=-9999)
        elevation = elevation[0]
        crs = src.crs
        src.close()
    else:
        datasets = [rasterio.open(p) for p in tile_paths]
        merged, merge_transform = merge(datasets)
        crs = datasets[0].crs
        for ds in datasets:
            ds.close()

        with MemoryFile() as memfile:
            profile = {
                "driver": "GTiff",
                "dtype": merged.dtype,
                "count": merged.shape[0],
                "height": merged.shape[1],
                "width": merged.shape[2],
                "crs": crs,
                "transform": merge_transform,
            }
            with memfile.open(**profile) as mem_ds:
                mem_ds.write(merged)

            with memfile.open() as mem_ds:
                elevation, transform = mask(mem_ds, [clip_geom], crop=True, nodata=-9999)
                elevation = elevation[0]

    elevation = np.where(elevation == -9999, np.nan, elevation)

    if np.all(np.isnan(elevation)):
        raise ValueError("All elevation data is NoData. The selected area may not have coverage.")

    if resolution == "10" and actual_resolution != "10":
        step = max(1, int(10.0 / float(actual_resolution)))
        elevation = elevation[::step, ::step]
        logger.info(f"Downsampled from {actual_resolution}m to ~10m (step={step})")

    nan_mask = np.isnan(elevation)
    if np.any(nan_mask):
        mean_val = np.nanmean(elevation)
        elevation = np.where(nan_mask, mean_val, elevation)

    meta = {
        "transform": transform,
        "crs": str(crs),
        "shape": elevation.shape,
        "min_elevation": float(np.nanmin(elevation)),
        "max_elevation": float(np.nanmax(elevation)),
        "resolution_m": float(actual_resolution),
        "lv95_bbox": lv95_bbox,
    }

    logger.info(
        f"Terrain grid: {elevation.shape}, "
        f"elevation range: {meta['min_elevation']:.1f} - {meta['max_elevation']:.1f}m"
    )

    return elevation, meta
