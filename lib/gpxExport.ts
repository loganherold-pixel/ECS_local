/**
 * GPX Export Utility
 *
 * Generates valid GPX 1.1 XML from an ImportedRoute object.
 *
 * Output includes:
 *   - <metadata> with route name, description, and export timestamp
 *   - <wpt> elements for each waypoint with:
 *       - lat/lon attributes
 *       - <ele> elevation (meters)
 *       - <name> waypoint name
 *       - <time> timestamp
 *       - <extensions> with waypoint type classification
 *       - <sym> symbol hint based on waypoint type
 *       - <type> element with waypoint type label
 *   - <trk>/<trkseg>/<trkpt> elements for all route segments
 *       - Each <trkpt> includes lat, lon, and optional <ele>
 *
 * Conforms to GPX 1.1 schema: http://www.topografix.com/GPX/1/1
 */

import type { ImportedRoute, RouteWaypoint, RouteSegment } from './routeStore';
import { getWaypointTypeConfig, type RouteWaypointType } from './waypointTypes';

// ── XML Helpers ─────────────────────────────────────────

/** Escape special XML characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Map waypoint type to a GPX <sym> symbol name (Garmin-compatible) */
function getSymbolForType(type: RouteWaypointType | null | undefined): string | null {
  if (!type) return null;
  const symbolMap: Record<RouteWaypointType, string> = {
    camp: 'Campground',
    water: 'Drinking Water',
    fuel: 'Gas Station',
    hazard: 'Danger Area',
    viewpoint: 'Scenic Area',
    trailhead: 'Trail Head',
    junction: 'Crossing',
  };
  return symbolMap[type] || null;
}

// ── GPX Generation ──────────────────────────────────────

/**
 * Generate a complete GPX 1.1 XML string from an ImportedRoute.
 *
 * @param route - The route to export
 * @param options - Optional export configuration
 * @returns Valid GPX 1.1 XML string
 */
export function generateGPX(
  route: ImportedRoute,
  options?: {
    /** Include route track segments (default: true) */
    includeTrack?: boolean;
    /** Include waypoints (default: true) */
    includeWaypoints?: boolean;
    /** Creator application name */
    creator?: string;
    /** Additional description text */
    description?: string;
  }
): string {
  const {
    includeTrack = true,
    includeWaypoints = true,
    creator = 'Expedition Command System',
    description,
  } = options || {};

  const lines: string[] = [];
  const now = new Date().toISOString();
  const routeDesc = description || route.description || '';

  // ── XML Declaration & GPX Root ────────────────────────
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx xmlns="http://www.topografix.com/GPX/1/1"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:ecs="http://expeditioncommand.app/gpx/extensions/1"' +
    ` creator="${escapeXml(creator)}"` +
    ' version="1.1"' +
    ' xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
  );

  // ── Metadata ──────────────────────────────────────────
  lines.push('  <metadata>');
  lines.push(`    <name>${escapeXml(route.name)}</name>`);
  if (routeDesc) {
    lines.push(`    <desc>${escapeXml(routeDesc)}</desc>`);
  }
  lines.push('    <author>');
  lines.push(`      <name>${escapeXml(creator)}</name>`);
  lines.push('    </author>');
  lines.push(`    <time>${now}</time>`);
  lines.push('    <keywords>expedition,overland,route</keywords>');

  // Bounds
  if (route.segments.length > 0 || route.waypoints.length > 0) {
    const bounds = computeBounds(route);
    if (bounds) {
      lines.push(
        `    <bounds minlat="${bounds.minLat}" minlon="${bounds.minLon}"` +
        ` maxlat="${bounds.maxLat}" maxlon="${bounds.maxLon}"/>`
      );
    }
  }

  lines.push('  </metadata>');

  // ── Waypoints ─────────────────────────────────────────
  if (includeWaypoints && route.waypoints.length > 0) {
    for (let i = 0; i < route.waypoints.length; i++) {
      const wp = route.waypoints[i];
      lines.push(...generateWaypointXml(wp, i));
    }
  }

  // ── Track Segments ────────────────────────────────────
  if (includeTrack && route.segments.length > 0) {
    lines.push(`  <trk>`);
    lines.push(`    <name>${escapeXml(route.name)}</name>`);
    if (routeDesc) {
      lines.push(`    <desc>${escapeXml(routeDesc)}</desc>`);
    }
    lines.push(`    <number>1</number>`);

    // Track-level extensions with route metadata
    lines.push('    <extensions>');
    lines.push(`      <ecs:totalDistanceMiles>${route.total_distance_miles}</ecs:totalDistanceMiles>`);
    if (route.elevation_gain_ft != null) {
      lines.push(`      <ecs:elevationGainFt>${route.elevation_gain_ft}</ecs:elevationGainFt>`);
    }
    lines.push(`      <ecs:sourceFormat>${route.source_format}</ecs:sourceFormat>`);
    if (route.source_app) {
      lines.push(`      <ecs:sourceApp>${escapeXml(route.source_app)}</ecs:sourceApp>`);
    }
    lines.push(`      <ecs:segmentCount>${route.segment_count}</ecs:segmentCount>`);
    lines.push(`      <ecs:waypointCount>${route.waypoint_count}</ecs:waypointCount>`);
    lines.push(`      <ecs:exportedAt>${now}</ecs:exportedAt>`);
    lines.push('    </extensions>');

    for (let s = 0; s < route.segments.length; s++) {
      const seg = route.segments[s];
      lines.push('    <trkseg>');

      for (const pt of seg.points) {
        const eleLine = pt.ele != null ? `\n        <ele>${pt.ele.toFixed(1)}</ele>` : '';
        lines.push(
          `      <trkpt lat="${pt.lat.toFixed(8)}" lon="${pt.lon.toFixed(8)}">${eleLine}` +
          '\n      </trkpt>'
        );
      }

      lines.push('    </trkseg>');
    }

    lines.push('  </trk>');
  }

  lines.push('</gpx>');

  return lines.join('\n');
}

/**
 * Generate XML lines for a single <wpt> element.
 */
function generateWaypointXml(wp: RouteWaypoint, index: number): string[] {
  const lines: string[] = [];
  const typeConfig = wp.waypointType ? getWaypointTypeConfig(wp.waypointType) : null;
  const symbol = getSymbolForType(wp.waypointType);

  lines.push(`  <wpt lat="${wp.lat.toFixed(8)}" lon="${wp.lon.toFixed(8)}">`);

  // Elevation
  if (wp.ele != null) {
    lines.push(`    <ele>${wp.ele.toFixed(1)}</ele>`);
  }

  // Timestamp
  if (wp.time) {
    lines.push(`    <time>${escapeXml(wp.time)}</time>`);
  }

  // Name
  if (wp.name) {
    lines.push(`    <name>${escapeXml(wp.name)}</name>`);
  } else {
    // Generate a default name from type or index
    const defaultName = typeConfig
      ? `${typeConfig.label} ${index + 1}`
      : `Waypoint ${index + 1}`;
    lines.push(`    <name>${escapeXml(defaultName)}</name>`);
  }

  // Description with type info
  if (typeConfig) {
    lines.push(`    <desc>${escapeXml(typeConfig.description)}</desc>`);
  }

  // Symbol (Garmin-compatible)
  if (symbol) {
    lines.push(`    <sym>${escapeXml(symbol)}</sym>`);
  }

  // Type element (GPX standard)
  if (typeConfig) {
    lines.push(`    <type>${escapeXml(typeConfig.label)}</type>`);
  }

  // Extensions — waypoint type classification
  if (wp.waypointType || typeConfig) {
    lines.push('    <extensions>');
    if (wp.waypointType) {
      lines.push(`      <ecs:waypointType>${wp.waypointType}</ecs:waypointType>`);
    }
    if (typeConfig) {
      lines.push(`      <ecs:waypointTypeLabel>${escapeXml(typeConfig.label)}</ecs:waypointTypeLabel>`);
      lines.push(`      <ecs:waypointTypeColor>${typeConfig.color}</ecs:waypointTypeColor>`);
      lines.push(`      <ecs:waypointTypeIcon>${typeConfig.icon}</ecs:waypointTypeIcon>`);
    }
    lines.push(`      <ecs:waypointIndex>${index}</ecs:waypointIndex>`);
    lines.push('    </extensions>');
  }

  lines.push('  </wpt>');

  return lines;
}

/**
 * Compute bounding box for the route.
 */
function computeBounds(route: ImportedRoute): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let hasPoints = false;

  for (const wp of route.waypoints) {
    minLat = Math.min(minLat, wp.lat);
    maxLat = Math.max(maxLat, wp.lat);
    minLon = Math.min(minLon, wp.lon);
    maxLon = Math.max(maxLon, wp.lon);
    hasPoints = true;
  }

  for (const seg of route.segments) {
    for (const pt of seg.points) {
      minLat = Math.min(minLat, pt.lat);
      maxLat = Math.max(maxLat, pt.lat);
      minLon = Math.min(minLon, pt.lon);
      maxLon = Math.max(maxLon, pt.lon);
      hasPoints = true;
    }
  }

  if (!hasPoints) return null;

  return {
    minLat: parseFloat(minLat.toFixed(8)),
    maxLat: parseFloat(maxLat.toFixed(8)),
    minLon: parseFloat(minLon.toFixed(8)),
    maxLon: parseFloat(maxLon.toFixed(8)),
  };
}

/**
 * Generate a safe filename for the GPX export.
 */
export function generateGPXFilename(route: ImportedRoute): string {
  const safeName = route.name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  const dateStr = new Date().toISOString().split('T')[0];
  return `${safeName}_${dateStr}.gpx`;
}

/**
 * Get a human-readable summary of what will be exported.
 */
export function getExportSummary(route: ImportedRoute): {
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

