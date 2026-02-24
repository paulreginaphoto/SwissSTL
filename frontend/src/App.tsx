import { useState, useCallback } from "react";
import { I18nProvider } from "./i18n/I18nContext";
import MapView from "./components/MapView";
import Sidebar from "./components/Sidebar";
import "./index.css";

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
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>("rect");

  const handleBboxChange = useCallback((newBbox: BBox | null) => {
    setBbox(newBbox);
  }, []);

  return (
    <I18nProvider>
      <div className="app-layout">
        <Sidebar
          bbox={bbox}
          drawMode={drawMode}
          setDrawMode={setDrawMode}
        />
        <MapView
          onBboxChange={handleBboxChange}
          isDrawing={isDrawing}
          setIsDrawing={setIsDrawing}
          drawMode={drawMode}
        />
      </div>
    </I18nProvider>
  );
}

export default App;
