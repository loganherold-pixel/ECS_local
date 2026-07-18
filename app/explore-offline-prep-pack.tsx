import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';

import Header from '../components/Header';
import { ExplorePlanningTabs } from '../components/discover/ExplorePlanningTabs';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import TopoBackground from '../components/TopoBackground';
import ECSOperationalAnnouncer from '../components/ECSOperationalAnnouncer';
import { ECSButton } from '../components/ECSButton';
import { ECS, TACTICAL } from '../lib/theme';
import { getShellBottomClearance } from '../lib/shellLayout';
import { getMapboxToken } from '../lib/mapConfig';
import { hapticMicro } from '../lib/haptics';
import { runAfterShellInteractions, type ShellInteractionTask } from '../lib/shellInteractionScheduler';
import { withTimeout } from '../lib/ecsStabilityGuards';
import { useECSNavigation } from '../lib/navigation/useECSNavigation';
import {
  recordECSPerformanceRender,
  startECSPerformanceSpan,
} from '../lib/performance/ecsPerformanceDiagnostics';
import { parseGeoFile, getPrimaryRouteCoordinates } from '../lib/gpxParser';
import { loadOpportunitiesWithCompatibility } from '../lib/discoverEngine';
import { buildProfileFromSpecs } from '../lib/rigCompatibilityEngine';
import { extractExploreRouteCampMarkers } from '../lib/exploreRouteCampHandoff';
import {
  buildExploreRouteReadinessAssessment,
  getExploreRouteReadinessSummary,
} from '../lib/readiness/exploreRouteReadiness';
import {
  buildOfflinePrepPackManifest,
  buildOfflinePrepPackPresentation,
  createOfflinePrepActionFingerprint,
  createOfflinePrepActionLifecycle,
  clearOfflinePrepPackHandoff,
  getOfflinePrepRouteCacheRunId,
  getOfflinePrepPackRouteCoordinates,
  getOfflinePrepPreparedRoadRoute,
  getOfflinePrepRouteCoordinates,
  hydrateOfflinePrepRouteGeometry,
  loadOfflinePrepPackHandoffAsync,
  offlineReadinessCoordinator,
  resolveOfflinePrepMapQueueState,
  resolveOfflinePrepRetryRegionIds,
  type OfflinePrepCriticalMapSegment,
  type OfflinePrepActionContext,
  type OfflinePrepPackInput,
  type OfflinePrepPackItem,
  type OfflinePrepPackManifest,
  type OfflinePrepPackPresentation,
  type OfflinePrepPresentationKind,
  type OfflinePrepPackStatus,
} from '../lib/offlinePrepPack';
import {
  loadExplorePlanningRouteContextAsync,
  saveExplorePlanningRouteContext,
  upsertExplorePlanningRoute,
} from '../lib/explore/explorePlanningRouteContextStore';
import { fsReadFileFromPickerUri } from '../lib/fsCompat';
import {
  fetchSharedWeatherForCoordinates,
  type SharedWeatherFetchResult,
} from '../lib/weatherService';
import {
  buildRouteWeatherSnapshot,
  routeWeatherSamplesToCoordinates,
  selectRouteWeatherSamplePoints,
} from '../lib/routeWeatherSnapshot';
import type { WeatherCoordinate } from '../lib/weatherTypes';
import {
  cacheOfflineRoute,
  listOfflineCachedRoutes,
  offlineCachedRouteToRunCacheManifest,
  type OfflineCachedRoute,
  type OfflineRouteIntentMetadata,
} from '../lib/offlineRouteCacheService';
import {
  offlineTileSyncCoordinator,
  type OfflineTileSyncSnapshot,
} from '../lib/offlineTileSyncCoordinator';
import {
  computeRunHealth,
  haversineMeters,
  metersToKm,
  metersToMiles,
  runStore,
  type BuildSnapshot,
  type ECSRun,
  type RunPoint,
  type RunStats,
} from '../lib/runStore';
import type { RouteWaypoint } from '../lib/routeStore';
import { analyzeRoute, type RouteAnalysis } from '../lib/routeTileCacheEngine';
import { tileCacheStore, type TileCacheRegion } from '../lib/tileCacheStore';
import type {
  CampCandidate,
  TripBuilderReadinessReference,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
} from '../lib/tripBuilder';
import { exportExploreTripManifestPdf } from '../lib/explore/exploreTripManifestExport';
import type { ExploreTripManifestExportResult } from '../lib/explore/exploreTripManifestExport';

const OFFLINE_PREP_CONTENT_BOTTOM_CLEARANCE = 20;
const OFFLINE_PREP_HYDRATION_TIMEOUT_MS = 8_000;
const OFFLINE_PREP_INITIAL_RENDER_COUNT = 5;
const OFFLINE_PREP_BATCH_SIZE = 4;
const OFFLINE_PREP_WINDOW_SIZE = 5;
const OFFLINE_PREP_BATCHING_PERIOD_MS = 45;

type OfflinePrepContentRow =
  | { type: 'hero' }
  | { type: 'loading' }
  | { type: 'empty' }
  | { type: 'route_list' }
  | { type: 'manifest_header' }
  | { type: 'pack_overview' }
  | { type: 'details_toggle' }
  | { type: 'route_catalog_source_check' }
  | { type: 'map_queue' }
  | { type: 'manifest_item'; item: OfflinePrepPackItem }
  | { type: 'manifest_errors' }
  | { type: 'partial_confirm' }
  | { type: 'prepare_result' }
  | { type: 'error' };

function offlinePrepContentRowKey(row: OfflinePrepContentRow): string {
  return row.type === 'manifest_item' ? `manifest-item-${row.item.id}` : row.type;
}

function routeId(route: TripBuilderRouteInput): string {
  return String(route.id ?? route.name ?? route.title ?? 'selected-route');
}

function routeName(route: TripBuilderRouteInput): string {
  return String(route.name ?? route.title ?? route.id ?? 'Selected Route');
}

function routeDistance(route: TripBuilderRouteInput): number | null {
  const value = route.distanceMiles ?? route.total_distance_miles ?? route.distance_mi;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

function formatCatalogTimestamp(value: unknown): string {
  const text = readString(value);
  if (!text) return 'unavailable';
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return text;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hasRouteCatalogMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  const record = readRecord(metadata);
  return Boolean(
    record?.routeCatalogOfflineCache ||
      record?.routeCatalogCurrentCondition ||
      record?.routeCatalogSourceTimestamps ||
      record?.routeCatalogAttribution ||
      record?.routeCatalogFreshnessWarnings ||
      record?.catalogVerification,
  );
}

function buildRouteCatalogSourceRows(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!hasRouteCatalogMetadata(metadata)) return [];
  const timestamps = readStringArray(readRecord(metadata)?.routeCatalogSourceTimestamps);
  return timestamps.length > 0
    ? timestamps.slice(0, 4).map((timestamp) => `SOURCE TIMESTAMP | ${formatCatalogTimestamp(timestamp)}`)
    : ['SOURCE TIMESTAMP | unavailable'];
}

function buildRouteCatalogAttributionRows(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!hasRouteCatalogMetadata(metadata)) return [];
  const rows = Array.isArray(readRecord(metadata)?.routeCatalogAttribution)
    ? (readRecord(metadata)?.routeCatalogAttribution as unknown[])
        .map((item) => {
          const record = readRecord(item);
          if (!record) return null;
          const label = readString(record.label);
          if (!label) return null;
          const attribution = readString(record.attribution);
          const license = readString(record.license);
          return `ATTRIBUTION | ${label}${attribution ? ` | ${attribution}` : ''}${license ? ` | ${license}` : ''}`;
        })
        .filter((item): item is string => Boolean(item))
    : [];
  return rows.length > 0 ? rows.slice(0, 4) : ['ATTRIBUTION | unavailable'];
}

function readRouteCatalogFreshnessWarnings(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!hasRouteCatalogMetadata(metadata)) return [];
  return readStringArray(readRecord(metadata)?.routeCatalogFreshnessWarnings).slice(0, 4);
}

function readRouteCatalogOfflineCache(metadata: Record<string, unknown> | null | undefined): {
  cacheable: boolean | null;
  lastVerifiedAt: string | null;
  staleAt: string | null;
  currentCondition?: Record<string, unknown> | null;
} | null {
  const cache = readRecord(readRecord(metadata)?.routeCatalogOfflineCache);
  if (!cache) return null;
  return {
    cacheable: readBoolean(cache.cacheable),
    lastVerifiedAt: readString(cache.lastVerifiedAt) ?? readString(cache.last_verified_at),
    staleAt: readString(cache.staleAt) ?? readString(cache.stale_at),
    currentCondition: readRecord(cache.currentCondition ?? cache.current_condition),
  };
}

function readRouteCatalogCurrentCondition(metadata: Record<string, unknown> | null | undefined): {
  label: string;
  status: string;
  currentlyOpenStatus: string;
  passabilityStatus: string;
  warnings: string[];
  blockers: string[];
} | null {
  const record = readRecord(metadata);
  const cache = readRecord(record?.routeCatalogOfflineCache);
  const catalogVerification = readRecord(record?.catalogVerification);
  const condition = readRecord(record?.routeCatalogCurrentCondition) ??
    readRecord(cache?.currentCondition ?? cache?.current_condition) ??
    readRecord(catalogVerification?.currentCondition ?? catalogVerification?.current_condition);
  if (!condition) return null;
  return {
    label: readString(condition.label) ?? 'Current conditions not assessed',
    status: readString(condition.status) ?? 'not_assessed',
    currentlyOpenStatus: readString(condition.currentlyOpenStatus) ?? readString(condition.currently_open_status) ?? 'unknown',
    passabilityStatus: readString(condition.passabilityStatus) ?? readString(condition.passability_status) ?? 'not_assessed',
    warnings: readStringArray(condition.warnings).slice(0, 3),
    blockers: readStringArray(condition.blockers).slice(0, 3),
  };
}

type RouteImportState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string | null;
};

function makeRouteIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 42) || 'route';
}

function importedRouteDistanceMiles(coordinates: [number, number][]): number {
  let meters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    meters += haversineMeters(previous[1], previous[0], current[1], current[0]);
  }
  return Math.round(metersToMiles(meters) * 10) / 10;
}

function buildOfflinePrepImportedRoute(fileName: string, content: string): TripBuilderRouteInput {
  const parsed = parseGeoFile(fileName, content);
  const coordinates = getPrimaryRouteCoordinates(parsed);
  if (coordinates.length < 2) {
    throw new Error('Imported route file does not include a route line with at least two points.');
  }
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const routeName = parsed.name?.trim() || fileName.replace(/\.[^.]+$/, '') || 'Imported Route';
  const ext = (fileName.toLowerCase().split('.').pop() || 'route').replace(/[^a-z0-9]/g, '');
  const distanceMiles = importedRouteDistanceMiles(coordinates);

  return {
    id: `offline-prep-import-${makeRouteIdPart(routeName)}-${Date.now().toString(36)}`,
    name: routeName,
    title: routeName,
    region: 'Imported route',
    source: 'offline_prep_import',
    distanceMiles,
    estimatedTravelHours: Math.max(0.5, Math.round((distanceMiles / 18) * 10) / 10),
    estimatedDays: Math.max(1, Math.ceil(distanceMiles / 75)),
    terrainType: 'Imported route file',
    remotenessScore: 5,
    permitRequired: false,
    startLat: first[1],
    startLng: first[0],
    coordinate: { lat: first[1], lng: first[0] },
    destinationCoordinate: { lat: last[1], lng: last[0] },
    endpointCoordinate: { lat: last[1], lng: last[0] },
    routeGeometry: {
      type: 'LineString',
      coordinates,
    },
    trailGeometry: {
      type: 'LineString',
      coordinates,
    },
    routeMetadata: {
      source: 'offline_prep_import',
      sourceFileName: fileName,
      sourceFileType: ext,
      importedAt: new Date().toISOString(),
      routePointCount: coordinates.length,
      isTrailGeometry: true,
      geometryRole: 'trail',
      offlinePrepGeometrySource: 'operator_imported_route_file',
    },
  };
}

function routeToCampCandidates(route: TripBuilderRouteInput | null): CampCandidate[] {
  try {
    return extractExploreRouteCampMarkers(route as any).map((marker) => ({
      id: marker.id,
      name: marker.title,
      location: { latitude: marker.latitude, longitude: marker.longitude },
      score: marker.score,
      legalConfidence: marker.confidence,
      accessConfidence: marker.confidence,
      source: marker.source ?? 'explore_route_camp_marker',
      notes: [marker.subtitle],
    }));
  } catch {
    return [];
  }
}

function buildReadinessReference(route: TripBuilderRouteInput | null): TripBuilderReadinessReference | null {
  if (!route) return null;
  try {
    const assessment = buildExploreRouteReadinessAssessment(route as any, { hasVehicle: false });
    const summary = getExploreRouteReadinessSummary(assessment, route as any, { hasVehicle: false });
    return {
      status: assessment.status,
      score: assessment.overallScore,
      summary,
      topConcern: summary.concern,
      source: 'explore_route_readiness',
      updatedAt: assessment.updatedAt,
    };
  } catch {
    return null;
  }
}

function buildVehicleProfile(): TripBuilderVehicleProfile | null {
  const profile = buildProfileFromSpecs();
  if (!profile) return null;
  return {
    id: profile.vehicleId,
    label: profile.vehicleName,
    vehicleType: profile.vehicleType,
    rangeMiles: profile.fuel_range_miles,
    tireSizeInches: profile.tireSizeInches,
    confidence: 'medium',
    source: 'fleet_profile',
  };
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function offlinePrepWeatherSampleSelection(input: OfflinePrepPackInput): ReturnType<typeof selectRouteWeatherSamplePoints> {
  const points = getOfflinePrepPackRouteCoordinates(input);
  return selectRouteWeatherSamplePoints({
    routeId: routeId(input.route),
    routePoints: points.map((point) => ({
      lat: point.latitude,
      lng: point.longitude,
    })),
    routeDistanceMiles: routeDistance(input.route),
    tripType: String((input.route as any).tripType ?? (input.route as any).trip_type ?? ''),
    maxBuckets: 3,
  });
}

function offlinePrepWeatherCoordinates(input: OfflinePrepPackInput): WeatherCoordinate[] {
  return routeWeatherSamplesToCoordinates(offlinePrepWeatherSampleSelection(input));
}

function weatherCoordinateSignature(coordinates: WeatherCoordinate[]): string {
  return coordinates.map((coordinate) => `${coordinate.lat.toFixed(4)},${coordinate.lng.toFixed(4)}`).join('|');
}

function buildOfflinePrepWeatherSnapshot(
  route: TripBuilderRouteInput,
  coordinates: WeatherCoordinate[],
  weather: SharedWeatherFetchResult,
  sampleSelection: ReturnType<typeof selectRouteWeatherSamplePoints>,
): Record<string, unknown> | null {
  const usableSnapshots = weather.snapshots.filter((snapshot) => (
    snapshot.status.kind !== 'unavailable' &&
    snapshot.status.kind !== 'provider_error' &&
    (
      snapshot.current.temp != null ||
      !!snapshot.current.condition ||
      snapshot.alerts.length > 0 ||
      snapshot.hourly.length > 0 ||
      snapshot.daily.length > 0
    )
  ));
  if (usableSnapshots.length === 0) return null;
  const routeWeatherSnapshot = buildRouteWeatherSnapshot({
    routeId: routeId(route),
    sampleSelection,
    weather,
    refreshReason: 'offline_packet',
    nowMs: Date.now(),
  });
  return {
    source: 'ecs_route_weather',
    routeId: routeId(route),
    routeName: routeName(route),
    generatedAt: new Date().toISOString(),
    providerSource: weather.result.source,
    provider: routeWeatherSnapshot.provider,
    fetchedAt: routeWeatherSnapshot.fetchedAt,
    expiresAt: routeWeatherSnapshot.expiresAt,
    stale: routeWeatherSnapshot.stale,
    sampleBuckets: routeWeatherSnapshot.sampleBuckets,
    weatherSnapshotAge: routeWeatherSnapshot.weatherSnapshotAge,
    lastProviderRefreshAt: routeWeatherSnapshot.lastProviderRefreshAt,
    currentSummary: routeWeatherSnapshot.currentSummary,
    riskFlags: routeWeatherSnapshot.riskFlags,
    sourceCallCount: routeWeatherSnapshot.sourceCallCount,
    diagnostics: routeWeatherSnapshot.diagnostics,
    coordinateCount: coordinates.length,
    snapshots: usableSnapshots.map((snapshot, index) => ({
      label: snapshot.location.label ?? coordinates[index]?.label ?? `Route weather ${index + 1}`,
      lat: snapshot.location.lat,
      lng: snapshot.location.lng,
      fetchedAt: snapshot.fetchedAt,
      status: snapshot.status.kind,
      source: snapshot.provider.source,
      current: snapshot.current,
      alerts: snapshot.alerts.slice(0, 4),
      daily: snapshot.daily.slice(0, 3),
    })),
  };
}

function coordinateFromUnknown(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latitude = finiteNumber(record.latitude ?? record.lat);
  const longitude = finiteNumber(record.longitude ?? record.lng ?? record.lon);
  if (
    latitude != null &&
    longitude != null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return { latitude, longitude };
  }
  return null;
}

function routeWaypointsForRun(route: TripBuilderRouteInput): RouteWaypoint[] {
  return (Array.isArray(route.waypoints) ? route.waypoints : [])
    .map((waypoint): RouteWaypoint | null => {
      const coordinate = coordinateFromUnknown(waypoint);
      if (!coordinate) return null;
      const record = waypoint && typeof waypoint === 'object' ? waypoint as Record<string, unknown> : {};
      return {
        lat: coordinate.latitude,
        lon: coordinate.longitude,
        ele: finiteNumber(record.ele ?? record.elevationMeters ?? record.elevation_m) ?? null,
        name: typeof record.name === 'string'
          ? record.name
          : typeof record.title === 'string'
            ? record.title
            : null,
        time: typeof record.time === 'string' ? record.time : null,
        waypointType: typeof record.waypointType === 'string' ? record.waypointType as RouteWaypoint['waypointType'] : null,
      };
    })
    .filter((waypoint): waypoint is RouteWaypoint => waypoint != null);
}

function offlineCachedRouteToTripBuilderInput(cachedRoute: OfflineCachedRoute): TripBuilderRouteInput {
  return {
    id: cachedRoute.sourceRouteId ?? cachedRoute.id,
    name: cachedRoute.name,
    title: cachedRoute.name,
    region: 'Offline Cache',
    source: 'offline_prep_pack',
    distanceMiles: cachedRoute.routeDistanceMiles ?? null,
    routeGeometry: {
      type: 'LineString',
      coordinates: cachedRoute.routeGeometry.map((point) => [point.longitude, point.latitude]),
    },
    waypoints: (cachedRoute.waypoints ?? []).map((waypoint, index) => ({
      id: `${cachedRoute.id}-waypoint-${index + 1}`,
      name: waypoint.name ?? `Waypoint ${index + 1}`,
      latitude: waypoint.lat,
      longitude: waypoint.lon,
      waypointType: waypoint.waypointType ?? 'waypoint',
    })),
    routeMetadata: {
      offlinePrepPrepared: true,
      offlinePrepCacheId: cachedRoute.id,
      offlinePrepCachedAt: cachedRoute.cachedAt,
      offlinePrepTileCacheStatus: cachedRoute.tileCacheStatus ?? null,
      tripBuilderPreparedRoadRoute: cachedRoute.preparedRoadRoute ?? null,
      tripBuilderPreparedRoadRouteState: cachedRoute.roadGuidanceStatus ?? 'unavailable',
    },
  };
}

function buildOfflinePrepRunPoints(input: OfflinePrepPackInput): RunPoint[] {
  return getOfflinePrepPackRouteCoordinates(input).map((point, index) => ({
    idx: index,
    lat: point.latitude,
    lng: point.longitude,
    ele_m: null,
    time: null,
    type: 'route',
  }));
}

function buildOfflinePrepRunStats(input: OfflinePrepPackInput, points: RunPoint[]): RunStats {
  let geometryDistanceMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    geometryDistanceMeters += haversineMeters(previous.lat, previous.lng, point.lat, point.lng);
  }
  const declaredMiles = routeDistance(input.route);
  const distanceMiles = declaredMiles ?? metersToMiles(geometryDistanceMeters);
  const distanceMeters = declaredMiles != null ? distanceMiles / 0.000621371 : geometryDistanceMeters;
  const start = points[0] ?? null;
  const end = points[points.length - 1] ?? start;
  return {
    distance_m: Math.round(distanceMeters * 100) / 100,
    distance_miles: Math.round(distanceMiles * 100) / 100,
    distance_km: Math.round(metersToKm(distanceMeters) * 100) / 100,
    point_count: points.length,
    start_lat: start?.lat ?? null,
    start_lng: start?.lng ?? null,
    end_lat: end?.lat ?? null,
    end_lng: end?.lng ?? null,
    elevation_gain_ft: finiteNumber(input.route.elevationGainFt) != null ? Math.round(finiteNumber(input.route.elevationGainFt) as number) : null,
    elevation_loss_ft: null,
    min_ele_ft: null,
    max_ele_ft: null,
  };
}

function buildOfflinePrepSnapshot(input: OfflinePrepPackInput): BuildSnapshot {
  const now = new Date().toISOString();
  const vehicle = input.vehicleProfile;
  return {
    vehicle_name: vehicle?.label ?? 'Offline Prep Vehicle',
    vehicle_id: vehicle?.id ?? null,
    estimated_range_miles: finiteNumber(vehicle?.rangeMiles) ?? 0,
    total_weight_lb: 0,
    roof_weight_lb: 0,
    hitch_weight_lb: 0,
    limits: {
      roof_limit_lb: 0,
      hitch_limit_lb: 0,
    },
    captured_at: now,
  };
}

function buildOfflinePrepRun(input: OfflinePrepPackInput): ECSRun | null {
  const points = buildOfflinePrepRunPoints(input);
  if (points.length < 2) return null;
  const now = new Date().toISOString();
  const id = getOfflinePrepRouteCacheRunId(routeId(input.route));
  return {
    id,
    user_id: null,
    title: routeName(input.route),
    source: 'offline_prep_pack',
    created_at: now,
    updated_at: now,
    vehicle_id: input.vehicleProfile?.id ?? null,
    build_snapshot: buildOfflinePrepSnapshot(input),
    stats: buildOfflinePrepRunStats(input, points),
    points,
    waypoints: routeWaypointsForRun(input.route),
    is_active: false,
  };
}

function buildOfflinePrepRouteIntent(
  input: OfflinePrepPackInput,
  manifest: OfflinePrepPackManifest,
  run: ECSRun,
  analysis: RouteAnalysis,
): OfflineRouteIntentMetadata {
  const first = run.points[0];
  const last = run.points[run.points.length - 1];
  const preparedAt = new Date().toISOString();
  const routeMetadata = input.route.routeMetadata ?? null;
  return {
    syncType: 'route',
    origin: first
      ? {
          mode: 'saved_route_start',
          latitude: first.lat,
          longitude: first.lng,
          label: 'Offline Prep route start',
        }
      : { mode: 'unknown' },
    destination: {
      latitude: last?.lat ?? run.stats.end_lat ?? 0,
      longitude: last?.lng ?? run.stats.end_lng ?? 0,
      label: routeName(input.route),
      subtitle: 'Offline Prep route finish',
      source: 'route_geometry',
    },
    routeGeometryPointCount: run.points.length,
    encodedPolyline: null,
    routeSummary: {
      distanceMeters: run.stats.distance_m,
      distanceMiles: run.stats.distance_miles,
      durationSeconds: null,
      primaryName: run.title,
    },
    mapContext: {
      styleKey: 'tactical',
      layerContext: ['offline_prep_pack', 'trip_builder_itinerary'],
      zoomMin: analysis.zoomMin,
      zoomMax: analysis.zoomMax,
      corridorMiles: analysis.bufferMiles,
    },
    routeAnalysisSnapshot: analysis,
    readinessSnapshot: {
      offlinePrepManifest: manifest,
      routeMetadata: input.route.routeMetadata ?? null,
      routeCatalogSourceTimestamps: routeMetadata?.routeCatalogSourceTimestamps ?? null,
      routeCatalogAttribution: routeMetadata?.routeCatalogAttribution ?? null,
      routeCatalogFreshnessWarnings: routeMetadata?.routeCatalogFreshnessWarnings ?? null,
      routeCatalogOfflineCache: routeMetadata?.routeCatalogOfflineCache ?? null,
      routeCatalogCurrentCondition: routeMetadata?.routeCatalogCurrentCondition ?? null,
      catalogVerification: routeMetadata?.catalogVerification ?? null,
      tripPlan: input.tripPlan ?? null,
      weatherSnapshot: input.weatherSnapshot ?? null,
      readiness: input.readiness ?? input.tripPlan?.readinessReference ?? null,
      roadTurnGuidance: (() => {
        const preparedRoadRoute = getOfflinePrepPreparedRoadRoute(input);
        return preparedRoadRoute
          ? {
              status: 'cached_turn_by_turn',
              routeId: preparedRoadRoute.id,
              routeVersion: preparedRoadRoute.routeVersion ?? null,
              stepCount: preparedRoadRoute.steps.length,
              legCount: preparedRoadRoute.legs.length,
            }
          : {
              status: 'unavailable',
              reason: input.preparedRoadRouteUnavailableReason ??
                'Detailed road turns are not cached for this pack.',
            };
      })(),
    },
    preparedAt,
  };
}

function manifestFullRouteMapTooLarge(manifest: OfflinePrepPackManifest): boolean {
  const offlineMapItem = manifest.items.find((item) => item.type === 'offline_map') ?? null;
  return offlineMapItem?.metadata?.fullRouteTooLarge === true;
}

function criticalOfflineSegmentsFromManifest(manifest: OfflinePrepPackManifest): OfflinePrepCriticalMapSegment[] {
  const segmentsItem = manifest.items.find((item) => item.type === 'critical_offline_segments') ?? null;
  const segments = segmentsItem?.metadata?.segments;
  if (!Array.isArray(segments)) return [];
  return segments.filter((segment): segment is OfflinePrepCriticalMapSegment => {
    if (!segment || typeof segment !== 'object') return false;
    const record = segment as OfflinePrepCriticalMapSegment;
    return (
      typeof record.id === 'string' &&
      record.bounds != null &&
      typeof record.bounds === 'object' &&
      Number.isFinite(record.bounds.minLat) &&
      Number.isFinite(record.bounds.maxLat) &&
      Number.isFinite(record.bounds.minLng) &&
      Number.isFinite(record.bounds.maxLng) &&
      Number.isFinite(record.zoomMin) &&
      Number.isFinite(record.zoomMax)
    );
  });
}

function shouldConfirmPartialPrepare(manifest: OfflinePrepPackManifest): boolean {
  return manifest.progress.status === 'partially_ready' || manifest.errors.length > 0;
}

function statusColor(status: OfflinePrepPackStatus, availability?: string): string {
  if (availability === 'not_set') return TACTICAL.textMuted;
  if (status === 'ready' || availability === 'already_cached') return '#66BB6A';
  if (status === 'failed') return '#EF5350';
  if (status === 'unavailable') return TACTICAL.textMuted;
  if (status === 'downloading' || status === 'preparing') return '#64B5F6';
  return TACTICAL.amber;
}

function statusLabel(item: OfflinePrepPackItem): string {
  if (item.availability === 'already_cached') return 'Cached';
  if (item.availability === 'pending_download') return 'Download needed';
  if (item.availability === 'not_set') return 'Not set';
  if (item.status === 'ready') return 'Ready';
  if (item.status === 'failed') return 'Failed';
  if (item.status === 'unavailable') return 'Unavailable';
  if (item.status === 'downloading') return 'Downloading';
  if (item.status === 'preparing') return 'Preparing';
  return 'Not started';
}

function progressStatusLabel(status: OfflinePrepPackStatus): string {
  if (status === 'partially_ready') return 'PARTIAL';
  if (status === 'unavailable') return 'DATA UNAVAILABLE';
  return status.replace('_', ' ').toUpperCase();
}

function manifestStateCopy(
  status: OfflinePrepPackStatus,
  progress?: OfflinePrepPackManifest['progress'] | null,
): { title: string; message: string } {
  const totalItems = progress?.totalItems ?? 0;
  const readyItems = progress?.readyItems ?? 0;
  const unavailableItems = progress?.unavailableItems ?? 0;
  const allUnavailable = totalItems > 0 && readyItems === 0 && unavailableItems >= totalItems;

  if (allUnavailable) {
    return {
      title: 'Offline pack unavailable',
      message: 'No route essentials are ready yet. Items without a known source are marked below.',
    };
  }

  switch (status) {
    case 'ready':
      return {
        title: 'Offline pack ready',
        message: 'Available route essentials are ready for review.',
      };
    case 'partially_ready':
      return {
        title: 'Offline pack partially ready',
        message: readyItems > 0
          ? 'Some route essentials are ready. Items without a known source are marked below.'
          : 'Route essentials need source data before ECS can mark them ready.',
      };
    case 'failed':
      return {
        title: 'Offline pack needs review',
        message: 'One or more items could not be prepared. Review the item list and retry when the source is available.',
      };
    case 'unavailable':
      return {
        title: 'Offline pack unavailable',
        message: 'Route data or offline infrastructure is unavailable for this pack.',
      };
    default:
      return {
        title: 'Offline pack ready to prepare',
        message: 'Review the manifest before preparing. Downloads are marked ready only when confirmed by ECS infrastructure.',
      };
  }
}

function PrepItemRow({ item }: { item: OfflinePrepPackItem }) {
  const color = statusColor(item.status, item.availability);
  const iconName = item.availability === 'not_set'
    ? 'remove'
    : item.status === 'ready'
      ? 'checkmark'
      : item.status === 'unavailable'
        ? 'remove'
        : 'download-outline';
  return (
    <View style={styles.itemRow} accessibilityLabel={`${item.label} ${statusLabel(item)}`} testID={`offline-prep-item-${item.type}`}>
      <View style={[styles.itemIcon, { borderColor: color + '55', backgroundColor: color + '12' }]}>
        <Ionicons name={iconName} size={13} color={color} />
      </View>
      <View style={styles.itemCopy}>
        <View style={styles.itemTitleRow}>
          <Text style={styles.itemTitle}>{item.label}</Text>
          <Text style={[styles.itemStatus, { color }]}>{statusLabel(item).toUpperCase()}</Text>
        </View>
        <Text style={styles.itemSummary}>{item.summary}</Text>
        <Text style={styles.itemMeta}>
          {item.source}
          {item.count != null ? ` | ${item.count} item${item.count === 1 ? '' : 's'}` : ''}
          {item.estimatedSizeMB != null ? ` | ${item.estimatedSizeMB} MB` : ''}
        </Text>
      </View>
    </View>
  );
}

function MapPrepQueueCard({
  state,
  retrying,
  onRetry,
}: {
  state: ReturnType<typeof resolveOfflinePrepMapQueueState>;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (!state) return null;
  const tone =
    state.status === 'complete'
      ? '#66BB6A'
      : state.status === 'failed'
        ? '#EF5350'
        : state.status === 'unavailable'
          ? TACTICAL.textMuted
          : TACTICAL.amber;
  const tileCopy = state.totalTiles != null
    ? `${state.downloadedTiles ?? 0}/${state.totalTiles} tiles`
    : 'Tile count pending';
  const sizeCopy = state.estimatedSizeMB != null
    ? `${state.downloadedSizeMB ?? 0}/${state.estimatedSizeMB} MB`
    : 'Size pending';
  return (
    <View style={styles.mapQueueCard} testID="offline-prep-map-queue-state">
      <View
        style={styles.mapQueueHeader}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Offline map state: ${state.label}`}
      >
        <View
          style={[styles.mapQueueDot, { backgroundColor: tone }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={[styles.mapQueueLabel, { color: tone }]}>{state.label}</Text>
        <Text style={styles.mapQueueSource}>{state.source === 'sync_job' ? 'SYNC QUEUE' : state.source === 'tile_region' ? 'ROUTE CACHE' : 'MANIFEST'}</Text>
      </View>
      <Text style={styles.mapQueueMessage}>{state.message}</Text>
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel="Offline map preparation"
        accessibilityValue={{ min: 0, max: 100, now: state.percent, text: `${state.percent} percent` }}
      >
        <View style={[styles.progressFill, { width: `${state.percent}%`, backgroundColor: tone }]} />
      </View>
      <Text style={styles.progressMeta}>
        {state.percent}% | {tileCopy} | {sizeCopy}
      </Text>
      {state.errorMessage ? (
        <Text style={styles.errorText}>{state.errorMessage}</Text>
      ) : null}
      {state.retryable ? (
        <TouchableOpacity
          style={styles.retryButton}
          activeOpacity={0.84}
          onPress={onRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel="Retry offline map preparation"
          accessibilityHint="Retries only the failed or incomplete map preparation work"
          accessibilityState={{ disabled: retrying, busy: retrying }}
          testID="offline-prep-retry-map-download"
        >
          {retrying ? <ActivityIndicator size="small" color={TACTICAL.amber} /> : <Ionicons name="refresh-outline" size={13} color={TACTICAL.amber} />}
          <Text style={styles.retryButtonText}>{retrying ? 'Retrying' : 'Retry Map Download'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function offlinePrepPresentationColor(kind: OfflinePrepPresentationKind): string {
  if (kind === 'ready') return '#66BB6A';
  if (kind === 'preparing') return '#64B5F6';
  if (kind === 'error') return '#EF5350';
  if (kind === 'blocked') return '#EF9A9A';
  return TACTICAL.amber;
}

function offlinePrepPresentationLabel(kind: OfflinePrepPresentationKind): string {
  if (kind === 'needs_download') return 'DOWNLOAD NEEDED';
  if (kind === 'preparing') return 'PREPARING';
  if (kind === 'ready') return 'READY';
  if (kind === 'degraded') return 'READY WITH LIMITS';
  if (kind === 'blocked') return 'REQUIRED ITEMS MISSING';
  return 'NEEDS RETRY';
}

function OfflinePrepOverview({ presentation }: { presentation: OfflinePrepPackPresentation }) {
  const requiredAttention = presentation.attentionItems
    .filter((item) => item.severity !== 'warning')
    .slice(0, 3);
  const groupIcons: Record<OfflinePrepPackPresentation['groups'][number]['id'], React.ComponentProps<typeof Ionicons>['name']> = {
    map: 'map-outline',
    route_geometry: 'git-branch-outline',
    guidance_itinerary: 'navigate-outline',
    optional_field_context: 'layers-outline',
  };

  return (
    <View style={styles.overviewCard} testID="offline-prep-navigation-overview">
      <View style={styles.overviewMetrics}>
        <View style={styles.overviewMetric}>
          <Text style={styles.overviewMetricLabel}>MAP</Text>
          <Text style={[styles.overviewMetricValue, { color: presentation.mapReady ? '#66BB6A' : TACTICAL.amber }]}>
            {presentation.mapReady ? 'Cached' : presentation.mapStatus.replace('_', ' ')}
          </Text>
        </View>
        <View style={styles.overviewMetric}>
          <Text style={styles.overviewMetricLabel}>ROUTE</Text>
          <Text style={[styles.overviewMetricValue, { color: presentation.routeGeometryReady ? '#66BB6A' : '#EF9A9A' }]}>
            {presentation.routeGeometryReady ? 'Ready' : 'Missing'}
          </Text>
        </View>
        <View style={styles.overviewMetric}>
          <Text style={styles.overviewMetricLabel}>TURN GUIDANCE</Text>
          <Text style={[styles.overviewMetricValue, { color: presentation.turnGuidanceState === 'ready' ? '#66BB6A' : TACTICAL.amber }]}>
            {presentation.turnGuidanceState.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <View style={styles.overviewGroupGrid}>
        {presentation.groups.map((group) => {
          const color = offlinePrepPresentationColor(group.status);
          return (
            <View key={group.id} style={styles.overviewGroup} testID={`offline-prep-group-${group.id}`}>
              <View style={styles.overviewGroupHeader}>
                <Ionicons name={groupIcons[group.id]} size={15} color={color} />
                <Text style={styles.overviewGroupTitle}>{group.label}</Text>
                <Text style={[styles.overviewGroupStatus, { color }]}>
                  {offlinePrepPresentationLabel(group.status)}
                </Text>
              </View>
              <Text style={styles.overviewGroupSummary}>{group.summary}</Text>
              <Text style={styles.overviewGroupMeta}>
                {group.requiredCount > 0
                  ? `${group.requiredReadyCount}/${group.requiredCount} required ready`
                  : `${group.readyCount}/${group.items.length} available`}
                {group.estimatedSizeMB != null ? ` | ${group.estimatedSizeMB} MB` : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {requiredAttention.length > 0 ? (
        <View style={styles.attentionBlock} testID="offline-prep-required-attention">
          <Text style={styles.attentionTitle}>Required attention</Text>
          {requiredAttention.map((item) => (
            <View key={item.id} style={styles.attentionRow}>
              <Ionicons name="alert-circle-outline" size={14} color={item.severity === 'error' ? '#EF5350' : TACTICAL.amber} />
              <View style={styles.attentionCopy}>
                <Text style={styles.attentionItemTitle}>{item.title}</Text>
                <Text style={styles.attentionItemText}>{item.message}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ExploreOfflinePrepPackScreen() {
  recordECSPerformanceRender('offline_prep_departure_audit', 'offline_prep_screen');
  const [offlinePrepPerformance] = useState(() => startECSPerformanceSpan(
    'offline_prep_departure_audit',
    'package_read_to_manifest_ready',
    { trackOutstanding: true },
  ));
  const { returnTo: returnSingleFlight } = useECSNavigation();
  const params = useLocalSearchParams<{ routeId?: string; action?: string }>();
  const insets = useSafeAreaInsets();
  const bottomClearance = getShellBottomClearance(insets.bottom, 8);
  const [routes, setRoutes] = useState<TripBuilderRouteInput[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeListVisible, setRouteListVisible] = useState(false);
  const [handoffInput, setHandoffInput] = useState<OfflinePrepPackInput | null>(null);
  const [manifest, setManifest] = useState<OfflinePrepPackManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeImportState, setRouteImportState] = useState<RouteImportState>({ status: 'idle', message: null });
  const [prepareAttempted, setPrepareAttempted] = useState(false);
  const [prepareConfirmVisible, setPrepareConfirmVisible] = useState(false);
  const [prepareSaving, setPrepareSaving] = useState(false);
  const [manifestExporting, setManifestExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geometryResolving, setGeometryResolving] = useState(false);
  const [weatherResolving, setWeatherResolving] = useState(false);
  const [weatherSnapshotsByRouteId, setWeatherSnapshotsByRouteId] = useState<Record<string, Record<string, unknown>>>({});
  const [syncSnapshot, setSyncSnapshot] = useState<OfflineTileSyncSnapshot>(() => offlineTileSyncCoordinator.getSnapshot());
  const [tileRegions, setTileRegions] = useState<TileCacheRegion[]>(() => tileCacheStore.getRegions());
  const [mapRetrying, setMapRetrying] = useState(false);
  const [routeLoadRevision, setRouteLoadRevision] = useState(0);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const geometryResolveAttemptedRef = useRef<Set<string>>(new Set());
  const weatherResolveAttemptedRef = useRef<Set<string>>(new Set());
  const geometryRequestGenerationRef = useRef(0);
  const weatherRequestGenerationRef = useRef(0);
  const mapRetryRequestRef = useRef(false);
  const prepareActionLifecycleRef = useRef(createOfflinePrepActionLifecycle<void>());
  const exportActionLifecycleRef = useRef(createOfflinePrepActionLifecycle<ExploreTripManifestExportResult>());
  const importingRouteRef = useRef(false);
  const autoImportOpenedRef = useRef(false);
  const routeLoadTaskRef = useRef<ShellInteractionTask | null>(null);
  const contentListRef = useRef<FlatList<OfflinePrepContentRow> | null>(null);
  const mountedRef = useRef(true);
  const queuedActionCount = actionMessage?.match(/^(\d+)\s/)?.[1];
  const errorAnnouncement = error
    ? {
        id: `offline-prep-error:${error}`,
        kind: 'error' as const,
        subject: 'Offline Prep',
        detail: error,
      }
    : null;
  const queuedActionAnnouncement = actionMessage && /\bqueued\b/i.test(actionMessage)
    ? {
        id: `offline-prep-queued:${actionMessage}`,
        kind: 'offline_action_queued' as const,
        subject: 'offline map segment',
        count: queuedActionCount ? Number(queuedActionCount) : undefined,
        detail: actionMessage,
      }
    : null;

  useEffect(() => {
    const refreshSyncState = () => {
      setSyncSnapshot(offlineTileSyncCoordinator.getSnapshot());
      setTileRegions(tileCacheStore.getRegions());
    };
    const unsubscribeSync = offlineTileSyncCoordinator.subscribe(refreshSyncState);
    const unsubscribeTileCache = tileCacheStore.subscribe(refreshSyncState);
    const initialSyncTask = runAfterShellInteractions(refreshSyncState, {
      delayMs: 120,
      maxWaitMs: 800,
    });
    return () => {
      initialSyncTask.cancel();
      unsubscribeSync();
      unsubscribeTileCache();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    prepareActionLifecycleRef.current = createOfflinePrepActionLifecycle<void>();
    exportActionLifecycleRef.current = createOfflinePrepActionLifecycle<ExploreTripManifestExportResult>();
    return () => {
      mountedRef.current = false;
      prepareActionLifecycleRef.current.dispose();
      exportActionLifecycleRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    prepareActionLifecycleRef.current.cancel('route_changed');
    exportActionLifecycleRef.current.cancel('route_changed');
    setPrepareSaving(false);
    setManifestExporting(false);
  }, [selectedRouteId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    routeLoadTaskRef.current?.cancel();
    routeLoadTaskRef.current = runAfterShellInteractions(() => {
      void (async () => {
        try {
          const hydrated = await withTimeout(
            Promise.all([
              loadOfflinePrepPackHandoffAsync(),
              loadExplorePlanningRouteContextAsync(),
            ]),
            OFFLINE_PREP_HYDRATION_TIMEOUT_MS,
            'offline-prep-hydration',
          );
          if (!hydrated) {
            throw new Error('Offline Prep route options did not finish loading. Retry when local storage is available.');
          }
          const [handoff, exploreContext] = hydrated;
          const suggestedRoutes = (exploreContext?.routes?.length
            ? exploreContext.routes
            : loadOpportunitiesWithCompatibility(null).opportunities
          ).slice(0, 8) as unknown as TripBuilderRouteInput[];
          const cachedRoutes = await listOfflineCachedRoutes().catch(() => []);
          if (cancelled) return;
          const routeMap = new Map<string, TripBuilderRouteInput>();
          if (handoff?.input?.route) upsertExplorePlanningRoute(routeMap, handoff.input.route);
          cachedRoutes.forEach((cachedRoute) => upsertExplorePlanningRoute(routeMap, offlineCachedRouteToTripBuilderInput(cachedRoute)));
          suggestedRoutes.forEach((route) => upsertExplorePlanningRoute(routeMap, route));
          const nextRoutes = Array.from(routeMap.values());
          setRoutes(nextRoutes);
          setHandoffInput(handoff?.input ?? null);
          const requestedRouteId = params.routeId ? String(params.routeId) : null;
          const requestedRoute = requestedRouteId
            ? nextRoutes.find((route) => routeId(route) === requestedRouteId)
            : null;
          const handoffRouteId = handoff?.input?.route ? routeId(handoff.input.route) : null;
          const nextSelectedRouteId = requestedRoute
            ? routeId(requestedRoute)
            : handoffRouteId;
          setSelectedRouteId(nextSelectedRouteId);
          setRouteListVisible(!nextSelectedRouteId || params.action === 'import');
          setError(null);
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError instanceof Error
              ? loadError.message
              : 'Offline Prep Pack could not load route options.');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, {
      delayMs: 120,
      maxWaitMs: 700,
    });
    return () => {
      cancelled = true;
      routeLoadTaskRef.current?.cancel();
      routeLoadTaskRef.current = null;
    };
  }, [params.action, params.routeId, routeLoadRevision]);

  const selectedRoute = useMemo(
    () => routes.find((route) => routeId(route) === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const selectedInput = useMemo<OfflinePrepPackInput | null>(() => {
    if (!selectedRoute) return null;
    const selectedRouteKey = routeId(selectedRoute);
    const weatherSnapshot = weatherSnapshotsByRouteId[selectedRouteKey] ?? null;
    if (handoffInput && routeId(handoffInput.route) === selectedRouteKey) {
      return {
        ...handoffInput,
        weatherSnapshot: weatherSnapshot ?? handoffInput.weatherSnapshot ?? null,
      };
    }
    return {
      route: selectedRoute,
      vehicleProfile: buildVehicleProfile(),
      readiness: buildReadinessReference(selectedRoute),
      campsiteCandidates: routeToCampCandidates(selectedRoute),
      weatherSnapshot,
    };
  }, [handoffInput, selectedRoute, weatherSnapshotsByRouteId]);

  useEffect(() => {
    if (!selectedInput) {
      setManifest(null);
      return;
    }
    try {
      setManifest(buildOfflinePrepPackManifest(selectedInput));
      setError(null);
      setPrepareAttempted(false);
      setPrepareConfirmVisible(false);
      setPrepareSaving(false);
      setManifestExporting(false);
      setActionMessage(null);
    } catch {
      setManifest(null);
      setError('Offline Prep Pack could not build a manifest from the selected route.');
    }
  }, [selectedInput]);

  useEffect(() => {
    if (loading || (selectedRoute && !manifest && !error)) return;
    offlinePrepPerformance.end(error ? 'failed' : 'completed', {
      routeCount: routes.length,
      manifestAvailable: Boolean(manifest),
      selectedRouteAvailable: Boolean(selectedRoute),
    });
  }, [error, loading, manifest, offlinePrepPerformance, routes.length, selectedRoute]);

  useEffect(() => () => offlinePrepPerformance.cancel({ unmounted: true }), [offlinePrepPerformance]);

  useEffect(() => {
    if (!selectedInput) return;
    try {
      setManifest(buildOfflinePrepPackManifest(selectedInput));
    } catch {
      setError('Offline Prep status could not refresh from the local route cache. Retry the manifest.');
    }
  }, [selectedInput, tileRegions]);

  useEffect(() => {
    const requestGeneration = ++geometryRequestGenerationRef.current;
    setGeometryResolving(false);
    if (!selectedInput) return;
    const points = getOfflinePrepRouteCoordinates(selectedInput.route);
    const metadataSource =
      typeof selectedInput.route.routeMetadata?.offlinePrepGeometrySource === 'string'
        ? selectedInput.route.routeMetadata.offlinePrepGeometrySource
        : null;
    if (points.length !== 2 || metadataSource === 'mapbox_directions_endpoint_route') return;
    const attemptKey = `${routeId(selectedInput.route)}:${points[0].latitude.toFixed(5)},${points[0].longitude.toFixed(5)}:${points[1].latitude.toFixed(5)},${points[1].longitude.toFixed(5)}`;
    if (geometryResolveAttemptedRef.current.has(attemptKey)) return;
    geometryResolveAttemptedRef.current.add(attemptKey);

    let cancelled = false;
    const geometryRefreshTask = runAfterShellInteractions(() => {
      if (cancelled || geometryRequestGenerationRef.current !== requestGeneration) return;
      setGeometryResolving(true);
      getMapboxToken()
        .then((token) => hydrateOfflinePrepRouteGeometry(selectedInput, { accessToken: token }))
        .then((hydratedInput) => {
          if (cancelled || geometryRequestGenerationRef.current !== requestGeneration) return;
          const hydratedPoints = getOfflinePrepRouteCoordinates(hydratedInput.route);
          if (hydratedPoints.length <= points.length) return;
          setHandoffInput(hydratedInput);
          setManifest(buildOfflinePrepPackManifest(hydratedInput));
          setActionMessage('Route geometry refreshed for offline prep from the selected route endpoints.');
        })
        .catch(() => {
          if (!cancelled && geometryRequestGenerationRef.current === requestGeneration) {
            setActionMessage('Offline Prep is using the best available route line. Full route geometry can refresh when Mapbox route data is available.');
          }
        })
        .finally(() => {
          if (!cancelled && geometryRequestGenerationRef.current === requestGeneration) {
            setGeometryResolving(false);
          }
        });
    }, {
      delayMs: 180,
      maxWaitMs: 900,
    });

    return () => {
      cancelled = true;
      geometryRefreshTask.cancel();
    };
  }, [refreshRevision, selectedInput]);

  useEffect(() => {
    const requestGeneration = ++weatherRequestGenerationRef.current;
    setWeatherResolving(false);
    if (!selectedInput || selectedInput.weatherSnapshot) return;
    const weatherSampleSelection = offlinePrepWeatherSampleSelection(selectedInput);
    const weatherCoordinates = routeWeatherSamplesToCoordinates(weatherSampleSelection);
    if (weatherCoordinates.length === 0) return;
    const selectedRouteKey = routeId(selectedInput.route);
    const attemptKey = `${selectedRouteKey}:${weatherCoordinateSignature(weatherCoordinates)}`;
    if (weatherResolveAttemptedRef.current.has(attemptKey)) return;
    weatherResolveAttemptedRef.current.add(attemptKey);

    let cancelled = false;
    const weatherRefreshTask = runAfterShellInteractions(() => {
      if (cancelled || weatherRequestGenerationRef.current !== requestGeneration) return;
      setWeatherResolving(true);
      fetchSharedWeatherForCoordinates(weatherCoordinates, 'imperial', false, 'route_segment')
        .then((weather) => {
          if (cancelled || weatherRequestGenerationRef.current !== requestGeneration) return;
          const weatherSnapshot = buildOfflinePrepWeatherSnapshot(
            selectedInput.route,
            weatherCoordinates,
            weather,
            weatherSampleSelection,
          );
          if (!weatherSnapshot) return;
          setWeatherSnapshotsByRouteId((current) => ({
            ...current,
            [selectedRouteKey]: weatherSnapshot,
          }));
          setActionMessage('Weather snapshot refreshed for the selected route.');
        })
        .catch(() => {
          if (!cancelled && weatherRequestGenerationRef.current === requestGeneration) {
            setActionMessage('Weather snapshot is still unavailable. Retry the manifest when route weather is reachable.');
          }
        })
        .finally(() => {
          if (!cancelled && weatherRequestGenerationRef.current === requestGeneration) {
            setWeatherResolving(false);
          }
        });
    }, {
      delayMs: 220,
      maxWaitMs: 1000,
    });

    return () => {
      cancelled = true;
      weatherRefreshTask.cancel();
    };
  }, [refreshRevision, selectedInput]);

  const stateCopy = manifestStateCopy(manifest?.progress.status ?? 'not_started', manifest?.progress);
  const mapQueueState = useMemo(
    () => resolveOfflinePrepMapQueueState({ manifest, syncSnapshot, regions: tileRegions }),
    [manifest, syncSnapshot, tileRegions],
  );
  const packPresentation = useMemo(
    () => manifest
      ? buildOfflinePrepPackPresentation({ manifest, mapQueueState })
      : null,
    [manifest, mapQueueState],
  );
  const packStateAnnouncement = packPresentation && ['ready', 'degraded', 'blocked', 'error'].includes(packPresentation.kind)
    ? {
        id: `offline-prep-state:${packPresentation.routeName}:${packPresentation.kind}`,
        kind: packPresentation.kind === 'error' ? 'error' as const : 'status_changed' as const,
        subject: packPresentation.headline,
        detail: packPresentation.summary,
      }
    : null;
  const selectedRouteCatalogMetadata = selectedInput?.route.routeMetadata ?? null;
  const routeCatalogSourceRows = useMemo(
    () => buildRouteCatalogSourceRows(selectedRouteCatalogMetadata),
    [selectedRouteCatalogMetadata],
  );
  const routeCatalogAttributionRows = useMemo(
    () => buildRouteCatalogAttributionRows(selectedRouteCatalogMetadata),
    [selectedRouteCatalogMetadata],
  );
  const routeCatalogFreshnessWarnings = useMemo(
    () => readRouteCatalogFreshnessWarnings(selectedRouteCatalogMetadata),
    [selectedRouteCatalogMetadata],
  );
  const routeCatalogOfflineCache = useMemo(
    () => readRouteCatalogOfflineCache(selectedRouteCatalogMetadata),
    [selectedRouteCatalogMetadata],
  );
  const routeCatalogCurrentCondition = useMemo(
    () => readRouteCatalogCurrentCondition(selectedRouteCatalogMetadata),
    [selectedRouteCatalogMetadata],
  );
  const showRouteCatalogSourceCheck =
    routeCatalogSourceRows.length > 0 ||
    routeCatalogAttributionRows.length > 0 ||
    routeCatalogFreshnessWarnings.length > 0 ||
    routeCatalogCurrentCondition != null ||
    routeCatalogOfflineCache != null;

  const handleSelectOfflinePrepRoute = useCallback((route: TripBuilderRouteInput) => {
    hapticMicro();
    setSelectedRouteId(routeId(route));
    setRouteListVisible(false);
    setRouteImportState({ status: 'idle', message: null });
    setPrepareConfirmVisible(false);
    setPrepareAttempted(false);
    setActionMessage(null);
    setError(null);
    setDetailsVisible(false);
  }, []);

  const handleReturnToOfflinePrepRouteList = useCallback(() => {
    hapticMicro();
    setSelectedRouteId(null);
    setRouteListVisible(true);
    setManifest(null);
    setPrepareConfirmVisible(false);
    setPrepareAttempted(false);
    setActionMessage(null);
    setError(null);
    setDetailsVisible(false);
  }, []);

  const handleOfflinePrepImportRouteFile = useCallback(async () => {
    if (importingRouteRef.current) return;
    importingRouteRef.current = true;
    hapticMicro();
    setRouteImportState({ status: 'loading', message: 'Opening route file picker...' });
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/gpx+xml',
          'application/vnd.google-earth.kml+xml',
          'text/xml',
          'application/xml',
          'application/json',
          'application/geo+json',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setRouteImportState({ status: 'idle', message: null });
        return;
      }

      const asset = result.assets[0];
      const fileName = asset.name || 'imported-route.gpx';
      const content = await fsReadFileFromPickerUri(asset.uri);
      if (!content) {
        throw new Error('Could not read selected route file.');
      }

      const importedRoute = buildOfflinePrepImportedRoute(fileName, content);
      const routeMap = new Map<string, TripBuilderRouteInput>();
      upsertExplorePlanningRoute(routeMap, importedRoute);
      routes.forEach((route) => upsertExplorePlanningRoute(routeMap, route));
      const nextRoutes = Array.from(routeMap.values());
      setRoutes(nextRoutes);
      saveExplorePlanningRouteContext({
        routes: nextRoutes.length > 0 ? nextRoutes : [importedRoute],
        radiusMiles: null,
        refinementLabel: 'Imported Route',
        source: 'offline_prep_tab',
      });
      setHandoffInput(null);
      setSelectedRouteId(routeId(importedRoute));
      setRouteListVisible(false);
      setRouteImportState({ status: 'success', message: `${fileName} ready for Offline Prep.` });
      setPrepareConfirmVisible(false);
      setPrepareAttempted(false);
      setActionMessage(null);
      setError(null);
    } catch (importError) {
      setRouteListVisible(true);
      setRouteImportState({
        status: 'error',
        message: importError instanceof Error ? importError.message : 'Route import failed.',
      });
    } finally {
      importingRouteRef.current = false;
    }
  }, [routes]);

  useEffect(() => {
    if (params.action !== 'import' || loading || autoImportOpenedRef.current) return;
    autoImportOpenedRef.current = true;
    setRouteListVisible(true);
    setSelectedRouteId(null);
    void handleOfflinePrepImportRouteFile();
  }, [handleOfflinePrepImportRouteFile, loading, params.action]);

  const updateCachedRouteTileStatus = async (
    run: ECSRun,
    regionId: string,
    routeIntent: OfflineRouteIntentMetadata,
    tileCacheStatus: OfflineCachedRoute['tileCacheStatus'],
    tileCacheError: string | null | undefined = undefined,
    requiredRegionIds?: string[],
  ) => {
    const updated = await cacheOfflineRoute({
      run,
      health: computeRunHealth(run),
      offlineTileRegionId: regionId,
      offlineTileRegionIds: requiredRegionIds,
      tileCacheStatus,
      tileCacheError,
      routeIntent,
      segmentRiskAnalysis: {
        source: 'offline_prep_pack',
        manifest,
        tripPlan: selectedInput?.tripPlan ?? null,
        weatherSnapshot: selectedInput?.weatherSnapshot ?? null,
      },
      includeRemoteConnectivityCache: true,
      preparedRoadRoute: selectedInput
        ? getOfflinePrepPreparedRoadRoute(selectedInput)
        : null,
    });
    runStore.upsert({
      ...run,
      offline_cache: offlineCachedRouteToRunCacheManifest(updated, run),
    });
    if (mountedRef.current) {
      setRoutes((current) => {
        const routeMap = new Map<string, TripBuilderRouteInput>();
        current.forEach((route) => upsertExplorePlanningRoute(routeMap, route));
        upsertExplorePlanningRoute(routeMap, offlineCachedRouteToTripBuilderInput(updated));
        return Array.from(routeMap.values());
      });
    }
    return updated;
  };

  const startMapSyncForRegion = (
    region: TileCacheRegion,
    run: ECSRun,
    routeIntent: OfflineRouteIntentMetadata,
    readinessManifestId: string,
  ) => {
    void offlineTileSyncCoordinator
      .startRegionSync({
        regionId: region.id,
        source: 'route-corridor',
        syncType: 'route',
        regionName: region.name,
        routeIntent: routeIntent as unknown as Record<string, unknown>,
      })
      .then(async (job) => {
        offlineReadinessCoordinator.reconcileTileState(
          offlineTileSyncCoordinator.getSnapshot().jobs,
          tileCacheStore.getRegions(),
        );
        void offlineReadinessCoordinator.flush();
        const tileCacheStatus =
          job.status === 'complete'
            ? 'complete'
            : job.status === 'cancelled'
              ? 'not_requested'
              : 'failed';
        await updateCachedRouteTileStatus(
          run,
          region.id,
          routeIntent,
          tileCacheStatus,
          tileCacheStatus === 'failed'
            ? job.errorMessage ?? 'Offline map region download failed.'
            : undefined,
        );
      })
      .catch(async (syncError: unknown) => {
        offlineReadinessCoordinator.reconcileTileState(
          offlineTileSyncCoordinator.getSnapshot().jobs,
          tileCacheStore.getRegions(),
        );
        offlineReadinessCoordinator.failPreparation(readinessManifestId, 'tile_sync_failed');
        void offlineReadinessCoordinator.flush();
        await updateCachedRouteTileStatus(
          run,
          region.id,
          routeIntent,
          'failed',
          syncError instanceof Error ? syncError.message : 'Offline Prep Pack download failed',
        ).catch(() => null);
      });
  };

  const performOfflinePackPreparation = async (context: OfflinePrepActionContext) => {
    const canPublishActionState = () => mountedRef.current && context.isCurrent() && !context.signal.aborted;
    if (!canPublishActionState()) return;
    hapticMicro();
    if (!manifest || !selectedInput) {
      setError('Select a route before preparing an Offline Prep Pack.');
      return;
    }
    setPrepareSaving(true);
    setError(null);
    setPrepareConfirmVisible(false);
    try {
      const run = buildOfflinePrepRun(selectedInput);
      if (!run) {
        throw new Error('Route geometry is required before saving this Offline Prep Pack.');
      }
      const analysis = analyzeRoute(run);
      if (!analysis) {
        throw new Error('Route corridor analysis is required before preparing this Offline Prep Pack.');
      }
      const routeIntent = buildOfflinePrepRouteIntent(selectedInput, manifest, run, analysis);
      const criticalSegments = criticalOfflineSegmentsFromManifest(manifest);
      const quotaStatus = tileCacheStore.getQuotaStatus();
      offlineReadinessCoordinator.beginPreparation(manifest.readinessManifest, {
        availableBytes: analysis.cacheComplete
          ? null
          : Math.round(quotaStatus.availableMB * 1024 * 1024),
        quotaBytes: Math.round(quotaStatus.config.quotaLimitMB * 1024 * 1024),
      });
      if (manifestFullRouteMapTooLarge(manifest)) {
        if (criticalSegments.length === 0) {
          throw new Error('Full-route map download is too large, and ECS could not isolate low-signal segment downloads from this route geometry.');
        }
        const segmentSizeMB = criticalSegments.reduce((sum, segment) => sum + segment.estimatedSizeMB, 0);
        const quotaCheck = tileCacheStore.checkQuotaBeforeDownload(segmentSizeMB);
        if (!quotaCheck.canProceed) {
          throw new Error(quotaCheck.message || 'Low-signal segment downloads exceed available offline map storage.');
        }
        const regions = criticalSegments.map((segment, index) => {
          const region = tileCacheStore.createFromRoute(
            `${segment.label}: ${run.title}`,
            segment.coordinates.map((point) => ({ lat: point.latitude, lng: point.longitude })),
            segment.bounds.corridorMiles,
            segment.zoomMin,
            segment.zoomMax,
            'tactical',
          );
          if (!region) {
            throw new Error('Low-signal segment route corridor is unavailable.');
          }
          const segmentRouteIntent = {
            ...routeIntent,
            mapContext: {
              ...(routeIntent.mapContext ?? {}),
              layerContext: [...(routeIntent.mapContext?.layerContext ?? []), 'critical_offline_segments'],
              zoomMin: segment.zoomMin,
              zoomMax: segment.zoomMax,
              corridorMiles: segment.bounds.corridorMiles,
            },
            readinessSnapshot: {
              offlinePrepManifest: manifest,
              tripPlan: selectedInput.tripPlan ?? null,
              weatherSnapshot: selectedInput.weatherSnapshot ?? null,
              readiness: selectedInput.readiness ?? selectedInput.tripPlan?.readinessReference ?? null,
              offlinePrepCriticalSegment: segment,
              offlinePrepCriticalSegmentIndex: index + 1,
              offlinePrepFallbackFor: 'full_route_map_limit',
            },
          } as OfflineRouteIntentMetadata;
          tileCacheStore.updateRegion(region.id, {
            routeId: run.id,
            sourceType: 'route-corridor',
            syncType: 'route',
            corridorMiles: segment.bounds.corridorMiles,
            routeIntent: segmentRouteIntent as unknown as Record<string, unknown>,
          });
          return { region, routeIntent: segmentRouteIntent };
        });
        const primary = regions[0];
        const requiredRegionIds = regions.map(({ region }) => region.id);
        await updateCachedRouteTileStatus(
          run,
          primary.region.id,
          primary.routeIntent,
          'downloading',
          null,
          requiredRegionIds,
        );
        saveExplorePlanningRouteContext({
          routes: [selectedInput.route],
          radiusMiles: null,
          refinementLabel: 'Prepared Low-Signal Offline Segments',
          source: 'offline_prep_tab',
        });
        if (canPublishActionState()) {
          setPrepareAttempted(true);
          setActionMessage(`${criticalSegments.length} low-signal map segment${criticalSegments.length === 1 ? '' : 's'} queued. ECS is caching the route sections most likely to lose service instead of the oversized full-route map.`);
        }
        offlineReadinessCoordinator.attachMapRegions(
          manifest.readinessManifest.manifestId,
          regions.map(({ region }) => region),
        );
        void offlineReadinessCoordinator.flush();
        regions.forEach(({ region, routeIntent: segmentRouteIntent }) => {
          startMapSyncForRegion(region, run, segmentRouteIntent, manifest.readinessManifest.manifestId);
        });
        return;
      }
      const quotaCheck = tileCacheStore.checkQuotaBeforeDownload(analysis.estimatedSizeMB);
      if (!analysis.cacheComplete && !quotaCheck.canProceed) {
        offlineReadinessCoordinator.failPreparation(manifest.readinessManifest.manifestId, 'low_storage');
        throw new Error(quotaCheck.message || 'Offline route download exceeds available offline map storage.');
      }
      const existingCompleteRegion = analysis.cacheComplete ? analysis.cachedRegion : null;
      const region = existingCompleteRegion ?? tileCacheStore.createFromRoute(
        `Route: ${run.title}`,
        run.points.map((point) => ({ lat: point.lat, lng: point.lng })),
        analysis.bufferMiles,
        analysis.zoomMin,
        analysis.zoomMax,
        'tactical',
      );
      if (!region) {
        throw new Error('Route corridor analysis is required before preparing this Offline Prep Pack.');
      }
      tileCacheStore.updateRegion(region.id, {
        routeId: run.id,
        sourceType: 'route-corridor',
        syncType: 'route',
        corridorMiles: analysis.bufferMiles,
        routeIntent: routeIntent as unknown as Record<string, unknown>,
      });
      await updateCachedRouteTileStatus(
        run,
        region.id,
        routeIntent,
        existingCompleteRegion ? 'complete' : 'downloading',
        null,
        [region.id],
      );
      saveExplorePlanningRouteContext({
        routes: [selectedInput.route],
        radiusMiles: null,
        refinementLabel: 'Prepared Offline Pack',
        source: 'offline_prep_tab',
      });
      if (canPublishActionState()) {
        setPrepareAttempted(true);
        setActionMessage(existingCompleteRegion
          ? `${manifestStateCopy(manifest.progress.status, manifest.progress).message} Offline route package is already cached and saved to Navigate, Offline Cache, and the Offline Prep list.`
          : 'Offline Prep Pack download started. Progress will remain visible above the ECS banner while you move through the app.');
      }
      offlineReadinessCoordinator.attachMapRegions(manifest.readinessManifest.manifestId, [region]);
      offlineReadinessCoordinator.reconcileTileState(
        offlineTileSyncCoordinator.getSnapshot().jobs,
        tileCacheStore.getRegions(),
      );
      void offlineReadinessCoordinator.flush();
      if (!existingCompleteRegion) {
        startMapSyncForRegion(region, run, routeIntent, manifest.readinessManifest.manifestId);
      }
    } catch (prepareError) {
      const currentReadiness = offlineReadinessCoordinator.getManifest(manifest.readinessManifest.manifestId);
      if (!currentReadiness?.preparation.lastErrorCode) {
        offlineReadinessCoordinator.failPreparation(manifest.readinessManifest.manifestId, 'offline_preparation_failed');
      }
      void offlineReadinessCoordinator.flush();
      if (canPublishActionState()) {
        setPrepareAttempted(true);
        setError(prepareError instanceof Error ? prepareError.message : 'Offline Prep Pack could not be saved.');
        setActionMessage(null);
      }
      throw prepareError;
    } finally {
      if (canPublishActionState()) setPrepareSaving(false);
    }
  };

  const prepareOfflinePack = async () => {
    if (!manifest || !selectedInput) {
      setError('Select a route before preparing an Offline Prep Pack.');
      return;
    }
    const fingerprint = createOfflinePrepActionFingerprint({
      action: 'prepare_pack',
      routeId: routeId(selectedInput.route),
      manifestId: manifest.id,
      sourceRevision: manifest.generatedAt,
    });
    const execution = prepareActionLifecycleRef.current.run({
      action: 'prepare_pack',
      fingerprint,
      attempt: 'refresh',
      safeErrorCode: 'OFFLINE_PREP_PREPARATION_FAILED',
      execute: performOfflinePackPreparation,
    });
    await execution.promise;
  };

  const handlePrepare = () => {
    if (!manifest) {
      setError('Select a route before preparing an Offline Prep Pack.');
      return;
    }
    if (shouldConfirmPartialPrepare(manifest)) {
      hapticMicro();
      setPrepareConfirmVisible(true);
      setActionMessage(null);
      contentListRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }
    void prepareOfflinePack();
  };

  const handleExportPrintableManifest = useCallback(async () => {
    if (!manifest || !selectedInput) {
      setError('Select a route before exporting a family emergency manifest.');
      return;
    }
    const fingerprint = createOfflinePrepActionFingerprint({
      action: 'export_manifest',
      routeId: routeId(selectedInput.route),
      manifestId: manifest.id,
      sourceRevision: manifest.generatedAt,
    });
    const execution = exportActionLifecycleRef.current.run({
      action: 'export_manifest',
      fingerprint,
      attempt: 'refresh',
      safeErrorCode: 'OFFLINE_PREP_MANIFEST_EXPORT_FAILED',
      execute: () => exportExploreTripManifestPdf({
        title: `${routeName(selectedInput.route)} Family Emergency Trip Manifest`,
        manifest,
        route: selectedInput.route,
        routeCoordinates: getOfflinePrepPackRouteCoordinates(selectedInput),
        itinerary: selectedInput.itinerary ?? null,
        tripPlan: selectedInput.tripPlan ?? null,
        readiness: selectedInput.readiness ?? selectedInput.tripPlan?.readinessReference ?? null,
        vehicleProfile: selectedInput.vehicleProfile ?? null,
        emergencyPoints: selectedInput.emergencyPoints ?? null,
        emergencyNotes: selectedInput.emergencyNotes ?? null,
        offlinePresentation: packPresentation,
      }),
    });
    if (execution.decision === 'started') {
      hapticMicro();
      setManifestExporting(true);
      setError(null);
    }
    const outcome = await execution.promise;
    setManifestExporting(false);
    if (!outcome.accepted) return;
    if (outcome.status === 'succeeded' && outcome.data?.success) {
      setActionMessage('Family emergency trip manifest is ready to print or share with a trusted contact.');
    } else {
      setError(outcome.data?.error ?? 'Family emergency manifest export failed.');
    }
  }, [manifest, packPresentation, selectedInput]);

  const handleRetry = () => {
    if (!selectedInput) {
      hapticMicro();
      setError(null);
      setLoading(true);
      setRouteLoadRevision((revision) => revision + 1);
      return;
    }
    hapticMicro();
    if (manifest && mapQueueState?.retryable && (mapQueueState.regionIds?.length || mapQueueState.regionId)) {
      if (mapRetryRequestRef.current) return;
      const packageRegionIds = Array.from(new Set(
        (mapQueueState.regionIds?.length ? mapQueueState.regionIds : [mapQueueState.regionId])
          .filter((regionId): regionId is string => Boolean(regionId)),
      ));
      const retryRegionIds = resolveOfflinePrepRetryRegionIds(mapQueueState, tileCacheStore.getRegions());
      void (async () => {
        mapRetryRequestRef.current = true;
        setMapRetrying(true);
        setError(null);
        try {
          const run = buildOfflinePrepRun(selectedInput);
          if (!run) throw new Error('Route geometry is required before retrying offline map preparation.');
          const analysis = analyzeRoute(run);
          if (!analysis) throw new Error('Route corridor analysis is required before retrying offline map preparation.');
          const defaultRouteIntent = buildOfflinePrepRouteIntent(selectedInput, manifest, run, analysis);
          const retryRegions = retryRegionIds.map((regionId) => {
            const region = tileCacheStore.getRegion(regionId);
            if (!region) throw new Error('A required offline map region is missing. Start Prepare Offline Pack again.');
            const routeIntent = (region.routeIntent ?? defaultRouteIntent) as unknown as OfflineRouteIntentMetadata;
            tileCacheStore.updateRegion(region.id, {
              status: 'pending',
              errorMessage: undefined,
              routeId: run.id,
              sourceType: 'route-corridor',
              syncType: 'route',
              corridorMiles: region.corridorMiles ?? analysis.bufferMiles,
              routeIntent: routeIntent as unknown as Record<string, unknown>,
            });
            return { region: tileCacheStore.getRegion(region.id) ?? region, routeIntent };
          });
          if (retryRegions.length === 0) {
            throw new Error('No incomplete offline map regions remain to retry. Refresh the manifest to verify this pack.');
          }
          for (const { region, routeIntent } of retryRegions) {
            await updateCachedRouteTileStatus(run, region.id, routeIntent, 'downloading', null);
          }
          const quotaStatus = tileCacheStore.getQuotaStatus();
          offlineReadinessCoordinator.beginPreparation(manifest.readinessManifest, {
            availableBytes: Math.round(quotaStatus.availableMB * 1024 * 1024),
            quotaBytes: Math.round(quotaStatus.config.quotaLimitMB * 1024 * 1024),
          });
          const packageRegions = packageRegionIds.map((regionId) => {
            const region = tileCacheStore.getRegion(regionId);
            if (!region) throw new Error('A required offline map region is missing. Start Prepare Offline Pack again.');
            return region;
          });
          offlineReadinessCoordinator.attachMapRegions(
            manifest.readinessManifest.manifestId,
            packageRegions,
          );
          void offlineReadinessCoordinator.flush();
          retryRegions.forEach(({ region, routeIntent }) => {
            startMapSyncForRegion(region, run, routeIntent, manifest.readinessManifest.manifestId);
          });
          setPrepareAttempted(true);
          setPrepareConfirmVisible(false);
          setActionMessage(`${retryRegions.length} incomplete offline map region${retryRegions.length === 1 ? '' : 's'} queued for retry. Progress is shown here and in the shared ECS sync banner.`);
        } catch (retryError) {
          setError(retryError instanceof Error ? retryError.message : 'Offline map retry could not start.');
          setActionMessage(null);
        } finally {
          mapRetryRequestRef.current = false;
          setMapRetrying(false);
        }
      })();
      return;
    }
    geometryResolveAttemptedRef.current.clear();
    weatherResolveAttemptedRef.current.clear();
    geometryRequestGenerationRef.current += 1;
    weatherRequestGenerationRef.current += 1;
    setGeometryResolving(false);
    setWeatherResolving(false);
    try {
      setManifest(buildOfflinePrepPackManifest(selectedInput));
      setPrepareAttempted(false);
      setPrepareConfirmVisible(false);
      setError(null);
      setActionMessage('Offline Prep Pack manifest refreshed.');
      setRefreshRevision((revision) => revision + 1);
    } catch {
      setError('Offline Prep Pack manifest could not be refreshed from the selected route.');
      setActionMessage(null);
    }
  };

  const handleBackToSuggestedRoutes = () => {
    clearOfflinePrepPackHandoff();
    const routeIdForReturn = selectedRoute ? routeId(selectedRoute) : selectedRouteId;
    if (handoffInput?.tripPlan && routeIdForReturn) {
      returnSingleFlight(`/explore-trip-builder?routeId=${encodeURIComponent(routeIdForReturn)}&setup=1`);
      return;
    }
    returnSingleFlight('/discover');
  };

  const handlePrimaryPackAction = () => {
    if (!packPresentation) return;
    if (packPresentation.kind === 'degraded' || packPresentation.kind === 'blocked') {
      hapticMicro();
      setDetailsVisible(true);
      contentListRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }
    if (mapQueueState?.retryable) {
      handleRetry();
      return;
    }
    handlePrepare();
  };

  const showRouteList = routes.length > 0 && (routeListVisible || !selectedRouteId);
  const offlinePrepContentRows = useMemo<OfflinePrepContentRow[]>(() => {
    const rows: OfflinePrepContentRow[] = [{ type: 'hero' }];

    if (loading) {
      rows.push({ type: 'loading' });
      return rows;
    }

    if (error && routes.length === 0) {
      rows.push({ type: 'error' });
      return rows;
    }

    if (routes.length === 0) {
      rows.push({ type: 'empty' });
      return rows;
    }

    if (showRouteList) {
      rows.push({ type: 'route_list' });
      return rows;
    }

    if (manifest) {
      rows.push({ type: 'manifest_header' });
      if (prepareConfirmVisible) rows.push({ type: 'partial_confirm' });
      if (prepareAttempted || actionMessage) rows.push({ type: 'prepare_result' });
      if (error) rows.push({ type: 'error' });
      if (mapQueueState) rows.push({ type: 'map_queue' });
      rows.push({ type: 'pack_overview' }, { type: 'details_toggle' });
      if (detailsVisible) {
        if (showRouteCatalogSourceCheck) rows.push({ type: 'route_catalog_source_check' });
        manifest.items.forEach((item) => rows.push({ type: 'manifest_item', item }));
        if (manifest.errors.length > 0) rows.push({ type: 'manifest_errors' });
      }
      return rows;
    }

    if (error) rows.push({ type: 'error' });
    return rows;
  }, [
    actionMessage,
    detailsVisible,
    error,
    loading,
    manifest,
    mapQueueState,
    prepareAttempted,
    prepareConfirmVisible,
    routes.length,
    showRouteCatalogSourceCheck,
    showRouteList,
  ]);

  const renderOfflinePrepContentRow = ({ item: row }: ListRenderItemInfo<OfflinePrepContentRow>) => {
    switch (row.type) {
      case 'hero':
        return (
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="download-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>EXPLORE PLANNING</Text>
              <Text style={styles.heroTitle}>Offline Prep Pack</Text>
              <Text style={styles.heroText}>
                Download the map, route, guidance, and itinerary needed to follow this trip without service.
              </Text>
            </View>
          </View>
        );
      case 'loading':
        return (
          <View style={styles.stateCard}>
            <ActivityIndicator color={TACTICAL.amber} />
            <Text style={styles.stateText}>Loading route options...</Text>
          </View>
        );
      case 'empty':
        return (
          <View style={styles.stateCard} testID="offline-prep-empty-state">
            <Ionicons name="map-outline" size={20} color={TACTICAL.textMuted} />
            <Text style={styles.stateTitle}>No routes ready for offline prep</Text>
            <Text style={styles.stateText}>Import a route file or open Suggested Trailheads, then select a route to prepare an Offline Prep Pack.</Text>
            <TouchableOpacity
              style={styles.importRouteCard}
              activeOpacity={0.84}
              onPress={handleOfflinePrepImportRouteFile}
              disabled={routeImportState.status === 'loading'}
              accessibilityRole="button"
              accessibilityLabel="Import GPX or route file for Offline Prep"
              testID="offline-prep-import-route-file"
            >
              <View style={styles.importRouteIcon}>
                <Ionicons name="document-attach-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View style={styles.routeOptionCopy}>
                <Text style={styles.routeOptionTitle}>Import GPX / Route File</Text>
                <Text style={styles.routeOptionMeta}>Use a GPX, KML, or route export from this device.</Text>
              </View>
              {routeImportState.status === 'loading' ? (
                <ActivityIndicator size="small" color={TACTICAL.amber} />
              ) : (
                <Ionicons name="chevron-forward" size={15} color={TACTICAL.textMuted} />
              )}
            </TouchableOpacity>
            {routeImportState.message ? (
              <Text style={[styles.importStatusText, routeImportState.status === 'error' ? styles.importErrorText : null]}>
                {routeImportState.message}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.primaryButton} onPress={handleBackToSuggestedRoutes} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Suggested Trailheads</Text>
            </TouchableOpacity>
          </View>
        );
      case 'route_list':
        return (
          <View style={styles.routeListCard} testID="offline-prep-route-list">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionTitle}>Choose Offline Prep Route</Text>
                <Text style={styles.stateTextLeft}>Import a route file or select one of the current Suggested Trailheads.</Text>
              </View>
              <Text style={styles.sectionMeta}>{routes.length} ROUTES</Text>
            </View>

            <TouchableOpacity
              style={styles.importRouteCard}
              activeOpacity={0.84}
              onPress={handleOfflinePrepImportRouteFile}
              disabled={routeImportState.status === 'loading'}
              accessibilityRole="button"
              accessibilityLabel="Import GPX or route file for Offline Prep"
              testID="offline-prep-import-route-file"
            >
              <View style={styles.importRouteIcon}>
                <Ionicons name="document-attach-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View style={styles.routeOptionCopy}>
                <Text style={styles.routeOptionTitle}>Import GPX / Route File</Text>
                <Text style={styles.routeOptionMeta}>Use a GPX, KML, or route export from this device.</Text>
              </View>
              {routeImportState.status === 'loading' ? (
                <ActivityIndicator size="small" color={TACTICAL.amber} />
              ) : (
                <Ionicons name="chevron-forward" size={15} color={TACTICAL.textMuted} />
              )}
            </TouchableOpacity>

            {routeImportState.message ? (
              <Text style={[styles.importStatusText, routeImportState.status === 'error' ? styles.importErrorText : null]}>
                {routeImportState.message}
              </Text>
            ) : null}

            <View style={styles.routeOptionList}>
              {routes.map((route) => (
                <TouchableOpacity
                  key={routeId(route)}
                  style={styles.routeOption}
                  activeOpacity={0.82}
                  onPress={() => handleSelectOfflinePrepRoute(route)}
                  accessibilityRole="button"
                  accessibilityLabel={`Prepare ${routeName(route)} for offline use`}
                  testID={`offline-prep-route-option-${routeId(route)}`}
                >
                  <Ionicons name="map-outline" size={15} color={TACTICAL.textMuted} />
                  <View style={styles.routeOptionCopy}>
                    <Text style={styles.routeOptionTitle} numberOfLines={1}>{routeName(route)}</Text>
                    <Text style={styles.routeOptionMeta} numberOfLines={1}>
                      {(route.region as string | null) ?? 'Suggested trailhead'} | {routeDistance(route) != null ? `${Math.round(routeDistance(route) as number)} mi` : 'Distance unknown'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 'manifest_header': {
        if (!manifest || !packPresentation) return null;
        const requiredPercent = packPresentation.requiredCount > 0
          ? Math.round((packPresentation.requiredReadyCount / packPresentation.requiredCount) * 100)
          : 0;
        const presentationColor = offlinePrepPresentationColor(packPresentation.kind);
        return (
          <View style={styles.sectionCard} testID="offline-prep-manifest">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionTitle}>{packPresentation.headline}</Text>
                <Text style={[styles.sectionMeta, { color: presentationColor }]}>
                  {offlinePrepPresentationLabel(packPresentation.kind)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.backToListButton}
                activeOpacity={0.82}
                onPress={handleReturnToOfflinePrepRouteList}
                accessibilityRole="button"
                accessibilityLabel="Back to Offline Prep route list"
                testID="offline-prep-back-to-route-list"
              >
                <Ionicons name="arrow-back" size={13} color={TACTICAL.amber} />
                <Text style={styles.backToListText}>Back</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.routeNameText} numberOfLines={2}>{packPresentation.routeName}</Text>
            <Text style={styles.stateTextLeft}>
              {geometryResolving ? 'Refreshing route geometry for offline prep...' : packPresentation.summary}
            </Text>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel="Required offline navigation assets"
              accessibilityValue={{ min: 0, max: 100, now: requiredPercent, text: `${requiredPercent} percent ready` }}
            >
              <View style={[styles.progressFill, { width: `${requiredPercent}%`, backgroundColor: presentationColor }]} />
            </View>
            <Text style={styles.progressMeta}>
              {packPresentation.requiredReadyCount}/{packPresentation.requiredCount} navigation essentials ready
              {packPresentation.optionalGapCount > 0 ? ` | ${packPresentation.optionalGapCount} optional not included` : ''}
            </Text>
          </View>
        );
      }
      case 'pack_overview':
        return packPresentation ? <OfflinePrepOverview presentation={packPresentation} /> : null;
      case 'details_toggle':
        if (!manifest) return null;
        return (
          <TouchableOpacity
            style={styles.detailsToggle}
            activeOpacity={0.82}
            onPress={() => setDetailsVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={detailsVisible ? 'Hide Offline Prep pack details' : 'Show Offline Prep pack details'}
            accessibilityHint="Shows individual assets, source details, and optional items"
            accessibilityState={{ expanded: detailsVisible }}
            testID="offline-prep-details-toggle"
          >
            <View style={styles.detailsToggleCopy}>
              <Text style={styles.detailsToggleTitle}>{detailsVisible ? 'Hide Pack Details' : 'View Pack Details'}</Text>
              <Text style={styles.detailsToggleText}>
                {manifest.items.length} assets | source, optional, and troubleshooting details
              </Text>
            </View>
            <Ionicons name={detailsVisible ? 'chevron-up' : 'chevron-down'} size={16} color={TACTICAL.amber} />
          </TouchableOpacity>
        );
      case 'route_catalog_source_check':
        return (
          <View style={styles.sectionCard}>
            <View style={styles.sourceCheckBlock} testID="offline-prep-route-catalog-source-check">
              <View style={styles.sourceCheckHeader}>
                <View style={styles.sourceCheckTitleRow}>
                  <Ionicons name="shield-checkmark-outline" size={12} color={TACTICAL.amber} />
                  <Text style={styles.sourceCheckTitle}>Route Catalog Source Check</Text>
                </View>
                {routeCatalogOfflineCache ? (
                  <Text style={styles.sourceCheckStatus}>
                    {routeCatalogOfflineCache.cacheable ? 'CACHEABLE' : 'REVIEW'}
                  </Text>
                ) : null}
              </View>
              {routeCatalogOfflineCache ? (
                <>
                  <View style={styles.sourceCheckRow}>
                    <View style={styles.sourceCheckDot} />
                    <Text style={styles.sourceCheckText}>
                      CACHE STATUS | {routeCatalogOfflineCache.cacheable ? 'Cacheable' : 'Unavailable'} | Last verified {formatCatalogTimestamp(routeCatalogOfflineCache.lastVerifiedAt)}
                    </Text>
                  </View>
                  <View style={styles.sourceCheckRow}>
                    <View style={styles.sourceCheckDot} />
                    <Text style={styles.sourceCheckText}>
                      STALE AFTER | {formatCatalogTimestamp(routeCatalogOfflineCache.staleAt)}
                    </Text>
                  </View>
                </>
              ) : null}
              {routeCatalogSourceRows.map((sourceRow) => (
                <View key={`route-catalog-source-${sourceRow}`} style={styles.sourceCheckRow}>
                  <View style={styles.sourceCheckDot} />
                  <Text style={styles.sourceCheckText}>{sourceRow}</Text>
                </View>
              ))}
              {routeCatalogAttributionRows.map((sourceRow) => (
                <View key={`route-catalog-attribution-${sourceRow}`} style={styles.sourceCheckRow}>
                  <View style={styles.sourceCheckDot} />
                  <Text style={styles.sourceCheckText}>{sourceRow}</Text>
                </View>
              ))}
              {routeCatalogCurrentCondition ? (
                <>
                  <View style={styles.sourceCheckRow} testID="offline-prep-route-catalog-current-condition">
                    <View
                      style={[
                        styles.sourceCheckDot,
                        routeCatalogCurrentCondition.status === 'blocked' || routeCatalogCurrentCondition.status === 'watch'
                          ? styles.sourceCheckWarningDot
                          : null,
                      ]}
                    />
                    <Text style={styles.sourceCheckText}>
                      CURRENT CONDITION | {routeCatalogCurrentCondition.label} | Open {routeCatalogCurrentCondition.currentlyOpenStatus.replace(/_/g, ' ')} | Passability {routeCatalogCurrentCondition.passabilityStatus.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  {[...routeCatalogCurrentCondition.blockers, ...routeCatalogCurrentCondition.warnings].slice(0, 3).map((warning) => (
                    <View
                      key={`route-catalog-current-condition-warning-${warning}`}
                      style={styles.sourceCheckRow}
                      testID="offline-prep-route-catalog-current-condition"
                    >
                      <View style={[styles.sourceCheckDot, styles.sourceCheckWarningDot]} />
                      <Text style={styles.sourceCheckText}>CURRENT CONDITION | {warning}</Text>
                    </View>
                  ))}
                </>
              ) : null}
              {routeCatalogFreshnessWarnings.length > 0 ? (
                routeCatalogFreshnessWarnings.map((warning) => (
                  <View
                    key={`route-catalog-freshness-warning-${warning}`}
                    style={styles.sourceCheckRow}
                    testID="offline-prep-route-catalog-freshness-warning"
                  >
                    <View style={[styles.sourceCheckDot, styles.sourceCheckWarningDot]} />
                    <Text style={styles.sourceCheckText}>FRESHNESS WARNING | {warning}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.sourceCheckRow} testID="offline-prep-route-catalog-freshness-warning">
                  <View style={styles.sourceCheckDot} />
                  <Text style={styles.sourceCheckText}>FRESHNESS WARNING | none reported by catalog detail</Text>
                </View>
              )}
            </View>
          </View>
        );
      case 'map_queue':
        return (
          <View style={styles.sectionCard}>
            <MapPrepQueueCard state={mapQueueState} retrying={mapRetrying} onRetry={handleRetry} />
          </View>
        );
      case 'manifest_item':
        return <PrepItemRow item={row.item} />;
      case 'manifest_errors':
        if (!manifest) return null;
        return (
          <View style={styles.errorList} testID="offline-prep-unavailable-state">
            <Text style={styles.resultTitle}>Unavailable Items</Text>
            {manifest.errors.slice(0, 4).map((entry) => (
              <Text key={entry.id} style={styles.errorText}>- {entry.message}</Text>
            ))}
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.84}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry Offline Prep Pack manifest"
              testID="offline-prep-retry"
            >
              <Ionicons name="refresh-outline" size={13} color={TACTICAL.amber} />
              <Text style={styles.retryButtonText}>Retry Manifest</Text>
            </TouchableOpacity>
          </View>
        );
      case 'partial_confirm':
        return (
          <View style={styles.confirmCard} testID="offline-prep-partial-confirm">
            <Ionicons name="information-circle-outline" size={14} color={TACTICAL.amber} />
            <View style={styles.confirmCopy}>
              <Text style={styles.confirmTitle}>Continue with available route essentials?</Text>
              <Text style={styles.confirmText}>
                Some route essentials are ready. Items without a known source stay marked below and will not block the pack.
              </Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.confirmSecondaryButton}
                  activeOpacity={0.82}
                  onPress={() => setPrepareConfirmVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Review Offline Prep items"
                  testID="offline-prep-review-items"
                >
                  <Text style={styles.confirmSecondaryText}>Review</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmPrimaryButton}
                  activeOpacity={0.84}
                  onPress={() => {
                    void prepareOfflinePack();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Continue preparing Offline Prep Pack"
                  testID="offline-prep-continue-partial"
                >
                  <Text style={styles.confirmPrimaryText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      case 'prepare_result':
        if (!manifest) return null;
        return (
          <View style={styles.noticeCard} testID="offline-prep-prepare-result">
            <Ionicons name={manifest.progress.status === 'failed' ? 'alert-circle-outline' : 'information-circle-outline'} size={13} color={statusColor(manifest.progress.status)} />
            <Text style={styles.noticeText}>{actionMessage ?? stateCopy.message}</Text>
          </View>
        );
      case 'error':
        return error ? (
          <View style={styles.errorCard} testID="offline-prep-failed-state">
            <Ionicons name="warning-outline" size={14} color="#EF5350" />
            <View style={styles.errorCopy}>
              <Text style={styles.errorText}>{error}</Text>
              <ECSButton
                label={selectedInput ? 'Retry Status' : 'Retry Loading'}
                icon="refresh-outline"
                variant="secondary"
                size="compact"
                onPress={handleRetry}
                accessibilityHint="Retries the failed Offline Prep operation"
              />
            </View>
          </View>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <TopoBackground>
      <ECSOperationalAnnouncer event={errorAnnouncement} announceInitial />
      <ECSOperationalAnnouncer event={queuedActionAnnouncement} announceInitial />
      <ECSOperationalAnnouncer event={packStateAnnouncement} />
      <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]}>
        <Header title="Explore" />
        <ExplorePlanningTabs activeTab="offline_prep_pack" />
        <View style={styles.scrollArea} testID="offline-prep-pack-screen">
          <FlatList<OfflinePrepContentRow>
            ref={contentListRef}
            data={offlinePrepContentRows}
            keyExtractor={offlinePrepContentRowKey}
            renderItem={renderOfflinePrepContentRow}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={OFFLINE_PREP_INITIAL_RENDER_COUNT}
            maxToRenderPerBatch={OFFLINE_PREP_BATCH_SIZE}
            windowSize={OFFLINE_PREP_WINDOW_SIZE}
            updateCellsBatchingPeriod={OFFLINE_PREP_BATCHING_PERIOD_MS}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            testID="offline-prep-content-list"
          />
        </View>
        {manifest && packPresentation && selectedInput && !showRouteList ? (
          <View style={styles.actionDock} testID="offline-prep-action-dock">
            <View style={styles.actionDockHeader}>
              <View style={styles.actionDockCopy}>
                <Text style={styles.actionDockTitle}>Offline navigation pack</Text>
                <Text style={styles.actionDockStatus} numberOfLines={1}>
                  {offlinePrepPresentationLabel(packPresentation.kind)}
                  {packPresentation.estimatedSizeMB != null ? ` | ${packPresentation.estimatedSizeMB} MB estimated` : ''}
                </Text>
              </View>
              <Ionicons
                name={packPresentation.navigationReady ? 'checkmark-circle-outline' : 'download-outline'}
                size={18}
                color={offlinePrepPresentationColor(packPresentation.kind)}
              />
            </View>
            <View style={styles.actionDockButtons}>
              <View style={styles.actionDockButton} testID="offline-prep-prepare">
                <ECSButton
                  label={prepareSaving || mapRetrying ? 'Working…' : packPresentation.primaryActionLabel}
                  icon={mapQueueState?.retryable ? 'refresh-outline' : 'download-outline'}
                  variant="primary"
                  size="large"
                  grow
                  loading={prepareSaving || mapRetrying}
                  disabled={!packPresentation.primaryActionEnabled}
                  onPress={handlePrimaryPackAction}
                  accessibilityHint={packPresentation.kind === 'degraded' || packPresentation.kind === 'blocked'
                    ? 'Opens the required and degraded Offline Prep details'
                    : 'Downloads or retries the route assets required for offline navigation'}
                />
              </View>
              <View style={styles.actionDockButton} testID="offline-prep-printable-manifest">
                <ECSButton
                  label={manifestExporting ? 'Generating…' : 'Print / Share Emergency Manifest'}
                  icon="share-outline"
                  variant="secondary"
                  size="large"
                  grow
                  loading={manifestExporting}
                  onPress={() => {
                    void handleExportPrintableManifest();
                  }}
                  accessibilityLabel="Print or share family emergency trip manifest"
                  accessibilityHint="Creates a private family-facing packet with the saved itinerary, route-readiness score, planned coordinates, and offline status"
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: OFFLINE_PREP_CONTENT_BOTTOM_CLEARANCE,
    gap: 12,
  },
  heroCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: ECS.bgPanel,
    padding: 14,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '38',
    backgroundColor: TACTICAL.amber + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  eyebrow: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  heroTitle: { color: TACTICAL.text, fontSize: 22, lineHeight: 26, fontWeight: '900', marginTop: 2 },
  heroText: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 12,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionHeaderCopy: { flex: 1, minWidth: 0, gap: 3 },
  sectionTitle: { flex: 1, color: TACTICAL.text, fontSize: 13, fontWeight: '900' },
  sectionMeta: { color: TACTICAL.amber, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  routeNameText: { color: TACTICAL.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  overviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 12,
    gap: 12,
  },
  overviewMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overviewMetric: {
    flexGrow: 1,
    flexBasis: 96,
    minHeight: 58,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  overviewMetricLabel: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
  overviewMetricValue: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'capitalize' },
  overviewGroupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overviewGroup: {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.14)',
    padding: 10,
    gap: 6,
  },
  overviewGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  overviewGroupTitle: { flex: 1, color: TACTICAL.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  overviewGroupStatus: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, textAlign: 'right' },
  overviewGroupSummary: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  overviewGroupMeta: { color: TACTICAL.textMuted, opacity: 0.82, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  attentionBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: TACTICAL.amber + '09',
    padding: 10,
    gap: 8,
  },
  attentionTitle: { color: TACTICAL.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  attentionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  attentionCopy: { flex: 1, minWidth: 0, gap: 2 },
  attentionItemTitle: { color: TACTICAL.text, fontSize: 10, lineHeight: 14, fontWeight: '900' },
  attentionItemText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  detailsToggle: {
    minHeight: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  detailsToggleCopy: { flex: 1, minWidth: 0, gap: 2 },
  detailsToggleTitle: { color: TACTICAL.amber, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  detailsToggleText: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  routeListCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 12,
    gap: 10,
  },
  importRouteCard: {
    minHeight: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '36',
    backgroundColor: TACTICAL.amber + '0D',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    alignSelf: 'stretch',
  },
  importRouteIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '38',
    backgroundColor: TACTICAL.amber + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  importStatusText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  importErrorText: { color: '#EF9A9A' },
  routeOptionList: { gap: 8 },
  routeOption: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  routeOptionCopy: { flex: 1, minWidth: 0, gap: 3 },
  routeOptionTitle: { color: TACTICAL.text, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  routeOptionMeta: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  backToListButton: {
    minHeight: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  backToListText: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 18,
  },
  stateTitle: { color: TACTICAL.text, fontSize: 14, fontWeight: '900' },
  stateText: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  stateTextLeft: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: TACTICAL.amber },
  progressMeta: { color: TACTICAL.textMuted, fontSize: 9, fontWeight: '800' },
  sourceCheckBlock: {
    gap: 7,
    paddingTop: 2,
    paddingBottom: 2,
  },
  sourceCheckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceCheckTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceCheckTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  sourceCheckStatus: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  sourceCheckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  sourceCheckDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
    marginTop: 5,
  },
  sourceCheckWarningDot: {
    backgroundColor: '#E6A23C',
  },
  sourceCheckText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  mapQueueCard: {
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: 'rgba(196,138,44,0.07)',
    padding: 10,
  },
  mapQueueHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mapQueueDot: { width: 7, height: 7, borderRadius: 4 },
  mapQueueLabel: { flex: 1, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  mapQueueSource: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  mapQueueMessage: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  itemList: { gap: 8 },
  itemRow: {
    flexDirection: 'row',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 9,
  },
  itemIcon: { width: 26, height: 26, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { flex: 1, color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  itemStatus: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  itemSummary: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  itemMeta: { color: TACTICAL.textMuted, opacity: 0.78, fontSize: 8, fontWeight: '800' },
  primaryButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: '#081014', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  confirmCard: {
    flexDirection: 'row',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: TACTICAL.amber + '09',
    padding: 10,
  },
  confirmCopy: { flex: 1, gap: 6 },
  confirmTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  confirmText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  confirmPrimaryButton: {
    minHeight: 30,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  confirmPrimaryText: {
    color: '#081014',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  confirmSecondaryButton: {
    minHeight: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  confirmSecondaryText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: {
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0D',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
  },
  secondaryButtonDisabled: { opacity: 0.45 },
  secondaryButtonText: { color: TACTICAL.amber, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  noticeCard: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '26',
    backgroundColor: TACTICAL.amber + '08',
    padding: 10,
  },
  noticeText: { flex: 1, color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  errorList: { gap: 7, borderRadius: 12, borderWidth: 1, borderColor: '#EF535033', backgroundColor: '#EF53500D', padding: 10 },
  resultTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  errorCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF535033',
    backgroundColor: '#EF53500D',
    padding: 10,
  },
  errorCopy: { flex: 1, gap: 8, alignItems: 'flex-start' },
  errorText: { flex: 1, color: '#EF9A9A', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
  },
  retryButtonText: { color: TACTICAL.amber, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  actionDock: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 9,
  },
  actionDockHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionDockCopy: { flex: 1, minWidth: 0, gap: 2 },
  actionDockTitle: { color: TACTICAL.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  actionDockStatus: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  actionDockButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionDockButton: { flex: 1, minWidth: 150 },
});
