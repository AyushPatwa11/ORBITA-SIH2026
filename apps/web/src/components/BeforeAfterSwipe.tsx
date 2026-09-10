import { Calendar, Clock, Columns2, Sliders } from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  beforeUrl: string | null;
  afterUrl: string | null;
  beforeLabel?: string;
  afterLabel?: string;
  beforeDate?: string | null;
  afterDate?: string | null;
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

export function BeforeAfterSwipe({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  beforeDate,
  afterDate,
}: Props) {
  const [split, setSplit] = useState(50);
  const [viewMode, setViewMode] = useState<"swipe" | "split">("swipe");
  const frameRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  if (!beforeUrl || !afterUrl) {
    return (
      <div className="empty-state-box" style={{ padding: 16 }}>
        <div className="empty-state-desc">
          Select a change event to load before & after satellite images.
        </div>
      </div>
    );
  }

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
          <span className="pill pill-sensor">BASE PASS</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--good)" }}>
            <Calendar size={12} />
            <strong>AFTER:</strong> {formatDateTime(afterDate)}
          </div>
          <span className="pill pill-true">LATEST PASS</span>
        </div>

        {timeDiff && (
          <div style={{ fontSize: 10.5, color: "var(--text-low)", fontFamily: "var(--mono)", borderTop: "1px solid var(--border)", paddingTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <Clock size={11} /> Time Span: {timeDiff}
          </div>
        )}
      </div>

      {/* Mode Switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-low)", fontFamily: "var(--mono)" }}>
          {viewMode === "swipe" ? `SLIDER: ${split}% / ${100 - split}%` : "SIDE-BY-SIDE VIEW"}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
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
            <Columns2 size={11} /> Dual View
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
            <img src={beforeUrl} alt={beforeLabel ?? "Before image"} className="swipe-img" />

            {/* After image clipped */}
            <div className="swipe-clip" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <img src={afterUrl} alt={afterLabel ?? "After image"} className="swipe-img" />
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
            <img src={beforeUrl} alt="Before" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
            <div className="swipe-tag swipe-tag-left" style={{ bottom: 6, left: 6, fontSize: 9.5 }}>
              BEFORE: {formatDateTime(beforeDate).split(",")[0]}
            </div>
          </div>
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            <img src={afterUrl} alt="After" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
            <div className="swipe-tag swipe-tag-right" style={{ bottom: 6, right: 6, fontSize: 9.5 }}>
              AFTER: {formatDateTime(afterDate).split(",")[0]}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
