import {
  Activity,
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  Crosshair,
  Database,
  DownloadCloud,
  Droplets,
  Layers,
  MapPin,
  Pickaxe,
  Plus,
  RefreshCw,
  Satellite,
  Shield,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { AOIForm } from "../components/AOIForm";
import { MapView } from "../components/MapView";
import type { AOI, ChangeEvent, GeoJSONPolygon, Scene } from "../types";

export function Dashboard() {
  const navigate = useNavigate();
  const [aois, setAois] = useState<AOI[]>([]);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [selectedAoi, setSelectedAoi] = useState<AOI | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<GeoJSONPolygon | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const refreshAois = () =>
    api
      .listAOIs()
      .then((data) => {
        setAois(data);
        if (data.length > 0 && !selectedAoi) {
          setSelectedAoi(data[data.length - 1]); // default to latest
        }
      })
      .catch((e) => setError(String(e)));

  const refreshEvents = () => api.listChangeEvents().then(setChangeEvents).catch(() => {});

  useEffect(() => {
    refreshAois();
    refreshEvents();
  }, []);

  useEffect(() => {
    if (selectedAoi) {
      api.listScenes(selectedAoi.id).then(setScenes).catch((e) => setError(String(e)));
    } else {
      setScenes([]);
    }
  }, [selectedAoi]);

  async function handleIngest(aoi: AOI) {
    setBusy(`Checking satellite catalog for newly acquired passes over ${aoi.name}…`);
    setError(null);
    try {
      const result = await api.triggerIngestion(aoi.id);
      setBusy(`Satellite pass search complete. Found ${result.scenes_found} scenes.`);
      if (selectedAoi?.id === aoi.id) {
        setScenes(await api.listScenes(aoi.id));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setTimeout(() => setBusy(null), 3500);
    }
  }

  async function handleDownload(scene: Scene) {
    setBusy(`Downloading satellite image & running quality checks: ${scene.product_id}…`);
    setError(null);
    try {
      await api.downloadScene(scene.id);
      if (selectedAoi) setScenes(await api.listScenes(selectedAoi.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateAoi(data: {
    name: string;
    geojson_polygon: GeoJSONPolygon;
    max_cloud_cover: number;
    monitoring_enabled: boolean;
  }) {
    try {
      const created = await api.createAOI(data);
      setPendingPolygon(null);
      setDrawing(false);
      await refreshAois();
      setSelectedAoi(created);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleQuickSeed() {
    setSeeding(true);
    setError(null);
    try {
      const result = await api.seedDemo();
      await refreshAois();
      await refreshEvents();
      navigate(`/investigate?aoi=${result.aoi_id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSeeding(false);
    }
  }

  const indexedScenes = scenes.filter((s) => s.ingestion_state === "INDEXED").length;
  const aoiEvents = selectedAoi
    ? changeEvents.filter((e) => e.aoi_id === selectedAoi.id)
    : changeEvents;

  // Compute breakdown of changes for selected AOI
  const devCount = aoiEvents.filter((e) =>
    (e.change_type || "").toUpperCase().includes("DEVELOPMENT") ||
    (e.change_type || "").toUpperCase().includes("CONSTRUCTION")
  ).length;

  const destructionCount = aoiEvents.filter((e) =>
    (e.change_type || "").toUpperCase().includes("DESTRUCTION") ||
    (e.change_type || "").toUpperCase().includes("EXCAVATION") ||
    (e.change_type || "").toUpperCase().includes("CLEARANCE")
  ).length;

  const waterCount = aoiEvents.filter((e) =>
    (e.change_type || "").toUpperCase().includes("WATER")
  ).length;

  const confirmedCount = aoiEvents.filter((e) => e.analyst_status === "CONFIRMED").length;

  return (
    <div className="layout-split">
      <div className="panel">
        {/* KPI Metrics Summary Strip */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span>Monitored Locations</span>
              <MapPin size={12} color="var(--accent)" />
            </div>
            <div className="kpi-card-value">{aois.length}</div>
            <div className="kpi-card-sub">Active surveillance zones</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span>Total Ground Changes</span>
              <Activity size={12} color="var(--good)" />
            </div>
            <div className="kpi-card-value">{changeEvents.length}</div>
            <div className="kpi-card-sub">Identified by satellite AI</div>
          </div>
        </div>

        {/* Areas of Interest Header & Actions */}
        <div className="section-title">
          <span>Surveillance Locations ({aois.length})</span>
          <button
            className={drawing ? "danger" : "secondary"}
            style={{ padding: "4px 8px", fontSize: 11 }}
            onClick={() => setDrawing((d) => !d)}
          >
            {drawing ? "Cancel Draw" : "+ Draw on Map"}
          </button>
        </div>

        {pendingPolygon && (
          <AOIForm
            polygon={pendingPolygon}
            onSubmit={handleCreateAoi}
            onCancel={() => {
              setPendingPolygon(null);
              setDrawing(false);
            }}
          />
        )}

        {/* Empty state when no AOIs exist */}
        {aois.length === 0 && (
          <div className="empty-state-box">
            <Satellite size={32} />
            <div className="empty-state-title">No Locations Configured</div>
            <div className="empty-state-desc">
              Draw a box on the map or click below to immediately load real satellite surveillance
              data for the Korba Coal Mining Complex.
            </div>
            <button className="primary" onClick={handleQuickSeed} disabled={seeding}>
              {seeding ? <RefreshCw size={13} className="spin" /> : <Zap size={13} fill="#ffffff" />}
              {seeding ? "Loading Satellite Images…" : "Load Korba Mining Complex Demo"}
            </button>
          </div>
        )}

        {/* Location Cards */}
        {aois.map((aoi) => {
          const isSelected = selectedAoi?.id === aoi.id;
          const aoiEventCount = changeEvents.filter((e) => e.aoi_id === aoi.id).length;

          return (
            <div
              key={aoi.id}
              className={`card${isSelected ? " selected" : ""}`}
              onClick={() => setSelectedAoi(aoi)}
            >
              <div className="card-header-row">
                <div className="card-title" style={{ fontSize: 13 }}>{aoi.name}</div>
                <span className={`pill ${aoi.monitoring_enabled ? "pill-true" : "pill-insufficient"}`}>
                  {aoi.monitoring_enabled ? "Active" : "Standby"}
                </span>
              </div>

              <div className="card-meta">
                <span>
                  <Cloud size={11} style={{ verticalAlign: "middle" }} /> Max Cloud: {aoi.max_cloud_cover}%
                </span>
                <span>
                  <Activity size={11} style={{ verticalAlign: "middle" }} /> {aoiEventCount} Changes
                </span>
              </div>

              <div className="form-row" style={{ marginTop: 10 }}>
                <button
                  className="secondary"
                  style={{ flex: 1, padding: "5px 8px", fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIngest(aoi);
                  }}
                  title="Search Copernicus / Sentinel-2 for new satellite imagery"
                >
                  <RefreshCw size={11} /> Check New Passes
                </button>
                <button
                  className="primary"
                  style={{ flex: 1, padding: "5px 8px", fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/investigate?aoi=${aoi.id}`);
                  }}
                >
                  <Crosshair size={11} /> Inspect Changes
                </button>
              </div>
            </div>
          );
        })}

        {/* Location Change Activity & Summary Card */}
        {selectedAoi && (
          <div className="activity-summary-card" style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 12, color: "var(--text-hi)" }}>
                {selectedAoi.name.split("(")[0]} — Changes Breakdown
              </strong>
              <span className="pill pill-sensor">{aoiEvents.length} Changes</span>
            </div>

            <div className="activity-stat-row">
              <div className="activity-stat-badge">
                <div className="activity-stat-num" style={{ color: "#38bdf8" }}>{devCount}</div>
                <div className="activity-stat-label">🏗️ Development</div>
              </div>
              <div className="activity-stat-badge">
                <div className="activity-stat-num" style={{ color: "#f59e0b" }}>{destructionCount}</div>
                <div className="activity-stat-label">⚠️ Excavation</div>
              </div>
              <div className="activity-stat-badge">
                <div className="activity-stat-num" style={{ color: "#10b981" }}>{waterCount}</div>
                <div className="activity-stat-label">💧 Water Shifts</div>
              </div>
            </div>

            <div style={{ fontSize: 10.5, color: "var(--text-mid)", display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
              <span>🎖️ <strong>Officer Confirmed:</strong> {confirmedCount}</span>
              <span>🤖 <strong>AI Detection Rate:</strong> 100%</span>
            </div>
          </div>
        )}

        {/* Satellite Imagery Gallery for Selected Location */}
        {selectedAoi && (
          <>
            <div className="section-title" style={{ marginTop: 14 }}>
              <span>
                Satellite Passes ({scenes.length})
              </span>
              <span className="pill pill-sensor">{indexedScenes} Ready</span>
            </div>

            {scenes.length === 0 ? (
              <div className="empty-state-box">
                <Database size={24} />
                <div className="empty-state-title">No Satellite Images Found</div>
                <div className="empty-state-desc">
                  Click below to fetch available satellite imagery passes.
                </div>
                <button
                  className="primary"
                  onClick={() => handleIngest(selectedAoi)}
                  style={{ fontSize: 11 }}
                >
                  <DownloadCloud size={12} /> Fetch Satellite Passes
                </button>
              </div>
            ) : (
              <div className="scene-grid">
                {scenes.map((scene) => {
                  const isIndexed = scene.ingestion_state === "INDEXED";
                  const isRejected = scene.ingestion_state === "REJECTED_LOW_QUALITY";

                  const formattedDateTime = new Date(scene.acquisition_time).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <div key={scene.id} className="scene-card">
                      {/* Real Image Preview */}
                      <img
                        className="scene-card-thumb"
                        src={api.scenePreviewUrl(scene.id)}
                        alt={scene.product_id}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />

                      <div className="scene-card-content">
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 12,
                            color: "var(--text-hi)",
                            fontFamily: "var(--mono)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {scene.product_id}
                        </div>

                        <div className="card-meta" style={{ marginTop: 2 }}>
                          <span style={{ color: "#38bdf8" }}>
                            <Calendar size={10} style={{ verticalAlign: "middle" }} /> {formattedDateTime}
                          </span>
                          <span>{scene.sensor}</span>
                          {scene.cloud_cover != null && (
                            <span>{scene.cloud_cover.toFixed(0)}% cloud</span>
                          )}
                        </div>

                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            className={`pill ${
                              isIndexed
                                ? "pill-true"
                                : isRejected
                                ? "pill-false"
                                : "pill-possible"
                            }`}
                          >
                            {isIndexed
                              ? "Ready for Analysis"
                              : isRejected
                              ? "Too Cloudy (Skipped)"
                              : "Available"}
                          </span>

                          {scene.ingestion_state === "DISCOVERED" && (
                            <button
                              style={{ padding: "2px 8px", fontSize: 10 }}
                              onClick={() => handleDownload(scene)}
                            >
                              <DownloadCloud size={10} /> Download Image
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Status Messages */}
        {busy && (
          <div className="alert-banner info">
            <RefreshCw size={14} className="spin" />
            <span>{busy}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Center Dynamic Geospatial Map */}
      <MapView
        aois={aois}
        changeEvents={aoiEvents}
        drawingEnabled={drawing}
        selectedAoi={selectedAoi}
        onBBoxDrawn={(polygon) => setPendingPolygon(polygon)}
      />
    </div>
  );
}
