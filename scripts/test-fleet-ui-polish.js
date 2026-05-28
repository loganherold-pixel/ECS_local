const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const fleetScreen = read('app/(tabs)/fleet.tsx');
const buildLoadoutModal = read('components/fleet/FleetBuildLoadoutModal.tsx');
const cgVisualization = read('components/weight-dashboard/CGVisualization.tsx');
const weightDashboardPanel = read('components/weight-dashboard/WeightDashboardPanel.tsx');
const vehicleProfileModal = read('components/fleet/FleetVehicleProfileModal.tsx');
const modalShell = read('components/ECSModalShell.tsx');
const vehicleProfileDomain = read('lib/fleet/fleetVehicleProfile.ts');
const buildLoadoutDomain = read('lib/fleet/fleetBuildLoadout.ts');
const fleetOverviewStatus = read('lib/fleet/fleetOverviewStatus.ts');

const addVehicleButtonLabels = fleetScreen.match(/label="Add Vehicle"/g) ?? [];
assert(
  addVehicleButtonLabels.length === 1,
  `Expected one visible Fleet Add Vehicle button owned by VCC, found ${addVehicleButtonLabels.length}.`,
);

assert(
  fleetScreen.includes('overlayClass="info"') &&
    fleetScreen.includes('minHeightFraction={0.88}') &&
    fleetScreen.includes('maxHeightFraction={0.94}') &&
    fleetScreen.includes('hideVehicleProfile'),
  'Weight Summary should use the centered full-height ECS modal configuration.',
);

assert(
  fleetScreen.includes('numberOfLines={2}\n                adjustsFontSizeToFit') &&
    fleetScreen.includes('minimumFontScale={0.82}'),
  'Active vehicle card title should allow long names to fit without one-line truncation.',
);

assert(
  fleetScreen.includes('numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.84}'),
  'Active vehicle descriptor should handle long make/model/trim text.',
);

assert(
  !fleetScreen.includes('vehicle staged') &&
    !fleetScreen.includes('vehicles staged') &&
    !fleetScreen.includes('ECS scoring trust') &&
    !fleetScreen.includes('fleet total') &&
    !fleetScreen.includes('needs source check') &&
    fleetScreen.includes('verificationHelper') &&
    fleetOverviewStatus.includes("targets.push('base weight')") &&
    fleetOverviewStatus.includes("targets.push('base estimate')") &&
    fleetOverviewStatus.includes("targets.push('GVWR')"),
  'Fleet overview command metrics should keep first three tiles clean and resolve real verification targets.',
);

assert(
    fleetScreen.includes('onConfidencePress') &&
    fleetScreen.includes('FleetConfidenceNoticeModal') &&
    fleetScreen.includes('scoreEyebrow="VEHICLE CONFIDENCE"') &&
    fleetScreen.includes('title="Vehicle Confidence"') &&
    fleetScreen.includes('setVehicleConfidenceNoticeVehicleId(model.vehicle.id)') &&
    fleetScreen.includes('selectedVehicleConfidenceNotice') &&
    fleetScreen.includes('accessibilityHint={`Opens the confidence explanation for ${vehicle.name}.`}') &&
    fleetScreen.includes('scrollable') &&
    fleetScreen.includes('bodyStyle={s.confidenceNoticeModalBody}') &&
    fleetScreen.includes('contentContainerStyle={s.confidenceNoticeModalContent}') &&
    fleetScreen.includes('confidenceNoticeModalContent') &&
    fleetScreen.includes('paddingBottom: 18') &&
    fleetScreen.includes('ECS Intelligence') &&
    fleetScreen.includes('To Improve Confidence') &&
    fleetScreen.includes('FleetConfidenceIntelligenceInput') &&
    fleetOverviewStatus.includes('buildFleetConfidenceNotice') &&
    fleetOverviewStatus.includes('FleetConfidenceIntelligenceInput') &&
    fleetOverviewStatus.includes('intelligenceSummary') &&
    fleetOverviewStatus.includes('incomplete accessory, loadout, consumable, or validation inputs') &&
    !fleetOverviewStatus.includes('Upgrade the user-entered'),
  'Fleet average confidence metric should open a scroll-safe ECS intelligence explanation with improvement actions.',
);

assert(
  fleetScreen.includes('premiumMetricTileAction') &&
    fleetScreen.includes('borderColor: TACTICAL.amber'),
  'Fleet average and vehicle confidence action tiles should use the ECS gold border affordance.',
);

assert(
  !buildLoadoutModal.includes('FLEET_LOADOUT_PRESETS.map') &&
    !buildLoadoutModal.includes('styles.presetRow') &&
    !buildLoadoutModal.includes('styles.presetChip') &&
    !buildLoadoutModal.includes('Show ${preset.label} compartment load context'),
  'Build/loadout preset category chips should be removed from the compartment loadout UI.',
);

assert(
  buildLoadoutModal.includes('flexWrap: \'wrap\'') &&
    buildLoadoutModal.includes('numberOfLines={2}>{compartment.name}</Text>') &&
    buildLoadoutModal.includes('numberOfLines={2}>{item.name}') &&
    !buildLoadoutModal.includes('{install ? `${install.confidence}% confidence` : catalog.mountZone}') &&
    !buildLoadoutModal.includes('compartmentPickerMeta'),
  'Build/loadout compartment editing should wrap readable names and items.',
);

assert(
  vehicleProfileModal.includes('requiredMark') &&
    vehicleProfileModal.includes('label="Nickname"') &&
    vehicleProfileModal.includes('label="Year"') &&
    vehicleProfileModal.includes('label="Make"') &&
    vehicleProfileModal.includes('label="Model"') &&
    vehicleProfileDomain.includes("errors.push('Year is required.')"),
  'Fleet profile setup should visibly mark hard-required fields before spec confirmation.',
);

assert(
  vehicleProfileModal.includes('Choose year, make, model, trim, engine, or drivetrain.') &&
    vehicleProfileModal.includes('prefillOptions.length > 0') &&
    vehicleProfileModal.includes('resolveFleetVehicleProfilePrefillOptions') &&
    vehicleProfileModal.includes('handlePrefillOption') &&
    !vehicleProfileModal.includes('FLEET_PROFILE_PRESETS.map'),
  'Fleet profile setup should hide static RAM presets and show contextual prefill options only after year/make/model are available.',
);

assert(
  vehicleProfileModal.includes('maxHeightFraction={1}') &&
    vehicleProfileModal.includes('minHeightFraction={1}') &&
    buildLoadoutModal.includes('maxHeightFraction={1}') &&
    buildLoadoutModal.includes('minHeightFraction={1}') &&
    !vehicleProfileModal.includes('topClearanceOverride={0}') &&
    !vehicleProfileModal.includes('bottomClearanceOverride={0}') &&
    !buildLoadoutModal.includes('topClearanceOverride={0}') &&
    !buildLoadoutModal.includes('bottomClearanceOverride={0}'),
  'Fleet profile and build/loadout primary sheets should fill the ECS body without covering global banners.',
);

assert(
  modalShell.includes('getShellHeaderTopPadding') &&
    modalShell.includes('ECS_TOP_SHELL_COMMAND_PILL_HEIGHT') &&
    modalShell.includes('isFullBodySheet'),
  'Shared full-height sheets should derive top clearance from ECS body/header metrics.',
);

const advancedSpecsShell = vehicleProfileModal.slice(vehicleProfileModal.indexOf('title="Advanced Specs"'));
assert(
  advancedSpecsShell.includes('maxHeightFraction={1}') &&
    advancedSpecsShell.includes('minHeightFraction={1}') &&
    !advancedSpecsShell.includes('topClearanceOverride={0}') &&
    !advancedSpecsShell.includes('bottomClearanceOverride={0}') &&
    advancedSpecsShell.includes('showHandle={false}'),
  'Fleet Advanced Specs sheet should fill the ECS body without covering global banners.',
);

assert(
  fleetScreen.includes('name="car-sport-outline"') &&
    !fleetScreen.includes('<FleetIcon size={22}'),
  'Fleet vehicle card icon should use the standard ECS icon glyph instead of the custom overland silhouette.',
);

assert(
  /hasFuelCapacity:\s*Number\(\s*resourceProfile\.fuelTankCapacityGal\s*\?\?\s*resourceProfile\.currentFuelGallons\s*\?\?\s*0,\s*\)\s*>\s*0/.test(fleetScreen),
  'Fleet readiness should treat manually entered Advanced Specs fuel gallons as valid fuel context when tank capacity is unknown.',
);

assert(
  buildLoadoutDomain.includes("id: 'cab_rack'") &&
    buildLoadoutDomain.includes('affectsPayload: false') &&
    buildLoadoutDomain.includes("scoringEffects: ['front_axle', 'top_heavy', 'aero']") &&
    buildLoadoutDomain.includes('affectsPayload: install.affectsPayload !== false'),
  'Build/loadout payload math should allow fit-reference hardware without reducing payload remaining.',
);

assert(
  !cgVisualization.includes('Attitude_Truck_Silhouette') &&
    !cgVisualization.includes('import { Image') &&
    cgVisualization.includes('TopDownVehicleFallbackProfile') &&
    cgVisualization.includes('vehicleProfileSilhouette') &&
    cgVisualization.includes('showVehicleProfile = true') &&
    weightDashboardPanel.includes('showVehicleProfile={!hideVehicleProfile}'),
  'COG visualization should use the ECS drawn top-down vehicle profile instead of a generic image asset.',
);

console.log('[fleet-ui-polish] Fleet UI polish checks passed');
