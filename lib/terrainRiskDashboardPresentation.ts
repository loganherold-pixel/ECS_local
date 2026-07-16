import type { ECSAsyncSurfaceStatus } from './state/asyncSurfaceState';
import type {
  SourceTruthConfidence,
  SourceTruthCoverage,
  SourceTruthFreshness,
  SourceTruthOrigin,
} from './sourceTruth';
import type {
  TerrainHazard,
  TerrainProfilePoint,
  TerrainRiskRoute,
} from './terrainRiskCommandProfile';
import { downsampleTerrainProfilePreservingExtrema } from './terrainRiskCommandProfile';
import type { TerrainElevationSegment } from './terrainElevationRouteEngine';

export type TerrainRiskMissingDataReason =
  | 'no_active_route'
  | 'route_geometry_unavailable'
  | 'elevation_profile_loading'
  | 'elevation_samples_unavailable'
  | 'insufficient_elevation_samples'
  | 'partial_elevation_profile'
  | 'route_analysis_stale'
  | 'source_freshness_unavailable'
  | 'provider_unavailable'
  | 'provider_error'
  | 'request_cancelled';

export type TerrainRiskProfileSource = {
  label: string;
  origin: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  confidence: SourceTruthConfidence;
  coverage: SourceTruthCoverage;
  observedAt: string | null;
  provider: string | null;
};

export type TerrainRiskUpcomingHighPoint = {
  distanceMiles: number;
  distanceAheadMiles: number;
  elevationFeet: number;
};

export type TerrainRiskDashboardPresentation = {
  status: ECSAsyncSurfaceStatus;
  routeIdentity: { id: string; name: string; fingerprint: string | null } | null;
  profile: TerrainProfilePoint[];
  completedProfile: TerrainProfilePoint[];
  remainingProfile: TerrainProfilePoint[];
  currentProgressDistanceMiles: number | null;
  currentElevationFeet: number | null;
  currentElevationSource: 'gps' | 'route_profile' | 'unknown';
  upcomingHighPoint: TerrainRiskUpcomingHighPoint | null;
  elevationGainRemainingFeet: number | null;
  riskSegments: TerrainElevationSegment[];
  nextMaterialTerrainRiskEvent: TerrainHazard | null;
  source: TerrainRiskProfileSource;
  confidence: SourceTruthConfidence;
  missingDataReason: TerrainRiskMissingDataReason | null;
  technicalDifficultyCaveat: string;
};

export type BuildTerrainRiskDashboardPresentationInput = {
  active: boolean;
  routeIdentity?: { id?: string | null; name?: string | null; fingerprint?: string | null } | null;
  route?: TerrainRiskRoute | null;
  completedDistanceMiles?: number | null;
  currentGpsElevation?: {
    elevationFeet: number | null;
    freshness: SourceTruthFreshness;
  } | null;
  source?: Partial<TerrainRiskProfileSource> | null;
  requestStatus?: ECSAsyncSurfaceStatus;
  missingDataReason?: TerrainRiskMissingDataReason | null;
};

export function getTerrainRiskDashboardPresentationTitle(
  presentation: TerrainRiskDashboardPresentation,
): string {
  if (presentation.status === 'loading') return 'Elevation profile loading';
  if (presentation.missingDataReason === 'no_active_route') return 'No active route';
  if (presentation.missingDataReason === 'route_geometry_unavailable') return 'Route geometry unavailable';
  if (presentation.missingDataReason === 'partial_elevation_profile') return 'Partial elevation profile';
  return 'Elevation profile unavailable';
}

export function getTerrainRiskDashboardPresentationDetail(
  presentation: TerrainRiskDashboardPresentation,
): string {
  switch (presentation.missingDataReason) {
    case 'no_active_route':
      return 'Start route guidance to load deterministic terrain analysis.';
    case 'route_geometry_unavailable':
      return 'Active guidance has no canonical route geometry to analyze.';
    case 'elevation_profile_loading':
      return 'Requesting route elevation samples from the configured terrain provider.';
    case 'provider_unavailable':
      return 'The terrain elevation provider is not configured or available.';
    case 'provider_error':
      return 'The terrain elevation request failed. Existing route geometry remains available.';
    case 'request_cancelled':
      return 'The elevation request was cancelled before it completed.';
    case 'insufficient_elevation_samples':
    case 'partial_elevation_profile':
      return 'The route does not contain enough continuous elevation samples for a complete profile.';
    case 'route_analysis_stale':
      return 'The displayed route analysis is stale and should be refreshed before relying on it.';
    case 'source_freshness_unavailable':
      return 'The profile timestamp is missing, invalid, or outside the route-package freshness window.';
    case 'elevation_samples_unavailable':
    default:
      return 'Elevation profile unavailable; route presence alone cannot produce a mountain graph.';
  }
}

const DEFAULT_SOURCE: TerrainRiskProfileSource = {
  label: 'Elevation profile unavailable',
  origin: 'unavailable',
  freshness: 'unavailable',
  confidence: 'unknown',
  coverage: 'unknown',
  observedAt: null,
  provider: null,
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function interpolateProfilePoint(
  profile: TerrainProfilePoint[],
  distanceMiles: number,
): TerrainProfilePoint | null {
  if (profile.length === 0) return null;
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (distanceMiles <= first.distanceMiles) return { ...first, distanceMiles };
  if (distanceMiles >= last.distanceMiles) return { ...last, distanceMiles };

  const nextIndex = profile.findIndex((point) => point.distanceMiles >= distanceMiles);
  if (nextIndex <= 0) return { ...first, distanceMiles };
  const previous = profile[nextIndex - 1];
  const next = profile[nextIndex];
  const span = Math.max(0.000001, next.distanceMiles - previous.distanceMiles);
  const ratio = clampNumber((distanceMiles - previous.distanceMiles) / span, 0, 1);
  const riskScore = previous.riskScore + (next.riskScore - previous.riskScore) * ratio;
  return {
    ...next,
    distanceMiles,
    elevationFeet: previous.elevationFeet + (next.elevationFeet - previous.elevationFeet) * ratio,
    riskScore,
    riskLevel: ratio < 0.5 ? previous.riskLevel : next.riskLevel,
    gradePercent: (previous.gradePercent ?? 0) + ((next.gradePercent ?? 0) - (previous.gradePercent ?? 0)) * ratio,
    hazardKinds: [],
  };
}

export function splitTerrainProfileAtProgress(
  profile: TerrainProfilePoint[],
  completedDistanceMiles: number,
): { completed: TerrainProfilePoint[]; remaining: TerrainProfilePoint[]; boundary: TerrainProfilePoint | null } {
  if (profile.length === 0) return { completed: [], remaining: [], boundary: null };
  const start = profile[0].distanceMiles;
  const end = profile[profile.length - 1].distanceMiles;
  const progress = clampNumber(completedDistanceMiles, start, end);
  const boundary = interpolateProfilePoint(profile, progress);
  if (!boundary) return { completed: [], remaining: [], boundary: null };

  const completed = profile.filter((point) => point.distanceMiles < progress);
  const remaining = profile.filter((point) => point.distanceMiles > progress);
  completed.push(boundary);
  remaining.unshift(boundary);
  return { completed, remaining, boundary };
}

export function buildTerrainRiskChartSeries(
  profile: readonly TerrainProfilePoint[],
  maxPoints = 96,
): TerrainProfilePoint[] {
  return downsampleTerrainProfilePreservingExtrema(profile, maxPoints);
}

function remainingElevationGain(
  segments: TerrainElevationSegment[],
  completedDistanceMiles: number,
): number {
  return Math.round(segments.reduce((total, segment) => {
    if (segment.endDistanceMiles <= completedDistanceMiles) return total;
    if (segment.startDistanceMiles >= completedDistanceMiles || segment.distanceMiles <= 0) {
      return total + segment.elevationGainFeet;
    }
    const remainingRatio = clampNumber(
      (segment.endDistanceMiles - completedDistanceMiles) / segment.distanceMiles,
      0,
      1,
    );
    return total + segment.elevationGainFeet * remainingRatio;
  }, 0));
}

function materialRiskSegments(
  segments: TerrainElevationSegment[],
  completedDistanceMiles: number,
): TerrainElevationSegment[] {
  return segments.filter((segment) =>
    segment.endDistanceMiles > completedDistanceMiles &&
    (segment.hazardKinds.length > 0 || segment.riskLevel === 'high'),
  );
}

function hazardFromSegment(
  segment: TerrainElevationSegment | undefined,
  completedDistanceMiles: number,
): TerrainHazard | null {
  if (!segment) return null;
  return {
    id: segment.id,
    label: segment.label,
    distanceMiles: Math.max(0, segment.startDistanceMiles - completedDistanceMiles),
    riskLevel: segment.riskLevel,
    actionLabel: 'View on Map',
    segmentId: segment.id,
    hazardKinds: segment.hazardKinds,
  };
}

function normalizeSource(
  source: Partial<TerrainRiskProfileSource> | null | undefined,
): TerrainRiskProfileSource {
  return {
    ...DEFAULT_SOURCE,
    ...source,
    label: source?.label?.trim() || DEFAULT_SOURCE.label,
  };
}

function terminalMissingStatus(status: ECSAsyncSurfaceStatus | undefined): ECSAsyncSurfaceStatus {
  if (status === 'loading' || status === 'error' || status === 'cancelled' || status === 'disabled') return status;
  return 'empty';
}

export function buildTerrainRiskDashboardPresentation(
  input: BuildTerrainRiskDashboardPresentationInput,
): TerrainRiskDashboardPresentation {
  const source = normalizeSource(input.source);
  const identityId = input.routeIdentity?.id?.trim() || input.route?.id || null;
  const identityName = input.routeIdentity?.name?.trim() || input.route?.name || 'Active route';
  const routeIdentity = identityId
    ? { id: identityId, name: identityName, fingerprint: input.routeIdentity?.fingerprint?.trim() || null }
    : null;
  const truthfulRoute = input.route?.dataState === 'live-route' ? input.route : null;
  const technicalDifficultyCaveat = 'Elevation and grade do not establish surface condition, legal access, or technical trail difficulty.';

  if (!input.active) {
    return {
      status: 'idle',
      routeIdentity: null,
      profile: [],
      completedProfile: [],
      remainingProfile: [],
      currentProgressDistanceMiles: null,
      currentElevationFeet: null,
      currentElevationSource: 'unknown',
      upcomingHighPoint: null,
      elevationGainRemainingFeet: null,
      riskSegments: [],
      nextMaterialTerrainRiskEvent: null,
      source,
      confidence: 'unknown',
      missingDataReason: 'no_active_route',
      technicalDifficultyCaveat,
    };
  }

  if (!truthfulRoute || truthfulRoute.profile.length < 2) {
    return {
      status: terminalMissingStatus(input.requestStatus),
      routeIdentity,
      profile: [],
      completedProfile: [],
      remainingProfile: [],
      currentProgressDistanceMiles: null,
      currentElevationFeet: null,
      currentElevationSource: 'unknown',
      upcomingHighPoint: null,
      elevationGainRemainingFeet: null,
      riskSegments: [],
      nextMaterialTerrainRiskEvent: null,
      source,
      confidence: source.confidence,
      missingDataReason: input.missingDataReason ?? (
        input.requestStatus === 'loading' ? 'elevation_profile_loading' : 'elevation_samples_unavailable'
      ),
      technicalDifficultyCaveat,
    };
  }

  const progress = clampNumber(
    finiteNumber(input.completedDistanceMiles) ? input.completedDistanceMiles : 0,
    0,
    truthfulRoute.totalDistanceMiles,
  );
  const routeSource: TerrainRiskProfileSource = source.coverage === 'unknown'
    ? { ...source, coverage: truthfulRoute.elevationCoverage }
    : source;
  const split = splitTerrainProfileAtProgress(truthfulRoute.profile, progress);
  const gpsElevationUsable = finiteNumber(input.currentGpsElevation?.elevationFeet) &&
    (input.currentGpsElevation?.freshness === 'live' || input.currentGpsElevation?.freshness === 'recent');
  const currentElevationFeet = gpsElevationUsable
    ? Math.round(input.currentGpsElevation?.elevationFeet as number)
    : split.boundary
      ? Math.round(split.boundary.elevationFeet)
      : null;
  const remaining = split.remaining.length > 0 ? split.remaining : truthfulRoute.profile.slice(-1);
  const upcomingHighPointRaw = remaining.reduce<TerrainProfilePoint | null>(
    (highest, point) => !highest || point.elevationFeet > highest.elevationFeet ? point : highest,
    null,
  );
  const upcomingHighPoint = upcomingHighPointRaw
    ? {
        distanceMiles: upcomingHighPointRaw.distanceMiles,
        distanceAheadMiles: Math.max(0, upcomingHighPointRaw.distanceMiles - progress),
        elevationFeet: Math.round(upcomingHighPointRaw.elevationFeet),
      }
    : null;
  const riskSegments = materialRiskSegments(truthfulRoute.terrainSegments, progress);
  const sourceFreshnessUnavailable = routeSource.freshness === 'unavailable';
  const status: ECSAsyncSurfaceStatus = sourceFreshnessUnavailable
    ? 'degraded'
    : routeSource.freshness === 'stale' || routeSource.freshness === 'expired'
      ? 'stale'
      : routeSource.coverage === 'partial'
        ? 'degraded'
        : 'ready';

  return {
    status,
    routeIdentity: {
      id: truthfulRoute.id,
      name: truthfulRoute.name,
      fingerprint: input.routeIdentity?.fingerprint?.trim() || null,
    },
    profile: truthfulRoute.profile,
    completedProfile: split.completed,
    remainingProfile: split.remaining,
    currentProgressDistanceMiles: progress,
    currentElevationFeet,
    currentElevationSource: gpsElevationUsable ? 'gps' : currentElevationFeet != null ? 'route_profile' : 'unknown',
    upcomingHighPoint,
    elevationGainRemainingFeet: remainingElevationGain(truthfulRoute.terrainSegments, progress),
    riskSegments,
    nextMaterialTerrainRiskEvent: hazardFromSegment(riskSegments[0], progress),
    source: routeSource,
    confidence: routeSource.confidence,
    missingDataReason: sourceFreshnessUnavailable
      ? 'source_freshness_unavailable'
      : status === 'stale'
        ? 'route_analysis_stale'
        : status === 'degraded'
          ? 'partial_elevation_profile'
          : null,
    technicalDifficultyCaveat,
  };
}
