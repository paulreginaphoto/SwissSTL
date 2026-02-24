import { useRef, useEffect, useState, useCallback } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox, DrawMode } from "../App";
import { useTranslation } from "../i18n/I18nContext";

interface MapViewProps {
  onBboxChange: (bbox: BBox | null) => void;
  onClipPolygon: (poly: number[][] | null) => void;
  isDrawing: boolean;
  setIsDrawing: (v: boolean) => void;
  drawMode: DrawMode;
  clearCounter: number;
  flyTarget: { lng: number; lat: number; zoom: number } | null;
}

const LAUSANNE_CENTER: [number, number] = [6.6323, 46.5197];
const SWISS_BOUNDS: [[number, number], [number, number]] = [
  [5.9, 45.8],
  [10.5, 47.9],
];

function circlePolygon(
  center: { lng: number; lat: number },
  end: { lng: number; lat: number },
  n = 48,
): number[][] {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dlng = (end.lng - center.lng) * cosLat;
  const dlat = end.lat - center.lat;
  const r = Math.sqrt(dlng * dlng + dlat * dlat);
  const coords: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const angle = (2 * Math.PI * i) / n;
    coords.push([
      center.lng + (r * Math.cos(angle)) / cosLat,
      center.lat + r * Math.sin(angle),
    ]);
  }
  return coords;
}

function polygonBbox(coords: number[][]): BBox {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLon) minLon = lng;
    if (lng > maxLon) maxLon = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

export default function MapView({
  onBboxChange,
  onClipPolygon,
  isDrawing,
  setIsDrawing,
  drawMode,
  clearCounter,
  flyTarget,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const drawStartRef = useRef<{ lng: number; lat: number } | null>(null);
  const freehandPointsRef = useRef<number[][]>([]);
  const lastPolyRef = useRef<number[][] | null>(null);
  const sourceReadyRef = useRef(false);
  const [hasSelection, setHasSelection] = useState(false);
  const drawModeRef = useRef<DrawMode>(drawMode);
  const { t } = useTranslation();

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("swisstopo") as maplibregl.RasterTileSource | undefined;
    if (!src) return;
    const tileUrl = isSatellite
      ? "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg"
      : "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg";
    (src as any).setTiles([tileUrl]);
  }, [isSatellite]);

  useEffect(() => {
    if (!flyTarget) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: flyTarget.zoom, duration: 1200 });
  }, [flyTarget]);

  useEffect(() => {
    if (clearCounter === 0) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("selection-rect") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[]] } });
    }
    setHasSelection(false);
  }, [clearCounter]);

  const setSelectionGeometry = useCallback(
    (map: Map, coords: number[][]) => {
      const source = map.getSource("selection-rect") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [coords] },
        });
      }
    },
    [],
  );

  const updateRect = useCallback(
    (map: Map, start: { lng: number; lat: number }, end: { lng: number; lat: number }) => {
      const minLon = Math.min(start.lng, end.lng);
      const maxLon = Math.max(start.lng, end.lng);
      const minLat = Math.min(start.lat, end.lat);
      const maxLat = Math.max(start.lat, end.lat);

      const coords = [
        [minLon, maxLat],
        [maxLon, maxLat],
        [maxLon, minLat],
        [minLon, minLat],
        [minLon, maxLat],
      ];
      setSelectionGeometry(map, coords);
      return { minLon, minLat, maxLon, maxLat };
    },
    [setSelectionGeometry],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          swisstopo: {
            type: "raster",
            tiles: [
              "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>',
          },
        },
        layers: [
          {
            id: "swisstopo-layer",
            type: "raster",
            source: "swisstopo",
            minzoom: 0,
            maxzoom: 20,
          },
        ],
      },
      center: LAUSANNE_CENTER,
      zoom: 14,
      maxBounds: SWISS_BOUNDS,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200, unit: "metric" }),
      "bottom-right",
    );

    map.on("load", () => {
      map.addSource("selection-rect", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "selection-fill",
        type: "fill",
        source: "selection-rect",
        paint: {
          "fill-color": "#e63946",
          "fill-opacity": 0.15,
        },
      });

      map.addLayer({
        id: "selection-outline",
        type: "line",
        source: "selection-rect",
        paint: {
          "line-color": "#e63946",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });

      sourceReadyRef.current = true;
    });

    map.on("mousedown", (e) => {
      if (!e.originalEvent.shiftKey) return;
      e.preventDefault();
      map.dragPan.disable();
      const pt = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      drawStartRef.current = pt;
      freehandPointsRef.current = [[pt.lng, pt.lat]];
      setIsDrawing(true);
    });

    map.on("mousemove", (e) => {
      if (!drawStartRef.current || !sourceReadyRef.current) return;
      const mode = drawModeRef.current;
      const end = { lng: e.lngLat.lng, lat: e.lngLat.lat };

      if (mode === "rect") {
        updateRect(map, drawStartRef.current, end);
      } else if (mode === "circle") {
        const coords = circlePolygon(drawStartRef.current, end);
        setSelectionGeometry(map, coords);
      } else {
        freehandPointsRef.current.push([end.lng, end.lat]);
        const pts = freehandPointsRef.current;
        if (pts.length > 2) {
          const closed = [...pts, pts[0]];
          setSelectionGeometry(map, closed);
        }
      }
    });

    map.on("mouseup", (e) => {
      if (!drawStartRef.current) return;
      map.dragPan.enable();
      const mode = drawModeRef.current;
      const end = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      let bbox: BBox | null = null;

      if (mode === "rect") {
        bbox = updateRect(map, drawStartRef.current, end);
        lastPolyRef.current = null;
      } else if (mode === "circle") {
        const coords = circlePolygon(drawStartRef.current, end);
        setSelectionGeometry(map, coords);
        bbox = polygonBbox(coords);
        lastPolyRef.current = coords;
      } else {
        freehandPointsRef.current.push([end.lng, end.lat]);
        const pts = freehandPointsRef.current;
        if (pts.length > 2) {
          const closed = [...pts, pts[0]];
          setSelectionGeometry(map, closed);
          bbox = polygonBbox(pts);
          lastPolyRef.current = closed;
        }
      }

      drawStartRef.current = null;
      freehandPointsRef.current = [];
      setIsDrawing(false);

      if (bbox) {
        const dlng = Math.abs(bbox.maxLon - bbox.minLon);
        const dlat = Math.abs(bbox.maxLat - bbox.minLat);
        if (dlng > 0.0005 && dlat > 0.0005) {
          onBboxChange(bbox);
          onClipPolygon(lastPolyRef.current);
          setHasSelection(true);
          map.fitBounds(
            [[bbox.minLon, bbox.minLat], [bbox.maxLon, bbox.maxLat]],
            { padding: 60, duration: 600 },
          );
        }
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onBboxChange, onClipPolygon, setIsDrawing, updateRect, setSelectionGeometry]);

  const hintKey = "Shift";
  const hintText =
    drawMode === "rect"
      ? t("mapHintRect", { key: hintKey })
      : drawMode === "circle"
        ? t("mapHintCircle", { key: hintKey })
        : t("mapHintFreehand", { key: hintKey });

  return (
    <div className="map-container">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!hasSelection && !isDrawing && (
        <div className="selection-hint">
          {hintText}
        </div>
      )}
      {isDrawing && (
        <div className="selection-hint" style={{ borderColor: "#e63946" }}>
          {t("mapHintRelease")}
        </div>
      )}
      <button
        className="map-style-toggle"
        onClick={() => setIsSatellite((v) => !v)}
        title={isSatellite ? "Carte" : "Satellite"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 22 8.5 12 15 2 8.5" />
          <polyline points="2 12 12 18.5 22 12" />
          <polyline points="2 15.5 12 22 22 15.5" />
        </svg>
      </button>
    </div>
  );
}
