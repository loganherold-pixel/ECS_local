import type { ActiveRouteProgressSnapshot } from '../activeRouteProgress';
import type { ActiveVehicleContext } from '../activeVehicleContext';
import type { EnvironmentSnapshot } from '../environmentSnapshotService';
import type { RemotenessIndexOutput } from '../remotenessTypes';
import type { WeatherFetchResult } from '../weatherStore';

export type TrailDecisionDataState = 'live' | 'estimated' | 'partial' | 'offline' | 'setupNeeded';

export type TrailDecisionRecommendation =
  | 'proceed'
  | 'proceedWithCaution'
  | 'scoutOnFoot'
  | 'rerouteRecommended'
  | 'turnBackRecommended'
  | 'holdPosition'
  | 'unknown';

export type TrailDecisionSeverity = 'good' | 'watch' | 'caution' | 'critical' | 'unknown';
export type TrailDecisionDaylightMargin = 'good' | 'watch' | 'caution' | 'critical' | 'unknown';
export type TrailDecisionWeatherImpact = 'low' | 'moderate' | 'high' | 'unknown';
export type TrailDecisionTerrainConfidence = 'good' | 'limited' | 'poor' | 'unknown';
export type TrailDecisionVehicleFit = 'good' | 'watch' | 'caution' | 'poor' | 'unknown';
export type TrailDecisionRecoveryMargin = 'good' | 'limited' | 'poor' | 'unknown';
export type TrailDecisionRemotenessLevel = 'low' | 'moderate' | 'high' | 'extreme' | 'unknown';
export type TrailDecisionRouteConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type TrailDecisionOfflineRisk = 'nominal' | 'watch' | 'caution' | 'critical';

export type TrailDecisionFactorId =
  | 'daylightMargin'
  | 'weatherImpact'
  | 'vehicleFit'
  | 'terrainConfidence'
  | 'recoveryMargin'
  | 'remoteness'
  | 'routeConfidence'
  | 'offlineRisk';

export interface TrailDecisionFactor {
  id: TrailDecisionFactorId;
  label: string;
  value: string;
  severity: TrailDecisionSeverity;
  sourceLabel: string;
  isEstimated: boolean;
}

export interface TrailDecisionCommandData {
  dataState: TrailDecisionDataState;
  recommendedDecision: TrailDecisionRecommendation;
  decisionLabel: string;
  decisionReason: string;
  actionLabel: string;
  confidencePercent: number;
  confidenceLabel: string;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  } | null;
  currentHeadingDegrees: number | null;
  routeActive: boolean;
  routeLabel: string | null;
  distanceRemaining: number | null;
  distanceRemainingLabel: string;
  eta: string | null;
  daylightRemainingMinutes: number | null;
  daylightMargin: TrailDecisionDaylightMargin;
  weatherImpact: TrailDecisionWeatherImpact;
  terrainConfidence: TrailDecisionTerrainConfidence;
  vehicleFit: TrailDecisionVehicleFit;
  recoveryMargin: TrailDecisionRecoveryMargin;
  remotenessLevel: TrailDecisionRemotenessLevel;
  routeConfidence: TrailDecisionRouteConfidence;
  offlineRisk: TrailDecisionOfflineRisk;
  missingInputs: string[];
  factors: TrailDecisionFactor[];
  isOffline: boolean;
  isUsingCachedData: boolean;
  lastUpdatedAt: Date | null;
}

export interface TrailDecisionCommandSnapshot {
  currentLocation?: {
    latitude?: number | null;
    longitude?: number | null;
    accuracyMeters?: number | null;
    updatedAt?: string | number | Date | null;
  } | null;
  currentHeadingDegrees?: number | null;
  hasLocationPermission?: boolean | null;
  activeRouteProgress?: ActiveRouteProgressSnapshot | null;
  environment?: EnvironmentSnapshot | null;
  weather?: WeatherFetchResult | null;
  vehicleContext?: ActiveVehicleContext | null;
  remotenessIndex?: RemotenessIndexOutput | null;
  terrainAvailable?: boolean | null;
  terrainSourceLabel?: string | null;
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

function normalizeDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function latestDate(...values: Array<string | number | Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    const date = normalizeDate(value);
    if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
  }
  return latest;
}

function normalizeLocation(
  input: TrailDecisionCommandSnapshot['currentLocation'],
): TrailDecisionCommandData['currentLocation'] {
  const latitude = finite(input?.latitude);
  const longitude = finite(input?.longitude);
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return {
    latitude,
    longitude,
    accuracyMeters: finite(input?.accuracyMeters),
  };
}

function formatMiles(value: number | null): string {
  if (value == null) return 'Route distance unavailable';
  if (value < 0.1) return '<0.1 mi';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return 'Unavailable';
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${Math.max(1, mins)}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function severityRank(severity: TrailDecisionSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'caution':
      return 3;
    case 'watch':
      return 2;
    case 'unknown':
      return 1;
    case 'good':
    default:
      return 0;
  }
}

function severityFromWeatherImpact(value: TrailDecisionWeatherImpact): TrailDecisionSeverity {
  if (value === 'high') return CRITICAL;
  if (value === 'moderate') return CAUTION;
  if (value === 'low') return GOOD;
  return UNKNOWN;
}

function severityFromTerrain(value: TrailDecisionTerrainConfidence): TrailDecisionSeverity {
  if (value === 'poor') return CRITICAL;
  if (value === 'limited') return CAUTION;
  if (value === 'good') return GOOD;
  return UNKNOWN;
}

function severityFromVehicleFit(value: TrailDecisionVehicleFit): TrailDecisionSeverity {
  if (value === 'poor') return CRITICAL;
  if (value === 'caution') return CAUTION;
  if (value === 'watch') return WATCH;
  if (value === 'good') return GOOD;
  return UNKNOWN;
}

function severityFromRecoveryMargin(value: TrailDecisionRecoveryMargin): TrailDecisionSeverity {
  if (value === 'poor') return CRITICAL;
  if (value === 'limited') return CAUTION;
  if (value === 'good') return GOOD;
  return UNKNOWN;
}

function severityFromRemoteness(value: TrailDecisionRemotenessLevel): TrailDecisionSeverity {
  if (value === 'extreme') return CRITICAL;
  if (value === 'high') return CAUTION;
  if (value === 'moderate') return WATCH;
  if (value === 'low') return GOOD;
  return UNKNOWN;
}

function severityFromRouteConfidence(value: TrailDecisionRouteConfidence): TrailDecisionSeverity {
  if (value === 'low') return CAUTION;
  if (value === 'medium') return WATCH;
  if (value === 'high') return GOOD;
  return UNKNOWN;
}

function severityFromOfflineRisk(value: TrailDecisionOfflineRisk): TrailDecisionSeverity {
  if (value === 'critical') return CRITICAL;
  if (value === 'caution') return CAUTION;
  if (value === 'watch') return WATCH;
  return GOOD;
}

function resolveDaylightMargin(
  remainingMinutes: number | null,
  distanceRemaining: number | null,
  nextEvent: EnvironmentSnapshot['sunlight']['nextEvent'] | null | undefined,
): TrailDecisionDaylightMargin {
  if (nextEvent === 'sunrise' && remainingMinutes != null) return CRITICAL;
  if (remainingMinutes == null) return UNKNOWN;
  if (remainingMinutes <= 30) return CRITICAL;
  if (remainingMinutes <= 90) return CAUTION;
  if (distanceRemaining != null && distanceRemaining >= 20 && remainingMinutes <= 150) return CAUTION;
  if (remainingMinutes <= 180) return WATCH;
  return GOOD;
}

function resolveWeatherImpact(weather: WeatherFetchResult | null | undefined): TrailDecisionWeatherImpact {
  const result = weather?.data?.results?.[0] ?? null;
  if (!result || result.error) return UNKNOWN;
  if (result.alerts?.some((alert) => alert.severity === 'extreme')) return 'high';
  if (result.alerts?.some((alert) => alert.severity === 'warning')) return 'moderate';
  const current = result.current;
  const trailOverall = result.trail_conditions?.overall;
  if (trailOverall === 'hazardous') return 'high';
  if (trailOverall === 'poor') return 'moderate';
  const wind = finite(current?.wind_speed);
  const gust = finite(current?.wind_gust);
  const weatherMain = String(current?.weather_main ?? '').toLowerCase();
  if ((gust != null && gust >= 45) || (wind != null && wind >= 40)) return 'high';
  if (
    (gust != null && gust >= 30) ||
    (wind != null && wind >= 25) ||
    weatherMain.includes('thunderstorm') ||
    weatherMain.includes('snow')
  ) {
    return 'moderate';
  }
  if (weatherMain.includes('rain') || weatherMain.includes('drizzle') || weatherMain.includes('fog')) return 'moderate';
  return 'low';
}

function resolveTerrainConfidence(
  remotenessIndex: RemotenessIndexOutput | null | undefined,
  routeProgress: ActiveRouteProgressSnapshot | null | undefined,
  terrainAvailable: boolean | null | undefined,
): TrailDecisionTerrainConfidence {
  const complexity = remotenessIndex?.terrain?.complexity ?? null;
  if (complexity === 'high') return 'poor';
  if (complexity === 'medium') return 'limited';
  if (complexity === 'low') return 'good';
  const line = `${routeProgress?.warningLine ?? ''} ${routeProgress?.geometryStatus ?? ''}`.toLowerCase();
  if (line.includes('hazard')) return 'limited';
  if (line.includes('unavailable')) return 'unknown';
  if (terrainAvailable) return 'limited';
  return UNKNOWN;
}

function getVehicleWeightUsage(context: ActiveVehicleContext | null | undefined): number | null {
  const weight = context?.weightSnapshot as unknown as {
    gvwrUsagePct?: number | null;
    usagePct?: number | null;
    operatingWeightLb?: number | null;
    gvwrLb?: number | null;
  } | null;
  const direct = finite(weight?.gvwrUsagePct ?? weight?.usagePct);
  if (direct != null) return direct;
  const operating = finite(weight?.operatingWeightLb);
  const gvwr = finite(weight?.gvwrLb);
  if (operating != null && gvwr != null && gvwr > 0) return (operating / gvwr) * 100;
  return null;
}

function resolveVehicleFit(context: ActiveVehicleContext | null | undefined): TrailDecisionVehicleFit {
  if (!context?.hasVehicleContext) return UNKNOWN;
  const usagePct = getVehicleWeightUsage(context);
  if (usagePct != null && usagePct >= 105) return 'poor';
  if (usagePct != null && usagePct >= 95) return 'caution';
  const hasBuildContext = Boolean(
    context.tiresLift ||
      context.resourceProfile?.tireSizeInches ||
      context.resourceProfile?.suspensionLiftInches ||
      context.capabilitySnapshot ||
      context.spec,
  );
  if (!hasBuildContext) return 'watch';
  return usagePct != null && usagePct >= 85 ? 'watch' : 'good';
}

function resolveRemotenessLevel(index: RemotenessIndexOutput | null | undefined): TrailDecisionRemotenessLevel {
  if (!index || !index.isActive) return UNKNOWN;
  switch (index.level) {
    case 'Low':
      return 'low';
    case 'Moderate':
      return 'moderate';
    case 'Remote':
      return 'high';
    case 'Extreme':
      return 'extreme';
    default:
      return UNKNOWN;
  }
}

function resolveRouteConfidence(progress: ActiveRouteProgressSnapshot | null | undefined): TrailDecisionRouteConfidence {
  if (!progress?.hasRoute) return UNKNOWN;
  const line = `${progress.confidenceLine ?? ''} ${progress.geometryStatus ?? ''} ${progress.calculationState ?? ''}`.toLowerCase();
  if (line.includes('unavailable') || line.includes('limited') || line.includes('low') || line.includes('off route')) {
    return 'low';
  }
  if (progress.source === 'imported-route' && !progress.isActive) return 'medium';
  if (progress.stateTone === 'live' || progress.stateTone === 'good') return 'high';
  return 'medium';
}

function resolveOfflineRisk(params: {
  isOffline: boolean;
  isUsingCachedData: boolean;
  hasLocation: boolean;
  hasRoute: boolean;
}): TrailDecisionOfflineRisk {
  if (params.isOffline && !params.hasLocation) return 'critical';
  if (params.isOffline && params.hasRoute) return 'caution';
  if (params.isOffline || params.isUsingCachedData) return 'watch';
  return 'nominal';
}

function resolveRecoveryMargin(params: {
  vehicleFit: TrailDecisionVehicleFit;
  remotenessLevel: TrailDecisionRemotenessLevel;
  routeConfidence: TrailDecisionRouteConfidence;
  offlineRisk: TrailDecisionOfflineRisk;
  hasRoute: boolean;
}): TrailDecisionRecoveryMargin {
  if (!params.hasRoute) return UNKNOWN;
  if (params.vehicleFit === 'poor' || params.offlineRisk === 'critical') return 'poor';
  if (params.remotenessLevel === 'extreme' && (params.vehicleFit === 'caution' || params.routeConfidence === 'low')) return 'poor';
  if (
    params.remotenessLevel === 'high' ||
    params.remotenessLevel === 'extreme' ||
    params.vehicleFit === 'caution' ||
    params.routeConfidence === 'low' ||
    params.offlineRisk === 'caution'
  ) {
    return 'limited';
  }
  return 'good';
}

function factor(
  id: TrailDecisionFactorId,
  label: string,
  value: string,
  severity: TrailDecisionSeverity,
  sourceLabel: string,
  isEstimated: boolean,
): TrailDecisionFactor {
  return { id, label, value, severity, sourceLabel, isEstimated };
}

function resolveMissingInputs(params: {
  hasLocation: boolean;
  hasRoute: boolean;
  daylightMargin: TrailDecisionDaylightMargin;
  weatherImpact: TrailDecisionWeatherImpact;
  vehicleFit: TrailDecisionVehicleFit;
  terrainConfidence: TrailDecisionTerrainConfidence;
  remotenessLevel: TrailDecisionRemotenessLevel;
}): string[] {
  const missing: string[] = [];
  if (!params.hasLocation) missing.push('Location');
  if (!params.hasRoute) missing.push('Active route');
  if (params.daylightMargin === UNKNOWN) missing.push('Sunlight window');
  if (params.weatherImpact === 'unknown') missing.push('Weather');
  if (params.vehicleFit === 'unknown') missing.push('Vehicle profile');
  if (params.terrainConfidence === 'unknown') missing.push('Terrain context');
  if (params.remotenessLevel === 'unknown') missing.push('Remoteness');
  return missing;
}

function resolveDataState(params: {
  hasLocation: boolean;
  hasRoute: boolean;
  isOffline: boolean;
  isUsingCachedData: boolean;
  missingInputs: string[];
  hasEstimatedFactors: boolean;
  hasLocationPermission: boolean;
}): TrailDecisionDataState {
  if (!params.hasLocation && !params.hasLocationPermission) return 'setupNeeded';
  if (!params.hasLocation && !params.hasRoute) return 'setupNeeded';
  if (params.isOffline) return 'offline';
  if (!params.hasRoute) return 'partial';
  if (params.isUsingCachedData || params.missingInputs.length >= 3) return 'partial';
  if (params.missingInputs.length > 0) return 'estimated';
  if (params.hasEstimatedFactors) return 'estimated';
  return 'live';
}

function buildDecision(params: {
  dataState: TrailDecisionDataState;
  hasRoute: boolean;
  daylightMargin: TrailDecisionDaylightMargin;
  weatherImpact: TrailDecisionWeatherImpact;
  terrainConfidence: TrailDecisionTerrainConfidence;
  vehicleFit: TrailDecisionVehicleFit;
  recoveryMargin: TrailDecisionRecoveryMargin;
  remotenessLevel: TrailDecisionRemotenessLevel;
  routeConfidence: TrailDecisionRouteConfidence;
  offlineRisk: TrailDecisionOfflineRisk;
  factors: TrailDecisionFactor[];
}): {
  recommendedDecision: TrailDecisionRecommendation;
  decisionLabel: string;
  actionLabel: string;
  decisionReason: string;
} {
  if (params.dataState === 'setupNeeded') {
    return {
      recommendedDecision: 'unknown',
      decisionLabel: 'TRAIL DECISION LIMITED',
      actionLabel: 'SELECT ROUTE TO BEGIN',
      decisionReason: 'Select an active route and enable location to assess continuation risk.',
    };
  }

  if (params.dataState === 'offline') {
    return {
      recommendedDecision: 'holdPosition',
      decisionLabel: 'HOLD POSITION',
      actionLabel: 'OFFLINE - USE LAST KNOWN ROUTE',
      decisionReason: 'Offline or stale data limits live trail decision confidence.',
    };
  }

  if (!params.hasRoute) {
    return {
      recommendedDecision: 'unknown',
      decisionLabel: 'ROUTE NEEDED',
      actionLabel: 'SELECT ROUTE TO BEGIN',
      decisionReason: 'Trail decision limited until an active route or waypoint is selected.',
    };
  }

  if (
    params.vehicleFit === 'poor' ||
    (params.remotenessLevel === 'extreme' && params.recoveryMargin === 'poor')
  ) {
    return {
      recommendedDecision: 'turnBackRecommended',
      decisionLabel: 'TURN BACK RECOMMENDED',
      actionLabel: 'TURN BACK RECOMMENDED',
      decisionReason: 'Vehicle fit and recovery exposure are outside the current confidence margin.',
    };
  }

  if (params.weatherImpact === 'high' || params.daylightMargin === 'critical') {
    return {
      recommendedDecision: 'holdPosition',
      decisionLabel: 'HOLD POSITION',
      actionLabel: 'HOLD POSITION',
      decisionReason: 'Weather or daylight margin is at a critical threshold. Verify conditions before committing.',
    };
  }

  if (params.routeConfidence === 'low' && params.terrainConfidence === 'poor') {
    return {
      recommendedDecision: 'scoutOnFoot',
      decisionLabel: 'SCOUT ON FOOT',
      actionLabel: 'SCOUT ON FOOT',
      decisionReason: 'Route confidence and terrain confidence are both limited. Scout before committing.',
    };
  }

  if (
    params.recoveryMargin === 'poor' ||
    params.remotenessLevel === 'extreme' ||
    (params.daylightMargin === 'caution' && params.weatherImpact === 'moderate')
  ) {
    return {
      recommendedDecision: 'rerouteRecommended',
      decisionLabel: 'REROUTE RECOMMENDED',
      actionLabel: 'REROUTE RECOMMENDED',
      decisionReason: 'Conditions suggest elevated recovery exposure on the current route.',
    };
  }

  const cautionCount = params.factors.filter((entry) => severityRank(entry.severity) >= severityRank(CAUTION)).length;
  const watchCount = params.factors.filter((entry) => entry.severity === WATCH || entry.severity === UNKNOWN).length;
  if (cautionCount > 0 || watchCount >= 3) {
    return {
      recommendedDecision: 'proceedWithCaution',
      decisionLabel: 'PROCEED WITH CAUTION',
      actionLabel: 'PROCEED WITH CAUTION',
      decisionReason: 'Mixed ECS signals are present. Continue only while verifying trail conditions.',
    };
  }

  return {
    recommendedDecision: 'proceed',
    decisionLabel: 'PROCEED',
    actionLabel: 'PROCEED - VERIFY CONDITIONS',
    decisionReason: 'Major ECS factors are within the current estimated confidence margin.',
  };
}

function resolveConfidencePercent(dataState: TrailDecisionDataState, factors: TrailDecisionFactor[]): number {
  if (dataState === 'setupNeeded') return 18;
  if (dataState === 'offline') return 32;
  const known = factors.filter((entry) => entry.severity !== UNKNOWN).length;
  const good = factors.filter((entry) => entry.severity === GOOD).length;
  const critical = factors.filter((entry) => entry.severity === CRITICAL).length;
  const caution = factors.filter((entry) => entry.severity === CAUTION).length;
  const coverage = known / Math.max(1, factors.length);
  const score = 40 + coverage * 35 + good * 4 - caution * 7 - critical * 12;
  const statePenalty = dataState === 'partial' ? 10 : dataState === 'estimated' ? 5 : 0;
  return Math.max(15, Math.min(92, Math.round(score - statePenalty)));
}

function resolveConfidenceLabel(dataState: TrailDecisionDataState, percent: number, missingInputs: string[]): string {
  if (dataState === 'live') return `Live ECS confidence ${percent}%`;
  if (dataState === 'estimated') return `Estimated ECS confidence ${percent}%`;
  if (dataState === 'offline') return 'Offline confidence limited';
  if (dataState === 'setupNeeded') return 'Setup needed';
  if (missingInputs.length) return `Partial confidence - missing ${missingInputs.slice(0, 2).join(', ')}`;
  return `Partial ECS confidence ${percent}%`;
}

export function normalizeTrailDecisionCommandData(
  snapshot: TrailDecisionCommandSnapshot = {},
): TrailDecisionCommandData {
  const location = normalizeLocation(snapshot.currentLocation);
  const routeProgress = snapshot.activeRouteProgress ?? null;
  const hasRoute = Boolean(routeProgress?.hasRoute);
  const distanceRemaining = finite(routeProgress?.remainingMiles);
  const environment = snapshot.environment ?? null;
  const sunlightNextEvent = environment?.sunlight.nextEvent ?? null;
  const sunlightRemainingMinutes = finite(environment?.sunlight.remainingMinutes);
  const daylightRemainingMinutes =
    sunlightNextEvent === 'sunset' ? sunlightRemainingMinutes : null;
  const daylightMargin = resolveDaylightMargin(sunlightRemainingMinutes, distanceRemaining, sunlightNextEvent);
  const weatherImpact = resolveWeatherImpact(snapshot.weather);
  const terrainConfidence = resolveTerrainConfidence(
    snapshot.remotenessIndex,
    routeProgress,
    snapshot.terrainAvailable,
  );
  const vehicleFit = resolveVehicleFit(snapshot.vehicleContext);
  const remotenessLevel = resolveRemotenessLevel(snapshot.remotenessIndex);
  const routeConfidence = resolveRouteConfidence(routeProgress);
  const isOffline = Boolean(snapshot.isOffline);
  const isUsingCachedData = Boolean(snapshot.isUsingCachedData || snapshot.weather?.source === 'cache_stale');
  const offlineRisk = resolveOfflineRisk({
    isOffline,
    isUsingCachedData,
    hasLocation: Boolean(location),
    hasRoute,
  });
  const recoveryMargin = resolveRecoveryMargin({
    vehicleFit,
    remotenessLevel,
    routeConfidence,
    offlineRisk,
    hasRoute,
  });

  const factors: TrailDecisionFactor[] = [
    factor(
      'daylightMargin',
      'Daylight Margin',
      sunlightNextEvent === 'sunrise' && sunlightRemainingMinutes != null
        ? `Night - ${formatMinutes(sunlightRemainingMinutes)} until sunrise`
        : daylightRemainingMinutes == null
          ? 'Unavailable'
          : `${formatMinutes(daylightRemainingMinutes)} daylight`,
      daylightMargin,
      environment?.sunlight.source === 'weather_provider' ? 'Weather solar time' : 'Sunlight estimate',
      environment?.sunlight.source !== 'weather_provider',
    ),
    factor(
      'weatherImpact',
      'Weather Impact',
      weatherImpact === 'unknown' ? 'Unavailable' : titleCase(weatherImpact),
      severityFromWeatherImpact(weatherImpact),
      snapshot.weather?.source === 'live' ? 'Live weather' : snapshot.weather ? titleCase(snapshot.weather.source) : 'Weather unavailable',
      snapshot.weather?.source !== 'live',
    ),
    factor(
      'vehicleFit',
      'Vehicle Fit',
      vehicleFit === 'unknown' ? 'Vehicle profile unavailable' : titleCase(vehicleFit),
      severityFromVehicleFit(vehicleFit),
      snapshot.vehicleContext?.hasVehicleContext ? 'Active Fleet vehicle' : 'Fleet setup needed',
      !snapshot.vehicleContext?.hasVehicleContext,
    ),
    factor(
      'terrainConfidence',
      'Terrain Confidence',
      terrainConfidence === 'unknown' ? 'Terrain unavailable' : titleCase(terrainConfidence),
      severityFromTerrain(terrainConfidence),
      snapshot.terrainSourceLabel ??
        (snapshot.remotenessIndex?.terrain?.complexity ? 'Remoteness terrain' : 'Terrain source unavailable'),
      terrainConfidence !== 'good',
    ),
    factor(
      'recoveryMargin',
      'Recovery Margin',
      recoveryMargin === 'unknown' ? 'Recovery margin unavailable' : titleCase(recoveryMargin),
      severityFromRecoveryMargin(recoveryMargin),
      'Route, vehicle, remoteness',
      recoveryMargin !== 'good',
    ),
    factor(
      'remoteness',
      'Remoteness',
      remotenessLevel === 'unknown' ? 'Unknown' : titleCase(remotenessLevel),
      severityFromRemoteness(remotenessLevel),
      snapshot.remotenessIndex?.isActive ? 'Remoteness index' : 'Remoteness unavailable',
      remotenessLevel === 'unknown' || snapshot.remotenessIndex?.confidence?.level !== 'high',
    ),
    factor(
      'routeConfidence',
      'Route Confidence',
      routeConfidence === 'unknown' ? 'Route unavailable' : titleCase(routeConfidence),
      severityFromRouteConfidence(routeConfidence),
      routeProgress?.sourceDetail ?? 'Route source unavailable',
      routeConfidence !== 'high',
    ),
    factor(
      'offlineRisk',
      'Offline Risk',
      titleCase(offlineRisk),
      severityFromOfflineRisk(offlineRisk),
      isOffline ? 'Connectivity offline' : isUsingCachedData ? 'Cached source mix' : 'Connectivity live',
      isOffline || isUsingCachedData,
    ),
  ];

  const missingInputs = resolveMissingInputs({
    hasLocation: Boolean(location),
    hasRoute,
    daylightMargin,
    weatherImpact,
    vehicleFit,
    terrainConfidence,
    remotenessLevel,
  });
  const hasEstimatedFactors = factors.some((entry) => entry.isEstimated && entry.severity !== UNKNOWN);
  const dataState = resolveDataState({
    hasLocation: Boolean(location),
    hasRoute,
    isOffline,
    isUsingCachedData,
    missingInputs,
    hasEstimatedFactors,
    hasLocationPermission: snapshot.hasLocationPermission ?? true,
  });
  const decision = buildDecision({
    dataState,
    hasRoute,
    daylightMargin,
    weatherImpact,
    terrainConfidence,
    vehicleFit,
    recoveryMargin,
    remotenessLevel,
    routeConfidence,
    offlineRisk,
    factors,
  });
  const confidencePercent = resolveConfidencePercent(dataState, factors);

  return {
    dataState,
    ...decision,
    confidencePercent,
    confidenceLabel: resolveConfidenceLabel(dataState, confidencePercent, missingInputs),
    currentLocation: location,
    currentHeadingDegrees: finite(snapshot.currentHeadingDegrees),
    routeActive: Boolean(routeProgress?.isActive),
    routeLabel: routeProgress?.routeLabel ?? null,
    distanceRemaining,
    distanceRemainingLabel: formatMiles(distanceRemaining),
    eta: routeProgress?.etaLabel && routeProgress.etaLabel !== '--' ? routeProgress.etaLabel : null,
    daylightRemainingMinutes,
    daylightMargin,
    weatherImpact,
    terrainConfidence,
    vehicleFit,
    recoveryMargin,
    remotenessLevel,
    routeConfidence,
    offlineRisk,
    missingInputs,
    factors,
    isOffline,
    isUsingCachedData,
    lastUpdatedAt: latestDate(snapshot.sourceUpdatedAt, snapshot.currentLocation?.updatedAt, routeProgress?.lastUpdated),
  };
}
