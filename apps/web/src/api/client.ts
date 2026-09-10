import type {
  AOI,
  ChangeEvent,
  DemoSeedResult,
  DownloadTriggerResult,
  GeoJSONPolygon,
  IngestionTriggerResult,
  LocationPreset,
  PinAndFetchPayload,
  PinAndFetchResult,
  Scene,
  SearchFilters,
  SimilarScene,
  TimelineAnalysis,
} from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${body}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export const api = {
  listAOIs: () => request<AOI[]>("/aois"),

  createAOI: (payload: {
    name: string;
    geojson_polygon: GeoJSONPolygon;
    max_cloud_cover: number;
    monitoring_enabled: boolean;
  }) => request<AOI>("/aois", { method: "POST", body: JSON.stringify(payload) }),

  triggerIngestion: (aoiId: string) =>
    request<IngestionTriggerResult>(`/aois/${aoiId}/ingest`, { method: "POST" }),

  listScenes: (aoiId: string) => request<Scene[]>(`/aois/${aoiId}/scenes`),

  downloadScene: (sceneId: string) =>
    request<DownloadTriggerResult>(`/scenes/${sceneId}/download`, { method: "POST" }),

  detectChange: (payload: { aoi_id: string; before_scene_id: string; after_scene_id: string }) =>
    request<ChangeEvent[]>("/change-events/detect", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listChangeEvents: (aoiId?: string) =>
    request<ChangeEvent[]>(aoiId ? `/change-events?aoi_id=${aoiId}` : "/change-events"),

  reviewChangeEvent: (eventId: string, status: string, note?: string) =>
    request<ChangeEvent>(`/change-events/${eventId}/review`, {
      method: "POST",
      body: JSON.stringify({ status, note }),
    }),

  analyzeTimeline: (eventId: string) =>
    request<TimelineAnalysis>(`/change-events/${eventId}/analyze-timeline`, { method: "POST" }),

  getTimeline: (eventId: string) =>
    request<TimelineAnalysis["timeline"]>(`/change-events/${eventId}/timeline`),

  seedDemo: () => request<DemoSeedResult>("/demo/seed", { method: "POST" }),

  searchChangeEvents: (filters: SearchFilters) =>
    request<ChangeEvent[]>("/search/change-events", {
      method: "POST",
      body: JSON.stringify(filters),
    }),

  scenePreviewUrl: (sceneId: string) => `${BASE}/scenes/${sceneId}/preview.png`,

  semanticSearch: (query: string, k: number, aoiId?: string) =>
    request<SimilarScene[]>("/search/semantic", {
      method: "POST",
      body: JSON.stringify({ query, k, aoi_id: aoiId || undefined }),
    }),

  findSimilarScenes: (sceneId: string, k = 6) =>
    request<SimilarScene[]>(`/scenes/${sceneId}/similar?k=${k}`, { method: "POST" }),

  indexScene: (sceneId: string) =>
    request<{ scene_id: string; weights_loaded: boolean; embedding_dim: number }>(
      `/scenes/${sceneId}/index`,
      { method: "POST" }
    ),

  getPresetLocations: () => request<LocationPreset[]>("/location/presets"),

  geocodeAddress: (query: string) =>
    request<Array<{ display_name: string; latitude: number; longitude: number; type: string }>>(
      `/location/geocode?q=${encodeURIComponent(query)}`
    ),

  pinAndFetchLocation: (payload: PinAndFetchPayload) =>
    request<PinAndFetchResult>("/location/pin-and-fetch", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  changeHeatmapUrl: (aoiId: string) => `${BASE}/location/change-heatmap/${aoiId}`,
};
