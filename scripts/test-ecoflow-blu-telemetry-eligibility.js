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
  describeEcoFlowBluEligibility,
  isEcoFlowBluTelemetryCapable,
} = loadTypeScriptModule('lib/ecoflowBluTelemetryEligibility.ts');

assert.strictEqual(ECOFLOW_BLU_TELEMETRY_PRODUCT_TYPE, 'power_station');
assert.strictEqual(
  isEcoFlowBluTelemetryCapable({
    deviceId: 'delta3',
    deviceName: 'DELTA 3 1500',
    productType: 'power_station',
  }),
  true,
  'EcoFlow power stations should be eligible for BLU telemetry.',
);

for (const productType of ['refrigerator', 'charger', 'portable_ac', 'unknown', '', null]) {
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
