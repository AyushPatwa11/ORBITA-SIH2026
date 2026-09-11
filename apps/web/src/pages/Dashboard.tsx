import {
  Activity,
  AlertCircle,
  Calendar,
  Cloud,
  Crosshair,
  Database,
  DownloadCloud,
  Layers,
  Locate,
  MapPin,
  Maximize2,
  Plus,
  RefreshCw,
  Satellite,
  Shield,
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

  // User Current Location State (Auto-obtained on mount)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [userLocationLabel, setUserLocationLabel] = useState<string>("Detecting your location…");

  const refreshAois = () =>
    api
      .listAOIs()
      .then((data) => {
        setAois(data);
        if (data.length > 0 && !selectedAoi) {
          setSelectedAoi(data[data.length - 1]);
        }
      })
      .catch((e) => setError(String(e)));

  const refreshEvents = () => api.listChangeEvents().then(setChangeEvents).catch(() => {});

  // 1. Automatically obtain user's location on open
  useEffect(() => {
    refreshAois();
    refreshEvents();

    if (navigator.geolocation) {
      setLocatingUser(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lng = Number(pos.coords.longitude.toFixed(4));
          setUserLocation([lng, lat]);
          setUserLocationLabel(`${lat}° N, ${lng}° E`);
          setLocatingUser(false);
        },
        (err) => {
          // Regional default if blocked or denied (e.g. New Delhi coordinate)
          const fallbackLng = 77.209;
          const fallbackLat = 28.614;
          setUserLocation([fallbackLng, fallbackLat]);
          setUserLocationLabel(`${fallbackLat}° N, ${fallbackLng}° E (Regional Fallback)`);
          setLocatingUser(false);
        },
        { timeout: 6000, enableHighAccuracy: true }
      );
    } else {
      setUserLocation([77.209, 28.614]);
      setUserLocationLabel("77.209° E, 28.614° N");
    }
  }, []);

  // When selected AOI changes, fetch scenes
  useEffect(() => {
    if (selectedAoi) {
      api.listScenes(selectedAoi.id).then(setScenes).catch((e) => setError(String(e)));
    } else {
      setScenes([]);
    }
  }, [selectedAoi]);

  async function handleIngest(aoi: AOI) {
    setBusy(`Querying satellite catalog for new passes over ${aoi.name}…`);
    setError(null);
    try {
      const result = await api.triggerIngestion(aoi.id);
      setBusy(`Satellite pass query complete. Found ${result.scenes_found} scenes.`);
      if (selectedAoi?.id === aoi.id) {
        setScenes(await api.listScenes(aoi.id));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setTimeout(() => setBusy(null), 3000);
    }
  }

  async function handleDownload(scene: Scene) {
    setBusy(`Downloading high-resolution scene & running quality validation: ${scene.product_id}…`);
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

  const indexedScenes = scenes.filter((s) => s.ingestion_state === "INDEXED").length;
  const aoiEvents = selectedAoi
    ? changeEvents.filter((e) => e.aoi_id === selectedAoi.id)
    : changeEvents;

  // Breakdown metrics
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

  return (
    <div className="layout-split">
      <div className="panel">
        {/* User Location Live Telemetry Widget */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(10, 14, 23, 0.9))",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            borderRadius: 8,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
              <div
                style={{
                  position: "absolute",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.4)",
                  animation: "pulseGreen 1.5s infinite",
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", letterSpacing: "0.04em" }}>
                USER GEOLOCATION ACTIVE
              </div>
              <div style={{ fontSize: 11, color: "var(--text-hi)", fontFamily: "var(--mono)", marginTop: 2 }}>
                {userLocationLabel}
              </div>
            </div>
          </div>

          <button
            className="secondary"
            style={{ padding: "4px 8px", fontSize: 10.5 }}
            onClick={() => {
              if (userLocation) {
                navigate(`/investigate?lat=${userLocation[1]}&lng=${userLocation[0]}`);
              }
            }}
          >
            <Crosshair size={11} /> Investigate Here
          </button>
        </div>

        {/* Operational KPI Summary */}
        <div className="kpi-grid" style={{ marginTop: 8 }}>
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span>Monitored Locations</span>
              <MapPin size={12} color="var(--accent)" />
            </div>
            <div className="kpi-card-value">{aois.length}</div>
            <div className="kpi-card-sub">Active observation sectors</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span>Detected Ground Shifts</span>
              <Activity size={12} color="var(--good)" />
            </div>
            <div className="kpi-card-value">{changeEvents.length}</div>
            <div className="kpi-card-sub">Verified by spectral AI</div>
          </div>
        </div>

        {/* Monitored Locations Section Header */}
        <div className="section-title" style={{ marginTop: 12 }}>
          <span>Surveillance Sectors ({aois.length})</span>
          <button
            className={drawing ? "danger" : "primary"}
            style={{ padding: "4px 10px", fontSize: 11 }}
            onClick={() => setDrawing((d) => !d)}
          >
            {drawing ? "Cancel Drawing" : "+ Draw on Map"}
          </button>
        </div>

        {/* Working Draw on Map Form */}
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

        {/* Empty State when no sectors exist */}
        {aois.length === 0 && !drawing && (
          <div className="empty-state-box">
            <Satellite size={32} color="var(--accent)" />
            <div className="empty-state-title">No Surveillance Zones Configured</div>
            <div className="empty-state-desc">
              Click "+ Draw on Map" above to delineate a custom bounding box, or launch an Investigation
              to analyze any coordinates worldwide.
            </div>
            <button
              className="primary"
              onClick={() => navigate("/investigate")}
              style={{ fontSize: 12, marginTop: 8 }}
            >
              <Crosshair size={13} /> Launch Investigation
            </button>
          </div>
        )}

        {/* Monitored Sectors List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {aois.map((aoi) => {
            const isSelected = selectedAoi?.id === aoi.id;
            const aoiEventCount = changeEvents.filter((e) => e.aoi_id === aoi.id).length;

            return (
              <div
                key={aoi.id}
                className={`card${isSelected ? " selected" : ""}`}
                onClick={() => setSelectedAoi(aoi)}
                style={{ cursor: "pointer" }}
              >
                <div className="card-header-row">
                  <div className="card-title" style={{ fontSize: 13, fontWeight: 600 }}>
                    {aoi.name}
                  </div>
                  <span className={`pill ${aoi.monitoring_enabled ? "pill-true" : "pill-insufficient"}`}>
                    {aoi.monitoring_enabled ? "Active" : "Standby"}
                  </span>
                </div>

                <div className="card-meta">
                  <span>
                    <Cloud size={11} style={{ verticalAlign: "middle" }} /> Max Cloud: {aoi.max_cloud_cover}%
                  </span>
                  <span>
                    <Activity size={11} style={{ verticalAlign: "middle" }} /> {aoiEventCount} Changes Detected
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
                    title="Query Copernicus Sentinel-2 for newly acquired passes"
                  >
                    <RefreshCw size={11} /> Check Passes
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
        </div>

        {/* Selected Sector Ground Activity Breakdown */}
        {selectedAoi && (
          <div className="activity-summary-card" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 12, color: "var(--text-hi)" }}>
                {selectedAoi.name.split("(")[0]} — Change Distribution
              </strong>
              <span className="pill pill-sensor">{aoiEvents.length} Total</span>
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
          </div>
        )}

        {/* Satellite Imagery Passes for Selected Sector */}
        {selectedAoi && (
          <>
            <div className="section-title" style={{ marginTop: 14 }}>
              <span>Satellite Passes ({scenes.length})</span>
              <span className="pill pill-sensor">{indexedScenes} Ready</span>
            </div>

            {scenes.length === 0 ? (
              <div className="empty-state-box">
                <Database size={24} />
                <div className="empty-state-title">No Local Satellite Scenes</div>
                <div className="empty-state-desc">
                  Check passes to fetch available multi-spectral imagery.
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
                      <img
                        className="scene-card-thumb"
                        src={api.scenePreviewUrl(scene.id)}
                        alt={scene.product_id}
                        style={{ imageRendering: "-webkit-optimize-contrast" }}
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
                              ? "Cloud Obscured"
                              : "Discovered"}
                          </span>

                          {scene.ingestion_state === "DISCOVERED" && (
                            <button
                              style={{ padding: "2px 8px", fontSize: 10 }}
                              onClick={() => handleDownload(scene)}
                            >
                              <DownloadCloud size={10} /> Download Scene
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
          <div className="alert-banner info" style={{ marginTop: 10 }}>
            <RefreshCw size={14} className="spin" />
            <span>{busy}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner error" style={{ marginTop: 10 }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Interactive Map with User Location and Working Draw on Map */}
      <MapView
        aois={aois}
        changeEvents={aoiEvents}
        drawingEnabled={drawing}
        selectedAoi={selectedAoi}
        userLocation={userLocation}
        onBBoxDrawn={(polygon) => setPendingPolygon(polygon)}
      />
    </div>
  );
}
