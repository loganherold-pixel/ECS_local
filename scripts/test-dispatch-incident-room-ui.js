const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const roomUi = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchIncidentRoom.tsx'), 'utf8');
const board = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchMissionCommandBoard.tsx'), 'utf8');
const cad = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'), 'utf8');
const rollout = fs.readFileSync(path.join(root, 'lib', 'dispatchRolloutConfig.ts'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'lib', 'features', 'featureVisibilityRegistry.ts'), 'utf8');
const context = fs.readFileSync(path.join(root, 'lib', 'dispatchMissionCommandContext.ts'), 'utf8');
const domain = fs.readFileSync(path.join(root, 'lib', 'dispatchIncidentRoom.ts'), 'utf8');

assert.match(roomUi, /MISSION COMMAND \/ INCIDENT ROOM/);
assert.match(roomUi, /People/);
assert.match(roomUi, /Vehicles And Resources/);
assert.match(roomUi, /Commands/);
assert.match(roomUi, /Playbook Progress/);
assert.match(roomUi, /Mission Clock/);
assert.match(roomUi, /Map And Linked Context/);
assert.match(roomUi, /Communications/);
assert.match(roomUi, /Event Timeline/);
assert.match(roomUi, /!model\.permissions\.canView[\s\S]*Incident Room restricted[\s\S]*<IncidentSummary/);
assert.match(roomUi, /COMMAND_RENDER_LIMIT = 24/);
assert.match(domain, /INCIDENT_ROOM_TIMELINE_LIMIT = 80/);
assert.doesNotMatch(roomUi, /MapRenderer|WebView|full telemetry|publishHazard|contactEmergencyServices|sendSms|placePhoneCall/);

assert.match(board, /onOpenIncidentRoomForCommand/);
assert.match(board, /getMissionCommandIncidentId\(command\) \? 'Open Incident Room' : 'Create Incident Room'/);
assert.match(cad, /buildMissionCommandIncidentReportInput/);
assert.match(cad, /findIncidentRoomForCommand/);
assert.match(cad, /linkMissionCommandToIncident/);
assert.match(cad, /Alert\.alert\(\s*'Create Incident Room\?'/);
assert.match(cad, /dispatchPermissionSnapshot\.can\('modify_timeline'\)/);
assert.match(cad, /createIncidentRoomComposerContext/);
assert.match(cad, /ResolveDebriefModal/);
assert.match(cad, /incidentRoomId/);
assert.match(cad, /!missionCommandViewPermission\.allowed/);
assert.match(cad, /returnRoute: `\/alert\?incidentRoomId=/);
assert.match(cad, /actionId: 'open_navigate'/);

assert.match(context, /metadata\.incidentId/);
assert.match(context, /dependencies\.getIncidentById\(incidentId\)/);

assert.match(rollout, /incidentRoom: false/);
assert.match(rollout, /dispatch_incident_room/);
assert.match(registry, /id: 'dispatch_incident_room'/);
assert.match(registry, /defaultEnabled: false/);
assert.match(registry, /featureDependencies: \['dispatch_mission_command'\]/);

assert.doesNotMatch(domain, /publishHazardPublicly|setRouteConfidence|contactEmergencyServices|sendSms|placePhoneCall/);

console.log('Dispatch Incident Room UI and rollout contracts passed.');
