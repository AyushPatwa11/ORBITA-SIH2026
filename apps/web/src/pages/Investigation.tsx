import {
  Activity,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Crosshair,
  Database,
  Download,
  DownloadCloud,
  Droplets,
  FileText,
  HelpCircle,
  Layers,
  Locate,
  MapPin,
  Navigation,
  Pickaxe,
  RefreshCw,
  Satellite,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
  Sliders,
  Eye,
  EyeOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { BeforeAfterSwipe } from "../components/BeforeAfterSwipe";
import { ChangeEventCard } from "../components/ChangeEventCard";
import { MapView } from "../components/MapView";
import { TimelineView } from "../components/TimelineView";
import type { AOI, ChangeEvent, ChangeReport, LocationPreset, Scene, SimilarScene, TimelinePoint } from "../types";

export function Investigation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [aois, setAois] = useState<AOI[]>([]);
  const [aoiId, setAoiId] = useState<string>(searchParams.get("aoi") ?? "");
  const [presets, setPresets] = useState<LocationPreset[]>([]);

  // Location selector state
  const [locationTab, setLocationTab] = useState<"preset" | "search" | "pin" | "gps">("search");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("korba-coal");
  const [pinnedCoord, setPinnedCoord] = useState<[number, number] | null>([82.9562, 22.5724]);
  const [pinMode, setPinMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; latitude: number; longitude: number; type: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [locationName, setLocationName] = useState("Korba Open-Cast Mining Complex (Sector-4, Chhattisgarh)");

  // Area & Zoom Radius state
  const [analysisRadius, setAnalysisRadius] = useState<number>(1.5);

  // Time preset state
  const [timePreset, setTimePreset] = useState<"1_week" | "1_month" | "1_year" | "5_years" | "custom">("1_year");
  const [beforeDate, setBeforeDate] = useState("2025-01-15T10:32");
  const [afterDate, setAfterDate] = useState("2026-04-10T10:32");

  // Imagery & Analysis state
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [changeReport, setChangeReport] = useState<ChangeReport | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [selected, setSelected] = useState<ChangeEvent | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [similarScenes, setSimilarScenes] = useState<SimilarScene[]>([]);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Load presets & AOIs on mount
  useEffect(() => {
    api.getPresetLocations().then(setPresets).catch(() => {});
    api.listAOIs().then((list) => {
      setAois(list);
      if (list.length > 0 && !aoiId) {
        setAoiId(list[list.length - 1].id);
      }
    });
  }, []);

  // When AOI changes, load its scenes and change events
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

  const indexedScenes = scenes.filter((s) => s.ingestion_state === "INDEXED");
  const currentAoi = aois.find((a) => a.id === aoiId);

  // Trigger toast alert
  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  };

  // 1. Location Preset Handler
  const handleSelectPreset = (preset: LocationPreset) => {
    setSelectedPresetId(preset.id);
    setLocationName(preset.name);
    setPinnedCoord([preset.longitude, preset.latitude]);
    setPinMode(false);
    if (preset.default_before && preset.default_after) {
      setBeforeDate(preset.default_before.substring(0, 16));
      setAfterDate(preset.default_after.substring(0, 16));
    }
  };

  // 2. GPS / IP Location Detection Handler
  const handleDetectGPS = () => {
    setBusy("Detecting your location via GPS / IP network…");
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
        setPinMode(false);
        setBusy(null);
        showToast(`📍 Centered map at your location: ${lat}° N, ${lng}° E`);
      },
      () => {
        // Fallback to New Delhi if denied or blocked
        setPinnedCoord([77.209, 28.614]);
        setLocationName("New Delhi Capital Region (IP Fallback)");
        setBusy(null);
        showToast("📍 Using approximate regional location (New Delhi)");
      },
      { timeout: 8000 }
    );
  };

  // 2b. Address Search Handler
  const handleSearchAddress = async (queryText?: string) => {
    const q = (queryText ?? searchQuery).trim();
    if (!q || q.length < 2) return;
    setSearching(true);
    try {
      const results = await api.geocodeAddress(q);
      setSearchResults(results);
      if (results.length > 0) {
        const top = results[0];
        setPinnedCoord([top.longitude, top.latitude]);
        setLocationName(top.display_name.split(",").slice(0, 3).join(","));
        showToast(`📍 Found: ${top.display_name.split(",")[0]}`);
      } else {
        showToast(`❌ No location matches found for "${q}"`);
      }
    } catch {
      showToast("Location search error. Please check spelling.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (item: { display_name: string; latitude: number; longitude: number }) => {
    setPinnedCoord([item.longitude, item.latitude]);
    setLocationName(item.display_name.split(",").slice(0, 3).join(","));
    setSearchResults([]);
    showToast(`📍 Pinned: ${item.display_name.split(",")[0]}`);
  };

  // 3. Map Pin Handler
  const handleMapPin = (coord: [number, number]) => {
    setPinnedCoord(coord);
    const lat = Number(coord[1].toFixed(4));
    const lng = Number(coord[0].toFixed(4));
    setLocationName(`Pinned Surveillance Point (${lat}° N, ${lng}° E)`);
    setPinMode(false);
    showToast(`🎯 Pinned location at ${lat}° N, ${lng}° E`);
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

  // 5. Main Action: Fetch Real Imagery & Analyze
  const handleFetchAndAnalyze = async () => {
    if (!pinnedCoord) {
      setError("Please pin or select a location first.");
      return;
    }

    setBusy(`Fetching multi-date Sentinel-2 satellite imagery for ${locationName}…`);
    setError(null);

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

      // Set change report if returned
      if (res.change_report) {
        setChangeReport(res.change_report);
      }

      // Set change events
      setEvents(res.change_events);
      if (res.change_events.length > 0) {
        setSelected(res.change_events[0]);
      }

      setBusy(null);
      showToast(`🛰️ Retrieved satellite passes! ${res.change_report?.change_category || `${res.change_events.length} change signal(s)`}`);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  };

  // 6. Manual Pair Change Detection
  async function runManualDetection() {
    if (!aoiId || !beforeId || !afterId) return;
    setBusy("Comparing selected satellite dates with AI vision model…");
    setError(null);
    try {
      const newEvts = await api.detectChange({
        aoi_id: aoiId,
        before_scene_id: beforeId,
        after_scene_id: afterId,
      });
      const allEvents = await api.listChangeEvents(aoiId);
      setEvents(allEvents);
      if (newEvts.length > 0) setSelected(newEvts[0]);
      showToast(`Detection complete! Found ${newEvts.length} change location(s).`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  // 7. Multi-temporal persistence check
  async function analyzeTimeline(event: ChangeEvent) {
    setBusy("Verifying multi-year satellite passes to eliminate weather & false alarms…");
    setError(null);
    try {
      const result = await api.analyzeTimeline(event.id);
      setTimeline(result.timeline);
      const refreshedList = await api.listChangeEvents(aoiId);
      setEvents(refreshedList);
      const refreshed = refreshedList.find((e) => e.id === event.id);
      if (refreshed) setSelected(refreshed);
      showToast("Weather & multi-year seasonal verification updated.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  // 8. Officer Certification Stamps
  async function review(status: string) {
    if (!selected) return;
    try {
      const updated = await api.reviewChangeEvent(selected.id, status, note || undefined);
      setSelected(updated);
      setEvents(await api.listChangeEvents(aoiId));
      setNote("");
      showToast(
        status === "CONFIRMED"
          ? "✅ Verified & Certified as Genuine Ground Change!"
          : status === "REJECTED"
          ? "❌ Dismissed as False Alarm."
          : "⚠️ Marked as Inconclusive."
      );
    } catch (e) {
      setError(String(e));
    }
  }

  // 9. Find Similar Satellite Sites
  async function findSimilar() {
    const afterSceneId = selected?.supporting_observations.find((o) => o.role === "after")?.scene_id;
    if (!afterSceneId) return;
    setSimilarBusy(true);
    setError(null);
    try {
      const sim = await api.findSimilarScenes(afterSceneId, 6);
      setSimilarScenes(sim);
      showToast(`Found ${sim.length} visually matching locations across satellite catalog.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSimilarBusy(false);
    }
  }

  // 10. Export Investigation Report
  const handleExportReport = () => {
    const intelSection = changeReport
      ? `
CHANGE INTELLIGENCE ANALYSIS:
-----------------------------------------------------------
Change Category: ${changeReport.change_category}
Summary: ${changeReport.change_summary}
Significant Change Verified: ${changeReport.has_significant_change ? "YES - Ground alteration confirmed" : "NO - Stable surface"}
Altered Ground Area: ${(changeReport.change_area_m2 / 10000).toFixed(2)} ha (${Math.round(changeReport.change_area_m2).toLocaleString()} m²)
Area Fraction: ${changeReport.change_area_pct}% of surveyed sector
Total Survey Area: ${(changeReport.total_area_m2 / 1000000).toFixed(2)} km²
Survey Radius: ${analysisRadius} km

SPECTRAL SIGNATURE INDICATORS:
${changeReport.indicators.map((i) => `  * ${i.name}: Δ ${i.delta > 0 ? "+" : ""}${i.delta.toFixed(4)} (${i.delta_pct > 0 ? "+" : ""}${i.delta_pct.toFixed(1)}%) -> ${i.interpretation}`).join("\n")}
`
      : "";

    const eventSection = selected
      ? `
PRIMARY CHANGE EVENT:
-----------------------------------------------------------
Change Type: ${selected.change_type}
AI Confidence: ${(selected.confidence * 100).toFixed(1)}%
Image Quality Score: ${(selected.quality_score * 100).toFixed(1)}%
Evidence Category: ${selected.evidence_category}
Officer Review Status: ${selected.analyst_status}
Officer Note: ${note || "No custom note added."}
Source Scene Products: ${selected.source_scenes.join(", ")}
`
      : "";

    const content = `ORBITA SATELLITE SURVEILLANCE & CHANGE INTELLIGENCE REPORT
===========================================================
Location: ${locationName}
Coordinates: ${pinnedCoord ? `${pinnedCoord[1]}° N, ${pinnedCoord[0]}° E` : "N/A"}
Detection Radius: ${analysisRadius} km
Generated: ${new Date().toLocaleString("en-IN")}
${intelSection}${eventSection}
SATELLITE PASSES COMPARED:
-----------------------------------------------------------
Baseline Pass (T0): ${beforeDate}
Inspection Pass (T1): ${afterDate}
===========================================================
`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ORBITA_REPORT_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📄 Surveillance Investigation Report downloaded.");
  };

  // Change Breakdown Counts
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

  // Scene Dates
  const beforeScene = scenes.find((s) => s.id === beforeId);
  const afterScene = scenes.find((s) => s.id === afterId);

  const beforeDateStr = selected
    ? scenes.find((s) => s.id === selected.supporting_observations.find((o) => o.role === "before")?.scene_id)?.acquisition_time ?? beforeScene?.acquisition_time
    : beforeScene?.acquisition_time ?? beforeDate;

  const afterDateStr = selected
    ? scenes.find((s) => s.id === selected.supporting_observations.find((o) => o.role === "after")?.scene_id)?.acquisition_time ?? afterScene?.acquisition_time
    : afterScene?.acquisition_time ?? afterDate;

  return (
    <div className="layout-split with-right">
      {/* LEFT COLUMN: Location, Time Window & Change Events */}
      <div className="panel">
        {/* Toast Alert */}
        {statusToast && (
          <div className="alert-banner info" style={{ animation: "fadeInUp 0.3s ease" }}>
            <span>{statusToast}</span>
          </div>
        )}

        {/* STEP 1: Location Selection */}
        <div className="section-title">
          <span>1. Select Location to Inspect</span>
          <MapPin size={13} color="var(--accent)" />
        </div>

        {/* Location Tabs */}
        <div className="form-row" style={{ gap: 4, marginBottom: 6 }}>
          <button
            className={locationTab === "search" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "5px 4px", fontSize: 10.5 }}
            onClick={() => {
              setLocationTab("search");
              setPinMode(false);
            }}
          >
            🔍 Search Address
          </button>
          <button
            className={locationTab === "preset" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "5px 4px", fontSize: 10.5 }}
            onClick={() => {
              setLocationTab("preset");
              setPinMode(false);
            }}
          >
            🏭 6 Key Hubs
          </button>
          <button
            className={locationTab === "pin" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "5px 4px", fontSize: 10.5 }}
            onClick={() => {
              setLocationTab("pin");
              setPinMode(true);
              showToast("🎯 Click anywhere on the map to pin any location!");
            }}
          >
            📌 Click Map
          </button>
          <button
            className={locationTab === "gps" ? "primary" : "secondary"}
            style={{ flex: 1, padding: "5px 4px", fontSize: 10.5 }}
            onClick={() => {
              setLocationTab("gps");
              handleDetectGPS();
            }}
          >
            📍 GPS
          </button>
        </div>

        {/* Location Search Input */}
        {locationTab === "search" && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                type="text"
                placeholder="Search any place, city, or address (e.g. Taj Mahal, Mumbai Port)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchAddress()}
                style={{ fontSize: 11, flex: 1, padding: "6px 8px" }}
              />
              <button
                className="primary"
                style={{ padding: "6px 12px", fontSize: 11 }}
                onClick={() => handleSearchAddress()}
                disabled={searching}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>

            {/* Quick recommendation chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {["Taj Mahal", "Bhadla Solar", "Korba Mine", "Pangong Lake", "Mumbai Port", "New Delhi"].map((chip) => (
                <button
                  key={chip}
                  className="secondary"
                  style={{ padding: "2px 6px", fontSize: 9.5, borderRadius: 12 }}
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
                      padding: "6px 10px",
                      fontSize: 10.5,
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

        {/* Location Tab Details */}
        {locationTab === "preset" && (
          <div>
            <label>Real Surveillance Presets</label>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                const match = presets.find((p) => p.id === e.target.value);
                if (match) handleSelectPreset(match);
              }}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {locationTab === "pin" && (
          <div className="alert-banner info" style={{ padding: "6px 10px" }}>
            <span>Click any location on the map to drop a pin. Coordinates update automatically.</span>
          </div>
        )}

        {/* Selected Coordinates & Target Name */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginTop: 4 }}>
          <div style={{ fontWeight: 600, color: "var(--text-hi)" }}>{locationName}</div>
          <div style={{ color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10.5, marginTop: 2 }}>
            Coords: {pinnedCoord ? `${pinnedCoord[1]}° N, ${pinnedCoord[0]}° E` : "No pin selected"}
          </div>
        </div>

        {/* STEP 2: Time Window Selection */}
        <div className="section-title" style={{ marginTop: 10 }}>
          <span>2. Choose Comparison Time Window & Specific Dates</span>
          <Clock size={13} color="var(--good)" />
        </div>

        {/* Time Preset Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
          <button
            className={timePreset === "1_week" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("1_week")}
          >
            ⏱️ 7 Days
          </button>
          <button
            className={timePreset === "1_month" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("1_month")}
          >
            📅 1 Month
          </button>
          <button
            className={timePreset === "1_year" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("1_year")}
          >
            🗓️ 1 Year
          </button>
          <button
            className={timePreset === "5_years" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => applyTimePreset("5_years")}
          >
            ⏳ 5 Years
          </button>
          <button
            className={timePreset === "custom" ? "primary" : "secondary"}
            style={{ padding: "6px 2px", fontSize: 10 }}
            onClick={() => setTimePreset("custom")}
          >
            ⚙️ Custom
          </button>
        </div>

        {/* Date Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          <div>
            <label style={{ fontSize: 10 }}>Baseline (Before Date & Time)</label>
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
            <label style={{ fontSize: 10 }}>Inspection (After Date & Time)</label>
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

        {/* STEP 3: Detection Area & Resolution Zoom */}
        <div className="section-title" style={{ marginTop: 10 }}>
          <span>3. Detection Area & Zoom Scope</span>
          <Sliders size={13} color="var(--accent)" />
        </div>

        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-mid)" }}>Analysis Radius:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)" }}>
              {analysisRadius < 1 ? `${(analysisRadius * 1000).toFixed(0)} m` : `${analysisRadius.toFixed(1)} km`}
              <span style={{ fontSize: 10, color: "var(--text-low)", fontWeight: 400, marginLeft: 6 }}>
                ({(analysisRadius * 2).toFixed(1)} × {(analysisRadius * 2).toFixed(1)} km box)
              </span>
            </span>
          </div>

          <input
            type="range"
            min={0.1}
            max={5.0}
            step={0.1}
            value={analysisRadius}
            onChange={(e) => setAnalysisRadius(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 6 }}>
            {[
              { label: "300m (Site)", val: 0.3 },
              { label: "1.0km (Local)", val: 1.0 },
              { label: "2.0km (Sector)", val: 2.0 },
              { label: "5.0km (Region)", val: 5.0 },
            ].map((preset) => (
              <button
                key={preset.val}
                className={analysisRadius === preset.val ? "primary" : "secondary"}
                style={{ padding: "4px 2px", fontSize: 9.5 }}
                onClick={() => setAnalysisRadius(preset.val)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-low)", marginTop: 5 }}>
            💡 Narrow radius zooms directly into street-level structures; wider radius surveys whole industrial sectors.
          </div>
        </div>

        {/* Big Fetch & Analyze Button */}
        <button
          className="primary"
          style={{ width: "100%", marginTop: 10, padding: "10px", fontSize: 12.5 }}
          onClick={handleFetchAndAnalyze}
          disabled={busy !== null}
        >
          {busy ? <RefreshCw size={14} className="spin" /> : <Satellite size={14} />}
          {busy ? "Fetching & Analyzing Satellite Imagery…" : "Fetch Real Images & Analyze Changes"}
        </button>

        {/* Location Change Breakdown Stats */}
        {events.length > 0 && (
          <div className="activity-summary-card" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 11.5, color: "var(--text-hi)" }}>
                Ground Changes Breakdown
              </strong>
              <span className="pill pill-sensor">{events.length} Total Found</span>
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

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-mid)", borderTop: "1px solid var(--border)", paddingTop: 4 }}>
              <span>🎖️ Verified by Officer: {confirmedCount}</span>
              <span>❌ Dismissed: {rejectedCount}</span>
            </div>
          </div>
        )}

        {/* Change Events Queue */}
        <div className="section-title" style={{ marginTop: 12 }}>
          <span>Detected Change Events ({events.length})</span>
        </div>

        {events.length === 0 ? (
          <div className="empty-state-box" style={{ padding: 14 }}>
            <AlertTriangle size={24} color="var(--text-low)" />
            <div className="empty-state-title">No Changes Detected Yet</div>
            <div className="empty-state-desc">
              Select a location and time window above and click "Fetch Real Images & Analyze Changes".
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

        {busy && (
          <div className="alert-banner info">
            <RefreshCw size={14} className="spin" />
            <span>{busy}</span>
          </div>
        )}

        {error && (
          <div className="alert-banner error">
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* CENTER COLUMN: Map with Interactive Footprints & Pin Mode */}
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
      />

      {/* RIGHT COLUMN: Evidence, Image Viewer & Officer Stamps */}
      <div className="panel right">
        {!selected && !changeReport && !beforeId ? (
          <div className="empty-state-box" style={{ margin: "auto" }}>
            <Crosshair size={32} />
            <div className="empty-state-title">No Change Analysis Loaded</div>
            <div className="empty-state-desc">
              Select or pin a location on the map, set your detection radius, and click "Fetch Real Images & Analyze Changes" to generate an AI change intelligence report.
            </div>
          </div>
        ) : (
          <>
            {/* Header with Export Action */}
            <div className="section-title">
              <span>Change Intelligence & Evidence Report</span>
              <button
                className="secondary"
                style={{ padding: "2px 6px", fontSize: 10 }}
                onClick={handleExportReport}
                title="Download Surveillance Investigation Report"
              >
                <Download size={10} /> Export Report
              </button>
            </div>

            {/* 1. AI CHANGE INTELLIGENCE REPORT */}
            {changeReport && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Executive Status Box */}
                <div
                  style={{
                    background: changeReport.has_significant_change
                      ? "linear-gradient(135deg, rgba(30, 18, 25, 0.95), rgba(16, 22, 35, 0.9))"
                      : "linear-gradient(135deg, rgba(16, 28, 25, 0.95), rgba(16, 22, 35, 0.9))",
                    border: changeReport.has_significant_change
                      ? "1px solid rgba(244, 63, 94, 0.45)"
                      : "1px solid rgba(16, 185, 129, 0.4)",
                    boxShadow: changeReport.has_significant_change
                      ? "0 0 20px rgba(244, 63, 94, 0.15)"
                      : "0 0 16px rgba(16, 185, 129, 0.12)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {changeReport.has_significant_change ? (
                        <AlertTriangle size={17} color="var(--bad)" />
                      ) : (
                        <CheckCircle2 size={17} color="var(--good)" />
                      )}
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: changeReport.has_significant_change ? "#fca5a5" : "#6ee7b7",
                          letterSpacing: "0.2px",
                        }}
                      >
                        {changeReport.change_category}
                      </span>
                    </div>
                    <span
                      className={`pill ${changeReport.has_significant_change ? "pill-true" : "pill-false"}`}
                      style={{ fontSize: 9.5, fontWeight: 700 }}
                    >
                      {changeReport.has_significant_change ? "SIGNIFICANT CHANGE OCCURRED" : "NO MAJOR SHIFT"}
                    </span>
                  </div>

                  {/* Summary Narrative */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "var(--text-hi)",
                      background: "rgba(0, 0, 0, 0.25)",
                      padding: "8px 10px",
                      borderRadius: 6,
                      borderLeft: changeReport.has_significant_change
                        ? "3px solid var(--bad)"
                        : "3px solid var(--good)",
                    }}
                  >
                    {changeReport.change_summary}
                  </p>

                  {changeReport.confidence_explanation && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 10.5,
                        color: "var(--text-mid)",
                        fontStyle: "italic",
                      }}
                    >
                      💡 {changeReport.confidence_explanation}
                    </div>
                  )}
                </div>

                {/* Quantitative Metric Strip */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "var(--text-mid)" }}>Altered Area</div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: changeReport.has_significant_change ? "var(--bad)" : "var(--good)",
                        fontFamily: "var(--mono)",
                        marginTop: 2,
                      }}
                    >
                      {(changeReport.change_area_m2 / 10000).toFixed(2)} ha
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--text-low)" }}>
                      {Math.round(changeReport.change_area_m2).toLocaleString()} m²
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "var(--text-mid)" }}>Surface Share</div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--warn)",
                        fontFamily: "var(--mono)",
                        marginTop: 2,
                      }}
                    >
                      {changeReport.change_area_pct}%
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--text-low)" }}>of detection box</div>
                  </div>

                  <div
                    style={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "var(--text-mid)" }}>Scan Scope</div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--accent)",
                        fontFamily: "var(--mono)",
                        marginTop: 2,
                      }}
                    >
                      {(changeReport.total_area_m2 / 1000000).toFixed(2)} km²
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--text-low)" }}>
                      {analysisRadius} km radius
                    </div>
                  </div>
                </div>

                {/* Spectral Change Indicator Badges */}
                {changeReport.indicators && changeReport.indicators.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-mid)",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Activity size={12} color="var(--accent)" />
                      <span>Spectral Signature Differences</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {changeReport.indicators.map((ind) => {
                        const isHigh = Math.abs(ind.delta) > 0.05;
                        const deltaColor =
                          ind.delta > 0.05
                            ? "var(--accent)"
                            : ind.delta < -0.05
                            ? "var(--bad)"
                            : "var(--text-mid)";

                        return (
                          <div
                            key={ind.name}
                            style={{
                              background: "var(--bg-2)",
                              border: isHigh
                                ? "1px solid var(--border-light)"
                                : "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "6px 10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text-hi)" }}>
                                {ind.name}
                              </span>
                              <span
                                style={{
                                  fontFamily: "var(--mono)",
                                  fontWeight: 700,
                                  fontSize: 11,
                                  color: deltaColor,
                                }}
                              >
                                {ind.delta > 0 ? `+${ind.delta.toFixed(3)}` : ind.delta.toFixed(3)} (
                                {ind.delta_pct > 0
                                  ? `+${ind.delta_pct.toFixed(1)}%`
                                  : `${ind.delta_pct.toFixed(1)}%`}
                                )
                              </span>
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--text-mid)", marginTop: 2 }}>
                              {ind.interpretation}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. SPECTRAL SHIFT HEATMAP */}
            {(aoiId || changeReport?.heatmap_url) && (
              <div style={{ marginTop: 12 }}>
                <div className="section-title">
                  <span>Spectral Shift Heatmap (Spatial Focus)</span>
                  <button
                    className="secondary"
                    style={{ padding: "2px 6px", fontSize: 10 }}
                    onClick={() => setShowHeatmap(!showHeatmap)}
                  >
                    {showHeatmap ? <EyeOff size={10} /> : <Eye size={10} />}
                    {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
                  </button>
                </div>

                {showHeatmap && (
                  <div
                    style={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 8,
                      marginTop: 6,
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        borderRadius: 6,
                        overflow: "hidden",
                        border: "1px solid var(--border-light)",
                        background: "#000",
                      }}
                    >
                      <img
                        src={changeReport?.heatmap_url || api.changeHeatmapUrl(aoiId)}
                        alt="Change Heatmap"
                        style={{
                          width: "100%",
                          display: "block",
                          aspectRatio: "1/1",
                          objectFit: "cover",
                        }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    </div>

                    {/* Heatmap Colormap Scale Bar */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 6,
                        fontSize: 9.5,
                        color: "var(--text-low)",
                      }}
                    >
                      <span>🟦 0.0 Stable</span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          margin: "0 8px",
                          borderRadius: 3,
                          background:
                            "linear-gradient(to right, #001f5c, #0080ff, #00ffff, #ffff00, #ff8000, #ff0000)",
                        }}
                      />
                      <span>🟥 0.8+ High Shift</span>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-mid)",
                        marginTop: 4,
                        textAlign: "center",
                      }}
                    >
                      Red and yellow pixels indicate concentrated ground excavation, earthmoving, or new structures.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. GROUND DETAILS & CLASSIFICATION */}
            {selected && (
              <>
                <div className="section-title" style={{ marginTop: 12 }}>
                  <span>Ground Observation Details</span>
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
                  <span className="label">AI Category</span>
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
              </>
            )}

            {/* 4. WEATHER & SEASONAL FILTER */}
            {selected && (
              <>
                <div className="section-title" style={{ marginTop: 14 }}>
                  <span>Weather & Seasonal Verification</span>
                </div>

                <button
                  className="secondary"
                  style={{ width: "100%", marginBottom: 8 }}
                  onClick={() => analyzeTimeline(selected)}
                >
                  <Calendar size={12} /> Check Weather & Multi-Year History
                </button>
                <TimelineView points={timeline} />
              </>
            )}

            {/* 5. OFFICER VERIFICATION & CERTIFICATION */}
            {selected && (
              <>
                <div className="section-title" style={{ marginTop: 14 }}>
                  <span>Officer Verification & Certification</span>
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
              </>
            )}

            {/* 6. VISUALLY SIMILAR LOCATIONS */}
            {selected && (
              <>
                <div className="section-title" style={{ marginTop: 18 }}>
                  <span>Visually Similar Locations in Satellite Catalog</span>
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

            {/* 7. EVIDENCE SATELLITE PHOTOS AT THE BOTTOM */}
            <div className="section-title" style={{ marginTop: 18 }}>
              <span>Before vs After Satellite Imagery (Evidence Photos)</span>
            </div>

            <BeforeAfterSwipe
              beforeUrl={
                selected?.supporting_observations.find((o) => o.role === "before")
                  ? api.scenePreviewUrl(
                      selected.supporting_observations.find((o) => o.role === "before")!.scene_id
                    )
                  : beforeId
                  ? api.scenePreviewUrl(beforeId)
                  : null
              }
              afterUrl={
                selected?.supporting_observations.find((o) => o.role === "after")
                  ? api.scenePreviewUrl(
                      selected.supporting_observations.find((o) => o.role === "after")!.scene_id
                    )
                  : afterId
                  ? api.scenePreviewUrl(afterId)
                  : null
              }
              beforeDate={beforeDateStr}
              afterDate={afterDateStr}
            />
          </>
        )}
      </div>
    </div>
  );
}
