import {
  ArrowRight,
  Compass,
  Crosshair,
  Layers,
  Radar,
  RadioTower,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { GlobeHero } from "../components/GlobeHero";

type Status = "built" | "partial" | "planned";

const STATUS_LABEL: Record<Status, string> = {
  built: "Fully Operational",
  partial: "Partially Integrated",
  planned: "Roadmapped",
};

const STATUS_CLASS: Record<Status, string> = {
  built: "pill-true",
  partial: "pill-possible",
  planned: "pill-insufficient",
};

const FEATURES: {
  icon: typeof Search;
  title: string;
  ps: string;
  status: Status;
  desc: string;
}[] = [
  {
    icon: Search,
    title: "Semantic & Multimodal Retrieval",
    ps: "PS §2.2.1",
    status: "built",
    desc:
      "Natural language text-to-imagery vector search backed by deep visual embeddings and FAISS index, with automated structured metadata constraint filtering.",
  },
  {
    icon: Radar,
    title: "Multi-Temporal Change Analysis",
    ps: "PS §2.2.2",
    status: "built",
    desc:
      "Automated geospatial co-registration, Siamese neural feature comparison (FC-Siam-Diff), and polygon footprint extraction over multi-date scene sequences.",
  },
  {
    icon: ShieldCheck,
    title: "False-Alarm Suppression Engine",
    ps: "PS §2.2.3",
    status: "built",
    desc:
      "Automated quality gating (cloud mask, nodata filtering, resolution verification) plus multi-year temporal persistence and cyclical seasonal pattern suppression.",
  },
  {
    icon: Sparkles,
    title: "Vector Similarity Clustering",
    ps: "PS §2.2.4",
    status: "built",
    desc:
      "Instant geographic site matching using high-dimensional vision embeddings to discover identical terrain and excavation signatures across scenes.",
  },
  {
    icon: Workflow,
    title: "Analyst Decision & Audit Trail",
    ps: "PS §2.2.5",
    status: "built",
    desc:
      "Interactive Before/After comparison, confidence decomposition, certified CONFIRM/REJECT review actions with persistent analyst notes and full raster provenance.",
  },
  {
    icon: RadioTower,
    title: "Air-Gapped Sovereign Deployment",
    ps: "PS §2.2.6 / §2.2.7",
    status: "built",
    desc:
      "Incremental catalog ingestion, rasterio/GDAL GeoTIFF processing, PostGIS spatial store, and strict air-gapped sovereign offline-mode execution.",
  },
];

export function Landing() {
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  async function handleSeedDemo() {
    setSeeding(true);
    setSeedError(null);
    try {
      const result = await api.seedDemo();
      navigate(`/investigate?aoi=${result.aoi_id}`);
    } catch (e) {
      setSeedError(String(e));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="landing">
      {/* Hero Section */}
      <section className="landing-hero">
        <GlobeHero />
        <div className="landing-hero-copy fade-in-up">
          <div className="landing-kicker">
            <Zap size={11} fill="var(--accent)" /> Prototype / Demonstration System · SIH26227 · Team PHOTONS
          </div>
          <h1>ORBITA</h1>
          <p className="landing-tagline">
            Search Earth by meaning. Track changes over time with AI.
          </p>
          <p className="landing-sub">
            A geospatial intelligence platform for satellite surveillance, automated change detection,
            and visual search — built for the Ministry of Defence / Indian Army (DGIS) space technology challenge.
          </p>

          <div className="landing-cta-row">
            <button className="primary" onClick={() => navigate("/console")}>
              <Layers size={14} /> Open Surveillance Console
            </button>
            <button onClick={handleSeedDemo} disabled={seeding}>
              {seeding ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <Zap size={14} fill="#ffffff" />
              )}
              {seeding ? "Loading Korba Satellite Passes…" : "⚡ Demo: Load Korba Mining Sector"}
            </button>
          </div>

          {seedError && (
            <div className="alert-banner error" style={{ maxWidth: 500 }}>
              {seedError}
            </div>
          )}

          <div className="hint" style={{ maxWidth: 500, marginTop: 10 }}>
            ⚡ Loads 15 months of multi-date Sentinel-2 satellite imagery over the Korba Mining Complex,
            and detects ground development, excavation, and land clearance automatically.
          </div>
        </div>
      </section>

      {/* Quick Launch Cards */}
      <section className="landing-section" style={{ paddingBottom: 20 }}>
        <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>
          <span>Core Operational Modules</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <div
            className="feature-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/console")}
          >
            <Layers size={22} color="var(--accent)" />
            <div className="feature-card-title">Observation Console</div>
            <p className="feature-card-desc">
              Manage Areas of Interest, inspect ingested multispectral scenes, verify radiometric
              quality, and track active monitoring status.
            </p>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>
              Launch Console <ArrowRight size={13} />
            </div>
          </div>

          <div
            className="feature-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/investigate")}
          >
            <Crosshair size={22} color="var(--good)" />
            <div className="feature-card-title">Investigation & Verification</div>
            <p className="feature-card-desc">
              Side-by-side satellite comparator, FC-Siam-Diff change masks, multi-temporal persistence
              gating, and analyst certification.
            </p>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--good)", fontSize: 12, fontWeight: 600 }}>
              Inspect Changes <ArrowRight size={13} />
            </div>
          </div>

          <div
            className="feature-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/search")}
          >
            <Sparkles size={22} color="var(--warn)" />
            <div className="feature-card-title">Semantic AI Search</div>
            <p className="feature-card-desc">
              Query high-resolution satellite scenes by natural language intent (e.g. "open pit mine",
              "road clearing") with FAISS vector similarity.
            </p>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--warn)", fontSize: 12, fontWeight: 600 }}>
              Execute Search <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement Specifications Coverage */}
      <section className="landing-section">
        <div className="section-title" style={{ fontSize: 13 }}>
          <span>Defense / Space Tech Problem Statement Compliance (SIH26227)</span>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card fade-in-up" key={f.title}>
              <f.icon size={22} color="var(--accent)" />
              <div className="feature-card-title">{f.title}</div>
              <div className="card-meta">
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{f.ps}</span>
                <span className={`pill ${STATUS_CLASS[f.status]}`}>{STATUS_LABEL[f.status]}</span>
              </div>
              <p className="feature-card-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack Strip */}
      <section className="landing-section" style={{ paddingTop: 10 }}>
        <div className="section-title" style={{ fontSize: 13 }}>
          <span>Architecture & Stack</span>
        </div>
        <div className="stack-strip">
          {[
            "React 18 + TypeScript",
            "MapLibre GL (WGS84)",
            "Three.js Orbit Simulation",
            "FastAPI Async Engine",
            "PostgreSQL + PostGIS",
            "PyTorch FC-Siam-Diff",
            "OpenCLIP + FAISS Vector Index",
            "rasterio / GDAL Engine",
            "Copernicus Sentinel-2 API",
          ].map((s) => (
            <span key={s} className="stack-pill">
              <Layers size={12} color="var(--accent)" /> {s}
            </span>
          ))}
        </div>
      </section>

      <footer className="landing-footer hint">
        <div>
          ORBITA · Space Technology Domain · Indian Army DGIS · SIH 2026
        </div>
        <div>
          <code>DEMO_GUIDE.md</code> · <code>MODEL_CARD.md</code> · <code>SOVEREIGN_OFFLINE</code>
        </div>
      </footer>
    </div>
  );
}
