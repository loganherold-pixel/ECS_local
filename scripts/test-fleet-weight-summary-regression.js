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
const buildLoadoutModal = read('components', 'fleet', 'FleetBuildLoadoutModal.tsx');
const profileModal = read('components', 'fleet', 'FleetVehicleProfileModal.tsx');
const weightPanel = read('components', 'weight-dashboard', 'WeightDashboardPanel.tsx');
const cgVisual = read('components', 'weight-dashboard', 'CGVisualization.tsx');
const buildLoadoutDomain = read('lib', 'fleet', 'fleetBuildLoadout.ts');
const operatingWeightDomain = read('lib', 'fleet', 'fleetOperatingWeight.ts');

const fleetMainBody = between(
  fleet,
  '<View style={[s.fleetMainBody, fleetFrameStyle]}>',
  '</View>\n\n        {/* Scrollable vehicle list',
  'Fleet main body',
);

includes(
  fleetMainBody,
  '<FleetCommandSurface state={fleetCommandState} />',
  'Readiness Command should remain in the current Fleet body.',
);
includes(
  fleetMainBody,
  '<FleetOverviewHeader',
  'Current Vehicle Command Center should remain in the current Fleet body.',
);
includes(
  fleet,
  'Tell ECS what you drive, how it\'s built, and what it carries.',
  'Vehicle Command Center copy should remain intact.',
);
includes(
  fleetMainBody,
  'fleetCardModels.length === 0 ?',
  'Zero-vehicle state should render through current Fleet card area logic.',
);
includes(
  fleetMainBody,
  'ECS_STATE_COPY.fleet.noVehiclesConfigured.title',
  'Zero-vehicle state should use current Fleet empty state copy.',
);
includes(
  fleet,
  '<FleetVehicleProfileModal',
  'Current Vehicle Profile / Set Up Vehicle modal should remain mounted.',
);
includes(
  profileModal,
  "title={vehicle ? 'Vehicle Profile' : 'Add Vehicle Profile'}",
  'Current Add Vehicle / Set Up Vehicle flow should remain available.',
);
includes(
  fleet,
  '<FleetBuildLoadoutModal',
  'Current Build & Loadout modal should remain mounted.',
);

const weightModal = between(
  fleet,
  '<ECSModalShell\n        visible={weightSummaryModalVisible}',
  '</ECSModalShell>',
  'Weight Summary modal',
);

includes(weightModal, 'maxHeightFraction={0.94}', 'Weight Summary should use the current near-full-height ECS shell configuration.');
includes(weightModal, 'minHeightFraction={0.88}', 'Weight Summary should keep a tall, stable minimum height.');
includes(weightModal, 'scrollable={false}', 'Weight Summary should avoid an outer scrolling sheet that cuts off content.');
includes(weightModal, 'bodyStyle={s.weightSummaryModalBody}', 'Weight Summary should use the flex body style.');
includes(weightModal, 'contentContainerStyle={s.weightSummaryModalContent}', 'Weight Summary should use the flex content style.');
includes(weightModal, 'vehicleId={weightSummaryModalVehicle?.id ?? null}', 'Weight Summary should stay scoped to the selected vehicle.');
notIncludes(weightModal, 'vehicleId={activeVehicleId}', 'Weight Summary must not accidentally show active vehicle data instead of selected/swiped vehicle data.');

notIncludes(weightPanel, "(['overview', 'zones', 'stability']", 'Removed Weight Summary tab registry should not reappear.');
notIncludes(weightPanel, 'activeSection', 'Removed Weight Summary tab state should not reappear.');
notIncludes(weightPanel, 'ZoneWeightBars', 'Zone Distribution component should not reappear.');
notIncludes(weightPanel, 'TiltRiskPanel', 'Tilt Risk Analysis component should not reappear.');
notIncludes(weightPanel, 'WeightComparisonCard', 'Old comparison card should not reappear.');
notIncludes(weightPanel, 'Zone Distribution', 'Zone Distribution title should not reappear.');
notIncludes(weightPanel, 'Tilt Risk Analysis', 'Tilt Risk Analysis title should not reappear.');

includes(weightPanel, 'TOTAL OPERATING WEIGHT', 'Weight Summary should remain a real-time operating weight dashboard.');
includes(weightPanel, '<CGVisualization', 'Center of Gravity container should remain.');
includes(weightPanel, 'selectFleetVehicleState', 'Weight Summary should use canonical Fleet vehicle state.');
includes(weightPanel, 'fleetState.operatingWeight.dashboardData', 'Weight Summary should use actual Fleet operating weight math.');
includes(weightPanel, 'vehicleStore.subscribe', 'Saved vehicle/build selections should feed and refresh Weight Summary.');
includes(weightPanel, 'vehicleStore.subscribe', 'Weight Summary should refresh after vehicle/build saves.');
includes(weightPanel, 'loadoutStore.subscribe', 'Weight Summary should refresh after loadout saves.');
includes(weightPanel, 'loadoutItemStore.subscribe', 'Weight Summary should refresh after loadout item changes.');

includes(cgVisual, 'TopDownVehicleProfile', 'COG visual should use the top-down vehicle profile component.');
includes(cgVisual, 'resolveVehicleProfileKind', 'COG visual should adapt by selected vehicle type.');
includes(cgVisual, 'TopDownVehicleFallbackProfile', 'COG visual should use the ECS drawn top-down vehicle profile.');
notIncludes(cgVisual, 'import { Image', 'COG visual should not depend on a generic image asset.');
notIncludes(cgVisual, "require('../../assets/images/Attitude_Truck_Silhouette.png')", 'COG visual should not depend on the retired top-down image asset.');
includes(cgVisual, 'cgLongitudinalPercent', 'COG visual should remap longitudinal COG for the vertical asset axis.');
includes(cgVisual, 'cgLateralPercent', 'COG visual should remap lateral COG for the horizontal asset axis.');
includes(cgVisual, 'cgResult.yCG', 'COG marker should use live lateral placement.');
notIncludes(cgVisual, 'vehicleBody', 'COG visual should not regress to the old generic box body.');
notIncludes(cgVisual, 'axleWheel', 'COG visual should not regress to decorative wheel-box graphics.');

includes(buildLoadoutDomain, 'FleetPlacementMetadata', 'Build & Loadout state should persist placement metadata.');
includes(buildLoadoutDomain, 'placementFromDescriptor', 'Build & Loadout should map zones/compartments to vehicle-relative placement.');
includes(buildLoadoutDomain, 'normalizePlacement', 'Old saved Build & Loadout data should be normalized safely.');
includes(buildLoadoutDomain, 'placementStatus', 'Missing/stale compartment placement should be tracked explicitly.');
includes(buildLoadoutDomain, 'toFleetCompartmentLoadoutItems', 'Build & Loadout items should adapt into Weight Summary loadout items.');
includes(buildLoadoutDomain, 'placement: item.placement', 'Loadout item placement should be preserved for Weight Summary.');
includes(buildLoadoutDomain, 'placement: placementFromDescriptor(install.mountZone', 'Accessory placement should be preserved for Weight Summary.');

includes(buildLoadoutModal, 'PLACEMENT / COMPARTMENT', 'Add/Edit Loadout Item should expose compartment placement.');
includes(buildLoadoutModal, 'activeCompartments.map', 'Add/Edit Loadout Item should let users move items between active compartments.');
includes(buildLoadoutModal, 'fleet_build_loadout: nextState', 'Save Build should persist the state used by Weight Summary.');
includes(buildLoadoutModal, 'Choose a compartment before saving this item', 'Missing placement should produce a user-facing guard.');
includes(buildLoadoutModal, 'FLEET_BUILD_LOADOUT_HIGH_MOUNTED_RISK_ACK_ID', 'Save Build should persist high-mounted load risk acknowledgement.');
includes(buildLoadoutModal, 'High-mounted load is increasing top-heavy risk.', 'Save Build should warn before saving high-mounted load risk.');
includes(buildLoadoutModal, 'Dismiss & Continue', 'High-mounted load warning should allow the user to dismiss and continue saving.');
includes(buildLoadoutDomain, 'acknowledgedRiskIds', 'Build & Loadout state should preserve acknowledged risk ids.');
notIncludes(buildLoadoutModal, "router.push('/(tabs)/fleet')", 'Add Item should not navigate back to Fleet.');
notIncludes(buildLoadoutModal, 'router.replace', 'Add Item should not replace the Fleet route.');

includes(operatingWeightDomain, 'calculateVehicleCenterOfGravity', 'COG should be calculated by a pure helper.');
includes(operatingWeightDomain, 'resolvePlacementFromItem', 'COG should read saved item/accessory placement metadata.');
includes(operatingWeightDomain, 'buildFleetFrameworkAccessoryInstalls', 'Framework accessories should share one adapter with Fleet card and Weight Summary.');
includes(operatingWeightDomain, 'frameworkContainerZones', 'Framework container zones should feed operating weight and COG.');
includes(operatingWeightDomain, 'missingWeightCount', 'Unknown weights should be tracked as partial data.');
includes(operatingWeightDomain, 'missingZoneMetadataCount', 'Unknown placement should be tracked as partial data.');

console.log('Fleet Weight Summary integration regression checks passed.');
