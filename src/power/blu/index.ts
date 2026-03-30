/**
 * BLU — Battery Link Utility
 *
 * Universal power telemetry abstraction layer for ECS.
 *
 * Barrel export for all BLU types, stores, registries, hooks, and adapters.
 *
 * Phase 1A: Foundation with EcoFlow as the first active provider.
 * Phase 1B: EcoFlow adapter + connection hook.
 * Phase 1C: Live telemetry polling + Sustainability widget activation.
 * Phase 1D: Persistence, multi-device handling, error recovery.
 * Phase 2A: Bluetti BLE adapter + multi-provider support.
 * Phase 3A: Anker SOLIX BLE adapter + tri-provider support.
 * Phase 4A: Jackery BLE adapter + quad-provider support.
 * Phase 5A: Goal Zero BLE adapter + penta-provider support.
 * Phase 6A: Renogy BLE adapter + hexa-provider support.
 * Phase 7A: Architecture hardening — universal provider contract.
 */

// ── Types ───────────────────────────────────────────────────────────────
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
  // Phase 7A additions
  BluChargingState,
  BluOutputState,
  BluWarningState,
  BluTelemetryExtended,
  BluProviderCapabilities,
} from './BluTypes';

export {
  EMPTY_BLU_SUMMARY,
  DEFAULT_BLU_CAPABILITIES,
  EMPTY_BLU_SESSION,
  // Phase 7A additions
  DEFAULT_PROVIDER_CAPABILITIES,
} from './BluTypes';


// ── Provider Registry ───────────────────────────────────────────────────
export {
  getAllProviders,
  getActiveProviders,
  getPlannedProviders,
  getProviderMeta,
  isProviderActive,
  getProviderCount,
  getActiveProviderCount,
} from './BluProviderRegistry';

// ── Device Registry ─────────────────────────────────────────────────────
export { bluDeviceRegistry } from './BluDeviceRegistry';

// ── State Store ─────────────────────────────────────────────────────────
export { bluStateStore } from './BluStateStore';

// ── Session Store (Phase 1D) ────────────────────────────────────────────
export { bluSessionStore } from './BluSessionStore';

// ── Hooks ───────────────────────────────────────────────────────────────
export { useBlu } from './useBlu';
export type { BluHookResult } from './useBlu';
export { useBluConnection } from './useBluConnection';
export type { BluConnectionState_Hook } from './useBluConnection';

// ── Adapters — EcoFlow ──────────────────────────────────────────────────
export { ecoFlowBluAdapter } from './adapters/EcoFlowBluAdapter';
export type {
  EcoFlowConnectResult,
  EcoFlowPollResult,
  EcoFlowAdapterState,
} from './adapters/EcoFlowBluAdapter';

// ── Adapters — Bluetti (Phase 2A) ───────────────────────────────────────
export { bluettiBluAdapter } from './adapters/BluettiBluAdapter';
export type {
  BluettiConnectResult,
  BluettiPollResult,
  BluettiAdapterState,
  BluettiDiscoveredDevice,
} from './adapters/BluettiBluAdapter';

// ── Bluetti Constants ───────────────────────────────────────────────────
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
} from './BluettiConstants';

export type { BluettiModelSpec } from './BluettiConstants';

// ── Adapters — Anker SOLIX (Phase 3A) ───────────────────────────────────
export { ankerSolixBluAdapter } from './adapters/AnkerSolixBluAdapter';
export type {
  AnkerSolixConnectResult,
  AnkerSolixPollResult,
  AnkerSolixAdapterState,
  AnkerSolixDiscoveredDevice,
} from './adapters/AnkerSolixBluAdapter';

// ── Anker SOLIX Constants ───────────────────────────────────────────────
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
} from './AnkerSolixConstants';

export type { AnkerSolixModelSpec } from './AnkerSolixConstants';

// ── Adapters — Jackery (Phase 4A) ───────────────────────────────────────
export { jackeryBluAdapter } from './adapters/JackeryBluAdapter';
export type {
  JackeryConnectResult,
  JackeryPollResult,
  JackeryAdapterState,
  JackeryDiscoveredDevice,
} from './adapters/JackeryBluAdapter';

// ── Jackery Constants ───────────────────────────────────────────────────
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
} from './JackeryConstants';

export type { JackeryModelSpec } from './JackeryConstants';

// ── Adapters — Goal Zero (Phase 5A) ────────────────────────────────────
export { goalZeroBluAdapter } from './adapters/GoalZeroBluAdapter';
export type {
  GoalZeroConnectResult,
  GoalZeroPollResult,
  GoalZeroAdapterState,
  GoalZeroDiscoveredDevice,
} from './adapters/GoalZeroBluAdapter';

// ── Goal Zero Constants ─────────────────────────────────────────────────
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
} from './GoalZeroConstants';

export type { GoalZeroModelSpec } from './GoalZeroConstants';

// ── Adapters — Renogy (Phase 6A) ───────────────────────────────────────
export { renogyBluAdapter } from './adapters/RenogyBluAdapter';
export type {
  RenogyConnectResult,
  RenogyPollResult,
  RenogyAdapterState,
  RenogyDiscoveredDevice,
} from './adapters/RenogyBluAdapter';

// ── Renogy Constants ────────────────────────────────────────────────────
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
} from './RenogyConstants';

export type { RenogyModelSpec, RenogyDeviceCategory } from './RenogyConstants';

