import type { TimelinePoint } from "../types";

const STATUS_COLOR: Record<TimelinePoint["observation_status"], string> = {
  NONE: "#2c3444",
  POSSIBLE: "#e0a53f",
  CONFIRMED: "#3fbf7f",
  EXCLUDED: "#454e60",
};

interface Props {
  points: TimelinePoint[];
}

export function TimelineView({ points }: Props) {
  if (points.length === 0) {
    return <div className="empty-state">No timeline analysis yet. Run "Analyze Timeline" first.</div>;
  }

  return (
    <div>
      <div className="timeline">
        {points.map((p) => {
          const heightPct = p.change_probability != null ? Math.max(8, p.change_probability * 100) : 8;
          return (
            <div
              key={p.scene_id}
              className="timeline-point"
              title={`${new Date(p.timestamp).toLocaleDateString()} — ${p.observation_status}${
                p.change_probability != null ? ` (${(p.change_probability * 100).toFixed(0)}%)` : ""
              }`}
              style={{
                height: `${heightPct}%`,
                background: STATUS_COLOR[p.observation_status],
              }}
            />
          );
        })}
      </div>
      <div className="card-meta" style={{ justifyContent: "space-between" }}>
        <span>{new Date(points[0].timestamp).toLocaleDateString()}</span>
        <span>{new Date(points[points.length - 1].timestamp).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
