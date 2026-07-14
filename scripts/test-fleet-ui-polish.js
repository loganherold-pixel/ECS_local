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
  fleetScreen.includes('contentContainerStyle={s.fleetMainBodyContent}') &&
    fleetScreen.includes('keyboardShouldPersistTaps="handled"') &&
    fleetScreen.includes('fleetMainBodyContent: {\n    flexGrow: 1') &&
    fleetScreen.includes('fleetCardModels.length === 1 ? (') &&
    fleetScreen.includes('style={s.fleetCardSinglePage}') &&
    fleetScreen.includes('style={s.vehicleCarouselNatural}'),
  'Fleet mobile vehicle card area should scroll vertically and render a single vehicle card at natural height so bottom actions remain reachable.',
);

assert(
  !fleetScreen.includes('vehicle staged') &&
    !fleetScreen.includes('vehicles staged') &&
    !fleetScreen.includes('ECS scoring trust') &&
    !fleetScreen.includes('fleet total') &&
    !fleetScreen.includes('needs source check') &&
    !fleetScreen.includes('label="Active Vehicles"') &&
    !fleetScreen.includes('label="Avg Confidence"') &&
    !fleetScreen.includes('label="Average Confidence"') &&
    !fleetScreen.includes('label="Operating Weight"') &&
    !fleetScreen.includes('label="Verify"') &&
    !fleetScreen.includes('ANDROID QA STATE') &&
    !fleetScreen.includes('verificationHelper') &&
    fleetOverviewStatus.includes("targets.push('base weight')") &&
    fleetOverviewStatus.includes("targets.push('base estimate')") &&
    fleetOverviewStatus.includes("targets.push('GVWR')"),
  'Fleet overview header should omit noisy summary/QA tiles while Fleet domain logic still resolves real verification targets.',
);

assert(
  fleetScreen.includes('style={s.commandReadinessBadge}') &&
    fleetScreen.includes('textStyle={s.commandReadinessBadgeText}') &&
    fleetScreen.includes('commandReadinessBadge') &&
    fleetScreen.includes('minWidth: 188') &&
    fleetScreen.includes('commandStatusStack') &&
    fleetScreen.includes('maxWidth: 220') &&
    fleetScreen.includes('flexShrink: 0'),
  'Fleet Readiness Command status badge should be wide enough to show PARTIALLY CONFIGURED without clipping.',
);

assert(
    fleetScreen.includes('onConfidencePress') &&
    fleetScreen.includes('FleetConfidenceNoticeModal') &&
    fleetScreen.includes('scoreEyebrow="VEHICLE CONFIDENCE"') &&
    fleetScreen.includes('title="Vehicle Confidence"') &&
    fleetScreen.includes('const handleVehicleConfidencePress = useCallback((vehicleId: string) => {') &&
    fleetScreen.includes('setVehicleConfidenceNoticeVehicleId(vehicleId)') &&
    fleetScreen.includes('onConfidencePress={handleVehicleConfidencePress}') &&
    fleetScreen.includes('selectedVehicleConfidenceNotice') &&
    fleetScreen.includes('accessibilityHint={`Opens the confidence explanation for ${vehicle.name}.`}') &&
    fleetScreen.includes('scrollable') &&
    fleetScreen.includes('bodyStyle={s.confidenceNoticeModalBody}') &&
    fleetScreen.includes('contentContainerStyle={s.confidenceNoticeModalContent}') &&
    fleetScreen.includes('confidenceNoticeModalContent') &&
    fleetScreen.includes('paddingBottom: 18') &&
    fleetScreen.includes('ECS Intelligence') &&
    fleetScreen.includes('To Improve Confidence') &&
    fleetOverviewStatus.includes('buildFleetConfidenceNotice') &&
    fleetOverviewStatus.includes('FleetConfidenceIntelligenceInput') &&
    fleetOverviewStatus.includes('intelligenceSummary') &&
    fleetOverviewStatus.includes('incomplete accessory, loadout, consumable, or validation inputs') &&
    !fleetOverviewStatus.includes('Upgrade the user-entered'),
  'Fleet vehicle confidence action should open a scroll-safe ECS intelligence explanation with improvement actions.',
);

assert(
    fleetScreen.includes('buildFleetReadinessNotice') &&
    fleetScreen.includes('vehicleReadinessNoticeVehicleId') &&
    fleetScreen.includes('selectedVehicleReadinessNotice') &&
    fleetScreen.includes('onReadinessPress') &&
    fleetScreen.includes('const handleVehicleReadinessPress = useCallback((vehicleId: string) => {') &&
    fleetScreen.includes('setVehicleReadinessNoticeVehicleId(vehicleId)') &&
    fleetScreen.includes('onReadinessPress={handleVehicleReadinessPress}') &&
    fleetScreen.includes('accessibilityHint={`Opens the readiness explanation for ${vehicle.name}.`}') &&
    fleetScreen.includes('title="Vehicle Readiness"') &&
    fleetScreen.includes('scoreEyebrow="VEHICLE READINESS"') &&
    fleetScreen.includes('improvementTitle="To Improve Readiness"'),
  'Fleet vehicle readiness tile should open a vehicle-specific readiness explanation with score drivers and improvement actions.',
);

assert(
  fleetScreen.includes('readiness starts with payload margin') &&
    fleetScreen.includes('Source confidence is evidence quality, not a direct readiness penalty.') &&
    !fleetScreen.includes('readiness blends payload score'),
  'Fleet readiness intelligence should separate readiness score drivers from source confidence evidence quality.',
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
  vehicleProfileModal.includes("flexBasis: '48%'") &&
    vehicleProfileModal.includes('minWidth: 150') &&
    vehicleProfileModal.includes('flexShrink: 1'),
  'Fleet profile identity fields should use compact two-column wrapping where mobile width allows so Cab/Bed are not initially pushed behind the footer.',
);
assert(
  vehicleProfileModal.includes('style={styles.confirmHeaderCopy}') &&
    vehicleProfileModal.includes('confirmHeaderCopy: {\n    flex: 1,\n    minWidth: 0'),
  'Fleet profile confirm-specs confidence badge should stay inside the mobile sheet by shrinking the explanatory copy block.',
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
  vehicleProfileModal.includes('hasAppliedPrefillOption') &&
    vehicleProfileModal.includes('setHasAppliedPrefillOption(true)') &&
    vehicleProfileModal.includes('resolveFleetVehicleProfileFieldPlaceholder') &&
    vehicleProfileModal.includes("placeholder={profilePlaceholder('trim', 'Laramie')}") &&
    vehicleProfileModal.includes("placeholder={profilePlaceholder('bed', 'Short Bed')}") &&
    vehicleProfileDomain.includes('resolveFleetVehicleProfileFieldPlaceholder') &&
    vehicleProfileDomain.includes("hasAppliedPrefillOption && !value.trim() ? '' : examplePlaceholder"),
  'Fleet profile setup should blank unfilled example placeholders after an ECS vehicle pick is applied.',
);

assert(
  vehicleProfileModal.includes('maxHeightFraction={1}') &&
    vehicleProfileModal.includes('minHeightFraction={1}') &&
    vehicleProfileModal.includes('contentContainerStyle={styles.profileSheetContent}') &&
    vehicleProfileModal.includes('profileSheetContent') &&
    vehicleProfileModal.includes('paddingBottom: 28') &&
    buildLoadoutModal.includes('maxHeightFraction={1}') &&
    buildLoadoutModal.includes('minHeightFraction={1}') &&
    !vehicleProfileModal.includes('topClearanceOverride={0}') &&
    !vehicleProfileModal.includes('bottomClearanceOverride={0}') &&
    !buildLoadoutModal.includes('topClearanceOverride={0}') &&
    !buildLoadoutModal.includes('bottomClearanceOverride={0}'),
  'Fleet profile and build/loadout primary sheets should fill the ECS body without covering global banners.',
);
assert(
  modalShell.includes('footer: {\n    flexShrink: 0') &&
    modalShell.includes('scrollView: {\n    flex: 1,\n    flexShrink: 1,\n    minHeight: 0'),
  'Shared modal shell should keep fixed footers from being pushed below clipped full-height sheets.',
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

assert(
  fleetScreen.includes('transparentBackground') &&
    weightDashboardPanel.includes('transparentBackground?: boolean;') &&
    weightDashboardPanel.includes('transparentBackground = false') &&
    weightDashboardPanel.includes('transparentBackground && styles.containerTransparent') &&
    weightDashboardPanel.includes("backgroundColor: 'transparent'"),
  'Fleet Weight Summary modal should let the shared ECS popup texture remain visible behind the weight dashboard.',
);

console.log('[fleet-ui-polish] Fleet UI polish checks passed');
