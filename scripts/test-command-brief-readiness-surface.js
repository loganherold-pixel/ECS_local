/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const commandBrief = fs.readFileSync(path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const tripIntentSelector = fs.readFileSync(path.join(root, 'components', 'readiness', 'TripIntentSelector.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

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

const scoring = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));
const fixtures = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessFixtures.ts'));
const {
  buildCommandBriefPresentation,
} = require(path.join(root, 'lib', 'brief', 'commandBriefPresentation.ts'));

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = source.indexOf(endFragment, start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return source.slice(start, end);
}

const readyAssessment = scoring.buildExpeditionReadiness(fixtures.completeReadyReadinessFixture);
const cautionAssessment = {
  ...readyAssessment,
  status: 'caution',
  overallScore: 72,
  confidence: 'medium',
  blockers: [],
  warnings: [{
    id: 'weather-review',
    categoryId: 'weather_window',
    label: 'Weather review',
    detail: 'Forecast freshness needs review before departure.',
    severity: 'warning',
  }],
  recommendations: [
    'Refresh the weather forecast.',
    'Confirm the planned departure window.',
  ],
};
const holdAssessment = scoring.buildExpeditionReadiness(fixtures.holdReadinessFixture);
const staleAssessment = {
  ...cautionAssessment,
  sourceFreshness: {
    ...cautionAssessment.sourceFreshness,
    weather: {
      ...cautionAssessment.sourceFreshness.weather,
      state: 'stale',
      isStale: true,
      label: 'Weather forecast',
    },
  },
};
const missingAssessment = {
  ...cautionAssessment,
  sourceFreshness: {
    ...cautionAssessment.sourceFreshness,
    weather: {
      ...cautionAssessment.sourceFreshness.weather,
      state: 'missing',
      source: 'missing',
      isMissing: true,
      isStale: false,
      label: 'Weather forecast',
    },
  },
};
const inferredAssessment = {
  ...cautionAssessment,
  sourceFreshness: {
    ...cautionAssessment.sourceFreshness,
    route: {
      ...cautionAssessment.sourceFreshness.route,
      state: 'inferred',
      source: 'inferred',
      isInferred: true,
      label: 'Route context',
    },
  },
};

const readyPresentation = buildCommandBriefPresentation(readyAssessment);
const cautionPresentation = buildCommandBriefPresentation(cautionAssessment);
const holdPresentation = buildCommandBriefPresentation(holdAssessment);
const stalePresentation = buildCommandBriefPresentation(staleAssessment);
const missingPresentation = buildCommandBriefPresentation(missingAssessment);
const inferredPresentation = buildCommandBriefPresentation(inferredAssessment);
const unavailablePresentation = buildCommandBriefPresentation(null);

assert.strictEqual(readyPresentation.decision.label, 'GO');
assert.strictEqual(cautionPresentation.decision.label, 'CAUTION');
assert.strictEqual(holdPresentation.decision.label, 'HOLD');
assert.strictEqual(unavailablePresentation.decision.label, 'HOLD');

assert.match(readyPresentation.decision.meaning, /^GO means /);
assert.match(cautionPresentation.decision.meaning, /^CAUTION means /);
assert.match(holdPresentation.decision.meaning, /^HOLD means /);
assert.ok(
  !cautionPresentation.decision.meaning.includes('Forecast freshness needs review'),
  'Decision meaning must not duplicate the current assessment rationale.',
);
assert.ok(
  !holdPresentation.decision.meaning.includes(holdAssessment.blockers[0].detail),
  'Hold decision meaning must remain a definition instead of becoming a blocker list.',
);

for (const presentation of [
  readyPresentation,
  cautionPresentation,
  holdPresentation,
  stalePresentation,
  missingPresentation,
  inferredPresentation,
  unavailablePresentation,
]) {
  assert.ok(
    presentation.departureAudit.paragraphs.length >= 1
      && presentation.departureAudit.paragraphs.length <= 2,
    'Departure Audit must produce one or two paragraphs.',
  );
  presentation.departureAudit.paragraphs.forEach((paragraph) => {
    assert.ok(paragraph.trim().length > 0, 'Departure Audit paragraphs must not be empty.');
    assert.ok(!/legal campsite|guaranteed safe|AI says/i.test(paragraph), 'Departure Audit must preserve ECS truthfulness language.');
  });
}

assert.ok(
  cautionPresentation.departureAudit.paragraphs.join(' ').includes('Forecast freshness needs review before departure.'),
  'Departure Audit should explain the deterministic reason for CAUTION.',
);
assert.ok(
  cautionPresentation.departureAudit.paragraphs.join(' ').includes('Refresh the weather forecast'),
  'Departure Audit should explain how to improve the decision.',
);
assert.strictEqual(stalePresentation.departureAudit.sourceState, 'limited');
assert.match(
  stalePresentation.departureAudit.paragraphs.join(' '),
  /stale: Weather forecast/i,
  'Departure Audit should identify stale source state.',
);
assert.match(
  missingPresentation.departureAudit.paragraphs.join(' '),
  /missing: Weather forecast/i,
  'Departure Audit should identify missing source state.',
);
assert.match(
  inferredPresentation.departureAudit.paragraphs.join(' '),
  /ECS-inferred: Route context/i,
  'Departure Audit should identify inferred source state.',
);
assert.strictEqual(unavailablePresentation.departureAudit.sourceState, 'unavailable');

[
  '<TripIntentSelector',
  '<WeakPointAnalyzerPanel assessment={weakPointAssessment} />',
  'Go / Caution / Hold Decision',
  '<DepartureAuditNarrative',
  'Share Packet',
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should keep the requested surface: ${fragment}`);
});

[
  'Hold Blockers',
  'Preference Influence',
  'Route Intelligence',
  'Vehicle Fit',
  'CampOps / Camp Legality Confidence',
  'Weather + Daylight Window',
  'Offline Preparedness',
  'Fuel / Power / Range',
  'Recovery + Bailout Plan',
  'Communications / Signal Confidence',
  'Coordinate In Dispatch',
  'Open Mission Command',
  'MissionCommandProposalAction',
  'DepartureAuditChecklist',
  '<OperationalDeltaBriefCard',
  '<CampDecisionClockBriefModule',
].forEach((fragment) => {
  assertNotIncludes(commandBrief, fragment, `Command Brief should not mount obsolete detail: ${fragment}`);
});

const decisionBlock = blockBetween(
  commandBrief,
  '<View style={[styles.decisionCard, commandBriefFleetSurfaceStyle]}>',
  '<DepartureAuditNarrative',
);
assertNotIncludes(decisionBlock, 'numberOfLines=', 'Decision explanation should render without a line clamp.');
assertNotIncludes(decisionBlock, 'ReadinessScoreRing', 'Decision card should not duplicate the header score.');
assertNotIncludes(decisionBlock, 'Confidence:', 'Decision card should leave rationale and confidence to Departure Audit.');

const auditBlock = blockBetween(
  commandBrief,
  'function DepartureAuditNarrative',
  'function weakPointFact',
);
assertNotIncludes(auditBlock, 'numberOfLines=', 'Departure Audit paragraphs should render without a line clamp.');
assertIncludes(auditBlock, 'ECS Intelligence / deterministic readiness explanation', 'Departure Audit should identify its grounded explanation source.');

assertIncludes(commandBrief, 'fitAllIntents', 'All Trip Intent controls should remain visible.');
assertIncludes(tripIntentSelector, "flexWrap: 'wrap'", 'Trip Intent should preserve the compact wrapped layout.');
assertIncludes(commandBrief, 'exportCommandBriefPacket', 'Share Packet should preserve the authoritative export path.');
assertIncludes(commandBrief, 'getCachedActiveVehicleReadinessInput', 'Weak Point and packet context should retain active Fleet state.');
assertIncludes(dashboard, '<CommandBriefScreen embedded />', 'Dashboard ECS Brief should mount the canonical Command Brief.');
assertIncludes(dashboard, 'class DashboardBriefErrorBoundary extends React.Component', 'Dashboard should preserve the Command Brief error boundary.');
assertIncludes(packageSource, '"test:command-brief-readiness": "node ./scripts/test-command-brief-readiness-surface.js"', 'Package scripts should expose this behavioral contract.');

console.log('Command Brief compact presentation behavior checks passed.');
