from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Resolution(str, Enum):
    HALF_METER = "0.5"
    TWO_METER = "2"
    TEN_METER = "10"


class BoundingBox(BaseModel):
    min_lon: float = Field(..., description="Minimum longitude (WGS84)")
    min_lat: float = Field(..., description="Minimum latitude (WGS84)")
    max_lon: float = Field(..., description="Maximum longitude (WGS84)")
    max_lat: float = Field(..., description="Maximum latitude (WGS84)")


class GenerateRequest(BaseModel):
    bbox: BoundingBox
    resolution: Resolution = Resolution.TWO_METER
    z_exaggeration: float = Field(1.0, ge=0.5, le=5.0, description="Vertical exaggeration factor")
    base_height: float = Field(2.0, ge=0.5, le=20.0, description="Base plate thickness in mm")
    include_buildings: bool = Field(True, description="Include 3D buildings")
    include_roads: bool = Field(True, description="Include road mesh on terrain surface")
    model_width_mm: float = Field(150.0, ge=50.0, le=500.0, description="Target model width in mm")
    grid_split: int = Field(1, ge=1, le=4, description="Split zone into NxN tiles (1=single, 2=2x2, 3=3x3, 4=4x4)")
    clip_polygon: Optional[list[list[float]]] = Field(None, description="Polygon [[lon,lat],...] to clip the STL shape (circle/freehand)")


class JobStatus(str, Enum):
    PENDING = "pending"
    DOWNLOADING_TERRAIN = "downloading_terrain"
    DOWNLOADING_BUILDINGS = "downloading_buildings"
    DOWNLOADING_ROADS = "downloading_roads"
    PROCESSING = "processing"
    GENERATING_STL = "generating_stl"
    COMPLETED = "completed"
    FAILED = "failed"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: float = Field(0.0, ge=0.0, le=100.0)
    message: str = ""
    download_url: Optional[str] = None
