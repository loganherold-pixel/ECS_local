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
    orchestratorTypesSource.includes('unresolvedRiskSummary: ECSReleaseRiskSummary') &&
    orchestratorTypesSource.includes('qaSummary: ECSReleaseQaSummary'),
  'orchestratorTypes.ts should define release diagnostics and the expanded invariant surface.',
);

[
  'fleet_surface',
  'navigate_surface',
  'dashboard_surface',
  'explore_surface',
  'alert_surface',
  'brief_surface',
  'expedition_readiness_command_brief',
  'dispersed_camping_eligibility',
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
  'expedition_readiness_category_gap',
  'expedition_readiness_score_integrity',
  'expedition_readiness_status_contradiction',
  'expedition_readiness_unsafe_wording',
  'expedition_readiness_synthetic_truth_gap',
  'expedition_readiness_weather_freshness_gap',
  'expedition_readiness_vehicle_truth_gap',
  'expedition_readiness_offline_truth_gap',
  'dispersed_camping_copy_guardrail_gap',
  'dispersed_camping_classification_guardrail_gap',
  'dispersed_camping_overlay_lifecycle_gap',
  'dispersed_camping_candidate_generation_gap',
  'dispersed_camping_data_freshness_gap',
  'dispersed_camping_beta_flag_gap',
].forEach((issueCode) => {
  assert(
    releaseChecksSource.includes(`code: '${issueCode}'`) || releaseChecksSource.includes(`'${issueCode}'`),
    `releaseReadinessChecks.ts should account for ${issueCode}.`,
  );
});

[
  'Data grounding',
  'Score integrity',
  'Missing data handling',
  'Legal/camp confidence wording',
  'Vehicle-aware behavior',
  'Offline readiness accuracy',
  'Weather freshness',
  'Route preview integration',
  'Active guidance integration',
  'Command Brief behavior',
  'Dashboard widget behavior',
  'Alert/Dispatch integration',
  'AI/ECS Intelligence grounding',
  'Android layout safety',
  'No mock data presented as live',
  'Dispersed Camping Eligibility',
  'ECS-Inferred pins',
  'stale/offline labels',
  'explicit Scout action',
].forEach((categoryLabel) => {
  assert(
    masterChecklistSource.includes(categoryLabel),
    `Expedition Readiness release checklist should mention ${categoryLabel}.`,
  );
});

['passed', 'riskLevel', 'blockers', 'warnings', 'recommendedFixes'].forEach((key) => {
  assert(
    releaseChecksSource.includes(`${key}:`) || releasePolishTypesSource.includes(`${key}:`),
    `Release QA summary should expose ${key}.`,
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
    debugSelectorSource.includes('selectReleaseRiskSummary') &&
    debugSelectorSource.includes('selectReleaseQaSummary'),
  'Internal selectors should expose release-readiness diagnostics for QA/admin use.',
);

assert(
  packageSource.includes('"test:release-readiness"'),
  'package.json should expose a release-readiness sweep test script.',
);

assert(
  packageSource.includes('"test:pre-closed-field-gate"') &&
    packageSource.includes('"gate:release-approval-overrides"'),
  'package.json should expose aggregate pre-closed-field and release override gate regressions.',
);

assert(
  packageSource.includes('"gate:dispatch-convoy-production"') &&
    packageSource.includes('"test:dispatch-convoy-production"'),
  'package.json should expose Dispatch/Convoy production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:established-campgrounds-production"') &&
    packageSource.includes('"test:established-campgrounds-production"'),
  'package.json should expose established campgrounds production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:bluetooth-power-obd2-production"') &&
    packageSource.includes('"test:bluetooth-power-obd2-production"'),
  'package.json should expose Bluetooth/Power/OBD2 production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:offline-navigation-production"') &&
    packageSource.includes('"test:offline-navigation-production"'),
  'package.json should expose Offline Navigation production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:weather-production"') &&
    packageSource.includes('"test:weather-production"'),
  'package.json should expose Weather production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:garmin-inreach-production"') &&
    packageSource.includes('"test:garmin-inreach-production"'),
  'package.json should expose Garmin/inReach production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:auth-production"') &&
    packageSource.includes('"test:auth-production"'),
  'package.json should expose Auth/session production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:ecs-brief-production"') &&
    packageSource.includes('"test:ecs-brief-production"'),
  'package.json should expose ECS Brief production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:incident-recovery-production"') &&
    packageSource.includes('"test:incident-recovery-production"'),
  'package.json should expose Incident & Recovery production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:field-utilities-production"') &&
    packageSource.includes('"test:field-utilities-production"'),
  'package.json should expose Field Utilities production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:explore-trail-packs-production"') &&
    packageSource.includes('"test:explore-trail-packs-production"'),
  'package.json should expose Explore Trail Packs production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:fleet-production"') &&
    packageSource.includes('"test:fleet-production"'),
  'package.json should expose Fleet production gate and regression scripts.',
);

assert(
  packageSource.includes('"gate:dashboard-production"') &&
    packageSource.includes('"test:dashboard-production"'),
  'package.json should expose Dashboard production gate and regression scripts.',
);

console.log('release-readiness sweep checks passed');
