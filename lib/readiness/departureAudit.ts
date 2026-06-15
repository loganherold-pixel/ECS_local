import type {
  ExpeditionDepartureAuditItem,
  ExpeditionDepartureAuditItemStatus,
  ExpeditionReadinessCategory,
  ExpeditionReadinessInput,
} from './expeditionReadinessTypes';
import { resolveExpeditionTripIntent } from './expeditionReadinessCalibration';

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
      ? item(
          'camp-candidates',
          'Camp candidates',
          statusFromBoolean(offline?.campCandidatesCached ?? offline?.campIntelDownloaded),
          offline?.campCandidatesCached || offline?.campIntelDownloaded
            ? 'Camp candidate context is cached from available ECS signals.'
            : 'Camp candidate cache is limited; Legal Access Confidence may degrade offline.',
          'Open CampOps',
          '/navigate',
          routeActionDisabledReason,
        )
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
    item(
      'bailout-points',
      'Bailout points',
      statusFromBoolean(offline?.bailoutPointsCached),
      offline?.bailoutPointsCached
        ? 'Bailout points are cached for offline review.'
        : 'Bailout point cache is not confirmed.',
      'Review Bailouts',
      '/navigate-bailouts',
      routeActionDisabledReason,
    ),
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
    item(
      'power-runtime-estimate',
      'Power/runtime estimate',
      categoryStatus(power),
      power?.summary ?? 'Power runtime estimate is unavailable.',
      'Open Power',
      '/power',
    ),
    item(
      'emergency-communications-packet',
      'Emergency/communications packet',
      emergencyCommsAuditStatus(input, communications),
      emergencyCommsSummary(input, communications),
      'Confirm Comms Plan',
      '/safety',
    ),
    item(
      'recovery-plan',
      'Recovery plan',
      categoryStatus(recovery),
      recovery?.summary ?? 'Recovery plan is unavailable.',
      'Review Bailouts',
      '/navigate-bailouts',
      routeActionDisabledReason,
    ),
  ];

  return auditItems.filter((auditItem): auditItem is ExpeditionDepartureAuditItem => Boolean(auditItem));
}
