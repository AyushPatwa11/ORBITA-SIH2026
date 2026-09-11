import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  Database,
  Download,
  Droplets,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  Layers,
  Locate,
  MapPin,
  MessageSquare,
  Navigation,
  Pickaxe,
  RefreshCw,
  Satellite,
  Search,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
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
import type { AIAgentReport, AOI, ChangeEvent, ChangeReport, Scene, SimilarScene, TimelinePoint } from "../types";

export function Investigation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [aois, setAois] = useState<AOI[]>([]);
  const [aoiId, setAoiId] = useState<string>(searchParams.get("aoi") ?? "");

  // Location selector state
  const [locationTab, setLocationTab] = useState<"search" | "pin" | "gps">("search");
  const [pinnedCoord, setPinnedCoord] = useState<[number, number] | null>(() => {
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    if (latParam && lngParam) {
      return [parseFloat(lngParam), parseFloat(latParam)];
    }
    return [71.915, 27.538]; // Bhadla Solar & Renewable Surveillance Corridor
  });
  const [locationConfirmed, setLocationConfirmed] = useState<boolean>(true);
  const [locationName, setLocationName] = useState<string>("Bhadla Solar & Industrial Complex (Rajasthan)");

  const [pinMode, setPinMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; latitude: number; longitude: number; type: string }>>([]);
  const [searching, setSearching] = useState(false);

  // Area & Zoom Radius state
  const [analysisRadius, setAnalysisRadius] = useState<number>(1.5);

  // Time preset state
  const [timePreset, setTimePreset] = useState<"1_week" | "1_month" | "1_year" | "5_years" | "custom">("1_year");
  const [beforeDate, setBeforeDate] = useState("2024-05-10T10:30");
  const [afterDate, setAfterDate] = useState("2026-04-15T10:30");

  // Visualization modes: "rgb" (True Color), "false_color" (NIR), "night"
  const [visMode, setVisMode] = useState<"rgb" | "false_color" | "night">("rgb");
  const [showMapHeatmap, setShowMapHeatmap] = useState<boolean>(false);

  // Imagery & Analysis state
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [changeReport, setChangeReport] = useState<ChangeReport | null>(null);
  const [aiAgentReport, setAiAgentReport] = useState<AIAgentReport | null>(null);
  const [selected, setSelected] = useState<ChangeEvent | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [similarScenes, setSimilarScenes] = useState<SimilarScene[]>([]);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // AI Agent Interactive Q&A State
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [agentAsking, setAgentAsking] = useState(false);

  // Load AOIs on mount
  useEffect(() => {
    api.listAOIs().then((list) => {
      setAois(list);
      if (list.length > 0 && !aoiId && !searchParams.get("lat")) {
        setAoiId(list[list.length - 1].id);
      }
    });

    // Check if URL has coordinates
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      setPinnedCoord([lng, lat]);
      setLocationName(`Surveillance Point (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`);
      setLocationConfirmed(true);
    }
  }, []);

  // When AOI changes, load scenes & events
  useEffect(() => {
    if (!aoiId) return;
    setSearchParams({ aoi: aoiId });
    api.listScenes(aoiId).then((sc) => {
      setScenes(sc);
      const indexed = sc.filter((s) => s.ingestion_state === "INDEXED");
      if (indexed.length >= 2) {
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

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  };

  // 1. Search & Validate Location via Nominatim
  const handleSearchAddress = async (queryText?: string) => {
    const q = (queryText ?? searchQuery).trim();
    if (!q || q.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const results = await api.geocodeAddress(q);
      setSearchResults(results);
      if (results.length > 0) {
        const top = results[0];
        setPinnedCoord([top.longitude, top.latitude]);
        setLocationName(top.display_name.split(",").slice(0, 3).join(","));
        setLocationConfirmed(true);
        showToast(`📍 Resolved location: ${top.display_name.split(",")[0]}`);
      } else {
        showToast(`❌ No location matches found for "${q}". Please check spelling.`);
      }
    } catch {
      showToast("Geocoding service unavailable. Try pinning directly on the map.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (item: { display_name: string; latitude: number; longitude: number }) => {
    setPinnedCoord([item.longitude, item.latitude]);
    setLocationName(item.display_name.split(",").slice(0, 3).join(","));
    setSearchResults([]);
    setLocationConfirmed(true);
    showToast(`📍 Selected target: ${item.display_name.split(",")[0]}`);
  };

  // 2. GPS Geolocation Handler
  const handleDetectGPS = () => {
    setBusy("Obtaining your position via Geolocation API…");
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setBusy(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setPinnedCoord([lng, lat]);
        setLocationName(`Current Location (${lat}° N, ${lng}° E)`);
        setLocationConfirmed(true);
        setPinMode(false);
        setBusy(null);
        showToast(`📍 Position locked: ${lat}° N, ${lng}° E`);
      },
      () => {
        setPinnedCoord([77.209, 28.614]);
        setLocationName("National Capital Region (Approximate Geolocation)");
        setLocationConfirmed(true);
        setBusy(null);
        showToast("📍 Using regional coordinates");
      },
      { timeout: 8000 }
    );
  };

  // 3. Map Pin Drop Handler
  const handleMapPin = (coord: [number, number]) => {
    setPinnedCoord(coord);
    const lat = Number(coord[1].toFixed(4));
    const lng = Number(coord[0].toFixed(4));
    setLocationName(`Target Coordinates (${lat}° N, ${lng}° E)`);
    setLocationConfirmed(true);
    setPinMode(false);
    showToast(`🎯 Coordinates locked: ${lat}° N, ${lng}° E`);
  };

  // 4. Time Window Preset Handlers
  const applyTimePreset = (preset: "1_week" | "1_month" | "1_year" | "5_years" | "custom") => {
    setTimePreset(preset);
    const now = new Date();
    const nowStr = now.toISOString().substring(0, 16);
    setAfterDate(nowStr);

    let past = new Date();
    if (preset === "1_week") past.setDate(now.getDate() - 7);
    else if (preset === "1_month") past.setDate(now.getDate() - 30);
    else if (preset === "1_year") past.setFullYear(now.getFullYear() - 1);
    else if (preset === "5_years") past.setFullYear(now.getFullYear() - 5);
    else return;

    setBeforeDate(past.toISOString().substring(0, 16));
  };

  // 5. Main Action: Retrieve Real Satellite Imagery & Run Spectral Analysis
  const handleFetchAndAnalyze = async () => {
    if (!pinnedCoord) {
      setError("Please search or pin a valid target location first.");
      return;
    }

    setBusy(`Retrieving multi-spectral satellite imagery and running AI change detection for ${locationName}…`);
    setError(null);
    setAgentAnswer(null);

    try {
      const res = await api.pinAndFetchLocation({
        name: locationName,
        latitude: pinnedCoord[1],
        longitude: pinnedCoord[0],
        time_preset: timePreset,
        before_datetime: beforeDate,
        after_datetime: afterDate,
        change_type_hint: "auto",
        analysis_radius_km: analysisRadius,
      });

      // Update AOI list and select new AOI
      const updatedAois = await api.listAOIs();
      setAois(updatedAois);
      setAoiId(res.aoi_id);

      // Set scenes
      const loadedScenes = await api.listScenes(res.aoi_id);
      setScenes(loadedScenes);
      setBeforeId(res.before_scene.id);
      setAfterId(res.after_scene.id);

      // Set change report & AI agent report
      if (res.change_report) {
        setChangeReport(res.change_report);
      }
      if (res.ai_agent_report) {
        setAiAgentReport(res.ai_agent_report);
      }

      // Set change events
      setEvents(res.change_events);
      if (res.change_events.length > 0) {
        setSelected(res.change_events[0]);
      }

      setBusy(null);
      showToast(`🛰️ Retrieved satellite passes! ${res.ai_agent_report?.headline || `${res.change_events.length} change signal(s)`}`);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  };

  // 6. Ask AI Agent Natural Language Questions
  const handleAskAIAgent = async (customQ?: string) => {
    const q = (customQ ?? agentQuestion).trim();
    if (!q || !pinnedCoord) return;
    setAgentAsking(true);
    try {
      const res = await api.askAIAgent({
        question: q,
        location_name: locationName,
        latitude: pinnedCoord[1],
        longitude: pinnedCoord[0],
        analysis_radius_km: analysisRadius,
        before_datetime: beforeDate,
        after_datetime: afterDate,
        change_category: changeReport?.change_category || "Surface Modification",
        change_area_m2: changeReport?.change_area_m2 || 0,
        change_area_pct: changeReport?.change_area_pct || 0,
        total_area_m2: changeReport?.total_area_m2 || 0,
        indicators: changeReport?.indicators || [],
      });
      setAgentAnswer(res.answer);
    } catch (err) {
      setAgentAnswer("AI Agent analysis could not be completed. Ensure satellite imagery is loaded.");
    } finally {
      setAgentAsking(false);
    }
  };

  // Multi-temporal persistence check
  async function analyzeTimeline(event: ChangeEvent) {
    setBusy("Querying historical satellite sequences to verify temporal persistence…");
    setError(null);
    try {
      const result = await api.analyzeTimeline(event.id);
      setTimeline(result.timeline);
      const refreshedList = await api.listChangeEvents(aoiId);
      setEvents(refreshedList);
      const refreshed = refreshedList.find((e) => e.id === event.id);
      if (refreshed) setSelected(refreshed);
      showToast("Temporal verification complete.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  // Certification
  async function review(status: string) {
    if (!selected) return;
    try {
      const updated = await api.reviewChangeEvent(selected.id, status, note || undefined);
      setSelected(updated);
      setEvents(await api.listChangeEvents(aoiId));
      setNote("");
      showToast(
        status === "CONFIRMED"
          ? "✅ Ground Change Verified & Certified!"
          : status === "REJECTED"
          ? "❌ Dismissed as False Alarm."
          : "⚠️ Marked as Inconclusive."
      );
    } catch (e) {
      setError(String(e));
    }
  }

  // Export report
  const handleExportReport = () => {
    const agentSection = aiAgentReport
      ? `
AI GEOSPATIAL INTELLIGENCE REPORT:
===========================================================
Headline: ${aiAgentReport.headline}
Executive Summary: ${aiAgentReport.executive_summary}
Activity Classification: ${aiAgentReport.activity_type}
Altered Ground Area: ${aiAgentReport.altered_area_ha} hectares (${aiAgentReport.altered_area_pct}% of surveyed sector)
Confidence Level: ${aiAgentReport.confidence_level} (${(aiAgentReport.confidence_score * 100).toFixed(0)}%)

EMPIRICAL SPECTRAL EVIDENCE:
${aiAgentReport.empirical_evidence.map((e) => `  * ${e}`).join("\n")}

RECOMMENDED ACTIONS:
${aiAgentReport.recommended_actions.map((a) => `  * ${a}`).join("\n")}
`
      : "";

    const content = `ORBITA SATELLITE SURVEILLANCE & CHANGE INTELLIGENCE REPORT
===========================================================
Target Location: ${locationName}
Coordinates: ${pinnedCoord ? `${pinnedCoord[1].toFixed(4)}° N, ${pinnedCoord[0].toFixed(4)}° E` : "N/A"}
Survey Radius: ${analysisRadius} km
Report Timestamp: ${new Date().toLocaleString("en-IN")}
Baseline Pass: ${beforeDate}
Inspection Pass: ${afterDate}
${agentSection}
===========================================================
`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ORBITA_Intelligence_Report_${new Date().toISOString().split("T")[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("📥 Investigation Report exported.");
  };

  const beforeDateStr = beforeDate;
  const afterDateStr = afterDate;
  const currentAoi = aois.find((a) => a.id === aoiId);

  return (
    <div className="layout-split with-right">
      {/* Toast alert */}
      {statusToast && (
        <div className="toast-notification">
          <span>{statusToast}</span>
        </div>
      )}

      {/* LEFT COLUMN: Location & Date Controls */}
      <div className="panel">
        <div className="section-title">
          <span>1. Surveillance Location Target</span>
          <TargetIcon />
        </div>

        {/* Location Tabs: Search, Pin, GPS */}
        <div className="form-row" style={{ marginBottom: 8 }}>
          <button
            className={locationTab === "search" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "6px" }}
            onClick={() => setLocationTab("search")}
          >
            <Search size={12} /> Search Address
          </button>
          <button
            className={locationTab === "pin" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "6px" }}
            onClick={() => {
              setLocationTab("pin");
              setPinMode(true);
            }}
          >
            <MapPin size={12} /> Pin Map
          </button>
          <button
            className={locationTab === "gps" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "6px" }}
            onClick={() => {
              setLocationTab("gps");
              handleDetectGPS();
            }}
          >
            <Locate size={12} /> GPS
          </button>
        </div>

        {/* Location Search Input */}
        {locationTab === "search" && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                type="text"
                placeholder="Search any place, city, or coordinates (e.g. Bhadla, Mumbai Port)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchAddress()}
                style={{ fontSize: 11, flex: 1, padding: "7px 10px" }}
              />
              <button
                className="primary"
                style={{ padding: "7px 12px", fontSize: 11 }}
                onClick={() => handleSearchAddress()}
                disabled={searching}
              >
                {searching ? <RefreshCw size={12} className="spin" /> : "Search"}
              </button>
            </div>

            {/* Quick recommendation chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {["Bhadla Solar", "Mundra Port", "New Delhi Central", "Korba Industrial", "Pangong Corridor"].map((chip) => (
                <button
                  key={chip}
                  className="secondary"
                  style={{ padding: "2px 7px", fontSize: 10, borderRadius: 12 }}
                  onClick={() => {
                    setSearchQuery(chip);
                    handleSearchAddress(chip);
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div
                style={{
                  background: "var(--bg-1)",
                  border: "1px solid var(--accent)",
                  borderRadius: 6,
                  marginTop: 6,
                  maxHeight: 180,
                  overflowY: "auto",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                }}
              >
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectSearchResult(item)}
                    style={{
                      padding: "7px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text-hi)" }}>
                      {item.display_name.split(",")[0]}
                    </div>
                    <div style={{ color: "var(--text-low)", fontSize: 9.5 }}>
                      {item.display_name.split(",").slice(1, 4).join(",")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Location Confirmation Badge */}
        {pinnedCoord && (
          <div
            style={{
              background: "var(--bg-2)",
              border: locationConfirmed ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11,
              marginTop: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--text-hi)" }}>{locationName}</span>
              <span className="pill pill-true" style={{ fontSize: 9 }}>CONFIRMED</span>
            </div>
            <div style={{ color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10.5, marginTop: 3 }}>
              Coordinates: {pinnedCoord[1].toFixed(4)}° N, {pinnedCoord[0].toFixed(4)}° E
            </div>
          </div>
        )}

        {/* STEP 2: Time Window Selection */}
        <div className="section-title" style={{ marginTop: 12 }}>
          <span>2. Observation Comparison Window</span>
          <Clock size={13} color="var(--good)" />
        </div>

        {/* Time Preset Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
          <button
            className={timePreset === "1_week" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("1_week")}
          >
            7 Days
          </button>
          <button
            className={timePreset === "1_month" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("1_month")}
          >
            1 Month
          </button>
          <button
            className={timePreset === "1_year" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("1_year")}
          >
            1 Year
          </button>
          <button
            className={timePreset === "5_years" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("5_years")}
          >
            5 Years
          </button>
          <button
            className={timePreset === "custom" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => setTimePreset("custom")}
          >
            Custom
          </button>
        </div>

        {/* Date Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          <div>
            <label style={{ fontSize: 10 }}>Baseline (Before Date)</label>
            <input
              type="datetime-local"
              value={beforeDate}
              onChange={(e) => {
                setBeforeDate(e.target.value);
                setTimePreset("custom");
              }}
              style={{ fontSize: 11, padding: "5px 6px" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>Inspection (After Date)</label>
            <input
              type="datetime-local"
              value={afterDate}
              onChange={(e) => {
                setAfterDate(e.target.value);
                setTimePreset("custom");
              }}
              style={{ fontSize: 11, padding: "5px 6px" }}
            />
          </div>
        </div>

        {/* STEP 3: Detection Radius */}
        <div className="section-title" style={{ marginTop: 12 }}>
          <span>3. Detection Radius</span>
          <Sliders size={13} color="var(--accent)" />
        </div>

        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-mid)" }}>Survey Scope:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)" }}>
              {analysisRadius < 1 ? `${(analysisRadius * 1000).toFixed(0)} m` : `${analysisRadius.toFixed(1)} km`}
              <span style={{ fontSize: 10, color: "var(--text-low)", fontWeight: 400, marginLeft: 6 }}>
                ({(analysisRadius * 2).toFixed(1)} × {(analysisRadius * 2).toFixed(1)} km)
              </span>
            </span>
          </div>

          <input
            type="range"
            min={0.2}
            max={5.0}
            step={0.1}
            value={analysisRadius}
            onChange={(e) => setAnalysisRadius(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
          />
        </div>

        {/* Main Action Button */}
        <button
          className="primary"
          style={{ width: "100%", marginTop: 12, padding: "11px", fontSize: 13, fontWeight: 600 }}
          onClick={handleFetchAndAnalyze}
          disabled={busy !== null}
        >
          {busy ? <RefreshCw size={14} className="spin" /> : <Satellite size={14} />}
          {busy ? "Retrieving Satellite Passes…" : "Retrieve Satellite Passes & Analyze"}
        </button>

        {/* Change Breakdown Stats */}
        {events.length > 0 && (
          <div className="activity-summary-card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 11.5, color: "var(--text-hi)" }}>Ground Change Signals</strong>
              <span className="pill pill-sensor">{events.length} Detected</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
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
          </div>
        )}

        {busy && (
          <div className="alert-banner info" style={{ marginTop: 10 }}>
            <RefreshCw size={14} className="spin" />
            <span>{busy}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner error" style={{ marginTop: 10 }}>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* CENTER COLUMN: Interactive Geospatial Map */}
      <MapView
        aois={aois.filter((a) => a.id === aoiId)}
        changeEvents={events}
        selectedAoi={currentAoi}
        selectedEvent={selected}
        drawingEnabled={false}
        onBBoxDrawn={() => {}}
        onSelectEvent={(evt) => setSelected(evt)}
        pinMode={pinMode}
        pinnedCoord={pinnedCoord}
        onMapPin={handleMapPin}
        analysisRadiusKm={analysisRadius}
        heatmapUrl={changeReport?.heatmap_url}
        showHeatmapOverlay={showMapHeatmap}
        onToggleHeatmap={() => setShowMapHeatmap((prev) => !prev)}
      />

      {/* RIGHT COLUMN: Imagery Comparison & AI Intelligence Agent */}
      <div className="panel right">
        {!beforeId && !changeReport ? (
          <div className="empty-state-box" style={{ margin: "auto" }}>
            <Crosshair size={32} color="var(--accent)" />
            <div className="empty-state-title">No Investigation Active</div>
            <div className="empty-state-desc">
              Select or search a location and time window, then click "Retrieve Satellite Passes & Analyze"
              to load high-resolution imagery and AI intelligence.
            </div>
          </div>
        ) : (
          <>
            {/* Header with Export Action */}
            <div className="section-title">
              <span>Before vs After Satellite Imagery</span>
              <button
                className="secondary"
                style={{ padding: "3px 8px", fontSize: 10.5 }}
                onClick={handleExportReport}
                title="Download Intelligence Report"
              >
                <Download size={11} /> Export Intelligence
              </button>
            </div>

            {/* Exactly 1 BEFORE and 1 AFTER Image Swipe Component */}
            <BeforeAfterSwipe
              beforeUrl={beforeId ? api.scenePreviewUrl(beforeId) : null}
              afterUrl={afterId ? api.scenePreviewUrl(afterId) : null}
              beforeDate={beforeDateStr}
              afterDate={afterDateStr}
              visMode={visMode}
              onVisModeChange={(m) => setVisMode(m)}
            />

            {/* AI Geospatial Intelligence Agent Section */}
            {aiAgentReport && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="section-title">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Bot size={14} color="var(--accent)" />
                    <span>AI Analysis Agent</span>
                  </div>
                  <span className="pill pill-sensor">{aiAgentReport.confidence_level}</span>
                </div>

                {/* Intelligence Assessment Card */}
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(10, 18, 30, 0.95), rgba(15, 25, 42, 0.9))",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#ffffff", marginBottom: 6 }}>
                    {aiAgentReport.headline}
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "var(--text-hi)",
                      background: "rgba(0, 0, 0, 0.3)",
                      padding: "8px 10px",
                      borderRadius: 6,
                      borderLeft: "3px solid var(--accent)",
                    }}
                  >
                    {aiAgentReport.executive_summary}
                  </p>

                  {/* Quantitative Strip */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 10 }}>
                    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: "var(--text-mid)" }}>Altered Area</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)", marginTop: 2 }}>
                        {aiAgentReport.altered_area_ha} ha
                      </div>
                    </div>

                    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: "var(--text-mid)" }}>Sector Share</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", fontFamily: "var(--mono)", marginTop: 2 }}>
                        {aiAgentReport.altered_area_pct}%
                      </div>
                    </div>

                    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: "var(--text-mid)" }}>Activity</div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--good)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {aiAgentReport.activity_type.split("/")[0]}
                      </div>
                    </div>
                  </div>

                  {/* Empirical Spectral Evidence */}
                  {aiAgentReport.empirical_evidence.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-mid)", marginBottom: 4 }}>
                        EMPIRICAL SPECTRAL EVIDENCE:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {aiAgentReport.empirical_evidence.map((ev, i) => (
                          <div key={i} style={{ fontSize: 11, color: "var(--text-hi)", display: "flex", gap: 6 }}>
                            <span style={{ color: "var(--accent)" }}>•</span>
                            <span>{ev}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interactive Q&A Input */}
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6 }}>
                      Ask AI Agent About This Target:
                    </div>

                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        type="text"
                        placeholder="e.g. What changed here? Where was construction? Did water shift?"
                        value={agentQuestion}
                        onChange={(e) => setAgentQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAskAIAgent()}
                        style={{ fontSize: 11, flex: 1, padding: "6px 8px" }}
                      />
                      <button
                        className="primary"
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => handleAskAIAgent()}
                        disabled={agentAsking}
                      >
                        {agentAsking ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                      </button>
                    </div>

                    {/* Quick suggestion prompt chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {[
                        "What changed here?",
                        "Where did construction occur?",
                        "How significant is the change?",
                        "Did water bodies shift?",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          className="secondary"
                          style={{ padding: "2px 6px", fontSize: 9.5, borderRadius: 10 }}
                          onClick={() => {
                            setAgentQuestion(prompt);
                            handleAskAIAgent(prompt);
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>

                    {/* AI Agent Answer Box */}
                    {agentAnswer && (
                      <div
                        style={{
                          background: "var(--bg-0)",
                          border: "1px solid var(--accent)",
                          borderRadius: 6,
                          padding: "10px 12px",
                          marginTop: 8,
                          fontSize: 11.5,
                          lineHeight: 1.6,
                          color: "var(--text-hi)",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {agentAnswer}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Officer Certification Action */}
            {selected && (
              <div style={{ marginTop: 14 }}>
                <div className="section-title">
                  <span>Analyst Verification & Certification</span>
                </div>

                <label style={{ fontSize: 10 }}>Analyst Inspection Note (Optional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Ground disturbance verified against optical pass..."
                  style={{ fontSize: 11 }}
                />

                <div className="form-row" style={{ marginTop: 8 }}>
                  <button className="success" style={{ flex: 1, fontSize: 11 }} onClick={() => review("CONFIRMED")}>
                    <CheckCircle2 size={12} /> Confirm Genuine Change
                  </button>
                  <button className="danger" style={{ flex: 1, fontSize: 11 }} onClick={() => review("REJECTED")}>
                    <XCircle size={12} /> Dismiss False Alarm
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TargetIcon() {
  return <Crosshair size={13} color="var(--accent)" />;
}
