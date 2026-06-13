const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const commandBrief = fs.readFileSync(path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

[
  'Command Brief',
  'ECS Expedition Readiness',
  'No active expedition brief.',
  'Planning Brief',
  'Active Expedition Brief',
  'Preference Influence',
  'Go / Caution / Hold Decision',
  'Route Intelligence',
  'Vehicle Fit',
  'CampOps / Camp Legality Confidence',
  'Camp Decision Clock',
  'Departure Delta Brief',
  'Weak Point Analyzer',
  'What breaks first?',
  'Internal beta / restricted field-test',
  'Primary weak point:',
  'Most severe consequence:',
  'Easiest fix before departure:',
  'Monitor during travel:',
  'Assessment completeness:',
  'Provenance / trace:',
  'Source facts:',
  'Scoring trace:',
  'Advisory only.',
  'What changed since last check?',
  'No comparable previous departure audit available.',
  'auditComparison',
  'departureDeltaBriefUnavailableCopy',
  "result.auditComparison.status !== 'comparable'",
  'New blockers',
  'Resolved blockers',
  'Stale inputs',
  'Changed vehicle/loadout values',
  'Offline package regressions',
  'Camp confidence changes',
  'Updated posture',
  'Continue to planned camp until:',
  'After that, divert to backup endpoint',
  'Divert to backup endpoint now.',
  'Emergency endpoint remains viable until:',
  'Main risk:',
  'Feature flagged',
  'continueCutoffPassed',
  'Weather + Daylight Window',
  'Offline Preparedness',
  'Fuel / Power / Range',
  'Recovery + Bailout Plan',
  'Communications / Signal Confidence',
  'Share Packet',
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should render "${fragment}".`);
});

[
  'useCurrentExpeditionReadiness',
  'useReadinessDecision',
  'useCanStartExpedition',
  'useExpeditionReadinessState',
  'campDecisionClock',
  'campDecisionClockEnabled',
  'isCampDecisionClockFeatureEnabled',
  'useCampDecisionClockRuntimeNow',
  'nextCampDecisionClockDeadlineMs',
  "AppState.addEventListener('change'",
  'useFocusEffect',
  'departureDeltaBriefEnabled',
  'buildDepartureDeltaBrief',
  'isDepartureDeltaBriefFeatureEnabled',
  'weakPointAnalyzerEnabled',
  'scoreExpeditionWeakPoints',
  'buildExpeditionReadinessSnapshotForWeakPoints',
  'isWeakPointAnalyzerFeatureEnabled',
  'assessment.assessmentCompleteness',
  'assessment.snapshotCoverage.domains',
  'assessment.sourceFacts.length',
  'assessment.scoringTrace.length',
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should consume readiness selector "${fragment}".`);
});

[
  'Copy packet',
  'Share packet',
  'Save locally',
  "pushRoute('/navigate')",
  "pushRoute('/discover')",
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief should expose action "${fragment}".`);
});

[
  'CollapsibleBriefSection',
  'accessibilityState={{ expanded }}',
  'defaultExpanded = false',
  'expanded ? badge : null',
  "expanded ? 'chevron-up-outline' : 'chevron-down-outline'",
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief detail sections should use collapsed title-first disclosure: ${fragment}`);
});

[
  "import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';",
  'const commandBriefFleetSurfaceStyle: ViewStyle = {',
  'backgroundColor: ECS_SURFACE.background.selected',
  'borderColor: ECS_SURFACE.border.selected',
  'style={commandBriefFleetSurfaceStyle}',
  'intentChipStyle={commandBriefFleetSurfaceStyle}',
  'rowStyle={commandBriefFleetSurfaceStyle}',
].forEach((fragment) => {
  assertIncludes(commandBrief, fragment, `Command Brief boxes should match the active Fleet vehicle card surface: ${fragment}`);
});

[
  'campCandidateRow',
  'ctaButton',
  'vehicleHeroRow',
  'vehicleBriefList',
  'recoveryMetric',
  'recoveryInferredNotice',
  'recoveryPrepList',
  'campDecisionClockCard',
  'campDecisionClockLine',
  'departureDeltaBriefCard',
  'departureDeltaBriefSection',
  'weakPointAnalyzerCard',
  'weakPointAnalyzerRow',
  'actionRow',
].forEach((styleName) => {
  const start = commandBrief.indexOf(`${styleName}: {`);
  assert.notStrictEqual(start, -1, `Command Brief should define ${styleName}.`);
  const end = commandBrief.indexOf('},', start);
  const block = commandBrief.slice(start, end);
  assertIncludes(block, 'backgroundColor: ECS_SURFACE.background.selected', `${styleName} should use the Fleet vehicle card background.`);
  assertIncludes(block, 'borderColor: ECS_SURFACE.border.selected', `${styleName} should use the Fleet vehicle card border.`);
});

assertNotIncludes(commandBrief, 'Expedition Readiness Summary', 'Command Brief should not duplicate the removed readiness summary card.');
assertNotIncludes(commandBrief, 'Recommended Actions', 'Command Brief should not render the removed recommended actions container.');
assertNotIncludes(commandBrief, 'Watch Items', 'Command Brief should not render the removed watch items container.');
assertNotIncludes(commandBrief, 'MissionBriefCadLog', 'Command Brief should not render the obsolete visual activity log.');
assertIncludes(
  commandBrief,
  'getCachedActiveVehicleReadinessInput',
  'Command Brief should cache active vehicle readiness snapshots for useSyncExternalStore.',
);
assertNotIncludes(
  commandBrief,
  '() => buildReadinessVehicleInputFromFleetState(getActiveVehicleState())',
  'Command Brief must not return a fresh vehicle readiness object from getSnapshot.',
);
assertIncludes(dashboard, '<CommandBriefScreen embedded />', 'Dashboard ECS Brief should mount Command Brief without the obsolete activity log.');
assertIncludes(
  packageSource,
  '"test:command-brief-readiness": "node ./scripts/test-command-brief-readiness-surface.js"',
  'package.json should expose the Command Brief readiness regression test.',
);
assertIncludes(
  packageSource,
  '"test:camp-decision-clock": "node ./scripts/test-camp-decision-clock.js"',
  'package.json should expose the Camp Decision Clock regression test.',
);
assertIncludes(
  packageSource,
  '"test:departure-delta-brief": "node ./scripts/test-departure-delta-brief.js"',
  'package.json should expose the Departure Delta Brief regression test.',
);
assertIncludes(
  packageSource,
  '"test:expedition-weak-point-analyzer": "node ./scripts/test-expedition-weak-point-analyzer.js"',
  'package.json should expose the Expedition weak-point analyzer regression test.',
);
assertIncludes(
  commandBrief,
  'campDecisionClockEnabled ? <CampDecisionClockBriefModule decision={campDecisionClock} /> : null',
  'Command Brief should render the Camp Decision Clock module only behind the runtime feature flag.',
);
assertIncludes(
  commandBrief,
  'nowMs >= continueCutoffMs',
  'Command Brief should transition to divert-now at continueUntil, not after it.',
);
assertIncludes(
  commandBrief,
  'emergencyViabilityExpired',
  'Command Brief should stop presenting expired emergency viability as active guidance.',
);
assertIncludes(
  commandBrief,
  'Emergency endpoint viability expired.',
  'Command Brief should render an expired emergency endpoint as unavailable/equivalent guidance.',
);
assertIncludes(
  commandBrief,
  'Camp Decision Clock disabled',
  'Command Brief should keep disabled Camp Decision Clock guidance out of the user-facing section stack.',
);
assertIncludes(
  commandBrief,
  'departureDeltaBriefEnabled ? <DepartureDeltaBriefPanel result={departureDeltaBrief} /> : null',
  'Command Brief should render the Departure Delta Brief panel only behind the feature flag.',
);
assertIncludes(
  commandBrief,
  'result.auditComparison.warnings[0]',
  'Command Brief should surface compact audit-comparison stale/unavailable reasons without raw debug metadata.',
);
assertIncludes(
  commandBrief,
  'weakPointAnalyzerEnabled ? <WeakPointAnalyzerPanel assessment={weakPointAssessment} /> : null',
  'Command Brief should render the Weak Point Analyzer panel only behind the feature flag.',
);

assertNotIncludes(commandBrief, 'AI says', 'Command Brief must not use generic AI labeling.');
assertNotIncludes(commandBrief.toLowerCase(), 'legal campsite', 'Command Brief must not guarantee legal campsite status.');
assertNotIncludes(commandBrief.toLowerCase(), 'safe as', 'Command Brief must not present safety as an absolute guarantee.');
assertNotIncludes(commandBrief.toLowerCase(), 'onx', 'Command Brief must not contain OnX comparison copy.');

console.log('Command Brief readiness surface checks passed.');
