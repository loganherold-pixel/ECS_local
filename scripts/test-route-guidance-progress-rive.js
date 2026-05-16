const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetSource = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const nativeSource = fs.readFileSync(path.join(root, 'components/dashboard/RouteGuidanceProgressRive.native.tsx'), 'utf8');
const webSource = fs.readFileSync(path.join(root, 'components/dashboard/RouteGuidanceProgressRive.tsx'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'lib/routeGuidanceProgressRive.ts'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assert.ok(
  fs.existsSync(path.join(root, 'assets/route/guide_progress_map.riv')),
  'guide_progress_map.riv must be bundled under assets/route.',
);

includes(
  runtimeSource,
  "ROUTE_GUIDANCE_PROGRESS_STATE_MACHINE = 'RouteGuidanceState'",
  'Route Guidance Rive contract should use the actual state machine discovered from the .riv file.',
);
includes(
  runtimeSource,
  "ROUTE_GUIDANCE_PROGRESS_VIEW_MODEL = 'RouteGuidanceVM'",
  'Route Guidance Rive contract should use the actual view model discovered from the .riv file.',
);
includes(runtimeSource, 'routeProgress: isActive ? clampProgressPercent', 'Inactive routes must drive zero progress.');
includes(runtimeSource, 'Math.max(0, Math.min(100, Math.round(value)))', 'Route progress sent to Rive must be clamped 0-100.');

notIncludes(
  nativeSource,
  "from '@rive-app/react-native'",
  'Native Route Guidance Rive component must lazy-load Rive so Expo Go does not crash on NitroModules.',
);
includes(nativeSource, "Constants.appOwnership === 'expo'", 'Expo Go should use the existing fallback visual.');
includes(nativeSource, "require('@rive-app/react-native')", 'Native builds should load the existing Rive runtime.');
includes(nativeSource, "require('../../assets/route/guide_progress_map.riv')", 'Native component should load the bundled .riv asset.');
includes(nativeSource, "viewModelName: ROUTE_GUIDANCE_PROGRESS_VIEW_MODEL", 'Native component should bind RouteGuidanceVM.');
includes(nativeSource, "stateMachineName={ROUTE_GUIDANCE_PROGRESS_STATE_MACHINE}", 'Native component should play RouteGuidanceState.');
includes(nativeSource, "instance.numberProperty('routeProgress')?.set(runtime.routeProgress)", 'Native component should write routeProgress.');
includes(nativeSource, "instance.booleanProperty('isActive')?.set(runtime.isActive)", 'Native component should write isActive.');
includes(nativeSource, "instance.booleanProperty('isOffline')?.set(runtime.isOffline)", 'Native component should write isOffline.');
includes(nativeSource, 'fallback ?? null', 'Native component must preserve a safe fallback if Rive fails.');
includes(nativeSource, 'console.warn(`[RouteGuidanceProgressRive]', 'Development failures should log a helpful warning.');

includes(webSource, 'fallback ?? null', 'Web/Expo fallback should preserve the existing route guidance background.');

includes(widgetSource, "import RouteGuidanceProgressRive from './RouteGuidanceProgressRive'", 'Route widget should use the shared Rive background wrapper.');
includes(widgetSource, '<RouteGuidanceProgressRive', 'Route Progress visual should mount the Rive background.');
includes(widgetSource, 'progressPercent={routeActive ? targetProgress : 0}', 'No-active-route state must send zero progress to Rive.');
includes(widgetSource, 'isActive={routeActive}', 'Rive active state must follow the real route activity flag.');
includes(widgetSource, 'isOffline={route?.isOffline ?? false}', 'Rive offline state should follow the derived route visual state.');
includes(widgetSource, 'isOffline: hasActiveRouteProgress && !hasRouteProgressGeometry', 'Route visual offline state should come from limited active route geometry.');
includes(widgetSource, 'fallback={legacyRouteVisual}', 'Existing SVG/image route visual must remain as the fallback.');
includes(widgetSource, 'routeProgress?.progressPercent ?? 0', 'Route visual progress should come from the shared active route progress snapshot.');
includes(widgetSource, 'useActiveRouteProgressSnapshot(options)', 'Route progress must come from ECS route state, not mock data.');
notIncludes(widgetSource, 'mockRouteProgress', 'Route Guidance Rive must not introduce mock route progress.');
notIncludes(widgetSource, 'Math.random()', 'Route Guidance Rive must not animate progress from random values.');

console.log('[route-guidance-progress-rive] contract passed');
