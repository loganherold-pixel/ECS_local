const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const start = widgetRenderers.indexOf('const VehicleSystemsWidget');
const end = widgetRenderers.indexOf('}, areVehicleSystemsWidgetPropsEqual);', start);
assert(start >= 0 && end > start, 'VehicleSystemsWidget must be discoverable');

const vehicleSystemsWidget = widgetRenderers.slice(start, end);

assert(!widgetRenderers.includes('Using profile context'), 'Vehicle Systems must not render "Using profile context"');
assert(!vehicleSystemsWidget.includes('SYSTEM STATE'), 'Vehicle Systems main panel must not be labeled System State');
assert(vehicleSystemsWidget.includes("const systemsPrimaryLabel = 'VEHICLE READINESS'"), 'Vehicle Systems must use a useful Vehicle Readiness panel');
assert(vehicleSystemsWidget.includes('const telemetrySnapshot = vt.snapshot'), 'Vehicle Systems must consume the normalized telemetry snapshot');
assert(vehicleSystemsWidget.includes('const hasLiveTelemetry = telemetrySnapshot.isLive'), 'Vehicle Systems must treat snapshot.isLive as the live source gate');
assert(vehicleSystemsWidget.includes("telemetrySnapshot.source === 'cache'"), 'Vehicle Systems must detect cached telemetry as last-known data');

assert(vehicleSystemsWidget.includes('Active telemetry'), 'Vehicle Systems must label active live telemetry');
assert(vehicleSystemsWidget.includes('Last known telemetry'), 'Vehicle Systems must label cached/last-known telemetry');
assert(vehicleSystemsWidget.includes('Manual data entered'), 'Vehicle Systems must label manual/profile data truthfully');

assert(
  vehicleSystemsWidget.includes('const currentFuelPercent = showLiveData') &&
    vehicleSystemsWidget.includes('? liveFuelPct') &&
    vehicleSystemsWidget.includes(': consumables.fuel_percent_current ?? fuel_percent_current'),
  'Vehicle Systems fuel resolution must use live/cache telemetry before manual fuel data',
);
assert(
  !vehicleSystemsWidget.includes(": 'PROFILE'") &&
    !vehicleSystemsWidget.includes("{currentFuelPercent != null ? `${Math.round(currentFuelPercent)}%` : 'PROFILE'}"),
  'Vehicle Systems visible compact values must not fall back to PROFILE labels',
);
assert(
  vehicleSystemsWidget.includes("value: showLiveData ? engineInfo.label : systemsHasFallbackContext ? 'MANUAL' : '--'"),
  'Vehicle Systems engine tile must label manual fallback as MANUAL',
);

console.log('Vehicle Systems source label checks passed.');
