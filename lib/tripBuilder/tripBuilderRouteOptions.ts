import type { ExpeditionOpportunity } from '../discoverEngine';
import { classifyExploreRouteAuthority } from '../exploreRouteAuthority';
import { isPublicSuggestedTrailheadRoute } from '../explore/trailPacks';
import {
  getExploreTripBuilderEligibility,
  isExploreRouteCatalogDetailDeferred,
} from '../explore/exploreTripBuilderWizard';

type RouteLike = ExpeditionOpportunity & Record<string, unknown>;

const TRUSTED_ROUTE_SOURCE_PATTERN =
  /trail_pack|trip_builder_import|operator_supplied|imported|saved|stitch|favorite|route_store|run_store|gpx|kml|geojson|custom/;
const NON_PRODUCTION_ROUTE_SOURCE_PATTERN = /fixture|mock|demo|seed|synthetic/;

function metadataRecord(route: ExpeditionOpportunity): Record<string, unknown> {
  const record = route as unknown as Record<string, unknown>;
  const metadata = record.routeMetadata ?? record.route_metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizedRouteSource(route: ExpeditionOpportunity): string {
  const record = route as unknown as RouteLike;
  const metadata = metadataRecord(route);
  return [
    metadata.source,
    metadata.routeSource,
    metadata.sourceApp,
    metadata.sourceFormat,
    metadata.trailPackSource,
    record.source,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function routeIdentity(route: ExpeditionOpportunity): string {
  const metadata = metadataRecord(route);
  return String(
    metadata.trailPackId ??
      metadata.identityKey ??
      metadata.routeAssetId ??
      metadata.runAssetId ??
      route.id,
  ).trim().toLowerCase();
}

export function isTripBuilderEligibleRouteOption(route: ExpeditionOpportunity | null | undefined): route is ExpeditionOpportunity {
  if (!route) return false;
  const authority = classifyExploreRouteAuthority(route);
  const deferredCatalogSummary =
    authority.isTrailheadOnly &&
    isPublicSuggestedTrailheadRoute(route) &&
    isExploreRouteCatalogDetailDeferred(route) &&
    getExploreTripBuilderEligibility(route).eligible;
  if ((!authority.canUseForTrailItinerary && !deferredCatalogSummary) || authority.isPreviewOrDemo) return false;

  const source = normalizedRouteSource(route);
  if (!source || NON_PRODUCTION_ROUTE_SOURCE_PATTERN.test(source)) return false;
  return TRUSTED_ROUTE_SOURCE_PATTERN.test(source);
}

/** Backward-compatible name; eligibility now explicitly includes approved summary handoffs. */
export const isRealTripBuilderRouteOption = isTripBuilderEligibleRouteOption;

function routeOptionQuality(route: ExpeditionOpportunity): number {
  const authority = classifyExploreRouteAuthority(route);
  if (authority.canUseForTrailItinerary && !authority.isPreviewOrDemo) return 2;
  return isExploreRouteCatalogDetailDeferred(route) ? 1 : 0;
}

export function mergeTripBuilderRouteDetail(
  summary: ExpeditionOpportunity,
  hydrated: ExpeditionOpportunity,
): ExpeditionOpportunity {
  if (routeIdentity(summary) !== routeIdentity(hydrated)) return summary;
  if (routeOptionQuality(hydrated) <= routeOptionQuality(summary)) return summary;
  return {
    ...summary,
    ...hydrated,
    id: summary.id,
    distanceFromUserMiles: summary.distanceFromUserMiles ?? hydrated.distanceFromUserMiles,
    routeMetadata: {
      ...metadataRecord(summary),
      ...metadataRecord(hydrated),
    },
  };
}

export function mergeRealTripBuilderRouteOptions(
  routeGroups: Array<Array<ExpeditionOpportunity | null | undefined>>,
): ExpeditionOpportunity[] {
  const routes: ExpeditionOpportunity[] = [];
  const routeIndexByIdentity = new Map<string, number>();

  routeGroups.forEach((group) => {
    group.forEach((route) => {
      if (!isTripBuilderEligibleRouteOption(route)) return;
      const identity = routeIdentity(route);
      if (!identity) return;
      const existingIndex = routeIndexByIdentity.get(identity);
      if (existingIndex != null) {
        routes[existingIndex] = mergeTripBuilderRouteDetail(routes[existingIndex], route);
        return;
      }
      routeIndexByIdentity.set(identity, routes.length);
      routes.push(route);
    });
  });

  return routes;
}
