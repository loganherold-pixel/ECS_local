const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const frameworkTypes = read('lib/dispatchOperationalPlaybookTypes.ts');
const frameworkDomain = read('lib/dispatchOperationalPlaybookDomain.ts');
const commandTypes = read('lib/dispatchMissionCommandTypes.ts');
const linkedContext = read('lib/dispatchMissionCommandContext.ts');
const dispatchTypes = read('lib/dispatchTypes.ts');
const fleetState = read('lib/fleet/activeVehicleState.ts');
const fleetReadiness = read('lib/readiness/fleetReadinessAdapter.ts');
const recoveryReadiness = read('lib/readiness/recoveryReadinessAdapter.ts');
const recoveryProtocols = read('components/emergency/RecoveryProtocolData.ts');
const missionClock = read('lib/dispatchMissionClock.ts');
const incidentStore = read('lib/incidentRecoveryWorkflowStore.ts');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');

assert.match(frameworkTypes, /create_command_proposal/);
assert.match(frameworkTypes, /assign_role/);
assert.match(frameworkTypes, /request_acknowledgment/);
assert.match(frameworkTypes, /start_deadline/);
assert.match(frameworkDomain, /executeOperationalPlaybookStep/);
assert.match(commandTypes, /MissionCommandType = DispatchPingType \| 'recovery'/);

assert.match(dispatchTypes, /'route_segment'/);
assert.match(dispatchTypes, /'camp'/);
assert.match(dispatchTypes, /'bailout'/);
assert.match(dispatchTypes, /'vehicle'/);
assert.match(linkedContext, /action\.id === 'open_vehicle'/);
assert.match(linkedContext, /openNavigate/);

assert.match(fleetState, /export function getActiveVehicleState/);
assert.match(fleetReadiness, /buildReadinessVehicleInputFromFleetState/);
assert.match(fleetReadiness, /recoveryGearReady/);
assert.match(recoveryReadiness, /buildRecoveryReadinessInput/);
assert.match(recoveryReadiness, /routeRemoteness/);
assert.match(recoveryProtocols, /export const RECOVERY_PROTOCOLS/);
assert.match(recoveryProtocols, /doNot:/);

assert.match(missionClock, /MissionClockDeadlineSource/);
assert.match(incidentStore, /export type ReportIncidentInput/);
assert.match(incidentStore, /reportIncident/);

assert.match(commandCenter, /useOperationalWeather/);
assert.match(commandCenter, /navigateRouteSessionStore/);
assert.match(commandCenter, /convoyTrackingStore/);
assert.match(commandCenter, /vehicleStore/);
assert.match(commandCenter, /ReportIncidentModal/);

assert.doesNotMatch(
  frameworkDomain,
  /contactEmergencyServices|sendSms|placePhoneCall/,
  'Operational Playbooks must remain ECS coordination only.',
);

console.log('Dispatch Vehicle Immobilized characterization checks passed.');
