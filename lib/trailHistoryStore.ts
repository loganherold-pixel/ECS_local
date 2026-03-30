/**
 * Trail History Store — Persistent Offline Trail Storage (Phase 2.8.3)
 *
 * Provides durable offline storage for completed trail recordings:
 *   - Serializes trail points, segments, and analytics on session stop
 *   - Stores with expedition ID as key for cross-session retrieval
 *   - Auto-cleanup of trails older than 90 days
 *   - Storage size tracking and indicators
 *   - Load saved trails for replay
 *   - Delete individual trails
 *   - Export saved trails as GPX
 *
 * Storage strategy:
 *   - IndexedDB (via Dexie) when available (web)
 *   - Falls back to localStorage with size-limited storage
 *   - Each trail stored as a self-contained record with all data
 */

import { Platform } from 'react-native';
import { getDB } from './db';
import type {
  TrailSession,
  TrailPoint,
  TrailSegment,
  TrailAnalytics,
  TrailReplayPoint,
  TrailSpeedSegment,
  TrailChartPoint,
} from './trailStore';

const TAG = '[TRAIL_HISTORY]';

// ── Types ────────────────────────────────────────────────────

export interface SavedTrail {
  id: string;
  session_id: string;
  expedition_id: string | null;
  expedition_name: string | null;
  vehicle_id: string | null;
  name: string;
  started_at: string;
  ended_at: string;
  distance_miles: number;
  distance_km: number;
  elapsed_seconds: number;
  avg_speed_mph: number;
  max_speed_mph: number;
  point_count: number;
  segment_count: number;
  elevation_gain_ft: number;
  elevation_loss_ft: number;
  has_elevation: boolean;
  /** Serialized trail points */
  points: TrailPoint[];
  /** Serialized trail segments */
  segments: TrailSegment[];
  /** Pre-computed analytics (chart series, replay data, speed segments) */
  analytics: TrailAnalytics | null;
  /** Storage size in bytes (approximate) */
  storage_bytes: number;
  /** When this record was saved */
  saved_at: string;
  /** Expiry date (90 days from save) */
  expires_at: string;
}

export interface TrailHistorySummary {
  id: string;
  session_id: string;
  expedition_id: string | null;
  expedition_name: string | null;
  name: string;
  started_at: string;
  ended_at: string;
  distance_miles: number;
  elapsed_seconds: number;
  avg_speed_mph: number;
  max_speed_mph: number;
  point_count: number;
  segment_count: number;
  elevation_gain_ft: number;
  has_elevation: boolean;
  storage_bytes: number;
  saved_at: string;
  expires_at: string;
  days_until_expiry: number;
}

export interface StorageInfo {
  total_trails: number;
  total_bytes: number;
  total_formatted: string;
  oldest_trail_date: string | null;
  newest_trail_date: string | null;
  trails_expiring_soon: number; // within 7 days
}

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY = 'ecs_trail_history_v2';
const MAX_TRAILS = 100;
const EXPIRY_DAYS = 90;
const EXPIRY_WARNING_DAYS = 7;
const MAX_LOCALSTORAGE_BYTES = 4 * 1024 * 1024; // 4MB limit for localStorage

// ── Storage helpers ──────────────────────────────────────────

const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch { delete mem[key]; }
}

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function now(): string { return new Date().toISOString(); }

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateSize(obj: any): number {
  try {
    const json = JSON.stringify(obj);
    return json ? json.length * 2 : 0; // UTF-16 encoding
  } catch { return 0; }
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Internal CRUD ────────────────────────────────────────────

function loadAll(): SavedTrail[] {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    console.warn(TAG, 'Failed to parse trail history');
    return [];
  }
}

function saveAll(trails: SavedTrail[]): void {
  try {
    const json = JSON.stringify(trails);
    // Check localStorage size limit
    if (json.length * 2 > MAX_LOCALSTORAGE_BYTES) {
      console.warn(TAG, `Trail history exceeds ${formatBytes(MAX_LOCALSTORAGE_BYTES)} limit, pruning oldest`);
      // Remove oldest trails until under limit
      while (trails.length > 1 && JSON.stringify(trails).length * 2 > MAX_LOCALSTORAGE_BYTES) {
        trails.pop(); // Remove oldest (sorted newest first)
      }
    }
    sSet(STORAGE_KEY, JSON.stringify(trails));
  } catch (e) {
    console.error(TAG, 'Failed to save trail history:', e);
  }
}

// ── Trail History Store API ──────────────────────────────────

export const trailHistoryStore = {

  /**
   * Save a completed trail session with all its data.
   * Called when trail recording is stopped.
   */
  saveTrail: (
    session: TrailSession,
    points: TrailPoint[],
    analytics: TrailAnalytics | null,
    expeditionName: string | null = null,
  ): SavedTrail | null => {
    if (!session || points.length === 0) {
      console.warn(TAG, 'Cannot save empty trail');
      return null;
    }

    const savedAt = now();
    const expiresAt = addDays(new Date(), EXPIRY_DAYS).toISOString();

    // Build the trail name
    const dateStr = new Date(session.started_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const distStr = `${session.total_distance_miles.toFixed(1)} mi`;
    const name = expeditionName
      ? `${expeditionName} — ${dateStr}`
      : `Trail ${dateStr} (${distStr})`;

    const trail: SavedTrail = {
      id: uuid(),
      session_id: session.id,
      expedition_id: session.expedition_id,
      expedition_name: expeditionName,
      vehicle_id: session.vehicle_id,
      name,
      started_at: session.started_at,
      ended_at: session.ended_at || savedAt,
      distance_miles: session.total_distance_miles,
      distance_km: session.total_distance_km,
      elapsed_seconds: session.elapsed_seconds,
      avg_speed_mph: session.avg_speed_mph,
      max_speed_mph: session.max_speed_mph,
      point_count: points.length,
      segment_count: session.segments.length,
      elevation_gain_ft: analytics?.elevation_gain_ft || 0,
      elevation_loss_ft: analytics?.elevation_loss_ft || 0,
      has_elevation: analytics?.has_elevation || false,
      points,
      segments: session.segments,
      analytics,
      storage_bytes: 0, // computed below
      saved_at: savedAt,
      expires_at: expiresAt,
    };

    // Compute storage size
    trail.storage_bytes = estimateSize(trail);

    // Load existing, prepend new, enforce limits
    const trails = loadAll();
    trails.unshift(trail);

    // Enforce max trail count
    if (trails.length > MAX_TRAILS) {
      trails.length = MAX_TRAILS;
    }

    saveAll(trails);
    console.log(TAG, `Trail saved: ${trail.name} (${trail.point_count} pts, ${formatBytes(trail.storage_bytes)})`);
    return trail;
  },

  /**
   * Get all saved trails as summaries (without point data for performance).
   */
  getAll: (): TrailHistorySummary[] => {
    const trails = loadAll();
    const today = new Date();

    return trails.map(t => ({
      id: t.id,
      session_id: t.session_id,
      expedition_id: t.expedition_id,
      expedition_name: t.expedition_name,
      name: t.name,
      started_at: t.started_at,
      ended_at: t.ended_at,
      distance_miles: t.distance_miles,
      elapsed_seconds: t.elapsed_seconds,
      avg_speed_mph: t.avg_speed_mph,
      max_speed_mph: t.max_speed_mph,
      point_count: t.point_count,
      segment_count: t.segment_count,
      elevation_gain_ft: t.elevation_gain_ft,
      has_elevation: t.has_elevation,
      storage_bytes: t.storage_bytes,
      saved_at: t.saved_at,
      expires_at: t.expires_at,
      days_until_expiry: Math.max(0, daysBetween(today, new Date(t.expires_at))),
    }));
  },

  /**
   * Get a single saved trail with full point data (for replay).
   */
  getById: (trailId: string): SavedTrail | null => {
    const trails = loadAll();
    return trails.find(t => t.id === trailId) || null;
  },

  /**
   * Get a saved trail by session ID.
   */
  getBySessionId: (sessionId: string): SavedTrail | null => {
    const trails = loadAll();
    return trails.find(t => t.session_id === sessionId) || null;
  },

  /**
   * Get saved trails for a specific expedition.
   */
  getByExpedition: (expeditionId: string): TrailHistorySummary[] => {
    return trailHistoryStore.getAll().filter(t => t.expedition_id === expeditionId);
  },

  /**
   * Delete a saved trail by ID.
   */
  deleteTrail: (trailId: string): boolean => {
    const trails = loadAll();
    const idx = trails.findIndex(t => t.id === trailId);
    if (idx === -1) return false;

    const removed = trails.splice(idx, 1)[0];
    saveAll(trails);
    console.log(TAG, `Trail deleted: ${removed.name}`);
    return true;
  },

  /**
   * Delete all saved trails.
   */
  deleteAll: (): number => {
    const trails = loadAll();
    const count = trails.length;
    sRemove(STORAGE_KEY);
    console.log(TAG, `All ${count} trails deleted`);
    return count;
  },

  /**
   * Run auto-cleanup: remove trails older than 90 days.
   * Returns number of trails removed.
   */
  autoCleanup: (): number => {
    const trails = loadAll();
    const today = new Date();
    const before = trails.length;

    const filtered = trails.filter(t => {
      const expiryDate = new Date(t.expires_at);
      return expiryDate > today;
    });

    const removed = before - filtered.length;
    if (removed > 0) {
      saveAll(filtered);
      console.log(TAG, `Auto-cleanup: removed ${removed} expired trails`);
    }
    return removed;
  },

  /**
   * Get storage info and statistics.
   */
  getStorageInfo: (): StorageInfo => {
    const trails = loadAll();
    const today = new Date();

    let totalBytes = 0;
    let oldest: string | null = null;
    let newest: string | null = null;
    let expiringSoon = 0;

    for (const t of trails) {
      totalBytes += t.storage_bytes;
      if (!oldest || t.started_at < oldest) oldest = t.started_at;
      if (!newest || t.started_at > newest) newest = t.started_at;

      const daysLeft = daysBetween(today, new Date(t.expires_at));
      if (daysLeft <= EXPIRY_WARNING_DAYS) expiringSoon++;
    }

    return {
      total_trails: trails.length,
      total_bytes: totalBytes,
      total_formatted: formatBytes(totalBytes),
      oldest_trail_date: oldest,
      newest_trail_date: newest,
      trails_expiring_soon: expiringSoon,
    };
  },

  /**
   * Export a saved trail as GPX XML string.
   */
  exportTrailAsGPX: (trailId: string): string | null => {
    const trail = trailHistoryStore.getById(trailId);
    if (!trail) return null;

    const points = trail.points;
    if (points.length === 0) return null;

    // Group points by segment
    const segMap = new Map<string, TrailPoint[]>();
    for (const p of points) {
      if (!segMap.has(p.segment_id)) segMap.set(p.segment_id, []);
      segMap.get(p.segment_id)!.push(p);
    }

    const trkLines: string[] = [];
    trkLines.push('  <trk>');
    trkLines.push(`    <name>${escapeXml(trail.name)}</name>`);
    trkLines.push(`    <desc>Distance: ${trail.distance_miles} mi, Duration: ${formatElapsed(trail.elapsed_seconds)}, Points: ${trail.point_count}</desc>`);

    for (const [_segId, segPoints] of segMap) {
      trkLines.push('    <trkseg>');
      for (const pt of segPoints) {
        const eleLine = pt.elevation != null ? `\n        <ele>${pt.elevation.toFixed(1)}</ele>` : '';
        const timeLine = `\n        <time>${pt.timestamp}</time>`;
        const spdLine = pt.speed != null ? `\n        <extensions><ecs:speed_mph>${pt.speed.toFixed(1)}</ecs:speed_mph></extensions>` : '';
        trkLines.push(
          `      <trkpt lat="${pt.lat.toFixed(8)}" lon="${pt.lng.toFixed(8)}">${eleLine}${timeLine}${spdLine}` +
          '\n      </trkpt>'
        );
      }
      trkLines.push('    </trkseg>');
    }
    trkLines.push('  </trk>');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:ecs="http://expeditioncommand.app/gpx/extensions/1"
  creator="Expedition Command System"
  version="1.1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(trail.name)}</name>
    <time>${trail.saved_at}</time>
    <desc>Avg: ${trail.avg_speed_mph} mph, Max: ${trail.max_speed_mph} mph${trail.has_elevation ? `, Gain: ${trail.elevation_gain_ft} ft` : ''}</desc>
  </metadata>
${trkLines.join('\n')}
</gpx>`;
  },

  /**
   * Export a saved trail as JSON string.
   */
  exportTrailAsJSON: (trailId: string): string | null => {
    const trail = trailHistoryStore.getById(trailId);
    if (!trail) return null;
    return JSON.stringify({
      name: trail.name,
      session_id: trail.session_id,
      expedition_id: trail.expedition_id,
      started_at: trail.started_at,
      ended_at: trail.ended_at,
      distance_miles: trail.distance_miles,
      elapsed_seconds: trail.elapsed_seconds,
      avg_speed_mph: trail.avg_speed_mph,
      max_speed_mph: trail.max_speed_mph,
      point_count: trail.point_count,
      segments: trail.segments,
      points: trail.points,
      analytics: trail.analytics ? {
        elevation_gain_ft: trail.analytics.elevation_gain_ft,
        elevation_loss_ft: trail.analytics.elevation_loss_ft,
        max_grade_pct: trail.analytics.max_grade_pct,
      } : null,
    }, null, 2);
  },

  /**
   * Prepare a saved trail for replay by loading its points into
   * the active trailStore. Returns the analytics for the replay system.
   */
  getReplayData: (trailId: string): {
    points: TrailPoint[];
    analytics: TrailAnalytics;
    session: TrailSession;
  } | null => {
    const trail = trailHistoryStore.getById(trailId);
    if (!trail || trail.points.length < 2) return null;

    // Reconstruct session object
    const session: TrailSession = {
      id: trail.session_id,
      expedition_id: trail.expedition_id,
      vehicle_id: trail.vehicle_id,
      status: 'stopped',
      started_at: trail.started_at,
      ended_at: trail.ended_at,
      segments: trail.segments,
      total_distance_miles: trail.distance_miles,
      total_distance_km: trail.distance_km,
      elapsed_seconds: trail.elapsed_seconds,
      avg_speed_mph: trail.avg_speed_mph,
      max_speed_mph: trail.max_speed_mph,
      point_count: trail.point_count,
      created_at: trail.saved_at,
    };

    // Use pre-computed analytics if available, otherwise recompute
    if (trail.analytics) {
      return { points: trail.points, analytics: trail.analytics, session };
    }

    // Recompute analytics from points
    const analytics = computeAnalyticsFromPoints(trail.points, trail.max_speed_mph);
    return { points: trail.points, analytics, session };
  },

  // Utility formatters
  formatElapsed,
  formatBytes,
};

// ── Analytics computation from saved points ──────────────────

function computeAnalyticsFromPoints(
  points: TrailPoint[],
  maxSpeedMph: number = 30,
): TrailAnalytics {
  if (points.length === 0) {
    return {
      total_distance_miles: 0, total_distance_km: 0,
      elevation_gain_ft: 0, elevation_loss_ft: 0,
      min_elevation_ft: null, max_elevation_ft: null,
      max_grade_pct: 0, has_elevation: false,
      chart_series: [], replay_data: [], speed_segments: [],
    };
  }

  const M_TO_FT = 3.28084;
  const M_TO_MI = 0.000621371;

  let cumDistM = 0;
  let elevGainFt = 0;
  let elevLossFt = 0;
  let minElevFt: number | null = null;
  let maxElevFt: number | null = null;
  let maxGradePct = 0;
  let hasElev = false;
  const startTime = new Date(points[0].timestamp).getTime();

  const replayData: TrailReplayPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      const segDist = haversineMeters(prev.lat, prev.lng, p.lat, p.lng);
      cumDistM += segDist;

      if (prev.elevation != null && p.elevation != null) {
        hasElev = true;
        const dElev = p.elevation - prev.elevation;
        const dElevFt = dElev * M_TO_FT;
        if (dElev > 1) elevGainFt += dElevFt;
        else if (dElev < -1) elevLossFt += Math.abs(dElevFt);

        if (segDist > 5) {
          const grade = Math.abs(dElev / segDist) * 100;
          if (grade > maxGradePct) maxGradePct = grade;
        }
      }
    }

    const elevFt = p.elevation != null ? Math.round(p.elevation * M_TO_FT) : null;
    if (elevFt != null) {
      hasElev = true;
      if (minElevFt === null || elevFt < minElevFt) minElevFt = elevFt;
      if (maxElevFt === null || elevFt > maxElevFt) maxElevFt = elevFt;
    }

    const elapsed = (new Date(p.timestamp).getTime() - startTime) / 1000;

    replayData.push({
      index: i,
      lat: p.lat,
      lng: p.lng,
      elevation_ft: elevFt,
      speed_mph: p.speed,
      heading: p.heading,
      cumulative_distance_mi: Math.round(cumDistM * M_TO_MI * 1000) / 1000,
      timestamp: p.timestamp,
      segment_id: p.segment_id,
      elapsed_seconds: Math.round(elapsed),
    });
  }

  // Chart series (downsample to 200)
  const chartSeries: TrailChartPoint[] = [];
  const step = Math.max(1, Math.floor(replayData.length / 200));
  for (let i = 0; i < replayData.length; i += step) {
    const rp = replayData[i];
    chartSeries.push({
      distance_mi: rp.cumulative_distance_mi,
      elevation_ft: rp.elevation_ft,
      speed_mph: rp.speed_mph,
      timestamp: rp.timestamp,
      index: rp.index,
    });
  }
  if (chartSeries.length > 0 && chartSeries[chartSeries.length - 1].index !== replayData[replayData.length - 1].index) {
    const last = replayData[replayData.length - 1];
    chartSeries.push({
      distance_mi: last.cumulative_distance_mi,
      elevation_ft: last.elevation_ft,
      speed_mph: last.speed_mph,
      timestamp: last.timestamp,
      index: last.index,
    });
  }

  // Speed segments
  const speedSegments: TrailSpeedSegment[] = [];
  if (points.length > 1) {
    let currentBucket: TrailSpeedSegment | null = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const spd = p.speed ?? 0;
      const color = getSpeedColor(spd, maxSpeedMph);
      if (!currentBucket || currentBucket.color !== color) {
        if (currentBucket && currentBucket.coordinates.length > 0) {
          const lastCoord = currentBucket.coordinates[currentBucket.coordinates.length - 1];
          currentBucket = { coordinates: [lastCoord], speed_mph: spd, color };
        } else {
          currentBucket = { coordinates: [], speed_mph: spd, color };
        }
        speedSegments.push(currentBucket);
      }
      currentBucket.coordinates.push([p.lng, p.lat]);
    }
  }

  return {
    total_distance_miles: Math.round(cumDistM * M_TO_MI * 100) / 100,
    total_distance_km: Math.round(cumDistM / 1000 * 100) / 100,
    elevation_gain_ft: Math.round(elevGainFt),
    elevation_loss_ft: Math.round(elevLossFt),
    min_elevation_ft: minElevFt,
    max_elevation_ft: maxElevFt,
    max_grade_pct: Math.round(maxGradePct * 10) / 10,
    has_elevation: hasElev,
    chart_series: chartSeries,
    replay_data: replayData,
    speed_segments: speedSegments,
  };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSpeedColor(speed: number, maxSpeed: number): string {
  if (maxSpeed <= 0) maxSpeed = 30;
  const ratio = Math.min(speed / maxSpeed, 1);
  if (ratio < 0.25) return '#6B4E1A';
  if (ratio < 0.5) return '#9B6E20';
  if (ratio < 0.75) return '#C48A2C';
  return '#FFD54F';
}

