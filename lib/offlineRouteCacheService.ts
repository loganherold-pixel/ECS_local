import { Platform } from 'react-native';

import {
  getDocumentDirectory,
  fsEnsureDir,
  fsReadString,
  fsWriteString,
} from './fsCompat';
import {
  computeRunHealth,
  generateRunGPX,
  type BuildSnapshot,
  type ECSRun,
  type RunOfflineCacheManifest,
  type RunHealthResult,
  type RunPoint,
  type RunStats,
} from './runStore';
import type { RouteWaypoint } from './routeStore';
import type { SegmentRiskProfile } from './segmentRiskEngine';
import type { TileBounds } from './tileCacheStore';
import {
  REMOTE_CACHE_GROUP_ID,
  buildOfflineRemoteCacheManifest,
  type OfflineRemoteCacheManifest,
} from './remote/offlineRemoteCache';

export type OfflineRouteSource = 'gpx' | 'built' | 'imported' | 'explore' | 'drawn';

export type OfflineRouteCacheStatus = 'not_cached' | 'caching' | 'cached' | 'failed';

export interface Coordinate {
  latitude: number;
  longitude: number;
  elevationMeters?: number | null;
  time?: string | null;
}

export interface ElevationPoint {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  distanceMiles?: number;
}

export interface RunDetailSnapshot {
  runId: string;
  title: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  stats: RunStats;
  buildSnapshot: BuildSnapshot;
  health: RunHealthResult;
}

export type SegmentRiskAnalysisSnapshot = SegmentRiskProfile | unknown | null;

export interface TurnCue {
  id: string;
  instruction: string;
  latitude?: number;
  longitude?: number;
  distanceMiles?: number;
}

export interface OfflineRouteDestinationMetadata {
  latitude: number;
  longitude: number;
  label: string;
  subtitle?: string | null;
  source: 'waypoint' | 'run_stats' | 'route_geometry';
}

export interface OfflineRouteIntentMetadata {
  syncType: 'route';
  origin: {
    mode: 'current_location' | 'gps' | 'user_selected_start' | 'saved_route_start' | 'unknown';
    latitude?: number | null;
    longitude?: number | null;
    label?: string | null;
  };
  destination: OfflineRouteDestinationMetadata;
  routeGeometryPointCount: number;
  encodedPolyline?: string | null;
  routeSummary: {
    distanceMeters?: number | null;
    distanceMiles?: number | null;
    durationSeconds?: number | null;
    primaryName?: string | null;
  };
  mapContext?: {
    styleKey?: string | null;
    layerContext?: string[] | null;
    zoomMin?: number | null;
    zoomMax?: number | null;
    corridorMiles?: number | null;
  } | null;
  routeAnalysisSnapshot?: unknown | null;
  readinessSnapshot?: unknown | null;
  preparedAt: string;
}

export interface OfflineCachedRoute {
  id: string;
  source: OfflineRouteSource;
  sourceRouteId?: string;
  stableRouteKey: string;
  routeIdAliases: string[];
  name: string;
  createdAt: string;
  cachedAt: string;
  routeGeometry: Coordinate[];
  routeBounds: TileBounds;
  finalDestination?: OfflineRouteDestinationMetadata | null;
  routeIntent?: OfflineRouteIntentMetadata | null;
  routeDistanceMiles?: number;
  elevationProfile?: ElevationPoint[];
  waypoints?: RouteWaypoint[];
  runDetail?: RunDetailSnapshot;
  segmentRiskAnalysis?: SegmentRiskAnalysisSnapshot;
  turnCues?: TurnCue[];
  originalGpxText?: string;
  originalGpxMetadata?: Record<string, unknown>;
  offlineTileRegionId?: string | null;
  cacheVersion: number;
  cacheStatus: OfflineRouteCacheStatus;
  tileCacheAvailable: boolean;
  tileCacheStatus?: 'not_requested' | 'downloading' | 'complete' | 'failed' | 'unavailable';
  tileCacheError?: string | null;
  cacheGroups?: string[];
  remoteCache?: OfflineRemoteCacheManifest | null;
}

export interface CacheOfflineRouteInput {
  run: ECSRun;
  health?: RunHealthResult | null;
  segmentRiskAnalysis?: SegmentRiskAnalysisSnapshot;
  offlineTileRegionId?: string | null;
  tileCacheStatus?: OfflineCachedRoute['tileCacheStatus'];
  tileCacheError?: string | null;
  includeRemoteConnectivityCache?: boolean;
  remoteCache?: OfflineRemoteCacheManifest | null;
  routeIntent?: OfflineRouteIntentMetadata | null;
}

const CACHE_VERSION = 1;
const STORAGE_KEY = 'ecs_offline_cached_routes_v1';
const NATIVE_DIR = 'offline-routes/';
const NATIVE_FILE = 'offline-routes.json';

let memoryRoutes: OfflineCachedRoute[] | null = null;

function nowISO(): string {
  return new Date().toISOString();
}

function normalizeSource(source: string | null | undefined): OfflineRouteSource {
  const value = String(source ?? '').toLowerCase();
  if (value === 'gpx') return 'gpx';
  if (value === 'explore') return 'explore';
  if (value === 'drawn' || value === 'custom') return 'drawn';
  if (value === 'built' || value === 'route') return 'built';
  return 'imported';
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeRunGeometry(run: ECSRun): Coordinate[] {
  return (run.points ?? [])
    .map((point) => ({
      latitude: Number(point.lat),
      longitude: Number(point.lng),
      elevationMeters: point.ele_m ?? null,
      time: point.time ?? null,
    }))
    .filter((point) => isValidCoordinate(point.latitude, point.longitude));
}

function computeBounds(points: Coordinate[]): TileBounds | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  if (!isValidCoordinate(minLat, minLng) || !isValidCoordinate(maxLat, maxLng)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

function buildElevationProfile(points: Coordinate[]): ElevationPoint[] {
  return points
    .filter((point) => typeof point.elevationMeters === 'number')
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      elevationMeters: point.elevationMeters as number,
    }));
}

function buildOriginalMetadata(run: ECSRun): Record<string, unknown> {
  const routeGeometry = normalizeRunGeometry(run);
  const finalDestination = buildFinalDestinationMetadata(routeGeometry, run);
  const preparedAt = nowISO();

  return {
    id: run.id,
    title: run.title,
    source: run.source,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    stats: run.stats,
    finalDestination,
    routeIntent: buildDefaultRouteIntentMetadata(routeGeometry, run, finalDestination, preparedAt),
    pointCount: run.points?.length ?? 0,
    waypointCount: run.waypoints?.length ?? 0,
  };
}

function buildRunDetailSnapshot(run: ECSRun, health?: RunHealthResult | null): RunDetailSnapshot {
  return {
    runId: run.id,
    title: run.title,
    source: run.source,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    stats: run.stats,
    buildSnapshot: run.build_snapshot,
    health: health ?? computeRunHealth(run),
  };
}

function buildFinalDestinationMetadata(
  routeGeometry: Coordinate[],
  run: ECSRun,
): OfflineRouteDestinationMetadata | null {
  const destinationWaypoint = Array.isArray(run.waypoints) && run.waypoints.length > 0
    ? run.waypoints[run.waypoints.length - 1]
    : null;
  if (
    destinationWaypoint &&
    isValidCoordinate(Number(destinationWaypoint.lat), Number(destinationWaypoint.lon))
  ) {
    const label = String(destinationWaypoint.name ?? run.title ?? 'Route destination').trim();
    return {
      latitude: Number(destinationWaypoint.lat),
      longitude: Number(destinationWaypoint.lon),
      label: label || 'Route destination',
      subtitle: run.title && label !== run.title ? run.title : null,
      source: 'waypoint',
    };
  }

  const statsEndLat = Number(run.stats?.end_lat);
  const statsEndLng = Number(run.stats?.end_lng);
  if (isValidCoordinate(statsEndLat, statsEndLng)) {
    return {
      latitude: statsEndLat,
      longitude: statsEndLng,
      label: run.title || 'Route destination',
      subtitle: 'Saved route endpoint',
      source: 'run_stats',
    };
  }

  const last = routeGeometry[routeGeometry.length - 1];
  if (last && isValidCoordinate(last.latitude, last.longitude)) {
    return {
      latitude: last.latitude,
      longitude: last.longitude,
      label: run.title || 'Route destination',
      subtitle: 'Saved route endpoint',
      source: 'route_geometry',
    };
  }

  return null;
}

function buildDefaultRouteIntentMetadata(
  routeGeometry: Coordinate[],
  run: ECSRun,
  finalDestination: OfflineRouteDestinationMetadata | null,
  preparedAt: string,
): OfflineRouteIntentMetadata | null {
  if (!finalDestination) return null;
  const first = routeGeometry[0];
  return {
    syncType: 'route',
    origin: first && isValidCoordinate(first.latitude, first.longitude)
      ? {
          mode: 'saved_route_start',
          latitude: first.latitude,
          longitude: first.longitude,
          label: 'Saved route start',
        }
      : { mode: 'unknown' },
    destination: finalDestination,
    routeGeometryPointCount: routeGeometry.length,
    encodedPolyline: null,
    routeSummary: {
      distanceMeters: run.stats?.distance_m ?? null,
      distanceMiles: run.stats?.distance_miles ?? null,
      durationSeconds: null,
      primaryName: run.title ?? null,
    },
    mapContext: null,
    routeAnalysisSnapshot: null,
    readinessSnapshot: null,
    preparedAt,
  };
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function roundCoord(value: number): string {
  return value.toFixed(5);
}

function buildStableRouteKey(
  routeGeometry: Coordinate[],
  distanceMiles?: number | null,
  styleKey?: string | null,
): string {
  const count = routeGeometry.length;
  const first = routeGeometry[0];
  const last = routeGeometry[count - 1];
  const middle = routeGeometry[Math.floor(count / 2)];
  const sampleStep = Math.max(1, Math.floor(count / 24));
  const samples: string[] = [];

  for (let i = 0; i < count; i += sampleStep) {
    const point = routeGeometry[i];
    samples.push(`${roundCoord(point.latitude)},${roundCoord(point.longitude)}`);
  }

  const signature = [
    count,
    distanceMiles != null ? distanceMiles.toFixed(3) : 'unknown',
    first ? `${roundCoord(first.latitude)},${roundCoord(first.longitude)}` : 'no-first',
    middle ? `${roundCoord(middle.latitude)},${roundCoord(middle.longitude)}` : 'no-mid',
    last ? `${roundCoord(last.latitude)},${roundCoord(last.longitude)}` : 'no-last',
    styleKey ? `style:${styleKey}` : 'style:unspecified',
    samples.join('|'),
  ].join(':');

  return `route-${hashString(signature)}`;
}

function getRouteCacheStyleKey(route: OfflineCachedRoute | null | undefined): string | null {
  const styleKey = route?.routeIntent?.mapContext?.styleKey;
  return typeof styleKey === 'string' && styleKey.trim().length > 0 ? styleKey : null;
}

function routeMatchesCacheRequest(
  route: OfflineCachedRoute,
  runId: string,
  stableRouteKey: string,
  styleKey: string | null,
): boolean {
  if (route.stableRouteKey === stableRouteKey) return true;
  if (!includesRouteAlias(route, runId)) return false;
  const routeStyleKey = getRouteCacheStyleKey(route);
  return styleKey == null ? routeStyleKey == null : routeStyleKey === styleKey;
}

function includesRouteAlias(route: OfflineCachedRoute, id: string): boolean {
  return (
    route.id === id ||
    route.sourceRouteId === id ||
    route.stableRouteKey === id ||
    (Array.isArray(route.routeIdAliases) && route.routeIdAliases.includes(id))
  );
}

function mergeRouteAliases(existing: OfflineCachedRoute | null, runId: string): string[] {
  const aliases = new Set<string>();
  if (existing?.sourceRouteId) aliases.add(existing.sourceRouteId);
  if (Array.isArray(existing?.routeIdAliases)) {
    for (const alias of existing.routeIdAliases) aliases.add(alias);
  }
  aliases.add(runId);
  return Array.from(aliases);
}

function routeToRunPoint(point: Coordinate, idx: number): RunPoint {
  return {
    idx,
    lat: point.latitude,
    lng: point.longitude,
    ele_m: point.elevationMeters ?? null,
    time: point.time ?? null,
    type: 'route',
  };
}

function webRead(): OfflineCachedRoute[] {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function webWrite(routes: OfflineCachedRoute[]): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  }
}

async function getNativeFileUri(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const documentDir = await getDocumentDirectory();
  if (!documentDir) return null;
  const dir = `${documentDir}${NATIVE_DIR}`;
  await fsEnsureDir(dir);
  return `${dir}${NATIVE_FILE}`;
}

async function readAllRoutes(): Promise<OfflineCachedRoute[]> {
  if (memoryRoutes) return memoryRoutes;

  if (Platform.OS === 'web') {
    memoryRoutes = webRead();
    return memoryRoutes;
  }

  const uri = await getNativeFileUri();
  if (!uri) {
    memoryRoutes = [];
    return memoryRoutes;
  }

  try {
    const raw = await fsReadString(uri, 'utf8');
    const parsed = JSON.parse(raw);
    memoryRoutes = Array.isArray(parsed) ? parsed : [];
    return memoryRoutes;
  } catch {
    memoryRoutes = [];
    return memoryRoutes;
  }
}

async function writeAllRoutes(routes: OfflineCachedRoute[]): Promise<void> {
  memoryRoutes = routes;

  if (Platform.OS === 'web') {
    webWrite(routes);
    return;
  }

  const uri = await getNativeFileUri();
  if (!uri) {
    throw new Error('Offline route storage is unavailable on this device.');
  }

  await fsWriteString(uri, JSON.stringify(routes), 'utf8');
}

function buildCacheId(stableRouteKey: string, existing?: OfflineCachedRoute | null): string {
  return existing?.id ?? `offline-route-${stableRouteKey}`;
}

export async function cacheOfflineRoute(input: CacheOfflineRouteInput): Promise<OfflineCachedRoute> {
  const { run } = input;
  const routeGeometry = normalizeRunGeometry(run);
  if (routeGeometry.length < 2) {
    throw new Error('Route geometry is required before caching for offline navigation.');
  }

  const routeBounds = computeBounds(routeGeometry);
  if (!routeBounds) {
    throw new Error('Route bounds could not be computed for offline cache.');
  }

  const finalDestination = buildFinalDestinationMetadata(routeGeometry, run);
  const cachedAt = nowISO();
  const routeIntent =
    input.routeIntent ?? buildDefaultRouteIntentMetadata(routeGeometry, run, finalDestination, cachedAt);
  const routeStyleKey =
    typeof routeIntent?.mapContext?.styleKey === 'string' && routeIntent.mapContext.styleKey.trim().length > 0
      ? routeIntent.mapContext.styleKey
      : null;
  const stableRouteKey = buildStableRouteKey(routeGeometry, run.stats?.distance_miles, routeStyleKey);
  const routes = await readAllRoutes();
  const existingIndex = routes.findIndex(
    (route) => routeMatchesCacheRequest(route, run.id, stableRouteKey, routeStyleKey)
  );
  const existing = existingIndex >= 0 ? routes[existingIndex] : null;
  const tileCacheStatus =
    input.tileCacheStatus ??
    (input.offlineTileRegionId ? 'complete' : existing?.tileCacheStatus ?? 'not_requested');
  const segmentRiskAnalysis = input.segmentRiskAnalysis ?? existing?.segmentRiskAnalysis ?? null;
  const includeRemoteConnectivityCache = input.includeRemoteConnectivityCache ?? true;
  const remoteCache = includeRemoteConnectivityCache
    ? input.remoteCache ??
      buildOfflineRemoteCacheManifest({
        routeGeometry,
        routeBounds,
        segmentRiskAnalysis,
        lastUpdated: cachedAt,
      })
    : existing?.remoteCache ?? null;
  const cacheGroups = Array.from(
    new Set([
      ...(Array.isArray(existing?.cacheGroups) ? existing.cacheGroups : []),
      ...(remoteCache?.enabled ? [REMOTE_CACHE_GROUP_ID] : []),
    ]),
  );

  const cachedRoute: OfflineCachedRoute = {
    ...(existing ?? {}),
    id: buildCacheId(stableRouteKey, existing),
    source: normalizeSource(run.source),
    sourceRouteId: run.id,
    stableRouteKey,
    routeIdAliases: mergeRouteAliases(existing, run.id),
    name: run.title,
    createdAt: existing?.createdAt ?? cachedAt,
    cachedAt,
    routeGeometry,
    routeBounds,
    finalDestination,
    routeIntent,
    routeDistanceMiles: run.stats?.distance_miles,
    elevationProfile: buildElevationProfile(routeGeometry),
    waypoints: Array.isArray(run.waypoints) ? run.waypoints : [],
    runDetail: buildRunDetailSnapshot(run, input.health),
    segmentRiskAnalysis,
    turnCues: existing?.turnCues ?? [],
    originalGpxText: existing?.originalGpxText ?? generateRunGPX(run),
    originalGpxMetadata: buildOriginalMetadata(run),
    offlineTileRegionId: input.offlineTileRegionId ?? existing?.offlineTileRegionId ?? null,
    cacheVersion: CACHE_VERSION,
    cacheStatus: 'cached',
    tileCacheAvailable: !!(input.offlineTileRegionId ?? existing?.offlineTileRegionId),
    tileCacheStatus,
    tileCacheError: input.tileCacheError ?? null,
    cacheGroups,
    remoteCache,
  };

  if (existingIndex >= 0) {
    routes[existingIndex] = cachedRoute;
  } else {
    routes.push(cachedRoute);
  }

  await writeAllRoutes(routes);
  return cachedRoute;
}

export async function markOfflineRouteCacheFailed(
  run: ECSRun,
  error: string,
): Promise<OfflineCachedRoute | null> {
  const routes = await readAllRoutes();
  const index = routes.findIndex((route) => includesRouteAlias(route, run.id));
  if (index < 0) return null;
  routes[index] = {
    ...routes[index],
    cachedAt: nowISO(),
    cacheStatus: 'failed',
    tileCacheStatus: 'failed',
    tileCacheError: error,
  };
  await writeAllRoutes(routes);
  return routes[index];
}

export async function getOfflineCachedRouteBySourceRouteId(
  sourceRouteId: string,
): Promise<OfflineCachedRoute | null> {
  const routes = await readAllRoutes();
  return routes.find((route) => includesRouteAlias(route, sourceRouteId)) ?? null;
}

export async function getOfflineCachedRoute(id: string): Promise<OfflineCachedRoute | null> {
  const routes = await readAllRoutes();
  return routes.find((route) => includesRouteAlias(route, id)) ?? null;
}

export async function listOfflineCachedRoutes(): Promise<OfflineCachedRoute[]> {
  return readAllRoutes();
}

export async function removeOfflineCachedRoute(id: string): Promise<boolean> {
  const routes = await readAllRoutes();
  const nextRoutes = routes.filter((route) => !includesRouteAlias(route, id));
  if (nextRoutes.length === routes.length) return false;
  await writeAllRoutes(nextRoutes);
  return true;
}

export function offlineCachedRouteToRun(cachedRoute: OfflineCachedRoute): ECSRun {
  const points = cachedRoute.routeGeometry.map(routeToRunPoint);
  const runDetail = cachedRoute.runDetail;
  const stats = runDetail?.stats ?? {
    distance_m: Math.round((cachedRoute.routeDistanceMiles ?? 0) / 0.000621371),
    distance_miles: cachedRoute.routeDistanceMiles ?? 0,
    distance_km: (cachedRoute.routeDistanceMiles ?? 0) * 1.60934,
    point_count: points.length,
    start_lat: points[0]?.lat ?? null,
    start_lng: points[0]?.lng ?? null,
    end_lat: points[points.length - 1]?.lat ?? null,
    end_lng: points[points.length - 1]?.lng ?? null,
    elevation_gain_ft: null,
    elevation_loss_ft: null,
    min_ele_ft: null,
    max_ele_ft: null,
  };

  return {
    id: cachedRoute.sourceRouteId ?? cachedRoute.id,
    user_id: null,
    title: cachedRoute.name,
    source: cachedRoute.source,
    created_at: cachedRoute.createdAt,
    updated_at: cachedRoute.cachedAt,
    vehicle_id: runDetail?.buildSnapshot?.vehicle_id ?? null,
    build_snapshot: runDetail?.buildSnapshot ?? {
      vehicle_name: 'Offline Route',
      vehicle_id: null,
      estimated_range_miles: 0,
      total_weight_lb: 0,
      roof_weight_lb: 0,
      hitch_weight_lb: 0,
      limits: {
        roof_limit_lb: 0,
        hitch_limit_lb: 0,
      },
      captured_at: cachedRoute.cachedAt,
    },
    stats,
    points,
    waypoints: cachedRoute.waypoints ?? [],
    offline_cache: {
      cached_at: cachedRoute.cachedAt,
      tile_region_id: cachedRoute.offlineTileRegionId ?? null,
      route_geometry: points,
      gpx_metadata: {
        id: cachedRoute.sourceRouteId ?? cachedRoute.id,
        title: cachedRoute.name,
        source: cachedRoute.source,
        created_at: cachedRoute.createdAt,
        updated_at: cachedRoute.cachedAt,
        stats,
      },
      run_detail: {
        build_snapshot: runDetail?.buildSnapshot ?? {
          vehicle_name: 'Offline Route',
          vehicle_id: null,
          estimated_range_miles: 0,
          total_weight_lb: 0,
          roof_weight_lb: 0,
          hitch_weight_lb: 0,
          limits: {
            roof_limit_lb: 0,
            hitch_limit_lb: 0,
          },
          captured_at: cachedRoute.cachedAt,
        },
        health: runDetail?.health ?? computeRunHealth({
          id: cachedRoute.sourceRouteId ?? cachedRoute.id,
          user_id: null,
          title: cachedRoute.name,
          source: cachedRoute.source,
          created_at: cachedRoute.createdAt,
          updated_at: cachedRoute.cachedAt,
          vehicle_id: null,
          build_snapshot: runDetail?.buildSnapshot ?? {
            vehicle_name: 'Offline Route',
            vehicle_id: null,
            estimated_range_miles: 0,
            total_weight_lb: 0,
            roof_weight_lb: 0,
            hitch_weight_lb: 0,
            limits: {
              roof_limit_lb: 0,
              hitch_limit_lb: 0,
            },
            captured_at: cachedRoute.cachedAt,
          },
          stats,
          points,
          waypoints: cachedRoute.waypoints ?? [],
          is_active: false,
        }),
      },
      waypoints: cachedRoute.waypoints ?? [],
      segment_risk: cachedRoute.segmentRiskAnalysis ?? null,
      gpx_xml: cachedRoute.originalGpxText ?? '',
      cache_route_id: cachedRoute.id,
      stable_route_key: cachedRoute.stableRouteKey,
      route_id_aliases: cachedRoute.routeIdAliases,
      route_bounds: cachedRoute.routeBounds,
      route_distance_miles: cachedRoute.routeDistanceMiles ?? null,
      cache_status: cachedRoute.cacheStatus,
      cache_version: cachedRoute.cacheVersion,
      original_gpx_metadata: cachedRoute.originalGpxMetadata ?? null,
      tile_cache_status: cachedRoute.tileCacheStatus ?? 'not_requested',
      cache_groups: cachedRoute.cacheGroups ?? (cachedRoute.remoteCache ? [REMOTE_CACHE_GROUP_ID] : []),
      remote_cache: cachedRoute.remoteCache ?? null,
    },
    is_active: false,
  };
}

export function offlineCachedRouteToRunCacheManifest(
  cachedRoute: OfflineCachedRoute,
  fallbackRun?: ECSRun | null,
): RunOfflineCacheManifest {
  const points = cachedRoute.routeGeometry.map(routeToRunPoint);
  const runDetail = cachedRoute.runDetail;
  const stats =
    runDetail?.stats ??
    fallbackRun?.stats ??
    offlineCachedRouteToRun(cachedRoute).stats;
  const buildSnapshot =
    runDetail?.buildSnapshot ??
    fallbackRun?.build_snapshot ??
    offlineCachedRouteToRun(cachedRoute).build_snapshot;
  const health =
    runDetail?.health ??
    (fallbackRun ? computeRunHealth(fallbackRun) : computeRunHealth(offlineCachedRouteToRun(cachedRoute)));

  return {
    cached_at: cachedRoute.cachedAt,
    tile_region_id: cachedRoute.offlineTileRegionId ?? null,
    route_geometry: points,
    route_bounds: cachedRoute.routeBounds,
    route_distance_miles: cachedRoute.routeDistanceMiles ?? null,
    gpx_metadata: {
      id: cachedRoute.sourceRouteId ?? fallbackRun?.id ?? cachedRoute.id,
      title: cachedRoute.name,
      source: cachedRoute.source,
      created_at: cachedRoute.createdAt,
      updated_at: cachedRoute.cachedAt,
      stats,
      final_destination: cachedRoute.finalDestination ?? null,
      route_intent: cachedRoute.routeIntent ?? null,
    },
    run_detail: {
      build_snapshot: buildSnapshot,
      health,
    },
    waypoints: cachedRoute.waypoints ?? fallbackRun?.waypoints ?? [],
    segment_risk: cachedRoute.segmentRiskAnalysis ?? fallbackRun?.offline_cache?.segment_risk ?? null,
    gpx_xml: cachedRoute.originalGpxText ?? (fallbackRun ? generateRunGPX(fallbackRun) : ''),
    cache_route_id: cachedRoute.id,
    stable_route_key: cachedRoute.stableRouteKey,
    route_id_aliases: cachedRoute.routeIdAliases,
    cache_status: cachedRoute.cacheStatus,
    cache_version: cachedRoute.cacheVersion,
    original_gpx_metadata: cachedRoute.originalGpxMetadata ?? null,
    tile_cache_status: cachedRoute.tileCacheStatus ?? 'not_requested',
    cache_groups: cachedRoute.cacheGroups ?? (cachedRoute.remoteCache ? [REMOTE_CACHE_GROUP_ID] : []),
    remote_cache: cachedRoute.remoteCache ?? fallbackRun?.offline_cache?.remote_cache ?? null,
  };
}
