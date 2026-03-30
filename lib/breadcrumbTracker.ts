/**
 * BreadcrumbTracker — Vehicle Path Recording for ExpeditionDrive
 *
 * Records the vehicle's GPS path during ExpeditionDrive mode,
 * enabling the driver to navigate back to the expedition start point.
 *
 * Features:
 *   - Records GPS positions at configurable intervals (3-5s / 15-20m)
 *   - Stores breadcrumb points in memory (lat, lon, timestamp)
 *   - Calculates real-time distance from start (haversine)
 *   - Provides returnToStart() route generation
 *   - Calculates total trail distance and elevation gain
 *   - Auto-starts when ExpeditionDrive mode activates
 *   - Stops when expedition ends, app session ends, or user disables
 *
 * Architecture:
 *   - Singleton store with subscribe/get pattern
 *   - Integrates with gpsUIState for position data
 *   - Feeds into vehicleDisplayStore for status screen
 *   - Pushes data to Android Auto via androidAutoBridge
 *   - Does NOT persist breadcrumbs permanently (in-memory only)
 *   - Does NOT modify the mobile ECS dashboard
 */

import { Platform } from 'react-native';

// ── Types ───────────────────────────────────────────────────

export interface BreadcrumbPoint {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** ISO timestamp when this point was recorded */
  timestamp: string;
  /** Altitude in meters (if available) */
  altitudeM: number | null;
  /** Speed in mph at this point (if available) */
  speedMph: number | null;
  /** Heading in degrees (if available) */
  headingDeg: number | null;
  /** Cumulative distance from start in miles at this point */
  cumulativeDistanceMi: number;
}

export interface BreadcrumbState {
  /** Whether breadcrumb recording is active */
  isRecording: boolean;
  /** Total number of breadcrumb points recorded */
  pointCount: number;
  /** The start point (first breadcrumb) */
  startPoint: BreadcrumbPoint | null;
  /** The most recent breadcrumb point */
  lastPoint: BreadcrumbPoint | null;
  /** Straight-line distance from current position to start (miles) */
  distanceFromStartMi: number;
  /** Total trail distance along the breadcrumb path (miles) */
  totalTrailDistanceMi: number;
  /** Total elevation gain along the trail (feet) */
  elevationGainFt: number;
  /** Total elevation loss along the trail (feet) */
  elevationLossFt: number;
  /** When recording started */
  recordingStartedAt: string | null;
  /** Duration of recording in seconds */
  recordingDurationSec: number;
  /** Whether return-to-start navigation is available */
  canReturnToStart: boolean;
  /** Whether return-to-start is currently active */
  isReturningToStart: boolean;
  /** Bearing from current position to start point (degrees) */
  bearingToStartDeg: number | null;
  /** Last update timestamp */
  lastUpdatedAt: string;
}

export interface BreadcrumbConfig {
  /** Minimum time between recordings (milliseconds) */
  minIntervalMs: number;
  /** Minimum distance between recordings (meters) */
  minDistanceM: number;
  /** Maximum number of points to store (memory limit) */
  maxPoints: number;
  /** Minimum GPS accuracy to accept (meters) */
  maxAccuracyM: number;
  /** Whether to auto-start when ExpeditionDrive activates */
  autoStartOnExpedition: boolean;
}

export interface ReturnToStartRoute {
  /** Start point (current position) */
  from: { latitude: number; longitude: number };
  /** Destination (expedition start) */
  to: { latitude: number; longitude: number };
  /** Straight-line distance in miles */
  straightLineDistanceMi: number;
  /** Bearing from current position to start (degrees) */
  bearingDeg: number;
  /** Breadcrumb trail points for following back (reversed) */
  trailPoints: Array<{ latitude: number; longitude: number }>;
  /** Total trail distance if following breadcrumbs back (miles) */
  trailDistanceMi: number;
}

// ── Constants ───────────────────────────────────────────────

const EARTH_RADIUS_MI = 3958.8;
const EARTH_RADIUS_M = 6371000;
const M_TO_FT = 3.28084;
const M_TO_MI = 0.000621371;

const DEFAULT_CONFIG: BreadcrumbConfig = {
  minIntervalMs: 4000,        // Record every 4 seconds
  minDistanceM: 15,           // Or every 15 meters
  maxPoints: 10000,           // ~10K points max (~11 hours at 4s interval)
  maxAccuracyM: 50,           // Reject fixes > 50m accuracy
  autoStartOnExpedition: true,
};

// ── Haversine Helpers ───────────────────────────────────────

function haversineDistanceMi(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function haversineDistanceM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate bearing from point A to point B in degrees (0-360).
 */
function calculateBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// ── Internal State ──────────────────────────────────────────

let _config: BreadcrumbConfig = { ...DEFAULT_CONFIG };
let _points: BreadcrumbPoint[] = [];
let _isRecording = false;
let _isReturningToStart = false;
let _recordingStartedAt: string | null = null;
let _lastRecordTime = 0;
let _totalTrailDistanceMi = 0;
let _elevationGainFt = 0;
let _elevationLossFt = 0;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Position Polling ────────────────────────────────────────

/**
 * Poll the GPS state and record a breadcrumb if conditions are met.
 */
function _pollPosition(): void {
  if (!_isRecording) return;

  try {
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();

    if (!gps.hasFix || !gps.position) return;

    const { latitude, longitude, altitudeM, speedMph, headingDeg, accuracyM } = gps.position;

    // Reject poor accuracy
    if (accuracyM != null && accuracyM > _config.maxAccuracyM) return;

    const now = Date.now();

    // Check time interval
    if (now - _lastRecordTime < _config.minIntervalMs) return;

    // Check distance interval (if we have a previous point)
    if (_points.length > 0) {
      const lastPt = _points[_points.length - 1];
      const distM = haversineDistanceM(
        lastPt.latitude, lastPt.longitude,
        latitude, longitude,
      );
      if (distM < _config.minDistanceM && now - _lastRecordTime < _config.minIntervalMs * 2) {
        return; // Too close and not enough time elapsed
      }
    }

    // Record the breadcrumb
    _recordPoint(latitude, longitude, altitudeM ?? null, speedMph ?? null, headingDeg ?? null);
    _lastRecordTime = now;
  } catch {}
}

/**
 * Record a single breadcrumb point.
 */
function _recordPoint(
  latitude: number,
  longitude: number,
  altitudeM: number | null,
  speedMph: number | null,
  headingDeg: number | null,
): void {
  // Calculate cumulative distance
  let cumulativeDistanceMi = 0;
  if (_points.length > 0) {
    const lastPt = _points[_points.length - 1];
    const segmentMi = haversineDistanceMi(
      lastPt.latitude, lastPt.longitude,
      latitude, longitude,
    );

    // Filter out teleport jumps (> 2 miles in one interval)
    if (segmentMi > 2.0) return;

    _totalTrailDistanceMi += segmentMi;
    cumulativeDistanceMi = _totalTrailDistanceMi;

    // Track elevation changes
    if (altitudeM != null && lastPt.altitudeM != null) {
      const dElevM = altitudeM - lastPt.altitudeM;
      if (dElevM > 1) {
        _elevationGainFt += dElevM * M_TO_FT;
      } else if (dElevM < -1) {
        _elevationLossFt += Math.abs(dElevM) * M_TO_FT;
      }
    }
  }

  const point: BreadcrumbPoint = {
    latitude,
    longitude,
    timestamp: new Date().toISOString(),
    altitudeM,
    speedMph,
    headingDeg,
    cumulativeDistanceMi,
  };

  _points.push(point);

  // Enforce max points (remove oldest if exceeded)
  if (_points.length > _config.maxPoints) {
    // Downsample: keep every other point from the first half
    const halfIdx = Math.floor(_points.length / 2);
    const downsampled: BreadcrumbPoint[] = [];
    for (let i = 0; i < halfIdx; i += 2) {
      downsampled.push(_points[i]);
    }
    // Keep all points from the second half
    for (let i = halfIdx; i < _points.length; i++) {
      downsampled.push(_points[i]);
    }
    _points = downsampled;
  }

  _notify();
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const breadcrumbTracker = {
  /**
   * Get current breadcrumb state.
   */
  get(): BreadcrumbState {
    const startPoint = _points.length > 0 ? _points[0] : null;
    const lastPoint = _points.length > 0 ? _points[_points.length - 1] : null;

    let distanceFromStartMi = 0;
    let bearingToStartDeg: number | null = null;

    if (startPoint && lastPoint && _points.length > 1) {
      distanceFromStartMi = haversineDistanceMi(
        lastPoint.latitude, lastPoint.longitude,
        startPoint.latitude, startPoint.longitude,
      );
      bearingToStartDeg = calculateBearing(
        lastPoint.latitude, lastPoint.longitude,
        startPoint.latitude, startPoint.longitude,
      );
    }

    let recordingDurationSec = 0;
    if (_recordingStartedAt) {
      recordingDurationSec = (Date.now() - new Date(_recordingStartedAt).getTime()) / 1000;
    }

    return {
      isRecording: _isRecording,
      pointCount: _points.length,
      startPoint,
      lastPoint,
      distanceFromStartMi: Math.round(distanceFromStartMi * 100) / 100,
      totalTrailDistanceMi: Math.round(_totalTrailDistanceMi * 100) / 100,
      elevationGainFt: Math.round(_elevationGainFt),
      elevationLossFt: Math.round(_elevationLossFt),
      recordingStartedAt: _recordingStartedAt,
      recordingDurationSec: Math.round(recordingDurationSec),
      canReturnToStart: _points.length >= 2,
      isReturningToStart: _isReturningToStart,
      bearingToStartDeg: bearingToStartDeg != null ? Math.round(bearingToStartDeg) : null,
      lastUpdatedAt: new Date().toISOString(),
    };
  },

  /**
   * Get all breadcrumb points.
   */
  getPoints(): BreadcrumbPoint[] {
    return [..._points];
  },

  /**
   * Get the start point (first breadcrumb).
   */
  getStartPoint(): BreadcrumbPoint | null {
    return _points.length > 0 ? _points[0] : null;
  },

  /**
   * Get the most recent breadcrumb point.
   */
  getLastPoint(): BreadcrumbPoint | null {
    return _points.length > 0 ? _points[_points.length - 1] : null;
  },

  /**
   * Get the current distance from start in miles.
   */
  getDistanceFromStartMi(): number {
    if (_points.length < 2) return 0;
    const start = _points[0];
    const last = _points[_points.length - 1];
    return haversineDistanceMi(
      last.latitude, last.longitude,
      start.latitude, start.longitude,
    );
  },

  /**
   * Get the total trail distance in miles.
   */
  getTotalTrailDistanceMi(): number {
    return _totalTrailDistanceMi;
  },

  /**
   * Get the total elevation gain in feet.
   */
  getElevationGainFt(): number {
    return Math.round(_elevationGainFt);
  },

  /**
   * Get the current config.
   */
  getConfig(): BreadcrumbConfig {
    return { ..._config };
  },

  /**
   * Update config values.
   */
  updateConfig(partial: Partial<BreadcrumbConfig>): void {
    _config = { ..._config, ...partial };
  },

  // ── Recording Control ─────────────────────────────────────

  /**
   * Start recording breadcrumbs.
   * Called when ExpeditionDrive mode activates or manually by the user.
   */
  startRecording(): void {
    if (_isRecording) return;

    _isRecording = true;
    _recordingStartedAt = new Date().toISOString();
    _lastRecordTime = 0;

    // Start position polling (every 2 seconds for responsive recording)
    _pollTimer = setInterval(_pollPosition, 2000);

    // Immediate first poll
    _pollPosition();

    console.log('[BreadcrumbTracker] Recording started');
    _notify();
  },

  /**
   * Stop recording breadcrumbs.
   * Called when expedition ends, app session ends, or user disables.
   * Points remain in memory until clearPoints() is called.
   */
  stopRecording(): void {
    if (!_isRecording) return;

    _isRecording = false;

    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }

    console.log(
      `[BreadcrumbTracker] Recording stopped — ${_points.length} points, ` +
      `${_totalTrailDistanceMi.toFixed(2)} mi trail`
    );
    _notify();
  },

  /**
   * Whether recording is active.
   */
  isRecording(): boolean {
    return _isRecording;
  },

  // ── Return to Start ───────────────────────────────────────

  /**
   * Generate a return-to-start route from the current position
   * to the first breadcrumb point.
   *
   * If routing cannot be calculated, provides the breadcrumb trail
   * reversed for the driver to follow back.
   */
  returnToStart(): ReturnToStartRoute | null {
    if (_points.length < 2) {
      console.warn('[BreadcrumbTracker] Cannot return to start — insufficient breadcrumbs');
      return null;
    }

    const startPoint = _points[0];
    const lastPoint = _points[_points.length - 1];

    // Straight-line distance
    const straightLineDistanceMi = haversineDistanceMi(
      lastPoint.latitude, lastPoint.longitude,
      startPoint.latitude, startPoint.longitude,
    );

    // Bearing from current to start
    const bearingDeg = calculateBearing(
      lastPoint.latitude, lastPoint.longitude,
      startPoint.latitude, startPoint.longitude,
    );

    // Reverse the breadcrumb trail for following back
    const trailPoints = _points
      .slice()
      .reverse()
      .map(p => ({
        latitude: p.latitude,
        longitude: p.longitude,
      }));

    // Calculate trail distance (same as total trail distance)
    const trailDistanceMi = _totalTrailDistanceMi;

    _isReturningToStart = true;
    _notify();

    console.log(
      `[BreadcrumbTracker] Return to start — ` +
      `straight: ${straightLineDistanceMi.toFixed(2)} mi, ` +
      `trail: ${trailDistanceMi.toFixed(2)} mi, ` +
      `bearing: ${Math.round(bearingDeg)}°`
    );

    return {
      from: { latitude: lastPoint.latitude, longitude: lastPoint.longitude },
      to: { latitude: startPoint.latitude, longitude: startPoint.longitude },
      straightLineDistanceMi: Math.round(straightLineDistanceMi * 100) / 100,
      bearingDeg: Math.round(bearingDeg),
      trailPoints,
      trailDistanceMi: Math.round(trailDistanceMi * 100) / 100,
    };
  },

  /**
   * Cancel return-to-start navigation.
   */
  cancelReturnToStart(): void {
    _isReturningToStart = false;
    _notify();
  },

  /**
   * Whether return-to-start is currently active.
   */
  isReturningToStart(): boolean {
    return _isReturningToStart;
  },

  // ── Data Management ───────────────────────────────────────

  /**
   * Clear all breadcrumb points.
   * Called when starting a new expedition or resetting.
   */
  clearPoints(): void {
    _points = [];
    _totalTrailDistanceMi = 0;
    _elevationGainFt = 0;
    _elevationLossFt = 0;
    _isReturningToStart = false;
    _recordingStartedAt = null;
    _lastRecordTime = 0;
    console.log('[BreadcrumbTracker] Points cleared');
    _notify();
  },

  /**
   * Manually add a breadcrumb point.
   * Used for feeding positions from external sources.
   */
  addPoint(
    latitude: number,
    longitude: number,
    altitudeM?: number | null,
    speedMph?: number | null,
    headingDeg?: number | null,
  ): void {
    _recordPoint(
      latitude,
      longitude,
      altitudeM ?? null,
      speedMph ?? null,
      headingDeg ?? null,
    );
  },

  /**
   * Full reset — stop recording and clear all data.
   */
  reset(): void {
    breadcrumbTracker.stopRecording();
    breadcrumbTracker.clearPoints();
    _config = { ...DEFAULT_CONFIG };
    _notify();
  },

  // ── Serialization ─────────────────────────────────────────

  /**
   * Get a simplified representation of the breadcrumb trail
   * for pushing to Android Auto via SharedPreferences.
   *
   * Returns a downsampled set of coordinates to keep the
   * data size manageable for the native layer.
   */
  getTrailForNative(): {
    pointCount: number;
    distanceFromStartMi: number;
    totalTrailDistanceMi: number;
    elevationGainFt: number;
    isRecording: boolean;
    canReturnToStart: boolean;
    isReturningToStart: boolean;
    bearingToStartDeg: number | null;
    startLat: number | null;
    startLon: number | null;
    /** Downsampled trail coordinates (max 100 points) */
    trail: Array<[number, number]>;
  } {
    const state = breadcrumbTracker.get();

    // Downsample trail to max 100 points for native layer
    const trail: Array<[number, number]> = [];
    if (_points.length > 0) {
      const step = Math.max(1, Math.floor(_points.length / 100));
      for (let i = 0; i < _points.length; i += step) {
        trail.push([_points[i].latitude, _points[i].longitude]);
      }
      // Always include the last point
      const last = _points[_points.length - 1];
      if (trail.length === 0 || trail[trail.length - 1][0] !== last.latitude) {
        trail.push([last.latitude, last.longitude]);
      }
    }

    return {
      pointCount: state.pointCount,
      distanceFromStartMi: state.distanceFromStartMi,
      totalTrailDistanceMi: state.totalTrailDistanceMi,
      elevationGainFt: state.elevationGainFt,
      isRecording: state.isRecording,
      canReturnToStart: state.canReturnToStart,
      isReturningToStart: state.isReturningToStart,
      bearingToStartDeg: state.bearingToStartDeg,
      startLat: state.startPoint?.latitude ?? null,
      startLon: state.startPoint?.longitude ?? null,
      trail,
    };
  },

  // ── Subscription ──────────────────────────────────────────

  /**
   * Subscribe to breadcrumb state changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  // ── Format Helpers ────────────────────────────────────────

  /**
   * Format distance for display.
   */
  formatDistance(miles: number): string {
    if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
    if (miles < 10) return `${miles.toFixed(2)} mi`;
    if (miles < 100) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
  },

  /**
   * Format bearing as compass direction.
   */
  formatBearing(degrees: number): string {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(degrees / 22.5) % 16;
    return dirs[idx];
  },

  /**
   * Format duration in seconds to human-readable string.
   */
  formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${Math.round(seconds)}s`;
  },
};

