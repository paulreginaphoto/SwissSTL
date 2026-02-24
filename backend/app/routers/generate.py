import uuid
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.models.schemas import GenerateRequest, JobResponse, JobStatus
from app.services.terrain import get_terrain_grid
from app.services.buildings_dxf import get_building_meshes
from app.services.roads import get_road_polygons
from app.services.stl_generator import generate_terrain_stl

logger = logging.getLogger(__name__)

router = APIRouter()

jobs: dict[str, JobResponse] = {}


async def process_job(job_id: str, request: GenerateRequest):
    """Background task: fetch terrain + buildings (DXF) + roads and generate STL."""
    job = jobs[job_id]
    logger.info(
        f"Job {job_id} started | bbox=({request.bbox.min_lon:.5f},{request.bbox.min_lat:.5f})"
        f"-({request.bbox.max_lon:.5f},{request.bbox.max_lat:.5f}) "
        f"res={request.resolution.value}m buildings={request.include_buildings} roads={request.include_roads}"
    )

    try:
        # Step 1: Terrain
        job.status = JobStatus.DOWNLOADING_TERRAIN
        job.message = "Terrain: telechargement et assemblage..."
        job.progress = 5.0

        def terrain_progress(pct):
            job.progress = 5.0 + pct * 0.35
            job.message = f"Terrain: telechargement et assemblage... {int(pct)}%"

        elevation, meta = await get_terrain_grid(
            min_lon=request.bbox.min_lon,
            min_lat=request.bbox.min_lat,
            max_lon=request.bbox.max_lon,
            max_lat=request.bbox.max_lat,
            resolution=request.resolution.value,
            on_progress=terrain_progress,
        )

        job.progress = 40.0
        logger.info(f"Terrain: {elevation.shape}, elev [{meta['min_elevation']:.0f}-{meta['max_elevation']:.0f}m]")

        # Step 2: Buildings via DXF (if requested)
        building_verts = None
        building_faces = None

        if request.include_buildings:
            job.status = JobStatus.DOWNLOADING_BUILDINGS
            job.message = "Batiments: telechargement DXF..."

            def building_progress(pct):
                job.progress = 40.0 + pct * 0.15
                job.message = f"Batiments: telechargement et parsing DXF... {int(pct)}%"

            building_verts, building_faces = await get_building_meshes(
                min_lon=request.bbox.min_lon,
                min_lat=request.bbox.min_lat,
                max_lon=request.bbox.max_lon,
                max_lat=request.bbox.max_lat,
                on_progress=building_progress,
            )

            if len(building_verts) > 0:
                logger.info(f"Buildings: {len(building_verts)} verts, {len(building_faces)} faces")
            else:
                logger.info("No buildings found in this area")

        job.progress = 55.0

        # Step 3: Roads (if requested)
        road_polygons = None

        if request.include_roads:
            job.status = JobStatus.DOWNLOADING_ROADS
            job.message = "Routes: extraction..."

            def road_progress(pct):
                job.progress = 55.0 + pct * 0.05
                job.message = f"Routes: extraction et bufferisation... {int(pct)}%"

            road_polygons = await get_road_polygons(
                min_lon=request.bbox.min_lon,
                min_lat=request.bbox.min_lat,
                max_lon=request.bbox.max_lon,
                max_lat=request.bbox.max_lat,
                on_progress=road_progress,
            )
            logger.info(f"Roads: {len(road_polygons)} polygons")

        job.progress = 60.0

        # Step 4: Generate STL
        job.status = JobStatus.GENERATING_STL
        job.message = f"Generation du maillage 3D ({elevation.shape[0]}x{elevation.shape[1]} points)..."

        def stl_progress(pct):
            job.progress = 60.0 + (pct - 60) * 1.0
            if pct < 75:
                phase = "triangulation du terrain"
            elif pct < 85:
                phase = "integration des batiments"
            elif pct < 95:
                phase = "reparation/normalisation du maillage"
            else:
                phase = "sauvegarde STL"
            job.message = f"Generation STL: {phase}... {int(job.progress)}%"

        output_path = generate_terrain_stl(
            elevation=elevation,
            job_id=job_id,
            model_width_mm=request.model_width_mm,
            z_exaggeration=request.z_exaggeration,
            base_height_mm=request.base_height,
            building_verts_lv95=building_verts,
            building_faces=building_faces,
            terrain_lv95_bbox=meta.get("lv95_bbox"),
            road_polygons_lv95=road_polygons,
            on_progress=stl_progress,
        )

        job.status = JobStatus.COMPLETED
        job.progress = 100.0
        job.message = "STL genere avec succes!"
        job.download_url = f"/output/{job_id}.stl"

        logger.info(f"Job {job_id} completed: {output_path}")

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

    job = JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        progress=0.0,
        message="Job cree, demarrage du traitement...",
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
