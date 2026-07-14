const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components', 'dashboard', 'PowerSystemWidget.tsx'), 'utf8');

[
  'export function normalizePowerTelemetrySummary',
  'normalizePowerTelemetryTruth',
  'resolveTelemetrySourceState',
  'sourceTruthLabel',
  'isTelemetryLive',
  'isStale',
].forEach((fragment) => {
  assert.ok(source.includes(fragment), `Current Power Monitor telemetry normalization should retain ${fragment}.`);
});

assert.ok(!source.includes('adaptPowerTelemetryForRive'), 'Telemetry normalization should not route through a retired Rive adapter.');
assert.ok(!source.includes('PowerModuleRiveWidget'), 'Telemetry normalization should remain independent of the retired Rive widget.');

console.log('Power module native telemetry normalization checks passed.');
