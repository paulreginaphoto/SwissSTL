import io
import os
import uuid
import logging
import zipfile
from fastapi import APIRouter, HTTPException, BackgroundTasks

import numpy as np

from app.models.schemas import GenerateRequest, JobResponse, JobStatus
from app.services.terrain import get_terrain_grid, estimate_area_km2, wgs84_to_lv95_bbox
from app.services.buildings_dxf import get_building_meshes
from app.services.roads import get_road_polygons
from app.services.stl_generator import generate_terrain_stl, OUTPUT_DIR

logger = logging.getLogger(__name__)

router = APIRouter()

jobs: dict[str, JobResponse] = {}

MAX_AREA_KM2 = 100.0
AUTO_10M_AREA_KM2 = 25.0
AUTO_2M_AREA_KM2 = 5.0


def _split_bbox_grid(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    n: int,
) -> list[tuple[int, int, float, float, float, float]]:
    """Split a WGS84 bbox into an n x n grid.
    Returns list of (row, col, min_lon, min_lat, max_lon, max_lat).
    Row 0 = top (north), col 0 = left (west).
    """
    lon_step = (max_lon - min_lon) / n
    lat_step = (max_lat - min_lat) / n
    tiles = []
    for row in range(n):
        for col in range(n):
            t_min_lon = min_lon + col * lon_step
            t_max_lon = min_lon + (col + 1) * lon_step
            t_min_lat = min_lat + (n - 1 - row) * lat_step
            t_max_lat = min_lat + (n - row) * lat_step
            tiles.append((row, col, t_min_lon, t_min_lat, t_max_lon, t_max_lat))
    return tiles


def _effective_resolution(area_km2: float, requested: str) -> str:
    """Auto-adjust resolution based on area for single-tile mode."""
    if area_km2 > AUTO_10M_AREA_KM2 and requested != "10":
        return "10"
    if area_km2 > AUTO_2M_AREA_KM2 and requested == "0.5":
        return "2"
    return requested


async def _generate_single(job_id: str, request: GenerateRequest, job: JobResponse):
    """Standard single-tile generation pipeline."""
    bbox = request.bbox
    area_km2 = estimate_area_km2(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    resolution = _effective_resolution(area_km2, request.resolution.value)

    if resolution != request.resolution.value:
        logger.info(f"Area={area_km2:.1f}km² — forcing {resolution}m (was {request.resolution.value}m)")
        job.message = f"Zone large ({area_km2:.1f} km²) — resolution forcée à {resolution}m"

    logger.info(
        f"Job {job_id} | area={area_km2:.1f}km² res={resolution}m "
        f"buildings={request.include_buildings} roads={request.include_roads}"
    )

    job.status = JobStatus.DOWNLOADING_TERRAIN
    job.message = f"Terrain: recherche des tuiles ({area_km2:.1f} km², {resolution}m)..."
    job.progress = 2.0

    def terrain_progress(pct):
        job.progress = 5.0 + pct * 0.35
        job.message = f"Terrain: telechargement tuiles... {int(pct)}%"

    elevation, meta = await get_terrain_grid(
        bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat,
        resolution=resolution, on_progress=terrain_progress,
    )
    job.progress = 40.0
    logger.info(f"Terrain: {elevation.shape}")

    building_verts, building_faces = None, None
    if request.include_buildings:
        job.status = JobStatus.DOWNLOADING_BUILDINGS
        job.message = "Batiments: recherche tuiles DXF..."

        def bp(pct):
            job.progress = 40.0 + pct * 0.15
            job.message = f"Batiments: DXF... {int(pct)}%"

        building_verts, building_faces = await get_building_meshes(
            bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, on_progress=bp,
        )
        logger.info(f"Buildings: {len(building_verts)} verts, {len(building_faces)} faces")
    job.progress = 55.0

    road_polygons = None
    if request.include_roads:
        job.status = JobStatus.DOWNLOADING_ROADS
        job.message = "Routes: extraction..."

        def rp(pct):
            job.progress = 55.0 + pct * 0.05
            job.message = f"Routes: extraction... {int(pct)}%"

        road_polygons = await get_road_polygons(
            bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, on_progress=rp,
        )
        logger.info(f"Roads: {len(road_polygons)} polygons")
    job.progress = 60.0

    job.status = JobStatus.GENERATING_STL
    job.message = f"Generation du maillage 3D ({elevation.shape[0]}x{elevation.shape[1]})..."

    def sp(pct):
        job.progress = 60.0 + (pct - 60) * 1.0
        job.message = f"Generation STL... {int(job.progress)}%"

    output_path = generate_terrain_stl(
        elevation=elevation, job_id=job_id,
        model_width_mm=request.model_width_mm, z_exaggeration=request.z_exaggeration,
        base_height_mm=request.base_height,
        building_verts_lv95=building_verts, building_faces=building_faces,
        terrain_lv95_bbox=meta.get("lv95_bbox"), road_polygons_lv95=road_polygons,
        on_progress=sp,
    )

    job.status = JobStatus.COMPLETED
    job.progress = 100.0
    job.message = "STL genere avec succes!"
    job.download_url = f"/output/{job_id}.stl"
    logger.info(f"Job {job_id} completed: {output_path}")


async def _generate_grid(job_id: str, request: GenerateRequest, job: JobResponse):
    """Multi-tile grid generation: split zone into NxN sub-tiles at full resolution."""
    n = request.grid_split
    bbox = request.bbox
    total_area = estimate_area_km2(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    tile_area = total_area / (n * n)
    resolution = request.resolution.value

    if tile_area > AUTO_10M_AREA_KM2 and resolution != "10":
        resolution = "10"
        job.message = f"Tuiles trop grandes ({tile_area:.1f} km²/tuile) — resolution forcée à 10m"
    elif tile_area > AUTO_2M_AREA_KM2 and resolution == "0.5":
        resolution = "2"
        job.message = f"Tuiles trop grandes ({tile_area:.1f} km²/tuile) — resolution forcée à 2m"

    total_tiles = n * n
    logger.info(
        f"Job {job_id} GRID {n}x{n} ({total_tiles} tiles) | "
        f"area={total_area:.1f}km² tile_area={tile_area:.1f}km² res={resolution}m"
    )

    tiles = _split_bbox_grid(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, n)

    # --- Phase 1: Fetch terrain for the FULL zone to get global min_elev ---
    job.status = JobStatus.DOWNLOADING_TERRAIN
    job.message = f"Terrain: telechargement zone complete ({total_area:.1f} km², {resolution}m)..."
    job.progress = 2.0

    def terrain_progress(pct):
        job.progress = 2.0 + pct * 0.18
        job.message = f"Terrain: telechargement... {int(pct)}%"

    full_elevation, full_meta = await get_terrain_grid(
        bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat,
        resolution=resolution, on_progress=terrain_progress,
    )
    global_min_elev = float(np.nanmin(full_elevation))
    full_lv95 = full_meta["lv95_bbox"]
    job.progress = 20.0
    logger.info(
        f"Full terrain: {full_elevation.shape}, "
        f"global_min_elev={global_min_elev:.1f}m"
    )

    # --- Phase 2: Split terrain grid and generate each tile ---
    full_rows, full_cols = full_elevation.shape
    tile_rows = full_rows // n
    tile_cols = full_cols // n

    stl_paths: list[tuple[int, int, str]] = []
    progress_per_tile = 70.0 / total_tiles

    for tile_idx, (row, col, t_min_lon, t_min_lat, t_max_lon, t_max_lat) in enumerate(tiles):
        tile_label = f"R{row}C{col}"
        tile_num = tile_idx + 1
        logger.info(f"Tile {tile_label} ({tile_num}/{total_tiles})")

        job.message = f"Tuile {tile_num}/{total_tiles} ({tile_label}): extraction terrain..."
        base_progress = 20.0 + tile_idx * progress_per_tile

        r_start = row * tile_rows
        r_end = (row + 1) * tile_rows if row < n - 1 else full_rows
        c_start = col * tile_cols
        c_end = (col + 1) * tile_cols if col < n - 1 else full_cols
        tile_elev = full_elevation[r_start:r_end, c_start:c_end]

        t_lv95 = wgs84_to_lv95_bbox(t_min_lon, t_min_lat, t_max_lon, t_max_lat)

        tile_bverts, tile_bfaces = None, None
        if request.include_buildings:
            job.message = f"Tuile {tile_num}/{total_tiles}: batiments DXF..."
            job.progress = base_progress + progress_per_tile * 0.2
            tile_bverts, tile_bfaces = await get_building_meshes(
                t_min_lon, t_min_lat, t_max_lon, t_max_lat,
            )
            if tile_bverts is not None and len(tile_bverts) > 0:
                logger.info(f"  Tile {tile_label} buildings: {len(tile_bverts)} verts")

        tile_roads = None
        if request.include_roads:
            job.message = f"Tuile {tile_num}/{total_tiles}: routes..."
            job.progress = base_progress + progress_per_tile * 0.4
            tile_roads = await get_road_polygons(
                t_min_lon, t_min_lat, t_max_lon, t_max_lat,
            )

        job.message = f"Tuile {tile_num}/{total_tiles}: generation STL..."
        job.progress = base_progress + progress_per_tile * 0.5

        tile_job_id = f"{job_id}_R{row}C{col}"
        output_path = generate_terrain_stl(
            elevation=tile_elev,
            job_id=tile_job_id,
            model_width_mm=request.model_width_mm,
            z_exaggeration=request.z_exaggeration,
            base_height_mm=request.base_height,
            building_verts_lv95=tile_bverts,
            building_faces=tile_bfaces,
            terrain_lv95_bbox=t_lv95,
            road_polygons_lv95=tile_roads,
            global_min_elev=global_min_elev,
        )

        stl_paths.append((row, col, output_path))
        job.progress = base_progress + progress_per_tile
        logger.info(f"  Tile {tile_label} done: {output_path}")

    # --- Phase 3: Package all STLs into a ZIP ---
    job.message = f"Emballage de {total_tiles} tuiles dans un ZIP..."
    job.progress = 92.0

    zip_path = os.path.join(OUTPUT_DIR, f"{job_id}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for row, col, stl_path in stl_paths:
            arcname = f"tile_R{row}_C{col}.stl"
            zf.write(stl_path, arcname)

    zip_size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    logger.info(f"ZIP created: {zip_path} ({zip_size_mb:.1f} MB, {total_tiles} tiles)")

    for _, _, stl_path in stl_paths:
        try:
            os.remove(stl_path)
        except OSError:
            pass

    job.status = JobStatus.COMPLETED
    job.progress = 100.0
    job.message = f"{total_tiles} tuiles STL generees ({zip_size_mb:.1f} MB)!"
    job.download_url = f"/output/{job_id}.zip"
    logger.info(f"Job {job_id} grid completed")


async def process_job(job_id: str, request: GenerateRequest):
    """Background task: dispatch to single or grid generation."""
    job = jobs[job_id]
    try:
        if request.grid_split > 1:
            await _generate_grid(job_id, request, job)
        else:
            await _generate_single(job_id, request, job)
    except Exception as e:
        logger.exception(f"Job {job_id} failed")
        job.status = JobStatus.FAILED
        job.message = f"Erreur: {str(e)}"
        job.progress = 0.0


@router.post("/generate", response_model=JobResponse)
async def generate_stl(request: GenerateRequest, background_tasks: BackgroundTasks):
    """Start STL generation for the given bounding box and parameters."""
    job_id = str(uuid.uuid4())

    bbox = request.bbox
    if not (5.9 <= bbox.min_lon <= 10.5 and 5.9 <= bbox.max_lon <= 10.5
            and 45.8 <= bbox.min_lat <= 47.9 and 45.8 <= bbox.max_lat <= 47.9):
        raise HTTPException(
            status_code=400,
            detail="Bounding box must be within Switzerland (lon: 5.9-10.5, lat: 45.8-47.9)"
        )

    if bbox.min_lon >= bbox.max_lon or bbox.min_lat >= bbox.max_lat:
        raise HTTPException(status_code=400, detail="Invalid bounding box: min must be less than max")

    area_km2 = estimate_area_km2(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    if area_km2 > MAX_AREA_KM2:
        raise HTTPException(
            status_code=400,
            detail=f"Zone trop grande ({area_km2:.1f} km²). Maximum = {MAX_AREA_KM2:.0f} km². Réduisez la sélection."
        )

    grid = request.grid_split
    suffix = f" [{grid}x{grid} = {grid*grid} tuiles]" if grid > 1 else ""

    job = JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        progress=0.0,
        message=f"Job cree ({area_km2:.1f} km²{suffix}), demarrage...",
    )
    jobs[job_id] = job

    background_tasks.add_task(process_job, job_id, request)
    return job


@router.get("/status/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """Get the current status of a generation job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]
