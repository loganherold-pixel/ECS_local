/**
 * ECS Run Store — Offline-First Run Management
 *
 * Manages ECS Runs: imported GPX routes tied to vehicle + loadout snapshots.
 * Computes route distance (Haversine), build-aware warnings, and run health.
 *
 * Storage: localStorage (web) / memory (native) — works offline after import.
 * Cloud sync: Supabase ecs_runs + ecs_run_points tables (when authenticated).
 *
 * Phase 1: SVG polyline rendering (no map tiles).
 * Phase 2: Mapbox tile rendering (same data model).
 */

import { Platform } from 'react-native';
import { parseGPX, type ImportedRoute, type RouteWaypoint } from './routeStore';

// ── Storage helpers ─────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const nowISO = () => new Date().toISOString();

// ── Haversine Distance (meters) ─────────────────────────
const EARTH_RADIUS_M = 6371000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function metersToMiles(m: number): number {
  return m * 0.000621371;
}

export function metersToKm(m: number): number {
  return m / 1000;
}

// ── Types ───────────────────────────────────────────────

export interface BuildSnapshot {
  vehicle_name: string;
  vehicle_id: string | null;
  estimated_range_miles: number;
  total_weight_lb: number;
  roof_weight_lb: number;
  hitch_weight_lb: number;
  limits: {
    roof_limit_lb: number;
    hitch_limit_lb: number;
  };
  captured_at: string;
}

export interface RunStats {
  distance_m: number;
  distance_miles: number;
  distance_km: number;
  point_count: number;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  elevation_gain_ft: number | null;
  elevation_loss_ft: number | null;
  min_ele_ft: number | null;
  max_ele_ft: number | null;
}

export type RunPointType = 'route' | 'track';

export interface RunPoint {
  idx: number;
  lat: number;
  lng: number;
  ele_m: number | null;
  time: string | null;
  type: RunPointType;
}

export type RunHealthLevel = 'green' | 'yellow' | 'red';

export interface RunHealthResult {
  overall: RunHealthLevel;
  range: { level: RunHealthLevel; message: string } | null;
  roof: { level: RunHealthLevel; message: string } | null;
  hitch: { level: RunHealthLevel; message: string } | null;
  warnings: string[];
}

export interface ECSRun {
  id: string;
  user_id: string | null;
  title: string;
  source: string;
  created_at: string;
  updated_at: string;
  vehicle_id: string | null;
  build_snapshot: BuildSnapshot;
  stats: RunStats;
  points: RunPoint[];
  waypoints: RouteWaypoint[];
  is_active: boolean;
}

// ── Storage keys ────────────────────────────────────────
const LS_RUNS = 'ecs_local_runs';

function getLocalRuns(): ECSRun[] {
  const raw = lsGet(LS_RUNS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalRuns(runs: ECSRun[]): void {
  lsSet(LS_RUNS, JSON.stringify(runs));
}

// ── Distance Calculation ────────────────────────────────

function computeStatsFromPoints(points: RunPoint[]): RunStats {
  let distance_m = 0;
  let elevGain = 0;
  let elevLoss = 0;
  let hasEle = false;
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    distance_m += haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng);

    if (p1.ele_m != null && p2.ele_m != null) {
      hasEle = true;
      const diff = p2.ele_m - p1.ele_m;
      if (diff > 0) elevGain += diff;
      else elevLoss += Math.abs(diff);
      minEle = Math.min(minEle, p1.ele_m, p2.ele_m);
      maxEle = Math.max(maxEle, p1.ele_m, p2.ele_m);
    }
  }

  if (points.length === 1 && points[0].ele_m != null) {
    hasEle = true;
    minEle = points[0].ele_m;
    maxEle = points[0].ele_m;
  }

  const startPt = points.length > 0 ? points[0] : null;
  const endPt = points.length > 1 ? points[points.length - 1] : startPt;

  return {
    distance_m: Math.round(distance_m * 100) / 100,
    distance_miles: Math.round(metersToMiles(distance_m) * 100) / 100,
    distance_km: Math.round(metersToKm(distance_m) * 100) / 100,
    point_count: points.length,
    start_lat: startPt?.lat ?? null,
    start_lng: startPt?.lng ?? null,
    end_lat: endPt?.lat ?? null,
    end_lng: endPt?.lng ?? null,
    elevation_gain_ft: hasEle ? Math.round(elevGain * 3.281) : null,
    elevation_loss_ft: hasEle ? Math.round(elevLoss * 3.281) : null,
    min_ele_ft: hasEle && minEle !== Infinity ? Math.round(minEle * 3.281) : null,
    max_ele_ft: hasEle && maxEle !== -Infinity ? Math.round(maxEle * 3.281) : null,
  };
}

// ── Health Logic ────────────────────────────────────────

export function computeRunHealth(run: ECSRun): RunHealthResult {
  const { stats, build_snapshot: bs } = run;
  const warnings: string[] = [];
  let overall: RunHealthLevel = 'green';

  let range: RunHealthResult['range'] = null;
  if (bs.estimated_range_miles > 0 && stats.distance_miles > 0) {
    const ratio = stats.distance_miles / bs.estimated_range_miles;
    if (ratio > 1) {
      range = {
        level: 'red',
        message: `Route exceeds range by ${Math.round((ratio - 1) * 100)}%`,
      };
      warnings.push(
        `RANGE CRITICAL: ${stats.distance_miles.toFixed(1)} mi route > ${bs.estimated_range_miles} mi range`
      );
      overall = 'red';
    } else if (ratio > 0.8) {
      range = {
        level: 'yellow',
        message: `Route uses ${Math.round(ratio * 100)}% of range`,
      };
      warnings.push(`RANGE CAUTION: ${Math.round(ratio * 100)}% of estimated range`);
      if (overall !== 'red') overall = 'yellow';
    } else {
      range = { level: 'green', message: `${Math.round(ratio * 100)}% of range` };
    }
  }

  let roof: RunHealthResult['roof'] = null;
  if (bs.limits.roof_limit_lb > 0) {
    if (bs.roof_weight_lb > bs.limits.roof_limit_lb) {
      roof = {
        level: 'red',
        message: `Roof ${bs.roof_weight_lb} lb > ${bs.limits.roof_limit_lb} lb limit`,
      };
      warnings.push(`ROOF OVERWEIGHT: ${bs.roof_weight_lb} lb / ${bs.limits.roof_limit_lb} lb`);
      overall = 'red';
    } else if (bs.roof_weight_lb > bs.limits.roof_limit_lb * 0.8) {
      roof = {
        level: 'yellow',
        message: `Roof at ${Math.round((bs.roof_weight_lb / bs.limits.roof_limit_lb) * 100)}%`,
      };
      if (overall !== 'red') overall = 'yellow';
    } else {
      roof = { level: 'green', message: `Roof ${bs.roof_weight_lb} lb OK` };
    }
  }

  let hitch: RunHealthResult['hitch'] = null;
  if (bs.limits.hitch_limit_lb > 0) {
    if (bs.hitch_weight_lb > bs.limits.hitch_limit_lb) {
      hitch = {
        level: 'red',
        message: `Hitch ${bs.hitch_weight_lb} lb > ${bs.limits.hitch_limit_lb} lb limit`,
      };
      warnings.push(`HITCH OVERWEIGHT: ${bs.hitch_weight_lb} lb / ${bs.limits.hitch_limit_lb} lb`);
      overall = 'red';
    } else if (bs.hitch_weight_lb > bs.limits.hitch_limit_lb * 0.8) {
      hitch = {
        level: 'yellow',
        message: `Hitch at ${Math.round((bs.hitch_weight_lb / bs.limits.hitch_limit_lb) * 100)}%`,
      };
      if (overall !== 'red') overall = 'yellow';
    } else {
      hitch = { level: 'green', message: `Hitch ${bs.hitch_weight_lb} lb OK` };
    }
  }

  return { overall, range, roof, hitch, warnings };
}

// ── Default Build Snapshot ──────────────────────────────

export function createDefaultBuildSnapshot(): BuildSnapshot {
  return {
    vehicle_name: 'No Vehicle',
    vehicle_id: null,
    estimated_range_miles: 0,
    total_weight_lb: 0,
    roof_weight_lb: 0,
    hitch_weight_lb: 0,
    limits: {
      roof_limit_lb: 0,
      hitch_limit_lb: 0,
    },
    captured_at: nowISO(),
  };
}

// ── GPX Export from Run ─────────────────────────────────

export function generateRunGPX(run: ECSRun): string {
  const lines: string[] = [];
  const now = nowISO();

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx xmlns="http://www.topografix.com/GPX/1/1"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xmlns:ecs="http://expeditioncommand.app/gpx/extensions/1"' +
      ' creator="Expedition Command System"' +
      ' version="1.1"' +
      ' xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
  );

  lines.push('  <metadata>');
  lines.push(`    <name>${escapeXml(run.title)}</name>`);
  lines.push(`    <time>${now}</time>`);
  lines.push('    <extensions>');
  lines.push(`      <ecs:vehicleName>${escapeXml(run.build_snapshot.vehicle_name)}</ecs:vehicleName>`);
  lines.push(`      <ecs:totalWeightLb>${run.build_snapshot.total_weight_lb}</ecs:totalWeightLb>`);
  lines.push(`      <ecs:roofWeightLb>${run.build_snapshot.roof_weight_lb}</ecs:roofWeightLb>`);
  lines.push(`      <ecs:hitchWeightLb>${run.build_snapshot.hitch_weight_lb}</ecs:hitchWeightLb>`);
  lines.push('    </extensions>');
  lines.push('  </metadata>');

  for (const wp of run.waypoints) {
    lines.push(`  <wpt lat="${wp.lat.toFixed(8)}" lon="${wp.lon.toFixed(8)}">`);
    if (wp.ele != null) lines.push(`    <ele>${wp.ele.toFixed(1)}</ele>`);
    if (wp.name) lines.push(`    <name>${escapeXml(wp.name)}</name>`);
    if (wp.time) lines.push(`    <time>${wp.time}</time>`);
    lines.push('  </wpt>');
  }

  const routePoints = run.points.filter((p) => p.type === 'route');
  if (routePoints.length > 0) {
    lines.push('  <rte>');
    lines.push(`    <name>${escapeXml(run.title)}</name>`);
    for (const pt of routePoints) {
      lines.push(`    <rtept lat="${pt.lat.toFixed(8)}" lon="${pt.lng.toFixed(8)}">`);
      if (pt.ele_m != null) lines.push(`      <ele>${pt.ele_m.toFixed(1)}</ele>`);
      if (pt.time) lines.push(`      <time>${pt.time}</time>`);
      lines.push('    </rtept>');
    }
    lines.push('  </rte>');
  }

  const trackPoints = run.points.filter((p) => p.type === 'track');
  if (trackPoints.length > 0) {
    lines.push('  <trk>');
    lines.push(`    <name>${escapeXml(run.title)}</name>`);
    lines.push('    <trkseg>');
    for (const pt of trackPoints) {
      lines.push(`      <trkpt lat="${pt.lat.toFixed(8)}" lon="${pt.lng.toFixed(8)}">`);
      if (pt.ele_m != null) lines.push(`        <ele>${pt.ele_m.toFixed(1)}</ele>`);
      if (pt.time) lines.push(`        <time>${pt.time}</time>`);
      lines.push('      </trkpt>');
    }
    lines.push('    </trkseg>');
    lines.push('  </trk>');
  }

  lines.push('</gpx>');
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Import Normalization Helpers ────────────────────────

type NormalizedPointInput = {
  lat: number;
  lng: number;
  ele_m: number | null;
  time: string | null;
  type: RunPointType;
};

function toFiniteNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractLat(point: any): number | null {
  return (
    toFiniteNumber(point?.lat) ??
    toFiniteNumber(point?.latitude) ??
    null
  );
}

function extractLng(point: any): number | null {
  return (
    toFiniteNumber(point?.lng) ??
    toFiniteNumber(point?.lon) ??
    toFiniteNumber(point?.longitude) ??
    null
  );
}

function extractEle(point: any): number | null {
  return (
    toFiniteNumber(point?.ele_m) ??
    toFiniteNumber(point?.ele) ??
    toFiniteNumber(point?.elevation) ??
    null
  );
}

function extractTime(point: any): string | null {
  if (typeof point?.time === 'string') return point.time;
  if (typeof point?.ts === 'string') return point.ts;
  return null;
}

function normalizeRawPoints(rawPoints: any[], type: RunPointType): NormalizedPointInput[] {
  if (!Array.isArray(rawPoints)) return [];

  const out: NormalizedPointInput[] = [];

  for (const raw of rawPoints) {
    const lat = extractLat(raw);
    const lng = extractLng(raw);

    if (lat == null || lng == null) continue;

    out.push({
      lat,
      lng,
      ele_m: extractEle(raw),
      time: extractTime(raw),
      type,
    });
  }

  return out;
}

function dedupeSequentialPoints(points: NormalizedPointInput[]): NormalizedPointInput[] {
  if (points.length <= 1) return points;

  const out: NormalizedPointInput[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const next = points[i];

    if (
      prev.lat === next.lat &&
      prev.lng === next.lng &&
      prev.type === next.type &&
      prev.ele_m === next.ele_m &&
      prev.time === next.time
    ) {
      continue;
    }

    out.push(next);
  }

  return out;
}

function finalizeRunPoints(points: NormalizedPointInput[]): RunPoint[] {
  return dedupeSequentialPoints(points).map((pt, idx) => ({
    idx,
    lat: pt.lat,
    lng: pt.lng,
    ele_m: pt.ele_m,
    time: pt.time,
    type: pt.type,
  }));
}

function buildRunPointsFromGeoImport(parsed: any): RunPoint[] {
  const routeCandidates = normalizeRawPoints(parsed?.routePoints ?? [], 'route');
  const trackCandidates = normalizeRawPoints(parsed?.trackPoints ?? [], 'track');

  if (routeCandidates.length > 0) {
    return finalizeRunPoints(routeCandidates);
  }

  if (trackCandidates.length > 0) {
    return finalizeRunPoints(trackCandidates);
  }

  const primaryCandidates = normalizeRawPoints(parsed?.primaryCoords ?? [], 'route');
  if (primaryCandidates.length > 0) {
    return finalizeRunPoints(primaryCandidates);
  }

  const waypointCandidates = normalizeRawPoints(parsed?.waypoints ?? [], 'route');
  if (waypointCandidates.length > 0) {
    return finalizeRunPoints(waypointCandidates);
  }

  return [];
}

function buildRunPointsFromParsedGPX(parsed: any, gpxContent: string): RunPoint[] {
  const hasExplicitRoute =
    typeof gpxContent === 'string' &&
    (gpxContent.includes('<rte>') || gpxContent.includes('<rtept'));

  const hasExplicitTrack =
    typeof gpxContent === 'string' &&
    (gpxContent.includes('<trk>') || gpxContent.includes('<trkpt'));

  const routeCandidates: NormalizedPointInput[] = [];
  const trackCandidates: NormalizedPointInput[] = [];

  if (Array.isArray(parsed?.segments)) {
    for (const seg of parsed.segments) {
      const segPoints = normalizeRawPoints(
        seg?.points ?? [],
        hasExplicitRoute ? 'route' : 'track'
      );
      if (hasExplicitRoute) routeCandidates.push(...segPoints);
      else trackCandidates.push(...segPoints);
    }
  }

  if (Array.isArray(parsed?.routePoints)) {
    routeCandidates.push(...normalizeRawPoints(parsed.routePoints, 'route'));
  }

  if (Array.isArray(parsed?.trackPoints)) {
    trackCandidates.push(...normalizeRawPoints(parsed.trackPoints, 'track'));
  }

  if (
    routeCandidates.length === 0 &&
    trackCandidates.length === 0 &&
    Array.isArray(parsed?.primaryCoords)
  ) {
    const fallbackType: RunPointType =
      hasExplicitTrack && !hasExplicitRoute ? 'track' : 'route';

    const primary = normalizeRawPoints(parsed.primaryCoords, fallbackType);
    if (fallbackType === 'route') routeCandidates.push(...primary);
    else trackCandidates.push(...primary);
  }

  if (routeCandidates.length > 0) return finalizeRunPoints(routeCandidates);
  if (trackCandidates.length > 0) return finalizeRunPoints(trackCandidates);

  if (Array.isArray(parsed?.waypoints) && parsed.waypoints.length > 0) {
    return finalizeRunPoints(normalizeRawPoints(parsed.waypoints, 'route'));
  }

  return [];
}

function buildRunPointsFromImportedRoute(route: ImportedRoute): RunPoint[] {
  const src: any = route;
  const routeCandidates: NormalizedPointInput[] = [];
  const trackCandidates: NormalizedPointInput[] = [];

  if (Array.isArray(src?.routePoints)) {
    routeCandidates.push(...normalizeRawPoints(src.routePoints, 'route'));
  }

  if (Array.isArray(src?.trackPoints)) {
    trackCandidates.push(...normalizeRawPoints(src.trackPoints, 'track'));
  }

  if (Array.isArray(src?.segments)) {
    for (const seg of src.segments) {
      trackCandidates.push(...normalizeRawPoints(seg?.points ?? [], 'track'));
    }
  }

  if (
    routeCandidates.length === 0 &&
    trackCandidates.length === 0 &&
    Array.isArray(src?.primaryCoords)
  ) {
    routeCandidates.push(...normalizeRawPoints(src.primaryCoords, 'route'));
  }

  if (routeCandidates.length > 0) return finalizeRunPoints(routeCandidates);
  if (trackCandidates.length > 0) return finalizeRunPoints(trackCandidates);

  if (Array.isArray(route.waypoints) && route.waypoints.length > 0) {
    return finalizeRunPoints(normalizeRawPoints(route.waypoints, 'route'));
  }

  return [];
}

// ── Run Store ───────────────────────────────────────────

export const runStore = {
  getAll: (): ECSRun[] => {
    return getLocalRuns().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  getById: (id: string): ECSRun | null => {
    return getLocalRuns().find((r) => r.id === id) || null;
  },

  getActive: (): ECSRun | null => {
    return getLocalRuns().find((r) => r.is_active) || null;
  },

  /**
   * Best path when the import layer already parsed the file successfully.
   */
  createFromParsedImport: (
    parsed: any,
    buildSnapshot?: Partial<BuildSnapshot>,
    sourceApp?: string,
    titleOverride?: string
  ): ECSRun => {
    const now = nowISO();
    const points = buildRunPointsFromGeoImport(parsed);
    const stats = computeStatsFromPoints(points);

    const bs: BuildSnapshot = {
      ...createDefaultBuildSnapshot(),
      ...buildSnapshot,
      captured_at: now,
    };

    const run: ECSRun = {
      id: generateId(),
      user_id: null,
      title: titleOverride || parsed?.name || 'Imported Route',
      source: sourceApp || 'import',
      created_at: now,
      updated_at: now,
      vehicle_id: bs.vehicle_id,
      build_snapshot: bs,
      stats,
      points,
      waypoints: Array.isArray(parsed?.waypoints) ? parsed.waypoints : [],
      is_active: false,
    };

    
    const runs = getLocalRuns();
    runs.push(run);
    saveLocalRuns(runs);

    return run;
  },

  /**
   * Fallback path: reparse raw GPX text.
   * Prefer createFromParsedImport(...) when the import layer already parsed the file.
   */
  importFromGPX: (
    gpxContent: string,
    buildSnapshot?: Partial<BuildSnapshot>,
    sourceApp?: string
  ): ECSRun => {
    const parsed: any = parseGPX(gpxContent);
    const now = nowISO();

    const points = buildRunPointsFromParsedGPX(parsed, gpxContent);
    const stats = computeStatsFromPoints(points);

    const bs: BuildSnapshot = {
      ...createDefaultBuildSnapshot(),
      ...buildSnapshot,
      captured_at: now,
    };

    const run: ECSRun = {
      id: generateId(),
      user_id: null,
      title: parsed?.name || 'Imported Run',
      source: sourceApp || 'gpx',
      created_at: now,
      updated_at: now,
      vehicle_id: bs.vehicle_id,
      build_snapshot: bs,
      stats,
      points,
      waypoints: Array.isArray(parsed?.waypoints) ? parsed.waypoints : [],
      is_active: false,
    };

    console.log('[RunStore] importFromGPX created run', {
      title: run.title,
      pointCount: run.points.length,
      firstPoint: run.points[0] ?? null,
      lastPoint: run.points[run.points.length - 1] ?? null,
    });

    const runs = getLocalRuns();
    runs.push(run);
    saveLocalRuns(runs);

    return run;
  },

  createFromRoute: (
    route: ImportedRoute,
    buildSnapshot?: Partial<BuildSnapshot>
  ): ECSRun => {
    const now = nowISO();
    const points = buildRunPointsFromImportedRoute(route);
    const stats = computeStatsFromPoints(points);

    const bs: BuildSnapshot = {
      ...createDefaultBuildSnapshot(),
      ...buildSnapshot,
      captured_at: now,
    };

    const run: ECSRun = {
      id: generateId(),
      user_id: null,
      title: route.name || 'Imported Route',
      source: route.source_format || 'import',
      created_at: now,
      updated_at: now,
      vehicle_id: bs.vehicle_id,
      build_snapshot: bs,
      stats,
      points,
      waypoints: Array.isArray(route.waypoints) ? route.waypoints : [],
      is_active: false,
    };

    console.log('[RunStore] createFromRoute created run', {
      title: run.title,
      pointCount: run.points.length,
      firstPoint: run.points[0] ?? null,
      lastPoint: run.points[run.points.length - 1] ?? null,
    });

    const runs = getLocalRuns();
    runs.push(run);
    saveLocalRuns(runs);

    return run;
  },

  setActive: (runId: string): void => {
    const runs = getLocalRuns();
    for (const r of runs) {
      r.is_active = r.id === runId;
      if (r.id === runId) r.updated_at = nowISO();
    }
    saveLocalRuns(runs);
  },

  deactivateAll: (): void => {
    const runs = getLocalRuns();
    for (const r of runs) r.is_active = false;
    saveLocalRuns(runs);
  },

  updateTitle: (runId: string, title: string): ECSRun | null => {
    const runs = getLocalRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx === -1) return null;
    runs[idx].title = title;
    runs[idx].updated_at = nowISO();
    saveLocalRuns(runs);
    return runs[idx];
  },

  updateBuildSnapshot: (runId: string, snapshot: Partial<BuildSnapshot>): ECSRun | null => {
    const runs = getLocalRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx === -1) return null;
    runs[idx].build_snapshot = { ...runs[idx].build_snapshot, ...snapshot };
    runs[idx].updated_at = nowISO();
    saveLocalRuns(runs);
    return runs[idx];
  },

  delete: (runId: string): void => {
    const runs = getLocalRuns().filter((r) => r.id !== runId);
    saveLocalRuns(runs);
  },

  count: (): number => getLocalRuns().length,
};