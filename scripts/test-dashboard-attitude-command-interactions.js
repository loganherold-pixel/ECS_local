const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const widgetGrid = read('components/dashboard/WidgetGrid.tsx');
const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const terrainSideProfile = read('components/dashboard/TerrainRiskSideProfile.tsx');
const routeCorridorWeather = read('components/navigate/RouteCorridorWeather.tsx');

function assert(condition, message) {
  if (!condition) {
    console.error(`[dashboard-attitude-command-interactions] ${message}`);
    process.exit(1);
  }
}

assert(
  widgetGrid.includes('onWidgetLongPress: (slot: WidgetSlot) => void;') &&
    widgetGrid.includes("const widgetMenuLongPressEnabled = slot.widgetType !== 'attitude-command';") &&
    widgetGrid.includes('widgetMenuLongPressEnabled') &&
    widgetGrid.includes(': undefined'),
  'Attitude Command must stay opted out of the parent dashboard long-press manager.',
);

assert(
  widgetRenderers.includes('onPress?: () => void;') &&
    widgetRenderers.includes('onLongPress?: () => void;') &&
    widgetRenderers.includes('accessibilityRole="button"') &&
    widgetRenderers.includes('onLongPress={onLongPress}') &&
    !widgetRenderers.includes('onLongPress={() => {}}'),
  'Attitude Command panels must own real long-press intent instead of a no-op placeholder.',
);

assert(
  widgetRenderers.includes("type AttitudeCommandFocusMode = 'summary' | 'detail';") &&
    widgetRenderers.includes('type AttitudeCommandActivePanel = { panel: AttitudeCommandFocusPanel; mode: AttitudeCommandFocusMode };') &&
    widgetRenderers.includes('const [activePanel, setActivePanel] = useState<AttitudeCommandActivePanel | null>(null);') &&
    widgetRenderers.includes("const openFocusPanel = useCallback((panel: AttitudeCommandFocusPanel, mode: AttitudeCommandFocusMode = 'summary')") &&
    widgetRenderers.includes('if (current?.panel === panel && current.mode === mode) return null;') &&
    widgetRenderers.includes('return { panel, mode };'),
  'Attitude Command focus state must track summary/detail mode and toggle the same panel/mode closed.',
);

assert(
  widgetRenderers.includes("const expandedPanelMode = activePanel?.mode ?? 'summary';") &&
    widgetRenderers.includes('renderCommandPanel(activePanel.panel, true, expandedPanelMode)'),
  'The expanded 3D follow-map overlay must render the selected panel with its selected focus mode.',
);

for (const panel of ['sunlight', 'weather', 'vehicle', 'route', 'power']) {
  assert(
    widgetRenderers.includes(`onPress={() => openFocusPanel('${panel}', 'summary')}`) &&
      widgetRenderers.includes(`onLongPress={() => openFocusPanel('${panel}', 'detail')}`),
    `Panel ${panel} must expose summary on tap and detail on long press.`,
  );
}

assert(
  widgetRenderers.includes('useRouteCorridorWeather(') &&
    widgetRenderers.includes('buildAttitudeCommandRouteWeatherRun(routeProgress)') &&
    widgetRenderers.includes('forceActive: activePanel?.panel === \'weather\' && activePanel.mode === \'detail\'') &&
    widgetRenderers.includes('persistPreference: false') &&
    widgetRenderers.includes('emitToasts: false') &&
    routeCorridorWeather.includes('forceActive?: boolean'),
  'Current Weather detail mode must activate route-corridor weather only while long-press detail is open.',
);

for (const sunlightField of [
  'Estimated sunrise',
  'Estimated sunset',
  'Civil twilight',
  'Total daylight',
  'Timezone/source',
  'Confidence',
  'Data age',
  'Weather/GPS source state',
  'Sun elevation',
  'Sun azimuth',
  'Last updated',
]) {
  assert(
    widgetRenderers.includes(`label="${sunlightField}"`),
    `Sunlight detail mode must expose ${sunlightField}.`,
  );
}

for (const weatherField of [
  'Condition',
  'Temperature',
  'Feels like',
  'Wind',
  'Precipitation',
  'Visibility',
  'Alerts',
  'Forecast',
  'Location',
  'Source',
  'Freshness',
  'Last updated',
  'Route forecast state',
  'Route forecast source',
  'Route forecast age',
]) {
  assert(
    widgetRenderers.includes(`label="${weatherField}`),
    `Weather detail mode must expose ${weatherField}.`,
  );
}

assert(
  widgetRenderers.includes('No active route geometry. ECS is showing current-position weather only.') &&
    widgetRenderers.includes('No deterministic weather hazard flagged') &&
    widgetRenderers.includes("routeWeather.points.slice(0, 5).map"),
  'Weather detail mode must avoid invented route weather and explicitly fall back to current-position weather.',
);

assert(
  widgetRenderers.includes('<VehicleCommandDetailSection title="Engine Overview" defaultExpanded>') &&
    widgetRenderers.includes('<VehicleCommandDetailSection title="Voltage & Electrical">') &&
    widgetRenderers.includes('<VehicleCommandDetailSection title="System Health">') &&
    widgetRenderers.includes('<VehicleCommandDetailSection title="Temperatures">') &&
    widgetRenderers.includes('<VehicleCommandDetailSection title="Liquid & Utility Sensors">') &&
    widgetRenderers.includes('<VehicleCommandDetailSection title="Diagnostics">') &&
    widgetRenderers.includes('expanded && detailMode ? (') &&
    widgetRenderers.includes('<VehicleCommandExpandedView') &&
    !widgetRenderers.includes('<VehicleCommandDetailSection title="Vehicle Profile">'),
  'Vehicle detail mode must use dashboard-style telemetry sections and omit the roll/pitch summary strip.',
);

for (const vehicleField of [
  'OBD2 source state',
  'OBD2 confidence',
  'Update age',
  'Water gallons',
  'Water source',
  'Water source state',
  'Mopeka/propane level',
  'Mopeka/propane source',
  'Liquid telemetry age',
]) {
  assert(
    widgetRenderers.includes(`label="${vehicleField}"`),
    `Vehicle detail mode must expose ${vehicleField}.`,
  );
}

assert(
  widgetRenderers.includes('getUtilitySensorCurrentFromCapacity(utilitySensorResources.water, waterCapacity)') &&
    widgetRenderers.includes('formatUtilitySensorModeLabel(') &&
    widgetRenderers.includes('Manual/Fleet fallback - telemetry unavailable') &&
    widgetRenderers.includes('Manual water entry'),
  'Vehicle detail mode must ground OBD2/liquid telemetry in live sensor, stale, manual, and Fleet fallback states.',
);

assert(
  widgetRenderers.includes('detailMode={mode === \'detail\'}') &&
    widgetRenderers.includes('const markersInteractive = expanded && detailMode;') &&
    widgetRenderers.includes("pointerEvents={markersInteractive ? 'box-none' : 'none'}") &&
    widgetRenderers.includes('interactive={markersInteractive}') &&
    widgetRenderers.includes('expanded && detailMode && selectedReferenceEvent') &&
    terrainSideProfile.includes('testID="terrainRiskReferenceMarker"') &&
    terrainSideProfile.includes('r={interactive ? 12 : 0}'),
  'Terrain reference markers must remain visible in summary but only become interactive in detail mode.',
);

for (const powerField of [
  'Charge state',
  'Battery',
  'Input watts',
  'Input amps',
  'Input volts',
  'Output watts',
  'Output amps',
  'Output volts',
  'Battery voltage',
  'Battery current',
  'Solar',
  'Connected sources',
  'Connected loads',
  'Telemetry source',
  'Freshness',
  'Last updated',
  'Provider',
  'Connection state',
  'SOC',
  'Watts in/out',
  'Solar watts',
  'Runtime',
  'Signal',
  'Source labels',
  'Device update age',
]) {
  assert(
    widgetRenderers.includes(`label="${powerField}"`),
    `Power detail mode must expose ${powerField}.`,
  );
}

assert(
  widgetRenderers.includes('useUnifiedPowerDevices()') &&
    widgetRenderers.includes('normalizePowerTelemetrySummary(power)') &&
    widgetRenderers.includes('resolveAttitudePowerFlowState(powerSummary)') &&
    widgetRenderers.includes('Manual entry') &&
    widgetRenderers.includes('Stale last-known telemetry') &&
    widgetRenderers.includes('Missing live device telemetry') &&
    widgetRenderers.includes('Configured Fleet fallback') &&
    widgetRenderers.includes('Bluetooth power devices'),
  'Power detail mode must use unified Bluetooth power telemetry and expose stale/manual/missing fallback states.',
);

console.log('[dashboard-attitude-command-interactions] press and long-press interaction contract passed');
