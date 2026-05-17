const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const detailViewPath = path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx');

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

const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
const fixtures = require(fixturesPath);
const detailViewSource = fs.readFileSync(detailViewPath, 'utf8');

function overviewFor(context) {
  return buildExpeditionOperationalAssessmentMap(context).overview;
}

const normal = overviewFor(fixtures.allSystemsNormalFixture);
assert.strictEqual(normal.status, 'normal');
assert.strictEqual(normal.escalationRecommended, false);
assert.ok(normal.summary.includes('Expedition stable'));
assert.ok(normal.why.join(' ').includes('inside operating margin'));
assert.ok(normal.dataUsed.some((item) => item.id === 'route-phase' && item.value === 'active'));
assert.ok(normal.dataUsed.some((item) => item.id === 'route-progress' && item.value === 62));
assert.ok(normal.dataUsed.some((item) => item.id === 'current-eta'));
assert.ok(normal.dataUsed.some((item) => item.id === 'next-checkpoint'));
assert.ok(normal.dataUsed.some((item) => item.id === 'convoy-accountability'));
assert.ok(normal.dataUsed.some((item) => item.id === 'communications-quality'));

const watchContext = {
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    daylightRemainingAtEtaMinutes: {
      ...fixtures.allSystemsNormalFixture.route.daylightRemainingAtEtaMinutes,
      value: 70,
    },
  },
};
const watch = overviewFor(watchContext);
assert.strictEqual(watch.status, 'watch');
assert.strictEqual(watch.escalationRecommended, false);
assert.ok(watch.summary.includes('Route Watch'));
assert.ok(watch.whatToWatch[0].includes('1 watch'));
assert.ok(watch.recommendedAction.toLowerCase().includes('monitor'));

const critical = overviewFor(fixtures.vehicleDisabledFixture);
assert.strictEqual(critical.status, 'critical');
assert.strictEqual(critical.escalationRecommended, true);
assert.ok(critical.escalationReason.toLowerCase().includes('disabled'));
assert.ok(critical.recommendedAction.toLowerCase().includes('stabilize'));

const missing = overviewFor(fixtures.missingDataFixture);
assert.strictEqual(missing.status, 'unknown');
assert.strictEqual(missing.confidence, 'low');
assert.ok(missing.missingDataWarnings.length > 0);
assert.ok(missing.staleDataWarnings.length > 0);
assert.ok(missing.dataUsed.some((item) => item.id === 'route-status' && item.isMissing));

const degraded = overviewFor(fixtures.multipleDegradedSystemsFixture);
assert.strictEqual(degraded.status, 'critical');
assert.strictEqual(degraded.escalationRecommended, true);
assert.ok(degraded.why[0].includes('Top concern'));

assert.ok(detailViewSource.includes('Expedition Status'));
assert.ok(detailViewSource.includes('Subsystem Summary'));
assert.ok(detailViewSource.includes('Top concern'));
assert.ok(detailViewSource.includes('Route phase'));
assert.ok(detailViewSource.includes('Progress'));
assert.ok(detailViewSource.includes('ETA'));
assert.ok(detailViewSource.includes('Next checkpoint'));
assert.ok(detailViewSource.includes('Convoy accountability'));
assert.ok(detailViewSource.includes('Communications/data quality'));
assert.ok(detailViewSource.includes('Camp readiness'));
assert.ok(detailViewSource.includes('Logistics endurance'));
assert.ok(detailViewSource.includes('Vehicle readiness'));
assert.ok(detailViewSource.includes('buildOverviewSystemSummary'));
assert.ok(detailViewSource.includes("category === 'overview'"));

console.log('Expedition overview detail behavior checks passed.');
