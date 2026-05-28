const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const widgetSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'PowerSystemWidget.tsx'), 'utf8');
const riveAdapterSource = fs.readFileSync(path.join(root, 'lib', 'powerModuleRiveTelemetry.ts'), 'utf8');
const detailSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'PowerSystemDetail.tsx'), 'utf8');

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

includes(
  widgetSource,
  "import PowerModuleRiveWidget from './PowerModuleRiveWidget'",
  'Power card should use the shared reusable Rive module.',
);
includes(
  riveAdapterSource,
  'export function adaptPowerTelemetryForRive',
  'Power Rive module should use a small adapter from normalized ECS telemetry.',
);
includes(
  riveAdapterSource,
  'const hasFreshTelemetry =',
  'Power Rive adapter should centralize freshness gating.',
);
includes(
  widgetSource,
  'hasEcsData={riveTelemetry.hasEcsData}',
  'Power Rive module should receive adapted ECS data availability.',
);
includes(
  widgetSource,
  'inputWatts={riveTelemetry.inputWatts}',
  'Power Rive module should receive adapted input watts.',
);
includes(
  widgetSource,
  'outputWatts={riveTelemetry.outputWatts}',
  'Power Rive module should receive adapted output watts.',
);
includes(
  widgetSource,
  "testID={compact ? 'power-monitor-blu-rive-compact' : 'power-monitor-blu-rive'}",
  'Power Rive module should be directly testable in compact and full widgets.',
);
includes(
  widgetSource,
  "height: '100%'",
  'Power Rive hero should fill the available widget height.',
);
includes(
  widgetSource,
  'minHeight: 86',
  'Power Rive hero should preserve a compact minimum height.',
);
includes(
  widgetSource,
  "alignSelf: 'stretch'",
  'Power Rive hero should stretch across the monitor container while the Rive runtime preserves aspect ratio.',
);
includes(
  widgetSource,
  "overflow: 'hidden'",
  'Power Rive hero should clip to the monitor container instead of floating outside it.',
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

console.log('Dashboard power systems live/refresh checks passed.');
