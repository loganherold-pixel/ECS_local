import { ecsLog } from './ecsLogger';
import {
  normalizeRouteCatalogRecord,
  verifyRouteCatalogRecord,
  type RouteCatalogSearchMeta,
  type RouteCatalogRecord,
} from './explore/routeCatalog';
import {
  queryRouteCatalogDiscoveryRecords,
  routeCatalogGeometryDistanceMiles,
  routeCatalogRecordCenter,
  routeCatalogRecordTrailhead,
  distanceMilesBetween,
  type RouteCatalogDiscoveryCoordinate,
  type RouteCatalogDiscoveryQuery,
} from './explore/routeCatalogDiscovery';
import {
  queryRouteCatalogViewportRecords,
  type RouteCatalogViewportBbox,
  type RouteCatalogViewportQuery,
} from './routeCatalogViewport';

export const ECS_ROUTE_CATALOG_DEBUG_FLAG = 'ECS_ROUTE_CATALOG_DEBUG';

export const NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS = [
  { key: 'tahoe_nf', label: 'Tahoe National Forest', aliases: ['tahoe', 'tahoe national forest'] },
  { key: 'eldorado_nf', label: 'Eldorado National Forest', aliases: ['eldorado', 'eldorado national forest'] },
  { key: 'plumas_nf', label: 'Plumas National Forest', aliases: ['plumas', 'plumas national forest'] },
  { key: 'mendocino_nf', label: 'Mendocino National Forest', aliases: ['mendocino', 'mendocino national forest'] },
] as const;

type LinePoint = [number, number];

export type RouteCatalogAuditReport = {
  source: 'route_catalog';
  totalCatalogRoutesLoaded: number;
  totalRoutesWithValidGeometry: number;
  totalGuidanceReadyRoutes: number;
  totalTrailheadOnlyRoutes: number;
  totalStitchedRoutes: number;
  totalRoutesMissingGeometry: number;
  totalRoutesMissingForestRegionTags: number;
  totalRoutesMissingDistanceDurationMetadata: number;
};

export type ExploreRouteCatalogQueryDiagnostic = {
  source: 'route_catalog';
  userLocation: RouteCatalogDiscoveryCoordinate | null;
  radiusMiles: number | null;
  candidateRoutesBeforeFilters: number;
  removedByFilter: {
    invalidRecord: number;
    outsideRadius: number;
    resultLimit: number;
  };
  finalResultCount: number;
  finalRouteIds: string[];
  topExcludedKnownRoutes: Array<{
    routeKey: string;
    routeId?: string;
    title: string;
    reason: string;
    distanceMiles?: number | null;
  }>;
};

type ExploreRouteCatalogQueryDiagnosticOptions = {
  serverMeta?: RouteCatalogSearchMeta | null;
};

export type NavigateRouteCatalogQueryDiagnostic = {
  source: 'route_catalog';
  visibleMapBounds: RouteCatalogViewportBbox;
  candidateRoutesBeforeFilters: number;
  routeGeometriesIntersectingBounds: number;
  renderedLineCount: number;
  renderedMarkerCount: number;
  hiddenBecauseGeometryStatusIssues: number;
  renderedRouteIds: string[];
  hiddenRouteReasons: Array<{
    routeId: string;
    title: string;
    reason: string;
  }>;
};

export type RouteCatalogClosestViableGeometryTarget = {
  routeId: string;
  title: string;
  coordinate: RouteCatalogDiscoveryCoordinate;
  distanceMiles: number;
  segmentIndex: number;
  pointIndex: number;
  policy: 'closest_viable_point_on_ecs_route_geometry';
};

function readProcessEnvValue(key: string): string | undefined {
  try {
    return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  } catch {
    return undefined;
  }
}

function truthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isRouteCatalogDebugEnabled(): boolean {
  const globalStore = globalThis as unknown as Record<string, unknown>;
  return (
    truthy(globalStore[ECS_ROUTE_CATALOG_DEBUG_FLAG]) ||
    truthy(globalStore[`__${ECS_ROUTE_CATALOG_DEBUG_FLAG}`]) ||
    truthy(readProcessEnvValue(ECS_ROUTE_CATALOG_DEBUG_FLAG)) ||
    truthy(readProcessEnvValue(`EXPO_PUBLIC_${ECS_ROUTE_CATALOG_DEBUG_FLAG}`))
  );
}

export function logRouteCatalogVisibilityDiagnostic(
  label: string,
  diagnostic: Record<string, unknown>,
  options: { throttleMs?: number; fingerprint?: string } = {},
): void {
  ecsLog.dev('DISCOVERY', `route_catalog_visibility:${label}`, diagnostic, {
    debugFlag: ECS_ROUTE_CATALOG_DEBUG_FLAG,
    tag: '[ECS:ROUTE_CATALOG]',
    throttleMs: options.throttleMs ?? 2500,
    fingerprint: options.fingerprint,
  });
}

function normalizeRoutes(records: unknown[]): RouteCatalogRecord[] {
  const byId = new Map<string, RouteCatalogRecord>();
  records.forEach((value) => {
    const route = normalizeRouteCatalogRecord(value);
    if (!route) return;
    byId.set(route.publicId ?? route.id, route);
  });
  return Array.from(byId.values());
}

function routeId(route: RouteCatalogRecord): string {
  return route.publicId ?? route.id;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function coordinatePair(value: unknown): LinePoint | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

function geometryLines(route: RouteCatalogRecord): LinePoint[][] {
  const geometry = route.routeGeometry;
  if (!geometry) return [];
  if (geometry.type === 'LineString') {
    const line = (geometry.coordinates as unknown[])
      .map(coordinatePair)
      .filter((point): point is LinePoint => !!point);
    return line.length >= 2 ? [line] : [];
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as unknown[])
      .filter(Array.isArray)
      .map((segment) =>
        segment
          .map(coordinatePair)
          .filter((point): point is LinePoint => !!point),
      )
      .filter((line) => line.length >= 2);
  }
  return [];
}

function hasValidGeometry(route: RouteCatalogRecord): boolean {
  return geometryLines(route).length > 0;
}

function hasForestOrRegionTag(route: RouteCatalogRecord): boolean {
  const searchable = [
    route.name,
    route.publicId,
    route.id,
    ...(route.tags ?? []),
    ...route.sourceRecords.map((source) => source.label),
  ].join(' ');
  const text = normalizeSearchText(searchable);
  return (
    /\b(forest|nf|national forest|grassland|basin|ohv|orv|tahoe|eldorado|plumas|mendocino)\b/.test(text) ||
    NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS.some((area) =>
      area.aliases.some((alias) => text.includes(alias)),
    )
  );
}

function isStitchedRoute(route: RouteCatalogRecord): boolean {
  const intelligence = route.routeIntelligence ?? {};
  const record = intelligence as Record<string, unknown>;
  const rawSegmentIds = record.segmentIds ?? record.segment_ids ?? record.routeSegmentIds ?? record.route_segment_ids;
  return (
    (Array.isArray(rawSegmentIds) && rawSegmentIds.filter((value) => cleanText(value)).length > 1) ||
    !!cleanText(record.stitchGroupId ?? record.stitch_group_id) ||
    (route.tags ?? []).some((tag) => /stitched|stitch/i.test(tag))
  );
}

function hasDistanceDuration(route: RouteCatalogRecord): boolean {
  return (
    Number.isFinite(route.distanceMiles) &&
    Number(route.distanceMiles) > 0 &&
    Number.isFinite(route.estimatedDurationMinutes) &&
    Number(route.estimatedDurationMinutes) > 0
  );
}

function routeGuidanceReady(route: RouteCatalogRecord): boolean {
  const verification = verifyRouteCatalogRecord(route);
  return (
    hasValidGeometry(route) &&
    route.routeGeometryMode !== 'preview_simplified' &&
    verification.publicRecommendation &&
    verification.blockers.length === 0
  );
}

export function buildRouteCatalogAuditReport(records: unknown[]): RouteCatalogAuditReport {
  const routes = normalizeRoutes(records);
  return {
    source: 'route_catalog',
    totalCatalogRoutesLoaded: routes.length,
    totalRoutesWithValidGeometry: routes.filter(hasValidGeometry).length,
    totalGuidanceReadyRoutes: routes.filter(routeGuidanceReady).length,
    totalTrailheadOnlyRoutes: routes.filter((route) => !hasValidGeometry(route) && !!route.centerCoordinate).length,
    totalStitchedRoutes: routes.filter(isStitchedRoute).length,
    totalRoutesMissingGeometry: routes.filter((route) => !hasValidGeometry(route)).length,
    totalRoutesMissingForestRegionTags: routes.filter((route) => !hasForestOrRegionTag(route)).length,
    totalRoutesMissingDistanceDurationMetadata: routes.filter((route) => !hasDistanceDuration(route)).length,
  };
}

function routeMatchesRubicon(route: RouteCatalogRecord): boolean {
  const aliases = route.routeIntelligence && typeof route.routeIntelligence === 'object'
    ? (route.routeIntelligence as Record<string, unknown>).aliases
    : null;
  const aliasText = Array.isArray(aliases) ? aliases.join(' ') : '';
  const text = normalizeSearchText([
    route.name,
    route.publicId,
    route.id,
    route.tags?.join(' '),
    aliasText,
  ].join(' '));
  return text.includes('rubicon');
}

function bestKnownRouteDistance(
  route: RouteCatalogRecord,
  center: RouteCatalogDiscoveryCoordinate | null,
): number | null {
  if (!center) return null;
  const rawRecord = {
    route_geometry: route.routeGeometry,
    routeGeometry: route.routeGeometry,
    center_latitude: route.centerCoordinate.latitude,
    center_longitude: route.centerCoordinate.longitude,
    route_intelligence: route.routeIntelligence,
    routeIntelligence: route.routeIntelligence,
  };
  const geometryDistance = routeCatalogGeometryDistanceMiles(rawRecord, center);
  const trailhead = routeCatalogRecordTrailhead(rawRecord);
  const trailheadDistance = trailhead ? distanceMilesBetween(center, trailhead) : null;
  const centerDistance = distanceMilesBetween(center, route.centerCoordinate);
  const distances = [geometryDistance, trailheadDistance, centerDistance]
    .filter((distance): distance is number => distance != null && Number.isFinite(distance));
  return distances.length > 0 ? Math.min(...distances) : null;
}

function buildKnownRouteExclusions(
  routes: RouteCatalogRecord[],
  finalRouteIds: Set<string>,
  allMatchedRouteIds: Set<string>,
  query: RouteCatalogDiscoveryQuery,
): ExploreRouteCatalogQueryDiagnostic['topExcludedKnownRoutes'] {
  const expectsRubicon = (query.searchTerms ?? query.expectedKnownRoutes ?? [])
    .map(normalizeSearchText)
    .some((term) => term.includes('rubicon'));
  if (!expectsRubicon) return [];

  const rubiconRoutes = routes.filter(routeMatchesRubicon);
  if (rubiconRoutes.length === 0) {
    return [{
      routeKey: 'rubicon_trail',
      title: 'Rubicon Trail',
      reason: 'missing_from_catalog',
      distanceMiles: null,
    }];
  }

  const searchCenter =
    Number.isFinite(query.latitude) && Number.isFinite(query.longitude)
      ? { latitude: Number(query.latitude), longitude: Number(query.longitude) }
      : null;
  const radiusMiles = Number(query.radiusMiles);

  return rubiconRoutes
    .filter((route) => !finalRouteIds.has(routeId(route)))
    .map((route) => {
      const id = routeId(route);
      const distance = bestKnownRouteDistance(route, searchCenter);
      let reason = 'filtered_unknown';
      if (!allMatchedRouteIds.has(id) && Number.isFinite(radiusMiles)) {
        reason = `outside_radius:${distance == null ? 'unknown_distance' : distance.toFixed(1)}`;
      } else if (allMatchedRouteIds.has(id)) {
        reason = 'result_limit';
      }
      return {
        routeKey: 'rubicon_trail',
        routeId: id,
        title: route.name,
        reason,
        distanceMiles: distance == null ? null : Number(distance.toFixed(2)),
      };
    });
}

export function buildExploreRouteCatalogQueryDiagnostic(
  records: unknown[],
  query: RouteCatalogDiscoveryQuery,
  options: ExploreRouteCatalogQueryDiagnosticOptions = {},
): ExploreRouteCatalogQueryDiagnostic {
  const rawCount = records.length;
  const routes = normalizeRoutes(records);
  const result = queryRouteCatalogDiscoveryRecords(records, query);
  const finalRouteIds = new Set(result.records.map((record) => String(record.public_id ?? record.publicId ?? record.id ?? '')));
  const allMatchedRouteIds = new Set(result.allMatchedRecords.map((record) => String(record.public_id ?? record.publicId ?? record.id ?? '')));
  const serverCandidateCount = options.serverMeta?.candidateCount;
  const serverRadiusMatchedCount = options.serverMeta?.radiusMatchedCount;
  const candidateRoutesBeforeFilters = Number.isFinite(serverCandidateCount)
    ? Number(serverCandidateCount)
    : routes.length;
  const radiusMatchedCount = Number.isFinite(serverRadiusMatchedCount)
    ? Number(serverRadiusMatchedCount)
    : result.matchedCount;
  const diagnostic: ExploreRouteCatalogQueryDiagnostic = {
    source: 'route_catalog',
    userLocation:
      Number.isFinite(query.latitude) && Number.isFinite(query.longitude)
        ? { latitude: Number(query.latitude), longitude: Number(query.longitude) }
        : null,
    radiusMiles: Number.isFinite(query.radiusMiles) ? Number(query.radiusMiles) : null,
    candidateRoutesBeforeFilters,
    removedByFilter: {
      invalidRecord: Math.max(0, rawCount - routes.length),
      outsideRadius: Math.max(0, candidateRoutesBeforeFilters - radiusMatchedCount),
      resultLimit: Math.max(0, radiusMatchedCount - result.records.length),
    },
    finalResultCount: result.records.length,
    finalRouteIds: Array.from(finalRouteIds).filter(Boolean),
    topExcludedKnownRoutes: buildKnownRouteExclusions(routes, finalRouteIds, allMatchedRouteIds, query),
  };
  return diagnostic;
}

function featureHiddenReason(feature: ReturnType<typeof queryRouteCatalogViewportRecords>['featureCollection']['features'][number]): string | null {
  if (feature.properties.guidanceReady) return null;
  if (feature.properties.geometryStatus === 'trailhead_only') return 'trailhead_only_marker_not_guidance_ready';
  if (feature.properties.geometryStatus === 'preview_geometry') return 'preview_geometry_not_active_guidance_ready';
  if (feature.properties.geometryStatus === 'insufficient_geometry') return 'insufficient_geometry';
  return 'not_guidance_ready';
}

export function buildNavigateRouteCatalogQueryDiagnostic(
  records: unknown[],
  query: RouteCatalogViewportQuery,
): NavigateRouteCatalogQueryDiagnostic {
  const routes = normalizeRoutes(records);
  const result = queryRouteCatalogViewportRecords(records, query);
  const features = result.featureCollection.features;
  const hiddenRouteReasons = features
    .map((feature) => {
      const reason = featureHiddenReason(feature);
      return reason
        ? {
            routeId: feature.properties.routeId,
            title: feature.properties.title,
            reason,
          }
        : null;
    })
    .filter((item): item is { routeId: string; title: string; reason: string } => !!item);
  return {
    source: 'route_catalog',
    visibleMapBounds: query.bbox,
    candidateRoutesBeforeFilters: routes.length,
    routeGeometriesIntersectingBounds: features.filter((feature) => feature.geometry.type !== 'Point').length,
    renderedLineCount: result.lineFeatureCount,
    renderedMarkerCount: result.markerFeatureCount,
    hiddenBecauseGeometryStatusIssues: hiddenRouteReasons.length,
    renderedRouteIds: features.map((feature) => feature.properties.routeId),
    hiddenRouteReasons,
  };
}

function linePointToCoordinate(point: LinePoint): RouteCatalogDiscoveryCoordinate {
  return { longitude: point[0], latitude: point[1] };
}

export function findClosestViableRouteCatalogGeometryTarget(
  record: unknown,
  fromCoordinate: RouteCatalogDiscoveryCoordinate,
): RouteCatalogClosestViableGeometryTarget | null {
  const route = normalizeRouteCatalogRecord(record);
  if (!route) return null;
  const verification = verifyRouteCatalogRecord(route);
  if (!verification.publicRecommendation || verification.blockers.length > 0) return null;
  const lines = geometryLines(route);
  let best: RouteCatalogClosestViableGeometryTarget | null = null;
  lines.forEach((line, segmentIndex) => {
    line.forEach((point, pointIndex) => {
      const coordinate = linePointToCoordinate(point);
      const distanceMiles = distanceMilesBetween(fromCoordinate, coordinate);
      if (!best || distanceMiles < best.distanceMiles) {
        best = {
          routeId: routeId(route),
          title: route.name,
          coordinate,
          distanceMiles: Number(distanceMiles.toFixed(2)),
          segmentIndex,
          pointIndex,
          policy: 'closest_viable_point_on_ecs_route_geometry',
        };
      }
    });
  });
  return best;
}
