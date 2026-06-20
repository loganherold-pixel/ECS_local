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
import { normalizeNavigationGuidanceGeometry } from '../navigationCatalogGuidanceGeometry';

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

function emptyCandidateSet(): ExploreWizardCandidateSet {
  return {
    candidates: [],
    hiddenRoutes: [],
    hiddenTotal: 0,
    hiddenBySource: emptyHiddenCounts(),
    hiddenReasons: [],
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

function routeAllowsLoopGuidance(route: ExpeditionOpportunity): boolean {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const catalogVerification = record(metadata.catalogVerification);
  const values = [
    routeRecord.routeType,
    routeRecord.route_type,
    metadata.routeType,
    metadata.route_type,
    metadata.trailPackRouteType,
    metadata.trail_pack_route_type,
    metadata.routeShape,
    metadata.route_shape,
    metadata.guidanceRouteShape,
    metadata.guidance_route_shape,
    catalogVerification.routeType,
    catalogVerification.route_type,
  ];
  const hasLoopType = values.some((entry) => {
    const normalized = String(entry ?? '').trim().toLowerCase();
    return normalized === 'loop' || normalized === 'closed_loop' || normalized === 'loop_route';
  });
  return hasLoopType ||
    routeRecord.allowLoopGuidance === true ||
    metadata.allowLoopGuidance === true ||
    catalogVerification.allowLoopGuidance === true;
}

function hasReadyNormalizedGeometry(route: ExpeditionOpportunity): boolean {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const allowLoop = routeAllowsLoopGuidance(route);
  const fields = [
    routeRecord.routeGeometry,
    routeRecord.route_geometry,
    routeRecord.trailGeometry,
    routeRecord.trail_geometry,
    routeRecord.geometry,
    metadata.routeGeometry,
    metadata.route_geometry,
    metadata.trailGeometry,
    metadata.trail_geometry,
    metadata.geometry,
  ];

  return fields.some((field) => {
    const normalized = normalizeNavigationGuidanceGeometry(field, { allowLoop });
    return normalized.status === 'ready' && normalized.points.length > 1;
  });
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

  const activeGuidanceStatus = String(activeGuidance.status ?? '').trim().toLowerCase();
  if (activeGuidanceStatus === 'preview_only' || activeGuidanceStatus === 'unavailable') return false;
  if (routeGeometryMode === 'omitted') return false;
  if (routeGeometryMode === 'preview_simplified') {
    return activeGuidanceReady && hasReadyNormalizedGeometry(route);
  }
  if (!activeGuidanceReady && !stitchedOrFullGeometry) {
    return hasReadyNormalizedGeometry(route);
  }
  return hasReadyNormalizedGeometry(route);
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

type EligibilityResolver = (route: ExpeditionOpportunity) => ExploreReadyRouteEligibilityResult;

function createEligibilityResolver(input: ExploreGuidanceReadyInventoryInput): EligibilityResolver {
  const isRouteEligible = input.isRouteEligible ?? defaultExploreReadyRouteEligibility;
  const routeObjectCache = new WeakMap<object, ExploreReadyRouteEligibilityResult>();

  const resolve: EligibilityResolver = (route) => {
    const cachedByObject = routeObjectCache.get(route as unknown as object);
    if (cachedByObject) return cachedByObject;

    const eligibility = isRouteEligible(route);
    routeObjectCache.set(route as unknown as object, eligibility);
    return eligibility;
  };

  SOURCE_ORDER.forEach((source) => {
    (input[source.key] ?? []).forEach(resolve);
  });

  return resolve;
}

function buildForRefinement(
  input: ExploreGuidanceReadyInventoryInput,
  refinement: ExploreRefinementFilter | null,
  getEligibility: EligibilityResolver,
): ExploreWizardCandidateSet {
  const eligibleInput: NormalizeExploreWizardCandidatesInput = {};
  const hiddenRoutes: ExploreWizardHiddenRoute[] = [];
  const hiddenBySource = emptyHiddenCounts();

  SOURCE_ORDER.forEach((source) => {
    const routes = input[source.key] ?? [];
    const refinedRoutes = applyExploreRefinementFilter(routes, refinement);
    eligibleInput[source.key] = [];

    refinedRoutes.forEach((route) => {
      const eligibility = getEligibility(route);
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

function countEligibleRoutesForRefinement(
  input: ExploreGuidanceReadyInventoryInput,
  refinement: ExploreRefinementFilter | null,
  getEligibility: EligibilityResolver,
): number {
  return SOURCE_ORDER.reduce((total, source) => {
    const routes = input[source.key] ?? [];
    const refinedRoutes = applyExploreRefinementFilter(routes, refinement);
    return total + refinedRoutes.reduce((sourceTotal, route) => {
      return sourceTotal + (getEligibility(route).eligible ? 1 : 0);
    }, 0);
  }, 0);
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
  const getEligibility = createEligibilityResolver(input);
  const refinementCounts = EXPLORE_REFINEMENT_OPTIONS.reduce(
    (counts, option) => {
      counts[option.key] = countEligibleRoutesForRefinement(input, option.key, getEligibility);
      return counts;
    },
    {
      remoteness: 0,
      dayTrip: 0,
      weekendTrip: 0,
      expedition: 0,
    } as Record<ExploreRefinementFilter, number>,
  );
  const candidateSet = selectedRefinement
    ? buildForRefinement(input, selectedRefinement, getEligibility)
    : emptyCandidateSet();

  return {
    candidateSet,
    readyCount: candidateSet.candidates.length,
    totalReadyCount: countEligibleRoutesForRefinement(input, null, getEligibility),
    refinementCounts,
    sourceCounts: sourceCounts(candidateSet),
    hiddenTotal: candidateSet.hiddenTotal,
    hiddenBySource: candidateSet.hiddenBySource,
    hiddenReasons: candidateSet.hiddenReasons,
  };
}
