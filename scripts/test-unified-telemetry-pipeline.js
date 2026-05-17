const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const store = read('src/telemetry/ECSTelemetryStore.ts');
const types = read('src/telemetry/ECSTelemetryTypes.ts');
const adapters = read('src/telemetry/telemetryAdapters.ts');
const bluStore = read('lib/BluStateStore.ts');
const powerManager = read('src/power/telemetry/PowerTelemetryManager.ts');
const vehicleStore = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
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

has(types, "'power_device' | 'obd2'", 'telemetry source type');
has(types, "'live'", 'telemetry quality');
has(types, "'stale'", 'telemetry quality');
has(types, "'unavailable'", 'telemetry quality');

has(store, 'ingestEvent(event: ECSTelemetryEvent)', 'unified telemetry store');
has(store, 'ingestEvents(events: ECSTelemetryEvent[])', 'unified telemetry store');
has(store, 'markDeviceUnavailable(', 'unified telemetry store disconnect handling');
has(store, 'quality: staleQuality', 'unified telemetry store stale transition');
has(store, 'getPowerDeviceReadings()', 'unified telemetry power selector');
has(store, 'shouldRejectProductionMock', 'unified telemetry store mock guard');
has(store, 'shouldKeepExistingMetric', 'unified telemetry cloud error protection');
has(store, "existing.transport === 'ble'", 'unified telemetry cloud error protection');
has(store, "next.transport === 'cloud'", 'unified telemetry cloud error protection');
has(store, "next.quality !== 'live'", 'unified telemetry cloud error protection');

has(adapters, 'bluTelemetryToEcsTelemetryEvents', 'BLU power adapter bridge');
has(adapters, 'canonicalPowerTelemetryToEcsTelemetryEvents', 'canonical power adapter bridge');
has(adapters, 'vehicleTelemetryToEcsTelemetryEvents', 'OBD2 adapter bridge');
has(adapters, "sourceType: 'power_device'", 'power adapter bridge');
has(adapters, "sourceType: 'obd2'", 'OBD2 adapter bridge');
has(adapters, "case 'provider_cloud':", 'cloud power transport mapping');
has(adapters, "return 'cloud';", 'cloud power transport mapping');
has(adapters, "case 'ble_live':", 'BLE power transport mapping');
has(adapters, "return 'ble';", 'BLE power transport mapping');

has(bluStore, "import { ecsTelemetryStore } from '../src/telemetry/ECSTelemetryStore';", 'BLU store bridge');
has(bluStore, "bluTelemetryToEcsTelemetryEvents", 'BLU store bridge');
has(bluStore, 'ecsTelemetryStore.ingestEvents(bluTelemetryToEcsTelemetryEvents(enrichedTelemetry))', 'power-device telemetry reaches unified store');
has(bluStore, "ecsTelemetryStore.markDeviceUnavailable(deviceId, 'power_device'", 'power disconnect clears unified live state');

has(powerManager, 'canonicalPowerTelemetryToEcsTelemetryEvents', 'power manager bridge');
has(powerManager, 'ecsTelemetryStore.ingestEvents(canonicalPowerTelemetryToEcsTelemetryEvents(this.current))', 'canonical power telemetry reaches unified store');
has(powerManager, "ecsTelemetryStore.markDeviceUnavailable(clearedDeviceId, 'power_device'", 'canonical power disconnect clears unified live state');

has(vehicleStore, 'vehicleTelemetryToEcsTelemetryEvents', 'vehicle store bridge');
has(vehicleStore, 'ecsTelemetryStore.ingestEvents(vehicleTelemetryToEcsTelemetryEvents(telemetry))', 'OBD2 telemetry reaches unified store');
has(vehicleStore, "ecsTelemetryStore.markDeviceUnavailable(this.latestTelemetry.device_id, 'obd2'", 'OBD2 disconnect clears unified live state');

has(powerWidget, "import { useECSPowerTelemetryReadings } from '../../src/telemetry/useECSTelemetry';", 'power widget normalized subscription');
assert(!powerWidget.includes("from '../../lib/BluStateStore'"), 'Power widget must not import BluStateStore directly.');
assert(!powerWidget.includes("from '../../lib/BluDeviceRegistry'"), 'Power widget must not import BluDeviceRegistry directly.');
assert(!powerWidget.includes("from '../../lib/BluPowerAuthority'"), 'Power widget must not import BluPowerAuthority directly.');
has(powerWidget, 'const telemetryReadings = useECSPowerTelemetryReadings();', 'power widget reads normalized telemetry store');

assert(
  !/cloud_auth[^]*markDeviceUnavailable/.test(adapters + store + bluStore + powerManager),
  'Cloud auth errors must not clear BLE telemetry through the unified store.',
);

console.log('Unified telemetry pipeline checks passed.');
