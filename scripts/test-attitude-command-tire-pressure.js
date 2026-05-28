const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const overlay = read('src/components/attitudeCommand/TirePressureDrivelineOverlay.tsx');
const thresholds = read('lib/tirePressureThresholdStore.ts');
const renderers = read('components/dashboard/WidgetRenderers.tsx');
const centralTypes = read('src/types/telemetry.ts');
const vehicleTypes = read('src/vehicle-telemetry/VehicleTelemetryTypes.ts');
const vehicleStore = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
const vehicleService = read('src/vehicle-telemetry/VehicleTelemetryService.ts');
const bridge = read('src/vehicle-telemetry/VehicleTelemetryAdapterBridge.ts');
const telemetryAdapters = read('src/telemetry/telemetryAdapters.ts');

function has(source, needle, label) {
  assert(source.includes(needle), `${label} must include ${needle}`);
}

has(centralTypes, 'tirePressuresPsi?', 'VehicleTelemetrySnapshot');
has(vehicleTypes, 'tirePressuresPsi: null', 'Empty vehicle telemetry snapshot');
has(vehicleStore, 'normalizeTireTelemetryValues', 'Vehicle telemetry store');
has(vehicleStore, "decoded.push('tirePressuresPsi')", 'Vehicle telemetry store decoded field list');
has(vehicleStore, 'tirePressuresPsi?.join', 'Vehicle telemetry snapshot signature');
has(vehicleStore, 'tirePressuresPsi,', 'Vehicle telemetry snapshot builder');

has(vehicleService, 'raw?.tirePressures', 'Vehicle telemetry service should accept raw tire pressure arrays');
has(vehicleService, 'raw?.tpms?.pressures', 'Vehicle telemetry service should accept TPMS pressure arrays');
has(bridge, 'raw?.tirePressurePsi', 'Vehicle telemetry adapter bridge should normalize tire pressure arrays');
has(bridge, "readPath(raw, 'tpms.pressures')", 'Vehicle telemetry adapter bridge should accept nested TPMS data');
has(telemetryAdapters, "`tire_pressure_${index + 1}`", 'Unified telemetry adapter should emit tire pressure metrics');

has(thresholds, 'DEFAULT_TIRE_PRESSURE_THRESHOLDS', 'Tire pressure threshold store');
has(thresholds, 'saveTirePressureThreshold(', 'Tire pressure threshold store');
has(thresholds, 'ecs_tire_pressure_thresholds_v1', 'Tire pressure threshold store persistence');

has(overlay, 'resolveLiveTirePressureDisplayState', 'Tire pressure overlay');
has(overlay, "require('../../../assets/attitude/overlays/vehicle_psi_driveline_suspension_transparent.png')", 'Tire pressure overlay real driveline image');
has(overlay, 'TIRE_PRESSURE_DRIVELINE_ASPECT_RATIO = 1448 / 1086', 'Tire pressure overlay real image aspect ratio');
has(overlay, 'const resolvedDiagramSource = diagramSource === null', 'Tire pressure overlay should use the PNG by default while keeping fallback override available');
has(overlay, 'snapshot.isLive', 'Tire pressure overlay live gate');
has(overlay, "snapshot.freshness !== 'live'", 'Tire pressure overlay freshness gate');
has(overlay, 'snapshot.tirePressuresPsi', 'Tire pressure overlay data source');
has(overlay, 'TirePressureDrivelineFallback', 'Tire pressure overlay should render a fallback schematic until the PNG is available');
has(overlay, 'testID="attitude-command-tire-pressure-button"', 'Tire pressure overlay button');
has(overlay, 'testID="attitude-command-tire-pressure-panel"', 'Tire pressure overlay edit panel');
has(overlay, 'keyboardType="numeric"', 'Tire pressure threshold inputs');
has(overlay, 'Low threshold is per tire', 'Tire pressure threshold helper copy');

has(renderers, 'resolveLiveTirePressureDisplayState(vehicleTelemetry.snapshot)', 'Dashboard attitude command should derive TPMS state from live vehicle telemetry');
has(renderers, 'tirePressureState={tirePressureState}', 'Dashboard attitude command should pass TPMS state into the command surface');
has(renderers, '<TirePressureDrivelineOverlay pressureState={tirePressureState} />', 'Dashboard attitude command should render the TPMS overlay only when live pressure exists');

console.log('Attitude Command tire pressure checks passed.');
