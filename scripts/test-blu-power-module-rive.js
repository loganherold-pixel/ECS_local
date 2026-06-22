const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mapperSource = fs.readFileSync(path.join(root, 'lib/bluPowerModuleRive.ts'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'lib/powerModuleRiveTelemetry.ts'), 'utf8');
const webComponentSource = fs.readFileSync(path.join(root, 'components/dashboard/PowerModuleRiveWidget.tsx'), 'utf8');
const nativeComponentSource = fs.readFileSync(path.join(root, 'components/dashboard/PowerModuleRiveWidget.native.tsx'), 'utf8');
const fallbackComponentSource = fs.readFileSync(path.join(root, 'components/dashboard/BluPowerModuleFallback.tsx'), 'utf8');
const powerWidgetSource = fs.readFileSync(path.join(root, 'components/dashboard/PowerSystemWidget.tsx'), 'utf8');
const widgetRenderers = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const powerManagementVisualBlock = widgetRenderers.match(/function AttitudeCommandPowerManagementVisual\([\s\S]*?\r?\n}\r?\n\r?\nfunction AttitudeCommandTerrainRiskBackgroundVisual/)?.[0] ?? '';
const powerCommandPanelBlock = widgetRenderers.match(/case 'power':[\s\S]*?default:/)?.[0] ?? '';
const metroConfig = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) {
    console.error(`[blu-power-module-rive] ${message}`);
    process.exit(1);
  }
}

assert(
  fs.existsSync(path.join(root, 'assets/power/blu_power_module.riv')),
  'blu_power_module.riv must be bundled under assets/power.',
);
assert(
  fs.existsSync(path.join(root, 'public/rive/blu_power_module.riv')),
  'blu_power_module.riv must also be available under public/rive for web static serving fallback.',
);

for (const token of [
  "BLU_POWER_MODULE_ARTBOARD = 'Desktop - 1'",
  "BLU_POWER_MODULE_STATE_MACHINE = 'powermanagement_sm'",
  "BLU_POWER_MODULE_VIEW_MODEL = 'PowerWidgetVM'",
  "BLU_POWER_MODULE_VIEW_MODEL_INSTANCE = 'Instance'",
  'BLU_POWER_MODULE_VIEW_MODEL_NUMERIC_PROPERTIES',
  'shouldAnimateBluPowerModuleRuntime',
  'offlinestatusopacity',
  'batteryPercent',
  'leftflowopacity',
  'rightflowopacity',
  'Math.max(0, Math.min(100, Math.round(value)))',
]) {
  assert(mapperSource.includes(token), `Runtime mapper is missing ${token}.`);
}

assert(
  !mapperSource.includes('offlineopacity') && !mapperSource.includes('stringProperty'),
  'Runtime mapper must match the inspected PowerWidgetVM numeric surface and avoid obsolete/string view-model properties.',
);

assert(
  webComponentSource.includes("require('../../assets/power/blu_power_module.riv')") &&
    webComponentSource.includes("const PUBLIC_RIVE_SRC = '/rive/blu_power_module.riv'") &&
    webComponentSource.includes('Image.resolveAssetSource(BLU_POWER_MODULE_ASSET)') &&
    webComponentSource.includes('src: riveSrc') &&
    webComponentSource.includes('autoplay: shouldAnimate') &&
    webComponentSource.includes('shouldAnimateBluPowerModuleRuntime({ hasEcsData, batteryPercent, inputWatts, outputWatts })') &&
    webComponentSource.includes('rive.play()') &&
    webComponentSource.includes('rive.pause()') &&
    webComponentSource.includes('onLoad: () => setLoaded(true)') &&
    webComponentSource.includes('onLoadError: () => setLoadFailed(true)') &&
    webComponentSource.includes('<BluPowerModuleFallback') &&
    webComponentSource.includes("testID ? `${testID}-loading-fallback` : undefined"),
  'Web BLU power module must resolve the bundled .riv asset first, keep public/rive as a fallback path, and render a visible fallback while loading or after Rive load failure.',
);

assert(
  !nativeComponentSource.includes("from '@rive-app/react-native'") &&
    nativeComponentSource.includes("Constants.appOwnership === 'expo'") &&
    nativeComponentSource.includes("require('@rive-app/react-native')") &&
    nativeComponentSource.includes("require('../../assets/power/blu_power_module.riv')") &&
    nativeComponentSource.includes('useRiveFile(BLU_POWER_MODULE_ASSET)') &&
    nativeComponentSource.includes('viewModelName: BLU_POWER_MODULE_VIEW_MODEL') &&
    nativeComponentSource.includes('instanceName: BLU_POWER_MODULE_VIEW_MODEL_INSTANCE') &&
    nativeComponentSource.includes('artboardName={BLU_POWER_MODULE_ARTBOARD}') &&
    nativeComponentSource.includes('stateMachineName={BLU_POWER_MODULE_STATE_MACHINE}') &&
    nativeComponentSource.includes('dataBind={viewModelInstance ?? DataBindMode.Auto}') &&
    nativeComponentSource.includes('shouldAnimateBluPowerModuleRuntime({ hasEcsData, batteryPercent, inputWatts, outputWatts })') &&
    nativeComponentSource.includes('autoPlay={shouldAnimate}') &&
    nativeComponentSource.includes('if (shouldAnimate)') &&
    nativeComponentSource.includes('fit={Fit.Contain}') &&
    nativeComponentSource.includes('alignment={Alignment.Center}') &&
    nativeComponentSource.includes("width: '100%'") &&
    nativeComponentSource.includes("height: '100%'") &&
    nativeComponentSource.includes('minWidth: 96') &&
    nativeComponentSource.includes('minHeight: 56') &&
    !nativeComponentSource.includes('if (!riveFile || !viewModelInstance || hasRuntimeError)') &&
    nativeComponentSource.includes("instance.numberProperty(property)?.set(value)") &&
    !nativeComponentSource.includes('stringProperty') &&
    !nativeComponentSource.includes('useStateMachineInput') &&
    nativeComponentSource.includes('riveViewRef?.playIfNeeded?.()') &&
    nativeComponentSource.includes('riveViewRef?.pause?.()'),
  'Native BLU power module must lazy-load Rive outside Expo Go, render with valid size before telemetry/view-model data arrives, use PowerWidgetVM numeric data binding, avoid state-machine inputs, contain fit, and centered alignment.',
);

assert(
    mapperSource.includes('offlinestatusopacity: activeOpacity(!input.hasEcsData)') &&
    mapperSource.includes('leftflowopacity: activeOpacity(input.hasEcsData && inputWatts > 1)') &&
    mapperSource.includes('rightflowopacity: activeOpacity(input.hasEcsData && outputWatts > 1)') &&
    mapperSource.includes('return input.hasEcsData && (activeWatts(input.inputWatts) || activeWatts(input.outputWatts))') &&
    mapperSource.includes("TODO: Flip left/right if visual QA shows this asset's flow direction is reversed."),
  'Power module runtime must drive inspected PowerWidgetVM numeric properties and only animate live transfer flow.',
);

assert(
  fallbackComponentSource.includes('resolveBluPowerModuleRuntime') &&
    fallbackComponentSource.includes("width: '100%'") &&
    fallbackComponentSource.includes("height: '100%'") &&
    !fallbackComponentSource.includes("'OFFLINE'") &&
    !fallbackComponentSource.includes('@rive-app/react-native') &&
    !fallbackComponentSource.includes('.png') &&
    !fallbackComponentSource.includes('.mp4') &&
    !fallbackComponentSource.includes('.gif'),
  'Fallback BLU power module must fill its slot, avoid centralized offline text, and stay lightweight without static media exports.',
);

assert(
  !powerWidgetSource.includes("import PowerModuleRiveWidget from './PowerModuleRiveWidget'") &&
    !powerWidgetSource.includes("import { adaptPowerTelemetryForRive } from '../../lib/powerModuleRiveTelemetry'") &&
    !powerWidgetSource.includes('function PowerMonitorRiveHero') &&
    !powerWidgetSource.includes('<PowerModuleRiveWidget') &&
    !powerWidgetSource.includes('const riveTelemetry = adaptPowerTelemetryForRive(summary)') &&
    !powerWidgetSource.includes('power-monitor-blu-rive') &&
    powerWidgetSource.includes('function PowerMonitorTelemetryPanel') &&
    powerWidgetSource.includes("testID={compact ? 'power-monitor-telemetry-panel-compact' : 'power-monitor-telemetry-panel'}") &&
    powerWidgetSource.includes('RESERVE') &&
    powerWidgetSource.includes("label=\"SOLAR\"") &&
    powerWidgetSource.includes("label=\"OUT\"") &&
    powerWidgetSource.includes("alignItems: 'stretch'") &&
    powerWidgetSource.includes("height: '100%'") &&
    powerWidgetSource.includes("alignSelf: 'stretch'") &&
    powerWidgetSource.includes("overflow: 'hidden'") &&
    powerWidgetSource.includes('minHeight: 86') &&
    powerWidgetSource.includes('minHeight: 0'),
  'Standalone Power Monitor widget must keep the BLU Rive module dormant and render a native ECS telemetry panel instead.',
);

assert(
  adapterSource.includes('export function adaptPowerTelemetryForRive') &&
    adapterSource.includes('if (!telemetry)') &&
    adapterSource.includes('const hasFreshTelemetry =') &&
    adapterSource.includes('telemetry.isStale !== true') &&
    adapterSource.includes('telemetry.snapshot?.isStale !== true') &&
    adapterSource.includes('telemetry.sourceState?.isStale !== true') &&
    adapterSource.includes('telemetry.sourceState?.isUnavailable !== true') &&
    adapterSource.includes('Math.max(0, Math.round(value))'),
  'Power module Rive telemetry adapter must gate stale/unavailable data and sanitize percent/watts before rendering.',
);

assert(
  !widgetRenderers.includes("import PowerModuleRiveWidget from './PowerModuleRiveWidget'") &&
    !widgetRenderers.includes('<PowerModuleRiveWidget') &&
    !widgetRenderers.includes('AttitudeCommandPowerRiveForeground') &&
    !widgetRenderers.includes('attitudeCommandS.powerRiveForegroundLayer') &&
    !widgetRenderers.includes('attitudeCommandS.powerRiveForegroundBlock') &&
    !widgetRenderers.includes('attitudeCommandS.powerRiveModule') &&
    widgetRenderers.includes('textureBleedCommandPanelSurface') &&
    powerCommandPanelBlock.includes('powerCompactReadout') &&
    !powerCommandPanelBlock.includes('<AttitudeCommandPowerRiveForeground'),
  'Attitude Command Power Monitor must keep BLU Rive dormant and use the compact ECS text readout on the transparent command surface.',
);

assert(
  !widgetRenderers.includes('powerLiveIndicator') &&
    !widgetRenderers.includes('powerLiveDot') &&
    !widgetRenderers.includes('powerLiveText') &&
    !widgetRenderers.includes('powerFlowLineInput') &&
    !widgetRenderers.includes('powerFlowLineOutput') &&
    !widgetRenderers.includes('powerFlowPulseMini'),
  'Dashboard Power Monitor must not render redundant live pills or React Native center flow rails around the blue Rive module.',
);

assert(
  widgetRenderers.includes('const shouldRenderPanelVisual = false;') &&
    widgetRenderers.includes('usesTextureBleedPanel && attitudeCommandS.textureBleedCommandPanelSurface') &&
    !powerCommandPanelBlock.includes('showPowerDetailBackdrop'),
  'Power Monitor command panel must avoid the decorative Power Management background image and scrim.',
);

assert(
  !powerManagementVisualBlock.includes('powerSolarSourceBlock') &&
    !powerManagementVisualBlock.includes('powerColumnLeft') &&
    !powerManagementVisualBlock.includes('powerColumnRight') &&
    !powerManagementVisualBlock.includes('SOLAR SOURCE') &&
    !powerManagementVisualBlock.includes('INPUT') &&
    !powerManagementVisualBlock.includes('OUTPUT'),
  'Power Monitor decorative background must not duplicate solar source, input, or output as corner overlay text.',
);

assert(
  metroConfig.includes("'riv'") &&
    packageJson.dependencies['@rive-app/react-native'] &&
    packageJson.dependencies['react-native-nitro-modules'],
  'Rive dependency and .riv Metro asset support must be configured.',
);

console.log('[blu-power-module-rive] contract passed');
