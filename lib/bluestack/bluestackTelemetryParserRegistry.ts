import {
  getBluestackProviderLabel,
  normalizeBluestackProvider,
} from './bluestackClassifier';
import type {
  BluestackDeviceCategory,
  BluestackProvider,
  BluestackTelemetryDomain,
  BluestackTransport,
} from './bluestackTypes';

export type BluestackParserVerificationStatus =
  | 'cloud_live'
  | 'native_live'
  | 'native_parser_pending'
  | 'profile_only';

export type BluestackParserDecisionAction =
  | 'use_ecoflow_cloud'
  | 'use_native_power_adapter'
  | 'use_obd2_vehicle_adapter'
  | 'link_utility_profile'
  | 'block_pending_parser'
  | 'profile_only';

export interface BluestackTelemetryParserProfile {
  provider: BluestackProvider;
  displayName: string;
  parserId: string;
  category: BluestackDeviceCategory;
  domain: BluestackTelemetryDomain;
  transport: BluestackTransport;
  status: BluestackParserVerificationStatus;
  decisionAction: BluestackParserDecisionAction;
  canDecodeLiveTelemetry: boolean;
  canAttemptLiveConnection: boolean;
  requiresFieldEvidence: boolean;
  requiredEvidence: string[];
  notes: string;
}

export interface BluestackParserDecision {
  provider: BluestackProvider;
  displayName: string;
  parserId: string;
  action: BluestackParserDecisionAction;
  status: BluestackParserVerificationStatus;
  canDecodeLiveTelemetry: boolean;
  canAttemptLiveConnection: boolean;
  reason: string;
  requiredEvidence: string[];
}

const FIELD_EVIDENCE_REQUIREMENTS = [
  'native build/device model captured',
  'advertisement evidence captured without raw payloads',
  'handshake captured',
  'decoded telemetry fields verified',
  'disconnect and stale behavior verified',
];

const UTILITY_EVIDENCE_REQUIREMENTS = [
  'native build/device model captured',
  'utility sensor profile identified',
  'level units verified against provider app or physical reading',
  'disconnect and stale behavior verified',
];

const PARSER_PROFILES: Partial<Record<BluestackProvider, Omit<BluestackTelemetryParserProfile, 'provider' | 'displayName'>>> = {
  ecoflow: {
    parserId: 'ecoflow_cloud_api',
    category: 'power_device',
    domain: 'power',
    transport: 'cloud',
    status: 'cloud_live',
    decisionAction: 'use_ecoflow_cloud',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: false,
    requiredEvidence: ['EcoFlow Edge Function credentials and authorized device/account'],
    notes: 'EcoFlow release telemetry is cloud/API mediated through Supabase. This does not prove local Bluetooth support.',
  },
  generic_obd2: {
    parserId: 'generic_obd2_vehicle_adapter',
    category: 'obd2',
    domain: 'vehicle',
    transport: 'classic_bluetooth',
    status: 'native_live',
    decisionAction: 'use_obd2_vehicle_adapter',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: true,
    requiredEvidence: ['ELM327/OBD handshake', 'PID frames with vehicle running', 'disconnect clears or ages telemetry'],
    notes: 'OBD2 live state is handled by the vehicle telemetry adapter, not a power-device parser.',
  },
  propane_monitor: {
    parserId: 'propane_utility_native_ble_live',
    category: 'propane_monitor',
    domain: 'propane',
    transport: 'ble',
    status: 'native_live',
    decisionAction: 'link_utility_profile',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: false,
    requiredEvidence: UTILITY_EVIDENCE_REQUIREMENTS,
    notes: 'Propane monitors can attempt native BLE live tank telemetry. ECS only promotes the sensor when a decoded level percentage is received.',
  },
  mopeka: {
    parserId: 'mopeka_propane_monitor_native_ble_live',
    category: 'propane_monitor',
    domain: 'propane',
    transport: 'ble',
    status: 'native_live',
    decisionAction: 'link_utility_profile',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: false,
    requiredEvidence: UTILITY_EVIDENCE_REQUIREMENTS,
    notes: 'Mopeka propane profiles can attempt native BLE live tank telemetry. ECS only promotes the sensor when a decoded level percentage is received.',
  },
  water_monitor: {
    parserId: 'water_utility_native_ble_live',
    category: 'water_tank_monitor',
    domain: 'water',
    transport: 'ble',
    status: 'native_live',
    decisionAction: 'link_utility_profile',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: false,
    requiredEvidence: UTILITY_EVIDENCE_REQUIREMENTS,
    notes: 'Water and fluid monitors can attempt native BLE live tank telemetry. ECS only promotes the sensor when a decoded level percentage is received.',
  },
  seelevel: {
    parserId: 'seelevel_water_monitor_native_ble_live',
    category: 'water_tank_monitor',
    domain: 'water',
    transport: 'ble',
    status: 'native_live',
    decisionAction: 'link_utility_profile',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: false,
    requiredEvidence: UTILITY_EVIDENCE_REQUIREMENTS,
    notes: 'SeeLevel water profiles can attempt native BLE live tank telemetry. ECS only promotes the sensor when a decoded level percentage is received.',
  },
};

const NATIVE_POWER_LIVE_PROVIDERS: BluestackProvider[] = [
  'bluetti',
  'anker_solix',
  'anker',
  'jackery',
  'goal_zero',
  'goalzero',
  'renogy',
  'redarc',
  'dakota_lithium',
  'victron',
];

for (const provider of NATIVE_POWER_LIVE_PROVIDERS) {
  PARSER_PROFILES[provider] = {
    parserId: `${provider}_native_ble_live`,
    category: 'power_device',
    domain: 'power',
    transport: 'ble',
    status: 'native_live',
    decisionAction: 'use_native_power_adapter',
    canDecodeLiveTelemetry: true,
    canAttemptLiveConnection: true,
    requiresFieldEvidence: false,
    requiredEvidence: ['native BLE readable power telemetry fields'],
    notes: `${getBluestackProviderLabel(provider)} can attempt native BLE live telemetry. ECS only promotes the session when decoded power fields are received from hardware.`,
  };
}

const NATIVE_POWER_PENDING_PROVIDERS: BluestackProvider[] = [
  'unknown_power',
];

for (const provider of NATIVE_POWER_PENDING_PROVIDERS) {
  PARSER_PROFILES[provider] = {
    parserId: `${provider}_native_ble_pending`,
    category: 'power_device',
    domain: 'power',
    transport: 'ble',
    status: provider === 'unknown_power' ? 'profile_only' : 'native_parser_pending',
    decisionAction: provider === 'unknown_power' ? 'profile_only' : 'block_pending_parser',
    canDecodeLiveTelemetry: false,
    canAttemptLiveConnection: false,
    requiresFieldEvidence: provider !== 'unknown_power',
    requiredEvidence: provider === 'unknown_power' ? [] : FIELD_EVIDENCE_REQUIREMENTS,
    notes: provider === 'unknown_power'
      ? 'Bluestack can classify this as a possible power device, but ECS has no release parser profile yet.'
      : `${getBluestackProviderLabel(provider)} advertisements are recognized, but live telemetry is blocked until field-verified native BLE parser evidence exists.`,
  };
}

const PROFILE_ONLY: Omit<BluestackTelemetryParserProfile, 'provider' | 'displayName'> = {
  parserId: 'profile_only',
  category: 'unknown_supported',
  domain: 'generic',
  transport: 'unknown',
  status: 'profile_only',
  decisionAction: 'profile_only',
  canDecodeLiveTelemetry: false,
  canAttemptLiveConnection: false,
  requiresFieldEvidence: false,
  requiredEvidence: [],
  notes: 'Bluestack can classify this device family, but ECS has no release telemetry parser for it yet.',
};

export function getBluestackTelemetryParserProfile(provider: unknown): BluestackTelemetryParserProfile {
  const normalized = normalizeBluestackProvider(provider);
  const profile = PARSER_PROFILES[normalized] ?? PROFILE_ONLY;
  return {
    provider: normalized,
    displayName: getBluestackProviderLabel(normalized),
    ...profile,
  };
}

export function getBluestackParserDecision(provider: unknown): BluestackParserDecision {
  const profile = getBluestackTelemetryParserProfile(provider);
  return {
    provider: profile.provider,
    displayName: profile.displayName,
    parserId: profile.parserId,
    action: profile.decisionAction,
    status: profile.status,
    canDecodeLiveTelemetry: profile.canDecodeLiveTelemetry,
    canAttemptLiveConnection: profile.canAttemptLiveConnection,
    reason: profile.notes,
    requiredEvidence: [...profile.requiredEvidence],
  };
}

export function canPromoteBluestackTelemetry(provider: unknown): boolean {
  return getBluestackTelemetryParserProfile(provider).canDecodeLiveTelemetry;
}
