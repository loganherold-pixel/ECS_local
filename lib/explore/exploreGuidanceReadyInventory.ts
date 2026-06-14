import {
  MIN_DISCOVERY_ROUTE_MILES,
  type ExpeditionOpportunity,
} from '../discoverEngine';
import {
  EXPLORE_REFINEMENT_OPTIONS,
  applyExploreRefinementFilter,
  type ExploreRefinementFilter,
} from './exploreRefinementFilter';
import {
  normalizeExploreWizardRouteCandidates,
  type ExploreWizardCandidateSet,
  type ExploreWizardHiddenRoute,
  type ExploreWizardRouteSourceKind,
  type NormalizeExploreWizardCandidatesInput,
} from './exploreTripBuilderWizard';

export type ExploreReadyRouteEligibilityResult = {
  eligible: boolean;
  reason: string | null;
};

export type ExploreGuidanceReadyInventoryInput = NormalizeExploreWizardCandidatesInput & {
  selectedRefinement?: ExploreRefinementFilter | null;
  isRouteEligible?: (route: ExpeditionOpportunity) => ExploreReadyRouteEligibilityResult;
};

export type ExploreGuidanceReadyInventory = {
  candidateSet: ExploreWizardCandidateSet;
  readyCount: number;
  totalReadyCount: number;
  refinementCounts: Record<ExploreRefinementFilter, number>;
  sourceCounts: Record<ExploreWizardRouteSourceKind | 'all', number>;
  hiddenTotal: number;
  hiddenBySource: Record<ExploreWizardRouteSourceKind, number>;
  hiddenReasons: ExploreWizardHiddenRoute[];
};

const SOURCE_ORDER: Array<{
  key: keyof NormalizeExploreWizardCandidatesInput;
  sourceKind: ExploreWizardRouteSourceKind;
}> = [
  { key: 'trailPacks', sourceKind: 'trail_pack' },
  { key: 'hiddenGemRoutes', sourceKind: 'hidden_gem' },
  { key: 'ecsRouteIdeas', sourceKind: 'ecs_idea' },
  { key: 'favoriteRoutes', sourceKind: 'saved_built' },
  { key: 'savedRouteAssets', sourceKind: 'imported_stitched' },
];

function emptyHiddenCounts(): Record<ExploreWizardRouteSourceKind, number> {
  return {
    trail_pack: 0,
    hidden_gem: 0,
    ecs_idea: 0,
    saved_built: 0,
    imported_stitched: 0,
  };
}

function emptySourceCounts(): Record<ExploreWizardRouteSourceKind | 'all', number> {
  return {
    all: 0,
    trail_pack: 0,
    hidden_gem: 0,
    ecs_idea: 0,
    saved_built: 0,
    imported_stitched: 0,
  };
}

function metadataRecord(route: ExpeditionOpportunity | null | undefined): Record<string, unknown> {
  const metadata = route?.routeMetadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasLineStringGeometry(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.length < 2) return false;
    const first = value[0];
    return Array.isArray(first)
      ? Number.isFinite(Number(first[0])) && Number.isFinite(Number(first[1]))
      : record(first).lat != null || record(first).latitude != null;
  }

  const geometry = record(value);
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : null;
  if (geometry.type === 'LineString' && coordinates && coordinates.length > 1) return true;
  if (Array.isArray(geometry.points) && geometry.points.length > 1) return true;
  return false;
}

export function hasExploreGuidanceReadyGeometry(
  route: ExpeditionOpportunity | null | undefined,
): route is ExpeditionOpportunity {
  if (!route) return false;
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const catalogVerification = record(metadata.catalogVerification);
  const communitySignal = record(routeRecord.communitySignal ?? metadata.communitySignal);
  const activeGuidance = record(
    routeRecord.activeGuidance ??
      metadata.activeGuidance ??
      catalogVerification.activeGuidance ??
      communitySignal.activeGuidance,
  );
  const routeGeometryMode = String(
    routeRecord.routeGeometryMode ??
      metadata.routeGeometryMode ??
      catalogVerification.routeGeometryMode ??
      '',
  );
  const activeGuidanceReady =
    activeGuidance.status === 'ready' ||
    activeGuidance.guidanceReady === true ||
    activeGuidance.available === true;
  const stitchedOrFullGeometry =
    routeGeometryMode === 'full' ||
    routeGeometryMode === 'stitched' ||
    String(metadata.geometrySource ?? '').includes('stitched');

  return (
    activeGuidanceReady ||
    stitchedOrFullGeometry ||
    hasLineStringGeometry(routeRecord.routeGeometry) ||
    hasLineStringGeometry(routeRecord.trailGeometry) ||
    hasLineStringGeometry(metadata.routeGeometry) ||
    hasLineStringGeometry(metadata.trailGeometry)
  );
}

function hasPublicExplorerState(route: ExpeditionOpportunity): boolean {
  const metadata = metadataRecord(route);
  const catalogVerification = record(metadata.catalogVerification);
  const status = String(
    (route as unknown as Record<string, unknown>).routeTypeStatus ??
      metadata.routeTypeStatus ??
      metadata.reviewStatus ??
      '',
  ).toLowerCase();
  const dataState = String(
    metadata.trailPackDataState ?? metadata.dataState ?? catalogVerification.dataState ?? '',
  ).toLowerCase();
  if (/private|draft|internal|not_public|fixture|mock/.test(status)) return false;
  if (/fixture|mock/.test(dataState)) return false;
  if (catalogVerification.publicRecommendation === false) return false;
  return true;
}

export function defaultExploreReadyRouteEligibility(
  route: ExpeditionOpportunity,
): ExploreReadyRouteEligibilityResult {
  if (!Number.isFinite(Number(route.distanceMiles)) || Number(route.distanceMiles) < MIN_DISCOVERY_ROUTE_MILES) {
    return {
      eligible: false,
      reason: `Route must be at least ${MIN_DISCOVERY_ROUTE_MILES} miles for Explorer guidance-ready cards.`,
    };
  }

  if (!hasPublicExplorerState(route)) {
    return {
      eligible: false,
      reason: 'Route is not public or production-ready for Explorer guidance-ready cards.',
    };
  }

  if (!hasExploreGuidanceReadyGeometry(route)) {
    return {
      eligible: false,
      reason: 'Active guidance requires continuous route geometry.',
    };
  }

  return { eligible: true, reason: null };
}

function sourceTitle(route: ExpeditionOpportunity): string {
  return String(route.name || route.id || 'Explore route');
}

function buildForRefinement(
  input: ExploreGuidanceReadyInventoryInput,
  refinement: ExploreRefinementFilter | null,
): ExploreWizardCandidateSet {
  const eligibleInput: NormalizeExploreWizardCandidatesInput = {};
  const hiddenRoutes: ExploreWizardHiddenRoute[] = [];
  const hiddenBySource = emptyHiddenCounts();
  const isRouteEligible = input.isRouteEligible ?? defaultExploreReadyRouteEligibility;

  SOURCE_ORDER.forEach((source) => {
    const routes = input[source.key] ?? [];
    const refinedRoutes = applyExploreRefinementFilter(routes, refinement);
    eligibleInput[source.key] = [];

    refinedRoutes.forEach((route) => {
      const eligibility = isRouteEligible(route);
      if (eligibility.eligible) {
        eligibleInput[source.key]?.push(route);
        return;
      }

      hiddenRoutes.push({
        id: String(route.id || `${source.sourceKind}:${sourceTitle(route)}`),
        sourceKind: source.sourceKind,
        title: sourceTitle(route),
        reason: eligibility.reason ?? 'Route is unavailable for Explorer guidance-ready cards.',
      });
      hiddenBySource[source.sourceKind] += 1;
    });
  });

  const normalized = normalizeExploreWizardRouteCandidates(eligibleInput);
  const combinedHiddenBySource = emptyHiddenCounts();
  SOURCE_ORDER.forEach((source) => {
    combinedHiddenBySource[source.sourceKind] =
      hiddenBySource[source.sourceKind] + normalized.hiddenBySource[source.sourceKind];
  });
  const combinedHiddenRoutes = [...hiddenRoutes, ...normalized.hiddenRoutes];

  return {
    ...normalized,
    hiddenRoutes: combinedHiddenRoutes,
    hiddenTotal: combinedHiddenRoutes.length,
    hiddenBySource: combinedHiddenBySource,
    hiddenReasons: combinedHiddenRoutes,
  };
}

function sourceCounts(candidateSet: ExploreWizardCandidateSet): Record<ExploreWizardRouteSourceKind | 'all', number> {
  const counts = emptySourceCounts();
  candidateSet.candidates.forEach((candidate) => {
    counts[candidate.sourceKind] += 1;
    counts.all += 1;
  });
  return counts;
}

export function buildExploreGuidanceReadyInventory(
  input: ExploreGuidanceReadyInventoryInput,
): ExploreGuidanceReadyInventory {
  const selectedRefinement = input.selectedRefinement ?? null;
  const totalCandidateSet = buildForRefinement(input, null);
  const candidateSet = buildForRefinement(input, selectedRefinement);
  const refinementCounts = EXPLORE_REFINEMENT_OPTIONS.reduce(
    (counts, option) => {
      counts[option.key] = buildForRefinement(input, option.key).candidates.length;
      return counts;
    },
    {
      remoteness: 0,
      dayTrip: 0,
      weekendTrip: 0,
      expedition: 0,
    } as Record<ExploreRefinementFilter, number>,
  );

  return {
    candidateSet,
    readyCount: candidateSet.candidates.length,
    totalReadyCount: totalCandidateSet.candidates.length,
    refinementCounts,
    sourceCounts: sourceCounts(candidateSet),
    hiddenTotal: candidateSet.hiddenTotal,
    hiddenBySource: candidateSet.hiddenBySource,
    hiddenReasons: candidateSet.hiddenReasons,
  };
}
