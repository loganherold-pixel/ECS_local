/**
 * IEcsPowerProvider — universal provider contract for ECS battery integrations.
 *
 * Every power ecosystem (EcoFlow, Bluetti, Anker SOLIX, Jackery, Goal Zero,
 * Renogy, and future providers) must implement this interface to participate
 * in the ECS unified power telemetry platform.
 *
 * This contract ensures:
 *   - All providers expose identical lifecycle methods
 *   - All telemetry is normalized to the same schema
 *   - All providers can coexist in mixed multi-provider deployments
 *   - Dashboard UI never needs provider-specific rendering logic
 *   - New providers can be added without modifying core dashboard code
 *
 * Phase 7A — Architecture Hardening: Universal Provider Contract
 */

import type { BluProviderId, BluConnectionState, BluDevice, BluTelemetry, BluDeviceCapabilities } from './BluTypes';
import type { BluetoothTelemetrySource } from './bluetoothLiveTelemetry';

// ── Provider Lifecycle State ────────────────────────────────────────────

/**
 * Granular provider lifecycle state.
 * Extends BluConnectionState with provider-level states.
 */
export type EcsProviderLifecycleState =
  | 'uninitialized'    // Provider module loaded but not yet activated
  | 'idle'             // Activated but no connection attempt
  | 'scanning'         // Actively scanning for devices (BLE)
  | 'authenticating'   // Provider-specific auth in progress (cloud API key, OAuth, etc.)
  | 'connecting'       // Connection attempt in progress
  | 'connected'        // At least one device connected and reporting
  | 'polling'          // Connected and actively polling telemetry
  | 'reconnecting'     // Lost connection, attempting quiet reconnect
  | 'suspended'        // User-initiated pause (app background, etc.)
  | 'error'            // Unrecoverable error state
  | 'disconnected';    // Clean disconnect, ready to reconnect

// ── Provider Warning ────────────────────────────────────────────────────

/**
 * Structured warning from a provider.
 * Warnings are non-fatal conditions that the UI should surface.
 */
export interface EcsProviderWarning {
  /** Warning severity */
  severity: 'info' | 'caution' | 'critical';
  /** Machine-readable warning code */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Epoch-ms when this warning was raised */
  timestamp: number;
  /** Device ID that raised the warning (null for provider-level warnings) */
  deviceId: string | null;
  /** Whether this warning has been acknowledged by the user */
  acknowledged: boolean;
}

// ── Provider Diagnostics ────────────────────────────────────────────────

/**
 * Provider health diagnostics for monitoring and debugging.
 */
export interface EcsProviderDiagnostics {
  /** Provider identifier */
  providerId: BluProviderId;
  /** Current lifecycle state */
  lifecycleState: EcsProviderLifecycleState;
  /** Number of connected devices */
  connectedDeviceCount: number;
  /** Total telemetry polls completed */
  totalPollCount: number;
  /** Polls that returned valid telemetry */
  successfulPollCount: number;
  /** Polls that failed or returned stale data */
  failedPollCount: number;
  /** Current poll interval in ms */
  pollIntervalMs: number;
  /** Epoch-ms of last successful telemetry receipt */
  lastTelemetryAt: number | null;
  /** Epoch-ms of last connection attempt */
  lastConnectionAttemptAt: number | null;
  /** Number of reconnect attempts since last stable connection */
  reconnectAttemptsSinceStable: number;
  /** Whether the provider is in a backoff state */
  isInBackoff: boolean;
  /** Current backoff delay in ms (0 if not in backoff) */
  currentBackoffMs: number;
  /** Uptime in ms since last successful connection */
  uptimeMs: number;
  /** Provider-specific diagnostic metadata */
  providerMeta?: Record<string, unknown>;
}

// ── Discovered Device (pre-connection) ──────────────────────────────────

/**
 * A device discovered during scanning, before connection.
 * Provider-agnostic shape used by all BLE/cloud discovery flows.
 */
export interface EcsDiscoveredDevice {
  /** Transport-level identifier (MAC, serial, cloud ID) */
  id: string;
  /** Human-readable device name from advertisement/API */
  name: string;
  /** Detected model name */
  model: string;
  /** Provider that discovered this device */
  provider: BluProviderId;
  /** Signal strength (BLE: dBm, cloud: N/A) */
  rssi: number;
  /** Estimated capacity in Wh (from model lookup) */
  estimatedCapacityWh?: number;
  /** Model display name (from model DB) */
  modelDisplayName?: string;
  /** Epoch-ms when this device was discovered */
  discoveredAt: number;
  /** Raw provider-specific discovery data */
  raw?: unknown;
}

// ── Provider Authentication ─────────────────────────────────────────────

/**
 * Authentication requirements for a provider.
 * Some providers (cloud APIs) require auth; BLE providers typically don't.
 */
export interface EcsProviderAuthRequirement {
  /** Whether this provider requires authentication */
  required: boolean;
  /** Type of authentication */
  authType: 'none' | 'api_key' | 'oauth' | 'ble_pairing' | 'custom';
  /** Whether the provider is currently authenticated */
  isAuthenticated: boolean;
  /** Human-readable description of what's needed */
  description: string;
}

// ── Telemetry Subscription ──────────────────────────────────────────────

/** Callback for telemetry updates */
export type EcsTelemetryCallback = (telemetry: EcsNormalizedReading) => void;

/** Callback for connection state changes */
export type EcsConnectionCallback = (state: EcsProviderLifecycleState) => void;

/** Callback for warning events */
export type EcsWarningCallback = (warning: EcsProviderWarning) => void;

// ── Normalized Reading (per-device snapshot) ────────────────────────────

/**
 * A single normalized telemetry reading from one device.
 * This is the atomic unit of data that flows through the ECS power system.
 *
 * All providers normalize their vendor-specific payloads into this shape.
 * The dashboard UI renders exclusively from this type.
 */
export interface EcsNormalizedReading {
  // ── Identity ──────────────────────────────────────────────────────
  /** Provider brand identifier */
  provider: BluProviderId;
  /** Provider display name (e.g., "EcoFlow", "Goal Zero") */
  providerDisplayName: string;
  /** Provider accent color for UI branding */
  providerAccentColor: string;
  /** Provider icon name (Ionicons) */
  providerIcon: string;
  /** Device identifier */
  deviceId: string;
  /** User-friendly device name */
  deviceName: string;
  /** Device model name */
  model: string;

  // ── Core Telemetry ────────────────────────────────────────────────
  /** Battery state-of-charge percentage (0–100) */
  batteryPercent: number | null;
  /** Total input power in watts */
  inputWatts: number | null;
  /** Total output power in watts */
  outputWatts: number | null;
  /** Estimated remaining runtime in minutes */
  estimatedRuntimeMinutes: number | null;

  // ── State Flags ───────────────────────────────────────────────────
  /** Current charging state */
  chargingState: EcsChargingState;
  /** Current output/inverter state */
  outputState: EcsOutputState;
  /** Current connection state */
  connectionState: BluConnectionState;
  /** Whether the device is in a warning condition */
  warningState: EcsWarningState;
  /** Whether the device is disconnected */
  isDisconnected: boolean;

  // ── Environmental ─────────────────────────────────────────────────
  /** Device temperature in °C */
  temperatureCelsius: number | null;

  // ── Extended Telemetry ────────────────────────────────────────────
  /** Solar input power in watts */
  solarInputWatts: number | null;
  /** AC output power in watts */
  acOutputWatts: number | null;
  /** DC output power in watts */
  dcOutputWatts: number | null;
  /** Battery voltage */
  batteryVolts: number | null;
  /** Battery current in amps (positive = charging) */
  batteryAmps: number | null;
  /** Charge cycle count */
  chargeCycles: number | null;
  /** Battery health percentage */
  healthPercent: number | null;
  /** Total capacity in Wh */
  capacityWh: number | null;

  // ── Metadata ──────────────────────────────────────────────────────
  /** Epoch-ms when this reading was created */
  lastUpdated: number;
  /** Whether this reading is stale (older than freshness threshold) */
  isStale: boolean;
  /** Whether this device is the primary power source */
  isPrimary: boolean;
  /** Truthful telemetry origin. Mock data is dev-only and never live. */
  telemetrySource?: BluetoothTelemetrySource;
  /** User-facing source label for diagnostics/control pages. */
  telemetrySourceLabel?: string;
  /** True only when decoded live Bluetooth telemetry is flowing. */
  isLive?: boolean;
  /** Epoch-ms when this telemetry source was updated. */
  updatedAt?: number;
  /** Connected device is reachable, but telemetry is not decoded yet. */
  telemetryUnsupported?: boolean;
  /** Short reason for unsupported or unavailable telemetry. */
  telemetryUnsupportedReason?: string;
}

// ── Charging State Enum ─────────────────────────────────────────────────

export type EcsChargingState =
  | 'idle'           // Not charging, not discharging
  | 'charging'       // Actively accepting charge
  | 'discharging'    // Actively providing power
  | 'full'           // Fully charged
  | 'float'          // Float/maintenance charging
  | 'error'          // Charging error
  | 'unknown';       // State cannot be determined

// ── Output State Enum ───────────────────────────────────────────────────

export type EcsOutputState =
  | 'off'            // All outputs disabled
  | 'ac_on'          // AC inverter active
  | 'dc_on'          // DC outputs active
  | 'all_on'         // Both AC and DC active
  | 'eco_mode'       // Eco/standby mode
  | 'unknown';       // State cannot be determined

// ── Warning State Enum ──────────────────────────────────────────────────

export type EcsWarningState =
  | 'normal'         // No warnings
  | 'low_battery'    // Battery below threshold
  | 'high_temp'      // Temperature above threshold
  | 'overload'       // Output overload detected
  | 'comm_loss'      // Communication lost (stale data)
  | 'error';         // Device-reported error

// ── Connect Result ──────────────────────────────────────────────────────

export interface EcsConnectResult {
  /** Whether the connection was successful */
  success: boolean;
  /** Number of devices discovered/connected */
  deviceCount: number;
  /** Connected device descriptors */
  devices: BluDevice[];
  /** Error message if connection failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
}

// ── The Provider Interface ──────────────────────────────────────────────

/**
 * IEcsPowerProvider — the universal contract for all ECS power providers.
 *
 * Every provider (EcoFlow, Bluetti, Anker SOLIX, Jackery, Goal Zero, Renogy)
 * implements this interface. The ECS orchestrator and dashboard UI interact
 * exclusively through this contract.
 */
export interface IEcsPowerProvider {
  // ── Identity ──────────────────────────────────────────────────────

  /** Canonical provider identifier */
  readonly providerId: BluProviderId;
  /** Human-readable provider name */
  readonly displayName: string;
  /** Provider accent color for UI */
  readonly accentColor: string;
  /** Provider icon name (Ionicons) */
  readonly iconName: string;
  /** Provider transport type */
  readonly transportType: 'ble' | 'cloud' | 'wifi' | 'hybrid';

  // ── Lifecycle ─────────────────────────────────────────────────────

  /** Get current lifecycle state */
  getLifecycleState(): EcsProviderLifecycleState;

  /** Get authentication requirements */
  getAuthRequirement(): EcsProviderAuthRequirement;

  /** Authenticate with the provider (if required) */
  authenticate(credentials?: Record<string, string>): Promise<boolean>;

  // ── Connection ────────────────────────────────────────────────────

  /** Connect to the provider and discover devices */
  connect(deviceId?: string): Promise<EcsConnectResult>;

  /** Disconnect from all devices */
  disconnect(): Promise<void>;

  /** Attempt to reconnect to previously known devices */
  reconnect(): Promise<EcsConnectResult>;

  /** Check if the provider is currently connected */
  isConnected(): boolean;

  // ── Discovery ─────────────────────────────────────────────────────

  /** Scan for available devices (BLE scan, cloud device list, etc.) */
  discoverDevices(): Promise<EcsDiscoveredDevice[]>;

  /** Get currently connected devices */
  getConnectedDevices(): BluDevice[];

  /** Get all registered devices (connected + previously known) */
  getRegisteredDevices(): BluDevice[];

  // ── Telemetry ─────────────────────────────────────────────────────

  /** Fetch current telemetry for all connected devices */
  fetchTelemetry(): Promise<EcsNormalizedReading[]>;

  /** Start automatic telemetry polling */
  startPolling(intervalMs?: number): void;

  /** Stop automatic telemetry polling */
  stopPolling(): void;

  /** Whether polling is currently active */
  isPolling(): boolean;

  /** Subscribe to telemetry updates */
  onTelemetry(callback: EcsTelemetryCallback): () => void;

  /** Subscribe to connection state changes */
  onConnectionChange(callback: EcsConnectionCallback): () => void;

  /** Subscribe to warning events */
  onWarning(callback: EcsWarningCallback): () => void;

  // ── Normalization ─────────────────────────────────────────────────

  /** Normalize a raw vendor telemetry payload into EcsNormalizedReading */
  normalizeReading(deviceId: string, raw: unknown): EcsNormalizedReading | null;

  /** Get normalized device metadata */
  normalizeDeviceMetadata(deviceId: string): Partial<EcsNormalizedReading> | null;

  // ── Diagnostics ───────────────────────────────────────────────────

  /** Get provider health diagnostics */
  getDiagnostics(): EcsProviderDiagnostics;

  /** Get active warnings */
  getActiveWarnings(): EcsProviderWarning[];

  /** Report current connection state */
  reportConnectionState(): BluConnectionState;

  /** Report device-level warnings */
  reportDeviceWarnings(deviceId: string): EcsProviderWarning[];

  // ── Device Management ─────────────────────────────────────────────

  /** Set a device as the primary power source */
  setPrimaryDevice(deviceId: string): Promise<void>;

  /** Rename a device */
  renameDevice(deviceId: string, newName: string): Promise<void>;

  /** Remove a device from the registry */
  removeDevice(deviceId: string): Promise<void>;

  // ── Session ───────────────────────────────────────────────────────

  /** Save current session state for persistence */
  saveSession(): Promise<void>;

  /** Restore a previous session */
  restoreSession(): Promise<boolean>;

  /** Check if a previous session exists */
  hasPreviousSession(): boolean;

  // ── Cleanup ───────────────────────────────────────────────────────

  /** Destroy the provider and release all resources */
  destroy(): void;
}

