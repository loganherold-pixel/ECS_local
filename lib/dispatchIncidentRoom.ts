import {
  buildMissionClockSnapshot,
  collectMissionClockDeadlines,
  type MissionClockDeadline,
} from './dispatchMissionClock';
import { collectOperationalPlaybookDeadlines } from './dispatchOperationalPlaybookDomain';
import type { OperationalPlaybookInstance } from './dispatchOperationalPlaybookTypes';
import type {
  MissionCommand,
  MissionCommandActor,
  MissionCommandEvent,
  MissionCommandMutationResult,
} from './dispatchMissionCommandTypes';
import type { MissionCommandComposerContextOption } from './dispatchMissionCommandComposer';
import type { DispatchLinkedContext } from './dispatchTypes';
import {
  evaluateSourceTruthRef,
  type SourceTruthFreshness,
  type SourceTruthRef,
} from './sourceTruth';
import type {
  IncidentContext,
  IncidentStatus,
  IncidentTimelineEvent,
} from './types/incidentRecovery';
import type { ReportIncidentInput } from './incidentRecoveryWorkflowStore';
import { sanitizeECSDiagnosticText } from './observability/ecsDiagnosticRedaction';

export const INCIDENT_ROOM_SCHEMA_VERSION = 1 as const;
export const INCIDENT_ROOM_TIMELINE_LIMIT = 80;
export const INCIDENT_ROOM_COMMUNICATION_LIMIT = 12;

export type IncidentRoomPhase =
  | 'reported'
  | 'assessing'
  | 'active'
  | 'stabilizing'
  | 'recovering'
  | 'resolved'
  | 'closed';

export interface IncidentRoomMemberInput {
  id: string;
  label: string;
  roleId?: string;
}

export interface IncidentRoomVehicleInput {
  id: string;
  label: string;
}

export interface IncidentRoomMemberPositionInput {
  memberId: string;
  capturedAt: string;
  accuracyMeters: number | null;
  isStale: boolean;
  staleness?: string;
}

export interface IncidentRoomPermissions {
  canView: boolean;
  canLead: boolean;
  canCreateCommand: boolean;
  canViewLocation: boolean;
  deniedReason?: string | null;
}

export interface IncidentRoomConnectivity {
  online: boolean;
  offlineMode: boolean;
  realtimeState: string;
  queuedCount: number;
}

export interface IncidentRoomPersonPresentation {
  id: string;
  label: string;
  roleLabel: string;
  locationState: 'live' | 'last_known' | 'unavailable' | 'restricted';
  locationLabel: string;
  observedAt: string | null;
  accuracyMeters: number | null;
}

export interface IncidentRoomVehiclePresentation {
  id: string;
  label: string;
  sourceLabel: string;
}

export interface IncidentRoomCommandPresentation {
  id: string;
  title: string;
  typeLabel: string;
  priorityLabel: string;
  operationalLabel: string;
  acknowledgmentLabel: string;
  deliveryLabel: string;
  deadlineAt: string | null;
  updatedAt: string;
}

export interface IncidentRoomPlaybookPresentation {
  id: string;
  title: string;
  stateLabel: string;
  progressLabel: string;
  currentStepId: string | null;
}

export interface IncidentRoomTimelinePresentation {
  id: string;
  kind: 'incident' | 'command';
  title: string;
  summary: string;
  occurredAt: string;
  actorLabel: string;
}

export interface IncidentRoomResourcePresentation {
  id: string;
  label: string;
  value: string;
  state: 'known' | 'watch' | 'unknown';
}

export interface IncidentRoomLocationPresentation {
  state: 'available' | 'stale' | 'unavailable' | 'restricted';
  label: string;
  observedAt: string | null;
  accuracyMeters: number | null;
  freshness: SourceTruthFreshness;
}

export interface IncidentRoomPresentation {
  schemaVersion: 1;
  incidentId: string;
  expeditionId: string | null;
  title: string;
  summary: string;
  severityLabel: string;
  statusLabel: string;
  phase: IncidentRoomPhase;
  phaseLabel: string;
  commandLeadLabel: string;
  commandLeadMemberId: string | null;
  nextDecision: string;
  sourceTruth: SourceTruthRef[];
  location: IncidentRoomLocationPresentation;
  linkedContext: DispatchLinkedContext;
  people: IncidentRoomPersonPresentation[];
  vehicles: IncidentRoomVehiclePresentation[];
  commands: IncidentRoomCommandPresentation[];
  playbooks: IncidentRoomPlaybookPresentation[];
  deadlines: MissionClockDeadline[];
  nextDeadline: MissionClockDeadline | null;
  resources: IncidentRoomResourcePresentation[];
  communications: IncidentRoomTimelinePresentation[];
  timeline: IncidentRoomTimelinePresentation[];
  timelineTruncated: boolean;
  connectivityLabel: string;
  queuedCount: number;
  permissions: IncidentRoomPermissions;
  allowedStatusTransitions: IncidentStatus[];
  resolutionAvailable: boolean;
  closeAvailable: boolean;
  debriefAvailable: boolean;
  reopenSupported: false;
  updatedAt: string;
}

export interface BuildIncidentRoomPresentationInput {
  incident: IncidentContext;
  commands: readonly MissionCommand[];
  commandEvents: readonly MissionCommandEvent[];
  playbooks: readonly OperationalPlaybookInstance[];
  members?: readonly IncidentRoomMemberInput[];
  vehicles?: readonly IncidentRoomVehicleInput[];
  memberPositions?: readonly IncidentRoomMemberPositionInput[];
  permissions: IncidentRoomPermissions;
  connectivity: IncidentRoomConnectivity;
  now?: number | Date | string;
  canTransitionStatus?: (from: IncidentStatus, to: IncidentStatus) => boolean;
}

export interface MissionCommandIncidentLinkInput {
  command: MissionCommand;
  incident: IncidentContext;
  actor: MissionCommandActor;
  occurredAt?: string;
}

export function createIncidentRoomSourceTruth(incident: IncidentContext): SourceTruthRef {
  const missingCount = incident.missingCriticalData?.length ?? 0;
  const confidence = incident.recoveryAssessment?.confidence ?? 'unknown';
  return {
    id: `incident-room-source:${incident.id}`,
    origin: 'manual',
    role: 'primary',
    policyKey: 'condition_closure_advisory',
    authority: 'ECS incident operator',
    authorityKind: 'user',
    observedAt: incident.reportedAt,
    fetchedAt: incident.updatedAt ?? incident.reportedAt,
    confidence,
    coverage: missingCount > 0 ? 'partial' : 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [
      'manual_incident_report',
      ...(missingCount > 0 ? ['incident_data_partial'] : []),
    ],
  };
}

export function createIncidentRoomLinkedContext(
  incident: IncidentContext,
  canViewLocation: boolean,
): DispatchLinkedContext {
  const sourceTruth = createIncidentRoomSourceTruth(incident);
  const hasLocation = Boolean(incident.location);
  const locationRestricted = hasLocation && !canViewLocation;
  return {
    id: incident.id,
    type: 'incident',
    title: incident.title,
    subtitle: locationRestricted
      ? 'Incident location restricted'
      : incident.routeLabel ?? incident.locationLabel ?? 'Incident context',
    coordinates: !locationRestricted && incident.location
      ? {
          latitude: incident.location.latitude,
          longitude: incident.location.longitude,
        }
      : undefined,
    accuracyMeters: !locationRestricted ? incident.location?.accuracyMeters ?? null : null,
    observedAt: incident.location?.capturedAt ?? incident.updatedAt ?? incident.reportedAt,
    sourceTruth,
    sourceTruthPolicyKey: 'condition_closure_advisory',
    restricted: false,
    metadata: {
      source: 'incidentRecoveryWorkflowStore',
      incidentId: incident.id,
      expeditionId: incident.expeditionId ?? null,
      routeId: incident.routeId ?? null,
      sensitiveLocationOmitted: locationRestricted,
    },
  };
}

export function createIncidentRoomComposerContext(
  incident: IncidentContext,
  canViewLocation: boolean,
): MissionCommandComposerContextOption {
  return {
    id: `incident-room:${incident.id}`,
    label: `Incident: ${incident.title}`,
    context: createIncidentRoomLinkedContext(incident, canViewLocation),
  };
}

export function getMissionCommandIncidentId(command: MissionCommand): string | null {
  const context = command.linkedContext;
  if (!context) return null;
  const metadataId = safeId(context.metadata?.incidentId);
  if (metadataId) return metadataId;
  if (context.type === 'incident' && context.metadata?.source === 'incidentRecoveryWorkflowStore') {
    return safeId(context.id);
  }
  return null;
}

export function findIncidentRoomForCommand(
  incidents: readonly IncidentContext[],
  command: MissionCommand,
): IncidentContext | null {
  const linkedId = getMissionCommandIncidentId(command);
  if (linkedId) return incidents.find((incident) => incident.id === linkedId) ?? null;
  return incidents.find((incident) => (
    incident.metadata?.missionCommandLink &&
    readRecord(incident.metadata.missionCommandLink)?.commandId === command.id
  )) ?? null;
}

export function linkMissionCommandToIncident(
  input: MissionCommandIncidentLinkInput,
): MissionCommandMutationResult {
  const currentIncidentId = getMissionCommandIncidentId(input.command);
  if (currentIncidentId === input.incident.id) {
    return {
      ok: true,
      changed: false,
      command: input.command,
      event: null,
    };
  }
  if (currentIncidentId && currentIncidentId !== input.incident.id) {
    return {
      ok: false,
      changed: false,
      command: input.command,
      event: null,
      reason: 'Mission Command is already linked to another incident.',
    };
  }

  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const incidentContext = createIncidentRoomLinkedContext(input.incident, false);
  const linkedContext = input.command.linkedContext
    ? {
        ...input.command.linkedContext,
        metadata: {
          ...(input.command.linkedContext.metadata ?? {}),
          incidentId: input.incident.id,
          incidentTitle: input.incident.title,
          incidentSource: 'incidentRecoveryWorkflowStore',
        },
      }
    : incidentContext;
  const command: MissionCommand = {
    ...input.command,
    version: input.command.version + 1,
    linkedContext,
    sourceTruth: dedupeSourceTruth([
      ...input.command.sourceTruth,
      createIncidentRoomSourceTruth(input.incident),
    ]),
    updatedAt: occurredAt,
  };
  const idempotencyKey = `incident-room:link:${input.command.id}:${input.incident.id}`;
  const event: MissionCommandEvent = {
    schemaVersion: 1,
    id: `mission-command-event:${idempotencyKey}`,
    idempotencyKey,
    commandId: command.id,
    expeditionId: command.expeditionId,
    type: 'staged',
    actor: input.actor,
    occurredAt,
    summary: `Linked to Incident Room: ${input.incident.title}.`,
    operationalState: command.operationalState,
    deliveryState: command.deliveryState,
    acknowledgmentState: command.acknowledgmentState,
    metadata: {
      reasonCode: 'incident_room_linked',
      sourceKind: 'native',
      sourceRecordId: input.incident.id,
    },
  };
  return { ok: true, changed: true, command, event };
}

export function buildMissionCommandIncidentReportInput(
  command: MissionCommand,
  actor: MissionCommandActor,
): ReportIncidentInput {
  const context = command.linkedContext;
  const locationAllowed = Boolean(context?.coordinates && !context.restricted);
  const type = command.type === 'route'
    ? 'route_blocked'
    : command.type === 'hazard'
      ? 'environmental_hazard'
      : 'other';
  return {
    expeditionId: command.expeditionId,
    routeId: context?.type === 'route' || context?.type === 'route_segment'
      ? context.id
      : null,
    routeLabel: context?.type === 'route' || context?.type === 'route_segment'
      ? context.title
      : undefined,
    type,
    manualLocationDescription: locationAllowed ? context?.title : undefined,
    location: locationAllowed && context?.coordinates
      ? {
          latitude: context.coordinates.latitude,
          longitude: context.coordinates.longitude,
          accuracyMeters: context.accuracyMeters ?? null,
          source: context.sourceTruth?.authorityKind === 'device' ? 'gps' : 'dispatch',
          capturedAt: context.observedAt ?? context.sourceTruth?.observedAt ?? command.updatedAt,
        }
      : null,
    communicationStatus: 'unknown',
    safety: {
      anyoneInjured: null,
      anyoneMissing: null,
      anyoneTrapped: null,
      activeHazard: null,
      vehicleStable: null,
      groupSafe: null,
    },
    resources: {
      vehicleDisabled: null,
      terrain: 'unknown',
      weather: 'unknown',
      daylight: 'unknown',
      fuelConcern: null,
      waterConcern: null,
      foodConcern: null,
      shelterConcern: null,
      warmthConcern: null,
      medicalKitAvailable: null,
    },
    notes: `Mission Command escalation: ${command.title}. ${command.instructions}`,
    reportedBy: actor.id,
    missionCommandLink: {
      commandId: command.id,
      idempotencyKey: `incident-room:command-escalation:${command.id}`,
    },
  };
}

export function buildIncidentRoomPresentation(
  input: BuildIncidentRoomPresentationInput,
): IncidentRoomPresentation {
  const nowMs = normalizeNow(input.now);
  const incident = input.incident;
  const sourceTruth = createIncidentRoomSourceTruth(incident);
  const permissions: IncidentRoomPermissions = {
    ...input.permissions,
    canLead: input.permissions.canView && input.permissions.canLead,
    canCreateCommand: input.permissions.canView && input.permissions.canCreateCommand,
    canViewLocation: input.permissions.canView && input.permissions.canViewLocation,
  };
  const effectiveInput = { ...input, permissions };
  const commands = (permissions.canView ? input.commands : [])
    .filter((command) => (
      command.expeditionId === (incident.expeditionId ?? command.expeditionId) &&
      getMissionCommandIncidentId(command) === incident.id
    ))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const commandIds = new Set(commands.map((command) => command.id));
  const playbooks = (permissions.canView ? input.playbooks : [])
    .filter((playbook) => (
      playbook.relatedIncidentId === incident.id ||
      Boolean(playbook.relatedCommandId && commandIds.has(playbook.relatedCommandId))
    ))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const deadlineInputs = collectMissionClockDeadlines({
    expeditionId: incident.expeditionId ?? commands[0]?.expeditionId ?? 'local',
    commands,
    additionalDeadlines: playbooks.flatMap(collectOperationalPlaybookDeadlines),
  });
  const clock = buildMissionClockSnapshot(deadlineInputs, nowMs);
  const allTimeline = permissions.canView
    ? buildTimeline(incident.timeline ?? [], input.commandEvents, commandIds)
    : [];
  const commandLead = readIncidentLead(incident, input.members ?? []);
  const location = permissions.canView
    ? buildLocationPresentation(incident, permissions.canViewLocation, nowMs)
    : restrictedLocationPresentation();
  const linkedContext = permissions.canView
    ? createIncidentRoomLinkedContext(incident, permissions.canViewLocation)
    : createRestrictedIncidentRoomContext(incident.id);
  const allowedStatusTransitions = permissions.canLead
    ? INCIDENT_ROOM_STATUS_CANDIDATES.filter((status) => (
        input.canTransitionStatus?.(incident.status, status) ?? false
      ))
    : [];

  return {
    schemaVersion: INCIDENT_ROOM_SCHEMA_VERSION,
    incidentId: incident.id,
    expeditionId: incident.expeditionId ?? null,
    title: permissions.canView ? incident.title : 'Restricted Incident Room',
    summary: permissions.canView
      ? incident.summary?.trim() || 'Incident details are incomplete.'
      : 'Current Dispatch permissions do not allow incident details.',
    severityLabel: permissions.canView ? formatLabel(incident.severity) : 'Unavailable',
    statusLabel: permissions.canView ? formatLabel(incident.status) : 'Unavailable',
    phase: deriveIncidentRoomPhase(incident),
    phaseLabel: formatLabel(deriveIncidentRoomPhase(incident)),
    commandLeadLabel: permissions.canView ? commandLead.label : 'Unavailable',
    commandLeadMemberId: permissions.canView ? commandLead.memberId : null,
    nextDecision: permissions.canView
      ? deriveNextDecision(incident, clock.next)
      : 'Incident details require Dispatch permission.',
    sourceTruth: permissions.canView ? [sourceTruth] : [],
    location,
    linkedContext,
    people: permissions.canView ? buildPeople(effectiveInput, commands) : [],
    vehicles: permissions.canView ? buildVehicles(effectiveInput, commands) : [],
    commands: commands.map(commandPresentation),
    playbooks: playbooks.map(playbookPresentation),
    deadlines: clock.active.slice(0, 12),
    nextDeadline: clock.next,
    resources: permissions.canView ? buildResources(incident) : [],
    communications: allTimeline
      .filter((event) => event.kind === 'incident' && isCommunicationTimelineTitle(event.title))
      .slice(0, INCIDENT_ROOM_COMMUNICATION_LIMIT),
    timeline: allTimeline.slice(0, INCIDENT_ROOM_TIMELINE_LIMIT),
    timelineTruncated: allTimeline.length > INCIDENT_ROOM_TIMELINE_LIMIT,
    connectivityLabel: connectivityLabel(input.connectivity),
    queuedCount: input.connectivity.queuedCount,
    permissions,
    allowedStatusTransitions,
    resolutionAvailable: permissions.canLead && incident.status !== 'resolved' && (
      input.canTransitionStatus?.(incident.status, 'resolved') ?? false
    ),
    closeAvailable: permissions.canLead && incident.status === 'resolved',
    debriefAvailable: permissions.canView && (incident.status === 'resolved' || incident.status === 'closed'),
    reopenSupported: false,
    updatedAt: incident.updatedAt ?? incident.reportedAt,
  };
}

function deriveIncidentRoomPhase(incident: IncidentContext): IncidentRoomPhase {
  if (incident.status === 'closed' || incident.status === 'cancelled') return 'closed';
  if (incident.status === 'resolved') return 'resolved';
  if (
    incident.status === 'awaiting_assistance' ||
    incident.status === 'self_recovery_in_progress' ||
    incident.status === 'evacuating'
  ) return 'recovering';
  if (incident.status === 'stabilizing') return 'stabilizing';
  if (incident.stabilizationChecklist?.status === 'in_progress') return 'assessing';
  if (incident.timeline?.length === 1) return 'reported';
  return 'active';
}

function restrictedLocationPresentation(): IncidentRoomLocationPresentation {
  return {
    state: 'restricted',
    label: 'Incident location restricted',
    observedAt: null,
    accuracyMeters: null,
    freshness: 'unavailable',
  };
}

function createRestrictedIncidentRoomContext(incidentId: string): DispatchLinkedContext {
  return {
    id: incidentId,
    type: 'incident',
    title: 'Restricted incident context',
    subtitle: 'Dispatch permission required',
    restricted: true,
    metadata: {
      source: 'incidentRecoveryWorkflowStore',
      incidentId,
      sensitiveLocationOmitted: true,
    },
  };
}

function buildLocationPresentation(
  incident: IncidentContext,
  canViewLocation: boolean,
  nowMs: number,
): IncidentRoomLocationPresentation {
  if (incident.location && !canViewLocation) {
    return {
      state: 'restricted',
      label: 'Incident location restricted',
      observedAt: null,
      accuracyMeters: null,
      freshness: 'unavailable',
    };
  }
  if (!incident.location) {
    return {
      state: 'unavailable',
      label: incident.locationLabel?.trim() || 'Location unavailable',
      observedAt: null,
      accuracyMeters: null,
      freshness: 'unavailable',
    };
  }
  const observedAt = incident.location.capturedAt ?? incident.updatedAt ?? incident.reportedAt;
  const ref: SourceTruthRef = {
    id: `incident-room-location:${incident.id}`,
    origin: incident.location.source === 'manual' ? 'manual' : 'cached',
    role: 'primary',
    policyKey: 'convoy_member_location',
    authority: incident.location.source === 'gps' ? 'Device GPS' : 'Incident report',
    authorityKind: incident.location.source === 'gps' ? 'device' : 'user',
    observedAt,
    confidence: incident.location.accuracyMeters != null && incident.location.accuracyMeters <= 25
      ? 'high'
      : 'medium',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: incident.location.source === 'manual' ? ['manual_location'] : [],
  };
  const evaluation = evaluateSourceTruthRef(ref, { policyKey: 'convoy_member_location', now: nowMs });
  const hasValidObservation = Number.isFinite(Date.parse(observedAt));
  const stale = hasValidObservation && (
    evaluation.freshness === 'stale' ||
    evaluation.freshness === 'expired' ||
    evaluation.freshness === 'unavailable'
  );
  return {
    state: stale ? 'stale' : evaluation.freshness === 'unavailable' ? 'unavailable' : 'available',
    label: stale
      ? evaluation.freshness === 'unavailable'
        ? 'Last known location / outside freshness window'
        : `Last known location / ${evaluation.freshness}`
      : `Location ${evaluation.freshness}`,
    observedAt,
    accuracyMeters: incident.location.accuracyMeters ?? null,
    freshness: evaluation.freshness,
  };
}

function buildPeople(
  input: BuildIncidentRoomPresentationInput,
  commands: readonly MissionCommand[],
): IncidentRoomPersonPresentation[] {
  const memberById = new Map((input.members ?? []).map((member) => [member.id, member]));
  const involved = new Set<string>();
  if (input.incident.reportedBy) involved.add(input.incident.reportedBy);
  commands.forEach((command) => {
    commandTargetMemberIds(command, input.members ?? []).forEach((id) => involved.add(id));
    command.acknowledgments.forEach((acknowledgment) => involved.add(acknowledgment.memberId));
    if (command.assignment?.assigneeMemberId) involved.add(command.assignment.assigneeMemberId);
  });
  const lead = readIncidentLead(input.incident, input.members ?? []);
  if (lead.memberId) involved.add(lead.memberId);
  const positionByMemberId = new Map(
    (input.memberPositions ?? []).map((position) => [position.memberId, position]),
  );
  const people = [...involved].map((id) => {
    const member = memberById.get(id);
    const position = positionByMemberId.get(id);
    const locationRestricted = !input.permissions.canViewLocation;
    return {
      id,
      label: member?.label ?? (id === input.incident.reportedBy ? 'Reporting member' : 'Expedition member'),
      roleLabel: lead.memberId === id
        ? 'Command lead'
        : member?.roleId
          ? formatLabel(member.roleId)
          : id === input.incident.reportedBy
            ? 'Reporter'
            : 'Involved member',
      locationState: locationRestricted
        ? 'restricted'
        : position?.isStale
          ? 'last_known'
          : position
            ? 'live'
            : 'unavailable',
      locationLabel: locationRestricted
        ? 'Position restricted'
        : position?.isStale
          ? `Last known / ${position.staleness ?? 'stale'}`
          : position
            ? 'Live shared position'
            : 'Position unavailable',
      observedAt: locationRestricted ? null : position?.capturedAt ?? null,
      accuracyMeters: locationRestricted ? null : position?.accuracyMeters ?? null,
    } satisfies IncidentRoomPersonPresentation;
  });
  const snapshotMembers = readIncidentContext(input.incident)?.convoy?.memberLabels ?? [];
  snapshotMembers.forEach((label, index) => {
    if (people.some((person) => person.label === label)) return;
    people.push({
      id: `incident-snapshot-member:${index}`,
      label,
      roleLabel: 'Incident snapshot',
      locationState: 'unavailable',
      locationLabel: 'Position unavailable',
      observedAt: null,
      accuracyMeters: null,
    });
  });
  return people.slice(0, 40);
}

function buildVehicles(
  input: BuildIncidentRoomPresentationInput,
  commands: readonly MissionCommand[],
): IncidentRoomVehiclePresentation[] {
  const vehicleById = new Map((input.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const involved = new Map<string, IncidentRoomVehiclePresentation>();
  const snapshotVehicle = readIncidentContext(input.incident)?.vehicle;
  if (snapshotVehicle?.vehicleId || snapshotVehicle?.label) {
    const id = snapshotVehicle.vehicleId ?? `incident-vehicle:${snapshotVehicle.label}`;
    involved.set(id, {
      id,
      label: snapshotVehicle.label ?? snapshotVehicle.makeModel ?? 'Incident vehicle',
      sourceLabel: 'Incident context snapshot',
    });
  }
  commands.forEach((command) => {
    const vehicleId = command.target.kind === 'vehicle'
      ? command.target.vehicleId
      : command.assignment?.target.kind === 'vehicle'
        ? command.assignment.target.vehicleId
        : null;
    if (!vehicleId || involved.has(vehicleId)) return;
    involved.set(vehicleId, {
      id: vehicleId,
      label: vehicleById.get(vehicleId)?.label ?? command.target.label ?? 'Involved vehicle',
      sourceLabel: 'Mission Command linkage',
    });
  });
  return [...involved.values()].slice(0, 24);
}

function buildResources(incident: IncidentContext): IncidentRoomResourcePresentation[] {
  const resources = readRecord(incident.metadata?.resources);
  const logistics = readIncidentContext(incident)?.logistics;
  return [
    resource('fuel', 'Fuel', resources?.fuelConcern, logistics?.fuelPercent != null ? `${Math.round(logistics.fuelPercent)}%` : null),
    resource('water', 'Water', resources?.waterConcern, logistics?.waterGallons != null ? `${logistics.waterGallons} gal` : null),
    resource('food', 'Food', resources?.foodConcern, logistics?.foodStatus ?? null),
    resource('shelter', 'Shelter', resources?.shelterConcern, logistics?.shelterStatus ?? null),
    resource('warmth', 'Warmth', resources?.warmthConcern, logistics?.warmthStatus ?? null),
    resource('medical', 'Medical kit', invertBoolean(resources?.medicalKitAvailable), booleanLabel(logistics?.medicalKitAvailable)),
  ];
}

function resource(
  id: string,
  label: string,
  concern: unknown,
  detail: string | null,
): IncidentRoomResourcePresentation {
  if (concern === true) return { id, label, value: detail ? `Concern / ${detail}` : 'Concern reported', state: 'watch' };
  if (concern === false) return { id, label, value: detail ?? 'No concern reported', state: 'known' };
  return { id, label, value: detail ?? 'Unknown', state: detail ? 'known' : 'unknown' };
}

function commandPresentation(command: MissionCommand): IncidentRoomCommandPresentation {
  const acknowledged = command.acknowledgments.filter((entry) => entry.response === 'acknowledged').length;
  const required = command.acknowledgmentPolicy.mode === 'none'
    ? 0
    : command.acknowledgmentPolicy.requiredCount ?? command.acknowledgmentPolicy.targetMemberIds.length;
  return {
    id: command.id,
    title: command.title,
    typeLabel: formatLabel(command.type),
    priorityLabel: formatLabel(command.priority),
    operationalLabel: formatLabel(command.operationalState),
    acknowledgmentLabel: command.acknowledgmentPolicy.mode === 'none'
      ? 'Not required'
      : `${acknowledged} of ${Math.max(required, 1)} acknowledged`,
    deliveryLabel: formatLabel(command.deliveryState),
    deadlineAt: command.deadlineAt ?? null,
    updatedAt: command.updatedAt,
  };
}

function playbookPresentation(playbook: OperationalPlaybookInstance): IncidentRoomPlaybookPresentation {
  const total = new Set([
    ...playbook.completedStepIds,
    ...playbook.skippedSteps.map((step) => step.stepId),
    ...(playbook.currentStepId ? [playbook.currentStepId] : []),
  ]).size;
  return {
    id: playbook.id,
    title: formatLabel(playbook.definitionId),
    stateLabel: formatLabel(playbook.state),
    progressLabel: total > 0 ? `${playbook.completedStepIds.length} of ${total} recorded steps complete` : 'Progress unavailable',
    currentStepId: playbook.currentStepId,
  };
}

function buildTimeline(
  incidentEvents: readonly IncidentTimelineEvent[],
  commandEvents: readonly MissionCommandEvent[],
  commandIds: ReadonlySet<string>,
): IncidentRoomTimelinePresentation[] {
  const incidentRows = incidentEvents.map((event) => ({
    id: `incident:${event.id}`,
    kind: 'incident' as const,
    title: formatLabel(event.title || event.type),
    summary: safeSummary(event.summary ?? event.detail ?? event.title),
    occurredAt: event.occurredAt || event.timestamp || new Date(0).toISOString(),
    actorLabel: safeText(event.actor) ?? 'ECS operator',
  }));
  const commandRows = commandEvents
    .filter((event) => commandIds.has(event.commandId))
    .map((event) => ({
      id: `command:${event.id}`,
      kind: 'command' as const,
      title: `Command ${formatLabel(event.type)}`,
      summary: safeSummary(event.summary),
      occurredAt: event.occurredAt,
      actorLabel: safeText(event.actor.label) ?? 'ECS operator',
    }));
  return [...incidentRows, ...commandRows]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}

function deriveNextDecision(incident: IncidentContext, deadline: MissionClockDeadline | null): string {
  if (incident.status === 'resolved') return 'Complete debrief and close the incident deliberately.';
  if (incident.status === 'closed') return 'Incident is closed. Review the debrief handoff when needed.';
  if (incident.status === 'cancelled') return 'Incident was cancelled. No automatic follow-up is scheduled.';
  if ((incident.missingCriticalData?.length ?? 0) > 0) {
    return `Review missing data: ${incident.missingCriticalData?.map(formatLabel).join(', ')}.`;
  }
  if (deadline?.status === 'overdue') return `Operator decision overdue: ${deadline.title}.`;
  if (deadline) return `Next deadline: ${deadline.title}.`;
  return incident.recoveryAssessment?.recommendedAction?.trim() || 'Review incident status and select the next explicit action.';
}

function readIncidentLead(
  incident: IncidentContext,
  members: readonly IncidentRoomMemberInput[],
): { memberId: string | null; label: string } {
  const record = readRecord(incident.metadata?.missionCommandLead);
  const memberId = safeId(record?.memberId);
  const member = memberId ? members.find((candidate) => candidate.id === memberId) : null;
  const label = safeText(record?.label) ?? member?.label ?? null;
  return {
    memberId,
    label: label ?? 'Unassigned',
  };
}

function readIncidentContext(incident: IncidentContext) {
  const record = incident.metadata?.incidentRecoveryContext;
  return readRecord(record) as unknown as import('./types/incidentRecovery').IncidentRecoveryContextSnapshot | null;
}

function commandTargetMemberIds(
  command: MissionCommand,
  members: readonly IncidentRoomMemberInput[],
): string[] {
  switch (command.target.kind) {
    case 'member':
    case 'solo':
      return [command.target.memberId];
    case 'team':
      return command.target.memberIds;
    case 'role': {
      const roleId = command.target.roleId;
      return members.filter((member) => member.roleId === roleId).map((member) => member.id);
    }
    default:
      return [];
  }
}

function connectivityLabel(connectivity: IncidentRoomConnectivity): string {
  if (connectivity.offlineMode || !connectivity.online) {
    return connectivity.queuedCount > 0
      ? `Offline / ${connectivity.queuedCount} queued`
      : 'Offline / local incident workspace';
  }
  if (connectivity.realtimeState !== 'connected') return `Realtime ${formatLabel(connectivity.realtimeState)}`;
  return connectivity.queuedCount > 0
    ? `Realtime connected / ${connectivity.queuedCount} queued`
    : 'Realtime connected';
}

function isCommunicationTimelineTitle(title: string): boolean {
  const normalized = title.toLowerCase();
  return normalized.includes('communication') || normalized.includes('check-in') || normalized.includes('contact');
}

function formatLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeSummary(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return sanitizeECSDiagnosticText(text, 320) || 'No additional detail recorded.';
}

function safeText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? sanitizeECSDiagnosticText(text, 160) : null;
}

function safeId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 180) : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeIso(value: unknown): string | null {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeNow(value: number | Date | string | undefined): number {
  if (value == null) return Date.now();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Date.now();
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function dedupeSourceTruth(sources: readonly SourceTruthRef[]): SourceTruthRef[] {
  const byId = new Map<string, SourceTruthRef>();
  sources.forEach((source) => byId.set(source.id, source));
  return [...byId.values()];
}

function invertBoolean(value: unknown): boolean | null {
  if (value === true) return false;
  if (value === false) return true;
  return null;
}

function booleanLabel(value: unknown): string | null {
  if (value === true) return 'Available';
  if (value === false) return 'Unavailable';
  return null;
}

const INCIDENT_ROOM_STATUS_CANDIDATES: IncidentStatus[] = [
  'active',
  'stabilizing',
  'awaiting_assistance',
  'self_recovery_in_progress',
  'evacuating',
  'resolved',
  'closed',
  'cancelled',
];
