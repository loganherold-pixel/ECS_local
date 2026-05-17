/**
 * src/power — ECS Power Integration barrel export.
 *
 * Phase 1A–3I: Core power telemetry, BLE, cloud, device management.
 * BLU Phase 1A–6A: Multi-provider BLE adapters (EcoFlow, Bluetti, Anker, Jackery, Goal Zero, Renogy).
 * Phase 7A: Architecture hardening — universal provider contract, registry, diagnostics.
 */

// ── Types ───────────────────────────────────────────────────────────────
export type {
  PowerTelemetry,
  PowerSource,
  PowerConnectionState,
  PowerDevice,
  PowerBattery,
  PowerSolar,
  PowerFlags,
  PowerCapabilities,
  PowerQuality,
} from "./types/PowerTelemetry";

// ── Interfaces ──────────────────────────────────────────────────────────
export type {
  IPowerConnector,
  DiscoveredPowerDevice,
} from "./connectors/IPowerConnector";

export type { IPowerDriver } from "./drivers/IPowerDriver";

// ── Driver Registry ─────────────────────────────────────────────────────
export { registeredDrivers, resolveDriver } from "./drivers/DriverRegistry";

// ── Telemetry Manager ───────────────────────────────────────────────────
export { powerTelemetryManager } from "./telemetry/PowerTelemetryManager";

// ── Hooks ───────────────────────────────────────────────────────────────
export { usePowerTelemetry } from "./hooks/usePowerTelemetry";

// ── BLE Permissions ─────────────────────────────────────────────────────
export {
  ensureBlePermissions,
  checkBlePermissions,
} from "./ble/BlePermissions";

export type { BlePermissionResult } from "./ble/BlePermissions";

// ── BLE Types ───────────────────────────────────────────────────────────
export type {
  BleInternalState,
  BleDiscoveredDevice,
  BleScanOptions,
  BleHeartbeatConfig,
} from "./ble/BleTypes";

export {
  DEFAULT_SCAN_OPTIONS,
  DEFAULT_HEARTBEAT_CONFIG,
} from "./ble/BleTypes";

// ── BLE Connector ───────────────────────────────────────────────────────
export { BleConnector } from "./connectors/BleConnector";

// ── BLE Backoff Utility ─────────────────────────────────────────────────
export { createBackoff } from "./ble/backoff";
export type { Backoff, BackoffConfig } from "./ble/backoff";

// ── Cloud Types ─────────────────────────────────────────────────────────
export type {
  ICloudProvider,
  CloudProviderMeta,
  CloudConnectorConfig,
  CloudInternalState,
} from "./cloud/CloudTypes";

export { DEFAULT_CLOUD_CONFIG } from "./cloud/CloudTypes";

// ── Cloud Token Store ───────────────────────────────────────────────────
export { TokenStore, tokenStore } from "./cloud/TokenStore";
export type { ITokenBackend, TokenMeta } from "./cloud/TokenStore";

// ── Cloud Connector ─────────────────────────────────────────────────────
export { CloudConnector } from "./connectors/CloudConnector";

// ── Cloud Providers ─────────────────────────────────────────────────────
export { EcoFlowCloudProvider } from "./cloud/providers/EcoFlowCloudProvider";
export type { EcoFlowCloudStatus } from "./cloud/providers/EcoFlowCloudProvider";

// ── Dev Helpers (Phase 3C) ──────────────────────────────────────────────
export {
  setEcoFlowToken,
  clearEcoFlowToken,
  hasEcoFlowToken,
  inspectEcoFlowToken,
  logDevTokenInstructions,
} from "./cloud/dev/DevCloudToken";

// ── Device Catalog Types (Phase 3E-1) ───────────────────────────────────
export type {
  PowerDevice as CatalogPowerDevice,
  PowerProviderId,
} from "./types/PowerDevice";

// ── Device Selection Store (Phase 3E-1) ─────────────────────────────────
export { powerDeviceStore } from "./devices/PowerDeviceStore";
export type { SelectedDevicesState } from "./devices/PowerDeviceStore";

// ── Power Forecast Engine (Phase 3H-1) ──────────────────────────────────
export { computePowerForecast } from "./forecast/powerForecast";
export type {
  PowerForecastInput,
  PowerForecast,
  PowerForecastStatus,
  PowerForecastConfidence,
} from "./forecast/powerForecast";

// ── Device Capacity Estimation (Phase 3H-3) ─────────────────────────────
export {
  estimateDeviceCapacityWh,
  computeSystemCapacity,
} from "./forecast/deviceCapacity";
export type { CapacityDevice } from "./forecast/deviceCapacity";

// ── Telemetry Sample Buffer (Phase 3I-1) ────────────────────────────────
export { PowerSampleBuffer, powerSampleBuffer } from "./telemetry/PowerSampleBuffer";
export type { PowerSample } from "./telemetry/PowerSampleBuffer";

// ── Load Detection Engine (Phase 3I-2) ──────────────────────────────────
export { detectLoadEvents } from "./detect/loadDetection";
export type {
  PowerEventType,
  PowerEvent,
} from "./detect/loadDetection";

// ── Power Events Store (Phase 3I-2) ─────────────────────────────────────
export { powerEventsStore } from "./detect/powerEventsStore";
export type { PowerEventsSubscriber } from "./detect/powerEventsStore";

// ── BLU — Battery Link Utility (Phase 1A + 1B + 1C + 1D + 2A) ──────────
//
// Universal power telemetry abstraction layer for ECS.
// Normalises data from multiple power ecosystems (EcoFlow, Bluetti, Anker SOLIX,
// Jackery, Goal Zero, Renogy, REDARC, Dakota Lithium, Victron) into a single schema.
//
export type {
  BluProviderId,
  BluProviderMeta,
  BluConnectionState,
  BluDeviceCapabilities,
  BluDevice,
  BluTelemetry,
  BluSummary,
  BluSystemStatus,
  BluSessionSnapshot,
} from "../../lib/BluTypes";

export {
  EMPTY_BLU_SUMMARY,
  DEFAULT_BLU_CAPABILITIES,
  EMPTY_BLU_SESSION,
} from "../../lib/BluTypes";

export {
  getAllProviders as getAllBluProviders,
  getActiveProviders as getActiveBluProviders,
  getPlannedProviders as getPlannedBluProviders,
  getProviderMeta as getBluProviderMeta,
  isProviderActive as isBluProviderActive,
  getProviderCount as getBluProviderCount,
  getActiveProviderCount as getActiveBluProviderCount,
} from "../../lib/BluProviderRegistry";

export { bluDeviceRegistry } from "../../lib/BluDeviceRegistry";
export { bluStateStore } from "../../lib/BluStateStore";
export { useBlu } from "../../lib/useBlu";
export type { BluHookResult } from "../../lib/useBlu";

// ── BLU Phase 1B — EcoFlow Adapter + Connection Hook ────────────────────
export { ecoFlowBluAdapter } from "../../lib/EcoFlowBluAdapter";
export type {
  EcoFlowConnectResult,
  EcoFlowPollResult,
  EcoFlowAdapterState,
} from "../../lib/EcoFlowBluAdapter";

// ── BLU Phase 2A — Bluetti Adapter ──────────────────────────────────────
export { bluettiBluAdapter } from "../../lib/BluettiBluAdapter";
export type {
  BluettiConnectResult,
  BluettiPollResult,
  BluettiAdapterState,
  BluettiDiscoveredDevice,
} from "../../lib/BluettiBluAdapter";

export {
  BLUETTI_SERVICE_UUID,
  BLUETTI_WRITE_CHAR_UUID,
  BLUETTI_NOTIFY_CHAR_UUID,
  BLUETTI_NAME_PREFIXES,
  isBluettiDeviceName,
  lookupBluettiModel,
  extractModelFromName,
  BLUETTI_MODEL_DB,
  BLUETTI_REGISTERS,
} from "../../lib/BluettiConstants";

export type { BluettiModelSpec } from "../../lib/BluettiConstants";

// ── BLU Phase 3A — Anker SOLIX Adapter ──────────────────────────────────
export { ankerSolixBluAdapter } from "../../lib/AnkerSolixBluAdapter";
export type {
  AnkerSolixConnectResult,
  AnkerSolixPollResult,
  AnkerSolixAdapterState,
  AnkerSolixDiscoveredDevice,
} from "../../lib/AnkerSolixBluAdapter";

export {
  ANKER_SOLIX_SERVICE_UUID,
  ANKER_SOLIX_WRITE_CHAR_UUID,
  ANKER_SOLIX_NOTIFY_CHAR_UUID,
  ANKER_SOLIX_NAME_PATTERNS,
  isAnkerSolixDeviceName,
  lookupAnkerSolixModel,
  extractAnkerModelFromName,
  ANKER_SOLIX_MODEL_DB,
  ANKER_SOLIX_REGISTERS,
} from "../../lib/AnkerSolixConstants";

export type { AnkerSolixModelSpec } from "../../lib/AnkerSolixConstants";

// ── BLU Phase 4A — Jackery Adapter ──────────────────────────────────────
export { jackeryBluAdapter } from "../../lib/JackeryBluAdapter";
export type {
  JackeryConnectResult,
  JackeryPollResult,
  JackeryAdapterState,
  JackeryDiscoveredDevice,
} from "../../lib/JackeryBluAdapter";

export {
  JACKERY_SERVICE_UUID,
  JACKERY_WRITE_CHAR_UUID,
  JACKERY_NOTIFY_CHAR_UUID,
  JACKERY_NAME_PATTERNS,
  isJackeryDeviceName,
  lookupJackeryModel,
  extractJackeryModelFromName,
  JACKERY_MODEL_DB,
  JACKERY_REGISTERS,
} from "../../lib/JackeryConstants";

export type { JackeryModelSpec } from "../../lib/JackeryConstants";

// ── BLU Phase 5A — Goal Zero Adapter ────────────────────────────────────
export { goalZeroBluAdapter } from "../../lib/GoalZeroBluAdapter";
export type {
  GoalZeroConnectResult,
  GoalZeroPollResult,
  GoalZeroAdapterState,
  GoalZeroDiscoveredDevice,
} from "../../lib/GoalZeroBluAdapter";

export {
  GOAL_ZERO_SERVICE_UUID,
  GOAL_ZERO_WRITE_CHAR_UUID,
  GOAL_ZERO_NOTIFY_CHAR_UUID,
  GOAL_ZERO_NAME_PATTERNS,
  isGoalZeroDeviceName,
  lookupGoalZeroModel,
  extractGoalZeroModelFromName,
  GOAL_ZERO_MODEL_DB,
  GOAL_ZERO_REGISTERS,
} from "../../lib/GoalZeroConstants";

export type { GoalZeroModelSpec } from "../../lib/GoalZeroConstants";

// ── BLU Phase 6A — Renogy Adapter ───────────────────────────────────────
export { renogyBluAdapter } from "../../lib/RenogyBluAdapter";
export type {
  RenogyConnectResult,
  RenogyPollResult,
  RenogyAdapterState,
  RenogyDiscoveredDevice,
} from "../../lib/RenogyBluAdapter";

export { redarcBluAdapter } from "../../lib/RedarcBluAdapter";
export type {
  RedarcConnectResult,
  RedarcPollResult,
  RedarcAdapterState,
  RedarcDiscoveredDevice,
} from "../../lib/RedarcBluAdapter";

export { dakotaLithiumBluAdapter } from "../../lib/DakotaLithiumBluAdapter";
export type {
  DakotaLithiumConnectResult,
  DakotaLithiumPollResult,
  DakotaLithiumAdapterState,
  DakotaLithiumDiscoveredDevice,
} from "../../lib/DakotaLithiumBluAdapter";

export {
  RENOGY_SERVICE_UUID,
  RENOGY_WRITE_CHAR_UUID,
  RENOGY_NOTIFY_CHAR_UUID,
  RENOGY_NAME_PATTERNS,
  isRenogyDeviceName,
  lookupRenogyModel,
  extractRenogyModelFromName,
  getRenogyDeviceRole,
  getRenogyDeviceCategory,
  RENOGY_MODEL_DB,
  RENOGY_REGISTERS,
  RENOGY_CHARGING_STATUS,
  getChargingStatusLabel,
} from "../../lib/RenogyConstants";

export type { RenogyModelSpec, RenogyDeviceCategory } from "../../lib/RenogyConstants";

// ── BLU Phase 1D — Session Store ────────────────────────────────────────
export { bluSessionStore } from "../../lib/BluSessionStore";

// ── Phase 7A: BLU Extended Types ────────────────────────────────────────
export type {
  BluChargingState,
  BluOutputState,
  BluWarningState,
  BluTelemetryExtended,
  BluProviderCapabilities,
} from "../../lib/BluTypes";

export { DEFAULT_PROVIDER_CAPABILITIES } from "../../lib/BluTypes";

// ── Phase 7A: Universal Provider Contract ───────────────────────────────
export type {
  IEcsPowerProvider,
  EcsProviderLifecycleState,
  EcsProviderWarning,
  EcsProviderDiagnostics,
  EcsDiscoveredDevice,
  EcsProviderAuthRequirement,
  EcsTelemetryCallback,
  EcsConnectionCallback,
  EcsWarningCallback,
  EcsNormalizedReading,
  EcsChargingState,
  EcsOutputState,
  EcsWarningState,
  EcsConnectResult,
} from "../../lib/IEcsPowerProvider";

// ── Phase 7A: Provider Registry + Orchestrator ──────────────────────────
export {
  ecsProviderRegistry,
  ECS_PROVIDER_BRANDING,
} from "../../lib/EcsProviderRegistry";

export type { EcsSystemPowerState } from "../../lib/EcsProviderRegistry";

// ── Phase 7A: Provider Diagnostics + Health Monitoring ──────────────────
export {
  TELEMETRY_FRESHNESS,
  CONNECTION_STABILITY,
  WARNING_DEDUP_WINDOW_MS,
  getTelemetryFreshness,
  getFreshnessLabel,
  getFreshnessColor,
  computeProviderHealthScore,
  deduplicateWarnings,
  deriveWarningState,
  shouldPreserveReading,
  DEFAULT_OFFLINE_TOLERANCE,
  computeSystemHealthSummary,
} from "../../lib/EcsProviderDiagnostics";

export type {
  TelemetryFreshness,
  ProviderHealthScore,
  OfflineToleranceConfig,
  SystemHealthSummary,
} from "../../lib/EcsProviderDiagnostics";

// ── Phase 7A: Unified Provider Hook ─────────────────────────────────────
export { useEcsProviders } from "../../lib/useEcsProviders";
export type {
  EcsProviderSummary,
  EcsDeviceSummary,
  EcsProvidersHookResult,
} from "../../lib/useEcsProviders";
