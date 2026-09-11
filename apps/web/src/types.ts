export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface AOI {
  id: string;
  name: string;
  max_cloud_cover: number;
  monitoring_enabled: boolean;
  created_at: string;
  geometry: GeoJSONPolygon | null;
}

export interface Scene {
  id: string;
  product_id: string;
  sensor: string;
  acquisition_time: string;
  cloud_cover: number | null;
  ingestion_state: string;
  source: string;
}

export interface DownloadTriggerResult {
  scene_id: string;
  ingestion_state: string;
  quality_status: string | null;
  quality_score: number | null;
}

export interface IngestionTriggerResult {
  job_id: string;
  aoi_id: string;
  status: string;
  scenes_found: number;
}

export type EvidenceCategory =
  | "LIKELY_TRUE_CHANGE"
  | "POSSIBLE_CHANGE"
  | "LIKELY_FALSE_CHANGE"
  | "INSUFFICIENT_EVIDENCE";

export interface ChangeEvent {
  id: string;
  aoi_id: string;
  change_type: string;
  change_score: number;
  confidence: number;
  quality_score: number;
  analyst_status: string;
  evidence_category: EvidenceCategory;
  earliest_supported_date: string | null;
  model_version: string;
  source_scenes: string[];
  supporting_observations: { scene_id: string; role: "before" | "after" }[];
  created_at: string;
  geometry: GeoJSONPolygon | null;
}

export interface TimelinePoint {
  scene_id: string;
  timestamp: string;
  quality_status: string;
  change_probability: number | null;
  observation_status: "NONE" | "POSSIBLE" | "CONFIRMED" | "EXCLUDED";
}

export interface TimelineAnalysis {
  evidence_category: EvidenceCategory;
  earliest_supported_date: string | null;
  seasonal_pattern_detected: boolean;
  timeline: TimelinePoint[];
}

export interface DemoSeedResult {
  aoi_id: string;
  scene_ids: string[];
  scenes_created: number;
  scenes_rejected_low_quality: number;
  note: string;
}

export interface SearchFilters {
  query?: string;
  aoi_id?: string;
  evidence_category?: EvidenceCategory;
  min_confidence?: number;
  date_from?: string;
  date_to?: string;
}

export interface SimilarScene {
  scene_id: string;
  product_id: string;
  acquisition_time: string;
  similarity: number;
  weights_loaded: boolean;
}

export interface LocationPreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string;
  icon: string;
  description: string;
  typical_change: string;
  default_before: string;
  default_after: string;
}

export interface ChangeReportIndicator {
  name: string;
  before_mean: number;
  after_mean: number;
  delta: number;
  delta_pct: number;
  interpretation: string;
}

export interface ChangeReport {
  has_significant_change: boolean;
  change_category: string;
  change_summary: string;
  change_area_m2: number;
  change_area_pct: number;
  total_area_m2: number;
  heatmap_url?: string | null;
  confidence_explanation: string;
  indicators: ChangeReportIndicator[];
}

export interface PinAndFetchPayload {
  name?: string;
  latitude: number;
  longitude: number;
  time_preset?: string;
  before_datetime?: string;
  after_datetime?: string;
  change_type_hint?: string;
  analysis_radius_km?: number;
}

export interface AIAgentReport {
  headline: string;
  executive_summary: string;
  what_changed: string;
  where_changed: string;
  significance_scale: string;
  activity_type: string;
  confidence_level: string;
  confidence_score: number;
  altered_area_ha: number;
  altered_area_pct: number;
  empirical_evidence: string[];
  key_findings: string[];
  recommended_actions: string[];
}

export interface AIQueryResult {
  question: string;
  answer: string;
  headline: string;
  activity_type: string;
  confidence_level: string;
  confidence_score: number;
  key_findings: string[];
  recommended_actions: string[];
}

export interface PinAndFetchResult {
  aoi_id: string;
  name: string;
  latitude: number;
  longitude: number;
  analysis_radius_km?: number;
  before_scene: {
    id: string;
    product_id: string;
    acquisition_time: string;
    sensor: string;
    cloud_cover: number;
    preview_url: string;
  };
  after_scene: {
    id: string;
    product_id: string;
    acquisition_time: string;
    sensor: string;
    cloud_cover: number;
    preview_url: string;
  };
  time_span_days: number;
  change_report?: ChangeReport;
  ai_agent_report?: AIAgentReport;
  change_events: ChangeEvent[];
}

