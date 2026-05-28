const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetRenderers = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const navigateSurfaceWidget = fs.readFileSync(path.join(root, 'components/dashboard/NavigateSurfaceWidget.tsx'), 'utf8');
const commandModuleStore = fs.readFileSync(path.join(root, 'lib/ecsCommandModuleStore.ts'), 'utf8');

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
  commandModuleStore.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'attitude'") &&
    commandModuleStore.includes('private _selectedModule: ECSCommandModuleId = DEFAULT_ECS_COMMAND_MODULE') &&
    commandModuleStore.includes("createPersistedKeyValueCache('ecs_command_preferences')") &&
    commandModuleStore.includes("const STORAGE_KEY_SELECTED_MODULE = 'ecs_command_center_module'") &&
    commandModuleStore.includes('commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, normalized)') &&
    commandModuleStore.includes('waitForHydration()'),
  'Command Module store must default to Attitude Monitor and persist selected module preferences.',
);

assert(
    widgetRenderers.includes("selectedCommandModule === 'attitude' ? (") &&
    widgetRenderers.includes('<VehicleAttitudeStage') &&
    widgetRenderers.includes('mode="command"') &&
    widgetRenderers.includes('showLiveHashIndicators={false}') &&
    widgetRenderers.includes('onZero={undefined}'),
  'Default Attitude Monitor module must keep the existing VehicleAttitudeStage command rendering path.',
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
    navigateSurfaceWidget.includes('if (!selected || !cameraCenter) return null'),
  'Inactive Mini3DFollowMap must not load Mapbox token, subscribe to guidance updates, or emit camera commands.',
);

assert(
  navigateSurfaceWidget.includes('quantizeCoordinate(gpsLocation.latitude)') &&
    navigateSurfaceWidget.includes('quantizeCoordinate(gpsLocation.longitude)') &&
    navigateSurfaceWidget.includes('useMemo<CameraCommand | null>(() => {') &&
    navigateSurfaceWidget.includes('durationMs: 650') &&
    navigateSurfaceWidget.includes('pitch: COMMAND_3D_FOLLOW_PITCH') &&
    navigateSurfaceWidget.includes('offset: COMMAND_3D_FOLLOW_OFFSET'),
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
  widgetRenderers.includes("'No active route'") &&
    widgetRenderers.includes("'Power source unavailable'") &&
    widgetRenderers.includes("'CONNECT POWER'") &&
    widgetRenderers.includes("'Remoteness source unavailable'") &&
    widgetRenderers.includes("remotenessScore != null ? `${Math.round(remotenessScore)}` : 'Unknown'"),
  'Unavailable route, power, and environmental states must remain truthful after module switching.',
);

console.log('[command-module-performance-regression] module performance contract passed');
