const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const escalationPath = path.join(root, 'lib', 'expedition', 'assessmentEscalation.ts');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const workflowPath = path.join(root, 'lib', 'incidentRecoveryWorkflowStore.ts');
const detailViewPath = path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx');
const expeditionTabPath = path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx');
const incidentPanelPath = path.join(root, 'components', 'dashboard', 'IncidentRecoveryPanel.tsx');
const reportModalPath = path.join(root, 'components', 'dashboard', 'ReportIncidentModal.tsx');
const packagePath = path.join(root, 'package.json');

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

const {
  buildAssessmentEscalationRequest,
  shouldOfferIncidentEscalation,
} = require(escalationPath);
const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
const { incidentRecoveryWorkflowStore } = require(workflowPath);
const fixtures = require(fixturesPath);

function assessmentFor(context, category) {
  return buildExpeditionOperationalAssessmentMap(context)[category];
}

function requestFor(context, category) {
  return buildAssessmentEscalationRequest({
    assessment: assessmentFor(context, category),
    contextSnapshot: context,
    expeditionId: context.expeditionId,
    routeLabel: context.route?.routeName?.value,
    gpsLocation: context.route?.currentLocation?.value,
  });
}

const criticalVehicle = assessmentFor(fixtures.vehicleDisabledFixture, 'vehicles');
assert.strictEqual(criticalVehicle.status, 'critical', 'Fixture should produce critical vehicle assessment.');
assert.strictEqual(shouldOfferIncidentEscalation(criticalVehicle), true, 'Critical vehicle should offer escalation.');
const vehicleRequest = requestFor(fixtures.vehicleDisabledFixture, 'vehicles');
assert.strictEqual(vehicleRequest.incidentType, 'vehicle_breakdown', 'Vehicle critical should map to vehicle incident flow.');
assert.ok(vehicleRequest.reportInput.resources.vehicleDisabled, 'Vehicle disabled context should pass into incident resources.');
assert.ok(vehicleRequest.reportInput.assessmentEscalation.summary.includes('disabled'), 'Vehicle escalation should pass summary context.');

const convoyRequest = requestFor(fixtures.vehicleDisabledFixture, 'convoy');
const convoyAssistanceContext = {
  ...fixtures.allSystemsNormalFixture,
  convoy: {
    ...fixtures.allSystemsNormalFixture.convoy,
    assistanceNeededMemberLabels: {
      value: ['Sweep vehicle'],
      source: 'userManual',
      updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
      confidence: 'high',
      reliability: 'high',
    },
  },
};
const convoyAssistance = assessmentFor(convoyAssistanceContext, 'convoy');
const convoyAssistanceRequest = buildAssessmentEscalationRequest({
  assessment: convoyAssistance,
  contextSnapshot: convoyAssistanceContext,
});
assert.strictEqual(convoyAssistance.status, 'critical', 'Convoy assistance should be critical.');
assert.strictEqual(convoyAssistanceRequest.incidentType, 'separated_party', 'Convoy assistance should map to separated party incident flow.');
assert.ok(
  convoyAssistanceRequest.reportInput.notes.includes('Sweep vehicle'),
  'Convoy escalation should include affected member context.',
);
assert.ok(convoyRequest.reportInput.type, 'Convoy escalation request should be buildable for existing convoy state.');

const routeCriticalContext = {
  ...fixtures.allSystemsNormalFixture,
  route: {
    ...fixtures.allSystemsNormalFixture.route,
    offRoute: {
      value: true,
      source: 'userManual',
      updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
      confidence: 'high',
      reliability: 'high',
    },
    alternateRouteAvailable: {
      value: false,
      source: 'userManual',
      updatedAt: fixtures.allSystemsNormalFixture.capturedAt,
      confidence: 'high',
      reliability: 'high',
    },
  },
};
const routeCritical = assessmentFor(routeCriticalContext, 'route');
const routeRequest = buildAssessmentEscalationRequest({
  assessment: routeCritical,
  contextSnapshot: routeCriticalContext,
});
assert.strictEqual(routeCritical.status, 'critical', 'Unsafe route should be critical.');
assert.strictEqual(routeRequest.incidentType, 'route_blocked', 'Route critical should map to route incident flow.');
assert.ok(routeRequest.reportInput.notes.toLowerCase().includes('route'), 'Route escalation should include route context in notes.');

const overviewCritical = assessmentFor(fixtures.vehicleDisabledFixture, 'overview');
const overviewRequest = buildAssessmentEscalationRequest({
  assessment: overviewCritical,
  contextSnapshot: fixtures.vehicleDisabledFixture,
});
assert.strictEqual(overviewCritical.status, 'critical', 'Vehicle disabled fixture should make overview critical.');
assert.ok(
  overviewRequest.reportInput.notes.includes('Top concern') || overviewRequest.reportInput.assessmentEscalation.summary.includes('leading'),
  'Overview critical escalation should include top concern context.',
);

const normalRoute = assessmentFor(fixtures.allSystemsNormalFixture, 'route');
assert.strictEqual(normalRoute.status, 'normal', 'Normal route fixture should remain normal.');
assert.strictEqual(shouldOfferIncidentEscalation(normalRoute), false, 'Non-critical assessment should not force escalation.');

incidentRecoveryWorkflowStore.clear();
const incident = incidentRecoveryWorkflowStore.reportIncident(vehicleRequest.reportInput);
assert.strictEqual(incident.type, 'vehicle_breakdown', 'Escalation report input should create an existing incident workflow item.');
assert.strictEqual(
  incident.metadata.assessmentEscalation.category,
  'vehicles',
  'Created incident should retain assessment escalation metadata.',
);
assert.ok(
  incident.metadata.assessmentEscalation.dataUsed.length > 0,
  'Created incident should retain data-used context.',
);
incidentRecoveryWorkflowStore.clear();

const detailViewSource = fs.readFileSync(detailViewPath, 'utf8');
const expeditionTabSource = fs.readFileSync(expeditionTabPath, 'utf8');
const incidentPanelSource = fs.readFileSync(incidentPanelPath, 'utf8');
const reportModalSource = fs.readFileSync(reportModalPath, 'utf8');
const packageSource = fs.readFileSync(packagePath, 'utf8');

assert.ok(detailViewSource.includes("assessment?.status === 'critical'"), 'Critical assessments should show the escalation banner.');
assert.ok(expeditionTabSource.includes('buildAssessmentEscalationRequest'), 'Expedition tab should build escalation context.');
assert.ok(expeditionTabSource.includes('assessmentEscalation={assessmentEscalation}'), 'Expedition tab should pass escalation context to Incident & Recovery.');
assert.ok(incidentPanelSource.includes('setReportModalVisible(true)'), 'Incident panel should open the Report Incident flow.');
assert.ok(incidentPanelSource.includes('prefill={reportPrefill}'), 'Incident panel should pass escalation prefill into Report Incident.');
assert.ok(reportModalSource.includes('prefill?.assessmentEscalation'), 'Report Incident should submit assessment escalation metadata.');
assert.ok(packageSource.includes('test:expedition-incident-escalation'), 'Package scripts should include escalation tests.');

console.log('Expedition incident escalation wiring checks passed.');
