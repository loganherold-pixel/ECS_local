import {
  buildWeatherBucket,
  getWeatherBrokerTtlMs,
  type BrokeredWeatherFetchResult,
} from './weatherBroker';
import type { SharedWeatherFetchResult } from './weatherService';
import type { WeatherAlert, WeatherCoordinate, WaypointWeather } from './weatherTypes';

export type RouteWeatherSampleReason =
  | 'current_location'
  | 'route_start'
  | 'route_midpoint'
  | 'route_end'
  | 'risk_high_elevation'
  | 'named_waypoint';

export type RouteWeatherRefreshReason =
  | 'navigation_start'
  | 'gps_update'
  | 'interval'
  | 'manual_refresh'
  | 'route_recalculation'
  | 'route_detail_open'
  | 'explore_list_load'
  | 'offline_packet';

export type RouteWeatherRefreshDeniedReason =
  | 'same_bucket_ttl_fresh'
  | 'reroute_reuses_cached_route_snapshot'
  | 'explore_list_defers_live_weather'
  | 'offline_cached_route_snapshot'
  | 'offline_no_cached_snapshot'
  | 'provider_cooldown';

export interface RouteWeatherRoutePoint {
  lat: number;
  lng: number;
  ele?: number | null;
  ele_m?: number | null;
  elevationM?: number | null;
  elevation_m?: number | null;
}

export interface RouteWeatherWaypoint {
  lat: number;
  lng?: number;
  lon?: number;
  name?: string | null;
  title?: string | null;
  ele?: number | null;
}

export interface RouteWeatherSample {
  id: string;
  label: string;
  coordinate: WeatherCoordinate;
  normalizedCoordinate: WeatherCoordinate;
  bucketKey: string;
  distanceMiles: number;
  reason: RouteWeatherSampleReason;
}

export interface RouteWeatherSampleDiagnostics {
  routeWeatherSampleCount: number;
  routePointCount: number;
  sampleBucketCount: number;
  bucketDedupeCount: number;
  providerCallsAvoided: number;
  maxBucketCount: number;
  routeDistanceMiles: number;
  samplePolicy: 'short_route' | 'expedition';
}

export interface RouteWeatherSampleSelection {
  routeId: string;
  samples: RouteWeatherSample[];
  sampleBuckets: string[];
  diagnostics: RouteWeatherSampleDiagnostics;
}

export interface EcsRouteWeatherSnapshot {
  routeId: string;
  navigationSessionId?: string | null;
  sampleBuckets: string[];
  provider: string;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  currentSummary: {
    label: string | null;
    temp: number | null;
    condition: string | null;
    windSpeed: number | null;
    sampleCount: number;
  } | null;
  riskFlags: string[];
  alerts: WeatherAlert[];
  sourceCallCount: number;
  weatherSnapshotAge: number;
  lastProviderRefreshAt: string | null;
  diagnostics: RouteWeatherSampleDiagnostics & {
    cachedRouteSnapshotUsage: boolean;
    weatherRefreshReason: RouteWeatherRefreshReason | string;
    weatherRefreshDeniedReason: RouteWeatherRefreshDeniedReason | string | null;
  };
}

export interface RouteWeatherRefreshDecision {
  shouldRefresh: boolean;
  refreshReason: RouteWeatherRefreshReason | string | null;
  deniedReason: RouteWeatherRefreshDeniedReason | string | null;
  useCachedSnapshot: boolean;
}

interface SampleCandidate {
  id: string;
  label: string;
  coordinate: WeatherCoordinate;
  distanceMiles: number;
  reason: RouteWeatherSampleReason;
  priority: number;
}

interface SelectRouteWeatherSampleInput {
  routeId: string;
  routePoints: RouteWeatherRoutePoint[];
  userLocation?: WeatherCoordinate | null;
  waypoints?: RouteWeatherWaypoint[];
  routeDistanceMiles?: number | null;
  tripType?: string | null;
  maxBuckets?: number;
  bucketSizeDegrees?: number;
  includeHighElevationRiskPoint?: boolean;
}

interface BuildRouteWeatherSnapshotInput {
  routeId: string;
  navigationSessionId?: string | null;
  sampleSelection: RouteWeatherSampleSelection;
  weather: SharedWeatherFetchResult | { result: BrokeredWeatherFetchResult; snapshots?: unknown[]; target?: unknown };
  refreshReason: RouteWeatherRefreshReason | string;
  refreshDeniedReason?: RouteWeatherRefreshDeniedReason | string | null;
  nowMs?: number;
}

interface DecideRouteWeatherRefreshInput {
  reason: RouteWeatherRefreshReason;
  previousSnapshot?: EcsRouteWeatherSnapshot | null;
  sampleBuckets: string[];
  currentBucketKey?: string | null;
  offline?: boolean;
  providerCooldownUntilMs?: number | null;
  nowMs?: number;
}

const DEFAULT_ROUTE_WEATHER_MAX_BUCKETS = 6;
const HARD_ROUTE_WEATHER_MAX_BUCKETS = 8;
const SHORT_ROUTE_MAX_BUCKETS = 3;
const SHORT_ROUTE_DISTANCE_MILES = 30;
const METERS_PER_MILE = 1609.344;
const DEFAULT_BUCKET_SIZE_DEGREES = 0.05;

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radiusM = 6371000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

function cumulativeDistances(points: RouteWeatherRoutePoint[]): number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distances.push(distances[index - 1] + haversineMeters(previous, current));
  }
  return distances;
}

function interpolateRoutePoint(
  points: RouteWeatherRoutePoint[],
  distances: number[],
  targetDistanceM: number,
): { lat: number; lng: number; distanceMiles: number } {
  if (points.length === 0) return { lat: 0, lng: 0, distanceMiles: 0 };
  if (points.length === 1 || targetDistanceM <= 0) {
    return { lat: points[0].lat, lng: points[0].lng, distanceMiles: 0 };
  }

  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index] >= targetDistanceM) {
      const previousDistance = distances[index - 1];
      const nextDistance = distances[index];
      const ratio = nextDistance > previousDistance
        ? (targetDistanceM - previousDistance) / (nextDistance - previousDistance)
        : 0;
      const previous = points[index - 1];
      const next = points[index];
      return {
        lat: previous.lat + ratio * (next.lat - previous.lat),
        lng: previous.lng + ratio * (next.lng - previous.lng),
        distanceMiles: metersToMiles(targetDistanceM),
      };
    }
  }

  const end = points[points.length - 1];
  return {
    lat: end.lat,
    lng: end.lng,
    distanceMiles: metersToMiles(distances[distances.length - 1] ?? 0),
  };
}

function nearestRouteDistanceMiles(
  coordinate: WeatherCoordinate,
  points: RouteWeatherRoutePoint[],
  distances: number[],
): number {
  let nearestIndex = 0;
  let nearestMeters = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const meters = haversineMeters(coordinate, point);
    if (meters < nearestMeters) {
      nearestMeters = meters;
      nearestIndex = index;
    }
  });
  return metersToMiles(distances[nearestIndex] ?? 0);
}

function readElevationMeters(point: RouteWeatherRoutePoint | RouteWeatherWaypoint): number | null {
  const record = point as unknown as Record<string, unknown>;
  return finiteNumber(
    record.elevationM ??
    record.elevation_m ??
    record.ele_m ??
    record.ele,
  );
}

function makeCandidate(
  id: string,
  label: string,
  coordinate: WeatherCoordinate,
  distanceMiles: number,
  reason: RouteWeatherSampleReason,
  priority: number,
): SampleCandidate {
  return {
    id,
    label,
    coordinate: {
      lat: coordinate.lat,
      lng: coordinate.lng,
      label,
      accuracyM: coordinate.accuracyM,
      timestamp: coordinate.timestamp,
    },
    distanceMiles: Math.max(0, distanceMiles),
    reason,
    priority,
  };
}

function normalizeMaxBuckets(input: SelectRouteWeatherSampleInput, routeDistanceMiles: number): {
  maxBuckets: number;
  samplePolicy: 'short_route' | 'expedition';
} {
  const requestedMax = Math.max(1, Math.floor(input.maxBuckets ?? DEFAULT_ROUTE_WEATHER_MAX_BUCKETS));
  const hardCapped = Math.min(requestedMax, HARD_ROUTE_WEATHER_MAX_BUCKETS);
  const tripType = String(input.tripType ?? '').toLowerCase();
  const shortRoute = tripType.includes('day') || routeDistanceMiles <= SHORT_ROUTE_DISTANCE_MILES;
  return {
    maxBuckets: shortRoute ? Math.min(hardCapped, SHORT_ROUTE_MAX_BUCKETS) : hardCapped,
    samplePolicy: shortRoute ? 'short_route' : 'expedition',
  };
}

function sameBucketSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((bucket) => set.has(bucket));
}

function hasNewBucket(previous: string[], next: string[]): boolean {
  const set = new Set(previous);
  return next.some((bucket) => !set.has(bucket));
}

function isoFromMs(value: number): string {
  return new Date(value).toISOString();
}

function parseIsoMs(value: string | null | undefined, fallback: number): number {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function weatherResults(weather: BuildRouteWeatherSnapshotInput['weather']): WaypointWeather[] {
  const results = (weather as SharedWeatherFetchResult).result?.data?.results;
  return Array.isArray(results) ? results : [];
}

function riskFlagsForResults(results: WaypointWeather[]): string[] {
  const flags = new Set<string>();
  for (const waypoint of results) {
    if ((waypoint.alerts?.length ?? 0) > 0) flags.add('weather_alert');
    const current = waypoint.current;
    if (!current) continue;
    if ((current.wind_gust ?? 0) >= 30) flags.add('wind_gust');
    if ((current.wind_speed ?? 0) >= 25) flags.add('high_wind');
    if ((current.rain_1h ?? 0) > 0 || (current.rain_3h ?? 0) > 0) flags.add('rain');
    if ((current.snow_1h ?? 0) > 0 || (current.snow_3h ?? 0) > 0) flags.add('snow');
    if ((current.visibility ?? 10000) < 5000) flags.add('low_visibility');
    if ((current.weather_id ?? 0) >= 200 && (current.weather_id ?? 0) < 300) flags.add('thunderstorm');
  }
  return Array.from(flags);
}

function currentSummaryForResults(results: WaypointWeather[]): EcsRouteWeatherSnapshot['currentSummary'] {
  const first = results.find((waypoint) => waypoint.current)?.current;
  if (!first) return null;
  return {
    label: first.location_name ?? null,
    temp: first.temp ?? null,
    condition: first.weather_main ?? first.weather_description ?? null,
    windSpeed: first.wind_speed ?? null,
    sampleCount: results.length,
  };
}

export function selectRouteWeatherSamplePoints(input: SelectRouteWeatherSampleInput): RouteWeatherSampleSelection {
  const routePoints = input.routePoints.filter((point) =>
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180,
  );
  if (routePoints.length === 0) {
    return {
      routeId: input.routeId,
      samples: [],
      sampleBuckets: [],
      diagnostics: {
        routeWeatherSampleCount: 0,
        routePointCount: 0,
        sampleBucketCount: 0,
        bucketDedupeCount: 0,
        providerCallsAvoided: 0,
        maxBucketCount: 0,
        routeDistanceMiles: 0,
        samplePolicy: 'short_route',
      },
    };
  }

  const distances = cumulativeDistances(routePoints);
  const geometryDistanceMiles = metersToMiles(distances[distances.length - 1] ?? 0);
  const routeDistanceMiles = finiteNumber(input.routeDistanceMiles) ?? geometryDistanceMiles;
  const { maxBuckets, samplePolicy } = normalizeMaxBuckets(input, routeDistanceMiles);
  const totalDistanceM = distances[distances.length - 1] ?? 0;
  const start = routePoints[0];
  const end = routePoints[routePoints.length - 1];
  const midpoint = interpolateRoutePoint(routePoints, distances, totalDistanceM / 2);

  const candidates: SampleCandidate[] = [];
  if (input.userLocation) {
    candidates.push(makeCandidate(
      'current-location',
      input.userLocation.label ?? 'Current position',
      input.userLocation,
      nearestRouteDistanceMiles(input.userLocation, routePoints, distances),
      'current_location',
      0,
    ));
  }

  candidates.push(makeCandidate('route-start', 'Route start', start, 0, 'route_start', 1));
  if (routePoints.length > 2) {
    candidates.push(makeCandidate('route-midpoint', 'Route midpoint', midpoint, midpoint.distanceMiles, 'route_midpoint', 2));
  }
  candidates.push(makeCandidate('route-end', 'Route finish', end, routeDistanceMiles, 'route_end', 3));

  if (input.includeHighElevationRiskPoint) {
    let highIndex = -1;
    let highElevation = Number.NEGATIVE_INFINITY;
    routePoints.forEach((point, index) => {
      const elevation = readElevationMeters(point);
      if (elevation != null && elevation > highElevation) {
        highElevation = elevation;
        highIndex = index;
      }
    });
    if (highIndex >= 0) {
      const point = routePoints[highIndex];
      candidates.push(makeCandidate(
        'risk-high-elevation',
        'High-elevation segment',
        point,
        metersToMiles(distances[highIndex] ?? 0),
        'risk_high_elevation',
        4,
      ));
    }
  }

  for (const [index, waypoint] of (input.waypoints ?? []).entries()) {
    const lat = finiteNumber(waypoint.lat);
    const lng = finiteNumber(waypoint.lng ?? waypoint.lon);
    if (lat == null || lng == null) continue;
    const coordinate = {
      lat,
      lng,
      label: waypoint.name ?? waypoint.title ?? `Waypoint ${index + 1}`,
    };
    candidates.push(makeCandidate(
      `named-waypoint-${index + 1}`,
      coordinate.label,
      coordinate,
      nearestRouteDistanceMiles(coordinate, routePoints, distances),
      'named_waypoint',
      5 + index,
    ));
  }

  const selectedByBucket = new Map<string, RouteWeatherSample>();
  const bucketSizeDegrees = input.bucketSizeDegrees ?? DEFAULT_BUCKET_SIZE_DEGREES;
  const sortedCandidates = candidates
    .slice()
    .sort((a, b) => a.priority - b.priority || a.distanceMiles - b.distanceMiles);

  for (const candidate of sortedCandidates) {
    const bucket = buildWeatherBucket(candidate.coordinate, bucketSizeDegrees);
    if (selectedByBucket.has(bucket.key)) continue;
    selectedByBucket.set(bucket.key, {
      id: candidate.id,
      label: candidate.label,
      coordinate: candidate.coordinate,
      normalizedCoordinate: bucket.normalizedCoordinate,
      bucketKey: bucket.key,
      distanceMiles: candidate.distanceMiles,
      reason: candidate.reason,
    });
    if (selectedByBucket.size >= maxBuckets) break;
  }

  const samples = Array.from(selectedByBucket.values())
    .sort((a, b) => a.distanceMiles - b.distanceMiles || a.id.localeCompare(b.id));
  const sampleBuckets = samples.map((sample) => sample.bucketKey);
  const bucketDedupeCount = Math.max(0, candidates.length - selectedByBucket.size);
  const providerCallsAvoided = Math.max(0, routePoints.length - samples.length) + bucketDedupeCount;

  return {
    routeId: input.routeId,
    samples,
    sampleBuckets,
    diagnostics: {
      routeWeatherSampleCount: samples.length,
      routePointCount: routePoints.length,
      sampleBucketCount: sampleBuckets.length,
      bucketDedupeCount,
      providerCallsAvoided,
      maxBucketCount: maxBuckets,
      routeDistanceMiles,
      samplePolicy,
    },
  };
}

export function routeWeatherCoordinateSignature(selection: RouteWeatherSampleSelection): string {
  return selection.sampleBuckets.join('|');
}

export function routeWeatherSamplesToCoordinates(selection: RouteWeatherSampleSelection): WeatherCoordinate[] {
  return selection.samples.map((sample) => ({
    lat: sample.coordinate.lat,
    lng: sample.coordinate.lng,
    label: sample.label,
  }));
}

export function decideRouteWeatherRefresh(input: DecideRouteWeatherRefreshInput): RouteWeatherRefreshDecision {
  const nowMs = input.nowMs ?? Date.now();
  const previous = input.previousSnapshot ?? null;
  const previousBuckets = previous?.sampleBuckets ?? [];
  const sameBuckets = previous ? sameBucketSet(previousBuckets, input.sampleBuckets) : false;
  const newBucket = previous ? hasNewBucket(previousBuckets, input.sampleBuckets) : input.sampleBuckets.length > 0;
  const expiresAtMs = previous ? parseIsoMs(previous.expiresAt, 0) : 0;
  const fresh = Boolean(previous && !previous.stale && expiresAtMs > nowMs);

  if (input.reason === 'explore_list_load') {
    return {
      shouldRefresh: false,
      refreshReason: null,
      deniedReason: 'explore_list_defers_live_weather',
      useCachedSnapshot: Boolean(previous),
    };
  }

  if (input.offline) {
    return {
      shouldRefresh: false,
      refreshReason: null,
      deniedReason: previous ? 'offline_cached_route_snapshot' : 'offline_no_cached_snapshot',
      useCachedSnapshot: Boolean(previous),
    };
  }

  if ((input.providerCooldownUntilMs ?? 0) > nowMs) {
    return {
      shouldRefresh: false,
      refreshReason: null,
      deniedReason: 'provider_cooldown',
      useCachedSnapshot: Boolean(previous),
    };
  }

  if (input.reason === 'manual_refresh') {
    return {
      shouldRefresh: true,
      refreshReason: 'manual_refresh',
      deniedReason: null,
      useCachedSnapshot: false,
    };
  }

  if (!previous) {
    return {
      shouldRefresh: true,
      refreshReason: input.reason,
      deniedReason: null,
      useCachedSnapshot: false,
    };
  }

  if (input.reason === 'route_recalculation') {
    if (fresh && sameBuckets) {
      return {
        shouldRefresh: false,
        refreshReason: null,
        deniedReason: 'reroute_reuses_cached_route_snapshot',
        useCachedSnapshot: true,
      };
    }
    if (newBucket && !fresh) {
      return {
        shouldRefresh: true,
        refreshReason: 'significant_reroute_new_bucket_ttl_expired',
        deniedReason: null,
        useCachedSnapshot: false,
      };
    }
    return {
      shouldRefresh: false,
      refreshReason: null,
      deniedReason: 'same_bucket_ttl_fresh',
      useCachedSnapshot: true,
    };
  }

  if (fresh && input.reason === 'gps_update') {
    return {
      shouldRefresh: false,
      refreshReason: null,
      deniedReason: 'same_bucket_ttl_fresh',
      useCachedSnapshot: true,
    };
  }

  if (fresh) {
    const currentBucketCovered = input.currentBucketKey ? previousBuckets.includes(input.currentBucketKey) : sameBuckets;
    if (sameBuckets || currentBucketCovered) {
      return {
        shouldRefresh: false,
        refreshReason: null,
        deniedReason: 'same_bucket_ttl_fresh',
        useCachedSnapshot: true,
      };
    }
  }

  return {
    shouldRefresh: true,
    refreshReason: fresh ? input.reason : 'ttl_expired',
    deniedReason: null,
    useCachedSnapshot: false,
  };
}

export function buildRouteWeatherSnapshot(input: BuildRouteWeatherSnapshotInput): EcsRouteWeatherSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const result = (input.weather as SharedWeatherFetchResult).result as BrokeredWeatherFetchResult;
  const broker = result.broker;
  const fetchedAt = result.data?.fetched_at ?? broker?.requestedAt ?? isoFromMs(nowMs);
  const fetchedAtMs = parseIsoMs(fetchedAt, nowMs);
  const ttlMs = getWeatherBrokerTtlMs('active_navigation');
  const expiresAt = broker?.expiresAt ?? isoFromMs(fetchedAtMs + ttlMs);
  const expiresAtMs = parseIsoMs(expiresAt, fetchedAtMs + ttlMs);
  const results = weatherResults(input.weather);
  const cost = broker?.providerCostMetadata;
  const sourceCallCount = Math.max(0, cost?.providerCallsAttempted ?? 0);
  const providerCallsAvoided = input.sampleSelection.diagnostics.providerCallsAvoided + Math.max(0, cost?.providerCallsAvoided ?? 0);
  const stale = result.source === 'cache_stale' || broker?.stale === true || expiresAtMs <= nowMs;
  const alerts = results.flatMap((waypoint) => waypoint.alerts ?? []);

  return {
    routeId: input.routeId,
    navigationSessionId: input.navigationSessionId ?? null,
    sampleBuckets: input.sampleSelection.sampleBuckets.slice(),
    provider: String(result.data?.provider ?? broker?.provider ?? 'openweather'),
    fetchedAt,
    expiresAt,
    stale,
    currentSummary: currentSummaryForResults(results),
    riskFlags: riskFlagsForResults(results),
    alerts,
    sourceCallCount,
    weatherSnapshotAge: Math.max(0, nowMs - fetchedAtMs),
    lastProviderRefreshAt: fetchedAt,
    diagnostics: {
      ...input.sampleSelection.diagnostics,
      providerCallsAvoided,
      cachedRouteSnapshotUsage: result.source === 'cache_fresh' || result.source === 'cache_stale' || broker?.cacheHit === true,
      weatherRefreshReason: input.refreshReason,
      weatherRefreshDeniedReason: input.refreshDeniedReason ?? null,
    },
  };
}
