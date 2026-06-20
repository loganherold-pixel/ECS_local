import type {
  ExpeditionDepartureAuditItem,
  ExpeditionDepartureAuditItemStatus,
  ExpeditionReadinessCategory,
  ExpeditionReadinessInput,
} from './expeditionReadinessTypes';
import { resolveExpeditionTripIntent } from './expeditionReadinessCalibration';
import {
  CAMP_CANDIDATE_VIABILITY_RADIUS_MILES,
  evaluateCampCandidateViability,
} from './campCandidateViability';

const ROUTE_REQUIRED_ACTION_MESSAGE = 'You must first have an active route or build a trip.';

function statusFromBoolean(
  value: boolean | null | undefined,
  unavailableWhenUnknown = false,
): ExpeditionDepartureAuditItemStatus {
  if (value === true) return 'complete';
  if (value === false) return 'missing';
  return unavailableWhenUnknown ? 'unavailable' : 'caution';
}

function categoryStatus(category: ExpeditionReadinessCategory | undefined): ExpeditionDepartureAuditItemStatus {
  if (!category) return 'unavailable';
  if (category.status === 'ready') return 'complete';
  if (category.status === 'hold') return 'missing';
  return 'caution';
}

function item(
  itemId: string,
  label: string,
  status: ExpeditionDepartureAuditItemStatus,
  summary: string,
  actionLabel?: string | null,
  actionTarget?: string | null,
  disabledActionReason?: string | null,
): ExpeditionDepartureAuditItem {
  return { itemId, label, status, summary, actionLabel, actionTarget, disabledActionReason };
}

function categoryMap(categories: ExpeditionReadinessCategory[]): Map<string, ExpeditionReadinessCategory> {
  const map = new Map<string, ExpeditionReadinessCategory>();
  categories.forEach((category) => map.set(category.id, category));
  return map;
}

function offlinePackageSummary(input: ExpeditionReadinessInput): string {
  const offline = input.offline;
  if (!offline) return 'Offline package state is unavailable.';
  if (offline.packageStatus === 'ready') return 'Route package is prepared from available cache signals.';
  if (offline.packageStatus === 'partial') return 'Route package is incomplete; review missing offline assets.';
  if (offline.packageStatus === 'missing') return 'No usable route package is available for this expedition.';
  return 'Offline package confidence is limited.';
}

function fuelRangeAuditStatus(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
): ExpeditionDepartureAuditItemStatus {
  if (!input.fuel) return categoryStatus(category);
  if (input.fuel.rangeRemainingMiles != null || input.fuel.fuelPercent != null) {
    return category?.status === 'hold' ? 'missing' : 'complete';
  }
  return categoryStatus(category);
}

function vehicleProfileAuditStatus(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
): ExpeditionDepartureAuditItemStatus {
  const vehicle = input.activeVehicle;
  if (!vehicle?.vehicleId && !vehicle?.label) return categoryStatus(category);
  const hasWeightProfile =
    typeof vehicle.operatingWeightLbs === 'number' ||
    typeof vehicle.gvwrUsagePct === 'number' ||
    typeof vehicle.payloadRemainingLbs === 'number';
  if (hasWeightProfile && category?.status !== 'hold') return 'complete';
  return categoryStatus(category);
}

function emergencyCommsAuditStatus(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
): ExpeditionDepartureAuditItemStatus {
  const offline = input.offline;
  if (offline?.emergencyPacketAvailable === true || offline?.emergencyDocsAvailable === true) {
    return 'complete';
  }
  if (category?.status === 'ready') return 'complete';
  if (input.communications) return category?.status === 'hold' ? 'missing' : 'caution';
  return 'caution';
}

function emergencyCommsSummary(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
): string {
  const offline = input.offline;
  if (offline?.emergencyPacketAvailable === true || offline?.emergencyDocsAvailable === true) {
    return 'Emergency packet is available from local inputs.';
  }
  if (category?.status === 'ready') {
    return 'Communications plan is ready. Review or edit frequencies, signals, and emergency numbers from the Comms section.';
  }
  return category?.summary ?? 'Emergency communications can be completed by reviewing Comms references and adding personal frequencies, signals, or emergency numbers.';
}

function hasRouteContext(input: ExpeditionReadinessInput): boolean {
  const route = input.route;
  return Boolean(
    route?.routeId
      || route?.name
      || (typeof route?.distanceMiles === 'number' && route.distanceMiles > 0)
      || input.readinessMode === 'active',
  );
}

function routeRequiredReason(input: ExpeditionReadinessInput): string | null {
  return hasRouteContext(input) ? null : ROUTE_REQUIRED_ACTION_MESSAGE;
}

function formatCampDistance(distanceMiles: number | null): string | null {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return null;
  return distanceMiles < 10 ? `${distanceMiles.toFixed(1)} mi` : `${Math.round(distanceMiles)} mi`;
}

function campCandidateAuditItem(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
  disabledActionReason: string | null,
): ExpeditionDepartureAuditItem {
  if (disabledActionReason) {
    return item(
      'camp-candidates',
      'Camp candidates',
      categoryStatus(category),
      category?.summary ?? 'Camp candidate route context is unavailable.',
      'Open CampOps',
      '/navigate',
      disabledActionReason,
    );
  }

  const viability = evaluateCampCandidateViability(input);
  if (viability.status === 'viable') {
    const count = viability.viableCandidates.length;
    const distance = formatCampDistance(viability.nearestDistanceMiles);
    return item(
      'camp-candidates',
      'Camp candidates',
      'complete',
      `${count} viable camp candidate${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} within ${CAMP_CANDIDATE_VIABILITY_RADIUS_MILES} mi of the trail endpoint or route waypoints${distance ? `; nearest is ${distance}` : ''}.`,
      null,
      null,
    );
  }

  if (viability.status === 'none') {
    const nearest = formatCampDistance(viability.nearestDistanceMiles);
    return item(
      'camp-candidates',
      'Camp candidates',
      'caution',
      `No viable camp candidates are within ${CAMP_CANDIDATE_VIABILITY_RADIUS_MILES} mi of the trail endpoint or route waypoints${nearest ? `; nearest evaluated candidate is ${nearest}` : ''}.`,
      null,
      null,
    );
  }

  return item(
    'camp-candidates',
    'Camp candidates',
    categoryStatus(category),
    category?.summary ?? 'Camp candidate proximity to the trail endpoint or route waypoints is not confirmed.',
    'Open CampOps',
    '/navigate',
    null,
  );
}

function bailoutPointsAuditItem(
  input: ExpeditionReadinessInput,
  disabledActionReason: string | null,
): ExpeditionDepartureAuditItem {
  const offline = input.offline;
  const routeBailoutCount =
    typeof offline?.routeBailoutPointCount === 'number' && Number.isFinite(offline.routeBailoutPointCount)
      ? Math.max(0, Math.round(offline.routeBailoutPointCount))
      : 0;
  const hasRouteBailouts = routeBailoutCount > 0;

  return item(
    'bailout-points',
    'Bailout points',
    hasRouteBailouts ? 'complete' : statusFromBoolean(offline?.bailoutPointsCached),
    hasRouteBailouts
      ? `${routeBailoutCount} route bailout point${routeBailoutCount === 1 ? '' : 's'} ${routeBailoutCount === 1 ? 'is' : 'are'} attached to this route for offline review.`
      : offline?.bailoutPointsCached
        ? 'Bailout points are cached for offline review.'
        : 'Bailout point cache is not confirmed.',
    'Review Bailouts',
    '/navigate-bailouts',
    disabledActionReason,
  );
}

function getRouteBailoutCount(input: ExpeditionReadinessInput): number {
  const offlineCount =
    typeof input.offline?.routeBailoutPointCount === 'number' && Number.isFinite(input.offline.routeBailoutPointCount)
      ? input.offline.routeBailoutPointCount
      : null;
  const recoveryCount =
    typeof input.recovery?.routeBailoutOptionCount === 'number' && Number.isFinite(input.recovery.routeBailoutOptionCount)
      ? input.recovery.routeBailoutOptionCount
      : null;
  return Math.max(0, Math.round(offlineCount ?? recoveryCount ?? 0));
}

function powerNetWatts(power: ExpeditionReadinessInput['power']): number | null {
  if (!power) return null;
  if (power.inputWatts == null && power.outputWatts == null && power.solarInputWatts == null) return null;
  return (power.inputWatts ?? 0) + (power.solarInputWatts ?? 0) - (power.outputWatts ?? 0);
}

function hasActionablePowerAuditRisk(power: ExpeditionReadinessInput['power']): boolean {
  if (!power) return false;
  if (typeof power.batteryPercent === 'number' && power.batteryPercent < 25) return true;
  const netWatts = powerNetWatts(power);
  return typeof netWatts === 'number' && netWatts < -350;
}

function powerRuntimeAuditItem(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
): ExpeditionDepartureAuditItem {
  const power = input.power;
  const powerRelevant = power?.powerRelevantForTrip === true;
  const actionableRisk = hasActionablePowerAuditRisk(power);
  const optionalPower = !powerRelevant && !actionableRisk;

  if (optionalPower) {
    return item(
      'power-runtime-estimate',
      'Power/runtime estimate',
      'complete',
      'Power telemetry is optional for this trip context; no low reserve or heavy draw risk is affecting departure readiness.',
      'Open Power',
      '/power',
    );
  }

  return item(
    'power-runtime-estimate',
    'Power/runtime estimate',
    categoryStatus(category),
    category?.summary ?? 'Power runtime estimate is unavailable.',
    'Open Power',
    '/power',
  );
}

function recoveryPlanAuditItem(
  input: ExpeditionReadinessInput,
  category: ExpeditionReadinessCategory | undefined,
  disabledActionReason: string | null,
): ExpeditionDepartureAuditItem {
  const recovery = input.recovery;
  const routeBailoutCount = getRouteBailoutCount(input);
  const hasRouteBailouts = routeBailoutCount > 0 || recovery?.bailoutRoutesAvailable === true;
  const coordinatePacketReady =
    recovery?.emergencyCoordinatePacketReady === true ||
    recovery?.currentCoordinatesAvailable === true;
  const hasBlockingRecoveryGap =
    recovery?.bailoutRoutesAvailable === false ||
    recovery?.recoveryGearReady === false ||
    recovery?.recoveryAccessConfidence === 'low';

  if (hasRouteBailouts && coordinatePacketReady && !hasBlockingRecoveryGap) {
    const countCopy = routeBailoutCount > 0
      ? `${routeBailoutCount} route bailout point${routeBailoutCount === 1 ? '' : 's'} ${routeBailoutCount === 1 ? 'is' : 'are'} attached`
      : 'Route bailout access is attached';
    const nearestCopy = recovery?.nearestBailoutSummary ? ` ${recovery.nearestBailoutSummary}` : '';
    return item(
      'recovery-plan',
      'Recovery plan',
      'complete',
      `${countCopy}; emergency coordinate context is ready.${nearestCopy}`,
      'Review Bailouts',
      '/navigate-bailouts',
      disabledActionReason,
    );
  }

  return item(
    'recovery-plan',
    'Recovery plan',
    categoryStatus(category),
    category?.summary ?? 'Recovery plan is unavailable.',
    'Review Bailouts',
    '/navigate-bailouts',
    disabledActionReason,
  );
}

export function buildDepartureAudit(
  input: ExpeditionReadinessInput,
  categories: ExpeditionReadinessCategory[],
): ExpeditionDepartureAuditItem[] {
  const offline = input.offline;
  const categoriesById = categoryMap(categories);
  const vehicle = categoriesById.get('vehicle_fit');
  const fuel = categoriesById.get('fuel_range_margin');
  const power = categoriesById.get('power_runtime');
  const recovery = categoriesById.get('recovery_bailout_access');
  const communications = categoriesById.get('communications_signal_confidence');
  const camp = categoriesById.get('camp_legality_confidence');
  const resolvedTripIntent = resolveExpeditionTripIntent(input).tripIntent;
  const includeCampCandidates = resolvedTripIntent !== 'dayTrip';
  const routeActionDisabledReason = routeRequiredReason(input);

  const auditItems = [
    item(
      'offline-map-package',
      'Offline map package',
      offline?.packageStatus === 'ready'
        ? 'complete'
        : offline?.packageStatus === 'partial'
          ? 'caution'
          : offline?.packageStatus === 'missing'
            ? 'missing'
            : 'unavailable',
      offlinePackageSummary(input),
      offline?.packageStatus === 'ready' ? null : 'Download Route Package',
      offline?.packageStatus === 'ready' ? null : '/navigate',
      offline?.packageStatus === 'ready' ? null : routeActionDisabledReason,
    ),
    includeCampCandidates
      ? campCandidateAuditItem(input, camp, routeActionDisabledReason)
      : null,
    item(
      'weather-snapshot',
      'Weather snapshot',
      statusFromBoolean(offline?.weatherSnapshotAvailable, true),
      offline?.weatherSnapshotAvailable
        ? 'Recent live or snapshotted weather is available for this brief.'
        : 'Weather snapshot cache is unavailable; refresh before departure if service exists.',
      'Refresh Weather',
      null,
    ),
    bailoutPointsAuditItem(input, routeActionDisabledReason),
    item(
      'fuel-range-plan',
      'Fuel/range plan',
      fuelRangeAuditStatus(input, fuel),
      fuel?.summary ?? 'Fuel/range plan is unavailable.',
      'Open Fleet',
      '/fleet',
    ),
    item(
      'vehicle-profile',
      'Vehicle profile',
      vehicleProfileAuditStatus(input, vehicle),
      vehicle?.summary ?? 'Vehicle profile is unavailable.',
      'Select Vehicle',
      '/fleet',
    ),
    powerRuntimeAuditItem(input, power),
    item(
      'emergency-communications-packet',
      'Emergency/communications packet',
      emergencyCommsAuditStatus(input, communications),
      emergencyCommsSummary(input, communications),
      'Confirm Comms Plan',
      '/safety',
    ),
    recoveryPlanAuditItem(input, recovery, routeActionDisabledReason),
  ];

  return auditItems.filter((auditItem): auditItem is ExpeditionDepartureAuditItem => Boolean(auditItem));
}
