import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampLikelihoodLevel,
  CampOpsConfidence,
  CampResourceDebt,
  CampResourceDebtCategory,
  CampResourceDebtItem,
  CampResourceMargin,
  CampResourceMarginStatus,
  CampResourceMarginSummary,
  CampResourceDebtStatus,
  CampSearchContext,
  CampOpsServiceAvailability,
} from './campOpsTypes';
import {
  resolveCampOpsResourceDebtConfig,
  type CampOpsResourceDebtConfig,
} from './campOpsResourceDebtConfig';

export type CampResourceDebtInput = {
  context: CampSearchContext;
  candidate: CampCandidate;
  enrichment: CampCandidateEnrichment;
  config?: Partial<CampOpsResourceDebtConfig>;
};

const CONFIDENCE_SCORE: Record<CampOpsConfidence, number> = {
  high: 100,
  medium: 75,
  low: 45,
  unknown: 20,
};

const OCCUPANCY_CONFIDENCE_SCORE: Record<CampLikelihoodLevel, number> = {
  low: 100,
  moderate: 72,
  high: 38,
  unknown: 50,
};

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function minConfidence(values: Array<CampOpsConfidence | null | undefined>): CampOpsConfidence {
  const present = values.filter((value): value is CampOpsConfidence => Boolean(value));
  if (present.length === 0) return 'unknown';
  return present.reduce((lowest, value) =>
    CONFIDENCE_RANK[value] < CONFIDENCE_RANK[lowest] ? value : lowest,
  );
}

function marginStatusFromThresholds(
  value: number | null,
  comfortableThreshold: number,
  tightThreshold: number,
): CampResourceMarginStatus {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= comfortableThreshold) return 'comfortable';
  if (value >= tightThreshold) return 'tight';
  return 'critical';
}

function buildMargin(
  value: number | null,
  unit: CampResourceMargin['unit'],
  status: CampResourceMarginStatus,
  confidence: CampOpsConfidence,
  basis: CampResourceMargin['basis'],
  reason: string,
  missingDataFields: string[] = [],
): CampResourceMargin {
  return {
    value: value == null ? null : Math.round(value * 10) / 10,
    unit,
    status,
    confidence,
    basis,
    reason,
    missingDataFields: Array.from(new Set(missingDataFields.filter(Boolean))),
  };
}

function buildDebtItem(
  category: CampResourceDebtCategory,
  status: CampResourceDebtStatus,
  value: number | null,
  unit: CampResourceDebtItem['unit'],
  reason: string,
  missingDataFields: string[] = [],
  confidence: CampOpsConfidence = missingDataFields.length > 0 ? 'unknown' : 'medium',
): CampResourceDebtItem {
  return {
    category,
    status,
    value,
    unit,
    reason,
    missingDataFields: Array.from(new Set(missingDataFields.filter(Boolean))),
    confidence,
  };
}

function statusFromThresholds(
  value: number,
  safeThreshold: number,
  tightThreshold: number,
): CampResourceDebtStatus {
  if (value >= safeThreshold) return 'safe';
  if (value >= tightThreshold) return 'tight';
  return 'critical';
}

function serviceDistanceMiles(service: CampOpsServiceAvailability | null | undefined): number | null {
  if (!service || service.status === 'closed') return null;
  return (
    finiteNumber(service.routeAwareDistanceMiles) ??
    finiteNumber(service.distanceFromCampMiles) ??
    finiteNumber(service.distanceFromRouteMiles)
  );
}

function serviceDistanceBasis(service: CampOpsServiceAvailability | null | undefined): CampResourceMargin['basis'] {
  if (!service || service.status === 'closed') return 'unknown';
  if (finiteNumber(service.routeAwareDistanceMiles) != null) return 'route_aware';
  if (finiteNumber(service.distanceFromCampMiles) != null || finiteNumber(service.distanceFromRouteMiles) != null) {
    return 'straight_line';
  }
  return 'unknown';
}

function milesBetween(
  left: { latitude: number; longitude: number } | null | undefined,
  right: { latitude: number; longitude: number } | null | undefined,
): number | null {
  if (!left || !right) return null;
  const leftLat = finiteNumber(left.latitude);
  const leftLng = finiteNumber(left.longitude);
  const rightLat = finiteNumber(right.latitude);
  const rightLng = finiteNumber(right.longitude);
  if (leftLat == null || leftLng == null || rightLat == null || rightLng == null) return null;
  const toRad = (value: number) => value * Math.PI / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(rightLat - leftLat);
  const dLng = toRad(rightLng - leftLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(leftLat)) * Math.cos(toRad(rightLat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceToCampMiles(
  context: CampSearchContext,
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment,
): { value: number | null; basis: CampResourceMargin['basis']; missing: string[] } {
  const routeAware = finiteNumber(enrichment.routeDistanceToCampMiles);
  if (routeAware != null) return { value: routeAware, basis: 'route_aware', missing: [] };
  const direct =
    finiteNumber(enrichment.straightLineDistanceToCampMiles) ??
    milesBetween(context.currentLocation?.value ?? null, candidate.location);
  if (direct != null) return { value: direct, basis: 'straight_line', missing: ['routeDistanceToCampMiles'] };
  return { value: null, basis: 'unknown', missing: ['routeDistanceToCampMiles', 'currentLocation'] };
}

function isConfirmedOpen(service: CampOpsServiceAvailability | null | undefined): boolean {
  return service?.status === 'open';
}

function isUnknownService(service: CampOpsServiceAvailability | null | undefined): boolean {
  return Boolean(service && service.status !== 'open');
}

function calculateFuelDebt(
  context: CampSearchContext,
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment,
  config: CampOpsResourceDebtConfig,
): { debt: CampResourceDebtItem; margins: Pick<CampResourceMarginSummary, 'fuelToCamp' | 'fuelAfterCamp' | 'fuelToNextKnownFuel' | 'fuelExitMargin' | 'serviceConfidence'> } {
  const campDistance = distanceToCampMiles(context, candidate, enrichment);
  const exitMarginMiles =
    enrichment.fuelImpact?.unit === 'miles' ? finiteNumber(enrichment.fuelImpact.value) : null;
  const nearestFuelDistance = serviceDistanceMiles(enrichment.nearestFuel);
  const nearestExitDistance = serviceDistanceMiles(enrichment.nearestTownOrExit);
  const nearestFuelOrExitDistance = Math.min(
    nearestFuelDistance ?? Number.POSITIVE_INFINITY,
    nearestExitDistance ?? Number.POSITIVE_INFINITY,
  );
  const serviceBasis = nearestFuelDistance != null && nearestFuelDistance <= (nearestExitDistance ?? Number.POSITIVE_INFINITY)
    ? serviceDistanceBasis(enrichment.nearestFuel)
    : serviceDistanceBasis(enrichment.nearestTownOrExit);
  const reserveMiles = finiteNumber(context.resourceState?.fuelReserveMiles ?? context.resourceState?.fuelRangeMiles);
  const convoyLowFuelReserve = finiteNumber(context.convoyProfile?.lowestFuelReserveVehicle?.fuelReserveMiles);
  const limitingReserveMiles =
    reserveMiles != null && convoyLowFuelReserve != null
      ? Math.min(reserveMiles, convoyLowFuelReserve)
      : reserveMiles ?? convoyLowFuelReserve;
  const fuelAfterCamp =
    limitingReserveMiles != null && campDistance.value != null
      ? Math.max(0, limitingReserveMiles - campDistance.value)
      : null;
  const routeAwareExitMargin =
    fuelAfterCamp != null && Number.isFinite(nearestFuelOrExitDistance)
      ? Math.max(0, fuelAfterCamp - nearestFuelOrExitDistance)
      : null;
  const serviceBasedExitMargin =
    limitingReserveMiles != null && Number.isFinite(nearestFuelOrExitDistance)
      ? Math.max(0, limitingReserveMiles - nearestFuelOrExitDistance)
      : null;
  const convoyReserveShortfall =
    convoyLowFuelReserve == null ? 0 : Math.max(0, config.safeFuelExitMarginMiles - convoyLowFuelReserve);
  const limitingExitMarginMiles =
    routeAwareExitMargin != null
      ? routeAwareExitMargin
      : (exitMarginMiles ?? serviceBasedExitMargin) != null
        ? Math.max(0, (exitMarginMiles ?? serviceBasedExitMargin)! - convoyReserveShortfall)
      : convoyLowFuelReserve;
  const serviceConfidence = minConfidence([
    enrichment.nearestFuel?.confidence,
    enrichment.nearestTownOrExit?.confidence,
  ]);
  const fuelMargins = {
    fuelToCamp: buildMargin(
      campDistance.value,
      'miles',
      marginStatusFromThresholds(campDistance.value == null ? null : (limitingReserveMiles ?? 0) - campDistance.value, config.safeFuelExitMarginMiles, config.tightFuelExitMarginMiles),
      campDistance.basis === 'unknown' ? 'unknown' : context.routeProgress?.confidence ?? 'medium',
      campDistance.basis,
      campDistance.basis === 'route_aware'
        ? 'Fuel-to-camp uses route-aware camp distance.'
        : campDistance.basis === 'straight_line'
          ? 'Fuel-to-camp is using straight-line fallback because route-aware camp distance is unavailable.'
          : 'Fuel-to-camp is unknown because route-aware and fallback camp distance are unavailable.',
      campDistance.missing,
    ),
    fuelAfterCamp: buildMargin(
      fuelAfterCamp,
      'miles',
      marginStatusFromThresholds(fuelAfterCamp, config.safeFuelExitMarginMiles, config.tightFuelExitMarginMiles),
      minConfidence([context.resourceState?.confidence, context.convoyProfile?.lowestFuelReserveVehicle?.confidence]),
      fuelAfterCamp == null ? 'unknown' : campDistance.basis,
      fuelAfterCamp == null
        ? 'Fuel after camp is unknown because reserve or camp distance is missing.'
        : 'Fuel after camp uses the limiting fuel reserve and camp distance.',
      fuelAfterCamp == null ? ['fuelReserveMiles', ...campDistance.missing] : [],
    ),
    fuelToNextKnownFuel: buildMargin(
      Number.isFinite(nearestFuelOrExitDistance) ? nearestFuelOrExitDistance : null,
      'miles',
      (Number.isFinite(nearestFuelOrExitDistance) && nearestFuelOrExitDistance <= config.tightFuelExitMarginMiles) ? 'comfortable' : 'unknown',
      serviceConfidence,
      serviceBasis,
      Number.isFinite(nearestFuelOrExitDistance)
        ? 'Fuel-to-next-known-fuel uses nearest fuel or exit service distance.'
        : 'Fuel-to-next-known-fuel is unknown because no usable fuel or exit service distance exists.',
      Number.isFinite(nearestFuelOrExitDistance) ? [] : ['nearestFuel', 'nearestTownOrExit'],
    ),
    fuelExitMargin: buildMargin(
      limitingExitMarginMiles,
      'miles',
      marginStatusFromThresholds(limitingExitMarginMiles, config.safeFuelExitMarginMiles, config.tightFuelExitMarginMiles),
      minConfidence([
        context.resourceState?.confidence,
        context.convoyProfile?.lowestFuelReserveVehicle?.confidence,
        enrichment.fuelImpact?.confidence,
        serviceConfidence,
      ]),
      routeAwareExitMargin != null
        ? (campDistance.basis === 'route_aware' || serviceBasis === 'route_aware' ? 'route_aware' : 'straight_line')
        : exitMarginMiles != null
          ? 'provided_margin'
          : serviceBasedExitMargin != null
            ? serviceBasis
            : 'unknown',
      routeAwareExitMargin != null
        ? 'Fuel exit margin subtracts route-aware camp distance and next fuel/exit distance where available.'
        : exitMarginMiles != null
          ? 'Fuel exit margin uses provided CampOps fuel impact because route-aware distance is incomplete.'
          : 'Fuel exit margin uses available service distance fallback.',
      routeAwareExitMargin != null || exitMarginMiles != null || serviceBasedExitMargin != null ? [] : ['fuelImpact.value', 'nearestFuel', 'nearestTownOrExit'],
    ),
    serviceConfidence,
  };

  if (limitingExitMarginMiles == null) {
    const fallbackReserve = finiteNumber(context.resourceState?.fuelReserveMiles);
    if (fallbackReserve == null) {
      return {
        debt: buildDebtItem(
          'fuel',
          'unknown',
          null,
          'miles',
          'Fuel debt is unknown because camp-to-exit or next-fuel margin is missing.',
          ['fuelImpact.value', 'fuelReserveMiles'],
          'unknown',
        ),
        margins: fuelMargins,
      };
    }
    return {
      debt: buildDebtItem(
        'fuel',
        statusFromThresholds(fallbackReserve, config.safeFuelExitMarginMiles, config.tightFuelExitMarginMiles),
        fallbackReserve,
        'miles',
        `Fuel reserve estimate after choosing this camp is ${fallbackReserve} miles.`,
        fuelMargins.fuelExitMargin.basis === 'provided_margin' ? [] : fuelMargins.fuelExitMargin.missingDataFields,
        context.resourceState?.confidence ?? 'medium',
      ),
      margins: fuelMargins,
    };
  }

  const basedOnConvoyLimiter = convoyLowFuelReserve != null && convoyReserveShortfall > 0;
  const basedOnRouteAwareDistance = routeAwareExitMargin != null;
  const basedOnServiceDistance = !basedOnRouteAwareDistance && exitMarginMiles == null && serviceBasedExitMargin != null;
  return {
    debt: buildDebtItem(
      'fuel',
      statusFromThresholds(limitingExitMarginMiles, config.safeFuelExitMarginMiles, config.tightFuelExitMarginMiles),
      limitingExitMarginMiles,
      'miles',
      basedOnConvoyLimiter
        ? `Estimated fuel margin is ${limitingExitMarginMiles} miles after applying the convoy limiting vehicle/resource.`
        : basedOnRouteAwareDistance
          ? `Estimated fuel margin is ${limitingExitMarginMiles} miles using route-aware distance to camp and next known fuel/exit where available.`
          : basedOnServiceDistance
            ? `Estimated fuel margin is ${limitingExitMarginMiles} miles after reaching the nearest known fuel or exit.`
        : `Estimated fuel margin after reaching camp and exiting to next known fuel is ${limitingExitMarginMiles} miles.`,
      fuelMargins.fuelExitMargin.basis === 'provided_margin' ? ['routeDistanceToCampMiles'] : [],
      minConfidence([
        context.convoyProfile?.lowestFuelReserveVehicle?.confidence,
        enrichment.fuelImpact?.confidence,
        enrichment.nearestFuel?.confidence,
        enrichment.nearestTownOrExit?.confidence,
        context.routeProgress?.confidence,
      ]),
    ),
    margins: fuelMargins,
  };
}

function heatWaterMultiplier(enrichment: CampCandidateEnrichment, config: CampOpsResourceDebtConfig): number {
  if (enrichment.heatRisk === 'high') return config.highHeatWaterMultiplier;
  if (enrichment.heatRisk === 'medium') return config.mediumHeatWaterMultiplier;
  return 1;
}

function calculateWaterNeedGallons(
  context: CampSearchContext,
  enrichment: CampCandidateEnrichment,
  config: CampOpsResourceDebtConfig,
): number | null {
  const people = finiteNumber(context.convoyProfile?.peopleCount);
  const pets = finiteNumber(context.convoyProfile?.petCount) ?? 0;
  if (people == null) return null;
  const multiplier = heatWaterMultiplier(enrichment, config);
  return people * config.gallonsPerPersonNextDay * multiplier +
    pets * config.gallonsPerPetNextDay * multiplier +
    config.waterSafetyBufferGallons;
}

function calculateWaterDebt(
  context: CampSearchContext,
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment,
  config: CampOpsResourceDebtConfig,
): { debt: CampResourceDebtItem; margins: Pick<CampResourceMarginSummary, 'waterToCamp' | 'waterAfterCamp' | 'waterNextDayMargin'> } {
  const campDistance = distanceToCampMiles(context, candidate, enrichment);
  const waterNeedGallons = calculateWaterNeedGallons(context, enrichment, config);
  const projectedWaterRemaining =
    enrichment.waterImpact?.unit === 'gallons' ? finiteNumber(enrichment.waterImpact.value) : null;
  const convoyLowWaterRemaining = finiteNumber(context.convoyProfile?.lowestWaterReserveVehicle?.waterGallons);
  const waterRemaining =
    projectedWaterRemaining != null && convoyLowWaterRemaining != null
      ? Math.min(projectedWaterRemaining, convoyLowWaterRemaining)
      : projectedWaterRemaining ?? convoyLowWaterRemaining;
  const people = finiteNumber(context.convoyProfile?.peopleCount);
  const pets = finiteNumber(context.convoyProfile?.petCount) ?? 0;
  const waterToCamp =
    campDistance.value != null && people != null
      ? (people * config.gallonsPerPersonTravelDay + pets * config.gallonsPerPetTravelDay) * heatWaterMultiplier(enrichment, config)
      : null;
  const waterAfterCamp =
    waterRemaining != null && waterToCamp != null
      ? Math.max(0, waterRemaining - waterToCamp)
      : waterRemaining;
  const waterNextDayMargin =
    waterAfterCamp != null && waterNeedGallons != null
      ? waterAfterCamp - waterNeedGallons
      : null;
  const nearestWaterDistance = serviceDistanceMiles(enrichment.nearestWater);
  const waterMargins = {
    waterToCamp: buildMargin(
      waterToCamp,
      'gallons',
      waterToCamp == null ? 'unknown' : 'comfortable',
      campDistance.basis === 'unknown' ? 'unknown' : minConfidence([context.routeProgress?.confidence, context.convoyProfile?.confidence]),
      waterToCamp == null ? 'unknown' : 'configured_default',
      waterToCamp == null
        ? 'Water-to-camp is unknown because group size or camp distance is missing.'
        : `Water-to-camp uses configured people/pet travel-day defaults${enrichment.heatRisk === 'high' || enrichment.heatRisk === 'medium' ? ' with heat adjustment' : ''}.`,
      waterToCamp == null ? ['convoyProfile.peopleCount', ...campDistance.missing] : [],
    ),
    waterAfterCamp: buildMargin(
      waterAfterCamp,
      'gallons',
      marginStatusFromThresholds(waterAfterCamp, config.waterSafetyBufferGallons * 2, 0),
      minConfidence([context.resourceState?.confidence, context.convoyProfile?.lowestWaterReserveVehicle?.confidence, enrichment.waterImpact?.confidence]),
      waterAfterCamp == null ? 'unknown' : waterToCamp == null ? 'provided_margin' : 'configured_default',
      waterAfterCamp == null
        ? 'Water after camp is unknown because projected water remaining is missing.'
        : 'Water after camp uses the convoy limiting water amount and travel-day consumption where available.',
      waterAfterCamp == null ? ['waterImpact.value'] : [],
    ),
    waterNextDayMargin: buildMargin(
      waterNextDayMargin,
      'gallons',
      marginStatusFromThresholds(waterNextDayMargin, config.waterSafetyBufferGallons, 0),
      minConfidence([context.resourceState?.confidence, context.convoyProfile?.lowestWaterReserveVehicle?.confidence, enrichment.waterImpact?.confidence]),
      waterNextDayMargin == null ? 'unknown' : waterToCamp == null ? 'provided_margin' : 'configured_default',
      waterNextDayMargin == null
        ? 'Water next-day margin is unknown because water remaining or group size is missing.'
        : `Water next-day margin accounts for people, pets, buffer, and ${enrichment.heatRisk === 'high' || enrichment.heatRisk === 'medium' ? 'heat-adjusted demand' : 'configured demand defaults'}.`,
      waterNextDayMargin == null ? ['waterImpact.value', 'convoyProfile.peopleCount'] : [],
    ),
  };

  if (waterRemaining == null) {
    return {
      debt: buildDebtItem(
        'water',
        'unknown',
        null,
        enrichment.waterImpact?.unit === 'percent' ? 'unknown' : 'gallons',
        'Water debt is unknown because projected gallons remaining are missing.',
        ['waterImpact.value'],
        'unknown',
      ),
      margins: waterMargins,
    };
  }
  if (waterNeedGallons == null) {
    return {
      debt: buildDebtItem(
        'water',
        'unknown',
        waterRemaining,
        'gallons',
        'Water debt is unknown because group size is missing.',
        ['convoyProfile.peopleCount'],
        enrichment.waterImpact?.confidence ?? 'medium',
      ),
      margins: waterMargins,
    };
  }

  const surplus = waterNextDayMargin ?? (waterRemaining - waterNeedGallons);
  let status: CampResourceDebtStatus =
    surplus >= config.waterSafetyBufferGallons ? 'safe' : surplus >= 0 ? 'tight' : 'critical';
  if (status === 'critical' && nearestWaterDistance != null) {
    if (isConfirmedOpen(enrichment.nearestWater) && nearestWaterDistance <= 10) {
      status = 'tight';
    } else if (isUnknownService(enrichment.nearestWater) && nearestWaterDistance <= 10) {
      status = 'unknown';
    }
  }
  const basedOnConvoyLimiter =
    convoyLowWaterRemaining != null && convoyLowWaterRemaining <= (projectedWaterRemaining ?? convoyLowWaterRemaining);

  return {
    debt: buildDebtItem(
      'water',
      status,
      surplus,
      'gallons',
      basedOnConvoyLimiter
        ? `Projected water margin after camp and next day is ${surplus.toFixed(1)} gallons, based on the convoy limiting vehicle/resource.`
        : nearestWaterDistance != null
          ? `Projected water margin after camp and next day is ${surplus.toFixed(1)} gallons, with nearest known water ${Math.round(nearestWaterDistance * 10) / 10} miles from camp.`
        : `Projected water margin after camp and next day is ${surplus.toFixed(1)} gallons.`,
      [
        ...(isUnknownService(enrichment.nearestWater) ? ['nearestWater.status'] : []),
        ...(waterToCamp == null ? campDistance.missing : []),
      ],
      context.convoyProfile?.lowestWaterReserveVehicle?.confidence ??
        enrichment.waterImpact?.confidence ??
        enrichment.nearestWater?.confidence ??
        'medium',
    ),
    margins: waterMargins,
  };
}

function safeArrivalLimitIso(context: CampSearchContext): string | null {
  return context.desiredArrivalWindow?.latestAcceptableIso ?? context.desiredArrivalWindow?.endIso ?? null;
}

function calculateDaylightDebt(
  context: CampSearchContext,
  enrichment: CampCandidateEnrichment,
  config: CampOpsResourceDebtConfig,
): CampResourceDebtItem {
  let marginMinutes = finiteNumber(enrichment.sunsetMarginMinutes);
  const arrivalLimitIso = safeArrivalLimitIso(context);
  if (marginMinutes == null && enrichment.etaIso && arrivalLimitIso) {
    const etaMs = Date.parse(enrichment.etaIso);
    const limitMs = Date.parse(arrivalLimitIso);
    if (Number.isFinite(etaMs) && Number.isFinite(limitMs)) {
      marginMinutes = (limitMs - etaMs) / 60000;
    }
  }
  if (marginMinutes == null) {
    return buildDebtItem(
      'daylight',
      'unknown',
      null,
      'minutes',
      'Daylight debt is unknown because ETA, sunset, or safe-arrival margin is missing.',
      ['etaIso', 'sunsetMarginMinutes'],
      'unknown',
    );
  }

  const status: CampResourceDebtStatus =
    marginMinutes < config.tightDaylightMarginMinutes
      ? 'after_dark'
      : marginMinutes < config.safeDaylightMarginMinutes
        ? 'tight'
        : 'safe';

  return buildDebtItem(
    'daylight',
    status,
    Math.round(marginMinutes),
    'minutes',
    `Estimated daylight or safe-arrival margin is ${Math.round(marginMinutes)} minutes.`,
    [],
    'medium',
  );
}

function freshnessScore(context: CampSearchContext, candidate: CampCandidate, config: CampOpsResourceDebtConfig): number {
  if (!candidate.lastVerifiedDate) return 45;
  const nowMs = Date.parse(context.currentTimeIso);
  const verifiedMs = Date.parse(candidate.lastVerifiedDate);
  if (!Number.isFinite(nowMs) || !Number.isFinite(verifiedMs)) return 45;
  const daysOld = Math.max(0, (nowMs - verifiedMs) / 86400000);
  if (daysOld <= config.freshnessSafeDays) return 100;
  if (daysOld <= config.freshnessTightDays) return 68;
  return 35;
}

function calculateCampUncertaintyDebt(
  context: CampSearchContext,
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment,
  config: CampOpsResourceDebtConfig,
): CampResourceDebtItem {
  const uncertaintyScore = Math.round(
    CONFIDENCE_SCORE[candidate.sourceConfidence] * 0.2 +
      CONFIDENCE_SCORE[enrichment.dataConfidence] * 0.3 +
      CONFIDENCE_SCORE[enrichment.legalConfidence] * 0.25 +
      OCCUPANCY_CONFIDENCE_SCORE[enrichment.occupancyLikelihood] * 0.15 +
      freshnessScore(context, candidate, config) * 0.1,
  );
  const status = statusFromThresholds(
    uncertaintyScore,
    config.campUncertaintySafeScore,
    config.campUncertaintyTightScore,
  );
  const missingDataFields: string[] = [];
  if (!candidate.lastVerifiedDate) missingDataFields.push('lastVerifiedDate');
  if (enrichment.dataConfidence === 'unknown') missingDataFields.push('dataConfidence');
  if (enrichment.legalConfidence === 'unknown') missingDataFields.push('legalConfidence');
  if (enrichment.occupancyLikelihood === 'unknown') missingDataFields.push('occupancyLikelihood');

  return buildDebtItem(
    'campUncertainty',
    status,
    uncertaintyScore,
    'score',
    `Camp uncertainty score is ${uncertaintyScore}, based on confidence, freshness, legal certainty, and occupancy risk.`,
    missingDataFields,
    missingDataFields.length > 0 ? 'low' : enrichment.dataConfidence,
  );
}

export function calculateCampResourceDebt({
  context,
  candidate,
  enrichment,
  config: configOverrides = {},
}: CampResourceDebtInput): CampResourceDebt {
  const config = resolveCampOpsResourceDebtConfig(configOverrides);
  const fuel = calculateFuelDebt(context, candidate, enrichment, config);
  const water = calculateWaterDebt(context, candidate, enrichment, config);
  const assumptions = unique([
    ...(fuel.margins.fuelExitMargin.missingDataFields.length > 0 || fuel.margins.fuelToCamp.basis === 'unknown'
      ? ['Fuel margin uses fallback data where route-aware distance or service distance is missing.']
      : []),
    ...(water.margins.waterToCamp.missingDataFields.length > 0
      ? ['Water-to-camp could not be route-aware because group size or camp distance is missing.']
      : []),
    ...(enrichment.heatRisk === 'medium' || enrichment.heatRisk === 'high'
      ? [`Water demand is adjusted for ${enrichment.heatRisk} heat risk.`]
      : []),
  ]);
  return {
    fuel: fuel.debt,
    water: water.debt,
    daylight: calculateDaylightDebt(context, enrichment, config),
    campUncertainty: calculateCampUncertaintyDebt(context, candidate, enrichment, config),
    margins: {
      ...fuel.margins,
      ...water.margins,
      assumptions,
    },
  };
}

export function attachCampResourceDebt(
  input: CampResourceDebtInput,
): CampCandidateEnrichment {
  return {
    ...input.enrichment,
    resourceDebt: calculateCampResourceDebt(input),
  };
}
