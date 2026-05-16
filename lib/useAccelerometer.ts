/**
 * useAccelerometer — Real-time device orientation hook
 *
 * Reads the device accelerometer via expo-sensors and computes
 * roll (lateral tilt) and pitch (fore/aft tilt) angles in degrees.
 *
 * DEFAULT: Calibrated for VERTICAL MOUNT (phone upright in cradle).
 *   0° pitch = phone held vertically/upright
 *   Forward tilt = positive pitch
 *   Back tilt = negative pitch
 *
 * Features:
 *   - Low-pass filter for noise reduction
 *   - Calibration support (zero on current orientation)
 *   - Bounded UI update rate for React Native sensor callbacks
 *   - Graceful fallback when sensor unavailable
 *   - Automatic cleanup on unmount
 *
 * Roll:  positive = tilted right,  negative = tilted left
 * Pitch: positive = tilted forward, negative = tilted backward
 *        (relative to vertical mount baseline)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  applyAttitudeCalibration,
  createAttitudeCalibrationOffsets,
  resetAttitudeCalibrationOffsets,
  type AttitudeCalibrationOffsets,
} from './attitudeCalibration';

// ── Types ──────────────────────────────────────────────────
export interface AccelerometerOutput {
  /** Current filtered roll angle in degrees */
  rollDeg: number;
  /** Current filtered pitch angle in degrees */
  pitchDeg: number;
  /** Raw (unfiltered, uncalibrated) roll */
  rawRollDeg: number;
  /** Raw (unfiltered, uncalibrated) pitch */
  rawPitchDeg: number;
  /** Timestamp of the most recent sensor sample */
  lastSampleAtMs: number | null;
  /** Whether the accelerometer hardware is available */
  isAvailable: boolean;
  /** Whether the sensor is actively streaming data */
  isActive: boolean;
  /** Whether calibration has been applied */
  isCalibrated: boolean;
  /** Trigger calibration — stores current orientation as zero reference */
  calibrate: () => void;
  /** Reset calibration back to raw sensor values */
  resetCalibration: () => void;
  /** Sensor status label for UI display */
  sensorStatus: 'LIVE' | 'CALIBRATED' | 'OFFLINE' | 'UNAVAILABLE' | 'PAUSED' | 'BACKGROUND';
}

export interface AccelerometerOptions {
  /**
   * Changes when the app/device orientation changes. The hook uses this as a
   * one-shot session baseline reset so Dashboard rotation does not look like
   * vehicle roll.
   */
  recalibrationKey?: string | number | null;
}

// ── Constants ──────────────────────────────────────────────
type AccelerometerAnglesState = {
  rollDeg: number;
  pitchDeg: number;
  rawRollDeg: number;
  rawPitchDeg: number;
  lastSampleAtMs: number | null;
};

const UPDATE_INTERVAL_MS = 100;      // ~10fps keeps HUD motion responsive without flooding React state
const FILTER_ALPHA = 0.18;           // Low-pass filter coefficient (lower = smoother, more lag)
const RAD_TO_DEG = 180 / Math.PI;
const SAMPLE_TIMESTAMP_EMIT_MS = 1000;
const UI_EMIT_INTERVAL_MS = UPDATE_INTERVAL_MS;
const UI_EMIT_DELTA_DEG = 0.25;      // Preserve subtle live movement while filtering sensor jitter
const ORIENTATION_RECALIBRATION_DELAY_MS = 180;

// ── Persistence key for calibration ────────────────────────
const CAL_KEY = 'ecs_accel_calibration';

function getPersistedCalibration(): { rollOffset: number; pitchOffset: number } | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CAL_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function setPersistedCalibration(rollOffset: number, pitchOffset: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAL_KEY, JSON.stringify({ rollOffset, pitchOffset }));
    }
  } catch {}
}

function clearPersistedCalibration(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CAL_KEY);
    }
  } catch {}
}

// ── Hook ───────────────────────────────────────────────────
export function useAccelerometer(
  enabled: boolean = true,
  options: AccelerometerOptions = {},
): AccelerometerOutput {
  const recalibrationKey = options.recalibrationKey ?? null;
  const [angles, setAngles] = useState<AccelerometerAnglesState>({
    rollDeg: 0,
    pitchDeg: 0,
    rawRollDeg: 0,
    rawPitchDeg: 0,
    lastSampleAtMs: null as number | null,
  });
  const [isAvailable, setIsAvailable] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);

  // Refs for filter state (avoid re-renders on every frame)
  const filteredRoll = useRef(0);
  const filteredPitch = useRef(0);
  const calibrationOffset = useRef<AttitudeCalibrationOffsets>(resetAttitudeCalibrationOffsets());
  const latestRawAnglesRef = useRef<{ roll: number; pitch: number } | null>(null);
  const lastRecalibrationKeyRef = useRef<string | number | null>(recalibrationKey);
  const recalibrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionRef = useRef<any>(null);
  const AccelerometerRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const isAvailableRef = useRef(false);
  const isActiveRef = useRef(false);
  const lastEmittedRef = useRef<AccelerometerAnglesState>({
    rollDeg: 0,
    pitchDeg: 0,
    rawRollDeg: 0,
    rawPitchDeg: 0,
    lastSampleAtMs: null as number | null,
  });
  const lastUiEmitAtRef = useRef(0);
  const pendingAnglesRef = useRef<AccelerometerAnglesState | null>(null);
  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitAngles = useCallback((next: AccelerometerAnglesState) => {
    if (!mountedRef.current) return;
    pendingAnglesRef.current = next;
    if (emitTimerRef.current) return;

    emitTimerRef.current = setTimeout(() => {
      emitTimerRef.current = null;
      if (!mountedRef.current || !pendingAnglesRef.current) return;

      const queuedAngles = pendingAnglesRef.current;
      pendingAnglesRef.current = null;
      setAngles((prev) =>
        prev.rollDeg === queuedAngles.rollDeg &&
        prev.pitchDeg === queuedAngles.pitchDeg &&
        prev.rawRollDeg === queuedAngles.rawRollDeg &&
        prev.rawPitchDeg === queuedAngles.rawPitchDeg &&
        prev.lastSampleAtMs === queuedAngles.lastSampleAtMs
          ? prev
          : queuedAngles,
      );
    }, 0);
  }, []);

  const recenterToLatestRawAngles = useCallback((persist: boolean) => {
    const latest = latestRawAnglesRef.current;
    if (!latest) {
      calibrationOffset.current = createAttitudeCalibrationOffsets(
        filteredRoll.current + calibrationOffset.current.roll,
        filteredPitch.current + calibrationOffset.current.pitch,
      );
      filteredRoll.current = 0;
      filteredPitch.current = 0;
      const next = {
        ...lastEmittedRef.current,
        rollDeg: 0,
        pitchDeg: 0,
        lastSampleAtMs: Date.now(),
      };
      lastEmittedRef.current = next;
      lastUiEmitAtRef.current = Date.now();
      emitAngles(next);
      setIsCalibrated(true);
      if (persist) {
        setPersistedCalibration(
          calibrationOffset.current.roll,
          calibrationOffset.current.pitch,
        );
      }
      return;
    }

    calibrationOffset.current = createAttitudeCalibrationOffsets(latest.roll, latest.pitch);
    filteredRoll.current = 0;
    filteredPitch.current = 0;
    lastEmittedRef.current = {
      rollDeg: 0,
      pitchDeg: 0,
      rawRollDeg: Math.round(latest.roll * 10) / 10,
      rawPitchDeg: Math.round(latest.pitch * 10) / 10,
      lastSampleAtMs: Date.now(),
    };
    lastUiEmitAtRef.current = Date.now();
    emitAngles(lastEmittedRef.current);
    setIsCalibrated(true);

    if (persist) {
      setPersistedCalibration(
        calibrationOffset.current.roll,
        calibrationOffset.current.pitch,
      );
    }
  }, [emitAngles]);

  const setAvailableState = useCallback((next: boolean) => {
    if (isAvailableRef.current === next) return;
    isAvailableRef.current = next;
    setIsAvailable(next);
  }, []);

  const setActiveState = useCallback((next: boolean) => {
    if (isActiveRef.current === next) return;
    isActiveRef.current = next;
    setIsActive(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recalibrationTimerRef.current) {
        clearTimeout(recalibrationTimerRef.current);
        recalibrationTimerRef.current = null;
      }
      if (emitTimerRef.current) {
        clearTimeout(emitTimerRef.current);
        emitTimerRef.current = null;
      }
      pendingAnglesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  // Load persisted calibration on mount
  useEffect(() => {
    const saved = getPersistedCalibration();
    if (saved) {
      calibrationOffset.current = { roll: saved.rollOffset, pitch: saved.pitchOffset };
        setIsCalibrated(true);
      }
  }, []);

  // ── Calibrate ────────────────────────────────────────────
  const calibrate = useCallback(() => {
    recenterToLatestRawAngles(true);
  }, [recenterToLatestRawAngles]);

  // ── Reset Calibration ────────────────────────────────────
  const resetCalibration = useCallback(() => {
    calibrationOffset.current = resetAttitudeCalibrationOffsets();
    setIsCalibrated(false);
    clearPersistedCalibration();
  }, []);

  useEffect(() => {
    if (!enabled) {
      lastRecalibrationKeyRef.current = recalibrationKey;
      return;
    }

    if (lastRecalibrationKeyRef.current === recalibrationKey) return;
    lastRecalibrationKeyRef.current = recalibrationKey;

    if (recalibrationTimerRef.current) {
      clearTimeout(recalibrationTimerRef.current);
    }

    recalibrationTimerRef.current = setTimeout(() => {
      recalibrationTimerRef.current = null;
      recenterToLatestRawAngles(false);
    }, ORIENTATION_RECALIBRATION_DELAY_MS);

    return () => {
      if (recalibrationTimerRef.current) {
        clearTimeout(recalibrationTimerRef.current);
        recalibrationTimerRef.current = null;
      }
    };
  }, [enabled, recalibrationKey, recenterToLatestRawAngles]);

  // ── Sensor lifecycle ─────────────────────────────────────
  useEffect(() => {
    const canStream = enabled && appState === 'active';

    if (!canStream) {
      // Clean up if disabled
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      setActiveState(false);
      return;
    }

    let mounted = true;

    async function startSensor() {
      try {
        // Dynamic import to avoid crashes on platforms without expo-sensors
        const sensorModule = await import('expo-sensors');
        const Accel = sensorModule.Accelerometer;
        AccelerometerRef.current = Accel;

        // Check availability
        const available = await Accel.isAvailableAsync();
        if (!mounted || !mountedRef.current) return;
        setAvailableState(available);

        if (!available) {
          setActiveState(false);
          return;
        }

        // Set update interval
        Accel.setUpdateInterval(UPDATE_INTERVAL_MS);

        if (subscriptionRef.current) {
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }

        // Subscribe to accelerometer data
        subscriptionRef.current = Accel.addListener(
          (data: { x: number; y: number; z: number }) => {
            if (!mounted || !mountedRef.current) return;

            // ── Compute raw angles from accelerometer data ──
            // expo-sensors returns values in Gs
            //
            // VERTICAL MOUNT BASELINE (phone upright in cradle):
            //   Upright: x≈0, y≈-1, z≈0
            //   Roll = lateral tilt (same as flat)
            //   Pitch = forward/backward from vertical (uses z-axis)
            //
            const { x, y, z } = data;

            // Guard against degenerate cases (all zeros)
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            if (magnitude < 0.01) return;

            // Roll = lateral tilt (atan2 of x vs the vertical plane)
            // This works the same for both flat and vertical orientations
            const rawRoll = Math.atan2(x, Math.sqrt(y * y + z * z)) * RAD_TO_DEG;

            // Pitch = fore/aft tilt FROM VERTICAL baseline
            // For vertical mount (phone upright): z≈0 when level
            //   Forward tilt (top of phone tips away from user) → z becomes negative → positive pitch
            //   Backward tilt (top of phone tips toward user) → z becomes positive → negative pitch
            const rawPitch = Math.atan2(-z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
            latestRawAnglesRef.current = { roll: rawRoll, pitch: rawPitch };

            // Apply calibration offset
            const calibratedAngles = applyAttitudeCalibration(rawRoll, rawPitch, calibrationOffset.current);
            const calibratedRoll = calibratedAngles.roll;
            const calibratedPitch = calibratedAngles.pitch;

            // ── Low-pass filter ──
            // filtered = α * new + (1 - α) * previous
            filteredRoll.current =
              FILTER_ALPHA * calibratedRoll +
              (1 - FILTER_ALPHA) * filteredRoll.current;

            filteredPitch.current =
              FILTER_ALPHA * calibratedPitch +
              (1 - FILTER_ALPHA) * filteredPitch.current;

            // ── Update state ──
            // Round to 1 decimal to reduce unnecessary re-renders
            const newRoll = Math.round(filteredRoll.current * 10) / 10;
            const newPitch = Math.round(filteredPitch.current * 10) / 10;
            const nextRawRoll = Math.round(rawRoll * 10) / 10;
            const nextRawPitch = Math.round(rawPitch * 10) / 10;
            const sampleNow = Date.now();
            const nextAngles = {
              rollDeg: newRoll,
              pitchDeg: newPitch,
              rawRollDeg: nextRawRoll,
              rawPitchDeg: nextRawPitch,
              lastSampleAtMs: sampleNow,
            };

            const previousAngles = lastEmittedRef.current;
            const valuesUnchanged =
              previousAngles.rollDeg === nextAngles.rollDeg &&
              previousAngles.pitchDeg === nextAngles.pitchDeg &&
              previousAngles.rawRollDeg === nextAngles.rawRollDeg &&
              previousAngles.rawPitchDeg === nextAngles.rawPitchDeg;

            if (valuesUnchanged) {
              const previousSample = lastEmittedRef.current.lastSampleAtMs ?? 0;
              if (sampleNow - previousSample >= SAMPLE_TIMESTAMP_EMIT_MS) {
                const timestampOnlyAngles = {
                  ...lastEmittedRef.current,
                  lastSampleAtMs: sampleNow,
                };
                lastEmittedRef.current = timestampOnlyAngles;
                lastUiEmitAtRef.current = sampleNow;
                emitAngles(timestampOnlyAngles);
              }
              return;
            }

            const rollDelta = Math.abs(previousAngles.rollDeg - nextAngles.rollDeg);
            const pitchDelta = Math.abs(previousAngles.pitchDeg - nextAngles.pitchDeg);
            const rawRollDelta = Math.abs(previousAngles.rawRollDeg - nextAngles.rawRollDeg);
            const rawPitchDelta = Math.abs(previousAngles.rawPitchDeg - nextAngles.rawPitchDeg);
            const hasMeaningfulAngleChange =
              rollDelta >= UI_EMIT_DELTA_DEG ||
              pitchDelta >= UI_EMIT_DELTA_DEG ||
              rawRollDelta >= UI_EMIT_DELTA_DEG ||
              rawPitchDelta >= UI_EMIT_DELTA_DEG;
            const enoughTimeElapsed = sampleNow - lastUiEmitAtRef.current >= UI_EMIT_INTERVAL_MS;

            if (!enoughTimeElapsed || !hasMeaningfulAngleChange) {
              return;
            }

            lastEmittedRef.current = nextAngles;
            lastUiEmitAtRef.current = sampleNow;
            emitAngles(nextAngles);
          },
        );

        if (mounted && mountedRef.current) setActiveState(true);
      } catch (err) {
        console.warn('[useAccelerometer] Failed to initialize:', err);
        if (mounted && mountedRef.current) {
          setAvailableState(false);
          setActiveState(false);
        }
      }
    }

    startSensor();

    return () => {
      mounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [appState, emitAngles, enabled, setActiveState, setAvailableState]);

  // ── Sensor status label ──────────────────────────────────
  const sensorStatus: AccelerometerOutput['sensorStatus'] = !enabled
    ? 'PAUSED'
    : appState !== 'active'
      ? 'BACKGROUND'
      : !isAvailable
        ? 'UNAVAILABLE'
        : !isActive
          ? 'OFFLINE'
          : isCalibrated
            ? 'CALIBRATED'
            : 'LIVE';

  return {
    rollDeg: angles.rollDeg,
    pitchDeg: angles.pitchDeg,
    rawRollDeg: angles.rawRollDeg,
    rawPitchDeg: angles.rawPitchDeg,
    lastSampleAtMs: angles.lastSampleAtMs,
    isAvailable,
    isActive,
    isCalibrated,
    calibrate,
    resetCalibration,
    sensorStatus,
  };
}

