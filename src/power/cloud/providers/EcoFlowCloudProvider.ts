/**
 * EcoFlowCloudProvider — ICloudProvider for EcoFlow devices.
 *
 * Phase 3B: Simulated telemetry (stub mode) — still available as fallback.
 * Phase 3D-2: Real cloud polling via Supabase edge function
 *   `power-ecoflow-poll`, with 501 pending_approval handled as a
 *   non-fatal "pending" state that returns stale partial telemetry
 *   instead of throwing (preventing CloudConnector backoff thrash).
 * Phase 3E-2: Multi-device polling + aggregation.
 *   - listDevices() fetches the device catalog from `power-ecoflow-device-list`
 *   - connect() loads selected devices from powerDeviceStore; if none
 *     selected, fetches all devices (dev-friendly default)
 *   - pollOnce() polls every active device, aggregates into one telemetry
 *     snapshot (sums for watts, averages for SOC/temp)
 *   - Partial success: if at least one device succeeds, no throw
 *   - Only throws if ALL devices fail with non-501 errors
 *   - 501 pending_approval marks stale, never throws
 * Phase 3G-2: getPerDeviceTelemetry() — public accessor for per-device
 *   telemetry contributions, consumed by Power Center device panel.
 *
 * Polling modes:
 *   1. "cloud"  — calls edge function; used when a real token is set
 *   2. "simulate" — local simulation; used when token is "SIMULATE"
 *                   or when cloud returns pending_approval
 */


import type { ICloudProvider, CloudProviderMeta } from "../CloudTypes";
import type {
  PowerTelemetry,
  PowerCapabilities,
} from "../../types/PowerTelemetry";
import {
  getPowerTruthLabel,
  isPowerSimulationAllowed,
  normalizePowerTelemetryTruth,
} from "../../types/PowerTelemetry";
import type { PowerDevice as CatalogPowerDevice } from "../../types/PowerDevice";
import { powerDeviceStore } from "../../devices/PowerDeviceStore";
import {
  ECOFLOW_UNAUTHORIZED_DEVICE_REASON,
  isEcoFlowUnauthorizedDeviceError,
} from "../../../../lib/ecoflowUnauthorizedDevice";
import {
  describeEcoFlowBluEligibility,
  normalizeEcoFlowTelemetryProductType,
} from "../../../../lib/ecoflowBluTelemetryEligibility";
import { ecsLog } from "../../../../lib/ecsLogger";

// ── Supabase import (lazy to avoid hard crash if unavailable) ────────────
let _supabase: any = null;
let _supabasePromise: Promise<any> | null = null;

function isEcoFlowTelemetryDebugEnabled(): boolean {
  try {
    return Boolean((globalThis as Record<string, unknown>).__ECS_ECOFLOW_TELEMETRY_DEBUG);
  } catch {
    return false;
  }
}

const ECOFLOW_LOG_TAG = "[EcoFlowCloudProvider]";
const ecoFlowUnauthorizedWarningKeys = new Set<string>();

function ecoFlowErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return { errorMessage: String(error) };
}

function logEcoFlowDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev("POWER", message, details, {
    tag: ECOFLOW_LOG_TAG,
    debugFlag: "ECS_DEBUG_ECOFLOW_CLOUD",
    fingerprint: `${message}:${JSON.stringify(details ?? {})}`,
    throttleMs: 2500,
    aggregateWindowMs: 30_000,
  });
}

function logEcoFlowWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn("POWER", `${ECOFLOW_LOG_TAG} ${message}`, details);
}

function logEcoFlowUnauthorizedDeviceWarnOnce(deviceId: string, error: string | null): void {
  const key = `unauthorized:${deviceId}`;
  if (ecoFlowUnauthorizedWarningKeys.has(key)) return;
  ecoFlowUnauthorizedWarningKeys.add(key);
  ecsLog.warn("POWER", `${ECOFLOW_LOG_TAG} filtered EcoFlow device: unauthorized for cloud telemetry`, {
    deviceId,
    reason: "unauthorized",
    errorMessage: error,
  });
}

async function getSupabase(): Promise<any> {
  if (_supabase) return _supabase;
  if (!_supabasePromise) {
    _supabasePromise = import("../../../../lib/supabase")
      .then((mod) => {
        _supabase = mod.supabase;
        if (__DEV__) logEcoFlowDebug("Supabase client loaded");
        return _supabase;
      })
      .catch((err) => {
        if (__DEV__) logEcoFlowDebug("Failed to import Supabase client", ecoFlowErrorDetails(err));
        return null;
      })
      .finally(() => {
        _supabasePromise = null;
      });
  }
  return _supabasePromise;
}

// ── Constants ───────────────────────────────────────────────────────────

/** Token value that forces simulation mode (no cloud calls). */
const SIMULATE_TOKEN = "SIMULATE";

/** Edge function names. */
const POLL_FUNCTION = "ecoflow";
const DEVICE_LIST_FUNCTION = "ecoflow";

// ── Polling mode ────────────────────────────────────────────────────────

type PollMode = "cloud" | "simulate";

// ── Cloud poll status (diagnostic) ──────────────────────────────────────

export type EcoFlowCloudStatus =
  | "idle"
  | "connected"
  | "pending_approval"
  | "polling"
  | "cloud_ok"
  | "cloud_error"
  | "simulating";

export type EcoFlowCloudClientState =
  | "authRequired"
  | "deviceUnauthorized"
  | "cloudUnavailable"
  | "deviceOffline"
  | "cloudPolling"
  | "cloudStale";

// ── Per-device poll result (internal diagnostics) ───────────────────────

interface DevicePollResult {
  deviceId: string;
  ok: boolean;
  pendingApproval: boolean;
  unauthorized: boolean;
  failureState: EcoFlowCloudClientState | null;
  telemetry: Partial<PowerTelemetry> | null;
  error: string | null;
  polledAt: number;
}

// ── Simulation helpers ──────────────────────────────────────────────────

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Random float in [min, max). */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Compute a solar multiplier based on the current hour of day.
 * Peaks at solar noon (~13:00 local), zero at night.
 * Returns a value in [0, 1].
 */
function solarMultiplier(): number {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  if (hour < 6 || hour > 20) return 0;
  const x = (hour - 13) / 4;
  return Math.exp(-x * x) * clamp(1 - Math.abs(x) * 0.15, 0, 1);
}

/** Round to N decimal places. */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ── EcoFlow model presets ───────────────────────────────────────────────

/**
 * Simulated EcoFlow device profiles.
 * The provider selects one based on the deviceId prefix.
 */
interface EcoFlowModelProfile {
  model: string;
  capacityWh: number;
  maxSolarInputW: number;
  maxOutputW: number;
  nominalVoltage: number;
  firmware: string;
}

const MODEL_PROFILES: Record<string, EcoFlowModelProfile> = {
  delta2: {
    model: "DELTA 2",
    capacityWh: 1024,
    maxSolarInputW: 500,
    maxOutputW: 1800,
    nominalVoltage: 24,
    firmware: "2.1.4.6",
  },
  delta2max: {
    model: "DELTA 2 Max",
    capacityWh: 2048,
    maxSolarInputW: 1000,
    maxOutputW: 2400,
    nominalVoltage: 48,
    firmware: "2.2.1.3",
  },
  delta31500: {
    model: "DELTA 3 1500",
    capacityWh: 1536,
    maxSolarInputW: 500,
    maxOutputW: 1800,
    nominalVoltage: 48,
    firmware: "3.0.0",
  },
  river2pro: {
    model: "RIVER 2 Pro",
    capacityWh: 768,
    maxSolarInputW: 220,
    maxOutputW: 800,
    nominalVoltage: 24,
    firmware: "2.0.8.1",
  },
  deltapro: {
    model: "DELTA Pro",
    capacityWh: 3600,
    maxSolarInputW: 1600,
    maxOutputW: 3600,
    nominalVoltage: 48,
    firmware: "2.3.0.9",
  },
};

/** Resolve a model profile from a deviceId. Falls back to DELTA 2. */
function resolveProfile(deviceId: string): EcoFlowModelProfile {
  const lower = deviceId.toLowerCase();
  for (const [key, profile] of Object.entries(MODEL_PROFILES)) {
    if (lower.includes(key)) return profile;
  }
  return MODEL_PROFILES.delta2;
}

function resolveProfileFromText(value: string): EcoFlowModelProfile {
  const upper = value.toUpperCase();
  if (upper.includes("DELTA 3 1500")) return MODEL_PROFILES.delta31500;
  if (upper.includes("DELTA 2 MAX")) return MODEL_PROFILES.delta2max;
  if (upper.includes("DELTA 2")) return MODEL_PROFILES.delta2;
  if (upper.includes("DELTA PRO")) return MODEL_PROFILES.deltapro;
  if (upper.includes("RIVER 2 PRO")) return MODEL_PROFILES.river2pro;
  return resolveProfile(value);
}

// ── Edge function response types ────────────────────────────────────────

interface EdgePollSuccess {
  ok: true;
  source?: "ecoflow-cloud";
  phase?: "auth" | "deviceList" | "telemetry" | "normalize";
  deviceId?: string;
  telemetry: {
    device: { id: string; vendor: string; model: string };
    battery: {
      socPct?: number;
      volts?: number;
      wattsIn?: number;
      wattsOut?: number;
      tempC?: number;
    };
    solar: { watts?: number };
    flags: { charging?: boolean; stale: boolean };
  };
  rawQuota?: unknown;
  polledAt: string;
}

interface EdgePollError {
  ok: false;
  code: string;
  message: string;
  source?: "ecoflow-cloud";
  phase?: "auth" | "deviceList" | "telemetry" | "normalize";
  error?: {
    code: string;
    message: string;
    authRequired?: boolean;
    deviceUnauthorized?: boolean;
    retryable?: boolean;
  };
  details?: { status?: number; bodySnippet?: string; ecoflowCode?: string };
}

type EdgePollResponse = EdgePollSuccess | EdgePollError;

// ── Edge function device-list response types ────────────────────────────

interface EdgeDeviceListSuccess {
  ok: true;
  source?: "ecoflow-cloud";
  phase?: "auth" | "deviceList" | "telemetry" | "normalize";
  devices: {
    id?: string;
    deviceId: string;
    name?: string;
    deviceName: string;
    model: string;
    productType: string;
    online?: boolean;
    serial?: string;
  }[];
  deviceCount: number;
  fetchedAt: string;
}

interface EdgeDeviceListError {
  ok: false;
  code: string;
  message: string;
  source?: "ecoflow-cloud";
  phase?: "auth" | "deviceList" | "telemetry" | "normalize";
  error?: {
    code: string;
    message: string;
    authRequired?: boolean;
    deviceUnauthorized?: boolean;
    retryable?: boolean;
  };
}

type EdgeDeviceListResponse = EdgeDeviceListSuccess | EdgeDeviceListError;

function getEdgeErrorCode(error: EdgePollError | EdgeDeviceListError | null | undefined): string {
  return String(error?.error?.code ?? error?.code ?? '').trim();
}

function getEdgeErrorMessage(error: EdgePollError | EdgeDeviceListError | null | undefined): string {
  return String(error?.error?.message ?? error?.message ?? '').trim();
}

function classifyEcoFlowCloudFailureState(
  value: unknown,
): EcoFlowCloudClientState {
  const parts: string[] = [];
  const collect = (input: unknown, depth = 0): void => {
    if (input == null || depth > 3) return;
    if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
      parts.push(String(input));
      return;
    }
    if (input instanceof Error) {
      parts.push(input.message);
      return;
    }
    if (Array.isArray(input)) {
      for (const item of input) collect(item, depth + 1);
      return;
    }
    if (typeof input === "object") {
      const record = input as Record<string, unknown>;
      if (record.error && typeof record.error === "object") {
        const edgeError = record.error as Record<string, unknown>;
        if (edgeError.deviceUnauthorized === true) {
          parts.push("deviceUnauthorized");
        }
        if (edgeError.authRequired === true) {
          parts.push("authRequired");
        }
        if (edgeError.retryable === true) {
          parts.push("retryable");
        }
      }
      for (const item of Object.values(record)) collect(item, depth + 1);
    }
  };
  collect(value);

  const haystack = parts.join(" ").toLowerCase();
  if (
    haystack.includes("deviceunauthorized") ||
    haystack.includes("device_not_authorized") ||
    haystack.includes("current device is not allowed") ||
    haystack.includes("not allowed to get device info") ||
    haystack.includes("device unauthorized")
  ) {
    return "deviceUnauthorized";
  }
  if (
    haystack.includes("authrequired") ||
    haystack.includes("missing_ecoflow_credentials") ||
    haystack.includes("ecoflow_auth_required") ||
    haystack.includes("invalid access") ||
    haystack.includes("access key") ||
    haystack.includes("api key") ||
    haystack.includes("signature") ||
    haystack.includes("wrong account") ||
    haystack.includes("wrong region") ||
    haystack.includes("pending_approval")
  ) {
    return "authRequired";
  }
  if (
    haystack.includes("deviceoffline") ||
    haystack.includes("device_offline") ||
    haystack.includes("offline") ||
    haystack.includes("not online") ||
    haystack.includes("device unavailable")
  ) {
    return "deviceOffline";
  }
  if (
    haystack.includes("cloudstale") ||
    haystack.includes("pending_approval") ||
    haystack.includes("stale")
  ) {
    return "cloudStale";
  }
  return "cloudUnavailable";
}

function normalizeEdgeError(
  response: EdgePollError | EdgeDeviceListError | null | undefined,
): EdgePollError | null {
  if (!response) return null;
  const nested = response.error;
  return {
    ok: false,
    source: response.source,
    phase: response.phase,
    code: getEdgeErrorCode(response),
    message: getEdgeErrorMessage(response),
    error: nested,
    details: (response as EdgePollError).details,
  };
}

// ── Legacy name normalization helpers ───────────────────────────────────

function inferEcoFlowMetadata(
  name: string,
): { model: string; productType: string } {
  const raw = String(name || '').trim();
  const upper = raw.toUpperCase();

  if (upper.includes('GLACIER')) {
    return { model: 'GLACIER', productType: 'refrigerator' };
  }
  if (upper.includes('WAVE 2')) {
    return { model: 'WAVE 2', productType: 'portable_ac' };
  }
  if (upper.includes('ALTERNATOR CHARGER')) {
    return { model: 'Alternator Charger', productType: 'charger' };
  }
  if (upper.includes('DELTA 3 1500')) {
    return { model: 'DELTA 3 1500', productType: 'power_station' };
  }
  if (upper.includes('DELTA MINI')) {
    return { model: 'DELTA Mini', productType: 'power_station' };
  }
  if (upper.includes('DELTA 2 MAX')) {
    return { model: 'DELTA 2 Max', productType: 'power_station' };
  }
  if (upper.includes('DELTA 2')) {
    return { model: 'DELTA 2', productType: 'power_station' };
  }
  if (upper.includes('DELTA PRO')) {
    return { model: 'DELTA Pro', productType: 'power_station' };
  }
  if (upper.includes('RIVER 2 PRO')) {
    return { model: 'RIVER 2 Pro', productType: 'power_station' };
  }
  if (upper.includes('RIVER')) {
    return { model: raw, productType: 'power_station' };
  }
  return { model: raw || 'EcoFlow Device', productType: 'unknown' };
}

function normalizeEcoFlowCatalogProductType(
  value: string,
  fallbackText: string,
): string {
  const normalized = normalizeEcoFlowTelemetryProductType(value, fallbackText);
  return normalized === 'unknown' ? inferEcoFlowMetadata(fallbackText).productType : normalized;
}

function isEcoFlowCloudTelemetryCandidate(
  eligibility: ReturnType<typeof describeEcoFlowBluEligibility>,
): boolean {
  if (!eligibility.deviceId) return false;
  if (eligibility.telemetryCapable) return true;

  // The EcoFlow device-list API often omits product type/model metadata,
  // especially for user-renamed devices. Cloud telemetry is a server-side
  // capability check, so unknown catalog types should be tried instead of
  // silently blocked. Local BLU/BLE telemetry remains stricter elsewhere.
  return eligibility.productType === "unknown";
}

function normalizeEcoFlowTelemetryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ECOFLOW_TELEMETRY_ENTRY_KEY_FIELDS = [
  "key",
  "name",
  "quota",
  "quotaName",
  "quotaCode",
  "quota_code",
  "quotaId",
  "quota_id",
  "param",
  "paramName",
  "parameter",
  "parameterName",
  "property",
  "propertyName",
  "identifier",
  "field",
  "fieldName",
  "metric",
  "metricName",
  "item",
  "itemName",
  "path",
  "code",
  "dp",
  "dpCode",
  "dp_code",
  "point",
  "pointName",
  "id",
];

const ECOFLOW_TELEMETRY_ENTRY_VALUE_FIELDS = [
  "value",
  "val",
  "data",
  "num",
  "number",
  "currentValue",
  "current",
  "currentVal",
  "current_value",
  "actual",
  "actualValue",
  "displayValue",
  "latestValue",
  "lastValue",
  "realValue",
  "rawValue",
  "valueRaw",
  "valueNum",
  "valueNumber",
  "numericValue",
  "dataValue",
  "reading",
  "meterValue",
];

function addFlattenedTelemetryValues(
  target: Map<string, unknown>,
  value: unknown,
  path: string[] = [],
): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (Array.isArray(item)) {
        if (item.length >= 2 && typeof item[0] === "string" && item[0].trim()) {
          target.set(normalizeEcoFlowTelemetryKey(item[0].trim()), unwrapTelemetryEntryValue(item[1]));
        }
        continue;
      }

      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as Record<string, unknown>;
      const key = readTelemetryEntryKey(record);
      const entryValue = readTelemetryEntryValue(record);
      if (key && entryValue !== undefined) {
        target.set(normalizeEcoFlowTelemetryKey(key), entryValue);
        target.set(normalizeEcoFlowTelemetryKey(key), unwrapTelemetryEntryValue(entryValue));
      }

      addFlattenedTelemetryValues(target, record, path);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const entryKey = readTelemetryEntryKey(record);
  const entryValue = readTelemetryEntryValue(record);
  if (entryKey && entryValue !== undefined) {
    target.set(normalizeEcoFlowTelemetryKey(entryKey), unwrapTelemetryEntryValue(entryValue));
  }

  for (const [key, child] of Object.entries(record)) {
    const nextPath = [...path, key];
    const exactPath = nextPath.join(".");

    if (child && typeof child === "object") {
      const childEntryValue = !Array.isArray(child)
        ? readTelemetryEntryValue(child as Record<string, unknown>)
        : undefined;
      if (childEntryValue !== undefined) {
        const unwrapped = unwrapTelemetryEntryValue(childEntryValue);
        target.set(normalizeEcoFlowTelemetryKey(exactPath), unwrapped);
        target.set(normalizeEcoFlowTelemetryKey(key), unwrapped);
      }
      addFlattenedTelemetryValues(target, child, nextPath);
      continue;
    }

    target.set(normalizeEcoFlowTelemetryKey(exactPath), child);
    target.set(normalizeEcoFlowTelemetryKey(key), child);
  }
}

function readTelemetryEntryKey(record: Record<string, unknown>): string | null {
  for (const key of ECOFLOW_TELEMETRY_ENTRY_KEY_FIELDS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readTelemetryEntryValue(record: Record<string, unknown>): unknown {
  for (const key of ECOFLOW_TELEMETRY_ENTRY_VALUE_FIELDS) {
    if (key in record) return record[key];
  }
  return undefined;
}

function unwrapTelemetryEntryValue(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const nested = readTelemetryEntryValue(current as Record<string, unknown>);
    if (nested === undefined || nested === current) return current;
    current = nested;
  }
  return current;
}

// ── EcoFlowCloudProvider class ──────────────────────────────────────────

export class EcoFlowCloudProvider implements ICloudProvider {
  readonly id = "ecoflow";

  // ── Internal state ──────────────────────────────────────────────────
  private deviceId: string | null = null;
  private token: string | null = null;
  private profile: EcoFlowModelProfile = MODEL_PROFILES.delta2;
  private connected = false;
  private pollMode: PollMode = "simulate";

  // ── Multi-device state (Phase 3E-2) ─────────────────────────────────
  /** Active device IDs to poll. Populated during connect(). */
  private activeDeviceIds: string[] = [];
  /** Last listed EcoFlow catalog, including devices not eligible for BLU telemetry. */
  private listedDeviceCatalog = new Map<string, CatalogPowerDevice>();
  /** Per-device last poll results for diagnostics. */
  private perDeviceResults: Map<string, DevicePollResult> = new Map();
  /** Device IDs excluded from cloud telemetry for this provider session. */
  private unauthorizedDeviceIds = new Set<string>();
  private unauthorizedWarningDeviceIds = new Set<string>();
  private fallbackInfoDeviceIds = new Set<string>();

  // ── Diagnostic state ────────────────────────────────────────────────
  private _lastStatus: EcoFlowCloudStatus = "idle";
  private _lastCloudError: string | null = null;
  private _lastCloudFailure: EcoFlowCloudClientState | null = null;
  private _cloudPollCount: number = 0;
  private _simulationPollCount: number = 0;
  private _pendingApprovalCount: number = 0;

  // ── Simulation state (persists between polls) ──────────────────────
  private socPct: number = 68;
  private wattsOut: number = 145;
  private wattsIn: number = 0; // shore/AC charging input
  private solarWatts: number = 0;
  private batteryVolts: number = 25.2;
  private batteryTempC: number = 23;
  private inverterOn: boolean = true;
  private pollCount: number = 0;

  // ── ICloudProvider: connect ─────────────────────────────────────────

  async connect(deviceId: string, token: string): Promise<void> {
    this.deviceId = deviceId;
    this.token = token;
    this.profile = resolveProfile(deviceId);
    this.connected = true;
    this.pollCount = 0;
    this._cloudPollCount = 0;
    this._simulationPollCount = 0;
    this._pendingApprovalCount = 0;
    this._lastCloudError = null;
    this._lastCloudFailure = null;
    this.perDeviceResults.clear();
    this.listedDeviceCatalog.clear();

    // Determine polling mode
    if (token.toUpperCase() === SIMULATE_TOKEN && isPowerSimulationAllowed()) {
      this.pollMode = "simulate";
      this._lastStatus = "simulating";
      this.activeDeviceIds = [deviceId];
    } else if (token.toUpperCase() === SIMULATE_TOKEN) {
      this.pollMode = "cloud";
      this._lastStatus = "cloud_error";
      this._lastCloudError = "EcoFlow simulation is disabled outside dev/demo mode.";
      this._lastCloudFailure = "cloudUnavailable";
      this.activeDeviceIds = [];
    } else {
      this.pollMode = "cloud";
      this._lastStatus = "connected";

      // ── Multi-device resolution (Phase 3E-2) ──────────────────
      await this.resolveActiveDevices(deviceId);
    }

    // Initialise simulation with realistic starting values (used as fallback)
    this.socPct = clamp(randRange(40, 90), 5, 100);
    this.wattsOut = randRange(60, 250);
    this.wattsIn = 0;
    this.solarWatts = 0;
    this.batteryVolts =
      this.profile.nominalVoltage +
      (this.socPct / 100) * (this.profile.nominalVoltage * 0.2);
    this.batteryTempC = randRange(18, 32);
    this.inverterOn = true;

    if (__DEV__) {
      logEcoFlowDebug("connected", {
        pollMode: this.pollMode,
        activeDeviceIds: [...this.activeDeviceIds],
      });
    }
  }

  // ── ICloudProvider: disconnect ──────────────────────────────────────

  async disconnect(): Promise<void> {
    this.connected = false;
    this.deviceId = null;
    this.token = null;
    this.pollCount = 0;
    this._lastStatus = "idle";
    this._lastCloudError = null;
    this._lastCloudFailure = null;
    this.activeDeviceIds = [];
    this.perDeviceResults.clear();
    this.listedDeviceCatalog.clear();
    this.unauthorizedDeviceIds.clear();
    this.unauthorizedWarningDeviceIds.clear();
    this.fallbackInfoDeviceIds.clear();

    if (__DEV__) logEcoFlowDebug("disconnected");
  }

  // ── ICloudProvider: pollOnce ────────────────────────────────────────

  async pollOnce(): Promise<Partial<PowerTelemetry>> {
    if (!this.connected) {
      throw new Error(
        "[EcoFlowCloudProvider] pollOnce() called while disconnected",
      );
    }

    this.pollCount++;

    // ── Cloud mode: poll all active devices ─────────────────────
    if (this.pollMode === "cloud") {
      return this.pollCloudMulti();
    }

    // ── Simulation mode ─────────────────────────────────────────
    if (!isPowerSimulationAllowed()) {
      return this.buildUnavailableTelemetry(
        "EcoFlow simulation is disabled outside dev/demo mode.",
      );
    }
    return this.pollSimulation();
  }

  // ── ICloudProvider: getCapabilities ─────────────────────────────────

  getCapabilities(): PowerCapabilities {
    return {
      hasSOC: true,
      hasWattsIn: true,
      hasWattsOut: true,
      hasSolar: true,
      hasRuntimeEstimate: true,
      controllable: false,
    };
  }

  // ── Static metadata ─────────────────────────────────────────────────

  /**
   * Return provider metadata for UI display / provider picker.
   */
  static getMeta(): CloudProviderMeta {
    return {
      id: "ecoflow",
      displayName: "EcoFlow Cloud",
      authType: "apikey",
      description:
        "Connect to EcoFlow DELTA, RIVER, and PowerStream devices via the EcoFlow Developer API.",
    };
  }

  // ── Public: listDevices ─────────────────────────────────────────────

  /**
   * Fetch the device catalog from the `power-ecoflow-device-list` edge function.
   *
   * On 501 pending_approval: returns [] (non-fatal).
   * On other errors: returns [] (non-fatal, logged).
   */
  async listDevices(): Promise<CatalogPowerDevice[]> {
    const supabase = await getSupabase();
    if (!supabase) {
      if (__DEV__) logEcoFlowDebug("listDevices: Supabase unavailable; returning empty list");
      this._lastStatus = "cloud_error";
      this._lastCloudError = "Supabase client unavailable.";
      this._lastCloudFailure = "cloudUnavailable";
      throw new Error("EcoFlow cloud provider unavailable.");
    }

    try {
      const { data, error } = await supabase.functions.invoke(
        DEVICE_LIST_FUNCTION,
        { body: { action: 'devices' } },
      );

      // Handle invoke-level errors (includes 501)
      if (error) {
        const parsed = this.tryParseEdgeResponse(data, error);
        if (parsed && parsed.code === "pending_approval") {
          if (__DEV__) logEcoFlowDebug("listDevices: pending approval; returning empty list");
          this._lastStatus = "pending_approval";
          this._lastCloudError = null;
          this._lastCloudFailure = "authRequired";
          return [];
        }
        const failureState = classifyEcoFlowCloudFailureState(parsed ?? data ?? error);
        const errorMessage = parsed?.message ?? error?.message ?? "EcoFlow device list request failed";
        this._lastStatus = "cloud_error";
        this._lastCloudError = errorMessage;
        this._lastCloudFailure = failureState;
        if (__DEV__) {
          logEcoFlowDebug("listDevices: edge error", {
            errorMessage,
            failureState,
          });
        }
        throw new Error(errorMessage);
      }

      const response = data as EdgeDeviceListResponse | null;

      // Support both:
      // 1. new split function shape: { ok: true, devices: [{ deviceId, deviceName, model, productType }], deviceCount }
      // 2. legacy shared ecoflow shape: { ok: true, devices: [{ id, name, online }] }
      if (!response || !response.ok) {
        const errResp = normalizeEdgeError(response as EdgeDeviceListError | null);
        if (errResp?.code === "pending_approval") {
          this._lastStatus = "pending_approval";
          this._lastCloudError = null;
          this._lastCloudFailure = "authRequired";
          return [];
        }
        const errorMessage = errResp?.message ?? "EcoFlow device list response failed";
        const failureState = classifyEcoFlowCloudFailureState(errResp ?? response);
        this._lastStatus = "cloud_error";
        this._lastCloudError = errorMessage;
        this._lastCloudFailure = failureState;
        if (__DEV__) {
          logEcoFlowDebug("listDevices: invalid response", {
            errorMessage,
            failureState,
          });
        }
        throw new Error(errorMessage);
      }

      const rawDevices = Array.isArray((response as any).devices) ? (response as any).devices : [];
      const normalizedDevices = rawDevices
        .map((d: any) => {
          const deviceId = String(d?.deviceId ?? d?.id ?? d?.sn ?? '').trim();
          const deviceName = String(d?.deviceName ?? d?.name ?? 'EcoFlow Device').trim();
          const inferenceText = [
            deviceName,
            d?.model,
            d?.productType,
            d?.productName,
            d?.deviceModel,
            d?.deviceType,
          ].filter(Boolean).join(' ');
          const inferred = inferEcoFlowMetadata(inferenceText);
          const modelRaw = String(d?.model ?? '').trim();
          const productTypeRaw = String(d?.productType ?? '').trim();
          const online =
            typeof d?.online === 'boolean'
              ? d.online
              : undefined;

          return {
            deviceId,
            deviceName,
            model: modelRaw && modelRaw.toLowerCase() !== 'unknown' ? modelRaw : inferred.model,
            productType: normalizeEcoFlowCatalogProductType(productTypeRaw, inferenceText),
            online,
          };
        })
        .filter((d: any) => d.deviceId.length > 0);
      const now = Date.now();
      const listedDevices = normalizedDevices.map(
        (d: any): CatalogPowerDevice => ({
          provider: "EcoFlow",
          deviceId: d.deviceId,
          name: d.deviceName,
          model: d.model,
          productType: d.productType,
          online: d.online,
          lastSeenAt: now,
        }),
      );

      this.listedDeviceCatalog = new Map(
        listedDevices.map((device: CatalogPowerDevice) => [device.deviceId, device]),
      );

      if (__DEV__) {
        logEcoFlowDebug("listDevices: catalog received", {
          count: listedDevices.length,
          source: DEVICE_LIST_FUNCTION,
          devices: listedDevices.map((device: CatalogPowerDevice) => ({
            deviceId: device.deviceId,
            name: device.name,
            model: device.model,
            productType: device.productType ?? "unknown",
          })),
        });
      }

      return listedDevices;
    } catch (err) {
      if (__DEV__) logEcoFlowDebug("listDevices: unexpected error", ecoFlowErrorDetails(err));
      this._lastStatus = "cloud_error";
      this._lastCloudError = err instanceof Error ? err.message : "EcoFlow device list failed.";
      this._lastCloudFailure = classifyEcoFlowCloudFailureState(err);
      throw err;
    }
  }

  // ── Public accessors ────────────────────────────────────────────────

  /** Whether the provider is in a connected state. */
  isConnected(): boolean {
    return this.connected;
  }

  /** The resolved device model profile. */
  getProfile(): EcoFlowModelProfile {
    return { ...this.profile };
  }

  /** Number of polls executed since connect(). */
  getPollCount(): number {
    return this.pollCount;
  }

  /** Current polling mode. */
  getPollMode(): PollMode {
    return this.pollMode;
  }

  /** Active device IDs being polled (Phase 3E-2). */
  getActiveDeviceIds(): string[] {
    return [...this.activeDeviceIds];
  }

  /** Number of active devices being polled. */
  getActiveDeviceCount(): number {
    return this.activeDeviceIds.length;
  }

  /**
   * Diagnostic: last status from the cloud polling path.
   * Useful for UI to show "pending_approval" state without error.
   */
  get lastStatus(): EcoFlowCloudStatus {
    return this._lastStatus;
  }

  /** Diagnostic: last cloud error message (null if last poll succeeded). */
  get lastCloudError(): string | null {
    return this._lastCloudError;
  }

  /** Diagnostic: normalized client state for the last cloud failure. */
  get lastCloudFailure(): EcoFlowCloudClientState | null {
    return this._lastCloudFailure;
  }

  /** Diagnostic: number of successful cloud polls. */
  get cloudPollCount(): number {
    return this._cloudPollCount;
  }

  /** Diagnostic: number of simulation polls (including pending_approval fallbacks). */
  get simulationPollCount(): number {
    return this._simulationPollCount;
  }

  /** Diagnostic: number of times pending_approval was received. */
  get pendingApprovalCount(): number {
    return this._pendingApprovalCount;
  }

  /**
   * Return a diagnostic snapshot for debugging / dev tools.
   */
  getDiagnostics(): Record<string, unknown> {
    // Build per-device summary
    const perDevice: Record<string, unknown> = {};
    for (const [id, result] of this.perDeviceResults) {
      perDevice[id] = {
        ok: result.ok,
        pendingApproval: result.pendingApproval,
        unauthorized: result.unauthorized,
        failureState: result.failureState,
        error: result.error,
        polledAt: result.polledAt,
        hasTelemetry: result.telemetry !== null,
      };
    }

    return {
      deviceId: this.deviceId,
      connected: this.connected,
      pollMode: this.pollMode,
      lastStatus: this._lastStatus,
      lastCloudError: this._lastCloudError,
      lastCloudFailure: this._lastCloudFailure,
      totalPolls: this.pollCount,
      cloudPolls: this._cloudPollCount,
      simulationPolls: this._simulationPollCount,
      pendingApprovalCount: this._pendingApprovalCount,
      model: this.profile.model,
      activeDeviceIds: [...this.activeDeviceIds],
      activeDeviceCount: this.activeDeviceIds.length,
      unauthorizedDeviceIds: [...this.unauthorizedDeviceIds],
      perDevice,
    };
  }

  // ── Public: getPerDeviceTelemetry (Phase 3G-2) ────────────────────────

  /**
   * Return per-device telemetry contributions from the last poll cycle.
   *
   * Each entry includes the device ID, name/model (from telemetry), and
   * the key power values (socPct, wattsIn, wattsOut, solarWatts).
   *
   * Returns an empty array if no per-device results are available
   * (e.g. provider not connected, or using simulation mode with a
   * single device).
   *
   * Consumed by the Power Center device contribution panel.
   */
  getPerDeviceTelemetry(): {
    deviceId: string;
    name?: string;
    model?: string;
    socPct?: number;
    wattsIn?: number;
    wattsOut?: number;
    solarWatts?: number;
    ok: boolean;
    pendingApproval: boolean;
    unauthorized: boolean;
    failureState: EcoFlowCloudClientState | null;
    error: string | null;
    polledAt: number;
  }[] {
    const results: {
      deviceId: string;
      name?: string;
      model?: string;
      socPct?: number;
      wattsIn?: number;
      wattsOut?: number;
      solarWatts?: number;
      ok: boolean;
      pendingApproval: boolean;
      unauthorized: boolean;
      failureState: EcoFlowCloudClientState | null;
      error: string | null;
      polledAt: number;
    }[] = [];

    for (const [id, result] of this.perDeviceResults) {
      const bat = result.telemetry?.battery;
      const sol = result.telemetry?.solar;
      const dev = result.telemetry?.device;

      results.push({
        deviceId: id,
        name: dev?.model ?? dev?.vendor,
        model: dev?.model,
        socPct: bat?.socPct,
        wattsIn: bat?.wattsIn,
        wattsOut: bat?.wattsOut,
        solarWatts: sol?.watts,
        ok: result.ok,
        pendingApproval: result.pendingApproval,
        unauthorized: result.unauthorized,
        failureState: result.failureState,
        error: result.error,
        polledAt: result.polledAt,
      });
    }

    return results;
  }

  // ── Private: resolve active devices on connect ──────────────────────


  /**
   * Determine which device IDs to poll.
   *
   * 1. Check powerDeviceStore for user-selected EcoFlow devices
   * 2. If none selected, call listDevices() and use all returned (dev-friendly)
   * 3. If listDevices() returns empty (e.g. pending_approval), fall back to
   *    the single deviceId passed to connect()
   */
  private async resolveActiveDevices(fallbackDeviceId: string): Promise<void> {
    try {
      const catalogDevices = await this.listDevices();
      if (__DEV__) {
        logEcoFlowDebug("resolveActiveDevices: catalog listed", {
          listedDeviceCount: catalogDevices.length,
        });
      }

      // Step 1: check the selection store
      const selected = await powerDeviceStore.getSelected("EcoFlow");
      if (selected.length > 0) {
        this.activeDeviceIds = this.filterTelemetryCandidateIds(selected);
        const selectedCatalogDevice =
          catalogDevices.find((device) => device.deviceId === this.activeDeviceIds[0]) ??
          null;
        if (selectedCatalogDevice) {
          this.profile = resolveProfileFromText([
            selectedCatalogDevice.name,
            selectedCatalogDevice.model,
            selectedCatalogDevice.productType,
          ].filter(Boolean).join(" "));
        }
        if (__DEV__) {
          logEcoFlowDebug("resolveActiveDevices: selected devices filtered", {
            selectedDeviceCount: selected.length,
            telemetryDeviceCount: this.activeDeviceIds.length,
            profile: this.profile.model,
          });
        }
        if (this.activeDeviceIds.length > 0) return;
      }

      // Step 2: no usable selection → use eligible devices from cloud catalog
      if (__DEV__) {
        logEcoFlowDebug("resolveActiveDevices: resolving telemetry devices from catalog");
      }
      if (catalogDevices.length > 0) {
        this.activeDeviceIds = this.filterTelemetryCandidateIds(
          catalogDevices.map((d) => d.deviceId),
        );
        const selectedCatalogDevice =
          catalogDevices.find((device) => device.deviceId === this.activeDeviceIds[0]) ??
          catalogDevices.find((device) => device.deviceId === fallbackDeviceId) ??
          null;
        if (selectedCatalogDevice) {
          this.profile = resolveProfileFromText([
            selectedCatalogDevice.name,
            selectedCatalogDevice.model,
            selectedCatalogDevice.productType,
          ].filter(Boolean).join(" "));
        }
        if (__DEV__) {
          logEcoFlowDebug("resolveActiveDevices: catalog telemetry devices selected", {
            telemetryDeviceCount: this.activeDeviceIds.length,
            profile: this.profile.model,
          });
        }
        if (this.activeDeviceIds.length > 0) return;
      }
    } catch (err) {
      if (__DEV__) logEcoFlowDebug("resolveActiveDevices: falling back after error", ecoFlowErrorDetails(err));
    }

    // Step 3: only use the single connect() device if catalog metadata proves it is telemetry-capable.
    this.activeDeviceIds = this.filterTelemetryCandidateIds([fallbackDeviceId]);
    if (__DEV__) {
      if (this.activeDeviceIds.length > 0) {
        logEcoFlowDebug("resolveActiveDevices: using verified fallback device", { fallbackDeviceId });
      } else {
        logEcoFlowDebug("resolveActiveDevices: refused unverified fallback device", { fallbackDeviceId });
      }
    }
  }

  private filterTelemetryCandidateIds(deviceIds: string[]): string[] {
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const rawId of deviceIds) {
      const deviceId = String(rawId || '').trim();
      if (!deviceId || seen.has(deviceId) || this.unauthorizedDeviceIds.has(deviceId)) continue;
      const listed = this.listedDeviceCatalog.get(deviceId);
      const eligibility = listed
        ? describeEcoFlowBluEligibility({
            deviceId: listed.deviceId,
            deviceName: listed.name,
            model: listed.model,
            productType: listed.productType,
            online: listed.online,
          })
        : describeEcoFlowBluEligibility({ deviceId, productType: null });
      if (!isEcoFlowCloudTelemetryCandidate(eligibility)) {
        if (__DEV__) {
          logEcoFlowDebug("filtered EcoFlow device", {
            deviceId,
            productType: eligibility.productType,
            reason: "unsupported_product_type",
          });
        }
        continue;
      }
      if (!eligibility.telemetryCapable && __DEV__) {
        logEcoFlowDebug("attempting EcoFlow cloud telemetry for unknown catalog type", {
          deviceId,
          productType: eligibility.productType,
        });
      }
      seen.add(deviceId);
      candidates.push(deviceId);
    }
    if (__DEV__ && candidates.length > 0) {
      logEcoFlowDebug("selected telemetry primary", {
        primaryDeviceId: candidates[0],
        telemetryDeviceCount: candidates.length,
      });
    }
    return candidates;
  }

  private makeUnauthorizedPollResult(deviceId: string, polledAt: number): DevicePollResult {
    return {
      deviceId,
      ok: false,
      pendingApproval: false,
      unauthorized: true,
      failureState: "deviceUnauthorized",
      telemetry: null,
      error: ECOFLOW_UNAUTHORIZED_DEVICE_REASON,
      polledAt,
    };
  }

  private markUnauthorizedDevice(deviceId: string, error: string | null): void {
    if (!this.unauthorizedDeviceIds.has(deviceId)) {
      this.unauthorizedDeviceIds.add(deviceId);
      this.activeDeviceIds = this.filterTelemetryCandidateIds(this.activeDeviceIds);
    }

    if (!this.unauthorizedWarningDeviceIds.has(deviceId)) {
      this.unauthorizedWarningDeviceIds.add(deviceId);
      logEcoFlowUnauthorizedDeviceWarnOnce(deviceId, error);
    }
  }

  private markUnauthorizedResults(results: DevicePollResult[]): void {
    for (const result of results) {
      if (result.unauthorized) {
        this.markUnauthorizedDevice(result.deviceId, result.error);
      }
    }
  }

  private logFallbackPrimary(deviceId: string): void {
    if (this.fallbackInfoDeviceIds.has(deviceId)) return;
    this.fallbackInfoDeviceIds.add(deviceId);
    logEcoFlowDebug("selected telemetry primary after unauthorized device", { deviceId });
  }

  private async resolveFallbackDeviceIdsAfterUnauthorized(): Promise<string[]> {
    const catalogDevices = await this.listDevices();
    const candidates = this.filterTelemetryCandidateIds(catalogDevices.map((d) => d.deviceId));
    if (candidates.length > 0) {
      this.activeDeviceIds = candidates;
      this.logFallbackPrimary(candidates[0]);
    } else if (__DEV__) {
      logEcoFlowDebug("no eligible telemetry device available after unauthorized EcoFlow power station");
    }
    return candidates;
  }

  // ── Private: multi-device cloud polling ─────────────────────────────

  /**
   * Poll all active devices in parallel, then aggregate results.
   *
   * Error rules:
   * - If some devices fail but at least one succeeds → return aggregate (no throw)
   * - 501 pending_approval → mark stale, never throw
   * - Only throw if ALL devices failed with non-501 errors
   */
  private async pollCloudMulti(): Promise<Partial<PowerTelemetry>> {
    this._lastStatus = "polling";

    const supabase = await getSupabase();
    if (!supabase) {
      if (isPowerSimulationAllowed()) {
        if (__DEV__) logEcoFlowDebug("pollCloudMulti: Supabase unavailable; using demo simulation");
        this._lastStatus = "simulating";
        return this.pollSimulation();
      }
      if (__DEV__) logEcoFlowDebug("pollCloudMulti: Supabase unavailable; returning unavailable telemetry");
      this._lastStatus = "cloud_error";
      this._lastCloudError = "Supabase client unavailable.";
      this._lastCloudFailure = "cloudUnavailable";
      return this.buildUnavailableTelemetry("EcoFlow cloud provider unavailable.");
    }

    const initialDeviceIds = this.filterTelemetryCandidateIds(this.activeDeviceIds);
    this.activeDeviceIds = initialDeviceIds;

    if (initialDeviceIds.length === 0) {
      if (isPowerSimulationAllowed()) {
        if (__DEV__) logEcoFlowDebug("pollCloudMulti: no active devices; using demo simulation");
        this._lastStatus = "simulating";
        return this.pollSimulation();
      }
      if (__DEV__) logEcoFlowDebug("pollCloudMulti: no active devices; returning unavailable telemetry");
      this._lastStatus = "cloud_error";
      this._lastCloudError = "No active EcoFlow devices selected.";
      this._lastCloudFailure = "cloudUnavailable";
      return this.buildUnavailableTelemetry("No active EcoFlow device selected.");
    }

    // ── Poll all devices in parallel ────────────────────────────
    let results = await Promise.all(
      initialDeviceIds.map((devId) =>
        this.pollSingleDevice(supabase, devId),
      ),
    );

    this.markUnauthorizedResults(results);

    if (results.every((r) => !r.ok) && results.some((r) => r.unauthorized)) {
      const alreadyPolled = new Set(results.map((r) => r.deviceId));
      const fallbackDeviceIds = (await this.resolveFallbackDeviceIdsAfterUnauthorized())
        .filter((deviceId) => !alreadyPolled.has(deviceId));

      if (fallbackDeviceIds.length > 0) {
        const fallbackResults = await Promise.all(
          fallbackDeviceIds.map((devId) => this.pollSingleDevice(supabase, devId)),
        );
        this.markUnauthorizedResults(fallbackResults);
        results = [...results, ...fallbackResults];
      }
    }

    // Store per-device results for diagnostics
    for (const r of results) {
      this.perDeviceResults.set(r.deviceId, r);
    }

    // ── Classify results ────────────────────────────────────────
    const successes = results.filter((r) => r.ok && r.telemetry !== null);
    const pendingApprovals = results.filter((r) => r.pendingApproval);
    const unauthorizedResults = results.filter((r) => r.unauthorized);
    const hardErrors = results.filter(
      (r) => !r.ok && !r.pendingApproval && !r.unauthorized,
    );

    // ── All pending_approval (no successes, no hard errors) ─────
    if (successes.length === 0 && hardErrors.length === 0 && unauthorizedResults.length === 0) {
      // All devices returned pending_approval
      return this.handlePendingApproval();
    }

    // ── All failed with hard errors (no successes) ──────────────
    if (successes.length === 0) {
      // Collect error messages
      const failedResults = [...hardErrors, ...unauthorizedResults];
      const errorMsgs = failedResults
        .map((r) => `${r.deviceId}: ${r.error}`)
        .join("; ");
      this._lastStatus = "cloud_error";
      this._lastCloudError = errorMsgs;
      this._lastCloudFailure =
        failedResults.find((result) => result.failureState)?.failureState ??
        classifyEcoFlowCloudFailureState(errorMsgs);

      if (__DEV__) {
        logEcoFlowDebug("pollCloudMulti: all devices failed", {
          failedDeviceCount: failedResults.length,
          errorMessage: errorMsgs,
        });
      }

      throw new Error(
        `[EcoFlowCloudProvider] All devices failed: ${errorMsgs}`,
      );
    }

    // ── At least one success → aggregate ────────────────────────
    if (hardErrors.length > 0 && __DEV__) {
      logEcoFlowDebug("pollCloudMulti: partial success", {
        successCount: successes.length,
        hardErrorCount: hardErrors.length,
        pendingApprovalCount: pendingApprovals.length,
      });
    }

    return this.aggregateTelemetry(successes, pendingApprovals.length > 0);
  }

  /**
   * Poll a single device via the edge function.
   * Never throws — captures all outcomes into DevicePollResult.
   */
  private async pollSingleDevice(
    supabase: any,
    deviceId: string,
  ): Promise<DevicePollResult> {
    const now = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke(POLL_FUNCTION, {
        body: {
          action: 'telemetry',
          deviceId,
          include_raw: __DEV__,
        },
      });

      // ── Handle invoke-level errors ──────────────────────────
      if (error) {
        const parsed = this.tryParseEdgeResponse(data, error);

        if (parsed && parsed.code === "pending_approval") {
          this._pendingApprovalCount++;
          return {
            deviceId,
            ok: false,
            pendingApproval: true,
            unauthorized: false,
            failureState: "authRequired",
            telemetry: null,
            error: null,
            polledAt: now,
          };
        }

        if (isEcoFlowUnauthorizedDeviceError(parsed ?? data ?? error)) {
          return this.makeUnauthorizedPollResult(deviceId, now);
        }

        return {
          deviceId,
          ok: false,
          pendingApproval: false,
          unauthorized: false,
          failureState: classifyEcoFlowCloudFailureState(parsed ?? data ?? error),
          telemetry: null,
          error: parsed?.message ?? error?.message ?? "Edge function invoke failed",
          polledAt: now,
        };
      }

      // ── Handle structured response ──────────────────────────
      const response = data as EdgePollResponse | null;

      if (!response) {
        return {
          deviceId,
          ok: false,
          pendingApproval: false,
          unauthorized: false,
          failureState: "cloudUnavailable",
          telemetry: null,
          error: "Empty response from edge function",
          polledAt: now,
        };
      }

      // ── pending_approval in data ────────────────────────────
      const responseError = !response.ok
        ? normalizeEdgeError(response as EdgePollError)
        : null;

      if (responseError?.code === "pending_approval") {
        this._pendingApprovalCount++;
        return {
          deviceId,
          ok: false,
          pendingApproval: true,
          unauthorized: false,
          failureState: "authRequired",
          telemetry: null,
          error: null,
          polledAt: now,
        };
      }

      // ── Other errors ────────────────────────────────────────
      if (!response.ok) {
        const errResp = responseError;
        if (isEcoFlowUnauthorizedDeviceError(errResp)) {
          return this.makeUnauthorizedPollResult(deviceId, now);
        }

        return {
          deviceId,
          ok: false,
          pendingApproval: false,
          unauthorized: false,
          failureState: classifyEcoFlowCloudFailureState(errResp),
          telemetry: null,
          error: errResp?.message || `Error code: ${errResp?.code ?? "unknown"}`,
          polledAt: now,
        };
      }

      // ── Success! Map edge telemetry ─────────────────────────
      const telemetry = this.mapEdgeTelemetry(response as EdgePollSuccess);
      return {
        deviceId,
        ok: true,
        pendingApproval: false,
        unauthorized: false,
        failureState: null,
        telemetry,
        error: null,
        polledAt: now,
      };
    } catch (err) {
      if (isEcoFlowUnauthorizedDeviceError(err)) {
        return this.makeUnauthorizedPollResult(deviceId, now);
      }

      return {
        deviceId,
        ok: false,
        pendingApproval: false,
        unauthorized: false,
        failureState: classifyEcoFlowCloudFailureState(err),
        telemetry: null,
        error: err instanceof Error ? err.message : "Unexpected poll error",
        polledAt: now,
      };
    }
  }

  // ── Private: aggregate multi-device telemetry ───────────────────────

  /**
   * Aggregate multiple successful device telemetry readings into one
   * canonical snapshot for ECS.
   *
   * Aggregation strategy:
   *   - device.id = "ecoflow:aggregate" (multi-device marker)
   *   - battery.socPct = simple average (weighted by capacity if known — TBD)
   *   - battery.wattsIn = sum
   *   - battery.wattsOut = sum
   *   - battery.tempC = average
   *   - battery.volts = average
   *   - solar.watts = sum
   *   - flags.charging = total wattsIn > total wattsOut
   *   - flags.stale = true only if ALL devices stale/pending; false if any fresh
   *   - flags.lowBattery = true if any device has lowBattery
   */
  private aggregateTelemetry(
    successes: DevicePollResult[],
    anyPending: boolean,
  ): Partial<PowerTelemetry> {
    this._cloudPollCount++;
    this._lastStatus = "cloud_ok";
    this._lastCloudError = null;
    this._lastCloudFailure = null;

    const now = Date.now();

    // If only one device, return its telemetry directly (skip aggregate overhead)
    if (successes.length === 1 && !anyPending) {
      const single = successes[0].telemetry!;
      return single;
    }

    // ── Collect numeric values ──────────────────────────────────
    let socSum = 0;
    let socCount = 0;
    let voltsSum = 0;
    let voltsCount = 0;
    let wattsInSum = 0;
    let wattsInCount = 0;
    let wattsOutSum = 0;
    let wattsOutCount = 0;
    let tempSum = 0;
    let tempCount = 0;
    let solarSum = 0;
    let solarCount = 0;
    let anyLowBattery = false;
    let anyStale = anyPending;
    let allStale = anyPending;
    let estRuntimeMinSum = 0;
    let estRuntimeCount = 0;

    for (const result of successes) {
      const t = result.telemetry;
      if (!t) continue;

      const bat = t.battery;
      if (bat) {
        if (bat.socPct !== undefined) {
          socSum += bat.socPct;
          socCount++;
        }
        if (bat.volts !== undefined) {
          voltsSum += bat.volts;
          voltsCount++;
        }
        if (bat.wattsIn !== undefined) {
          wattsInSum += bat.wattsIn;
          wattsInCount++;
        }
        if (bat.wattsOut !== undefined) {
          wattsOutSum += bat.wattsOut;
          wattsOutCount++;
        }
        if (bat.tempC !== undefined) {
          tempSum += bat.tempC;
          tempCount++;
        }
        if (bat.estRuntimeMin !== undefined) {
          estRuntimeMinSum += bat.estRuntimeMin;
          estRuntimeCount++;
        }
      }

      const sol = t.solar;
      if (sol && sol.watts !== undefined) {
        solarSum += sol.watts;
        solarCount++;
      }

      const flags = t.flags;
      if (flags) {
        if (flags.lowBattery) anyLowBattery = true;
        if (flags.stale) {
          anyStale = true;
        } else {
          allStale = false;
        }
      } else {
        allStale = false;
      }
    }

    // If we have at least one non-stale success, allStale = false
    if (successes.length > 0 && !anyPending) {
      // Check if any success has stale=false
      const anyFresh = successes.some(
        (r) => r.telemetry?.flags?.stale === false,
      );
      if (anyFresh) allStale = false;
    }

    const totalIn = wattsInSum + solarSum;
    const isCharging = totalIn > wattsOutSum;

    return {
      timestamp: now,
      source: "cloud",

      device: {
        id:
          successes.length === 1
            ? successes[0].telemetry?.device?.id ?? "unknown"
            : "ecoflow:aggregate",
        vendor: "EcoFlow",
        model:
          successes.length === 1
            ? successes[0].telemetry?.device?.model ?? this.profile.model
            : `${successes.length} devices`,
      },

      battery: {
        socPct: socCount > 0 ? round(socSum / socCount, 1) : undefined,
        volts: voltsCount > 0 ? round(voltsSum / voltsCount, 2) : undefined,
        wattsIn: wattsInCount > 0 ? Math.round(wattsInSum) : undefined,
        wattsOut: wattsOutCount > 0 ? Math.round(wattsOutSum) : undefined,
        tempC: tempCount > 0 ? round(tempSum / tempCount, 1) : undefined,
        estRuntimeMin:
          estRuntimeCount > 0
            ? Math.round(estRuntimeMinSum / estRuntimeCount)
            : undefined,
      },

      solar: {
        watts: solarCount > 0 ? round(solarSum, 1) : undefined,
      },

      flags: {
        charging: isCharging,
        lowBattery: anyLowBattery || undefined,
        stale: allStale,
      },
    };
  }

  // ── Private: pending approval handler ───────────────────────────────

  /**
   * Handle 501 pending_approval from the edge function.
   *
   * Returns a partial telemetry with flags.stale=true so CloudConnector
   * treats it as a successful (but stale) poll — no backoff thrash.
   */
  private handlePendingApproval(): Partial<PowerTelemetry> {
    this._pendingApprovalCount++;
    this._lastStatus = "pending_approval";
    this._lastCloudError = null; // Not an error — it's a known pending state
    this._lastCloudFailure = "authRequired";

    if (__DEV__ && this._pendingApprovalCount <= 3) {
      logEcoFlowDebug("pending approval received; returning stale telemetry", {
        pendingApprovalCount: this._pendingApprovalCount,
      });
    }

    const now = Date.now();

    return {
      timestamp: now,
      source: "cloud",

      device: {
        id:
          this.activeDeviceIds.length === 1
            ? this.activeDeviceIds[0]
            : "ecoflow:aggregate",
        vendor: "EcoFlow",
        model: this.profile.model,
      },

      battery: {
        socPct: undefined,
      },

      solar: {
        watts: undefined,
      },

      flags: {
        charging: undefined,
        inverterOn: undefined,
        lowBattery: undefined,
        stale: true,
      },
    };
  }

  /**
   * Map a successful edge function response to a Partial<PowerTelemetry>.
   */
  private mapEdgeTelemetry(
    response: EdgePollSuccess,
  ): Partial<PowerTelemetry> {
    const now = Date.now();
    const raw = (response.telemetry && typeof response.telemetry === "object"
      ? (response.telemetry as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const flattened = new Map<string, unknown>();
    addFlattenedTelemetryValues(flattened, raw);

    const readRawValue = (key: string): unknown => {
      if (key in raw) {
        const directValue = raw[key];
        if (!directValue || typeof directValue !== "object" || Array.isArray(directValue)) {
          return directValue;
        }
      }

      const normalizedKey = normalizeEcoFlowTelemetryKey(key);
      if (flattened.has(normalizedKey)) return flattened.get(normalizedKey);

      if (key.includes(".")) {
        for (const [candidateKey, candidateValue] of flattened) {
          if (candidateKey.endsWith(normalizedKey)) return candidateValue;
        }
      }

      return undefined;
    };

    const readNumber = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = readRawValue(key);
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim()) {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return undefined;
    };

    const glacierSoc =
      readNumber(
        "bms_bmsStatus.soc",
        "bms_bmsStatus.f32ShowSoc",
        "bmsMaster.bmsSoc",
        "bmsMaster.soc",
        "bmsMaster.f32ShowSoc",
        "bms_emsStatus.f32LcdShowSoc",
        "ems.f32LcdShowSoc",
        "ems.soc",
        "bmsBattSoc",
        "bms.battSoc",
        "pd.bmsBattSoc",
        "pd.bmsSoc",
        "pd.soc",
        "pd.socO",
        "pd.socNow",
        "pd.socLevel",
        "pd.batPct",
        "pd.batteryPct",
        "pd.batteryPercent",
        "pd.remainCap",
        "pd.remainBattery",
        "bms.runState.soc",
        "cms_bmsRunState.soc",
        "battery.socPct",
        "battery.soc",
        "battery.batteryPercent",
        "battery.percent",
        "batteryPct",
        "batteryPercentage",
        "batteryPercent",
        "remainBattery",
        "socLevel",
        "socPct",
        "soc",
      );

    const batteryVoltsRaw =
      readNumber(
        "bms_bmsStatus.vol",
        "bms_emsStatus.chgVol",
        "bmsMaster.vol",
        "pd.motorVol",
        "pd.vol",
        "bmsBattVol",
        "bms.battVol",
        "pd.bmsBattVol",
        "battery.volts",
        "battery.voltage",
        "volts",
      );

    const outputWattsRaw =
      readNumber(
        "bms_bmsStatus.outWatts",
        "bms_bmsStatus.outputWatts",
        "bms_bmsStatus.dsgPower",
        "bmsMaster.outWatts",
        "bmsMaster.dsgPower",
        "ems.outWatts",
        "ems.outputWatts",
        "ems.dsgPower",
        "ems.totalOutputWatts",
        "inv.outputWatts",
        "inv.acOutPower",
        "inv.dcOutPower",
        "pd.motorWat",
        "pd.wattsOutSum",
        "pd.outputWatts",
        "pd.outputPower",
        "pd.outputPowerSum",
        "pd.loadPower",
        "pd.totalLoadPower",
        "pd.dsgPower",
        "pd.acOutPower",
        "pd.acLvOutPower",
        "pd.invOutWatts",
        "pd.dcOutWatts",
        "pd.dcOutPower",
        "pd.usbOutPower",
        "pd.typecOutPower",
        "pd.totalOutPower",
        "pd.totalOutputPower",
        "pd.totalOutWatts",
        "pd.powOutSumW",
        "powOutSumW",
        "pd.powGetAc",
        "powGetAc",
        "pd.powGetAcOut",
        "powGetAcOut",
        "pd.powGetAcHvOut",
        "powGetAcHvOut",
        "pd.powGetAcLvOut",
        "powGetAcLvOut",
        "battery.wattsOut",
        "battery.outputWatts",
        "battery.outputPower",
        "outputWatts",
        "output_watts",
        "outputPower",
        "outputPowerSum",
        "loadPower",
        "totalLoadPower",
        "totalOutPower",
        "totalOutWatts",
        "totalOutputPower",
        "invOutWatts",
        "dcOutWatts",
        "wattsOut",
      );

    const directInputWattsRaw =
      readNumber(
        "bms_bmsStatus.inWatts",
        "bms_bmsStatus.inputWatts",
        "bms_bmsStatus.chgPower",
        "bmsMaster.inWatts",
        "bmsMaster.chgPower",
        "ems.inWatts",
        "ems.inputWatts",
        "ems.chgPower",
        "ems.totalInputWatts",
        "ems.totalChargePower",
        "inv.inputWatts",
        "inv.acInPower",
        "pd.wattsInSum",
        "pd.inputWatts",
        "pd.inputPower",
        "pd.inputPowerSum",
        "pd.chgPower",
        "pd.chargePower",
        "pd.chgPowerTotal",
        "pd.totalChgPower",
        "pd.totalInputPower",
        "pd.totalInPower",
        "pd.gridInputWatts",
        "pd.gridWatts",
        "pd.acInWatts",
        "pd.acInPower",
        "pd.powInSumW",
        "powInSumW",
        "pd.powGetAcIn",
        "powGetAcIn",
        "pd.powGet5p8",
        "powGet5p8",
        "battery.wattsIn",
        "battery.inputWatts",
        "battery.inputPower",
        "inputWatts",
        "input_watts",
        "inputPower",
        "inputPowerSum",
        "totalInputPower",
        "totalInPower",
        "totalChgPower",
        "chargePower",
        "chgPower",
        "chgPowerTotal",
        "acInWatts",
        "gridWatts",
        "wattsIn",
      );

    const tempCRaw =
      readNumber(
        "bms_bmsStatus.tmp",
        "bms_bmsStatus.maxCellTmp",
        "bms_bmsStatus.minCellTmp",
        "bmsMaster.tmp",
        "bmsMaxCellTemp",
        "bmsMinCellTemp",
        "bms.maxCellTemp",
        "bms.minCellTemp",
        "pd.bmsMaxCellTemp",
        "pd.bmsMinCellTemp",
        "battery.tempC",
        "temperatureC",
        "tempC",
      );

    const chgState = readNumber("bms_emsStatus.chgState");
    const chgCmd = readNumber("bms_emsStatus.chgCmd");
    const chgAmpRaw = readNumber("bms_emsStatus.chgAmp", "bms_bmsStatus.tagChgAmp");
    const solarWattsRaw = readNumber(
      "mppt.inWatts",
      "mppt.inputWatts",
      "mppt.inputPower",
      "mppt.watts",
      "mppt.pvPower",
      "mppt.solarWatts",
      "mppt.solarPower",
      "mpptPv.pvPower",
      "mpptPv.inputWatts",
      "mpptWatts",
      "pv.power",
      "pv.watts",
      "pv.inputWatts",
      "pd.pvPower",
      "pd.pvInPower",
      "pd.pvTotalPower",
      "pd.pvWatts",
      "pd.pvInputWatts",
      "pd.pvHInputWatts",
      "pd.pvLInputWatts",
      "pd.solarWatts",
      "pd.solarInputWatts",
      "pd.solarInputPower",
      "battery.solarWatts",
      "battery.solarInputWatts",
      "solar.watts",
      "solar.inputWatts",
      "solar.inputPower",
      "solarWatts",
      "solarInputWatts",
      "solarInputPower",
      "solar_input_watts",
      "solar_power",
      "pvPower",
      "pvInPower",
      "pvTotalPower",
      "pvWatts",
    );

    const acPortOutputWatts = [
      readNumber("pd.powGetAc", "powGetAc"),
      readNumber("pd.powGetAcOut", "powGetAcOut"),
      readNumber("pd.powGetAcHvOut", "powGetAcHvOut"),
      readNumber("pd.powGetAcLvOut", "powGetAcLvOut"),
      readNumber("pd.powGetAcLvTt30Out", "powGetAcLvTt30Out"),
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const dcPortOutputWatts = [
      readNumber("pd.powGet12v", "powGet12v"),
      readNumber("pd.powGet24v", "powGet24v"),
      readNumber("pd.powGetTypec1", "powGetTypec1"),
      readNumber("pd.powGetTypec2", "powGetTypec2"),
      readNumber("pd.powGetQcusb1", "powGetQcusb1"),
      readNumber("pd.powGetQcusb2", "powGetQcusb2"),
      readNumber("pd.powGet4p81", "powGet4p81"),
      readNumber("pd.powGet4p82", "powGet4p82"),
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const volts =
      batteryVoltsRaw !== undefined
        ? (batteryVoltsRaw > 1000 ? batteryVoltsRaw / 1000 : batteryVoltsRaw)
        : undefined;

    let wattsIn =
      directInputWattsRaw !== undefined ? directInputWattsRaw : undefined;

    if ((wattsIn === undefined || wattsIn <= 0) && batteryVoltsRaw && chgAmpRaw) {
      const derivedWattsIn = (batteryVoltsRaw / 1000) * (chgAmpRaw / 1000);
      if (Number.isFinite(derivedWattsIn) && derivedWattsIn > 0) {
        wattsIn = Math.round(derivedWattsIn);
      }
    }

    const summedPortOutputWatts = [...acPortOutputWatts, ...dcPortOutputWatts]
      .reduce((sum, value) => sum + Math.max(0, value), 0);

    const wattsOut =
      outputWattsRaw !== undefined
        ? outputWattsRaw
        : summedPortOutputWatts > 0
          ? summedPortOutputWatts
          : undefined;

    const solarWatts =
      solarWattsRaw !== undefined
        ? solarWattsRaw
        : (() => {
          const pvValues = [
            readNumber("pd.pv1InputWatts", "pv1InputWatts"),
            readNumber("pd.pv2InputWatts", "pv2InputWatts"),
            readNumber("pd.pv1Power", "pv1Power"),
            readNumber("pd.pv2Power", "pv2Power"),
            readNumber("pd.pvHInputWatts", "pvHInputWatts"),
            readNumber("pd.pvLInputWatts", "pvLInputWatts"),
            readNumber("pd.powGetPvH", "powGetPvH"),
            readNumber("pd.powGetPvL", "powGetPvL"),
          ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
          if (pvValues.length === 0) return undefined;
          return pvValues.reduce((sum, value) => sum + Math.max(0, value), 0);
        })();

    const tempC =
      tempCRaw !== undefined
        ? (tempCRaw > 200 ? tempCRaw / 10 : tempCRaw)
        : undefined;

    const isCharging =
      (typeof chgState === "number" && chgState > 0) ||
      chgCmd === 1 ||
      (typeof wattsIn === "number" && wattsIn > 0) ||
      (typeof solarWatts === "number" && solarWatts > 0);

    let estRuntimeMin: number | undefined;
    if (!isCharging && typeof wattsOut === "number" && wattsOut > 0 && typeof glacierSoc === "number") {
      const remainingWh = (glacierSoc / 100) * this.profile.capacityWh;
      const netDraw = wattsOut - (wattsIn ?? 0);
      if (netDraw > 0) {
        estRuntimeMin = Math.round((remainingWh / netDraw) * 60);
      }
    }

    const responseDeviceId = String(response.deviceId ?? this.deviceId ?? "unknown");
    const model =
      (typeof raw["device.model"] === "string" && String(raw["device.model"]).trim()) ||
      (typeof raw["model"] === "string" && String(raw["model"]).trim()) ||
      (typeof raw["productName"] === "string" && String(raw["productName"]).trim()) ||
      (typeof raw["deviceName"] === "string" && String(raw["deviceName"]).trim()) ||
      (responseDeviceId.startsWith("BX") ? "GLACIER" : this.profile.model);

    if (__DEV__ && isEcoFlowTelemetryDebugEnabled()) {
      logEcoFlowDebug("mapped telemetry snapshot", {
        deviceId: responseDeviceId,
        model,
        socPct: glacierSoc,
        volts,
        wattsIn,
        wattsOut,
        solarWatts,
        tempC,
        isCharging,
        chgState,
        chgCmd,
        chgAmpRaw,
      });
    }

    return {
      timestamp: now,
      source: "cloud",

      device: {
        id: responseDeviceId,
        vendor: "EcoFlow",
        model,
      },

      battery: {
        socPct: glacierSoc,
        volts: volts !== undefined ? round(volts, 3) : undefined,
        wattsIn: wattsIn !== undefined ? Math.round(wattsIn) : undefined,
        wattsOut: wattsOut !== undefined ? Math.round(wattsOut) : undefined,
        tempC: tempC !== undefined ? round(tempC, 1) : undefined,
        estRuntimeMin,
      },

      solar: {
        watts: solarWatts !== undefined ? round(solarWatts, 1) : undefined,
      },

      flags: {
        charging: isCharging,
        lowBattery: glacierSoc !== undefined ? glacierSoc < 15 : undefined,
        stale: false,
      },
    };
  }

  /**
   * Try to parse an edge function error response.
   * Supabase functions.invoke may return the error body in `data` or
   * in the error object itself depending on the HTTP status.
   */
  private tryParseEdgeResponse(
    data: unknown,
    error: any,
  ): EdgePollError | null {
    // Check data first (Supabase sometimes puts the response body here)
    if (data && typeof data === "object" && "code" in (data as any)) {
      return normalizeEdgeError(data as EdgePollError);
    }
    if (data && typeof data === "object" && "error" in (data as any)) {
      return normalizeEdgeError(data as EdgePollError);
    }

    // Try parsing error.message as JSON
    if (error?.message) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed && typeof parsed === "object" && ("code" in parsed || "error" in parsed)) {
          return normalizeEdgeError(parsed as EdgePollError);
        }
      } catch {
        // Not JSON — ignore
      }
    }

    // Try error.context or error.details
    if (
      error?.context &&
      typeof error.context === "object" &&
      ("code" in error.context || "error" in error.context)
    ) {
      return normalizeEdgeError(error.context as EdgePollError);
    }

    return null;
  }

  // ── Private: simulation polling ─────────────────────────────────────

  /**
   * Generate simulated telemetry (original Phase 3B stub behavior).
   * Used when pollMode is "simulate" or as fallback.
   */
  private pollSimulation(): Partial<PowerTelemetry> {
    this._simulationPollCount++;
    if (this.pollMode === "simulate") {
      this._lastStatus = "simulating";
    }

    this.advanceSimulation();

    const now = Date.now();
    const netWatts = this.wattsIn + this.solarWatts - this.wattsOut;
    const isCharging = netWatts > 0;

    // Estimate runtime (only meaningful when discharging)
    let estRuntimeMin: number | undefined;
    if (!isCharging && this.wattsOut > 0) {
      const remainingWh = (this.socPct / 100) * this.profile.capacityWh;
      const netDraw = this.wattsOut - this.wattsIn - this.solarWatts;
      if (netDraw > 0) {
        estRuntimeMin = Math.round((remainingWh / netDraw) * 60);
      }
    }

    // Compute battery current from net power and voltage
    const batteryAmps =
      this.batteryVolts > 0 ? netWatts / this.batteryVolts : 0;

    // Solar panel voltage and current (typical EcoFlow MPPT range)
    const solarVolts = this.solarWatts > 1 ? randRange(30, 48) : 0;
    const solarAmps = solarVolts > 0 ? this.solarWatts / solarVolts : 0;

    const simulatedTelemetry: Partial<PowerTelemetry> = {
      timestamp: now,
      source: "sim",
      sourceLabel: "Demo data",
      isLive: false,

      device: {
        id: this.deviceId ?? "unknown",
        vendor: "EcoFlow",
        model: this.profile.model,
        firmware: this.profile.firmware,
      },

      battery: {
        socPct: round(this.socPct, 1),
        volts: round(this.batteryVolts, 2),
        amps: round(batteryAmps, 2),
        wattsIn: Math.round(this.wattsIn),
        wattsOut: Math.round(this.wattsOut),
        tempC: round(this.batteryTempC, 1),
        healthPct: 94,
        estRuntimeMin,
      },

      solar: {
        watts: round(this.solarWatts, 1),
        volts: round(solarVolts, 1),
        amps: round(solarAmps, 2),
      },

      flags: {
        charging: isCharging,
        inverterOn: this.inverterOn,
        lowBattery: this.socPct < 15,
        stale: false,
      },
    };
    const truth = normalizePowerTelemetryTruth(simulatedTelemetry);
    return {
      ...simulatedTelemetry,
      truth,
      sourceLabel: getPowerTruthLabel(truth),
      isLive: false,
    };
  }

  private buildUnavailableTelemetry(reason: string): Partial<PowerTelemetry> {
    const telemetry: Partial<PowerTelemetry> = {
      timestamp: Date.now(),
      source: "unavailable",
      sourceLabel: "Not connected",
      isLive: false,
      device: {
        id: this.deviceId ?? "ecoflow-unavailable",
        vendor: "EcoFlow",
        model: this.profile.model,
      },
      flags: {
        stale: false,
      },
    };
    const truth = normalizePowerTelemetryTruth({
      ...telemetry,
      truth: {
        sourceTruth: "unavailable",
        providerId: "ecoflow",
        deviceId: this.deviceId ?? undefined,
        deviceName: this.profile.model,
        lastUpdatedAt: telemetry.timestamp,
        freshnessMs: 0,
        confidence: 0,
        isLive: false,
        isStale: false,
        isManual: false,
        isSimulated: false,
        reason,
      },
    });
    return {
      ...telemetry,
      truth,
      sourceLabel: getPowerTruthLabel(truth),
    };
  }

  // ── Private: advance simulation ─────────────────────────────────────

  /**
   * Advance the simulated device state between polls.
   *
   * Since CloudConnector polls every 5 seconds (vs. MockPowerConnector's
   * 1-second tick), we apply 5× the per-second drift to keep the
   * simulation moving at a comparable pace.
   */
  private advanceSimulation(): void {
    const TICKS = 5; // Simulate 5 seconds of drift per poll

    // ── Solar ──────────────────────────────────────────────────────
    const solarMult = solarMultiplier();
    const peakSolar = this.profile.maxSolarInputW * 0.7; // realistic ~70% of max
    this.solarWatts = clamp(
      solarMult * peakSolar + randRange(-20, 20),
      0,
      this.profile.maxSolarInputW,
    );

    // ── Load (wattsOut) — random walk ──────────────────────────────
    for (let i = 0; i < TICKS; i++) {
      this.wattsOut = clamp(
        this.wattsOut + randRange(-10, 10),
        20, // minimum baseline draw
        this.profile.maxOutputW * 0.4, // typical load ≤40% of max
      );
    }

    // ── Shore / AC charging input ──────────────────────────────────
    // Stochastic toggle: ~1% chance per poll to flip shore power
    if (Math.random() < 0.01) {
      this.wattsIn =
        this.wattsIn > 10
          ? 0
          : randRange(150, Math.min(500, this.profile.maxOutputW * 0.3));
    }
    if (this.wattsIn > 0) {
      this.wattsIn = clamp(this.wattsIn + randRange(-8, 8), 0, 600);
    }

    // ── Inverter toggle (rare) ─────────────────────────────────────
    if (Math.random() < 0.002) {
      this.inverterOn = !this.inverterOn;
    }
    // If inverter is off, wattsOut drops to near-zero (standby draw)
    if (!this.inverterOn) {
      this.wattsOut = clamp(this.wattsOut * 0.05, 2, 10);
    }

    // ── SOC drift ──────────────────────────────────────────────────
    const netWatts = this.wattsIn + this.solarWatts - this.wattsOut;
    // SOC change over TICKS seconds:
    // netWatts (W) * (TICKS/3600 h) / capacityWh * 100 = %
    const socDelta =
      ((netWatts * TICKS) / 3600 / this.profile.capacityWh) * 100;
    this.socPct = clamp(this.socPct + socDelta, 5, 100);

    // ── Battery voltage tracks SOC ─────────────────────────────────
    const vMin = this.profile.nominalVoltage;
    const vMax = this.profile.nominalVoltage * 1.2; // ~20% above nominal at full
    const targetVolts = vMin + (this.socPct / 100) * (vMax - vMin);
    this.batteryVolts += (targetVolts - this.batteryVolts) * 0.15;
    this.batteryVolts += randRange(-0.03, 0.03);

    // ── Temperature — slow drift with load correlation ─────────────
    const loadHeat = this.wattsOut / 800;
    const ambientTarget = 24 + loadHeat;
    this.batteryTempC += (ambientTarget - this.batteryTempC) * 0.03;
    this.batteryTempC += randRange(-0.15, 0.15);
    this.batteryTempC = clamp(this.batteryTempC, -10, 55);
  }
}
