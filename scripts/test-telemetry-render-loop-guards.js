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

const store = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
assert(store.includes('buildVehicleTelemetrySnapshotSignature'), 'Vehicle telemetry store must build a stable snapshot signature');
assert(store.includes('private commitSnapshot'), 'Vehicle telemetry store must commit normalized snapshots through a memoized boundary');
assert(store.includes('this.snapshotSignature === nextSignature'), 'Telemetry snapshot commits should preserve object identity when values do not change');
assert(store.includes('return this.snapshot;'), 'Telemetry snapshot getter should return the memoized snapshot reference');
assert(!store.includes('return { ...this.snapshot };'), 'Telemetry snapshot getter must not create a new object every render');

const widget = read('components/dashboard/VehicleTelemetryWidget.tsx');
assert(widget.includes('useVehicleTelemetryBriefPublisher'), 'Vehicle telemetry Brief publishing should stay centralized in one hook');
assert(widget.includes('publishSignature'), 'Vehicle telemetry Brief publishing must use a primitive signature guard');
assert(widget.includes('lastPublishSignatureRef'), 'Vehicle telemetry Brief publishing must suppress repeated publish calls per unchanged snapshot');
assert(widget.includes('rawTelemetryAlertSignature'), 'Telemetry detail alert effect should key off a primitive raw telemetry signature');
assert(widget.includes('alertsSignatureRef'), 'Telemetry detail alerts should avoid setState when alert content is unchanged');
assert(!widget.includes('[vt.snapshot.isLive, vt.rawTelemetry]'), 'Telemetry detail alerts must not depend on raw telemetry object identity');
assert(!/useEffect\([\s\S]{0,360}setAlerts\([\s\S]{0,120}\}, \[vt\.snapshot\.isLive, vt\.rawTelemetry\]\)/.test(widget), 'Telemetry detail must not set alert state from raw object identity churn');

const scannerHook = read('src/vehicle-telemetry/useOBD2Scanner.ts');
assert(scannerHook.includes('mountedRef.current'), 'OBD scanner hook must guard subscription state updates after unmount');
assert(scannerHook.includes('if (mountedRef.current)'), 'OBD scanner hook must avoid setState after unmount');
assert(scannerHook.includes('return () => {') && scannerHook.includes('unsub();'), 'OBD scanner hook must clean up adapter subscriptions');

const unifiedConnections = read('lib/useUnifiedDeviceConnections.ts');
assert(!/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,260}startScan\(/.test(unifiedConnections), 'Unified device connections must not start provider scans from mount/render effects');
assert(unifiedConnections.includes('scanInFlightRef.current'), 'Unified device connections must guard overlapping scans with refs');
assert(unifiedConnections.includes('mountedRef.current') && unifiedConnections.includes("obd2Adapter.stopScan('unified_panel_unmount')"), 'Unified device connections must cancel scans on unmount');

const briefPublisher = read('lib/telemetryBriefPublisher.ts');
assert(briefPublisher.includes('TELEMETRY_BRIEF_SUPPRESSION_MS = 10 * 60 * 1000'), 'Telemetry Brief publisher must keep ten-minute suppression');
assert(briefPublisher.includes('recentTelemetryAdvisories'), 'Telemetry Brief publisher must keep dedupe state outside React render paths');
assert(briefPublisher.includes('lastGlobalVehicleTelemetryState'), 'Telemetry Brief transition memory should stay separate from attitude sensor state');

console.log('Telemetry render-loop guard checks passed.');
