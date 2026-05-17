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
const invariantSource = read('lib/ai/commandStateInvariantChecks.ts');
const staleSource = read('lib/ai/staleCandidateResolver.ts');
const scenarioSource = read('lib/ai/commandStateScenarioTests.ts');
const selectorSource = read('lib/ai/useECSAI.ts');

assert(
  orchestratorSource.includes('buildCommandStateDiagnostics') &&
    orchestratorSource.includes('hardenCommandStateCandidates') &&
    orchestratorSource.includes('qaDiagnostics'),
  'aiOrchestrator.ts should harden candidates and attach QA diagnostics to orchestrator output.',
);

assert(
  invariantSource.includes("code: 'route_issue_missing_from_navigate'") &&
    invariantSource.includes("code: 'fleet_route_urgency_lead'") &&
    invariantSource.includes("code: 'telemetry_status_conflict'") &&
    invariantSource.includes("code: 'weather_status_conflict'"),
  'commandStateInvariantChecks.ts should define core cross-tab invariant checks for route, fleet, telemetry, and weather consistency.',
);

assert(
  staleSource.includes('phaseChanged') &&
    staleSource.includes('PLANNING_ROOTS') &&
    staleSource.includes('duplicated a calmer higher-priority command state'),
  'staleCandidateResolver.ts should suppress stale phase-shifted candidates and duplicated low-priority summaries.',
);

[
  'manual-baseline-online-no-expedition',
  'staging-partial-offline-readiness',
  'transit-healthy-guidance',
  'active-expedition-tightening-fuel',
  'active-expedition-stale-weather-ble',
  'camp-overnight-weather-risk',
  'recovery-exit-weak-gps',
  'explore-incomplete-vehicle-baseline',
  'syncing-during-active-navigation',
].forEach((scenarioId) => {
  assert(
    scenarioSource.includes(`id: '${scenarioId}'`),
    `commandStateScenarioTests.ts should include the ${scenarioId} release scenario.`,
  );
});

assert(
  selectorSource.includes('commandStateDiagnostics: aiState?.orchestrator?.qaDiagnostics ?? null'),
  'useECSAI.ts should expose command-state diagnostics for internal QA/admin consumers.',
);

console.log('command-state hardening checks passed');
