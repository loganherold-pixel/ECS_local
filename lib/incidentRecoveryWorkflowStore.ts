import type {
  IncidentCommunicationStatus,
  IncidentContext,
  IncidentCoordinate,
  IncidentCriticalDataKey,
  IncidentDebrief,
  IncidentRecoveryContextSnapshot,
  IncidentSeverity,
  IncidentStatus,
  IncidentTimelineEvent,
  IncidentType,
  IncidentWorkflowStatus,
  StabilizationChecklistItem,
} from './types/incidentRecovery';
import {
  runRecoveryIncidentAgent,
  type RecoveryIncidentAgentContext,
} from './ai/recoveryIncidentAgent';
import type { ExpeditionAssessmentEscalationMetadata } from './expedition/assessmentEscalation';
import {
  buildIncidentCommunicationPacket,
  type IncidentCommunicationPacketAudience,
} from './incidentCommunicationPacket';

export type ReportIncidentSafetyState = {
  anyoneInjured: boolean | null;
  anyoneMissing: boolean | null;
  anyoneTrapped: boolean | null;
  activeHazard: boolean | null;
  vehicleStable: boolean | null;
  groupSafe: boolean | null;
};

export type ReportIncidentResourceState = {
  vehicleDisabled: boolean | null;
  terrain: string;
  weather: string;
  daylight: string;
  fuelConcern: boolean | null;
  waterConcern: boolean | null;
  foodConcern: boolean | null;
  shelterConcern: boolean | null;
  warmthConcern: boolean | null;
  medicalKitAvailable: boolean | null;
};

export type ReportIncidentInput = {
  expeditionId?: string;
  routeId?: string | null;
  routeLabel?: string;
  routeSegmentLabel?: string | null;
  type: IncidentType;
  manualLocationDescription?: string;
  location?: IncidentCoordinate | null;
  communicationStatus: IncidentCommunicationStatus;
  safety: ReportIncidentSafetyState;
  resources: ReportIncidentResourceState;
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
  notes?: string;
  reportedBy?: string | null;
  assessmentEscalation?: ExpeditionAssessmentEscalationMetadata | null;
};

export type SafetyChecklistItemKey =
  | 'everyoneAccountedFor'
  | 'injuriesAssessed'
  | 'activeHazardsIdentified'
  | 'locationCaptured'
  | 'vehicleStabilityAssessed'
  | 'communicationsChecked'
  | 'weatherDaylightReviewed'
  | 'emergencyEscalationReviewed';

export type SafetyChecklistItemValue = 'checked' | 'unchecked' | 'unknown';

export type SafetyChecklistInput = {
  incidentId?: string | null;
  expeditionId?: string;
  routeId?: string | null;
  routeLabel?: string;
  routeSegmentLabel?: string | null;
  location?: IncidentCoordinate | null;
  items: Record<SafetyChecklistItemKey, SafetyChecklistItemValue>;
  notes?: string;
  createIncidentIfRiskFound?: boolean;
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
  reportedBy?: string | null;
};

export type ECSAssessmentInput = Omit<RecoveryIncidentAgentContext, 'incident'> & {
  incidentId?: string | null;
  reportedBy?: string | null;
};

export type CommunicationPacketInput = {
  incidentId?: string | null;
  expeditionId?: string;
  reportedBy?: string | null;
};

export type CommunicationPacketCopyInput = CommunicationPacketInput & {
  audience?: IncidentCommunicationPacketAudience | 'all';
};

export type IncidentTimelineNoteInput = {
  incidentId?: string | null;
  expeditionId?: string;
  note: string;
  actor?: string | null;
};

export type IncidentLocationUpdateInput = {
  incidentId?: string | null;
  expeditionId?: string;
  location: IncidentCoordinate;
  actor?: string | null;
};

export type IncidentTimelineLogInput = {
  incidentId?: string | null;
  expeditionId?: string;
  type: IncidentTimelineEvent['type'];
  title: string;
  summary?: string;
  actor?: string | null;
  data?: Record<string, unknown>;
};

export type ResolveIncidentInput = {
  incidentId?: string | null;
  expeditionId?: string;
  resolvedHow: string;
  anyoneInjured?: boolean | null;
  vehicleDamaged?: boolean | null;
  outsideAssistanceUsed?: boolean | null;
  emergencyServicesContacted?: boolean | null;
  finalNotes?: string;
  actor?: string | null;
};

export type IncidentDebriefInput = {
  incidentId?: string | null;
  expeditionId?: string;
  outcome: string;
  injuries?: string;
  vehicleDamage?: string;
  equipmentUsed?: string[];
  whatWorked?: string;
  whatFailed?: string;
  planningGaps?: string;
  routeHazards?: string;
  communicationIssues?: string;
  weatherTerrainMismatch?: string;
  futureRecommendations?: string;
  communityHazardReportRequested?: boolean;
  routeConfidenceAdjustmentRequested?: boolean;
  actor?: string | null;
};

export type IncidentStatusTransitionInput = {
  incidentId?: string | null;
  expeditionId?: string;
  status: IncidentStatus;
  reason?: string;
  actor?: string | null;
};

export type ClearIncidentInput = {
  incidentId?: string | null;
  expeditionId?: string;
};

type IncidentWorkflowListener = () => void;

const listeners = new Set<IncidentWorkflowListener>();
let incidents: IncidentContext[] = [];
let cachedSnapshotSource: IncidentContext[] | null = null;
let cachedSnapshot: IncidentContext[] = [];

function createId(prefix: string): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('[INCIDENT_WORKFLOW] listener_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function incidentTypeLabel(type: IncidentType): string {
  switch (type) {
    case 'vehicle_stuck':
      return 'Vehicle Stuck';
    case 'vehicle_breakdown':
      return 'Vehicle Breakdown';
    case 'medical':
      return 'Medical / Safety Concern';
    case 'route_blocked':
      return 'Route Blocked';
    case 'lost_or_off_route':
      return 'Lost / Off-Route';
    case 'separated_party':
      return 'Separated Party';
    case 'weather_hazard':
      return 'Weather Hazard';
    case 'environmental_hazard':
      return 'Environmental Hazard';
    case 'fuel_water_supply':
      return 'Fuel / Water / Supply Issue';
    case 'communication_failure':
      return 'Communication Failure';
    case 'camp_safety':
      return 'Camp Safety';
    case 'wildlife':
      return 'Wildlife';
    case 'security':
      return 'Security';
    case 'other':
    default:
      return 'Other';
  }
}

function buildMissingCriticalData(input: ReportIncidentInput): IncidentCriticalDataKey[] {
  const missing: IncidentCriticalDataKey[] = [];
  if (!input.location && !cleanText(input.manualLocationDescription)) missing.push('location');
  if (input.communicationStatus === 'unknown') missing.push('communication');
  if (input.safety.activeHazard == null) missing.push('hazard');
  if (input.safety.anyoneInjured == null) missing.push('injury_status');
  if (input.resources.vehicleDisabled == null) missing.push('vehicle_status');
  return missing;
}

const SAFETY_CHECKLIST_LABELS: Record<SafetyChecklistItemKey, string> = {
  everyoneAccountedFor: 'Everyone accounted for',
  injuriesAssessed: 'Injuries assessed',
  activeHazardsIdentified: 'Active hazards identified',
  locationCaptured: 'Location captured',
  vehicleStabilityAssessed: 'Vehicle stability assessed',
  communicationsChecked: 'Communications checked',
  weatherDaylightReviewed: 'Weather and daylight reviewed',
  emergencyEscalationReviewed: 'Emergency escalation threshold reviewed',
};

function uniqueCriticalData(keys: IncidentCriticalDataKey[]): IncidentCriticalDataKey[] {
  return Array.from(new Set(keys));
}

function hasSafetyChecklistRisk(input: SafetyChecklistInput): boolean {
  return (
    input.items.everyoneAccountedFor !== 'checked' ||
    input.items.injuriesAssessed !== 'checked' ||
    input.items.activeHazardsIdentified !== 'checked' ||
    input.items.locationCaptured !== 'checked' ||
    input.items.vehicleStabilityAssessed !== 'checked' ||
    input.items.communicationsChecked !== 'checked'
  );
}

function buildChecklistMissingCriticalData(input: SafetyChecklistInput): IncidentCriticalDataKey[] {
  const missing: IncidentCriticalDataKey[] = [];
  if (input.items.locationCaptured !== 'checked' || !input.location) missing.push('location');
  if (input.items.communicationsChecked !== 'checked') missing.push('communication');
  if (input.items.activeHazardsIdentified !== 'checked') missing.push('hazard');
  if (input.items.injuriesAssessed !== 'checked') missing.push('injury_status');
  if (input.items.everyoneAccountedFor !== 'checked') missing.push('party_status');
  if (input.items.vehicleStabilityAssessed !== 'checked') missing.push('vehicle_status');
  if (input.items.weatherDaylightReviewed !== 'checked') missing.push('route_status');
  return uniqueCriticalData(missing);
}

function deriveChecklistStatus(input: SafetyChecklistInput): IncidentWorkflowStatus {
  return Object.values(input.items).every((value) => value === 'checked') ? 'complete' : 'attention_needed';
}

function raiseSeverityForSafetyChecklist(
  currentSeverity: IncidentSeverity,
  input: SafetyChecklistInput,
): IncidentSeverity {
  if (
    input.items.injuriesAssessed !== 'checked' ||
    input.items.everyoneAccountedFor !== 'checked'
  ) {
    return currentSeverity === 'critical' ? currentSeverity : 'high';
  }

  if (
    input.items.activeHazardsIdentified !== 'checked' ||
    input.items.communicationsChecked !== 'checked' ||
    input.items.vehicleStabilityAssessed !== 'checked'
  ) {
    return currentSeverity === 'critical' || currentSeverity === 'high' ? currentSeverity : 'moderate';
  }

  return currentSeverity;
}

function buildSafetyChecklistItems(input: SafetyChecklistInput, incidentId: string, now: string): StabilizationChecklistItem[] {
  return (Object.keys(SAFETY_CHECKLIST_LABELS) as SafetyChecklistItemKey[]).map((key) => {
    const state = input.items[key];
    return {
      id: `${incidentId}-${key}`,
      label: SAFETY_CHECKLIST_LABELS[key],
      complete: state === 'checked',
      state,
      required: true,
      warning: state !== 'checked',
      completedAt: state === 'checked' ? now : null,
      completedBy: input.reportedBy ?? null,
      notes: state === 'unknown' ? 'Unknown' : null,
    };
  });
}

function deriveIncidentStatus(input: ReportIncidentInput): IncidentStatus {
  const safetyConcern =
    input.safety.anyoneInjured === true ||
    input.safety.anyoneMissing === true ||
    input.safety.anyoneTrapped === true ||
    input.safety.activeHazard === true ||
    input.safety.groupSafe === false;
  return safetyConcern ? 'stabilizing' : 'active';
}

function buildLocationLabel(input: ReportIncidentInput): string | undefined {
  if (input.location) {
    return `${input.location.latitude.toFixed(5)}, ${input.location.longitude.toFixed(5)}`;
  }
  return cleanText(input.manualLocationDescription);
}

function buildTimelineEvent(incidentId: string, input: ReportIncidentInput, now: string): IncidentTimelineEvent {
  return {
    id: `${incidentId}-created`,
    incidentId,
    type: 'reported',
    title: 'Incident created',
    detail: cleanText(input.notes) ?? incidentTypeLabel(input.type),
    timestamp: now,
    actor: input.reportedBy ?? 'operator',
    summary: cleanText(input.notes) ?? incidentTypeLabel(input.type),
    status: deriveIncidentStatus(input),
    severity: 'unknown',
    occurredAt: now,
    actorId: input.reportedBy ?? null,
    source: 'operator',
  };
}

function buildSafetyChecklistTimelineEvent(
  incidentId: string,
  input: SafetyChecklistInput,
  now: string,
  complete: boolean,
): IncidentTimelineEvent {
  return {
    id: `${incidentId}-safety-${Date.now().toString(36)}`,
    incidentId,
    type: 'checklist_updated',
    title: complete ? 'Safety check completed' : 'Safety check updated',
    detail: cleanText(input.notes) ?? 'Stabilization checklist saved.',
    timestamp: now,
    actor: input.reportedBy ?? 'operator',
    summary: cleanText(input.notes) ?? 'Stabilization checklist saved.',
    status: complete ? 'active' : 'stabilizing',
    severity: raiseSeverityForSafetyChecklist('unknown', input),
    occurredAt: now,
    actorId: input.reportedBy ?? null,
    source: 'operator',
  };
}

function createIncidentFromSafetyChecklist(input: SafetyChecklistInput): IncidentContext {
  const now = new Date().toISOString();
  const id = createId('incident');
  const missingCriticalData = buildChecklistMissingCriticalData(input);
  const checklistStatus = deriveChecklistStatus(input);
  const severity = raiseSeverityForSafetyChecklist('unknown', input);
  const timelineEvent = buildSafetyChecklistTimelineEvent(id, input, now, checklistStatus === 'complete');
  return {
    id,
    expeditionId: input.expeditionId,
    routeId: input.routeId ?? input.contextSnapshot?.route?.routeId ?? null,
    dispatchEventId: null,
    type: 'other',
    severity,
    status: checklistStatus === 'complete' ? 'active' : 'stabilizing',
    title: 'Safety Check',
    summary: cleanText(input.notes) ?? 'Safety checklist started from Incident & Recovery.',
    location: input.location ?? null,
    locationLabel: input.location ? `${input.location.latitude.toFixed(5)}, ${input.location.longitude.toFixed(5)}` : undefined,
    routeLabel: input.routeLabel ?? input.contextSnapshot?.route?.routeLabel ?? undefined,
    reportedAt: now,
    updatedAt: now,
    reportedBy: input.reportedBy ?? null,
    injuryStatus: input.items.injuriesAssessed === 'checked' ? 'none_reported' : 'unknown',
    communicationStatus: input.items.communicationsChecked === 'checked' ? 'available' : 'unknown',
    missingCriticalData,
    evidence: [],
    stabilizationChecklist: {
      id: `${id}-stabilization`,
      incidentId: id,
      status: checklistStatus,
      items: buildSafetyChecklistItems(input, id, now),
      missingCriticalData,
      updatedAt: now,
    },
    recoveryAssessment: {
      id: `${id}-assessment`,
      incidentId: id,
      severity,
      injuryStatus: input.items.injuriesAssessed === 'checked' ? 'none_reported' : 'unknown',
      communicationStatus: input.items.communicationsChecked === 'checked' ? 'available' : 'unknown',
      vehicleMobile: input.items.vehicleStabilityAssessed === 'checked' ? true : null,
      routePassable: null,
      immediateHazards: input.items.activeHazardsIdentified === 'checked' ? [] : ['Hazard status needs confirmation'],
      missingCriticalData,
      recommendedAction: 'Run ECS assessment',
      assessedAt: now,
      confidence: 'unknown',
      notes: cleanText(input.notes) ?? null,
    },
    timeline: [timelineEvent],
    metadata: {
      source: 'expedition_safety_checklist',
      safetyChecklistStartedWithoutIncident: true,
      routeSegmentLabel: input.routeSegmentLabel ?? input.contextSnapshot?.route?.routeSegmentLabel ?? null,
      incidentRecoveryContext: input.contextSnapshot ?? null,
    },
  };
}

function updateIncidentWithSafetyChecklist(
  incident: IncidentContext,
  input: SafetyChecklistInput,
): IncidentContext {
  const now = new Date().toISOString();
  const checklistStatus = deriveChecklistStatus(input);
  const checklistMissingData = buildChecklistMissingCriticalData(input);
  const missingCriticalData = uniqueCriticalData([
    ...(incident.missingCriticalData ?? []).filter((key) => ![
      'location',
      'communication',
      'hazard',
      'injury_status',
      'party_status',
      'vehicle_status',
      'route_status',
    ].includes(key)),
    ...checklistMissingData,
  ]);
  const severity = raiseSeverityForSafetyChecklist(incident.severity, input);
  const timelineEvent = buildSafetyChecklistTimelineEvent(
    incident.id,
    input,
    now,
    checklistStatus === 'complete',
  );
  const recommendedAction = 'Run ECS assessment';
  return {
    ...incident,
    severity,
    status: checklistStatus === 'complete'
      ? (incident.status === 'stabilizing' ? 'active' : incident.status)
      : 'stabilizing',
    location: incident.location ?? input.location ?? null,
    locationLabel: incident.locationLabel ?? (input.location ? `${input.location.latitude.toFixed(5)}, ${input.location.longitude.toFixed(5)}` : undefined),
    routeLabel: incident.routeLabel ?? input.routeLabel,
    updatedAt: now,
    injuryStatus: input.items.injuriesAssessed === 'checked' ? incident.injuryStatus ?? 'none_reported' : 'unknown',
    communicationStatus: input.items.communicationsChecked === 'checked' ? incident.communicationStatus ?? 'available' : 'unknown',
    missingCriticalData,
    stabilizationChecklist: {
      id: incident.stabilizationChecklist?.id ?? `${incident.id}-stabilization`,
      incidentId: incident.id,
      status: checklistStatus,
      items: buildSafetyChecklistItems(input, incident.id, now),
      missingCriticalData,
      updatedAt: now,
    },
    recoveryAssessment: {
      ...(incident.recoveryAssessment ?? {
        id: `${incident.id}-assessment`,
        incidentId: incident.id,
        assessedAt: now,
        confidence: 'unknown' as const,
      }),
      severity,
      injuryStatus: input.items.injuriesAssessed === 'checked' ? incident.injuryStatus ?? 'none_reported' : 'unknown',
      communicationStatus: input.items.communicationsChecked === 'checked' ? incident.communicationStatus ?? 'available' : 'unknown',
      vehicleMobile: input.items.vehicleStabilityAssessed === 'checked' ? incident.recoveryAssessment?.vehicleMobile ?? true : null,
      immediateHazards: input.items.activeHazardsIdentified === 'checked'
        ? incident.recoveryAssessment?.immediateHazards ?? []
        : ['Hazard status needs confirmation'],
      missingCriticalData,
      recommendedAction,
      assessedAt: now,
      notes: cleanText(input.notes) ?? incident.recoveryAssessment?.notes ?? null,
    },
    timeline: [...(incident.timeline ?? []), timelineEvent],
    metadata: {
      ...(incident.metadata ?? {}),
      lastSafetyChecklist: {
        items: input.items,
        notes: cleanText(input.notes) ?? null,
        updatedAt: now,
      },
      incidentRecoveryContext: input.contextSnapshot ?? incident.metadata?.incidentRecoveryContext ?? null,
    },
  };
}

function buildIncidentContext(input: ReportIncidentInput): IncidentContext {
  const now = new Date().toISOString();
  const id = createId('incident');
  const missingCriticalData = buildMissingCriticalData(input);
  const status = deriveIncidentStatus(input);
  const locationLabel = buildLocationLabel(input);
  return {
    id,
    expeditionId: input.expeditionId,
    routeId: input.routeId ?? input.contextSnapshot?.route?.routeId ?? null,
    dispatchEventId: null,
    type: input.type,
    severity: 'unknown',
    status,
    title: incidentTypeLabel(input.type),
    summary: cleanText(input.notes) ?? incidentTypeLabel(input.type),
    location: input.location ?? null,
    locationLabel,
    routeLabel: input.routeLabel ?? input.contextSnapshot?.route?.routeLabel ?? undefined,
    reportedAt: now,
    updatedAt: now,
    reportedBy: input.reportedBy ?? null,
    injuryStatus: input.safety.anyoneInjured === true ? 'possible' : input.safety.anyoneInjured === false ? 'none_reported' : 'unknown',
    communicationStatus: input.communicationStatus,
    missingCriticalData,
    evidence: [],
    stabilizationChecklist: {
      id: `${id}-stabilization`,
      incidentId: id,
      status: 'in_progress',
      items: [],
      missingCriticalData,
      updatedAt: now,
    },
    recoveryAssessment: {
      id: `${id}-assessment`,
      incidentId: id,
      severity: 'unknown',
      injuryStatus: input.safety.anyoneInjured === true ? 'possible' : input.safety.anyoneInjured === false ? 'none_reported' : 'unknown',
      communicationStatus: input.communicationStatus,
      vehicleMobile: input.resources.vehicleDisabled == null ? null : !input.resources.vehicleDisabled,
      routePassable: input.type === 'route_blocked' ? false : null,
      immediateHazards: input.safety.activeHazard ? ['Active hazard reported'] : [],
      missingCriticalData,
      recommendedAction: 'Complete safety checklist',
      assessedAt: now,
      confidence: 'unknown',
      notes: cleanText(input.notes) ?? null,
    },
    timeline: [buildTimelineEvent(id, input, now)],
    metadata: {
      source: 'expedition_incident_container',
      safety: input.safety,
      resources: input.resources,
      routeSegmentLabel: input.routeSegmentLabel ?? input.contextSnapshot?.route?.routeSegmentLabel ?? null,
      incidentRecoveryContext: input.contextSnapshot ?? null,
      manualLocationDescription: cleanText(input.manualLocationDescription) ?? null,
      assessmentEscalation: input.assessmentEscalation ?? null,
    },
  };
}

function cloneIncident(incident: IncidentContext): IncidentContext {
  return {
    ...incident,
    location: incident.location ? { ...incident.location } : incident.location,
    missingCriticalData: [...(incident.missingCriticalData ?? [])],
    evidence: incident.evidence ? incident.evidence.map((entry) => ({ ...entry })) : incident.evidence,
    timeline: incident.timeline ? incident.timeline.map((entry) => ({ ...entry })) : incident.timeline,
    stabilizationChecklist: incident.stabilizationChecklist
      ? {
          ...incident.stabilizationChecklist,
          items: incident.stabilizationChecklist.items.map((item) => ({ ...item })),
          missingCriticalData: [...(incident.stabilizationChecklist.missingCriticalData ?? [])],
        }
      : incident.stabilizationChecklist,
    recoveryAssessment: incident.recoveryAssessment
      ? {
          ...incident.recoveryAssessment,
          immediateHazards: [...(incident.recoveryAssessment.immediateHazards ?? [])],
          missingCriticalData: [...(incident.recoveryAssessment.missingCriticalData ?? [])],
          recommendations: [...(incident.recoveryAssessment.recommendations ?? [])],
          risks: [...(incident.recoveryAssessment.risks ?? [])],
          assumptions: [...(incident.recoveryAssessment.assumptions ?? [])],
          evidence: [...(incident.recoveryAssessment.evidence ?? [])],
          nextActions: [...(incident.recoveryAssessment.nextActions ?? [])],
          doNotDo: [...(incident.recoveryAssessment.doNotDo ?? [])],
          verificationSteps: [...(incident.recoveryAssessment.verificationSteps ?? [])],
          debriefHooks: [...(incident.recoveryAssessment.debriefHooks ?? [])],
          structuredOutput: incident.recoveryAssessment.structuredOutput
            ? {
                ...incident.recoveryAssessment.structuredOutput,
                recommendations: [...incident.recoveryAssessment.structuredOutput.recommendations],
                risks: [...incident.recoveryAssessment.structuredOutput.risks],
                missingData: [...incident.recoveryAssessment.structuredOutput.missingData],
                assumptions: [...incident.recoveryAssessment.structuredOutput.assumptions],
                evidence: [...incident.recoveryAssessment.structuredOutput.evidence],
                nextActions: [...incident.recoveryAssessment.structuredOutput.nextActions],
                stabilizationChecklist: [...incident.recoveryAssessment.structuredOutput.stabilizationChecklist],
                escalationTriggers: [...incident.recoveryAssessment.structuredOutput.escalationTriggers],
                doNotDo: [...incident.recoveryAssessment.structuredOutput.doNotDo],
                verificationSteps: [...incident.recoveryAssessment.structuredOutput.verificationSteps],
                debriefHooks: [...incident.recoveryAssessment.structuredOutput.debriefHooks],
                communicationPacket: incident.recoveryAssessment.structuredOutput.communicationPacket
                  ? {
                      ...incident.recoveryAssessment.structuredOutput.communicationPacket,
                      recipients: [...incident.recoveryAssessment.structuredOutput.communicationPacket.recipients],
                      channels: [...incident.recoveryAssessment.structuredOutput.communicationPacket.channels],
                      missingData: [...incident.recoveryAssessment.structuredOutput.communicationPacket.missingData],
                    }
                  : undefined,
              }
            : undefined,
        }
      : incident.recoveryAssessment,
    communicationPacket: incident.communicationPacket
      ? {
          ...incident.communicationPacket,
          recipients: [...(incident.communicationPacket.recipients ?? [])],
          channels: [...(incident.communicationPacket.channels ?? [])],
          missingCriticalData: [...(incident.communicationPacket.missingCriticalData ?? [])],
          audiencePackets: incident.communicationPacket.audiencePackets
            ? incident.communicationPacket.audiencePackets.map((packet) => ({ ...packet }))
            : incident.communicationPacket.audiencePackets,
        }
      : incident.communicationPacket,
    debrief: incident.debrief
      ? {
          ...incident.debrief,
          equipmentUsed: [...(incident.debrief.equipmentUsed ?? [])],
          lessonsLearned: [...(incident.debrief.lessonsLearned ?? [])],
          followUpActions: incident.debrief.followUpActions
            ? incident.debrief.followUpActions.map((step) => ({ ...step }))
            : incident.debrief.followUpActions,
          includedEvidenceIds: [...(incident.debrief.includedEvidenceIds ?? [])],
          intelligenceHandoff: incident.debrief.intelligenceHandoff
            ? {
                ...incident.debrief.intelligenceHandoff,
                equipmentUsed: [...(incident.debrief.intelligenceHandoff.equipmentUsed ?? [])],
              }
            : incident.debrief.intelligenceHandoff,
        }
      : incident.debrief,
    metadata: incident.metadata ? { ...incident.metadata } : incident.metadata,
  };
}

function getIncidentSnapshot(): IncidentContext[] {
  if (cachedSnapshotSource !== incidents) {
    cachedSnapshotSource = incidents;
    cachedSnapshot = incidents.map(cloneIncident);
  }

  return cachedSnapshot;
}

function isTerminalIncident(incident: IncidentContext): boolean {
  return incident.status === 'resolved' || incident.status === 'closed' || incident.status === 'cancelled';
}

function findSafetyChecklistTarget(input: SafetyChecklistInput): IncidentContext | null {
  if (input.incidentId) {
    return incidents.find((incident) => incident.id === input.incidentId) ?? null;
  }
  return incidents.find((incident) => {
    if (isTerminalIncident(incident)) return false;
    if (!input.expeditionId) return true;
    return !incident.expeditionId || incident.expeditionId === input.expeditionId;
  }) ?? null;
}

function findAssessmentTarget(input: ECSAssessmentInput): IncidentContext | null {
  if (input.incidentId) {
    return incidents.find((incident) => incident.id === input.incidentId) ?? null;
  }
  return incidents.find((incident) => {
    if (isTerminalIncident(incident)) return false;
    if (!input.expeditionId) return true;
    return !incident.expeditionId || incident.expeditionId === input.expeditionId;
  }) ?? null;
}

function findCommunicationTarget(input: CommunicationPacketInput): IncidentContext | null {
  if (input.incidentId) {
    return incidents.find((incident) => incident.id === input.incidentId) ?? null;
  }
  return incidents.find((incident) => {
    if (isTerminalIncident(incident)) return false;
    if (!input.expeditionId) return true;
    return !incident.expeditionId || incident.expeditionId === input.expeditionId;
  }) ?? null;
}

function findTimelineTarget(input: { incidentId?: string | null; expeditionId?: string }): IncidentContext | null {
  if (input.incidentId) {
    return incidents.find((incident) => incident.id === input.incidentId) ?? null;
  }
  return incidents.find((incident) => {
    if (isTerminalIncident(incident)) return false;
    if (!input.expeditionId) return true;
    return !incident.expeditionId || incident.expeditionId === input.expeditionId;
  }) ?? null;
}

function findResolveDebriefTarget(input: { incidentId?: string | null; expeditionId?: string }): IncidentContext | null {
  if (input.incidentId) {
    return incidents.find((incident) => incident.id === input.incidentId) ?? null;
  }
  return incidents.find((incident) => {
    if (!input.expeditionId) return true;
    return !incident.expeditionId || incident.expeditionId === input.expeditionId;
  }) ?? null;
}

function severityRank(severity: IncidentSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'moderate':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function maxSeverity(left: IncidentSeverity, right: IncidentSeverity): IncidentSeverity {
  return severityRank(right) > severityRank(left) ? right : left;
}

const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  active: ['stabilizing', 'cancelled'],
  stabilizing: ['awaiting_assistance', 'self_recovery_in_progress', 'evacuating', 'cancelled'],
  awaiting_assistance: ['resolved', 'cancelled'],
  self_recovery_in_progress: ['resolved', 'cancelled'],
  evacuating: ['resolved'],
  resolved: ['closed'],
  closed: [],
  cancelled: [],
};

function canTransitionIncidentStatus(from: IncidentStatus, to: IncidentStatus): boolean {
  if (from === to) return true;
  return INCIDENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function getRecommendedActionForStatus(
  status: IncidentStatus,
  missingCriticalData: IncidentCriticalDataKey[],
): string {
  switch (status) {
    case 'active':
      return 'Complete safety checklist';
    case 'stabilizing':
      if (missingCriticalData.length > 0) return 'Resolve missing critical data';
      return 'Complete safety checklist';
    case 'awaiting_assistance':
      return 'Prepare Communication Packet and keep Timeline current';
    case 'self_recovery_in_progress':
      return 'Log conservative status updates only';
    case 'evacuating':
      return 'Confirm location, communication, and Timeline';
    case 'resolved':
      return 'Complete debrief';
    case 'closed':
      return 'Incident closed';
    case 'cancelled':
      return 'Incident cancelled';
    default:
      return 'Review incident status';
  }
}

function buildStatusChangedTimelineEvent(
  incident: IncidentContext,
  input: IncidentStatusTransitionInput,
  now: string,
): IncidentTimelineEvent {
  const summary = cleanText(input.reason) ?? `Incident status changed from ${incident.status} to ${input.status}.`;
  return {
    id: `${incident.id}-status-${input.status}-${Date.now().toString(36)}`,
    incidentId: incident.id,
    type: 'status_changed',
    title: 'status changed',
    detail: summary,
    timestamp: now,
    actor: input.actor ?? 'operator',
    summary,
    status: input.status,
    severity: incident.severity,
    occurredAt: now,
    actorId: input.actor ?? null,
    source: 'operator',
    data: {
      fromStatus: incident.status,
      toStatus: input.status,
      reason: cleanText(input.reason) ?? null,
    },
  };
}

function buildAssessmentTimelineEvent(
  incidentId: string,
  input: ECSAssessmentInput,
  severity: IncidentSeverity,
): IncidentTimelineEvent {
  const now = new Date().toISOString();
  return {
    id: `${incidentId}-ecs-assessment-${Date.now().toString(36)}`,
    incidentId,
    type: 'assessment_updated',
    title: 'ECS assessment generated',
    detail: 'Recovery & Incident Agent generated a structured stabilization assessment.',
    timestamp: now,
    actor: input.reportedBy ?? 'ecs',
    summary: 'Recovery & Incident Agent generated a structured stabilization assessment.',
    status: 'stabilizing',
    severity,
    occurredAt: now,
    actorId: input.reportedBy ?? null,
    source: 'ecs',
  };
}

function buildCommunicationPacketTimelineEvent(
  incidentId: string,
  input: CommunicationPacketInput,
  title: 'communication packet generated' | 'communication packet copied',
  detail: string,
): IncidentTimelineEvent {
  const now = new Date().toISOString();
  return {
    id: `${incidentId}-${title.replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
    incidentId,
    type: title === 'communication packet generated'
      ? 'communication_packet_generated'
      : 'communication_packet_copied',
    title,
    detail,
    timestamp: now,
    actor: input.reportedBy ?? 'operator',
    summary: detail,
    status: 'active',
    occurredAt: now,
    actorId: input.reportedBy ?? null,
    source: 'operator',
  };
}

function buildGenericTimelineEvent(
  incidentId: string,
  input: IncidentTimelineLogInput,
): IncidentTimelineEvent {
  const now = new Date().toISOString();
  return {
    id: `${incidentId}-${input.type}-${Date.now().toString(36)}`,
    incidentId,
    type: input.type,
    title: input.title,
    detail: input.summary ?? null,
    timestamp: now,
    actor: input.actor ?? 'operator',
    summary: input.summary ?? input.title,
    data: input.data,
    occurredAt: now,
    actorId: input.actor ?? null,
    source: 'operator',
    metadata: input.data,
  };
}

function buildIncidentResolvedTimelineEvent(
  incidentId: string,
  input: ResolveIncidentInput,
  now: string,
): IncidentTimelineEvent {
  const summary = cleanText(input.resolvedHow) ?? cleanText(input.finalNotes) ?? 'Incident marked resolved.';
  return {
    id: `${incidentId}-resolved-${Date.now().toString(36)}`,
    incidentId,
    type: 'resolved',
    title: 'incident resolved',
    detail: summary,
    timestamp: now,
    actor: input.actor ?? 'operator',
    summary,
    status: 'resolved',
    occurredAt: now,
    actorId: input.actor ?? null,
    source: 'operator',
    data: {
      anyoneInjured: input.anyoneInjured ?? null,
      vehicleDamaged: input.vehicleDamaged ?? null,
      outsideAssistanceUsed: input.outsideAssistanceUsed ?? null,
      emergencyServicesContacted: input.emergencyServicesContacted ?? null,
      finalNotes: cleanText(input.finalNotes) ?? null,
    },
  };
}

function buildDebriefCreatedTimelineEvent(
  incidentId: string,
  input: IncidentDebriefInput,
  now: string,
): IncidentTimelineEvent {
  const summary = cleanText(input.outcome) ?? 'Incident debrief saved.';
  const communityHazardRequested = input.communityHazardReportRequested === true;
  const routeConfidenceRequested = input.routeConfidenceAdjustmentRequested === true;

  return {
    id: `${incidentId}-debrief-${Date.now().toString(36)}`,
    incidentId,
    type: 'debrief_added',
    title: 'debrief created',
    detail: summary,
    timestamp: now,
    actor: input.actor ?? 'operator',
    summary,
    status: 'resolved',
    occurredAt: now,
    actorId: input.actor ?? null,
    source: 'operator',
    data: {
      communityHazardReportRequested: communityHazardRequested,
      communityHazardPublicationStatus: communityHazardRequested ? 'requested_review' : 'not_requested',
      communityHazardRequiresManualReview: communityHazardRequested,
      communityHazardPublished: false,
      routeConfidenceAdjustmentRequested: routeConfidenceRequested,
      routeConfidenceReviewStatus: routeConfidenceRequested ? 'requested_review' : 'not_requested',
      routeConfidenceChanged: false,
    },
  };
}

function buildDebriefIntelligenceHandoff(
  incident: IncidentContext,
  debriefId: string,
  input: IncidentDebriefInput,
  now: string,
): NonNullable<IncidentDebrief['intelligenceHandoff']> {
  const communityHazardRequested = input.communityHazardReportRequested === true;
  const routeConfidenceRequested = input.routeConfidenceAdjustmentRequested === true;

  return {
    id: `${debriefId}-intelligence-handoff`,
    incidentId: incident.id,
    expeditionId: input.expeditionId ?? incident.expeditionId,
    debriefId,
    incidentType: incident.type,
    severity: incident.severity,
    status: incident.status,
    routeLabel: incident.routeLabel,
    locationLabel: incident.locationLabel,
    outcome: cleanText(input.outcome) ?? null,
    injuries: cleanText(input.injuries) ?? null,
    vehicleDamage: cleanText(input.vehicleDamage) ?? null,
    equipmentUsed: input.equipmentUsed ?? [],
    routeHazards: cleanText(input.routeHazards) ?? null,
    communicationIssues: cleanText(input.communicationIssues) ?? null,
    weatherTerrainMismatch: cleanText(input.weatherTerrainMismatch) ?? null,
    planningGaps: cleanText(input.planningGaps) ?? null,
    futureRecommendations: cleanText(input.futureRecommendations) ?? null,
    communityHazardReportRequested: communityHazardRequested,
    communityHazardPublicationStatus: communityHazardRequested ? 'requested_review' : 'not_requested',
    communityHazardRequiresManualReview: communityHazardRequested,
    communityHazardPublished: false,
    routeConfidenceAdjustmentRequested: routeConfidenceRequested,
    routeConfidenceReviewStatus: routeConfidenceRequested ? 'requested_review' : 'not_requested',
    routeConfidenceChanged: false,
    createdAt: now,
  };
}

function updateIncidentAsResolved(
  incident: IncidentContext,
  input: ResolveIncidentInput,
): IncidentContext {
  if (!canTransitionIncidentStatus(incident.status, 'resolved')) {
    throw new Error(`Invalid incident status transition: ${incident.status} -> resolved`);
  }

  const now = new Date().toISOString();
  const event = buildIncidentResolvedTimelineEvent(incident.id, input, now);
  const existingDebrief = incident.debrief;
  const debrief: IncidentDebrief = {
    ...(existingDebrief ?? {
      id: `${incident.id}-debrief`,
      incidentId: incident.id,
      createdAt: now,
    }),
    status: existingDebrief?.status === 'complete' ? 'complete' : 'in_progress',
    incidentId: incident.id,
    resolvedAt: now,
    resolvedBy: input.actor ?? existingDebrief?.resolvedBy ?? null,
    resolutionStatus: 'resolved',
    resolutionSummary: cleanText(input.resolvedHow) ?? existingDebrief?.resolutionSummary ?? null,
    anyoneInjured: input.anyoneInjured ?? existingDebrief?.anyoneInjured ?? null,
    vehicleDamaged: input.vehicleDamaged ?? existingDebrief?.vehicleDamaged ?? null,
    outsideAssistanceUsed: input.outsideAssistanceUsed ?? existingDebrief?.outsideAssistanceUsed ?? null,
    emergencyServicesContacted: input.emergencyServicesContacted ?? existingDebrief?.emergencyServicesContacted ?? null,
    finalNotes: cleanText(input.finalNotes) ?? existingDebrief?.finalNotes ?? null,
    updatedAt: now,
  };

  return {
    ...incident,
    status: 'resolved',
    updatedAt: now,
    debrief,
    recoveryAssessment: incident.recoveryAssessment
      ? {
          ...incident.recoveryAssessment,
          recommendedAction: 'Complete debrief',
        }
      : incident.recoveryAssessment,
    timeline: [...(incident.timeline ?? []), event],
    metadata: {
      ...(incident.metadata ?? {}),
      resolvedAt: now,
      resolveIncident: {
        resolvedHow: cleanText(input.resolvedHow) ?? null,
        anyoneInjured: input.anyoneInjured ?? null,
        vehicleDamaged: input.vehicleDamaged ?? null,
        outsideAssistanceUsed: input.outsideAssistanceUsed ?? null,
        emergencyServicesContacted: input.emergencyServicesContacted ?? null,
      },
    },
  };
}

function updateIncidentWithDebrief(
  incident: IncidentContext,
  input: IncidentDebriefInput,
): IncidentContext {
  const now = new Date().toISOString();
  const debriefId = incident.debrief?.id ?? `${incident.id}-debrief`;
  const communityHazardRequested = input.communityHazardReportRequested === true;
  const routeConfidenceRequested = input.routeConfidenceAdjustmentRequested === true;
  const lessonsLearned = [
    cleanText(input.whatWorked),
    cleanText(input.whatFailed),
    cleanText(input.planningGaps),
    cleanText(input.futureRecommendations),
  ].filter((entry): entry is string => !!entry);
  const debrief: IncidentDebrief = {
    ...(incident.debrief ?? {
      id: debriefId,
      incidentId: incident.id,
      createdAt: now,
    }),
    id: debriefId,
    incidentId: incident.id,
    status: 'complete',
    outcome: cleanText(input.outcome) ?? null,
    injuries: cleanText(input.injuries) ?? null,
    vehicleDamage: cleanText(input.vehicleDamage) ?? null,
    equipmentUsed: input.equipmentUsed ?? [],
    whatWorked: cleanText(input.whatWorked) ?? null,
    whatFailed: cleanText(input.whatFailed) ?? null,
    planningGaps: cleanText(input.planningGaps) ?? null,
    routeHazards: cleanText(input.routeHazards) ?? null,
    communicationIssues: cleanText(input.communicationIssues) ?? null,
    weatherTerrainMismatch: cleanText(input.weatherTerrainMismatch) ?? null,
    futureRecommendations: cleanText(input.futureRecommendations) ?? null,
    communityHazardReportRequested: communityHazardRequested,
    communityHazardPublicationStatus: communityHazardRequested ? 'requested_review' : 'not_requested',
    communityHazardRequiresManualReview: communityHazardRequested,
    communityHazardPublished: false,
    routeConfidenceAdjustmentRequested: routeConfidenceRequested,
    routeConfidenceReviewStatus: routeConfidenceRequested ? 'requested_review' : 'not_requested',
    routeConfidenceChanged: false,
    rootCause: cleanText(input.planningGaps) ?? incident.debrief?.rootCause ?? null,
    lessonsLearned,
    intelligenceHandoff: buildDebriefIntelligenceHandoff(incident, debriefId, input, now),
    updatedAt: now,
    createdAt: incident.debrief?.createdAt ?? now,
  };
  const event = buildDebriefCreatedTimelineEvent(incident.id, input, now);

  return {
    ...incident,
    updatedAt: now,
    debrief,
    timeline: [...(incident.timeline ?? []), event],
    metadata: {
      ...(incident.metadata ?? {}),
      debriefIntelligenceHandoff: debrief.intelligenceHandoff,
      communityHazardPublishing: {
        status: debrief.communityHazardPublicationStatus,
        requiresManualReview: debrief.communityHazardRequiresManualReview,
        published: false,
      },
      routeConfidenceReview: {
        status: debrief.routeConfidenceReviewStatus,
        changed: false,
      },
    },
  };
}

function updateIncidentStatus(
  incident: IncidentContext,
  input: IncidentStatusTransitionInput,
): IncidentContext {
  if (!canTransitionIncidentStatus(incident.status, input.status)) {
    throw new Error(`Invalid incident status transition: ${incident.status} -> ${input.status}`);
  }

  if (incident.status === input.status) {
    return incident;
  }

  const now = new Date().toISOString();
  const missingCriticalData = incident.missingCriticalData ?? [];
  const event = buildStatusChangedTimelineEvent(incident, input, now);
  const recommendedAction = getRecommendedActionForStatus(input.status, missingCriticalData);
  return {
    ...incident,
    status: input.status,
    updatedAt: now,
    recoveryAssessment: incident.recoveryAssessment
      ? {
          ...incident.recoveryAssessment,
          recommendedAction,
        }
      : incident.recoveryAssessment,
    timeline: [...(incident.timeline ?? []), event],
    metadata: {
      ...(incident.metadata ?? {}),
      lastStatusTransition: {
        fromStatus: incident.status,
        toStatus: input.status,
        reason: cleanText(input.reason) ?? null,
        transitionedAt: now,
      },
    },
  };
}

function updateIncidentWithECSAssessment(
  incident: IncidentContext,
  input: ECSAssessmentInput,
): IncidentContext {
  const now = new Date().toISOString();
  const output = runRecoveryIncidentAgent({
    ...input,
    incident,
    expeditionId: input.expeditionId ?? incident.expeditionId,
    routeLabel: input.routeLabel ?? incident.routeLabel,
    currentLocationLabel: input.currentLocationLabel ?? incident.locationLabel,
    now,
  });
  const severity = maxSeverity(incident.severity, output.riskLevel);
  const missingCriticalData = uniqueCriticalData(output.missingData);
  return {
    ...incident,
    severity,
    updatedAt: now,
    missingCriticalData,
    recoveryAssessment: {
      ...(incident.recoveryAssessment ?? {
        id: `${incident.id}-assessment`,
        incidentId: incident.id,
      }),
      severity,
      riskLevel: output.riskLevel,
      injuryStatus: incident.injuryStatus ?? 'unknown',
      communicationStatus: incident.communicationStatus ?? 'unknown',
      vehicleMobile: incident.recoveryAssessment?.vehicleMobile ?? null,
      routePassable: incident.recoveryAssessment?.routePassable ?? null,
      immediateHazards: output.escalationTriggers,
      missingCriticalData,
      recommendations: output.recommendations,
      risks: output.risks,
      assumptions: output.assumptions,
      evidence: output.evidence,
      nextActions: output.nextActions,
      doNotDo: output.doNotDo,
      verificationSteps: output.verificationSteps,
      debriefHooks: output.debriefHooks,
      userFacingExplanation: output.userFacingExplanation,
      structuredOutput: output,
      recommendedAction: 'Prepare Communication Packet',
      assessedAt: now,
      assessedBy: input.reportedBy ?? 'ecs',
      confidence: output.confidence,
      notes: output.summary,
    },
    timeline: [...(incident.timeline ?? []), buildAssessmentTimelineEvent(incident.id, input, severity)],
    metadata: {
      ...(incident.metadata ?? {}),
      lastEcsAssessmentAt: now,
    },
  };
}

export const incidentRecoveryWorkflowStore = {
  getSnapshot(): IncidentContext[] {
    return getIncidentSnapshot();
  },

  subscribe(listener: IncidentWorkflowListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  reportIncident(input: ReportIncidentInput): IncidentContext {
    const incident = buildIncidentContext(input);
    incidents = [incident, ...incidents];
    emit();
    return cloneIncident(incident);
  },

  saveSafetyChecklist(input: SafetyChecklistInput): IncidentContext | null {
    const target = findSafetyChecklistTarget(input);
    if (target) {
      const updatedIncident = updateIncidentWithSafetyChecklist(target, input);
      incidents = incidents.map((incident) => (
        incident.id === target.id ? updatedIncident : incident
      ));
      emit();
      return cloneIncident(updatedIncident);
    }

    if (!hasSafetyChecklistRisk(input) || input.createIncidentIfRiskFound !== true) {
      return null;
    }

    const createdIncident = createIncidentFromSafetyChecklist(input);
    incidents = [createdIncident, ...incidents];
    emit();
    return cloneIncident(createdIncident);
  },

  generateECSAssessment(input: ECSAssessmentInput): IncidentContext | null {
    const target = findAssessmentTarget(input);
    if (!target) return null;
    const updatedIncident = updateIncidentWithECSAssessment(target, input);
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  generateCommunicationPacket(input: CommunicationPacketInput): IncidentContext | null {
    const target = findCommunicationTarget(input);
    if (!target) return null;
    const now = new Date().toISOString();
    const communicationPacket = buildIncidentCommunicationPacket(target, now);
    const updatedIncident: IncidentContext = {
      ...target,
      updatedAt: now,
      communicationPacket,
      recoveryAssessment: target.recoveryAssessment
        ? {
            ...target.recoveryAssessment,
            recommendedAction: communicationPacket.recommendedAction ?? 'Copy or send Communication Packet',
          }
        : target.recoveryAssessment,
      timeline: [
        ...(target.timeline ?? []),
        buildCommunicationPacketTimelineEvent(
          target.id,
          input,
          'communication packet generated',
          'Communication packet generated for emergency services, recovery provider, convoy, and trusted contact.',
        ),
      ],
      metadata: {
        ...(target.metadata ?? {}),
        lastCommunicationPacketGeneratedAt: now,
      },
    };
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  logCommunicationPacketCopied(input: CommunicationPacketCopyInput): IncidentContext | null {
    const target = findCommunicationTarget(input);
    if (!target) return null;
    const now = new Date().toISOString();
    const packet = target.communicationPacket ?? buildIncidentCommunicationPacket(target, now);
    const updatedIncident: IncidentContext = {
      ...target,
      updatedAt: now,
      communicationPacket: {
        ...packet,
        lastSentAt: now,
        status: 'complete',
      },
      timeline: [
        ...(target.timeline ?? []),
        buildCommunicationPacketTimelineEvent(
          target.id,
          input,
          'communication packet copied',
          `Communication packet copied: ${input.audience ?? 'all'}.`,
        ),
      ],
      metadata: {
        ...(target.metadata ?? {}),
        lastCommunicationPacketCopiedAt: now,
      },
    };
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  addTimelineNote(input: IncidentTimelineNoteInput): IncidentContext | null {
    const target = findTimelineTarget(input);
    const note = cleanText(input.note);
    if (!target || !note) return null;
    const event = buildGenericTimelineEvent(target.id, {
      incidentId: target.id,
      type: 'note',
      title: 'user note added',
      summary: note,
      actor: input.actor ?? 'operator',
    });
    const updatedIncident: IncidentContext = {
      ...target,
      updatedAt: event.occurredAt,
      timeline: [...(target.timeline ?? []), event],
    };
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  addLocationUpdate(input: IncidentLocationUpdateInput): IncidentContext | null {
    const target = findTimelineTarget(input);
    if (!target) return null;
    const locationLabel = `${input.location.latitude.toFixed(5)}, ${input.location.longitude.toFixed(5)}`;
    const event = buildGenericTimelineEvent(target.id, {
      incidentId: target.id,
      type: 'location_updated',
      title: 'location updated',
      summary: `Location updated to ${locationLabel}.`,
      actor: input.actor ?? 'operator',
      data: { location: input.location },
    });
    const updatedIncident: IncidentContext = {
      ...target,
      location: input.location,
      locationLabel,
      updatedAt: event.occurredAt,
      missingCriticalData: (target.missingCriticalData ?? []).filter((key) => key !== 'location'),
      timeline: [...(target.timeline ?? []), event],
    };
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  logTimelineEvent(input: IncidentTimelineLogInput): IncidentContext | null {
    const target = findTimelineTarget(input);
    if (!target) return null;
    const event = buildGenericTimelineEvent(target.id, {
      ...input,
      incidentId: target.id,
    });
    const updatedIncident: IncidentContext = {
      ...target,
      updatedAt: event.occurredAt,
      timeline: [...(target.timeline ?? []), event],
    };
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  resolveIncident(input: ResolveIncidentInput): IncidentContext | null {
    const target = findResolveDebriefTarget(input);
    if (!target) return null;
    const updatedIncident = updateIncidentAsResolved(target, input);
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  saveIncidentDebrief(input: IncidentDebriefInput): IncidentContext | null {
    const target = findResolveDebriefTarget(input);
    if (!target) return null;
    const updatedIncident = updateIncidentWithDebrief(target, input);
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  transitionIncidentStatus(input: IncidentStatusTransitionInput): IncidentContext | null {
    const target = findResolveDebriefTarget(input);
    if (!target) return null;
    const updatedIncident = updateIncidentStatus(target, input);
    if (updatedIncident === target) return cloneIncident(target);
    incidents = incidents.map((incident) => (
      incident.id === target.id ? updatedIncident : incident
    ));
    emit();
    return cloneIncident(updatedIncident);
  },

  canTransitionIncidentStatus,

  clearIncident(input: ClearIncidentInput = {}): boolean {
    const beforeCount = incidents.length;
    if (input.incidentId) {
      incidents = incidents.filter((incident) => incident.id !== input.incidentId);
    } else if (input.expeditionId) {
      incidents = incidents.filter((incident) => incident.expeditionId && incident.expeditionId !== input.expeditionId);
    } else {
      incidents = [];
    }
    const changed = incidents.length !== beforeCount;
    if (changed) emit();
    return changed;
  },

  clear(): void {
    incidents = [];
    emit();
  },
};
