import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import generate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
OUTPUT_DIR = os.path.join(CACHE_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

app = FastAPI(
    title="SwissSTL",
    description="Generate 3D-printable STL files from Swiss geodata",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/api")

app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "SwissSTL"}
