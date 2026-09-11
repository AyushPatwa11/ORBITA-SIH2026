import {
  ArrowRight,
  Compass,
  Crosshair,
  Database,
  Globe2,
  Layers,
  Radar,
  RadioTower,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobeHero } from "../components/GlobeHero";

const CAPABILITIES = [
  {
    icon: Radar,
    title: "Multi-Temporal Change Detection",
    tag: "Core Vision Engine",
    desc: "Automated sub-pixel co-registration, Siamese neural feature comparison, and precise polygon footprint extraction across multi-date satellite sequences.",
  },
  {
    icon: Sparkles,
    title: "Multispectral Spectral Indexing",
    tag: "Biophysical Analysis",
    desc: "Real-time computation of NDVI (vegetation), Albedo (reflectance), NDBI (built structures), and NDWI (water bodies) from Sentinel-2 and high-resolution optical rasters.",
  },
  {
    icon: ShieldCheck,
    title: "False-Alarm Suppression Engine",
    tag: "Quality Gating",
    desc: "Cloud mask filtering, atmospheric haze compensation, and multi-year temporal persistence gating to eliminate transient weather and seasonal shadow anomalies.",
  },
  {
    icon: Crosshair,
    title: "AI Geospatial Intelligence Agent",
    tag: "Automated Synthesis",
    desc: "Synthesizes empirical spectral indicators and altered surface area into concise, structured intelligence reports answering what changed, where, and why.",
  },
  {
    icon: Search,
    title: "Semantic Natural-Language Earth Query",
    tag: "Higher-Level AI",
    desc: "Query high-dimensional satellite catalogs by natural-language intent (e.g. 'new construction', 'open pit mine', 'water body shifts') with FAISS vector retrieval.",
  },
  {
    icon: RadioTower,
    title: "Sovereign Air-Gapped Deployment",
    tag: "Enterprise Architecture",
    desc: "Standard GDAL/rasterio GeoTIFF processing, PostGIS spatial store, and strict local network execution capability without external dependencies.",
  },
];

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      {/* Hero Section with ORBITA as Main Character */}
      <section className="landing-hero">
        <div className="landing-hero-copy fade-in-up">
          {/* Primary Visual Hierarchy 1: Branding & Title */}
          <div className="landing-kicker">
            <Globe2 size={13} color="var(--accent)" />
            <span>Autonomous Earth Observation Platform</span>
          </div>

          <h1 style={{ fontSize: 56, letterSpacing: "-0.03em", margin: "12px 0 16px" }}>
            ORBITA
          </h1>

          {/* Primary Visual Hierarchy 2: Main Product Message */}
          <p className="landing-tagline" style={{ fontSize: 20, color: "#ffffff", fontWeight: 600, maxWidth: 580 }}>
            Geospatial Intelligence & Terrestrial Change Detection at Scale.
          </p>

          <p className="landing-sub" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-mid)", maxWidth: 540 }}>
            Continuously monitor ground targets, detect infrastructure development, and analyze
            surface modifications using multispectral satellite passes and verified AI change intelligence.
          </p>

          {/* Primary Visual Hierarchy 3: Primary Action Buttons */}
          <div className="landing-cta-row" style={{ marginTop: 24, gap: 12 }}>
            <button
              className="primary"
              style={{ padding: "12px 22px", fontSize: 13.5, fontWeight: 600 }}
              onClick={() => navigate("/investigate")}
            >
              <Crosshair size={16} /> Launch Investigation
            </button>

            <button
              className="secondary"
              style={{ padding: "12px 20px", fontSize: 13.5 }}
              onClick={() => navigate("/console")}
            >
              <Layers size={16} /> Surveillance Overview
            </button>

            <button
              className="secondary"
              style={{ padding: "12px 18px", fontSize: 13.5 }}
              onClick={() => navigate("/search")}
            >
              <Sparkles size={16} color="var(--accent)" /> Semantic AI
            </button>
          </div>

          {/* Live Capability Metrics Strip */}
          <div
            style={{
              display: "flex",
              gap: 20,
              marginTop: 28,
              borderTop: "1px solid var(--border)",
              paddingTop: 16,
              maxWidth: 540,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--mono)" }}>
                10m – 0.5m
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-low)" }}>Multi-Sensor GSD</div>
            </div>

            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--good)", fontFamily: "var(--mono)" }}>
                4-Band
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-low)" }}>RGB + Near-Infrared</div>
            </div>

            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b", fontFamily: "var(--mono)" }}>
                &lt; 2s
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-low)" }}>Spectral AI Analysis</div>
            </div>

            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", fontFamily: "var(--mono)" }}>
                100%
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-low)" }}>Empirical Data Grounding</div>
            </div>
          </div>
        </div>

        {/* Primary Visual Hierarchy 4: Globe Animation as Supporting Visual */}
        <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GlobeHero />
        </div>
      </section>

      {/* Core Platform Modules */}
      <section className="landing-section" style={{ paddingBottom: 24 }}>
        <div className="section-title" style={{ fontSize: 13, marginBottom: 16 }}>
          <span>Operational Modules</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div
            className="feature-card"
            style={{ cursor: "pointer", transition: "transform 0.2s, border-color 0.2s" }}
            onClick={() => navigate("/investigate")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Crosshair size={26} color="var(--accent)" />
              <span className="pill pill-sensor">PRIMARY WORKFLOW</span>
            </div>
            <div className="feature-card-title" style={{ fontSize: 16, marginTop: 12 }}>
              Target Investigation & Analysis
            </div>
            <p className="feature-card-desc">
              Pin or search any location worldwide. Compare dated Sentinel-2 and sub-meter historical
              passes with side-by-side swipes, false-color infrared, and automated AI change reports.
            </p>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>
              Start Investigation <ArrowRight size={14} />
            </div>
          </div>

          <div
            className="feature-card"
            style={{ cursor: "pointer", transition: "transform 0.2s, border-color 0.2s" }}
            onClick={() => navigate("/console")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Layers size={26} color="var(--good)" />
              <span className="pill pill-true">MISSION CONTROL</span>
            </div>
            <div className="feature-card-title" style={{ fontSize: 16, marginTop: 12 }}>
              Surveillance Overview
            </div>
            <p className="feature-card-desc">
              Real-time interactive map with automated live user location, interactive boundary drawing,
              AOI management, and satellite pass health telemetry.
            </p>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, color: "var(--good)", fontSize: 12.5, fontWeight: 600 }}>
              Open Overview <ArrowRight size={14} />
            </div>
          </div>

          <div
            className="feature-card"
            style={{ cursor: "pointer", transition: "transform 0.2s, border-color 0.2s" }}
            onClick={() => navigate("/search")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Sparkles size={26} color="#f59e0b" />
              <span className="pill pill-possible">INTELLIGENCE LAYER</span>
            </div>
            <div className="feature-card-title" style={{ fontSize: 16, marginTop: 12 }}>
              Semantic AI Intelligence
            </div>
            <p className="feature-card-desc">
              Ask natural-language questions across monitored sectors, discover visual terrain patterns,
              and query high-dimensional vision embeddings backed by FAISS vector index.
            </p>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, color: "#f59e0b", fontSize: 12.5, fontWeight: 600 }}>
              Query Intelligence <ArrowRight size={14} />
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Capabilities Grid */}
      <section className="landing-section">
        <div className="section-title" style={{ fontSize: 13, marginBottom: 16 }}>
          <span>Enterprise Geospatial Capabilities</span>
        </div>

        <div className="feature-grid">
          {CAPABILITIES.map((cap) => (
            <div className="feature-card fade-in-up" key={cap.title}>
              <cap.icon size={22} color="var(--accent)" />
              <div className="feature-card-title">{cap.title}</div>
              <div className="card-meta">
                <span className="pill pill-sensor">{cap.tag}</span>
              </div>
              <p className="feature-card-desc">{cap.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Technology & Architecture Strip */}
      <section className="landing-section" style={{ paddingTop: 10 }}>
        <div className="section-title" style={{ fontSize: 13, marginBottom: 12 }}>
          <span>Geospatial Architecture</span>
        </div>

        <div className="stack-strip">
          {[
            "Copernicus Sentinel-2 Process API",
            "Esri Wayback Sub-Meter Archive",
            "MapLibre GL WGS84 Engine",
            "FastAPI Async Telemetry",
            "PostGIS Geospatial Store",
            "FAISS Vector Retrieval",
            "GDAL / rasterio Processing",
            "Three.js Orbit Simulation",
            "Lanczos Micro-Detail Resampling",
          ].map((s) => (
            <span key={s} className="stack-pill">
              <Layers size={12} color="var(--accent)" /> {s}
            </span>
          ))}
        </div>
      </section>

      <footer className="landing-footer hint">
        <div>ORBITA · Autonomous Earth Observation & Change Intelligence Platform</div>
        <div>Continuous Geospatial Telemetry · Enterprise Grade</div>
      </footer>
    </div>
  );
}
