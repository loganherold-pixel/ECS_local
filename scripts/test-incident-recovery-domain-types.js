const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const incidentTypesSource = fs.readFileSync(
  path.join(root, 'lib', 'types', 'incidentRecovery.ts'),
  'utf8',
);
const expeditionTypesSource = fs.readFileSync(
  path.join(root, 'lib', 'types', 'expedition.ts'),
  'utf8',
);

for (const name of [
  'IncidentType',
  'IncidentSeverity',
  'IncidentStatus',
  'IncidentContext',
  'IncidentEvidence',
  'IncidentRecoveryContextSnapshot',
  'IncidentRecoveryRouteContext',
  'IncidentRecoveryConvoyContext',
  'IncidentRecoveryVehicleContext',
  'IncidentRecoveryLogisticsContext',
  'IncidentRecoveryConnectivityContext',
  'StabilizationChecklist',
  'RecoveryAssessment',
  'RecoveryPlan',
  'IncidentCommunicationPacket',
  'IncidentTimelineEvent',
  'IncidentDebrief',
  'IncidentDebriefIntelligenceHandoff',
  'IncidentRecoveryContainerState',
  'IncidentRecoveryButtonStates',
  'IncidentWorkflowButtonState',
]) {
  assert.ok(
    incidentTypesSource.includes(name),
    `Incident domain type module must define ${name}.`,
  );
  assert.ok(
    expeditionTypesSource.includes(name),
    `Expedition type entry point must re-export ${name}.`,
  );
}

for (const incidentType of [
  'vehicle_stuck',
  'vehicle_breakdown',
  'medical',
  'route_blocked',
  'lost_or_off_route',
  'separated_party',
  'weather_hazard',
  'environmental_hazard',
  'fuel_water_supply',
  'communication_failure',
  'camp_safety',
  'wildlife',
  'security',
  'other',
]) {
  assert.ok(
    incidentTypesSource.includes(`'${incidentType}'`),
    `IncidentType must support ${incidentType}.`,
  );
}

for (const status of [
  'active',
  'stabilizing',
  'awaiting_assistance',
  'self_recovery_in_progress',
  'evacuating',
  'resolved',
  'closed',
  'cancelled',
]) {
  assert.ok(
    incidentTypesSource.includes(`'${status}'`),
    `IncidentStatus must support ${status}.`,
  );
}

for (const buttonKey of [
  'reportIncident',
  'safetyChecklist',
  'ecsAssessment',
  'communicationPacket',
  'timeline',
  'resolveDebrief',
]) {
  assert.ok(
    incidentTypesSource.includes(`${buttonKey}: IncidentWorkflowButtonState`),
    `IncidentRecoveryButtonStates must include ${buttonKey}.`,
  );
}

assert.ok(
  incidentTypesSource.includes("displayMode: IncidentDisplayMode") &&
    incidentTypesSource.includes("activeIncident?: IncidentContext | null") &&
    incidentTypesSource.includes("hasActiveIncident: boolean") &&
    incidentTypesSource.includes("missingCriticalData?: IncidentCriticalDataKey[]"),
  'Container state must support live display, active incident, and missing critical data.',
);
assert.ok(
  incidentTypesSource.includes("'unknown'") &&
    incidentTypesSource.includes("severity: 'unknown'") &&
    incidentTypesSource.includes("injuryStatus: IncidentInjuryStatus") &&
    incidentTypesSource.includes("communicationStatus: IncidentCommunicationStatus") &&
    incidentTypesSource.includes("'location'") &&
    incidentTypesSource.includes("'communication'") &&
    incidentTypesSource.includes("'hazard'"),
  'Incident defaults must preserve unknown severity/injury/comms and represent missing location, communication, and hazard data.',
);
assert.ok(
  incidentTypesSource.includes("label: 'ECS Assessment'") &&
    !incidentTypesSource.includes('AI Assessment'),
  'Incident workflow button defaults must use ECS Assessment terminology.',
);
assert.ok(
  incidentTypesSource.includes('NO_ACTIVE_INCIDENT_RECOVERY_CONTAINER_STATE') &&
    incidentTypesSource.includes("displayMode: 'no_incident'") &&
    incidentTypesSource.includes('hasActiveIncident: false'),
  'Domain module must expose a no-active-incident container state.',
);
assert.ok(
  incidentTypesSource.includes('routeConfidenceAdjustmentAvailable') &&
    incidentTypesSource.includes('communityHazardReportRequiresUserAction') &&
    incidentTypesSource.includes('communicationTargetAvailable') &&
    incidentTypesSource.includes('recoveryEquipment?: string[]') &&
    incidentTypesSource.includes('suppliesSummary?: string | null'),
  'Incident context snapshot must expose route, convoy, vehicle, logistics, connectivity, and explicit debrief handoff extension points.',
);
assert.ok(
  incidentTypesSource.includes('resolutionSummary?: string | null') &&
    incidentTypesSource.includes('outsideAssistanceUsed?: boolean | null') &&
    incidentTypesSource.includes('communityHazardReportRequested?: boolean') &&
    incidentTypesSource.includes('routeConfidenceAdjustmentRequested?: boolean') &&
    incidentTypesSource.includes('intelligenceHandoff?: IncidentDebriefIntelligenceHandoff'),
  'Incident Debrief must capture resolution, debrief review requests, and Intelligence handoff state.',
);

console.log('Incident & Recovery domain type checks passed.');
