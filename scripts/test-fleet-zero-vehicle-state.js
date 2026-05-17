const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const fleet = read('app', '(tabs)', 'fleet.tsx');
const vehicleSetupStore = read('lib', 'vehicleSetupStore.ts');

includes(
  fleet,
  'type FleetVehicleSelectionState = {',
  'Fleet should define an explicit selection state for active and visible vehicles.',
);
includes(
  fleet,
  'function resolveFleetVehicleSelection(',
  'Fleet should resolve active/visible vehicle state through a guarded helper.',
);
includes(
  fleet,
  'if (vehicles.length === 0) {',
  'Fleet selection helper should handle zero vehicles explicitly.',
);
includes(
  fleet,
  'activeVehicleId: null',
  'Zero-vehicle selection state should null activeVehicleId.',
);
includes(
  fleet,
  'visibleVehicleIndex: 0',
  'Zero-vehicle selection state should safely clamp visible index to 0.',
);
includes(
  fleet,
  'storedActiveVehicleId && !reconciledSelection.activeVehicleId',
  'Fleet fetch reconciliation should detect and clear stale active vehicle IDs.',
);
includes(
  fleet,
  'vehicleSetupStore.clearActiveVehicleId();',
  'Fleet should clear stale active vehicle context.',
);
includes(
  fleet,
  '!storedActiveVehicleId && result.vehicles.length === 1',
  'Fleet should promote the first created vehicle to active.',
);
includes(
  fleet,
  'vehicleSetupStore.setActiveVehicleId(result.vehicles[0].id);',
  'Fleet should set the first created vehicle as active.',
);
includes(
  fleet,
  'if (loading || authLoading || vehicles.length > 0) return;',
  'Fleet should have a zero-vehicle recovery effect after hydration.',
);
includes(
  fleet,
  'setVisibleFleetVehicleId((currentId) => (currentId == null ? currentId : null));',
  'Zero-vehicle recovery should clear stale visible vehicle id.',
);
includes(
  fleet,
  'setBuildLoadoutModalVisible(false);',
  'Zero-vehicle recovery should close stale Build & Loadout state.',
);
includes(
  fleet,
  'setWeightSummaryModalVisible(false);',
  'Zero-vehicle recovery should close stale Weight Summary state.',
);
includes(
  fleet,
  'setLoadoutModalVisible(false);',
  'Zero-vehicle recovery should close stale loadout state.',
);
includes(
  fleet,
  'fleetCardModels.length === 0 ?',
  'Fleet should render a current empty state instead of a missing vehicle card.',
);
includes(
  fleet,
  'ECS_STATE_COPY.fleet.noVehiclesConfigured.title',
  'Fleet zero-vehicle state should use the current empty-state copy.',
);
includes(
  fleet,
  'firstRunVccSetupOpenedRef',
  'Fleet zero-vehicle first arrival should open the current VCC setup path once.',
);
const visibleEmptyStateStart = fleet.indexOf('fleetCardModels.length === 0 ? (');
assert.ok(visibleEmptyStateStart >= 0, 'Fleet should render the current zero-vehicle branch.');
const visibleEmptyStateEnd = fleet.indexOf(') : (', visibleEmptyStateStart);
assert.ok(visibleEmptyStateEnd > visibleEmptyStateStart, 'Fleet zero-vehicle branch should have a current card fallback.');
const visibleEmptyState = fleet.slice(visibleEmptyStateStart, visibleEmptyStateEnd);
notIncludes(
  visibleEmptyState,
  'actionLabel={ECS_STATE_COPY.fleet.noVehiclesConfigured.ctaLabel}',
  'Visible zero-vehicle card area should not duplicate the VCC Add Vehicle action.',
);
notIncludes(
  fleet,
  "pathname: '/setup'",
  'Fleet zero-vehicle state must not route into the retired /setup framework.',
);
notIncludes(
  fleet,
  "pathname: '/(tabs)/vehicle-config'",
  'Fleet zero-vehicle state must not route into the retired vehicle-config framework.',
);
includes(
  vehicleSetupStore,
  'if (read(ACTIVE_VEHICLE_KEY) === vehicleId) return;',
  'Active vehicle writes should be idempotent.',
);
includes(
  vehicleSetupStore,
  'if (!read(ACTIVE_VEHICLE_KEY)) return;',
  'Active vehicle clears should be idempotent.',
);

console.log('Fleet zero-vehicle state checks passed.');
