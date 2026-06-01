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

function between(source, start, end, message) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `${message}: missing start marker`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `${message}: missing end marker`);
  return source.slice(startIndex, endIndex + end.length);
}

const fleet = read('app', '(tabs)', 'fleet.tsx');
const profileModal = read('components', 'fleet', 'FleetVehicleProfileModal.tsx');
const buildLoadoutModal = read('components', 'fleet', 'FleetBuildLoadoutModal.tsx');
const setupRoute = read('app', 'setup.tsx');
const vehicleConfigRoute = read('app', '(tabs)', 'vehicle-config.tsx');
const zeroVehicleTest = read('scripts', 'test-fleet-zero-vehicle-state.js');
const migrationTest = read('scripts', 'test-fleet-legacy-state-migration.js');

const addVehicleHandler = between(
  fleet,
  'const handleAddVehicle = useCallback(() => {',
  '}, [closeFleetDetailFlows]);',
  'Fleet Add Vehicle handler',
);

includes(
  addVehicleHandler,
  'setProfileModalVehicle(null);',
  'Add Vehicle should open the current new-vehicle profile flow.',
);
includes(
  addVehicleHandler,
  'setProfileModalVisible(true);',
  'Add Vehicle should open the current Vehicle Profile modal.',
);
notIncludes(
  addVehicleHandler,
  "pathname: '/setup'",
  'Add Vehicle must not route to the retired /setup framework.',
);
notIncludes(
  addVehicleHandler,
  "pathname: '/(tabs)/vehicle-config'",
  'Add Vehicle must not route to retired vehicle-config.',
);

includes(
  fleet,
  '<FleetVehicleProfileModal',
  'Fleet should mount the current Vehicle Profile modal.',
);
includes(
  fleet,
  'vehicle={profileModalVehicle}',
  'Fleet should pass null for new vehicle setup and a vehicle for edit profile.',
);
includes(
  fleet,
  'onSaved={handleVehicleProfileSaved}',
  'Saving the current profile flow should refresh Fleet state.',
);
includes(
  fleet,
  '!storedActiveVehicleId && result.vehicles.length === 1',
  'Fleet should detect first vehicle creation after profile save.',
);
includes(
  fleet,
  'vehicleSetupStore.setActiveVehicleId(result.vehicles[0].id);',
  'First created vehicle should become the active vehicle.',
);
includes(
  fleet,
  'fleetCardModels.length === 0 ?',
  'Zero vehicles should render a current empty state instead of a missing vehicle card.',
);
includes(
  fleet,
  'ECS_STATE_COPY.fleet.noVehiclesConfigured.title',
  'Fleet empty state should use current Fleet state copy.',
);
includes(
  fleet,
  'firstRunVccSetupOpenedRef',
  'First Fleet arrival with no vehicles should open the current VCC setup path once.',
);
const visibleEmptyState = between(
  fleet,
  'fleetCardModels.length === 0 ? (',
  ') : (',
  'Visible zero-vehicle card area',
);
notIncludes(
  visibleEmptyState,
  'actionLabel={ECS_STATE_COPY.fleet.noVehiclesConfigured.ctaLabel}',
  'Visible zero-vehicle card area should not duplicate the VCC Add Vehicle action.',
);

includes(
  profileModal,
  "title={vehicle ? 'Vehicle Profile' : 'Add Vehicle Profile'}",
  'Current first-vehicle setup should use the Add Vehicle Profile modal title.',
);
includes(
  profileModal,
  ': await vehicleStore.create(identity, userId);',
  'Current first-vehicle setup should create a current-format vehicle record.',
);
includes(
  profileModal,
  'vehicleSpecStore.update(savedVehicle.id',
  'Current first-vehicle setup should persist technical specs.',
);
includes(
  profileModal,
  'const profileResult = await saveVehicleProfileDraft();',
  'Advanced Specs Done should create/save the first vehicle before persisting advanced values.',
);
includes(
  profileModal,
  'const targetVehicle = profileResult.vehicle;',
  'Advanced Specs Done should use the saved first vehicle ID for tires, lift, fuel, and water.',
);
includes(
  profileModal,
  'if (profileResult.created)',
  'First-vehicle Advanced Specs Done should advance out of setup after save.',
);
includes(
  profileModal,
  'onSaved?.();',
  'Profile save should notify Fleet to refresh and show the card.',
);
notIncludes(
  profileModal,
  'SETUP_STEPS',
  'Current profile modal must not embed the retired setup stepper.',
);

const premiumCard = between(
  fleet,
  'function FleetPremiumVehicleCard({',
  'function LoadoutSummaryMetrics({',
  'Fleet premium vehicle card',
);
notIncludes(
  premiumCard,
  'ECS Fabric Debug',
  'Fleet vehicle card should not render user-facing fabric debug output.',
);
notIncludes(
  premiumCard,
  'fabricDebug',
  'Fleet vehicle card should not include a visible fabric debug panel.',
);
notIncludes(
  premiumCard,
  'label={model.verificationStatus.toUpperCase()}',
  'Fleet vehicle card should not render a confusing verification status pill.',
);
notIncludes(
  premiumCard,
  '${model.verificationStatus}',
  'Fleet vehicle card accessibility label should not announce the removed verification pill.',
);
includes(
  premiumCard,
  '<FleetVehicleCardIcon active={isActive} />',
  'Fleet vehicle card should render the ECS truck/off-road FleetIcon wrapper.',
);
notIncludes(
  premiumCard,
  'name={model.iconName as any}',
  'Fleet vehicle card should not render the generic Ionicons car resolver as its primary vehicle glyph.',
);
includes(
  premiumCard,
  'model.useCaseChips.length > 0 ?',
  'Fleet vehicle card should hide the tag row when only the removed verification pill would have rendered.',
);
for (const label of ['Operating', 'Payload Left', 'Readiness', 'Confidence']) {
  includes(
    premiumCard,
    `<FleetMetricTile label="${label}"`,
    `Fleet vehicle card should keep the ${label} metric tile.`,
  );
}
for (const hiddenHelper of [
  'helper="base + build + load" showHelper={false}',
  'helper="GVWR margin" showHelper={false}',
  'helper={scoringResult.riskLevel} showHelper={false}',
  'helper={weightResult.baseNetWeight.source} showHelper={false}',
]) {
  includes(
    premiumCard,
    hiddenHelper,
    'Fleet vehicle card metric helper text should remain accessibility-only and not visible.',
  );
}
const cardFooter = between(
  premiumCard,
  '<ECSCardFooter style={s.actionSection}>',
  '</ECSCardFooter>',
  'Fleet vehicle card action footer',
);

for (const label of ['Vehicle Profile', 'Build & Loadout', 'Weight Summary', 'Delete Vehicle']) {
  includes(cardFooter, `label="${label}"`, `Vehicle card should include ${label}.`);
}

notIncludes(
  cardFooter,
  'ECS Score',
  'Vehicle card action footer must not include the redundant ECS Score button.',
);
notIncludes(
  cardFooter,
  'What Did I Forget',
  'Vehicle card action footer must not include the removed What Did I Forget button.',
);

const actionButtonCount = (cardFooter.match(/<ECSButton label="/g) || []).length;
assert.strictEqual(actionButtonCount, 4, 'Vehicle card action footer should have exactly four ECS buttons.');

includes(
  fleet,
  'onLoadout={() => handleOpenBuildLoadoutModal(model.vehicle)}',
  'Build & Loadout card action should open the current Build & Loadout modal.',
);
includes(
  fleet,
  '<FleetBuildLoadoutModal',
  'Fleet should mount the current Build & Loadout modal.',
);
includes(
  buildLoadoutModal,
  'title="Build & Loadout"',
  'Current Build & Loadout flow should use the current modal surface.',
);
includes(
  buildLoadoutModal,
  'FLEET_ACCESSORY_CATALOG.map',
  'Current Build & Loadout should use the current accessory catalog flow.',
);
includes(
  buildLoadoutModal,
  'onPress={() => toggleAccessory(catalog)}',
  'Current Build & Loadout accessory tiles should toggle in-place.',
);
notIncludes(
  buildLoadoutModal,
  'LoadoutWizardStep',
  'Current Build & Loadout modal must not render the retired Loadout wizard step.',
);
notIncludes(
  buildLoadoutModal,
  'AccessoryConfigStep',
  'Current Build & Loadout modal must not render the retired Accessories wizard step.',
);

includes(
  fleet,
  'onProfile={() => handleOpenVehicleProfile(model.vehicle)}',
  'Vehicle Profile card action should open the current profile modal.',
);
includes(
  fleet,
  'onWeightSummary={() => handleOpenWeightSummaryModal(model.vehicle)}',
  'Weight Summary card action should open the direct Weight Summary modal.',
);
includes(
  fleet,
  '<WeightDashboardPanel',
  'Weight Summary modal should render the useful weight dashboard details directly.',
);
includes(
  fleet,
  'onDelete={() => handleDeleteVehicle(model.vehicle)}',
  'Delete Vehicle card action should use the current delete confirmation flow.',
);
includes(
  fleet,
  "message: 'Are you sure you want to delete this vehicle?'",
  'Delete Vehicle should show the required confirmation message.',
);
includes(
  fleet,
  'remainingVehicles.length === 0',
  'Deleting the only vehicle should trigger explicit zero-vehicle cleanup.',
);
includes(
  fleet,
  'setActiveVehicleId(null);',
  'Deleting the only vehicle should clear local active vehicle state.',
);
includes(
  fleet,
  'vehicleSetupStore.clearActiveVehicleId();',
  'Deleting the only vehicle should clear persisted active vehicle state.',
);

includes(
  setupRoute,
  'function DeprecatedVehicleSetupRedirect()',
  'Retired /setup route should remain isolated behind a redirect.',
);
includes(
  vehicleConfigRoute,
  'function DeprecatedVehicleConfigRedirect()',
  'Retired vehicle-config route should remain isolated behind a redirect.',
);
includes(
  vehicleConfigRoute,
  "intent: vehicleId ? 'fleet_edit_vehicle' : 'fleet_add_vehicle'",
  'vehicle-config add links should stage the current Add Vehicle Profile intent.',
);
includes(
  zeroVehicleTest,
  'Fleet zero-vehicle state checks passed.',
  'Zero-vehicle state regression coverage should remain present.',
);
includes(
  migrationTest,
  'Fleet legacy vehicle framework state migration checks passed.',
  'Legacy persisted-state migration coverage should remain present.',
);

console.log('Fleet first-vehicle flow regression checks passed.');
