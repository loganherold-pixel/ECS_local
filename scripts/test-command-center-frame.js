const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const frameSource = read('components/dashboard/commandCenter/CommandCenterFrame.tsx');
const hostSource = read('components/dashboard/commandCenter/CommandCenterHost.tsx');
const registrySource = read('components/dashboard/commandCenter/commandCenterRegistry.ts');
const selectorSource = read('components/dashboard/commandCenter/CommandCenterModeSelector.tsx');
const typesSource = read('components/dashboard/commandCenter/commandCenterTypes.ts');
const indexSource = read('components/dashboard/commandCenter/index.ts');
const widgetRenderersSource = read('components/dashboard/WidgetRenderers.tsx');
const commandStoreSource = read('lib/ecsCommandModuleStore.ts');

[
  'CommandCenterFrameProps',
  'CommandCenterState',
  'CommandCenterMode',
  'CommandCenterWidgetDefinition',
  'CommandCenterAvailabilityState',
  'CommandCenterDataContext',
  "'live'",
  "'checkIn'",
  "'planned'",
  "'estimated'",
  "'partial'",
  "'offline'",
  "'setupNeeded'",
  "'attitude'",
  "'threeDNavigation'",
  "'recoveryHazardCompass'",
  "'trailDecision'",
  "'campScout'",
  "'expeditionReadiness'",
  "'convoyCommand'",
].forEach((token) => {
  assert.ok(typesSource.includes(token), `Command center types missing ${token}`);
});

[
  'COMMAND_CENTER_WIDGET_REGISTRY',
  'COMMAND_CENTER_IMPLEMENTED_MODES',
  'COMMAND_CENTER_DEFAULT_MODE',
  'convoyCommand',
  "defaultAvailability: 'setupNeeded'",
  'getCommandCenterAvailability',
  'getSelectableCommandCenterModes',
  'resolveCommandCenterMode',
  'commandModuleToCenterMode',
  'centerModeToCommandModule',
  'isCommandCenterModuleId',
].forEach((token) => {
  assert.ok(registrySource.includes(token), `Command center registry missing ${token}`);
});

[
  'CommandCenterHost',
  'resolveCommandCenterMode',
  'getSelectableCommandCenterModes',
  'externalRenderers',
  'definition.component',
  'CommandCenterHostErrorBoundary',
  'ExternalCommandCenterContent',
  'componentDidCatch',
  'componentDidUpdate',
  'onModeChange(resolvedMode)',
  'Command widget unavailable',
].forEach((token) => {
  assert.ok(hostSource.includes(token), `CommandCenterHost missing ${token}`);
});

[
  'ECSInstrumentPanel',
  'variant="command"',
  'sizeVariant="dominant"',
  'TACTICAL.amber',
  'GOLD_RAIL.instrumentHeader',
  'statePill',
  'selectorSlot',
  'modeSelector',
  'footer',
  'children',
].forEach((token) => {
  assert.ok(frameSource.includes(token), `CommandCenterFrame missing expected implementation token: ${token}`);
});

[
  'ATTITUDE',
  'NAV 3D',
  'RECOVERY',
  'TRAIL',
  'CAMP',
  'READY',
  'CONVOY',
  'modeButtonSelected',
  'TACTICAL.amber',
  'TACTICAL.textMuted',
].forEach((token) => {
  assert.ok(selectorSource.includes(token), `CommandCenterModeSelector missing ECS selector token: ${token}`);
});

[
  "live: '#49D17A'",
  "checkIn: '#5AC8FA'",
  'planned: TACTICAL.amber',
  "estimated: '#5AC8FA'",
  'partial: TACTICAL.amber',
  'offline: TACTICAL.textMuted',
  'setupNeeded: TACTICAL.amber',
].forEach((token) => {
  assert.ok(frameSource.includes(token), `CommandCenterFrame missing state accent token: ${token}`);
});

assert.ok(
  !frameSource.includes('VehicleAttitudeStage') &&
    !frameSource.includes('Mini3DFollowMap') &&
    !frameSource.includes('RouteCommandModule') &&
    !frameSource.includes('PowerCommandModule'),
  'CommandCenterFrame should remain free of concrete widget renderers.',
);

assert.ok(
  indexSource.includes('CommandCenterFrame') &&
    indexSource.includes('CommandCenterHost') &&
    indexSource.includes('CommandCenterModeSelector') &&
    indexSource.includes('COMMAND_CENTER_WIDGET_REGISTRY') &&
    indexSource.includes('CommandCenterFrameProps') &&
    indexSource.includes('CommandCenterMode') &&
    indexSource.includes('CommandCenterState'),
  'Command center index should export component and shared types.',
);

assert.ok(
  commandStoreSource.includes("'recoveryHazardCompass'") &&
    commandStoreSource.includes("'trailDecisionCommand'") &&
    commandStoreSource.includes("'campScoutCommand'") &&
    commandStoreSource.includes("'expeditionReadinessCommand'") &&
    commandStoreSource.includes("'convoyCommand'") &&
    commandStoreSource.includes('Recovery / Hazard Compass') &&
    commandStoreSource.includes('Trail Decision Command') &&
    commandStoreSource.includes('Camp Scout Command') &&
    commandStoreSource.includes('Expedition Readiness Command') &&
    commandStoreSource.includes('Convoy Command') &&
    commandStoreSource.includes('Recovery Vector Standby') &&
    /'attitude',\s*'follow3d',\s*'recoveryHazardCompass',\s*'trailDecisionCommand',\s*'campScoutCommand',\s*'expeditionReadinessCommand',\s*'convoyCommand'/.test(commandStoreSource),
  'Command module store should persist Attitude, 3D Navigation, Recovery, Trail Decision, Camp Scout, Expedition Readiness, and Convoy command-center modes.',
);

assert.ok(
  widgetRenderersSource.includes('CommandCenterHost') &&
    widgetRenderersSource.includes('COMMAND_CENTER_MODES') &&
    widgetRenderersSource.includes('COMMAND_CENTER_IMPLEMENTED_MODES') &&
    widgetRenderersSource.includes('commandModuleToCenterMode') &&
    widgetRenderersSource.includes('centerModeToCommandModule') &&
    !widgetRenderersSource.includes('dashboard-command-center-mode-selector') &&
    widgetRenderersSource.includes('isCommandCenterModuleId') &&
    widgetRenderersSource.includes('dataContext={commandCenterDataContext}') &&
    registrySource.includes("label: 'Recovery / Hazard Compass'") &&
    registrySource.includes("label: 'Trail Decision Command'") &&
    registrySource.includes("label: 'Camp Scout Command'") &&
    registrySource.includes("label: 'Expedition Readiness Command'") &&
    registrySource.includes("label: 'Convoy Command'"),
  'Dashboard Attitude Command renderer should use the reusable command-center host without the redundant in-widget mode selector.',
);

console.log('CommandCenterFrame checks passed.');
