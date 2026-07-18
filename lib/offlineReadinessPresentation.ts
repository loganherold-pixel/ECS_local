import type { CacheReadinessSnapshot } from './offlineCacheAwarenessEngine';
import type { OfflineCachedRoute } from './offlineRouteCacheService';
import type { OfflineExpeditionReadiness } from './offlineExpeditionDbTypes';
import type { RunOfflineCacheManifest } from './runStore';
import { getWeatherFreshness, type WeatherFreshnessInput } from './weatherFreshness';

export type OfflineReadinessLevel = 'ready' | 'partial' | 'not_ready' | 'unknown';

export interface OfflineReadinessResult {
  level: OfflineReadinessLevel;
  label?: string;
  readyAssets: string[];
  missingAssets: string[];
  staleAssets: string[];
  reason: string;
  recommendedAction?: string;
}

export interface OfflineReadinessInput {
  cacheSnapshot?: CacheReadinessSnapshot | null;
  offlineRoute?: OfflineCachedRoute | null;
  runCacheManifest?: RunOfflineCacheManifest | null;
  expeditionReadiness?: OfflineExpeditionReadiness | null;
  weatherSnapshot?: WeatherFreshnessInput | null;
  closureAccessSnapshot?: {
    available?: boolean | null;
    freshness?: 'fresh' | 'aging' | 'stale' | 'unknown' | null;
    stale?: boolean | null;
  } | null;
  bailoutCount?: number | null;
  currentRouteContext?: OfflineReadinessRouteContext | null;
  downloadedRoutes?: OfflineCachedRoute[] | null;
  tileRegions?: OfflineReadinessTileRegion[] | null;
  tileSyncJobs?: OfflineReadinessTileSyncJob[] | null;
  routeSyncHydrated?: boolean | null;
}

const ACTION_PREPARE_OFFLINE = 'prepare_offline';
const DESTINATION_MATCH_MAX_METERS = 600;

export interface OfflineReadinessCoordinate {
  lat: number;
  lng: number;
}

export interface OfflineReadinessRouteContext {
  routeId?: string | null;
  destination?: {
    lat: number;
    lng: number;
    label?: string | null;
  } | null;
  geometry?: OfflineReadinessCoordinate[] | null;
  mapStyle?: string | null;
  requiredLayers?: string[] | null;
}

export interface OfflineReadinessTileRegion {
  id: string;
  name?: string | null;
  status: string;
  sourceType?: string | null;
  syncType?: string | null;
  routeId?: string | null;
  styleKey?: string | null;
  downloadedTiles?: number | null;
  tileCount?: number | null;
  routeIntent?: Record<string, unknown> | null;
}

export interface OfflineReadinessTileSyncJob {
  regionId: string;
  source?: string | null;
  syncType?: string | null;
  routeIntent?: Record<string, unknown> | null;
  status: string;
  progress?: {
    percent?: number | null;
    downloadedTiles?: number | null;
    totalTiles?: number | null;
    status?: string | null;
    message?: string | null;
  } | null;
  errorMessage?: string | null;
}

function dedupe(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(getString).filter((item): item is string => Boolean(item))
    : [];
}

function getCoordinate(value: unknown): OfflineReadinessCoordinate | null {
  const record = getRecord(value);
  if (!record) return null;
  const lat = toNumber(record.lat) ?? toNumber(record.latitude);
  const lng = toNumber(record.lng) ?? toNumber(record.longitude);
  return lat == null || lng == null ? null : { lat, lng };
}

function routeDestination(route: OfflineCachedRoute | null | undefined): OfflineReadinessCoordinate | null {
  const intentDestination = getCoordinate(route?.routeIntent?.destination);
  if (intentDestination) return intentDestination;
  const finalDestination = getCoordinate(route?.finalDestination);
  if (finalDestination) return finalDestination;
  const lastPoint = route?.routeGeometry?.[route.routeGeometry.length - 1];
  return getCoordinate(lastPoint);
}

function routeIntentDestination(intent: unknown): OfflineReadinessCoordinate | null {
  return getCoordinate(getRecord(intent)?.destination);
}

function metersBetween(a: OfflineReadinessCoordinate, b: OfflineReadinessCoordinate): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const hav =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

function destinationMatches(
  current: OfflineReadinessRouteContext | null | undefined,
  candidate: OfflineReadinessCoordinate | null,
): boolean {
  if (!current?.destination || !candidate) return false;
  return metersBetween(current.destination, candidate) <= DESTINATION_MATCH_MAX_METERS;
}

function routeIdMatches(currentRouteId: string | null | undefined, route: OfflineCachedRoute): boolean {
  if (!currentRouteId) return false;
  return (
    route.id === currentRouteId ||
    route.sourceRouteId === currentRouteId ||
    (Array.isArray(route.routeIdAliases) && route.routeIdAliases.includes(currentRouteId))
  );
}

function routeContextMatchesRoute(
  current: OfflineReadinessRouteContext | null | undefined,
  route: OfflineCachedRoute,
): boolean {
  if (!current) return false;
  return routeIdMatches(current.routeId, route) || destinationMatches(current, routeDestination(route));
}

function routeContextMatchesIntent(
  current: OfflineReadinessRouteContext | null | undefined,
  intent: unknown,
): boolean {
  if (!current) return false;
  return destinationMatches(current, routeIntentDestination(intent));
}

function normalizeLayerSet(values: string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function routeIntentLayerSet(route: OfflineCachedRoute, region?: OfflineReadinessTileRegion | null): Set<string> {
  const layers = normalizeLayerSet(route.routeIntent?.mapContext?.layerContext ?? null);
  if (region?.sourceType === 'route-corridor' || region?.syncType === 'route') layers.add('route-corridor');
  return layers;
}

function offlineRouteRegionIds(route: OfflineCachedRoute | null | undefined): string[] {
  return Array.from(new Set([
    ...(route?.offlineTileRegionIds ?? []),
    ...(route?.offlineTileRegionId ? [route.offlineTileRegionId] : []),
  ]));
}

function requiredRegionsComplete(
  regionIds: string[],
  regions: OfflineReadinessTileRegion[],
): boolean {
  if (regionIds.length === 0) return false;
  return regionIds.every((regionId) => {
    const region = regions.find((candidate) => candidate.id === regionId);
    return !!region &&
      region.status === 'complete' &&
      (region.tileCount == null || region.downloadedTiles == null || region.downloadedTiles >= region.tileCount);
  });
}

function routeIntentStyleKey(intent: unknown): string | null {
  return getString(getRecord(getRecord(intent)?.mapContext)?.styleKey);
}

function routeSyncStyleKey(
  route: OfflineCachedRoute | null,
  region: OfflineReadinessTileRegion | null,
  job: OfflineReadinessTileSyncJob | null,
): string | null {
  return route?.routeIntent?.mapContext?.styleKey ?? region?.styleKey ?? routeIntentStyleKey(job?.routeIntent);
}

function findRegionForRoute(
  route: OfflineCachedRoute | null,
  regions: OfflineReadinessTileRegion[],
): OfflineReadinessTileRegion | null {
  if (!route) return null;
  const explicitRegionIds = offlineRouteRegionIds(route);
  const explicit = explicitRegionIds.length > 0
    ? regions.find((region) => explicitRegionIds.includes(region.id))
    : null;
  if (explicit) return explicit;
  return regions.find((region) => {
    if (region.routeId && routeIdMatches(region.routeId, route)) return true;
    if (region.syncType === 'route' || region.sourceType === 'route-corridor') {
      return routeContextMatchesIntent(
        {
          routeId: route.sourceRouteId ?? route.id,
          destination: routeDestination(route),
        },
        region.routeIntent,
      );
    }
    return false;
  }) ?? null;
}

function findMatchingRoute(
  current: OfflineReadinessRouteContext | null | undefined,
  routes: OfflineCachedRoute[],
): OfflineCachedRoute | null {
  const routeSyncs = routes.filter((route) => (
    route.routeIntent?.syncType === 'route' ||
    route.offlineTileRegionId ||
    (route.offlineTileRegionIds?.length ?? 0) > 0
  ));
  return routeSyncs.find((route) => routeContextMatchesRoute(current, route)) ?? null;
}

function findMatchingJob(
  current: OfflineReadinessRouteContext | null | undefined,
  route: OfflineCachedRoute | null,
  jobs: OfflineReadinessTileSyncJob[],
): OfflineReadinessTileSyncJob | null {
  const explicitRegionIds = new Set([
    ...(route?.offlineTileRegionIds ?? []),
    ...(route?.offlineTileRegionId ? [route.offlineTileRegionId] : []),
  ]);
  return jobs.find((job) => {
    if (explicitRegionIds.has(job.regionId)) return true;
    if (job.syncType !== 'route' && job.source !== 'route-corridor') return false;
    return routeContextMatchesIntent(current, job.routeIntent);
  }) ?? null;
}

function formatPercent(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function resolveProgressPercent(
  job: OfflineReadinessTileSyncJob | null,
  region: OfflineReadinessTileRegion | null,
): string | null {
  const explicit = formatPercent(job?.progress?.percent ?? null);
  if (explicit) return explicit;
  const downloaded = job?.progress?.downloadedTiles ?? region?.downloadedTiles ?? null;
  const total = job?.progress?.totalTiles ?? region?.tileCount ?? null;
  if (
    typeof downloaded === 'number' &&
    typeof total === 'number' &&
    Number.isFinite(downloaded) &&
    Number.isFinite(total) &&
    total > 0
  ) {
    return formatPercent((downloaded / total) * 100);
  }
  return null;
}

function isActionableCatalogFreshnessWarning(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('stale') ||
    normalized.includes('missing') ||
    normalized.includes('unavailable') ||
    normalized.includes('expired') ||
    normalized.includes('refresh')
  );
}

function routeCatalogSourceMetadata(intent: unknown): {
  sourceMetadataAvailable: boolean;
  freshnessWarnings: string[];
} {
  const readinessSnapshot = getRecord(getRecord(intent)?.readinessSnapshot);
  if (!readinessSnapshot) {
    return { sourceMetadataAvailable: false, freshnessWarnings: [] };
  }

  const sourceTimestamps = getStringArray(readinessSnapshot.routeCatalogSourceTimestamps);
  const attributionAvailable =
    Array.isArray(readinessSnapshot.routeCatalogAttribution) &&
    readinessSnapshot.routeCatalogAttribution.some((entry) => Boolean(getRecord(entry)));
  const cache = getRecord(readinessSnapshot.routeCatalogOfflineCache);
  const explicitWarnings = getStringArray(readinessSnapshot.routeCatalogFreshnessWarnings)
    .filter(isActionableCatalogFreshnessWarning);
  const staleAt = getString(cache?.staleAt) ?? getString(cache?.stale_at);
  const staleWarnings = [...explicitWarnings];

  if (staleAt) {
    const staleTime = Date.parse(staleAt);
    if (Number.isFinite(staleTime) && staleTime <= Date.now()) {
      staleWarnings.push('Route catalog source metadata is stale. Refresh official source checks before offline use.');
    }
  }

  return {
    sourceMetadataAvailable: sourceTimestamps.length > 0 || attributionAvailable || Boolean(cache),
    freshnessWarnings: dedupe(staleWarnings),
  };
}

function mergeRouteCatalogSourceMetadata(
  ...items: Array<ReturnType<typeof routeCatalogSourceMetadata>>
): ReturnType<typeof routeCatalogSourceMetadata> {
  return {
    sourceMetadataAvailable: items.some((item) => item.sourceMetadataAvailable),
    freshnessWarnings: dedupe(items.flatMap((item) => item.freshnessWarnings)),
  };
}

function routeSpecificReadyResult(
  readyAssets: string[],
  catalog: ReturnType<typeof routeCatalogSourceMetadata>,
): OfflineReadinessResult {
  const finalReadyAssets = dedupe([
    ...readyAssets,
    catalog.sourceMetadataAvailable ? 'route catalog source metadata' : null,
  ]);

  if (catalog.freshnessWarnings.length > 0) {
    return {
      level: 'partial',
      label: 'Source Warning',
      readyAssets: finalReadyAssets,
      missingAssets: [],
      staleAssets: ['route catalog source freshness'],
      reason: catalog.freshnessWarnings[0],
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  return {
    level: 'ready',
    label: 'Ready',
    readyAssets: finalReadyAssets,
    missingAssets: [],
    staleAssets: [],
    reason: 'Route corridor and active map style are cached for this preview.',
  };
}

function routeContextResult(input: OfflineReadinessInput): OfflineReadinessResult | null {
  const current = input.currentRouteContext;
  if (!current) return null;
  if (input.routeSyncHydrated === false) {
    return {
      level: 'unknown',
      label: 'Checking',
      readyAssets: [],
      missingAssets: [],
      staleAssets: [],
      reason: 'Checking downloaded route syncs.',
    };
  }

  const routes = dedupeRoutes([...(input.downloadedRoutes ?? []), input.offlineRoute ?? null]);
  const regions = input.tileRegions ?? [];
  const jobs = input.tileSyncJobs ?? [];
  const matchingRoute = findMatchingRoute(current, routes);
  const matchingRegion = findRegionForRoute(matchingRoute, regions);
  const matchingJob = findMatchingJob(current, matchingRoute, jobs);
  const progress = resolveProgressPercent(matchingJob, matchingRegion);
  const manifestIntent = input.runCacheManifest?.gpx_metadata?.route_intent ?? null;
  const matchingCatalog = mergeRouteCatalogSourceMetadata(
    routeCatalogSourceMetadata(matchingRoute?.routeIntent),
    routeCatalogSourceMetadata(manifestIntent),
  );
  const manifestDestination = getCoordinate(input.runCacheManifest?.gpx_metadata?.final_destination);
  const manifestMatches =
    routeContextMatchesIntent(current, manifestIntent) || destinationMatches(current, manifestDestination);
  const manifestRegionIds = dedupe([
    ...(input.runCacheManifest?.tile_region_ids ?? []),
    input.runCacheManifest?.tile_region_id ?? null,
  ]);
  const manifestRegion = manifestRegionIds.length > 0
    ? regions.find((region) => manifestRegionIds.includes(region.id)) ?? null
    : null;

  if (!matchingRoute && manifestMatches) {
    const manifestTilesComplete = input.runCacheManifest?.tile_cache_status === 'complete' &&
      requiredRegionsComplete(manifestRegionIds, regions);
    const manifestProgress = resolveProgressPercent(null, manifestRegion);
    if (!manifestTilesComplete) {
      return {
        level: 'partial',
        label: manifestProgress ? `${manifestProgress} Cached` : 'Incomplete',
        readyAssets: ['route geometry'],
        missingAssets: ['route corridor tiles'],
        staleAssets: [],
        reason: manifestProgress
          ? `Offline data incomplete (${manifestProgress} downloaded).`
          : 'Offline data incomplete; route corridor tiles are not fully cached.',
        recommendedAction: ACTION_PREPARE_OFFLINE,
      };
    }

    const manifestContext = getRecord(manifestIntent)?.mapContext;
    const cachedStyle =
      (getRecord(manifestContext)?.styleKey as string | undefined) ?? manifestRegion?.styleKey ?? null;
    if (current.mapStyle && cachedStyle && current.mapStyle !== cachedStyle) {
      return {
        level: 'partial',
        label: 'Style Not Cached',
        readyAssets: ['route geometry', 'route corridor tiles'],
        missingAssets: ['active map style'],
        staleAssets: [],
        reason: `Map style ${current.mapStyle.toUpperCase()} is not cached for this route.`,
        recommendedAction: ACTION_PREPARE_OFFLINE,
      };
    }

    return routeSpecificReadyResult(
      ['route geometry', 'route corridor tiles', 'active map style'],
      routeCatalogSourceMetadata(manifestIntent),
    );
  }

  const matchingRouteRegionIds = offlineRouteRegionIds(matchingRoute);
  const regionComplete = matchingRouteRegionIds.length > 0
    ? requiredRegionsComplete(matchingRouteRegionIds, regions)
    : matchingRegion?.status === 'complete';
  const routeTilesComplete = matchingRoute?.tileCacheStatus === 'complete' && regionComplete;
  if (matchingRoute && routeTilesComplete) {
    const cachedStyle = matchingRoute.routeIntent?.mapContext?.styleKey ?? matchingRegion?.styleKey ?? null;
    if (current.mapStyle && cachedStyle && current.mapStyle !== cachedStyle) {
      return {
        level: 'partial',
        label: 'Style Not Cached',
        readyAssets: ['route geometry', 'route corridor tiles'],
        missingAssets: ['active map style'],
        staleAssets: [],
        reason: `Map style ${current.mapStyle.toUpperCase()} is not cached for this route.`,
        recommendedAction: ACTION_PREPARE_OFFLINE,
      };
    }

    const cachedLayers = routeIntentLayerSet(matchingRoute, matchingRegion);
    const missingLayers = (current.requiredLayers ?? [])
      .filter((layer) => cachedLayers.size > 0 && !cachedLayers.has(layer.trim().toLowerCase()));
    if (missingLayers.length > 0) {
      return {
        level: 'partial',
        label: 'Layer Not Cached',
        readyAssets: ['route geometry', 'route corridor tiles'],
        missingAssets: missingLayers.map((layer) => `${layer} layer`),
        staleAssets: [],
        reason: `${missingLayers[0]} layer is not cached for this route.`,
        recommendedAction: ACTION_PREPARE_OFFLINE,
      };
    }

    return routeSpecificReadyResult(
      ['route geometry', 'route corridor tiles', 'active map style'],
      matchingCatalog,
    );
  }

  if (matchingJob?.status === 'running' || matchingJob?.status === 'pending') {
    const activeSyncStyle = routeSyncStyleKey(matchingRoute, matchingRegion, matchingJob);
    if (current.mapStyle && activeSyncStyle && current.mapStyle !== activeSyncStyle) {
      return {
        level: 'partial',
        label: 'Style Not Cached',
        readyAssets: matchingRoute ? ['route geometry'] : [],
        missingAssets: ['active map style'],
        staleAssets: [],
        reason: `Map style ${current.mapStyle.toUpperCase()} is not cached for this route.`,
        recommendedAction: ACTION_PREPARE_OFFLINE,
      };
    }
    const readyAssets = dedupe([
      matchingRoute ? 'route geometry' : null,
      activeSyncStyle ? 'active map style' : null,
    ]);
    const styleAwareReason = activeSyncStyle
      ? '; active map style is included in this route sync.'
      : '.';
    return {
      level: 'partial',
      label: progress ? `${progress} Cached` : 'Downloading',
      readyAssets,
      missingAssets: ['offline data incomplete'],
      staleAssets: [],
      reason: progress
        ? `Offline data incomplete (${progress} downloaded)${styleAwareReason}`
        : `Offline data incomplete; route sync is still downloading${styleAwareReason}`,
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  if (!matchingRoute) {
    const hasOtherRouteSync =
      routes.some((route) => (
        route.routeIntent?.syncType === 'route' ||
        !!route.offlineTileRegionId ||
        (route.offlineTileRegionIds?.length ?? 0) > 0
      )) ||
      regions.some((region) => region.syncType === 'route' || region.sourceType === 'route-corridor');
    return {
      level: 'not_ready',
      label: hasOtherRouteSync ? 'Route Not Cached' : 'Not Prepared',
      readyAssets: [],
      missingAssets: ['route offline sync'],
      staleAssets: [],
      reason: hasOtherRouteSync
        ? 'Downloaded offline sync belongs to a different route or destination.'
        : 'Prepare offline to cache this route.',
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  if (matchingJob?.status === 'error' || matchingRoute.tileCacheStatus === 'failed') {
    return {
      level: 'not_ready',
      label: 'Sync Failed',
      readyAssets: ['route geometry'],
      missingAssets: ['route corridor tiles'],
      staleAssets: [],
      reason: matchingJob?.errorMessage || matchingRoute.tileCacheError || 'Route offline sync failed.',
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  if (matchingJob?.status === 'cancelled') {
    return {
      level: 'not_ready',
      label: 'Cancelled',
      readyAssets: ['route geometry'],
      missingAssets: ['route corridor tiles'],
      staleAssets: [],
      reason: 'Route offline sync was cancelled before completion.',
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  if (!routeTilesComplete) {
    return {
      level: 'partial',
      label: progress ? `${progress} Cached` : 'Incomplete',
      readyAssets: ['route geometry'],
      missingAssets: ['route corridor tiles'],
      staleAssets: [],
      reason: progress
        ? `Offline data incomplete (${progress} downloaded).`
        : 'Offline data incomplete; route corridor tiles are not fully cached.',
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  const cachedStyle = matchingRoute.routeIntent?.mapContext?.styleKey ?? matchingRegion?.styleKey ?? null;
  if (current.mapStyle && cachedStyle && current.mapStyle !== cachedStyle) {
    return {
      level: 'partial',
      label: 'Style Not Cached',
      readyAssets: ['route geometry', 'route corridor tiles'],
      missingAssets: ['active map style'],
      staleAssets: [],
      reason: `Map style ${current.mapStyle.toUpperCase()} is not cached for this route.`,
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  const cachedLayers = routeIntentLayerSet(matchingRoute, matchingRegion);
  const missingLayers = (current.requiredLayers ?? [])
    .filter((layer) => cachedLayers.size > 0 && !cachedLayers.has(layer.trim().toLowerCase()));
  if (missingLayers.length > 0) {
    return {
      level: 'partial',
      label: 'Layer Not Cached',
      readyAssets: ['route geometry', 'route corridor tiles'],
      missingAssets: missingLayers.map((layer) => `${layer} layer`),
      staleAssets: [],
      reason: `${missingLayers[0]} layer is not cached for this route.`,
      recommendedAction: ACTION_PREPARE_OFFLINE,
    };
  }

  return routeSpecificReadyResult(
    ['route geometry', 'route corridor tiles', 'active map style'],
    matchingCatalog,
  );
}

function dedupeRoutes(routes: (OfflineCachedRoute | null | undefined)[]): OfflineCachedRoute[] {
  const seen = new Set<string>();
  const output: OfflineCachedRoute[] = [];
  for (const route of routes) {
    if (!route) continue;
    const key = route.id || route.sourceRouteId || route.stableRouteKey;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    output.push(route);
  }
  return output;
}

function hasRouteGeometry(input: OfflineReadinessInput): boolean | null {
  const manifestPoints = input.runCacheManifest?.route_geometry;
  if (Array.isArray(manifestPoints)) return manifestPoints.length >= 2;

  const routeGeometry = input.offlineRoute?.routeGeometry;
  if (Array.isArray(routeGeometry)) return routeGeometry.length >= 2;

  return null;
}

function hasBaseMap(input: OfflineReadinessInput): boolean | null {
  const manifestStatus = input.runCacheManifest?.tile_cache_status;
  if (manifestStatus) {
    return manifestStatus === 'complete';
  }

  const routeStatus = input.offlineRoute?.tileCacheStatus;
  if (routeStatus) {
    return routeStatus === 'complete';
  }

  if (input.offlineRoute?.tileCacheAvailable === true) return true;

  const snapshot = input.cacheSnapshot;
  if (snapshot) {
    return snapshot.cached_route_available || snapshot.cached_region_available || snapshot.cached_tile_count > 0;
  }

  return null;
}

function hasGuidanceInstructions(input: OfflineReadinessInput): boolean | null {
  if (input.offlineRoute?.roadGuidanceStatus != null) {
    return (
      input.offlineRoute.roadGuidanceStatus === 'cached_turn_by_turn' &&
      Array.isArray(input.offlineRoute.preparedRoadRoute?.steps) &&
      input.offlineRoute.preparedRoadRoute.steps.length > 0 &&
      Array.isArray(input.offlineRoute.preparedRoadRoute?.legs) &&
      input.offlineRoute.preparedRoadRoute.legs.length > 0
    );
  }

  const cues = input.offlineRoute?.turnCues;
  if (Array.isArray(cues)) return cues.length > 0;

  const manifest = input.runCacheManifest;
  if (manifest) {
    if (manifest.road_guidance_status != null) {
      return (
        manifest.road_guidance_status === 'cached_turn_by_turn' &&
        Array.isArray(manifest.prepared_road_route?.steps) &&
        manifest.prepared_road_route.steps.length > 0 &&
        Array.isArray(manifest.prepared_road_route?.legs) &&
        manifest.prepared_road_route.legs.length > 0
      );
    }
    // Legacy geometry-only manifests do not prove that maneuver instructions
    // were cached. Keep guidance unknown instead of promoting a route line to
    // full offline turn-by-turn readiness.
    return null;
  }

  return null;
}

function hasHazards(input: OfflineReadinessInput): boolean {
  return Boolean(input.offlineRoute?.segmentRiskAnalysis ?? input.runCacheManifest?.segment_risk);
}

function hasRemoteConnectivityCache(input: OfflineReadinessInput): boolean {
  return Boolean(input.offlineRoute?.remoteCache?.enabled ?? input.runCacheManifest?.remote_cache?.enabled);
}

function hasCampIntel(input: OfflineReadinessInput): boolean {
  return Boolean(
    input.expeditionReadiness?.available_categories?.includes('campsites')
    || input.expeditionReadiness?.has_offline_data,
  );
}

function hasFuelWater(input: OfflineReadinessInput): boolean {
  const categories = input.expeditionReadiness?.available_categories ?? [];
  return categories.includes('fuel_stations') || categories.includes('water_sources');
}

function hasBailoutData(input: OfflineReadinessInput): boolean {
  const categories = input.expeditionReadiness?.available_categories ?? [];
  return (
    (typeof input.bailoutCount === 'number' && input.bailoutCount > 0)
    || categories.includes('recovery_points')
    || categories.includes('ranger_stations')
  );
}

function hasClosureAccessSnapshot(input: OfflineReadinessInput): boolean {
  const closure = input.closureAccessSnapshot;
  return closure?.available === true;
}

function isClosureAccessStale(input: OfflineReadinessInput): boolean {
  const closure = input.closureAccessSnapshot;
  if (!closure) return false;
  return closure.stale === true || closure.freshness === 'stale';
}

function getWeatherStaleAsset(input: OfflineReadinessInput): string | null {
  if (!input.weatherSnapshot) return null;
  const freshness = getWeatherFreshness(input.weatherSnapshot);
  return freshness.stale ? 'weather snapshot' : null;
}

function resolveReason(level: OfflineReadinessLevel, ready: string[], missing: string[], stale: string[]): string {
  if (level === 'ready') return 'Route, map, guidance, and key intel are cached.';
  if (level === 'partial') {
    if (stale.length > 0) return 'Route is cached, but some recent intel may be stale.';
    if (missing.includes('alternate exits / bailout route data') || missing.includes('hazards / warnings')) {
      return 'Route is cached, but alternates and recent intel are missing.';
    }
    return 'Core route support is cached, but some offline support is limited.';
  }
  if (level === 'not_ready') return 'Guidance may degrade without service.';
  return 'Offline status unavailable.';
}

export function deriveOfflineReadiness(input: OfflineReadinessInput = {}): OfflineReadinessResult {
  const routeSpecific = routeContextResult(input);
  if (routeSpecific) return routeSpecific;

  const routeGeometry = hasRouteGeometry(input);
  const baseMap = hasBaseMap(input);
  const guidance = hasGuidanceInstructions(input);
  const weatherStale = getWeatherStaleAsset(input);
  const staleAssets = dedupe([
    weatherStale,
    isClosureAccessStale(input) ? 'closure/access snapshot' : null,
    (input.expeditionReadiness?.stale_regions ?? 0) > 0 ? 'offline expedition datasets' : null,
  ]);

  const readyAssets = dedupe([
    routeGeometry === true ? 'route geometry' : null,
    baseMap === true ? 'base map / routable map' : null,
    guidance === true ? 'guidance instructions' : null,
    hasHazards(input) ? 'hazards / warnings' : null,
    hasRemoteConnectivityCache(input) ? 'remoteness / connectivity forecast' : null,
    hasBailoutData(input) ? 'alternate exits / bailout route data' : null,
    hasCampIntel(input) ? 'camp intel' : null,
    hasClosureAccessSnapshot(input) && !isClosureAccessStale(input) ? 'closure/access snapshot' : null,
    hasFuelWater(input) ? 'fuel/water waypoints' : null,
    input.weatherSnapshot && !weatherStale ? 'weather snapshot' : null,
  ]);

  const hasAnyStatus =
    routeGeometry != null ||
    baseMap != null ||
    guidance != null ||
    !!input.cacheSnapshot ||
    !!input.offlineRoute ||
    !!input.runCacheManifest ||
    !!input.expeditionReadiness ||
    !!input.weatherSnapshot ||
    !!input.closureAccessSnapshot;

  if (!hasAnyStatus) {
    return {
      level: 'unknown',
      readyAssets: [],
      missingAssets: [],
      staleAssets: [],
      reason: resolveReason('unknown', [], [], []),
    };
  }

  const missingRequired = dedupe([
    routeGeometry !== true ? 'route geometry' : null,
    baseMap !== true ? 'base map / routable map' : null,
    guidance !== true ? 'guidance instructions' : null,
  ]);

  const missingRecommended = dedupe([
    !hasHazards(input) ? 'hazards / warnings' : null,
    !hasRemoteConnectivityCache(input) ? 'remoteness / connectivity forecast' : null,
    !hasBailoutData(input) ? 'alternate exits / bailout route data' : null,
    !hasCampIntel(input) ? 'camp intel' : null,
    !hasClosureAccessSnapshot(input) ? 'closure/access snapshot' : null,
    !hasFuelWater(input) ? 'fuel/water waypoints' : null,
    !input.weatherSnapshot ? 'weather snapshot' : null,
  ]);

  const missingAssets = dedupe([...missingRequired, ...missingRecommended]);
  const requiredReady = missingRequired.length === 0;
  const strongMissing =
    missingRecommended.includes('hazards / warnings') ||
    missingRecommended.includes('remoteness / connectivity forecast') ||
    missingRecommended.includes('alternate exits / bailout route data') ||
    missingRecommended.includes('camp intel') ||
    missingRecommended.includes('closure/access snapshot');

  const level: OfflineReadinessLevel = !requiredReady
    ? 'not_ready'
    : strongMissing || staleAssets.length > 0
      ? 'partial'
      : 'ready';

  return {
    level,
    readyAssets,
    missingAssets,
    staleAssets,
    reason: resolveReason(level, readyAssets, missingAssets, staleAssets),
    recommendedAction:
      level === 'not_ready'
        ? ACTION_PREPARE_OFFLINE
        : level === 'partial' && (missingAssets.length > 0 || staleAssets.length > 0)
          ? ACTION_PREPARE_OFFLINE
          : undefined,
  };
}
