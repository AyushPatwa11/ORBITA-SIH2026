import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useOfflineMode } from "../App";
import type { AOI, ChangeEvent, GeoJSONPolygon } from "../types";

const LIVE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const OFFLINE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#06080e" } }],
};

interface Props {
  aois: AOI[];
  changeEvents: ChangeEvent[];
  drawingEnabled: boolean;
  onBBoxDrawn: (polygon: GeoJSONPolygon) => void;
  selectedAoi?: AOI | null;
  selectedEvent?: ChangeEvent | null;
  onSelectEvent?: (event: ChangeEvent) => void;
}

function getPolygonBounds(coordinates: number[][][]): [[number, number], [number, number]] | null {
  if (!coordinates || !coordinates.length || !coordinates[0].length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const ring of coordinates) {
    for (const [lng, lat] of ring) {
      if (typeof lng !== "number" || typeof lat !== "number") continue;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function MapView({
  aois,
  changeEvents,
  drawingEnabled,
  onBBoxDrawn,
  selectedAoi,
  selectedEvent,
  onSelectEvent,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawStateRef = useRef<{ first: [number, number] | null }>({ first: null });
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const offlineMode = useOfflineMode();

  const [coords, setCoords] = useState<{ lng: number; lat: number; zoom: number }>({
    lng: 82.95,
    lat: 22.57,
    zoom: 11,
  });

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || offlineMode === null) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: offlineMode ? OFFLINE_STYLE : LIVE_STYLE,
      center: [82.95, 22.57], // Centered around Korba demo area
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl({}), "top-right");

    map.on("mousemove", (e) => {
      setCoords({
        lng: Number(e.lngLat.lng.toFixed(4)),
        lat: Number(e.lngLat.lat.toFixed(4)),
        zoom: Number(map.getZoom().toFixed(1)),
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [offlineMode === null]);

  // Click-to-draw bbox handler
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

  // Render AOI polygons
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
            properties: {
              id: a.id,
              name: a.name,
              isSelected: selectedAoi?.id === a.id,
            },
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
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "isSelected"], true],
            "#00d2ff",
            "#0284c7",
          ],
          "fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: "aois-outline",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "isSelected"], true],
            "#00d2ff",
            "#38bdf8",
          ],
          "line-width": ["case", ["==", ["get", "isSelected"], true], 2.5, 1.5],
          "line-dasharray": [3, 2],
        },
      });
    };

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [aois, selectedAoi]);

  // Render Change Event Polygons & Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderEvents = () => {
      const sourceId = "change-events-source";
      const geojson: any = {
        type: "FeatureCollection",
        features: changeEvents
          .filter((e) => (e as any).geometry)
          .map((e) => ({
            type: "Feature",
            geometry: (e as any).geometry,
            properties: {
              id: e.id,
              change_type: e.change_type,
              confidence: (e.confidence * 100).toFixed(0) + "%",
              category: e.evidence_category,
              isSelected: selectedEvent?.id === e.id,
            },
          })),
      };

      const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
        return;
      }

      map.addSource(sourceId, { type: "geojson", data: geojson });

      // Change polygon fill
      map.addLayer({
        id: "change-events-fill",
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "category"], "LIKELY_TRUE_CHANGE"],
            "#10b981",
            ["==", ["get", "category"], "POSSIBLE_CHANGE"],
            "#f59e0b",
            ["==", ["get", "category"], "LIKELY_FALSE_CHANGE"],
            "#f43f5e",
            "#00d2ff",
          ],
          "fill-opacity": 0.35,
        },
      });

      // Change polygon glow border
      map.addLayer({
        id: "change-events-line",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "isSelected"], true],
            "#ffffff",
            ["==", ["get", "category"], "LIKELY_TRUE_CHANGE"],
            "#10b981",
            ["==", ["get", "category"], "POSSIBLE_CHANGE"],
            "#f59e0b",
            "#f43f5e",
          ],
          "line-width": ["case", ["==", ["get", "isSelected"], true], 3, 2],
        },
      });

      // Click on change polygon to select
      map.on("click", "change-events-fill", (e) => {
        if (!e.features || !e.features.length) return;
        const clickedId = e.features[0].properties?.id;
        const match = changeEvents.find((evt) => evt.id === clickedId);
        if (match && onSelectEvent) {
          onSelectEvent(match);
        }
      });

      map.on("mouseenter", "change-events-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "change-events-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    };

    if (map.isStyleLoaded()) renderEvents();
    else map.once("load", renderEvents);
  }, [changeEvents, selectedEvent, onSelectEvent]);

  // Fly to selected AOI or initial AOIs
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedAoi && selectedAoi.geometry) {
      const bounds = getPolygonBounds(selectedAoi.geometry.coordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 1200 });
        return;
      }
    }

    if (selectedEvent && selectedEvent.geometry) {
      const bounds = getPolygonBounds(selectedEvent.geometry.coordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1200 });
        return;
      }
    }

    // Otherwise if we have AOIs but nothing selected, fit to first AOI
    if (aois.length > 0 && aois[0].geometry) {
      const bounds = getPolygonBounds(aois[0].geometry.coordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 800 });
      }
    }
  }, [selectedAoi, selectedEvent, aois]);

  return (
    <div className="map-container">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Drawing helper banner */}
      {drawingEnabled && (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            background: "rgba(16, 22, 35, 0.9)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--accent)",
            boxShadow: "0 0 16px var(--accent-glow)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            color: "var(--text-hi)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 10,
          }}
        >
          <span className="pulse-dot" />
          Click two diagonal points on the map to define the AOI bounding box
        </div>
      )}

      {/* Map Telemetry HUD bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(10, 14, 23, 0.8)",
          backdropFilter: "blur(10px)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 10.5,
          fontFamily: "var(--mono)",
          color: "var(--text-low)",
          display: "flex",
          gap: 12,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <span>LAT: {coords.lat}° N</span>
        <span>LNG: {coords.lng}° E</span>
        <span>ZOOM: {coords.zoom}x</span>
        <span>CRS: EPSG:4326</span>
      </div>
    </div>
  );
}
