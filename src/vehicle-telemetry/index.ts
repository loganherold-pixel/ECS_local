/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY — Phase 2E Barrel Export
 * ═══════════════════════════════════════════════════════════
 */

// ── Types ────────────────────────────────────────────────
export type {
  VehicleTelemetryProviderId,
  ProviderAvailability,
  VehicleTelemetryProviderInfo,
  VehicleTelemetryConnectionState,
  TelemetryConnectionState,
  VehicleTelemetrySource,
  ECSTelemetrySourceType,
  ECSTelemetryFreshness,
  ECSTelemetryConfidence,
  ECSTelemetryWarningSeverity,
  PowerTelemetrySourceType,
  PowerTelemetrySnapshot,
  VehicleTelemetryWarning,
  VehicleTelemetrySnapshot,
  VehicleTelemetryCapabilities,
  VehicleTelemetryDevice,
  NormalizedVehicleTelemetry,
  EngineStatus,
  VehicleTelemetrySummary,
  TelemetryFreshnessLabel,
  SessionRecoveryStatus,
} from './VehicleTelemetryTypes';

export {
  EMPTY_CAPABILITIES,
  EMPTY_VEHICLE_TELEMETRY_SNAPSHOT,
  EMPTY_TELEMETRY,
  EMPTY_SUMMARY,
  VEHICLE_TELEMETRY_PROVIDERS,
  VT_STORAGE_KEYS,
} from './VehicleTelemetryTypes';

// ── Device Registry ──────────────────────────────────────
export { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';

// ── State Store ──────────────────────────────────────────
export { vehicleTelemetryStore } from './VehicleTelemetryStore';

// ── Service Layer ────────────────────────────────────────
export { vehicleTelemetryService } from './VehicleTelemetryService';

// ── React Hooks ──────────────────────────────────────────
export { useVehicleTelemetry } from './useVehicleTelemetry';
export type { VehicleTelemetryHookResult } from './useVehicleTelemetry';

// ── OBD-II Adapter (Phase 2B) ────────────────────────────
export { obd2Adapter } from './OBD2Adapter';
export type {
  OBD2DiscoveredDevice,
  OBD2AdapterState,
  OBD2AdapterStatus,
} from './OBD2Adapter';

// ── OBD-II Scanner Hook (Phase 2B) ──────────────────────

// ── OBD-II PID Poller (Phase 2C) ────────────────────────
export { OBD2PIDPoller, OBD2_PIDS, parseELM327Response, parseBatteryVoltageResponse } from './OBD2PIDPoller';
export type { OBD2PIDDefinition, PollerState, PollerStatus, PollerCallbacks } from './OBD2PIDPoller';

