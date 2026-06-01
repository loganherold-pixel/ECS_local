const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  ECOFLOW_BLU_TELEMETRY_PRODUCT_TYPE,
  ECOFLOW_CLOUD_TELEMETRY_PRODUCT_TYPES,
  describeEcoFlowBluEligibility,
  normalizeEcoFlowTelemetryProductType,
  isEcoFlowCloudTelemetryProductType,
  isEcoFlowBluTelemetryCapable,
} = loadTypeScriptModule('lib/ecoflowBluTelemetryEligibility.ts');

assert.strictEqual(ECOFLOW_BLU_TELEMETRY_PRODUCT_TYPE, 'power_station');
assert.deepStrictEqual(ECOFLOW_CLOUD_TELEMETRY_PRODUCT_TYPES, [
  'power_station',
  'refrigerator',
  'portable_ac',
  'charger',
]);
assert.strictEqual(
  isEcoFlowBluTelemetryCapable({
    deviceId: 'delta3',
    deviceName: 'DELTA 3 1500',
    productType: 'power_station',
  }),
  true,
  'EcoFlow power stations should be eligible for BLU telemetry.',
);
assert.strictEqual(
  isEcoFlowBluTelemetryCapable({
    deviceId: 'glacier',
    deviceName: 'GLACIER refrigerator',
    productType: 'refrigerator',
  }),
  true,
  'EcoFlow Glacier refrigerators should be eligible for cloud/API telemetry.',
);
assert.strictEqual(isEcoFlowCloudTelemetryProductType('refrigerator'), true);
assert.strictEqual(isEcoFlowCloudTelemetryProductType('portable_ac'), true);
assert.strictEqual(isEcoFlowCloudTelemetryProductType('charger'), true);

assert.strictEqual(normalizeEcoFlowTelemetryProductType('Power Station'), 'power_station');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('Portable Power Station'), 'power_station');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('', 'EcoFlow DELTA 2 Max'), 'power_station');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('', 'Delta 3-1500-5055'), 'power_station');
assert.strictEqual(normalizeEcoFlowTelemetryProductType(null, 'RIVER 2 Pro'), 'power_station');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('', 'EcoFlow GLACIER'), 'refrigerator');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('Portable AC', 'WAVE 2'), 'portable_ac');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('DC DC Charger'), 'charger');
assert.strictEqual(normalizeEcoFlowTelemetryProductType('', 'EcoFlow 800W Alternator Charger'), 'charger');

for (const candidate of [
  { deviceId: 'delta2-space', deviceName: 'DELTA 2', productType: 'Power Station' },
  { deviceId: 'delta2-name', deviceName: 'EcoFlow DELTA 2 Max', productType: '' },
  { deviceId: 'river-name', deviceName: 'RIVER 2 Pro', productType: 'unknown' },
]) {
  assert.strictEqual(
    isEcoFlowBluTelemetryCapable(candidate),
    true,
    `${candidate.deviceName} should be eligible even when EcoFlow catalog productType is loose.`,
  );
}

for (const productType of ['solar_tracker', 'unknown', '', null]) {
  const eligibility = describeEcoFlowBluEligibility({
    deviceId: `device-${productType ?? 'null'}`,
    deviceName: String(productType ?? 'missing'),
    productType,
  });
  assert.strictEqual(
    eligibility.telemetryCapable,
    false,
    `${productType} must not be eligible for BLU telemetry.`,
  );
  assert.notStrictEqual(
    eligibility.reason,
    'telemetry_supported',
    `${productType} must not be classified as telemetry-supported.`,
  );
}

assert.strictEqual(
  describeEcoFlowBluEligibility(
    { deviceId: 'delta-mini', productType: 'power_station' },
    true,
  ).reason,
  'unauthorized',
  'Unauthorized power stations should be separated from supported devices.',
);

const bluAdapterSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'EcoFlowBluAdapter.ts'),
  'utf8',
);
const cloudProviderSource = fs.readFileSync(
  path.join(process.cwd(), 'src', 'power', 'cloud', 'providers', 'EcoFlowCloudProvider.ts'),
  'utf8',
);
const bluTypesSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'BluTypes.ts'),
  'utf8',
);

assert(
  bluAdapterSource.includes('getSelectableTelemetryRawDevices(rawDevices)'),
  'BLU adapter should separate listed EcoFlow devices from selectable telemetry devices.',
);
assert(
  bluAdapterSource.includes("await bluDeviceRegistry.clearProvider('ecoflow');"),
  'BLU adapter should clear stale EcoFlow registry entries before registering eligible devices.',
);
assert(
  bluAdapterSource.includes("product_type: device.product_type") &&
    bluAdapterSource.includes("telemetry_capable: device.telemetry_capable"),
  'BLU registry entries should carry product type and telemetry eligibility.',
);
assert(
  bluAdapterSource.includes('this.isBluTelemetryDevice(device)'),
  'Fallback and primary selection should use the BLU telemetry eligibility guard.',
);
assert(
  bluAdapterSource.includes('no eligible telemetry device available'),
  'BLU adapter should expose a safe no-eligible-device state.',
);
assert(
  !bluAdapterSource.includes('Fallback EcoFlow primary selected after unauthorized device'),
  'BLU adapter should not use the old broad fallback-primary log/path.',
);
assert(
  !bluAdapterSource.includes('selectFallbackPrimaryDevice'),
  'BLU adapter should not auto-fallback to another primary after an unauthorized EcoFlow poll.',
);
assert(
  bluAdapterSource.includes('commitEcoFlowPrimary') &&
    bluAdapterSource.includes("provider: 'ecoflow'") &&
    bluAdapterSource.includes('pollingTargetDeviceId'),
  'EcoFlow primary selection should update registry, session provider, and polling target transactionally.',
);
assert(
  bluAdapterSource.includes('recordProviderDegraded') &&
    bluAdapterSource.includes('no_eligible_ecoflow_telemetry_device'),
  'EcoFlow no-eligible state should persist a provider-scoped degraded session reason.',
);

assert(
  cloudProviderSource.includes('listedDeviceCatalog') &&
    cloudProviderSource.includes('describeEcoFlowBluEligibility'),
  'EcoFlow cloud provider should filter telemetry devices using catalog productType.',
);
assert(
  cloudProviderSource.includes('import { ecsLog } from "../../../../lib/ecsLogger";') &&
    cloudProviderSource.includes('function logEcoFlowDebug') &&
    cloudProviderSource.includes('debugFlag: "ECS_DEBUG_ECOFLOW_CLOUD"') &&
    cloudProviderSource.includes('function logEcoFlowWarn') &&
    cloudProviderSource.includes('function logEcoFlowUnauthorizedDeviceWarnOnce') &&
    cloudProviderSource.includes('const ecoFlowUnauthorizedWarningKeys = new Set<string>();'),
  'EcoFlow cloud provider diagnostics should route through ecsLog with an explicit debug flag.',
);
assert(
  cloudProviderSource.includes('logEcoFlowUnauthorizedDeviceWarnOnce(deviceId, error)') &&
    !cloudProviderSource.includes('logEcoFlowWarn("filtered EcoFlow device: unauthorized for cloud telemetry"'),
  'Repeated unauthorized EcoFlow cloud telemetry warnings should be deduped across provider instances.',
);
assert(
  !cloudProviderSource.includes('console.log(') &&
    !cloudProviderSource.includes('console.warn(') &&
    !cloudProviderSource.includes('console.error('),
  'EcoFlow cloud provider must not emit direct production console output.',
);
assert(
  cloudProviderSource.includes('unsupported_product_type') &&
    cloudProviderSource.includes('selected telemetry primary'),
  'EcoFlow cloud logs should distinguish unsupported product types from selected telemetry devices.',
);
assert(
  bluTypesSource.includes('product_type?: string;') &&
    bluTypesSource.includes('telemetry_capable?: boolean;'),
  'BluDevice should retain product type and telemetry eligibility metadata.',
);

console.log('EcoFlow BLU telemetry eligibility checks passed.');
