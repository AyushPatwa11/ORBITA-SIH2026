import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AOIForm } from "../components/AOIForm";
import { MapView } from "../components/MapView";
import type { AOI, ChangeEvent, GeoJSONPolygon, Scene } from "../types";

export function Dashboard() {
  const [aois, setAois] = useState<AOI[]>([]);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [selectedAoi, setSelectedAoi] = useState<AOI | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<GeoJSONPolygon | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAois = () => api.listAOIs().then(setAois).catch((e) => setError(String(e)));
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
    setBusy(`Ingesting ${aoi.name}…`);
    setError(null);
    try {
      const result = await api.triggerIngestion(aoi.id);
      setBusy(`Found ${result.scenes_found} scenes.`);
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
    setBusy(`Downloading ${scene.product_id}…`);
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
      await api.createAOI(data);
      setPendingPolygon(null);
      setDrawing(false);
      await refreshAois();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="layout-split">
      <div className="panel">
        <div className="section-title">Areas of interest</div>
        <button onClick={() => setDrawing((d) => !d)} style={{ width: "100%", marginBottom: 10 }}>
          {drawing ? "Cancel drawing" : "+ New AOI"}
        </button>

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

        {aois.length === 0 && <div className="empty-state">No AOIs registered yet.</div>}
        {aois.map((aoi) => (
          <div
            key={aoi.id}
            className={`card${selectedAoi?.id === aoi.id ? " selected" : ""}`}
            onClick={() => setSelectedAoi(aoi)}
          >
            <div className="card-title">{aoi.name}</div>
            <div className="card-meta">
              <span>cloud &lt; {aoi.max_cloud_cover}%</span>
              <span>{aoi.monitoring_enabled ? "monitoring on" : "monitoring off"}</span>
            </div>
            <button
              style={{ marginTop: 8, width: "100%" }}
              onClick={(e) => {
                e.stopPropagation();
                handleIngest(aoi);
              }}
            >
              Check for new scenes
            </button>
          </div>
        ))}

        {selectedAoi && (
          <>
            <div className="section-title">Scenes — {selectedAoi.name}</div>
            {scenes.length === 0 && <div className="empty-state">No scenes ingested yet.</div>}
            {scenes.map((scene) => (
              <div key={scene.id} className="card" style={{ cursor: "default" }}>
                <div className="card-title">{scene.product_id}</div>
                <div className="card-meta">
                  <span>{new Date(scene.acquisition_time).toLocaleDateString()}</span>
                  <span>{scene.sensor}</span>
                  <span>{scene.ingestion_state}</span>
                  {scene.cloud_cover != null && <span>{scene.cloud_cover.toFixed(0)}% cloud</span>}
                </div>
                {scene.ingestion_state === "DISCOVERED" && (
                  <button style={{ marginTop: 6, width: "100%" }} onClick={() => handleDownload(scene)}>
                    Download + quality-check
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {busy && <div className="hint" style={{ marginTop: 12 }}>{busy}</div>}
        {error && (
          <div className="hint" style={{ marginTop: 12, color: "var(--bad)" }}>
            {error}
          </div>
        )}
      </div>

      <MapView
        aois={aois}
        changeEvents={changeEvents}
        drawingEnabled={drawing}
        onBBoxDrawn={(polygon) => setPendingPolygon(polygon)}
      />
    </div>
  );
}
