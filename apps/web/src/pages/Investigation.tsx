import {
  Activity,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Crosshair,
  Database,
  Droplets,
  HelpCircle,
  Layers,
  MapPin,
  Pickaxe,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { BeforeAfterSwipe } from "../components/BeforeAfterSwipe";
import { ChangeEventCard } from "../components/ChangeEventCard";
import { MapView } from "../components/MapView";
import { TimelineView } from "../components/TimelineView";
import type { AOI, ChangeEvent, Scene, SimilarScene, TimelinePoint } from "../types";

export function Investigation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [aois, setAois] = useState<AOI[]>([]);
  const [aoiId, setAoiId] = useState<string>(searchParams.get("aoi") ?? "");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [selected, setSelected] = useState<ChangeEvent | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [similarScenes, setSimilarScenes] = useState<SimilarScene[]>([]);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load AOIs
  useEffect(() => {
    api.listAOIs().then((list) => {
      setAois(list);
      if (!aoiId && list.length > 0) {
        // default to latest AOI
        const latest = list[list.length - 1];
        setAoiId(latest.id);
        setSearchParams({ aoi: latest.id });
      }
    });
  }, []);

  // When AOI changes, fetch its scenes and change events
  useEffect(() => {
    if (!aoiId) return;
    setSearchParams({ aoi: aoiId });
    api.listScenes(aoiId).then((sc) => {
      setScenes(sc);
      const indexed = sc.filter((s) => s.ingestion_state === "INDEXED");
      if (indexed.length >= 2) {
        // Auto-select temporal pair: earliest and latest indexed
        setBeforeId(indexed[indexed.length - 1].id);
        setAfterId(indexed[0].id);
      }
    });

    api.listChangeEvents(aoiId).then((evts) => {
      setEvents(evts);
      if (evts.length > 0 && !selected) {
        setSelected(evts[0]);
      }
    });

    setSelected(null);
    setTimeline([]);
    setSimilarScenes([]);
  }, [aoiId]);

  const indexedScenes = scenes.filter((s) => s.ingestion_state === "INDEXED");
  const currentAoi = aois.find((a) => a.id === aoiId);

  // Compute breakdown of changes for this location
  const devCount = events.filter((e) =>
    (e.change_type || "").toUpperCase().includes("DEVELOPMENT") ||
    (e.change_type || "").toUpperCase().includes("CONSTRUCTION")
  ).length;

  const destructionCount = events.filter((e) =>
    (e.change_type || "").toUpperCase().includes("DESTRUCTION") ||
    (e.change_type || "").toUpperCase().includes("EXCAVATION") ||
    (e.change_type || "").toUpperCase().includes("CLEARANCE")
  ).length;

  const waterCount = events.filter((e) =>
    (e.change_type || "").toUpperCase().includes("WATER")
  ).length;

  const confirmedCount = events.filter((e) => e.analyst_status === "CONFIRMED").length;
  const rejectedCount = events.filter((e) => e.analyst_status === "REJECTED").length;
  const pendingCount = events.filter((e) => e.analyst_status === "NEW").length;

  // Run change detection
  async function runDetection() {
    if (!aoiId || !beforeId || !afterId) return;
    setBusy("Comparing satellite images with AI vision model…");
    setError(null);
    try {
      const newEvts = await api.detectChange({
        aoi_id: aoiId,
        before_scene_id: beforeId,
        after_scene_id: afterId,
      });
      const allEvents = await api.listChangeEvents(aoiId);
      setEvents(allEvents);
      if (newEvts.length > 0) {
        setSelected(newEvts[0]);
      }
      setBusy(`Analysis complete! Found ${newEvts.length} change location(s).`);
    } catch (e) {
      setError(String(e));
    } finally {
      setTimeout(() => setBusy(null), 3500);
    }
  }

  // Auto-pair earliest and latest temporal scenes
  function autoPairScenes() {
    if (indexedScenes.length >= 2) {
      setBeforeId(indexedScenes[indexedScenes.length - 1].id);
      setAfterId(indexedScenes[0].id);
    }
  }

  // Multi-temporal persistence check
  async function analyzeTimeline(event: ChangeEvent) {
    setBusy("Checking weather and multi-year seasonal history to eliminate false alarms…");
    setError(null);
    try {
      const result = await api.analyzeTimeline(event.id);
      setTimeline(result.timeline);
      const refreshedList = await api.listChangeEvents(aoiId);
      setEvents(refreshedList);
      const refreshed = refreshedList.find((e) => e.id === event.id);
      if (refreshed) setSelected(refreshed);
      setBusy("Weather & seasonal timeline updated successfully.");
    } catch (e) {
      setError(String(e));
    } finally {
      setTimeout(() => setBusy(null), 2500);
    }
  }

  // Officer review stamp
  async function review(status: string) {
    if (!selected) return;
    try {
      const updated = await api.reviewChangeEvent(selected.id, status, note || undefined);
      setSelected(updated);
      setEvents(await api.listChangeEvents(aoiId));
      setNote("");
    } catch (e) {
      setError(String(e));
    }
  }

  // Find visually similar satellite sites
  async function findSimilar() {
    const afterSceneId = selected?.supporting_observations.find((o) => o.role === "after")?.scene_id;
    if (!afterSceneId) return;
    setSimilarBusy(true);
    setError(null);
    try {
      const sim = await api.findSimilarScenes(afterSceneId, 6);
      setSimilarScenes(sim);
    } catch (e) {
      setError(String(e));
    } finally {
      setSimilarBusy(false);
    }
  }

  // Get date strings for selected event scenes
  const beforeScene = scenes.find((s) => s.id === beforeId);
  const afterScene = scenes.find((s) => s.id === afterId);

  const beforeDateStr = selected
    ? scenes.find((s) => s.id === selected.supporting_observations.find((o) => o.role === "before")?.scene_id)?.acquisition_time ?? beforeScene?.acquisition_time
    : beforeScene?.acquisition_time;

  const afterDateStr = selected
    ? scenes.find((s) => s.id === selected.supporting_observations.find((o) => o.role === "after")?.scene_id)?.acquisition_time ?? afterScene?.acquisition_time
    : afterScene?.acquisition_time;

  return (
    <div className="layout-split with-right">
      {/* Left Column: Location & Detected Changes */}
      <div className="panel">
        <div className="section-title">
          <span>Monitored Location</span>
          <MapPin size={13} color="var(--accent)" />
        </div>

        <select
          value={aoiId}
          onChange={(e) => {
            setAoiId(e.target.value);
            setSelected(null);
          }}
        >
          <option value="">Select Location to Inspect…</option>
          {aois.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {aoiId && (
          <>
            {/* Location Activity Statistics Breakdown */}
            <div className="activity-summary-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 12, color: "var(--text-hi)" }}>
                  Location Activity & Changes
                </strong>
                <span className="pill pill-sensor">{events.length} Total Found</span>
              </div>

              {/* Development vs Destruction vs Water */}
              <div className="activity-stat-row">
                <div className="activity-stat-badge">
                  <div className="activity-stat-num" style={{ color: "#38bdf8" }}>
                    {devCount}
                  </div>
                  <div className="activity-stat-label">🏗️ Development</div>
                </div>

                <div className="activity-stat-badge">
                  <div className="activity-stat-num" style={{ color: "#f59e0b" }}>
                    {destructionCount}
                  </div>
                  <div className="activity-stat-label">⚠️ Excavation</div>
                </div>

                <div className="activity-stat-badge">
                  <div className="activity-stat-num" style={{ color: "#10b981" }}>
                    {waterCount}
                  </div>
                  <div className="activity-stat-label">💧 Water/Land</div>
                </div>
              </div>

              {/* Officer Verification Status Bar */}
              <div
                style={{
                  background: "var(--bg-1)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 10.5,
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--text-mid)",
                }}
              >
                <span>
                  🎖️ <strong>Verified by Officer:</strong> {confirmedCount}
                </span>
                <span>
                  ❌ <strong>Dismissed:</strong> {rejectedCount}
                </span>
                <span>
                  ⏳ <strong>Pending:</strong> {pendingCount}
                </span>
              </div>
            </div>

            {/* Satellite Comparison Setup */}
            <div className="section-title" style={{ marginTop: 12 }}>
              <span>Compare Two Satellite Dates</span>
              {indexedScenes.length >= 2 && (
                <button
                  className="secondary"
                  style={{ padding: "2px 6px", fontSize: 10 }}
                  onClick={autoPairScenes}
                  title="Auto-pair earliest and latest valid observation scenes"
                >
                  <Zap size={10} /> Auto-Pair Dates
                </button>
              )}
            </div>

            <label>1. Earlier Date (Before Image)</label>
            <select value={beforeId} onChange={(e) => setBeforeId(e.target.value)}>
              <option value="">Select earlier satellite image…</option>
              {indexedScenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.acquisition_time).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}{" "}
                  — {s.product_id}
                </option>
              ))}
            </select>

            <label>2. Later Date (After Image)</label>
            <select value={afterId} onChange={(e) => setAfterId(e.target.value)}>
              <option value="">Select later satellite image…</option>
              {indexedScenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.acquisition_time).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}{" "}
                  — {s.product_id}
                </option>
              ))}
            </select>

            <button
              className="primary"
              style={{ width: "100%", marginTop: 10, padding: "9px" }}
              disabled={!beforeId || !afterId || busy !== null}
              onClick={runDetection}
            >
              {busy ? <RefreshCw size={13} className="spin" /> : <Crosshair size={13} />}
              {busy ? "Comparing Satellite Images…" : "Compare Dates & Detect Changes"}
            </button>

            {/* List of Detected Changes */}
            <div className="section-title" style={{ marginTop: 18 }}>
              <span>Detected Change Events ({events.length})</span>
            </div>

            {events.length === 0 ? (
              <div className="empty-state-box">
                <AlertTriangle size={24} color="var(--text-low)" />
                <div className="empty-state-title">No Changes Detected Yet</div>
                <div className="empty-state-desc">
                  Select two dates above and click "Compare Dates" to run AI detection.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {events.map((evt) => (
                  <ChangeEventCard
                    key={evt.id}
                    event={evt}
                    selected={selected?.id === evt.id}
                    onSelect={() => {
                      setSelected(evt);
                      setTimeline([]);
                      setSimilarScenes([]);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {busy && (
          <div className="alert-banner info">
            <RefreshCw size={13} className="spin" />
            <span>{busy}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner error">
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Center Geospatial Map with Interactive Footprints */}
      <MapView
        aois={aois.filter((a) => a.id === aoiId)}
        changeEvents={events}
        selectedAoi={currentAoi}
        selectedEvent={selected}
        drawingEnabled={false}
        onBBoxDrawn={() => {}}
        onSelectEvent={(evt) => setSelected(evt)}
      />

      {/* Right Column: Imagery Evidence & Officer Decision */}
      <div className="panel right">
        {!selected ? (
          <div className="empty-state-box" style={{ margin: "auto" }}>
            <Crosshair size={32} />
            <div className="empty-state-title">Select a Change to Inspect</div>
            <div className="empty-state-desc">
              Click any change event on the left or on the map to see real before & after satellite
              images with exact dates and times.
            </div>
          </div>
        ) : (
          <>
            {/* Satellite Before / After Images */}
            <div className="section-title">
              <span>Before vs After Satellite Imagery</span>
            </div>

            <BeforeAfterSwipe
              beforeUrl={
                selected.supporting_observations.find((o) => o.role === "before")
                  ? api.scenePreviewUrl(
                      selected.supporting_observations.find((o) => o.role === "before")!.scene_id
                    )
                  : null
              }
              afterUrl={
                selected.supporting_observations.find((o) => o.role === "after")
                  ? api.scenePreviewUrl(
                      selected.supporting_observations.find((o) => o.role === "after")!.scene_id
                    )
                  : null
              }
              beforeDate={beforeDateStr}
              afterDate={afterDateStr}
            />

            {/* Change Information in Simple Terms */}
            <div className="section-title" style={{ marginTop: 14 }}>
              <span>Ground Details</span>
            </div>

            <div className="evidence-row">
              <span className="label">Observed Change</span>
              <span className="value" style={{ color: "var(--accent)" }}>
                {selected.change_type}
              </span>
            </div>

            <div className="evidence-row">
              <span className="label">AI Confidence</span>
              <span className="value">
                {(selected.confidence * 100).toFixed(0)}% (
                {selected.confidence >= 0.75
                  ? "High Certainty"
                  : selected.confidence >= 0.55
                  ? "Medium"
                  : "Low"}
                )
              </span>
            </div>

            <div className="evidence-row">
              <span className="label">Image Clarity</span>
              <span className="value" style={{ color: "var(--good)" }}>
                {(selected.quality_score * 100).toFixed(0)}% (Cloud-free pixels verified)
              </span>
            </div>

            <div className="evidence-row">
              <span className="label">AI Change Category</span>
              <span
                className={`pill ${
                  selected.evidence_category === "LIKELY_TRUE_CHANGE"
                    ? "pill-true"
                    : selected.evidence_category === "POSSIBLE_CHANGE"
                    ? "pill-possible"
                    : "pill-false"
                }`}
              >
                {selected.evidence_category === "LIKELY_TRUE_CHANGE"
                  ? "Genuine Ground Change"
                  : selected.evidence_category === "POSSIBLE_CHANGE"
                  ? "Possible Change"
                  : "Weather / False Alarm"}
              </span>
            </div>

            {/* Weather & Seasonal False Alarm Elimination */}
            <div className="section-title" style={{ marginTop: 16 }}>
              <span>Weather & Seasonal Filter</span>
            </div>

            <button
              className="secondary"
              style={{ width: "100%", marginBottom: 8 }}
              onClick={() => analyzeTimeline(selected)}
            >
              <Calendar size={12} /> Check Multi-Date Satellite History
            </button>
            <TimelineView points={timeline} />

            {/* Officer Decision & Verification Stamp */}
            <div className="section-title" style={{ marginTop: 16 }}>
              <span>Officer Verification & Decision</span>
            </div>

            <label>Officer Inspection Note (Optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Ground excavation verified, heavy machinery visible..."
            />

            <div className="form-row" style={{ marginTop: 8 }}>
              <button
                className="success"
                style={{ flex: 1 }}
                onClick={() => review("CONFIRMED")}
              >
                <CheckCircle2 size={12} /> Confirm Real Change
              </button>
              <button
                className="danger"
                style={{ flex: 1 }}
                onClick={() => review("REJECTED")}
              >
                <XCircle size={12} /> Dismiss as False Alarm
              </button>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => review("INCONCLUSIVE")}
              >
                <HelpCircle size={12} /> Inconclusive
              </button>
            </div>

            {/* Similar Satellite Locations */}
            <div className="section-title" style={{ marginTop: 20 }}>
              <span>Visually Similar Locations Across Images</span>
            </div>

            <button
              className="primary"
              style={{ width: "100%", marginBottom: 8 }}
              onClick={findSimilar}
              disabled={similarBusy}
            >
              {similarBusy ? <RefreshCw size={12} className="spin" /> : <Sparkles size={12} />}
              {similarBusy ? "Matching Images in Catalog…" : "Find Similar Terrain & Excavation"}
            </button>

            {similarScenes.length === 0 ? (
              <div className="empty-state-box" style={{ padding: 10 }}>
                <div className="empty-state-desc">
                  Click the button above to scan all satellite imagery for matching ground
                  features.
                </div>
              </div>
            ) : (
              <div className="similar-grid">
                {similarScenes.map((s) => (
                  <div key={s.scene_id} className="similar-tile">
                    <img src={api.scenePreviewUrl(s.scene_id)} alt={s.product_id} />
                    <div className="similar-tile-meta">
                      <span style={{ color: "var(--accent)" }}>
                        {(s.similarity * 100).toFixed(0)}% visual match
                      </span>
                      <span>{new Date(s.acquisition_time).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
