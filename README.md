# SwissSTL

Generate 3D-printable STL models of any area in Switzerland, with high-detail terrain, buildings, and roads.

SwissSTL combines official swisstopo geodata — **SwissALTI3D** (LiDAR terrain), **swissBUILDINGS3D 2.0** (3D buildings from DXF), and **swissTLM3D** (road vectors) — into watertight, slicer-ready STL files.

## Features

- **High-resolution terrain** from SwissALTI3D (0.5m, 2m, or 10m resolution)
- **Accurate 3D buildings** with intact roofs from swissBUILDINGS3D 2.0 (DXF format, LV95/LN02 native)
- **Road mesh embossing** from swissTLM3D road centerlines
- **Three selection modes**: rectangle, circle, and freehand drawing
- **Multilingual interface**: French, English, German
- **Configurable output**: model width, vertical exaggeration, base thickness
- **Automatic mesh repair**: normal fixing, degenerate face removal, vertex merging

## Screenshots

> _Screenshots coming soon._

## Tech Stack

### Backend (Python / FastAPI)

| Library | Role |
|---------|------|
| FastAPI + Uvicorn | Async REST API |
| rasterio | GeoTIFF terrain loading |
| numpy + numpy-stl | STL mesh generation |
| ezdxf | DXF building parsing |
| trimesh | Mesh repair & normals |
| pyproj | Coordinate system transforms (WGS84 / LV95) |
| shapely | Road buffering geometry |
| httpx | Async HTTP for swisstopo APIs |

### Frontend (React / TypeScript / Vite)

| Library | Role |
|---------|------|
| React 19 + Vite | UI framework & build |
| MapLibre GL JS | Interactive Swiss map |
| Three.js | 3D preview (planned) |
| Custom i18n | FR / EN / DE translations |

## Getting Started

### Prerequisites

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- ~500 MB disk space for cached swisstopo tiles

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/swissstl.git
cd swissstl

# Backend
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
# source venv/bin/activate
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### Running

Start both servers (in separate terminals):

```bash
# Terminal 1 — Backend (port 8000)
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend (port 5173)
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

### One-Click Launcher (macOS/Linux)

Use the included launcher to install missing dependencies automatically and start both backend + frontend:

```bash
chmod +x start.sh
./start.sh
```

Behavior:
- Creates `backend/venv` if missing
- Installs backend dependencies from `backend/requirements.txt` if needed
- Installs frontend dependencies (`npm install`) if needed
- Starts backend (`:8000`) and frontend (`:5173`) together
- Stops both services cleanly on `Ctrl+C`

### One-Click Launcher (Windows / PowerShell)

Use the Windows launcher for the same one-command setup and start:

```powershell
.\start.ps1
```

Behavior:
- Creates `backend\venv` if missing
- Installs backend dependencies if needed
- Installs frontend dependencies if needed
- Starts backend (`:8000`) and frontend (`:5173`) together
- Stops both services when interrupted

### Usage

1. Select a **drawing mode** (Rectangle / Circle / Freehand) in the sidebar
2. Hold **Shift** + drag on the map to select your area
3. Adjust parameters (resolution, exaggeration, base height, model width)
4. Toggle buildings and/or roads
5. Click **Generate STL**
6. Download the resulting file and open it in your slicer

## Data Sources

All geographic data is fetched live from official **swisstopo** APIs:

| Dataset | Format | API |
|---------|--------|-----|
| [SwissALTI3D](https://www.swisstopo.admin.ch/en/height-model-swissalti3d) | GeoTIFF | STAC API |
| [swissBUILDINGS3D 2.0](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d) | DXF | STAC API |
| [swissTLM3D](https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d) | GeoJSON | REST Identify API |

Data is cached locally in `backend/cache/` to avoid re-downloading.

## Project Structure

```
swissstl/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── models/schemas.py    # Pydantic request/response models
│   │   ├── routers/generate.py  # /api/generate + /api/status endpoints
│   │   └── services/
│   │       ├── terrain.py       # SwissALTI3D STAC download
│   │       ├── buildings_dxf.py # swissBUILDINGS3D DXF pipeline
│   │       ├── roads.py         # swissTLM3D road fetching
│   │       └── stl_generator.py # STL mesh assembly
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── MapView.tsx      # Map + drawing tools
│   │   │   └── Sidebar.tsx      # Controls + progress
│   │   └── i18n/
│   │       ├── translations.ts  # FR/EN/DE strings
│   │       └── I18nContext.tsx   # React context + hook
│   └── package.json
├── LICENSE
├── .gitignore
└── README.md
```

## License

MIT License — Copyright (c) 2026 Paul REGINA

See [LICENSE](LICENSE) for details.

## Credits

- **[swisstopo](https://www.swisstopo.admin.ch)** for providing open geodata (SwissALTI3D, swissBUILDINGS3D 2.0, swissTLM3D)
- Built with [FastAPI](https://fastapi.tiangolo.com/), [React](https://react.dev/), [MapLibre GL JS](https://maplibre.org/), [ezdxf](https://ezdxf.mozman.at/)
