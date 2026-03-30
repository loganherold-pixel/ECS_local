/**
 * ECS Trail Store — Breadcrumb Trail Recording System (Phase 2.8.1 / 2.8.3)
 *
 * Expedition-grade trail recording with:
 *   - Live breadcrumb point recording
 *   - Segment management for pause/resume
 *   - Auto-start on expedition + movement
 *   - Auto-pause when stationary
 *   - Local persistence with crash recovery
 *   - GPX export with full metadata
 *   - Distance, elapsed time, average speed calculations
 *   - Phase 2.8.3: Persistent offline storage via trailHistoryStore
 *     - Auto-save on stop with full points + analytics
 *     - Replay point lookup from pre-computed analytics
 *
 * Recording resolution: every 3-5 seconds OR every 15m traveled
 * Movement threshold: GPS speed > 3 mph sustained 5 seconds
 * Stationary threshold: speed < 1.5 mph for 2 minutes → auto-pause
 */
import { Platform } from 'react-native';
import type { ECSPin } from '../components/navigate/PinTypes';
import { trailHistoryStore } from './trailHistoryStore';

// ── Speed Bucket Types ───────────────────────────────────────
export type SpeedBucket = 'stopped' | 'slow' | 'moderate' | 'fast';

export interface SpeedThresholds {
  stopped_max: number;   // 0–N mph = stopped (default 2)
  slow_max: number;      // N–M mph = slow    (default 10)
  moderate_max: number;  // M–P mph = moderate (default 25)
  // above moderate_max = fast
}

export const SPEED_BUCKET_COLORS: Record<SpeedBucket, string> = {
  stopped:  '#8A8A85', // gray
  slow:     '#66BB6A', // green
  moderate: '#FFB300', // amber
  fast:     '#EF5350', // red
};

export const SPEED_BUCKET_LABELS: Record<SpeedBucket, string> = {
  stopped: 'STOPPED', slow: 'SLOW', moderate: 'MODERATE', fast: 'FAST',
};

export const DEFAULT_SPEED_THRESHOLDS: SpeedThresholds = {
  stopped_max: 2, slow_max: 10, moderate_max: 25,
};

export interface TrailPoint {
  id: string;
  expedition_id: string | null;
  vehicle_id: string | null;
  lat: number;
  lng: number;
  elevation: number | null;
  speed: number | null;       // mph
  heading: number | null;     // degrees
  timestamp: string;          // ISO
  segment_id: string;
  speed_bucket?: SpeedBucket; // Phase 3: speed classification
}


export interface TrailSegment {
  id: string;
  started_at: string;
  ended_at: string | null;
  point_count: number;
}

export type TrailRecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export interface TrailSession {
  id: string;
  expedition_id: string | null;
  vehicle_id: string | null;
  status: TrailRecordingStatus;
  started_at: string;
  ended_at: string | null;
  segments: TrailSegment[];
  total_distance_miles: number;
  total_distance_km: number;
  elapsed_seconds: number;
  avg_speed_mph: number;
  max_speed_mph: number;
  point_count: number;
  created_at: string;
}
export interface TrailStats {
  distance_miles: number;
  distance_km: number;
  elapsed_seconds: number;
  elapsed_formatted: string;
  avg_speed_mph: number;
  max_speed_mph: number;
  point_count: number;
  segment_count: number;
}

// ── Phase 2.8.2: Analytics types ─────────────────────────────
export interface TrailAnalytics {
  total_distance_miles: number;
  total_distance_km: number;
  elevation_gain_ft: number;
  elevation_loss_ft: number;
  min_elevation_ft: number | null;
  max_elevation_ft: number | null;
  max_grade_pct: number;
  has_elevation: boolean;
  /** Downsampled chart series: { distance_mi, elevation_ft, speed_mph, timestamp } */
  chart_series: TrailChartPoint[];
  /** Per-point cumulative data for replay */
  replay_data: TrailReplayPoint[];
  /** Speed-colored segments for heatmap */
  speed_segments: TrailSpeedSegment[];
}

export interface TrailChartPoint {
  distance_mi: number;
  elevation_ft: number | null;
  speed_mph: number | null;
  timestamp: string;
  index: number;
}

export interface TrailReplayPoint {
  index: number;
  lat: number;
  lng: number;
  elevation_ft: number | null;
  speed_mph: number | null;
  heading: number | null;
  cumulative_distance_mi: number;
  timestamp: string;
  segment_id: string;
  elapsed_seconds: number;
}

export interface TrailSpeedSegment {
  coordinates: [number, number][];
  speed_mph: number;
  color: string;
}


// ── Constants ────────────────────────────────────────────────
const STORAGE_KEY_SESSION = 'ecs_trail_session';
const STORAGE_KEY_POINTS = 'ecs_trail_points';
const STORAGE_KEY_HISTORY = 'ecs_trail_history';
const STORAGE_KEY_SPEED_THRESHOLDS = 'ecs_speed_thresholds';
const TAG = '[TRAIL]';

const MIN_RECORD_INTERVAL_MS = 3000;      // 3 seconds minimum between points
const MIN_DISTANCE_METERS = 15;           // 15m minimum distance between points
const MOVEMENT_SPEED_THRESHOLD = 3;       // mph — start recording
const STATIONARY_SPEED_THRESHOLD = 1.5;   // mph — pause threshold
const STATIONARY_TIMEOUT_MS = 120000;     // 2 minutes stationary → auto-pause
const MOVEMENT_SUSTAIN_MS = 5000;         // 5 seconds sustained movement to start

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

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const now = () => new Date().toISOString();

// ── Geo helpers ──────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToMiles(m: number): number { return m * 0.000621371; }
function metersToKm(m: number): number { return m / 1000; }

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}


// ── Speed threshold helpers ──────────────────────────────────
/** Read configurable speed thresholds from localStorage (falls back to defaults). */
function readSpeedThresholds(): SpeedThresholds {
  try {
    const raw = sGet(STORAGE_KEY_SPEED_THRESHOLDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.stopped_max === 'number' &&
        typeof parsed.slow_max === 'number' &&
        typeof parsed.moderate_max === 'number'
      ) {
        return parsed as SpeedThresholds;
      }
    }
  } catch {}
  return { ...DEFAULT_SPEED_THRESHOLDS };
}

/** Persist speed thresholds to localStorage. */
function writeSpeedThresholds(thresholds: SpeedThresholds): void {
  sSet(STORAGE_KEY_SPEED_THRESHOLDS, JSON.stringify(thresholds));
}

/** Classify a speed (mph) into a SpeedBucket using the current thresholds. */
function classifySpeedBucket(speedMph: number): SpeedBucket {
  const t = readSpeedThresholds();
  if (speedMph <= t.stopped_max) return 'stopped';
  if (speedMph <= t.slow_max) return 'slow';
  if (speedMph <= t.moderate_max) return 'moderate';
  return 'fast';
}


// ── Internal state (runtime only) ────────────────────────────
let _lastRecordTime = 0;
let _lastRecordLat = 0;
let _lastRecordLng = 0;
let _movementStartTime: number | null = null;
let _stationaryStartTime: number | null = null;
let _currentSegmentId: string | null = null;
let _sessionStartTimestamp: number | null = null;
let _pauseAccumulatedMs = 0;
let _lastPauseTime: number | null = null;

// ── Session CRUD ─────────────────────────────────────────────
function getSession(): TrailSession | null {
  try {
    const raw = sGet(STORAGE_KEY_SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(session: TrailSession): void {
  sSet(STORAGE_KEY_SESSION, JSON.stringify(session));
}

function getPoints(): TrailPoint[] {
  try {
    const raw = sGet(STORAGE_KEY_POINTS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function savePoints(points: TrailPoint[]): void {
  sSet(STORAGE_KEY_POINTS, JSON.stringify(points));
}

function getHistory(): TrailSession[] {
  try {
    const raw = sGet(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveHistory(sessions: TrailSession[]): void {
  sSet(STORAGE_KEY_HISTORY, JSON.stringify(sessions));
}

// ── Recalculate session stats from points ────────────────────
function recalcStats(session: TrailSession, points: TrailPoint[]): void {
  let totalDistM = 0;
  let maxSpeed = 0;
  let speedSum = 0;
  let speedCount = 0;

  for (let i = 1; i < points.length; i++) {
    totalDistM += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    if (points[i].speed != null && points[i].speed! > 0) {
      speedSum += points[i].speed!;
      speedCount++;
      if (points[i].speed! > maxSpeed) maxSpeed = points[i].speed!;
    }
  }

  session.total_distance_miles = Math.round(metersToMiles(totalDistM) * 100) / 100;
  session.total_distance_km = Math.round(metersToKm(totalDistM) * 100) / 100;
  session.max_speed_mph = Math.round(maxSpeed * 10) / 10;
  session.avg_speed_mph = speedCount > 0 ? Math.round((speedSum / speedCount) * 10) / 10 : 0;
  session.point_count = points.length;

  // Elapsed time
  if (_sessionStartTimestamp) {
    const activeMs = Date.now() - _sessionStartTimestamp - _pauseAccumulatedMs;
    session.elapsed_seconds = Math.max(0, Math.round(activeMs / 1000));
  }
}

// ── Trail Store API ──────────────────────────────────────────
export const trailStore = {
  // ── Session lifecycle ──────────────────────────────────────

  getSession,

  getStatus: (): TrailRecordingStatus => {
    const session = getSession();
    return session?.status || 'idle';
  },

  getStats: (): TrailStats => {
    const session = getSession();
    const points = getPoints();
    if (!session) {
      return {
        distance_miles: 0, distance_km: 0, elapsed_seconds: 0,
        elapsed_formatted: '0:00', avg_speed_mph: 0, max_speed_mph: 0,
        point_count: 0, segment_count: 0,
      };
    }
    // Recalc live elapsed
    if (session.status === 'recording' && _sessionStartTimestamp) {
      const activeMs = Date.now() - _sessionStartTimestamp - _pauseAccumulatedMs;
      session.elapsed_seconds = Math.max(0, Math.round(activeMs / 1000));
    }
    return {
      distance_miles: session.total_distance_miles,
      distance_km: session.total_distance_km,
      elapsed_seconds: session.elapsed_seconds,
      elapsed_formatted: formatElapsed(session.elapsed_seconds),
      avg_speed_mph: session.avg_speed_mph,
      max_speed_mph: session.max_speed_mph,
      point_count: session.point_count,
      segment_count: session.segments.length,
    };
  },

  getPoints,

  /**
   * Start a new trail recording session.
   * If a session already exists, it will be stopped and archived first.
   */
  start: (expeditionId: string | null = null, vehicleId: string | null = null): TrailSession => {
    // Archive existing session if any
    const existing = getSession();
    if (existing && existing.status !== 'idle' && existing.status !== 'stopped') {
      trailStore.stop();
    }

    const segId = uuid();
    _currentSegmentId = segId;
    _sessionStartTimestamp = Date.now();
    _pauseAccumulatedMs = 0;
    _lastPauseTime = null;
    _lastRecordTime = 0;
    _lastRecordLat = 0;
    _lastRecordLng = 0;
    _movementStartTime = null;
    _stationaryStartTime = null;

    const session: TrailSession = {
      id: uuid(),
      expedition_id: expeditionId,
      vehicle_id: vehicleId,
      status: 'recording',
      started_at: now(),
      ended_at: null,
      segments: [{
        id: segId,
        started_at: now(),
        ended_at: null,
        point_count: 0,
      }],
      total_distance_miles: 0,
      total_distance_km: 0,
      elapsed_seconds: 0,
      avg_speed_mph: 0,
      max_speed_mph: 0,
      point_count: 0,
      created_at: now(),
    };

    saveSession(session);
    savePoints([]);
    console.log(TAG, `Trail recording started: ${session.id}`);
    return session;
  },

  /**
   * Pause trail recording. Creates a segment boundary.
   */
  pause: (): TrailSession | null => {
    const session = getSession();
    if (!session || session.status !== 'recording') return null;

    session.status = 'paused';
    _lastPauseTime = Date.now();

    // Close current segment
    const currentSeg = session.segments.find(s => s.id === _currentSegmentId);
    if (currentSeg) {
      currentSeg.ended_at = now();
      const points = getPoints();
      currentSeg.point_count = points.filter(p => p.segment_id === _currentSegmentId).length;
    }

    // Recalc stats
    recalcStats(session, getPoints());
    saveSession(session);
    console.log(TAG, 'Trail recording paused');
    return session;
  },

  /**
   * Resume trail recording. Creates a new segment.
   */
  resume: (): TrailSession | null => {
    const session = getSession();
    if (!session || session.status !== 'paused') return null;

    // Accumulate pause time
    if (_lastPauseTime) {
      _pauseAccumulatedMs += Date.now() - _lastPauseTime;
      _lastPauseTime = null;
    }

    const segId = uuid();
    _currentSegmentId = segId;
    session.status = 'recording';
    session.segments.push({
      id: segId,
      started_at: now(),
      ended_at: null,
      point_count: 0,
    });

    _lastRecordTime = 0; // Allow immediate first point in new segment
    _stationaryStartTime = null;

    saveSession(session);
    console.log(TAG, 'Trail recording resumed');
    return session;
  },

  /**
   * Stop trail recording and archive the session.
   * Phase 2.8.3: Also persists full trail data to trailHistoryStore.
   * @param expeditionName — optional expedition name for the saved trail record
   */
  stop: (expeditionName: string | null = null): TrailSession | null => {
    const session = getSession();
    if (!session) return null;

    session.status = 'stopped';
    session.ended_at = now();

    // Close current segment
    const currentSeg = session.segments.find(s => s.id === _currentSegmentId);
    if (currentSeg) {
      currentSeg.ended_at = now();
      const points = getPoints();
      currentSeg.point_count = points.filter(p => p.segment_id === _currentSegmentId).length;
    }

    // Final stats
    if (_lastPauseTime) {
      _pauseAccumulatedMs += Date.now() - _lastPauseTime;
    }
    const points = getPoints();
    recalcStats(session, points);

    // Archive to lightweight history (session metadata only)
    const history = getHistory();
    history.unshift(session);
    if (history.length > 50) history.length = 50;
    saveHistory(history);

    saveSession(session);

    // ── Phase 2.8.3: Persist full trail data to offline storage ──
    // Compute analytics for the saved trail record
    try {
      const analytics = points.length >= 2 ? trailStore.getAnalytics() : null;
      trailHistoryStore.saveTrail(session, points, analytics, expeditionName);
    } catch (e) {
      console.warn(TAG, 'Failed to persist trail to history store:', e);
    }

    // Reset runtime state
    _currentSegmentId = null;
    _sessionStartTimestamp = null;
    _pauseAccumulatedMs = 0;
    _lastPauseTime = null;

    console.log(TAG, `Trail recording stopped: ${session.id} (${session.point_count} points, ${session.total_distance_miles} mi)`);
    return session;
  },

  /**
   * Phase 2.8.3: Get replay point from pre-computed analytics data.
   * Used for replaying saved trails where analytics are already computed.
   */
  getReplayPointFromAnalytics: (analytics: TrailAnalytics, elapsedSeconds: number): TrailReplayPoint | null => {
    if (!analytics || analytics.replay_data.length === 0) return null;
    const data = analytics.replay_data;
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (data[mid].elapsed_seconds < elapsedSeconds) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(data[lo - 1].elapsed_seconds - elapsedSeconds) < Math.abs(data[lo].elapsed_seconds - elapsedSeconds)) {
      return data[lo - 1];
    }
    return data[lo];
  },


  /**
   * Clear the current session (reset to idle).
   */
  clear: (): void => {
    sSet(STORAGE_KEY_SESSION, '');
    sSet(STORAGE_KEY_POINTS, '[]');
    _currentSegmentId = null;
    _sessionStartTimestamp = null;
    _pauseAccumulatedMs = 0;
    _lastPauseTime = null;
    _lastRecordTime = 0;
    console.log(TAG, 'Trail session cleared');
  },

  /**
   * Record a trail point. Applies distance + time throttling.
   * Returns true if point was recorded, false if skipped.
   */
  recordPoint: (data: {
    lat: number;
    lng: number;
    elevation?: number | null;
    speed?: number | null;
    heading?: number | null;
  }): boolean => {
    const session = getSession();
    if (!session || session.status !== 'recording' || !_currentSegmentId) return false;

    const nowMs = Date.now();

    // Time throttle
    if (_lastRecordTime > 0 && (nowMs - _lastRecordTime) < MIN_RECORD_INTERVAL_MS) {
      return false;
    }

    // Distance throttle (skip if too close to last point)
    if (_lastRecordLat !== 0 && _lastRecordLng !== 0) {
      const dist = haversineMeters(_lastRecordLat, _lastRecordLng, data.lat, data.lng);
      if (dist < MIN_DISTANCE_METERS && (nowMs - _lastRecordTime) < 10000) {
        // Allow at least one point every 10 seconds even if stationary
        return false;
      }
    }

    const point: TrailPoint = {
      id: uuid(),
      expedition_id: session.expedition_id,
      vehicle_id: session.vehicle_id,
      lat: data.lat,
      lng: data.lng,
      elevation: data.elevation ?? null,
      speed: data.speed ?? null,
      heading: data.heading ?? null,
      timestamp: now(),
      segment_id: _currentSegmentId,
      speed_bucket: classifySpeedBucket(data.speed ?? 0),
    };


    const points = getPoints();
    points.push(point);
    savePoints(points);

    // Update session stats
    recalcStats(session, points);
    saveSession(session);

    _lastRecordTime = nowMs;
    _lastRecordLat = data.lat;
    _lastRecordLng = data.lng;

    return true;
  },

  /**
   * Check movement state and auto-start/pause recording.
   * Call this from GPS watch callback.
   *
   * Returns: 'started' | 'paused' | 'recording' | 'idle' | null
   */
  checkMovement: (speed: number, expeditionId: string | null = null): string | null => {
    const session = getSession();
    const status = session?.status || 'idle';

    if (status === 'stopped') return null;

    // ── Auto-start logic ──────────────────────────────────
    if (status === 'idle') {
      if (speed > MOVEMENT_SPEED_THRESHOLD) {
        if (!_movementStartTime) {
          _movementStartTime = Date.now();
        } else if (Date.now() - _movementStartTime >= MOVEMENT_SUSTAIN_MS) {
          // Sustained movement detected — start recording
          trailStore.start(expeditionId);
          _movementStartTime = null;
          _stationaryStartTime = null;
          return 'started';
        }
      } else {
        _movementStartTime = null;
      }
      return 'idle';
    }

    // ── Auto-pause logic (only when recording) ────────────
    if (status === 'recording') {
      if (speed < STATIONARY_SPEED_THRESHOLD) {
        if (!_stationaryStartTime) {
          _stationaryStartTime = Date.now();
        } else if (Date.now() - _stationaryStartTime >= STATIONARY_TIMEOUT_MS) {
          trailStore.pause();
          _stationaryStartTime = null;
          return 'paused';
        }
      } else {
        _stationaryStartTime = null;
      }
      return 'recording';
    }

    // ── Auto-resume logic (when paused) ───────────────────
    if (status === 'paused') {
      if (speed > MOVEMENT_SPEED_THRESHOLD) {
        if (!_movementStartTime) {
          _movementStartTime = Date.now();
        } else if (Date.now() - _movementStartTime >= MOVEMENT_SUSTAIN_MS) {
          trailStore.resume();
          _movementStartTime = null;
          return 'started';
        }
      } else {
        _movementStartTime = null;
      }
      return 'paused';
    }

    return null;
  },

  /**
   * Recover session after app restart.
   * Restores runtime state from persisted session.
   */
  recover: (): TrailSession | null => {
    const session = getSession();
    if (!session) return null;

    if (session.status === 'recording' || session.status === 'paused') {
      // Restore runtime state
      const lastSeg = session.segments[session.segments.length - 1];
      _currentSegmentId = lastSeg?.id || null;

      // Estimate session start from first point
      const points = getPoints();
      if (points.length > 0) {
        _sessionStartTimestamp = new Date(points[0].timestamp).getTime();
        // Account for elapsed time already recorded
        _pauseAccumulatedMs = 0; // Simplified — just continue from where we left off
      }

      if (session.status === 'paused') {
        _lastPauseTime = Date.now();
      }

      if (points.length > 0) {
        const lastPt = points[points.length - 1];
        _lastRecordLat = lastPt.lat;
        _lastRecordLng = lastPt.lng;
        _lastRecordTime = new Date(lastPt.timestamp).getTime();
      }

      console.log(TAG, `Trail session recovered: ${session.id} (${session.status}, ${points.length} points)`);
      return session;
    }

    return null;
  },

  // ── History ────────────────────────────────────────────────
  getHistory,

  getHistorySession: (sessionId: string): { session: TrailSession; points: TrailPoint[] } | null => {
    const history = getHistory();
    const session = history.find(s => s.id === sessionId);
    if (!session) return null;
    // For historical sessions, points are stored with the session in history
    // (simplified — in production you'd store points separately per session)
    return { session, points: [] };
  },

  // ── Trail coordinates for map rendering ────────────────────
  getTrailCoordinates: (): Array<{ lat: number; lng: number; segment_id: string }> => {
    const points = getPoints();
    return points.map(p => ({ lat: p.lat, lng: p.lng, segment_id: p.segment_id }));
  },

  getTrailSegmentCoordinates: (): Array<{ segment_id: string; coordinates: [number, number][] }> => {
    const points = getPoints();
    const segMap = new Map<string, [number, number][]>();

    for (const p of points) {
      if (!segMap.has(p.segment_id)) {
        segMap.set(p.segment_id, []);
      }
      segMap.get(p.segment_id)!.push([p.lng, p.lat]);
    }

    return Array.from(segMap.entries()).map(([segment_id, coordinates]) => ({
      segment_id,
      coordinates,
    }));
  },

  // ── GPX Export ─────────────────────────────────────────────
  exportToGPX: (pins?: ECSPin[], name?: string): string => {
    const session = getSession();
    const points = getPoints();
    const trailName = name || (session?.expedition_id ? `Expedition Trail` : 'ECS Trail');
    const exportTime = now();

    // Waypoints from pins
    const wptLines: string[] = [];
    if (pins && pins.length > 0) {
      for (const pin of pins) {
        const desc = [pin.type.toUpperCase(), pin.notes].filter(Boolean).join(' — ');
        wptLines.push(`  <wpt lat="${pin.lat.toFixed(8)}" lon="${pin.lng.toFixed(8)}">
    <name>${escapeXml(pin.title)}</name>
    <desc>${escapeXml(desc)}</desc>
    <type>${pin.type}</type>
    <time>${pin.created_at}</time>
  </wpt>`);
      }
    }

    // Track segments
    const segCoords = trailStore.getTrailSegmentCoordinates();
    const trkLines: string[] = [];

    if (segCoords.length > 0) {
      trkLines.push(`  <trk>`);
      trkLines.push(`    <name>${escapeXml(trailName)}</name>`);
      if (session) {
        trkLines.push(`    <desc>Distance: ${session.total_distance_miles} mi, Points: ${session.point_count}</desc>`);
      }

      for (const seg of segCoords) {
        trkLines.push('    <trkseg>');
        // Get full point data for elevation/time
        const segPoints = points.filter(p => p.segment_id === seg.segment_id);
        for (const pt of segPoints) {
          const eleLine = pt.elevation != null ? `\n        <ele>${pt.elevation.toFixed(1)}</ele>` : '';
          const timeLine = `\n        <time>${pt.timestamp}</time>`;
          trkLines.push(
            `      <trkpt lat="${pt.lat.toFixed(8)}" lon="${pt.lng.toFixed(8)}">${eleLine}${timeLine}` +
            '\n      </trkpt>'
          );
        }
        trkLines.push('    </trkseg>');
      }

      trkLines.push('  </trk>');
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  creator="Expedition Command System"
  version="1.1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(trailName)}</name>
    <time>${exportTime}</time>
  </metadata>
${wptLines.join('\n')}
${trkLines.join('\n')}
</gpx>`;
  },

  exportToJSON: (): string => {
    const session = getSession();
    const points = getPoints();
    return JSON.stringify({ session, points }, null, 2);
  },

  exportCoordinatesList: (): string => {
    const points = getPoints();
    return points.map((p, i) =>
      `${i + 1}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}${p.elevation != null ? ` (${Math.round(p.elevation)}m)` : ''}`
    ).join('\n');
  },
  // ── Phase 2.8.2: Analytics + Replay ─────────────────────────

  /**
   * Compute full trail analytics for elevation profile + replay.
   * Precomputes cumulative distance, elevation gain/loss, chart series,
   * replay data, and speed-colored segments.
   * 
   * maxChartPoints: downsample chart to this many points (default 200)
   */
  getAnalytics: (maxChartPoints: number = 200): TrailAnalytics => {
    const points = getPoints();
    const session = getSession();

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

    // ── Build per-point cumulative data ──────────────────
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

        // Elevation gain/loss with mild smoothing (skip tiny deltas < 1m)
        if (prev.elevation != null && p.elevation != null) {
          hasElev = true;
          const dElev = p.elevation - prev.elevation;
          const dElevFt = dElev * M_TO_FT;
          if (dElev > 1) elevGainFt += dElevFt;
          else if (dElev < -1) elevLossFt += Math.abs(dElevFt);

          // Grade
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

    const totalDistMi = cumDistM * M_TO_MI;
    const totalDistKm = cumDistM / 1000;

    // ── Downsample for chart ─────────────────────────────
    const chartSeries: TrailChartPoint[] = [];
    const step = Math.max(1, Math.floor(replayData.length / maxChartPoints));
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
    // Always include last point
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

    // ── Speed-colored segments for heatmap ────────────────
    const speedSegments: TrailSpeedSegment[] = [];
    if (points.length > 1) {
      let currentBucket: TrailSpeedSegment | null = null;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const spd = p.speed ?? 0;
        const color = getSpeedColor(spd, session?.max_speed_mph || 30);
        if (!currentBucket || currentBucket.color !== color) {
          // Start new segment; carry over last coord for continuity
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
      total_distance_miles: Math.round(totalDistMi * 100) / 100,
      total_distance_km: Math.round(totalDistKm * 100) / 100,
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
  },

  /**
   * Get replay point nearest to a given elapsed time (seconds).
   */
  getReplayPointAtTime: (elapsedSeconds: number): TrailReplayPoint | null => {
    const analytics = trailStore.getAnalytics();
    if (analytics.replay_data.length === 0) return null;
    
    // Binary search for nearest point
    const data = analytics.replay_data;
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (data[mid].elapsed_seconds < elapsedSeconds) lo = mid + 1;
      else hi = mid;
    }
    // Check if previous point is closer
    if (lo > 0 && Math.abs(data[lo - 1].elapsed_seconds - elapsedSeconds) < Math.abs(data[lo].elapsed_seconds - elapsedSeconds)) {
      return data[lo - 1];
    }
    return data[lo];
  },

  /**
   * Get trail coordinates up to a given point index (for progressive reveal).
   */
  getTrailUpToIndex: (maxIndex: number): Array<{ segment_id: string; coordinates: [number, number][] }> => {
    const points = getPoints();
    const limited = points.slice(0, maxIndex + 1);
    const segMap = new Map<string, [number, number][]>();
    for (const p of limited) {
      if (!segMap.has(p.segment_id)) segMap.set(p.segment_id, []);
      segMap.get(p.segment_id)!.push([p.lng, p.lat]);
    }
    return Array.from(segMap.entries()).map(([segment_id, coordinates]) => ({
      segment_id, coordinates,
    }));
  },

  // ── Speed Threshold API ────────────────────────────────────

  /** Get current speed thresholds (from localStorage or defaults). */
  getSpeedThresholds: (): SpeedThresholds => readSpeedThresholds(),

  /** Persist new speed thresholds to localStorage. */
  setSpeedThresholds: (thresholds: SpeedThresholds): void => writeSpeedThresholds(thresholds),

  /**
   * Build speed-bucket-colored TrailSpeedSegment[] from the current trail points.
   * Each contiguous run of the same bucket becomes one segment with the bucket color.
   */
  getSpeedBucketSegments: (): TrailSpeedSegment[] => {
    const points = getPoints();
    if (points.length < 2) return [];
    const segments: TrailSpeedSegment[] = [];
    let cur: TrailSpeedSegment | null = null;
    for (const p of points) {
      const spd = p.speed ?? 0;
      const bucket = classifySpeedBucket(spd);
      const color = SPEED_BUCKET_COLORS[bucket];
      if (!cur || cur.color !== color) {
        if (cur && cur.coordinates.length > 0) {
          const last = cur.coordinates[cur.coordinates.length - 1];
          cur = { coordinates: [last], speed_mph: spd, color };
        } else {
          cur = { coordinates: [], speed_mph: spd, color };
        }
        segments.push(cur);
      }
      cur!.coordinates.push([p.lng, p.lat]);
    }
    return segments;
  },
};

// ── Speed color helper (bucket-based) ────────────────────────
function getSpeedColor(speed: number, _maxSpeed: number): string {
  return SPEED_BUCKET_COLORS[classifySpeedBucket(speed)];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

