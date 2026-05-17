import {
  PROVIDER_DISPLAY,
  type ConnectionMethod,
  type ConnectionState,
  type PowerProviderId,
  type ProviderSupportLevel,
} from './powerSetupStore';

export type PowerReadinessState = 'connected' | 'partial' | 'manual' | 'unavailable';

export interface PowerReadinessMeta {
  state: PowerReadinessState;
  label: string;
  color: string;
  icon: string;
  summary: string;
  detail: string;
}

export const BLU_PROVIDER_TO_POWER_PROVIDER: Record<string, PowerProviderId> = {
  ecoflow: 'EcoFlow',
  bluetti: 'Bluetti',
  anker_solix: 'AnkerSolix',
  jackery: 'Jackery',
  goal_zero: 'GoalZero',
  renogy: 'Renogy',
  redarc: 'Redarc',
  dakota_lithium: 'DakotaLithium',
};

const POWER_READINESS_META: Record<PowerReadinessState, Omit<PowerReadinessMeta, 'state'>> = {
  connected: {
    label: 'CONNECTED',
    color: '#34C759',
    icon: 'checkmark-circle-outline',
    summary: 'Verified live telemetry is active.',
    detail: 'ECS is reading a verified live provider path and can present current power state.',
  },
  partial: {
    label: 'PARTIAL',
    color: '#FFB300',
    icon: 'warning-outline',
    summary: 'Provider data is limited, reconnecting, or last-known.',
    detail: 'ECS has a limited provider path, a reconnecting session, or last-known telemetry that should not be treated as fully live.',
  },
  manual: {
    label: 'MANUAL',
    color: '#C48A2C',
    icon: 'create-outline',
    summary: 'Using saved manual or vehicle power values.',
    detail: 'ECS is relying on manual setup values or the saved vehicle power profile instead of a live provider feed.',
  },
  unavailable: {
    label: 'UNAVAILABLE',
    color: '#8B949E',
    icon: 'remove-circle-outline',
    summary: 'No dependable live or manual power state is available.',
    detail: 'ECS cannot confirm a dependable live provider session and has no manual fallback to show instead.',
  },
};

export function getPowerReadinessMeta(state: PowerReadinessState): PowerReadinessMeta {
  return {
    state,
    ...POWER_READINESS_META[state],
  };
}

export function getProviderSupportLevel(providerId: PowerProviderId): ProviderSupportLevel {
  return PROVIDER_DISPLAY[providerId].supportLevel;
}

export function resolveProviderReadiness(providerId: PowerProviderId): PowerReadinessMeta {
  const supportLevel = getProviderSupportLevel(providerId);
  if (supportLevel === 'verified') return getPowerReadinessMeta('connected');
  if (supportLevel === 'partial' || supportLevel === 'implemented_unverified') {
    return getPowerReadinessMeta('partial');
  }
  return getPowerReadinessMeta('unavailable');
}

export function resolvePowerReadiness(params: {
  providerId?: PowerProviderId | null;
  supportLevel?: ProviderSupportLevel | null;
  connectionMethod?: ConnectionMethod | null;
  connectionState?: ConnectionState | 'scanning' | 'connecting' | 'live' | 'degraded' | 'offline' | null;
  hasTelemetry?: boolean;
  hasStoredSnapshot?: boolean;
  isManualFallback?: boolean;
}): PowerReadinessMeta {
  const {
    providerId = null,
    supportLevel = providerId ? getProviderSupportLevel(providerId) : null,
    connectionMethod = null,
    connectionState = null,
    hasTelemetry = false,
    hasStoredSnapshot = false,
    isManualFallback = false,
  } = params;

  if (isManualFallback || connectionMethod === 'manual') {
    return getPowerReadinessMeta('manual');
  }

  if (supportLevel === 'ui_only') {
    return getPowerReadinessMeta('unavailable');
  }

  if (
    (connectionState === 'connected' || connectionState === 'live') &&
    supportLevel === 'verified' &&
    hasTelemetry
  ) {
    return getPowerReadinessMeta('connected');
  }

  if (
    connectionState === 'reconnecting' ||
    connectionState === 'connecting' ||
    connectionState === 'scanning' ||
    connectionState === 'degraded' ||
    connectionState === 'offline' ||
    connectionState === 'disconnected' ||
    connectionState === 'unavailable' ||
    connectionState === 'connected' ||
    supportLevel === 'partial' ||
    supportLevel === 'implemented_unverified' ||
    hasTelemetry ||
    hasStoredSnapshot
  ) {
    return getPowerReadinessMeta('partial');
  }

  return getPowerReadinessMeta('unavailable');
}
