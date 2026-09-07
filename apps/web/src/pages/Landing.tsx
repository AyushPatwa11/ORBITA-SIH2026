import {
  Layers,
  Radar,
  RadioTower,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { GlobeHero } from "../components/GlobeHero";

type Status = "built" | "partial" | "planned";

const STATUS_LABEL: Record<Status, string> = {
  built: "Implemented",
  partial: "Partially built",
  planned: "Planned, not built",
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
    title: "Semantic & Structured Retrieval",
    ps: "PS §2.2.1",
    status: "partial",
    desc:
      "Structured/metadata search over change events ships and works today. Full text-to-image semantic retrieval is blocked on a verified remote-sensing embedding model — see MODEL_SELECTION.md — rather than faked with generic CLIP.",
  },
  {
    icon: Radar,
    title: "Multi-Temporal Change Analysis",
    ps: "PS §2.2.2",
    status: "partial",
    desc:
      "Real alignment, co-registration, and an FC-Siam-Diff change-detection pass run end to end. Change-type classification (construction / clearance / road / water) isn't built yet — every event is UNCLASSIFIED until it is.",
  },
  {
    icon: ShieldCheck,
    title: "False-Alarm Suppression",
    ps: "PS §2.2.3",
    status: "built",
    desc:
      "Quality gate (cloud/nodata/valid-pixel/resolution) plus a rule-based persistence engine and seasonality detector — recurring same-month signals across years get flagged as likely false alarms, not silently reported as change.",
  },
  {
    icon: Sparkles,
    title: "Discovery & Clustering",
    ps: "PS §2.2.4",
    status: "planned",
    desc:
      "Similar-site discovery from a confirmed event is not implemented — it depends on the same embedding model decision as retrieval above.",
  },
  {
    icon: Workflow,
    title: "Analyst Workflow & Provenance",
    ps: "PS §2.2.5",
    status: "built",
    desc:
      "Review queue, before/after evidence, confidence decomposition, CONFIRM/REJECT/INCONCLUSIVE with notes, and full source-scene + model-version provenance on every event.",
  },
  {
    icon: RadioTower,
    title: "Scale, Ingestion & Sovereignty",
    ps: "PS §2.2.6 / §2.2.7",
    status: "built",
    desc:
      "Incremental ingestion (no full rebuild), OFFLINE_MODE that disables every external call including the frontend basemap, GeoTIFF/COG via rasterio. No vector index yet — nothing to index until retrieval exists.",
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
      <section className="landing-hero">
        <GlobeHero />
        <div className="landing-hero-copy fade-in-up">
          <div className="landing-kicker">
            Prototype / Demonstration System · SIH26227 · Team PHOTONS
          </div>
          <h1>ORBITA</h1>
          <p className="landing-tagline">Search Earth by meaning. Understand change over time.</p>
          <p className="landing-sub">
            An analyst decision-support platform for semantic retrieval and multi-temporal change
            analysis of satellite imagery — built for the Ministry of Defence / Indian Army (DGIS)
            problem statement on space technology.
          </p>
          <div className="landing-cta-row">
            <button className="primary" onClick={() => navigate("/console")}>
              Launch Console
            </button>
            <button onClick={handleSeedDemo} disabled={seeding}>
              {seeding ? "Seeding synthetic demo data…" : "Try it now — seed demo data"}
            </button>
          </div>
          {seedError && (
            <div className="hint" style={{ color: "var(--bad)" }}>
              {seedError}
            </div>
          )}
          <div className="hint" style={{ maxWidth: 480 }}>
            "Seed demo data" generates synthetic GeoTIFF rasters locally and runs them through the
            real pipeline — no live Copernicus credentials needed to try the app. It is not real
            satellite imagery; see DEMO_GUIDE.md.
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-title" style={{ fontSize: 13 }}>
          Capability coverage against the official problem statement
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card fade-in-up" key={f.title}>
              <f.icon size={20} color="var(--accent)" />
              <div className="feature-card-title">{f.title}</div>
              <div className="card-meta">
                <span>{f.ps}</span>
                <span className={`pill ${STATUS_CLASS[f.status]}`}>{STATUS_LABEL[f.status]}</span>
              </div>
              <p className="feature-card-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-title" style={{ fontSize: 13 }}>
          Stack
        </div>
        <div className="stack-strip">
          {[
            "React + TypeScript",
            "MapLibre GL JS",
            "FastAPI",
            "PostgreSQL + PostGIS",
            "PyTorch (FC-Siam-Diff)",
            "rasterio / GDAL",
            "Copernicus Data Space",
          ].map((s) => (
            <span key={s} className="stack-pill">
              <Layers size={12} /> {s}
            </span>
          ))}
        </div>
      </section>

      <footer className="landing-footer hint">
        Honest-limitations doc: <code>LIMITATIONS.md</code> · Demo script: <code>DEMO_GUIDE.md</code> ·
        Model status: <code>docs/models/MODEL_CARD.md</code>
      </footer>
    </div>
  );
}
