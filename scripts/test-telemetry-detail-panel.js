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

const widget = read('components/dashboard/VehicleTelemetryWidget.tsx');
const renderers = read('components/dashboard/WidgetRenderers.tsx');
const detailModal = read('components/dashboard/WidgetDetailModal.tsx');

assert(widget.includes('export function VehicleTelemetryDetailView({ onClose }'), 'telemetry detail panel must accept an explicit close action from the host modal');
assert(widget.includes('OBD2ScannerModal'), 'telemetry detail panel must reuse the existing OBD2 scanner modal for Scan / Connect');
assert(widget.includes('getTelemetryDetailSourceLabel'), 'telemetry detail panel must centralize user-facing source labels');

for (const label of [
  'OBD Live',
  'BLE Live',
  'Device Attitude',
  'Manual Profile',
  'Cached',
  'Simulation',
  'Unavailable',
]) {
  assert(widget.includes(label), `telemetry detail panel must render source label ${label}`);
}

for (const action of [
  'Scan / Connect',
  'Reconnect',
  'Use Manual Profile Only',
  'Disable Telemetry',
  'Close',
]) {
  assert(widget.includes(`label="${action}"`), `telemetry detail panel must expose ${action} action`);
}

assert(widget.includes("scanner.sourceStatus === 'permission_required'"), 'telemetry detail panel must show a compact permission-required state');
assert(widget.includes('VEHICLE_TELEMETRY_FIELDS'), 'telemetry detail panel must list available and missing telemetry fields');
assert(widget.includes('FIELD AVAILABILITY'), 'telemetry detail panel must expose field availability');
assert(widget.includes('field.available ? styles.fieldTileAvailable : styles.fieldTileMissing'), 'missing telemetry fields must render as missing, not crash or fake values');
assert(widget.includes("vt.lastUpdatedText ? `Updated ${vt.lastUpdatedText}` : 'No live source.'"), 'telemetry detail panel must show last update or No live source');
assert(widget.includes('await scanner.stopScan') && widget.includes('await vt.disconnectProvider()'), 'Disable Telemetry must stop scanning and disconnect the provider');
assert(widget.includes('await scanner.attemptReconnect()'), 'Reconnect action must call the controlled reconnect path');
assert(widget.includes('await vt.disconnectProvider()') && widget.includes('Manual Profile'), 'Manual profile only must disable live provider truthfully');
assert(widget.includes('disabled={!canReconnect}'), 'Reconnect must be disabled when no saved adapter exists');
assert(widget.includes('disabled={!canDisableTelemetry}'), 'Disable/manual actions must be disabled when no telemetry source exists');

assert(renderers.includes('onCloseDetail?: () => void'), 'widget render options must expose modal close to detail panels');
assert(renderers.includes('<VehicleTelemetryDetailView onClose={options?.onCloseDetail} />'), 'vehicle telemetry detail renderer must pass onClose through');
assert(detailModal.includes('onCloseDetail: onClose'), 'widget detail modal must supply its close action to rendered detail panels');

console.log('Telemetry detail panel checks passed.');
