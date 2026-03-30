// ============================================================
// ECS GPS DISTANCE TRACKER
// ============================================================
// Real-time GPS-based distance tracking for active expeditions.
// Calculates distance deltas between position updates using
// haversine formula, feeds into telemetryConfigStore.logDistance()
// for automatic fuel deduction based on MPG.
//
// Features:
//   - Foreground + background location tracking (expo-location)
//   - Battery-efficient settings with configurable accuracy
//   - Haversine distance calculation with noise filtering
//   - Automatic telemetry integration (fuel auto-deduct via MPG)
//   - Persistent odometer state across app restarts
//   - Pause/resume toggle
//   - Trip stats (distance, avg speed, max speed, elapsed)
//   - Speed, heading, elevation tracking
//   - Subscriber pattern for UI updates
// ============================================================

import { Platform } from 'react-native';
import { telemetryConfigStore } from './telemetryStore';
import { missionEventStore } from './missionStore';
import type { ExpeditionEventType } from './missionTypes';

const TAG = '[GPS_TRACKER]';

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

// ── Types ────────────────────────────────────────────────────

export type TrackingStatus = 'idle' | 'tracking' | 'paused' | 'error';
export type TrackingAccuracy = 'high' | 'balanced' | 'low';

export interface GPSTrackingPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;     // meters
  speed: number | null;        // m/s
  heading: number | null;      // degrees
  accuracy: number | null;     // meters
  timestamp: number;
}

export interface OdometerState {
  /** Total distance tracked in miles for this expedition */
  totalDistanceMi: number;
  /** Trip distance since last reset (miles) */
  tripDistanceMi: number;
  /** Timestamp when tracking started */
  trackingStartedAt: string | null;
  /** Total elapsed tracking time in seconds (excludes paused time) */
  elapsedTrackingSec: number;
  /** Average speed in mph (while moving) */
  avgSpeedMph: number;
  /** Max speed recorded in mph */
  maxSpeedMph: number;
  /** Current speed in mph */
  currentSpeedMph: number;
  /** Current heading in degrees */
  currentHeadingDeg: number | null;
  /** Current altitude in feet */
  currentAltitudeFt: number | null;
  /** GPS fix accuracy in meters */
  currentAccuracyM: number | null;
  /** Number of position samples collected */
  sampleCount: number;
  /** Last position */
  lastLat: number | null;
  lastLng: number | null;
  /** Last update timestamp */
  lastUpdateAt: string | null;
}

export interface TrackerConfig {
  /** Active expedition ID to track */
  expeditionId: string | null;
  /** Tracking status */
  status: TrackingStatus;
  /** Accuracy mode */
  accuracy: TrackingAccuracy;
  /** Minimum distance between updates (meters) */
  distanceFilterM: number;
  /** Minimum time between updates (ms) */
  timeIntervalMs: number;
  /** Whether background tracking is enabled */
  backgroundEnabled: boolean;
  /** Minimum speed to count as moving (mph) */
  movingThresholdMph: number;
  /** Minimum distance delta to accept (miles) - noise filter */
  minDeltaMi: number;
  /** Maximum distance delta per update (miles) - teleport filter */
  maxDeltaMi: number;
  /** Minimum accuracy to accept position (meters) */
  maxAccuracyM: number;
}

export interface TrackerSnapshot {
  config: TrackerConfig;
  odometer: OdometerState;
  fuelRangeMi: number | null;
  fuelRemainingGal: number | null;
  actualMpg: number | null;
  ratedMpg: number | null;
  fuelPercent: number | null;
}

type TrackerSubscriber = (snapshot: TrackerSnapshot) => void;

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY_CONFIG = 'ecs_gps_tracker_config';
const STORAGE_KEY_ODOMETER = 'ecs_gps_tracker_odometer';

const M_TO_FT = 3.28084;
const MPS_TO_MPH = 2.23694;
const EARTH_RADIUS_MI = 3958.8;

const DEFAULT_CONFIG: TrackerConfig = {
  expeditionId: null,
  status: 'idle',
  accuracy: 'balanced',
  distanceFilterM: 10,        // Update every 10m of movement
  timeIntervalMs: 5000,       // Or every 5 seconds
  backgroundEnabled: false,
  movingThresholdMph: 2,      // Must be > 2mph to count as moving
  minDeltaMi: 0.005,          // Ignore deltas < ~26ft (GPS noise)
  maxDeltaMi: 2.0,            // Ignore deltas > 2mi (teleport/bad fix)
  maxAccuracyM: 50,           // Reject fixes with accuracy > 50m
};

const DEFAULT_ODOMETER: OdometerState = {
  totalDistanceMi: 0,
  tripDistanceMi: 0,
  trackingStartedAt: null,
  elapsedTrackingSec: 0,
  avgSpeedMph: 0,
  maxSpeedMph: 0,
  currentSpeedMph: 0,
  currentHeadingDeg: null,
  currentAltitudeFt: null,
  currentAccuracyM: null,
  sampleCount: 0,
  lastLat: null,
  lastLng: null,
  lastUpdateAt: null,
};

// ── Haversine Distance ───────────────────────────────────────

function haversineDistanceMiles(
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

// ============================================================
// GPS DISTANCE TRACKER STORE (Singleton)
// ============================================================

class GPSDistanceTracker {
  private config: TrackerConfig;
  private odometer: OdometerState;
  private subscribers: TrackerSubscriber[] = [];
  private locationSubscription: any = null;
  private webWatchId: number | null = null;
  private lastPositionTime: number = 0;
  private movingSamples: number = 0;
  private totalSpeedSum: number = 0;
  private pausedAt: number | null = null;
  private trackingElapsedAtPause: number = 0;

  constructor() {
    this.config = this.loadConfig();
    this.odometer = this.loadOdometer();

    // If app was tracking when it closed, resume as paused
    if (this.config.status === 'tracking') {
      this.config.status = 'paused';
      this.saveConfig();
    }
  }

  // ── Persistence ────────────────────────────────────────────

  private loadConfig(): TrackerConfig {
    try {
      const raw = sGet(STORAGE_KEY_CONFIG);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    sSet(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
  }

  private loadOdometer(): OdometerState {
    try {
      const raw = sGet(STORAGE_KEY_ODOMETER);
      if (raw) return { ...DEFAULT_ODOMETER, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_ODOMETER };
  }

  private saveOdometer(): void {
    sSet(STORAGE_KEY_ODOMETER, JSON.stringify(this.odometer));
  }

  // ── Subscriber Pattern ─────────────────────────────────────

  subscribe(fn: TrackerSubscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== fn);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const fn of this.subscribers) {
      try { fn(snapshot); } catch {}
    }
  }

  // ── Public API ─────────────────────────────────────────────

  getConfig(): TrackerConfig {
    return { ...this.config };
  }

  getOdometer(): OdometerState {
    // Update elapsed time if currently tracking
    if (this.config.status === 'tracking' && this.odometer.trackingStartedAt) {
      const startTime = new Date(this.odometer.trackingStartedAt).getTime();
      const now = Date.now();
      const totalElapsed = (now - startTime) / 1000;
      // Subtract paused time
      this.odometer.elapsedTrackingSec = Math.max(0, totalElapsed - (this.trackingElapsedAtPause || 0));
    }
    return { ...this.odometer };
  }

  getSnapshot(): TrackerSnapshot {
    const odo = this.getOdometer();
    const config = this.getConfig();

    let fuelRangeMi: number | null = null;
    let fuelRemainingGal: number | null = null;
    let actualMpg: number | null = null;
    let ratedMpg: number | null = null;
    let fuelPercent: number | null = null;

    if (config.expeditionId) {
      const telConfig = telemetryConfigStore.get(config.expeditionId);
      ratedMpg = telConfig.fuelMpg;
      fuelRemainingGal = telConfig.fuelRemainingGal;

      if (telConfig.fuelCapacityGal && fuelRemainingGal !== null) {
        fuelPercent = Math.round((fuelRemainingGal / telConfig.fuelCapacityGal) * 100);
      }

      // Calculate actual MPG from tracked data
      if (odo.totalDistanceMi > 0.5 && telConfig.fuelCapacityGal && fuelRemainingGal !== null) {
        const fuelUsed = telConfig.fuelCapacityGal - fuelRemainingGal;
        if (fuelUsed > 0) {
          actualMpg = Math.round((odo.totalDistanceMi / fuelUsed) * 10) / 10;
        }
      }

      // Fuel range based on actual MPG (or rated if not enough data)
      const effectiveMpg = (actualMpg && odo.totalDistanceMi > 5) ? actualMpg : ratedMpg;
      if (effectiveMpg && fuelRemainingGal !== null) {
        fuelRangeMi = Math.round(fuelRemainingGal * effectiveMpg);
      }
    }

    return {
      config,
      odometer: odo,
      fuelRangeMi,
      fuelRemainingGal,
      actualMpg,
      ratedMpg,
      fuelPercent,
    };
  }

  getStatus(): TrackingStatus {
    return this.config.status;
  }

  isTracking(): boolean {
    return this.config.status === 'tracking';
  }

  // ── Start Tracking ─────────────────────────────────────────

  async startTracking(expeditionId: string, options?: Partial<TrackerConfig>): Promise<boolean> {
    if (this.config.status === 'tracking') {
      console.log(TAG, 'Already tracking');
      return true;
    }

    this.config.expeditionId = expeditionId;
    if (options) {
      Object.assign(this.config, options);
    }
    this.config.status = 'tracking';

    // Initialize odometer if fresh start
    if (!this.odometer.trackingStartedAt) {
      this.odometer.trackingStartedAt = new Date().toISOString();
      this.odometer.totalDistanceMi = 0;
      this.odometer.tripDistanceMi = 0;
      this.odometer.sampleCount = 0;
      this.odometer.elapsedTrackingSec = 0;
      this.odometer.avgSpeedMph = 0;
      this.odometer.maxSpeedMph = 0;
      this.movingSamples = 0;
      this.totalSpeedSum = 0;
      this.trackingElapsedAtPause = 0;

      // Sync initial distance from telemetry store
      const telConfig = telemetryConfigStore.get(expeditionId);
      if (telConfig.distanceTraveledMi > 0) {
        this.odometer.totalDistanceMi = telConfig.distanceTraveledMi;
      }
    }

    this.saveConfig();
    this.saveOdometer();

    // Log tracking start event
    missionEventStore.append(expeditionId, 'CHECKPOINT' as ExpeditionEventType, {
      label: 'GPS_TRACKING_STARTED',
      accuracy: this.config.accuracy,
      backgroundEnabled: this.config.backgroundEnabled,
    });

    // Start location watching
    const started = await this.startLocationWatch();

    if (!started) {
      this.config.status = 'error';
      this.saveConfig();
    }

    this.notify();
    console.log(TAG, `Tracking ${started ? 'started' : 'failed'} for expedition ${expeditionId}`);
    return started;
  }

  // ── Pause Tracking ─────────────────────────────────────────

  pauseTracking(): void {
    if (this.config.status !== 'tracking') return;

    this.config.status = 'paused';
    this.pausedAt = Date.now();

    // Save current elapsed time
    if (this.odometer.trackingStartedAt) {
      const startTime = new Date(this.odometer.trackingStartedAt).getTime();
      this.trackingElapsedAtPause += (Date.now() - startTime) / 1000 - this.odometer.elapsedTrackingSec;
    }

    this.stopLocationWatch();
    this.saveConfig();
    this.saveOdometer();
    this.notify();

    console.log(TAG, 'Tracking paused');
  }

  // ── Resume Tracking ────────────────────────────────────────

  async resumeTracking(): Promise<boolean> {
    if (this.config.status !== 'paused') return false;

    this.config.status = 'tracking';
    this.pausedAt = null;
    this.saveConfig();

    const started = await this.startLocationWatch();

    if (!started) {
      this.config.status = 'error';
      this.saveConfig();
    }

    this.notify();
    console.log(TAG, `Tracking ${started ? 'resumed' : 'resume failed'}`);
    return started;
  }

  // ── Stop Tracking ──────────────────────────────────────────

  stopTracking(): void {
    this.stopLocationWatch();
    this.config.status = 'idle';
    this.saveConfig();
    this.saveOdometer();
    this.notify();

    if (this.config.expeditionId) {
      missionEventStore.append(this.config.expeditionId, 'CHECKPOINT' as ExpeditionEventType, {
        label: 'GPS_TRACKING_STOPPED',
        totalDistanceMi: this.odometer.totalDistanceMi,
        tripDistanceMi: this.odometer.tripDistanceMi,
        avgSpeedMph: this.odometer.avgSpeedMph,
        maxSpeedMph: this.odometer.maxSpeedMph,
      });
    }

    console.log(TAG, `Tracking stopped. Total: ${this.odometer.totalDistanceMi.toFixed(2)} mi`);
  }

  // ── Reset Trip ─────────────────────────────────────────────

  resetTrip(): void {
    this.odometer.tripDistanceMi = 0;
    this.saveOdometer();
    this.notify();
  }

  // ── Reset All ──────────────────────────────────────────────

  resetAll(): void {
    this.stopLocationWatch();
    this.config = { ...DEFAULT_CONFIG };
    this.odometer = { ...DEFAULT_ODOMETER };
    this.movingSamples = 0;
    this.totalSpeedSum = 0;
    this.trackingElapsedAtPause = 0;
    this.pausedAt = null;
    this.saveConfig();
    this.saveOdometer();
    this.notify();
  }

  // ── Update Accuracy ────────────────────────────────────────

  setAccuracy(accuracy: TrackingAccuracy): void {
    this.config.accuracy = accuracy;

    switch (accuracy) {
      case 'high':
        this.config.distanceFilterM = 5;
        this.config.timeIntervalMs = 3000;
        this.config.maxAccuracyM = 30;
        break;
      case 'balanced':
        this.config.distanceFilterM = 10;
        this.config.timeIntervalMs = 5000;
        this.config.maxAccuracyM = 50;
        break;
      case 'low':
        this.config.distanceFilterM = 25;
        this.config.timeIntervalMs = 15000;
        this.config.maxAccuracyM = 100;
        break;
    }

    this.saveConfig();
    this.notify();

    // Restart watch if currently tracking
    if (this.config.status === 'tracking') {
      this.stopLocationWatch();
      this.startLocationWatch();
    }
  }

  // ── Toggle Background ──────────────────────────────────────

  async setBackgroundEnabled(enabled: boolean): Promise<void> {
    this.config.backgroundEnabled = enabled;
    this.saveConfig();
    this.notify();

    // Restart if tracking to apply background setting
    if (this.config.status === 'tracking') {
      this.stopLocationWatch();
      await this.startLocationWatch();
    }
  }

  // ── Process Position Update ────────────────────────────────

  processPosition(position: GPSTrackingPosition): void {
    if (this.config.status !== 'tracking') return;

    const { latitude, longitude, altitude, speed, heading, accuracy, timestamp } = position;

    // Filter bad accuracy
    if (accuracy !== null && accuracy > this.config.maxAccuracyM) {
      return;
    }

    // Update current telemetry values
    const speedMph = speed !== null && speed >= 0 ? speed * MPS_TO_MPH : 0;
    this.odometer.currentSpeedMph = Math.round(speedMph * 10) / 10;
    this.odometer.currentHeadingDeg = heading !== null && heading >= 0 ? Math.round(heading) : null;
    this.odometer.currentAltitudeFt = altitude !== null ? Math.round(altitude * M_TO_FT) : null;
    this.odometer.currentAccuracyM = accuracy !== null ? Math.round(accuracy) : null;
    this.odometer.sampleCount++;
    this.odometer.lastUpdateAt = new Date().toISOString();

    // Track max speed
    if (speedMph > this.odometer.maxSpeedMph) {
      this.odometer.maxSpeedMph = Math.round(speedMph * 10) / 10;
    }

    // Track average speed (only while moving)
    if (speedMph >= this.config.movingThresholdMph) {
      this.movingSamples++;
      this.totalSpeedSum += speedMph;
      this.odometer.avgSpeedMph = Math.round((this.totalSpeedSum / this.movingSamples) * 10) / 10;
    }

    // Calculate distance delta from last position
    if (this.odometer.lastLat !== null && this.odometer.lastLng !== null) {
      const deltaMi = haversineDistanceMiles(
        this.odometer.lastLat, this.odometer.lastLng,
        latitude, longitude,
      );

      // Apply noise and teleport filters
      if (deltaMi >= this.config.minDeltaMi && deltaMi <= this.config.maxDeltaMi) {
        // Only count distance if speed indicates movement
        if (speedMph >= this.config.movingThresholdMph || deltaMi > 0.01) {
          this.odometer.totalDistanceMi += deltaMi;
          this.odometer.tripDistanceMi += deltaMi;

          // Feed into telemetry store for automatic fuel deduction
          if (this.config.expeditionId) {
            telemetryConfigStore.logDistance(this.config.expeditionId, deltaMi);
          }
        }
      }
    }

    // Update last position
    this.odometer.lastLat = latitude;
    this.odometer.lastLng = longitude;
    this.lastPositionTime = timestamp;

    // Update elapsed tracking time
    if (this.odometer.trackingStartedAt) {
      const startTime = new Date(this.odometer.trackingStartedAt).getTime();
      this.odometer.elapsedTrackingSec = Math.max(0, (Date.now() - startTime) / 1000);
    }

    // Persist periodically (every 10 samples)
    if (this.odometer.sampleCount % 10 === 0) {
      this.saveOdometer();
    }

    this.notify();
  }

  // ── Location Watch Management ──────────────────────────────

  private async startLocationWatch(): Promise<boolean> {
    // ── Try expo-location first (native) ─────────────────
    try {
      const Location = await import('expo-location' as any);

      // Request foreground permissions
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        console.warn(TAG, 'Foreground location permission denied');
        return false;
      }

      // Request background permissions if enabled
      if (this.config.backgroundEnabled) {
        try {
          const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
          if (bgStatus !== 'granted') {
            console.warn(TAG, 'Background location permission denied, using foreground only');
            this.config.backgroundEnabled = false;
            this.saveConfig();
          }
        } catch {
          console.warn(TAG, 'Background permissions not available');
          this.config.backgroundEnabled = false;
          this.saveConfig();
        }
      }

      // Map accuracy setting to expo-location accuracy
      const accuracyMap: Record<TrackingAccuracy, number> = {
        high: Location.Accuracy?.BestForNavigation || Location.Accuracy?.High || 5,
        balanced: Location.Accuracy?.High || 4,
        low: Location.Accuracy?.Balanced || 3,
      };

      // Get initial position
      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: accuracyMap[this.config.accuracy],
        });
        this.processPosition({
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          altitude: initial.coords.altitude,
          speed: initial.coords.speed,
          heading: initial.coords.heading,
          accuracy: initial.coords.accuracy,
          timestamp: initial.timestamp,
        });
      } catch {}

      // Start watching
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: accuracyMap[this.config.accuracy],
          distanceInterval: this.config.distanceFilterM,
          timeInterval: this.config.timeIntervalMs,
          mayShowUserSettingsDialog: true,
        },
        (loc: any) => {
          this.processPosition({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitude: loc.coords.altitude,
            speed: loc.coords.speed,
            heading: loc.coords.heading,
            accuracy: loc.coords.accuracy,
            timestamp: loc.timestamp,
          });
        },
      );

      console.log(TAG, 'expo-location watch started');
      return true;
    } catch {
      // expo-location not available, fall through to web
    }

    // ── Fallback: Browser Geolocation API ────────────────
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        // Initial position
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            this.processPosition({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              altitude: pos.coords.altitude,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
          },
          () => {},
          { enableHighAccuracy: this.config.accuracy !== 'low', timeout: 10000, maximumAge: 3000 },
        );

        // Watch position
        this.webWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            this.processPosition({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              altitude: pos.coords.altitude,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
          },
          (err) => {
            console.warn(TAG, 'Web geolocation error:', err.message);
          },
          {
            enableHighAccuracy: this.config.accuracy !== 'low',
            timeout: 15000,
            maximumAge: this.config.timeIntervalMs,
          },
        );

        console.log(TAG, 'Web geolocation watch started');
        return true;
      } catch (e) {
        console.warn(TAG, 'Web geolocation failed:', e);
        return false;
      }
    }

    console.warn(TAG, 'No location provider available');
    return false;
  }

  private stopLocationWatch(): void {
    if (this.locationSubscription) {
      try {
        if (typeof this.locationSubscription.remove === 'function') {
          this.locationSubscription.remove();
        }
      } catch {}
      this.locationSubscription = null;
    }

    if (this.webWatchId !== null) {
      try {
        navigator.geolocation.clearWatch(this.webWatchId);
      } catch {}
      this.webWatchId = null;
    }
  }

  // ── Format Helpers ─────────────────────────────────────────

  formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  formatDistance(miles: number): string {
    if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
    if (miles < 10) return `${miles.toFixed(2)} mi`;
    if (miles < 100) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
  }
}

// ── Singleton Export ─────────────────────────────────────────

export const gpsDistanceTracker = new GPSDistanceTracker();

