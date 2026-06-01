import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampGateSeverity,
  CampHardGateResult,
  CampHardGateState,
  CampOpsConfidence,
  CampSearchContext,
} from './campOpsTypes';
import {
  resolveCampOpsHardGateConfig,
  type CampOpsHardGateConfig,
} from './campOpsHardGateConfig';

export type CampHardGateEvaluationStatus = CampHardGateState;

export type CampHardGateCandidateInput = {
  candidate: CampCandidate;
  enrichment?: CampCandidateEnrichment | null;
};

export type CampHardGateCandidateEvaluation = {
  candidate: CampCandidate;
  status: CampHardGateEvaluationStatus;
  failedGates: CampHardGateResult[];
  cautionGates: CampHardGateResult[];
  unknownGates: CampHardGateResult[];
  missingData: string[];
  reasons: string[];
  severity: CampGateSeverity;
  allGates: CampHardGateResult[];
};

export type CampHardGateBatchInput = {
  context: CampSearchContext;
  candidates: CampCandidate[];
  enrichmentsByCandidateId?: Record<string, CampCandidateEnrichment | undefined>;
  config?: Partial<CampOpsHardGateConfig>;
};

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const SEVERITY_RANK: Record<CampGateSeverity, number> = {
  unknown: 0,
  info: 1,
  watch: 2,
  caution: 3,
  critical: 4,
};

function maxSeverity(gates: CampHardGateResult[]): CampGateSeverity {
  return gates.reduce<CampGateSeverity>(
    (current, gate) => (SEVERITY_RANK[gate.severity] > SEVERITY_RANK[current] ? gate.severity : current),
    'info',
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function confidenceBelow(value: CampOpsConfidence, minimum: CampOpsConfidence): boolean {
  return CONFIDENCE_RANK[value] < CONFIDENCE_RANK[minimum];
}

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function booleanCondition(candidate: CampCandidate, keys: string[]): boolean | null {
  const containers = [candidate.conditions, candidate.amenities].filter(Boolean);
  for (const container of containers) {
    for (const key of keys) {
      const value = container?.[key];
      if (typeof value === 'boolean') return value;
    }
  }
  return null;
}

function stringCondition(candidate: CampCandidate, keys: string[]): string | null {
  const containers = [candidate.conditions, candidate.amenities].filter(Boolean);
  for (const container of containers) {
    for (const key of keys) {
      const value = container?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
    }
  }
  return null;
}

function isTrailerRequired(context: CampSearchContext): boolean {
  return Boolean(
    context.vehicleProfile?.trailerAttached ||
      (context.convoyProfile?.trailerCount ?? 0) > 0 ||
      context.convoyProfile?.trailerPresent ||
      context.convoyProfile?.leastCapableVehicleProfile?.trailerAttached ||
      context.userCampPreferences?.trailerFriendlyRequired,
  );
}

function groupPeopleCount(context: CampSearchContext): number | null {
  return finiteNumber(context.convoyProfile?.peopleCount);
}

function groupCapacityDemand(context: CampSearchContext): number | null {
  const vehicles = finiteNumber(context.convoyProfile?.vehicleCount);
  const people = finiteNumber(context.convoyProfile?.peopleCount);
  if (vehicles != null && people != null) return Math.max(vehicles, people);
  return vehicles ?? people;
}

function getSafeArrivalLimitIso(context: CampSearchContext): string | null {
  return context.desiredArrivalWindow?.latestAcceptableIso ?? context.desiredArrivalWindow?.endIso ?? null;
}

function isAfterIso(valueIso: string | null | undefined, limitIso: string | null): boolean | null {
  if (!valueIso || !limitIso) return null;
  const valueMs = Date.parse(valueIso);
  const limitMs = Date.parse(limitIso);
  if (!Number.isFinite(valueMs) || !Number.isFinite(limitMs)) return null;
  return valueMs > limitMs;
}

function isWithinRestrictionWindow(
  currentTimeIso: string,
  window: CampCandidateEnrichment['restrictionWindow'] | null | undefined,
): boolean | null {
  if (!window?.startIso && !window?.endIso) return null;
  const currentMs = Date.parse(currentTimeIso);
  if (!Number.isFinite(currentMs)) return null;
  const startMs = window.startIso ? Date.parse(window.startIso) : Number.NEGATIVE_INFINITY;
  const endMs = window.endIso ? Date.parse(window.endIso) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(startMs) && startMs !== Number.NEGATIVE_INFINITY) return null;
  if (!Number.isFinite(endMs) && endMs !== Number.POSITIVE_INFINITY) return null;
  return currentMs >= startMs && currentMs <= endMs;
}

function isHighRiskContext(
  context: CampSearchContext,
  enrichment: CampCandidateEnrichment | null | undefined,
  config: CampOpsHardGateConfig,
): boolean {
  if (context.riskTolerance === 'emergency_only') return true;
  if (config.highRiskOfflineModes.includes(context.offlineMode as 'offline' | 'degraded')) return true;
  if ((context.delayEstimateMinutes ?? 0) >= config.highRiskDelayMinutes) return true;
  if (enrichment && config.highRiskLateArrivalLevels.includes(enrichment.lateArrivalRisk)) return true;
  if (enrichment?.weatherExposure === 'critical') return true;
  if (enrichment?.fireRestrictionStatus === 'fire_ban') return true;
  return false;
}

function buildGate(
  state: CampHardGateState,
  gateId: string,
  severity: CampGateSeverity,
  reason: string,
  missingDataFields: string[] = [],
): CampHardGateResult {
  return {
    state,
    gateId,
    severity,
    reason,
    missingDataFields: unique(missingDataFields),
  };
}

function collectBaseMissingData(
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment | null | undefined,
  context: CampSearchContext,
): string[] {
  const missing: string[] = [];

  if (!enrichment) return ['candidateEnrichment'];
  if (enrichment.legalStatus === 'unknown') missing.push('legalStatus');
  if (enrichment.legalConfidence === 'unknown') missing.push('legalConfidence');
  if (!enrichment.publicAccessStatus || enrichment.publicAccessStatus === 'unknown') missing.push('publicAccessStatus');
  if (enrichment.accessDifficulty === 'unknown') missing.push('accessDifficulty');
  if (enrichment.vehicleFit === 'unknown') missing.push('vehicleFit');
  if (enrichment.dataConfidence === 'unknown') missing.push('dataConfidence');
  if (isTrailerRequired(context) && enrichment.trailerSuitability === 'unknown') missing.push('trailerSuitability');
  if (isTrailerRequired(context) && (!enrichment.turnaroundSuitability || enrichment.turnaroundSuitability === 'unknown')) {
    missing.push('turnaroundSuitability');
  }
  if (groupCapacityDemand(context) != null && enrichment.groupCapacityEstimate == null) missing.push('groupCapacityEstimate');
  if (getSafeArrivalLimitIso(context) && !enrichment.etaIso) missing.push('etaIso');

  const fuelKnown = context.resourceState?.fuelRangeMiles != null || context.resourceState?.fuelPercent != null;
  if (fuelKnown && (enrichment.fuelImpact?.value == null || enrichment.fuelImpact.unit !== 'miles')) {
    missing.push('fuelExitMarginMiles');
  }

  const waterKnown = context.resourceState?.waterGallons != null || context.resourceState?.waterPercent != null;
  if (waterKnown && enrichment.waterImpact?.value == null) missing.push('waterMargin');
  if (waterKnown && enrichment.reliableWaterRefillAvailable == null) missing.push('reliableWaterRefillAvailable');

  const closureStatus = enrichment.closureStatus ?? stringCondition(candidate, ['closureStatus', 'accessRestrictionStatus']);
  if (!closureStatus || closureStatus === 'unknown') missing.push('closureStatus');

  return unique(missing);
}

export function evaluateCampCandidateHardGates({
  context,
  candidate,
  enrichment,
  config: configOverrides = {},
}: {
  context: CampSearchContext;
  candidate: CampCandidate;
  enrichment?: CampCandidateEnrichment | null;
  config?: Partial<CampOpsHardGateConfig>;
}): CampHardGateCandidateEvaluation {
  const config = resolveCampOpsHardGateConfig(configOverrides);
  const gates: CampHardGateResult[] = [];
  const missingData = new Set(collectBaseMissingData(candidate, enrichment, context));

  if (!enrichment) {
    gates.push(
      buildGate(
        'unknown',
        'campops.enrichment.missing',
        'caution',
        'CampOps cannot evaluate safety gates because candidate enrichment is missing.',
        ['candidateEnrichment'],
      ),
    );
  } else {
    if (enrichment.legalStatus === 'prohibited') {
      gates.push(
        buildGate('rejected', 'campops.legal.prohibited', 'critical', 'Known legal status prohibits camping here.'),
      );
    } else if (enrichment.legalStatus === 'restricted') {
      gates.push(
        buildGate('caution', 'campops.legal.restricted', 'caution', 'Camping legality is restricted and needs confirmation.'),
      );
    }

    const closureStatus =
      enrichment.closureStatus ?? stringCondition(candidate, ['closureStatus', 'accessRestrictionStatus']);
    if (closureStatus === 'closed') {
      gates.push(
        buildGate('rejected', 'campops.access.closed', 'critical', 'Known closure blocks access to this camp.'),
      );
    } else if (closureStatus === 'restricted') {
      gates.push(
        buildGate('rejected', 'campops.access.restricted', 'critical', 'Known access restriction blocks this camp.'),
      );
    } else if (closureStatus === 'seasonal') {
      const seasonalAppliesNow = isWithinRestrictionWindow(context.currentTimeIso, enrichment.restrictionWindow);
      const blocksCampUse =
        enrichment.closureAppliesToCamping === true || enrichment.closureAppliesToVehicleAccess === true;
      if (seasonalAppliesNow === true && blocksCampUse) {
        gates.push(
          buildGate(
            'rejected',
            'campops.access.seasonal_closure',
            'critical',
            'Seasonal closure or restriction applies during the planned camp window.',
          ),
        );
      } else {
        gates.push(
          buildGate(
            seasonalAppliesNow == null ? 'unknown' : 'caution',
            'campops.access.seasonal_restriction',
            'caution',
            'Seasonal access restriction needs current confirmation.',
            seasonalAppliesNow == null ? ['restrictionWindow'] : [],
          ),
        );
      }
    } else if (closureStatus === 'permit_required') {
      gates.push(
        buildGate('caution', 'campops.access.permit_required', 'caution', 'Access appears to require a permit or permission.'),
      );
    }

    const publicAccessStatus =
      enrichment.publicAccessStatus ?? stringCondition(candidate, ['publicAccessStatus', 'landAccess']);
    if (publicAccessStatus === 'private') {
      gates.push(
        buildGate('rejected', 'campops.access.private_land', 'critical', 'Candidate appears to be on private land.'),
      );
    } else if (publicAccessStatus === 'permission_required') {
      gates.push(
        buildGate('caution', 'campops.access.permission_required', 'caution', 'Public access is not confirmed and may require permission.'),
      );
    } else if (
      (!publicAccessStatus || publicAccessStatus === 'unknown') &&
      confidenceBelow(enrichment.legalConfidence, config.minimumPublicAccessConfidence)
    ) {
      gates.push(
        buildGate(
          'unknown',
          'campops.access.public_access_unconfirmed',
          'caution',
          'Public access is unknown and legal confidence is below the configured threshold.',
          ['publicAccessStatus', 'legalConfidence'],
        ),
      );
    }

    if (enrichment.vehicleFit === 'not_fit') {
      gates.push(
        buildGate('rejected', 'campops.vehicle.not_fit', 'critical', 'Vehicle profile cannot reasonably access this camp.'),
      );
    } else if (enrichment.vehicleFit === 'limited') {
      gates.push(
        buildGate('caution', 'campops.vehicle.limited_fit', 'caution', 'Vehicle access fit is limited for this camp.'),
      );
    }

    if (isTrailerRequired(context)) {
      if (enrichment.trailerSuitability === 'not_fit') {
        gates.push(
          buildGate(
            'rejected',
            'campops.trailer.not_fit',
            'critical',
            'A trailer is required by the group, but this camp is known trailer-incompatible.',
          ),
        );
      } else if (enrichment.trailerSuitability === 'limited') {
        gates.push(
          buildGate('caution', 'campops.trailer.limited_fit', 'caution', 'Trailer suitability is limited for this camp.'),
        );
      }
      if (enrichment.turnaroundSuitability === 'not_fit') {
        gates.push(
          buildGate(
            'rejected',
            'campops.trailer.no_turnaround',
            'critical',
            'A trailer is present, but turnaround is known not to fit this camp.',
          ),
        );
      } else if (
        enrichment.turnaroundSuitability === 'limited' ||
        enrichment.deadEndRisk === 'high' ||
        enrichment.backingRequired === true
      ) {
        gates.push(
          buildGate(
            'caution',
            'campops.trailer.turnaround_limited',
            'caution',
            'Trailer turnaround or backing confidence is limited for this camp.',
          ),
        );
      } else if (!enrichment.turnaroundSuitability || enrichment.turnaroundSuitability === 'unknown') {
        gates.push(
          buildGate(
            'unknown',
            'campops.trailer.turnaround_unknown',
            'caution',
            'Trailer turnaround confidence is unknown and should not be treated as good.',
            ['turnaroundSuitability', 'trailerTurnaroundConfidence'],
          ),
        );
      }
      if (enrichment.roadWidthConfidence === 'low' || enrichment.roadWidthConfidence === 'unknown') {
        gates.push(
          buildGate(
            'unknown',
            'campops.trailer.road_width_uncertain',
            'watch',
            'Road width confidence is limited for trailer handling.',
            ['roadWidthConfidence'],
          ),
        );
      }
    }

    const peopleCount = groupCapacityDemand(context);
    const capacity = finiteNumber(enrichment.groupCapacityEstimate);
    if (peopleCount != null && capacity != null && peopleCount > capacity) {
      const excessPeople = peopleCount - capacity;
      if (excessPeople >= config.groupCapacityRejectExcessPeople) {
        gates.push(
          buildGate(
            'rejected',
            'campops.group.capacity_exceeded',
            'critical',
            `Group capacity is exceeded by ${excessPeople} people or vehicles.`,
          ),
        );
      } else {
        gates.push(
          buildGate(
            'caution',
            'campops.group.capacity_tight',
            'caution',
            `Group capacity is tight by ${excessPeople} person or vehicle.`,
          ),
        );
      }
    }

    const safeArrivalLimitIso = getSafeArrivalLimitIso(context);
    const arrivesAfterLimit = isAfterIso(enrichment.etaIso, safeArrivalLimitIso);
    if (arrivesAfterLimit === true) {
      if (config.lateArrivalRejectRiskLevels.includes(enrichment.lateArrivalRisk)) {
        gates.push(
          buildGate(
            'rejected',
            'campops.time.late_arrival',
            'critical',
            'ETA is after the safe-arrival window and late-arrival risk is high.',
          ),
        );
      } else if (
        config.lateArrivalCautionRiskLevels.includes(enrichment.lateArrivalRisk) ||
        enrichment.lateArrivalRisk === 'unknown'
      ) {
        gates.push(
          buildGate(
            enrichment.lateArrivalRisk === 'unknown' ? 'unknown' : 'caution',
            'campops.time.arrival_window_exceeded',
            'caution',
            'ETA is after the safe-arrival window.',
            enrichment.lateArrivalRisk === 'unknown' ? ['lateArrivalRisk'] : [],
          ),
        );
      }
    } else if (arrivesAfterLimit == null && safeArrivalLimitIso) {
      gates.push(
        buildGate(
          'unknown',
          'campops.time.eta_missing',
          'watch',
          'Safe-arrival gate cannot run because ETA or arrival window data is missing.',
          ['etaIso'],
        ),
      );
    }

    const fuelExitMarginMiles =
      enrichment.fuelImpact?.unit === 'miles' ? finiteNumber(enrichment.fuelImpact.value) : null;
    if (fuelExitMarginMiles != null && fuelExitMarginMiles < config.minimumFuelExitMarginMiles) {
      gates.push(
        buildGate(
          'rejected',
          'campops.resources.fuel_margin',
          'critical',
          `Fuel margin after camp and exit is below ${config.minimumFuelExitMarginMiles} miles.`,
        ),
      );
    }

    const waterValue = finiteNumber(enrichment.waterImpact?.value);
    const waterUnit = enrichment.waterImpact?.unit;
    const waterBelowMinimum =
      (waterUnit === 'gallons' && waterValue != null && waterValue < config.minimumWaterMarginGallons) ||
      (waterUnit === 'percent' && waterValue != null && waterValue < config.minimumWaterMarginPercent);
    if (waterBelowMinimum && enrichment.reliableWaterRefillAvailable === false) {
      gates.push(
        buildGate(
          'rejected',
          'campops.resources.water_margin',
          'critical',
          'Water margin is below the configured minimum and no reliable refill is known.',
        ),
      );
    } else if (waterBelowMinimum && enrichment.reliableWaterRefillAvailable == null) {
      gates.push(
        buildGate(
          'unknown',
          'campops.resources.water_refill_unknown',
          'caution',
          'Water margin is low and refill reliability is unknown.',
          ['reliableWaterRefillAvailable'],
        ),
      );
    }

    const fireRestrictionConflict =
      enrichment.fireRestrictionConflict ??
      booleanCondition(candidate, ['fireRestrictionConflict', 'fireConflict', 'campfireRequired']);
    if (fireRestrictionConflict === true || enrichment.emergencyRestrictionConflict === true) {
      gates.push(
        buildGate(
          'rejected',
          'campops.restrictions.fire_emergency_conflict',
          'critical',
          'Fire or emergency restriction conflicts with using this camp as planned.',
        ),
      );
    } else if (enrichment.fireRestrictionStatus === 'fire_ban') {
      gates.push(
        buildGate('caution', 'campops.restrictions.fire_ban', 'caution', 'Campfire or open-flame restrictions are active near this camp.'),
      );
    } else if (enrichment.stoveAllowed === 'no' || enrichment.stoveAllowed === 'restricted') {
      gates.push(
        buildGate('caution', 'campops.restrictions.stove_restricted', 'caution', 'Stove use appears restricted and needs confirmation.'),
      );
    } else if (enrichment.fireRestrictionStatus === 'restricted') {
      gates.push(
        buildGate('caution', 'campops.restrictions.fire_restricted', 'caution', 'Fire restrictions are active near this camp.'),
      );
    } else if (enrichment.closureAppliesToFires === true) {
      gates.push(
        buildGate('caution', 'campops.restrictions.fire_related_closure', 'caution', 'Closure source indicates fire-related restrictions may apply.'),
      );
    } else if (enrichment.fireRestrictionStatus === 'restrictions_possible') {
      gates.push(
        buildGate('caution', 'campops.restrictions.fire_possible', 'watch', 'Fire restrictions may apply and need confirmation.'),
      );
    }
  }

  const highRisk = isHighRiskContext(context, enrichment, config);
  const highRiskMissing = unique(config.highRiskRequiredDataFields.filter((field) => missingData.has(field)));
  if (highRisk && config.rejectInsufficientHighRiskData && highRiskMissing.length > 0) {
    gates.push(
      buildGate(
        'rejected',
        'campops.data.insufficient_high_risk',
        'critical',
        'Insufficient data for a high-risk camp recommendation.',
        highRiskMissing,
      ),
    );
  } else if (missingData.size > 0 && gates.every((gate) => gate.state !== 'rejected')) {
    gates.push(
      buildGate(
        'unknown',
        'campops.data.missing',
        'watch',
        'Some hard-gate data is missing; CampOps cannot fully clear this candidate.',
        Array.from(missingData),
      ),
    );
  }

  const failedGates = gates.filter((gate) => gate.state === 'rejected');
  const cautionGates = gates.filter((gate) => gate.state === 'caution');
  const unknownGates = gates.filter((gate) => gate.state === 'unknown');
  const status: CampHardGateEvaluationStatus =
    failedGates.length > 0
      ? 'rejected'
      : cautionGates.length > 0
        ? 'caution'
        : unknownGates.length > 0
          ? 'unknown'
          : 'allowed';

  return {
    candidate,
    status,
    failedGates,
    cautionGates,
    unknownGates,
    missingData: unique(gates.flatMap((gate) => gate.missingDataFields).concat(Array.from(missingData))),
    reasons: gates.map((gate) => gate.reason),
    severity: gates.length > 0 ? maxSeverity(gates) : 'info',
    allGates: gates,
  };
}

export function evaluateCampHardGateCandidates({
  context,
  candidates,
  enrichmentsByCandidateId = {},
  config,
}: CampHardGateBatchInput): CampHardGateCandidateEvaluation[] {
  return candidates.map((candidate) =>
    evaluateCampCandidateHardGates({
      context,
      candidate,
      enrichment: enrichmentsByCandidateId[candidate.id],
      config,
    }),
  );
}
