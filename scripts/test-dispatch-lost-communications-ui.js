const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const scenarioUi = read('components/dispatch/DispatchLostCommunicationsPlaybook.tsx');
const board = read('components/dispatch/DispatchMissionCommandBoard.tsx');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');

assert.match(scenarioUi, /DispatchOperationalPlaybookRunner/);
assert.match(scenarioUi, /Last Verified Context/);
assert.match(scenarioUi, /review\.movementStatement/);
assert.match(scenarioUi, /Open Command Composer/);
assert.match(scenarioUi, /Open Incident Review/);
assert.match(scenarioUi, /No external action is automatic/);
assert.match(scenarioUi, /Lost Communications is not applicable in solo mode/);
assert.match(scenarioUi, /accessibilityLabel="Lost Communications outcome options"/);
assert.doesNotMatch(scenarioUi, /\.reportIncident\(|setInterval|setTimeout/);

assert.match(board, /onOpenLostCommunications/);
assert.match(board, /label="Lost Comms"/);
assert.match(board, /flatMap\(collectOperationalPlaybookDeadlines\)/);

assert.match(commandCenter, /enabled=\{missionCommandEnabled\}/);
assert.match(commandCenter, /visible=\{missionCommandEnabled && lostCommunicationsVisible\}/);
assert.match(commandCenter, /buildLostCommunicationsRuntimeInput/);
assert.match(commandCenter, /locationPermissionAllowed: memberLocationPermission\.allowed/);
assert.match(commandCenter, /positionSharingEnabled: teamPositionSharingEnabled/);
assert.match(commandCenter, /sourceTruth: missionComposerSourceTruth/);
assert.match(commandCenter, /linkMissionCommandToPlaybook\(result\.command\)/);
assert.match(commandCenter, /<ReportIncidentModal[\s\S]*onSubmit=\{handleSubmitLostCommunicationsIncident\}/);
assert.match(commandCenter, /No external service was contacted/);

console.log('Dispatch Lost Communications UI integration checks passed.');
