const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storePath = path.join(root, 'stores', 'expeditionAssessmentStore.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const detailViewPath = path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx');
const expeditionTabPath = path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx');
const manualActionsPath = path.join(root, 'lib', 'expedition', 'manualUpdateActions.ts');

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function manualSourceVisible(assessment, id) {
  return assessment.dataUsed.some((item) => item.id === id && item.source === 'userManual');
}

async function resetTo(context) {
  expeditionAssessmentStore.reset();
  expeditionAssessmentStore.setContextProvider(() => clone(context));
  return expeditionAssessmentStore.refreshAssessments();
}

async function main() {
  let state = await resetTo(fixtures.allSystemsNormalFixture);
  const routeBefore = state.assessments.route.lastUpdated;
  await expeditionAssessmentStore.applyManualAssessmentAction('report-route-issue');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.route.status, 'watch', 'Manual route issue should change the route assessment.');
  assert.ok(manualSourceVisible(state.assessments.route, 'route-issues'), 'Route manual update should show MANUAL in Data Used.');
  assert.notStrictEqual(state.assessments.route.lastUpdated, routeBefore, 'Manual route update should refresh lastUpdated.');

  state = await resetTo(fixtures.missingDataFixture);
  const convoyBeforeConfidence = state.assessments.convoy.confidence;
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-member-ok');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.convoy.status, 'normal', 'Manual OK check-in should stabilize the convoy assessment.');
  assert.strictEqual(convoyBeforeConfidence, 'low', 'Fixture should start with low convoy confidence.');
  assert.strictEqual(state.assessments.convoy.confidence, 'high', 'Manual convoy confirmation should improve confidence.');
  assert.ok(manualSourceVisible(state.assessments.convoy, 'team-member-count'), 'Convoy manual update should show MANUAL in Data Used.');

  state = await resetTo(fixtures.allSystemsNormalFixture);
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-member-delayed');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.convoy.status, 'watch', 'Manual delayed member should change convoy assessment.');
  assert.ok(manualSourceVisible(state.assessments.convoy, 'overdue-members'), 'Delayed member should be a manual convoy source.');
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-member-offline');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.convoy.status, 'caution', 'Manual offline member should raise convoy assessment.');
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-member-needs-assistance');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.convoy.status, 'critical', 'Manual assistance need should make convoy critical.');

  state = await resetTo(fixtures.campCloseToSunsetFixture);
  await expeditionAssessmentStore.applyManualAssessmentAction('confirm-camp-safe');
  state = expeditionAssessmentStore.getSnapshot();
  assert.ok(['normal', 'watch'].includes(state.assessments.camp.status), 'Manual camp safe confirmation should improve camp assessment.');
  assert.ok(manualSourceVisible(state.assessments.camp, 'camp-confirmed'), 'Camp safe confirmation should be manual data.');
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-camp-unsafe');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.camp.status, 'critical', 'Manual unsafe camp report should make camp critical.');
  await expeditionAssessmentStore.applyManualAssessmentAction('select-alternate-camp');
  state = expeditionAssessmentStore.getSnapshot();
  assert.ok(manualSourceVisible(state.assessments.camp, 'alternate-camp-label'), 'Alternate camp selection should be manual data.');

  state = await resetTo(fixtures.logisticsWaterLimitedFixture);
  await expeditionAssessmentStore.applyManualAssessmentAction('update-water');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.logistics.status, 'normal', 'Manual water update should clear water-limited logistics.');
  assert.ok(manualSourceVisible(state.assessments.logistics, 'water-remaining'), 'Water update should be manual data.');
  await expeditionAssessmentStore.applyManualAssessmentAction('update-fuel');
  state = expeditionAssessmentStore.getSnapshot();
  assert.ok(manualSourceVisible(state.assessments.logistics, 'fuel-range'), 'Fuel update should be manual data.');
  await expeditionAssessmentStore.applyManualAssessmentAction('update-food');
  state = expeditionAssessmentStore.getSnapshot();
  assert.ok(manualSourceVisible(state.assessments.logistics, 'food-days'), 'Food update should be manual data.');
  await expeditionAssessmentStore.applyManualAssessmentAction('update-battery-power');
  state = expeditionAssessmentStore.getSnapshot();
  assert.ok(manualSourceVisible(state.assessments.logistics, 'power-hours'), 'Power update should be manual data.');

  state = await resetTo(fixtures.allSystemsNormalFixture);
  await expeditionAssessmentStore.applyManualAssessmentAction('report-mechanical-issue');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.vehicles.status, 'caution', 'Manual mechanical issue should change vehicle assessment.');
  assert.ok(
    state.assessments.vehicles.dataUsed.some((item) => item.id.endsWith('-mechanical-issue') && item.source === 'userManual'),
    'Mechanical issue should be manual vehicle data.',
  );
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-disabled');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.vehicles.status, 'critical', 'Manual disabled marker should make vehicles critical.');
  await expeditionAssessmentStore.applyManualAssessmentAction('mark-vehicle-ok');
  state = expeditionAssessmentStore.getSnapshot();
  assert.strictEqual(state.assessments.vehicles.status, 'normal', 'Manual vehicle OK should restore vehicle assessment.');
  assert.ok(
    state.assessments.vehicles.dataUsed.some((item) => item.id.endsWith('-readiness') && item.source === 'userManual'),
    'Vehicle OK should be manual readiness data.',
  );

  const staleContext = clone(expeditionAssessmentStore.getSnapshot().contextSnapshot);
  staleContext.capturedAt = new Date(Date.parse(staleContext.capturedAt) + 3 * 60 * 60 * 1000).toISOString();
  expeditionAssessmentStore.setContextProvider(() => staleContext);
  state = await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(state.stale, true, 'Manual data should eventually become stale.');
  assert.ok(
    state.assessments.vehicles.staleDataWarnings.some((warning) => warning.includes('readiness')),
    'Stale manual vehicle readiness should be shown in stale warnings.',
  );

  const detailViewSource = fs.readFileSync(detailViewPath, 'utf8');
  const expeditionTabSource = fs.readFileSync(expeditionTabPath, 'utf8');
  const manualActionsSource = fs.readFileSync(manualActionsPath, 'utf8');
  assert.ok(detailViewSource.includes('Related Actions'), 'Manual update actions should be exposed from the assessment detail actions.');
  assert.ok(expeditionTabSource.includes('applyManualAssessmentAction'), 'Expedition tab should wire detail actions to manual update workflows.');
  assert.ok(manualActionsSource.includes('MANUAL_EXPEDITION_DATA_STALE_AFTER_MINUTES'), 'Manual updates should document local stale behavior.');

  expeditionAssessmentStore.reset();
  console.log('Expedition manual update workflow checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
