import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { I18nProvider } from "./i18n/I18nContext";
import MapView from "./components/MapView";
import SearchBar from "./components/SearchBar";
import Sidebar from "./components/Sidebar";
import { extractMaskShape, maskShapeToGeo, type MaskShape } from "./utils/maskToPolygon";
import "./index.css";

const StlPreview = lazy(() => import("./components/StlPreview"));

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface GenerateOptions {
  resolution: string;
  zExaggeration: number;
  baseHeight: number;
  includeBuildings: boolean;
  includeRoads: boolean;
  modelWidthMm: number;
}

export type DrawMode = "rect" | "circle" | "freehand";

function App() {
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [clipPolygon, setClipPolygon] = useState<number[][] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>("rect");
  const [clearCounter, setClearCounter] = useState(0);
  const [flyTarget, setFlyTarget] = useState<{ lng: number; lat: number; zoom: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Mask state
  const [maskShape, setMaskShape] = useState<MaskShape | null>(null);
  const [maskCenter, setMaskCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [maskSizeM, setMaskSizeM] = useState(500);

  const maskGeo = useMemo(() => {
    if (!maskShape || !maskCenter) return null;
    return maskShapeToGeo(maskShape, maskCenter, maskSizeM);
  }, [maskShape, maskCenter, maskSizeM]);

  useEffect(() => {
    if (maskGeo) {
      setBbox(maskGeo.bbox);
      setClipPolygon(maskGeo.polygon);
    }
  }, [maskGeo]);

  const handleBboxChange = useCallback((newBbox: BBox | null) => {
    setBbox(newBbox);
  }, []);

  const handleClipPolygon = useCallback((poly: number[][] | null) => {
    setClipPolygon(poly);
    if (poly) {
      setMaskShape(null);
      setMaskCenter(null);
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    setBbox(null);
    setClipPolygon(null);
    setMaskShape(null);
    setMaskCenter(null);
    setClearCounter((c) => c + 1);
  }, []);

  const handleMaskUpload = useCallback(async (file: File): Promise<boolean> => {
    const shape = await extractMaskShape(file);
    if (!shape) return false;
    setMaskShape(shape);
    setMaskCenter(null);
    setBbox(null);
    setClipPolygon(null);
    setClearCounter((c) => c + 1);
    return true;
  }, []);

  const handleMaskPlace = useCallback((lng: number, lat: number) => {
    setMaskCenter({ lng, lat });
  }, []);

  const handleClearMask = useCallback(() => {
    setMaskShape(null);
    setMaskCenter(null);
    setBbox(null);
    setClipPolygon(null);
    setClearCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "r" || e.key === "R") setDrawMode("rect");
      else if (e.key === "c" || e.key === "C") setDrawMode("circle");
      else if (e.key === "f" || e.key === "F") setDrawMode("freehand");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const maskGeoPolygon = maskGeo?.polygon ?? null;

  return (
    <I18nProvider>
      <div className="app-layout">
        <Sidebar
          bbox={bbox}
          clipPolygon={clipPolygon}
          drawMode={drawMode}
          setDrawMode={setDrawMode}
          onClearSelection={handleClearSelection}
          onPreviewUrl={setPreviewUrl}
          maskShape={maskShape}
          maskSizeM={maskSizeM}
          onMaskSizeM={setMaskSizeM}
          onMaskUpload={handleMaskUpload}
          onClearMask={handleClearMask}
        />
        <div className="map-wrapper">
          {previewUrl ? (
            <Suspense fallback={<div className="preview-loading">Chargement du modèle 3D...</div>}>
              <StlPreview url={previewUrl} fullscreen />
            </Suspense>
          ) : (
            <>
              <SearchBar onSelect={(lng, lat, zoom) => setFlyTarget({ lng, lat, zoom })} />
              <MapView
                onBboxChange={handleBboxChange}
                onClipPolygon={handleClipPolygon}
                isDrawing={isDrawing}
                setIsDrawing={setIsDrawing}
                drawMode={drawMode}
                clearCounter={clearCounter}
                flyTarget={flyTarget}
                externalPolygon={maskGeoPolygon}
                maskPlacing={maskShape !== null && maskCenter === null}
                onMaskPlace={handleMaskPlace}
              />
            </>
          )}
        </div>
      </div>
    </I18nProvider>
  );
}

export default App;
