import type { BluAuthoritySnapshot } from '../BluPowerAuthority';
import type { CampsiteCandidateResult } from '../campsiteCandidateEngine';
import { buildEnvironmentSnapshot } from '../environmentSnapshotService';
import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';
import {
  evaluateSourceTruthRef,
  normalizeSourceTruthConfidence,
  normalizeSourceTruthOrigin,
  sanitizeSourceTruthDisplayText,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';
import type { ActiveVehicleContext } from '../vehicle/activeVehicleTypes';
import type { ECSStatusTone } from '../ecsStatusTokens';
import type { ActiveConvoyContext } from '../convoy/convoyMembershipService';
import type { ConvoyTrackingStoreState } from '../../stores/convoyTrackingStore';
import {
  findCampOpsSafeEndPoint,
  type CampOpsSafeEndPointDelayScenario,
  type CampOpsSafeEndPointResult,
} from './campOpsSafeEndpoint';
import {
  getCampOpsFeatureState,
  type CampOpsRecommendationRolloutConfig,
} from './campOpsRecommendationConfig';
import {
  buildCampOpsSearchInputs,
  type CampOpsSearchIntegrationOptions,
} from './campOpsSearchIntegration';
import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampOpsConvoyProfile,
  CampOpsDataPoint,
  CampOpsGeoPoint,
  CampOpsOfflineMode,
  CampOpsResourceState,
  CampOpsRouteProgress,
  CampOpsVehicleProfile,
  CampRecommendationSet,
  CampSearchContext,
} from './campOpsTypes';

export type CampOpsSafeEndpointDecisionStatus =
  | 'disabled'
  | 'no_route'
  | 'loading'
  | 'no_candidates'
  | 'unavailable'
  | 'recommended'
  | 'emergency_only'
  | 'no_safe_endpoint';

export type CampOpsSafeEndpointRole = 'recommended' | 'backup' | 'emergency';

export type CampOpsSafeEndpointWeatherContext = {
  source?: string | null;
  provider?: string | null;
  observedAt?: string | number | null;
  hasData?: boolean | null;
  stale?: boolean;
  confidence?: CampOpsConfidence | null;
};

export type CampOpsSafeEndpointDecisionContextInput = {
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
  routeAvailable: boolean;
  routeId?: string | null;
  routeLabel?: string | null;
  tripId?: string | null;
  candidateResult?: CampsiteCandidateResult | null;
  candidateStatus?: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | null;
  navigateRoute?: NavigateRouteSessionSnapshot | null;
  vehicleContext?: ActiveVehicleContext | null;
  convoyContext?: ActiveConvoyContext | null;
  convoyTracking?: ConvoyTrackingStoreState | null;
  powerSnapshot?: BluAuthoritySnapshot | null;
  weather?: CampOpsSafeEndpointWeatherContext | null;
  connectivityStatus?: string | null;
  plannedCampId?: string | null;
};

export type BuildCampOpsSafeEndpointDecisionViewModelInput =
  CampOpsSafeEndpointDecisionContextInput & {
    delayScenario: CampOpsSafeEndPointDelayScenario;
    beforeSunset: boolean;
    nowIso?: string | null;
  };

export type CampOpsSafeEndpointInputTruth = {
  id: string;
  label: string;
  stateLabel: string;
  detail: string;
  tone: ECSStatusTone;
  source: SourceTruthRef;
  policyKey: SourceTruthPolicyKey;
};

export type CampOpsSafeEndpointRiskRow = {
  id: string;
  label: string;
  value: string;
  detail: string | null;
  tone: ECSStatusTone;
};

export type CampOpsSafeEndpointOptionViewModel = {
  role: CampOpsSafeEndpointRole;
  roleLabel: string;
  candidate: CampCandidate;
  name: string;
  statusLabel: string;
  tone: ECSStatusTone;
  etaText: string;
  daylightMarginText: string;
  confidenceLabel: string;
  hardGateResults: string[];
  risks: CampOpsSafeEndpointRiskRow[];
  sourceTruth: SourceTruthRef;
  sourceTruthPolicyKey: SourceTruthPolicyKey;
  sourceDependencies: string[];
};

export type CampOpsSafeEndpointDecisionPointViewModel = {
  available: boolean;
  title: string;
  deadlineText: string;
  reason: string;
  continueLabel: string | null;
  divertLabel: string | null;
  continueRisk: string | null;
  latestTurnoffText: string | null;
  confidenceLabel: string;
};

export type CampOpsSafeEndpointDecisionViewModel = {
  enabled: boolean;
  status: CampOpsSafeEndpointDecisionStatus;
  statusLabel: string;
  statusTone: ECSStatusTone;
  summary: string;
  routeLabel: string;
  delayMinutes: number;
  delayLabel: string;
  beforeSunset: boolean;
  endpoints: CampOpsSafeEndpointOptionViewModel[];
  recommendedEndpoint: CampOpsSafeEndpointOptionViewModel | null;
  backupEndpoint: CampOpsSafeEndpointOptionViewModel | null;
  emergencyEndpoint: CampOpsSafeEndpointOptionViewModel | null;
  plannedCampStatus: 'not_linked' | 'viable' | 'downgraded' | 'rejected';
  plannedCampDowngradeReason: string | null;
  plannedCampGateResults: string[];
  decisionDeadlineText: string;
  decisionPoint: CampOpsSafeEndpointDecisionPointViewModel;
  confidenceLabel: string;
  confidenceReasons: string[];
  inputTruth: CampOpsSafeEndpointInputTruth[];
  keyRisks: string[];
  warnings: string[];
  assumptions: string[];
  nextAction: string;
  canStageRoute: boolean;
  explanationSource: 'deterministic_campops';
  result: CampOpsSafeEndPointResult | null;
};

export type CampOpsSafeEndpointMapPreviewIntent = {
  candidateId: string;
  title: string;
  coordinate: { latitude: number; longitude: number };
};

export type CampOpsSafeEndpointRouteStageIntent = {
  actionId: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  raw: Record<string, unknown>;
};

const METERS_PER_MILE = 1609.344;
const MAX_DELAY_MINUTES = 12 * 60;

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function validIso(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function safeText(value: unknown, fallback = 'Unknown'): string {
  const sanitized = sanitizeSourceTruthDisplayText(value, 180);
  return sanitized && sanitized !== '[redacted]' ? sanitized : fallback;
}

function humanize(value: unknown, fallback = 'Unknown'): string {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function delayMinutes(scenario: CampOpsSafeEndPointDelayScenario): number {
  if (scenario === 'no_delay') return 0;
  if (scenario === 'delay_30m') return 30;
  if (scenario === 'delay_1h') return 60;
  if (scenario === 'delay_2h') return 120;
  return Math.min(MAX_DELAY_MINUTES, Math.max(0, Math.round(finiteNumber(scenario.minutes) ?? 0)));
}

function formatDelay(minutes: number): string {
  if (minutes <= 0) return 'No delay';
  if (minutes < 60) return `${minutes} minute delay`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0
    ? `${hours} hour${hours === 1 ? '' : 's'} ${remainder} minute delay`
    : `${hours} hour${hours === 1 ? '' : 's'} delay`;
}

function formatClock(iso: string | null | undefined): string {
  const normalized = validIso(iso);
  if (!normalized) return 'Unknown';
  const date = new Date(normalized);
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  } catch {
    return `${normalized.slice(11, 16)} UTC`;
  }
}

function formatMargin(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return 'Unknown';
  const rounded = Math.round(minutes);
  if (rounded === 0) return 'At sunset';
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  const amount = hours > 0 ? `${hours}h${remainder > 0 ? ` ${remainder}m` : ''}` : `${remainder}m`;
  return rounded > 0 ? `${amount} daylight margin` : `${amount} after sunset`;
}

function confidenceFromVehicle(context: ActiveVehicleContext | null | undefined): CampOpsConfidence {
  const label = context?.vehicleState.confidence.label;
  if (label === 'verified' || label === 'high') return 'high';
  if (label === 'medium') return 'medium';
  if (label === 'low') return 'low';
  return context?.hasVehicleContext ? 'low' : 'unknown';
}

function sourceOrigin(source: string | null | undefined): SourceTruthOrigin {
  if (source === 'manual' || source === 'user_saved' || source === 'gpx') return 'manual';
  if (source === 'offline_dataset' || source === 'community' || source === 'private' || source === 'group') return 'cached';
  if (source === 'route_candidate' || source === 'route_endpoint_candidate' || source === 'draw_area_candidate' || source === 'inferred') {
    return 'inferred';
  }
  return 'unavailable';
}

function sourceStateLabel(origin: SourceTruthOrigin, freshness: string): string {
  if (origin === 'unavailable' || freshness === 'unavailable') return 'MISSING';
  if (freshness === 'expired') return 'EXPIRED';
  if (freshness === 'stale') return 'STALE';
  if (origin === 'cached') return 'CACHED';
  if (origin === 'manual') return 'MANUAL';
  if (origin === 'estimated') return 'ESTIMATED';
  if (origin === 'inferred') return 'INFERRED';
  if (origin === 'simulated') return 'MOCK';
  return freshness === 'recent' ? 'RECENT' : 'LIVE';
}

function sourceStateTone(state: string): ECSStatusTone {
  if (state === 'LIVE') return 'live';
  if (state === 'RECENT' || state === 'MANUAL' || state === 'CACHED' || state === 'INFERRED' || state === 'ESTIMATED') {
    return state === 'RECENT' ? 'ready' : 'category';
  }
  if (state === 'STALE' || state === 'MOCK') return 'warning';
  return 'unavailable';
}

function inputTruth(
  id: string,
  label: string,
  source: SourceTruthRef,
  policyKey: SourceTruthPolicyKey,
  detail: string,
  nowIso: string,
): CampOpsSafeEndpointInputTruth {
  const evaluated = evaluateSourceTruthRef(source, { policyKey, now: nowIso });
  const stateLabel = sourceStateLabel(evaluated.ref.origin, evaluated.freshness);
  return {
    id,
    label,
    stateLabel,
    tone: sourceStateTone(stateLabel),
    detail: safeText(detail),
    source: evaluated.ref,
    policyKey,
  };
}

function buildVehicleProfile(context: ActiveVehicleContext | null | undefined): CampOpsVehicleProfile | null {
  if (!context?.hasVehicleContext) return null;
  const spec = context.spec;
  const vehicle = context.vehicle;
  const labels = [
    ...(context.accessorySummary ?? []).map((item) => item.label),
    ...(context.loadoutItems ?? []).map((item) => item.name),
  ].join(' ');
  return {
    vehicleId: context.activeVehicleId,
    label: context.vehicleState.identity.displayName,
    vehicleType: context.vehicleState.identity.vehicleType,
    widthInches: finiteNumber(spec?.overall_width_in ?? vehicle?.overall_width_in),
    wheelbaseInches: finiteNumber(spec?.wheelbase_in ?? vehicle?.wheelbase_in),
    clearanceInches: finiteNumber(spec?.ground_clearance_inches ?? vehicle?.ground_clearance_inches),
    tireSizeInches: finiteNumber(context.resourceProfile.tireSizeInches),
    suspensionLiftInches: finiteNumber(context.resourceProfile.suspensionLiftInches),
    trailerAttached: /\btrailer\b|\bhitch\b/i.test(labels) ? true : null,
    rooftopTent: /\brooftop tent\b|\brtt\b/i.test(labels) ? true : null,
    operatingWeightLbs: finiteNumber(context.weightSnapshot.estimatedOperatingWeightLbs),
    payloadRemainingLbs: finiteNumber(context.weightSnapshot.remainingPayloadLbs),
    source: context.vehicleState.weight.isEstimate ? 'inferred' : 'manual',
    confidence: confidenceFromVehicle(context),
  };
}

function buildResourceState(
  context: ActiveVehicleContext | null | undefined,
  power: BluAuthoritySnapshot | null | undefined,
): CampOpsResourceState | null {
  const fuelPercent = context?.hasVehicleContext ? finiteNumber(context.resourceProfile.currentFuelPercent) : null;
  const fuelGallons = context?.hasVehicleContext ? finiteNumber(context.resourceProfile.currentFuelGallons) : null;
  const avgMpg = finiteNumber(context?.vehicle?.avg_mpg);
  const fuelRangeMiles = fuelGallons != null && fuelGallons > 0 && avgMpg != null && avgMpg > 0
    ? fuelGallons * avgMpg
    : null;
  const waterGallons = context?.hasVehicleContext ? finiteNumber(context.resourceProfile.currentWaterGallons) : null;
  const waterCapacity = context?.hasVehicleContext ? finiteNumber(context.resourceProfile.waterCapacityGal) : null;
  const waterPercent = waterGallons != null && waterCapacity != null && waterCapacity > 0
    ? Math.max(0, Math.min(100, (waterGallons / waterCapacity) * 100))
    : null;
  const powerPercent = power?.hasPowerData ? finiteNumber(power.batteryPercent) : null;
  if (fuelPercent == null && fuelRangeMiles == null && waterGallons == null && powerPercent == null) return null;
  return {
    fuelPercent,
    fuelRangeMiles,
    waterGallons,
    waterPercent,
    powerPercent,
    source: context?.hasVehicleContext ? 'manual' : powerPercent != null ? 'inferred' : 'unknown',
    confidence: context?.hasVehicleContext ? confidenceFromVehicle(context) : powerPercent != null ? 'medium' : 'unknown',
  };
}

function buildConvoyProfile(
  active: ActiveConvoyContext | null | undefined,
  tracking: ConvoyTrackingStoreState | null | undefined,
): CampOpsConvoyProfile | null {
  const groupId = active?.convoyId ?? tracking?.convoyId ?? null;
  const memberCount = Math.max(tracking?.rawMembers.length ?? 0, tracking?.members.length ?? 0);
  if (!groupId && memberCount === 0) return null;
  const vehicleIds = new Set(
    (tracking?.rawMembers ?? [])
      .map((member) => member.vehicle_id?.trim())
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
  );
  const delayedMemberCount = (tracking?.members ?? []).filter((member) => member.movementStatus === 'delayed').length;
  const connected = tracking?.connectionStatus === 'connected';
  return {
    groupId,
    groupLabel: active?.expeditionBadgeTitle ?? 'Active convoy',
    vehicleCount: vehicleIds.size > 0 ? vehicleIds.size : null,
    peopleCount: memberCount > 0 ? memberCount : null,
    delayedMemberCount,
    source: 'group',
    confidence: connected && (tracking?.staleCount ?? 0) === 0 ? 'high' : memberCount > 0 ? 'medium' : 'low',
  };
}

function pathMiles(points: NavigateRouteSessionSnapshot['routePoints']): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const lat1 = (previous.lat * Math.PI) / 180;
    const lat2 = (current.lat * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = ((current.lng - previous.lng) * Math.PI) / 180;
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    total += 3959 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
  }
  return total > 0 ? total : null;
}

function buildRouteProgress(snapshot: NavigateRouteSessionSnapshot | null | undefined): CampOpsRouteProgress | null {
  if (!snapshot || snapshot.lifecycle === 'inactive') return null;
  const remainingMiles = snapshot.remainingDistanceM != null
    ? Math.max(0, snapshot.remainingDistanceM / METERS_PER_MILE)
    : null;
  const totalMiles = pathMiles(snapshot.routePoints) ?? (
    remainingMiles != null && snapshot.progressPercent != null && snapshot.progressPercent > 0 && snapshot.progressPercent < 100
      ? remainingMiles / (1 - snapshot.progressPercent / 100)
      : null
  );
  const routeMileMarker = totalMiles != null && snapshot.progressPercent != null
    ? Math.max(0, Math.min(totalMiles, totalMiles * snapshot.progressPercent / 100))
    : null;
  return {
    progressPercent: snapshot.progressPercent,
    routeMileMarker,
    distanceRemainingMiles: remainingMiles,
    driveTimeRemainingMinutes: snapshot.remainingDurationS != null
      ? Math.max(0, Math.round(snapshot.remainingDurationS / 60))
      : null,
    currentSegmentLabel: snapshot.instruction ?? snapshot.statusLabel ?? null,
    offRoute: snapshot.isOffRoute,
    source: 'inferred',
    confidence: snapshot.lifecycle === 'active' && snapshot.updatedAt ? 'high' : 'medium',
  };
}

function buildCurrentLocation(
  snapshot: NavigateRouteSessionSnapshot | null | undefined,
): CampOpsDataPoint<CampOpsGeoPoint> | undefined {
  const location = snapshot?.currentLocation;
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return undefined;
  const updatedAt = validIso(location.timestamp ?? snapshot?.updatedAt);
  return {
    value: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: finiteNumber(location.accuracyM),
      label: snapshot?.routeTitle ?? 'Current route position',
    },
    source: 'inferred',
    confidence: location.accuracyM != null && location.accuracyM <= 50 ? 'high' : 'medium',
    updatedAt,
    notes: 'Navigate GPS position normalized for CampOps. Source origin remains visible separately.',
  };
}

function normalizeOfflineMode(status: string | null | undefined): CampOpsOfflineMode {
  if (status === 'online') return 'online';
  if (status === 'offline') return 'offline';
  if (status === 'limited' || status === 'degraded' || status === 'connecting') return 'degraded';
  return 'unknown';
}

function routeMatches(
  snapshot: NavigateRouteSessionSnapshot | null | undefined,
  routeId: string | null | undefined,
  result: CampsiteCandidateResult | null | undefined,
): boolean {
  if (!snapshot || snapshot.lifecycle === 'inactive') return false;
  if (!routeId) return true;
  return snapshot.routeId === routeId || snapshot.sessionId === routeId || result?.routeIntelligenceId === snapshot.routeId;
}

function buildContext(
  input: BuildCampOpsSafeEndpointDecisionViewModelInput,
  normalized: ReturnType<typeof buildCampOpsSearchInputs>,
  nowIso: string,
): CampSearchContext {
  const matchingSnapshot = routeMatches(input.navigateRoute, input.routeId, input.candidateResult)
    ? input.navigateRoute
    : null;
  const currentLocation = buildCurrentLocation(matchingSnapshot);
  const routeFallback = matchingSnapshot?.routePoints[0];
  const solarCoordinate = currentLocation?.value ?? (
    routeFallback
      ? { latitude: routeFallback.lat, longitude: routeFallback.lng, label: input.routeLabel ?? null }
      : null
  );
  const environment = buildEnvironmentSnapshot({
    coordinate: solarCoordinate
      ? {
          latitude: solarCoordinate.latitude,
          longitude: solarCoordinate.longitude,
          accuracyM: currentLocation?.value?.accuracyMeters,
          source: currentLocation ? 'gps' : 'route',
          updatedAt: currentLocation?.updatedAt ?? nowIso,
        }
      : null,
    nowMs: Date.parse(nowIso),
  });
  const vehicleProfile = buildVehicleProfile(input.vehicleContext);
  const convoyProfile = buildConvoyProfile(input.convoyContext, input.convoyTracking);
  const resourceState = buildResourceState(input.vehicleContext, input.powerSnapshot);
  const liveProgress = buildRouteProgress(matchingSnapshot);
  return {
    ...normalized.context,
    id: `campops-safe-endpoint:${input.routeId ?? normalized.context.routeId ?? 'route'}`,
    routeId: input.routeId ?? normalized.context.routeId,
    tripId: input.tripId ?? normalized.context.tripId,
    plannedCampId:
      input.plannedCampId ??
      input.candidateResult?.campOps?.routeEndpointPlan?.selectedEndpointIds?.[0] ??
      normalized.context.plannedCampId,
    currentTimeIso: nowIso,
    currentLocation: currentLocation ?? normalized.context.currentLocation,
    daylightInfo: solarCoordinate
      ? {
          sunsetIso: environment.sunlight.sunsetIso,
          civilTwilightEndIso: environment.sunlight.civilTwilightEndIso,
          daylightRemainingMinutes: environment.sunlight.remainingMinutes,
          source: environment.sunlight.source === 'weather_provider' ? 'route_candidate' : 'inferred',
          confidence: environment.sunlight.confidence === 'high'
            ? 'high'
            : environment.sunlight.confidence === 'medium'
              ? 'medium'
              : 'low',
        }
      : normalized.context.daylightInfo,
    vehicleProfile: vehicleProfile ?? normalized.context.vehicleProfile,
    convoyProfile: convoyProfile ?? normalized.context.convoyProfile,
    resourceState: resourceState ?? normalized.context.resourceState,
    routeProgress: liveProgress ?? normalized.context.routeProgress,
    offlineMode: normalizeOfflineMode(input.connectivityStatus),
  };
}

function addMinutes(iso: string, minutes: number): string | null {
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? new Date(timestamp + minutes * 60_000).toISOString() : null;
}

function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  const start = startIso ? Date.parse(startIso) : Number.NaN;
  const end = endIso ? Date.parse(endIso) : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 60_000) : null;
}

function mergeEnrichment(
  candidate: CampCandidate,
  current: CampCandidateEnrichment,
  existing: CampCandidateEnrichment | undefined,
  context: CampSearchContext,
): CampCandidateEnrichment {
  const merged: CampCandidateEnrichment = existing
    ? {
        ...current,
        ...existing,
        etaIso: current.etaIso,
        etaMinutesFromNow: current.etaMinutesFromNow,
        sunsetMarginMinutes: current.sunsetMarginMinutes,
        routeDistanceToCampMiles: current.routeDistanceToCampMiles,
        fuelImpact: current.fuelImpact,
        waterImpact: current.waterImpact,
        reliableWaterRefillAvailable:
          current.reliableWaterRefillAvailable ?? existing.reliableWaterRefillAvailable,
        resourceDebt: current.resourceDebt,
        dataLimitations: unique([...(current.dataLimitations ?? []), ...(existing.dataLimitations ?? [])]),
      }
    : current;
  if (merged.groupCapacityEstimate == null) {
    merged.groupCapacityEstimate = undefined;
  }
  const currentMile = context.routeProgress?.routeMileMarker;
  const candidateMile = merged.routeDistanceToCampMiles;
  const remainingMiles = context.routeProgress?.distanceRemainingMiles;
  const remainingMinutes = context.routeProgress?.driveTimeRemainingMinutes;
  if (currentMile == null || candidateMile == null || currentMile <= 0) return merged;
  const milesAhead = candidateMile - currentMile;
  if (milesAhead < -0.5) {
    return {
      ...merged,
      etaIso: null,
      etaMinutesFromNow: null,
      routeDistanceToCampMiles: null,
      sunsetMarginMinutes: null,
      dataConfidence: merged.dataConfidence === 'high' ? 'medium' : merged.dataConfidence,
      dataLimitations: unique([
        ...(merged.dataLimitations ?? []),
        `${candidate.name} is behind current route progress; backtrack ETA requires a route preview.`,
      ]),
    };
  }
  const routeMinutes = remainingMiles != null && remainingMiles > 0 && remainingMinutes != null && remainingMinutes > 0
    ? Math.max(0, Math.round((Math.max(0, milesAhead) / remainingMiles) * remainingMinutes))
    : null;
  if (routeMinutes == null) {
    return {
      ...merged,
      etaIso: null,
      etaMinutesFromNow: null,
      routeDistanceToCampMiles: Math.max(0, milesAhead),
      sunsetMarginMinutes: null,
      dataLimitations: unique([...(merged.dataLimitations ?? []), 'Current route speed or duration is unavailable; endpoint ETA remains unknown.']),
    };
  }
  const etaIso = addMinutes(context.currentTimeIso, routeMinutes);
  return {
    ...merged,
    etaIso,
    etaMinutesFromNow: routeMinutes,
    routeDistanceToCampMiles: Math.max(0, milesAhead),
    sunsetMarginMinutes: minutesBetween(etaIso, context.daylightInfo?.sunsetIso),
  };
}

function newestIso(values: Array<string | null | undefined>): string | null {
  return values
    .map(validIso)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  return values
    .map(validIso)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

function endpointSourceTruth(
  role: CampOpsSafeEndpointRole,
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment | undefined,
  analyzedAt: string | null | undefined,
): SourceTruthRef {
  const signals = enrichment?.sourceSignals ?? [];
  const conflicts = (enrichment?.sourceResolutions ?? []).some((resolution) => resolution.conflictDetected) ||
    enrichment?.fireRestrictionConflict === true || enrichment?.emergencyRestrictionConflict === true;
  const criticalKnown = [
    enrichment?.legalStatus && enrichment.legalStatus !== 'unknown',
    enrichment?.accessDifficulty && enrichment.accessDifficulty !== 'unknown',
    enrichment?.vehicleFit && enrichment.vehicleFit !== 'unknown',
    enrichment?.weatherExposure && enrichment.weatherExposure !== 'unknown',
    enrichment?.lateArrivalRisk && enrichment.lateArrivalRisk !== 'unknown',
  ].filter(Boolean).length;
  const warningCodes = unique([
    conflicts ? 'campops_source_conflict' : null,
    signals.some((signal) => signal.isStale || signal.freshnessStatus === 'stale') ? 'campops_source_stale' : null,
    signals.some((signal) => signal.freshnessStatus === 'expired') ? 'campops_source_expired' : null,
    enrichment?.legalStatus === 'unknown' ? 'campops_legal_unknown' : null,
    enrichment?.closureStatus === 'unknown' ? 'campops_closure_unknown' : null,
    enrichment?.weatherExposure === 'unknown' ? 'campops_weather_unknown' : null,
    enrichment?.groupCapacityEstimate == null ? 'campops_group_fit_partial' : null,
    role === 'emergency' ? 'campops_emergency_only_endpoint' : null,
  ]);
  return {
    id: `campops-safe-endpoint:${candidate.id}`,
    origin: sourceOrigin(candidate.source),
    authority: 'ECS CampOps deterministic engine',
    provider: humanize(candidate.source, 'Unknown source'),
    observedAt: newestIso([candidate.lastVerifiedDate, ...signals.map((signal) => signal.observedAtIso), analyzedAt]),
    fetchedAt: newestIso(signals.flatMap((signal) => [signal.retrievedAt, signal.cachedAt])),
    expiresAt: earliestIso(signals.map((signal) => signal.expiresAt)),
    confidence: normalizeSourceTruthConfidence(enrichment?.dataConfidence ?? candidate.sourceConfidence),
    coverage: criticalKnown >= 5 ? 'complete' : criticalKnown > 0 ? 'partial' : 'unknown',
    availability: role === 'emergency' || criticalKnown < 5 || conflicts ? 'degraded' : 'usable',
    conflict: conflicts,
    warningCodes,
  };
}

function riskTone(value: string | null | undefined): ECSStatusTone {
  const normalized = String(value ?? '').toLowerCase();
  if (/critical|prohibited|closed|not_fit|after_dark|fire_ban/.test(normalized)) return 'unavailable';
  if (/caution|tight|watch|limited|restricted|unknown|high/.test(normalized)) return 'warning';
  if (/safe|positive|neutral|fit|allowed|open|low|none_known/.test(normalized)) return 'ready';
  return 'info';
}

function endpointRisks(
  enrichment: CampCandidateEnrichment | undefined,
  context: CampSearchContext,
): CampOpsSafeEndpointRiskRow[] {
  const debt = enrichment?.resourceDebt;
  const peopleCount = context.convoyProfile?.peopleCount;
  const capacity = enrichment?.groupCapacityEstimate;
  const groupValue = capacity == null || peopleCount == null
    ? 'Unknown'
    : capacity >= peopleCount
      ? 'Fit'
      : 'Capacity risk';
  const powerPercent = context.resourceState?.powerPercent;
  const fuelValue = debt?.fuel.status ?? enrichment?.fuelImpact?.impact ?? 'unknown';
  const waterValue = debt?.water.status ?? enrichment?.waterImpact?.impact ?? 'unknown';
  return [
    { id: 'fuel', label: 'Fuel', value: humanize(fuelValue), detail: debt?.fuel.reason ?? null, tone: riskTone(fuelValue) },
    { id: 'water', label: 'Water', value: humanize(waterValue), detail: debt?.water.reason ?? null, tone: riskTone(waterValue) },
    {
      id: 'power',
      label: 'Power',
      value: powerPercent == null ? 'Unknown' : `${Math.round(powerPercent)}%`,
      detail: 'Power is visible context; this CampOps score does not invent endpoint-specific power draw.',
      tone: powerPercent == null ? 'warning' : powerPercent < 15 ? 'unavailable' : powerPercent < 30 ? 'warning' : 'ready',
    },
    {
      id: 'legal_access',
      label: 'Legal / Access',
      value: `${humanize(enrichment?.legalStatus)} / ${humanize(enrichment?.accessDifficulty)}`,
      detail: `Legal confidence ${humanize(enrichment?.legalConfidence)}; closure ${humanize(enrichment?.closureStatus)}.`,
      tone: riskTone(`${enrichment?.legalStatus} ${enrichment?.closureStatus} ${enrichment?.accessDifficulty}`),
    },
    {
      id: 'weather',
      label: 'Weather',
      value: humanize(enrichment?.weatherExposure),
      detail: `Storm ${humanize(enrichment?.stormRisk)}; precipitation ${humanize(enrichment?.precipitationRisk)}.`,
      tone: riskTone(`${enrichment?.weatherExposure} ${enrichment?.stormRisk}`),
    },
    {
      id: 'vehicle_trailer',
      label: 'Vehicle / Trailer',
      value: `${humanize(enrichment?.vehicleFit)} / ${humanize(enrichment?.trailerSuitability)}`,
      detail: `Turnaround ${humanize(enrichment?.turnaroundSuitability)}; access ${humanize(enrichment?.accessDifficulty)}.`,
      tone: riskTone(`${enrichment?.vehicleFit} ${enrichment?.trailerSuitability} ${enrichment?.turnaroundSuitability}`),
    },
    {
      id: 'group',
      label: 'Group',
      value: groupValue,
      detail: capacity == null ? 'Camp group capacity is unknown.' : `Estimated capacity ${capacity}; group count ${peopleCount ?? 'unknown'}.`,
      tone: riskTone(groupValue),
    },
    {
      id: 'late_arrival',
      label: 'Late Arrival',
      value: humanize(enrichment?.lateArrivalRisk),
      detail: formatMargin(enrichment?.sunsetMarginMinutes),
      tone: riskTone(enrichment?.lateArrivalRisk),
    },
  ];
}

function optionViewModel(
  role: CampOpsSafeEndpointRole,
  candidate: CampCandidate | null,
  set: CampRecommendationSet,
  context: CampSearchContext,
  analyzedAt: string | null | undefined,
): CampOpsSafeEndpointOptionViewModel | null {
  if (!candidate) return null;
  const enrichment = set.enrichmentsByCandidateId?.[candidate.id];
  const rejected = set.rejectedCandidates.find((item) => item.candidate.id === candidate.id);
  const roleLabel = role === 'recommended' ? 'Recommended Endpoint' : role === 'backup' ? 'Backup Endpoint' : 'Emergency Endpoint';
  const sourceTruth = endpointSourceTruth(role, candidate, enrichment, analyzedAt);
  return {
    role,
    roleLabel,
    candidate,
    name: safeText(candidate.name, roleLabel),
    statusLabel: role === 'recommended' ? 'USE AFTER VERIFICATION' : role === 'backup' ? 'BACKUP' : 'EMERGENCY ONLY',
    tone: role === 'recommended' ? 'ready' : role === 'backup' ? 'warning' : 'unavailable',
    etaText: formatClock(enrichment?.etaIso),
    daylightMarginText: formatMargin(enrichment?.sunsetMarginMinutes),
    confidenceLabel: humanize(enrichment?.dataConfidence ?? candidate.sourceConfidence),
    hardGateResults: rejected
      ? rejected.gates.map((gate) => `${humanize(gate.state)}: ${safeText(gate.reason)}`)
      : ['No blocking CampOps hard gate was returned for this role; unknown inputs remain visible.'],
    risks: endpointRisks(enrichment, context),
    sourceTruth,
    sourceTruthPolicyKey: 'route_legal_access_evidence',
    sourceDependencies: [
      `${roleLabel}, ETA, daylight margin, hard-gate posture, risk rows, confidence, and recommended action.`,
    ],
  };
}

function decisionPointViewModel(result: CampOpsSafeEndPointResult): CampOpsSafeEndpointDecisionPointViewModel {
  const point = result.decisionSummary.decisionPoint;
  if (!point) {
    return {
      available: false,
      title: 'No Decision Point',
      deadlineText: formatClock(result.decisionSummary.decisionDeadlineIso),
      reason: safeText(result.decisionSummary.noDecisionPointReason, 'Route data is insufficient for a practical decision point.'),
      continueLabel: null,
      divertLabel: null,
      continueRisk: null,
      latestTurnoffText: null,
      confidenceLabel: 'Unknown',
    };
  }
  const turnoff = point.latestRecommendedTurnoff;
  const turnoffParts = [
    turnoff?.label,
    turnoff?.distanceMiles != null ? `${turnoff.distanceMiles.toFixed(1)} mi` : null,
    turnoff?.routeMileMarker != null ? `mile ${turnoff.routeMileMarker.toFixed(1)}` : null,
  ].filter(Boolean);
  return {
    available: true,
    title: humanize(point.kind),
    deadlineText: formatClock(point.decisionDeadlineIso),
    reason: safeText(point.reason),
    continueLabel: point.continueOption?.label ? safeText(point.continueOption.label) : null,
    divertLabel: point.divertOption?.label ? safeText(point.divertOption.label) : null,
    continueRisk: safeText(point.riskIfContinues, 'Unknown'),
    latestTurnoffText: turnoffParts.length > 0 ? turnoffParts.join(' / ') : null,
    confidenceLabel: humanize(point.confidence),
  };
}

function powerSourceTruth(power: BluAuthoritySnapshot | null | undefined): SourceTruthRef {
  const truth = power?.truth;
  const origin = truth?.sourceTruth === 'live_provider' || truth?.sourceTruth === 'live_ble'
    ? 'live'
    : truth?.sourceTruth === 'cached'
      ? 'cached'
      : truth?.sourceTruth === 'manual'
        ? 'manual'
        : truth?.sourceTruth === 'simulated'
          ? 'simulated'
          : 'unavailable';
  return {
    id: 'campops-power-state',
    origin,
    authority: 'ECS Power Authority',
    provider: power?.providerLabel ?? truth?.providerId ?? null,
    observedAt: validIso(power?.lastUpdatedAt ?? truth?.lastUpdatedAt),
    confidence: truth ? normalizeSourceTruthConfidence(truth.confidence >= 0.8 ? 'high' : truth.confidence >= 0.5 ? 'medium' : 'low') : 'unknown',
    coverage: power?.hasPowerData ? 'partial' : 'unknown',
    availability: power?.hasPowerData ? power?.freshness === 'stale' || power?.freshness === 'last_known' ? 'degraded' : 'usable' : 'unavailable',
    conflict: false,
    warningCodes: unique([
      power?.freshness === 'stale' || power?.freshness === 'last_known' ? 'power_source_stale' : null,
      truth?.isSimulated ? 'power_source_simulated' : null,
      !power?.hasPowerData ? 'power_source_unavailable' : null,
    ]),
  };
}

function weatherSourceTruth(weather: CampOpsSafeEndpointWeatherContext | null | undefined): SourceTruthRef {
  const source = String(weather?.source ?? '').toLowerCase();
  const origin = normalizeSourceTruthOrigin(
    source.includes('cache') ? 'cached' : source.includes('live') ? 'live' : source.includes('manual') ? 'manual' : source.includes('mock') ? 'simulated' : weather?.hasData ? 'inferred' : 'unavailable',
  );
  return {
    id: 'campops-route-weather-context',
    origin,
    authority: 'ECS Weather Pipeline',
    provider: weather?.provider ?? weather?.source ?? null,
    observedAt: validIso(weather?.observedAt),
    confidence: normalizeSourceTruthConfidence(weather?.confidence),
    coverage: weather?.hasData ? 'partial' : 'unknown',
    availability: weather?.hasData ? weather?.stale ? 'degraded' : 'usable' : 'unavailable',
    conflict: false,
    warningCodes: unique([
      weather?.stale ? 'weather_source_stale' : null,
      weather?.hasData ? 'weather_route_context_not_candidate_specific' : 'weather_source_unavailable',
    ]),
  };
}

function buildInputTruth(
  input: BuildCampOpsSafeEndpointDecisionViewModelInput,
  context: CampSearchContext | null,
  nowIso: string,
  routeResult: CampsiteCandidateResult | null,
): CampOpsSafeEndpointInputTruth[] {
  const route = input.navigateRoute;
  const routeActive = routeMatches(route, input.routeId, routeResult);
  const location = routeActive ? route?.currentLocation : null;
  const vehicleConfidence = confidenceFromVehicle(input.vehicleContext);
  const resources = context?.resourceState;
  const tracking = input.convoyTracking;
  const campCount = routeResult?.candidates.length ?? 0;
  const routeRef: SourceTruthRef = {
    id: 'campops-route-context',
    origin: routeActive ? 'live' : input.routeAvailable ? 'inferred' : 'unavailable',
    authority: routeActive ? 'Navigate route session' : 'ECS route context',
    provider: route?.source ? humanize(route.source) : null,
    observedAt: routeActive ? route?.updatedAt : routeResult?.analyzedAt ?? null,
    confidence: routeActive ? 'high' : input.routeAvailable ? 'medium' : 'unknown',
    coverage: routeActive && (route?.routePoints.length ?? 0) > 1 ? 'complete' : input.routeAvailable ? 'partial' : 'unknown',
    availability: input.routeAvailable ? 'usable' : 'unavailable',
    conflict: route?.isOffRoute === true,
    warningCodes: unique([
      route?.isOffRoute ? 'route_off_route' : null,
      input.routeAvailable && (route?.routePoints.length ?? 0) < 2 ? 'route_geometry_partial' : null,
      !input.routeAvailable ? 'route_unavailable' : null,
    ]),
  };
  const locationRef: SourceTruthRef = {
    id: 'campops-current-location',
    origin: location ? validIso(location.timestamp ?? route?.updatedAt) ? 'live' : 'cached' : 'unavailable',
    authority: 'Navigate location',
    provider: null,
    observedAt: validIso(location?.timestamp ?? route?.updatedAt),
    confidence: location?.accuracyM != null && location.accuracyM <= 50 ? 'high' : location ? 'medium' : 'unknown',
    coverage: location ? 'complete' : 'unknown',
    availability: location ? 'usable' : 'unavailable',
    conflict: false,
    warningCodes: location ? [] : ['location_unavailable'],
  };
  const vehicleRef: SourceTruthRef = {
    id: 'campops-vehicle-profile',
    origin: input.vehicleContext?.hasVehicleContext ? input.vehicleContext.vehicleState.weight.isEstimate ? 'estimated' : 'manual' : 'unavailable',
    authority: 'ECS Fleet',
    provider: input.vehicleContext?.vehicleState.identity.displayName ?? null,
    observedAt: input.vehicleContext?.vehicleState.updatedAt ?? null,
    confidence: vehicleConfidence,
    coverage: input.vehicleContext?.vehicleState.weight.isPartial ? 'partial' : input.vehicleContext?.hasVehicleContext ? 'complete' : 'unknown',
    availability: input.vehicleContext?.hasVehicleContext ? input.vehicleContext.vehicleState.weight.isPartial ? 'degraded' : 'usable' : 'unavailable',
    conflict: false,
    warningCodes: unique([
      input.vehicleContext?.vehicleState.weight.isEstimate ? 'vehicle_profile_estimated' : null,
      input.vehicleContext?.vehicleState.weight.isPartial ? 'vehicle_profile_partial' : null,
      !input.vehicleContext?.hasVehicleContext ? 'vehicle_profile_unavailable' : null,
    ]),
  };
  const manualResourceRef = (id: string, available: boolean, warning: string): SourceTruthRef => ({
    id,
    origin: available ? 'manual' : 'unavailable',
    authority: 'ECS Fleet resources',
    provider: null,
    observedAt: input.vehicleContext?.vehicleState.updatedAt ?? null,
    confidence: available ? vehicleConfidence : 'unknown',
    coverage: available ? 'partial' : 'unknown',
    availability: available ? 'usable' : 'unavailable',
    conflict: false,
    warningCodes: available ? ['resource_state_manual'] : [warning],
  });
  const convoyRef: SourceTruthRef = {
    id: 'campops-convoy-context',
    origin: tracking?.members.length ? tracking.connectionStatus === 'connected' ? 'live' : 'cached' : input.convoyContext ? 'manual' : 'unavailable',
    authority: 'ECS Convoy',
    provider: null,
    observedAt: tracking?.lastUpdated ?? input.convoyContext?.storedAt ?? null,
    confidence: context?.convoyProfile?.confidence ?? 'unknown',
    coverage: tracking?.members.length ? tracking.staleCount > 0 ? 'partial' : 'complete' : input.convoyContext ? 'partial' : 'unknown',
    availability: tracking?.members.length ? tracking.staleCount > 0 ? 'degraded' : 'usable' : input.convoyContext ? 'degraded' : 'unavailable',
    conflict: false,
    warningCodes: unique([
      tracking?.staleCount ? 'convoy_member_location_stale' : null,
      tracking?.connectionStatus === 'degraded' || tracking?.connectionStatus === 'disconnected' ? 'convoy_realtime_degraded' : null,
      !input.convoyContext && !tracking?.members.length ? 'convoy_context_unavailable' : null,
    ]),
  };
  const campRef: SourceTruthRef = {
    id: 'campops-route-candidates',
    origin: campCount > 0 ? sourceOrigin(routeResult?.campOps?.recommendationSet?.rankedCandidates?.[0]?.source ?? 'route_candidate') : 'unavailable',
    authority: 'ECS Camp Candidate Engine',
    provider: null,
    observedAt: routeResult?.analyzedAt ?? null,
    confidence: routeResult?.bestConfidence ? normalizeSourceTruthConfidence(routeResult.bestConfidence) : 'unknown',
    coverage: campCount > 0 ? routeResult?.criteriaBroadened ? 'partial' : 'complete' : 'unknown',
    availability: campCount > 0 ? routeResult?.criteriaBroadened ? 'degraded' : 'usable' : 'unavailable',
    conflict: false,
    warningCodes: unique([
      routeResult?.criteriaBroadened ? 'camp_candidates_criteria_broadened' : null,
      campCount === 0 ? 'camp_candidates_unavailable' : null,
    ]),
  };
  const fuelAvailable = resources?.fuelPercent != null || resources?.fuelRangeMiles != null;
  const waterAvailable = resources?.waterGallons != null || resources?.waterPercent != null;
  return [
    inputTruth('route', 'Route', routeRef, 'route_legal_access_evidence', routeRef.coverage === 'complete' ? 'Current Navigate route and progress are available.' : 'Route geometry or progress is partial.', nowIso),
    inputTruth('location', 'Location', locationRef, 'convoy_member_location', location ? 'Current route position is available.' : 'Current position is unavailable.', nowIso),
    inputTruth('vehicle', 'Vehicle / Trailer', vehicleRef, 'vehicle_profile', context?.vehicleProfile?.trailerAttached == null ? 'Vehicle profile available; trailer state is unknown.' : `Trailer attached: ${context.vehicleProfile.trailerAttached ? 'yes' : 'no'}.`, nowIso),
    inputTruth('convoy', 'Convoy / Group', convoyRef, 'convoy_member_location', context?.convoyProfile?.peopleCount != null ? `${context.convoyProfile.peopleCount} tracked group member${context.convoyProfile.peopleCount === 1 ? '' : 's'}.` : 'Convoy size and state are unavailable.', nowIso),
    inputTruth('fuel', 'Fuel', manualResourceRef('campops-fuel-state', fuelAvailable, 'fuel_state_unavailable'), 'manual_user_state', fuelAvailable ? 'Fleet fuel state is user-entered or locally derived.' : 'Fuel state is unavailable.', nowIso),
    inputTruth('water', 'Water', manualResourceRef('campops-water-state', waterAvailable, 'water_state_unavailable'), 'manual_user_state', waterAvailable ? 'Fleet water state is user-entered or locally derived.' : 'Water state is unavailable.', nowIso),
    inputTruth('power', 'Power', powerSourceTruth(input.powerSnapshot), 'vehicle_telemetry', input.powerSnapshot?.hasPowerData ? 'Current ECS power authority snapshot.' : 'Power telemetry is unavailable.', nowIso),
    inputTruth('weather', 'Weather', weatherSourceTruth(input.weather), 'weather_forecast', input.weather?.hasData ? 'Route weather is visible, but only candidate-linked weather may affect CampOps scoring.' : 'Candidate weather context is unavailable.', nowIso),
    inputTruth('camp', 'Camp Data', campRef, 'route_legal_access_evidence', campCount > 0 ? `${campCount} route-linked candidate${campCount === 1 ? '' : 's'} normalized for CampOps.` : 'No route-linked CampOps candidates are available.', nowIso),
  ];
}

function initialViewModel(
  input: BuildCampOpsSafeEndpointDecisionViewModelInput,
  nowIso: string,
  status: CampOpsSafeEndpointDecisionStatus,
  summary: string,
  nextAction: string,
  routeResult: CampsiteCandidateResult | null,
): CampOpsSafeEndpointDecisionViewModel {
  const minutes = delayMinutes(input.delayScenario);
  const statusLabel = status === 'disabled'
    ? 'ROLLOUT DISABLED'
    : status === 'no_route'
      ? 'NO ROUTE'
      : status === 'loading'
        ? 'CHECKING CAMPS'
        : status === 'unavailable'
          ? 'UNAVAILABLE'
          : 'NO CANDIDATES';
  return {
    enabled: status !== 'disabled',
    status,
    statusLabel,
    statusTone: status === 'loading' ? 'info' : status === 'no_candidates' ? 'warning' : 'unavailable',
    summary,
    routeLabel: safeText(input.routeLabel, 'No active route'),
    delayMinutes: minutes,
    delayLabel: formatDelay(minutes),
    beforeSunset: input.beforeSunset,
    endpoints: [],
    recommendedEndpoint: null,
    backupEndpoint: null,
    emergencyEndpoint: null,
    plannedCampStatus: 'not_linked',
    plannedCampDowngradeReason: null,
    plannedCampGateResults: [],
    decisionDeadlineText: 'Unknown',
    decisionPoint: {
      available: false,
      title: 'No Decision Point',
      deadlineText: 'Unknown',
      reason: status === 'no_route' ? 'A route is required before ECS can identify a continue-or-divert point.' : 'No deterministic decision point is available.',
      continueLabel: null,
      divertLabel: null,
      continueRisk: null,
      latestTurnoffText: null,
      confidenceLabel: 'Unknown',
    },
    confidenceLabel: 'Unknown',
    confidenceReasons: [],
    inputTruth: buildInputTruth(input, null, nowIso, routeResult),
    keyRisks: [],
    warnings: [],
    assumptions: [],
    nextAction,
    canStageRoute: false,
    explanationSource: 'deterministic_campops',
    result: null,
  };
}

export function buildCampOpsSafeEndpointDecisionViewModel(
  input: BuildCampOpsSafeEndpointDecisionViewModelInput,
): CampOpsSafeEndpointDecisionViewModel {
  const nowIso = validIso(input.nowIso) ?? new Date().toISOString();
  const featureState = getCampOpsFeatureState(input.rolloutConfig ?? {});
  const routeResult = (input.candidateResult?.source ?? input.candidateResult?.analysisSource) === 'route'
    ? input.candidateResult ?? null
    : null;
  if (!featureState.endpointRecommendationEnabled) {
    return initialViewModel(input, nowIso, 'disabled', 'Safe Endpoint Decision Mode is disabled for this rollout.', 'Keep the current route and camp plan.', routeResult);
  }
  if (!input.routeAvailable) {
    return initialViewModel(input, nowIso, 'no_route', 'Load or stage a route before asking CampOps where to end the day.', 'Load a route, then reopen End Day Safely.', routeResult);
  }
  if (!routeResult && input.candidateStatus === 'loading') {
    return initialViewModel(input, nowIso, 'loading', 'CampOps is checking route-linked camp candidates.', 'Wait for the current CampOps route scan.', null);
  }
  if (!routeResult && input.candidateStatus === 'error') {
    return initialViewModel(input, nowIso, 'unavailable', 'CampOps camp candidates could not be loaded. The current route remains unchanged.', 'Keep the active plan and verify a known legal endpoint manually.', null);
  }
  if (!routeResult || routeResult.candidates.length === 0 || input.candidateStatus === 'empty') {
    return initialViewModel(input, nowIso, 'no_candidates', 'No route-linked CampOps candidates are available for a deterministic endpoint decision.', 'Keep the active plan and verify a known legal endpoint manually.', routeResult);
  }

  const searchOptions: CampOpsSearchIntegrationOptions = {
    source: 'route',
    rolloutConfig: input.rolloutConfig ?? {},
    vehicleProfile: buildVehicleProfile(input.vehicleContext),
    context: {
      id: `campops-safe-endpoint:${input.routeId ?? routeResult.routeIntelligenceId}`,
      routeId: input.routeId ?? routeResult.routeIntelligenceId,
      tripId: input.tripId ?? null,
      plannedCampId: input.plannedCampId ?? routeResult.campOps?.routeEndpointPlan?.selectedEndpointIds?.[0] ?? null,
      currentTimeIso: nowIso,
      resourceState: buildResourceState(input.vehicleContext, input.powerSnapshot),
      convoyProfile: buildConvoyProfile(input.convoyContext, input.convoyTracking),
      riskTolerance: 'conservative',
      offlineMode: normalizeOfflineMode(input.connectivityStatus),
    },
  };
  const normalized = buildCampOpsSearchInputs(routeResult, searchOptions);
  const context = buildContext(input, normalized, nowIso);
  const previousSet = routeResult.campOps?.recommendationSet ?? null;
  const enrichmentsByCandidateId: Record<string, CampCandidateEnrichment> = {};
  normalized.candidates.forEach((candidate) => {
    const current = normalized.enrichmentsByCandidateId[candidate.id];
    if (!current) return;
    enrichmentsByCandidateId[candidate.id] = mergeEnrichment(
      candidate,
      current,
      previousSet?.enrichmentsByCandidateId?.[candidate.id],
      context,
    );
  });
  const result = findCampOpsSafeEndPoint({
    rolloutConfig: input.rolloutConfig ?? {},
    context,
    delayScenario: input.delayScenario,
    beforeSunset: input.beforeSunset,
    candidates: normalized.candidates,
    enrichmentsByCandidateId,
  });
  const set = result.recommendationSet;
  const recommendedEndpoint = optionViewModel('recommended', result.decisionSummary.recommendedSafeEndpoint, set, result.context, routeResult.analyzedAt);
  const backupEndpoint = optionViewModel('backup', result.decisionSummary.backupEndpoint, set, result.context, routeResult.analyzedAt);
  const emergencyEndpoint = optionViewModel('emergency', result.decisionSummary.emergencyEndpoint, set, result.context, routeResult.analyzedAt);
  const endpoints = [recommendedEndpoint, backupEndpoint, emergencyEndpoint].filter(
    (endpoint): endpoint is CampOpsSafeEndpointOptionViewModel => Boolean(endpoint),
  );
  const plannedId = result.context.plannedCampId;
  const plannedRejection = plannedId
    ? set.rejectedCandidates.find((item) => item.candidate.id === plannedId) ?? null
    : null;
  const plannedCampStatus = !plannedId
    ? 'not_linked'
    : plannedRejection
      ? 'rejected'
      : result.decisionSummary.plannedCampDowngradeReason || recommendedEndpoint?.candidate.id !== plannedId
        ? 'downgraded'
        : 'viable';
  const status: CampOpsSafeEndpointDecisionStatus = recommendedEndpoint
    ? 'recommended'
    : emergencyEndpoint
      ? 'emergency_only'
      : 'no_safe_endpoint';
  const summary = recommendedEndpoint
    ? `${recommendedEndpoint.name} is the deterministic CampOps endpoint for this scenario. Verify access before committing.`
    : emergencyEndpoint
      ? `No primary endpoint cleared. ${emergencyEndpoint.name} is emergency-only.`
      : 'No endpoint cleared the current CampOps gates.';
  const statusLabel = status === 'recommended' ? 'ENDPOINT FOUND' : status === 'emergency_only' ? 'EMERGENCY ONLY' : 'NO ENDPOINT CLEARED';
  return {
    enabled: true,
    status,
    statusLabel,
    statusTone: status === 'recommended' ? 'ready' : status === 'emergency_only' ? 'warning' : 'unavailable',
    summary,
    routeLabel: safeText(input.routeLabel ?? routeResult.routeName, 'Current route'),
    delayMinutes: result.decisionSummary.delayEstimateMinutes,
    delayLabel: formatDelay(result.decisionSummary.delayEstimateMinutes),
    beforeSunset: input.beforeSunset,
    endpoints,
    recommendedEndpoint,
    backupEndpoint,
    emergencyEndpoint,
    plannedCampStatus,
    plannedCampDowngradeReason: result.decisionSummary.plannedCampDowngradeReason
      ? safeText(result.decisionSummary.plannedCampDowngradeReason)
      : null,
    plannedCampGateResults: plannedRejection
      ? plannedRejection.gates.map((gate) => `${humanize(gate.state)}: ${safeText(gate.reason)}`)
      : [],
    decisionDeadlineText: formatClock(result.decisionSummary.decisionDeadlineIso),
    decisionPoint: decisionPointViewModel(result),
    confidenceLabel: humanize(set.confidenceSummary.level),
    confidenceReasons: set.confidenceSummary.reasons.map((reason) => safeText(reason)).slice(0, 5),
    inputTruth: buildInputTruth(input, result.context, nowIso, routeResult),
    keyRisks: result.decisionSummary.keyRisks.map((risk) => safeText(risk)).slice(0, 8),
    warnings: set.warnings.map((warning) => safeText(warning)).slice(0, 8),
    assumptions: set.assumptions.map((assumption) => safeText(assumption)).slice(0, 6),
    nextAction: safeText(result.decisionSummary.nextAction),
    canStageRoute: endpoints.length > 0,
    explanationSource: 'deterministic_campops',
    result,
  };
}

export function buildCampOpsSafeEndpointMapPreviewIntent(
  endpoint: CampOpsSafeEndpointOptionViewModel | null | undefined,
): CampOpsSafeEndpointMapPreviewIntent | null {
  if (!endpoint) return null;
  const latitude = endpoint.candidate.location.latitude;
  const longitude = endpoint.candidate.location.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    candidateId: endpoint.candidate.id,
    title: endpoint.name,
    coordinate: { latitude, longitude },
  };
}

export function buildCampOpsSafeEndpointRouteStageIntent(
  endpoint: CampOpsSafeEndpointOptionViewModel | null | undefined,
): CampOpsSafeEndpointRouteStageIntent | null {
  const preview = buildCampOpsSafeEndpointMapPreviewIntent(endpoint);
  if (!preview || !endpoint) return null;
  return {
    actionId: `campops-safe-endpoint:${preview.candidateId}`,
    title: preview.title,
    subtitle: `${endpoint.roleLabel} / ${endpoint.confidenceLabel} confidence`,
    latitude: preview.coordinate.latitude,
    longitude: preview.coordinate.longitude,
    raw: {
      campOpsCandidateId: preview.candidateId,
      campOpsRole: endpoint.role,
      source: endpoint.candidate.source,
      sourceConfidence: endpoint.candidate.sourceConfidence,
      decisionMode: 'safe_endpoint',
    },
  };
}
