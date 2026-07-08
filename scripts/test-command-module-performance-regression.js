const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetRenderers = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const navigateSurfaceWidget = fs.readFileSync(path.join(root, 'components/dashboard/NavigateSurfaceWidget.tsx'), 'utf8');
const commandModuleStore = fs.readFileSync(path.join(root, 'lib/ecsCommandModuleStore.ts'), 'utf8');
const dashboardScreen = fs.readFileSync(path.join(root, 'app/(tabs)/dashboard.tsx'), 'utf8');
const widgetGrid = fs.readFileSync(path.join(root, 'components/dashboard/WidgetGrid.tsx'), 'utf8');
const mapRenderer = fs.readFileSync(path.join(root, 'components/navigate/MapRenderer.tsx'), 'utf8');
const compactMapTileCacheMatch = mapRenderer.match(/const COMPACT_MAP_MAX_TILE_CACHE_SIZE = (\d+)/);

function assert(condition, message) {
  if (!condition) {
    console.error(`[command-module-performance-regression] ${message}`);
    process.exit(1);
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

assert(
  commandModuleStore.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'follow3d'") &&
    commandModuleStore.includes('private _selectedModule: ECSCommandModuleId = DEFAULT_ECS_COMMAND_MODULE') &&
    commandModuleStore.includes("createPersistedKeyValueCache('ecs_command_preferences')") &&
    commandModuleStore.includes("const STORAGE_KEY_SELECTED_MODULE = 'ecs_command_center_module'") &&
    commandModuleStore.includes("const STORAGE_KEY_DEFAULT_FOLLOW3D_MIGRATED = 'ecs_command_center_default_follow3d_migrated'") &&
    commandModuleStore.includes('commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, normalized)') &&
    commandModuleStore.includes('waitForHydration()'),
  'Command Module store must default to 3D Navigation and persist selected module preferences.',
);

assert(
    widgetRenderers.includes('attitude: ({ mode }) => (') &&
    widgetRenderers.includes('<VehicleAttitudeStage') &&
    widgetRenderers.includes('mode="command"') &&
    widgetRenderers.includes("showReadouts={mode === 'attitude'}") &&
    widgetRenderers.includes("showLiveHashIndicators={mode === 'attitude' && sensorLive}"),
  'Attitude module must remain available through the command-center host renderer.',
);

assert(
  widgetRenderers.includes('<CommandCenterHost') &&
    widgetRenderers.includes('threeDNavigation: ({ mode }) => (') &&
    widgetRenderers.includes("<Mini3DFollowMap options={options} selected={mode === 'threeDNavigation'} />") &&
    countOccurrences(widgetRenderers, '<Mini3DFollowMap') === 1,
  '3D Follow Map must be mounted only through the selected command-center host renderer, not kept alive in inactive modules.',
);

assert(
  navigateSurfaceWidget.includes('export function useNavigateSurfaceState(options?: WidgetRenderOptions, enabled = true)') &&
    navigateSurfaceWidget.includes('useState(() => (enabled ? getMapboxTokenSync() : null))') &&
    navigateSurfaceWidget.includes('if (!enabled) {') &&
    navigateSurfaceWidget.includes('useNavigateSurfaceState(options, selected)') &&
    navigateSurfaceWidget.includes('if (!selected || !cameraCenter || !followLocked) return null'),
  'Inactive Mini3DFollowMap must not load Mapbox token, subscribe to guidance updates, or emit camera commands.',
);

assert(
  navigateSurfaceWidget.includes('quantizeCoordinate(gpsLocation.latitude)') &&
    navigateSurfaceWidget.includes('quantizeCoordinate(gpsLocation.longitude)') &&
    navigateSurfaceWidget.includes('useMemo<CameraCommand | null>(() => {') &&
    navigateSurfaceWidget.includes('durationMs: 650') &&
    navigateSurfaceWidget.includes('pitch: COMMAND_3D_FOLLOW_PITCH') &&
    navigateSurfaceWidget.includes('offset: hasActiveGuidance ? COMMAND_3D_ACTIVE_FOLLOW_OFFSET : COMMAND_3D_FREE_DRIVE_OFFSET'),
  '3D Follow Map camera updates must be memoized, quantized, and controlled through guarded camera commands.',
);

for (const forbiddenRouteMutation of [
  'calculateRoute',
  'generateRoute',
  'buildRoute(',
  'startGuidance',
  'setActiveRoute',
  'routeStore.',
]) {
  assert(
    !navigateSurfaceWidget.includes(forbiddenRouteMutation),
    `3D Follow Map must consume existing guidance state and not mutate/recalculate routes via ${forbiddenRouteMutation}.`,
  );
}

assert(
  navigateSurfaceWidget.includes('function NextTurnStrip') &&
    navigateSurfaceWidget.includes('function buildNextTurnStrip') &&
    navigateSurfaceWidget.includes("if (snapshot.lifecycle !== 'active') return null") &&
    navigateSurfaceWidget.includes("instruction: 'Rerouting...'") &&
    navigateSurfaceWidget.includes("instruction: 'Off route'") &&
    navigateSurfaceWidget.includes('<NextTurnStrip snapshot={routeSession} />'),
  'Next-turn strip must appear only for active guidance and use existing reroute/off-route fields.',
);

assert(
  widgetRenderers.includes('moduleTransitionOpacity') &&
    widgetRenderers.includes('useReducedMotion()') &&
    widgetRenderers.includes('Animated.timing(moduleTransitionOpacity') &&
    widgetRenderers.includes('attitudeCommandS.moduleTransitionShell'),
  'Command Module switching must use a short reduced-motion-aware fade without changing shell layout.',
);

assert(
  widgetGrid.includes('removeClippedSubviews={dragIndex === null}') &&
    widgetGrid.includes('scrollEnabled={dragIndex === null}'),
  'Scrollable dashboard grids should clip offscreen widget subviews while idle and preserve unclipped drag interactions.',
);

assert(
  compactMapTileCacheMatch &&
    Number(compactMapTileCacheMatch[1]) > 0 &&
    Number(compactMapTileCacheMatch[1]) <= 48 &&
    mapRenderer.includes("surfaceMode === 'compact' ? COMPACT_MAP_MAX_TILE_CACHE_SIZE : null") &&
    (
      mapRenderer.includes('mapOptions.maxTileCacheSize = compactTileCacheSize') ||
      mapRenderer.includes('maxTileCacheSize: maxTileCacheSize')
    ) &&
    mapRenderer.includes('performanceMetricsCollection: false') &&
    mapRenderer.includes('scrollZoom: false'),
  'Embedded dashboard map WebViews should bound Mapbox tile cache and disable nonessential browser-map overhead.',
);

assert(
  navigateSurfaceWidget.includes('const resolvedMapStyle = useMemo(() => [styles.mapRenderer, mapStyle], [mapStyle]);') &&
    navigateSurfaceWidget.includes('style={resolvedMapStyle}') &&
    navigateSurfaceWidget.includes('surfaceMode="compact"'),
  'Dashboard mini-map surfaces should pass stable style props and mark embedded WebViews as compact.',
);

assert(
  navigateSurfaceWidget.includes("const miniMapMotionPriority: MapMotionPriority = motionPriority === 'hot' ? 'warm' : motionPriority;") &&
    navigateSurfaceWidget.includes('motionPriority={miniMapMotionPriority}') &&
    navigateSurfaceWidget.includes("standbyWakeDisabled={guidanceVariant !== 'command3d'}") &&
    mapRenderer.includes('const compactRouteGeometryStandbyEligible =') &&
    mapRenderer.includes("routeRenderMode === 'active'") &&
    mapRenderer.includes('interactive === false') &&
    mapRenderer.includes('standbyMapEligible || compactRoutePreviewStandbyEligible || compactRouteGeometryStandbyEligible') &&
    mapRenderer.includes('standbyMapActive && (compactRoutePreviewStandbyEligible || compactRouteGeometryStandbyEligible)'),
  'Read-only dashboard active guidance maps should render route standby instead of mounting a second live WebView during Navigate handoff.',
);

assert(
  dashboardScreen.includes('const normalizedAssignedWidgets = useMemo(') &&
    dashboardScreen.includes('assignedWidgets={normalizedAssignedWidgets}') &&
    dashboardScreen.includes('const assignedWidgets = useMemo(() => slots.map(s => s.widgetType), [slots]);'),
  'Dashboard widget library assignments should be memoized instead of rebuilt on every render.',
);

assert(
  widgetRenderers.includes("'No active route'") &&
    widgetRenderers.includes("'Power source unavailable'") &&
    widgetRenderers.includes("'CONNECT POWER'") &&
    widgetRenderers.includes("'Remoteness source unavailable'") &&
    widgetRenderers.includes("remotenessScore != null ? `${Math.round(remotenessScore)}` : 'Unknown'"),
  'Unavailable route, power, and environmental states must remain truthful after module switching.',
);

console.log('[command-module-performance-regression] module performance contract passed');
