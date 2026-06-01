import type { ECSWeatherSourceType } from './ecsWeather';
import type { WeatherCoordinate } from './weatherTypes';

export const WEATHER_LOCATION_UNAVAILABLE = 'WEATHER_LOCATION_UNAVAILABLE';
export const WEATHER_LOCATION_STALE_DISTANCE_MILES = 1;
export const WEATHER_LOCATION_FORCE_REFRESH_DISTANCE_MILES = 5;
export const WEATHER_LOCATION_STALE_DISTANCE_METERS = 1609.344;
export const WEATHER_LOCATION_FORCE_REFRESH_DISTANCE_METERS = 8046.72;
export const DEFAULT_MAX_ACCEPTABLE_GPS_ACCURACY_M = 250;
export const DEFAULT_LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type WeatherLocationSource =
  | 'current_gps'
  | 'active_route'
  | 'selected_coordinate'
  | 'last_known'
  | 'manual'
  | 'unavailable';

export type WeatherLocationLabelConfidence = 'high' | 'medium' | 'low' | 'unavailable';

export interface WeatherLocationCandidate {
  coordinate?: WeatherCoordinate | null;
  label?: string | null;
  labelSource?: 'reverse_geocode' | 'selected_place' | 'route' | 'provider' | 'manual' | 'coordinate' | 'unknown';
}

export interface WeatherGpsCandidate extends WeatherLocationCandidate {
  hasFix?: boolean;
  permissionDenied?: boolean;
  accuracyM?: number | null;
}

export interface WeatherLastKnownCandidate extends WeatherLocationCandidate {
  fetchedAt?: string | number | null;
  cachedAt?: number | null;
}

export interface WeatherManualCandidate extends WeatherLocationCandidate {
  explicitlySelected?: boolean;
}

export interface WeatherLocationResolverInput {
  currentGps?: WeatherGpsCandidate | null;
  currentGpsPermissionDenied?: boolean;
  activeRoute?: WeatherLocationCandidate | null;
  selectedCoordinate?: WeatherLocationCandidate | null;
  lastKnown?: WeatherLastKnownCandidate | null;
  manualFallback?: WeatherManualCandidate | null;
  previousLocation?: ResolvedWeatherLocation | null;
  now?: number;
  maxAcceptableGpsAccuracyM?: number;
  lastKnownMaxAgeMs?: number;
}

export interface ResolvedWeatherLocation {
  status: 'resolved' | 'unavailable';
  coordinate: WeatherCoordinate | null;
  source: WeatherLocationSource;
  sourceType: ECSWeatherSourceType;
  displayLabel: string;
  labelConfidence: WeatherLocationLabelConfidence;
  confidence: number;
  accuracyM: number | null;
  distanceFromPreviousMiles: number | null;
  shouldInvalidateLabel: boolean;
  shouldRefreshWeather: boolean;
  forceRefreshWeather: boolean;
  stale: boolean;
  staleReason: string | null;
  unavailableReason: string | null;
  labelSource: string | null;
}

export type WeatherReverseGeocoder = (coordinate: WeatherCoordinate) => Promise<string | null | undefined>;

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidWeatherLocationCoordinate(
  value: WeatherCoordinate | null | undefined,
): value is WeatherCoordinate {
  return !!value && isValidLatitude(value.lat) && isValidLongitude(value.lng);
}

export function formatWeatherCoordinateLabel(coordinate: WeatherCoordinate | null | undefined): string {
  if (!isValidWeatherLocationCoordinate(coordinate)) return 'Nearby location';
  return `${coordinate.lat.toFixed(2)}, ${coordinate.lng.toFixed(2)}`;
}

export function weatherLocationDistanceMiles(
  a: Pick<WeatherCoordinate, 'lat' | 'lng'>,
  b: Pick<WeatherCoordinate, 'lat' | 'lng'>,
): number {
  const radiusMiles = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function readTimestampMs(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceTypeFor(source: WeatherLocationSource): ECSWeatherSourceType {
  switch (source) {
    case 'current_gps':
      return 'current_location';
    case 'active_route':
      return 'route_origin';
    case 'selected_coordinate':
      return 'selected_coordinate';
    case 'last_known':
      return 'last_known';
    case 'manual':
      return 'selected_coordinate';
    default:
      return 'current_location';
  }
}

function confidenceFromLabel(labelConfidence: WeatherLocationLabelConfidence): number {
  switch (labelConfidence) {
    case 'high':
      return 0.96;
    case 'medium':
      return 0.72;
    case 'low':
      return 0.35;
    default:
      return 0;
  }
}

function normalizeCandidateCoordinate(candidate: WeatherLocationCandidate | null | undefined): WeatherCoordinate | null {
  const coordinate = candidate?.coordinate;
  if (!isValidWeatherLocationCoordinate(coordinate)) return null;
  return {
    lat: Number(coordinate.lat),
    lng: Number(coordinate.lng),
    label: typeof coordinate.label === 'string' ? coordinate.label.trim() || undefined : undefined,
    accuracyM: toFiniteNumber(coordinate.accuracyM),
    timestamp: toFiniteNumber(coordinate.timestamp),
  };
}

function hasFreshLastKnown(
  candidate: WeatherLastKnownCandidate | null | undefined,
  now: number,
  maxAgeMs: number,
): boolean {
  const timestampMs = candidate?.cachedAt ?? readTimestampMs(candidate?.fetchedAt ?? candidate?.coordinate?.timestamp);
  if (timestampMs == null) return false;
  return now - timestampMs <= maxAgeMs;
}

function buildResolvedLocation(params: {
  source: WeatherLocationSource;
  coordinate: WeatherCoordinate;
  candidate: WeatherLocationCandidate;
  previousLocation?: ResolvedWeatherLocation | null;
  gpsAccuracyM?: number | null;
  staleReason?: string | null;
}): ResolvedWeatherLocation {
  const { source, coordinate, candidate, previousLocation, gpsAccuracyM = null, staleReason = null } = params;
  const sourceType = sourceTypeFor(source);
  const distanceFromPreviousMiles =
    previousLocation?.coordinate && isValidWeatherLocationCoordinate(previousLocation.coordinate)
      ? weatherLocationDistanceMiles(previousLocation.coordinate, coordinate)
      : null;
  const movedBeyondStaleDistance =
    distanceFromPreviousMiles != null && distanceFromPreviousMiles > WEATHER_LOCATION_STALE_DISTANCE_MILES;
  const movedBeyondForceRefresh =
    distanceFromPreviousMiles != null && distanceFromPreviousMiles > WEATHER_LOCATION_FORCE_REFRESH_DISTANCE_MILES;

  const rawLabel =
    typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim()
      : coordinate.label;
  const labelSource = candidate.labelSource ?? (rawLabel ? 'unknown' : 'coordinate');
  const labelIsReverseGeocode = labelSource === 'reverse_geocode';
  const shouldInvalidateLabel = movedBeyondStaleDistance && !labelIsReverseGeocode;
  const displayLabel = shouldInvalidateLabel || !rawLabel
    ? formatWeatherCoordinateLabel(coordinate)
    : rawLabel;
  let labelConfidence: WeatherLocationLabelConfidence = 'low';

  if (labelIsReverseGeocode && (source === 'current_gps' || source === 'selected_coordinate')) {
    labelConfidence = 'high';
  } else if (labelSource === 'coordinate') {
    labelConfidence = 'low';
  } else if (source === 'last_known' || labelSource === 'provider' || labelSource === 'route' || labelSource === 'selected_place') {
    labelConfidence = 'medium';
  } else if (source === 'current_gps' && gpsAccuracyM != null && gpsAccuracyM <= DEFAULT_MAX_ACCEPTABLE_GPS_ACCURACY_M) {
    labelConfidence = rawLabel ? 'medium' : 'low';
  }

  if (shouldInvalidateLabel) {
    labelConfidence = source === 'last_known' ? 'medium' : 'low';
  }

  const stale = Boolean(staleReason) || movedBeyondStaleDistance || source === 'last_known';
  return {
    status: 'resolved',
    coordinate: {
      ...coordinate,
      label: displayLabel,
      accuracyM: gpsAccuracyM ?? coordinate.accuracyM ?? null,
    },
    source,
    sourceType,
    displayLabel,
    labelConfidence,
    confidence: confidenceFromLabel(labelConfidence),
    accuracyM: gpsAccuracyM ?? coordinate.accuracyM ?? null,
    distanceFromPreviousMiles,
    shouldInvalidateLabel,
    shouldRefreshWeather: movedBeyondStaleDistance,
    forceRefreshWeather: movedBeyondForceRefresh,
    stale,
    staleReason: staleReason ?? (movedBeyondStaleDistance ? 'weather_location_moved_more_than_1_mile' : null),
    unavailableReason: null,
    labelSource,
  };
}

export function resolveWeatherLocation(input: WeatherLocationResolverInput): ResolvedWeatherLocation {
  const now = input.now ?? Date.now();
  const maxGpsAccuracyM = input.maxAcceptableGpsAccuracyM ?? DEFAULT_MAX_ACCEPTABLE_GPS_ACCURACY_M;
  const lastKnownMaxAgeMs = input.lastKnownMaxAgeMs ?? DEFAULT_LAST_KNOWN_MAX_AGE_MS;

  const gpsCoordinate = normalizeCandidateCoordinate(input.currentGps);
  const gpsAccuracyM = toFiniteNumber(input.currentGps?.accuracyM ?? gpsCoordinate?.accuracyM);
  const gpsHasAcceptableAccuracy = gpsAccuracyM == null || gpsAccuracyM <= maxGpsAccuracyM;
  if (
    gpsCoordinate &&
    input.currentGps?.permissionDenied !== true &&
    input.currentGps?.hasFix === true &&
    gpsHasAcceptableAccuracy
  ) {
    return buildResolvedLocation({
      source: 'current_gps',
      coordinate: gpsCoordinate,
      candidate: input.currentGps,
      previousLocation: input.previousLocation,
      gpsAccuracyM,
    });
  }

  const routeCoordinate = normalizeCandidateCoordinate(input.activeRoute);
  if (routeCoordinate) {
    return buildResolvedLocation({
      source: 'active_route',
      coordinate: routeCoordinate,
      candidate: input.activeRoute ?? {},
      previousLocation: input.previousLocation,
    });
  }

  const selectedCoordinate = normalizeCandidateCoordinate(input.selectedCoordinate);
  if (selectedCoordinate) {
    return buildResolvedLocation({
      source: 'selected_coordinate',
      coordinate: selectedCoordinate,
      candidate: input.selectedCoordinate ?? {},
      previousLocation: input.previousLocation,
    });
  }

  const lastKnownCoordinate = normalizeCandidateCoordinate(input.lastKnown);
  if (lastKnownCoordinate && hasFreshLastKnown(input.lastKnown, now, lastKnownMaxAgeMs)) {
    return buildResolvedLocation({
      source: 'last_known',
      coordinate: lastKnownCoordinate,
      candidate: input.lastKnown ?? {},
      previousLocation: input.previousLocation,
      staleReason: 'using_recent_last_known_weather_coordinate',
    });
  }

  const manualCoordinate = normalizeCandidateCoordinate(input.manualFallback);
  if (manualCoordinate && input.manualFallback?.explicitlySelected === true) {
    return buildResolvedLocation({
      source: 'manual',
      coordinate: manualCoordinate,
      candidate: input.manualFallback,
      previousLocation: input.previousLocation,
      staleReason: 'manual_weather_location_selected',
    });
  }

  if (gpsCoordinate && input.currentGps?.permissionDenied !== true && input.currentGps?.hasFix === true && !gpsHasAcceptableAccuracy) {
    return buildResolvedLocation({
      source: 'current_gps',
      coordinate: gpsCoordinate,
      candidate: {
        ...input.currentGps,
        label: formatWeatherCoordinateLabel(gpsCoordinate),
        labelSource: 'coordinate',
      },
      previousLocation: input.previousLocation,
      gpsAccuracyM,
      staleReason: `gps_accuracy_poor_${Math.round(gpsAccuracyM ?? 0)}m`,
    });
  }

  return {
    status: 'unavailable',
    coordinate: null,
    source: 'unavailable',
    sourceType: 'current_location',
    displayLabel: WEATHER_LOCATION_UNAVAILABLE,
    labelConfidence: 'unavailable',
    confidence: 0,
    accuracyM: gpsAccuracyM,
    distanceFromPreviousMiles: null,
    shouldInvalidateLabel: true,
    shouldRefreshWeather: false,
    forceRefreshWeather: false,
    stale: false,
    staleReason: null,
    unavailableReason: input.currentGpsPermissionDenied === true || input.currentGps?.permissionDenied === true
      ? 'Location permission denied and no route, selected, recent last-known, or manual weather coordinate is available.'
      : 'No valid weather coordinate is available.',
    labelSource: null,
  };
}

export async function resolveWeatherLocationWithReverseGeocode(
  input: WeatherLocationResolverInput,
  reverseGeocode?: WeatherReverseGeocoder | null,
): Promise<ResolvedWeatherLocation> {
  const resolved = resolveWeatherLocation(input);
  if (!resolved.coordinate || !reverseGeocode) return resolved;

  try {
    const label = (await reverseGeocode(resolved.coordinate))?.trim();
    if (!label) return resolved;
    const labelConfidence: WeatherLocationLabelConfidence =
      resolved.source === 'current_gps' || resolved.source === 'selected_coordinate'
        ? 'high'
        : 'medium';
    return {
      ...resolved,
      coordinate: {
        ...resolved.coordinate,
        label,
      },
      displayLabel: label,
      labelConfidence,
      confidence: confidenceFromLabel(labelConfidence),
      shouldInvalidateLabel: false,
      labelSource: 'reverse_geocode',
    };
  } catch {
    return resolved;
  }
}
