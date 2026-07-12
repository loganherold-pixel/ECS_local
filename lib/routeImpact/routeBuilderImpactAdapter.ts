import type { CampOpsConfidence, CampOpsRouteEndpointRole } from '../campops/campOpsTypes';
import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';
import {
  deriveOfflineReadiness,
  type OfflineReadinessInput,
  type OfflineReadinessResult,
} from '../offlineReadinessPresentation';
import {
  normalizeSourceTruthConfidence,
  sanitizeSourceTruthDisplayText,
  type SourceTruthConfidence,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';
import {
  compareRoutePlans,
  type RouteImpactCategory,
  type RouteImpactMeasure,
  type RouteImpactPlan,
  type RouteImpactResult,
} from './routeChangeImpact';

export interface RouteBuilderImpactSegment {
  id: string;
  coordinates: Array<[number, number] | { latitude?: number; longitude?: number }>;
  snapConfidence?: 'high' | 'medium' | 'low' | null;
  snapSource?: string | null;
  snapStatus?: string | null;
  snapProvider?: string | null;
  buildSource?: {
    kind?: string | null;
    sourceLabel?: string | null;
    confidence?: string | null;
    dataState?: string | null;
    warnings?: string[] | null;
  } | null;
}

export interface RouteBuilderImpactVehicleContext {
  activeVehicleId?: string | null;
  vehicleLabel?: string | null;
  currentFuelGallons?: number | null;
  averageMpg?: number | null;
  updatedAt?: string | null;
  confidence?: SourceTruthConfidence | string | null;
  vehicleFitLabel?: string | null;
  trailerAttached?: boolean | null;
}

export interface RouteBuilderImpactWeatherContext {
  source?: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null;
  observedAt?: string | number | null;
  hasData?: boolean;
  worstHazard?: 'clear' | 'caution' | 'warning' | 'hazardous' | null;
}

export interface RouteBuilderImpactCampContext {
  selectedEndpointId?: string | null;
  selectedRole?: CampOpsRouteEndpointRole | null;
  generatedAt?: string | null;
  confidence?: CampOpsConfidence | null;
}

export interface RouteBuilderImpactConvoyContext {
  active?: boolean;
  memberCount?: number | null;
  etaSpreadSeconds?: number | null;
  observedAt?: string | null;
  stale?: boolean;
}

export type RouteBuilderImpactOfflineContext = Omit<
  OfflineReadinessInput,
  'currentRouteContext'
>;

export interface BuildRouteBuilderImpactPreviewInput {
  baseline: NavigateRouteSessionSnapshot | null | undefined;
  candidate: {
    id?: string | null;
    label?: string | null;
    segments: RouteBuilderImpactSegment[];
    activeGuidanceExtension?: boolean;
  };
  vehicle?: RouteBuilderImpactVehicleContext | null;
  weather?: RouteBuilderImpactWeatherContext | null;
  campContext?: RouteBuilderImpactCampContext | null;
  convoy?: RouteBuilderImpactConvoyContext | null;
  offline?: RouteBuilderImpactOfflineContext | null;
  mapStyle?: string | null;
  now?: string | number | Date | null;
}

export interface RouteBuilderImpactPreviewModel {
  result: RouteImpactResult;
  activeGuidanceProtected: boolean;
  activeGuidanceMessage: string | null;
  routeEndpointsComparable: boolean;
  routeEndpointsMessage: string | null;
  canContinueToSave: boolean;
}

type Coordinate = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
const ENDPOINT_MATCH_MAX_METERS = 1_000;

function nowMs(value: BuildRouteBuilderImpactPreviewInput['now']): number {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function finite(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positive(value: unknown): number | null {
  const numeric = finite(value);
  return numeric != null && numeric > 0 ? numeric : null;
}

function coordinate(value: unknown): Coordinate | null {
  const input = value as [number, number] | { latitude?: number; longitude?: number; lat?: number; lng?: number };
  const lat = Array.isArray(input) ? finite(input[1]) : finite(input?.latitude ?? input?.lat);
  const lng = Array.isArray(input) ? finite(input[0]) : finite(input?.longitude ?? input?.lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function lineDistanceMeters(points: Coordinate[]): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}

function segmentCoordinates(segments: RouteBuilderImpactSegment[]): Coordinate[] {
  const output: Coordinate[] = [];
  for (const segment of segments) {
    for (const raw of segment.coordinates ?? []) {
      const point = coordinate(raw);
      if (!point) continue;
      const previous = output[output.length - 1];
      if (!previous || distanceMeters(previous, point) > 0.05) output.push(point);
    }
  }
  return output;
}

function baselineCoordinates(snapshot: NavigateRouteSessionSnapshot | null | undefined): Coordinate[] {
  return (snapshot?.routePoints ?? [])
    .map((point) => coordinate(point))
    .filter((point): point is Coordinate => !!point);
}

function hash(value: string): string {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return (output >>> 0).toString(36);
}

function geometryFingerprint(points: Coordinate[]): string {
  const sampled = points.filter((_, index) =>
    index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 12)) === 0,
  );
  return hash(`${points.length}:${sampled.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join(';')}`);
}

function routeBuilderConfidence(segments: RouteBuilderImpactSegment[]): SourceTruthConfidence {
  const rank: Record<SourceTruthConfidence, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
  let weakest: SourceTruthConfidence = 'high';
  for (const segment of segments) {
    const confidence = normalizeSourceTruthConfidence(
      segment.snapConfidence ?? segment.buildSource?.confidence,
    );
    if (rank[confidence] < rank[weakest]) weakest = confidence;
  }
  return segments.length > 0 ? weakest : 'unknown';
}

function safeProviderLabel(segments: RouteBuilderImpactSegment[]): string | null {
  const labels = Array.from(new Set(segments.flatMap((segment) => [
    segment.buildSource?.sourceLabel,
    segment.snapSource,
    segment.snapProvider,
  ]).map((value) => sanitizeSourceTruthDisplayText(value, 80))
    .filter((value): value is string => !!value && value !== '[redacted]')));
  return labels.slice(0, 3).join(', ') || null;
}

function source(
  id: string,
  input: Partial<SourceTruthRef> & Pick<SourceTruthRef, 'origin' | 'confidence'>,
): SourceTruthRef {
  return {
    id,
    origin: input.origin,
    authority: input.authority ?? null,
    provider: input.provider ?? null,
    observedAt: input.observedAt ?? null,
    fetchedAt: input.fetchedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    confidence: input.confidence,
    coverage: input.coverage ?? 'unknown',
    availability: input.availability ?? (input.origin === 'unavailable' ? 'unavailable' : 'usable'),
    conflict: input.conflict ?? false,
    warningCodes: [...(input.warningCodes ?? [])],
  };
}

function unavailableSource(id: string, warningCode: string): SourceTruthRef {
  return source(id, {
    origin: 'unavailable',
    confidence: 'unknown',
    coverage: 'unknown',
    availability: 'unavailable',
    warningCodes: [warningCode],
  });
}

function measure(input: {
  value: number | null;
  displayValue: string | null;
  unit?: string | null;
  preference: RouteImpactMeasure['preference'];
  sourceTruth: SourceTruthRef;
  policyKey?: SourceTruthPolicyKey;
  missingInputs?: string[];
  requiredForSafety?: boolean;
  detail?: string | null;
}): RouteImpactMeasure {
  return {
    value: input.value,
    displayValue: input.displayValue,
    unit: input.unit ?? null,
    preference: input.preference,
    sourceTruth: input.sourceTruth,
    freshnessPolicyKey: input.policyKey ?? 'default',
    missingInputs: input.missingInputs ?? [],
    requiredForSafety: input.requiredForSafety ?? false,
    detail: input.detail ?? null,
  };
}

function formatMiles(meters: number | null): string | null {
  return meters == null ? null : `${(meters / 1609.344).toFixed(meters < 16_093 ? 1 : 0)} mi`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatArrival(epochSeconds: number | null): string | null {
  if (epochSeconds == null) return null;
  const date = new Date(epochSeconds * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function endpointsComparable(
  baseline: NavigateRouteSessionSnapshot | null | undefined,
  baselinePoints: Coordinate[],
  candidatePoints: Coordinate[],
  extension: boolean,
): boolean {
  if (extension) return !!baseline?.routeId && candidatePoints.length > 1;
  if (!baseline?.routeId || baselinePoints.length < 2 || candidatePoints.length < 2) return false;
  const baselineStart = baseline.currentLocation
    ? coordinate(baseline.currentLocation)
    : baselinePoints[0];
  const baselineEnd = baselinePoints[baselinePoints.length - 1];
  if (!baselineStart || !baselineEnd) return false;
  return distanceMeters(baselineStart, candidatePoints[0]) <= ENDPOINT_MATCH_MAX_METERS &&
    distanceMeters(baselineEnd, candidatePoints[candidatePoints.length - 1]) <= ENDPOINT_MATCH_MAX_METERS;
}

function latestOfflineObservedAt(input: RouteBuilderImpactOfflineContext | null | undefined): string | null {
  const values = [
    ...(input?.downloadedRoutes ?? []).map((route) => route.cachedAt),
    ...(input?.tileRegions ?? []).flatMap((region) => [
      (region as { lastVerifiedAt?: string }).lastVerifiedAt,
      (region as { completedAt?: string }).completedAt,
      (region as { downloadedAt?: string }).downloadedAt,
    ]),
  ].filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)));
  return values.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function offlineValue(result: OfflineReadinessResult): number | null {
  if (result.level === 'ready') return 100;
  if (result.level === 'not_ready') return 0;
  if (result.level !== 'partial') return null;
  const match = `${result.label ?? ''} ${result.reason}`.match(/\b(\d{1,3})\s*%/);
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function offlineMeasure(
  id: string,
  result: OfflineReadinessResult | null,
  observedAt: string | null,
): RouteImpactMeasure {
  const unavailable = !result || result.level === 'unknown';
  return measure({
    value: result ? offlineValue(result) : null,
    displayValue: result?.label ?? (result ? result.level.replace('_', ' ') : 'Unknown'),
    unit: '%',
    preference: 'higher_is_better',
    sourceTruth: unavailable
      ? unavailableSource(id, 'offline_route_coverage_unknown')
      : source(id, {
          origin: 'cached',
          authority: 'ECS Offline Readiness',
          provider: 'Local route and tile package',
          observedAt,
          confidence: result.level === 'ready' ? 'high' : 'medium',
          coverage: result.level === 'ready' ? 'complete' : 'partial',
          availability: result.level === 'not_ready' ? 'degraded' : 'usable',
          warningCodes: result.staleAssets.length > 0 ? ['offline_package_stale_assets'] : [],
        }),
    policyKey: 'offline_map_route_package',
    missingInputs: unavailable
      ? ['route-matched offline package status']
      : result?.level === 'partial' && offlineValue(result) == null
        ? ['numeric offline coverage for the partial package']
        : [],
    requiredForSafety: true,
    detail: result?.reason ?? null,
  });
}

function weatherOrigin(value: RouteBuilderImpactWeatherContext['source']): SourceTruthOrigin {
  if (value === 'live') return 'live';
  if (value === 'cache_fresh' || value === 'cache_stale') return 'cached';
  return 'unavailable';
}

function weatherScore(value: RouteBuilderImpactWeatherContext['worstHazard']): number | null {
  if (value === 'clear') return 4;
  if (value === 'caution') return 3;
  if (value === 'warning') return 2;
  if (value === 'hazardous') return 1;
  return null;
}

function campScore(role: CampOpsRouteEndpointRole | null | undefined): number | null {
  if (role === 'primary') return 4;
  if (role === 'backup') return 3;
  if (role === 'emergency') return 2;
  return null;
}

function vehicleFitScore(label: string | null | undefined): number | null {
  const normalized = String(label ?? '').toLowerCase();
  if (/excellent|strong|good/.test(normalized)) return 4;
  if (/adequate|moderate/.test(normalized)) return 3;
  if (/limited|caution/.test(normalized)) return 2;
  if (/poor|challenging|exceeds|critical/.test(normalized)) return 1;
  return null;
}

function vehicleProfileConfidence(value: string | null | undefined): SourceTruthConfidence {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'verified') return 'high';
  return normalizeSourceTruthConfidence(value);
}

function emptyOperationalMeasure(
  category: RouteImpactCategory,
  routeRole: 'baseline' | 'candidate',
  missing: string,
  options?: { required?: boolean; policyKey?: SourceTruthPolicyKey },
): RouteImpactMeasure {
  return measure({
    value: null,
    displayValue: 'Unknown',
    preference: category === 'terrain_exposure' || category === 'convoy_eta_spread'
      ? 'lower_is_better'
      : 'higher_is_better',
    sourceTruth: unavailableSource(
      `route-impact:${routeRole}:${category}`,
      `${routeRole}_${category}_unavailable`,
    ),
    policyKey: options?.policyKey ?? 'default',
    missingInputs: [missing],
    requiredForSafety: options?.required ?? false,
  });
}

function planBase(id: string, label: string, kind: RouteImpactPlan['kind'], geometryId: string): RouteImpactPlan {
  return {
    id,
    label,
    kind,
    geometryFingerprint: geometryId,
    measures: {},
    warnings: [],
  };
}

export function buildRouteBuilderImpactPreview(
  input: BuildRouteBuilderImpactPreviewInput,
): RouteBuilderImpactPreviewModel {
  const generatedAtMs = nowMs(input.now);
  const generatedAt = new Date(generatedAtMs).toISOString();
  const baseline = input.baseline ?? null;
  const baselinePoints = baselineCoordinates(baseline);
  const candidatePoints = segmentCoordinates(input.candidate.segments);
  const candidateGeometryId = geometryFingerprint(candidatePoints);
  const extension = input.candidate.activeGuidanceExtension === true;
  const endpointsMatch = endpointsComparable(baseline, baselinePoints, candidatePoints, extension);
  const endpointMissing = endpointsMatch
    ? []
    : [baseline?.routeId
        ? 'candidate start and destination matching the baseline route'
        : 'an active or preview baseline route'];

  const baselineDistance = positive(baseline?.remainingDistanceM) ?? lineDistanceMeters(baselinePoints);
  const builtDistance = lineDistanceMeters(candidatePoints);
  const candidateDistance = extension && baselineDistance != null && builtDistance != null
    ? baselineDistance + builtDistance
    : builtDistance;
  const baselineDuration = positive(baseline?.remainingDurationS);
  const baselineSpeed = baselineDistance != null && baselineDuration != null
    ? baselineDistance / baselineDuration
    : null;
  const plausibleSpeed = baselineSpeed != null && baselineSpeed >= 0.3 && baselineSpeed <= 60
    ? baselineSpeed
    : null;
  const builtDuration = builtDistance != null && plausibleSpeed != null
    ? builtDistance / plausibleSpeed
    : null;
  const candidateDuration = extension && baselineDuration != null && builtDuration != null
    ? baselineDuration + builtDuration
    : builtDuration;
  const baselineEtaMs = baseline?.etaIso ? Date.parse(baseline.etaIso) : NaN;
  const baselineArrival = Number.isFinite(baselineEtaMs)
    ? baselineEtaMs / 1000
    : baselineDuration != null
      ? (generatedAtMs + baselineDuration * 1000) / 1000
      : null;
  const candidateArrival = candidateDuration != null
    ? (generatedAtMs + candidateDuration * 1000) / 1000
    : null;

  const baselineRouteSource = baseline?.routeId
    ? source(`route-session:${baseline.routeId}`, {
        origin: baseline.lifecycle === 'active' ? 'live' : 'cached',
        authority: 'ECS Navigate Route Session',
        provider: baseline.source,
        observedAt: baseline.updatedAt,
        confidence: baseline.routePoints.length > 1 ? 'high' : 'medium',
        coverage: baseline.routePoints.length > 1 ? 'complete' : 'partial',
        availability: 'usable',
        warningCodes: baseline.isOffRoute ? ['active_route_off_route'] : [],
      })
    : unavailableSource('route-session:missing', 'baseline_route_unavailable');
  const routeBuilderSource = candidatePoints.length > 1
    ? source(`route-builder:${candidateGeometryId}`, {
        origin: 'manual',
        authority: 'Operator route builder',
        provider: safeProviderLabel(input.candidate.segments),
        observedAt: generatedAt,
        confidence: routeBuilderConfidence(input.candidate.segments),
        coverage: input.candidate.segments.every((segment) => segment.snapStatus === 'snapped')
          ? 'complete'
          : 'partial',
        availability: 'usable',
        warningCodes: Array.from(new Set(input.candidate.segments.flatMap((segment) => [
          ...(segment.buildSource?.warnings ?? []),
          segment.snapStatus && segment.snapStatus !== 'snapped'
            ? `route_builder_${segment.snapStatus}`
            : null,
        ].filter((value): value is string => !!value)))),
      })
    : unavailableSource('route-builder:missing', 'candidate_route_geometry_unavailable');
  const estimatedTimingSource = candidateDuration != null
    ? source(`route-builder-timing:${candidateGeometryId}`, {
        origin: 'estimated',
        authority: 'ECS deterministic route impact adapter',
        provider: 'Baseline pace projection',
        observedAt: generatedAt,
        confidence: 'low',
        coverage: 'partial',
        availability: 'degraded',
        warningCodes: ['candidate_duration_estimated_from_baseline_pace'],
      })
    : unavailableSource('route-builder-timing:missing', 'candidate_duration_unavailable');

  const baselinePlan = planBase(
    baseline?.routeId ?? 'baseline-route-unavailable',
    baseline?.routeTitle ?? 'Current route',
    baseline?.lifecycle === 'active' ? 'active' : 'baseline',
    geometryFingerprint(baselinePoints),
  );
  const candidatePlan = planBase(
    input.candidate.id?.trim() || `route-builder:${candidateGeometryId}`,
    input.candidate.label?.trim() || (extension ? 'Active route with extension' : 'Built route'),
    'route_builder',
    candidateGeometryId,
  );

  baselinePlan.measures.distance = measure({
    value: baselineDistance,
    displayValue: formatMiles(baselineDistance),
    unit: 'm',
    preference: 'lower_is_better',
    sourceTruth: baselineRouteSource,
    missingInputs: baselineDistance == null ? ['baseline route distance'] : [],
  });
  candidatePlan.measures.distance = measure({
    value: candidateDistance,
    displayValue: formatMiles(candidateDistance),
    unit: 'm',
    preference: 'lower_is_better',
    sourceTruth: routeBuilderSource,
    policyKey: 'manual_user_state',
    missingInputs: [
      ...(candidateDistance == null ? ['candidate route geometry'] : []),
      ...endpointMissing,
    ],
  });

  baselinePlan.measures.drive_time = measure({
    value: baselineDuration,
    displayValue: formatDuration(baselineDuration),
    unit: 's',
    preference: 'lower_is_better',
    sourceTruth: baselineRouteSource,
    missingInputs: baselineDuration == null ? ['baseline route duration'] : [],
  });
  candidatePlan.measures.drive_time = measure({
    value: candidateDuration,
    displayValue: formatDuration(candidateDuration),
    unit: 's',
    preference: 'lower_is_better',
    sourceTruth: estimatedTimingSource,
    missingInputs: [
      ...(candidateDuration == null ? ['provider duration or a valid baseline pace'] : []),
      ...endpointMissing,
    ],
  });

  baselinePlan.measures.arrival_time = measure({
    value: baselineArrival,
    displayValue: formatArrival(baselineArrival),
    unit: 'epoch s',
    preference: 'lower_is_better',
    sourceTruth: baselineRouteSource,
    missingInputs: baselineArrival == null ? ['baseline arrival time'] : [],
  });
  candidatePlan.measures.arrival_time = measure({
    value: candidateArrival,
    displayValue: formatArrival(candidateArrival),
    unit: 'epoch s',
    preference: 'lower_is_better',
    sourceTruth: estimatedTimingSource,
    missingInputs: [
      ...(candidateArrival == null ? ['candidate route duration'] : []),
      ...endpointMissing,
    ],
  });

  const vehicleConfidence = vehicleProfileConfidence(input.vehicle?.confidence);
  const vehicleSource = input.vehicle?.activeVehicleId
    ? source(`vehicle-profile:${input.vehicle.activeVehicleId}`, {
        origin: 'manual',
        authority: 'ECS Fleet vehicle profile',
        provider: null,
        observedAt: input.vehicle.updatedAt ?? null,
        confidence: vehicleConfidence,
        coverage: 'partial',
        availability: 'usable',
        warningCodes: ['vehicle_profile_manual_configuration'],
      })
    : unavailableSource('vehicle-profile:missing', 'active_vehicle_profile_unavailable');
  const fuelRangeMiles = positive(input.vehicle?.currentFuelGallons) != null && positive(input.vehicle?.averageMpg) != null
    ? (positive(input.vehicle?.currentFuelGallons) as number) * (positive(input.vehicle?.averageMpg) as number)
    : null;
  const fuelMissing = fuelRangeMiles == null
    ? ['current fuel gallons and verified or manual average MPG']
    : [];
  const baselineFuelMargin = fuelRangeMiles != null && baselineDistance != null
    ? fuelRangeMiles - baselineDistance / 1609.344
    : null;
  const candidateFuelMargin = fuelRangeMiles != null && candidateDistance != null
    ? fuelRangeMiles - candidateDistance / 1609.344
    : null;
  baselinePlan.measures.fuel_margin = measure({
    value: baselineFuelMargin,
    displayValue: baselineFuelMargin == null ? null : `${baselineFuelMargin.toFixed(0)} mi`,
    unit: 'mi',
    preference: 'higher_is_better',
    sourceTruth: vehicleSource,
    policyKey: 'vehicle_profile',
    missingInputs: [...fuelMissing, ...(baselineDistance == null ? ['baseline route distance'] : [])],
    requiredForSafety: true,
  });
  candidatePlan.measures.fuel_margin = measure({
    value: candidateFuelMargin,
    displayValue: candidateFuelMargin == null ? null : `${candidateFuelMargin.toFixed(0)} mi`,
    unit: 'mi',
    preference: 'higher_is_better',
    sourceTruth: vehicleSource,
    policyKey: 'vehicle_profile',
    missingInputs: [
      ...fuelMissing,
      ...(candidateDistance == null ? ['candidate route distance'] : []),
      ...endpointMissing,
    ],
    requiredForSafety: true,
  });

  const vehicleFit = vehicleFitScore(input.vehicle?.vehicleFitLabel);
  baselinePlan.measures.vehicle_fit = measure({
    value: vehicleFit,
    displayValue: input.vehicle?.vehicleFitLabel ?? null,
    preference: 'higher_is_better',
    sourceTruth: vehicleSource,
    policyKey: 'vehicle_profile',
    missingInputs: vehicleFit == null ? ['baseline route vehicle-fit assessment'] : [],
    requiredForSafety: true,
  });
  candidatePlan.measures.vehicle_fit = emptyOperationalMeasure(
    'vehicle_fit',
    'candidate',
    'candidate corridor clearance, surface, grade, and vehicle constraint evidence',
    { required: true, policyKey: 'vehicle_profile' },
  );

  const candidateWeatherSource = unavailableSource(
    'route-impact:candidate:weather',
    'candidate_weather_corridor_unavailable',
  );
  const baselineWeatherScore = input.weather?.hasData ? weatherScore(input.weather.worstHazard) : null;
  const weatherObservedAt = typeof input.weather?.observedAt === 'number'
    ? new Date(input.weather.observedAt).toISOString()
    : input.weather?.observedAt ?? null;
  const baselineWeatherSource = input.weather?.hasData
    ? source('active-route-weather-corridor', {
        origin: weatherOrigin(input.weather.source),
        authority: 'ECS Weather Pipeline',
        provider: input.weather.source,
        observedAt: weatherObservedAt,
        fetchedAt: weatherObservedAt,
        confidence: 'medium',
        coverage: 'partial',
        availability: input.weather.source === 'cache_stale' ? 'degraded' : 'usable',
        warningCodes: input.weather.source === 'cache_stale' ? ['weather_cache_stale'] : [],
      })
    : unavailableSource('active-route-weather-corridor', 'baseline_weather_corridor_unavailable');
  baselinePlan.measures.weather_exposure = measure({
    value: baselineWeatherScore,
    displayValue: input.weather?.hasData && input.weather.worstHazard
      ? input.weather.worstHazard.replace('_', ' ')
      : null,
    preference: 'higher_is_better',
    sourceTruth: baselineWeatherSource,
    policyKey: 'weather_forecast',
    missingInputs: baselineWeatherScore == null ? ['baseline route weather corridor'] : [],
    requiredForSafety: true,
  });
  candidatePlan.measures.weather_exposure = measure({
    value: null,
    displayValue: 'Unknown',
    preference: 'higher_is_better',
    sourceTruth: candidateWeatherSource,
    policyKey: 'weather_forecast',
    missingInputs: ['candidate route weather corridor'],
    requiredForSafety: true,
  });

  const offlineObservedAt = latestOfflineObservedAt(input.offline);
  const baselineOffline = baseline?.routeId
    ? deriveOfflineReadiness({
        ...(input.offline ?? {}),
        currentRouteContext: {
          routeId: baseline.routeId,
          destination: baselinePoints.length > 0
            ? baselinePoints[baselinePoints.length - 1]
            : null,
          geometry: baselinePoints,
          mapStyle: input.mapStyle ?? null,
          requiredLayers: ['route-corridor'],
        },
      })
    : null;
  const candidateOffline = candidatePoints.length > 1
    ? deriveOfflineReadiness({
        ...(input.offline ?? {}),
        currentRouteContext: {
          routeId: `route-builder:${candidateGeometryId}`,
          destination: candidatePoints[candidatePoints.length - 1],
          geometry: candidatePoints,
          mapStyle: input.mapStyle ?? null,
          requiredLayers: ['route-corridor'],
        },
      })
    : null;
  baselinePlan.measures.offline_coverage = offlineMeasure(
    'offline-package:baseline-route',
    baselineOffline,
    offlineObservedAt,
  );
  candidatePlan.measures.offline_coverage = offlineMeasure(
    'offline-package:candidate-route',
    candidateOffline,
    offlineObservedAt,
  );

  const selectedCampScore = campScore(input.campContext?.selectedRole);
  const campSource = input.campContext?.selectedEndpointId
    ? source(`campops-endpoint:${input.campContext.selectedEndpointId}`, {
        origin: 'inferred',
        authority: 'Deterministic CampOps engine',
        provider: 'CampOps route endpoint plan',
        observedAt: input.campContext.generatedAt ?? null,
        confidence: normalizeSourceTruthConfidence(input.campContext.confidence),
        coverage: 'partial',
        availability: 'usable',
        warningCodes: [],
      })
    : unavailableSource('campops-endpoint:missing', 'baseline_camp_endpoint_unavailable');
  baselinePlan.measures.camp_viability = measure({
    value: selectedCampScore,
    displayValue: input.campContext?.selectedRole
      ? `${input.campContext.selectedRole} endpoint`
      : null,
    preference: 'higher_is_better',
    sourceTruth: campSource,
    policyKey: 'camp_provider_availability',
    missingInputs: selectedCampScore == null ? ['baseline CampOps endpoint role and viability'] : [],
    requiredForSafety: true,
  });
  candidatePlan.measures.camp_viability = emptyOperationalMeasure(
    'camp_viability',
    'candidate',
    'CampOps candidate-route endpoint evaluation',
    { required: true, policyKey: 'camp_provider_availability' },
  );

  const requiredUnknowns: Array<{
    category: RouteImpactCategory;
    missing: string;
    policyKey?: SourceTruthPolicyKey;
    required?: boolean;
  }> = [
    { category: 'daylight_margin', missing: 'candidate arrival daylight or sunset window', required: true },
    { category: 'water_margin', missing: 'route-specific water consumption and reserve model', required: true },
    { category: 'power_runtime', missing: 'route-specific power load and runtime model', required: false },
    { category: 'terrain_exposure', missing: 'candidate corridor terrain exposure', required: true },
    { category: 'legal_access', missing: 'candidate legal and access evidence', policyKey: 'route_legal_access_evidence', required: true },
    { category: 'current_conditions', missing: 'candidate closure and current-condition advisory', policyKey: 'condition_closure_advisory', required: true },
    { category: 'bailout_access', missing: 'candidate corridor bailout and recovery routing', required: true },
    { category: 'resupply_opportunities', missing: 'candidate corridor resupply discovery', required: false },
  ];
  for (const item of requiredUnknowns) {
    baselinePlan.measures[item.category] = emptyOperationalMeasure(
      item.category,
      'baseline',
      item.missing.replace('candidate', 'baseline'),
      { required: item.required, policyKey: item.policyKey },
    );
    candidatePlan.measures[item.category] = emptyOperationalMeasure(
      item.category,
      'candidate',
      item.missing,
      { required: item.required, policyKey: item.policyKey },
    );
  }

  if (input.vehicle?.trailerAttached !== false) {
    const trailerMissing = input.vehicle?.trailerAttached === true
      ? 'candidate route trailer constraints'
      : 'trailer attachment state and candidate route constraints';
    baselinePlan.measures.trailer_fit = emptyOperationalMeasure(
      'trailer_fit',
      'baseline',
      trailerMissing.replace('candidate', 'baseline'),
      { required: true, policyKey: 'vehicle_profile' },
    );
    candidatePlan.measures.trailer_fit = emptyOperationalMeasure(
      'trailer_fit',
      'candidate',
      trailerMissing,
      { required: true, policyKey: 'vehicle_profile' },
    );
  }

  if (input.convoy?.active) {
    const convoySource = input.convoy.observedAt
      ? source('convoy-route-eta-spread', {
          origin: input.convoy.stale ? 'cached' : 'live',
          authority: 'ECS Convoy Tracking',
          provider: null,
          observedAt: input.convoy.observedAt,
          confidence: input.convoy.stale ? 'low' : 'medium',
          coverage: input.convoy.memberCount && input.convoy.memberCount > 1 ? 'partial' : 'unknown',
          availability: input.convoy.stale ? 'degraded' : 'usable',
          warningCodes: input.convoy.stale ? ['convoy_location_stale'] : [],
        })
      : unavailableSource('convoy-route-eta-spread', 'convoy_eta_spread_unavailable');
    baselinePlan.measures.convoy_eta_spread = measure({
      value: finite(input.convoy.etaSpreadSeconds),
      displayValue: formatDuration(finite(input.convoy.etaSpreadSeconds)),
      unit: 's',
      preference: 'lower_is_better',
      sourceTruth: convoySource,
      policyKey: 'convoy_member_location',
      missingInputs: finite(input.convoy.etaSpreadSeconds) == null ? ['baseline convoy ETA spread'] : [],
      requiredForSafety: true,
    });
    candidatePlan.measures.convoy_eta_spread = emptyOperationalMeasure(
      'convoy_eta_spread',
      'candidate',
      'candidate-route ETA for each convoy member',
      { required: true, policyKey: 'convoy_member_location' },
    );
  }

  baselinePlan.warnings = baseline?.isOffRoute ? ['Baseline guidance is currently off route.'] : [];
  candidatePlan.warnings = [
    ...(!endpointsMatch ? ['Route endpoints do not match the baseline closely enough for direct metric conclusions.'] : []),
    'Saving this route does not accept it or replace active guidance.',
  ];

  const result = compareRoutePlans({
    baseline: baselinePlan,
    candidate: candidatePlan,
    now: generatedAtMs,
  });
  const activeGuidanceProtected = baseline?.lifecycle === 'active';

  return {
    result,
    activeGuidanceProtected,
    activeGuidanceMessage: activeGuidanceProtected
      ? 'Active guidance remains unchanged. Previewing or starting this saved route later still requires the existing replacement confirmation.'
      : null,
    routeEndpointsComparable: endpointsMatch,
    routeEndpointsMessage: endpointsMatch
      ? null
      : baseline?.routeId
        ? 'The built route does not share the active route start and destination closely enough for direct distance, timing, or resource conclusions.'
        : 'No active or preview route is available as a comparison baseline.',
    canContinueToSave: candidatePoints.length > 1,
  };
}
