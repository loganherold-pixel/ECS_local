import {
  normalizeSourceTruthConfidence,
  normalizeSourceTruthOrigin,
  type SourceTruthConfidence,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';
import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';
import type { ConvoyCommandData } from '../navigation/convoyCommandData';
import {
  DEFAULT_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSION,
  type DepartureDeltaComparableField,
  type DepartureDeltaPreviousAuditSnapshot,
} from './departureDeltaBrief';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessInput,
  ExpeditionReadinessSourceKind,
  ExpeditionReadinessVehicleInput,
} from './expeditionReadinessTypes';
import {
  OPERATIONAL_DELTA_SCHEMA_VERSION,
  type OperationalDeltaBaselineKind,
  type OperationalDeltaDirection,
  type OperationalDeltaDomain,
  type OperationalDeltaSeverity,
  type OperationalDeltaThresholdKey,
  type OperationalSnapshot,
  type OperationalSnapshotFact,
  type OperationalSnapshotFactKind,
  type OperationalSnapshotValue,
} from './operationalDeltaBrief';

export type BuildOperationalSnapshotFromReadinessInput = {
  assessment: ExpeditionReadinessAssessment | null;
  input: ExpeditionReadinessInput;
  routeSession: NavigateRouteSessionSnapshot;
  activeVehicle?: ExpeditionReadinessVehicleInput | null;
  convoy?: ConvoyCommandData | null;
  expeditionId?: string | null;
  routeId?: string | null;
  capturedAt?: string | null;
  baselineKind?: OperationalDeltaBaselineKind | null;
  label?: string | null;
};

type SourceInput = {
  id: string;
  source?: string | null;
  authority?: string | null;
  provider?: string | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  confidence?: string | null;
  stale?: boolean;
  missing?: boolean;
  partial?: boolean;
  conflict?: boolean;
  warningCodes?: string[];
};

type FactInput = {
  id: string;
  domain: OperationalDeltaDomain;
  label: string;
  kind: OperationalSnapshotFactKind;
  value: OperationalSnapshotValue;
  displayValue?: string | null;
  unit?: string | null;
  thresholdKey?: OperationalDeltaThresholdKey | null;
  direction?: OperationalDeltaDirection;
  rank?: number | null;
  required?: boolean;
  severityOnWorsen?: OperationalDeltaSeverity;
  severityOnMissing?: OperationalDeltaSeverity;
  blockerSeverity?: OperationalDeltaSeverity;
  recommendedAction?: string | null;
  source: SourceInput;
  policyKey: SourceTruthPolicyKey;
  dependencies?: string[];
};

const STATUS_RANK = {
  unknown: 0,
  unavailable: 0,
  missing: 0,
  critical: 1,
  hold: 1,
  unsafe: 1,
  closed: 1,
  caution: 2,
  watch: 3,
  partial: 2,
  low: 1,
  moderate: 2,
  medium: 2,
  high: 3,
  normal: 4,
  ready: 4,
  go: 4,
  safe: 4,
  complete: 4,
  live: 4,
  checkin: 3,
  planned: 2,
  offline: 1,
  setupneeded: 0,
} as const;

function validIso(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function nowIso(candidate?: string | null): string {
  return validIso(candidate) ? candidate : new Date().toISOString();
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 180) : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sourceOrigin(source: unknown): SourceTruthOrigin {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (normalized === 'usermanual' || normalized === 'manual') return 'manual';
  if (normalized === 'livegps' || normalized === 'vehicleobd' || normalized === 'satellite') return 'live';
  if (normalized === 'cache_fresh' || normalized === 'cache_stale') return 'cached';
  if (normalized === 'mock' || normalized === 'demo') return 'simulated';
  return normalizeSourceTruthOrigin(source);
}

function sourceConfidence(value: unknown): SourceTruthConfidence {
  return normalizeSourceTruthConfidence(value);
}

function buildSourceTruthRef(input: SourceInput): SourceTruthRef {
  const origin = sourceOrigin(input.source);
  const unavailable = input.missing === true || origin === 'unavailable';
  const warningCodes = [
    ...(input.warningCodes ?? []),
    input.stale ? 'operational_delta_source_stale' : null,
    input.partial ? 'operational_delta_source_partial' : null,
    unavailable ? 'operational_delta_source_unavailable' : null,
    origin === 'cached' ? 'operational_delta_source_cached' : null,
    origin === 'manual' ? 'operational_delta_source_manual' : null,
    origin === 'estimated' ? 'operational_delta_source_estimated' : null,
    origin === 'inferred' ? 'operational_delta_source_inferred' : null,
    origin === 'simulated' ? 'operational_delta_source_simulated' : null,
    input.conflict ? 'operational_delta_source_conflict' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    id: clean(input.id) ?? 'operational-delta-source',
    origin,
    authority: clean(input.authority),
    provider: clean(input.provider),
    observedAt: validIso(input.observedAt) ? input.observedAt : input.observedAt ?? null,
    fetchedAt: null,
    expiresAt: validIso(input.expiresAt) ? input.expiresAt : input.expiresAt ?? null,
    confidence: sourceConfidence(input.confidence),
    coverage: unavailable ? 'unknown' : input.partial ? 'partial' : 'complete',
    availability: unavailable ? 'unavailable' : input.stale || input.partial ? 'degraded' : 'usable',
    conflict: input.conflict === true,
    warningCodes: Array.from(new Set(warningCodes)),
  };
}

function fact(input: FactInput): OperationalSnapshotFact {
  return {
    id: input.id,
    domain: input.domain,
    label: input.label,
    kind: input.kind,
    value: input.value,
    displayValue: input.displayValue ?? null,
    unit: input.unit ?? null,
    thresholdKey: input.thresholdKey ?? null,
    direction: input.direction ?? 'neutral',
    rank: input.rank ?? null,
    required: input.required === true,
    severityOnWorsen: input.severityOnWorsen ?? 'watch',
    severityOnMissing: input.severityOnMissing ?? (input.required ? 'caution' : 'unknown'),
    blockerSeverity: input.blockerSeverity ?? 'critical',
    recommendedAction: clean(input.recommendedAction),
    sourceTruth: buildSourceTruthRef(input.source),
    freshnessPolicyKey: input.policyKey,
    dependencies: (input.dependencies ?? []).map(clean).filter((value): value is string => Boolean(value)),
  };
}

function rank(value: unknown): number {
  const key = String(value ?? 'unknown').toLowerCase().replace(/[^a-z]/g, '') as keyof typeof STATUS_RANK;
  return STATUS_RANK[key] ?? 0;
}

function sourceFromReadiness(args: {
  id: string;
  source?: ExpeditionReadinessSourceKind | string | null;
  observedAt?: string | null;
  confidence?: string | null;
  stale?: boolean;
  missing?: boolean;
  partial?: boolean;
  conflict?: boolean;
  provider?: string | null;
  authority?: string | null;
  warningCodes?: string[];
}): SourceInput {
  return {
    id: args.id,
    source: args.source,
    observedAt: args.observedAt,
    confidence: args.confidence,
    stale: args.stale,
    missing: args.missing,
    partial: args.partial,
    conflict: args.conflict,
    provider: args.provider,
    authority: args.authority,
    warningCodes: args.warningCodes,
  };
}

function localTimeDisplay(value: string | null | undefined): string | null {
  if (!validIso(value)) return null;
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function etaMinutes(value: string | null | undefined): number | null {
  if (!validIso(value)) return null;
  return Date.parse(value) / 60_000;
}

function offlineCoveragePercent(input: ExpeditionReadinessInput['offline']): number | null {
  if (!input) return null;
  const values = [
    input.routeDownloaded,
    input.routeGeometryCached,
    input.mapsDownloaded,
    input.mapTilesCachedForRoute,
    input.campIntelDownloaded,
    input.campCandidatesCached,
    input.bailoutPointsCached,
    input.weatherSnapshotAvailable,
    input.emergencyDocsAvailable,
    input.emergencyPacketAvailable,
  ].filter((value): value is boolean => typeof value === 'boolean');
  if (values.length === 0) return null;
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function addIfValue(facts: OperationalSnapshotFact[], input: FactInput): void {
  if (input.value == null && !input.required) return;
  facts.push(fact(input));
}

export function buildOperationalSnapshotFromReadiness(
  args: BuildOperationalSnapshotFromReadinessInput,
): OperationalSnapshot {
  const capturedAt = nowIso(args.capturedAt ?? args.assessment?.updatedAt ?? args.input.capturedAt ?? args.routeSession.updatedAt);
  const activeVehicle = args.activeVehicle ?? args.input.activeVehicle ?? null;
  const routeId = args.routeId ?? args.input.route?.routeId ?? args.routeSession.routeId ?? null;
  const expeditionId = args.expeditionId ?? null;
  const facts: OperationalSnapshotFact[] = [];
  const readinessSource = sourceFromReadiness({
    id: 'ecs-readiness-engine',
    source: 'inferred',
    observedAt: args.assessment?.updatedAt ?? capturedAt,
    confidence: args.assessment?.confidence ?? 'unknown',
    stale: args.assessment
      ? Object.values(args.assessment.sourceFreshness).some((item) => item.isStale)
      : true,
    missing: !args.assessment,
    authority: 'ECS Readiness Engine',
    provider: 'Deterministic ECS readiness rules',
  });

  addIfValue(facts, {
    id: 'assessment:overall_score',
    domain: 'assessment',
    label: 'Readiness score',
    kind: 'metric',
    value: finite(args.assessment?.overallScore),
    unit: 'points',
    thresholdKey: 'assessment_score_points',
    direction: 'higher_is_better',
    required: true,
    severityOnWorsen: 'caution',
    source: readinessSource,
    policyKey: 'default',
    dependencies: ['Overall Go / Caution / Hold readiness posture.'],
  });
  addIfValue(facts, {
    id: 'assessment:posture',
    domain: 'assessment',
    label: 'Readiness posture',
    kind: 'status',
    value: args.assessment?.status ?? null,
    rank: rank(args.assessment?.status),
    direction: 'higher_is_better',
    required: true,
    severityOnWorsen: 'caution',
    source: readinessSource,
    policyKey: 'default',
    dependencies: ['Current deterministic readiness decision.'],
  });

  (args.assessment?.blockers ?? []).forEach((blocker) => {
    facts.push(fact({
      id: `blocker:${blocker.id}`,
      domain: blocker.categoryId === 'weather_window'
        ? 'weather'
        : blocker.categoryId === 'camp_legality_confidence'
          ? 'camp'
          : blocker.categoryId === 'vehicle_fit'
            ? 'vehicle'
            : blocker.categoryId === 'offline_preparedness'
              ? 'offline'
              : blocker.categoryId === 'fuel_range_margin'
                ? 'fuel'
                : 'assessment',
      label: blocker.label,
      kind: 'blocker',
      value: true,
      blockerSeverity: blocker.severity === 'blocker' ? 'critical' : 'caution',
      recommendedAction: blocker.detail,
      source: readinessSource,
      policyKey: 'default',
      dependencies: ['Current deterministic readiness posture and start-expedition guard.'],
    }));
  });

  (args.assessment?.categories ?? []).forEach((category) => {
    facts.push(fact({
      id: `assessment:category:${category.id}`,
      domain: category.id === 'route_risk'
        ? 'route'
        : category.id === 'camp_legality_confidence'
          ? 'camp'
          : category.id === 'weather_window' || category.id === 'daylight_margin'
            ? 'weather'
            : category.id === 'offline_preparedness'
              ? 'offline'
              : category.id === 'fuel_range_margin'
                ? 'fuel'
                : category.id === 'power_runtime'
                  ? 'power'
                  : category.id === 'recovery_bailout_access'
                    ? 'bailout'
                    : category.id === 'communications_signal_confidence'
                      ? 'connectivity'
                      : 'vehicle',
      label: category.label,
      kind: 'status',
      value: category.status,
      rank: rank(category.status),
      direction: 'higher_is_better',
      severityOnWorsen: category.status === 'hold' ? 'critical' : 'caution',
      source: readinessSource,
      policyKey: 'default',
      dependencies: [`${category.label} operational assessment.`],
    }));
  });

  const routeSource = sourceFromReadiness({
    id: routeId ? `route:${routeId}` : 'active-route',
    source: args.input.route?.source ?? (args.routeSession.lifecycle !== 'inactive' ? 'cached' : 'missing'),
    observedAt: args.routeSession.updatedAt ?? args.input.route?.updatedAt ?? null,
    confidence: args.input.route?.routeConfidence ?? 'unknown',
    stale: args.input.route?.isStale,
    missing: !routeId,
    authority: 'ECS Navigate route session',
    provider: args.routeSession.source === 'none' ? null : args.routeSession.source,
  });
  addIfValue(facts, {
    id: 'route:lifecycle',
    domain: 'route',
    label: 'Route state',
    kind: 'identity',
    value: args.routeSession.lifecycle,
    source: routeSource,
    policyKey: 'default',
    dependencies: ['Route progress and guidance context.'],
  });
  addIfValue(facts, {
    id: 'route:progress_percent',
    domain: 'route',
    label: 'Route progress',
    kind: 'metric',
    value: finite(args.routeSession.progressPercent),
    unit: '%',
    thresholdKey: 'route_progress_percent',
    direction: 'neutral',
    source: routeSource,
    policyKey: 'default',
    dependencies: ['Remaining route and endpoint timing.'],
  });
  addIfValue(facts, {
    id: 'route:distance_remaining_miles',
    domain: 'route',
    label: 'Route distance remaining',
    kind: 'metric',
    value: finite(args.routeSession.remainingDistanceM) == null
      ? finite(args.input.fuel?.routeDistanceRemainingMiles)
      : Number((Number(args.routeSession.remainingDistanceM) / 1609.344).toFixed(2)),
    unit: 'mi',
    thresholdKey: 'route_distance_miles',
    direction: 'neutral',
    source: routeSource,
    policyKey: 'default',
    dependencies: ['Route progress, fuel margin, and arrival planning.'],
  });
  addIfValue(facts, {
    id: 'route:eta_minutes',
    domain: 'route',
    label: 'Route ETA',
    kind: 'metric',
    value: etaMinutes(args.routeSession.etaIso),
    displayValue: localTimeDisplay(args.routeSession.etaIso),
    unit: 'min epoch',
    thresholdKey: 'camp_eta_minutes',
    direction: 'lower_is_better',
    severityOnWorsen: 'caution',
    source: routeSource,
    policyKey: 'default',
    dependencies: ['Arrival timing and daylight posture.'],
  });

  const campCandidate = args.input.campCandidates?.[0] ?? null;
  const campSource = sourceFromReadiness({
    id: campCandidate?.candidateId ?? campCandidate?.id ?? 'camp-endpoint',
    source: campCandidate?.source ?? 'missing',
    observedAt: campCandidate?.updatedAt ?? null,
    confidence: campCandidate?.sourceConfidence ?? campCandidate?.legalAccessConfidence ?? 'unknown',
    stale: campCandidate?.isStale,
    missing: !campCandidate,
    authority: 'CampOps',
    provider: 'Camp endpoint candidate',
  });
  addIfValue(facts, {
    id: 'camp:endpoint',
    domain: 'camp',
    label: 'Planned camp endpoint',
    kind: 'identity',
    value: campCandidate?.name ?? campCandidate?.candidateId ?? campCandidate?.id ?? null,
    source: campSource,
    policyKey: 'camp_provider_availability',
    dependencies: ['Camp endpoint readiness and late-arrival posture.'],
  });
  addIfValue(facts, {
    id: 'camp:confidence',
    domain: 'camp',
    label: 'Camp legal/access confidence',
    kind: 'status',
    value: campCandidate?.legalAccessConfidence ?? 'unknown',
    rank: rank(campCandidate?.legalAccessConfidence),
    direction: 'higher_is_better',
    required: Boolean(campCandidate),
    severityOnWorsen: 'caution',
    source: campSource,
    policyKey: 'camp_provider_availability',
    dependencies: ['Camp legality confidence and endpoint viability.'],
  });

  const fuel = args.input.fuel ?? null;
  const fuelSource = sourceFromReadiness({
    id: 'fuel-operational-state',
    source: fuel?.source ?? 'missing',
    observedAt: fuel?.updatedAt ?? null,
    stale: fuel?.isStale,
    missing: !fuel,
    authority: fuel?.source === 'manual' ? 'Operator entry' : 'ECS fuel range engine',
  });
  const fuelMargin = finite(fuel?.rangeRemainingMiles) != null && finite(fuel?.routeDistanceRemainingMiles) != null
    ? Number((Number(fuel?.rangeRemainingMiles) - Number(fuel?.routeDistanceRemainingMiles) - Number(fuel?.reserveMiles ?? 0)).toFixed(1))
    : finite(fuel?.rangeRemainingMiles);
  addIfValue(facts, {
    id: 'fuel:margin_miles',
    domain: 'fuel',
    label: finite(fuel?.routeDistanceRemainingMiles) != null ? 'Fuel route margin' : 'Fuel range remaining',
    kind: 'metric',
    value: fuelMargin,
    unit: 'mi',
    thresholdKey: 'fuel_margin_miles',
    direction: 'higher_is_better',
    required: args.input.readinessMode === 'active',
    severityOnWorsen: 'caution',
    source: fuelSource,
    policyKey: fuel?.source === 'manual' ? 'manual_user_state' : 'vehicle_telemetry',
    dependencies: ['Fuel reserve and route completion posture.'],
  });
  addIfValue(facts, {
    id: 'fuel:percent',
    domain: 'fuel',
    label: 'Fuel level',
    kind: 'metric',
    value: finite(fuel?.fuelPercent),
    unit: '%',
    thresholdKey: 'fuel_percent',
    direction: 'higher_is_better',
    severityOnWorsen: 'watch',
    source: fuelSource,
    policyKey: fuel?.source === 'manual' ? 'manual_user_state' : 'vehicle_telemetry',
    dependencies: ['Fuel range and resupply posture.'],
  });

  const vehicleSource = sourceFromReadiness({
    id: activeVehicle?.vehicleId ? `vehicle:${activeVehicle.vehicleId}` : 'active-vehicle',
    source: activeVehicle?.source ?? 'missing',
    observedAt: activeVehicle?.updatedAt ?? null,
    confidence: activeVehicle?.vehicleFitConfidence ?? 'unknown',
    stale: activeVehicle?.isStale,
    missing: !activeVehicle,
    authority: 'ECS Fleet profile',
  });
  [
    ['vehicle:operating_weight_lbs', 'Operating weight', activeVehicle?.operatingWeightLbs, 'vehicle_weight_lbs', 'lower_is_better'],
    ['vehicle:payload_remaining_lbs', 'Payload remaining', activeVehicle?.payloadRemainingLbs, 'vehicle_weight_lbs', 'higher_is_better'],
    ['vehicle:gvwr_usage_percent', 'GVWR usage', activeVehicle?.gvwrUsagePct, 'gvwr_usage_percent', 'lower_is_better'],
    ['loadout:active_weight_lbs', 'Active loadout weight', activeVehicle?.activeLoadoutWeightLbs, 'vehicle_weight_lbs', 'lower_is_better'],
    ['loadout:accessory_weight_lbs', 'Installed accessory weight', activeVehicle?.accessoryLoadoutWeightLbs, 'vehicle_weight_lbs', 'lower_is_better'],
  ].forEach(([id, label, value, thresholdKey, direction]) => addIfValue(facts, {
    id: String(id),
    domain: String(id).startsWith('loadout:') ? 'loadout' : 'vehicle',
    label: String(label),
    kind: 'metric',
    value: finite(value),
    unit: String(id).includes('percent') ? '%' : 'lb',
    thresholdKey: thresholdKey as OperationalDeltaThresholdKey,
    direction: direction as OperationalDeltaDirection,
    severityOnWorsen: String(id).includes('gvwr') || String(id).includes('payload') ? 'caution' : 'watch',
    source: vehicleSource,
    policyKey: activeVehicle?.source === 'live' ? 'vehicle_telemetry' : 'vehicle_profile',
    dependencies: ['Vehicle readiness, payload risk, and route fit.'],
  }));
  addIfValue(facts, {
    id: 'water:configured_capacity_gallons',
    domain: 'water',
    label: 'Configured water capacity',
    kind: 'metric',
    value: finite(activeVehicle?.waterCapacityGal),
    unit: 'gal',
    thresholdKey: 'water_gallons',
    direction: 'neutral',
    source: vehicleSource,
    policyKey: 'vehicle_profile',
    dependencies: ['Manual water planning baseline; not a live remaining-water reading.'],
  });

  const power = args.input.power ?? null;
  const powerSource = sourceFromReadiness({
    id: power?.deviceLabel ? `power:${power.deviceLabel}` : 'power-operational-state',
    source: power?.source ?? 'missing',
    observedAt: power?.updatedAt ?? null,
    stale: power?.isStale || power?.dataFreshness === 'stale',
    missing: !power,
    provider: power?.providerLabel ?? null,
    authority: power?.runtimeSource === 'manual' ? 'Operator entry' : 'ECS Power Intelligence',
  });
  const runtimeMargin = finite(power?.runtimeHoursRemaining) != null && finite(power?.requiredRuntimeHours) != null
    ? Number((Number(power?.runtimeHoursRemaining) - Number(power?.requiredRuntimeHours)).toFixed(1))
    : finite(power?.runtimeHoursRemaining);
  addIfValue(facts, {
    id: 'power:runtime_margin_hours',
    domain: 'power',
    label: finite(power?.requiredRuntimeHours) != null ? 'Power runtime margin' : 'Power runtime remaining',
    kind: 'metric',
    value: runtimeMargin,
    unit: 'hr',
    thresholdKey: 'power_runtime_hours',
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: powerSource,
    policyKey: power?.runtimeSource === 'manual' ? 'manual_user_state' : 'vehicle_telemetry',
    dependencies: ['Power runtime and overnight load posture.'],
  });
  addIfValue(facts, {
    id: 'power:battery_percent',
    domain: 'power',
    label: 'Power battery',
    kind: 'metric',
    value: finite(power?.batteryPercent),
    unit: '%',
    thresholdKey: 'power_percent',
    direction: 'higher_is_better',
    severityOnWorsen: 'watch',
    source: powerSource,
    policyKey: power?.runtimeSource === 'manual' ? 'manual_user_state' : 'vehicle_telemetry',
    dependencies: ['Power readiness and runtime estimate.'],
  });

  const weather = args.input.weather ?? null;
  const weatherSource = sourceFromReadiness({
    id: 'weather-operational-state',
    source: weather?.source ?? 'missing',
    observedAt: weather?.updatedAt ?? null,
    confidence: weather?.confidence ?? 'unknown',
    stale: weather?.isStale,
    missing: !weather,
    authority: 'ECS Weather Intelligence',
  });
  addIfValue(facts, {
    id: 'weather:risk',
    domain: 'weather',
    label: 'Weather risk',
    kind: 'status',
    value: weather?.riskLevel ?? 'unknown',
    rank: rank(weather?.riskLevel),
    direction: 'higher_is_better',
    required: args.input.readinessMode === 'active',
    severityOnWorsen: 'caution',
    source: weatherSource,
    policyKey: 'weather_forecast',
    dependencies: ['Weather window and route exposure assessment.'],
  });
  if (weather?.severeAlertActive === true) {
    facts.push(fact({
      id: 'blocker:weather-severe-alert',
      domain: 'weather',
      label: 'Severe weather alert',
      kind: 'blocker',
      value: true,
      blockerSeverity: 'critical',
      recommendedAction: 'Review the active alert and route exposure before continuing.',
      source: weatherSource,
      policyKey: 'condition_closure_advisory',
      dependencies: ['Weather safety posture.'],
    }));
  }
  addIfValue(facts, {
    id: 'weather:wind_mph',
    domain: 'weather',
    label: 'Forecast wind',
    kind: 'metric',
    value: finite(weather?.windMph),
    unit: 'mph',
    thresholdKey: 'weather_wind_mph',
    direction: 'lower_is_better',
    severityOnWorsen: 'watch',
    source: weatherSource,
    policyKey: 'weather_forecast',
    dependencies: ['Weather exposure and camp setup posture.'],
  });
  addIfValue(facts, {
    id: 'weather:precipitation_percent',
    domain: 'weather',
    label: 'Precipitation chance',
    kind: 'metric',
    value: finite(weather?.precipitationChancePercent),
    unit: '%',
    thresholdKey: 'weather_precipitation_percent',
    direction: 'lower_is_better',
    severityOnWorsen: 'watch',
    source: weatherSource,
    policyKey: 'weather_forecast',
    dependencies: ['Weather exposure and route timing.'],
  });

  const offline = args.input.offline ?? null;
  const offlineSource = sourceFromReadiness({
    id: routeId ? `offline-package:${routeId}` : 'offline-route-package',
    source: offline?.source ?? 'missing',
    observedAt: offline?.updatedAt ?? null,
    stale: offline?.isStale || offline?.currentRoutePackageFresh === false,
    missing: !offline,
    partial: offline?.packageStatus === 'partial',
    authority: 'ECS Offline Package Manager',
  });
  addIfValue(facts, {
    id: 'offline:package_status',
    domain: 'offline',
    label: 'Offline route package',
    kind: 'status',
    value: offline?.packageStatus ?? 'unknown',
    rank: rank(offline?.packageStatus),
    direction: 'higher_is_better',
    required: args.input.readinessMode === 'active',
    severityOnWorsen: 'caution',
    source: offlineSource,
    policyKey: 'offline_map_route_package',
    dependencies: ['Offline route, map, camp, bailout, weather, and emergency readiness.'],
  });
  addIfValue(facts, {
    id: 'offline:coverage_percent',
    domain: 'offline',
    label: 'Offline package completeness',
    kind: 'metric',
    value: offlineCoveragePercent(offline),
    unit: '%',
    thresholdKey: 'offline_coverage_percent',
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: offlineSource,
    policyKey: 'offline_map_route_package',
    dependencies: ['Offline operating capability.'],
  });

  const recovery = args.input.recovery ?? null;
  const recoverySource = sourceFromReadiness({
    id: 'recovery-bailout-state',
    source: recovery?.source ?? 'missing',
    observedAt: recovery?.updatedAt ?? null,
    confidence: recovery?.recoveryAccessConfidence ?? 'unknown',
    stale: recovery?.isStale,
    missing: !recovery,
    authority: 'ECS Recovery and Bailout Intelligence',
  });
  addIfValue(facts, {
    id: 'bailout:option_count',
    domain: 'bailout',
    label: 'Bailout options',
    kind: 'metric',
    value: finite(recovery?.routeBailoutOptionCount),
    unit: 'options',
    thresholdKey: 'convoy_count',
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: recoverySource,
    policyKey: 'route_legal_access_evidence',
    dependencies: ['Recovery and bailout posture.'],
  });
  addIfValue(facts, {
    id: 'bailout:nearest_exit_miles',
    domain: 'bailout',
    label: 'Nearest bailout distance',
    kind: 'metric',
    value: finite(recovery?.nearestExitMiles),
    unit: 'mi',
    thresholdKey: 'route_distance_miles',
    direction: 'lower_is_better',
    severityOnWorsen: 'watch',
    source: recoverySource,
    policyKey: 'route_legal_access_evidence',
    dependencies: ['Recovery exposure and bailout posture.'],
  });
  addIfValue(facts, {
    id: 'remoteness:posture',
    domain: 'remoteness',
    label: 'Route remoteness',
    kind: 'status',
    value: recovery?.routeRemoteness ?? 'unknown',
    rank: recovery?.routeRemoteness === 'low' ? 4 : recovery?.routeRemoteness === 'moderate' ? 3 : recovery?.routeRemoteness === 'high' ? 1 : 0,
    direction: 'higher_is_better',
    severityOnWorsen: 'watch',
    source: recoverySource,
    policyKey: 'default',
    dependencies: ['Recovery exposure and communications posture.'],
  });

  const communications = args.input.communications ?? null;
  const communicationsSource = sourceFromReadiness({
    id: 'communications-operational-state',
    source: communications?.source ?? 'missing',
    observedAt: communications?.updatedAt ?? null,
    confidence: communications?.signalConfidence ?? 'unknown',
    stale: communications?.isStale,
    missing: !communications,
    authority: 'ECS Communications Readiness',
  });
  addIfValue(facts, {
    id: 'connectivity:signal_confidence',
    domain: 'connectivity',
    label: 'Signal confidence',
    kind: 'status',
    value: communications?.signalConfidence ?? 'unknown',
    rank: rank(communications?.signalConfidence),
    direction: 'higher_is_better',
    severityOnWorsen: 'watch',
    source: communicationsSource,
    policyKey: communications?.source === 'manual' ? 'manual_user_state' : 'default',
    dependencies: ['Communications and check-in posture.'],
  });

  if (args.convoy) {
    const convoyObservedAt = args.convoy.lastUpdatedAt?.toISOString() ?? null;
    const convoySource = sourceFromReadiness({
      id: `convoy:${args.convoy.convoyName}`,
      source: args.convoy.usesLiveTracking ? 'live' : args.convoy.isOffline ? 'cached' : 'manual',
      observedAt: convoyObservedAt,
      confidence: args.convoy.dataState === 'live' ? 'high' : args.convoy.dataState === 'setupNeeded' ? 'low' : 'medium',
      stale: args.convoy.dataState === 'offline',
      missing: args.convoy.dataState === 'setupNeeded',
      partial: args.convoy.dataState === 'partial',
      authority: 'ECS Convoy Command',
      provider: args.convoy.sourceLabel,
    });
    addIfValue(facts, {
      id: 'convoy:state',
      domain: 'convoy',
      label: 'Convoy state',
      kind: 'status',
      value: args.convoy.dataState,
      rank: rank(args.convoy.dataState),
      direction: 'higher_is_better',
      severityOnWorsen: 'caution',
      source: convoySource,
      policyKey: 'convoy_member_location',
      dependencies: ['Convoy membership, check-ins, and location posture.'],
    });
    [
      ['convoy:delayed_count', 'Delayed convoy members', args.convoy.delayedCount],
      ['convoy:offline_count', 'Offline convoy members', args.convoy.offlineCount],
      ['convoy:emergency_count', 'Convoy assistance states', args.convoy.emergencyCount],
    ].forEach(([id, label, value]) => addIfValue(facts, {
      id: String(id),
      domain: 'convoy',
      label: String(label),
      kind: 'metric',
      value: finite(value),
      unit: 'members',
      thresholdKey: 'convoy_count',
      direction: 'lower_is_better',
      severityOnWorsen: String(id).includes('emergency') ? 'critical' : 'caution',
      source: convoySource,
      policyKey: 'convoy_member_location',
      dependencies: ['Convoy regroup and assistance posture.'],
    }));
    if (args.convoy.emergencyCount > 0) {
      facts.push(fact({
        id: 'blocker:convoy-assistance-active',
        domain: 'convoy',
        label: 'Convoy member needs assistance',
        kind: 'blocker',
        value: true,
        blockerSeverity: 'critical',
        recommendedAction: args.convoy.recommendationReason,
        source: convoySource,
        policyKey: 'convoy_member_location',
        dependencies: ['Convoy continue, regroup, and assistance posture.'],
      }));
    }
  }

  return {
    id: `operational-snapshot:${expeditionId ?? routeId ?? 'planning'}:${capturedAt}`,
    schemaVersion: OPERATIONAL_DELTA_SCHEMA_VERSION,
    expeditionId,
    routeId,
    capturedAt,
    baselineKind: args.baselineKind ?? null,
    label: clean(args.label),
    facts,
  };
}

function legacySource(
  id: string,
  source: string | null | undefined,
  observedAt: string | null | undefined,
  confidence: string | null | undefined = 'unknown',
  options: { stale?: boolean; missing?: boolean; expiresAt?: string | null; partial?: boolean } = {},
): SourceInput {
  return {
    id,
    source,
    observedAt,
    expiresAt: options.expiresAt,
    confidence,
    stale: options.stale,
    missing: options.missing,
    partial: options.partial,
    authority: 'Legacy Departure Audit',
    provider: source,
    warningCodes: ['legacy_departure_audit_adapter'],
  };
}

function canonicalLegacyField(field: DepartureDeltaComparableField): {
  id: string;
  domain: OperationalDeltaDomain;
  thresholdKey: OperationalDeltaThresholdKey;
  direction: OperationalDeltaDirection;
} {
  const key = `${field.fieldId} ${field.label}`.toLowerCase();
  if (key.includes('payloadremaining')) return { id: 'vehicle:payload_remaining_lbs', domain: 'vehicle', thresholdKey: 'vehicle_weight_lbs', direction: 'higher_is_better' };
  if (key.includes('gvwr')) return { id: 'vehicle:gvwr_usage_percent', domain: 'vehicle', thresholdKey: 'gvwr_usage_percent', direction: 'lower_is_better' };
  if (key.includes('operatingweight')) return { id: 'vehicle:operating_weight_lbs', domain: 'vehicle', thresholdKey: 'vehicle_weight_lbs', direction: 'lower_is_better' };
  if (key.includes('accessory')) return { id: 'loadout:accessory_weight_lbs', domain: 'loadout', thresholdKey: 'vehicle_weight_lbs', direction: 'lower_is_better' };
  if (key.includes('loadout')) return { id: 'loadout:active_weight_lbs', domain: 'loadout', thresholdKey: 'vehicle_weight_lbs', direction: 'lower_is_better' };
  return { id: `loadout:legacy:${field.fieldId}`, domain: 'loadout', thresholdKey: 'vehicle_weight_lbs', direction: 'neutral' };
}

export function buildOperationalSnapshotFromDepartureAudit(
  audit: DepartureDeltaPreviousAuditSnapshot | null | undefined,
): OperationalSnapshot | null {
  const capturedAt = audit?.capturedAt ?? audit?.domainIdentity?.createdAt ?? null;
  const schemaVersion = audit?.domainIdentity?.auditSchemaVersion ?? audit?.auditSchemaVersion ?? null;
  if (
    !audit ||
    !validIso(capturedAt) ||
    schemaVersion !== DEFAULT_DEPARTURE_DELTA_AUDIT_SCHEMA_VERSION
  ) return null;
  const facts: OperationalSnapshotFact[] = [];
  const readinessSource = legacySource(
    audit.auditId ?? 'legacy-departure-audit',
    audit.posture?.source ?? 'inferred',
    audit.posture?.observedAt ?? capturedAt,
  );

  addIfValue(facts, {
    id: 'assessment:posture',
    domain: 'assessment',
    label: 'Readiness posture',
    kind: 'status',
    value: audit.posture?.value ?? null,
    rank: rank(audit.posture?.value),
    direction: 'higher_is_better',
    required: true,
    severityOnWorsen: 'caution',
    source: readinessSource,
    policyKey: 'default',
    dependencies: ['Legacy departure readiness posture.'],
  });
  (audit.blockers ?? []).forEach((blocker) => facts.push(fact({
    id: `blocker:${blocker.id}`,
    domain: 'assessment',
    label: blocker.label,
    kind: 'blocker',
    value: true,
    blockerSeverity: blocker.severity === 'critical' || blocker.severity === 'blocker' ? 'critical' : 'caution',
    recommendedAction: blocker.detail,
    source: legacySource(blocker.sourceId ?? blocker.id, blocker.source, blocker.observedAt ?? capturedAt),
    policyKey: 'default',
    dependencies: ['Legacy departure audit blocker.'],
  })));
  (audit.vehicleLoadoutValues ?? []).forEach((item) => {
    const canonical = canonicalLegacyField(item);
    addIfValue(facts, {
      ...canonical,
      label: item.label,
      kind: 'metric',
      value: typeof item.value === 'number' ? item.value : null,
      unit: item.unit ?? null,
      severityOnWorsen: canonical.id.includes('gvwr') || canonical.id.includes('payload') ? 'caution' : 'watch',
      source: legacySource(item.sourceId ?? item.fieldId, item.source, item.observedAt ?? capturedAt),
      policyKey: 'vehicle_profile',
      dependencies: ['Legacy Fleet/loadout departure value.'],
    });
  });
  addIfValue(facts, {
    id: 'route:lifecycle',
    domain: 'route',
    label: 'Route state',
    kind: 'identity',
    value: audit.routeState?.value ?? null,
    source: legacySource('legacy-route-state', audit.routeState?.source, audit.routeState?.observedAt ?? capturedAt),
    policyKey: 'default',
    dependencies: ['Legacy departure route state.'],
  });

  const weather = audit.weatherFreshness;
  addIfValue(facts, {
    id: 'weather:risk',
    domain: 'weather',
    label: 'Weather source state',
    kind: 'status',
    value: weather?.status ?? null,
    rank: weather?.status === 'fresh' ? 4 : weather?.status === 'stale' ? 2 : weather?.status === 'expired' ? 1 : 0,
    direction: 'higher_is_better',
    required: true,
    severityOnWorsen: 'caution',
    source: legacySource(
      weather?.sourceId ?? 'legacy-weather',
      weather?.source,
      weather?.observedAt ?? capturedAt,
      'unknown',
      {
        stale: weather?.status === 'stale' || weather?.status === 'expired',
        missing: weather?.status === 'missing',
        expiresAt: weather?.expiresAt,
      },
    ),
    policyKey: 'weather_forecast',
    dependencies: ['Legacy departure weather freshness.'],
  });

  const offline = audit.offlinePackage;
  addIfValue(facts, {
    id: 'offline:package_status',
    domain: 'offline',
    label: 'Offline route package',
    kind: 'status',
    value: offline?.packageStatus ?? null,
    rank: rank(offline?.packageStatus),
    direction: 'higher_is_better',
    required: true,
    severityOnWorsen: 'caution',
    source: legacySource(
      offline?.sourceId ?? offline?.packageId ?? 'legacy-offline-package',
      offline?.source,
      offline?.observedAt ?? capturedAt,
      'unknown',
      {
        stale: offline?.freshness === 'stale' || offline?.freshness === 'expired',
        missing: offline?.packageStatus === 'missing',
        partial: offline?.coverage === 'partial',
      },
    ),
    policyKey: 'offline_map_route_package',
    dependencies: ['Legacy departure offline package.'],
  });
  addIfValue(facts, {
    id: 'offline:coverage_percent',
    domain: 'offline',
    label: 'Offline package completeness',
    kind: 'metric',
    value: finite(offline?.cacheCompletenessPct),
    unit: '%',
    thresholdKey: 'offline_coverage_percent',
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: legacySource(offline?.sourceId ?? 'legacy-offline-coverage', offline?.source, offline?.observedAt ?? capturedAt),
    policyKey: 'offline_map_route_package',
    dependencies: ['Legacy departure offline package completeness.'],
  });

  const camp = audit.campEndpointConfidence;
  addIfValue(facts, {
    id: 'camp:confidence',
    domain: 'camp',
    label: 'Camp legal/access confidence',
    kind: 'status',
    value: camp?.confidence ?? null,
    rank: rank(camp?.confidence),
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: legacySource(camp?.sourceId ?? camp?.endpointId ?? 'legacy-camp', camp?.source, camp?.observedAt ?? capturedAt, camp?.confidence),
    policyKey: 'camp_provider_availability',
    dependencies: ['Legacy departure camp confidence.'],
  });

  const roster = audit.dispatchRoster;
  addIfValue(facts, {
    id: 'convoy:state',
    domain: 'convoy',
    label: 'Convoy roster state',
    kind: 'status',
    value: roster?.status ?? null,
    rank: roster?.status === 'fresh' ? 4 : roster?.status === 'stale' ? 2 : 0,
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: legacySource(
      roster?.sourceId ?? roster?.rosterId ?? 'legacy-roster',
      roster?.source,
      roster?.observedAt ?? capturedAt,
      'unknown',
      { stale: roster?.status === 'stale', missing: roster?.status === 'missing' },
    ),
    policyKey: 'convoy_member_location',
    dependencies: ['Legacy departure convoy roster.'],
  });

  const margins = [
    ['fuel:margin_miles', 'fuel', 'Fuel margin', audit.margins?.fuel, 'fuel_margin_miles', 'mi'],
    ['water:remaining_gallons', 'water', 'Water margin', audit.margins?.water, 'water_gallons', 'gal'],
    ['power:battery_percent', 'power', 'Power margin', audit.margins?.power, 'power_percent', '%'],
  ] as const;
  margins.forEach(([id, domain, label, margin, thresholdKey, unit]) => addIfValue(facts, {
    id,
    domain,
    label,
    kind: 'metric',
    value: typeof margin?.value === 'number' ? margin.value : null,
    unit: margin?.unit ?? unit,
    thresholdKey,
    direction: 'higher_is_better',
    severityOnWorsen: 'caution',
    source: legacySource(margin?.sourceId ?? id, margin?.source, margin?.observedAt ?? capturedAt),
    policyKey: margin?.source === 'manual' ? 'manual_user_state' : domain === 'fuel' || domain === 'power' ? 'vehicle_telemetry' : 'manual_user_state',
    dependencies: [`Legacy departure ${domain} margin.`],
  }));

  return {
    id: `operational-snapshot:legacy:${audit.auditId ?? capturedAt}`,
    schemaVersion: OPERATIONAL_DELTA_SCHEMA_VERSION,
    expeditionId: audit.domainIdentity?.expeditionId ?? audit.domainIdentity?.tripId ?? null,
    routeId: audit.domainIdentity?.routeId ?? null,
    capturedAt,
    baselineKind: 'departure',
    label: 'Legacy departure audit',
    facts,
  };
}
