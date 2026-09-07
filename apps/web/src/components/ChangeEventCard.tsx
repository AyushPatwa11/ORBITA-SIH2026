import type { ChangeEvent } from "../types";

const PILL_CLASS: Record<string, string> = {
  LIKELY_TRUE_CHANGE: "pill-true",
  POSSIBLE_CHANGE: "pill-possible",
  LIKELY_FALSE_CHANGE: "pill-false",
  INSUFFICIENT_EVIDENCE: "pill-insufficient",
};

const PILL_LABEL: Record<string, string> = {
  LIKELY_TRUE_CHANGE: "likely true change",
  POSSIBLE_CHANGE: "possible change",
  LIKELY_FALSE_CHANGE: "likely false alarm",
  INSUFFICIENT_EVIDENCE: "insufficient evidence",
};

interface Props {
  event: ChangeEvent;
  selected: boolean;
  onSelect: () => void;
}

export function ChangeEventCard({ event, selected, onSelect }: Props) {
  return (
    <div className={`card${selected ? " selected" : ""}`} onClick={onSelect}>
      <div className="card-title">
        {event.change_type} · {(event.confidence * 100).toFixed(0)}% confidence
      </div>
      <div className="card-meta">
        <span className={`pill ${PILL_CLASS[event.evidence_category]}`}>
          {PILL_LABEL[event.evidence_category]}
        </span>
        <span>quality {(event.quality_score * 100).toFixed(0)}%</span>
        <span>{event.analyst_status.toLowerCase()}</span>
      </div>
      {event.earliest_supported_date && (
        <div className="card-meta">
          earliest supported: {new Date(event.earliest_supported_date).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
