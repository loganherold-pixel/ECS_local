/**
 * BLU — Battery Link Utility
 *
 * Universal power telemetry abstraction layer for ECS.
 *
 * BLU normalises telemetry from multiple power ecosystems into a single
 * provider-agnostic schema. Each vendor (EcoFlow, Anker SOLIX, Jackery,
 * Bluetti, Goal Zero, Renogy, Victron) implements a BLU provider that
 * maps vendor-specific data into this canonical shape.
 *
 * Phase 1A — type contracts.
 * Phase 1C — extended summary fields for Sustainability widget.
 * Phase 1D — system status, session persistence types.
 * Phase 7A — Architecture hardening: charging/output/warning state enums.
 */



// ── BLU Provider Identifiers ────────────────────────────────────────────

/**
 * Canonical provider identifiers for all supported power ecosystems.
 * Used as the partition key in the BLU device registry.
 */
export type BluProviderId =
  | 'ecoflow'
  | 'anker_solix'
  | 'jackery'
  | 'bluetti'
  | 'goal_zero'
  | 'renogy'
  | 'victron';

/**
 * Human-readable metadata for each provider.
 */
export interface BluProviderMeta {
  /** Canonical provider ID */
  id: BluProviderId;
  /** Display name shown in UI */
  displayName: string;
  /** Whether this provider has an active integration path */
  status: 'active' | 'planned' | 'unsupported';
  /** Icon name (Ionicons) for the provider card */
  icon: string;
  /** Accent color for the provider card */
  accentColor: string;
  /** Short description of integration status */
  statusNote: string;
}

// ── BLU Connection State ────────────────────────────────────────────────

/**
 * Connection lifecycle state for a BLU device.
 */
export type BluConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'unsupported';

// ── BLU Device Capabilities ─────────────────────────────────────────────

/**
 * Declared capabilities for a BLU device.
 * Set once per device, not per telemetry packet.
 */
export interface BluDeviceCapabilities {
  /** Device reports battery state-of-charge */
  hasBatteryPercent: boolean;
  /** Device reports input watts */
  hasInputWatts: boolean;
  /** Device reports output watts */
  hasOutputWatts: boolean;
  /** Device reports solar input */
  hasSolarInput: boolean;
  /** Device reports AC output */
  hasAcOutput: boolean;
  /** Device reports DC output */
  hasDcOutput: boolean;
  /** Device reports temperature */
  hasTemperature: boolean;
  /** Device can estimate remaining runtime */
  hasRuntimeEstimate: boolean;
  /** Device accepts remote commands */
  controllable: boolean;
}

// ── BLU Device Model ────────────────────────────────────────────────────

/**
 * A registered BLU power device.
 *
 * Provider-agnostic: every provider normalises its device list into
 * this shape before it enters the BLU registry.
 */
export interface BluDevice {
  /** Which provider owns this device */
  provider: BluProviderId;
  /** Provider-specific device identifier */
  device_id: string;
  /** Human-readable device name (may be user-assigned) */
  display_name: string;
  /** Model name, e.g. "DELTA 2 Max" */
  model: string;
  /** Current connection lifecycle state */
  connection_state: BluConnectionState;
  /** Epoch-ms when this device was last seen */
  last_seen: number;
  /** What this device is capable of reporting */
  capabilities: BluDeviceCapabilities;
  /** Whether this device is the primary (default) power source */
  is_primary: boolean;
}

// ── BLU Telemetry Model ─────────────────────────────────────────────────

/**
 * Normalised power telemetry reading from a BLU device.
 *
 * All fields are optional — providers populate only the fields
 * their hardware supports. The BLU layer never fabricates data.
 */
export interface BluTelemetry {
  /** Epoch-ms when this reading was created */
  timestamp: number;
  /** Provider that produced this reading */
  provider: BluProviderId;
  /** Device ID that produced this reading */
  device_id: string;

  // ── Core telemetry fields (always normalised) ──────────────────────

  /** Battery state-of-charge percentage (0–100) */
  battery_percent?: number;
  /** Total input power (W) — all sources combined */
  input_watts?: number;
  /** Total output power (W) — all loads combined */
  output_watts?: number;
  /** Net battery power (W) — positive = charging, negative = discharging */
  battery_watts?: number;
  /** Estimated remaining runtime in minutes at current draw */
  estimated_runtime_minutes?: number;

  // ── Source-specific fields ─────────────────────────────────────────

  /** Solar input power (W) */
  solar_input_watts?: number;
  /** AC output power (W) */
  ac_output_watts?: number;
  /** DC output power (W) */
  dc_output_watts?: number;

  // ── Environmental ─────────────────────────────────────────────────

  /** Device temperature in °C */
  temperature_celsius?: number;

  // ── Optional extended fields (provider-specific) ──────────────────

  /** Battery voltage */
  battery_volts?: number;
  /** Battery current (A) — positive = charging */
  battery_amps?: number;
  /** Charge cycle count */
  charge_cycles?: number;
  /** Battery health percentage */
  health_percent?: number;
  /** AC input power (W) — wall/shore power */
  ac_input_watts?: number;
  /** Inverter on/off state */
  inverter_on?: boolean;
  /** Total capacity in Wh */
  capacity_wh?: number;
}

// ── BLU Summary Object ──────────────────────────────────────────────────

/**
 * Normalised BLU summary for dashboard widget consumption.
 *
 * Provides a single, stable object that dashboard widgets can read
 * without knowing which provider or device is active.
 *
 * Phase 1C additions:
 *   - is_stale: true when telemetry is older than the grace window
 *   - temperature_celsius: device temperature
 *   - battery_watts: net battery power
 *   - ac_output_watts / dc_output_watts: split output
 */
export interface BluSummary {
  /** Whether any BLU device is connected and providing data */
  available: boolean;
  /** Active provider ID (null if no device connected) */
  active_provider: BluProviderId | null;
  /** Active device display name */
  active_device_name: string | null;
  /** Active device model */
  active_device_model: string | null;
  /** Battery state-of-charge percentage */
  battery_percent: number | null;
  /** Total input power (W) */
  live_input: number | null;
  /** Total output power (W) */
  live_output: number | null;
  /** Solar input power (W) */
  solar_input: number | null;
  /** Estimated remaining runtime in minutes */
  runtime_remaining: number | null;
  /** Connection state of the active device */
  connection_state: BluConnectionState;
  /** Epoch-ms of the last telemetry update */
  last_updated: number | null;

  // ── Phase 1C additions ────────────────────────────────────────────

  /** Whether telemetry is stale (older than grace window) */
  is_stale?: boolean;
  /** Device temperature in °C (when available) */
  temperature_celsius?: number | null;
  /** Net battery power (W) — positive = charging */
  battery_watts?: number | null;
  /** AC output power (W) when provider splits AC/DC */
  ac_output_watts?: number | null;
  /** DC output power (W) when provider splits AC/DC */
  dc_output_watts?: number | null;
}

// ── Default / Empty Values ──────────────────────────────────────────────

export const EMPTY_BLU_SUMMARY: BluSummary = {
  available: false,
  active_provider: null,
  active_device_name: null,
  active_device_model: null,
  battery_percent: null,
  live_input: null,
  live_output: null,
  solar_input: null,
  runtime_remaining: null,
  connection_state: 'disconnected',
  last_updated: null,
  is_stale: false,
  temperature_celsius: null,
  battery_watts: null,
  ac_output_watts: null,
  dc_output_watts: null,
};

export const DEFAULT_BLU_CAPABILITIES: BluDeviceCapabilities = {
  hasBatteryPercent: false,
  hasInputWatts: false,
  hasOutputWatts: false,
  hasSolarInput: false,
  hasAcOutput: false,
  hasDcOutput: false,
  hasTemperature: false,
  hasRuntimeEstimate: false,
  controllable: false,
};

// ── Phase 1D/1E: System Status ──────────────────────────────────────────

/**
 * High-level BLU system status label for UI display.
 *
 * - `live` — connected and receiving fresh telemetry
 * - `reconnecting` — session dropped, attempting quiet reconnect
 * - `updating` — connected but telemetry is aging past freshness threshold (Phase 1E)
 * - `stale` — connected but telemetry is older than grace window
 * - `disconnected` — no active provider connection
 */
export type BluSystemStatus = 'live' | 'reconnecting' | 'updating' | 'stale' | 'disconnected';


// ── Phase 1D: Session Persistence ───────────────────────────────────────

/**
 * Serializable snapshot of BLU session state for persistence.
 * Stored in user storage so BLU survives app restarts.
 */
export interface BluSessionSnapshot {
  /** Which provider was connected */
  provider: BluProviderId | null;
  /** Connection state at time of snapshot */
  connectionState: BluConnectionState;
  /** Primary device ID */
  primaryDeviceId: string | null;
  /** Epoch-ms when this snapshot was created */
  timestamp: number;
  /** Whether polling was active */
  wasPolling: boolean;
  /** Version tag for forward compatibility */
  version: number;
}

export const EMPTY_BLU_SESSION: BluSessionSnapshot = {
  provider: null,
  connectionState: 'disconnected',
  primaryDeviceId: null,
  timestamp: 0,
  wasPolling: false,
  version: 1,
};

// ── Phase 7A: Charging / Output / Warning State Enums ───────────────────

/**
 * Charging state for a BLU device.
 * Normalized across all providers.
 */
export type BluChargingState =
  | 'idle'
  | 'charging'
  | 'discharging'
  | 'full'
  | 'float'
  | 'error'
  | 'unknown';

/**
 * Output state for a BLU device.
 * Normalized across all providers.
 */
export type BluOutputState =
  | 'off'
  | 'ac_on'
  | 'dc_on'
  | 'all_on'
  | 'eco_mode'
  | 'unknown';

/**
 * Warning state for a BLU device.
 * Normalized across all providers.
 */
export type BluWarningState =
  | 'normal'
  | 'low_battery'
  | 'high_temp'
  | 'overload'
  | 'comm_loss'
  | 'error';

/**
 * Extended BluTelemetry with Phase 7A state fields.
 * Backward-compatible: all new fields are optional.
 */
export interface BluTelemetryExtended extends BluTelemetry {
  /** Charging state */
  charging_state?: BluChargingState;
  /** Output/inverter state */
  output_state?: BluOutputState;
  /** Warning state */
  warning_state?: BluWarningState;
  /** Whether the device is disconnected */
  is_disconnected?: boolean;
  /** Whether this reading is stale */
  is_stale?: boolean;
  /** Whether this device is the primary source */
  is_primary?: boolean;
  /** Provider display name for UI rendering */
  provider_display_name?: string;
  /** Provider accent color for UI rendering */
  provider_accent_color?: string;
  /** Provider icon name for UI rendering */
  provider_icon?: string;
  /** Device display name */
  device_name?: string;
  /** Device model name */
  model?: string;
}

// ── Phase 7A: Provider Capability Matrix ────────────────────────────────

/**
 * Describes what a provider is capable of at the provider level
 * (not per-device). Used by the orchestrator to determine which
 * operations are available.
 */
export interface BluProviderCapabilities {
  /** Provider supports BLE device scanning */
  canScan: boolean;
  /** Provider supports cloud API authentication */
  canAuthenticate: boolean;
  /** Provider supports multi-device connections */
  canMultiConnect: boolean;
  /** Provider supports device renaming */
  canRename: boolean;
  /** Provider supports remote commands */
  canControl: boolean;
  /** Provider supports session persistence */
  canPersistSession: boolean;
  /** Provider supports telemetry subscription (push) vs polling (pull) */
  hasPushTelemetry: boolean;
  /** Provider supports solar input monitoring */
  hasSolarSupport: boolean;
  /** Provider supports AC output monitoring */
  hasAcOutputSupport: boolean;
  /** Provider supports DC output monitoring */
  hasDcOutputSupport: boolean;
  /** Provider supports temperature monitoring */
  hasTemperatureSupport: boolean;
}

/**
 * Default provider capabilities (all false).
 */
export const DEFAULT_PROVIDER_CAPABILITIES: BluProviderCapabilities = {
  canScan: false,
  canAuthenticate: false,
  canMultiConnect: false,
  canRename: false,
  canControl: false,
  canPersistSession: false,
  hasPushTelemetry: false,
  hasSolarSupport: false,
  hasAcOutputSupport: false,
  hasDcOutputSupport: false,
  hasTemperatureSupport: false,
};

