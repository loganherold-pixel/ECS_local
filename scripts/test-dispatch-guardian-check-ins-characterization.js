const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const checkIns = read('lib', 'dispatchCheckInAdapter.ts');
const clock = read('lib', 'dispatchMissionClock.ts');
const composer = read('lib', 'dispatchMissionCommandComposer.ts');
const persistence = read('lib', 'dispatchPersistenceAdapter.ts');
const commandCenter = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const board = read('components', 'dispatch', 'DispatchMissionCommandBoard.tsx');
const featureRegistry = read('lib', 'features', 'featureVisibilityRegistry.ts');

assert.match(checkIns, /export function applyCheckInResponse/);
assert.match(checkIns, /export function getCheckInResponseProgress/);
assert.match(checkIns, /DISPATCH_CHECK_IN_SCHEDULE_OPTIONS/);
assert.match(clock, /'scheduled_check_in'/);
assert.match(clock, /'no_response_review'/);
assert.match(clock, /'acknowledgment_deadline'/);
assert.match(composer, /'check_in'/);
assert.match(composer, /queueDelivery/);
assert.match(persistence, /missionCommands: MissionCommand\[\]/);
assert.match(persistence, /offlineActions: DispatchQueuedOfflineAction\[\]/);
assert.match(commandCenter, /DispatchMissionCommandComposer/);
assert.match(commandCenter, /DispatchMissionCommandBoard/);
assert.match(board, /collectMissionClockDeadlines/);
assert.match(featureRegistry, /id: 'dispatch_mission_command'/);
assert.match(featureRegistry, /defaultEnabled: false/);

console.log('Dispatch Guardian Check-In characterization checks passed.');
