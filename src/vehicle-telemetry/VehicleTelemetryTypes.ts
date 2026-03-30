/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY TYPES — Phase 2A
 * ═══════════════════════════════════════════════════════════
 *
 * Canonical type definitions for the Vehicle Telemetry service layer.
 *
 * This module defines:
 *   - Telemetry provider identifiers
 *   - Telemetry device model
 *   - Normalized vehicle telemetry schema
 *   - Connection states
 *   - Telemetry summary object for widget consumption
 *
 * The Vehicle Telemetry layer operates independently from BLU
 * power telemetry. BLU handles portable power stations (EcoFlow,
 * Jackery, etc.) while Vehicle Telemetry handles data from the
 * vehicle itself (OBD-II, TPMS, internal sensors).
 */

// ═══════════════════════════════════════════════════════════
// TELEMETRY PROVIDER MODEL
// ═══════════════════════════════════════════════════════════

/**
 * Supported vehicle telemetry provider identifiers.
 *
 * obd2            — OBD-II Bluetooth/Wi-Fi adapter (first active path)
 * tpms            — Tire Pressure Monitoring System (future)
 * vehicle_internal — Vehicle's built-in telematics (future)
 * future_sensor   — Placeholder for future sensor types
 */
export type VehicleTelemetryProviderId =
  | 'obd2'
  | 'tpms'
  | 'vehicle_internal'
  | 'future_sensor';

/**
 * Provider availability status.
 *
 * active       — Provider integration is live and usable
 * coming_soon  — Provider is planned but not yet implemented
 * unavailable  — Provider is not supported on this platform
 */
export type ProviderAvailability =
  | 'active'
  | 'coming_soon'
  | 'unavailable';

/**
 * Provider metadata for display in ECS settings.
 */
export interface VehicleTelemetryProviderInfo {
  /** Provider identifier */
  id: VehicleTelemetryProviderId;
  /** Human-readable display name */
  displayName: string;
  /** Short description of the provider */
  description: string;
  /** Ionicons icon name for the provider card */
  iconName: string;
  /** Provider availability status */
  availability: ProviderAvailability;
  /** Whether this provider supports multiple simultaneous devices */
  supportsMultiDevice: boolean;
  /** Supported connection transports */
  transports: ('bluetooth' | 'wifi' | 'usb' | 'internal')[];
}

// ═══════════════════════════════════════════════════════════
// TELEMETRY CONNECTION STATES
// ═══════════════════════════════════════════════════════════

/**
 * Connection lifecycle states for a telemetry device.
 */
export type VehicleTelemetryConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'unsupported';

// ═══════════════════════════════════════════════════════════
// TELEMETRY DEVICE MODEL
// ═══════════════════════════════════════════════════════════

/**
 * Device capability flags — what data this device can provide.
 */
export interface VehicleTelemetryCapabilities {
  /** Reports vehicle speed */
  hasSpeed: boolean;
  /** Reports engine RPM */
  hasRpm: boolean;
  /** Reports engine load percentage */
  hasEngineLoad: boolean;
  /** Reports coolant temperature */
  hasCoolantTemp: boolean;
  /** Reports intake air temperature */
  hasIntakeTemp: boolean;
  /** Reports battery voltage (12V system) */
  hasBatteryVoltage: boolean;
  /** Reports fuel level percentage */
  hasFuelLevel: boolean;
  /** Reports fuel consumption rate */
  hasFuelRate: boolean;
  /** Reports engine runtime */
  hasEngineRuntime: boolean;
  /** Reports tire pressure (TPMS) */
  hasTirePressure: boolean;
  /** Reports diagnostic trouble codes (DTCs) */
  hasDTCs: boolean;
}

/**
 * Default capabilities — all false.
 */
export const EMPTY_CAPABILITIES: VehicleTelemetryCapabilities = {
  hasSpeed: false,
  hasRpm: false,
  hasEngineLoad: false,
  hasCoolantTemp: false,
  hasIntakeTemp: false,
  hasBatteryVoltage: false,
  hasFuelLevel: false,
  hasFuelRate: false,
  hasEngineRuntime: false,
  hasTirePressure: false,
  hasDTCs: false,
};

/**
 * Vehicle telemetry device — represents a physical data source.
 */
export interface VehicleTelemetryDevice {
  /** Provider that owns this device */
  provider: VehicleTelemetryProviderId;
  /** Unique device identifier (MAC address, serial, UUID) */
  device_id: string;
  /** Human-readable device name */
  device_name: string;
  /** Current connection state */
  connection_state: VehicleTelemetryConnectionState;
  /** ISO timestamp of last successful data reception */
  last_seen: string | null;
  /** What this device can report */
  capabilities: VehicleTelemetryCapabilities;
  /** Whether this is the primary telemetry device */
  is_primary: boolean;
  /** ISO timestamp when device was first registered */
  registered_at: string;
  /** Optional firmware version string */
  firmware_version?: string;
  /** Optional protocol version (e.g., "OBD-II", "CAN") */
  protocol?: string;
}

// ═══════════════════════════════════════════════════════════
// NORMALIZED VEHICLE TELEMETRY SCHEMA
// ═══════════════════════════════════════════════════════════

/**
 * Normalized vehicle telemetry reading.
 *
 * All providers normalize their vendor-specific data into this
 * shape before it enters the ECS telemetry store. Fields are
 * optional — a device only populates what it can report.
 */
export interface NormalizedVehicleTelemetry {
  /** Epoch-ms when this reading was created */
  timestamp: number;

  /** Provider that produced this reading */
  provider: VehicleTelemetryProviderId;

  /** Device ID that produced this reading */
  device_id: string;

  // ── Core engine metrics ────────────────────────────────

  /** Vehicle speed in mph */
  vehicle_speed?: number;

  /** Engine RPM */
  engine_rpm?: number;

  /** Engine load as percentage (0–100) */
  engine_load?: number;

  /** Engine coolant temperature in °F */
  coolant_temp?: number;

  /** Intake air temperature in °F */
  intake_temp?: number;

  /** Vehicle 12V battery voltage */
  battery_voltage?: number;

  /** Fuel level as percentage (0–100) */
  fuel_level?: number;

  /** Fuel consumption rate in gallons per hour */
  fuel_rate?: number;

  /** Engine runtime in seconds since start */
  engine_runtime?: number;

  // ── Optional extended metrics ──────────────────────────

  /** Throttle position percentage (0–100) */
  throttle_position?: number;

  /** Mass air flow rate in grams/sec */
  mass_air_flow?: number;

  /** Barometric pressure in kPa */
  barometric_pressure?: number;

  /** Ambient air temperature in °F */
  ambient_temp?: number;

  /** Transmission temperature in °F */
  transmission_temp?: number;

  /** Oil temperature in °F */
  oil_temp?: number;

  /** Oil pressure in PSI */
  oil_pressure?: number;

  /** Odometer reading in miles */
  odometer?: number;

  // ── TPMS metrics (future) ──────────────────────────────

  /** Tire pressures in PSI [FL, FR, RL, RR] */
  tire_pressures?: [number | null, number | null, number | null, number | null];

  /** Tire temperatures in °F [FL, FR, RL, RR] */
  tire_temps?: [number | null, number | null, number | null, number | null];
}

/**
 * Empty telemetry reading — used as default/placeholder.
 */
export const EMPTY_TELEMETRY: NormalizedVehicleTelemetry = {
  timestamp: 0,
  provider: 'obd2',
  device_id: '',
};


// ═══════════════════════════════════════════════════════════
// TELEMETRY FRESHNESS LABEL — Phase 2D
// ═══════════════════════════════════════════════════════════

/**
 * Telemetry freshness label for UI display.
 *
 * live          — Data is fresh and actively updating (< 30s old)
 * reconnecting  — Connection dropped, attempting to re-establish
 * stale         — Data is older than the grace window (> 90s)
 * disconnected  — No active telemetry connection
 * last_known    — Showing last known snapshot (not live)
 */
export type TelemetryFreshnessLabel =
  | 'live'
  | 'reconnecting'
  | 'stale'
  | 'disconnected'
  | 'last_known';

/**
 * Session recovery status for Phase 2D.
 */
export type SessionRecoveryStatus =
  | 'idle'
  | 'restoring'
  | 'restored'
  | 'failed'
  | 'no_session';

// ═══════════════════════════════════════════════════════════
// VEHICLE TELEMETRY SUMMARY
// ═══════════════════════════════════════════════════════════

/**
 * Engine status derived from telemetry data.
 */
export type EngineStatus =
  | 'running'
  | 'idle'
  | 'off'
  | 'unknown';

/**
 * Vehicle telemetry summary — compact object for widget consumption.
 *
 * Widgets read from this summary rather than raw telemetry.
 * The summary is updated by the telemetry service whenever
 * new data arrives from any provider.
 */
export interface VehicleTelemetrySummary {
  /** Overall connection state of the primary device */
  connection_state: VehicleTelemetryConnectionState;

  /** Derived engine status */
  engine_status: EngineStatus;

  /** 12V battery voltage (null if unavailable) */
  battery_voltage: number | null;

  /** Fuel level percentage (null if unavailable) */
  fuel_level: number | null;

  /** Vehicle speed in mph (null if unavailable) */
  vehicle_speed: number | null;

  /** Engine RPM (null if unavailable) */
  engine_rpm: number | null;

  /** Coolant temperature in °F (null if unavailable) */
  coolant_temp: number | null;

  /** ISO timestamp of last successful data update */
  last_updated: string | null;

  /** Whether the summary contains any live data */
  has_data: boolean;

  /** Primary device name (for display) */
  device_name: string | null;

  /** Primary device provider */
  provider: VehicleTelemetryProviderId | null;
}

/**
 * Empty summary — used when no telemetry device is connected.
 */
export const EMPTY_SUMMARY: VehicleTelemetrySummary = {
  connection_state: 'disconnected',
  engine_status: 'unknown',
  battery_voltage: null,
  fuel_level: null,
  vehicle_speed: null,
  engine_rpm: null,
  coolant_temp: null,
  last_updated: null,
  has_data: false,
  device_name: null,
  provider: null,
};

// ═══════════════════════════════════════════════════════════
// PROVIDER REGISTRY — Static metadata for all providers
// ═══════════════════════════════════════════════════════════

/**
 * Static registry of all supported vehicle telemetry providers.
 * Used by the settings UI to display provider cards.
 */
export const VEHICLE_TELEMETRY_PROVIDERS: VehicleTelemetryProviderInfo[] = [
  {
    id: 'obd2',
    displayName: 'OBD-II',
    description: 'Connect via Bluetooth OBD-II adapter for engine data, fuel level, battery voltage, and diagnostics.',
    iconName: 'car-outline',
    availability: 'active',
    supportsMultiDevice: false,
    transports: ['bluetooth', 'wifi'],
  },
  {
    id: 'tpms',
    displayName: 'TPMS',
    description: 'Tire Pressure Monitoring System — real-time tire pressure and temperature from aftermarket TPMS sensors.',
    iconName: 'speedometer-outline',
    availability: 'coming_soon',
    supportsMultiDevice: false,
    transports: ['bluetooth'],
  },
  {
    id: 'vehicle_internal',
    displayName: 'Vehicle Telematics',
    description: 'Direct integration with vehicle manufacturer telematics systems for comprehensive vehicle data.',
    iconName: 'hardware-chip-outline',
    availability: 'coming_soon',
    supportsMultiDevice: false,
    transports: ['internal'],
  },
  {
    id: 'future_sensor',
    displayName: 'External Sensors',
    description: 'Support for additional external sensors — temperature probes, fuel flow meters, and custom data sources.',
    iconName: 'pulse-outline',
    availability: 'coming_soon',
    supportsMultiDevice: true,
    transports: ['bluetooth', 'wifi'],
  },
];

// ═══════════════════════════════════════════════════════════
// PERSISTENCE KEYS
// ═══════════════════════════════════════════════════════════

export const VT_STORAGE_KEYS = {
  DEVICES: 'ecs_vt_devices',
  PRIMARY_DEVICE: 'ecs_vt_primary_device',
  LAST_TELEMETRY: 'ecs_vt_last_telemetry',
  SESSION: 'ecs_vt_session',
} as const;

