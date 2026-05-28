/**
 * PowerTelemetry — canonical contract for all ECS power-system data.
 *
 * Every power connector (BLE, cloud, Wi-Fi, gateway, SIM) normalises its
 * vendor-specific payload into this shape before it enters the app.
 *
 * Phase 1A — structure only, no runtime consumers yet.
 */

// ── Source transport that produced this reading ──────────────────────────
export type PowerSource =
  | "ble"
  | "cloud"
  | "wifi"
  | "gateway"
  | "sim"
  | "mock_dev"
  | "unavailable";

export const POWER_LIVE_MAX_AGE_MS = 30_000;
export const POWER_STALE_MAX_AGE_MS = 5 * 60_000;

export type PowerSourceTruth =
  | "live_provider"
  | "live_ble"
  | "device_detected"
  | "manual"
  | "cached"
  | "simulated"
  | "unavailable";

export type PowerTelemetryProviderId =
  | "ecoflow"
  | "bluetti"
  | "anker_solix"
  | "jackery"
  | "goal_zero"
  | "renogy"
  | "redarc"
  | "dakota_lithium"
  | "generic";

export interface PowerTelemetryTruth {
  sourceTruth: PowerSourceTruth;
  providerId?: PowerTelemetryProviderId;
  deviceId?: string;
  deviceName?: string;
  lastUpdatedAt?: number;
  freshnessMs?: number;
  confidence: number;
  isLive: boolean;
  isStale: boolean;
  isManual: boolean;
  isSimulated: boolean;
  reason?: string;
}

// ── Connection lifecycle state ──────────────────────────────────────────
export type PowerConnectionState =
  | "idle"
  | "connecting"
  | "disconnecting"
  | "connected"
  | "error";

// ── Device identity ─────────────────────────────────────────────────────
export interface PowerDevice {
  /** Unique device identifier (MAC, serial, UUID — vendor-dependent) */
  id: string;
  /** Vendor / manufacturer key, e.g. "renogy", "victron", "bluetti" */
  vendor: string;
  /** Human-readable model name */
  model?: string;
  /** Hardware serial number */
  serial?: string;
  /** Firmware version string */
  firmware?: string;
}

// ── Battery bank readings ───────────────────────────────────────────────
export interface PowerBattery {
  /** State-of-charge percentage (0–100) */
  socPct?: number;
  /** Terminal voltage */
  volts?: number;
  /** Instantaneous current (positive = charging) */
  amps?: number;
  /** Power flowing into the battery (W) */
  wattsIn?: number;
  /** Power flowing out of the battery (W) */
  wattsOut?: number;
  /** Battery temperature in °C */
  tempC?: number;
  /** Charge-cycle count */
  cycles?: number;
  /** Battery health / state-of-health percentage */
  healthPct?: number;
  /** Estimated remaining runtime in minutes at current draw */
  estRuntimeMin?: number;
}

// ── Solar input readings ────────────────────────────────────────────────
export interface PowerSolar {
  /** Instantaneous solar power (W) */
  watts?: number;
  /** Panel voltage */
  volts?: number;
  /** Panel current */
  amps?: number;
}

// ── Boolean flags for quick UI gating ───────────────────────────────────
export interface PowerFlags {
  /** Battery is currently accepting charge */
  charging?: boolean;
  /** AC inverter is energised */
  inverterOn?: boolean;
  /** Battery below vendor low-threshold */
  lowBattery?: boolean;
  /** Reading is older than the freshness window */
  stale?: boolean;
}

// ── Declared capabilities (set once per device, not per packet) ─────────
export interface PowerCapabilities {
  /** Device reports state-of-charge */
  hasSOC: boolean;
  /** Device reports watts-in */
  hasWattsIn: boolean;
  /** Device reports watts-out */
  hasWattsOut: boolean;
  /** Device reports solar input */
  hasSolar: boolean;
  /** Device can estimate remaining runtime */
  hasRuntimeEstimate: boolean;
  /** Device accepts remote commands (relay toggle, etc.) */
  controllable: boolean;
}

// ── Link-quality metadata ───────────────────────────────────────────────
export interface PowerQuality {
  /** Received signal strength indicator (dBm, BLE/Wi-Fi) */
  rssi?: number;
  /** Monotonic packet sequence number */
  seq?: number;
  /** Epoch-ms of the last raw packet received */
  lastPacketAt?: number;
  /** Current connection lifecycle state */
  connection?: PowerConnectionState;
}

// ── Top-level telemetry envelope ────────────────────────────────────────
export interface PowerTelemetry {
  /** Epoch-ms when this reading was created / received */
  timestamp: number;

  /** Transport that delivered the reading */
  source: PowerSource;
  /** Truthful user-facing source label for control surfaces/debugging. */
  sourceLabel?: string;
  /** True only when live hardware telemetry is actively flowing. */
  isLive?: boolean;

  /** Truth classification used by UI, brief, and safety-copy surfaces. */
  truth: PowerTelemetryTruth;

  /** Identity of the physical device */
  device: PowerDevice;

  /** Battery bank data (optional — not all devices are battery monitors) */
  battery?: PowerBattery;

  /** Solar input data (optional) */
  solar?: PowerSolar;

  /** Dedicated input voltage when the provider reports it. */
  inputVolts?: number;
  /** Dedicated input current when the provider reports it. */
  inputAmps?: number;
  /** Dedicated output voltage when the provider reports it. */
  outputVolts?: number;
  /** Dedicated output current when the provider reports it. */
  outputAmps?: number;

  /** Quick boolean flags for UI gating */
  flags?: PowerFlags;

  /** What this device is capable of reporting */
  capabilities: PowerCapabilities;

  /** Link-quality / connection metadata */
  quality?: PowerQuality;
}

function mapTransportToTruth(source: PowerSource | undefined): PowerSourceTruth {
  switch (source) {
    case "ble":
      return "live_ble";
    case "cloud":
    case "wifi":
    case "gateway":
      return "live_provider";
    case "sim":
    case "mock_dev":
      return "simulated";
    case "unavailable":
    default:
      return "unavailable";
  }
}

export function normalizePowerTelemetryProviderId(
  value: unknown,
): PowerTelemetryProviderId | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "ecoflow":
    case "bluetti":
    case "anker_solix":
    case "jackery":
    case "goal_zero":
    case "renogy":
    case "redarc":
    case "dakota_lithium":
    case "generic":
      return normalized;
    default:
      return "generic";
  }
}

function confidenceForTruth(
  sourceTruth: PowerSourceTruth,
  isLive: boolean,
  isStale: boolean,
): number {
  if (isLive) return 0.95;
  if (sourceTruth === "cached") return isStale ? 0.4 : 0.65;
  if (sourceTruth === "manual") return 0.55;
  if (sourceTruth === "device_detected") return 0.35;
  if (sourceTruth === "simulated") return 0.2;
  return 0;
}

export function normalizePowerTelemetryTruth(
  telemetry: Partial<PowerTelemetry>,
  now: number = Date.now(),
): PowerTelemetryTruth {
  const existing = telemetry.truth;
  const sourceTruthFromTransport = mapTransportToTruth(telemetry.source);
  const lastUpdatedAt =
    existing?.lastUpdatedAt ??
    telemetry.timestamp ??
    telemetry.quality?.lastPacketAt;
  const freshnessMs =
    typeof lastUpdatedAt === "number" ? Math.max(0, now - lastUpdatedAt) : undefined;

  let sourceTruth = existing?.sourceTruth ?? sourceTruthFromTransport;
  const isManual = existing?.isManual ?? sourceTruth === "manual";
  const isSimulated =
    existing?.isSimulated ??
    (sourceTruth === "simulated" ||
    telemetry.source === "mock_dev" ||
    telemetry.source === "sim");

  if (
    !isManual &&
    !isSimulated &&
    (sourceTruth === "live_provider" || sourceTruth === "live_ble") &&
    freshnessMs !== undefined &&
    freshnessMs > POWER_LIVE_MAX_AGE_MS
  ) {
    sourceTruth = "cached";
  }

  const isStale =
    existing?.isStale ??
    (sourceTruth === "cached" &&
      freshnessMs !== undefined &&
      freshnessMs > POWER_STALE_MAX_AGE_MS);
  const isLive =
    !isManual &&
    !isSimulated &&
    !isStale &&
    (sourceTruth === "live_provider" || sourceTruth === "live_ble") &&
    freshnessMs !== undefined &&
    freshnessMs <= POWER_LIVE_MAX_AGE_MS;

  return {
    sourceTruth,
    providerId:
      existing?.providerId ??
      normalizePowerTelemetryProviderId(telemetry.device?.vendor),
    deviceId: existing?.deviceId ?? telemetry.device?.id,
    deviceName: existing?.deviceName ?? telemetry.device?.model,
    lastUpdatedAt,
    freshnessMs,
    confidence:
      typeof existing?.confidence === "number"
        ? existing.confidence
        : confidenceForTruth(sourceTruth, isLive, isStale),
    isLive,
    isStale,
    isManual,
    isSimulated,
    reason: existing?.reason,
  };
}

export function isPowerSimulationAllowed(): boolean {
  const devRuntime = typeof __DEV__ !== "undefined" && __DEV__;
  const envFlag =
    typeof process !== "undefined" &&
    process.env?.EXPO_PUBLIC_ECS_POWER_DEMO_MODE === "1";
  let globalFlag = false;
  try {
    globalFlag = Boolean((globalThis as Record<string, unknown>).__ECS_POWER_DEMO_MODE);
  } catch {
    globalFlag = false;
  }
  return devRuntime || envFlag || globalFlag;
}

export function getPowerTruthLabel(truth: PowerTelemetryTruth | undefined): string {
  if (!truth) return "Not connected";
  if (truth.sourceTruth === "manual" || truth.isManual) return "Manual estimate";
  if (truth.sourceTruth === "simulated" || truth.isSimulated) {
    return isPowerSimulationAllowed() ? "Demo data" : "Not connected";
  }
  if (truth.isStale) return "Stale — reconnect";
  switch (truth.sourceTruth) {
    case "live_ble":
      return truth.isLive ? "Live BLE" : "Last known";
    case "live_provider":
      return truth.isLive ? "Live" : "Last known";
    case "device_detected":
      return "Detected";
    case "cached":
      return "Last known";
    case "unavailable":
      return "Not connected";
    default:
      return "Not connected";
  }
}

