import { addFavoriteTrail, type FavoriteTrailRecord } from '../exploreFavoritesStore';
import {
  routeStore,
  type CustomRouteSegmentInput,
  type ImportedRoute,
} from '../routeStore';
import {
  runStore,
  type BuildSnapshot,
  type ECSRun,
} from '../runStore';
import { normalizeNavigationGuidanceGeometry } from '../navigationCatalogGuidanceGeometry';
import type { RouteSegmentSourceMetadata } from '../map/dispersedCampingSegmentBuild';
import { classifyExploreRouteAvailability } from './exploreGuidanceReadyInventory';
import type { ExploreWizardRouteCandidate } from './exploreTripBuilderWizard';

export type SaveExploreRouteForPlanningResult = {
  favorite: FavoriteTrailRecord;
  route: ImportedRoute;
  run: ECSRun;
  createdRoute: boolean;
  createdRun: boolean;
};

export type SaveExploreRouteForPlanningOptions = {
  buildSnapshot?: Partial<BuildSnapshot>;
};

function routeSourceLabel(candidate: ExploreWizardRouteCandidate): string {
  switch (candidate.sourceKind) {
    case 'trail_pack':
      return 'ecs_explore_trail_pack';
    case 'hidden_gem':
      return 'ecs_explore_hidden_gem';
    case 'ecs_idea':
      return 'ecs_explore_route_idea';
    case 'saved_built':
      return 'ecs_explore_saved_built';
    case 'imported_stitched':
      return 'ecs_explore_imported_stitched';
    default:
      return 'ecs_explore_route';
  }
}

function findExistingExploreRoute(candidate: ExploreWizardRouteCandidate): ImportedRoute | null {
  const routeMetadata = candidate.route.routeMetadata ?? {};
  const routeAssetId = typeof routeMetadata.routeAssetId === 'string' ? routeMetadata.routeAssetId : null;
  if (routeAssetId) {
    const localRouteAsset = routeStore.getById(routeAssetId);
    if (localRouteAsset) return localRouteAsset;
  }

  const sourceId = candidate.savedAssetKey ?? candidate.id;
  return routeStore.getAll().find((route) => {
    if (route.source_app !== 'ecs_explore_save') return false;
    return route.external_source_id === sourceId;
  }) ?? null;
}

function buildRouteCoordinates(candidate: ExploreWizardRouteCandidate): [number, number][] {
  const payloadGeometry = candidate.navigationPayload.trailGeometry;
  const normalizedPayload = normalizeNavigationGuidanceGeometry(payloadGeometry);
  const points = normalizedPayload.points.length > 1
    ? normalizedPayload.points
    : normalizeNavigationGuidanceGeometry(
        candidate.route.routeGeometry ?? candidate.route.trailGeometry,
      ).points;

  return points
    .map((point) => [Number(point.lng), Number(point.lat)] as [number, number])
    .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function buildSourceMetadata(candidate: ExploreWizardRouteCandidate): RouteSegmentSourceMetadata {
  return {
    kind: 'snapped_trace',
    sourceLabel: routeSourceLabel(candidate),
    confidence: candidate.confidence.score != null && candidate.confidence.score >= 55
      ? 'planning_geometry'
      : 'unknown',
  };
}

function createRouteAsset(candidate: ExploreWizardRouteCandidate): ImportedRoute {
  const coordinates = buildRouteCoordinates(candidate);
  if (coordinates.length < 2) {
    throw new Error('Explore route save requires verified active-guidance geometry.');
  }

  const segment: CustomRouteSegmentInput = {
    coordinates,
    sourceMetadata: buildSourceMetadata(candidate),
  };

  return routeStore.createCustomRoute([segment], {
    name: candidate.title,
    description: candidate.route.description ?? candidate.subtitle ?? 'Explore route saved for TripBuilder planning.',
    sourceApp: 'ecs_explore_save',
    externalSourceId: candidate.savedAssetKey ?? candidate.id,
    externalSourceType: candidate.sourceKind,
  });
}

function ensureLinkedRun(
  route: ImportedRoute,
  buildSnapshot?: Partial<BuildSnapshot>,
): { route: ImportedRoute; run: ECSRun; createdRun: boolean } {
  if (route.linked_run_id) {
    const existingRun = runStore.getById(route.linked_run_id);
    if (existingRun) {
      return { route, run: existingRun, createdRun: false };
    }
  }

  const run = runStore.createFromRoute(route, buildSnapshot);
  const linkedRoute = routeStore.attachRun(route.id, run.id) ?? {
    ...route,
    linked_run_id: run.id,
  };
  return { route: linkedRoute, run, createdRun: true };
}

export async function saveExploreRouteForPlanning(
  candidate: ExploreWizardRouteCandidate,
  options: SaveExploreRouteForPlanningOptions = {},
): Promise<SaveExploreRouteForPlanningResult> {
  const availability = classifyExploreRouteAvailability(candidate.route);
  const requiresPublicEligibility =
    candidate.sourceKind !== 'saved_built' && candidate.sourceKind !== 'imported_stitched';
  if (
    !candidate.tripBuilderEligible ||
    (requiresPublicEligibility && !availability.tripBuilder.eligible)
  ) {
    throw new Error(
      candidate.tripBuilderUnavailableReason ??
        availability.tripBuilder.reason ??
        'Explore route is not eligible for Trip Builder.',
    );
  }
  if (buildRouteCoordinates(candidate).length < 2) {
    throw new Error('Explore route save requires verified route geometry.');
  }

  const favorite = addFavoriteTrail(candidate.route);
  const existingRoute = findExistingExploreRoute(candidate);
  const route = existingRoute ?? createRouteAsset(candidate);
  const linked = ensureLinkedRun(route, options.buildSnapshot);

  return {
    favorite,
    route: linked.route,
    run: linked.run,
    createdRoute: !existingRoute,
    createdRun: linked.createdRun,
  };
}
