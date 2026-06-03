const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertNotMatches(source, pattern, message) {
  assert.ok(!pattern.test(source), message);
}

const contract = read('docs', 'ecs-visual-theme-contract.md');
const packageJson = read('package.json');
const rootLayout = read('app', '_layout.tsx');
const surfaceTokens = read('lib', 'ecsSurfaceTokens.ts');
const shellChromeTheme = read('lib', 'ui', 'shellChromeTheme.ts');
const topoBackground = read('components', 'TopoBackground.tsx');
const fleet = read('app', '(tabs)', 'fleet.tsx');

for (const fragment of [
  'Fleet As Visual Reference',
  'Primary Shell Scope',
  'No Layout Or Content Changes',
  'Shared Background Contract',
  'Semantic Color Exceptions',
  'Mapbox And Navigation Exceptions',
  'Use `ECSCard`, `ECSPanel`, `ECSBadge`, `ECSStatusPill`, `ECSButton`, `ECSActionRow`, and `ECSModalShell`',
]) {
  assertIncludes(contract, fragment, `ECS visual theme contract should document ${fragment}.`);
}

assertIncludes(
  packageJson,
  '"test:ecs-visual-theme-contract": "node ./scripts/test-ecs-visual-theme-contract.js"',
  'package.json should expose the ECS visual theme contract test.',
);

for (const route of [
  '/fleet',
  '/navigate',
  '/dashboard',
  '/discover',
  '/explore',
  '/route',
  '/trips',
  '/expeditions',
  '/intelligence',
  '/intel',
  '/safety',
  '/more',
  '/loadmap',
  '/loaditems',
  '/alert',
  '/convoy-command',
]) {
  assertIncludes(
    rootLayout,
    `normalizedPathname === '${route}'`,
    `Root shell body background should explicitly cover primary shell route ${route}.`,
  );
}

for (const token of [
  'appShell',
  'panel',
  'overlay',
  'pill',
  'divider',
  'primary: ECS_SURFACE.background.primary',
  'muted: ECS_SURFACE.background.compact',
  'selected: ECS_STATUS.tone.selected.background',
]) {
  assertIncludes(surfaceTokens, token, `Surface token aliases should expose ${token}.`);
}

assertIncludes(shellChromeTheme, 'bodyScrim', 'Shell chrome theme should continue owning body scrim opacity.');
assertIncludes(topoBackground, "backgroundColor: 'transparent'", 'TopoBackground should remain transparent under the root shell image.');

for (const forbiddenFleetMedia of [
  '<Image',
  'ImageBackground',
  'photoManifest',
  'photoResolver',
  'remoteImage',
]) {
  assertNotIncludes(fleet, forbiddenFleetMedia, `Fleet must remain the no-photo visual reference: ${forbiddenFleetMedia}.`);
}

const transparentShellScreens = [
  ['app/(tabs)/trips.tsx', read('app', '(tabs)', 'trips.tsx')],
  ['app/(tabs)/route.tsx', read('app', '(tabs)', 'route.tsx')],
  ['app/(tabs)/more.tsx', read('app', '(tabs)', 'more.tsx')],
  ['app/(tabs)/loaditems.tsx', read('app', '(tabs)', 'loaditems.tsx')],
  ['app/convoy-command.tsx', read('app', 'convoy-command.tsx')],
];

for (const [file, source] of transparentShellScreens) {
  assertIncludes(source, "backgroundColor: 'transparent'", `${file} should let ShellBodyBackground own the page background.`);
  assertNotMatches(source, /backgroundColor:\s*COLORS\.bg\s*[,}]/, `${file} should not paint over the shell background with legacy COLORS.bg.`);
  assertNotMatches(source, /backgroundColor:\s*TACTICAL\.bg\s*[,}]/, `${file} should not paint over the shell background with TACTICAL.bg.`);
  assertNotMatches(source, /backgroundColor:\s*colors\.bg\s*[,}]/, `${file} should not paint over the shell background with theme colors.bg.`);
}

const primaryShellScreens = [
  ['app/(tabs)/dashboard.tsx', read('app', '(tabs)', 'dashboard.tsx')],
  ['app/(tabs)/navigate.tsx', read('app', '(tabs)', 'navigate.tsx')],
  ['app/(tabs)/discover.tsx', read('app', '(tabs)', 'discover.tsx')],
  ['app/(tabs)/fleet.tsx', fleet],
  ['app/(tabs)/trips.tsx', read('app', '(tabs)', 'trips.tsx')],
  ['app/(tabs)/expeditions.tsx', read('app', '(tabs)', 'expeditions.tsx')],
  ['app/(tabs)/route.tsx', read('app', '(tabs)', 'route.tsx')],
  ['app/(tabs)/loadmap.tsx', read('app', '(tabs)', 'loadmap.tsx')],
  ['app/(tabs)/loaditems.tsx', read('app', '(tabs)', 'loaditems.tsx')],
  ['app/(tabs)/intelligence.tsx', read('app', '(tabs)', 'intelligence.tsx')],
  ['app/(tabs)/intel.tsx', read('app', '(tabs)', 'intel.tsx')],
  ['app/(tabs)/safety.tsx', read('app', '(tabs)', 'safety.tsx')],
  ['app/(tabs)/more.tsx', read('app', '(tabs)', 'more.tsx')],
  ['app/(tabs)/alert.tsx', read('app', '(tabs)', 'alert.tsx')],
  ['app/convoy-command.tsx', read('app', 'convoy-command.tsx')],
  ['components/dispatch/DispatchCommandCenter.tsx', read('components', 'dispatch', 'DispatchCommandCenter.tsx')],
];

for (const [file, source] of primaryShellScreens) {
  assertNotIncludes(source, 'ImageBackground', `${file} should not introduce local background image ownership.`);
  assertNotIncludes(source, 'LinearGradient', `${file} should not introduce local gradient background ownership.`);
}

const visualTokenConsumers = [
  ['app/(tabs)/route.tsx', read('app', '(tabs)', 'route.tsx')],
  ['app/(tabs)/trips.tsx', read('app', '(tabs)', 'trips.tsx')],
  ['app/(tabs)/loaditems.tsx', read('app', '(tabs)', 'loaditems.tsx')],
  ['app/convoy-command.tsx', read('app', 'convoy-command.tsx')],
];

for (const [file, source] of visualTokenConsumers) {
  assertIncludes(source, 'ECS_SURFACE', `${file} should consume shared ECS surface tokens for visual chrome.`);
}

console.log('[ecs-visual-theme-contract] primary shell visual theme contract passed');
