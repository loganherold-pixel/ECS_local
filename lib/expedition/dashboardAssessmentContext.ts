import type {
  AssessmentConfidence,
  AssessmentStatus,
  ConvoySnapshot,
  ExpeditionContextSnapshot,
  ExpeditionDataPoint,
  ExpeditionDataSource,
  ExpeditionGeoPoint,
  LogisticsSnapshot,
  VehicleSnapshot,
} from './operationalAssessmentTypes';
import type { RouteLifecycleState } from '../types/expedition';

const GALLONS_TO_LITERS = 3.78541;
const DEFAULT_WATER_LITERS_PER_PERSON_PER_DAY = 3.8;

type DashboardGeoInput = {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  capturedAt?: string | null;
} | null;

export type DashboardAssessmentVehicleInput = {
  vehicleId?: string | null;
  label?: string | null;
  callsign?: string | null;
  readinessStatus?: AssessmentStatus | null;
  engineStatus?: 'nominal' | 'warning' | 'fault' | 'unknown' | null;
  disabled?: boolean | null;
  rangeRemainingMiles?: number | null;
  fuelLevelPercent?: number | null;
  fuelGallons?: number | null;
  fuelTankCapacityGal?: number | null;
  fuelSource?: ExpeditionDataSource | null;
  estimatedMpg?: number | null;
  waterGallons?: number | null;
  waterSource?: ExpeditionDataSource | null;
  payloadRiskStatus?: AssessmentStatus | null;
  lastTelemetryAt?: string | null;
};

export type DashboardAssessmentRouteInput = {
  hasActiveRoute?: boolean;
  routeCompleted?: boolean;
  routeId?: string | null;
  routeName?: string | null;
  lifecycleState?: RouteLifecycleState | null;
  currentLocation?: DashboardGeoInput;
  currentSegmentLabel?: string | null;
  progressPercent?: number | null;
  distanceRemainingMiles?: number | null;
  etaIso?: string | null;
  etaMinutes?: number | null;
  offRouteMiles?: number | null;
  knownHazards?: string[] | null;
};

export type DashboardAssessmentCampInput = {
  campCount?: number | null;
  firstCampName?: string | null;
  distanceToNextCampMiles?: number | null;
  estimatedArrivalIso?: string | null;
};

export type DashboardAssessmentPowerInput = {
  runtimeMinutes?: number | null;
  batteryPowerStatus?: AssessmentStatus | null;
  source?: ExpeditionDataSource | null;
};

export type DashboardAssessmentContextInput = {
  capturedAt?: string | null;
  expeditionId?: string | null;
  offlineMode?: boolean;
  route?: DashboardAssessmentRouteInput;
  vehicle?: DashboardAssessmentVehicleInput | null;
  convoy?: {
    teamId?: string | null;
    teamMemberCount?: number | null;
    activeMemberCount?: number | null;
    communicationsStatus?: 'online' | 'degraded' | 'offline' | 'unknown' | null;
  } | null;
  camp?: DashboardAssessmentCampInput | null;
  power?: DashboardAssessmentPowerInput | null;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function point<T>(
  value: T | null | undefined,
  now: string,
  source: ExpeditionDataSource = 'unknown',
  confidence: AssessmentConfidence = source === 'unknown' ? 'low' : 'medium',
  notes?: string | null,
): ExpeditionDataPoint<T> {
  return {
    value: value ?? null,
    source,
    updatedAt: now,
    confidence,
    reliability: confidence,
    notes: notes ?? null,
  };
}

function positive(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function nonNegative(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function clampPercent(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number == null) return null;
  return Math.max(0, Math.min(100, number));
}

function deriveEtaIso(now: string, etaIso?: string | null, etaMinutes?: number | null): string | null {
  if (etaIso && !Number.isNaN(Date.parse(etaIso))) return etaIso;
  const minutes = positive(etaMinutes);
  if (minutes == null) return null;
  return new Date(Date.parse(now) + minutes * 60 * 1000).toISOString();
}

function deriveRangeMiles(vehicle?: DashboardAssessmentVehicleInput | null): number | null {
  const explicitRange = positive(vehicle?.rangeRemainingMiles);
  if (explicitRange != null) return explicitRange;

  const fuelGallons = positive(vehicle?.fuelGallons);
  const estimatedMpg = positive(vehicle?.estimatedMpg);
  if (fuelGallons != null && estimatedMpg != null) {
    return Number((fuelGallons * estimatedMpg).toFixed(1));
  }

  const fuelPercent = clampPercent(vehicle?.fuelLevelPercent);
  const tankGallons = positive(vehicle?.fuelTankCapacityGal);
  if (fuelPercent != null && tankGallons != null && estimatedMpg != null) {
    return Number((tankGallons * (fuelPercent / 100) * estimatedMpg).toFixed(1));
  }

  return null;
}

function deriveFuelPercent(vehicle?: DashboardAssessmentVehicleInput | null): number | null {
  const explicitPercent = clampPercent(vehicle?.fuelLevelPercent);
  if (explicitPercent != null) return explicitPercent;

  const fuelGallons = nonNegative(vehicle?.fuelGallons);
  const tankGallons = positive(vehicle?.fuelTankCapacityGal);
  if (fuelGallons != null && tankGallons != null) {
    return Math.round(Math.max(0, Math.min(100, (fuelGallons / tankGallons) * 100)));
  }

  return null;
}

function deriveFuelGallons(vehicle?: DashboardAssessmentVehicleInput | null): number | null {
  const explicitFuelGallons = nonNegative(vehicle?.fuelGallons);
  if (explicitFuelGallons != null) return explicitFuelGallons;

  const fuelPercent = clampPercent(vehicle?.fuelLevelPercent);
  const tankGallons = positive(vehicle?.fuelTankCapacityGal);
  if (fuelPercent != null && tankGallons != null) {
    return Number((tankGallons * (fuelPercent / 100)).toFixed(1));
  }

  return null;
}

function routeLifecycle(input?: DashboardAssessmentRouteInput): RouteLifecycleState {
  if (input?.lifecycleState) return input.lifecycleState;
  if (input?.routeCompleted) return 'completed';
  return input?.hasActiveRoute ? 'active' : 'idle';
}

function buildRoute(input: DashboardAssessmentContextInput, now: string): ExpeditionContextSnapshot['route'] {
  const route = input.route ?? {};
  const hasActiveRoute = Boolean(route.hasActiveRoute);
  const lifecycleState = routeLifecycle(route);
  const currentLocation =
    route.currentLocation &&
    typeof route.currentLocation.latitude === 'number' &&
    typeof route.currentLocation.longitude === 'number'
      ? point<ExpeditionGeoPoint>(
          {
            latitude: route.currentLocation.latitude,
            longitude: route.currentLocation.longitude,
            accuracyMeters: route.currentLocation.accuracyMeters ?? null,
          },
          route.currentLocation.capturedAt ?? now,
          'liveGps',
          'medium',
        )
      : undefined;

  const etaIso = deriveEtaIso(now, route.etaIso, route.etaMinutes ?? null);
  const offRouteMiles = nonNegative(route.offRouteMiles);
  const offRouteKnown = offRouteMiles != null;

  return {
    routeId: route.routeId ?? null,
    routeName: point(route.routeName ?? null, now, hasActiveRoute ? 'cached' : 'unknown'),
    lifecycleState: point(lifecycleState, now, hasActiveRoute ? 'cached' : 'unknown'),
    currentLocation,
    currentSegmentLabel: route.currentSegmentLabel ? point(route.currentSegmentLabel, now, 'cached') : undefined,
    progressPercent: hasActiveRoute ? point(clampPercent(route.progressPercent), now, 'cached') : undefined,
    distanceRemainingMiles: hasActiveRoute ? point(nonNegative(route.distanceRemainingMiles), now, 'cached') : undefined,
    estimatedArrivalIso: hasActiveRoute ? point(etaIso, now, 'cached') : undefined,
    routeConfidence: point<AssessmentConfidence>(hasActiveRoute ? 'medium' : 'low', now, hasActiveRoute ? 'cached' : 'unknown'),
    knownHazards: Array.isArray(route.knownHazards) ? point(route.knownHazards, now, 'cached') : undefined,
    offRoute: hasActiveRoute
      ? point(
          offRouteKnown ? offRouteMiles > 0.2 : false,
          now,
          offRouteKnown ? 'liveGps' : 'cached',
          offRouteKnown ? 'medium' : 'low',
          offRouteKnown ? null : 'Active guidance has not reported an off-route condition.',
        )
      : undefined,
  };
}

function buildVehicle(vehicle: DashboardAssessmentVehicleInput | null | undefined, now: string): VehicleSnapshot[] {
  if (!vehicle?.vehicleId && !vehicle?.label) return [];

  const fuelSource = vehicle.fuelSource ?? 'userManual';
  const rangeRemainingMiles = deriveRangeMiles(vehicle);
  const fuelLevelPercent = deriveFuelPercent(vehicle);

  return [
    {
      vehicleId: vehicle.vehicleId ?? null,
      callsign: vehicle.callsign ? point(vehicle.callsign, now, 'userManual') : undefined,
      label: point(vehicle.label ?? 'Active vehicle', now, 'userManual'),
      readinessStatus: point(vehicle.readinessStatus ?? 'normal', now, 'cached'),
      engineStatus: point(vehicle.engineStatus ?? 'unknown', now, vehicle.engineStatus ? 'vehicleObd' : 'unknown'),
      disabled: point(Boolean(vehicle.disabled), now, 'userManual'),
      rangeRemainingMiles: rangeRemainingMiles != null ? point(rangeRemainingMiles, now, fuelSource) : undefined,
      fuelLevelPercent: fuelLevelPercent != null ? point(fuelLevelPercent, now, fuelSource) : undefined,
      payloadRiskStatus: vehicle.payloadRiskStatus ? point(vehicle.payloadRiskStatus, now, 'cached') : undefined,
      lastTelemetryAt: vehicle.lastTelemetryAt ? point(vehicle.lastTelemetryAt, now, 'vehicleObd') : undefined,
    },
  ];
}

function buildLogistics(
  input: DashboardAssessmentContextInput,
  vehicle: DashboardAssessmentVehicleInput | null | undefined,
  now: string,
): LogisticsSnapshot {
  const route = input.route ?? {};
  const fuelSource = vehicle?.fuelSource ?? 'userManual';
  const waterSource = vehicle?.waterSource ?? 'userManual';
  const rangeRemainingMiles = deriveRangeMiles(vehicle);
  const fuelGallons = deriveFuelGallons(vehicle);
  const fuelLevelPercent = deriveFuelPercent(vehicle);
  const distanceRemainingMiles = nonNegative(route.distanceRemainingMiles);
  const waterGallons = nonNegative(vehicle?.waterGallons);
  const waterLiters = waterGallons != null ? Number((waterGallons * GALLONS_TO_LITERS).toFixed(1)) : null;
  const teamMemberCount = Math.max(1, Math.round(positive(input.convoy?.teamMemberCount) ?? 1));
  const waterEnduranceDays =
    waterLiters != null
      ? Number((waterLiters / (teamMemberCount * DEFAULT_WATER_LITERS_PER_PERSON_PER_DAY)).toFixed(1))
      : null;
  const powerHours = positive(input.power?.runtimeMinutes);

  return {
    fuelRangeMiles: rangeRemainingMiles != null ? point(rangeRemainingMiles, now, fuelSource) : undefined,
    fuelRemainingGallons: fuelGallons != null ? point(fuelGallons, now, fuelSource) : undefined,
    fuelLevelPercent: fuelLevelPercent != null ? point(fuelLevelPercent, now, fuelSource) : undefined,
    distanceRemainingMiles: distanceRemainingMiles != null ? point(distanceRemainingMiles, now, 'cached') : undefined,
    waterRemainingLiters: waterLiters != null ? point(waterLiters, now, waterSource) : undefined,
    waterEnduranceDays: waterEnduranceDays != null ? point(waterEnduranceDays, now, waterSource) : undefined,
    groupSize: point(teamMemberCount, now, 'userManual'),
    powerHoursRemaining: powerHours != null ? point(Number((powerHours / 60).toFixed(1)), now, input.power?.source ?? 'vehicleObd') : undefined,
    batteryPowerStatus: input.power?.batteryPowerStatus ? point(input.power.batteryPowerStatus, now, input.power.source ?? 'vehicleObd') : undefined,
    supplyStatus:
      rangeRemainingMiles != null && waterLiters != null
        ? point<AssessmentStatus>('normal', now, 'cached', 'medium')
        : undefined,
  };
}

function buildConvoy(input: DashboardAssessmentContextInput, now: string): ConvoySnapshot {
  const convoy = input.convoy ?? {};
  const teamMemberCount = Math.max(1, Math.round(positive(convoy.teamMemberCount) ?? 1));
  const activeMemberCount = Math.max(1, Math.round(positive(convoy.activeMemberCount) ?? teamMemberCount));

  return {
    teamId: convoy.teamId ?? null,
    teamMemberCount: point(teamMemberCount, now, 'cached'),
    activeMemberCount: point(activeMemberCount, now, 'cached'),
    communicationsStatus: point(convoy.communicationsStatus ?? 'unknown', now, convoy.communicationsStatus ? 'cached' : 'unknown'),
  };
}

function buildCamp(input: DashboardAssessmentContextInput, now: string): ExpeditionContextSnapshot['camp'] {
  const camp = input.camp ?? {};
  const campCount = Math.max(0, Math.round(nonNegative(camp.campCount) ?? 0));
  const hasRouteCamps = campCount > 0;
  const hasActiveRoute = Boolean(input.route?.hasActiveRoute);
  const routeEtaIso = deriveEtaIso(now, input.route?.etaIso ?? null, input.route?.etaMinutes ?? null);
  const hasCampReviewContext = hasRouteCamps || (hasActiveRoute && routeEtaIso != null);
  const campSource: ExpeditionDataSource = hasCampReviewContext ? 'cached' : 'unknown';

  return {
    hasRouteCamps: point(
      hasRouteCamps,
      now,
      campSource,
      hasRouteCamps ? 'medium' : hasCampReviewContext ? 'low' : 'low',
      hasRouteCamps ? null : hasCampReviewContext ? 'No confirmed camp waypoint is attached yet; route camp review remains available.' : null,
    ),
    plannedCampStatus: point(
      hasRouteCamps ? 'planned' : hasCampReviewContext ? 'unconfirmed' : 'unknown',
      now,
      campSource,
    ),
    nextCampName: hasCampReviewContext
      ? point(camp.firstCampName ?? (hasRouteCamps ? 'Route camp' : 'Route corridor camp review'), now, campSource)
      : undefined,
    estimatedArrivalIso: hasCampReviewContext ? point(camp.estimatedArrivalIso ?? routeEtaIso, now, campSource) : undefined,
    distanceToNextCampMiles:
      hasCampReviewContext && nonNegative(camp.distanceToNextCampMiles) != null
        ? point(nonNegative(camp.distanceToNextCampMiles), now, campSource)
        : undefined,
    campReadinessStatus: hasCampReviewContext
      ? point<AssessmentStatus>(hasRouteCamps ? 'normal' : 'caution', now, campSource, hasRouteCamps ? 'medium' : 'low')
      : undefined,
    campConfirmed: hasCampReviewContext ? point(hasRouteCamps, now, campSource, hasRouteCamps ? 'medium' : 'low') : undefined,
  };
}

export function buildDashboardAssessmentContext(
  input: DashboardAssessmentContextInput,
): ExpeditionContextSnapshot {
  const capturedAt = input.capturedAt && !Number.isNaN(Date.parse(input.capturedAt))
    ? input.capturedAt
    : new Date().toISOString();
  const vehicle = input.vehicle ?? null;

  return {
    expeditionId: input.expeditionId ?? input.route?.routeId ?? null,
    capturedAt,
    offlineMode: Boolean(input.offlineMode),
    manualInputAvailable: true,
    route: buildRoute(input, capturedAt),
    convoy: buildConvoy(input, capturedAt),
    camp: buildCamp(input, capturedAt),
    logistics: buildLogistics(input, vehicle, capturedAt),
    vehicles: buildVehicle(vehicle, capturedAt),
  };
}
