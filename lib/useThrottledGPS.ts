/**
 * useThrottledGPS — Throttled GPS Hook for UI Components
 *
 * Performance Guardrail (Phase 3A):
 * Wraps useGPSLocation and provides throttled GPS state that updates
 * at most once per second. Prevents excessive UI re-renders from
 * high-frequency GPS updates.
 *
 * Architecture:
 *   - Calls useGPSLocation internally for raw GPS data
 *   - Feeds every raw update into gpsUIState singleton store
 *   - Subscribes to gpsUIState for throttled re-renders
 *   - Returns the same shape as GPSLocationOutput (drop-in compatible)
 *   - Starts/stops the throttle timer on mount/unmount
 *
 * Usage:
 *   Replace `useGPSLocation(options)` with `useThrottledGPS(options)`
 *   in any component that renders GPS data to the UI.
 *
 * Raw GPS Access:
 *   The `rawGPS` field provides the unthrottled GPSLocationOutput
 *   for internal use (e.g., distance tracking, waypoint detection)
 *   that needs every update but shouldn't trigger re-renders.
 *
 * Guarantees:
 *   - UI re-renders at most 1/sec from GPS position changes
 *   - Latest GPS value is always applied (no stale drift)
 *   - refresh() still works (delegates to raw hook)
 *   - Clean lifecycle management via start/stop
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  useGPSLocation,
  type GPSLocationOptions,
  type GPSLocationOutput,
  type GPSPosition,
} from './useGPSLocation';
import { gpsUIState, type GPSUIState } from './gpsUIState';

// ── Output type (extends GPSLocationOutput with rawGPS) ────
export interface ThrottledGPSOutput {
  /** Throttled position (updated at most 1/sec) */
  position: GPSPosition | null;
  /** Whether GPS hardware is available */
  isAvailable: boolean;
  /** Whether we have an active fix */
  hasFix: boolean;
  /** Whether the provider is actively watching */
  isWatching: boolean;
  /** Fix quality */
  fixQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** Status label for UI */
  gpsStatus: 'TRACKING' | 'ACQUIRING' | 'OFFLINE' | 'DENIED' | 'UNAVAILABLE' | 'RETRYING';
  /** Error message if any */
  error: string | null;
  /** Force a single position update */
  refresh: () => void;
  /** How many retry attempts have been made */
  retryCount: number;
  /** Whether permission was explicitly denied */
  permissionDenied: boolean;
  /**
   * Raw (unthrottled) GPS output — use for internal calculations
   * that need every update (distance tracking, waypoint detection)
   * but should NOT be used for rendering.
   */
  rawGPS: GPSLocationOutput;
}

// ── Hook ───────────────────────────────────────────────────
export function useThrottledGPS(
  options: GPSLocationOptions = {}
): ThrottledGPSOutput {
  // ── Raw GPS from the underlying hook ─────────────────
  const rawGPS = useGPSLocation(options);

  // ── Throttled state from gpsUIState store ────────────
  const [throttledState, setThrottledState] = useState<GPSUIState>(
    () => gpsUIState.get()
  );

  // ── Feed raw GPS into the store on every update ──────
  // Use a ref to avoid re-subscribing when rawGPS changes
  const rawGPSRef = useRef(rawGPS);
  rawGPSRef.current = rawGPS;

  // Feed raw data into the throttle store whenever it changes
  useEffect(() => {
    gpsUIState.feedRaw(rawGPS);
  }, [
    rawGPS.position?.latitude,
    rawGPS.position?.longitude,
    rawGPS.position?.speedMph,
    rawGPS.position?.headingDeg,
    rawGPS.position?.altitudeFt,
    rawGPS.position?.accuracyM,
    rawGPS.hasFix,
    rawGPS.isAvailable,
    rawGPS.isWatching,
    rawGPS.fixQuality,
    rawGPS.gpsStatus,
    rawGPS.error,
    rawGPS.retryCount,
    rawGPS.permissionDenied,
  ]);

  // ── Subscribe to throttled state changes ─────────────
  useEffect(() => {
    const unsub = gpsUIState.subscribe(() => {
      setThrottledState(gpsUIState.get());
    });
    return unsub;
  }, []);

  // ── Start/stop throttle timer on mount/unmount ───────
  useEffect(() => {
    gpsUIState.start();
    return () => {
      gpsUIState.stop();
    };
  }, []);

  // ── Compose throttled output ─────────────────────────
  return {
    position: throttledState.position,
    isAvailable: throttledState.isAvailable,
    hasFix: throttledState.hasFix,
    isWatching: throttledState.isWatching,
    fixQuality: throttledState.fixQuality,
    gpsStatus: throttledState.gpsStatus,
    error: throttledState.error,
    refresh: rawGPS.refresh,
    retryCount: throttledState.retryCount,
    permissionDenied: throttledState.permissionDenied,
    rawGPS,
  };
}

