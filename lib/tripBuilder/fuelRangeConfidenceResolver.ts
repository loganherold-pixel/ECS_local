import { haversineDistanceMiles } from '../map/routeGeometryUtils';
import type {
  GeoPoint,
  ItineraryDataSource,
  ItineraryRoute,
  ItineraryStop,
  TripBuilderFuelTelemetry,
  TripBuilderVehicleProfile,
  TripFuelRangeConfidence,
} from './tripBuilderTypes';

export type ResolveFuelRangeConfidenceArgs = {
  vehicleProfile?: TripBuilderVehicleProfile | null;
  telemetry?: TripBuilderFuelTelemetry | Record<string, unknown> | null;
  approachRoute?: ItineraryRoute | null;
  trailRoute?: ItineraryRoute | null;
  exitRoute?: ItineraryRoute | null;
  preTrailFuelStops?: ItineraryStop[] | null;
};

type FuelRangeEvidence = {
  knownFuelRange: number | null;
  estimatedFuelRemaining: number | null;
  estimatedFuelRequiredGallons: number | null;
  source: ItineraryDataSource | null;
  confidence: number;
  warnings: string[];
  metadata: Record<string, unknown>;
};

type DistanceEvidence = {
  estimatedTotalDistance: number | null;
  estimatedTrailDistance: number | null;
  source: ItineraryDataSource | null;
  confidence: number;
  warnings: string[];
  missingRouteParts: string[];
  metadata: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function positiveNumber(value: unknown): number | null {
  const numberValue = finiteNumber(value);
  return numberValue != null && numberValue > 0 ? numberValue : null;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundTenths(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

function roundScore(value: number): number {
  return Math.round(clamp(value) * 100) / 100;
}

function source(label: string, state: ItineraryDataSource['state'], extras: Partial<ItineraryDataSource> = {}): ItineraryDataSource {
  return {
    label,
    state,
    ...extras,
  };
}

function telemetryRecord(value: ResolveFuelRangeConfidenceArgs['telemetry']): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isTelemetryLive(record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  const sourceType = String(record.sourceType ?? record.source ?? '').toLowerCase();
  const freshness = String(record.freshness ?? '').toLowerCase();
  if (record.isLive === true && freshness !== 'stale' && freshness !== 'offline') return true;
  if ((freshness === 'live' || freshness === 'recent') && sourceType !== 'simulated' && sourceType !== 'unavailable') return true;
  return sourceType === 'obd_live' ||
    sourceType === 'bluetooth_obd_live' ||
    sourceType === 'native_vehicle_live';
}

function telemetryConfidence(record: Record<string, unknown> | null): number {
  if (!record) return 0;
  const raw = record.confidence;
  if (typeof raw === 'number') return raw > 1 ? clamp(raw / 100) : clamp(raw);
  const confidence = String(raw ?? '').toLowerCase();
  if (confidence === 'high') return 0.92;
  if (confidence === 'medium') return 0.72;
  if (confidence === 'low') return 0.42;
  if (confidence === 'unverified') return 0.3;
  return isTelemetryLive(record) ? 0.82 : 0.58;
}

function firstPositive(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = positiveNumber(record[key]);
    if (value != null) return value;
  }
  return null;
}

function firstPercent(record: Record<string, unknown> | null, keys: string[]): number | null {
  const value = firstPositive(record, keys);
  if (value == null) return null;
  return value > 1 ? Math.min(100, value) : Math.min(100, value * 100);
}

function routeDistanceMiles(route: ItineraryRoute | null | undefined): number | null {
  const direct = positiveNumber(route?.distanceMiles);
  if (direct != null) return roundTenths(direct);

  const geometry = route?.geometry ?? [];
  if (geometry.length < 2) return null;
  let total = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    total += haversineDistanceMiles(geometry[index - 1] as GeoPoint, geometry[index] as GeoPoint);
  }
  return roundTenths(total);
}

function resolveDistanceEvidence(args: ResolveFuelRangeConfidenceArgs): DistanceEvidence {
  const approachMiles = routeDistanceMiles(args.approachRoute);
  const trailMiles = routeDistanceMiles(args.trailRoute);
  const exitMiles = routeDistanceMiles(args.exitRoute);
  const knownParts = [approachMiles, trailMiles, exitMiles].filter((value): value is number => value != null);
  const missingRouteParts = [
    approachMiles == null ? 'approach route distance' : null,
    trailMiles == null ? 'trail route distance' : null,
    exitMiles == null ? 'exit route distance' : null,
  ].filter((value): value is string => value != null);
  const estimatedTotalDistance = knownParts.length > 0
    ? roundTenths(knownParts.reduce((sum, value) => sum + value, 0))
    : null;
  const warnings: string[] = [];

  if (estimatedTotalDistance == null) {
    warnings.push('Route distance is unavailable, so ECS cannot assess fuel range against this itinerary.');
  }
  if (trailMiles == null) {
    warnings.push('Trail distance is unavailable; fuel confidence is lower and may understate route demand.');
  }

  const confidence =
    estimatedTotalDistance == null ? 0.1 :
    missingRouteParts.includes('trail route distance') ? 0.52 :
    missingRouteParts.includes('exit route distance') ? 0.74 :
    0.9;

  return {
    estimatedTotalDistance,
    estimatedTrailDistance: trailMiles,
    source: estimatedTotalDistance == null
      ? source('itinerary_route_distance', 'missing')
      : source('itinerary_route_distance', 'cached'),
    confidence,
    warnings,
    missingRouteParts,
    metadata: {
      approachMiles,
      trailMiles,
      exitMiles,
      missingRouteParts,
    },
  };
}

function rangeFromTelemetry(
  record: Record<string, unknown> | null,
  vehicleProfile?: TripBuilderVehicleProfile | null,
): FuelRangeEvidence | null {
  if (!record) return null;

  const warnings: string[] = [];
  const live = isTelemetryLive(record);
  const tankCapacity =
    firstPositive(record, ['fuelTankCapacityGal', 'tankCapacityGal']) ??
    positiveNumber(vehicleProfile?.fuelTankCapacityGal);
  const avgMpg =
    firstPositive(record, ['avgMpg', 'mpg']) ??
    positiveNumber(vehicleProfile?.avgMpg);
  const fuelLevelPct = firstPercent(record, ['fuelLevelPct', 'fuelPercent', 'fuel_level', 'fuelLevel']);
  const directFuelRemaining = firstPositive(record, ['fuelRemainingGallons', 'fuelRemainingGal', 'fuel_remaining_gal']);
  const estimatedFuelRemaining =
    directFuelRemaining ??
    (fuelLevelPct != null && tankCapacity != null ? roundTenths((fuelLevelPct / 100) * tankCapacity) : null);
  const directRange = firstPositive(record, [
    'rangeMiles',
    'fuelRangeMiles',
    'fuelRangeMi',
    'fuelSafeRangeMi',
    'estimatedRangeMiles',
  ]);
  const rangeFromRemaining =
    estimatedFuelRemaining != null && avgMpg != null
      ? roundTenths(estimatedFuelRemaining * avgMpg)
      : null;
  const knownFuelRange = directRange ?? rangeFromRemaining;

  if (!live) warnings.push('Telemetry fuel data is not marked live or recent; treat fuel confidence as lower.');
  if (knownFuelRange == null && fuelLevelPct != null) {
    warnings.push('Telemetry reports fuel level but tank size or MPG is unavailable, so range was not estimated.');
  }

  if (knownFuelRange == null && estimatedFuelRemaining == null) return null;

  const sourceLabel = String(record.sourceLabel ?? record.provider ?? record.source ?? 'vehicle telemetry');
  const capturedAt =
    typeof record.updatedAt === 'string'
      ? record.updatedAt
      : typeof record.timestamp === 'number'
        ? new Date(record.timestamp).toISOString()
        : null;

  return {
    knownFuelRange: roundTenths(knownFuelRange),
    estimatedFuelRemaining: roundTenths(estimatedFuelRemaining),
    estimatedFuelRequiredGallons: null,
    source: source('vehicle_fuel_telemetry', live ? 'live' : 'cached', {
      source: sourceLabel,
      provider: typeof record.provider === 'string' ? record.provider : null,
      capturedAt,
      confidence: telemetryConfidence(record),
    }),
    confidence: live ? telemetryConfidence(record) : Math.min(0.62, telemetryConfidence(record)),
    warnings,
    metadata: {
      live,
      fuelLevelPct,
      tankCapacity,
      avgMpg,
      rangeBasis: directRange != null ? 'telemetry_range' : rangeFromRemaining != null ? 'telemetry_fuel_level_with_profile_mpg' : 'telemetry_fuel_remaining_only',
    },
  };
}

function rangeFromVehicleProfile(vehicleProfile?: TripBuilderVehicleProfile | null): FuelRangeEvidence | null {
  if (!vehicleProfile) return null;

  const tankCapacity = positiveNumber(vehicleProfile.fuelTankCapacityGal);
  const avgMpg = positiveNumber(vehicleProfile.avgMpg);
  const currentFuelGallons = positiveNumber(vehicleProfile.currentFuelGallons);
  const fuelLevelPct = positiveNumber(vehicleProfile.fuelLevelPct);
  const explicitRange = positiveNumber(vehicleProfile.rangeMiles);
  const fullTankRange =
    tankCapacity != null && avgMpg != null
      ? roundTenths(tankCapacity * avgMpg)
      : null;
  const estimatedFuelRemaining =
    currentFuelGallons ??
    (fuelLevelPct != null && tankCapacity != null ? roundTenths((Math.min(100, fuelLevelPct) / 100) * tankCapacity) : null);
  const remainingRange =
    estimatedFuelRemaining != null && avgMpg != null
      ? roundTenths(estimatedFuelRemaining * avgMpg)
      : null;
  const knownFuelRange = explicitRange ?? remainingRange ?? fullTankRange;
  if (knownFuelRange == null && estimatedFuelRemaining == null) return null;

  const warnings: string[] = [];
  if (explicitRange == null && remainingRange == null && fullTankRange != null) {
    warnings.push('Vehicle profile only provides full-tank range capacity; current fuel remaining is unknown.');
  }

  const state = vehicleProfile.rangeSource === 'telemetry'
    ? 'cached'
    : vehicleProfile.rangeSource === 'estimated'
      ? 'estimated'
      : vehicleProfile.rangeSource === 'manual'
        ? 'manual'
        : 'unknown';

  return {
    knownFuelRange: roundTenths(knownFuelRange),
    estimatedFuelRemaining: roundTenths(estimatedFuelRemaining),
    estimatedFuelRequiredGallons: null,
    source: source('vehicle_fuel_profile', state, {
      id: vehicleProfile.id ?? null,
      source: vehicleProfile.rangeSource ?? vehicleProfile.source ?? 'vehicle_profile',
      updatedAt: vehicleProfile.updatedAt ?? null,
      confidence: vehicleProfile.confidence ?? null,
    }),
    confidence:
      vehicleProfile.rangeSource === 'telemetry' ? 0.72 :
      vehicleProfile.rangeSource === 'manual' ? 0.62 :
      vehicleProfile.rangeSource === 'estimated' ? 0.46 :
      explicitRange != null ? 0.5 :
      0.36,
    warnings,
    metadata: {
      tankCapacity,
      avgMpg,
      fuelLevelPct,
      rangeBasis:
        explicitRange != null ? 'vehicle_profile_range' :
        remainingRange != null ? 'vehicle_profile_fuel_remaining' :
        fullTankRange != null ? 'vehicle_profile_full_tank_capacity' :
        'unknown',
    },
  };
}

function resolveFuelEvidence(args: ResolveFuelRangeConfidenceArgs): FuelRangeEvidence {
  const telemetryFuel = rangeFromTelemetry(telemetryRecord(args.telemetry), args.vehicleProfile);
  if (telemetryFuel?.knownFuelRange != null || telemetryFuel?.estimatedFuelRemaining != null) {
    return telemetryFuel;
  }

  const profileFuel = rangeFromVehicleProfile(args.vehicleProfile);
  if (profileFuel?.knownFuelRange != null || profileFuel?.estimatedFuelRemaining != null) {
    return profileFuel;
  }

  return {
    knownFuelRange: null,
    estimatedFuelRemaining: null,
    estimatedFuelRequiredGallons: null,
    source: source('vehicle_fuel_data', 'missing'),
    confidence: 0.1,
    warnings: ['Vehicle fuel range data is unavailable; ECS will not guess fuel range.'],
    metadata: {
      rangeBasis: 'unavailable',
    },
  };
}

function fuelStatus(args: {
  knownFuelRange: number | null;
  estimatedTotalDistance: number | null;
  estimatedTrailDistance: number | null;
  distanceMissingTrail: boolean;
}): TripFuelRangeConfidence['fuelStatus'] {
  if (args.knownFuelRange == null || args.estimatedTotalDistance == null) return 'unknown';

  if (args.knownFuelRange < args.estimatedTotalDistance) return 'critical';

  const reserveTarget = args.estimatedTotalDistance * 1.2;
  if (args.knownFuelRange < reserveTarget) return 'recommended';

  if (args.distanceMissingTrail) return 'recommended';

  return 'sufficient';
}

export function resolveFuelRangeConfidence(args: ResolveFuelRangeConfidenceArgs): TripFuelRangeConfidence {
  const distance = resolveDistanceEvidence(args);
  const fuel = resolveFuelEvidence(args);
  const estimatedFuelRequiredGallons =
    distance.estimatedTotalDistance != null && fuel.metadata.avgMpg != null && Number(fuel.metadata.avgMpg) > 0
      ? roundTenths(distance.estimatedTotalDistance / Number(fuel.metadata.avgMpg))
      : null;
  const status = fuelStatus({
    knownFuelRange: fuel.knownFuelRange,
    estimatedTotalDistance: distance.estimatedTotalDistance,
    estimatedTrailDistance: distance.estimatedTrailDistance,
    distanceMissingTrail: distance.missingRouteParts.includes('trail route distance'),
  });
  const rangeMarginMiles =
    fuel.knownFuelRange != null && distance.estimatedTotalDistance != null
      ? roundTenths(fuel.knownFuelRange - distance.estimatedTotalDistance)
      : null;
  const warnings = [
    ...distance.warnings,
    ...fuel.warnings,
  ];

  if (status === 'critical') {
    warnings.push('Known fuel range appears below the estimated itinerary distance; fuel should be treated as critical before trail entry.');
  } else if (status === 'recommended') {
    warnings.push('Fuel is recommended before trail entry because margin is tight or route distance is incomplete.');
  }
  if ((args.preTrailFuelStops?.length ?? 0) === 0 && (status === 'recommended' || status === 'critical')) {
    warnings.push('No pre-trail fuel stop is currently selected or ranked for this itinerary.');
  }

  const confidenceScore = roundScore(
    fuel.confidence * 0.55 +
    distance.confidence * 0.35 +
    ((args.preTrailFuelStops?.length ?? 0) > 0 ? 0.1 : 0.04),
  );
  const dataUsed = [
    fuel.source,
    distance.source,
    (args.preTrailFuelStops?.length ?? 0) > 0
      ? source('pre_trail_fuel_stops', 'cached', { notes: [`${args.preTrailFuelStops?.length ?? 0} fuel stop candidate(s) available.`] })
      : source('pre_trail_fuel_stops', 'missing', { notes: ['No pre-trail fuel stop candidate is selected or ranked.'] }),
  ].filter((item): item is ItineraryDataSource => item != null);

  return {
    estimatedTotalDistance: distance.estimatedTotalDistance,
    estimatedTrailDistance: distance.estimatedTrailDistance,
    knownFuelRange: fuel.knownFuelRange,
    estimatedFuelRemaining: fuel.estimatedFuelRemaining,
    fuelStatus: status,
    confidenceScore,
    warnings,
    rangeMarginMiles,
    estimatedFuelRequiredGallons,
    fuelDataSource: fuel.source,
    distanceDataSource: distance.source,
    preTrailFuelStopCount: args.preTrailFuelStops?.length ?? 0,
    dataUsed,
    metadata: {
      fuel: fuel.metadata,
      distance: distance.metadata,
    },
  };
}
