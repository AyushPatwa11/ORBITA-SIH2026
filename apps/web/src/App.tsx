import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Investigation } from "./pages/Investigation";
import { Landing } from "./pages/Landing";
import { SearchPage } from "./pages/SearchPage";

export const OfflineModeContext = createContext<boolean | null>(null);
export const useOfflineMode = () => useContext(OfflineModeContext);

export default function App() {
  const [offlineMode, setOfflineMode] = useState<boolean | null>(null);
  const location = useLocation();
  const isLanding = location.pathname === "/";

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setOfflineMode(Boolean(d.offline_mode)))
      .catch(() => setOfflineMode(false));
  }, []);

  return (
    <OfflineModeContext.Provider value={offlineMode}>
      <div className="app-shell">
        <div className="topbar">
          <NavLink to="/" className="brand" style={{ textDecoration: "none" }}>
            ORBITA
            <small>Prototype / Demonstration System</small>
          </NavLink>
          <nav>
            <NavLink to="/console" className={({ isActive }) => (isActive ? "active" : "")}>
              Overview
            </NavLink>
            <NavLink to="/investigate" className={({ isActive }) => (isActive ? "active" : "")}>
              Investigation
            </NavLink>
            <NavLink to="/search" className={({ isActive }) => (isActive ? "active" : "")}>
              Search
            </NavLink>
          </nav>
          <span className="badge-offline">
            {offlineMode === null ? "checking…" : offlineMode ? "OFFLINE MODE" : "LIVE"}
          </span>
        </div>
        <div className={isLanding ? "route-area route-area-scroll" : "route-area"}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/console" element={<Dashboard />} />
            <Route path="/investigate" element={<Investigation />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </div>
      </div>
    </OfflineModeContext.Provider>
  );
}
