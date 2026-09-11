import {
  Calendar,
  Clock,
  Columns2,
  Download,
  Eye,
  Maximize2,
  Moon,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  beforeUrl: string | null;
  afterUrl: string | null;
  beforeLabel?: string;
  afterLabel?: string;
  beforeDate?: string | null;
  afterDate?: string | null;
  visMode?: "rgb" | "false_color" | "night";
  onVisModeChange?: (mode: "rgb" | "false_color" | "night") => void;
}

function formatDateTime(dtStr?: string | null): string {
  if (!dtStr) return "Unknown Date & Time";
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function calculateDaysDifference(dt1?: string | null, dt2?: string | null): string {
  if (!dt1 || !dt2) return "";
  const d1 = new Date(dt1).getTime();
  const d2 = new Date(dt2).getTime();
  if (isNaN(d1) || isNaN(d2)) return "";
  const diffDays = Math.abs(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  if (diffDays >= 30) {
    const months = Math.round(diffDays / 30.4);
    return `${diffDays} days apart (~${months} months)`;
  }
  return `${diffDays} days apart`;
}

function appendModeAndHD(url: string | null, mode?: string, hd?: boolean): string | null {
  if (!url) return null;
  const parts = url.split("?");
  const base = parts[0];
  const params = new URLSearchParams(parts[1] || "");
  if (hd) params.set("hd", "true");
  if (mode && mode !== "rgb") params.set("mode", mode);
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ""}`;
}

export function BeforeAfterSwipe({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  beforeDate,
  afterDate,
  visMode = "rgb",
  onVisModeChange,
}: Props) {
  const [split, setSplit] = useState(50);
  const [viewMode, setViewMode] = useState<"swipe" | "split">("swipe");
  const [hdModalOpen, setHdModalOpen] = useState(false);
  const [hdZoom, setHdZoom] = useState(1);
  const frameRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  if (!beforeUrl || !afterUrl) {
    return (
      <div className="empty-state-box" style={{ padding: 16 }}>
        <div className="empty-state-desc">
          Select or search a location and time window to load before & after satellite images.
        </div>
      </div>
    );
  }

  const activeBeforeUrl = appendModeAndHD(beforeUrl, visMode, false)!;
  const activeAfterUrl = appendModeAndHD(afterUrl, visMode, false)!;
  const hdBeforeUrl = appendModeAndHD(beforeUrl, visMode, true)!;
  const hdAfterUrl = appendModeAndHD(afterUrl, visMode, true)!;

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    updateSplit(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updateSplit(e.clientX);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const updateSplit = (clientX: number) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = Math.round((x / rect.width) * 100);
    setSplit(pct);
  };

  const timeDiff = calculateDaysDifference(beforeDate, afterDate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Date & Time Header Bar */}
      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#38bdf8" }}>
            <Calendar size={12} />
            <strong>BEFORE:</strong> {formatDateTime(beforeDate)}
          </div>
          <span className="pill pill-sensor">BASELINE PASS</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--good)" }}>
            <Calendar size={12} />
            <strong>AFTER:</strong> {formatDateTime(afterDate)}
          </div>
          <span className="pill pill-true">INSPECTION PASS</span>
        </div>

        {timeDiff && (
          <div
            style={{
              fontSize: 10.5,
              color: "var(--text-low)",
              fontFamily: "var(--mono)",
              borderTop: "1px solid var(--border)",
              paddingTop: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={11} /> Interval: {timeDiff}
            </span>
            <span style={{ color: "var(--accent)", fontSize: 10 }}>1024×1024 Native HD</span>
          </div>
        )}
      </div>

      {/* Mode & Visualization Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        {/* Spectral Band Selector */}
        {onVisModeChange && (
          <div style={{ display: "flex", gap: 3 }}>
            <button
              className={visMode === "rgb" ? "primary" : "secondary"}
              style={{ padding: "3px 7px", fontSize: 10 }}
              onClick={() => onVisModeChange("rgb")}
              title="Standard True-Color RGB"
            >
              <Sun size={10} /> True Color
            </button>
            <button
              className={visMode === "false_color" ? "primary" : "secondary"}
              style={{ padding: "3px 7px", fontSize: 10 }}
              onClick={() => onVisModeChange("false_color")}
              title="False-Color Infrared (Highlights vegetation in red & urban surfaces in cyan)"
            >
              <Sparkles size={10} /> False Color NIR
            </button>
            <button
              className={visMode === "night" ? "primary" : "secondary"}
              style={{ padding: "3px 7px", fontSize: 10 }}
              onClick={() => onVisModeChange("night")}
              title="Night Mode / Dark Earth Contrast"
            >
              <Moon size={10} /> Night
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button
            className={viewMode === "swipe" ? "primary" : "secondary"}
            style={{ padding: "3px 8px", fontSize: 10.5 }}
            onClick={() => setViewMode("swipe")}
          >
            <Sliders size={11} /> Swipe
          </button>
          <button
            className={viewMode === "split" ? "primary" : "secondary"}
            style={{ padding: "3px 8px", fontSize: 10.5 }}
            onClick={() => setViewMode("split")}
          >
            <Columns2 size={11} /> Dual
          </button>
          <button
            className="secondary"
            style={{ padding: "3px 8px", fontSize: 10.5, borderColor: "var(--accent)" }}
            onClick={() => {
              setHdZoom(1);
              setHdModalOpen(true);
            }}
            title="Inspect satellite imagery at 100% full native resolution"
          >
            <Maximize2 size={11} color="var(--accent)" /> HD Inspector
          </button>
        </div>
      </div>

      {/* Swipe View */}
      {viewMode === "swipe" ? (
        <>
          <div
            ref={frameRef}
            className="swipe-frame"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ cursor: "ew-resize", userSelect: "none" }}
          >
            {/* Before image */}
            <img
              src={activeBeforeUrl}
              alt={beforeLabel ?? "Before image"}
              className="swipe-img"
              style={{ imageRendering: "-webkit-optimize-contrast" }}
            />

            {/* After image clipped */}
            <div className="swipe-clip" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <img
                src={activeAfterUrl}
                alt={afterLabel ?? "After image"}
                className="swipe-img"
                style={{ imageRendering: "-webkit-optimize-contrast" }}
              />
            </div>

            {/* Slider handle */}
            <div className="swipe-handle" style={{ left: `${split}%` }}>
              <div className="swipe-handle-center">↔</div>
            </div>

            <div className="swipe-tag swipe-tag-left">
              BEFORE ({formatDateTime(beforeDate).split(",")[0]})
            </div>
            <div className="swipe-tag swipe-tag-right">
              AFTER ({formatDateTime(afterDate).split(",")[0]})
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            style={{ margin: "0" }}
          />
        </>
      ) : (
        /* Dual View */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            <img
              src={activeBeforeUrl}
              alt="Before"
              style={{
                width: "100%",
                aspectRatio: "1/1",
                objectFit: "cover",
                display: "block",
                imageRendering: "-webkit-optimize-contrast",
              }}
            />
            <div className="swipe-tag swipe-tag-left" style={{ bottom: 6, left: 6, fontSize: 9.5 }}>
              BEFORE: {formatDateTime(beforeDate).split(",")[0]}
            </div>
          </div>
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            <img
              src={activeAfterUrl}
              alt="After"
              style={{
                width: "100%",
                aspectRatio: "1/1",
                objectFit: "cover",
                display: "block",
                imageRendering: "-webkit-optimize-contrast",
              }}
            />
            <div className="swipe-tag swipe-tag-right" style={{ bottom: 6, right: 6, fontSize: 9.5 }}>
              AFTER: {formatDateTime(afterDate).split(",")[0]}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen HD Satellite Inspector Modal */}
      {hdModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 5, 10, 0.94)",
            backdropFilter: "blur(12px)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            padding: 20,
          }}
        >
          {/* Modal Top Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              borderBottom: "1px solid var(--border)",
              paddingBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#ffffff" }}>
                🛰️ HD Satellite Imagery Inspector (Native Resolution)
              </span>
              <span className="pill pill-sensor">2048×2048 UNCOMPRESSED</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className={hdZoom === 1 ? "primary" : "secondary"}
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={() => setHdZoom(1)}
              >
                1× Normal
              </button>
              <button
                className={hdZoom === 1.5 ? "primary" : "secondary"}
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={() => setHdZoom(1.5)}
              >
                <ZoomIn size={12} /> 1.5×
              </button>
              <button
                className={hdZoom === 2 ? "primary" : "secondary"}
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={() => setHdZoom(2)}
              >
                <ZoomIn size={12} /> 2× Zoom
              </button>
              <button
                className="danger"
                style={{ padding: "4px 12px", fontSize: 12 }}
                onClick={() => setHdModalOpen(false)}
              >
                <X size={14} /> Close
              </button>
            </div>
          </div>

          {/* Modal Main Content */}
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              overflow: "auto",
              padding: 10,
              alignItems: "center",
            }}
          >
            {/* Before Full Image */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "var(--bg-1)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                height: "100%",
                overflow: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#38bdf8", fontSize: 13 }}>
                  BASELINE PASS: {formatDateTime(beforeDate)}
                </strong>
                <a
                  href={hdBeforeUrl}
                  download="before_satellite_hd.png"
                  className="button secondary"
                  style={{ padding: "3px 8px", fontSize: 10.5, textDecoration: "none", color: "inherit" }}
                >
                  <Download size={11} /> Save Image
                </a>
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
                <img
                  src={hdBeforeUrl}
                  alt="Before HD"
                  style={{
                    maxWidth: `${hdZoom * 100}%`,
                    maxHeight: "80vh",
                    objectFit: "contain",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    imageRendering: "-webkit-optimize-contrast",
                    transition: "transform 0.2s ease",
                  }}
                />
              </div>
            </div>

            {/* After Full Image */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "var(--bg-1)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                height: "100%",
                overflow: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "var(--good)", fontSize: 13 }}>
                  INSPECTION PASS: {formatDateTime(afterDate)}
                </strong>
                <a
                  href={hdAfterUrl}
                  download="after_satellite_hd.png"
                  className="button secondary"
                  style={{ padding: "3px 8px", fontSize: 10.5, textDecoration: "none", color: "inherit" }}
                >
                  <Download size={11} /> Save Image
                </a>
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
                <img
                  src={hdAfterUrl}
                  alt="After HD"
                  style={{
                    maxWidth: `${hdZoom * 100}%`,
                    maxHeight: "80vh",
                    objectFit: "contain",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    imageRendering: "-webkit-optimize-contrast",
                    transition: "transform 0.2s ease",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
