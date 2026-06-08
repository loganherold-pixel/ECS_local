const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const routeManifest = loadTypeScriptModule('lib/routeManifest.ts');
const alertRoute = read('app', '(tabs)', 'alert.tsx');
const dispatchCad = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const convoyCommand = read('app', 'convoy-command.tsx');
const expeditionDispatch = read('app', 'expedition-dispatch.tsx');

assert.strictEqual(
  routeManifest.ECS_CANONICAL_DISPATCH_ROUTE,
  '/alert',
  '/alert should remain the canonical Dispatch landing because it hosts DispatchCadCommandCenter.',
);
assert.strictEqual(
  routeManifest.getPrimaryTabById('dispatch').route,
  routeManifest.ECS_CANONICAL_DISPATCH_ROUTE,
  'The Dispatch dock tab should use the canonical Dispatch landing route.',
);

[
  ['/alert', 'primary_dispatch_landing'],
  ['/convoy-command', 'convoy_command_surface'],
  ['/expedition-dispatch', 'expedition_dispatch_command_surface'],
].forEach(([route, purpose]) => {
  const relationship = routeManifest.getDispatchRouteRelationship(route);
  assert.strictEqual(relationship?.purpose, purpose, `${route} should have Dispatch purpose ${purpose}.`);
  assert.strictEqual(routeManifest.getPrimaryTabForPath(route)?.id, 'dispatch', `${route} should highlight Dispatch.`);
});

assert(
  alertRoute.includes('DispatchCadCommandCenter') &&
    alertRoute.includes('Header title="Dispatch"') &&
    alertRoute.includes('TabErrorBoundary tabName="DISPATCH"'),
  '/alert should remain the primary Dispatch CAD landing shell.',
);
assert(
  dispatchCad.includes("router.push('/convoy-command' as any)") &&
    dispatchCad.includes('accessibilityLabel="Open convoy setup"'),
  'Dispatch landing should expose Convoy Command access.',
);
assert(
  dispatchCad.includes("pathname: '/expedition-dispatch'") &&
    dispatchCad.includes('accessibilityLabel="Open active expedition dispatch feed"'),
  'Dispatch landing should expose Expedition Dispatch when an active expedition feed exists.',
);
assert(
  dispatchCad.includes('handleEmergencyPingButtonPress') &&
    dispatchCad.includes('emergencyPingButtonAccessibilityLabel') &&
    dispatchCad.includes('Recovery Report'),
  'Dispatch landing should retain local emergency/recovery alert actions.',
);
assert(
  convoyCommand.includes('accessibilityLabel="Back to dispatch"') &&
    fs.existsSync(path.join(root, 'app', 'convoy-command.tsx')),
  '/convoy-command should remain reachable as the Dispatch-owned Convoy Command surface.',
);
assert(
  expeditionDispatch.includes('export default function ExpeditionDispatchScreen') &&
    fs.existsSync(path.join(root, 'app', 'expedition-dispatch.tsx')),
  '/expedition-dispatch should remain reachable as the expedition-specific Dispatch feed.',
);

console.log('Dispatch entry surface checks passed.');
