const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const commandStoreSource = fs.readFileSync(path.join(repoRoot, 'lib/ecsCommandModuleStore.ts'), 'utf8');

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => (mocks[request] ? mocks[request] : originalRequire(request));
  mod._compile(outputText, filename);
  return mod.exports;
}

const registry = loadTsModule('components/dashboard/commandCenter/commandCenterRegistry.ts', {
  './RecoveryHazardCompass': { default: function RecoveryHazardCompass() {} },
  './TrailDecisionCommand': { default: function TrailDecisionCommand() {} },
  './CampScoutCommand': { default: function CampScoutCommand() {} },
  './ExpeditionReadinessCommand': { ExpeditionReadinessCommand: function ExpeditionReadinessCommand() {} },
  './ConvoyCommand': { default: function ConvoyCommand() {} },
  '../../../lib/ecsCommandModuleStore': {},
});

assert.strictEqual(registry.COMMAND_CENTER_DEFAULT_MODE, 'attitude');
assert.deepStrictEqual(registry.COMMAND_CENTER_IMPLEMENTED_MODES, [
  'attitude',
  'threeDNavigation',
  'recoveryHazardCompass',
  'trailDecision',
  'campScout',
  'expeditionReadiness',
  'convoyCommand',
]);

for (const id of [
  'attitude',
  'threeDNavigation',
  'recoveryHazardCompass',
  'trailDecision',
  'campScout',
  'expeditionReadiness',
  'convoyCommand',
]) {
  assert(registry.COMMAND_CENTER_WIDGET_REGISTRY[id], `Registry missing ${id}`);
}

assert.strictEqual(
  registry.getCommandCenterAvailability(registry.COMMAND_CENTER_WIDGET_REGISTRY.convoyCommand, {}),
  'setupNeeded',
);
assert(registry.getSelectableCommandCenterModes({}).includes('convoyCommand'));
assert.strictEqual(
  registry.getCommandCenterAvailability(
    registry.COMMAND_CENTER_WIDGET_REGISTRY.convoyCommand,
    { hasConvoyMembers: true },
  ),
  'partial',
);

assert.strictEqual(registry.commandModuleToCenterMode('follow3d'), 'threeDNavigation');
assert.strictEqual(registry.commandModuleToCenterMode('convoyCommand'), 'convoyCommand');
assert.strictEqual(registry.centerModeToCommandModule('campScout'), 'campScoutCommand');
assert.strictEqual(registry.centerModeToCommandModule('convoyCommand'), 'convoyCommand');
assert.strictEqual(registry.isCommandCenterModuleId('routeCommand'), false);
assert.strictEqual(registry.isCommandCenterModuleId('convoyCommand'), true);
assert.strictEqual(registry.isCommandCenterModuleId('expeditionReadinessCommand'), true);

assert.strictEqual(registry.resolveCommandCenterMode(null, {}), 'attitude');
assert.strictEqual(registry.resolveCommandCenterMode('convoyCommand', {}), 'convoyCommand');
assert.strictEqual(registry.resolveCommandCenterMode('trailDecision', { hasLocation: false }), 'trailDecision');
assert.strictEqual(registry.resolveCommandCenterMode('campScout', { hasLocation: false }), 'campScout');
assert.strictEqual(registry.resolveCommandCenterMode('threeDNavigation', { hasActiveRoute: false }), 'threeDNavigation');

assert.strictEqual(
  registry.getCommandCenterAvailability(
    registry.COMMAND_CENTER_WIDGET_REGISTRY.trailDecision,
    { hasLocation: false },
  ),
  'setupNeeded',
);
assert.strictEqual(
  registry.getCommandCenterAvailability(
    registry.COMMAND_CENTER_WIDGET_REGISTRY.recoveryHazardCompass,
    { hasLocation: true, hasHeading: true, hasSavedPins: true },
  ),
  'available',
);

assert(commandStoreSource.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'attitude'"));
assert(commandStoreSource.includes('commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, DEFAULT_ECS_COMMAND_MODULE)'));
assert(commandStoreSource.includes('isECSCommandModuleId(stored) ? stored : DEFAULT_ECS_COMMAND_MODULE'));

console.log('[command-center-registry] registry, availability, mapping, and fallback checks passed');
