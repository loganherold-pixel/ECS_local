/**
 * gpsUIState — Throttled GPS State for UI Consumption
 *
 * Performance Guardrail (Phase 3A):
 * Prevents Dashboard widgets and Active Mode UI from re-rendering
 * too frequently due to high-frequency GPS updates.
 *
 * Architecture:
 *   - Singleton store with subscribe/get pattern
 *   - Accepts raw GPS updates at any frequency via `feedRaw()`
 *   - Emits throttled state at a controlled rate (default 1 update/sec)
 *   - Latest raw value is always captured; tick applies the most recent
 *   - Subscribers are only notified when the throttled state changes
 *   - Derived fields (hasFix, fixQuality, gpsStatus) are included
 *
 * Usage:
 *   - Internal: `useThrottledGPS` hook calls `feedRaw()` on every
 *     raw GPS update from `useGPSLocation`
 *   - UI components: subscribe to `gpsUIState` for throttled updates
 *   - Dashboard widgets receive throttled GPS via props
 *
 * Guarantees:
 *   - Position updates: at most 1/sec
 *   - Speed/heading updates: at most 1/sec
 *   - No stale drift: latest value always applied on tick
 *   - Clean shutdown: `stop()` clears interval
 */

import type { GPSPosition, GPSLocationOutput } from './useGPSLocation';

// ── Throttle interval ──────────────────────────────────────
const THROTTLE_INTERVAL_MS = 1000; // 1 update per second

// ── Throttled GPS UI State ─────────────────────────────────
export interface GPSUIState {
  /** Throttled position (updated at most 1/sec) */
  position: GPSPosition | null;
  /** Whether GPS hardware is available */
  isAvailable: boolean;
  /** Whether we have an active fix */
  hasFix: boolean;
  /** Whether the provider is actively watching */
  isWatching: boolean;
  /** Fix quality: 'HIGH' (<10m), 'MEDIUM' (<30m), 'LOW' (>30m), 'NONE' */
  fixQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** Status label for UI */
  gpsStatus: 'TRACKING' | 'ACQUIRING' | 'OFFLINE' | 'DENIED' | 'UNAVAILABLE' | 'RETRYING';
  /** Error message if any */
  error: string | null;
  /** How many retry attempts have been made */
  retryCount: number;
  /** Whether permission was explicitly denied */
  permissionDenied: boolean;
  /** Timestamp of last throttled emission */
  lastEmitTs: number;
}

// ── Default state ──────────────────────────────────────────
const DEFAULT_STATE: GPSUIState = {
  position: null,
  isAvailable: false,
  hasFix: false,
  isWatching: false,
  fixQuality: 'NONE',
  gpsStatus: 'UNAVAILABLE',
  error: null,
  retryCount: 0,
  permissionDenied: false,
  lastEmitTs: 0,
};

// ── Singleton Store ────────────────────────────────────────
type Listener = () => void;

class GPSUIStateStore {
  private state: GPSUIState = { ...DEFAULT_STATE };
  private listeners: Set<Listener> = new Set();

  // Latest raw values (buffered between ticks)
  private latestRaw: GPSLocationOutput | null = null;
  private dirty = false;

  // Throttle timer
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private refCount = 0; // Number of active consumers

  // ── Public API ─────────────────────────────────────────

  /** Get current throttled GPS state (non-reactive) */
  get(): GPSUIState {
    return this.state;
  }

  /** Subscribe for throttled state changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Feed raw GPS output from useGPSLocation.
   * Called on every raw GPS update. The latest value is buffered
   * and applied on the next throttle tick.
   */
  feedRaw(raw: GPSLocationOutput): void {
    this.latestRaw = raw;
    this.dirty = true;

    // If this is the first feed and no state yet, apply immediately
    // so the UI doesn't show stale "UNAVAILABLE" on mount
    if (this.state.lastEmitTs === 0) {
      this.applyLatest();
    }
  }

  /**
   * Start the throttle timer. Called when a consumer mounts.
   * Uses ref-counting so multiple consumers share one timer.
   */
  start(): void {
    this.refCount++;
    if (this.intervalId != null) return; // Already running

    this.intervalId = setInterval(() => {
      if (this.dirty) {
        this.applyLatest();
      }
    }, THROTTLE_INTERVAL_MS);
  }

  /**
   * Stop the throttle timer. Called when a consumer unmounts.
   * Only actually stops when all consumers have unmounted.
   */
  stop(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return; // Other consumers still active

    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Force-stop regardless of ref count (cleanup) */
  forceStop(): void {
    this.refCount = 0;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Reset to default state */
  reset(): void {
    this.forceStop();
    this.state = { ...DEFAULT_STATE };
    this.latestRaw = null;
    this.dirty = false;
    this.notify();
  }

  /** Whether the throttle timer is running */
  isRunning(): boolean {
    return this.intervalId != null;
  }

  // ── Internal ───────────────────────────────────────────

  private applyLatest(): void {
    const raw = this.latestRaw;
    if (!raw) return;

    const newState: GPSUIState = {
      position: raw.position,
      isAvailable: raw.isAvailable,
      hasFix: raw.hasFix,
      isWatching: raw.isWatching,
      fixQuality: raw.fixQuality,
      gpsStatus: raw.gpsStatus,
      error: raw.error,
      retryCount: raw.retryCount,
      permissionDenied: raw.permissionDenied,
      lastEmitTs: Date.now(),
    };

    // Only notify if something actually changed
    if (this.hasChanged(newState)) {
      this.state = newState;
      this.dirty = false;
      this.notify();
    } else {
      this.dirty = false;
    }
  }

  private hasChanged(next: GPSUIState): boolean {
    const prev = this.state;

    // Quick checks on scalar fields
    if (prev.hasFix !== next.hasFix) return true;
    if (prev.isAvailable !== next.isAvailable) return true;
    if (prev.isWatching !== next.isWatching) return true;
    if (prev.fixQuality !== next.fixQuality) return true;
    if (prev.gpsStatus !== next.gpsStatus) return true;
    if (prev.error !== next.error) return true;
    if (prev.retryCount !== next.retryCount) return true;
    if (prev.permissionDenied !== next.permissionDenied) return true;

    // Position comparison (null checks + value checks)
    if (prev.position == null && next.position != null) return true;
    if (prev.position != null && next.position == null) return true;
    if (prev.position != null && next.position != null) {
      if (prev.position.latitude !== next.position.latitude) return true;
      if (prev.position.longitude !== next.position.longitude) return true;
      if (prev.position.speedMph !== next.position.speedMph) return true;
      if (prev.position.headingDeg !== next.position.headingDeg) return true;
      if (prev.position.altitudeFt !== next.position.altitudeFt) return true;
      if (prev.position.accuracyM !== next.position.accuracyM) return true;
    }

    return false;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Swallow listener errors
      }
    }
  }
}

// ── Export singleton ────────────────────────────────────────
export const gpsUIState = new GPSUIStateStore();

