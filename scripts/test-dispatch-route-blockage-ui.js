const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const domain = read('lib/dispatchRouteBlockagePlaybook.ts');
const adapter = read('lib/dispatchRouteBlockageRuntimeAdapter.ts');
const component = read('components/dispatch/DispatchRouteBlockagePlaybook.tsx');
const board = read('components/dispatch/DispatchMissionCommandBoard.tsx');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');
const rollout = read('lib/dispatchRolloutConfig.ts');

assert.match(component, /DispatchOperationalPlaybookRunner/);
assert.match(component, /Route Blockage/);
assert.match(component, /member or community report is not an official closure/i);
assert.match(component, /Nothing reroutes or publishes automatically/i);
assert.match(component, /Command Composer still requires a separate submission/i);
assert.match(component, /accessibilityRole="radio"/);
assert.match(component, /accessibilityRole="checkbox"/);
assert.match(component, /stackBehavior="allow-stack"/);
assert.match(component, /flexWrap: 'wrap'/);
assert.match(component, /minHeight: 44/);

assert.match(adapter, /nearestPointOnRoute/);
assert.match(adapter, /compareRoutePlans/);
assert.match(adapter, /offlineReadinessState/);
assert.match(adapter, /CampOps/);
assert.doesNotMatch(adapter, /routeStore\.setActive|startGuidance|replaceActiveGuidance/);

assert.match(domain, /shouldProtectActiveGuidanceFromHandoff/);
assert.match(domain, /ROUTE_BLOCKAGE_PUBLIC_PUBLISHING_ENABLED = false/);
assert.match(domain, /legalAccessEvidence/);
assert.match(domain, /currentConditionEvidence/);
assert.match(domain, /publicPublishingAllowed: false/);

assert.match(board, /onOpenRouteBlockage/);
assert.match(board, /label="Route Blockage"/);
assert.match(commandCenter, /DispatchRouteBlockagePlaybook/);
assert.match(commandCenter, /requestedOperationalPlaybook === 'route_blockage'/);
assert.match(commandCenter, /operationalPlaybook=route_blockage/);
assert.match(commandCenter, /missionCommandEnabled && routeBlockageVisible/);
assert.match(commandCenter, /offlineReadinessCoordinator\.getLatestForRoute/);
assert.match(commandCenter, /setRouteBlockageIncidentPrefill/);
assert.match(rollout, /missionCommand: false/);

for (const source of [domain, adapter, component]) {
  assert.doesNotMatch(source, /contactEmergencyServices|sendSms|placePhoneCall|publishHazardPublicly/);
  assert.doesNotMatch(source, /setInterval/);
}

console.log('Dispatch Route Blockage runtime and UI checks passed.');
