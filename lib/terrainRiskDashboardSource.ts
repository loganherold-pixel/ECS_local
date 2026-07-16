import { evaluateSourceTruthRef } from './sourceTruth';
import type {
  SourceTruthConfidence,
  SourceTruthCoverage,
  SourceTruthOrigin,
  SourceTruthPolicyOptions,
} from './sourceTruth';
import type { TerrainRiskProfileSource } from './terrainRiskDashboardPresentation';

export type TerrainRiskProfileSourceInput = {
  label: string;
  origin: SourceTruthOrigin;
  confidence: SourceTruthConfidence;
  coverage: SourceTruthCoverage;
  observedAt?: string | null;
  provider?: string | null;
  now?: SourceTruthPolicyOptions['now'];
};

export type TerrainRiskRouteIdentity = {
  id?: string | null;
  linked_run_id?: string | null;
};

export type TerrainRiskElevationSample = {
  elevationFeet?: number | null;
  ele_m?: number | null;
  ele?: number | null;
};

export type TerrainRiskProfileObservedAtInput = {
  sampledCompletedAt?: number | null;
  routeSourceFormat?: string | null;
  routeCapturedAt?: string | null;
  routeCreatedAt?: string | null;
  routeUpdatedAt?: string | null;
  guidanceUpdatedAt?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

/**
 * A saved/imported route can be mounted through its route id or through the
 * Navigate run that the route was linked to when guidance started.
 */
export function isTerrainRiskProfileRouteForProgress(
  route: TerrainRiskRouteIdentity | null | undefined,
  activeRouteId: string | null | undefined,
): boolean {
  const progressId = normalizeText(activeRouteId);
  if (!route || !progressId) return false;
  return normalizeText(route.id) === progressId || normalizeText(route.linked_run_id) === progressId;
}

/** Counts drawable elevation observations, not merely returned coordinates. */
export function countFiniteTerrainElevationSamples(
  points: readonly TerrainRiskElevationSample[] | null | undefined,
): number {
  return (points ?? []).reduce((count, point) => {
    const hasElevation = [point.elevationFeet, point.ele_m, point.ele]
      .some((value) => typeof value === 'number' && Number.isFinite(value));
    return count + (hasElevation ? 1 : 0);
  }, 0);
}

export function resolveTerrainRiskProfileObservedAt(
  input: TerrainRiskProfileObservedAtInput,
): string | null {
  if (typeof input.sampledCompletedAt === 'number' && Number.isFinite(input.sampledCompletedAt)) {
    return new Date(input.sampledCompletedAt).toISOString();
  }
  if (normalizeText(input.routeSourceFormat) === 'custom') {
    return normalizeText(input.routeUpdatedAt)
      ?? normalizeText(input.routeCapturedAt)
      ?? normalizeText(input.routeCreatedAt);
  }
  if (normalizeText(input.routeSourceFormat)) {
    return normalizeText(input.routeCapturedAt) ?? normalizeText(input.routeCreatedAt);
  }
  return normalizeText(input.guidanceUpdatedAt);
}

/**
 * Classifies elevation-profile freshness from its actual observation/update
 * timestamp using the existing ECS offline route-package policy. Missing
 * timestamps remain unavailable instead of implying that cached geometry is
 * recent or that an unknown canonical source is live.
 */
export function classifyTerrainRiskProfileSource(
  input: TerrainRiskProfileSourceInput,
): TerrainRiskProfileSource {
  const observedAt = normalizeText(input.observedAt);
  const provider = normalizeText(input.provider);
  const policyKey = input.origin === 'manual'
    ? 'manual_user_state'
    : 'offline_map_route_package';
  const observedAtValid = observedAt != null && Number.isFinite(Date.parse(observedAt));
  const freshness = !observedAtValid
    ? 'unavailable'
    : evaluateSourceTruthRef({
        id: 'dashboard_terrain_risk_profile',
        origin: input.origin,
        role: 'primary',
        policyKey,
        provider,
        observedAt,
        fetchedAt: null,
        expiresAt: null,
        confidence: input.confidence,
        coverage: input.coverage,
        availability: input.origin === 'unavailable' ? 'unavailable' : 'usable',
        warningCodes: [],
      }, {
        policyKey,
        now: input.now,
      }).freshness;

  return {
    label: normalizeText(input.label) ?? 'Elevation profile unavailable',
    origin: input.origin,
    freshness,
    confidence: input.confidence,
    coverage: input.coverage,
    observedAt,
    provider,
  };
}
