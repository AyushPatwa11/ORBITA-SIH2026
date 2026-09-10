import {
  Calendar,
  Clock,
  Crosshair,
  ExternalLink,
  History,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ChangeEventCard } from "../components/ChangeEventCard";
import { MapView } from "../components/MapView";
import type { ChangeEvent, EvidenceCategory, SimilarScene } from "../types";

interface SearchHistoryItem {
  id: string;
  query: string;
  mode: "semantic" | "structured";
  timestamp: string;
  resultsCount: number;
}

const PRESET_QUERIES = [
  "⛏️ Open pit coal mining & excavation",
  "🏗️ New construction, building & factory",
  "💧 Water reservoir expansion & flood",
  "🛣️ Road construction & tree clearance",
  "🌲 Dense forest & green vegetation",
];

const STORAGE_KEY = "orbita_search_history_v1";

export function SearchPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"semantic" | "structured">("semantic");

  // Structured mode state
  const [query, setQuery] = useState("");
  const [evidenceCategory, setEvidenceCategory] = useState<EvidenceCategory | "">("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [eventResults, setEventResults] = useState<ChangeEvent[]>([]);
  const [selected, setSelected] = useState<ChangeEvent | null>(null);

  // Semantic mode state
  const [semanticQuery, setSemanticQuery] = useState("open pit mine or quarry");
  const [sceneResults, setSceneResults] = useState<SimilarScene[]>([]);

  // Search History state
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save history to localStorage
  const saveHistory = (newHistory: SearchHistoryItem[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory.slice(0, 15)));
    } catch {}
  };

  // Add search to history
  const recordSearch = (searchText: string, searchMode: "semantic" | "structured", count: number) => {
    const item: SearchHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      query: searchText,
      mode: searchMode,
      timestamp: new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      resultsCount: count,
    };
    saveHistory([item, ...history.filter((h) => h.query !== searchText)]);
  };

  // Initial search on mount
  useEffect(() => {
    runSemanticSearch();
  }, []);

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
      if (found.length > 0) setSelected(found[0]);
      setSearched(true);
      recordSearch(query || "All Change Events", "structured", found.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSemanticSearch(customQuery?: string) {
    const q = customQuery ?? semanticQuery;
    if (customQuery) setSemanticQuery(customQuery);
    setBusy(true);
    setError(null);
    try {
      const found = await api.semanticSearch(q, 10);
      setSceneResults(found);
      setSearched(true);
      recordSearch(q, "semantic", found.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearHistory() {
    saveHistory([]);
  }

  return (
    <div className="layout-split">
      {/* Left Column: Search & Results */}
      <div className="panel">
        <div className="section-title">
          <span>Satellite Search Intelligence</span>
          <Search size={13} color="var(--accent)" />
        </div>

        {/* Search Mode Toggle */}
        <div className="form-row" style={{ marginBottom: 8 }}>
          <button
            className={mode === "semantic" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "8px" }}
            onClick={() => {
              setMode("semantic");
              setSearched(false);
            }}
          >
            <Sparkles size={12} /> AI Plain English Search
          </button>
          <button
            className={mode === "structured" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "8px" }}
            onClick={() => {
              setMode("structured");
              setSearched(false);
            }}
          >
            <Sliders size={12} /> Filter by Quality & Status
          </button>
        </div>

        {mode === "semantic" ? (
          <>
            <label>What are you looking for in satellite imagery?</label>
            <input
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              placeholder="e.g. open pit mine, new road, tree clearing, water dam..."
              onKeyDown={(e) => {
                if (e.key === "Enter") runSemanticSearch();
              }}
            />

            {/* Prompt Chips */}
            <div className="prompt-chips">
              {PRESET_QUERIES.map((preset) => {
                const clean = preset.replace(/^[^\s]+\s/, "");
                return (
                  <span
                    key={preset}
                    className="chip"
                    onClick={() => runSemanticSearch(clean)}
                  >
                    {preset}
                  </span>
                );
              })}
            </div>

            <button
              className="primary"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => runSemanticSearch()}
              disabled={busy}
            >
              {busy ? <RefreshCw size={13} className="spin" /> : <Search size={13} />}
              {busy ? "Scanning Satellite Images…" : "Search Satellite Imagery"}
            </button>
          </>
        ) : (
          <>
            <label>Keyword Filter</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by change type, e.g. excavation, construction…"
            />

            <label>Change Category</label>
            <select
              value={evidenceCategory}
              onChange={(e) => setEvidenceCategory(e.target.value as EvidenceCategory | "")}
            >
              <option value="">Any Category</option>
              <option value="LIKELY_TRUE_CHANGE">Confirmed Real Change</option>
              <option value="POSSIBLE_CHANGE">Possible Change (Needs Review)</option>
              <option value="LIKELY_FALSE_CHANGE">False Alarm (Weather/Sunlight)</option>
            </select>

            <label>
              Minimum AI Confidence: {(minConfidence * 100).toFixed(0)}%
            </label>
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
              style={{ width: "100%", marginTop: 10 }}
              onClick={runStructuredSearch}
              disabled={busy}
            >
              {busy ? <RefreshCw size={13} className="spin" /> : <Search size={13} />}
              {busy ? "Filtering Images…" : "Apply Filters"}
            </button>
          </>
        )}

        {/* User Search History Widget */}
        <div className="section-title" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <History size={13} />
            <span>Search History ({history.length} searches)</span>
          </div>
          {history.length > 0 && (
            <button
              className="secondary"
              style={{ padding: "2px 6px", fontSize: 10 }}
              onClick={clearHistory}
            >
              <Trash2 size={10} /> Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-low)", padding: "4px 0" }}>
            No recent searches. Try searching for open-pit mining or new roads above.
          </div>
        ) : (
          <div className="search-history-box">
            {history.slice(0, 4).map((h) => (
              <div
                key={h.id}
                className="history-item"
                onClick={() => {
                  if (h.mode === "semantic") {
                    setMode("semantic");
                    runSemanticSearch(h.query);
                  } else {
                    setMode("structured");
                    setQuery(h.query);
                    runStructuredSearch();
                  }
                }}
                title="Click to re-run this search"
              >
                <div>
                  <div className="history-text">🔍 "{h.query}"</div>
                  <div className="history-meta">
                    {h.timestamp} · {h.resultsCount} images found
                  </div>
                </div>
                <span style={{ fontSize: 10.5, color: "var(--accent)" }}>Re-run ↗</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="alert-banner error" style={{ marginTop: 10 }}>
            <span>{error}</span>
          </div>
        )}

        {/* Search Results Feed */}
        <div className="section-title" style={{ marginTop: 16 }}>
          <span>
            Results {searched && `(${mode === "semantic" ? sceneResults.length : eventResults.length} Satellite Images)`}
          </span>
          {searched && (
            <span className="pill pill-sensor">
              {mode === "semantic" ? "AI VISUAL RETRIEVAL" : "METADATA FILTER"}
            </span>
          )}
        </div>

        {/* Semantic Image Results */}
        {mode === "semantic" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sceneResults.length === 0 && searched && (
              <div className="empty-state-box">
                <Search size={24} />
                <div className="empty-state-title">No Matching Satellite Images</div>
                <div className="empty-state-desc">
                  Try another search query or load demo data to view satellite imagery.
                </div>
              </div>
            )}

            {sceneResults.map((s) => {
              const similarityPct = Math.round(s.similarity * 100);
              const formattedDate = new Date(s.acquisition_time).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });

              return (
                <div key={s.scene_id} className="card" style={{ cursor: "default" }}>
                  <div style={{ position: "relative" }}>
                    <img
                      src={api.scenePreviewUrl(s.scene_id)}
                      alt={s.product_id}
                      style={{
                        width: "100%",
                        aspectRatio: "16/9",
                        objectFit: "cover",
                        borderRadius: 6,
                        display: "block",
                        border: "1px solid var(--border)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(5, 7, 12, 0.88)",
                        backdropFilter: "blur(6px)",
                        border: "1px solid var(--border-accent)",
                        color: "var(--accent)",
                        padding: "3px 8px",
                        borderRadius: 12,
                        fontSize: 10.5,
                        fontFamily: "var(--mono)",
                        fontWeight: 600,
                      }}
                    >
                      {similarityPct}% VISUAL MATCH
                    </div>
                  </div>

                  <div className="card-title" style={{ marginTop: 8, fontSize: 12.5, fontFamily: "var(--mono)" }}>
                    {s.product_id}
                  </div>

                  <div className="card-meta">
                    <span style={{ color: "#38bdf8" }}>
                      <Calendar size={11} style={{ verticalAlign: "middle" }} /> {formattedDate}
                    </span>
                    <span className={`pill ${s.weights_loaded ? "pill-true" : "pill-sensor"}`}>
                      {s.weights_loaded ? "RemoteCLIP" : "Sentinel-2"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Structured Change Results */}
        {mode === "structured" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {eventResults.length === 0 && searched && (
              <div className="empty-state-box">
                <Search size={24} />
                <div className="empty-state-title">No Change Events Found</div>
                <div className="empty-state-desc">
                  Adjust your search keyword or lower the confidence threshold.
                </div>
              </div>
            )}

            {eventResults.map((evt) => (
              <ChangeEventCard
                key={evt.id}
                event={evt}
                selected={selected?.id === evt.id}
                onSelect={() => setSelected(evt)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Center Geospatial Map */}
      <MapView
        aois={[]}
        changeEvents={mode === "structured" ? (selected ? [selected] : eventResults) : []}
        selectedEvent={selected}
        drawingEnabled={false}
        onBBoxDrawn={() => {}}
        onSelectEvent={(evt) => setSelected(evt)}
      />
    </div>
  );
}
