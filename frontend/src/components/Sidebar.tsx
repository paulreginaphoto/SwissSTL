import { useState, useRef, useCallback } from "react";
import type { BBox, GenerateOptions, DrawMode } from "../App";
import { useTranslation } from "../i18n/I18nContext";
import { LANG_LABELS, type Lang } from "../i18n/translations";
import { pngMaskToPolygon } from "../utils/maskToPolygon";

const API_BASE = "http://localhost:8000";

interface SidebarProps {
  bbox: BBox | null;
  clipPolygon: number[][] | null;
  drawMode: DrawMode;
  setDrawMode: (mode: DrawMode) => void;
  onClearSelection: () => void;
  onPreviewUrl: (url: string | null) => void;
  onMaskPolygon: (poly: number[][] | null) => void;
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
  if (area < 1) return `${Math.round(area * 1e6).toLocaleString()} m\u00B2`;
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

export default function Sidebar({ bbox, clipPolygon, drawMode, setDrawMode, onClearSelection, onPreviewUrl, onMaskPolygon }: SidebarProps) {
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
  const [showHistory, setShowHistory] = useState(false);
  const [maskName, setMaskName] = useState<string | null>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);

  interface HistoryEntry { name: string; url: string; date: string }
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("swissstl-history") || "[]"); } catch { return []; }
  });
  const saveHistory = (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((h) => h.url !== entry.url)].slice(0, 10);
      localStorage.setItem("swissstl-history", JSON.stringify(next));
      return next;
    });
  };

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
          if (data.status === "completed" && data.download_url) {
            saveHistory({
              name: data.download_url.split("/").pop() || data.job_id,
              url: data.download_url,
              date: new Date().toLocaleString(),
            });
            if (!data.download_url.endsWith(".zip")) {
              onPreviewUrl(`${API_BASE}${data.download_url}`);
            }
          }
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
  const isCompleted = job?.status === "completed" && !!job.downloadUrl;
  const now = Date.now();
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const stalledSec = lastProgressAt ? Math.floor((now - lastProgressAt) / 1000) : 0;

  const resLabel =
    options.resolution === "0.5"
      ? t("res05Short")
      : options.resolution === "2"
        ? t("res2Short")
        : t("res10Short");

  const handleNewGeneration = () => {
    setJob(null);
    setEvents([]);
    setError(null);
    setStartedAt(null);
    setLastUpdateAt(null);
    setLastProgressAt(null);
    onPreviewUrl(null);
  };

  const handleMaskUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!bbox) {
      setError(t("selectFirst"));
      return;
    }
    try {
      const poly = await pngMaskToPolygon(file, bbox);
      if (!poly) {
        setError(t("maskError"));
        return;
      }
      setMaskName(file.name);
      onMaskPolygon(poly);
    } catch {
      setError(t("maskError"));
    }
    if (maskInputRef.current) maskInputRef.current.value = "";
  };

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

      {isCompleted && (
        <div className="download-overlay">
          <div className="download-overlay-content">
            <div className="download-check">&#10003;</div>
            <p className="download-filename">{job!.downloadUrl!.split("/").pop()}</p>
            <button className="btn-download-hero" onClick={handleDownload}>
              {job!.downloadUrl!.endsWith(".zip") ? t("downloadZip") : t("downloadStl")}
            </button>
            <button className="btn-new-generation" onClick={handleNewGeneration}>
              {t("generateAnother")}
            </button>
            <p className="download-elapsed">
              {t("elapsed")}: {formatSeconds(elapsedSec)}
            </p>
          </div>
        </div>
      )}

      <div className={`sidebar-body ${isCompleted ? "dimmed" : ""}`}>

      <div className="sidebar-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>{t("zoneTitle")}</h2>
          {bbox && !isProcessing && (
            <button className="btn-clear" onClick={onClearSelection} title={t("clearSelection")}>
              ✕
            </button>
          )}
        </div>
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
                {bbox.minLon.toFixed(3)}...{bbox.maxLon.toFixed(3)}
              </span>
            </div>
            <div className="info-item">
              <label>Lat</label>
              <span>
                {bbox.minLat.toFixed(3)}...{bbox.maxLat.toFixed(3)}
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
              <kbd className="shortcut-hint">{mode === "rect" ? "R" : mode === "circle" ? "C" : "F"}</kbd>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h2>{t("maskTitle")}</h2>
        <label className="btn-upload-mask" aria-disabled={!!isProcessing}>
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3v10M5 8l5-5 5 5" />
            <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
          </svg>
          {t("uploadMask")}
          <input
            ref={maskInputRef}
            type="file"
            accept="image/png"
            onChange={handleMaskUpload}
            disabled={!!isProcessing}
            hidden
          />
        </label>
        {maskName && clipPolygon && (
          <p style={{ fontSize: "0.72rem", color: "var(--color-accent)", marginTop: "4px" }}>
            {maskName}
          </p>
        )}
        <p style={{ fontSize: "0.68rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
          {t("maskHint")}
        </p>
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
            <span className="tooltip-wrap">?<span className="tooltip-text">{t("tipResolution")}</span></span>
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
            <span className="tooltip-wrap">?<span className="tooltip-text">{t("tipBaseHeight")}</span></span>
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
            <span className="tooltip-wrap">?<span className="tooltip-text">{t("tipModelWidth")}</span></span>
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
              className={`progress-bar-fill ${isProcessing ? "active" : ""}`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="progress-text">
            {job.message} ({job.progress.toFixed(1)}%)
          </p>
          {isProcessing && job.progress > 5 && elapsedSec > 3 && (
            <p className="progress-eta">
              ~{formatSeconds(Math.round(elapsedSec / job.progress * (100 - job.progress)))} {t("etaRemaining")}
            </p>
          )}
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
        {bbox && !isProcessing && !isCompleted && (() => {
          const areaKm2 = (() => {
            const R = 6371;
            const dLat = ((bbox.maxLat - bbox.minLat) * Math.PI) / 180;
            const dLon = ((bbox.maxLon - bbox.minLon) * Math.PI) / 180;
            const midLat = ((bbox.minLat + bbox.maxLat) / 2 * Math.PI) / 180;
            return dLat * R * dLon * R * Math.cos(midLat);
          })();
          const res = parseFloat(options.resolution);
          const gridCells = Math.round(areaKm2 * 1e6 / (res * res));
          const baseMb = gridCells * 0.0001;
          const buildingFactor = options.includeBuildings ? 1.8 : 1.0;
          const sizeMb = baseMb * buildingFactor * gridSplit * gridSplit;
          const timeMin = areaKm2 < 0.5 ? 0.1 : (areaKm2 * (res < 1 ? 4 : res < 5 ? 1.5 : 0.5) * buildingFactor);

          const showWarn = (areaKm2 > 5 && res <= 0.5) || (areaKm2 > 25 && res <= 2);
          const showHugeWarn = (areaKm2 > 25 && res <= 0.5) || (areaKm2 > 50 && res <= 2);

          return (
            <>
              {showHugeWarn && (
                <p className="resolution-warning huge">
                  {t("warnHugeZone", { area: areaKm2.toFixed(1), res: options.resolution, time: Math.ceil(timeMin).toString() })}
                </p>
              )}
              {!showHugeWarn && showWarn && (
                <p className="resolution-warning">
                  {t("warnLargeZone", { area: areaKm2.toFixed(1), res: options.resolution, time: Math.ceil(timeMin).toString() })}
                </p>
              )}
              <div className="pre-estimate">
                <span>~{sizeMb < 1 ? `${(sizeMb * 1024).toFixed(0)} KB` : `${sizeMb.toFixed(0)} MB`}</span>
                <span>~{timeMin < 1 ? "<1 min" : `${Math.ceil(timeMin)} min`}</span>
              </div>
            </>
          );
        })()}
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

      {history.length > 0 && (
        <div className="sidebar-section">
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setShowHistory((v) => !v)}
          >
            <h2 style={{ margin: 0 }}>{t("historyTitle")} ({history.length})</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{showHistory ? "▲" : "▼"}</span>
          </div>
          {showHistory && (
            <ul className="history-list">
              {history.map((h, i) => (
                <li key={i} className="history-item">
                  <a href={`${API_BASE}${h.url}`} target="_blank" rel="noreferrer">{h.name}</a>
                  <span className="history-date">{h.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      </div>{/* end sidebar-body */}
    </div>
  );
}
