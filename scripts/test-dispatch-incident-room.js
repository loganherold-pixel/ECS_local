const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;
const originalLoad = Module._load;
Module._load = function loadWithNativeStub(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const root = process.cwd();
const room = require(path.join(root, 'lib', 'dispatchIncidentRoom.ts'));
const { incidentRecoveryWorkflowStore } = require(path.join(root, 'lib', 'incidentRecoveryWorkflowStore.ts'));
const { createMissionCommandContextAdapter } = require(path.join(root, 'lib', 'dispatchMissionCommandContext.ts'));

const BASE_TIME = '2026-07-14T18:00:00.000Z';
const ACTOR = { id: 'lead-one', label: 'Lead One', role: 'owner' };
const EXPEDITION_ID = 'expedition-incident-room';

function at(minutes) {
  return new Date(Date.parse(BASE_TIME) + minutes * 60_000).toISOString();
}

function incidentInput(overrides = {}) {
  return {
    expeditionId: EXPEDITION_ID,
    routeId: 'route-one',
    routeLabel: 'North Ridge',
    type: 'vehicle_breakdown',
    manualLocationDescription: 'North Ridge segment 4',
    location: {
      latitude: 39.7392,
      longitude: -104.9903,
      accuracyMeters: 14,
      source: 'gps',
      capturedAt: BASE_TIME,
    },
    communicationStatus: 'degraded',
    safety: {
      anyoneInjured: false,
      anyoneMissing: false,
      anyoneTrapped: false,
      activeHazard: null,
      vehicleStable: true,
      groupSafe: true,
    },
    resources: {
      vehicleDisabled: true,
      terrain: 'unknown',
      weather: 'unknown',
      daylight: 'unknown',
      fuelConcern: null,
      waterConcern: false,
      foodConcern: null,
      shelterConcern: null,
      warmthConcern: null,
      medicalKitAvailable: true,
    },
    contextSnapshot: {
      route: {
        routeId: 'route-one',
        routeLabel: 'North Ridge',
        routeSegmentLabel: 'Segment 4',
        hasActiveRoute: true,
      },
      convoy: {
        teamId: 'team-one',
        teamName: 'North Team',
        memberCount: 2,
        memberLabels: ['Lead One', 'Sweep Two'],
        hasConvoy: true,
        communicationTargetAvailable: true,
      },
      vehicle: {
        vehicleId: 'vehicle-one',
        label: 'Trail Rig',
        recoveryEquipment: ['Recovery boards'],
        fuelPercent: 62,
        waterGallons: 8,
        hasVehicleContext: true,
      },
      logistics: {
        fuelPercent: 62,
        waterGallons: 8,
        foodStatus: 'Unknown',
        shelterStatus: 'Available',
        warmthStatus: 'Unknown',
        medicalKitAvailable: true,
      },
      connectivity: { online: false, status: 'offline' },
      debrief: {
        routeConfidenceAdjustmentAvailable: true,
        communityHazardReportRequiresUserAction: true,
      },
      missingContext: ['weather'],
      updatedAt: BASE_TIME,
    },
    notes: 'Vehicle cannot continue. Mechanical cause has not been diagnosed.',
    reportedBy: ACTOR.id,
    ...overrides,
  };
}

function source(id = 'command-source') {
  return {
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS operator',
    authorityKind: 'user',
    observedAt: BASE_TIME,
    confidence: 'medium',
    coverage: 'partial',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_source'],
  };
}

function command(overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id: 'command-one',
    expeditionId: EXPEDITION_ID,
    creator: ACTOR,
    type: 'assist',
    priority: 'high',
    title: 'Coordinate vehicle support',
    instructions: 'Account for occupants and record the next operator decision.',
    target: { kind: 'team', memberIds: ['lead-one', 'sweep-two'], label: 'Expedition team' },
    acknowledgmentPolicy: {
      mode: 'all',
      targetMemberIds: ['lead-one', 'sweep-two'],
      requiredCount: 2,
    },
    deadlineAt: at(30),
    sourceTruth: [source()],
    operationalState: 'active',
    deliveryState: 'queued',
    acknowledgmentState: 'partial',
    acknowledgments: [{
      id: 'ack-one',
      idempotencyKey: 'ack:one',
      memberId: 'lead-one',
      response: 'acknowledged',
      respondedAt: at(2),
    }],
    idempotencyKey: 'command:create:one',
    createdAt: BASE_TIME,
    updatedAt: at(2),
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      safetyScope: 'ecs_team_coordination_only',
    },
    ...overrides,
  };
}

function commandEvent(commandId = 'command-one', index = 1) {
  return {
    schemaVersion: 1,
    id: `command-event-${index}`,
    idempotencyKey: `command-event:${index}`,
    commandId,
    expeditionId: EXPEDITION_ID,
    type: index % 2 === 0 ? 'acknowledged' : 'queued',
    actor: ACTOR,
    occurredAt: at(index),
    summary: index % 2 === 0 ? 'Command acknowledged.' : 'Command queued for offline delivery.',
    operationalState: 'active',
    deliveryState: 'queued',
    acknowledgmentState: 'partial',
  };
}

function permissions(overrides = {}) {
  return {
    canView: true,
    canLead: true,
    canCreateCommand: true,
    canViewLocation: true,
    deniedReason: null,
    ...overrides,
  };
}

function connectivity(overrides = {}) {
  return {
    online: false,
    offlineMode: true,
    realtimeState: 'disconnected',
    queuedCount: 1,
    ...overrides,
  };
}

function buildModel(incident, commands = [], events = [], overrides = {}) {
  return room.buildIncidentRoomPresentation({
    incident,
    commands,
    commandEvents: events,
    playbooks: [],
    members: [
      { id: 'lead-one', label: 'Lead One', roleId: 'owner' },
      { id: 'sweep-two', label: 'Sweep Two', roleId: 'member' },
    ],
    vehicles: [{ id: 'vehicle-one', label: 'Trail Rig' }],
    memberPositions: [
      { memberId: 'lead-one', capturedAt: at(-2), accuracyMeters: 12, isStale: false, staleness: 'fresh' },
      { memberId: 'sweep-two', capturedAt: at(-35), accuracyMeters: 28, isStale: true, staleness: 'stale' },
    ],
    permissions: permissions(),
    connectivity: connectivity(),
    now: BASE_TIME,
    canTransitionStatus: incidentRecoveryWorkflowStore.canTransitionIncidentStatus,
    ...overrides,
  });
}

incidentRecoveryWorkflowStore.clearIncident();

const existingIncident = incidentRecoveryWorkflowStore.reportIncident(incidentInput());
const existingModel = buildModel(existingIncident);
assert.equal(existingModel.incidentId, existingIncident.id, 'Incident Room must use the canonical incident ID.');
assert.equal(existingModel.expeditionId, EXPEDITION_ID);
assert.equal(existingModel.sourceTruth[0].origin, 'manual', 'A recent operator report must not be labeled live.');
assert.equal(existingModel.location.state, 'available');
assert.equal(existingModel.reopenSupported, false);

const escalationCommand = command();
const escalationInput = room.buildMissionCommandIncidentReportInput(escalationCommand, ACTOR);
const escalatedIncident = incidentRecoveryWorkflowStore.reportIncident(escalationInput);
const duplicateEscalation = incidentRecoveryWorkflowStore.reportIncident(escalationInput);
assert.equal(duplicateEscalation.id, escalatedIncident.id, 'Repeated command escalation must return the same incident.');
assert.equal(
  incidentRecoveryWorkflowStore.getSnapshot().filter((incident) => (
    incident.metadata?.missionCommandLink?.commandId === escalationCommand.id
  )).length,
  1,
  'Repeated escalation must not create duplicate canonical incidents.',
);

const link = room.linkMissionCommandToIncident({
  command: escalationCommand,
  incident: escalatedIncident,
  actor: ACTOR,
  occurredAt: at(3),
});
assert.equal(link.ok, true, link.reason);
assert.equal(link.changed, true);
assert.equal(room.getMissionCommandIncidentId(link.command), escalatedIncident.id);
assert.equal(room.findIncidentRoomForCommand([existingIncident, escalatedIncident], link.command).id, escalatedIncident.id);
const repeatLink = room.linkMissionCommandToIncident({
  command: link.command,
  incident: escalatedIncident,
  actor: ACTOR,
  occurredAt: at(4),
});
assert.equal(repeatLink.ok, true);
assert.equal(repeatLink.changed, false, 'Repeated linkage must be idempotent.');

const linkedModel = buildModel(escalatedIncident, [link.command], [link.event, commandEvent()]);
assert.equal(linkedModel.commands.length, 1);
assert.equal(linkedModel.commands[0].deliveryLabel, 'Queued');
assert.equal(linkedModel.commands[0].acknowledgmentLabel, '1 of 2 acknowledged');
assert.match(linkedModel.connectivityLabel, /Offline/);
assert.equal(linkedModel.queuedCount, 1);
assert.equal(linkedModel.nextDeadline.linkedCommandId, escalationCommand.id);
assert.equal(linkedModel.people.find((person) => person.id === 'sweep-two').locationState, 'last_known');

const sensitiveTimelineModel = buildModel(escalatedIncident, [link.command], [{
  ...commandEvent(link.command.id, 99),
  actor: { id: 'operator-private', label: 'operator@example.com' },
  summary: 'Member last reported at 39.7392, -104.9903.',
}]);
assert.doesNotMatch(JSON.stringify(sensitiveTimelineModel.timeline), /39\.7392|-104\.9903|operator@example\.com/);
assert.match(JSON.stringify(sensitiveTimelineModel.timeline), /redacted/i);

const restrictedModel = buildModel(existingIncident, [], [], {
  permissions: permissions({ canLead: false, canCreateCommand: false, canViewLocation: false }),
});
assert.equal(restrictedModel.location.state, 'restricted');
assert.equal(restrictedModel.linkedContext.restricted, false, 'Location restriction must not hide the whole incident.');
assert.equal(restrictedModel.linkedContext.metadata.sensitiveLocationOmitted, true);
assert.equal(restrictedModel.linkedContext.coordinates, undefined);
assert.ok(restrictedModel.people.every((person) => person.locationState === 'restricted' || person.id.startsWith('incident-snapshot')));
assert.doesNotMatch(JSON.stringify(restrictedModel), /39\.7392|-104\.9903/);

const deniedModel = buildModel(existingIncident, [link.command], [link.event], {
  permissions: permissions({ canView: false, canLead: true, canCreateCommand: true, canViewLocation: true }),
});
assert.equal(deniedModel.title, 'Restricted Incident Room');
assert.equal(deniedModel.permissions.canLead, false);
assert.equal(deniedModel.permissions.canCreateCommand, false);
assert.equal(deniedModel.permissions.canViewLocation, false);
assert.equal(deniedModel.linkedContext.restricted, true);
assert.equal(deniedModel.commands.length, 0);
assert.equal(deniedModel.people.length, 0);
assert.equal(deniedModel.timeline.length, 0);
assert.doesNotMatch(JSON.stringify(deniedModel), /Disabled rig|39\.7392|-104\.9903/);

const staleIncident = {
  ...existingIncident,
  id: 'incident-stale-location',
  location: { ...existingIncident.location, capturedAt: at(-45) },
  updatedAt: at(-45),
};
const staleModel = buildModel(staleIncident);
assert.equal(staleModel.location.state, 'stale');
assert.match(staleModel.location.label, /Last known/);

incidentRecoveryWorkflowStore.assignCommandLead({
  incidentId: escalatedIncident.id,
  memberId: ACTOR.id,
  memberLabel: ACTOR.label,
  actorId: ACTOR.id,
  actorLabel: ACTOR.label,
});
incidentRecoveryWorkflowStore.assignCommandLead({
  incidentId: escalatedIncident.id,
  memberId: ACTOR.id,
  memberLabel: ACTOR.label,
  actorId: ACTOR.id,
  actorLabel: ACTOR.label,
});
const ledIncident = incidentRecoveryWorkflowStore.getSnapshot().find((incident) => incident.id === escalatedIncident.id);
assert.equal(ledIncident.metadata.missionCommandLead.memberId, ACTOR.id);
assert.equal(
  ledIncident.timeline.filter((event) => event.title === 'command lead assigned').length,
  1,
  'Repeated lead assignment must not duplicate actor history.',
);

incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: escalatedIncident.id,
  status: 'stabilizing',
  actor: ACTOR.label,
});
incidentRecoveryWorkflowStore.transitionIncidentStatus({
  incidentId: escalatedIncident.id,
  status: 'self_recovery_in_progress',
  actor: ACTOR.label,
});
const resolved = incidentRecoveryWorkflowStore.resolveIncident({
  incidentId: escalatedIncident.id,
  resolvedHow: 'Team coordination completed and people were accounted for.',
  anyoneInjured: false,
  vehicleDamaged: null,
  outsideAssistanceUsed: false,
  emergencyServicesContacted: false,
  actor: ACTOR.label,
});
assert.equal(resolved.status, 'resolved');
assert.equal(incidentRecoveryWorkflowStore.canTransitionIncidentStatus('resolved', 'active'), false);
const resolvedModel = buildModel(resolved, [link.command]);
assert.equal(resolvedModel.phase, 'resolved');
assert.equal(resolvedModel.resolutionAvailable, false);
assert.equal(resolvedModel.closeAvailable, true);
assert.equal(resolvedModel.reopenSupported, false);

const debriefed = incidentRecoveryWorkflowStore.saveIncidentDebrief({
  incidentId: escalatedIncident.id,
  outcome: 'Incident resolved through local ECS team coordination.',
  communityHazardReportRequested: true,
  routeConfidenceAdjustmentRequested: true,
  actor: ACTOR.label,
});
assert.equal(debriefed.debrief.communityHazardPublished, false);
assert.equal(debriefed.debrief.routeConfidenceChanged, false);
assert.equal(debriefed.debrief.communityHazardPublicationStatus, 'requested_review');
assert.equal(debriefed.debrief.routeConfidenceReviewStatus, 'requested_review');

const timelineIncident = {
  ...existingIncident,
  id: 'incident-bounded-timeline',
  timeline: Array.from({ length: 120 }, (_, index) => ({
    id: `incident-timeline-${index}`,
    incidentId: 'incident-bounded-timeline',
    type: index % 5 === 0 ? 'communication_sent' : 'note',
    title: index % 5 === 0 ? 'communication attempt' : 'operator note',
    summary: `Timeline event ${index}`,
    occurredAt: at(index),
    actor: ACTOR.label,
  })),
};
const boundedModel = buildModel(timelineIncident);
assert.equal(boundedModel.timeline.length, room.INCIDENT_ROOM_TIMELINE_LIMIT);
assert.equal(boundedModel.timelineTruncated, true);
assert.equal(boundedModel.communications.length, room.INCIDENT_ROOM_COMMUNICATION_LIMIT);

const unrelatedCommand = command({ id: 'command-unrelated', idempotencyKey: 'command:unrelated' });
assert.equal(buildModel(escalatedIncident, [unrelatedCommand]).commands.length, 0);

const contextAdapter = createMissionCommandContextAdapter({
  getDispatchEventById: () => null,
  getIncidentById: (id) => id === escalatedIncident.id ? escalatedIncident : null,
  now: () => Date.parse(BASE_TIME),
  recentActions: new Map(),
});

void contextAdapter.open({
  context: room.createIncidentRoomLinkedContext(escalatedIncident, true),
  commandId: escalationCommand.id,
  expeditionId: EXPEDITION_ID,
  permissions: {
    disabledReason: 'Denied by fixture.',
    can: () => ({ allowed: true }),
  },
  actionId: 'open_incident',
  rolloutEnabled: true,
  mapContextEnabled: true,
}).then((result) => {
  assert.equal(result.status, 'local_target', result.message);
  assert.equal(result.destination, 'dispatch_incident');
  assert.equal(result.targetId, escalatedIncident.id, 'Canonical incident IDs must resolve without a legacy Dispatch event ID.');
  console.log('Dispatch Incident Room domain checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
