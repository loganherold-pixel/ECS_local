import {
  getBluestackProviderLabel,
  normalizeBluestackProvider,
} from './bluestackClassifier';
import type { BluestackParserDecisionAction } from './bluestackTelemetryParserRegistry';
import { getBluestackTelemetryParserProfile } from './bluestackTelemetryParserRegistry';
import type { BluestackProvider } from './bluestackTypes';

export type BluestackProviderReadinessStage =
  | 'live_ready'
  | 'cloud_credentials_required'
  | 'native_parser_pending'
  | 'field_verification_required'
  | 'profile_only';

export interface BluestackProviderReadiness {
  provider: BluestackProvider;
  displayName: string;
  stage: BluestackProviderReadinessStage;
  statusLabel: string;
  statusDetail: string;
  telemetryTruthLabel: string;
  connectionPath: 'cloud' | 'native_ble' | 'hybrid' | 'profile';
  requiresNativeBuild: boolean;
  requiredSecretNames: string[];
  canAttemptConnection: boolean;
  parserId: string;
  parserDecisionAction: BluestackParserDecisionAction;
}

type BluestackProviderReadinessBase = Omit<
  BluestackProviderReadiness,
  'provider' | 'displayName' | 'parserId' | 'parserDecisionAction'
>;

const READINESS_BY_PROVIDER: Partial<Record<BluestackProvider, BluestackProviderReadinessBase>> = {
  ecoflow: {
    stage: 'cloud_credentials_required',
    statusLabel: 'EcoFlow cloud/API',
    statusDetail: 'EcoFlow is the release-ready cloud/API path. ECS reads provider telemetry through Supabase Edge Functions when EcoFlow credentials authorize the account and device.',
    telemetryTruthLabel: 'Cloud/API telemetry',
    connectionPath: 'hybrid',
    requiresNativeBuild: false,
    requiredSecretNames: ['ECOFLOW_ACCESS_KEY', 'ECOFLOW_SECRET_KEY'],
    canAttemptConnection: true,
  },
  bluetti: {
    stage: 'live_ready',
    statusLabel: 'BLUETTI native BLE',
    statusDetail: 'BLUETTI and Blue Eddy devices can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  anker_solix: {
    stage: 'live_ready',
    statusLabel: 'Anker SOLIX native BLE',
    statusDetail: 'Anker SOLIX devices can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  anker: {
    stage: 'live_ready',
    statusLabel: 'Anker SOLIX native BLE',
    statusDetail: 'Anker/SOLIX devices can attempt native BLE live telemetry. ECS promotes readings only after decoded hardware power fields arrive.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  jackery: {
    stage: 'live_ready',
    statusLabel: 'Jackery native BLE',
    statusDetail: 'Jackery devices can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  goal_zero: {
    stage: 'live_ready',
    statusLabel: 'Goal Zero native BLE',
    statusDetail: 'Goal Zero Yeti devices can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  goalzero: {
    stage: 'live_ready',
    statusLabel: 'Goal Zero native BLE',
    statusDetail: 'Goal Zero Yeti devices can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  renogy: {
    stage: 'live_ready',
    statusLabel: 'Renogy native BLE',
    statusDetail: 'Renogy power controllers and battery monitors can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  redarc: {
    stage: 'live_ready',
    statusLabel: 'REDARC native BLE',
    statusDetail: 'REDARC vehicle power controllers can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  dakota_lithium: {
    stage: 'live_ready',
    statusLabel: 'Dakota Lithium native BLE',
    statusDetail: 'Dakota Lithium battery monitors can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  victron: {
    stage: 'live_ready',
    statusLabel: 'Victron native BLE',
    statusDetail: 'Victron SmartShunt, BMV, SmartSolar, and Blue Smart devices can attempt native BLE live telemetry. ECS promotes the session only after decoded power fields arrive from hardware.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  generic_obd2: {
    stage: 'live_ready',
    statusLabel: 'OBD2 telemetry path',
    statusDetail: 'OBD2 adapters use the vehicle telemetry path. Native Bluetooth support is required for live vehicle data.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  propane_monitor: {
    stage: 'live_ready',
    statusLabel: 'Propane native BLE',
    statusDetail: 'Propane monitor profiles can link over native BLE. ECS promotes the tank sensor only after a decoded level percentage is received.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  mopeka: {
    stage: 'live_ready',
    statusLabel: 'Mopeka native BLE',
    statusDetail: 'Mopeka propane monitors can link over native BLE. ECS promotes the tank sensor only after a decoded level percentage is received.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  water_monitor: {
    stage: 'live_ready',
    statusLabel: 'Water native BLE',
    statusDetail: 'Water and fluid monitor profiles can link over native BLE. ECS promotes the tank sensor only after a decoded level percentage is received.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
  seelevel: {
    stage: 'live_ready',
    statusLabel: 'SeeLevel native BLE',
    statusDetail: 'SeeLevel water monitors can link over native BLE. ECS promotes the tank sensor only after a decoded level percentage is received.',
    telemetryTruthLabel: 'Native Bluetooth telemetry',
    connectionPath: 'native_ble',
    requiresNativeBuild: true,
    requiredSecretNames: [],
    canAttemptConnection: true,
  },
};

const PROFILE_ONLY: BluestackProviderReadinessBase = {
  stage: 'profile_only',
  statusLabel: 'Profile only',
  statusDetail: 'Bluestack can classify this device family, but ECS does not have a release-ready telemetry path for it yet.',
  telemetryTruthLabel: 'No live telemetry path',
  connectionPath: 'profile',
  requiresNativeBuild: false,
  requiredSecretNames: [],
  canAttemptConnection: false,
};

export function getBluestackProviderReadiness(provider: unknown): BluestackProviderReadiness {
  const normalized = normalizeBluestackProvider(provider);
  const readiness = READINESS_BY_PROVIDER[normalized] ?? PROFILE_ONLY;
  const parserProfile = getBluestackTelemetryParserProfile(normalized);
  return {
    provider: normalized,
    displayName: getBluestackProviderLabel(normalized),
    ...readiness,
    parserId: parserProfile.parserId,
    parserDecisionAction: parserProfile.decisionAction,
  };
}
