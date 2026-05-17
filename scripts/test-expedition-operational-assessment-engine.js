const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  buildExpeditionOperationalAssessments,
  buildExpeditionOperationalAssessmentMap,
} = require(enginePath);
const fixtures = require(fixturesPath);

const expectedCategories = ['overview', 'route', 'convoy', 'camp', 'logistics', 'vehicles'];

function assertAssessmentShape(context) {
  const assessments = buildExpeditionOperationalAssessments(context);
  assert.strictEqual(assessments.length, 6);
  assert.deepStrictEqual(assessments.map((item) => item.category), expectedCategories);
  for (const assessment of assessments) {
    assert.ok(assessment.id.startsWith('expedition-assessment-'));
    assert.ok(['normal', 'watch', 'caution', 'critical', 'unknown'].includes(assessment.status));
    assert.ok(['high', 'medium', 'low'].includes(assessment.confidence));
    assert.ok(assessment.title);
    assert.ok(assessment.summary);
    assert.ok(Array.isArray(assessment.why));
    assert.ok(Array.isArray(assessment.whatToWatch));
    assert.ok(assessment.recommendedAction);
    assert.ok(Array.isArray(assessment.toImproveStatus));
    assert.ok(Array.isArray(assessment.dataUsed));
    assert.ok(Array.isArray(assessment.staleDataWarnings));
    assert.ok(Array.isArray(assessment.missingDataWarnings));
    assert.ok(assessment.lastUpdated);
    if (assessment.missingDataWarnings.length > 0 || assessment.staleDataWarnings.length > 0 || assessment.status === 'unknown') {
      assert.notStrictEqual(
        assessment.confidence,
        'high',
        `${assessment.category} should not have high confidence with stale, missing, or unknown status.`,
      );
    }
  }
  return buildExpeditionOperationalAssessmentMap(context);
}

let map = assertAssessmentShape(fixtures.allSystemsNormalFixture);
for (const category of expectedCategories) {
  assert.strictEqual(map[category].status, 'normal', `${category} should be normal in all-systems-normal fixture.`);
  assert.strictEqual(map[category].confidence, 'high', `${category} should be high confidence when all key data is fresh.`);
}
assert.strictEqual(map.overview.escalationRecommended, false);

map = assertAssessmentShape(fixtures.campCloseToSunsetFixture);
assert.strictEqual(map.route.status, 'normal', 'Route should remain viable when route data is otherwise normal.');
assert.strictEqual(map.camp.status, 'caution', 'Camp should be caution when daylight at arrival is under 45 minutes.');
assert.strictEqual(map.overview.status, 'caution', 'Overview should roll camp caution upward.');
assert.ok(map.camp.why.some((item) => item.toLowerCase().includes('daylight')));

map = assertAssessmentShape(fixtures.convoyMemberOverdueFixture);
assert.strictEqual(map.convoy.status, 'critical', 'Overdue convoy member should be critical.');
assert.strictEqual(map.convoy.escalationRecommended, true);
assert.strictEqual(map.overview.status, 'critical');
assert.ok(map.overview.escalationRecommended);

map = assertAssessmentShape(fixtures.logisticsWaterLimitedFixture);
assert.strictEqual(map.logistics.status, 'caution', 'Water-limited logistics should be caution.');
assert.ok(map.logistics.why.some((item) => item.toLowerCase().includes('water')));
assert.strictEqual(map.overview.status, 'caution');

map = assertAssessmentShape(fixtures.vehicleDisabledFixture);
assert.strictEqual(map.vehicles.status, 'critical', 'Disabled vehicle should be critical.');
assert.strictEqual(map.vehicles.escalationRecommended, true);
assert.strictEqual(map.overview.status, 'critical');
assert.ok(map.vehicles.why.some((item) => item.toLowerCase().includes('disabled')));

map = assertAssessmentShape(fixtures.multipleDegradedSystemsFixture);
assert.ok(['caution', 'critical'].includes(map.overview.status));
assert.strictEqual(map.route.status, 'caution');
assert.strictEqual(map.convoy.status, 'caution');
assert.strictEqual(map.logistics.status, 'critical');
assert.strictEqual(map.overview.status, 'critical');
assert.ok(map.overview.why[0].includes('Top concern'));

map = assertAssessmentShape(fixtures.missingDataFixture);
for (const category of expectedCategories) {
  assert.strictEqual(map[category].confidence, 'low', `${category} should be low confidence with missing critical data.`);
}
assert.strictEqual(map.route.status, 'unknown');
assert.strictEqual(map.convoy.status, 'unknown');
assert.strictEqual(map.camp.status, 'unknown');
assert.strictEqual(map.logistics.status, 'unknown');
assert.strictEqual(map.vehicles.status, 'unknown');
assert.strictEqual(map.overview.status, 'unknown');
assert.ok(map.route.missingDataWarnings.length > 0);
assert.ok(map.route.staleDataWarnings.length > 0);
assert.ok(map.route.dataUsed.some((item) => item.isMissing));
assert.ok(map.route.dataUsed.some((item) => item.isStale));

console.log('Expedition operational assessment engine checks passed.');
