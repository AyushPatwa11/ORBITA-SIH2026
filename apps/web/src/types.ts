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
