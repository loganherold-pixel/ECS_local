import type { ExpeditionOpportunity } from '../discoverEngine';
import { classifyExploreRouteAuthority } from '../exploreRouteAuthority';

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
    metadata.identityKey ??
      metadata.trailPackId ??
      metadata.routeAssetId ??
      metadata.runAssetId ??
      route.id,
  ).trim().toLowerCase();
}

export function isRealTripBuilderRouteOption(route: ExpeditionOpportunity | null | undefined): route is ExpeditionOpportunity {
  if (!route) return false;
  const authority = classifyExploreRouteAuthority(route);
  if (!authority.canUseForTrailItinerary || authority.isPreviewOrDemo) return false;

  const source = normalizedRouteSource(route);
  if (!source || NON_PRODUCTION_ROUTE_SOURCE_PATTERN.test(source)) return false;
  return TRUSTED_ROUTE_SOURCE_PATTERN.test(source);
}

export function mergeRealTripBuilderRouteOptions(
  routeGroups: Array<Array<ExpeditionOpportunity | null | undefined>>,
): ExpeditionOpportunity[] {
  const routes: ExpeditionOpportunity[] = [];
  const seen = new Set<string>();

  routeGroups.forEach((group) => {
    group.forEach((route) => {
      if (!isRealTripBuilderRouteOption(route)) return;
      const identity = routeIdentity(route);
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      routes.push(route);
    });
  });

  return routes;
}
