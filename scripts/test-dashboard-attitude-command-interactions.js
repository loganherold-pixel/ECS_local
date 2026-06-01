const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const widgetGrid = read('components/dashboard/WidgetGrid.tsx');
const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const widgetDetailModal = read('components/dashboard/WidgetDetailModal.tsx');
const terrainSideProfile = read('components/dashboard/TerrainRiskSideProfile.tsx');
const routeCorridorWeather = read('components/navigate/RouteCorridorWeather.tsx');

function assert(condition, message) {
  if (!condition) {
    console.error(`[dashboard-attitude-command-interactions] ${message}`);
    process.exit(1);
  }
}

assert(
  widgetGrid.includes('onWidgetPress: (slot: WidgetSlot) => void;') &&
    widgetGrid.includes('onWidgetPress(slot);') &&
    !widgetGrid.includes('onWidgetLongPress') &&
    !widgetGrid.includes('delayLongPress={500}'),
  'Dashboard widgets must use the shared tap-to-detail path instead of the parent long-press manager.',
);

assert(
  widgetRenderers.includes('onPress?: () => void;') &&
    widgetRenderers.includes('accessibilityRole="button"') &&
    !widgetRenderers.includes('onLongPress?: () => void;') &&
    !widgetRenderers.includes('onLongPress={onLongPress}') &&
    !widgetRenderers.includes('delayLongPress={650}'),
  'Attitude Command panels must use tap-only expansion controls with no long-press handler.',
);

assert(
  widgetRenderers.includes("type AttitudeCommandFocusMode = 'summary' | 'detail';") &&
    widgetRenderers.includes('type AttitudeCommandActivePanel = { panel: AttitudeCommandFocusPanel; mode: AttitudeCommandFocusMode };') &&
    widgetRenderers.includes('const [activePanel, setActivePanel] = useState<AttitudeCommandActivePanel | null>(null);') &&
    widgetRenderers.includes("const openFocusPanel = useCallback((panel: AttitudeCommandFocusPanel, mode: AttitudeCommandFocusMode = 'detail')") &&
    widgetRenderers.includes('setActivePanel({ panel, mode });') &&
    widgetRenderers.includes('const closeFocusPanel = useCallback(() => {') &&
    !widgetRenderers.includes('if (current?.panel === panel && current.mode === mode) return null;'),
  'Attitude Command focus state must open detail on tap and close only through the explicit close action.',
);

assert(
  widgetRenderers.includes("const expandedPanelMode = activePanel?.mode ?? 'detail';") &&
    widgetRenderers.includes('renderCommandPanel(activePanel.panel, true, expandedPanelMode)') &&
    widgetRenderers.includes('style={attitudeCommandS.expandedPanelCloseButton}') &&
    widgetRenderers.includes('onPress={closeFocusPanel}') &&
    widgetRenderers.includes('accessibilityLabel="Close expanded widget"'),
  'The expanded overlay must render the selected detail panel with a dedicated top-right close button.',
);

assert(
  widgetDetailModal.includes('dismissOnBackdrop={false}'),
  'Dashboard widget detail popups must close through their explicit X instead of backdrop taps.',
);

for (const panel of ['sunlight', 'weather', 'vehicle', 'route', 'power']) {
  assert(
    widgetRenderers.includes(`onPress={expanded ? undefined : () => openFocusPanel('${panel}', 'detail')}`) &&
      !widgetRenderers.includes(`onLongPress={() => openFocusPanel('${panel}', 'detail')}`) &&
      !widgetRenderers.includes(`onPress={() => openFocusPanel('${panel}', 'summary')}`),
    `Panel ${panel} must expose detail on tap and disable surface taps once expanded.`,
  );
}

assert(
  widgetRenderers.includes('useRouteCorridorWeather(') &&
    widgetRenderers.includes('buildAttitudeCommandRouteWeatherRun(routeProgress)') &&
    widgetRenderers.includes('forceActive: activePanel?.panel === \'weather\'') &&
    widgetRenderers.includes('persistPreference: false') &&
    widgetRenderers.includes('emitToasts: false') &&
    routeCorridorWeather.includes('forceActive?: boolean'),
  'Current Weather detail mode must activate route-corridor weather while the tapped detail panel is open.',
);

for (const sunlightField of [
  'Estimated sunrise',
  'Estimated sunset',
  'Total daylight remaining',
  'Total daylight window',
  'Timezone/source',
  'Glare status',
  'Glare direction',
  'Sun elevation',
]) {
  assert(
    widgetRenderers.includes(sunlightField),
    `Sunlight detail mode must expose ${sunlightField}.`,
  );
}

{
  const sunlightDetailBlock = widgetRenderers.match(/function AttitudeCommandSunlightDetail\([\s\S]*?\n}\n\nfunction normalizeAttitudeRouteForecastDay/)?.[0] ?? '';
  assert(
    sunlightDetailBlock.includes('sunlightFixedDetailSurface') &&
      sunlightDetailBlock.includes('sunlightPrimaryMetric') &&
      sunlightDetailBlock.includes('sunlightMetricGrid') &&
      sunlightDetailBlock.includes('formatAttitudeSunGlareDirection(daylight.sunAzimuth)') &&
      !sunlightDetailBlock.includes('<AttitudeCommandDetailScroll>') &&
      !sunlightDetailBlock.includes('</AttitudeCommandDetailScroll>'),
    'Sunlight expanded detail must be a fixed non-scrolling surface with polished metric containers.',
  );
}

for (const weatherField of [
  'Current temperature',
  'Wind',
  'Feels like',
  'Precipitation',
  'Visibility',
  'Current position forecast',
  'Route forecast',
  'Weather source',
  'Freshness',
]) {
  assert(
    widgetRenderers.includes(weatherField),
    `Weather detail mode must expose ${weatherField}.`,
  );
}

{
  const weatherDetailBlock = widgetRenderers.match(/function AttitudeCommandWeatherDetail\([\s\S]*?\n}\n\nfunction vehicleCommandDetailTone/)?.[0] ?? '';
  assert(
      weatherDetailBlock.includes('weatherFixedDetailSurface') &&
      weatherDetailBlock.includes('weatherCurrentMetricsGrid') &&
      weatherDetailBlock.includes('weatherForecastDeck') &&
      weatherDetailBlock.includes('AttitudeCommandWeatherForecastCard') &&
      widgetRenderers.includes('weatherForecastCard') &&
      weatherDetailBlock.includes('getAttitudeRouteWeatherForecastRows(routeWeather)') &&
      weatherDetailBlock.includes('routeForecastRows.length > 0 ? (') &&
      !weatherDetailBlock.includes('<AttitudeCommandDetailScroll>') &&
      !weatherDetailBlock.includes('</AttitudeCommandDetailScroll>') &&
      !weatherDetailBlock.includes('No active route geometry. ECS is showing current-position weather only.'),
    'Weather expanded detail must be a fixed non-scrolling surface with route forecast omitted when unavailable.',
  );
}

for (const vehicleField of [
  'RPM',
  'Miles per hour',
  'Engine load',
  'Coolant temperature',
  'Battery voltage',
  'Water gallons',
  'Propane / butane',
  'Fuel gallons',
]) {
  assert(
    widgetRenderers.includes(vehicleField),
    `Vehicle detail mode must expose ${vehicleField}.`,
  );
}

{
  const vehicleDetailBlock = widgetRenderers.match(/function VehicleCommandExpandedView\([\s\S]*?\n}\n\nfunction ECSCommandModulePlaceholder/)?.[0] ?? '';
  const vehicleRenderBlock = widgetRenderers.match(/case 'vehicle':[\s\S]*?case 'route':/)?.[0] ?? '';
  assert(
    vehicleRenderBlock.includes('<VehicleCommandExpandedView') &&
      vehicleRenderBlock.includes('rollDeg={commandStageRollDeg}') &&
      vehicleRenderBlock.includes('pitchDeg={commandStagePitchDeg}') &&
      vehicleRenderBlock.includes('attitudeLive={commandSensorLive}') &&
      !vehicleRenderBlock.includes('<AttitudeCommandDetailScroll>'),
    'Vehicle detail mode must render its fixed live telemetry surface without a scroll wrapper.',
  );
  assert(
    vehicleDetailBlock.includes('vehicleLiveFixedDetailSurface') &&
      vehicleDetailBlock.includes('isLiveVehicleCommandTelemetry(snapshot)') &&
      vehicleDetailBlock.includes('resolveVehicleCommandLiveFuelGallons(activeVehicleContext, vehicleTelemetry)') &&
      vehicleDetailBlock.includes("utilitySensorResources.water?.status === 'live'") &&
      vehicleDetailBlock.includes("utilitySensorResources.propane?.status === 'live'") &&
      vehicleDetailBlock.includes('hasLiveVehicleCommandData') &&
      vehicleDetailBlock.includes('vehicleLiveRollDock') &&
      vehicleDetailBlock.includes('<VehicleProfileRollAttitudeStrip') &&
      vehicleDetailBlock.includes('rollDeg={rollDeg}') &&
      vehicleDetailBlock.includes('pitchDeg={pitchDeg}') &&
      vehicleDetailBlock.includes('live={attitudeLive}') &&
      !vehicleDetailBlock.includes('<VehicleCommandDetailSection') &&
      !vehicleDetailBlock.includes('Manual/Fleet fallback') &&
      !vehicleDetailBlock.includes('Manual water entry') &&
      !vehicleDetailBlock.includes('Fleet selected vehicle/build fallback') &&
      !vehicleDetailBlock.includes('ECS is showing profile safe fallbacks'),
    'Vehicle expanded detail must be fixed, live-telemetry-only, and dock the roll monitor at the base.',
  );
}

assert(
  widgetRenderers.includes('detailMode={mode === \'detail\'}') &&
    widgetRenderers.includes('const markersInteractive = expanded;') &&
    widgetRenderers.includes("pointerEvents={markersInteractive ? 'box-none' : 'none'}") &&
    widgetRenderers.includes('interactive={markersInteractive}') &&
    widgetRenderers.includes('expanded && detailMode && selectedReferenceEvent') &&
    terrainSideProfile.includes('testID="terrainRiskReferenceMarker"') &&
    terrainSideProfile.includes('r={interactive ? 12 : 0}'),
  'Terrain reference markers must become interactive on the expanded surface while the explanation readout remains in detail mode.',
);

const powerDetailBlock = widgetRenderers.match(/function AttitudeCommandPowerDeviceDetail\([\s\S]*?\n}\n\nfunction PowerCommandModule/)?.[0] ?? '';

for (const powerField of [
  'Solar source',
  'Input',
  'Output',
  'Current power sources',
]) {
  assert(
    powerDetailBlock.includes(powerField),
    `Expanded Power Monitor must expose ${powerField}.`,
  );
}

for (const powerField of [
  'Net rating',
  'Watts in',
  'Watts out',
]) {
  assert(
    widgetRenderers.includes(powerField),
    `Expanded Power Monitor must expose ${powerField}.`,
  );
}

assert(
  powerDetailBlock.includes('runtime={runtimeText}') &&
    widgetRenderers.includes('Estimated runtime'),
  'Expanded Power Monitor must place the estimated runtime under the output compartment.',
);

assert(
  powerDetailBlock.includes('powerMonitorFixedDetailSurface') &&
    powerDetailBlock.includes('powerMonitorTopCompartments') &&
  powerDetailBlock.includes('powerMonitorSourceTable') &&
  powerDetailBlock.includes('getActivePowerMonitorDevices(power.devices)') &&
  widgetRenderers.includes('resolvePowerMonitorDeviceNetWatts(device)') &&
    widgetRenderers.includes('powerMonitorNetPositive') &&
    widgetRenderers.includes('powerMonitorNetNegative') &&
    !powerDetailBlock.includes('<AttitudeCommandDetailScroll>') &&
    !powerDetailBlock.includes('<AttitudeCommandDetailRow'),
  'Expanded Power Monitor must use a fixed non-scrolling source table with per-device red/green net watt indicators.',
);

console.log('[dashboard-attitude-command-interactions] tap-to-expand interaction contract passed');
