const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const adapter = read('lib/dispatchMissionCommandContext.ts');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');
const commandBoard = read('components/dispatch/DispatchMissionCommandBoard.tsx');
const fleet = read('app/(tabs)/fleet.tsx');
const vehicleModal = read('components/fleet/FleetVehicleProfileModal.tsx');

assert.match(adapter, /export function createMissionCommandContextAdapter/);
assert.match(adapter, /MissionCommandContextState/);
assert.match(adapter, /'ready'[\s\S]*'stale'[\s\S]*'restricted'[\s\S]*'unavailable'[\s\S]*'deleted'[\s\S]*'invalid'/);
assert.match(adapter, /dispatchNavigateContextAdapter\.open/);
assert.match(adapter, /intent: 'fleet_edit_vehicle'/);
assert.match(adapter, /destination: 'dispatch_incident'/);
assert.doesNotMatch(adapter, /applyMissionCommandMutation|transitionMissionCommand|pinStore\.create|routeStore\.setActive/);

assert.match(commandCenter, /missionCommandContextAdapter\.open\(\{/);
assert.match(commandCenter, /mapContextEnabled: dispatchRollout\.mapContextIntegration/);
assert.match(commandCenter, /pushSingleFlight\(result\.route\)/);
assert.match(commandCenter, /setSelectedEventId\(targetEvent\.id\)/);
assert.match(commandCenter, /missionCommandId\?: string \| string\[\]/);
assert.match(commandCenter, /requestedCommandId=\{requestedMissionCommandId\}/);
assert.match(commandCenter, /inspectLinkedContext=\{inspectMissionCommandContext\}/);

assert.match(commandBoard, /requestedCommandId\?: string \| null/);
assert.match(commandBoard, /setSelectedCommandId\(requestedCommandId\)/);
assert.match(commandBoard, /getMissionCommandContextPrimaryActionLabel/);
assert.match(commandBoard, /contextInspection\?\.stateLabel/);
assert.match(commandBoard, /contextInspection\?\.observedAt/);
assert.match(commandBoard, /label="Observed"/);
assert.match(commandBoard, /Source unknown/);
const viewContextHandler = commandBoard.match(/if \(actionId === 'view_context'\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
assert.match(viewContextHandler, /onViewLinkedContext\?\.\(command\)/);
assert.doesNotMatch(viewContextHandler, /setSelectedCommandId\(null\)/);

assert.match(fleet, /flow\.context\?\.returnRoute/);
assert.match(fleet, /readMissionCommandFleetReturnRoute/);
assert.match(fleet, /onReturnToContext=\{profileMissionCommandReturnRoute \? handleReturnToMissionCommand : undefined\}/);
assert.match(vehicleModal, /returnToContextLabel/);
assert.match(vehicleModal, /arrow-back-outline/);

console.log('Mission Command linked-context UI tests passed.');
