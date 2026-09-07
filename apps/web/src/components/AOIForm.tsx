import { useState } from "react";
import type { GeoJSONPolygon } from "../types";

interface Props {
  polygon: GeoJSONPolygon;
  onSubmit: (data: {
    name: string;
    geojson_polygon: GeoJSONPolygon;
    max_cloud_cover: number;
    monitoring_enabled: boolean;
  }) => void;
  onCancel: () => void;
}

export function AOIForm({ polygon, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [maxCloudCover, setMaxCloudCover] = useState(20);
  const [monitoring, setMonitoring] = useState(false);

  return (
    <div className="card" style={{ cursor: "default" }}>
      <div className="card-title">New AOI</div>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sector 7 river bend" />
      <label>Max cloud cover (%)</label>
      <input
        type="number"
        value={maxCloudCover}
        min={0}
        max={100}
        onChange={(e) => setMaxCloudCover(Number(e.target.value))}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={monitoring}
          onChange={(e) => setMonitoring(e.target.checked)}
        />
        Enable continuous monitoring
      </label>
      <div className="form-row" style={{ marginTop: 12 }}>
        <button
          className="primary"
          disabled={!name}
          onClick={() =>
            onSubmit({
              name,
              geojson_polygon: polygon,
              max_cloud_cover: maxCloudCover,
              monitoring_enabled: monitoring,
            })
          }
        >
          Create AOI
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
