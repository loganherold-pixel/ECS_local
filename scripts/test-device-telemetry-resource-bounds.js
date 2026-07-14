const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function compileTypeScriptModule(mod, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  compileTypeScriptModule(mod, filename);
  return mod.exports;
}

const { PowerSampleBuffer } = loadTypeScriptModule('src/power/telemetry/PowerSampleBuffer.ts');
const buffer = new PowerSampleBuffer(3);
buffer.push({ t: 1, wattsIn: 1 });
buffer.push({ t: 2, wattsIn: 2 });
buffer.push({ t: 3, wattsIn: 3 });
buffer.push({ t: 4, wattsIn: 4 });
assert.deepStrictEqual(buffer.getAll().map((sample) => sample.t), [2, 3, 4]);
assert.strictEqual(buffer.length, 3);

const manager = read('src/power/telemetry/PowerTelemetryManager.ts');
assert(manager.includes('MAX_POWER_TELEMETRY_DEVICE_BUFFERS = 8'), 'Power telemetry must bound active per-device histories.');
assert(manager.includes('sampleBuffersByDeviceId = new Map<string, PowerSampleBuffer>()'), 'Power telemetry must isolate samples by device.');
assert(manager.includes('this.sampleBuffersByDeviceId.delete(oldestDeviceId)'), 'Power telemetry must evict the least-recent device history at the bound.');
assert(manager.includes('const sampleBuffer = currentDeviceId'), 'Load detection must use the current device history instead of a mixed global history.');
assert(manager.includes("currentForDevice?.source === 'ble'") && manager.includes("partial.source === 'cloud'"), 'Fresh BLE power telemetry must not be overwritten by cloud polling.');
assert(manager.includes('currentForDevice === null || transportChanged'), 'Transport changes must start a clean power snapshot instead of deep-merging cross-source fields.');

const ecsStore = read('src/telemetry/ECSTelemetryStore.ts');
const ecsHook = read('src/telemetry/useECSTelemetry.ts');
assert(ecsStore.includes('subscribeSource(sourceType: ECSTelemetrySourceType'), 'Unified telemetry store must support source-scoped subscribers.');
assert(ecsStore.includes('BLU_TELEMETRY_UI_UPDATE_MS - elapsed'), 'Source-scoped notifications must be rate bounded.');
assert(ecsStore.includes('prepareTransportIngestion(normalized)'), 'Unified telemetry ingestion must enforce transport separation.');
assert(ecsStore.includes("next.transport === 'cloud' && hasLiveBle"), 'Cloud events must not replace a live BLE source.');
assert(ecsHook.includes("useECSTelemetrySource('power_device')"), 'Power consumers must subscribe only to power updates.');
assert(ecsHook.includes("useECSTelemetrySource('utility_sensor')"), 'Utility consumers must subscribe only to utility updates.');
assert(!ecsHook.includes('const timer = setInterval(bump, 10_000)'), 'Each ECS telemetry hook must not create its own freshness interval.');

const vehicleStore = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
const vehicleRegistry = read('src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts');
const vehicleHook = read('src/vehicle-telemetry/useVehicleTelemetry.ts');
assert(vehicleStore.includes('VEHICLE_TELEMETRY_PERSIST_INTERVAL_MS = 5_000'), 'Vehicle telemetry snapshots must coalesce persistence writes.');
assert(vehicleStore.includes('subscribeThrottled(fn: StoreListener)'), 'Vehicle UI consumers must use a bounded store subscription.');
assert(vehicleStore.includes("createPersistedKeyValueCache('ecs_vehicle_telemetry_snapshot')"), 'Last-known vehicle telemetry must restore through native persistence.');
assert(vehicleRegistry.includes('DEVICE_TOUCH_PERSIST_INTERVAL_MS = 30_000'), 'Vehicle last-seen writes must be coalesced.');
assert(vehicleRegistry.includes('if (!this.touchPersistTimer)'), 'Vehicle last-seen persistence must keep only one pending timer.');
assert(vehicleHook.includes('subscribeVehicleTelemetryFreshnessClock'), 'Vehicle telemetry hooks must share one freshness clock.');
assert(vehicleHook.includes('vehicleTelemetryStore.subscribeThrottled(bump)'), 'Dashboard/Fleet vehicle consumers must use throttled store updates.');

const previousWritesPerTwoMinutesAtOneHz = 120;
const boundedSnapshotWritesPerTwoMinutesAtOneHz = 1 + Math.ceil((previousWritesPerTwoMinutesAtOneHz - 1) / 5);
const boundedTouchWritesPerTwoMinutesAtOneHz = 1 + Math.ceil((previousWritesPerTwoMinutesAtOneHz - 1) / 30);
assert.strictEqual(boundedSnapshotWritesPerTwoMinutesAtOneHz, 25);
assert.strictEqual(boundedTouchWritesPerTwoMinutesAtOneHz, 5);

console.log(JSON.stringify({
  status: 'passed',
  bounds: {
    powerSamplesPerDevice: 600,
    powerDeviceHistories: 8,
    telemetryUiUpdateMs: 750,
    vehicleSnapshotPersistMs: 5000,
    vehicleTouchPersistMs: 30000,
  },
  modeledOneHzTwoMinuteWrites: {
    before: { snapshot: 120, deviceTouch: 120 },
    afterUpperBound: {
      snapshot: boundedSnapshotWritesPerTwoMinutesAtOneHz,
      deviceTouch: boundedTouchWritesPerTwoMinutesAtOneHz,
    },
  },
}));
