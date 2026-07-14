const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const metroSource = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
const powerWidgetSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'PowerSystemWidget.tsx'), 'utf8');

const retiredFiles = [
  'assets/power/blu_power_module.riv',
  'public/rive/blu_power_module.riv',
  'components/dashboard/BluPowerModuleFallback.tsx',
  'components/dashboard/BluPowerModuleRive.tsx',
  'components/dashboard/BluPowerModuleRive.native.tsx',
  'components/dashboard/PowerModuleRiveWidget.tsx',
  'components/dashboard/PowerModuleRiveWidget.native.tsx',
  'lib/bluPowerModuleRive.ts',
  'lib/powerModuleRiveTelemetry.ts',
];

for (const file of retiredFiles) {
  assert.strictEqual(fs.existsSync(path.join(root, file)), false, `${file} should remain retired.`);
}

for (const dependency of ['@rive-app/react-native', '@rive-app/react-webgl2', 'react-native-nitro-modules']) {
  assert.strictEqual(packageJson.dependencies?.[dependency], undefined, `${dependency} should not remain in the production dependency graph.`);
}

assert.ok(
  !metroSource.includes("'riv'") && !metroSource.includes('"riv"'),
  'Metro should not register the retired Rive asset extension.',
);
assert.ok(
  powerWidgetSource.includes('function PowerMonitorTelemetryPanel') &&
    powerWidgetSource.includes("testID={compact ? 'power-monitor-telemetry-panel-compact' : 'power-monitor-telemetry-panel'}"),
  'Power Monitor should retain its native telemetry presentation after Rive retirement.',
);
assert.ok(!powerWidgetSource.includes('Rive'), 'Power Monitor should not retain a Rive runtime path.');

console.log('Power module Rive retirement checks passed.');
