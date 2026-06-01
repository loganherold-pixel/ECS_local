const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
}

const coordinator = read('lib/offlineTileSyncCoordinator.ts');
const offlineModal = read('components/navigate/OfflineCacheModal.tsx');
const offlineSyncStatusChip = read('components/navigate/OfflineSyncStatusChip.tsx');
const rootLayout = read('app/_layout.tsx');
const tileCacheStore = read('lib/tileCacheStore.ts');
const navigateScreen = read('app/(tabs)/navigate.tsx');
const useRoadNavigation = read('lib/useRoadNavigation.ts');
const mapboxRoadNavigation = read('lib/mapboxRoadNavigation.ts');
const offlineRouteCache = read('lib/offlineRouteCacheService.ts');
const offlineTileSyncCoordinator = read('lib/offlineTileSyncCoordinator.ts');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  coordinator,
  "backgroundSupport: 'app-process'",
  'Offline sync coordinator should explicitly report app-process background support only.',
);
assertIncludes(
  coordinator,
  "appProcessBackgroundOnly: true",
  'Offline sync jobs should persist the app-process-only background distinction.',
);
assertIncludes(
  coordinator,
  'tileCacheStore.startDownloadWithQuota',
  'Offline sync coordinator should own the tile download lifecycle.',
);
assertIncludes(
  coordinator,
  'persistence.set(STORAGE_KEY, JSON.stringify(sorted));',
  'Offline sync coordinator should persist job status/progress snapshots.',
);
assertIncludes(
  coordinator,
  'cancelJob(jobId: string)',
  'Offline sync coordinator should expose explicit cancel by job.',
);
assertIncludes(
  coordinator,
  'cancelRegion(regionId: string)',
  'Offline sync coordinator should expose explicit cancel by region.',
);

assertIncludes(
  offlineModal,
  'offlineTileSyncCoordinator.startRegionSync',
  'Offline Cache popup should start sync through the shared coordinator.',
);
assertNotIncludes(
  offlineModal,
  'tileCacheStore.startDownloadWithQuota(regionId',
  'Offline Cache popup should not own long-running tile downloads directly.',
);
assertNotIncludes(
  offlineModal,
  'setActiveProgress',
  'Offline Cache popup should not keep progress in component-local state.',
);
assertNotIncludes(
  offlineModal,
  'setIsCaching',
  'Offline Cache popup should derive caching state from the shared coordinator.',
);
assertIncludes(
  offlineModal,
  'offlineTileSyncCoordinator.subscribe',
  'Offline Cache popup should resubscribe to active jobs after close/reopen.',
);
assertIncludes(
  offlineModal,
  'Downloaded Syncs',
  'Offline Cache popup should show completed downloaded syncs after reopening.',
);
assertIncludes(
  offlineModal,
  'No offline routes saved yet.',
  'Offline Cache popup should render the requested empty state.',
);
assertIncludes(
  offlineModal,
  'listOfflineCachedRoutes',
  'Offline Cache popup should include persisted saved offline routes in the downloaded list.',
);
assertIncludes(
  offlineModal,
  'removeOfflineCachedRoute',
  'Offline Cache popup should support removing saved offline route metadata.',
);
assertIncludes(
  offlineModal,
  'downloadedSyncAccentBar',
  'Downloaded sync cards should match the Explore route-card hierarchy with an accent rail.',
);
assertIncludes(
  offlineModal,
  'routeSourceLabel(route.source)',
  'Downloaded route cards should preserve the source/type label for Explore/imported/built routes.',
);
assertIncludes(
  offlineModal,
  'regionSourceLabel(region.sourceType)',
  'Downloaded region cards should identify map view, route corridor, or manual region syncs.',
);
assertIncludes(
  offlineModal,
  'accessibilityLabel="Cancel offline sync"',
  'Offline Cache popup should provide an explicit cancel action.',
);

assertIncludes(
  rootLayout,
  '<OfflineSyncStatusChip bottomOffset={shellBodyBottomInset + 10} />',
  'Root shell should show sync progress outside the Offline Cache popup.',
);
assertIncludes(
  rootLayout,
  "import OfflineSyncStatusChip from '../components/navigate/OfflineSyncStatusChip';",
  'Root shell should import the shared offline sync indicator.',
);
assertIncludes(
  offlineSyncStatusChip,
  "createPersistedKeyValueCache('ecs_offline_sync_status_ui')",
  'Offline sync status chip should persist dismissed terminal notifications.',
);
assertIncludes(
  offlineSyncStatusChip,
  'function buildDismissalKey(job: OfflineTileSyncJob): string',
  'Offline sync status chip should key dismissal to a stable completed sync identity.',
);
assertIncludes(
  offlineSyncStatusChip,
  'dismissedSyncStatusPersistence.waitForHydration()',
  'Offline sync status chip should wait for dismissal hydration before rendering terminal startup notices.',
);
assertIncludes(
  offlineSyncStatusChip,
  'if (!latest || !isTerminalJob(latest) || !dismissalsHydrated) return null;',
  'Offline sync status chip should avoid stale terminal banners during startup hydration.',
);
assertIncludes(
  offlineSyncStatusChip,
  'terminalJobNeedsRuntimeCompletion(latest) && !runtimeTerminalKeys.has(dismissalKey)',
  'Offline sync status chip should not recreate completed/cancelled banners from old hydrated library records.',
);
assertIncludes(
  offlineSyncStatusChip,
  'const active = snapshot.activeJobs[0];\n    if (active) return active;',
  'Offline sync status chip should continue showing active or resumed downloads.',
);
assertIncludes(
  offlineSyncStatusChip,
  'observedActiveJobKeysRef.current.has(key)',
  'Offline sync status chip should mark terminal jobs as current-runtime only after observing active progress.',
);
assertIncludes(
  offlineSyncStatusChip,
  'jobCreatedDuringRuntime(job, runtimeStartedAtRef.current)',
  'Offline sync status chip should allow very fast current-runtime completions to show once.',
);
assertIncludes(
  offlineSyncStatusChip,
  'if (dismissedSyncKeys.has(dismissalKey)) return null;',
  'Offline sync status chip should suppress only the exact dismissed sync notification.',
);
assertIncludes(
  offlineSyncStatusChip,
  'persistDismissedKeys(next);',
  'Offline sync status chip should persist dismissal when X is tapped.',
);
assertNotIncludes(
  offlineSyncStatusChip,
  'const [dismissedJobId, setDismissedJobId]',
  'Offline sync status dismissal should not be component-local only.',
);

assertIncludes(
  tileCacheStore,
  "status: cancelled ? 'cancelled' : result.success ? 'complete' : 'error'",
  'Tile cache store should preserve explicit cancellation instead of overwriting it as an error.',
);

assertIncludes(
  offlineRouteCache,
  'export async function removeOfflineCachedRoute',
  'Offline route cache service should expose deletion for saved offline route cards.',
);
assertIncludes(
  offlineRouteCache,
  'finalDestination?: OfflineRouteDestinationMetadata | null;',
  'Route-based offline syncs should persist final destination metadata for library Open.',
);
assertIncludes(
  offlineRouteCache,
  'const finalDestination = buildFinalDestinationMetadata(routeGeometry, run);',
  'Offline route caching should derive destination metadata when saving route syncs.',
);
assertIncludes(
  offlineRouteCache,
  'export interface OfflineRouteIntentMetadata',
  'Offline route cache records should persist route intent metadata, not only tile bounds.',
);
assertIncludes(
  offlineRouteCache,
  "syncType: 'route';",
  'Route intent metadata should distinguish route-prepared syncs from map area syncs.',
);
assertIncludes(
  offlineRouteCache,
  'routeIntent?: OfflineRouteIntentMetadata | null;',
  'Offline cached routes should store route intent for Open restore.',
);
assertIncludes(
  offlineTileSyncCoordinator,
  "export type OfflineTileSyncType = 'route' | 'map-view' | 'manual';",
  'Offline sync jobs should persist whether a download is route, map view, or manual.',
);
assertIncludes(
  tileCacheStore,
  "syncType?: 'route' | 'map-view' | 'manual';",
  'Tile cache regions should preserve map-vs-route sync identity.',
);
assertIncludes(
  offlineModal,
  'onOpenDownloadedSync?: (item: DownloadedSyncOpenTarget) => void | Promise<void>;',
  'Offline library Open should be delegated to Navigate instead of showing a placeholder toast.',
);
assertIncludes(
  offlineModal,
  'function downloadedRouteTypeLabel(route: OfflineCachedRoute): string',
  'Downloaded route syncs should be labeled distinctly in the offline library.',
);
assertIncludes(
  offlineModal,
  'onPress={() => handleOpenDownloadedSync(item)}',
  'Downloaded sync Open should call the shared open handler.',
);
assertIncludes(
  navigateScreen,
  'onOpenDownloadedSync={handleOpenDownloadedSync}',
  'Navigate should wire downloaded sync Open into road preview restore.',
);
assertIncludes(
  navigateScreen,
  'const handlePrepareOfflineFromRoadPreview = useCallback(async () => {',
  'Road preview Prepare Offline should create a route sync instead of opening a generic map sync flow.',
);
assertIncludes(
  navigateScreen,
  'const routeIntent = buildRouteIntentForRoadPreview({',
  'Road preview Prepare Offline should build route intent metadata before downloading.',
);
assertIncludes(
  navigateScreen,
  "source: 'route-corridor'",
  'Road preview Prepare Offline should create a route-corridor sync.',
);
assertIncludes(
  navigateScreen,
  "syncType: 'route'",
  'Road preview Prepare Offline should mark its sync as route-type.',
);
assertIncludes(
  navigateScreen,
  'cacheOfflineRoute({',
  'Road preview Prepare Offline should persist route metadata for the offline library Open action.',
);
assertIncludes(
  navigateScreen,
  'onPrepareOffline={handlePrepareOfflineFromRoadPreview}',
  'Road preview overlay should call the route-aware Prepare Offline handler.',
);
assertIncludes(
  navigateScreen,
  "previewRoadDestination(destination, 'offline_sync_open')",
  'Downloaded route Open should restore road preview to the saved destination.',
);
assertIncludes(
  navigateScreen,
  "previewRoadRoute(cachedRoadRoute, 'offline_sync_open')",
  'Downloaded route Open should use cached geometry when live route refresh is unavailable.',
);
assertIncludes(
  navigateScreen,
  'WAITING FOR GPS TO PREVIEW OFFLINE ROUTE',
  'Downloaded route Open should expose a clear GPS-waiting state.',
);
assertIncludes(
  navigateScreen,
  'OLDER OFFLINE ROUTE OPENED - DESTINATION METADATA UNAVAILABLE',
  'Older syncs without destination metadata should fall back with a clear message.',
);
assertIncludes(
  useRoadNavigation,
  'previewRoute: (\n    route: RoadNavRoute,',
  'Road navigation hook should expose a cached route preview entry point.',
);
assertIncludes(
  mapboxRoadNavigation,
  "'offline_sync_open'",
  'Road navigation telemetry/source should preserve offline library Open context.',
);
assertIncludes(
  mapboxRoadNavigation,
  'export function buildRoadRouteFromCachedGeometry',
  'Road navigation should be able to build a preview route from cached offline geometry.',
);

console.log('Offline sync coordinator checks passed.');
