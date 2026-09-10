import {
  Compass,
  Crosshair,
  Layers,
  RefreshCw,
  Satellite,
  Sparkles,
  Zap,
} from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api/client";
import { Dashboard } from "./pages/Dashboard";
import { Investigation } from "./pages/Investigation";
import { Landing } from "./pages/Landing";
import { SearchPage } from "./pages/SearchPage";

export const OfflineModeContext = createContext<boolean | null>(null);
export const useOfflineMode = () => useContext(OfflineModeContext);

export default function App() {
  const [offlineMode, setOfflineMode] = useState<boolean | null>(null);
  const [aoiCount, setAoiCount] = useState<number>(0);
  const [eventCount, setEventCount] = useState<number>(0);
  const [seeding, setSeeding] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === "/";

  const refreshStats = () => {
    api.listAOIs().then((a) => setAoiCount(a.length)).catch(() => {});
    api.listChangeEvents().then((e) => setEventCount(e.length)).catch(() => {});
  };

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setOfflineMode(Boolean(d.offline_mode)))
      .catch(() => setOfflineMode(false));

    refreshStats();
    const interval = setInterval(refreshStats, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleTopSeed() {
    setSeeding(true);
    try {
      const res = await api.seedDemo();
      refreshStats();
      navigate(`/investigate?aoi=${res.aoi_id}`);
    } catch (err) {
      alert("Seed failed: " + String(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <OfflineModeContext.Provider value={offlineMode}>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-left">
            <NavLink to="/" className="brand">
              <div className="brand-icon-box">
                <Satellite size={18} strokeWidth={2.2} />
              </div>
              <div className="brand-text">
                <h2>ORBITA</h2>
                <small>EO Change Intelligence · SIH26227</small>
              </div>
            </NavLink>

            <nav>
              <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>
                <Compass size={14} /> Mission
              </NavLink>
              <NavLink to="/console" className={({ isActive }) => (isActive ? "active" : "")}>
                <Layers size={14} /> Overview
              </NavLink>
              <NavLink to="/investigate" className={({ isActive }) => (isActive ? "active" : "")}>
                <Crosshair size={14} /> Investigation
              </NavLink>
              <NavLink to="/search" className={({ isActive }) => (isActive ? "active" : "")}>
                <Sparkles size={14} /> Semantic AI Search
              </NavLink>
            </nav>
          </div>

          <div className="topbar-right">
            <button
              className="seed-btn-top"
              onClick={handleTopSeed}
              disabled={seeding}
              title="Inject synthetic multispectral scenes and trigger automatic change detection"
            >
              {seeding ? (
                <RefreshCw size={13} className="spin" />
              ) : (
                <Zap size={13} fill="#ffffff" />
              )}
              {seeding ? "Injecting Data…" : "Inject Demo Data"}
            </button>

            <div className="telemetry-item">
              <span className="pulse-dot"></span>
              <span>{aoiCount} AOIs · {eventCount} Changes</span>
            </div>

            <div className="telemetry-item" style={{ letterSpacing: "0.04em" }}>
              {offlineMode === null
                ? "CONNECTING…"
                : offlineMode
                ? "AIR-GAPPED"
                : "LIVE TELEMETRY"}
            </div>
          </div>
        </header>

        <main className={isLanding ? "route-area route-area-scroll" : "route-area"}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/console" element={<Dashboard />} />
            <Route path="/investigate" element={<Investigation />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </main>
      </div>
    </OfflineModeContext.Provider>
  );
}

