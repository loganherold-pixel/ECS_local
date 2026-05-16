const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const navigate = read('app', '(tabs)', 'navigate.tsx');
const offlineModal = read('components', 'navigate', 'OfflineCacheModal.tsx');
const offlineReadinessSource = read('lib', 'offlineReadinessPresentation.ts');
const routeCacheService = read('lib', 'offlineRouteCacheService.ts');
const tileSyncCoordinator = read('lib', 'offlineTileSyncCoordinator.ts');
const mapConfig = read('lib', 'mapConfig.ts');
const campsiteLayers = read('lib', 'campsites', 'campsiteVisibilityMapLayers.ts');
const roadNavigation = read('lib', 'useRoadNavigation.ts');
const roadOverlay = read('components', 'navigate', 'RoadNavigationOverlay.tsx');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, tokens, message) {
  const missing = tokens.filter((token) => !source.includes(token));
  assert(missing.length === 0, `${message} Missing: ${missing.join(', ')}`);
}

function assertInOrder(source, tokens, message) {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor + 1);
    assert(index > cursor, `${message} Missing or out of order: ${token}`);
    cursor = index;
  }
}

assertIncludes(
  navigate,
  [
    'const { showToast, user } = useApp();',
    'useThrottledGPS',
    '<GPSStatusOverlay',
    'gpsStatus={gps.gpsStatus}',
    'hasFix={gps.hasFix}',
  ],
  'Navigate should still hydrate logged-in user context and render GPS/current-location lock state.',
);

assertIncludes(
  navigate,
  [
    "{ key: 'day', label: 'DAY' }",
    "{ key: 'tac', label: 'TAC' }",
    "{ key: 'sat', label: 'SAT' }",
    "{ key: '3d', label: '3D' }",
    'onPress={() => handleMapStyleModeChange(key)}',
    'void persistMapStyleMode(nextMode);',
    'await navigatePreferenceStorage.write(MAP_STYLE_MODE_STORAGE_KEY, nextMode);',
  ],
  'Tools popup should expose Day/Tac/Sat/3D and persist selected style.',
);

assertIncludes(
  mapConfig,
  [
    "key: '3d'",
    "shortLabel: '3D'",
    'mapbox://styles/expeditioncommand/cmonsduoz000b01spgl7bepey',
  ],
  '3D style should resolve to the ECS Mapbox style URL.',
);

assertIncludes(
  campsiteLayers,
  [
    "key: 'community'",
    'defaultVisible: true',
    "key: 'private'",
    "key: 'group'",
    'DEFAULT_CAMPSITE_LAYER_VISIBILITY',
  ],
  'Community, Private, and Group campsite layers should default on from shared config.',
);

assertIncludes(
  navigate,
  [
    'normalizeCampsiteLayerVisibilityPreference',
    'const next = { ...DEFAULT_CAMPSITE_LAYER_VISIBILITY };',
    "typeof saved[key] === 'boolean'",
    'readPersistedCampsiteLayerVisibility',
    'persistCampsiteLayerVisibility',
    'onPress={() => handleCampsiteLayerToggle(layer.key)}',
  ],
  'Campsite layer defaults should be merged with persisted user choices and toggled from one state source.',
);

assertIncludes(
  navigate,
  [
    'styles.toolsSearchHeader',
    'SEARCH ADDRESS OR PLACE',
    'Build custom road navigation from a destination search.',
    'value={roadNavigation.query}',
    'onChangeText={roadNavigation.setQuery}',
    'roadNavigation.suggestions.map((suggestion) =>',
    'onPress={() => handleRoadOverlaySelectSuggestion(suggestion)}',
    "accessibilityLabel: 'Search address or place'",
  ],
  'The prominent tools search field should remain a usable route-building entry point.',
);

assertIncludes(
  roadNavigation,
  [
    'searchRoadDestinations({',
    'resolveRoadDestination({',
    "requestRouteForDestination(\n          destination,\n          'route_preview',",
    'fetchRoadRoute({',
    'applyRoute(route, requestedStatus, destination, createdFrom',
  ],
  'Search selection should still geocode, request a road route, and enter route preview.',
);

assertIncludes(
  navigate,
  [
    'const handlePrepareOfflineFromRoadPreview = useCallback(async () => {',
    'buildRouteIntentForRoadPreview({',
    'mapStyle,',
    'tileCacheStore.createFromBounds(',
    "sourceType: 'route-corridor'",
    "syncType: 'route'",
    'routeIntent: routeIntent as unknown as Record<string, unknown>',
    'cacheOfflineRoute({',
    'offlineTileSyncCoordinator',
    '.startRegionSync({',
    "source: 'route-corridor'",
    "syncType: 'route'",
  ],
  'Prepare Offline should persist route intent metadata and start a route-type offline sync.',
);

assertIncludes(
  routeCacheService,
  [
    'routeIntent?: OfflineRouteIntentMetadata | null;',
    "syncType: 'route'",
    'destination',
    'mapContext',
    'styleKey',
    "styleKey ? `style:${styleKey}` : 'style:unspecified'",
  ],
  'Route offline cache records should preserve route intent, destination, and style-specific identity.',
);

assertIncludes(
  offlineModal,
  [
    'primaryDownloadProgress',
    'Sync in progress',
    '<TacticalProgressBar percent={primaryDownloadProgress.percent} />',
    'Downloaded Syncs',
    'downloadedRouteTypeLabel(route)',
    'ROUTE SYNC',
    'Opens road preview to ${route.routeIntent.destination.label}',
    'onPress={() => handleOpenDownloadedSync(item)}',
  ],
  'Offline modal should show progress, keep completed route syncs in the library, and expose Open.',
);

assertIncludes(
  tileSyncCoordinator,
  [
    'latestCompletedJob',
    "status: 'pending'",
    "status: 'running'",
    "status: cancelled ? 'cancelled' : result.success ? 'complete' : 'error'",
    'completedAt: nowISO()',
    'persistJobs();',
  ],
  'Offline sync coordinator should persist active/completed sync jobs for progress and completion state.',
);

assertIncludes(
  navigate,
  [
    'OFFLINE_SYNC_COMPLETION_NOTICE_DISMISSED_STORAGE_KEY',
    'readDismissedOfflineSyncCompletionNotices',
    'persistDismissedOfflineSyncCompletionNotices',
    'initialCompletedOfflineSyncNoticeIdsRef',
    'previousOfflineSyncJobStatusRef',
    "previousStatus === 'pending' || previousStatus === 'running'",
    'Offline cache complete',
    'handleDismissOfflineSyncCompletionNotice',
    'Dismiss offline cache complete notice',
  ],
  'Completion notice should be runtime-only, dismissible, keyed by sync identity, and persisted across restarts.',
);

assertInOrder(
  navigate,
  [
    'if (initialCompletedOfflineSyncNoticeIdsRef.current === null) {',
    "offlineTileSyncSnapshot.jobs\n          .filter((job) => job.status === 'complete')",
    'return;',
    'if (!offlineSyncCompletionNoticePrefsHydratedRef.current) {',
    'return;',
    'const justCompleted = offlineTileSyncSnapshot.jobs.find((job) => {',
  ],
  'Startup hydration should record existing completed syncs before considering a completion notice.',
);

assertIncludes(
  offlineModal,
  [
    'export type DownloadedSyncOpenTarget',
    'kind: \'route\'',
    'kind: \'region\'',
    'onOpenDownloadedSync',
    "? { kind: 'route', route: item.route }",
    ": { kind: 'region', region: item.regionItem }",
  ],
  'Downloaded sync Open should distinguish route syncs from map-area syncs.',
);

assertIncludes(
  navigate,
  [
    'const handleOpenDownloadedSync = useCallback(async (target: DownloadedSyncOpenTarget) => {',
    "if (target.kind === 'region')",
    'getOfflineRouteDestination(route)',
    "await previewRoadDestination(destination, 'offline_sync_open');",
    'buildOfflineCachedRoadPreviewRoute(route, origin, destination)',
    "await previewRoadRoute(cachedRoadRoute, 'offline_sync_open');",
    "showToast('WAITING FOR GPS TO PREVIEW OFFLINE ROUTE')",
    "showToast(usedMetadata ? 'ROUTE PREVIEW RESTORED FROM OFFLINE SYNC'",
  ],
  'Downloaded route sync Open should return to road preview from current GPS to saved destination with fallbacks.',
);

assertIncludes(
  navigate,
  [
    'currentRouteContext: route',
    'downloadedRoutes: offlineRouteReadinessState.routes',
    'tileSyncJobs: offlineTileSyncSnapshot.jobs',
    'buildRouteGuidanceReadinessViewModel({',
  ],
  'Road preview should evaluate offline readiness against downloaded route syncs and active jobs.',
);

assertIncludes(
  roadOverlay,
  [
    'onPrimaryPreviewAction ?? onStartNavigation',
    "action.id === 'prepare_offline'",
    '? onPrepareOffline',
    "action.id === 'review_route'",
    '? onRouteOverview',
  ],
  'Road preview should still expose Start Route, Review Route, and Prepare Offline actions.',
);

assertIncludes(
  offlineReadinessSource,
  [
    'findMatchingRoute(current, routes)',
    "label: hasOtherRouteSync ? 'Route Not Cached' : 'Not Prepared'",
    "'Prepare offline to cache this route.'",
    "label: 'Style Not Cached'",
    "label: 'Layer Not Cached'",
    "level: 'ready'",
    "'Route corridor and active map style are cached for this preview.'",
  ],
  'Offline readiness should use specific route/style/layer states instead of generic incomplete-data fallback.',
);

const moduleCache = new Map();
function loadTsModule(relPath) {
  const filename = path.join(root, relPath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(filename, module);
  function localRequire(request) {
    if (request.startsWith('.')) {
      return loadTsModule(path.relative(root, path.join(path.dirname(filename), `${request}.ts`)));
    }
    return require(request);
  }
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

const { deriveOfflineReadiness } = loadTsModule(path.join('lib', 'offlineReadinessPresentation.ts'));

const destination = { latitude: 38.2, longitude: -109.3, label: 'M1 Ridge Road' };
const routeIntent = {
  syncType: 'route',
  destination,
  mapContext: { styleKey: '3d', layerContext: ['route-corridor', 'road-preview'] },
};
const completedRoute = {
  id: 'offline-route-m1',
  sourceRouteId: 'road-preview-m1',
  routeIdAliases: ['road-preview-m1'],
  stableRouteKey: 'stable-m1',
  name: 'M1 Ridge Road',
  routeGeometry: [
    { latitude: 38.1, longitude: -109.2 },
    { latitude: 38.2, longitude: -109.3 },
  ],
  finalDestination: destination,
  routeIntent,
  offlineTileRegionId: 'region-route-m1',
  cacheStatus: 'cached',
  tileCacheAvailable: true,
  tileCacheStatus: 'complete',
};
const completedRegion = {
  id: 'region-route-m1',
  name: 'Route: M1 Ridge Road',
  status: 'complete',
  sourceType: 'route-corridor',
  syncType: 'route',
  routeId: 'road-preview-m1',
  styleKey: '3d',
  downloadedTiles: 100,
  tileCount: 100,
  routeIntent,
};
const readiness = deriveOfflineReadiness({
  currentRouteContext: {
    routeId: 'road-preview-m1',
    destination: { lat: 38.2, lng: -109.3, label: 'M1 Ridge Road' },
    geometry: [
      { lat: 38.08, lng: -109.18 },
      { lat: 38.2, lng: -109.3 },
    ],
    mapStyle: '3d',
    requiredLayers: ['route-corridor', 'road-preview'],
  },
  downloadedRoutes: [completedRoute],
  tileRegions: [completedRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(readiness.level === 'ready', 'Completed applicable 3D route sync should be offline ready.');
assert(
  !`${readiness.label} ${readiness.reason}`.includes('Offline data incomplete'),
  'Completed applicable route sync should not report generic incomplete offline data.',
);

console.log('navigate offline route flow regression passed');
