const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storePath = path.join(root, 'stores', 'expeditionAssessmentStore.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');

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

const { expeditionAssessmentStore } = require(storePath);
const fixtures = require(fixturesPath);

const CATEGORIES = ['overview', 'route', 'convoy', 'camp', 'logistics', 'vehicles'];

function assertSixAssessments(state) {
  const assessments = expeditionAssessmentStore.getAllAssessments();
  assert.strictEqual(assessments.length, 6);
  assert.deepStrictEqual(assessments.map((assessment) => assessment.category), CATEGORIES);
  for (const category of CATEGORIES) {
    assert.ok(state.assessments[category], `${category} assessment should exist.`);
    assert.ok(state.narratives[category], `${category} narrative should exist.`);
    assert.ok(state.narratives[category].statusLine, `${category} narrative should have status line.`);
  }
}

async function main() {
  expeditionAssessmentStore.reset();
  let state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.usingMockData, false, 'Store should initialize without mock/demo data.');
  assert.strictEqual(state.offline, false, 'Unavailable startup context should not pretend to be offline demo data.');
  assertSixAssessments(state);
  assert.strictEqual(expeditionAssessmentStore.getAssessment('overview').category, 'overview');

  let refreshCount = 0;
  expeditionAssessmentStore.setContextProvider(() => {
    refreshCount += 1;
    return fixtures.campCloseToSunsetFixture;
  });
  state = await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(refreshCount, 1);
  assert.strictEqual(state.usingMockData, false);
  assert.strictEqual(state.assessments.camp.status, 'caution');
  assert.strictEqual(state.assessments.overview.status, 'caution');

  expeditionAssessmentStore.setNarrativeProvider({
    async generateNarrative() {
      throw new Error('AI unavailable');
    },
  });
  state = await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(state.narratives.route.source, 'template', 'AI failure should fall back to template narrative.');
  assert.ok(state.narratives.route.statusLine);

  expeditionAssessmentStore.setNarrativeProvider(null);
  expeditionAssessmentStore.setContextProvider(() => fixtures.missingDataFixture);
  state = await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(state.stale, true, 'Store should surface stale assessment data.');
  assert.strictEqual(state.offline, true);
  assert.strictEqual(state.assessments.route.confidence, 'low');
  assert.ok(state.assessments.route.staleDataWarnings.length > 0);
  assert.ok(state.narratives.route.dataLimitations.some((item) => item.toLowerCase().includes('stale')));

  expeditionAssessmentStore.setContextProvider(() => fixtures.allSystemsNormalFixture);
  state = await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(state.assessments.logistics.status, 'normal');
  await expeditionAssessmentStore.updateManualLogisticsData({
    waterRemainingLiters: 4,
    groupSize: 3,
    limitingResource: 'water',
  });
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.logistics.status, 'critical');
  assert.strictEqual(state.assessments.logistics.confidence, 'high');
  assert.ok(
    state.assessments.logistics.dataUsed.some(
      (item) => item.id === 'water-remaining' && item.source === 'userManual',
    ),
    'Manual logistics update should be visible in dataUsed.',
  );
  assert.strictEqual(state.assessments.overview.status, 'critical');

  await expeditionAssessmentStore.updateManualVehicleStatus({
    vehicleId: 'vehicle-1',
    disabled: true,
    readinessStatus: 'critical',
    activeMechanicalIssue: 'Manual disabled vehicle report',
  });
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.vehicles.status, 'critical');
  assert.ok(
    state.assessments.vehicles.dataUsed.some(
      (item) => item.label.includes('disabled') && item.source === 'userManual',
    ),
    'Manual vehicle update should be visible in dataUsed.',
  );

  expeditionAssessmentStore.reset();
  console.log('Expedition assessment store checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
