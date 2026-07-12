import type { ResourceForecast } from '../resourceForecastEngine';
import {
  sanitizeSourceTruthRef,
  type SourceTruthConfidence,
  type SourceTruthOrigin,
  type SourceTruthRef,
} from '../sourceTruth';
import type {
  ExpeditionTripDataQuality,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
} from '../expedition/expeditionTripRecordTypes';
import type { ResourceSnapshot, TripRecord } from '../tripRecorderTypes';
import {
  isTripLearningEffective,
  isTripLearningLocalFeatureEnabled,
  type TripLearningFeatureFlags,
} from './tripLearningConfig';
import { tripLearningStore } from './tripLearningStore';
import type {
  ForecastActualQualityFlag,
  ForecastActualRecord,
  TripExposureObservation,
  TripLearningForecastBaseline,
} from './tripLearningTypes';

type LearningResourceSnapshot = ResourceSnapshot & {
  sourceTruth?: Partial<Record<'coolantTempF' | 'batteryVoltage', SourceTruthRef>>;
};

function validDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function safeId(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9_.:-]+/g, '-');
  return normalized.slice(0, 96) || fallback;
}

function originForTripQuality(quality: ExpeditionTripDataQuality): SourceTruthOrigin {
  if (quality === 'live') return 'live';
  if (quality === 'cached' || quality === 'stale') return 'cached';
  if (quality === 'manual') return 'manual';
  if (quality === 'estimated') return 'estimated';
  if (quality === 'mock') return 'simulated';
  return 'unavailable';
}

function confidenceForTripQuality(quality: ExpeditionTripDataQuality): SourceTruthConfidence {
  if (quality === 'live') return 'high';
  if (quality === 'cached' || quality === 'manual' || quality === 'estimated') return 'medium';
  if (quality === 'stale' || quality === 'mock') return 'low';
  return 'unknown';
}

export function sourceTruthFromExpeditionTripSource(
  source: ExpeditionTripSourceLabel,
  id: string,
): SourceTruthRef {
  const warningCodes = [
    ...(source.quality === 'cached' ? ['origin_cached'] : []),
    ...(source.quality === 'stale' ? ['stale_source'] : []),
    ...(source.quality === 'mock' ? ['origin_simulated'] : []),
    ...(source.quality === 'missing' ? ['source_unavailable'] : []),
  ];
  return sanitizeSourceTruthRef({
    id,
    origin: originForTripQuality(source.quality),
    authority: source.source,
    provider: null,
    observedAt: validDate(source.capturedAt),
    fetchedAt: null,
    expiresAt: validDate(source.staleAt),
    confidence: confidenceForTripQuality(source.quality),
    coverage: source.quality === 'live' ? 'complete' : source.quality === 'missing' ? 'unknown' : 'partial',
    availability: source.quality === 'missing'
      ? 'unavailable'
      : source.quality === 'stale' || source.quality === 'mock'
        ? 'degraded'
        : 'usable',
    conflict: false,
    warningCodes,
  });
}

export function buildTripExposureObservationsFromExpeditionTrip(
  trip: ExpeditionTripRecord,
): TripExposureObservation[] {
  const terrain = trip.terrainRiskSnapshots.flatMap((snapshot) => {
    if (snapshot.riskLevel !== 'critical' && snapshot.riskLevel !== 'caution') return [];
    const sourceTruth = sourceTruthFromExpeditionTripSource(
      snapshot.source,
      `trip-learning:${trip.id}:terrain:${snapshot.id}`,
    );
    return [{
      id: `terrain:${snapshot.id}`,
      tripId: trip.id,
      expeditionId: trip.id,
      kind: 'technical_terrain' as const,
      observedAt: snapshot.capturedAt,
      value: snapshot.riskLevel === 'critical' ? 100 : 60,
      unit: 'risk_index',
      comparisonBaseline: null,
      severity: snapshot.riskLevel === 'critical' ? 'high' as const : 'watch' as const,
      verified: snapshot.source.quality === 'live',
      evidenceLabel: snapshot.summary ?? `${snapshot.riskLevel} terrain risk recorded`,
      sourceTruth,
      freshnessPolicyKey: 'condition_closure_advisory' as const,
      qualityFlags: snapshot.source.quality === 'mock'
        ? ['mocked' as const]
        : snapshot.source.quality === 'stale'
          ? ['materially_stale' as const]
          : [],
    }];
  });

  const recovery = trip.notableMoments.flatMap((moment) => {
    if (moment.type !== 'recovery_used') return [];
    const sourceTruth = sourceTruthFromExpeditionTripSource(
      moment.source,
      `trip-learning:${trip.id}:recovery:${moment.id}`,
    );
    return [{
      id: `recovery:${moment.id}`,
      tripId: trip.id,
      expeditionId: trip.id,
      kind: 'recovery_use' as const,
      observedAt: moment.capturedAt,
      value: null,
      unit: null,
      comparisonBaseline: null,
      severity: 'high' as const,
      verified: moment.source.quality === 'live',
      evidenceLabel: moment.title,
      sourceTruth,
      freshnessPolicyKey: 'manual_user_state' as const,
      qualityFlags: moment.source.quality === 'mock'
        ? ['mocked' as const]
        : moment.source.quality === 'stale'
          ? ['materially_stale' as const]
          : [],
    }];
  });

  return [...terrain, ...recovery];
}

function forecastSourceTruth(forecast: ResourceForecast): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `resource-forecast:${safeId(forecast.routeIntelligenceId, 'route')}`,
    origin: 'estimated',
    authority: 'ECS deterministic resource forecast',
    provider: null,
    observedAt: validDate(forecast.computedAt),
    fetchedAt: null,
    expiresAt: null,
    confidence: forecast.hasRealData ? 'medium' : 'low',
    coverage: forecast.hasRealData ? 'partial' : 'unknown',
    availability: forecast.hasRealData ? 'usable' : 'degraded',
    conflict: false,
    warningCodes: forecast.hasRealData ? ['forecast_estimate'] : ['forecast_estimate', 'forecast_uses_defaults'],
  });
}

export function buildTripLearningForecastBaseline(
  trip: Pick<TripRecord, 'id' | 'expeditionId' | 'vehicleId' | 'startedAt'>,
  forecast: ResourceForecast,
): TripLearningForecastBaseline | null {
  const startedAt = validDate(trip.startedAt);
  const computedAt = validDate(forecast.computedAt);
  if (!startedAt || !computedAt || !forecast.hasRealData) return null;
  const forecastAgeMs = Date.parse(startedAt) - Date.parse(computedAt);
  if (forecastAgeMs < -5 * 60_000 || forecastAgeMs > 6 * 60 * 60_000) return null;
  const sourceTruth = forecastSourceTruth(forecast);
  const entries: TripLearningForecastBaseline['entries'] = [];
  if (Number.isFinite(forecast.estimatedDriveHours) && forecast.estimatedDriveHours > 0) {
    entries.push({
      metric: 'drive_time',
      value: forecast.estimatedDriveHours * 3600,
      unit: 'seconds',
      sourceTruth,
      freshnessPolicyKey: 'offline_map_route_package',
    });
  }
  if (Number.isFinite(forecast.fuel.requiredGallons) && forecast.fuel.requiredGallons > 0) {
    entries.push({
      metric: 'fuel_consumption',
      value: forecast.fuel.requiredGallons,
      unit: 'gallons',
      sourceTruth,
      freshnessPolicyKey: 'vehicle_profile',
    });
  }
  if (Number.isFinite(forecast.power.requiredHours) && forecast.power.requiredHours > 0) {
    entries.push({
      metric: 'power_runtime',
      value: forecast.power.requiredHours,
      unit: 'hours',
      sourceTruth,
      freshnessPolicyKey: 'vehicle_profile',
    });
  }
  if (entries.length === 0) return null;
  return {
    schemaVersion: 'ecs.trip-learning.forecast-baseline.v1',
    id: `baseline:${safeId(trip.id, 'trip')}`,
    tripId: safeId(trip.id, 'trip'),
    expeditionId: trip.expeditionId ? safeId(trip.expeditionId, 'expedition') : null,
    vehicleId: trip.vehicleId ? safeId(trip.vehicleId, 'vehicle') : null,
    routeClass: null,
    terrainClass: forecast.routeDifficulty || null,
    routeIntelligenceId: safeId(forecast.routeIntelligenceId, 'route-intelligence'),
    forecastRouteMiles: Number.isFinite(forecast.routeMiles) && forecast.routeMiles > 0
      ? forecast.routeMiles
      : null,
    capturedAt: forecast.computedAt,
    entries,
  };
}

function routeActualSource(
  trip: TripRecord,
  baseline: TripLearningForecastBaseline,
): { source: SourceTruthRef; flags: ForecastActualQualityFlag[] } {
  const endedAt = validDate(trip.endedAt);
  const enoughDuration = Number.isFinite(trip.durationSec) && trip.durationSec >= 300;
  const enoughDistance = Number.isFinite(trip.distanceMi) && trip.distanceMi >= 0.5;
  const enoughPoints = trip.totalPointsRecorded >= 12 && trip.routePoints.length >= 8;
  const routeDistanceMatch =
    baseline.forecastRouteMiles != null &&
    baseline.forecastRouteMiles > 0 &&
    Math.abs(trip.distanceMi - baseline.forecastRouteMiles) / baseline.forecastRouteMiles <= 0.35;
  const complete = !!endedAt && enoughDuration && enoughDistance && enoughPoints && routeDistanceMatch;
  return {
    source: sanitizeSourceTruthRef({
      id: `trip-recorder:${safeId(trip.id, 'trip')}:drive-time`,
      origin: 'live',
      authority: 'ECS Trip Recorder',
      provider: 'Device GPS',
      observedAt: endedAt,
      fetchedAt: null,
      expiresAt: null,
      confidence: complete ? 'high' : 'low',
      coverage: complete ? 'complete' : 'partial',
      availability: complete ? 'usable' : 'degraded',
      conflict: false,
      warningCodes: complete
        ? ['local_recorder_actual', 'forecast_route_distance_matched']
        : [routeDistanceMatch ? 'incomplete_trip_trace' : 'forecast_route_mismatch'],
    }),
    flags: complete ? [] : ['incomplete'],
  };
}

function manualResourceActualSource(
  trip: TripRecord,
  metric: 'fuel',
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `trip-recorder:${safeId(trip.id, 'trip')}:${metric}`,
    origin: 'manual',
    authority: 'ECS trip resource snapshot',
    provider: null,
    observedAt: validDate(trip.endedAt),
    fetchedAt: null,
    expiresAt: null,
    confidence: 'medium',
    coverage: 'partial',
    availability: 'usable',
    conflict: false,
    warningCodes: ['manual_unverified_actual'],
  });
}

export function buildForecastActualRecordsFromTripRecorder(
  trip: TripRecord,
  baseline: TripLearningForecastBaseline,
): ForecastActualRecord[] {
  const endedAt = validDate(trip.endedAt);
  const startedAt = validDate(trip.startedAt);
  if (!endedAt || !startedAt) return [];
  const records: ForecastActualRecord[] = [];
  const driveForecast = baseline.entries.find((entry) => entry.metric === 'drive_time');
  if (driveForecast && Number.isFinite(trip.durationSec) && trip.durationSec > 0) {
    const actual = routeActualSource(trip, baseline);
    records.push({
      schemaVersion: 'ecs.trip-learning.forecast-actual.v1',
      id: `forecast-actual:${safeId(trip.id, 'trip')}:drive-time`,
      tripId: trip.id,
      expeditionId: trip.expeditionId,
      vehicleId: trip.vehicleId,
      routeClass: baseline.routeClass,
      terrainClass: baseline.terrainClass,
      metric: 'drive_time',
      forecast: {
        value: driveForecast.value,
        unit: 'seconds',
        observedAt: baseline.capturedAt,
        sourceTruth: driveForecast.sourceTruth,
        freshnessPolicyKey: driveForecast.freshnessPolicyKey,
      },
      actual: {
        value: trip.durationSec,
        unit: 'seconds',
        observedAt: endedAt,
        sourceTruth: actual.source,
        freshnessPolicyKey: 'convoy_member_location',
      },
      tripStartedAt: startedAt,
      tripEndedAt: endedAt,
      createdAt: endedAt,
      qualityFlags: actual.flags,
    });
  }

  const fuelForecast = baseline.entries.find((entry) => entry.metric === 'fuel_consumption');
  const startFuel = trip.startResources?.fuelGal;
  const endFuel = trip.endResources?.fuelGal;
  if (
    fuelForecast &&
    Number.isFinite(startFuel) &&
    Number.isFinite(endFuel) &&
    Number(startFuel) > Number(endFuel)
  ) {
    records.push({
      schemaVersion: 'ecs.trip-learning.forecast-actual.v1',
      id: `forecast-actual:${safeId(trip.id, 'trip')}:fuel`,
      tripId: trip.id,
      expeditionId: trip.expeditionId,
      vehicleId: trip.vehicleId,
      routeClass: baseline.routeClass,
      terrainClass: baseline.terrainClass,
      metric: 'fuel_consumption',
      forecast: {
        value: fuelForecast.value,
        unit: 'gallons',
        observedAt: baseline.capturedAt,
        sourceTruth: fuelForecast.sourceTruth,
        freshnessPolicyKey: fuelForecast.freshnessPolicyKey,
      },
      actual: {
        value: Number(startFuel) - Number(endFuel),
        unit: 'gallons',
        observedAt: endedAt,
        sourceTruth: manualResourceActualSource(trip, 'fuel'),
        freshnessPolicyKey: 'manual_user_state',
      },
      tripStartedAt: startedAt,
      tripEndedAt: endedAt,
      createdAt: endedAt,
      qualityFlags: ['manual_unverified'],
    });
  }
  return records;
}

export function buildTripExposureObservationsFromTripRecorder(
  trip: TripRecord,
): TripExposureObservation[] {
  const observations: TripExposureObservation[] = [];
  (trip.resourceSnapshots as LearningResourceSnapshot[]).forEach((snapshot, index) => {
    const observedAt = validDate(snapshot.timestamp);
    if (!observedAt) return;
    const coolantSource = snapshot.sourceTruth?.coolantTempF;
    if (coolantSource && Number.isFinite(snapshot.coolantTempF)) {
      observations.push({
        id: `coolant:${trip.id}:${index}`,
        tripId: trip.id,
        expeditionId: trip.expeditionId,
        kind: 'high_coolant_temperature',
        observedAt,
        value: Number(snapshot.coolantTempF),
        unit: 'F',
        comparisonBaseline: null,
        severity: Number(snapshot.coolantTempF) >= 230 ? 'high' : 'watch',
        verified: true,
        evidenceLabel: `Coolant temperature ${Number(snapshot.coolantTempF).toFixed(0)} F`,
        sourceTruth: coolantSource,
        freshnessPolicyKey: 'vehicle_telemetry',
        qualityFlags: [],
      });
    }
    const voltageSource = snapshot.sourceTruth?.batteryVoltage;
    if (voltageSource && Number.isFinite(snapshot.batteryVoltage)) {
      observations.push({
        id: `voltage:${trip.id}:${index}`,
        tripId: trip.id,
        expeditionId: trip.expeditionId,
        kind: 'low_battery_voltage',
        observedAt,
        value: Number(snapshot.batteryVoltage),
        unit: 'V',
        comparisonBaseline: null,
        severity: Number(snapshot.batteryVoltage) <= 11.8 ? 'high' : 'watch',
        verified: true,
        evidenceLabel: `Battery voltage ${Number(snapshot.batteryVoltage).toFixed(1)} V`,
        sourceTruth: voltageSource,
        freshnessPolicyKey: 'vehicle_telemetry',
        qualityFlags: [],
      });
    }
  });
  return observations;
}

export async function processCompletedExpeditionTripForLearning(
  trip: ExpeditionTripRecord,
  flags?: TripLearningFeatureFlags | null,
): Promise<boolean> {
  if (trip.status !== 'completed' || !isTripLearningLocalFeatureEnabled(flags)) return false;
  await tripLearningStore.hydrate();
  if (!isTripLearningEffective(tripLearningStore.getSnapshot().preferences, flags)) return false;
  await tripLearningStore.processOutcome({
    observations: buildTripExposureObservationsFromExpeditionTrip(trip),
    processedTripId: trip.id,
    now: trip.completedAt ?? trip.updatedAt,
  });
  return true;
}

export async function captureTripLearningDepartureForecast(
  trip: TripRecord,
  forecast: ResourceForecast | null,
  flags?: TripLearningFeatureFlags | null,
): Promise<boolean> {
  if (!forecast || !isTripLearningLocalFeatureEnabled(flags)) return false;
  await tripLearningStore.hydrate();
  if (!isTripLearningEffective(tripLearningStore.getSnapshot().preferences, flags)) return false;
  const baseline = buildTripLearningForecastBaseline(trip, forecast);
  if (!baseline) return false;
  return (await tripLearningStore.captureBaseline(baseline)) != null;
}

export async function processTripRecorderOutcomeForLearning(
  trip: TripRecord,
  flags?: TripLearningFeatureFlags | null,
): Promise<boolean> {
  if (!isTripLearningLocalFeatureEnabled(flags)) return false;
  await tripLearningStore.hydrate();
  if (!isTripLearningEffective(tripLearningStore.getSnapshot().preferences, flags)) return false;
  const baseline = await tripLearningStore.getBaseline(trip.id);
  const records = baseline ? buildForecastActualRecordsFromTripRecorder(trip, baseline) : [];
  await tripLearningStore.processOutcome({
    records,
    observations: buildTripExposureObservationsFromTripRecorder(trip),
    processedTripId: trip.id,
    consumeBaselineTripId: trip.id,
    now: trip.endedAt ?? trip.savedAt,
  });
  return true;
}
