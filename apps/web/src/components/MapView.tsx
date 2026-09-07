import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useOfflineMode } from "../App";
import type { AOI, ChangeEvent, GeoJSONPolygon } from "../types";

// Live mode: CartoDB's free dark basemap (external — disable before an
// air-gapped/offline evaluation run). Offline mode: no external tiles at
// all — a flat background + graticule so geometry is still legible.
const LIVE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const OFFLINE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b0e13" } }],
};

interface Props {
  aois: AOI[];
  changeEvents: ChangeEvent[];
  drawingEnabled: boolean;
  onBBoxDrawn: (polygon: GeoJSONPolygon) => void;
}

export function MapView({ aois, changeEvents, drawingEnabled, onBBoxDrawn }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawStateRef = useRef<{ first: [number, number] | null }>({ first: null });
  const offlineMode = useOfflineMode();

  // init map once we know whether we're offline — never risk mounting
  // against the live CDN basemap before that's confirmed
  useEffect(() => {
    if (!containerRef.current || offlineMode === null) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: offlineMode ? OFFLINE_STYLE : LIVE_STYLE,
      center: [78.9629, 22.5937], // India-centered default
      zoom: 4,
    });
    map.addControl(new maplibregl.NavigationControl({}), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [offlineMode === null]);

  // click-to-draw bbox handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!drawingEnabled) return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (!drawStateRef.current.first) {
        drawStateRef.current.first = lngLat;
        return;
      }

      const [x1, y1] = drawStateRef.current.first;
      const [x2, y2] = lngLat;
      const polygon: GeoJSONPolygon = {
        type: "Polygon",
        coordinates: [
          [
            [Math.min(x1, x2), Math.min(y1, y2)],
            [Math.max(x1, x2), Math.min(y1, y2)],
            [Math.max(x1, x2), Math.max(y1, y2)],
            [Math.min(x1, x2), Math.max(y1, y2)],
            [Math.min(x1, x2), Math.min(y1, y2)],
          ],
        ],
      };
      drawStateRef.current.first = null;
      onBBoxDrawn(polygon);
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [drawingEnabled, onBBoxDrawn]);

  // render AOI polygons — rebuilt whenever the list changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () => {
      const sourceId = "aois-source";
      const geojson: any = {
        type: "FeatureCollection",
        features: aois
          .filter((a) => (a as any).geometry)
          .map((a) => ({
            type: "Feature",
            geometry: (a as any).geometry,
            properties: { name: a.name },
          })),
      };

      const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
        return;
      }
      map.addSource(sourceId, { type: "geojson", data: geojson });
      map.addLayer({
        id: "aois-fill",
        type: "fill",
        source: sourceId,
        paint: { "fill-color": "#4da3ff", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "aois-outline",
        type: "line",
        source: sourceId,
        paint: { "line-color": "#4da3ff", "line-width": 1.5 },
      });
    };

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [aois]);

  // render change-event markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: maplibregl.Marker[] = [];

    for (const evt of changeEvents) {
      const geom = (evt as any).geometry;
      if (!geom) continue;
      const color =
        evt.evidence_category === "LIKELY_TRUE_CHANGE"
          ? "#3fbf7f"
          : evt.evidence_category === "POSSIBLE_CHANGE"
          ? "#e0a53f"
          : evt.evidence_category === "LIKELY_FALSE_CHANGE"
          ? "#e0563f"
          : "#6b7690";
      const [lng, lat] = geom.coordinates?.[0]?.[0] ?? [0, 0];
      const marker = new maplibregl.Marker({ color }).setLngLat([lng, lat]).addTo(map);
      markers.push(marker);
    }

    return () => markers.forEach((m) => m.remove());
  }, [changeEvents]);

  return (
    <div className="map-container">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {drawingEnabled && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            color: "var(--text-mid)",
          }}
        >
          Click two corners to draw an AOI bounding box
        </div>
      )}
    </div>
  );
}
