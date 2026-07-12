const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetRenderers = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const navigateSurfaceWidget = fs.readFileSync(path.join(root, 'components/dashboard/NavigateSurfaceWidget.tsx'), 'utf8');
const commandModuleStore = fs.readFileSync(path.join(root, 'lib/ecsCommandModuleStore.ts'), 'utf8');
const dashboardScreen = fs.readFileSync(path.join(root, 'app/(tabs)/dashboard.tsx'), 'utf8');
const widgetGrid = fs.readFileSync(path.join(root, 'components/dashboard/WidgetGrid.tsx'), 'utf8');
const expeditionTab = fs.readFileSync(path.join(root, 'components/dashboard/ExpeditionTab.tsx'), 'utf8');
const mapFallbackSurface = fs.readFileSync(path.join(root, 'components/navigate/MapFallbackSurface.tsx'), 'utf8');
const mapRenderer = fs.readFileSync(path.join(root, 'components/navigate/MapRenderer.tsx'), 'utf8');
const routeProgressMiniMap = fs.readFileSync(path.join(root, 'components/dashboard/RouteProgressMiniMap.tsx'), 'utf8');
const routeProgressMiniMapModel = fs.readFileSync(path.join(root, 'components/dashboard/routeProgressMiniMapModel.ts'), 'utf8');

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
    commandModuleStore.includes('waitForHydration()'),
  'Command Module store must default to Navigation Command and persist selected module preferences.',
);

assert(
  widgetRenderers.includes('<CommandCenterHost') &&
    widgetRenderers.includes('threeDNavigation: ({ mode }) => (') &&
    widgetRenderers.includes("<Mini3DFollowMap options={options} selected={mode === 'threeDNavigation'} />") &&
    countOccurrences(widgetRenderers, '<Mini3DFollowMap') === 1,
  'Navigation Command must be mounted only through the selected command-center host renderer.',
);

assert(
  navigateSurfaceWidget.includes('export function useNavigateSurfaceState(options?: WidgetRenderOptions, enabled = true)') &&
    navigateSurfaceWidget.includes('if (!enabled) return undefined;') &&
    navigateSurfaceWidget.includes('useNavigateSurfaceState(options, selected)') &&
    navigateSurfaceWidget.includes('function NavigationCommandStatusCard') &&
    navigateSurfaceWidget.includes('dashboard-navigation-command-status-card'),
  'Inactive Navigation Command should not subscribe to guidance updates and active command should render route/GPS status.',
);

for (const forbiddenDashboardMapRuntime of [
  'MapRenderer',
  'MapFallbackSurface',
  'getMapboxToken',
  'getMapboxTokenSync',
  'mapboxToken',
  'cameraCommand',
  'onUserDrag',
]) {
  assert(
    !navigateSurfaceWidget.includes(forbiddenDashboardMapRuntime),
    `Dashboard Navigate Surface must not retain map runtime code: ${forbiddenDashboardMapRuntime}.`,
  );
}

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
    `Navigation Command must consume existing guidance state and not mutate/recalculate routes via ${forbiddenRouteMutation}.`,
  );
}

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
  !widgetRenderers.includes("import RouteProgressMiniMap, { buildRouteProgressFeatureFromPoints } from './RouteProgressMiniMap';") &&
    widgetRenderers.includes("import { buildRouteProgressFeatureFromPoints, type RouteProgressFeature } from './routeProgressMiniMapModel';") &&
    widgetRenderers.includes("const RouteProgressMiniMap = React.lazy(() => import('./RouteProgressMiniMap'));") &&
    widgetRenderers.includes('<React.Suspense fallback={null}>') &&
    routeProgressMiniMap.includes("import { type RouteProgressFeature } from './routeProgressMiniMapModel';") &&
    !routeProgressMiniMap.includes('export function buildRouteProgressFeatureFromPoints') &&
    routeProgressMiniMapModel.includes('export type RouteProgressFeature = ReturnType<typeof pointsToLineStringFeature>;') &&
    routeProgressMiniMapModel.includes('export function buildRouteProgressFeatureFromPoints(points: MiniMapCoordinate[]): RouteProgressFeature'),
  'Dashboard route progress mini maps must lazy-load the WebView component and keep route geometry helpers in a lightweight model module.',
);

assert(
  routeProgressMiniMap.includes('<WebView') &&
    routeProgressMiniMap.includes('<MapFallbackSurface') &&
    mapRenderer.includes('convoyMarkers?: ConvoyMapOverlayMarker[]') &&
    mapRenderer.includes('dispatchPingMarkers?: DispatchPingMapMarker[]'),
  'Route Progress remains the Dashboard map preview while Navigate MapRenderer owns convoy and Dispatch ping overlays.',
);

assert(
  !expeditionTab.includes("import ExpeditionRecapMap from './ExpeditionRecapMap';") &&
    expeditionTab.includes("const ExpeditionRecapMap = React.lazy(() => import('./ExpeditionRecapMap'));") &&
    expeditionTab.includes('<React.Suspense fallback={null}>') &&
    expeditionTab.indexOf('<ExpeditionRecapMap') < expeditionTab.indexOf('<ExpeditionNotableMomentsTimeline'),
  'Dashboard Expedition Hub should lazy-load the WebView recap map only when a completed trip detail is opened.',
);

assert(
  mapFallbackSurface.includes('const project = useMemo(') &&
    mapFallbackSurface.includes('makeProjector(bounds, width, height)') &&
    mapFallbackSurface.includes('const projectedSegmentLines = useMemo(') &&
    mapFallbackSurface.includes('const projectedRouteLine = useMemo(') &&
    mapFallbackSurface.includes('const projectedProgressLine = useMemo(') &&
    mapFallbackSurface.includes('const projectedMarkerPoints = useMemo(') &&
    mapFallbackSurface.includes('const projectedUserPoint = useMemo('),
  'Fallback route map should memoize projected SVG geometry.',
);

assert(
  dashboardScreen.includes('const normalizedAssignedWidgets = useMemo(') &&
    dashboardScreen.includes('assignedWidgets={normalizedAssignedWidgets}') &&
    dashboardScreen.includes('const assignedWidgets = useMemo(() => slots.map(s => s.widgetType), [slots]);'),
  'Dashboard widget library assignments should be memoized instead of rebuilt on every render.',
);

console.log('[command-module-performance-regression] module performance contract passed');
