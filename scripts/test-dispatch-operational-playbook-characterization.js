const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const commandTypes = read('lib/dispatchMissionCommandTypes.ts');
const commandDomain = read('lib/dispatchMissionCommandDomain.ts');
const persistence = read('lib/dispatchPersistenceAdapter.ts');
const permissions = read('lib/dispatchPermissionAdapter.ts');
const missionClock = read('lib/dispatchMissionClock.ts');
const linkedContext = read('lib/dispatchMissionCommandContext.ts');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');

assert.match(commandTypes, /MissionCommandOperationalState/);
assert.match(commandTypes, /MissionCommandDeliveryState/);
assert.match(commandTypes, /MissionCommandAcknowledgmentState/);
assert.match(commandDomain, /transitionMissionCommandOperationalState/);
assert.match(commandDomain, /createMissionCommandEvent/);

assert.match(persistence, /const STORAGE_VERSION = \d+;/);
assert.match(persistence, /missionCommands: MissionCommand\[\]/);
assert.match(persistence, /missionCommandEvents: MissionCommandEvent\[\]/);
assert.match(persistence, /applyMissionCommandMutation/);

assert.match(permissions, /export interface DispatchPermissionSnapshot/);
assert.match(permissions, /can: \(action: DispatchPermissionAction\)/);
assert.match(missionClock, /export interface MissionClockDeadlineInput/);
assert.match(linkedContext, /export function createMissionCommandContextAdapter/);

assert.doesNotMatch(
  commandCenter,
  /transitionOperationalPlaybook|executeOperationalPlaybookStep|migrateOperationalPlaybook/,
  'Playbook business logic must not move into the Dispatch mega-screen.',
);
assert.doesNotMatch(
  commandDomain,
  /contactEmergencyServices|sendSms|placePhoneCall/,
  'Mission Command domain must remain ECS team coordination only.',
);

console.log('Dispatch Operational Playbook characterization checks passed.');
