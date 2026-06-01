const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const store = read('src/telemetry/ECSTelemetryStore.ts');
const types = read('src/telemetry/ECSTelemetryTypes.ts');
const adapters = read('src/telemetry/telemetryAdapters.ts');
const utilitySelectors = read('src/telemetry/utilitySensorTelemetrySelectors.ts');
const bluStore = read('lib/BluStateStore.ts');
const powerManager = read('src/power/telemetry/PowerTelemetryManager.ts');
const vehicleStore = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
const accessoryManager = read('lib/genericBluetoothAccessoryManager.ts');
const powerWidget = read('components/dashboard/PowerSystemWidget.tsx');

function has(content, needle, label) {
  assert(
    content.includes(needle),
    `${label} must include ${needle}`,
  );
}

[
  'sourceDeviceId',
  "sourceType: ECSTelemetrySourceType",
  'provider',
  'metricKey',
  'value',
  'unit',
  'timestamp',
  'quality: ECSTelemetryQuality',
  'transport: ECSTelemetryTransport',
].forEach((field) => has(types, field, 'normalized telemetry event type'));

has(types, "'power_device' | 'obd2' | 'utility_sensor'", 'telemetry source type');
has(types, "'live'", 'telemetry quality');
has(types, "'stale'", 'telemetry quality');
has(types, "'unavailable'", 'telemetry quality');
has(types, 'ECSUtilitySensorTelemetryReading', 'utility sensor telemetry reading type');
has(types, 'inputVolts: number | null', 'power telemetry input voltage type');
has(types, 'inputAmps: number | null', 'power telemetry input current type');
has(types, 'outputVolts: number | null', 'power telemetry output voltage type');
has(types, 'outputAmps: number | null', 'power telemetry output current type');

has(store, 'ingestEvent(event: ECSTelemetryEvent)', 'unified telemetry store');
has(store, 'ingestEvents(events: ECSTelemetryEvent[])', 'unified telemetry store');
has(store, 'markDeviceUnavailable(', 'unified telemetry store disconnect handling');
has(store, 'quality: staleQuality', 'unified telemetry store stale transition');
has(store, 'getPowerDeviceReadings()', 'unified telemetry power selector');
has(store, "numericMetric(metrics, 'input_volts')", 'unified telemetry power selector input voltage');
has(store, "numericMetric(metrics, 'input_amps')", 'unified telemetry power selector input current');
has(store, "numericMetric(metrics, 'output_volts')", 'unified telemetry power selector output voltage');
has(store, "numericMetric(metrics, 'output_amps')", 'unified telemetry power selector output current');
has(store, 'getUtilitySensorReadings()', 'unified telemetry utility sensor selector');
has(utilitySelectors, 'selectUtilitySensorResourceStates', 'utility sensor resource selector');
has(utilitySelectors, 'getUtilitySensorCurrentFromCapacity', 'utility sensor capacity resolver');
has(utilitySelectors, 'formatUtilitySensorModeLabel', 'utility sensor source label resolver');
has(store, 'shouldRejectProductionMock', 'unified telemetry store mock guard');
has(store, 'shouldKeepExistingMetric', 'unified telemetry cloud error protection');
has(store, "existing.transport === 'ble'", 'unified telemetry cloud error protection');
has(store, "next.transport === 'cloud'", 'unified telemetry cloud error protection');
has(store, "next.quality !== 'live'", 'unified telemetry cloud error protection');

has(adapters, 'bluTelemetryToEcsTelemetryEvents', 'BLU power adapter bridge');
has(adapters, 'canonicalPowerTelemetryToEcsTelemetryEvents', 'canonical power adapter bridge');
has(adapters, 'vehicleTelemetryToEcsTelemetryEvents', 'OBD2 adapter bridge');
has(adapters, 'bluetoothAccessoryToEcsTelemetryEvents', 'utility sensor adapter bridge');
has(adapters, "sourceType: 'power_device'", 'power adapter bridge');
has(adapters, "sourceType: 'obd2'", 'OBD2 adapter bridge');
has(adapters, "sourceType: 'utility_sensor'", 'utility sensor adapter bridge');
has(adapters, "metricKey: 'parser_status'", 'utility sensor parser-pending state');
has(adapters, "metricKey: 'profile_id'", 'utility sensor profile identity');
has(adapters, "'level_percent'", 'utility sensor live level bridge');
has(accessoryManager, 'decodeUtilitySensorLiveTelemetry', 'utility sensor native BLE decoder bridge');
has(accessoryManager, 'readReadableCharacteristicSnapshots', 'utility sensor characteristic sampling');
has(adapters, 'identifyBluestackAccessorySensorProfile', 'utility sensor profile resolver');
has(adapters, "case 'provider_cloud':", 'cloud power transport mapping');
has(adapters, "return 'cloud';", 'cloud power transport mapping');
has(adapters, "case 'ble_live':", 'BLE power transport mapping');
has(adapters, "return 'ble';", 'BLE power transport mapping');
has(adapters, "'input_volts'", 'BLU/canonical power adapter input voltage bridge');
has(adapters, "'input_amps'", 'BLU/canonical power adapter input current bridge');
has(adapters, "'output_volts'", 'BLU/canonical power adapter output voltage bridge');
has(adapters, "'output_amps'", 'BLU/canonical power adapter output current bridge');

has(bluStore, "import { ecsTelemetryStore } from '../src/telemetry/ECSTelemetryStore';", 'BLU store bridge');
has(bluStore, "bluTelemetryToEcsTelemetryEvents", 'BLU store bridge');
has(bluStore, 'ecsTelemetryStore.ingestEvents(bluTelemetryToEcsTelemetryEvents(enrichedTelemetry))', 'power-device telemetry reaches unified store');
has(bluStore, 'clearDeviceTelemetry(', 'per-device power disconnect clears unified live state');
has(bluStore, 'ecsTelemetryStore.markDeviceUnavailable(', 'power disconnect clears unified live state');

has(powerManager, 'canonicalPowerTelemetryToEcsTelemetryEvents', 'power manager bridge');
has(powerManager, 'ecsTelemetryStore.ingestEvents(canonicalPowerTelemetryToEcsTelemetryEvents(merged))', 'canonical power telemetry reaches unified store');
has(powerManager, 'currentByDeviceId', 'canonical power telemetry is keyed per device');
has(powerManager, 'ecsTelemetryStore.markDeviceUnavailable(', 'canonical power disconnect clears unified live state');

has(vehicleStore, 'vehicleTelemetryToEcsTelemetryEvents', 'vehicle store bridge');
has(vehicleStore, 'ecsTelemetryStore.ingestEvents(vehicleTelemetryToEcsTelemetryEvents(telemetry))', 'OBD2 telemetry reaches unified store');
has(vehicleStore, "ecsTelemetryStore.markDeviceUnavailable(this.latestTelemetry.device_id, 'obd2'", 'OBD2 disconnect clears unified live state');

has(accessoryManager, 'bluetoothAccessoryToEcsTelemetryEvents', 'Bluetooth accessory manager utility sensor bridge');
has(accessoryManager, "ecsTelemetryStore.markDeviceUnavailable(record.deviceId, 'utility_sensor'", 'utility sensor disconnect clears unified state');

has(powerWidget, "import { useECSPowerTelemetryReadings } from '../../src/telemetry/useECSTelemetry';", 'power widget normalized subscription');
assert(!powerWidget.includes("from '../../lib/BluStateStore'"), 'Power widget must not import BluStateStore directly.');
assert(!powerWidget.includes("from '../../lib/BluDeviceRegistry'"), 'Power widget must not import BluDeviceRegistry directly.');
assert(!powerWidget.includes("from '../../lib/BluPowerAuthority'"), 'Power widget must not import BluPowerAuthority directly.');
has(powerWidget, 'const telemetryReadings = useECSPowerTelemetryReadings();', 'power widget reads normalized telemetry store');
has(powerWidget, 'deriveCurrentAmps', 'power widget derives current when only watts and volts are reported');
has(powerWidget, 'inputVolts: simulationBlocked ? null : resolvedInputVolts', 'power widget exposes normalized input voltage');
has(powerWidget, 'outputVolts: simulationBlocked ? null : resolvedOutputVolts', 'power widget exposes normalized output voltage');
has(read('components/dashboard/WidgetRenderers.tsx'), 'useECSUtilitySensorTelemetryReadings', 'resource widget reads normalized utility sensor telemetry');

assert(
  !/cloud_auth[^]*markDeviceUnavailable/.test(adapters + store + bluStore + powerManager),
  'Cloud auth errors must not clear BLE telemetry through the unified store.',
);

console.log('Unified telemetry pipeline checks passed.');
