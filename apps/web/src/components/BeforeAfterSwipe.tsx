import { useState } from "react";

interface Props {
  beforeUrl: string | null;
  afterUrl: string | null;
  beforeLabel?: string;
  afterLabel?: string;
}

export function BeforeAfterSwipe({ beforeUrl, afterUrl, beforeLabel, afterLabel }: Props) {
  const [split, setSplit] = useState(50);

  if (!beforeUrl || !afterUrl) {
    return (
      <div className="empty-state">
        Select a change event with downloaded scenes to see before/after imagery.
      </div>
    );
  }

  return (
    <div>
      <div className="swipe-frame">
        <img src={beforeUrl} alt={beforeLabel ?? "before"} className="swipe-img" />
        <div className="swipe-clip" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <img src={afterUrl} alt={afterLabel ?? "after"} className="swipe-img" />
        </div>
        <div className="swipe-handle" style={{ left: `${split}%` }} />
        <div className="swipe-tag swipe-tag-left">{beforeLabel ?? "before"}</div>
        <div className="swipe-tag swipe-tag-right">{afterLabel ?? "after"}</div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        style={{ marginTop: 8 }}
      />
    </div>
  );
}
