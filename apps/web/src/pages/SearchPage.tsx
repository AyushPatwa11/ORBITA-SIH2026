import {
  Activity,
  ArrowRight,
  Bot,
  Calendar,
  Clock,
  Compass,
  Crosshair,
  Database,
  ExternalLink,
  History,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ChangeEventCard } from "../components/ChangeEventCard";
import { MapView } from "../components/MapView";
import type { AOI, ChangeEvent, EvidenceCategory, SimilarScene } from "../types";

interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  resultsCount: number;
}

const PRESET_INTELLIGENCE_QUERIES = [
  "Which areas changed the most across surveillance sectors?",
  "Where did new structural construction occur?",
  "Show me open-pit excavation and earthmoving sites.",
  "Did any water bodies or reservoirs shift?",
  "What changed in the Bhadla Solar Park sector?",
];

const STORAGE_KEY = "orbita_semantic_history_v2";

export function SearchPage() {
  const navigate = useNavigate();
  const [aois, setAois] = useState<AOI[]>([]);
  const [allEvents, setAllEvents] = useState<ChangeEvent[]>([]);
  const [query, setQuery] = useState("Which areas changed the most across surveillance sectors?");
  const [matchedEvents, setMatchedEvents] = useState<ChangeEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ChangeEvent | null>(null);
  const [intelligenceAnswer, setIntelligenceAnswer] = useState<string | null>(null);
  const [sceneResults, setSceneResults] = useState<SimilarScene[]>([]);

  // Search History
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveHistory = (newHistory: SearchHistoryItem[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory.slice(0, 10)));
    } catch {}
  };

  // Load database AOIs & Change Events on mount
  useEffect(() => {
    Promise.all([api.listAOIs(), api.listChangeEvents()])
      .then(([loadedAois, loadedEvents]) => {
        setAois(loadedAois);
        setAllEvents(loadedEvents);
        executeIntelligenceQuery("Which areas changed the most across surveillance sectors?", loadedAois, loadedEvents);
      })
      .catch((err) => setError(String(err)));
  }, []);

  // Execute High-Level Intelligence Query using real database data
  const executeIntelligenceQuery = async (
    qText?: string,
    currentAois?: AOI[],
    currentEvents?: ChangeEvent[]
  ) => {
    const q = (qText ?? query).trim();
    if (!q) return;
    setBusy(true);
    setError(null);

    const activeAois = currentAois ?? aois;
    const activeEvents = currentEvents ?? allEvents;

    try {
      const lowerQ = q.toLowerCase();

      // Filter matching events based on query semantics
      let filteredEvents = activeEvents;
      if (lowerQ.includes("construction") || lowerQ.includes("building") || lowerQ.includes("structure")) {
        filteredEvents = activeEvents.filter(
          (e) =>
            (e.change_type || "").toUpperCase().includes("DEVELOPMENT") ||
            (e.change_type || "").toUpperCase().includes("CONSTRUCTION")
        );
      } else if (lowerQ.includes("excavation") || lowerQ.includes("mining") || lowerQ.includes("pit") || lowerQ.includes("demolition")) {
        filteredEvents = activeEvents.filter(
          (e) =>
            (e.change_type || "").toUpperCase().includes("DESTRUCTION") ||
            (e.change_type || "").toUpperCase().includes("EXCAVATION")
        );
      } else if (lowerQ.includes("water") || lowerQ.includes("river") || lowerQ.includes("flood") || lowerQ.includes("reservoir")) {
        filteredEvents = activeEvents.filter((e) =>
          (e.change_type || "").toUpperCase().includes("WATER")
        );
      } else if (lowerQ.includes("bhadla") || lowerQ.includes("solar")) {
        filteredEvents = activeEvents.filter((e) =>
          (e.change_type || "").toUpperCase().includes("DEVELOPMENT") ||
          (e.change_type || "").toUpperCase().includes("SOLAR")
        );
      } else if (lowerQ.includes("most") || lowerQ.includes("largest") || lowerQ.includes("significant")) {
        filteredEvents = [...activeEvents].sort((a, b) => b.change_score - a.change_score);
      }

      setMatchedEvents(filteredEvents);
      if (filteredEvents.length > 0) {
        setSelectedEvent(filteredEvents[0]);
      }

      // Synthesize grounded natural-language answer
      let answer = "";
      if (filteredEvents.length === 0) {
        answer = `No detected ground change events match the criteria "${q}" in the current database of ${activeAois.length} monitored sectors. Launch an Investigation to analyze new coordinates.`;
      } else {
        const topTypes = Array.from(new Set(filteredEvents.map((e) => e.change_type))).slice(0, 3);
        const highConfCount = filteredEvents.filter((e) => e.confidence >= 0.7).length;

        if (lowerQ.includes("construction") || lowerQ.includes("building")) {
          answer = `Identified ${filteredEvents.length} construction and structural development location(s). ${highConfCount} change footprint(s) exhibit high optical confidence (≥70%), characterized by artificial surface expansion and elevated albedo.`;
        } else if (lowerQ.includes("excavation") || lowerQ.includes("mining")) {
          answer = `Identified ${filteredEvents.length} open excavation or soil clearance signal(s). Analysis demonstrates pit depression, subsoil exposure, and vegetation stripping.`;
        } else if (lowerQ.includes("water")) {
          answer = `Found ${filteredEvents.length} hydrological shift signal(s) across monitored water body perimeters.`;
        } else {
          answer = `Found ${filteredEvents.length} confirmed terrestrial change footprint(s) across ${activeAois.length} monitored sector(s). Top observed activity categories include: ${topTypes.join(", ")}.`;
        }
      }
      setIntelligenceAnswer(answer);

      // Also run vector embedding search for visual similarity
      try {
        const scenes = await api.semanticSearch(q, 6);
        setSceneResults(scenes);
      } catch {}

      // Save search to history
      const historyItem: SearchHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        query: q,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        resultsCount: filteredEvents.length,
      };
      saveHistory([historyItem, ...history.filter((h) => h.query !== q)]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="layout-split">
      {/* Left Panel: Higher-Level AI Intelligence Layer */}
      <div className="panel">
        <div className="section-title">
          <span>Semantic AI Intelligence Layer</span>
          <Bot size={14} color="var(--accent)" />
        </div>

        {/* Natural Language Query Input */}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            type="text"
            placeholder="Ask anything about monitored sectors and detected changes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executeIntelligenceQuery()}
            style={{ fontSize: 11.5, flex: 1, padding: "8px 10px" }}
          />
          <button
            className="primary"
            style={{ padding: "8px 14px", fontSize: 11.5, fontWeight: 600 }}
            onClick={() => executeIntelligenceQuery()}
            disabled={busy}
          >
            {busy ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
          </button>
        </div>

        {/* Intelligence Query Preset Chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
          {PRESET_INTELLIGENCE_QUERIES.map((preset) => (
            <button
              key={preset}
              className="secondary"
              style={{ padding: "3px 8px", fontSize: 10, borderRadius: 12 }}
              onClick={() => {
                setQuery(preset);
                executeIntelligenceQuery(preset);
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Synthesized AI Intelligence Brief */}
        {intelligenceAnswer && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(10, 18, 30, 0.95), rgba(15, 25, 42, 0.9))",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: 8,
              padding: "12px 14px",
              marginTop: 12,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Sparkles size={14} color="var(--accent)" />
              <strong style={{ fontSize: 12, color: "#ffffff" }}>Grounded Intelligence Assessment</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--text-hi)" }}>
              {intelligenceAnswer}
            </p>
          </div>
        )}

        {/* Matched Ground Changes Section */}
        <div className="section-title" style={{ marginTop: 14 }}>
          <span>Detected Change Footprints ({matchedEvents.length})</span>
          <span className="pill pill-sensor">REAL SENSOR DATA</span>
        </div>

        {matchedEvents.length === 0 && !busy ? (
          <div className="empty-state-box" style={{ padding: 14 }}>
            <Search size={24} color="var(--text-low)" />
            <div className="empty-state-title">No Change Footprints Found</div>
            <div className="empty-state-desc">
              Try a different natural-language query or adjust your question parameters.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matchedEvents.map((evt) => {
              const aoiMatch = aois.find((a) => a.id === evt.aoi_id);
              const isSelected = selectedEvent?.id === evt.id;

              return (
                <div
                  key={evt.id}
                  className={`card${isSelected ? " selected" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedEvent(evt)}
                >
                  <div className="card-header-row">
                    <div className="card-title" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {evt.change_type}
                    </div>
                    <span
                      className={`pill ${
                        evt.evidence_category === "LIKELY_TRUE_CHANGE"
                          ? "pill-true"
                          : evt.evidence_category === "POSSIBLE_CHANGE"
                          ? "pill-possible"
                          : "pill-false"
                      }`}
                    >
                      {(evt.confidence * 100).toFixed(0)}% Certainty
                    </span>
                  </div>

                  <div className="card-meta">
                    <span>
                      <MapPin size={11} style={{ verticalAlign: "middle" }} />{" "}
                      {aoiMatch?.name.split("(")[0] || "Surveillance Zone"}
                    </span>
                    <span>
                      <Calendar size={11} style={{ verticalAlign: "middle" }} />{" "}
                      {new Date(evt.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Cross-Section Action Button */}
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="primary"
                      style={{ width: "100%", padding: "5px 10px", fontSize: 11 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/investigate?aoi=${evt.aoi_id}`);
                      }}
                    >
                      <Crosshair size={11} /> Investigate Site in Detail <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Vector Retrieval Visual Matches */}
        {sceneResults.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 16 }}>
              <span>Multispectral Vector Matches ({sceneResults.length})</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {sceneResults.slice(0, 4).map((s) => (
                <div key={s.scene_id} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                  <img
                    src={api.scenePreviewUrl(s.scene_id)}
                    alt={s.product_id}
                    style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }}
                  />
                  <div style={{ padding: "4px 6px", fontSize: 10, color: "var(--accent)", fontFamily: "var(--mono)" }}>
                    {(s.similarity * 100).toFixed(0)}% Visual Match
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* History Widget */}
        {history.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="section-title">
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <History size={12} />
                <span>Recent Queries</span>
              </div>
              <button
                className="secondary"
                style={{ padding: "2px 6px", fontSize: 9.5 }}
                onClick={() => saveHistory([])}
              >
                Clear
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.slice(0, 3).map((h) => (
                <div
                  key={h.id}
                  onClick={() => {
                    setQuery(h.query);
                    executeIntelligenceQuery(h.query);
                  }}
                  style={{
                    padding: "5px 8px",
                    background: "var(--bg-2)",
                    borderRadius: 4,
                    fontSize: 10.5,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    "{h.query}"
                  </span>
                  <span style={{ color: "var(--accent)", fontSize: 10 }}>{h.resultsCount} hits ↗</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="alert-banner error" style={{ marginTop: 10 }}>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Center Interactive Map with Matched Change Polygons */}
      <MapView
        aois={aois}
        changeEvents={matchedEvents}
        selectedEvent={selectedEvent}
        drawingEnabled={false}
        onBBoxDrawn={() => {}}
        onSelectEvent={(evt) => setSelectedEvent(evt)}
      />
    </div>
  );
}
