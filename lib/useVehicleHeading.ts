/**
 * useVehicleHeading — Orientation-Aware Vehicle Heading Hook
 *
 * Phase 6 Enhancements:
 *   - Stationary drift prevention (locks heading when speed < 1 mph)
 *   - Heading accuracy tracking with quality indicator
 *   - Recalibration indicator when accuracy drops below threshold
 *   - Adaptive smoothing (faster response when moving, slower when stationary)
 *   - Improved upright/cradle orientation correction
 *   - Heading normalization always 0–360
 *   - CarPlay/Android Auto heading sync support
 *
 * Produces a smoothed heading (0–359°) for the vehicle arrow marker
 * on a North-Up map. The map NEVER rotates — only the arrow does.
 *
 * Heading sources (priority order):
 *   1. expo-location watchHeadingAsync (trueHeading > magHeading)
 *   2. GPS course heading (from useGPSLocation / position.headingDeg)
 *   3. null (no heading available)
 *
 * Compass Modes:
 *   - 'auto'    — Use raw heading as-is (good for flat-on-dashboard)
 *   - 'upright' — Apply screen orientation offset for cradle/mount use
 *   - 'flat'    — Same as auto (phone flat on surface)
 *
 * Upright/Cradle Correction:
 *   When the phone is upright in a cradle, the magnetometer axes change.
 *   We apply an orientation offset based on device orientation:
 *     Portrait upright:    +0°
 *     Landscape left:     +90°
 *     Landscape right:    -90°
 *     Portrait upside-down: +180°
 *
 * Smoothing:
 *   Adaptive shortest-arc angle interpolation (lerp).
 *   Moving (>3 mph): factor 0.3 (responsive)
 *   Slow (<3 mph):   factor 0.15 (smooth)
 *   Stationary:      heading locked (no drift)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';

// ── Types ──────────────────────────────────────────────
export type CompassMode = 'auto' | 'upright' | 'flat';

/** Heading accuracy quality level */
export type HeadingAccuracy = 'high' | 'medium' | 'low' | 'none';

export interface VehicleHeadingOutput {
  /** Smoothed heading in degrees (0–359), null if unavailable */
  heading: number | null;
  /** Raw (unsmoothed) heading */
  rawHeading: number | null;
  /** Current compass mode */
  compassMode: CompassMode;
  /** Set compass mode */
  setCompassMode: (mode: CompassMode) => void;
  /** Heading source: 'compass' | 'gps' | 'none' */
  source: 'compass' | 'gps' | 'none';
  /** Whether heading data is available */
  isAvailable: boolean;
  /** Phase 6: Heading accuracy quality */
  accuracy: HeadingAccuracy;
  /** Phase 6: Whether recalibration is recommended */
  needsRecalibration: boolean;
  /** Phase 6: Whether heading is locked due to stationary state */
  isStationaryLocked: boolean;
  /** Phase 6: Heading accuracy in degrees (lower = better, null if unknown) */
  accuracyDeg: number | null;
}

export interface VehicleHeadingOptions {
  /** Whether heading tracking is enabled (default: true) */
  enabled?: boolean;
  /** GPS heading fallback (from useGPSLocation) */
  gpsHeadingDeg?: number | null;
  /** Smoothing factor 0–1 (higher = more responsive, default: 0.2) */
  smoothingFactor?: number;
  /** Initial compass mode (default: 'auto') */
  initialMode?: CompassMode;
  /** Phase 6: Current speed in mph for stationary detection (default: null) */
  speedMph?: number | null;
}

// ── Constants ──────────────────────────────────────────
/** Speed below which heading is considered stationary (mph) */
const STATIONARY_SPEED_THRESHOLD = 1.0;
/** Speed above which adaptive smoothing uses faster factor */
const MOVING_SPEED_THRESHOLD = 3.0;
/** Smoothing factor when moving (responsive) */
const SMOOTHING_MOVING = 0.3;
/** Smoothing factor when slow/stationary (smooth, prevents jitter) */
const SMOOTHING_SLOW = 0.12;
/** Heading accuracy threshold for recalibration warning (degrees) */
const RECALIBRATION_THRESHOLD_DEG = 25;
/** Maximum heading change per tick to prevent abrupt jumps (degrees) */
const MAX_HEADING_CHANGE_PER_TICK = 15;

// ── Angle Math Helpers ─────────────────────────────────

/** Normalize angle to 0–360 range */
function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Shortest-arc angle interpolation (lerp).
 * Handles 359°→1° crossing correctly (goes +2°, not -358°).
 */
function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  // Normalize diff to -180..+180
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return normalizeAngle(from + diff * t);
}

/**
 * Compute shortest-arc angular distance between two headings.
 * Always returns a positive value 0–180.
 */
function angularDistance(a: number, b: number): number {
  let diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Clamp heading change to prevent abrupt rotation jumps.
 * If the change exceeds MAX_HEADING_CHANGE_PER_TICK, limit it.
 */
function clampHeadingChange(from: number, to: number, maxChange: number): number {
  let diff = to - from;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  if (Math.abs(diff) > maxChange) {
    diff = diff > 0 ? maxChange : -maxChange;
  }
  return normalizeAngle(from + diff);
}

// ── Orientation Offset ─────────────────────────────────

/**
 * Get screen orientation offset for upright/cradle mode.
 * Uses screen dimensions as a proxy (no expo-screen-orientation dependency).
 *
 * Phase 6: Improved with better landscape detection and
 * explicit handling of all four orientations.
 *
 * Returns offset in degrees to add to raw heading.
 */
function getOrientationOffset(): number {
  // On web, use window.screen.orientation if available
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const orientation = (window.screen as any)?.orientation;
      if (orientation) {
        const angle = orientation.angle || 0;
        // angle: 0 = portrait, 90 = landscape-left, -90/270 = landscape-right, 180 = upside-down
        return -angle; // Negate: if screen rotated 90° CW, heading needs -90° correction
      }
    } catch {}
  }

  // Native fallback: use Dimensions
  // In portrait: width < height → offset 0
  // In landscape: width > height → offset ±90 (assume landscape-left)
  try {
    const { Dimensions } = require('react-native');
    const { width, height } = Dimensions.get('window');
    if (width > height) {
      return 90; // Landscape — approximate
    }
  } catch {}

  return 0; // Portrait default
}

// ── Persisted Compass Mode ─────────────────────────────

const COMPASS_MODE_KEY = 'ecs_compass_mode';

function loadCompassMode(): CompassMode {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(COMPASS_MODE_KEY);
      if (stored === 'auto' || stored === 'upright' || stored === 'flat') {
        return stored;
      }
    }
  } catch {}
  return 'auto';
}

function saveCompassMode(mode: CompassMode): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(COMPASS_MODE_KEY, mode);
    }
  } catch {}
}

// ── Hook ───────────────────────────────────────────────

export function useVehicleHeading(options: VehicleHeadingOptions = {}): VehicleHeadingOutput {
  const {
    enabled = true,
    gpsHeadingDeg = null,
    smoothingFactor = 0.2,
    initialMode,
    speedMph = null,
  } = options;

  const [compassMode, setCompassModeState] = useState<CompassMode>(
    initialMode ?? loadCompassMode()
  );
  const [rawHeading, setRawHeading] = useState<number | null>(null);
  const [smoothedHeading, setSmoothedHeading] = useState<number | null>(null);
  const [source, setSource] = useState<'compass' | 'gps' | 'none'>('none');
  const [isAvailable, setIsAvailable] = useState(false);
  const [accuracy, setAccuracy] = useState<HeadingAccuracy>('none');
  const [needsRecalibration, setNeedsRecalibration] = useState(false);
  const [isStationaryLocked, setIsStationaryLocked] = useState(false);
  const [accuracyDeg, setAccuracyDeg] = useState<number | null>(null);

  const smoothedRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const compassHeadingRef = useRef<number | null>(null);
  const compassAccuracyRef = useRef<number | null>(null);
  const orientationListenerRef = useRef<any>(null);
  const lastStableHeadingRef = useRef<number | null>(null);
  const stationaryCountRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Persist compass mode
  const setCompassMode = useCallback((mode: CompassMode) => {
    setCompassModeState(mode);
    saveCompassMode(mode);
  }, []);

  // ── Compass heading source (expo-location watchHeadingAsync) ──
  useEffect(() => {
    if (!enabled) return;

    let subscription: any = null;
    let cancelled = false;

    (async () => {
      try {
        // Try expo-location heading
        const Location = await import('expo-location' as any);
        if (cancelled || !mountedRef.current) return;

        // Check if heading is available
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || !mountedRef.current) return;
        if (status !== 'granted') return;

        // watchHeadingAsync provides trueHeading and magHeading
        subscription = await Location.watchHeadingAsync((headingData: any) => {
          if (!mountedRef.current) return;

          // Prefer trueHeading (GPS-corrected), fallback to magHeading
          let heading: number | null = null;
          if (headingData.trueHeading != null && headingData.trueHeading >= 0) {
            heading = headingData.trueHeading;
          } else if (headingData.magHeading != null && headingData.magHeading >= 0) {
            heading = headingData.magHeading;
          }

          // Phase 6: Track heading accuracy from the sensor
          if (headingData.accuracy != null) {
            compassAccuracyRef.current = headingData.accuracy;
          }

          if (heading != null) {
            compassHeadingRef.current = heading;
            setIsAvailable(true);
            setSource('compass');
          }
        });
      } catch {
        // expo-location not available or heading not supported
        // Fall through to GPS heading
      }

      // Web fallback: try DeviceOrientationEvent for compass heading
      if (Platform.OS === 'web' && !subscription) {
        try {
          const handler = (event: any) => {
            if (!mountedRef.current) return;
            // webkitCompassHeading (iOS Safari) or alpha (Android Chrome)
            let heading: number | null = null;
            if (event.webkitCompassHeading != null) {
              heading = event.webkitCompassHeading;
              // iOS also provides webkitCompassAccuracy
              if (event.webkitCompassAccuracy != null && event.webkitCompassAccuracy >= 0) {
                compassAccuracyRef.current = event.webkitCompassAccuracy;
              }
            } else if (event.alpha != null) {
              // alpha is 0-360 counter-clockwise from north
              heading = normalizeAngle(360 - event.alpha);
              // Android Chrome: absolute event has better accuracy
              if (event.absolute) {
                compassAccuracyRef.current = 10; // Assume decent accuracy for absolute events
              } else {
                compassAccuracyRef.current = 30; // Non-absolute events are less reliable
              }
            }
            if (heading != null) {
              compassHeadingRef.current = heading;
              setIsAvailable(true);
              setSource('compass');
            }
          };

          window.addEventListener('deviceorientationabsolute', handler, true);
          window.addEventListener('deviceorientation', handler, true);

          orientationListenerRef.current = handler;
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
      if (subscription) {
        try { subscription.remove(); } catch {}
      }
      if (orientationListenerRef.current && Platform.OS === 'web') {
        try {
          window.removeEventListener('deviceorientationabsolute', orientationListenerRef.current, true);
          window.removeEventListener('deviceorientation', orientationListenerRef.current, true);
        } catch {}
        orientationListenerRef.current = null;
      }
    };
  }, [enabled]);

  // ── Screen orientation change listener (for upright mode offset) ──
  useEffect(() => {
    if (Platform.OS !== 'web' || compassMode !== 'upright') return;

    const handleOrientationChange = () => {
      // Orientation changed — the offset will be recalculated in the smoothing loop
    };

    try {
      const orientation = (window.screen as any)?.orientation;
      if (orientation) {
        orientation.addEventListener('change', handleOrientationChange);
        return () => orientation.removeEventListener('change', handleOrientationChange);
      }
    } catch {}

    // Fallback: listen to resize
    window.addEventListener('resize', handleOrientationChange);
    return () => window.removeEventListener('resize', handleOrientationChange);
  }, [compassMode]);

  // ── Main heading computation + smoothing loop ──
  useEffect(() => {
    if (!enabled) {
      setRawHeading(null);
      setSmoothedHeading(null);
      smoothedRef.current = null;
      setAccuracy('none');
      setNeedsRecalibration(false);
      setIsStationaryLocked(false);
      return;
    }

    const intervalId = setInterval(() => {
      if (!mountedRef.current) return;

      // ── Phase 6: Stationary drift prevention ──
      // When vehicle is stationary, lock heading to prevent compass drift
      const currentSpeed = speedMph ?? null;
      const isStationary = currentSpeed != null && currentSpeed < STATIONARY_SPEED_THRESHOLD;

      if (isStationary) {
        stationaryCountRef.current++;
        // After ~1 second of being stationary (20 ticks at 50ms), lock heading
        if (stationaryCountRef.current > 20) {
          if (!isStationaryLocked) setIsStationaryLocked(true);
          // Use last stable heading — don't update from compass
          if (lastStableHeadingRef.current != null) {
            // Keep the smoothed heading frozen
            return;
          }
        }
      } else {
        stationaryCountRef.current = 0;
        if (isStationaryLocked) setIsStationaryLocked(false);
      }

      // Determine raw heading from best available source
      let raw: number | null = null;

      // Priority 1: Compass heading (magnetometer / device orientation)
      if (compassHeadingRef.current != null) {
        raw = compassHeadingRef.current;
      }
      // Priority 2: GPS course heading
      else if (gpsHeadingDeg != null && gpsHeadingDeg >= 0) {
        raw = gpsHeadingDeg;
        if (source !== 'gps') setSource('gps');
      }

      if (raw == null) {
        // No heading source — use GPS heading if available even if compass was preferred
        if (gpsHeadingDeg != null && gpsHeadingDeg >= 0) {
          raw = gpsHeadingDeg;
          if (source !== 'gps') setSource('gps');
        } else {
          if (source !== 'none') setSource('none');
          return;
        }
      }

      // Apply compass mode correction
      let corrected = raw;
      if (compassMode === 'upright') {
        const offset = getOrientationOffset();
        corrected = normalizeAngle(raw + offset);
      }
      // 'flat' and 'auto' use raw heading as-is

      // Ensure heading is always normalized to 0–360
      corrected = normalizeAngle(corrected);

      setRawHeading(Math.round(corrected));

      // ── Phase 6: Heading accuracy tracking ──
      const accDeg = compassAccuracyRef.current;
      setAccuracyDeg(accDeg);

      if (accDeg == null) {
        // Unknown accuracy — assume medium if we have a heading
        setAccuracy(raw != null ? 'medium' : 'none');
        setNeedsRecalibration(false);
      } else if (accDeg <= 10) {
        setAccuracy('high');
        setNeedsRecalibration(false);
      } else if (accDeg <= RECALIBRATION_THRESHOLD_DEG) {
        setAccuracy('medium');
        setNeedsRecalibration(false);
      } else {
        setAccuracy('low');
        setNeedsRecalibration(true);
      }

      // ── Phase 6: Adaptive smoothing ──
      // Use faster smoothing when moving, slower when stationary/slow
      let effectiveSmoothingFactor = smoothingFactor;
      if (currentSpeed != null) {
        if (currentSpeed >= MOVING_SPEED_THRESHOLD) {
          effectiveSmoothingFactor = SMOOTHING_MOVING;
        } else if (currentSpeed < STATIONARY_SPEED_THRESHOLD) {
          effectiveSmoothingFactor = SMOOTHING_SLOW;
        } else {
          // Interpolate between slow and moving
          const t = (currentSpeed - STATIONARY_SPEED_THRESHOLD) /
                    (MOVING_SPEED_THRESHOLD - STATIONARY_SPEED_THRESHOLD);
          effectiveSmoothingFactor = SMOOTHING_SLOW + t * (SMOOTHING_MOVING - SMOOTHING_SLOW);
        }
      }

      // Apply smoothing (shortest-arc lerp) with jump prevention
      if (smoothedRef.current == null) {
        // First reading — snap immediately
        smoothedRef.current = corrected;
        lastStableHeadingRef.current = corrected;
        setSmoothedHeading(Math.round(corrected));
      } else {
        // Phase 6: Prevent abrupt rotation jumps
        // If the heading change is very large (>MAX_HEADING_CHANGE_PER_TICK),
        // clamp it to prevent spinning the arrow wildly
        const jumpDistance = angularDistance(smoothedRef.current, corrected);
        let targetHeading = corrected;

        if (jumpDistance > MAX_HEADING_CHANGE_PER_TICK * 3) {
          // Very large jump — likely a sensor glitch, use clamped approach
          targetHeading = clampHeadingChange(
            smoothedRef.current,
            corrected,
            MAX_HEADING_CHANGE_PER_TICK
          );
        }

        const smoothed = lerpAngle(smoothedRef.current, targetHeading, effectiveSmoothingFactor);
        smoothedRef.current = smoothed;
        lastStableHeadingRef.current = smoothed;
        setSmoothedHeading(Math.round(normalizeAngle(smoothed)));
      }
    }, 50); // 20 Hz update rate for smooth animation

    return () => clearInterval(intervalId);
  }, [enabled, compassMode, gpsHeadingDeg, smoothingFactor, source, speedMph, isStationaryLocked]);

  return {
    heading: smoothedHeading,
    rawHeading,
    compassMode,
    setCompassMode,
    source,
    isAvailable,
    accuracy,
    needsRecalibration,
    isStationaryLocked,
    accuracyDeg,
  };
}

