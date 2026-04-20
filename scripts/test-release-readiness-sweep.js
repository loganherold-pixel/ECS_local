const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const orchestratorSource = read('lib/ai/aiOrchestrator.ts');
const orchestratorTypesSource = read('lib/ai/orchestratorTypes.ts');
const invariantSource = read('lib/ai/commandStateInvariantChecks.ts');
const releaseChecksSource = read('lib/ai/releaseReadinessChecks.ts');
const releaseScenarioSource = read('lib/ai/releaseScenarioMatrix.ts');
const selectorSource = read('lib/ai/useECSAI.ts');
const debugSelectorSource = read('lib/ai/commandStateDebugSelectors.ts');
const masterChecklistSource = read('lib/ai/masterReleaseChecklist.ts');
const releaseRiskSummarySource = read('lib/ai/releaseRiskSummary.ts');
const releasePolishTypesSource = read('lib/ai/releasePolishAuditTypes.ts');
const packageSource = read('package.json');

assert(
  orchestratorSource.includes('buildReleaseReadinessDiagnostics') &&
    orchestratorSource.includes('releaseDiagnostics'),
  'aiOrchestrator.ts should attach release-readiness diagnostics to orchestrator output.',
);

assert(
  orchestratorTypesSource.includes('ECSReleaseReadinessDiagnostics') &&
    orchestratorTypesSource.includes('offline_capable_status_conflict') &&
    orchestratorTypesSource.includes('releaseDiagnostics?: ECSReleaseReadinessDiagnostics | null') &&
    orchestratorTypesSource.includes('masterChecklist: ECSReleaseChecklistSection[]') &&
    orchestratorTypesSource.includes('unresolvedRiskSummary: ECSReleaseRiskSummary'),
  'orchestratorTypes.ts should define release diagnostics and the expanded invariant surface.',
);

[
  'fleet_surface',
  'navigate_surface',
  'dashboard_surface',
  'explore_surface',
  'alert_surface',
  'brief_surface',
  'shell_surface',
  'shared_command_stack',
  'shell_restore',
  'degraded_offline',
  'visual_layout',
  'advisory_noise',
  'wording',
  'admin_cleanliness',
].forEach((sectionId) => {
  assert(
    masterChecklistSource.includes(`id: '${sectionId}'`),
    `masterReleaseChecklist.ts should include the ${sectionId} checklist section.`,
  );
});

['mustFix', 'shouldFix', 'safeToDefer'].forEach((key) => {
  assert(
    releaseRiskSummarySource.includes(`${key}:`) || releasePolishTypesSource.includes(`${key}: string[]`),
    `Release risk summary should expose ${key}.`,
  );
});

[
  'cross_tab_blockers',
  'stale_signal_churn',
  'route_lead_gap',
  'offline_capable_conflict',
  'minimal_mode_noise',
  'planning_phase_ownership_gap',
  'missing_lead_target',
].forEach((issueCode) => {
  assert(
    releaseChecksSource.includes(`code: '${issueCode}'`) || releaseChecksSource.includes(`'${issueCode}'`),
    `releaseReadinessChecks.ts should account for ${issueCode}.`,
  );
});

[
  'manual-baseline-no-expedition',
  'staging-incomplete-offline-prep',
  'transit-healthy-route-guidance',
  'trail-entry-rising-route-risk',
  'active-expedition-tightening-fuel-margin',
  'active-expedition-degraded-ble',
  'stale-weather-healthy-route-guidance',
  'camp-overnight-weather-and-power',
  'recovery-exit-weak-gps-bailout',
  'explore-incomplete-vehicle-baseline',
  'admin-access-clean-production-flow',
  'privileged-access-poor-connectivity',
  'minimal-advisory-active-navigation',
].forEach((scenarioId) => {
  assert(
    releaseScenarioSource.includes(`id: '${scenarioId}'`),
    `releaseScenarioMatrix.ts should include the ${scenarioId} release scenario.`,
  );
});

assert(
  invariantSource.includes("code: 'offline_capable_status_conflict'"),
  'commandStateInvariantChecks.ts should guard offline-capable wording conflicts.',
);

assert(
  selectorSource.includes('releaseReadinessDiagnostics: aiState?.orchestrator?.releaseDiagnostics ?? null') &&
    debugSelectorSource.includes('selectReleaseReadinessDiagnostics') &&
    debugSelectorSource.includes('selectMasterReleaseChecklist') &&
    debugSelectorSource.includes('selectReleaseRiskSummary'),
  'Internal selectors should expose release-readiness diagnostics for QA/admin use.',
);

assert(
  packageSource.includes('"test:release-readiness"'),
  'package.json should expose a release-readiness sweep test script.',
);

console.log('release-readiness sweep checks passed');
