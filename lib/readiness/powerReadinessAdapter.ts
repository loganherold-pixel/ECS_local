import type { ManagedPowerDevice } from '../powerSetupStore';
import type { EcsPowerIntelligenceSnapshot } from '../powerIntelligence';
import type {
  ExpeditionPowerDataFreshness,
  ExpeditionPowerRuntimeSource,
  ExpeditionReadinessInput,
  ExpeditionReadinessPowerInput,
  ExpeditionReadinessRouteInput,
} from './expeditionReadinessTypes';

function isRemoteRoute(route: ExpeditionReadinessRouteInput | null | undefined, offline: ExpeditionReadinessInput['offline']): boolean {
  if (offline?.isRemoteRoute === true) return true;
  if (route?.riskLevel === 'critical' || route?.riskLevel === 'high') return true;
  if (route?.difficulty === 'technical' || route?.difficulty === 'hard') return true;
  if (typeof route?.distanceMiles === 'number' && route.distanceMiles >= 40) return true;
  return false;
}

function hasCampOrOvernightContext(input: Pick<ExpeditionReadinessInput, 'campCandidates' | 'plannedDepartureAt' | 'daylight'>): boolean {
  if ((input.campCandidates?.length ?? 0) > 0) return true;
  if (input.daylight?.arrivalAfterDark === true) return true;
  if (!input.plannedDepartureAt) return false;
  const parsed = Date.parse(input.plannedDepartureAt);
  if (!Number.isFinite(parsed)) return false;
  const hour = new Date(parsed).getHours();
  return hour >= 16 || hour <= 5;
}

export function isPowerRelevantForReadiness(input: Pick<ExpeditionReadinessInput, 'route' | 'offline' | 'campCandidates' | 'plannedDepartureAt' | 'daylight'>): boolean {
  return isRemoteRoute(input.route, input.offline) || hasCampOrOvernightContext(input);
}

function requiredRuntimeHoursFor(input: Pick<ExpeditionReadinessInput, 'route' | 'offline' | 'campCandidates' | 'plannedDepartureAt' | 'daylight'>): number | null {
  const remote = isRemoteRoute(input.route, input.offline);
  const overnight = hasCampOrOvernightContext(input);
  if (remote && overnight) return 12;
  if (remote) return 6;
  if (overnight) return 8;
  return null;
}

function normalizeFreshness(value: EcsPowerIntelligenceSnapshot['dataFreshness'] | null | undefined): ExpeditionPowerDataFreshness {
  if (value === 'live' || value === 'aging' || value === 'stale' || value === 'offline') return value;
  return 'unknown';
}

function normalizeRuntimeSource(value: EcsPowerIntelligenceSnapshot['runtimeSource'] | null | undefined): ExpeditionPowerRuntimeSource {
  if (value === 'provider' || value === 'derived' || value === 'unavailable') return value;
  return 'unavailable';
}

function rounded(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function buildPowerReadinessInput(args: {
  sourceInput: Pick<ExpeditionReadinessInput, 'route' | 'offline' | 'campCandidates' | 'plannedDepartureAt' | 'daylight'>;
  primaryDevice?: ManagedPowerDevice | null;
  intelligence?: EcsPowerIntelligenceSnapshot | null;
  updatedAt?: string | null;
}): ExpeditionReadinessPowerInput | null {
  const { sourceInput, primaryDevice = null, intelligence = null } = args;
  const powerRelevantForTrip = isPowerRelevantForReadiness(sourceInput);
  const requiredRuntimeHours = requiredRuntimeHoursFor(sourceInput);
  const hasManagedDevice = Boolean(primaryDevice);
  const connectedSourceAvailable = Boolean(
    intelligence?.isLive
    || intelligence?.connectedDeviceCount
    || primaryDevice?.connectionState === 'connected',
  );
  const hasTelemetry = Boolean(
    intelligence?.available
    || primaryDevice?.lastSocPct != null
    || primaryDevice?.lastWattsIn != null
    || primaryDevice?.lastWattsOut != null,
  );

  if (!hasManagedDevice && !hasTelemetry && !powerRelevantForTrip) {
    return {
      runtimeHoursRemaining: null,
      requiredRuntimeHours: null,
      batteryPercent: null,
      inputWatts: null,
      outputWatts: null,
      solarInputWatts: null,
      connectedSourceAvailable: false,
      connectionState: 'unavailable',
      providerLabel: null,
      deviceLabel: null,
      dataFreshness: 'unknown',
      runtimeSource: 'unavailable',
      powerRelevantForTrip: false,
      powerNeedReason: 'Short/local trip context does not require connected power telemetry.',
      powerRecommendation: 'Power system not connected. Add a device or manual estimate if fridge, comms, or overnight loads matter.',
      hasManualFallback: false,
      source: 'unknown',
      updatedAt: args.updatedAt ?? null,
    };
  }

  const runtimeHoursRemaining = rounded(intelligence?.runtimeHoursRemaining ?? null);
  const batteryPercent = rounded(intelligence?.batteryPercent ?? primaryDevice?.lastSocPct ?? null);
  const inputWatts = rounded(intelligence?.inputWatts ?? primaryDevice?.lastWattsIn ?? null);
  const outputWatts = rounded(intelligence?.outputWatts ?? primaryDevice?.lastWattsOut ?? null);
  const solarInputWatts = rounded(intelligence?.solarInputWatts ?? null);
  const dataFreshness = normalizeFreshness(intelligence?.dataFreshness);
  const source =
    intelligence?.isLive || primaryDevice?.connectionState === 'connected'
      ? 'live'
      : primaryDevice?.connectionMethod === 'manual'
        ? 'manual'
        : hasManagedDevice || hasTelemetry
          ? 'cached'
          : 'unknown';
  const stale = dataFreshness === 'stale' || dataFreshness === 'offline';

  return {
    runtimeHoursRemaining,
    requiredRuntimeHours,
    batteryPercent,
    inputWatts,
    outputWatts,
    solarInputWatts,
    connectedSourceAvailable,
    connectionState: primaryDevice?.connectionState ?? (connectedSourceAvailable ? 'connected' : 'unavailable'),
    providerLabel: intelligence?.providerLabel ?? primaryDevice?.provider ?? null,
    deviceLabel: intelligence?.deviceLabel ?? primaryDevice?.customName ?? primaryDevice?.originalName ?? null,
    dataFreshness,
    runtimeSource: primaryDevice?.connectionMethod === 'manual' ? 'manual' : normalizeRuntimeSource(intelligence?.runtimeSource),
    powerRelevantForTrip,
    powerNeedReason: powerRelevantForTrip
      ? 'Remote, overnight, camp, or low-light context makes fridge/comms/navigation/device power relevant.'
      : 'Power telemetry is optional for this trip context.',
    powerRecommendation: intelligence?.advisoryHeadline
      ?? (powerRelevantForTrip ? 'Add a power runtime estimate before departure.' : 'Connect or update power only if this trip depends on powered loads.'),
    hasManualFallback: primaryDevice?.connectionMethod === 'manual' || hasTelemetry,
    source,
    updatedAt:
      intelligence?.lastUpdatedAt != null
        ? new Date(intelligence.lastUpdatedAt).toISOString()
        : primaryDevice?.lastSeenAt ?? args.updatedAt ?? null,
    isStale: stale,
  };
}
