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
includes('snapshot.isLive && snapshot.sourceType === \'obd_live\'', 'Vehicle Profile live state must be OBD2-source aware.');
includes('snapshot.sourceType !== \'simulated\'', 'Vehicle Profile must not present simulated telemetry as live OBD2 data.');

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
includes('rollDeg={commandStageRollDeg}', 'Vehicle Profile roll strip must use the command-stage roll value.');
includes('pitchDeg={commandStagePitchDeg}', 'Vehicle Profile roll strip must use command-stage pitch as background campsite-level input.');
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

includes('onPress={() => openFocusPanel(\'vehicle\')}', 'Vehicle Profile card must remain tappable.');
includes('accessibilityLabel="Open vehicle profile details"', 'Vehicle Profile tap target must remain accessible.');
includes('activePanel === \'vehicle\'', 'Vehicle Profile must open through the existing expanded focus panel.');
includes('<VehicleCommandExpandedView', 'Vehicle Profile focus panel must render the expanded Vehicle Command view.');
includes("return { title: 'Vehicle Command'", 'Vehicle focus panel should open as Vehicle Command.');
includes('title={isSunlightPanel || isVehiclePanel ? undefined : eyebrow}', 'Compact Vehicle Profile should suppress the panel title/header copy.');
includes('icon={icon && !isPowerPanel && !isVehiclePanel ?', 'Compact Vehicle Profile should suppress the old header icon slot so telemetry corners can sit at the top.');

for (const section of [
  'Engine Overview',
  'Voltage & Electrical',
  'System Health',
  'Temperatures',
  'Diagnostics',
]) {
  includes(`title="${section}"`, `Vehicle Command view must include ${section}.`);
}
includes('<VehicleCommandDetailSection title="Engine Overview" defaultExpanded>', 'Engine Overview should default open.');
includes('accessibilityState={{ expanded }}', 'Vehicle Command sections must expose collapsed/expanded state.');
includes('chevron-up-outline', 'Vehicle Command sections should show an expanded affordance.');
includes('chevron-down-outline', 'Vehicle Command sections should show a collapsed affordance.');
notIncludes('title="Vehicle Profile"', 'Expanded Vehicle Command should not include the old Vehicle Profile section.');

for (const rowLabel of [
  'RPM',
  'Speed',
  'Engine load',
  'Throttle position',
  'Coolant temperature',
  'Control module voltage',
  'Charging/voltage state',
  'Voltage trend',
  'Low-voltage warning state',
  'MIL/check-engine status',
  'Readiness monitor summary',
  'Fuel system status',
  'Sensor/ECU health summary',
  'Intake air temperature',
  'Transmission temperature',
  'Catalyst temperature',
  'Active DTCs',
  'Pending DTCs',
  'Stored DTCs',
  'Freeze-frame availability',
  'I/M readiness state',
]) {
  includes(`label="${rowLabel}"`, `Vehicle Command view must include row ${rowLabel}.`);
}

includes('No active vehicle profile or live telemetry is available', 'Vehicle Command view must keep the no-source empty state.');
includes('Connected - waiting for readable OBD2 PIDs', 'Vehicle Command view must show a connected-but-not-decoded state.');
includes('Not reported by current PID set', 'Vehicle Command view must distinguish unsupported/missing PIDs.');
includes('ECS is showing profile safe fallbacks if configured and available.', 'Vehicle Command unavailable banner must use profile safe fallback copy.');
notIncludes('VehicleCommandRive', 'Vehicle Command must not add a Rive dependency.');
notIncludes('VehicleProfileRive', 'Vehicle Profile must not add a Rive dependency.');

[
  "const DEFAULT_MAX_ROLL_DEG = 45",
  "const CAMPSITE_LEVEL_TOLERANCE_DEG = 1",
  "const TICK_STEP_DEG = 5",
  "for (let value = -safeMaxRoll; value <= safeMaxRoll; value += TICK_STEP_DEG)",
  "ROLL",
  "vehicle-profile-roll-attitude-strip",
  "accessibilityLabel={`Vehicle roll monitor.",
  "LinearGradient",
  "vehicle-roll-active-gradient",
  "const campsiteLevel = isRollLevel && isPitchLevel",
  "CampSite",
  "campsiteStatusLine",
  "x1={markerX}",
  "y1={4}",
  "y1={33}",
  "left: 13",
  "right: 13",
  "top: '50%'",
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
