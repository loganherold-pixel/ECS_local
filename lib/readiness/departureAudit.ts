import type {
  ExpeditionDepartureAuditItem,
  ExpeditionDepartureAuditItemStatus,
  ExpeditionReadinessCategory,
  ExpeditionReadinessInput,
} from './expeditionReadinessTypes';

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
): ExpeditionDepartureAuditItem {
  return { itemId, label, status, summary, actionLabel, actionTarget };
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

  return [
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
      offline?.packageStatus === 'ready' ? null : '/navigate-offline',
    ),
    item(
      'route-geometry',
      'Route geometry',
      statusFromBoolean(offline?.routeGeometryCached ?? offline?.routeDownloaded),
      offline?.routeGeometryCached || offline?.routeDownloaded
        ? 'Route geometry is available for offline review.'
        : offline
          ? 'Route geometry is not confirmed in the offline package.'
          : 'Route geometry cache state is unavailable.',
      'Open Navigate',
      '/navigate',
    ),
    item(
      'camp-candidates',
      'Camp candidates',
      statusFromBoolean(offline?.campCandidatesCached ?? offline?.campIntelDownloaded),
      offline?.campCandidatesCached || offline?.campIntelDownloaded
        ? 'Camp candidate context is cached from available ECS signals.'
        : 'Camp candidate cache is limited; Legal Access Confidence may degrade offline.',
      'Open CampOps',
      '/navigate',
    ),
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
    ),
    item(
      'fuel-range-plan',
      'Fuel/range plan',
      categoryStatus(fuel),
      fuel?.summary ?? 'Fuel/range plan is unavailable.',
      'Open Fleet',
      '/fleet',
    ),
    item(
      'vehicle-profile',
      'Vehicle profile',
      categoryStatus(vehicle),
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
      offline?.emergencyPacketAvailable === true || offline?.emergencyDocsAvailable === true
        ? 'complete'
        : communications?.status === 'ready'
          ? 'caution'
          : offline?.emergencyPacketAvailable === false || offline?.emergencyDocsAvailable === false
            ? 'missing'
            : 'unavailable',
      offline?.emergencyPacketAvailable === true || offline?.emergencyDocsAvailable === true
        ? 'Emergency packet is available from local inputs.'
        : communications?.summary ?? 'Emergency packet availability is not connected yet.',
      'Confirm Comms Plan',
      null,
    ),
    item(
      'recovery-plan',
      'Recovery plan',
      categoryStatus(recovery),
      recovery?.summary ?? 'Recovery plan is unavailable.',
      'Review Bailouts',
      '/navigate-bailouts',
    ),
  ];
}
