// ============================================================
// ECS EXPORT ENGINE — Expedition Data Export
// ============================================================
// Gathers expedition data (details, checklists, field logs,
// routes, waypoints) and exports as JSON, CSV, GPX, KML, or
// GeoJSON files. Uses expo-file-system for native file writing
// and blob downloads for web.
// ============================================================


import { Platform, Alert, Share } from 'react-native';
import { getDocumentDirectory, fsWriteString } from './fsCompat';

import {
  expeditionStore,
  checklistStore,
  fieldLogStore,
  routeCommandStore,
  waypointCommandStore,
} from './expeditionCommandStore';
import type {
  EcsExpedition,
  EcsChecklistItem,
  EcsFieldLog,
  EcsRoute,
  EcsWaypoint,
} from './expeditionTypes';
import {
  TERRAIN_OPTIONS,
  FIELD_LOG_TYPE_META,
  WAYPOINT_KIND_META,
  computeReadiness,
} from './expeditionTypes';

export type ExportFormat = 'json' | 'csv' | 'gpx' | 'kml' | 'geojson';



export interface ExportSections {
  expeditionDetails: boolean;
  checklists: boolean;
  fieldLogs: boolean;
  routes: boolean;
  waypoints: boolean;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
  recordCounts: {
    checklistItems: number;
    fieldLogs: number;
    routes: number;
    waypoints: number;
  };
}

// ── Data gathering ──────────────────────────────────────────
export interface ExpeditionExportData {
  exportMeta: {
    exportedAt: string;
    format: ExportFormat;
    appVersion: string;
    platform: string;
  };
  expedition: EcsExpedition | null;
  readiness: {
    score: number;
    breakdown: Record<string, number>;
    totalItems: number;
    completedItems: number;
    criticalIncomplete: number;
  } | null;
  checklists: EcsChecklistItem[];
  fieldLogs: EcsFieldLog[];
  routes: EcsRoute[];
  waypoints: EcsWaypoint[];
}

export async function gatherExportData(
  expeditionId: string,
  userId: string,
  sections: ExportSections,
): Promise<ExpeditionExportData> {
  const expedition = await expeditionStore.getById(expeditionId);

  let checklists: EcsChecklistItem[] = [];
  let fieldLogs: EcsFieldLog[] = [];
  let routes: EcsRoute[] = [];
  let waypoints: EcsWaypoint[] = [];

  const fetches: Promise<void>[] = [];

  if (sections.checklists) {
    fetches.push(
      checklistStore.list(expeditionId, userId).then(items => { checklists = items; }),
    );
  }
  if (sections.fieldLogs) {
    fetches.push(
      fieldLogStore.list(expeditionId, userId).then(logs => { fieldLogs = logs; }),
    );
  }
  if (sections.routes) {
    fetches.push(
      routeCommandStore.list(expeditionId, userId).then(rts => { routes = rts; }),
    );
  }
  if (sections.waypoints) {
    fetches.push(
      waypointCommandStore.list(expeditionId, userId).then(wps => { waypoints = wps; }),
    );
  }

  await Promise.all(fetches);

  // Compute readiness
  let readiness = null;
  if (sections.checklists && checklists.length > 0) {
    const { score, breakdown } = computeReadiness(checklists);
    readiness = {
      score,
      breakdown,
      totalItems: checklists.length,
      completedItems: checklists.filter(i => i.is_done).length,
      criticalIncomplete: checklists.filter(i => i.priority === 'critical' && !i.is_done).length,
    };
  }

  return {
    exportMeta: {
      exportedAt: new Date().toISOString(),
      format: 'json',
      appVersion: '1.0.0',
      platform: Platform.OS,
    },
    expedition: sections.expeditionDetails ? expedition : null,
    readiness,
    checklists,
    fieldLogs,
    routes,
    waypoints,
  };
}

// ── JSON formatter ──────────────────────────────────────────
export function formatAsJSON(data: ExpeditionExportData): string {
  // Clean up sensitive/internal fields
  const cleanData = {
    ...data,
    expedition: data.expedition ? {
      id: data.expedition.id,
      title: data.expedition.title,
      status: data.expedition.status,
      terrain: data.expedition.terrain,
      duration_days: data.expedition.duration_days,
      distance_from_services_mi: data.expedition.distance_from_services_mi,
      start_at: data.expedition.start_at,
      end_at: data.expedition.end_at,
      readiness_score: data.expedition.readiness_score,
      notes: data.expedition.notes,
      created_at: data.expedition.created_at,
      updated_at: data.expedition.updated_at,
    } : null,
    checklists: data.checklists.map(item => ({
      id: item.id,
      title: item.title,
      category: item.category,
      priority: item.priority,
      is_done: item.is_done,
      done_at: item.done_at,
      created_at: item.created_at,
    })),
    fieldLogs: data.fieldLogs.map(log => ({
      id: log.id,
      type: log.type,
      title: log.title,
      body: log.body,
      lat: log.lat,
      lng: log.lng,
      occurred_at: log.occurred_at,
      meta: log.meta,
      created_at: log.created_at,
    })),
    routes: data.routes.map(route => ({
      id: route.id,
      name: route.name,
      source: route.source,
      distance_mi: route.distance_mi,
      eta_hours: route.eta_hours,
      has_gpx: !!route.gpx,
      has_geojson: !!route.geojson,
      created_at: route.created_at,
    })),
    waypoints: data.waypoints.map(wp => ({
      id: wp.id,
      title: wp.title,
      kind: wp.kind,
      lat: wp.lat,
      lng: wp.lng,
      occurred_at: wp.occurred_at,
      meta: wp.meta,
      created_at: wp.created_at,
    })),
  };

  return JSON.stringify(cleanData, null, 2);
}

// ── CSV formatter ───────────────────────────────────────────
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCSV(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map(row => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function formatAsCSV(data: ExpeditionExportData): string {
  const sections: string[] = [];

  // ── Expedition Details ────────────────────────────────
  if (data.expedition) {
    const exp = data.expedition;
    const terrainLabel = TERRAIN_OPTIONS.find(t => t.value === exp.terrain)?.label || exp.terrain || '';
    sections.push('=== EXPEDITION DETAILS ===');
    sections.push(arrayToCSV(
      ['Field', 'Value'],
      [
        ['Title', exp.title],
        ['Status', exp.status],
        ['Terrain', terrainLabel],
        ['Duration (days)', exp.duration_days],
        ['Distance from Services (mi)', exp.distance_from_services_mi],
        ['Start Date', exp.start_at],
        ['End Date', exp.end_at],
        ['Readiness Score', exp.readiness_score],
        ['Notes', exp.notes],
        ['Created', exp.created_at],
        ['Updated', exp.updated_at],
      ],
    ));
  }

  // ── Readiness Summary ─────────────────────────────────
  if (data.readiness) {
    sections.push('');
    sections.push('=== READINESS SUMMARY ===');
    sections.push(arrayToCSV(
      ['Metric', 'Value'],
      [
        ['Overall Score', `${data.readiness.score}%`],
        ['Total Items', data.readiness.totalItems],
        ['Completed Items', data.readiness.completedItems],
        ['Critical Incomplete', data.readiness.criticalIncomplete],
        ...Object.entries(data.readiness.breakdown).map(([cat, score]) => [
          `Category: ${cat}`, `${score}%`,
        ]),
      ],
    ));
  }

  // ── Checklist Items ───────────────────────────────────
  if (data.checklists.length > 0) {
    sections.push('');
    sections.push('=== CHECKLIST ITEMS ===');
    sections.push(arrayToCSV(
      ['Title', 'Category', 'Priority', 'Status', 'Completed At', 'Created At'],
      data.checklists.map(item => [
        item.title,
        item.category || 'general',
        item.priority,
        item.is_done ? 'DONE' : 'PENDING',
        item.done_at || '',
        item.created_at,
      ]),
    ));
  }

  // ── Field Logs ────────────────────────────────────────
  if (data.fieldLogs.length > 0) {
    sections.push('');
    sections.push('=== FIELD LOG ENTRIES ===');
    sections.push(arrayToCSV(
      ['Type', 'Title', 'Body', 'Latitude', 'Longitude', 'Occurred At', 'Created At'],
      data.fieldLogs.map(log => {
        const typeMeta = FIELD_LOG_TYPE_META[log.type];
        return [
          typeMeta?.label || log.type,
          log.title || '',
          log.body || '',
          log.lat ?? '',
          log.lng ?? '',
          log.occurred_at,
          log.created_at,
        ];
      }),
    ));
  }

  // ── Routes ────────────────────────────────────────────
  if (data.routes.length > 0) {
    sections.push('');
    sections.push('=== ROUTES ===');
    sections.push(arrayToCSV(
      ['Name', 'Source', 'Distance (mi)', 'ETA (hours)', 'Has GPX', 'Has GeoJSON', 'Created At'],
      data.routes.map(route => [
        route.name,
        route.source || '',
        route.distance_mi ?? '',
        route.eta_hours ?? '',
        route.gpx ? 'Yes' : 'No',
        route.geojson ? 'Yes' : 'No',
        route.created_at,
      ]),
    ));
  }

  // ── Waypoints ─────────────────────────────────────────
  if (data.waypoints.length > 0) {
    sections.push('');
    sections.push('=== WAYPOINTS ===');
    sections.push(arrayToCSV(
      ['Title', 'Kind', 'Latitude', 'Longitude', 'Occurred At', 'Created At'],
      data.waypoints.map(wp => {
        const kindMeta = WAYPOINT_KIND_META[wp.kind];
        return [
          wp.title || '',
          kindMeta?.label || wp.kind,
          wp.lat ?? '',
          wp.lng ?? '',
          wp.occurred_at || '',
          wp.created_at,
        ];
      }),
    ));
  }

  if (sections.length === 0) {
    sections.push('No data selected for export.');
  }

  return sections.join('\n');
}

// ════════════════════════════════════════════════════════════
// GPX 1.1 FORMATTER — GeoJSON → GPX conversion
// ════════════════════════════════════════════════════════════
// Generates valid GPX 1.1 XML from expedition route geojson,
// waypoints, and geotagged field log entries. Compatible with
// Garmin, Gaia GPS, CalTopo, AllTrails, and other GPS tools.
// ════════════════════════════════════════════════════════════

/** Escape special XML characters for safe GPX output */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Map ECS waypoint kind to Garmin-compatible GPX symbol names */
function gpxSymbolForKind(kind: string): string {
  const symbolMap: Record<string, string> = {
    waypoint: 'Waypoint',
    camp: 'Campground',
    fuel: 'Gas Station',
    water: 'Drinking Water',
    hazard: 'Danger Area',
    note: 'Information',
    incident: 'Danger Area',
  };
  return symbolMap[kind] || 'Waypoint';
}

/** Map ECS field log type to Garmin-compatible GPX symbol names */
function gpxSymbolForLogType(type: string): string {
  const symbolMap: Record<string, string> = {
    note: 'Information',
    marker: 'Flag, Blue',
    incident: 'Danger Area',
    resource: 'Navaid, Green',
    maintenance: 'Wrecker',
    comms: 'Radio Beacon',
    medical: 'Medical Facility',
  };
  return symbolMap[type] || 'Flag, Blue';
}

/**
 * Extract coordinate arrays from a GeoJSON object.
 * Handles: Point, LineString, MultiLineString, Polygon,
 * MultiPolygon, Feature, FeatureCollection, GeometryCollection.
 *
 * Returns an array of "tracks" — each track is an array of
 * [lon, lat, ele?] coordinate tuples forming a continuous line.
 * Point geometries are returned as single-point tracks.
 */
function extractTracksFromGeoJSON(
  geojson: Record<string, any>,
): { tracks: number[][]; points: number[][] } {
  const tracks: number[][][] = [];
  const points: number[][] = [];

  function processGeometry(geom: Record<string, any>): void {
    if (!geom || !geom.type) return;

    switch (geom.type) {
      case 'Point':
        if (Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
          points.push(geom.coordinates);
        }
        break;

      case 'MultiPoint':
        if (Array.isArray(geom.coordinates)) {
          for (const coord of geom.coordinates) {
            if (Array.isArray(coord) && coord.length >= 2) {
              points.push(coord);
            }
          }
        }
        break;

      case 'LineString':
        if (Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
          tracks.push(geom.coordinates);
        }
        break;

      case 'MultiLineString':
        if (Array.isArray(geom.coordinates)) {
          for (const line of geom.coordinates) {
            if (Array.isArray(line) && line.length >= 2) {
              tracks.push(line);
            }
          }
        }
        break;

      case 'Polygon':
        // Export polygon exterior ring as a track (closed loop)
        if (Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
          const ring = geom.coordinates[0];
          if (Array.isArray(ring) && ring.length >= 2) {
            tracks.push(ring);
          }
        }
        break;

      case 'MultiPolygon':
        if (Array.isArray(geom.coordinates)) {
          for (const polygon of geom.coordinates) {
            if (Array.isArray(polygon) && polygon.length > 0) {
              const ring = polygon[0];
              if (Array.isArray(ring) && ring.length >= 2) {
                tracks.push(ring);
              }
            }
          }
        }
        break;

      case 'GeometryCollection':
        if (Array.isArray(geom.geometries)) {
          for (const g of geom.geometries) {
            processGeometry(g);
          }
        }
        break;

      default:
        break;
    }
  }

  function processFeature(feature: Record<string, any>): void {
    if (!feature) return;
    if (feature.geometry) {
      processGeometry(feature.geometry);
    }
  }

  // Top-level dispatch
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feature of geojson.features) {
      processFeature(feature);
    }
  } else if (geojson.type === 'Feature') {
    processFeature(geojson);
  } else {
    // Bare geometry
    processGeometry(geojson);
  }

  // Flatten tracks into coordinate arrays
  const flatTracks: number[][] = [];
  for (const track of tracks) {
    for (const coord of track) {
      if (Array.isArray(coord) && coord.length >= 2) {
        flatTracks.push(coord);
      }
    }
  }

  return { tracks: flatTracks, points };
}

/**
 * Compute bounding box from all coordinates in the export data.
 */
function computeGpxBounds(data: ExpeditionExportData): {
  minLat: number; maxLat: number; minLon: number; maxLon: number;
} | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let hasPoints = false;

  function addPoint(lat: number, lon: number): void {
    if (!isFinite(lat) || !isFinite(lon)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    hasPoints = true;
  }

  // Waypoints
  for (const wp of data.waypoints) {
    if (wp.lat != null && wp.lng != null) {
      addPoint(wp.lat, wp.lng);
    }
  }

  // Field logs with coordinates
  for (const log of data.fieldLogs) {
    if (log.lat != null && log.lng != null) {
      addPoint(log.lat, log.lng);
    }
  }

  // Route geojson coordinates
  for (const route of data.routes) {
    if (route.geojson) {
      const { tracks, points } = extractTracksFromGeoJSON(route.geojson);
      for (const coord of tracks) {
        addPoint(coord[1], coord[0]); // GeoJSON is [lon, lat]
      }
      for (const coord of points) {
        addPoint(coord[1], coord[0]);
      }
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
 * Count the total number of geographic elements that will
 * appear in the GPX output. Used for preview in the modal.
 */
export function countGpxElements(data: ExpeditionExportData): {
  waypointCount: number;
  trackCount: number;
  trackPointCount: number;
  fieldLogMarkerCount: number;
} {
  let waypointCount = 0;
  let trackCount = 0;
  let trackPointCount = 0;
  let fieldLogMarkerCount = 0;

  // Waypoints with coordinates
  for (const wp of data.waypoints) {
    if (wp.lat != null && wp.lng != null) {
      waypointCount++;
    }
  }

  // Field logs with coordinates
  for (const log of data.fieldLogs) {
    if (log.lat != null && log.lng != null) {
      fieldLogMarkerCount++;
    }
  }

  // Routes with geojson
  for (const route of data.routes) {
    if (route.geojson) {
      const extracted = extractTracksFromGeoJSON(route.geojson);
      if (extracted.tracks.length > 0) {
        trackCount++;
        trackPointCount += extracted.tracks.length;
      }
      // GeoJSON points become additional waypoints
      waypointCount += extracted.points.length;
    }
    // Routes with raw GPX data count as a track
    if (route.gpx) {
      trackCount++;
    }
  }

  return { waypointCount, trackCount, trackPointCount, fieldLogMarkerCount };
}

/**
 * Format expedition data as GPX 1.1 XML.
 *
 * Converts:
 *   - EcsWaypoint records → <wpt> elements
 *   - Geotagged EcsFieldLog entries → <wpt> elements (with type extensions)
 *   - EcsRoute geojson data → <trk>/<trkseg>/<trkpt> elements
 *   - EcsRoute raw GPX strings → embedded as-is in a comment block
 *
 * The output conforms to GPX 1.1 schema and is compatible with:
 *   Garmin BaseCamp, Gaia GPS, CalTopo, AllTrails, Google Earth,
 *   OsmAnd, Avenza Maps, and other standard GPS/mapping tools.
 */
export function formatAsGPX(data: ExpeditionExportData): string {
  const lines: string[] = [];
  const now = new Date().toISOString();
  const expeditionTitle = data.expedition?.title || 'ECS Expedition';
  const expeditionNotes = data.expedition?.notes || '';

  // ── XML Declaration & GPX Root ────────────────────────
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx xmlns="http://www.topografix.com/GPX/1/1"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:ecs="http://expeditioncommand.app/gpx/extensions/1"' +
    ' creator="Expedition Command System"' +
    ' version="1.1"' +
    ' xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
  );

  // ── Metadata ──────────────────────────────────────────
  lines.push('  <metadata>');
  lines.push(`    <name>${escapeXml(expeditionTitle)}</name>`);
  if (expeditionNotes) {
    lines.push(`    <desc>${escapeXml(expeditionNotes)}</desc>`);
  }
  lines.push('    <author>');
  lines.push('      <name>Expedition Command System</name>');
  lines.push('      <link href="https://expeditioncommand.app">');
  lines.push('        <text>ECS</text>');
  lines.push('      </link>');
  lines.push('    </author>');
  lines.push(`    <time>${now}</time>`);
  lines.push('    <keywords>expedition,overland,route,offroad</keywords>');

  // Bounds
  const bounds = computeGpxBounds(data);
  if (bounds) {
    lines.push(
      `    <bounds minlat="${bounds.minLat}" minlon="${bounds.minLon}"` +
      ` maxlat="${bounds.maxLat}" maxlon="${bounds.maxLon}"/>`,
    );
  }

  // Expedition metadata as extensions
  lines.push('    <extensions>');
  lines.push(`      <ecs:exportedAt>${now}</ecs:exportedAt>`);
  lines.push('      <ecs:appVersion>1.0.0</ecs:appVersion>');
  if (data.expedition) {
    lines.push(`      <ecs:expeditionId>${escapeXml(data.expedition.id)}</ecs:expeditionId>`);
    lines.push(`      <ecs:expeditionStatus>${escapeXml(data.expedition.status)}</ecs:expeditionStatus>`);
    if (data.expedition.terrain) {
      const terrainLabel = TERRAIN_OPTIONS.find(t => t.value === data.expedition!.terrain)?.label || data.expedition.terrain;
      lines.push(`      <ecs:terrain>${escapeXml(terrainLabel)}</ecs:terrain>`);
    }
    if (data.expedition.duration_days != null) {
      lines.push(`      <ecs:durationDays>${data.expedition.duration_days}</ecs:durationDays>`);
    }
    if (data.expedition.distance_from_services_mi != null) {
      lines.push(`      <ecs:distanceFromServicesMi>${data.expedition.distance_from_services_mi}</ecs:distanceFromServicesMi>`);
    }
    if (data.expedition.start_at) {
      lines.push(`      <ecs:startAt>${escapeXml(data.expedition.start_at)}</ecs:startAt>`);
    }
    if (data.expedition.end_at) {
      lines.push(`      <ecs:endAt>${escapeXml(data.expedition.end_at)}</ecs:endAt>`);
    }
  }
  if (data.readiness) {
    lines.push(`      <ecs:readinessScore>${data.readiness.score}</ecs:readinessScore>`);
    lines.push(`      <ecs:checklistTotal>${data.readiness.totalItems}</ecs:checklistTotal>`);
    lines.push(`      <ecs:checklistCompleted>${data.readiness.completedItems}</ecs:checklistCompleted>`);
  }
  lines.push('    </extensions>');
  lines.push('  </metadata>');

  // ── Waypoints (<wpt>) ─────────────────────────────────
  // Export ECS waypoints that have coordinates
  let wptIndex = 0;
  for (const wp of data.waypoints) {
    if (wp.lat == null || wp.lng == null) continue;

    const kindMeta = WAYPOINT_KIND_META[wp.kind];
    const name = wp.title || kindMeta?.label || `Waypoint ${wptIndex + 1}`;
    const symbol = gpxSymbolForKind(wp.kind);

    lines.push(`  <wpt lat="${wp.lat.toFixed(8)}" lon="${wp.lng.toFixed(8)}">`);

    // Elevation from meta if available
    if (wp.meta?.elevation != null) {
      lines.push(`    <ele>${Number(wp.meta.elevation).toFixed(1)}</ele>`);
    }

    // Timestamp
    if (wp.occurred_at) {
      lines.push(`    <time>${escapeXml(wp.occurred_at)}</time>`);
    } else if (wp.created_at) {
      lines.push(`    <time>${escapeXml(wp.created_at)}</time>`);
    }

    lines.push(`    <name>${escapeXml(name)}</name>`);

    // Description from meta
    if (wp.meta?.description) {
      lines.push(`    <desc>${escapeXml(String(wp.meta.description))}</desc>`);
    }

    lines.push(`    <sym>${escapeXml(symbol)}</sym>`);
    lines.push(`    <type>${escapeXml(kindMeta?.label || wp.kind)}</type>`);

    // ECS extensions
    lines.push('    <extensions>');
    lines.push(`      <ecs:waypointKind>${escapeXml(wp.kind)}</ecs:waypointKind>`);
    lines.push(`      <ecs:waypointId>${escapeXml(wp.id)}</ecs:waypointId>`);
    if (wp.route_id) {
      lines.push(`      <ecs:routeId>${escapeXml(wp.route_id)}</ecs:routeId>`);
    }
    if (kindMeta?.color) {
      lines.push(`      <ecs:displayColor>${kindMeta.color}</ecs:displayColor>`);
    }
    if (kindMeta?.icon) {
      lines.push(`      <ecs:displayIcon>${escapeXml(kindMeta.icon)}</ecs:displayIcon>`);
    }
    lines.push('    </extensions>');
    lines.push('  </wpt>');

    wptIndex++;
  }

  // ── Field Log Markers (<wpt>) ─────────────────────────
  // Geotagged field log entries become waypoints with log-specific metadata
  for (const log of data.fieldLogs) {
    if (log.lat == null || log.lng == null) continue;

    const typeMeta = FIELD_LOG_TYPE_META[log.type];
    const name = log.title || typeMeta?.label || `Log Entry`;
    const symbol = gpxSymbolForLogType(log.type);

    lines.push(`  <wpt lat="${log.lat.toFixed(8)}" lon="${log.lng.toFixed(8)}">`);

    // Timestamp
    lines.push(`    <time>${escapeXml(log.occurred_at)}</time>`);

    lines.push(`    <name>${escapeXml(name)}</name>`);

    // Body as description
    if (log.body) {
      lines.push(`    <desc>${escapeXml(log.body)}</desc>`);
    }

    lines.push(`    <sym>${escapeXml(symbol)}</sym>`);
    lines.push(`    <type>Field Log: ${escapeXml(typeMeta?.label || log.type)}</type>`);

    // ECS extensions for field log metadata
    lines.push('    <extensions>');
    lines.push(`      <ecs:source>field_log</ecs:source>`);
    lines.push(`      <ecs:fieldLogType>${escapeXml(log.type)}</ecs:fieldLogType>`);
    lines.push(`      <ecs:fieldLogId>${escapeXml(log.id)}</ecs:fieldLogId>`);
    if (typeMeta?.color) {
      lines.push(`      <ecs:displayColor>${typeMeta.color}</ecs:displayColor>`);
    }
    if (typeMeta?.icon) {
      lines.push(`      <ecs:displayIcon>${escapeXml(typeMeta.icon)}</ecs:displayIcon>`);
    }
    // Include additional meta fields
    if (log.meta) {
      const metaStr = JSON.stringify(log.meta);
      if (metaStr.length < 2000) {
        lines.push(`      <ecs:meta>${escapeXml(metaStr)}</ecs:meta>`);
      }
    }
    lines.push('    </extensions>');
    lines.push('  </wpt>');
  }

  // ── Tracks (<trk>) from route GeoJSON ─────────────────
  for (const route of data.routes) {
    // Skip routes with no geographic data
    if (!route.geojson && !route.gpx) continue;

    // If route has raw GPX, embed it as a comment reference
    // (we can't nest GPX inside GPX, so we note it)
    if (route.gpx && !route.geojson) {
      lines.push(`  <!-- Route "${escapeXml(route.name)}" has raw GPX data (${route.gpx.length} chars). -->`);
      lines.push(`  <!-- Import the original GPX file separately for full fidelity. -->`);

      // Still create a track element with metadata
      lines.push('  <trk>');
      lines.push(`    <name>${escapeXml(route.name)} (reference only)</name>`);
      lines.push(`    <desc>This route has raw GPX data. Re-import the original file for track points.</desc>`);
      lines.push('    <extensions>');
      lines.push(`      <ecs:routeId>${escapeXml(route.id)}</ecs:routeId>`);
      lines.push(`      <ecs:source>${escapeXml(route.source || 'unknown')}</ecs:source>`);
      lines.push('      <ecs:hasRawGpx>true</ecs:hasRawGpx>');
      if (route.distance_mi != null) {
        lines.push(`      <ecs:distanceMi>${route.distance_mi}</ecs:distanceMi>`);
      }
      if (route.eta_hours != null) {
        lines.push(`      <ecs:etaHours>${route.eta_hours}</ecs:etaHours>`);
      }
      lines.push('    </extensions>');
      lines.push('  </trk>');
      continue;
    }

    if (!route.geojson) continue;

    // Extract tracks and points from GeoJSON
    const extracted = extractTracksFromGeoJSON(route.geojson);
    const hasTrackCoords = extracted.tracks.length > 0;
    const hasGeoPoints = extracted.points.length > 0;

    if (!hasTrackCoords && !hasGeoPoints) continue;

    // ── GeoJSON points → additional <wpt> elements ──────
    for (let pi = 0; pi < extracted.points.length; pi++) {
      const coord = extracted.points[pi];
      const lon = coord[0];
      const lat = coord[1];
      const ele = coord.length > 2 ? coord[2] : null;

      lines.push(`  <wpt lat="${lat.toFixed(8)}" lon="${lon.toFixed(8)}">`);
      if (ele != null && isFinite(ele)) {
        lines.push(`    <ele>${ele.toFixed(1)}</ele>`);
      }
      lines.push(`    <name>${escapeXml(route.name)} - Point ${pi + 1}</name>`);
      lines.push(`    <sym>Waypoint</sym>`);
      lines.push('    <extensions>');
      lines.push(`      <ecs:source>route_geojson</ecs:source>`);
      lines.push(`      <ecs:routeId>${escapeXml(route.id)}</ecs:routeId>`);
      lines.push('    </extensions>');
      lines.push('  </wpt>');
    }

    // ── GeoJSON tracks → <trk>/<trkseg>/<trkpt> ────────
    if (hasTrackCoords) {
      lines.push('  <trk>');
      lines.push(`    <name>${escapeXml(route.name)}</name>`);

      // Route description
      const descParts: string[] = [];
      if (route.source) descParts.push(`Source: ${route.source}`);
      if (route.distance_mi != null) descParts.push(`Distance: ${route.distance_mi} mi`);
      if (route.eta_hours != null) descParts.push(`ETA: ${route.eta_hours} hrs`);
      if (descParts.length > 0) {
        lines.push(`    <desc>${escapeXml(descParts.join(' | '))}</desc>`);
      }

      lines.push('    <number>1</number>');

      // Track-level extensions
      lines.push('    <extensions>');
      lines.push(`      <ecs:routeId>${escapeXml(route.id)}</ecs:routeId>`);
      lines.push(`      <ecs:source>${escapeXml(route.source || 'manual')}</ecs:source>`);
      if (route.distance_mi != null) {
        lines.push(`      <ecs:distanceMi>${route.distance_mi}</ecs:distanceMi>`);
      }
      if (route.eta_hours != null) {
        lines.push(`      <ecs:etaHours>${route.eta_hours}</ecs:etaHours>`);
      }
      lines.push(`      <ecs:trackPointCount>${extracted.tracks.length}</ecs:trackPointCount>`);
      lines.push(`      <ecs:exportedAt>${now}</ecs:exportedAt>`);
      lines.push('    </extensions>');

      // Build track segments
      // We'll group coordinates into segments. For a single LineString,
      // all points go into one <trkseg>. For MultiLineString, each
      // sub-line becomes its own <trkseg>.
      const segments = groupIntoSegments(route.geojson);

      for (const segment of segments) {
        lines.push('    <trkseg>');
        for (const coord of segment) {
          if (!Array.isArray(coord) || coord.length < 2) continue;
          const lon = coord[0];
          const lat = coord[1];
          const ele = coord.length > 2 ? coord[2] : null;

          let trkptContent = '';
          if (ele != null && isFinite(ele)) {
            trkptContent += `\n        <ele>${ele.toFixed(1)}</ele>`;
          }

          lines.push(
            `      <trkpt lat="${lat.toFixed(8)}" lon="${lon.toFixed(8)}">${trkptContent}` +
            '\n      </trkpt>',
          );
        }
        lines.push('    </trkseg>');
      }

      lines.push('  </trk>');
    }
  }

  // ── Close GPX ─────────────────────────────────────────
  lines.push('</gpx>');

  return lines.join('\n');
}

/**
 * Group GeoJSON coordinates into track segments.
 * Returns an array of segments, each being an array of [lon, lat, ele?] tuples.
 *
 * - LineString → 1 segment
 * - MultiLineString → N segments
 * - FeatureCollection → segments from all features
 * - Feature → segments from its geometry
 */
function groupIntoSegments(geojson: Record<string, any>): number[][][] {
  const segments: number[][][] = [];

  function processGeometry(geom: Record<string, any>): void {
    if (!geom || !geom.type) return;

    switch (geom.type) {
      case 'LineString':
        if (Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
          segments.push(geom.coordinates);
        }
        break;

      case 'MultiLineString':
        if (Array.isArray(geom.coordinates)) {
          for (const line of geom.coordinates) {
            if (Array.isArray(line) && line.length >= 2) {
              segments.push(line);
            }
          }
        }
        break;

      case 'Polygon':
        if (Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
          const ring = geom.coordinates[0];
          if (Array.isArray(ring) && ring.length >= 2) {
            segments.push(ring);
          }
        }
        break;

      case 'MultiPolygon':
        if (Array.isArray(geom.coordinates)) {
          for (const polygon of geom.coordinates) {
            if (Array.isArray(polygon) && polygon.length > 0) {
              const ring = polygon[0];
              if (Array.isArray(ring) && ring.length >= 2) {
                segments.push(ring);
              }
            }
          }
        }
        break;

      case 'GeometryCollection':
        if (Array.isArray(geom.geometries)) {
          for (const g of geom.geometries) {
            processGeometry(g);
          }
        }
        break;

      default:
        break;
    }
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feature of geojson.features) {
      if (feature?.geometry) processGeometry(feature.geometry);
    }
  } else if (geojson.type === 'Feature') {
    if (geojson.geometry) processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson);
  }

  // If no segments were found but there are raw coordinates, try flat
  if (segments.length === 0 && Array.isArray(geojson.coordinates)) {
    // Might be a bare coordinate array
    const coords = geojson.coordinates;
    if (coords.length >= 2 && Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
      segments.push(coords);
    }
  }

  return segments;
}

// ── File name generator ─────────────────────────────────────
function generateFileName(title: string, format: ExportFormat): string {
  const sanitized = title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 40);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const extMap: Record<ExportFormat, string> = { json: 'json', csv: 'csv', gpx: 'gpx', kml: 'kml', geojson: 'geojson' };

  const ext = extMap[format] || 'json';
  return `ecs_export_${sanitized}_${timestamp}.${ext}`;
}


// ── Web download helper ─────────────────────────────────────
function downloadOnWeb(content: string, fileName: string, mimeType: string): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    // Cleanup
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
    }, 100);
  } catch (err) {
    console.warn('[ExportEngine] Web download failed:', err);
    throw new Error('Failed to trigger download');
  }
}

// ── MIME type helper ────────────────────────────────────────
function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'json': return 'application/json';
    case 'csv': return 'text/csv';
    case 'gpx': return 'application/gpx+xml';
    case 'kml': return 'application/vnd.google-earth.kml+xml';
    case 'geojson': return 'application/geo+json';
    default: return 'application/octet-stream';
  }
}



// ── Main export function ────────────────────────────────────
export async function exportExpeditionData(
  expeditionId: string,
  userId: string,
  format: ExportFormat,
  sections: ExportSections,
): Promise<ExportResult> {
  try {
    // For GPX/KML/GeoJSON, geographic data is primary — same section handling
    const geoSections: ExportSections = (format === 'gpx' || format === 'kml' || format === 'geojson')
      ? {
          ...sections,
          routes: sections.routes,
          waypoints: sections.waypoints,
          expeditionDetails: sections.expeditionDetails,
          fieldLogs: sections.fieldLogs,
          checklists: sections.checklists,
        }
      : sections;


    // 1. Gather data
    const data = await gatherExportData(expeditionId, userId, geoSections);
    data.exportMeta.format = format;

    const recordCounts = {
      checklistItems: data.checklists.length,
      fieldLogs: data.fieldLogs.length,
      routes: data.routes.length,
      waypoints: data.waypoints.length,
    };

    // 2. Format content
    let content: string;
    switch (format) {
      case 'json':
        content = formatAsJSON(data);
        break;
      case 'csv':
        content = formatAsCSV(data);
        break;
      case 'gpx':
        content = formatAsGPX(data);
        break;
      case 'kml':
        content = formatAsKML(data);
        break;
      case 'geojson':
        content = formatAsGeoJSON(data);
        break;
      default:
        content = formatAsJSON(data);
    }


    const title = data.expedition?.title || 'expedition';
    const fileName = generateFileName(title, format);
    const mimeType = getMimeType(format);


    // 3. Platform-specific file handling
    if (Platform.OS === 'web') {
      downloadOnWeb(content, fileName, mimeType);
      return {
        success: true,
        fileName,
        recordCounts,
      };
    }

    // Native: write to file system via fsCompat wrappers
    const dirPath = await getDocumentDirectory();
    if (!dirPath) {
      throw new Error('File system not available');
    }

    const filePath = `${dirPath}${fileName}`;
    await fsWriteString(filePath, content);




    // Try to share the file
    try {
      // Use React Native's Share API with the file content summary
      const totalRecords = recordCounts.checklistItems + recordCounts.fieldLogs
        + recordCounts.routes + recordCounts.waypoints;
      const shareMessage = (format === 'gpx' || format === 'kml')
        ? `Expedition "${title}" ${format.toUpperCase()} export — route & waypoint data for ${format === 'kml' ? 'Google Earth & GIS apps' : 'GPS devices & mapping apps'}. File saved to: ${filePath}`
        : format === 'geojson'
          ? `Expedition "${title}" GeoJSON FeatureCollection — route geometry & waypoint data for Mapbox, Leaflet & web mapping. File saved to: ${filePath}`
          : `Expedition "${title}" export (${format.toUpperCase()}) — ${totalRecords} records exported. File saved to: ${filePath}`;



      await Share.share({
        title: `ECS Export: ${title}`,
        message: shareMessage,
        url: Platform.OS === 'ios' ? filePath : undefined,
      });
    } catch (shareErr: any) {
      // User cancelled share or share not available — file is still saved
      if (shareErr?.message !== 'User did not share') {
        console.warn('[ExportEngine] Share failed (file still saved):', shareErr);
      }
    }

    return {
      success: true,
      filePath,
      fileName,
      recordCounts,
    };
  } catch (err: any) {
    console.warn('[ExportEngine] Export failed:', err);
    return {
      success: false,
      error: err?.message || 'Export failed',
      recordCounts: {
        checklistItems: 0,
        fieldLogs: 0,
        routes: 0,
        waypoints: 0,
      },
    };
  }
}

// ── Preview data counts (lightweight, no file generation) ───
export async function previewExportCounts(
  expeditionId: string,
  userId: string,
): Promise<{
  checklistItems: number;
  fieldLogs: number;
  routes: number;
  waypoints: number;
}> {
  try {
    const [checklists, logs, routes, waypoints] = await Promise.all([
      checklistStore.list(expeditionId, userId),
      fieldLogStore.list(expeditionId, userId),
      routeCommandStore.list(expeditionId, userId),
      waypointCommandStore.list(expeditionId, userId),
    ]);

    return {
      checklistItems: checklists.length,
      fieldLogs: logs.length,
      routes: routes.length,
      waypoints: waypoints.length,
    };
  } catch (err) {
    console.warn('[ExportEngine] previewExportCounts failed:', err);
    return { checklistItems: 0, fieldLogs: 0, routes: 0, waypoints: 0 };
  }
}


// ════════════════════════════════════════════════════════════
// KML 2.2 FORMATTER — GeoJSON → KML conversion
// ════════════════════════════════════════════════════════════
// Generates valid KML 2.2 XML from expedition data. Compatible
// with Google Earth, Google My Maps, ArcGIS, QGIS, and other
// GIS tools. Includes styled Placemarks with colored pins for
// waypoint kinds and colored lines for routes.
// ════════════════════════════════════════════════════════════

/** KML color format: aabbggrr (alpha, blue, green, red) — reversed from HTML hex */
function hexToKmlColor(hex: string, alpha: string = 'ff'): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return `${alpha}ffffff`;
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `${alpha}${b}${g}${r}`;
}

/** Map waypoint kind to KML icon URL (Google Earth standard icons) */
function kmlIconForKind(kind: string): string {
  const iconMap: Record<string, string> = {
    waypoint: 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png',
    camp: 'http://maps.google.com/mapfiles/kml/paddle/grn-blank.png',
    fuel: 'http://maps.google.com/mapfiles/kml/paddle/red-blank.png',
    water: 'http://maps.google.com/mapfiles/kml/paddle/blu-blank.png',
    hazard: 'http://maps.google.com/mapfiles/kml/paddle/ylw-blank.png',
    note: 'http://maps.google.com/mapfiles/kml/paddle/purple-blank.png',
    incident: 'http://maps.google.com/mapfiles/kml/paddle/red-diamond.png',
  };
  return iconMap[kind] || iconMap.waypoint;
}

/** Map field log type to KML icon URL */
function kmlIconForLogType(type: string): string {
  const iconMap: Record<string, string> = {
    note: 'http://maps.google.com/mapfiles/kml/paddle/ltblu-blank.png',
    marker: 'http://maps.google.com/mapfiles/kml/paddle/blu-blank.png',
    incident: 'http://maps.google.com/mapfiles/kml/paddle/red-diamond.png',
    resource: 'http://maps.google.com/mapfiles/kml/paddle/grn-blank.png',
    maintenance: 'http://maps.google.com/mapfiles/kml/paddle/ylw-blank.png',
    comms: 'http://maps.google.com/mapfiles/kml/paddle/ltblu-blank.png',
    medical: 'http://maps.google.com/mapfiles/kml/paddle/pink-blank.png',
  };
  return iconMap[type] || iconMap.note;
}

/** Route line colors for KML (cycle through these for multiple routes) */
const KML_ROUTE_COLORS = [
  '#C48A2C', // amber
  '#4CAF50', // green
  '#42A5F5', // blue
  '#FF7043', // orange
  '#CE93D8', // purple
  '#4FC3F7', // cyan
  '#EF5350', // red
  '#66BB6A', // light green
];

/**
 * Count KML elements that will be generated. Used for preview.
 */
export function countKmlElements(data: ExpeditionExportData): {
  placemarkPointCount: number;
  placemarkLineCount: number;
  fieldLogMarkerCount: number;
  folderCount: number;
} {
  let placemarkPointCount = 0;
  let placemarkLineCount = 0;
  let fieldLogMarkerCount = 0;
  let folderCount = 0;

  // Waypoints with coordinates
  for (const wp of data.waypoints) {
    if (wp.lat != null && wp.lng != null) {
      placemarkPointCount++;
    }
  }
  if (placemarkPointCount > 0) folderCount++;

  // Field logs with coordinates
  for (const log of data.fieldLogs) {
    if (log.lat != null && log.lng != null) {
      fieldLogMarkerCount++;
    }
  }
  if (fieldLogMarkerCount > 0) folderCount++;

  // Routes with geojson
  for (const route of data.routes) {
    if (route.geojson) {
      const segments = groupIntoSegments(route.geojson);
      if (segments.length > 0) {
        placemarkLineCount++;
      }
      const extracted = extractTracksFromGeoJSON(route.geojson);
      placemarkPointCount += extracted.points.length;
    }
  }
  if (placemarkLineCount > 0) folderCount++;

  return { placemarkPointCount, placemarkLineCount, fieldLogMarkerCount, folderCount };
}

/**
 * Format expedition data as KML 2.2 XML.
 *
 * Converts:
 *   - EcsWaypoint records → Placemark with Point geometry (in Waypoints folder)
 *   - Geotagged EcsFieldLog entries → Placemark with Point geometry (in Field Logs folder)
 *   - EcsRoute geojson data → Placemark with LineString geometry (in Routes folder)
 *
 * The output conforms to KML 2.2 and is compatible with:
 *   Google Earth, Google My Maps, ArcGIS, QGIS, CalTopo,
 *   Avenza Maps, GPS Visualizer, and other GIS/mapping tools.
 *
 * Includes:
 *   - Styled pins with colors matching waypoint kind
 *   - Colored route lines with configurable width
 *   - Folder organization for clean hierarchy
 *   - Extended data for ECS-specific metadata
 *   - LookAt viewpoint based on data bounds
 */
export function formatAsKML(data: ExpeditionExportData): string {
  const lines: string[] = [];
  const now = new Date().toISOString();
  const expeditionTitle = data.expedition?.title || 'ECS Expedition';
  const expeditionNotes = data.expedition?.notes || '';

  // ── XML Declaration & KML Root ────────────────────────
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<kml xmlns="http://www.opengis.net/kml/2.2"' +
    ' xmlns:gx="http://www.google.com/kml/ext/2.2"' +
    ' xmlns:atom="http://www.w3.org/2005/Atom">',
  );
  lines.push('  <Document>');
  lines.push(`    <name>${escapeXml(expeditionTitle)}</name>`);

  // Description with expedition metadata
  const descParts: string[] = [];
  if (expeditionNotes) descParts.push(expeditionNotes);
  descParts.push(`Exported from Expedition Command System on ${now}`);
  if (data.expedition?.status) descParts.push(`Status: ${data.expedition.status}`);
  if (data.expedition?.terrain) {
    const terrainLabel = TERRAIN_OPTIONS.find(t => t.value === data.expedition!.terrain)?.label || data.expedition.terrain;
    descParts.push(`Terrain: ${terrainLabel}`);
  }
  if (data.expedition?.duration_days != null) descParts.push(`Duration: ${data.expedition.duration_days} days`);
  if (data.expedition?.distance_from_services_mi != null) descParts.push(`Distance from services: ${data.expedition.distance_from_services_mi} mi`);
  if (data.readiness) descParts.push(`Readiness: ${data.readiness.score}% (${data.readiness.completedItems}/${data.readiness.totalItems} items)`);

  lines.push(`    <description><![CDATA[${descParts.join('<br/>')}]]></description>`);
  lines.push('    <open>1</open>');

  // Author info
  lines.push('    <atom:author>');
  lines.push('      <atom:name>Expedition Command System</atom:name>');
  lines.push('    </atom:author>');
    lines.push('    <atom:link href="https://expeditioncommand.app"/>');

    // ── Document-level ExtendedData — ECS expedition metadata ──
    lines.push('    <ExtendedData>');
    lines.push('      <Data name="ecs_generator"><value>Expedition Command System</value></Data>');
    lines.push('      <Data name="ecs_generator_version"><value>1.0.0</value></Data>');
    lines.push(`      <Data name="ecs_exported_at"><value>${now}</value></Data>`);
    lines.push(`      <Data name="ecs_platform"><value>${escapeXml(data.exportMeta.platform)}</value></Data>`);
    if (data.expedition) {
      lines.push(`      <Data name="ecs_expedition_id"><value>${escapeXml(data.expedition.id)}</value></Data>`);
      lines.push(`      <Data name="ecs_expedition_title"><value>${escapeXml(data.expedition.title)}</value></Data>`);
      lines.push(`      <Data name="ecs_expedition_status"><value>${escapeXml(data.expedition.status)}</value></Data>`);
      if (data.expedition.terrain) {
        const terrainLabel = TERRAIN_OPTIONS.find(t => t.value === data.expedition!.terrain)?.label || data.expedition.terrain;
        lines.push(`      <Data name="ecs_terrain"><value>${escapeXml(terrainLabel)}</value></Data>`);
      }
      if (data.expedition.duration_days != null) {
        lines.push(`      <Data name="ecs_duration_days"><value>${data.expedition.duration_days}</value></Data>`);
      }
      if (data.expedition.distance_from_services_mi != null) {
        lines.push(`      <Data name="ecs_distance_from_services_mi"><value>${data.expedition.distance_from_services_mi}</value></Data>`);
      }
      if (data.expedition.start_at) {
        lines.push(`      <Data name="ecs_start_at"><value>${escapeXml(data.expedition.start_at)}</value></Data>`);
      }
      if (data.expedition.end_at) {
        lines.push(`      <Data name="ecs_end_at"><value>${escapeXml(data.expedition.end_at)}</value></Data>`);
      }
      if (data.expedition.notes) {
        lines.push(`      <Data name="ecs_notes"><value>${escapeXml(data.expedition.notes)}</value></Data>`);
      }
    }
    if (data.readiness) {
      lines.push(`      <Data name="ecs_readiness_score"><value>${data.readiness.score}</value></Data>`);
      lines.push(`      <Data name="ecs_checklist_total"><value>${data.readiness.totalItems}</value></Data>`);
      lines.push(`      <Data name="ecs_checklist_completed"><value>${data.readiness.completedItems}</value></Data>`);
      lines.push(`      <Data name="ecs_critical_incomplete"><value>${data.readiness.criticalIncomplete}</value></Data>`);
      // Readiness breakdown by category
      for (const [cat, score] of Object.entries(data.readiness.breakdown)) {
        const safeCat = cat.replace(/[^a-zA-Z0-9_-]/g, '_');
        lines.push(`      <Data name="ecs_readiness_${safeCat}"><value>${score}</value></Data>`);
      }
    }
    lines.push(`      <Data name="ecs_waypoint_count"><value>${data.waypoints.length}</value></Data>`);
    lines.push(`      <Data name="ecs_route_count"><value>${data.routes.length}</value></Data>`);
    lines.push(`      <Data name="ecs_field_log_count"><value>${data.fieldLogs.length}</value></Data>`);
    lines.push(`      <Data name="ecs_checklist_count"><value>${data.checklists.length}</value></Data>`);
    lines.push('    </ExtendedData>');



  // ── LookAt viewpoint from bounds ──────────────────────
  const bounds = computeGpxBounds(data);
  if (bounds) {
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;
    const maxSpan = Math.max(latSpan, lonSpan);
    // Rough altitude calculation for viewing range
    const altitude = Math.max(maxSpan * 111000 * 1.5, 5000);

    lines.push('    <LookAt>');
    lines.push(`      <longitude>${centerLon.toFixed(8)}</longitude>`);
    lines.push(`      <latitude>${centerLat.toFixed(8)}</latitude>`);
    lines.push(`      <altitude>0</altitude>`);
    lines.push(`      <range>${Math.round(altitude)}</range>`);
    lines.push('      <tilt>0</tilt>');
    lines.push('      <heading>0</heading>');
    lines.push('      <altitudeMode>clampToGround</altitudeMode>');
    lines.push('    </LookAt>');
  }

  // ── KML Styles ────────────────────────────────────────
  // Waypoint kind styles
  const waypointKinds = ['waypoint', 'camp', 'fuel', 'water', 'hazard', 'note', 'incident'] as const;
  for (const kind of waypointKinds) {
    const meta = WAYPOINT_KIND_META[kind];
    const kmlColor = hexToKmlColor(meta.color);
    lines.push(`    <Style id="ecs-wp-${kind}">`);
    lines.push('      <IconStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <scale>1.1</scale>');
    lines.push('        <Icon>');
    lines.push(`          <href>${kmlIconForKind(kind)}</href>`);
    lines.push('        </Icon>');
    lines.push('      </IconStyle>');
    lines.push('      <LabelStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <scale>0.9</scale>');
    lines.push('      </LabelStyle>');
    lines.push('      <BalloonStyle>');
    lines.push('        <bgColor>ff1d1812</bgColor>');
    lines.push('        <textColor>ffe1e6e6</textColor>');
    lines.push('      </BalloonStyle>');
    lines.push('    </Style>');
  }

  // Field log type styles
  const logTypes = ['note', 'marker', 'incident', 'resource', 'maintenance', 'comms', 'medical'] as const;
  for (const logType of logTypes) {
    const meta = FIELD_LOG_TYPE_META[logType];
    const kmlColor = hexToKmlColor(meta.color);
    lines.push(`    <Style id="ecs-log-${logType}">`);
    lines.push('      <IconStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <scale>0.9</scale>');
    lines.push('        <Icon>');
    lines.push(`          <href>${kmlIconForLogType(logType)}</href>`);
    lines.push('        </Icon>');
    lines.push('      </IconStyle>');
    lines.push('      <LabelStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <scale>0.8</scale>');
    lines.push('      </LabelStyle>');
    lines.push('    </Style>');
  }

  // Route line styles (one per route, cycling through colors)
  for (let ri = 0; ri < data.routes.length; ri++) {
    const routeColor = KML_ROUTE_COLORS[ri % KML_ROUTE_COLORS.length];
    const kmlColor = hexToKmlColor(routeColor);
    lines.push(`    <Style id="ecs-route-${ri}">`);
    lines.push('      <LineStyle>');
    lines.push(`        <color>${kmlColor}</color>`);
    lines.push('        <width>3.5</width>');
    lines.push('      </LineStyle>');
    lines.push('      <PolyStyle>');
    lines.push(`        <color>${hexToKmlColor(routeColor, '40')}</color>`);
    lines.push('      </PolyStyle>');
    lines.push('    </Style>');
  }

  // ── Waypoints Folder ──────────────────────────────────
  const geoWaypoints = data.waypoints.filter(wp => wp.lat != null && wp.lng != null);
  if (geoWaypoints.length > 0) {
    lines.push('    <Folder>');
    lines.push('      <name>Waypoints</name>');
    lines.push(`      <description>Expedition waypoints (${geoWaypoints.length} total)</description>`);
    lines.push('      <open>1</open>');

    for (let wi = 0; wi < geoWaypoints.length; wi++) {
      const wp = geoWaypoints[wi];
      const kindMeta = WAYPOINT_KIND_META[wp.kind];
      const name = wp.title || kindMeta?.label || `Waypoint ${wi + 1}`;

      lines.push('      <Placemark>');
      lines.push(`        <name>${escapeXml(name)}</name>`);

      // Rich description with HTML
      const wpDescParts: string[] = [];
      wpDescParts.push(`<b>Type:</b> ${escapeXml(kindMeta?.label || wp.kind)}`);
      if (wp.meta?.description) wpDescParts.push(`<b>Notes:</b> ${escapeXml(String(wp.meta.description))}`);
      if (wp.meta?.elevation != null) wpDescParts.push(`<b>Elevation:</b> ${Number(wp.meta.elevation).toFixed(0)} ft`);
      wpDescParts.push(`<b>Coordinates:</b> ${wp.lat!.toFixed(6)}, ${wp.lng!.toFixed(6)}`);
      if (wp.occurred_at) wpDescParts.push(`<b>Time:</b> ${wp.occurred_at}`);
      wpDescParts.push(`<br/><i>Exported from ECS</i>`);
      lines.push(`        <description><![CDATA[${wpDescParts.join('<br/>')}]]></description>`);

      lines.push(`        <styleUrl>#ecs-wp-${wp.kind}</styleUrl>`);

      // Timestamp
      if (wp.occurred_at || wp.created_at) {
        lines.push('        <TimeStamp>');
        lines.push(`          <when>${escapeXml(wp.occurred_at || wp.created_at)}</when>`);
        lines.push('        </TimeStamp>');
      }

      // Extended data — all ECS metadata properties
      lines.push('        <ExtendedData>');
      lines.push(`          <Data name="ecs_kind"><value>${escapeXml(wp.kind)}</value></Data>`);
      lines.push(`          <Data name="ecs_kind_label"><value>${escapeXml(kindMeta?.label || wp.kind)}</value></Data>`);
      lines.push(`          <Data name="ecs_id"><value>${escapeXml(wp.id)}</value></Data>`);
      if (wp.route_id) {
        lines.push(`          <Data name="ecs_route_id"><value>${escapeXml(wp.route_id)}</value></Data>`);
      }
      if (kindMeta?.color) {
        lines.push(`          <Data name="ecs_display_color"><value>${kindMeta.color}</value></Data>`);
      }
      if (kindMeta?.icon) {
        lines.push(`          <Data name="ecs_display_icon"><value>${escapeXml(kindMeta.icon)}</value></Data>`);
      }
      if (wp.created_at) {
        lines.push(`          <Data name="ecs_created_at"><value>${escapeXml(wp.created_at)}</value></Data>`);
      }
      if (wp.occurred_at) {
        lines.push(`          <Data name="ecs_occurred_at"><value>${escapeXml(wp.occurred_at)}</value></Data>`);
      }
      // Serialize all waypoint meta properties into ExtendedData
      if (wp.meta && typeof wp.meta === 'object') {
        for (const [metaKey, metaVal] of Object.entries(wp.meta)) {
          if (metaVal == null) continue;
          const safeKey = metaKey.replace(/[^a-zA-Z0-9_-]/g, '_');
          const safeVal = typeof metaVal === 'object' ? JSON.stringify(metaVal) : String(metaVal);
          if (safeVal.length < 2000) {
            lines.push(`          <Data name="ecs_meta_${escapeXml(safeKey)}"><value>${escapeXml(safeVal)}</value></Data>`);
          }
        }
      }
      lines.push('        </ExtendedData>');


      // Point geometry
      const ele = wp.meta?.elevation != null ? Number(wp.meta.elevation) : 0;
      lines.push('        <Point>');
      lines.push('          <altitudeMode>clampToGround</altitudeMode>');
      lines.push(`          <coordinates>${wp.lng!.toFixed(8)},${wp.lat!.toFixed(8)},${ele.toFixed(1)}</coordinates>`);
      lines.push('        </Point>');
      lines.push('      </Placemark>');
    }

    lines.push('    </Folder>');
  }

  // ── Routes Folder ─────────────────────────────────────
  const geoRoutes = data.routes.filter(r => r.geojson);
  if (geoRoutes.length > 0) {
    lines.push('    <Folder>');
    lines.push('      <name>Routes</name>');
    lines.push(`      <description>Expedition routes (${geoRoutes.length} total)</description>`);
    lines.push('      <open>1</open>');

    for (let ri = 0; ri < data.routes.length; ri++) {
      const route = data.routes[ri];
      if (!route.geojson) continue;

      const segments = groupIntoSegments(route.geojson);
      const extracted = extractTracksFromGeoJSON(route.geojson);

      // ── Route LineString Placemarks ───────────────────
      if (segments.length > 0) {
        for (let si = 0; si < segments.length; si++) {
          const segment = segments[si];
          const segName = segments.length > 1
            ? `${route.name} - Segment ${si + 1}`
            : route.name;

          lines.push('      <Placemark>');
          lines.push(`        <name>${escapeXml(segName)}</name>`);

          // Description
          const routeDescParts: string[] = [];
          if (route.source) routeDescParts.push(`<b>Source:</b> ${escapeXml(route.source)}`);
          if (route.distance_mi != null) routeDescParts.push(`<b>Distance:</b> ${route.distance_mi} mi`);
          if (route.eta_hours != null) routeDescParts.push(`<b>ETA:</b> ${route.eta_hours} hrs`);
          routeDescParts.push(`<b>Points:</b> ${segment.length}`);
          routeDescParts.push(`<br/><i>Exported from ECS</i>`);
          lines.push(`        <description><![CDATA[${routeDescParts.join('<br/>')}]]></description>`);

          lines.push(`        <styleUrl>#ecs-route-${ri}</styleUrl>`);

          // Extended data — all ECS route metadata properties
          lines.push('        <ExtendedData>');
          lines.push(`          <Data name="ecs_route_id"><value>${escapeXml(route.id)}</value></Data>`);
          lines.push(`          <Data name="ecs_route_name"><value>${escapeXml(route.name)}</value></Data>`);
          lines.push(`          <Data name="ecs_source"><value>${escapeXml(route.source || 'manual')}</value></Data>`);
          if (route.distance_mi != null) {
            lines.push(`          <Data name="ecs_distance_mi"><value>${route.distance_mi}</value></Data>`);
          }
          if (route.eta_hours != null) {
            lines.push(`          <Data name="ecs_eta_hours"><value>${route.eta_hours}</value></Data>`);
          }
          lines.push(`          <Data name="ecs_segment_index"><value>${si}</value></Data>`);
          lines.push(`          <Data name="ecs_segment_points"><value>${segment.length}</value></Data>`);
          if (route.created_at) {
            lines.push(`          <Data name="ecs_created_at"><value>${escapeXml(route.created_at)}</value></Data>`);
          }
          lines.push(`          <Data name="ecs_has_gpx"><value>${route.gpx ? 'true' : 'false'}</value></Data>`);
          lines.push(`          <Data name="ecs_has_geojson"><value>${route.geojson ? 'true' : 'false'}</value></Data>`);
          lines.push('        </ExtendedData>');


          // LineString geometry
          lines.push('        <LineString>');
          lines.push('          <tessellate>1</tessellate>');
          lines.push('          <altitudeMode>clampToGround</altitudeMode>');
          lines.push('          <coordinates>');

          const coordStrings: string[] = [];
          for (const coord of segment) {
            if (!Array.isArray(coord) || coord.length < 2) continue;
            const lon = coord[0];
            const lat = coord[1];
            const ele = coord.length > 2 && isFinite(coord[2]) ? coord[2] : 0;
            coordStrings.push(`            ${lon.toFixed(8)},${lat.toFixed(8)},${ele.toFixed(1)}`);
          }
          lines.push(coordStrings.join('\n'));

          lines.push('          </coordinates>');
          lines.push('        </LineString>');
          lines.push('      </Placemark>');
        }
      }

      // ── GeoJSON Point features → Point Placemarks ─────
      if (extracted.points.length > 0) {
        for (let pi = 0; pi < extracted.points.length; pi++) {
          const coord = extracted.points[pi];
          const lon = coord[0];
          const lat = coord[1];
          const ele = coord.length > 2 && isFinite(coord[2]) ? coord[2] : 0;

          lines.push('      <Placemark>');
          lines.push(`        <name>${escapeXml(route.name)} - Point ${pi + 1}</name>`);
          lines.push('        <styleUrl>#ecs-wp-waypoint</styleUrl>');
          lines.push('        <Point>');
          lines.push('          <altitudeMode>clampToGround</altitudeMode>');
          lines.push(`          <coordinates>${lon.toFixed(8)},${lat.toFixed(8)},${ele.toFixed(1)}</coordinates>`);
          lines.push('        </Point>');
          lines.push('      </Placemark>');
        }
      }
    }

    lines.push('    </Folder>');
  }

  // ── Field Logs Folder ─────────────────────────────────
  const geoLogs = data.fieldLogs.filter(log => log.lat != null && log.lng != null);
  if (geoLogs.length > 0) {
    lines.push('    <Folder>');
    lines.push('      <name>Field Logs</name>');
    lines.push(`      <description>Geotagged field log entries (${geoLogs.length} total)</description>`);
    lines.push('      <open>0</open>');

    for (const log of geoLogs) {
      const typeMeta = FIELD_LOG_TYPE_META[log.type];
      const name = log.title || typeMeta?.label || 'Log Entry';

      lines.push('      <Placemark>');
      lines.push(`        <name>${escapeXml(name)}</name>`);

      // Description
      const logDescParts: string[] = [];
      logDescParts.push(`<b>Type:</b> ${escapeXml(typeMeta?.label || log.type)}`);
      if (log.body) logDescParts.push(`<b>Notes:</b> ${escapeXml(log.body)}`);
      logDescParts.push(`<b>Coordinates:</b> ${log.lat!.toFixed(6)}, ${log.lng!.toFixed(6)}`);
      logDescParts.push(`<b>Time:</b> ${log.occurred_at}`);
      logDescParts.push(`<br/><i>Exported from ECS</i>`);
      lines.push(`        <description><![CDATA[${logDescParts.join('<br/>')}]]></description>`);

      lines.push(`        <styleUrl>#ecs-log-${log.type}</styleUrl>`);

      // Timestamp
      lines.push('        <TimeStamp>');
      lines.push(`          <when>${escapeXml(log.occurred_at)}</when>`);
      lines.push('        </TimeStamp>');

      // Extended data — all ECS metadata properties
      lines.push('        <ExtendedData>');
      lines.push(`          <Data name="ecs_log_type"><value>${escapeXml(log.type)}</value></Data>`);
      lines.push(`          <Data name="ecs_log_type_label"><value>${escapeXml(typeMeta?.label || log.type)}</value></Data>`);
      lines.push(`          <Data name="ecs_log_id"><value>${escapeXml(log.id)}</value></Data>`);
      if (typeMeta?.color) {
        lines.push(`          <Data name="ecs_display_color"><value>${typeMeta.color}</value></Data>`);
      }
      if (typeMeta?.icon) {
        lines.push(`          <Data name="ecs_display_icon"><value>${escapeXml(typeMeta.icon)}</value></Data>`);
      }
      if (log.body) {
        lines.push(`          <Data name="ecs_body"><value>${escapeXml(log.body)}</value></Data>`);
      }
      if (log.created_at) {
        lines.push(`          <Data name="ecs_created_at"><value>${escapeXml(log.created_at)}</value></Data>`);
      }
      lines.push(`          <Data name="ecs_occurred_at"><value>${escapeXml(log.occurred_at)}</value></Data>`);
      // Serialize all field log meta properties into ExtendedData
      if (log.meta && typeof log.meta === 'object') {
        for (const [metaKey, metaVal] of Object.entries(log.meta)) {
          if (metaVal == null) continue;
          const safeKey = metaKey.replace(/[^a-zA-Z0-9_-]/g, '_');
          const safeVal = typeof metaVal === 'object' ? JSON.stringify(metaVal) : String(metaVal);
          if (safeVal.length < 2000) {
            lines.push(`          <Data name="ecs_meta_${escapeXml(safeKey)}"><value>${escapeXml(safeVal)}</value></Data>`);
          }
        }
      }
      lines.push('        </ExtendedData>');


      // Point geometry
      lines.push('        <Point>');
      lines.push('          <altitudeMode>clampToGround</altitudeMode>');
      lines.push(`          <coordinates>${log.lng!.toFixed(8)},${log.lat!.toFixed(8)},0</coordinates>`);
      lines.push('        </Point>');
      lines.push('      </Placemark>');
    }

    lines.push('    </Folder>');
  }


  // ── Checklists Folder (non-geographic metadata) ───────
  // Checklists don't have coordinates but are included as
  // a metadata Folder with ExtendedData for round-trip fidelity
  if (data.checklists.length > 0) {
    lines.push('    <Folder>');
    lines.push('      <name>Checklists</name>');
    lines.push(`      <description>Expedition checklist items (${data.checklists.length} total, ${data.checklists.filter(i => i.is_done).length} completed)</description>`);
    lines.push('      <open>0</open>');
    lines.push('      <visibility>0</visibility>');

    // Group by category
    const categories = [...new Set(data.checklists.map(i => i.category || 'general'))];
    for (const category of categories) {
      const catItems = data.checklists.filter(i => (i.category || 'general') === category);
      lines.push('      <Folder>');
      lines.push(`        <name>${escapeXml(category.charAt(0).toUpperCase() + category.slice(1))}</name>`);
      lines.push(`        <description>${catItems.length} items (${catItems.filter(i => i.is_done).length} done)</description>`);
      lines.push('        <open>0</open>');

      for (const item of catItems) {
        lines.push('        <Placemark>');
        lines.push(`          <name>${escapeXml(item.title)}</name>`);

        const itemDescParts: string[] = [];
        itemDescParts.push(`<b>Status:</b> ${item.is_done ? 'DONE' : 'PENDING'}`);
        itemDescParts.push(`<b>Priority:</b> ${item.priority}`);
        itemDescParts.push(`<b>Category:</b> ${category}`);
        if (item.done_at) itemDescParts.push(`<b>Completed:</b> ${item.done_at}`);
        itemDescParts.push(`<br/><i>ECS Checklist Item</i>`);
        lines.push(`          <description><![CDATA[${itemDescParts.join('<br/>')}]]></description>`);

        lines.push('          <ExtendedData>');
        lines.push(`            <Data name="ecs_checklist_id"><value>${escapeXml(item.id)}</value></Data>`);
        lines.push(`            <Data name="ecs_checklist_title"><value>${escapeXml(item.title)}</value></Data>`);
        lines.push(`            <Data name="ecs_checklist_category"><value>${escapeXml(category)}</value></Data>`);
        lines.push(`            <Data name="ecs_checklist_priority"><value>${escapeXml(item.priority)}</value></Data>`);
        lines.push(`            <Data name="ecs_checklist_is_done"><value>${item.is_done ? 'true' : 'false'}</value></Data>`);
        if (item.done_at) {
          lines.push(`            <Data name="ecs_checklist_done_at"><value>${escapeXml(item.done_at)}</value></Data>`);
        }
        lines.push(`            <Data name="ecs_checklist_created_at"><value>${escapeXml(item.created_at)}</value></Data>`);
        lines.push('          </ExtendedData>');
        lines.push('        </Placemark>');
      }

      lines.push('      </Folder>');
    }

    lines.push('    </Folder>');
  }

  // ── Close Document & KML ──────────────────────────────
  lines.push('  </Document>');
  lines.push('</kml>');

  return lines.join('\n');
}

/**
 * Generate KML 2.2 XML from expedition data.
 * This is the public API name for KML generation.
 * Alias for formatAsKML — use either name interchangeably.
 *
 * @see formatAsKML for full documentation
 */
export const generateKML = formatAsKML;




// ════════════════════════════════════════════════════════════
// GeoJSON FORMATTER — Native FeatureCollection Export
// ════════════════════════════════════════════════════════════
// Generates a valid RFC 7946 GeoJSON FeatureCollection from
// expedition data. Since ECS routes already store geometry as
// GeoJSON internally, route data is a direct passthrough with
// enriched properties. Waypoints and field logs become Point
// Features. Compatible with Mapbox, Leaflet, D3, Turf.js,
// QGIS, ArcGIS, Kepler.gl, deck.gl, and any GeoJSON consumer.
// ════════════════════════════════════════════════════════════

/** Color palette for waypoint kinds in GeoJSON properties */
const GEOJSON_WAYPOINT_COLORS: Record<string, string> = {
  waypoint: '#A0A0A0',
  camp: '#4CAF50',
  fuel: '#FF5722',
  water: '#2196F3',
  hazard: '#FFC107',
  note: '#9C27B0',
  incident: '#F44336',
};

/** Color palette for route lines in GeoJSON properties */
const GEOJSON_ROUTE_COLORS = [
  '#C48A2C', // amber
  '#4CAF50', // green
  '#42A5F5', // blue
  '#FF7043', // orange
  '#CE93D8', // purple
  '#4FC3F7', // cyan
  '#EF5350', // red
  '#66BB6A', // light green
];

/** Color palette for field log types in GeoJSON properties */
const GEOJSON_LOG_COLORS: Record<string, string> = {
  note: '#90CAF9',
  marker: '#42A5F5',
  incident: '#EF5350',
  resource: '#66BB6A',
  maintenance: '#FFC107',
  comms: '#4FC3F7',
  medical: '#F48FB1',
};

/** Marker symbol names for waypoint kinds (Mapbox/Maki compatible) */
const GEOJSON_MARKER_SYMBOLS: Record<string, string> = {
  waypoint: 'marker',
  camp: 'campsite',
  fuel: 'fuel',
  water: 'drinking-water',
  hazard: 'danger',
  note: 'information',
  incident: 'emergency-phone',
};

/** Marker symbol names for field log types */
const GEOJSON_LOG_SYMBOLS: Record<string, string> = {
  note: 'information',
  marker: 'marker',
  incident: 'danger',
  resource: 'warehouse',
  maintenance: 'car-repair',
  comms: 'communications-tower',
  medical: 'hospital',
};

/**
 * Count GeoJSON elements that will be generated. Used for preview.
 */
export function countGeoJsonElements(data: ExpeditionExportData): {
  pointFeatureCount: number;
  lineFeatureCount: number;
  polygonFeatureCount: number;
  fieldLogFeatureCount: number;
  totalFeatureCount: number;
  passthroughRouteCount: number;
} {
  let pointFeatureCount = 0;
  let lineFeatureCount = 0;
  let polygonFeatureCount = 0;
  let fieldLogFeatureCount = 0;
  let passthroughRouteCount = 0;

  // Waypoints with coordinates → Point features
  for (const wp of data.waypoints) {
    if (wp.lat != null && wp.lng != null) {
      pointFeatureCount++;
    }
  }

  // Field logs with coordinates → Point features
  for (const log of data.fieldLogs) {
    if (log.lat != null && log.lng != null) {
      fieldLogFeatureCount++;
    }
  }

  // Routes with GeoJSON → passthrough features
  for (const route of data.routes) {
    if (route.geojson) {
      passthroughRouteCount++;
      const geojson = route.geojson;

      // Count geometry types from the existing GeoJSON
      if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        for (const feature of geojson.features) {
          const geomType = feature?.geometry?.type;
          if (geomType === 'Point' || geomType === 'MultiPoint') pointFeatureCount++;
          else if (geomType === 'LineString' || geomType === 'MultiLineString') lineFeatureCount++;
          else if (geomType === 'Polygon' || geomType === 'MultiPolygon') polygonFeatureCount++;
        }
      } else if (geojson.type === 'Feature') {
        const geomType = geojson.geometry?.type;
        if (geomType === 'Point' || geomType === 'MultiPoint') pointFeatureCount++;
        else if (geomType === 'LineString' || geomType === 'MultiLineString') lineFeatureCount++;
        else if (geomType === 'Polygon' || geomType === 'MultiPolygon') polygonFeatureCount++;
      } else if (geojson.type) {
        // Bare geometry
        if (geojson.type === 'Point' || geojson.type === 'MultiPoint') pointFeatureCount++;
        else if (geojson.type === 'LineString' || geojson.type === 'MultiLineString') lineFeatureCount++;
        else if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') polygonFeatureCount++;
      }
    }
  }

  const totalFeatureCount = pointFeatureCount + lineFeatureCount + polygonFeatureCount + fieldLogFeatureCount;

  return {
    pointFeatureCount,
    lineFeatureCount,
    polygonFeatureCount,
    fieldLogFeatureCount,
    totalFeatureCount,
    passthroughRouteCount,
  };
}

/**
 * Compute a GeoJSON bbox [minLon, minLat, maxLon, maxLat] from all data.
 */
function computeGeoJsonBbox(data: ExpeditionExportData): [number, number, number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let hasCoords = false;

  function addCoord(lon: number, lat: number): void {
    if (!isFinite(lon) || !isFinite(lat)) return;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    hasCoords = true;
  }

  // Waypoints
  for (const wp of data.waypoints) {
    if (wp.lat != null && wp.lng != null) {
      addCoord(wp.lng, wp.lat);
    }
  }

  // Field logs
  for (const log of data.fieldLogs) {
    if (log.lat != null && log.lng != null) {
      addCoord(log.lng, log.lat);
    }
  }

  // Route GeoJSON coordinates
  for (const route of data.routes) {
    if (route.geojson) {
      const { tracks, points } = extractTracksFromGeoJSON(route.geojson);
      for (const coord of tracks) {
        addCoord(coord[0], coord[1]); // GeoJSON is [lon, lat]
      }
      for (const coord of points) {
        addCoord(coord[0], coord[1]);
      }
    }
  }

  if (!hasCoords) return null;
  return [
    parseFloat(minLon.toFixed(8)),
    parseFloat(minLat.toFixed(8)),
    parseFloat(maxLon.toFixed(8)),
    parseFloat(maxLat.toFixed(8)),
  ];
}

/**
 * Enrich a GeoJSON Feature from a route's existing geojson with ECS properties.
 * If the route stores a bare geometry, wraps it in a Feature.
 * If it stores a FeatureCollection, enriches each Feature's properties.
 */
function enrichRouteFeatures(
  route: EcsRoute,
  routeIndex: number,
): Record<string, any>[] {
  const geojson = route.geojson;
  if (!geojson) return [];

  const baseProps: Record<string, any> = {
    'ecs:featureSource': 'route',
    'ecs:routeId': route.id,
    'ecs:routeName': route.name,
    'ecs:routeSource': route.source || 'manual',
    'ecs:distanceMi': route.distance_mi,
    'ecs:etaHours': route.eta_hours,
    'ecs:routeIndex': routeIndex,
    'stroke': GEOJSON_ROUTE_COLORS[routeIndex % GEOJSON_ROUTE_COLORS.length],
    'stroke-width': 3,
    'stroke-opacity': 0.85,
    'fill': GEOJSON_ROUTE_COLORS[routeIndex % GEOJSON_ROUTE_COLORS.length],
    'fill-opacity': 0.15,
  };

  const features: Record<string, any>[] = [];

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    // Enrich each existing Feature with ECS properties
    for (let fi = 0; fi < geojson.features.length; fi++) {
      const feature = geojson.features[fi];
      if (!feature || !feature.geometry) continue;

      features.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          ...baseProps,
          ...(feature.properties || {}),
          'ecs:featureIndex': fi,
        },
      });
    }
  } else if (geojson.type === 'Feature' && geojson.geometry) {
    // Single Feature — enrich properties
    features.push({
      type: 'Feature',
      geometry: geojson.geometry,
      properties: {
        ...baseProps,
        ...(geojson.properties || {}),
      },
    });
  } else if (geojson.type && geojson.coordinates) {
    // Bare geometry — wrap in a Feature
    features.push({
      type: 'Feature',
      geometry: {
        type: geojson.type,
        coordinates: geojson.coordinates,
      },
      properties: { ...baseProps },
    });
  } else if (geojson.type === 'GeometryCollection' && Array.isArray(geojson.geometries)) {
    // GeometryCollection — wrap in a Feature
    features.push({
      type: 'Feature',
      geometry: geojson,
      properties: { ...baseProps },
    });
  }

  return features;
}

/**
 * Format expedition data as a GeoJSON FeatureCollection (RFC 7946).
 *
 * Converts:
 *   - EcsWaypoint records → Feature with Point geometry
 *   - Geotagged EcsFieldLog entries → Feature with Point geometry
 *   - EcsRoute geojson data → Direct passthrough as enriched Features
 *     (preserves original geometry: LineString, MultiLineString, Polygon, etc.)
 *
 * The output is a valid RFC 7946 GeoJSON FeatureCollection with:
 *   - `bbox` computed from all coordinates
 *   - Top-level custom properties for ECS metadata
 *   - Per-feature `properties` with ECS metadata, styling hints
 *     (marker-color, marker-symbol, stroke, stroke-width for renderers)
 *   - Mapbox/Maki-compatible symbol names
 *   - simplestyle-spec compatible properties for GitHub, Mapbox, etc.
 *
 * Compatible with:
 *   Mapbox GL JS, Leaflet, D3.js, Turf.js, OpenLayers, Kepler.gl,
 *   deck.gl, QGIS, ArcGIS, Google Earth (via conversion), geojson.io,
 *   GitHub (renders GeoJSON in repos), and any RFC 7946 consumer.
 */
export function formatAsGeoJSON(data: ExpeditionExportData): string {
  const now = new Date().toISOString();
  const expeditionTitle = data.expedition?.title || 'ECS Expedition';
  const features: Record<string, any>[] = [];

  // ── Waypoint Features (Point geometry) ────────────────
  const geoWaypoints = data.waypoints.filter(wp => wp.lat != null && wp.lng != null);
  for (let wi = 0; wi < geoWaypoints.length; wi++) {
    const wp = geoWaypoints[wi];
    const kindMeta = WAYPOINT_KIND_META[wp.kind];
    const name = wp.title || kindMeta?.label || `Waypoint ${wi + 1}`;
    const color = GEOJSON_WAYPOINT_COLORS[wp.kind] || '#A0A0A0';
    const symbol = GEOJSON_MARKER_SYMBOLS[wp.kind] || 'marker';

    const feature: Record<string, any> = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: wp.meta?.elevation != null
          ? [wp.lng!, wp.lat!, Number(wp.meta.elevation)]
          : [wp.lng!, wp.lat!],
      },
      properties: {
        // ── Identity ────────────────────────────────────
        'ecs:featureSource': 'waypoint',
        'ecs:waypointId': wp.id,
        'ecs:waypointKind': wp.kind,
        'ecs:waypointKindLabel': kindMeta?.label || wp.kind,
        'ecs:routeId': wp.route_id || null,

        // ── Display name ────────────────────────────────
        name: name,
        title: name,
        description: wp.meta?.description || null,

        // ── Timestamps ──────────────────────────────────
        'ecs:occurredAt': wp.occurred_at || null,
        'ecs:createdAt': wp.created_at,

        // ── simplestyle-spec (GitHub, Mapbox, geojson.io) ─
        'marker-color': color,
        'marker-size': 'medium',
        'marker-symbol': symbol,

        // ── Elevation ───────────────────────────────────
        ...(wp.meta?.elevation != null ? { 'ecs:elevation': Number(wp.meta.elevation) } : {}),

        // ── Additional meta ─────────────────────────────
        ...(wp.meta ? Object.fromEntries(
          Object.entries(wp.meta)
            .filter(([k]) => k !== 'description' && k !== 'elevation')
            .map(([k, v]) => [`ecs:meta:${k}`, v])
        ) : {}),
      },
    };

    // Add id at Feature level (RFC 7946 §3.2)
    feature.id = wp.id;

    features.push(feature);
  }

  // ── Route Features (passthrough from stored GeoJSON) ──
  for (let ri = 0; ri < data.routes.length; ri++) {
    const route = data.routes[ri];
    const enriched = enrichRouteFeatures(route, ri);
    features.push(...enriched);
  }

  // ── Field Log Features (Point geometry) ───────────────
  const geoLogs = data.fieldLogs.filter(log => log.lat != null && log.lng != null);
  for (let li = 0; li < geoLogs.length; li++) {
    const log = geoLogs[li];
    const typeMeta = FIELD_LOG_TYPE_META[log.type];
    const name = log.title || typeMeta?.label || `Log Entry ${li + 1}`;
    const color = GEOJSON_LOG_COLORS[log.type] || '#90CAF9';
    const symbol = GEOJSON_LOG_SYMBOLS[log.type] || 'information';

    const feature: Record<string, any> = {
      type: 'Feature',
      id: log.id,
      geometry: {
        type: 'Point',
        coordinates: [log.lng!, log.lat!],
      },
      properties: {
        // ── Identity ────────────────────────────────────
        'ecs:featureSource': 'fieldLog',
        'ecs:fieldLogId': log.id,
        'ecs:fieldLogType': log.type,
        'ecs:fieldLogTypeLabel': typeMeta?.label || log.type,

        // ── Display ─────────────────────────────────────
        name: name,
        title: name,
        description: log.body || null,

        // ── Timestamps ──────────────────────────────────
        'ecs:occurredAt': log.occurred_at,
        'ecs:createdAt': log.created_at,

        // ── simplestyle-spec ────────────────────────────
        'marker-color': color,
        'marker-size': 'small',
        'marker-symbol': symbol,

        // ── Additional meta ─────────────────────────────
        ...(log.meta ? Object.fromEntries(
          Object.entries(log.meta).map(([k, v]) => [`ecs:meta:${k}`, v])
        ) : {}),
      },
    };

    features.push(feature);
  }

  // ── Build FeatureCollection ───────────────────────────
  const featureCollection: Record<string, any> = {
    type: 'FeatureCollection',
    features,
  };

  // ── bbox (RFC 7946 §5) ────────────────────────────────
  const bbox = computeGeoJsonBbox(data);
  if (bbox) {
    featureCollection.bbox = bbox;
  }

  // ── Top-level ECS metadata (foreign members per RFC 7946 §6.1) ──
  // These are non-standard but widely supported by GeoJSON consumers
  featureCollection['ecs:exportMeta'] = {
    exportedAt: now,
    appVersion: '1.0.0',
    platform: data.exportMeta.platform,
    generator: 'Expedition Command System',
    generatorUrl: 'https://expeditioncommand.app',
    format: 'geojson',
    featureCount: features.length,
  };

  if (data.expedition) {
    featureCollection['ecs:expedition'] = {
      id: data.expedition.id,
      title: data.expedition.title,
      status: data.expedition.status,
      terrain: data.expedition.terrain,
      terrainLabel: TERRAIN_OPTIONS.find(t => t.value === data.expedition!.terrain)?.label || data.expedition.terrain,
      durationDays: data.expedition.duration_days,
      distanceFromServicesMi: data.expedition.distance_from_services_mi,
      startAt: data.expedition.start_at,
      endAt: data.expedition.end_at,
      notes: data.expedition.notes,
    };
  }

  if (data.readiness) {
    featureCollection['ecs:readiness'] = {
      score: data.readiness.score,
      totalItems: data.readiness.totalItems,
      completedItems: data.readiness.completedItems,
      criticalIncomplete: data.readiness.criticalIncomplete,
      breakdown: data.readiness.breakdown,
    };
  }

  // ── Feature summary by source type ────────────────────
  const waypointFeatures = features.filter(f => f.properties?.['ecs:featureSource'] === 'waypoint');
  const routeFeatures = features.filter(f => f.properties?.['ecs:featureSource'] === 'route');
  const logFeatures = features.filter(f => f.properties?.['ecs:featureSource'] === 'fieldLog');

  featureCollection['ecs:summary'] = {
    totalFeatures: features.length,
    waypointFeatures: waypointFeatures.length,
    routeFeatures: routeFeatures.length,
    fieldLogFeatures: logFeatures.length,
    waypointKinds: [...new Set(waypointFeatures.map(f => f.properties?.['ecs:waypointKind']))],
    fieldLogTypes: [...new Set(logFeatures.map(f => f.properties?.['ecs:fieldLogType']))],
    routeNames: data.routes.filter(r => r.geojson).map(r => r.name),
  };

  // ── Checklist summary (non-geographic but useful context) ──
  if (data.checklists.length > 0) {
    featureCollection['ecs:checklists'] = {
      totalItems: data.checklists.length,
      completedItems: data.checklists.filter(i => i.is_done).length,
      categories: [...new Set(data.checklists.map(i => i.category || 'general'))],
      items: data.checklists.map(item => ({
        id: item.id,
        title: item.title,
        category: item.category || 'general',
        priority: item.priority,
        isDone: item.is_done,
        doneAt: item.done_at,
      })),
    };
  }

  return JSON.stringify(featureCollection, null, 2);
}

