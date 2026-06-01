import type { EnvironmentSnapshot } from '../environmentSnapshotService';
import type { WeatherFetchResult } from '../weatherStore';
import { calculateDistanceMiles, type NavigationCoordinate } from './bearingUtils';
import { distancePointToRouteMiles, type RouteCoordinate } from '../map/routeGeometryUtils';

export type CampScoutDataState = 'live' | 'estimated' | 'partial' | 'offline' | 'setupNeeded';

export type CampScoutCandidateSource =
  | 'savedPin'
  | 'establishedCampground'
  | 'dispersedCandidate'
  | 'userSelected'
  | 'routeCandidate'
  | 'unknown';

export type CampScoutLegalAccessConfidence =
  | 'likelyAllowed'
  | 'established'
  | 'unknown'
  | 'restricted'
  | 'verify';

export type CampScoutMetricSeverity = 'good' | 'watch' | 'caution' | 'critical' | 'unknown';
export type CampScoutExposure = 'low' | 'moderate' | 'high' | 'unknown';
export type CampScoutVehicleAccessConfidence = 'good' | 'limited' | 'poor' | 'unknown';

export interface CampScoutCommandCandidateInput {
  id: string;
  name?: string | null;
  latitude: number;
  longitude: number;
  source: CampScoutCandidateSource;
  legalAccessConfidence?: CampScoutLegalAccessConfidence | null;
  flatnessScore?: number | null;
  remotenessScore?: number | null;
  weatherExposure?: CampScoutExposure | null;
  windExposure?: CampScoutExposure | null;
  floodOrWashRisk?: CampScoutExposure | null;
  vehicleAccessConfidence?: CampScoutVehicleAccessConfidence | null;
  notes?: string | null;
  isFavorite?: boolean | null;
  isEstimated?: boolean | null;
  sourceLabel?: string | null;
}

export interface CampScoutCommandCandidate {
  id: string;
  label: string;
  name: string;
  coordinates: NavigationCoordinate;
  source: CampScoutCandidateSource;
  sourceLabel: string;
  distanceFromCurrentLocation: number | null;
  distanceFromRoute: number | null;
  etaFromCurrentLocation: string | null;
  scorePercent: number;
  scoreLabel: string;
  confidenceLabel: string;
  legalAccessConfidence: CampScoutLegalAccessConfidence;
  flatnessScore: number | null;
  remotenessScore: number | null;
  weatherExposure: CampScoutExposure;
  windExposure: CampScoutExposure;
  floodOrWashRisk: CampScoutExposure;
  arrivalBeforeDarkConfidence: CampScoutMetricSeverity;
  vehicleAccessConfidence: CampScoutVehicleAccessConfidence;
  notes: string | null;
  missingInputs: string[];
  isEstimated: boolean;
}

export interface CampScoutSelectedMetric {
  id:
    | 'legalAccess'
    | 'flatness'
    | 'remoteness'
    | 'routeDistance'
    | 'wind'
    | 'arrival'
    | 'vehicleAccess';
  label: string;
  value: string;
  severity: CampScoutMetricSeverity;
  sourceLabel: string;
}

export interface CampScoutCommandData {
  dataState: CampScoutDataState;
  candidates: CampScoutCommandCandidate[];
  selectedCandidateId: string | null;
  bestCandidateId: string | null;
  recommendationLabel: string;
  recommendationReason: string;
  overallConfidence: number;
  confidenceLabel: string;
  missingInputs: string[];
  selectedCandidateMetrics: CampScoutSelectedMetric[];
  routeActive: boolean;
  isOffline: boolean;
  isUsingCachedData: boolean;
  lastUpdatedAt: Date | null;
}

export interface CampScoutCommandSnapshot {
  currentLocation?: NavigationCoordinate & { accuracyMeters?: number | null; updatedAt?: string | number | Date | null } | null;
  routePoints?: RouteCoordinate[] | null;
  routeActive?: boolean | null;
  candidates?: CampScoutCommandCandidateInput[] | null;
  selectedCandidateId?: string | null;
  environment?: EnvironmentSnapshot | null;
  weather?: WeatherFetchResult | null;
  isOffline?: boolean | null;
  isUsingCachedData?: boolean | null;
  sourceUpdatedAt?: string | number | Date | null;
}

const GOOD = 'good' as const;
const WATCH = 'watch' as const;
const CAUTION = 'caution' as const;
const CRITICAL = 'critical' as const;
const UNKNOWN = 'unknown' as const;

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isCoordinate(value: unknown): value is NavigationCoordinate {
  const coordinate = value as Partial<NavigationCoordinate> | null | undefined;
  return (
    coordinate != null &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    Number(coordinate.latitude) >= -90 &&
    Number(coordinate.latitude) <= 90 &&
    Number(coordinate.longitude) >= -180 &&
    Number(coordinate.longitude) <= 180
  );
}

function formatMiles(value: number | null): string {
  if (value == null) return '--';
  if (value < 0.1) return '<0.1 mi';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function formatEta(distanceMiles: number | null): string | null {
  if (distanceMiles == null) return null;
  const averageTrailMph = 12;
  const minutes = Math.max(2, Math.round((distanceMiles / averageTrailMph) * 60));
  if (minutes < 60) return `${minutes}m est`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m est` : `${hours}h est`;
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeLegalAccess(
  value: CampScoutCommandCandidateInput['legalAccessConfidence'],
  source: CampScoutCandidateSource,
): CampScoutLegalAccessConfidence {
  if (value) return value;
  if (source === 'establishedCampground') return 'established';
  if (source === 'savedPin' || source === 'userSelected') return 'verify';
  if (source === 'dispersedCandidate') return 'likelyAllowed';
  return 'unknown';
}

function legalAccessScore(value: CampScoutLegalAccessConfidence): number {
  switch (value) {
    case 'established':
      return 88;
    case 'likelyAllowed':
      return 74;
    case 'verify':
      return 56;
    case 'unknown':
      return 38;
    case 'restricted':
    default:
      return 5;
  }
}

function legalAccessSeverity(value: CampScoutLegalAccessConfidence): CampScoutMetricSeverity {
  if (value === 'established' || value === 'likelyAllowed') return GOOD;
  if (value === 'verify') return WATCH;
  if (value === 'unknown') return CAUTION;
  return CRITICAL;
}

function exposureScore(value: CampScoutExposure): number {
  if (value === 'low') return 90;
  if (value === 'moderate') return 62;
  if (value === 'high') return 24;
  return 55;
}

function exposureSeverity(value: CampScoutExposure): CampScoutMetricSeverity {
  if (value === 'low') return GOOD;
  if (value === 'moderate') return WATCH;
  if (value === 'high') return CAUTION;
  return UNKNOWN;
}

function vehicleAccessScore(value: CampScoutVehicleAccessConfidence): number {
  if (value === 'good') return 90;
  if (value === 'limited') return 58;
  if (value === 'poor') return 22;
  return 55;
}

function vehicleAccessSeverity(value: CampScoutVehicleAccessConfidence): CampScoutMetricSeverity {
  if (value === 'good') return GOOD;
  if (value === 'limited') return WATCH;
  if (value === 'poor') return CAUTION;
  return UNKNOWN;
}

function inferWeatherExposure(weather: WeatherFetchResult | null | undefined): CampScoutExposure {
  const result = weather?.data?.results?.[0] ?? null;
  if (!result || result.error) return 'unknown';
  if (result.alerts?.some((alert) => alert.severity === 'extreme' || alert.severity === 'warning')) return 'high';
  const current = result.current;
  const wind = finite(current?.wind_speed);
  const gust = finite(current?.wind_gust);
  const main = String(current?.weather_main ?? '').toLowerCase();
  if ((gust != null && gust >= 35) || (wind != null && wind >= 30) || main.includes('thunderstorm')) return 'high';
  if ((gust != null && gust >= 24) || (wind != null && wind >= 18) || main.includes('rain') || main.includes('snow')) {
    return 'moderate';
  }
  return 'low';
}

function inferArrivalConfidence(
  distanceFromCurrentLocation: number | null,
  environment: EnvironmentSnapshot | null | undefined,
): CampScoutMetricSeverity {
  const remaining = finite(environment?.sunlight.remainingMinutes);
  if (environment?.sunlight.nextEvent === 'sunrise' && remaining != null) return CRITICAL;
  if (distanceFromCurrentLocation == null || remaining == null) return UNKNOWN;
  const etaMinutes = Math.max(2, (distanceFromCurrentLocation / 12) * 60);
  const margin = remaining - etaMinutes;
  if (margin < 20) return CRITICAL;
  if (margin < 60) return CAUTION;
  if (margin < 120) return WATCH;
  return GOOD;
}

function arrivalScore(severity: CampScoutMetricSeverity): number {
  if (severity === GOOD) return 92;
  if (severity === WATCH) return 72;
  if (severity === CAUTION) return 45;
  if (severity === CRITICAL) return 15;
  return 58;
}

function normalizeCandidate(
  input: CampScoutCommandCandidateInput,
  params: {
    currentLocation: NavigationCoordinate | null;
    routePoints: RouteCoordinate[];
    environment: EnvironmentSnapshot | null;
    weather: WeatherFetchResult | null | undefined;
    label: string;
  },
): CampScoutCommandCandidate | null {
  const coordinate = { latitude: input.latitude, longitude: input.longitude };
  if (!isCoordinate(coordinate)) return null;

  const distanceFromCurrentLocation = calculateDistanceMiles(params.currentLocation, coordinate);
  const distanceFromRoute = distancePointToRouteMiles(coordinate, params.routePoints);
  const legalAccessConfidence = normalizeLegalAccess(input.legalAccessConfidence, input.source);
  const weatherExposure = input.weatherExposure ?? inferWeatherExposure(params.weather);
  const windExposure = input.windExposure ?? weatherExposure;
  const floodOrWashRisk = input.floodOrWashRisk ?? 'unknown';
  const vehicleAccessConfidence = input.vehicleAccessConfidence ?? 'unknown';
  const flatnessScore = finite(input.flatnessScore);
  const remotenessScore = finite(input.remotenessScore);
  const arrivalBeforeDarkConfidence = inferArrivalConfidence(distanceFromCurrentLocation, params.environment);

  const missingInputs = [
    params.currentLocation ? null : 'Location',
    params.routePoints.length > 0 ? null : 'Route corridor',
    flatnessScore == null ? 'Flatness' : null,
    remotenessScore == null ? 'Privacy/remoteness' : null,
    legalAccessConfidence === 'unknown' || legalAccessConfidence === 'verify' ? 'Access verification' : null,
    weatherExposure === 'unknown' ? 'Weather exposure' : null,
  ].filter((entry): entry is string => Boolean(entry));

  const routeScore =
    distanceFromRoute == null
      ? 55
      : distanceFromRoute <= 0.25
        ? 90
        : distanceFromRoute <= 1
          ? 78
          : distanceFromRoute <= 3
            ? 62
            : 40;
  const currentDistanceScore =
    distanceFromCurrentLocation == null
      ? 55
      : distanceFromCurrentLocation <= 2
        ? 86
        : distanceFromCurrentLocation <= 8
          ? 74
          : distanceFromCurrentLocation <= 20
            ? 56
            : 36;
  const score =
    legalAccessScore(legalAccessConfidence) * 0.22 +
    clamp(flatnessScore ?? 58) * 0.16 +
    clamp(remotenessScore ?? 58) * 0.14 +
    exposureScore(weatherExposure) * 0.12 +
    exposureScore(windExposure) * 0.1 +
    exposureScore(floodOrWashRisk) * 0.08 +
    arrivalScore(arrivalBeforeDarkConfidence) * 0.1 +
    vehicleAccessScore(vehicleAccessConfidence) * 0.08 +
    routeScore * 0.06 +
    currentDistanceScore * 0.04 +
    (input.isFavorite ? 4 : 0);

  const scorePercent = Math.round(clamp(legalAccessConfidence === 'restricted' ? Math.min(score, 22) : score));
  const scoreLabel =
    legalAccessConfidence === 'restricted'
      ? 'Avoid'
      : scorePercent >= 82
        ? 'Strong candidate'
        : scorePercent >= 68
          ? 'Viable candidate'
          : scorePercent >= 50
            ? 'Verify candidate'
            : 'Weak candidate';
  const confidenceLabel =
    missingInputs.length === 0 && !input.isEstimated
      ? 'High confidence'
      : missingInputs.length <= 2
        ? 'Estimated confidence'
        : 'Limited confidence';

  return {
    id: input.id,
    label: params.label,
    name: input.name?.trim() || `${titleCase(input.source)} candidate`,
    coordinates: coordinate,
    source: input.source,
    sourceLabel: input.sourceLabel ?? titleCase(input.source),
    distanceFromCurrentLocation,
    distanceFromRoute,
    etaFromCurrentLocation: formatEta(distanceFromCurrentLocation),
    scorePercent,
    scoreLabel,
    confidenceLabel,
    legalAccessConfidence,
    flatnessScore,
    remotenessScore,
    weatherExposure,
    windExposure,
    floodOrWashRisk,
    arrivalBeforeDarkConfidence,
    vehicleAccessConfidence,
    notes: input.notes?.trim() || null,
    missingInputs,
    isEstimated: Boolean(input.isEstimated || missingInputs.length > 0),
  };
}

function resolveDataState(params: {
  hasLocation: boolean;
  candidateCount: number;
  isOffline: boolean;
  isUsingCachedData: boolean;
  missingInputs: string[];
  hasEstimatedCandidates: boolean;
}): CampScoutDataState {
  if (params.isOffline) return 'offline';
  if (!params.hasLocation && params.candidateCount === 0) return 'setupNeeded';
  if (params.candidateCount === 0) return params.hasLocation ? 'partial' : 'setupNeeded';
  if (params.isUsingCachedData || params.missingInputs.length >= 3) return 'partial';
  if (params.hasEstimatedCandidates || params.missingInputs.length > 0) return 'estimated';
  return 'live';
}

function buildRecommendation(dataState: CampScoutDataState, best: CampScoutCommandCandidate | null): {
  label: string;
  reason: string;
} {
  if (dataState === 'setupNeeded') {
    return {
      label: 'ADD CAMP CANDIDATES FROM MAP',
      reason: 'Add campsite candidates or save a camp pin to begin ranking.',
    };
  }
  if (dataState === 'offline' && best) {
    return {
      label: `OFFLINE - USING ${best.label}`,
      reason: 'Ranking is based on saved or cached candidates. Verify access before camping.',
    };
  }
  if (!best) {
    return {
      label: 'NO CANDIDATES FOUND',
      reason: 'No nearby camp candidates are available from saved pins or staged camp sources.',
    };
  }
  if (best.legalAccessConfidence === 'restricted') {
    return {
      label: 'VERIFY ACCESS BEFORE CAMPING',
      reason: 'Best available candidate has restricted or unresolved access signals.',
    };
  }
  if (best.source === 'establishedCampground') {
    return {
      label: `ESTABLISHED CAMPGROUND: ${best.label}`,
      reason: `${best.name} is the strongest known fixed campsite candidate. Verify availability and current rules.`,
    };
  }
  return {
    label: `BEST SITE: ${best.label}`,
    reason: `${best.name} ranks highest from current ECS factors. Verify access before camping.`,
  };
}

function resolveOverallConfidence(dataState: CampScoutDataState, candidates: CampScoutCommandCandidate[]): number {
  if (dataState === 'setupNeeded') return 18;
  if (dataState === 'offline') return candidates.length ? 38 : 24;
  const best = candidates[0];
  if (!best) return 28;
  const candidatePenalty = Math.min(12, best.missingInputs.length * 3);
  const statePenalty = dataState === 'partial' ? 12 : dataState === 'estimated' ? 6 : 0;
  return Math.max(15, Math.min(94, Math.round(best.scorePercent - candidatePenalty - statePenalty)));
}

function confidenceLabel(dataState: CampScoutDataState, confidence: number, missingInputs: string[]): string {
  if (dataState === 'live') return `Live camp confidence ${confidence}%`;
  if (dataState === 'estimated') return `Estimated camp confidence ${confidence}%`;
  if (dataState === 'offline') return 'Offline - saved candidate confidence';
  if (dataState === 'setupNeeded') return 'Setup needed';
  if (missingInputs.length) return `Partial - missing ${missingInputs.slice(0, 2).join(', ')}`;
  return `Partial camp confidence ${confidence}%`;
}

function metric(
  id: CampScoutSelectedMetric['id'],
  label: string,
  value: string,
  severity: CampScoutMetricSeverity,
  sourceLabel: string,
): CampScoutSelectedMetric {
  return { id, label, value, severity, sourceLabel };
}

function buildMetrics(candidate: CampScoutCommandCandidate | null): CampScoutSelectedMetric[] {
  if (!candidate) return [];
  return [
    metric(
      'legalAccess',
      'Access',
      candidate.legalAccessConfidence === 'likelyAllowed'
        ? 'Likely eligible - verify'
        : candidate.legalAccessConfidence === 'established'
          ? 'Established - verify'
          : candidate.legalAccessConfidence === 'restricted'
            ? 'Restricted / avoid'
            : 'Unknown - verify',
      legalAccessSeverity(candidate.legalAccessConfidence),
      candidate.sourceLabel,
    ),
    metric('flatness', 'Flatness', candidate.flatnessScore == null ? 'Unknown' : `${Math.round(candidate.flatnessScore)}%`, candidate.flatnessScore == null ? UNKNOWN : candidate.flatnessScore >= 70 ? GOOD : candidate.flatnessScore >= 50 ? WATCH : CAUTION, 'Terrain estimate'),
    metric('remoteness', 'Privacy', candidate.remotenessScore == null ? 'Unknown' : `${Math.round(candidate.remotenessScore)}%`, candidate.remotenessScore == null ? UNKNOWN : candidate.remotenessScore >= 70 ? GOOD : candidate.remotenessScore >= 45 ? WATCH : CAUTION, 'Remoteness estimate'),
    metric('routeDistance', 'Route', candidate.distanceFromRoute == null ? 'Route unknown' : `${formatMiles(candidate.distanceFromRoute)} from route`, candidate.distanceFromRoute == null ? UNKNOWN : candidate.distanceFromRoute <= 1 ? GOOD : candidate.distanceFromRoute <= 3 ? WATCH : CAUTION, 'Route corridor'),
    metric('wind', 'Wind', titleCase(candidate.windExposure), exposureSeverity(candidate.windExposure), 'Weather source'),
    metric('arrival', 'Arrival', titleCase(candidate.arrivalBeforeDarkConfidence), candidate.arrivalBeforeDarkConfidence, 'Sunlight window'),
    metric('vehicleAccess', 'Vehicle', titleCase(candidate.vehicleAccessConfidence), vehicleAccessSeverity(candidate.vehicleAccessConfidence), 'Access estimate'),
  ];
}

export function normalizeCampScoutCommandData(snapshot: CampScoutCommandSnapshot = {}): CampScoutCommandData {
  const currentLocation = isCoordinate(snapshot.currentLocation) ? snapshot.currentLocation : null;
  const routePoints = Array.isArray(snapshot.routePoints) ? snapshot.routePoints : [];
  const rawCandidates = Array.isArray(snapshot.candidates) ? snapshot.candidates : [];
  const sortedCandidates = rawCandidates
    .map((candidate, index) =>
      normalizeCandidate(candidate, {
        currentLocation,
        routePoints,
        environment: snapshot.environment ?? null,
        weather: snapshot.weather,
        label: String.fromCharCode(65 + index),
      }),
    )
    .filter((candidate): candidate is CampScoutCommandCandidate => candidate != null)
    .sort((a, b) => b.scorePercent - a.scorePercent || (a.distanceFromCurrentLocation ?? 999) - (b.distanceFromCurrentLocation ?? 999))
    .map((candidate, index) => ({ ...candidate, label: String.fromCharCode(65 + index) }));

  const selectedCandidate =
    sortedCandidates.find((candidate) => candidate.id === snapshot.selectedCandidateId) ??
    sortedCandidates[0] ??
    null;
  const missingInputs = [
    currentLocation ? null : 'Location',
    routePoints.length > 0 ? null : 'Route corridor',
    rawCandidates.length > 0 ? null : 'Camp candidates',
    snapshot.environment?.sunlight.nextEvent ? null : 'Sunlight window',
    snapshot.weather ? null : 'Weather',
  ].filter((entry): entry is string => Boolean(entry));
  const dataState = resolveDataState({
    hasLocation: Boolean(currentLocation),
    candidateCount: sortedCandidates.length,
    isOffline: Boolean(snapshot.isOffline),
    isUsingCachedData: Boolean(snapshot.isUsingCachedData || snapshot.weather?.source === 'cache_stale'),
    missingInputs,
    hasEstimatedCandidates: sortedCandidates.some((candidate) => candidate.isEstimated),
  });
  const recommendation = buildRecommendation(dataState, selectedCandidate);
  const overallConfidence = resolveOverallConfidence(dataState, sortedCandidates);

  return {
    dataState,
    candidates: sortedCandidates.slice(0, 4),
    selectedCandidateId: selectedCandidate?.id ?? null,
    bestCandidateId: sortedCandidates[0]?.id ?? null,
    recommendationLabel: recommendation.label,
    recommendationReason: recommendation.reason,
    overallConfidence,
    confidenceLabel: confidenceLabel(dataState, overallConfidence, missingInputs),
    missingInputs,
    selectedCandidateMetrics: buildMetrics(selectedCandidate),
    routeActive: Boolean(snapshot.routeActive),
    isOffline: Boolean(snapshot.isOffline),
    isUsingCachedData: Boolean(snapshot.isUsingCachedData),
    lastUpdatedAt: normalizeDate(snapshot.sourceUpdatedAt ?? snapshot.currentLocation?.updatedAt),
  };
}

export const campScoutCommandFormatters = {
  formatMiles,
  titleCase,
};
