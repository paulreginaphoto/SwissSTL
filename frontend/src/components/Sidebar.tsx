import { useState, useRef, useCallback } from "react";
import type { BBox, GenerateOptions, DrawMode } from "../App";
import { useTranslation } from "../i18n/I18nContext";
import { LANG_LABELS, type Lang } from "../i18n/translations";

const API_BASE = "http://localhost:8000";

interface SidebarProps {
  bbox: BBox | null;
  clipPolygon: number[][] | null;
  drawMode: DrawMode;
  setDrawMode: (mode: DrawMode) => void;
}

interface JobState {
  jobId: string;
  status: string;
  progress: number;
  message: string;
  downloadUrl: string | null;
}

function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

function estimateArea(bbox: BBox): string {
  const R = 6371;
  const dLat = ((bbox.maxLat - bbox.minLat) * Math.PI) / 180;
  const dLon = ((bbox.maxLon - bbox.minLon) * Math.PI) / 180;
  const midLat = ((bbox.minLat + bbox.maxLat) / 2 * Math.PI) / 180;
  const h = dLat * R;
  const w = dLon * R * Math.cos(midLat);
  const area = h * w;
  if (area < 1) return `${(area * 1e6).toFixed(0)} m\u00B2`;
  return `${area.toFixed(2)} km\u00B2`;
}

function estimateDimensions(bbox: BBox): { widthKm: number; heightKm: number } {
  const R = 6371;
  const dLat = ((bbox.maxLat - bbox.minLat) * Math.PI) / 180;
  const dLon = ((bbox.maxLon - bbox.minLon) * Math.PI) / 180;
  const midLat = ((bbox.minLat + bbox.maxLat) / 2 * Math.PI) / 180;
  return {
    heightKm: dLat * R,
    widthKm: dLon * R * Math.cos(midLat),
  };
}

export default function Sidebar({ bbox, clipPolygon, drawMode, setDrawMode }: SidebarProps) {
  const { t, lang, setLang } = useTranslation();

  const [options, setOptions] = useState<GenerateOptions>({
    resolution: "0.5",
    zExaggeration: 1.0,
    baseHeight: 0.5,
    includeBuildings: true,
    includeRoads: true,
    modelWidthMm: 150,
  });
  const [gridSplit, setGridSplit] = useState(1);

  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [lastProgressAt, setLastProgressAt] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousJobRef = useRef<JobState | null>(null);

  const dims = bbox ? estimateDimensions(bbox) : null;

  const pushEvent = useCallback((line: string) => {
    setEvents((prev) => [line, ...prev].slice(0, 10));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollStatus = useCallback((jobId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/status/${jobId}`);
        if (!resp.ok) throw new Error("Failed to fetch status");
        const data = await resp.json();
        const now = Date.now();
        const nextJob: JobState = {
          jobId: data.job_id,
          status: data.status,
          progress: data.progress,
          message: data.message,
          downloadUrl: data.download_url,
        };
        const prev = previousJobRef.current;
        const changed =
          !prev ||
          prev.status !== nextJob.status ||
          Math.floor(prev.progress) !== Math.floor(nextJob.progress) ||
          prev.message !== nextJob.message;
        if (changed) {
          pushEvent(
            `[${new Date(now).toLocaleTimeString()}] ${nextJob.status} ${nextJob.progress.toFixed(0)}% - ${nextJob.message}`
          );
        }
        if (!prev || nextJob.progress > prev.progress) {
          setLastProgressAt(now);
        }
        setLastUpdateAt(now);
        previousJobRef.current = nextJob;
        setJob(nextJob);
        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
        }
      } catch {
        stopPolling();
        pushEvent(`[${new Date().toLocaleTimeString()}] ERROR - ${t("connectionLost")}`);
        setError(t("connectionLost"));
      }
    }, 1000);
  }, [pushEvent, stopPolling, t]);

  const handleGenerate = async () => {
    if (!bbox) return;
    setError(null);
    setJob(null);
    setEvents([]);
    const now = Date.now();
    setStartedAt(now);
    setLastUpdateAt(now);
    setLastProgressAt(now);
    previousJobRef.current = null;

    try {
      const resp = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox: {
            min_lon: bbox.minLon,
            min_lat: bbox.minLat,
            max_lon: bbox.maxLon,
            max_lat: bbox.maxLat,
          },
          resolution: options.resolution,
          z_exaggeration: options.zExaggeration,
          base_height: options.baseHeight,
          include_buildings: options.includeBuildings,
          include_roads: options.includeRoads,
          model_width_mm: options.modelWidthMm,
          grid_split: gridSplit,
          ...(clipPolygon ? { clip_polygon: clipPolygon } : {}),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Server error");
      }

      const data = await resp.json();
      const createdJob: JobState = {
        jobId: data.job_id,
        status: data.status,
        progress: data.progress,
        message: data.message,
        downloadUrl: null,
      };
      previousJobRef.current = createdJob;
      setJob(createdJob);
      pushEvent(`[${new Date().toLocaleTimeString()}] job created: ${data.job_id}`);
      pushEvent(`[${new Date().toLocaleTimeString()}] ${createdJob.status} ${createdJob.progress.toFixed(0)}% - ${createdJob.message}`);

      pollStatus(data.job_id);
    } catch (e: any) {
      pushEvent(`[${new Date().toLocaleTimeString()}] ERROR - ${e.message || "Unknown error"}`);
      setError(e.message || "Unknown error");
    }
  };

  const handleDownload = () => {
    if (!job?.downloadUrl) return;
    window.open(`${API_BASE}${job.downloadUrl}`, "_blank");
  };

  const isProcessing = job && !["completed", "failed"].includes(job.status);
  const now = Date.now();
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const stalledSec = lastProgressAt ? Math.floor((now - lastProgressAt) / 1000) : 0;

  const resLabel =
    options.resolution === "0.5"
      ? t("res05Short")
      : options.resolution === "2"
        ? t("res2Short")
        : t("res10Short");

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h1 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <a
              href="https://github.com/paulreginaphoto/SwissSTL"
              target="_blank"
              rel="noreferrer"
              title="GitHub"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <svg height="22" width="22" viewBox="0 0 16 16" fill="#ffffff" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            Swiss<span>STL</span>
          </h1>
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
              <option key={l} value={l}>{LANG_LABELS[l]}</option>
            ))}
          </select>
        </div>
        <p>{t("appSubtitle")}</p>
      </div>

      <div className="sidebar-section">
        <h2>{t("zoneTitle")}</h2>
        {bbox ? (
          <div className="info-grid">
            <div className="info-item">
              <label>{t("area")}</label>
              <span>{estimateArea(bbox)}</span>
            </div>
            <div className="info-item">
              <label>{t("dimensions")}</label>
              <span>
                {dims!.widthKm.toFixed(1)} x {dims!.heightKm.toFixed(1)} km
              </span>
            </div>
            <div className="info-item">
              <label>Lon</label>
              <span>
                {bbox.minLon.toFixed(4)}...{bbox.maxLon.toFixed(4)}
              </span>
            </div>
            <div className="info-item">
              <label>Lat</label>
              <span>
                {bbox.minLat.toFixed(4)}...{bbox.maxLat.toFixed(4)}
              </span>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {t("zoneHint")}
          </p>
        )}
      </div>

      <div className="sidebar-section">
        <h2>{t("drawMode")}</h2>
        <div className="draw-mode-group">
          {(["rect", "circle", "freehand"] as DrawMode[]).map((mode) => (
            <button
              key={mode}
              className={`draw-mode-btn ${drawMode === mode ? "active" : ""}`}
              onClick={() => setDrawMode(mode)}
              disabled={!!isProcessing}
            >
              {mode === "rect" ? t("modeRect") : mode === "circle" ? t("modeCircle") : t("modeFreehand")}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h2>{t("gridTitle")}</h2>
        <div className="draw-mode-group">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={`draw-mode-btn ${gridSplit === n ? "active" : ""}`}
              onClick={() => setGridSplit(n)}
              disabled={!!isProcessing}
            >
              {n === 1 ? t("gridSingle") : `${n}x${n}`}
            </button>
          ))}
        </div>
        {gridSplit > 1 && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
            {t("gridInfo", { n: gridSplit, total: gridSplit * gridSplit, width: options.modelWidthMm })}
          </p>
        )}
      </div>

      <div className="sidebar-section">
        <h2>{t("paramsTitle")}</h2>

        <div className="form-group">
          <label>
            {t("resolution")}
            <span className="range-value">{resLabel}</span>
          </label>
          <select
            value={options.resolution}
            onChange={(e) =>
              setOptions({ ...options, resolution: e.target.value })
            }
            disabled={!!isProcessing}
          >
            <option value="0.5">{t("res05")}</option>
            <option value="2">{t("res2")}</option>
            <option value="10">{t("res10")}</option>
          </select>
        </div>

        <div className="form-group">
          <label>
            {t("baseHeight")}
            <span className="range-value">{options.baseHeight.toFixed(1)} mm</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="20"
            step="0.5"
            value={options.baseHeight}
            disabled={!!isProcessing}
            onChange={(e) =>
              setOptions({
                ...options,
                baseHeight: parseFloat(e.target.value),
              })
            }
          />
        </div>

        <div className="form-group">
          <label>
            {t("modelWidth")}
            <span className="range-value">{options.modelWidthMm.toFixed(0)} mm</span>
          </label>
          <input
            type="range"
            min="50"
            max="500"
            step="10"
            value={options.modelWidthMm}
            disabled={!!isProcessing}
            onChange={(e) =>
              setOptions({
                ...options,
                modelWidthMm: parseFloat(e.target.value),
              })
            }
          />
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="include-buildings"
            checked={options.includeBuildings}
            disabled={!!isProcessing}
            onChange={(e) =>
              setOptions({ ...options, includeBuildings: e.target.checked })
            }
          />
          <label htmlFor="include-buildings">{t("includeBuildings")}</label>
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="include-roads"
            checked={options.includeRoads}
            disabled={!!isProcessing}
            onChange={(e) =>
              setOptions({ ...options, includeRoads: e.target.checked })
            }
          />
          <label htmlFor="include-roads">{t("includeRoads")}</label>
        </div>
      </div>

      {job && (
        <div className="sidebar-section">
          <h2>{t("progressTitle")}</h2>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="progress-text">
            {job.message} ({job.progress.toFixed(1)}%)
          </p>
          <div className="progress-debug">
            <div className="progress-debug-row">
              <span>{t("state")}</span>
              <strong>{job.status}</strong>
            </div>
            <div className="progress-debug-row">
              <span>{t("jobId")}</span>
              <strong>{job.jobId.slice(0, 8)}...</strong>
            </div>
            <div className="progress-debug-row">
              <span>{t("elapsed")}</span>
              <strong>{formatSeconds(elapsedSec)}</strong>
            </div>
            <div className="progress-debug-row">
              <span>{t("noProgress")}</span>
              <strong>{formatSeconds(stalledSec)}</strong>
            </div>
            {lastUpdateAt && (
              <div className="progress-debug-row">
                <span>{t("lastUpdate")}</span>
                <strong>{new Date(lastUpdateAt).toLocaleTimeString()}</strong>
              </div>
            )}
          </div>
          {isProcessing && stalledSec >= 30 && (
            <p className="progress-stall-warning">
              {t("stallWarning", { time: formatSeconds(stalledSec) })}
            </p>
          )}
          {events.length > 0 && (
            <div className="progress-log">
              {events.map((line, idx) => (
                <div key={`${idx}-${line}`} className="progress-log-line">
                  {line}
                </div>
              ))}
            </div>
          )}
          {job.status === "completed" && job.downloadUrl && (
            <button className="btn-download" onClick={handleDownload}>
              {job.downloadUrl.endsWith(".zip") ? t("downloadZip") : t("downloadStl")}
            </button>
          )}
          {job.status === "failed" && (
            <p className="error-text">{job.message}</p>
          )}
        </div>
      )}

      {error && (
        <div className="sidebar-section">
          <p className="error-text">{error}</p>
        </div>
      )}

      <div className="sidebar-section" style={{ borderBottom: "none" }}>
        <button
          className="btn-generate"
          disabled={!bbox || !!isProcessing}
          onClick={handleGenerate}
        >
          {isProcessing
            ? t("generating", { pct: job!.progress.toFixed(0) })
            : bbox
              ? t("generate")
              : t("selectFirst")}
        </button>
      </div>
    </div>
  );
}
