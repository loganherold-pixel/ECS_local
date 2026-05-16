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

const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
const {
  expeditionOperationalAssessmentScenarios,
} = require(fixturesPath);

const expectedCategories = ['overview', 'route', 'convoy', 'camp', 'logistics', 'vehicles'];
const expectedScenarioIds = [
  'normal-expedition',
  'route-watch',
  'convoy-watch',
  'camp-caution',
  'logistics-watch',
  'vehicle-caution',
  'critical-incident',
  'unknown-low-confidence',
];

function titleFor(category) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function findDataUsed(assessment, id) {
  return assessment.dataUsed.find((item) => item.id === id);
}

assert.ok(Array.isArray(expeditionOperationalAssessmentScenarios), 'Scenario catalog should be exported as an array.');
assert.deepStrictEqual(
  expeditionOperationalAssessmentScenarios.map((scenario) => scenario.id),
  expectedScenarioIds,
  'Scenario catalog should contain the expected demo scenarios in stable order.',
);

for (const scenario of expeditionOperationalAssessmentScenarios) {
  assert.ok(scenario.label, `${scenario.id} should have a label.`);
  assert.ok(scenario.description, `${scenario.id} should have a description.`);
  assert.ok(scenario.snapshot, `${scenario.id} should include an input snapshot.`);
  assert.ok(scenario.snapshot.capturedAt, `${scenario.id} snapshot should include capturedAt.`);
  assert.deepStrictEqual(
    Object.keys(scenario.expectedStatusByCategory).sort(),
    expectedCategories.slice().sort(),
    `${scenario.id} should declare expected status for every category.`,
  );

  const assessmentMap = buildExpeditionOperationalAssessmentMap(scenario.snapshot);
  for (const category of expectedCategories) {
    assert.strictEqual(
      assessmentMap[category].status,
      scenario.expectedStatusByCategory[category],
      `${scenario.id} expected ${category} status ${scenario.expectedStatusByCategory[category]}.`,
    );
  }
  assert.strictEqual(
    assessmentMap.overview.status,
    scenario.expectedOverviewStatus,
    `${scenario.id} expected overview status ${scenario.expectedOverviewStatus}.`,
  );

  if (scenario.expectedTopConcern === 'none') {
    assert.strictEqual(assessmentMap.overview.status, 'normal', `${scenario.id} should have no top concern only when normal.`);
    assert.ok(
      !assessmentMap.overview.why.some((item) => item.includes('Top concern')),
      `${scenario.id} should not render a top-concern line.`,
    );
  } else {
    assert.ok(
      assessmentMap.overview.why[0].includes(`Top concern: ${titleFor(scenario.expectedTopConcern)}`),
      `${scenario.id} overview should identify ${scenario.expectedTopConcern} as top concern.`,
    );
  }
}

const scenarioById = Object.fromEntries(
  expeditionOperationalAssessmentScenarios.map((scenario) => [scenario.id, scenario]),
);

let map = buildExpeditionOperationalAssessmentMap(scenarioById['normal-expedition'].snapshot);
assert.strictEqual(map.overview.escalationRecommended, false, 'Normal expedition should not recommend escalation.');
assert.ok(map.overview.summary.includes('Expedition stable'), 'Normal expedition should provide a stable compact summary source.');

map = buildExpeditionOperationalAssessmentMap(scenarioById['route-watch'].snapshot);
assert.strictEqual(findDataUsed(map.route, 'difficult-terrain')?.value, true, 'Route Watch should include difficult terrain ahead.');
assert.strictEqual(findDataUsed(map.route, 'daylight-margin')?.value, 80, 'Route Watch should include narrowing daylight margin.');

map = buildExpeditionOperationalAssessmentMap(scenarioById['convoy-watch'].snapshot);
assert.strictEqual(findDataUsed(map.convoy, 'overdue-members')?.value, 'Sweep vehicle', 'Convoy Watch should include the overdue member.');
assert.strictEqual(
  findDataUsed(map.convoy, 'assistance-needed-members')?.value,
  'none',
  'Convoy Watch should not fabricate an assistance request.',
);

map = buildExpeditionOperationalAssessmentMap(scenarioById['camp-caution'].snapshot);
assert.strictEqual(findDataUsed(map.camp, 'alternate-camp')?.value, true, 'Camp Caution should include alternate camp availability.');
assert.ok(map.camp.why.some((item) => item.toLowerCase().includes('daylight')), 'Camp Caution should be daylight-driven.');

map = buildExpeditionOperationalAssessmentMap(scenarioById['logistics-watch'].snapshot);
assert.strictEqual(findDataUsed(map.logistics, 'limiting-resource')?.value, 'water', 'Logistics Watch should identify water as limiting.');
assert.strictEqual(findDataUsed(map.logistics, 'fuel-range')?.value, 260, 'Logistics Watch should keep fuel inside margin.');

map = buildExpeditionOperationalAssessmentMap(scenarioById['vehicle-caution'].snapshot);
assert.strictEqual(findDataUsed(map.route, 'difficult-terrain')?.value, true, 'Vehicle Caution should include difficult terrain ahead.');
assert.strictEqual(map.vehicles.status, 'caution', 'Vehicle Caution should keep vehicle risk at caution, not critical.');
assert.ok(map.vehicles.why.some((item) => item.includes('Sweep 4Runner')), 'Vehicle Caution should identify the limiting vehicle.');

map = buildExpeditionOperationalAssessmentMap(scenarioById['critical-incident'].snapshot);
assert.strictEqual(map.vehicles.escalationRecommended, true, 'Critical Incident should recommend vehicle escalation.');
assert.strictEqual(map.overview.escalationRecommended, true, 'Critical Incident should roll escalation into overview.');

map = buildExpeditionOperationalAssessmentMap(scenarioById['unknown-low-confidence'].snapshot);
assert.ok(map.route.staleDataWarnings.length > 0, 'Unknown / Low Confidence should surface stale GPS/route data.');
assert.ok(map.convoy.missingDataWarnings.length > 0, 'Unknown / Low Confidence should surface missing convoy data.');
assert.strictEqual(findDataUsed(map.logistics, 'fuel-range')?.source, 'userManual', 'Unknown / Low Confidence should include manual logistics data.');
assert.ok(map.logistics.staleDataWarnings.length > 0, 'Unknown / Low Confidence should surface stale manual logistics data.');
assert.strictEqual(map.overview.confidence, 'low', 'Unknown / Low Confidence should lower overview confidence.');

console.log('Expedition operational scenario fixtures checks passed.');
