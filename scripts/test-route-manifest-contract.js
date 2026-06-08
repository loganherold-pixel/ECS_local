const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  const source = fs.readFileSync(fullPath, 'utf8');
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

const {
  ECS_PRIMARY_TAB_MANIFEST,
  ECS_PROTECTED_ROUTE_SCREENS,
  getPrimaryTabForPath,
  getRestorableShellRouteForPath,
  isProtectedRoutePath,
  isSharedShellBackgroundRoute,
} = loadTypeScriptModule('lib/routeManifest.ts');

assert.deepStrictEqual(
  ECS_PRIMARY_TAB_MANIFEST.map((tab) => tab.id),
  ['fleet', 'navigate', 'dashboard', 'explore', 'dispatch'],
  'Primary bottom tab order must remain Fleet | Navigate | Dashboard | Explore | Dispatch.',
);

assert.deepStrictEqual(
  ECS_PRIMARY_TAB_MANIFEST.map((tab) => tab.route),
  ['/fleet', '/navigate', '/dashboard', '/discover', '/alert'],
  'Primary bottom tab routes must preserve the established route paths.',
);

[
  ['/fleet', 'fleet'],
  ['/vehicle-config', 'fleet'],
  ['/navigate', 'navigate'],
  ['/route', 'navigate'],
  ['/navigate-run', 'navigate'],
  ['/dashboard', 'dashboard'],
  ['/discover', 'explore'],
  ['/explore', 'explore'],
  ['/explore-trip-builder', 'explore'],
  ['/explore-offline-prep-pack', 'explore'],
  ['/active-trip', 'explore'],
  ['/alert', 'dispatch'],
  ['/safety', 'dispatch'],
  ['/intel', 'dispatch'],
  ['/more', 'dispatch'],
  ['/convoy-command', 'dispatch'],
  ['/expedition-dispatch', 'dispatch'],
].forEach(([route, expectedTab]) => {
  assert.strictEqual(
    getPrimaryTabForPath(route)?.id,
    expectedTab,
    `${route} should resolve to the ${expectedTab} primary tab.`,
  );
});

[
  ['/explore-trip-builder', '/discover'],
  ['/explore-offline-prep-pack', '/discover'],
  ['/active-trip', '/discover'],
  ['/convoy-command', '/alert'],
  ['/expedition-dispatch', '/alert'],
].forEach(([route, expectedRestorable]) => {
  assert.strictEqual(
    getRestorableShellRouteForPath(route),
    expectedRestorable,
    `${route} should restore to ${expectedRestorable}.`,
  );
});

[
  'expedition-detail',
  'expedition-command',
  'expedition-checklist',
  'expedition-log',
  'expedition-route-mgr',
  'expedition-livelog',
  'expedition-dispatch',
].forEach((screen) => {
  assert.ok(ECS_PROTECTED_ROUTE_SCREENS.includes(screen), `${screen} must remain protected.`);
  assert.ok(isProtectedRoutePath(`/${screen}`), `/${screen} should be recognized as protected.`);
});

assert.strictEqual(
  isSharedShellBackgroundRoute('/active-trip'),
  true,
  '/active-trip should retain shared shell background behavior as an Explore-owned child route.',
);
assert.strictEqual(
  isSharedShellBackgroundRoute('/convoy-command'),
  true,
  '/convoy-command should retain shared shell background behavior.',
);
assert.strictEqual(
  isSharedShellBackgroundRoute('/expedition-dispatch'),
  false,
  '/expedition-dispatch should remain intentionally outside shared shell background chrome.',
);

console.log('Route manifest contract checks passed.');
