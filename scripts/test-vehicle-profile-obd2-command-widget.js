/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetRenderers = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'),
  'utf8',
);
const rollStripSource = fs.readFileSync(
  path.join(root, 'components', 'dashboard', 'VehicleProfileRollAttitudeStrip.tsx'),
  'utf8',
);

function includes(fragment, message) {
  assert.ok(widgetRenderers.includes(fragment), message);
}

function notIncludes(fragment, message) {
  assert.ok(!widgetRenderers.includes(fragment), message);
}

includes('const vehicleTelemetry = useVehicleTelemetry();', 'Vehicle Profile must consume the existing vehicle telemetry hook.');
includes('resolveVehicleCommandQuickGlance(activeVehicleContext, vehicleTelemetry)', 'Vehicle Profile must derive compact OBD2 quick-glance values.');
includes('function isLiveVehicleCommandTelemetry(', 'Vehicle Profile must centralize live-only OBD2 eligibility.');
includes("snapshot.sourceType === 'obd_live'", 'Vehicle Profile live state must be OBD2-source aware.');
includes("snapshot.sourceType !== 'simulated'", 'Vehicle Profile must not present simulated telemetry as live OBD2 data.');
includes('function resolveVehicleCommandLiveFuelGallons(', 'Vehicle expanded view must derive fuel gallons through a live-only helper.');
includes('resolveVehicleCommandLiveFuelGallons(activeVehicleContext, vehicleTelemetry)', 'Vehicle expanded view must use the live-only fuel gallons resolver.');
includes('raw.fuel_remaining_gallons', 'Vehicle live fuel gallons should support explicit adapter fuel-gallon payloads.');

includes('VEHICLE_COMMAND_VOLTAGE_FALLBACK = \'--.-V\'', 'Voltage fallback must render as --.-V.');
includes('VEHICLE_COMMAND_LOAD_FALLBACK = \'--% LOAD\'', 'Engine load fallback must render as --% LOAD.');
includes('VEHICLE_COMMAND_RANGE_FUEL_FALLBACK = \'-- mi (--.- gal)\'', 'Range/fuel fallback must render as -- mi (--.- gal).');
includes('VEHICLE_COMMAND_OBD2_OFFLINE_LABEL = \'OBD2 offline\'', 'Compact Vehicle Profile must label missing live OBD2 data as offline.');
includes('formatVehicleCommandVoltage', 'Vehicle Profile must format compact voltage.');
includes('formatVehicleCommandCoolantTemperature', 'Vehicle Profile must format compact coolant temperature.');
includes('formatVehicleCommandEngineLoad', 'Vehicle Profile must format compact engine load.');
includes('formatVehicleCommandRangeFuel', 'Vehicle Profile must format compact range and fuel.');
includes('resolveVehicleCommandRangeMiles', 'Vehicle Profile must calculate range only through the shared safe resolver.');
includes('resolveVehicleCommandFuelGallons', 'Vehicle Profile must derive gallons without assuming every vehicle exposes range.');
includes('resolveVehicleCommandTelemetryMpg', 'Vehicle Profile must prefer live telemetry MPG/fuel-rate data before profile fallbacks.');
includes('raw.fuel_rate', 'Vehicle Profile range calculation must support OBD2 fuel-rate telemetry.');
includes('fuelGallons * telemetryMpg', 'Vehicle Profile range must calculate miles to empty from remaining gallons and telemetry MPG.');

notIncludes('vehicleCommandStatusChip', 'Compact Vehicle Profile should not render the old OBD2/live status pill.');
includes('vehicleCommandVoltageCorner', 'Top-right compact voltage corner must exist.');
includes('vehicleCommandCoolantCorner', 'Top-left compact coolant corner must exist.');
includes('vehicleCommandLoadCorner', 'Bottom-right compact engine-load corner must exist.');
includes('vehicleCommandRangeCorner', 'Bottom-left compact range/fuel corner must exist.');
includes("import VehicleProfileRollAttitudeStrip from './VehicleProfileRollAttitudeStrip';", 'Vehicle Profile must import the centered roll attitude strip.');
includes('<VehicleProfileRollAttitudeStrip', 'Vehicle Profile must render the centered roll attitude strip.');
includes('rollDeg={commandVehicleRollDeg}', 'Vehicle Profile roll strip must use the roll-zero-adjusted vehicle roll value.');
includes('pitchDeg={commandVehiclePitchDeg}', 'Vehicle Profile roll strip must use unchanged command-stage pitch as background campsite-level input.');
includes('maxRollDeg={45}', 'Vehicle Profile roll strip must clamp visual travel to +/-45 degrees.');
notIncludes('VEHICLE_PROFILE_BRIGHTNESS_WASH', 'Vehicle Profile should not apply the removed bright image wash.');
notIncludes('vehicleProfileBrightnessWash', 'Vehicle Profile should not render a dedicated brightness wash above the image.');
includes('VEHICLE_PROFILE_BALANCED_SCRIM', 'Vehicle Profile should use a balanced scrim instead of a heavy dark overlay.');
includes('vehicleVisual.hasObd2CommandTelemetry', 'Compact card must gate sensor values behind live OBD2 telemetry.');
includes('{vehicleVisual.obd2OfflineCorner}', 'Compact card must explain absent sensor values as OBD2 offline.');
includes('{vehicleVisual.coolantTempCorner}', 'Compact card must render coolant temperature from vehicleVisual.');
includes('{vehicleVisual.voltageCorner}', 'Compact card must render voltage from vehicleVisual.');
includes('{vehicleVisual.engineLoadCorner}', 'Compact card must render engine load from vehicleVisual.');
includes('{vehicleVisual.rangeFuelCorner}', 'Compact card must render range/fuel from vehicleVisual.');
notIncludes('{vehicleVisual.statusChip}', 'Compact card should not render the old status chip from vehicleVisual.');
notIncludes('{vehicleVisual.name}', 'Compact card should not render the vehicle nickname/name over the vehicle image.');
notIncludes('vehicleBaseIdentityBlock', 'Compact card should not keep the old centered vehicle title container.');

includes("onPress={expanded ? undefined : () => openFocusPanel('vehicle', 'detail')}", 'Vehicle Profile card must open detail on tap.');
includes("accessibilityLabel={expanded ? 'Vehicle profile expanded' : 'Expand vehicle profile'}", 'Vehicle Profile tap target must remain accessible.');
includes('setActivePanel({ panel, mode });', 'Vehicle Profile must use the shared explicit expanded focus panel state.');
includes('renderCommandPanel(activePanel.panel, true, expandedPanelMode)', 'Vehicle Profile must expand by rendering the selected command panel inline over the map.');
includes('expanded && isVehiclePanel && attitudeCommandS.vehiclePanelContentExpanded', 'Vehicle Profile expanded mode must scale the live roll surface inside the enlarged widget.');
includes('vehicleRollZeroOffsetDeg', 'Vehicle Profile must keep a roll-only zero offset for the compact and expanded roll monitor.');
includes('const commandVehicleRollDeg = commandStageRollDeg - vehicleRollZeroOffsetDeg;', 'Vehicle Profile must apply the zero offset to roll only.');
includes('const commandVehiclePitchDeg = commandStagePitchDeg;', 'Vehicle Profile zero control must leave pitch untouched.');
includes('handleZeroVehicleRoll', 'Vehicle Profile must expose a zero-roll handler.');
includes('setVehicleRollZeroOffsetDeg(commandStageRollDeg);', 'Vehicle Profile zero control must capture the current roll as the new zero.');
includes('VehicleCommandRollZeroButton', 'Vehicle Profile must render a reusable zero-roll button.');
includes('vehicleRollZeroButtonCompact', 'Regular Vehicle Profile widget must position the zero button in the top-left corner.');
includes('vehicleRollZeroButtonExpanded', 'Expanded Vehicle Profile widget must place the zero button beside the close control.');
includes("accessibilityLabel=\"Zero vehicle roll indicator\"", 'Vehicle Profile zero button must be accessible.');
includes('event.stopPropagation();', 'Vehicle Profile zero button must stop the compact card press from opening expanded detail.');
includes('activePanel?.panel === \'vehicle\'', 'Expanded zero button must only show for the Vehicle Profile panel.');

for (const rowLabel of [
  'RPM',
  'Miles per hour',
  'Engine load',
  'Coolant temperature',
  'Battery voltage',
  'Water / fluid',
  'Propane / butane',
  'Fuel gallons',
]) {
  includes(rowLabel, `Vehicle live command view must include ${rowLabel}.`);
}

const vehicleDetailBlock = widgetRenderers.match(/function VehicleCommandExpandedView\([\s\S]*?\n}\n\nfunction VehicleCommandLiveMetric/)?.[0] ?? '';
assert.ok(vehicleDetailBlock, 'VehicleCommandExpandedView block should be discoverable.');
[
  'vehicleLiveFixedDetailSurface',
  'vehicleLiveHeader',
  'vehicleLiveEngineGrid',
  'vehicleLiveLiquidGrid',
  'vehicleLiveRollDock',
  'isLiveVehicleCommandTelemetry(snapshot)',
  'utilitySensorResources.water?.status === \'live\'',
  'utilitySensorResources.propane?.status === \'live\'',
  'liveWaterPercent',
  'Math.round(liveWaterPercent)',
  'hasLiveVehicleCommandData',
  '<VehicleProfileRollAttitudeStrip',
  'rollDeg={rollDeg}',
  'pitchDeg={pitchDeg}',
  'live={attitudeLive}',
  'docked',
].forEach((fragment) => {
  assert.ok(vehicleDetailBlock.includes(fragment), `Vehicle expanded live surface must include ${fragment}.`);
});

assert.ok(!vehicleDetailBlock.includes('vehicleLiveSourcePill'), 'Vehicle expanded live surface must not render the old LIVE source pill behind the close button.');
assert.ok(!vehicleDetailBlock.includes('vehicleLiveSourcePillText'), 'Vehicle expanded live surface must not render the old LIVE source pill text behind the close button.');

[
  'formatUtilitySensorDepth',
  'liveWaterDepth',
  'livePropaneDepth',
  'levelDistanceMm / 10',
  'depth ${(state.levelDistanceMm / 10).toFixed(1)} cm',
].forEach((fragment) => {
  assert.ok(!vehicleDetailBlock.includes(fragment), `Vehicle expanded live surface must not display utility depth fallback ${fragment}.`);
});

[
  '<AttitudeCommandDetailScroll>',
  '<VehicleCommandDetailSection',
  'Manual/Fleet fallback',
  'Manual water entry',
  'Fleet selected vehicle/build fallback',
  'ECS is showing profile safe fallbacks',
  'No active vehicle profile or live telemetry is available',
].forEach((fragment) => {
  assert.ok(!vehicleDetailBlock.includes(fragment), `Vehicle expanded live surface must not include fallback/scroll content: ${fragment}.`);
});

[
  "const DEFAULT_MAX_ROLL_DEG = 45",
  "const CAMPSITE_LEVEL_TOLERANCE_DEG = 2",
  "const TICK_STEP_DEG = 5",
  "for (let value = -safeMaxRoll; value <= safeMaxRoll; value += TICK_STEP_DEG)",
  "ROLL",
  "vehicle-profile-roll-attitude-strip",
  "accessibilityLabel={`Vehicle roll monitor.",
  "LinearGradient",
  "vehicle-roll-active-gradient",
  "const campsiteLevel = isRollLevel && isPitchLevel",
  "CAMPSITE",
  "campsiteStatusLine",
  "x1={markerX}",
  "y1={4}",
  "y1={33}",
  "left: 13",
  "right: 13",
  "top: '50%'",
  "docked?: boolean",
  "containerDocked",
  "containerDockedExpanded",
].forEach((fragment) => {
  assert.ok(rollStripSource.includes(fragment), `Roll attitude strip must include ${fragment}.`);
});

[
  "borderWidth: 1",
  "borderColor: 'rgba(245, 199, 73, 0.16)'",
  "backgroundColor: 'rgba(2, 5, 7, 0.42)'",
].forEach((fragment) => {
  assert.ok(!rollStripSource.includes(fragment), `Roll attitude strip must not retain its inner container frame: ${fragment}.`);
});

console.log('Vehicle Profile OBD2 command widget checks passed.');
