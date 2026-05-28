const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const warnings = [];

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'node' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const originalWarn = console.warn;
console.warn = (...args) => {
  warnings.push(args);
  originalWarn(...args);
};

function loadTypeScriptModule(relativePath) {
  return require(path.join(root, relativePath));
}

function assertRejected(reason) {
  assert(
    warnings.some((entry) => entry.some((part) => {
      if (typeof part === 'string') return part.includes('Telemetry rejected') || part.includes(reason);
      return part && typeof part === 'object' && part.reason === reason;
    })),
    `Expected telemetry rejection reason: ${reason}`,
  );
}

async function reset(bluStateStore, bluDeviceRegistry) {
  warnings.length = 0;
  bluStateStore.reset();
  await bluDeviceRegistry.clearAll();
}

function telemetry(deviceId, overrides = {}) {
  return {
    timestamp: Date.now(),
    provider: 'ecoflow',
    device_id: deviceId,
    source: 'provider_cloud',
    isLive: false,
    battery_percent: 82,
    input_watts: 140,
    output_watts: 62,
    estimated_runtime_minutes: 580,
    ...overrides,
  };
}

async function registerDevice(bluDeviceRegistry, device) {
  await bluDeviceRegistry.registerDevice({
    provider: device.provider ?? 'ecoflow',
    device_id: device.deviceId,
    display_name: device.displayName ?? device.deviceId,
    model: device.model ?? device.displayName ?? device.deviceId,
    product_type: device.productType,
    telemetry_capable: device.telemetryCapable,
    connection_state: device.connectionState ?? 'connected',
    last_seen: Date.now(),
    capabilities: {
      hasBatteryPercent: true,
      hasInputWatts: true,
      hasOutputWatts: true,
      hasSolarInput: true,
      hasAcOutput: true,
      hasDcOutput: true,
      hasTemperature: true,
      hasRuntimeEstimate: true,
      controllable: false,
    },
  });
}

(async () => {
  const { bluStateStore } = loadTypeScriptModule('lib/BluStateStore.ts');
  const { bluDeviceRegistry } = loadTypeScriptModule('lib/BluDeviceRegistry.ts');

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'D361FAH4ZH9F5055',
    displayName: 'Unauthorized DELTA 3 1500',
    productType: 'power_station',
    telemetryCapable: true,
    connectionState: 'unsupported',
  });
  bluStateStore.ingestTelemetry(telemetry('D361FAH4ZH9F5055'));
  assert.strictEqual(bluStateStore.getSummary().available, false, 'unauthorized EcoFlow cloud telemetry must not update summary');
  assert.strictEqual(bluStateStore.getDeviceTelemetry('ecoflow', 'D361FAH4ZH9F5055'), undefined, 'unauthorized telemetry must not enter cache');
  assertRejected('unauthorized_cloud_telemetry');

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'GLACIER123',
    displayName: 'GLACIER refrigerator',
    productType: 'refrigerator',
    telemetryCapable: true,
  });
  bluStateStore.ingestTelemetry(telemetry('GLACIER123', {
    temperature_celsius: 1.5,
    output_watts: undefined,
    input_watts: undefined,
  }));
  assert.strictEqual(bluStateStore.getSummary().available, true, 'EcoFlow Glacier cloud telemetry should update summary when authorized');
  assert.strictEqual(bluStateStore.getSummary().battery_percent, 82);

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'GLACIER_PARTIAL',
    displayName: 'GLACIER refrigerator partial telemetry',
    productType: 'refrigerator',
    telemetryCapable: true,
  });
  bluStateStore.ingestEcoFlowData({
    deviceId: 'GLACIER_PARTIAL',
    deviceName: 'GLACIER refrigerator partial telemetry',
    batteryPct: 100,
    solarWatts: null,
    inputWatts: 128,
    outputWatts: null,
    estimatedRuntimeMinutes: null,
    capacityWh: null,
    status: 'cloud_available',
  });
  const glacierPartialSummary = bluStateStore.getSummary();
  const glacierPartialTelemetry = bluStateStore.getDeviceTelemetry('ecoflow', 'GLACIER_PARTIAL');
  assert.strictEqual(glacierPartialSummary.available, true, 'partial EcoFlow cloud telemetry should still make power available');
  assert.strictEqual(glacierPartialSummary.isLive, true, 'partial EcoFlow cloud telemetry should be live when values are decoded');
  assert.strictEqual(glacierPartialSummary.live_input, 128);
  assert.strictEqual(glacierPartialSummary.battery_percent, 100);
  assert.strictEqual(glacierPartialSummary.battery_watts, 128, 'net battery watts should use known partial flow values');
  assert.strictEqual(glacierPartialTelemetry?.isLive, true);
  assert.strictEqual(glacierPartialTelemetry?.source, 'provider_cloud');

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'CHARGER123',
    displayName: 'EcoFlow alternator charger',
    productType: 'charger',
    telemetryCapable: true,
  });
  bluStateStore.ingestTelemetry(telemetry('CHARGER123', {
    battery_percent: undefined,
    input_watts: undefined,
    output_watts: undefined,
    status_text: 'Charging source available',
  }));
  assert.strictEqual(bluStateStore.getSummary().available, true, 'EcoFlow charger cloud telemetry should not be rejected when authorized');

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'SOLAR_TRACKER123',
    displayName: 'EcoFlow unsupported accessory',
    productType: 'solar_tracker',
    telemetryCapable: false,
  });
  bluStateStore.ingestTelemetry(telemetry('SOLAR_TRACKER123'));
  assert.strictEqual(bluStateStore.getSummary().available, false, 'known unsupported productType must not update summary');
  assertRejected('unsupported_product_type');

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'USER_RENAMED_DELTA',
    displayName: 'Camp Power',
    productType: 'unknown',
    telemetryCapable: true,
  });
  bluStateStore.ingestTelemetry(telemetry('USER_RENAMED_DELTA'));
  assert.strictEqual(
    bluStateStore.getSummary().available,
    true,
    'EcoFlow cloud telemetry from unknown catalog types should be accepted after a successful quota decode',
  );
  assert.strictEqual(bluStateStore.getSummary().battery_percent, 82);

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'DELTA_PRIMARY',
    displayName: 'DELTA Primary',
    productType: 'power_station',
    telemetryCapable: true,
  });
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'DELTA_SECONDARY',
    displayName: 'DELTA Secondary',
    productType: 'power_station',
    telemetryCapable: true,
  });
  bluStateStore.ingestTelemetry(telemetry('DELTA_SECONDARY'));
  assert.strictEqual(bluStateStore.getDeviceTelemetry('ecoflow', 'DELTA_SECONDARY')?.battery_percent, 82, 'non-primary telemetry must remain cached per device');
  assert.strictEqual(bluStateStore.getSummary().available, true, 'non-primary telemetry may populate summary when the primary has no packet yet');
  assert.strictEqual(bluStateStore.getSummary().active_device_name, 'DELTA Secondary');

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    deviceId: 'DELTA_PRIMARY',
    displayName: 'DELTA Primary',
    productType: 'power_station',
    telemetryCapable: true,
  });
  bluStateStore.ingestTelemetry(telemetry('DELTA_PRIMARY'));
  assert.strictEqual(bluStateStore.getSummary().available, true, 'current authorized primary telemetry must update summary');
  assert.strictEqual(bluStateStore.getSummary().battery_percent, 82);
  assert.strictEqual(bluStateStore.getSummary().live_input, 140);

  await reset(bluStateStore, bluDeviceRegistry);
  await registerDevice(bluDeviceRegistry, {
    provider: 'bluetti',
    deviceId: 'BLE_PRIMARY',
    displayName: 'Local BLE Station',
    productType: undefined,
    telemetryCapable: undefined,
  });
  bluStateStore.ingestTelemetry(telemetry('BLE_PRIMARY', {
    provider: 'bluetti',
    source: 'ble_live',
    isLive: true,
  }));
  assert.strictEqual(bluStateStore.getSummary().available, true, 'local BLE telemetry should still be accepted for its current primary');
  assert.strictEqual(bluStateStore.getSummary().active_provider, 'bluetti');

  console.warn = originalWarn;
  console.log('BLU state store telemetry guard checks passed.');
})().catch((error) => {
  console.warn = originalWarn;
  console.error(error);
  process.exit(1);
});
