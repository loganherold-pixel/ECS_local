import type { ExpeditionOpportunity } from '../discoverEngine';
import { classifyExploreRouteAuthority } from '../exploreRouteAuthority';
import { defaultExploreReadyRouteEligibility } from './exploreGuidanceReadyInventory';
import { mergeTripBuilderRouteDetail } from '../tripBuilder/tripBuilderRouteOptions';
import {
  fetchRouteCatalogTrailPackDetail,
  type LiveTrailPackCatalogRefreshOptions,
} from './liveTrailPackCatalog';
import { isExploreRouteCatalogDetailDeferred } from './exploreTripBuilderWizard';
import {
  isPublicSuggestedTrailheadRoute,
  trailPackToExpeditionOpportunity,
  type ECSTrailPack,
} from './trailPacks';

export type ExploreTripBuilderRouteDetailResult =
  | {
      status: 'ready';
      route: ExpeditionOpportunity;
      safeErrorCode: null;
      retryEligible: false;
    }
  | {
      status: 'error';
      route: ExpeditionOpportunity;
      safeErrorCode:
        | 'ROUTE_CATALOG_DETAIL_IDENTITY_MISSING'
        | 'ROUTE_CATALOG_DETAIL_INVALID_GEOMETRY'
        | 'ROUTE_CATALOG_DETAIL_REJECTED'
        | 'ROUTE_CATALOG_DETAIL_TIMEOUT'
        | 'ROUTE_CATALOG_DETAIL_UNAVAILABLE';
      retryEligible: boolean;
    }
  | {
      status: 'cancelled';
      route: ExpeditionOpportunity;
      safeErrorCode: 'ROUTE_CATALOG_DETAIL_CANCELLED';
      retryEligible: true;
    };

type RouteDetailFetcher = (
  trailPack: ECSTrailPack | string,
  options?: LiveTrailPackCatalogRefreshOptions,
) => Promise<ECSTrailPack>;

export type ResolveExploreTripBuilderRouteDetailOptions = {
  signal?: AbortSignal;
  fetchDetail?: RouteDetailFetcher;
};

function metadataRecord(route: ExpeditionOpportunity): Record<string, unknown> {
  return route.routeMetadata && typeof route.routeMetadata === 'object'
    ? route.routeMetadata as Record<string, unknown>
    : {};
}

function failureCode(
  error: unknown,
): Extract<ExploreTripBuilderRouteDetailResult, { status: 'error' }>['safeErrorCode'] {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/timeout/i.test(message)) return 'ROUTE_CATALOG_DETAIL_TIMEOUT';
  if (/geometry/i.test(message)) return 'ROUTE_CATALOG_DETAIL_INVALID_GEOMETRY';
  return 'ROUTE_CATALOG_DETAIL_UNAVAILABLE';
}

export function getResolvedExploreTripBuilderRouteDetail(
  selectedRoute: ExpeditionOpportunity | null | undefined,
  settledDetailRoute: ExpeditionOpportunity | null | undefined,
): ExpeditionOpportunity | null {
  if (!selectedRoute) return null;
  if (!isExploreRouteCatalogDetailDeferred(selectedRoute)) return selectedRoute;
  if (!settledDetailRoute) return null;
  if (String(settledDetailRoute.id) !== String(selectedRoute.id)) return null;
  if (!classifyExploreRouteAuthority(settledDetailRoute).canUseForTrailItinerary) return null;
  return settledDetailRoute;
}

/**
 * Hydrates only the route selected for Trip Builder. The canonical catalog
 * client continues to own request dedupe, cache, timeout, and cancellation.
 */
export async function resolveExploreTripBuilderRouteDetail(
  selectedSummary: ExpeditionOpportunity,
  options: ResolveExploreTripBuilderRouteDetailOptions = {},
): Promise<ExploreTripBuilderRouteDetailResult> {
  if (!isExploreRouteCatalogDetailDeferred(selectedSummary)) {
    return {
      status: 'ready',
      route: selectedSummary,
      safeErrorCode: null,
      retryEligible: false,
    };
  }

  const metadata = metadataRecord(selectedSummary);
  const trailPackId = typeof metadata.trailPackId === 'string'
    ? metadata.trailPackId.trim()
    : '';
  const sourceVersion = typeof metadata.routeCatalogSourceVersion === 'string'
    ? metadata.routeCatalogSourceVersion
    : null;
  if (!trailPackId) {
    return {
      status: 'error',
      route: selectedSummary,
      safeErrorCode: 'ROUTE_CATALOG_DETAIL_IDENTITY_MISSING',
      retryEligible: false,
    };
  }

  try {
    const detail = await (options.fetchDetail ?? fetchRouteCatalogTrailPackDetail)(trailPackId, {
      sourceVersion,
      signal: options.signal,
      cancellationReason: 'superseded',
    });
    if (options.signal?.aborted) {
      return {
        status: 'cancelled',
        route: selectedSummary,
        safeErrorCode: 'ROUTE_CATALOG_DETAIL_CANCELLED',
        retryEligible: true,
      };
    }
    const hydratedBase = trailPackToExpeditionOpportunity(detail) as ExpeditionOpportunity;
    const hydrated = {
      ...hydratedBase,
      id: selectedSummary.id,
      distanceFromUserMiles:
        selectedSummary.distanceFromUserMiles ?? hydratedBase.distanceFromUserMiles,
      routeMetadata: {
        ...(hydratedBase.routeMetadata ?? {}),
        identityKey: metadata.identityKey ?? hydratedBase.routeMetadata?.identityKey,
        routeCatalogSourceVersion: detail.updatedAt ?? sourceVersion,
        routeCatalogSummaryState: 'ready',
      },
    } as ExpeditionOpportunity;
    const hydratedEligibility = defaultExploreReadyRouteEligibility(hydrated);
    const hydratedNonGeometryBlockers = hydratedEligibility.exclusionCodes.filter(
      (code) => code !== 'missing_geometry' && code !== 'invalid_geometry',
    );
    if (hydratedNonGeometryBlockers.length > 0 || !isPublicSuggestedTrailheadRoute(hydrated)) {
      return {
        status: 'error',
        route: selectedSummary,
        safeErrorCode: 'ROUTE_CATALOG_DETAIL_REJECTED',
        retryEligible: false,
      };
    }
    const mergedRoute = mergeTripBuilderRouteDetail(selectedSummary, hydrated);
    const guidanceEligibility = defaultExploreReadyRouteEligibility(mergedRoute);
    const nonGeometryBlockers = guidanceEligibility.exclusionCodes.filter(
      (code) => code !== 'missing_geometry' && code !== 'invalid_geometry',
    );
    if (nonGeometryBlockers.length > 0 || !isPublicSuggestedTrailheadRoute(mergedRoute)) {
      return {
        status: 'error',
        route: selectedSummary,
        safeErrorCode: 'ROUTE_CATALOG_DETAIL_REJECTED',
        retryEligible: false,
      };
    }
    if (!classifyExploreRouteAuthority(mergedRoute).canUseForTrailItinerary) {
      return {
        status: 'error',
        route: selectedSummary,
        safeErrorCode: 'ROUTE_CATALOG_DETAIL_INVALID_GEOMETRY',
        retryEligible: true,
      };
    }
    if (!guidanceEligibility.eligible) {
      return {
        status: 'error',
        route: selectedSummary,
        safeErrorCode: 'ROUTE_CATALOG_DETAIL_INVALID_GEOMETRY',
        retryEligible: true,
      };
    }
    return {
      status: 'ready',
      route: mergedRoute,
      safeErrorCode: null,
      retryEligible: false,
    };
  } catch (error) {
    if (options.signal?.aborted) {
      return {
        status: 'cancelled',
        route: selectedSummary,
        safeErrorCode: 'ROUTE_CATALOG_DETAIL_CANCELLED',
        retryEligible: true,
      };
    }
    return {
      status: 'error',
      route: selectedSummary,
      safeErrorCode: failureCode(error),
      retryEligible: true,
    };
  }
}
