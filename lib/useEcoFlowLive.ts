/**
 * useEcoFlowLive — V1.3 EcoFlow Live Telemetry Hook + Resource Autopilot Lite
 *
 * V1.3 CHANGES:
 *   - Updated error code handling for V1.2 edge function (always-200 pattern)
 *   - Added FunctionsHttpError context extraction fallback
 *   - Maps new error codes: ECOFLOW_AUTH_FAILED, MISSING_ECOFLOW_CREDENTIALS,
 *     ECOFLOW_RATE_LIMIT, ECOFLOW_API_ERROR, ECOFLOW_DEVICE_NOT_FOUND,
 *     INVALID_REQUEST, INTERNAL_SERVER_ERROR
 *   - Backward compatible with legacy error codes
 *   - Displays structured error messages instead of generic "non-2xx" text
 *
 * Status machine:
 *   STANDBY  — no ecoflow device selected (no deviceId stored)
 *   LIVE     — lastUpdatedAt within 60 seconds
 *   DEGRADED — lastUpdatedAt between 60–180 seconds (shows cached values)
 *   OFFLINE  — lastUpdatedAt older than 180s OR repeated failures with no cache
 *
 * Polling discipline:
 *   - 12s interval when screen is focused / app is foreground
 *   - Stops immediately when app goes to background
 *   - Backoff to 60s on RATE_LIMIT or repeated UPSTREAM failures
 *   - No polling when STANDBY (no device configured)
 *
 * Cache:
 *   - lastGoodTelemetry persisted in memory + localStorage per device
 *   - On failure: shows cached data with DEGRADED status
 *   - On repeated failure with no cache: OFFLINE
 *
 * Autopilot Lite (V1.2):
 *   - Rolling buffer of last 5 telemetry samples
 *   - Net power: solarWatts − outputWatts
 *   - Rolling average output watts across buffer
 *   - Endurance estimate:
 *       netWatts >= 0 → "Charging"
 *       netWatts <  0 → "~Xh until 20%" (capacity-based estimate)
 *
 * Safety:
 *   - No secrets or signing headers logged
 *   - Error messages sanitized from server
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';

// ── Persistent storage ──────────────────────────────────────

const DEVICE_KEY = 'ecs_ecoflow_selected_device';
const CACHE_PREFIX = 'ecs_ecoflow_cache_';

const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { return localStorage.getItem(key); } catch { /* noop */ }
  }
  return memoryStore[key] ?? null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }
  memoryStore[key] = value;
}

function storageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
  delete memoryStore[key];
}

// ── Public helpers for device selection ──────────────────────

export function getSelectedEcoFlowDevice(): string | null {
  return storageGet(DEVICE_KEY) || null;
}

export function setSelectedEcoFlowDevice(deviceId: string | null): void {
  if (deviceId) {
    storageSet(DEVICE_KEY, deviceId);
  } else {
    storageRemove(DEVICE_KEY);
  }
}

// ── Telemetry cache helpers ─────────────────────────────────

interface CachedTelemetry {
  batteryPct: number | null;
  solarWatts: number | null;
  outputWatts: number | null;
  inputWatts: number | null;
  deviceName: string | null;
  serverTimestamp: number; // epoch ms from server
}

function getCachedTelemetry(deviceId: string): CachedTelemetry | null {
  const raw = storageGet(CACHE_PREFIX + deviceId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.serverTimestamp === 'number') return parsed;
  } catch { /* noop */ }
  return null;
}

function setCachedTelemetry(deviceId: string, data: CachedTelemetry): void {
  try {
    storageSet(CACHE_PREFIX + deviceId, JSON.stringify(data));
  } catch { /* noop */ }
}

// ── Constants ───────────────────────────────────────────────

const POLL_NORMAL_MS = 12_000;       // 12s normal polling
const POLL_BACKOFF_MS = 60_000;      // 60s backoff polling
const LIVE_THRESHOLD_MS = 60_000;    // <60s = LIVE
const DEGRADED_THRESHOLD_MS = 180_000; // 60–180s = DEGRADED, >180s = OFFLINE
const CONSECUTIVE_FAIL_BACKOFF = 2;  // after 2 consecutive failures → backoff

// ── Autopilot Lite constants ────────────────────────────────

const SAMPLE_BUFFER_SIZE = 5;
/** Default assumed battery capacity (Wh) for endurance estimation.
 *  1024 Wh ≈ EcoFlow DELTA 2. Adjust per-model in a future version. */
const ASSUMED_CAPACITY_WH = 1024;
/** Reserve threshold (%) — endurance estimates time until this level. */
const RESERVE_THRESHOLD_PCT = 20;

// ── Telemetry sample type ───────────────────────────────────

interface TelemetrySample {
  batteryPct: number;
  solarWatts: number;
  outputWatts: number;
  timestamp: number; // epoch ms
}

// ── Error codes from edge function (V1.2 + V1.3 compat) ────

type EcoFlowErrorCode =
  // V1.2 edge function codes
  | 'MISSING_ECOFLOW_CREDENTIALS'
  | 'INVALID_REQUEST'
  | 'ECOFLOW_AUTH_FAILED'
  | 'ECOFLOW_DEVICE_NOT_FOUND'
  | 'ECOFLOW_API_ERROR'
  | 'ECOFLOW_RATE_LIMIT'
  | 'INTERNAL_SERVER_ERROR'
  // Legacy V1.1 codes (backward compat)
  | 'UNAUTHORIZED'
  | 'RATE_LIMIT'
  | 'UPSTREAM'
  | 'BAD_REQUEST'
  | 'NOT_CONFIGURED';

/**
 * V1.3: Determine if an error code indicates a permanent/config error
 * that should stop polling (not just a transient failure).
 */
function isPermanentError(code: string | null | undefined): boolean {
  if (!code) return false;
  return [
    'MISSING_ECOFLOW_CREDENTIALS',
    'NOT_CONFIGURED',
    'ECOFLOW_AUTH_FAILED',
    'UNAUTHORIZED',
    'INVALID_REQUEST',
    'BAD_REQUEST',
  ].includes(code);
}

/**
 * V1.3: Determine if an error code should trigger backoff.
 */
function isBackoffError(code: string | null | undefined): boolean {
  if (!code) return false;
  return [
    'ECOFLOW_RATE_LIMIT',
    'RATE_LIMIT',
  ].includes(code);
}

/**
 * V1.3: Extract structured error from a Supabase FunctionsHttpError.
 * When the edge function returns non-2xx, the Supabase client puts
 * a generic message in `error` and the actual response body may be
 * accessible via `error.context` (a Response object).
 *
 * This fallback ensures we can still display the structured error
 * even if the edge function hasn't been updated to always-200 yet.
 */
async function extractStructuredError(
  fnError: any,
): Promise<{ code: string; message: string } | null> {
  try {
    // FunctionsHttpError has a `context` property that is a Response
    if (fnError && typeof fnError === 'object') {
      // Try context.json() first (FunctionsHttpError pattern)
      if (fnError.context && typeof fnError.context.json === 'function') {
        const body = await fnError.context.json();
        if (body && typeof body.code === 'string' && typeof body.message === 'string') {
          return { code: body.code, message: body.message };
        }
      }
      // Try reading context as text and parsing
      if (fnError.context && typeof fnError.context.text === 'function') {
        const text = await fnError.context.text();
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.code === 'string' && typeof parsed.message === 'string') {
            return { code: parsed.code, message: parsed.message };
          }
        }
      }
    }
  } catch {
    // Context extraction failed — fall through
  }
  return null;
}

// ── Hook types ──────────────────────────────────────────────

export type EcoFlowStatus = 'standby' | 'live' | 'degraded' | 'offline';

export interface EcoFlowLiveData {
  status: EcoFlowStatus;
  batteryPct: number | null;
  solarWatts: number | null;
  outputWatts: number | null;
  inputWatts: number | null;
  deviceName: string | null;
  selectedDeviceId: string | null;
  /** Epoch ms of last successful server-side telemetry timestamp */
  lastUpdatedAt: number | null;
  /** Formatted "Xs ago" / "Xm ago" string, or null */
  updatedAgoText: string | null;
  error: string | null;
  errorCode: EcoFlowErrorCode | null;
  /** True when in backoff mode (rate limited or repeated failures) */
  isBackoff: boolean;
  /** Manual reconnect — triggers immediate fetch and resets backoff */
  reconnect: () => void;
  /** Refresh — re-reads persisted device selection and polls */
  refresh: () => void;
  /** Increments on every successful poll */
  version: number;

  // ── Autopilot Lite (V1.2) ──────────────────────────────
  /** Net power: solarWatts − outputWatts. Positive = charging, negative = draining. */
  netWatts: number | null;
  /** Rolling average of outputWatts across the last N samples in the buffer. */
  avgOutputWatts: number | null;
  /** Rolling average of solarWatts across the last N samples in the buffer. */
  avgSolarWatts: number | null;
  /** Human-readable endurance string, e.g. "Charging", "~11h until 20%", "Below reserve". */
  enduranceText: string | null;
  /** Number of samples currently in the rolling buffer (0–5). */
  sampleCount: number;
}


// ── "Updated X ago" formatter ───────────────────────────────

function formatAgo(epochMs: number | null): string | null {
  if (epochMs == null) return null;
  const diffMs = Date.now() - epochMs;
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ── Derive status from lastUpdatedAt + cache state ──────────

function deriveStatus(
  hasDevice: boolean,
  lastUpdatedAt: number | null,
  hasCache: boolean,
  consecutiveFails: number,
): EcoFlowStatus {
  if (!hasDevice) return 'standby';
  if (lastUpdatedAt != null) {
    const age = Date.now() - lastUpdatedAt;
    if (age <= LIVE_THRESHOLD_MS) return 'live';
    if (age <= DEGRADED_THRESHOLD_MS) return 'degraded';
  }
  // No recent update
  if (hasCache && consecutiveFails < 10) return 'degraded';
  if (consecutiveFails > 0 || lastUpdatedAt == null) return 'offline';
  return 'offline';
}

// ── Autopilot Lite: compute endurance text ──────────────────

function computeEnduranceText(
  batteryPct: number | null,
  netWatts: number | null,
  avgNetDrain: number, // positive = draining from battery
): string | null {
  if (batteryPct == null || netWatts == null) return null;

  // Net positive (solar >= output) → charging
  if (netWatts >= 0) return 'Charging';

  // Battery already below reserve
  if (batteryPct <= RESERVE_THRESHOLD_PCT) return 'Below reserve';

  // Net drain from battery
  if (avgNetDrain <= 0) return 'Charging';

  const usablePercent = batteryPct - RESERVE_THRESHOLD_PCT;
  const usableWh = (usablePercent / 100) * ASSUMED_CAPACITY_WH;
  const hoursRemaining = usableWh / avgNetDrain;

  if (hoursRemaining > 99) return 'Charging';

  // Format: hours and optional minutes
  const wholeHours = Math.floor(hoursRemaining);
  const remainingMinutes = Math.round((hoursRemaining - wholeHours) * 60);

  if (wholeHours === 0 && remainingMinutes <= 0) return '<1m until 20%';
  if (wholeHours === 0) return `~${remainingMinutes}m until 20%`;
  if (remainingMinutes === 0 || remainingMinutes === 60) {
    const h = remainingMinutes === 60 ? wholeHours + 1 : wholeHours;
    return `~${h}h until 20%`;
  }
  return `~${wholeHours}h ${remainingMinutes}m until 20%`;
}

// ── Hook implementation ─────────────────────────────────────

export function useEcoFlowLive(): EcoFlowLiveData {
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [solarWatts, setSolarWatts] = useState<number | null>(null);
  const [outputWatts, setOutputWatts] = useState<number | null>(null);
  const [inputWatts, setInputWatts] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<EcoFlowErrorCode | null>(null);
  const [version, setVersion] = useState(0);
  const [agoTick, setAgoTick] = useState(0); // forces re-render for "Xs ago"

  const deviceIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const consecutiveFailsRef = useRef(0);
  const isBackoffRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isPollingRef = useRef(false); // prevent concurrent polls

  // ── Rolling telemetry sample buffer (V1.2) ─────────────────
  const sampleBufferRef = useRef<TelemetrySample[]>([]);

  /** Push a new sample into the rolling buffer, keeping max SAMPLE_BUFFER_SIZE entries. */
  const pushSample = useCallback((sample: TelemetrySample) => {
    const buf = sampleBufferRef.current;
    buf.push(sample);
    if (buf.length > SAMPLE_BUFFER_SIZE) {
      buf.shift(); // drop oldest
    }
  }, []);

  /** Clear the sample buffer (e.g. on device change). */
  const clearSampleBuffer = useCallback(() => {
    sampleBufferRef.current = [];
  }, []);

  // ── Restore cache on mount ─────────────────────────────────

  const restoreCache = useCallback((devId: string) => {
    const cached = getCachedTelemetry(devId);
    if (cached && mountedRef.current) {
      setBatteryPct(cached.batteryPct);
      setSolarWatts(cached.solarWatts);
      setOutputWatts(cached.outputWatts);
      setInputWatts(cached.inputWatts);
      if (cached.deviceName) setDeviceName(cached.deviceName);
      setLastUpdatedAt(cached.serverTimestamp);
    }
  }, []);

  // ── Core poll function ─────────────────────────────────────

  const poll = useCallback(async () => {
    if (!mountedRef.current) return;
    if (isPollingRef.current) return; // skip if already polling
    isPollingRef.current = true;

    try {
      // ── Step 1: Resolve device ID ─────────────────────────
      const persistedId = getSelectedEcoFlowDevice();

      if (persistedId) {
        // If device changed, clear the sample buffer
        if (persistedId !== deviceIdRef.current) {
          clearSampleBuffer();
        }
        deviceIdRef.current = persistedId;
        if (mountedRef.current) setSelectedDeviceIdState(persistedId);
      }

      if (!deviceIdRef.current) {
        // No persisted selection — try to auto-discover
        const { data: devData, error: devErr } = await supabase.functions.invoke('ecoflow', {
          body: { action: 'devices' },
        });

        if (!mountedRef.current) return;

        // V1.3: Resolve structured error from either data body or FunctionsHttpError context
        let resolvedCode: string | undefined = devData?.code;
        let resolvedMessage: string | undefined = devData?.message;
        const devOk = devData?.ok === true;

        if (!devOk && !resolvedCode && devErr) {
          // Edge function returned non-2xx — try to extract structured error from context
          const extracted = await extractStructuredError(devErr);
          if (extracted) {
            resolvedCode = extracted.code;
            resolvedMessage = extracted.message;
          }
        }

        if (devErr || !devOk) {
          const code = resolvedCode as EcoFlowErrorCode | undefined;

          // V1.3: Check for permanent errors (credentials, auth, config)
          if (isPermanentError(code)) {
            setError(resolvedMessage || 'EcoFlow configuration error');
            setErrorCode(code || 'ECOFLOW_AUTH_FAILED');
            return;
          }

          consecutiveFailsRef.current++;

          // V1.3: Check for backoff errors
          if (isBackoffError(code)) {
            isBackoffRef.current = true;
          } else if (
            (code === 'UPSTREAM' || code === 'ECOFLOW_API_ERROR' || code === 'INTERNAL_SERVER_ERROR') &&
            consecutiveFailsRef.current >= CONSECUTIVE_FAIL_BACKOFF
          ) {
            isBackoffRef.current = true;
          }

          setError(resolvedMessage || devErr?.message || 'Failed to fetch devices');
          setErrorCode(code || 'ECOFLOW_API_ERROR');
          return;
        }

        const devices = devData.devices || [];
        if (devices.length === 0) {
          setError('No EcoFlow devices found');
          setErrorCode(null);
          return;
        }

        const online = devices.find((d: any) => d.online);
        const chosen = online || devices[0];
        clearSampleBuffer(); // new device, fresh buffer
        deviceIdRef.current = chosen.id;
        if (mountedRef.current) {
          setDeviceName(chosen.name || chosen.id);
          setSelectedDeviceIdState(chosen.id);
        }
      }

      const currentDeviceId = deviceIdRef.current!;

      // ── Step 2: Poll telemetry ────────────────────────────
      const { data: telData, error: telErr } = await supabase.functions.invoke('ecoflow', {
        body: { action: 'telemetry', deviceId: currentDeviceId },
      });

      if (!mountedRef.current) return;

      // V1.3: Resolve structured error from either data body or FunctionsHttpError context
      let telCode: string | undefined = telData?.code;
      let telMessage: string | undefined = telData?.message;
      const telOk = telData?.ok === true;

      if (!telOk && !telCode && telErr) {
        const extracted = await extractStructuredError(telErr);
        if (extracted) {
          telCode = extracted.code;
          telMessage = extracted.message;
        }
      }

      if (telErr || !telOk) {
        const code = telCode as EcoFlowErrorCode | undefined;
        consecutiveFailsRef.current++;

        // V1.3: Backoff on rate limit or repeated transient failures
        if (isBackoffError(code)) {
          isBackoffRef.current = true;
        } else if (
          (code === 'UPSTREAM' || code === 'ECOFLOW_API_ERROR' || code === 'INTERNAL_SERVER_ERROR') &&
          consecutiveFailsRef.current >= CONSECUTIVE_FAIL_BACKOFF
        ) {
          isBackoffRef.current = true;
        }

        // On failure: keep showing cached telemetry
        const cached = getCachedTelemetry(currentDeviceId);
        if (cached) {
          setBatteryPct(cached.batteryPct);
          setSolarWatts(cached.solarWatts);
          setOutputWatts(cached.outputWatts);
          setInputWatts(cached.inputWatts);
          if (cached.deviceName) setDeviceName(cached.deviceName);
          // Keep lastUpdatedAt as the cached server timestamp (will age into DEGRADED)
          setLastUpdatedAt(cached.serverTimestamp);
        }

        setError(telMessage || telErr?.message || 'Telemetry fetch failed');
        setErrorCode(code || 'ECOFLOW_API_ERROR');
        return;
      }

      // ── Success ───────────────────────────────────────────
      consecutiveFailsRef.current = 0;
      isBackoffRef.current = false;

      // V1.1: Use server-side timestamp (epoch ms)
      const serverTs: number = typeof telData.timestamp === 'number'
        ? telData.timestamp
        : Date.now();

      const bp = typeof telData.batteryPercent === 'number' ? telData.batteryPercent : null;
      const sw = typeof telData.solarWatts === 'number' ? telData.solarWatts : null;
      const ow = typeof telData.outputWatts === 'number' ? telData.outputWatts : null;
      const iw = typeof telData.inputWatts === 'number' ? telData.inputWatts : null;

      setBatteryPct(bp);
      setSolarWatts(sw);
      setOutputWatts(ow);
      setInputWatts(iw);
      setLastUpdatedAt(serverTs);
      setError(null);
      setErrorCode(null);
      setVersion((v) => v + 1);

      // ── V1.2: Push sample to rolling buffer ───────────────
      if (bp != null && sw != null && ow != null) {
        pushSample({
          batteryPct: bp,
          solarWatts: sw,
          outputWatts: ow,
          timestamp: serverTs,
        });
      }

      // Persist to cache
      const cacheEntry: CachedTelemetry = {
        batteryPct: bp,
        solarWatts: sw,
        outputWatts: ow,
        inputWatts: iw,
        deviceName: deviceName,
        serverTimestamp: serverTs,
      };
      setCachedTelemetry(currentDeviceId, cacheEntry);
    } catch (e: any) {
      if (mountedRef.current) {
        consecutiveFailsRef.current++;
        if (consecutiveFailsRef.current >= CONSECUTIVE_FAIL_BACKOFF) {
          isBackoffRef.current = true;
        }
        setError(e?.message || 'Unexpected error');
        setErrorCode('ECOFLOW_API_ERROR');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [deviceName, pushSample, clearSampleBuffer]);


  // ── Schedule next poll ─────────────────────────────────────

  const scheduleNextPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!mountedRef.current) return;

    const interval = isBackoffRef.current ? POLL_BACKOFF_MS : POLL_NORMAL_MS;

    pollTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      // Don't poll if app is in background
      if (appStateRef.current !== 'active') return;

      await poll();
      scheduleNextPoll();
    }, interval);
  }, [poll]);

  // ── Reconnect (manual) — resets backoff and polls immediately ──

  const reconnect = useCallback(() => {
    consecutiveFailsRef.current = 0;
    isBackoffRef.current = false;
    if (mountedRef.current) {
      setError(null);
      setErrorCode(null);
    }
    poll().then(() => {
      if (mountedRef.current) scheduleNextPoll();
    });
  }, [poll, scheduleNextPoll]);

  // ── Refresh — re-reads persisted selection ─────────────────

  const refresh = useCallback(() => {
    const persistedId = getSelectedEcoFlowDevice();
    if (persistedId !== deviceIdRef.current) {
      deviceIdRef.current = persistedId;
      clearSampleBuffer(); // new device, fresh buffer
      if (mountedRef.current) {
        setSelectedDeviceIdState(persistedId);
      }
      // Restore cache for new device
      if (persistedId) restoreCache(persistedId);
    }
    // Reset backoff and poll immediately
    consecutiveFailsRef.current = 0;
    isBackoffRef.current = false;
    poll().then(() => {
      if (mountedRef.current) scheduleNextPoll();
    });
  }, [poll, scheduleNextPoll, restoreCache, clearSampleBuffer]);

  // ── AppState listener (stop polling on background) ─────────

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasForeground = appStateRef.current === 'active';
      appStateRef.current = nextState;

      if (nextState === 'active' && !wasForeground) {
        // Returning to foreground — resume polling immediately
        poll().then(() => {
          if (mountedRef.current) scheduleNextPoll();
        });
      } else if (nextState !== 'active' && wasForeground) {
        // Going to background — stop polling
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [poll, scheduleNextPoll]);

  // ── "Updated Xs ago" ticker (updates every 5s) ────────────

  useEffect(() => {
    agoTimerRef.current = setInterval(() => {
      if (mountedRef.current) setAgoTick((t) => t + 1);
    }, 5_000);

    return () => {
      if (agoTimerRef.current) clearInterval(agoTimerRef.current);
    };
  }, []);

  // ── Mount / unmount lifecycle ──────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    // Read persisted selection on mount
    const persistedId = getSelectedEcoFlowDevice();
    if (persistedId) {
      deviceIdRef.current = persistedId;
      setSelectedDeviceIdState(persistedId);
      restoreCache(persistedId);
    }

    // Initial poll
    poll().then(() => {
      if (mountedRef.current) scheduleNextPoll();
    });

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [poll, scheduleNextPoll, restoreCache]);

  // ── Derive computed status ─────────────────────────────────

  const hasDevice = !!deviceIdRef.current || !!selectedDeviceId;
  const hasCache = selectedDeviceId ? !!getCachedTelemetry(selectedDeviceId) : false;

  const status = deriveStatus(
    hasDevice,
    lastUpdatedAt,
    hasCache || batteryPct != null,
    consecutiveFailsRef.current,
  );

  const updatedAgoText = formatAgo(lastUpdatedAt);

  // ── Autopilot Lite: derived power insights (V1.2) ─────────

  const sampleBuffer = sampleBufferRef.current;
  const sampleCount = sampleBuffer.length;

  // Net watts from latest values (instantaneous)
  const netWatts = useMemo(() => {
    if (solarWatts == null || outputWatts == null) return null;
    return solarWatts - outputWatts;
  }, [solarWatts, outputWatts]);

  // Rolling average output watts across buffer
  const avgOutputWatts = useMemo(() => {
    if (sampleCount === 0) return null;
    const sum = sampleBuffer.reduce((acc, s) => acc + s.outputWatts, 0);
    return Math.round((sum / sampleCount) * 10) / 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, sampleCount]);

  // Rolling average solar watts across buffer
  const avgSolarWatts = useMemo(() => {
    if (sampleCount === 0) return null;
    const sum = sampleBuffer.reduce((acc, s) => acc + s.solarWatts, 0);
    return Math.round((sum / sampleCount) * 10) / 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, sampleCount]);

  // Endurance text
  const enduranceText = useMemo(() => {
    if (status === 'standby' || status === 'offline') return null;
    // Use rolling average net drain for more stable estimate
    const avgNetDrain = (avgOutputWatts ?? 0) - (avgSolarWatts ?? 0);
    return computeEnduranceText(batteryPct, netWatts, avgNetDrain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batteryPct, netWatts, avgOutputWatts, avgSolarWatts, status]);

  return {
    status,
    batteryPct,
    solarWatts,
    outputWatts,
    inputWatts,
    deviceName,
    selectedDeviceId,
    lastUpdatedAt,
    updatedAgoText,
    error,
    errorCode,
    isBackoff: isBackoffRef.current,
    reconnect,
    refresh,
    version,
    // Autopilot Lite (V1.2)
    netWatts,
    avgOutputWatts,
    avgSolarWatts,
    enduranceText,
    sampleCount,
  };
}

