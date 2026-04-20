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
import type { PowerDevice as CatalogPowerDevice } from "../../types/PowerDevice";
import { powerDeviceStore } from "../../devices/PowerDeviceStore";

// ── Supabase import (lazy to avoid hard crash if unavailable) ────────────
let _supabase: any = null;

async function getSupabase(): Promise<any> {
  if (_supabase) return _supabase;
  try {
    const mod = await import("../../../../lib/supabase");
    _supabase = mod.supabase;
    if (__DEV__) {
      console.log("[EcoFlowCloudProvider] Supabase client loaded from ../../../../lib/supabase");
    }
    return _supabase;
  } catch (err) {
    if (__DEV__) {
      console.warn(
        "[EcoFlowCloudProvider] Failed to import Supabase client from ../../../../lib/supabase:",
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
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

// ── Per-device poll result (internal diagnostics) ───────────────────────

interface DevicePollResult {
  deviceId: string;
  ok: boolean;
  pendingApproval: boolean;
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

// ── Edge function response types ────────────────────────────────────────

interface EdgePollSuccess {
  ok: true;
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
  details?: { status?: number; bodySnippet?: string; ecoflowCode?: string };
}

type EdgePollResponse = EdgePollSuccess | EdgePollError;

// ── Edge function device-list response types ────────────────────────────

interface EdgeDeviceListSuccess {
  ok: true;
  devices: {
    deviceId: string;
    deviceName: string;
    model: string;
    productType: string;
  }[];
  deviceCount: number;
  fetchedAt: string;
}

interface EdgeDeviceListError {
  ok: false;
  code: string;
  message: string;
}

type EdgeDeviceListResponse = EdgeDeviceListSuccess | EdgeDeviceListError;

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
  /** Per-device last poll results for diagnostics. */
  private perDeviceResults: Map<string, DevicePollResult> = new Map();

  // ── Diagnostic state ────────────────────────────────────────────────
  private _lastStatus: EcoFlowCloudStatus = "idle";
  private _lastCloudError: string | null = null;
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
    this.perDeviceResults.clear();

    // Determine polling mode
    if (token.toUpperCase() === SIMULATE_TOKEN) {
      this.pollMode = "simulate";
      this._lastStatus = "simulating";
      this.activeDeviceIds = [deviceId];
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
      console.log(
        `[EcoFlowCloudProvider] Connected — mode: ${this.pollMode}, activeDevices: [${this.activeDeviceIds.join(", ")}]`,
      );
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
    this.activeDeviceIds = [];
    this.perDeviceResults.clear();

    if (__DEV__) {
      console.log("[EcoFlowCloudProvider] Disconnected.");
    }
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
      if (__DEV__) {
        console.warn(
          "[EcoFlowCloudProvider] listDevices(): Supabase unavailable — returning [].",
        );
      }
      return [];
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
          if (__DEV__) {
            console.log(
              "[EcoFlowCloudProvider] listDevices(): pending_approval — returning [].",
            );
          }
          return [];
        }
        if (__DEV__) {
          console.warn(
            `[EcoFlowCloudProvider] listDevices() error: ${parsed?.message ?? error?.message ?? "unknown"}`,
          );
        }
        return [];
      }

      const response = data as EdgeDeviceListResponse | null;

      // Support both:
      // 1. new split function shape: { ok: true, devices: [{ deviceId, deviceName, model, productType }], deviceCount }
      // 2. legacy shared ecoflow shape: { ok: true, devices: [{ id, name, online }] }
      if (!response || !response.ok) {
        const errResp = response as EdgeDeviceListError | null;
        if (errResp?.code === "pending_approval") {
          return [];
        }
        if (__DEV__) {
          console.warn(
            `[EcoFlowCloudProvider] listDevices() failed: ${errResp?.message ?? "empty response"}`,
          );
        }
        return [];
      }

      const rawDevices = Array.isArray((response as any).devices) ? (response as any).devices : [];
      const normalizedDevices = rawDevices
        .map((d: any) => {
          const deviceId = String(d?.deviceId ?? d?.id ?? d?.sn ?? '').trim();
          const deviceName = String(d?.deviceName ?? d?.name ?? 'EcoFlow Device').trim();
          const inferred = inferEcoFlowMetadata(deviceName);
          const modelRaw = String(d?.model ?? '').trim();
          const productTypeRaw = String(d?.productType ?? '').trim();

          return {
            deviceId,
            deviceName,
            model: modelRaw && modelRaw.toLowerCase() !== 'unknown' ? modelRaw : inferred.model,
            productType:
              productTypeRaw && productTypeRaw.toLowerCase() !== 'unknown'
                ? productTypeRaw
                : inferred.productType,
            online: Boolean(d?.online ?? false),
          };
        })
        .filter((d: any) => d.deviceId.length > 0);

      if (__DEV__) {
        console.log(
          `[EcoFlowCloudProvider] listDevices(): received ${normalizedDevices.length} device(s) from ${DEVICE_LIST_FUNCTION}.`,
        );
        for (const device of normalizedDevices) {
          console.log(
            `[EcoFlowCloudProvider] device → id=${device.deviceId} | name=${device.deviceName} | model=${device.model} | productType=${device.productType}`,
          );
        }
      }

      const now = Date.now();
      return normalizedDevices.map(
        (d: any): CatalogPowerDevice => ({
          provider: "EcoFlow",
          deviceId: d.deviceId,
          name: d.deviceName,
          model: d.model,
          productType: d.productType,
          lastSeenAt: now,
        }),
      );
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[EcoFlowCloudProvider] listDevices() unexpected error:",
          err instanceof Error ? err.message : err,
        );
      }
      return [];
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
      totalPolls: this.pollCount,
      cloudPolls: this._cloudPollCount,
      simulationPolls: this._simulationPollCount,
      pendingApprovalCount: this._pendingApprovalCount,
      model: this.profile.model,
      activeDeviceIds: [...this.activeDeviceIds],
      activeDeviceCount: this.activeDeviceIds.length,
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
      // Step 1: check the selection store
      const selected = await powerDeviceStore.getSelected("EcoFlow");
      if (selected.length > 0) {
        this.activeDeviceIds = selected;
        if (__DEV__) {
          console.log(
            `[EcoFlowCloudProvider] Using ${selected.length} selected device(s) from store.`,
          );
        }
        return;
      }

      // Step 2: no selection → fetch all devices from cloud
      if (__DEV__) {
        console.log(
          "[EcoFlowCloudProvider] No devices selected — fetching device list from cloud.",
        );
      }
      const catalogDevices = await this.listDevices();
      if (__DEV__) {
        console.log(
          `[EcoFlowCloudProvider] resolveActiveDevices(): catalog returned ${catalogDevices.length} device(s).`,
        );
      }
      if (catalogDevices.length > 0) {
        this.activeDeviceIds = catalogDevices.map((d) => d.deviceId);
        if (__DEV__) {
          console.log(
            `[EcoFlowCloudProvider] Using all ${catalogDevices.length} device(s) from cloud catalog.`,
          );
        }
        return;
      }
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[EcoFlowCloudProvider] resolveActiveDevices() error — falling back to single device.",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Step 3: fallback to the single deviceId from connect()
    this.activeDeviceIds = [fallbackDeviceId];
    if (__DEV__) {
      console.log(
        `[EcoFlowCloudProvider] Falling back to single device: "${fallbackDeviceId}".`,
      );
    }
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
      // Supabase client unavailable — fall back to simulation
      if (__DEV__) {
        console.warn(
          "[EcoFlowCloudProvider] Supabase client unavailable — falling back to simulation.",
        );
      }
      this._lastStatus = "simulating";
      return this.pollSimulation();
    }

    // If no active devices, fall back to simulation
    if (this.activeDeviceIds.length === 0) {
      if (__DEV__) {
        console.warn(
          "[EcoFlowCloudProvider] No active devices — falling back to simulation.",
        );
      }
      this._lastStatus = "simulating";
      return this.pollSimulation();
    }

    // ── Poll all devices in parallel ────────────────────────────
    const results = await Promise.all(
      this.activeDeviceIds.map((devId) =>
        this.pollSingleDevice(supabase, devId),
      ),
    );

    // Store per-device results for diagnostics
    for (const r of results) {
      this.perDeviceResults.set(r.deviceId, r);
    }

    // ── Classify results ────────────────────────────────────────
    const successes = results.filter((r) => r.ok && r.telemetry !== null);
    const pendingApprovals = results.filter((r) => r.pendingApproval);
    const hardErrors = results.filter(
      (r) => !r.ok && !r.pendingApproval,
    );

    // ── All pending_approval (no successes, no hard errors) ─────
    if (successes.length === 0 && hardErrors.length === 0) {
      // All devices returned pending_approval
      return this.handlePendingApproval();
    }

    // ── All failed with hard errors (no successes) ──────────────
    if (successes.length === 0) {
      // Collect error messages
      const errorMsgs = hardErrors
        .map((r) => `${r.deviceId}: ${r.error}`)
        .join("; ");
      this._lastStatus = "cloud_error";
      this._lastCloudError = errorMsgs;

      if (__DEV__) {
        console.warn(
          `[EcoFlowCloudProvider] All ${hardErrors.length} device(s) failed: ${errorMsgs}`,
        );
      }

      throw new Error(
        `[EcoFlowCloudProvider] All devices failed: ${errorMsgs}`,
      );
    }

    // ── At least one success → aggregate ────────────────────────
    if (hardErrors.length > 0 && __DEV__) {
      console.warn(
        `[EcoFlowCloudProvider] Partial success: ${successes.length} ok, ${hardErrors.length} failed, ${pendingApprovals.length} pending.`,
      );
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
            telemetry: null,
            error: null,
            polledAt: now,
          };
        }

        return {
          deviceId,
          ok: false,
          pendingApproval: false,
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
          telemetry: null,
          error: "Empty response from edge function",
          polledAt: now,
        };
      }

      // ── pending_approval in data ────────────────────────────
      if (!response.ok && (response as EdgePollError).code === "pending_approval") {
        this._pendingApprovalCount++;
        return {
          deviceId,
          ok: false,
          pendingApproval: true,
          telemetry: null,
          error: null,
          polledAt: now,
        };
      }

      // ── Other errors ────────────────────────────────────────
      if (!response.ok) {
        const errResp = response as EdgePollError;
        return {
          deviceId,
          ok: false,
          pendingApproval: false,
          telemetry: null,
          error: errResp.message || `Error code: ${errResp.code}`,
          polledAt: now,
        };
      }

      // ── Success! Map edge telemetry ─────────────────────────
      const telemetry = this.mapEdgeTelemetry(response as EdgePollSuccess);
      return {
        deviceId,
        ok: true,
        pendingApproval: false,
        telemetry,
        error: null,
        polledAt: now,
      };
    } catch (err) {
      return {
        deviceId,
        ok: false,
        pendingApproval: false,
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
    let wattsOutSum = 0;
    let tempSum = 0;
    let tempCount = 0;
    let solarSum = 0;
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
        }
        if (bat.wattsOut !== undefined) {
          wattsOutSum += bat.wattsOut;
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
        wattsIn: wattsInSum > 0 ? Math.round(wattsInSum) : undefined,
        wattsOut: wattsOutSum > 0 ? Math.round(wattsOutSum) : undefined,
        tempC: tempCount > 0 ? round(tempSum / tempCount, 1) : undefined,
        estRuntimeMin:
          estRuntimeCount > 0
            ? Math.round(estRuntimeMinSum / estRuntimeCount)
            : undefined,
      },

      solar: {
        watts: solarSum > 0 ? round(solarSum, 1) : undefined,
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

    if (__DEV__ && this._pendingApprovalCount <= 3) {
      console.log(
        `[EcoFlowCloudProvider] Received pending_approval (count: ${this._pendingApprovalCount}) — returning stale telemetry.`,
      );
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

    const readNumber = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = raw[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim()) {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return undefined;
    };

    const glacierSoc =
      readNumber("bms_bmsStatus.soc", "bms_bmsStatus.f32ShowSoc", "pd.batPct");

    const batteryVoltsRaw =
      readNumber("bms_bmsStatus.vol", "bms_emsStatus.chgVol", "pd.motorVol");

    const outputWattsRaw =
      readNumber("bms_bmsStatus.outWatts", "pd.motorWat");

    const directInputWattsRaw =
      readNumber("bms_bmsStatus.inWatts");

    const tempCRaw =
      readNumber("bms_bmsStatus.tmp", "bms_bmsStatus.maxCellTmp", "bms_bmsStatus.minCellTmp");

    const chgState = readNumber("bms_emsStatus.chgState");
    const chgCmd = readNumber("bms_emsStatus.chgCmd");
    const chgAmpRaw = readNumber("bms_emsStatus.chgAmp", "bms_bmsStatus.tagChgAmp");

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

    const wattsOut =
      outputWattsRaw !== undefined ? outputWattsRaw : undefined;

    const solarWatts = 0;

    const tempC =
      tempCRaw !== undefined
        ? (tempCRaw > 200 ? tempCRaw / 10 : tempCRaw)
        : undefined;

    const isCharging =
      (typeof chgState === "number" && chgState > 0) ||
      chgCmd === 1 ||
      (typeof wattsIn === "number" && wattsIn > 0);

    let estRuntimeMin: number | undefined;
    if (!isCharging && typeof wattsOut === "number" && wattsOut > 0 && typeof glacierSoc === "number") {
      const remainingWh = (glacierSoc / 100) * this.profile.capacityWh;
      const netDraw = wattsOut - (wattsIn ?? 0);
      if (netDraw > 0) {
        estRuntimeMin = Math.round((remainingWh / netDraw) * 60);
      }
    }

    const model =
      (typeof raw["device.model"] === "string" && String(raw["device.model"]).trim()) ||
      (typeof raw["model"] === "string" && String(raw["model"]).trim()) ||
      (typeof raw["productName"] === "string" && String(raw["productName"]).trim()) ||
      (typeof raw["deviceName"] === "string" && String(raw["deviceName"]).trim()) ||
      (this.deviceId?.startsWith("BX") ? "GLACIER" : this.profile.model);

    if (__DEV__) {
      console.log("[EcoFlowCloudProvider] mapped telemetry snapshot", {
        deviceId: this.deviceId || "unknown",
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
        id: this.deviceId || "unknown",
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
        watts: solarWatts,
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
      return data as EdgePollError;
    }

    // Try parsing error.message as JSON
    if (error?.message) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed && typeof parsed === "object" && "code" in parsed) {
          return parsed as EdgePollError;
        }
      } catch {
        // Not JSON — ignore
      }
    }

    // Try error.context or error.details
    if (
      error?.context &&
      typeof error.context === "object" &&
      "code" in error.context
    ) {
      return error.context as EdgePollError;
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

    return {
      timestamp: now,
      source: "cloud",

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

