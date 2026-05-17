const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertContains(source, pattern, message) {
  assert.ok(source.includes(pattern), message);
}

function assertNotContains(source, pattern, message) {
  assert.ok(!source.includes(pattern), message);
}

const requiredFiles = [
  'src/features/power/types/powerTypes.ts',
  'src/features/power/adapters/ecoflowAdapter.ts',
  'src/features/power/adapters/bluettiAdapter.ts',
  'src/features/power/adapters/ankerSolixAdapter.ts',
  'src/features/power/adapters/manualPowerAdapter.ts',
  'src/features/power/services/powerDiscoveryService.ts',
  'src/features/power/services/powerTelemetryService.ts',
  'src/features/power/services/powerTruthService.ts',
  'src/features/power/state/powerStore.ts',
  'src/features/power/components/PowerMonitorWidget.tsx',
  'src/features/power/components/PowerDetailModal.tsx',
  'src/features/power/components/PowerDeviceScanner.tsx',
];

for (const file of requiredFiles) {
  assert.ok(exists(file), `${file} should exist`);
}

const types = read('src/features/power/types/powerTypes.ts');
for (const field of [
  'batteryPercent?: number',
  'capacityWh?: number',
  'inputWatts?: number',
  'outputWatts?: number',
  'solarWatts?: number',
  'acOutputEnabled?: boolean',
  'dcOutputEnabled?: boolean',
  'usbOutputEnabled?: boolean',
  'temperatureC?: number',
  'estimatedRuntimeMinutes?: number',
  'truth: PowerTelemetryTruth',
]) {
  assertContains(types, field, `normalized PowerTelemetry should expose ${field}`);
}
assertContains(types, 'readTelemetry: (deviceId?: string) => Promise<PowerTelemetry | null>', 'adapter contract should expose normalized readTelemetry');
assertContains(types, 'getCapabilities: () => PowerAdapterCapabilities', 'adapter contract should expose capabilities');

for (const adapter of [
  'src/features/power/adapters/ecoflowAdapter.ts',
  'src/features/power/adapters/bluettiAdapter.ts',
  'src/features/power/adapters/ankerSolixAdapter.ts',
  'src/features/power/adapters/manualPowerAdapter.ts',
]) {
  const source = read(adapter);
  assertContains(source, 'readTelemetry:', `${adapter} should implement readTelemetry`);
  assertContains(source, 'getCapabilities:', `${adapter} should implement getCapabilities`);
}

const ecoflowAdapter = read('src/features/power/adapters/ecoflowAdapter.ts');
assertContains(ecoflowAdapter, 'EcoFlowCloudProvider', 'EcoFlow provider API should be isolated in the EcoFlow adapter');
assertContains(ecoflowAdapter, 'powerDeviceStore', 'EcoFlow device selection storage should be isolated in the EcoFlow adapter');

const bluettiAdapter = read('src/features/power/adapters/bluettiAdapter.ts');
const ankerAdapter = read('src/features/power/adapters/ankerSolixAdapter.ts');
assertContains(bluettiAdapter, 'supportsLiveTelemetry: false', 'BLUETTI should not claim validated live telemetry');
assertContains(ankerAdapter, 'supportsLiveTelemetry: false', 'Anker SOLIX should not claim validated live telemetry');

const telemetryService = read('src/features/power/services/powerTelemetryService.ts');
assertContains(telemetryService, 'useEcoFlowLive', 'legacy EcoFlow hook should be wrapped by feature service, not UI');
assertContains(telemetryService, 'useEcsProviders', 'provider registry hook should be wrapped by feature service, not Dashboard UI');

for (const uiFile of [
  'app/power/index.tsx',
  'app/power/devices.tsx',
  'components/dashboard/PowerSystemDetail.tsx',
]) {
  const source = read(uiFile);
  assertNotContains(source, 'EcoFlowCloudProvider', `${uiFile} should not instantiate or import EcoFlowCloudProvider`);
  assertNotContains(source, 'powerDeviceStore', `${uiFile} should not call powerDeviceStore directly`);
  assertNotContains(source, 'useEcoFlowLive', `${uiFile} should not call legacy provider hook directly`);
  assertNotContains(source, 'useEcsProviders', `${uiFile} should not call provider registry hook directly`);
}

const powerCenter = read('app/power/index.tsx');
assertContains(powerCenter, 'useEcoFlowPowerLive', 'Power Center should consume feature-level EcoFlow telemetry hook');
assertContains(powerCenter, 'getEcoFlowPowerDeviceCatalog', 'Power Center should load device catalog through feature service');
assertContains(powerCenter, 'setPrimaryEcoFlowPowerDevice', 'Power Center should persist primary device through feature service');

const devicePicker = read('app/power/devices.tsx');
assertContains(devicePicker, 'getEcoFlowPowerDeviceCatalog', 'Device picker should load catalog through feature service');
assertContains(devicePicker, 'setPrimaryEcoFlowPowerDevice', 'Device picker should persist selection through feature service');

const powerDetail = read('components/dashboard/PowerSystemDetail.tsx');
assertContains(powerDetail, 'usePowerTelemetryControls', 'Dashboard detail should refresh provider telemetry through feature service');

console.log('Power provider boundary checks passed.');

