import { useState } from "react";
import { api } from "../api/client";
import { ChangeEventCard } from "../components/ChangeEventCard";
import { MapView } from "../components/MapView";
import type { ChangeEvent, EvidenceCategory, SimilarScene } from "../types";

const EVIDENCE_OPTIONS: (EvidenceCategory | "")[] = [
  "",
  "LIKELY_TRUE_CHANGE",
  "POSSIBLE_CHANGE",
  "LIKELY_FALSE_CHANGE",
  "INSUFFICIENT_EVIDENCE",
];

type Mode = "structured" | "semantic";

export function SearchPage() {
  const [mode, setMode] = useState<Mode>("semantic");

  // structured mode state
  const [query, setQuery] = useState("");
  const [evidenceCategory, setEvidenceCategory] = useState<EvidenceCategory | "">("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [eventResults, setEventResults] = useState<ChangeEvent[]>([]);
  const [selected, setSelected] = useState<ChangeEvent | null>(null);

  // semantic mode state
  const [semanticQuery, setSemanticQuery] = useState("newly built structures near a river");
  const [sceneResults, setSceneResults] = useState<SimilarScene[]>([]);

  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runStructuredSearch() {
    setBusy(true);
    setError(null);
    try {
      const found = await api.searchChangeEvents({
        query,
        evidence_category: evidenceCategory || undefined,
        min_confidence: minConfidence,
      });
      setEventResults(found);
      setSearched(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSemanticSearch() {
    setBusy(true);
    setError(null);
    try {
      const found = await api.semanticSearch(semanticQuery, 10);
      setSceneResults(found);
      setSearched(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout-split">
      <div className="panel">
        <div className="section-title">Search</div>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <button
            className={mode === "semantic" ? "primary" : ""}
            style={{ flex: 1 }}
            onClick={() => {
              setMode("semantic");
              setSearched(false);
            }}
          >
            Semantic (RemoteCLIP)
          </button>
          <button
            className={mode === "structured" ? "primary" : ""}
            style={{ flex: 1 }}
            onClick={() => {
              setMode("structured");
              setSearched(false);
            }}
          >
            Structured filter
          </button>
        </div>

        {mode === "semantic" ? (
          <>
            <div className="hint" style={{ marginBottom: 10 }}>
              Free-text search over scene image embeddings (RemoteCLIP + FAISS) — real retrieval
              code, but the checkpoint isn't staged in this environment, so results below will show
              whether real trained weights loaded. See docs/models/MODEL_SELECTION.md.
            </div>
            <label>Query</label>
            <input
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              placeholder="e.g. newly built structures near a river"
            />
            <button
              className="primary"
              style={{ width: "100%", marginTop: 12 }}
              onClick={runSemanticSearch}
            >
              {busy ? "Searching…" : "Search imagery"}
            </button>
          </>
        ) : (
          <>
            <div className="hint" style={{ marginBottom: 10 }}>
              Keyword + metadata filtering over change events — not image content.
            </div>
            <label>Keyword (matches change type or analyst notes)</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. construction…" />
            <label>Evidence category</label>
            <select
              value={evidenceCategory}
              onChange={(e) => setEvidenceCategory(e.target.value as EvidenceCategory | "")}
            >
              {EVIDENCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "" ? "Any" : opt.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
            <label>Minimum confidence: {(minConfidence * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
            />
            <button
              className="primary"
              style={{ width: "100%", marginTop: 12 }}
              onClick={runStructuredSearch}
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </>
        )}

        {error && (
          <div className="hint" style={{ marginTop: 12, color: "var(--bad)" }}>
            {error}
          </div>
        )}

        <div className="section-title">
          Results {searched && `(${mode === "semantic" ? sceneResults.length : eventResults.length})`}
        </div>
        {!searched && <div className="empty-state">Run a search to see results.</div>}

        {searched && mode === "semantic" && sceneResults.length === 0 && (
          <div className="empty-state">No indexed scenes yet — index scenes from Investigation first.</div>
        )}
        {mode === "semantic" &&
          sceneResults.map((s) => (
            <div key={s.scene_id} className="card" style={{ cursor: "default" }}>
              <img
                src={api.scenePreviewUrl(s.scene_id)}
                alt={s.product_id}
                style={{ width: "100%", borderRadius: 4, marginBottom: 6 }}
              />
              <div className="card-title">{s.product_id}</div>
              <div className="card-meta">
                <span>{new Date(s.acquisition_time).toLocaleDateString()}</span>
                <span>similarity {(s.similarity * 100).toFixed(0)}%</span>
                <span className={`pill ${s.weights_loaded ? "pill-true" : "pill-insufficient"}`}>
                  {s.weights_loaded ? "trained weights" : "random-init (untrained)"}
                </span>
              </div>
            </div>
          ))}

        {searched && mode === "structured" && eventResults.length === 0 && (
          <div className="empty-state">No change events match these filters.</div>
        )}
        {mode === "structured" &&
          eventResults.map((evt) => (
            <ChangeEventCard
              key={evt.id}
              event={evt}
              selected={selected?.id === evt.id}
              onSelect={() => setSelected(evt)}
            />
          ))}
      </div>

      <MapView
        aois={[]}
        changeEvents={mode === "structured" ? (selected ? [selected] : eventResults) : []}
        drawingEnabled={false}
        onBBoxDrawn={() => {}}
      />
    </div>
  );
}
