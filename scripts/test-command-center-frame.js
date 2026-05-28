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
].forEach((token) => {
  assert.ok(typesSource.includes(token), `Command center types missing ${token}`);
});

[
  'COMMAND_CENTER_WIDGET_REGISTRY',
  'COMMAND_CENTER_IMPLEMENTED_MODES',
  'COMMAND_CENTER_DEFAULT_MODE',
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
  /'attitude',\s*'follow3d'/.test(commandStoreSource) &&
    /'follow3d',\s*'terrainRisk'/.test(commandStoreSource) &&
    commandStoreSource.includes("label: '3D Nav Command'") &&
    commandStoreSource.includes("label: 'Terrain Risk'") &&
    !commandStoreSource.includes('Recovery / Hazard Compass') &&
    !commandStoreSource.includes('Trail Decision Command') &&
    !commandStoreSource.includes('Camp Scout Command') &&
    !commandStoreSource.includes('Expedition Readiness Command'),
  'Command module store should expose Attitude Command, 3D Nav Command, and Terrain Risk in the command module selector.',
);

assert.ok(
  widgetRenderersSource.includes('CommandCenterHost') &&
    widgetRenderersSource.includes('COMMAND_CENTER_MODES') &&
    widgetRenderersSource.includes('COMMAND_CENTER_IMPLEMENTED_MODES') &&
    widgetRenderersSource.includes('commandModuleToCenterMode') &&
    widgetRenderersSource.includes('centerModeToCommandModule') &&
    widgetRenderersSource.includes('moduleTransitionShellFramedCommand') &&
    widgetRenderersSource.includes("width: '100%'") &&
    !widgetRenderersSource.includes('dashboard-command-center-mode-selector') &&
    widgetRenderersSource.includes('isCommandCenterModuleId') &&
    widgetRenderersSource.includes('dataContext={commandCenterDataContext}') &&
    !registrySource.includes("label: 'Recovery / Hazard Compass'") &&
    !registrySource.includes("label: 'Trail Decision Command'") &&
    !registrySource.includes("label: 'Camp Scout Command'") &&
    !registrySource.includes("label: 'Expedition Readiness Command'") &&
    !registrySource.includes("label: 'Convoy Command'"),
  'Dashboard Attitude Command renderer should use the reusable command-center host while keeping non-host modules outside the command-center mode selector.',
);

assert.ok(
  widgetRenderersSource.includes("soundEnabled: selectedCommandModule === 'attitude' && soundEnabled") &&
    widgetRenderersSource.includes('selectedCommandModule, soundEnabled'),
  'Attitude rollover caution sound should only play while the Attitude command module is selected.',
);

console.log('CommandCenterFrame checks passed.');
