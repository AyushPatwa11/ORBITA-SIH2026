import {
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Droplets,
  Eye,
  HelpCircle,
  Pickaxe,
  XCircle,
} from "lucide-react";
import type { ChangeEvent } from "../types";

function getChangeCategory(type: string): { label: string; icon: any; color: string } {
  const upper = (type || "").toUpperCase();
  if (upper.includes("DEVELOPMENT") || upper.includes("CONSTRUCTION") || upper.includes("BUILDING")) {
    return { label: "Development & Construction", icon: Building, color: "#38bdf8" };
  }
  if (upper.includes("DESTRUCTION") || upper.includes("EXCAVATION") || upper.includes("CLEARANCE") || upper.includes("MINING")) {
    return { label: "Destruction & Excavation", icon: Pickaxe, color: "#f59e0b" };
  }
  if (upper.includes("WATER") || upper.includes("FLOOD") || upper.includes("RIVER")) {
    return { label: "Water & Environmental", icon: Droplets, color: "#00d2ff" };
  }
  return { label: "Surface Ground Activity", icon: AlertTriangle, color: "#94a3b8" };
}

function getReviewStatus(status: string): { label: string; icon: any; pillClass: string } {
  switch (status) {
    case "CONFIRMED":
      return { label: "Officer Verified (Real Change)", icon: CheckCircle2, pillClass: "pill-true" };
    case "REJECTED":
      return { label: "Dismissed as False Alarm", icon: XCircle, pillClass: "pill-false" };
    case "INCONCLUSIVE":
      return { label: "Inconclusive (Needs More Passes)", icon: HelpCircle, pillClass: "pill-possible" };
    default:
      return { label: "AI Detected (Pending Review)", icon: Eye, pillClass: "pill-insufficient" };
  }
}

interface Props {
  event: ChangeEvent;
  selected: boolean;
  onSelect: () => void;
}

export function ChangeEventCard({ event, selected, onSelect }: Props) {
  const cat = getChangeCategory(event.change_type);
  const rev = getReviewStatus(event.analyst_status);
  const confPct = Math.round(event.confidence * 100);

  const confLabel =
    confPct >= 80 ? "High AI Confidence" : confPct >= 60 ? "Medium Confidence" : "Low Confidence";

  const CatIcon = cat.icon;
  const RevIcon = rev.icon;

  const dateStr = new Date(event.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className={`card${selected ? " selected" : ""}`} onClick={onSelect}>
      {/* Category header */}
      <div className="card-header-row">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: cat.color,
            }}
          >
            <CatIcon size={14} />
          </div>
          <div className="card-title" style={{ fontSize: 13 }}>
            {cat.label}
          </div>
        </div>

        <span className={`pill ${rev.pillClass}`} style={{ fontSize: 9.5 }}>
          <RevIcon size={10} /> {rev.label.split("(")[0]}
        </span>
      </div>

      {/* Confidence Bar */}
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            color: "var(--text-mid)",
            fontFamily: "var(--mono)",
            marginBottom: 3,
          }}
        >
          <span>{confLabel}</span>
          <span style={{ color: "var(--accent)" }}>{confPct}%</span>
        </div>
        <div
          style={{
            width: "100%",
            height: 4,
            background: "var(--bg-0)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${confPct}%`,
              height: "100%",
              background:
                confPct >= 75
                  ? "linear-gradient(90deg, #0284c7, #10b981)"
                  : "linear-gradient(90deg, #0284c7, #f59e0b)",
              borderRadius: 2,
            }}
          />
        </div>
      </div>

      {/* Footer details */}
      <div className="card-meta" style={{ marginTop: 8, justifyContent: "space-between" }}>
        <span>
          <Calendar size={11} style={{ verticalAlign: "middle" }} /> {dateStr}
        </span>
        <span style={{ color: "var(--text-mid)" }}>
          Ground Area: ~400 m²
        </span>
      </div>
    </div>
  );
}
