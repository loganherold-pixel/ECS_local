/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const stagePath = path.join(root, 'src', 'features', 'attitude', 'components', 'VehicleAttitudeStage.tsx');
assert.ok(fs.existsSync(stagePath), 'VehicleAttitudeStage shared component should exist.');
const stageCssPath = path.join(root, 'src', 'features', 'attitude', 'components', 'VehicleAttitudeStage.module.css');
assert.ok(fs.existsSync(stageCssPath), 'VehicleAttitudeStage scoped CSS module should exist.');

const manifest = read('src/features/attitude/vehicleAttitudeAssetManifest.ts');
const registry = read('src/features/attitude/vehicleAttitudeAssets.ts');
const tuning = read('src/features/attitude/vehicleAttitudeTuning.ts');
const orientation = read('src/features/attitude/attitudeOrientation.ts');
const surface = read('components/attitude/AttitudeMonitorSurface.tsx');
const expanded = read('components/attitude/AttitudeMonitorExpandedView.tsx');
const stage = read('src/features/attitude/components/VehicleAttitudeStage.tsx');
const vehicleImageStyle = stage.match(/vehicleImage:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? '';
const stageCss = read('src/features/attitude/components/VehicleAttitudeStage.module.css');
const liveHashOverlay = read('src/features/attitude/components/AttitudeLiveHashOverlay.tsx');
const readout = read('src/components/attitudeCommand/AttitudeReadout.tsx');
const hud = read('components/attitude/VehicleAttitudeHud.tsx');
const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const detailWidget = read('components/detail/AttitudeMonitorWidget.tsx');
const deviceAttitudeTelemetry = read('lib/deviceAttitudeTelemetry.ts');
const displayStateHook = read('lib/useAttitudeMonitorDisplayState.ts');
const widgetGrid = read('components/dashboard/WidgetGrid.tsx');

assert.ok(
  manifest.includes('VEHICLE_ATTITUDE_ASSET_MANIFEST') &&
    manifest.includes('sourceFilename') &&
    manifest.includes('attitudeImageSrc') &&
    manifest.includes('attitudeImageSource'),
  'Manifest should be the single source for exact composite image filenames.',
);
assert.ok(
  registry.includes('VEHICLE_ATTITUDE_ASSETS') &&
    registry.includes('DEFAULT_ATTITUDE_GEOMETRY') &&
    registry.includes('Object.entries(VEHICLE_ATTITUDE_ASSET_MANIFEST)') &&
    registry.includes('aspectRatio: 1753 / 1024') &&
    registry.includes('viewBox: { width: 1753, height: 1024 }') &&
    registry.includes('ATTITUDE_READOUT_ANCHORS') &&
    registry.includes('y: 770') &&
    registry.includes('ZERO_BUTTON_NUDGE_X') &&
    registry.includes('x: 876.5 + ZERO_BUTTON_NUDGE_X') &&
    registry.includes('pitchPanel:') &&
    registry.includes('rollPanel:') &&
    registry.includes('zeroButtonAnchor:'),
  'Registry should combine the manifest with shared attitude geometry and bottom readout anchors.',
);
assert.ok(
  tuning.includes('export const DEFAULT_MAX_PITCH_DEG = 30') &&
    tuning.includes('export const DEFAULT_MAX_ROLL_DEG = 30') &&
    tuning.includes('export const DEFAULT_TICK_TRAVEL_Y = 170') &&
    tuning.includes('export const DEFAULT_INDICATOR_TRAVEL_Y = 170') &&
    tuning.includes('export const HORIZON_Y = 512') &&
    tuning.includes('export const PITCH_UI_SIGN = -1') &&
    tuning.includes('export const ROLL_UI_SIGN = -1') &&
    tuning.includes('export const PITCH_FRONT_UI_SIGN = -1') &&
    tuning.includes('export const PITCH_REAR_UI_SIGN = 1') &&
    tuning.includes('export const ROLL_LEFT_UI_SIGN = -1') &&
    tuning.includes('export const ROLL_RIGHT_UI_SIGN = 1') &&
    tuning.includes('export const LANDSCAPE_LEFT_SIGN = 1') &&
    tuning.includes('export const LANDSCAPE_RIGHT_SIGN = 1') &&
    tuning.includes('export function clamp') &&
    tuning.includes('export function safeDeg'),
  'Shared attitude tuning should centralize safe math, sign, and indicator travel constants.',
);
assert.ok(
  orientation.includes("export type EcsScreenOrientation") &&
    orientation.includes("export type AttitudeTelemetryFrame = 'vehicle' | 'screen' | 'device'") &&
    orientation.includes('export function mapScreenAttitudeToVehicleAttitude') &&
    orientation.includes('export function mapAttitudeInputForTelemetryFrame') &&
    orientation.includes("case 'landscapeLeft'") &&
    orientation.includes("case 'landscapeRight'") &&
    orientation.includes('useEcsScreenOrientation') &&
    orientation.includes('useWindowDimensions'),
  'Orientation utilities should compensate screen/device-frame attitude without changing vehicle-frame telemetry.',
);

assert.ok(
  surface.includes("VehicleAttitudeStage from '../../src/features/attitude/components/VehicleAttitudeStage'"),
  'AttitudeMonitorSurface should import the shared VehicleAttitudeStage.',
);
assert.ok(
  surface.includes('vehicleId?: string | null') &&
    surface.includes('telemetryFrame?: AttitudeTelemetryFrame') &&
    surface.includes('<VehicleAttitudeStage') &&
    surface.includes('vehicleId={resolvedVehicleId}') &&
    surface.includes('telemetryFrame={telemetryFrame}') &&
    surface.includes('onZero={live ? onCalibrate ?? undefined : undefined}') &&
    surface.includes('onResetZero={live ? onResetCalibration ?? undefined : undefined}'),
  'AttitudeMonitorSurface should pass vehicleId into VehicleAttitudeStage and keep zero controls wired.',
);
assert.ok(
  !surface.includes('sideAsset=') &&
    !surface.includes('rearAsset=') &&
    !surface.includes('attitudeAssets.sideAsset') &&
    !surface.includes('attitudeAssets.rearAsset'),
  'AttitudeMonitorSurface must not pass old side/rear image assets.',
);
assert.ok(
  !surface.includes('AttitudeMonitorBackgroundLayer') &&
    !surface.includes('getAttitudeMonitorBackgroundPresentation'),
  'AttitudeMonitorSurface must not layer legacy monitor backgrounds over the baked composite attitude images.',
);

assert.ok(
  expanded.includes('vehicleId?: string | null') &&
    expanded.includes('vehicleId={vehicleId ?? heroVehicle?.attitudeVehicleId}'),
  'Expanded attitude view should pass vehicleId through to the shared surface.',
);
assert.ok(
  detailWidget.includes('useActiveAttitudeMonitorVehicleId()') &&
    detailWidget.includes('vehicleId={attitudeVehicleId}') &&
    !detailWidget.includes('heroVehicle='),
  'AttitudeMonitorWidget should resolve only a vehicleId before rendering.',
);
assert.ok(
    widgetRenderers.includes('const AttitudeCommandWidget') &&
    widgetRenderers.includes('normalizeDeviceAttitudeTelemetry') &&
    widgetRenderers.includes('useDashboardActiveVehicleContext') &&
    widgetRenderers.includes('resolveAttitudeMonitorVehicleId(activeVehicleContext)') &&
    widgetRenderers.includes('vehicleId={attitudeVehicleId}') &&
    widgetRenderers.includes('telemetryFrame="device"') &&
    widgetRenderers.includes('showLiveHashIndicators={sensorLive}') &&
    widgetRenderers.includes('showReadouts={sensorLive}') &&
    widgetRenderers.includes('showLiveHashIndicators={false}') &&
    widgetRenderers.includes('showGaugeOverlay') &&
    widgetRenderers.includes('showReadouts={false}') &&
    widgetRenderers.includes('showDegreeReadouts={false}') &&
    widgetRenderers.includes('showLevelReadout={false}') &&
    widgetRenderers.includes('showZeroButton={false}') &&
    !widgetRenderers.includes('heroVehicle={heroVisual}'),
  'Dashboard Attitude Monitor should animate live device samples, while Attitude Command center mode should keep the active Fleet vehicle rings mounted without legacy hash/readout overlays.',
);
assert.ok(
  deviceAttitudeTelemetry.includes("sourceType: 'device_attitude'") &&
    deviceAttitudeTelemetry.includes('Device Attitude Live') &&
    deviceAttitudeTelemetry.includes('Device Attitude Recent') &&
    deviceAttitudeTelemetry.includes("sourceLabel: 'Stale'") &&
    deviceAttitudeTelemetry.includes("sourceLabel: 'Unavailable'") &&
    deviceAttitudeTelemetry.includes("displayHealth: 'recent'") &&
    !deviceAttitudeTelemetry.includes('OBD'),
  'Device attitude telemetry normalizer should expose truthful live/recent/stale/unavailable labels without OBD wording.',
);
assert.ok(
  displayStateHook.includes("liveMotion: telemetryHealth === 'live'") &&
    displayStateHook.includes("telemetryHealth === 'recent'") &&
    displayStateHook.includes('sourceLabelOverride') &&
    displayStateHook.includes('sourceStatusLineOverride'),
  'Attitude display state should distinguish recent/stale source copy from live stage motion.',
);
assert.ok(
  surface.includes('showLiveHashIndicators={live}') &&
    surface.includes('showReadouts={live}') &&
    surface.includes('showZeroButton={live}'),
  'Expanded attitude surface should hide live hash movement, readouts, and zero controls when device attitude is not live.',
);
assert.ok(
  detailWidget.includes('normalizeDeviceAttitudeTelemetry') &&
    detailWidget.includes('sourceLabelOverride: attitudeTelemetry.sourceLabel'),
  'Detail attitude widget should share the normalized device attitude source contract.',
);
assert.ok(
  widgetGrid.includes('rollDeg: rollDeg ?? null') &&
    widgetGrid.includes('pitchDeg: pitchDeg ?? null'),
  'Dashboard grid should not synthesize zero-degree attitude samples when telemetry is missing.',
);

assert.ok(stage.includes('export type VehicleAttitudeStageProps'), 'VehicleAttitudeStage should export the shared props type.');
assert.ok(stage.includes('vehicleId: string'), 'VehicleAttitudeStage should receive vehicleId.');
assert.ok(stage.includes("mode?: 'monitor' | 'command'"), 'VehicleAttitudeStage should support monitor and command modes.');
assert.ok(stage.includes('telemetryFrame?: AttitudeTelemetryFrame'), 'VehicleAttitudeStage should accept a telemetry frame source.');
assert.ok(stage.includes('screenOrientation?: EcsScreenOrientation'), 'VehicleAttitudeStage should accept an explicit screen orientation override.');
assert.ok(stage.includes("fitMode?: 'contain' | 'cover'"), 'VehicleAttitudeStage should let command surfaces opt into background-style cover fitting.');
assert.ok(stage.includes('showReadouts?: boolean'), 'VehicleAttitudeStage should allow monitor/command callers to toggle degree readouts.');
assert.ok(stage.includes('showGaugeOverlay?: boolean'), 'VehicleAttitudeStage should allow command callers to keep the Rive rings mounted without legacy readouts.');
assert.ok(stage.includes('showDegreeReadouts?: boolean'), 'VehicleAttitudeStage should allow command callers to hide bottom degree readouts independently.');
assert.ok(stage.includes('showLevelReadout?: boolean'), 'VehicleAttitudeStage should allow command callers to hide the lean/incline readout independently.');
assert.ok(stage.includes('showZeroButton?: boolean'), 'VehicleAttitudeStage should allow monitor/command callers to toggle the Zero button.');
assert.ok(stage.includes('showLiveHashIndicators?: boolean'), 'VehicleAttitudeStage should allow monitor/command callers to toggle live hash indicators.');
assert.ok(stage.includes('className?: string'), 'VehicleAttitudeStage should accept className.');
assert.ok(stage.includes('children?: React.ReactNode'), 'VehicleAttitudeStage should accept widget-specific children.');
assert.ok(stage.includes('getVehicleAttitudeAsset(vehicleId)'), 'VehicleAttitudeStage should load images from the shared registry.');
assert.ok(stage.includes('testID="vehicle-attitude-stage"'), 'VehicleAttitudeStage should expose a stable root test id.');
assert.ok(stage.includes('testID="vehicle-attitude-stage-image"'), 'VehicleAttitudeStage should render the composite vehicle attitude image.');
assert.ok(stage.includes('source={asset.attitudeImageSource}'), 'VehicleAttitudeStage should render the manifest-provided composite source.');
assert.ok(
  stage.includes('resizeMode="contain"') &&
    stage.includes('fitStageToContainer') &&
    stage.includes("fitMode: 'contain' | 'cover' = 'contain'") &&
    stage.includes('onLayout={handleLayout}'),
  'VehicleAttitudeStage should center the full composite with aspect-fit behavior by default and support cover fitting for command panels.',
);
assert.ok(stage.includes('pointerEvents="none"'), 'VehicleAttitudeStage image/passive overlays should not block widget controls.');
assert.ok(stage.includes('const imageAspect = asset.aspectRatio'), 'VehicleAttitudeStage should size from registry aspect ratio.');
assert.ok(
  stage.includes('function DegreeReadout') &&
    stage.includes('<AttitudeReadout') &&
    stage.includes('AttitudeLiveHashOverlay') &&
    stage.includes('mapAttitudeInputForTelemetryFrame') &&
    stage.includes('{renderGaugeOverlay ? (') &&
    stage.includes('{renderDegreeReadouts ? (') &&
    stage.includes('{renderLevelReadout ? (') &&
    stage.includes('{showLiveHashIndicators ? (') &&
    stage.includes('valueDeg={safePitch}') &&
    stage.includes('valueDeg={safeRoll}') &&
    stage.includes('pitchDeg={safePitch}') &&
    stage.includes('rollDeg={safeRoll}'),
  'VehicleAttitudeStage should orientation-compensate values before degree readouts and live hash indicators.',
);
assert.ok(
  liveHashOverlay.includes("import Svg, { Defs, FeDropShadow, Filter, G, Line } from 'react-native-svg'") &&
    liveHashOverlay.includes('viewBox="0 0 1753 1024"') &&
    liveHashOverlay.includes('preserveAspectRatio="xMidYMid meet"') &&
    liveHashOverlay.includes('vehicle-attitude-live-hash-overlay') &&
    liveHashOverlay.includes('vehicle-attitude-live-hash-${id}') &&
    liveHashOverlay.includes('LIVE_HASH_TRACKS') &&
    liveHashOverlay.includes('getTrackPoint') &&
    liveHashOverlay.includes('PITCH_FRONT_UI_SIGN') &&
    liveHashOverlay.includes('PITCH_REAR_UI_SIGN') &&
    liveHashOverlay.includes('ROLL_LEFT_UI_SIGN') &&
    liveHashOverlay.includes('ROLL_RIGHT_UI_SIGN') &&
    liveHashOverlay.includes('Filter id="vehicle-attitude-live-hash-glow"') &&
    liveHashOverlay.includes('pointerEvents="none"') &&
    liveHashOverlay.includes('transitionDuration'),
  'AttitudeLiveHashOverlay should render four non-interactive glowing hash indicators on tunable curved tracks.',
);
assert.ok(
  !stage.includes('CurvedTickStrip') &&
    !stage.includes('tickSegments') &&
    !stage.includes('vehicle-attitude-live-tick-strip'),
  'VehicleAttitudeStage must not redraw the baked teal tick scale in runtime SVG.',
);
assert.ok(
  stage.includes('The active Fleet vehicle controls this composite artwork') &&
    liveHashOverlay.includes('useMemo') &&
    liveHashOverlay.includes('reducedMotion') &&
    liveHashOverlay.includes('transitionStyle'),
  'VehicleAttitudeStage should document active vehicle-controlled artwork while the hash overlay memoizes track positions and respects reduced motion.',
);
assert.ok(
  stage.includes('formatStageDegrees') &&
    stage.includes('label={axis.toUpperCase()}') &&
    stage.includes('valueDeg={valueDeg}') &&
    stage.includes('styles.degreeReadout') &&
    readout.includes('testID={testIdBase}') &&
    readout.includes('numberOfLines={1}') &&
    readout.includes('adjustsFontSizeToFit'),
  'Degree readouts should update from calibrated attitude values and fit their overlay bounds.',
);
assert.ok(
  !stage.includes('sideAsset') &&
    !stage.includes('rearAsset') &&
    !stage.includes('vehicleProfile="side"') &&
    !stage.includes('vehicleProfile="rear"') &&
    !stage.includes('function ArcSide') &&
    !stage.includes('styles.arcOval') &&
    !stage.includes('ImageBackground') &&
    !stage.includes('source={asset}'),
  'VehicleAttitudeStage should not reconstruct separate side/rear vehicles or bracket artwork in code.',
);
assert.ok(
  vehicleImageStyle &&
    !vehicleImageStyle.includes('rotate: roll') &&
    !vehicleImageStyle.includes('rotate: pitch') &&
    !vehicleImageStyle.includes('transform') &&
    !vehicleImageStyle.includes('{ scale: imageScale'),
  'Vehicle image should remain static; only overlays may update.',
);
assert.ok(
  stage.includes("accessibilityLabel=\"Zero attitude\"") &&
    stage.includes('onLongPress={handleResetZero}') &&
    stage.includes("setConfirmationLabel('Reset')"),
  'Shared stage should preserve zero calibration and reset behavior.',
);
assert.ok(
  stage.includes('toStagePoint') &&
    stage.includes('asset.viewBox.width') &&
    stage.includes('asset.viewBox.height') &&
    stage.includes('asset.pitchPanel.labelX') &&
    stage.includes('asset.rollPanel.labelX') &&
    stage.includes('asset.zeroButtonAnchor') &&
    stage.includes('testID="vehicle-attitude-zero-control"'),
  'VehicleAttitudeStage overlay positioning should be driven by shared viewBox geometry and measured bounds.',
);
assert.ok(
  hud.includes('VehicleAttitudeStage') &&
    hud.includes('vehicleId={geometry.vehicleId}') &&
    hud.includes('telemetryFrame="vehicle"') &&
    hud.includes('onZero={onCalibrate}'),
  'Legacy VehicleAttitudeHud should delegate to VehicleAttitudeStage.',
);
assert.ok(
  stageCss.includes('.attitudeStage') &&
    stageCss.includes('aspect-ratio: var(--attitude-aspect-ratio') &&
    stageCss.includes('object-fit: contain') &&
    stageCss.includes('isolation: isolate') &&
    stageCss.includes('.attitudeImage') &&
    stageCss.includes('pointer-events: none') &&
    stageCss.includes('z-index: 0') &&
    stageCss.includes('.attitudeSvgOverlay') &&
    stageCss.includes('z-index: 1') &&
    stageCss.includes('.attitudeReadout') &&
    stageCss.includes('z-index: 2') &&
    stageCss.includes('.zeroButton') &&
    stageCss.includes('pointer-events: auto') &&
    stageCss.includes('z-index: 3') &&
    stageCss.includes('.childrenLayer') &&
    stageCss.includes('z-index: 4'),
  'VehicleAttitudeStage CSS module should preserve scoped aspect, layering, and pointer-event behavior.',
);

console.log('Shared composite vehicle attitude HUD regression checks passed.');
