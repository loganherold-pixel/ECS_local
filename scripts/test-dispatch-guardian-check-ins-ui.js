const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const component = read('components/dispatch/DispatchGuardianCheckIns.tsx');
const board = read('components/dispatch/DispatchMissionCommandBoard.tsx');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');
const domain = read('lib/dispatchGuardianCheckInDomain.ts');
const persistence = read('lib/dispatchPersistenceAdapter.ts');
const rollout = read('lib/dispatchRolloutConfig.ts');

for (const label of [
  'Fixed Time', 'Recurring', 'Route Checkpoint', 'Rally Arrival', 'Camp Arrival',
  'Remote Segment', 'Operator Request', 'Post-Incident', 'Manual One-Time',
]) {
  assert.match(component, new RegExp(label));
}
assert.match(component, /Prepare Guardian Check-In\?/);
assert.match(component, /Nothing is sent until you explicitly submit the command/);
assert.match(component, /Record No Response\?/);
assert.match(component, /does not declare an emergency, contact anyone, or transmit externally/);
assert.match(component, /local self check-in/i);
assert.match(component, /Source age/);
assert.match(component, /Location accuracy/);
assert.match(component, /accessibilityRole="radio"/);
assert.match(component, /accessibilityRole="checkbox"/);
assert.match(component, /Current Dispatch permissions do not allow a Guardian Check-In target/);
assert.match(component, /stackBehavior="allow-stack"/);

assert.match(board, /collectGuardianCheckInDeadlines\(loadResult\.snapshot\.guardianCheckIns\)/);
assert.match(board, /onOpenGuardianCheckIns/);
assert.match(board, /label="Guardian Check-Ins"/);

assert.match(commandCenter, /<DispatchGuardianCheckIns/);
assert.match(commandCenter, /collectDispatchLinkedContextsFromStores\(\)/);
assert.match(commandCenter, /linkedContexts=\{guardianCheckInLinkedContexts\}/);
assert.match(commandCenter, /onOpenCommandComposer=\{openMissionCommandComposerFromGuardian\}/);
assert.match(commandCenter, /canTargetIndividuals=\{dispatchPermissionSnapshot\.can\('send_individual_ping'\)\.allowed\}/);
assert.match(commandCenter, /canTargetExpedition=\{dispatchPermissionSnapshot\.can\('send_team_wide_ping'\)\.allowed\}/);
assert.match(commandCenter, /linkMissionCommandToGuardianCheckIn\(result\.command\)/);
assert.match(component, /applyGuardianCheckInDecision/);
assert.match(commandCenter, /visible=\{missionCommandEnabled && guardianCheckInsVisible\}/);
assert.match(commandCenter, /visible=\{missionCommandEnabled && guardianIncidentPrefill !== null\}/);

assert.match(persistence, /const STORAGE_VERSION = 5/);
assert.match(persistence, /guardianCheckIns: GuardianCheckInPlan\[\]/);
assert.match(persistence, /applyGuardianCheckInDecision/);
assert.match(rollout, /missionCommand: false/);

for (const source of [component, domain]) {
  assert.doesNotMatch(source, /setInterval|watchPositionAsync|startLocationUpdatesAsync/);
  assert.doesNotMatch(source, /contactEmergencyServices|sendSms|placePhoneCall|declareEmergency/);
}

console.log('Dispatch Guardian Check-In runtime and UI checks passed.');
