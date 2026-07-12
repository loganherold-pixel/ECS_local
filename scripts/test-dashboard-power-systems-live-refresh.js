const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const widgetSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'PowerSystemWidget.tsx'), 'utf8');
const widgetRenderersSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8');
const detailSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'PowerSystemDetail.tsx'), 'utf8');

const powerSourceTableHeaderStyle = widgetRenderersSource.match(/powerMonitorSourceTableHeader:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? '';
const powerSourceTableMetaStyle = widgetRenderersSource.match(/powerMonitorSourceTableMeta:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? '';

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

[
  'export interface PowerTelemetrySummary',
  'export function normalizePowerTelemetrySummary',
  'sourceLabel:',
  'lastUpdated:',
  'isLive:',
  'isStale:',
  'telemetrySourceLabel',
  'isTelemetryLive',
].forEach((fragment) => {
  includes(widgetSource, fragment, `Power widget should normalize telemetry field ${fragment}`);
});

[
  'POWER_CHARGE_IN_COLOR',
  'POWER_DRAW_OUT_COLOR',
  'POWER_SOLAR_COLOR',
  "getWidgetToneColor('good')",
  "getWidgetToneColor('warning')",
].forEach((fragment) => {
  includes(widgetSource, fragment, `Power detail surfaces should retain semantic flow token ${fragment}`);
});

notIncludes(
  widgetSource,
  "import PowerModuleRiveWidget from './PowerModuleRiveWidget'",
  'Power card should not import the Rive module while Rive widgets are disabled.',
);
notIncludes(
  widgetSource,
  "import { adaptPowerTelemetryForRive } from '../../lib/powerModuleRiveTelemetry'",
  'Power card should not adapt telemetry for Rive while Rive widgets are disabled.',
);
notIncludes(
  widgetSource,
  'function PowerMonitorRiveHero',
  'Power card should not keep the old Rive hero wrapper.',
);
notIncludes(
  widgetSource,
  '<PowerModuleRiveWidget',
  'Power card should not render a Rive widget.',
);
includes(
  widgetSource,
  'function PowerMonitorTelemetryPanel',
  'Power card should use a native telemetry panel instead of a Rive module.',
);
includes(
  widgetSource,
  "testID={compact ? 'power-monitor-telemetry-panel-compact' : 'power-monitor-telemetry-panel'}",
  'Power telemetry panel should be directly testable in compact and full widgets.',
);
includes(
  widgetSource,
  'RESERVE',
  'Power telemetry panel should keep reserve visible without Rive.',
);
includes(
  widgetSource,
  "label=\"SOLAR\"",
  'Power telemetry panel should keep solar input visible without Rive.',
);
includes(
  widgetSource,
  "label=\"OUT\"",
  'Power telemetry panel should keep power draw visible without Rive.',
);
includes(
  widgetSource,
  "height: '100%'",
  'Power telemetry panel should fill the available widget height.',
);
includes(
  widgetSource,
  'minHeight: 86',
  'Power telemetry panel should preserve a compact minimum height.',
);
includes(
  widgetSource,
  "alignSelf: 'stretch'",
  'Power telemetry panel should stretch across the monitor container.',
);
includes(
  widgetSource,
  "overflow: 'hidden'",
  'Power telemetry panel should clip to the monitor container instead of floating outside it.',
);
notIncludes(
  widgetSource,
  '<PowerFlowGraphic inputWatts={totalInputWatts} outputWatts={totalOutputWatts} />',
  'Power card should not render the legacy inline flow graphic; the blue Rive module owns power flow animation.',
);
notIncludes(
  widgetSource,
  'function PowerFlowGraphic',
  'Power card should not keep the legacy center tick/flow graphic helper.',
);
notIncludes(
  widgetSource,
  'function usePowerFlowPulse',
  'Power card should not keep the legacy center tick/flow pulse loop.',
);
notIncludes(
  widgetSource,
  "footer={<WidgetMetaLine",
  'Power monitor should not show a redundant footer/live pill beneath the blue module.',
);
notIncludes(
  widgetSource,
  "tone: totalOutputWatts > 0 ? 'critical' : 'neutral'",
  'Output/draw watts should use warning semantics, not critical semantics.',
);

[
  'usePowerTelemetryControls',
  'refreshTelemetry',
  'refreshState',
  'refreshGuardRef',
  'handleRefresh',
  'PowerRefreshControl',
  'accessibilityLabel="Refresh power telemetry"',
  'Power telemetry refreshed from available providers.',
  'Power refresh failed.',
  'Live provider polling active; Refresh requests latest now.',
].forEach((fragment) => {
  includes(detailSource, fragment, `Power detail refresh should include ${fragment}`);
});

[
  'normalizePowerTelemetrySummary(power)',
  "label=\"SOURCE\"",
  "label=\"STATUS\"",
  "'STALE — RECONNECT'",
  "'LAST KNOWN'",
  "summary.isLive ? 'LIVE'",
].forEach((fragment) => {
  includes(detailSource, fragment, `Power detail should disclose live/stale/source state with ${fragment}`);
});

[
  'color={POWER_CHARGE_IN_COLOR}',
  'color={POWER_DRAW_OUT_COLOR}',
  'color={POWER_SOLAR_COLOR}',
].forEach((fragment) => {
  includes(detailSource, fragment, `Power detail flow bars should use shared semantic color ${fragment}`);
});

notIncludes(
  widgetRenderersSource,
  'suppressPowerDetailBackground',
  'Expanded Power module should keep its background visual without using a suppression flag.',
);
includes(
  widgetRenderersSource,
  'const shouldRenderPanelVisual = expanded && (isSunlightPanel || isWeatherPanel || isVehiclePanel || isPowerPanel);',
  'Power module panel should restore its background only while expanded.',
);
includes(
  widgetRenderersSource,
  '<AttitudeCommandPowerManagementVisual power={power} />',
  'Expanded Power Monitor should render the bundled Power Management artwork behind telemetry.',
);
includes(
  widgetRenderersSource,
  'resolveAttitudeCommandPowerExpansionGeometry',
  'Expanded Power Monitor should use its larger dedicated geometry.',
);
includes(
  widgetRenderersSource,
  "activePanel?.panel === 'power'",
  'Power expansion should select the larger geometry only for the Power Monitor.',
);
includes(
  widgetRenderersSource,
  'testID="attitude-command-power-management-background"',
  'Expanded Power Management artwork should expose a stable mobile verification target.',
);
assert.ok(
  powerSourceTableHeaderStyle.includes("flexDirection: 'column'") &&
    powerSourceTableHeaderStyle.includes("alignItems: 'stretch'") &&
    powerSourceTableMetaStyle.includes('flexShrink: 1') &&
    powerSourceTableMetaStyle.includes("textAlign: 'left'") &&
    widgetRenderersSource.includes('style={attitudeCommandS.powerMonitorSourceTableMeta} numberOfLines={2}'),
  'Expanded Power source-table title and telemetry state should stack without truncating or leaving the panel.',
);
includes(
  widgetRenderersSource,
  'usesTextureBleedPanel && attitudeCommandS.textureBleedCommandPanelSurface',
  'Compact Power Monitor should retain the shared transparent command surface.',
);

console.log('Dashboard power systems live/refresh checks passed.');
