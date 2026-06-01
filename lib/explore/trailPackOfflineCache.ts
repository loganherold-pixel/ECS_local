import type { OfflinePrepPackInput } from '../offlinePrepPack';
import type { TripBuilderRouteInput } from '../tripBuilder';
import {
  trailPackToExpeditionOpportunity,
  type ECSTrailPack,
  type ECSTrailPackCatalogDataUsed,
  type ECSTrailPackDiscoveryItem,
  type ECSTrailPackRouteGeometry,
} from './trailPacks';

function routeGeometryPointCount(geometry: ECSTrailPackRouteGeometry | undefined): number {
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return geometry.coordinates.length;
  return geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
}

function sourceTimestampValues(sources: ECSTrailPackCatalogDataUsed[]): string[] {
  const seen = new Set<string>();
  sources.forEach((source) => {
    if (!source.lastVerifiedAt || seen.has(source.lastVerifiedAt)) return;
    seen.add(source.lastVerifiedAt);
  });
  return Array.from(seen);
}

function sourceAttributionValues(sources: ECSTrailPackCatalogDataUsed[]): Array<{
  providerId: string;
  label: string;
  attribution?: string;
  license?: string;
}> {
  return sources.map((source) => ({
    providerId: source.providerId,
    label: source.label,
    attribution: source.attribution,
    license: source.license,
  }));
}

function catalogFreshnessWarnings(sources: ECSTrailPackCatalogDataUsed[], warnings: string[]): string[] {
  const sourceWarnings = sources
    .filter((source) => source.freshness === 'stale' || source.freshness === 'missing')
    .map((source) => `${source.label} source freshness is ${source.freshness}.`);
  return Array.from(new Set([...warnings, ...sourceWarnings]));
}

export function trailPackToOfflinePrepCatalogInput(
  trailPack: ECSTrailPack | ECSTrailPackDiscoveryItem,
): OfflinePrepPackInput {
  const route = trailPackToExpeditionOpportunity(trailPack);
  const verification = trailPack.catalogVerification;
  const dataUsed = verification?.detailAssessment?.dataUsed ?? verification?.dataUsed ?? [];
  const offlineCache = verification?.offlineCache ?? null;
  const geometryPointCount = routeGeometryPointCount(trailPack.routeGeometry);
  const routeMetadata = {
    ...(route.routeMetadata ?? {}),
    routeCatalogOfflineCacheRequested: true,
    routeCatalogOfflineCache: offlineCache,
    routeCatalogVerificationStatus: verification?.status ?? null,
    routeCatalogSourceLabel: verification?.sourceLabel ?? null,
    routeCatalogConfidenceScore: verification?.confidenceScore ?? trailPack.confidenceScore,
    routeCatalogDetailFetchedAt: verification?.detailFetchedAt ?? null,
    routeCatalogLastEvaluatedAt: verification?.lastEvaluatedAt ?? null,
    routeCatalogLastVerifiedAt: offlineCache?.lastVerifiedAt ?? trailPack.lastVerifiedAt ?? null,
    routeCatalogStaleAt: offlineCache?.staleAt ?? null,
    routeCatalogSourceTimestamps: offlineCache?.sourceTimestamps?.length
      ? offlineCache.sourceTimestamps
      : sourceTimestampValues(dataUsed),
    routeCatalogAttribution: offlineCache?.sourceAttribution?.length
      ? offlineCache.sourceAttribution
      : sourceAttributionValues(dataUsed),
    routeCatalogFreshnessWarnings: offlineCache?.freshnessWarnings?.length
      ? offlineCache.freshnessWarnings
      : catalogFreshnessWarnings(dataUsed, verification?.warnings ?? []),
    offlinePrepGeometrySource: verification?.detailFetchedAt
      ? 'route_catalog_detail_geometry'
      : 'route_catalog_summary_geometry',
    offlinePrepGeometryPointCount: geometryPointCount,
  };

  const offlinePrepRoute: TripBuilderRouteInput = {
    ...route,
    routeMetadata,
  };

  return {
    route: offlinePrepRoute,
    capturedAt: new Date().toISOString(),
  };
}
