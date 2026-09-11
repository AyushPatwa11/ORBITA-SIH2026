import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useOfflineMode } from "../App";
import type { AOI, ChangeEvent, GeoJSONPolygon } from "../types";
import { Box, Eye, EyeOff, Layers, Locate, Navigation2, Sparkles } from "lucide-react";

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
  pinMode?: boolean;
  pinnedCoord?: [number, number] | null;
  onMapPin?: (coord: [number, number]) => void;
  analysisRadiusKm?: number;
  userLocation?: [number, number] | null;
  heatmapUrl?: string | null;
  showHeatmapOverlay?: boolean;
  onToggleHeatmap?: () => void;
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
  pinMode,
  pinnedCoord,
  onMapPin,
  analysisRadiusKm = 1.5,
  userLocation,
  heatmapUrl,
  showHeatmapOverlay = false,
  onToggleHeatmap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawStartRef = useRef<[number, number] | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const drawCornerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const offlineMode = useOfflineMode();

  const [is3D, setIs3D] = useState(false);
  const [drawingActive, setDrawingActive] = useState(false);
  const [drawMetrics, setDrawMetrics] = useState<{ widthKm: number; heightKm: number; areaHa: number } | null>(null);

  const [coords, setCoords] = useState<{ lng: number; lat: number; zoom: number }>({
    lng: 78.96,
    lat: 20.59,
    zoom: 5,
  });

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || offlineMode === null) return;

    const initialCenter: [number, number] = userLocation
      ? userLocation
      : pinnedCoord
      ? pinnedCoord
      : [78.96, 20.59];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: offlineMode ? OFFLINE_STYLE : LIVE_STYLE,
      center: initialCenter,
      zoom: userLocation ? 13 : pinnedCoord ? 14 : 5,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

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

  // 3D Tilt & Oblique Camera View Toggle
  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next3D = !is3D;
    setIs3D(next3D);
    map.easeTo({
      pitch: next3D ? 60 : 0,
      bearing: next3D ? 30 : 0,
      duration: 1000,
    });
  };

  // Fly to user location button
  const handleFlyToUser = () => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    map.flyTo({ center: userLocation, zoom: 14, duration: 1200 });
  };

  // Blinking Live User Location Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLocation) {
      if (!userMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "user-location-marker-container";
        el.innerHTML = `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
            <div style="position:absolute;width:42px;height:42px;border-radius:50%;background:rgba(16,185,129,0.35);animation:pulseGreen 1.6s infinite ease-out;"></div>
            <div style="position:absolute;width:26px;height:26px;border-radius:50%;background:rgba(16,185,129,0.6);animation:pulseGreen 1.6s 0.4s infinite ease-out;"></div>
            <div style="position:relative;width:16px;height:16px;background:#10b981;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 12px #10b981;"></div>
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`
          <div style="padding:4px 6px;font-family:sans-serif;font-size:11px;color:#10b981;font-weight:700;">
            📍 Your Current Location
          </div>
        `);

        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat(userLocation)
          .setPopup(popup)
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat(userLocation);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  // Pinned Location Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pinnedCoord) {
      if (!pinMarkerRef.current) {
        const el = document.createElement("div");
        el.innerHTML = `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(0,210,255,0.3);animation:pulseGreen 1.5s infinite;"></div>
            <div style="width:28px;height:28px;background:#00d2ff;border:2px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 0 16px #00d2ff;color:#05070c;font-weight:bold;">
              🎯
            </div>
          </div>
        `;
        pinMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat(pinnedCoord)
          .addTo(map);
      } else {
        pinMarkerRef.current.setLngLat(pinnedCoord);
      }

      const r = analysisRadiusKm || 1.5;
      let zoomLevel = 15;
      if (r <= 0.4) zoomLevel = 16.5;
      else if (r <= 0.8) zoomLevel = 16;
      else if (r <= 1.5) zoomLevel = 15;
      else if (r <= 3.0) zoomLevel = 14;
      else zoomLevel = 13;

      map.flyTo({ center: pinnedCoord, zoom: zoomLevel, duration: 1200 });
    } else if (pinMarkerRef.current) {
      pinMarkerRef.current.remove();
      pinMarkerRef.current = null;
    }
  }, [pinnedCoord, analysisRadiusKm]);

  // Working Interactive Box Drawing Engine
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = "interactive-draw-source";
    const fillId = "interactive-draw-fill";
    const lineId = "interactive-draw-line";

    const setupDrawSource = () => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: fillId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": "#38bdf8",
            "fill-opacity": 0.22,
          },
        });

        map.addLayer({
          id: lineId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#38bdf8",
            "line-width": 2.5,
            "line-dasharray": [2, 2],
          },
        });
      }
    };

    if (map.isStyleLoaded()) setupDrawSource();
    else map.once("load", setupDrawSource);

    // Cursor update
    if (drawingEnabled) {
      map.getCanvas().style.cursor = "crosshair";
    } else if (onMapPin) {
      map.getCanvas().style.cursor = "pointer";
    } else {
      map.getCanvas().style.cursor = "";
    }

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!drawingEnabled || !drawStartRef.current) return;

      const [x1, y1] = drawStartRef.current;
      const x2 = e.lngLat.lng;
      const y2 = e.lngLat.lat;

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      // Calculate area metrics
      const deltaLat = (maxY - minY) * 111.0;
      const deltaLng = (maxX - minX) * (111.0 * Math.cos(((y1 + y2) / 2 * Math.PI) / 180.0));
      const areaM2 = deltaLat * 1000 * deltaLng * 1000;
      setDrawMetrics({
        widthKm: Math.round(deltaLng * 10) / 10,
        heightKm: Math.round(deltaLat * 10) / 10,
        areaHa: Math.round(areaM2 / 10000),
      });

      const data: any = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [minX, minY],
                  [maxX, minY],
                  [maxX, maxY],
                  [minX, maxY],
                  [minX, minY],
                ],
              ],
            },
          },
        ],
      };

      const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data);
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (drawingEnabled) {
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        // First corner click
        if (!drawStartRef.current) {
          drawStartRef.current = lngLat;
          setDrawingActive(true);

          // Add temporary corner pin marker
          const el = document.createElement("div");
          el.innerHTML = `
            <div style="width:14px;height:14px;background:#38bdf8;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 10px #38bdf8;"></div>
          `;
          drawCornerMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(lngLat)
            .addTo(map);
          return;
        }

        // Second corner click: complete bounding box
        const [x1, y1] = drawStartRef.current;
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

        // Reset draw state
        drawStartRef.current = null;
        setDrawingActive(false);
        setDrawMetrics(null);
        if (drawCornerMarkerRef.current) {
          drawCornerMarkerRef.current.remove();
          drawCornerMarkerRef.current = null;
        }

        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData({ type: "FeatureCollection", features: [] });

        onBBoxDrawn(polygon);
        return;
      }

      if (onMapPin) {
        onMapPin([e.lngLat.lng, e.lngLat.lat]);
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("click", handleClick);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("click", handleClick);
    };
  }, [drawingEnabled, onMapPin, onBBoxDrawn]);

  // Clean up draw markers if drawing is cancelled
  useEffect(() => {
    if (!drawingEnabled) {
      drawStartRef.current = null;
      setDrawingActive(false);
      setDrawMetrics(null);
      if (drawCornerMarkerRef.current) {
        drawCornerMarkerRef.current.remove();
        drawCornerMarkerRef.current = null;
      }
      const map = mapRef.current;
      if (map) {
        const src = map.getSource("interactive-draw-source") as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData({ type: "FeatureCollection", features: [] });
      }
    }
  }, [drawingEnabled]);

  // Render Detection Area Bounding Polygon around pinnedCoord
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = "detection-area-source";
    const fillId = "detection-area-fill";
    const lineId = "detection-area-line";

    const updateDetectionBox = () => {
      if (!pinnedCoord) {
        if (map.getSource(sourceId)) {
          if (map.getLayer(fillId)) map.removeLayer(fillId);
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          map.removeSource(sourceId);
        }
        return;
      }

      const [lng, lat] = pinnedCoord;
      const r = analysisRadiusKm || 1.5;
      const deltaLat = r / 111.0;
      const deltaLng = r / (111.0 * Math.max(0.1, Math.cos((lat * Math.PI) / 180.0)));
      const minLng = lng - deltaLng;
      const maxLng = lng + deltaLng;
      const minLat = lat - deltaLat;
      const maxLat = lat + deltaLat;

      const data: any = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [minLng, minLat],
                  [maxLng, minLat],
                  [maxLng, maxLat],
                  [minLng, maxLat],
                  [minLng, minLat],
                ],
              ],
            },
            properties: {
              radius_km: r,
            },
          },
        ],
      };

      const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(data);
        return;
      }

      map.addSource(sourceId, { type: "geojson", data });

      map.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#00d2ff",
          "fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#00d2ff",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
    };

    if (map.isStyleLoaded()) updateDetectionBox();
    else map.once("load", updateDetectionBox);
  }, [pinnedCoord, analysisRadiusKm]);

  // Render AOI Polygons
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderAois = () => {
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
          "fill-opacity": 0.14,
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

    if (map.isStyleLoaded()) renderAois();
    else map.once("load", renderAois);
  }, [aois, selectedAoi]);

  // Render Change Event Footprints with Category Color Coding
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
              confidence: Math.round(e.confidence * 100) + "%",
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
          "fill-opacity": 0.38,
        },
      });

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
          "line-width": ["case", ["==", ["get", "isSelected"], true], 3.5, 2],
        },
      });

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

  // Fit bounds when selected AOI or Event changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedEvent && selectedEvent.geometry) {
      const bounds = getPolygonBounds(selectedEvent.geometry.coordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
        return;
      }
    }

    if (selectedAoi && selectedAoi.geometry) {
      const bounds = getPolygonBounds(selectedAoi.geometry.coordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
        return;
      }
    }

    if (aois.length > 0 && aois[0].geometry && !pinnedCoord && !userLocation) {
      const bounds = getPolygonBounds(aois[0].geometry.coordinates);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 800 });
      }
    }
  }, [selectedAoi, selectedEvent, aois, pinnedCoord, userLocation]);

  return (
    <div className="map-container">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 3D & View Control Toolbar (Top-Left) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          gap: 6,
          zIndex: 20,
        }}
      >
        <button
          className={is3D ? "primary" : "secondary"}
          style={{ padding: "5px 10px", fontSize: 11, background: "rgba(5, 7, 12, 0.88)", backdropFilter: "blur(8px)" }}
          onClick={toggle3D}
          title="Toggle 3D Oblique Perspective Angle"
        >
          <Navigation2 size={12} style={{ transform: is3D ? "rotate(45deg)" : "none", transition: "transform 0.3s" }} />
          {is3D ? "3D Perspective" : "2D Top-Down"}
        </button>

        {userLocation && (
          <button
            className="secondary"
            style={{ padding: "5px 10px", fontSize: 11, background: "rgba(5, 7, 12, 0.88)", backdropFilter: "blur(8px)" }}
            onClick={handleFlyToUser}
            title="Recenter map at your current location"
          >
            <Locate size={12} color="#10b981" /> Current Location
          </button>
        )}

        {heatmapUrl && onToggleHeatmap && (
          <button
            className={showHeatmapOverlay ? "primary" : "secondary"}
            style={{ padding: "5px 10px", fontSize: 11, background: "rgba(5, 7, 12, 0.88)", backdropFilter: "blur(8px)" }}
            onClick={onToggleHeatmap}
            title="Toggle Ground Spectral Heatmap Overlay"
          >
            {showHeatmapOverlay ? <Eye size={12} /> : <EyeOff size={12} />}
            Heatmap Layer
          </button>
        )}
      </div>

      {/* Interactive Box Drawing Live Indicator */}
      {drawingEnabled && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(10, 14, 23, 0.94)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--accent)",
            boxShadow: "0 0 20px rgba(0, 210, 255, 0.35)",
            borderRadius: 24,
            padding: "8px 18px",
            fontSize: 11.5,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            gap: 10,
            zIndex: 25,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00d2ff", animation: "pulseGreen 1.2s infinite" }} />
          <span>
            {drawingActive
              ? "Drag to opposite diagonal corner and click to finalize boundary"
              : "Click first corner on map to begin drawing boundary box"}
          </span>
          {drawMetrics && (
            <span style={{ color: "var(--accent)", fontWeight: 700, fontFamily: "var(--mono)", borderLeft: "1px solid var(--border)", paddingLeft: 10 }}>
              {drawMetrics.widthKm} × {drawMetrics.heightKm} km ({drawMetrics.areaHa} ha)
            </span>
          )}
        </div>
      )}

      {/* Pin Mode Indicator Banner */}
      {pinMode && (
        <div
          style={{
            position: "absolute",
            top: 50,
            left: 12,
            background: "rgba(10, 14, 23, 0.92)",
            backdropFilter: "blur(10px)",
            border: "1px solid #00d2ff",
            boxShadow: "0 0 16px rgba(0, 210, 255, 0.3)",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 11,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 15,
          }}
        >
          <span className="pulse-dot" />
          <strong>Pin Mode Active:</strong> Click anywhere on the map to place surveillance target
        </div>
      )}

      {/* Map Telemetry HUD bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(10, 14, 23, 0.85)",
          backdropFilter: "blur(10px)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "5px 12px",
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
        <span>{is3D ? "3D PITCH: 60°" : "2D FLAT"}</span>
        <span>CRS: WGS84</span>
      </div>
    </div>
  );
}
