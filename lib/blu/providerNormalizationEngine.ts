import type { BluAuthoritySnapshot, PowerFreshnessLabel } from '../BluPowerAuthority';
import type { BluProviderId } from '../BluTypes';
import { ecsProviderRegistry } from '../EcsProviderRegistry';
import { getTelemetryFreshness } from '../EcsProviderDiagnostics';
import type { EcsNormalizedReading, EcsProviderLifecycleState } from '../IEcsPowerProvider';
import { getManagedPowerSnapshot } from '../telemetryStore';
import { getProviderCapabilityProfile } from './providerCapabilityProfiles';
import type {
  ECSNormalizedProviderFreshness,
  ECSNormalizedProviderResult,
  ECSNormalizedProviderState,
  ECSProviderMetricCoverage,
  ECSProviderSourcePrecedence,
  ECSProviderSupportType,
} from './providerNormalizationTypes';

type ProviderNormalizationInput = {
  expeditionId?: string | null;
  authoritySnapshot?: BluAuthoritySnapshot | null;
  telemetryConfig?: {
    powerConfigured?: boolean | null;
    powerCapacityWh?: number | null;
    powerRemainingWh?: number | null;
    powerAvgDrawW?: number | null;
  } | null;
  manualBaselineAvailable?: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toProviderId(value: unknown): BluProviderId | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'ecoflow':
    case 'bluetti':
    case 'anker_solix':
    case 'jackery':
    case 'goal_zero':
    case 'renogy':
    case 'redarc':
    case 'dakota_lithium':
    case 'victron':
      return normalized;
    default:
      return null;
  }
}

function freshnessFromAuthority(value: PowerFreshnessLabel | null | undefined): ECSNormalizedProviderFreshness {
  switch (value) {
    case 'live':
      return 'current';
    case 'reconnecting':
      return 'recent';
    case 'stale':
    case 'last_known':
    case 'disconnected':
      return 'stale';
    default:
      return 'unknown';
  }
}

function freshnessFromReading(lastUpdated: number | null | undefined): ECSNormalizedProviderFreshness {
  switch (getTelemetryFreshness(lastUpdated ?? null)) {
    case 'live':
      return 'current';
    case 'aging':
      return 'recent';
    case 'stale':
    case 'expired':
      return 'stale';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function chooseFreshest(
  left: ECSNormalizedProviderFreshness,
  right: ECSNormalizedProviderFreshness,
): ECSNormalizedProviderFreshness {
  const order: ECSNormalizedProviderFreshness[] = ['unknown', 'stale', 'recent', 'current'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function resolveSupportType(
  profileType: ECSProviderSupportType,
  transportType: string | null | undefined,
  connectionMethod: string | null | undefined,
): ECSProviderSupportType {
  const transport = String(transportType ?? '').trim().toLowerCase();
  const connection = String(connectionMethod ?? '').trim().toLowerCase();

  if (transport === 'ble' || connection.includes('ble') || connection.includes('bluetooth')) return 'ble';
  if (transport === 'cloud' || connection.includes('cloud')) return 'cloud';
  if (transport === 'hybrid') return 'hybrid';
  if (transport === 'wifi' || connection.includes('wifi')) return 'wifi';
  return profileType;
}

function choosePrimaryReading(readings: EcsNormalizedReading[]): EcsNormalizedReading | null {
  if (!readings.length) return null;
  const ranked = [...readings].sort((left, right) => {
    if (Number(right.isPrimary) !== Number(left.isPrimary)) {
      return Number(right.isPrimary) - Number(left.isPrimary);
    }
    if (Number(right.isDisconnected) !== Number(left.isDisconnected)) {
      return Number(left.isDisconnected) - Number(right.isDisconnected);
    }
    return (right.lastUpdated ?? 0) - (left.lastUpdated ?? 0);
  });
  return ranked[0] ?? null;
}

function buildMetricCoverage(params: {
  reading: EcsNormalizedReading | null;
  authoritySnapshot: BluAuthoritySnapshot | null | undefined;
  managedSnapshot: ReturnType<typeof getManagedPowerSnapshot>;
  telemetryConfig: ProviderNormalizationInput['telemetryConfig'];
  fallback: ECSProviderMetricCoverage;
}): ECSProviderMetricCoverage {
  const { reading, authoritySnapshot, managedSnapshot, telemetryConfig, fallback } = params;

  return {
    stateOfCharge:
      fallback.stateOfCharge &&
      (
        isFiniteNumber(reading?.batteryPercent)
        || isFiniteNumber(authoritySnapshot?.batteryPercent)
        || isFiniteNumber(managedSnapshot?.batterySocPercent)
      ),
    inputPower:
      fallback.inputPower &&
      (
        isFiniteNumber(reading?.inputWatts)
        || isFiniteNumber(authoritySnapshot?.inputWatts)
        || isFiniteNumber(managedSnapshot?.wattsIn)
      ),
    outputPower:
      fallback.outputPower &&
      (
        isFiniteNumber(reading?.outputWatts)
        || isFiniteNumber(authoritySnapshot?.outputWatts)
        || isFiniteNumber(managedSnapshot?.wattsOut)
        || isFiniteNumber(managedSnapshot?.avgDrawWatts)
      ),
    runtime:
      fallback.runtime &&
      (
        isFiniteNumber(reading?.estimatedRuntimeMinutes)
        || isFiniteNumber(authoritySnapshot?.estimatedRuntimeMinutes)
        || isFiniteNumber(managedSnapshot?.estimatedRuntimeHours)
      ),
    capacity:
      fallback.capacity &&
      (
        isFiniteNumber(reading?.capacityWh)
        || isFiniteNumber(authoritySnapshot?.capacityWh)
        || isFiniteNumber(managedSnapshot?.batteryCapacityWh)
        || isFiniteNumber(telemetryConfig?.powerCapacityWh)
      ),
  };
}

function determineLegacyState(args: {
  state: ECSNormalizedProviderState;
  source: ECSProviderSourcePrecedence;
  degraded: boolean;
}): ECSNormalizedProviderResult['legacyTelemetryState'] {
  if (args.state === 'live_provider_connected') return 'LIVE';
  if (args.state === 'manual_baseline') return 'PARTIAL';
  if (args.state === 'cloud_backed' && !args.degraded) return 'PARTIAL';
  if (args.state === 'waiting_for_provider') return 'PARTIAL';
  if (args.source === 'unavailable' || args.state === 'unsupported') return 'ATTENTION';
  return 'ATTENTION';
}

function labelForState(state: ECSNormalizedProviderState): string {
  switch (state) {
    case 'live_provider_connected':
      return 'Live provider telemetry';
    case 'waiting_for_provider':
      return 'Waiting for provider';
    case 'temporarily_disconnected':
      return 'Provider connection reduced';
    case 'stale_but_usable':
      return 'Provider state stale';
    case 'cloud_backed':
      return 'Cloud-backed provider data';
    case 'manual_baseline':
      return 'Manual baseline active';
    case 'unsupported':
      return 'Provider unsupported';
    case 'unavailable':
    default:
      return 'Provider unavailable';
  }
}

function sourceLabelFor(source: ECSProviderSourcePrecedence): string {
  switch (source) {
    case 'live_provider':
      return 'Live provider telemetry';
    case 'cloud_sync':
      return 'Provider cloud sync';
    case 'stored_provider_state':
      return 'Stored provider state';
    case 'manual_baseline':
      return 'Manual baseline';
    case 'inferred_estimate':
      return 'Inferred estimate';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

function summaryForState(args: {
  state: ECSNormalizedProviderState;
  source: ECSProviderSourcePrecedence;
  supportType: ECSProviderSupportType;
  degraded: boolean;
  providerLabel: string | null;
  manualBaselineAvailable: boolean;
  freshness: ECSNormalizedProviderFreshness;
}): string {
  const provider = args.providerLabel ?? 'provider';

  switch (args.state) {
    case 'live_provider_connected':
      return `Power status is live from connected ${provider} telemetry.`;
    case 'cloud_backed':
      return args.freshness === 'stale'
        ? `${provider} cloud support is stale; values remain usable as an estimate.`
        : `${provider} values are backed by cloud sync and should be treated as estimated, not live.`;
    case 'waiting_for_provider':
      return args.manualBaselineAvailable
        ? `Waiting for ${provider} reconnection; the last usable baseline remains available.`
        : `Waiting for ${provider} telemetry before live power status can resume.`;
    case 'temporarily_disconnected':
      return args.manualBaselineAvailable
        ? `Live ${provider} connection is unavailable; ECS is holding to the last usable baseline.`
        : `Live ${provider} connection is unavailable and no stable fallback is currently confirmed.`;
    case 'stale_but_usable':
      return `Provider confidence is limited because ${provider} data is stale or recently disconnected.`;
    case 'manual_baseline':
      return 'Live provider connection is unavailable; values are based on stored baseline.';
    case 'unsupported':
      return `${provider} is not yet fully supported by the normalized ECS provider layer.`;
    case 'unavailable':
    default:
      return 'No provider telemetry or manual baseline is currently available.';
  }
}

function explanationForState(args: {
  state: ECSNormalizedProviderState;
  source: ECSProviderSourcePrecedence;
  freshness: ECSNormalizedProviderFreshness;
  providerLabel: string | null;
  manualBaselineAvailable: boolean;
}): string | null {
  if (args.state === 'live_provider_connected') {
    return 'Power status is live from connected provider telemetry.';
  }
  if (args.state === 'manual_baseline') {
    return 'Live provider connection is unavailable; values are based on stored baseline.';
  }
  if (args.state === 'cloud_backed') {
    return args.freshness === 'stale'
      ? 'Provider confidence is limited due to stale cloud support.'
      : 'Provider-backed values are synced from cloud support.';
  }
  if (args.state === 'waiting_for_provider') {
    return args.manualBaselineAvailable
      ? 'Waiting for provider reconnection; last usable baseline remains available.'
      : 'Waiting for provider reconnection.';
  }
  if (args.state === 'temporarily_disconnected' || args.state === 'stale_but_usable') {
    return 'Provider confidence is limited due to stale or disconnected support.';
  }
  return null;
}

export function normalizeBluProviderState(
  input: ProviderNormalizationInput,
): ECSNormalizedProviderResult | null {
  const authoritySnapshot = input.authoritySnapshot ?? null;
  const managedSnapshot = getManagedPowerSnapshot(input.expeditionId);
  const readings = ecsProviderRegistry.getAllLatestReadings();
  const systemState = ecsProviderRegistry.getSystemPowerState();
  const diagnostics = ecsProviderRegistry.getAllDiagnostics();

  const primaryReading = choosePrimaryReading(readings);
  const providerId =
    primaryReading?.provider
    ?? toProviderId(authoritySnapshot?.activeProvider)
    ?? toProviderId(managedSnapshot?.provider)
    ?? null;
  const profile = getProviderCapabilityProfile(providerId);
  const provider = providerId ? ecsProviderRegistry.getProvider(providerId) : null;
  const supportType = resolveSupportType(
    profile?.supportType ?? 'unknown',
    provider?.transportType ?? null,
    managedSnapshot?.connectionMethod ?? null,
  );
  const manualBaselineAvailable = !!(
    input.manualBaselineAvailable
    || input.telemetryConfig?.powerConfigured
    || isFiniteNumber(input.telemetryConfig?.powerCapacityWh)
    || isFiniteNumber(input.telemetryConfig?.powerRemainingWh)
  );
  const providerDiagnostics = providerId
    ? diagnostics.find((entry) => entry.providerId === providerId) ?? null
    : null;
  const providerLifecycle =
    providerDiagnostics?.lifecycleState
    ?? (providerId ? systemState.providerStates.get(providerId) : null)
    ?? null;
  const authorityProviderState =
    providerId && authoritySnapshot?.providers
      ? authoritySnapshot.providers[providerId as keyof typeof authoritySnapshot.providers] ?? null
      : null;
  const lifecycleWaiting =
    providerLifecycle === 'connecting'
    || providerLifecycle === 'authenticating'
    || providerLifecycle === 'scanning'
    || providerLifecycle === 'reconnecting';
  const lifecycleDisconnected =
    providerLifecycle === 'disconnected'
    || providerLifecycle === 'error'
    || providerLifecycle === 'suspended';
  const authorityWaiting =
    authoritySnapshot?.freshness === 'reconnecting'
    || authorityProviderState?.freshness === 'reconnecting';
  const authorityDisconnected =
    authoritySnapshot?.freshness === 'disconnected'
    || authorityProviderState?.freshness === 'disconnected';
  const managedWaiting =
    managedSnapshot?.connectionState === 'reconnecting';
  const managedDisconnected =
    managedSnapshot?.connectionState === 'disconnected'
    || managedSnapshot?.connectionState === 'unavailable';

  const readingFreshness = freshnessFromReading(primaryReading?.lastUpdated ?? null);
  const authorityFreshness = freshnessFromAuthority(authoritySnapshot?.freshness ?? null);
  const managedFreshness =
    managedSnapshot == null
      ? 'unknown'
      : managedSnapshot.isStale
        ? 'stale'
        : managedSnapshot.lastSeenAt
          ? 'recent'
          : 'unknown';
  const freshness = chooseFreshest(
    chooseFreshest(readingFreshness, authorityFreshness),
    managedFreshness,
  );

  const hasFreshReading = !!primaryReading && readingFreshness !== 'stale' && !primaryReading.isDisconnected;
  const hasAuthorityData = !!authoritySnapshot && (!!authoritySnapshot.hasPowerData || !!authoritySnapshot.primaryDevice);
  const hasProviderData = !!(
    hasFreshReading
    || hasAuthorityData
    || managedSnapshot
  );

  const waiting = lifecycleWaiting || authorityWaiting || managedWaiting;
  const disconnected = lifecycleDisconnected || authorityDisconnected || managedDisconnected;
  const repeatedDisconnects = !!(
    systemState.isReconnecting
    || (providerDiagnostics?.reconnectAttemptsSinceStable ?? 0) >= 2
  );

  let source: ECSProviderSourcePrecedence = 'unavailable';
  if (hasFreshReading || (authoritySnapshot?.freshness === 'live' && supportType !== 'cloud')) {
    source = supportType === 'cloud' ? 'cloud_sync' : 'live_provider';
  } else if (
    hasProviderData &&
    (
      supportType === 'cloud'
      || profile?.cloudFallbackEligible
    ) &&
    freshness !== 'unknown'
  ) {
    source = 'cloud_sync';
  } else if (hasProviderData) {
    source = 'stored_provider_state';
  } else if (manualBaselineAvailable) {
    source = 'manual_baseline';
  }

  let state: ECSNormalizedProviderState;
  if (source === 'live_provider') {
    state = 'live_provider_connected';
  } else if (waiting && (hasProviderData || manualBaselineAvailable)) {
    state = 'waiting_for_provider';
  } else if (disconnected && (hasProviderData || manualBaselineAvailable)) {
    state = 'temporarily_disconnected';
  } else if (source === 'cloud_sync') {
    state = freshness === 'stale' ? 'stale_but_usable' : 'cloud_backed';
  } else if (source === 'stored_provider_state') {
    state = 'stale_but_usable';
  } else if (source === 'manual_baseline') {
    state = 'manual_baseline';
  } else if (providerId && profile?.providerVerificationStatus === 'planned') {
    state = 'unsupported';
  } else {
    state = 'unavailable';
  }

  const degraded =
    state === 'temporarily_disconnected'
    || state === 'stale_but_usable'
    || state === 'waiting_for_provider'
    || (state === 'cloud_backed' && freshness !== 'current')
    || repeatedDisconnects
    || profile?.providerVerificationStatus === 'limited';
  const usable =
    state !== 'unsupported'
    && state !== 'unavailable'
    && (hasProviderData || manualBaselineAvailable);
  const available = hasProviderData || manualBaselineAvailable || state === 'unsupported';

  const metricCoverage = buildMetricCoverage({
    reading: primaryReading,
    authoritySnapshot,
    managedSnapshot,
    telemetryConfig: input.telemetryConfig ?? null,
    fallback: profile?.metricCoverage ?? {
      stateOfCharge: false,
      inputPower: false,
      outputPower: false,
      runtime: false,
      capacity: false,
    },
  });

  const providerLabel =
    profile?.providerLabel
    ?? primaryReading?.providerDisplayName
    ?? authoritySnapshot?.providerLabel
    ?? null;
  const deviceLabel =
    primaryReading?.deviceName
    ?? managedSnapshot?.label
    ?? authoritySnapshot?.deviceLabel
    ?? null;
  const lastUpdatedAt =
    primaryReading?.lastUpdated
    ?? authoritySnapshot?.lastUpdatedAt
    ?? (managedSnapshot?.lastSeenAt ? new Date(managedSnapshot.lastSeenAt).getTime() : null);

  return {
    available,
    usable,
    state,
    label: labelForState(state),
    summary: summaryForState({
      state,
      source,
      supportType,
      degraded,
      providerLabel,
      manualBaselineAvailable,
      freshness,
    }),
    explanation: explanationForState({
      state,
      source,
      freshness,
      providerLabel,
      manualBaselineAvailable,
    }),
    source,
    sourceLabel: sourceLabelFor(source),
    freshness,
    supportType,
    providerId,
    providerLabel,
    providerVerificationStatus: profile?.providerVerificationStatus ?? 'unknown',
    deviceLabel,
    lastUpdatedAt,
    manualBaselineAvailable,
    waiting,
    degraded,
    repeatedDisconnects,
    metricCoverage,
    legacyTelemetryState: determineLegacyState({ state, source, degraded }),
  };
}
