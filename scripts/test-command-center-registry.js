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
  '../../../lib/ecsCommandModuleStore': {},
});

assert.strictEqual(registry.COMMAND_CENTER_DEFAULT_MODE, 'threeDNavigation');
assert.deepStrictEqual(registry.COMMAND_CENTER_IMPLEMENTED_MODES, [
  'threeDNavigation',
]);

for (const id of [
  'threeDNavigation',
]) {
  assert(registry.COMMAND_CENTER_WIDGET_REGISTRY[id], `Registry missing ${id}`);
}

for (const id of [
  'attitude',
  'recoveryHazardCompass',
  'trailDecision',
  'campScout',
  'expeditionReadiness',
]) {
  assert.strictEqual(
    registry.COMMAND_CENTER_WIDGET_REGISTRY[id],
    undefined,
    `${id} should not be exposed in the command widget menu registry.`,
  );
}

assert.strictEqual(
  registry.COMMAND_CENTER_WIDGET_REGISTRY.convoyCommand,
  undefined,
);
assert(!registry.getSelectableCommandCenterModes({}).includes('convoyCommand'));

assert.strictEqual(registry.commandModuleToCenterMode('follow3d'), 'threeDNavigation');
assert.strictEqual(registry.commandModuleToCenterMode('convoy-command'), 'threeDNavigation');
assert.strictEqual(registry.commandModuleToCenterMode('attitude'), 'threeDNavigation');
assert.strictEqual(registry.commandModuleToCenterMode('terrainRisk'), 'threeDNavigation');
assert.strictEqual(registry.centerModeToCommandModule('campScout'), 'follow3d');
assert.strictEqual(registry.centerModeToCommandModule('attitude'), 'follow3d');
assert.strictEqual(registry.isCommandCenterModuleId('routeCommand'), false);
assert.strictEqual(registry.isCommandCenterModuleId('terrainRisk'), false);
assert.strictEqual(registry.isCommandCenterModuleId('attitude'), false);
assert.strictEqual(registry.isCommandCenterModuleId('convoy-command'), false);
assert.strictEqual(registry.isCommandCenterModuleId('expeditionReadinessCommand'), false);

assert.strictEqual(registry.resolveCommandCenterMode(null, {}), 'threeDNavigation');
assert.strictEqual(registry.resolveCommandCenterMode('convoyCommand', {}), 'threeDNavigation');
assert.strictEqual(registry.resolveCommandCenterMode('trailDecision', { hasLocation: false }), 'threeDNavigation');
assert.strictEqual(registry.resolveCommandCenterMode('campScout', { hasLocation: false }), 'threeDNavigation');
assert.strictEqual(registry.resolveCommandCenterMode('threeDNavigation', { hasActiveRoute: false }), 'threeDNavigation');

assert(commandStoreSource.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'follow3d'"));
assert(commandStoreSource.includes('commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, DEFAULT_ECS_COMMAND_MODULE)'));
assert(commandStoreSource.includes('normalizeECSCommandModuleId(stored)'));
assert(commandStoreSource.includes("if (value === 'convoyCommand' || value === 'convoy-command') return null;"));
assert(
  commandStoreSource.includes("export const ECS_COMMAND_MODULE_ORDER: ECSCommandModuleId[] = [\n  'follow3d',\n];"),
  'Command module selector should expose only 3D Nav Command.',
);
for (const retiredLabel of [
  'Attitude Command',
  'Terrain Risk',
  'Recovery / Hazard Compass',
  'Trail Decision Command',
  'Camp Scout Command',
  'Expedition Readiness Command',
  'Route Command',
  'Power Command',
  'Environmental Command',
]) {
  assert(
    !commandStoreSource.includes(retiredLabel),
    `${retiredLabel} should not remain in the command module selector registry.`,
  );
}
assert(
  commandStoreSource.includes('const normalized = normalizeECSCommandModuleId(moduleId) ?? DEFAULT_ECS_COMMAND_MODULE;'),
  'setSelectedModule should normalize retired module ids back to the default command module.',
);

console.log('[command-center-registry] registry, availability, mapping, and fallback checks passed');
