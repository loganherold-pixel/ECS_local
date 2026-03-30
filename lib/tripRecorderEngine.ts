/**
 * ═══════════════════════════════════════════════════════════
 * ECS TRIP RECORDER ENGINE
 * ═══════════════════════════════════════════════════════════
 *
 * Automated expedition recording system that logs:
 *   - GPS route trace with distance, speed, elevation
 *   - Expedition events (start, camp, completion, alerts, notes)
 *   - Resource snapshots (fuel, water, power, OBD telemetry)
 *   - Trip summary generation on completion
 *
 * Architecture:
 *   - Singleton engine with subscribe/get pattern
 *   - Integrates with expeditionStateStore for auto-start/stop
 *   - Uses breadcrumbTracker for GPS data
 *   - Reads telemetryConfigStore for resource levels
 *   - Offline-first: all data stored locally
 *   - Background operation: no manual intervention required
 *
 * Lifecycle:
 *   1. Engine.init() — subscribe to expedition state changes
 *   2. Expedition starts → auto-start recording
 *   3. GPS polling records route points
 *   4. Periodic resource snapshots
 *   5. Events logged via timeline integration
 *   6. Expedition ends → auto-stop, generate summary, persist
 */

import { Platform } from 'react-native';
import type {
  RecordingState,
  TripEventType,
  TripEvent,
  ResourceSnapshot,
  TripRoutePoint,
  TripRecord,
  TripSummary,
  ActiveRecordingState,
  TripRecorderConfig,
} from './tripRecorderTypes';
import { DEFAULT_RECORDER_CONFIG } from './tripRecorderTypes';

const TAG = '[TRIP_RECORDER]';

// ── Storage Helpers ──────────────────────────────────────────

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

function now(): string { return new Date().toISOString(); }

function estimateSize(obj: any): number {
  try {
    const json = JSON.stringify(obj);
    return json ? json.length * 2 : 0;
  } catch { return 0; }
}

// ── Storage Keys ─────────────────────────────────────────────

const KEYS = {
  activeTrip: 'ecs_trip_recorder_active',
  tripLog: 'ecs_trip_recorder_log',
  config: 'ecs_trip_recorder_config',
};

// ── Haversine ────────────────────────────────────────────────

const EARTH_RADIUS_MI = 3958.8;
const EARTH_RADIUS_M = 6371000;
const M_TO_FT = 3.28084;

function haversineDistanceMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Internal State ───────────────────────────────────────────

let _config: TripRecorderConfig = { ...DEFAULT_RECORDER_CONFIG };
let _activeTrip: TripRecord | null = null;
let _recordingState: RecordingState = 'idle';
let _gpsPollTimer: ReturnType<typeof setInterval> | null = null;
let _resourceTimer: ReturnType<typeof setInterval> | null = null;
let _expeditionUnsub: (() => void) | null = null;
let _initialized = false;

// Tracking state
let _lastRecordTime = 0;
let _lastResourceTime = 0;
let _totalDistanceMi = 0;
let _maxSpeedMph = 0;
let _maxAltitudeFt: number | null = null;
let _minAltitudeFt: number | null = null;
let _elevationGainFt = 0;
let _elevationLossFt = 0;
let _lastAltitudeM: number | null = null;
let _pointsRecorded = 0;
let _lastDistanceMilestone = 0;
let _lastElevationMilestone = 0;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Config Management ────────────────────────────────────────

function loadConfig(): TripRecorderConfig {
  try {
    const raw = sGet(KEYS.config);
    if (raw) return { ...DEFAULT_RECORDER_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_RECORDER_CONFIG };
}

function saveConfig(config: TripRecorderConfig): void {
  sSet(KEYS.config, JSON.stringify(config));
}

// ── Trip Log (completed trips) ───────────────────────────────

function loadTripLog(): TripRecord[] {
  try {
    const raw = sGet(KEYS.tripLog);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveTripLog(trips: TripRecord[]): void {
  try {
    sSet(KEYS.tripLog, JSON.stringify(trips));
  } catch (e) {
    console.error(TAG, 'Failed to save trip log:', e);
  }
}

// ── Active Trip Persistence ──────────────────────────────────

function persistActiveTrip(): void {
  if (_activeTrip) {
    try {
      sSet(KEYS.activeTrip, JSON.stringify(_activeTrip));
    } catch {}
  } else {
    sSet(KEYS.activeTrip, '');
  }
}

function restoreActiveTrip(): TripRecord | null {
  try {
    const raw = sGet(KEYS.activeTrip);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// ── Resource Snapshot Collection ─────────────────────────────

function collectResourceSnapshot(distanceMi: number): ResourceSnapshot {
  const snapshot: ResourceSnapshot = {
    timestamp: now(),
    distanceMi,
    fuelGal: null,
    fuelPercent: null,
    waterL: null,
    waterPercent: null,
    batteryPercent: null,
    batteryWh: null,
    solarWatts: null,
    coolantTempF: null,
    engineRpm: null,
    batteryVoltage: null,
  };

  // Try to read telemetry config for active expedition
  try {
    const { telemetryConfigStore } = require('./telemetryStore');
    const expeditionId = _activeTrip?.expeditionId;
    if (expeditionId) {
      const config = telemetryConfigStore.get(expeditionId);
      if (config) {
        snapshot.fuelGal = config.fuelRemainingGal;
        if (config.fuelCapacityGal && config.fuelRemainingGal != null) {
          snapshot.fuelPercent = Math.round((config.fuelRemainingGal / config.fuelCapacityGal) * 100);
        }
        snapshot.waterL = config.waterRemainingL;
        if (config.waterCapacityL && config.waterRemainingL != null) {
          snapshot.waterPercent = Math.round((config.waterRemainingL / config.waterCapacityL) * 100);
        }
        if (config.powerConfigured && config.powerCapacityWh) {
          snapshot.batteryWh = config.powerRemainingWh;
          snapshot.batteryPercent = Math.round(((config.powerRemainingWh || 0) / config.powerCapacityWh) * 100);
        }
      }
    }
  } catch {}

  // Try to read OBD telemetry
  try {
    const { VehicleTelemetryStore } = require('../src/vehicle-telemetry/VehicleTelemetryStore');
    const obdState = VehicleTelemetryStore?.getState?.();
    if (obdState?.connected && obdState?.latestData) {
      const data = obdState.latestData;
      if (data.coolantTemp != null) snapshot.coolantTempF = Math.round(data.coolantTemp * 9 / 5 + 32);
      if (data.rpm != null) snapshot.engineRpm = data.rpm;
      if (data.batteryVoltage != null) snapshot.batteryVoltage = data.batteryVoltage;
    }
  } catch {}

  // Try to read power telemetry
  try {
    const { PowerTelemetryManager } = require('../src/power/telemetry/PowerTelemetryManager');
    const powerState = PowerTelemetryManager?.getLatest?.();
    if (powerState) {
      if (powerState.soc != null) snapshot.batteryPercent = snapshot.batteryPercent ?? powerState.soc;
      if (powerState.solarInputWatts != null) snapshot.solarWatts = powerState.solarInputWatts;
    }
  } catch {}

  return snapshot;
}

// ── GPS Position Reading ─────────────────────────────────────

function readGPSPosition(): {
  lat: number;
  lng: number;
  altitudeM: number | null;
  speedMph: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
} | null {
  try {
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();
    if (!gps.hasFix || !gps.position) return null;
    return {
      lat: gps.position.latitude,
      lng: gps.position.longitude,
      altitudeM: gps.position.altitudeM ?? null,
      speedMph: gps.position.speedMph ?? null,
      headingDeg: gps.position.headingDeg ?? null,
      accuracyM: gps.position.accuracyM ?? null,
    };
  } catch {
    return null;
  }
}

// ── GPS Poll Handler ─────────────────────────────────────────

function _pollGPS(): void {
  if (_recordingState !== 'recording' || !_activeTrip) return;

  const pos = readGPSPosition();
  if (!pos) return;

  // Reject poor accuracy
  if (pos.accuracyM != null && pos.accuracyM > 50) return;

  const nowMs = Date.now();

  // Check time interval
  if (nowMs - _lastRecordTime < _config.gpsIntervalSec * 1000) return;

  // Check distance interval
  const points = _activeTrip.routePoints;
  if (points.length > 0) {
    const lastPt = points[points.length - 1];
    const distM = haversineDistanceM(lastPt.lat, lastPt.lng, pos.lat, pos.lng);
    if (distM < _config.minDistanceM && nowMs - _lastRecordTime < _config.gpsIntervalSec * 2000) {
      return;
    }
  }

  // Calculate cumulative distance
  let segmentMi = 0;
  if (points.length > 0) {
    const lastPt = points[points.length - 1];
    segmentMi = haversineDistanceMi(lastPt.lat, lastPt.lng, pos.lat, pos.lng);

    // Filter teleport jumps
    if (segmentMi > 2.0) return;

    _totalDistanceMi += segmentMi;
  }

  // Track speed
  if (pos.speedMph != null && pos.speedMph > _maxSpeedMph) {
    _maxSpeedMph = pos.speedMph;
  }

  // Track altitude
  const altFt = pos.altitudeM != null ? Math.round(pos.altitudeM * M_TO_FT) : null;
  if (altFt != null) {
    if (_maxAltitudeFt === null || altFt > _maxAltitudeFt) _maxAltitudeFt = altFt;
    if (_minAltitudeFt === null || altFt < _minAltitudeFt) _minAltitudeFt = altFt;
  }

  // Track elevation changes
  if (pos.altitudeM != null && _lastAltitudeM != null) {
    const dElev = pos.altitudeM - _lastAltitudeM;
    if (dElev > 1) _elevationGainFt += dElev * M_TO_FT;
    else if (dElev < -1) _elevationLossFt += Math.abs(dElev) * M_TO_FT;
  }
  if (pos.altitudeM != null) _lastAltitudeM = pos.altitudeM;

  // Record point
  const routePoint: TripRoutePoint = {
    lat: pos.lat,
    lng: pos.lng,
    timestamp: now(),
    altitudeFt: altFt,
    speedMph: pos.speedMph != null ? Math.round(pos.speedMph * 10) / 10 : null,
    headingDeg: pos.headingDeg != null ? Math.round(pos.headingDeg) : null,
    cumulativeDistanceMi: Math.round(_totalDistanceMi * 100) / 100,
  };

  _activeTrip.routePoints.push(routePoint);
  _pointsRecorded++;
  _lastRecordTime = nowMs;

  // Downsample if too many points
  if (_activeTrip.routePoints.length > _config.maxRoutePoints) {
    const pts = _activeTrip.routePoints;
    const downsampled: TripRoutePoint[] = [];
    const halfIdx = Math.floor(pts.length / 2);
    for (let i = 0; i < halfIdx; i += 2) {
      downsampled.push(pts[i]);
    }
    for (let i = halfIdx; i < pts.length; i++) {
      downsampled.push(pts[i]);
    }
    _activeTrip.routePoints = downsampled;
  }

  // Update trip stats
  _activeTrip.distanceMi = Math.round(_totalDistanceMi * 100) / 100;
  _activeTrip.maxSpeedMph = Math.round(_maxSpeedMph * 10) / 10;
  _activeTrip.maxAltitudeFt = _maxAltitudeFt;
  _activeTrip.minAltitudeFt = _minAltitudeFt;
  _activeTrip.elevationGainFt = Math.round(_elevationGainFt);
  _activeTrip.elevationLossFt = Math.round(_elevationLossFt);
  _activeTrip.totalPointsRecorded = _pointsRecorded;

  // Calculate average speed
  const elapsedSec = _computeElapsedSec();
  if (elapsedSec > 0 && _totalDistanceMi > 0) {
    _activeTrip.avgSpeedMph = Math.round((_totalDistanceMi / (elapsedSec / 3600)) * 10) / 10;
  }

  // Check distance milestones
  _checkDistanceMilestones();

  // Check elevation milestones
  _checkElevationMilestones();

  // Persist periodically (every 30 points)
  if (_pointsRecorded % 30 === 0) {
    persistActiveTrip();
  }

  _notify();
}

// ── Resource Snapshot Timer ──────────────────────────────────

function _takeResourceSnapshot(): void {
  if (_recordingState !== 'recording' || !_activeTrip) return;

  const snapshot = collectResourceSnapshot(_totalDistanceMi);
  _activeTrip.resourceSnapshots.push(snapshot);

  // Keep max 200 snapshots
  if (_activeTrip.resourceSnapshots.length > 200) {
    // Downsample: keep every other from first half
    const snaps = _activeTrip.resourceSnapshots;
    const downsampled: ResourceSnapshot[] = [];
    const halfIdx = Math.floor(snaps.length / 2);
    for (let i = 0; i < halfIdx; i += 2) {
      downsampled.push(snaps[i]);
    }
    for (let i = halfIdx; i < snaps.length; i++) {
      downsampled.push(snaps[i]);
    }
    _activeTrip.resourceSnapshots = downsampled;
  }

  // Log as event
  _addEvent('resource_snapshot', 'Resource levels recorded', {
    fuelPercent: snapshot.fuelPercent,
    waterPercent: snapshot.waterPercent,
    batteryPercent: snapshot.batteryPercent,
  });

  persistActiveTrip();
}

// ── Milestone Checks ─────────────────────────────────────────

function _checkDistanceMilestones(): void {
  if (!_activeTrip) return;
  for (const milestone of _config.distanceMilestones) {
    if (_totalDistanceMi >= milestone && _lastDistanceMilestone < milestone) {
      _lastDistanceMilestone = milestone;
      _addEvent('distance_milestone', `${milestone} miles traveled`, { milestone });
    }
  }
}

function _checkElevationMilestones(): void {
  if (!_activeTrip || _maxAltitudeFt === null) return;
  for (const milestone of _config.elevationMilestones) {
    if (_maxAltitudeFt >= milestone && _lastElevationMilestone < milestone) {
      _lastElevationMilestone = milestone;
      _addEvent('elevation_milestone', `Reached ${milestone.toLocaleString()} ft elevation`, { milestone });
    }
  }
}

// ── Event Helpers ────────────────────────────────────────────

function _addEvent(type: TripEventType, description: string, meta: Record<string, any> = {}): TripEvent | null {
  if (!_activeTrip) return null;

  const pos = readGPSPosition();
  const event: TripEvent = {
    id: uuid(),
    tripId: _activeTrip.id,
    type,
    timestamp: now(),
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    altitudeFt: pos?.altitudeM != null ? Math.round(pos.altitudeM * M_TO_FT) : null,
    distanceAtEventMi: Math.round(_totalDistanceMi * 100) / 100,
    description,
    meta,
  };

  _activeTrip.events.push(event);

  // Keep max 500 events
  if (_activeTrip.events.length > 500) {
    _activeTrip.events = _activeTrip.events.slice(-500);
  }

  _notify();
  return event;
}

// ── Elapsed Time Calculation ─────────────────────────────────

function _computeElapsedSec(): number {
  if (!_activeTrip) return 0;
  const startMs = new Date(_activeTrip.startedAt).getTime();
  const nowMs = Date.now();
  const totalMs = nowMs - startMs;
  let pausedMs = _activeTrip.totalPausedMs || 0;
  if (_recordingState === 'paused' && _activeTrip.pausedAt) {
    pausedMs += nowMs - new Date(_activeTrip.pausedAt).getTime();
  }
  return Math.round(Math.max(0, totalMs - pausedMs) / 1000);
}

// ── Timer Management ─────────────────────────────────────────

function _startTimers(): void {
  _stopTimers();

  // GPS poll every 2 seconds
  _gpsPollTimer = setInterval(_pollGPS, 2000);

  // Resource snapshot at configured interval
  _resourceTimer = setInterval(_takeResourceSnapshot, _config.resourceSnapshotIntervalSec * 1000);

  // Immediate first poll
  setTimeout(_pollGPS, 500);
}

function _stopTimers(): void {
  if (_gpsPollTimer) {
    clearInterval(_gpsPollTimer);
    _gpsPollTimer = null;
  }
  if (_resourceTimer) {
    clearInterval(_resourceTimer);
    _resourceTimer = null;
  }
}

// ── Reset Tracking State ─────────────────────────────────────

function _resetTrackingState(): void {
  _totalDistanceMi = 0;
  _maxSpeedMph = 0;
  _maxAltitudeFt = null;
  _minAltitudeFt = null;
  _elevationGainFt = 0;
  _elevationLossFt = 0;
  _lastAltitudeM = null;
  _pointsRecorded = 0;
  _lastRecordTime = 0;
  _lastResourceTime = 0;
  _lastDistanceMilestone = 0;
  _lastElevationMilestone = 0;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API — tripRecorderEngine
// ══════════════════════════════════════════════════════════════

export const tripRecorderEngine = {

  // ── Initialization ─────────────────────────────────────────

  /**
   * Initialize the trip recorder engine.
   * Subscribes to expedition state changes for auto-start/stop.
   * Restores any in-progress recording from local storage.
   */
  init(): void {
    if (_initialized) return;
    _initialized = true;

    _config = loadConfig();

    // Restore active trip if app was closed during recording
    const restored = restoreActiveTrip();
    if (restored && (restored.state === 'recording' || restored.state === 'paused')) {
      _activeTrip = restored;
      _recordingState = restored.state;
      _totalDistanceMi = restored.distanceMi;
      _maxSpeedMph = restored.maxSpeedMph;
      _maxAltitudeFt = restored.maxAltitudeFt;
      _minAltitudeFt = restored.minAltitudeFt;
      _elevationGainFt = restored.elevationGainFt;
      _elevationLossFt = restored.elevationLossFt;
      _pointsRecorded = restored.totalPointsRecorded;

      if (_recordingState === 'recording') {
        _startTimers();
        _addEvent('trip_resumed', 'Recording resumed after app restart');
      }

      console.log(TAG, `Restored active trip: ${restored.id} (${restored.state})`);
    }

    // Subscribe to expedition state changes
    try {
      const { expeditionStateStore } = require('./expeditionStateStore');
      _expeditionUnsub = expeditionStateStore.subscribe((state: string, record: any) => {
        if (!_config.autoStartOnExpedition) return;

        if (state === 'active' && _recordingState === 'idle') {
          // Auto-start recording when expedition begins
          tripRecorderEngine.startRecording({
            expeditionId: record?.id || null,
            expeditionName: record?.vehicleName ? `${record.vehicleName} Expedition` : 'Expedition',
            vehicleId: record?.activeVehicleId || null,
            vehicleName: record?.vehicleName || null,
          });
        } else if (state === 'paused' && _recordingState === 'recording') {
          // Auto-pause when expedition pauses
          tripRecorderEngine.pauseRecording();
        } else if (state === 'active' && _recordingState === 'paused') {
          // Auto-resume when expedition resumes
          tripRecorderEngine.resumeRecording();
        } else if ((state === 'complete' || state === 'standby') && _recordingState !== 'idle') {
          // Auto-stop when expedition ends
          if (_config.autoStopOnExpedition) {
            tripRecorderEngine.stopRecording();
          }
        }
      });
    } catch (e) {
      console.warn(TAG, 'Failed to subscribe to expedition state:', e);
    }

    console.log(TAG, 'Trip Recorder Engine initialized');
    _notify();
  },

  /**
   * Destroy the engine and clean up.
   */
  destroy(): void {
    _stopTimers();
    if (_expeditionUnsub) {
      _expeditionUnsub();
      _expeditionUnsub = null;
    }
    _initialized = false;
    console.log(TAG, 'Trip Recorder Engine destroyed');
  },

  // ── Recording Control ──────────────────────────────────────

  /**
   * Start a new trip recording.
   */
  startRecording(params?: {
    expeditionId?: string | null;
    expeditionName?: string | null;
    vehicleId?: string | null;
    vehicleName?: string | null;
    name?: string;
  }): TripRecord {
    // Stop any existing recording first
    if (_activeTrip && _recordingState !== 'idle') {
      tripRecorderEngine.stopRecording();
    }

    _resetTrackingState();

    const tripId = uuid();
    const startTime = now();
    const pos = readGPSPosition();

    // Generate default name
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const defaultName = params?.name || (params?.expeditionName
      ? `${params.expeditionName} — ${dateStr}`
      : `Trip ${dateStr}`);

    // Collect starting resources
    const startResources = collectResourceSnapshot(0);

    _activeTrip = {
      id: tripId,
      expeditionId: params?.expeditionId ?? null,
      expeditionName: params?.expeditionName ?? null,
      vehicleId: params?.vehicleId ?? null,
      vehicleName: params?.vehicleName ?? null,
      name: defaultName,
      state: 'recording',
      startedAt: startTime,
      endedAt: null,
      pausedAt: null,
      totalPausedMs: 0,
      durationSec: 0,
      distanceMi: 0,
      avgSpeedMph: 0,
      maxSpeedMph: 0,
      maxAltitudeFt: pos?.altitudeM != null ? Math.round(pos.altitudeM * M_TO_FT) : null,
      minAltitudeFt: pos?.altitudeM != null ? Math.round(pos.altitudeM * M_TO_FT) : null,
      elevationGainFt: 0,
      elevationLossFt: 0,
      peakRemoteness: null,
      routePoints: [],
      totalPointsRecorded: 0,
      events: [],
      resourceSnapshots: [startResources],
      startResources,
      endResources: null,
      notes: '',
      storageBytes: 0,
      savedAt: startTime,
      cloudSynced: false,
    };

    _recordingState = 'recording';

    // Record start event
    _addEvent('trip_started', `Trip recording started: ${defaultName}`, {
      vehicleName: params?.vehicleName,
      expeditionId: params?.expeditionId,
    });

    // Start GPS and resource timers
    _startTimers();

    // Persist
    persistActiveTrip();

    console.log(TAG, `Recording started: ${tripId} — ${defaultName}`);
    _notify();
    return _activeTrip;
  },

  /**
   * Pause the current recording.
   */
  pauseRecording(): void {
    if (!_activeTrip || _recordingState !== 'recording') return;

    _recordingState = 'paused';
    _activeTrip.state = 'paused';
    _activeTrip.pausedAt = now();

    _stopTimers();

    _addEvent('trip_paused', 'Recording paused');

    persistActiveTrip();
    console.log(TAG, 'Recording paused');
    _notify();
  },

  /**
   * Resume a paused recording.
   */
  resumeRecording(): void {
    if (!_activeTrip || _recordingState !== 'paused') return;

    // Accumulate paused duration
    if (_activeTrip.pausedAt) {
      const pausedMs = Date.now() - new Date(_activeTrip.pausedAt).getTime();
      _activeTrip.totalPausedMs = (_activeTrip.totalPausedMs || 0) + Math.max(0, pausedMs);
    }

    _recordingState = 'recording';
    _activeTrip.state = 'recording';
    _activeTrip.pausedAt = null;

    _startTimers();

    _addEvent('trip_resumed', 'Recording resumed');

    persistActiveTrip();
    console.log(TAG, 'Recording resumed');
    _notify();
  },

  /**
   * Stop recording and finalize the trip.
   */
  stopRecording(): TripRecord | null {
    if (!_activeTrip || _recordingState === 'idle') return null;

    // Accumulate final pause if paused
    if (_recordingState === 'paused' && _activeTrip.pausedAt) {
      const pausedMs = Date.now() - new Date(_activeTrip.pausedAt).getTime();
      _activeTrip.totalPausedMs = (_activeTrip.totalPausedMs || 0) + Math.max(0, pausedMs);
    }

    _stopTimers();

    const endTime = now();
    const elapsedSec = _computeElapsedSec();

    // Collect ending resources
    const endResources = collectResourceSnapshot(_totalDistanceMi);

    // Finalize trip record
    _activeTrip.state = 'stopped';
    _activeTrip.endedAt = endTime;
    _activeTrip.pausedAt = null;
    _activeTrip.durationSec = elapsedSec;
    _activeTrip.distanceMi = Math.round(_totalDistanceMi * 100) / 100;
    _activeTrip.endResources = endResources;
    _activeTrip.resourceSnapshots.push(endResources);

    // Read peak remoteness
    try {
      const { remotenessStore } = require('./remotenessStore');
      const remoteness = remotenessStore?.getCurrent?.();
      if (remoteness?.score != null) {
        _activeTrip.peakRemoteness = Math.max(
          _activeTrip.peakRemoteness ?? 0,
          remoteness.score,
        );
      }
    } catch {}

    // Record end event
    _addEvent('trip_ended', `Trip completed: ${_activeTrip.distanceMi} mi, ${formatDuration(elapsedSec)}`, {
      distanceMi: _activeTrip.distanceMi,
      durationSec: elapsedSec,
      avgSpeedMph: _activeTrip.avgSpeedMph,
      maxSpeedMph: _activeTrip.maxSpeedMph,
      elevationGainFt: _activeTrip.elevationGainFt,
    });

    // Calculate storage size
    _activeTrip.storageBytes = estimateSize(_activeTrip);
    _activeTrip.savedAt = endTime;

    // Save to trip log
    const trips = loadTripLog();
    trips.unshift({ ..._activeTrip });
    if (trips.length > _config.maxStoredTrips) {
      trips.length = _config.maxStoredTrips;
    }
    saveTripLog(trips);

    const completedTrip = { ..._activeTrip };

    // Clear active trip
    _recordingState = 'idle';
    _activeTrip = null;
    sSet(KEYS.activeTrip, '');

    console.log(TAG, `Recording stopped: ${completedTrip.id} — ${completedTrip.distanceMi} mi, ${formatDuration(elapsedSec)}`);
    _notify();
    return completedTrip;
  },

  // ── Event Logging ──────────────────────────────────────────

  /**
   * Add a user note to the current trip.
   */
  addNote(text: string): TripEvent | null {
    if (!_activeTrip || _recordingState === 'idle') return null;
    return _addEvent('user_note', text);
  },

  /**
   * Log a camp stop.
   */
  logCampStop(description?: string): TripEvent | null {
    if (!_activeTrip || _recordingState === 'idle') return null;
    return _addEvent('camp_stop', description || 'Camp stop recorded');
  },

  /**
   * Log a fuel stop.
   */
  logFuelStop(gallonsAdded?: number): TripEvent | null {
    if (!_activeTrip || _recordingState === 'idle') return null;
    return _addEvent('fuel_stop', gallonsAdded
      ? `Refueled: ${gallonsAdded.toFixed(1)} gal`
      : 'Fuel stop recorded',
      { gallonsAdded },
    );
  },

  /**
   * Log a water resupply.
   */
  logWaterResupply(litersAdded?: number): TripEvent | null {
    if (!_activeTrip || _recordingState === 'idle') return null;
    return _addEvent('water_resupply', litersAdded
      ? `Water resupply: ${litersAdded.toFixed(1)} L`
      : 'Water resupply recorded',
      { litersAdded },
    );
  },

  /**
   * Log a checkpoint reached.
   */
  logCheckpoint(name?: string): TripEvent | null {
    if (!_activeTrip || _recordingState === 'idle') return null;
    return _addEvent('checkpoint_reached', name || 'Checkpoint reached');
  },

  /**
   * Log a custom event.
   */
  logEvent(type: TripEventType, description: string, meta?: Record<string, any>): TripEvent | null {
    if (!_activeTrip || _recordingState === 'idle') return null;
    return _addEvent(type, description, meta || {});
  },

  // ── State Access ───────────────────────────────────────────

  /**
   * Get the current active recording state.
   */
  getActiveState(): ActiveRecordingState {
    if (!_activeTrip || _recordingState === 'idle') {
      return {
        state: 'idle',
        tripId: null,
        tripName: null,
        elapsedSec: 0,
        distanceMi: 0,
        currentSpeedMph: null,
        avgSpeedMph: 0,
        maxSpeedMph: 0,
        currentAltitudeFt: null,
        maxAltitudeFt: null,
        elevationGainFt: 0,
        eventCount: 0,
        pointCount: 0,
        snapshotCount: 0,
        lastEventDescription: null,
        lastEventType: null,
        isExpeditionLinked: false,
      };
    }

    const pos = readGPSPosition();
    const lastEvent = _activeTrip.events.length > 0
      ? _activeTrip.events[_activeTrip.events.length - 1]
      : null;

    return {
      state: _recordingState,
      tripId: _activeTrip.id,
      tripName: _activeTrip.name,
      elapsedSec: _computeElapsedSec(),
      distanceMi: Math.round(_totalDistanceMi * 100) / 100,
      currentSpeedMph: pos?.speedMph != null ? Math.round(pos.speedMph * 10) / 10 : null,
      avgSpeedMph: _activeTrip.avgSpeedMph,
      maxSpeedMph: _activeTrip.maxSpeedMph,
      currentAltitudeFt: pos?.altitudeM != null ? Math.round(pos.altitudeM * M_TO_FT) : null,
      maxAltitudeFt: _maxAltitudeFt,
      elevationGainFt: Math.round(_elevationGainFt),
      eventCount: _activeTrip.events.length,
      pointCount: _pointsRecorded,
      snapshotCount: _activeTrip.resourceSnapshots.length,
      lastEventDescription: lastEvent?.description ?? null,
      lastEventType: lastEvent?.type ?? null,
      isExpeditionLinked: _activeTrip.expeditionId != null,
    };
  },

  /**
   * Get the recording state.
   */
  getRecordingState(): RecordingState {
    return _recordingState;
  },

  /**
   * Get the active trip record (if recording).
   */
  getActiveTrip(): TripRecord | null {
    return _activeTrip ? { ..._activeTrip } : null;
  },

  /**
   * Check if currently recording.
   */
  isRecording(): boolean {
    return _recordingState === 'recording';
  },

  /**
   * Check if paused.
   */
  isPaused(): boolean {
    return _recordingState === 'paused';
  },

  /**
   * Check if idle (not recording).
   */
  isIdle(): boolean {
    return _recordingState === 'idle';
  },

  // ── Trip Log Access ────────────────────────────────────────

  /**
   * Get all completed trips as summaries.
   */
  getTripSummaries(): TripSummary[] {
    const trips = loadTripLog();
    return trips.map(t => ({
      id: t.id,
      expeditionId: t.expeditionId,
      expeditionName: t.expeditionName,
      vehicleName: t.vehicleName,
      name: t.name,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      durationSec: t.durationSec,
      distanceMi: t.distanceMi,
      avgSpeedMph: t.avgSpeedMph,
      maxSpeedMph: t.maxSpeedMph,
      maxAltitudeFt: t.maxAltitudeFt,
      elevationGainFt: t.elevationGainFt,
      peakRemoteness: t.peakRemoteness,
      eventCount: t.events.length,
      routePointCount: t.routePoints.length,
      storageBytes: t.storageBytes,
      savedAt: t.savedAt,
      cloudSynced: t.cloudSynced,
      notes: t.notes,
    }));
  },

  /**
   * Get a full trip record by ID.
   */
  getTripById(tripId: string): TripRecord | null {
    const trips = loadTripLog();
    return trips.find(t => t.id === tripId) || null;
  },

  /**
   * Get trips for a specific expedition.
   */
  getTripsForExpedition(expeditionId: string): TripSummary[] {
    return tripRecorderEngine.getTripSummaries().filter(t => t.expeditionId === expeditionId);
  },

  /**
   * Rename a trip.
   */
  renameTrip(tripId: string, newName: string): boolean {
    const trips = loadTripLog();
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return false;
    trip.name = newName;
    saveTripLog(trips);
    _notify();
    return true;
  },

  /**
   * Add notes to a trip.
   */
  updateTripNotes(tripId: string, notes: string): boolean {
    const trips = loadTripLog();
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return false;
    trip.notes = notes;
    saveTripLog(trips);
    _notify();
    return true;
  },

  /**
   * Delete a trip.
   */
  deleteTrip(tripId: string): boolean {
    const trips = loadTripLog();
    const idx = trips.findIndex(t => t.id === tripId);
    if (idx === -1) return false;
    trips.splice(idx, 1);
    saveTripLog(trips);
    console.log(TAG, `Trip deleted: ${tripId}`);
    _notify();
    return true;
  },

  /**
   * Delete all trips.
   */
  deleteAllTrips(): number {
    const trips = loadTripLog();
    const count = trips.length;
    saveTripLog([]);
    console.log(TAG, `All ${count} trips deleted`);
    _notify();
    return count;
  },

  /**
   * Get trip count.
   */
  getTripCount(): number {
    return loadTripLog().length;
  },

  // ── Config ─────────────────────────────────────────────────

  /**
   * Get current config.
   */
  getConfig(): TripRecorderConfig {
    return { ..._config };
  },

  /**
   * Update config.
   */
  updateConfig(partial: Partial<TripRecorderConfig>): void {
    _config = { ..._config, ...partial };
    saveConfig(_config);
  },

  // ── Subscription ───────────────────────────────────────────

  /**
   * Subscribe to state changes.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  // ── Format Helpers ─────────────────────────────────────────

  /**
   * Get a compact status string for dashboard display.
   */
  getCompactStatus(): string {
    if (_recordingState === 'idle') return 'Not Recording';
    if (_recordingState === 'paused') return 'Paused';
    const state = tripRecorderEngine.getActiveState();
    return `${state.distanceMi} mi — ${formatDuration(state.elapsedSec)}`;
  },

  /**
   * Get route points for map replay.
   */
  getRouteForReplay(tripId: string): TripRoutePoint[] {
    const trip = tripRecorderEngine.getTripById(tripId);
    return trip?.routePoints ?? [];
  },

  /**
   * Get events for timeline display.
   */
  getEventsForTimeline(tripId: string): TripEvent[] {
    const trip = tripRecorderEngine.getTripById(tripId);
    return trip?.events ?? [];
  },

  /**
   * Get resource snapshots for chart display.
   */
  getResourceSnapshots(tripId: string): ResourceSnapshot[] {
    const trip = tripRecorderEngine.getTripById(tripId);
    return trip?.resourceSnapshots ?? [];
  },
};

// ── Format Helpers ───────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  if (miles < 10) return `${miles.toFixed(2)} mi`;
  if (miles < 100) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function formatSpeed(mph: number): string {
  return `${Math.round(mph)} mph`;
}

export function formatElevation(feet: number): string {
  return `${feet.toLocaleString()} ft`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


