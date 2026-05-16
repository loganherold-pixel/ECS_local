const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'lib', 'expedition', 'compactStatusSummary.ts');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const widgetPath = path.join(root, 'components', 'dashboard', 'ExpeditionStatusSummaryWidget.tsx');
const renderersPath = path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx');
const registryPath = path.join(root, 'lib', 'widgetRegistry.ts');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { buildExpeditionCompactStatusSummary } = require(helperPath);
const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
const fixtures = require(fixturesPath);

function dp(value, options = {}) {
  return {
    value,
    source: options.source || 'mock',
    updatedAt: options.updatedAt || fixtures.allSystemsNormalFixture.capturedAt,
    confidence: options.confidence || 'high',
    reliability: options.confidence || 'high',
    isStale: options.isStale,
  };
}

function summaryFor(context, options = {}) {
  return buildExpeditionCompactStatusSummary({
    contextSnapshot: context,
    assessments: buildExpeditionOperationalAssessmentMap(context),
    usingMockData: options.usingMockData === true,
    offline: context.offlineMode === true,
    stale: options.stale === true,
  });
}

function withRoutePatch(routePatch) {
  return {
    ...fixtures.allSystemsNormalFixture,
    route: {
      ...fixtures.allSystemsNormalFixture.route,
      ...routePatch,
    },
  };
}

const normal = summaryFor(fixtures.allSystemsNormalFixture);
assert.strictEqual(normal.available, true, 'Normal compact summary should be available for an active expedition.');
assert.strictEqual(normal.status, 'normal', 'Normal fixture should summarize as normal.');
assert.strictEqual(normal.statusLabel, 'Stable', 'Normal compact summary should use Stable product copy.');
assert.ok(normal.headline.includes('ECS Expedition Status: Stable'), 'Normal compact headline should use the ECS status copy.');
assert.ok(normal.nextCheckpointOrCampEta.includes('Ridge approach'), 'Normal summary should include next checkpoint context.');
assert.strictEqual(normal.convoyAccounted, '3/3 accounted', 'Normal summary should include convoy accounted count.');
assert.strictEqual(normal.limitingResource, 'No limiting resource', 'Normal summary should show no limiting resource.');
assert.ok(normal.limitingVehicle.includes('ready'), 'Normal summary should include limiting vehicle readiness context.');
assert.ok(normal.dataQualityLabel.includes('HIGH confidence'), 'Normal summary should expose confidence.');

const watch = summaryFor(withRoutePatch({ daylightRemainingAtEtaMinutes: dp(70) }));
assert.strictEqual(watch.status, 'watch', 'Daylight margin narrowing should summarize as watch.');
assert.ok(watch.topConcern.includes('Route Watch'), 'Watch summary should show the top reason.');
assert.ok(watch.nextRecommendedAction.length > 0, 'Watch summary should include the action that improves status.');

const critical = summaryFor(fixtures.vehicleDisabledFixture);
assert.strictEqual(critical.status, 'critical', 'Disabled vehicle should summarize as critical.');
assert.ok(critical.topConcern.includes('Vehicles Critical'), 'Critical summary should surface the leading vehicle concern.');
assert.ok(critical.limitingVehicle.toLowerCase().includes('disabled'), 'Critical summary should identify the limiting vehicle.');
assert.strictEqual(critical.statusTone, 'critical', 'Critical summary should map to critical tone.');

const stale = summaryFor(withRoutePatch({
  currentLocation: dp(
    { latitude: 38.1, longitude: -109.4, accuracyMeters: 8 },
    { isStale: true },
  ),
}));
assert.ok(stale.dataQualityLabel.toLowerCase().includes('stale'), 'Stale route data should surface in compact data quality.');
assert.strictEqual(stale.dataQualityTone, 'stale', 'Stale route data should use the stale data-quality tone.');

const noActiveExpedition = summaryFor(fixtures.allSystemsNormalFixture, { usingMockData: true });
assert.strictEqual(noActiveExpedition.available, false, 'Mock/demo context should not render as an active expedition compact status.');
assert.strictEqual(noActiveExpedition.headline, 'No active expedition', 'Missing active expedition fallback should be explicit.');
assert.ok(
  noActiveExpedition.nextRecommendedAction.includes('Start navigation'),
  'Missing active expedition fallback should guide the user to start navigation.',
);

const idleRoute = summaryFor(withRoutePatch({ lifecycleState: dp('idle') }));
assert.strictEqual(idleRoute.available, false, 'Idle route lifecycle should render the missing active expedition fallback.');

const widgetSource = fs.readFileSync(widgetPath, 'utf8');
const renderersSource = fs.readFileSync(renderersPath, 'utf8');
const registrySource = fs.readFileSync(registryPath, 'utf8');

assert.ok(widgetSource.includes('useExpeditionAssessmentStore'), 'Compact widget must be powered by the Expedition Assessment Store.');
assert.ok(widgetSource.includes('buildExpeditionCompactStatusSummary'), 'Compact widget must reuse the pure summary builder.');
assert.ok(renderersSource.includes("case 'expedition-status-summary'"), 'Widget renderer must support expedition-status-summary.');
assert.ok(registrySource.includes("widgetId: 'expedition-status-summary'"), 'Catalog must include expedition-status-summary.');
assert.ok(registrySource.includes("widget_id: 'expedition-status-summary'"), 'Registry must include expedition-status-summary.');
assert.ok(registrySource.includes("defaultModes: []"), 'Compact summary must not alter existing default selections.');

console.log('Expedition compact status summary checks passed.');
