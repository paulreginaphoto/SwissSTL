"""
Fetch swissBUILDINGS3D 2.0 building meshes from swisstopo STAC API as DXF files.
Each POLYLINE polyface mesh in the DXF is one building, already in LV95/LN02
(same CRS as SwissALTI3D terrain), so no coordinate conversion is needed.
"""

import asyncio
import io
import os
import logging
import zipfile

import ezdxf
import httpx
import numpy as np
from pyproj import Transformer

logger = logging.getLogger(__name__)

STAC_COLLECTION_URL = (
    "https://data.geo.admin.ch/api/stac/v1/collections/"
    "ch.swisstopo.swissbuildings3d_2/items"
)
WGS84_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)

CACHE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "cache",
    "buildings_dxf",
)
os.makedirs(CACHE_DIR, exist_ok=True)


def _extract_tile_zone(item_id: str) -> str:
    """Extract geographic tile zone from item ID.
    IDs like 'swissbuildings3d_2_2020-03_1243-13' -> '1243-13'
    IDs like 'swissbuildings3d_2_2020-10' (no tile suffix) -> '2020-10'
    """
    parts = item_id.split("_")
    if len(parts) >= 4:
        return "_".join(parts[3:])
    return item_id


def _stac_query(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> list[dict]:
    """Query STAC API for building tiles overlapping the bbox.
    Deduplicates by tile zone, keeping only the latest version.
    Only returns items that have a DXF asset.
    """
    raw_items: list[dict] = []
    url: str | None = STAC_COLLECTION_URL
    params: dict = {"bbox": f"{min_lon},{min_lat},{max_lon},{max_lat}", "limit": "100"}

    while url:
        resp = httpx.get(url, params=params, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        data = resp.json()
        raw_items.extend(data.get("features", []))
        url = None
        params = {}
        for link in data.get("links", []):
            if link.get("rel") == "next":
                url = link["href"]
                break

    has_dxf = [
        item for item in raw_items
        if any(a.get("href", "").endswith(".dxf.zip") for a in item.get("assets", {}).values())
    ]

    best_by_zone: dict[str, dict] = {}
    for item in has_dxf:
        zone = _extract_tile_zone(item["id"])
        existing = best_by_zone.get(zone)
        if existing is None or item["id"] > existing["id"]:
            best_by_zone[zone] = item

    items = list(best_by_zone.values())
    logger.info(
        f"STAC query: {len(raw_items)} raw items, {len(has_dxf)} with DXF, "
        f"{len(items)} unique zones (latest version)"
    )
    return items


def _download_dxf(item: dict) -> str:
    """Download and cache a DXF tile ZIP, return path to extracted DXF."""
    item_id = item["id"]
    cached_dxf = os.path.join(CACHE_DIR, f"{item_id}.dxf")
    if os.path.exists(cached_dxf):
        logger.info(f"Using cached DXF: {item_id}")
        return cached_dxf

    assets = item.get("assets", {})
    dxf_asset = None
    for asset in assets.values():
        href = asset.get("href", "")
        if href.endswith(".dxf.zip"):
            dxf_asset = asset
            break

    if not dxf_asset:
        raise ValueError(f"No DXF asset found in tile {item_id}")

    url = dxf_asset["href"]
    logger.info(f"Downloading DXF tile: {item_id} ({url})")
    resp = httpx.get(url, timeout=120, follow_redirects=True)
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        dxf_names = [n for n in zf.namelist() if n.lower().endswith(".dxf")]
        if not dxf_names:
            raise ValueError(f"No DXF file in ZIP for tile {item_id}")
        with zf.open(dxf_names[0]) as src, open(cached_dxf, "wb") as dst:
            dst.write(src.read())

    logger.info(f"Cached DXF: {cached_dxf} ({os.path.getsize(cached_dxf) // 1024} KB)")
    return cached_dxf


def _parse_dxf_buildings(
    dxf_path: str,
    min_e: float,
    min_n: float,
    max_e: float,
    max_n: float,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Parse polyface mesh POLYLINE entities from a DXF file.
    Returns (vertices, faces) in LV95/LN02, clipped to the LV95 bbox.
    Each POLYLINE is one building. Coordinates are already in LV95+LN02.
    """
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    all_verts: list[np.ndarray] = []
    all_faces: list[np.ndarray] = []
    buildings_kept = 0
    buildings_skipped = 0

    for entity in msp:
        if entity.dxftype() != "POLYLINE" or not entity.is_poly_face_mesh:
            continue

        vertices_list = list(entity.vertices)
        mesh_verts = [v for v in vertices_list if not v.is_face_record]
        face_recs = [v for v in vertices_list if v.is_face_record]

        if len(mesh_verts) < 3 or len(face_recs) == 0:
            continue

        coords = np.array(
            [(v.dxf.location.x, v.dxf.location.y, v.dxf.location.z) for v in mesh_verts],
            dtype=np.float64,
        )

        centroid_e = float(np.mean(coords[:, 0]))
        centroid_n = float(np.mean(coords[:, 1]))
        if centroid_e < min_e or centroid_e > max_e or centroid_n < min_n or centroid_n > max_n:
            buildings_skipped += 1
            continue

        faces = []
        for fr in face_recs:
            idx0 = abs(fr.dxf.vtx0) - 1
            idx1 = abs(fr.dxf.vtx1) - 1
            idx2 = abs(fr.dxf.vtx2) - 1
            vtx3 = fr.dxf.vtx3
            if vtx3 is not None and vtx3 != 0:
                idx3 = abs(vtx3) - 1
                faces.append([idx0, idx1, idx2])
                faces.append([idx0, idx2, idx3])
            else:
                faces.append([idx0, idx1, idx2])

        if not faces:
            continue

        face_arr = np.array(faces, dtype=np.int32)
        max_idx = int(face_arr.max())
        if max_idx >= len(coords):
            buildings_skipped += 1
            continue

        offset = sum(len(v) for v in all_verts)
        all_verts.append(coords)
        all_faces.append(face_arr + offset)
        buildings_kept += 1

    logger.info(
        f"DXF parse: {buildings_kept} buildings kept, {buildings_skipped} skipped "
        f"(outside bbox or invalid)"
    )

    if not all_verts:
        return np.empty((0, 3), dtype=np.float64), np.empty((0, 3), dtype=np.int32)

    return np.vstack(all_verts), np.vstack(all_faces)


def _process_tile_sync(
    item: dict, min_e: float, min_n: float, max_e: float, max_n: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Download + parse one tile (synchronous, meant to run in a thread)."""
    dxf_path = _download_dxf(item)
    return _parse_dxf_buildings(dxf_path, min_e, min_n, max_e, max_n)


async def get_building_meshes(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    on_progress=None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Fetch building meshes for the given WGS84 bbox.
    Returns (vertices_lv95, faces) where vertices are in LV95/LN02 —
    the same coordinate system as SwissALTI3D terrain data.
    """
    min_e, min_n = WGS84_TO_LV95.transform(min_lon, min_lat)
    max_e, max_n = WGS84_TO_LV95.transform(max_lon, max_lat)
    logger.info(
        f"Fetching buildings for LV95 bbox "
        f"[{min_e:.0f},{min_n:.0f},{max_e:.0f},{max_n:.0f}]"
    )

    items = await asyncio.to_thread(_stac_query, min_lon, min_lat, max_lon, max_lat)
    if not items:
        logger.warning("No building tiles found for this area")
        if on_progress:
            on_progress(100)
        return np.empty((0, 3), dtype=np.float64), np.empty((0, 3), dtype=np.int32)

    all_verts: list[np.ndarray] = []
    all_faces: list[np.ndarray] = []

    for i, item in enumerate(items):
        try:
            verts, faces = await asyncio.to_thread(
                _process_tile_sync, item, min_e, min_n, max_e, max_n,
            )

            if len(verts) > 0:
                offset = sum(len(v) for v in all_verts)
                all_verts.append(verts)
                all_faces.append(faces + offset)
                logger.info(
                    f"Tile {item.get('id', '?')}: {len(verts)} verts, {len(faces)} faces"
                )

        except Exception as e:
            logger.warning(f"Failed to process tile {item.get('id', '?')}: {e}")

        if on_progress:
            on_progress(int((i + 1) / len(items) * 100))

    if not all_verts:
        logger.warning("No building geometry extracted from DXF tiles")
        return np.empty((0, 3), dtype=np.float64), np.empty((0, 3), dtype=np.int32)

    verts = np.vstack(all_verts)
    faces = np.vstack(all_faces)

    logger.info(
        f"Buildings total: {len(verts)} vertices, {len(faces)} faces, "
        f"E=[{verts[:, 0].min():.0f},{verts[:, 0].max():.0f}] "
        f"N=[{verts[:, 1].min():.0f},{verts[:, 1].max():.0f}] "
        f"H=[{verts[:, 2].min():.1f},{verts[:, 2].max():.1f}]"
    )
    return verts, faces
