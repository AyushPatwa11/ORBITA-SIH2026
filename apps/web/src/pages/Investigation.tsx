import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { BeforeAfterSwipe } from "../components/BeforeAfterSwipe";
import { ChangeEventCard } from "../components/ChangeEventCard";
import { MapView } from "../components/MapView";
import { TimelineView } from "../components/TimelineView";
import type { AOI, ChangeEvent, Scene, SimilarScene, TimelinePoint } from "../types";

export function Investigation() {
  const [searchParams] = useSearchParams();
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

  useEffect(() => {
    api.listAOIs().then(setAois);
  }, []);

  useEffect(() => {
    if (!aoiId) return;
    api.listScenes(aoiId).then(setScenes);
    api.listChangeEvents(aoiId).then(setEvents);
    setSelected(null);
    setTimeline([]);
  }, [aoiId]);

  const indexedScenes = scenes.filter((s) => s.ingestion_state === "INDEXED");

  async function runDetection() {
    if (!aoiId || !beforeId || !afterId) return;
    setBusy("Running change detection…");
    setError(null);
    try {
      await api.detectChange({ aoi_id: aoiId, before_scene_id: beforeId, after_scene_id: afterId });
      setEvents(await api.listChangeEvents(aoiId));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function analyzeTimeline(event: ChangeEvent) {
    setBusy("Analyzing temporal evidence…");
    setError(null);
    try {
      const result = await api.analyzeTimeline(event.id);
      setTimeline(result.timeline);
      const refreshedList = await api.listChangeEvents(aoiId);
      setEvents(refreshedList);
      const refreshed = refreshedList.find((e) => e.id === event.id);
      if (refreshed) setSelected(refreshed);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

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

  async function findSimilar() {
    const afterId = selected?.supporting_observations.find((o) => o.role === "after")?.scene_id;
    if (!afterId) return;
    setSimilarBusy(true);
    setError(null);
    try {
      setSimilarScenes(await api.findSimilarScenes(afterId, 6));
    } catch (e) {
      setError(String(e));
    } finally {
      setSimilarBusy(false);
    }
  }

  return (
    <div className="layout-split with-right">
      <div className="panel">
        <div className="section-title">AOI</div>
        <select value={aoiId} onChange={(e) => setAoiId(e.target.value)}>
          <option value="">Select AOI…</option>
          {aois.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {aoiId && (
          <>
            <div className="section-title">Run change detection</div>
            <label>Before scene</label>
            <select value={beforeId} onChange={(e) => setBeforeId(e.target.value)}>
              <option value="">Select…</option>
              {indexedScenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.acquisition_time).toLocaleDateString()} — {s.product_id}
                </option>
              ))}
            </select>
            <label>After scene</label>
            <select value={afterId} onChange={(e) => setAfterId(e.target.value)}>
              <option value="">Select…</option>
              {indexedScenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.acquisition_time).toLocaleDateString()} — {s.product_id}
                </option>
              ))}
            </select>
            <button
              className="primary"
              style={{ width: "100%", marginTop: 10 }}
              disabled={!beforeId || !afterId}
              onClick={runDetection}
            >
              Detect change
            </button>
            {indexedScenes.length < 2 && (
              <div className="hint" style={{ marginTop: 8 }}>
                Need at least two INDEXED (downloaded + quality-passed) scenes. Download scenes from
                the Overview screen first.
              </div>
            )}

            <div className="section-title">Change events</div>
            {events.length === 0 && <div className="empty-state">None yet for this AOI.</div>}
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
        aois={aois.filter((a) => a.id === aoiId)}
        changeEvents={selected ? [selected] : events}
        drawingEnabled={false}
        onBBoxDrawn={() => {}}
      />

      <div className="panel right">
        {!selected && <div className="empty-state">Select a change event to see evidence.</div>}
        {selected && (
          <>
            <div className="section-title">Before / after imagery</div>
            <div className="hint" style={{ marginBottom: 6 }}>
              Model is architecturally complete but untrained — this shows the real pipeline
              output, not a validated detection.
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
            />

            <div className="section-title">Evidence</div>
            <div className="evidence-row">
              <span className="label">Change type</span>
              <span>{selected.change_type}</span>
            </div>
            <div className="evidence-row">
              <span className="label">Confidence</span>
              <span>{(selected.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="evidence-row">
              <span className="label">Quality</span>
              <span>{(selected.quality_score * 100).toFixed(0)}%</span>
            </div>
            <div className="evidence-row">
              <span className="label">Evidence category</span>
              <span>{selected.evidence_category.replace(/_/g, " ").toLowerCase()}</span>
            </div>
            <div className="evidence-row">
              <span className="label">Earliest supported observation</span>
              <span>
                {selected.earliest_supported_date
                  ? new Date(selected.earliest_supported_date).toLocaleDateString()
                  : "not established"}
              </span>
            </div>
            <div className="evidence-row">
              <span className="label">Model version</span>
              <span>{selected.model_version}</span>
            </div>
            <div className="evidence-row">
              <span className="label">Source scenes</span>
              <span>{selected.source_scenes.join(", ")}</span>
            </div>

            <div className="section-title">Temporal timeline</div>
            <button style={{ width: "100%", marginBottom: 8 }} onClick={() => analyzeTimeline(selected)}>
              Analyze timeline
            </button>
            <TimelineView points={timeline} />

            <div className="section-title">Analyst decision</div>
            <label>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
            <div className="form-row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => review("CONFIRMED")}>
                Confirm
              </button>
              <button onClick={() => review("REJECTED")}>Reject</button>
              <button onClick={() => review("INCONCLUSIVE")}>Inconclusive</button>
            </div>

            <div className="section-title">Similar sites</div>
            <button style={{ width: "100%", marginBottom: 8 }} onClick={findSimilar} disabled={similarBusy}>
              {similarBusy ? "Searching…" : "Find similar locations"}
            </button>
            {similarScenes.length === 0 ? (
              <div className="empty-state">
                Run "Find similar locations" to search the embedding index (RemoteCLIP + FAISS).
              </div>
            ) : (
              <div className="similar-grid">
                {similarScenes.map((s) => (
                  <div key={s.scene_id} className="similar-tile">
                    <img src={api.scenePreviewUrl(s.scene_id)} alt={s.product_id} />
                    <div className="similar-tile-meta">
                      <span>{(s.similarity * 100).toFixed(0)}%</span>
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
