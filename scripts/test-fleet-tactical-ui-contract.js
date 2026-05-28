const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

const contract = read('docs', 'fleet-tactical-ui-contract.md');
const fleet = read('app', '(tabs)', 'fleet.tsx');
const rootLayout = read('app', '_layout.tsx');
const tabsLayout = read('app', '(tabs)', '_layout.tsx');
const commandDock = read('components', 'CommandDock.tsx');
const buildLoadoutModal = read('components', 'fleet', 'FleetBuildLoadoutModal.tsx');
const buildLoadoutHelper = read('lib', 'fleet', 'fleetBuildLoadout.ts');
const weightSummaryHelper = read('lib', 'fleet', 'fleetWeightSummary.ts');
const checklistHelper = read('lib', 'fleet', 'fleetChecklist.ts');
const fabricService = read('lib', 'fleet', 'fleetFabricService.ts');
const telemetryEvents = read('lib', 'fleet', 'fleetTelemetryEvents.ts');
const releaseConfig = read('lib', 'fleet', 'fleetPremiumReleaseConfig.ts');
const loadoutModal = read('components', 'fleet', 'FleetLoadoutModal.tsx');
const profileModal = read('components', 'fleet', 'FleetVehicleProfileModal.tsx');
const profileHelper = read('lib', 'fleet', 'fleetVehicleProfile.ts');
const advancedSpecsHelper = read('lib', 'fleet', 'fleetAdvancedSpecs.ts');
const syncModal = read('components', 'fleet', 'FleetSyncModal.tsx');
const vehicleResourceProfile = read('lib', 'vehicleResourceProfile.ts');
const activeVehicleContext = read('lib', 'activeVehicleContext.ts');
const resourceForecastEngine = read('lib', 'resourceForecastEngine.ts');
const aiContextBuilder = read('lib', 'aiContextBuilder.ts');
const rigCompatibilityEngine = read('lib', 'rigCompatibilityEngine.ts');
const dashboard = read('app', '(tabs)', 'dashboard.tsx');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const widgetReadiness = read('components', 'dashboard', 'widgetReadiness.ts');

for (const required of [
  'No-Media Rule',
  'ShellBodyBackground',
  'ECSCard',
  'ECSPanel',
  'ECSBadge',
  'ECSStatusPill',
  'ECSButton',
  'ECSActionRow',
  'ECSModalShell',
  'TacticalPopupShell',
  'Header',
  'CommandDock',
  'getShellBottomClearance',
  'Do not create a Fleet-only top banner',
  'Fleet must not render another bottom dock',
  'Current Fleet Shell Audit',
  'Mobile Safe-Area And Scroll QA Checklist',
  'Fleet modal body overrides may only adjust layout density',
  'Fleet renders the shared `Header` once',
  'Fleet does not render `CommandDock`',
]) {
  assertIncludes(contract, required, `Fleet tactical UI contract should document ${required}.`);
}

for (const forbiddenMediaRule of [
  'OEM vehicle photographs',
  'Dealer images',
  'Scraped vehicle media',
  'User-uploaded vehicle imagery',
  'Remote vehicle image URLs',
  'Vehicle photo manifests',
  'Photo resolvers',
  'Image carousels',
]) {
  assertIncludes(
    contract,
    forbiddenMediaRule,
    `Fleet tactical UI contract should include the forbidden media rule: ${forbiddenMediaRule}.`,
  );
}

for (const primitive of [
  "import Header from '../../components/Header'",
  "import TopoBackground from '../../components/TopoBackground'",
  "import { ECSButton } from '../../components/ECSButton'",
  "import ECSActionRow from '../../components/ECSActionRow'",
  "import { ECSCard, ECSCardFooter, ECSPanel } from '../../components/ECSSurface'",
  "import { ECSBadge } from '../../components/ECSStatus'",
  'getShellBottomClearance',
  "import FleetVehicleProfileModal from '../../components/fleet/FleetVehicleProfileModal'",
  "import FleetBuildLoadoutModal from '../../components/fleet/FleetBuildLoadoutModal'",
  "import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens'",
  "import { ECS_STATUS } from '../../lib/ecsStatusTokens'",
  "resolveFleetPremiumReleaseConfig",
  "getFleetPremiumRolloutDisabledCopy",
]) {
  assertIncludes(fleet, primitive, `Fleet screen should continue using shared primitive: ${primitive}.`);
}

assertIncludes(fleet, "backgroundColor: 'transparent'", 'Fleet page container should keep the route background transparent.');
assertIncludes(fleet, 'paddingBottom: dockClearance', 'Fleet should reserve bottom dock safe-area clearance.');
assert.ok(!fleet.includes('<CommandDock'), 'Fleet route must not render the root-owned bottom command dock.');
assert.ok(!fleet.includes('FleetSyncStatusIndicator'), 'Fleet route must not duplicate the shared header sync entry point.');
assertIncludes(fleet, "title=\"Fleet\"", 'Fleet route header should keep the visible tab/screen label Fleet.');
assertIncludes(fleet, "Fleet rollout paused", 'Fleet route should expose a polished rollout-disabled state.');
assertIncludes(fleet, 'VEHICLE COMMAND CENTER', 'Fleet must preserve the current Vehicle Command Center container.');
assertIncludes(
  fleet,
  "Tell ECS what you drive, how it's built, and what it carries. We'll handle the scoring details.",
  'Fleet must preserve the current Vehicle Command Center setup copy.',
);
assertIncludes(
  fleet,
  'setProfileModalVisible(true)',
  'Fleet Add Vehicle should keep using the current Vehicle Profile setup modal.',
);
assertIncludes(
  fleet,
  "flow.intent === 'fleet_add_vehicle'",
  'Fleet should translate stale fleet-add route intents into the current Add Vehicle modal.',
);
assertIncludes(
  fleet,
  "flow.intent === 'fleet_edit_vehicle'",
  'Fleet should translate stale fleet-edit route intents into the current Vehicle Profile modal.',
);
assert.ok(
  !fleet.includes("pathname: '/setup'"),
  'Fleet must not route current or stale actions into the retired /setup vehicle framework.',
);
assert.ok(
  !fleet.includes("pathname: '/(tabs)/vehicle-config'"),
  'Fleet must not route current or stale actions into the retired vehicle-config stepped framework.',
);

for (const premiumFleetFragment of [
  'function FleetOverviewHeader',
  'function FleetPremiumVehicleCard',
  "Tell ECS what you drive, how it's built, and what it carries. We'll handle the scoring details.",
  'Vehicle Profile',
  'Build & Loadout',
  'Weight Summary',
  'Readiness/ECS Score',
  'What Did I Forget?',
  'formatFleetWeightValue(weightResult.operatingWeight.lbs)',
  'formatFleetWeightValue(weightResult.payloadRemaining?.lbs)',
  'Base Net/Empty',
  'GVWR is the max loaded rating',
  'Measured accessory, loadout, or axle weights can refine front/rear estimates',
  'selectFleetVehicleStateFromRecord',
  'fleetRiskTone',
  'ECSInlineHelper',
  'ECS Score',
  'What Did I Forget?',
  'Optional readiness audit',
  'ECSModalShell',
  'overlayClass="editor"',
]) {
  assertIncludes(fleet, premiumFleetFragment, `Fleet premium IA should include ${premiumFleetFragment}.`);
}

for (const forbiddenFleetMedia of [
  'iconAsset=',
  'heavy-duty-truck-hero',
  '<Image',
  'ImageBackground',
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'imageUrl',
  'remoteImage',
  'vehicle image upload',
]) {
  assert.ok(!fleet.includes(forbiddenFleetMedia), `Fleet tab should not include media hook ${forbiddenFleetMedia}.`);
}

for (const premiumPolishFragment of [
  "import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens'",
  "import { ECS_STATUS } from '../../lib/ecsStatusTokens'",
  'accessibilityRole="header"',
  'accessibilityRole="button"',
  'accessibilityState={{ selected:',
  "accessibilityLabel={`${label}: ${value}${helper ? `. ${helper}` : ''}`}",
  'style={s.metricTileContent}',
  's.vehicleIconActive',
  'ECS_STATUS.tone.selected.background',
  'ECS_SURFACE.border.quiet',
]) {
  assertIncludes(fleet, premiumPolishFragment, `Fleet premium polish should include ${premiumPolishFragment}.`);
}

assert.ok(
  !fleet.includes("backgroundColor: 'rgba(196, 138, 44, 0.2)'"),
  'Fleet vehicle active icon state should use shared selected status tokens, not inline rgba.',
);

for (const weightSummaryFragment of [
  'baseNetWeightLb',
  'permanentAccessoryWeightLb',
  'currentLoadoutWeightLb',
  'estimatedFrontAxleWeightLb',
  'estimatedRearAxleWeightLb',
  'highMountedAddedWeightLb',
  'payloadRiskLevel',
  'applyFleetWeightVerification',
]) {
  assertIncludes(weightSummaryHelper, weightSummaryFragment, `Fleet weight summary helper should include ${weightSummaryFragment}.`);
}

for (const forbiddenWeightSummaryMedia of [
  'iconAsset=',
  'Image',
  'imageUrl',
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'remoteImage',
]) {
  assert.ok(!weightSummaryHelper.includes(forbiddenWeightSummaryMedia), `Fleet Weight Summary should not include media hook ${forbiddenWeightSummaryMedia}.`);
}

for (const checklistFragment of [
  'Daily driver',
  'Work truck',
  'Towing',
  'Off-road / recovery',
  'Overland / travel',
  'Winter',
  'Family / personal',
  'Emergency readiness',
  'have_it',
  'need_it',
  'not_needed',
  'not_sure',
  'buildFleetChecklistRecommendations',
  'createChecklistLinkedLoadoutItem',
]) {
  assertIncludes(checklistHelper, checklistFragment, `Fleet checklist helper should include ${checklistFragment}.`);
}

for (const checklistUiFragment of [
  'ECSBadge label="Optional"',
  'ECSInlineHelper',
  'ECSModalShell',
  'overlayClass="editor"',
  'Have it',
  'Need it',
  'Not needed',
  'Not sure',
]) {
  assertIncludes(fleet, checklistUiFragment, `Fleet checklist surfaces should use shared tactical UI: ${checklistUiFragment}.`);
}

for (const forbiddenChecklistMedia of [
  'iconAsset=',
  'Image',
  'imageUrl',
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'remoteImage',
  'upload',
]) {
  assert.ok(!checklistHelper.includes(forbiddenChecklistMedia), `Fleet checklist should not include media hook ${forbiddenChecklistMedia}.`);
}

for (const fabricFragment of [
  'fleet.fabric.v2',
  'generatePremiumFleetFabricPayload',
  'generateFleetFabricPayloadFromSource',
  'riskFlags',
  'confidenceBreakdown',
  'weightVerifications',
  'tacticalUiState',
  'extractFleetFabricPayload',
]) {
  assertIncludes(fabricService, fabricFragment, `Fleet fabric service should include ${fabricFragment}.`);
}

for (const eventName of [
  'fleet_vehicle_added',
  'fleet_specs_confirmed',
  'fleet_accessory_added',
  'fleet_loadout_item_added',
  'fleet_weight_verified',
  'fleet_checklist_completed',
]) {
  assertIncludes(telemetryEvents + fleet + profileModal + buildLoadoutModal, eventName, `Fleet telemetry hook should expose ${eventName}.`);
}

for (const forbiddenFabricMedia of [
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'remoteImage',
  'cdnImage',
  'oemSourceUrl',
  'userUploadedVehicleImage',
]) {
  assert.ok(!fabricService.includes(forbiddenFabricMedia), `Fleet fabric service should not include media hook ${forbiddenFabricMedia}.`);
}

for (const releaseFragment of [
  'DEFAULT_FLEET_PREMIUM_RELEASE_CONFIG',
  'premiumFleetEnabled: true',
  'fabricSyncEnabled: true',
  'Fleet premium is paused for this rollout.',
]) {
  assertIncludes(releaseConfig, releaseFragment, `Fleet premium release config should include ${releaseFragment}.`);
}

for (const profileFragment of [
  "import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell'",
  "title={vehicle ? 'Vehicle Profile' : 'Add Vehicle Profile'}",
  'Confirm Specs',
  'Advanced Specs',
  'overlayClass="workflow"',
  'overlayClass="editor"',
  'Suspension height',
  'Leveling kit',
  'Front suspension level',
  'Tire size',
  'Water gallons',
  'Fuel gallons',
  'Use X to close without saving changes.',
  'tiresLiftStore.set',
  'consumablesStore.setFuelGal',
  'baseNetWeight',
  'gvwr',
]) {
  assertIncludes(profileModal, profileFragment, `Fleet profile modal should include ${profileFragment}.`);
}

for (const advancedSpecsRuleFragment of [
  'FLEET_ADVANCED_SUSPENSION_HEIGHT_OPTIONS',
  'Array.from({ length: 11 }, (_, value) => value)',
  'FLEET_ADVANCED_FRONT_LEVEL_OPTIONS = [1, 2, 3, 4]',
  'FLEET_ADVANCED_TIRE_SIZE_OPTIONS',
  'index + 20',
  'validateFleetAdvancedSpecsDraft',
  'normalizeFleetAdvancedSpecsDraftForSave',
  'frontLevelInches: draft.isLeveled ? draft.frontLevelInches : null',
]) {
  assertIncludes(
    advancedSpecsHelper + profileModal,
    advancedSpecsRuleFragment,
    `Advanced Specs helper/modal should preserve ${advancedSpecsRuleFragment}.`,
  );
}

const closeAdvancedStart = profileModal.indexOf('const closeAdvancedWithoutSaving');
const commitAdvancedStart = profileModal.indexOf('const commitAdvancedSpecs');
assert.ok(closeAdvancedStart > 0 && commitAdvancedStart > closeAdvancedStart, 'Advanced Specs close and commit handlers should be discoverable.');
const closeAdvancedBody = profileModal.slice(closeAdvancedStart, profileModal.indexOf('const applySuggestedSpecs'));
assertIncludes(closeAdvancedBody, 'setAdvancedDraft(null)', 'Advanced Specs X close should discard the draft.');
assertIncludes(closeAdvancedBody, 'setAdvancedVisible(false)', 'Advanced Specs X close should hide the editor.');
for (const forbiddenSaveCall of [
  'vehicleStore.update',
  'vehicleSpecStore.update',
  'tiresLiftStore.set',
  'consumablesStore.setFuelGal',
  'consumablesStore.setWaterGal',
]) {
  assert.ok(
    !closeAdvancedBody.includes(forbiddenSaveCall),
    `Advanced Specs X close must not save via ${forbiddenSaveCall}.`,
  );
}

const commitAdvancedBody = profileModal.slice(commitAdvancedStart, profileModal.indexOf('const activeAdvancedDraft'));
for (const doneSaveFragment of [
  'normalizeFleetAdvancedSpecsDraftForSave(nextDraft)',
  'saveVehicleProfileDraft()',
  'const targetVehicle = profileResult.vehicle',
  'tiresLiftStore.set',
  'consumablesStore.setWaterGal',
  'consumablesStore.setFuelGal',
  'vehicleSpecStore.update',
  'vehicleStore.update',
  'setAdvancedDraft(null)',
  'setAdvancedVisible(false)',
  'if (profileResult.created)',
  'handleClose();',
]) {
  assertIncludes(commitAdvancedBody, doneSaveFragment, `Advanced Specs Done should save/close with ${doneSaveFragment}.`);
}
const openAdvancedBody = profileModal.slice(profileModal.indexOf('const openAdvancedSpecs'), closeAdvancedStart);
assertIncludes(
  openAdvancedBody,
  'setAdvancedDraft(buildAdvancedSetupDraft(vehicle, advancedSpecFallbacks))',
  'Reopening Advanced Specs should hydrate from saved vehicle/store values plus OEM suggestions.',
);

for (const pipelineFragment of [
  'currentFuelGallons',
  'currentFuelWeightLb',
  'currentWaterGallons',
  'currentWaterWeightLb',
  'frontLevelInches',
  'getVehicleResourceProfile(vehicle, { spec, consumables, tiresLift })',
]) {
  assertIncludes(
    vehicleResourceProfile + activeVehicleContext,
    pipelineFragment,
    `Fleet vehicle resource pipeline should expose ${pipelineFragment}.`,
  );
}

for (const operationalFragment of [
  'fuelGallons: activeVehicleContext.resourceProfile.currentFuelGallons',
  'waterWeightLb: activeVehicleContext.resourceProfile.currentWaterWeightLb',
  'frontLevelInches: navigateVehicleContext.resourceProfile.frontLevelInches',
  'fuelGallons: navigateVehicleContext.resourceProfile.currentFuelGallons',
  'currentFuelGallons?: number | null',
  'Current fuel:',
  'Current water:',
  'buildVehicleProfileSnapshot(snapshot, telemetryConfig, useStoreFallbacks)',
  'getVehicleResourceProfile(vehicle as any, { spec, consumables, tiresLift })',
  'frontLevelInches: number | null',
  'activeVehicle.resourceProfile.tireSizeInches',
]) {
  assertIncludes(
    dashboard + navigate + resourceForecastEngine + aiContextBuilder + rigCompatibilityEngine + widgetReadiness,
    operationalFragment,
    `Fleet operational pipeline should consume saved advanced specs: ${operationalFragment}.`,
  );
}
assertIncludes(profileHelper, 'ECS estimated this from vehicle configuration.', 'Fleet profile helper should explain ECS configuration confidence.');
assertIncludes(profileHelper, 'Enter saved base weight and GVWR values to replace generic defaults.', 'Fleet profile helper should explain how to replace generic defaults.');

for (const forbiddenProfileMedia of [
  'iconAsset=',
  'Image',
  'imageUrl',
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'upload',
]) {
  assert.ok(!profileModal.includes(forbiddenProfileMedia), `Fleet profile flow should not include media hook ${forbiddenProfileMedia}.`);
}

for (const buildLoadoutFragment of [
  "import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell'",
  'title="Build & Loadout"',
  'Do you know brand/model?',
  'overlayClass="workflow"',
  'overlayClass="editor"',
  'Roof Rack / Platform',
  'Truck Cap / SmartCap',
  'Bed Drawers / Storage System',
  'ECS estimated this at',
  'Compartment Loadout',
  'Cab',
  'Bed floor',
  'Bed high/cap',
  'Drawers',
  'Roof',
  'Hitch/trailer',
  'Custom Compartment',
  "compartment.accessoryId === 'custom_accessory'",
  'styles.customCompartmentRow',
  'accessibilityLabel={`Add custom loadout item to ${compartment.name}`}',
  "category: item?.category ?? (isCustomCompartment ? 'custom' : DEFAULT_LOADOUT_CATEGORY)",
  'VEHICLE LOCATION',
  'FLEET_LOAD_ZONES.map',
  "loadZone: item?.loadZone ?? compartment.loadZone",
  'toFleetLoadoutZoneWeights',
  'validateFleetCompartmentLoadoutDraft',
  'showToast?.(validationErrors[0])',
  'isCustomLoadoutDraft',
  'ITEM WEIGHT LB',
  'Add Loadout Item',
  'overlayClass="editor"',
]) {
  assertIncludes(
    buildLoadoutModal + buildLoadoutHelper,
    buildLoadoutFragment,
    `Fleet Build & Loadout should include ${buildLoadoutFragment}.`,
  );
}

for (const removedLoadoutPresetUi of [
  'FLEET_LOADOUT_PRESETS.map',
  'styles.presetRow',
  'styles.presetChip',
  'styles.presetText',
  'Show ${preset.label} compartment load context',
]) {
  assert.ok(
    !buildLoadoutModal.includes(removedLoadoutPresetUi),
    `Compartment Loadout should not render preset/category chip UI: ${removedLoadoutPresetUi}.`,
  );
}

for (const forbiddenAccessoryMedia of [
  'iconAsset=',
  'Image',
  'imageUrl',
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'upload',
]) {
  assert.ok(!buildLoadoutModal.includes(forbiddenAccessoryMedia), `Fleet Build & Loadout should not include media hook ${forbiddenAccessoryMedia}.`);
}

assertIncludes(
  loadoutModal,
  "import ECSModalShell from '../ECSModalShell'",
  'Fleet loadout modal should use the shared ECS modal shell.',
);
assertIncludes(
  loadoutModal,
  'overlayClass="workflow"',
  'Fleet loadout modal should use the workflow overlay class.',
);
for (const loadoutShellFragment of [
  "import { ECS_STATUS } from '../../lib/ecsStatusTokens'",
  'backgroundColor: ECS_STATUS.tone.selected.background',
]) {
  assertIncludes(loadoutModal, loadoutShellFragment, `Fleet loadout modal shell should use shared tokens: ${loadoutShellFragment}.`);
}
assert.ok(!loadoutModal.includes("backgroundColor: '#0B0F12'"), 'Fleet loadout modal should not use a local modal background color.');
assert.ok(!loadoutModal.includes('backgroundColor: ECS_SURFACE.background.primary'), 'Fleet loadout modal body should let ECSModalShell own modal shell background.');

assertIncludes(
  syncModal,
  "import TacticalPopupShell from '../TacticalPopupShell'",
  'Fleet sync modal should use the shared tactical popup shell.',
);
assertIncludes(syncModal, "import { ECSButton } from '../ECSButton'", 'Fleet sync modal footer should use the shared ECS button.');
assert.ok(!syncModal.includes('<TouchableOpacity'), 'Fleet sync modal should not use a local footer button container.');

for (const sharedFormSurface of [
  "import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens'",
  "import { ECS_STATUS } from '../../lib/ecsStatusTokens'",
  'ECS_SURFACE.background.compact',
  'ECS_STATUS.tone.selected.background',
]) {
  assertIncludes(profileModal + buildLoadoutModal, sharedFormSurface, `Fleet editor surfaces should use shared tokens: ${sharedFormSurface}.`);
}

assertIncludes(
  rootLayout,
  "import ShellBodyBackground from '../components/ShellBodyBackground'",
  'Root layout should own the shared shell body background.',
);
assertIncludes(
  rootLayout,
  "import CommandDock from '../components/CommandDock'",
  'Root layout should own the bottom command dock.',
);
assertIncludes(rootLayout, "normalizedPathname === '/fleet'", 'Fleet should be covered by shell background routing.');
assertIncludes(tabsLayout, '<Slot />', 'Shell route layout should render the active Fleet route through expo-router Slot.');
assertIncludes(commandDock, "route: '/fleet'", 'Command dock should own the Fleet navigation target.');
assertIncludes(commandDock, "label: 'FLEET'", 'Command dock should keep the visible Fleet navigation label.');

console.log('Fleet tactical UI contract checks passed.');
