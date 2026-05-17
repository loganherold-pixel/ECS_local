import {
  buildECSWeatherSnapshot,
  type ECSWeatherSnapshot,
  type ECSWeatherSourceType,
} from './ecsWeather';
import {
  fetchWeatherWithStatus,
  getAnyCachedWeather,
  getCachedWeatherResult,
  hasUsableWeatherFetchResult,
  type WeatherFetchResult,
} from './weatherStore';
import {
  formatWeatherCoordinateLabel,
  isValidWeatherLocationCoordinate,
  resolveWeatherLocation,
  WEATHER_LOCATION_UNAVAILABLE,
  type ResolvedWeatherLocation,
  type WeatherLocationCandidate,
  type WeatherManualCandidate,
} from './weatherLocationResolver';
import type { WeatherCoordinate } from './weatherTypes';

const SNAPSHOT_CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SNAPSHOT_CACHE_MAX_ENTRIES = 48;

export type ECSWeatherCoordinateSource =
  | 'current_gps'
  | 'active_route'
  | 'selected_coordinate'
  | 'last_known'
  | 'unavailable';

export interface ECSWeatherTargetInput {
  currentGps?: WeatherCoordinate | null;
  currentGpsPermissionDenied?: boolean;
  activeRoute?: WeatherCoordinate | null;
  selectedCoordinate?: WeatherCoordinate | null;
  lastKnown?: WeatherCoordinate | null;
  lastKnownFetchedAt?: string | number | null;
  lastKnownCachedAt?: number | null;
  manualFallback?: (WeatherCoordinate & { explicitlySelected?: boolean }) | null;
  fallbackLabel?: string | null;
  previousLocation?: ResolvedWeatherLocation | null;
}

export interface ResolvedECSWeatherTarget {
  coordinate: WeatherCoordinate | null;
  source: ECSWeatherCoordinateSource;
  sourceType: ECSWeatherSourceType;
  label: string;
  unavailableReason: string | null;
  location: ResolvedWeatherLocation;
}

export interface SharedWeatherFetchResult {
  result: WeatherFetchResult;
  snapshots: ECSWeatherSnapshot[];
  target: ResolvedECSWeatherTarget;
}

const DEFAULT_WEATHER_LABEL = 'Current Position';
let lastResolvedWeatherLocation: ResolvedWeatherLocation | null = null;
const lastValidSnapshotCache = new Map<string, { snapshot: ECSWeatherSnapshot; cachedAt: number }>();

function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidWeatherCoordinate(value: WeatherCoordinate | null | undefined): value is WeatherCoordinate {
  return !!value && isValidLatitude(value.lat) && isValidLongitude(value.lng);
}

function toWeatherCandidate(
  coordinate: WeatherCoordinate | null | undefined,
  labelSource: WeatherLocationCandidate['labelSource'],
): WeatherLocationCandidate | null {
  if (!isValidWeatherLocationCoordinate(coordinate)) return null;
  return {
    coordinate,
    label: coordinate.label ?? null,
    labelSource,
  };
}

function toManualCandidate(
  coordinate: ECSWeatherTargetInput['manualFallback'],
): WeatherManualCandidate | null {
  if (!isValidWeatherLocationCoordinate(coordinate)) return null;
  return {
    coordinate,
    label: coordinate.label ?? null,
    labelSource: 'manual',
    explicitlySelected: coordinate.explicitlySelected === true,
  };
}

function weatherLocationSourceToTargetSource(source: ResolvedWeatherLocation['source']): ECSWeatherCoordinateSource {
  switch (source) {
    case 'current_gps':
      return 'current_gps';
    case 'active_route':
      return 'active_route';
    case 'last_known':
      return 'last_known';
    case 'selected_coordinate':
    case 'manual':
      return 'selected_coordinate';
    default:
      return 'unavailable';
  }
}

export function normalizeWeatherCoordinates(
  coordinates: Array<WeatherCoordinate | null | undefined>,
): WeatherCoordinate[] {
  return coordinates
    .filter(isValidWeatherCoordinate)
    .map((coordinate) => ({
      lat: Number(coordinate.lat),
      lng: Number(coordinate.lng),
      label: coordinate.label?.trim() || formatWeatherCoordinateLabel(coordinate),
      accuracyM: coordinate.accuracyM ?? null,
      timestamp: coordinate.timestamp ?? null,
    }));
}

function snapshotCacheKey(coordinate: WeatherCoordinate, units: 'imperial' | 'metric'): string {
  return `${coordinate.lat.toFixed(3)}_${coordinate.lng.toFixed(3)}_${units}`;
}

function hasUsableWeatherSnapshot(snapshot: ECSWeatherSnapshot): boolean {
  return Boolean(
    snapshot.current.temp != null ||
    snapshot.current.windSpeed != null ||
    snapshot.current.humidity != null ||
    snapshot.current.condition ||
    snapshot.daily.length > 0 ||
    snapshot.hourly.length > 0 ||
    snapshot.alerts.length > 0,
  );
}

function rememberValidSnapshots(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
  snapshots: ECSWeatherSnapshot[],
): void {
  coordinates.forEach((coordinate, index) => {
    const snapshot = snapshots[index];
    if (!snapshot || !hasUsableWeatherSnapshot(snapshot)) return;
    lastValidSnapshotCache.set(snapshotCacheKey(coordinate, units), {
      snapshot,
      cachedAt: Date.now(),
    });
  });

  while (lastValidSnapshotCache.size > SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldestKey = lastValidSnapshotCache.keys().next().value;
    if (!oldestKey) break;
    lastValidSnapshotCache.delete(oldestKey);
  }
}

function getRecentValidSnapshots(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
): ECSWeatherSnapshot[] | null {
  const now = Date.now();
  const snapshots = coordinates.map((coordinate) => {
    const entry = lastValidSnapshotCache.get(snapshotCacheKey(coordinate, units));
    if (!entry || now - entry.cachedAt > SNAPSHOT_CACHE_MAX_AGE_MS) return null;
    return entry.snapshot;
  });
  return snapshots.every(Boolean) ? snapshots as ECSWeatherSnapshot[] : null;
}

export function resolveECSWeatherTarget(input: ECSWeatherTargetInput): ResolvedECSWeatherTarget {
  const location = resolveWeatherLocation({
    currentGps: input.currentGps || input.currentGpsPermissionDenied === true
      ? {
          coordinate: input.currentGps ?? null,
          label: input.currentGps?.label ?? null,
          labelSource: 'coordinate',
          hasFix: true,
          permissionDenied: input.currentGpsPermissionDenied === true,
          accuracyM: input.currentGps?.accuracyM ?? null,
        }
      : null,
    activeRoute: toWeatherCandidate(input.activeRoute, 'route'),
    selectedCoordinate: toWeatherCandidate(input.selectedCoordinate, 'selected_place'),
    lastKnown: input.lastKnown
      ? {
          coordinate: input.lastKnown,
          label: input.lastKnown.label ?? null,
          labelSource: 'provider',
          fetchedAt: input.lastKnownFetchedAt ?? input.lastKnown.timestamp ?? null,
          cachedAt: input.lastKnownCachedAt ?? null,
        }
      : null,
    manualFallback: toManualCandidate(input.manualFallback),
    previousLocation: input.previousLocation ?? lastResolvedWeatherLocation,
  });

  if (location.coordinate) {
    lastResolvedWeatherLocation = location;
    return {
      coordinate: {
        lat: location.coordinate.lat,
        lng: location.coordinate.lng,
        label: location.displayLabel,
        accuracyM: location.accuracyM,
      },
      source: weatherLocationSourceToTargetSource(location.source),
      sourceType: location.sourceType,
      label: location.displayLabel,
      unavailableReason: null,
      location,
    };
  }

  return {
    coordinate: null,
    source: 'unavailable',
    sourceType: 'current_location',
    label: input.fallbackLabel || WEATHER_LOCATION_UNAVAILABLE,
    unavailableReason: location.unavailableReason ?? 'No valid weather coordinate is available.',
    location,
  };
}

export function createUnavailableWeatherFetchResult(
  units: 'imperial' | 'metric' = 'imperial',
  reason = 'No valid weather coordinate is available.',
): WeatherFetchResult {
  return {
    data: {
      results: [],
      fetched_at: new Date().toISOString(),
      units,
    },
    source: 'fallback',
    cachedAt: null,
    error: reason,
  };
}

export function buildSharedWeatherSnapshots(params: {
  result: WeatherFetchResult;
  coordinates: WeatherCoordinate[];
  sourceType: ECSWeatherSourceType;
  loading?: boolean;
  unavailableReason?: string | null;
  locationResolutions?: Array<ResolvedWeatherLocation | null>;
}): ECSWeatherSnapshot[] {
  const {
    result,
    coordinates,
    sourceType,
    loading = false,
    unavailableReason = null,
    locationResolutions = [],
  } = params;

  if (coordinates.length === 0) {
    return [
      buildECSWeatherSnapshot({
        result: unavailableReason
          ? {
              ...result,
              error: result.error ?? unavailableReason,
            }
          : result,
        loading,
        sourceType,
        locationFallback: 'Weather unavailable',
        locationResolution: locationResolutions[0] ?? null,
      }),
    ];
  }

  return coordinates.map((coordinate, index) => {
    const locationResolution = locationResolutions[index] ?? null;
    return buildECSWeatherSnapshot({
      result,
      waypoint: result.data.results[index] ?? null,
      loading,
      sourceType,
      locationFallback: coordinate.label ?? null,
      locationResolution,
    });
  });
}

function buildLocationResolutionForCoordinate(
  coordinate: WeatherCoordinate,
  sourceType: ECSWeatherSourceType,
): ResolvedWeatherLocation {
  const source =
    sourceType === 'current_location'
      ? 'current_gps'
      : sourceType === 'route_origin' || sourceType === 'route_segment'
        ? 'active_route'
        : sourceType === 'last_known' || sourceType === 'cached'
          ? 'last_known'
          : 'selected_coordinate';

  return resolveWeatherLocation({
    currentGps: source === 'current_gps'
      ? {
          coordinate,
          label: coordinate.label ?? null,
          labelSource: 'coordinate',
          hasFix: true,
          accuracyM: coordinate.accuracyM ?? null,
        }
      : null,
    activeRoute: source === 'active_route'
      ? { coordinate, label: coordinate.label ?? null, labelSource: 'route' }
      : null,
    selectedCoordinate: source === 'selected_coordinate'
      ? { coordinate, label: coordinate.label ?? null, labelSource: 'selected_place' }
      : null,
    lastKnown: source === 'last_known'
      ? {
          coordinate,
          label: coordinate.label ?? null,
          labelSource: 'provider',
          cachedAt: coordinate.timestamp ?? Date.now(),
        }
      : null,
    previousLocation: lastResolvedWeatherLocation,
  });
}

export async function fetchSharedWeatherForCoordinates(
  coordinates: Array<WeatherCoordinate | null | undefined>,
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
  sourceType: ECSWeatherSourceType = 'selected_coordinate',
): Promise<SharedWeatherFetchResult> {
  const normalizedCoordinates = normalizeWeatherCoordinates(coordinates);
  if (normalizedCoordinates.length === 0) {
    const result = createUnavailableWeatherFetchResult(units);
    const location = resolveWeatherLocation({});
    return {
      result,
      snapshots: buildSharedWeatherSnapshots({
        result,
        coordinates: [],
        sourceType,
        unavailableReason: result.error,
        locationResolutions: [location],
      }),
      target: {
        coordinate: null,
        source: 'unavailable',
        sourceType,
        label: 'Weather unavailable',
        unavailableReason: result.error,
        location,
      },
    };
  }

  const locationResolutions = normalizedCoordinates.map((coordinate) =>
    buildLocationResolutionForCoordinate(coordinate, sourceType),
  );
  const requestCoordinates = normalizedCoordinates.map((coordinate, index) => ({
    ...coordinate,
    label: locationResolutions[index]?.displayLabel ?? coordinate.label ?? formatWeatherCoordinateLabel(coordinate),
  }));
  const result = await fetchWeatherWithStatus(requestCoordinates, units, forceRefresh);
  const snapshots = buildSharedWeatherSnapshots({
    result,
    coordinates: requestCoordinates,
    sourceType,
    locationResolutions,
  });
  if (hasUsableWeatherFetchResult(result)) {
    rememberValidSnapshots(requestCoordinates, units, snapshots);
  }
  const fallbackSnapshots = hasUsableWeatherFetchResult(result)
    ? null
    : getRecentValidSnapshots(requestCoordinates, units);

  return {
    result,
    snapshots: fallbackSnapshots ?? snapshots,
    target: {
      coordinate: requestCoordinates[0],
      source:
        sourceType === 'current_location'
          ? 'current_gps'
          : sourceType === 'route_origin' || sourceType === 'route_segment'
            ? 'active_route'
            : sourceType === 'last_known'
              ? 'last_known'
              : 'selected_coordinate',
      sourceType,
      label: locationResolutions[0]?.displayLabel || requestCoordinates[0].label || DEFAULT_WEATHER_LABEL,
      unavailableReason: null,
      location: locationResolutions[0],
    },
  };
}

export async function fetchSharedWeatherForTarget(
  input: ECSWeatherTargetInput,
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
): Promise<SharedWeatherFetchResult> {
  const target = resolveECSWeatherTarget(input);
  if (!target.coordinate) {
    const result = createUnavailableWeatherFetchResult(units, target.unavailableReason ?? undefined);
    return {
      result,
      snapshots: buildSharedWeatherSnapshots({
        result,
        coordinates: [],
        sourceType: target.sourceType,
        unavailableReason: target.unavailableReason,
        locationResolutions: [target.location],
      }),
      target,
    };
  }

  const fetched = await fetchSharedWeatherForCoordinates(
    [target.coordinate],
    units,
    forceRefresh || target.location.forceRefreshWeather,
    target.sourceType,
  );
  return {
    ...fetched,
    target,
  };
}

export function getCachedSharedWeatherResult(
  coordinates: Array<WeatherCoordinate | null | undefined>,
  units: 'imperial' | 'metric' = 'imperial',
  options?: { allowStale?: boolean },
): WeatherFetchResult | null {
  const normalizedCoordinates = normalizeWeatherCoordinates(coordinates);
  if (normalizedCoordinates.length === 0) return null;
  return getCachedWeatherResult(normalizedCoordinates, units, options);
}

export function getAnyCachedSharedWeather(
  coordinates: Array<WeatherCoordinate | null | undefined>,
  units: 'imperial' | 'metric' = 'imperial',
): ReturnType<typeof getAnyCachedWeather> {
  const normalizedCoordinates = normalizeWeatherCoordinates(coordinates);
  if (normalizedCoordinates.length === 0) return null;
  return getAnyCachedWeather(normalizedCoordinates, units);
}
