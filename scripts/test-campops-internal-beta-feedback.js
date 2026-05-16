const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const campops = require(campOpsPath);

const nowIso = '2026-05-01T12:00:00.000Z';

campops.resetCampOpsTelemetryForTest();
campops.configureCampOpsTelemetry({
  campopsTelemetryEnabled: true,
  sinkApproved: true,
  campopsTelemetrySinkApproved: true,
  sink: () => {
    throw new Error('Feedback capture must not emit CampOps telemetry.');
  },
});

const record = campops.createCampOpsInternalBetaFeedbackRecord(
  {
    userId: 'private-user-id',
    vehicleId: 'vehicle-123',
    vehicleProfileId: 'profile-456',
    location: {
      latitude: 38.780712,
      longitude: -121.207612,
    },
    rawAiPrompt: 'raw prompt should never be stored',
    privateDebriefNotes: 'private debrief notes should never be stored',
    testerRole: 'engineering',
    buildLabel: 'internal-beta-build',
    regionLabel: 'Northern Sierra label only',
    routeLabel: 'Bowman route label only',
    notes: 'UI cramped near 38.780712,-121.207612 and lat=38.780712 looked too precise.',
    structured: {
      recommendationUseful: 'yes',
      recommendationConfusing: 'mixed',
      endpointFeltWrong: 'no',
      staleMissingWarningUnclear: 'yes',
      sourceConfidenceUnclear: 'yes',
      aiWordingConcern: 'not_tested',
      legacyResultConflict: 'mixed',
      mobileUiOverflowOrCramped: 'yes',
      actionButtonIssue: 'no',
      privacyConcern: 'no',
      providerDataAppearedWrong: 'yes',
      twoHourDelayFlowUseful: 'yes',
      decisionPointUseful: 'mixed',
    },
  },
  nowIso,
);

assert.strictEqual(record.visibility, 'private', 'Feedback should default to private.');
assert.strictEqual(record.privacy.preciseLocationStored, false, 'Precise coordinates must not be stored.');
assert.strictEqual(record.privacy.privateUserIdStored, false, 'Private user ids must not be stored.');
assert.strictEqual(record.privacy.vehicleIdentifierStored, false, 'Vehicle identifiers must not be stored.');
assert.strictEqual(record.privacy.rawAiPromptStored, false, 'Raw AI prompts must not be stored.');
assert.strictEqual(record.privacy.privateDebriefNotesStored, false, 'Private debrief notes must not be stored.');
assert.strictEqual(record.privacy.communityPublishingPath, false, 'Internal beta feedback must not have a community publishing path.');
assert.strictEqual(record.privacy.telemetryEmitted, false, 'Internal beta feedback must not emit telemetry by default.');
assert.ok(!JSON.stringify(record).includes('private-user-id'), 'Record must not include private user id.');
assert.ok(!JSON.stringify(record).includes('vehicle-123'), 'Record must not include vehicle id.');
assert.ok(!JSON.stringify(record).includes('profile-456'), 'Record must not include vehicle profile id.');
assert.ok(!JSON.stringify(record).includes('raw prompt'), 'Record must not include raw AI prompt.');
assert.ok(!JSON.stringify(record).includes('private debrief'), 'Record must not include private debrief notes.');
assert.ok(!JSON.stringify(record).includes('38.780712,-121.207612'), 'Notes must redact coordinate pairs.');
assert.ok(record.notes.includes('[redacted coordinates]'), 'Notes should retain useful text with coordinates redacted.');
assert.ok(record.notes.includes('lat=[redacted]'), 'Notes should redact labeled coordinates.');

const backend = new campops.MemoryCampOpsInternalBetaFeedbackBackend();
const service = new campops.CampOpsInternalBetaFeedbackService(backend);

service
  .captureFeedback({
    visibility: 'internal_review',
    testerRole: 'product',
    regionLabel: 'region-001',
    structured: {
      recommendationUseful: 'mixed',
      mobileUiOverflowOrCramped: 'yes',
    },
    notes: 'Long camp name overflowed on small Android screen.',
  })
  .then((result) => {
    assert.strictEqual(result.ok, true, 'Feedback service should capture feedback.');
    assert.strictEqual(backend.records.length, 1, 'Memory backend should receive one record.');
    assert.strictEqual(campops.getCampOpsTelemetryEventsForTest().length, 0, 'Feedback capture must not emit telemetry.');

    const reviewExport = campops.exportCampOpsInternalBetaFeedbackForReview([record, result.data], nowIso);
    assert.strictEqual(reviewExport.feedbackCount, 2, 'Review export should include feedback count.');
    assert.strictEqual(reviewExport.issueCounts.recommendationUseful, 2, 'Review export should summarize useful/mixed feedback.');
    assert.strictEqual(reviewExport.issueCounts.mobileUiOverflowOrCramped, 2, 'Review export should summarize UI issues.');
    assert.ok(!JSON.stringify(reviewExport).includes('private-user-id'), 'Review export must omit private user ids.');
    assert.ok(!JSON.stringify(reviewExport).includes('38.780712,-121.207612'), 'Review export must omit precise coordinates.');
    assert.ok(!('communityPublishingState' in reviewExport.items[0]), 'Review export must not expose community publishing state.');

    console.log('CampOps internal beta feedback checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
