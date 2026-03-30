/**
 * GeoJSON Export Utility
 *
 * Generates a valid RFC 7946 GeoJSON FeatureCollection from an ImportedRoute.
 *
 * Output includes:
 *   - Point features for each waypoint with:
 *       - [lon, lat, ele?] coordinates
 *       - name, description, and waypoint type as properties
 *       - simplestyle-spec marker-color / marker-symbol hints
 *       - ECS extension properties (ecs:waypointType, ecs:waypointIndex)
 *   - LineString features for each route segment with:
 *       - [lon, lat, ele?] coordinate arrays
 *       - Segment index and point count as properties
 *       - simplestyle-spec stroke / stroke-width hints
 *   - Top-level ECS metadata (expedition name, export timestamp, stats)
 *
 * Conforms to RFC 7946: https://datatracker.ietf.org/doc/html/rfc7946
 */

import type { ImportedRoute, RouteWaypoint, RouteSegment } from './routeStore';
import { getWaypointTypeConfig, type RouteWaypointType } from './waypointTypes';

// ── Waypoint Type → simplestyle-spec Color ──────────────────

/** Map waypoint type to a marker-color (simplestyle-spec hex) */
function getMarkerColorForType(type: RouteWaypointType | null | undefined): string {
  if (!type) return '#66BB6A'; // default green
  const config = getWaypointTypeConfig(type);
  return config?.color || '#66BB6A';
}

/** Map waypoint type to a Maki symbol name (Mapbox-compatible) */
function getMarkerSymbolForType(type: RouteWaypointType | null | undefined): string | null {
  if (!type) return null;
  const symbolMap: Record<RouteWaypointType, string> = {
    camp: 'campsite',
    water: 'drinking-water',
    fuel: 'fuel',
    hazard: 'danger',
    viewpoint: 'viewpoint',
    trailhead: 'trailhead',
    junction: 'intersection',
  };
  return symbolMap[type] || null;
}

// ── GeoJSON Feature Builders ────────────────────────────────

interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: Record<string, any>;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
  [key: string]: any; // Allow ECS extension properties
}

/**
 * Build a GeoJSON Point feature from a RouteWaypoint.
 */
function buildWaypointFeature(wp: RouteWaypoint, index: number): GeoJsonFeature {
  const typeConfig = wp.waypointType ? getWaypointTypeConfig(wp.waypointType) : null;
  const markerColor = getMarkerColorForType(wp.waypointType);
  const markerSymbol = getMarkerSymbolForType(wp.waypointType);

  // Coordinates: [lon, lat] or [lon, lat, ele] per RFC 7946
  const coordinates: number[] = [wp.lon, wp.lat];
  if (wp.ele != null) {
    coordinates.push(wp.ele);
  }

  const properties: Record<string, any> = {};

  // Standard properties
  if (wp.name) {
    properties.name = wp.name;
  } else {
    // Generate a default name from type or index
    properties.name = typeConfig
      ? `${typeConfig.label} ${index + 1}`
      : `Waypoint ${index + 1}`;
  }

  if (typeConfig) {
    properties.description = typeConfig.description;
  }

  if (wp.time) {
    properties.time = wp.time;
  }

  // simplestyle-spec properties (for Mapbox, geojson.io, GitHub rendering)
  properties['marker-color'] = markerColor;
  properties['marker-size'] = 'medium';
  if (markerSymbol) {
    properties['marker-symbol'] = markerSymbol;
  }

  // Waypoint type classification
  if (wp.waypointType) {
    properties.type = typeConfig?.label || wp.waypointType;
  }

  // ECS extension properties
  properties['ecs:waypointIndex'] = index;
  if (wp.waypointType) {
    properties['ecs:waypointType'] = wp.waypointType;
    if (typeConfig) {
      properties['ecs:waypointTypeLabel'] = typeConfig.label;
      properties['ecs:waypointTypeColor'] = typeConfig.color;
      properties['ecs:waypointTypeIcon'] = typeConfig.icon;
    }
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates,
    },
    properties,
  };
}

/**
 * Build a GeoJSON LineString feature from a RouteSegment.
 */
function buildSegmentFeature(
  segment: RouteSegment,
  segmentIndex: number,
  routeName: string,
): GeoJsonFeature {
  // Convert points to [lon, lat, ele?] coordinate arrays
  const coordinates: number[][] = segment.points.map(pt => {
    const coord: number[] = [pt.lon, pt.lat];
    if (pt.ele != null) {
      coord.push(pt.ele);
    }
    return coord;
  });

  const properties: Record<string, any> = {
    name: `${routeName} — Segment ${segmentIndex + 1}`,

    // simplestyle-spec stroke properties
    stroke: '#C48A2C',          // ECS amber
    'stroke-width': 3,
    'stroke-opacity': 0.9,

    // Segment metadata
    'ecs:segmentIndex': segmentIndex,
    'ecs:pointCount': segment.points.length,
    'ecs:featureSource': 'trackSegment',
  };

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties,
  };
}

// ── Bounding Box ────────────────────────────────────────────

function computeBbox(route: ImportedRoute): [number, number, number, number] | null {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let hasPoints = false;

  for (const wp of route.waypoints) {
    minLon = Math.min(minLon, wp.lon);
    maxLon = Math.max(maxLon, wp.lon);
    minLat = Math.min(minLat, wp.lat);
    maxLat = Math.max(maxLat, wp.lat);
    hasPoints = true;
  }

  for (const seg of route.segments) {
    for (const pt of seg.points) {
      minLon = Math.min(minLon, pt.lon);
      maxLon = Math.max(maxLon, pt.lon);
      minLat = Math.min(minLat, pt.lat);
      maxLat = Math.max(maxLat, pt.lat);
      hasPoints = true;
    }
  }

  if (!hasPoints) return null;

  // RFC 7946 bbox: [west, south, east, north]
  return [
    parseFloat(minLon.toFixed(8)),
    parseFloat(minLat.toFixed(8)),
    parseFloat(maxLon.toFixed(8)),
    parseFloat(maxLat.toFixed(8)),
  ];
}

// ── Main Export Function ────────────────────────────────────

/**
 * Generate a complete RFC 7946 GeoJSON FeatureCollection from an ImportedRoute.
 *
 * @param route - The route to export
 * @param options - Optional export configuration
 * @returns Valid GeoJSON string (pretty-printed with 2-space indent)
 */
export function generateGeoJSON(
  route: ImportedRoute,
  options?: {
    /** Include route track segments as LineString features (default: true) */
    includeTrack?: boolean;
    /** Include waypoints as Point features (default: true) */
    includeWaypoints?: boolean;
    /** Creator application name */
    creator?: string;
    /** Additional description text */
    description?: string;
    /** Pretty-print with indentation (default: true) */
    prettyPrint?: boolean;
  }
): string {
  const {
    includeTrack = true,
    includeWaypoints = true,
    creator = 'Expedition Command System',
    description,
    prettyPrint = true,
  } = options || {};

  const now = new Date().toISOString();
  const routeDesc = description || route.description || null;
  const features: GeoJsonFeature[] = [];

  // ── Waypoint Point features ───────────────────────────
  if (includeWaypoints && route.waypoints.length > 0) {
    for (let i = 0; i < route.waypoints.length; i++) {
      features.push(buildWaypointFeature(route.waypoints[i], i));
    }
  }

  // ── Segment LineString features ───────────────────────
  if (includeTrack && route.segments.length > 0) {
    for (let s = 0; s < route.segments.length; s++) {
      // Only include segments that have at least 2 points (valid LineString)
      if (route.segments[s].points.length >= 2) {
        features.push(buildSegmentFeature(route.segments[s], s, route.name));
      }
    }
  }

  // ── Build FeatureCollection ───────────────────────────
  const featureCollection: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  // ── Bounding box (RFC 7946 §5) ────────────────────────
  const bbox = computeBbox(route);
  if (bbox) {
    featureCollection.bbox = bbox;
  }

  // ── Top-level metadata (foreign members per RFC 7946 §6.1) ──
  featureCollection.name = route.name;
  if (routeDesc) {
    featureCollection.description = routeDesc;
  }

  // ECS export metadata
  featureCollection['ecs:exportMeta'] = {
    generator: creator,
    exportedAt: now,
    sourceFormat: route.source_format,
    sourceApp: route.source_app,
    totalDistanceMiles: route.total_distance_miles,
    elevationGainFt: route.elevation_gain_ft,
    segmentCount: route.segment_count,
    waypointCount: route.waypoint_count,
    routeId: route.id,
  };

  // ECS expedition metadata (if available)
  if (route.name) {
    featureCollection['ecs:expedition'] = {
      title: route.name,
      notes: routeDesc,
    };
  }

  return prettyPrint
    ? JSON.stringify(featureCollection, null, 2)
    : JSON.stringify(featureCollection);
}

/**
 * Generate a safe filename for the GeoJSON export.
 */
export function generateGeoJSONFilename(route: ImportedRoute): string {
  const safeName = route.name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  const dateStr = new Date().toISOString().split('T')[0];
  return `${safeName}_${dateStr}.geojson`;
}

/**
 * Get a human-readable summary of what will be exported in GeoJSON format.
 * (Reuses the same summary shape as GPX export for UI consistency.)
 */
export function getGeoJSONExportSummary(route: ImportedRoute): {
  waypointCount: number;
  typedWaypointCount: number;
  segmentCount: number;
  totalTrackPoints: number;
  totalDistanceMiles: number;
  hasElevation: boolean;
  waypointTypeCounts: Record<string, number>;
} {
  let totalTrackPoints = 0;
  let hasElevation = false;

  for (const seg of route.segments) {
    totalTrackPoints += seg.points.length;
    if (!hasElevation) {
      hasElevation = seg.points.some(p => p.ele != null);
    }
  }

  const waypointTypeCounts: Record<string, number> = {};
  let typedWaypointCount = 0;

  for (const wp of route.waypoints) {
    if (wp.waypointType) {
      typedWaypointCount++;
      const config = getWaypointTypeConfig(wp.waypointType);
      const label = config?.label || wp.waypointType;
      waypointTypeCounts[label] = (waypointTypeCounts[label] || 0) + 1;
    }
  }

  if (!hasElevation) {
    hasElevation = route.waypoints.some(wp => wp.ele != null);
  }

  return {
    waypointCount: route.waypoints.length,
    typedWaypointCount,
    segmentCount: route.segments.length,
    totalTrackPoints,
    totalDistanceMiles: route.total_distance_miles,
    hasElevation,
    waypointTypeCounts,
  };
}

